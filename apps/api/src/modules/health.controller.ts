import { Controller, Get, Inject, Res } from '@nestjs/common';
import { type Database, sql } from '@rpg-ai/db';
import type { HealthDto } from '@rpg-ai/shared';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { Public } from '../common/http';
import { DB, REDIS } from '../common/tokens';

const VERSION = process.env.npm_package_version ?? '0.1.0';

async function within<T>(p: Promise<T>, ms = 2000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const database = await within(this.db.execute(sql`select 1`)).then(
      () => 'ok' as const,
      () => 'down' as const,
    );
    const redis = await within(this.redis.ping()).then(
      (r) => (r === 'PONG' ? ('ok' as const) : ('down' as const)),
      () => 'down' as const,
    );
    const status = database === 'ok' && redis === 'ok' ? 'ok' : 'degraded';
    if (status !== 'ok') res.status(503);
    return { status, checks: { database, redis }, version: VERSION };
  }
}
