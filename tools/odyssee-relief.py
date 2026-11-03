#!/usr/bin/env python3
"""Roches et sols des grottes d'Odyssée → odyssee/img/relief.png.

Source : assets/graphics/relief/grotte_terre.png (PixelLab, 16 tuiles de 32 px côte à côte, roche brune).
Le liseré sombre que PixelLab met autour de chaque tuile est effacé (on recopie la rangée voisine), puis la planche
est recolorée pour chaque biome (terre, montagne, mer, magma, glace, lune). Une rangée par biome, colonnes :
sols s0 à s3, faces de paroi w0 à w2, dessus des gradins t0 et t1, dessus au bord d'une paroi r0 (voir RELIEF dans odyssee/js/render/textures.js).

    python3 tools/odyssee-relief.py
"""
import colorsys, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/graphics/relief/grotte_terre.png')
OUT = os.path.join(ROOT, 'odyssee/img/relief.png')
COLS = [0, 3, 1, 2, 4, 13, 5, 12, 14]          # s0 s1 s2 s3 | w0 w1 w2 | t0 t1 | (r0 : liseré, calculé)
BIOMES = ['terre', 'montagne', 'mer', 'magma', 'glace', 'lune']
# (teinte en degrés ou None = garder, saturation ×, luminosité ×)
RECOLOR = {'terre': (None, 1, 1), 'montagne': (35, 0.32, 1.08), 'mer': (195, 0.42, 0.92), 'magma': (6, 0.75, 0.62),
           'glace': (205, 0.30, 1.42), 'lune': (265, 0.30, 0.95)}


def unborder(t):
    t = t.copy(); t[0] = t[1]; t[-1] = t[-2]; t[:, 0] = t[:, 1]; t[:, -1] = t[:, -2]; return t


def blur(t, r=5):
    """flou en boucle (la tuile est vue comme répétée) : la lumière d'ensemble, sans les détails"""
    acc = np.zeros_like(t, dtype=float); n = 0
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            acc += np.roll(np.roll(t, dy, 0), dx, 1); n += 1
    return acc / n


def flatten(t, base, gain=1.0, seuil=10):
    """même teinte partout (base) et seulement les détails de la tuile (cailloux, fissures) : les sols se raccordent
    sans quadrillage ; les pixels proches de la teinte locale deviennent la teinte de base, pas un dégradé"""
    rgb = t[..., :3].astype(float)
    d = rgb - blur(rgb, 3)
    det = np.abs(d).max(axis=2) > seuil
    out = t.copy(); px = np.array(base, float)[None, None, :].repeat(32, 0).repeat(32, 1)
    px[det] = np.clip(np.array(base) + d[det] * gain, 0, 255)
    out[..., :3] = px.round()
    return out


def rim(top, face):
    """dessus d'un gradin au bord de la paroi : liseré clair (roche usée) puis ombre, sur les 4 rangées du bas"""
    t = top.copy().astype(float)
    hi = np.clip(face[..., :3].astype(float).mean(axis=(0, 1)) * 1.55 + 18, 0, 255)
    for x in range(32):
        k = 3 if (x * 7 + (x // 5) * 3) % 9 else 2
        t[32 - k - 1, x, :3] = hi * 0.92
        for y in range(32 - k, 32): t[y, x, :3] = hi if y == 32 - k else hi * 0.78
    t[..., 3] = 255
    return t.round().astype(np.uint8)


def recolor(t, hue, sat, val):
    out = t.copy()
    h, w = t.shape[:2]
    for y in range(h):
        for x in range(w):
            r, g, b = t[y, x, :3] / 255
            H, S, V = colorsys.rgb_to_hsv(r, g, b)
            if hue is not None: H = hue / 360
            S = min(1, S * sat); V = min(1, V * val)
            out[y, x, :3] = np.round(np.array(colorsys.hsv_to_rgb(H, S, V)) * 255)
    return out


def main():
    a = np.array(Image.open(SRC).convert('RGBA'))
    tiles = [unborder(a[:, i * 32:i * 32 + 32]) for i in COLS]
    # sols : même lumière d'ensemble ; dessus des gradins : un peu plus sombres que le sol, rugueux
    floor = np.mean([t[..., :3].astype(float).mean(axis=(0, 1)) for t in tiles[:4]], axis=0)
    tiles[:4] = [flatten(t, floor, 0.9) for t in tiles[:4]]
    tops = [flatten(t, floor * 0.80, 0.75) for t in tiles[7:9]]
    tiles[7:9] = tops
    tiles.append(rim(tops[0], tiles[4]))
    sheet = np.zeros((32 * len(BIOMES), 32 * len(tiles), 4), np.uint8)
    for j, b in enumerate(BIOMES):
        for i, t in enumerate(tiles):
            sheet[j * 32:j * 32 + 32, i * 32:i * 32 + 32] = recolor(t, *RECOLOR[b])
    Image.fromarray(sheet).save(OUT, optimize=True)
    print('relief :', OUT, sheet.shape[1], '×', sheet.shape[0])


if __name__ == '__main__':
    main()
