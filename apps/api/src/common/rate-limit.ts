import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Logger } from '@rpg-ai/logger';
import { ERROR_CODES } from '@rpg-ai/shared';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config';
import { AppError } from './errors';
import { hashIp } from './http';
import { LOGGER, REDIS } from './tokens';

/**
 * Limite de requisições por janela de 1 minuto, por usuário (ou por IP se anônimo).
 * Contadores no Redis, compartilhados entre instâncias da API.
 * Se o Redis estiver fora do ar, a requisição segue (disponibilidade) e o problema é registrado.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    if (req.path === '/health') return true;
    const who = req.user ? `u:${req.user.id}` : `ip:${hashIp(req.ip ?? '')}`;
    const window = Math.floor(Date.now() / 60_000);
    const key = `rl:${who}:${window}`;
    const limit = this.config.RATE_LIMIT_PER_MINUTE;
    let count: number;
    try {
      const r = await this.redis.multi().incr(key).expire(key, 61).exec();
      count = Number(r?.[0]?.[1] ?? 0);
    } catch (err) {
      this.logger.warn({ err }, 'rate limit indisponível (Redis)');
      return true;
    }
    res.setHeader('x-ratelimit-limit', String(limit));
    res.setHeader('x-ratelimit-remaining', String(Math.max(0, limit - count)));
    if (count > limit) {
      res.setHeader('retry-after', String(60 - (Math.floor(Date.now() / 1000) % 60)));
      throw new AppError(
        ERROR_CODES.RATE_LIMITED,
        'Muitas requisições. Aguarde um momento e tente de novo.',
        429,
      );
    }
    return true;
  }
}
