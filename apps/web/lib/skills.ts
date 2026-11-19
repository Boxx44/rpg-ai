import type { CampaignSystemDto } from '@rpg-ai/shared';

export interface SkillOption {
  key: string;
  label: string;
}

/** Perícias boas para procurar coisas (vêm primeiro na lista). */
const SEARCH_FIRST = ['percepcao', 'investigacao', 'ocultismo', 'sobrevivencia', 'intuicao', 'tecnologia'];

/** Perícias do sistema da campanha, com as de "procurar" no topo. */
export function searchSkills(system: CampaignSystemDto | null): SkillOption[] {
  const all = ((system?.definition as { skills?: SkillOption[] } | undefined)?.skills ?? []).map((s) => ({
    key: s.key,
    label: s.label,
  }));
  if (!all.length)
    return [
      { key: 'percepcao', label: 'Percepção' },
      { key: 'investigacao', label: 'Investigação' },
    ];
  const rank = (k: string) => {
    const i = SEARCH_FIRST.indexOf(k);
    return i === -1 ? 99 : i;
  };
  return [...all].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, 'pt-BR'));
}
