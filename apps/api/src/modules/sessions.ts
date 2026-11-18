import { Body, Controller, Get, HttpCode, Inject, Injectable, Param, Patch, Post } from '@nestjs/common';
import { and, type Database, desc, eq, schema, sql, type Tx, withUser } from '@rpg-ai/db';
import {
  ERROR_CODES,
  endSessionSchema,
  sceneSchema,
  type SessionDto,
  type SessionStartedEvent,
  startSessionSchema,
  updateSessionSchema,
  WS_EVENTS,
} from '@rpg-ai/shared';
import { AppError, notFound } from '../common/errors';
import { Ctx, CurrentUser, parse, type RequestCtx } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { requireManager, requireMember } from './access';
import { audit } from './audit';
import { anyId, campaignId } from './ids';
import { Realtime } from './realtime.gateway';

const s = schema.sessions;

function pgCode(e: unknown): string | undefined {
  return (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
}

/**
 * Sessões de jogo: o mestre inicia (todos da campanha são avisados), escolhe a cena
 * (mapa mostrado a todos) e encerra. Mensagens e rolagens ficam ligadas à sessão.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rt: Realtime,
  ) {}

  private async fetch(tx: Tx, cid: string, id?: string): Promise<SessionDto[]> {
    const rows = await tx
      .select({
        s,
        messageCount: sql<number>`(select count(*)::int from chat_messages m where m.session_id = "sessions"."id")`,
      })
      .from(s)
      .where(and(eq(s.campaignId, cid), id ? eq(s.id, id) : undefined))
      .orderBy(desc(s.number))
      .limit(200);
    return rows.map(({ s: r, messageCount }) => ({
      id: r.id,
      campaignId: r.campaignId,
      number: r.number,
      title: r.title,
      status: r.status,
      activeMapId: r.activeMapId,
      summary: r.summary,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      messageCount,
    }));
  }

  list(userId: string, cid: string) {
    return withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      return this.fetch(tx, cid);
    });
  }

  live(userId: string, cid: string): Promise<SessionDto | null> {
    return withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      const [row] = await tx.select({ id: s.id }).from(s).where(and(eq(s.campaignId, cid), eq(s.status, 'live')));
      return row ? ((await this.fetch(tx, cid, row.id))[0] ?? null) : null;
    });
  }

  async start(userId: string, cid: string, title: string, ctx: RequestCtx): Promise<SessionDto> {
    const { session, campaignName, memberIds } = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      let id: string;
      try {
        const r = await tx.execute<{ id: string }>(sql`select app_private.start_session(${cid}::uuid, ${title}) as id`);
        id = r[0]!.id;
      } catch (e) {
        if (pgCode(e) === '23505') throw new AppError(ERROR_CODES.CONFLICT, 'Já existe uma sessão ao vivo nesta campanha.', 409);
        throw e;
      }
      await audit(tx, ctx, { action: 'session.started', entityType: 'session', entityId: id, campaignId: cid, after: { title } });
      const [c] = await tx.select({ name: schema.campaigns.name }).from(schema.campaigns).where(eq(schema.campaigns.id, cid));
      const members = await tx
        .select({ id: schema.campaignMembers.userId })
        .from(schema.campaignMembers)
        .where(eq(schema.campaignMembers.campaignId, cid));
      return { session: (await this.fetch(tx, cid, id))[0]!, campaignName: c?.name ?? '', memberIds: members.map((m) => m.id) };
    });
    const event: SessionStartedEvent = { campaignId: cid, campaignName, session };
    // Avisa cada membro onde quer que esteja no site (sala pessoal), não só quem está na mesa.
    this.rt.users(memberIds, WS_EVENTS.sessionStarted, event);
    return session;
  }

  async setScene(userId: string, cid: string, sid: string, mapId: string | null) {
    const session = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      try {
        await tx.execute(sql`select app_private.set_scene(${sid}::uuid, ${mapId}::uuid)`);
      } catch (e) {
        if (pgCode(e) === 'P0002') throw notFound('Mapa');
        if (pgCode(e) === '42501') throw notFound('Sessão ao vivo');
        throw e;
      }
      const [row] = await this.fetch(tx, cid, sid);
      if (!row || row.campaignId !== cid) throw notFound('Sessão');
      return row;
    });
    this.rt.campaign(cid, WS_EVENTS.sceneChanged, { sessionId: sid, mapId });
    this.rt.campaign(cid, WS_EVENTS.mapsChanged, { mapId });
    return session;
  }

  async end(userId: string, cid: string, sid: string, summary: string, ctx: RequestCtx) {
    const session = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const [cur] = await this.fetch(tx, cid, sid);
      if (!cur || cur.status !== 'live') throw notFound('Sessão ao vivo');
      await tx.execute(sql`select app_private.end_session(${sid}::uuid, ${summary})`);
      await audit(tx, ctx, { action: 'session.ended', entityType: 'session', entityId: sid, campaignId: cid });
      return (await this.fetch(tx, cid, sid))[0]!;
    });
    this.rt.campaign(cid, WS_EVENTS.sessionEnded, { sessionId: sid });
    return session;
  }

  update(userId: string, cid: string, sid: string, input: { title?: string; summary?: string }) {
    return withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const r = await tx.update(s).set(input).where(and(eq(s.id, sid), eq(s.campaignId, cid))).returning({ id: s.id });
      if (!r.length) throw notFound('Sessão');
      return (await this.fetch(tx, cid, sid))[0]!;
    });
  }
}

@Controller('campaigns/:id/sessions')
export class SessionsController {
  constructor(private readonly svc: SessionsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.list(u.id, campaignId(id));
  }
  @Get('live')
  live(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.live(u.id, campaignId(id));
  }
  @Post()
  start(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown, @Ctx() ctx: RequestCtx) {
    return this.svc.start(u.id, campaignId(id), parse(startSessionSchema, b ?? {}).title, ctx);
  }
  @Post(':sid/scene')
  @HttpCode(200)
  scene(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('sid') sid: string, @Body() b: unknown) {
    return this.svc.setScene(u.id, campaignId(id), anyId(sid), parse(sceneSchema, b).mapId);
  }
  @Post(':sid/end')
  @HttpCode(200)
  end(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('sid') sid: string, @Body() b: unknown, @Ctx() ctx: RequestCtx) {
    return this.svc.end(u.id, campaignId(id), anyId(sid), parse(endSessionSchema, b ?? {}).summary, ctx);
  }
  @Patch(':sid')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('sid') sid: string, @Body() b: unknown) {
    return this.svc.update(u.id, campaignId(id), anyId(sid), parse(updateSessionSchema, b));
  }
}
