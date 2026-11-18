'use client';

import { cn } from '@rpg-ai/ui';
import { HelpCircle, Lightbulb, X } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const KEY = 'rpgai.help';

/** Preferência "ajuda ligada" (padrão: ligada), lembrada neste navegador. */
export function useHelpPreference(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      if (v !== null) setOn(v === '1');
    } catch {
      /* navegação privada: fica só nesta página */
    }
  }, []);
  const set = (v: boolean) => {
    setOn(v);
    try {
      window.localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* idem */
    }
  };
  return [on, set];
}

export const HelpContext = createContext(false);
export const useHelpOn = () => useContext(HelpContext);

/** Botão "Ajuda ligada/desligada". */
export function HelpToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
        on ? 'border-sky-400/50 bg-sky-500/10 text-sky-200' : 'border-line text-ink-muted hover:text-ink',
      )}
    >
      <Lightbulb className="size-3.5" /> Ajuda {on ? 'ligada' : 'desligada'}
    </button>
  );
}

/**
 * "?" ao lado de um termo: toque/clique abre uma explicação curta.
 * Só aparece com a ajuda ligada.
 */
export function HelpDot({ label, text, page }: { label: string; text?: string; page?: number }) {
  const on = useHelpOn();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;
  const ref = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !bubble.current?.contains(t)) setPos(null);
    };
    const hide = () => setPos(null);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open]);
  if (!on || !text) return null;
  return (
    <span ref={ref} className="relative inline-flex align-middle normal-case tracking-normal">
      <button
        type="button"
        // Rótulo genérico de propósito: não pode competir com o rótulo do campo ao lado.
        aria-label="Mais informações"
        title={`O que é ${label}?`}
        data-help={label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) return setPos(null);
          // Balão fixo na tela (fora de listas com rolagem/corte), sem sair da janela.
          const r = e.currentTarget.getBoundingClientRect();
          const width = 272;
          setPos({
            top: r.bottom + 6,
            left: Math.max(8, Math.min(window.innerWidth - width - 8, r.left - width / 2)),
          });
        }}
        className="ml-1 rounded-full text-sky-300/80 transition-colors hover:text-sky-200"
      >
        <HelpCircle className="size-3.5" />
      </button>
      {pos &&
        createPortal(
          <span
            ref={bubble}
            role="tooltip"
            style={{ top: pos.top, left: pos.left, width: 272 }}
            className="fixed z-50 block rounded-lg border border-sky-400/40 bg-surface p-3 text-left text-xs font-normal normal-case tracking-normal text-ink shadow-xl"
            data-testid="help-bubble"
          >
            <b className="mb-1 block text-sky-200">{label}</b>
            {text}
            {page ? <span className="mt-1 block text-ink-faint">Livro, p. {page}</span> : null}
          </span>,
          document.body,
        )}
    </span>
  );
}

/** Caixa do "Ajudante": explica o passo atual e o item em foco. */
export function HelperCard({
  title,
  text,
  page,
  focus,
  onClose,
}: {
  title: string;
  text: string;
  page?: number;
  focus?: { title: string; text: string; page?: number } | null;
  onClose?: () => void;
}) {
  return (
    <aside
      className="space-y-3 rounded-xl border border-sky-400/30 bg-sky-500/[0.06] p-4 text-sm"
      data-testid="helper"
    >
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-sky-300" />
        <p className="flex-1 font-semibold text-sky-100">{title}</p>
        {onClose && (
          <button
            type="button"
            aria-label="Esconder ajudante"
            onClick={onClose}
            className="text-ink-faint hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <p className="leading-relaxed text-ink">{text}</p>
      {page ? <p className="text-xs text-ink-faint">Livro, p. {page}</p> : null}
      {focus && (
        <div className="rounded-lg border border-line bg-surface/80 p-3" data-testid="helper-focus">
          <p className="mb-1 font-semibold text-gold-bright">{focus.title}</p>
          <p className="text-ink">{focus.text}</p>
          {focus.page ? <p className="mt-1 text-xs text-ink-faint">Livro, p. {focus.page}</p> : null}
        </div>
      )}
    </aside>
  );
}
