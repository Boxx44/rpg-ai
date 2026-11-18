'use client';

import type { SheetWeapon, SystemDefinition, SystemValues } from '@rpg-ai/rules-engine';
import { Alert, Button, cn, Input, Select } from '@rpg-ai/ui';
import { BookOpen, Crosshair, Sparkles, Swords, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

type Set = (patch: Partial<SystemValues>) => void;
export type RitualForm = 'basic' | 'discente' | 'verdadeiro';

function Title({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">{children}</h3>;
}

function PageLink({ page, onOpenPage }: { page?: number; onOpenPage?: (n: number) => void }) {
  if (!page) return null;
  return onOpenPage ? (
    <button
      type="button"
      onClick={() => onOpenPage(page)}
      className="inline-flex items-center gap-1 text-xs text-arcane-300 hover:text-arcane-200"
      title="Abrir a página no livro"
    >
      <BookOpen className="size-3" /> p. {page}
    </button>
  ) : (
    <span className="text-xs text-ink-faint">p. {page}</span>
  );
}

const ELEMENT_STYLE: Record<string, string> = {
  conhecimento: 'border-amber-400/50 text-amber-200',
  energia: 'border-violet-400/50 text-violet-200',
  morte: 'border-zinc-400/50 text-zinc-200',
  sangue: 'border-rose-500/50 text-rose-200',
  medo: 'border-white/50 text-white',
};
const ELEMENT_LABEL: Record<string, string> = {
  conhecimento: 'Conhecimento',
  energia: 'Energia',
  morte: 'Morte',
  sangue: 'Sangue',
  medo: 'Medo',
  geral: 'Geral',
};

export function critLabel(w: Pick<SheetWeapon, 'critRange' | 'critMult'>) {
  return w.critRange < 20 ? `${w.critRange}/x${w.critMult}` : `x${w.critMult}`;
}

/* ───────────────────────── Armas, proteções e carga ───────────────────────── */

export function GearSection({
  def,
  value,
  set,
  readOnly,
  usedSpaces,
  maxSpaces,
  onAttack,
  busy,
  onOpenPage,
}: {
  def: SystemDefinition;
  value: SystemValues;
  set: Set;
  readOnly?: boolean;
  usedSpaces?: number;
  maxSpaces?: number;
  onAttack?: (index: number, mode?: 'melee' | 'ranged' | 'thrown') => void;
  busy?: string | null;
  onOpenPage?: (n: number) => void;
}) {
  const [custom, setCustom] = useState(false);
  const [c, setC] = useState({
    name: '',
    damage: '1d6',
    critRange: '20',
    critMult: '2',
    kind: 'melee',
    damageType: '',
  });
  if (!def.weapons.length && !def.protections.length) return null;
  const groups = ['simples', 'tatica', 'pesada'];
  const groupLabel: Record<string, string> = {
    simples: 'Armas simples',
    tatica: 'Armas táticas',
    pesada: 'Armas pesadas',
  };
  const over = maxSpaces !== undefined && usedSpaces !== undefined && usedSpaces > maxSpaces;
  return (
    <section data-testid="gear-section">
      <Title>Armas e equipamento</Title>
      {value.weapons.length === 0 && <p className="mb-2 text-sm text-ink-faint">Nenhuma arma.</p>}
      <ul className="space-y-1.5">
        {value.weapons.map((w, i) => {
          const book = w.ref ? def.weapons.find((x) => x.key === w.ref) : undefined;
          const throwable = w.kind === 'melee' && !!book?.range;
          return (
            <li
              key={`${w.name}-${i}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-sm"
              data-testid="weapon-row"
            >
              <Swords className="size-4 text-gold" />
              <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
              <span className="tabular-nums text-ink-muted" title="Dano">
                {w.damage}
              </span>
              <span className="text-xs text-ink-faint" title="Crítico">
                {critLabel(w)}
              </span>
              <span className="text-xs text-ink-faint">{w.damageType}</span>
              <span className="text-xs text-ink-faint">{w.spaces} esp.</span>
              <PageLink page={book?.page} onOpenPage={onOpenPage} />
              {onAttack && (
                <>
                  <Button
                    size="sm"
                    loading={busy === `atk-${i}`}
                    disabled={!!busy}
                    onClick={() => onAttack(i)}
                    aria-label={`Atacar com ${w.name}`}
                  >
                    <Crosshair /> Atacar
                  </Button>
                  {throwable && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() => onAttack(i, 'thrown')}
                      aria-label={`Arremessar ${w.name}`}
                    >
                      Arremessar
                    </Button>
                  )}
                </>
              )}
              {!readOnly && !onAttack && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover ${w.name}`}
                  onClick={() => set({ weapons: value.weapons.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          );
        })}
        {value.protections.map((p, i) => (
          <li
            key={`p-${p.name}-${i}`}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-sm"
          >
            <span className="flex-1 font-medium">{p.name}</span>
            <span className="text-ink-muted">+{p.defense} Defesa</span>
            <span className="text-xs text-ink-faint">{p.spaces} esp.</span>
            {!readOnly && !onAttack && (
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remover ${p.name}`}
                onClick={() => set({ protections: value.protections.filter((_, j) => j !== i) })}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && !onAttack && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            aria-label="Adicionar arma"
            value=""
            className="h-9 w-56"
            onChange={(e) => {
              if (e.target.value === '__custom') return setCustom(true);
              const b = def.weapons.find((x) => x.key === e.target.value);
              if (b)
                set({
                  weapons: [
                    ...value.weapons,
                    {
                      ref: b.key,
                      name: b.name,
                      kind: b.kind,
                      ...(b.ranged ? { ranged: b.ranged } : {}),
                      damage: b.damage,
                      critRange: b.critRange,
                      critMult: b.critMult,
                      damageType: b.damageType,
                      spaces: b.spaces,
                      attackBonus: 0,
                    },
                  ],
                });
            }}
          >
            <option value="">+ Arma do livro</option>
            {groups.map((g) => (
              <optgroup key={g} label={groupLabel[g]}>
                {def.weapons
                  .filter((w) => w.proficiency === g)
                  .map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.name} — {w.damage} {critLabel(w)}
                    </option>
                  ))}
              </optgroup>
            ))}
            <option value="__custom">Arma própria…</option>
          </Select>
          {def.protections.length > 0 && (
            <Select
              aria-label="Adicionar proteção"
              value=""
              className="h-9 w-48"
              onChange={(e) => {
                const b = def.protections.find((x) => x.key === e.target.value);
                if (b)
                  set({
                    protections: [
                      ...value.protections,
                      { ref: b.key, name: b.name, defense: b.defense, spaces: b.spaces },
                    ],
                  });
              }}
            >
              <option value="">+ Proteção</option>
              {def.protections.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} (+{p.defense})
                </option>
              ))}
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Outros itens
            <Input
              type="number"
              min={0}
              max={200}
              aria-label="Espaços de outros itens"
              value={value.otherSpaces}
              onChange={(e) => set({ otherSpaces: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })}
              className="h-9 w-20"
            />
            espaços
          </label>
        </div>
      )}
      {custom && !readOnly && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line p-3">
          <Input
            aria-label="Nome da arma"
            placeholder="Nome"
            value={c.name}
            onChange={(e) => setC({ ...c, name: e.target.value })}
            className="h-9 w-40"
          />
          <Input
            aria-label="Dano da arma"
            placeholder="1d8"
            value={c.damage}
            onChange={(e) => setC({ ...c, damage: e.target.value })}
            className="h-9 w-20"
          />
          <Input
            aria-label="Margem de crítico"
            type="number"
            min={2}
            max={20}
            value={c.critRange}
            onChange={(e) => setC({ ...c, critRange: e.target.value })}
            className="h-9 w-16"
            title="Margem de ameaça"
          />
          <Input
            aria-label="Multiplicador de crítico"
            type="number"
            min={2}
            max={10}
            value={c.critMult}
            onChange={(e) => setC({ ...c, critMult: e.target.value })}
            className="h-9 w-16"
            title="Multiplicador"
          />
          <Select
            aria-label="Tipo de ataque"
            value={c.kind}
            onChange={(e) => setC({ ...c, kind: e.target.value })}
            className="h-9 w-36"
          >
            <option value="melee">Corpo a corpo</option>
            <option value="fogo">Arma de fogo</option>
            <option value="disparo">Disparo</option>
            <option value="arremesso">Arremesso</option>
          </Select>
          <Button
            size="sm"
            onClick={() => {
              if (!c.name.trim()) return;
              const ranged = c.kind === 'melee' ? undefined : (c.kind as 'fogo' | 'disparo' | 'arremesso');
              set({
                weapons: [
                  ...value.weapons,
                  {
                    name: c.name.trim(),
                    kind: ranged ? 'ranged' : 'melee',
                    ...(ranged ? { ranged } : {}),
                    damage: c.damage.replace(/\s/g, ''),
                    critRange: Number(c.critRange) || 20,
                    critMult: Number(c.critMult) || 2,
                    damageType: c.damageType,
                    spaces: 1,
                    attackBonus: 0,
                  },
                ],
              });
              setCustom(false);
              setC({ ...c, name: '' });
            }}
          >
            Adicionar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCustom(false)}>
            Cancelar
          </Button>
        </div>
      )}
      {maxSpaces !== undefined && usedSpaces !== undefined && (
        <p className={cn('mt-2 text-xs', over ? 'text-amber-300' : 'text-ink-faint')} data-testid="carga">
          Carga: {usedSpaces}/{maxSpaces} espaços
          {over &&
            usedSpaces <= maxSpaces * 2 &&
            ' — sobrecarregado: –5 na Defesa e em perícias afetadas por carga, –3 m de deslocamento (p. 63).'}
          {over &&
            usedSpaces > maxSpaces * 2 &&
            ' — acima do dobro do limite: não é possível carregar tudo isso (p. 63).'}
        </p>
      )}
    </section>
  );
}

/* ───────────────────────── Rituais ───────────────────────── */

export function RitualsSection({
  def,
  value,
  set,
  readOnly,
  onCast,
  busy,
  onOpenPage,
  dt,
}: {
  def: SystemDefinition;
  value: SystemValues;
  set: Set;
  readOnly?: boolean;
  onCast?: (key: string, form: RitualForm) => void;
  busy?: string | null;
  onOpenPage?: (n: number) => void;
  dt?: number;
}) {
  const [q, setQ] = useState('');
  const [circle, setCircle] = useState('');
  const [element, setElement] = useState('');
  const known = def.rituals.filter((r) => value.rituals.includes(r.key));
  const options = useMemo(
    () =>
      def.rituals.filter(
        (r) =>
          !value.rituals.includes(r.key) &&
          (!circle || String(r.circle) === circle) &&
          (!element || r.elements.includes(element)) &&
          (!q || r.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [def.rituals, value.rituals, circle, element, q],
  );
  if (!def.rituals.length || !def.ritualRules) return null;
  const cost = (c: number) => def.ritualRules!.costByCircle[String(c)] ?? 0;
  return (
    <section data-testid="rituals-section">
      <Title>
        Rituais{' '}
        {dt !== undefined && <span className="ml-2 normal-case tracking-normal text-ink-muted">DT {dt}</span>}
      </Title>
      {known.length === 0 && <p className="mb-2 text-sm text-ink-faint">Nenhum ritual aprendido.</p>}
      <ul className="space-y-2">
        {known.map((r) => (
          <li
            key={r.key}
            className="rounded-lg border border-line bg-surface-2/50 p-3 text-sm"
            data-testid="ritual-card"
            data-ritual={r.key}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="size-4 text-arcane-300" />
              <span className="font-medium">{r.name}</span>
              {r.elements.map((e) => (
                <span
                  key={e}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider',
                    ELEMENT_STYLE[e],
                  )}
                >
                  {ELEMENT_LABEL[e] ?? e}
                </span>
              ))}
              <span className="text-xs text-ink-muted">
                {r.circle}º círculo · {cost(r.circle)} PE
              </span>
              <span className="ml-auto">
                <PageLink page={r.page} onOpenPage={onOpenPage} />
              </span>
              {!readOnly && !onCast && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Esquecer ${r.name}`}
                  onClick={() => set({ rituals: value.rituals.filter((k) => k !== r.key) })}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {[
                r.execution && `Execução: ${r.execution}`,
                r.range && `Alcance: ${r.range}`,
                r.target && `Alvo: ${r.target}`,
                r.area && `Área: ${r.area}`,
                r.effect && `Efeito: ${r.effect}`,
                r.duration && `Duração: ${r.duration}`,
                r.resistance && `Resistência: ${r.resistance}`,
                r.damage && `Dano: ${r.damage.dice}${r.damage.type ? ` ${r.damage.type}` : ''}`,
                r.heal && `Cura: ${r.heal} PV`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {onCast && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  loading={busy === `cast-${r.key}-basic`}
                  disabled={!!busy}
                  onClick={() => onCast(r.key, 'basic')}
                  aria-label={`Conjurar ${r.name}`}
                >
                  <Sparkles /> Conjurar ({cost(r.circle)} PE)
                </Button>
                {r.discente !== undefined && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() => onCast(r.key, 'discente')}
                  >
                    Discente ({cost(r.circle) + r.discente} PE)
                  </Button>
                )}
                {r.verdadeiro !== undefined && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() => onCast(r.key, 'verdadeiro')}
                  >
                    Verdadeiro ({cost(r.circle) + r.verdadeiro} PE)
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && !onCast && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar ritual"
            aria-label="Buscar ritual"
            className="h-9 w-40"
          />
          <Select
            value={circle}
            onChange={(e) => setCircle(e.target.value)}
            aria-label="Círculo"
            className="h-9 w-28"
          >
            <option value="">Círculo</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}º
              </option>
            ))}
          </Select>
          <Select
            value={element}
            onChange={(e) => setElement(e.target.value)}
            aria-label="Elemento"
            className="h-9 w-36"
          >
            <option value="">Elemento</option>
            {Object.keys(ELEMENT_STYLE).map((e) => (
              <option key={e} value={e}>
                {ELEMENT_LABEL[e]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Aprender ritual"
            value=""
            className="h-9 min-w-56 flex-1"
            onChange={(e) => e.target.value && set({ rituals: [...value.rituals, e.target.value] })}
          >
            <option value="">+ Aprender ritual ({options.length})</option>
            {options.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} — {r.circle}º, {r.elements.map((e) => ELEMENT_LABEL[e] ?? e).join('/')}
              </option>
            ))}
          </Select>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-faint">
        Conjurar gasta PE, respeita o limite de PE por turno e faz o teste de custo paranormal (p.{' '}
        {def.ritualRules.page ?? 129}–131). O texto completo de cada ritual está no livro.
      </p>
    </section>
  );
}

/* ───────────────────────── Habilidades, trilha e poderes ───────────────────────── */

export function AbilitiesSection({
  def,
  value,
  set,
  readOnly,
  onOpenPage,
}: {
  def: SystemDefinition;
  value: SystemValues;
  set: Set;
  readOnly?: boolean;
  onOpenPage?: (n: number) => void;
}) {
  const cls = def.classes.find((c) => c.key === String(value.fields.classe ?? ''));
  if (!cls) return null;
  const nex = Number(value.fields.nex ?? 0);
  const trailKey = String(value.fields.trilha ?? '');
  const trail = cls.trails.find((t) => t.key === trailKey);
  const myPowers = value.powers;
  const classPowers = cls.powers.filter((p) => myPowers.includes(`${cls.key}:${p.key}`));
  const paranormal = def.powers.filter((p) => myPowers.includes(p.key));
  const togglePower = (k: string) =>
    set({ powers: myPowers.includes(k) ? myPowers.filter((x) => x !== k) : [...myPowers, k] });
  return (
    <section data-testid="abilities-section">
      <Title>
        Habilidades de {cls.label} <PageLink page={cls.page} onOpenPage={onOpenPage} />
      </Title>
      <ol className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
        {cls.progression.map((row) => (
          <li
            key={row.nex}
            className={cn(
              'flex gap-2 rounded px-2 py-1',
              row.nex <= nex ? 'bg-surface-2/60 text-ink' : 'text-ink-faint',
            )}
          >
            <span className="w-10 shrink-0 tabular-nums text-gold/80">{row.nex}%</span>
            <span>{row.text}</span>
          </li>
        ))}
      </ol>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Trilha</span>
        <Select
          aria-label="Trilha"
          disabled={readOnly}
          value={trail ? trail.key : ''}
          onChange={(e) => set({ fields: { ...value.fields, trilha: e.target.value } })}
          className="h-9 w-56"
        >
          <option value="">{nex >= 10 ? 'Escolha (NEX 10%)' : 'A partir de NEX 10%'}</option>
          {cls.trails.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </Select>
        {trail && <PageLink page={trail.page} onOpenPage={onOpenPage} />}
      </div>
      {trail && (
        <ul className="mb-3 space-y-1 text-sm" data-testid="trail-abilities">
          {trail.abilities.map((a) => (
            <li
              key={a.name}
              className={cn('flex items-center gap-2', a.nex <= nex ? 'text-ink' : 'text-ink-faint')}
            >
              <span className="w-10 tabular-nums text-gold/80">{a.nex}%</span>
              <span className="flex-1">{a.name}</span>
              {a.nex > nex && <span className="text-xs">bloqueada</span>}
              <PageLink page={a.page} onOpenPage={onOpenPage} />
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Poderes de {cls.label.toLowerCase()}
          </p>
          <ul className="space-y-1 text-sm">
            {classPowers.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span className="flex-1">{p.name}</span>
                <PageLink page={p.page} onOpenPage={onOpenPage} />
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover ${p.name}`}
                    onClick={() => togglePower(`${cls.key}:${p.key}`)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <Select
              aria-label={`Adicionar poder de ${cls.label}`}
              value=""
              className="mt-1 h-9"
              onChange={(e) => e.target.value && togglePower(e.target.value)}
            >
              <option value="">+ Poder de classe</option>
              {cls.powers
                .filter((p) => !myPowers.includes(`${cls.key}:${p.key}`))
                .map((p) => (
                  <option key={p.key} value={`${cls.key}:${p.key}`}>
                    {p.name}
                    {p.prereq ? ` (requer: ${p.prereq})` : ''}
                  </option>
                ))}
            </Select>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Poderes paranormais
          </p>
          <ul className="space-y-1 text-sm">
            {paranormal.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full border px-1.5 text-[10px] uppercase',
                    ELEMENT_STYLE[p.element] ?? 'border-line',
                  )}
                >
                  {ELEMENT_LABEL[p.element] ?? p.element}
                </span>
                <span className="flex-1">{p.name}</span>
                <PageLink page={p.page} onOpenPage={onOpenPage} />
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover ${p.name}`}
                    onClick={() => togglePower(p.key)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <Select
              aria-label="Adicionar poder paranormal"
              value=""
              className="mt-1 h-9"
              onChange={(e) => e.target.value && togglePower(e.target.value)}
            >
              <option value="">+ Poder paranormal</option>
              {def.powers
                .filter((p) => !myPowers.includes(p.key))
                .map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} — {ELEMENT_LABEL[p.element] ?? p.element}
                    {p.prereq ? ` (requer: ${p.prereq})` : ''}
                  </option>
                ))}
            </Select>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        Nomes e níveis vêm do livro; o efeito de cada habilidade está na página indicada.
      </p>
    </section>
  );
}

export function ActionNotes({ notes, error }: { notes: string[]; error?: string }) {
  return (
    <>
      {notes.map((n) => (
        <Alert key={n} tone="warning">
          {n}
        </Alert>
      ))}
      {error && <Alert tone="error">{error}</Alert>}
    </>
  );
}
