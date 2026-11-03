#!/usr/bin/env python3
"""Personnages d'Odyssée dessinés à 64 px (PixelLab) → odyssee/img/chars.png.

Sources : assets/graphics/persos64/<nom>.png, planche de 4 images de marche par rangée,
rangées bas, gauche, droite, haut (ou 3 rangées bas, gauche, haut : la droite est alors le miroir de la gauche).
Dans la planche du jeu (cases de 64 × 64, d = 2) chaque personnage a une rangée de 12 cases : pour chaque
direction (bas, gauche, droite, haut) pas A, debout, pas B. Debout = image 0 de la marche, pas = images 1 et 3.
Les pieds sont posés sur le bas de la case. Les nouveaux noms prennent une rangée à la fin.

    python3 tools/odyssee-persos64.py [noms…]
"""
import json, os, re, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/graphics/persos64')
CH = os.path.join(ROOT, 'odyssee/img/chars.png')
SP = os.path.join(ROOT, 'odyssee/js/data/sprites.js')


def frames(a):
    n = a.height // 64
    fr = [[a.crop((i * 64, j * 64, i * 64 + 64, j * 64 + 64)) for i in range(4)] for j in range(n)]
    if n == 3:
        fr = [fr[0], fr[1], [f.transpose(Image.FLIP_LEFT_RIGHT) for f in fr[1]], fr[2]]
    return fr


def main(noms):
    js = open(SP).read()
    m = re.search(r'export const SPRITES = (\{.*\});', js, re.S); S = json.loads(m.group(1))
    rows = S['chars']['rows']
    sheet = Image.open(CH).convert('RGBA')
    for n in noms:
        fr = frames(Image.open(os.path.join(SRC, n + '.png')).convert('RGBA'))
        # Pieds au bas de la case : on prend le pixel le plus bas de la pose debout de face.
        ys = np.nonzero(np.array(fr[0][0])[..., 3] > 0)[0]
        dy = 63 - ys.max() if len(ys) else 0
        if n not in rows:
            rows[n] = max(rows.values()) + 1
        r = rows[n]
        if (r + 1) * 64 > sheet.height:
            big = Image.new('RGBA', (sheet.width, (r + 1) * 64)); big.paste(sheet, (0, 0)); sheet = big
        for d in range(4):
            for j, f in enumerate([fr[d][1], fr[d][0], fr[d][3]]):
                cell = Image.new('RGBA', (64, 64)); cell.alpha_composite(f.crop((0, 0, 64, 64 - dy)), (0, dy))
                sheet.paste(cell, ((d * 3 + j) * 64, r * 64))
    sheet.save(CH, optimize=True)
    js = js[:m.start(1)] + json.dumps(S, ensure_ascii=False, separators=(',', ':')) + js[m.end(1):]
    open(SP, 'w').write(js)
    print('personnages 64 px :', ', '.join(noms))


if __name__ == '__main__':
    main(sys.argv[1:] or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.png')))
