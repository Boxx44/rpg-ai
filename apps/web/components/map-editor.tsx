'use client';

import {
  type CampaignSystemDto,
  type CharacterDto,
  type MapDto,
  type MapSummaryDto,
  type NpcDto,
  PROP_KINDS,
  MAP_TEMPLATES,
  type MapTemplateKey,
  mapTemplate,
  PROPS,
  type PropKind,
  type Terrain,
  TERRAIN_LABELS,
  TERRAINS,
  TOKEN_KIND_LABELS,
  TOKEN_KINDS,
  type TokenDto,
  type TokenKind,
} from '@rpg-ai/shared';
import { Alert, Badge, Button, Card, CardContent, cn, Field, Input, Select } from '@rpg-ai/ui';
import {
  Armchair,
  Eraser,
  Eye,
  EyeOff,
  MousePointer2,
  Plus,
  Image as ImageIcon,
  Power,
  RotateCw,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';
import { MapCanvas, TERRAIN_STYLE } from './map-canvas';
import { PropArt, PropDefs } from './map-props';
import { ImagePicker } from './image-picker';
import { SecretPanel } from './secret-panel';
import { searchSkills } from '@/lib/skills';
import { uploadAsset, useAssetUrl, usePasteImage } from '@/lib/assets';
import { dismissToast, playSound, toast } from '@/lib/feedback';

type Tool =
  | { kind: 'select' }
  | { kind: 'paint'; terrain: Terrain | null }
  | { kind: 'token' }
  | { kind: 'prop'; prop: PropKind };

const PROP_GROUPS = [...new Set(PROP_KINDS.map((k) => PROPS[k].group))];

/** Miniatura de um modelo de mapa (só o terreno), para escolher antes de criar. */
function TemplatePreview({ k }: { k: MapTemplateKey }) {
  const t = mapTemplate(k);
  return (
    <svg viewBox={`0 0 ${t.cols} ${t.rows}`} className="h-16 w-full rounded bg-[#16131d]" aria-hidden>
      {Object.entries(t.terrain).map(([key, tr]) => {
        const [x, y] = key.split(',').map(Number) as [number, number];
        return (
          <rect
            key={key}
            x={x}
            y={y}
            width={1.02}
            height={1.02}
            fill={TERRAIN_STYLE[tr as Terrain]?.fill ?? '#333'}
          />
        );
      })}
      {t.props.map((p, i) => (
        <circle key={i} cx={p.x + 0.5} cy={p.y + 0.5} r={0.35} fill="#e6c87f" opacity={0.8} />
      ))}
    </svg>
  );
}

function NewMapForm({ campaignId, onCreated }: { campaignId: string; onCreated: (m: MapDto) => void }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<MapTemplateKey | ''>('');
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem_7rem_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(undefined);
        try {
          const m = await api<MapDto>(`/campaigns/${campaignId}/maps`, await accessToken(), {
            method: 'POST',
            body: json({
              name: String(f.get('name')),
              // com modelo, o tamanho vem do próprio modelo
              ...(template ? { template } : { cols: Number(f.get('cols')), rows: Number(f.get('rows')) }),
              cellLabel: String(f.get('cell')),
            }),
          });
          onCreated(m);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erro');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Nome do mapa" htmlFor="map-name">
        <Input id="map-name" name="name" required maxLength={80} placeholder="Ex.: Taverna do Corvo" />
      </Field>
      <Field label="Colunas" htmlFor="map-cols">
        <Input
          id="map-cols"
          name="cols"
          type="number"
          min={4}
          max={100}
          defaultValue={24}
          disabled={!!template}
        />
      </Field>
      <Field label="Linhas" htmlFor="map-rows">
        <Input
          id="map-rows"
          name="rows"
          type="number"
          min={4}
          max={100}
          defaultValue={16}
          disabled={!!template}
        />
      </Field>
      <Field label="Quadrado =" htmlFor="map-cell">
        <Input id="map-cell" name="cell" defaultValue="1,5 m" maxLength={20} />
      </Field>
      <Button type="submit" loading={busy}>
        <Plus /> Criar mapa
      </Button>
      <fieldset className="sm:col-span-5">
        <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-faint">
          Começar de um modelo pronto (opcional)
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Modelo de mapa">
          {(
            [
              { key: '', label: 'Em branco', description: 'Mapa vazio para você desenhar.' },
              ...MAP_TEMPLATES,
            ] as const
          ).map((tp) => (
            <button
              key={tp.key || 'blank'}
              type="button"
              role="radio"
              aria-checked={template === tp.key}
              title={tp.description}
              onClick={() => setTemplate(tp.key as MapTemplateKey | '')}
              className={cn(
                'space-y-1 rounded-lg border p-1.5 text-left text-xs transition-colors',
                template === tp.key
                  ? 'border-gold/70 bg-gold/10 text-gold-bright'
                  : 'border-line text-ink-muted hover:text-ink',
              )}
            >
              {tp.key ? (
                <TemplatePreview k={tp.key as MapTemplateKey} />
              ) : (
                <div className="h-16 rounded bg-[#16131d]" />
              )}
              <span className="block truncate font-medium">{tp.label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <Alert tone="error" className="sm:col-span-5">
          {error}
        </Alert>
      )}
    </form>
  );
}

export function MapEditor({
  campaignId,
  maps: initialMaps,
  characters,
  npcs,
  system = null,
}: {
  campaignId: string;
  maps: MapSummaryDto[];
  characters: CharacterDto[];
  npcs: NpcDto[];
  system?: CampaignSystemDto | null;
}) {
  const router = useRouter();
  const [maps, setMaps] = useState(initialMaps);
  const [map, setMap] = useState<MapDto | null>(null);
  const [tool, setTool] = useState<Tool>({ kind: 'paint', terrain: 'wall' });
  const [selected, setSelected] = useState<TokenDto | null>(null);
  const [tokenForm, setTokenForm] = useState({
    kind: 'enemy' as TokenKind,
    label: '',
    color: '#b4232f',
    size: 1,
    hidden: false,
    link: '',
  });
  const [error, setError] = useState<string>();
  const [zoom, setZoom] = useState(1);
  const [propRotation, setPropRotation] = useState<0 | 90 | 180 | 270>(0);

  const open = useCallback(
    async (id: string) => {
      setSelected(null);
      setMap(await api<MapDto>(`/campaigns/${campaignId}/maps/${id}`, await accessToken()));
    },
    [campaignId],
  );
  useEffect(() => {
    if (!map && maps[0]) void open(maps[0].id);
  }, [map, maps, open]);

  async function call<T>(fn: (token: string) => Promise<T>): Promise<T | undefined> {
    setError(undefined);
    try {
      return await fn(await accessToken());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      return undefined;
    }
  }

  const base = map ? `/campaigns/${campaignId}/maps/${map.id}` : '';
  const bgUrl = useAssetUrl(campaignId, map?.backgroundAsset);

  async function patchMap(body: object) {
    const m = await call((t) => api<MapDto>(base, t, { method: 'PATCH', body: json(body) }));
    if (m) {
      setMap(m);
      setMaps((list) =>
        list.map((x) =>
          x.id === m.id
            ? {
                ...x,
                name: m.name,
                shared: m.shared,
                cols: m.cols,
                rows: m.rows,
                backgroundAsset: m.backgroundAsset,
              }
            : x,
        ),
      );
      router.refresh();
    }
  }

  /** Mantém as colunas e calcula as linhas pela proporção da imagem de fundo. */
  async function fitGridToImage() {
    if (!map?.backgroundAsset) return;
    const url = bgUrl;
    if (!url) return;
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => undefined);
    if (!img.naturalWidth) return;
    const rows = Math.max(4, Math.min(100, Math.round((map.cols * img.naturalHeight) / img.naturalWidth)));
    await patchMap({ rows });
  }

  /**
   * Imagem vinda do computador (botão, arrastar ou Ctrl+V): sobre uma peça vira a
   * imagem dela; senão vira o fundo do mapa.
   */
  async function placeImage(file: File, target: TokenDto | null) {
    if (!map) return;
    setError(undefined);
    const sending = toast(target ? `Enviando imagem de ${target.label}…` : 'Enviando fundo do mapa…', {
      ms: 15000,
    });
    try {
      const a = await uploadAsset(campaignId, target ? 'token' : 'map', file);
      if (target) await setTokenImage(target, a.id);
      else await patchMap({ backgroundAsset: a.id });
      dismissToast(sending);
      playSound('notify');
      toast(target ? `Imagem posta em ${target.label}` : 'Fundo do mapa trocado', {
        tone: 'success',
        body: target ? undefined : 'Dica: "Ajustar grade à imagem" no painel ao lado.',
      });
    } catch (e) {
      dismissToast(sending);
      setError(e instanceof Error ? e.message : 'Falha ao enviar a imagem');
    }
  }
  const bgInput = useRef<HTMLInputElement>(null);
  usePasteImage(!!map, (f) => void placeImage(f, selected && !selected.icon ? selected : null));

  async function setTokenImage(t: TokenDto, imageAsset: string | null) {
    await call((tk) => api(`${base}/tokens/${t.id}`, tk, { method: 'PATCH', body: json({ imageAsset }) }));
    const m = await call((tk) => api<MapDto>(base, tk));
    if (m) {
      setMap(m);
      // só atualiza a seleção se esta peça já estava selecionada (arrastar imagem não seleciona)
      setSelected((cur) => (cur?.id === t.id ? (m.tokens.find((x) => x.id === t.id) ?? null) : cur));
    }
  }

  async function placeToken(x: number, y: number) {
    if (!map) return;
    const link = tokenForm.link;
    const ch = link.startsWith('c:') ? characters.find((c) => c.id === link.slice(2)) : undefined;
    const np = link.startsWith('n:') ? npcs.find((n) => n.id === link.slice(2)) : undefined;
    const label = tokenForm.label.trim() || ch?.name || np?.name || TOKEN_KIND_LABELS[tokenForm.kind];
    const t = await call((tk) =>
      api<TokenDto>(`${base}/tokens`, tk, {
        method: 'POST',
        body: json({
          kind: ch ? 'character' : np ? 'npc' : tokenForm.kind,
          label: label.slice(0, 40),
          color: ch?.color ?? np?.color ?? tokenForm.color,
          size: tokenForm.size,
          hidden: tokenForm.hidden,
          x: Math.min(x, map.cols - tokenForm.size),
          y: Math.min(y, map.rows - tokenForm.size),
          ...(ch ? { characterId: ch.id } : {}),
          ...(np ? { npcId: np.id } : {}),
        }),
      }),
    );
    if (t) setMap({ ...map, tokens: [...map.tokens, t] });
  }

  /** Coloca um objeto (porta, baú, tocha…) na casa clicada. */
  async function placeProp(x: number, y: number) {
    if (!map || tool.kind !== 'prop') return;
    const def = PROPS[tool.prop];
    const t = await call((tk) =>
      api<TokenDto>(`${base}/tokens`, tk, {
        method: 'POST',
        body: json({
          kind: 'object',
          label: def.label,
          color: '#6b6b6b',
          size: def.size,
          hidden: tokenForm.hidden,
          icon: tool.prop,
          rotation: propRotation,
          x: Math.max(0, Math.min(x, map.cols - def.size)),
          y: Math.max(0, Math.min(y, map.rows - def.size)),
        }),
      }),
    );
    if (t) setMap({ ...map, tokens: [...map.tokens, t] });
  }

  async function rotate(t: TokenDto) {
    const rotation = ((t.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    await call((tk) => api(`${base}/tokens/${t.id}`, tk, { method: 'PATCH', body: json({ rotation }) }));
    if (map) setMap({ ...map, tokens: map.tokens.map((k) => (k.id === t.id ? { ...k, rotation } : k)) });
    setSelected({ ...t, rotation });
  }

  async function toggleProp(t: TokenDto) {
    const r = await call((tk) =>
      api<{ state: TokenDto['state'] }>(`${base}/tokens/${t.id}/toggle`, tk, { method: 'POST' }),
    );
    if (!r) return;
    if (map)
      setMap({ ...map, tokens: map.tokens.map((k) => (k.id === t.id ? { ...k, state: r.state } : k)) });
    setSelected({ ...t, state: r.state });
  }

  async function onPaint(cells: { x: number; y: number }[]) {
    if (!map || tool.kind !== 'paint') return;
    const m = await call((t) =>
      api<MapDto>(`${base}/paint`, t, {
        method: 'POST',
        body: json({ cells: cells.map((c) => ({ ...c, terrain: tool.terrain })) }),
      }),
    );
    if (m) setMap(m);
  }

  async function onMove(t: TokenDto, x: number, y: number) {
    if (!map) return;
    setMap({ ...map, tokens: map.tokens.map((k) => (k.id === t.id ? { ...k, x, y } : k)) });
    await call((tk) => api(`${base}/tokens/${t.id}/move`, tk, { method: 'POST', body: json({ x, y }) }));
  }

  /** Liga/atualiza/desliga o segredo da peça e recarrega o mapa (para ver quem já achou). */
  async function saveSecret(
    t: TokenDto,
    patch: { hidden?: boolean; secretSkill: string | null; secretDt: number | null; secretRadius: number },
  ) {
    await call((tk) => api(`${base}/tokens/${t.id}`, tk, { method: 'PATCH', body: json(patch) }));
    const m = await call((tk) => api<MapDto>(base, tk));
    if (m) {
      setMap(m);
      setSelected(m.tokens.find((x) => x.id === t.id) ?? null);
      toast(patch.secretSkill ? 'Segredo salvo' : 'Não é mais segredo', { tone: 'arcane', ms: 2000 });
    }
  }

  async function toggleHidden(t: TokenDto) {
    await call((tk) =>
      api(`${base}/tokens/${t.id}`, tk, { method: 'PATCH', body: json({ hidden: !t.hidden }) }),
    );
    if (map)
      setMap({ ...map, tokens: map.tokens.map((k) => (k.id === t.id ? { ...k, hidden: !t.hidden } : k)) });
    setSelected({ ...t, hidden: !t.hidden });
  }

  async function removeToken(t: TokenDto) {
    await call((tk) => api(`${base}/tokens/${t.id}`, tk, { method: 'DELETE' }));
    if (map) setMap({ ...map, tokens: map.tokens.filter((k) => k.id !== t.id) });
    setSelected(null);
  }

  async function removeMap() {
    if (!map || !confirm(`Excluir o mapa "${map.name}"?`)) return;
    await call((t) => api(base, t, { method: 'DELETE' }));
    setMaps((l) => l.filter((x) => x.id !== map.id));
    setMap(null);
    router.refresh();
  }

  const [showNew, setShowNew] = useState(false);
  const toolBtn = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
      active ? 'border-gold/60 bg-gold/10 text-gold-bright' : 'border-line text-ink-muted hover:text-ink',
    );

  return (
    <div className="space-y-5">
      {/* No celular, o formulário de novo mapa fica recolhido quando já existe mapa. */}
      {maps.length > 0 && (
        <Button
          variant="outline"
          className="w-full lg:hidden"
          onClick={() => setShowNew((v) => !v)}
          aria-expanded={showNew}
          data-testid="toggle-new-map"
        >
          <Plus /> {showNew ? 'Fechar novo mapa' : 'Novo mapa'}
        </Button>
      )}
      <Card className={cn(maps.length > 0 && !showNew && 'max-lg:hidden')}>
        <CardContent className="pt-6">
          <NewMapForm
            campaignId={campaignId}
            onCreated={(m) => {
              setMaps((l) => [
                {
                  id: m.id,
                  name: m.name,
                  cols: m.cols,
                  rows: m.rows,
                  shared: m.shared,
                  backgroundAsset: m.backgroundAsset,
                  updatedAt: m.updatedAt,
                },
                ...l,
              ]);
              setMap(m);
              setShowNew(false);
              router.refresh();
            }}
          />
        </CardContent>
      </Card>

      {maps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {maps.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => open(m.id)}
              className={toolBtn(map?.id === m.id)}
              data-testid="map-tab"
            >
              {m.name} {!m.shared && <EyeOff className="size-3" />}
            </button>
          ))}
        </div>
      )}

      {map && (
        <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-3">
            <div
              className="flex flex-wrap items-center gap-2"
              role="toolbar"
              aria-label="Ferramentas do mapa"
            >
              <button
                type="button"
                className={toolBtn(tool.kind === 'select')}
                onClick={() => setTool({ kind: 'select' })}
              >
                <MousePointer2 className="size-3.5" /> Mover
              </button>
              {TERRAINS.map((tr) => (
                <button
                  key={tr}
                  type="button"
                  aria-pressed={tool.kind === 'paint' && tool.terrain === tr}
                  className={toolBtn(tool.kind === 'paint' && tool.terrain === tr)}
                  onClick={() => setTool({ kind: 'paint', terrain: tr })}
                >
                  <span
                    className="size-3 rounded-sm border border-white/10"
                    style={{ background: TERRAIN_STYLE[tr].fill }}
                  />{' '}
                  {TERRAIN_LABELS[tr]}
                </button>
              ))}
              <button
                type="button"
                className={toolBtn(tool.kind === 'paint' && tool.terrain === null)}
                onClick={() => setTool({ kind: 'paint', terrain: null })}
              >
                <Eraser className="size-3.5" /> Apagar
              </button>
              <button
                type="button"
                className={toolBtn(tool.kind === 'token')}
                onClick={() => setTool({ kind: 'token' })}
              >
                <UserPlus className="size-3.5" /> Colocar token
              </button>
              <button
                type="button"
                className={toolBtn(tool.kind === 'prop')}
                onClick={() => setTool({ kind: 'prop', prop: tool.kind === 'prop' ? tool.prop : 'door' })}
                data-testid="tool-props"
              >
                <Armchair className="size-3.5" /> Objetos
              </button>
              <input
                ref={bgInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                aria-label="Escolher imagem de fundo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void placeImage(f, null);
                }}
              />
              <button
                type="button"
                className={toolBtn(false)}
                onClick={() => bgInput.current?.click()}
                data-testid="tool-background"
                title="Também dá para arrastar uma imagem para o mapa ou colar com Ctrl+V"
              >
                <ImageIcon className="size-3.5" /> Imagem de fundo
              </button>
              <span className="ml-auto flex items-center gap-1 text-xs text-ink-muted">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}
                  aria-label="Diminuir zoom"
                >
                  −
                </Button>
                {Math.round(zoom * 100)}%
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(1)))}
                  aria-label="Aumentar zoom"
                >
                  +
                </Button>
              </span>
            </div>
            <MapCanvas
              map={map}
              zoom={zoom}
              onZoomChange={setZoom}
              onDropImage={(f, target) => void placeImage(f, target)}
              className="h-[calc(100dvh-16rem)] min-h-[520px]"
              canMove={() => tool.kind === 'select'}
              onMove={onMove}
              paint={tool.kind === 'paint' ? { terrain: tool.terrain, onPaint } : undefined}
              onCellClick={tool.kind === 'token' ? placeToken : tool.kind === 'prop' ? placeProp : undefined}
              selectedTokenId={selected?.id}
              onSelectToken={(t) => setSelected(t)}
            />
            <p className="text-xs text-ink-faint">
              {tool.kind === 'paint'
                ? 'Clique ou arraste sobre o mapa para pintar.'
                : tool.kind === 'token'
                  ? 'Clique numa casa para colocar o token.'
                  : tool.kind === 'prop'
                    ? `Clique numa casa para colocar: ${PROPS[tool.prop].label}.`
                    : 'Arraste tokens para movê-los. Clique para selecionar.'}{' '}
              <span className="text-ink-muted">
                Imagens: arraste do computador para o mapa (fundo) ou para um token, ou cole com Ctrl+V.
              </span>
            </p>
            {error && <Alert tone="error">{error}</Alert>}
          </div>

          <aside className="space-y-4">
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-display tracking-wide">{map.name}</h2>
                  <Badge tone={map.shared ? 'arcane' : 'gold'}>{map.shared ? 'Na mesa' : 'Oculto'}</Badge>
                </div>
                <Button
                  className="w-full"
                  variant={map.shared ? 'secondary' : 'primary'}
                  onClick={() => patchMap({ shared: !map.shared })}
                  data-testid="toggle-share"
                >
                  {map.shared ? <EyeOff /> : <Eye />}
                  {map.shared ? 'Esconder dos jogadores' : 'Mostrar aos jogadores'}
                </Button>
                <form
                  className="grid grid-cols-2 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void patchMap({
                      name: String(f.get('name')),
                      cols: Number(f.get('cols')),
                      rows: Number(f.get('rows')),
                      cellLabel: String(f.get('cell')),
                    });
                  }}
                >
                  <Input
                    name="name"
                    defaultValue={map.name}
                    aria-label="Renomear mapa"
                    className="col-span-2 h-9"
                    key={`n${map.id}${map.name}`}
                  />
                  <Input
                    name="cols"
                    type="number"
                    min={4}
                    max={100}
                    defaultValue={map.cols}
                    aria-label="Colunas"
                    className="h-9"
                    key={`c${map.id}${map.cols}`}
                  />
                  <Input
                    name="rows"
                    type="number"
                    min={4}
                    max={100}
                    defaultValue={map.rows}
                    aria-label="Linhas"
                    className="h-9"
                    key={`r${map.id}${map.rows}`}
                  />
                  <Input
                    name="cell"
                    defaultValue={map.cellLabel}
                    aria-label="Tamanho do quadrado"
                    className="h-9"
                    key={`l${map.id}${map.cellLabel}`}
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Aplicar
                  </Button>
                </form>
                <Button size="sm" variant="ghost" className="text-blood-light" onClick={removeMap}>
                  <Trash2 /> Excluir mapa
                </Button>
              </CardContent>
            </Card>

            {tool.kind === 'token' && (
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">
                    Novo token
                  </h3>
                  <Select
                    aria-label="Vincular a"
                    value={tokenForm.link}
                    onChange={(e) => setTokenForm({ ...tokenForm, link: e.target.value })}
                  >
                    <option value="">Sem vínculo</option>
                    {characters.length > 0 && (
                      <optgroup label="Personagens (o jogador poderá mover)">
                        {characters.map((c) => (
                          <option key={c.id} value={`c:${c.id}`}>
                            {c.name} ({c.ownerName})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {npcs.length > 0 && (
                      <optgroup label="NPCs">
                        {npcs.map((n) => (
                          <option key={n.id} value={`n:${n.id}`}>
                            {n.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                  {!tokenForm.link && (
                    <>
                      <Select
                        aria-label="Tipo"
                        value={tokenForm.kind}
                        onChange={(e) => setTokenForm({ ...tokenForm, kind: e.target.value as TokenKind })}
                      >
                        {TOKEN_KINDS.filter((k) => k !== 'character' && k !== 'npc').map((k) => (
                          <option key={k} value={k}>
                            {TOKEN_KIND_LABELS[k]}
                          </option>
                        ))}
                      </Select>
                      <div className="flex gap-2">
                        <Input
                          aria-label="Nome do token"
                          placeholder="Nome (ex.: Goblin 1)"
                          value={tokenForm.label}
                          onChange={(e) => setTokenForm({ ...tokenForm, label: e.target.value })}
                          maxLength={40}
                        />
                        <Input
                          aria-label="Cor do token"
                          type="color"
                          value={tokenForm.color}
                          onChange={(e) => setTokenForm({ ...tokenForm, color: e.target.value })}
                          className="w-14 p-1"
                        />
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      Tamanho
                      <Select
                        aria-label="Tamanho"
                        value={tokenForm.size}
                        onChange={(e) => setTokenForm({ ...tokenForm, size: Number(e.target.value) })}
                        className="h-8 w-16"
                      >
                        {[1, 2, 3, 4].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tokenForm.hidden}
                        onChange={(e) => setTokenForm({ ...tokenForm, hidden: e.target.checked })}
                        className="accent-[var(--color-gold)]"
                      />
                      Oculto
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}

            {tool.kind === 'prop' && (
              <Card>
                <CardContent
                  className="max-h-[60vh] space-y-3 overflow-y-auto pt-6"
                  data-testid="prop-palette"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">Objetos</h3>
                  {PROP_GROUPS.map((g) => (
                    <div key={g}>
                      <p className="mb-1 text-xs text-ink-faint">{g}</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {PROP_KINDS.filter((k) => PROPS[k].group === g).map((k) => (
                          <button
                            key={k}
                            type="button"
                            title={PROPS[k].label}
                            aria-label={PROPS[k].label}
                            aria-pressed={tool.prop === k}
                            onClick={() => setTool({ kind: 'prop', prop: k })}
                            className={cn(
                              'flex flex-col items-center gap-0.5 rounded-md border p-1 text-[10px] leading-tight transition-colors',
                              tool.prop === k
                                ? 'border-gold/70 bg-gold/10 text-gold-bright'
                                : 'border-line text-ink-muted hover:border-arcane-500/60 hover:text-ink',
                            )}
                          >
                            <svg viewBox="0 0 100 100" className="size-10 rounded bg-[#2a2433]" aria-hidden>
                              <defs>
                                <PropDefs />
                              </defs>
                              <PropArt kind={k} state={(PROPS[k].states[0] as TokenDto['state']) ?? null} />
                            </svg>
                            <span className="w-full truncate">{PROPS[k].label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 text-sm">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPropRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
                    >
                      <RotateCw /> Girar ({propRotation}°)
                    </Button>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tokenForm.hidden}
                        onChange={(e) => setTokenForm({ ...tokenForm, hidden: e.target.checked })}
                        className="accent-[var(--color-gold)]"
                      />
                      Oculto
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}

            {selected && (
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <p className="flex items-center gap-2">
                    <span className="size-4 rounded-full" style={{ background: selected.color }} />
                    <b className="truncate">{selected.label}</b>
                    <span className="text-xs text-ink-faint">{TOKEN_KIND_LABELS[selected.kind]}</span>
                  </p>
                  {!selected.icon && (
                    <ImagePicker
                      campaignId={campaignId}
                      kind="token"
                      label={
                        selected.characterId || selected.npcId
                          ? 'Imagem do token (no lugar do retrato)'
                          : 'Imagem do token'
                      }
                      value={selected.imageAsset}
                      onChange={(id) => setTokenImage(selected, id)}
                    />
                  )}
                  {(selected.hidden || selected.secret) && (
                    <SecretPanel
                      key={`${selected.id}-${selected.secret?.skill}-${selected.secret?.dt}`}
                      token={selected}
                      skills={searchSkills(system)}
                      onSave={(p) => saveSecret(selected, p)}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {selected.icon && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => rotate(selected)}
                        aria-label="Girar objeto"
                      >
                        <RotateCw />
                      </Button>
                    )}
                    {selected.state && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleProp(selected)}
                        data-testid="use-prop"
                      >
                        <Power />{' '}
                        {{ closed: 'Abrir', open: 'Fechar', off: 'Acender', on: 'Apagar' }[selected.state]}
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => toggleHidden(selected)}>
                      {selected.hidden ? <Eye /> : <EyeOff />}
                      {selected.hidden ? 'Revelar' : 'Ocultar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-blood-light"
                      onClick={() => removeToken(selected)}
                    >
                      <Trash2 /> Remover
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="space-y-3 pt-6" data-testid="background-panel">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">
                  Imagem de fundo
                </h3>
                <ImagePicker
                  campaignId={campaignId}
                  kind="map"
                  label="Fundo do mapa"
                  value={map.backgroundAsset}
                  onChange={(id) => patchMap({ backgroundAsset: id })}
                />
                {map.backgroundAsset && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={map.gridVisible}
                        onChange={(e) => {
                          setMap({ ...map, gridVisible: e.target.checked }); // resposta imediata na tela
                          void patchMap({ gridVisible: e.target.checked });
                        }}
                        className="accent-[var(--color-gold)]"
                      />
                      Mostrar grade
                    </label>
                    <Button size="sm" variant="secondary" onClick={fitGridToImage} data-testid="fit-grid">
                      Ajustar grade à imagem
                    </Button>
                  </div>
                )}
                <p className="text-xs text-ink-faint">
                  Use um mapa desenhado ou uma foto. A grade fica por cima; &quot;Ajustar grade à imagem&quot;
                  mantém as colunas e calcula as linhas para a imagem não ficar esticada.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
