'use client';

import type { ChatMessageDto } from '@rpg-ai/shared';
import { cn } from '@rpg-ai/ui';
import { useEffect, useState } from 'react';
import { prefersLessMotion } from '@/lib/feedback';

type Roll = NonNullable<ChatMessageDto['roll']>;

/** Resultado especial de um d20 mantido: 20 natural ou 1 natural. */
export function rollOutcome(roll: Roll): 'crit' | 'fumble' | null {
  for (const p of roll.parts) {
    if (p.type !== 'dice' || !/d20\b/i.test(p.notation)) continue;
    const kept = p.dice.filter((d) => d.kept);
    if (kept.some((d) => d.value === 20)) return 'crit';
    if (kept.length && kept.every((d) => d.value === 1)) return 'fumble';
  }
  return null;
}

function sides(notation: string) {
  const m = /d(\d+)/i.exec(notation);
  return m ? Number(m[1]) : 6;
}

/** Forma do dado: d20 = hexágono-ícone, d6 = quadrado, outros = losango/círculo. */
function DieShape({ n }: { n: number }) {
  if (n === 20) return <polygon points="20,1 37,11 37,29 20,39 3,29 3,11" className="fill-current" />;
  if (n === 6) return <rect x="4" y="4" width="32" height="32" rx="7" className="fill-current" />;
  if (n === 4) return <polygon points="20,3 37,35 3,35" className="fill-current" />;
  if (n === 8 || n === 10 || n === 12)
    return <polygon points="20,1 38,20 20,39 2,20" className="fill-current" />;
  return <circle cx="20" cy="20" r="18" className="fill-current" />;
}

function Die({
  value,
  max,
  kept,
  delay,
  settle,
}: {
  value: number;
  max: number;
  kept: boolean;
  delay: number;
  settle: boolean;
}) {
  const [shown, setShown] = useState(settle ? value : Math.ceil(Math.random() * max));
  useEffect(() => {
    if (settle) return setShown(value);
    const iv = setInterval(() => setShown(Math.ceil(Math.random() * max)), 60);
    return () => clearInterval(iv);
  }, [settle, value, max]);
  const nat = settle && kept && max === 20 && (value === 20 || value === 1);
  return (
    <div
      className={cn('relative size-12', !settle && 'animate-dice', settle && 'animate-pop')}
      style={{ animationDelay: `${delay}ms` }}
    >
      <svg
        viewBox="0 0 40 40"
        className={cn(
          'absolute inset-0',
          kept ? (nat ? (value === 20 ? 'text-gold' : 'text-blood') : 'text-arcane-600') : 'text-surface-3',
        )}
      >
        <DieShape n={max} />
      </svg>
      <span
        className={cn(
          'absolute inset-0 grid place-items-center font-display text-lg font-bold',
          kept ? 'text-white' : 'text-ink-faint line-through',
        )}
      >
        {shown}
      </span>
    </div>
  );
}

/**
 * Bandeja que aparece quando alguém rola: dados girando e parando no resultado.
 * O resultado verdadeiro sempre vem do servidor; a animação é só visual.
 */
export function DiceTray({ message, onDone }: { message: ChatMessageDto | null; onDone: () => void }) {
  const [settle, setSettle] = useState(false);
  useEffect(() => {
    if (!message) return;
    const fast = prefersLessMotion();
    setSettle(fast);
    const t1 = fast ? undefined : setTimeout(() => setSettle(true), 700);
    const t2 = setTimeout(onDone, fast ? 2200 : 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [message, onDone]);
  if (!message?.roll) return null;
  const roll = message.roll;
  const outcome = settle ? rollOutcome(roll) : null;
  const who = message.npc?.name ?? message.author.displayName;
  const dice = roll.parts.flatMap((p) =>
    p.type === 'dice'
      ? p.dice.slice(0, 10).map((d, i) => ({ ...d, max: sides(p.notation), key: `${p.notation}-${i}` }))
      : [],
  );
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center"
      data-testid="dice-tray"
      aria-hidden
    >
      <div
        className={cn(
          'animate-pop flex flex-col items-center gap-2 rounded-2xl border bg-bg/90 px-5 py-3 shadow-2xl backdrop-blur',
          outcome === 'crit'
            ? 'border-gold shadow-[0_0_40px_rgba(230,200,127,0.5)]'
            : outcome === 'fumble'
              ? 'border-blood shadow-[0_0_40px_rgba(180,35,47,0.5)]'
              : 'border-arcane-500/50',
        )}
      >
        <p className="text-xs text-ink-muted">
          <span className="font-medium text-ink">{who}</span> rolou {roll.label || roll.expression}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {dice.map((d, i) => (
            <Die key={d.key} value={d.value} max={d.max} kept={d.kept} delay={i * 40} settle={settle} />
          ))}
        </div>
        <p
          className={cn('font-display text-2xl transition-opacity', settle ? 'opacity-100' : 'opacity-0')}
          data-testid="dice-total"
        >
          {roll.total}
          {outcome === 'crit' && <span className="ml-2 text-base text-gold-bright">20 natural!</span>}
          {outcome === 'fumble' && <span className="ml-2 text-base text-rose-300">1 natural…</span>}
        </p>
      </div>
    </div>
  );
}
