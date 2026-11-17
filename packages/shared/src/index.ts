import { z } from 'zod';

// ───────────── Enums ─────────────
export const CAMPAIGN_ROLES = ['owner', 'gm', 'player', 'spectator'] as const;
export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];
export const INVITABLE_ROLES = ['gm', 'player', 'spectator'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const GM_MODES = ['human', 'ai', 'assistant'] as const;
export type GmMode = (typeof GM_MODES)[number];

export const CAMPAIGN_STATUSES = ['active', 'archived'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Roles that can manage a campaign (settings, members, invitations). */
export const MANAGER_ROLES: readonly CampaignRole[] = ['owner', 'gm'];

export const ROLE_LABELS: Record<CampaignRole, string> = {
  owner: 'Dono',
  gm: 'Mestre',
  player: 'Jogador',
  spectator: 'Espectador',
};

export const GM_MODE_LABELS: Record<GmMode, string> = {
  human: 'Mestre humano',
  ai: 'Mestre de IA',
  assistant: 'Mestre humano + assistente de IA',
};

// ───────────── Input schemas ─────────────
const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const createCampaignSchema = z.object({
  name: trimmed(1, 100),
  description: z.string().trim().max(2000).optional().default(''),
  gmMode: z.enum(GM_MODES).default('human'),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z
  .object({
    name: trimmed(1, 100).optional(),
    description: z.string().trim().max(2000).optional(),
    gmMode: z.enum(GM_MODES).optional(),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhum campo para atualizar' });
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const createInvitationSchema = z.object({
  role: z.enum(INVITABLE_ROLES).default('player'),
  email: z.string().trim().toLowerCase().email().optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const updateMemberSchema = z.object({ role: z.enum(INVITABLE_ROLES) });
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const updateProfileSchema = z
  .object({
    displayName: trimmed(1, 60).optional(),
    locale: z.enum(['pt-BR', 'en']).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhum campo para atualizar' });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const uuidSchema = z.string().uuid();

/** Invitation tokens are 32 random bytes encoded as base64url (43 chars). */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

// ───────────── Response DTOs ─────────────
export interface MeDto {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
}

export interface CampaignDto {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  gmMode: GmMode;
  status: CampaignStatus;
  myRole: CampaignRole;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMemberDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: CampaignRole;
  joinedAt: string;
}

export interface InvitationDto {
  id: string;
  campaignId: string;
  role: InvitableRole;
  email: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedInvitationDto extends InvitationDto {
  /** Plain token — returned only once, at creation time. */
  token: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  role: 'owner' | 'admin' | 'member';
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  checks: { database: 'ok' | 'down'; redis: 'ok' | 'down' };
  version: string;
}

// ───────────── Errors ─────────────
export const ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVITATION_INVALID: 'INVITATION_INVALID',
  INTERNAL: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown; requestId?: string };
}

export function canManageCampaign(role: CampaignRole | null | undefined): boolean {
  return role != null && MANAGER_ROLES.includes(role);
}
export * from './game';
