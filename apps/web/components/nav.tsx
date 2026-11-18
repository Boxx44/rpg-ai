'use client';

import { Button, cn } from '@rpg-ai/ui';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

const links = [
  { href: '/dashboard', label: 'Campanhas', match: ['/dashboard', '/campaigns'] },
  { href: '/library', label: 'Fichas', match: ['/library'] },
  { href: '/practice', label: 'Treino', match: ['/practice'] },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="Principal">
      {links.map((l) => {
        const active = l.match.some((m) => path.startsWith(m));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'relative rounded-md px-2 py-2 text-sm transition-colors sm:px-3',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {l.label}
            {active && (
              <span className="absolute inset-x-3 -bottom-[13px] h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      title="Sair"
      aria-label="Sair"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await supabaseBrowser().auth.signOut();
        router.replace('/login');
        router.refresh();
      }}
    >
      {!loading && <LogOut />}
    </Button>
  );
}
