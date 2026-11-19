'use client';

import type {
  CampaignRole,
  CampaignSystemDto,
  CharacterDto,
  ChatMessageDto,
  EncounterDto,
  MapDto,
  MapSummaryDto,
  NpcDto,
  SessionDto,
  SessionStartedEvent,
  TokenDto,
} from '@rpg-ai/shared';
import { canManageCampaign } from '@rpg-ai/shared';
import { Alert, Badge, Button, cn, Select } from '@rpg-ai/ui';
import {
  BookOpen,
  Eye,
  IdCard,
  Map as MapIcon,
  Minus,
  Plus,
  ScrollText,
  Swords,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, json } from '@/lib/api';
import { useCampaignRealtime } from '@/lib/realtime';
import { accessToken } from '@/lib/supabase';
import { ChatPanel } from './chat-panel';
import { CombatIntro, InitiativeBar, useCombatImages } from './combat-stage';
import { DiceTray, rollOutcome } from './dice-tray';
import { MapCanvas, type TokenDecoration } from './map-canvas';
import { dismissToast, playSound, toast } from '@/lib/feedback';
import { uploadAsset, usePasteImage } from '@/lib/assets';
import { CombatBanner, CombatPanel } from './combat-panel';
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
  initialCombat,
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
  initialCombat: EncounterDto | null;
}) {
  const [combat, setCombat] = useState<EncounterDto | null>(initialCombat);
  const [live, setLive] = useState<SessionDto | null>(initialLive);
  const [tab, setTab] = useState<'chat' | 'combat' | 'sheet' | 'rules'>('chat');
  const [pageReq, setPageReq] = useState<{ page: number; nonce: number } | null>(null);
  const openBookPage = useCallback((page: number) => {
    setTab('rules');
    setPageReq({ page, nonce: Date.now() });
  }, []);
  const [characters, setCharacters] = useState(initialCharacters);
  const realManager = canManageCampaign(myRole);
  /**
   * "Ver como jogador": pré-visualização só para o mestre conferir o que os jogadores
   * enxergam. É um filtro na tela do próprio mestre (que já tem esses dados); o sigilo
   * real continua no servidor.
   */
  const [asPlayer, setAsPlayer] = useState(false);
  const manager = realManager && !asPlayer;
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
  /** No celular a mesa mostra uma coisa por vez: o mapa ou o painel (crônica, combate, ficha, regras). */
  const [view, setView] = useState<'map' | 'panel'>('map');
  const [unread, setUnread] = useState(0);
  const viewingChat = useRef(false);
  const [error, setError] = useState<string>();

  /** Rolagem em destaque na bandeja de dados (só as que chegam agora, não o histórico). */
  const [diceMsg, setDiceMsg] = useState<ChatMessageDto | null>(null);
  const lastRolled = useRef(initialMessages.at(-1)?.id ?? 0);
  const closeDice = useCallback(() => setDiceMsg(null), []);
  const addMessage = useCallback((m: ChatMessageDto) => {
    if (m.kind === 'roll' && m.roll && m.id > lastRolled.current) {
      lastRolled.current = m.id;
      setDiceMsg(m);
      playSound('dice');
      const out = rollOutcome(m.roll);
      if (out) setTimeout(() => playSound(out === 'crit' ? 'crit' : 'fail'), 750);
    } else if (m.id > lastRolled.current) lastRolled.current = m.id;
    if (!viewingChat.current) setUnread((n) => Math.min(99, n + 1));
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

  const loadCombat = useCallback(async () => {
    try {
      setCombat(await api<EncounterDto | null>(`/campaigns/${campaignId}/combat`, await accessToken()));
    } catch {
      /* a próxima atualização tenta de novo */
    }
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
    await loadCombat();
  }, [messages, campaignId, addMessage, loadMaps, loadMap, mapId, loadCombat]);

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
      'npcs.changed': () => {
        void loadNpcs();
        void loadMap(mapId); // retrato do NPC pode ter mudado no token
      },
      'prop.toggled': (p: {
        mapId: string;
        tokenId: string;
        state: TokenDto['state'];
        label: string;
        by: string;
      }) => {
        setMap((cur) =>
          cur && cur.id === p.mapId
            ? { ...cur, tokens: cur.tokens.map((t) => (t.id === p.tokenId ? { ...t, state: p.state } : t)) }
            : cur,
        );
        if (p.by !== myId) playSound(p.state === 'on' || p.state === 'off' ? 'fire' : 'door');
      },
      'session.started': (e: SessionStartedEvent) => {
        if (e.campaignId !== campaignId) return;
        setLive(e.session);
        setMessages([]);
        playSound('notify');
        toast('A sessão começou!', {
          body: `Sessão ${e.session.number}${e.session.title ? ` — ${e.session.title}` : ''}`,
          tone: 'arcane',
        });
      },
      'session.ended': () => setLive(null),
      'combat.changed': () => void loadCombat(),
      'scene.changed': (p: { sessionId: string; mapId: string | null }) => {
        setLive((l) => (l && l.id === p.sessionId ? { ...l, activeMapId: p.mapId } : l));
        if (p.mapId) {
          void loadMaps();
          setMapId(p.mapId);
        }
      },
      'characters.changed': () => {
        void accessToken()
          .then((t) => api<CharacterDto[]>(`/campaigns/${campaignId}/characters`, t))
          .then(setCharacters);
        void loadMap(mapId); // retrato novo aparece no token
        if (combat) void loadCombat();
      },
    },
    resync,
  );

  const canMove = (t: TokenDto) =>
    myRole !== 'spectator' && (manager || (t.controlledBy === myId && !t.hidden));

  /** Abrir/fechar porta, acender/apagar tocha… (o servidor decide se pode). */
  async function onUseProp(t: TokenDto) {
    if (myRole === 'spectator') return;
    setError(undefined);
    const before = t.state;
    const flip = { open: 'closed', closed: 'open', on: 'off', off: 'on' } as const;
    const next = before ? flip[before] : null;
    setMap((cur) =>
      cur ? { ...cur, tokens: cur.tokens.map((k) => (k.id === t.id ? { ...k, state: next } : k)) } : cur,
    );
    playSound(before === 'on' || before === 'off' ? 'fire' : 'door');
    try {
      await api(`/campaigns/${campaignId}/maps/${t.mapId}/tokens/${t.id}/toggle`, await accessToken(), {
        method: 'POST',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível usar o objeto');
      void loadMap(t.mapId);
    }
  }

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

  const visibleMaps = asPlayer ? maps.filter((m) => m.shared) : maps;
  const shownMap = asPlayer
    ? map && maps.find((m) => m.id === map.id)?.shared
      ? { ...map, tokens: map.tokens.filter((t) => !t.hidden) }
      : null
    : map;
  const myChars = new Set(characters.filter((c) => c.ownerId === myId).map((c) => c.id));
  const shownCombat: EncounterDto | null =
    asPlayer && combat
      ? (() => {
          const list = combat.combatants
            .filter((c) => !c.hidden)
            .map((c) => ({
              ...c,
              hp: c.kind === 'character' ? c.hp : null,
              creature: null,
              npcSheet: null,
              mine: !!c.characterId && myChars.has(c.characterId),
            }));
          const visible = list.some((c) => c.id === combat.currentId);
          return {
            ...combat,
            combatants: list,
            currentId: visible ? combat.currentId : null,
            hiddenTurn: !!combat.currentId && !visible,
          };
        })()
      : combat;
  const shownMessages = (live ? messages.filter((m) => m.sessionId === live.id) : messages).filter(
    (m) => !asPlayer || m.visibility !== 'gm',
  );
  const shownNpcs = asPlayer ? npcs.filter((n) => n.revealed).map(({ details: _d, ...n }) => n) : npcs;
  /** Vida, vez do turno e condições desenhadas nas peças do mapa. */
  const decorations = useMemo(() => {
    const out: Record<string, TokenDecoration> = {};
    if (!shownCombat || !shownMap) return out;
    for (const t of shownMap.tokens) {
      const c = shownCombat.combatants.find((x) =>
        t.characterId
          ? x.characterId === t.characterId
          : t.npcId
            ? x.npcId === t.npcId
            : x.kind === 'enemy' && x.name === t.label,
      );
      if (!c) continue;
      out[t.id] = {
        hp: c.hp ?? undefined,
        health: c.defeated ? 'down' : c.health,
        turn: shownCombat.currentId === c.id,
        conditions: c.conditions.length,
      };
    }
    return out;
  }, [shownCombat, shownMap]);

  // Imagens dos combatentes (retrato ou imagem do token de mesmo nome).
  const tokenImages = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const t of shownMap?.tokens ?? []) if (t.image && !(t.label in out)) out[t.label] = t.image;
    return out;
  }, [shownMap]);
  const combatImages = useCombatImages(campaignId, shownCombat, tokenImages);
  const [banner, setBanner] = useState<EncounterDto | null>(null);
  const closeBanner = useCallback(() => setBanner(null), []);
  const [focusToken, setFocusToken] = useState<string | null>(null);

  // Entrada em combate: faixa "Combate!", som e a aba Combate abre sozinha.
  // Depois disso, avisa quem entrou e quando o combate termina.
  const prevCombat = useRef<{ id: string | null; ids: Set<string> }>({
    id: shownCombat?.id ?? null,
    ids: new Set(shownCombat?.combatants.map((c) => c.id) ?? []),
  });
  useEffect(() => {
    const prev = prevCombat.current;
    const cur = shownCombat;
    prevCombat.current = { id: cur?.id ?? null, ids: new Set(cur?.combatants.map((c) => c.id) ?? []) };
    if (cur && cur.id !== prev.id) {
      setBanner(cur);
      setTab('combat');
      playSound('combat');
      return;
    }
    if (!cur && prev.id) {
      toast('Combate encerrado', { tone: 'success' });
      setFocusToken(null);
      return;
    }
    if (cur) {
      const joined = cur.combatants.filter((c) => !prev.ids.has(c.id));
      if (joined.length) {
        playSound('hit');
        toast(
          joined.length === 1
            ? `${joined[0]!.name} entrou no combate`
            : `${joined.length} entraram no combate`,
          { body: joined.length > 1 ? joined.map((c) => c.name).join(', ') : undefined, tone: 'danger' },
        );
      }
    }
  }, [shownCombat]);

  // Aviso "É a sua vez!" quando o turno chega num combatente seu.
  const lastTurn = useRef(shownCombat?.currentId ?? null);
  useEffect(() => {
    const cur = shownCombat?.currentId ?? null;
    if (cur === lastTurn.current) return;
    lastTurn.current = cur;
    const c = shownCombat?.combatants.find((x) => x.id === cur);
    if (c?.mine && !manager) {
      playSound('turn');
      toast('É a sua vez!', { body: `${c.name} age agora.`, tone: 'gold' });
    } else if (c) playSound('click');
  }, [shownCombat, manager]);

  // Mensagens não lidas: zera quando a crônica está à vista.
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1280px)').matches;
    viewingChat.current = tab === 'chat' && (view === 'panel' || !!isDesktop);
    if (viewingChat.current) setUnread(0);
  }, [tab, view]);
  const myTurn = !!shownCombat?.combatants.find((c) => c.id === shownCombat.currentId)?.mine && !manager;

  /** De quem é o personagem deste token (para o jogador pôr o próprio retrato). */
  const ownCharacter = (t: TokenDto | null) =>
    t?.characterId ? characters.find((c) => c.id === t.characterId && c.ownerId === myId) : undefined;

  /**
   * Imagem solta no mapa ou colada (Ctrl+V).
   * Mestre: sobre uma peça = imagem dela; no vazio = fundo do mapa.
   * Jogador: sobre o token do próprio personagem = retrato.
   */
  async function placeImage(file: File, target: TokenDto | null) {
    if (!shownMap || myRole === 'spectator') return;
    const mine = ownCharacter(target);
    if (!manager && !mine) {
      toast('Solte a imagem sobre o token do seu personagem', {
        body: 'Assim ela vira o retrato dele. O fundo do mapa é com o mestre.',
        tone: 'info',
      });
      return;
    }
    setError(undefined);
    const sending = toast('Enviando imagem…', { ms: 15000 });
    try {
      const tk = () => accessToken();
      if (mine && !manager) {
        const a = await uploadAsset(campaignId, 'portrait', file);
        const updated = await api<CharacterDto>(
          `/campaigns/${campaignId}/characters/${mine.id}`,
          await tk(),
          {
            method: 'PATCH',
            body: json({ portraitAsset: a.id, version: mine.version }),
          },
        );
        setCharacters((list) => list.map((c) => (c.id === updated.id ? updated : c)));
      } else if (target) {
        const a = await uploadAsset(campaignId, 'token', file);
        await api(`/campaigns/${campaignId}/maps/${shownMap.id}/tokens/${target.id}`, await tk(), {
          method: 'PATCH',
          body: json({ imageAsset: a.id }),
        });
      } else {
        const a = await uploadAsset(campaignId, 'map', file);
        await api(`/campaigns/${campaignId}/maps/${shownMap.id}`, await tk(), {
          method: 'PATCH',
          body: json({ backgroundAsset: a.id }),
        });
      }
      void loadMap(shownMap.id);
      dismissToast(sending);
      playSound('notify');
      toast(target ? `Imagem posta em ${target.label}` : 'Fundo do mapa trocado', { tone: 'success' });
    } catch (e) {
      dismissToast(sending);
      setError(e instanceof Error ? e.message : 'Falha ao enviar a imagem');
    }
  }
  usePasteImage(manager && !!shownMap, (f) => {
    const t = shownMap?.tokens.find((x) => x.id === focusToken && !x.icon) ?? null;
    void placeImage(f, t);
  });

  const shownCharacters = asPlayer ? characters.filter((c) => c.ownerId === myId) : characters;
  return (
    <div className="grid gap-5 max-xl:pb-20 xl:grid-cols-[1fr_400px]">
      {/* Fora das seções: aparecem mesmo com o mapa escondido (celular). */}
      <DiceTray message={diceMsg} onDone={closeDice} />
      {banner && <CombatIntro combat={banner} images={combatImages} onDone={closeBanner} />}
      <section className={cn('min-w-0 space-y-3', view === 'panel' && 'max-xl:hidden')} aria-label="Mapa">
        {realManager && (
          <div
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2 text-sm',
              asPlayer ? 'border-sky-400/50 bg-sky-500/10' : 'border-line/60 bg-surface/50',
            )}
            data-testid="preview-bar"
          >
            <Eye className="size-4 text-sky-300" />
            <span className={cn('flex-1 text-ink-muted', !asPlayer && 'max-sm:hidden')}>
              {asPlayer
                ? 'Pré-visualização: você está vendo a mesa como um jogador (sem segredos, ocultos e mapas não compartilhados).'
                : 'Confira o que os jogadores veem antes de revelar algo.'}
            </span>
            <Button
              size="sm"
              variant={asPlayer ? 'primary' : 'secondary'}
              onClick={() => setAsPlayer((v) => !v)}
              aria-pressed={asPlayer}
            >
              {asPlayer ? 'Voltar a ver como mestre' : 'Ver como jogador'}
            </Button>
          </div>
        )}
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
        <span id="table-map" className="block scroll-mt-20" aria-hidden />
        {shownCombat && (
          <CombatBanner campaignId={campaignId} combat={shownCombat} manager={manager} onChange={setCombat} />
        )}
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
        {shownCombat && (
          <InitiativeBar
            combat={shownCombat}
            images={combatImages}
            onPick={(c) => {
              const tk = shownMap?.tokens.find((t) =>
                c.characterId
                  ? t.characterId === c.characterId
                  : c.npcId
                    ? t.npcId === c.npcId
                    : t.label === c.name,
              );
              setFocusToken(tk?.id ?? null);
              setTab('combat');
            }}
          />
        )}
        {shownMap ? (
          <div className="relative">
            <MapCanvas
              map={shownMap}
              zoom={zoom}
              canMove={canMove}
              onMove={onMove}
              onUseProp={myRole === 'spectator' ? undefined : onUseProp}
              decorations={decorations}
              selectedTokenId={focusToken}
              onSelectToken={(t) => setFocusToken(t.id)}
              onZoomChange={setZoom}
              onDropImage={myRole === 'spectator' ? undefined : (f, t) => void placeImage(f, t)}
              dropHint={(t) =>
                manager
                  ? t
                    ? `Soltar para pôr a imagem em ${t.label}`
                    : 'Soltar para usar como fundo do mapa'
                  : ownCharacter(t)
                    ? `Soltar para usar como retrato de ${t?.label}`
                    : 'Solte sobre o token do seu personagem'
              }
              className="max-h-[70vh] max-xl:max-h-[calc(100dvh-14rem)]"
            />
          </div>
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
            {manager
              ? 'Arraste qualquer token.'
              : 'Arraste o token do seu personagem (ou use as setas do teclado).'}{' '}
            Clique em portas, baús e tochas para usar.
          </p>
        )}
      </section>
      <div
        className={cn(
          'flex flex-col gap-2 xl:sticky xl:top-20 xl:h-[calc(100dvh-7rem)]',
          // celular/tablet: o painel ocupa a tela entre o cabeçalho e a barra de baixo
          'max-xl:fixed max-xl:inset-x-0 max-xl:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] max-xl:top-16 max-xl:z-30 max-xl:bg-bg max-xl:p-3',
          view === 'map' && 'max-xl:hidden',
        )}
      >
        <div
          className="flex gap-1 rounded-lg border border-line bg-surface/80 p-1 max-xl:hidden"
          role="tablist"
          aria-label="Painel lateral"
        >
          {(
            [
              ['chat', 'Crônica'],
              ['combat', combat ? 'Combate •' : 'Combate'],
              ['sheet', 'Ficha'],
              ['rules', 'Regras'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              tabIndex={tab === k ? 0 : -1}
              data-tab={k}
              onClick={() => setTab(k)}
              onKeyDown={(e) => {
                const order = ['chat', 'combat', 'sheet', 'rules'] as const;
                const i = order.indexOf(k);
                const next =
                  e.key === 'ArrowRight'
                    ? order[(i + 1) % 4]
                    : e.key === 'ArrowLeft'
                      ? order[(i + 3) % 4]
                      : e.key === 'Home'
                        ? order[0]
                        : e.key === 'End'
                          ? order[3]
                          : null;
                if (!next) return;
                e.preventDefault();
                setTab(next);
                (
                  e.currentTarget.parentElement?.querySelector(`[data-tab="${next}"]`) as HTMLElement | null
                )?.focus();
              }}
              className={cn(
                'flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition-colors',
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
            messages={shownMessages}
            myId={myId}
            canPlay={myRole !== 'spectator'}
            isManager={manager}
            npcs={shownNpcs}
            onSent={addMessage}
          />
        </div>
        {tab !== 'chat' && (
          <section className="min-h-[420px] flex-1 overflow-hidden rounded-xl border border-line bg-surface/80">
            {tab === 'combat' ? (
              <CombatPanel
                campaignId={campaignId}
                combat={shownCombat}
                manager={manager}
                system={system}
                npcs={shownNpcs}
                onChange={setCombat}
                onOpenPage={openBookPage}
              />
            ) : tab === 'sheet' ? (
              <QuickSheetPanel
                campaignId={campaignId}
                system={system}
                characters={shownCharacters}
                myId={myId}
                manager={manager}
                onUpdated={(c) => setCharacters((list) => list.map((x) => (x.id === c.id ? c : x)))}
                onOpenPage={openBookPage}
              />
            ) : (
              <RulesPanel campaignId={campaignId} system={system} manager={manager} openPage={pageReq} />
            )}
          </section>
        )}
      </div>
      {/* Celular/tablet: barra fixa embaixo para trocar entre mapa e painéis. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur xl:hidden"
        aria-label="Mesa"
        data-testid="table-bottom-nav"
      >
        <div className="mx-auto flex max-w-xl">
          {(
            [
              ['map', 'Mapa', MapIcon],
              ['chat', 'Crônica', ScrollText],
              ['combat', 'Combate', Swords],
              ['sheet', 'Ficha', IdCard],
              ['rules', 'Regras', BookOpen],
            ] as const
          ).map(([k, label, Icon]) => {
            const active = k === 'map' ? view === 'map' : view === 'panel' && tab === k;
            return (
              <button
                key={k}
                type="button"
                aria-current={active ? 'page' : undefined}
                data-view={k}
                onClick={() => {
                  if (k === 'map') {
                    setView('map');
                    requestAnimationFrame(() =>
                      document
                        .getElementById('table-map')
                        ?.scrollIntoView({ block: 'start', behavior: 'auto' }),
                    );
                  } else {
                    setTab(k);
                    setView('panel');
                  }
                }}
                className={cn(
                  'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
                  active ? 'text-gold-bright' : 'text-ink-muted',
                  k === 'combat' && myTurn && !active && 'animate-pulse-soft text-gold-bright',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
                {k === 'chat' && unread > 0 && (
                  <span
                    className="absolute right-[22%] top-1.5 min-w-4 rounded-full bg-arcane-600 px-1 text-[10px] leading-4 text-white"
                    data-testid="unread-badge"
                    aria-label={`${unread} mensagens novas`}
                  >
                    {unread}
                  </span>
                )}
                {k === 'combat' && combat && (
                  <span
                    className="absolute right-[28%] top-2 size-2 rounded-full bg-blood-light"
                    aria-label="Combate em andamento"
                  />
                )}
                {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded bg-gold" aria-hidden />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
