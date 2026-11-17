'use client';

import { Button, cn } from '@rpg-ai/ui';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

const links = [{ href: '/dashboard', label: 'Campanhas', match: ['/dashboard', '/campaigns'] }];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {links.map((l) => {
        const active = l.match.some((m) => path.startsWith(m));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'relative rounded-md px-3 py-2 text-sm transition-colors',
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
