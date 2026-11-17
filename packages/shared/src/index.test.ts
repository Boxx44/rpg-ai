import { describe, expect, it } from 'vitest';
import {
  canManageCampaign,
  createCampaignSchema,
  createInvitationSchema,
  invitationTokenSchema,
  updateCampaignSchema,
} from './index';

describe('createCampaignSchema', () => {
  it('applies defaults and trims', () => {
    const v = createCampaignSchema.parse({ name: '  A Maldição  ' });
    expect(v).toEqual({ name: 'A Maldição', description: '', gmMode: 'human' });
  });
  it('rejects empty and oversized names', () => {
    expect(createCampaignSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
  });
  it('rejects unknown gm mode', () => {
    expect(createCampaignSchema.safeParse({ name: 'a', gmMode: 'robot' }).success).toBe(false);
  });
});

describe('updateCampaignSchema', () => {
  it('requires at least one field', () => {
    expect(updateCampaignSchema.safeParse({}).success).toBe(false);
    expect(updateCampaignSchema.safeParse({ status: 'archived' }).success).toBe(true);
  });
});

describe('createInvitationSchema', () => {
  it('never allows inviting an owner', () => {
    expect(createInvitationSchema.safeParse({ role: 'owner' }).success).toBe(false);
  });
  it('normalizes email', () => {
    expect(createInvitationSchema.parse({ email: ' Ana@Mail.COM ' }).email).toBe('ana@mail.com');
  });
});

describe('invitationTokenSchema', () => {
  it('accepts 43-char base64url tokens only', () => {
    expect(invitationTokenSchema.safeParse('a'.repeat(43)).success).toBe(true);
    expect(invitationTokenSchema.safeParse('a'.repeat(42)).success).toBe(false);
    expect(invitationTokenSchema.safeParse('a'.repeat(42) + '/').success).toBe(false);
  });
});

describe('canManageCampaign', () => {
  it('only owner and gm manage', () => {
    expect(canManageCampaign('owner')).toBe(true);
    expect(canManageCampaign('gm')).toBe(true);
    expect(canManageCampaign('player')).toBe(false);
    expect(canManageCampaign(null)).toBe(false);
  });
});
