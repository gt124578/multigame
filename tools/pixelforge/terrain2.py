#!/usr/bin/env python3
# Odyssée — PixelForge / terrain v2 : sol en pixel art généré à partir de la GRILLE du jeu (codes T de tiles.js).
#
#   python3 tools/pixelforge/terrain2.py route --out out/route1.png          (vraie Route 1, extraite du jeu)
#   python3 tools/pixelforge/terrain2.py grille.json --out out/carte.png     ({"w","h","t":[...], "x0","y0"})
#   options : --cell 32  --seed 7  --debug (superpose la grille logique)  --no-sprites
#
# Trois règles :
#  1. la grille reste la seule vérité du jeu (rencontres, pêche, collisions) : un bord organique ne s'écarte jamais
#     de plus de BAND (un quart de case) de la limite entre deux cases ; le cœur d'une case garde toujours son terrain ;
#  2. tout le hasard dépend de la position dans le monde (bruit et graines par case) : retoucher une case dans
#     l'éditeur ne change que cette case et ses voisines, le reste de la carte est identique au pixel près ;
#  3. vrai pixel art : palette fixe, aucun anti-crénelage, lumière venant du haut à gauche, ombres en bas à droite.
#
# Prérequis : pip install pillow numpy scipy
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ------------------------------------------------------------------ codes de terrain (odyssee/js/world/tiles.js) ---
T = dict(GRASS=0, PATH=1, TALL=2, TREE=3, WATER=4, SAND=5, FLOWER=6, FENCE=7, ROCK=8, LEDGE=9, BUILD=10, DOOR=11,
         PAVE=12, BRIDGE=13, SIGN=14, CAVE=15, CAVEWALL=16, FLOOR=17, WALL=18, BLOCK=19, MAT=20, STAIRS=21, ASH=22,
         PINE=23, BUSH=24, CAVEDOOR=25, SNOW=26, DARKTALL=27, LEDGE_E=28, LEDGE_W=29, CUT=30, SMASH=31, BOULDER=32)
T['ASPHALT'] = 40    # nouveau : route en bitume
T['PARK'] = 41       # nouveau : massif fleuri de parc

# ------------------------------------------------------------------ palette ---------------------------------------
PAL = {
    'g0': '#1f5a2e', 'g1': '#2c7236', 'g2': '#3d8c3c', 'g3': '#52a446', 'g4': '#6cbb52', 'g5': '#8ad064', 'g6': '#b4e47e',
    'h0': '#173f2a', 'h1': '#1f5a34', 'h2': '#2f7a3a', 'h3': '#45984a', 'h4': '#6abc5c',
    'd0': '#6e4f33', 'd1': '#8c6a44', 'd2': '#a88655', 'd3': '#c2a06a', 'd4': '#d6b882', 'd5': '#e8d0a0',
    'p0': '#4e5052', 'p1': '#7a7c7a', 'p2': '#a4a6a0', 'p3': '#cfd0c8',
    's0': '#b09460', 's1': '#d2b880', 's2': '#e8d6a2',
    'w0': '#1e4a9c', 'w1': '#2862be', 'w2': '#357ed6', 'w3': '#4c9ae6', 'w4': '#6cb8ee', 'w5': '#9ad6f4', 'w6': '#e6f6ff',
    'fr': '#e24a4a', 'fR': '#a02c3a', 'fy': '#f6d84a', 'fw': '#f8f8f0', 'fW': '#c8ccd8', 'fb': '#7a8ef0', 'fB': '#4a58b8',
    'fp': '#f08ac0', 'fP': '#b04a88', 'fo': '#f8a040',
    # bois (ponts, rebords)
    'b0': '#4a3020', 'b1': '#6e4a2c', 'b2': '#946840', 'b3': '#b88a58',
    # bitume
    'a0': '#2a2c32', 'a1': '#3a3c44', 'a2': '#4a4c56', 'a3': '#5c5e68', 'a4': '#74767e', 'aw': '#e8e8e0', 'ay': '#e8c040',
    # pavés de ville
    'v0': '#5e5850', 'v1': '#847c70', 'v2': '#a49a8a', 'v3': '#beb4a2', 'v4': '#d6cebc', 'm0': '#4a6a3a', 'm1': '#6a8a4a',
    # grotte
    'c0': '#2e2620', 'c1': '#463a30', 'c2': '#5e4e40', 'c3': '#7a6652', 'c4': '#968068', 'c5': '#b49c80',
    'cw': '#3a5a7a', 'cW': '#5a86a8', 'cg': '#7ac0c8',
    # rebords façon HGSS (bourrelet de roche brune)
    'l0': '#3a2a22', 'l1': '#5e4434', 'l2': '#7e604c', 'l3': '#a08066', 'l4': '#c4a486', 'l5': '#e2c8a6',
    # eau : profond, haut-fond
    'wd': '#173f94', 'wt': '#5cc0e8',
    # contrôle
    'xr': '#ff3050', 'xc': '#30e8ff', 'xk': '#000000',
}
NAMES = list(PAL)
IDX = {k: i for i, k in enumerate(NAMES)}
RGB = np.array([[int(PAL[k][i:i + 2], 16) for i in (1, 3, 5)] for k in NAMES], np.uint8)
def ramp(p, n): return np.array([IDX[f'{p}{i}'] for i in range(n)])
G, H, D, P, S, W = ramp('g', 7), ramp('h', 5), ramp('d', 6), ramp('p', 4), ramp('s', 3), ramp('w', 7)
B, A, V, C, L_ = ramp('b', 4), ramp('a', 5), ramp('v', 5), ramp('c', 6), ramp('l', 6)
I = IDX

# ------------------------------------------------------------------ hasard lié à la position --------------------
def hash2(x, y, s):
    """hachage entier → [0, 1), vectorisé ; même (x, y, s) = même valeur, partout et toujours"""
    h = (np.asarray(x, np.int64) * 374761393 + np.asarray(y, np.int64) * 668265263 + s * 2246822519) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296.0

def vnoise(X, Y, scale, s):
    """bruit de valeur sur un réseau fixé dans le monde (pas sur l'image) : stable quand on retouche la carte"""
    fx, fy = X / scale, Y / scale
    ix, iy = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    tx, ty = fx - ix, fy - iy
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a, b = hash2(ix, iy, s), hash2(ix + 1, iy, s)
    c, d = hash2(ix, iy + 1, s), hash2(ix + 1, iy + 1, s)
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty

def fbm(X, Y, scale, s, octaves=3):
    out = np.zeros(X.shape); amp = 1; tot = 0
    for o in range(octaves):
        out += amp * vnoise(X, Y, max(1.5, scale), s * 31 + o); tot += amp; amp *= 0.5; scale /= 2
    return out / tot

def cell_rng(cx, cy, s):
    return np.random.default_rng(int(hash2(cx, cy, s) * 2 ** 32) ^ (s * 7919))

# ------------------------------------------------------------------ carte ------------------------------------------
class Carte:
    def __init__(self, t, x0=0, y0=0, cell=32, seed=7):
        self.t = np.asarray(t); self.ch, self.cw = self.t.shape
        self.x0, self.y0, self.cell, self.seed = x0, y0, cell, seed
        self.h, self.w = self.ch * cell, self.cw * cell
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        self.X = xx + x0 * cell; self.Y = yy + y0 * cell        # coordonnées monde, en pixels
        self.band = cell // 4

    def px(self, cells_mask):
        return np.kron(cells_mask.astype(np.uint8), np.ones((self.cell, self.cell), np.uint8)).astype(bool)

    def region(self, codes, s, wobble=1.0, round_=0.35, band=None, freq=0.4):
        """cases de ces terrains → région au pixel près : coins arrondis et bord bruité, mais bornés à ±band.
        band = 1/4 de case pour ce qui compte en jeu (hautes herbes, eau) ; les sols purement décoratifs (chemin)
        peuvent s'écarter davantage, puisque marcher sur l'un ou l'autre ne change rien"""
        band = self.band if band is None else band
        m = np.isin(self.t, codes); mp = self.px(m)
        din = ndimage.distance_transform_edt(mp); dout = ndimage.distance_transform_edt(~mp)
        sd = np.where(mp, din, -dout + 1)                              # distance signée à la limite des cases
        soft = ndimage.gaussian_filter(mp.astype(float), self.cell * round_) - 0.5
        n = fbm(self.X, self.Y, self.cell * freq, s) - 0.5
        f = sd / band * 0.3 + soft * 1.0 + n * wobble
        out = f > 0
        out[sd > band] = True; out[sd < -band] = False                   # la règle : jamais plus de band
        return out, mp

# ------------------------------------------------------------------ matériaux --------------------------------------
def blade(img, y, x, L, lean, base, pal, block=None, top=None):
    h, w = img.shape; top = len(pal) - 1 if top is None else top
    for i in range(L):
        yy = y - i; xx = x + (lean if i >= L - 1 - L // 3 else 0)
        if not (0 <= yy < h and 0 <= xx < w) or (block is not None and block[yy, xx]): continue
        img[yy, xx] = pal[max(0, base - 1)] if i == 0 else pal[min(top, base + 1)] if i == L - 1 else pal[base]

def herbe(cv, img, mask, block, flowers_force=None):
    """herbe rase : 3 tons en plaques + brins en V par case + colonies de fleurs"""
    X, Y, k, s = cv.X, cv.Y, cv.cell / 32, cv.seed
    light = fbm(X, Y, 120 * k, s + 1); patch = fbm(X, Y, 30 * k, s + 2)
    lv = np.digitize(0.65 * light + 0.35 * patch, [0.42, 0.58]) + 2
    img[mask] = G[lv + 1][mask]
    colony = fbm(X, Y, 70 * k, s + 3, 2)
    blades, flowers = [], []
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 10)
            n = int(cv.cell * cv.cell / 5.5)
            ys = r.integers(0, cv.cell, n) + cy * cv.cell; xs = r.integers(0, cv.cell, n) + cx * cv.cell
            Ls = r.choice([3, 3, 4, 4, 5], n); vs = r.random(n); leans = r.choice([-1, 0, 1], n)
            blades += zip(ys, xs, Ls, vs, leans)
            nf = int(cv.cell * cv.cell / 60) * (3 if flowers_force is not None and flowers_force[cy, cx] else 1)
            fy = r.integers(2, cv.cell - 2, nf) + cy * cv.cell; fx = r.integers(2, cv.cell - 2, nf) + cx * cv.cell
            flowers += zip(fy, fx, r.random(nf))
    blades.sort()
    for y, x, L, v, lean in blades:
        if not mask[y, x]: continue
        base = int(lv[y, x])
        if v < 0.55: blade(img, y, x, L, -1, base, G, block); blade(img, y, x + 1, L - 1, 1, base, G, block)
        else: blade(img, y, x, L, lean, base, G, block)
    kinds = [('fr', 'fR', 'fy'), ('fw', 'fW', 'fy'), ('fb', 'fB', 'fw')]
    h, w = img.shape
    for y, x, v in flowers:
        if not (2 <= y < h - 3 and 2 <= x < w - 2) or not mask[y, x]: continue
        force = flowers_force is not None and flowers_force[y // cv.cell, x // cv.cell]
        if colony[y, x] < 0.64 and not force: continue
        kd = kinds[int(colony[y, x] * 97 + v * 3) % 3]
        pe, sh, ce = I[kd[0]], I[kd[1]], I[kd[2]]
        img[y + 1, x + 1] = G[1]; img[y + 2, x] = G[2]
        img[y - 1, x] = pe; img[y, x - 1] = pe; img[y, x + 1] = sh; img[y + 1, x] = sh; img[y, x] = ce
    return lv

def hautes_herbes(cv, img, mask, lv):
    """hautes herbes : tapis de longs brins dessinés de l'arrière vers l'avant, ombre portée sur l'herbe rase"""
    X, Y, k, s = cv.X, cv.Y, cv.cell / 32, cv.seed
    shadow = ndimage.shift(mask.astype(float), (3, 2), order=0, cval=0) > 0.5
    m = shadow & ~mask; img[m] = G[np.clip(lv - 2, 0, 6)][m]
    img[mask] = H[1]
    dark = mask & (fbm(X, Y, 16 * k, s + 20, 2) < 0.45); img[dark] = H[0]
    d = ndimage.distance_transform_edt(mask)
    bl = []
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 21); n = int(cv.cell * cv.cell / 4)
            bl += zip(r.integers(0, cv.cell, n) + cy * cv.cell, r.integers(0, cv.cell, n) + cx * cv.cell,
                      r.integers(0, 4, n), r.choice([-1, 1], n), r.random(n))
    bl.sort()
    for y, x, e, lean, v in bl:
        if not mask[y, x]: continue
        L = int(4 + e + min(2, d[y, x] / 5))
        # touffes en V : deux brins par pied, pointes claires
        for dx, ln in ((0, lean), (1, -lean)) if v < 0.6 else ((0, lean),):
            for j in range(L - (dx and 1)):
                yy, xx = y - j, x + dx + (ln if j > L * 0.55 else 0)
                if 0 <= yy < img.shape[0] and 0 <= xx < img.shape[1]:
                    img[yy, xx] = H[1] if j < L * 0.35 else H[2] if j < L * 0.75 else H[3]
                    if j == L - 1 - (dx and 1): img[yy, xx] = H[4]

def terre(cv, img, mask, block):
    """chemin de terre : milieu piétiné plus clair, lisière d'ombre, brins qui débordent, cailloux"""
    X, Y, k, s = cv.X, cv.Y, cv.cell / 32, cv.seed
    din = ndimage.distance_transform_edt(mask)
    t = 0.55 * fbm(X, Y, 14 * k, s + 30) + 0.45 * np.clip(din / (cv.cell * 0.5), 0, 1)
    dl = np.digitize(t, [0.32, 0.5, 0.66]) + 1
    img[mask] = D[dl][mask]
    g = hash2(X, Y, s + 31)
    m = mask & (g < 0.04); img[m] = D[np.clip(dl - 1, 0, 5)][m]
    m = mask & (g > 0.97); img[m] = D[np.clip(dl + 1, 0, 5)][m]
    img[mask & (din <= 1.5)] = D[0]
    up = ndimage.shift(mask.astype(float), (2, 1), order=0, cval=1) < 0.5     # bord haut/gauche : ombre portée de l'herbe
    img[mask & (din <= 3) & (din > 1.5) & up] = D[1]
    ring = ndimage.binary_dilation(mask, iterations=2) & ~mask & ~block
    ys, xs = np.nonzero(ring)
    sel = hash2(X[ys, xs], Y[ys, xs], s + 32) < 0.33
    for y, x in zip(ys[sel], xs[sel]):
        blade(img, y, x, 2 + int(hash2(X[y, x], Y[y, x], s + 33) < 0.5), 0, 3, G)
    pebbles(cv, img, mask & (din > 3), s + 34, D[0], 1 / 200)

def pebbles(cv, img, mask, s, shade, density):
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s)
            for _ in range(r.poisson(cv.cell * cv.cell * density)):
                y, x = cy * cv.cell + r.integers(1, cv.cell - 4), cx * cv.cell + r.integers(1, cv.cell - 4)
                if not mask[y, x]: continue
                wv, hv = (1, 1) if r.random() < 0.35 else (int(r.integers(2, 4)), 2)
                img[y + 1:y + hv + 1, x + 1:x + wv + 1] = shade
                img[y:y + hv, x:x + wv] = P[1]; img[y, x:x + wv] = P[2]; img[y, x] = P[3] if wv > 1 else P[2]

NFRAMES = 8

def eau(cv, img, mask, block, rocky=False, frame=0):
    """eau animée (NFRAMES images en boucle) : 4 profondeurs aux bords tramés, haut-fond clair, écume qui vient lécher
    la berge, sable mouillé, vaguelettes qui naissent / glissent / s'effacent, reflets qui scintillent, rides sombres au large"""
    X, Y, k, s = cv.X, cv.Y, cv.cell / 32, cv.seed
    ph = frame / NFRAMES
    shore = ndimage.binary_dilation(mask, iterations=max(2, int(4 * k))) & ~mask & ~block
    sd = ndimage.distance_transform_edt(~mask)
    sp = C[[1, 3, 4]] if rocky else S
    img[shore] = sp[2]; img[shore & (sd <= 2.5 * k + 0.5)] = sp[1]
    lap = np.sin(2 * np.pi * (ph + fbm(X, Y, 40 * k, s + 43, 2) * 2))                  # -1 .. 1, la vague va et vient
    wet = shore & (sd <= 1.5 + (lap > 0.3))
    img[wet] = sp[0]
    lip = ndimage.binary_dilation(shore) & ~shore & ~mask & ~block
    img[lip] = C[0] if rocky else G[1]
    dw = ndimage.distance_transform_edt(mask)
    depth = dw / (cv.cell * 1.1) + (fbm(X, Y, 20 * k, s + 40) - 0.5) * 0.35
    lvl = np.digitize(depth, [0.08, 0.26, 1.0, 3.0])                                     # 0 haut-fond .. 4 fond
    cols = np.array([I['wt'], W[4], W[3], W[2], I['wd']])
    dith = (depth - np.array([0.08, 0.26, 1.0, 3.0])[np.clip(lvl - 1, 0, 3)]) < 0.05     # trame aux changements
    lv2 = np.where(dith & (lvl > 0) & (((X + Y) % 2) == 0), lvl - 1, lvl)
    img[mask] = cols[lv2][mask]
    # écume : liseré au bord, qui avance et recule d'un pixel
    fd = 1.6 + 1.1 * (lap + 1) / 2
    foam = mask & (dw <= fd) & (hash2(X, Y, s + 44) < 0.8)
    img[foam] = W[6]; img[mask & (dw <= fd + 1.2) & ~foam & (hash2(X, Y, s + 45) < 0.35)] = W[5]
    h, w = img.shape
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 42)
            for _ in range(r.poisson(cv.cell * cv.cell / 110)):                         # vaguelettes
                y, x = cy * cv.cell + int(r.integers(0, cv.cell)), cx * cv.cell + int(r.integers(0, cv.cell))
                L, p0, kind = int(r.integers(3, 9)), r.random(), r.random()
                tau = (ph + p0) % 1
                if not (0 <= y < h - 1) or not mask[y, x] or dw[y, x] < 4 or tau > 0.75: continue
                ln = max(1, int(round(L * np.sin(np.pi * tau / 0.75))))
                xs = x + int(tau * 4) - ln // 2
                lv = int(lv2[y, x])
                for i in range(ln):
                    xx = xs + i
                    if 0 <= xx < w and mask[y, xx]:
                        img[y, xx] = W[6] if (kind < 0.15 and i == ln // 2) else (W[5] if lv <= 2 else W[4])
                    if 0 <= xx + 1 < w and mask[y + 1, xx + 1] and lv >= 2: img[y + 1, xx + 1] = W[1] if lv >= 3 else W[2]
            for _ in range(r.poisson(cv.cell * cv.cell / 700)):                         # reflets
                y, x = cy * cv.cell + int(r.integers(1, cv.cell - 1)), cx * cv.cell + int(r.integers(1, cv.cell - 1))
                tau = (ph + r.random()) % 1
                if not mask[y, x] or dw[y, x] < 6 or tau > 0.3: continue
                img[y, x] = W[6]
                if 0.08 < tau < 0.22:
                    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        if mask[y + dy, x + dx]: img[y + dy, x + dx] = W[5]
            for _ in range(r.poisson(cv.cell * cv.cell / 500)):                         # rides sombres au large
                y, x = cy * cv.cell + int(r.integers(0, cv.cell)), cx * cv.cell + int(r.integers(0, cv.cell - 8))
                tau = (ph + r.random()) % 1
                if not mask[y, x] or lv2[y, x] < 3 or tau > 0.6: continue
                xs = x - int(tau * 3)
                for i in range(int(r.integers(3, 6))):
                    if 0 <= xs + i < w and mask[y, xs + i]: img[y, xs + i] = I['wd'] if lv2[y, x] == 3 else W[0]
    return lv2

def ponton(cv, img, cells, frame=0):
    """ponton / pont de planches sur pilotis : planches en travers (teinte propre à chaque planche, joints, clous),
    longerons, pieux qui plongent dans l'eau avec un rond d'eau qui s'agrandit, ombre portée sur l'eau"""
    c = cv.cell; ph = frame / NFRAMES
    t = cv.t
    for cy, cx in zip(*np.nonzero(cells)):
        horiz = (cx > 0 and cells[cy, cx - 1]) or (cx < cv.cw - 1 and cells[cy, cx + 1])
        tile = img[cy * c:(cy + 1) * c, cx * c:(cx + 1) * c].copy()
        if not horiz: tile = tile.T
        a, b = c // 8, c - c // 8                            # largeur utile du ponton
        # ombre sur l'eau, sous le ponton
        tile[b:min(c, b + 5), :] = W[0]                                    # ombre sur l'eau
        tile[b:b + 2, :] = B[0]                                            # épaisseur du tablier
        # pieux (deux par case) qui plongent sous le tablier, avec un rond d'eau qui s'agrandit
        for px in (c // 6, c - c // 6 - 4):
            tile[b:min(c, b + 6), px:px + 4] = B[1]; tile[b:min(c, b + 6), px] = B[3]; tile[b:min(c, b + 6), px + 3] = B[0]
            rr = int(1 + 3 * ((ph + hash2(cx + cv.x0 + px, cy + cv.y0, cv.seed + 61)) % 1))
            yy = min(c - 1, b + 6)
            for dx in range(-rr, 4 + rr):
                if 0 <= px + dx < c: tile[yy, px + dx] = W[5] if abs(dx - 1.5) > rr else tile[yy, px + dx]
        # planches en travers
        x = 0
        while x < c:
            wv = 4 + int(hash2(x + (cx + cv.x0) * c, cy + cv.y0, cv.seed + 62) * 2)
            tone = B[2] if hash2(x + (cx + cv.x0) * c, cy, cv.seed + 63) < 0.5 else B[3]
            for xx in range(x, min(c, x + wv)):
                tile[a + 2:b - 2, xx] = tone
                for yy in range(a + 2, b - 2):
                    if hash2(xx + (cx + cv.x0) * c, yy + (cy + cv.y0) * c, cv.seed + 64) < 0.06: tile[yy, xx] = B[1]
            tile[a + 2:b - 2, min(c - 1, x + wv - 1)] = B[0]                 # joint
            if x + 1 < c: tile[a + 3, x + 1] = I['p3']; tile[b - 4, x + 1] = I['p3']       # clous
            x += wv
        tile[a:a + 2, :] = B[3]; tile[a + 1, :] = B[2]; tile[a, :] = I['b3'] if 'b3' in I else B[3]
        tile[b - 2:b, :] = B[1]; tile[b - 1, :] = B[0]
        if not horiz: tile = tile.T
        img[cy * c:(cy + 1) * c, cx * c:(cx + 1) * c] = tile

pont = ponton

def bande_rochers(n, H, seed, cup_a, cup_b):
    """bourrelet de rochers (longueur n, épaisseur H) façon HGSS, en indices de palette (-1 = vide) :
    rangée de cailloux arrondis (sommet festonné, reflet en haut à gauche, ombre en bas), contour sombre continu,
    extrémités relevées en coupelle (cup_a au début, cup_b à la fin)"""
    up = 4                                                       # hauteur des coupelles
    S_ = np.full((H + up, n), -1, np.int64)
    rng = np.random.default_rng(seed)
    x = 0
    while x < n:
        w = int(rng.integers(5, 8)); x1 = min(n, x + w)
        top = up + int(rng.integers(0, 3))
        cup = (cup_a and x < 5) or (cup_b and x1 > n - 5)
        if cup: top = 1
        for xx in range(x, x1):
            edge = xx in (x, x1 - 1)
            t0 = top + (1 if edge else 0)                       # sommet arrondi de chaque rocher
            hh = H + up - t0
            for yy in range(t0, H + up):
                d = yy - t0; f = d / max(1, hh)
                if d == 0: col = L_[4]
                elif d <= 2: col = L_[5] if (xx - x <= 1 and d == 1) else L_[3]
                elif f < 0.5: col = L_[3] if rng.random() > 0.25 else L_[2]          # rochers éclairés
                elif f < 0.58: col = L_[2]                                           # arête
                else: col = L_[1] if rng.random() > 0.15 else L_[2]                  # face sombre
                if edge and 0 < f < 0.5: col = L_[2] if xx == x1 - 1 else col
                S_[yy, xx] = col
            S_[t0 - 1 if t0 > 0 else 0, xx] = L_[0]                 # contour du sommet festonné
        x = x1
    S_[-1, :] = L_[0]; S_[-2, :] = np.where(S_[-2, :] >= 0, L_[1], S_[-2, :])
    for xx in (0, n - 1):                                       # contour des bouts
        col = S_[:, xx]; S_[:, xx] = np.where(col >= 0, L_[0], col)
    return S_

def rebords(cv, img, t):
    """rebords façon HGSS : bourrelet de rochers bruns, coupelles relevées aux extrémités, ombre du côté du saut"""
    c = cv.cell; s = cv.seed
    h, w = img.shape
    def shadow(y, x):
        if 0 <= y < h and 0 <= x < w:
            v = img[y, x]
            img[y, x] = G[1] if v in G[2:] else (S[0] if v in S else D[0] if v in D else v)
    def paste(strip, y0, x0, transpose=False):
        if transpose: strip = strip.T
        for (yy, xx), v in np.ndenumerate(strip):
            if v >= 0 and 0 <= y0 + yy < h and 0 <= x0 + xx < w: img[y0 + yy, x0 + xx] = v
    led = lambda code: (t == code)
    # rebords horizontaux (on saute vers le bas) : par segments continus
    m = led(T['LEDGE'])
    for cy in range(cv.ch):
        cx = 0
        while cx < cv.cw:
            if not m[cy, cx]: cx += 1; continue
            c0 = cx
            while cx < cv.cw and m[cy, cx]: cx += 1
            n = (cx - c0) * c; H = 14
            strip = bande_rochers(n, H, int(hash2(c0 + cv.x0, cy + cv.y0, s + 75) * 1e6),
                                  not (c0 > 0 and t[cy, c0 - 1] in (T['LEDGE_E'], T['LEDGE_W'])),
                                  not (cx < cv.cw and t[cy, cx] in (T['LEDGE_E'], T['LEDGE_W'])))
            y0 = cy * c + c // 2 - 9
            paste(strip, y0, c0 * c)
            for x in range(c0 * c + 1, cx * c + 1):
                for dy in (0, 1, 2): shadow(y0 + strip.shape[0] + dy, x)
    # rebords verticaux (on saute vers l'est / l'ouest)
    for code, side in ((T['LEDGE_E'], 1), (T['LEDGE_W'], -1)):
        m = led(code)
        for cx in range(cv.cw):
            cy = 0
            while cy < cv.ch:
                if not m[cy, cx]: cy += 1; continue
                c0 = cy
                while cy < cv.ch and m[cy, cx]: cy += 1
                n = (cy - c0) * c; H = 13
                strip = bande_rochers(n, H, int(hash2(cx + cv.x0, c0 + cv.y0, s + 76) * 1e6), True, True)
                strip = strip[::-1] if side < 0 else strip              # la crête regarde du côté d'où l'on vient
                x0 = cx * c + c // 2 - strip.shape[0] // 2
                paste(strip, c0 * c, x0, transpose=True)
                for y in range(c0 * c + 2, cy * c + 2):
                    for dx in (1, 2, 3): shadow(y, x0 + (strip.shape[0] - 1 + dx if side > 0 else -dx))

def bitume(cv, img, mask):
    """route en bitume : grain de granulats, réparations, fissures, bandes de rive et ligne centrale"""
    X, Y, k, s = cv.X, cv.Y, cv.cell / 32, cv.seed
    tone = np.digitize(fbm(X, Y, 60 * k, s + 60), [0.45, 0.6]) + 1
    img[mask] = A[tone][mask]
    patch = mask & (fbm(X, Y, 14 * k, s + 61, 2) > 0.8); img[patch] = A[1]    # rustines plus sombres
    g = hash2(X, Y, s + 62)
    m = mask & (g < 0.07); img[m] = A[np.clip(tone + 1, 0, 4)][m]
    m = mask & (g > 0.95); img[m] = A[0]
    m = mask & (g > 0.995); img[m] = A[4]
    din = ndimage.distance_transform_edt(mask)
    img[mask & (din <= 1.5)] = A[0]                                            # bordure de trottoir
    img[mask & (din > 2.5) & (din <= 3.5)] = I['aw']                           # bande de rive
    # ligne centrale en pointillés, le long du grand axe de la chaussée
    ridge = mask & (din >= ndimage.maximum_filter(din, size=3) - 0.01) & (din > c4(cv))
    dash = ((X // max(4, int(10 * k)) + Y // max(4, int(10 * k))) % 2 == 0)
    img[ridge & dash] = I['ay']
    # fissures : marche aléatoire d'un pixel sombre
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 63)
            if r.random() > 0.18: continue
            y, x = cy * cv.cell + r.integers(4, cv.cell - 4), cx * cv.cell + r.integers(4, cv.cell - 4)
            for _ in range(int(r.integers(6, 16))):
                if 0 <= y < cv.h and 0 <= x < cv.w and mask[y, x] and din[y, x] > 4: img[y, x] = A[0]
                x += int(r.choice([-1, 0, 1])); y += int(r.choice([0, 1]))

def c4(cv): return cv.cell * 0.9

def paves(cv, img, mask):
    """pavés de ville : pierres irrégulières en quinconce, volume (arête claire / arête sombre), mousse dans les joints"""
    X, Y, k, s = cv.X, cv.Y, cv.cell / 32, cv.seed
    sh = max(4, int(8 * k)); sw = max(5, int(11 * k))
    row = Y // sh
    off = (row % 2) * (sw // 2) + (hash2(row, 0, s + 70) * 3).astype(int)
    col = (X + off) // sw
    stone = hash2(col, row, s + 71)
    ly, lx = Y % sh, (X + off) % sw
    tone = 1 + (stone * 3).astype(int) + (fbm(X, Y, 50 * k, s + 72, 2) > 0.6)
    tone = np.clip(tone, 1, 4)
    out = V[tone]
    out = np.where(ly == 0, V[np.clip(tone + 1, 0, 4)], out)                   # arête éclairée
    out = np.where(lx == 0, V[np.clip(tone + 1, 0, 4)], out)
    out = np.where(ly == sh - 1, V[0], out)                                     # joint / arête sombre
    out = np.where(lx == sw - 1, V[0], out)
    moss = fbm(X, Y, 24 * k, s + 73, 2) > 0.66
    out = np.where(((ly == sh - 1) | (lx == sw - 1)) & moss, I['m0'], out)
    out = np.where((ly == sh - 1) & moss & (hash2(X, Y, s + 74) < 0.3), I['m1'], out)
    worn = hash2(X, Y, s + 75) < 0.03
    out = np.where(worn & (ly > 0) & (lx > 0), V[np.clip(tone - 1, 0, 4)], out)
    img[mask] = out[mask]
    din = ndimage.distance_transform_edt(mask)
    img[mask & (din <= 1.5)] = V[0]

def grotte(cv, img, mask):
    """sol de grotte : roche en plaques, fissures, gravillons, flaques qui reflètent un peu de lumière"""
    X, Y, k, s = cv.X, cv.Y, cv.cell / 32, cv.seed
    t = 0.6 * fbm(X, Y, 50 * k, s + 80) + 0.4 * fbm(X, Y, 12 * k, s + 81)
    lv = np.digitize(t, [0.38, 0.5, 0.62]) + 1
    img[mask] = C[lv][mask]
    # plaques de roche : arête claire en haut, sombre en bas (relief léger)
    plate = fbm(X, Y, 20 * k, s + 82) > 0.6
    edge_top = plate & ~np.roll(plate, 1, 0); edge_bot = plate & ~np.roll(plate, -1, 0)
    img[mask & edge_top] = C[5]; img[mask & edge_bot] = C[0]
    g = hash2(X, Y, s + 83)
    img[mask & (g < 0.025)] = C[0]; img[mask & (g > 0.98)] = C[4]
    # fissures
    crack = (np.abs(fbm(X, Y, 26 * k, s + 84) - 0.5) < 0.008) & (fbm(X, Y, 60 * k, s + 89, 2) > 0.55)
    img[mask & crack] = C[0]
    # flaques
    pud = mask & (fbm(X, Y, 22 * k, s + 85, 2) > 0.9)
    img[pud] = I['cw']; pd = ndimage.distance_transform_edt(pud)
    img[pud & (pd <= 1.5)] = C[1]
    img[pud & (pd > 2) & (hash2(X, Y, s + 86) < 0.04)] = I['cW']
    img[pud & (pd > 3) & (hash2(X, Y, s + 87) < 0.006)] = I['cg']
    pebbles(cv, img, mask & ~pud, s + 88, C[0], 1 / 420)

def paroi(cv, img, mask):
    """paroi de grotte vue de dessus (en jeu, c'est le relief 3D qui la dessine) : roche sombre, arête éclairée,
    ombre portée sur le sol au pied"""
    X, Y, k, s = cv.X, cv.Y, cv.cell / 32, cv.seed
    img[mask] = C[0]
    img[mask & (fbm(X, Y, 40 * k, s + 95, 2) > 0.62)] = C[1]
    img[mask & (hash2(X, Y, s + 96) < 0.015)] = C[1]
    din = ndimage.distance_transform_edt(mask)
    below = ndimage.shift(mask.astype(float), (-1, 0), order=0, cval=1) < 0.5     # bord du bas : arête au soleil
    img[mask & (din <= 2) & below] = C[4]; img[mask & (din <= 1) & below] = C[5]
    sh = (ndimage.shift(mask.astype(float), (4, 2), order=0, cval=0) > 0.5) & ~mask
    img[sh & (img != I['cw'])] = C[1]

def massifs(cv, img, mask, lv):
    """parc : massif fleuri bordé de buis taillé, fleurs serrées en touffes de couleur"""
    X, Y, k, s = cv.X, cv.Y, cv.cell / 32, cv.seed
    din = ndimage.distance_transform_edt(mask)
    img[mask] = D[1]                                                     # terre du massif
    img[mask & (hash2(X, Y, s + 90) < 0.2)] = D[0]
    border = mask & (din <= 4 * k + 0.5)
    img[border] = G[3]; img[border & (din <= 1.5)] = G[1]
    img[border & (hash2(X, Y, s + 91) < 0.25)] = G[4]
    img[border & (din > 3 * k) & (din <= 4 * k + 0.5)] = G[2]
    kinds = [('fr', 'fR'), ('fp', 'fP'), ('fy', 'fo'), ('fw', 'fW'), ('fb', 'fB')]
    bed = fbm(X, Y, 18 * k, s + 92, 2)
    for cy in range(cv.ch):
        for cx in range(cv.cw):
            r = cell_rng(cx + cv.x0, cy + cv.y0, s + 93)
            for _ in range(int(cv.cell * cv.cell / 9)):
                y, x = cy * cv.cell + r.integers(1, cv.cell - 2), cx * cv.cell + r.integers(1, cv.cell - 2)
                if not mask[y, x] or din[y, x] <= 4 * k + 1: continue
                kd = kinds[int(bed[y, x] * 5) % 5]
                img[y + 1, x] = G[2]; img[y + 1, x + 1] = G[1]
                img[y, x] = I[kd[0]]; img[y, x + 1] = I[kd[1]]; img[y - 1, x] = I[kd[0]]
                if r.random() < 0.3: img[y, x - 1] = G[3]

# ------------------------------------------------------------------ assemblage ------------------------------------
GRASSY = ['GRASS', 'TREE', 'PINE', 'BUSH', 'ROCK', 'SIGN', 'FENCE', 'CUT', 'SMASH', 'BOULDER', 'FLOWER', 'LEDGE',
          'LEDGE_E', 'LEDGE_W', 'TALL', 'DARKTALL', 'BUILD', 'DOOR']

def render(t, x0=0, y0=0, cell=32, seed=7, game_walls=False, frame=0):
    """game_walls : les parois de grotte restent celles du jeu (relief 3D) ; le sol de grotte va jusqu'au bord exact"""
    cv = Carte(t, x0, y0, cell, seed)
    c = lambda *names: [T[n] for n in names]
    img = np.zeros((cv.h, cv.w), np.int64)
    water, water_c = cv.region(c('WATER', 'BRIDGE'), seed + 100, wobble=0.7, round_=0.45)
    path, _ = cv.region(c('PATH', 'DOOR', 'STAIRS'), seed + 101, wobble=0.9, round_=0.55, band=cell // 2)
    asphalt, _ = cv.region(c('ASPHALT'), seed + 102, wobble=0.0, round_=0.12)
    pave, _ = cv.region(c('PAVE'), seed + 103, wobble=0.0, round_=0.08)
    cave, _ = cv.region(c('CAVE', 'CAVEDOOR'), seed + 104, wobble=0.6, round_=0.3)
    park, _ = cv.region(c('PARK'), seed + 105, wobble=0.0, round_=0.2)
    tall, tall_c = cv.region(c('TALL', 'DARKTALL'), seed + 106, wobble=1.6, round_=0.3, freq=0.25)
    near_wall = ndimage.binary_dilation(cv.px(t == T['CAVEWALL']), iterations=cv.band + 1)
    wall = near_wall & ~(cave | water | path | asphalt | pave | park)   # la paroi prend tout ce que le sol laisse
    if game_walls and (t == T['CAVEWALL']).any():
        wall = np.zeros_like(wall)
        cave = cv.px(t != T['CAVEWALL']) & ~water
        path &= ~cave
    hard = water | asphalt | pave | cave | park | wall
    path &= ~hard; tall &= ~(hard | path)
    grass = ~(hard | path)
    lv = herbe(cv, img, grass, water, flowers_force=(t == T['FLOWER']))
    hautes_herbes(cv, img, tall, lv)
    if path.any(): terre(cv, img, path, water | hard)
    if water.any(): eau(cv, img, water, (hard & ~cave) | path, rocky=bool(cave.any()), frame=frame)
    if asphalt.any(): bitume(cv, img, asphalt)
    if pave.any(): paves(cv, img, pave)
    if park.any(): massifs(cv, img, park, lv)
    if cave.any(): grotte(cv, img, cave)
    if wall.any(): paroi(cv, img, wall)
    ponton(cv, img, t == T['BRIDGE'], frame)
    rebords(cv, img, t)
    return cv, img

def sprites(cv, rgb, t, override=None):
    """arbres et rochers du jeu (odyssee/img/nature), posés comme dans world3d.js, pour juger le sol en contexte"""
    nat = os.path.join(ROOT, 'odyssee', 'img', 'nature')
    cache = {}
    def get(n):
        if n not in cache: cache[n] = Image.open((override or {}).get(n) or os.path.join(nat, n + '.png')).convert('RGBA')
        return cache[n]
    sh = Image.new('RGBA', (cv.w, cv.h), (0, 0, 0, 0)); spr = []
    isT = lambda y, x: 0 <= y < cv.ch and 0 <= x < cv.cw and t[y, x] in (T['TREE'], T['PINE'])
    for y in range(cv.ch):
        for x in range(cv.cw):
            v = float(hash2(x + cv.x0, y + cv.y0, 1))
            code = t[y, x]
            if code in (T['TREE'], T['PINE']):
                inner = isT(y, x - 1) and isT(y, x + 1) and isT(y - 1, x) and isT(y + 1, x)
                if inner and ((x + cv.x0 + y + cv.y0) & 1): continue
                key = 'pine' if code == T['PINE'] else 'tree' if v < 0.6 else 'tree3' if v < 0.68 else 'tree2'
                cx, cz = (x + 0.5 + (v - 0.5) * 0.2) * cv.cell, (y + 0.7) * cv.cell
                spr.append((cz, key, cx, v > 0.5))
            elif code == T['ROCK']:
                cavey = (t == T['CAVE']).any()
                spr.append(((y + 0.75) * cv.cell, 'caverock' if cavey else 'rock', (x + 0.5) * cv.cell, False))
            elif code == T['BUSH']: spr.append(((y + 0.8) * cv.cell, 'bush', (x + 0.5) * cv.cell, False))
            elif code == T['SIGN']: spr.append(((y + 0.8) * cv.cell, 'sign', (x + 0.5) * cv.cell, False))
    k = cv.cell / 32
    for cz, key, cx, flip in sorted(spr):
        s = get(key)
        if flip: s = s.transpose(Image.FLIP_LEFT_RIGHT)
        if k != 1: s = s.resize((int(s.width * k), int(s.height * k)), Image.NEAREST)
        # ombre ovale franche sous le sprite
        rx, ry = int(s.width * 0.42), int(s.height * 0.1) + 2
        from PIL import ImageDraw
        ImageDraw.Draw(sh).ellipse((cx - rx + 3, cz - ry + 1, cx + rx + 3, cz + ry + 1), fill=(10, 20, 15, 100))
    base = Image.fromarray(rgb, 'RGB').convert('RGBA'); base.alpha_composite(sh)
    # on repose les sprites par-dessus l'ombre
    out = base.copy()
    for cz, key, cx, flip in sorted(spr):
        s = get(key)
        if flip: s = s.transpose(Image.FLIP_LEFT_RIGHT)
        if k != 1: s = s.resize((int(s.width * k), int(s.height * k)), Image.NEAREST)
        out.alpha_composite(s, (int(cx - s.width / 2), int(cz - s.height)))
    return out.convert('RGB')

def debug(cv, rgb, t):
    """vue de contrôle : quadrillage des cases, cases de hautes herbes cerclées de rouge, cases d'eau de cyan"""
    o = rgb.copy(); c = cv.cell
    o[::c, :] = (o[::c, :] * 0.6).astype(np.uint8); o[:, ::c] = (o[:, ::c] * 0.6).astype(np.uint8)
    for code, col in (((T['TALL'], T['DARKTALL']), (255, 48, 80)), ((T['WATER'], T['BRIDGE']), (48, 232, 255))):
        m = np.isin(t, code)
        for cy, cx in zip(*np.nonzero(m)):
            y0, x0 = cy * c, cx * c
            if cy == 0 or not m[cy - 1, cx]: o[y0:y0 + 2, x0:x0 + c] = col
            if cy == cv.ch - 1 or not m[cy + 1, cx]: o[y0 + c - 2:y0 + c, x0:x0 + c] = col
            if cx == 0 or not m[cy, cx - 1]: o[y0:y0 + c, x0:x0 + 2] = col
            if cx == cv.cw - 1 or not m[cy, cx + 1]: o[y0:y0 + c, x0 + c - 2:x0 + c] = col
    return o

# ------------------------------------------------------------------ extraction d'une carte du jeu -----------------
def route1():
    """vraie Route 1, extraite par tools/pixelforge/dump-carte.mjs (cache /tmp/monde.json)"""
    src = '/tmp/monde.json'
    if not os.path.exists(src):
        os.system(f'node {os.path.join(ROOT, "tools", "pixelforge", "dump-carte.mjs")} monde {src}')
    m = json.load(open(src))
    t = np.array(m['t']).reshape(m['h'], m['w'])
    x0, y0, x1, y1 = 22, 198, 58, 223
    return t[y0:y1, x0:x1], x0, y0

if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k, d: type(d)(a[a.index(k) + 1]) if k in a else d
    out = opt('--out', 'carte.png'); cell = opt('--cell', 32); seed = opt('--seed', 7)
    if a[0] == 'route': t, x0, y0 = route1()
    else:
        m = json.load(open(a[0])); t = np.array(m['t']).reshape(m['h'], m['w']); x0, y0 = m.get('x0', 0), m.get('y0', 0)
    cv, img = render(t, x0, y0, cell, seed)
    rgb = RGB[img]
    if '--no-sprites' not in a: rgb = np.array(sprites(cv, rgb, t))
    Image.fromarray(rgb).save(out)
    if '--debug' in a: Image.fromarray(debug(cv, rgb, t)).save(os.path.splitext(out)[0] + '_grille.png')
    np.save(os.path.splitext(out)[0] + '_idx.npy', img)
    print(f'{out} : {cv.cw}x{cv.ch} cases de {cell} px = {cv.w}x{cv.h}')
