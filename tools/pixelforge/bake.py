#!/usr/bin/env python3
# Odyssée — PixelForge / bake : cuit le sol généré (terrain2) d'une carte du jeu en une texture PNG transparente
# là où le jeu garde son propre dessin (parois de grotte). Sert au test en jeu (tools/pixelforge/essai-jeu.cjs).
#
#   python3 tools/pixelforge/bake.py monde 10 140 62 250 out/monde.png
#   python3 tools/pixelforge/bake.py grotte            out/grotte.png     (carte entière)
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terrain2 as T2

GRIS = {'c0': '#262e36', 'c1': '#3a464e', 'c2': '#4e5c66', 'c3': '#61737e', 'c4': '#7a8c96', 'c5': '#98aab4'}

a = sys.argv[1:]
id = a[0]
src = f'/tmp/{id}.json'
if not os.path.exists(src): os.system(f'node {os.path.join(T2.ROOT, "tools", "pixelforge", "dump-carte.mjs")} {id} {src}')
m = json.load(open(src)); t = np.array(m['t']).reshape(m['h'], m['w'])
if len(a) >= 6: x0, y0, x1, y1 = map(int, a[1:5]); out = a[5]
else: x0, y0, x1, y1 = 0, 0, m['w'], m['h']; out = a[1]
g = t[y0:y1, x0:x1]
cv, img = T2.render(g, x0, y0, 32, 7, game_walls=True)
rgb = T2.RGB.copy()
if id in ('marees', 'tourbillons', 'sanctuaire'):          # grottes de roche grise
    for k, v in GRIS.items(): rgb[T2.IDX[k]] = [int(v[i:i + 2], 16) for i in (1, 3, 5)]
alpha = np.where(cv.px(g == T2.T['CAVEWALL']), 0, 255).astype(np.uint8)
im = np.dstack([rgb[img], alpha])
Image.fromarray(im, 'RGBA').save(out)
json.dump({'map': id, 'x0': x0, 'y0': y0, 'w': x1 - x0, 'h': y1 - y0}, open(os.path.splitext(out)[0] + '.json', 'w'))
print(f'{out} : {x1 - x0}x{y1 - y0} cases, {im.shape[1]}x{im.shape[0]} px')
