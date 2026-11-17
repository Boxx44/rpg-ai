import { randomInt } from 'node:crypto';
import { Body, Controller, Get, Inject, Injectable, Param, Post, Query } from '@nestjs/common';
import { and, type Database, desc, eq, schema, sql, type Tx, withUser } from '@rpg-ai/db';
import { DiceError, rollDice } from '@rpg-ai/rules-engine';
import {
  type ChatMessageDto,
  ERROR_CODES,
  type MessageInput,
  messageSchema,
  messagesQuerySchema,
  type RollInput,
  type RollPartDto,
  rollSchema,
  WS_EVENTS,
} from '@rpg-ai/shared';
import { AppError } from '../common/errors';
import { CurrentUser, parse } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { requireMember, requirePlayer } from './access';
import { campaignId } from './ids';
import { Realtime } from './realtime.gateway';

const msg = schema.chatMessages;

/** RNG criptográfico: ninguém consegue prever ou manipular as rolagens. */
const secureRng = (min: number, max: number) => randomInt(min, max + 1);

@Injectable()
export class ChatService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rt: Realtime,
  ) {}

  /** Busca mensagens já filtradas pelo RLS (o que o usuário pode ver). */
  private async load(tx: Tx, where: ReturnType<typeof and>, limit: number): Promise<ChatMessageDto[]> {
    const rows = await tx
      .select({
        id: msg.id,
        campaignId: msg.campaignId,
        kind: msg.kind,
        content: msg.content,
        visibility: msg.visibility,
        createdAt: msg.createdAt,
        authorId: msg.authorId,
        authorName: schema.userProfiles.displayName,
        npcId: msg.npcId,
        npcName: msg.speakerName,
        npcColor: msg.speakerColor,
        expression: schema.diceRolls.expression,
        label: schema.diceRolls.label,
        total: schema.diceRolls.total,
        result: schema.diceRolls.result,
      })
      .from(msg)
      .innerJoin(schema.userProfiles, eq(schema.userProfiles.userId, msg.authorId))
      .leftJoin(schema.diceRolls, eq(schema.diceRolls.id, msg.rollId))
      .where(where)
      .orderBy(desc(msg.id))
      .limit(limit);
    return rows.reverse().map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      kind: r.kind,
      content: r.content,
      visibility: r.visibility,
      createdAt: r.createdAt.toISOString(),
      author: { id: r.authorId, displayName: r.authorName },
      // Nome/cor gravados na fala: o jogador vê quem falou sem acessar a ficha do NPC.
      npc: r.npcId && r.npcName ? { id: r.npcId, name: r.npcName, color: r.npcColor ?? '#c9a24b' } : null,
      roll:
        r.kind === 'roll' && r.expression !== null
          ? {
              expression: r.expression,
              label: r.label ?? '',
              total: r.total!,
              parts: (r.result as { parts: RollPartDto[] }).parts,
            }
          : null,
    }));
  }

  list(userId: string, cid: string, q: { before?: number; after?: number; limit: number }) {
    return withUser(this.db, userId, async (tx) => {
      await requireMember(tx, cid);
      const conds = [eq(msg.campaignId, cid)];
      if (q.before) conds.push(sql`${msg.id} < ${q.before}`);
      if (q.after !== undefined) conds.push(sql`${msg.id} > ${q.after}`);
      return this.load(tx, and(...conds), q.limit);
    });
  }

  private async publish(cid: string, authorId: string, dto: ChatMessageDto) {
    if (dto.visibility === 'public') this.rt.campaign(cid, WS_EVENTS.chatMessage, dto);
    else this.rt.managers(cid, WS_EVENTS.chatMessage, dto, authorId);
  }

  async post(userId: string, cid: string, input: MessageInput): Promise<ChatMessageDto> {
    const dto = await withUser(this.db, userId, async (tx) => {
      await requirePlayer(tx, cid);
      const r = await tx.execute<{ id: number }>(
        sql`select app_private.post_message(${cid}::uuid, ${input.content}, ${input.npcId ?? null}::uuid, ${input.visibility}) as id`,
      );
      const [m] = await this.load(tx, and(eq(msg.id, Number(r[0]!.id))), 1);
      return m!;
    });
    await this.publish(cid, userId, dto);
    return dto;
  }

  async roll(userId: string, cid: string, input: RollInput): Promise<ChatMessageDto> {
    let result;
    try {
      result = rollDice(input.expression, secureRng);
    } catch (e) {
      if (e instanceof DiceError) throw new AppError(ERROR_CODES.VALIDATION, e.message, 400);
      throw e;
    }
    const dto = await withUser(this.db, userId, async (tx) => {
      await requirePlayer(tx, cid);
      const r = await tx.execute<{ id: number }>(sql`select app_private.record_roll(
        ${cid}::uuid, ${result.expression}, ${input.label}, ${JSON.stringify(result)}::jsonb, ${result.total}, ${input.visibility}) as id`);
      const [m] = await this.load(tx, and(eq(msg.id, Number(r[0]!.id))), 1);
      return m!;
    });
    await this.publish(cid, userId, dto);
    return dto;
  }
}

@Controller('campaigns/:id')
export class ChatController {
  constructor(private readonly svc: ChatService) {}

  @Get('messages')
  list(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query() q: unknown) {
    return this.svc.list(u.id, campaignId(id), parse(messagesQuerySchema, q));
  }

  @Post('messages')
  post(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.post(u.id, campaignId(id), parse(messageSchema, body));
  }

  @Post('rolls')
  roll(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.roll(u.id, campaignId(id), parse(rollSchema, body));
  }
}
