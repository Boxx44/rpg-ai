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
