#!/usr/bin/env python3
# Odyssée — PixelForge / panneaux : panneaux en bois dessinés au pixel (même densité que le décor : 32 px par case).
#
#   python3 tools/pixelforge/panneaux.py out/            → sign.png (26 × 36, remplace odyssee/img/nature/sign.png),
#                                                        sign_petit.png, sign_fleche.png, panneaux_apercu.png
# Lumière en haut à gauche, contour sombre, planches veinées, clous, inscriptions peintes (illisibles à cette taille,
# comme sur DS : on lit le texte dans la boîte de dialogue).
import os, sys
import numpy as np
from PIL import Image

P = {'.': None, 'o': '#2e1c12', 'd': '#5a3a22', 'm': '#7e5430', 'w': '#a0703e', 'l': '#c48e52', 'h': '#e2b474',
     'i': '#3e2414', 'n': '#d8d0c0', 'g': '#4e8a3c', 'G': '#6cb850'}

def rgba(c): return (0, 0, 0, 0) if c is None else tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)

class Toile:
    def __init__(self, w, h): self.w, self.h = w, h; self.a = np.full((h, w), '.', dtype='<U1')
    def p(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h: self.a[y, x] = c
    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.p(x, y, c)
    def image(self):
        im = Image.new('RGBA', (self.w, self.h))
        im.putdata([rgba(P[c]) for c in self.a.flatten()]); return im

def poteau(T, x, y0, y1):
    """poteau de 3 px : arête claire, cœur, ombre ; contour ; pied enfoncé"""
    T.rect(x - 1, y0, x + 3, y1, 'o')
    for y in range(y0, y1):
        T.p(x, y, 'l'); T.p(x + 1, y, 'w'); T.p(x + 2, y, 'd')
        if y % 5 == 3: T.p(x + 1, y, 'm')
    T.rect(x - 2, y1, x + 4, y1, 'o')

def planche(T, x0, y0, x1, y1, rng, lignes=3, fleche=False):
    """planche encadrée : cadre (biseau clair en haut / gauche, sombre en bas / droite), deux lames veinées, inscriptions"""
    T.rect(x0, y0, x1, y1, 'o')
    T.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 'm')                       # cadre
    for x in range(x0 + 1, x1): T.p(x, y0 + 1, 'h')
    for y in range(y0 + 1, y1): T.p(x0 + 1, y, 'l')
    for x in range(x0 + 1, x1): T.p(x, y1 - 1, 'd')
    for y in range(y0 + 2, y1): T.p(x1 - 1, y, 'd')
    ix0, iy0, ix1, iy1 = x0 + 2, y0 + 2, x1 - 2, y1 - 2               # panneau intérieur
    T.rect(ix0, iy0, ix1, iy1, 'w')
    mid = (iy0 + iy1) // 2
    for x in range(ix0, ix1 + 1): T.p(x, mid, 'm')                    # joint entre les deux lames
    for x in range(ix0, ix1 + 1): T.p(x, mid + 1, 'l')
    # lignes d'inscriptions : une ligne de titre (2 px, centrée) puis du texte fin, jamais sur le joint des lames
    free = [y for y in range(iy0 + 2, iy1 - 1) if y not in (mid - 1, mid, mid + 1, mid + 2)]
    rows = []
    for y in free:
        if not rows or y - rows[-1] >= 3: rows.append(y)
    rows = rows[:lignes]
    for r, y in enumerate(rows):
        x0t, x1t = ix0 + 2, ix1 - (6 if fleche and r == 0 else 2)
        if r == 0:                                                      # titre centré, plus gras
            wv = (x1t - x0t) * 2 // 3; xs = x0t + ((x1t - x0t) - wv) // 2
            x = xs
            while x < xs + wv:
                mot = int(rng.integers(2, 5))
                for k in range(min(mot, xs + wv - x)):
                    T.p(x + k, y, 'i'); T.p(x + k, y - 1, 'i' if rng.random() < 0.6 else 'w')
                x += mot + 1
        else:
            x = x0t
            while x < x1t - 1:
                mot = int(rng.integers(2, 5))
                for k in range(min(mot, x1t - x)):
                    T.p(x + k, y, 'i')
                    if rng.random() < 0.2: T.p(x + k, y - 1, 'i')
                x += mot + 2
    used = set(rows) | {y - 1 for y in rows}
    for _ in range((ix1 - ix0) // 3):                                    # veinage : longs fils fins, hors du texte
        y = int(rng.integers(iy0, iy1 + 1))
        if y in used or y in (mid, mid + 1): continue
        x = int(rng.integers(ix0, ix1 - 3)); L = int(rng.integers(3, 9))
        for k in range(L):
            if x + k <= ix1 and T.a[y, x + k] == 'w': T.p(x + k, y, 'm')
    if fleche:
        y = rows[0]; xa = ix1 - 4
        for k in range(4): T.p(xa + k, y, 'i')
        T.p(xa + 2, y - 1, 'i'); T.p(xa + 2, y + 1, 'i')
    for (x, y) in ((x0 + 2, y0 + 2), (x1 - 2, y0 + 2), (x0 + 2, y1 - 2), (x1 - 2, y1 - 2)): T.p(x, y, 'n')   # clous

def herbe_pied(T, xs, y):
    for x in xs:
        T.p(x, y, 'g'); T.p(x, y - 1, 'G')

def panneau_route(seed=3):
    rng = np.random.default_rng(seed); T = Toile(26, 36)
    poteau(T, 5, 18, 34); poteau(T, 18, 18, 34)
    planche(T, 0, 3, 25, 21, rng, lignes=3)
    herbe_pied(T, (3, 9, 16, 22), 34)
    return T.image()

def panneau_petit(seed=5):
    rng = np.random.default_rng(seed); T = Toile(20, 30)
    poteau(T, 8, 14, 28)
    planche(T, 1, 2, 18, 16, rng, lignes=2)
    herbe_pied(T, (6, 12), 28)
    return T.image()

def panneau_fleche(seed=7):
    rng = np.random.default_rng(seed); T = Toile(30, 34)
    poteau(T, 7, 16, 32)
    planche(T, 0, 3, 24, 17, rng, lignes=2, fleche=True)
    # pointe de flèche à droite : triangle plein, contour, biseau clair en haut
    x1, y0b, y1b = 24, 3, 17; cyb = (y0b + y1b) / 2; L = 6
    for x in range(x1, x1 + L + 1):
        half = (y1b - y0b) / 2 * (1 - (x - x1) / (L + 0.5))
        top, bot = int(round(cyb - half)), int(round(cyb + half))
        for y in range(top, bot + 1):
            T.p(x, y, 'o' if y in (top, bot) or x == x1 + L else 'h' if y == top + 1 else 'd' if y == bot - 1 else 'w')
    for y in range(y0b + 2, y1b - 1): T.p(x1, y, 'w') if T.a[y, x1] in ('o', 'd') else None
    T.p(x1, y0b + 1, 'h'); T.p(x1, y1b - 1, 'd')
    herbe_pied(T, (5, 11), 32)
    return T.image()

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    ims = {'sign': panneau_route(), 'sign_petit': panneau_petit(), 'sign_fleche': panneau_fleche()}
    for k, im in ims.items(): im.save(os.path.join(out, k + '.png'))
    z = 8; W = sum(im.width * z + 24 for im in ims.values()); H = max(im.height for im in ims.values()) * z + 24
    sheet = Image.new('RGBA', (W, H), (116, 196, 96, 255)); x = 12
    for im in ims.values():
        big = im.resize((im.width * z, im.height * z), Image.NEAREST); sheet.alpha_composite(big, (x, 12)); x += big.width + 24
    sheet.save(os.path.join(out, 'panneaux_apercu.png'))
    print('ok', ', '.join(f'{k} {im.size}' for k, im in ims.items()))
