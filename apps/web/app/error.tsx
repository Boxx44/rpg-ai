'use client';

import { Alert, Button } from '@rpg-ai/ui';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-4 px-6">
      <Alert tone="error" title="Algo deu errado">
        {error.message.includes('conectar') ? error.message : 'Não foi possível carregar esta página.'}
        {error.digest && <span className="mt-1 block text-xs opacity-70">Código: {error.digest}</span>}
      </Alert>
      <Button onClick={reset}>Tentar de novo</Button>
    </main>
  );
}
