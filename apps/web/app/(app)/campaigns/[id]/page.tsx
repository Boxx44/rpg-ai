import type {
  CampaignDto,
  CampaignSystemDto,
  CharacterDto,
  ChatMessageDto,
  MapSummaryDto,
  MeDto,
  NpcDto,
} from '@rpg-ai/shared';
import { GameTable } from '@/components/game-table';
import { pageApi as api } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Mesa' };

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverToken();
  const [campaign, me, messages, maps, npcs] = await Promise.all([
    api<CampaignDto>(`/campaigns/${id}`, token),
    api<MeDto>('/me', token),
    api<ChatMessageDto[]>(`/campaigns/${id}/messages?limit=100`, token),
    api<MapSummaryDto[]>(`/campaigns/${id}/maps`, token),
    api<NpcDto[]>(`/campaigns/${id}/npcs`, token),
  ]);
  const [characters, system] = await Promise.all([
    api<CharacterDto[]>(`/campaigns/${id}/characters`, token),
    api<CampaignSystemDto | null>(`/campaigns/${id}/system`, token),
  ]);
  return (
    <GameTable
      campaignId={id}
      myId={me.id}
      myRole={campaign.myRole}
      initialMessages={messages}
      initialMaps={maps}
      initialNpcs={npcs}
      initialCharacters={characters}
      system={system}
    />
  );
}
