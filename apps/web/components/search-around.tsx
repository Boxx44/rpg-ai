'use client';

import type { SearchResultDto } from '@rpg-ai/shared';
import { Button } from '@rpg-ai/ui';
import { Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import type { SkillOption } from '@/lib/skills';
import { accessToken } from '@/lib/supabase';

/**
 * "Procurar ao redor": o servidor rola a perícia escolhida do personagem (em segredo:
 * só você e o mestre veem a rolagem) e revela o que houver escondido por perto.
 */
export function SearchAround({
  campaignId,
  mapId,
  mine,
  skills,
  onResult,
  onError,
}: {
  campaignId: string;
  mapId: string;
  mine: { characterId: string; name: string }[];
  skills: SkillOption[];
  onResult: (r: SearchResultDto) => void;
  onError: (msg: string) => void;
}) {
  const [skill, setSkill] = useState(skills[0]?.key ?? 'percepcao');
  const [who, setWho] = useState(mine[0]?.characterId ?? '');
  const [busy, setBusy] = useState(false);
  const character = mine.find((m) => m.characterId === who) ?? mine[0];
  if (!character) return null;
  async function go() {
    setBusy(true);
    try {
      const r = await api<SearchResultDto>(
        `/campaigns/${campaignId}/maps/${mapId}/search`,
        await accessToken(),
        {
          method: 'POST',
          body: json({ characterId: character!.characterId, skill }),
        },
      );
      onResult(r);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Não foi possível procurar');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-arcane-500/40 bg-arcane-700/15 p-1"
      data-testid="search-around"
    >
      <Button
        size="sm"
        onClick={go}
        disabled={busy}
        title="Rola a perícia escolhida e revela o que estiver escondido perto do seu personagem"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Search />} Procurar ao redor
      </Button>
      <select
        value={skill}
        onChange={(e) => setSkill(e.target.value)}
        aria-label="Perícia para procurar"
        className="h-8 rounded-md border border-line bg-surface-2 px-1.5 text-xs text-ink"
      >
        {skills.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      {mine.length > 1 && (
        <select
          value={character.characterId}
          onChange={(e) => setWho(e.target.value)}
          aria-label="Quem procura"
          className="h-8 rounded-md border border-line bg-surface-2 px-1.5 text-xs text-ink"
        >
          {mine.map((m) => (
            <option key={m.characterId} value={m.characterId}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
