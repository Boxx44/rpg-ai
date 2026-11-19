'use client';

/**
 * Desenhos dos objetos do mapa, vistos de cima, com luz vindo do alto à esquerda.
 * Feitos à mão em SVG (sem imagens de terceiros). Usam as texturas do mapa
 * (madeira, metal, tecido) quando existem; fora do mapa (ex.: paleta do editor)
 * caem para cores lisas — `url(#x) cor` é o "plano B" do próprio SVG.
 * Cada desenho ocupa uma caixa 0–100 escalada para o tamanho do objeto.
 */
import type { PropKind } from '@rpg-ai/shared';

type State = 'open' | 'closed' | 'on' | 'off' | null;

// Pinturas com plano B
const WOOD = 'url(#tx-plank) #8a5a32';
const WOOD_D = '#3e2614';
const METAL = 'url(#pg-metal) #9aa3ad';
const STEEL = 'url(#tx-metal) #8e959e';
const DARKMETAL = 'url(#pg-darkmetal) #34373d';
const GLASS = 'url(#pg-glass) #8fc6e6';
const FABRIC = 'url(#tx-fabric) #e9e3d6';
const GOLD = 'url(#pg-gold) #d9b45a';
const STONE = 'url(#pg-stone) #8a8680';
const LEAF = 'url(#pg-leaf) #3b8247';
const SHINE = 'url(#pg-shine) rgba(255,255,255,0.12)';

/** Objetos rentes ao chão (não projetam sombra). */
export const FLAT_PROPS: PropKind[] = ['blood', 'ritual', 'trap', 'stairs'];

/** Luz que o objeto emite quando aceso. */
export const PROP_LIGHT: Partial<Record<PropKind, { color: string; radius: number; when: 'on' }>> = {
  torch: { color: '255,170,60', radius: 3, when: 'on' },
  campfire: { color: '255,140,40', radius: 4, when: 'on' },
  lamp: { color: '255,236,170', radius: 4, when: 'on' },
  ritual: { color: '160,100,255', radius: 3, when: 'on' },
  computer: { color: '90,200,255', radius: 1.6, when: 'on' },
  trap: { color: '255,60,60', radius: 1.2, when: 'on' },
};

/** Gradientes compartilhados pelos objetos (vão no <defs> do mapa). */
export function PropDefs() {
  return (
    <>
      <linearGradient id="pg-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e4e8ec" />
        <stop offset="0.45" stopColor="#9aa3ad" />
        <stop offset="1" stopColor="#5d646d" />
      </linearGradient>
      <linearGradient id="pg-darkmetal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5a5f68" />
        <stop offset="1" stopColor="#1d1f23" />
      </linearGradient>
      <linearGradient id="pg-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#d8f1ff" />
        <stop offset="0.5" stopColor="#7cb7d9" />
        <stop offset="1" stopColor="#3d6f8f" />
      </linearGradient>
      <linearGradient id="pg-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff1b8" />
        <stop offset="0.5" stopColor="#d9b45a" />
        <stop offset="1" stopColor="#8a6a22" />
      </linearGradient>
      <radialGradient id="pg-stone" cx="35%" cy="30%" r="80%">
        <stop offset="0" stopColor="#b6b2ac" />
        <stop offset="0.6" stopColor="#7d7973" />
        <stop offset="1" stopColor="#45423e" />
      </radialGradient>
      <radialGradient id="pg-leaf" cx="35%" cy="30%" r="80%">
        <stop offset="0" stopColor="#6fae5a" />
        <stop offset="1" stopColor="#1f4a24" />
      </radialGradient>
      <linearGradient id="pg-shine" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="rgba(255,255,255,0.3)" />
        <stop offset="0.5" stopColor="rgba(255,255,255,0)" />
        <stop offset="1" stopColor="rgba(0,0,0,0.3)" />
      </linearGradient>
      <radialGradient id="pg-flame" cx="50%" cy="65%" r="60%">
        <stop offset="0" stopColor="#fff6c8" />
        <stop offset="0.35" stopColor="#ffd25a" />
        <stop offset="0.75" stopColor="#ff7a1a" />
        <stop offset="1" stopColor="rgba(255,60,0,0)" />
      </radialGradient>
      <radialGradient id="pg-blood" cx="45%" cy="40%" r="70%">
        <stop offset="0" stopColor="#a3121f" />
        <stop offset="0.7" stopColor="#6b0a12" />
        <stop offset="1" stopColor="#3a0408" />
      </radialGradient>
    </>
  );
}

function Flame({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="animate-flicker" style={{ transformOrigin: '50% 100%', transformBox: 'fill-box' }}>
        <ellipse cx="0" cy="0" rx="10" ry="12" fill="url(#pg-flame) #ff9a2a" opacity="0.9" />
        <path d="M0 -12 C6 -5 7 1 4 6 C2 9 -2 9 -4 6 C-7 1 -6 -5 0 -12Z" fill="#ffb02e" />
        <path d="M0 -6 C3 -2 3.5 2 2 4 C1 5.5 -1 5.5 -2 4 C-3.5 2 -3 -2 0 -6Z" fill="#fff3b0" />
      </g>
    </g>
  );
}

/** Placa de madeira com borda escura e brilho (mesas, portas, caixas). */
function Board({ x, y, w, h, r = 2 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={WOOD} stroke={WOOD_D} strokeWidth="1.5" />
      <rect x={x} y={y} width={w} height={h} rx={r} fill={SHINE} />
    </>
  );
}

export function PropArt({ kind, state }: { kind: PropKind; state: State }) {
  const on = state === 'on';
  const open = state === 'open';
  switch (kind) {
    case 'door':
      return (
        <g>
          <rect x="0" y="40" width="12" height="20" rx="1" fill={STONE} stroke="#2b2825" />
          <rect x="88" y="40" width="12" height="20" rx="1" fill={STONE} stroke="#2b2825" />
          {open ? (
            <>
              <rect x="12" y="44" width="76" height="12" fill="#e6c87f" opacity="0.14" />
              <path
                d="M88 50 A 76 76 0 0 0 12 -26"
                fill="none"
                stroke="#e6c87f"
                strokeOpacity="0.25"
                strokeDasharray="3 4"
              />
              <g transform="rotate(-90 12 50)">
                <rect x="15" y="47" width="76" height="12" rx="2" fill="rgba(0,0,0,0.35)" />
                <Board x={12} y={44} w={76} h={12} />
                <circle cx="82" cy="50" r="2.6" fill={GOLD} />
              </g>
              <circle cx="12" cy="50" r="3" fill={METAL} />
            </>
          ) : (
            <g>
              <Board x={12} y={44} w={76} h={12} />
              <line x1="37" y1="45" x2="37" y2="55" stroke={WOOD_D} strokeOpacity="0.6" />
              <line x1="62" y1="45" x2="62" y2="55" stroke={WOOD_D} strokeOpacity="0.6" />
              <circle cx="80" cy="50" r="2.6" fill={GOLD} />
              <circle cx="12" cy="50" r="3" fill={METAL} />
            </g>
          )}
        </g>
      );
    case 'gate':
      return (
        <g>
          <rect x="0" y="42" width="9" height="16" rx="1" fill={STONE} stroke="#2b2825" />
          <rect x="91" y="42" width="9" height="16" rx="1" fill={STONE} stroke="#2b2825" />
          {[0, 1].map((side) => (
            <g key={side} transform={open ? `rotate(${side ? 70 : -70} ${side ? 91 : 9} 50)` : undefined}>
              <rect x={side ? 50 : 9} y="48" width="41" height="4" fill={DARKMETAL} />
              {Array.from({ length: 6 }, (_, i) => (
                <circle
                  key={i}
                  cx={(side ? 53 : 12) + i * 7}
                  cy="50"
                  r="2.2"
                  fill={METAL}
                  stroke="#2a2c30"
                  strokeWidth="0.6"
                />
              ))}
            </g>
          ))}
        </g>
      );
    case 'window':
      return (
        <g>
          <rect x="6" y="42" width="88" height="16" rx="1" fill={STONE} stroke="#2b2825" />
          <rect x="11" y="45" width={open ? 32 : 39} height="10" fill={GLASS} stroke={WOOD_D} />
          <rect x={open ? 57 : 50} y="45" width={open ? 32 : 39} height="10" fill={GLASS} stroke={WOOD_D} />
          <line x1="16" y1="46" x2="24" y2="54" stroke="white" strokeOpacity="0.7" />
          <line x1="56" y1="46" x2="62" y2="54" stroke="white" strokeOpacity="0.5" />
        </g>
      );
    case 'house': {
      // telhado de duas águas visto de cima, com telhas e cumeeira
      const rows = 8;
      return (
        <g>
          <rect x="4" y="6" width="92" height="88" fill="#5e2a1f" />
          {Array.from({ length: rows }, (_, i) => {
            const y = 6 + i * 11;
            return (
              <g key={i}>
                <rect x="4" y={y} width="92" height="11" fill={i < rows / 2 ? '#8a3a28' : '#6e2c1f'} />
                {Array.from({ length: 10 }, (_, j) => (
                  <path
                    key={j}
                    d={`M${4 + j * 9.2 + (i % 2) * 4.6} ${y + 11} q4.6 -4 9.2 0`}
                    fill="none"
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth="1"
                  />
                ))}
              </g>
            );
          })}
          <rect x="4" y="47" width="92" height="6" fill="#3e1810" />
          <rect x="4" y="47" width="92" height="2" fill="rgba(255,220,180,0.25)" />
          <rect x="4" y="53" width="92" height="41" fill="rgba(0,0,0,0.22)" />
          <rect x="70" y="16" width="12" height="14" fill={STONE} stroke="#2b2825" />
          <rect x="72" y="18" width="8" height="10" fill="#1b1916" />
          <circle cx="76" cy="12" r="6" fill="#d8dce0" opacity="0.3" className="animate-pulse-soft" />
        </g>
      );
    }
    case 'stairs':
      return (
        <g>
          {Array.from({ length: 7 }, (_, i) => {
            const k = 0.55 + i * 0.07;
            return (
              <g key={i}>
                <rect
                  x="12"
                  y={6 + i * 13}
                  width="76"
                  height="13"
                  fill={`rgb(${120 * k},${112 * k},${104 * k})`}
                />
                <rect x="12" y={6 + i * 13} width="76" height="2.5" fill="rgba(255,240,220,0.25)" />
                <rect x="12" y={6 + i * 13 + 10.5} width="76" height="2.5" fill="rgba(0,0,0,0.35)" />
              </g>
            );
          })}
          <rect x="8" y="6" width="4" height="91" fill={WOOD_D} />
          <rect x="88" y="6" width="4" height="91" fill={WOOD_D} />
        </g>
      );
    case 'table':
      return (
        <g>
          <Board x={8} y={20} w={84} h={60} r={5} />
          <rect
            x="12"
            y="24"
            width="76"
            height="52"
            rx="3"
            fill="none"
            stroke={WOOD_D}
            strokeOpacity="0.35"
          />
          <circle cx="30" cy="42" r="8" fill="#f1ece2" stroke="#b8b0a2" />
          <circle cx="30" cy="42" r="5" fill="#e3dccd" />
          <circle cx="46" cy="36" r="4" fill="#5b3a22" stroke="#2c1a0e" />
          <circle cx="46" cy="36" r="2.4" fill="#2a160a" />
          <g transform="rotate(-10 68 58)">
            <rect x="58" y="50" width="20" height="15" fill="#f6f1e2" />
            <line x1="61" y1="54" x2="75" y2="54" stroke="#8d8577" strokeWidth="0.8" />
            <line x1="61" y1="57" x2="73" y2="57" stroke="#8d8577" strokeWidth="0.8" />
            <line x1="61" y1="60" x2="70" y2="60" stroke="#8d8577" strokeWidth="0.8" />
          </g>
        </g>
      );
    case 'chair':
      return (
        <g>
          <rect x="24" y="30" width="52" height="48" rx="6" fill={WOOD} stroke={WOOD_D} strokeWidth="1.5" />
          <rect x="30" y="36" width="40" height="36" rx="4" fill="#6b2a33" />
          <rect x="30" y="36" width="40" height="36" rx="4" fill={SHINE} />
          <rect x="22" y="20" width="56" height="12" rx="4" fill={WOOD} stroke={WOOD_D} strokeWidth="1.5" />
        </g>
      );
    case 'bed':
      return (
        <g>
          <rect x="12" y="4" width="76" height="92" rx="4" fill={WOOD} stroke={WOOD_D} strokeWidth="2" />
          <rect x="16" y="9" width="68" height="84" rx="3" fill={FABRIC} />
          <rect x="22" y="13" width="26" height="15" rx="6" fill="#fbf8f2" stroke="#cfc7b6" />
          <rect x="52" y="13" width="26" height="15" rx="6" fill="#fbf8f2" stroke="#cfc7b6" />
          <path d="M16 38 H84 V90 Q84 93 81 93 H19 Q16 93 16 90 Z" fill="#4a3280" />
          <path d="M16 38 H84 V44 H16 Z" fill="#d8cdf6" opacity="0.9" />
          <path d="M16 46 Q50 60 84 50 V90 H16 Z" fill="rgba(0,0,0,0.15)" />
          <rect x="16" y="38" width="68" height="55" fill={SHINE} opacity="0.6" />
        </g>
      );
    case 'sofa':
      return (
        <g>
          <rect x="4" y="24" width="92" height="56" rx="12" fill="#4a1f28" />
          <rect x="4" y="24" width="92" height="16" rx="8" fill="#5e2833" />
          <rect x="4" y="30" width="12" height="48" rx="6" fill="#5e2833" />
          <rect x="84" y="30" width="12" height="48" rx="6" fill="#5e2833" />
          <rect x="17" y="40" width="32" height="34" rx="6" fill="#7c3542" />
          <rect x="51" y="40" width="32" height="34" rx="6" fill="#7c3542" />
          <rect x="4" y="24" width="92" height="56" rx="12" fill={SHINE} />
        </g>
      );
    case 'bookshelf':
      return (
        <g>
          <rect x="6" y="26" width="88" height="48" rx="2" fill={WOOD} stroke={WOOD_D} strokeWidth="2" />
          <rect x="10" y="30" width="80" height="40" fill="#1f140b" />
          {[
            '#7d2626',
            '#2b4f7a',
            '#2f6e47',
            '#7a6a2b',
            '#4f2b7a',
            '#7a4a2b',
            '#2b6f7a',
            '#5e2b4f',
            '#3b3b3b',
          ].map((c, i) => (
            <g key={c}>
              <rect x={11 + i * 8.8} y={i % 3 ? 34 : 32} width="7.2" height={i % 3 ? 34 : 36} fill={c} />
              <rect
                x={11 + i * 8.8}
                y={i % 3 ? 34 : 32}
                width="2"
                height={i % 3 ? 34 : 36}
                fill="rgba(255,255,255,0.18)"
              />
              <rect
                x={11 + i * 8.8}
                y={(i % 3 ? 34 : 32) + 6}
                width="7.2"
                height="1.5"
                fill={GOLD}
                opacity="0.6"
              />
            </g>
          ))}
        </g>
      );
    case 'computer':
      return (
        <g>
          <Board x={6} y={44} w={88} h={44} r={3} />
          <rect x="20" y="14" width="60" height="38" rx="3" fill={DARKMETAL} />
          <rect
            x="24"
            y="18"
            width="52"
            height="29"
            rx="1"
            fill={on ? '#2fb7ec' : '#0b0d11'}
            className={on ? 'animate-pulse-soft' : undefined}
          />
          {on ? (
            <g stroke="#e8fcff" strokeWidth="1.8" opacity="0.85">
              <line x1="28" y1="24" x2="56" y2="24" />
              <line x1="28" y1="30" x2="68" y2="30" />
              <line x1="28" y1="36" x2="48" y2="36" />
            </g>
          ) : (
            <path d="M24 18 L50 18 L24 40 Z" fill="rgba(255,255,255,0.06)" />
          )}
          <rect x="26" y="62" width="40" height="13" rx="2" fill={DARKMETAL} />
          {Array.from({ length: 3 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => (
              <rect
                key={`${r}-${c}`}
                x={28 + c * 4.2}
                y={64 + r * 3.6}
                width="3.2"
                height="2.6"
                rx="0.5"
                fill="#55595f"
              />
            )),
          )}
          <ellipse cx="76" cy="68" rx="5" ry="7" fill={DARKMETAL} />
        </g>
      );
    case 'chest':
      return (
        <g>
          <rect x="14" y="38" width="72" height="44" rx="3" fill={WOOD} stroke={WOOD_D} strokeWidth="2" />
          <rect
            x="14"
            y={open ? 14 : 26}
            width="72"
            height="20"
            rx="8"
            fill={WOOD}
            stroke={WOOD_D}
            strokeWidth="2"
            style={{ transition: 'all .35s ease' }}
          />
          <rect x="14" y={open ? 14 : 26} width="72" height="20" rx="8" fill={SHINE} />
          {[24, 72].map((x) => (
            <rect
              key={x}
              x={x}
              y={open ? 14 : 26}
              width="5"
              height={open ? 68 : 56}
              fill={METAL}
              opacity="0.9"
            />
          ))}
          <rect x="44" y="40" width="12" height="12" rx="2" fill={GOLD} stroke="#6a4f17" />
          <circle cx="50" cy="46" r="1.6" fill="#3a2a0a" />
          {open && (
            <g>
              <ellipse cx="50" cy="40" rx="28" ry="7" fill="#e9bf4e" />
              {[34, 42, 52, 60, 66].map((x, i) => (
                <circle
                  key={x}
                  cx={x}
                  cy={38 + (i % 2) * 3}
                  r="3"
                  fill={GOLD}
                  stroke="#8a6a22"
                  strokeWidth="0.6"
                />
              ))}
              <circle cx="40" cy="36" r="1.8" fill="white" className="animate-pulse-soft" />
              <circle cx="60" cy="35" r="1.4" fill="white" className="animate-pulse-soft" />
            </g>
          )}
        </g>
      );
    case 'crate':
      return (
        <g>
          <Board x={16} y={16} w={68} h={68} r={1} />
          <rect x="16" y="16" width="68" height="68" fill="none" stroke={WOOD_D} strokeWidth="5" />
          <line x1="19" y1="19" x2="81" y2="81" stroke={WOOD_D} strokeWidth="6" />
          <line x1="19" y1="19" x2="81" y2="81" stroke="#9a6a3c" strokeWidth="3.5" />
          {[
            [20, 20],
            [80, 20],
            [20, 80],
            [80, 80],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill={METAL} />
          ))}
        </g>
      );
    case 'barrel':
      return (
        <g>
          <circle cx="50" cy="50" r="33" fill={WOOD} stroke={WOOD_D} strokeWidth="2" />
          <circle cx="50" cy="50" r="33" fill="none" stroke={DARKMETAL} strokeWidth="4" />
          <circle cx="50" cy="50" r="24" fill="none" stroke={DARKMETAL} strokeWidth="3" />
          <circle cx="50" cy="50" r="33" fill={SHINE} />
          <circle cx="58" cy="44" r="4" fill={WOOD_D} />
        </g>
      );
    case 'knife':
    case 'pistol':
    case 'shotgun':
    case 'axe':
      return (
        <g>
          <circle
            cx="50"
            cy="50"
            r="34"
            fill="none"
            stroke="#e6c87f"
            strokeOpacity="0.55"
            strokeWidth="1.5"
            className="animate-pulse-soft"
          />
          <g transform="rotate(-30 50 50)">
            {kind === 'knife' && (
              <>
                <path
                  d="M34 46 L70 46 Q78 49 80 50 Q76 52 70 54 L34 54 Z"
                  fill={STEEL}
                  stroke="#4c5158"
                  strokeWidth="0.8"
                />
                <path d="M34 46 L70 46 Q78 49 80 50 L34 50 Z" fill="rgba(255,255,255,0.35)" />
                <rect x="30" y="44" width="4" height="12" rx="1" fill={DARKMETAL} />
                <rect x="14" y="45.5" width="16" height="9" rx="3" fill={WOOD} stroke={WOOD_D} />
              </>
            )}
            {kind === 'pistol' && (
              <>
                <rect x="30" y="43" width="46" height="9" rx="2" fill={DARKMETAL} />
                <rect x="30" y="43" width="46" height="3" rx="1" fill="rgba(255,255,255,0.2)" />
                <rect x="72" y="45" width="6" height="5" fill={METAL} />
                <rect
                  x="33"
                  y="50"
                  width="13"
                  height="20"
                  rx="3"
                  fill="#2b2420"
                  transform="rotate(14 39 60)"
                />
                <path d="M48 52 q4 6 0 8" fill="none" stroke="#34373d" strokeWidth="2" />
              </>
            )}
            {kind === 'shotgun' && (
              <>
                <rect x="34" y="46" width="52" height="4" rx="1" fill={DARKMETAL} />
                <rect x="34" y="50" width="48" height="4" rx="1" fill={DARKMETAL} />
                <rect x="34" y="46" width="52" height="1.5" fill="rgba(255,255,255,0.25)" />
                <rect x="44" y="53" width="18" height="5" rx="2" fill={WOOD} />
                <path d="M8 50 Q10 44 22 45 L36 46 L36 54 L22 57 Q10 58 8 52 Z" fill={WOOD} stroke={WOOD_D} />
              </>
            )}
            {kind === 'axe' && (
              <>
                <rect x="16" y="47" width="64" height="6" rx="3" fill={WOOD} stroke={WOOD_D} />
                <path d="M62 34 Q80 36 84 50 Q80 64 62 66 Q66 50 62 34 Z" fill={STEEL} stroke="#4c5158" />
                <path d="M62 34 Q80 36 84 50 L66 50 Q66 42 62 34 Z" fill="rgba(255,255,255,0.3)" />
              </>
            )}
          </g>
        </g>
      );
    case 'torch':
      return (
        <g>
          <rect x="36" y="22" width="28" height="10" rx="2" fill={DARKMETAL} />
          <rect x="46" y="30" width="8" height="52" rx="2" fill={WOOD} stroke={WOOD_D} />
          <rect x="43" y="28" width="14" height="10" rx="2" fill={DARKMETAL} />
          {on ? <Flame x={50} y={22} s={1.2} /> : <circle cx="50" cy="26" r="5" fill="#2a2420" />}
        </g>
      );
    case 'campfire':
      return (
        <g>
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i * 2 * Math.PI) / 9;
            return (
              <ellipse
                key={i}
                cx={50 + 30 * Math.cos(a)}
                cy={52 + 30 * Math.sin(a)}
                rx="7"
                ry="6"
                fill={STONE}
                stroke="#2b2825"
                strokeWidth="0.8"
              />
            );
          })}
          <circle cx="50" cy="52" r="23" fill="#1c1714" />
          {[0, 60, 120].map((a) => (
            <rect
              key={a}
              x="30"
              y="48"
              width="40"
              height="8"
              rx="4"
              fill={WOOD}
              stroke={WOOD_D}
              transform={`rotate(${a} 50 52)`}
            />
          ))}
          {on ? (
            <>
              <circle cx="50" cy="52" r="16" fill="#ff7a1a" opacity="0.35" className="animate-pulse-soft" />
              <Flame x={44} y={50} s={1.1} />
              <Flame x={57} y={53} s={0.95} />
              <Flame x={50} y={44} s={1.35} />
            </>
          ) : (
            <circle cx="50" cy="52" r="9" fill="#4a4441" opacity="0.8" />
          )}
        </g>
      );
    case 'lamp':
      return (
        <g>
          <circle cx="50" cy="50" r="13" fill={DARKMETAL} />
          <circle
            cx="50"
            cy="50"
            r="9"
            fill={on ? '#fff6d0' : '#4a4f57'}
            className={on ? 'animate-pulse-soft' : undefined}
          />
          {on && <circle cx="50" cy="50" r="16" fill="#fff1b0" opacity="0.25" />}
          <circle cx="46" cy="46" r="3" fill="rgba(255,255,255,0.5)" />
        </g>
      );
    case 'ritual':
      return (
        <g>
          <circle
            cx="50"
            cy="50"
            r="45"
            fill={on ? 'rgba(120,70,220,0.12)' : 'none'}
            stroke={on ? '#b48cff' : '#5e4d7f'}
            strokeWidth="2.5"
          />
          <g
            className={on ? 'animate-spin-slow' : undefined}
            style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
          >
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke={on ? '#d6c4ff' : '#4a3d66'}
              strokeDasharray="5 4"
            />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * Math.PI) / 6;
              return (
                <circle
                  key={i}
                  cx={50 + 41.5 * Math.cos(a)}
                  cy={50 + 41.5 * Math.sin(a)}
                  r="1.6"
                  fill={on ? '#e9ddff' : '#5e4d7f'}
                />
              );
            })}
          </g>
          <polygon
            points={Array.from({ length: 5 }, (_, i) => {
              const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
              return `${50 + 32 * Math.cos(a)},${50 + 32 * Math.sin(a)}`;
            }).join(' ')}
            fill="none"
            stroke={on ? '#c7a6ff' : '#4a3d66'}
            strokeWidth="2"
          />
          {Array.from({ length: 5 }, (_, i) => {
            const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
            const x = 50 + 32 * Math.cos(a);
            const y = 50 + 32 * Math.sin(a);
            return (
              <g key={i}>
                {/* velas */}
                <circle cx={x} cy={y} r="3.4" fill="#e8e2d2" stroke="#9b9384" strokeWidth="0.6" />
                {on && <circle cx={x} cy={y - 2} r="1.8" fill="#ffd25a" className="animate-flicker" />}
              </g>
            );
          })}
        </g>
      );
    case 'blood':
      return (
        <g>
          <path
            d="M50 28 C68 26 76 42 68 55 C61 66 44 70 33 60 C22 49 31 30 50 28Z"
            fill="url(#pg-blood) #7a0d16"
          />
          <path
            d="M44 36 C52 33 58 38 54 42"
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {[
            [78, 33, 4],
            [22, 67, 5],
            [72, 72, 3],
            [28, 28, 2.5],
            [84, 52, 2],
          ].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#6b0a12" />
          ))}
        </g>
      );
    case 'grave':
      return (
        <g>
          <rect x="22" y="56" width="56" height="38" rx="4" fill="url(#tx-dirt) #4a3a2a" />
          <rect x="22" y="56" width="56" height="38" rx="4" fill="rgba(0,0,0,0.15)" />
          <path d="M30 60 L30 24 C30 8 70 8 70 24 L70 60 Z" fill={STONE} stroke="#3a3733" strokeWidth="1.5" />
          <path d="M30 60 L30 24 C30 8 50 8 50 12 L36 60 Z" fill="rgba(255,255,255,0.12)" />
          <rect x="47" y="22" width="6" height="26" fill="#55514b" />
          <rect x="40" y="29" width="20" height="6" fill="#55514b" />
          <path d="M30 60 q6 -4 10 0 q6 -6 12 0" fill="none" stroke="#3b6e3a" strokeWidth="2" />
        </g>
      );
    case 'body':
      return (
        <g>
          <ellipse cx="50" cy="54" rx="30" ry="40" fill="rgba(0,0,0,0.2)" />
          {/* corpo coberto por um lençol */}
          <path
            d="M36 14 Q50 6 64 14 L70 40 Q74 70 66 92 L34 92 Q26 70 30 40 Z"
            fill={FABRIC}
            stroke="#b8b0a2"
          />
          <circle cx="50" cy="20" r="10" fill="rgba(0,0,0,0.12)" />
          <path
            d="M38 40 Q50 46 62 40 M36 64 Q50 70 64 64"
            fill="none"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="2"
          />
          <path
            d="M60 70 C66 72 68 78 64 82"
            fill="none"
            stroke="#8a1520"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.8"
          />
        </g>
      );
    case 'trap':
      return (
        <g>
          <circle cx="50" cy="50" r="30" fill={DARKMETAL} stroke="#202226" strokeWidth="2" />
          <circle cx="50" cy="50" r="22" fill="none" stroke={METAL} strokeWidth="2" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            const x = 50 + 21 * Math.cos(a);
            const y = 50 + 21 * Math.sin(a);
            return (
              <polygon
                key={i}
                points={`${x},${y} ${50 + 12 * Math.cos(a + 0.18)},${50 + 12 * Math.sin(a + 0.18)} ${50 + 12 * Math.cos(a - 0.18)},${50 + 12 * Math.sin(a - 0.18)}`}
                fill={STEEL}
              />
            );
          })}
          <circle cx="50" cy="50" r="6" fill={METAL} />
          {on && <circle cx="50" cy="50" r="3" fill="#ff4a4a" className="animate-pulse-soft" />}
        </g>
      );
    case 'car':
      return (
        <g>
          <rect
            x="4"
            y="22"
            width="92"
            height="56"
            rx="16"
            fill="#163d6e"
            stroke="#0b2240"
            strokeWidth="1.5"
          />
          <rect x="4" y="22" width="92" height="56" rx="16" fill={SHINE} />
          <rect x="62" y="28" width="28" height="44" rx="8" fill="#1d4f8e" />
          <rect x="30" y="30" width="34" height="40" rx="6" fill="#123257" />
          <rect x="22" y="29" width="10" height="42" rx="3" fill={GLASS} />
          <rect x="62" y="30" width="7" height="40" rx="2" fill={GLASS} opacity="0.85" />
          <rect x="8" y="30" width="12" height="40" rx="5" fill="#1d4f8e" />
          <rect x="91" y="28" width="4" height="9" rx="1.5" fill="#fff6c4" />
          <rect x="91" y="63" width="4" height="9" rx="1.5" fill="#fff6c4" />
          <rect x="4" y="28" width="3" height="9" fill="#ff4d4d" />
          <rect x="4" y="63" width="3" height="9" fill="#ff4d4d" />
          <rect x="50" y="18" width="7" height="5" rx="1" fill="#0b2240" />
          <rect x="50" y="77" width="7" height="5" rx="1" fill="#0b2240" />
        </g>
      );
    case 'bush':
      return (
        <g>
          {[
            [42, 46, 20],
            [62, 44, 18],
            [52, 60, 21],
            [34, 60, 15],
            [68, 61, 15],
            [52, 36, 13],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={LEAF} stroke="#183a1c" strokeWidth="0.8" />
          ))}
          {[
            [40, 40],
            [60, 50],
            [48, 58],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill="#b33a3a" />
          ))}
        </g>
      );
    case 'boulder':
      return (
        <g>
          <polygon
            points="18,62 26,30 54,18 80,32 84,64 62,84 30,82"
            fill={STONE}
            stroke="#3a3733"
            strokeWidth="2"
          />
          <polygon points="30,34 54,22 64,38 40,46" fill="rgba(255,255,255,0.18)" />
          <path
            d="M44 48 L56 58 L52 70 M60 40 L70 52"
            fill="none"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="1.5"
          />
          <path d="M22 64 q8 -4 14 2" fill="none" stroke="#4e7d3d" strokeWidth="2.5" />
        </g>
      );
    default:
      return <circle cx="50" cy="50" r="30" fill="#666" />;
  }
}
