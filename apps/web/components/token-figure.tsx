'use client';

/**
 * Tokens em 2D: bonecos desenhados em pé sobre uma base, como miniaturas de papel.
 * Tudo é SVG feito aqui (sem imagens de terceiros). A aparência (pele, cabelo, roupa)
 * sai de um "sorteio" fixo pelo id do token, então o mesmo token tem sempre o mesmo visual.
 * Desenho numa caixa 0–100 (a base fica no chão da casa; a cabeça sobe um pouco acima).
 */
import { type Appearance, randomAppearance, type TokenDto } from '@rpg-ai/shared';
import { AvatarFigure } from './avatar-figure';

export type FigureRole = 'combatente' | 'especialista' | 'ocultista' | null;
export type FigureGear = 'melee' | 'ranged' | null;

const SKINS = ['#f2d0b1', '#e0ac85', '#c68863', '#9a6646', '#6e4630', '#f5dccb'];
const HAIRS = ['#1f1612', '#4a2e1a', '#7a4a24', '#c48a3a', '#d9c7a4', '#8c2f1e', '#2e2e3a', '#e8e4dc'];
const PANTS = ['#2b3442', '#3a2f28', '#1f2a24', '#3b3b44', '#4a3b2a'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = <T,>(arr: T[], h: number, salt: number) =>
  arr[(((h >>> salt) ^ (h * (salt + 1))) % arr.length) >>> 0]!;

function darker(hex: string, k = 0.7) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

type EnemyLook = 'zombie' | 'shadow' | 'beast' | 'cultist' | 'thug';
function enemyLook(label: string, h: number): EnemyLook {
  const l = label.toLowerCase();
  if (/zumbi|morto|cad[aá]ver|carni/.test(l)) return 'zombie';
  if (/sombra|espectro|fantasma|vulto|assombra|medo/.test(l)) return 'shadow';
  if (/c[aã]o|lobo|besta|fera|animal|criatura|aberra/.test(l)) return 'beast';
  if (/cultista|seita|sacerdote|ocultista|encapuz/.test(l)) return 'cultist';
  if (/policial|bandido|capanga|segurança|soldado|mercen|guarda|assaltante/.test(l)) return 'thug';
  return pick(['zombie', 'shadow', 'beast', 'cultist', 'thug'] as EnemyLook[], h, 3);
}

// ───────────── partes do corpo ─────────────
function Head({
  skin,
  hair,
  style,
  eyes = '#1b1410',
  hurt,
}: {
  skin: string;
  hair: string;
  style: number;
  eyes?: string;
  hurt?: boolean;
}) {
  return (
    <g>
      {/* cabelo de trás (longo) */}
      {style === 1 && <path d="M32 22 Q32 48 38 52 L62 52 Q68 48 68 22 Z" fill={hair} />}
      <circle cx="35" cy="26" r="4" fill={skin} />
      <circle cx="65" cy="26" r="4" fill={skin} />
      <circle cx="50" cy="24" r="16" fill={skin} />
      <circle cx="50" cy="24" r="16" fill="url(#fg-face)" />
      {/* olhos e boca */}
      {hurt ? (
        <g stroke={eyes} strokeWidth="1.6" strokeLinecap="round">
          <path d="M41 23 l4 4 M45 23 l-4 4 M55 23 l4 4 M59 23 l-4 4" />
        </g>
      ) : (
        <g>
          <ellipse cx="43.5" cy="25.5" rx="2.2" ry="2.8" fill={eyes} />
          <ellipse cx="56.5" cy="25.5" rx="2.2" ry="2.8" fill={eyes} />
          <circle cx="44.3" cy="24.5" r="0.8" fill="white" />
          <circle cx="57.3" cy="24.5" r="0.8" fill="white" />
        </g>
      )}
      <path
        d="M46.5 32 Q50 34 53.5 32"
        fill="none"
        stroke="#7a3d2e"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <ellipse cx="40" cy="30" rx="2.5" ry="1.4" fill="#e88a7a" opacity="0.35" />
      <ellipse cx="60" cy="30" rx="2.5" ry="1.4" fill="#e88a7a" opacity="0.35" />
      {/* cabelo da frente */}
      {style === 0 && <path d="M34 22 Q36 6 50 6 Q64 6 66 22 Q60 14 50 15 Q40 14 34 22 Z" fill={hair} />}
      {style === 1 && <path d="M33 26 Q34 6 50 6 Q66 6 67 26 Q62 12 50 13 Q40 12 36 20 Z" fill={hair} />}
      {style === 2 && (
        <>
          <path d="M34 22 Q36 6 50 6 Q64 6 66 22 Q58 12 50 13 Q42 12 34 22 Z" fill={hair} />
          <circle cx="50" cy="5" r="6" fill={hair} />
        </>
      )}
      {style === 3 && (
        <path
          d="M34 22 L36 10 L41 13 L44 5 L49 11 L54 4 L57 11 L62 6 L64 14 L66 22 Q58 15 50 15 Q42 15 34 22 Z"
          fill={hair}
        />
      )}
      {style === 4 && (
        <>
          {/* boné */}
          <path d="M34 20 Q35 7 50 7 Q65 7 66 20 Z" fill={hair} />
          <path
            d="M50 18 Q66 16 72 21 Q62 22 50 21 Z"
            fill={darker(hair.startsWith('#') ? hair : '#333333', 0.7)}
          />
        </>
      )}
      {style === 5 && (
        <>
          {/* careca com barba */}
          <path d="M37 30 Q40 42 50 42 Q60 42 63 30 Q60 36 50 36 Q40 36 37 30 Z" fill={hair} />
          <ellipse cx="45" cy="12" rx="5" ry="2" fill="white" opacity="0.25" />
        </>
      )}
    </g>
  );
}

function Body({ shirt, pants, skin, coat }: { shirt: string; pants: string; skin: string; coat?: string }) {
  return (
    <g>
      {/* pernas e sapatos */}
      <rect x="40" y="62" width="8" height="20" rx="3" fill={pants} />
      <rect x="52" y="62" width="8" height="20" rx="3" fill={pants} />
      <ellipse cx="44" cy="83" rx="6" ry="3" fill="#1b1612" />
      <ellipse cx="56" cy="83" rx="6" ry="3" fill="#1b1612" />
      {/* braços */}
      <rect x="28" y="42" width="8" height="22" rx="4" fill={coat ?? shirt} />
      <rect x="64" y="42" width="8" height="22" rx="4" fill={coat ?? shirt} />
      <circle cx="32" cy="65" r="4" fill={skin} />
      <circle cx="68" cy="65" r="4" fill={skin} />
      {/* tronco */}
      <rect x="35" y="39" width="30" height="27" rx="8" fill={shirt} />
      {coat && (
        <>
          <path d="M35 47 Q35 39 43 39 L46 39 L46 70 L35 70 Z" fill={coat} />
          <path d="M65 47 Q65 39 57 39 L54 39 L54 70 L65 70 Z" fill={coat} />
        </>
      )}
      <rect x="35" y="39" width="30" height="27" rx="8" fill="url(#fg-cloth)" />
      <rect x="35" y="62" width="30" height="3" fill="rgba(0,0,0,0.35)" />
    </g>
  );
}

function Gear({ role, gear, color }: { role: FigureRole; gear: FigureGear; color: string }) {
  const g = gear ?? (role === 'combatente' ? 'melee' : null);
  return (
    <g>
      {role === 'especialista' && (
        <>
          {/* mochila e lanterna */}
          <path d="M37 41 L46 64" stroke="#3a2a1a" strokeWidth="2.5" />
          <path d="M63 41 L54 64" stroke="#3a2a1a" strokeWidth="2.5" />
          <rect x="66" y="58" width="5" height="10" rx="1.5" fill="#2b2e33" />
          <circle cx="68.5" cy="57" r="2.5" fill="#fff6c4" />
        </>
      )}
      {role === 'ocultista' && (
        <>
          {/* livro brilhando e símbolo */}
          <circle cx="32" cy="64" r="9" fill="#a46bff" opacity="0.25" className="animate-pulse-soft" />
          <rect
            x="25"
            y="58"
            width="13"
            height="10"
            rx="1"
            fill="#3a1f5c"
            stroke="#d6c4ff"
            strokeWidth="0.8"
          />
          <line x1="31.5" y1="58" x2="31.5" y2="68" stroke="#d6c4ff" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="3" fill="none" stroke="#d6c4ff" strokeWidth="1" />
        </>
      )}
      {role === 'combatente' && <path d="M37 44 L63 44 L63 56 L37 56 Z" fill="rgba(30,34,30,0.55)" />}
      {g === 'melee' && (
        <g transform="rotate(25 69 64)">
          <rect x="67.5" y="40" width="3" height="26" rx="1" fill="url(#pg-metal) #b8bfc8" />
          <rect x="64" y="64" width="10" height="2.5" rx="1" fill="#5a3a1f" />
          <rect x="67.5" y="66" width="3" height="7" rx="1" fill="#3a2414" />
        </g>
      )}
      {g === 'ranged' && (
        <g transform="rotate(-20 68 64)">
          <rect x="64" y="60" width="18" height="4" rx="1" fill="#25272b" />
          <rect x="65" y="63" width="4" height="7" rx="1" fill="#25272b" />
        </g>
      )}
      {!role && !g && <rect x="47" y="44" width="6" height="18" fill={darker(color, 0.75)} opacity="0.6" />}
    </g>
  );
}

function Enemy({ look, color }: { look: EnemyLook; color: string }) {
  switch (look) {
    case 'zombie':
      return (
        <g>
          <Body shirt="#4f5a3a" pants="#3a3428" skin="#8fae7a" />
          {/* braços esticados para frente */}
          <rect x="26" y="44" width="10" height="6" rx="3" fill="#8fae7a" transform="rotate(-25 31 47)" />
          <rect x="64" y="44" width="10" height="6" rx="3" fill="#8fae7a" transform="rotate(25 69 47)" />
          <path d="M38 50 l5 4 l-3 3 M58 58 l4 -3" stroke="#2a2a1a" strokeWidth="1.5" fill="none" />
          <Head skin="#9dbb84" hair="#3a3a2a" style={0} eyes="#d9e86a" />
          <path d="M44 33 L56 33" stroke="#5a1a1a" strokeWidth="2" />
          <circle cx="58" cy="18" r="2.5" fill="#6b0a12" />
        </g>
      );
    case 'shadow':
      return (
        <g className="animate-pulse-soft">
          <path
            d="M50 4 Q72 10 70 40 Q72 66 78 86 Q64 80 58 88 Q52 80 46 88 Q40 80 22 86 Q28 66 30 40 Q28 10 50 4 Z"
            fill="#0d0a14"
          />
          <path
            d="M50 4 Q72 10 70 40 Q72 66 78 86"
            fill="none"
            stroke={color}
            strokeOpacity="0.6"
            strokeWidth="1.5"
          />
          <ellipse cx="43" cy="24" rx="3.5" ry="2" fill="#ff3b3b" />
          <ellipse cx="57" cy="24" rx="3.5" ry="2" fill="#ff3b3b" />
          <ellipse cx="43" cy="24" rx="6" ry="4" fill="#ff3b3b" opacity="0.25" />
          <ellipse cx="57" cy="24" rx="6" ry="4" fill="#ff3b3b" opacity="0.25" />
        </g>
      );
    case 'beast':
      return (
        <g>
          {/* fera de quatro patas, vista de lado */}
          <rect x="22" y="66" width="7" height="18" rx="3" fill="#2a2420" />
          <rect x="34" y="68" width="7" height="16" rx="3" fill="#2a2420" />
          <rect x="60" y="68" width="7" height="16" rx="3" fill="#2a2420" />
          <rect x="70" y="66" width="7" height="18" rx="3" fill="#2a2420" />
          <ellipse cx="50" cy="60" rx="32" ry="15" fill="#3d332c" />
          <path d="M20 54 Q10 44 14 36" stroke="#3d332c" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M26 48 L30 40 L34 48 L38 40 L42 48 L46 40 L50 48 L54 40 L58 48" fill="#2a2420" />
          <ellipse cx="78" cy="46" rx="14" ry="11" fill="#3d332c" />
          <path d="M70 36 L73 26 L78 36 Z M80 35 L85 25 L87 37 Z" fill="#2a2420" />
          <path d="M84 52 L94 50 L86 56 Z" fill="#e8e2d2" />
          <circle cx="82" cy="43" r="2.6" fill="#ffcf3b" />
          <circle cx="82" cy="43" r="1" fill="#1a0f0a" />
          <ellipse cx="50" cy="60" rx="32" ry="15" fill="url(#fg-cloth)" />
          <path d="M40 58 l8 4" stroke={color} strokeWidth="2" opacity="0.7" />
        </g>
      );
    case 'cultist':
      return (
        <g>
          <path d="M30 40 Q50 30 70 40 L76 84 L24 84 Z" fill="#2a1420" />
          <path d="M30 40 Q50 30 70 40 L76 84 L24 84 Z" fill="url(#fg-cloth)" />
          <path d="M47 42 L53 42 L55 84 L45 84 Z" fill={color} opacity="0.75" />
          <path d="M32 26 Q32 4 50 4 Q68 4 68 26 Q68 44 50 44 Q32 44 32 26 Z" fill="#2a1420" />
          <path d="M38 24 Q38 12 50 12 Q62 12 62 24 Q62 36 50 38 Q38 36 38 24 Z" fill="#e8e2d2" />
          <path d="M42 22 L47 24 L42 26 Z M58 22 L53 24 L58 26 Z" fill="#1a0a0a" />
          <path d="M44 32 Q50 30 56 32" stroke="#6b0a12" strokeWidth="1.4" fill="none" />
          <circle cx="66" cy="62" r="4" fill="#ffd25a" opacity="0.8" className="animate-flicker" />
        </g>
      );
    case 'thug':
      return (
        <g>
          <Body shirt="#2b2b30" pants="#1f2430" skin="#c68863" coat="#3a3a40" />
          <g transform="rotate(30 68 62)">
            <rect x="66" y="38" width="4" height="28" rx="2" fill="#6a4a2a" />
          </g>
          <circle cx="50" cy="24" r="16" fill="#1c1c20" />
          <rect x="38" y="20" width="24" height="8" rx="4" fill="#c68863" />
          <circle cx="44" cy="24" r="2" fill="#1b1410" />
          <circle cx="56" cy="24" r="2" fill="#1b1410" />
        </g>
      );
  }
}

/** Boneco 2D de um token (personagem, NPC ou inimigo). */
/** Aparência do boneco: a escolhida na ficha ou uma sorteada (fixa) com o equipamento da classe. */
function figureAppearance(
  token: TokenDto,
  role: FigureRole,
  gear: FigureGear,
  chosen?: Appearance | null,
): Appearance | null {
  if (chosen) return chosen;
  const seed = token.id + token.label;
  if (token.kind === 'enemy') {
    const look = enemyLook(token.label, hash(seed));
    if (look === 'zombie')
      return randomAppearance(seed, {
        skin: '#8fae7a',
        eyes: '#d9e86a',
        top: { style: 'camiseta', color: '#4f5a3a', accent: '#5a1a22' },
        bottom: { style: 'calca', color: '#3a3428' },
        shoes: { style: 'descalco', color: '#3a3428' },
        accessories: ['cicatriz'],
        held: 'nenhum',
      });
    if (look === 'cultist')
      return randomAppearance(seed, {
        top: { style: 'manto', color: '#2a1420', accent: '#8c1f2b' },
        accessories: ['caveira'],
        held: 'faca',
        hood: true,
      });
    if (look === 'thug')
      return randomAppearance(seed, {
        top: { style: 'jaqueta', color: '#5a1a22', accent: '#121116' },
        bottom: { style: 'calca', color: '#121116' },
        accessories: ['caveira', 'luvas'],
        held: 'taco',
      });
    return null; // sombra e fera continuam com desenho próprio
  }
  const held =
    token.kind === 'npc'
      ? 'nenhum'
      : gear === 'ranged'
        ? 'pistola'
        : gear === 'melee'
          ? 'taco'
          : role === 'ocultista'
            ? 'livro'
            : role === 'especialista'
              ? 'lanterna'
              : role === 'combatente'
                ? 'faca'
                : 'nenhum';
  const base = randomAppearance(seed, { held });
  return { ...base, top: { ...base.top, color: token.kind === 'npc' ? base.top.color : token.color } };
}

export function TokenFigure({
  token,
  portrait,
  portraitCutout,
  appearance,
  role,
  gear,
  down,
  selected,
  turn,
  hpPct,
}: {
  token: TokenDto;
  /** A imagem enviada tem fundo transparente: vira figura recortada em pé (sem cartão). */
  portraitCutout?: boolean;
  /** Aparência escolhida na ficha (cabelo, corpo, roupas). */
  appearance?: Appearance | null;
  /** Endereço da imagem enviada: vira um "cartão" em pé sobre a base. */
  portrait?: string;
  role?: FigureRole;
  gear?: FigureGear;
  down?: boolean;
  selected?: boolean;
  turn?: boolean;
  /** 0..1 quando quem olha pode ver a vida. */
  hpPct?: number | null;
}) {
  const h = hash(token.id + token.label);
  const skin = pick(SKINS, h, 1);
  const hair = pick(HAIRS, h, 5);
  const style = h % 6;
  const pants = pick(PANTS, h, 9);
  const rim = token.kind === 'enemy' ? '#b4232f' : token.kind === 'npc' ? '#c9a24b' : '#7c4ff0';
  const av = !portrait ? figureAppearance(token, role ?? null, gear ?? null, appearance) : null;
  const figure =
    portrait && portraitCutout ? (
      // arte recortada (fundo transparente): a própria figura em pé, respirando
      <g
        className={down ? undefined : 'animate-breathe'}
        style={{
          transformOrigin: '50px 90px',
          transformBox: 'view-box',
          ...(down ? { filter: 'grayscale(1) brightness(0.7)' } : {}),
        }}
        transform={down ? 'rotate(-80 50 84) translate(-6 6)' : undefined}
      >
        <image
          href={portrait}
          x="-5"
          y="-38"
          width="110"
          height="128"
          preserveAspectRatio="xMidYMax meet"
          data-testid="token-image"
          data-cutout="true"
        />
      </g>
    ) : portrait ? (
      // retrato enviado: cartão em pé, com moldura
      <g>
        <rect x="22" y="4" width="56" height="72" rx="6" fill="#120f18" stroke={rim} strokeWidth="2.5" />
        <clipPath id={`fig-clip-${token.id}`}>
          <rect x="25" y="7" width="50" height="66" rx="4" />
        </clipPath>
        <image
          href={portrait}
          x="25"
          y="7"
          width="50"
          height="66"
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#fig-clip-${token.id})`}
          data-testid="token-image"
        />
        <rect x="25" y="7" width="50" height="66" rx="4" fill="url(#fg-card)" />
        <rect x="44" y="76" width="12" height="8" fill="#2a2430" />
      </g>
    ) : av ? (
      // boneco ilustrado visto de cima (pés na base)
      <g transform="translate(50 92) scale(1.2) translate(-50 -151)">
        <AvatarFigure a={av} down={down} />
      </g>
    ) : token.kind === 'enemy' ? (
      <Enemy look={enemyLook(token.label, h)} color={token.color} />
    ) : (
      <g>
        <Body
          shirt={token.color}
          pants={pants}
          skin={skin}
          coat={token.kind === 'npc' ? pick(['#5a4636', '#3a4a5a', '#4a3a4a', '#6a5a3a'], h, 7) : undefined}
        />
        <Gear role={token.kind === 'npc' ? null : (role ?? null)} gear={gear ?? null} color={token.color} />
        <Head skin={skin} hair={hair} style={style} hurt={down} />
        {token.kind === 'npc' && h % 3 === 0 && (
          <g fill="none" stroke="#1b1612" strokeWidth="1.2">
            <circle cx="43.5" cy="25.5" r="4" />
            <circle cx="56.5" cy="25.5" r="4" />
            <path d="M47.5 25.5 L52.5 25.5" />
          </g>
        )}
      </g>
    );
  return (
    <g
      data-figure={
        portrait ? (portraitCutout ? 'cutout' : 'card') : av ? 'avatar' : enemyLook(token.label, h)
      }
    >
      {/* base no chão */}
      <ellipse cx="50" cy="88" rx="36" ry="11" fill="rgba(0,0,0,0.5)" transform="translate(4 4)" />
      <ellipse
        cx="50"
        cy="88"
        rx="34"
        ry="10"
        fill="#17131d"
        stroke={selected ? '#e6c87f' : rim}
        strokeWidth={selected ? 3.5 : 2.5}
      />
      <ellipse cx="50" cy="86.5" rx="30" ry="7" fill="url(#fg-base)" />
      {turn && (
        <ellipse
          cx="50"
          cy="88"
          rx="40"
          ry="13"
          fill="none"
          stroke="#e6c87f"
          strokeWidth="3"
          className="animate-ring-pulse"
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />
      )}
      {/* boneco: respira de leve; caído = deitado e sem cor */}
      {av || portraitCutout ? (
        figure
      ) : (
        <g
          transform={down ? 'rotate(-80 50 84) translate(-6 6)' : undefined}
          style={down ? { filter: 'grayscale(1) brightness(0.7)' } : undefined}
        >
          {/* em pé, mais alto que a casa (como uma miniatura), com os pés na base */}
          <g transform="translate(50 86) scale(1.35) translate(-50 -86)">
            <g
              className={down ? undefined : 'animate-bob'}
              style={{ transformOrigin: '50% 100%', transformBox: 'fill-box' }}
            >
              {figure}
            </g>
          </g>
        </g>
      )}
      {/* barra de vida na frente da base */}
      {hpPct !== null && hpPct !== undefined && (
        <g data-testid="hp-bar">
          <rect x="28" y="95" width="44" height="5" rx="2.5" fill="rgba(0,0,0,0.7)" />
          <rect
            x="28.5"
            y="95.5"
            width={43 * hpPct}
            height="4"
            rx="2"
            fill={hpPct > 0.5 ? '#22c55e' : hpPct > 0 ? '#f59e0b' : '#b4232f'}
            style={{ transition: 'width .5s ease' }}
          />
        </g>
      )}
    </g>
  );
}

/** Gradientes usados pelos bonecos (vão no <defs> do mapa). */
export function FigureDefs() {
  return (
    <>
      <radialGradient id="fg-face" cx="38%" cy="30%" r="75%">
        <stop offset="0" stopColor="rgba(255,255,255,0.25)" />
        <stop offset="0.6" stopColor="rgba(255,255,255,0)" />
        <stop offset="1" stopColor="rgba(0,0,0,0.25)" />
      </radialGradient>
      <linearGradient id="fg-cloth" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="rgba(255,255,255,0.18)" />
        <stop offset="0.5" stopColor="rgba(255,255,255,0)" />
        <stop offset="1" stopColor="rgba(0,0,0,0.3)" />
      </linearGradient>
      <linearGradient id="fg-card" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="rgba(255,255,255,0.18)" />
        <stop offset="0.4" stopColor="rgba(255,255,255,0)" />
        <stop offset="1" stopColor="rgba(0,0,0,0.35)" />
      </linearGradient>
      <radialGradient id="fg-base" cx="40%" cy="30%" r="80%">
        <stop offset="0" stopColor="rgba(255,255,255,0.18)" />
        <stop offset="1" stopColor="rgba(255,255,255,0)" />
      </radialGradient>
    </>
  );
}
