/** Imagens enviadas: fundo de mapa, imagem de token e retrato. */

export const ASSET_KINDS = ['map', 'token', 'portrait'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_LIMITS = {
  /** Tamanho máximo de um arquivo, já reduzido pelo navegador. */
  maxBytes: 4 * 1024 * 1024,
  /** Espaço total de imagens por campanha. */
  campaignBytes: 60 * 1024 * 1024,
  /** Lado maior, em pixels, para o navegador reduzir antes de enviar. */
  maxSide: { map: 4096, token: 512, portrait: 512 } as Record<AssetKind, number>,
} as const;

export interface AssetDto {
  id: string;
  kind: AssetKind;
  name: string;
  mime: ImageMime;
  width: number;
  height: number;
  bytes: number;
  ownerId: string;
  createdAt: string;
}

export interface AssetUsageDto {
  used: number;
  limit: number;
}

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Descobre o tipo e o tamanho de uma imagem olhando os próprios bytes
 * (não confia no nome do arquivo nem no tipo informado pelo navegador).
 * Aceita só PNG, JPEG e WebP. SVG e outros formatos são recusados.
 */
export function imageInfo(b: Uint8Array): { mime: ImageMime; width: number; height: number } | null {
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u16le = (i: number) => b[i]! | (b[i + 1]! << 8);
  const u24le = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
  const u32be = (i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  const ok = (w: number, h: number) => w >= 1 && h >= 1 && w <= 8192 && h <= 8192;

  // PNG: assinatura de 8 bytes + bloco IHDR com largura/altura
  if (b.length >= 24 && u32be(0) === 0x89504e47 && u32be(4) === 0x0d0a1a0a && ascii(12, 4) === 'IHDR') {
    const w = u32be(16);
    const h = u32be(20);
    return ok(w, h) ? { mime: 'image/png', width: w, height: h } : null;
  }
  // JPEG: procura o marcador SOF (início do quadro), que traz as dimensões
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      const len = u16be(i + 2);
      if (len < 2) return null;
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const h = u16be(i + 5);
        const w = u16be(i + 7);
        return ok(w, h) ? { mime: 'image/jpeg', width: w, height: h } : null;
      }
      i += 2 + len;
    }
    return null;
  }
  // WebP: RIFF....WEBP + bloco VP8 / VP8L / VP8X
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    let w = 0;
    let h = 0;
    if (chunk === 'VP8 ') {
      w = u16le(26) & 0x3fff;
      h = u16le(28) & 0x3fff;
    } else if (chunk === 'VP8L') {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      w = (bits & 0x3fff) + 1;
      h = ((bits >>> 14) & 0x3fff) + 1;
    } else if (chunk === 'VP8X') {
      w = u24le(24) + 1;
      h = u24le(27) + 1;
    } else return null;
    return ok(w, h) ? { mime: 'image/webp', width: w, height: h } : null;
  }
  return null;
}
