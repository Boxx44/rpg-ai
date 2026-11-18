import { describe, expect, it } from 'vitest';
import { buildAttack, keptD20, multiplyDice, planRest, planRitual } from './actions';
import { normalizeDice, rollDice, seededRng } from './dice';
import { computeSheet, emptyValues, sanitizeValues, validateSystem } from './system';
import { ORDEM_PARANORMAL } from './systems/ordem-paranormal';

const def = validateSystem(ORDEM_PARANORMAL);
const base = (over: object = {}) =>
  sanitizeValues(def, {
    attributes: { AGI: 2, FOR: 3, INT: 1, PRE: 2, VIG: 1 },
    fields: { classe: 'ocultista', nex: '25', origem: 'academico' },
    skills: { luta: 'treinado', ocultismo: 'treinado' },
    ...over,
  });

describe('dados do livro', () => {
  it('chaves únicas e dados válidos', () => {
    for (const list of [def.weapons, def.rituals, def.creatures, def.powers]) {
      const keys = list.map((x) => x.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    for (const w of def.weapons) expect(() => normalizeDice(w.damage)).not.toThrow();
    for (const c of def.creatures) {
      expect(c.pv).toBeGreaterThan(0);
      for (const a of c.attacks) {
        expect(() => normalizeDice(a.test)).not.toThrow();
        expect(() => normalizeDice(a.damage)).not.toThrow();
      }
    }
    for (const r of def.rituals) {
      expect(r.circle).toBeGreaterThanOrEqual(1);
      expect(r.circle).toBeLessThanOrEqual(4);
      if (r.damage) expect(() => normalizeDice(r.damage!.dice)).not.toThrow();
    }
    expect(def.rituals.length).toBeGreaterThanOrEqual(80);
    expect(def.classes.map((c) => c.trails.length)).toEqual([5, 5, 5]);
  });
});

describe('armas e carga', () => {
  it('ficha recebe arma do livro; Defesa soma proteção; carga é 5 × Força', () => {
    const v = base({ weapons: [{ ref: 'katana' }], protections: [{ ref: 'leve' }], otherSpaces: 3 });
    expect(v.weapons[0]).toMatchObject({
      name: 'Katana',
      damage: '1d10',
      critRange: 19,
      critMult: 2,
      spaces: 2,
    });
    const d = Object.fromEntries(computeSheet(def, v).derived.map((x) => [x.key, x.value]));
    expect(d.defesa).toBe(10 + 2 + 5);
    expect(d.carga).toBe(15);
    expect(d.carga_usada).toBe(2 + 2 + 3);
    expect(d.dt_rituais).toBe(10 + 5 + 2);
    expect(() => base({ weapons: [{ ref: 'sabre_de_luz' }] })).toThrow(/desconhecida/);
    expect(() => base({ weapons: [{ name: 'X', damage: 'rm -rf' }] })).toThrow(/Dano inválido/);
  });

  it('corpo a corpo: Luta e Força no dano; crítico multiplica só os dados', () => {
    const v = base({ weapons: [{ ref: 'machado' }, { ref: 'pistola' }, { ref: 'faca' }] });
    const m = buildAttack(def, v, 0);
    expect(m.attack.expression).toBe('3d20kh1+5');
    expect(m.damage).toMatchObject({ expression: '1d8+3', critExpression: '3d8+3' });
    const p = buildAttack(def, v, 1);
    expect(p.attack.expression).toBe('2d20kh1');
    expect(p.damage).toMatchObject({ expression: '1d12', critExpression: '2d12' });
    expect(p.critRange).toBe(18);
    const t = buildAttack(def, v, 2, { mode: 'thrown' });
    expect(t.attack.expression).toBe('2d20kh1');
    expect(t.damage.expression).toBe('1d4+3');
    expect(() => buildAttack(def, v, 1, { mode: 'melee' })).toThrow();
    expect(multiplyDice('2d6', 3)).toBe('6d6');
  });

  it('identifica o d20 que valeu', () => {
    const r = rollDice('3d20kh1+5', seededRng(7));
    const kept = keptD20(r)!;
    expect(r.total).toBe(kept + 5);
  });
});

describe('rituais', () => {
  it('custo por círculo, DT, limite de PE e custo paranormal', () => {
    const v = base({
      rituals: ['eletrocussao', 'cinereria', 'cineraria'].filter((k) => def.rituals.some((r) => r.key === k)),
    });
    const p = planRitual(def, v, 'eletrocussao', 'basic');
    expect(p.cost).toBe(1);
    expect(p.dt).toBe(17);
    expect(p.sanityCheck).toMatchObject({ dc: 21, loss: 1 });
    expect(p.effect?.expression).toBe('3d6');
    const d = planRitual(def, v, 'eletrocussao', 'discente');
    expect(d.cost).toBe(3);
    expect(d.effect).toBeUndefined();
    expect(() => planRitual(def, v, 'eletrocussao', 'verdadeiro')).toThrow(/limite de PE/);
    const f = planRitual(def, v, 'cineraria', 'basic');
    expect(f.sanityLoss).toBe(1);
    expect(f.sanityCheck).toBeUndefined();
    expect(() => planRitual(def, v, 'decadencia', 'basic')).toThrow(/não está entre/);
    const broke = base({ rituals: ['eletrocussao'], current: { pe: 0 } });
    expect(() => planRitual(def, broke, 'eletrocussao', 'basic')).toThrow(/insuficientes/);
  });
  it('emptyValues tem listas vazias', () => {
    expect(emptyValues(def)).toMatchObject({ weapons: [], rituals: [], powers: [] });
  });
});

describe('regras completadas', () => {
  it('ameaças da realidade entram no bestiário com crítico das armas', () => {
    const pol = def.creatures.find((c) => c.key === 'policial')!;
    expect(pol).toMatchObject({ pv: 15, defesa: 19, element: null, page: 297 });
    expect(pol.attacks[1]).toMatchObject({ name: 'Pistola', critRange: 18, test: '2d20kh1+5' });
    expect(def.creatures.filter((c) => c.element === null)).toHaveLength(18);
  });

  it('perda permanente reduz o máximo do recurso', () => {
    const v = base({ perm: { san: 3 } });
    const san = computeSheet(def, v).resources.find((r) => r.key === 'san')!;
    expect(san).toMatchObject({ lost: 3 });
    expect(san.max).toBe(computeSheet(def, base()).resources.find((r) => r.key === 'san')!.max - 3);
    expect(() => base({ perm: { san: -1 } })).toThrow();
    expect(() => base({ perm: { mana: 1 } })).toThrow();
    const f = planRitual(def, base({ rituals: ['cineraria'] }), 'cineraria', 'basic');
    expect(f.permanentLoss).toBe(1);
  });

  it('interlúdio: dormir e relaxar conforme limite de PE e condição (p. 103)', () => {
    const v = base({ current: { pv: 1, pe: 0, san: 2 } });
    const r = planRest(def, v, {
      sleep: true,
      relax: true,
      quality: 'confortavel',
      meal: 'nutritivo',
      relaxPartners: 2,
    });
    // NEX 25% → limite 5; confortável x2; nutritivo +1 nível só no PV
    expect(r.gains.find((g) => g.key === 'pv')!.amount).toBe(15);
    expect(r.gains.find((g) => g.key === 'pe')!.amount).toBe(10);
    expect(r.gains.find((g) => g.key === 'san')!.amount).toBe(10 + 2);
    const half = planRest(def, v, { sleep: true, relax: false, quality: 'precaria' });
    expect(half.changes.pv).toBe(1 + 2);
    expect(() => planRest(def, v, { sleep: false, relax: false, quality: 'normal' })).toThrow();
    // não passa do máximo
    const full = planRest(def, base(), { sleep: true, relax: false, quality: 'luxuosa' });
    expect(full.gains.every((g) => g.amount === 0)).toBe(true);
  });
});

describe('ajuda para iniciantes', () => {
  it('explica todo atributo, perícia, origem e classe do sistema', () => {
    const h = def.help!;
    for (const a of def.attributes) expect(h.attributes[a.key]).toBeTruthy();
    for (const s of def.skills) expect(h.skills[s.key]).toBeTruthy();
    for (const o of def.fields.find((f) => f.key === 'origem')!.options!)
      expect(h.origins[String(o.value)]?.power).toBeTruthy();
    for (const c of def.classes) expect(h.classes[c.key]).toBeTruthy();
    for (const r of def.resources) expect(h.terms[r.key]).toBeTruthy();
    for (const d of def.derived) expect(h.terms[d.key]).toBeTruthy();
  });
});
