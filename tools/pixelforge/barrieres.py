#!/usr/bin/env python3
"""tools/pixelforge/barrieres.py — barrières de bois d'Odyssée, dessinées pixel par pixel (densité 2 : 32 px = une case).

Chaque pièce tient dans la case qu'elle bloque (une case de large, pieds des poteaux au bas de la case, haut sous le bord
nord) : ce que l'on voit est exactement ce qui arrête le dresseur. Les anciennes barrières faisaient deux cases de large
pour une case bloquée.

  python3 tools/pixelforge/barrieres.py            → odyssee/img/nature/barriere*.png
  python3 tools/pixelforge/barrieres.py --apercu /tmp/barrieres.png   (scène d'essai agrandie ×4)

Pièces :
  barriere      rangée est-ouest : un poteau au bord ouest de la case, deux lisses sur toute la largeur
  barriere_fin  bout est d'une rangée (ou barrière seule) : un second poteau au bord est
  barriere_v    colonne nord-sud : poteau au bas de la case, lisses qui montent jusqu'au poteau de la case du dessus
  barriere_v0   haut d'une colonne : le poteau seul
Ancrage dans le jeu (`render/world3d.js`, `BARR_POT`) : pieds à 0,94 case du bord nord ; poteaux des colonnes alignés
sur le coin de la rangée qu'elles rejoignent (bord ouest, bord est ou milieu de la case).
"""
import os, sys
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'odyssee', 'img', 'nature')
C = 32          # une case, en pixels de la planche
H = 28          # hauteur d'une barrière vue de face (pieds compris)
PH = 25         # hauteur d'un poteau
PW = 5          # largeur d'un poteau
RAILS = (19, 10)   # hauteur (au-dessus du pied) du haut de chaque lisse
RH = 4          # épaisseur d'une lisse
POT = {'g': 0, 'd': C - PW, 'c': (C - PW) // 2}   # bord gauche du poteau dans la case (ouest, est, milieu)

def hexa(c): return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
O, D, M, L, HL = (hexa(c) for c in ('#3b2314', '#6a4124', '#8d5933', '#b07a45', '#d9a86c'))
G0, G1 = (hexa(c) for c in ('#2f6b2a', '#4f9a3c'))

def h32(a, b, s=0):
    """bruit entier stable (le même dessin à chaque rendu)"""
    h = (a * 374761393 + b * 668265263 + s * 1442695041) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) / 0xffffffff

def put(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height: im.putpixel((x, y), c)

def poteau(im, x0, pied, seed=0):
    """poteau de 5 px au sommet arrondi, lumière à gauche, quelques nœuds ; une touffe d'herbe au pied"""
    top = pied - PH + 1
    for y in range(top, pied + 1):
        k = y - top
        for i in range(PW):
            if k == 0 and i in (0, PW - 1): continue
            if k == 0 or i == 0 or i == PW - 1 or y == pied: c = O
            elif i == 1: c = HL
            elif i == 2: c = L if k > 1 else HL
            else: c = D
            if c == L and h32(x0 + i, y, seed) < 0.15: c = M   # nœuds du bois
            put(im, x0 + i, y, c)
    for dx, c in ((-1, G1), (PW, G1), (1, G0), (PW - 2, G0)):
        put(im, x0 + dx, pied, c)
    put(im, x0 - 1, pied - 1, G0); put(im, x0 + PW, pied - 1, G0)

def lisse(im, x0, x1, y0, seed=0):
    """lisse horizontale (posée devant les poteaux) : arête claire, ventre sombre, veinage"""
    for x in range(x0, x1 + 1):
        for k, c in enumerate((O, HL, D, O)):
            if c == HL and h32(x // 3, 1, seed) < 0.22: c = L
            put(im, x, y0 + k, c)

def rangee(fin=False):
    im = Image.new('RGBA', (C, H), (0, 0, 0, 0))
    pied = H - 1
    poteau(im, POT['g'], pied, 1)
    if fin: poteau(im, POT['d'], pied, 2)
    for i, h in enumerate(RAILS): lisse(im, 0, C - 1, pied - h, 3 + i)
    # clous : un point sombre là où chaque lisse croise un poteau
    for h in RAILS:
        put(im, POT['g'] + 2, pied - h + 1, D)
        if fin: put(im, POT['d'] + 2, pied - h + 1, D)
    return im

def colonne(haut=True):
    """colonne nord-sud vue de la caméra : le poteau, et les lisses fixées sur sa face est qui filent vers le nord
    (à l'écran, elles montent d'une case jusqu'au poteau de la case du dessus). Poteau au bord gauche de l'image."""
    w = PW + 3
    im = Image.new('RGBA', (w, H + (C if haut else 0)), (0, 0, 0, 0))
    pied = im.height - 1
    if haut:
        y0, y1 = pied - RAILS[0] - C, pied - RAILS[1] + RH - 1
        for y in range(y0, y1 + 1):
            for i, c in enumerate((HL, L, O)):
                if c == L and h32(y // 3, i, 5) < 0.25: c = M
                if y in (y0, y1): c = O
                put(im, PW - 1 + i, y, c)
        put(im, PW - 1, y0, O)
    poteau(im, 0, pied, 7)
    if haut:   # les lisses passent devant la face est du poteau
        for h in RAILS:
            for k in range(RH): put(im, PW - 1, pied - h + k, O if k in (0, RH - 1) else HL)
    return im

PIECES = {'barriere': lambda: rangee(False), 'barriere_fin': lambda: rangee(True),
          'barriere_v': lambda: colonne(True), 'barriere_v0': lambda: colonne(False)}

def cote(get, x, y):
    """une colonne s'aligne sur le poteau du coin de la rangée qu'elle rejoint : ouest, est ou milieu"""
    for s in (-1, 1):
        yy = y + s
        while get(x, yy) != '.':
            a, b = get(x + 1, yy) == 'H', get(x - 1, yy) == 'H'
            if a or b: return 'g' if a and not b else 'd' if b and not a else 'c'
            yy += s
    return 'c'

def apercu(path):
    """scène d'essai : un enclos (rangées, colonnes, coins), une colonne seule et des barrières de route"""
    cases = ['..........', '.HHHHH....', '.V...V..V.', '.V...V..V.', '.HHHHH..V.', '........V.', '...HHH.HH.', '..........']
    W, Hh = len(cases[0]), len(cases)
    im = Image.new('RGBA', (W * C, (Hh + 1) * C), hexa('#78c860'))
    for y in range(Hh + 1):
        for x in range(W):
            for i in range(C):
                im.putpixel((x * C + i, y * C), hexa('#6ab854')); im.putpixel((x * C, y * C + i), hexa('#6ab854'))
    sp = {k: f() for k, f in PIECES.items()}
    get = lambda x, y: cases[y][x] if 0 <= y < Hh and 0 <= x < W else '.'
    for y in range(Hh):
        for x in range(W):
            t = get(x, y)
            if t == '.': continue
            if t == 'H': s, ox = sp['barriere_fin' if get(x + 1, y) != 'H' else 'barriere'], 0
            else: s, ox = sp['barriere_v' if get(x, y - 1) != '.' else 'barriere_v0'], POT[cote(get, x, y)]
            pied = int((y + 0.94) * C)
            im.alpha_composite(s, (x * C + ox, pied - s.height + 1))
    im.resize((im.width * 4, im.height * 4), Image.NEAREST).save(path)

if __name__ == '__main__':
    if '--apercu' in sys.argv:
        apercu(sys.argv[sys.argv.index('--apercu') + 1]); sys.exit()
    os.makedirs(OUT, exist_ok=True)
    for k, f in PIECES.items():
        f().save(os.path.join(OUT, k + '.png')); print(k)
