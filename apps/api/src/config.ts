import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_JWT_SECRET: z
      .string()
      .min(32)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().url(),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
    AUDIT_IP_SALT: z.string().optional(),
    /** Pasta onde os livros enviados ficam guardados (disco local, custo zero). */
    STORAGE_DIR: z.string().default('./data/storage'),
    /** Processa documentos neste mesmo processo (true) ou só enfileira (false, quando houver worker separado). */
    WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(1000).default(300),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.SUPABASE_JWT_SECRET?.startsWith('local-dev')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_JWT_SECRET'],
        message: 'segredo de desenvolvimento em produção',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Valida variáveis de ambiente no boot. Falha com mensagem clara se algo estiver faltando. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida. Verifique o arquivo .env (veja .env.example):\n${issues}`);
  }
  return parsed.data;
}
