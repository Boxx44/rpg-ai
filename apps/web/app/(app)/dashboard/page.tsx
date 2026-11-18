import { type CampaignDto, GM_MODE_LABELS, ROLE_LABELS } from '@rpg-ai/shared';
import { Badge, Button, Card, Ornament } from '@rpg-ai/ui';
import { Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { Sigil } from '@/components/brand';
import { api } from '@/lib/api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Campanhas' };

export default async function DashboardPage() {
  const campaigns = await api<CampaignDto[]>('/campaigns', await serverToken());
  const active = campaigns.filter((c) => c.status === 'active');
  const archived = campaigns.filter((c) => c.status === 'archived');

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold/80">Seu salão</p>
          <h1 className="font-display text-3xl tracking-wide sm:text-4xl">Campanhas</h1>
        </div>
        <Button asChild size="lg">
          <Link href="/campaigns/new">
            <Plus /> Nova campanha
          </Link>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <Card className="flex flex-col items-center gap-5 px-6 py-16 text-center animate-rise">
          <Sigil size={56} className="opacity-80" />
          <div className="space-y-2">
            <h2 className="font-display text-xl">Nenhuma campanha ainda</h2>
            <p className="max-w-md text-sm text-ink-muted">
              Crie sua primeira campanha e convide seus jogadores. Se alguém te mandou um convite, abra o link
              que você recebeu.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/campaigns/new">Criar a primeira campanha</Link>
          </Button>
        </Card>
      ) : (
        <CampaignGrid campaigns={active} />
      )}

      {archived.length > 0 && (
        <section className="space-y-4">
          <Ornament />
          <h2 className="font-display text-lg text-ink-muted">Arquivadas</h2>
          <CampaignGrid campaigns={archived} muted />
        </section>
      )}
    </div>
  );
}

function CampaignGrid({ campaigns, muted }: { campaigns: CampaignDto[]; muted?: boolean }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {campaigns.map((c, i) => (
        <li key={c.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
          <Link
            href={`/campaigns/${c.id}`}
            data-testid="campaign-card"
            className={`group relative block h-full overflow-hidden rounded-xl border border-line bg-surface/80 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-arcane-500/50 hover:shadow-[0_20px_50px_-25px_rgba(124,79,240,0.6)] ${muted ? 'opacity-70' : ''}`}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="font-display text-lg leading-snug tracking-wide text-ink">{c.name}</h3>
              <Badge tone={c.myRole === 'owner' || c.myRole === 'gm' ? 'gold' : 'neutral'}>
                {ROLE_LABELS[c.myRole]}
              </Badge>
            </div>
            {c.liveSession && (
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-blood/50 bg-blood/15 px-2.5 py-1 text-xs font-semibold text-blood-light" data-testid="card-live">
                <span className="size-2 animate-pulse rounded-full bg-blood" /> Sessão {c.liveSession.number} ao vivo — entrar na mesa
              </p>
            )}
            <p className="mb-6 line-clamp-2 min-h-10 text-sm text-ink-muted">
              {c.description || 'Sem descrição.'}
            </p>
            <div className="flex items-center justify-between text-xs text-ink-faint">
              <span>{GM_MODE_LABELS[c.gmMode]}</span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> {c.memberCount}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
