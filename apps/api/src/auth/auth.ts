import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Database, eq, schema } from '@rpg-ai/db';
import type { Logger } from '@rpg-ai/logger';
import type { Request } from 'express';
import { createRemoteJWKSet, decodeProtectedHeader, type JWTPayload, jwtVerify } from 'jose';
import { APP_CONFIG, type AppConfig } from '../config';
import { forbidden, unauthenticated } from '../common/errors';
import { IS_PUBLIC } from '../common/http';
import { type AuthUser, DB, LOGGER } from '../common/tokens';

/**
 * Verifica tokens emitidos pelo Supabase Auth.
 * - Projetos com segredo legado (HS256): usa SUPABASE_JWT_SECRET.
 * - Projetos com chaves assimétricas (ES256/RS256): usa as chaves públicas (JWKS) do projeto.
 */
@Injectable()
export class JwtVerifier {
  private readonly secret?: Uint8Array;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    if (config.SUPABASE_JWT_SECRET) this.secret = new TextEncoder().encode(config.SUPABASE_JWT_SECRET);
    this.jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', config.SUPABASE_URL));
  }

  async verify(token: string): Promise<JWTPayload & { sub: string }> {
    let alg: string | undefined;
    try {
      alg = decodeProtectedHeader(token).alg;
    } catch {
      throw unauthenticated('Token inválido');
    }
    try {
      const { payload } =
        alg === 'HS256'
          ? this.secret
            ? await jwtVerify(token, this.secret, { algorithms: ['HS256'], audience: 'authenticated' })
            : (() => {
                throw new Error('HS256 sem segredo configurado');
              })()
          : await jwtVerify(token, this.jwks, { algorithms: ['ES256', 'RS256'], audience: 'authenticated' });
      if (!payload.sub) throw new Error('sem sub');
      return payload as JWTPayload & { sub: string };
    } catch {
      throw unauthenticated('Sessão inválida ou expirada. Entre novamente.');
    }
  }
}

/** Resolve o usuário a partir do token e garante que a conta existe e está ativa. */
@Injectable()
export class AuthService {
  constructor(
    private readonly verifier: JwtVerifier,
    @Inject(DB) private readonly db: Database,
  ) {}

  async authenticate(token: string): Promise<AuthUser> {
    const payload = await this.verifier.verify(token);
    const [u] = await this.db
      .select({ id: schema.users.id, email: schema.users.email, status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);
    if (!u) throw unauthenticated('Conta não encontrada');
    if (u.status !== 'active') throw forbidden('Conta suspensa');
    return { id: u.id, email: u.email };
  }
}

export function bearer(req: Request): string | undefined {
  const h = req.header('authorization');
  return h?.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = bearer(req);
    if (!token) throw unauthenticated();
    req.user = await this.auth.authenticate(token);
    return true;
  }
}
