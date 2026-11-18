import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Logger } from '@rpg-ai/logger';
import { type ApiErrorBody, ERROR_CODES, type ErrorCode } from '@rpg-ai/shared';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { LOGGER } from './tokens';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') =>
  new AppError(ERROR_CODES.NOT_FOUND, `${what} não encontrado`, 404);
export const forbidden = (msg = 'Você não tem permissão para esta ação') =>
  new AppError(ERROR_CODES.FORBIDDEN, msg, 403);
export const unauthenticated = (msg = 'Autenticação necessária') =>
  new AppError(ERROR_CODES.UNAUTHENTICATED, msg, 401);

/** Erros do gatilho que confere a imagem usada (outra campanha / enviada por outra pessoa). */
export function assetRefError(e: unknown): never {
  const err = e as { code?: string; cause?: { code?: string } };
  const code = err.code ?? err.cause?.code;
  if (code === '23503') throw new AppError(ERROR_CODES.VALIDATION, 'Imagem inválida para esta campanha', 400);
  if (code === '42501') throw forbidden('Você só pode usar imagens que você enviou');
  throw e;
}

/** Checagem estrutural: evita falhas quando ESM e CommonJS carregam cópias diferentes do zod. */
function isZodError(e: unknown): e is ZodError {
  return (
    e instanceof ZodError ||
    (e instanceof Error && e.name === 'ZodError' && Array.isArray((e as ZodError).issues))
  );
}

interface PgError {
  code?: string;
  hint?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const requestId = req.requestId;
    const { status, body } = this.toBody(exception);
    body.error.requestId = requestId;
    if (status >= 500) {
      this.logger.error({ err: exception, requestId, path: req.path }, 'unhandled error');
    }
    res.status(status).json(body);
  }

  private toBody(e: unknown): { status: number; body: ApiErrorBody } {
    const make = (status: number, code: ErrorCode, message: string, details?: unknown) => ({
      status,
      body: { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    });
    if (e instanceof AppError) return make(e.status, e.code, e.message, e.details);
    if (isZodError(e))
      return make(
        400,
        ERROR_CODES.VALIDATION,
        'Dados inválidos',
        e.issues.map((i) => ({ path: i.path, message: i.message })),
      );
    const pg = (e as { cause?: PgError }).cause ?? (e as PgError);
    if (pg?.hint === 'INVITATION_INVALID')
      return make(
        400,
        ERROR_CODES.INVITATION_INVALID,
        'Convite inválido, expirado ou destinado a outro e-mail',
      );
    if (pg?.code === '42501')
      return make(403, ERROR_CODES.FORBIDDEN, 'Você não tem permissão para esta ação');
    if (pg?.code === '23505') return make(409, ERROR_CODES.CONFLICT, 'Registro já existe');
    // Erros do leitor de corpo (express/body-parser)
    const bp = e as { type?: string; status?: number };
    if (bp?.type === 'entity.too.large') return make(413, ERROR_CODES.VALIDATION, 'Requisição grande demais');
    if (bp?.type === 'entity.parse.failed') return make(400, ERROR_CODES.VALIDATION, 'JSON malformado');
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code =
        status === 404
          ? ERROR_CODES.NOT_FOUND
          : status === 401
            ? ERROR_CODES.UNAUTHENTICATED
            : ERROR_CODES.VALIDATION;
      return make(
        status,
        status >= 500 ? ERROR_CODES.INTERNAL : code,
        status === 404 ? 'Rota não encontrada' : e.message,
      );
    }
    return make(HttpStatus.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL, 'Erro interno. Tente novamente.');
  }
}
