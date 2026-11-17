'use client';

import type { ChatMessageDto, NpcDto, RollPartDto, Visibility } from '@rpg-ai/shared';
import { Alert, Button, cn, GameIcon, Input, Select } from '@rpg-ai/ui';
import { Dices, EyeOff, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

function RollView({ parts }: { parts: RollPartDto[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {(i > 0 || p.sign === -1) && <span className="text-ink-faint">{p.sign === -1 ? '−' : '+'}</span>}
          {p.type === 'number' ? (
            <span className="text-ink-muted">{p.value}</span>
          ) : (
            <span className="flex flex-wrap gap-0.5" title={p.notation}>
              {p.dice.map((d, j) => (
                <span
                  key={j}
                  className={cn(
                    'inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 text-xs tabular-nums',
                    !d.kept && 'border-line text-ink-faint line-through opacity-60',
                    d.kept && d.max && 'border-gold/70 bg-gold/15 text-gold-bright',
                    d.kept && d.min && !d.max && 'border-blood/60 bg-blood/15 text-blood-light',
                    d.kept && !d.max && !d.min && 'border-line bg-surface-3 text-ink',
                    d.exploded && 'ring-1 ring-arcane-400/60',
                  )}
                >
                  {d.value}
                </span>
              ))}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

function Message({ m, myId }: { m: ChatMessageDto; myId: string }) {
  const time = new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const who = m.npc ? m.npc.name : m.author.displayName;
  return (
    <li className="animate-rise space-y-1 px-3 py-2" data-testid="chat-message" data-kind={m.kind}>
      <div className="flex items-baseline gap-2 text-xs">
        <span
          className={cn('font-semibold', m.npc ? 'font-display tracking-wide' : 'text-arcane-200')}
          style={m.npc ? { color: m.npc.color } : undefined}
        >
          {who}
        </span>
        {m.npc && <span className="text-ink-faint">({m.author.displayName})</span>}
        {m.visibility === 'gm' && (
          <span className="inline-flex items-center gap-1 text-gold/80" title="Visível apenas ao mestre">
            <EyeOff className="size-3" /> secreto
          </span>
        )}
        <span className="ml-auto text-ink-faint">{time}</span>
      </div>
      {m.roll ? (
        <div
          className={cn(
            'rounded-lg border px-3 py-2',
            m.author.id === myId ? 'border-arcane-500/30 bg-arcane-900/20' : 'border-line bg-surface-2/60',
          )}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5 truncate">
              <GameIcon name="d20" size={14} />
              {m.roll.label ? <b className="text-ink">{m.roll.label}</b> : 'Rolagem'} · {m.roll.expression}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <RollView parts={m.roll.parts} />
            <span className="font-display text-2xl text-gold-bright" data-testid="roll-total">
              {m.roll.total}
            </span>
          </div>
        </div>
      ) : (
        <p className={cn('whitespace-pre-wrap break-words text-sm', m.npc ? 'italic text-ink' : 'text-ink')}>
          {m.content}
        </p>
      )}
    </li>
  );
}

export function ChatPanel({
  campaignId,
  messages,
  myId,
  canPlay,
  isManager,
  npcs,
  onSent,
}: {
  campaignId: string;
  messages: ChatMessageDto[];
  myId: string;
  canPlay: boolean;
  isManager: boolean;
  npcs: NpcDto[];
  onSent: (m: ChatMessageDto) => void;
}) {
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [speaker, setSpeaker] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(kind: 'text' | 'roll', value: string) {
    if (!value.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const token = await accessToken();
      const m =
        kind === 'roll'
          ? await api<ChatMessageDto>(`/campaigns/${campaignId}/rolls`, token, {
              method: 'POST',
              body: json({ expression: value, label: label.trim(), visibility }),
            })
          : await api<ChatMessageDto>(`/campaigns/${campaignId}/messages`, token, {
              method: 'POST',
              body: json({ content: value, visibility, ...(speaker ? { npcId: speaker } : {}) }),
            });
      onSent(m);
      if (kind === 'text' || value === text) setText('');
      setLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    const cmd = /^\/(r|roll|rolar)\s+(.+)$/i.exec(v);
    if (cmd) return send('roll', cmd[2]!);
    if (/^\d*d(\d+|%|f)/i.test(v) && !/\s/.test(v)) return send('roll', v);
    return send('text', v);
  }

  return (
    <section
      className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border border-line bg-surface/80"
      aria-label="Chat e dados"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display tracking-wide">Crônica</h2>
        <span className="text-xs text-ink-faint">{messages.length} mensagens</span>
      </header>
      <ul ref={listRef} className="flex-1 divide-y divide-line/40 overflow-y-auto" data-testid="chat-list">
        {messages.length === 0 && (
          <li className="p-6 text-center text-sm text-ink-faint">
            A história ainda não começou. Role um dado ou diga algo.
          </li>
        )}
        {messages.map((m) => (
          <Message key={m.id} m={m} myId={myId} />
        ))}
      </ul>
      {canPlay ? (
        <div className="space-y-2 border-t border-line p-3">
          <div className="flex flex-wrap gap-1">
            {QUICK_DICE.map((d) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => send('roll', `1${d}`)}
                className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink-muted transition-colors hover:border-gold/50 hover:text-gold-bright disabled:opacity-50"
              >
                {d}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Mensagem ou rolagem (ex.: 2d6+3)"
                aria-label="Mensagem ou rolagem"
                maxLength={2000}
                data-testid="chat-input"
              />
              <Button type="submit" size="icon" className="shrink-0" loading={busy} aria-label="Enviar">
                {!busy && <Send />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={busy || !text.trim()}
                onClick={() => send('roll', text.replace(/^\/(r|roll|rolar)\s+/i, ''))}
                aria-label="Rolar"
                title="Rolar a expressão"
              >
                <Dices />
              </Button>
            </div>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Rótulo da rolagem (opcional, ex.: Ataque)"
              aria-label="Rótulo da rolagem"
              maxLength={80}
              className="h-8 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as Visibility)}
                aria-label="Quem vê"
                className="h-8 text-xs"
              >
                <option value="public">Todos veem</option>
                <option value="gm">Só o mestre</option>
              </Select>
              {isManager && (
                <Select
                  value={speaker}
                  onChange={(e) => setSpeaker(e.target.value)}
                  aria-label="Falar como"
                  className="h-8 text-xs"
                >
                  <option value="">Falar como: você</option>
                  {npcs.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </form>
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      ) : (
        <p className="border-t border-line p-3 text-center text-xs text-ink-faint">
          Espectadores acompanham a mesa sem interagir.
        </p>
      )}
    </section>
  );
}
