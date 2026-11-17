import type { CampaignDto, CharacterDto } from '@rpg-ai/shared';
import { CharactersBoard } from '@/components/characters-board';
import { pageApi as api } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Personagens' };

export default async function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverToken();
  const [campaign, characters] = await Promise.all([
    api<CampaignDto>(`/campaigns/${id}`, token),
    api<CharacterDto[]>(`/campaigns/${id}/characters`, token),
  ]);
  return (
    <CharactersBoard campaignId={id} characters={characters} canCreate={campaign.myRole !== 'spectator'} />
  );
}
