import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, type Database, desc, eq, schema, sql, withUser } from '@rpg-ai/db';
import {
  ASSET_KINDS,
  ASSET_LIMITS,
  type AssetDto,
  type AssetUsageDto,
  canManageCampaign,
  ERROR_CODES,
  imageInfo,
} from '@rpg-ai/shared';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { AppError, forbidden, notFound } from '../common/errors';
import { CurrentUser, parse } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { requireMember } from './access';
import { anyId, campaignId } from './ids';

const a = schema.assets;

const uploadFields = z.object({
  kind: z.enum(ASSET_KINDS),
  name: z.string().trim().max(80).default(''),
});

function toDto(r: Omit<typeof a.$inferSelect, 'data' | 'campaignId'>): AssetDto {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    mime: r.mime,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    ownerId: r.ownerId,
    createdAt: r.createdAt.toISOString(),
  };
}

const meta = {
  id: a.id,
  kind: a.kind,
  name: a.name,
  mime: a.mime,
  width: a.width,
  height: a.height,
  bytes: a.bytes,
  ownerId: a.ownerId,
  createdAt: a.createdAt,
};

@Injectable()
export class AssetsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Guarda uma imagem. O tipo é conferido pelos próprios bytes (não pelo nome);
   * só PNG, JPEG e WebP. Quem pode enviar e o limite de espaço são checados no banco (RLS).
   */
  async upload(
    userId: string,
    cid: string,
    file: Express.Multer.File | undefined,
    fields: unknown,
  ): Promise<AssetDto> {
    if (!file) throw new AppError(ERROR_CODES.VALIDATION, 'Escolha uma imagem.', 400);
    const { kind, name } = parse(uploadFields, fields);
    const data = file.buffer;
    if (data.length > ASSET_LIMITS.maxBytes)
      throw new AppError(ERROR_CODES.VALIDATION, 'Imagem grande demais (máximo 4 MB).', 413);
    const info = imageInfo(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    if (!info) throw new AppError(ERROR_CODES.VALIDATION, 'Formato não aceito. Use PNG, JPG ou WebP.', 415);

    return withUser(this.db, userId, async (tx) => {
      const role = await requireMember(tx, cid);
      if (kind !== 'portrait' && !canManageCampaign(role))
        throw forbidden('Só o mestre envia fundos de mapa e imagens de token');
      if (role === 'spectator') throw forbidden('Espectadores apenas acompanham a mesa');
      const [{ used }] = (await tx.execute<{ used: string }>(
        sql`select app_private.asset_usage(${cid}::uuid) as used`,
      )) as unknown as [{ used: string }];
      if (Number(used) + data.length > ASSET_LIMITS.campaignBytes)
        throw new AppError(
          ERROR_CODES.VALIDATION,
          'O espaço de imagens desta campanha acabou (60 MB). Apague imagens que não usa mais.',
          413,
        );
      const [row] = await tx
        .insert(a)
        .values({
          campaignId: cid,
          ownerId: userId,
          kind,
          name: name || (file.originalname ?? '').slice(0, 80),
          mime: info.mime,
          width: info.width,
          height: info.height,
          bytes: data.length,
          data,
        })
        .returning(meta);
      return toDto(row!);
    });
  }

  /** Lista de imagens (sem o conteúdo): o mestre vê todas; os demais, só as próprias. */
  list(userId: string, cid: string): Promise<AssetDto[]> {
    return withUser(this.db, userId, async (tx) => {
      const role = await requireMember(tx, cid);
      const rows = await tx
        .select(meta)
        .from(a)
        .where(
          canManageCampaign(role) ? eq(a.campaignId, cid) : and(eq(a.campaignId, cid), eq(a.ownerId, userId)),
        )
        .orderBy(desc(a.createdAt));
      return rows.map(toDto);
    });
  }

  usage(userId: string, cid: string): Promise<AssetUsageDto> {
    return withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      const r = await tx.execute<{ used: string }>(sql`select app_private.asset_usage(${cid}::uuid) as used`);
      return { used: Number(r[0]?.used ?? 0), limit: ASSET_LIMITS.campaignBytes };
    });
  }

  /** Conteúdo da imagem. Se a pessoa não pode ver (RLS), responde 404. */
  file(userId: string, cid: string, id: string) {
    return withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      const [row] = await tx
        .select({ data: a.data, mime: a.mime })
        .from(a)
        .where(and(eq(a.id, id), eq(a.campaignId, cid)));
      if (!row) throw notFound('Imagem');
      return row;
    });
  }

  remove(userId: string, cid: string, id: string) {
    return withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      const gone = await tx
        .delete(a)
        .where(and(eq(a.id, id), eq(a.campaignId, cid)))
        .returning({ id: a.id });
      if (!gone.length) throw notFound('Imagem');
    });
  }
}

const imageUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: ASSET_LIMITS.maxBytes, files: 1, fields: 4 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpeg|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new BadRequestException('Formato não aceito. Use PNG, JPG ou WebP.'), false);
  },
});

@Controller('campaigns/:id/assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Post()
  @UseInterceptors(imageUpload)
  upload(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() fields: unknown,
  ) {
    return this.svc.upload(u.id, campaignId(id), file, fields);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.list(u.id, campaignId(id));
  }

  @Get('usage')
  usage(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.usage(u.id, campaignId(id));
  }

  @Get(':assetId/file')
  async file(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('assetId') aid: string,
    @Res() res: Response,
  ) {
    const f = await this.svc.file(u.id, campaignId(id), anyId(aid));
    res.set({
      'Content-Type': f.mime,
      'Content-Length': String(f.data.length),
      // Imagens nunca mudam (uma nova imagem ganha outro id); o navegador pode guardar.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
    });
    res.end(f.data);
  }

  @Delete(':assetId')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('assetId') aid: string) {
    return this.svc.remove(u.id, campaignId(id), anyId(aid));
  }
}
