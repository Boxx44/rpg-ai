'use client';

import {
  type CampaignDto,
  type CampaignMemberDto,
  type CampaignRole,
  type CreatedInvitationDto,
  createCampaignSchema,
  GM_MODE_LABELS,
  GM_MODES,
  type GmMode,
  type InvitableRole,
  type InvitationDto,
  ROLE_LABELS,
} from '@rpg-ai/shared';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Field,
  Input,
  Select,
  Textarea,
} from '@rpg-ai/ui';
import { Bot, Check, Copy, Crown, Sparkles, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, json } from '@/lib/api';
import { env } from '@/lib/env';
import { accessToken } from '@/lib/supabase';

const MODE_INFO: Record<GmMode, { icon: React.ReactNode; text: string; note?: string }> = {
  human: { icon: <UserRound />, text: 'Uma pessoa conduz a história. Ferramentas manuais.' },
  ai: {
    icon: <Bot />,
    text: 'A IA narra e conduz, dentro das regras aprovadas.',
    note: 'Disponível na Fase 6',
  },
  assistant: {
    icon: <Sparkles />,
    text: 'Mestre humano com sugestões da IA que só ele vê.',
    note: 'Disponível na Fase 6',
  },
};

/** Executa uma ação na API e devolve mensagem de erro amigável. */
function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  async function run<T>(
    key: string,
    fn: (token: string) => Promise<T>,
    opts: { refresh?: boolean } = { refresh: true },
  ) {
    setPending(key);
    setError(undefined);
    try {
      const r = await fn(await accessToken());
      if (opts.refresh) router.refresh();
      return r;
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Erro inesperado');
      return undefined;
    } finally {
      setPending(null);
    }
  }
  return { run, pending, error, router };
}

export function GmModePicker({ value, onChange }: { value: GmMode; onChange: (m: GmMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Modo de mestre" className="grid gap-3 sm:grid-cols-3">
      {GM_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={cn(
            'flex flex-col gap-2 rounded-lg border p-4 text-left transition-all',
            value === m
              ? 'border-gold/60 bg-gradient-to-b from-arcane-900/60 to-surface-2 shadow-[0_0_0_1px_rgba(201,162,75,0.2)]'
              : 'border-line bg-surface-2/50 hover:border-arcane-500/40',
          )}
        >
          <span className={cn('[&_svg]:size-5', value === m ? 'text-gold-bright' : 'text-arcane-300')}>
            {MODE_INFO[m].icon}
          </span>
          <span className="text-sm font-semibold text-ink">{GM_MODE_LABELS[m]}</span>
          <span className="text-xs leading-relaxed text-ink-muted">{MODE_INFO[m].text}</span>
          {MODE_INFO[m].note && <span className="text-[11px] text-gold/80">{MODE_INFO[m].note}</span>}
        </button>
      ))}
    </div>
  );
}

export function NewCampaignForm() {
  const { run, pending, error, router } = useAction();
  const [mode, setMode] = useState<GmMode>('human');
  const [fieldErr, setFieldErr] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = createCampaignSchema.safeParse({
      name: f.get('name'),
      description: f.get('description'),
      gmMode: mode,
    });
    if (!parsed.success) return setFieldErr('Dê um nome à campanha (até 100 caracteres).');
    setFieldErr(undefined);
    const c = await run(
      'create',
      (t) => api<CampaignDto>('/campaigns', t, { method: 'POST', body: json(parsed.data) }),
      { refresh: false },
    );
    if (c) router.push(`/campaigns/${c.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Field label="Nome da campanha" htmlFor="name" error={fieldErr}>
        <Input
          id="name"
          name="name"
          maxLength={100}
          placeholder="Ex.: As Cinzas de Valdrak"
          aria-invalid={!!fieldErr}
        />
      </Field>
      <Field label="Descrição" htmlFor="description" hint="Opcional. Até 2.000 caracteres.">
        <Textarea
          id="description"
          name="description"
          maxLength={2000}
          placeholder="Do que se trata essa história?"
        />
      </Field>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Modo de mestre</p>
        <GmModePicker value={mode} onChange={setMode} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending === 'create'}>
          Criar campanha
        </Button>
      </div>
    </form>
  );
}

// ───────────── Membros ─────────────
export function MembersPanel({
  campaignId,
  members,
  myRole,
  myId,
}: {
  campaignId: string;
  members: CampaignMemberDto[];
  myRole: CampaignRole;
  myId: string;
}) {
  const { run, pending, error } = useAction();
  const canEdit = (m: CampaignMemberDto) =>
    m.role !== 'owner' && m.userId !== myId && (myRole === 'owner' || (myRole === 'gm' && m.role !== 'gm'));
  const roleOptions: InvitableRole[] =
    myRole === 'owner' ? ['gm', 'player', 'spectator'] : ['player', 'spectator'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membros</CardTitle>
        <CardDescription>{members.length} na mesa</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-line/70" data-testid="members-list">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={m.displayName} src={m.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {m.displayName} {m.userId === myId && <span className="text-ink-faint">(você)</span>}
                </p>
                <p className="text-xs text-ink-faint">
                  desde {new Date(m.joinedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              {canEdit(m) ? (
                <div className="flex items-center gap-2">
                  <Select
                    aria-label={`Papel de ${m.displayName}`}
                    className="h-8 w-36 text-xs"
                    defaultValue={m.role}
                    disabled={pending !== null}
                    onChange={(e) =>
                      run(`role-${m.userId}`, (t) =>
                        api(`/campaigns/${campaignId}/members/${m.userId}`, t, {
                          method: 'PATCH',
                          body: json({ role: e.target.value }),
                        }),
                      )
                    }
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending === `rm-${m.userId}`}
                    onClick={() => {
                      if (confirm(`Remover ${m.displayName} da campanha?`))
                        run(`rm-${m.userId}`, (t) =>
                          api(`/campaigns/${campaignId}/members/${m.userId}`, t, { method: 'DELETE' }),
                        );
                    }}
                  >
                    Remover
                  </Button>
                </div>
              ) : (
                <Badge tone={m.role === 'owner' || m.role === 'gm' ? 'gold' : 'neutral'}>
                  {m.role === 'owner' && <Crown className="size-3" />}
                  {ROLE_LABELS[m.role]}
                </Badge>
              )}
            </li>
          ))}
        </ul>
        {error && (
          <Alert tone="error" className="mt-3">
            {error}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────── Convites ─────────────
export function InvitationsPanel({
  campaignId,
  invitations,
  myRole,
}: {
  campaignId: string;
  invitations: InvitationDto[];
  myRole: CampaignRole;
}) {
  const { run, pending, error } = useAction();
  const [created, setCreated] = useState<CreatedInvitationDto>();
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState<InvitableRole>('player');
  const [email, setEmail] = useState('');
  const pendingInvites = invitations.filter(
    (i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date(),
  );
  const link = created ? `${env.siteUrl}/invite/${created.token}` : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Convidar jogadores</CardTitle>
        <CardDescription>
          Gere um link e envie para quem você quer na mesa. Cada link vale para uma pessoa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
          aria-describedby="invite-hint"
          onSubmit={async (e) => {
            e.preventDefault();
            setCopied(false);
            const r = await run('invite', (t) =>
              api<CreatedInvitationDto>(`/campaigns/${campaignId}/invitations`, t, {
                method: 'POST',
                body: json({ role, ...(email.trim() ? { email: email.trim() } : {}) }),
              }),
            );
            if (r) {
              setCreated(r);
              setEmail('');
            }
          }}
        >
          <Field label="E-mail (opcional)" htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jogador@email.com"
            />
          </Field>
          <Field label="Papel" htmlFor="invite-role">
            <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
              {(myRole === 'owner'
                ? (['player', 'spectator', 'gm'] as const)
                : (['player', 'spectator'] as const)
              ).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={pending === 'invite'}>
            Gerar link
          </Button>
          <p id="invite-hint" className="text-xs text-ink-faint sm:col-span-3">
            Se você informar um e-mail, só essa pessoa poderá aceitar o convite.
          </p>
        </form>

        {created && (
          <Alert tone="success" title="Link de convite criado">
            <p className="mb-2">Copie e envie para o jogador. Por segurança, ele só é exibido agora.</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={link}
                data-testid="invite-link"
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(link).catch(() => undefined);
                  setCopied(true);
                }}
              >
                {copied ? <Check /> : <Copy />} {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <p className="mt-2 text-xs opacity-80">
              O envio automático por e-mail ainda não está configurado.
            </p>
          </Alert>
        )}

        {pendingInvites.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Convites pendentes
            </p>
            <ul className="divide-y divide-line/70 rounded-lg border border-line">
              {pendingInvites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <Badge>{ROLE_LABELS[i.role]}</Badge>
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    {i.email ?? 'Qualquer pessoa com o link'}
                  </span>
                  <span className="text-xs text-ink-faint">
                    expira {new Date(i.expiresAt).toLocaleDateString('pt-BR')}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending === `revoke-${i.id}`}
                    onClick={() =>
                      run(`revoke-${i.id}`, (t) =>
                        api(`/campaigns/${campaignId}/invitations/${i.id}`, t, { method: 'DELETE' }),
                      )
                    }
                  >
                    Cancelar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </CardContent>
    </Card>
  );
}

// ───────────── Configurações ─────────────
export function SettingsPanel({ campaign }: { campaign: CampaignDto }) {
  const { run, pending, error, router } = useAction();
  const [mode, setMode] = useState<GmMode>(campaign.gmMode);
  const [saved, setSaved] = useState(false);
  const isOwner = campaign.myRole === 'owner';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaved(false);
            const f = new FormData(e.currentTarget);
            const r = await run('save', (t) =>
              api(`/campaigns/${campaign.id}`, t, {
                method: 'PATCH',
                body: json({
                  name: String(f.get('name')),
                  description: String(f.get('description')),
                  gmMode: mode,
                }),
              }),
            );
            if (r) setSaved(true);
          }}
        >
          <Field label="Nome" htmlFor="s-name">
            <Input id="s-name" name="name" defaultValue={campaign.name} maxLength={100} required />
          </Field>
          <Field label="Descrição" htmlFor="s-desc">
            <Textarea id="s-desc" name="description" defaultValue={campaign.description} maxLength={2000} />
          </Field>
          <GmModePicker value={mode} onChange={setMode} />
          {saved && <Alert tone="success">Alterações salvas.</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex flex-wrap justify-between gap-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                loading={pending === 'archive'}
                onClick={() =>
                  run('archive', (t) =>
                    api(`/campaigns/${campaign.id}`, t, {
                      method: 'PATCH',
                      body: json({ status: campaign.status === 'active' ? 'archived' : 'active' }),
                    }),
                  )
                }
              >
                {campaign.status === 'active' ? 'Arquivar' : 'Reativar'}
              </Button>
              {isOwner && (
                <Button
                  type="button"
                  variant="danger"
                  loading={pending === 'delete'}
                  onClick={async () => {
                    if (!confirm(`Excluir "${campaign.name}"? Os membros perderão o acesso.`)) return;
                    const ok = await run(
                      'delete',
                      (t) => api(`/campaigns/${campaign.id}`, t, { method: 'DELETE' }).then(() => true),
                      {
                        refresh: false,
                      },
                    );
                    if (ok) {
                      router.replace('/dashboard');
                      router.refresh();
                    }
                  }}
                >
                  Excluir
                </Button>
              )}
            </div>
            <Button type="submit" loading={pending === 'save'}>
              Salvar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function LeaveCampaignButton({ campaignId, myId }: { campaignId: string; myId: string }) {
  const { run, pending, error, router } = useAction();
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        loading={pending === 'leave'}
        onClick={async () => {
          if (!confirm('Sair desta campanha?')) return;
          const ok = await run(
            'leave',
            (t) => api(`/campaigns/${campaignId}/members/${myId}`, t, { method: 'DELETE' }).then(() => true),
            {
              refresh: false,
            },
          );
          if (ok) {
            router.replace('/dashboard');
            router.refresh();
          }
        }}
      >
        Sair da campanha
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

export function AcceptInvitation({ token }: { token: string }) {
  const { run, pending, error, router } = useAction();
  return (
    <div className="space-y-4">
      <Button
        size="lg"
        className="w-full"
        loading={pending === 'accept'}
        onClick={async () => {
          const r = await run(
            'accept',
            (t) =>
              api<{ campaignId: string }>(`/invitations/${encodeURIComponent(token)}/accept`, t, {
                method: 'POST',
              }),
            { refresh: false },
          );
          if (r) {
            router.replace(`/campaigns/${r.campaignId}`);
            router.refresh();
          }
        }}
      >
        Aceitar convite
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
