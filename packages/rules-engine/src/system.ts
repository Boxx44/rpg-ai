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
  initiative: z.object({ skill: key.optional(), attribute: key.optional(), page }).optional(),
  /** Como ataques são resolvidos: perícia do teste e atributo somado ao dano. */
  combat: z
    .object({
      melee: z.object({ skill: key, damageAttr: key.optional() }),
      ranged: z.object({ skill: key, damageAttr: key.optional() }),
      thrown: z.object({ skill: key, damageAttr: key.optional() }),
      page,
    })
    .optional(),
  /** Armas do livro (tabela de armas). */
  weapons: z
    .array(
      z.object({
        key,
        name: z.string().max(60),
        proficiency: z.string().max(20),
        kind: z.enum(['melee', 'ranged']),
        ranged: z.enum(['arremesso', 'disparo', 'fogo']).optional(),
        grip: z.string().max(20),
        damage: z.string().max(20),
        damageAlt: z.string().max(20).optional(),
        critRange: z.number().int().min(2).max(20),
        critMult: z.number().int().min(2).max(10),
        range: z.string().max(20).optional(),
        damageType: z.string().max(30),
        spaces: z.number().int().min(0).max(20),
        category: z.string().max(5),
        page,
      }),
    )
    .max(200)
    .default([]),
  protections: z
    .array(
      z.object({
        key,
        name: z.string().max(60),
        defense: z.number().int(),
        category: z.string().max(5),
        spaces: z.number().int(),
        page,
      }),
    )
    .max(50)
    .default([]),
  /** Rituais: só mecânica (custo, alcance, duração…) + página. */
  rituals: z
    .array(
      z.object({
        key,
        name: z.string().max(60),
        elements: z.array(z.string().max(20)).min(1).max(5),
        circle: z.number().int().min(1).max(9),
        execution: z.string().max(40),
        range: z.string().max(60),
        duration: z.string().max(80),
        target: z.string().max(120).optional(),
        area: z.string().max(120).optional(),
        effect: z.string().max(120).optional(),
        resistance: z.string().max(120).optional(),
        discente: z.number().int().optional(),
        verdadeiro: z.number().int().optional(),
        damage: z.object({ dice: z.string().max(30), type: z.string().max(30) }).optional(),
        heal: z.string().max(30).optional(),
        page,
      }),
    )
    .max(300)
    .default([]),
  /** Regras de rituais: custo por círculo, DT e custo paranormal. */
  ritualRules: z
    .object({
      costByCircle: z.record(z.number().int()),
      /** Fórmula da DT de resistência. */
      dt: z.string().max(200),
      /** Perícia do teste de custo paranormal (DT 20 + custo). */
      sanityCheckSkill: key.optional(),
      /** Recurso gasto ao conjurar e recurso perdido no custo paranormal. */
      spend: key,
      sanity: key.optional(),
      /** Elemento cujo custo em Sanidade é automático (Medo). */
      fearElement: z.string().max(20).optional(),
      page,
    })
    .optional(),
  /** Habilidades por classe: progressão por NEX, poderes e trilhas. */
  classes: z
    .array(
      z.object({
        key,
        label: z.string().max(40),
        page,
        progression: z.array(z.object({ nex: z.number().int(), text: z.string().max(120) })).max(40),
        powers: z
          .array(z.object({ key, name: z.string().max(60), prereq: z.string().max(160), page }))
          .max(80),
        trails: z
          .array(
            z.object({
              key,
              name: z.string().max(60),
              page,
              abilities: z.array(z.object({ nex: z.number().int(), name: z.string().max(60), page })).max(10),
            }),
          )
          .max(20),
      }),
    )
    .max(20)
    .default([]),
  /** Poderes paranormais. */
  powers: z
    .array(
      z.object({
        key,
        name: z.string().max(60),
        element: z.string().max(20),
        prereq: z.string().max(160),
        page,
      }),
    )
    .max(100)
    .default([]),
  /** Ameaças/criaturas para o combate. */
  creatures: z
    .array(
      z.object({
        key,
        name: z.string().max(80),
        element: z.string().max(20).nullable(),
        vd: z.number().int().nullable(),
        pv: z.number().int().min(0),
        defesa: z.number().int().nullable(),
        iniciativa: z.string().max(40).nullable(),
        attacks: z
          .array(
            z.object({
              name: z.string().max(60),
              kind: z.enum(['melee', 'ranged']),
              times: z.number().int().min(1).max(10),
              test: z.string().max(40),
              damage: z.string().max(40),
              type: z.string().max(30),
              critRange: z.number().int().min(2).max(20).optional(),
              critMult: z.number().int().min(2).max(10).optional(),
            }),
          )
          .max(10),
        page,
      }),
    )
    .max(300)
    .default([]),
  /** Regras de criação de personagem (usadas pela criação guiada). */
  creation: z
    .object({
      attributes: z.object({
        base: z.number().int(),
        points: z.number().int().min(0).max(30),
        max: z.number().int(),
        /** Pode baixar um atributo para 0 e ganhar 1 ponto. */
        dumpOne: z.boolean().default(false),
        page,
      }),
      classes: z.record(
        z.object({
          /** Escolha uma perícia de cada par. */
          choose: z.array(z.array(key).min(2).max(4)).max(5).default([]),
          fixed: z.array(key).max(10).default([]),
          /** Quantidade de perícias livres (fórmula). */
          free: z.string().max(100),
          weapons: z.array(z.string().max(20)).max(5).default([]),
          protections: z.array(key).max(5).default([]),
          rituals: z.number().int().min(0).max(10).default(0),
          ritualCircle: z.number().int().min(1).max(4).default(1),
          page,
        }),
      ),
    })
    .optional(),
  /** Ajuda para iniciantes: explicações em linguagem simples (sem regras novas). */
  help: z
    .object({
      steps: z
        .record(z.object({ title: z.string().max(80), text: z.string().max(600), page: page.optional() }))
        .default({}),
      attributes: z.record(z.string().max(300)).default({}),
      skills: z.record(z.string().max(200)).default({}),
      origins: z.record(z.object({ power: z.string().max(60), text: z.string().max(300), page })).default({}),
      classes: z.record(z.string().max(300)).default({}),
      terms: z
        .record(z.object({ label: z.string().max(60), text: z.string().max(300), page: page.optional() }))
        .default({}),
    })
    .optional(),
  /** Interlúdio: descanso entre cenas (dormir recupera PV/PE, relaxar recupera SAN). */
  rest: z
    .object({
      /** Fórmula base da recuperação (ex.: limite de PE). */
      amount: z.string().max(200),
      sleep: z.array(key).max(5),
      relax: z.array(key).max(5),
      /** Bônus de relaxar por participante além de você. */
      relaxBonusPerParticipant: z.number().int().min(0).max(10).default(0),
      qualities: z
        .array(z.object({ key, label: z.string().max(40), mult: z.number().min(0).max(10) }))
        .max(10),
      meals: z
        .array(
          z.object({
            key,
            label: z.string().max(40),
            summary: z.string().max(200),
            /** Efeito mecânico: +1 multiplicador em um recurso ao dormir, ou bônus fixo ao relaxar. */
            sleepMultFor: key.optional(),
            relaxBonus: z.number().int().optional(),
          }),
        )
        .max(10)
        .default([]),
      page,
    })
    .optional(),
  /** Resumo das regras centrais, escrito com palavras próprias, com página de referência. */
  reference: z
    .array(z.object({ title: z.string().max(80), text: z.string().max(600), page }))
    .max(40)
    .default([]),
});
export type SystemDefinition = z.infer<typeof systemDefinitionSchema>;

export interface SheetWeapon {
  /** Arma do livro (opcional; armas próprias não têm). */
  ref?: string;
  name: string;
  kind: 'melee' | 'ranged';
  ranged?: 'arremesso' | 'disparo' | 'fogo';
  damage: string;
  critRange: number;
  critMult: number;
  damageType: string;
  spaces: number;
  /** Bônus fixo no ataque (mira, modificações…). */
  attackBonus: number;
}
export interface SheetProtection {
  ref?: string;
  name: string;
  defense: number;
  spaces: number;
}
export interface SystemValues {
  attributes: Record<string, number>;
  fields: Record<string, string | number>;
  skills: Record<string, string>;
  current: Record<string, number>;
  weapons: SheetWeapon[];
  protections: SheetProtection[];
  /** Espaços de outros itens (inventário livre). */
  otherSpaces: number;
  rituals: string[];
  powers: string[];
  /** Perdas permanentes no máximo de um recurso (ex.: Sanidade perdida para sempre). */
  perm: Record<string, number>;
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
    weapons: [],
    protections: [],
    otherSpaces: 0,
    rituals: [],
    powers: [],
    perm: {},
  };
}

const DICE_RE = /^\d{1,2}d\d{1,3}$/;

/** Corrige/valida valores vindos do usuário de acordo com o sistema. Lança erro em português. */
export type RawValues = Partial<Omit<SystemValues, 'weapons' | 'protections'>> & {
  weapons?: Partial<SheetWeapon>[];
  protections?: Partial<SheetProtection>[];
};

export function sanitizeValues(def: SystemDefinition, raw: RawValues | undefined): SystemValues {
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
    const p = r.perm?.[res.key];
    if (p !== undefined && p !== 0) {
      if (!Number.isInteger(p) || p < 0 || p > 999)
        throw new FormulaError(`Perda permanente de ${res.label} inválida`);
      v.perm[res.key] = p;
    }
  }
  if (r.perm && Object.keys(r.perm).some((k) => !def.resources.some((x) => x.key === k)))
    throw new FormulaError('Perda permanente em recurso desconhecido');
  for (const res of def.resources) {
    const x = r.current?.[res.key];
    if (x === undefined) continue;
    if (!Number.isInteger(x) || Math.abs(x) > 99999) throw new FormulaError(`${res.label} inválido`);
    v.current[res.key] = x;
  }
  if (r.weapons !== undefined) {
    if (!Array.isArray(r.weapons) || r.weapons.length > 30)
      throw new FormulaError('Armas demais (máximo 30)');
    v.weapons = r.weapons.map((w) => {
      const book = w.ref ? def.weapons.find((x) => x.key === w.ref) : undefined;
      if (w.ref && !book) throw new FormulaError(`Arma desconhecida: ${w.ref}`);
      const name = String(w.name ?? book?.name ?? '')
        .trim()
        .slice(0, 60);
      if (!name) throw new FormulaError('Toda arma precisa de nome');
      const damage = String(w.damage ?? book?.damage ?? '').replace(/\s/g, '');
      if (!DICE_RE.test(damage)) throw new FormulaError(`Dano inválido em ${name} (use algo como 1d8)`);
      const int = (x: unknown, lo: number, hi: number, d: number) => {
        const n = x === undefined ? d : Number(x);
        if (!Number.isInteger(n) || n < lo || n > hi) throw new FormulaError(`Valor inválido em ${name}`);
        return n;
      };
      const kind = w.kind ?? book?.kind ?? 'melee';
      if (kind !== 'melee' && kind !== 'ranged') throw new FormulaError(`Tipo inválido em ${name}`);
      const ranged = w.ranged ?? book?.ranged;
      if (ranged && !['arremesso', 'disparo', 'fogo'].includes(ranged))
        throw new FormulaError(`Tipo inválido em ${name}`);
      return {
        ...(book ? { ref: book.key } : {}),
        name,
        kind,
        ...(ranged ? { ranged } : {}),
        damage,
        critRange: int(w.critRange ?? book?.critRange, 2, 20, 20),
        critMult: int(w.critMult ?? book?.critMult, 2, 10, 2),
        damageType: String(w.damageType ?? book?.damageType ?? '').slice(0, 30),
        spaces: int(w.spaces ?? book?.spaces, 0, 20, 1),
        attackBonus: int(w.attackBonus, -50, 50, 0),
      };
    });
  }
  if (r.protections !== undefined) {
    if (!Array.isArray(r.protections) || r.protections.length > 5)
      throw new FormulaError('Proteções demais (máximo 5)');
    v.protections = r.protections.map((p) => {
      const book = p.ref ? def.protections.find((x) => x.key === p.ref) : undefined;
      if (p.ref && !book) throw new FormulaError(`Proteção desconhecida: ${p.ref}`);
      const name = String(p.name ?? book?.name ?? '')
        .trim()
        .slice(0, 60);
      const defense = Number(p.defense ?? book?.defense ?? 0);
      const spaces = Number(p.spaces ?? book?.spaces ?? 0);
      if (
        !name ||
        !Number.isInteger(defense) ||
        Math.abs(defense) > 50 ||
        !Number.isInteger(spaces) ||
        spaces < 0 ||
        spaces > 20
      )
        throw new FormulaError('Proteção inválida');
      return { ...(book ? { ref: book.key } : {}), name, defense, spaces };
    });
  }
  if (r.otherSpaces !== undefined) {
    if (!Number.isInteger(r.otherSpaces) || r.otherSpaces < 0 || r.otherSpaces > 200)
      throw new FormulaError('Espaços de itens inválidos');
    v.otherSpaces = r.otherSpaces;
  }
  if (r.rituals !== undefined) {
    const known = new Set(def.rituals.map((x) => x.key));
    const bad = r.rituals.find((k) => !known.has(k));
    if (bad) throw new FormulaError(`Ritual desconhecido: ${bad}`);
    v.rituals = [...new Set(r.rituals)].slice(0, 100);
  }
  if (r.powers !== undefined) {
    const known = new Set([
      ...def.powers.map((x) => x.key),
      ...def.classes.flatMap((c) => c.powers.map((x) => `${c.key}:${x.key}`)),
    ]);
    const bad = r.powers.find((k) => !known.has(k));
    if (bad) throw new FormulaError(`Poder desconhecido: ${bad}`);
    v.powers = r.powers.slice(0, 60);
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
    gear: (k) => {
      if (k === 'defense') return v.protections.reduce((s, p) => s + p.defense, 0);
      if (k === 'spaces')
        return (
          v.weapons.reduce((s, w) => s + w.spaces, 0) +
          v.protections.reduce((s, p) => s + p.spaces, 0) +
          v.otherSpaces
        );
      throw new FormulaError(`gear: valor desconhecido ${k}`);
    },
  };
}

export interface ComputedSheet {
  resources: { key: string; label: string; abbr: string; max: number; current: number; lost?: number }[];
  derived: { key: string; label: string; value: number; suffix: string }[];
}

export function computeSheet(def: SystemDefinition, v: SystemValues): ComputedSheet {
  const ctx = ctxFor(def, v);
  return {
    resources: def.resources.map((r) => {
      const lost = v.perm?.[r.key] ?? 0;
      const max = Math.max(0, Math.floor(evalFormula(r.max, ctx)) - lost);
      const current = Math.min(v.current[r.key] ?? max, max);
      return { key: r.key, label: r.label, abbr: r.abbr, max, current, ...(lost ? { lost } : {}) };
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
export function buildInitiative(
  def: SystemDefinition,
  v: SystemValues,
): { expression: string; label: string } {
  const ini = def.initiative;
  if (ini?.skill) return buildCheck(def, v, { skill: ini.skill });
  if (ini?.attribute) return buildCheck(def, v, { attribute: ini.attribute });
  return { expression: `1d${def.check.die}`, label: 'Iniciativa' };
}

/** Recurso usado como "vida" no combate (o primeiro recurso do sistema, ex.: PV). */
export function healthResource(def: SystemDefinition): string | undefined {
  return def.resources[0]?.key;
}
