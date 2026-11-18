/**
 * Drizzle schema — espelho tipado das tabelas criadas pelas migrations SQL em /migrations.
 * As migrations SQL são a fonte da verdade (incluem RLS, funções e triggers).
 */
import {
  bigint,
  customType,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  locale: text('locale').notNull().default('pt-BR'),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  ownerId: uuid('owner_id').notNull(),
  isPersonal: boolean('is_personal').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: uuid('organization_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: text('role').$type<'owner' | 'admin' | 'member'>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] })],
);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  createdBy: uuid('created_by').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  gmMode: text('gm_mode').$type<'human' | 'ai' | 'assistant'>().notNull().default('human'),
  status: text('status').$type<'active' | 'archived'>().notNull().default('active'),
  systemVersionId: uuid('system_version_id'),
  sandbox: boolean('sandbox').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const campaignMembers = pgTable(
  'campaign_members',
  {
    campaignId: uuid('campaign_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: text('role').$type<'owner' | 'gm' | 'player' | 'spectator'>().notNull(),
    invitedBy: uuid('invited_by'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

export const campaignInvitations = pgTable('campaign_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull(),
  email: text('email'),
  role: text('role').$type<'gm' | 'player' | 'spectator'>().notNull(),
  tokenHash: text('token_hash').notNull(),
  createdBy: uuid('created_by').notNull(),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  acceptedBy: uuid('accepted_by'),
  revokedAt: ts('revoked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  actorType: text('actor_type').$type<'user' | 'ai' | 'system'>().notNull(),
  actorId: uuid('actor_id'),
  organizationId: uuid('organization_id'),
  campaignId: uuid('campaign_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  requestId: text('request_id'),
  ipHash: text('ip_hash'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  concept: text('concept').notNull().default(''),
  color: text('color').notNull().default('#7c4ff0'),
  sheet: jsonb('sheet').notNull().default({}),
  version: integer('version').notNull().default(1),
  portraitAsset: uuid('portrait_asset'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const npcs = pgTable('npcs', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull(),
  createdBy: uuid('created_by').notNull(),
  name: text('name').notNull(),
  appearance: text('appearance').notNull().default(''),
  publicDescription: text('public_description').notNull().default(''),
  color: text('color').notNull().default('#c9a24b'),
  revealed: boolean('revealed').notNull().default(false),
  portraitAsset: uuid('portrait_asset'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const npcGmDetails = pgTable('npc_gm_details', {
  npcId: uuid('npc_id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  personality: text('personality').notNull().default(''),
  backstory: text('backstory').notNull().default(''),
  motivations: text('motivations').notNull().default(''),
  secrets: text('secrets').notNull().default(''),
  notes: text('notes').notNull().default(''),
  stats: jsonb('stats').notNull().default([]),
  sheet: jsonb('sheet').notNull().default({}),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const maps = pgTable('maps', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull(),
  createdBy: uuid('created_by').notNull(),
  name: text('name').notNull(),
  cols: integer('cols').notNull().default(24),
  rows: integer('rows').notNull().default(16),
  cellLabel: text('cell_label').notNull().default('1,5 m'),
  terrain: jsonb('terrain').$type<Record<string, string>>().notNull().default({}),
  shared: boolean('shared').notNull().default(false),
  backgroundAsset: uuid('background_asset'),
  gridVisible: boolean('grid_visible').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const mapTokens = pgTable('map_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  mapId: uuid('map_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  kind: text('kind').$type<'character' | 'npc' | 'enemy' | 'object'>().notNull(),
  label: text('label').notNull(),
  color: text('color').notNull().default('#7c4ff0'),
  characterId: uuid('character_id'),
  npcId: uuid('npc_id'),
  controlledBy: uuid('controlled_by'),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  size: integer('size').notNull().default(1),
  hidden: boolean('hidden').notNull().default(false),
  icon: text('icon'),
  state: text('state').$type<'open' | 'closed' | 'on' | 'off'>(),
  rotation: integer('rotation').notNull().default(0),
  imageAsset: uuid('image_asset'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Imagens (fundo de mapa, token, retrato), guardadas já reduzidas. */
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  kind: text('kind').$type<'map' | 'token' | 'portrait'>().notNull(),
  name: text('name').notNull().default(''),
  mime: text('mime').$type<'image/png' | 'image/jpeg' | 'image/webp'>().notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  data: bytea('data').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const diceRolls = pgTable('dice_rolls', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull(),
  rollerId: uuid('roller_id').notNull(),
  expression: text('expression').notNull(),
  label: text('label').notNull().default(''),
  result: jsonb('result').notNull(),
  total: integer('total').notNull(),
  visibility: text('visibility').$type<'public' | 'gm'>().notNull(),
  sessionId: uuid('session_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  authorId: uuid('author_id').notNull(),
  npcId: uuid('npc_id'),
  speakerName: text('speaker_name'),
  speakerColor: text('speaker_color'),
  kind: text('kind').$type<'text' | 'roll'>().notNull(),
  content: text('content').notNull().default(''),
  rollId: uuid('roll_id'),
  visibility: text('visibility').$type<'public' | 'gm'>().notNull(),
  sessionId: uuid('session_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const rpgSystems = pgTable('rpg_systems', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  createdBy: uuid('created_by').notNull(),
  templateId: text('template_id'),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const systemVersions = pgTable('system_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  systemId: uuid('system_id').notNull(),
  version: integer('version').notNull(),
  definition: jsonb('definition').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  systemId: uuid('system_id').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  filename: text('filename').notNull(),
  storageKey: text('storage_key').notNull(),
  sha256: text('sha256').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  pageCount: integer('page_count'),
  pagesWithoutText: integer('pages_without_text'),
  status: text('status').$type<'queued' | 'processing' | 'ready' | 'failed'>().notNull().default('queued'),
  progress: integer('progress').notNull().default(0),
  error: text('error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const documentPages = pgTable('document_pages', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  documentId: uuid('document_id').notNull(),
  systemId: uuid('system_id').notNull(),
  pageNumber: integer('page_number').notNull(),
  text: text('text').notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull().default(''),
  status: text('status').$type<'live' | 'ended'>().notNull().default('live'),
  activeMapId: uuid('active_map_id'),
  summary: text('summary').notNull().default(''),
  startedBy: uuid('started_by').notNull(),
  startedAt: ts('started_at').notNull().defaultNow(),
  endedAt: ts('ended_at'),
});

export const encounters = pgTable('encounters', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull(),
  sessionId: uuid('session_id'),
  status: text('status').$type<'active' | 'ended'>().notNull().default('active'),
  round: integer('round').notNull().default(1),
  currentCombatantId: uuid('current_combatant_id'),
  startedBy: uuid('started_by').notNull(),
  startedAt: ts('started_at').notNull().defaultNow(),
  endedAt: ts('ended_at'),
});

export const combatants = pgTable('combatants', {
  id: uuid('id').primaryKey().defaultRandom(),
  encounterId: uuid('encounter_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  kind: text('kind').$type<'character' | 'npc' | 'enemy'>().notNull(),
  characterId: uuid('character_id'),
  npcId: uuid('npc_id'),
  creatureKey: text('creature_key'),
  name: text('name').notNull(),
  color: text('color').notNull().default('#b4232f'),
  initiative: integer('initiative'),
  tiebreak: integer('tiebreak').notNull().default(0), // o banco sorteia (DEFAULT)
  conditions: text('conditions').array().notNull().default([]),
  health: text('health').$type<'ok' | 'hurt' | 'down'>().notNull().default('ok'),
  hidden: boolean('hidden').notNull().default(false),
  defeated: boolean('defeated').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const combatantGmDetails = pgTable('combatant_gm_details', {
  combatantId: uuid('combatant_id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  hpCurrent: integer('hp_current').notNull().default(0),
  hpMax: integer('hp_max').notNull().default(0),
});

export const librarySheets = pgTable('library_sheets', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
  kind: text('kind').$type<'character' | 'npc'>().notNull(),
  name: text('name').notNull(),
  concept: text('concept').notNull().default(''),
  color: text('color').notNull().default('#8b5cf6'),
  systemTemplate: text('system_template'),
  sheet: jsonb('sheet').notNull().default({}),
  npc: jsonb('npc').notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});
