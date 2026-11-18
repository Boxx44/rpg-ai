'use client';

import type { SessionStartedEvent } from '@rpg-ai/shared';
import { Button } from '@rpg-ai/ui';
import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useUserRealtime } from '@/lib/realtime';

/** Aviso flutuante quando o mestre de uma das suas campanhas inicia uma sessão. */
export function LiveSessionNotifier() {
  const [events, setEvents] = useState<SessionStartedEvent[]>([]);
  const path = usePathname();
  const router = useRouter();
  useUserRealtime({
    'session.started': (e: SessionStartedEvent) => {
      router.refresh();
      // Quem já está na mesa dessa campanha não precisa do aviso.
      if (path === `/campaigns/${e.campaignId}`) return;
      setEvents((list) => [...list.filter((x) => x.campaignId !== e.campaignId), e]);
    },
    'session.ended': () => router.refresh(),
  });
  if (!events.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
      {events.map((e) => (
        <div
          key={e.campaignId}
          role="status"
          data-testid="live-toast"
          className="animate-rise rounded-xl border border-blood/50 bg-surface/95 p-4 shadow-[0_20px_50px_-20px_rgba(180,35,47,0.6)] backdrop-blur"
        >
          <div className="mb-2 flex items-start gap-3">
            <span className="relative mt-1.5 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-blood opacity-70" />
              <span className="relative inline-flex size-2.5 rounded-full bg-blood" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display tracking-wide">Sessão ao vivo!</p>
              <p className="truncate text-sm text-ink-muted">
                {e.campaignName} · Sessão {e.session.number}
                {e.session.title ? ` — ${e.session.title}` : ''}
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar aviso"
              className="text-ink-faint hover:text-ink"
              onClick={() => setEvents((l) => l.filter((x) => x !== e))}
            >
              <X className="size-4" />
            </button>
          </div>
          <Button asChild size="sm" className="w-full">
            <Link
              href={`/campaigns/${e.campaignId}`}
              onClick={() => setEvents((l) => l.filter((x) => x !== e))}
            >
              Entrar na mesa
            </Link>
          </Button>
        </div>
      ))}
    </div>
  );
}
