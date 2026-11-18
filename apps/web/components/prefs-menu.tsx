'use client';

import { Button, cn } from '@rpg-ai/ui';
import { CheckCircle2, Info, Sparkles, Swords, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  dismissToast,
  playSound,
  type Prefs,
  setPrefs,
  usePrefs,
  usePrefsBootstrap,
  useToasts,
} from '@/lib/feedback';

function Choice<K extends keyof Prefs>({
  name,
  label,
  value,
  options,
}: {
  name: K;
  label: string;
  value: Prefs[K];
  options: { v: Prefs[K]; label: string }[];
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</legend>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            onClick={() => setPrefs({ [name]: o.v } as Partial<Prefs>)}
            className={cn(
              'flex-1 rounded-md border px-2 py-1.5 text-sm transition-colors',
              value === o.v
                ? 'border-gold/70 bg-gold/15 text-gold-bright'
                : 'border-line text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Botão "Aa" no topo: tamanho do texto, tema, contraste, movimento e sons. */
export function PrefsMenu() {
  usePrefsBootstrap();
  const p = usePrefs();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Acessibilidade e preferências"
        title="Acessibilidade e preferências"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="prefs-button"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-display text-base">Aa</span>
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Preferências"
          data-testid="prefs-menu"
          className="animate-pop absolute right-0 top-12 z-50 w-72 space-y-4 rounded-xl border border-line bg-surface p-4 shadow-2xl"
        >
          <p className="font-display text-lg">Do seu jeito</p>
          <Choice
            name="text"
            label="Tamanho do texto"
            value={p.text}
            options={[
              { v: 'normal', label: 'A' },
              { v: 'lg', label: 'A+' },
              { v: 'xl', label: 'A++' },
            ]}
          />
          <Choice
            name="theme"
            label="Tema"
            value={p.theme}
            options={[
              { v: 'dark', label: 'Escuro' },
              { v: 'light', label: 'Claro' },
            ]}
          />
          <Choice
            name="contrast"
            label="Contraste"
            value={p.contrast}
            options={[
              { v: 'normal', label: 'Normal' },
              { v: 'high', label: 'Alto' },
            ]}
          />
          <Choice
            name="motion"
            label="Animações"
            value={p.motion}
            options={[
              { v: 'auto', label: 'Ligadas' },
              { v: 'reduce', label: 'Menos movimento' },
            ]}
          />
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium uppercase tracking-wider text-ink-faint">Sons</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={p.sound}
                onChange={(e) => {
                  setPrefs({ sound: e.target.checked });
                  if (e.target.checked) playSound('dice');
                }}
                className="size-4 accent-[var(--color-gold)]"
              />
              Sons de dados, portas e turno
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              Volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={p.volume}
                disabled={!p.sound}
                aria-label="Volume"
                onChange={(e) => setPrefs({ volume: Number(e.target.value) })}
                onPointerUp={() => playSound('notify')}
                className="flex-1 accent-[var(--color-gold)]"
              />
            </label>
          </fieldset>
          <p className="text-xs text-ink-faint">Fica salvo neste navegador.</p>
        </div>
      )}
    </div>
  );
}

const TONE = {
  info: { icon: Info, cls: 'border-sky-500/40', ic: 'text-sky-300' },
  success: { icon: CheckCircle2, cls: 'border-emerald-500/40', ic: 'text-emerald-300' },
  danger: { icon: TriangleAlert, cls: 'border-blood/60', ic: 'text-rose-300' },
  arcane: { icon: Sparkles, cls: 'border-arcane-500/60', ic: 'text-arcane-300' },
  gold: { icon: Swords, cls: 'border-gold/60', ic: 'text-gold-bright' },
};

/** Avisos rápidos no canto da tela (também lidos por leitores de tela). */
export function Toaster() {
  const list = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,380px)] -translate-x-1/2 flex-col gap-2"
    >
      {list.map((t) => {
        const s = TONE[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            data-testid="toast"
            className={cn(
              'animate-slide-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface/95 p-3 shadow-xl backdrop-blur',
              s.cls,
            )}
          >
            <s.icon className={cn('mt-0.5 size-5 shrink-0', s.ic)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.title}</p>
              {t.body && <p className="text-sm text-ink-muted">{t.body}</p>}
            </div>
            <button
              type="button"
              aria-label="Fechar aviso"
              className="text-ink-faint hover:text-ink"
              onClick={() => dismissToast(t.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
