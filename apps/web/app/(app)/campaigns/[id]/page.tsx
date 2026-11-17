import {
  type CampaignDto,
  type CampaignMemberDto,
  canManageCampaign,
  GM_MODE_LABELS,
  type InvitationDto,
  type MeDto,
  ROLE_LABELS,
} from '@rpg-ai/shared';
import { Alert, Badge, Ornament } from '@rpg-ai/ui';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  InvitationsPanel,
  LeaveCampaignButton,
  MembersPanel,
  SettingsPanel,
} from '@/components/campaign-forms';
import { api, ApiError } from '@/lib/api';
import { serverToken } from '@/lib/supabase-server';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverToken();
  let campaign: CampaignDto;
  try {
    campaign = await api<CampaignDto>(`/campaigns/${id}`, token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const manager = canManageCampaign(campaign.myRole);
  const [members, invitations, me] = await Promise.all([
    api<CampaignMemberDto[]>(`/campaigns/${id}/members`, token),
    manager ? api<InvitationDto[]>(`/campaigns/${id}/invitations`, token) : Promise.resolve([]),
    api<MeDto>('/me', token),
  ]);

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" /> Campanhas
      </Link>
      <header className="space-y-4 animate-rise">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold">{ROLE_LABELS[campaign.myRole]}</Badge>
          <Badge tone="arcane">{GM_MODE_LABELS[campaign.gmMode]}</Badge>
          {campaign.status === 'archived' && <Badge>Arquivada</Badge>}
        </div>
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl" data-testid="campaign-title">
          {campaign.name}
        </h1>
        {campaign.description && (
          <p className="max-w-3xl whitespace-pre-line text-ink-muted">{campaign.description}</p>
        )}
        <Ornament className="max-w-sm" />
      </header>

      <Alert tone="info" title="A mesa de jogo chega nas próximas fases">
        Fichas, chat, rolagens, mapas e o mestre de IA ainda não estão disponíveis. Por enquanto você pode
        organizar a campanha e reunir seus jogadores.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <MembersPanel campaignId={id} members={members} myRole={campaign.myRole} myId={me.id} />
          {campaign.myRole !== 'owner' && <LeaveCampaignButton campaignId={id} myId={me.id} />}
        </div>
        {manager && (
          <div className="space-y-6">
            <InvitationsPanel campaignId={id} invitations={invitations} myRole={campaign.myRole} />
            <SettingsPanel campaign={campaign} />
          </div>
        )}
      </div>
    </div>
  );
}
