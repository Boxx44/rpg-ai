import type { SystemDefinition } from '@rpg-ai/rules-engine';
import type { CampaignDto, CampaignSystemDto, CharacterDto } from '@rpg-ai/shared';
import { CharactersBoard } from '@/components/characters-board';
import { pageApi as api } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Personagens' };

export default async function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverToken();
  const [campaign, characters, system] = await Promise.all([
    api<CampaignDto>(`/campaigns/${id}`, token),
    api<CharacterDto[]>(`/campaigns/${id}/characters`, token),
    api<CampaignSystemDto | null>(`/campaigns/${id}/system`, token),
  ]);
  return (
    <CharactersBoard
      campaignId={id}
      characters={characters}
      canCreate={campaign.myRole !== 'spectator'}
      definition={(system?.definition as SystemDefinition | undefined) ?? null}
    />
  );
}
