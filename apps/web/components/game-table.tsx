'use client';

import type { CampaignRole, ChatMessageDto, MapDto, MapSummaryDto, NpcDto, TokenDto } from '@rpg-ai/shared';
import { canManageCampaign } from '@rpg-ai/shared';
import { Alert, Badge, Button, cn, Select } from '@rpg-ai/ui';
import { Minus, Plus, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, json } from '@/lib/api';
import { useCampaignRealtime } from '@/lib/realtime';
import { accessToken } from '@/lib/supabase';
import { ChatPanel } from './chat-panel';
import { MapCanvas } from './map-canvas';

export function GameTable({
  campaignId,
  myId,
  myRole,
  initialMessages,
  initialMaps,
  initialNpcs,
}: {
  campaignId: string;
  myId: string;
  myRole: CampaignRole;
  initialMessages: ChatMessageDto[];
  initialMaps: MapSummaryDto[];
  initialNpcs: NpcDto[];
}) {
  const manager = canManageCampaign(myRole);
  const [messages, setMessages] = useState(initialMessages);
  const [maps, setMaps] = useState(initialMaps);
  const [npcs, setNpcs] = useState(initialNpcs);
  const [mapId, setMapId] = useState<string | null>(
    initialMaps.find((m) => m.shared)?.id ?? initialMaps[0]?.id ?? null,
  );
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
        <div className="flex flex-wrap items-center gap-2">
          {visibleMaps.length > 0 ? (
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
              {status === 'online' ? 'Ao vivo' : status === 'connecting' ? 'Conectando…' : 'Desconectado'}
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
      <div className="xl:sticky xl:top-20 xl:h-[calc(100dvh-7rem)]">
        <ChatPanel
          campaignId={campaignId}
          messages={messages}
          myId={myId}
          canPlay={myRole !== 'spectator'}
          isManager={manager}
          npcs={npcs}
          onSent={addMessage}
        />
      </div>
    </div>
  );
}
