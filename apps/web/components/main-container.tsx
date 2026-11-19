'use client';

import { cn } from '@rpg-ai/ui';
import { usePathname } from 'next/navigation';

/** Mesa e editor de mapas usam a tela toda; as demais páginas ficam numa coluna confortável de ler. */
export function MainContainer({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const wide = /^\/campaigns\/[^/]+(\/maps)?$/.test(path) && !path.startsWith('/campaigns/new');
  return (
    <main
      id="main"
      tabIndex={-1}
      data-wide={wide ? 'true' : undefined}
      className={cn(
        'mx-auto px-4 outline-none sm:px-6',
        wide ? 'max-w-[2200px] py-6 sm:py-8' : 'max-w-6xl py-8 sm:py-12',
      )}
    >
      {children}
    </main>
  );
}
