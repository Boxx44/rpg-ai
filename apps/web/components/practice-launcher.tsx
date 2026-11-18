'use client';

import type { CampaignDto } from '@rpg-ai/shared';
import { Alert, Button, Card } from '@rpg-ai/ui';
import { Castle, Eye, FlaskConical, RotateCcw, ScrollText, Sparkles, Swords } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { accessToken } from '@/lib/supabase';

const ITEMS = [
  {
    icon: ScrollText,
    text: 'Dois agentes de exemplo (combatente e ocultista) já com armas, proteção e rituais.',
  },
  { icon: Swords, text: 'Um NPC cultista com ficha completa e criaturas do livro para o combate.' },
  { icon: Castle, text: 'Um mapa pronto, compartilhado, com peças para mover.' },
  { icon: Sparkles, text: 'Atacar, conjurar, interlúdio, condições, sessões ao vivo — tudo liberado.' },
  { icon: Eye, text: 'Botão "Ver como jogador" na mesa, para conferir o que os jogadores enxergam.' },
];

/** Mesa de treino: campanha particular para testar tudo sozinho, sem afetar campanhas reais. */
export function PracticeLauncher({ sandbox }: { sandbox: CampaignDto | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'open' | 'reset' | null>(null);
  const [error, setError] = useState<string>();

  async function open() {
    setBusy('open');
    setError(undefined);
    try {
      const r = await api<{ id: string }>('/sandbox', await accessToken(), { method: 'POST' });
      router.push(`/campaigns/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      setBusy(null);
    }
  }
  async function reset() {
    if (!confirm('Apagar a mesa de treino atual e começar uma nova, limpa?')) return;
    setBusy('reset');
    setError(undefined);
    try {
      await api('/sandbox', await accessToken(), { method: 'DELETE' });
      await open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold/70">Laboratório</p>
        <h1 className="flex items-center gap-3 font-display text-4xl tracking-wide">
          <FlaskConical className="size-8 text-gold" /> Mesa de treino
        </h1>
        <p className="mt-2 text-ink-muted">
          Uma campanha só sua, pronta para experimentar todas as funções antes de jogar com o grupo. Você é o
          mestre e o dono dos personagens de exemplo, então dá para testar os dois lados.
        </p>
      </div>
      <Card className="p-6">
        <ul className="space-y-3">
          {ITEMS.map((i) => (
            <li key={i.text} className="flex items-start gap-3 text-sm">
              <i.icon className="mt-0.5 size-4 shrink-0 text-arcane-300" /> {i.text}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={open}
            loading={busy === 'open'}
            disabled={!!busy}
            data-testid="practice-open"
          >
            {sandbox ? 'Abrir mesa de treino' : 'Criar mesa de treino'}
          </Button>
          {sandbox && (
            <Button
              size="lg"
              variant="secondary"
              onClick={reset}
              loading={busy === 'reset'}
              disabled={!!busy}
            >
              <RotateCcw /> Recomeçar do zero
            </Button>
          )}
        </div>
        {error && (
          <Alert tone="error" className="mt-4">
            {error}
          </Alert>
        )}
      </Card>
    </div>
  );
}
