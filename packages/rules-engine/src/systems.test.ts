import { describe, expect, it } from 'vitest';
import { evalFormula, FormulaError, parseFormula } from './expr';
import { buildCheck, computeSheet, emptyValues, sanitizeValues, validateSystem } from './system';
import { ORDEM_PARANORMAL as OP } from './systems/ordem-paranormal';

const ctx = (attrs: Record<string, number> = {}, fields: Record<string, string | number> = {}) => ({
  attr: (k: string) => attrs[k] ?? 0,
  field: (k: string) => fields[k],
});

describe('fórmulas seguras', () => {
  it('aritmética, precedência e funções', () => {
    expect(evalFormula('1 + 2 * 3', ctx())).toBe(7);
    expect(evalFormula('(1 + 2) * 3', ctx())).toBe(9);
    expect(evalFormula('10 - 4 - 3', ctx())).toBe(3);
    expect(evalFormula('-2 + 5', ctx())).toBe(3);
    expect(evalFormula('floor(7 / 2) + max(1, 4, 2)', ctx())).toBe(7);
    expect(evalFormula('if(attr("A") >= 2, 10, 20)', ctx({ A: 3 }))).toBe(10);
    expect(evalFormula('lookup("c", "x", 1, "y", 2, 9)', ctx({}, { c: 'y' }))).toBe(2);
    expect(evalFormula('lookup("c", "x", 1, "y", 2, 9)', ctx({}, { c: 'z' }))).toBe(9);
  });

  it.each([
    'process.exit()',
    'constructor',
    'attr("A"); 1',
    '1 +',
    'foo(1)',
    '"a" + 1',
    '1 / 0',
    '`x`',
    '((((((((((((((((((((((((((((((((((((((((((((1))))))))))))))))))))))))))))))))))))))))))))',
  ])('rejeita %s', (src) => {
    expect(() => evalFormula(src, ctx())).toThrow(FormulaError);
  });

  it('não aceita texto gigante', () => {
    expect(() => parseFormula('1+'.repeat(300) + '1')).toThrow(/longa/);
  });
});

describe('Ordem Paranormal', () => {
  const def = validateSystem(OP);

  it('definição é válida e todas as fórmulas executam', () => {
    expect(def.skills).toHaveLength(28);
    expect(def.attributes.map((a) => a.key)).toEqual(['AGI', 'FOR', 'INT', 'PRE', 'VIG']);
  });

  it('PV/PE/SAN do combatente iniciante (livro p.35)', () => {
    const v = sanitizeValues(def, {
      attributes: { VIG: 2, PRE: 1 },
      fields: { classe: 'combatente', nex: '5' },
    });
    const s = computeSheet(def, v);
    expect(s.resources.map((r) => [r.abbr, r.max])).toEqual([
      ['PV', 22],
      ['PE', 3],
      ['SAN', 12],
    ]);
  });

  it('cresce com o NEX: especialista NEX 25% (4 níveis acima)', () => {
    const v = sanitizeValues(def, {
      attributes: { VIG: 1, PRE: 2 },
      fields: { classe: 'especialista', nex: '25' },
    });
    const s = computeSheet(def, v);
    // PV 16+1 + 4×(3+1) = 33 · PE 3+2 + 4×(3+2) = 25 · SAN 16 + 4×4 = 32
    expect(s.resources.map((r) => r.max)).toEqual([33, 25, 32]);
    expect(s.derived.find((d) => d.key === 'limite_pe')!.value).toBe(5);
  });

  it('ocultista NEX 99% tem limite de PE 20', () => {
    const v = sanitizeValues(def, { fields: { classe: 'ocultista', nex: '99' } });
    expect(computeSheet(def, v).derived.find((d) => d.key === 'limite_pe')!.value).toBe(20);
  });

  it('Defesa = 10 + Agilidade (p.46)', () => {
    const v = sanitizeValues(def, { attributes: { AGI: 3 } });
    expect(computeSheet(def, v).derived.find((d) => d.key === 'defesa')!.value).toBe(13);
  });

  it('teste de perícia: atributo em d20, fica com o maior, soma o grau', () => {
    const v = sanitizeValues(def, { attributes: { FOR: 3 }, skills: { atletismo: 'treinado' } });
    expect(buildCheck(def, v, { skill: 'atletismo' })).toMatchObject({
      expression: '3d20kh1+5',
      label: 'Atletismo',
    });
  });

  it('atributo 0: rola 2d20 e fica com o pior', () => {
    const v = sanitizeValues(def, { attributes: { AGI: 0 } });
    expect(buildCheck(def, v, { skill: 'furtividade' }).expression).toBe('2d20kl1');
    expect(buildCheck(def, v, { attribute: 'AGI', bonus: 2 }).expression).toBe('2d20kl1+2');
  });

  it('avisa sobre perícia somente treinada e kit', () => {
    const v = emptyValues(def);
    const r = buildCheck(def, v, { skill: 'crime' });
    expect(r.notes.join(' ')).toMatch(/treinado/);
    expect(r.notes.join(' ')).toMatch(/kit/);
  });

  it('rejeita valores fora das regras', () => {
    expect(() => sanitizeValues(def, { attributes: { AGI: 9 } })).toThrow(/entre 0 e 5/);
    expect(() => sanitizeValues(def, { fields: { classe: 'mago' } })).toThrow(/Classe/);
    expect(() => sanitizeValues(def, { skills: { voar: 'treinado' } })).toThrow(/desconhecida/);
    expect(() => sanitizeValues(def, { skills: { luta: 'mestre' } })).toThrow(/Grau/);
  });

  it('origens concedem perícias existentes', () => {
    const origem = def.fields.find((f) => f.key === 'origem')!;
    const keys = new Set(def.skills.map((s) => s.key));
    for (const o of origem.options!) for (const s of o.grantsSkills ?? []) expect(keys.has(s)).toBe(true);
    expect(origem.options).toHaveLength(26);
  });
});

describe('combate em Ordem Paranormal', async () => {
  const { buildInitiative, emptyValues, validateSystem } = await import('./system');
  const { ORDEM_PARANORMAL } = await import('./systems/ordem-paranormal');
  const def = validateSystem(ORDEM_PARANORMAL);
  it('Iniciativa é teste da perícia Iniciativa (Agilidade + treino)', () => {
    const v = {
      ...emptyValues(def),
      attributes: { ...emptyValues(def).attributes, AGI: 3 },
      skills: { iniciativa: 'treinado' },
    };
    expect(buildInitiative(def, v)).toMatchObject({ expression: '3d20kh1+5', label: 'Iniciativa' });
  });
  it('condições do apêndice têm resumo e página', () => {
    expect(def.conditions.length).toBeGreaterThanOrEqual(30);
    for (const c of def.conditions) expect(c.page === 320 || c.page === 321).toBe(true);
    expect(def.conditions.find((c) => c.key === 'morrendo')?.label).toBe('Morrendo');
  });
  it('sistema sem configuração de Iniciativa usa 1 dado do sistema', () => {
    const custom = validateSystem({
      id: 'x',
      name: 'X',
      source: { title: 'Y' },
      attributes: [],
      check: { kind: 'die-plus-attribute', die: 20 },
    });
    expect(buildInitiative(custom, emptyValues(custom)).expression).toBe('1d20');
  });
});
