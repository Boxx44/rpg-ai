import { uuidSchema } from '@rpg-ai/shared';
import { notFound } from '../common/errors';

/** IDs malformados viram 404 (sem distinguir de "não existe"). */
export function campaignId(v: string): string {
  if (!uuidSchema.safeParse(v).success) throw notFound();
  return v;
}
export const anyId = campaignId;
