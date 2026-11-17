/**
 * Ícones do RPG AI — desenhos originais (SVG), estilo Dark Fantasy.
 * Traço dourado/arcano, 24×24. Não reproduzem arte de nenhum livro ou marca.
 */
import * as React from 'react';

type P = { size?: number; className?: string; title?: string };

function Base({
  size = 24,
  className,
  title,
  children,
  accent = '#e6c87f',
}: P & { children: React.ReactNode; accent?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={accent}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// ───────── Recursos ─────────
/** Pontos de Vida: coração com batimento. */
export const IconPV = (p: P) => (
  <Base {...p} accent="#f08a92">
    <path
      d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"
      fill="rgba(180,35,47,.25)"
    />
    <path d="M6.5 12.5h3l1.3-2.6 2 5 1.3-2.4h3.4" />
  </Base>
);
/** Pontos de Esforço: chama. */
export const IconPE = (p: P) => (
  <Base {...p} accent="#e6c87f">
    <path
      d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.6 3-5.4 3.6-9.2 2.2 1.4 3 3.4 2.9 5.1 1.1-.6 1.8-1.8 1.9-3.1 2.4 1.8 3.6 4.4 3.6 7.2 0 3.3-2.4 5.8-6 5.8Z"
      fill="rgba(201,162,75,.2)"
    />
    <path d="M12 21c-1.6 0-2.7-1.1-2.7-2.6 0-1.6 1.3-2.4 1.7-4 1.6 1 2.1 2.2 2.1 3.2.5-.3.9-.8 1-1.4.6.7.9 1.4.9 2.2 0 1.5-1.2 2.6-3 2.6Z" />
  </Base>
);
/** Sanidade: olho dentro de uma espiral. */
export const IconSAN = (p: P) => (
  <Base {...p} accent="#7cc4f0">
    <path
      d="M2.8 12s3.4-5.8 9.2-5.8 9.2 5.8 9.2 5.8-3.4 5.8-9.2 5.8S2.8 12 2.8 12Z"
      fill="rgba(56,140,200,.15)"
    />
    <path d="M12 9.2a2.8 2.8 0 1 1-2.8 2.8 1.6 1.6 0 0 1 1.6-1.6 1.1 1.1 0 0 1 1.1 1.1" />
  </Base>
);

// ───────── Atributos ─────────
/** Agilidade: pena em movimento. */
export const IconAGI = (p: P) => (
  <Base {...p}>
    <path d="M19 4c-6 0-11 4.5-12.5 12L5 20" />
    <path d="M19 4c.5 5.5-3 10.5-10 12" />
    <path d="M10.5 9.5 14 10M8.6 12.6l3.6.4" />
    <path d="M3 9h3M2.5 12.5h2.5" stroke="#9b72f7" />
  </Base>
);
/** Força: punho. */
export const IconFOR = (p: P) => (
  <Base {...p}>
    <path d="M7 10V7.5a1.5 1.5 0 0 1 3 0V10m0-1.5V6.5a1.5 1.5 0 0 1 3 0V10m0-2.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V14c0 4-2.7 6.5-6.5 6.5S7 18 7 15v-1.5" />
    <path d="M7 13.5c-1.6 0-2.5-.9-2.5-2.2S5.5 9.5 7 10h3.5a1.6 1.6 0 0 1 0 3.2H9" />
  </Base>
);
/** Intelecto: livro aberto com runa. */
export const IconINT = (p: P) => (
  <Base {...p}>
    <path d="M3 5.5c3-.8 6-.6 9 1.2v13c-3-1.8-6-2-9-1.2v-13ZM21 5.5c-3-.8-6-.6-9 1.2v13c3-1.8 6-2 9-1.2v-13Z" />
    <path d="M15 10.5l1.5-2 1.5 2-1.5 2-1.5-2Z" stroke="#9b72f7" />
  </Base>
);
/** Presença: estrela de oito pontas. */
export const IconPRE = (p: P) => (
  <Base {...p}>
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8" />
    <circle cx="12" cy="12" r="3.2" fill="rgba(201,162,75,.25)" />
  </Base>
);
/** Vigor: coração dentro de escudo. */
export const IconVIG = (p: P) => (
  <Base {...p}>
    <path d="M12 21s7-3 7-9.5V5.5L12 3 5 5.5v6C5 18 12 21 12 21Z" />
    <path d="M12 15.5s-3-1.8-3-4a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2.2-3 4-3 4Z" stroke="#f08a92" />
  </Base>
);

// ───────── Classes ─────────
/** Combatente: lâminas cruzadas. */
export const IconCombatente = (p: P) => (
  <Base {...p}>
    <path d="M4 4l11 11M20 4 9 15" />
    <path d="M13.5 16.5l3 3M10.5 16.5l-3 3M16 14l-2 2M8 14l2 2" />
    <path d="M4 4h3M4 4v3M20 4h-3M20 4v3" stroke="#9b72f7" />
  </Base>
);
/** Especialista: lupa sobre engrenagem. */
export const IconEspecialista = (p: P) => (
  <Base {...p}>
    <circle cx="10" cy="10" r="5.5" />
    <path d="m14 14 6 6" />
    <path d="M10 6.8v1.4M10 11.8v1.4M6.8 10h1.4M11.8 10h1.4" stroke="#9b72f7" />
    <circle cx="10" cy="10" r="1.6" stroke="#9b72f7" />
  </Base>
);
/** Ocultista: círculo ritual. */
export const IconOcultista = (p: P) => (
  <Base {...p} accent="#b99bff">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5.5" stroke="#e6c87f" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    <path d="m12 8.5 3 5.2H9l3-5.2Z" stroke="#e6c87f" />
  </Base>
);

// ───────── Derivados e mesa ─────────
export const IconDefesa = (p: P) => (
  <Base {...p}>
    <path d="M12 21s7-3 7-9.5V5.5L12 3 5 5.5v6C5 18 12 21 12 21Z" fill="rgba(124,79,240,.18)" />
    <path d="M12 3v18" stroke="#9b72f7" />
  </Base>
);
export const IconDeslocamento = (p: P) => (
  <Base {...p}>
    <path d="M7 4h4v8l6 2.5c1.2.5 2 1.4 2 2.7V19H5V8" />
    <path d="M5 19h14M9.5 15h2M12.5 15.8h2" />
  </Base>
);
export const IconLimitePE = (p: P) => (
  <Base {...p}>
    <path d="M7 3h10M7 21h10M8 3c0 4.5 4 5 4 9s-4 4.5-4 9M16 3c0 4.5-4 5-4 9s4 4.5 4 9" />
    <path d="M10 18.5h4" stroke="#9b72f7" />
  </Base>
);
export const IconD20 = (p: P) => (
  <Base {...p}>
    <path d="M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3L12 2.5Z" />
    <path
      d="M12 2.5 7.5 9.5h9L12 2.5ZM7.5 9.5 3.5 16.7M16.5 9.5l4 7.2M7.5 9.5 12 17l4.5-7.5M12 17v4.5M12 17l-8.5-.3M12 17l8.5-.3"
      strokeWidth={1.2}
    />
  </Base>
);
export const IconInimigo = (p: P) => (
  <Base {...p} accent="#f08a92">
    <path d="M12 3c-4.4 0-7.5 3-7.5 7.2 0 2.5 1.2 4 2.5 5V18h10v-2.8c1.3-1 2.5-2.5 2.5-5C19.5 6 16.4 3 12 3Z" />
    <circle cx="9" cy="11" r="1.6" fill="#f08a92" />
    <circle cx="15" cy="11" r="1.6" fill="#f08a92" />
    <path d="M10 18v3M14 18v3M12 14l-.8 1.6h1.6L12 14Z" />
  </Base>
);
export const IconObjeto = (p: P) => (
  <Base {...p}>
    <path d="M4 10h16v9H4zM4 10c0-3 2-5 5-5h6c3 0 5 2 5 5" />
    <path d="M10.5 12.5h3v2.5h-3z" stroke="#9b72f7" />
  </Base>
);
export const IconNPC = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" />
    <path d="M17.5 4.5l1-1.5M19.5 7h1.5" stroke="#9b72f7" />
  </Base>
);
export const IconPersonagem = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" />
    <path d="m12 14 1 2.2-1 3.8-1-3.8 1-2.2Z" stroke="#9b72f7" />
  </Base>
);
export const IconLivro = (p: P) => (
  <Base {...p}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15ZM5 19.5A1.5 1.5 0 0 0 6.5 21H19" />
    <path d="M12 7.5l2 2.5-2 2.5-2-2.5 2-2.5Z" stroke="#9b72f7" />
  </Base>
);

/** Ícone por chave de regra (atributo, recurso, campo, classe ou tipo de token). */
export const GAME_ICONS: Record<string, (p: P) => React.ReactElement> = {
  pv: IconPV,
  pe: IconPE,
  san: IconSAN,
  AGI: IconAGI,
  FOR: IconFOR,
  INT: IconINT,
  PRE: IconPRE,
  VIG: IconVIG,
  combatente: IconCombatente,
  especialista: IconEspecialista,
  ocultista: IconOcultista,
  defesa: IconDefesa,
  deslocamento: IconDeslocamento,
  limite_pe: IconLimitePE,
  d20: IconD20,
  enemy: IconInimigo,
  object: IconObjeto,
  npc: IconNPC,
  character: IconPersonagem,
  livro: IconLivro,
};

export function GameIcon({ name, ...p }: P & { name: string }) {
  const I = GAME_ICONS[name];
  return I ? <I {...p} /> : null;
}
