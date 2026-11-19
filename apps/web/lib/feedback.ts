'use client';

/**
 * Preferências de acessibilidade, sons e avisos (toasts).
 * Tudo fica no navegador de cada pessoa (localStorage) — não vai para o servidor.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { PREFS_KEY as KEY } from './prefs-script';

// ───────────────────────── Preferências ─────────────────────────

export interface Prefs {
  text: 'normal' | 'lg' | 'xl';
  theme: 'dark' | 'light';
  contrast: 'normal' | 'high';
  motion: 'auto' | 'reduce';
  sound: boolean;
  volume: number;
}

export const DEFAULT_PREFS: Prefs = {
  text: 'normal',
  theme: 'dark',
  contrast: 'normal',
  motion: 'auto',
  sound: true,
  volume: 0.5,
};

let current: Prefs = DEFAULT_PREFS;
let loaded = false;
const prefListeners = new Set<() => void>();

function load(): Prefs {
  if (loaded || typeof window === 'undefined') return current;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    current = { ...DEFAULT_PREFS, ...raw };
  } catch {
    current = DEFAULT_PREFS;
  }
  return current;
}

function apply(p: Prefs) {
  const d = document.documentElement.dataset;
  if (p.text === 'normal') delete d.text;
  else d.text = p.text;
  if (p.theme === 'light') d.theme = 'light';
  else delete d.theme;
  if (p.contrast === 'high') d.contrast = 'high';
  else delete d.contrast;
  if (p.motion === 'reduce') d.motion = 'reduce';
  else delete d.motion;
}

export function getPrefs(): Prefs {
  return load();
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* navegador sem armazenamento: vale só nesta aba */
  }
  apply(current);
  prefListeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      prefListeners.add(cb);
      return () => prefListeners.delete(cb);
    },
    load,
    () => DEFAULT_PREFS,
  );
}

/** Movimento reduzido pelo sistema ou pela preferência. */
export function prefersLessMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return load().motion === 'reduce' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// ───────────────────────── Sons ─────────────────────────
// Sintetizados na hora (WebAudio): sem arquivos de áudio de terceiros.

export type Sound =
  'dice' | 'hit' | 'crit' | 'fail' | 'turn' | 'door' | 'notify' | 'click' | 'fire' | 'combat';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  a: AudioContext,
  out: AudioNode,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.3,
  slideTo?: number,
) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(out);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

function noise(a: AudioContext, out: AudioNode, start: number, dur: number, gain = 0.2, filterFreq = 2000) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(out);
  src.start(a.currentTime + start);
}

export function playSound(s: Sound) {
  const p = load();
  if (!p.sound || p.volume <= 0) return;
  const a = audio();
  if (!a) return;
  const out = a.createGain();
  out.gain.value = p.volume;
  out.connect(a.destination);
  switch (s) {
    case 'dice':
      for (let i = 0; i < 5; i++)
        noise(a, out, i * 0.07 + Math.random() * 0.03, 0.05, 0.35, 2500 + Math.random() * 1500);
      break;
    case 'hit':
      noise(a, out, 0, 0.15, 0.5, 700);
      tone(a, out, 160, 0, 0.18, 'triangle', 0.3, 60);
      break;
    case 'crit':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, out, f, i * 0.08, 0.3, 'triangle', 0.22));
      break;
    case 'fail':
      tone(a, out, 330, 0, 0.25, 'sawtooth', 0.12, 220);
      tone(a, out, 220, 0.22, 0.35, 'sawtooth', 0.12, 140);
      break;
    case 'turn':
      tone(a, out, 660, 0, 0.18, 'sine', 0.25);
      tone(a, out, 990, 0.14, 0.3, 'sine', 0.2);
      break;
    case 'door':
      noise(a, out, 0, 0.35, 0.18, 400);
      tone(a, out, 180, 0, 0.35, 'square', 0.04, 120);
      break;
    case 'notify':
      tone(a, out, 880, 0, 0.15, 'sine', 0.18);
      break;
    case 'click':
      tone(a, out, 1200, 0, 0.04, 'square', 0.05);
      break;
    case 'fire':
      noise(a, out, 0, 0.5, 0.2, 900);
      break;
    case 'combat':
      // tambor grave + choque de lâminas
      [0, 0.18, 0.36].forEach((t) => tone(a, out, 90, t, 0.22, 'sine', 0.5, 45));
      noise(a, out, 0.55, 0.25, 0.4, 5000);
      tone(a, out, 1400, 0.55, 0.5, 'triangle', 0.12, 1100);
      tone(a, out, 1870, 0.57, 0.45, 'triangle', 0.08, 1500);
      break;
  }
}

// ───────────────────────── Avisos (toasts) ─────────────────────────

export type ToastTone = 'info' | 'success' | 'danger' | 'arcane' | 'gold';
export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
}

let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

export function toast(title: string, opts: { body?: string; tone?: ToastTone; ms?: number } = {}): number {
  const t: Toast = { id: Date.now() + Math.random(), title, body: opts.body, tone: opts.tone ?? 'info' };
  toasts = [...toasts.slice(-3), t];
  emitToasts();
  setTimeout(() => dismissToast(t.id), opts.ms ?? 4500);
  return t.id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
}

/** Garante que as preferências salvas estão aplicadas (útil após navegação no cliente). */
export function usePrefsBootstrap() {
  const [, set] = useState(0);
  useEffect(() => {
    apply(load());
    set(1);
  }, []);
}
