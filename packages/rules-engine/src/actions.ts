/**
 * Ações de jogo calculadas pelas regras do sistema (ataque com arma, conjurar ritual).
 * Só monta as rolagens e os números; quem rola os dados é o servidor.
 */
import type { RollResult } from './dice';
import { evalFormula, FormulaError } from './expr';
import { buildCheck, computeSheet, type SystemDefinition, type SystemValues } from './system';

export type AttackMode = 'melee' | 'ranged' | 'thrown';

export interface AttackPlan {
  attack: { expression: string; label: string };
  damage: { expression: string; critExpression: string; type: string };
  critRange: number;
  critMult: number;
  notes: string[];
}

/** Multiplica os dados (não os bônus): 1d8+3 em x2 vira 2d8+3 (p. 64). */
export function multiplyDice(dice: string, mult: number): string {
  const m = /^(\d+)d(\d+)$/.exec(dice);
  if (!m) throw new FormulaError(`Dano inválido: ${dice}`);
  return `${Number(m[1]) * mult}d${m[2]}`;
}

export function buildAttack(
  def: SystemDefinition,
  v: SystemValues,
  weaponIndex: number,
  opts: { mode?: AttackMode; bonus?: number; damageBonus?: number } = {},
): AttackPlan {
  const w = v.weapons[weaponIndex];
  if (!w) throw new FormulaError('Arma não encontrada na ficha');
  if (!def.combat) throw new FormulaError('Este sistema ainda não define como ataques funcionam');
  const mode: AttackMode =
    opts.mode ?? (w.kind === 'melee' ? 'melee' : w.ranged === 'arremesso' ? 'thrown' : 'ranged');
  if (mode === 'melee' && w.kind !== 'melee') throw new FormulaError(`${w.name} não é arma corpo a corpo`);
  if (mode === 'ranged' && w.kind !== 'ranged')
    throw new FormulaError(`${w.name} não é arma de disparo ou de fogo`);
  const rule = def.combat[mode];
  const check = buildCheck(def, v, { skill: rule.skill, bonus: w.attackBonus + (opts.bonus ?? 0) });
  const notes = [...check.notes];
  const book = w.ref ? def.weapons.find((x) => x.key === w.ref) : undefined;
  if (mode === 'thrown' && w.kind === 'melee' && !book?.range)
    notes.push('Arma sem alcance arremessada: –1 dado no teste (aplique se for o caso).');
  const attr = rule.damageAttr ? (v.attributes[rule.damageAttr] ?? 0) : 0;
  const flat = attr + (opts.damageBonus ?? 0);
  const plus = flat ? `${flat > 0 ? '+' : ''}${flat}` : '';
  return {
    attack: { expression: check.expression, label: `${w.name}: ataque` },
    damage: {
      expression: `${w.damage}${plus}`,
      critExpression: `${multiplyDice(w.damage, w.critMult)}${plus}`,
      type: w.damageType,
    },
    critRange: w.critRange,
    critMult: w.critMult,
    notes,
  };
}

/** Valor do d20 que valeu no teste (para saber se foi crítico). */
export function keptD20(r: RollResult): number | null {
  for (const p of r.parts) {
    if (p.type !== 'dice' || !/d20/.test(p.notation)) continue;
    const kept = p.dice.filter((d) => d.kept);
    if (kept.length) return Math.max(...kept.map((d) => d.value));
  }
  return null;
}

export type RitualForm = 'basic' | 'discente' | 'verdadeiro';

export interface RitualPlan {
  name: string;
  cost: number;
  dt: number;
  /** Recurso que é gasto (ex.: PE) e quanto há agora. */
  spend: { key: string; current: number; after: number };
  /** Teste de custo paranormal (Ocultismo contra DT 20 + custo). */
  sanityCheck?: { expression: string; dc: number; loss: number };
  /** Perda automática de Sanidade (rituais de Medo). */
  sanityLoss?: number;
  permanentNote?: string;
  /** Dado do efeito na forma básica (dano ou cura), quando o livro dá um. */
  effect?: { expression: string; label: string };
  notes: string[];
}

export function planRitual(
  def: SystemDefinition,
  v: SystemValues,
  key: string,
  form: RitualForm,
): RitualPlan {
  const rules = def.ritualRules;
  if (!rules) throw new FormulaError('Este sistema não tem rituais');
  const r = def.rituals.find((x) => x.key === key);
  if (!r) throw new FormulaError('Ritual desconhecido');
  if (!v.rituals.includes(key))
    throw new FormulaError(`${r.name} não está entre os rituais deste personagem`);
  const base = rules.costByCircle[String(r.circle)];
  if (base === undefined) throw new FormulaError('Custo do círculo não definido');
  const extra = form === 'basic' ? 0 : form === 'discente' ? r.discente : r.verdadeiro;
  if (extra === undefined) throw new FormulaError(`${r.name} não tem forma ${form}`);
  const cost = base + extra;
  const sheet = computeSheet(def, v);
  const limit = sheet.derived.find((d) => d.key === 'limite_pe')?.value;
  if (limit !== undefined && cost > limit)
    throw new FormulaError(`Custo ${cost} PE passa do seu limite de PE por turno (${limit}).`);
  const res = sheet.resources.find((x) => x.key === rules.spend);
  if (!res) throw new FormulaError('Recurso de conjuração não encontrado');
  if (res.current < cost) throw new FormulaError(`PE insuficientes: precisa de ${cost}, tem ${res.current}.`);
  const ctx = {
    attr: (k: string) => v.attributes[k] ?? 0,
    field: (k: string) => v.fields[k],
  };
  const dt = evalFormula(rules.dt, ctx);
  const plan: RitualPlan = {
    name: r.name,
    cost,
    dt,
    spend: { key: res.key, current: res.current, after: res.current - cost },
    notes: [],
  };
  const fear = rules.fearElement && r.elements.includes(rules.fearElement);
  if (fear) {
    plan.sanityLoss = cost;
    plan.permanentNote = `Ritual de Medo: além disso, perde ${form === 'basic' ? 1 : form === 'discente' ? 2 : 3} de Sanidade permanentemente.`;
  } else if (rules.sanityCheckSkill) {
    const c = buildCheck(def, v, { skill: rules.sanityCheckSkill });
    plan.sanityCheck = { expression: c.expression, dc: 20 + cost, loss: cost };
  }
  if (form === 'basic') {
    if (r.damage)
      plan.effect = {
        expression: r.damage.dice,
        label: `${r.name}: dano${r.damage.type ? ` (${r.damage.type})` : ''}`,
      };
    else if (r.heal) plan.effect = { expression: r.heal, label: `${r.name}: cura` };
  } else if (r.damage || r.heal) plan.notes.push('Formas avançadas mudam o efeito: confira o dado no livro.');
  if (r.resistance) plan.notes.push(`Resistência: ${r.resistance} (DT ${dt}).`);
  if (form !== 'basic')
    plan.notes.push('Formas avançadas têm requisitos de círculo/afinidade: confira no livro.');
  return plan;
}
