'use client';

import {
  type CharacterDto,
  type MapDto,
  type MapSummaryDto,
  type NpcDto,
  type Terrain,
  TERRAIN_LABELS,
  TERRAINS,
  TOKEN_KIND_LABELS,
  TOKEN_KINDS,
  type TokenDto,
  type TokenKind,
} from '@rpg-ai/shared';
import { Alert, Badge, Button, Card, CardContent, cn, Field, Input, Select } from '@rpg-ai/ui';
import { Brush, Eraser, Eye, EyeOff, MousePointer2, Plus, Trash2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';
import { MapCanvas, TERRAIN_STYLE } from './map-canvas';

type Tool = { kind: 'select' } | { kind: 'paint'; terrain: Terrain | null } | { kind: 'token' };

function NewMapForm({ campaignId, onCreated }: { campaignId: string; onCreated: (m: MapDto) => void }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
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
              cols: Number(f.get('cols')),
              rows: Number(f.get('rows')),
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
        <Input id="map-cols" name="cols" type="number" min={4} max={100} defaultValue={24} />
      </Field>
      <Field label="Linhas" htmlFor="map-rows">
        <Input id="map-rows" name="rows" type="number" min={4} max={100} defaultValue={16} />
      </Field>
      <Field label="Quadrado =" htmlFor="map-cell">
        <Input id="map-cell" name="cell" defaultValue="1,5 m" maxLength={20} />
      </Field>
      <Button type="submit" loading={busy}>
        <Plus /> Criar mapa
      </Button>
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
}: {
  campaignId: string;
  maps: MapSummaryDto[];
  characters: CharacterDto[];
  npcs: NpcDto[];
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

  async function patchMap(body: object) {
    const m = await call((t) => api<MapDto>(base, t, { method: 'PATCH', body: json(body) }));
    if (m) {
      setMap(m);
      setMaps((list) =>
        list.map((x) =>
          x.id === m.id ? { ...x, name: m.name, shared: m.shared, cols: m.cols, rows: m.rows } : x,
        ),
      );
      router.refresh();
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

  const toolBtn = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
      active ? 'border-gold/60 bg-gold/10 text-gold-bright' : 'border-line text-ink-muted hover:text-ink',
    );

  return (
    <div className="space-y-5">
      <Card>
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
                  updatedAt: m.updatedAt,
                },
                ...l,
              ]);
              setMap(m);
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
                  onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1)))}
                  aria-label="Aumentar zoom"
                >
                  +
                </Button>
              </span>
            </div>
            <MapCanvas
              map={map}
              zoom={zoom}
              className="max-h-[70vh]"
              canMove={() => tool.kind === 'select'}
              onMove={onMove}
              paint={tool.kind === 'paint' ? { terrain: tool.terrain, onPaint } : undefined}
              onCellClick={tool.kind === 'token' ? placeToken : undefined}
              selectedTokenId={selected?.id}
              onSelectToken={(t) => setSelected(t)}
            />
            <p className="text-xs text-ink-faint">
              {tool.kind === 'paint'
                ? 'Clique ou arraste sobre o mapa para pintar.'
                : tool.kind === 'token'
                  ? 'Clique numa casa para colocar o token.'
                  : 'Arraste tokens para movê-los. Clique para selecionar.'}
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

            {selected && (
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <p className="flex items-center gap-2">
                    <span className="size-4 rounded-full" style={{ background: selected.color }} />
                    <b className="truncate">{selected.label}</b>
                    <span className="text-xs text-ink-faint">{TOKEN_KIND_LABELS[selected.kind]}</span>
                  </p>
                  <div className="flex gap-2">
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
            <p className="flex items-start gap-2 text-xs text-ink-faint">
              <Brush className="mt-0.5 size-3.5 shrink-0" />
              Imagens de fundo para mapas chegam quando o armazenamento de arquivos for configurado.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
