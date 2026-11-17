'use client';

import { gridDistance, type MapDto, type Terrain, type TokenDto } from '@rpg-ai/shared';
import { cn } from '@rpg-ai/ui';
import { useCallback, useRef, useState } from 'react';

export const CELL = 40;

export const TERRAIN_STYLE: Record<
  Terrain,
  { fill: string; stroke?: string; pattern?: 'dots' | 'waves' | 'tree' | 'door' }
> = {
  floor: { fill: '#2a2433' },
  wall: { fill: '#0c0a10', stroke: '#5c4a2a' },
  door: { fill: '#3a2a18', pattern: 'door' },
  water: { fill: '#173451', pattern: 'waves' },
  grass: { fill: '#1f3a25', pattern: 'dots' },
  sand: { fill: '#5a4a2e', pattern: 'dots' },
  rock: { fill: '#38343f' },
  lava: { fill: '#6e2410', pattern: 'waves' },
  tree: { fill: '#1f3a25', pattern: 'tree' },
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
  zoom?: number;
  className?: string;
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function MapCanvas({
  map,
  canMove,
  onMove,
  paint,
  onCellClick,
  selectedTokenId,
  onSelectToken,
  zoom = 1,
  className,
}: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{
    token: TokenDto;
    x: number;
    y: number;
    offX: number;
    offY: number;
  } | null>(null);
  const [painting, setPainting] = useState<Map<string, { x: number; y: number }> | null>(null);

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
    if (paint || !canMove?.(t)) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const { fx, fy } = toCell(e);
    setDrag({ token: t, x: t.x, y: t.y, offX: fx - t.x, offY: fy - t.y });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (drag) {
      const { fx, fy } = toCell(e);
      const p = clampPos(drag.token, fx - drag.offX, fy - drag.offY);
      if (p.x !== drag.x || p.y !== drag.y) setDrag({ ...drag, ...p });
    } else if (painting) {
      const { fx, fy } = toCell(e);
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      if (x >= 0 && y >= 0 && x < map.cols && y < map.rows && !painting.has(`${x},${y}`))
        setPainting(new Map(painting).set(`${x},${y}`, { x, y }));
    }
  }

  function onPointerUp() {
    if (drag) {
      if (drag.x !== drag.token.x || drag.y !== drag.token.y) onMove?.(drag.token, drag.x, drag.y);
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
    if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return;
    if (paint) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setPainting(new Map([[`${x},${y}`, { x, y }]]));
    } else onCellClick?.(x, y);
  }

  const terrain = { ...map.terrain };
  if (painting && paint)
    for (const k of painting.keys()) {
      if (paint.terrain) terrain[k] = paint.terrain;
      else delete terrain[k];
    }

  const W = map.cols * CELL;
  const H = map.rows * CELL;

  return (
    <div className={cn('relative overflow-auto rounded-xl border border-line bg-[#0d0b12]', className)}>
      <svg
        ref={svgRef}
        data-testid="map-canvas"
        viewBox={`0 0 ${W} ${H}`}
        width={W * zoom}
        height={H * zoom}
        className={cn(
          'block touch-none select-none',
          paint ? 'cursor-crosshair' : onCellClick ? 'cursor-pointer' : '',
        )}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="p-dots" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1" fill="rgba(255,255,255,0.08)" />
          </pattern>
          <pattern id="p-waves" width="20" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 6 Q5 2 10 6 T20 6" fill="none" stroke="rgba(255,255,255,0.12)" />
          </pattern>
          <radialGradient id="g-token" cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.25)" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="#16131d" onPointerDown={onBoardDown} />
        {Object.entries(terrain).map(([k, tr]) => {
          const [x, y] = k.split(',').map(Number) as [number, number];
          if (x >= map.cols || y >= map.rows) return null;
          const s = TERRAIN_STYLE[tr];
          if (!s) return null;
          return (
            <g key={k} pointerEvents="none" data-terrain={tr}>
              <rect
                x={x * CELL}
                y={y * CELL}
                width={CELL}
                height={CELL}
                fill={s.fill}
                stroke={s.stroke}
                strokeWidth={s.stroke ? 1.5 : 0}
              />
              {s.pattern === 'dots' && (
                <rect x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill="url(#p-dots)" />
              )}
              {s.pattern === 'waves' && (
                <rect x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill="url(#p-waves)" />
              )}
              {s.pattern === 'tree' && (
                <circle
                  cx={x * CELL + CELL / 2}
                  cy={y * CELL + CELL / 2}
                  r={CELL * 0.34}
                  fill="#2e5a34"
                  stroke="#173020"
                />
              )}
              {s.pattern === 'door' && (
                <rect x={x * CELL + 6} y={y * CELL + 16} width={CELL - 12} height={8} rx={2} fill="#a07a3a" />
              )}
            </g>
          );
        })}
        <g pointerEvents="none" stroke="rgba(201,162,75,0.12)" strokeWidth={1}>
          {Array.from({ length: map.cols + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={H} />
          ))}
          {Array.from({ length: map.rows + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * CELL} x2={W} y2={i * CELL} />
          ))}
        </g>
        {drag && (
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
        {map.tokens.map((t) => {
          const pos = drag?.token.id === t.id ? drag : t;
          const r = (t.size * CELL) / 2;
          const cx = pos.x * CELL + r;
          const cy = pos.y * CELL + r;
          const selected = selectedTokenId === t.id;
          const movable = !paint && !!canMove?.(t);
          return (
            <g
              key={t.id}
              data-testid="map-token"
              data-label={t.label}
              data-x={pos.x}
              data-y={pos.y}
              className={cn(movable && 'cursor-grab', drag?.token.id === t.id && 'cursor-grabbing')}
              opacity={t.hidden ? 0.5 : 1}
              onPointerDown={(e) => onTokenDown(e, t)}
            >
              <title>{t.label}</title>
              <circle
                cx={cx}
                cy={cy}
                r={r - 4}
                fill={t.color}
                stroke={selected ? '#e6c87f' : t.kind === 'enemy' ? '#b4232f' : 'rgba(0,0,0,0.6)'}
                strokeWidth={selected ? 3 : 2}
                strokeDasharray={t.hidden ? '4 3' : undefined}
              />
              <circle cx={cx} cy={cy} r={r - 4} fill="url(#g-token)" pointerEvents="none" />
              <text
                x={cx}
                y={cy + 5 * t.size}
                textAnchor="middle"
                fontSize={13 * t.size}
                fontWeight={700}
                fill="white"
                pointerEvents="none"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {initials(t.label)}
              </text>
            </g>
          );
        })}
      </svg>
      {drag && (
        <div
          className="pointer-events-none absolute left-3 top-3 rounded-md border border-gold/40 bg-bg/90 px-3 py-1.5 text-xs text-gold-bright"
          data-testid="distance"
        >
          {formatDistance(gridDistance(drag.token, drag), map.cellLabel)}
        </div>
      )}
    </div>
  );
}
