import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  buildAttack,
  buildCheck,
  computeSheet,
  FormulaError,
  keptD20,
  planRitual,
  type RitualForm,
  sanitizeValues,
  type SystemDefinition,
  type SystemValues,
  validateSystem,
} from '@rpg-ai/rules-engine';
import { and, asc, type Database, eq, isNull, schema, sql, type Tx, withUser } from '@rpg-ai/db';
import {
  type ActionResultDto,
  attackSchema,
  canManageCampaign,
  castSchema,
  characterCheckSchema,
  type CharacterDto,
  type CharacterSheet,
  characterSheetSchema,
  type CreateCharacterInput,
  createCharacterSchema,
  ERROR_CODES,
  type UpdateCharacterInput,
  updateCharacterSchema,
  WS_EVENTS,
} from '@rpg-ai/shared';
import type { z } from 'zod';
import { AppError, forbidden, notFound } from '../common/errors';
import { Ctx, CurrentUser, parse, type RequestCtx } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { requireMember, requirePlayer } from './access';
import { audit } from './audit';
import { anyId, campaignId } from './ids';
import { ChatService } from './chat';
import { SystemsService } from './documents/systems';
import { Realtime } from './realtime.gateway';

const ch = schema.characters;

@Injectable()
export class CharactersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rt: Realtime,
    private readonly systems: SystemsService,
    private readonly chat: ChatService,
  ) {}

  /** Valida a parte da ficha que pertence ao sistema da campanha (atributos, perícias, NEX…). */
  private async withSystem(
    tx: Tx,
    cid: string,
    sheet: CharacterSheet | undefined,
  ): Promise<CharacterSheet | undefined> {
    if (!sheet) return sheet;
    const sys = await this.systems.campaignSystemTx(tx, cid);
    if (!sys) {
      const { system: _drop, ...rest } = sheet;
      return rest;
    }
    if (!sheet.system) return sheet;
    try {
      const def = validateSystem(sys.definition);
      return { ...sheet, system: sanitizeValues(def, sheet.system) };
    } catch (e) {
      if (e instanceof FormulaError || (e as Error).name === 'ZodError')
        throw new AppError(
          ERROR_CODES.VALIDATION,
          e instanceof FormulaError ? e.message : 'Ficha inválida para o sistema',
          400,
        );
      throw e;
    }
  }

  /** Teste de perícia/atributo pela regra do sistema; o resultado vai para o chat. */
  async check(
    userId: string,
    cid: string,
    id: string,
    input: { skill?: string; attribute?: string; bonus: number; visibility: 'public' | 'gm' },
  ) {
    const { expression, label, notes } = await withUser(this.db, userId, async (tx) => {
      const [cur] = await this.fetch(tx, userId, cid, id);
      if (!cur) throw notFound('Personagem');
      if (!cur.canEdit) throw forbidden('Só o dono do personagem ou o mestre podem rolar por ele');
      const sys = await this.systems.campaignSystemTx(tx, cid);
      if (!sys)
        throw new AppError(ERROR_CODES.VALIDATION, 'A campanha ainda não tem um sistema de regras.', 400);
      const def = validateSystem(sys.definition);
      try {
        const values = sanitizeValues(def, cur.sheet.system);
        const r = buildCheck(def, values, input);
        return { ...r, label: `${cur.name}: ${r.label}` };
      } catch (e) {
        if (e instanceof FormulaError) throw new AppError(ERROR_CODES.VALIDATION, e.message, 400);
        throw e;
      }
    });
    const message = await this.chat.roll(userId, cid, {
      expression,
      label: label.slice(0, 80),
      visibility: input.visibility,
    });
    return { message, notes };
  }

  /** Carrega personagem + sistema já validados para uma ação (ataque, ritual). */
  private async actionContext(tx: Tx, userId: string, cid: string, id: string) {
    const [cur] = await this.fetch(tx, userId, cid, id);
    if (!cur) throw notFound('Personagem');
    if (!cur.canEdit) throw forbidden('Só o dono do personagem ou o mestre podem agir por ele');
    const sys = await this.systems.campaignSystemTx(tx, cid);
    if (!sys)
      throw new AppError(ERROR_CODES.VALIDATION, 'A campanha ainda não tem um sistema de regras.', 400);
    const def = validateSystem(sys.definition);
    return { cur, def, values: sanitizeValues(def, cur.sheet.system) };
  }

  private rules<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof FormulaError) throw new AppError(ERROR_CODES.VALIDATION, e.message, 400);
      throw e;
    }
  }

  /** Grava recursos atuais (PE, SAN…) sem mexer no resto da ficha. */
  private async setCurrent(
    tx: Tx,
    id: string,
    cur: CharacterDto,
    values: SystemValues,
    changes: Record<string, number>,
  ) {
    const system = { ...cur.sheet.system!, current: { ...values.current, ...changes } };
    await tx
      .update(ch)
      .set({ sheet: { ...cur.sheet, system }, version: sql`${ch.version} + 1` })
      .where(eq(ch.id, id));
  }

  /** Ataque com arma da ficha: teste pela perícia do sistema e dano (crítico multiplica os dados). */
  async attack(
    userId: string,
    cid: string,
    id: string,
    input: z.infer<typeof attackSchema>,
  ): Promise<ActionResultDto> {
    const { plan, name } = await withUser(this.db, userId, async (tx) => {
      const { cur, def, values } = await this.actionContext(tx, userId, cid, id);
      return {
        name: cur.name,
        plan: this.rules(() => buildAttack(def, values, input.weapon, input)),
      };
    });
    const atk = await this.chat.roll(userId, cid, {
      expression: plan.attack.expression,
      label: `${name}: ${plan.attack.label}`.slice(0, 80),
      visibility: input.visibility,
    });
    const natural = atk.roll
      ? keptD20({ expression: atk.roll.expression, total: atk.roll.total, parts: atk.roll.parts as never })
      : null;
    const critical = natural !== null && natural >= plan.critRange;
    const dmg = await this.chat.roll(userId, cid, {
      expression: critical ? plan.damage.critExpression : plan.damage.expression,
      label:
        `${name}: dano${critical ? ` CRÍTICO x${plan.critMult}` : ''}${plan.damage.type ? ` (${plan.damage.type})` : ''}`.slice(
          0,
          80,
        ),
      visibility: input.visibility,
    });
    return {
      messages: [atk, dmg],
      critical,
      notes: [...plan.notes, 'Acerta se o teste for maior ou igual à Defesa do alvo.'],
    };
  }

  /** Conjurar ritual: gasta PE, rola o custo paranormal (ou perde SAN no Medo) e o efeito básico. */
  async cast(
    userId: string,
    cid: string,
    id: string,
    input: z.infer<typeof castSchema>,
  ): Promise<ActionResultDto> {
    const prep = await withUser(this.db, userId, async (tx) => {
      const { cur, def, values } = await this.actionContext(tx, userId, cid, id);
      const plan = this.rules(() => planRitual(def, values, input.ritual, input.form as RitualForm));
      const changes: Record<string, number> = { [plan.spend.key]: plan.spend.after };
      const san = def.ritualRules?.sanity;
      if (plan.sanityLoss && san) changes[san] = this.resource(def, values, san) - plan.sanityLoss;
      await this.setCurrent(tx, id, cur, values, changes);
      return { plan, name: cur.name, san };
    });
    const { plan, name, san } = prep;
    const formName =
      input.form === 'basic' ? '' : ` (${input.form === 'discente' ? 'discente' : 'verdadeiro'})`;
    const messages = [
      await this.chat.post(userId, cid, {
        content: `✶ ${name} conjura ${plan.name}${formName}: −${plan.cost} PE · DT ${plan.dt}${plan.sanityLoss ? ` · −${plan.sanityLoss} SAN` : ''}`,
        visibility: input.visibility,
      }),
    ];
    const notes = [...plan.notes];
    if (plan.permanentNote) notes.push(plan.permanentNote);
    if (plan.sanityCheck) {
      const chk = await this.chat.roll(userId, cid, {
        expression: plan.sanityCheck.expression,
        label: `${name}: custo paranormal (DT ${plan.sanityCheck.dc})`.slice(0, 80),
        visibility: input.visibility,
      });
      messages.push(chk);
      const total = chk.roll?.total ?? 0;
      if (total < plan.sanityCheck.dc && san) {
        await withUser(this.db, userId, async (tx) => {
          const { cur, def, values } = await this.actionContext(tx, userId, cid, id);
          await this.setCurrent(tx, id, cur, values, {
            [san]: this.resource(def, values, san) - plan.sanityCheck!.loss,
          });
        });
        notes.push(`Falhou no custo paranormal: perdeu ${plan.sanityCheck.loss} de Sanidade.`);
        if (plan.sanityCheck.dc - total >= 5)
          notes.push('Falhou por 5 ou mais: perde também 1 de Sanidade permanentemente (p. 131).');
      }
    }
    if (plan.effect)
      messages.push(
        await this.chat.roll(userId, cid, {
          expression: plan.effect.expression,
          label: plan.effect.label.slice(0, 80),
          visibility: input.visibility,
        }),
      );
    this.rt.campaign(cid, WS_EVENTS.charactersChanged, { campaignId: cid });
    const character = await withUser(
      this.db,
      userId,
      async (tx) => (await this.fetch(tx, userId, cid, id))[0],
    );
    return { messages, notes, character };
  }

  private resource(def: SystemDefinition, values: SystemValues, key: string): number {
    const sheet = computeSheet(def, values);
    return sheet.resources.find((r) => r.key === key)?.current ?? 0;
  }

  private async fetch(tx: Tx, userId: string, cid: string, id?: string): Promise<CharacterDto[]> {
    const role = await requireMember(tx, cid);
    const rows = await tx
      .select({ c: ch, ownerName: schema.userProfiles.displayName })
      .from(ch)
      .innerJoin(schema.userProfiles, eq(schema.userProfiles.userId, ch.ownerId))
      .where(and(eq(ch.campaignId, cid), isNull(ch.deletedAt), id ? eq(ch.id, id) : undefined))
      .orderBy(asc(ch.createdAt));
    return rows.map(({ c, ownerName }) => ({
      id: c.id,
      campaignId: c.campaignId,
      ownerId: c.ownerId,
      ownerName,
      name: c.name,
      concept: c.concept,
      color: c.color,
      sheet: characterSheetSchema.parse(c.sheet),
      version: c.version,
      canEdit: c.ownerId === userId || canManageCampaign(role),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  list(userId: string, cid: string) {
    return withUser(this.db, userId, (tx) => this.fetch(tx, userId, cid));
  }

  async create(userId: string, cid: string, input: CreateCharacterInput, ctx: RequestCtx) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requirePlayer(tx, cid);
      const sheet = await this.withSystem(tx, cid, input.sheet);
      const [row] = await tx
        .insert(ch)
        .values({ campaignId: cid, ownerId: userId, ...input, sheet })
        .returning({ id: ch.id });
      await audit(tx, ctx, {
        action: 'character.created',
        entityType: 'character',
        entityId: row!.id,
        campaignId: cid,
        after: { name: input.name },
      });
      return (await this.fetch(tx, userId, cid, row!.id))[0]!;
    });
    this.rt.campaign(cid, WS_EVENTS.charactersChanged, { campaignId: cid });
    return dto;
  }

  async update(userId: string, cid: string, id: string, input: UpdateCharacterInput, ctx: RequestCtx) {
    const dto = await withUser(this.db, userId, async (tx) => {
      const [cur] = await this.fetch(tx, userId, cid, id);
      if (!cur) throw notFound('Personagem');
      if (!cur.canEdit) throw forbidden('Só o dono do personagem ou o mestre podem editar');
      const { version, ...changes } = input;
      if (changes.sheet) changes.sheet = await this.withSystem(tx, cid, changes.sheet);
      const r = await tx
        .update(ch)
        .set({ ...changes, version: sql`${ch.version} + 1` })
        .where(and(eq(ch.id, id), eq(ch.version, version)))
        .returning({ id: ch.id });
      if (!r.length)
        throw new AppError(
          ERROR_CODES.CONFLICT,
          'Outra pessoa alterou esta ficha. Recarregue para ver a versão atual.',
          409,
        );
      await audit(tx, ctx, {
        action: 'character.updated',
        entityType: 'character',
        entityId: id,
        campaignId: cid,
        before: { name: cur.name, sheet: cur.sheet },
        after: changes,
      });
      return (await this.fetch(tx, userId, cid, id))[0]!;
    });
    this.rt.campaign(cid, WS_EVENTS.charactersChanged, { campaignId: cid });
    return dto;
  }

  async remove(userId: string, cid: string, id: string, ctx: RequestCtx) {
    await withUser(this.db, userId, async (tx) => {
      const [cur] = await this.fetch(tx, userId, cid, id);
      if (!cur) throw notFound('Personagem');
      if (!cur.canEdit) throw forbidden();
      await tx.update(ch).set({ deletedAt: new Date() }).where(eq(ch.id, id));
      await audit(tx, ctx, {
        action: 'character.deleted',
        entityType: 'character',
        entityId: id,
        campaignId: cid,
      });
    });
    this.rt.campaign(cid, WS_EVENTS.charactersChanged, { campaignId: cid });
  }
}

@Controller('campaigns/:id/characters')
export class CharactersController {
  constructor(private readonly svc: CharactersService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.list(u.id, campaignId(id));
  }
  @Post()
  create(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown, @Ctx() ctx: RequestCtx) {
    return this.svc.create(u.id, campaignId(id), parse(createCharacterSchema, b), ctx);
  }
  @Patch(':cid')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('cid') c: string,
    @Body() b: unknown,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.update(u.id, campaignId(id), anyId(c), parse(updateCharacterSchema, b), ctx);
  }
  @Post(':cid/attack')
  attack(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('cid') c: string, @Body() b: unknown) {
    return this.svc.attack(u.id, campaignId(id), anyId(c), parse(attackSchema, b));
  }
  @Post(':cid/cast')
  cast(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('cid') c: string, @Body() b: unknown) {
    return this.svc.cast(u.id, campaignId(id), anyId(c), parse(castSchema, b));
  }
  @Post(':cid/check')
  check(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('cid') c: string, @Body() b: unknown) {
    return this.svc.check(u.id, campaignId(id), anyId(c), parse(characterCheckSchema, b));
  }
  @Delete(':cid')
  @HttpCode(204)
  remove(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('cid') c: string,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.remove(u.id, campaignId(id), anyId(c), ctx);
  }
}
