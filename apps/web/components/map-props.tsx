'use client';

/**
 * Desenhos dos objetos do mapa (SVG feito à mão, sem imagens de terceiros).
 * Cada desenho ocupa uma caixa 0–100 que é escalada para o tamanho do objeto.
 * Animações usam classes CSS do tema, então respeitam "menos movimento".
 */
import type { PropKind } from '@rpg-ai/shared';

type State = 'open' | 'closed' | 'on' | 'off' | null;

const wood = '#7a5230';
const woodDark = '#4a3019';
const woodLight = '#a5763f';
const metal = '#9aa3ad';
const gold = '#e6c87f';

/** Luz que o objeto emite quando aceso (desenhada numa camada acima do chão). */
export const PROP_LIGHT: Partial<Record<PropKind, { color: string; radius: number; when: 'on' }>> = {
  torch: { color: '255,170,60', radius: 3, when: 'on' },
  campfire: { color: '255,140,40', radius: 4, when: 'on' },
  lamp: { color: '255,236,170', radius: 4, when: 'on' },
  ritual: { color: '160,100,255', radius: 3, when: 'on' },
  computer: { color: '90,200,255', radius: 1.6, when: 'on' },
  trap: { color: '255,60,60', radius: 1.2, when: 'on' },
};

function Flame({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="animate-flicker" style={{ transformOrigin: '50% 100%', transformBox: 'fill-box' }}>
        <path d="M0 -18 C8 -8 10 0 6 8 C4 12 -4 12 -6 8 C-10 0 -8 -8 0 -18Z" fill="#ff7a1a" />
        <path d="M0 -10 C4 -4 5 2 3 6 C2 8 -2 8 -3 6 C-5 2 -4 -4 0 -10Z" fill="#ffd25a" />
      </g>
    </g>
  );
}

export function PropArt({ kind, state }: { kind: PropKind; state: State }) {
  const on = state === 'on';
  const open = state === 'open';
  switch (kind) {
    case 'door':
      return (
        <g>
          <rect x="4" y="38" width="8" height="24" fill={woodDark} />
          <rect x="88" y="38" width="8" height="24" fill={woodDark} />
          {open ? (
            <>
              <path
                d="M12 50 A 70 70 0 0 1 72 6"
                fill="none"
                stroke={gold}
                strokeOpacity="0.35"
                strokeDasharray="4 4"
              />
              <g transform="rotate(-80 12 50)">
                <rect
                  x="12"
                  y="43"
                  width="76"
                  height="14"
                  rx="2"
                  fill={wood}
                  stroke={woodDark}
                  strokeWidth="2"
                />
                <circle cx="80" cy="50" r="2.5" fill={gold} />
              </g>
            </>
          ) : (
            <g>
              <rect
                x="12"
                y="43"
                width="76"
                height="14"
                rx="2"
                fill={wood}
                stroke={woodDark}
                strokeWidth="2"
              />
              <line x1="37" y1="44" x2="37" y2="56" stroke={woodDark} strokeWidth="1.5" />
              <line x1="62" y1="44" x2="62" y2="56" stroke={woodDark} strokeWidth="1.5" />
              <circle cx="80" cy="50" r="2.5" fill={gold} />
            </g>
          )}
        </g>
      );
    case 'gate':
      return (
        <g>
          <rect x="2" y="44" width="6" height="12" fill="#3b3f46" />
          <rect x="92" y="44" width="6" height="12" fill="#3b3f46" />
          {[0, 1].map((side) => (
            <g key={side} transform={open ? `rotate(${side ? 70 : -70} ${side ? 92 : 8} 50)` : undefined}>
              <rect x={side ? 50 : 8} y="47" width="42" height="6" fill="#565c66" />
              {Array.from({ length: 5 }, (_, i) => (
                <rect key={i} x={(side ? 52 : 10) + i * 8} y="44" width="2.5" height="12" fill={metal} />
              ))}
            </g>
          ))}
        </g>
      );
    case 'window':
      return (
        <g>
          <rect x="8" y="42" width="84" height="16" fill={woodDark} />
          <rect x="12" y="45" width={open ? 30 : 38} height="10" fill="#7fc4e8" opacity="0.75" />
          <rect x={open ? 58 : 50} y="45" width={open ? 30 : 38} height="10" fill="#7fc4e8" opacity="0.75" />
          <line x1="20" y1="46" x2="26" y2="54" stroke="white" strokeOpacity="0.6" />
        </g>
      );
    case 'house':
      return (
        <g>
          <rect x="6" y="10" width="88" height="84" fill="rgba(0,0,0,0.35)" transform="translate(4 4)" />
          <polygon points="6,10 94,10 94,50 6,50" fill="#7d2e22" />
          <polygon points="6,50 94,50 94,90 6,90" fill="#6a251b" />
          {Array.from({ length: 8 }, (_, i) => (
            <line
              key={i}
              x1="6"
              y1={14 + i * 10}
              x2="94"
              y2={14 + i * 10}
              stroke="#4e1912"
              strokeWidth="1.2"
            />
          ))}
          <line x1="6" y1="50" x2="94" y2="50" stroke="#3a120d" strokeWidth="3" />
          <rect x="68" y="16" width="12" height="14" fill="#5b5550" stroke="#2f2b28" />
          <circle cx="74" cy="12" r="5" fill="#cfd3d8" opacity="0.35" className="animate-pulse-soft" />
        </g>
      );
    case 'stairs':
      return (
        <g>
          {Array.from({ length: 6 }, (_, i) => (
            <rect
              key={i}
              x="14"
              y={10 + i * 14}
              width="72"
              height="12"
              fill={i % 2 ? '#5d554e' : '#6e665e'}
              stroke="#2f2b28"
            />
          ))}
          <path d="M50 8 L58 18 L42 18 Z" fill={gold} opacity="0.8" />
        </g>
      );
    case 'table':
      return (
        <g>
          <rect
            x="8"
            y="22"
            width="84"
            height="56"
            rx="6"
            fill="rgba(0,0,0,0.35)"
            transform="translate(3 3)"
          />
          <rect x="8" y="22" width="84" height="56" rx="6" fill={wood} stroke={woodDark} strokeWidth="2" />
          {[32, 44, 56, 68].map((y) => (
            <line key={y} x1="12" y1={y} x2="88" y2={y} stroke={woodDark} strokeOpacity="0.4" />
          ))}
          <circle cx="30" cy="40" r="6" fill="#e8e1d4" stroke="#9b9384" />
          <rect x="58" y="52" width="16" height="12" fill="#f1ead8" transform="rotate(-12 66 58)" />
        </g>
      );
    case 'chair':
      return (
        <g>
          <rect x="26" y="30" width="48" height="44" rx="4" fill={wood} stroke={woodDark} strokeWidth="2" />
          <rect x="26" y="22" width="48" height="10" rx="3" fill={woodDark} />
        </g>
      );
    case 'bed':
      return (
        <g>
          <rect x="16" y="6" width="68" height="88" rx="4" fill={woodDark} />
          <rect x="20" y="10" width="60" height="80" rx="3" fill="#e9e3d6" />
          <rect x="26" y="14" width="48" height="16" rx="6" fill="#ffffff" stroke="#c9c1b0" />
          <rect x="20" y="40" width="60" height="50" rx="3" fill="#5a3f8f" />
          <line x1="20" y1="44" x2="80" y2="44" stroke="#c9b6ff" strokeOpacity="0.5" strokeWidth="2" />
        </g>
      );
    case 'sofa':
      return (
        <g>
          <rect x="6" y="26" width="88" height="50" rx="10" fill="#5b2a33" />
          <rect x="6" y="26" width="88" height="14" rx="7" fill="#45202a" />
          <rect x="14" y="42" width="34" height="28" rx="5" fill="#73363f" />
          <rect x="52" y="42" width="34" height="28" rx="5" fill="#73363f" />
        </g>
      );
    case 'bookshelf':
      return (
        <g>
          <rect x="10" y="26" width="80" height="48" fill={woodDark} />
          {['#8b2e2e', '#2e5a8b', '#2e8b4f', '#8b7a2e', '#5a2e8b', '#8b4a2e', '#2e7f8b', '#6b2e5a'].map(
            (c, i) => (
              <rect
                key={c}
                x={14 + i * 9.5}
                y={i % 3 ? 32 : 30}
                width="7"
                height={i % 3 ? 36 : 38}
                fill={c}
              />
            ),
          )}
        </g>
      );
    case 'computer':
      return (
        <g>
          <rect x="10" y="40" width="80" height="44" rx="3" fill="#3b3f46" />
          <rect x="22" y="16" width="56" height="34" rx="3" fill="#1b1e24" stroke="#555b66" strokeWidth="2" />
          <rect
            x="26"
            y="20"
            width="48"
            height="26"
            fill={on ? '#3fd0ff' : '#0c0e12'}
            className={on ? 'animate-pulse-soft' : undefined}
          />
          {on && (
            <g stroke="#e0fbff" strokeWidth="2" opacity="0.8">
              <line x1="30" y1="26" x2="58" y2="26" />
              <line x1="30" y1="32" x2="66" y2="32" />
              <line x1="30" y1="38" x2="50" y2="38" />
            </g>
          )}
          <rect x="30" y="62" width="40" height="10" rx="2" fill="#24272d" />
        </g>
      );
    case 'chest':
      return (
        <g>
          <rect
            x="16"
            y={open ? 18 : 30}
            width="68"
            height="18"
            rx="6"
            fill={woodLight}
            stroke={woodDark}
            strokeWidth="2"
            style={{ transition: 'all .35s ease' }}
          />
          <rect x="16" y="40" width="68" height="40" rx="3" fill={wood} stroke={woodDark} strokeWidth="2" />
          <rect x="16" y="52" width="68" height="5" fill={gold} opacity="0.8" />
          <rect x="45" y="46" width="10" height="12" rx="2" fill={gold} />
          {open && (
            <g>
              <ellipse cx="50" cy="42" rx="26" ry="6" fill="#ffd25a" opacity="0.85" />
              <circle cx="40" cy="40" r="2" fill="white" className="animate-pulse-soft" />
              <circle cx="60" cy="38" r="1.6" fill="white" className="animate-pulse-soft" />
            </g>
          )}
        </g>
      );
    case 'crate':
      return (
        <g>
          <rect x="18" y="18" width="64" height="64" fill={woodLight} stroke={woodDark} strokeWidth="3" />
          <line x1="20" y1="20" x2="80" y2="80" stroke={woodDark} strokeWidth="5" />
          <line x1="80" y1="20" x2="20" y2="80" stroke={woodDark} strokeWidth="5" />
        </g>
      );
    case 'barrel':
      return (
        <g>
          <circle cx="50" cy="50" r="32" fill={wood} stroke={woodDark} strokeWidth="3" />
          <circle cx="50" cy="50" r="24" fill="none" stroke="#3b3f46" strokeWidth="3" />
          <circle cx="50" cy="50" r="12" fill={woodDark} />
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
            r="30"
            fill="none"
            stroke={gold}
            strokeOpacity="0.6"
            strokeWidth="2"
            className="animate-pulse-soft"
          />
          <g transform="rotate(-30 50 50)">
            {kind === 'knife' && (
              <>
                <path d="M30 47 L66 47 L74 50 L66 53 L30 53 Z" fill={metal} />
                <rect x="18" y="45" width="14" height="10" rx="2" fill={woodDark} />
              </>
            )}
            {kind === 'pistol' && (
              <>
                <rect x="28" y="42" width="44" height="10" rx="2" fill="#2f3237" />
                <rect
                  x="30"
                  y="50"
                  width="12"
                  height="18"
                  rx="2"
                  fill="#2f3237"
                  transform="rotate(12 36 58)"
                />
                <rect x="70" y="44" width="6" height="6" fill={metal} />
              </>
            )}
            {kind === 'shotgun' && (
              <>
                <rect x="12" y="46" width="64" height="7" fill="#2f3237" />
                <rect x="10" y="48" width="22" height="10" rx="3" fill={wood} />
                <rect x="40" y="52" width="14" height="5" fill={woodDark} />
              </>
            )}
            {kind === 'axe' && (
              <>
                <rect x="20" y="47" width="58" height="6" rx="2" fill={wood} />
                <path d="M64 36 C76 38 80 46 78 50 C80 54 76 62 64 64 Z" fill={metal} stroke="#5f666f" />
              </>
            )}
          </g>
        </g>
      );
    case 'torch':
      return (
        <g>
          <rect x="46" y="44" width="8" height="40" rx="2" fill={woodDark} />
          <rect x="43" y="40" width="14" height="8" rx="2" fill="#3b3f46" />
          {on && <Flame x={50} y={34} s={1.1} />}
        </g>
      );
    case 'campfire':
      return (
        <g>
          <circle cx="50" cy="56" r="30" fill="#2b2622" />
          {[0, 60, 120].map((a) => (
            <rect
              key={a}
              x="26"
              y="52"
              width="48"
              height="9"
              rx="4"
              fill={woodDark}
              transform={`rotate(${a} 50 56)`}
            />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <circle
              key={i}
              cx={50 + 30 * Math.cos((i * Math.PI) / 4)}
              cy={56 + 30 * Math.sin((i * Math.PI) / 4)}
              r="5"
              fill="#6e6a66"
            />
          ))}
          {on ? (
            <>
              <Flame x={44} y={52} s={1.2} />
              <Flame x={56} y={54} s={1} />
              <Flame x={50} y={46} s={1.4} />
            </>
          ) : (
            <circle cx="50" cy="56" r="8" fill="#555" opacity="0.6" />
          )}
        </g>
      );
    case 'lamp':
      return (
        <g>
          <circle cx="50" cy="50" r="10" fill="#3b3f46" stroke="#22252a" strokeWidth="2" />
          <circle
            cx="50"
            cy="50"
            r="6"
            fill={on ? '#fff3c4' : '#555b66'}
            className={on ? 'animate-pulse-soft' : undefined}
          />
        </g>
      );
    case 'ritual':
      return (
        <g>
          <circle cx="50" cy="50" r="44" fill="none" stroke={on ? '#b48cff' : '#5e4d7f'} strokeWidth="2.5" />
          <g
            className={on ? 'animate-spin-slow' : undefined}
            style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
          >
            <circle
              cx="50"
              cy="50"
              r="36"
              fill="none"
              stroke={on ? '#d6c4ff' : '#5e4d7f'}
              strokeDasharray="6 5"
            />
            {Array.from({ length: 5 }, (_, i) => {
              const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
              return (
                <circle
                  key={i}
                  cx={50 + 40 * Math.cos(a)}
                  cy={50 + 40 * Math.sin(a)}
                  r="3"
                  fill={on ? '#e9ddff' : '#5e4d7f'}
                />
              );
            })}
          </g>
          <polygon
            points={Array.from({ length: 5 }, (_, i) => {
              const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
              return `${50 + 30 * Math.cos(a)},${50 + 30 * Math.sin(a)}`;
            }).join(' ')}
            fill="none"
            stroke={on ? '#b48cff' : '#4a3d66'}
            strokeWidth="2"
          />
        </g>
      );
    case 'blood':
      return (
        <g fill="#7a0d16" opacity="0.9">
          <path d="M50 30 C66 28 74 42 66 54 C60 64 44 68 34 58 C24 48 32 32 50 30Z" />
          <circle cx="76" cy="34" r="4" />
          <circle cx="24" cy="66" r="5" />
          <circle cx="70" cy="70" r="3" />
          <circle cx="30" cy="30" r="2.5" />
        </g>
      );
    case 'grave':
      return (
        <g>
          <rect x="22" y="58" width="56" height="34" rx="4" fill="#3d3a33" />
          <path
            d="M32 60 L32 24 C32 10 68 10 68 24 L68 60 Z"
            fill="#7d7a73"
            stroke="#4a4740"
            strokeWidth="2"
          />
          <rect x="47" y="22" width="6" height="26" fill="#4a4740" />
          <rect x="40" y="29" width="20" height="6" fill="#4a4740" />
        </g>
      );
    case 'body':
      return (
        <g fill="none" stroke="#f2f2f2" strokeWidth="3" strokeLinecap="round" opacity="0.85">
          <circle cx="50" cy="22" r="9" />
          <path d="M50 31 L50 62 M50 40 L30 52 M50 40 L72 32 M50 62 L36 86 M50 62 L66 84" />
        </g>
      );
    case 'trap':
      return (
        <g>
          <circle cx="50" cy="50" r="28" fill="#2e3136" stroke="#5f666f" strokeWidth="3" />
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i * Math.PI) / 5;
            const x = 50 + 22 * Math.cos(a);
            const y = 50 + 22 * Math.sin(a);
            return (
              <polygon
                key={i}
                points={`${x},${y} ${50 + 12 * Math.cos(a + 0.2)},${50 + 12 * Math.sin(a + 0.2)} ${50 + 12 * Math.cos(a - 0.2)},${50 + 12 * Math.sin(a - 0.2)}`}
                fill={metal}
              />
            );
          })}
          {on && <circle cx="50" cy="50" r="5" fill="#ff4a4a" className="animate-pulse-soft" />}
        </g>
      );
    case 'car':
      return (
        <g>
          <rect
            x="6"
            y="22"
            width="88"
            height="56"
            rx="14"
            fill="rgba(0,0,0,0.35)"
            transform="translate(3 3)"
          />
          <rect x="6" y="22" width="88" height="56" rx="14" fill="#1f4f8a" stroke="#123056" strokeWidth="2" />
          <rect x="30" y="28" width="40" height="44" rx="6" fill="#163a66" />
          <rect x="22" y="30" width="10" height="40" rx="3" fill="#9fd0f0" opacity="0.8" />
          <rect x="68" y="30" width="8" height="40" rx="3" fill="#9fd0f0" opacity="0.6" />
          <circle cx="92" cy="32" r="3" fill="#fff6c4" />
          <circle cx="92" cy="68" r="3" fill="#fff6c4" />
          <rect x="4" y="30" width="3" height="8" fill="#ff4d4d" />
          <rect x="4" y="62" width="3" height="8" fill="#ff4d4d" />
        </g>
      );
    case 'bush':
      return (
        <g>
          {[
            [40, 46, 20],
            [60, 44, 18],
            [50, 60, 20],
            [34, 60, 14],
            [66, 60, 14],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? '#2f6b39' : '#3b8247'} stroke="#1d4424" />
          ))}
        </g>
      );
    case 'boulder':
      return (
        <g>
          <polygon
            points="22,62 30,30 56,20 78,34 82,64 60,82 32,80"
            fill="#6e6a74"
            stroke="#3f3b45"
            strokeWidth="3"
          />
          <polygon points="32,36 54,26 62,40 40,46" fill="#8a8690" />
        </g>
      );
    default:
      return <circle cx="50" cy="50" r="30" fill="#666" />;
  }
}
