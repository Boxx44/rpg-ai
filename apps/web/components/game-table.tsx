'use client';

import type {
  CampaignRole,
  CampaignSystemDto,
  CharacterDto,
  ChatMessageDto,
  MapDto,
  MapSummaryDto,
  NpcDto,
  SessionDto,
  SessionStartedEvent,
  TokenDto,
} from '@rpg-ai/shared';
import { canManageCampaign } from '@rpg-ai/shared';
import { Alert, Badge, Button, cn, Select } from '@rpg-ai/ui';
import { Map as MapIcon, Minus, Plus, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, json } from '@/lib/api';
import { useCampaignRealtime } from '@/lib/realtime';
import { accessToken } from '@/lib/supabase';
import { ChatPanel } from './chat-panel';
import { MapCanvas } from './map-canvas';
import { SessionBar } from './session-bar';
import { QuickSheetPanel, RulesPanel } from './table-panels';

export function GameTable({
  campaignId,
  myId,
  myRole,
  initialMessages,
  initialMaps,
  initialNpcs,
  initialCharacters,
  system,
  initialLive,
}: {
  campaignId: string;
  myId: string;
  myRole: CampaignRole;
  initialMessages: ChatMessageDto[];
  initialMaps: MapSummaryDto[];
  initialNpcs: NpcDto[];
  initialCharacters: CharacterDto[];
  system: CampaignSystemDto | null;
  initialLive: SessionDto | null;
}) {
  const [live, setLive] = useState<SessionDto | null>(initialLive);
  const [tab, setTab] = useState<'chat' | 'sheet' | 'rules'>('chat');
  const [characters, setCharacters] = useState(initialCharacters);
  const manager = canManageCampaign(myRole);
  const [messages, setMessages] = useState(initialMessages);
  const [maps, setMaps] = useState(initialMaps);
  const [npcs, setNpcs] = useState(initialNpcs);
  const [mapId, setMapId] = useState<string | null>(
    initialLive?.activeMapId ?? initialMaps.find((m) => m.shared)?.id ?? initialMaps[0]?.id ?? null,
  );
  /** Durante a sessão ao vivo, o mestre escolhe o mapa que todos veem. */
  const followsScene = !manager && !!live?.activeMapId;
  const [map, setMap] = useState<MapDto | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string>();

  const addMessage = useCallback((m: ChatMessageDto) => {
    setMessages((prev) =>
      prev.some((x) => x.id === m.id) ? prev : [...prev, m].sort((a, b) => a.id - b.id).slice(-300),
    );
  }, []);

  const loadMap = useCallback(
    async (id: string | null) => {
      if (!id) return setMap(null);
      try {
        setMap(await api<MapDto>(`/campaigns/${campaignId}/maps/${id}`, await accessToken()));
      } catch {
        setMap(null);
      }
    },
    [campaignId],
  );

  const loadMaps = useCallback(async () => {
    const list = await api<MapSummaryDto[]>(`/campaigns/${campaignId}/maps`, await accessToken());
    setMaps(list);
    setMapId((cur) =>
      cur && list.some((m) => m.id === cur) ? cur : (list.find((m) => m.shared)?.id ?? list[0]?.id ?? null),
    );
    return list;
  }, [campaignId]);

  const loadNpcs = useCallback(async () => {
    setNpcs(await api<NpcDto[]>(`/campaigns/${campaignId}/npcs`, await accessToken()));
  }, [campaignId]);

  // Recupera o que chegou enquanto a conexão esteve fora.
  const resync = useCallback(async () => {
    const last = messages.at(-1)?.id ?? 0;
    const token = await accessToken();
    const missed = await api<ChatMessageDto[]>(
      `/campaigns/${campaignId}/messages?after=${last}&limit=100`,
      token,
    );
    missed.forEach(addMessage);
    await loadMaps();
    await loadMap(mapId);
  }, [messages, campaignId, addMessage, loadMaps, loadMap, mapId]);

  useEffect(() => {
    void loadMap(mapId);
  }, [mapId, loadMap]);

  const status = useCampaignRealtime(
    campaignId,
    {
      'chat.message': (m: ChatMessageDto) => addMessage(m),
      'token.moved': (p: { mapId: string; tokenId: string; x: number; y: number }) =>
        setMap((cur) =>
          cur && cur.id === p.mapId
            ? { ...cur, tokens: cur.tokens.map((t) => (t.id === p.tokenId ? { ...t, x: p.x, y: p.y } : t)) }
            : cur,
        ),
      'maps.changed': (p: { mapId: string }) => {
        void loadMaps();
        if (p.mapId === mapId) void loadMap(mapId);
      },
      'npcs.changed': () => void loadNpcs(),
      'session.started': (e: SessionStartedEvent) => {
        if (e.campaignId !== campaignId) return;
        setLive(e.session);
        setMessages([]);
      },
      'session.ended': () => setLive(null),
      'scene.changed': (p: { sessionId: string; mapId: string | null }) => {
        setLive((l) => (l && l.id === p.sessionId ? { ...l, activeMapId: p.mapId } : l));
        if (p.mapId) {
          void loadMaps();
          setMapId(p.mapId);
        }
      },
      'characters.changed': () =>
        void accessToken()
          .then((t) => api<CharacterDto[]>(`/campaigns/${campaignId}/characters`, t))
          .then(setCharacters),
    },
    resync,
  );

  const canMove = (t: TokenDto) =>
    myRole !== 'spectator' && (manager || (t.controlledBy === myId && !t.hidden));

  async function onMove(t: TokenDto, x: number, y: number) {
    setError(undefined);
    setMap((cur) =>
      cur ? { ...cur, tokens: cur.tokens.map((k) => (k.id === t.id ? { ...k, x, y } : k)) } : cur,
    );
    try {
      await api(`/campaigns/${campaignId}/maps/${t.mapId}/tokens/${t.id}/move`, await accessToken(), {
        method: 'POST',
        body: json({ x, y }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível mover');
      void loadMap(t.mapId);
    }
  }

  const visibleMaps = maps;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
      <section className="min-w-0 space-y-3" aria-label="Mapa">
        <SessionBar
          campaignId={campaignId}
          manager={manager}
          live={live}
          maps={maps}
          onStarted={(sess) => {
            setLive(sess);
            setMessages([]);
          }}
          onEnded={() => setLive(null)}
          onScene={(id) => {
            setLive((l) => (l ? { ...l, activeMapId: id } : l));
            if (id) setMapId(id);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {followsScene ? (
            <span className="inline-flex items-center gap-2 text-sm text-ink-muted" data-testid="scene-name">
              <MapIcon className="size-4 text-gold" /> {map?.name ?? 'Carregando mapa…'}
              <span className="text-xs text-ink-faint">· escolhido pelo mestre</span>
            </span>
          ) : visibleMaps.length > 0 ? (
            <Select
              value={mapId ?? ''}
              onChange={(e) => setMapId(e.target.value)}
              aria-label="Mapa em exibição"
              className="h-9 w-64"
            >
              {visibleMaps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {!m.shared ? ' (só o mestre vê)' : ''}
                </option>
              ))}
            </Select>
          ) : null}
          {map && !map.shared && <Badge tone="gold">Oculto dos jogadores</Badge>}
          <div className="ml-auto flex items-center gap-1">
            <span
              className={cn(
                'mr-2 inline-flex items-center gap-1 text-xs',
                status === 'online' ? 'text-emerald-300' : 'text-ink-faint',
              )}
              data-testid="rt-status"
              data-status={status}
            >
              {status === 'online' ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              {status === 'online' ? 'Conectado' : status === 'connecting' ? 'Conectando…' : 'Desconectado'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Diminuir zoom"
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}
            >
              <Minus />
            </Button>
            <span className="w-10 text-center text-xs text-ink-muted">{Math.round(zoom * 100)}%</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Aumentar zoom"
              onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1)))}
            >
              <Plus />
            </Button>
          </div>
        </div>
        {map ? (
          <MapCanvas map={map} zoom={zoom} canMove={canMove} onMove={onMove} className="max-h-[70vh]" />
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line p-8 text-center">
            <p className="font-display text-lg">Nenhum mapa na mesa</p>
            <p className="max-w-sm text-sm text-ink-muted">
              {manager
                ? 'Crie um mapa e compartilhe com os jogadores.'
                : 'O mestre ainda não compartilhou um mapa.'}
            </p>
            {manager && (
              <Button asChild variant="outline">
                <Link href={`/campaigns/${campaignId}/maps`}>Criar mapa</Link>
              </Button>
            )}
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {map && (
          <p className="text-xs text-ink-faint">
            Cada quadrado = {map.cellLabel}.{' '}
            {manager ? 'Arraste qualquer token.' : 'Arraste o token do seu personagem.'}
          </p>
        )}
      </section>
      <div className="flex flex-col gap-2 xl:sticky xl:top-20 xl:h-[calc(100dvh-7rem)]">
        <div
          className="flex gap-1 rounded-lg border border-line bg-surface/80 p-1"
          role="tablist"
          aria-label="Painel lateral"
        >
          {(
            [
              ['chat', 'Crônica'],
              ['sheet', 'Ficha'],
              ['rules', 'Regras'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors',
                tab === k ? 'bg-arcane-700/60 text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={cn('min-h-0 flex-1', tab !== 'chat' && 'hidden')}>
          <ChatPanel
            campaignId={campaignId}
            messages={live ? messages.filter((m) => m.sessionId === live.id) : messages}
            myId={myId}
            canPlay={myRole !== 'spectator'}
            isManager={manager}
            npcs={npcs}
            onSent={addMessage}
          />
        </div>
        {tab !== 'chat' && (
          <section className="min-h-[420px] flex-1 overflow-hidden rounded-xl border border-line bg-surface/80">
            {tab === 'sheet' ? (
              <QuickSheetPanel
                campaignId={campaignId}
                system={system}
                characters={characters}
                myId={myId}
                manager={manager}
                onUpdated={(c) => setCharacters((list) => list.map((x) => (x.id === c.id ? c : x)))}
              />
            ) : (
              <RulesPanel campaignId={campaignId} system={system} manager={manager} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
