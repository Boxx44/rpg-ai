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
  buildInitiative,
  computeSheet,
  FormulaError,
  sanitizeValues,
  type SystemDefinition,
  validateSystem,
} from '@rpg-ai/rules-engine';
import { and, asc, type Database, eq, inArray, isNull, schema, sql, type Tx, withUser } from '@rpg-ai/db';
import {
  type AddCombatantInput,
  addCombatantSchema,
  canManageCampaign,
  type CharacterSheet,
  characterSheetSchema,
  type CombatantDto,
  type CombatHealth,
  type EncounterDto,
  ERROR_CODES,
  hpChangeSchema,
  nextTurnSchema,
  rollInitiativeSchema,
  startCombatSchema,
  updateCombatantSchema,
  WS_EVENTS,
} from '@rpg-ai/shared';
import type { z } from 'zod';
import { AppError, forbidden, notFound } from '../common/errors';
import { Ctx, CurrentUser, parse, type RequestCtx } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { requireManager, requireMember } from './access';
import { audit } from './audit';
import { ChatService } from './chat';
import { SystemsService } from './documents/systems';
import { anyId, campaignId } from './ids';
import { Realtime } from './realtime.gateway';

const enc = schema.encounters;
const cb = schema.combatants;
const gm = schema.combatantGmDetails;
const ch = schema.characters;

function pgCode(e: unknown): string | undefined {
  return (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
}

export function healthOf(current: number, max: number): CombatHealth {
  if (current <= 0) return 'down';
  if (max > 0 && current * 2 <= max) return 'hurt';
  return 'ok';
}

/** Vida do personagem: 1º recurso do sistema (ex.: PV) ou 1º recurso da ficha livre. */
function characterHp(def: SystemDefinition | null, sheet: CharacterSheet) {
  if (def && def.resources.length && sheet.system) {
    const r = computeSheet(def, sanitizeValues(def, sheet.system)).resources[0]!;
    return { current: r.current, max: r.max, key: r.key };
  }
  const r = sheet.resources[0];
  return r ? { current: r.current, max: r.max, key: null } : null;
}

/**
 * Combate: iniciativa, rodadas, turnos, condições e pontos de vida.
 * Mudanças passam pela API; o evento `combat.changed` avisa a mesa, e cada um
 * busca de novo o combate já filtrado pelo que pode ver (ocultos e PV do mestre).
 */
@Injectable()
export class CombatService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rt: Realtime,
    private readonly systems: SystemsService,
    private readonly chat: ChatService,
  ) {}

  private async definition(tx: Tx, cid: string): Promise<SystemDefinition | null> {
    const sys = await this.systems.campaignSystemTx(tx, cid);
    return sys ? validateSystem(sys.definition) : null;
  }

  private async activeId(tx: Tx, cid: string): Promise<string | null> {
    const [row] = await tx
      .select({ id: enc.id })
      .from(enc)
      .where(and(eq(enc.campaignId, cid), eq(enc.status, 'active')));
    return row?.id ?? null;
  }

  private async requireActive(tx: Tx, cid: string): Promise<string> {
    const id = await this.activeId(tx, cid);
    if (!id) throw notFound('Combate ativo');
    return id;
  }

  /** Monta o combate visível para o usuário (o RLS já esconde os combatentes ocultos). */
  private async view(tx: Tx, userId: string, cid: string): Promise<EncounterDto | null> {
    const role = await requireMember(tx, cid);
    const manager = canManageCampaign(role);
    const [e] = await tx
      .select()
      .from(enc)
      .where(and(eq(enc.campaignId, cid), eq(enc.status, 'active')));
    if (!e) return null;
    const order = await tx.execute<{ id: string; pos: number }>(
      sql`select id, pos from app_private.combat_order(${e.id}::uuid)`,
    );
    const pos = new Map(order.map((o) => [o.id, Number(o.pos)]));
    const rows = (await tx.select({ c: cb }).from(cb).where(eq(cb.encounterId, e.id))).sort(
      (a, b) => (pos.get(a.c.id) ?? 0) - (pos.get(b.c.id) ?? 0),
    );
    const charIds = rows.map((r) => r.c.characterId).filter((x): x is string => !!x);
    const chars = charIds.length
      ? await tx
          .select({ id: ch.id, ownerId: ch.ownerId, sheet: ch.sheet })
          .from(ch)
          .where(and(inArray(ch.id, charIds), isNull(ch.deletedAt)))
      : [];
    const gmRows = manager
      ? await tx
          .select()
          .from(gm)
          .where(inArray(gm.combatantId, rows.length ? rows.map((r) => r.c.id) : [e.id]))
      : [];
    const def = await this.definition(tx, cid);
    const combatants: CombatantDto[] = rows.map(({ c }) => {
      const owner = chars.find((x) => x.id === c.characterId);
      let hp: CombatantDto['hp'] = null;
      let health = c.health;
      if (owner) {
        const h = characterHp(def, characterSheetSchema.parse(owner.sheet));
        if (h) {
          hp = { current: h.current, max: h.max };
          health = healthOf(h.current, h.max);
        }
      } else if (manager) {
        const g = gmRows.find((x) => x.combatantId === c.id);
        if (g && g.hpMax > 0) hp = { current: g.hpCurrent, max: g.hpMax };
      }
      return {
        id: c.id,
        kind: c.kind,
        name: c.name,
        color: c.color,
        characterId: c.characterId,
        npcId: c.npcId,
        initiative: c.initiative,
        conditions: c.conditions,
        health,
        hidden: c.hidden,
        defeated: c.defeated,
        hp,
        mine: manager || owner?.ownerId === userId,
      };
    });
    const visible = combatants.some((c) => c.id === e.currentCombatantId);
    return {
      id: e.id,
      round: e.round,
      currentId: visible ? e.currentCombatantId : null,
      hiddenTurn: !!e.currentCombatantId && !visible,
      combatants,
    };
  }

  private changed(cid: string) {
    this.rt.campaign(cid, WS_EVENTS.combatChanged, { campaignId: cid });
  }

  get(userId: string, cid: string) {
    return withUser(this.db, userId, (tx) => this.view(tx, userId, cid));
  }

  async start(userId: string, cid: string, input: z.infer<typeof startCombatSchema>, ctx: RequestCtx) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      if (await this.activeId(tx, cid))
        throw new AppError(ERROR_CODES.CONFLICT, 'Já há um combate em andamento.', 409);
      const [live] = await tx
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(and(eq(schema.sessions.campaignId, cid), eq(schema.sessions.status, 'live')));
      let id: string;
      try {
        const [row] = await tx
          .insert(enc)
          .values({ campaignId: cid, sessionId: live?.id ?? null, startedBy: userId })
          .returning({ id: enc.id });
        id = row!.id;
      } catch (e) {
        if (pgCode(e) === '23505')
          throw new AppError(ERROR_CODES.CONFLICT, 'Já há um combate em andamento.', 409);
        throw e;
      }
      if (input.includeCharacters) {
        const list = await tx
          .select({ id: ch.id, name: ch.name, color: ch.color })
          .from(ch)
          .where(and(eq(ch.campaignId, cid), isNull(ch.deletedAt)))
          .orderBy(asc(ch.createdAt));
        if (list.length)
          await tx
            .insert(cb)
            .values(
              list.map((c) => ({
                encounterId: id,
                campaignId: cid,
                kind: 'character' as const,
                characterId: c.id,
                name: c.name,
                color: c.color,
              })),
            );
      }
      await audit(tx, ctx, {
        action: 'combat.started',
        entityType: 'encounter',
        entityId: id,
        campaignId: cid,
      });
      return this.view(tx, userId, cid);
    });
    this.changed(cid);
    return dto;
  }

  async add(userId: string, cid: string, input: AddCombatantInput) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const eid = await this.requireActive(tx, cid);
      if (input.kind === 'character') {
        const [c] = await tx
          .select({ name: ch.name, color: ch.color })
          .from(ch)
          .where(and(eq(ch.id, input.characterId), eq(ch.campaignId, cid), isNull(ch.deletedAt)));
        if (!c) throw notFound('Personagem');
        try {
          await tx
            .insert(cb)
            .values({
              encounterId: eid,
              campaignId: cid,
              kind: 'character',
              characterId: input.characterId,
              name: c.name,
              color: c.color,
            });
        } catch (e) {
          if (pgCode(e) === '23505')
            throw new AppError(ERROR_CODES.CONFLICT, 'Este personagem já está no combate.', 409);
          throw e;
        }
      } else {
        let base = { name: '', color: '#b4232f', npcId: null as string | null };
        if (input.kind === 'npc') {
          const [n] = await tx
            .select({ name: schema.npcs.name, color: schema.npcs.color })
            .from(schema.npcs)
            .where(
              and(
                eq(schema.npcs.id, input.npcId),
                eq(schema.npcs.campaignId, cid),
                isNull(schema.npcs.deletedAt),
              ),
            );
          if (!n) throw notFound('NPC');
          base = { name: n.name, color: n.color, npcId: input.npcId };
        } else base = { name: input.name, color: input.color, npcId: null };
        const count = input.kind === 'enemy' ? input.count : 1;
        for (let i = 1; i <= count; i++) {
          const name = count > 1 ? `${base.name.slice(0, 76)} ${i}` : base.name;
          const [row] = await tx
            .insert(cb)
            .values({
              encounterId: eid,
              campaignId: cid,
              kind: input.kind,
              npcId: base.npcId,
              name,
              color: base.color,
              hidden: input.hidden,
            })
            .returning({ id: cb.id });
          await tx
            .insert(gm)
            .values({ combatantId: row!.id, campaignId: cid, hpCurrent: input.hp, hpMax: input.hp });
        }
      }
      return this.view(tx, userId, cid);
    });
    this.changed(cid);
    return dto;
  }

  async update(userId: string, cid: string, id: string, input: z.infer<typeof updateCombatantSchema>) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const eid = await this.requireActive(tx, cid);
      const def = await this.definition(tx, cid);
      const { hpMax, ...rest } = input;
      if (rest.conditions) {
        // Só condições do sistema da campanha (ou texto livre se o sistema não tiver lista).
        const known = def?.conditions.map((c) => c.key);
        if (known?.length) {
          const bad = rest.conditions.find((k) => !known.includes(k));
          if (bad) throw new AppError(ERROR_CODES.VALIDATION, `Condição desconhecida: ${bad}`, 400);
        }
        rest.conditions = [...new Set(rest.conditions)];
      }
      const r = Object.keys(rest).length
        ? await tx
            .update(cb)
            .set(rest)
            .where(and(eq(cb.id, id), eq(cb.encounterId, eid)))
            .returning({ id: cb.id })
        : await tx
            .select({ id: cb.id })
            .from(cb)
            .where(and(eq(cb.id, id), eq(cb.encounterId, eid)));
      if (!r.length) throw notFound('Combatente');
      if (hpMax !== undefined) {
        const [g] = await tx
          .update(gm)
          .set({ hpMax, hpCurrent: sql`least(${gm.hpCurrent}, ${hpMax})` })
          .where(eq(gm.combatantId, id))
          .returning();
        if (g)
          await tx
            .update(cb)
            .set({ health: healthOf(g.hpCurrent, g.hpMax) })
            .where(eq(cb.id, id));
      }
      return this.view(tx, userId, cid);
    });
    this.changed(cid);
    return dto;
  }

  async remove(userId: string, cid: string, id: string) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const eid = await this.requireActive(tx, cid);
      const [e] = await tx.select({ cur: enc.currentCombatantId }).from(enc).where(eq(enc.id, eid));
      // Removendo quem está na vez: passa o turno antes.
      if (e?.cur === id) await tx.execute(sql`select app_private.advance_turn(${eid}::uuid, ${id}::uuid)`);
      const r = await tx
        .delete(cb)
        .where(and(eq(cb.id, id), eq(cb.encounterId, eid)))
        .returning({ id: cb.id });
      if (!r.length) throw notFound('Combatente');
      return this.view(tx, userId, cid);
    });
    this.changed(cid);
    return dto;
  }

  /** Rola a Iniciativa no servidor (pela regra do sistema, quando é personagem) e registra na crônica. */
  async rollInitiative(userId: string, cid: string, id: string, bonus: number) {
    const plan = await withUser(this.db, userId, async (tx) => {
      const view = await this.view(tx, userId, cid);
      const c = view?.combatants.find((x) => x.id === id);
      if (!c) throw notFound('Combatente');
      if (!c.mine) throw forbidden('Só o dono do personagem ou o mestre podem rolar por ele');
      const def = await this.definition(tx, cid);
      let expression = `1d${def?.check.die ?? 20}`;
      if (c.characterId && def) {
        const [row] = await tx.select({ sheet: ch.sheet }).from(ch).where(eq(ch.id, c.characterId));
        const sheet = characterSheetSchema.parse(row?.sheet ?? {});
        try {
          expression = buildInitiative(def, sanitizeValues(def, sheet.system)).expression;
        } catch (e) {
          if (e instanceof FormulaError) throw new AppError(ERROR_CODES.VALIDATION, e.message, 400);
          throw e;
        }
      }
      if (bonus) expression = `${expression}${bonus > 0 ? '+' : ''}${bonus}`;
      return { expression, name: c.name, hidden: c.hidden || c.kind !== 'character' };
    });
    // Iniciativa de inimigos fica só para o mestre na crônica.
    const message = await this.chat.roll(userId, cid, {
      expression: plan.expression,
      label: `${plan.name}: Iniciativa`.slice(0, 80),
      visibility: plan.hidden ? 'gm' : 'public',
    });
    const dto = await withUser(this.db, userId, async (tx) => {
      await tx.execute(sql`select app_private.set_initiative(${id}::uuid, ${message.roll!.total})`);
      return this.view(tx, userId, cid);
    });
    this.changed(cid);
    return dto;
  }

  /** Dano (negativo) ou cura (positivo). Personagens: altera a ficha; NPC/inimigo: PV do mestre. */
  async changeHp(userId: string, cid: string, id: string, delta: number, ctx: RequestCtx) {
    let charChanged = false;
    const dto = await withUser(this.db, userId, async (tx) => {
      const role = await requireMember(tx, cid);
      const manager = canManageCampaign(role);
      const eid = await this.requireActive(tx, cid);
      const [c] = await tx
        .select()
        .from(cb)
        .where(and(eq(cb.id, id), eq(cb.encounterId, eid)));
      if (!c) throw notFound('Combatente');
      if (c.characterId) {
        const [row] = await tx
          .select()
          .from(ch)
          .where(and(eq(ch.id, c.characterId), isNull(ch.deletedAt)));
        if (!row) throw notFound('Personagem');
        if (!manager && row.ownerId !== userId)
          throw forbidden('Só o dono do personagem ou o mestre podem alterar os PV');
        const def = await this.definition(tx, cid);
        const sheet = characterSheetSchema.parse(row.sheet);
        const h = characterHp(def, sheet);
        if (!h)
          throw new AppError(ERROR_CODES.VALIDATION, 'A ficha deste personagem não tem pontos de vida.', 400);
        const next = Math.max(def && h.key ? 0 : -99999, Math.min(h.max, h.current + delta));
        if (h.key && sheet.system) sheet.system.current = { ...sheet.system.current, [h.key]: next };
        else sheet.resources[0] = { ...sheet.resources[0]!, current: next };
        await tx
          .update(ch)
          .set({ sheet, version: sql`${ch.version} + 1` })
          .where(eq(ch.id, row.id));
        charChanged = true;
      } else {
        if (!manager) throw forbidden('Só o mestre altera os PV de NPCs e inimigos');
        const [g] = await tx
          .update(gm)
          .set({ hpCurrent: sql`greatest(least(${gm.hpCurrent} + ${delta}, ${gm.hpMax}), -99999)` })
          .where(eq(gm.combatantId, id))
          .returning();
        if (g) {
          const health = healthOf(g.hpCurrent, g.hpMax);
          // Inimigo a 0 PV sai da ordem de turnos (o mestre pode desfazer); NPCs ficam a critério do mestre.
          await tx
            .update(cb)
            .set(c.kind === 'enemy' && g.hpMax > 0 ? { health, defeated: health === 'down' } : { health })
            .where(eq(cb.id, id));
        }
      }
      await audit(tx, ctx, {
        action: 'combat.hp',
        entityType: 'combatant',
        entityId: id,
        campaignId: cid,
        after: { delta },
      });
      return this.view(tx, userId, cid);
    });
    this.changed(cid);
    if (charChanged) this.rt.campaign(cid, WS_EVENTS.charactersChanged, { campaignId: cid });
    return dto;
  }

  async next(userId: string, cid: string, expected: string | null) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      const eid = await this.requireActive(tx, cid);
      try {
        await tx.execute(sql`select app_private.advance_turn(${eid}::uuid, ${expected}::uuid)`);
      } catch (e) {
        if (pgCode(e) === '42501') throw forbidden('Só o mestre ou quem está na vez podem passar o turno');
        if (pgCode(e) === '40001') throw new AppError(ERROR_CODES.CONFLICT, 'O turno já foi passado.', 409);
        throw e;
      }
      return this.view(tx, userId, cid);
    });
    this.changed(cid);
    return dto;
  }

  async end(userId: string, cid: string, ctx: RequestCtx) {
    await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const eid = await this.requireActive(tx, cid);
      await tx
        .update(enc)
        .set({ status: 'ended', endedAt: new Date(), currentCombatantId: null })
        .where(eq(enc.id, eid));
      await audit(tx, ctx, {
        action: 'combat.ended',
        entityType: 'encounter',
        entityId: eid,
        campaignId: cid,
      });
    });
    this.changed(cid);
    return null;
  }
}

@Controller('campaigns/:id/combat')
export class CombatController {
  constructor(private readonly svc: CombatService) {}

  @Get()
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u.id, campaignId(id));
  }
  @Post()
  start(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown, @Ctx() ctx: RequestCtx) {
    return this.svc.start(u.id, campaignId(id), parse(startCombatSchema, b ?? {}), ctx);
  }
  @Post('combatants')
  add(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    return this.svc.add(u.id, campaignId(id), parse(addCombatantSchema, b));
  }
  @Patch('combatants/:cid')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('cid') c: string, @Body() b: unknown) {
    return this.svc.update(u.id, campaignId(id), anyId(c), parse(updateCombatantSchema, b));
  }
  @Delete('combatants/:cid')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('cid') c: string) {
    return this.svc.remove(u.id, campaignId(id), anyId(c));
  }
  @Post('combatants/:cid/initiative')
  @HttpCode(200)
  initiative(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('cid') c: string,
    @Body() b: unknown,
  ) {
    return this.svc.rollInitiative(
      u.id,
      campaignId(id),
      anyId(c),
      parse(rollInitiativeSchema, b ?? {}).bonus,
    );
  }
  @Post('combatants/:cid/hp')
  @HttpCode(200)
  hp(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('cid') c: string,
    @Body() b: unknown,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.changeHp(u.id, campaignId(id), anyId(c), parse(hpChangeSchema, b).delta, ctx);
  }
  @Post('next')
  @HttpCode(200)
  next(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    return this.svc.next(u.id, campaignId(id), parse(nextTurnSchema, b).expected);
  }
  @Post('end')
  @HttpCode(200)
  end(@CurrentUser() u: AuthUser, @Param('id') id: string, @Ctx() ctx: RequestCtx) {
    return this.svc.end(u.id, campaignId(id), ctx);
  }
}
