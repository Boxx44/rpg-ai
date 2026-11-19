/**
 * Aparência do personagem para o boneco 2D (token): corpo, pele, cabelo, roupas,
 * calçados, acessórios e item na mão. Validada no servidor dentro da ficha.
 */
import { z } from 'zod';

export const FRAMES = ['fem', 'masc'] as const;
export const BODY_TYPES = ['magro', 'medio', 'atletico', 'forte', 'largo', 'pesado'] as const;
export const HAIR_STYLES = [
  'curto',
  'repartido',
  'franja',
  'longo',
  'rabo',
  'coque',
  'cacheado',
  'moicano',
  'raspado',
  'trancas',
  'baguncado',
  'careca',
  'chanel',
  'ondulado',
] as const;
export const TOP_STYLES = [
  'camiseta',
  'regata',
  'cropped',
  'camisa',
  'moletom',
  'jaqueta',
  'sobretudo',
  'quimono',
  'manto',
  'terno',
  'colete',
] as const;
export const BOTTOM_STYLES = ['calca', 'cargo', 'larga', 'saia', 'saia_longa', 'shorts'] as const;
export const SHOE_STYLES = ['botas', 'coturno', 'tenis', 'sapatos', 'salto', 'descalco'] as const;
export const ACCESSORIES = [
  'caveira',
  'oculos',
  'venda',
  'colar',
  'pingente',
  'brincos',
  'cicatriz',
  'tatuagem',
  'luvas',
  'correntes',
  'cinto',
  'cachecol',
] as const;
export const HELD_ITEMS = [
  'nenhum',
  'pistola',
  'faca',
  'taco',
  'katana',
  'livro',
  'lanterna',
  'espingarda',
  'machado',
  'celular',
] as const;

export type Frame = (typeof FRAMES)[number];
export type BodyType = (typeof BODY_TYPES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type TopStyle = (typeof TOP_STYLES)[number];
export type BottomStyle = (typeof BOTTOM_STYLES)[number];
export type ShoeStyle = (typeof SHOE_STYLES)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type HeldItem = (typeof HELD_ITEMS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida');

export const appearanceSchema = z.object({
  /** Silhueta: feminina ou masculina. */
  frame: z.enum(FRAMES).default('masc'),
  body: z.enum(BODY_TYPES).default('medio'),
  skin: hex.default('#e0ac85'),
  eyes: hex.default('#3b2a1a'),
  hair: z
    .object({
      style: z.enum(HAIR_STYLES).default('curto'),
      color: hex.default('#2a1d16'),
      streak: hex.nullable().default(null),
    })
    .default({}),
  top: z
    .object({
      style: z.enum(TOP_STYLES).default('camiseta'),
      color: hex.default('#1f1d24'),
      accent: hex.default('#7a1f2b'),
    })
    .default({}),
  bottom: z
    .object({ style: z.enum(BOTTOM_STYLES).default('calca'), color: hex.default('#26252c') })
    .default({}),
  shoes: z.object({ style: z.enum(SHOE_STYLES).default('botas'), color: hex.default('#3a2620') }).default({}),
  accessories: z.array(z.enum(ACCESSORIES)).max(6).default([]),
  held: z.enum(HELD_ITEMS).default('nenhum'),
  /** Capuz levantado (moletom e manto). */
  hood: z.boolean().default(false),
});
export type Appearance = z.infer<typeof appearanceSchema>;

export const APPEARANCE_LABELS = {
  frame: { fem: 'Feminino', masc: 'Masculino' } as Record<Frame, string>,
  body: {
    magro: 'Magro',
    medio: 'Médio',
    atletico: 'Atlético',
    forte: 'Musculoso',
    largo: 'Robusto',
    pesado: 'Gordo',
  } as Record<BodyType, string>,
  hair: {
    curto: 'Curto',
    repartido: 'Repartido',
    franja: 'Franja',
    longo: 'Longo',
    rabo: 'Rabo de cavalo',
    coque: 'Coque',
    cacheado: 'Cacheado',
    moicano: 'Moicano',
    raspado: 'Raspado',
    trancas: 'Tranças',
    baguncado: 'Bagunçado',
    careca: 'Careca',
    chanel: 'Chanel',
    ondulado: 'Longo ondulado',
  } as Record<HairStyle, string>,
  top: {
    camiseta: 'Camiseta',
    regata: 'Regata',
    cropped: 'Cropped de manga longa',
    camisa: 'Camisa social',
    quimono: 'Quimono aberto',
    moletom: 'Moletom',
    jaqueta: 'Jaqueta',
    sobretudo: 'Sobretudo',
    manto: 'Manto',
    terno: 'Terno',
    colete: 'Colete tático',
  } as Record<TopStyle, string>,
  bottom: {
    calca: 'Calça',
    cargo: 'Cargo',
    larga: 'Calça larga',
    saia: 'Saia curta',
    saia_longa: 'Saia longa',
    shorts: 'Shorts',
  } as Record<BottomStyle, string>,
  shoes: {
    botas: 'Botas',
    coturno: 'Coturno alto',
    tenis: 'Tênis',
    sapatos: 'Sapatos',
    salto: 'Salto plataforma',
    descalco: 'Descalço',
  } as Record<ShoeStyle, string>,
  accessories: {
    caveira: 'Máscara de caveira',
    oculos: 'Óculos',
    venda: 'Faixa no olho',
    colar: 'Gargantilha',
    pingente: 'Colar com pingente',
    brincos: 'Brincos',
    tatuagem: 'Tatuagens',
    cinto: 'Cinto',
    cicatriz: 'Cicatriz',
    luvas: 'Luvas',
    correntes: 'Correntes',
    cachecol: 'Cachecol',
  } as Record<Accessory, string>,
  held: {
    nenhum: 'Nada',
    pistola: 'Pistola',
    faca: 'Faca',
    taco: 'Taco com pregos',
    katana: 'Katana',
    livro: 'Livro',
    lanterna: 'Lanterna',
    espingarda: 'Espingarda',
    machado: 'Machado',
    celular: 'Celular',
  } as Record<HeldItem, string>,
};

export const SKIN_TONES = [
  '#f6dccb',
  '#f2d0b1',
  '#e0ac85',
  '#c68863',
  '#a86f4c',
  '#8a5638',
  '#6e4630',
  '#4e3022',
  '#d6e0d0',
  '#c9c4d6',
];
export const HAIR_COLORS = [
  '#121014',
  '#2a1d16',
  '#4a2e1a',
  '#7a4a24',
  '#a8642c',
  '#d9b46a',
  '#e9e2d4',
  '#8c8a90',
  '#9e2a1e',
  '#c43a4a',
  '#6a2a8c',
  '#2a4a9c',
  '#2f7a5a',
  '#e86aa8',
];
export const CLOTH_COLORS = [
  '#121116',
  '#1f1d24',
  '#2e2c34',
  '#4a4852',
  '#8a8892',
  '#e8e4dc',
  '#5a1a22',
  '#8c1f2b',
  '#c43a2a',
  '#3a2618',
  '#6a4a2a',
  '#a8865a',
  '#24324a',
  '#2a5a8c',
  '#1f3a2a',
  '#3e5a2a',
  '#4a2a5a',
  '#c9a24b',
];

function rnd(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Aparência sorteada de forma fixa por uma semente (ex.: id do token). */
export function randomAppearance(seed: string, overrides: Partial<Appearance> = {}): Appearance {
  const r = rnd(seed);
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const darkCloth = CLOTH_COLORS.slice(0, 4);
  const frame = pick(FRAMES);
  const base: Appearance = {
    frame,
    body: pick(BODY_TYPES.filter((b) => b !== 'pesado' || r() < 0.4)),
    skin: pick(SKIN_TONES.slice(0, 8)),
    eyes: pick(['#3b2a1a', '#2a4a6a', '#3a5a3a', '#6a4a2a', '#1a1a1a']),
    hair: {
      style: pick(HAIR_STYLES.filter((h) => h !== 'careca' || r() < 0.3)),
      color: pick(HAIR_COLORS.slice(0, 9)),
      streak: r() < 0.2 ? pick(['#c43a4a', '#e9e2d4', '#6a2a8c']) : null,
    },
    top: {
      style: pick(TOP_STYLES.filter((t) => t !== 'manto' && (frame === 'fem' || t !== 'cropped'))),
      color: pick(darkCloth),
      accent: pick(['#7a1f2b', '#8c1f2b', '#c9a24b', '#2a5a8c', '#4a4852']),
    },
    bottom: {
      style: pick(BOTTOM_STYLES.filter((b) => frame === 'fem' || !b.startsWith('saia'))),
      color: pick(darkCloth),
    },
    shoes: {
      style: pick(['botas', 'tenis', 'sapatos'] as const),
      color: pick(['#121116', '#3a2620', '#5a1a22', '#e8e4dc']),
    },
    accessories:
      r() < 0.5
        ? [
            pick([
              'oculos',
              'colar',
              'pingente',
              'brincos',
              'cicatriz',
              'luvas',
              'correntes',
              'cinto',
            ] as const),
          ]
        : [],
    held: 'nenhum',
    hood: false,
  };
  return appearanceSchema.parse({ ...base, ...overrides });
}
