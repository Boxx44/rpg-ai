'use client';
import { createBrowserClient } from '@supabase/ssr';
import { env } from './env';

let client: ReturnType<typeof createBrowserClient> | undefined;

export function supabaseBrowser() {
  client ??= createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}

/** Token de acesso atual (renovado automaticamente pelo Supabase). */
export async function accessToken(): Promise<string> {
  const { data } = await supabaseBrowser().auth.getSession();
  if (!data.session) throw new Error('Sessão expirada. Entre novamente.');
  return data.session.access_token;
}

/** Traduz mensagens do Supabase Auth para português. */
export function authErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  const code = err?.code ?? '';
  const map: Record<string, string> = {
    invalid_credentials: 'E-mail ou senha incorretos.',
    user_already_exists: 'Já existe uma conta com este e-mail.',
    weak_password: 'A senha precisa ter pelo menos 8 caracteres.',
    email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
    over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos.',
    over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos.',
    validation_failed: 'Verifique os dados informados.',
    same_password: 'A nova senha precisa ser diferente da anterior.',
  };
  return map[code] ?? 'Não foi possível concluir. Tente novamente.';
}
