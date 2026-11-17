import { sql, type Tx } from '@rpg-ai/db';
import { type CampaignRole, canManageCampaign } from '@rpg-ai/shared';
import { forbidden, notFound } from '../common/errors';

/** Papel do usuário da transação na campanha (null = não participa ou campanha excluída). */
export async function roleIn(tx: Tx, campaignId: string): Promise<CampaignRole | null> {
  const r = await tx.execute<{ role: CampaignRole | null }>(
    sql`select app_private.campaign_role(${campaignId}::uuid) as role`,
  );
  return r[0]?.role ?? null;
}

/** Não-membros recebem 404: não revelamos se a campanha existe. */
export async function requireMember(tx: Tx, campaignId: string): Promise<CampaignRole> {
  const role = await roleIn(tx, campaignId);
  if (!role) throw notFound('Campanha');
  return role;
}

export async function requireManager(tx: Tx, campaignId: string): Promise<CampaignRole> {
  const role = await requireMember(tx, campaignId);
  if (!canManageCampaign(role)) throw forbidden('Apenas o dono ou o mestre podem fazer isso');
  return role;
}

export async function requirePlayer(tx: Tx, campaignId: string): Promise<CampaignRole> {
  const role = await requireMember(tx, campaignId);
  if (role === 'spectator') throw forbidden('Espectadores apenas acompanham a mesa');
  return role;
}
