/** Aceita apenas caminhos internos (evita redirecionamento para sites externos). */
export function safeNextPath(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/dashboard';
}
