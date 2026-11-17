import {
  type CampaignDto,
  type CampaignMemberDto,
  canManageCampaign,
  type InvitationDto,
  type MeDto,
} from '@rpg-ai/shared';
import {
  InvitationsPanel,
  LeaveCampaignButton,
  MembersPanel,
  SettingsPanel,
} from '@/components/campaign-forms';
import { pageApi as api } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Gerenciar campanha' };

export default async function ManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverToken();
  const campaign = await api<CampaignDto>(`/campaigns/${id}`, token);
  const manager = canManageCampaign(campaign.myRole);
  const [members, invitations, me] = await Promise.all([
    api<CampaignMemberDto[]>(`/campaigns/${id}/members`, token),
    manager ? api<InvitationDto[]>(`/campaigns/${id}/invitations`, token) : Promise.resolve([]),
    api<MeDto>('/me', token),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-6">
        {campaign.description && <p className="whitespace-pre-line text-ink-muted">{campaign.description}</p>}
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
  );
}
