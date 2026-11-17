import { Inject, Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { type Database, sql, withUser } from '@rpg-ai/db';
import type { Logger } from '@rpg-ai/logger';
import { canManageCampaign, type CampaignRole, uuidSchema, WS_EVENTS } from '@rpg-ai/shared';
import type { Namespace, Socket } from 'socket.io';
import { AuthService } from '../auth/auth';
import { type AuthUser, DB, LOGGER } from '../common/tokens';

const room = {
  campaign: (id: string) => `c:${id}`,
  managers: (id: string) => `c:${id}:gm`,
  user: (id: string) => `u:${id}`,
};

/**
 * Tempo real. O cliente entra na sala da campanha (após checagem de participação);
 * mestres entram também na sala dos mestres, que recebe o que é secreto.
 * Todas as ALTERAÇÕES chegam pela API REST (validadas e limitadas); o socket só distribui.
 * Para várias instâncias da API, adicionar o adaptador Redis do Socket.IO (Fase 9).
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly auth: AuthService,
    @Inject(DB) private readonly db: Database,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : undefined;
    try {
      if (!token) throw new Error('sem token');
      const user = await this.auth.authenticate(token);
      client.data.user = user;
      await client.join(room.user(user.id));
      client.emit('session.ready', { userId: user.id });
    } catch {
      client.emit('session.error', { code: 'UNAUTHENTICATED', message: 'Sessão inválida' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('campaign.join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { campaignId?: unknown }) {
    const user = client.data.user as AuthUser | undefined;
    const parsed = uuidSchema.safeParse(body?.campaignId);
    if (!user || !parsed.success) return { ok: false };
    const cid = parsed.data;
    const rows = await withUser(this.db, user.id, (tx) =>
      tx.execute<{ role: CampaignRole | null }>(sql`select app_private.campaign_role(${cid}::uuid) as role`),
    );
    const role = rows[0]?.role ?? null;
    if (!role) return { ok: false };
    for (const r of client.rooms) if (r.startsWith('c:')) await client.leave(r);
    await client.join(room.campaign(cid));
    if (canManageCampaign(role)) await client.join(room.managers(cid));
    this.logger.debug({ userId: user.id, campaignId: cid, role }, 'ws joined campaign');
    return { ok: true, role };
  }

  // ───── distribuição (usada pelos serviços) ─────
  toCampaign(cid: string, event: string, payload: unknown) {
    this.server?.to(room.campaign(cid)).emit(event, payload);
  }
  toManagers(cid: string, event: string, payload: unknown, alsoUser?: string) {
    const rooms = [room.managers(cid)];
    if (alsoUser) rooms.push(room.user(alsoUser));
    // `alsoUser` é sempre o autor da ação, que acabou de ter a participação verificada.
    this.server?.to(rooms).emit(event, payload);
  }
  /** Remove o usuário das salas da campanha (expulso, saiu ou mudou de papel) e pede para reentrar. */
  async resetMembership(cid: string, userId: string) {
    if (!this.server) return;
    this.server.in(room.user(userId)).socketsLeave([room.campaign(cid), room.managers(cid)]);
    this.server.to(room.user(userId)).emit(WS_EVENTS.rejoin, { campaignId: cid });
  }
}

/** Fachada para os serviços não dependerem do socket diretamente. */
@Injectable()
export class Realtime {
  constructor(private readonly gw: RealtimeGateway) {}
  campaign(cid: string, event: string, payload: unknown) {
    this.gw.toCampaign(cid, event, payload);
  }
  managers(cid: string, event: string, payload: unknown, alsoUser?: string) {
    this.gw.toManagers(cid, event, payload, alsoUser);
  }
  resetMembership(cid: string, userId: string) {
    return this.gw.resetMembership(cid, userId);
  }
}
