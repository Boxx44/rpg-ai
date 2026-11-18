import type { CampaignDto, LibrarySheetDto } from '@rpg-ai/shared';
import { LibraryBoard } from '@/components/library-board';
import { pageApi as api } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Fichas' };

export default async function LibraryPage() {
  const token = await serverToken();
  const [sheets, campaigns] = await Promise.all([
    api<LibrarySheetDto[]>('/library', token),
    api<CampaignDto[]>('/campaigns', token),
  ]);
  return <LibraryBoard sheets={sheets} campaigns={campaigns} />;
}
