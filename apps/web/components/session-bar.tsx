'use client';

import type { MapSummaryDto, SessionDto } from '@rpg-ai/shared';
import { Alert, Button, Input, Select, Textarea } from '@rpg-ai/ui';
import { Play, Square } from 'lucide-react';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';

/**
 * Faixa da sessão no topo da mesa.
 * Mestre: iniciar sessão, escolher o mapa que todos veem (cena) e encerrar com resumo.
 * Jogadores: veem se a sessão está ao vivo ou se estão aguardando o mestre.
 */
export function SessionBar({
  campaignId,
  manager,
  live,
  maps,
  onStarted,
  onEnded,
  onScene,
}: {
  campaignId: string;
  manager: boolean;
  live: SessionDto | null;
  maps: MapSummaryDto[];
  onStarted: (s: SessionDto) => void;
  onEnded: () => void;
  onScene: (mapId: string | null) => void;
}) {
  const [title, setTitle] = useState('');
  const [ending, setEnding] = useState(false);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function call<T>(fn: (t: string) => Promise<T>) {
    setBusy(true);
    setError(undefined);
    try {
      return await fn(await accessToken());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  if (!live) {
    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/80 px-4 py-3"
        data-testid="session-bar"
        data-live="false"
      >
        <span className="size-2.5 rounded-full bg-ink-faint" />
        <p className="flex-1 text-sm text-ink-muted">
          {manager
            ? 'Nenhuma sessão ao vivo. Prepare a mesa e inicie quando o grupo estiver pronto.'
            : 'Aguardando o mestre iniciar a sessão.'}
        </p>
        {manager && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const s = await call((t) =>
                api<SessionDto>(`/campaigns/${campaignId}/sessions`, t, {
                  method: 'POST',
                  body: json({ title }),
                }),
              );
              if (s) {
                setTitle('');
                onStarted(s);
              }
            }}
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da sessão (opcional)"
              aria-label="Título da sessão"
              maxLength={120}
              className="h-9 w-56"
            />
            <Button type="submit" loading={busy}>
              <Play /> Iniciar sessão
            </Button>
          </form>
        )}
        {error && (
          <Alert tone="error" className="w-full">
            {error}
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-blood/40 bg-gradient-to-r from-blood/10 via-surface/80 to-surface/80 px-4 py-3"
      data-testid="session-bar"
      data-live="true"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-blood opacity-70" />
          <span className="relative inline-flex size-2.5 rounded-full bg-blood" />
        </span>
        <p className="font-display tracking-wide" data-testid="session-title">
          Sessão {live.number} ao vivo{live.title ? ` · ${live.title}` : ''}
        </p>
        {manager && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              aria-label="Mapa para todos"
              value={live.activeMapId ?? ''}
              disabled={busy}
              className="h-9 w-56"
              onChange={async (e) => {
                const mapId = e.target.value || null;
                const s = await call((t) =>
                  api<SessionDto>(`/campaigns/${campaignId}/sessions/${live.id}/scene`, t, {
                    method: 'POST',
                    body: json({ mapId }),
                  }),
                );
                if (s) onScene(s.activeMapId);
              }}
            >
              <option value="">Mapa para todos: nenhum</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  Mostrar a todos: {m.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => setEnding((v) => !v)}>
              <Square /> Encerrar
            </Button>
          </div>
        )}
      </div>
      {manager && ending && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const s = await call((t) =>
              api<SessionDto>(`/campaigns/${campaignId}/sessions/${live.id}/end`, t, {
                method: 'POST',
                body: json({ summary }),
              }),
            );
            if (s) {
              setEnding(false);
              setSummary('');
              onEnded();
            }
          }}
        >
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Resumo da sessão: o que aconteceu, ganchos para a próxima… (opcional)"
            aria-label="Resumo da sessão"
            maxLength={8000}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEnding(false)}>
              Continuar jogando
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Encerrar sessão
            </Button>
          </div>
        </form>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
