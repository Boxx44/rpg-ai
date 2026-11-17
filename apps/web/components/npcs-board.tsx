'use client';

import type { NpcDetails, NpcDto } from '@rpg-ai/shared';
import { Alert, Badge, Button, Card, CardContent, Field, Input, Textarea } from '@rpg-ai/ui';
import { Eye, EyeOff, Lock, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';

const EMPTY_DETAILS: NpcDetails = {
  personality: '',
  backstory: '',
  motivations: '',
  secrets: '',
  notes: '',
  stats: [],
};

function NpcEditor({
  campaignId,
  initial,
  onDone,
}: {
  campaignId: string;
  initial: NpcDto | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    name: initial?.name ?? '',
    appearance: initial?.appearance ?? '',
    publicDescription: initial?.publicDescription ?? '',
    color: initial?.color ?? '#c9a24b',
    revealed: initial?.revealed ?? false,
  });
  const [d, setD] = useState<NpcDetails>(initial?.details ?? EMPTY_DETAILS);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  const setDet = (patch: Partial<NpcDetails>) => setD((s) => ({ ...s, ...patch }));

  async function save() {
    if (!f.name.trim()) return setError('Dê um nome ao NPC.');
    setSaving(true);
    setError(undefined);
    try {
      const body = json({ ...f, details: { ...d, stats: d.stats.filter((s) => s.label.trim()) } });
      const token = await accessToken();
      if (initial) await api(`/campaigns/${campaignId}/npcs/${initial.id}`, token, { method: 'PATCH', body });
      else await api(`/campaigns/${campaignId}/npcs`, token, { method: 'POST', body });
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
    await api(`/campaigns/${campaignId}/npcs/${initial.id}`, await accessToken(), { method: 'DELETE' });
    router.refresh();
    onDone();
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6" data-testid="npc-editor">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Nome" htmlFor="npc-name">
            <Input
              id="npc-name"
              value={f.name}
              onChange={(e) => set({ name: e.target.value })}
              maxLength={80}
            />
          </Field>
          <Field label="Cor" htmlFor="npc-color">
            <Input
              id="npc-color"
              type="color"
              value={f.color}
              onChange={(e) => set({ color: e.target.value })}
              className="w-16 p-1"
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface-2/50 p-3">
          <input
            type="checkbox"
            checked={f.revealed}
            onChange={(e) => set({ revealed: e.target.checked })}
            className="size-4 accent-[var(--color-gold)]"
          />
          <span className="text-sm">
            <b>Revelado aos jogadores</b>
            <span className="block text-xs text-ink-muted">
              Jogadores veem nome, aparência e descrição pública. Nunca veem a parte secreta.
            </span>
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Aparência" htmlFor="npc-app">
            <Textarea
              id="npc-app"
              value={f.appearance}
              onChange={(e) => set({ appearance: e.target.value })}
              maxLength={2000}
            />
          </Field>
          <Field label="O que os jogadores sabem" htmlFor="npc-pub">
            <Textarea
              id="npc-pub"
              value={f.publicDescription}
              onChange={(e) => set({ publicDescription: e.target.value })}
              maxLength={2000}
            />
          </Field>
        </div>

        <div className="space-y-4 rounded-xl border border-gold/25 bg-gold/[0.03] p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">
            <Lock className="size-3.5" /> Só o mestre vê
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Personalidade" htmlFor="npc-pers">
              <Textarea
                id="npc-pers"
                value={d.personality}
                onChange={(e) => setDet({ personality: e.target.value })}
                maxLength={4000}
              />
            </Field>
            <Field label="Motivações e objetivos" htmlFor="npc-mot">
              <Textarea
                id="npc-mot"
                value={d.motivations}
                onChange={(e) => setDet({ motivations: e.target.value })}
                maxLength={4000}
              />
            </Field>
            <Field label="História" htmlFor="npc-back">
              <Textarea
                id="npc-back"
                value={d.backstory}
                onChange={(e) => setDet({ backstory: e.target.value })}
                maxLength={8000}
              />
            </Field>
            <Field label="Segredos" htmlFor="npc-sec">
              <Textarea
                id="npc-sec"
                value={d.secrets}
                onChange={(e) => setDet({ secrets: e.target.value })}
                maxLength={4000}
              />
            </Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Estatísticas
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDet({ stats: [...d.stats, { label: '', value: '' }] })}
              >
                <Plus /> Estatística
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {d.stats.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    aria-label="Estatística"
                    value={s.label}
                    placeholder="Ex.: Vida"
                    onChange={(e) =>
                      setDet({
                        stats: d.stats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      })
                    }
                    className="h-9"
                  />
                  <Input
                    aria-label={`Valor de ${s.label}`}
                    value={s.value}
                    placeholder="Valor"
                    onChange={(e) =>
                      setDet({
                        stats: d.stats.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                      })
                    }
                    className="h-9 w-24 text-center"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover"
                    onClick={() => setDet({ stats: d.stats.filter((_, j) => j !== i) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <Field label="Anotações" htmlFor="npc-notes">
            <Textarea
              id="npc-notes"
              value={d.notes}
              onChange={(e) => setDet({ notes: e.target.value })}
              maxLength={8000}
            />
          </Field>
        </div>

        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            {initial && (
              <Button variant="danger" onClick={remove}>
                Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              Salvar NPC
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function NpcsBoard({
  campaignId,
  npcs,
  manager,
}: {
  campaignId: string;
  npcs: NpcDto[];
  manager: boolean;
}) {
  const [editing, setEditing] = useState<NpcDto | 'new' | null>(null);
  if (editing && manager)
    return (
      <NpcEditor
        key={editing === 'new' ? 'new' : editing.id}
        campaignId={campaignId}
        initial={editing === 'new' ? null : editing}
        onDone={() => setEditing(null)}
      />
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {manager
            ? 'Crie personagens do mundo. Revele quando os jogadores os conhecerem.'
            : 'Personagens do mundo que vocês já conheceram.'}
        </p>
        {manager && (
          <Button onClick={() => setEditing('new')}>
            <Plus /> Novo NPC
          </Button>
        )}
      </div>
      {npcs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-muted">
          {manager ? 'Nenhum NPC criado.' : 'Ninguém foi apresentado ainda.'}
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {npcs.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                disabled={!manager}
                onClick={() => setEditing(n)}
                data-testid="npc-card"
                className="block h-full w-full rounded-xl border border-line bg-surface/80 p-5 text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-gold/40"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="size-9 shrink-0 rounded-full border-2 border-black/40"
                    style={{ background: n.color }}
                  />
                  <p className="min-w-0 flex-1 truncate font-display tracking-wide">{n.name}</p>
                  {manager && (
                    <Badge tone={n.revealed ? 'arcane' : 'neutral'}>
                      {n.revealed ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                      {n.revealed ? 'Revelado' : 'Oculto'}
                    </Badge>
                  )}
                </div>
                {n.appearance && <p className="line-clamp-2 text-sm text-ink-muted">{n.appearance}</p>}
                {n.publicDescription && (
                  <p className="mt-2 line-clamp-3 text-sm text-ink">{n.publicDescription}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
