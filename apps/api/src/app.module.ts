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
import { CharactersController, CharactersService } from './modules/characters';
import { ChatController, ChatService } from './modules/chat';
import { MapsController, MapsService } from './modules/maps';
import {
  createFileStorage,
  DocumentQueue,
  FILE_STORAGE,
  SystemsController,
  SystemsService,
} from './modules/documents/systems';
import { NpcsController, NpcsService } from './modules/npcs';
import { CombatController, CombatService } from './modules/combat';
import { SessionsController, SessionsService } from './modules/sessions';
import { SheetActions } from './modules/sheet-actions';
import { LibraryController, LibraryService } from './modules/library';
import { SandboxController, SandboxService } from './modules/sandbox';
import { Realtime, RealtimeGateway } from './modules/realtime.gateway';

export interface AppDeps {
  config: AppConfig;
  db: Database;
  redis: Redis | null;
  logger: Logger;
}

@Module({})
export class AppModule implements NestModule {
  static register(deps: AppDeps): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        MeController,
        CampaignsController,
        InvitationsController,
        ChatController,
        CharactersController,
        NpcsController,
        MapsController,
        SystemsController,
        SessionsController,
        CombatController,
        LibraryController,
        SandboxController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: deps.config },
        { provide: DB, useValue: deps.db },
        { provide: REDIS, useValue: deps.redis },
        { provide: LOGGER, useValue: deps.logger },
        JwtVerifier,
        AuthService,
        CampaignsService,
        RealtimeGateway,
        Realtime,
        ChatService,
        CharactersService,
        NpcsService,
        MapsService,
        SystemsService,
        SessionsService,
        CombatService,
        SheetActions,
        LibraryService,
        SandboxService,
        DocumentQueue,
        { provide: FILE_STORAGE, useValue: createFileStorage(deps.config) },
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
