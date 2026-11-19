'use client';

/**
 * Aba "Aparência": criador de personagem em pixel art, como nos jogos de RPG.
 * Escolha o corpo, a pele, o rosto, o cabelo, as roupas, os calçados e os acessórios,
 * cada um com várias cores. As peças são da biblioteca aberta LPC (créditos em /creditos).
 */
import {
  type Appearance,
  appearanceSchema,
  LPC,
  LPC_BODIES,
  LPC_ITEMS,
  lpcColorLabel,
  lpcColorOptions,
  lpcFits,
  lpcItemsFor,
  type LpcBody,
  type LpcItem,
  type PixelLook,
  pixelSchema,
  lpcSwatch,
  randomPixel,
} from '@rpg-ai/shared';
import { Button, cn } from '@rpg-ai/ui';
import { Dices, RotateCcw, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { type LpcDir, useLpcFrame } from '../lib/lpc';

type Section = 'corpo' | 'cabelo' | 'cima' | 'baixo' | 'pes' | 'extras';
const SECTIONS: { key: Section; label: string; slots: string[] }[] = [
  { key: 'corpo', label: 'Corpo', slots: ['head', 'beard'] },
  { key: 'cabelo', label: 'Cabelo', slots: ['hair'] },
  { key: 'cima', label: 'Roupa de cima', slots: ['top', 'jacket', 'belt'] },
  { key: 'baixo', label: 'Roupa de baixo', slots: ['legs'] },
  { key: 'pes', label: 'Calçados', slots: ['feet'] },
  { key: 'extras', label: 'Acessórios e itens', slots: ['hat', 'face', 'neck', 'gloves', 'cape', 'weapon'] },
];
const NONE_LABEL: Record<string, string> = {
  hair: 'Careca',
  beard: 'Sem barba',
  top: 'Sem camisa',
  jacket: 'Sem casaco',
  belt: 'Sem cinto',
  legs: 'Nada',
  feet: 'Descalço',
  hat: 'Nada',
  face: 'Nada',
  neck: 'Nada',
  gloves: 'Sem luvas',
  cape: 'Sem capa',
  weapon: 'Mãos livres',
};
const COLOR_TITLE: Record<string, string[]> = {
  head: ['Pele', 'Cor dos olhos'],
  hair: ['Cor do cabelo'],
  beard: ['Cor da barba'],
};

const PREFERRED = ['charcoal', 'black', 'dark_brown', 'brown', 'gray'];
/** Cores ao trocar de peça: mantém a cor que já estava, se servir; senão uma cor neutra. */
function pickColors(it: LpcItem, keep?: string[]): string[] {
  return lpcColorOptions(it).map((o, i) => {
    const k = keep?.[i];
    if (k && o.includes(k)) return k;
    return PREFERRED.find((c) => o.includes(c)) ?? o[0]!;
  });
}

/** Ajusta o personagem depois de trocar o corpo: tira o que não serve e mantém pele e rosto. */
function normalize(p: PixelLook): PixelLook {
  const parts = { ...p.parts };
  for (const [slot, part] of Object.entries(parts)) {
    const it = LPC_ITEMS.get(part.id);
    if (!it || !lpcFits(it, p.body)) delete parts[slot];
  }
  if (!parts.head) {
    const h = lpcItemsFor('head', p.body)[p.body === 'female' ? 1 : 0] ?? lpcItemsFor('head', p.body)[0];
    if (h) parts.head = { id: h.id, color: [p.skin, 'brown'] };
  }
  if (parts.head) parts.head = { ...parts.head, color: [p.skin, parts.head.color[1] ?? 'brown'] };
  return pixelSchema.parse({ ...p, parts });
}

function Sprite({
  look,
  dir = 2,
  className,
  testId,
}: {
  look: PixelLook;
  dir?: LpcDir;
  className?: string;
  testId?: string;
}) {
  const url = useLpcFrame(look, dir);
  return url ? (
    <img
      src={url}
      alt=""
      className={className}
      style={{ imageRendering: 'pixelated' }}
      data-testid={testId}
      data-pixel={[look.body, ...Object.values(look.parts).map((p) => p.id)].join(' ')}
    />
  ) : (
    <span className={cn('block animate-pulse rounded bg-white/5', className)} data-testid={testId} />
  );
}

function ItemGrid({
  title,
  slot,
  look,
  onPick,
  none,
}: {
  title: string;
  slot: string;
  look: PixelLook;
  onPick: (it: LpcItem | null) => void;
  none?: string;
}) {
  const items = lpcItemsFor(slot, look.body);
  if (!items.length) return null;
  const current = look.parts[slot]?.id ?? null;
  const preview = (it: LpcItem | null): PixelLook => {
    const parts = { ...look.parts };
    if (it) {
      const old = parts[slot];
      parts[slot] = { id: it.id, color: pickColors(it, old?.color) };
    } else delete parts[slot];
    return normalize({ ...look, parts });
  };
  const options: (LpcItem | null)[] = none ? [null, ...items] : items;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{title}</p>
      <div
        className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-8"
        role="radiogroup"
        aria-label={title}
      >
        {options.map((it) => {
          const id = it?.id ?? null;
          const label = it?.label ?? none!;
          return (
            <button
              key={id ?? 'none'}
              type="button"
              role="radio"
              aria-checked={current === id}
              aria-label={label}
              title={label}
              onClick={() => onPick(it)}
              data-option={id ?? 'none'}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg border p-1 text-[11px] transition-colors',
                current === id
                  ? 'border-gold/70 bg-gold/10 text-gold-bright'
                  : 'border-line text-ink-muted hover:border-arcane-500/60 hover:text-ink',
              )}
            >
              <span className="block h-14 w-full overflow-hidden rounded bg-[#2a2433]">
                <Sprite look={preview(it)} className="mx-auto -mt-1 h-16 w-16" />
              </span>
              <span className="w-full truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Colors({
  title,
  item,
  index,
  value,
  onPick,
}: {
  title: string;
  item: LpcItem;
  index: number;
  value: string | undefined;
  onPick: (c: string) => void;
}) {
  const opts = lpcColorOptions(item)[index] ?? [];
  if (opts.length < 2) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{title}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={title}>
        {opts.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={`Cor ${lpcColorLabel(c)}`}
            title={lpcColorLabel(c)}
            onClick={() => onPick(c)}
            className={cn(
              'size-7 rounded-full border transition-transform hover:scale-110',
              value === c ? 'scale-110 border-gold ring-2 ring-gold/60' : 'border-black/40',
            )}
            style={{ background: lpcSwatch(item, index, c) }}
          />
        ))}
      </div>
    </div>
  );
}

export function AppearanceEditor({
  value,
  seed,
  onChange,
  readOnly,
}: {
  value: Appearance | null;
  /** Semente para o personagem inicial sorteado (quando ainda não há um). */
  seed: string;
  onChange: (a: Appearance) => void;
  readOnly?: boolean;
}) {
  const look = value?.pixel ?? randomPixel(seed);
  const [section, setSection] = useState<Section>('corpo');
  const [dir, setDir] = useState<LpcDir>(2);
  const save = (p: PixelLook) => onChange(appearanceSchema.parse({ ...(value ?? {}), pixel: normalize(p) }));
  const setPart = (slot: string, it: LpcItem | null) => {
    const parts = { ...look.parts };
    if (it) {
      const old = parts[slot];
      parts[slot] = { id: it.id, color: pickColors(it, old?.color) };
    } else delete parts[slot];
    save({ ...look, parts });
  };
  const setColor = (slot: string, i: number, c: string) => {
    const part = look.parts[slot];
    if (!part) return;
    const color = [...part.color];
    color[i] = c;
    if (slot === 'head' && i === 0) return save({ ...look, skin: c });
    save({ ...look, parts: { ...look.parts, [slot]: { ...part, color } } });
  };
  const sec = SECTIONS.find((s) => s.key === section)!;
  const turn = (d: number) => setDir(((((dir + d) % 4) + 4) % 4) as LpcDir);
  const bodyItem = LPC_ITEMS.get('body')!;

  return (
    <div
      className={cn('grid gap-6 lg:grid-cols-[280px_1fr]', readOnly && 'pointer-events-none opacity-80')}
      data-testid="appearance-editor"
    >
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_50%_35%,#3a3046,#16131d)]">
          <div className="animate-breathe-soft" style={{ transformOrigin: '50% 92%' }}>
            <Sprite
              look={look}
              dir={dir}
              className="mx-auto h-[300px] w-[300px] max-w-full"
              testId="appearance-preview"
            />
          </div>
          <div className="absolute bottom-2 right-2 flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => turn(1)} aria-label="Girar para a esquerda">
              <RotateCcw />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => turn(-1)} aria-label="Girar para a direita">
              <RotateCw />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => save(randomPixel(`${seed}-${Date.now()}`))}
            data-testid="appearance-random"
          >
            <Dices /> Aleatório
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => save(randomPixel(seed))}
            title="Voltar ao personagem inicial"
          >
            <RotateCcw />
          </Button>
        </div>
        <p className="text-xs text-ink-faint">
          É assim que o personagem aparece no mapa, respirando. Arte em pixel da biblioteca aberta LPC —{' '}
          <a href="/creditos" className="underline" target="_blank">
            créditos dos artistas
          </a>
          .
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
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Tipo de corpo</p>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Tipo de corpo">
                {LPC_BODIES.map((b: LpcBody) => (
                  <button
                    key={b}
                    type="button"
                    role="radio"
                    aria-checked={look.body === b}
                    aria-label={LPC.bodies[b]}
                    onClick={() => save({ ...look, body: b })}
                    data-option={b}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-lg border p-1 text-[11px]',
                      look.body === b
                        ? 'border-gold/70 bg-gold/10 text-gold-bright'
                        : 'border-line text-ink-muted hover:border-arcane-500/60 hover:text-ink',
                    )}
                  >
                    <span className="block h-16 w-full overflow-hidden rounded bg-[#2a2433]">
                      <Sprite look={normalize({ ...look, body: b })} className="mx-auto h-16 w-16" />
                    </span>
                    {LPC.bodies[b]}
                  </button>
                ))}
              </div>
            </div>
            <Colors
              title="Pele"
              item={bodyItem}
              index={0}
              value={look.skin}
              onPick={(c) => save({ ...look, skin: c })}
            />
          </>
        )}

        {sec.slots.map((slot) => {
          const part = look.parts[slot];
          const it = part ? LPC_ITEMS.get(part.id) : undefined;
          return (
            <div key={slot} className="space-y-3">
              <ItemGrid
                title={LPC.slots[slot] ?? slot}
                slot={slot}
                look={look}
                onPick={(x) => setPart(slot, x)}
                none={slot === 'head' ? undefined : NONE_LABEL[slot]}
              />
              {it &&
                lpcColorOptions(it).map((_, i) =>
                  slot === 'head' && i === 0 ? null : (
                    <Colors
                      key={i}
                      title={COLOR_TITLE[slot]?.[i] ?? `Cor — ${LPC.slots[slot] ?? it.label}`}
                      item={it}
                      index={i}
                      value={part?.color[i]}
                      onPick={(c) => setColor(slot, i, c)}
                    />
                  ),
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
