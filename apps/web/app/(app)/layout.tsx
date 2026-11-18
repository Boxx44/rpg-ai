import type { MeDto } from '@rpg-ai/shared';
import { Avatar } from '@rpg-ai/ui';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { LiveSessionNotifier } from '@/components/live-notifier';
import { NavLinks, SignOutButton } from '@/components/nav';
import { PrefsMenu, Toaster } from '@/components/prefs-menu';
import { api } from '@/lib/api';
import { serverToken } from '@/lib/supabase-server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await api<MeDto>('/me', await serverToken());
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-3 sm:gap-6 sm:px-6">
          <Logo href="/dashboard" compact />
          <NavLinks />
          <div className="ml-auto flex items-center gap-2">
            <PrefsMenu />
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              data-testid="nav-profile"
            >
              <Avatar name={me.displayName} src={me.avatarUrl} size={30} />
              <span className="hidden max-w-36 truncate sm:inline">{me.displayName}</span>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="outline-none mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
      <LiveSessionNotifier />
      <Toaster />
    </div>
  );
}
