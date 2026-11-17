import { type NextRequest, NextResponse } from 'next/server';
import { safeNextPath } from '@/lib/safe-next';
import { supabaseServer } from '@/lib/supabase-server';

/** Retorno do login com Google, confirmação de e-mail e recuperação de senha. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const next = safeNextPath(req.nextUrl.searchParams.get('next'));
  const base = req.nextUrl.origin;
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${next}`);
  }
  return NextResponse.redirect(`${base}/login?error=callback`);
}
