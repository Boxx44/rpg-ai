'use client';

/**
 * Monta o personagem em pixel art no navegador: empilha as camadas das peças LPC
 * (de trás para a frente) e troca as cores de cada peça pela paleta escolhida.
 * O resultado (um quadro de 64×64) vira uma imagem guardada em cache.
 */
import { lpcLayers, type PixelLook } from '@rpg-ai/shared';
import { useEffect, useState } from 'react';

const SIZE = 64;
const images = new Map<string, Promise<HTMLImageElement>>();
const frames = new Map<string, Promise<string>>();

function load(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Não carregou ${url}`));
      img.src = url;
    });
    images.set(url, p);
    p.catch(() => images.delete(url));
  }
  return p;
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/** Direções da folha "walk": 0 = de costas, 1 = esquerda, 2 = de frente, 3 = direita. */
export type LpcDir = 0 | 1 | 2 | 3;

export function lpcFrame(p: PixelLook, dir: LpcDir = 2, frame = 0): Promise<string> {
  const key = `${dir}:${frame}:${JSON.stringify(p)}`;
  let out = frames.get(key);
  if (!out) {
    out = (async () => {
      const layers = lpcLayers(p);
      const imgs = await Promise.all(layers.map((l) => load(l.url).catch(() => null)));
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      const tmp = document.createElement('canvas');
      tmp.width = SIZE;
      tmp.height = SIZE;
      const t = tmp.getContext('2d', { willReadFrequently: true })!;
      layers.forEach((l, i) => {
        const img = imgs[i];
        if (!img) return;
        t.clearRect(0, 0, SIZE, SIZE);
        t.drawImage(img, frame * SIZE, dir * SIZE, SIZE, SIZE, 0, 0, SIZE, SIZE);
        if (l.map.length) {
          const swap = new Map<number, readonly [number, number, number]>();
          for (const [from, to] of l.map)
            from.forEach((c, k) => {
              const a = rgb(c);
              const b = to[k];
              if (b) swap.set((a[0] << 16) | (a[1] << 8) | a[2], rgb(b));
            });
          const data = t.getImageData(0, 0, SIZE, SIZE);
          const d = data.data;
          for (let j = 0; j < d.length; j += 4) {
            if (!d[j + 3]) continue;
            const to = swap.get((d[j]! << 16) | (d[j + 1]! << 8) | d[j + 2]!);
            if (to) {
              d[j] = to[0];
              d[j + 1] = to[1];
              d[j + 2] = to[2];
            }
          }
          t.putImageData(data, 0, 0);
        }
        ctx.drawImage(tmp, 0, 0);
      });
      return canvas.toDataURL('image/png');
    })();
    frames.set(key, out);
    if (frames.size > 400) frames.delete(frames.keys().next().value!);
  }
  return out;
}

/** Imagem (data URL) do personagem montado; `null` enquanto carrega. */
export function useLpcFrame(p: PixelLook | null | undefined, dir: LpcDir = 2, frame = 0): string | null {
  const key = p ? `${dir}:${frame}:${JSON.stringify(p)}` : '';
  const [url, setUrl] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!p) return;
    let alive = true;
    lpcFrame(p, dir, frame)
      .then((u) => alive && setUrl({ key, url: u }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // a chave já representa p/dir/frame
  }, [key]);
  return url && url.key === key ? url.url : null;
}
