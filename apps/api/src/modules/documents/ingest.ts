import { readFile } from 'node:fs/promises';
import { type Database, eq, schema, sql } from '@rpg-ai/db';
import type { Logger } from '@rpg-ai/logger';
import type { FileStorage } from './storage';

export const MAX_PAGES = 1500;
const EMPTY_PAGE_CHARS = 40;

interface TextItem {
  str: string;
  hasEOL?: boolean;
  transform: number[];
}

/** Junta os pedaços de texto da página em linhas legíveis e desfaz hifenização de fim de linha. */
export function pageText(items: unknown[]): string {
  let out = '';
  let lastY: number | null = null;
  for (const raw of items) {
    const it = raw as TextItem;
    if (typeof it.str !== 'string') continue;
    const y = it.transform[5] ?? 0;
    if (lastY !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
    out += it.str;
    if (it.hasEOL && !out.endsWith('\n')) out += '\n';
    lastY = y;
  }
  return out
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\u0000')
    .join('') // Postgres não aceita o caractere nulo em texto
    .trim();
}

/**
 * Processa um PDF: valida, extrai o texto de cada página e grava para busca.
 * Roda em segundo plano (fila). Nunca executa nada do PDF: só lê texto.
 */
export async function ingestDocument(
  db: Database,
  storage: FileStorage,
  documentId: string,
  logger: Logger,
): Promise<void> {
  const d = schema.documents;
  const [doc] = await db.select().from(d).where(eq(d.id, documentId));
  if (!doc || doc.deletedAt) return;
  const setStatus = (v: Partial<typeof d.$inferInsert>) => db.update(d).set(v).where(eq(d.id, documentId));
  await setStatus({ status: 'processing', progress: 0, error: null });
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(await readFile(storage.path(doc.storageKey)));
    let pdf;
    try {
      pdf = await pdfjs.getDocument({
        data,
        isEvalSupported: false,
        disableFontFace: true,
        useSystemFonts: false,
        verbosity: 0,
      }).promise;
    } catch (e) {
      const name = (e as { name?: string }).name;
      throw new Error(
        name === 'PasswordException' ? 'PDF protegido por senha.' : 'Arquivo PDF inválido ou corrompido.',
      );
    }
    if (pdf.numPages > MAX_PAGES) throw new Error(`PDF com ${pdf.numPages} páginas (máximo ${MAX_PAGES}).`);
    await db.delete(schema.documentPages).where(eq(schema.documentPages.documentId, documentId));
    let empty = 0;
    let batch: { documentId: string; systemId: string; pageNumber: number; text: string }[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = pageText(content.items);
      page.cleanup();
      if (text.length < EMPTY_PAGE_CHARS) empty++;
      batch.push({ documentId, systemId: doc.systemId, pageNumber: n, text });
      if (batch.length === 25 || n === pdf.numPages) {
        await db.insert(schema.documentPages).values(batch);
        batch = [];
        await setStatus({ progress: Math.floor((n / pdf.numPages) * 100) });
      }
    }
    await pdf.destroy();
    await setStatus({ status: 'ready', progress: 100, pageCount: pdf.numPages, pagesWithoutText: empty });
    logger.info({ documentId, pages: pdf.numPages, empty }, 'document ingested');
  } catch (e) {
    const msg =
      e instanceof Error && /PDF|páginas|senha/.test(e.message)
        ? e.message
        : 'Falha ao processar o documento.';
    logger.error({ err: e, documentId }, 'document ingest failed');
    await db.delete(schema.documentPages).where(eq(schema.documentPages.documentId, documentId));
    await setStatus({ status: 'failed', error: msg });
  }
}

/** Busca de regras em português, sem diferenciar acentos. O RLS limita ao que o usuário pode ler. */
export const searchSql = (systemId: string, q: string, limit: number): ReturnType<typeof sql> => sql`
  with query as (
    select websearch_to_tsquery('portuguese', app_private.unaccent_i(${q})) as uq,
           websearch_to_tsquery('portuguese', ${q}) as aq,
           phraseto_tsquery('portuguese', app_private.unaccent_i(${q})) as pq
  )
  select p.document_id as "documentId", d.filename, p.page_number as "page",
         ts_headline('portuguese', p.text, query.aq || query.uq,
           'MaxFragments=2, MinWords=8, MaxWords=30, StartSel=«, StopSel=», FragmentDelimiter= … ') as snippet,
         -- frase exata vale mais; densidade dos termos desempata
         ts_rank_cd(p.tsv, query.uq, 32) + case when p.tsv @@ query.pq then 0.5 else 0 end as rank
  from document_pages p
  join documents d on d.id = p.document_id and d.deleted_at is null and d.status = 'ready'
  cross join query
  where p.system_id = ${systemId} and p.tsv @@ query.uq
  order by rank desc, p.page_number
  limit ${limit}`;
