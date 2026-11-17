import { Ornament } from '@rpg-ai/ui';
import { ArcaneBackdrop, Logo } from '@/components/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line/60 p-12 lg:flex">
        <ArcaneBackdrop />
        <Logo className="relative" />
        <div className="relative max-w-md space-y-5">
          <h1 className="font-display text-4xl leading-tight text-ink">
            Qualquer sistema.
            <br />
            <span className="bg-gradient-to-r from-gold-bright to-gold bg-clip-text text-transparent">
              Qualquer mesa.
            </span>
          </h1>
          <Ornament className="max-w-48" />
          <p className="text-ink-muted">
            Jogue com um mestre humano, com um mestre de IA ou com os dois juntos. Traga as regras do seu
            sistema favorito e mantenha cada campanha viva entre as sessões.
          </p>
        </div>
        <p className="relative text-xs text-ink-faint">© RPG AI</p>
      </section>
      <section className="flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <Logo className="mb-10 lg:hidden" />
        <div className="w-full max-w-sm animate-rise">{children}</div>
      </section>
    </main>
  );
}
