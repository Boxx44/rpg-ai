import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  type OnModuleDestroy,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, type Database, desc, eq, isNull, schema, sql, type Tx, withUser } from '@rpg-ai/db';
import type { Logger } from '@rpg-ai/logger';
import { SYSTEM_TEMPLATES, type SystemDefinition, validateSystem } from '@rpg-ai/rules-engine';
import {
  type CampaignSystemDto,
  type CreateSystemInput,
  createSystemSchema,
  type DocumentDto,
  type DocumentPageDto,
  ERROR_CODES,
  type RuleSearchHitDto,
  searchSchema,
  setCampaignSystemSchema,
  type SystemDto,
  type SystemTemplateDto,
} from '@rpg-ai/shared';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { diskStorage } from 'multer';
import { APP_CONFIG, type AppConfig } from '../../config';
import { AppError, forbidden, notFound } from '../../common/errors';
import { Ctx, CurrentUser, parse, type RequestCtx } from '../../common/http';
import { type AuthUser, DB, LOGGER } from '../../common/tokens';
import { requireManager, requireMember } from '../access';
import { audit } from '../audit';
import { anyId, campaignId } from '../ids';
import { ingestDocument, searchSql } from './ingest';
import { fileSize, type FileStorage, isPdf, LocalFileStorage, sha256File } from './storage';

export const FILE_STORAGE = Symbol('FILE_STORAGE');
const s = schema.rpgSystems;
const v = schema.systemVersions;
const d = schema.documents;

const TMP_DIR = join(tmpdir(), 'rpg-ai-uploads');
const MB = 1024 * 1024;

export function createFileStorage(config: AppConfig): FileStorage {
  return new LocalFileStorage(config.STORAGE_DIR);
}

/** Fila de processamento de documentos (BullMQ/Redis). Sem Redis, processa direto em segundo plano. */
@Injectable()
export class DocumentQueue implements OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;
  private conn?: IORedis;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(DB) private readonly db: Database,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    if (!config.REDIS_URL) {
      logger.info('Sem Redis: livros são processados direto, sem fila.');
      return;
    }
    try {
      this.conn = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
      this.conn.on('error', (err) => logger.warn({ err: err.message }, 'document queue redis error'));
      this.queue = new Queue('documents', { connection: this.conn });
      if (config.WORKER_ENABLED) {
        this.worker = new Worker('documents', (job) => this.run(String(job.data.documentId)), {
          connection: this.conn.duplicate(),
          concurrency: 1,
        });
        this.worker.on('error', (err) => logger.warn({ err: err.message }, 'document worker error'));
      }
    } catch (err) {
      logger.warn({ err }, 'fila indisponível; processamento direto');
    }
  }

  private run(documentId: string) {
    return ingestDocument(this.db, this.storage, documentId, this.logger);
  }

  async enqueue(documentId: string) {
    try {
      if (!this.queue) throw new Error('sem fila');
      await this.queue.add(
        'ingest',
        { documentId },
        { attempts: 2, removeOnComplete: 100, removeOnFail: 100 },
      );
    } catch (err) {
      this.logger.warn({ err, documentId }, 'fila indisponível; processando direto');
      setImmediate(() => void this.run(documentId));
    }
  }

  async onModuleDestroy() {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    this.conn?.disconnect();
  }
}

function toDocDto(r: typeof d.$inferSelect): DocumentDto {
  return {
    id: r.id,
    filename: r.filename,
    sizeBytes: r.sizeBytes,
    pageCount: r.pageCount,
    pagesWithoutText: r.pagesWithoutText,
    status: r.status,
    progress: r.progress,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class SystemsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly queue: DocumentQueue,
  ) {}

  templates(): SystemTemplateDto[] {
    return Object.values(SYSTEM_TEMPLATES).map((t) => ({ id: t.id, name: t.name, edition: t.edition }));
  }

  private async canEdit(tx: Tx, systemId: string): Promise<boolean> {
    const r = await tx.execute<{ ok: boolean }>(
      sql`select app_private.can_edit_system(${systemId}::uuid) as ok`,
    );
    return !!r[0]?.ok;
  }

  private async latestVersion(tx: Tx, systemId: string) {
    const [ver] = await tx.select().from(v).where(eq(v.systemId, systemId)).orderBy(desc(v.version)).limit(1);
    return ver;
  }

  private async toDto(tx: Tx, row: typeof s.$inferSelect): Promise<SystemDto> {
    const ver = await this.latestVersion(tx, row.id);
    const docs = await tx
      .select()
      .from(d)
      .where(and(eq(d.systemId, row.id), isNull(d.deletedAt)))
      .orderBy(asc(d.createdAt));
    return {
      id: row.id,
      name: row.name,
      templateId: row.templateId,
      versionId: ver!.id,
      version: ver!.version,
      canEdit: await this.canEdit(tx, row.id),
      documents: docs.map(toDocDto),
    };
  }

  list(userId: string): Promise<SystemDto[]> {
    return withUser(this.db, userId, async (tx) => {
      const rows = await tx.select().from(s).where(isNull(s.deletedAt)).orderBy(asc(s.name));
      return Promise.all(rows.map((r) => this.toDto(tx, r)));
    });
  }

  get(userId: string, id: string): Promise<SystemDto> {
    return withUser(this.db, userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(s)
        .where(and(eq(s.id, id), isNull(s.deletedAt)));
      if (!row) throw notFound('Sistema');
      return this.toDto(tx, row);
    });
  }

  create(userId: string, input: CreateSystemInput, ctx: RequestCtx): Promise<SystemDto> {
    return withUser(this.db, userId, async (tx) => {
      let def: SystemDefinition;
      if (input.templateId) {
        const t = SYSTEM_TEMPLATES[input.templateId];
        if (!t) throw notFound('Modelo de sistema');
        def = validateSystem(t);
      } else {
        // Sistema "em branco": só um d20 + atributo, sem perícias (o mestre usa a ficha livre).
        def = validateSystem({
          id: 'custom',
          name: input.name ?? 'Sistema próprio',
          source: { title: 'Definido pelo mestre' },
          attributes: [],
          check: { kind: 'die-plus-attribute', die: 20 },
        });
      }
      const [org] = await tx
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(and(eq(schema.organizations.ownerId, userId), eq(schema.organizations.isPersonal, true)));
      if (!org) throw notFound('Organização');
      const [row] = await tx
        .insert(s)
        .values({
          organizationId: org.id,
          createdBy: userId,
          templateId: input.templateId ?? null,
          name: input.name ?? def.name,
        })
        .returning();
      await tx.insert(v).values({ systemId: row!.id, version: 1, definition: def, createdBy: userId });
      await audit(tx, ctx, {
        action: 'system.created',
        entityType: 'rpg_system',
        entityId: row!.id,
        organizationId: org.id,
        after: { templateId: input.templateId ?? null },
      });
      return this.toDto(tx, row!);
    });
  }

  async upload(
    userId: string,
    systemId: string,
    file: Express.Multer.File | undefined,
    ctx: RequestCtx,
  ): Promise<DocumentDto> {
    if (!file) throw new AppError(ERROR_CODES.VALIDATION, 'Envie um arquivo PDF no campo "file".', 400);
    try {
      if (!(await isPdf(file.path)))
        throw new AppError(ERROR_CODES.VALIDATION, 'O arquivo não é um PDF válido.', 400);
      const sha = await sha256File(file.path);
      const size = await fileSize(file.path);
      const filename = file.originalname.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 200) || 'livro.pdf';
      // Confere permissão e duplicata ANTES de mover o arquivo.
      await withUser(this.db, userId, async (tx) => {
        if (!(await this.canEdit(tx, systemId))) throw notFound('Sistema');
        const [dup] = await tx
          .select({ id: d.id })
          .from(d)
          .where(and(eq(d.systemId, systemId), eq(d.sha256, sha), isNull(d.deletedAt)));
        if (dup)
          throw new AppError(ERROR_CODES.CONFLICT, 'Este livro já foi enviado para este sistema.', 409);
      });
      const key = await this.storage.put(file.path, systemId);
      const row = await withUser(this.db, userId, async (tx) => {
        const [r] = await tx
          .insert(d)
          .values({ systemId, uploadedBy: userId, filename, storageKey: key, sha256: sha, sizeBytes: size })
          .returning();
        await audit(tx, ctx, {
          action: 'document.uploaded',
          entityType: 'document',
          entityId: r!.id,
          after: { filename, size, sha256: sha },
        });
        return r!;
      }).catch(async (e: unknown) => {
        await this.storage.remove(key);
        throw e;
      });
      await this.queue.enqueue(row.id);
      return toDocDto(row);
    } finally {
      await rm(file.path, { force: true });
    }
  }

  removeDocument(userId: string, systemId: string, docId: string, ctx: RequestCtx) {
    return withUser(this.db, userId, async (tx) => {
      if (!(await this.canEdit(tx, systemId))) throw notFound('Sistema');
      const [doc] = await tx
        .select()
        .from(d)
        .where(and(eq(d.id, docId), eq(d.systemId, systemId), isNull(d.deletedAt)));
      if (!doc) throw notFound('Documento');
      await tx.update(d).set({ deletedAt: new Date() }).where(eq(d.id, docId));
      await audit(tx, ctx, { action: 'document.deleted', entityType: 'document', entityId: docId });
      // Remove o texto e o arquivo (o livro é do usuário: apagar é apagar mesmo).
      await this.db.delete(schema.documentPages).where(eq(schema.documentPages.documentId, docId));
      await this.storage.remove(doc.storageKey);
    });
  }

  search(userId: string, systemId: string, q: string, limit: number): Promise<RuleSearchHitDto[]> {
    return withUser(this.db, userId, async (tx) => {
      const ok = await tx.execute<{ ok: boolean }>(
        sql`select app_private.can_read_system(${systemId}::uuid) as ok`,
      );
      if (!ok[0]?.ok) throw notFound('Sistema');
      const rows = await tx.execute<RuleSearchHitDto & Record<string, unknown>>(
        searchSql(systemId, q, limit),
      );
      return rows.map((r) => ({ ...r, rank: Number(r.rank) }));
    });
  }

  page(userId: string, systemId: string, docId: string, n: number): Promise<DocumentPageDto> {
    return withUser(this.db, userId, async (tx) => {
      const [doc] = await tx
        .select()
        .from(d)
        .where(and(eq(d.id, docId), eq(d.systemId, systemId), isNull(d.deletedAt)));
      if (!doc || doc.status !== 'ready') throw notFound('Documento');
      const [p] = await tx
        .select({ text: schema.documentPages.text })
        .from(schema.documentPages)
        .where(and(eq(schema.documentPages.documentId, docId), eq(schema.documentPages.pageNumber, n)));
      if (!p) throw notFound('Página');
      return { documentId: docId, page: n, pageCount: doc.pageCount ?? 0, text: p.text };
    });
  }

  // ───── campanha ↔ sistema ─────
  async campaignSystem(userId: string, cid: string): Promise<CampaignSystemDto | null> {
    return withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      return this.campaignSystemTx(tx, cid);
    });
  }

  async campaignSystemTx(tx: Tx, cid: string): Promise<CampaignSystemDto | null> {
    const [row] = await tx
      .select({ versionId: v.id, definition: v.definition, systemId: s.id, name: s.name, templateId: s.templateId })
      .from(schema.campaigns)
      .innerJoin(v, eq(v.id, schema.campaigns.systemVersionId))
      .innerJoin(s, eq(s.id, v.systemId))
      .where(eq(schema.campaigns.id, cid));
    if (!row) return null;
    // Sistemas criados a partir de um modelo (ainda sem editor próprio) usam a versão
    // atual do modelo: correções e novas regras do livro chegam às campanhas existentes.
    const { templateId, ...rest } = row;
    const tpl = templateId ? SYSTEM_TEMPLATES[templateId] : undefined;
    if (tpl) rest.definition = tpl;
    const [book] = await tx
      .select({ id: d.id })
      .from(d)
      .where(and(eq(d.systemId, row.systemId), eq(d.status, 'ready'), isNull(d.deletedAt)))
      .limit(1);
    return { ...rest, hasBook: !!book };
  }

  setCampaignSystem(userId: string, cid: string, systemId: string | null, ctx: RequestCtx) {
    return withUser(this.db, userId, async (tx) => {
      await requireManager(tx, cid);
      let versionId: string | null = null;
      if (systemId) {
        const ver = await this.latestVersion(tx, systemId);
        if (!ver) throw notFound('Sistema');
        versionId = ver.id;
      }
      try {
        await tx.execute(sql`select app_private.set_campaign_system(${cid}::uuid, ${versionId}::uuid)`);
      } catch (e) {
        if (
          (e as { cause?: { code?: string } }).cause?.code === '42501' ||
          (e as { code?: string }).code === '42501'
        )
          throw forbidden('O sistema precisa pertencer a você (ou à organização da campanha).');
        throw e;
      }
      await audit(tx, ctx, {
        action: 'campaign.system_changed',
        entityType: 'campaign',
        entityId: cid,
        campaignId: cid,
        after: { systemId, versionId },
      });
      return this.campaignSystemTx(tx, cid);
    });
  }

  async searchCampaign(userId: string, cid: string, q: string, limit: number) {
    const sys = await this.campaignSystem(userId, cid);
    if (!sys) return [];
    return this.search(userId, sys.systemId, q, limit);
  }
}

const uploadInterceptor = (maxMb: number) =>
  FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        mkdir(TMP_DIR, { recursive: true }).then(
          () => cb(null, TMP_DIR),
          (e: Error) => cb(e, TMP_DIR),
        );
      },
    }),
    limits: { fileSize: maxMb * MB, files: 1, fields: 5 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf'))
        cb(null, true);
      else cb(new BadRequestException('Envie um arquivo PDF.'), false);
    },
  });

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 300);

@Controller()
export class SystemsController {
  constructor(private readonly svc: SystemsService) {}

  @Get('system-templates')
  templates() {
    return this.svc.templates();
  }
  @Get('systems')
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.id);
  }
  @Post('systems')
  create(@CurrentUser() u: AuthUser, @Body() b: unknown, @Ctx() ctx: RequestCtx) {
    return this.svc.create(u.id, parse(createSystemSchema, b ?? {}), ctx);
  }
  @Get('systems/:id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u.id, anyId(id));
  }
  @Post('systems/:id/documents')
  @UseInterceptors(uploadInterceptor(MAX_UPLOAD_MB))
  upload(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.upload(u.id, anyId(id), file, ctx);
  }
  @Delete('systems/:id/documents/:docId')
  @HttpCode(204)
  removeDocument(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('docId') doc: string,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.removeDocument(u.id, anyId(id), anyId(doc), ctx);
  }
  @Get('systems/:id/search')
  search(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query() q: unknown) {
    const { q: text, limit } = parse(searchSchema, q);
    return this.svc.search(u.id, anyId(id), text, limit);
  }
  @Get('systems/:id/documents/:docId/pages/:n')
  page(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('docId') doc: string,
    @Param('n') n: string,
  ) {
    const page = Number(n);
    if (!Number.isInteger(page) || page < 1 || page > 5000) throw notFound('Página');
    return this.svc.page(u.id, anyId(id), anyId(doc), page);
  }
  @Get('campaigns/:id/system')
  campaignSystem(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.campaignSystem(u.id, campaignId(id));
  }
  @Post('campaigns/:id/system')
  @HttpCode(200)
  setCampaignSystem(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() b: unknown,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.setCampaignSystem(u.id, campaignId(id), parse(setCampaignSystemSchema, b).systemId, ctx);
  }
  @Get('campaigns/:id/rules')
  searchCampaign(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query() q: unknown) {
    const { q: text, limit } = parse(searchSchema, q);
    return this.svc.searchCampaign(u.id, campaignId(id), text, limit);
  }
}
