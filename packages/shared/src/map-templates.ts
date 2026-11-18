/**
 * Modelos de mapa prontos. Cada modelo é gerado por código (terreno + objetos),
 * sem imagens de terceiros, e o mestre pode editar tudo depois de criar.
 */

export const MAP_TEMPLATE_KEYS = [
  'abandoned_house',
  'forest_night',
  'city_street',
  'cemetery',
  'order_base',
] as const;
export type MapTemplateKey = (typeof MAP_TEMPLATE_KEYS)[number];

export interface MapTemplateProp {
  /** Chave do catálogo PROPS (porta, tocha…). */
  icon: string;
  x: number;
  y: number;
  rotation?: 0 | 90 | 180 | 270;
  state?: 'open' | 'closed' | 'on' | 'off';
}

export interface MapTemplate {
  key: MapTemplateKey;
  label: string;
  description: string;
  cols: number;
  rows: number;
  terrain: Record<string, string>;
  props: MapTemplateProp[];
}

/** Gerador pseudoaleatório fixo: o mesmo modelo sai sempre igual. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

class Builder {
  terrain: Record<string, string> = {};
  props: MapTemplateProp[] = [];
  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {}
  set(x: number, y: number, t: string) {
    if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) this.terrain[`${x},${y}`] = t;
  }
  get(x: number, y: number) {
    return this.terrain[`${x},${y}`];
  }
  fill(x0: number, y0: number, x1: number, y1: number, t: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  }
  /** Retângulo de paredes com o interior preenchido. */
  room(x0: number, y0: number, x1: number, y1: number, floor: string) {
    this.fill(x0, y0, x1, y1, 'wall');
    this.fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, floor);
  }
  /** Abre um vão na parede e coloca uma porta (objeto) nele. */
  door(x: number, y: number, floor: string, rotation: 0 | 90 = 0, state: 'open' | 'closed' = 'closed') {
    this.set(x, y, floor);
    this.prop('door', x, y, { rotation, state });
  }
  prop(
    icon: string,
    x: number,
    y: number,
    o: { rotation?: 0 | 90 | 180 | 270; state?: MapTemplateProp['state'] } = {},
  ) {
    this.props.push({ icon, x, y, ...o });
  }
}

function abandonedHouse(): MapTemplate {
  const b = new Builder(24, 16);
  const r = rng(7);
  b.fill(0, 0, 23, 15, 'grass');
  for (let i = 0; i < 40; i++) b.set(Math.floor(r() * 24), Math.floor(r() * 16), 'dirt');
  b.fill(10, 13, 12, 15, 'dirt'); // caminho até a porta
  b.room(3, 2, 20, 13, 'wood');
  b.fill(4, 3, 10, 12, 'wood');
  for (let y = 3; y <= 12; y++) b.set(11, y, 'wall'); // parede entre sala e quarto
  b.fill(13, 9, 19, 12, 'carpet');
  b.door(11, 13, 'wood'); // entrada
  b.door(11, 6, 'wood', 90, 'open');
  // sala
  b.prop('table', 6, 6);
  b.prop('chair', 5, 6, { rotation: 90 });
  b.prop('chair', 8, 7, { rotation: 270 });
  b.prop('bookshelf', 4, 3);
  b.prop('bookshelf', 5, 3);
  b.prop('lamp', 9, 4, { state: 'off' });
  b.prop('blood', 7, 10);
  b.prop('body', 8, 10);
  // quarto
  b.prop('bed', 17, 3);
  b.prop('chest', 19, 7);
  b.prop('sofa', 14, 11);
  b.prop('torch', 13, 4, { state: 'on' });
  b.prop('ritual', 15, 6, { state: 'off' });
  // lado de fora
  for (const [x, y] of [
    [1, 1],
    [22, 2],
    [1, 12],
    [22, 14],
    [0, 7],
  ] as const)
    b.set(x, y, 'tree');
  b.prop('bush', 2, 14);
  b.prop('bush', 20, 14);
  b.prop('car', 15, 14);
  return {
    key: 'abandoned_house',
    label: 'Casa abandonada',
    description: 'Sala e quarto, um corpo no chão e um círculo ritual apagado.',
    cols: 24,
    rows: 16,
    terrain: b.terrain,
    props: b.props,
  };
}

function forestNight(): MapTemplate {
  const b = new Builder(24, 16);
  const r = rng(42);
  b.fill(0, 0, 23, 15, 'grass');
  // trilha sinuosa
  let y = 8;
  for (let x = 0; x < 24; x++) {
    b.set(x, y, 'dirt');
    b.set(x, y + 1, 'dirt');
    if (r() < 0.35) y = Math.max(2, Math.min(12, y + (r() < 0.5 ? -1 : 1)));
  }
  // clareira
  for (let yy = 2; yy <= 6; yy++)
    for (let x = 14; x <= 20; x++) if ((x - 17) ** 2 + (yy - 4) ** 2 <= 8) b.set(x, yy, 'dirt');
  // árvores fora da trilha e da clareira
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * 24);
    const yy = Math.floor(r() * 16);
    if (!b.get(x, yy) || b.get(x, yy) === 'grass') b.set(x, yy, 'tree');
  }
  b.fill(2, 12, 4, 14, 'water'); // lago
  b.set(5, 13, 'water');
  b.prop('ritual', 16, 3, { state: 'on' });
  b.prop('campfire', 8, 5, { state: 'on' });
  b.prop('crate', 9, 4);
  b.prop('barrel', 7, 4);
  b.prop('boulder', 20, 11);
  b.prop('boulder', 11, 13);
  b.prop('bush', 13, 7);
  b.prop('trap', 12, 9, { state: 'on' });
  b.prop('axe', 9, 6);
  return {
    key: 'forest_night',
    label: 'Floresta à noite',
    description: 'Trilha entre árvores, acampamento com fogueira e um ritual aceso na clareira.',
    cols: 24,
    rows: 16,
    terrain: b.terrain,
    props: b.props,
  };
}

function cityStreet(): MapTemplate {
  const b = new Builder(24, 16);
  b.fill(0, 6, 23, 9, 'road');
  b.fill(0, 5, 23, 5, 'stone');
  b.fill(0, 10, 23, 10, 'stone');
  // prédios em cima
  b.room(1, 0, 9, 4, 'tile');
  b.room(11, 0, 22, 4, 'wood');
  b.door(5, 4, 'tile');
  b.door(16, 4, 'wood');
  // prédios embaixo
  b.room(1, 11, 12, 15, 'wood');
  b.room(14, 11, 22, 15, 'stone');
  b.door(6, 11, 'wood');
  b.door(18, 11, 'stone', 0, 'open');
  b.prop('table', 3, 1);
  b.prop('computer', 7, 2, { state: 'on' });
  b.prop('bookshelf', 13, 1);
  b.prop('sofa', 18, 1);
  b.prop('table', 3, 12);
  b.prop('chair', 2, 13);
  b.prop('crate', 16, 13);
  b.prop('barrel', 20, 13);
  b.prop('lamp', 3, 5, { state: 'on' });
  b.prop('lamp', 12, 5, { state: 'on' });
  b.prop('lamp', 20, 10, { state: 'off' });
  b.prop('car', 14, 6);
  b.prop('car', 3, 8, { rotation: 180 });
  b.prop('blood', 9, 7);
  b.prop('body', 10, 7);
  b.prop('pistol', 11, 8);
  return {
    key: 'city_street',
    label: 'Rua da cidade',
    description: 'Cena de crime numa rua com postes, carros e prédios de dois lados.',
    cols: 24,
    rows: 16,
    terrain: b.terrain,
    props: b.props,
  };
}

function cemetery(): MapTemplate {
  const b = new Builder(22, 16);
  const r = rng(13);
  b.fill(0, 0, 21, 15, 'grass');
  // muro de pedra em volta, com portão
  for (let x = 0; x < 22; x++) {
    b.set(x, 0, 'wall');
    b.set(x, 15, 'wall');
  }
  for (let y = 0; y < 16; y++) {
    b.set(0, y, 'wall');
    b.set(21, y, 'wall');
  }
  b.fill(10, 1, 11, 14, 'dirt');
  b.fill(1, 7, 20, 8, 'dirt');
  b.set(10, 15, 'dirt');
  b.set(11, 15, 'dirt');
  b.prop('gate', 10, 14, { state: 'closed' });
  for (const gx of [2, 4, 6, 8, 13, 15, 17, 19])
    for (const gy of [2, 4, 10, 12]) if (r() < 0.8) b.prop('grave', gx, gy);
  for (const [x, y] of [
    [1, 1],
    [20, 1],
    [1, 14],
    [20, 13],
  ] as const)
    b.set(x, y, 'tree');
  b.prop('ritual', 14, 6, { state: 'off' });
  b.prop('torch', 9, 7, { state: 'on' });
  b.prop('torch', 12, 8, { state: 'on' });
  b.prop('blood', 16, 8);
  b.prop('boulder', 3, 8);
  return {
    key: 'cemetery',
    label: 'Cemitério',
    description: 'Lápides em fileiras, muro de pedra, portão e um círculo ritual esquecido.',
    cols: 22,
    rows: 16,
    terrain: b.terrain,
    props: b.props,
  };
}

function orderBase(): MapTemplate {
  const b = new Builder(22, 14);
  b.room(0, 0, 21, 13, 'tile');
  // sala de reunião
  for (let y = 1; y <= 12; y++) b.set(10, y, 'wall');
  b.fill(11, 1, 20, 12, 'carpet');
  b.door(10, 4, 'tile', 90);
  b.door(5, 13, 'tile');
  // corredor/escritório
  b.prop('computer', 1, 1, { state: 'on' });
  b.prop('computer', 3, 1, { state: 'off' });
  b.prop('table', 2, 2);
  b.prop('chair', 1, 4);
  b.prop('bookshelf', 6, 1);
  b.prop('bookshelf', 7, 1);
  b.prop('bookshelf', 8, 1);
  b.prop('crate', 1, 11);
  b.prop('crate', 2, 11);
  b.prop('shotgun', 8, 10);
  b.prop('pistol', 9, 11);
  b.prop('knife', 8, 12);
  // reunião
  b.prop('table', 14, 5);
  b.prop('table', 16, 5);
  for (const x of [14, 15, 16, 17]) {
    b.prop('chair', x, 4);
    b.prop('chair', x, 7, { rotation: 180 });
  }
  b.prop('sofa', 18, 11);
  b.prop('lamp', 12, 2, { state: 'on' });
  b.prop('lamp', 19, 2, { state: 'on' });
  b.prop('stairs', 20, 9);
  return {
    key: 'order_base',
    label: 'Base da Ordem',
    description: 'Escritório com computadores, arsenal e uma sala de reunião.',
    cols: 22,
    rows: 14,
    terrain: b.terrain,
    props: b.props,
  };
}

const BUILDERS: Record<MapTemplateKey, () => MapTemplate> = {
  abandoned_house: abandonedHouse,
  forest_night: forestNight,
  city_street: cityStreet,
  cemetery,
  order_base: orderBase,
};

export function mapTemplate(key: MapTemplateKey): MapTemplate {
  return BUILDERS[key]();
}

export const MAP_TEMPLATES: { key: MapTemplateKey; label: string; description: string }[] =
  MAP_TEMPLATE_KEYS.map((k) => {
    const t = BUILDERS[k]();
    return { key: k, label: t.label, description: t.description };
  });
