'use client';

import {
  gridDistance,
  type MapDto,
  PROPS,
  propStateLabel,
  type Terrain,
  type TokenDto,
} from '@rpg-ai/shared';
import { cn } from '@rpg-ai/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FLAT_PROPS, PROP_LIGHT, PropArt, PropDefs } from './map-props';
import { FigureDefs, type FigureGear, type FigureRole, TokenFigure } from './token-figure';
import { TEXTURE_CELLS, type TextureKind, useTextures } from '@/lib/textures';
import { draggingFiles, imageFrom, useAssetUrls } from '@/lib/assets';
import { prefersLessMotion } from '@/lib/feedback';

export const CELL = 40;

/** Cor base de cada terreno (também usada nas amostras da paleta do editor) + textura. */
export const TERRAIN_STYLE: Record<Terrain, { fill: string; pattern?: string }> = {
  floor: { fill: '#2a2433', pattern: 'p-floor' },
  wall: { fill: '#1a1620', pattern: 'p-brick' },
  door: { fill: '#3a2a18' },
  water: { fill: '#173451' },
  grass: { fill: '#22432a', pattern: 'p-grass' },
  sand: { fill: '#6b5935', pattern: 'p-sand' },
  rock: { fill: '#3a3641', pattern: 'p-rock' },
  lava: { fill: '#7a2a10' },
  tree: { fill: '#22432a', pattern: 'p-grass' },
  wood: { fill: '#5a3d22', pattern: 'p-wood' },
  stone: { fill: '#4a4652', pattern: 'p-stone' },
  carpet: { fill: '#5a1f2e', pattern: 'p-carpet' },
  road: { fill: '#2b2c30', pattern: 'p-road' },
  dirt: { fill: '#4a3624', pattern: 'p-sand' },
  snow: { fill: '#d9e3ec', pattern: 'p-snow' },
  tile: { fill: '#c9cfd6', pattern: 'p-tile' },
};

/** Textura realista usada por cada terreno. */
const TERRAIN_TEXTURE: Partial<Record<Terrain, TextureKind>> = {
  floor: 'floor',
  wall: 'brick',
  door: 'floor',
  grass: 'grass',
  tree: 'grass',
  sand: 'sand',
  rock: 'rock',
  wood: 'wood',
  stone: 'stone',
  carpet: 'carpet',
  road: 'road',
  dirt: 'dirt',
  snow: 'snow',
  tile: 'tile',
};

/** "1,5 m" → distância formatada para N quadrados (ou só os quadrados se não der para converter). */
export function formatDistance(cells: number, cellLabel: string): string {
  const m = /^\s*([\d.,]+)\s*(.*)$/.exec(cellLabel);
  const q = `${cells} ${cells === 1 ? 'quadrado' : 'quadrados'}`;
  if (!m) return q;
  const n = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(n)) return q;
  const v = (n * cells).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${q} · ${v} ${m[2]}`.trim();
}

/** Informações extras de cada peça vindas da mesa (vida, vez do turno…). */
export interface TokenDecoration {
  /** Vida atual/máxima (só quando quem olha pode ver). */
  hp?: { current: number; max: number };
  /** Estado de saúde sem números (inimigos para jogadores). */
  health?: 'ok' | 'hurt' | 'down';
  turn?: boolean;
  conditions?: number;
  /** Classe do personagem (muda o equipamento do boneco). */
  role?: FigureRole;
  /** Primeira arma da ficha: corpo a corpo ou à distância. */
  gear?: FigureGear;
}

export interface MapCanvasProps {
  map: MapDto;
  /** Pode arrastar este token? */
  canMove?: (t: TokenDto) => boolean;
  onMove?: (t: TokenDto, x: number, y: number) => void;
  /** Ferramenta de pintura ativa: recebe as células pintadas ao soltar o mouse. */
  paint?: { terrain: Terrain | null; onPaint: (cells: { x: number; y: number }[]) => void };
  onCellClick?: (x: number, y: number) => void;
  selectedTokenId?: string | null;
  onSelectToken?: (t: TokenDto) => void;
  /** Usar objeto (abrir porta, acender tocha). */
  onUseProp?: (t: TokenDto) => void;
  decorations?: Record<string, TokenDecoration>;
  zoom?: number;
  /**
   * Soltar uma imagem do computador no mapa. `target` é a peça sob o mouse
   * (ou null = fundo do mapa). Sem esta função, o mapa não aceita imagens.
   */
  onDropImage?: (file: File, target: TokenDto | null) => void;
  /** Abrir já ajustado à largura disponível (padrão: sim). */
  autoFit?: boolean;
  /** Texto do aviso ao arrastar sobre o fundo / sobre uma peça. */
  dropHint?: (target: TokenDto | null) => string;
  /** Pinça com dois dedos e botão "ajustar à tela" mudam o zoom. */
  onZoomChange?: (z: number) => void;
  className?: string;
}

const isProp = (t: TokenDto) => t.kind === 'object' && !!t.icon;
const usable = (t: TokenDto) => isProp(t) && t.state !== null;

/** Números de dano/cura que sobem da peça quando a vida muda. */
function useFloaters(decorations?: Record<string, TokenDecoration>) {
  const prev = useRef<Record<string, number>>({});
  const [floaters, setFloaters] = useState<{ id: number; tokenId: string; delta: number }[]>([]);
  useEffect(() => {
    if (!decorations) return;
    const add: { id: number; tokenId: string; delta: number }[] = [];
    for (const [id, d] of Object.entries(decorations)) {
      const cur = d.hp?.current;
      if (cur === undefined) continue;
      const before = prev.current[id];
      if (before !== undefined && before !== cur)
        add.push({ id: Date.now() + Math.random(), tokenId: id, delta: cur - before });
      prev.current[id] = cur;
    }
    if (add.length) {
      setFloaters((f) => [...f, ...add]);
      const ids = new Set(add.map((a) => a.id));
      setTimeout(() => setFloaters((f) => f.filter((x) => !ids.has(x.id))), 1500);
    }
  }, [decorations]);
  return floaters;
}

export function MapCanvas({
  map,
  canMove,
  onMove,
  paint,
  onCellClick,
  selectedTokenId,
  onSelectToken,
  onUseProp,
  decorations,
  zoom = 1,
  onZoomChange,
  onDropImage,
  dropHint,
  autoFit = true,
  className,
}: MapCanvasProps) {
  /** Arrastando um arquivo de imagem por cima do mapa: mostra onde vai cair. */
  const [dropOver, setDropOver] = useState<{ target: TokenDto | null } | null>(null);
  const tokenAt = (x: number, y: number): TokenDto | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-token-id]');
    const id = el?.getAttribute('data-token-id');
    return (id && map.tokens.find((t) => t.id === id && !isProp(t))) || null;
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** Dedos na tela (toque): um dedo arrasta a vista, dois dedos dão zoom. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: 'pan' | 'pinch';
    x: number;
    y: number;
    left: number;
    top: number;
    dist: number;
    zoom: number;
    moved: boolean;
    cell: { x: number; y: number } | null;
  } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [drag, setDrag] = useState<{
    token: TokenDto;
    x: number;
    y: number;
    offX: number;
    offY: number;
    moved: boolean;
  } | null>(null);
  const [painting, setPainting] = useState<Map<string, { x: number; y: number }> | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const floaters = useFloaters(decorations);
  const tex = useTextures();
  const urls = useAssetUrls(map.campaignId, [map.backgroundAsset, ...map.tokens.map((t) => t.image)]);
  const bg = map.backgroundAsset ? urls[map.backgroundAsset] : undefined;

  // Leva a vista até a peça da vez (ou a escolhida na barra de iniciativa).
  const turnId = Object.entries(decorations ?? {}).find(([, d]) => d.turn)?.[0];
  const focusId = selectedTokenId ?? turnId;
  useEffect(() => {
    if (!focusId) return;
    const el = svgRef.current?.querySelector(`[data-token-id="${focusId}"]`);
    el?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
      behavior: prefersLessMotion() ? 'auto' : 'smooth',
    });
  }, [focusId]);

  const toCell = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { fx: p.x / CELL, fy: p.y / CELL };
  }, []);

  const clampPos = (t: TokenDto, x: number, y: number) => ({
    x: Math.max(0, Math.min(map.cols - t.size, Math.round(x))),
    y: Math.max(0, Math.min(map.rows - t.size, Math.round(y))),
  });

  function onTokenDown(e: React.PointerEvent, t: TokenDto) {
    e.stopPropagation();
    onSelectToken?.(t);
    if (paint) return;
    if (!canMove?.(t)) {
      // Objeto que não pode ser arrastado: um clique usa (porta, baú, tocha…).
      if (usable(t)) onUseProp?.(t);
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    const { fx, fy } = toCell(e);
    setDrag({ token: t, x: t.x, y: t.y, offX: fx - t.x, offY: fy - t.y, moved: false });
  }

  const clampZoom = (z: number) => Math.max(0.4, Math.min(3, +z.toFixed(2)));
  const fingerDist = () => {
    const [a, b] = [...touches.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      const wrap = wrapRef.current;
      if (g?.mode === 'pinch' && touches.current.size >= 2 && g.dist > 0) {
        onZoomChange?.(clampZoom((g.zoom * fingerDist()) / g.dist));
        return;
      }
      if (g?.mode === 'pan' && wrap) {
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
        if (g.moved) {
          wrap.scrollLeft = g.left - dx;
          wrap.scrollTop = g.top - dy;
        }
        return;
      }
    }
    if (drag) {
      const { fx, fy } = toCell(e);
      const p = clampPos(drag.token, fx - drag.offX, fy - drag.offY);
      if (p.x !== drag.x || p.y !== drag.y) setDrag({ ...drag, ...p, moved: true });
    } else if (painting) {
      const { fx, fy } = toCell(e);
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      if (x >= 0 && y >= 0 && x < map.cols && y < map.rows && !painting.has(`${x},${y}`))
        setPainting(new Map(painting).set(`${x},${y}`, { x, y }));
    }
  }

  function onPointerUp(e?: React.PointerEvent) {
    if (e?.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.delete(e.pointerId);
      const g = gesture.current;
      if (g?.mode === 'pan' && !g.moved && g.cell && touches.current.size === 0)
        onCellClick?.(g.cell.x, g.cell.y);
      if (touches.current.size === 0) gesture.current = null;
      else if (g?.mode === 'pinch') gesture.current = { ...g, mode: 'pan', moved: true }; // sobrou um dedo: não é toque
    }
    if (drag) {
      if (drag.x !== drag.token.x || drag.y !== drag.token.y) onMove?.(drag.token, drag.x, drag.y);
      else if (!drag.moved && usable(drag.token)) onUseProp?.(drag.token); // clique sem arrastar = usar
      setDrag(null);
    }
    if (painting) {
      if (painting.size) paint?.onPaint([...painting.values()]);
      setPainting(null);
    }
  }

  function onBoardDown(e: React.PointerEvent) {
    const { fx, fy } = toCell(e);
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const inside = x >= 0 && y >= 0 && x < map.cols && y < map.rows;
    if (e.pointerType === 'touch') {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const wrap = wrapRef.current;
      if (touches.current.size >= 2) {
        // dois dedos: zoom (e cancela a pintura começada pelo primeiro dedo)
        setPainting(null);
        gesture.current = {
          mode: 'pinch',
          x: e.clientX,
          y: e.clientY,
          left: wrap?.scrollLeft ?? 0,
          top: wrap?.scrollTop ?? 0,
          dist: fingerDist(),
          zoom: zoomRef.current,
          moved: true,
          cell: null,
        };
        return;
      }
      if (paint && inside) {
        setPainting(new Map([[`${x},${y}`, { x, y }]]));
        return;
      }
      // um dedo: arrastar a vista; se não mexer, vale como toque na casa
      gesture.current = {
        mode: 'pan',
        x: e.clientX,
        y: e.clientY,
        left: wrap?.scrollLeft ?? 0,
        top: wrap?.scrollTop ?? 0,
        dist: 0,
        zoom: zoomRef.current,
        moved: false,
        cell: inside ? { x, y } : null,
      };
      return;
    }
    if (!inside) return;
    if (paint) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setPainting(new Map([[`${x},${y}`, { x, y }]]));
    } else onCellClick?.(x, y);
  }

  /**
   * Zoom para o mapa ocupar o maior tamanho possível cabendo inteiro no espaço
   * (amplia mapas pequenos, reduz os grandes).
   */
  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !onZoomChange) return;
    const zw = (el.clientWidth - 2) / (map.cols * CELL);
    const zh = el.clientHeight > 80 ? (el.clientHeight - 2) / (map.rows * CELL) : zw;
    onZoomChange(clampZoom(Math.min(3, zw, zh)));
  }, [map.cols, map.rows, onZoomChange]);
  // O mapa já abre grande, preenchendo o espaço (a não ser que autoFit=false).
  useEffect(() => {
    if (autoFit) fit();
  }, [map.id, fit, autoFit]);

  /** Tela cheia: o mapa ocupa o monitor inteiro (Esc sai). */
  const outerRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const h = () => {
      setFull(document.fullscreenElement === outerRef.current);
      requestAnimationFrame(() => fit());
    };
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, [fit]);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void outerRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  /** Teclado: setas movem a peça, Enter/Espaço usa o objeto. */
  function onTokenKey(e: React.KeyboardEvent, t: TokenDto) {
    if ((e.key === 'Enter' || e.key === ' ') && usable(t)) {
      e.preventDefault();
      onUseProp?.(t);
      return;
    }
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!d || !canMove?.(t)) return;
    e.preventDefault();
    const p = clampPos(t, t.x + d[0]!, t.y + d[1]!);
    if (p.x !== t.x || p.y !== t.y) onMove?.(t, p.x, p.y);
  }

  const terrain = { ...map.terrain };
  if (painting && paint)
    for (const k of painting.keys()) {
      if (paint.terrain) terrain[k] = paint.terrain;
      else delete terrain[k];
    }
  const cells = Object.entries(terrain)
    .map(([k, tr]) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return { k, x, y, tr };
    })
    .filter((c) => c.x < map.cols && c.y < map.rows && TERRAIN_STYLE[c.tr]);
  const isWall = (x: number, y: number) => terrain[`${x},${y}`] === 'wall';

  const W = map.cols * CELL;
  const H = map.rows * CELL;
  const props = map.tokens.filter(isProp);
  // quem está mais embaixo no mapa é desenhado por cima (a cabeça de quem está atrás fica atrás)
  const pieces = map.tokens.filter((t) => !isProp(t)).sort((a, b) => a.y - b.y || a.x - b.x);
  const lights = props.filter((t) => {
    const l = PROP_LIGHT[t.icon!];
    return l && t.state === l.when;
  });
  const animated = (tr: Terrain) => cells.filter((c) => c.tr === tr);

  return (
    <div
      ref={outerRef}
      data-fullscreen={full ? 'true' : undefined}
      className={cn('relative', full && 'bg-[#0d0b12] p-2')}
      onDragOver={
        onDropImage
          ? (e) => {
              if (!draggingFiles(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              const target = tokenAt(e.clientX, e.clientY);
              if (dropOver?.target?.id !== target?.id || !dropOver) setDropOver({ target });
            }
          : undefined
      }
      onDragLeave={
        onDropImage
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOver(null);
            }
          : undefined
      }
      onDrop={
        onDropImage
          ? (e) => {
              const f = imageFrom(e.dataTransfer);
              setDropOver(null);
              if (!f) return;
              e.preventDefault();
              onDropImage(f, tokenAt(e.clientX, e.clientY));
            }
          : undefined
      }
    >
      <div
        ref={wrapRef}
        className={cn(
          'relative overflow-auto overscroll-contain rounded-xl border border-line bg-[#0d0b12]',
          className,
          full && '!h-[calc(100vh-1rem)] !max-h-none',
        )}
      >
        <svg
          ref={svgRef}
          data-testid="map-canvas"
          viewBox={`0 0 ${W} ${H}`}
          width={W * zoom}
          height={H * zoom}
          role="img"
          aria-label={`Mapa ${map.name}: ${map.cols} por ${map.rows} quadrados, ${pieces.length} peças e ${props.length} objetos.`}
          className={cn(
            'block touch-none select-none',
            paint ? 'cursor-crosshair' : onCellClick ? 'cursor-pointer' : '',
          )}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => onPointerUp(e)}
          onPointerCancel={(e) => onPointerUp(e)}
        >
          <defs>
            {(Object.keys(tex) as TextureKind[]).map((k) => {
              const size = CELL * TEXTURE_CELLS[k];
              return (
                <pattern key={k} id={`tx-${k}`} width={size} height={size} patternUnits="userSpaceOnUse">
                  <image href={tex[k]} width={size} height={size} />
                </pattern>
              );
            })}
            <linearGradient id="g-walltop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(0,0,0,0.05)" />
              <stop offset="1" stopColor="rgba(0,0,0,0.45)" />
            </linearGradient>
            <linearGradient id="g-shadow-s" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(0,0,0,0.6)" />
              <stop offset="1" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
            <linearGradient id="g-shadow-e" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(0,0,0,0.45)" />
              <stop offset="1" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
            <radialGradient id="g-depth" cx="50%" cy="50%" r="70%">
              <stop offset="0" stopColor="rgba(0,20,40,0.35)" />
              <stop offset="1" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <filter id="f-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#000" floodOpacity="0.55" />
            </filter>
            <PropDefs />
            <FigureDefs />
            <pattern id="p-floor" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="#2a2433" />
              <path d="M0 0H40V40" fill="none" stroke="rgba(0,0,0,0.25)" />
              <circle cx="12" cy="9" r="0.8" fill="rgba(255,255,255,0.05)" />
              <circle cx="30" cy="27" r="1" fill="rgba(255,255,255,0.04)" />
            </pattern>
            <pattern id="p-brick" width="20" height="10" patternUnits="userSpaceOnUse">
              <rect width="20" height="10" fill="#2a2330" />
              <path d="M0 0H20M0 5H20M5 0V5M15 5V10" stroke="#120f16" strokeWidth="1" />
              <rect x="1" y="1" width="3" height="1" fill="rgba(255,255,255,0.05)" />
            </pattern>
            <pattern id="p-grass" width="14" height="14" patternUnits="userSpaceOnUse">
              <rect width="14" height="14" fill="#22432a" />
              <path
                d="M3 10 l1 -4 M5 11 l2 -5 M10 6 l1 -3 M11 12 l-1 -4"
                stroke="#3d7a48"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </pattern>
            <pattern id="p-sand" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="0.8" fill="rgba(255,255,255,0.12)" />
              <circle cx="9" cy="7" r="0.6" fill="rgba(0,0,0,0.25)" />
              <circle cx="5" cy="10" r="0.5" fill="rgba(255,255,255,0.08)" />
            </pattern>
            <pattern id="p-rock" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M0 8 L6 4 L12 9 L20 5 M4 20 L9 14 L16 17" stroke="rgba(0,0,0,0.4)" fill="none" />
              <path d="M2 14 L6 11" stroke="rgba(255,255,255,0.08)" />
            </pattern>
            <pattern id="p-wood" width="40" height="10" patternUnits="userSpaceOnUse">
              <rect width="40" height="10" fill="#5a3d22" />
              <path d="M0 0H40 M26 0V10" stroke="#3a2614" strokeWidth="1" />
              <path d="M4 5 C10 4 16 6 22 5" stroke="rgba(255,220,170,0.08)" fill="none" />
            </pattern>
            <pattern id="p-stone" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="#4a4652" />
              <path d="M0 0H20M0 10H20M10 0V10M0 10V20" stroke="#2e2b34" strokeWidth="1.2" />
              <rect x="2" y="2" width="5" height="2" fill="rgba(255,255,255,0.06)" />
            </pattern>
            <pattern id="p-carpet" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="#5a1f2e" />
              <path d="M10 2 L18 10 L10 18 L2 10 Z" fill="none" stroke="#c9a24b" strokeOpacity="0.35" />
            </pattern>
            <pattern id="p-road" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="#2b2c30" />
              <circle cx="8" cy="12" r="0.8" fill="rgba(255,255,255,0.1)" />
              <circle cx="28" cy="30" r="0.8" fill="rgba(255,255,255,0.08)" />
            </pattern>
            <pattern id="p-snow" width="16" height="16" patternUnits="userSpaceOnUse">
              <rect width="16" height="16" fill="#d9e3ec" />
              <circle cx="4" cy="4" r="1" fill="#ffffff" />
              <circle cx="12" cy="11" r="0.8" fill="#b8c7d6" />
            </pattern>
            <pattern id="p-tile" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="#c9cfd6" />
              <path d="M0 0H20V20" fill="none" stroke="#98a1ab" />
            </pattern>
            <pattern id="p-waves" width="40" height="16" patternUnits="userSpaceOnUse">
              <path d="M0 8 Q10 2 20 8 T40 8" fill="none" stroke="rgba(180,220,255,0.28)" strokeWidth="1.5" />
              <path d="M-10 14 Q0 10 10 14 T30 14" fill="none" stroke="rgba(180,220,255,0.12)" />
            </pattern>
            <pattern id="p-lava" width="40" height="20" patternUnits="userSpaceOnUse">
              <path d="M0 10 Q10 2 20 10 T40 10" fill="none" stroke="rgba(255,200,80,0.55)" strokeWidth="2" />
            </pattern>
            <radialGradient id="g-token" cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="rgba(255,255,255,0.35)" />
              <stop offset="1" stopColor="rgba(0,0,0,0.25)" />
            </radialGradient>
            <radialGradient id="g-vignette" cx="50%" cy="50%" r="75%">
              <stop offset="0.6" stopColor="rgba(0,0,0,0)" />
              <stop offset="1" stopColor="rgba(0,0,0,0.45)" />
            </radialGradient>
            {lights.map((t) => {
              const l = PROP_LIGHT[t.icon!]!;
              return (
                <radialGradient key={t.id} id={`light-${t.id}`}>
                  <stop offset="0" stopColor={`rgba(${l.color},0.45)`} />
                  <stop offset="0.5" stopColor={`rgba(${l.color},0.15)`} />
                  <stop offset="1" stopColor={`rgba(${l.color},0)`} />
                </radialGradient>
              );
            })}
            {(['water', 'lava'] as const).map((tr) => (
              <clipPath key={tr} id={`clip-${tr}`}>
                {animated(tr).map((c) => (
                  <rect key={c.k} x={c.x * CELL} y={c.y * CELL} width={CELL} height={CELL} />
                ))}
              </clipPath>
            ))}
          </defs>
          <rect width={W} height={H} fill="#16131d" onPointerDown={onBoardDown} />
          {bg && (
            <image
              href={bg}
              width={W}
              height={H}
              preserveAspectRatio="xMidYMid slice"
              pointerEvents="none"
              data-testid="map-background"
            />
          )}

          {/* Terreno (texturas realistas; enquanto carregam, cores lisas) */}
          <g pointerEvents="none">
            {cells.map(({ k, x, y, tr }) => {
              const s = TERRAIN_STYLE[tr];
              const tk = TERRAIN_TEXTURE[tr];
              const fill = tk && tex[tk] ? `url(#tx-${tk})` : s.pattern ? `url(#${s.pattern})` : s.fill;
              return (
                <g key={k} data-terrain={tr}>
                  <rect x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill={fill} />
                  {tr === 'road' && (x + y) % 2 === 0 && (
                    <rect
                      x={x * CELL + 14}
                      y={y * CELL + 18}
                      width={12}
                      height={3}
                      rx={1}
                      fill="#d9c25a"
                      opacity="0.7"
                    />
                  )}
                  {tr === 'door' && (
                    <g filter="url(#f-shadow)">
                      <rect
                        x={x * CELL + 3}
                        y={y * CELL + 15}
                        width={CELL - 6}
                        height={10}
                        rx={2}
                        fill={tex.plank ? 'url(#tx-plank)' : '#7a5230'}
                        stroke="#3a2412"
                      />
                      <circle cx={x * CELL + CELL - 9} cy={y * CELL + 20} r={1.8} fill="#e6c87f" />
                    </g>
                  )}
                  {tr === 'wall' && (
                    <>
                      {/* topo da parede: luz de cima e borda escura; sombra projetada no chão (sul e leste) */}
                      <rect x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill="url(#g-walltop)" />
                      {!isWall(x, y - 1) && (
                        <rect
                          x={x * CELL}
                          y={y * CELL}
                          width={CELL}
                          height={3}
                          fill="rgba(255,235,200,0.22)"
                        />
                      )}
                      {!isWall(x, y + 1) && y + 1 < map.rows && (
                        <rect
                          x={x * CELL}
                          y={(y + 1) * CELL}
                          width={CELL}
                          height={CELL * 0.45}
                          fill="url(#g-shadow-s)"
                        />
                      )}
                      {!isWall(x + 1, y) && x + 1 < map.cols && (
                        <rect
                          x={(x + 1) * CELL}
                          y={y * CELL}
                          width={CELL * 0.3}
                          height={CELL}
                          fill="url(#g-shadow-e)"
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}
            {/* Água e lava se mexendo */}
            {animated('water').length > 0 && (
              <g clipPath="url(#clip-water)">
                <rect width={W} height={H} fill={tex.water ? 'url(#tx-water)' : '#173451'} />
                <rect x={-40} width={W + 80} height={H} fill="url(#p-waves)" className="animate-drift" />
                <rect width={W} height={H} fill="url(#g-depth)" />
              </g>
            )}
            {animated('lava').length > 0 && (
              <g clipPath="url(#clip-lava)">
                <rect width={W} height={H} fill={tex.lava ? 'url(#tx-lava)' : '#7a2a10'} />
                <rect width={W} height={H} fill="#ff6a1a" className="animate-pulse-soft" opacity="0.22" />
                <rect
                  x={-40}
                  width={W + 80}
                  height={H}
                  fill="url(#p-lava)"
                  className="animate-drift"
                  style={{ animationDuration: '6s' }}
                  opacity="0.5"
                />
              </g>
            )}
            {/* Copas das árvores por cima do chão, com leve balanço */}
            {cells
              .filter((c) => c.tr === 'tree')
              .map(({ k, x, y }) => {
                const v = (x * 7 + y * 3) % 3;
                const href = tex[`canopy${v}` as TextureKind];
                const size = CELL * 1.35;
                return href ? (
                  <image
                    key={`tree-${k}`}
                    href={href}
                    x={x * CELL + CELL / 2 - size / 2}
                    y={y * CELL + CELL / 2 - size / 2}
                    width={size}
                    height={size}
                    className="animate-pulse-soft"
                    style={{ animationDuration: `${3 + ((x * 7 + y * 3) % 4)}s` }}
                  />
                ) : (
                  <circle
                    key={`tree-${k}`}
                    cx={x * CELL + CELL / 2}
                    cy={y * CELL + CELL / 2}
                    r={CELL * 0.42}
                    fill="#2e6b38"
                    stroke="#173020"
                  />
                );
              })}
          </g>

          {/* Grade */}
          <g
            pointerEvents="none"
            stroke={bg ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.28)'}
            strokeWidth={1}
            display={map.gridVisible === false ? 'none' : undefined}
          >
            {Array.from({ length: map.cols + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={H} />
            ))}
            {Array.from({ length: map.rows + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * CELL} x2={W} y2={i * CELL} />
            ))}
          </g>

          {/* Objetos */}
          {props.map((t) => {
            const pos = drag?.token.id === t.id ? drag : t;
            const box = t.size * CELL;
            const canUse = usable(t) && !!onUseProp;
            const prop = PROPS[t.icon!];
            const stateLabel = propStateLabel(t.icon!, t.state);
            return (
              <g
                key={t.id}
                data-testid="map-prop"
                data-icon={t.icon}
                data-state={t.state ?? ''}
                data-label={t.label}
                data-x={pos.x}
                data-y={pos.y}
                tabIndex={canUse || canMove?.(t) ? 0 : undefined}
                role={canUse ? 'button' : undefined}
                aria-label={`${t.label}${stateLabel ? ` (${stateLabel})` : ''}${canUse ? '. Enter para usar' : ''}`}
                className={cn(
                  'outline-none transition-transform duration-300 ease-out',
                  canUse && 'cursor-pointer',
                  canMove?.(t) && 'cursor-grab',
                )}
                style={{
                  transform: `translate(${pos.x * CELL}px, ${pos.y * CELL}px)`,
                  transition: drag?.token.id === t.id ? 'none' : undefined,
                }}
                opacity={t.hidden ? 0.5 : 1}
                onPointerDown={(e) => onTokenDown(e, t)}
                onKeyDown={(e) => onTokenKey(e, t)}
                onPointerEnter={() => setHover(t.id)}
                onPointerLeave={() => setHover(null)}
              >
                <title>
                  {t.label}
                  {stateLabel ? ` — ${stateLabel}` : ''}
                  {canUse ? ' (clique para usar)' : ''}
                </title>
                <rect width={box} height={box} fill="transparent" />
                <g filter={FLAT_PROPS.includes(t.icon!) ? undefined : 'url(#f-shadow)'}>
                  <g transform={`rotate(${t.rotation} ${box / 2} ${box / 2}) scale(${box / 100})`}>
                    <PropArt kind={t.icon!} state={t.state} />
                  </g>
                </g>
                {(hover === t.id || selectedTokenId === t.id) && (
                  <rect
                    x={1}
                    y={1}
                    width={box - 2}
                    height={box - 2}
                    rx={6}
                    fill="none"
                    stroke={canUse ? '#7dd3fc' : '#e6c87f'}
                    strokeDasharray="4 3"
                    strokeOpacity="0.8"
                  />
                )}
                {hover === t.id && (
                  <text
                    x={box / 2}
                    y={-4}
                    textAnchor="middle"
                    fontSize={11}
                    fill="white"
                    stroke="black"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {prop?.label ?? t.label}
                    {stateLabel ? ` · ${stateLabel}` : ''}
                  </text>
                )}
              </g>
            );
          })}

          {/* Luz das tochas, fogueiras e postes */}
          <g pointerEvents="none" style={{ mixBlendMode: 'screen' }}>
            {lights.map((t) => {
              const l = PROP_LIGHT[t.icon!]!;
              const c = (t.size * CELL) / 2;
              return (
                <circle
                  key={t.id}
                  cx={t.x * CELL + c}
                  cy={t.y * CELL + c}
                  r={l.radius * CELL}
                  fill={`url(#light-${t.id})`}
                  className={t.icon === 'lamp' ? undefined : 'animate-pulse-soft'}
                  style={{ animationDuration: t.icon === 'torch' || t.icon === 'campfire' ? '1.3s' : '3s' }}
                />
              );
            })}
          </g>

          {drag && !isProp(drag.token) && (
            <g pointerEvents="none">
              <line
                x1={(drag.token.x + drag.token.size / 2) * CELL}
                y1={(drag.token.y + drag.token.size / 2) * CELL}
                x2={(drag.x + drag.token.size / 2) * CELL}
                y2={(drag.y + drag.token.size / 2) * CELL}
                stroke="#e6c87f"
                strokeDasharray="6 5"
                strokeWidth={2}
              />
              <rect
                x={drag.token.x * CELL}
                y={drag.token.y * CELL}
                width={drag.token.size * CELL}
                height={drag.token.size * CELL}
                fill="none"
                stroke="#e6c87f"
                strokeOpacity={0.4}
                strokeDasharray="4 4"
              />
            </g>
          )}

          {/* Peças: personagens, NPCs e inimigos */}
          {pieces.map((t) => {
            const dragging = drag?.token.id === t.id;
            const pos = dragging ? drag : t;
            const r = (t.size * CELL) / 2;
            const selected = selectedTokenId === t.id;
            const movable = !paint && !!canMove?.(t);
            const deco = decorations?.[t.id];
            const down = deco?.health === 'down' || (deco?.hp ? deco.hp.current <= 0 : false);
            const hpPct =
              deco?.hp && deco.hp.max > 0 ? Math.max(0, Math.min(1, deco.hp.current / deco.hp.max)) : null;
            return (
              <g
                key={t.id}
                data-testid="map-token"
                data-token-id={t.id}
                data-label={t.label}
                data-x={pos.x}
                data-y={pos.y}
                data-turn={deco?.turn ? 'true' : undefined}
                tabIndex={movable ? 0 : undefined}
                role={movable ? 'button' : undefined}
                aria-label={`${t.label}${deco?.turn ? ', é a vez dele' : ''}${down ? ', caído' : ''}. Coluna ${pos.x + 1}, linha ${pos.y + 1}.${movable ? ' Use as setas para mover.' : ''}`}
                className={cn('outline-none', movable && 'cursor-grab', dragging && 'cursor-grabbing')}
                style={{
                  transform: `translate(${pos.x * CELL}px, ${pos.y * CELL}px)`,
                  transition: dragging ? 'none' : 'transform 0.35s cubic-bezier(0.2, 0.8, 0.3, 1)',
                }}
                opacity={t.hidden ? 0.5 : 1}
                onPointerDown={(e) => onTokenDown(e, t)}
                onKeyDown={(e) => onTokenKey(e, t)}
                onPointerEnter={() => setHover(t.id)}
                onPointerLeave={() => setHover(null)}
              >
                <title>{t.label}</title>
                {/* boneco 2D (ou cartão com o retrato), levantando ao ser arrastado */}
                <g
                  style={{
                    transform: dragging ? 'translateY(-6px) scale(1.08)' : undefined,
                    transformOrigin: 'center',
                    transformBox: 'fill-box',
                    transition: 'transform .15s',
                  }}
                >
                  <g transform={`scale(${(2 * r) / 100})`}>
                    <TokenFigure
                      token={t}
                      portrait={t.image ? urls[t.image] : undefined}
                      role={deco?.role ?? null}
                      gear={deco?.gear ?? null}
                      down={down}
                      selected={selected}
                      turn={!!deco?.turn}
                      hpPct={hpPct}
                    />
                  </g>
                  {t.hidden && (
                    <rect
                      x={1}
                      y={1}
                      width={2 * r - 2}
                      height={2 * r - 2}
                      rx={6}
                      fill="none"
                      stroke="#e6c87f"
                      strokeDasharray="4 3"
                      strokeOpacity="0.7"
                    />
                  )}
                  {!!deco?.conditions && (
                    <g transform={`translate(2, ${2 * r - 16})`}>
                      <circle cx="6" cy="6" r="6" fill="#4c23a8" stroke="#d6c4ff" />
                      <text x="6" y="9" textAnchor="middle" fontSize="8" fill="white" fontWeight={700}>
                        {deco.conditions}
                      </text>
                    </g>
                  )}
                </g>
                {/* placa de nome */}
                {(hover === t.id || selected || deco?.turn) && (
                  <text
                    x={r}
                    y={2 * r + 11}
                    textAnchor="middle"
                    fontSize={11}
                    fill="white"
                    stroke="black"
                    strokeWidth={3}
                    paintOrder="stroke"
                    pointerEvents="none"
                  >
                    {t.label}
                    {deco?.hp ? ` · ${deco.hp.current}/${deco.hp.max}` : ''}
                  </text>
                )}
                {floaters
                  .filter((f) => f.tokenId === t.id)
                  .map((f) => (
                    <text
                      key={f.id}
                      x={r}
                      y={4}
                      textAnchor="middle"
                      fontSize={16}
                      fontWeight={800}
                      fill={f.delta < 0 ? '#ff6b6b' : '#4ade80'}
                      stroke="black"
                      strokeWidth={3}
                      paintOrder="stroke"
                      className="animate-float-up"
                      style={{ transformBox: 'fill-box' }}
                      data-testid="hp-floater"
                    >
                      {f.delta > 0 ? `+${f.delta}` : f.delta}
                    </text>
                  ))}
              </g>
            );
          })}
          <rect width={W} height={H} fill="url(#g-vignette)" pointerEvents="none" />
        </svg>
        {dropOver && (
          <div
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-gold bg-bg/55"
            data-testid="drop-overlay"
          >
            <p className="rounded-lg bg-bg/90 px-4 py-2 text-sm text-gold-bright shadow-xl">
              {dropHint?.(dropOver.target) ??
                (dropOver.target
                  ? `Soltar para pôr a imagem em ${dropOver.target.label}`
                  : 'Soltar para usar como fundo do mapa')}
            </p>
          </div>
        )}
        {drag && !isProp(drag.token) && (
          <div
            className="pointer-events-none absolute left-3 top-3 rounded-md border border-gold/40 bg-bg/90 px-3 py-1.5 text-xs text-gold-bright"
            data-testid="distance"
          >
            {formatDistance(gridDistance(drag.token, drag), map.cellLabel)}
          </div>
        )}
      </div>
      {onZoomChange && (
        <div className="absolute bottom-3 right-3 z-10 flex gap-1.5">
          <button
            type="button"
            onClick={() => onZoomChange(clampZoom(zoom - 0.25))}
            aria-label="Diminuir o mapa"
            className="rounded-md border border-line bg-bg/85 px-2.5 py-1.5 text-sm text-ink-muted backdrop-blur hover:text-ink"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(clampZoom(zoom + 0.25))}
            aria-label="Aumentar o mapa"
            className="rounded-md border border-line bg-bg/85 px-2.5 py-1.5 text-sm text-ink-muted backdrop-blur hover:text-ink"
          >
            +
          </button>
          <button
            type="button"
            onClick={fit}
            className="rounded-md border border-line bg-bg/85 px-2.5 py-1.5 text-xs text-ink-muted backdrop-blur hover:text-ink"
            data-testid="map-fit"
          >
            Ajustar à tela
          </button>
          <button
            type="button"
            onClick={toggleFull}
            className="rounded-md border border-gold/40 bg-bg/85 px-2.5 py-1.5 text-xs text-gold-bright backdrop-blur hover:border-gold"
            data-testid="map-fullscreen"
            aria-pressed={full}
          >
            {full ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
        </div>
      )}
    </div>
  );
}
