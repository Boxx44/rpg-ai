'use client';

/**
 * Boneco 2D ilustrado, visto de cima (câmera alta), com contorno escuro e sombreado,
 * montado a partir da aparência escolhida na ficha. Desenho original feito em SVG.
 * Caixa de desenho: 0–100 de largura × 0–160 de altura; os pés ficam em y≈152.
 * Respira (peito e ombros sobem de leve) e pisca; tudo respeita "menos movimento".
 */
import type { Appearance } from '@rpg-ai/shared';

const OL = '#15111a'; // contorno
const SW = 1.5; // espessura do contorno

const BODY = {
  magro: { sh: 19, waist: 13, hip: 13, arm: 5.5, leg: 7 },
  medio: { sh: 22, waist: 15, hip: 15, arm: 6.5, leg: 8 },
  forte: { sh: 26, waist: 17, hip: 16, arm: 8, leg: 9 },
  largo: { sh: 26, waist: 21, hip: 21, arm: 8.5, leg: 10 },
} as const;

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Sombra de luz vinda de cima/esquerda, aplicada por cima de cada parte. */
function Shade({ d }: { d: string }) {
  return <path d={d} fill="url(#av-shade)" pointerEvents="none" />;
}

function Part({
  d,
  fill,
  stroke = OL,
  sw = SW,
  shadeIt = true,
}: {
  d: string;
  fill: string;
  stroke?: string;
  sw?: number;
  shadeIt?: boolean;
}) {
  return (
    <>
      <path d={d} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      {shadeIt && <Shade d={d} />}
    </>
  );
}

/**
 * Braço/perna afinando de cima para baixo (perspectiva de quem olha do alto):
 * um único contorno passando pelos pontos, com larguras que diminuem.
 */
function Limb({ pts, w, color, w2 }: { pts: [number, number][]; w: number; color: string; w2?: number }) {
  const end = w2 ?? w * 0.62;
  const widths = pts.map((_, i) => w + ((end - w) * i) / Math.max(1, pts.length - 1));
  const left: string[] = [];
  const right: string[] = [];
  pts.forEach(([x, y], i) => {
    const [px, py] = pts[Math.max(0, i - 1)]!;
    const [nx, ny] = pts[Math.min(pts.length - 1, i + 1)]!;
    let dx = nx - px;
    let dy = ny - py;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const h = widths[i]! / 2;
    left.push(`${(x - dy * h).toFixed(2)},${(y + dx * h).toFixed(2)}`);
    right.unshift(`${(x + dy * h).toFixed(2)},${(y - dx * h).toFixed(2)}`);
  });
  const [ex, ey] = pts[pts.length - 1]!;
  const [sx, sy] = pts[0]!;
  const d = `M${left.join(' L')} A${end / 2},${end / 2} 0 0 0 ${right[0]} L${right.join(' L')} A${w / 2},${w / 2} 0 0 0 ${left[0]} Z`;
  void ex;
  void ey;
  void sx;
  void sy;
  return <Part d={d} fill={color} />;
}

// ─────────────────────────── cabelo ───────────────────────────
function backHair(a: Appearance): string | null {
  switch (a.hair.style) {
    case 'longo':
      return 'M29,40 Q26,72 32,92 L68,92 Q74,72 71,40 Q50,30 29,40 Z';
    case 'rabo':
      return 'M44,26 Q38,50 44,80 Q50,90 56,80 Q62,50 56,26 Z';
    case 'trancas':
      return 'M30,40 Q28,56 33,66 L67,66 Q72,56 70,40 Z';
    case 'cacheado':
      return 'M27,38 Q24,62 34,70 L66,70 Q76,62 73,38 Z';
    default:
      return null;
  }
}

function FrontHair({ a }: { a: Appearance }) {
  const c = a.hair.color;
  const dark = shade(c, 0.6);
  const p = (d: string) => <Part d={d} fill={c} />;
  const strands = (
    <g stroke={dark} strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.8">
      <path d="M40,22 Q44,30 42,36" />
      <path d="M50,19 Q52,28 50,34" />
      <path d="M60,22 Q57,30 58,36" />
    </g>
  );
  let shape: React.ReactNode = null;
  switch (a.hair.style) {
    case 'curto':
      shape = p('M31,42 Q29,17 50,16 Q71,17 69,42 Q65,32 59,34 Q56,27 50,31 Q44,26 41,34 Q35,31 31,42 Z');
      break;
    case 'repartido':
      shape = p('M30,46 Q27,16 52,15 Q73,17 70,42 Q66,31 60,30 Q50,33 41,46 Q37,52 30,46 Z');
      break;
    case 'franja':
      shape = p('M30,44 Q29,16 50,15 Q71,16 70,44 L66,43 Q61,37 57,42 Q51,37 45,42 Q40,37 35,43 Z');
      break;
    case 'longo':
      shape = (
        <>
          {p('M30,44 Q29,16 50,15 Q71,16 70,44 Q62,30 52,30 L50,24 L48,30 Q38,30 30,44 Z')}
          {p('M30,42 Q25,62 30,84 L37,82 Q33,62 37,46 Z')}
          {p('M70,42 Q75,62 70,84 L63,82 Q67,62 63,46 Z')}
        </>
      );
      break;
    case 'rabo':
      shape = (
        <>
          {p('M31,40 Q30,18 50,17 Q70,18 69,40 Q62,30 50,30 Q38,30 31,40 Z')}
          <ellipse cx="50" cy="20" rx="5" ry="3" fill={shade(c, 0.5)} stroke={OL} strokeWidth={SW} />
        </>
      );
      break;
    case 'coque':
      shape = (
        <>
          {p('M31,40 Q30,19 50,18 Q70,19 69,40 Q62,30 50,31 Q38,30 31,40 Z')}
          <circle cx="50" cy="14" r="9" fill={c} stroke={OL} strokeWidth={SW} />
          <path d="M42,18 Q50,22 58,18" stroke={dark} strokeWidth="2" fill="none" />
        </>
      );
      break;
    case 'cacheado':
      shape = (
        <g>
          {[
            [34, 30, 7],
            [42, 22, 7.5],
            [52, 19, 8],
            [61, 23, 7.5],
            [67, 31, 7],
            [30, 40, 6],
            [70, 40, 6],
            [47, 30, 6],
            [57, 31, 6],
            [38, 34, 5.5],
            [63, 36, 5.5],
          ].map(([x, y, r], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={r}
              fill={i % 2 ? c : shade(c, 0.85)}
              stroke={OL}
              strokeWidth={SW * 0.9}
            />
          ))}
        </g>
      );
      break;
    case 'moicano':
      shape = (
        <>
          <path d="M31,42 Q30,20 50,18 Q70,20 69,42 Q50,34 31,42 Z" fill={c} opacity="0.35" />
          {p('M44,40 L41,26 L45,28 L44,16 L49,22 L50,9 L53,21 L57,15 L56,28 L60,26 L56,40 Q50,36 44,40 Z')}
        </>
      );
      break;
    case 'raspado':
      shape = (
        <path
          d="M31,40 Q30,18 50,17 Q70,18 69,40 Q50,30 31,40 Z"
          fill={c}
          opacity="0.75"
          stroke={OL}
          strokeWidth={SW * 0.8}
        />
      );
      break;
    case 'trancas':
      shape = (
        <>
          {p('M30,44 Q29,16 50,15 Q71,16 70,44 Q62,30 52,30 L50,24 L48,30 Q38,30 30,44 Z')}
          {[30, 70].map((x) => (
            <g key={x}>
              {[50, 58, 66, 74, 82].map((y, i) => (
                <ellipse
                  key={y}
                  cx={x + (x < 50 ? -1 : 1) * (i % 2)}
                  cy={y}
                  rx="4"
                  ry="5"
                  fill={i % 2 ? c : dark}
                  stroke={OL}
                  strokeWidth={SW * 0.8}
                />
              ))}
              <circle cx={x} cy={88} r="2.2" fill={a.top.accent} stroke={OL} strokeWidth="0.8" />
            </g>
          ))}
        </>
      );
      break;
    case 'baguncado':
      shape = p(
        'M29,44 L31,30 L26,26 L35,24 L33,14 L42,19 L46,9 L52,17 L60,10 L60,20 L70,17 L66,26 L74,30 L69,36 L71,44 Q64,34 58,36 Q55,28 49,33 Q43,28 40,36 Q34,33 29,44 Z',
      );
      break;
    case 'careca':
      shape = <ellipse cx="44" cy="24" rx="7" ry="3" fill="white" opacity="0.25" />;
      break;
  }
  return (
    <g>
      {shape}
      {a.hair.style !== 'careca' && a.hair.style !== 'raspado' && a.hair.style !== 'cacheado' && strands}
      {a.hair.streak && a.hair.style !== 'careca' && (
        <path
          d="M58,17 Q64,26 63,36 Q62,46 66,56"
          fill="none"
          stroke={a.hair.streak}
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

// ─────────────────────────── rosto ───────────────────────────
function Face({ a, down }: { a: Appearance; down?: boolean }) {
  const masked = a.accessories.includes('caveira');
  if (masked)
    return (
      <g>
        <path
          d="M35,36 Q35,26 50,26 Q65,26 65,36 L64,50 Q62,60 56,62 L44,62 Q38,60 36,50 Z"
          fill="#e9e3d6"
          stroke={OL}
          strokeWidth={SW}
        />
        <Shade d="M35,36 Q35,26 50,26 Q65,26 65,36 L64,50 Q62,60 56,62 L44,62 Q38,60 36,50 Z" />
        <ellipse cx="43.5" cy="43" rx="4.6" ry="4" fill="#120d10" />
        <ellipse cx="56.5" cy="43" rx="4.6" ry="4" fill="#120d10" />
        <circle cx="43.5" cy="43.5" r="1.4" fill="#ff3b3b" className="animate-pulse-soft" />
        <circle cx="56.5" cy="43.5" r="1.4" fill="#ff3b3b" className="animate-pulse-soft" />
        <path d="M48,50 L50,46 L52,50 Z" fill="#120d10" />
        <path
          d="M42,56 L58,56 M45,54 L45,59 M48,54 L48,59 M51,54 L51,59 M54,54 L54,59"
          stroke={OL}
          strokeWidth="0.9"
        />
      </g>
    );
  return (
    <g>
      {/* sobrancelhas */}
      <path
        d="M39,41 Q43,39 47,41"
        stroke={shade(a.hair.color, 0.8)}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M53,41 Q57,39 61,41"
        stroke={shade(a.hair.color, 0.8)}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      {/* olhos (piscam) */}
      {down ? (
        <path d="M40,45 l5,3 M45,45 l-5,3 M55,45 l5,3 M60,45 l-5,3" stroke={OL} strokeWidth="1.4" />
      ) : (
        <g className="animate-blink" style={{ transformOrigin: '50px 46px', transformBox: 'view-box' }}>
          {[43, 57].map((x) => (
            <g key={x}>
              <path d={`M${x - 4},46 Q${x},42.5 ${x + 4},46 Q${x},48.8 ${x - 4},46 Z`} fill="#f4efe6" />
              <circle cx={x} cy="45.9" r="2" fill={a.eyes} />
              <circle cx={x} cy="45.9" r="0.9" fill="#0d0a0a" />
              <circle cx={x - 0.7} cy="45.2" r="0.5" fill="white" />
              <path
                d={`M${x - 4.4},45.8 Q${x},42 ${x + 4.4},45.6`}
                stroke={OL}
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>
      )}
      {/* nariz e boca */}
      <path
        d="M50,47 Q48.6,51 50.6,52"
        stroke={shade(a.skin, 0.62)}
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M46.5,56 Q50,57.4 53.5,56"
        stroke={shade(a.skin, 0.45)}
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
      {a.accessories.includes('cicatriz') && (
        <path d="M58,49 L64,56 M59,53 l2,-1 M61,55 l2,-1" stroke="#9a3a3a" strokeWidth="1.1" />
      )}
      {a.accessories.includes('oculos') && (
        <g fill="rgba(200,230,255,0.25)" stroke={OL} strokeWidth="1.2">
          <circle cx="43" cy="46" r="5" />
          <circle cx="57" cy="46" r="5" />
          <path d="M48,46 L52,46 M38,45 L33,43 M62,45 L67,43" fill="none" />
        </g>
      )}
      {a.accessories.includes('venda') && (
        <g>
          <path d="M31,40 L69,34 L70,42 L32,49 Z" fill="#2b2420" stroke={OL} strokeWidth={SW} />
          <path d="M36,43 L64,38" stroke="#8a7a6a" strokeWidth="0.8" strokeDasharray="1.5 2.5" />
        </g>
      )}
    </g>
  );
}

// ─────────────────────────── itens ───────────────────────────
function Held({ item, x, y }: { item: Appearance['held']; x: number; y: number }) {
  switch (item) {
    case 'pistola':
      return (
        <g transform={`translate(${x} ${y}) rotate(20)`}>
          <rect x="-2.5" y="-2" width="5" height="16" rx="1" fill="#26282c" stroke={OL} strokeWidth="1" />
          <rect x="-2.5" y="-4" width="5" height="6" rx="1" fill="#3a2a20" stroke={OL} strokeWidth="1" />
        </g>
      );
    case 'faca':
      return (
        <g transform={`translate(${x} ${y}) rotate(10)`}>
          <rect x="-1.6" y="-4" width="3.2" height="6" rx="1" fill="#2a1d14" stroke={OL} strokeWidth="0.8" />
          <path d="M-1.8,2 L1.8,2 L0.6,17 L-1.8,14 Z" fill="#c9d0d8" stroke={OL} strokeWidth="0.8" />
        </g>
      );
    case 'taco':
      return (
        <g transform={`translate(${x} ${y}) rotate(-28)`}>
          <path d="M-1.6,4 L1.6,4 L3.5,-38 L-3.5,-38 Z" fill="#9a6a3a" stroke={OL} strokeWidth="1.1" />
          {[-34, -29, -24, -19].map((yy, i) => (
            <path
              key={yy}
              d={`M${i % 2 ? 3 : -3},${yy} l${i % 2 ? 4 : -4},-1`}
              stroke="#c9d0d8"
              strokeWidth="1.2"
            />
          ))}
        </g>
      );
    case 'katana':
      return (
        <g transform={`translate(${x} ${y}) rotate(14)`}>
          <rect x="-1.5" y="-6" width="3" height="8" rx="1" fill="#1b1612" stroke={OL} strokeWidth="0.8" />
          <rect x="-4" y="1.5" width="8" height="2" rx="1" fill="#c9a24b" stroke={OL} strokeWidth="0.7" />
          <path d="M-1.3,3.5 L1.3,3.5 L1,40 Q0,43 -1.3,40 Z" fill="#d6dde4" stroke={OL} strokeWidth="0.8" />
        </g>
      );
    case 'livro':
      return (
        <g transform={`translate(${x} ${y}) rotate(-8)`}>
          <circle cx="0" cy="2" r="9" fill="#a46bff" opacity="0.25" className="animate-pulse-soft" />
          <rect x="-6" y="-5" width="12" height="14" rx="1" fill="#3a1f5c" stroke={OL} strokeWidth="1" />
          <circle cx="0" cy="2" r="3" fill="none" stroke="#d6c4ff" strokeWidth="0.8" />
        </g>
      );
    case 'lanterna':
      return (
        <g transform={`translate(${x} ${y}) rotate(15)`}>
          <path d="M-2,10 L-14,40 L14,40 L2,10 Z" fill="#fff4c4" opacity="0.18" />
          <rect x="-2.2" y="-3" width="4.4" height="13" rx="1" fill="#2b2e33" stroke={OL} strokeWidth="0.9" />
          <circle cx="0" cy="10" r="2.4" fill="#fff6c4" />
        </g>
      );
    case 'espingarda':
      return (
        <g transform={`translate(${x} ${y}) rotate(-35)`}>
          <rect x="-1.6" y="-34" width="3.2" height="30" rx="1" fill="#26282c" stroke={OL} strokeWidth="1" />
          <path d="M-3,-4 L3,-4 L4,10 L-4,10 Z" fill="#6a4a2a" stroke={OL} strokeWidth="1" />
        </g>
      );
    case 'machado':
      return (
        <g transform={`translate(${x} ${y}) rotate(10)`}>
          <rect x="-1.4" y="-6" width="2.8" height="34" rx="1" fill="#7a5230" stroke={OL} strokeWidth="0.9" />
          <path d="M1,20 Q12,18 12,28 Q8,32 1,30 Z" fill="#c9d0d8" stroke={OL} strokeWidth="0.9" />
        </g>
      );
    default:
      return null;
  }
}

// ─────────────────────────── corpo ───────────────────────────
export function AvatarFigure({ a, down, still }: { a: Appearance; down?: boolean; still?: boolean }) {
  const b = BODY[a.body];
  const L = 50 - b.sh;
  const R = 50 + b.sh;
  const top = a.top;
  const longSleeve = ['moletom', 'jaqueta', 'sobretudo', 'terno', 'colete', 'manto'].includes(top.style);
  const sleeveColor = top.style === 'colete' ? top.accent : top.color;
  const skin = a.skin;
  const gloves = a.accessories.includes('luvas');
  const handColor = gloves ? '#1d1a1f' : skin;
  const hooded = (top.style === 'moletom' && a.hood) || top.style === 'manto';

  const torso = `M${L},74 Q${L},65 ${L + 8},64 L${R - 8},64 Q${R},65 ${R},74 L${50 + b.waist - 1},97 L${50 + b.hip - 1},108 L${50 - b.hip + 1},108 L${50 - b.waist + 1},97 Z`;
  // pernas (pés no chão em y≈150)
  const legW = b.leg * 2;
  const legL: [number, number][] = [
    [50 - b.hip / 2 - 1, 106],
    [50 - b.hip / 2 + 0.5, 125],
    [45, 143],
  ];
  const legR: [number, number][] = [
    [50 + b.hip / 2 + 1, 106],
    [50 + b.hip / 2 - 0.5, 125],
    [55, 143],
  ];
  const bottom = a.bottom;
  const pantsColor = bottom.color;
  const wide = bottom.style === 'larga' || bottom.style === 'cargo';
  const shortLegs = bottom.style === 'shorts' || bottom.style === 'saia';

  // braços: ombro → cotovelo → mão
  const armL: [number, number][] = [
    [L + 3, 72],
    [L - 2, 90],
    [L + 1, 106],
  ];
  const armR: [number, number][] = [
    [R - 3, 72],
    [R + 2, 90],
    [R - 1, 106],
  ];

  const shoe = a.shoes;
  const Feet = (
    <g>
      {[45.5, 54.5].map((x) => (
        <g key={x}>
          {shoe.style === 'botas' && (
            <Part
              d={`M${x - 4.5},137 L${x + 4.5},137 L${x + 5},149 Q${x},153 ${x - 5},149 Z`}
              fill={shoe.color}
            />
          )}
          {shoe.style === 'tenis' && (
            <>
              <ellipse cx={x} cy="148.5" rx="5.4" ry="3.8" fill="#ece8e0" stroke={OL} strokeWidth={SW} />
              <ellipse cx={x} cy="147.2" rx="4.6" ry="2.9" fill={shoe.color} />
            </>
          )}
          {shoe.style === 'sapatos' && (
            <ellipse cx={x} cy="149" rx="5.8" ry="3.8" fill={shoe.color} stroke={OL} strokeWidth={SW} />
          )}
          {shoe.style === 'descalco' && (
            <ellipse cx={x} cy="149" rx="5" ry="3.6" fill={skin} stroke={OL} strokeWidth={SW} />
          )}
          {shoe.style !== 'descalco' && (
            <ellipse cx={x - 1.5} cy="147" rx="2" ry="1" fill="white" opacity="0.25" />
          )}
        </g>
      ))}
    </g>
  );

  const Legs = (
    <g>
      {shortLegs && (
        <>
          <Limb pts={legL} w={legW - 3} w2={legW * 0.45} color={skin} />
          <Limb pts={legR} w={legW - 3} w2={legW * 0.45} color={skin} />
        </>
      )}
      {!shortLegs && (
        <>
          <Limb
            pts={legL}
            w={wide ? legW + 3 : legW + 1}
            w2={wide ? legW + 1 : legW * 0.6}
            color={pantsColor}
          />
          <Limb
            pts={legR}
            w={wide ? legW + 3 : legW + 1}
            w2={wide ? legW + 1 : legW * 0.6}
            color={pantsColor}
          />
          <path d={`M50,110 L50,134`} stroke={shade(pantsColor, 0.55)} strokeWidth="1" />
          {bottom.style === 'cargo' && (
            <>
              <rect
                x={50 - b.hip - 2}
                y="118"
                width="7"
                height="8"
                rx="1"
                fill={shade(pantsColor, 0.8)}
                stroke={OL}
                strokeWidth="0.9"
              />
              <rect
                x={50 + b.hip - 5}
                y="118"
                width="7"
                height="8"
                rx="1"
                fill={shade(pantsColor, 0.8)}
                stroke={OL}
                strokeWidth="0.9"
              />
            </>
          )}
        </>
      )}
      {bottom.style === 'shorts' && (
        <Part
          d={`M${50 - b.hip - 1},106 L${50 + b.hip + 1},106 L${50 + b.hip + 2},122 L51,122 L50,114 L49,122 L${50 - b.hip - 2},122 Z`}
          fill={pantsColor}
        />
      )}
      {bottom.style === 'saia' && (
        <>
          <Part
            d={`M${50 - b.hip},104 L${50 + b.hip},104 L${50 + b.hip + 8},126 L${50 - b.hip - 8},126 Z`}
            fill={pantsColor}
          />
          {[-8, -2, 4, 10].map((dx) => (
            <path
              key={dx}
              d={`M${50 + dx * 0.6},106 L${50 + dx},125`}
              stroke={shade(pantsColor, 0.6)}
              strokeWidth="0.8"
            />
          ))}
        </>
      )}
      {a.accessories.includes('correntes') && (
        <path
          d={`M${50 - b.hip},108 Q${50 - b.hip + 4},120 ${50 - b.hip + 12},110`}
          fill="none"
          stroke="#c9ced6"
          strokeWidth="1.3"
          strokeDasharray="2 1.2"
        />
      )}
    </g>
  );

  const Coat =
    top.style === 'sobretudo' ? (
      <g>
        <Part
          d={`M${50 - b.waist - 2},96 L${50 - 3},100 L${50 - 4},140 L${50 - b.hip - 9},138 Z`}
          fill={top.color}
        />
        <Part
          d={`M${50 + b.waist + 2},96 L${50 + 3},100 L${50 + 4},140 L${50 + b.hip + 9},138 Z`}
          fill={top.color}
        />
      </g>
    ) : null;

  const Cloak =
    top.style === 'manto' ? (
      <g>
        <Part d={`M${L - 2},74 Q50,58 ${R + 2},74 L${R + 12},146 Q50,154 ${L - 12},146 Z`} fill={top.color} />
        <path
          d={`M${L + 4},80 L${L - 4},144 M${R - 4},80 L${R + 4},144`}
          stroke={shade(top.color, 0.6)}
          strokeWidth="1.2"
        />
        <path d={`M50,70 L50,150`} stroke={top.accent} strokeWidth="3" opacity="0.8" />
      </g>
    ) : null;

  const TorsoDetail = (() => {
    switch (top.style) {
      case 'camiseta':
        return <path d="M44,65 Q50,71 56,65" fill={skin} stroke={OL} strokeWidth="1" />;
      case 'regata':
        return (
          <>
            <path d="M42,65 Q50,75 58,65" fill={skin} stroke={OL} strokeWidth="1" />
            <path
              d={`M${L + 6},66 L${L + 9},80 M${R - 6},66 L${R - 9},80`}
              stroke={shade(top.color, 0.6)}
              strokeWidth="1"
            />
          </>
        );
      case 'moletom':
        return (
          <>
            <Part
              d={`M${50 - b.waist + 2},90 L${50 + b.waist - 2},90 L${50 + b.waist - 1},104 L${50 - b.waist + 1},104 Z`}
              fill={shade(top.color, 0.85)}
            />
            <path d="M46,67 L45,80 M54,67 L55,80" stroke={top.accent} strokeWidth="1.2" />
            <path d={`M${L + 4},74 L${L + 10},74`} stroke={top.accent} strokeWidth="2" />
          </>
        );
      case 'jaqueta':
        return (
          <>
            <path d="M44,65 L50,108 L56,65 Z" fill={top.accent} stroke={OL} strokeWidth="1" />
            <path
              d="M44,65 L41,78 L47,86 Z M56,65 L59,78 L53,86 Z"
              fill={shade(top.color, 0.8)}
              stroke={OL}
              strokeWidth="1"
            />
            <path d="M50,88 L50,108" stroke="#b8bec6" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
          </>
        );
      case 'sobretudo':
        return (
          <>
            <path d="M45,65 L50,100 L55,65 Z" fill={top.accent} stroke={OL} strokeWidth="1" />
            <path
              d="M43,64 L37,82 L47,84 Z M57,64 L63,82 L53,84 Z"
              fill={shade(top.color, 0.78)}
              stroke={OL}
              strokeWidth="1"
            />
          </>
        );
      case 'terno':
        return (
          <>
            <path d="M45,65 L50,92 L55,65 Z" fill="#ece8e0" stroke={OL} strokeWidth="1" />
            <path d="M49,68 L51,68 L52,88 L50,91 L48,88 Z" fill={top.accent} stroke={OL} strokeWidth="0.8" />
            <path
              d="M45,65 L41,80 L48,86 Z M55,65 L59,80 L52,86 Z"
              fill={shade(top.color, 0.8)}
              stroke={OL}
              strokeWidth="1"
            />
            <circle cx="50" cy="98" r="1.2" fill={OL} />
          </>
        );
      case 'colete':
        return (
          <>
            <Part
              d={`M${L + 4},68 L${R - 4},68 L${50 + b.waist},100 L${50 - b.waist},100 Z`}
              fill={top.color}
            />
            {[-8, 0, 8].map((dx) => (
              <rect
                key={dx}
                x={50 + dx - 3}
                y="84"
                width="6"
                height="7"
                rx="1"
                fill={shade(top.color, 0.8)}
                stroke={OL}
                strokeWidth="0.8"
              />
            ))}
            <path d={`M${L + 7},68 L${L + 9},84 M${R - 7},68 L${R - 9},84`} stroke={OL} strokeWidth="1" />
          </>
        );
      default:
        return null;
    }
  })();

  const hair = backHair(a);
  return (
    <g data-avatar={`${a.body}-${a.hair.style}-${a.top.style}`}>
      <defs>
        <linearGradient id="av-shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.16)" />
          <stop offset="0.45" stopColor="rgba(255,255,255,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.38)" />
        </linearGradient>
      </defs>
      {/* sombra no chão */}
      <ellipse cx="52" cy="151" rx="24" ry="6.5" fill="rgba(0,0,0,0.5)" />
      <g
        transform={down ? 'rotate(-82 50 150) translate(-4 6)' : undefined}
        style={down ? { filter: 'grayscale(1) brightness(0.7)' } : undefined}
      >
        {Legs}
        {Feet}
        {Coat}
        {/* parte de cima respira */}
        <g
          className={still || down ? undefined : 'animate-breathe'}
          style={{ transformOrigin: '50px 110px', transformBox: 'view-box' }}
        >
          {hair && <Part d={hair} fill={shade(a.hair.color, 0.82)} />}
          {top.style === 'moletom' && !a.hood && (
            <Part d={`M38,62 Q50,56 62,62 Q60,70 50,70 Q40,70 38,62 Z`} fill={shade(top.color, 0.85)} />
          )}
          {Cloak}
          {/* braços */}
          {top.style !== 'manto' && (
            <>
              <Limb pts={armL} w={b.arm * 2.1} w2={b.arm * 1.25} color={longSleeve ? sleeveColor : skin} />
              <Limb pts={armR} w={b.arm * 2.1} w2={b.arm * 1.25} color={longSleeve ? sleeveColor : skin} />
              {top.style === 'camiseta' && (
                <>
                  <Limb pts={[armL[0]!, [L - 0.5, 83]]} w={b.arm * 2.3} w2={b.arm * 2} color={top.color} />
                  <Limb pts={[armR[0]!, [R + 0.5, 83]]} w={b.arm * 2.3} w2={b.arm * 2} color={top.color} />
                </>
              )}
              {longSleeve && (
                <>
                  <path
                    d={`M${L - 1},88 q2,2 4,0 M${R + 1},88 q-2,2 -4,0`}
                    stroke={shade(sleeveColor, 0.5)}
                    strokeWidth="0.8"
                    fill="none"
                  />
                </>
              )}
            </>
          )}
          {top.style !== 'manto' && <Part d={torso} fill={top.style === 'colete' ? top.accent : top.color} />}
          {top.style !== 'manto' && (
            <>
              {/* luz de cima nos ombros e dobras do tecido */}
              <path d={`M${L + 3},70 Q50,62 ${R - 3},70 Q50,67 ${L + 3},70 Z`} fill="white" opacity="0.12" />
              <path
                d={`M${50 - b.waist + 4},88 l3,6 M${50 + b.waist - 6},90 l-2,6 M${R - 6},74 l-3,5`}
                stroke={shade(top.color, 0.55)}
                strokeWidth="0.8"
                fill="none"
                strokeLinecap="round"
              />
            </>
          )}
          {TorsoDetail}
          {/* mãos */}
          {[armL[2]!, armR[2]!].map(([x, y], i) => (
            <g key={i}>
              <ellipse
                cx={x}
                cy={y + 2.5}
                rx={b.arm * 0.62}
                ry={b.arm * 0.75}
                fill={handColor}
                stroke={OL}
                strokeWidth={SW}
              />
              <path
                d={`M${x - b.arm * 0.4},${y + 4} l0,2 M${x},${y + 4.6} l0,2 M${x + b.arm * 0.4},${y + 4} l0,2`}
                stroke={shade(handColor, 0.55)}
                strokeWidth="0.7"
              />
            </g>
          ))}
          <Held item={a.held} x={armR[2]![0]} y={armR[2]![1] + 2} />
          {/* pescoço, cachecol e gargantilha */}
          <rect x="45" y="56" width="10" height="11" fill={skin} stroke={OL} strokeWidth="1" />
          {a.accessories.includes('colar') && (
            <g>
              <rect x="44.5" y="60" width="11" height="3" fill="#121014" stroke={OL} strokeWidth="0.6" />
              {[46.5, 50, 53.5].map((x) => (
                <path key={x} d={`M${x - 1},63 L${x},65.5 L${x + 1},63 Z`} fill="#c9ced6" />
              ))}
            </g>
          )}
          {a.accessories.includes('cachecol') && (
            <>
              <Part d="M40,60 Q50,68 60,60 L61,66 Q50,74 39,66 Z" fill={top.accent} />
              <Part d="M54,66 L60,66 L58,86 L53,84 Z" fill={top.accent} />
            </>
          )}
          {/* cabeça */}
          {hooded && (
            <Part d="M28,44 Q26,12 50,10 Q74,12 72,44 Q72,62 60,66 L40,66 Q28,62 28,44 Z" fill={top.color} />
          )}
          <ellipse cx="31" cy="46" rx="3.2" ry="4.2" fill={skin} stroke={OL} strokeWidth="1" />
          <ellipse cx="69" cy="46" rx="3.2" ry="4.2" fill={skin} stroke={OL} strokeWidth="1" />
          <Part d="M31,40 Q31,18 50,18 Q69,18 69,40 Q69,58 58,62 Q50,65 42,62 Q31,58 31,40 Z" fill={skin} />
          <ellipse cx="50" cy="50" rx="13" ry="7" fill={shade(skin, 0.9)} opacity="0.35" />
          <ellipse cx="41" cy="52" rx="3" ry="1.6" fill="#e07a6a" opacity="0.2" />
          <ellipse cx="59" cy="52" rx="3" ry="1.6" fill="#e07a6a" opacity="0.2" />
          <Face a={a} down={down} />
          {!hooded && <FrontHair a={a} />}
          {hooded && (
            <path
              d="M33,40 Q33,20 50,19 Q67,20 67,40"
              fill="none"
              stroke={shade(top.color, 0.55)}
              strokeWidth="3"
            />
          )}
        </g>
      </g>
    </g>
  );
}

/** Prévia isolada (ficha/criação). */
export function AvatarPreview({
  a,
  className,
  still,
}: {
  a: Appearance;
  className?: string;
  still?: boolean;
}) {
  return (
    <svg viewBox="0 0 100 160" className={className} aria-hidden>
      <AvatarFigure a={a} still={still} />
    </svg>
  );
}
