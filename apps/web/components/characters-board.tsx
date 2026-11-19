'use client';

import type { SystemDefinition, SystemValues } from '@rpg-ai/rules-engine';
import type { CharacterDto, CharacterSheet, ChatMessageDto } from '@rpg-ai/shared';
import { Alert, Button, Card, CardContent, cn, Field, Input, Textarea } from '@rpg-ai/ui';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { ImagePicker } from './image-picker';
import { useAssetUrl } from '@/lib/assets';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';
import { normalizeValues, type RollTarget, safeCompute, SystemSheet } from './system-sheet';

const EMPTY_SHEET: CharacterSheet = {
  attributes: [
    { label: 'Força', value: '' },
    { label: 'Destreza', value: '' },
    { label: 'Inteligência', value: '' },
  ],
  resources: [{ label: 'Vida', current: 10, max: 10 }],
  inventory: [],
  notes: '',
};

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">{children}</h3>
      {action}
    </div>
  );
}

export interface SheetData {
  name: string;
  concept: string;
  color: string;
  sheet: CharacterSheet;
}

/** Onde a ficha é guardada: campanha (padrão) ou outro lugar, como a biblioteca. */
export interface SheetPersistence {
  save(data: SheetData): Promise<void>;
  remove?(): Promise<void>;
}

/** Guarda uma cópia (de personagem ou NPC da campanha) na biblioteca pessoal de fichas. */
export function SaveToLibrary({
  campaignId,
  body,
}: {
  campaignId: string;
  body: { characterId?: string; npcId?: string };
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  return (
    <Button
      variant="ghost"
      className="ml-2"
      loading={state === 'busy'}
      disabled={state === 'done'}
      onClick={async () => {
        setState('busy');
        try {
          await api(`/campaigns/${campaignId}/library`, await accessToken(), {
            method: 'POST',
            body: json(body),
          });
          setState('done');
        } catch {
          setState('error');
        }
      }}
    >
      {state === 'done'
        ? 'Guardado nas Fichas ✓'
        : state === 'error'
          ? 'Erro — tentar de novo'
          : 'Guardar cópia nas Fichas'}
    </Button>
  );
}

export function SheetEditor({
  initial,
  campaignId,
  onDone,
  def,
  seed,
  persist,
  extra,
  nameLabel = 'Nome',
  deleteLabel,
}: {
  initial: CharacterDto | null;
  campaignId?: string;
  onDone: () => void;
  def: SystemDefinition | null;
  /** Valores iniciais quando não é um personagem de campanha (biblioteca, criação guiada). */
  seed?: Partial<SheetData>;
  persist?: SheetPersistence;
  /** Campos extras (ex.: dados de NPC) logo acima das anotações. */
  extra?: React.ReactNode;
  nameLabel?: string;
  deleteLabel?: string;
}) {
  const router = useRouter();
  const readOnly = initial ? !initial.canEdit : false;
  const [name, setName] = useState(initial?.name ?? seed?.name ?? '');
  const [concept, setConcept] = useState(initial?.concept ?? seed?.concept ?? '');
  const [color, setColor] = useState(initial?.color ?? seed?.color ?? '#7c4ff0');
  const [portrait, setPortrait] = useState<string | null>(initial?.portraitAsset ?? null);
  const [sheet, setSheet] = useState<CharacterSheet>(initial?.sheet ?? seed?.sheet ?? EMPTY_SHEET);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [sys, setSys] = useState<SystemValues | undefined>(
    def ? normalizeValues(def, initial?.sheet.system ?? seed?.sheet?.system) : undefined,
  );
  const [rolling, setRolling] = useState<string | null>(null);
  const [lastRoll, setLastRoll] = useState<{
    label: string;
    total: number;
    expression: string;
    notes: string[];
  } | null>(null);

  async function roll(t: RollTarget) {
    if (!initial || !campaignId) return;
    const k = 'skill' in t ? t.skill : t.attribute;
    setRolling(k);
    setError(undefined);
    try {
      const r = await api<{ message: ChatMessageDto; notes: string[] }>(
        `/campaigns/${campaignId}/characters/${initial.id}/check`,
        await accessToken(),
        {
          method: 'POST',
          body: json(t),
        },
      );
      setLastRoll({
        label: r.message.roll!.label,
        total: r.message.roll!.total,
        expression: r.message.roll!.expression,
        notes: r.notes,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao rolar');
    } finally {
      setRolling(null);
    }
  }

  const upd = <K extends keyof CharacterSheet>(k: K, v: CharacterSheet[K]) =>
    setSheet((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!name.trim()) return setError('Dê um nome ao personagem.');
    setSaving(true);
    setError(undefined);
    const clean: CharacterSheet = {
      attributes: sheet.attributes.filter((a) => a.label.trim()),
      resources: sheet.resources.filter((r) => r.label.trim()),
      inventory: sheet.inventory.filter((i) => i.name.trim()),
      notes: sheet.notes,
      ...(sys ? { system: sys } : {}),
    };
    try {
      if (persist) {
        await persist.save({ name, concept, color, sheet: clean });
        router.refresh();
        onDone();
        return;
      }
      const token = await accessToken();
      if (initial)
        await api(`/campaigns/${campaignId}/characters/${initial.id}`, token, {
          method: 'PATCH',
          body: json({
            name,
            concept,
            color,
            sheet: clean,
            portraitAsset: portrait,
            version: initial.version,
          }),
        });
      else
        await api(`/campaigns/${campaignId}/characters`, token, {
          method: 'POST',
          body: json({ name, concept, color, sheet: clean }),
        });
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (persist?.remove) {
      if (!confirm(`Excluir ${name || 'esta ficha'}?`)) return;
      await persist.remove();
      router.refresh();
      onDone();
      return;
    }
    if (!initial || !confirm(`Excluir ${initial.name}?`)) return;
    await api(`/campaigns/${campaignId}/characters/${initial.id}`, await accessToken(), { method: 'DELETE' });
    router.refresh();
    onDone();
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6" data-testid="character-editor">
        {initial && campaignId && !persist && (
          <ImagePicker
            campaignId={campaignId}
            kind="portrait"
            label="Retrato (aparece no token e no combate)"
            value={portrait}
            onChange={(id) => setPortrait(id)}
            className={readOnly ? 'pointer-events-none opacity-70' : undefined}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field label={nameLabel} htmlFor="ch-name">
            <Input
              id="ch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={readOnly}
            />
          </Field>
          <Field label="Conceito" htmlFor="ch-concept" hint="Classe, origem, arquétipo…">
            <Input
              id="ch-concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              maxLength={200}
              disabled={readOnly}
            />
          </Field>
          <Field label="Cor" htmlFor="ch-color">
            <Input
              id="ch-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-16 p-1"
              disabled={readOnly}
            />
          </Field>
        </div>

        {def && sys ? (
          <>
            <SystemSheet
              def={def}
              value={sys}
              onChange={setSys}
              readOnly={readOnly}
              onRoll={initial?.canEdit ? roll : undefined}
              rolling={rolling}
            />
            {lastRoll && (
              <Alert tone="info" title={`${lastRoll.label}: ${lastRoll.total}`}>
                {lastRoll.expression} — também enviado para a crônica da mesa.
                {lastRoll.notes.map((n) => (
                  <span key={n} className="block text-gold-bright">
                    {n}
                  </span>
                ))}
              </Alert>
            )}
            {!initial && campaignId && (
              <p className="text-xs text-ink-faint">Salve a ficha para poder rolar os testes direto daqui.</p>
            )}
          </>
        ) : (
          <>
            <section>
              <SectionTitle
                action={
                  !readOnly && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        upd('resources', [...sheet.resources, { label: '', current: 0, max: 0 }])
                      }
                    >
                      <Plus /> Recurso
                    </Button>
                  )
                }
              >
                Recursos
              </SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2">
                {sheet.resources.map((r, i) => {
                  const set = (patch: Partial<typeof r>) =>
                    upd(
                      'resources',
                      sheet.resources.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                    );
                  const pct = r.max > 0 ? Math.max(0, Math.min(100, (r.current / r.max) * 100)) : 0;
                  return (
                    <div key={i} className="space-y-2 rounded-lg border border-line bg-surface-2/50 p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label="Nome do recurso"
                          value={r.label}
                          onChange={(e) => set({ label: e.target.value })}
                          placeholder="Vida, Mana…"
                          className="h-8 text-sm"
                          disabled={readOnly}
                        />
                        {!readOnly && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Remover recurso"
                            onClick={() =>
                              upd(
                                'resources',
                                sheet.resources.filter((_, j) => j !== i),
                              )
                            }
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!readOnly && (
                          <Button
                            size="icon"
                            variant="secondary"
                            aria-label={`Diminuir ${r.label}`}
                            onClick={() => set({ current: r.current - 1 })}
                          >
                            <Minus />
                          </Button>
                        )}
                        <Input
                          aria-label={`${r.label} atual`}
                          type="number"
                          value={r.current}
                          onChange={(e) => set({ current: Number(e.target.value) || 0 })}
                          className="h-9 w-20 text-center"
                          disabled={readOnly}
                        />
                        <span className="text-ink-faint">/</span>
                        <Input
                          aria-label={`${r.label} máximo`}
                          type="number"
                          min={0}
                          value={r.max}
                          onChange={(e) => set({ max: Math.max(0, Number(e.target.value) || 0) })}
                          className="h-9 w-20 text-center"
                          disabled={readOnly}
                        />
                        {!readOnly && (
                          <Button
                            size="icon"
                            variant="secondary"
                            aria-label={`Aumentar ${r.label}`}
                            onClick={() => set({ current: r.current + 1 })}
                          >
                            <Plus />
                          </Button>
                        )}
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                        <div
                          className="h-full bg-gradient-to-r from-arcane-600 to-arcane-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <SectionTitle
                action={
                  !readOnly && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => upd('attributes', [...sheet.attributes, { label: '', value: '' }])}
                    >
                      <Plus /> Atributo
                    </Button>
                  )
                }
              >
                Atributos
              </SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sheet.attributes.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      aria-label="Nome do atributo"
                      value={a.label}
                      placeholder="Atributo"
                      onChange={(e) =>
                        upd(
                          'attributes',
                          sheet.attributes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        )
                      }
                      className="h-9"
                      disabled={readOnly}
                    />
                    <Input
                      aria-label={`Valor de ${a.label}`}
                      value={a.value}
                      placeholder="Valor"
                      onChange={(e) =>
                        upd(
                          'attributes',
                          sheet.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                        )
                      }
                      className="h-9 w-24 text-center"
                      disabled={readOnly}
                    />
                    {!readOnly && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remover atributo"
                        onClick={() =>
                          upd(
                            'attributes',
                            sheet.attributes.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <section>
          <SectionTitle
            action={
              !readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => upd('inventory', [...sheet.inventory, { name: '', qty: 1, notes: '' }])}
                >
                  <Plus /> Item
                </Button>
              )
            }
          >
            Inventário
          </SectionTitle>
          {sheet.inventory.length === 0 && <p className="text-sm text-ink-faint">Mochila vazia.</p>}
          <div className="space-y-2">
            {sheet.inventory.map((it, i) => {
              const set = (patch: Partial<typeof it>) =>
                upd(
                  'inventory',
                  sheet.inventory.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_5rem_auto] gap-2 sm:grid-cols-[1fr_5rem_1fr_auto]"
                >
                  <Input
                    aria-label="Item"
                    value={it.name}
                    placeholder="Item"
                    onChange={(e) => set({ name: e.target.value })}
                    className="h-9"
                    disabled={readOnly}
                  />
                  <Input
                    aria-label="Quantidade"
                    type="number"
                    min={0}
                    value={it.qty}
                    onChange={(e) => set({ qty: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-9 text-center"
                    disabled={readOnly}
                  />
                  <Input
                    aria-label="Observações"
                    value={it.notes}
                    placeholder="Observações"
                    onChange={(e) => set({ notes: e.target.value })}
                    className="hidden h-9 sm:block"
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remover item"
                      onClick={() =>
                        upd(
                          'inventory',
                          sheet.inventory.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {extra}
        <Field label="Anotações e história" htmlFor="ch-notes">
          <Textarea
            id="ch-notes"
            value={sheet.notes}
            onChange={(e) => upd('notes', e.target.value)}
            maxLength={8000}
            className="min-h-32"
            disabled={readOnly}
          />
        </Field>

        {error && <Alert tone="error">{error}</Alert>}
        {/* No celular, os botões ficam presos embaixo para não precisar rolar a ficha toda. */}
        <div className="flex flex-wrap justify-between gap-2 max-lg:sticky max-lg:bottom-0 max-lg:z-20 max-lg:-mx-6 max-lg:border-t max-lg:border-line max-lg:bg-surface/95 max-lg:px-6 max-lg:py-3 max-lg:backdrop-blur">
          <div>
            {(initial?.canEdit || persist?.remove) && (
              <Button variant="danger" onClick={remove}>
                {deleteLabel ?? 'Excluir'}
              </Button>
            )}
            {initial && campaignId && !persist && (
              <SaveToLibrary campaignId={campaignId} body={{ characterId: initial.id }} />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onDone}>
              {readOnly ? 'Fechar' : 'Cancelar'}
            </Button>
            {!readOnly && (
              <Button onClick={save} loading={saving}>
                Salvar ficha
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Bolinha com o retrato (ou a cor e as iniciais, se não houver imagem). */
export function Avatar({
  campaignId,
  asset,
  color,
  name,
  size = 'size-9',
}: {
  campaignId: string;
  asset: string | null;
  color: string;
  name: string;
  size?: string;
}) {
  const url = useAssetUrl(campaignId, asset);
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-black/40 text-xs font-bold text-white',
        size,
      )}
      style={{ background: color }}
      aria-hidden
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase())
          .join('')
      )}
    </span>
  );
}

export function CharactersBoard({
  campaignId,
  characters,
  canCreate,
  definition = null,
}: {
  campaignId: string;
  characters: CharacterDto[];
  canCreate: boolean;
  definition?: SystemDefinition | null;
}) {
  const [editing, setEditing] = useState<CharacterDto | 'new' | null>(null);
  if (editing) {
    return (
      <SheetEditor
        key={editing === 'new' ? 'new' : `${editing.id}-${editing.version}`}
        initial={editing === 'new' ? null : editing}
        campaignId={campaignId}
        onDone={() => setEditing(null)}
        def={definition}
      />
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Ficha livre: crie os atributos e recursos que o seu sistema usa. Fichas automáticas por sistema
          chegam com a importação de livros.
        </p>
        {canCreate && (
          <Button onClick={() => setEditing('new')}>
            <Plus /> Novo personagem
          </Button>
        )}
      </div>
      {characters.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-muted">Nenhum personagem ainda.</Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setEditing(c)}
                data-testid="character-card"
                className="group block h-full w-full rounded-xl border border-line bg-surface/80 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-arcane-500/50"
              >
                <div className="mb-3 flex items-center gap-3">
                  <Avatar campaignId={campaignId} asset={c.portraitAsset} color={c.color} name={c.name} />
                  <div className="min-w-0">
                    <p className="truncate font-display tracking-wide text-ink">{c.name}</p>
                    <p className="truncate text-xs text-ink-faint">
                      {c.concept || 'Sem conceito'} · {c.ownerName}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {(definition && c.sheet.system
                    ? safeCompute(definition, normalizeValues(definition, c.sheet.system)).resources.map(
                        (r) => ({ label: r.abbr, current: r.current, max: r.max }),
                      )
                    : c.sheet.resources
                  )
                    .slice(0, 3)
                    .map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-16 truncate text-ink-muted">{r.label}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                          <div
                            className={cn('h-full', r.current <= r.max / 4 ? 'bg-blood' : 'bg-arcane-500')}
                            style={{
                              width: `${r.max ? Math.max(0, Math.min(100, (r.current / r.max) * 100)) : 0}%`,
                            }}
                          />
                        </div>
                        <span className="w-14 text-right tabular-nums text-ink">
                          {r.current}/{r.max}
                        </span>
                      </div>
                    ))}
                </div>
                <p className="mt-3 text-xs text-arcane-300 opacity-0 transition-opacity group-hover:opacity-100">
                  {c.canEdit ? 'Abrir e editar' : 'Ver ficha'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
