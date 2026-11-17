import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de ponta a ponta: sobem banco de testes, emulador de auth, API e site,
 * e usam o navegador como um usuário real.
 */
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/rpg_ai_e2e';
const SECRET = 'e2e-jwt-secret-e2e-jwt-secret-e2e-jwt-secret';
const shared = {
  DATABASE_URL: DB,
  SUPABASE_JWT_SECRET: SECRET,
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'node e2e/prepare-db.mjs && node ../../tools/auth-emulator/server.mjs',
      url: 'http://localhost:54331/auth/v1/health',
      env: { ...shared, AUTH_EMULATOR_PORT: '54331' },
      reuseExistingServer: false,
    },
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:4100/health',
      env: {
        ...shared,
        NODE_ENV: 'test',
        REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/14',
        SUPABASE_URL: 'http://localhost:54331',
        API_PORT: '4100',
        WEB_ORIGIN: 'http://localhost:3100',
        RATE_LIMIT_PER_MINUTE: '600',
        LOG_LEVEL: 'warn',
        STORAGE_DIR: '/tmp/rpg-e2e-storage',
      },
      reuseExistingServer: false,
    },
    {
      command: 'npx next build && npx next start -p 3100',
      url: 'http://localhost:3100/login',
      timeout: 300_000,
      env: {
        ...shared,
        NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54331',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
        NEXT_PUBLIC_API_URL: 'http://localhost:4100',
        NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      reuseExistingServer: false,
    },
  ],
});
