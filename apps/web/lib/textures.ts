'use client';

/**
 * Texturas realistas geradas no navegador (ruído procedural), sem imagens de terceiros.
 * Cada textura é desenhada uma vez num canvas, emenda sem costura (tileable) e
 * vira um endereço data: usado como <pattern> no mapa.
 */
import { useEffect, useState } from 'react';

export type TextureKind =
  | 'floor'
  | 'brick'
  | 'wood'
  | 'stone'
  | 'grass'
  | 'dirt'
  | 'sand'
  | 'rock'
  | 'snow'
  | 'carpet'
  | 'tile'
  | 'road'
  | 'water'
  | 'lava'
  | 'canopy0'
  | 'canopy1'
  | 'canopy2'
  | 'plank'
  | 'metal'
  | 'fabric';

/** Tamanho da textura em pixels e quantas casas do mapa ela cobre. */
export const TEXTURE_CELLS: Record<TextureKind, number> = {
  floor: 2,
  brick: 1,
  wood: 2,
  stone: 2,
  grass: 2,
  dirt: 2,
  sand: 2,
  rock: 2,
  snow: 2,
  carpet: 2,
  tile: 2,
  road: 2,
  water: 2,
  lava: 2,
  canopy0: 1,
  canopy1: 1,
  canopy2: 1,
  plank: 1,
  metal: 1,
  fabric: 1,
};
const PX_PER_CELL = 96;

// ───────────── ruído com emenda perfeita ─────────────
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Ruído de valor periódico (repete a cada `period` unidades). */
function makeNoise(seed: number, period: number) {
  const r = rand(seed);
  const g = Array.from({ length: period * period }, r);
  const at = (x: number, y: number) =>
    g[(((y % period) + period) % period) * period + (((x % period) + period) % period)]!;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = fade(x - xi);
    const ty = fade(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Ruído fractal (várias camadas), também periódico; u,v em 0..1. */
function fbm(seed: number, base = 4, octaves = 5) {
  const layers = Array.from({ length: octaves }, (_, i) => makeNoise(seed + i * 101, base * 2 ** i));
  return (u: number, v: number) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    layers.forEach((n, i) => {
      const p = base * 2 ** i;
      sum += n(u * p, v * p) * amp;
      norm += amp;
      amp *= 0.5;
    });
    return sum / norm;
  };
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Pinta pixel a pixel. `fn(u, v)` devolve cor e opcionalmente alfa (0..1). */
function paint(
  size: number,
  fn: (u: number, v: number, x: number, y: number) => RGB | [number, number, number, number],
) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const col = fn(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = col.length === 4 ? Math.round(col[3] * 255) : 255;
    }
  ctx.putImageData(img, 0, 0);
  return { c, ctx };
}

// ───────────── receitas ─────────────
function woodPlanks(size: number, seed: number, rows: number, base: RGB) {
  const grain = fbm(seed, 2, 4);
  const fine = fbm(seed + 7, 8, 3);
  const r = rand(seed + 3);
  const tones = Array.from({ length: rows * 4 }, () => 0.82 + r() * 0.3);
  const offsets = Array.from({ length: rows }, () => r());
  return paint(size, (u, v) => {
    const row = Math.floor(v * rows);
    const inRow = v * rows - row;
    const off = offsets[row]!;
    const seg = Math.floor(((u + off) % 1) * 2); // duas tábuas por linha, emendas desencontradas
    const tone = tones[row * 2 + seg]!;
    // veios: ruído esticado na horizontal + anéis
    const g = grain(u * 0.5 + row * 0.37, inRow * 0.15 + row * 0.13);
    const rings = 0.5 + 0.5 * Math.sin((g * 18 + inRow * 3) * Math.PI);
    let c = shade(mix(base, shade(base, 0.62), rings * 0.55), tone * (0.9 + fine(u, v) * 0.2));
    // emendas e frestas
    const seam = (Math.min(inRow, 1 - inRow) * size) / rows;
    if (seam < 1.4) c = shade(c, 0.35);
    else if (seam < 3) c = shade(c, 0.8);
    const ux = ((u + off) % 0.5) * 2;
    if ((Math.min(ux, 1 - ux) * size) / 2 < 1.2) c = shade(c, 0.4);
    return c;
  });
}

function slabs(
  size: number,
  seed: number,
  cols: number,
  base: RGB,
  mortar: RGB,
  stagger: boolean,
  bevel = 0.08,
) {
  const n = fbm(seed, 4, 5);
  const r = rand(seed + 9);
  const tones = Array.from({ length: cols * cols * 2 }, () => 0.85 + r() * 0.25);
  return paint(size, (u, v) => {
    const row = Math.floor(v * cols);
    const uu = stagger && row % 2 ? (u + 0.5 / cols) % 1 : u;
    const col = Math.floor(uu * cols);
    const fx = uu * cols - col;
    const fy = v * cols - row;
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const k = tones[row * cols + col]! * (0.75 + n(u, v) * 0.5);
    if (edge < 0.035) return shade(mortar, 0.8 + n(u * 2, v * 2) * 0.4);
    let c = shade(base, k);
    if (edge < bevel)
      c = shade(c, fy < 0.5 && fy < fx && fy < 1 - fx ? 1.18 : fx < 0.5 && fx < fy ? 1.08 : 0.78);
    return c;
  });
}

function speckled(size: number, seed: number, a: RGB, b: RGB, scale = 4, grit = 0.15, pebbles = 0) {
  const n = fbm(seed, scale, 6);
  const r = rand(seed + 5);
  const out = paint(size, (u, v) => {
    const t = n(u, v);
    return shade(mix(a, b, clamp01((t - 0.3) * 1.8)), 1 - grit / 2 + r() * grit);
  });
  for (let i = 0; i < pebbles; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 1 + r() * 3;
    const g = out.ctx.createRadialGradient(x - rad / 3, y - rad / 3, 0, x, y, rad);
    const tone = 140 + r() * 60;
    g.addColorStop(0, `rgb(${tone},${tone * 0.95},${tone * 0.88})`);
    g.addColorStop(1, `rgba(40,30,20,0.9)`);
    out.ctx.fillStyle = g;
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        out.ctx.beginPath();
        out.ctx.ellipse(x + dx, y + dy, rad, rad * 0.8, r() * 3, 0, Math.PI * 2);
        out.ctx.fill();
      }
  }
  return out;
}

function grass(size: number, seed: number) {
  const out = speckled(size, seed, [34, 66, 30], [72, 112, 46], 3, 0.2);
  const r = rand(seed + 11);
  const ctx = out.ctx;
  ctx.lineCap = 'round';
  for (let i = 0; i < size * 6; i++) {
    const x = r() * size;
    const y = r() * size;
    const len = 2 + r() * 5;
    const ang = -Math.PI / 2 + (r() - 0.5) * 1.2;
    const g = 70 + r() * 90;
    ctx.strokeStyle = `rgba(${g * 0.45},${g},${g * 0.35},${0.5 + r() * 0.5})`;
    ctx.lineWidth = 0.6 + r() * 0.8;
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx + Math.cos(ang) * len, y + dy + Math.sin(ang) * len);
        ctx.stroke();
      }
  }
  return out;
}

function water(size: number, seed: number) {
  const n = fbm(seed, 3, 5);
  const m = fbm(seed + 3, 6, 3);
  return paint(size, (u, v) => {
    const t = n(u, v);
    const caustic = Math.pow(1 - Math.abs(m(u, v) - 0.5) * 2, 8);
    return mix(mix([14, 44, 74], [28, 86, 120], t), [150, 210, 235], caustic * 0.55);
  });
}

function lava(size: number, seed: number) {
  const n = fbm(seed, 3, 6);
  return paint(size, (u, v) => {
    const t = n(u, v);
    const crack = Math.pow(1 - Math.abs(t - 0.5) * 2, 6);
    const crust = mix([38, 18, 14], [70, 34, 22], t);
    return mix(crust, crack > 0.6 ? [255, 214, 90] : [255, 90, 20], clamp01(crack * 1.3));
  });
}

function carpet(size: number, seed: number) {
  const n = fbm(seed, 16, 3);
  return paint(size, (u, v, x, y) => {
    const weave = ((x + y) % 3 === 0 ? 0.9 : 1) * (0.88 + n(u, v) * 0.24);
    let c: RGB = [112, 28, 44];
    const bx = Math.min(u, 1 - u);
    const by = Math.min(v, 1 - v);
    const b = Math.min(bx, by);
    if (b < 0.06) c = [70, 18, 30];
    else if (b < 0.09) c = [190, 150, 70];
    else {
      // losango central dourado
      const d = Math.abs(u - 0.5) + Math.abs(v - 0.5);
      if (Math.abs(d - 0.28) < 0.015 || Math.abs(d - 0.18) < 0.01) c = [190, 150, 70];
      else if (d < 0.18) c = [90, 22, 38];
    }
    return shade(c, weave);
  });
}

function canopy(size: number, seed: number) {
  const out = paint(size, () => [0, 0, 0, 0]);
  const ctx = out.ctx;
  const r = rand(seed);
  const cx = size / 2;
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.07, cx + size * 0.09, size * 0.44, size * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // tufos de folhas em camadas (de baixo para cima, mais claros por cima)
  for (let layer = 0; layer < 3; layer++) {
    const count = 26 - layer * 6;
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * size * (0.32 - layer * 0.07);
      const x = cx + Math.cos(a) * d - layer * size * 0.03;
      const y = cx + Math.sin(a) * d - layer * size * 0.03;
      const rad = size * (0.1 + r() * 0.07);
      const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.35, rad * 0.1, x, y, rad);
      const l = 0.75 + layer * 0.22 + r() * 0.15;
      g.addColorStop(0, `rgb(${70 * l},${130 * l},${55 * l})`);
      g.addColorStop(1, `rgb(${22 * l},${55 * l},${24 * l})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return out;
}

function metal(size: number, seed: number) {
  const n = fbm(seed, 2, 3);
  return paint(size, (u, v) => {
    const brushed = 0.85 + n(u * 0.2, v * 4) * 0.3;
    return shade([150, 156, 164], brushed);
  });
}

function fabric(size: number, seed: number) {
  const n = fbm(seed, 8, 3);
  return paint(size, (u, v, x, y) =>
    shade([235, 228, 214], ((x % 2) ^ (y % 2) ? 0.94 : 1) * (0.9 + n(u, v) * 0.12)),
  );
}

function build(kind: TextureKind): string {
  const size = PX_PER_CELL * TEXTURE_CELLS[kind];
  const out = (() => {
    switch (kind) {
      case 'wood':
        return woodPlanks(size, 11, 8, [128, 84, 46]);
      case 'plank':
        return woodPlanks(size, 23, 3, [138, 92, 52]);
      case 'floor':
        return slabs(size, 3, 4, [58, 52, 66], [24, 20, 28], false, 0.05);
      case 'stone':
        return slabs(size, 5, 3, [118, 114, 108], [48, 44, 42], true, 0.07);
      case 'brick':
        return slabs(size, 8, 4, [96, 52, 42], [36, 30, 30], true, 0.1);
      case 'grass':
        return grass(size, 17);
      case 'dirt':
        return speckled(size, 19, [70, 50, 32], [118, 88, 58], 4, 0.18, 26);
      case 'sand':
        return speckled(size, 29, [176, 150, 104], [214, 192, 146], 6, 0.12, 6);
      case 'rock':
        return speckled(size, 31, [62, 60, 66], [120, 118, 122], 3, 0.1, 12);
      case 'snow':
        return speckled(size, 37, [196, 210, 224], [246, 250, 255], 3, 0.05, 0);
      case 'road':
        return speckled(size, 41, [38, 39, 43], [64, 65, 70], 10, 0.35, 0);
      case 'tile':
        return slabs(size, 43, 4, [214, 218, 222], [150, 156, 162], false, 0.06);
      case 'carpet':
        return carpet(size, 47);
      case 'water':
        return water(size, 53);
      case 'lava':
        return lava(size, 59);
      case 'canopy0':
        return canopy(size, 61);
      case 'canopy1':
        return canopy(size, 67);
      case 'canopy2':
        return canopy(size, 71);
      case 'metal':
        return metal(size, 73);
      case 'fabric':
        return fabric(size, 79);
    }
  })();
  return out.c.toDataURL('image/png');
}

const cache = new Map<TextureKind, string>();
const ALL = Object.keys(TEXTURE_CELLS) as TextureKind[];

/** Todas as texturas (geradas uma vez por aba do navegador). Antes de prontas: objeto vazio. */
export function useTextures(): Partial<Record<TextureKind, string>> {
  const [tex, setTex] = useState<Partial<Record<TextureKind, string>>>(() => Object.fromEntries(cache));
  useEffect(() => {
    if (cache.size === ALL.length) return;
    let alive = true;
    // gera aos poucos para não travar a tela
    const queue = ALL.filter((k) => !cache.has(k));
    const step = () => {
      const k = queue.shift();
      if (!k || !alive) return;
      try {
        cache.set(k, build(k));
      } catch {
        /* navegador sem canvas: fica a cor lisa */
      }
      setTex(Object.fromEntries(cache));
      if (queue.length) setTimeout(step, 0);
    };
    step();
    return () => {
      alive = false;
    };
  }, []);
  return tex;
}
