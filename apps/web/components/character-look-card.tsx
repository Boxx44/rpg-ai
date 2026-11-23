'use client';

/**
 * Cartão que aparece ao clicar num personagem no mapa: mostra a aparência dele e,
 * para o dono ou o mestre, abre o criador ("Mudar aparência") ali mesmo, sem sair da mesa.
 */
import { type Appearance, type CharacterDto, randomPixel } from '@rpg-ai/shared';
import { Button, cn } from '@rpg-ai/ui';
import { IdCard, Palette, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, json } from '@/lib/api';
import { useLpcFrame } from '@/lib/lpc';
import { accessToken } from '@/lib/supabase';
import { AppearanceEditor } from './appearance-editor';

export function CharacterLookCard({
  campaignId,
  character,
  canEdit,
  onClose,
  onSaved,
  onOpenSheet,
}: {
  campaignId: string;
  character: CharacterDto;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (c: CharacterDto) => void;
  onOpenSheet: () => void;
}) {
  const look = character.sheet.appearance?.pixel ?? randomPixel(character.id);
  const url = useLpcFrame(look);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Appearance | null>(character.sheet.appearance ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => setDraft(character.sheet.appearance ?? null), [character.id, character.sheet.appearance]);
  useEffect(() => {
    if (!editing) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setEditing(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [editing]);

  async function save() {
    if (!draft) return setEditing(false);
    setSaving(true);
    setError(undefined);
    try {
      const updated = await api<CharacterDto>(
        `/campaigns/${campaignId}/characters/${character.id}`,
        await accessToken(),
        {
          method: 'PATCH',
          body: json({ sheet: { ...character.sheet, appearance: draft }, version: character.version }),
        },
      );
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a aparência');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="absolute bottom-3 left-3 z-20 w-56 rounded-xl border border-line bg-surface/95 p-3 shadow-xl backdrop-blur"
        data-testid="character-card"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-base">{character.name}</p>
            {character.concept && <p className="truncate text-xs text-ink-muted">{character.concept}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-ink-faint hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="my-2 overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_35%,#3a3046,#16131d)]">
          {url ? (
            <img
              src={url}
              alt={`Aparência de ${character.name}`}
              className="animate-breathe-soft mx-auto h-36 w-36"
              style={{ imageRendering: 'pixelated', transformOrigin: '50% 92%' }}
              data-testid="character-card-look"
            />
          ) : (
            <div className="mx-auto h-36 w-36 animate-pulse" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {canEdit && (
            <Button size="sm" onClick={() => setEditing(true)} data-testid="change-look">
              <Palette /> Mudar aparência
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onOpenSheet}>
            <IdCard /> Ver ficha
          </Button>
        </div>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Aparência de ${character.name}`}
          onClick={(e) => e.target === e.currentTarget && setEditing(false)}
        >
          <div className="max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-line bg-bg p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl">Aparência de {character.name}</h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                aria-label="Fechar"
                className="text-ink-faint hover:text-ink"
              >
                <X />
              </button>
            </div>
            <AppearanceEditor value={draft} seed={character.id} onChange={setDraft} />
            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
            <div className={cn('mt-5 flex justify-end gap-2')}>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void save()} disabled={saving || !draft} data-testid="save-look">
                {saving ? 'Salvando…' : 'Salvar aparência'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
