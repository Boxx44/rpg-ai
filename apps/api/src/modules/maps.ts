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
import { and, asc, type Database, desc, eq, isNull, schema, sql, type Tx, withUser } from '@rpg-ai/db';
import {
  type CreateMapInput,
  createMapSchema,
  type CreateTokenInput,
  createTokenSchema,
  ERROR_CODES,
  mapTemplate,
  PROPS,
  type PropKind,
  type MapDto,
  type MapSummaryDto,
  moveTokenSchema,
  type PaintInput,
  paintSchema,
  type Terrain,
  type TokenDto,
  type UpdateMapInput,
  updateMapSchema,
  type UpdateTokenInput,
  updateTokenSchema,
  WS_EVENTS,
} from '@rpg-ai/shared';
import { AppError, assetRefError, forbidden, notFound } from '../common/errors';
import { Ctx, CurrentUser, parse, type RequestCtx } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { requireManager, requireMember, requirePlayer } from './access';
import { audit } from './audit';
import { anyId, campaignId } from './ids';
import { Realtime } from './realtime.gateway';

const m = schema.maps;
const t = schema.mapTokens;

const outOfBounds = () => new AppError(ERROR_CODES.VALIDATION, 'Posição fora do mapa', 400);

function toToken(r: typeof t.$inferSelect, portrait: string | null = null): TokenDto {
  return {
    id: r.id,
    mapId: r.mapId,
    kind: r.kind,
    label: r.label,
    color: r.color,
    characterId: r.characterId,
    npcId: r.npcId,
    controlledBy: r.controlledBy,
    x: r.x,
    y: r.y,
    size: r.size,
    hidden: r.hidden,
    icon: (r.icon as PropKind | null) ?? null,
    state: r.state ?? null,
    rotation: r.rotation,
    imageAsset: r.imageAsset,
    image: r.imageAsset ?? portrait,
  };
}

@Injectable()
export class MapsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rt: Realtime,
  ) {}

  /** Avisa quem pode ver o mapa que ele mudou (clientes recarregam pela API). */
  private notify(cid: string, mapId: string, shared: boolean) {
    if (shared) this.rt.campaign(cid, WS_EVENTS.mapsChanged, { mapId });
    else this.rt.managers(cid, WS_EVENTS.mapsChanged, { mapId });
  }

  private async mapOf(tx: Tx, cid: string, mapId: string) {
    const [row] = await tx
      .select()
      .from(m)
      .where(and(eq(m.id, mapId), eq(m.campaignId, cid), isNull(m.deletedAt)));
    if (!row) throw notFound('Mapa');
    return row;
  }

  list(userId: string, cid: string): Promise<MapSummaryDto[]> {
    return withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      const rows = await tx
        .select({
          id: m.id,
          name: m.name,
          cols: m.cols,
          rows: m.rows,
          shared: m.shared,
          backgroundAsset: m.backgroundAsset,
          updatedAt: m.updatedAt,
        })
        .from(m)
        .where(and(eq(m.campaignId, cid), isNull(m.deletedAt)))
        .orderBy(desc(m.shared), desc(m.updatedAt));
      return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
    });
  }

  private async full(tx: Tx, cid: string, mapId: string): Promise<MapDto> {
    const map = await this.mapOf(tx, cid, mapId);
    // Retrato do personagem/NPC entra como imagem do token (RLS esconde NPC não revelado).
    const tokens = await tx
      .select({ t, cp: schema.characters.portraitAsset, np: schema.npcs.portraitAsset })
      .from(t)
      .leftJoin(schema.characters, eq(schema.characters.id, t.characterId))
      .leftJoin(schema.npcs, eq(schema.npcs.id, t.npcId))
      .where(eq(t.mapId, mapId))
      .orderBy(asc(t.createdAt));
    return {
      id: map.id,
      campaignId: map.campaignId,
      name: map.name,
      cols: map.cols,
      rows: map.rows,
      shared: map.shared,
      backgroundAsset: map.backgroundAsset,
      gridVisible: map.gridVisible,
      cellLabel: map.cellLabel,
      terrain: map.terrain as Record<string, Terrain>,
      tokens: tokens.map((r) => toToken(r.t, r.cp ?? r.np ?? null)),
      updatedAt: map.updatedAt.toISOString(),
    };
  }

  get(userId: string, cid: string, mapId: string) {
    return withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      return this.full(tx, cid, mapId);
    });
  }

  async create(userId: string, cid: string, input: CreateMapInput, ctx: RequestCtx) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const { template, ...base } = input;
      const tpl = template ? mapTemplate(template) : null;
      const [row] = await tx
        .insert(m)
        .values({
          campaignId: cid,
          createdBy: userId,
          ...base,
          ...(tpl ? { cols: tpl.cols, rows: tpl.rows, terrain: tpl.terrain } : {}),
        })
        .returning({ id: m.id });
      if (tpl?.props.length) {
        await tx.insert(t).values(
          tpl.props.map((p) => {
            const def = PROPS[p.icon as PropKind];
            return {
              mapId: row!.id,
              campaignId: cid,
              kind: 'object' as const,
              label: def.label,
              color: '#6b6b6b',
              x: p.x,
              y: p.y,
              size: def.size,
              icon: p.icon,
              rotation: p.rotation ?? 0,
              state: (p.state ?? def.states[0] ?? null) as 'open' | 'closed' | 'on' | 'off' | null,
            };
          }),
        );
      }
      await audit(tx, ctx, {
        action: 'map.created',
        entityType: 'map',
        entityId: row!.id,
        campaignId: cid,
        after: input,
      });
      return this.full(tx, cid, row!.id);
    });
    this.notify(cid, dto.id, false);
    return dto;
  }

  async update(userId: string, cid: string, mapId: string, input: UpdateMapInput, ctx: RequestCtx) {
    let wasShared = false;
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const cur = await this.mapOf(tx, cid, mapId);
      wasShared = cur.shared;
      await tx.update(m).set(input).where(eq(m.id, mapId)).catch(assetRefError);
      // Mapa diminuiu: traz tokens que ficaram de fora para dentro.
      if ((input.cols ?? cur.cols) < cur.cols || (input.rows ?? cur.rows) < cur.rows) {
        await tx.execute(sql`select app_private.clamp_tokens(${mapId}::uuid)`);
      }
      await audit(tx, ctx, {
        action: 'map.updated',
        entityType: 'map',
        entityId: mapId,
        campaignId: cid,
        after: input,
      });
      return this.full(tx, cid, mapId);
    });
    // Se deixou de ser compartilhado, jogadores também precisam saber (para sumir da tela).
    this.notify(cid, mapId, dto.shared || wasShared);
    return dto;
  }

  async paint(userId: string, cid: string, mapId: string, input: PaintInput) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const map = await this.mapOf(tx, cid, mapId);
      const set: Record<string, Terrain> = {};
      const remove: string[] = [];
      for (const c of input.cells) {
        if (c.x >= map.cols || c.y >= map.rows) throw outOfBounds();
        const key = `${c.x},${c.y}`;
        if (c.terrain) set[key] = c.terrain;
        else remove.push(key);
      }
      await tx
        .update(m)
        .set({
          terrain: sql`(${m.terrain} || ${JSON.stringify(set)}::jsonb)
            - array(select jsonb_array_elements_text(${JSON.stringify(remove)}::jsonb))`,
        })
        .where(eq(m.id, mapId));
      return this.full(tx, cid, mapId);
    });
    this.notify(cid, mapId, dto.shared);
    return dto;
  }

  async remove(userId: string, cid: string, mapId: string, ctx: RequestCtx) {
    let shared = false;
    await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      shared = (await this.mapOf(tx, cid, mapId)).shared;
      await tx.update(m).set({ deletedAt: new Date() }).where(eq(m.id, mapId));
      await audit(tx, ctx, { action: 'map.deleted', entityType: 'map', entityId: mapId, campaignId: cid });
    });
    this.notify(cid, mapId, shared);
  }

  // ───────────── tokens ─────────────
  async addToken(userId: string, cid: string, mapId: string, input: CreateTokenInput) {
    let shared = false;
    const token = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const map = await this.mapOf(tx, cid, mapId);
      shared = map.shared;
      if (input.x + input.size > map.cols || input.y + input.size > map.rows) throw outOfBounds();
      let controlledBy: string | null = null;
      if (input.characterId) {
        const [c] = await tx
          .select({ ownerId: schema.characters.ownerId })
          .from(schema.characters)
          .where(
            and(
              eq(schema.characters.id, input.characterId),
              eq(schema.characters.campaignId, cid),
              isNull(schema.characters.deletedAt),
            ),
          );
        if (!c) throw notFound('Personagem');
        controlledBy = c.ownerId; // o jogador dono do personagem pode mover este token
      }
      if (input.npcId) {
        const [npc] = await tx
          .select({ id: schema.npcs.id })
          .from(schema.npcs)
          .where(and(eq(schema.npcs.id, input.npcId), eq(schema.npcs.campaignId, cid)));
        if (!npc) throw notFound('NPC');
      }
      // Objeto do mapa: começa no primeiro estado do catálogo (porta fechada, tocha acesa…).
      const prop = input.icon ? PROPS[input.icon] : undefined;
      if (prop && input.kind !== 'object')
        throw new AppError(ERROR_CODES.VALIDATION, 'Desenhos de objeto só valem para objetos', 400);
      const [row] = await tx
        .insert(t)
        .values({
          mapId,
          campaignId: cid,
          controlledBy,
          ...input,
          state: (prop?.states[0] as 'open' | 'closed' | 'on' | 'off' | undefined) ?? null,
        })
        .returning()
        .catch(assetRefError);
      return toToken(row!);
    });
    this.notify(cid, mapId, shared && !token.hidden);
    return token;
  }

  async updateToken(userId: string, cid: string, mapId: string, tokenId: string, input: UpdateTokenInput) {
    const shared = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const map = await this.mapOf(tx, cid, mapId);
      const r = await tx
        .update(t)
        .set(input)
        .where(and(eq(t.id, tokenId), eq(t.mapId, mapId)))
        .returning({ id: t.id })
        .catch(assetRefError);
      if (!r.length) throw notFound('Token');
      return map.shared;
    });
    // Ocultar/revelar muda o que jogadores veem: avisa todos (só um sinal).
    this.notify(cid, mapId, shared);
  }

  async removeToken(userId: string, cid: string, mapId: string, tokenId: string) {
    const shared = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const map = await this.mapOf(tx, cid, mapId);
      const r = await tx
        .delete(t)
        .where(and(eq(t.id, tokenId), eq(t.mapId, mapId)))
        .returning({ id: t.id });
      if (!r.length) throw notFound('Token');
      return map.shared;
    });
    this.notify(cid, mapId, shared);
  }

  /** Usar um objeto: abrir/fechar porta ou baú, acender/apagar tocha. */
  async toggleProp(userId: string, cid: string, mapId: string, tokenId: string) {
    const { state, shared, hidden, label } = await withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      const map = await this.mapOf(tx, cid, mapId);
      let state: string | undefined;
      try {
        const r = await tx.execute<{ s: string }>(sql`select app_private.toggle_prop(${tokenId}::uuid) as s`);
        state = r[0]?.s;
      } catch (e) {
        const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
        if (code === '42501') throw forbidden('Você não pode usar este objeto');
        if (code === 'P0002') throw notFound('Objeto');
        throw e;
      }
      const [row] = await tx
        .select()
        .from(t)
        .where(and(eq(t.id, tokenId), eq(t.mapId, mapId)));
      if (!row) throw notFound('Objeto');
      return { state, shared: map.shared, hidden: row.hidden, label: row.label };
    });
    const payload = { mapId, tokenId, state, label, by: userId };
    if (shared && !hidden) this.rt.campaign(cid, WS_EVENTS.propToggled, payload);
    else this.rt.managers(cid, WS_EVENTS.propToggled, payload);
    return { state };
  }

  async moveToken(
    userId: string,
    cid: string,
    mapId: string,
    tokenId: string,
    pos: { x: number; y: number },
  ) {
    const { token, shared } = await withUser(this.db, userId, async (tx) => {
      await requirePlayer(tx, cid);
      const map = await this.mapOf(tx, cid, mapId);
      let ok: boolean;
      try {
        const r = await tx.execute<{ ok: boolean }>(
          sql`select app_private.move_token(${tokenId}::uuid, ${pos.x}, ${pos.y}) as ok`,
        );
        ok = !!r[0]?.ok;
      } catch (e) {
        if (
          (e as { code?: string }).code === '22023' ||
          (e as { cause?: { code?: string } }).cause?.code === '22023'
        )
          throw outOfBounds();
        throw e;
      }
      if (!ok) throw forbidden('Você não pode mover este token');
      const [row] = await tx
        .select()
        .from(t)
        .where(and(eq(t.id, tokenId), eq(t.mapId, mapId)));
      if (!row) throw notFound('Token');
      return { token: toToken(row), shared: map.shared };
    });
    const payload = { mapId, tokenId, x: token.x, y: token.y };
    if (shared && !token.hidden) this.rt.campaign(cid, WS_EVENTS.tokenMoved, payload);
    else this.rt.managers(cid, WS_EVENTS.tokenMoved, payload);
    return token;
  }
}

@Controller('campaigns/:id/maps')
export class MapsController {
  constructor(private readonly svc: MapsService) {}

  @Post(':mapId/tokens/:tokenId/toggle')
  @HttpCode(200)
  toggle(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('mapId') mid: string,
    @Param('tokenId') tid: string,
  ) {
    return this.svc.toggleProp(u.id, campaignId(id), anyId(mid), anyId(tid));
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.list(u.id, campaignId(id));
  }
  @Post()
  create(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown, @Ctx() ctx: RequestCtx) {
    return this.svc.create(u.id, campaignId(id), parse(createMapSchema, b), ctx);
  }
  @Get(':mapId')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('mapId') mid: string) {
    return this.svc.get(u.id, campaignId(id), anyId(mid));
  }
  @Patch(':mapId')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('mapId') mid: string,
    @Body() b: unknown,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.update(u.id, campaignId(id), anyId(mid), parse(updateMapSchema, b), ctx);
  }
  @Post(':mapId/paint')
  @HttpCode(200)
  paint(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('mapId') mid: string,
    @Body() b: unknown,
  ) {
    return this.svc.paint(u.id, campaignId(id), anyId(mid), parse(paintSchema, b));
  }
  @Delete(':mapId')
  @HttpCode(204)
  remove(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('mapId') mid: string,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.remove(u.id, campaignId(id), anyId(mid), ctx);
  }
  @Post(':mapId/tokens')
  addToken(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('mapId') mid: string,
    @Body() b: unknown,
  ) {
    return this.svc.addToken(u.id, campaignId(id), anyId(mid), parse(createTokenSchema, b));
  }
  @Patch(':mapId/tokens/:tokenId')
  @HttpCode(204)
  updateToken(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('mapId') mid: string,
    @Param('tokenId') tid: string,
    @Body() b: unknown,
  ) {
    return this.svc.updateToken(u.id, campaignId(id), anyId(mid), anyId(tid), parse(updateTokenSchema, b));
  }
  @Delete(':mapId/tokens/:tokenId')
  @HttpCode(204)
  removeToken(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('mapId') mid: string,
    @Param('tokenId') tid: string,
  ) {
    return this.svc.removeToken(u.id, campaignId(id), anyId(mid), anyId(tid));
  }
  @Post(':mapId/tokens/:tokenId/move')
  @HttpCode(200)
  move(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('mapId') mid: string,
    @Param('tokenId') tid: string,
    @Body() b: unknown,
  ) {
    return this.svc.moveToken(u.id, campaignId(id), anyId(mid), anyId(tid), parse(moveTokenSchema, b));
  }
}
