import type { ApiErrorBody } from '@rpg-ai/shared';
import { env } from './env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Chamada à API do RPG AI. Funciona no servidor e no navegador. */
export async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'Não foi possível conectar ao servidor. Verifique se a API está rodando.',
    );
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? `Erro ${res.status}`);
  }
  return body as T;
}

export const json = (data: unknown) => JSON.stringify(data);
