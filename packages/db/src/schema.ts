/**
 * Drizzle schema — espelho tipado das tabelas criadas pelas migrations SQL em /migrations.
 * As migrations SQL são a fonte da verdade (incluem RLS, funções e triggers).
 */
import { bigint, boolean, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

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
