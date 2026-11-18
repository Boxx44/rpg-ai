import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { sanitizeValues, SYSTEM_TEMPLATES } from '@rpg-ai/rules-engine';
import { and, desc, type Database, eq, isNull, schema, type Tx, withUser } from '@rpg-ai/db';
import {
  type CharacterSheet,
  characterSheetSchema,
  ERROR_CODES,
  type LibrarySheetDto,
  librarySheetSchema,
  npcDetailsSchema,
  saveToLibrarySchema,
  updateLibrarySheetSchema,
  useLibrarySheetSchema,
} from '@rpg-ai/shared';
import type { z } from 'zod';
import { AppError, notFound } from '../common/errors';
import { Ctx, CurrentUser, parse, type RequestCtx } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { requireManager, requireMember } from './access';
import { CharactersService } from './characters';
import { SystemsService } from './documents/systems';
import { anyId, campaignId } from './ids';
import { NpcsService } from './npcs';
import { rulesError } from './sheet-actions';

const lib = schema.librarySheets;
const TEMPLATE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(SYSTEM_TEMPLATES).map(([k, d]) => [k, d.name]),
);

function toDto(r: typeof lib.$inferSelect): LibrarySheetDto {
  const npc = (r.npc ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    concept: r.concept,
    color: r.color,
    systemTemplate: r.systemTemplate,
    sheet: characterSheetSchema.parse(r.sheet ?? {}),
    npc: {
      appearance: String(npc.appearance ?? ''),
      publicDescription: String(npc.publicDescription ?? ''),
      details: npcDetailsSchema.omit({ sheet: true }).parse(npc.details ?? {}),
    },
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * Biblioteca pessoal de fichas (fora das campanhas). A ficha é validada contra o
 * modelo de sistema escolhido; ao levar para uma campanha, é validada de novo
 * contra o sistema daquela campanha.
 */
@Injectable()
export class LibraryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly characters: CharactersService,
    private readonly npcs: NpcsService,
    private readonly systems: SystemsService,
  ) {}

  private validate(template: string | null, sheet: CharacterSheet): CharacterSheet {
    if (!template) {
      const { system: _drop, ...rest } = sheet;
      return rest as CharacterSheet;
    }
    const def = SYSTEM_TEMPLATES[template];
    if (!def) throw new AppError(ERROR_CODES.VALIDATION, 'Sistema desconhecido', 400);
    return { ...sheet, system: rulesError(() => sanitizeValues(def, sheet.system)) } as CharacterSheet;
  }

  private async one(tx: Tx, userId: string, id: string) {
    const [r] = await tx
      .select()
      .from(lib)
      .where(and(eq(lib.id, id), eq(lib.ownerId, userId), isNull(lib.deletedAt)));
    if (!r) throw notFound('Ficha');
    return r;
  }

  list(userId: string) {
    return withUser(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(lib)
          .where(and(eq(lib.ownerId, userId), isNull(lib.deletedAt)))
          .orderBy(desc(lib.updatedAt))
      ).map(toDto),
    );
  }

  get(userId: string, id: string) {
    return withUser(this.db, userId, async (tx) => toDto(await this.one(tx, userId, id)));
  }

  create(userId: string, input: z.infer<typeof librarySheetSchema>) {
    return withUser(this.db, userId, async (tx) => {
      const sheet = this.validate(input.systemTemplate, input.sheet);
      const [r] = await tx
        .insert(lib)
        .values({ ...input, sheet, ownerId: userId, npc: input.kind === 'npc' ? input.npc : {} })
        .returning();
      return toDto(r!);
    });
  }

  update(userId: string, id: string, input: z.infer<typeof updateLibrarySheetSchema>) {
    return withUser(this.db, userId, async (tx) => {
      const cur = await this.one(tx, userId, id);
      const template = input.systemTemplate === undefined ? cur.systemTemplate : input.systemTemplate;
      const sheet = this.validate(template, input.sheet ?? characterSheetSchema.parse(cur.sheet ?? {}));
      const [r] = await tx
        .update(lib)
        .set({
          ...input,
          systemTemplate: template,
          sheet,
          ...(input.npc && cur.kind === 'npc' ? { npc: input.npc } : {}),
        })
        .where(eq(lib.id, id))
        .returning();
      return toDto(r!);
    });
  }

  remove(userId: string, id: string) {
    return withUser(this.db, userId, async (tx) => {
      await this.one(tx, userId, id);
      await tx.update(lib).set({ deletedAt: new Date() }).where(eq(lib.id, id));
    });
  }

  /** Leva uma cópia da ficha para a campanha (personagem: jogador; NPC: mestre). */
  async use(userId: string, id: string, campaignId: string, ctx: RequestCtx) {
    const { r, sheet } = await withUser(this.db, userId, async (tx) => {
      const r = await this.one(tx, userId, id);
      if (r.kind === 'npc') await requireManager(tx, campaignId);
      else await requireMember(tx, campaignId);
      const sys = await this.systems.campaignSystemTx(tx, campaignId);
      let sheet = characterSheetSchema.parse(r.sheet ?? {});
      if (sheet.system && r.systemTemplate) {
        if (!sys) {
          const { system: _drop, ...rest } = sheet;
          sheet = rest as CharacterSheet;
        } else if (sys.templateId !== r.systemTemplate)
          throw new AppError(
            ERROR_CODES.VALIDATION,
            `Esta ficha é de ${TEMPLATE_NAMES[r.systemTemplate] ?? r.systemTemplate}, mas a campanha usa ${sys.name}.`,
            400,
          );
      }
      return { r, sheet };
    });
    if (r.kind === 'character')
      return {
        kind: 'character' as const,
        item: await this.characters.create(
          userId,
          campaignId,
          { name: r.name, concept: r.concept, color: r.color, sheet },
          ctx,
        ),
      };
    const npc = toDto(r).npc;
    return {
      kind: 'npc' as const,
      item: await this.npcs.create(
        userId,
        campaignId,
        {
          name: r.name,
          appearance: npc.appearance,
          publicDescription: npc.publicDescription,
          color: r.color,
          revealed: false,
          details: { ...npc.details, sheet },
        },
        ctx,
      ),
    };
  }

  /** Guarda na biblioteca uma cópia de um personagem ou NPC de campanha. */
  async saveFrom(userId: string, campaignId: string, input: z.infer<typeof saveToLibrarySchema>) {
    const sys = await withUser(this.db, userId, (tx) => this.systems.campaignSystemTx(tx, campaignId));
    const template = sys?.templateId ?? null;
    if (input.characterId) {
      const list = await this.characters.list(userId, campaignId);
      const c = list.find((x) => x.id === input.characterId);
      if (!c) throw notFound('Personagem');
      return this.create(userId, {
        kind: 'character',
        name: c.name,
        concept: c.concept,
        color: c.color,
        systemTemplate: c.sheet.system ? template : null,
        sheet: c.sheet,
        npc: { appearance: '', publicDescription: '', details: {} as never },
      });
    }
    if (input.npcId) {
      const list = await this.npcs.list(userId, campaignId);
      const n = list.find((x) => x.id === input.npcId);
      if (!n?.details) throw notFound('NPC');
      const { sheet, ...details } = n.details;
      return this.create(userId, {
        kind: 'npc',
        name: n.name,
        concept: '',
        color: n.color,
        systemTemplate: sheet.system ? template : null,
        sheet,
        npc: { appearance: n.appearance, publicDescription: n.publicDescription, details },
      });
    }
    throw new AppError(ERROR_CODES.VALIDATION, 'Escolha um personagem ou NPC', 400);
  }
}

@Controller()
export class LibraryController {
  constructor(private readonly svc: LibraryService) {}

  @Get('library')
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.id);
  }
  @Get('library/:sid')
  get(@CurrentUser() u: AuthUser, @Param('sid') sid: string) {
    return this.svc.get(u.id, anyId(sid));
  }
  @Post('library')
  create(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    return this.svc.create(u.id, parse(librarySheetSchema, b));
  }
  @Patch('library/:sid')
  update(@CurrentUser() u: AuthUser, @Param('sid') sid: string, @Body() b: unknown) {
    return this.svc.update(u.id, anyId(sid), parse(updateLibrarySheetSchema, b));
  }
  @Delete('library/:sid')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('sid') sid: string) {
    return this.svc.remove(u.id, anyId(sid));
  }
  @Post('library/:sid/use')
  use(@CurrentUser() u: AuthUser, @Param('sid') sid: string, @Body() b: unknown, @Ctx() ctx: RequestCtx) {
    return this.svc.use(u.id, anyId(sid), parse(useLibrarySheetSchema, b).campaignId, ctx);
  }
  @Post('campaigns/:id/library')
  saveFrom(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    return this.svc.saveFrom(u.id, campaignId(id), parse(saveToLibrarySchema, b));
  }
}
