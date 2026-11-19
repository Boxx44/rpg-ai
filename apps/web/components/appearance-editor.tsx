'use client';

import {
  ACCESSORIES,
  type Appearance,
  APPEARANCE_LABELS as LBL,
  appearanceSchema,
  BODY_TYPES,
  BOTTOM_STYLES,
  CLOTH_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  HELD_ITEMS,
  randomAppearance,
  SHOE_STYLES,
  SKIN_TONES,
  TOP_STYLES,
} from '@rpg-ai/shared';
import { Button, cn } from '@rpg-ai/ui';
import { Dices, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { AvatarFigure } from './avatar-figure';

type Section = 'corpo' | 'cabelo' | 'cima' | 'baixo' | 'pes' | 'extras';
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'corpo', label: 'Corpo' },
  { key: 'cabelo', label: 'Cabelo' },
  { key: 'cima', label: 'Roupa de cima' },
  { key: 'baixo', label: 'Roupa de baixo' },
  { key: 'pes', label: 'Calçados' },
  { key: 'extras', label: 'Acessórios e itens' },
];

function Thumb({ a, crop = 'full' }: { a: Appearance; crop?: 'full' | 'head' | 'legs' }) {
  const vb = crop === 'head' ? '18 0 64 70' : crop === 'legs' ? '18 96 64 64' : '0 0 100 160';
  return (
    <svg viewBox={vb} className="size-full" aria-hidden>
      <AvatarFigure a={a} still />
    </svg>
  );
}

function Swatches({
  label,
  colors,
  value,
  onPick,
  allowNone,
}: {
  label: string;
  colors: string[];
  value: string | null;
  onPick: (c: string | null) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
        {allowNone && (
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            aria-label="Nenhuma"
            title="Nenhuma"
            onClick={() => onPick(null)}
            className={cn(
              'grid size-7 place-items-center rounded-full border text-[10px] text-ink-faint',
              value === null ? 'border-gold ring-2 ring-gold/50' : 'border-line',
            )}
          >
            ∅
          </button>
        )}
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value?.toLowerCase() === c.toLowerCase()}
            aria-label={`Cor ${c}`}
            title={c}
            onClick={() => onPick(c)}
            className={cn(
              'size-7 rounded-full border transition-transform hover:scale-110',
              value?.toLowerCase() === c.toLowerCase()
                ? 'scale-110 border-gold ring-2 ring-gold/60'
                : 'border-black/40',
            )}
            style={{ background: c }}
          />
        ))}
        <label
          className="relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line text-xs text-ink-muted"
          title="Outra cor"
        >
          +
          <input
            type="color"
            value={value ?? '#888888'}
            onChange={(e) => onPick(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${label}: outra cor`}
          />
        </label>
      </div>
    </div>
  );
}

function Options<T extends string>({
  label,
  options,
  value,
  labels,
  preview,
  onPick,
  crop,
}: {
  label: string;
  options: readonly T[];
  value: T;
  labels: Record<T, string>;
  preview: (o: T) => Appearance;
  onPick: (o: T) => void;
  crop?: 'full' | 'head' | 'legs';
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <div
        className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onPick(o)}
            data-option={o}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] transition-colors',
              value === o
                ? 'border-gold/70 bg-gold/10 text-gold-bright'
                : 'border-line text-ink-muted hover:border-arcane-500/60 hover:text-ink',
            )}
          >
            <span className="block h-16 w-full rounded bg-[#2a2433]">
              <Thumb a={preview(o)} crop={crop} />
            </span>
            <span className="w-full truncate">{labels[o]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Aba "Aparência": monta o boneco 2D do personagem escolhendo corpo, pele, cabelo,
 * roupas, calçados, acessórios e item na mão, cada um com várias cores.
 */
export function AppearanceEditor({
  value,
  seed,
  onChange,
  readOnly,
}: {
  value: Appearance | null;
  /** Semente para a aparência inicial sorteada (quando ainda não há uma). */
  seed: string;
  onChange: (a: Appearance) => void;
  readOnly?: boolean;
}) {
  const a = value ?? randomAppearance(seed);
  const [section, setSection] = useState<Section>('corpo');
  const set = (patch: Partial<Appearance>) => onChange(appearanceSchema.parse({ ...a, ...patch }));
  const accToggle = (x: (typeof ACCESSORIES)[number]) => {
    const has = a.accessories.includes(x);
    const next = has ? a.accessories.filter((y) => y !== x) : [...a.accessories, x].slice(-4);
    set({ accessories: next });
  };
  return (
    <div
      className={cn('grid gap-6 lg:grid-cols-[280px_1fr]', readOnly && 'pointer-events-none opacity-80')}
      data-testid="appearance-editor"
    >
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_50%_30%,#3a3046,#16131d)]">
          <svg
            viewBox="-10 -6 120 172"
            className="mx-auto h-[380px] w-full"
            role="img"
            aria-label="Prévia do boneco"
            data-testid="appearance-preview"
          >
            <AvatarFigure a={a} />
          </svg>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => onChange(randomAppearance(`${seed}-${Date.now()}`))}
            data-testid="appearance-random"
          >
            <Dices /> Aleatório
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(randomAppearance(seed))}
            title="Voltar à aparência inicial"
          >
            <RotateCcw />
          </Button>
        </div>
        <p className="text-xs text-ink-faint">
          É assim que o personagem aparece no mapa, respirando. Para usar um desenho seu, envie uma imagem de
          corpo inteiro no retrato.
        </p>
      </div>
      <div className="space-y-4">
        <div
          className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface/70 p-1"
          role="tablist"
          aria-label="Partes da aparência"
        >
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={section === s.key}
              onClick={() => setSection(s.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                section === s.key ? 'bg-arcane-700/60 text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {section === 'corpo' && (
          <>
            <Options
              label="Tipo de corpo"
              options={BODY_TYPES}
              value={a.body}
              labels={LBL.body}
              preview={(o) => ({ ...a, body: o })}
              onPick={(o) => set({ body: o })}
            />
            <Swatches
              label="Tom de pele"
              colors={SKIN_TONES}
              value={a.skin}
              onPick={(c) => set({ skin: c ?? a.skin })}
            />
            <Swatches
              label="Cor dos olhos"
              colors={[
                '#3b2a1a',
                '#6a4a2a',
                '#2a4a6a',
                '#3a5a3a',
                '#6a6a72',
                '#8c1f2b',
                '#c9a24b',
                '#121116',
              ]}
              value={a.eyes}
              onPick={(c) => set({ eyes: c ?? a.eyes })}
            />
          </>
        )}
        {section === 'cabelo' && (
          <>
            <Options
              label="Corte"
              options={HAIR_STYLES}
              value={a.hair.style}
              labels={LBL.hair}
              crop="head"
              preview={(o) => ({
                ...a,
                hair: { ...a.hair, style: o },
                accessories: a.accessories.filter((x) => x !== 'caveira'),
              })}
              onPick={(o) => set({ hair: { ...a.hair, style: o } })}
            />
            <Swatches
              label="Cor do cabelo"
              colors={HAIR_COLORS}
              value={a.hair.color}
              onPick={(c) => set({ hair: { ...a.hair, color: c ?? a.hair.color } })}
            />
            <Swatches
              label="Mecha colorida"
              colors={['#c43a4a', '#e9e2d4', '#6a2a8c', '#2a4a9c', '#2f7a5a', '#e86aa8', '#c9a24b']}
              value={a.hair.streak}
              allowNone
              onPick={(c) => set({ hair: { ...a.hair, streak: c } })}
            />
          </>
        )}
        {section === 'cima' && (
          <>
            <Options
              label="Peça"
              options={TOP_STYLES}
              value={a.top.style}
              labels={LBL.top}
              preview={(o) => ({ ...a, top: { ...a.top, style: o } })}
              onPick={(o) => set({ top: { ...a.top, style: o } })}
            />
            <Swatches
              label="Cor principal"
              colors={CLOTH_COLORS}
              value={a.top.color}
              onPick={(c) => set({ top: { ...a.top, color: c ?? a.top.color } })}
            />
            <Swatches
              label="Cor de detalhe"
              colors={CLOTH_COLORS}
              value={a.top.accent}
              onPick={(c) => set({ top: { ...a.top, accent: c ?? a.top.accent } })}
            />
            {(a.top.style === 'moletom' || a.top.style === 'manto') && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={a.hood || a.top.style === 'manto'}
                  disabled={a.top.style === 'manto'}
                  onChange={(e) => set({ hood: e.target.checked })}
                  className="accent-[var(--color-gold)]"
                />
                Capuz levantado
              </label>
            )}
          </>
        )}
        {section === 'baixo' && (
          <>
            <Options
              label="Peça"
              options={BOTTOM_STYLES}
              value={a.bottom.style}
              labels={LBL.bottom}
              crop="legs"
              preview={(o) => ({ ...a, bottom: { ...a.bottom, style: o } })}
              onPick={(o) => set({ bottom: { ...a.bottom, style: o } })}
            />
            <Swatches
              label="Cor"
              colors={CLOTH_COLORS}
              value={a.bottom.color}
              onPick={(c) => set({ bottom: { ...a.bottom, color: c ?? a.bottom.color } })}
            />
          </>
        )}
        {section === 'pes' && (
          <>
            <Options
              label="Calçado"
              options={SHOE_STYLES}
              value={a.shoes.style}
              labels={LBL.shoes}
              crop="legs"
              preview={(o) => ({ ...a, shoes: { ...a.shoes, style: o } })}
              onPick={(o) => set({ shoes: { ...a.shoes, style: o } })}
            />
            <Swatches
              label="Cor"
              colors={CLOTH_COLORS}
              value={a.shoes.color}
              onPick={(c) => set({ shoes: { ...a.shoes, color: c ?? a.shoes.color } })}
            />
          </>
        )}
        {section === 'extras' && (
          <>
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">
                Acessórios (até 4)
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Acessórios">
                {ACCESSORIES.map((x) => (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={a.accessories.includes(x)}
                    onClick={() => accToggle(x)}
                    data-option={x}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px]',
                      a.accessories.includes(x)
                        ? 'border-gold/70 bg-gold/10 text-gold-bright'
                        : 'border-line text-ink-muted hover:text-ink',
                    )}
                  >
                    <span className="block h-16 w-full rounded bg-[#2a2433]">
                      <Thumb
                        a={{ ...a, accessories: [x] }}
                        crop={
                          ['caveira', 'oculos', 'venda', 'cicatriz', 'colar'].includes(x) ? 'head' : 'full'
                        }
                      />
                    </span>
                    <span className="w-full truncate">{LBL.accessories[x]}</span>
                  </button>
                ))}
              </div>
            </div>
            <Options
              label="Na mão"
              options={HELD_ITEMS}
              value={a.held}
              labels={LBL.held}
              preview={(o) => ({ ...a, held: o })}
              onPick={(o) => set({ held: o })}
            />
          </>
        )}
      </div>
    </div>
  );
}
