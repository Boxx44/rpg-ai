import { Inject } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { Logger } from '@rpg-ai/logger';
import type { Socket } from 'socket.io';
import { AuthService } from '../auth/auth';
import { LOGGER } from '../common/tokens';

/**
 * Base do tempo real (Fase 1: somente conexão autenticada).
 * Salas de campanha, chat e eventos de jogo entram na Fase 7.
 * CORS é aplicado pelo adaptador configurado em app.factory.ts.
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection {
  constructor(
    private readonly auth: AuthService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : undefined;
    try {
      if (!token) throw new Error('sem token');
      const user = await this.auth.authenticate(token);
      client.data.user = user;
      client.emit('session.ready', { userId: user.id });
      this.logger.info({ userId: user.id, socketId: client.id }, 'ws connected');
    } catch {
      client.emit('session.error', { code: 'UNAUTHENTICATED', message: 'Sessão inválida' });
      client.disconnect(true);
    }
  }
}
