import {
  type CampaignDto,
  canManageCampaign,
  type CharacterDto,
  type MapSummaryDto,
  type NpcDto,
} from '@rpg-ai/shared';
import { notFound } from 'next/navigation';
import { MapEditor } from '@/components/map-editor';
import { pageApi as api } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Mapas' };

export default async function MapsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverToken();
  const campaign = await api<CampaignDto>(`/campaigns/${id}`, token);
  if (!canManageCampaign(campaign.myRole)) notFound();
  const [maps, characters, npcs] = await Promise.all([
    api<MapSummaryDto[]>(`/campaigns/${id}/maps`, token),
    api<CharacterDto[]>(`/campaigns/${id}/characters`, token),
    api<NpcDto[]>(`/campaigns/${id}/npcs`, token),
  ]);
  return <MapEditor campaignId={id} maps={maps} characters={characters} npcs={npcs} />;
}
