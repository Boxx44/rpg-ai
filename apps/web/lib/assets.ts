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
export async function shrinkImage(
  file: File,
  maxSide: number,
): Promise<{ blob: Blob; width: number; height: number }> {
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
      canvas.toBlob(r, maxSide > 1024 ? 'image/jpeg' : 'image/png', 0.85),
    );
  }
  if (!blob) throw new Error('Não foi possível preparar a imagem.');
  if (blob.size > ASSET_LIMITS.maxBytes)
    throw new Error('A imagem continua grande demais. Tente outra menor.');
  return { blob, width, height };
}

export async function uploadAsset(campaignId: string, kind: AssetKind, file: File): Promise<AssetDto> {
  const { blob } = await shrinkImage(file, ASSET_LIMITS.maxSide[kind]);
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
