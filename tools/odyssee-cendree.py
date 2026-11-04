#!/usr/bin/env python3
"""tools/odyssee-cendree.py — décor de la Tour Cendrée, dessiné pixel par pixel (densité 2 : un pixel du dessin = un
pixel de l'écran, une case = 32 px), lumière en haut à gauche, contour sombre : bois brûlé, cendre, suie.
  python3 tools/odyssee-cendree.py   → odyssee/img/nature/{souche_brulee,pilier_brule,poutre_brulee,gravats}.png"""
import os, math, random
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'odyssee', 'img', 'nature')
# bois carbonisé : du noir au brun roussi, quelques braises éteintes
CHAR = ['#120c09', '#1f1611', '#2f231b', '#433227', '#5a4434', '#77593f']
CENDRE = ['#3c3734', '#57504b', '#746c66', '#958c84', '#b6aea4']
ROUX = ['#5a2a14', '#7a3a1c', '#9a5228']
VERT = ['#2e5a24', '#43802f', '#62a83e', '#8acc58']

def img(w, h): return Image.new('RGBA', (w, h), (0, 0, 0, 0))
def hexa(c): return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
def px(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height: im.putpixel((x, y), hexa(c))
def contour(im, col='#0a0705'):
    """contour d'un pixel autour de la silhouette"""
    w, h = im.size; a = im.load(); pts = []
    for y in range(h):
        for x in range(w):
            if a[x, y][3]: continue
            if any(0 <= x + dx < w and 0 <= y + dy < h and a[x + dx, y + dy][3] and a[x + dx, y + dy] != hexa(col) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): pts.append((x, y))
    for x, y in pts: px(im, x, y, col)

def bois_brule(im, x, y, lum, rnd, fente=0.0):
    """un pixel de bois carbonisé : lum 0..1 (éclairage), craquelures en écailles (le « croco » du bois brûlé)"""
    k = 1 + lum * 3.2 + (rnd.random() - 0.5) * 0.9
    if fente and rnd.random() < fente: k = 0.4
    c = CHAR[max(0, min(5, int(k)))]
    if rnd.random() < 0.025: c = ROUX[rnd.randrange(2)]
    px(im, x, y, c)

def souche_brulee():
    """souche calcinée : tronc court au sommet déchiqueté, écorce en écailles, deux pousses vertes au pied"""
    rnd = random.Random(5); im = img(30, 32)
    cx, r = 15, 9
    top = [20 - int(6 * abs(math.sin(i * 0.9 + 1)) + rnd.randint(0, 3)) for i in range(2 * r + 1)]
    for i, x in enumerate(range(cx - r, cx + r + 1)):
        for y in range(top[i] - 6, 29):
            u = (x - cx) / r
            if y < top[i] - 6 + 0: continue
            if y >= top[i]: lum = 0.75 - u * 0.45 - (0.25 if y > 25 else 0)
            else: continue
            bois_brule(im, x, y, max(0, lum), rnd, fente=0.08 if (y + x * 3) % 7 == 0 else 0)
        # dessus fendu : le cœur du bois, plus clair (roussi)
        px(im, x, top[i], ROUX[2] if abs(x - cx) < r - 2 and rnd.random() < 0.7 else CHAR[4])
    # racines
    for sx, dx in ((cx - r - 1, -1), (cx + r + 1, 1)):
        for k in range(4): px(im, sx + dx * k // 2, 27 + k // 2, CHAR[2]); px(im, sx + dx * k // 2, 28 + k // 2, CHAR[1])
    # cendre au pied
    for x in range(3, 27):
        if rnd.random() < 0.6: px(im, x, 30, CENDRE[rnd.randrange(1, 4)])
        if rnd.random() < 0.3: px(im, x, 29, CENDRE[rnd.randrange(2, 5)])
    # pousses
    for bx in (5, 24):
        for k in range(5): px(im, bx + (k % 2), 29 - k, VERT[1 + (k > 2)])
        px(im, bx - 1, 26, VERT[2]); px(im, bx + 2, 25, VERT[3])
    contour(im); return im

def pilier_brule():
    """pilier de bois calciné, cassé net en haut (éclats), un bout de poutre qui pend, bague de fer noircie"""
    rnd = random.Random(9); im = img(28, 76)
    x0, x1 = 7, 20
    tops = [8 + int(5 * abs(math.sin(i * 1.3))) + rnd.randint(0, 3) for i in range(x1 - x0 + 1)]
    for i, x in enumerate(range(x0, x1 + 1)):
        u = (x - x0) / (x1 - x0)
        lum = 0.95 - u * 0.9 if u > 0.15 else 0.6
        for y in range(tops[i], 72):
            bois_brule(im, x, y, lum - (0.2 if y > 66 else 0), rnd, fente=0.5 if (x - x0) in (4, 9) and rnd.random() < 0.6 else 0)
        px(im, x, tops[i], ROUX[1] if rnd.random() < 0.5 else CHAR[5])
    # éclats au sommet
    for x, y in ((9, 5), (9, 6), (10, 7), (15, 4), (15, 5), (16, 6), (18, 7)): px(im, x, y, CHAR[3])
    # bague de fer
    for x in range(x0, x1 + 1): px(im, x, 50, '#2a2c30'); px(im, x, 51, '#4a4e54' if x < 13 else '#34373c')
    # bout de poutre accroché, en biais
    for k in range(10):
        for t in range(4): px(im, x1 + 1 + k // 2, 20 + k + t, CHAR[3 if t == 0 else 2])
    # socle de pierre et cendre
    for x in range(4, 24):
        for y in range(70, 75):
            px(im, x, y, CENDRE[1] if y == 70 else CENDRE[0] if y == 74 else CENDRE[2] if x < 12 else CENDRE[1])
    contour(im); return im

def poutre_brulee():
    """poutre tombée en travers (deux cases) : bois carbonisé fendu, un bout calé sur des gravats, cendre autour"""
    rnd = random.Random(13); im = img(64, 34)
    # la poutre : de (4, 26) à (60, 12), section de 7 px
    for i in range(0, 58):
        cx, cy = 4 + i, 26 - i * 14 / 56
        for t in range(-3, 4):
            x, y = cx, int(round(cy + t))
            lum = 0.95 if t <= -2 else 0.6 if t <= 0 else 0.3
            bois_brule(im, x, y, lum, rnd, fente=0.5 if t == 1 and i % 9 < 5 else 0.03)
    # bout cassé (éclats clairs) à droite, bout carbonisé à gauche
    for y in range(9, 17): px(im, 61 + (y % 3 == 0), y, ROUX[2] if y % 2 else CHAR[4])
    # gravats sous le bout gauche
    for k in range(14):
        x, y = rnd.randint(1, 18), rnd.randint(25, 31)
        for dx in range(rnd.randint(2, 4)): px(im, x + dx, y, CHAR[rnd.randrange(1, 4)])
    for x in range(0, 64):
        if rnd.random() < 0.35: px(im, x, 32 - int(x / 10) % 2, CENDRE[rnd.randrange(1, 4)])
    contour(im); return im

def gravats():
    """tas de planches brûlées et de cendre"""
    rnd = random.Random(21); im = img(34, 26)
    # cendre en tas (demi-ellipse)
    for y in range(12, 25):
        for x in range(2, 32):
            if ((x - 17) / 15) ** 2 + ((y - 24) / 12) ** 2 <= 1:
                l = 1 - (y - 12) / 13 * 0.6 - (x - 2) / 30 * 0.4
                px(im, x, y, CENDRE[max(0, min(4, int(l * 4 + rnd.random() * 0.8)))])
    # planches en vrac
    for k in range(6):
        a = rnd.uniform(-0.9, 0.9); L = rnd.randint(10, 18); x0, y0 = rnd.randint(5, 18), rnd.randint(9, 19)
        for i in range(L):
            x, y = int(x0 + i * math.cos(a)), int(y0 + i * math.sin(a))
            for t in range(3): bois_brule(im, x, y + t, 0.9 - t * 0.35, rnd, fente=0.1)
    for k in range(5): px(im, rnd.randint(8, 26), rnd.randint(14, 22), ROUX[rnd.randrange(3)])
    contour(im); return im

if __name__ == '__main__':
    for nom, f in (('souche_brulee', souche_brulee), ('pilier_brule', pilier_brule), ('poutre_brulee', poutre_brulee), ('gravats', gravats)):
        f().save(os.path.join(OUT, nom + '.png')); print(nom)
