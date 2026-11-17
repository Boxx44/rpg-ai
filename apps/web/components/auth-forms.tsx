'use client';

import { Alert, Button, Field, Input, Ornament } from '@rpg-ai/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { env } from '@/lib/env';
import { safeNextPath } from '@/lib/safe-next';
import { authErrorMessage, supabaseBrowser } from '@/lib/supabase';

const safeNext = safeNextPath;

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-7 space-y-2">
      <h1 className="font-display text-2xl tracking-wide">{title}</h1>
      <p className="text-sm text-ink-muted">{subtitle}</p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

export function GoogleButton({ next }: { next: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  if (!env.googleAuthEnabled) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="secondary" className="w-full" disabled>
          <GoogleIcon /> Entrar com Google
        </Button>
        <p className="text-center text-xs text-ink-faint">
          Login com Google ainda não configurado neste ambiente.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          const { error } = await supabaseBrowser().auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
          });
          if (error) {
            setError(authErrorMessage(error));
            setLoading(false);
          }
        }}
      >
        {!loading && <GoogleIcon />} Entrar com Google
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
      <Ornament className="flex-1" />
      ou
      <Ornament className="flex-1" />
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: String(f.get('email')),
      password: String(f.get('password')),
    });
    if (error) {
      setError(authErrorMessage(error));
      setLoading(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      <Heading title="Bem-vindo de volta" subtitle="Entre para continuar suas campanhas." />
      <GoogleButton next={next} />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Senha" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>
          Entrar
        </Button>
      </form>
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-ink-muted hover:text-ink">
          Esqueci minha senha
        </Link>
        <Link
          href={`/register${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-arcane-300 hover:text-arcane-200"
        >
          Criar conta
        </Link>
      </div>
    </>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name')).trim();
    const email = String(f.get('email')).trim();
    const password = String(f.get('password'));
    const confirm = String(f.get('confirm'));
    const errs: Record<string, string> = {};
    if (!name) errs.name = 'Informe como quer ser chamado.';
    if (name.length > 60) errs.name = 'Máximo de 60 caracteres.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'E-mail inválido.';
    if (password.length < 8) errs.password = 'Mínimo de 8 caracteres.';
    if (password !== confirm) errs.confirm = 'As senhas não conferem.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setError(undefined);
    const { data, error } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    if (!data.session) {
      setInfo('Conta criada! Enviamos um link de confirmação para o seu e-mail.');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      <Heading title="Crie sua conta" subtitle="Sua mesa começa aqui." />
      <GoogleButton next={next} />
      <Divider />
      {info ? (
        <Alert tone="success" title="Quase lá">
          {info}
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Nome de exibição" htmlFor="name" error={errors.name}>
            <Input
              id="name"
              name="name"
              autoComplete="nickname"
              maxLength={60}
              aria-invalid={!!errors.name}
            />
          </Field>
          <Field label="E-mail" htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" autoComplete="email" aria-invalid={!!errors.email} />
          </Field>
          <Field label="Senha" htmlFor="password" error={errors.password} hint="Pelo menos 8 caracteres.">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
            />
          </Field>
          <Field label="Confirmar senha" htmlFor="confirm" error={errors.confirm}>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
            />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={loading}>
            Criar conta
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-ink-muted">
        Já tem conta?{' '}
        <Link
          href={`/login${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-arcane-300 hover:text-arcane-200"
        >
          Entrar
        </Link>
      </p>
    </>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const email = String(new FormData(e.currentTarget).get('email')).trim();
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    setSent(true);
  }

  return (
    <>
      <Heading title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha." />
      {sent ? (
        <Alert tone="success" title="Verifique seu e-mail">
          Se existir uma conta com esse e-mail, você receberá um link em instantes.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={loading}>
            Enviar link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-arcane-300 hover:text-arcane-200">
          Voltar ao login
        </Link>
      </p>
    </>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password'));
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== String(f.get('confirm'))) return setError('As senhas não conferem.');
    setLoading(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(authErrorMessage(error));
    router.replace('/dashboard');
  }

  return (
    <>
      <Heading title="Nova senha" subtitle="Escolha uma nova senha para sua conta." />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nova senha" htmlFor="password" hint="Pelo menos 8 caracteres.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirmar senha" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>
          Salvar nova senha
        </Button>
      </form>
    </>
  );
}
