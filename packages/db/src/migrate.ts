import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

export const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');
export const LOCAL_DIR = join(__dirname, '..', 'local');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Aplica migrations SQL em ordem, cada uma em sua transação.
 * Registra nome + checksum; falha se uma migration já aplicada foi editada.
 */
export async function migrate(databaseUrl: string, dir = MIGRATIONS_DIR): Promise<MigrationResult> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await sql`create schema if not exists app_private`;
    await sql`create table if not exists app_private.schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
    const done = new Map(
      (
        await sql<
          { name: string; checksum: string }[]
        >`select name, checksum from app_private.schema_migrations`
      ).map((r) => [r.name, r.checksum]),
    );
    const files = readdirSync(dir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();
    for (const file of files) {
      const body = readFileSync(join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(body).digest('hex');
      const prev = done.get(file);
      if (prev) {
        if (prev !== checksum)
          throw new Error(`Migration ${file} foi alterada depois de aplicada. Crie uma nova migration.`);
        result.skipped.push(file);
        continue;
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into app_private.schema_migrations (name, checksum) values (${file}, ${checksum})`;
      });
      result.applied.push(file);
    }
    return result;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Prepara um Postgres comum para se comportar como o Supabase (somente local/CI). */
export async function bootstrapLocal(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', 'postgres'].includes(url.hostname)) {
    throw new Error('bootstrap-local só pode rodar em banco local. Nunca rode em um projeto Supabase real.');
  }
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await sql.unsafe(readFileSync(join(LOCAL_DIR, 'supabase-compat.sql'), 'utf8'));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
