'use client';

import type { SystemDefinition } from '@rpg-ai/rules-engine';
import type { CampaignSystemDto, CombatantDto, EncounterDto, NpcDto } from '@rpg-ai/shared';
import { Alert, Badge, Button, cn, Input, Select } from '@rpg-ai/ui';
import { Dices, Eye, EyeOff, Heart, Plus, Skull, Swords, X } from 'lucide-react';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import { accessToken } from '@/lib/supabase';

type Setter = (e: EncounterDto | null) => void;

/** Chamada à API do combate; a resposta já é o combate atualizado e filtrado para este usuário. */
function useCombatApi(campaignId: string, onChange: Setter) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function call(path: string, init?: RequestInit) {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<EncounterDto | null>(
        `/campaigns/${campaignId}/combat${path}`,
        await accessToken(),
        init,
      );
      onChange(r);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { call, busy, error };
}

const HEALTH: Record<CombatantDto['health'], { label: string; cls: string }> = {
  ok: { label: 'Ileso', cls: 'text-emerald-300' },
  hurt: { label: 'Machucado', cls: 'text-amber-300' },
  down: { label: 'Caído', cls: 'text-blood-light' },
};

/** Faixa sobre o mapa: de quem é a vez, e o botão para passar o próprio turno. */
export function CombatBanner({
  campaignId,
  combat,
  manager,
  onChange,
}: {
  campaignId: string;
  combat: EncounterDto;
  manager: boolean;
  onChange: Setter;
}) {
  const { call, busy, error } = useCombatApi(campaignId, onChange);
  const cur = combat.combatants.find((c) => c.id === combat.currentId);
  const canPass = !!combat.currentId && (manager || cur?.mine);
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/30 bg-surface/80 px-4 py-2.5"
      data-testid="combat-banner"
    >
      <Swords className="size-4 text-gold" />
      <p className="text-sm">
        <span className="font-display tracking-wide text-gold-bright">Combate · Rodada {combat.round}</span>
        <span className="mx-2 text-ink-faint">|</span>
        {cur ? (
          <span data-testid="turn-of">
            Vez de <b style={{ color: cur.color }}>{cur.name}</b>
            {cur.mine && !manager && <span className="ml-1 text-gold-bright">(sua vez!)</span>}
          </span>
        ) : combat.hiddenTurn ? (
          <span className="text-ink-muted">Vez do mestre…</span>
        ) : (
          <span className="text-ink-muted">Rolando Iniciativa…</span>
        )}
      </p>
      {canPass && (
        <Button
          size="sm"
          className="ml-auto"
          loading={busy}
          onClick={() => call('/next', { method: 'POST', body: json({ expected: combat.currentId }) })}
        >
          {manager ? 'Próximo turno' : 'Encerrar meu turno'}
        </Button>
      )}
      {error && (
        <Alert tone="error" className="w-full">
          {error}
        </Alert>
      )}
    </div>
  );
}

function CombatantRow({
  c,
  current,
  manager,
  conditions,
  call,
  busy,
  campaignId,
  onOpenPage,
}: {
  c: CombatantDto;
  current: boolean;
  manager: boolean;
  conditions: SystemDefinition['conditions'];
  call: (path: string, init?: RequestInit) => Promise<boolean>;
  busy: boolean;
  campaignId: string;
  onOpenPage?: (n: number) => void;
}) {
  const [atkBusy, setAtkBusy] = useState<number | null>(null);
  const [atkNote, setAtkNote] = useState<string>();
  async function npcAction(kind: 'attack' | 'cast', body: object, i: number) {
    setAtkBusy(i);
    setAtkNote(undefined);
    try {
      const r = await api<{ critical?: boolean; notes: string[] }>(
        `/campaigns/${campaignId}/npcs/${c.npcId}/${kind}`,
        await accessToken(),
        { method: 'POST', body: json(body) },
      );
      setAtkNote([r.critical ? 'Crítico!' : '', ...r.notes].filter(Boolean).join(' ') || undefined);
    } catch (e) {
      setAtkNote(e instanceof Error ? e.message : 'Erro');
    } finally {
      setAtkBusy(null);
    }
  }

  async function creatureAttack(i: number) {
    setAtkBusy(i);
    setAtkNote(undefined);
    try {
      const r = await api<{ critical: boolean; notes: string[] }>(
        `/campaigns/${campaignId}/combat/combatants/${c.id}/attack`,
        await accessToken(),
        { method: 'POST', body: json({ attack: i }) },
      );
      setAtkNote([r.critical ? 'Crítico!' : '', ...r.notes].filter(Boolean).join(' ') || undefined);
    } catch (e) {
      setAtkNote(e instanceof Error ? e.message : 'Erro');
    } finally {
      setAtkBusy(null);
    }
  }
  const [amount, setAmount] = useState('');
  const [ini, setIni] = useState('');
  const base = `/combatants/${c.id}`;
  const patch = (body: object) => call(base, { method: 'PATCH', body: json(body) });
  const hpChange = async (sign: 1 | -1) => {
    const n = Math.abs(Number.parseInt(amount, 10));
    if (!n) return;
    if (await call(`${base}/hp`, { method: 'POST', body: json({ delta: sign * n }) })) setAmount('');
  };
  const cond = (k: string) => conditions.find((x) => x.key === k);
  const pct = c.hp && c.hp.max > 0 ? Math.max(0, Math.min(100, (c.hp.current / c.hp.max) * 100)) : null;
  return (
    <li
      data-testid="combatant"
      data-name={c.name}
      className={cn(
        'space-y-2 rounded-lg border px-3 py-2.5 transition-colors',
        current
          ? 'border-gold/70 bg-gold/10 shadow-[0_0_24px_-12px_rgba(212,175,55,0.8)]'
          : 'border-line bg-bg/40',
        c.defeated && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className="grid w-10 shrink-0 place-items-center rounded-md border border-line bg-surface py-1 font-display text-lg"
          title="Iniciativa"
          data-testid="initiative"
        >
          {c.initiative ?? '—'}
        </div>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
        <p className="min-w-0 flex-1 truncate font-medium">
          {c.name}
          {c.hidden && <span className="ml-2 text-xs text-ink-faint">(oculto)</span>}
        </p>
        <span className={cn('text-xs', HEALTH[c.health].cls)} data-testid="health">
          {c.hp ? `${c.hp.current}/${c.hp.max} PV` : HEALTH[c.health].label}
        </span>
        {c.mine && c.initiative === null && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => call(`${base}/initiative`, { method: 'POST', body: json({}) })}
          >
            <Dices /> Iniciativa
          </Button>
        )}
      </div>
      {manager && c.npcSheet && c.npcId && (
        <div
          className="space-y-1 rounded-md border border-line/70 bg-surface/60 px-2 py-1.5 text-xs"
          data-testid="npc-actions"
        >
          <div className="flex flex-wrap gap-1">
            {c.npcSheet.weapons.map((w, i) => (
              <Button
                key={`${w.name}-${i}`}
                size="sm"
                variant="secondary"
                disabled={atkBusy !== null}
                loading={atkBusy === i}
                onClick={() => npcAction('attack', { weapon: i }, i)}
                aria-label={`${c.name} ataca com ${w.name}`}
              >
                <Swords /> {w.name} · {w.damage}
              </Button>
            ))}
            {c.npcSheet.rituals.map((r, i) => (
              <Button
                key={r.key}
                size="sm"
                variant="secondary"
                disabled={atkBusy !== null}
                loading={atkBusy === 100 + i}
                onClick={() => npcAction('cast', { ritual: r.key }, 100 + i)}
                aria-label={`${c.name} conjura ${r.name}`}
              >
                ✶ {r.name}
              </Button>
            ))}
          </div>
          {atkNote && <p className="text-gold-bright">{atkNote}</p>}
        </div>
      )}
      {manager && c.creature && (
        <div
          className="space-y-1 rounded-md border border-line/70 bg-surface/60 px-2 py-1.5 text-xs"
          data-testid="creature-info"
        >
          <p className="flex flex-wrap items-center gap-x-3 text-ink-muted">
            {c.creature.defesa !== null && <span>Defesa {c.creature.defesa}</span>}
            {c.creature.vd !== null && <span>VD {c.creature.vd}</span>}
            {c.creature.page && (
              <button
                type="button"
                className="text-arcane-300 hover:text-arcane-200"
                onClick={() => onOpenPage?.(c.creature!.page!)}
              >
                ficha completa: p. {c.creature.page}
              </button>
            )}
          </p>
          <div className="flex flex-wrap gap-1">
            {c.creature.attacks.map((a, i) => (
              <Button
                key={a.name}
                size="sm"
                variant="secondary"
                loading={atkBusy === i}
                disabled={atkBusy !== null}
                onClick={() => creatureAttack(i)}
                aria-label={`${c.name} ataca com ${a.name}`}
              >
                <Swords /> {a.name}
                {a.times > 1 ? ` x${a.times}` : ''} · {a.damage}
              </Button>
            ))}
          </div>
          {atkNote && <p className="text-gold-bright">{atkNote}</p>}
        </div>
      )}
      {pct !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className={cn(
              'h-full rounded-full',
              pct > 50 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-blood',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {c.conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.conditions.map((k) => {
            const d = cond(k);
            return (
              <span
                key={k}
                title={d ? `${d.summary}${d.page ? ` (p. ${d.page})` : ''}` : k}
                className="inline-flex items-center gap-1 rounded-full border border-arcane-500/40 bg-arcane-700/30 px-2 py-0.5 text-xs"
                data-testid="condition"
              >
                {d?.label ?? k}
                {manager && (
                  <button
                    type="button"
                    aria-label={`Remover ${d?.label ?? k}`}
                    onClick={() => patch({ conditions: c.conditions.filter((x) => x !== k) })}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
      {(c.mine && c.hp) || manager ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {(c.hp || manager) && (
            <>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="PV"
                aria-label={`Quantidade de PV para ${c.name}`}
                className="h-8 w-16 text-center"
              />
              <Button
                size="sm"
                variant="danger"
                disabled={busy || !amount}
                onClick={() => hpChange(-1)}
                aria-label={`Dano em ${c.name}`}
              >
                <Skull /> Dano
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !amount}
                onClick={() => hpChange(1)}
                aria-label={`Cura em ${c.name}`}
              >
                <Heart /> Cura
              </Button>
            </>
          )}
          {manager && (
            <>
              <Input
                value={ini}
                onChange={(e) => setIni(e.target.value.replace(/[^0-9-]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ini !== '') {
                    void patch({ initiative: Number.parseInt(ini, 10) }).then((ok) => ok && setIni(''));
                  }
                }}
                placeholder="Inic."
                aria-label={`Definir Iniciativa de ${c.name}`}
                className="h-8 w-16 text-center"
              />
              {conditions.length > 0 && (
                <Select
                  aria-label={`Adicionar condição a ${c.name}`}
                  value=""
                  className="h-8 w-36"
                  onChange={(e) => e.target.value && patch({ conditions: [...c.conditions, e.target.value] })}
                >
                  <option value="">+ Condição</option>
                  {conditions
                    .filter((x) => !c.conditions.includes(x.key))
                    .map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                </Select>
              )}
              <div className="ml-auto flex gap-0.5">
                {c.kind !== 'character' && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={c.hidden ? `Revelar ${c.name}` : `Ocultar ${c.name}`}
                    onClick={() => patch({ hidden: !c.hidden })}
                  >
                    {c.hidden ? <EyeOff /> : <Eye />}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={c.defeated ? `Trazer ${c.name} de volta` : `Marcar ${c.name} como derrotado`}
                  onClick={() => patch({ defeated: !c.defeated })}
                >
                  <Skull />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Tirar ${c.name} do combate`}
                  onClick={() => call(base, { method: 'DELETE' })}
                >
                  <X />
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function AddCombatant({
  npcs,
  call,
  busy,
  creatures,
}: {
  npcs: NpcDto[];
  call: (p: string, i?: RequestInit) => Promise<boolean>;
  busy: boolean;
  creatures: SystemDefinition['creatures'];
}) {
  const [kind, setKind] = useState<'enemy' | 'npc' | 'creature'>('enemy');
  const [name, setName] = useState('');
  const [npcId, setNpcId] = useState('');
  const [creatureKey, setCreatureKey] = useState('');
  const [hp, setHp] = useState('');
  const [count, setCount] = useState('1');
  const [hidden, setHidden] = useState(false);
  return (
    <form
      className="space-y-2 rounded-lg border border-dashed border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const body =
          kind === 'creature'
            ? { kind, creatureKey, count: Number(count) || 1, hidden }
            : kind === 'enemy'
              ? { kind, name, hp: Number(hp) || 0, count: Number(count) || 1, hidden }
              : { kind, npcId, hp: Number(hp) || 0, hidden };
        if (await call('/combatants', { method: 'POST', body: json(body) })) {
          setName('');
          setHp('');
          setCount('1');
        }
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">Adicionar ao combate</p>
      <div className="flex flex-wrap gap-2">
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as 'enemy' | 'npc' | 'creature')}
          aria-label="Tipo de combatente"
          className="h-9 w-40"
        >
          <option value="enemy">Inimigo</option>
          {creatures.length > 0 && <option value="creature">Criatura do livro</option>}
          {npcs.length > 0 && <option value="npc">NPC</option>}
        </Select>
        {kind === 'creature' ? (
          <Select
            value={creatureKey}
            onChange={(e) => setCreatureKey(e.target.value)}
            aria-label="Criatura"
            className="h-9 min-w-0 flex-1"
            required
          >
            <option value="">Escolha a criatura</option>
            {(['sangue', 'morte', 'conhecimento', 'energia', 'medo', null] as const).map((el) => {
              const list = creatures.filter((c) => c.element === el);
              return list.length ? (
                <optgroup
                  key={el ?? 'realidade'}
                  label={el ? el[0]!.toUpperCase() + el.slice(1) : 'Ameaças da realidade'}
                >
                  {list.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} — VD {c.vd ?? '?'}, {c.pv} PV
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </Select>
        ) : kind === 'enemy' ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex.: Zumbi)"
            aria-label="Nome do inimigo"
            className="h-9 min-w-0 flex-1"
            maxLength={76}
            required
          />
        ) : (
          <Select
            value={npcId}
            onChange={(e) => setNpcId(e.target.value)}
            aria-label="NPC"
            className="h-9 min-w-0 flex-1"
            required
          >
            <option value="">Escolha o NPC</option>
            {npcs.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {kind !== 'creature' && (
          <Input
            value={hp}
            onChange={(e) => setHp(e.target.value.replace(/\D/g, ''))}
            placeholder="PV"
            aria-label="PV do combatente"
            inputMode="numeric"
            className="h-9 w-20"
          />
        )}
        {kind !== 'npc' && (
          <Input
            value={count}
            onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))}
            aria-label="Quantos inimigos"
            inputMode="numeric"
            className="h-9 w-16"
            title="Quantos inimigos iguais"
          />
        )}
        <label className="flex items-center gap-1.5 text-sm text-ink-muted">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Oculto dos
          jogadores
        </label>
        <Button type="submit" size="sm" className="ml-auto" loading={busy}>
          <Plus /> Adicionar
        </Button>
      </div>
    </form>
  );
}

/** Aba "Combate" da mesa: iniciativa, turnos, PV e condições. */
export function CombatPanel({
  campaignId,
  combat,
  manager,
  system,
  npcs,
  onChange,
  onOpenPage,
}: {
  campaignId: string;
  combat: EncounterDto | null;
  manager: boolean;
  system: CampaignSystemDto | null;
  npcs: NpcDto[];
  onChange: Setter;
  onOpenPage?: (n: number) => void;
}) {
  const { call, busy, error } = useCombatApi(campaignId, onChange);
  const def = system?.definition as SystemDefinition | undefined;
  const conditions = def?.conditions ?? [];
  const [ending, setEnding] = useState(false);

  if (!combat)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Swords className="size-10 text-gold/60" />
        <p className="text-sm text-ink-muted">
          {manager
            ? 'Quando a briga começar, inicie o combate: os personagens entram e cada um rola a Iniciativa.'
            : 'Nenhum combate em andamento.'}
        </p>
        {manager && (
          <Button
            loading={busy}
            onClick={() => call('', { method: 'POST', body: json({ includeCharacters: true }) })}
          >
            <Swords /> Iniciar combate
          </Button>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    );

  const pending = combat.combatants.filter((c) => c.initiative === null && !c.defeated).length;
  return (
    <div className="flex h-full max-h-[70vh] flex-col xl:max-h-none" data-testid="combat-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <p className="font-display tracking-wide">Rodada {combat.round}</p>
        {pending > 0 && <Badge>{pending} sem Iniciativa</Badge>}
        {manager && (
          <div className="ml-auto flex gap-2">
            {!combat.currentId && !combat.hiddenTurn && (
              <Button
                size="sm"
                loading={busy}
                onClick={() => call('/next', { method: 'POST', body: json({ expected: null }) })}
              >
                Começar
              </Button>
            )}
            {ending ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEnding(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy}
                  onClick={() => call('/end', { method: 'POST' })}
                >
                  Confirmar fim
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEnding(true)}>
                Encerrar combate
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <ol className="space-y-2">
          {combat.combatants.map((c) => (
            <CombatantRow
              key={c.id}
              c={c}
              current={c.id === combat.currentId}
              manager={manager}
              conditions={conditions}
              call={call}
              busy={busy}
              campaignId={campaignId}
              onOpenPage={onOpenPage}
            />
          ))}
        </ol>
        {manager && <AddCombatant npcs={npcs} call={call} busy={busy} creatures={def?.creatures ?? []} />}
        {def?.initiative?.page && (
          <p className="text-xs text-ink-faint">
            Iniciativa: teste da perícia, rolado no servidor (livro, p. {def.initiative.page}). A ordem vale
            para todo o combate.
          </p>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </div>
  );
}
