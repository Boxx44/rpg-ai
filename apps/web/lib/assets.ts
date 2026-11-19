'use client';

/**
 * Imagens da campanha no navegador:
 *  - reduz e converte para WebP antes de enviar (menos espaço, sem dados escondidos da foto, como GPS);
 *  - busca com o login da pessoa (o servidor decide quem pode ver) e guarda em memória.
 */
import { ASSET_LIMITS, type AssetDto, type AssetKind } from '@rpg-ai/shared';
import { useEffect, useState } from 'react';
import { api } from './api';
import { env } from './env';
import { accessToken } from './supabase';

/** Reduz a imagem para no máximo `maxSide` pixels no lado maior e converte para WebP. */
/**
 * Remove o fundo liso de uma arte de personagem (ex.: fundo branco ou cinza), deixando-o
 * transparente. Só age quando os quatro cantos têm a mesma cor — fotos com fundo
 * variado ficam como estão. Devolve true se recortou.
 */
export function removeFlatBackground(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)].map((i) => [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!]);
  if (corners.some((c) => c[3]! < 250)) return false; // já tem transparência
  const avg = [0, 1, 2].map((k) => corners.reduce((sum, c) => sum + c[k]!, 0) / 4);
  const dist = (i: number) => Math.hypot(d[i]! - avg[0]!, d[i + 1]! - avg[1]!, d[i + 2]! - avg[2]!);
  if (corners.some((c) => Math.hypot(c[0]! - avg[0]!, c[1]! - avg[1]!, c[2]! - avg[2]!) > 28)) return false;
  const tol = 42;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  let removed = 0;
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    if (dist(p * 4) > tol) continue;
    d[p * 4 + 3] = 0;
    removed++;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  if (removed < w * h * 0.08) {
    ctx.putImageData(ctx.getImageData(0, 0, w, h), 0, 0);
    return false; // quase nada era fundo: deixa como estava
  }
  // borda suave: pixels vizinhos do fundo ficam meio transparentes conforme a cor
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (d[p * 4 + 3] === 0) continue;
      if (d[(p - 1) * 4 + 3] === 0 || d[(p + 1) * 4 + 3] === 0 || d[(p - w) * 4 + 3] === 0 || d[(p + w) * 4 + 3] === 0) {
        const k = Math.min(1, dist(p * 4) / (tol * 2.2));
        d[p * 4 + 3] = Math.round(255 * k);
      }
    }
  ctx.putImageData(img, 0, 0);
  return true;
}

export async function shrinkImage(
  file: File,
  maxSide: number,
  opts: { cutout?: boolean } = {},
): Promise<{ blob: Blob; width: number; height: number; cut: boolean }> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type))
    throw new Error('Escolha uma imagem PNG, JPG ou WebP.');
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível abrir esta imagem.');
  });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const cut = opts.cutout ? removeFlatBackground(ctx, width, height) : false;
  let quality = 0.86;
  let blob: Blob | null = null;
  // Se ficar grande demais, baixa a qualidade aos poucos.
  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
    if (!blob) break;
    if (blob.size <= ASSET_LIMITS.maxBytes) break;
    quality -= 0.15;
  }
  if (!blob || blob.type !== 'image/webp') {
    // Navegador sem WebP: usa PNG (para tokens) ou JPEG (para fundos).
    blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, maxSide > 1024 && !cut ? 'image/jpeg' : 'image/png', 0.85),
    );
  }
  if (!blob) throw new Error('Não foi possível preparar a imagem.');
  if (blob.size > ASSET_LIMITS.maxBytes)
    throw new Error('A imagem continua grande demais. Tente outra menor.');
  return { blob, width, height, cut };
}

export async function uploadAsset(
  campaignId: string,
  kind: AssetKind,
  file: File,
  opts: { cutout?: boolean } = {},
): Promise<AssetDto> {
  // tokens e retratos: arte com fundo liso vira figura recortada (padrão: sim)
  const cutout = opts.cutout ?? kind !== 'map';
  const { blob } = await shrinkImage(file, ASSET_LIMITS.maxSide[kind], { cutout });
  const form = new FormData();
  form.set('kind', kind);
  form.set('name', file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 80));
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  form.set('file', blob, `imagem.${ext}`);
  return api<AssetDto>(`/campaigns/${campaignId}/assets`, await accessToken(), {
    method: 'POST',
    body: form,
  });
}

// ───────────── leitura com cache ─────────────
const cache = new Map<string, Promise<string | null>>();
const ready = new Map<string, string | null>();

function load(campaignId: string, id: string): Promise<string | null> {
  const key = `${campaignId}/${id}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`${env.apiUrl}/campaigns/${campaignId}/assets/${id}/file`, {
          headers: { Authorization: `Bearer ${await accessToken()}` },
        });
        if (!res.ok) return null;
        return URL.createObjectURL(await res.blob());
      } catch {
        return null;
      }
    })();
    p.then((u) => {
      ready.set(key, u);
      // sem acesso agora (ex.: mapa ainda não compartilhado): tenta de novo mais tarde
      if (u === null) setTimeout(() => cache.delete(key), 5000);
    });
    cache.set(key, p);
  }
  return p;
}

/** Endereços (blob:) das imagens pedidas; as que ainda não chegaram ficam de fora. */
export function useAssetUrls(campaignId: string, ids: (string | null | undefined)[]): Record<string, string> {
  const list = [...new Set(ids.filter((x): x is string => !!x))].sort();
  const key = list.join(',');
  const initial = () => {
    const out: Record<string, string> = {};
    for (const id of list) {
      const u = ready.get(`${campaignId}/${id}`);
      if (u) out[id] = u;
    }
    return out;
  };
  const [urls, setUrls] = useState<Record<string, string>>(initial);
  useEffect(() => {
    let alive = true;
    setUrls(initial());
    for (const id of list)
      void load(campaignId, id).then((u) => {
        if (alive && u) setUrls((cur) => (cur[id] === u ? cur : { ...cur, [id]: u }));
      });
    return () => {
      alive = false;
    };
  }, [campaignId, key]);
  return urls;
}

export function useAssetUrl(campaignId: string, id: string | null | undefined): string | undefined {
  return useAssetUrls(campaignId, [id])[id ?? ''];
}

/** Primeira imagem de um arrastar-e-soltar ou de um Ctrl+V (ou null). */
export function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const f of Array.from(data.files ?? [])) if (f.type.startsWith('image/')) return f;
  for (const it of Array.from(data.items ?? [])) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

/** O arrasto traz arquivos (para mostrar "solte aqui")? */
export function draggingFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types ?? []).includes('Files');
}

/** Ctrl+V com imagem na página (ignora quando está digitando num campo de texto sem imagem). */
export function usePasteImage(enabled: boolean, onImage: (f: File) => void) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e: ClipboardEvent) => {
      const f = imageFrom(e.clipboardData);
      if (!f) return;
      e.preventDefault();
      onImage(f);
    };
    window.addEventListener('paste', h);
    return () => window.removeEventListener('paste', h);
  }, [enabled, onImage]);
}

// ───────────── imagem recortada (fundo transparente) ─────────────
const alphaCache = new Map<string, boolean>();

/** A imagem tem fundo transparente? (cantos sem cor) — vira figura recortada no mapa. */
async function hasTransparentEdges(url: string): Promise<boolean> {
  if (alphaCache.has(url)) return alphaCache.get(url)!;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    return false;
  }
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 24;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, 24, 24);
  const d = ctx.getImageData(0, 0, 24, 24).data;
  const a = (x: number, y: number) => d[(y * 24 + x) * 4 + 3]!;
  const corners = [a(0, 0), a(23, 0), a(0, 23), a(23, 23), a(12, 0)];
  const result = corners.filter((v) => v < 20).length >= 3;
  alphaCache.set(url, result);
  return result;
}

/** Quais das imagens (por id) têm fundo transparente. */
export function useCutouts(urls: Record<string, string>): Set<string> {
  const [set, setSet] = useState<Set<string>>(() => new Set());
  const key = Object.entries(urls)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('|');
  useEffect(() => {
    let alive = true;
    void Promise.all(Object.entries(urls).map(async ([id, u]) => ((await hasTransparentEdges(u)) ? id : null))).then(
      (ids) => {
        if (alive) setSet(new Set(ids.filter((x): x is string => !!x)));
      },
    );
    return () => {
      alive = false;
    };
    // `key` resume as imagens
  }, [key]);
  return set;
}
