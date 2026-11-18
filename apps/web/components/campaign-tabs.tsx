'use client';

import { cn } from '@rpg-ai/ui';
import { Castle, History, Map as MapIcon, ScrollText, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navegação da campanha em dois blocos:
 *  - JOGAR: a mesa ao vivo.
 *  - PREPARAR: personagens, NPCs, mapas (o que o mestre monta antes e leva para a sessão).
 * Mais o histórico de sessões e a gestão.
 */
export function CampaignTabs({
  campaignId,
  manager,
  live,
}: {
  campaignId: string;
  manager: boolean;
  live: boolean;
}) {
  const path = usePathname();
  const base = `/campaigns/${campaignId}`;
  const prep = [
    { href: `${base}/characters`, label: 'Personagens', icon: ScrollText },
    { href: `${base}/npcs`, label: 'NPCs', icon: Users },
    ...(manager ? [{ href: `${base}/maps`, label: 'Mapas', icon: MapIcon }] : []),
  ];
  const other = [
    { href: `${base}/sessions`, label: 'Sessões', icon: History },
    { href: `${base}/manage`, label: manager ? 'Gerenciar' : 'Membros', icon: Settings },
  ];
  const tab = (t: { href: string; label: string; icon: typeof Castle }, exact = false) => {
    const active = exact ? path === t.href : path.startsWith(t.href);
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative inline-flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm transition-colors',
          active ? 'text-ink' : 'text-ink-muted hover:text-ink',
        )}
      >
        <t.icon className="size-4" />
        {t.label}
        {active && (
          <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-gradient-to-r from-gold/40 via-gold-bright to-gold/40" />
        )}
      </Link>
    );
  };
  const group = (label: string) => (
    <span className="hidden shrink-0 self-center pl-3 pr-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/60 sm:inline">
      {label}
    </span>
  );
  const playActive = path === base;
  return (
    <nav
      className="-mx-1 flex items-stretch gap-1 overflow-x-auto border-b border-line pb-px"
      aria-label="Seções da campanha"
    >
      {group('Jogar')}
      <Link
        href={base}
        aria-current={playActive ? 'page' : undefined}
        className={cn(
          'relative inline-flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm transition-colors',
          playActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
        )}
      >
        <Castle className="size-4" />
        Mesa
        {live && (
          <span
            className="rounded-full bg-blood px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
            data-testid="live-tab-badge"
          >
            ao vivo
          </span>
        )}
        {playActive && (
          <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-gradient-to-r from-gold/40 via-gold-bright to-gold/40" />
        )}
      </Link>
      <span className="mx-1 w-px shrink-0 self-center bg-line" style={{ height: 20 }} />
      {group('Preparar')}
      {prep.map((t) => tab(t))}
      <span className="mx-1 w-px shrink-0 self-center bg-line" style={{ height: 20 }} />
      {other.map((t) => tab(t))}
    </nav>
  );
}
