#!/usr/bin/env python3
# Odyssée — PixelForge / terrain : sol en pixel art haute densité, généré d'un seul tenant sur toute la carte.
#
#   python3 tools/pixelforge/terrain.py --out out/terrain.png [--cell 64] [--seed 7]
#
# Pas de tuiles répétées : chaque pixel est calculé à partir de sa position dans le monde (bruit continu), donc deux
# cases d'herbe ne sont jamais identiques et les bords (chemin, eau, hautes herbes) sont organiques, pas carrés.
# Reste du vrai pixel art : palette fixe (toutes les couleurs ci-dessous, rien d'autre), aucun anti-crénelage,
# lumière constante venant du haut à gauche, ombres portées d'un pixel.
#
# Prérequis : pip install pillow numpy scipy
import sys, math
import numpy as np
from PIL import Image
from scipy import ndimage

# ------------------------------------------------------------------ palette (indices) ---------------------------
PAL = {
    # herbe : du plus sombre au plus clair
    'g0': '#1f5a2e', 'g1': '#2c7236', 'g2': '#3d8c3c', 'g3': '#52a446', 'g4': '#6cbb52', 'g5': '#8ad064', 'g6': '#b4e47e',
    # hautes herbes (plus froides, plus saturées)
    'h0': '#173f2a', 'h1': '#1f5a34', 'h2': '#2f7a3a', 'h3': '#45984a', 'h4': '#6abc5c',
    # terre du chemin
    'd0': '#6e4f33', 'd1': '#8c6a44', 'd2': '#a88655', 'd3': '#c2a06a', 'd4': '#d6b882', 'd5': '#e8d0a0',
    # cailloux
    'p0': '#4e5052', 'p1': '#7a7c7a', 'p2': '#a4a6a0', 'p3': '#cfd0c8',
    # sable de berge
    's0': '#b09460', 's1': '#d2b880', 's2': '#e8d6a2',
    # eau, du fond au bord
    'w0': '#1e4a9c', 'w1': '#2862be', 'w2': '#357ed6', 'w3': '#4c9ae6', 'w4': '#6cb8ee', 'w5': '#9ad6f4', 'w6': '#e6f6ff',
    # fleurs
    'fr': '#e24a4a', 'fR': '#a02c3a', 'fy': '#f6d84a', 'fw': '#f8f8f0', 'fW': '#c8ccd8', 'fb': '#7a8ef0', 'fB': '#4a58b8',
}
NAMES = list(PAL)
IDX = {k: i for i, k in enumerate(NAMES)}
RGB = np.array([[int(PAL[k][i:i + 2], 16) for i in (1, 3, 5)] for k in NAMES], np.uint8)
G = [IDX[f'g{i}'] for i in range(7)]
H = [IDX[f'h{i}'] for i in range(5)]
D = [IDX[f'd{i}'] for i in range(6)]
P = [IDX[f'p{i}'] for i in range(4)]
S = [IDX[f's{i}'] for i in range(3)]
W = [IDX[f'w{i}'] for i in range(7)]

# ------------------------------------------------------------------ bruit continu --------------------------------
def value_noise(h, w, scale, rng):
    """bruit lisse : grille aléatoire interpolée (cubique), période ≈ scale pixels"""
    gh, gw = h // scale + 3, w // scale + 3
    g = rng.random((gh, gw))
    z = ndimage.zoom(g, scale, order=3)
    oy, ox = rng.integers(0, scale, 2)
    return z[oy:oy + h, ox:ox + w]

def fbm(h, w, scale, rng, octaves=4):
    out = np.zeros((h, w)); amp = 1; tot = 0
    for _ in range(octaves):
        s = max(2, int(scale))
        out += amp * value_noise(h, w, s, rng); tot += amp
        amp *= 0.5; scale /= 2
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-9)

def organic(mask_cells, cell, h, w, rng, blur=0.28, wobble=0.22):
    """région d'une case → région au pixel près avec des bords naturels (flou + bruit, puis seuil)"""
    m = np.kron(mask_cells.astype(float), np.ones((cell, cell)))[:h, :w]
    m = ndimage.gaussian_filter(m, cell * blur)
    n = fbm(h, w, cell * 0.5, rng, 3) - 0.5
    return (m + n * wobble) > 0.5

# ------------------------------------------------------------------ carte de test --------------------------------
# . herbe   P chemin   W eau   T hautes herbes   r rocher
LAYOUT = """
....................
..TTT...............
.TTTTT.......WWW....
.TTTT......WWWWWW...
..TT......WWWWWWWW..
PPPPPPP....WWWWWW...
......PP....WWWW....
.......PPP..........
.........PPPPPPPPPPP
....TT..........r...
...TTTT.....r.......
....TT..............
"""

def build(cell=64, seed=7):
    rows = [r for r in LAYOUT.strip('\n').split('\n')]
    ch, cw = len(rows), len(rows[0])
    h, w = ch * cell, cw * cell
    rng = np.random.default_rng(seed)
    grid = np.array([list(r) for r in rows])
    path = organic(grid == 'P', cell, h, w, rng, blur=0.40, wobble=0.30)
    water = organic(grid == 'W', cell, h, w, rng, blur=0.35, wobble=0.18)
    tall = organic(grid == 'T', cell, h, w, rng, blur=0.30, wobble=0.40) & ~path & ~water
    path &= ~water
    k = cell / 64  # échelle des détails

    img = np.zeros((h, w), np.int32)
    occ = np.zeros((h, w), bool)   # pixels déjà couverts par un détail (pas d'empilement illisible)

    # ---------------- herbe : tons proches en plaques, puis des milliers de brins qui fondent les bords ----------------
    light = fbm(h, w, 110 * k, rng, 3)                # grandes zones claires / sombres (lumière, humidité)
    patch = fbm(h, w, 28 * k, rng, 3)                 # plaques moyennes
    tone = 0.65 * light + 0.35 * patch
    lv = np.digitize(tone, [0.40, 0.60]) + 2          # 3 tons voisins seulement : 2, 3, 4
    img[:] = np.array(G)[lv + 1]                      # le fond est le ton clair : les brins dessinent l'ombre

    def blade(y, x, L, lean, base, pal=G, top=6):
        """brin : pied sombre, tige au ton local, pointe claire ; s'incline sur le dernier tiers"""
        for i in range(L):
            yy = y - i; xx = x + (lean if i >= L - 1 - L // 3 else 0)
            if not (0 <= yy < h and 0 <= xx < w) or water[yy, xx]: continue
            c = pal[max(0, base - 1)] if i == 0 else pal[min(top, base + 1)] if i == L - 1 else pal[base]
            img[yy, xx] = c

    # brins en « V » : deux brins qui partent du même pied, longueur 3 à 5 px
    n_bl = int(h * w / (11 / (k * k) ** 0.5))
    ys = rng.integers(0, h, n_bl); xs = rng.integers(0, w, n_bl)
    order = np.argsort(ys)
    for y, x in zip(ys[order], xs[order]):
        if path[y, x] or water[y, x] or tall[y, x]: continue
        base = int(lv[y, x])
        L = int(rng.choice([3, 3, 4, 4, 5]))
        if rng.random() < 0.55:
            blade(y, x, L, -1, base); blade(y, x + 1, L - 1, 1, base)
        else:
            blade(y, x, L, int(rng.choice([-1, 0, 1])), base)
    # trèfles : petits groupes de feuilles rondes, plus sombres, dans les zones ombragées
    for _ in range(int(h * w / (2600 * k * k))):
        y, x = rng.integers(3, h - 3), rng.integers(3, w - 3)
        if path[y, x] or water[y, x] or tall[y, x] or light[y, x] > 0.5: continue
        for dy, dx in ((0, 0), (-1, 0), (0, -1), (0, 1), (-1, 1), (1, 0)):
            img[y + dy, x + dx] = G[2]
        img[y - 1, x] = G[3]; img[y + 1, x + 1] = G[1]

    # fleurs : en colonies (bruit basse fréquence), jamais isolées au hasard
    colony = fbm(h, w, 70 * k, rng, 2)
    kinds = [('fr', 'fR', 'fy'), ('fw', 'fW', 'fy'), ('fb', 'fB', 'fw')]
    for _ in range(int(h * w / (90 * k * k))):
        y, x = rng.integers(3, h - 3), rng.integers(3, w - 3)
        if path[y, x] or water[y, x] or tall[y, x] or colony[y, x] < 0.66 or occ[y, x]: continue
        kind = kinds[int(colony[y, x] * 997 + (x // 120) * 3 + (y // 120)) % 3]
        pe, sh, ce = IDX[kind[0]], IDX[kind[1]], IDX[kind[2]]
        img[y + 1, x + 1] = G[1]; img[y + 2, x] = G[2]                # ombre + tige
        img[y - 1, x] = pe; img[y, x - 1] = pe; img[y, x + 1] = sh; img[y + 1, x] = sh; img[y, x] = ce
        occ[y - 1:y + 3, x - 1:x + 2] = True

    # ---------------- chemin ----------------
    dist_in = ndimage.distance_transform_edt(path)        # distance au bord, côté chemin
    dn = fbm(h, w, 26 * k, rng, 3)
    worn = np.clip(dist_in / (cell * 0.45), 0, 1)          # le milieu est plus clair (piétiné)
    t = 0.55 * dn + 0.45 * worn
    dl = np.digitize(t, [0.30, 0.48, 0.66]) + 1           # 1..4
    pv = np.array(D)[dl]
    img[path] = pv[path]
    # grain fin : quelques pixels plus clairs / plus sombres, isolés
    grain = rng.random((h, w))
    m = path & (grain < 0.035); img[m] = np.array(D)[np.clip(dl - 1, 0, 5)][m]
    m = path & (grain > 0.975); img[m] = np.array(D)[np.clip(dl + 1, 0, 5)][m]
    # lisière : 1-2 px d'ombre portée par l'herbe sur la terre (côté haut/gauche, d'où vient la lumière : ombre en bas)
    edge = path & (dist_in <= 1.5)
    img[edge] = D[0]
    sh_ = path & ~edge & (dist_in <= 3) & (ndimage.shift(path.astype(float), (3, 2), order=0, cval=0) < 0.5)
    img[sh_] = D[1]
    # brins qui débordent sur le chemin
    ring = ndimage.binary_dilation(path, iterations=2) & ~path & ~water
    yy, xx = np.nonzero(ring)
    for i in rng.choice(len(yy), size=len(yy) // 3, replace=False):
        y, x = yy[i], xx[i]
        L = 2 + (rng.random() < 0.5)
        for j in range(L):
            if 0 <= y - j < h: img[y - j, x] = G[2] if j == 0 else (G[4] if j == L - 1 else G[3])
    # cailloux : ombre en bas à droite, reflet en haut à gauche
    for _ in range(int(path.sum() / (500 * k * k))):
        ys_, xs_ = np.nonzero(path)
        i = rng.integers(len(ys_)); y, x = ys_[i], xs_[i]
        if dist_in[y, x] < 4: continue
        wv, hv = rng.integers(2, 5), rng.integers(2, 4)
        if rng.random() < 0.25: wv, hv = 1, 1
        img[y + 1:y + hv + 1, x + 1:x + wv + 1] = D[0]
        img[y:y + hv, x:x + wv] = P[1]
        img[y, x:x + wv] = P[2]; img[y, x] = P[3] if wv > 1 else P[2]
        if hv > 1: img[y + hv - 1, x + 1:x + wv] = P[0]

    # ---------------- hautes herbes : tapis de longs brins, de l'arrière vers l'avant ----------------
    tall_d = ndimage.distance_transform_edt(tall)
    img[tall] = H[1]
    dark = tall & (fbm(h, w, 18 * k, rng, 2) < 0.45); img[dark] = H[0]
    ys, xs = np.nonzero(tall)
    n = len(ys) // 5
    pick = rng.choice(len(ys), size=n, replace=False)
    pick = pick[np.argsort(ys[pick])]
    for i in pick:
        y, x = ys[i], xs[i]
        L = int(5 + rng.integers(0, 5) + min(3, tall_d[y, x] / 6))
        lean = rng.choice([-1, 1])
        for j in range(L):
            yy = y - j; xx = x + (lean if j > L * 0.6 else 0) + (lean if j > L * 0.85 else 0)
            if not (0 <= yy < h and 0 <= xx < w): continue
            c = H[1] if j < L * 0.3 else H[2] if j < L * 0.7 else H[3]
            if j == L - 1: c = H[4]
            img[yy, xx] = c
    # lisière : ombre portée des hautes herbes sur l'herbe rase, en bas à droite
    shadow = ndimage.shift(tall.astype(float), (3, 2), order=0, cval=0) > 0.5
    m = shadow & ~tall & ~path & ~water
    img[m] = np.array(G)[np.clip(lv - 2, 0, 6)][m]

    # ---------------- eau ----------------
    dw = ndimage.distance_transform_edt(water)            # profondeur ≈ distance au rivage
    shore = ndimage.binary_dilation(water, iterations=int(5 * k)) & ~water
    sd = ndimage.distance_transform_edt(~water)
    img[shore & (sd > 3 * k)] = S[2]
    img[shore & (sd <= 3 * k)] = S[1]
    img[shore & (sd <= 1.5)] = S[0]                      # sable mouillé
    lip = ndimage.binary_dilation(shore, iterations=1) & ~shore & ~water & ~path
    img[lip] = G[1]
    ys_, xs_ = np.nonzero(lip)
    for i in rng.choice(len(ys_), size=len(ys_) // 2, replace=False):
        blade(ys_[i] + 2, xs_[i], int(rng.integers(3, 5)), int(rng.choice([-1, 1])), 3)
    wn = fbm(h, w, 30 * k, rng, 3)
    depth = dw / (cell * 0.9) + (wn - 0.5) * 0.35
    wl = 4 - np.digitize(depth, [0.12, 0.45, 1.1])      # 4 (bord) .. 1 (fond)
    img[water] = np.array(W)[np.clip(wl, 0, 6)][water]
    img[water & (dw <= 1.5)] = W[5]                       # liseré clair au ras du sable
    # écume : pointillé blanc à 2-3 px du bord
    foam = water & (dw > 2.5) & (dw <= 3.5) & (fbm(h, w, 6 * k, rng, 2) > 0.55)
    img[foam] = W[6]
    # vaguelettes : traits horizontaux courts, reflet clair au-dessus d'un creux sombre
    for _ in range(int(water.sum() / (260 * k * k))):
        ys_, xs_ = np.nonzero(water & (dw > 6))
        if not len(ys_): break
        i = rng.integers(len(ys_)); y, x = ys_[i], xs_[i]
        L = int(rng.integers(5, 13))
        lvl = wl[y, x]
        if y + 1 < h:
            img[y, x:x + L][water[y, x:x + L]] = W[min(6, lvl + 2)]
            img[y + 1, x + 1:x + L + 1][water[y + 1, x + 1:x + L + 1]] = W[max(0, lvl - 1)]
    # éclats de lumière
    for _ in range(int(water.sum() / (9000 * k * k))):
        ys_, xs_ = np.nonzero(water & (dw > 10))
        if not len(ys_): break
        i = rng.integers(len(ys_)); y, x = ys_[i], xs_[i]
        img[y, x - 1:x + 2] = W[6]; img[y - 1, x] = W[6]; img[y + 1, x] = W[6]

    # ---------------- rochers posés (ombre portée, volume en 4 tons) ----------------
    for cy, row in enumerate(rows):
        for cx, c in enumerate(row):
            if c != 'r': continue
            oy, ox = cy * cell + cell // 2, cx * cell + cell // 2
            R = int(cell * 0.28)
            yy, xx = np.mgrid[-R - 4:R + 5, -R - 4:R + 5]
            bump = fbm(yy.shape[0], yy.shape[1], 6, rng, 2) * 0.25
            body = (xx / R) ** 2 + ((yy + 2) / (R * 0.75)) ** 2 < 1 - bump
            shad = ((xx - 3) / R) ** 2 + ((yy - 2) / (R * 0.6)) ** 2 < 1
            lit = (xx + yy * 1.3) / R + bump * 2
            Y, X = yy + oy, xx + ox
            ok = (Y >= 0) & (Y < h) & (X >= 0) & (X < w)
            m = shad & ~body & ok; img[Y[m], X[m]] = G[0]
            for thr, col in ((9, P[0]), (0.5, P[1]), (-0.3, P[2]), (-0.9, P[3])):
                m = body & ok & (lit < thr); img[Y[m], X[m]] = col
            edge = body & ~ndimage.binary_erosion(body) & ok & ((yy > 0) | (xx > 0)); img[Y[edge], X[edge]] = P[0]

    return Image.fromarray(RGB[img], 'RGB'), (cw, ch)

if __name__ == '__main__':
    a = sys.argv[1:]
    out = a[a.index('--out') + 1] if '--out' in a else 'terrain.png'
    cell = int(a[a.index('--cell') + 1]) if '--cell' in a else 64
    seed = int(a[a.index('--seed') + 1]) if '--seed' in a else 7
    im, (cw, ch) = build(cell, seed)
    im.save(out)
    print(f'{out} : {cw}x{ch} cases de {cell} px = {im.width}x{im.height}, {len(im.getcolors(1 << 16))} couleurs')
