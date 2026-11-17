import { type SystemDefinition, SYSTEM_TEMPLATES } from '@rpg-ai/rules-engine';
import type { SystemDto } from '@rpg-ai/shared';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { SystemBookManager } from '@/components/system-panels';
import { pageApi } from '@/lib/page-api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Sistema de regras' };

export default async function SystemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const system = await pageApi<SystemDto>(`/systems/${id}`, await serverToken());
  const definition: SystemDefinition | null = system.templateId
    ? (SYSTEM_TEMPLATES[system.templateId] ?? null)
    : null;
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" /> Campanhas
      </Link>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold/80">Sistema de regras</p>
        <h1 className="font-display text-3xl tracking-wide">{system.name}</h1>
      </div>
      <SystemBookManager system={system} definition={definition} />
    </div>
  );
}
