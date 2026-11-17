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
import { buildCheck, FormulaError, sanitizeValues, validateSystem } from '@rpg-ai/rules-engine';
import { and, asc, type Database, eq, isNull, schema, sql, type Tx, withUser } from '@rpg-ai/db';
import {
  canManageCampaign,
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
