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
import { and, asc, type Database, eq, isNull, schema, type Tx, withUser } from '@rpg-ai/db';
import {
  canManageCampaign,
  type CreateNpcInput,
  createNpcSchema,
  npcDetailsSchema,
  type NpcDto,
  type UpdateNpcInput,
  updateNpcSchema,
  WS_EVENTS,
} from '@rpg-ai/shared';
import { notFound } from '../common/errors';
import { Ctx, CurrentUser, parse, type RequestCtx } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { requireManager, requireMember } from './access';
import { audit } from './audit';
import { anyId, campaignId } from './ids';
import { Realtime } from './realtime.gateway';

const n = schema.npcs;
const d = schema.npcGmDetails;

@Injectable()
export class NpcsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rt: Realtime,
  ) {}

  /** O RLS já esconde NPCs não revelados e os detalhes de quem não é mestre. */
  private async fetch(tx: Tx, cid: string, id?: string): Promise<NpcDto[]> {
    const role = await requireMember(tx, cid);
    const manager = canManageCampaign(role);
    const rows = await tx
      .select({ n, d })
      .from(n)
      .leftJoin(d, eq(d.npcId, n.id))
      .where(and(eq(n.campaignId, cid), isNull(n.deletedAt), id ? eq(n.id, id) : undefined))
      .orderBy(asc(n.name));
    return rows.map(({ n: r, d: det }) => ({
      id: r.id,
      campaignId: r.campaignId,
      name: r.name,
      appearance: r.appearance,
      publicDescription: r.publicDescription,
      color: r.color,
      revealed: r.revealed,
      ...(manager ? { details: npcDetailsSchema.parse(det ? { ...det, stats: det.stats } : {}) } : {}),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  list(userId: string, cid: string) {
    return withUser(this.db, userId, (tx) => this.fetch(tx, cid));
  }

  private notify(cid: string) {
    // Só um sinal: cada cliente recarrega pela API e recebe apenas o que pode ver.
    this.rt.campaign(cid, WS_EVENTS.npcsChanged, { campaignId: cid });
  }

  async create(userId: string, cid: string, input: CreateNpcInput, ctx: RequestCtx) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const { details, ...base } = input;
      const [row] = await tx
        .insert(n)
        .values({ campaignId: cid, createdBy: userId, ...base })
        .returning({ id: n.id });
      await tx.insert(d).values({ npcId: row!.id, campaignId: cid, ...details });
      await audit(tx, ctx, {
        action: 'npc.created',
        entityType: 'npc',
        entityId: row!.id,
        campaignId: cid,
        after: { name: input.name },
      });
      return (await this.fetch(tx, cid, row!.id))[0]!;
    });
    this.notify(cid);
    return dto;
  }

  async update(userId: string, cid: string, id: string, input: UpdateNpcInput, ctx: RequestCtx) {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const [cur] = await this.fetch(tx, cid, id);
      if (!cur) throw notFound('NPC');
      const { details, ...base } = input;
      if (Object.keys(base).length) await tx.update(n).set(base).where(eq(n.id, id));
      if (details) await tx.update(d).set(details).where(eq(d.npcId, id));
      await audit(tx, ctx, {
        action: 'npc.updated',
        entityType: 'npc',
        entityId: id,
        campaignId: cid,
        after: { ...base, details: !!details },
      });
      return (await this.fetch(tx, cid, id))[0]!;
    });
    this.notify(cid);
    return dto;
  }

  async remove(userId: string, cid: string, id: string, ctx: RequestCtx) {
    await withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      const r = await tx
        .update(n)
        .set({ deletedAt: new Date() })
        .where(and(eq(n.id, id), eq(n.campaignId, cid), isNull(n.deletedAt)))
        .returning({ id: n.id });
      if (!r.length) throw notFound('NPC');
      await audit(tx, ctx, { action: 'npc.deleted', entityType: 'npc', entityId: id, campaignId: cid });
    });
    this.notify(cid);
  }
}

@Controller('campaigns/:id/npcs')
export class NpcsController {
  constructor(private readonly svc: NpcsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.list(u.id, campaignId(id));
  }
  @Post()
  create(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown, @Ctx() ctx: RequestCtx) {
    return this.svc.create(u.id, campaignId(id), parse(createNpcSchema, b), ctx);
  }
  @Patch(':npcId')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('npcId') nid: string,
    @Body() b: unknown,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.update(u.id, campaignId(id), anyId(nid), parse(updateNpcSchema, b), ctx);
  }
  @Delete(':npcId')
  @HttpCode(204)
  remove(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('npcId') nid: string,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.remove(u.id, campaignId(id), anyId(nid), ctx);
  }
}
