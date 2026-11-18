import type { CampaignDto } from '@rpg-ai/shared';
import { PracticeLauncher } from '@/components/practice-launcher';
import { pageApi as api } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Mesa de treino' };

export default async function PracticePage() {
  const campaigns = await api<CampaignDto[]>('/campaigns', await serverToken());
  const sandbox = campaigns.find((c) => c.sandbox) ?? null;
  return <PracticeLauncher sandbox={sandbox} />;
}
