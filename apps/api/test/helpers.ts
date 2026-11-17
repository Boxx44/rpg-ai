import { createAuthUser, createTestDatabase } from '@rpg-ai/db/dist/testing';
import { SignJWT } from 'jose';
import postgres from 'postgres';
import { createApp, type CreatedApp } from '../src/app.factory';
import { type AppConfig, loadConfig } from '../src/config';

export const JWT_SECRET = 'test-secret-test-secret-test-secret-123';

export interface TestCtx {
  created: CreatedApp;
  http: ReturnType<CreatedApp['app']['getHttpServer']>;
  sql: postgres.Sql;
  config: AppConfig;
  teardown(): Promise<void>;
}

export async function setupApp(overrides: Partial<Record<string, string>> = {}): Promise<TestCtx> {
  const { url, drop } = await createTestDatabase('rpg_api');
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: url,
    REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
    SUPABASE_URL: 'http://localhost:54399',
    SUPABASE_JWT_SECRET: JWT_SECRET,
    WEB_ORIGIN: 'http://localhost:3000',
    RATE_LIMIT_PER_MINUTE: '1000',
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    ...overrides,
  });
  const created = await createApp(config);
  await created.redis.flushdb();
  await created.app.init();
  const sql = postgres(url, { max: 2, onnotice: () => undefined });
  return {
    created,
    http: created.app.getHttpServer(),
    sql,
    config,
    teardown: async () => {
      await sql.end();
      await created.close();
      await drop();
    },
  };
}

export async function makeUser(t: TestCtx, email: string, name?: string) {
  const id = await createAuthUser(t.sql, email, name ? { display_name: name } : {});
  return { id, email, token: await tokenFor(id, email) };
}

export function tokenFor(
  sub: string,
  email: string,
  opts: { secret?: string; exp?: string; aud?: string } = {},
) {
  return new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(new TextEncoder().encode(opts.secret ?? JWT_SECRET));
}
