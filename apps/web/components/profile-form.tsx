'use client';

import type { MeDto } from '@rpg-ai/shared';
import { Alert, Button, Field, Input } from '@rpg-ai/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';

export function ProfileForm({ me }: { me: MeDto }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; msg: string }>();
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const displayName = String(new FormData(e.currentTarget).get('displayName')).trim();
        if (!displayName) return setStatus({ tone: 'error', msg: 'O nome não pode ficar vazio.' });
        setLoading(true);
        try {
          await api('/me', await accessToken(), { method: 'PATCH', body: json({ displayName }) });
          setStatus({ tone: 'success', msg: 'Perfil atualizado.' });
          router.refresh();
        } catch (err) {
          setStatus({ tone: 'error', msg: err instanceof Error ? err.message : 'Erro ao salvar.' });
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="Nome de exibição" htmlFor="displayName">
        <Input id="displayName" name="displayName" defaultValue={me.displayName} maxLength={60} />
      </Field>
      {status && <Alert tone={status.tone}>{status.msg}</Alert>}
      <Button type="submit" loading={loading}>
        Salvar
      </Button>
    </form>
  );
}
