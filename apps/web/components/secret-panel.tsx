'use client';

import type { TokenDto } from '@rpg-ai/shared';
import { Button } from '@rpg-ai/ui';
import { Search } from 'lucide-react';
import { useState } from 'react';
import type { SkillOption } from '@/lib/skills';

/**
 * Transformar uma peça oculta num segredo: qual perícia encontra, a dificuldade (DT)
 * e a que distância o personagem precisa estar. Mostra quem já descobriu.
 */
export function SecretPanel({
  token,
  skills,
  onSave,
}: {
  token: TokenDto;
  skills: SkillOption[];
  onSave: (patch: {
    hidden?: boolean;
    secretSkill: string | null;
    secretDt: number | null;
    secretRadius: number;
  }) => Promise<void>;
}) {
  const [skill, setSkill] = useState(token.secret?.skill ?? skills[0]?.key ?? 'percepcao');
  const [dt, setDt] = useState(token.secret?.dt ?? 15);
  const [radius, setRadius] = useState(token.secret?.radius ?? 2);
  const [busy, setBusy] = useState(false);
  const active = !!token.secret;
  const save = async (on: boolean) => {
    setBusy(true);
    try {
      await onSave(
        on
          ? { hidden: true, secretSkill: skill, secretDt: dt, secretRadius: radius }
          : { secretSkill: null, secretDt: null, secretRadius: radius },
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset
      className="space-y-2 rounded-lg border border-arcane-500/40 bg-arcane-700/10 p-3"
      data-testid="secret-panel"
    >
      <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-arcane-300">
        <Search className="size-3.5" /> Segredo
      </legend>
      <p className="text-xs text-ink-muted">
        Fica escondido até um jogador usar <b>Procurar ao redor</b> perto daqui e passar no teste. Só quem
        passar vê.
      </p>
      <label className="block text-xs text-ink-faint">
        Perícia que encontra
        <select
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-line bg-surface-2 px-2 text-sm text-ink"
          aria-label="Perícia que encontra"
        >
          {skills.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-ink-faint">
          Dificuldade (DT)
          <input
            type="number"
            min={1}
            max={60}
            value={dt}
            onChange={(e) => setDt(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            className="mt-1 h-9 w-full rounded-md border border-line bg-surface-2 px-2 text-sm text-ink"
            aria-label="Dificuldade (DT)"
          />
        </label>
        <label className="block text-xs text-ink-faint">
          Alcance (casas)
          <input
            type="number"
            min={0}
            max={20}
            value={radius}
            onChange={(e) => setRadius(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
            className="mt-1 h-9 w-full rounded-md border border-line bg-surface-2 px-2 text-sm text-ink"
            aria-label="Alcance (casas)"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => save(true)} disabled={busy} data-testid="secret-save">
          {active ? 'Atualizar segredo' : 'Tornar segredo'}
        </Button>
        {active && (
          <Button size="sm" variant="ghost" onClick={() => save(false)} disabled={busy}>
            Deixar de ser segredo
          </Button>
        )}
      </div>
      {active && (
        <p className="text-xs" data-testid="secret-found-by">
          {token.foundBy?.length ? (
            <span className="text-gold-bright">Descoberto por: {token.foundBy.join(', ')}</span>
          ) : (
            <span className="text-ink-faint">Ninguém descobriu ainda.</span>
          )}
        </p>
      )}
    </fieldset>
  );
}
