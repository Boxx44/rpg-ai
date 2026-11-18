import { z } from 'zod';

export const createSystemSchema = z.object({
  templateId: z
    .string()
    .regex(/^[a-z0-9_]{1,40}$/)
    .optional(),
  name: z.string().trim().min(1).max(100).optional(),
});
export type CreateSystemInput = z.infer<typeof createSystemSchema>;

export const setCampaignSystemSchema = z.object({ systemId: z.string().uuid().nullable() });

export const searchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export const characterCheckSchema = z
  .object({
    skill: z
      .string()
      .regex(/^[a-z0-9_]{1,40}$/i)
      .optional(),
    attribute: z
      .string()
      .regex(/^[a-z0-9_]{1,40}$/i)
      .optional(),
    bonus: z.number().int().min(-50).max(50).default(0),
    visibility: z.enum(['public', 'gm']).default('public'),
  })
  .refine((v) => !!v.skill !== !!v.attribute, { message: 'Informe uma perícia OU um atributo' });

export interface SystemTemplateDto {
  id: string;
  name: string;
  edition: string;
}

export interface DocumentDto {
  id: string;
  filename: string;
  sizeBytes: number;
  pageCount: number | null;
  pagesWithoutText: number | null;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  progress: number;
  error: string | null;
  createdAt: string;
}

export interface SystemDto {
  id: string;
  name: string;
  templateId: string | null;
  versionId: string;
  version: number;
  canEdit: boolean;
  documents: DocumentDto[];
}

export interface CampaignSystemDto {
  systemId: string;
  name: string;
  versionId: string;
  /** Definição completa (validada pelo motor de regras). */
  definition: unknown;
  hasBook: boolean;
  /** Livro pronto para consulta (abrir páginas citadas pelas regras). */
  bookId: string | null;
}

export interface RuleSearchHitDto {
  documentId: string;
  filename: string;
  page: number;
  snippet: string;
  rank: number;
}

export interface DocumentPageDto {
  documentId: string;
  page: number;
  pageCount: number;
  text: string;
}
