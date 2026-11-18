import { describe, expect, it } from 'vitest';
import { imageInfo } from './assets';
import { MAP_TEMPLATE_KEYS, mapTemplate } from './map-templates';
import { PROPS, type PropKind, TERRAINS } from './game';

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4XmM8ISfHAAZMEIqBgQEAEy4BCG2NhtEAAAAASUVORK5CYII=';
const JPG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAUDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkKKKK8U/TD//Z';
const WEBP = 'UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoHAAYAAUAmJaACdLoABDAAAP7x3I/4DdfFtMv/vYL/3YL/3YL/WwAA';
const WEBPL = 'UklGRh4AAABXRUJQVlA4TBEAAAAvCMABAAdQjyLXo/+BiOh/AAA=';
const WEBPX =
  'UklGRkgAAABXRUJQVlA4WAoAAAAQAAAACgAACQAAQUxQSAoAAAABB1DAiAhERP8DVlA4IBgAAAAwAQCdASoLAAoAAUAmJaQAA3AA/v0gUAA=';

describe('imageInfo', () => {
  it('reconhece PNG, JPEG e os três tipos de WebP pelo conteúdo', () => {
    expect(imageInfo(b64(PNG))).toEqual({ mime: 'image/png', width: 3, height: 2 });
    expect(imageInfo(b64(JPG))).toEqual({ mime: 'image/jpeg', width: 5, height: 4 });
    expect(imageInfo(b64(WEBP))).toEqual({ mime: 'image/webp', width: 7, height: 6 });
    expect(imageInfo(b64(WEBPL))).toEqual({ mime: 'image/webp', width: 9, height: 8 });
    expect(imageInfo(b64(WEBPX))).toEqual({ mime: 'image/webp', width: 11, height: 10 });
  });
  it('recusa SVG, PDF, lixo e imagem cortada', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(
      imageInfo(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
    ).toBeNull();
    expect(imageInfo(enc('%PDF-1.7 ...'))).toBeNull();
    expect(imageInfo(new Uint8Array(100))).toBeNull();
    expect(imageInfo(b64(PNG).subarray(0, 10))).toBeNull();
  });
});

describe('modelos de mapa', () => {
  it.each(MAP_TEMPLATE_KEYS)('%s: terreno e objetos válidos e dentro do mapa', (k) => {
    const t = mapTemplate(k);
    expect(t.cols).toBeLessThanOrEqual(100);
    for (const [key, tr] of Object.entries(t.terrain)) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      expect(x).toBeLessThan(t.cols);
      expect(y).toBeLessThan(t.rows);
      expect(TERRAINS).toContain(tr);
    }
    expect(t.props.length).toBeGreaterThan(5);
    for (const p of t.props) {
      const def = PROPS[p.icon as PropKind];
      expect(def, p.icon).toBeDefined();
      expect(p.x + def.size).toBeLessThanOrEqual(t.cols);
      expect(p.y + def.size).toBeLessThanOrEqual(t.rows);
      if (p.state) expect(def.states).toContain(p.state);
    }
    // sempre igual (gerado de forma fixa)
    expect(mapTemplate(k)).toEqual(t);
  });
});
