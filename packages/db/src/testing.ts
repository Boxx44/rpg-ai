import postgres from 'postgres';
import { bootstrapLocal, migrate } from './migrate';

/**
 * Cria um banco de testes descartável (compat Supabase + migrations).
 * Usa TEST_DATABASE_URL (padrão: postgres local) como conexão administrativa.
 */
export async function createTestDatabase(
  prefix: string,
): Promise<{ url: string; drop: () => Promise<void> }> {
  const adminUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
  const name = `${prefix}_${process.pid}_${Date.now()}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`create database "${name}"`);
  await admin.end();
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  const url = u.toString();
  await bootstrapLocal(url);
  await migrate(url);
  return {
    url,
    drop: async () => {
      const a = postgres(adminUrl, { max: 1, onnotice: () => undefined });
      await a.unsafe(`drop database if exists "${name}" with (force)`);
      await a.end();
    },
  };
}

/** Cria um usuário em auth.users (como o Supabase Auth faria); o trigger cria o resto. */
export async function createAuthUser(
  sql: postgres.Sql,
  email: string,
  meta: Record<string, string> = {},
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into auth.users (email, raw_user_meta_data, email_confirmed_at)
    values (${email}, ${sql.json(meta)}, now()) returning id`;
  if (!row) throw new Error('falha ao criar usuário');
  return row.id;
}
