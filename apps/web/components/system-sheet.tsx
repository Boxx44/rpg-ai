'use client';

import { computeSheet, type SystemDefinition, type SystemValues } from '@rpg-ai/rules-engine';
import { Button, cn, Input, Select } from '@rpg-ai/ui';
import { Dices, Minus, Plus } from 'lucide-react';

export type RollTarget = { skill: string } | { attribute: string };

export function normalizeValues(def: SystemDefinition, v: Partial<SystemValues> | undefined): SystemValues {
  return {
    attributes: {
      ...Object.fromEntries(def.attributes.map((a) => [a.key, a.default])),
      ...(v?.attributes ?? {}),
    },
    fields: {
      ...Object.fromEntries(
        def.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default!]),
      ),
      ...(v?.fields ?? {}),
    },
    skills: { ...(v?.skills ?? {}) },
    current: { ...(v?.current ?? {}) },
  };
}

/** Calcula com segurança (ficha incompleta não quebra a tela). */
export function safeCompute(def: SystemDefinition, v: SystemValues) {
  try {
    return computeSheet(def, v);
  } catch {
    return { resources: [], derived: [] };
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">{children}</h3>;
}

/** Ficha gerada a partir da definição do sistema (atributos, campos, recursos, perícias). */
export function SystemSheet({
  def,
  value,
  onChange,
  readOnly,
  onRoll,
  rolling,
}: {
  def: SystemDefinition;
  value: SystemValues;
  onChange: (v: SystemValues) => void;
  readOnly?: boolean;
  onRoll?: (t: RollTarget) => void;
  rolling?: string | null;
}) {
  const computed = safeCompute(def, value);
  const set = (patch: Partial<SystemValues>) => onChange({ ...value, ...patch });
  const gradeBonus = (k?: string) => def.grades.find((g) => g.key === (k ?? def.grades[0]?.key))?.bonus ?? 0;

  function setField(key: string, v: string) {
    const fields = { ...value.fields, [key]: v };
    const field = def.fields.find((f) => f.key === key);
    const opt = field?.options?.find((o) => o.value === v);
    let skills = value.skills;
    // Origem/kit que concede perícias: marca como treinadas (o jogador pode ajustar).
    if (opt?.grantsSkills?.length && def.grades[1]) {
      skills = { ...skills };
      for (const s of opt.grantsSkills)
        if (!skills[s] || skills[s] === def.grades[0]?.key) skills[s] = def.grades[1].key;
    }
    set({ fields, skills });
  }

  return (
    <div className="space-y-6" data-testid="system-sheet">
      {def.fields.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {def.fields.map((f) => (
            <label key={f.key} className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                {f.label}
              </span>
              {f.type === 'select' ? (
                <Select
                  aria-label={f.label}
                  value={String(value.fields[f.key] ?? '')}
                  onChange={(e) => setField(f.key, e.target.value)}
                  disabled={readOnly}
                  className="h-9"
                >
                  {f.default === undefined && <option value="">—</option>}
                  {f.options!.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  aria-label={f.label}
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={String(value.fields[f.key] ?? '')}
                  onChange={(e) => setField(f.key, e.target.value)}
                  maxLength={120}
                  disabled={readOnly}
                  className="h-9"
                />
              )}
            </label>
          ))}
        </section>
      )}

      {def.attributes.length > 0 && (
        <section>
          <SectionTitle>Atributos</SectionTitle>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {def.attributes.map((a) => (
              <div
                key={a.key}
                className="relative flex flex-col items-center gap-1 rounded-xl border border-gold/30 bg-gradient-to-b from-arcane-900/40 to-surface-2 p-3"
              >
                <span className="font-display text-xs tracking-widest text-gold-bright">{a.abbr}</span>
                <Input
                  aria-label={a.label}
                  type="number"
                  min={a.min}
                  max={a.max}
                  value={value.attributes[a.key] ?? a.default}
                  onChange={(e) =>
                    set({
                      attributes: {
                        ...value.attributes,
                        [a.key]: Math.max(a.min, Math.min(a.max, Number(e.target.value) || 0)),
                      },
                    })
                  }
                  disabled={readOnly}
                  className="h-12 w-16 border-none bg-transparent text-center font-display text-3xl"
                />
                <span className="text-[11px] text-ink-faint">{a.label}</span>
                {onRoll && (
                  <button
                    type="button"
                    aria-label={`Rolar ${a.label}`}
                    disabled={!!rolling}
                    onClick={() => onRoll({ attribute: a.key })}
                    className="absolute right-1.5 top-1.5 rounded p-1 text-ink-faint transition-colors hover:text-gold-bright disabled:opacity-40"
                  >
                    <Dices className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {(computed.resources.length > 0 || computed.derived.length > 0) && (
        <section className="grid gap-3 sm:grid-cols-3">
          {computed.resources.map((r) => {
            const pct = r.max ? Math.max(0, Math.min(100, (r.current / r.max) * 100)) : 0;
            const setCur = (n: number) => set({ current: { ...value.current, [r.key]: n } });
            return (
              <div
                key={r.key}
                className="space-y-2 rounded-lg border border-line bg-surface-2/50 p-3"
                data-testid={`resource-${r.key}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                    {r.label}
                  </span>
                  <span className="font-display text-lg tabular-nums text-ink">
                    {r.current}
                    <span className="text-sm text-ink-faint">/{r.max}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                  <div
                    className={cn(
                      'h-full transition-all',
                      r.key === 'san'
                        ? 'bg-gradient-to-r from-sky-700 to-sky-400'
                        : r.key === 'pe'
                          ? 'bg-gradient-to-r from-amber-700 to-gold'
                          : 'bg-gradient-to-r from-blood to-rose-400',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {!readOnly && (
                  <div className="flex justify-between">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Diminuir ${r.abbr}`}
                      onClick={() => setCur(r.current - 1)}
                    >
                      <Minus />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCur(r.max)}>
                      Restaurar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Aumentar ${r.abbr}`}
                      onClick={() => setCur(r.current + 1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            {computed.derived.map((d) => (
              <span
                key={d.key}
                className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm"
                data-testid={`derived-${d.key}`}
              >
                <span className="text-ink-muted">{d.label}: </span>
                <b className="text-ink">
                  {d.value}
                  {d.suffix}
                </b>
              </span>
            ))}
          </div>
        </section>
      )}

      {def.skills.length > 0 && (
        <section>
          <SectionTitle>Perícias</SectionTitle>
          <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
            {def.skills.map((s) => {
              const grade = value.skills[s.key] ?? def.grades[0]?.key;
              const bonus = gradeBonus(grade);
              const attr = def.attributes.find((a) => a.key === s.attribute);
              const trained = grade !== def.grades[0]?.key;
              return (
                <div
                  key={s.key}
                  className="flex items-center gap-2 border-b border-line/40 py-1"
                  data-testid={`skill-${s.key}`}
                >
                  {onRoll ? (
                    <button
                      type="button"
                      onClick={() => onRoll({ skill: s.key })}
                      disabled={!!rolling}
                      aria-label={`Rolar ${s.label}`}
                      className={cn(
                        'rounded p-1 transition-colors disabled:opacity-40',
                        rolling === s.key ? 'text-gold-bright' : 'text-ink-faint hover:text-gold-bright',
                      )}
                    >
                      <Dices className="size-4" />
                    </button>
                  ) : (
                    <span className="w-6" />
                  )}
                  <span className={cn('flex-1 truncate text-sm', trained ? 'text-ink' : 'text-ink-muted')}>
                    {s.label}
                    {s.trainedOnly && (
                      <span title="Somente treinada" className="ml-1 text-gold/70">
                        *
                      </span>
                    )}
                    {s.armorPenalty && (
                      <span title="Penalidade de carga" className="ml-1 text-ink-faint">
                        +
                      </span>
                    )}
                  </span>
                  <span className="w-9 text-center text-[11px] text-ink-faint">{attr?.abbr}</span>
                  <Select
                    aria-label={`Treino em ${s.label}`}
                    value={grade}
                    onChange={(e) => set({ skills: { ...value.skills, [s.key]: e.target.value } })}
                    disabled={readOnly}
                    className="h-7 w-28 px-2 text-xs"
                  >
                    {def.grades.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label}
                      </option>
                    ))}
                  </Select>
                  <span className="w-8 text-right text-sm tabular-nums text-gold-bright">
                    {bonus ? `+${bonus}` : '0'}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-faint">* somente treinada · + sofre penalidade de carga</p>
        </section>
      )}
    </div>
  );
}
