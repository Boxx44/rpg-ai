import { type CookieOptions, createServerClient } from '@supabase/ssr';

type CookieList = { name: string; value: string; options: CookieOptions }[];
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from './env';

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieList) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components não podem gravar cookies; o middleware renova a sessão.
        }
      },
    },
  });
}

/**
 * Token para chamar a API a partir do servidor. A API verifica a assinatura do token,
 * então ler a sessão do cookie aqui é seguro (o middleware já validou o usuário).
 */
export async function serverToken(): Promise<string> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getSession();
  if (!data.session) redirect('/login');
  return data.session.access_token;
}
