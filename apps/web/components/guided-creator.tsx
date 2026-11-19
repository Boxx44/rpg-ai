'use client';

import type { Appearance } from '@rpg-ai/shared';
import { AppearanceEditor } from './appearance-editor';
import { evalFormula, type SystemDefinition, type SystemValues } from '@rpg-ai/rules-engine';
import { Alert, Button, Card, CardContent, cn, Field, Input, Select } from '@rpg-ai/ui';
import { ArrowLeft, ArrowRight, Check, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HelpContext, HelpDot, HelperCard, HelpToggle, useHelpPreference } from './help';
import { critLabel } from './system-extras';
import { normalizeValues, safeCompute } from './system-sheet';

export interface GuidedResult {
  name: string;
  concept: string;
  values: SystemValues;
  /** Aparência do boneco 2D escolhida no passo "Aparência". */
  appearance?: Appearance | null;
}

const STEPS = ['Conceito', 'Atributos', 'Origem', 'Classe', 'Perícias', 'Equipamento', 'Aparência', 'Revisão'] as const;
const STEP_KEYS = ['concept', 'attributes', 'origin', 'class', 'skills', 'equipment', 'review'] as const;
type Focus = { title: string; text: string; page?: number } | null;

function Book({ page }: { page?: number }) {
  return page ? <span className="text-xs text-ink-faint">(livro, p. {page})</span> : null;
}

/**
 * Criação guiada: monta a ficha passo a passo seguindo as regras de criação
 * do sistema (atributos, origem, classe, perícias, equipamento e rituais iniciais).
 * Ao final entrega os valores para o editor completo, onde dá para ajustar tudo.
 */
export function GuidedCreator({
  def,
  onFinish,
  onCancel,
}: {
  def: SystemDefinition;
  onFinish: (r: GuidedResult) => void;
  onCancel: () => void;
}) {
  const rules = def.creation!;
  const help = def.help;
  const [helpOn, setHelpOn] = useHelpPreference();
  const [focus, setFocus] = useState<Focus>(null);
  const [step, setStepRaw] = useState(0);
  const setStep = (n: number) => {
    setStepRaw(n);
    setFocus(null);
  };
  /** Liga um elemento ao "Ajudante": passar o mouse ou focar mostra a explicação. */
  const explain = (f: Focus) => ({ onMouseEnter: () => f && setFocus(f), onFocus: () => f && setFocus(f) });
  const term = (k: string) => help?.terms[k];
  const [name, setName] = useState('');
  const [concept, setConcept] = useState('');
  const [attrs, setAttrs] = useState<Record<string, number>>(
    Object.fromEntries(def.attributes.map((a) => [a.key, rules.attributes.base])),
  );
  const originField = def.fields.find((f) => f.key === 'origem');
  const classField = def.fields.find((f) => f.key === 'classe');
  const [origin, setOrigin] = useState(String(originField?.options?.[0]?.value ?? ''));
  const [cls, setCls] = useState(String(classField?.default ?? classField?.options?.[0]?.value ?? ''));
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [free, setFree] = useState<string[]>([]);
  const [weapons, setWeapons] = useState<string[]>([]);
  const [protection, setProtection] = useState('');
  const [rituals, setRituals] = useState<string[]>([]);
  const [appearance, setAppearance] = useState<Appearance | null>(null);

  // ── atributos
  const dumped = Object.values(attrs).filter((v) => v === 0).length;
  const spent = Object.values(attrs).reduce((s, v) => s + (v - rules.attributes.base), 0);
  const budget = rules.attributes.points;
  const left = budget - spent;
  const attrOk = left === 0 && dumped <= (rules.attributes.dumpOne ? 1 : 0);

  const classRule = rules.classes[cls];
  const originOpt = originField?.options?.find((o) => String(o.value) === origin);
  const originSkills = originOpt?.grantsSkills ?? [];
  const fixedSkills = classRule?.fixed ?? [];
  const chosenPairs = (classRule?.choose ?? []).map((_, i) => picks[i]).filter(Boolean) as string[];
  const freeCount = classRule
    ? Math.max(
        0,
        Math.floor(evalFormula(classRule.free, { attr: (k) => attrs[k] ?? 0, field: () => undefined })),
      )
    : 0;
  const lockedSkills = new Set([...originSkills, ...fixedSkills, ...chosenPairs]);
  const pairsOk = (classRule?.choose ?? []).every((_, i) => !!picks[i]);
  const freeOk = free.length === freeCount;

  const values = useMemo<SystemValues>(() => {
    const trained = def.grades[1]?.key ?? 'treinado';
    const skills: Record<string, string> = {};
    for (const k of [...lockedSkills, ...free]) skills[k] = trained;
    const prot = def.protections.find((p) => p.key === protection);
    return normalizeValues(def, {
      attributes: attrs,
      fields: {
        ...Object.fromEntries(def.fields.map((f) => [f.key, f.default ?? ''])),
        classe: cls,
        origem: origin,
        nex: '5',
      },
      skills,
      current: {},
      weapons: weapons.map((k) => {
        const w = def.weapons.find((x) => x.key === k)!;
        return {
          ref: w.key,
          name: w.name,
          kind: w.kind,
          ...(w.ranged ? { ranged: w.ranged } : {}),
          damage: w.damage,
          critRange: w.critRange,
          critMult: w.critMult,
          damageType: w.damageType,
          spaces: w.spaces,
          attackBonus: 0,
        };
      }),
      protections: prot
        ? [{ ref: prot.key, name: prot.name, defense: prot.defense, spaces: prot.spaces }]
        : [],
      rituals,
    });
    // lockedSkills deriva de origin/cls/picks (já nas dependências)
  }, [attrs, cls, origin, picks, free, weapons, protection, rituals, def]);
  const sheet = safeCompute(def, values);

  const canNext = [
    name.trim().length > 0,
    attrOk,
    !!origin,
    !!cls,
    pairsOk && freeOk,
    !classRule?.rituals || rituals.length === classRule.rituals,
    true,
    true,
  ][step];

  const setAttr = (k: string, v: number) => {
    if (v < 0 || v > rules.attributes.max) return;
    if (v === 0 && !rules.attributes.dumpOne) return;
    setAttrs((a) => ({ ...a, [k]: v }));
  };

  const allowedWeapons = def.weapons.filter((w) => !classRule || classRule.weapons.includes(w.proficiency));
  const allowedProtections = def.protections.filter((p) => classRule?.protections.includes(p.key));
  const allowedRituals = def.rituals.filter((r) => r.circle <= (classRule?.ritualCircle ?? 1));

  const stepHelp = help?.steps[STEP_KEYS[step]!];
  return (
    <HelpContext.Provider value={helpOn}>
      <Card>
        <CardContent className="space-y-6 pt-6" data-testid="guided-creator">
          <div className="flex flex-wrap items-center gap-2">
            <Wand2 className="size-5 text-gold" />
            <p className="font-display text-lg tracking-wide">Criação guiada — {def.name}</p>
            {help && (
              <span className="ml-auto">
                <HelpToggle on={helpOn} onChange={setHelpOn} />
              </span>
            )}
          </div>
          <ol className="flex flex-wrap gap-1 text-xs">
            {STEPS.map((s, i) => (
              <li
                key={s}
                className={cn(
                  'rounded-full border px-2.5 py-1',
                  i === step
                    ? 'border-gold/70 bg-gold/15 text-gold-bright'
                    : i < step
                      ? 'border-arcane-500/40 text-arcane-200'
                      : 'border-line text-ink-faint',
                )}
              >
                {i + 1}. {s}
              </li>
            ))}
          </ol>

          <div className={cn('grid gap-6', helpOn && stepHelp && 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
            <div className="min-w-0 space-y-6">
              {step === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome do personagem" htmlFor="g-name">
                    <Input
                      id="g-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      autoFocus
                    />
                  </Field>
                  <Field
                    label="Conceito"
                    htmlFor="g-concept"
                    hint="Em uma frase: quem é e por que entrou na Ordem."
                  >
                    <Input
                      id="g-concept"
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                      maxLength={200}
                    />
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-muted">
                    Todos começam em {rules.attributes.base}. Você tem <b>{budget} pontos</b> para distribuir;
                    máximo {rules.attributes.max} em cada.
                    {rules.attributes.dumpOne &&
                      ' Pode baixar um atributo para 0 e ganhar 1 ponto extra.'}{' '}
                    <Book page={rules.attributes.page} />
                  </p>
                  <div className="grid gap-3 sm:grid-cols-5">
                    {def.attributes.map((a) => (
                      <div
                        key={a.key}
                        className="rounded-xl border border-line bg-surface-2/50 p-3 text-center"
                        {...explain(
                          help?.attributes[a.key]
                            ? { title: a.label, text: help.attributes[a.key]!, page: a.page }
                            : null,
                        )}
                      >
                        <p className="text-xs uppercase tracking-wider text-ink-muted">{a.label}</p>
                        <p className="my-1 font-display text-3xl" data-testid={`g-attr-${a.key}`}>
                          {attrs[a.key]}
                        </p>
                        <div className="flex justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Diminuir ${a.label}`}
                            onClick={() => setAttr(a.key, attrs[a.key]! - 1)}
                          >
                            −
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Aumentar ${a.label}`}
                            disabled={left <= 0}
                            onClick={() => setAttr(a.key, attrs[a.key]! + 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p
                    className={cn('text-sm', left === 0 ? 'text-emerald-300' : 'text-amber-300')}
                    data-testid="g-points-left"
                  >
                    {left === 0
                      ? 'Pontos distribuídos.'
                      : left > 0
                        ? `Faltam ${left} ponto(s).`
                        : `${-left} ponto(s) a mais — tire de algum atributo.`}
                    {dumped > 1 && ' Só um atributo pode ficar em 0.'}
                  </p>
                </div>
              )}

              {step === 2 && originField && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-muted">
                    A origem é o que você fazia antes da Ordem. Ela dá duas perícias treinadas e um poder
                    (veja o livro).
                  </p>
                  <Select
                    aria-label="Origem"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="max-w-sm"
                  >
                    {originField.options?.map((o) => (
                      <option key={String(o.value)} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  {help?.origins[origin] && (
                    <div
                      className="rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm"
                      data-testid="origin-power"
                    >
                      <p className="font-semibold text-gold-bright">Poder: {help.origins[origin].power}</p>
                      <p className="text-ink">{help.origins[origin].text}</p>
                      <p className="mt-1 text-xs text-ink-faint">Livro, p. {help.origins[origin].page}</p>
                    </div>
                  )}
                  {originSkills.length > 0 && (
                    <p className="text-sm">
                      Perícias treinadas:{' '}
                      <b>
                        {originSkills.map((k) => def.skills.find((s) => s.key === k)?.label ?? k).join(' e ')}
                      </b>
                    </p>
                  )}
                </div>
              )}

              {step === 3 && classField && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {def.classes.map((c) => {
                      const r = rules.classes[c.key];
                      const preview = safeCompute(def, {
                        ...values,
                        fields: { ...values.fields, classe: c.key },
                      });
                      return (
                        <button
                          type="button"
                          key={c.key}
                          onClick={() => {
                            setCls(c.key);
                            setPicks({});
                            setFree([]);
                            setWeapons([]);
                            setProtection('');
                            setRituals([]);
                          }}
                          aria-pressed={cls === c.key}
                          {...explain(
                            help?.classes[c.key]
                              ? { title: c.label, text: help.classes[c.key]!, page: c.page }
                              : null,
                          )}
                          className={cn(
                            'rounded-xl border p-4 text-left transition-colors',
                            cls === c.key
                              ? 'border-gold/70 bg-gold/10'
                              : 'border-line hover:border-arcane-500/50',
                          )}
                        >
                          <p className="font-display tracking-wide">{c.label}</p>
                          {helpOn && help?.classes[c.key] && (
                            <p className="mt-1 text-xs text-sky-100/90">{help.classes[c.key]}</p>
                          )}
                          <p className="mt-1 text-xs text-ink-muted">
                            {preview.resources.map((x) => `${x.abbr} ${x.max}`).join(' · ')}
                          </p>
                          {r && (
                            <p className="mt-2 text-xs text-ink-faint">
                              {r.choose.length
                                ? `${r.choose.map((p) => p.map((k) => def.skills.find((s) => s.key === k)?.label).join(' ou ')).join('; ')}; `
                                : ''}
                              {r.fixed.length
                                ? `${r.fixed.map((k) => def.skills.find((s) => s.key === k)?.label).join(' e ')}; `
                                : ''}
                              + perícias livres.{' '}
                              {r.rituals ? `${r.rituals} rituais de ${r.ritualCircle}º círculo.` : ''}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <Book page={classRule?.page} />
                </div>
              )}

              {step === 4 && classRule && (
                <div className="space-y-4">
                  {classRule.choose.map((pair, i) => (
                    <div key={pair.join()} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-ink-muted">Escolha uma:</span>
                      {pair.map((k) => (
                        <Button
                          key={k}
                          size="sm"
                          variant={picks[i] === k ? 'primary' : 'secondary'}
                          onClick={() => setPicks((p) => ({ ...p, [i]: k }))}
                          aria-pressed={picks[i] === k}
                        >
                          {def.skills.find((s) => s.key === k)?.label}
                        </Button>
                      ))}
                    </div>
                  ))}
                  <p className="text-sm">
                    Perícias livres:{' '}
                    <b data-testid="g-free-count">
                      {free.length}/{freeCount}
                    </b>{' '}
                    <Book page={classRule.page} />
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-3">
                    {def.skills.map((s) => {
                      const locked = lockedSkills.has(s.key);
                      const on = locked || free.includes(s.key);
                      return (
                        <label
                          key={s.key}
                          title={help?.skills[s.key]}
                          {...explain(
                            help?.skills[s.key]
                              ? { title: s.label, text: help.skills[s.key]!, page: help.steps.skills?.page }
                              : null,
                          )}
                          className={cn(
                            'flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm',
                            on ? 'border-arcane-500/50 bg-arcane-700/20' : 'border-line',
                            locked && 'opacity-70',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={locked || (!on && free.length >= freeCount)}
                            onChange={(e) =>
                              setFree((f) =>
                                e.target.checked ? [...f, s.key] : f.filter((x) => x !== s.key),
                              )
                            }
                          />
                          {s.label}
                          {locked && (
                            <span className="ml-auto text-[10px] text-ink-faint">
                              {originSkills.includes(s.key) ? 'origem' : 'classe'}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 5 && classRule && (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm text-ink-muted">
                      Armas que a classe sabe usar (pode escolher depois também):
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-3">
                      {allowedWeapons.map((w) => (
                        <label
                          key={w.key}
                          className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-sm"
                          {...explain({
                            title: w.name,
                            text: `Dano ${w.damage} (${w.damageType}); crítico ${critLabel(w)}${w.critRange < 20 ? ` — crítico com ${w.critRange} ou mais no dado` : ''}; ${w.kind === 'melee' ? 'corpo a corpo (usa Luta e soma Força no dano)' : 'à distância (usa Pontaria)'}${w.range ? `, alcance ${w.range}` : ''}; ocupa ${w.spaces} espaço(s).`,
                            page: w.page,
                          })}
                        >
                          <input
                            type="checkbox"
                            checked={weapons.includes(w.key)}
                            onChange={(e) =>
                              setWeapons((l) =>
                                e.target.checked ? [...l, w.key] : l.filter((x) => x !== w.key),
                              )
                            }
                          />
                          {w.name}{' '}
                          <span className="ml-auto text-xs text-ink-faint">
                            {w.damage} {critLabel(w)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {allowedProtections.length > 0 && (
                    <Select
                      aria-label="Proteção inicial"
                      value={protection}
                      onChange={(e) => setProtection(e.target.value)}
                      className="max-w-xs"
                    >
                      <option value="">Sem proteção</option>
                      {allowedProtections.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name} (+{p.defense} Defesa)
                        </option>
                      ))}
                    </Select>
                  )}
                  {classRule.rituals > 0 && (
                    <div>
                      <p className="mb-2 text-sm">
                        Rituais iniciais:{' '}
                        <b data-testid="g-rituals-count">
                          {rituals.length}/{classRule.rituals}
                        </b>{' '}
                        de {classRule.ritualCircle}º círculo
                      </p>
                      <div className="grid gap-1.5 sm:grid-cols-3">
                        {allowedRituals.map((r) => (
                          <label
                            key={r.key}
                            className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-sm"
                            {...explain({
                              title: r.name,
                              text: [
                                `Elemento: ${r.elements.join('/')}; ${r.circle}º círculo.`,
                                r.execution && `Execução: ${r.execution}.`,
                                r.range && `Alcance: ${r.range}.`,
                                r.target && `Alvo: ${r.target}.`,
                                r.area && `Área: ${r.area}.`,
                                r.duration && `Duração: ${r.duration}.`,
                                r.resistance && `Resistência: ${r.resistance}.`,
                                r.damage && `Dano: ${r.damage.dice} ${r.damage.type}.`,
                                r.heal && `Cura: ${r.heal} PV.`,
                                'O efeito completo está no livro.',
                              ]
                                .filter(Boolean)
                                .join(' '),
                              page: r.page,
                            })}
                          >
                            <input
                              type="checkbox"
                              checked={rituals.includes(r.key)}
                              disabled={!rituals.includes(r.key) && rituals.length >= classRule.rituals}
                              onChange={(e) =>
                                setRituals((l) =>
                                  e.target.checked ? [...l, r.key] : l.filter((x) => x !== r.key),
                                )
                              }
                            />
                            {r.name}{' '}
                            <span className="ml-auto text-[10px] uppercase text-ink-faint">
                              {r.elements.join('/')}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 6 && (
                <div className="space-y-2" data-testid="g-appearance">
                  <p className="text-sm text-ink-muted">
                    Monte o visual do personagem: é assim que ele aparece no mapa. Dá para mudar depois na aba
                    &quot;Aparência&quot; da ficha.
                  </p>
                  <AppearanceEditor value={appearance} seed={name || 'novo'} onChange={setAppearance} />
                </div>
              )}

              {step === 7 && (
                <div className="space-y-2 text-sm" data-testid="g-review">
                  <p className="font-display text-xl">{name}</p>
                  <p className="text-ink-muted">{concept}</p>
                  <p>
                    {classField?.options?.find((o) => String(o.value) === cls)?.label} · {originOpt?.label} ·
                    NEX 5%
                  </p>
                  <p>{def.attributes.map((a) => `${a.abbr ?? a.key} ${attrs[a.key]}`).join(' · ')}</p>
                  <p className="flex flex-wrap gap-x-3">
                    {sheet.resources.map((r) => (
                      <span key={r.key}>
                        {r.label}: <b>{r.max}</b>
                        <HelpDot
                          label={term(r.key)?.label ?? r.label}
                          text={term(r.key)?.text}
                          page={term(r.key)?.page}
                        />
                      </span>
                    ))}
                  </p>
                  <p>
                    {sheet.derived
                      .filter((d) => ['defesa', 'carga'].includes(d.key))
                      .map((d) => `${d.label}: ${d.value}${d.suffix}`)
                      .join(' · ')}
                  </p>
                  <p>
                    Perícias treinadas:{' '}
                    {Object.keys(values.skills)
                      .map((k) => def.skills.find((s) => s.key === k)?.label ?? k)
                      .join(', ')}
                  </p>
                  {values.weapons.length > 0 && <p>Armas: {values.weapons.map((w) => w.name).join(', ')}</p>}
                  {values.rituals.length > 0 && (
                    <p>
                      Rituais:{' '}
                      {def.rituals
                        .filter((r) => values.rituals.includes(r.key))
                        .map((r) => r.name)
                        .join(', ')}
                    </p>
                  )}
                  <Alert tone="info">
                    Depois de criar, a ficha completa abre para ajustes (trilha, poderes, anotações).
                  </Alert>
                </div>
              )}
            </div>
            {helpOn && stepHelp && (
              <div className="lg:sticky lg:top-20 lg:self-start">
                <HelperCard
                  title={stepHelp.title}
                  text={stepHelp.text}
                  page={stepHelp.page}
                  focus={focus}
                  onClose={() => setHelpOn(false)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
              <ArrowLeft /> {step === 0 ? 'Cancelar' : 'Voltar'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
                Próximo <ArrowRight />
              </Button>
            ) : (
              <Button onClick={() => onFinish({ name: name.trim(), concept, values, appearance })}>
                <Check /> Criar ficha
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </HelpContext.Provider>
  );
}
