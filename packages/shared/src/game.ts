import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const name = (max: number) => z.string().trim().min(1).max(max);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const VISIBILITIES = ['public', 'gm'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const VISIBILITY_LABELS: Record<Visibility, string> = { public: 'Todos', gm: 'Só o mestre' };

// ───────────── Chat e dados ─────────────
export const rollSchema = z.object({
  expression: z.string().trim().min(1).max(120),
  label: text(80).optional().default(''),
  visibility: z.enum(VISIBILITIES).default('public'),
});
export type RollInput = z.infer<typeof rollSchema>;

export const messageSchema = z.object({
  content: name(2000),
  npcId: z.string().uuid().optional(),
  visibility: z.enum(VISIBILITIES).default('public'),
});
export type MessageInput = z.infer<typeof messageSchema>;

export const messagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export interface RollDieDto {
  value: number;
  kept: boolean;
  exploded?: boolean;
  max?: boolean;
  min?: boolean;
}
export type RollPartDto =
  | { type: 'dice'; sign: 1 | -1; notation: string; dice: RollDieDto[]; subtotal: number }
  | { type: 'number'; sign: 1 | -1; value: number };

export interface ChatMessageDto {
  id: number;
  campaignId: string;
  kind: 'text' | 'roll';
  content: string;
  visibility: Visibility;
  createdAt: string;
  author: { id: string; displayName: string };
  npc: { id: string; name: string; color: string } | null;
  roll: { expression: string; label: string; total: number; parts: RollPartDto[] } | null;
}

// ───────────── Personagens (ficha livre) ─────────────
export const characterSheetSchema = z.object({
  attributes: z
    .array(z.object({ label: name(40), value: text(40) }))
    .max(40)
    .default([]),
  resources: z
    .array(
      z.object({
        label: name(40),
        current: z.number().int().min(-99999).max(99999),
        max: z.number().int().min(0).max(99999),
      }),
    )
    .max(20)
    .default([]),
  inventory: z
    .array(
      z.object({
        name: name(80),
        qty: z.number().int().min(0).max(9999).default(1),
        notes: text(200).default(''),
      }),
    )
    .max(100)
    .default([]),
  notes: text(8000).default(''),
});
export type CharacterSheet = z.infer<typeof characterSheetSchema>;

export const createCharacterSchema = z.object({
  name: name(80),
  concept: text(200).default(''),
  color: color.default('#7c4ff0'),
  sheet: characterSheetSchema.default({}),
});
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

export const updateCharacterSchema = z.object({
  name: name(80).optional(),
  concept: text(200).optional(),
  color: color.optional(),
  sheet: characterSheetSchema.optional(),
  /** Versão que o cliente editou; evita sobrescrever alterações de outra pessoa. */
  version: z.number().int().positive(),
});
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;

export interface CharacterDto {
  id: string;
  campaignId: string;
  ownerId: string;
  ownerName: string;
  name: string;
  concept: string;
  color: string;
  sheet: CharacterSheet;
  version: number;
  canEdit: boolean;
  updatedAt: string;
}

// ───────────── NPCs ─────────────
export const npcDetailsSchema = z.object({
  personality: text(4000).default(''),
  backstory: text(8000).default(''),
  motivations: text(4000).default(''),
  secrets: text(4000).default(''),
  notes: text(8000).default(''),
  stats: z
    .array(z.object({ label: name(40), value: text(40) }))
    .max(40)
    .default([]),
});
export type NpcDetails = z.infer<typeof npcDetailsSchema>;

export const createNpcSchema = z.object({
  name: name(80),
  appearance: text(2000).default(''),
  publicDescription: text(2000).default(''),
  color: color.default('#c9a24b'),
  revealed: z.boolean().default(false),
  details: npcDetailsSchema.default({}),
});
export type CreateNpcInput = z.infer<typeof createNpcSchema>;

export const updateNpcSchema = z
  .object({
    name: name(80).optional(),
    appearance: text(2000).optional(),
    publicDescription: text(2000).optional(),
    color: color.optional(),
    revealed: z.boolean().optional(),
    details: npcDetailsSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhum campo para atualizar' });
export type UpdateNpcInput = z.infer<typeof updateNpcSchema>;

export interface NpcDto {
  id: string;
  campaignId: string;
  name: string;
  appearance: string;
  publicDescription: string;
  color: string;
  revealed: boolean;
  /** Presente apenas para o mestre. */
  details?: NpcDetails;
  updatedAt: string;
}

// ───────────── Mapas ─────────────
export const TERRAINS = ['floor', 'wall', 'door', 'water', 'grass', 'sand', 'rock', 'lava', 'tree'] as const;
export type Terrain = (typeof TERRAINS)[number];
export const TERRAIN_LABELS: Record<Terrain, string> = {
  floor: 'Piso',
  wall: 'Parede',
  door: 'Porta',
  water: 'Água',
  grass: 'Grama',
  sand: 'Areia',
  rock: 'Pedra',
  lava: 'Lava',
  tree: 'Árvore',
};

export const createMapSchema = z.object({
  name: name(80),
  cols: z.number().int().min(4).max(100).default(24),
  rows: z.number().int().min(4).max(100).default(16),
  cellLabel: text(20).default('1,5 m'),
});
export type CreateMapInput = z.infer<typeof createMapSchema>;

export const updateMapSchema = z
  .object({
    name: name(80).optional(),
    cols: z.number().int().min(4).max(100).optional(),
    rows: z.number().int().min(4).max(100).optional(),
    cellLabel: text(20).optional(),
    shared: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhum campo para atualizar' });
export type UpdateMapInput = z.infer<typeof updateMapSchema>;

export const paintSchema = z.object({
  cells: z
    .array(
      z.object({
        x: z.number().int().min(0).max(99),
        y: z.number().int().min(0).max(99),
        terrain: z.enum(TERRAINS).nullable(),
      }),
    )
    .min(1)
    .max(2000),
});
export type PaintInput = z.infer<typeof paintSchema>;

export const TOKEN_KINDS = ['character', 'npc', 'enemy', 'object'] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];
export const TOKEN_KIND_LABELS: Record<TokenKind, string> = {
  character: 'Personagem',
  npc: 'NPC',
  enemy: 'Inimigo',
  object: 'Objeto',
};

export const createTokenSchema = z.object({
  kind: z.enum(TOKEN_KINDS),
  label: name(40),
  color: color.default('#7c4ff0'),
  x: z.number().int().min(0).max(99),
  y: z.number().int().min(0).max(99),
  size: z.number().int().min(1).max(4).default(1),
  hidden: z.boolean().default(false),
  characterId: z.string().uuid().optional(),
  npcId: z.string().uuid().optional(),
});
export type CreateTokenInput = z.infer<typeof createTokenSchema>;

export const updateTokenSchema = z
  .object({
    label: name(40).optional(),
    color: color.optional(),
    size: z.number().int().min(1).max(4).optional(),
    hidden: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhum campo para atualizar' });
export type UpdateTokenInput = z.infer<typeof updateTokenSchema>;

export const moveTokenSchema = z.object({
  x: z.number().int().min(0).max(99),
  y: z.number().int().min(0).max(99),
});

export interface TokenDto {
  id: string;
  mapId: string;
  kind: TokenKind;
  label: string;
  color: string;
  characterId: string | null;
  npcId: string | null;
  controlledBy: string | null;
  x: number;
  y: number;
  size: number;
  hidden: boolean;
}

export interface MapSummaryDto {
  id: string;
  name: string;
  cols: number;
  rows: number;
  shared: boolean;
  updatedAt: string;
}

export interface MapDto extends MapSummaryDto {
  campaignId: string;
  cellLabel: string;
  terrain: Record<string, Terrain>;
  tokens: TokenDto[];
}

/** Distância em quadrados (diagonal conta 1, como na maioria dos sistemas de grade). */
export function gridDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// ───────────── Eventos em tempo real (servidor → cliente) ─────────────
export const WS_EVENTS = {
  chatMessage: 'chat.message',
  tokenMoved: 'token.moved',
  mapsChanged: 'maps.changed',
  npcsChanged: 'npcs.changed',
  charactersChanged: 'characters.changed',
  rejoin: 'campaign.rejoin',
} as const;
