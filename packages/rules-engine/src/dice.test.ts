import { describe, expect, it } from 'vitest';
import { DiceError, DICE_LIMITS, normalizeDice, type Rng, rollDice, seededRng } from './dice';

/** RNG que devolve a sequência dada (para testes exatos). */
const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => {
    const v = values[i++];
    if (v === undefined) throw new Error('sequência acabou');
    return v;
  };
};

describe('notação', () => {
  it('normaliza', () => {
    expect(normalizeDice(' 2D6 + 3 ')).toBe('2d6+3');
    expect(normalizeDice('d20')).toBe('1d20');
    expect(normalizeDice('d%')).toBe('1d100');
    expect(normalizeDice('4d6k3')).toBe('4d6kh3');
    expect(normalizeDice('-1d4+2')).toBe('-1d4+2');
    expect(normalizeDice('4dF')).toBe('4dF');
  });

  it.each([
    ['', /Digite/],
    ['abc', /Não entendi/],
    ['2d', /inválida|Não entendi/],
    ['0d6', /pelo menos 1/],
    ['101d6', /No máximo 100/],
    ['1d1', /entre 2/],
    ['1d1001', /entre 2/],
    ['4d6kh5', /entre 1 e 4/],
    ['2d6*3', /inválida/],
    ['process.exit()', /inválida/],
    ['1d6;drop table', /inválida/],
    ['4dF!', /Fate/],
  ])('rejeita %s', (expr, msg) => {
    expect(() => rollDice(expr, seededRng(1))).toThrow(DiceError);
    expect(() => rollDice(expr, seededRng(1))).toThrow(msg);
  });

  it('limita o total de dados', () => {
    expect(() => rollDice('100d6+100d6+100d6+1d6', seededRng(1))).toThrow(/No máximo 300/);
    expect(() => rollDice('x'.repeat(DICE_LIMITS.maxExpressionLength + 1), seededRng(1))).toThrow(/longa/);
  });
});

describe('rolagem', () => {
  it('soma dados e modificadores', () => {
    const r = rollDice('2d6+3', seq(4, 5));
    expect(r.total).toBe(12);
    expect(r.parts[0]).toMatchObject({ type: 'dice', subtotal: 9 });
  });

  it('subtrai termos', () => {
    expect(rollDice('1d8-1d4-2', seq(6, 3)).total).toBe(1);
  });

  it('mantém os maiores / menores', () => {
    const kh = rollDice('4d6kh3', seq(1, 6, 3, 5));
    expect(kh.total).toBe(14);
    const p = kh.parts[0];
    expect(p?.type === 'dice' && p.dice.map((d) => d.kept)).toEqual([false, true, true, true]);
    expect(rollDice('2d20kl1', seq(17, 4)).total).toBe(4);
    expect(rollDice('4d6dl1', seq(2, 2, 6, 6)).total).toBe(14);
    expect(rollDice('3d6dh1', seq(6, 1, 2)).total).toBe(3);
  });

  it('explode no valor máximo', () => {
    const r = rollDice('2d6!', seq(6, 6, 2, 3));
    expect(r.total).toBe(17);
    const p = r.parts[0];
    expect(p?.type === 'dice' && p.dice.filter((d) => d.exploded)).toHaveLength(2);
  });

  it('limita explosões infinitas', () => {
    const r = rollDice('1d2!', () => 2);
    const p = r.parts[0];
    expect(p?.type === 'dice' && p.dice.length).toBe(1 + DICE_LIMITS.maxExplosionsPerTerm);
  });

  it('dados Fate', () => {
    expect(rollDice('4dF', seq(-1, 0, 1, 1)).total).toBe(1);
  });

  it('marca crítico e falha', () => {
    const p = rollDice('2d20', seq(20, 1)).parts[0];
    expect(p?.type === 'dice' && p.dice).toEqual([
      { value: 20, kept: true, max: true },
      { value: 1, kept: true, min: true },
    ]);
  });

  it('é reproduzível com semente e respeita os limites das faces', () => {
    const a = rollDice('10d20', seededRng(42));
    const b = rollDice('10d20', seededRng(42));
    expect(a).toEqual(b);
    const r = rollDice('100d6+100d6+100d6', seededRng(7));
    for (const p of r.parts)
      if (p.type === 'dice') for (const d of p.dice) expect(d.value).toBeGreaterThanOrEqual(1);
    for (const p of r.parts)
      if (p.type === 'dice') for (const d of p.dice) expect(d.value).toBeLessThanOrEqual(6);
  });

  it('distribuição aproximadamente uniforme', () => {
    const rng = seededRng(123);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60000; i++) counts[rng(1, 6) - 1]!++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });
});
