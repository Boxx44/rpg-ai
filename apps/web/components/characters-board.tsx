'use client';

import type { CharacterDto, CharacterSheet } from '@rpg-ai/shared';
import { Alert, Button, Card, CardContent, cn, Field, Input, Textarea } from '@rpg-ai/ui';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';

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

function SheetEditor({
  initial,
  campaignId,
  onDone,
}: {
  initial: CharacterDto | null;
  campaignId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const readOnly = initial ? !initial.canEdit : false;
  const [name, setName] = useState(initial?.name ?? '');
  const [concept, setConcept] = useState(initial?.concept ?? '');
  const [color, setColor] = useState(initial?.color ?? '#7c4ff0');
  const [sheet, setSheet] = useState<CharacterSheet>(initial?.sheet ?? EMPTY_SHEET);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

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
    };
    try {
      const token = await accessToken();
      if (initial)
        await api(`/campaigns/${campaignId}/characters/${initial.id}`, token, {
          method: 'PATCH',
          body: json({ name, concept, color, sheet: clean, version: initial.version }),
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
    if (!initial || !confirm(`Excluir ${initial.name}?`)) return;
    await api(`/campaigns/${campaignId}/characters/${initial.id}`, await accessToken(), { method: 'DELETE' });
    router.refresh();
    onDone();
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6" data-testid="character-editor">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Nome" htmlFor="ch-name">
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

        <section>
          <SectionTitle
            action={
              !readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => upd('resources', [...sheet.resources, { label: '', current: 0, max: 0 }])}
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
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            {initial?.canEdit && (
              <Button variant="danger" onClick={remove}>
                Excluir
              </Button>
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

export function CharactersBoard({
  campaignId,
  characters,
  canCreate,
}: {
  campaignId: string;
  characters: CharacterDto[];
  canCreate: boolean;
}) {
  const [editing, setEditing] = useState<CharacterDto | 'new' | null>(null);
  if (editing) {
    return (
      <SheetEditor
        key={editing === 'new' ? 'new' : `${editing.id}-${editing.version}`}
        initial={editing === 'new' ? null : editing}
        campaignId={campaignId}
        onDone={() => setEditing(null)}
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
                  <span
                    className="size-9 shrink-0 rounded-full border-2 border-black/40"
                    style={{ background: c.color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-display tracking-wide text-ink">{c.name}</p>
                    <p className="truncate text-xs text-ink-faint">
                      {c.concept || 'Sem conceito'} · {c.ownerName}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {c.sheet.resources.slice(0, 3).map((r, i) => (
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
