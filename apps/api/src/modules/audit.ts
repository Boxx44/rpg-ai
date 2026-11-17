import { sql, type Tx } from '@rpg-ai/db';
import type { RequestCtx } from '../common/http';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  organizationId?: string | null;
  campaignId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Grava auditoria na MESMA transação da alteração.
 * O ator é sempre o usuário do JWT da transação (definido no banco; não pode ser forjado).
 */
export async function audit(tx: Tx, ctx: RequestCtx, e: AuditEntry): Promise<void> {
  const j = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
  await tx.execute(sql`select app_private.write_audit(
    ${e.action}, ${e.entityType}, ${e.entityId ?? null},
    ${e.organizationId ?? null}::uuid, ${e.campaignId ?? null}::uuid,
    ${j(e.before)}::jsonb, ${j(e.after)}::jsonb, ${ctx.requestId}, ${ctx.ipHash})`);
}
