import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createDb, type DbHandle } from '@rpg-ai/db';
import { createLogger } from '@rpg-ai/logger';
import helmet from 'helmet';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { AppModule } from './app.module';
import type { AppConfig } from './config';

class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly origin: string,
  ) {
    super(app);
  }
  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, { ...options, cors: { origin: this.origin, credentials: true } });
  }
}

export interface CreatedApp {
  app: NestExpressApplication;
  db: DbHandle;
  redis: Redis;
  close(): Promise<void>;
}

export async function createApp(config: AppConfig): Promise<CreatedApp> {
  const logger = createLogger('api', { level: config.LOG_LEVEL });
  const db = createDb(config.DATABASE_URL);
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  redis.on('error', (err) => logger.warn({ err: err.message }, 'redis error'));
  // Espera o Redis por até 3 s; se não vier, a API sobe em modo degradado (o /health mostra).
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 3000);
    redis.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
  });

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register({ config, db: db.db, redis, logger }),
    { logger: ['error', 'warn'], bodyParser: false },
  );
  app.useBodyParser('json', { limit: '256kb' });
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.enableCors({
    origin: config.WEB_ORIGIN,
    credentials: true,
    exposedHeaders: ['x-request-id', 'retry-after'],
  });
  app.useWebSocketAdapter(new CorsIoAdapter(app, config.WEB_ORIGIN));
  app.enableShutdownHooks();

  return {
    app,
    db,
    redis,
    close: async () => {
      await app.close();
      redis.disconnect();
      await db.close();
    },
  };
}
