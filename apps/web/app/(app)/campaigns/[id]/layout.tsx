import { type CampaignDto, canManageCampaign, GM_MODE_LABELS, ROLE_LABELS } from '@rpg-ai/shared';
import { Badge } from '@rpg-ai/ui';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CampaignTabs } from '@/components/campaign-tabs';
import { api, ApiError } from '@/lib/api';
import { serverToken } from '@/lib/supabase-server';

export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let campaign: CampaignDto;
  try {
    campaign = await api<CampaignDto>(`/campaigns/${id}`, await serverToken());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" /> Campanhas
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-2xl tracking-wide sm:text-3xl" data-testid="campaign-title">
            {campaign.name}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Badge tone="gold">{ROLE_LABELS[campaign.myRole]}</Badge>
            <Badge tone="arcane">{GM_MODE_LABELS[campaign.gmMode]}</Badge>
            {campaign.status === 'archived' && <Badge>Arquivada</Badge>}
          </div>
        </div>
        <CampaignTabs
          campaignId={id}
          manager={canManageCampaign(campaign.myRole)}
          live={!!campaign.liveSession}
        />
      </div>
      {children}
    </div>
  );
}
