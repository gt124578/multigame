#!/usr/bin/env python3
"""tools/odyssee-mine.py — décor de la mine de Pierrefort, dessiné pixel par pixel (densité 2 : un pixel du dessin = un
pixel de l'écran, une case = 32 px), lumière en haut à gauche, contour sombre.
  python3 tools/odyssee-mine.py   → odyssee/img/nature/{wagonnet,etai,poteau,lampe_mine,minerai}.png"""
import os, random
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'odyssee', 'img', 'nature')
BOIS = ['#2a1a0e', '#4a2e18', '#6e4826', '#94683a', '#b88a52', '#d6ac70']
FER = ['#1a1c20', '#34383e', '#555b63', '#7a828c', '#a4acb6', '#cfd6de']
ROC = ['#241c16', '#3e322a', '#5a4a3e', '#786452', '#96806a', '#b49e84']

def img(w, h): return Image.new('RGBA', (w, h), (0, 0, 0, 0))
def hexa(c): return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
def rect(im, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < im.width and 0 <= y < im.height: im.putpixel((x, y), hexa(c))

def poutre_v(im, x0, y0, w, h, rnd):
    """poteau de bois vertical : veinage, arête claire à gauche, ombre à droite"""
    rect(im, x0, y0, x0 + w - 1, y0 + h - 1, BOIS[0])
    for y in range(y0 + 1, y0 + h - 1):
        for x in range(x0 + 1, x0 + w - 1):
            k = 4 if x == x0 + 1 else 2 if x == x0 + w - 2 else 3
            if rnd.random() < 0.12: k -= 1
            if (y + x * 3) % 9 == 0: k = 2
            im.putpixel((x, y), hexa(BOIS[k]))

def poutre_h(im, x0, y0, w, h, rnd):
    rect(im, x0, y0, x0 + w - 1, y0 + h - 1, BOIS[0])
    for y in range(y0 + 1, y0 + h - 1):
        for x in range(x0 + 1, x0 + w - 1):
            k = 5 if y == y0 + 1 else 2 if y == y0 + h - 2 else 3
            if rnd.random() < 0.1: k -= 1
            if (x + y * 5) % 11 == 0: k = 2
            im.putpixel((x, y), hexa(BOIS[k]))

def etai():
    """cadre d'étayage sur trois cases : deux poteaux, une traverse, des cales"""
    rnd = random.Random(4); im = img(96, 58)
    poutre_v(im, 10, 10, 8, 48, rnd); poutre_v(im, 78, 10, 8, 48, rnd)
    poutre_h(im, 4, 4, 88, 9, rnd)
    for x in (16, 74):   # cales en biais
        for i in range(8): rect(im, x + (i if x < 50 else -i), 13 + i, x + (i if x < 50 else -i) + 2, 13 + i, BOIS[3] if i % 3 else BOIS[1])
    for x in (13, 82): rect(im, x, 6, x + 1, 7, FER[4])   # clous
    return im

def poteau():
    rnd = random.Random(7); im = img(18, 58)
    poutre_v(im, 5, 6, 8, 52, rnd); poutre_h(im, 0, 2, 18, 6, rnd); rect(im, 8, 4, 9, 4, FER[4])
    return im

def wagonnet():
    """wagonnet de mine plein de minerai, vu de trois quarts"""
    im = img(40, 34)
    # caisse
    rect(im, 3, 9, 36, 26, FER[0])
    for y in range(10, 26):
        for x in range(4, 36):
            k = 3 if y < 13 else 2 if y < 23 else 1
            if x in (4, 5) or x in (34, 35): k += 1
            if x % 8 == 0: k -= 1
            im.putpixel((x, y), hexa(FER[max(0, min(5, k))]))
    rect(im, 4, 9, 35, 9, FER[5]); rect(im, 3, 17, 36, 17, FER[1])
    for x in (8, 18, 28): rect(im, x, 11, x + 1, 11, FER[4])   # rivets
    # minerai qui dépasse
    rnd = random.Random(9)
    for i in range(26):
        cx, cy = rnd.randint(6, 33), rnd.randint(3, 9); r = rnd.choice([2, 2, 3])
        c = rnd.choice([ROC[3], ROC[4], ROC[2], '#d8b040', '#7ab0d8'])
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r and y < 10: im.putpixel((x, y), hexa(c if (x - cx) + (y - cy) < 1 else ROC[1]))
    # roues
    for cx in (10, 29):
        for y in range(25, 34):
            for x in range(cx - 4, cx + 5):
                d = (x - cx) ** 2 + (y - 29) ** 2
                if d <= 16: im.putpixel((x, y), hexa(FER[0] if d > 9 else FER[2] if d > 2 else FER[4]))
    return im

def lampe():
    """lanterne de mineur accrochée à un piquet"""
    rnd = random.Random(2); im = img(16, 44)
    poutre_v(im, 6, 10, 4, 34, rnd)
    rect(im, 2, 4, 13, 4, BOIS[1]); rect(im, 3, 5, 3, 7, FER[1])
    rect(im, 0, 8, 7, 18, FER[0]); rect(im, 1, 9, 6, 17, '#ffd060'); rect(im, 2, 11, 5, 15, '#fff2b0'); rect(im, 1, 8, 6, 8, FER[3])
    return im

def minerai():
    """bloc de roche veiné de minerai (or et cristal bleu)"""
    rnd = random.Random(5); im = img(32, 28)
    for y in range(28):
        for x in range(32):
            dx, dy = (x - 15.5) / 15, (y - 16) / 11.5
            q = dx * dx + dy * dy
            if q > 1: continue
            k = 0 if q > 0.86 else 4 if dy < -0.4 and dx < 0.2 else 3 if dy < 0 else 2
            if rnd.random() < 0.08: k = max(1, k - 1)
            im.putpixel((x, y), hexa(ROC[k]))
    for cx, cy, c in [(10, 12, '#e8c040'), (19, 9, '#f6e070'), (22, 17, '#78c0f0'), (13, 19, '#e8c040'), (25, 13, '#b0e0ff')]:
        for (x, y) in [(cx, cy), (cx + 1, cy), (cx, cy + 1)]: im.putpixel((x, y), hexa(c))
        im.putpixel((cx + 1, cy + 1), hexa(ROC[1]))
    return im

if __name__ == '__main__':
    for nom, f in [('etai', etai), ('poteau', poteau), ('wagonnet', wagonnet), ('lampe_mine', lampe), ('minerai', minerai)]:
        p = os.path.join(OUT, nom + '.png'); f().save(p); print('écrit', p)
