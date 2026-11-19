/**
 * Criador de personagem em pixel art com as peças da biblioteca aberta LPC
 * (Liberated Pixel Cup). O catálogo (`lpc-catalog.json`) é gerado por `tools/lpc/build.py`.
 *
 * Cada peça tem camadas (com profundidade `z`) e, para cada corpo, uma folha "walk"
 * (4 direções × 9 quadros de 64 px). A cor é trocada por paleta: as cores-base da peça
 * são substituídas, uma a uma, pelas cores da paleta escolhida.
 */
import { z } from 'zod';
import raw from './lpc-catalog.json';

export type LpcBody = 'male' | 'female' | 'muscular' | 'teen';
export interface LpcLayer {
  z: number;
  /** corpo → arquivo (peça com troca de cor) ou corpo → variante → arquivo (peça com cores prontas) */
  files: Partial<Record<LpcBody, string | Record<string, string>>>;
}
export interface LpcItem {
  id: string;
  slot: string;
  label: string;
  layers: LpcLayer[];
  /** materiais de paleta, na ordem das cores escolhidas (ex.: ['body','eye'] num rosto) */
  recolor?: string[];
  /** cores prontas (quando não há troca por paleta) */
  variants?: string[];
}
export interface LpcPalette {
  base: string;
  colors: Record<string, string[]>;
}
export interface LpcCatalog {
  bodies: Record<LpcBody, string>;
  slots: Record<string, string>;
  palettes: Record<string, LpcPalette>;
  items: LpcItem[];
}

export const LPC = raw as unknown as LpcCatalog;
export const LPC_BODIES = Object.keys(LPC.bodies) as LpcBody[];
export const LPC_ITEMS = new Map(LPC.items.map((i) => [i.id, i]));
/** Ordem das abas/partes no editor. */
export const LPC_SLOTS = [
  'head',
  'hair',
  'beard',
  'top',
  'jacket',
  'belt',
  'legs',
  'feet',
  'cape',
  'hat',
  'face',
  'neck',
  'gloves',
  'weapon',
] as const;
export type LpcSlot = (typeof LPC_SLOTS)[number];
/** Partes que o personagem sempre tem (não dá para tirar). */
export const LPC_REQUIRED: readonly LpcSlot[] = ['head'];

export const LPC_COLOR_LABELS: Record<string, string> = {
  light: 'Clara',
  amber: 'Âmbar',
  olive: 'Oliva',
  taupe: 'Morena clara',
  bronze: 'Morena',
  brown: 'Marrom',
  black: 'Preta',
  blue: 'Azul',
  bright_green: 'Verde vivo',
  dark_green: 'Verde escuro',
  green: 'Verde',
  lavender: 'Lavanda',
  pale_green: 'Verde pálido',
  zombie: 'Zumbi',
  zombie_green: 'Zumbi verde',
  purple: 'Roxa',
  red: 'Vermelha',
  orange: 'Laranja',
  yellow: 'Amarela',
  gray: 'Cinza',
  ash: 'Cinza-claro',
  platinum: 'Platinada',
  white: 'Branca',
  blonde: 'Loira',
  sandy: 'Areia',
  strawberry: 'Morango',
  gold: 'Dourada',
  ginger: 'Ruiva clara',
  carrot: 'Cenoura',
  redhead: 'Ruiva',
  light_brown: 'Castanho-claro',
  chestnut: 'Castanha',
  dark_brown: 'Castanho-escuro',
  dark_gray: 'Grafite',
  raven: 'Preto-azulado',
  rose: 'Rosé',
  pink: 'Rosa',
  violet: 'Violeta',
  navy: 'Marinho',
  leather: 'Couro',
  walnut: 'Nogueira',
  tan: 'Bege',
  maroon: 'Vinho',
  teal: 'Petróleo',
  bluegray: 'Azul-acinzentado',
  forest: 'Musgo',
  sky: 'Céu',
  slate: 'Ardósia',
  charcoal: 'Carvão',
  ceramic: 'Cerâmica',
  brass: 'Latão',
  copper: 'Cobre',
  iron: 'Ferro',
  steel: 'Aço',
  silver: 'Prata',
};
export const lpcColorLabel = (c: string) => LPC_COLOR_LABELS[c] ?? c.replace(/_/g, ' ');

/** Escolhas de cor de uma peça: uma lista por cor (paleta) ou a lista de variantes prontas. */
export function lpcColorOptions(item: LpcItem): string[][] {
  if (item.recolor) return item.recolor.map((m) => Object.keys(LPC.palettes[m]?.colors ?? {}));
  if (item.variants) return [item.variants];
  return [];
}
/** Cor de exemplo (para a amostra) de uma opção. */
export function lpcSwatch(item: LpcItem, index: number, name: string): string {
  const mat = item.recolor?.[index];
  if (mat) {
    const p = LPC.palettes[mat]?.colors[name];
    return p?.[Math.min(3, p.length - 1)] ?? '#888';
  }
  const pal = LPC.palettes.cloth?.colors[name] ?? LPC.palettes.metal?.colors[name];
  return pal?.[3] ?? VARIANT_SWATCH[name] ?? '#777';
}
const VARIANT_SWATCH: Record<string, string> = { dark_gray: '#3a3a3e', gray: '#7a7a80' };

export function lpcFits(item: LpcItem, body: LpcBody): boolean {
  return item.layers.some((l) => l.files[body] !== undefined);
}
export function lpcItemsFor(slot: string, body: LpcBody): LpcItem[] {
  return LPC.items.filter((i) => i.slot === slot && lpcFits(i, body));
}

const partSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,60}$/),
  color: z
    .array(z.string().regex(/^[a-z0-9_]{1,30}$/))
    .max(2)
    .default([]),
});
export type LpcPart = z.infer<typeof partSchema>;

export const pixelSchema = z
  .object({
    body: z.enum(['male', 'female', 'muscular', 'teen']).default('male'),
    skin: z
      .string()
      .regex(/^[a-z0-9_]{1,30}$/)
      .default('light'),
    parts: z.record(z.string().regex(/^[a-z]{1,12}$/), partSchema).default({}),
  })
  .superRefine((p, ctx) => {
    if (!LPC.palettes.body?.colors[p.skin])
      ctx.addIssue({ code: 'custom', message: `Cor de pele desconhecida: ${p.skin}` });
    for (const [slot, part] of Object.entries(p.parts)) {
      const it = LPC_ITEMS.get(part.id);
      if (!it || it.slot !== slot) {
        ctx.addIssue({ code: 'custom', message: `Peça desconhecida: ${part.id}` });
        continue;
      }
      const opts = lpcColorOptions(it);
      part.color.forEach((c, i) => {
        if (!opts[i]?.includes(c))
          ctx.addIssue({ code: 'custom', message: `Cor inválida para ${part.id}: ${c}` });
      });
    }
  });
export type PixelLook = z.infer<typeof pixelSchema>;

/** Camadas a desenhar (de trás para a frente) com o arquivo e a troca de cor. */
export function lpcLayers(p: PixelLook): { z: number; url: string; map: [string[], string[]][] }[] {
  const out: { z: number; url: string; map: [string[], string[]][] }[] = [];
  const add = (item: LpcItem | undefined, colors: string[]) => {
    if (!item) return;
    for (const l of item.layers) {
      const f = l.files[p.body];
      if (!f) continue;
      let url: string | undefined;
      const map: [string[], string[]][] = [];
      if (typeof f === 'string') {
        url = f;
        item.recolor?.forEach((mat, i) => {
          const pal = LPC.palettes[mat];
          const want = colors[i];
          const base = pal?.colors[pal.base];
          const to = want ? pal?.colors[want] : undefined;
          if (base && to) map.push([base, to]);
        });
      } else {
        url = f[colors[0] ?? ''] ?? Object.values(f)[0];
      }
      if (url) out.push({ z: l.z, url, map });
    }
  };
  add(LPC_ITEMS.get('body'), [p.skin]);
  for (const slot of LPC_SLOTS) {
    const part = p.parts[slot];
    if (!part) continue;
    const it = LPC_ITEMS.get(part.id);
    if (!it) continue;
    // o rosto usa a mesma cor de pele do corpo (cor 1) e a cor dos olhos (cor 2)
    add(it, slot === 'head' ? [p.skin, part.color[1] ?? part.color[0] ?? 'brown'] : part.color);
  }
  return out.sort((a, b) => a.z - b.z);
}

/* ------------------------------------------------------- sorteio estável */

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let x = h >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
}

/** Personagem sorteado (sempre o mesmo para a mesma "semente"). */
export function randomPixel(seed: string, over: Partial<PixelLook> = {}): PixelLook {
  const r = rng(seed);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const body = over.body ?? pick<LpcBody>(['male', 'female', 'male', 'female', 'teen', 'muscular']);
  const skin = over.skin ?? pick(['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black']);
  const fem = body === 'female';
  const parts: Record<string, LpcPart> = {};
  const pickItem = (slot: string, prefer?: (i: LpcItem) => boolean) => {
    const all = lpcItemsFor(slot, body);
    const pool = prefer ? all.filter(prefer) : all;
    return pool.length ? pick(pool) : all.length ? pick(all) : undefined;
  };
  const dress = (slot: string, prefer?: (i: LpcItem) => boolean, colors?: string[]) => {
    const it = pickItem(slot, prefer);
    if (!it) return;
    const opts = lpcColorOptions(it);
    parts[slot] = {
      id: it.id,
      color: opts.map((o, i) => (colors?.[i] && o.includes(colors[i]!) ? colors[i]! : pick(o))),
    };
  };
  const dark = [
    'black',
    'charcoal',
    'navy',
    'maroon',
    'forest',
    'slate',
    'gray',
    'bluegray',
    'teal',
    'purple',
    'red',
    'white',
  ];
  dress('head', (i) => (fem ? i.id === 'heads_human_female' : i.id === 'heads_human_male'), [
    skin,
    pick(['brown', 'blue', 'green', 'gray', 'brown']),
  ]);
  dress('hair', undefined, [
    pick([
      'black',
      'raven',
      'dark_brown',
      'chestnut',
      'light_brown',
      'blonde',
      'redhead',
      'dark_gray',
      'platinum',
      'black',
    ]),
  ]);
  if (!fem && r() < 0.25) dress('beard', undefined, [parts.hair?.color[0] ?? 'black']);
  dress('top', undefined, [pick(dark)]);
  if (body === 'male' && r() < 0.5) dress('jacket', (i) => i.variants?.includes('black') ?? true, ['black']);
  dress('legs', (i) => !/skirt/.test(i.id) || fem, [
    pick(['black', 'navy', 'charcoal', 'gray', 'brown', 'slate', 'blue']),
  ]);
  dress('feet', undefined, [pick(['black', 'brown', 'leather', 'charcoal', 'walnut'])]);
  if (r() < 0.15) dress('face', (i) => /glasses/.test(i.id));
  return pixelSchema.parse({ body, skin, parts: { ...parts, ...over.parts } });
}
