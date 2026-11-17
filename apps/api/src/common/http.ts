import { createHash, randomUUID } from 'node:crypto';
import {
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestMiddleware,
  SetMetadata,
} from '@nestjs/common';
import type { Logger } from '@rpg-ai/logger';
import type { NextFunction, Request, Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';
import { type AuthUser, LOGGER } from './tokens';
import { unauthenticated } from './errors';

export const IS_PUBLIC = 'isPublic';
/** Marca uma rota como acessível sem login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.user) throw unauthenticated();
  return req.user;
});

export interface RequestCtx {
  requestId: string;
  ipHash: string;
}
export const Ctx = createParamDecorator((_d: unknown, ctx: ExecutionContext): RequestCtx => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { requestId: req.requestId, ipHash: hashIp(req.ip ?? '') };
});

const IP_SALT = process.env.AUDIT_IP_SALT ?? randomUUID();
export function hashIp(ip: string): string {
  return createHash('sha256')
    .update(IP_SALT + ip)
    .digest('hex')
    .slice(0, 32);
}

/** Valida a entrada com um schema Zod (lança ZodError → 400). */
export function parse<O, I = O>(schema: ZodType<O, ZodTypeDef, I>, value: unknown): O {
  return schema.parse(value);
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      this.logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          ms: Math.round(ms),
          userId: req.user?.id,
        },
        'request',
      );
    });
    next();
  }
}
