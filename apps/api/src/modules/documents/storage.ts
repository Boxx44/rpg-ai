import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Armazenamento de arquivos.
 * Hoje: disco local (custo zero). Em produção: trocar por Supabase Storage
 * mantendo esta mesma interface.
 */
export interface FileStorage {
  /** Move um arquivo temporário para o armazenamento e devolve a chave. */
  put(tempPath: string, prefix: string): Promise<string>;
  path(key: string): string;
  remove(key: string): Promise<void>;
}

export class LocalFileStorage implements FileStorage {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  async put(tempPath: string, prefix: string): Promise<string> {
    if (!/^[a-z0-9-]+$/i.test(prefix)) throw new Error('prefixo inválido');
    const key = `${prefix}/${randomUUID()}.pdf`;
    const dest = this.path(key);
    await mkdir(dirname(dest), { recursive: true });
    await rename(tempPath, dest).catch(async () => {
      // rename falha entre discos diferentes: copia por stream
      const { copyFile } = await import('node:fs/promises');
      await copyFile(tempPath, dest);
      await rm(tempPath, { force: true });
    });
    return key;
  }
  path(key: string): string {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error('caminho fora do armazenamento');
    return p;
  }
  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256');
  await new Promise<void>((res, rej) => {
    createReadStream(path)
      .on('data', (c) => h.update(c))
      .on('end', () => res())
      .on('error', rej);
  });
  return h.digest('hex');
}

/** Confere a assinatura real do arquivo (não confia na extensão nem no tipo enviado). */
export async function isPdf(path: string): Promise<boolean> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    return buf.toString('latin1') === '%PDF-';
  } finally {
    await fh.close();
  }
}

export async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}
