import { type CampaignDto, canManageCampaign, type NpcDto } from '@rpg-ai/shared';
import { NpcsBoard } from '@/components/npcs-board';
import { pageApi as api } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'NPCs' };

export default async function NpcsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverToken();
  const [campaign, npcs] = await Promise.all([
    api<CampaignDto>(`/campaigns/${id}`, token),
    api<NpcDto[]>(`/campaigns/${id}/npcs`, token),
  ]);
  return <NpcsBoard campaignId={id} npcs={npcs} manager={canManageCampaign(campaign.myRole)} />;
}
