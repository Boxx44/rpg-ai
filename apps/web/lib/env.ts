/** Variáveis públicas (visíveis no navegador). Nunca coloque segredos aqui. */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variável de ambiente ${name} não definida. Veja .env.example.`);
  return value;
}

export const env = {
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  apiUrl: required('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL),
  /** No navegador usa o endereço real do site (evita links de convite com domínio errado). */
  get siteUrl(): string {
    if (typeof window !== 'undefined') return window.location.origin;
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  },
  googleAuthEnabled: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true',
};
