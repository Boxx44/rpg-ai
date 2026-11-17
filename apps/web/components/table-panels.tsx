'use client';

import type { SystemDefinition } from '@rpg-ai/rules-engine';
import type { CampaignSystemDto, CharacterDto, DocumentPageDto, RuleSearchHitDto } from '@rpg-ai/shared';
import { Alert, Button, cn, Input, Select } from '@rpg-ai/ui';
import { ArrowLeft, ChevronLeft, ChevronRight, Dices, Minus, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';
import { QuickReference } from './system-panels';
import { normalizeValues, safeCompute } from './system-sheet';

/** Destaca os trechos marcados com « » pela busca. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('«') ? (
          <mark key={i} className="rounded bg-gold/20 px-0.5 text-gold-bright">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function RulesPanel({
  campaignId,
  system,
  manager,
}: {
  campaignId: string;
  system: CampaignSystemDto | null;
  manager: boolean;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<RuleSearchHitDto[] | null>(null);
  const [page, setPage] = useState<DocumentPageDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const def = system?.definition as SystemDefinition | undefined;

  if (!system)
    return (
      <div className="space-y-3 p-4 text-sm text-ink-muted">
        <p>Esta campanha ainda não tem um sistema de regras.</p>
        {manager && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/campaigns/${campaignId}/manage`}>Escolher sistema</Link>
          </Button>
        )}
      </div>
    );

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(undefined);
    setPage(null);
    try {
      setHits(
        await api<RuleSearchHitDto[]>(
          `/campaigns/${campaignId}/rules?q=${encodeURIComponent(q.trim())}&limit=12`,
          await accessToken(),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na busca');
    } finally {
      setBusy(false);
    }
  }

  async function open(documentId: string, n: number) {
    setBusy(true);
    try {
      setPage(
        await api<DocumentPageDto>(
          `/systems/${system!.systemId}/documents/${documentId}/pages/${n}`,
          await accessToken(),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={search} className="flex gap-2 border-b border-line p-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar no livro (ex.: furtividade)"
          aria-label="Buscar regra"
          data-testid="rules-search"
        />
        <Button type="submit" size="icon" loading={busy} aria-label="Buscar" disabled={!system.hasBook}>
          {!busy && <Search />}
        </Button>
      </form>
      <div className="flex-1 overflow-y-auto p-3" data-testid="rules-results">
        {!system.hasBook && (
          <Alert tone="warning" title="Nenhum livro enviado">
            {manager ? (
              <>
                Envie o PDF na{' '}
                <Link className="underline" href={`/systems/${system.systemId}`}>
                  página do sistema
                </Link>{' '}
                para pesquisar regras aqui.
              </>
            ) : (
              'O mestre ainda não enviou o livro deste sistema.'
            )}
          </Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {page ? (
          <article className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPage(null)}>
                <ArrowLeft /> Resultados
              </Button>
              <div className="flex items-center gap-1 text-xs text-ink-muted">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Página anterior"
                  disabled={page.page <= 1}
                  onClick={() => open(page.documentId, page.page - 1)}
                >
                  <ChevronLeft />
                </Button>
                PDF p. {page.page}/{page.pageCount}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Próxima página"
                  disabled={page.page >= page.pageCount}
                  onClick={() => open(page.documentId, page.page + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink" data-testid="rules-page">
              {page.text || 'Esta página não tem texto (ilustração).'}
            </p>
          </article>
        ) : hits ? (
          hits.length ? (
            <ul className="space-y-2">
              {hits.map((h) => (
                <li key={`${h.documentId}-${h.page}`}>
                  <button
                    type="button"
                    onClick={() => open(h.documentId, h.page)}
                    className="w-full rounded-lg border border-line bg-surface-2/40 p-3 text-left transition-colors hover:border-gold/40"
                    data-testid="rules-hit"
                  >
                    <p className="mb-1 text-xs text-gold/80">PDF p. {h.page}</p>
                    <p className="text-sm text-ink-muted">
                      <Highlighted text={h.snippet} />
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-faint">
              Nada encontrado no livro para “{q}”. Tente outras palavras.
            </p>
          )
        ) : (
          def && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink-muted">
                Referência rápida — {def.name}
              </p>
              <QuickReference definition={def} />
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** Ficha rápida na mesa: recursos com +/− e rolagens com um clique. */
export function QuickSheetPanel({
  campaignId,
  system,
  characters,
  myId,
  manager,
  onUpdated,
}: {
  campaignId: string;
  system: CampaignSystemDto | null;
  characters: CharacterDto[];
  myId: string;
  manager: boolean;
  onUpdated: (c: CharacterDto) => void;
}) {
  const mine = characters.filter((c) => c.canEdit);
  const [selId, setSelId] = useState<string | undefined>(
    mine.find((c) => c.ownerId === myId)?.id ?? mine[0]?.id,
  );
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [notes, setNotes] = useState<string[]>([]);
  const def = system?.definition as SystemDefinition | undefined;
  const ch = mine.find((c) => c.id === selId);

  if (!def)
    return (
      <p className="p-4 text-sm text-ink-muted">
        Escolha um sistema de regras para a campanha para ver a ficha aqui. Você ainda pode rolar dados pela
        crônica.
      </p>
    );
  if (!ch)
    return (
      <div className="space-y-3 p-4 text-sm text-ink-muted">
        <p>
          {manager ? 'Nenhum personagem na mesa ainda.' : 'Você ainda não tem um personagem nesta campanha.'}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={`/campaigns/${campaignId}/characters`}>Criar personagem</Link>
        </Button>
      </div>
    );

  const values = normalizeValues(def, ch.sheet.system);
  const computed = safeCompute(def, values);

  async function check(body: object, key: string) {
    setBusy(key);
    setError(undefined);
    try {
      const r = await api<{ notes: string[] }>(
        `/campaigns/${campaignId}/characters/${ch!.id}/check`,
        await accessToken(),
        { method: 'POST', body: json(body) },
      );
      setNotes(r.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setBusy(null);
    }
  }

  async function adjust(key: string, current: number) {
    setBusy(`res-${key}`);
    setError(undefined);
    try {
      const updated = await api<CharacterDto>(
        `/campaigns/${campaignId}/characters/${ch!.id}`,
        await accessToken(),
        {
          method: 'PATCH',
          body: json({
            sheet: { ...ch!.sheet, system: { ...values, current: { ...values.current, [key]: current } } },
            version: ch!.version,
          }),
        },
      );
      onUpdated(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setBusy(null);
    }
  }

  const skills = def.skills.filter(
    (s) => showAll || (values.skills[s.key] && values.skills[s.key] !== def.grades[0]?.key),
  );
  return (
    <div className="h-full space-y-4 overflow-y-auto p-3" data-testid="quick-sheet">
      {mine.length > 1 && (
        <Select
          aria-label="Personagem"
          value={ch.id}
          onChange={(e) => setSelId(e.target.value)}
          className="h-9"
        >
          {mine.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.ownerName})
            </option>
          ))}
        </Select>
      )}
      <div className="flex items-center gap-3">
        <span className="size-8 rounded-full border-2 border-black/40" style={{ background: ch.color }} />
        <div className="min-w-0">
          <p className="truncate font-display tracking-wide">{ch.name}</p>
          <p className="text-xs text-ink-faint">
            {def.fields
              .filter((f) => f.type === 'select' && values.fields[f.key])
              .map((f) => f.options?.find((o) => o.value === String(values.fields[f.key]))?.label)
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {computed.resources.map((r) => (
          <div key={r.key} className="flex items-center gap-2" data-testid={`quick-${r.key}`}>
            <span className="w-9 text-xs font-semibold text-ink-muted">{r.abbr}</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Diminuir ${r.abbr}`}
              disabled={!!busy}
              onClick={() => adjust(r.key, r.current - 1)}
            >
              <Minus />
            </Button>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
              <div
                className={cn(
                  'h-full',
                  r.key === 'san' ? 'bg-sky-500' : r.key === 'pe' ? 'bg-gold' : 'bg-blood',
                )}
                style={{ width: `${r.max ? Math.max(0, Math.min(100, (r.current / r.max) * 100)) : 0}%` }}
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Aumentar ${r.abbr}`}
              disabled={!!busy}
              onClick={() => adjust(r.key, r.current + 1)}
            >
              <Plus />
            </Button>
            <span className="w-14 text-right text-sm tabular-nums">
              {r.current}/{r.max}
            </span>
          </div>
        ))}
        <p className="text-xs text-ink-muted">
          {computed.derived.map((d) => `${d.label}: ${d.value}${d.suffix}`).join(' · ')}
        </p>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {def.attributes.map((a) => (
          <button
            key={a.key}
            type="button"
            disabled={!!busy}
            onClick={() => check({ attribute: a.key }, a.key)}
            className="flex flex-col items-center rounded-lg border border-gold/30 bg-surface-2 py-1.5 transition-colors hover:border-gold disabled:opacity-50"
            aria-label={`Rolar ${a.label}`}
          >
            <span className="text-[10px] tracking-widest text-gold/80">{a.abbr}</span>
            <span className="font-display text-lg">{values.attributes[a.key]}</span>
          </button>
        ))}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Perícias</span>
          <button
            type="button"
            className="text-xs text-arcane-300 hover:text-arcane-200"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Só treinadas' : 'Mostrar todas'}
          </button>
        </div>
        {skills.length === 0 && (
          <p className="text-xs text-ink-faint">Nenhuma perícia treinada. Clique em “Mostrar todas”.</p>
        )}
        <div className="grid grid-cols-2 gap-1">
          {skills.map((s) => {
            const g = def.grades.find((x) => x.key === (values.skills[s.key] ?? def.grades[0]?.key));
            return (
              <button
                key={s.key}
                type="button"
                disabled={!!busy}
                onClick={() => check({ skill: s.key }, s.key)}
                className="flex items-center justify-between gap-1 rounded-md border border-line bg-surface-2/60 px-2 py-1.5 text-left text-xs transition-colors hover:border-gold/50 disabled:opacity-50"
                aria-label={`Rolar ${s.label}`}
              >
                <span className="flex items-center gap-1 truncate">
                  <Dices
                    className={cn('size-3 shrink-0', busy === s.key ? 'text-gold-bright' : 'text-ink-faint')}
                  />{' '}
                  {s.label}
                </span>
                <span className="text-gold-bright">{g?.bonus ? `+${g.bonus}` : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
      {notes.map((n) => (
        <Alert key={n} tone="warning">
          {n}
        </Alert>
      ))}
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-xs text-ink-faint">O resultado de cada teste aparece na crônica para todos.</p>
    </div>
  );
}
