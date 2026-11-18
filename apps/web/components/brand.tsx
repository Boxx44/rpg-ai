import { cn } from '@rpg-ai/ui';
import Link from 'next/link';

/** Selo do RPG AI: hexágono dourado com núcleo arcano (desenho original). */
export function Sigil({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="sg-core" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9b72f7" />
          <stop offset="1" stopColor="#4c23a8" />
        </linearGradient>
      </defs>
      <path d="M32 6 54 19v26L32 58 10 45V19z" fill="none" stroke="#c9a24b" strokeWidth="2.5" />
      <path
        d="M32 13 48 22.5v19L32 51 16 41.5v-19z"
        fill="none"
        stroke="#c9a24b"
        strokeOpacity=".35"
        strokeWidth="1"
      />
      <path d="M32 19 43 25.5v13L32 45l-11-6.5v-13z" fill="url(#sg-core)" />
      <circle cx="32" cy="32" r="3.5" fill="#e6c87f" />
    </svg>
  );
}

export function Logo({
  href = '/',
  className,
  compact,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="RPG AI — início"
      className={cn('group inline-flex items-center gap-2.5', className)}
    >
      <Sigil size={30} className="transition-transform duration-500 group-hover:rotate-[30deg]" />
      <span className={cn('font-display text-lg tracking-[0.18em] text-ink', compact && 'hidden md:inline')}>
        RPG <span className="text-gold-bright">AI</span>
      </span>
    </Link>
  );
}

/** Painel decorativo das telas de entrada: anéis de runas desenhados em SVG. */
export function ArcaneBackdrop() {
  const ticks = Array.from({ length: 48 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(124,79,240,0.28),transparent_55%)] animate-glow" />
      <svg
        viewBox="0 0 400 400"
        className="absolute left-1/2 top-1/2 w-[130%] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-60"
      >
        <g fill="none" stroke="#c9a24b">
          <circle cx="200" cy="200" r="180" strokeOpacity=".18" />
          <circle cx="200" cy="200" r="150" strokeOpacity=".3" strokeDasharray="2 6" />
          <circle cx="200" cy="200" r="110" strokeOpacity=".22" />
          <rect x="100" y="100" width="200" height="200" strokeOpacity=".22" />
          <rect x="100" y="100" width="200" height="200" strokeOpacity=".22" transform="rotate(45 200 200)" />
        </g>
        <g stroke="#9b72f7" strokeOpacity=".5">
          {ticks.map((i) => {
            const a = (i / ticks.length) * Math.PI * 2;
            const r1 = i % 4 === 0 ? 162 : 168;
            return (
              <line
                key={i}
                x1={200 + Math.cos(a) * r1}
                y1={200 + Math.sin(a) * r1}
                x2={200 + Math.cos(a) * 176}
                y2={200 + Math.sin(a) * 176}
              />
            );
          })}
        </g>
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/40" />
    </div>
  );
}
