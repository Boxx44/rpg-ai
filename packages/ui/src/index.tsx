/**
 * Design system Dark Fantasy do RPG AI.
 * Componentes no estilo shadcn/ui (código próprio, sem dependência de registro externo).
 * Cores e fontes vêm das variáveis definidas em ./theme.css.
 */
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import * as React from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ───────────── Button ─────────────
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-b from-arcane-500 to-arcane-700 text-white shadow-[0_0_0_1px_rgba(201,162,75,0.25),0_8px_24px_-8px_rgba(124,58,237,0.6)] ' +
          'hover:from-arcane-400 hover:to-arcane-600 hover:shadow-[0_0_0_1px_rgba(201,162,75,0.5),0_10px_30px_-8px_rgba(139,92,246,0.75)]',
        secondary: 'bg-surface-2 text-ink border border-line hover:border-arcane-500/60 hover:bg-surface-3',
        ghost: 'text-ink-muted hover:text-ink hover:bg-surface-2',
        outline: 'border border-gold/40 text-gold-bright hover:bg-gold/10 hover:border-gold/70',
        danger: 'bg-blood/90 text-white hover:bg-blood border border-blood',
        link: 'text-arcane-300 underline-offset-4 hover:underline hover:text-arcane-200 px-0',
      },
      size: { sm: 'h-8 px-3', md: 'h-10 px-4', lg: 'h-12 px-6 text-base', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Spinner />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  );
}

// ───────────── Form fields ─────────────
const fieldBase =
  'w-full rounded-md border border-line bg-bg/60 px-3 text-sm text-ink placeholder:text-ink-faint ' +
  'transition-colors focus-visible:outline-none focus-visible:border-arcane-400 focus-visible:ring-2 focus-visible:ring-arcane-500/30 ' +
  'disabled:opacity-50 aria-[invalid=true]:border-blood/80';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'min-h-24 py-2 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(fieldBase, 'h-10 appearance-none bg-surface-2 pr-8', className)}
      {...props}
    />
  ),
);
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted', className)}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-blood-light" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

// ───────────── Card ─────────────
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative rounded-xl border border-line bg-surface/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_20px_50px_-30px_rgba(0,0,0,0.9)] backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1 p-6 pb-3', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('font-display text-lg tracking-wide text-ink', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-ink-muted', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-3', className)} {...props} />;
}

// ───────────── Badge ─────────────
export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
  {
    variants: {
      tone: {
        arcane: 'border-arcane-500/40 bg-arcane-500/10 text-arcane-200',
        gold: 'border-gold/40 bg-gold/10 text-gold-bright',
        neutral: 'border-line bg-surface-2 text-ink-muted',
        danger: 'border-blood/50 bg-blood/10 text-blood-light',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);
export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ───────────── Alert ─────────────
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-arcane-500/40 bg-arcane-500/5 text-arcane-100',
    warning: 'border-gold/40 bg-gold/5 text-gold-bright',
    error: 'border-blood/50 bg-blood/10 text-blood-light',
    success: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone], className)}
    >
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      {children && <div className="opacity-90">{children}</div>}
    </div>
  );
}

// ───────────── Ornament divider ─────────────
export function Ornament({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-gold/60', className)} aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-gold/60" />
      <svg width="10" height="10" viewBox="0 0 10 10" className="rotate-45">
        <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-gold/40 to-gold/60" />
    </div>
  );
}

// ───────────── Avatar ─────────────
export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-full border border-gold/30 object-cover"
    />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="inline-flex items-center justify-center rounded-full border border-gold/30 bg-gradient-to-br from-arcane-700 to-surface-3 font-display text-xs text-gold-bright"
    >
      {initials || '?'}
    </span>
  );
}
export * from './game-icons';
