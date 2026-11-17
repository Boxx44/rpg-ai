import { Button } from '@rpg-ai/ui';
import Link from 'next/link';
import { Sigil } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <Sigil size={56} className="opacity-70" />
      <h1 className="font-display text-2xl">Caminho perdido</h1>
      <p className="max-w-sm text-sm text-ink-muted">Esta página não existe ou você não tem acesso a ela.</p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Voltar às campanhas</Link>
      </Button>
    </main>
  );
}
