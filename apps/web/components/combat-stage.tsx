'use client';

import type { CombatantDto, EncounterDto } from '@rpg-ai/shared';
import { cn } from '@rpg-ai/ui';
import { Skull, Swords } from 'lucide-react';
import { useEffect } from 'react';
import { useAssetUrls } from '@/lib/assets';
import { prefersLessMotion } from '@/lib/feedback';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Imagem de cada combatente: retrato do personagem/NPC ou, para inimigos, a imagem do token de mesmo nome. */
export function useCombatImages(
  campaignId: string,
  combat: EncounterDto | null,
  tokenImages: Record<string, string | null>,
): Record<string, string> {
  const ids = (combat?.combatants ?? []).map((c) => c.image ?? tokenImages[c.name] ?? null);
  const urls = useAssetUrls(campaignId, ids);
  const out: Record<string, string> = {};
  for (const c of combat?.combatants ?? []) {
    const a = c.image ?? tokenImages[c.name];
    if (a && urls[a]) out[c.id] = urls[a];
  }
  return out;
}

function Face({ c, url, className }: { c: CombatantDto; url?: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full border-2 font-display font-bold text-white',
        c.kind === 'enemy' ? 'border-blood' : c.kind === 'npc' ? 'border-gold/70' : 'border-arcane-500',
        className,
      )}
      style={{ background: c.color }}
      aria-hidden
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : initials(c.name)}
    </span>
  );
}

/**
 * Abertura do combate: faixa "Combate!" com a ordem de iniciativa aparecendo
 * um por um. Some sozinha (ou com Esc).
 */
export function CombatIntro({
  combat,
  images,
  onDone,
}: {
  combat: EncounterDto;
  images: Record<string, string>;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, prefersLessMotion() ? 2500 : 3800);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', esc);
    };
  }, [onDone]);
  const list = combat.combatants.slice(0, 10);
  return (
    <div
      // Só visual: não bloqueia cliques (o mestre pode continuar agindo).
      className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/45"
      role="alert"
      aria-live="assertive"
      data-testid="combat-intro"
    >
      <div className="animate-pop w-full space-y-5 border-y-2 border-blood/80 bg-gradient-to-r from-blood/20 via-bg/95 to-blood/20 px-6 py-8 text-center shadow-[0_0_80px_rgba(180,35,47,0.45)]">
        <p className="flex items-center justify-center gap-4 font-display text-5xl tracking-[0.3em] text-rose-100 drop-shadow-[0_0_18px_rgba(255,80,80,0.6)] sm:text-6xl">
          <Swords className="animate-shake size-10 text-blood-light" aria-hidden />
          Combate!
          <Swords className="animate-shake size-10 -scale-x-100 text-blood-light" aria-hidden />
        </p>
        <p className="text-sm text-ink-muted">Rodada {combat.round} · ordem de iniciativa</p>
        <ol className="mx-auto flex max-w-4xl flex-wrap justify-center gap-4">
          {list.map((c, i) => (
            <li
              key={c.id}
              className="animate-slide-in flex w-20 flex-col items-center gap-1.5"
              style={{ animationDelay: `${250 + i * 120}ms` }}
            >
              <span className="relative">
                <Face c={c} url={images[c.id]} className="size-14 text-lg" />
                <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border border-line bg-bg text-xs tabular-nums">
                  {c.initiative ?? '–'}
                </span>
              </span>
              <span className="w-full truncate text-xs text-ink">{c.name}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-faint">Aperte Esc para fechar</p>
      </div>
    </div>
  );
}

/** Barra de iniciativa sobre o mapa: quem age agora, quem vem depois, vida de cada um. */
export function InitiativeBar({
  combat,
  images,
  onPick,
}: {
  combat: EncounterDto;
  images: Record<string, string>;
  onPick?: (c: CombatantDto) => void;
}) {
  const idx = combat.combatants.findIndex((c) => c.id === combat.currentId);
  return (
    <div
      className="animate-slide-in flex items-center gap-3 overflow-x-auto rounded-xl border border-blood/40 bg-gradient-to-r from-blood/15 to-surface/60 px-3 py-2"
      data-testid="initiative-bar"
      aria-label={`Combate, rodada ${combat.round}`}
    >
      <div className="shrink-0 text-center">
        <Swords className="mx-auto size-4 text-blood-light" aria-hidden />
        <p className="text-[10px] uppercase tracking-wider text-ink-faint">Rodada</p>
        <p className="font-display text-lg leading-none" data-testid="initiative-round">
          {combat.round}
        </p>
      </div>
      <ol className="flex items-center gap-2">
        {combat.combatants.map((c, i) => {
          const current = c.id === combat.currentId;
          const pct =
            c.hp && c.hp.max > 0 ? Math.max(0, Math.min(100, (c.hp.current / c.hp.max) * 100)) : null;
          const next = idx >= 0 && i === (idx + 1) % combat.combatants.length && !current;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick?.(c)}
                data-testid="initiative-item"
                data-current={current ? 'true' : undefined}
                aria-current={current ? 'true' : undefined}
                title={`${c.name}${c.initiative !== null ? ` · Iniciativa ${c.initiative}` : ''}${c.defeated ? ' · fora de combate' : ''}`}
                className={cn(
                  'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-left text-xs transition-all',
                  current
                    ? 'scale-105 border-gold bg-gold/15 text-gold-bright shadow-[0_0_16px_rgba(230,200,127,0.35)]'
                    : 'border-line bg-bg/60 text-ink-muted hover:text-ink',
                  c.defeated && 'opacity-45 grayscale',
                )}
              >
                <span className="relative">
                  <Face
                    c={c}
                    url={images[c.id]}
                    className={current ? 'size-9 text-xs' : 'size-7 text-[10px]'}
                  />
                  {c.defeated && (
                    <Skull className="absolute inset-0 m-auto size-4 text-white drop-shadow" aria-hidden />
                  )}
                </span>
                <span className="max-w-24">
                  <span className="block truncate font-medium">{c.name}</span>
                  {pct !== null ? (
                    <span className="mt-0.5 block h-1 w-16 overflow-hidden rounded-full bg-black/50">
                      <span
                        className={cn(
                          'block h-full transition-all',
                          pct > 50 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-blood',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  ) : (
                    <span className="block text-[10px] text-ink-faint">
                      {c.health === 'down'
                        ? 'Caído'
                        : c.health === 'hurt'
                          ? 'Ferido'
                          : next
                            ? 'Próximo'
                            : `Inic. ${c.initiative ?? '–'}`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {combat.hiddenTurn && (
          <li className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-ink-faint">
            Alguém nas sombras…
          </li>
        )}
      </ol>
    </div>
  );
}
