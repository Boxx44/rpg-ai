'use client';

/**
 * Boneco 2D ilustrado de corpo inteiro, em estilo pintado: proporções de gente de verdade
 * (≈7,3 cabeças), luz vindo da esquerda, sombras suaves, contorno escuro e roupas em camadas.
 * Desenho original feito em SVG a partir da aparência escolhida na ficha.
 *
 * Caixa de desenho: 0–100 de largura × 0–160 de altura; os pés tocam o chão em y≈151.
 * Respira (o corpo sobe de leve) e pisca; tudo respeita "menos movimento".
 */
import type { Appearance } from '@rpg-ai/shared';
import { createContext, type ReactNode, useContext, useId } from 'react';

type P = readonly [number, number];
const INK = '#120d14';

/* ------------------------------------------------------------------ cores */

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, k: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const c = (i: number) =>
    Math.round(x[i]! + (y[i]! - x[i]!) * k)
      .toString(16)
      .padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}
const dark = (c: string, k = 0.35) => mix(c, '#0b080e', k);
const light = (c: string, k = 0.3) => mix(c, '#fff3e6', k);
const lum = (c: string) => {
  const [r, g, b] = rgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/* ---------------------------------------------------------------- formas */

const f = (p: P) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

/** Curva suave passando por todos os pontos (Catmull-Rom → Bézier). */
function spline(pts: readonly P[], closed = true, k = 1): string {
  const n = pts.length;
  if (n < 2) return '';
  const g = (i: number) => (closed ? pts[(i + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  let d = `M${f(pts[0]!)}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = g(i - 1);
    const p1 = g(i);
    const p2 = g(i + 1);
    const p3 = g(i + 2);
    const c1: P = [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
    const c2: P = [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
    d += ` C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return closed ? `${d}Z` : d;
}
const poly = (pts: readonly P[]) => `M${pts.map(f).join(' L')}Z`;
const mir = (p: P): P => [100 - p[0], p[1]];
/** Metade esquerda (de cima para baixo, terminando no centro) + espelho = forma simétrica. */
function sym(left: readonly P[], k = 1, keepEnds = 1): string {
  const right = left
    .slice(keepEnds === 1 ? 0 : 0, left.length - 1)
    .map(mir)
    .reverse();
  return spline([...left, ...right], true, k);
}

/** Tubo (braço, perna, manga): linha central + meia-largura de cada lado. */
interface Tube {
  c: P[];
  l: number[];
  r: number[];
}
function at(t: Tube, u: number) {
  const n = t.c.length - 1;
  const x = Math.max(0, Math.min(n - 1e-6, u * n));
  const i = Math.floor(x);
  const k = x - i;
  const a = t.c[i]!;
  const b = t.c[i + 1]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return {
    p: [a[0] + dx * k, a[1] + dy * k] as P,
    n: [dy / len, -dx / len] as P,
    dir: [dx / len, dy / len] as P,
    l: t.l[i]! + (t.l[i + 1]! - t.l[i]!) * k,
    r: t.r[i]! + (t.r[i + 1]! - t.r[i]!) * k,
  };
}
/** Pontos das bordas do tubo entre u0 e u1, com "folga" opcional (roupa por cima). */
function edges(t: Tube, u0 = 0, u1 = 1, grow: number | ((u: number) => number) = 0, steps = 9) {
  const L: P[] = [];
  const R: P[] = [];
  for (let s = 0; s <= steps; s++) {
    const u = u0 + ((u1 - u0) * s) / steps;
    const q = at(t, u);
    const g = typeof grow === 'number' ? grow : grow(u);
    L.push([q.p[0] - q.n[0] * (q.l + g), q.p[1] - q.n[1] * (q.l + g)]);
    R.push([q.p[0] + q.n[0] * (q.r + g), q.p[1] + q.n[1] * (q.r + g)]);
  }
  return { L, R };
}
function tubePath(
  t: Tube,
  u0 = 0,
  u1 = 1,
  grow: number | ((u: number) => number) = 0,
  caps: [boolean, boolean] = [true, true],
) {
  const { L, R } = edges(t, u0, u1, grow);
  const a = at(t, u0);
  const b = at(t, u1);
  const pts: P[] = [];
  if (caps[0]) pts.push([a.p[0] - a.dir[0] * a.l * 0.55, a.p[1] - a.dir[1] * a.l * 0.55]);
  pts.push(...L);
  if (caps[1]) pts.push([b.p[0] + b.dir[0] * b.l * 0.7, b.p[1] + b.dir[1] * b.l * 0.7]);
  pts.push(...R.reverse());
  return spline(pts);
}
const mirTube = (t: Tube): Tube => ({ c: t.c.map(mir), l: t.r, r: t.l });

/* ----------------------------------------------------------- pintura SVG */

const Uid = createContext('av');

/**
 * Parte pintada em cel shading (estilo anime): cor chapada, uma "lua" de sombra de borda dura
 * do lado direito (a própria forma deslocada) e um fio de luz do lado esquerdo, mais contorno.
 */
function Paint({
  name,
  d,
  fill,
  children,
  line = true,
  lw = 0.5,
  flat = false,
  opacity,
  cel = 1.3,
}: {
  name: string;
  d: string;
  fill: string;
  children?: ReactNode;
  line?: boolean;
  lw?: number;
  flat?: boolean;
  opacity?: number;
  cel?: number;
}) {
  const uid = useContext(Uid);
  const cid = `${uid}-${name}`;
  return (
    <g opacity={opacity}>
      <clipPath id={cid}>
        <path d={d} />
      </clipPath>
      {!flat && (
        <>
          <mask id={`${cid}-s`} maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="200">
            <path d={d} fill="#fff" />
            <path d={d} fill="#000" transform={`translate(${-cel} ${-cel * 0.3})`} />
          </mask>
          <mask id={`${cid}-h`} maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="200">
            <path d={d} fill="#fff" />
            <path d={d} fill="#000" transform={`translate(${cel * 0.35} ${cel * 0.12})`} />
          </mask>
        </>
      )}
      <path d={d} fill={fill} />
      {!flat && <path d={d} fill={dark(mix(fill, '#3a1d4a', 0.25), 0.3)} mask={`url(#${cid}-s)`} />}
      {!flat && <path d={d} fill={light(fill, 0.22)} mask={`url(#${cid}-h)`} />}
      <g clipPath={`url(#${cid})`}>{children}</g>
      {line && (
        <path
          d={d}
          fill="none"
          stroke={mix(fill, INK, 0.9)}
          strokeWidth={lw * 1.12}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}
/** Sombra pintada (desfocada). */
function Sh({ d, o = 0.3, c = INK, b = 1 }: { d: string; o?: number; c?: string; b?: 1 | 2 }) {
  const uid = useContext(Uid);
  return (
    <path
      d={d}
      fill={c === INK ? '#2a1630' : c}
      opacity={o * 0.85}
      filter={b === 2 ? `url(#${uid}-b2)` : undefined}
    />
  );
}
/** Brilho pintado (desfocado). */
function Hl({ d, o = 0.25, c = '#fff6ea', b = 1 }: { d: string; o?: number; c?: string; b?: 1 | 2 }) {
  const uid = useContext(Uid);
  return <path d={d} fill={c} opacity={o * 0.8} filter={b === 2 ? `url(#${uid}-b2)` : undefined} />;
}
/** Linha interna (dobra, costura, mecha). */
function Ln({ d, c = INK, o = 0.4, w = 0.3 }: { d: string; c?: string; o?: number; w?: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={c}
      strokeOpacity={o}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx},${cy} a${rx},${ry} 0 1 0 ${rx * 2},0 a${rx},${ry} 0 1 0 ${-rx * 2},0Z`;

/* ------------------------------------------------------------ anatomia */

const Y = {
  top: 11.6,
  brow: 19.4,
  eye: 21.7,
  nose: 25.2,
  mouth: 27.7,
  chin: 31.3,
  neck: 34.9,
  sh: 38.2,
  pit: 46,
  chest: 50.5,
  rib: 59,
  waist: 67.5,
  hip: 81,
  crotch: 88,
  knee: 113,
  calf: 123,
  ankle: 144.5,
  sole: 151,
};

const BODY = {
  magro: { w: 0.88, m: 0.82, fat: 0, sh: 0.96 },
  medio: { w: 1, m: 1, fat: 0, sh: 1 },
  atletico: { w: 1.02, m: 1.16, fat: 0, sh: 1.05 },
  forte: { w: 1.08, m: 1.42, fat: 0, sh: 1.13 },
  largo: { w: 1.1, m: 1.15, fat: 0.55, sh: 1.08 },
  pesado: { w: 1.22, m: 1.02, fat: 1, sh: 1.08 },
} as const;

function measure(a: Appearance) {
  const F = a.frame === 'fem';
  const B = BODY[a.body] ?? BODY.medio;
  const base = F
    ? {
        sh: 12.4,
        chest: 10.4,
        waist: 7.7,
        hip: 12,
        neck: 2.45,
        thigh: 6.3,
        knee: 2.45,
        calf: 3.6,
        arm: 2.55,
        fore: 2.15,
        head: 6.05,
      }
    : {
        sh: 15,
        chest: 12.2,
        waist: 9.8,
        hip: 10.8,
        neck: 3.15,
        thigh: 6.1,
        knee: 2.7,
        calf: 3.85,
        arm: 3.15,
        fore: 2.7,
        head: 6.4,
      };
  return {
    F,
    fat: B.fat,
    mus: B.m,
    sh: base.sh * B.w * B.sh,
    chest: base.chest * B.w * (1 + B.fat * 0.22) * (F ? 1 : Math.pow(B.m, 0.3)),
    waist: base.waist * B.w * (1 + B.fat * 0.6) * (B.m > 1.3 ? 1.04 : 1),
    hip: base.hip * B.w * (1 + B.fat * 0.3),
    neck: base.neck * Math.pow(B.m, 0.45) * (1 + B.fat * 0.25),
    thigh: base.thigh * B.w * (1 + B.fat * 0.42) * Math.pow(B.m, 0.25),
    knee: base.knee * B.w * (1 + B.fat * 0.3),
    calf: base.calf * B.w * (1 + B.fat * 0.35) * Math.pow(B.m, 0.3),
    arm: base.arm * Math.pow(B.m, 0.75) * B.w * (1 + B.fat * 0.22),
    fore: base.fore * Math.pow(B.m, 0.7) * B.w * (1 + B.fat * 0.3),
    head: base.head * 1.06 * (1 + B.fat * 0.06),
  };
}
type M = ReturnType<typeof measure>;

function armTube(m: M): Tube {
  const x = 50 - m.sh;
  const out = m.fat * 1.1 + (m.mus - 1) * 1.2;
  return {
    c: [
      [x + 2.6, Y.sh + 0.9],
      [x - 0.4 - out * 0.5, 50],
      [x - 1.1 - out, 64.5],
      [x - 0.5 - out * 0.8, 75],
      [x + 0.5 - out * 0.4, 84.5],
    ],
    l: [m.arm * 1.12, m.arm * 1.04, m.fore * 0.8, m.fore * 1.0, m.fore * 0.62],
    r: [m.arm * 0.95, m.arm * 0.98, m.fore * 0.74, m.fore * 0.86, m.fore * 0.6],
  };
}
function legTube(m: M): Tube {
  const kx = (m.F ? 3.3 : 4.3) + m.fat * 1.3;
  const ax = (m.F ? 3.6 : 4.6) + m.fat * 0.9;
  return {
    c: [
      [50 - m.hip * 0.47, Y.hip - 2],
      [50 - m.hip * 0.42, 99],
      [50 - kx, Y.knee],
      [50 - kx - 0.25, Y.calf],
      [50 - ax, Y.ankle],
    ],
    l: [m.thigh * 1.04, m.thigh * 0.86, m.knee, m.calf, 1.45],
    r: [m.thigh * 0.98, m.thigh * 0.7 - (m.F ? 0 : 0.4), m.knee * 0.92, m.calf * 0.8, 1.35],
  };
}
/** Contorno do tronco (pescoço→virilha). */
function torsoPath(m: M, grow = 0) {
  const g = grow;
  return sym([
    [50 - m.neck - 0.3 - g * 0.3, Y.neck - 0.8],
    [50 - m.sh * 0.62 - g, Y.neck + 1.3 - g * 0.6],
    [50 - m.sh + 0.6 - g, Y.sh + 0.5 - g * 0.5],
    [50 - m.chest - 0.5 - g, Y.pit],
    [50 - m.chest - (m.F ? 0.2 : 0) - g, Y.chest + 1],
    [50 - (m.chest + m.waist) / 2 - m.fat * 1.6 - g, Y.rib],
    [50 - m.waist - m.fat * 0.6 - g, Y.waist],
    [50 - m.hip - g, Y.hip],
    [50 - m.hip + 0.8 - g, Y.crotch - 1.6],
    [50 - m.hip * 0.4, Y.crotch + 1.4],
    [50, Y.crotch - 0.6],
  ]);
}
function headPath(m: M) {
  const h = m.head;
  return sym([
    [50, Y.top - 0.4],
    [50 - h * 0.66, Y.top + 0.6],
    [50 - h * 1.0, Y.top + 4.6],
    [50 - h * 1.02, Y.eye],
    [50 - h * 0.94, Y.nose],
    [50 - h * (m.F ? 0.6 : 0.7), Y.mouth + 0.9],
    [50 - (m.F ? 1.1 : 1.7), Y.chin - 0.5],
    [50, Y.chin],
  ]);
}

/* ------------------------------------------------------------- partes */

function Skin({ m, a, armL, armR, leg }: { m: M; a: Appearance; armL: Tube; armR: Tube; leg: Tube }) {
  const s = a.skin;
  const legR = mirTube(leg);
  const tattoo = a.accessories.includes('tatuagem');
  const ink = mix(s, '#1b2230', 0.75);
  return (
    <>
      {/* pernas */}
      {[leg, legR].map((t, i) => {
        const k = at(t, 0.5).p;
        return (
          <Paint key={i} name={`leg${i}`} d={tubePath(t, 0, 1, 0, [false, true])} fill={s}>
            {tattoo && i === 1 && (
              <g opacity={0.75}>
                <Ln
                  d={`M${k[0] - 2},97 q2,-2 4,0 q-2,2 -4,0 M${k[0] - 1},101 l2,3 M${k[0] + 1},101 l-2,3`}
                  c={ink}
                  o={0.9}
                  w={0.25}
                />
              </g>
            )}
          </Paint>
        );
      })}
      {/* tronco */}
      <Paint name="torso" d={torsoPath(m)} fill={s}>
        {/* clavículas, peito, barriga */}
        <Ln d={`M${50 - m.neck - 0.4},${Y.neck + 2.2} q${-3},-0.6 ${-m.sh * 0.5},0.4`} o={0.25} w={0.25} />
        <Ln d={`M${50 + m.neck + 0.4},${Y.neck + 2.2} q3,-0.6 ${m.sh * 0.5},0.4`} o={0.25} w={0.25} />
        {m.F ? (
          <>
            <Sh
              d={`M${50 - m.chest + 1},${Y.chest + 2.4} q${m.chest * 0.5},3.2 ${m.chest - 1.6},0 l0,1.2 q${-m.chest * 0.5},2.6 ${-(m.chest - 1.6)},0Z`}
              o={0.28}
            />
            <Sh
              d={`M51,${Y.chest + 2.4} q${m.chest * 0.5},3.2 ${m.chest - 1.6},0 l0,1.2 q${-m.chest * 0.5},2.6 ${-(m.chest - 1.6)},0Z`}
              o={0.34}
            />
            <Hl d={ell(50 - m.chest * 0.45, Y.chest - 0.5, 2.2, 1.6)} o={0.2} />
          </>
        ) : (
          <>
            <Sh
              d={`M${50 - m.chest + 1.5},${Y.chest + 1.6} q${m.chest * 0.5},2 ${m.chest - 2},0.2 l0,1 q${-m.chest * 0.5},1.2 ${-(m.chest - 2)},-0.2Z`}
              o={0.16 + (m.mus - 1) * 0.3}
            />
            <Sh
              d={`M52,${Y.chest + 1.8} q${m.chest * 0.5},-0.2 ${m.chest - 2},-0.2 l0,1 q${-m.chest * 0.5},1.4 ${-(m.chest - 2)},0.2Z`}
              o={0.2 + (m.mus - 1) * 0.3}
            />
          </>
        )}
        {m.mus > 1.1 && !m.fat && (
          <g opacity={Math.min(0.5, (m.mus - 1) * 1.2)}>
            <Ln d={`M50,${Y.chest + 5} L50,${Y.waist + 4}`} w={0.3} />
            {[0, 1, 2].map((r) => (
              <Ln key={r} d={`M${50 - 3},${Y.chest + 8 + r * 4.5} q3,0.7 6,0`} w={0.25} />
            ))}
          </g>
        )}
        {m.fat > 0 && (
          <Sh
            d={`M${50 - m.waist},${Y.waist + 6} q${m.waist},${5 + m.fat * 3} ${m.waist * 2},0 l0,2 q${-m.waist},${4 + m.fat * 3} ${-m.waist * 2},0Z`}
            o={0.3}
          />
        )}
        <Sh d={ell(50.2, Y.waist + 2.5, 0.45, 0.7)} o={0.45} b={2} />
        <Sh
          d={`M${50 - m.hip},${Y.crotch - 3} L50,${Y.crotch + 2} L${50 + m.hip},${Y.crotch - 3} L${50 + m.hip},${Y.crotch + 3} L${50 - m.hip},${Y.crotch + 3}Z`}
          o={0.25}
        />
      </Paint>
      {/* pescoço */}
      <Paint
        name="neck"
        d={spline([
          [50 - m.neck, Y.chin - 4],
          [50 - m.neck - 0.15, Y.neck - 0.4],
          [50 - m.neck - 0.9, Y.neck + 1.3],
          [50 + m.neck + 0.9, Y.neck + 1.3],
          [50 + m.neck + 0.15, Y.neck - 0.4],
          [50 + m.neck, Y.chin - 4],
        ])}
        fill={s}
        line={false}
      >
        <Sh d={ell(50.6, Y.chin - 0.6, m.neck + 1, 2.4)} o={0.42} />
        {!m.F && <Ln d={`M49.6,${Y.chin + 1.6} q0.4,1 0.6,1.6`} o={0.2} w={0.25} />}
      </Paint>
      {/* braços */}
      {[armL, armR].map((t, i) => {
        return (
          <Paint key={i} name={`arm${i}`} d={tubePath(t, 0, 1, 0, [true, false])} fill={s}>
            {tattoo && i === 0 && (
              <g>
                <Ln
                  d={`M${at(t, 0.62).p[0] - 1.6},${at(t, 0.62).p[1]} q1.6,-1.2 3.2,0 q-1.6,1.6 -3.2,0 m0.4,2.4 q1.2,-1 2.4,0 q-1.2,1.2 -2.4,0`}
                  c={ink}
                  o={0.85}
                  w={0.25}
                />
                <Ln
                  d={`M${at(t, 0.8).p[0] - 1.4},${at(t, 0.8).p[1]} l2.8,0.4 M${at(t, 0.85).p[0] - 1.3},${at(t, 0.85).p[1]} l2.6,0.4`}
                  c={ink}
                  o={0.8}
                  w={0.3}
                />
              </g>
            )}
          </Paint>
        );
      })}
    </>
  );
}

function Hand({ t, a, side, fist }: { t: Tube; a: Appearance; side: 0 | 1; fist: boolean }) {
  const q = at(t, 1);
  const ang = (Math.atan2(-q.dir[0], q.dir[1]) * 180) / Math.PI;
  const s = a.skin;
  const glove = a.accessories.includes('luvas');
  const palm = fist
    ? spline([
        [-1.7, -0.4],
        [1.7, -0.4],
        [2.15, 2.2],
        [1.8, 4.5],
        [-1.4, 4.8],
        [-2.15, 2.6],
      ])
    : spline([
        [-1.45, -0.6],
        [1.45, -0.6],
        [1.75, 3],
        [1.45, 6.2],
        [0.5, 7.5],
        [-0.85, 7.3],
        [-1.65, 5.6],
        [-1.75, 2.4],
      ]);
  const thumb = spline(
    fist
      ? [
          [1.2, 0.6],
          [2.5, 1.9],
          [1.8, 3.2],
          [0.4, 2.6],
        ]
      : [
          [1.3, 0.6],
          [2.4, 2.6],
          [2.1, 4.8],
          [1.3, 4.1],
        ],
  );
  const c = glove ? '#1c1a20' : s;
  return (
    <g
      transform={`translate(${q.p[0].toFixed(2)} ${q.p[1].toFixed(2)}) rotate(${ang.toFixed(1)}) scale(${side ? -1 : 1} 1)`}
    >
      <Paint name={`hand${side}`} d={palm} fill={c} lw={0.4}>
        {fist ? (
          <Ln d="M-1.8,1.8 q1.8,0.6 3.6,0 M-1.6,3.3 q1.6,0.5 3.2,0" o={0.35} w={0.22} />
        ) : (
          <Ln d="M-0.5,4.6 l0,2.4 M0.5,4.8 l0,2.4 M-1.3,4.3 l0,2" o={0.3} w={0.2} />
        )}
        {glove && (
          <path d={fist ? 'M-2.2,3.4 L2.2,3.4 L2.2,5 L-2.2,5Z' : 'M-2,5.3 L2,5.3 L2,8 L-2,8Z'} fill={s} />
        )}
      </Paint>
      <Paint name={`thumb${side}`} d={thumb} fill={c} lw={0.35} />
    </g>
  );
}

/* --------------------------------------------------------------- cabelo */

function hairShapes(m: M, a: Appearance) {
  const h = m.head;
  const L = 50 - h;
  const R = 50 + h;
  const st = a.hair.style;
  type Out = { back?: string; front?: string; extra?: string; strands: string[] };
  const cap = (hairline: P[], lift = 1.6): string =>
    spline([
      [L - 0.4, Y.eye - 0.2],
      [L - 0.9, Y.top + 4.6],
      [50 - h * 0.66, Y.top - lift + 0.6],
      [50, Y.top - lift],
      [50 + h * 0.66, Y.top - lift + 0.6],
      [R + 0.9, Y.top + 4.6],
      [R + 0.4, Y.eye - 0.2],
      ...hairline,
    ]);
  const std: P[] = [
    [R - 0.4, Y.brow - 0.4],
    [50 + h * 0.6, Y.top + 4.6],
    [50 + 1.5, Y.top + 4],
    [50 - 1.5, Y.top + 4.4],
    [50 - h * 0.62, Y.top + 4.8],
    [L + 0.4, Y.brow - 0.4],
  ];
  const strandsCap = [
    `M${50 - 1},${Y.top - 0.8} q-3,1.6 ${-h * 0.8},${5.4}`,
    `M${50 + 0.6},${Y.top - 0.6} q3,1.2 ${h * 0.75},${5.2}`,
    `M${50 - 3},${Y.top + 0.2} q-1.6,2.4 -2.2,5`,
    `M${50 + 2.6},${Y.top + 0.4} q2,2 2.4,4.6`,
  ];
  const out: Out = { strands: strandsCap };
  switch (st) {
    case 'careca':
      return { strands: [] } as Out;
    case 'raspado':
      out.front = cap(std, 0.5);
      out.strands = [];
      break;
    case 'curto':
      out.front = cap([
        [R - 0.3, Y.brow + 0.2],
        [50 + h * 0.62, Y.top + 4.4],
        [50 + 2.4, Y.top + 3.4],
        [50 + 0.6, Y.top + 4.4],
        [50 - 1.6, Y.top + 3.6],
        [50 - h * 0.62, Y.top + 4.4],
        [L + 0.3, Y.brow + 0.2],
      ]);
      break;
    case 'repartido':
      out.front = cap(
        [
          [R - 0.2, Y.brow + 0.6],
          [50 + h * 0.75, Y.top + 6.2],
          [50 + 2, Y.top + 6.8],
          [50 - 1.4, Y.top + 4.4],
          [50 - 2.6, Y.top + 3],
          [50 - h * 0.66, Y.top + 4],
          [L + 0.3, Y.brow - 0.2],
        ],
        2.2,
      );
      out.strands = [
        `M${50 - 2.6},${Y.top - 0.4} q4,2 ${h + 1.4},${7}`,
        `M${50 - 2},${Y.top + 1} q3,2 ${h},${6}`,
        `M${50 - 3},${Y.top} q-2,2 -3.4,5.4`,
      ];
      break;
    case 'franja':
      out.front = cap([
        [R + 0.6, Y.nose + 1],
        [R - 0.6, Y.nose],
        [R - 0.8, Y.brow + 0.6],
        [50 + 2.6, Y.brow + 0.2],
        [50, Y.brow + 0.6],
        [50 - 2.6, Y.brow + 0.2],
        [L + 0.8, Y.brow + 0.6],
        [L + 0.6, Y.nose],
        [L - 0.6, Y.nose + 1],
      ]);
      out.back = sym([
        [50, Y.top - 1.2],
        [L - 1.6, Y.top + 5],
        [L - 1.8, Y.nose + 1.2],
        [L - 0.4, Y.mouth + 0.4],
        [50, Y.mouth],
      ]);
      out.strands = [
        ...strandsCap,
        `M${50 - 1.6},${Y.top + 2} l-0.6,${Y.brow - Y.top - 2}`,
        `M${50 + 1.4},${Y.top + 2} l0.6,${Y.brow - Y.top - 2}`,
      ];
      break;
    case 'chanel':
      out.front = cap(
        [
          [R + 1.4, Y.chin + 0.6],
          [R + 0.1, Y.chin + 0.4],
          [R - 0.4, Y.nose],
          [R - 1, Y.brow - 0.2],
          [50 + 1, Y.top + 5],
          [50 - 1.2, Y.top + 3.4],
          [L + 0.8, Y.brow + 0.8],
          [L + 0.2, Y.nose + 1],
          [L - 0.2, Y.chin + 0.4],
          [L - 1.6, Y.chin + 0.6],
        ],
        2,
      );
      out.back = sym([
        [50, Y.top - 1.6],
        [L - 2, Y.top + 5],
        [L - 2.2, Y.mouth],
        [L - 1.4, Y.chin + 1],
        [50, Y.chin + 1],
      ]);
      out.strands = [
        ...strandsCap,
        `M${L + 0.6},${Y.eye} q-0.8,4 -0.6,${Y.chin - Y.eye}`,
        `M${R - 0.6},${Y.eye} q0.8,4 0.6,${Y.chin - Y.eye}`,
      ];
      break;
    case 'longo':
    case 'ondulado': {
      const wav = st === 'ondulado';
      const end = wav ? 70 : 64;
      out.back = sym([
        [50, Y.top - 1.8],
        [L - 2.2, Y.top + 5],
        [L - 2.6, Y.chin],
        [50 - m.sh * 0.72, Y.sh + 2],
        [50 - m.sh * 0.68 + (wav ? -1.2 : 0), end - 12],
        [50 - m.sh * 0.5, end],
        [50, end - 2],
      ]);
      const cur = (sx: number): P[] =>
        wav
          ? [
              [50 + sx * (h - 1), Y.brow],
              [50 + sx * (h + 0.8), Y.mouth],
              [50 + sx * (h + 0.2), Y.chin + 3],
              [50 + sx * (h + 2.2), Y.sh + 4],
              [50 + sx * (h + 0.8), 49],
              [50 + sx * (h + 1.6), 54],
              [50 + sx * (h - 0.4), 52],
              [50 + sx * (h - 1.2), Y.sh + 2],
              [50 + sx * (h - 1.8), Y.chin + 1],
              [50 + sx * (h - 1.4), Y.nose],
            ]
          : [
              [50 + sx * (h - 1), Y.brow],
              [50 + sx * (h + 0.8), Y.mouth],
              [50 + sx * (h + 1.4), Y.sh + 2],
              [50 + sx * (h + 1.8), 52],
              [50 + sx * (h + 0.4), 54.5],
              [50 + sx * (h - 0.6), 50],
              [50 + sx * (h - 1.4), Y.chin + 1],
              [50 + sx * (h - 1.2), Y.nose],
            ];
      out.front = cap(
        [
          [R - 0.6, Y.brow + 0.4],
          [50 + h * 0.5, Y.top + 4.4],
          [50.3, Y.top + 2.6],
          [50 - h * 0.5, Y.top + 4.4],
          [L + 0.6, Y.brow + 0.4],
        ],
        2,
      );
      out.extra = `${spline(cur(-1))} ${spline(cur(1))}`;
      out.strands = [
        `M50.3,${Y.top - 1} q-3,1 ${-h},${6}`,
        `M50.3,${Y.top - 1} q3,1 ${h},${6}`,
        `M${L},${Y.mouth} q-1,8 0.4,${22}`,
        `M${R},${Y.mouth} q1,8 -0.4,${22}`,
      ];
      break;
    }
    case 'rabo':
      out.front = cap(
        [
          [R - 0.2, Y.brow + 0.6],
          [50 + h * 0.6, Y.top + 3.6],
          [50.4, Y.top + 2.2],
          [50 - h * 0.6, Y.top + 3.6],
          [L + 0.2, Y.brow + 0.6],
        ],
        1.2,
      );
      out.back = spline([
        [50 + 1, Y.top - 0.4],
        [50 + 3.4, Y.top - 3],
        [R + 3.8, Y.top + 1],
        [R + 4.6, Y.chin + 4],
        [R + 3.4, 54],
        [R + 1.6, 58],
        [R + 1.4, 48],
        [R + 1, Y.chin + 2],
        [R - 0.4, Y.top + 4],
      ]);
      out.extra = `${ell(R + 2.6, Y.top + 0.6, 1.6, 1.1)} M${L - 0.2},${Y.eye} q-1.2,4 -0.6,${Y.chin - Y.eye + 2} l0.8,0 q-0.2,-5 0.6,-${Y.chin - Y.eye + 1}Z`;
      out.strands = [...strandsCap, `M${R + 2.6},${Y.top + 2} q2,10 0.6,${42 - Y.top}`];
      break;
    case 'coque':
      out.front = cap(
        [
          [R - 0.2, Y.brow + 0.4],
          [50 + h * 0.6, Y.top + 3.6],
          [50, Y.top + 2.8],
          [50 - h * 0.6, Y.top + 3.6],
          [L + 0.2, Y.brow + 0.4],
        ],
        1.3,
      );
      out.back = ell(50, Y.top - 3.2, 3.8, 3.4);
      out.strands = [
        ...strandsCap,
        `M47.2,${Y.top - 3} q2.8,-2.6 5.6,0`,
        `M47.6,${Y.top - 1.6} q2.4,1 4.8,0`,
      ];
      break;
    case 'cacheado': {
      const cloud: P[] = [];
      for (let i = 0; i < 26; i++) {
        const t = (i / 26) * Math.PI * 2;
        const r = (i % 2 ? 11.8 : 12.8) + (Math.sin(t * 3) + 1) * 0.4;
        cloud.push([50 + Math.cos(t) * r * 0.92, 19 + Math.sin(t) * r * (t > 0 && t < Math.PI ? 0.62 : 0.9)]);
      }
      out.back = spline(cloud);
      out.front = spline([
        [L - 2.4, Y.mouth],
        [L - 3, Y.top + 2],
        [50, Y.top - 4],
        [R + 3, Y.top + 2],
        [R + 2.4, Y.mouth],
        [R - 0.2, Y.nose],
        [R - 0.6, Y.brow - 0.4],
        [50 + 3, Y.top + 4.6],
        [50 + 0.8, Y.top + 3.4],
        [50 - 1.4, Y.top + 4.8],
        [50 - 3.6, Y.top + 3.8],
        [L + 0.6, Y.brow - 0.4],
        [L + 0.2, Y.nose],
      ]);
      out.strands = Array.from({ length: 14 }, (_, i) => {
        const x = 50 - 10 + (i % 7) * 3.3 + (i > 6 ? 1.6 : 0);
        const y = Y.top - 2 + (i > 6 ? 4 : 0) + ((i * 7) % 3);
        return `M${x},${y} a1.2,1.2 0 1 1 1.6,0.8`;
      });
      break;
    }
    case 'moicano':
      out.front = spline([
        [50 - 2.2, Y.top + 4],
        [50 - 2.8, Y.top - 1],
        [50 - 2, Y.top - 5.5],
        [50 - 0.8, Y.top - 3],
        [50, Y.top - 7.5],
        [50 + 1, Y.top - 3],
        [50 + 2.2, Y.top - 5.6],
        [50 + 2.8, Y.top - 1],
        [50 + 2.2, Y.top + 4],
        [50, Y.top + 5.4],
      ]);
      out.extra = cap(std, 0.4);
      out.strands = [
        `M50,${Y.top + 4} L50,${Y.top - 6}`,
        `M48.6,${Y.top + 3} L48,${Y.top - 4}`,
        `M51.4,${Y.top + 3} L52,${Y.top - 4}`,
      ];
      break;
    case 'trancas':
      out.front = cap(
        [
          [R - 0.4, Y.brow + 0.4],
          [50 + h * 0.5, Y.top + 4.4],
          [50.2, Y.top + 2.8],
          [50 - h * 0.5, Y.top + 4.4],
          [L + 0.4, Y.brow + 0.4],
        ],
        1.2,
      );
      out.strands = [...strandsCap, `M50.2,${Y.top - 1.2} L50.2,${Y.top + 2.8}`];
      break;
    case 'baguncado':
      out.front = spline(
        [
          [L - 0.6, Y.eye + 0.6],
          [L - 2.6, Y.top + 6],
          [L - 1.4, Y.top + 2.8],
          [L - 2.8, Y.top - 1],
          [50 - 3.6, Y.top - 1],
          [50 - 2.4, Y.top - 5],
          [50 + 0.4, Y.top - 2.4],
          [50 + 3.2, Y.top - 5.4],
          [50 + 4.2, Y.top - 1.6],
          [R + 3, Y.top - 0.6],
          [R + 1.6, Y.top + 3],
          [R + 2.8, Y.top + 6.6],
          [R + 0.4, Y.eye + 0.6],
          [R - 0.6, Y.brow - 0.2],
          [50 + 3.2, Y.eye - 0.6],
          [50 + 2, Y.brow - 1.6],
          [50 + 0.4, Y.eye + 0.2],
          [50 - 1.6, Y.brow - 1.4],
          [50 - 3.6, Y.eye - 0.4],
          [L + 1, Y.brow - 0.6],
        ],
        true,
        1,
      );
      out.strands = [
        `M50,${Y.top - 1} q-1,4 0.4,${Y.eye - Y.top}`,
        `M${50 + 2.4},${Y.top - 2} q0,4 -0.4,${Y.brow - Y.top + 1}`,
        `M${50 - 3},${Y.top - 0.4} q1,4 -0.6,${Y.eye - Y.top - 1}`,
        `M${L - 1},${Y.top + 3} q1.6,3 1.2,6`,
        `M${R + 1},${Y.top + 3} q-1.6,3 -1.2,6`,
      ];
      break;
  }
  return out;
}

function Braids({ m, color }: { m: M; color: string }) {
  return (
    <>
      {[-1, 1].map((sx) => {
        const x0 = 50 + sx * (m.head + 0.6);
        const segs = Array.from({ length: 9 }, (_, i) => {
          const y = Y.mouth + i * 3.6;
          const x = x0 + sx * Math.min(i, 4) * 0.5 + (i % 2 ? sx * 0.5 : 0);
          return (
            <Paint
              key={i}
              name={`braid${sx}${i}`}
              d={ell(x, y, 1.55 - i * 0.04, 2.1)}
              fill={color}
              lw={0.35}
            />
          );
        });
        return <g key={sx}>{segs}</g>;
      })}
    </>
  );
}

/* --------------------------------------------------------------- roupas */

type TopKind = Appearance['top']['style'];
const LONG: TopKind[] = [
  'cropped',
  'camisa',
  'moletom',
  'jaqueta',
  'sobretudo',
  'quimono',
  'manto',
  'terno',
  'colete',
];

function Top({ m, a, armL, armR, tucked }: { m: M; a: Appearance; armL: Tube; armR: Tube; tucked: boolean }) {
  const { style, color, accent } = a.top;
  const c = color;
  const ac = accent;
  const hem =
    style === 'cropped'
      ? 63
      : tucked
        ? Y.hip - 0.5
        : style === 'sobretudo'
          ? 120
          : style === 'quimono'
            ? 94
            : style === 'terno'
              ? 90
              : 87;
  const g =
    style === 'moletom' || style === 'sobretudo' || style === 'quimono'
      ? 1.1
      : style === 'jaqueta'
        ? 0.9
        : 0.6;
  const loose = style !== 'regata' && style !== 'cropped';
  const neckD = style === 'regata' ? 4.5 : style === 'cropped' ? 3.4 : style === 'camisa' ? 2.6 : 1.4;
  const neckW = style === 'regata' ? m.neck + 2.4 : style === 'cropped' ? m.neck + 4.6 : m.neck + 0.9;
  const hemX = loose
    ? Math.max(m.hip, m.waist + 1.2) + g + (style === 'sobretudo' ? 3.5 : style === 'quimono' ? 1.6 : 0)
    : m.hip * 0.95 + 0.5;
  const sideAt = (y: number) => {
    if (y <= Y.waist) return m.waist + m.fat * 0.6 + g + (loose ? 1 : 0);
    if (y <= Y.hip) return (loose ? Math.max(m.waist + 1.2, m.hip) : m.hip) + g;
    return hemX;
  };
  const shirt = (
    neckDepth: number,
    neckWidth: number,
    hemY: number,
    shoulderX = m.sh - 0.4,
    strap = false,
  ) => {
    const left: P[] = strap
      ? [
          [50 - neckWidth, Y.neck + 2.4],
          [50 - neckWidth - 1.4, Y.neck + 2.2],
          [50 - m.chest + 0.6, Y.pit - 0.6],
        ]
      : [
          [50 - neckWidth, Y.neck - 0.6],
          [50 - m.sh * 0.62 - g, Y.neck + 1.1 - g * 0.4],
          [50 - shoulderX - g, Y.sh + 0.3 - g * 0.4],
        ];
    left.push(
      [50 - m.chest - g - 0.4, Y.pit],
      [50 - m.chest - g - (m.F ? 0.1 : 0), Y.chest + 1],
      [50 - (m.chest + sideAt(Y.waist)) / 2 - m.fat * 1.4 - (loose ? 0.4 : 0), Y.rib],
      [50 - sideAt(Y.waist), Math.min(Y.waist, hemY - 2)],
    );
    if (hemY > Y.waist + 4) left.push([50 - sideAt(Math.min(hemY - 2, Y.hip)), Math.min(hemY - 2, Y.hip)]);
    if (hemY > Y.hip + 6) left.push([50 - sideAt(hemY) - 0.2, hemY - 2]);
    left.push([50 - sideAt(hemY) + 0.3, hemY], [50, hemY + 0.4]);
    const right = left.map(mir).reverse();
    return spline([
      ...left,
      ...right.slice(1),
      [50 + neckWidth * 0.55, Y.neck + neckDepth * 0.7],
      [50, Y.neck + neckDepth],
      [50 - neckWidth * 0.55, Y.neck + neckDepth * 0.7],
    ]);
  };

  const sleeveEnd = LONG.includes(style) ? 1 : style === 'camiseta' ? 0.34 : 0;
  const sleeveGrow = style === 'moletom' || style === 'sobretudo' ? 0.6 : style === 'jaqueta' ? 0.5 : 0.35;
  const folds = (t: Tube) =>
    [0.35, 0.55, 0.72].map((u, i) => {
      const q = at(t, u);
      return `M${q.p[0] - q.l - 0.3},${q.p[1] + i * 0.3} q${q.l + q.r / 2},${-1.1} ${q.l + q.r + 0.6},${0.6}`;
    });

  const sleeves = (col: string, tag: string, grow = sleeveGrow, end = sleeveEnd) =>
    end > 0 &&
    [armL, armR].map((t, i) => (
      <Paint key={tag + i} name={`${tag}${i}`} d={tubePath(t, 0, end, grow, [false, end < 1])} fill={col}>
        {end > 0.5 && folds(t).map((d, k) => <Ln key={k} d={d} o={0.35} w={0.28} />)}
        {end === 1 && <Sh d={ell(at(t, 0.98).p[0], at(t, 0.98).p[1] - 0.6, 3, 1)} o={0.3} />}
      </Paint>
    ));
  const cuffs = (col: string) =>
    sleeveEnd === 1 &&
    [armL, armR].map((t, i) => {
      const { L, R } = edges(t, 0.92, 1, sleeveGrow + 0.25, 2);
      return (
        <Paint
          key={'cf' + i}
          name={`cuff${i}`}
          d={poly([...L, ...R.reverse()])}
          fill={dark(col, 0.18)}
          lw={0.35}
        />
      );
    });

  const torsoShade = (
    <>
      <Ln d={`M${50 - m.chest + 0.4},${Y.pit + 1} q2,6 4.6,10`} o={0.35} w={0.3} />
      <Ln d={`M${50 + m.chest - 0.4},${Y.pit + 1} q-2,6 -4.4,9`} o={0.35} w={0.3} />
      <Ln d={`M${50 - 4},${hem - 3} q2,-3 1.4,-8 M${50 + 3},${hem - 2} q-1,-3 0.2,-7`} o={0.3} w={0.28} />
    </>
  );

  const open = style === 'jaqueta' || style === 'sobretudo' || style === 'quimono';
  const inner = open && (
    <Paint
      name="inner"
      d={shirt(1.4, m.neck + 0.8, tucked ? Y.hip - 0.5 : Math.min(hem, 86), m.sh - 0.8)}
      fill={ac}
    >
      {torsoShade}
    </Paint>
  );

  if (style === 'manto') {
    const cl = spline([
      [50 - m.neck - 1.6, Y.neck - 1],
      [50 - m.sh - 2, Y.sh + 1],
      [50 - m.sh - 4.6, 70],
      [50 - m.sh - 6.4, 120],
      [50 - m.sh - 5.4, 142],
      [50 - 6, 143.6],
      [50 - 2.2, 96],
      [50 - 1.4, Y.neck + 6],
      [50 + 1.4, Y.neck + 6],
      [50 + 2.2, 96],
      [50 + 6, 143.6],
      [50 + m.sh + 5.4, 142],
      [50 + m.sh + 6.4, 120],
      [50 + m.sh + 4.6, 70],
      [50 + m.sh + 2, Y.sh + 1],
      [50 + m.neck + 1.6, Y.neck - 1],
    ]);
    return (
      <>
        <Paint name="robe" d={shirt(2, m.neck + 0.8, 140)} fill={dark(c, 0.35)}>
          <Ln d={`M50,${Y.neck + 4} L50,140`} o={0.4} />
        </Paint>
        <Paint name="cloak" d={cl} fill={c}>
          {[-1, 1].map((sx) => (
            <g key={sx}>
              <Ln
                d={`M${50 + sx * (m.sh + 1)},${Y.sh + 6} q${sx * 2},30 ${sx * 3.4},${96}`}
                o={0.4}
                w={0.35}
              />
              <Ln
                d={`M${50 + sx * (m.sh - 3)},${Y.sh + 10} q${sx * 0.8},30 ${sx * 0.4},${88}`}
                o={0.3}
                w={0.3}
              />
              <Sh
                d={`M${50 + sx * 3},${Y.neck + 6} L${50 + sx * 6},143 L${50 + sx * 9},143 L${50 + sx * 6},${Y.neck + 6}Z`}
                o={0.35}
              />
            </g>
          ))}
          <path d={`M${50 - 6},140 L${50 + 6},140`} stroke={ac} strokeWidth={0} />
          <path
            d={`${spline([
              [50 - m.sh - 6.4, 138],
              [50 - 6, 141],
              [50 - 6, 143.6],
              [50 - m.sh - 5.4, 142],
            ])}`}
            fill={ac}
            opacity={0.85}
          />
          <path
            d={`${spline([
              [50 + m.sh + 6.4, 138],
              [50 + 6, 141],
              [50 + 6, 143.6],
              [50 + m.sh + 5.4, 142],
            ])}`}
            fill={ac}
            opacity={0.85}
          />
        </Paint>
        <Paint name="clasp" d={ell(50, Y.neck + 3.2, 1.3, 1.1)} fill={ac === c ? '#b89a52' : ac} lw={0.35} />
      </>
    );
  }

  const bodyD =
    style === 'regata'
      ? shirt(neckD, neckW, hem, m.sh, true)
      : style === 'camisa'
        ? shirt(2.8, m.neck + 0.7, hem)
        : open
          ? null
          : shirt(neckD, neckW, hem);

  return (
    <>
      {style === 'moletom' && !a.hood && (
        <Paint
          name="hooddown"
          d={spline([
            [50 - m.neck - 4.6, Y.neck + 1],
            [50 - m.neck - 3.4, Y.neck - 3.6],
            [50, Y.neck - 4],
            [50 + m.neck + 3.4, Y.neck - 3.6],
            [50 + m.neck + 4.6, Y.neck + 1],
            [50, Y.neck + 3.4],
          ])}
          fill={dark(c, 0.2)}
        />
      )}
      {sleeves(style === 'colete' ? ac : c, 'slv')}
      {cuffs(style === 'colete' ? ac : c)}
      {inner}
      {bodyD && (
        <Paint name="top" d={bodyD} fill={c}>
          {torsoShade}
          {style === 'regata' && m.F && (
            <Ln
              d={`M${50 - neckW},${Y.neck + 2.6} q${neckW},${neckD + 1.6} ${neckW * 2},0`}
              c={light(c, 0.4)}
              o={0.6}
              w={0.6}
            />
          )}
          {style === 'cropped' && (
            <path
              d={`M${50 - m.chest - 1},${hem - 0.4} l1.6,1.4 l1.6,-1.6 l1.4,2 l1.8,-1.8 l1.2,1.4 l1.6,-1.2 l1.8,2 l1.6,-1.8 l1.4,1.4 l1.6,-1.6 l1.8,1.6 l1.4,-1.4 l1.6,1.2 L${50 + m.chest + 1},${hem + 3}Z`}
              fill={INK}
              opacity={0}
            />
          )}
          {style === 'camisa' && (
            <>
              <Ln d={`M50,${Y.neck + 2.8} L50,${hem}`} o={0.45} w={0.3} />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <circle key={i} cx={50.6} cy={Y.neck + 5 + i * 7} r={0.35} fill={light(c, 0.5)} />
              ))}
            </>
          )}
          {style === 'moletom' && (
            <>
              <Paint
                name="pocket"
                d={poly([
                  [50 - 6.6, 84.4],
                  [50 - 4.6, 75.5],
                  [50 + 4.6, 75.5],
                  [50 + 6.6, 84.4],
                ])}
                fill={c}
                lw={0.35}
              >
                <Sh
                  d={poly([
                    [50 - 4.6, 75.5],
                    [50 + 4.6, 75.5],
                    [50 + 4.6, 76.6],
                    [50 - 4.6, 76.6],
                  ])}
                  o={0.35}
                />
              </Paint>
              <path
                d={`M${50 - m.chest - g},84.4 L${50 + m.chest + g},84.4 L${50 + m.chest + g},88 L${50 - m.chest - g},88Z`}
                fill={dark(c, 0.2)}
              />
              <Ln d={`M48.4,${Y.neck + 1} l-0.3,9 M51.6,${Y.neck + 1} l0.3,9`} c={ac} o={1} w={0.45} />
            </>
          )}
          {style === 'colete' && (
            <>
              {[-1, 1].map((sx) => (
                <g key={sx}>
                  <Paint
                    name={`pouch${sx}`}
                    d={poly([
                      [50 + sx * 2, 62],
                      [50 + sx * 7.4, 62],
                      [50 + sx * 7.4, 71],
                      [50 + sx * 2, 71],
                    ])}
                    fill={dark(c, 0.15)}
                    lw={0.35}
                  />
                  <Paint
                    name={`pouchb${sx}`}
                    d={poly([
                      [50 + sx * 2, 73],
                      [50 + sx * 7.4, 73],
                      [50 + sx * 7.4, 81],
                      [50 + sx * 2, 81],
                    ])}
                    fill={dark(c, 0.15)}
                    lw={0.35}
                  />
                </g>
              ))}
              <Ln d={`M${50 - m.chest},${Y.chest - 2} L${50 + m.chest},${Y.chest - 2}`} o={0.5} w={0.5} />
            </>
          )}
          {style === 'terno' && (
            <>
              <path
                d={`M${50 - m.neck - 0.8},${Y.neck} L50,${Y.waist - 2} L${50 + m.neck + 0.8},${Y.neck} L${50 + 2.4},${Y.neck + 2} L50,${Y.waist - 4} L${50 - 2.4},${Y.neck + 2}Z`}
                fill={light(ac, 0.75)}
              />
              <path
                d={`M49.3,${Y.neck + 1.6} L50.7,${Y.neck + 1.6} L51,${Y.waist - 6} L50,${Y.waist - 4.4} L49,${Y.waist - 6}Z`}
                fill={ac}
              />
              <Ln
                d={`M${50 - m.neck - 0.8},${Y.neck} L${50 - 4.6},${Y.chest - 1} L50,${Y.waist - 2} M${50 + m.neck + 0.8},${Y.neck} L${50 + 4.6},${Y.chest - 1} L50,${Y.waist - 2} M50,${Y.waist - 2} L50,${hem}`}
                o={0.6}
                w={0.4}
              />
              <circle cx={50.4} cy={Y.waist + 1} r={0.5} fill={dark(c, 0.4)} />
            </>
          )}
        </Paint>
      )}
      {open && (
        <>
          {[-1, 1].map((sx) => {
            const pts: P[] = [
              [50 + sx * (m.neck + 0.6), Y.neck - 0.8],
              [50 + sx * (m.sh * 0.62 + g), Y.neck + 1.1 - g * 0.4],
              [50 + sx * (m.sh - 0.4 + g), Y.sh + 0.3 - g * 0.4],
              [50 + sx * (m.chest + g + 0.4), Y.pit],
              [50 + sx * (m.chest + g), Y.chest + 1],
              [50 + sx * (sideAt(Y.waist) + 0.4), Y.waist],
              [50 + sx * sideAt(Y.hip), Math.min(Y.hip, hem - 2)],
              ...(hem > Y.hip + 6 ? ([[50 + sx * (sideAt(hem) + 0.4), hem - 2]] as P[]) : []),
              [50 + sx * sideAt(hem), hem],
              [50 + sx * (style === 'sobretudo' ? 5.5 : 4.2), hem + 0.2],
              [50 + sx * (style === 'quimono' ? 3.4 : 3.8), Y.waist + 2],
              [50 + sx * (style === 'sobretudo' ? 5.2 : 3.4), Y.chest + 2],
              [50 + sx * (m.neck + 1.6), Y.neck + 3],
            ];
            const d = spline(pts);
            return (
              <Paint key={sx} name={`panel${sx}`} d={d} fill={c}>
                <Sh
                  d={`M${50 + sx * 3.4},${Y.neck + 2} L${50 + sx * 6.4},${Y.neck + 2} L${50 + sx * 6.6},${hem} L${50 + sx * 3.8},${hem}Z`}
                  o={0.28}
                />
                <Ln
                  d={`M${50 + sx * (m.chest - 1)},${Y.pit + 2} q${-sx * 1.2},10 ${sx * 0.4},${hem - Y.pit - 4}`}
                  o={0.35}
                  w={0.3}
                />
                {style === 'jaqueta' && (
                  <>
                    <Ln
                      d={`M${50 + sx * 4},${Y.neck + 4} L${50 + sx * 4.4},${hem}`}
                      c={light(c, 0.5)}
                      o={0.55}
                      w={0.3}
                    />
                  </>
                )}
                {style === 'quimono' && (
                  <path
                    d={spline([
                      [50 + sx * (m.neck + 0.6), Y.neck - 0.8],
                      [50 + sx * 3.4, Y.chest + 2],
                      [50 + sx * 3.4, Y.waist + 2],
                      [50 + sx * 4.2, hem + 0.2],
                      [50 + sx * 6.2, hem + 0.2],
                      [50 + sx * 5.8, Y.waist],
                      [50 + sx * 5.4, Y.chest + 1],
                      [50 + sx * (m.neck + 2.6), Y.neck + 1],
                    ])}
                    fill={ac}
                  />
                )}
              </Paint>
            );
          })}
          {(style === 'jaqueta' || style === 'sobretudo') &&
            [-1, 1].map((sx) => (
              <Paint
                key={'lap' + sx}
                name={`lapel${sx}`}
                d={spline([
                  [50 + sx * (m.neck + 0.4), Y.neck - 1.2],
                  [50 + sx * (m.neck + 3.6), Y.neck - 0.4],
                  [50 + sx * 7, Y.neck + 4.6],
                  [50 + sx * 5.2, Y.chest + 1.6],
                  [50 + sx * 3.6, Y.neck + 5],
                ])}
                fill={dark(c, 0.12)}
                lw={0.4}
              />
            ))}
          {style === 'quimono' &&
            [armL, armR].map((t, i) => {
              const sx = i ? 1 : -1;
              const e = at(t, 0.45).p;
              const d = spline([
                [e[0] - sx * 0.4, Y.sh + 4],
                [e[0] + sx * (2.8 + m.fat), e[1] - 2],
                [e[0] + sx * (4.4 + m.fat), 80],
                [e[0] + sx * 2, 82],
                [e[0] - sx * 3.4, 80.6],
                [e[0] - sx * 3.6, 70],
                [e[0] - sx * 3, e[1]],
              ]);
              return (
                <Paint key={'ks' + i} name={`ksleeve${i}`} d={d} fill={c}>
                  <Ln d={`M${e[0] + sx * 1.6},${e[1]} q${sx * 0.8},8 ${sx * 1.6},${80 - e[1]}`} o={0.4} />
                  <path
                    d={`M${e[0] + sx * 4.4},78 L${e[0] - sx * 3.4},78.6 L${e[0] - sx * 3.4},80.6 L${e[0] + sx * 4.4},80.2Z`}
                    fill={ac}
                  />
                </Paint>
              );
            })}
        </>
      )}
    </>
  );
}

function Bottom({ m, a, leg }: { m: M; a: Appearance; leg: Tube }) {
  const { style, color } = a.bottom;
  const c = color;
  if (style === 'saia' || style === 'saia_longa') {
    const long = style === 'saia_longa';
    const hy = long ? 141 : 101;
    const fl = long ? 7 : 4.4 + m.fat;
    const hemPts: P[] = [];
    const W = m.hip + fl;
    for (let i = 0; i <= 10; i++) {
      const x = 50 - W + (2 * W * i) / 10;
      hemPts.push([x, hy + (i % 2 ? 1.2 : 0) - Math.abs(i - 5) * 0.2]);
    }
    const d = spline([
      [50 - m.waist - 0.8, Y.hip - 2.5],
      [50 - m.hip - 1.2, Y.hip + 2],
      [50 - W + 0.4, hy - 4],
      ...hemPts,
      [50 + W - 0.4, hy - 4],
      [50 + m.hip + 1.2, Y.hip + 2],
      [50 + m.waist + 0.8, Y.hip - 2.5],
    ]);
    return (
      <Paint name="skirt" d={d} fill={c}>
        {Array.from({ length: 7 }, (_, i) => {
          const x = 50 - W * 0.8 + (W * 1.6 * i) / 6;
          return <Ln key={i} d={`M${50 + (x - 50) * 0.4},${Y.hip} L${x},${hy}`} o={0.35} w={0.3} />;
        })}
        {!long && (
          <Sh
            d={`M${50 - W},${Y.hip + 9} L${50 + W},${Y.hip + 9} L${50 + W},${Y.hip + 11} L${50 - W},${Y.hip + 11}Z`}
            o={0.3}
          />
        )}
        <path
          d={`M${50 - m.waist - 1},${Y.hip - 2.5} L${50 + m.waist + 1},${Y.hip - 2.5} L${50 + m.hip + 0.6},${Y.hip + 0.8} L${50 - m.hip - 0.6},${Y.hip + 0.8}Z`}
          fill={dark(c, 0.2)}
        />
      </Paint>
    );
  }
  const shorts = style === 'shorts';
  const u1 = shorts ? 0.27 : 0.985;
  const grow =
    style === 'larga'
      ? (u: number) => 1.6 + Math.sin(Math.min(1, u * 1.1) * Math.PI) * 1.6 - (u > 0.94 ? (u - 0.94) * 30 : 0)
      : style === 'cargo'
        ? (u: number) => 1.1 + (u > 0.9 ? -0.5 : 0)
        : shorts
          ? 1
          : 0.55;
  const legs = [leg, mirTube(leg)];
  const paths = legs.map((t) => {
    const { L, R } = edges(t, 0, u1, grow);
    return { L, R };
  });
  const pts: P[] = [];
  const l = paths[0]!;
  const r = paths[1]!;
  pts.push([50 - m.hip * 0.95 - 0.6, Y.hip - 3]);
  pts.push(...l.L.slice(1));
  pts.push(...l.R.slice().reverse().slice(0, -2));
  pts.push([50, Y.crotch + 1.2]);
  pts.push(...r.L.slice(2));
  pts.push(...r.R.slice().reverse().slice(0, -1));
  pts.push([50 + m.hip * 0.95 + 0.6, Y.hip - 3]);
  const d = spline(pts);
  return (
    <Paint name="pants" d={d} fill={c}>
      <path
        d={`M${50 - m.hip - 1},${Y.hip - 3.2} L${50 + m.hip + 1},${Y.hip - 3.2} L${50 + m.hip + 1},${Y.hip - 0.6} L${50 - m.hip - 1},${Y.hip - 0.6}Z`}
        fill={dark(c, 0.2)}
      />
      <Ln d={`M50.4,${Y.hip - 0.6} q0.2,4 -0.4,6.6`} o={0.45} w={0.3} />
      <Ln
        d={`M${50 - m.hip + 1},${Y.hip} q2.6,0.6 3.6,3.6 M${50 + m.hip - 1},${Y.hip} q-2.6,0.6 -3.6,3.6`}
        o={0.4}
        w={0.3}
      />
      {!shorts &&
        legs.map((t, i) => {
          const k = at(t, 0.5).p;
          const sx = i ? 1 : -1;
          return (
            <g key={i}>
              <Ln
                d={`M${k[0] - 2.4},${Y.knee + 2} q2,-1 4.4,0.6 M${k[0] - 2},${Y.knee - 3} q2,1.2 4,-0.2`}
                o={0.4}
                w={0.28}
              />
              {style === 'larga' &&
                [0, 1, 2, 3].map((j) => (
                  <Ln
                    key={j}
                    d={`M${at(t, 0.8 + j * 0.045).p[0] - 3.6},${at(t, 0.8 + j * 0.045).p[1]} q3.6,-1.4 7.2,0.4`}
                    o={0.45}
                    w={0.3}
                  />
                ))}
              {style === 'cargo' && (
                <Paint
                  name={`cargo${i}`}
                  d={poly([
                    [at(t, 0.28).p[0] + sx * 1, 97],
                    [at(t, 0.28).p[0] + sx * 6.2, 97.6],
                    [at(t, 0.28).p[0] + sx * 6, 106],
                    [at(t, 0.28).p[0] + sx * 1.2, 106],
                  ])}
                  fill={c}
                  lw={0.35}
                />
              )}
            </g>
          );
        })}
      {shorts &&
        legs.map((t, i) => {
          const q = at(t, u1).p;
          return (
            <g key={i}>
              <Ln
                d={`M${q[0] - 6},${q[1] + 0.4} l1,0.8 l1,-0.6 l1,0.9 l1,-0.7 l1,0.8 l1,-0.6 l1,0.8 l1,-0.5 l1,0.7 l1,-0.6 l1,0.8`}
                c={light(c, 0.6)}
                o={0.8}
                w={0.35}
              />
              <Ln d={`M${q[0] - 1.6},${q[1] - 5} l1,1 m-0.6,0 l1,-1`} c={light(c, 0.6)} o={0.7} w={0.3} />
            </g>
          );
        })}
    </Paint>
  );
}

function Shoes({ a, leg }: { a: Appearance; leg: Tube }) {
  const { style, color } = a.shoes;
  const legs = [leg, mirTube(leg)];
  return (
    <>
      {legs.map((t, i) => {
        const sx = i ? 1 : -1;
        const ax = at(t, 1).p[0];
        const foot = (wid = 0, len = 0, top = 141.6) =>
          spline([
            [ax - sx * 2 - sx * wid * 0.3, top],
            [ax + sx * 2 + sx * wid * 0.3, top],
            [ax + sx * (2.2 + wid * 0.4), 146.4],
            [ax + sx * (1.9 + wid * 0.3), 150.4],
            [ax + sx * (1.2 + wid * 0.2), 152.1],
            [ax - sx * (2.2 + len * 0.5), 152.3],
            [ax - sx * (3.6 + len), 151.3],
            [ax - sx * (3.7 + len), 148.8],
            [ax - sx * (2.6 + wid * 0.3), 145],
          ]);
        if (style === 'descalco')
          return (
            <Paint key={i} name={`foot${i}`} d={foot(-0.6, -0.6, 143)} fill={a.skin} lw={0.4}>
              <Ln
                d={`M${ax - sx * 2.2},150.6 l0,1 M${ax - sx * 1},150.8 l0,1 M${ax + sx * 0.2},150.9 l0,1`}
                o={0.35}
                w={0.22}
              />
            </Paint>
          );
        const sole = style === 'tenis' ? '#ece8e2' : style === 'salto' ? dark(color, 0.3) : dark(color, 0.45);
        const shaftTop = style === 'coturno' ? 0.52 : style === 'botas' ? 0.74 : 0.95;
        const shaft = (style === 'botas' || style === 'coturno') && (
          <Paint name={`shaft${i}`} d={tubePath(t, shaftTop, 1, 0.75, [false, false])} fill={color}>
            {Array.from({ length: style === 'coturno' ? 7 : 4 }, (_, k) => {
              const q = at(t, shaftTop + 0.03 + k * 0.035);
              return (
                <Ln
                  key={k}
                  d={`M${q.p[0] - 1.2},${q.p[1]} L${q.p[0] + 1.2},${q.p[1] + 1.4} M${q.p[0] + 1.2},${q.p[1]} L${q.p[0] - 1.2},${q.p[1] + 1.4}`}
                  c={style === 'coturno' ? '#7a2a2a' : light(color, 0.4)}
                  o={0.85}
                  w={0.25}
                />
              );
            })}
            <path d={tubePath(t, shaftTop, shaftTop + 0.02, 1, [false, false])} fill={dark(color, 0.3)} />
          </Paint>
        );
        return (
          <g key={i}>
            {shaft}
            <Paint
              name={`shoe${i}`}
              d={foot(
                style === 'tenis' ? 0.8 : style === 'salto' ? 0.4 : 0.3,
                style === 'sapatos' ? 0.6 : 0.4,
              )}
              fill={color}
              lw={0.45}
            >
              <path
                d={`M${ax - 8},${style === 'salto' ? 149.6 : 150.6} L${ax + 8},${style === 'salto' ? 149.6 : 150.6} L${ax + 8},153 L${ax - 8},153Z`}
                fill={sole}
              />
              {style === 'tenis' && (
                <Ln
                  d={`M${ax - 1.4},143.4 L${ax + 1.4},144.4 M${ax + 1.4},143.4 L${ax - 1.4},144.4 M${ax - 1.4},145.2 L${ax + 1.4},146.2 M${ax + 1.4},145.2 L${ax - 1.4},146.2`}
                  c="#f2f0ea"
                  o={0.9}
                  w={0.28}
                />
              )}
              {style === 'sapatos' && <Hl d={ell(ax - sx * 1.4, 147.6, 1.2, 0.7)} o={0.45} />}
              {style === 'salto' && (
                <Ln d={`M${ax - 2.4},143.2 L${ax + 2.4},143.2`} c={dark(color, 0.4)} o={0.9} w={0.6} />
              )}
            </Paint>
          </g>
        );
      })}
    </>
  );
}

function Held({ a, t }: { a: Appearance; t: Tube }) {
  const q = at(t, 1);
  const ang = (Math.atan2(-q.dir[0], q.dir[1]) * 180) / Math.PI;
  const steel = '#c3c7cf';
  const metal = '#2a2a31';
  const wood = '#7a5230';
  let g: ReactNode = null;
  switch (a.held) {
    case 'pistola':
      g = (
        <>
          <Paint
            name="gun"
            d={poly([
              [-1.1, 0.8],
              [1.1, 0.8],
              [1.1, 11],
              [-1.1, 11],
            ])}
            fill={metal}
            lw={0.35}
          >
            <Hl
              d={poly([
                [-0.8, 1],
                [-0.3, 1],
                [-0.3, 10.6],
                [-0.8, 10.6],
              ])}
              o={0.35}
              b={2}
            />
          </Paint>
          <Paint
            name="gunh"
            d={poly([
              [-0.9, -2.6],
              [0.9, -2.6],
              [1.1, 1],
              [-1.1, 1],
            ])}
            fill={metal}
            lw={0.35}
          />
        </>
      );
      break;
    case 'faca':
      g = (
        <>
          <Paint
            name="knh"
            d={poly([
              [-0.7, -1.4],
              [0.7, -1.4],
              [0.7, 4.6],
              [-0.7, 4.6],
            ])}
            fill="#3b2a20"
            lw={0.3}
          />
          <Paint
            name="knb"
            d={spline([
              [-0.8, 4.6],
              [0.8, 4.6],
              [0.6, 9],
              [0, 12.4],
              [-0.6, 8],
            ])}
            fill={steel}
            lw={0.3}
          >
            <Hl
              d={poly([
                [-0.4, 5],
                [0, 5],
                [0, 11],
                [-0.4, 9],
              ])}
              o={0.6}
              b={2}
            />
          </Paint>
        </>
      );
      break;
    case 'taco':
      g = (
        <g transform="rotate(-12)">
          <Paint
            name="bat"
            d={spline([
              [-0.6, -2],
              [0.6, -2],
              [1.6, 12],
              [1.8, 22],
              [0, 23.2],
              [-1.8, 22],
              [-1.6, 12],
            ])}
            fill={wood}
          >
            <Hl d={ell(-0.8, 14, 0.4, 6)} o={0.35} />
          </Paint>
          {[15, 17.4, 19.8, 21.2].map((y, i) => (
            <path
              key={y}
              d={`M${i % 2 ? 1.6 : -1.6},${y} l${i % 2 ? 1.6 : -1.6},-0.3`}
              stroke="#9a9ca4"
              strokeWidth={0.35}
            />
          ))}
        </g>
      );
      break;
    case 'katana':
      g = (
        <g transform="rotate(-18)">
          <Paint
            name="kgrip"
            d={poly([
              [-0.75, -5],
              [0.75, -5],
              [0.75, 4.2],
              [-0.75, 4.2],
            ])}
            fill="#141216"
            lw={0.3}
          >
            {[-4, -2.4, -0.8, 0.8, 2.4].map((y) => (
              <path
                key={y}
                d={`M-0.75,${y} L0.75,${y + 0.8} M0.75,${y} L-0.75,${y + 0.8}`}
                stroke="#e8e4dc"
                strokeWidth={0.25}
              />
            ))}
          </Paint>
          <Paint name="ktsuba" d={ell(0, 4.6, 1.8, 0.55)} fill="#c9a24b" lw={0.3} />
          <Paint
            name="kblade"
            d={spline(
              [
                [-0.55, 5.1],
                [0.55, 5.1],
                [0.9, 24],
                [0.8, 38],
                [0, 40.6],
                [-0.5, 37],
                [-0.6, 20],
              ],
              true,
              0.6,
            )}
            fill={steel}
            lw={0.3}
          >
            <Hl
              d={poly([
                [-0.3, 5.4],
                [0.1, 5.4],
                [0.4, 38],
                [0, 39],
              ])}
              o={0.7}
              b={2}
            />
          </Paint>
        </g>
      );
      break;
    case 'livro':
      g = (
        <g transform="translate(0 1)">
          <Paint
            name="book"
            d={poly([
              [-3.2, 0],
              [3.2, 0],
              [3.2, 8.6],
              [-3.2, 8.6],
            ])}
            fill="#3a1820"
            lw={0.4}
          >
            <circle cx={0} cy={4.3} r={1.7} fill="none" stroke="#c9a24b" strokeWidth={0.3} />
            <path d="M0,2.4 L1.5,5.2 L-1.5,5.2Z" fill="none" stroke="#c9a24b" strokeWidth={0.25} />
            <path d="M-3.2,0 L-2.4,0 L-2.4,8.6 L-3.2,8.6Z" fill="#24101a" />
          </Paint>
        </g>
      );
      break;
    case 'lanterna':
      g = (
        <>
          <path d="M-1.6,9 L1.6,9 L9,40 L-9,40Z" fill="#ffe9a8" opacity={0.18} />
          <Paint
            name="flash"
            d={poly([
              [-0.8, -1.2],
              [0.8, -1.2],
              [0.8, 6.6],
              [1.4, 8.8],
              [-1.4, 8.8],
              [-0.8, 6.6],
            ])}
            fill="#3a3a42"
            lw={0.3}
          >
            <path d="M-1.4,8.4 L1.4,8.4 L1.4,8.8 L-1.4,8.8Z" fill="#fff4c4" />
          </Paint>
        </>
      );
      break;
    case 'espingarda':
      g = (
        <g transform="rotate(-10)">
          <Paint
            name="sgstock"
            d={spline([
              [-1, -12],
              [1.2, -12.6],
              [1.4, -2],
              [0.8, 2],
              [-0.8, 2],
              [-1.2, -4],
            ])}
            fill={wood}
            lw={0.35}
          />
          <Paint
            name="sgbar"
            d={poly([
              [-0.75, 1.5],
              [0.75, 1.5],
              [0.75, 26],
              [-0.75, 26],
            ])}
            fill={metal}
            lw={0.3}
          >
            <Hl
              d={poly([
                [-0.5, 2],
                [-0.1, 2],
                [-0.1, 25.6],
                [-0.5, 25.6],
              ])}
              o={0.35}
              b={2}
            />
          </Paint>
          <Paint
            name="sgpump"
            d={poly([
              [-1.1, 9],
              [1.1, 9],
              [1.1, 14],
              [-1.1, 14],
            ])}
            fill={wood}
            lw={0.3}
          />
        </g>
      );
      break;
    case 'machado':
      g = (
        <g transform="rotate(-10)">
          <Paint
            name="axh"
            d={poly([
              [-0.6, -3],
              [0.6, -3],
              [0.7, 21],
              [-0.7, 21],
            ])}
            fill={wood}
            lw={0.3}
          />
          <Paint
            name="axb"
            d={spline(
              [
                [0.6, 16],
                [5.6, 14],
                [6.6, 18],
                [5.6, 22.6],
                [0.6, 20.8],
              ],
              true,
              0.5,
            )}
            fill={steel}
            lw={0.35}
          >
            <Hl d={ell(5, 18.2, 0.7, 3)} o={0.5} />
          </Paint>
        </g>
      );
      break;
    case 'celular':
      g = (
        <g transform="translate(0 0.6)">
          <path d="M-5,-2 L5,-2 L5,10 L-5,10Z" fill="#cfe6ff" opacity={0.12} />
          <Paint
            name="phone"
            d={spline(
              [
                [-1.6, -0.8],
                [1.6, -0.8],
                [1.6, 5.4],
                [-1.6, 5.4],
              ],
              true,
              0.2,
            )}
            fill="#1e1c22"
            lw={0.3}
          >
            <path d="M-1.2,-0.4 L1.2,-0.4 L1.2,5 L-1.2,5Z" fill="#9fc6ef" />
          </Paint>
        </g>
      );
      break;
    default:
      return null;
  }
  return (
    <g transform={`translate(${q.p[0].toFixed(2)} ${(q.p[1] + 2.4).toFixed(2)}) rotate(${ang.toFixed(1)})`}>
      {g}
    </g>
  );
}

/* --------------------------------------------------------------- rosto */

function Face({ m, a, down }: { m: M; a: Appearance; down?: boolean }) {
  // Rosto em estilo anime: olhos grandes e brilhantes, nariz e boca pequenos.
  const ex = m.F ? 2.75 : 2.85;
  const ey = Y.eye + 0.5;
  const brow = mix(a.hair.style === 'careca' ? '#2a1d16' : a.hair.color, INK, 0.45);
  const uid = useContext(Uid);
  const iris = a.eyes;
  const eye = (sx: -1 | 1) => {
    const cx = 50 + sx * ex;
    const inner = cx - sx * 1.35;
    const outer = cx + sx * 1.55;
    const top = ey - (m.F ? 1.75 : 1.45);
    const bot = ey + (m.F ? 1.15 : 0.95);
    const d = `M${inner},${ey + 0.1} C${inner - sx * 0.1},${top} ${outer},${top - 0.1} ${outer},${ey - 0.55} C${outer - sx * 0.2},${bot} ${inner + sx * 0.4},${bot} ${inner},${ey + 0.1}Z`;
    const cid = `${uid}-eye${sx}`;
    const icx = cx + sx * 0.05;
    const r = m.F ? 1.12 : 0.98;
    return (
      <g key={sx}>
        <clipPath id={cid}>
          <path d={d} />
        </clipPath>
        <path d={d} fill="#f7f3ef" />
        <g clipPath={`url(#${cid})`}>
          <ellipse cx={icx} cy={ey - 0.05} rx={r * 0.92} ry={r * 1.12} fill={dark(iris, 0.35)} />
          <ellipse cx={icx} cy={ey + 0.35} rx={r * 0.72} ry={r * 0.72} fill={light(iris, 0.18)} />
          <ellipse cx={icx} cy={ey - 0.05} rx={r * 0.42} ry={r * 0.55} fill="#0b080c" />
          <path
            d={`M${inner - 2},${top - 2} L${outer + 2},${top - 2} L${outer + 2},${top + 0.55} L${inner - 2},${top + 0.55}Z`}
            fill={INK}
            opacity={0.32}
          />
          <ellipse cx={icx - 0.42} cy={ey - 0.55} rx={0.36} ry={0.42} fill="#fff" />
          <circle cx={icx + 0.45} cy={ey + 0.55} r={0.17} fill="#fff" opacity={0.85} />
        </g>
        {/* cílio superior grosso, com ponta para fora */}
        <path
          d={`M${inner - sx * 0.15},${ey + 0.15} C${inner - sx * 0.1},${top - 0.15} ${outer},${top - 0.3} ${outer + sx * (m.F ? 0.75 : 0.35)},${ey - (m.F ? 1.05 : 0.75)} L${outer + sx * 0.1},${ey - 0.35} C${outer - sx * 0.3},${top + 0.35} ${inner + sx * 0.3},${top + 0.45} ${inner + sx * 0.1},${ey + 0.15}Z`}
          fill={INK}
        />
        <path
          d={`M${inner + sx * 0.6},${bot - 0.05} Q${cx + sx * 0.4},${bot + 0.25} ${outer - sx * 0.15},${ey + 0.2}`}
          fill="none"
          stroke={INK}
          strokeOpacity={0.45}
          strokeWidth={0.18}
          strokeLinecap="round"
        />
      </g>
    );
  };
  const browD = (sx: -1 | 1) => {
    const cx = 50 + sx * ex;
    const by = Y.brow - 0.2;
    const w = m.F ? 0.32 : 0.55;
    return `M${cx - sx * 1.4},${by + 0.6} Q${cx},${by - 0.55} ${cx + sx * 1.9},${by + 0.2} Q${cx},${by - 0.55 + w} ${cx - sx * 1.4},${by + 0.6 + w * 0.6}Z`;
  };
  const lip = mix(a.skin, '#b0303e', m.F ? 0.35 : 0.12);
  return (
    <g>
      {/* rubor */}
      <Hl d={ell(50 - 3.5, Y.nose + 0.2, 1.3, 0.55)} c="#e86a7a" o={m.F ? 0.35 : 0.14} b={2} />
      <Hl d={ell(50 + 3.5, Y.nose + 0.2, 1.3, 0.55)} c="#e86a7a" o={m.F ? 0.35 : 0.14} b={2} />
      <g
        className={down ? undefined : 'animate-blink'}
        style={{ transformOrigin: `50px ${ey}px`, transformBox: 'view-box' }}
      >
        {down ? (
          <>
            <Ln d={`M${50 - ex - 1.4},${ey} q1.4,0.9 2.8,0`} o={0.9} w={0.45} />
            <Ln d={`M${50 + ex - 1.4},${ey} q1.4,0.9 2.8,0`} o={0.9} w={0.45} />
          </>
        ) : (
          <>
            {eye(-1)}
            {eye(1)}
          </>
        )}
      </g>
      <path d={browD(-1)} fill={brow} />
      <path d={browD(1)} fill={brow} />
      {/* nariz: só um traço de sombra */}
      <path
        d={`M50.55,${Y.nose - 0.9} L50.95,${Y.nose + 0.25} L50.25,${Y.nose + 0.35}`}
        fill="none"
        stroke={mix(a.skin, INK, 0.6)}
        strokeWidth={0.28}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* boca pequena */}
      {m.F ? (
        <>
          <path
            d={`M49.1,${Y.mouth + 0.1} Q50,${Y.mouth + 0.55} 50.9,${Y.mouth + 0.1} Q50,${Y.mouth + 1.05} 49.1,${Y.mouth + 0.1}Z`}
            fill={lip}
          />
          <Ln d={`M48.9,${Y.mouth} Q50,${Y.mouth + 0.35} 51.1,${Y.mouth}`} o={0.85} w={0.3} />
        </>
      ) : (
        <Ln d={`M49,${Y.mouth + 0.05} Q50,${Y.mouth + 0.3} 51,${Y.mouth}`} o={0.85} w={0.32} />
      )}
    </g>
  );
}

function FaceGear({ m, a }: { m: M; a: Appearance }) {
  const acc = a.accessories;
  const h = m.head;
  return (
    <>
      {acc.includes('cicatriz') && (
        <Ln
          d={`M${50 + 2.2},${Y.nose - 0.6} l2.6,2.4 M${50 + 4.6},${Y.nose - 0.8} l-2.2,2.6`}
          c="#8a2e2a"
          o={0.85}
          w={0.35}
        />
      )}
      {acc.includes('caveira') && (
        <Paint
          name="skull"
          d={spline([
            [50 - h + 0.4, Y.nose - 0.4],
            [50 + h - 0.4, Y.nose - 0.4],
            [50 + h * 0.8, Y.mouth + 1],
            [50 + 2.2, Y.chin + 0.2],
            [50 - 2.2, Y.chin + 0.2],
            [50 - h * 0.8, Y.mouth + 1],
          ])}
          fill="#e7e1d4"
          lw={0.4}
        >
          <path d={`M49.2,${Y.nose - 0.2} L50.8,${Y.nose - 0.2} L50,${Y.nose + 1.2}Z`} fill={INK} />
          {[-2, -1, 0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${50 + i * 0.9 - 0.35},${Y.mouth - 0.3} L${50 + i * 0.9 + 0.35},${Y.mouth - 0.3} L${50 + i * 0.9 + 0.3},${Y.mouth + 1.2} L${50 + i * 0.9 - 0.3},${Y.mouth + 1.2}Z`}
              fill="none"
              stroke={INK}
              strokeWidth={0.2}
            />
          ))}
        </Paint>
      )}
      {acc.includes('oculos') && (
        <g>
          {[-1, 1].map((sx) => (
            <Paint
              key={sx}
              name={`lens${sx}`}
              d={spline(
                [
                  [50 + sx * 0.9, Y.eye - 1.2],
                  [50 + sx * 4.3, Y.eye - 1.3],
                  [50 + sx * 4.1, Y.eye + 1.2],
                  [50 + sx * 1.2, Y.eye + 1.3],
                ],
                true,
                0.7,
              )}
              fill="#141218"
              lw={0.35}
            >
              <Hl d={ell(50 + sx * 2.2, Y.eye - 0.6, 1.2, 0.4)} o={0.35} b={2} />
            </Paint>
          ))}
          <Ln
            d={`M49.1,${Y.eye - 0.8} q0.9,-0.5 1.8,0 M${50 - 4.3},${Y.eye - 1.1} L${50 - h - 0.2},${Y.eye - 1.6} M${50 + 4.3},${Y.eye - 1.1} L${50 + h + 0.2},${Y.eye - 1.6}`}
            o={0.9}
            w={0.35}
          />
        </g>
      )}
      {acc.includes('venda') && (
        <>
          <Ln d={`M${50 - h - 0.3},${Y.brow - 2} L${50 + h + 0.3},${Y.eye + 2.4}`} o={0.9} w={0.45} />
          <Paint name="patch" d={ell(50 + 2.7, Y.eye + 0.1, 1.9, 1.6)} fill="#1a1618" lw={0.35} />
        </>
      )}
      {acc.includes('brincos') && (
        <>
          <circle
            cx={50 - h - 0.2}
            cy={Y.mouth - 0.6}
            r={0.75}
            fill="none"
            stroke="#d4b25a"
            strokeWidth={0.35}
          />
          <circle
            cx={50 + h + 0.2}
            cy={Y.mouth - 0.6}
            r={0.75}
            fill="none"
            stroke="#d4b25a"
            strokeWidth={0.35}
          />
        </>
      )}
    </>
  );
}

function NeckGear({ m, a }: { m: M; a: Appearance }) {
  const acc = a.accessories;
  return (
    <>
      {acc.includes('colar') && (
        <Paint
          name="choker"
          d={spline(
            [
              [50 - m.neck - 0.3, Y.neck - 2.6],
              [50 + m.neck + 0.3, Y.neck - 2.6],
              [50 + m.neck + 0.4, Y.neck - 1.4],
              [50 - m.neck - 0.4, Y.neck - 1.4],
            ],
            true,
            0.4,
          )}
          fill="#18151a"
          lw={0.3}
        >
          {[-2, -1, 0, 1, 2].map((i) => (
            <circle key={i} cx={50 + i * 1.1} cy={Y.neck - 2} r={0.22} fill="#c9ccd2" />
          ))}
        </Paint>
      )}
      {acc.includes('pingente') && (
        <>
          <Ln
            d={`M${50 - m.neck - 0.4},${Y.neck - 0.6} Q50,${Y.chest - 2} ${50 + m.neck + 0.4},${Y.neck - 0.6}`}
            c="#c9ccd2"
            o={0.9}
            w={0.22}
          />
          <Paint
            name="pendant"
            d={spline(
              [
                [50, Y.chest - 4.4],
                [50.8, Y.chest - 3],
                [50, Y.chest - 1.2],
                [49.2, Y.chest - 3],
              ],
              true,
              0.3,
            )}
            fill={a.top.accent}
            lw={0.3}
          >
            <Hl d={ell(49.8, Y.chest - 3.2, 0.25, 0.6)} o={0.7} />
          </Paint>
        </>
      )}
      {acc.includes('cachecol') && (
        <>
          <Paint
            name="scarf"
            d={spline([
              [50 - m.neck - 2.4, Y.neck - 1.6],
              [50, Y.neck - 3],
              [50 + m.neck + 2.4, Y.neck - 1.6],
              [50 + m.neck + 2, Y.neck + 2.2],
              [50, Y.neck + 2.8],
              [50 - m.neck - 2, Y.neck + 2.2],
            ])}
            fill={a.top.accent}
          >
            <Ln d={`M${50 - m.neck - 1.6},${Y.neck} q${m.neck + 1.6},1.4 ${(m.neck + 1.6) * 2},0`} o={0.4} />
          </Paint>
          <Paint
            name="scarft"
            d={spline(
              [
                [50 + 1.4, Y.neck + 1.6],
                [50 + 4.2, Y.neck + 2],
                [50 + 4.6, Y.chest + 8],
                [50 + 1.6, Y.chest + 8.6],
              ],
              true,
              0.6,
            )}
            fill={a.top.accent}
          >
            <Ln d={`M${50 + 2.8},${Y.neck + 3} l0.4,${Y.chest + 5 - Y.neck}`} o={0.35} />
          </Paint>
        </>
      )}
    </>
  );
}

function WaistGear({ m, a }: { m: M; a: Appearance }) {
  const acc = a.accessories;
  const y = Y.hip - 2.4;
  return (
    <>
      {acc.includes('cinto') && (
        <Paint
          name="belt"
          d={poly([
            [50 - m.hip - 1.1, y - 1],
            [50 + m.hip + 1.1, y - 1],
            [50 + m.hip + 1.1, y + 1.2],
            [50 - m.hip - 1.1, y + 1.2],
          ])}
          fill="#4a2e1c"
          lw={0.3}
        >
          <rect
            x={48.4}
            y={y - 1.4}
            width={3.2}
            height={3}
            rx={0.4}
            fill="none"
            stroke="#c9a24b"
            strokeWidth={0.45}
          />
        </Paint>
      )}
      {acc.includes('correntes') && (
        <g fill="none" stroke="#c9ccd2" strokeWidth={0.3}>
          {Array.from({ length: 9 }, (_, i) => {
            const t = i / 8;
            const x = 50 - 4 - t * (m.hip - 2);
            const yy = y + 1 + Math.sin(t * Math.PI) * 7;
            return (
              <ellipse
                key={i}
                cx={x}
                cy={yy}
                rx={0.7}
                ry={0.45}
                transform={`rotate(${20 + t * 50} ${x} ${yy})`}
              />
            );
          })}
        </g>
      )}
    </>
  );
}

/* --------------------------------------------------------------- boneco */

const HEAD_T = `translate(50 ${Y.neck}) scale(1.13) translate(-50 ${-Y.neck})`;

export function AvatarFigure({ a, down, still }: { a: Appearance; down?: boolean; still?: boolean }) {
  const raw = useId();
  const uid = `av${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const m = measure(a);
  const armL = armTube(m);
  const armR = mirTube(armL);
  const leg = legTube(m);
  const hair = hairShapes(m, a);
  const hc = a.hair.color;
  const tucked =
    a.top.style === 'camisa' ||
    ((a.top.style === 'camiseta' || a.top.style === 'regata') && a.accessories.includes('cinto'));
  const bootsOver = a.shoes.style === 'botas' || a.shoes.style === 'coturno';
  const holding = a.held !== 'nenhum';
  const hoodUp = a.hood && (a.top.style === 'moletom' || a.top.style === 'manto');
  const hairFill = (name: string, d: string, extraStrands = true) => (
    <Paint name={name} d={d} fill={hc} lw={0.45} cel={1.5}>
      {/* brilho de anime: faixa clara com dentes */}
      <path
        d={`M${50 - m.head - 1},${Y.top + 3.4} Q50,${Y.top - 0.6} ${50 + m.head + 1},${Y.top + 3.4} l0,1.2 l-1.2,-0.4 l-0.8,1.4 l-1,-1.2 l-1,1.6 l-1,-1.4 l-1.1,1.5 l-1,-1.3 l-1,1.4 l-1,-1.3 l-0.9,1.2 l-1,-1.1 l-1,1 Q50,${Y.top + 0.9} ${50 - m.head - 1},${Y.top + 4.6}Z`}
        fill={light(hc, lum(hc) < 0.3 ? 0.32 : 0.45)}
        opacity={0.75}
      />
      {extraStrands && hair.strands.map((s, i) => <Ln key={i} d={s} c={dark(hc, 0.55)} o={0.55} w={0.25} />)}
      {extraStrands &&
        hair.strands
          .slice(0, 2)
          .map((s, i) => <Ln key={'h' + i} d={s} c={light(hc, 0.5)} o={0.35} w={0.2} />)}
      {a.hair.streak && (
        <path
          d={`M${50 + 0.6},${Y.top - 3} q${m.head * 0.6},2 ${m.head + 1.2},${10} l0,40 l-2.6,0 l0,-40 q${-m.head * 0.4},-6 ${-m.head + 1.2},-9Z`}
          fill={a.hair.streak}
          opacity={0.88}
        />
      )}
      <Sh
        d={`M${50 + 1},${Y.top} L${50 + m.head + 4},${Y.top + 4} L${50 + m.head + 4},70 L${50 + 2},70Z`}
        o={0.22}
        b={2}
      />
    </Paint>
  );
  const hoodBack = hoodUp && (
    <Paint
      name="hoodb"
      d={spline([
        [50 - m.head - 3.4, Y.sh + 1],
        [50 - m.head - 3.2, Y.top + 2],
        [50, Y.top - 4.4],
        [50 + m.head + 3.2, Y.top + 2],
        [50 + m.head + 3.4, Y.sh + 1],
      ])}
      fill={dark(a.top.color, 0.25)}
    />
  );
  const hoodFront = hoodUp && (
    <Paint
      name="hoodf"
      d={spline([
        [50 - m.head - 3, Y.sh + 2],
        [50 - m.head - 2.8, Y.top + 2.4],
        [50, Y.top - 3.4],
        [50 + m.head + 2.8, Y.top + 2.4],
        [50 + m.head + 3, Y.sh + 2],
        [50 + m.head - 0.2, Y.neck],
        [50 + m.head + 0.4, Y.nose],
        [50 + m.head - 0.6, Y.top + 3],
        [50, Y.top + 0.6],
        [50 - m.head + 0.6, Y.top + 3],
        [50 - m.head - 0.4, Y.nose],
        [50 - m.head + 0.2, Y.neck],
      ])}
      fill={a.top.color}
    >
      <Sh
        d={`M${50 - m.head},${Y.top + 2} q${m.head},-4 ${m.head * 2},0 l0,2 q${-m.head},-3 ${-m.head * 2},0Z`}
        o={0.5}
      />
    </Paint>
  );
  const sig = [a.frame, a.body, a.hair.style, a.top.style, a.bottom.style, a.shoes.style, a.held].join('-');
  return (
    <Uid.Provider value={uid}>
      <g data-avatar={sig}>
        <defs>
          {/* sombreado chapado (cel shading): luz à esquerda, sombra de borda dura à direita */}
          <linearGradient id={`${uid}-lx`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff4e6" stopOpacity={0.16} />
            <stop offset="0.22" stopColor="#fff4e6" stopOpacity={0.16} />
            <stop offset="0.22" stopColor="#fff4e6" stopOpacity={0} />
            <stop offset="0.64" stopColor="#2a1630" stopOpacity={0} />
            <stop offset="0.64" stopColor="#2a1630" stopOpacity={0.3} />
            <stop offset="1" stopColor="#2a1630" stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id={`${uid}-ly`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a1630" stopOpacity={0} />
            <stop offset="0.86" stopColor="#2a1630" stopOpacity={0} />
            <stop offset="0.86" stopColor="#2a1630" stopOpacity={0.16} />
            <stop offset="1" stopColor="#2a1630" stopOpacity={0.16} />
          </linearGradient>
          <filter id={`${uid}-b1`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={0.9} />
          </filter>
          <filter id={`${uid}-b2`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={0.4} />
          </filter>
        </defs>
        {/* sombra no chão */}
        <ellipse cx={51} cy={151.4} rx={down ? 30 : 17 + m.fat * 3} ry={4.2} fill="rgba(0,0,0,0.45)" />
        <g
          transform={down ? 'rotate(-82 50 150) translate(-6 8)' : undefined}
          style={down ? { filter: 'grayscale(1) brightness(0.7)' } : undefined}
        >
          <g
            className={still || down ? undefined : 'animate-breathe-soft'}
            style={{ transformOrigin: '50px 151px', transformBox: 'view-box' }}
          >
            <g transform={HEAD_T}>
              {hoodBack}
              {hair.back && a.hair.style !== 'careca' && !hoodUp && hairFill('hairB', hair.back, false)}
            </g>
            {a.top.style === 'sobretudo' && (
              <Paint
                name="coatback"
                d={spline([
                  [50 - m.hip - 4, 90],
                  [50 + m.hip + 4, 90],
                  [50 + m.hip + 5, 121],
                  [50, 122],
                  [50 - m.hip - 5, 121],
                ])}
                fill={dark(a.top.color, 0.35)}
                line={false}
              />
            )}
            {a.top.style === 'manto' && (
              <Paint
                name="cloakback"
                d={spline([
                  [50 - m.sh - 4, 60],
                  [50 + m.sh + 4, 60],
                  [50 + m.sh + 6, 143],
                  [50, 144.4],
                  [50 - m.sh - 6, 143],
                ])}
                fill={dark(a.top.color, 0.4)}
                line={false}
              />
            )}
            <Skin m={m} a={a} armL={armL} armR={armR} leg={leg} />
            {!bootsOver && <Shoes a={a} leg={leg} />}
            <Bottom m={m} a={a} leg={leg} />
            {bootsOver && <Shoes a={a} leg={leg} />}
            <Top m={m} a={a} armL={armL} armR={armR} tucked={tucked} />
            {(tucked ||
              a.top.style === 'cropped' ||
              a.top.style === 'jaqueta' ||
              a.top.style === 'sobretudo' ||
              a.top.style === 'quimono') && <WaistGear m={m} a={a} />}
            <NeckGear m={m} a={a} />
            {holding && <Held a={a} t={armL} />}
            <Hand t={armL} a={a} side={0} fist={holding} />
            <Hand t={armR} a={a} side={1} fist={false} />
            {/* cabeça (um pouco maior, proporção de anime) */}
            <g transform={HEAD_T}>
              {[-1, 1].map((sx) => (
                <Paint
                  key={sx}
                  name={`ear${sx}`}
                  d={spline([
                    [50 + sx * (m.head - 0.6), Y.eye - 0.6],
                    [50 + sx * (m.head + 0.9), Y.eye - 1],
                    [50 + sx * (m.head + 1.3), Y.eye + 1.2],
                    [50 + sx * (m.head + 0.8), Y.nose + 0.4],
                    [50 + sx * (m.head - 0.4), Y.nose + 1],
                  ])}
                  fill={a.skin}
                  lw={0.4}
                >
                  <Sh d={ell(50 + sx * (m.head + 0.4), Y.eye + 1.4, 0.4, 1.2)} o={0.35} b={2} />
                </Paint>
              ))}
              <Paint name="head" d={headPath(m)} fill={a.skin} lw={0.5} cel={1.6}>
                {/* sombra que o cabelo projeta na testa */}
                {hair.front && a.hair.style !== 'raspado' && a.hair.style !== 'moicano' && (
                  <path
                    d={hair.front}
                    transform="translate(0.5 1.3)"
                    fill={dark(mix(a.skin, '#5a2a4a', 0.3), 0.25)}
                    opacity={0.55}
                  />
                )}
                <path
                  d={`M${50 - m.neck - 1},${Y.chin - 0.2} Q50,${Y.chin + 1.2} ${50 + m.neck + 1},${Y.chin - 0.2}`}
                  fill="none"
                />
                <Face m={m} a={a} down={down} />
              </Paint>
              <FaceGear m={m} a={a} />
              {hair.extra && a.hair.style !== 'moicano' && !hoodUp && hairFill('hairX', hair.extra)}
              {hair.extra && a.hair.style === 'moicano' && <path d={hair.extra} fill={hc} opacity={0.4} />}
              {a.hair.style === 'raspado' && hair.front && <path d={hair.front} fill={hc} opacity={0.55} />}
              {hair.front &&
                a.hair.style !== 'raspado' &&
                (hoodUp ? a.hair.style !== 'rabo' && a.hair.style !== 'coque' : true) &&
                hairFill('hairF', hair.front)}
              {a.hair.style === 'trancas' && <Braids m={m} color={hc} />}
              {hoodFront}
            </g>
          </g>
        </g>
      </g>
    </Uid.Provider>
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
