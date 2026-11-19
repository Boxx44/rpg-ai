import { describe, expect, it } from 'vitest';
import { appearanceSchema, LPC, lpcLayers, pixelSchema, randomPixel } from './index';

describe('pixel art (LPC)', () => {
  it('o catálogo tem corpos, cabelos e roupas', () => {
    const slots = new Set(LPC.items.map((i) => i.slot));
    for (const s of ['body', 'head', 'hair', 'top', 'legs', 'feet']) expect(slots.has(s)).toBe(true);
    expect(LPC.items.filter((i) => i.slot === 'hair').length).toBeGreaterThan(20);
  });
  it('sorteio é estável e sempre válido', () => {
    for (let i = 0; i < 50; i++) {
      const a = randomPixel(`seed-${i}`);
      expect(randomPixel(`seed-${i}`)).toEqual(a);
      expect(pixelSchema.safeParse(a).success).toBe(true);
      expect(lpcLayers(a).length).toBeGreaterThan(3);
    }
  });
  it('camadas vêm de trás para a frente e com troca de cor', () => {
    const p = pixelSchema.parse({
      body: 'female',
      skin: 'olive',
      parts: {
        head: { id: 'heads_human_female', color: ['olive', 'green'] },
        hair: { id: 'hair_bob', color: ['redhead'] },
      },
    });
    const ls = lpcLayers(p);
    expect(ls.map((l) => l.z)).toEqual([...ls.map((l) => l.z)].sort((a, b) => a - b));
    expect(ls[0]!.url).toMatch(/^\/lpc\/body\/bodies\/female\/walk\.png$/);
    expect(ls.find((l) => l.url.includes('/hair/'))!.map.length).toBe(1);
  });
  it('recusa peça ou cor inventada', () => {
    expect(pixelSchema.safeParse({ parts: { hair: { id: 'nao_existe', color: [] } } }).success).toBe(false);
    expect(
      pixelSchema.safeParse({ parts: { hair: { id: 'hair_bob', color: ['dourado_magico'] } } }).success,
    ).toBe(false);
    expect(pixelSchema.safeParse({ parts: { top: { id: 'hair_bob', color: [] } } }).success).toBe(false);
    expect(pixelSchema.safeParse({ skin: '../../etc' }).success).toBe(false);
    expect(
      appearanceSchema.safeParse({ pixel: { parts: { hair: { id: '../x', color: [] } } } }).success,
    ).toBe(false);
  });
});
