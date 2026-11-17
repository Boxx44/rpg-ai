'use client';

import { cn } from '@rpg-ai/ui';
import { Castle, Map as MapIcon, ScrollText, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function CampaignTabs({ campaignId, manager }: { campaignId: string; manager: boolean }) {
  const path = usePathname();
  const base = `/campaigns/${campaignId}`;
  const tabs = [
    { href: base, label: 'Mesa', icon: Castle, exact: true },
    { href: `${base}/characters`, label: 'Personagens', icon: ScrollText },
    { href: `${base}/npcs`, label: 'NPCs', icon: Users },
    ...(manager ? [{ href: `${base}/maps`, label: 'Mapas', icon: MapIcon }] : []),
    { href: `${base}/manage`, label: manager ? 'Gerenciar' : 'Membros', icon: Settings },
  ];
  return (
    <nav
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px"
      aria-label="Seções da campanha"
    >
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
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
      })}
    </nav>
  );
}
