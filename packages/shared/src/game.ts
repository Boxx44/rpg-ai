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
  session: z.string().uuid().optional(),
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
  sessionId: string | null;
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
  /** Valores do sistema da campanha (validados no servidor contra a definição do sistema). */
  system: z
    .object({
      attributes: z.record(z.number().int()).default({}),
      fields: z.record(z.union([z.string().max(120), z.number()])).default({}),
      skills: z.record(z.string().max(40)).default({}),
      current: z.record(z.number().int()).default({}),
      /** Armas, proteções, rituais e poderes: validados no servidor contra o sistema. */
      weapons: z
        .array(
          z.object({
            ref: z.string().max(40).optional(),
            name: z.string().max(60).optional(),
            kind: z.enum(['melee', 'ranged']).optional(),
            ranged: z.enum(['arremesso', 'disparo', 'fogo']).optional(),
            damage: z.string().max(20).optional(),
            critRange: z.number().int().optional(),
            critMult: z.number().int().optional(),
            damageType: z.string().max(30).optional(),
            spaces: z.number().int().optional(),
            attackBonus: z.number().int().optional(),
          }),
        )
        .max(30)
        .optional(),
      protections: z
        .array(
          z.object({
            ref: z.string().max(40).optional(),
            name: z.string().max(60).optional(),
            defense: z.number().int().optional(),
            spaces: z.number().int().optional(),
          }),
        )
        .max(5)
        .optional(),
      otherSpaces: z.number().int().optional(),
      rituals: z.array(z.string().max(40)).max(100).optional(),
      powers: z.array(z.string().max(90)).max(60).optional(),
      perm: z.record(z.number().int()).optional(),
    })
    .optional(),
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
  /** Ficha completa do NPC (mesmo formato da ficha de personagem). */
  sheet: characterSheetSchema.default({}),
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
export const TERRAINS = [
  'floor',
  'wall',
  'door',
  'water',
  'grass',
  'sand',
  'rock',
  'lava',
  'tree',
  'wood',
  'stone',
  'carpet',
  'road',
  'dirt',
  'snow',
  'tile',
] as const;
export const TERRAIN_LABELS: Record<(typeof TERRAINS)[number], string> = {
  floor: 'Piso',
  wall: 'Parede',
  door: 'Porta (fixa)',
  water: 'Água',
  grass: 'Grama',
  sand: 'Areia',
  rock: 'Rocha',
  lava: 'Lava',
  tree: 'Árvore',
  wood: 'Assoalho',
  stone: 'Pedra',
  carpet: 'Tapete',
  road: 'Asfalto',
  dirt: 'Terra',
  snow: 'Neve',
  tile: 'Azulejo',
};

/**
 * Objetos do mapa (peças "object" com desenho). `states` = estados possíveis
 * (o primeiro é o inicial); objetos com estados podem ser usados pelos jogadores.
 */
export const PROPS = {
  door: { label: 'Porta', group: 'Construção', size: 1, states: ['closed', 'open'] },
  gate: { label: 'Portão', group: 'Construção', size: 2, states: ['closed', 'open'] },
  window: { label: 'Janela', group: 'Construção', size: 1, states: ['closed', 'open'] },
  house: { label: 'Casa', group: 'Construção', size: 3, states: [] },
  stairs: { label: 'Escada', group: 'Construção', size: 1, states: [] },
  table: { label: 'Mesa', group: 'Móveis', size: 2, states: [] },
  chair: { label: 'Cadeira', group: 'Móveis', size: 1, states: [] },
  bed: { label: 'Cama', group: 'Móveis', size: 2, states: [] },
  sofa: { label: 'Sofá', group: 'Móveis', size: 2, states: [] },
  bookshelf: { label: 'Estante', group: 'Móveis', size: 1, states: [] },
  computer: { label: 'Computador', group: 'Móveis', size: 1, states: ['off', 'on'] },
  chest: { label: 'Baú', group: 'Itens', size: 1, states: ['closed', 'open'] },
  crate: { label: 'Caixa', group: 'Itens', size: 1, states: [] },
  barrel: { label: 'Barril', group: 'Itens', size: 1, states: [] },
  knife: { label: 'Faca', group: 'Armas', size: 1, states: [] },
  pistol: { label: 'Pistola', group: 'Armas', size: 1, states: [] },
  shotgun: { label: 'Espingarda', group: 'Armas', size: 1, states: [] },
  axe: { label: 'Machado', group: 'Armas', size: 1, states: [] },
  torch: { label: 'Tocha', group: 'Luz e clima', size: 1, states: ['on', 'off'] },
  campfire: { label: 'Fogueira', group: 'Luz e clima', size: 1, states: ['on', 'off'] },
  lamp: { label: 'Poste de luz', group: 'Luz e clima', size: 1, states: ['on', 'off'] },
  ritual: { label: 'Círculo ritual', group: 'Paranormal', size: 2, states: ['on', 'off'] },
  blood: { label: 'Mancha de sangue', group: 'Paranormal', size: 1, states: [] },
  grave: { label: 'Lápide', group: 'Paranormal', size: 1, states: [] },
  body: { label: 'Corpo', group: 'Paranormal', size: 1, states: [] },
  trap: { label: 'Armadilha', group: 'Paranormal', size: 1, states: ['on', 'off'] },
  car: { label: 'Carro', group: 'Exterior', size: 2, states: [] },
  bush: { label: 'Arbusto', group: 'Exterior', size: 1, states: [] },
  boulder: { label: 'Pedra grande', group: 'Exterior', size: 1, states: [] },
} as const satisfies Record<
  string,
  { label: string; group: string; size: number; states: readonly ('open' | 'closed' | 'on' | 'off')[] }
>;
export type PropKind = keyof typeof PROPS;
export const PROP_KINDS = Object.keys(PROPS) as PropKind[];
export const PROP_STATE_LABELS = { open: 'aberta', closed: 'fechada', on: 'aceso', off: 'apagado' } as const;
export type Terrain = (typeof TERRAINS)[number];

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
  /** Objeto do mapa: qual desenho (porta, baú, tocha…). */
  icon: z.enum(PROP_KINDS as [PropKind, ...PropKind[]]).optional(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
});
export type CreateTokenInput = z.infer<typeof createTokenSchema>;

export const updateTokenSchema = z
  .object({
    label: name(40).optional(),
    color: color.optional(),
    size: z.number().int().min(1).max(4).optional(),
    hidden: z.boolean().optional(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
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
  icon: PropKind | null;
  state: 'open' | 'closed' | 'on' | 'off' | null;
  rotation: number;
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
  propToggled: 'prop.toggled',
  mapsChanged: 'maps.changed',
  npcsChanged: 'npcs.changed',
  charactersChanged: 'characters.changed',
  rejoin: 'campaign.rejoin',
  sessionStarted: 'session.started',
  sessionEnded: 'session.ended',
  sceneChanged: 'scene.changed',
  combatChanged: 'combat.changed',
} as const;

// ───────────── Sessões ─────────────
export const startSessionSchema = z.object({ title: z.string().trim().max(120).default('') });
export const endSessionSchema = z.object({ summary: z.string().trim().max(8000).default('') });
export const sceneSchema = z.object({ mapId: z.string().uuid().nullable() });
export const updateSessionSchema = z
  .object({ title: z.string().trim().max(120).optional(), summary: z.string().trim().max(8000).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhum campo para atualizar' });

export interface SessionDto {
  id: string;
  campaignId: string;
  number: number;
  title: string;
  status: 'live' | 'ended';
  activeMapId: string | null;
  summary: string;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
}

export interface SessionStartedEvent {
  campaignId: string;
  campaignName: string;
  session: SessionDto;
}

// ───────────── Combate ─────────────
export const startCombatSchema = z.object({
  /** Já coloca todos os personagens da campanha no combate. */
  includeCharacters: z.boolean().default(true),
});

export const addCombatantSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character'), characterId: z.string().uuid() }),
  z.object({
    kind: z.literal('npc'),
    npcId: z.string().uuid(),
    hp: z.number().int().min(0).max(99999).default(0),
    hidden: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('enemy'),
    name: z.string().trim().min(1).max(80),
    hp: z.number().int().min(0).max(99999).default(0),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#b4232f'),
    hidden: z.boolean().default(false),
    /** Quantos iguais criar (ex.: 3 zumbis → "Zumbi 1", "Zumbi 2"...). */
    count: z.number().int().min(1).max(12).default(1),
  }),
  z.object({
    kind: z.literal('creature'),
    creatureKey: z.string().regex(/^[a-z0-9_]{1,40}$/),
    hidden: z.boolean().default(false),
    count: z.number().int().min(1).max(12).default(1),
  }),
]);
export const creatureAttackSchema = z.object({ attack: z.number().int().min(0).max(9) });
export type AddCombatantInput = z.infer<typeof addCombatantSchema>;

export const updateCombatantSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    initiative: z.number().int().min(-999).max(999).nullable(),
    conditions: z.array(z.string().trim().min(1).max(40)).max(30),
    hidden: z.boolean(),
    defeated: z.boolean(),
    hpMax: z.number().int().min(0).max(99999),
  })
  .partial();

export const rollInitiativeSchema = z.object({
  /** Bônus para quem não tem ficha de sistema (inimigos, ficha livre). */
  bonus: z.number().int().min(-50).max(50).default(0),
});
export const hpChangeSchema = z.object({
  /** Negativo = dano, positivo = cura. */
  delta: z.number().int().min(-99999).max(99999),
});
export const nextTurnSchema = z.object({ expected: z.string().uuid().nullable() });

export type CombatHealth = 'ok' | 'hurt' | 'down';

export interface CombatantDto {
  id: string;
  kind: 'character' | 'npc' | 'enemy';
  name: string;
  color: string;
  characterId: string | null;
  npcId: string | null;
  initiative: number | null;
  conditions: string[];
  health: CombatHealth;
  hidden: boolean;
  defeated: boolean;
  /** PV visíveis: personagens para todos; NPCs/inimigos só para o mestre. */
  hp: { current: number; max: number } | null;
  /** O usuário pode rolar Iniciativa / passar o turno por este combatente. */
  mine: boolean;
  /** Armas e rituais da ficha do NPC (só para o mestre), para agir no combate. */
  npcSheet?: { weapons: { name: string; damage: string }[]; rituals: { key: string; name: string }[] } | null;
  /** Ficha do livro (só para o mestre). */
  creature?: {
    key: string;
    defesa: number | null;
    vd: number | null;
    page?: number;
    attacks: {
      name: string;
      times: number;
      test: string;
      damage: string;
      type: string;
      critRange: number;
      critMult: number;
    }[];
  } | null;
}

export interface EncounterDto {
  id: string;
  round: number;
  /** null para jogadores quando é a vez de um combatente oculto. */
  currentId: string | null;
  hiddenTurn: boolean;
  combatants: CombatantDto[];
}

// ───────────── Ataques e rituais ─────────────
export const attackSchema = z.object({
  weapon: z.number().int().min(0).max(29),
  mode: z.enum(['melee', 'ranged', 'thrown']).optional(),
  bonus: z.number().int().min(-50).max(50).default(0),
  damageBonus: z.number().int().min(-50).max(100).default(0),
  visibility: z.enum(['public', 'gm']).default('public'),
});
export const castSchema = z.object({
  ritual: z.string().max(40),
  form: z.enum(['basic', 'discente', 'verdadeiro']).default('basic'),
  visibility: z.enum(['public', 'gm']).default('public'),
});
export interface ActionResultDto {
  messages: ChatMessageDto[];
  notes: string[];
  critical?: boolean;
  character?: CharacterDto;
}
export const restSchema = z.object({
  sleep: z.boolean().default(false),
  relax: z.boolean().default(false),
  quality: z.string().max(40),
  meal: z.string().max(40).optional(),
  relaxPartners: z.number().int().min(0).max(20).default(0),
});

// ───────────── Biblioteca de fichas ─────────────
export const librarySheetSchema = z.object({
  kind: z.enum(['character', 'npc']),
  name: z.string().trim().min(1).max(80),
  concept: z.string().max(200).default(''),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#8b5cf6'),
  systemTemplate: z
    .string()
    .regex(/^[a-z0-9_]{1,40}$/)
    .nullable()
    .default(null),
  sheet: characterSheetSchema.default({}),
  npc: z
    .object({
      appearance: z.string().max(2000).default(''),
      publicDescription: z.string().max(2000).default(''),
      details: npcDetailsSchema.omit({ sheet: true }).default({}),
    })
    .default({}),
});
export const updateLibrarySheetSchema = librarySheetSchema.omit({ kind: true }).partial();
export const useLibrarySheetSchema = z.object({ campaignId: z.string().uuid() });
export const saveToLibrarySchema = z.object({
  characterId: z.string().uuid().optional(),
  npcId: z.string().uuid().optional(),
});

export interface LibrarySheetDto {
  id: string;
  kind: 'character' | 'npc';
  name: string;
  concept: string;
  color: string;
  systemTemplate: string | null;
  sheet: CharacterSheet;
  npc: { appearance: string; publicDescription: string; details: Omit<NpcDetails, 'sheet'> };
  updatedAt: string;
}
