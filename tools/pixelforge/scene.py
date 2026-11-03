#!/usr/bin/env python3
# Odyssée — PixelForge : assemble des tuiles PNG en scène de contrôle, par couches (alpha respecté).
#
#   python3 tools/pixelforge/scene.py tools/pixelforge/tiles/lac.scene --tiles out --out out/lac.png --zoom 4
#
# Format .scene :
#   tile 32                       taille d'une case
#   layer                         chaque bloc « layer » est posé par-dessus le précédent
#     eau eau eau eau             une ligne de noms de tuiles (- = rien)
#     ...
import os, sys
from PIL import Image

def parse(path):
    size, layers, cur = 32, [], None
    for ln in open(path, encoding='utf-8'):
        s = ln.strip()
        if not s or s.startswith('#'): continue
        if s.startswith('tile '): size = int(s.split()[1]); continue
        if s == 'layer': cur = []; layers.append(cur); continue
        cur.append(s.split())
    return size, layers

if __name__ == '__main__':
    a = sys.argv[1:]
    path = a[0]; tiles = 'out'; out = 'scene.png'; zoom = 4
    for i, x in enumerate(a):
        if x == '--tiles': tiles = a[i + 1]
        if x == '--out': out = a[i + 1]
        if x == '--zoom': zoom = int(a[i + 1])
    T, layers = parse(path)
    h = max(len(l) for l in layers); w = max(len(r) for l in layers for r in l)
    im = Image.new('RGBA', (w * T, h * T), (0, 0, 0, 0))
    cache = {}
    for layer in layers:
        for y, row in enumerate(layer):
            for x, name in enumerate(row):
                if name == '-': continue
                if name not in cache: cache[name] = Image.open(os.path.join(tiles, name + '.png')).convert('RGBA')
                im.alpha_composite(cache[name], (x * T, y * T))
    im.save(out)
    if zoom > 1:
        im.resize((im.width * zoom, im.height * zoom), Image.NEAREST).save(os.path.splitext(out)[0] + f'_x{zoom}.png')
    print(f'{out} : {w}x{h} cases, {len(layers)} couches')
