#!/usr/bin/env python3
# Odyssée — PixelForge / donjon : décors du désert et des salles de boss, dessinés au pixel (32 px par case, lumière en haut
# à gauche, vue de trois quarts comme le reste du décor).
#
#   python3 tools/pixelforge/donjon.py [dossier]      (par défaut tools/pixelforge/donjon/)
#
# miroir_objet (icône 32 × 32), miroir_nE / miroir_nO (miroir sur pied tourné d'un quart, pour dévier un rayon),
# miroir_sol (miroir posé à plat), brasier_0..3 (grand brasier animé, 2 cases), pyramide, tombeau (grand bâtiment),
# sarcophage / sarcophage_ouvert, porte_<style> et porte_<style>_ouverte (portes de salles de boss, 2 cases de large),
# et des planches d'aperçu (planche_*.png).
import os, sys, math
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixel import Toile, rampe, hexa, nuance, bruit, bayer, planche

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'donjon')

SABLE = rampe('#3a2414', '#5e3c20', '#86582e', '#ad7a40', '#cc9a56', '#e2b872', '#f2d496', '#fbe9c0')
OR = rampe('#3e2208', '#6e420c', '#a86c14', '#d89a24', '#f2c446', '#fde58a', '#fffbe0')
LAPIS = rampe('#0c1230', '#18275e', '#24409a', '#3a64c8', '#6e96e8')
PIERRE = rampe('#1c1c26', '#32323e', '#4a4a58', '#646474', '#828292', '#a2a2b0', '#c6c6d0', '#e6e6ec')
VERRE = rampe('#1a2a44', '#2c4c74', '#46769e', '#6ea4cc', '#a6d2ec', '#dcf2fc', '#ffffff')
FEU = rampe('#4a0a04', '#8c1c06', '#c8380a', '#ec6a12', '#f8a226', '#fcd450', '#fff3a8', '#fffef0')
BOIS = rampe('#1c0e08', '#34190c', '#4e2914', '#6c3c1e', '#8a5128', '#a86a36')
FER = rampe('#14141a', '#26262e', '#3a3a44', '#55555f', '#76767f', '#9c9ca6')
OS = rampe('#2e281e', '#544a3a', '#82765c', '#ada186', '#d4cab0', '#eee8d4')
GLACE = rampe('#10284a', '#1e4a7a', '#2f72a8', '#4c9ccc', '#7cc4e4', '#b4e2f4', '#e4f8ff')
OBSI = rampe('#0c0810', '#1a121e', '#2a1e30', '#3c2c44', '#544060')
LAVE = rampe('#5a0c04', '#a42008', '#e04a0c', '#f88a1c', '#ffd04c', '#fff4b0')
ARGENT = rampe('#262a34', '#424854', '#646c7a', '#8c94a2', '#b8c0cc', '#e2e8f0', '#ffffff')
FEUILLE = rampe('#0e2010', '#1c3a1a', '#2c5a26', '#447e34', '#62a244', '#8cc45a')
OMBRE = hexa('#000000'); OMBRE[3] = 0


def trait(c): return hexa(c)


# ------------------------------------------------------------------ outils de matière

def remplir(T, masque, f):
    """applique f(x, y) -> couleur sur chaque pixel du masque (liste ou fonction)"""
    for y in range(T.h):
        for x in range(T.w):
            if masque(x, y):
                c = f(x, y)
                if c is not None: T.p(x, y, c)


def briques(T, x0, y0, x1, y1, R, h=6, l=14, graine=1, joint=1, lumiere=None):
    """appareil de pierres de taille : rangées de hauteur h, joints décalés, chaque bloc légèrement différent,
    arête claire en haut, ombre en bas ; lumiere(x, y) -> 0..1 module l'ensemble"""
    for y in range(y0, y1 + 1):
        r = (y - y0) // h; yy = (y - y0) % h
        dec = (r * l // 2 + (r * 5) % 3) % l
        for x in range(x0, x1 + 1):
            k = (x - x0 + dec) // l; xx = (x - x0 + dec) % l
            v = bruit(k, r, graine)
            base = 0.52 + (v - 0.5) * 0.2 + (bruit(x, y, graine + 7) - 0.5) * 0.03
            if lumiere: base += lumiere(x, y)
            if yy < joint: t = base - 0.32                      # joint horizontal
            elif xx < joint: t = base - 0.26                    # joint vertical
            elif yy == joint: t = base + 0.16                   # arête éclairée
            elif xx == joint: t = base + 0.08
            elif yy == h - 1: t = base - 0.1                    # bas du bloc dans l'ombre
            else: t = base
            if bruit(x, y, graine + 3) > 0.985: t -= 0.2       # éclat
            T.p(x, y, nuance(R, t, x, y))


def contour_couleur(T, c): T.contour(trait(c))


def glyphes(T, x0, y0, x1, y1, R, graine=0, fond=None):
    """une bande de hiéroglyphes stylisés (gravés : creux sombre, rebord clair en bas à droite)"""
    W = x1 - x0 + 1; n = max(1, W // 7)
    for i in range(n):
        gx = x0 + i * 7 + 1; k = int(bruit(i, y0, graine) * 8)
        motifs = [
            ['.##.', '#..#', '.##.', '..#.', '.##.'],       # ankh
            ['.#..', '.##.', '####', '.#..', '.#..'],       # oiseau
            ['#..#', '####', '#..#', '#..#', '####'],       # jarre
            ['....', '####', '#.##', '####', '....'],       # œil
            ['..#.', '.#.#', '#..#', '.#.#', '..#.'],       # serpent
            ['.#.#', '.###', '..#.', '..#.', '.###'],       # sceptre
            ['####', '#..#', '#..#', '#..#', '####'],       # cartouche
            ['.#..', '###.', '.#..', '.###', '...#'],       # homme
        ][k]
        for yy, row in enumerate(motifs):
            for xx, ch in enumerate(row):
                if ch == '#':
                    x, y = gx + xx, y0 + yy
                    if x <= x1 and y <= y1:
                        T.p(x, y, R[1]);
                        if T.get(x + 1, y + 1)[3] and motifs[min(yy + 1, 4)][min(xx + 1, 3)] != '#': T.p(x + 1, y + 1, R[-2])


# ------------------------------------------------------------------ miroirs

def miroir_objet():
    """icône d'objet : miroir à main ovale, cadre d'or, manche"""
    T = Toile(32, 32)
    cx, cy = 16, 12
    T.ellipse(cx, cy, 9, 10, OR[2])
    T.ellipse(cx, cy, 7.5, 8.5, OR[4])
    for y in range(T.h):
        for x in range(T.w):
            d = ((x + .5 - cx) / 6.5) ** 2 + ((y + .5 - cy) / 7.5) ** 2
            if d <= 1:
                t = 0.35 + 0.5 * (1 - (y - (cy - 8)) / 16) + 0.15 * ((cx - x) / 7)
                if 0 < (x - cx) + (y - cy) * 0.6 + 3 < 2.5 or 0 < (x - cx) + (y - cy) * 0.6 + 6 < 1.2: t += 0.45   # reflets
                T.p(x, y, nuance(VERRE, t, x, y))
    for y in range(cy - 9, cy + 10):                       # tranche dorée : clair à gauche, sombre à droite
        for x in range(cx - 10, cx + 10):
            d = ((x + .5 - cx) / 9) ** 2 + ((y + .5 - cy) / 10) ** 2
            d2 = ((x + .5 - cx) / 6.5) ** 2 + ((y + .5 - cy) / 7.5) ** 2
            if d <= 1 and d2 > 1:
                t = 0.55 + 0.35 * ((cx - x) / 9) * 0.6 + 0.35 * ((cy - y) / 10) * 0.6
                T.p(x, y, nuance(OR, t, x, y))
    T.p(cx, cy - 10, OR[5]); T.p(cx - 1, cy - 10, OR[4]); T.p(cx + 1, cy - 10, OR[3])  # fleuron
    T.ellipse(cx, cy - 10.5, 1.6, 1.6, OR[4])
    for y in range(cy + 10, cy + 19):                      # manche
        for x in range(cx - 2, cx + 2):
            T.p(x, y, OR[[5, 4, 3, 2][x - cx + 2]])
    T.rect(cx - 3, cy + 13, cx + 2, cy + 13, OR[2]); T.rect(cx - 3, cy + 18, cx + 2, cy + 19, OR[3])
    T.p(cx - 3, cy + 18, OR[5])
    contour_couleur(T, '#2a1606')
    return T


def miroir_pied(sens=1):
    """miroir sur pied, tourné d'un quart (sens 1 : face au nord-est « / », -1 : nord-ouest « \\ ») ; une case, 32 × 48"""
    T = Toile(32, 48)
    # socle de pierre (dalle carrée vue de trois quarts)
    T.poly([(4, 38), (28, 38), (28, 45), (4, 45)], PIERRE[3])
    T.rect(4, 34, 27, 38, PIERRE[5])
    for x in range(4, 28):
        T.p(x, 34, PIERRE[6]); T.p(x, 45, PIERRE[1])
        if x % 8 == 3: T.vline(x, 39, 44, PIERRE[2])
    T.rect(4, 39, 27, 39, PIERRE[2])
    # montants de bronze
    def panneau(sens):
        # parallélogramme : bord gauche x=7 (bas y0=33), bord droit x=24 ; le bord bas monte de 7 px vers la droite (sens 1)
        dy = 7 * sens
        bas = lambda x: 33 - (x - 7) * dy / 17 if sens > 0 else 33 - (24 - x) * (-dy) / 17
        haut = lambda x: bas(x) - 24
        return bas, haut
    bas, haut = panneau(sens)
    for x in range(7, 25):
        yb, yh = int(round(bas(x))), int(round(haut(x)))
        for y in range(yh, yb + 1):
            u = (x - 7) / 17; v = (y - yh) / max(1, yb - yh)
            if x in (7, 8, 23, 24) or y - yh < 2 or yb - y < 2:              # cadre doré
                t = 0.75 - 0.4 * u if sens > 0 else 0.35 + 0.4 * u
                if y - yh < 1: t += 0.2
                T.p(x, y, nuance(OR, t, x, y))
            else:                                                             # glace : ciel reflété, clair en haut
                t = 0.75 - 0.5 * v + (0.12 if sens > 0 else -0.05) * (1 - u)
                s = (x - 7) + (y - yh) * (0.9 * sens) if sens > 0 else (24 - x) + (y - yh) * 0.9
                if 6 < s < 8.5 or 11 < s < 12.2: t += 0.4
                T.p(x, y, nuance(VERRE, t, x, y))
    # pieds du cadre jusqu'au socle
    for x0 in (8, 23):
        yb = int(round(bas(x0)))
        for y in range(yb, 36):
            T.p(x0, y, OR[3]); T.p(x0 + 1 if x0 == 8 else x0 - 1, y, OR[2])
    # fleuron au sommet
    xm = 15; ym = int(round(haut(xm))) - 2
    T.ellipse(xm + .5, ym + .5, 2, 2, OR[4]); T.p(xm, ym - 1, OR[6])
    contour_couleur(T, '#1e140c')
    return T


def miroir_sol():
    """miroir posé à plat au sol : ovale vu en raccourci, cadre d'or, reflet du ciel ; une case, 32 × 20"""
    T = Toile(32, 20)
    cx, cy = 16, 10
    T.ellipse(cx, cy + 1, 15, 8, hexa('#000000'))       # ombre portée (remplacée par le contour)
    for y in range(T.h):
        for x in range(T.w):
            d = ((x + .5 - cx) / 14) ** 2 + ((y + .5 - cy) / 7.5) ** 2
            d2 = ((x + .5 - cx) / 11.5) ** 2 + ((y + .5 - cy) / 5.5) ** 2
            if d <= 1 and d2 > 1:
                t = 0.6 + 0.3 * (cy - y) / 7 + 0.15 * (cx - x) / 14
                T.p(x, y, nuance(OR, t, x, y))
            elif d2 <= 1:
                t = 0.62 + 0.25 * (y - cy) / 5.5 - 0.1 * (x - cx) / 11
                s = (x - cx) - (y - cy) * 1.6
                if -3 < s < -1 or 3 < s < 4: t += 0.35
                T.p(x, y, nuance(VERRE, t, x, y))
    T.rect(cx - 13, cy + 6, cx + 13, cy + 7, OR[1])  # tranche visible vers le bas
    for x in range(T.w):
        for y in range(cy + 4, T.h):
            d = ((x + .5 - cx) / 14) ** 2 + ((y + .5 - cy - 1) / 7.5) ** 2
            d0 = ((x + .5 - cx) / 14) ** 2 + ((y + .5 - cy) / 7.5) ** 2
            if d <= 1 and d0 > 1: T.p(x, y, OR[1])
    contour_couleur(T, '#2a1606')
    return T


# ------------------------------------------------------------------ grand brasier

def flamme(T, cx, base, largeur, hauteur, phase, graine=3):
    """langue de feu : silhouette pleine qui ondule et se courbe vers le haut, couleurs en bandes nettes
    (cœur presque blanc, puis jaune, orange, rouge au bord)"""
    for y in range(int(base - hauteur * 1.15), base + 1):
        v = (base - y) / hauteur
        if v < 0: continue
        c = cx + 3.2 * math.sin(phase * 2.1 + v * 4.2) * v ** 1.3        # la pointe se balance
        hw = largeur * max(0.0, 1 - v) ** 0.75 * (1 + 0.12 * math.sin(phase * 3 + v * 9))
        if v < 0.18: hw = largeur * (0.8 + v)                          # pied arrondi dans la vasque
        for x in range(int(c - hw - 1), int(c + hw + 2)):
            d = abs(x + .5 - c) / max(0.6, hw)
            if d > 1: continue
            r = d * 0.75 + v * 0.55
            k = 7 if r < 0.3 else 6 if r < 0.45 else 5 if r < 0.62 else 4 if r < 0.8 else 3 if r < 0.95 else 2
            T.p(x, y, FEU[k])
    # flammèches détachées au-dessus
    for i in range(3):
        f = (phase * 0.9 + i * 0.37) % 1
        sx = cx + (bruit(i, int(phase * 2), graine + 5) - .5) * largeur * 1.2
        sy = base - hauteur * (0.95 + f * 0.6)
        T.p(sx, sy, FEU[5]); T.p(sx, sy + 1, FEU[3])
        if f < 0.5: T.p(sx + 1, sy, FEU[4])


def brasier(phase):
    """grand brasier : vasque de bronze sur un fût de pierre sculptée, deux cases de large (64 × 96)"""
    T = Toile(64, 96)
    cx = 32
    # socle à degrés
    for i, (w, y0, y1) in enumerate([(26, 88, 93), (22, 82, 87)]):
        for y in range(y0, y1 + 1):
            for x in range(cx - w, cx + w):
                t = 0.45 + 0.25 * (cx - x) / w * 0.5 + (0.25 if y == y0 else 0) - (0.2 if y == y1 else 0)
                T.p(x, y, nuance(SABLE, t, x, y))
    # fût cannelé
    for y in range(52, 82):
        for x in range(cx - 10, cx + 10):
            u = (x - cx + 10) / 20
            t = 0.75 - u * 0.55 + (0.12 if (x - cx) % 4 == 0 else 0) - (0.1 if (x - cx) % 4 == 2 else 0)
            T.p(x, y, nuance(SABLE, t, x, y))
    for y in (56, 76):                                   # bagues d'or
        for x in range(cx - 11, cx + 11):
            T.p(x, y, nuance(OR, 0.8 - (x - cx + 11) / 22 * 0.6, x, y)); T.p(x, y + 1, OR[2])
    glyphes(T, cx - 8, 62, cx + 7, 70, SABLE, 4)
    # chapiteau en lotus
    for y in range(44, 52):
        w = 10 + (52 - y) * 1.6
        for x in range(int(cx - w), int(cx + w)):
            u = (x - cx + w) / (2 * w); t = 0.75 - u * 0.5 + (0.15 if y == 44 else 0)
            T.p(x, y, nuance(SABLE, t, x, y))
    # vasque de bronze (ellipse) et braises
    for y in range(30, 46):
        for x in range(cx - 26, cx + 26):
            d = ((x + .5 - cx) / 25) ** 2 + ((y + .5 - 34) / 12) ** 2
            if d <= 1 and y >= 34:
                t = 0.68 - 0.45 * (x - cx + 25) / 50 - 0.2 * (y - 34) / 12
                if y == 34 or y == 35: t += 0.25
                T.p(x, y, nuance(OR, t * 0.85, x, y))
    T.ellipse(cx, 34, 23, 5, OR[1])
    for y in range(30, 38):
        for x in range(cx - 22, cx + 22):
            if ((x + .5 - cx) / 22) ** 2 + ((y + .5 - 34) / 4) ** 2 <= 1:
                T.p(x, y, nuance(FEU, 0.35 + bruit(x, y + int(phase), 9) * 0.45, x, y))
    for x in range(cx - 25, cx + 25):                     # lèvre de la vasque
        y = 34 - int(round(5 * math.sqrt(max(0, 1 - ((x + .5 - cx) / 25) ** 2))))
        T.p(x, y, OR[5] if x < cx else OR[4])
        y2 = 34 + int(round(5 * math.sqrt(max(0, 1 - ((x + .5 - cx) / 25) ** 2))))
        T.p(x, y2, OR[3])
    # flammes : trois langues
    flamme(T, cx - 10, 33, 8, 20, phase + 1.3, 11)
    flamme(T, cx + 11, 33, 7, 17, phase + 2.6, 17)
    flamme(T, cx, 34, 13, 34, phase, 3)
    contour_couleur(T, '#22100a')
    return T


# ------------------------------------------------------------------ pyramide

def pyramide():
    """pyramide à degrés façon pyramide de combat : face avant, deux faces latérales en raccourci, entrée monumentale,
    pyramidion d'or ; 10 cases de large (320 × 256), pied sur le bas de l'image"""
    W, H = 320, 256
    T = Toile(W, H)
    base, apex = 238, (160, 14)
    G, D, P = 6, 314, 70           # bord gauche, bord droit de la base, recul des coins arrière
    face = [(G, base), (D, base), apex]
    gauche = [(G, base), (G, base - P), apex]
    droite = [(D, base), apex, (D, base - P)]

    def dans(pts, x, y):
        c = False
        for i in range(len(pts)):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
            if (y0 <= y + .5 < y1) or (y1 <= y + .5 < y0):
                if x + .5 < x0 + (y + .5 - y0) * (x1 - x0) / (y1 - y0): c = not c
        return c
    gradin = 12
    for y in range(H):
        for x in range(W):
            if dans(face, x, y):
                r = (base - y) // gradin; yy = (base - y) % gradin
                t = 0.58 + (bruit((x + r * 8) // 16, r, 2) - .5) * 0.16 + (bruit(x, y, 5) - .5) * 0.02
                t -= 0.1 * (x - 160) / 160 * 0.5
                if yy == gradin - 1: t += 0.24                        # nez du gradin
                elif yy == gradin - 2: t += 0.1
                elif yy == 0: t -= 0.28                               # ombre sous le gradin
                elif (x + r * 8) % 16 == 0: t -= 0.22                 # joints
                T.p(x, y, nuance(SABLE, t, x, y))
            elif dans(gauche, x, y):
                # vu de trois quarts, chaque gradin de la face ouest est une bande verticale
                pas = (apex[0] - G) * gradin / (base - apex[1]); xx = (x - G) % pas
                t = 0.8 + (bruit(int((x - G) // pas), y // 9, 8) - .5) * 0.06
                if xx < 1: t -= 0.3
                elif xx < 2: t += 0.1
                elif (y + int((x - G) // pas) * 4) % 9 == 0: t -= 0.12
                T.p(x, y, nuance(SABLE, t, x, y))
            elif dans(droite, x, y):
                pas = (D - apex[0]) * gradin / (base - apex[1]); xx = (D - x) % pas
                t = 0.3 + (bruit(int((D - x) // pas), y // 9, 9) - .5) * 0.05
                if xx < 1: t += 0.14
                elif (y + int((D - x) // pas) * 4) % 9 == 0: t -= 0.1
                T.p(x, y, nuance(SABLE, t, x, y))
    # arêtes : clair à gauche, sombre à droite
    T.ligne(G, base, apex[0], apex[1], SABLE[7]); T.ligne(D, base, apex[0], apex[1], SABLE[2])
    # pyramidion d'or
    py = apex[1] + 26
    for y in range(apex[1], py):
        f = (y - apex[1]) / (base - apex[1]); xl = apex[0] - (apex[0] - G) * f; xr = apex[0] + (D - apex[0]) * f
        for x in range(int(xl), int(xr) + 1):
            u = (x - xl) / max(1, xr - xl)
            T.p(x, y, nuance(OR, 0.95 - u * 0.65 - (y - apex[1]) / 26 * 0.1, x, y))
        xll = G + (apex[0] - G) * (1 - f)
    T.p(apex[0], apex[1] - 1, OR[6]); T.p(apex[0], apex[1], OR[6])
    # grand escalier et portail
    for y in range(176, base + 1):                      # marches
        k = (y - 176) // 4; w = 26 + k * 2
        for x in range(160 - w, 160 + w):
            t = 0.7 - (x - 160 + w) / (2 * w) * 0.35
            if (y - 176) % 4 == 0: t += 0.18
            elif (y - 176) % 4 == 3: t -= 0.2
            T.p(x, y, nuance(SABLE, t, x, y))
        T.p(160 - w - 1, y, SABLE[2]); T.p(160 + w, y, SABLE[1])
    # portail : jambages trapézoïdaux, linteau, corniche à gorge, disque ailé
    for y in range(118, 176):
        f = (y - 118) / 58; xo = 30 + f * 4
        for x in range(int(160 - xo), int(160 + xo) + 1):
            d = abs(x - 160)
            if d <= 14 and y >= 136: continue
            t = 0.66 - (x - 160 + xo) / (2 * xo) * 0.3 + (bruit(x // 5, y // 5, 31) - .5) * 0.1
            T.p(x, y, nuance(SABLE, t, x, y))
    for y in range(110, 120):                           # corniche à gorge
        for x in range(124, 197):
            t = 0.45 + (y - 110) / 10 * 0.45 if y < 117 else 0.9
            if (x - 124) % 5 == 0 and y < 117: t -= 0.15
            T.p(x, y, nuance(SABLE, t, x, y))
    T.hline(124, 196, 109, SABLE[7]); T.hline(126, 194, 120, SABLE[2])
    for x in range(134, 187):                           # disque ailé
        y = 125 + int(abs(x - 160) * 0.12)
        if abs(x - 160) > 5:
            T.p(x, y, LAPIS[3] if x % 3 else LAPIS[4]); T.p(x, y + 1, LAPIS[2]); T.p(x, y + 2, OR[3] if abs(x - 160) < 18 else LAPIS[1])
    T.ellipse(160, 127, 5, 5, OR[4]); T.ellipse(159, 126, 2, 2, OR[6])
    for y in range(136, 176):                           # entrée sombre
        for x in range(146, 175):
            t = 0.05 + 0.2 * (y - 136) / 40 * (1 if x < 160 else 0.6)
            T.p(x, y, nuance(OBSI, t * 2.2, x, y))
    T.vline(145, 136, 175, SABLE[2]); T.vline(175, 136, 175, SABLE[6])
    for x in range(146, 175): T.p(x, 136, SABLE[1])
    # deux colonnes de hiéroglyphes sur les jambages
    for x0 in (133, 179):
        for r in range(4): glyphes(T, x0, 140 + r * 8, x0 + 7, 146 + r * 8, SABLE, 20 + r + x0)
    # deux obélisques au pied
    for ox in (60, 260):
        for y in range(150, 236):
            hw = 5 if y > 160 else max(0, (y - 150) // 2)
            for x in range(ox - hw, ox + hw + 1):
                t = 0.8 - (x - ox + hw) / max(1, 2 * hw) * 0.5
                T.p(x, y, nuance(SABLE, t, x, y))
        for y in range(150, 160):
            hw = max(0, (y - 150) // 2)
            for x in range(ox - hw, ox + hw + 1): T.p(x, y, nuance(OR, 0.9 - (x - ox + hw) / max(1, 2 * hw) * 0.6, x, y))
        for r in range(8): glyphes(T, ox - 3, 165 + r * 8, ox + 3, 171 + r * 8, SABLE, ox + r)
        T.rect(ox - 8, 236, ox + 8, 240, SABLE[3]); T.hline(ox - 8, ox + 8, 236, SABLE[6])
    contour_couleur(T, '#2a170c')
    return T


# ------------------------------------------------------------------ tombeau du pharaon

def tombeau():
    """temple funéraire : deux pylônes à corniche, porte au disque ailé, escalier, deux statues de chacal, frises ;
    9 cases de large (288 × 224)"""
    W, H = 288, 224
    T = Toile(W, H)
    sol = 220
    # terrasse de base
    for y in range(184, sol + 1):
        for x in range(4, W - 4):
            t = 0.5 - (x / W) * 0.15 + (0.3 if y == 184 else 0) - (0.2 if y >= sol - 1 else 0)
            T.p(x, y, nuance(SABLE, t, x, y))
    briques(T, 6, 190, W - 7, sol - 2, SABLE, h=7, l=18, graine=41)
    T.hline(4, W - 5, 184, SABLE[7]); T.hline(4, W - 5, 185, SABLE[6])

    def pylone(x0, x1, haut, graine):
        # trapèze : 8 px de fruit de chaque côté, corniche à gorge en haut, tore sur les arêtes, dessus visible
        for y in range(haut + 14, 185):
            f = (y - haut) / (185 - haut); xa = x0 + 8 * (1 - f); xb = x1 - 8 * (1 - f)
            for x in range(int(xa), int(xb) + 1):
                T.p(x, y, SABLE[4])
        briques(T, x0, haut + 14, x1, 184, SABLE, h=8, l=20, graine=graine,
                lumiere=lambda x, y: -0.12 * (x - x0) / (x1 - x0))
        for y in range(haut + 14, 185):                     # recoupe les bords en trapèze, tore sur l'arête
            f = (y - haut) / (185 - haut); xa = int(x0 + 8 * (1 - f)); xb = int(x1 - 8 * (1 - f))
            for x in range(x0, xa): T.p(x, y, OMBRE)
            for x in range(xb + 1, x1 + 1): T.p(x, y, OMBRE)
            T.p(xa, y, SABLE[6]); T.p(xa + 1, y, SABLE[7]); T.p(xb, y, SABLE[2]); T.p(xb - 1, y, SABLE[3])
        # dessus (vu de trois quarts)
        T.rect(x0 + 2, haut, x1 - 2, haut + 3, SABLE[6]); T.hline(x0 + 2, x1 - 2, haut, SABLE[7])
        # corniche à gorge : cannelures verticales, lèvre claire, ombre dessous
        for y in range(haut + 4, haut + 14):
            for x in range(x0 - 2, x1 + 3):
                v = (y - haut - 4) / 10
                t = 0.35 + v * 0.55 if v < 0.75 else 0.95
                if (x - x0) % 4 == 0 and v < 0.75: t -= 0.18
                t -= 0.12 * (x - x0) / (x1 - x0)
                T.p(x, y, nuance(SABLE, t, x, y))
        T.hline(x0 - 2, x1 + 2, haut + 14, SABLE[1])
        # grand bas-relief : un roi tenant un sceptre (silhouette gravée) et une colonne de glyphes
        cx = (x0 + x1) // 2
        for r in range(6): glyphes(T, x0 + 12, haut + 26 + r * 8, x0 + 19, haut + 32 + r * 8, SABLE, graine + r)
        for r in range(6): glyphes(T, x1 - 19, haut + 26 + r * 8, x1 - 12, haut + 32 + r * 8, SABLE, graine + 10 + r)
        roi = ['...###...', '..#####..', '..##.##..', '...###...', '....#....', '..#####.#', '.#.###.##', '#..###..#',
               '...###...', '...###...', '...#.#...', '...#.#...', '..##.##..']
        for yy, row in enumerate(roi):
            for xx, ch in enumerate(row):
                if ch == '#':
                    x, y = cx - 9 + xx * 2, haut + 34 + yy * 3
                    for dy in range(3):
                        for dx in range(2): T.p(x + dx, y + dy, SABLE[2])
                    T.p(x + 2, y + 3, SABLE[6])
    pylone(14, 102, 40, 51)
    pylone(186, 274, 40, 61)
    # porte centrale : massif plus bas, corniche, disque ailé, entrée
    x0, x1, haut = 100, 188, 78
    briques(T, x0, haut + 12, x1, 184, SABLE, h=8, l=16, graine=71, lumiere=lambda x, y: 0.05)
    for y in range(haut, haut + 12):
        for x in range(x0 - 3, x1 + 4):
            v = (y - haut) / 12; t = 0.4 + v * 0.5 if v < 0.75 else 0.95
            if (x - x0) % 4 == 0 and v < 0.75: t -= 0.18
            T.p(x, y, nuance(SABLE, t, x, y))
    T.hline(x0 - 3, x1 + 3, haut - 1, SABLE[7]); T.hline(x0 - 3, x1 + 3, haut + 12, SABLE[1])
    for x in range(x0 + 6, x1 - 5):                     # disque ailé
        y = haut + 17 + int(abs(x - 144) * 0.1)
        if abs(x - 144) > 6:
            for dy, c in enumerate([LAPIS[4], LAPIS[3], LAPIS[2], OR[3]]): T.p(x, y + dy, c if (x + dy) % 4 else LAPIS[1])
    T.ellipse(144, haut + 19, 6, 6, OR[4]); T.ellipse(143, haut + 18, 2.5, 2.5, OR[6])
    for dx in (-7, 7):                                  # deux cobras dressés
        T.vline(144 + dx, haut + 13, haut + 22, OR[3]); T.p(144 + dx, haut + 12, OR[5])
    for y in range(haut + 32, 185):                     # embrasure et porte de bronze entrouverte
        for x in range(126, 163):
            if x < 130 or x > 158: T.p(x, y, SABLE[2] if x < 130 else SABLE[5])
            else:
                t = 0.08 + 0.18 * (y - haut - 32) / 75
                T.p(x, y, nuance(OBSI, t * 2.5, x, y))
    for y in range(haut + 34, 185):
        for x in range(131, 140):
            T.p(x, y, nuance(OR, 0.32 + (0.12 if x == 131 else 0) - (y - haut - 34) / 200, x, y))
        if (y - haut) % 12 == 0:
            for x in range(131, 140): T.p(x, y, OR[1])
    T.hline(126, 162, haut + 31, SABLE[1]); T.hline(124, 164, haut + 30, SABLE[6])
    # escalier
    for y in range(185, sol + 1):
        k = (y - 185) // 5; w = 22 + k * 3
        for x in range(144 - w, 144 + w):
            t = 0.72 - (x - 144 + w) / (2 * w) * 0.3 + (0.18 if (y - 185) % 5 == 0 else 0) - (0.2 if (y - 185) % 5 == 4 else 0)
            T.p(x, y, nuance(SABLE, t, x, y))
    # chacals couchés sur leurs socles, de part et d'autre de l'escalier
    chacal = ['..#.......', '.##.......', '.####.....', '#####.....', '..###.....', '..#######.', '..########',
              '..########', '.#########', '##########']
    for sx, miroir_ in ((98, False), (176, True)):
        T.rect(sx - 2, 176, sx + 22, 186, SABLE[3]); T.hline(sx - 2, sx + 22, 176, SABLE[6]); T.hline(sx - 2, sx + 22, 186, SABLE[1])
        for yy, row in enumerate(chacal):
            for xx, ch in enumerate(row):
                if ch == '#':
                    xx2 = (9 - xx) if miroir_ else xx
                    for dy in range(2):
                        for dx in range(2):
                            x, y = sx + xx2 * 2 + dx, 156 + yy * 2 + dy
                            T.p(x, y, OBSI[3] if (xx + yy) % 5 else OBSI[4])
        ox = sx + (2 if not miroir_ else 16); T.p(ox + 2, 161, OR[5]); T.p(ox + 3, 161, OR[4])
        for x in range(sx + 4, sx + 16): T.p(x, 165, OR[3])     # collier d'or
    contour_couleur(T, '#2a170c')
    return T


# ------------------------------------------------------------------ sarcophage

def couvercle(T, ox, oy):
    """couvercle anthropoïde : némès rayé or et lapis, masque d'or, collier, bras croisés (crosse et fléau), ailes
    d'Isis, pieds ; 26 × 54 environ, coin haut gauche en ox, oy"""
    cx = ox + 13
    ROUGE = rampe('#4a0e0a', '#8a2216', '#c03a22')

    def demi(y):                                           # demi-largeur à chaque rangée (y relatif)
        if y < 3: return 6 + y
        if y < 17: return 8 + (y - 3) * 0.32
        if y < 22: return 12.5
        if y < 49: return 12.5 - (y - 22) * 0.2
        return 7 - (y - 49) * 0.5
    for yy in range(0, 54):
        w = demi(yy); y = oy + yy
        for x in range(int(round(cx - w)), int(round(cx + w)) + 1):
            u = (x - cx) / max(1, w)                         # -1 gauche (éclairé) … 1 droite
            lum = -0.22 * u
            if yy < 17 and abs(x - cx) >= 5 or yy < 4:     # némès
                c = OR if (yy // 2) % 2 == 0 else LAPIS
                T.p(x, y, nuance(c, (0.7 if c is OR else 0.62) + lum, x, y))
            elif yy < 17:                                  # visage
                T.p(x, y, nuance(OR, 0.7 + lum - (0.12 if yy > 14 else 0), x, y))
            elif yy < 22:                                  # pans du némès sur les épaules, barbe
                if abs(x - cx) <= 1: c = LAPIS if yy % 2 else OR; T.p(x, y, nuance(c, 0.55 + lum, x, y))
                else: T.p(x, y, nuance(OR if (yy // 2) % 2 == 0 else LAPIS, 0.62 + lum, x, y))
            elif yy < 28:                                  # collier large en arcs
                bande = (yy - 22 + int(abs(x - cx) * 0.25)) % 4
                c = [LAPIS, OR, ROUGE, OR][bande]
                T.p(x, y, nuance(c, 0.66 + lum, x, y))
            else:                                          # corps doré, bande centrale de lapis, bandes horizontales
                t = 0.56 + lum
                c = OR
                if abs(x - cx) <= 1 and yy > 36: c = LAPIS if (yy // 2) % 2 else OR
                elif (yy - 28) % 7 == 6: t -= 0.22
                T.p(x, y, nuance(c, t, x, y))
    # visage
    for dx in (-3, 2):
        T.hline(cx + dx, cx + dx + 1, oy + 9, OBSI[0]); T.p(cx + dx - (1 if dx < 0 else -2), oy + 9, LAPIS[1])
        T.hline(cx + dx, cx + dx + 1, oy + 7, LAPIS[1])
    T.p(cx, oy + 11, OR[2]); T.hline(cx - 1, cx + 1, oy + 13, OR[2])
    T.p(cx - 1, oy + 2, OR[6]); T.p(cx, oy + 1, LAPIS[3]); T.p(cx, oy + 2, OR[5])   # cobra frontal
    # bras croisés et attributs
    for i in range(10):
        T.p(cx - 8 + i, oy + 29 + i // 3, OR[5]); T.p(cx - 8 + i, oy + 30 + i // 3, OR[3])
        T.p(cx + 8 - i, oy + 32 + i // 3, OR[4]); T.p(cx + 8 - i, oy + 33 + i // 3, OR[2])
    T.vline(cx - 3, oy + 26, oy + 36, LAPIS[3]); T.vline(cx - 2, oy + 26, oy + 36, LAPIS[2])   # crosse
    T.p(cx - 4, oy + 25, LAPIS[3]); T.p(cx - 5, oy + 26, LAPIS[3]); T.p(cx - 5, oy + 27, LAPIS[2])
    T.vline(cx + 3, oy + 26, oy + 36, OR[2])                                                 # fléau
    for k in range(3): T.vline(cx + 4 + k, oy + 25 + k, oy + 29 + k, ROUGE[1 + k % 2])
    # ailes d'Isis
    for k in range(1, 12):
        y = oy + 41 + k // 4
        for side in (-1, 1):
            x = cx + side * k
            T.p(x, y, nuance(LAPIS if k % 2 else OR, 0.75 - side * 0.15, x, y)); T.p(x, y + 1, LAPIS[1])
    # pieds
    T.rect(cx - 4, oy + 50, cx + 4, oy + 53, OR[3]); T.hline(cx - 4, cx + 4, oy + 50, OR[5])


def sarcophage(ouvert=False):
    """sarcophage sur sa cuve de granit, couché nord-sud (tête en haut) ; 32 × 64. Ouvert : la cuve sans son couvercle,
    une momie dedans"""
    T = Toile(32, 64)
    for y in range(4, 58):                               # dessus de la cuve
        for x in range(2, 30):
            t = 0.5 - (x - 2) / 28 * 0.22 + (bruit(x // 3, y // 3, 81) - .5) * 0.06
            if y == 4: t += 0.3
            T.p(x, y, nuance(PIERRE, t, x, y))
    for y in range(58, 64):                              # face avant de la cuve, frise gravée
        for x in range(2, 30):
            T.p(x, y, nuance(PIERRE, 0.32 - (x - 2) / 28 * 0.12 - (0.1 if y == 63 else 0), x, y))
    T.hline(2, 29, 58, PIERRE[5])
    for x in range(4, 28, 7): glyphes(T, x, 59, x + 5, 62, PIERRE, x)
    if ouvert:
        for y in range(7, 56):                           # creux de la cuve, paroi éclairée à gauche
            for x in range(5, 27):
                t = 0.12 + 0.1 * (y - 7) / 49 + (0.25 if x == 5 or y == 7 else 0)
                T.p(x, y, nuance(OBSI, t * 2, x, y))
        for y in range(11, 54):                          # momie couchée : bandelettes croisées
            w = 4 if y < 17 else 5 if y < 40 else 5 - (y - 40) // 5
            for x in range(16 - w, 16 + w + 1):
                t = 0.55 + 0.25 * (16 - x) / 5
                if (y * 2 + x) % 5 == 0 or (y * 2 - x) % 7 == 0: t -= 0.22
                T.p(x, y, nuance(OS, t, x, y))
        T.hline(14, 15, 14, OBSI[0]); T.hline(17, 18, 14, OBSI[0])
    else:
        couvercle(T, 3, 3)
    T.contour(hexa('#140c10'))
    return T


# ------------------------------------------------------------------ portes de boss

def cadre_porte(W=64, H=96): return Toile(W, H)


def battants(T, x0, y0, x1, y1, R, motif=None, ouvert=False, voute=None):
    """deux battants (bois, pierre ou métal) entre x0..x1, y0..y1 ; voute(x) -> y du haut si cintrée"""
    xm = (x0 + x1) // 2
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if voute and y < voute(x): continue
            if ouvert:
                d = min(x - x0, x1 - x, y1 - y)
                t = 0.02 + min(0.25, d * 0.0) + 0.2 * max(0, (y - y0) / (y1 - y0)) * (1 - abs(x - xm) / (xm - x0 + 1))
                T.p(x, y, nuance(OBSI, t * 2.5, x, y)); continue
            u = (x - x0) / max(1, x1 - x0)
            lame = (x - x0) // 4
            t = 0.55 - 0.18 * u + (bruit(lame, 0, 13) - .5) * 0.12
            if (x - x0) % 4 == 0: t -= 0.12
            elif (x - x0) % 4 == 1: t += 0.06
            if x == xm or x == xm + 1: t = 0.1 if x == xm else 0.75       # joint central
            if x in (x0, x1): t -= 0.25
            T.p(x, y, nuance(R, t, x, y))
    if ouvert:                                            # marches qui s'enfoncent dans le noir
        for k in range(4):
            y = y1 - k * 4; w = (x1 - x0) // 2 - 3 - k * 3
            T.hline(xm - w, xm + w, y, PIERRE[2 - min(2, k // 2)])
    elif motif: motif(T, xm)


def porte_egypte(ouvert=False):
    T = cadre_porte()
    cx = 32
    for y in range(18, 96):                          # jambages en talus et linteau
        f = (y - 18) / 78; xo = 27 + f * 4
        for x in range(int(cx - xo), int(cx + xo) + 1):
            t = 0.6 - (x - cx + xo) / (2 * xo) * 0.3 + (bruit(x // 4, y // 6, 7) - .5) * 0.1
            if (y - 18) % 8 == 0: t -= 0.15
            T.p(x, y, nuance(SABLE, t, x, y))
    for y in range(8, 18):                           # corniche à gorge
        for x in range(cx - 31, cx + 32):
            v = (y - 8) / 10; t = 0.4 + v * 0.5 if v < .75 else .95
            if (x - cx) % 4 == 0 and v < .75: t -= .18
            T.p(x, y, nuance(SABLE, t, x, y))
    T.hline(cx - 31, cx + 31, 7, SABLE[7]); T.hline(cx - 31, cx + 31, 18, SABLE[1])
    for x in range(cx - 24, cx + 25):                # disque ailé
        y = 22 + abs(x - cx) // 8
        if abs(x - cx) > 4:
            for dy, c in enumerate([LAPIS[4], LAPIS[3], OR[3]]): T.p(x, y + dy, c if (x + dy) % 3 else LAPIS[1])
    T.ellipse(cx, 24, 4, 4, OR[4]); T.p(cx - 1, 23, OR[6])
    for x0 in (cx - 28, cx + 19):                    # glyphes sur les jambages
        for r in range(7): glyphes(T, x0, 34 + r * 8, x0 + 8, 40 + r * 8, SABLE, x0 + r * 3)

    def scarabee(T, xm):
        for (px0, px1) in ((19, xm - 2), (xm + 3, 45)):        # panneaux en creux
            for (py0, py1) in ((34, 46), (74, 90)):
                T.rect(px0, py0, px1, py1, OR[2]); T.rect(px0 + 1, py0 + 1, px1, py1, OR[4]); T.rect(px0 + 1, py0 + 1, px1 - 1, py1 - 1, OR[3])
                T.hline(px0 + 1, px1 - 1, py0 + 1, OR[5])
        T.ellipse(xm + 1, 61, 7, 8, OR[1]); T.ellipse(xm + 1, 60, 6, 7, LAPIS[2]); T.ellipse(xm, 59, 4, 5, LAPIS[3])
        T.p(xm - 1, 56, LAPIS[4]); T.p(xm - 2, 57, LAPIS[4])
        T.vline(xm + 1, 55, 67, LAPIS[1]); T.ellipse(xm + 1, 52, 3, 2, OR[4])
        T.ellipse(xm + 1, 48, 4, 3, OR[5]); T.p(xm, 47, OR[6])      # disque solaire tenu par le scarabée
        for i in range(5):
            T.p(xm - 6 - i, 57 + i, OR[4]); T.p(xm + 8 + i, 57 + i, OR[3])
            T.p(xm - 6 - i, 65 - i // 2, OR[4]); T.p(xm + 8 + i, 65 - i // 2, OR[3])
    battants(T, 18, 30, 46, 94, OR, scarabee, ouvert)
    contour_couleur(T, '#2a170c')
    return T


def porte_crypte(ouvert=False):
    T = cadre_porte()
    cx = 32
    voute = lambda x: 22 + int(round(24 - math.sqrt(max(0, 24 ** 2 - (x - cx + .5) ** 2 * 1.0))))
    for y in range(4, 96):                           # arc brisé de pierres grises
        for x in range(2, 62):
            out = 4 + int(round(30 - math.sqrt(max(0, 30 ** 2 - (x - cx + .5) ** 2))))
            if y < out: continue
            if x >= 14 and x <= 50 and y >= voute(x): continue
            t = 0.5 - (x - 2) / 60 * 0.2 + (bruit(x // 6, y // 7, 17) - .5) * 0.2
            if (y // 7 + x // 9) % 2 == 0 and (y % 7 == 0 or x % 9 == 0): t -= 0.25
            T.p(x, y, nuance(PIERRE, t, x, y))
    # clé de voûte : crâne
    crane = ['.#####.', '#######', '#.###.#', '#######', '.#.#.#.', '.#####.']
    for yy, row in enumerate(crane):
        for xx, ch in enumerate(row):
            if ch == '#': T.p(cx - 3 + xx, 10 + yy, OS[4] if yy < 3 else OS[3])
            elif yy == 2: T.p(cx - 3 + xx, 10 + yy, OBSI[0])

    def ferrures(T, xm):
        for y in (40, 58, 76, 90):
            for x in range(15, 50):
                if abs(x - xm) > 0 and y >= voute(x): T.p(x, y, FER[2]); T.p(x, y + 1, FER[4]); T.p(x, y + 2, FER[1])
            for x in range(17, 49, 6):
                if y >= voute(x): T.p(x, y + 1, FER[5])
        for dx in (-5, 6):                           # anneaux
            T.ellipse(xm + dx + .5, 67, 3, 3, FER[4], plein=False); T.p(xm + dx, 64, FER[5])
    battants(T, 14, 22, 50, 94, BOIS, ferrures, ouvert, voute)
    # chaînes pendantes et torches de part et d'autre
    for x0 in (7, 56):
        for y in range(30, 70, 3): T.p(x0, y, FER[4]); T.p(x0, y + 1, FER[2])
    contour_couleur(T, '#121018')
    return T


def porte_glace(ouvert=False):
    T = cadre_porte()
    cx = 32
    # arche de cristaux : aiguilles de glace de hauteurs variées
    for i in range(14):
        a = math.pi * (i / 13)
        bx = cx - math.cos(a) * 26; by = 50 - math.sin(a) * 36
        L = 8 + bruit(i, 0, 3) * 10
        for k in range(int(L)):
            x = bx - math.cos(a) * k * 0.6; y = by - math.sin(a) * k * 0.9
            w = max(1, int(4 - k * 4 / L))
            for d in range(-w, w + 1):
                t = 0.75 - d / (w + 1) * 0.35 + k / L * 0.2
                T.p(x + d, y, nuance(GLACE, t, int(x + d), int(y)))
    for y in range(40, 96):                           # piédroits de glace
        for x in list(range(4, 16)) + list(range(48, 60)):
            t = (0.75 if x < 32 else 0.42) - ((x - 4) % 12) / 12 * 0.3 + (0.12 if (x - 4) % 4 == 0 else 0)
            T.p(x, y, nuance(GLACE, t, x, y))
    voute = lambda x: 44 - int(math.sqrt(max(0, 17 ** 2 - (x - cx + .5) ** 2)) * 1.1)

    def runes(T, xm):
        for y in range(28, 94):
            for x in range(16, 48):
                if y >= voute(x):
                    c = T.get(x, y)
        for k, (rx, ry) in enumerate([(22, 50), (38, 50), (22, 70), (38, 70), (30, 36)]):
            for d in range(-3, 4): T.p(rx + d, ry, GLACE[6]); T.p(rx, ry + d, GLACE[6])
            T.p(rx - 2, ry - 2, GLACE[5]); T.p(rx + 2, ry + 2, GLACE[5]); T.p(rx + 2, ry - 2, GLACE[5]); T.p(rx - 2, ry + 2, GLACE[5])
    battants(T, 16, 26, 47, 94, GLACE, runes, ouvert, voute)
    contour_couleur(T, '#0a1830')
    return T


def porte_lave(ouvert=False):
    T = cadre_porte()
    cx = 32
    for y in range(6, 96):                           # cadre d'obsidienne fissuré de lave
        for x in range(2, 62):
            if 15 <= x <= 48 and y >= 26: continue
            t = 0.45 + (bruit(x // 7, y // 9, 29) - .5) * 0.16 - (x - 2) / 60 * 0.15 + (0.12 if (x + y) % 11 == 0 else 0)
            T.p(x, y, nuance(OBSI, t, x, y))
            if y > 6 and abs((x * 3 + y * 2 + int(bruit(y // 6, 0, 37) * 9)) % 29 - 14) < 1 and bruit(x // 5, y // 5, 35) > 0.45:
                T.p(x, y, nuance(LAVE, 0.4 + bruit(x, y, 2) * 0.6, x, y))
    for i, (x0, y0) in enumerate([(4, 6), (52, 6)]):  # cornes
        for k in range(14):
            w = max(1, 4 - k // 4)
            for d in range(w): T.p(x0 + (k // 2 if i == 0 else -k // 2) + d + (2 if i == 0 else 0), y0 - k // 3 + 4, OS[2 + (d == 0)])
    T.hline(2, 61, 6, OBSI[4])

    def sceau(T, xm):
        for y in range(28, 94, 11): T.hline(16, 47, y, LAVE[1])
        for k in range(12):                                   # soleil de lave : rayons et disque
            a = k * math.pi / 6; r0, r1 = 7, 12 if k % 2 == 0 else 10
            T.ligne(xm + .5 + math.cos(a) * r0, 58 + math.sin(a) * r0, xm + .5 + math.cos(a) * r1, 58 + math.sin(a) * r1, LAVE[3])
        T.ellipse(xm + .5, 58, 6, 6, LAVE[2]); T.ellipse(xm + .5, 58, 4.5, 4.5, LAVE[4]); T.ellipse(xm, 57, 2, 2, LAVE[5])
    battants(T, 15, 26, 48, 94, OBSI, sceau, ouvert)
    contour_couleur(T, '#08040a')
    return T


def porte_miroir(ouvert=False):
    T = cadre_porte()
    cx = 32
    for y in range(4, 96):                           # cadre d'argent ouvragé, arc en plein cintre
        for x in range(4, 60):
            out = 4 + int(round(28 - math.sqrt(max(0, 28 ** 2 - (x - cx + .5) ** 2))))
            if y < out: continue
            inn = 12 + int(round(20 - math.sqrt(max(0, 20 ** 2 - (x - cx + .5) ** 2)))) if 12 <= x <= 51 else 999
            if 12 <= x <= 51 and y >= inn: continue
            t = 0.7 - (x - 4) / 56 * 0.4 + (0.2 if (x + y) % 6 == 0 else 0)
            T.p(x, y, nuance(ARGENT, t, x, y))
    for k in range(9):                               # perles le long de l'arc
        a = math.pi * (k + .5) / 9
        x = cx - math.cos(a) * 24; y = 30 - math.sin(a) * 22
        T.p(x, y, ARGENT[6]); T.p(x + 1, y + 1, ARGENT[2])
    voute = lambda x: 12 + int(round(20 - math.sqrt(max(0, 20 ** 2 - (x - cx + .5) ** 2))))

    def glace(T, xm):
        for y in range(12, 95):
            for x in range(12, 52):
                if y < voute(x): continue
                v = (y - 12) / 83
                t = 0.75 - 0.5 * v + 0.1 * (1 - (x - 12) / 40)
                s = (x - 12) - (y - 12) * 0.5
                if 8 < s < 11 or 15 < s < 16.5: t += 0.35
                T.p(x, y, nuance(VERRE, t, x, y))
        for y in range(16, 95): T.p(xm, y, ARGENT[1]) if y >= voute(xm) else None
        # silhouette sombre du reflet : quelqu'un se tient de l'autre côté
        sil = ['..###..', '.#####.', '..###..', '.#####.', '#######', '#######', '.#####.', '.##.##.', '.##.##.', '.##.##.']
        for yy, row in enumerate(sil):
            for xx, ch in enumerate(row):
                if ch == '#':
                    for dy in range(3): T.p(xm - 6 + xx * 2, 52 + yy * 3 + dy, VERRE[1]); T.p(xm - 5 + xx * 2, 52 + yy * 3 + dy, VERRE[1])
    battants(T, 12, 12, 51, 94, ARGENT, glace, ouvert, voute)
    contour_couleur(T, '#161a24')
    return T


def porte_sylve(ouvert=False):
    T = cadre_porte()
    cx = 32
    # arche de racines tressées et de feuillage
    for y in range(2, 96):
        for x in range(2, 62):
            r = math.hypot((x - cx + .5) / 30, (y - 44) / 42)
            if y < 44 and r > 1: continue
            if 14 <= x <= 49 and y >= 32 - int(math.sqrt(max(0, 18 ** 2 - (x - cx + .5) ** 2)) * 0.9) + 18: continue
            if y < 44 and r < 0.62: continue
            torsade = math.sin((x + y) * 0.45) + math.sin((x - y) * 0.3)
            t = 0.45 + torsade * 0.15 + (bruit(x // 2, y // 2, 41) - .5) * 0.15 - (x - 2) / 60 * 0.15
            T.p(x, y, nuance(BOIS, t + 0.2, x, y))
    for i in range(40):                              # touffes de feuilles sur l'arche
        a = math.pi * bruit(i, 1, 43); rr = 0.82 + bruit(i, 2, 43) * 0.2
        x = cx - math.cos(a) * 30 * rr; y = 44 - math.sin(a) * 42 * rr
        T.ellipse(x, y, 3, 2.5, FEUILLE[2 + int(bruit(i, 3, 43) * 3)])
        T.p(x - 1, y - 1, FEUILLE[5])
    voute = lambda x: 50 - int(math.sqrt(max(0, 18 ** 2 - (x - cx + .5) ** 2)) * 0.9)

    def porte_ronde(T, xm):
        T.ellipse(xm + .5, 66, 4, 4, OR[3]); T.ellipse(xm, 65, 2, 2, OR[5])
        for y in range(36, 94, 9):
            for x in range(15, 50):
                if y >= voute(x): T.p(x, y, BOIS[1])
        for k in range(6):                             # liseron qui court sur la porte
            T.p(16 + k * 5, 40 + (k % 2) * 3, FEUILLE[4]); T.p(17 + k * 5, 41 + (k % 2) * 3, FEUILLE[3])
    battants(T, 14, 30, 49, 94, BOIS, porte_ronde, ouvert, voute)
    contour_couleur(T, '#0e0a06')
    return T


PORTES = {'egypte': porte_egypte, 'crypte': porte_crypte, 'glace': porte_glace, 'lave': porte_lave,
          'miroir': porte_miroir, 'sylve': porte_sylve}


def main():
    os.makedirs(OUT, exist_ok=True)
    out = {}
    out['miroir_objet'] = miroir_objet()
    out['miroir_nE'] = miroir_pied(1)
    out['miroir_nO'] = miroir_pied(-1)
    out['miroir_sol'] = miroir_sol()
    for i in range(4): out['brasier_%d' % i] = brasier(i * 1.6)
    out['pyramide'] = pyramide()
    out['tombeau'] = tombeau()
    out['sarcophage'] = sarcophage(False)
    out['sarcophage_ouvert'] = sarcophage(True)
    for k, f in PORTES.items():
        out['porte_' + k] = f(False); out['porte_' + k + '_ouverte'] = f(True)
    for k, T in out.items(): T.save(os.path.join(OUT, k + '.png'))
    I = {k: T.image() for k, T in out.items()}
    planche([I['miroir_objet'], I['miroir_nE'], I['miroir_nO'], I['miroir_sol']] + [I['brasier_%d' % i] for i in range(4)],
            echelle=4).save(os.path.join(OUT, 'planche_miroirs_brasier.png'))
    planche([I['pyramide'], I['tombeau']], echelle=2).save(os.path.join(OUT, 'planche_pyramide_tombeau.png'))
    planche([I['sarcophage'], I['sarcophage_ouvert']], echelle=5).save(os.path.join(OUT, 'planche_sarcophage.png'))
    planche([I['porte_' + k] for k in PORTES] + [I['porte_' + k + '_ouverte'] for k in PORTES], colonnes=6, echelle=3,
            fond='#6a6058').save(os.path.join(OUT, 'planche_portes.png'))
    # brasier animé
    fr = [I['brasier_%d' % i].resize((256, 384), Image.NEAREST) for i in range(4)]
    bg = [Image.alpha_composite(Image.new('RGBA', f.size, '#9cc48a'), f) for f in fr]
    bg[0].save(os.path.join(OUT, 'brasier.gif'), save_all=True, append_images=bg[1:], duration=140, loop=0, disposal=2)
    print('écrit dans', OUT, ':', ', '.join(out))


if __name__ == '__main__':
    main()
