'use client';

import { SYSTEM_TEMPLATES, type SystemDefinition } from '@rpg-ai/rules-engine';
import {
  type CampaignDto,
  canManageCampaign,
  type CharacterSheet,
  type LibrarySheetDto,
  type NpcDto,
} from '@rpg-ai/shared';
import { Alert, Badge, Button, Card, cn, Select } from '@rpg-ai/ui';
import { BookUser, Plus, Send, UserRound, Users, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';
import { SheetEditor } from './characters-board';
import { GuidedCreator } from './guided-creator';
import { NpcEditor, type NpcPayload } from './npcs-board';
import { normalizeValues, safeCompute } from './system-sheet';

type Kind = 'character' | 'npc';
type Editing =
  | { mode: 'pick'; kind: Kind }
  | { mode: 'guided'; kind: Kind; template: string }
  | {
      mode: 'edit';
      kind: Kind;
      template: string | null;
      sheet: LibrarySheetDto | null;
      seed?: { name: string; concept: string; sheet: CharacterSheet };
    };

const EMPTY: CharacterSheet = { attributes: [], resources: [], inventory: [], notes: '' };
const TEMPLATES = Object.values(SYSTEM_TEMPLATES);

async function call<T>(path: string, init?: RequestInit) {
  return api<T>(path, await accessToken(), init);
}

function SendToCampaign({ sheet, campaigns }: { sheet: LibrarySheetDto; campaigns: CampaignDto[] }) {
  const router = useRouter();
  const options = campaigns.filter((c) =>
    sheet.kind === 'npc' ? canManageCampaign(c.myRole) : c.myRole !== 'spectator',
  );
  const [cid, setCid] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string }>();
  if (!options.length)
    return <p className="text-xs text-ink-faint">Nenhuma campanha onde você pode usar esta ficha.</p>;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select
          aria-label={`Campanha para ${sheet.name}`}
          value={cid}
          onChange={(e) => setCid(e.target.value)}
          className="h-9 min-w-0 flex-1"
        >
          <option value="">Levar para a campanha…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.system ? ` (${c.system.name})` : ''}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          disabled={!cid || busy}
          loading={busy}
          aria-label={`Levar ${sheet.name}`}
          onClick={async () => {
            setBusy(true);
            setMsg(undefined);
            try {
              await call(`/library/${sheet.id}/use`, { method: 'POST', body: json({ campaignId: cid }) });
              setMsg({ tone: 'success', text: 'Pronto! Uma cópia entrou na campanha.' });
              router.refresh();
            } catch (e) {
              setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Erro' });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Send />
        </Button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

/** Biblioteca: fichas de personagens e NPCs que são suas, fora de qualquer campanha. */
export function LibraryBoard({ sheets, campaigns }: { sheets: LibrarySheetDto[]; campaigns: CampaignDto[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Kind>('character');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [template, setTemplate] = useState<string>(TEMPLATES[0]?.id ?? '');
  const defOf = (t: string | null): SystemDefinition | null => (t ? (SYSTEM_TEMPLATES[t] ?? null) : null);
  const done = () => {
    setEditing(null);
    router.refresh();
  };

  if (editing?.mode === 'guided') {
    const def = defOf(editing.template)!;
    return (
      <GuidedCreator
        def={def}
        onCancel={() => setEditing(null)}
        onFinish={(r) =>
          setEditing({
            mode: 'edit',
            kind: editing.kind,
            template: editing.template,
            sheet: null,
            seed: {
              name: r.name,
              concept: r.concept,
              sheet: { ...EMPTY, system: r.values } as CharacterSheet,
            },
          })
        }
      />
    );
  }

  if (editing?.mode === 'edit') {
    const def = defOf(editing.template);
    const s = editing.sheet;
    const base = { kind: editing.kind, systemTemplate: editing.template };
    const save = async (body: object) => {
      if (s) await call(`/library/${s.id}`, { method: 'PATCH', body: json(body) });
      else await call('/library', { method: 'POST', body: json({ ...base, ...body }) });
    };
    const remove = s ? async () => void (await call(`/library/${s.id}`, { method: 'DELETE' })) : undefined;
    if (editing.kind === 'character')
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Ficha da biblioteca{def ? ` · ${def.name}` : ' · ficha livre'}. Ela fica guardada aqui e você leva
            cópias para as campanhas.
          </p>
          <SheetEditor
            initial={null}
            def={def}
            onDone={done}
            seed={s ? { name: s.name, concept: s.concept, color: s.color, sheet: s.sheet } : editing.seed}
            persist={{ save: (d) => save(d), remove }}
            nameLabel="Nome do personagem"
          />
        </div>
      );
    const asNpc: NpcDto | null = s
      ? {
          id: s.id,
          campaignId: '',
          name: s.name,
          appearance: s.npc.appearance,
          publicDescription: s.npc.publicDescription,
          color: s.color,
          revealed: false,
          portraitAsset: null,
          details: { ...s.npc.details, sheet: s.sheet },
          updatedAt: s.updatedAt,
        }
      : editing.seed
        ? {
            id: '',
            campaignId: '',
            name: editing.seed.name,
            appearance: '',
            publicDescription: editing.seed.concept,
            color: '#c9a24b',
            revealed: false,
            portraitAsset: null,
            details: {
              personality: '',
              backstory: '',
              motivations: '',
              secrets: '',
              notes: '',
              stats: [],
              sheet: editing.seed.sheet,
            },
            updatedAt: '',
          }
        : null;
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          NPC da biblioteca{def ? ` · ${def.name}` : ' · ficha livre'}.
        </p>
        <NpcEditor
          initial={asNpc}
          def={def}
          onDone={done}
          hideReveal
          persist={{
            save: (p: NpcPayload) => {
              const { sheet, ...details } = p.details;
              return save({
                name: p.name,
                color: p.color,
                sheet,
                npc: { appearance: p.appearance, publicDescription: p.publicDescription, details },
              });
            },
            remove,
          }}
        />
      </div>
    );
  }

  const list = sheets.filter((s) => s.kind === tab);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold/70">Biblioteca</p>
        <h1 className="font-display text-4xl tracking-wide">Fichas</h1>
        <p className="mt-2 max-w-2xl text-ink-muted">
          Crie personagens e NPCs com calma, fora das campanhas. Quando quiser, leve uma cópia para qualquer
          campanha — a ficha original continua aqui.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface-2/50 p-1" role="tablist">
          {(
            [
              ['character', 'Personagens', UserRound],
              ['npc', 'NPCs', Users],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm',
                tab === k ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              <Icon className="size-4" /> {label} ({sheets.filter((s) => s.kind === k).length})
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            aria-label="Sistema da nova ficha"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="h-9 w-52"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="">Ficha livre (sem sistema)</option>
          </Select>
          {template && defOf(template)?.creation && (
            <Button onClick={() => setEditing({ mode: 'guided', kind: tab, template })}>
              <Wand2 /> Criação guiada
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setEditing({ mode: 'edit', kind: tab, template: template || null, sheet: null })}
          >
            <Plus /> {tab === 'npc' ? 'Novo NPC' : 'Ficha em branco'}
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-muted">
          <BookUser className="mx-auto mb-3 size-8 text-gold/60" />
          {tab === 'npc'
            ? 'Nenhum NPC guardado. Crie aqui ou guarde um NPC de campanha.'
            : 'Nenhuma ficha ainda. Experimente a criação guiada: ela explica cada passo.'}
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => {
            const def = defOf(s.systemTemplate);
            const res =
              def && s.sheet.system ? safeCompute(def, normalizeValues(def, s.sheet.system)).resources : [];
            return (
              <li
                key={s.id}
                className="flex flex-col gap-3 rounded-xl border border-line bg-surface/80 p-5"
                data-testid="library-card"
              >
                <button
                  type="button"
                  className="text-left"
                  onClick={() =>
                    setEditing({ mode: 'edit', kind: s.kind, template: s.systemTemplate, sheet: s })
                  }
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="size-9 shrink-0 rounded-full border-2 border-black/40"
                      style={{ background: s.color }}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-display tracking-wide">{s.name}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {s.concept || s.npc.publicDescription || 'Sem conceito'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>{def ? def.name : 'Ficha livre'}</Badge>
                    {res.map((r) => (
                      <Badge key={r.key} tone="neutral">
                        {r.abbr} {r.max}
                      </Badge>
                    ))}
                  </div>
                </button>
                <div className="mt-auto">
                  <SendToCampaign sheet={s} campaigns={campaigns} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
