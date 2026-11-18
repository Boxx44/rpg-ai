import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, type Database, desc, eq, isNull, schema, sql, type Tx, withUser } from '@rpg-ai/db';
import {
  type CampaignDto,
  type CampaignMemberDto,
  type CampaignRole,
  canManageCampaign,
  type CreatedInvitationDto,
  type CreateCampaignInput,
  type CreateInvitationInput,
  type InvitationDto,
  type UpdateCampaignInput,
  type UpdateMemberInput,
} from '@rpg-ai/shared';
import { forbidden, notFound } from '../common/errors';
import type { RequestCtx } from '../common/http';
import { DB } from '../common/tokens';
import { audit } from './audit';
import { Realtime } from './realtime.gateway';

const c = schema.campaigns;
const m = schema.campaignMembers;
const inv = schema.campaignInvitations;

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rt: Realtime,
  ) {}

  // ───────────── leitura ─────────────
  private async fetchCampaigns(tx: Tx, userId: string, id?: string): Promise<CampaignDto[]> {
    const rows = await tx
      .select({
        id: c.id,
        organizationId: c.organizationId,
        name: c.name,
        description: c.description,
        gmMode: c.gmMode,
        status: c.status,
        myRole: m.role,
        memberCount: sql<number>`(select count(*)::int from campaign_members x where x.campaign_id = ${c.id})`,
        liveSessionId: schema.sessions.id,
        liveSessionNumber: schema.sessions.number,
        liveSessionTitle: schema.sessions.title,
        systemId: schema.rpgSystems.id,
        systemName: schema.rpgSystems.name,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })
      .from(c)
      .innerJoin(m, and(eq(m.campaignId, c.id), eq(m.userId, userId)))
      .leftJoin(schema.systemVersions, eq(schema.systemVersions.id, c.systemVersionId))
      .leftJoin(schema.rpgSystems, eq(schema.rpgSystems.id, schema.systemVersions.systemId))
      .leftJoin(schema.sessions, and(eq(schema.sessions.campaignId, c.id), eq(schema.sessions.status, 'live')))
      .where(and(isNull(c.deletedAt), id ? eq(c.id, id) : undefined))
      .orderBy(desc(c.updatedAt));
    return rows.map(({ systemId, systemName, liveSessionId, liveSessionNumber, liveSessionTitle, ...r }) => ({
      ...r,
      liveSession:
        liveSessionId && liveSessionNumber !== null
          ? { id: liveSessionId, number: liveSessionNumber, title: liveSessionTitle ?? '' }
          : null,
      system: systemId && systemName ? { id: systemId, name: systemName } : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private async roleOf(tx: Tx, userId: string, campaignId: string): Promise<CampaignRole | null> {
    const [r] = await tx
      .select({ role: m.role })
      .from(m)
      .innerJoin(c, and(eq(c.id, m.campaignId), isNull(c.deletedAt)))
      .where(and(eq(m.campaignId, campaignId), eq(m.userId, userId)));
    return r?.role ?? null;
  }

  /** Não-membros recebem 404 (não revelamos se a campanha existe). */
  private async requireRole(
    tx: Tx,
    userId: string,
    campaignId: string,
    manage = false,
  ): Promise<CampaignRole> {
    const role = await this.roleOf(tx, userId, campaignId);
    if (!role) throw notFound('Campanha');
    if (manage && !canManageCampaign(role)) throw forbidden('Apenas o dono ou o mestre podem fazer isso');
    return role;
  }

  list(userId: string): Promise<CampaignDto[]> {
    return withUser(this.db, userId, (tx) => this.fetchCampaigns(tx, userId));
  }

  get(userId: string, id: string): Promise<CampaignDto> {
    return withUser(this.db, userId, async (tx) => {
      const [row] = await this.fetchCampaigns(tx, userId, id);
      if (!row) throw notFound('Campanha');
      return row;
    });
  }

  // ───────────── escrita ─────────────
  create(userId: string, input: CreateCampaignInput, ctx: RequestCtx): Promise<CampaignDto> {
    return withUser(this.db, userId, async (tx) => {
      const [org] = await tx
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(and(eq(schema.organizations.ownerId, userId), eq(schema.organizations.isPersonal, true)));
      if (!org) throw notFound('Organização pessoal');
      const [created] = await tx
        .insert(c)
        .values({ organizationId: org.id, createdBy: userId, ...input })
        .returning({ id: c.id });
      await tx.insert(m).values({ campaignId: created!.id, userId, role: 'owner' });
      await audit(tx, ctx, {
        action: 'campaign.created',
        entityType: 'campaign',
        entityId: created!.id,
        organizationId: org.id,
        campaignId: created!.id,
        after: input,
      });
      const [dto] = await this.fetchCampaigns(tx, userId, created!.id);
      return dto!;
    });
  }

  update(userId: string, id: string, input: UpdateCampaignInput, ctx: RequestCtx): Promise<CampaignDto> {
    return withUser(this.db, userId, async (tx) => {
      await this.requireRole(tx, userId, id, true);
      const [before] = await tx
        .select({ name: c.name, description: c.description, gmMode: c.gmMode, status: c.status })
        .from(c)
        .where(eq(c.id, id));
      await tx.update(c).set(input).where(eq(c.id, id));
      await audit(tx, ctx, {
        action: 'campaign.updated',
        entityType: 'campaign',
        entityId: id,
        campaignId: id,
        before,
        after: input,
      });
      const [dto] = await this.fetchCampaigns(tx, userId, id);
      return dto!;
    });
  }

  remove(userId: string, id: string, ctx: RequestCtx): Promise<void> {
    return withUser(this.db, userId, async (tx) => {
      const role = await this.requireRole(tx, userId, id);
      if (role !== 'owner') throw forbidden('Apenas o dono pode excluir a campanha');
      await audit(tx, ctx, {
        action: 'campaign.deleted',
        entityType: 'campaign',
        entityId: id,
        campaignId: id,
      });
      const r = await tx.execute<{ ok: boolean }>(
        sql`select app_private.soft_delete_campaign(${id}::uuid) as ok`,
      );
      if (!r[0]?.ok) throw forbidden();
    });
  }

  // ───────────── membros ─────────────
  members(userId: string, id: string): Promise<CampaignMemberDto[]> {
    return withUser(this.db, userId, async (tx) => {
      await this.requireRole(tx, userId, id);
      const rows = await tx
        .select({
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          displayName: schema.userProfiles.displayName,
          avatarUrl: schema.userProfiles.avatarUrl,
        })
        .from(m)
        .innerJoin(schema.userProfiles, eq(schema.userProfiles.userId, m.userId))
        .where(eq(m.campaignId, id))
        .orderBy(m.joinedAt);
      return rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() }));
    });
  }

  async updateMember(
    userId: string,
    id: string,
    targetId: string,
    input: UpdateMemberInput,
    ctx: RequestCtx,
  ) {
    await withUser(this.db, userId, async (tx) => {
      const myRole = await this.requireRole(tx, userId, id, true);
      const target = await this.roleOf(tx, targetId, id);
      if (!target) throw notFound('Membro');
      if (target === 'owner') throw forbidden('O papel do dono não pode ser alterado');
      if (myRole === 'gm' && (target === 'gm' || input.role === 'gm'))
        throw forbidden('Apenas o dono pode nomear ou alterar mestres');
      await tx
        .update(m)
        .set({ role: input.role })
        .where(and(eq(m.campaignId, id), eq(m.userId, targetId)));
      await audit(tx, ctx, {
        action: 'member.role_changed',
        entityType: 'campaign_member',
        entityId: targetId,
        campaignId: id,
        before: { role: target },
        after: { role: input.role },
      });
    });
    // Papel mudou: o usuário sai das salas em tempo real e reentra com as permissões novas.
    await this.rt.resetMembership(id, targetId);
  }

  async removeMember(userId: string, id: string, targetId: string, ctx: RequestCtx) {
    await withUser(this.db, userId, async (tx) => {
      const myRole = await this.requireRole(tx, userId, id);
      const target = await this.roleOf(tx, targetId, id);
      if (!target) throw notFound('Membro');
      if (target === 'owner') throw forbidden('O dono não pode ser removido');
      const self = targetId === userId;
      if (!self) {
        if (!canManageCampaign(myRole)) throw forbidden('Apenas o dono ou o mestre podem remover membros');
        if (myRole === 'gm' && target === 'gm') throw forbidden('Apenas o dono pode remover mestres');
      }
      await tx.delete(m).where(and(eq(m.campaignId, id), eq(m.userId, targetId)));
      await audit(tx, ctx, {
        action: self ? 'member.left' : 'member.removed',
        entityType: 'campaign_member',
        entityId: targetId,
        campaignId: id,
        before: { role: target },
      });
    });
    await this.rt.resetMembership(id, targetId);
  }

  // ───────────── convites ─────────────
  createInvitation(
    userId: string,
    id: string,
    input: CreateInvitationInput,
    ctx: RequestCtx,
  ): Promise<CreatedInvitationDto> {
    return withUser(this.db, userId, async (tx) => {
      const myRole = await this.requireRole(tx, userId, id, true);
      if (input.role === 'gm' && myRole !== 'owner') throw forbidden('Apenas o dono pode convidar mestres');
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
      const [row] = await tx
        .insert(inv)
        .values({
          campaignId: id,
          email: input.email ?? null,
          role: input.role,
          tokenHash: hashToken(token),
          createdBy: userId,
          expiresAt,
        })
        .returning();
      await audit(tx, ctx, {
        action: 'invitation.created',
        entityType: 'campaign_invitation',
        entityId: row!.id,
        campaignId: id,
        after: { role: input.role, email: input.email ?? null, expiresAt },
      });
      return { ...toInvitationDto(row!), token };
    });
  }

  invitations(userId: string, id: string): Promise<InvitationDto[]> {
    return withUser(this.db, userId, async (tx) => {
      await this.requireRole(tx, userId, id, true);
      const rows = await tx
        .select()
        .from(inv)
        .where(eq(inv.campaignId, id))
        .orderBy(desc(inv.createdAt))
        .limit(100);
      return rows.map(toInvitationDto);
    });
  }

  revokeInvitation(userId: string, id: string, invitationId: string, ctx: RequestCtx) {
    return withUser(this.db, userId, async (tx) => {
      await this.requireRole(tx, userId, id, true);
      const r = await tx
        .update(inv)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(inv.id, invitationId),
            eq(inv.campaignId, id),
            isNull(inv.acceptedAt),
            isNull(inv.revokedAt),
          ),
        )
        .returning({ id: inv.id });
      if (!r.length) throw notFound('Convite pendente');
      await audit(tx, ctx, {
        action: 'invitation.revoked',
        entityType: 'campaign_invitation',
        entityId: invitationId,
        campaignId: id,
      });
    });
  }

  acceptInvitation(
    userId: string,
    token: string,
  ): Promise<{ campaignId: string; role: CampaignRole; alreadyMember: boolean }> {
    return withUser(this.db, userId, async (tx) => {
      const r = await tx.execute<{ campaign_id: string; role: CampaignRole; already_member: boolean }>(
        sql`select * from app_private.accept_invitation(${hashToken(token)})`,
      );
      const row = r[0]!;
      return { campaignId: row.campaign_id, role: row.role, alreadyMember: row.already_member };
    });
  }
}

function toInvitationDto(r: typeof inv.$inferSelect): InvitationDto {
  return {
    id: r.id,
    campaignId: r.campaignId,
    role: r.role,
    email: r.email,
    expiresAt: r.expiresAt.toISOString(),
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}
