import { describe, expect, it } from 'vitest';
import { appearanceSchema, randomAppearance } from './appearance';
import { characterSheetSchema } from './game';

describe('aparência', () => {
  it('preenche o padrão e recusa valores inventados', () => {
    const a = appearanceSchema.parse({ hair: { style: 'longo' } });
    expect(a).toMatchObject({ body: 'medio', hair: { style: 'longo', streak: null }, held: 'nenhum' });
    expect(() => appearanceSchema.parse({ hair: { style: 'asa-de-anjo' } })).toThrow();
    expect(() => appearanceSchema.parse({ skin: 'vermelho' })).toThrow();
    expect(() => appearanceSchema.parse({ accessories: ['caveira', 'oculos', 'venda', 'colar', 'luvas'] })).toThrow();
  });
  it('aparência sorteada é sempre a mesma para a mesma semente e é válida', () => {
    expect(randomAppearance('abc')).toEqual(randomAppearance('abc'));
    expect(randomAppearance('abc')).not.toEqual(randomAppearance('xyz'));
    for (const s of ['1', '2', '3', '4', '5']) expect(() => appearanceSchema.parse(randomAppearance(s))).not.toThrow();
    expect(randomAppearance('q', { held: 'katana' }).held).toBe('katana');
  });
  it('fica guardada dentro da ficha', () => {
    const sheet = characterSheetSchema.parse({ appearance: { top: { style: 'moletom', color: '#8c1f2b' } } });
    expect(sheet.appearance?.top).toMatchObject({ style: 'moletom', color: '#8c1f2b' });
  });
});
