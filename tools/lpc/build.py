"""Gera as peças de pixel art (LPC) usadas no criador de personagem.

Uso: python3 tools/lpc/build.py <pasta do repositório LPC>
Copia só a folha "walk" (4 direções x 9 quadros de 64 px) de cada peça escolhida em
catalog.py para apps/web/public/lpc/, e escreve o catálogo com paletas de cor e créditos.
"""
import json, os, shutil, sys
sys.path.insert(0, os.path.dirname(__file__))
from catalog import BODIES, CATALOG, SLOT_LABELS

src = sys.argv[1]
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out_img = os.path.join(root, 'apps/web/public/lpc')
out_manifest = os.path.join(root, 'packages/shared/src/lpc-catalog.json')
shutil.rmtree(out_img, ignore_errors=True)

palettes = {}
def palette(material):
    if material not in palettes:
        meta = json.load(open(f'{src}/palette_definitions/{material}/meta_{material}.json'))
        colors = json.load(open(f'{src}/palette_definitions/{material}/{material}_ulpc.json'))
        palettes[material] = {'base': meta['base'], 'colors': colors}
    return material

credits = {}
items = []
def add(slot, path, label):
    d = json.load(open(f'{src}/sheet_definitions/{path}'))
    rid = os.path.basename(path)[:-5]
    rec = d.get('recolors')
    recolor = None
    if rec:
        if 'material' in rec:
            recolor = [palette(rec['material'])]
        else:
            recolor = [palette(rec[k]['material']) for k in sorted(rec) if k.startswith('color_')]
    variants = [v.replace(' ', '_') for v in d.get('variants', [])] if not rec else []
    layers = []
    for k in sorted(d):
        if not k.startswith('layer_'):
            continue
        layer = d[k]
        files = {}
        for b in BODIES:
            p = layer.get(b)
            if not p:
                continue
            names = [f'{p}walk/{v}.png' for v in variants] if variants else [f'{p}walk.png']
            ok = {}
            for n in names:
                f = f'{src}/spritesheets/{n}'
                if os.path.exists(f):
                    dst = os.path.join(out_img, n)
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    shutil.copy(f, dst)
                    ok[n] = '/lpc/' + n
            if variants:
                vf = {v: ok.get(f'{p}walk/{v}.png') for v in variants}
                if any(vf.values()):
                    files[b] = {v: u for v, u in vf.items() if u}
            elif ok:
                files[b] = next(iter(ok.values()))
        if files:
            layers.append({'z': layer.get('zPos', 50), 'files': files})
    if not layers:
        print('sem imagens:', path)
        return
    for c in d.get('credits', []):
        credits[c['file']] = {'authors': c.get('authors', []), 'licenses': c.get('licenses', []), 'urls': c.get('urls', [])}
    item = {'id': rid, 'slot': slot, 'label': label, 'layers': layers}
    if recolor:
        item['recolor'] = recolor
    if variants:
        item['variants'] = sorted({v for l in layers for f in l['files'].values() for v in f})
    items.append(item)

add('body', 'body/body.json', 'Corpo')
for slot, lst in CATALOG.items():
    for path, label in lst:
        add(slot, path, label)

json.dump({'bodies': BODIES, 'slots': SLOT_LABELS, 'palettes': palettes, 'items': items},
          open(out_manifest, 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(credits, open(os.path.join(out_img, 'CREDITS.json'), 'w'), ensure_ascii=False, indent=1)
print(len(items), 'peças;', sum(1 for _ in os.scandir(out_img)), 'pastas;', os.path.getsize(out_manifest), 'bytes de catálogo')
