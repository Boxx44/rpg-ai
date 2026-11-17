import { notFound } from 'next/navigation';
import { api, ApiError } from './api';

/** Para páginas do servidor: 404 da API vira a página "não encontrada". */
export async function pageApi<T>(path: string, token: string): Promise<T> {
  try {
    return await api<T>(path, token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
