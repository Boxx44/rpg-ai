'use client';

import type { AssetDto, AssetKind } from '@rpg-ai/shared';
import { Button, cn } from '@rpg-ai/ui';
import { ImagePlus, Images, Loader2, Trash2, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { uploadAsset, useAssetUrl, useAssetUrls } from '@/lib/assets';
import { playSound, toast } from '@/lib/feedback';
import { accessToken } from '@/lib/supabase';

const KIND_TEXT: Record<AssetKind, string> = {
  map: 'Fundo do mapa',
  token: 'Imagem do token',
  portrait: 'Retrato',
};

/**
 * Escolher uma imagem: enviar do computador (ou arrastar para cá),
 * reaproveitar uma já enviada ou remover.
 */
export function ImagePicker({
  campaignId,
  kind,
  value,
  onChange,
  label = KIND_TEXT[kind],
  round = kind !== 'map',
  className,
  onUploaded,
}: {
  campaignId: string;
  kind: AssetKind;
  value: string | null;
  onChange: (assetId: string | null) => void | Promise<void>;
  label?: string;
  round?: boolean;
  className?: string;
  onUploaded?: (a: AssetDto) => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const url = useAssetUrl(campaignId, value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [over, setOver] = useState(false);
  const [gallery, setGallery] = useState<AssetDto[] | null>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const a = await uploadAsset(campaignId, kind, file);
      onUploaded?.(a);
      await onChange(a.id);
      playSound('notify');
      toast('Imagem enviada', { tone: 'success', ms: 1800 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar a imagem');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function openGallery() {
    setError(undefined);
    try {
      const all = await api<AssetDto[]>(`/campaigns/${campaignId}/assets`, await accessToken());
      setGallery(all.filter((a) => a.kind === kind));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir as imagens');
    }
  }

  return (
    <div className={cn('space-y-2', className)} data-testid={`image-picker-${kind}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-dashed p-2 transition-colors',
          over ? 'border-gold bg-gold/10' : 'border-line',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send(e.dataTransfer.files[0]);
        }}
      >
        <div
          className={cn(
            'grid shrink-0 place-items-center overflow-hidden border border-line bg-surface-2',
            round ? 'size-14 rounded-full' : 'h-14 w-20 rounded-md',
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin text-ink-faint" aria-label="Enviando" />
          ) : url ? (
            <img src={url} alt={label} className="size-full object-cover" data-testid="image-preview" />
          ) : (
            <ImagePlus className="size-5 text-ink-faint" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={input}
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={`Enviar ${label.toLowerCase()}`}
            onChange={(e) => void send(e.target.files?.[0])}
          />
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus /> {value ? 'Trocar' : 'Enviar imagem'}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={openGallery}>
            <Images /> Já enviadas
          </Button>
          {value && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onChange(null)}
              aria-label="Remover imagem"
            >
              <X />
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-ink-faint">
        Ou arraste a imagem para cá. PNG, JPG ou WebP; o site reduz o tamanho sozinho.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      {gallery && (
        <Gallery
          campaignId={campaignId}
          items={gallery}
          round={round}
          onPick={async (id) => {
            setGallery(null);
            await onChange(id);
          }}
          onDelete={async (id) => {
            await api(`/campaigns/${campaignId}/assets/${id}`, await accessToken(), { method: 'DELETE' });
            setGallery((g) => g?.filter((x) => x.id !== id) ?? null);
            if (id === value) await onChange(null);
          }}
          onClose={() => setGallery(null)}
        />
      )}
    </div>
  );
}

function Gallery({
  campaignId,
  items,
  round,
  onPick,
  onDelete,
  onClose,
}: {
  campaignId: string;
  items: AssetDto[];
  round: boolean;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const urls = useAssetUrls(
    campaignId,
    items.map((i) => i.id),
  );
  return (
    <div className="animate-pop rounded-lg border border-line bg-surface p-2" data-testid="image-gallery">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm">Imagens já enviadas</p>
        <button type="button" onClick={onClose} aria-label="Fechar" className="text-ink-faint hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-faint">Nenhuma ainda.</p>
      ) : (
        <ul className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto">
          {items.map((a) => (
            <li key={a.id} className="group relative">
              <button
                type="button"
                onClick={() => onPick(a.id)}
                title={a.name || 'Imagem'}
                className={cn(
                  'block aspect-square w-full overflow-hidden border border-line bg-surface-2 hover:border-gold',
                  round ? 'rounded-full' : 'rounded-md',
                )}
              >
                {urls[a.id] && (
                  <img src={urls[a.id]} alt={a.name || 'Imagem'} className="size-full object-cover" />
                )}
              </button>
              <button
                type="button"
                aria-label={`Apagar ${a.name || 'imagem'}`}
                onClick={() => onDelete(a.id)}
                className="absolute -right-1 -top-1 hidden rounded-full bg-blood p-1 text-white group-hover:block focus:block"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
