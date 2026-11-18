/**
 * Modelo universal de sistema de RPG (primeira versão).
 * Um sistema é DADO, não código: atributos, perícias, campos, recursos e fórmulas.
 * Nenhum conceito é obrigatório: um sistema pode não ter perícias, classes etc.
 */
import { z } from 'zod';
import { normalizeDice } from './dice';
import { evalFormula, type FormulaContext, FormulaError, parseFormula } from './expr';

const key = z.string().regex(/^[a-z0-9_]{1,40}$/i);
const page = z.number().int().positive().optional();

export const systemDefinitionSchema = z.object({
  id: key,
  name: z.string().min(1).max(100),
  edition: z.string().max(60).default(''),
  /** Livro de onde as regras vieram. As páginas citadas referem-se ao PDF. */
  source: z.object({ title: z.string().max(200), note: z.string().max(500).default('') }),
  attributes: z
    .array(
      z.object({
        key,
        label: z.string().max(40),
        abbr: z.string().max(6),
        min: z.number().int(),
        max: z.number().int(),
        default: z.number().int(),
        page,
      }),
    )
    .max(20),
  /** Como um teste é resolvido. */
  check: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('pool-keep-highest'),
      die: z.number().int().min(2).max(100),
      /** Atributo 0 ou menos: rola N dados e fica com o pior. */
      zero: z.object({ count: z.number().int().min(1).max(10) }),
      page,
    }),
    z.object({ kind: z.literal('die-plus-attribute'), die: z.number().int().min(2).max(100), page }),
  ]),
  grades: z
    .array(z.object({ key, label: z.string().max(30), bonus: z.number().int() }))
    .max(10)
    .default([]),
  gradesPage: page,
  skills: z
    .array(
      z.object({
        key,
        label: z.string().max(40),
        attribute: key,
        trainedOnly: z.boolean().default(false),
        armorPenalty: z.boolean().default(false),
        kit: z.boolean().default(false),
      }),
    )
    .max(80)
    .default([]),
  skillsPage: page,
  fields: z
    .array(
      z.object({
        key,
        label: z.string().max(40),
        type: z.enum(['select', 'text', 'number']),
        options: z
          .array(
            z.object({
              value: z.string().max(60),
              label: z.string().max(60),
              grantsSkills: z.array(key).max(10).optional(),
              page,
            }),
          )
          .max(100)
          .optional(),
        default: z.union([z.string(), z.number()]).optional(),
        page,
      }),
    )
    .max(30)
    .default([]),
  resources: z
    .array(
      z.object({ key, label: z.string().max(40), abbr: z.string().max(6), max: z.string().max(500), page }),
    )
    .max(10)
    .default([]),
  derived: z
    .array(
      z.object({
        key,
        label: z.string().max(40),
        formula: z.string().max(500),
        suffix: z.string().max(10).default(''),
        page,
      }),
    )
    .max(20)
    .default([]),
  /** Condições do sistema (resumo com palavras próprias + página). */
  conditions: z
    .array(z.object({ key, label: z.string().max(40), summary: z.string().max(300), page }))
    .max(60)
    .default([]),
  /** Como a Iniciativa é rolada: teste de uma perícia do sistema (ou atributo). */
  initiative: z
    .object({ skill: key.optional(), attribute: key.optional(), page })
    .optional(),
  /** Resumo das regras centrais, escrito com palavras próprias, com página de referência. */
  reference: z
    .array(z.object({ title: z.string().max(80), text: z.string().max(600), page }))
    .max(40)
    .default([]),
});
export type SystemDefinition = z.infer<typeof systemDefinitionSchema>;

export interface SystemValues {
  attributes: Record<string, number>;
  fields: Record<string, string | number>;
  skills: Record<string, string>;
  current: Record<string, number>;
}

/** Valida a definição inteira, incluindo se todas as fórmulas são seguras e coerentes. */
export function validateSystem(input: unknown): SystemDefinition {
  const def = systemDefinitionSchema.parse(input);
  const attrKeys = new Set(def.attributes.map((a) => a.key));
  for (const s of def.skills)
    if (!attrKeys.has(s.attribute))
      throw new FormulaError(`Perícia ${s.key}: atributo ${s.attribute} inexistente`);
  for (const f of [...def.resources.map((r) => r.max), ...def.derived.map((d) => d.formula)]) parseFormula(f);
  if (def.initiative?.skill && !def.skills.some((s) => s.key === def.initiative!.skill))
    throw new FormulaError(`Iniciativa: perícia ${def.initiative.skill} inexistente`);
  // Executa todas as fórmulas com uma ficha padrão para pegar erros cedo.
  computeSheet(def, emptyValues(def));
  return def;
}

export function emptyValues(def: SystemDefinition): SystemValues {
  return {
    attributes: Object.fromEntries(def.attributes.map((a) => [a.key, a.default])),
    fields: Object.fromEntries(
      def.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default!]),
    ),
    skills: {},
    current: {},
  };
}

/** Corrige/valida valores vindos do usuário de acordo com o sistema. Lança erro em português. */
export function sanitizeValues(def: SystemDefinition, raw: Partial<SystemValues> | undefined): SystemValues {
  const v = emptyValues(def);
  const r = raw ?? {};
  for (const a of def.attributes) {
    const x = r.attributes?.[a.key];
    if (x === undefined) continue;
    if (!Number.isInteger(x) || x < a.min || x > a.max)
      throw new FormulaError(`${a.label} precisa estar entre ${a.min} e ${a.max}`);
    v.attributes[a.key] = x;
  }
  for (const f of def.fields) {
    const x = r.fields?.[f.key];
    if (x === undefined || x === '') continue;
    if (f.type === 'select' && !f.options?.some((o) => o.value === String(x)))
      throw new FormulaError(`Valor inválido para ${f.label}`);
    if (f.type === 'number' && !Number.isFinite(Number(x)))
      throw new FormulaError(`${f.label} precisa ser número`);
    if (f.type === 'text' && String(x).length > 120) throw new FormulaError(`${f.label} longo demais`);
    v.fields[f.key] = f.type === 'number' ? Number(x) : String(x);
  }
  const grades = new Set(def.grades.map((g) => g.key));
  for (const [k, g] of Object.entries(r.skills ?? {})) {
    if (!def.skills.some((s) => s.key === k)) throw new FormulaError(`Perícia desconhecida: ${k}`);
    if (!grades.has(g)) throw new FormulaError(`Grau de treinamento inválido em ${k}`);
    if (g !== def.grades[0]?.key) v.skills[k] = g;
  }
  for (const res of def.resources) {
    const x = r.current?.[res.key];
    if (x === undefined) continue;
    if (!Number.isInteger(x) || Math.abs(x) > 99999) throw new FormulaError(`${res.label} inválido`);
    v.current[res.key] = x;
  }
  return v;
}

function ctxFor(def: SystemDefinition, v: SystemValues): FormulaContext {
  return {
    attr: (k) => {
      if (!def.attributes.some((a) => a.key === k)) throw new FormulaError(`Atributo inexistente: ${k}`);
      return v.attributes[k] ?? 0;
    },
    field: (k) => v.fields[k],
  };
}

export interface ComputedSheet {
  resources: { key: string; label: string; abbr: string; max: number; current: number }[];
  derived: { key: string; label: string; value: number; suffix: string }[];
}

export function computeSheet(def: SystemDefinition, v: SystemValues): ComputedSheet {
  const ctx = ctxFor(def, v);
  return {
    resources: def.resources.map((r) => {
      const max = Math.max(0, Math.floor(evalFormula(r.max, ctx)));
      return { key: r.key, label: r.label, abbr: r.abbr, max, current: v.current[r.key] ?? max };
    }),
    derived: def.derived.map((d) => ({
      key: d.key,
      label: d.label,
      value: evalFormula(d.formula, ctx),
      suffix: d.suffix,
    })),
  };
}

export interface CheckRequest {
  skill?: string;
  attribute?: string;
  bonus?: number;
}

/** Monta a rolagem de um teste segundo o sistema (o motor de dados executa). */
export function buildCheck(
  def: SystemDefinition,
  v: SystemValues,
  req: CheckRequest,
): { expression: string; label: string; notes: string[] } {
  const notes: string[] = [];
  let attrKey = req.attribute;
  let bonus = req.bonus ?? 0;
  let label: string;
  if (req.skill) {
    const s = def.skills.find((x) => x.key === req.skill);
    if (!s) throw new FormulaError('Perícia desconhecida');
    attrKey = s.attribute;
    const gradeKey = v.skills[s.key] ?? def.grades[0]?.key;
    const grade = def.grades.find((g) => g.key === gradeKey);
    bonus += grade?.bonus ?? 0;
    label = s.label;
    if (s.trainedOnly && (!grade || grade.key === def.grades[0]?.key))
      notes.push(`${s.label} só pode ser usada por quem é treinado.`);
    if (s.kit) notes.push('Sem o kit apropriado, o teste sofre –5.');
  } else {
    const a = def.attributes.find((x) => x.key === attrKey);
    if (!a) throw new FormulaError('Atributo desconhecido');
    label = a.label;
  }
  const n = v.attributes[attrKey!] ?? 0;
  let dice: string;
  if (def.check.kind === 'pool-keep-highest') {
    dice = n > 0 ? `${Math.min(n, 20)}d${def.check.die}kh1` : `${def.check.zero.count}d${def.check.die}kl1`;
  } else {
    dice = `1d${def.check.die}${n >= 0 ? '+' : ''}${n}`;
  }
  const expression = normalizeDice(bonus ? `${dice}${bonus > 0 ? '+' : ''}${bonus}` : dice);
  return { expression, label, notes };
}

/** Teste de Iniciativa pela regra do sistema (perícia/atributo configurados). */
export function buildInitiative(def: SystemDefinition, v: SystemValues): { expression: string; label: string } {
  const ini = def.initiative;
  if (ini?.skill) return buildCheck(def, v, { skill: ini.skill });
  if (ini?.attribute) return buildCheck(def, v, { attribute: ini.attribute });
  return { expression: `1d${def.check.die}`, label: 'Iniciativa' };
}

/** Recurso usado como "vida" no combate (o primeiro recurso do sistema, ex.: PV). */
export function healthResource(def: SystemDefinition): string | undefined {
  return def.resources[0]?.key;
}
