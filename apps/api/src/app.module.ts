import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { Database } from '@rpg-ai/db';
import type { Logger } from '@rpg-ai/logger';
import type Redis from 'ioredis';
import { AuthGuard, AuthService, JwtVerifier } from './auth/auth';
import { APP_CONFIG, type AppConfig } from './config';
import { GlobalExceptionFilter } from './common/errors';
import { RequestContextMiddleware } from './common/http';
import { RateLimitGuard } from './common/rate-limit';
import { DB, LOGGER, REDIS } from './common/tokens';
import { CampaignsController, InvitationsController } from './modules/campaigns.controller';
import { CampaignsService } from './modules/campaigns.service';
import { HealthController } from './modules/health.controller';
import { MeController } from './modules/me.controller';
import { RealtimeGateway } from './modules/realtime.gateway';

export interface AppDeps {
  config: AppConfig;
  db: Database;
  redis: Redis;
  logger: Logger;
}

@Module({})
export class AppModule implements NestModule {
  static register(deps: AppDeps): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, MeController, CampaignsController, InvitationsController],
      providers: [
        { provide: APP_CONFIG, useValue: deps.config },
        { provide: DB, useValue: deps.db },
        { provide: REDIS, useValue: deps.redis },
        { provide: LOGGER, useValue: deps.logger },
        JwtVerifier,
        AuthService,
        CampaignsService,
        RealtimeGateway,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
