'use client';

import type { ChatMessageDto, SessionDto } from '@rpg-ai/shared';
import { Alert, Badge, Button, Card, Textarea } from '@rpg-ai/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';

function fmt(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SessionCard({ s, campaignId, manager }: { s: SessionDto; campaignId: string; manager: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageDto[] | null>(null);
  const [summary, setSummary] = useState(s.summary);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    setOpen((o) => !o);
    if (!messages) {
      try {
        setMessages(await api<ChatMessageDto[]>(`/campaigns/${campaignId}/messages?session=${s.id}&limit=100`, await accessToken()));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro');
      }
    }
  }

  return (
    <Card className="p-5" data-testid="session-card">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-2xl text-gold-bright">#{s.number}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display tracking-wide">{s.title || `Sessão ${s.number}`}</p>
          <p className="text-xs text-ink-faint">
            {fmt(s.startedAt)}
            {s.endedAt ? ` → ${fmt(s.endedAt)}` : ''} · {s.messageCount} mensagens
          </p>
        </div>
        {s.status === 'live' ? (
          <Button asChild size="sm">
            <Link href={`/campaigns/${campaignId}`}>Ao vivo — entrar</Link>
          </Button>
        ) : (
          <Badge>Encerrada</Badge>
        )}
        <Button size="sm" variant="ghost" onClick={toggle} aria-expanded={open}>
          {open ? <ChevronUp /> : <ChevronDown />} Crônica
        </Button>
      </div>
      {(s.summary || manager) && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">Resumo</p>
          {manager ? (
            <>
              <Textarea value={summary} onChange={(e) => { setSummary(e.target.value); setSaved(false); }} placeholder="Escreva o que aconteceu nesta sessão…" maxLength={8000} aria-label={`Resumo da sessão ${s.number}`} />
              <div className="flex items-center justify-end gap-3">
                {saved && <span className="text-xs text-emerald-300">Salvo</span>}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await api(`/campaigns/${campaignId}/sessions/${s.id}`, await accessToken(), { method: 'PATCH', body: json({ summary }) });
                      setSaved(true);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Erro');
                    }
                  }}
                >
                  Salvar resumo
                </Button>
              </div>
            </>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-ink">{s.summary}</p>
          )}
        </div>
      )}
      {open && (
        <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto rounded-lg border border-line bg-bg/40 p-3 text-sm" data-testid="session-chronicle">
          {messages === null && <li className="text-ink-faint">Carregando…</li>}
          {messages?.length === 0 && <li className="text-ink-faint">Nada foi registrado nesta sessão.</li>}
          {messages?.map((m) => (
            <li key={m.id}>
              <b className="text-arcane-200">{m.npc?.name ?? m.author.displayName}:</b>{' '}
              {m.roll ? (
                <span>
                  {m.roll.label || 'rolagem'} ({m.roll.expression}) = <b className="text-gold-bright">{m.roll.total}</b>
                </span>
              ) : (
                <span className="text-ink">{m.content}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
    </Card>
  );
}

export function SessionsHistory({ campaignId, sessions, manager }: { campaignId: string; sessions: SessionDto[]; manager: boolean }) {
  if (!sessions.length)
    return (
      <Card className="p-10 text-center text-sm text-ink-muted">
        Nenhuma sessão jogada ainda. {manager ? 'Vá até a Mesa e clique em "Iniciar sessão".' : 'Quando o mestre iniciar, você recebe um aviso.'}
      </Card>
    );
  return (
    <div className="space-y-4">
      {sessions.map((s) => (
        <SessionCard key={s.id} s={s} campaignId={campaignId} manager={manager} />
      ))}
    </div>
  );
}
