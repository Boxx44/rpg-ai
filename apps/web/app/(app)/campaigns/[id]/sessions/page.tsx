import { type CampaignDto, canManageCampaign, type SessionDto } from '@rpg-ai/shared';
import { SessionsHistory } from '@/components/sessions-history';
import { pageApi as api } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Sessões' };

export default async function SessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverToken();
  const [campaign, sessions] = await Promise.all([
    api<CampaignDto>(`/campaigns/${id}`, token),
    api<SessionDto[]>(`/campaigns/${id}/sessions`, token),
  ]);
  return <SessionsHistory campaignId={id} sessions={sessions} manager={canManageCampaign(campaign.myRole)} />;
}
