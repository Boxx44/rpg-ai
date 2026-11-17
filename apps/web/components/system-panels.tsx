'use client';

import type { SystemDefinition } from '@rpg-ai/rules-engine';
import type { CampaignDto, DocumentDto, SystemDto, SystemTemplateDto } from '@rpg-ai/shared';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@rpg-ai/ui';
import { BookOpen, FileUp, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, json } from '@/lib/api';
import { env } from '@/lib/env';
import { accessToken } from '@/lib/supabase';

/** Escolher o sistema de regras da campanha (Gerenciar). */
export function CampaignSystemPanel({ campaign }: { campaign: CampaignDto }) {
  const router = useRouter();
  const [systems, setSystems] = useState<SystemDto[] | null>(null);
  const [templates, setTemplates] = useState<SystemTemplateDto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    (async () => {
      const t = await accessToken();
      const [s, tp] = await Promise.all([
        api<SystemDto[]>('/systems', t),
        api<SystemTemplateDto[]>('/system-templates', t),
      ]);
      setSystems(s.filter((x) => x.canEdit));
      setTemplates(tp);
    })().catch((e: Error) => setError(e.message));
  }, []);

  async function choose(systemId: string | null) {
    setBusy(systemId ?? 'none');
    setError(undefined);
    try {
      await api(`/campaigns/${campaign.id}/system`, await accessToken(), {
        method: 'POST',
        body: json({ systemId }),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setBusy(null);
    }
  }

  async function fromTemplate(templateId: string) {
    setBusy(templateId);
    setError(undefined);
    try {
      const t = await accessToken();
      const existing = systems?.find((s) => s.templateId === templateId);
      const sys =
        existing ?? (await api<SystemDto>('/systems', t, { method: 'POST', body: json({ templateId }) }));
      await api(`/campaigns/${campaign.id}/system`, t, { method: 'POST', body: json({ systemId: sys.id }) });
      router.refresh();
      router.push(`/systems/${sys.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sistema de regras</CardTitle>
        <CardDescription>
          Define a ficha dos personagens, como os testes são rolados e onde buscar regras durante o jogo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4" data-testid="system-panel">
        {campaign.system ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 p-3">
            <div>
              <p className="font-display tracking-wide text-gold-bright">{campaign.system.name}</p>
              <p className="text-xs text-ink-muted">Em uso nesta campanha</p>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/systems/${campaign.system.id}`}>
                  <BookOpen /> Livro e regras
                </Link>
              </Button>
              <Button size="sm" variant="ghost" loading={busy === 'none'} onClick={() => choose(null)}>
                Remover
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            Sem sistema: personagens usam a ficha livre e os dados são digitados à mão.
          </p>
        )}
        {!campaign.system && (
          <div className="space-y-2">
            {templates.map((t) => (
              <Button
                key={t.id}
                className="w-full justify-start"
                variant="secondary"
                loading={busy === t.id}
                onClick={() => fromTemplate(t.id)}
              >
                <BookOpen /> Usar {t.name}{' '}
                {t.edition && <span className="text-ink-faint">({t.edition})</span>}
              </Button>
            ))}
            {systems
              ?.filter((s) => !s.templateId)
              .map((s) => (
                <Button
                  key={s.id}
                  className="w-full justify-start"
                  variant="ghost"
                  loading={busy === s.id}
                  onClick={() => choose(s.id)}
                >
                  Usar {s.name}
                </Button>
              ))}
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </CardContent>
    </Card>
  );
}

function formatSize(b: number) {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

const STATUS: Record<DocumentDto['status'], string> = {
  queued: 'Na fila',
  processing: 'Lendo o livro…',
  ready: 'Pronto para busca',
  failed: 'Falhou',
};

/** Página do sistema: livro (PDF), processamento e resumo das regras. */
export function SystemBookManager({
  system: initial,
  definition,
}: {
  system: SystemDto;
  definition: SystemDefinition | null;
}) {
  const [system, setSystem] = useState(initial);
  const [upload, setUpload] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setSystem(await api<SystemDto>(`/systems/${initial.id}`, await accessToken()));
  }, [initial.id]);

  const pending = system.documents.some((d) => d.status === 'queued' || d.status === 'processing');
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => void refresh(), 1500);
    return () => clearInterval(id);
  }, [pending, refresh]);

  async function send(file: File) {
    setError(undefined);
    if (!file.name.toLowerCase().endsWith('.pdf')) return setError('Escolha um arquivo PDF.');
    const token = await accessToken();
    // XMLHttpRequest permite mostrar o progresso do envio (livros podem ter centenas de MB).
    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${env.apiUrl}/systems/${system.id}/documents`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && setUpload(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        if (xhr.status >= 400) {
          try {
            setError(JSON.parse(xhr.responseText).error.message);
          } catch {
            setError(`Erro ${xhr.status} ao enviar`);
          }
        }
        resolve();
      };
      xhr.onerror = () => {
        setError('Falha de conexão durante o envio.');
        resolve();
      };
      const fd = new FormData();
      fd.append('file', file);
      setUpload(0);
      xhr.send(fd);
    });
    setUpload(null);
    await refresh();
  }

  async function remove(d: DocumentDto) {
    if (!confirm(`Apagar "${d.filename}"? O texto sai da busca e o arquivo é removido.`)) return;
    await api(`/systems/${system.id}/documents/${d.id}`, await accessToken(), { method: 'DELETE' });
    await refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Livro de regras</CardTitle>
          <CardDescription>
            Envie o PDF do livro para consultar as regras durante o jogo. O arquivo fica privado: só você e os
            jogadores das suas campanhas com este sistema podem pesquisar nele.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {system.documents.map((d) => (
            <div
              key={d.id}
              className="space-y-2 rounded-lg border border-line bg-surface-2/50 p-3"
              data-testid="document-row"
              data-status={d.status}
            >
              <div className="flex items-center gap-3">
                <BookOpen className="size-5 shrink-0 text-gold" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{d.filename}</p>
                  <p className="text-xs text-ink-faint">
                    {formatSize(d.sizeBytes)}
                    {d.pageCount ? ` · ${d.pageCount} páginas` : ''}
                  </p>
                </div>
                <Badge tone={d.status === 'ready' ? 'arcane' : d.status === 'failed' ? 'danger' : 'gold'}>
                  {STATUS[d.status]}
                </Badge>
                {system.canEdit && (
                  <Button size="icon" variant="ghost" aria-label="Apagar livro" onClick={() => remove(d)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              {(d.status === 'processing' || d.status === 'queued') && (
                <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                  <div
                    className="h-full bg-gradient-to-r from-arcane-600 to-gold transition-all"
                    style={{ width: `${d.progress}%` }}
                  />
                </div>
              )}
              {d.status === 'failed' && d.error && <p className="text-xs text-blood-light">{d.error}</p>}
              {d.status === 'ready' && !!d.pagesWithoutText && (
                <p className="text-xs text-ink-faint">
                  {d.pagesWithoutText} páginas são só imagem (ilustrações ou digitalizadas) e não entram na
                  busca. Leitura de imagens (OCR) ainda não está disponível.
                </p>
              )}
            </div>
          ))}
          {system.canEdit && (
            <>
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                data-testid="book-input"
                onChange={(e) => e.target.files?.[0] && void send(e.target.files[0])}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => input.current?.click()}
                loading={upload !== null}
              >
                <FileUp />{' '}
                {upload !== null
                  ? `Enviando… ${upload}%`
                  : system.documents.length
                    ? 'Enviar outro PDF'
                    : 'Enviar o PDF do livro'}
              </Button>
              <p className="text-xs text-ink-faint">Até 300 MB. Envie apenas livros que você possui.</p>
            </>
          )}
          {error && <Alert tone="error">{error}</Alert>}
        </CardContent>
      </Card>

      {definition && (
        <Card>
          <CardHeader>
            <CardTitle>Regras carregadas</CardTitle>
            <CardDescription>{definition.source.note}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-ink-muted">
              {definition.attributes.length} atributos · {definition.skills.length} perícias ·{' '}
              {definition.fields.find((f) => f.key === 'origem')?.options?.length ?? 0} origens ·{' '}
              {definition.resources.map((r) => r.abbr).join(', ')} calculados automaticamente.
            </p>
            <QuickReference definition={definition} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function QuickReference({ definition }: { definition: SystemDefinition }) {
  return (
    <ul className="space-y-2">
      {definition.reference.map((r) => (
        <li key={r.title} className="rounded-lg border border-line bg-surface-2/40 p-3">
          <p className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gold/80">
            {r.title}
            {r.page && (
              <span className="font-normal normal-case tracking-normal text-ink-faint">PDF p. {r.page}</span>
            )}
          </p>
          <p className="text-sm text-ink">{r.text}</p>
        </li>
      ))}
    </ul>
  );
}
