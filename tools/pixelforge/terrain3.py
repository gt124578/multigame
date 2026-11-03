#!/usr/bin/env python3
# Odyssée — PixelForge / terrain v3, « style du jeu » : mêmes couleurs et même vocabulaire que les sols actuels
# d'Odyssée (aplats clairs et calmes, détails clairsemés : touffes, paires de cailloux, brindilles, fissures ramifiées,
# groupes de gravillons), mais avec la variation organique du générateur : plus ou moins de détails selon l'endroit,
# bords naturels bornés par la grille, aucune case identique.
#
#   python3 tools/pixelforge/terrain3.py route  --out out/route1.png [--debug]
#   python3 tools/pixelforge/terrain3.py grotte --out out/grotte.png      (Grotte Lunaire, sol brun)
#   python3 tools/pixelforge/terrain3.py marees --out out/marees.png      (Grotte des Marées, sol gris)
#
# Les outils de base (grille, bruit lié à la position, bords bornés, arbres du jeu) viennent de terrain2.py.
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from terrain2 import T, Carte, hash2, fbm, cell_rng, sprites as sprites2, ROOT

# ------------------------------------------------------------------ palette relevée dans le jeu --------------------
PAL = {
    # herbe (aplat #74c460 du jeu, touffes #58a44c / #468c3e, pointes #9cdc78)
    'gD': '#2f6a34', 'g0': '#468c3e', 'g1': '#58a44c', 'gA': '#6cbb5a', 'g2': '#74c460', 'gB': '#7cca68', 'g3': '#9cdc78', 'g4': '#c4f0a0',
    # hautes herbes (palette du jeu)
    'h0': '#294b28', 'h1': '#386233', 'h2': '#45793e', 'h3': '#61a653', 'h4': '#81d06c', 'h5': '#b0f18e',
    # chemin de sable (#ecd69e du jeu, bord #dcc086 / #c4a068, grains #b89662)
    'd0': '#a07c50', 'd1': '#b89662', 'd2': '#c4a068', 'd3': '#dcc086', 'dA': '#e4cc92', 'd4': '#ecd69e', 'd5': '#f8ecc4',
    # cailloux, brindilles
    'p0': '#6a6a66', 'p1': '#8a8a84', 'p2': '#b0b0a8', 'p3': '#dcdcd4', 't0': '#6a4028', 't1': '#8c5c38',
    # fleurs
    'fr': '#f05a6a', 'fy': '#f8d850', 'fw': '#fafaf2', 'fb': '#7aa0f8', 'fp': '#f490c8', 'fc': '#f8c040',
    # eau (#2b91e4 du jeu, reflets #40a7eb / #6ec4f5) et berge (#91330a / #3e2721)
    'w0': '#1a6cc8', 'w1': '#1f80dd', 'w2': '#2b91e4', 'w3': '#40a7eb', 'w4': '#6ec4f5', 'w5': '#e8f8ff',
    'r0': '#3e2721', 'r1': '#91330a', 'r2': '#b0582a',
    # pont (planches du jeu)
    'b0': '#604633', 'b1': '#7f4f32', 'b2': '#986a43', 'b3': '#a47246', 'b4': '#c08a58',
    # pavés de ville (gris du jeu)
    'v0': '#7a797c', 'v1': '#8e8d8f', 'v2': '#aaa9ac', 'v3': '#b6b6bb', 'v4': '#c2c2c6', 'v5': '#d0d0d2', 'v6': '#e2e2e6',
    'm0': '#6a8a58', 'm1': '#8aac6a',
    # bitume (accordé aux pavés)
    'a0': '#3e4046', 'a1': '#4c4e54', 'a2': '#585a60', 'a3': '#64666c', 'a4': '#7a7c82', 'aw': '#eeeee6', 'ay': '#f0c848',
    # grotte brune (Grotte Lunaire : #866445)
    'c0': '#3e2c1e', 'c1': '#583f29', 'c2': '#6c4e35', 'c3': '#7d5e40', 'c4': '#866445', 'c5': '#8f6b49', 'c6': '#a8845e', 'c7': '#c4a07a',
    # grotte grise (Grotte des Marées : #61737e)
    'k0': '#262e36', 'k1': '#3a464e', 'k2': '#4a5862', 'k3': '#5b6b75', 'k4': '#61737e', 'k5': '#6a7d88', 'k6': '#8295a0', 'k7': '#a2b4be',
}
NAMES = list(PAL); I = {k: i for i, k in enumerate(NAMES)}
RGB = np.array([[int(PAL[k][i:i + 2], 16) for i in (1, 3, 5)] for k in NAMES], np.uint8)
def ramp(*keys): return np.array([I[k] for k in keys])
CAVE_BRUN = ramp('c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7')
CAVE_GRIS = ramp('k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7')

# ------------------------------------------------------------------ petits motifs ----------------------------------
def put(img, mask, y, x, c):
    if 0 <= y < img.shape[0] and 0 <= x < img.shape[1] and mask[y, x]: img[y, x] = I[c] if isinstance(c, str) else c

def tuft(img, m, y, x, r, big=False):
    """touffe du jeu : 3 (ou 5) brins en éventail, pied sombre, pointes claires"""
    blades = [(-1, 3, -1), (0, 4, 0), (1, 3, 1)] + ([(-2, 2, -1), (2, 2, 1)] if big else [])
    for dx, L, lean in blades:
        for j in range(L):
            xx = x + dx + (lean if j >= L - 1 else 0)
            put(img, m, y - j, xx, 'g0' if j == 0 else 'g3' if j == L - 1 else 'g1')

def blade1(img, m, y, x, r):
    L = 2 + (r.random() < 0.4)
    for j in range(L): put(img, m, y - j, x, 'g1' if j < L - 1 else ('g3' if r.random() < 0.5 else 'g1'))

def pebbles2(img, m, y, x, r):
    """paire de cailloux du jeu"""
    for dy, dx, w in ((0, 0, 2), (1, 3, 1)) if r.random() < 0.6 else ((0, 0, 1), (0, 2, 2)):
        for i in range(w): put(img, m, y + dy, x + dx + i, 'p2'); put(img, m, y + dy + 1, x + dx + i, 'p1')
        put(img, m, y + dy, x + dx, 'p3'); put(img, m, y + dy + 2, x + dx + 1, 'g1')

def twig(img, m, y, x, r):
    s = r.choice([-1, 1])
    for i in range(4): put(img, m, y + (i // 2), x + s * i, 't1' if i % 2 else 't0')

def flowers(img, m, y, x, r, kind):
    for _ in range(int(r.integers(2, 6))):
        fy, fx = y + int(r.integers(-3, 4)), x + int(r.integers(-4, 5))
        put(img, m, fy + 1, fx, 'g1')
        for dy, dx in ((-1, 0), (0, -1), (0, 1), (1, 0)): put(img, m, fy + dy, fx + dx, kind)
        put(img, m, fy, fx, 'fy' if kind != 'fy' else 'fc')

def clover(img, m, y, x, r):
    for dy, dx, c in ((0, 0, 'g1'), (-1, 0, 'g1'), (0, -1, 'g1'), (0, 1, 'g1'), (-1, -1, 'gA'), (-1, 1, 'gA'), (1, 0, 'g0')):
        put(img, m, y + dy, x + dx, c)

# ------------------------------------------------------------------ matériaux --------------------------------------
def mark(img, m, y, x, v):
    """la marque d'herbe du jeu (« ψ » : deux brins, cœur clair), au pixel près au lieu de blocs 2 × 2 ; 4 variantes"""
    shapes = [((0, 1, 'g1'), (0, 3, 'g0'), (1, 0, 'g1'), (1, 1, 'g3'), (1, 2, 'g1')),
              ((0, 0, 'g0'), (0, 2, 'g1'), (1, 1, 'g1'), (1, 2, 'g3'), (1, 3, 'g1')),
              ((0, 1, 'g1'), (1, 0, 'g1'), (1, 1, 'g3'), (1, 2, 'g1'), (2, 1, 'g0')),
              ((0, 0, 'g1'), (0, 2, 'g1'), (1, 1, 'g3'), (2, 1, 'g0'))]
    for dy, dx, c in shapes[int(v * 4) % 4]: put(img, m, y + dy, x + dx, c)

def herbe(cv, img, mask, flowers_force):
    """herbe du jeu : aplat #74c460 et marques en « ψ », mais placées librement et plus ou moins serrées selon
    l'endroit (zones fournies, zones rases), avec touffes, cailloux, brindilles, trèfles et fleurs du même dessin"""
    X, Y, s, k = cv.X, cv.Y, cv.seed, cv.cell / 32
    img[mask] = I['g2']
    lush = fbm(X, Y, 60 * k, s + 2)
    colony = fbm(X, Y, 50 * k, s + 3, 2)
    kinds = ['fr', 'fw', 'fb', 'fp']
    items = []
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 10); c = cv.cell
            L = float(lush[min(cy * c + c // 2, cv.h - 1), min(cx * c + c // 2, cv.w - 1)])
            force = bool(flowers_force[cy, cx])
            def pick(): return cy * c + int(r.integers(1, c - 2)), cx * c + int(r.integers(1, c - 3))
            for _ in range(r.poisson(5 + 16 * L ** 1.5)): items.append((*pick(), 0, r.random()))       # marques
            for _ in range(r.poisson(0.25 + 1.2 * L ** 2)): items.append((*pick(), 1, r.random()))    # touffes
            if r.random() < 0.08: items.append((*pick(), 2, r.random()))                             # cailloux
            if r.random() < 0.05: items.append((*pick(), 3, r.random()))                             # brindille
            if r.random() < 0.12 * L: items.append((*pick(), 4, r.random()))                         # trèfle
            fy, fx = pick()
            if force or (colony[fy, fx] > 0.7 and r.random() < 0.5):
                for _ in range(3 if force else 1): items.append((*pick(), 5, r.random()))
    items.sort()
    for y, x, kind, v in items:
        if not mask[y, x]: continue
        r = np.random.default_rng(int(hash2(x + cv.x0 * cv.cell, y + cv.y0 * cv.cell, s + 11) * 2 ** 31))
        if kind == 0: mark(img, mask, y, x, v)
        elif kind == 1: tuft(img, mask, y + 2, x + 1, r, big=v < 0.3)
        elif kind == 2: pebbles2(img, mask, y, x, r)
        elif kind == 3: twig(img, mask, y, x, r)
        elif kind == 4: clover(img, mask, y, x, r)
        else: flowers(img, mask, y, x, r, kinds[int(colony[y, x] * 37) % 4])

def hautes_herbes(cv, img, mask):
    """hautes herbes du jeu : rangées de feuilles (bord gauche clair, cœur, ombre à droite, pointe très claire),
    deux fois plus fines, chaque feuille avec sa hauteur, sa largeur et son inclinaison"""
    X, Y, s = cv.X, cv.Y, cv.seed
    sh = ndimage.shift(mask.astype(float), (2, 0), order=0, cval=0) > 0.5
    img[sh & ~mask] = I['g0']
    img[mask] = I['h0']
    leaves = []
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 21)
            for row in range(cv.cell // 8):                       # une rangée tous les 8 px (le jeu : 16)
                yb = cy * cv.cell + row * 8 + 8
                x = cx * cv.cell + (row % 2) * 2 - 1
                while x < (cx + 1) * cv.cell:
                    w = int(r.choice([3, 3, 4])); hgt = int(r.integers(6, 9)); lean = int(r.choice([0, 0, 1]))
                    leaves.append((yb, x, w, hgt, lean, r.random()))
                    x += w + 1
    leaves.sort()
    for yb, x, w, hgt, lean, v in leaves:
        for j in range(hgt):
            yy = yb - j
            sx = x + (lean if j > hgt * 0.6 else 0)
            ww = w if j < hgt - 2 else max(1, w - 1 - (j - (hgt - 2)))
            for i in range(ww):
                xx = sx + i
                if not (0 <= yy < cv.h and 0 <= xx < cv.w) or not mask[yy, xx]: continue
                c = 'h4' if i == 0 else ('h2' if i == ww - 1 and ww > 2 else 'h3')
                if j < 2: c = 'h2' if i < ww - 1 else 'h1'
                if j == hgt - 1: c = 'h5' if v < 0.7 else 'h4'
                img[yy, xx] = I[c]
        if v > 0.97: put(img, mask, yb - hgt, x + 1, 'fw')       # une fleur cachée de temps en temps

def sable(cv, img, mask, block):
    """chemin de sable du jeu : aplat clair, bord en deux tons, grains et petits cailloux, brins qui débordent"""
    X, Y, s, k = cv.X, cv.Y, cv.seed, cv.cell / 32
    img[mask] = I['d4']
    img[mask & (fbm(X, Y, 40 * k, s + 30) < 0.25) & (hash2(X, Y, s + 35) < 0.5)] = I['dA']
    g = hash2(X, Y, s + 31)
    img[mask & (g < 0.018)] = I['d5']; img[mask & (g > 0.986)] = I['d3']
    din = ndimage.distance_transform_edt(mask)
    img[mask & (din <= 2.2)] = I['d3']; img[mask & (din <= 1.2)] = I['d2']
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 32)
            for _ in range(r.poisson(0.5)):
                y, x = cy * cv.cell + int(r.integers(2, cv.cell - 3)), cx * cv.cell + int(r.integers(2, cv.cell - 3))
                if mask[y, x] and din[y, x] > 4:
                    put(img, mask, y, x, 'd5'); put(img, mask, y, x + 1, 'd1'); put(img, mask, y + 1, x, 'd1'); put(img, mask, y + 1, x + 1, 'd0')
    ring = ndimage.binary_dilation(mask, iterations=1) & ~mask & ~block
    ys, xs = np.nonzero(ring)
    sel = hash2(X[ys, xs], Y[ys, xs], s + 33) < 0.12
    for y, x in zip(ys[sel], xs[sel]):
        for j in range(2 + int(hash2(X[y, x], Y[y, x], s + 34) < 0.4)):
            if 0 <= y - j: img[y - j, x] = I['g1'] if j == 0 else I['g3']

def eau(cv, img, mask, land, rocky=None):
    """eau du jeu : aplat vif, nombreux petits reflets, berge de terre sombre (ou de roche en grotte)"""
    X, Y, s, k = cv.X, cv.Y, cv.seed, cv.cell / 32
    dw = ndimage.distance_transform_edt(mask)
    img[mask] = I['w2']
    img[mask & (dw <= 2.5)] = I['w1']; img[mask & (dw <= 1.2)] = I['w0']             # ombre de la berge
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 41)
            for _ in range(r.poisson(30)):
                y, x = cy * cv.cell + int(r.integers(0, cv.cell)), cx * cv.cell + int(r.integers(0, cv.cell))
                if not mask[y, x] or dw[y, x] < 4: continue
                L = int(r.integers(2, 7)); col = 'w4' if r.random() < 0.25 else 'w3' if r.random() < 0.8 else 'w1'
                for i in range(L): put(img, mask, y, x + i, col)
                if r.random() < 0.04: put(img, mask, y, x + L // 2, 'w5')
    bank = ndimage.binary_dilation(mask, iterations=2) & ~mask & land
    sd = ndimage.distance_transform_edt(~mask)
    if rocky is None:
        img[bank] = I['r1']; img[bank & (sd <= 1.2)] = I['r0']
        lip = ndimage.binary_dilation(bank) & ~bank & ~mask & land; img[lip] = I['g1']
    else:
        img[bank] = rocky[6]; img[bank & (sd <= 1.2)] = rocky[1]

def pont(cv, img, cells):
    """pont de planches du jeu (planches dans le sens de la marche, joints décalés, ombre sur l'eau)"""
    c = cv.cell
    for cy, cx in zip(*np.nonzero(cells)):
        horiz = (cx > 0 and cells[cy, cx - 1]) or (cx < cv.cw - 1 and cells[cy, cx + 1])
        tile = np.zeros((c, c), np.int64); tile[:] = I['w1']
        a, b = c // 8, c - c // 8
        for yy in range(a, b):
            row = (yy - a) // 4
            seam = (int(hash2(row, cx + cv.x0, cv.seed + 60) * 12) + (cx + cv.x0) * 32)
            for xx in range(c):
                col = 'b2' if row % 2 else 'b3'
                if (yy - a) % 4 == 3: col = 'b1'
                if (xx + seam) % 16 == 0: col = 'b1'
                tile[yy, xx] = I[col]
        tile[a, :] = I['b4']; tile[b - 1, :] = I['b0']; tile[b:b + 2, :] = I['w0']
        if not horiz: tile = tile.T
        img[cy * c:(cy + 1) * c, cx * c:(cx + 1) * c] = tile

def paves(cv, img, mask):
    """pavés de ville du jeu : petits carrés gris réguliers, mais chaque pierre a sa teinte, usure, mousse, fissures"""
    X, Y, s, k = cv.X, cv.Y, cv.seed, cv.cell / 32
    p = max(4, int(5 * k))
    ly, lx = Y % p, X % p
    stone = hash2(X // p, Y // p, s + 70)
    area = fbm(X, Y, 60 * k, s + 71)
    tone = np.where(stone < 0.45, I['v5'], np.where(stone < 0.8, I['v4'], I['v3']))
    tone = np.where((area < 0.3) & (stone < 0.6), I['v3'], tone)
    out = tone.copy()
    out = np.where((ly == 0) & (lx < p - 1), I['v6'], out)
    out = np.where((ly == p - 2) & (lx > 0) & (lx < p - 1), I['v2'], out)
    joint = (ly == p - 1) | (lx == p - 1)
    out = np.where(joint, I['v1'], out)
    moss = joint & (fbm(X, Y, 20 * k, s + 72, 2) > 0.66) & (hash2(X, Y, s + 73) < 0.35)
    out = np.where(moss, I['m0'], out)
    broken = stone > 0.985
    out = np.where(broken & ~joint & (hash2(X, Y, s + 74) < 0.5), I['v2'], out)
    img[mask] = out[mask]
    din = ndimage.distance_transform_edt(mask)
    img[mask & (din <= 1.2)] = I['v0']

def bitume(cv, img, mask):
    X, Y, s, k = cv.X, cv.Y, cv.seed, cv.cell / 32
    img[mask] = I['a2']
    img[mask & (fbm(X, Y, 50 * k, s + 80) < 0.35)] = I['a1']
    g = hash2(X, Y, s + 81)
    img[mask & (g < 0.06)] = I['a3']; img[mask & (g > 0.97)] = I['a1']; img[mask & (g > 0.996)] = I['a4']
    din = ndimage.distance_transform_edt(mask)
    img[mask & (din <= 1.2)] = I['a0']
    img[mask & (din > 2.5) & (din <= 3.5)] = I['aw']
    ridge = mask & (din >= ndimage.maximum_filter(din, size=3) - 0.01) & (din > cv.cell * 0.9)
    img[ridge & ((X // 8 + Y // 8) % 2 == 0)] = I['ay']
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 82)
            if r.random() > 0.15: continue
            y, x = cy * cv.cell + int(r.integers(4, cv.cell - 4)), cx * cv.cell + int(r.integers(4, cv.cell - 4))
            for _ in range(int(r.integers(6, 14))):
                if 0 <= y < cv.h and 0 <= x < cv.w and mask[y, x] and din[y, x] > 4: img[y, x] = I['a0']
                x += int(r.choice([-1, 0, 1])); y += int(r.choice([0, 1]))

def crack(img, m, y, x, r, col, hl, n):
    """fissure du jeu : segments presque droits (directions à 45°), qui se ramifient en Y, reflet clair dessous"""
    dirs = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]
    stack = [(y, x, int(r.integers(0, 8)), n)]
    while stack:
        y, x, d, n = stack.pop()
        for i in range(n):
            put(img, m, y, x, col)
            if r.random() < 0.18: put(img, m, y + 1, x, hl)
            if r.random() < 0.22: d = (d + int(r.choice([-1, 1]))) % 8
            dy, dx = dirs[d]; y += dy; x += dx
            if i > 2 and r.random() < 0.09 and n > 5: stack.append((y, x, (d + int(r.choice([-2, 2]))) % 8, n // 2))

def ring(img, m, y, x, C):
    """petit caillou du jeu : anneau sombre, cœur clair, reflet en haut"""
    for dx in (1, 2, 3): put(img, m, y, x + dx, C[2]); put(img, m, y + 3, x + dx, C[1])
    for dy in (1, 2): put(img, m, y + dy, x, C[2]); put(img, m, y + dy, x + 4, C[1])
    for dy in (1, 2):
        for dx in (1, 2, 3): put(img, m, y + dy, x + dx, C[5])
    put(img, m, y + 1, x + 1, C[6]); put(img, m, y + 1, x + 2, C[7])

def grotte(cv, img, mask, C):
    """sol de grotte du jeu : aplat, fissures ramifiées, petits cailloux en anneau, nappes de poussière pointillée ;
    tout ça deux fois plus fin, et plus ou moins dense selon l'endroit"""
    X, Y, s, k = cv.X, cv.Y, cv.seed, cv.cell / 32
    img[mask] = C[4]
    g = hash2(X, Y, s + 90)
    img[mask & (g < 0.025)] = C[5]; img[mask & (g > 0.985)] = C[3]                 # grain très léger
    dust = fbm(X, Y, 40 * k, s + 91, 2)
    dots = mask & (dust > 0.55) & (hash2(X, Y, s + 92) < 0.08 + 0.3 * (dust - 0.55))
    img[dots] = C[3]                                                                 # poussière pointillée
    rich = fbm(X, Y, 60 * k, s + 93)
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 94); c = cv.cell
            L = float(rich[min(cy * c + c // 2, cv.h - 1), min(cx * c + c // 2, cv.w - 1)])
            def pick(): return cy * c + int(r.integers(2, c - 4)), cx * c + int(r.integers(2, c - 5))
            for _ in range(r.poisson(0.1 + 3.0 * max(0, L - 0.4))):              # fissures : par zones
                y, x = pick()
                if mask[y, x]: crack(img, mask, y, x, r, C[2], C[6], int(r.integers(8, 18)))
            for _ in range(r.poisson(0.35 + 0.9 * (1 - L))):                         # groupes de cailloux, ailleurs
                y, x = pick()
                for _ in range(int(r.integers(3, 8))):
                    yy, xx = y + int(r.integers(-5, 6)), x + int(r.integers(-6, 7))
                    if r.random() < 0.55: ring(img, mask, yy, xx, C)
                    else: put(img, mask, yy, xx, C[2]); put(img, mask, yy - 1, xx, C[6])

def paroi(cv, img, mask, C):
    """paroi vue de dessus (en jeu, c'est le relief 3D) : dessus clair comme dans le jeu, rebord sombre, ombre au pied"""
    X, Y, s = cv.X, cv.Y, cv.seed
    img[mask] = C[6]
    img[mask & (fbm(X, Y, 14, s + 95, 2) < 0.38)] = C[5]
    img[mask & (hash2(X, Y, s + 96) < 0.03)] = C[7]
    din = ndimage.distance_transform_edt(mask)
    img[mask & (din <= 5)] = C[3]; img[mask & (din <= 2)] = C[1]
    sh = (ndimage.shift(mask.astype(float), (3, 1), order=0, cval=0) > 0.5) & ~mask
    img[sh] = C[3]

def massifs(cv, img, mask):
    X, Y, s, k = cv.X, cv.Y, cv.seed, cv.cell / 32
    din = ndimage.distance_transform_edt(mask)
    img[mask] = I['c3']; img[mask & (hash2(X, Y, s + 97) < 0.2)] = I['c2']
    border = mask & (din <= 4 * k + 0.5)
    img[border] = I['g1']; img[border & (din <= 1.2)] = I['g0']; img[border & (hash2(X, Y, s + 98) < 0.25)] = I['g2']
    kinds = ['fr', 'fp', 'fy', 'fw', 'fb']
    bed = fbm(X, Y, 18 * k, s + 99, 2)
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 100)
            for _ in range(int(cv.cell * cv.cell / 9)):
                y, x = cy * cv.cell + int(r.integers(1, cv.cell - 2)), cx * cv.cell + int(r.integers(1, cv.cell - 2))
                if not mask[y, x] or din[y, x] <= 4 * k + 1: continue
                kd = kinds[int(bed[y, x] * 5) % 5]
                put(img, mask, y + 1, x, 'g1'); put(img, mask, y, x, kd); put(img, mask, y - 1, x, kd); put(img, mask, y, x + 1, 'g0')

def rebords(cv, img, t):
    c = cv.cell
    for cy, cx in zip(*np.nonzero(t == T['LEDGE'])):
        y0, x0 = cy * c, cx * c
        yb = y0 + c // 2; fh = max(4, c // 4)
        for x in range(x0, x0 + c):
            wob = int(hash2(cv.X[0, x] // 4, cy, cv.seed + 50) * 2)
            top = yb - wob
            img[top - 2:top, x] = I['g2']; img[top - 3, x] = I['g3']
            img[top:yb + fh, x] = I['d2']; img[top, x] = I['d4']; img[top + 1, x] = I['d3']
            if (x + cy) % 6 == 0: img[top + 2:yb + fh - 1, x] = I['d1']
            img[yb + fh - 1, x] = I['d0']; img[yb + fh:yb + fh + 2, x] = I['g1']

# ------------------------------------------------------------------ assemblage ------------------------------------
def render(t, x0=0, y0=0, cell=32, seed=7, cave_pal=None):
    cv = Carte(t, x0, y0, cell, seed)
    c = lambda *n: [T[k] for k in n]
    img = np.zeros((cv.h, cv.w), np.int64)
    water, _ = cv.region(c('WATER', 'BRIDGE'), seed + 100, wobble=0.6, round_=0.45)
    path, _ = cv.region(c('PATH', 'DOOR', 'STAIRS'), seed + 101, wobble=0.45, round_=0.6, band=cell // 2)
    asphalt, _ = cv.region(c('ASPHALT'), seed + 102, wobble=0.0, round_=0.12)
    pave, _ = cv.region(c('PAVE'), seed + 103, wobble=0.0, round_=0.06)
    cave, _ = cv.region(c('CAVE', 'CAVEDOOR', 'BLOCK'), seed + 104, wobble=0.6, round_=0.3)
    park, _ = cv.region(c('PARK'), seed + 105, wobble=0.0, round_=0.2)
    tall, _ = cv.region(c('TALL', 'DARKTALL'), seed + 106, wobble=0.25, round_=0.08)   # rectangulaire, comme HGSS
    near_wall = ndimage.binary_dilation(cv.px(t == T['CAVEWALL']), iterations=cv.band + 1)
    wall = near_wall & ~(cave | water | path | asphalt | pave | park)
    hard = water | asphalt | pave | cave | park | wall
    path &= ~hard; tall &= ~(hard | path)
    grass = ~(hard | path | tall)
    C = cave_pal if cave_pal is not None else CAVE_BRUN
    herbe(cv, img, grass, t == T['FLOWER'])
    if tall.any(): hautes_herbes(cv, img, tall)
    if path.any(): sable(cv, img, path, water | hard | tall)
    if cave.any(): grotte(cv, img, cave, C)
    if wall.any(): paroi(cv, img, wall, C)
    if water.any(): eau(cv, img, water, ~(water | hard) | cave | wall, rocky=C if cave.any() else None)
    if asphalt.any(): bitume(cv, img, asphalt)
    if pave.any(): paves(cv, img, pave)
    if park.any(): massifs(cv, img, park)
    pont(cv, img, t == T['BRIDGE'])
    rebords(cv, img, t)
    return cv, img

def sprites(cv, rgb, t):
    t2 = t.copy(); t2[t2 == T['BLOCK']] = T['ROCK']
    return sprites2(cv, rgb, t2)

def load(id, box):
    src = f'/tmp/{id}.json'
    if not os.path.exists(src): os.system(f'node {os.path.join(ROOT, "tools", "pixelforge", "dump-carte.mjs")} {id} {src}')
    m = json.load(open(src)); t = np.array(m['t']).reshape(m['h'], m['w'])
    x0, y0, x1, y1 = box
    return t[y0:y1, x0:x1], x0, y0

CARTES = {
    'route': ('monde', (22, 198, 58, 223), None),
    'grotte': ('grotte', (11, 8, 36, 25), CAVE_BRUN),
    'marees': ('marees', (9, 12, 34, 29), CAVE_GRIS),
    'ville': ('monde', (14, 150, 50, 168), None),
}

if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k, d: type(d)(a[a.index(k) + 1]) if k in a else d
    out = opt('--out', 'carte.png'); cell = opt('--cell', 32); seed = opt('--seed', 7)
    id, box, pal = CARTES[a[0]]
    t, x0, y0 = load(id, box)
    cv, img = render(t, x0, y0, cell, seed, pal)
    rgb = np.array(sprites(cv, RGB[img], t)) if '--no-sprites' not in a else RGB[img]
    Image.fromarray(rgb).save(out)
    print(f'{out} : {cv.cw}x{cv.ch} cases = {cv.w}x{cv.h}')
