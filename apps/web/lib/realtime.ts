'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { env } from './env';
import { accessToken } from './supabase';

export type RealtimeStatus = 'connecting' | 'online' | 'offline';
type Handlers = Record<string, (payload: never) => void>;

/**
 * Conecta ao tempo real da campanha. Reentra automaticamente após reconexão
 * ou quando o servidor pede (mudança de papel). Chama `onResync` para o
 * componente recarregar o que pode ter perdido enquanto esteve desconectado.
 */
export function useCampaignRealtime(campaignId: string, handlers: Handlers, onResync?: () => void) {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const ref = useRef({ handlers, onResync });
  ref.current = { handlers, onResync };

  useEffect(() => {
    let socket: Socket | undefined;
    let cancelled = false;
    let firstJoin = true;

    const join = async () => {
      if (!socket) return;
      const ack = (await socket.emitWithAck('campaign.join', { campaignId }).catch(() => null)) as {
        ok: boolean;
      } | null;
      if (!ack?.ok) {
        setStatus('offline');
        return;
      }
      setStatus('online');
      if (!firstJoin) ref.current.onResync?.();
      firstJoin = false;
    };

    (async () => {
      socket = io(`${env.apiUrl}/realtime`, {
        transports: ['websocket'],
        // Token renovado a cada (re)conexão.
        auth: (cb) => {
          accessToken().then(
            (token) => cb({ token }),
            () => cb({}),
          );
        },
      });
      if (cancelled) socket.close();
      socket.on('session.ready', join);
      socket.on('campaign.rejoin', join);
      socket.on('disconnect', () => setStatus('offline'));
      socket.onAny((event: string, payload: unknown) =>
        (ref.current.handlers[event] as ((p: unknown) => void) | undefined)?.(payload),
      );
    })();

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [campaignId]);

  return status;
}
