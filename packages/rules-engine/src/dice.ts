/**
 * Rolagem de dados com notação segura (sem eval, sem código arbitrário).
 *
 * Suporta:
 *   2d6+3        soma de dados e modificadores
 *   d20, 1d20    um dado
 *   d%           dado de 100 faces
 *   4dF          dados Fudge/Fate (-1, 0, +1)
 *   4d6kh3       manter os 3 maiores (k = kh)   ·  2d20kl1  manter o menor
 *   4d6dl1       descartar o menor              ·  dh = descartar maiores
 *   3d6!         dados explosivos (máximo rola de novo e soma)
 *   1d8+1d6-2    vários termos
 */

export type Rng = (min: number, max: number) => number; // inteiro em [min, max]

export const DICE_LIMITS = {
  maxExpressionLength: 120,
  maxTerms: 20,
  maxDicePerTerm: 100,
  maxTotalDice: 300,
  maxSides: 1000,
  maxModifier: 100_000,
  maxExplosionsPerTerm: 100,
} as const;

export class DiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiceError';
  }
}

export interface DieResult {
  value: number;
  kept: boolean;
  exploded?: boolean;
  /** valor máximo possível do dado (crítico visual) */
  max?: boolean;
  /** valor mínimo possível (falha visual) */
  min?: boolean;
}

export type RollPart =
  | { type: 'dice'; sign: 1 | -1; notation: string; dice: DieResult[]; subtotal: number }
  | { type: 'number'; sign: 1 | -1; value: number };

export interface RollResult {
  expression: string;
  total: number;
  parts: RollPart[];
}

type Keep = { mode: 'kh' | 'kl' | 'dh' | 'dl'; n: number };
type DiceTerm = {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number | 'F';
  keep?: Keep;
  explode: boolean;
};
type NumTerm = { kind: 'num'; sign: 1 | -1; value: number };
type Term = DiceTerm | NumTerm;

const TERM_RE = /^(\d*)d(\d+|%|f)((?:k|kh|kl|dh|dl)\d+)?(!)?$|^(\d+)$/i;

/** Converte a expressão em termos validados. Lança DiceError com mensagem em português. */
export function parseDice(input: string): Term[] {
  const src = input.replace(/\s+/g, '').toLowerCase();
  if (!src) throw new DiceError('Digite uma rolagem, por exemplo 1d20+5.');
  if (src.length > DICE_LIMITS.maxExpressionLength) throw new DiceError('Expressão longa demais.');
  if (!/^[+-]?[0-9a-z%!]+([+-][0-9a-z%!]+)*$/.test(src))
    throw new DiceError(`Rolagem inválida: "${input.trim()}".`);

  const tokens = src.match(/[+-]?[^+-]+/g) ?? [];
  if (tokens.length > DICE_LIMITS.maxTerms) throw new DiceError('Termos demais na rolagem.');
  let totalDice = 0;
  return tokens.map((tok) => {
    const sign: 1 | -1 = tok.startsWith('-') ? -1 : 1;
    const body = tok.replace(/^[+-]/, '');
    const m = TERM_RE.exec(body);
    if (!m) throw new DiceError(`Não entendi "${body}". Exemplos: 1d20, 2d6+3, 4d6kh3.`);
    if (m[5] !== undefined) {
      const value = Number(m[5]);
      if (value > DICE_LIMITS.maxModifier) throw new DiceError('Modificador grande demais.');
      return { kind: 'num', sign, value } satisfies NumTerm;
    }
    const count = m[1] ? Number(m[1]) : 1;
    const sides: number | 'F' = m[2] === '%' ? 100 : m[2] === 'f' ? 'F' : Number(m[2]);
    if (count < 1) throw new DiceError('A quantidade de dados precisa ser pelo menos 1.');
    if (count > DICE_LIMITS.maxDicePerTerm)
      throw new DiceError(`No máximo ${DICE_LIMITS.maxDicePerTerm} dados por termo.`);
    if (sides !== 'F' && (sides < 2 || sides > DICE_LIMITS.maxSides))
      throw new DiceError(`Dados precisam ter entre 2 e ${DICE_LIMITS.maxSides} faces.`);
    totalDice += count;
    if (totalDice > DICE_LIMITS.maxTotalDice)
      throw new DiceError(`No máximo ${DICE_LIMITS.maxTotalDice} dados por rolagem.`);
    let keep: Keep | undefined;
    if (m[3]) {
      const km = /^(k|kh|kl|dh|dl)(\d+)$/.exec(m[3])!;
      const mode = (km[1] === 'k' ? 'kh' : km[1]) as Keep['mode'];
      const n = Number(km[2]);
      if (n < 1 || n > count) throw new DiceError(`"${m[3]}" precisa estar entre 1 e ${count}.`);
      keep = { mode, n };
    }
    const explode = m[4] === '!';
    if (explode && sides === 'F') throw new DiceError('Dados Fate não explodem.');
    return { kind: 'dice', sign, count, sides, keep, explode } satisfies DiceTerm;
  });
}

function notationOf(t: DiceTerm): string {
  const s = t.sides === 'F' ? 'F' : String(t.sides);
  return `${t.count}d${s}${t.keep ? `${t.keep.mode}${t.keep.n}` : ''}${t.explode ? '!' : ''}`;
}

/** Normaliza a expressão para exibição: "2D6 + 3" → "2d6+3". */
export function normalizeDice(input: string): string {
  return parseDice(input)
    .map((t, i) => {
      const body = t.kind === 'num' ? String(t.value) : notationOf(t);
      return t.sign === -1 ? `-${body}` : i === 0 ? body : `+${body}`;
    })
    .join('');
}

/** Rola a expressão. `rng` é injetado: criptográfico em produção, previsível nos testes. */
export function rollDice(input: string, rng: Rng): RollResult {
  const terms = parseDice(input);
  const parts: RollPart[] = terms.map((t) => {
    if (t.kind === 'num') return { type: 'number', sign: t.sign, value: t.value };
    const lo = t.sides === 'F' ? -1 : 1;
    const hi = t.sides === 'F' ? 1 : t.sides;
    const dice: DieResult[] = [];
    let explosions = 0;
    for (let i = 0; i < t.count; i++) {
      let v = rng(lo, hi);
      dice.push({ value: v, kept: true });
      while (t.explode && v === hi && explosions < DICE_LIMITS.maxExplosionsPerTerm) {
        explosions++;
        v = rng(lo, hi);
        dice.push({ value: v, kept: true, exploded: true });
      }
    }
    if (t.keep) {
      const order = dice.map((d, i) => ({ v: d.value, i })).sort((a, b) => a.v - b.v || a.i - b.i);
      const n = t.keep.n;
      const drop =
        t.keep.mode === 'kh'
          ? order.slice(0, order.length - n)
          : t.keep.mode === 'kl'
            ? order.slice(n)
            : t.keep.mode === 'dl'
              ? order.slice(0, n)
              : order.slice(order.length - n);
      for (const d of drop) dice[d.i]!.kept = false;
    }
    if (t.sides !== 'F')
      for (const d of dice) {
        if (d.value === hi) d.max = true;
        if (d.value === lo) d.min = true;
      }
    const subtotal = dice.filter((d) => d.kept).reduce((s, d) => s + d.value, 0);
    return { type: 'dice', sign: t.sign, notation: notationOf(t), dice, subtotal };
  });
  const total = parts.reduce((s, p) => s + p.sign * (p.type === 'dice' ? p.subtotal : p.value), 0);
  return { expression: normalizeDice(input), total, parts };
}

/** RNG previsível para testes e reprodução (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (min, max) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return min + Math.floor(r * (max - min + 1));
  };
}
