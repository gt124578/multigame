"""Paroi de grotte façon HeartGold / SoulSilver, tirée du jeu de tuiles envoyé (plateau 3 × 3 de 16 px, pixels doublés,
image JPEG) : on revient aux vrais pixels (2 × 2 → 1), on nettoie les couleurs (palette réduite), on rend le fond
transparent, puis on recolore pour chaque biome. Colonnes ajoutées à chaque rangée de relief.png (après les 10 premières) :
  p00..p22  le plateau 3 × 3 (coins, bords, dessus, falaise) ;
  f0..f3    falaises de rechange (fenêtres décalées dans la falaise du plateau) ;
  n0..n3    bords du haut de rechange ; l0..l2 / e0..e2 bords gauche / droit de rechange ;
  q0..q5    dessus décorés (fissures, cailloux, creux, mousse sèche…), dans les couleurs du dessus.
Usage : python3 tools/odyssee-paroi.py [jeu de tuiles]"""
import sys, numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'assets/graphics/hgss/grotte_tileset.jpg'
REL = OUT = sys.argv[2] if len(sys.argv) > 2 else 'odyssee/img/relief.png'
BIOMES = ['terre', 'montagne', 'mer', 'magma', 'glace', 'lune']
im = np.array(Image.open(SRC).convert('RGB')).astype(float)
art = im[0:96, 0:96].reshape(48, 2, 48, 2, 3).mean((1, 3))          # vrais pixels (16 px par tuile)
mx, mn = art.max(-1), art.min(-1)
alpha = ~((mn > 200) | ((mx > 165) & (mx - mn < 24)))               # fond blanc et frange grise claire → transparent
px = art[alpha]
rng = np.random.default_rng(3)
C = px[rng.choice(len(px), 12, replace=False)]
for _ in range(30):
    d = ((px[:, None] - C[None]) ** 2).sum(-1); lab = d.argmin(1)
    for k in range(len(C)):
        if (lab == k).any(): C[k] = px[lab == k].mean(0)
d = ((art[..., None, :] - C[None, None]) ** 2).sum(-1); q = C[d.argmin(-1)]
a = alpha.copy()
for y in range(1, 47):
    for x in range(1, 47):
        if not a[y, x] and alpha[y - 1, x] and alpha[y + 1, x] and alpha[y, x - 1] and alpha[y, x + 1]: a[y, x] = True
P = np.dstack([q, np.where(a, 255, 0)])                               # plateau 48 × 48 RGBA (couleurs d'origine)
top = q[16:32, 16:32]
lum = lambda c: c @ np.array([0.3, 0.55, 0.15])
pal = sorted({tuple(c) for c in top.reshape(-1, 3)}, key=lambda c: lum(np.array(c)))   # couleurs du dessus, du sombre au clair
dark_all = sorted({tuple(c) for c in q[a].reshape(-1, 3)}, key=lambda c: lum(np.array(c)))
D0, D1 = np.array(dark_all[0]), np.array(dark_all[1])               # contour et ombre de la roche
tm = top.reshape(-1, 3).mean(0)
T0, T1, T2, T3 = tm * 0.74, tm * 0.86, tm * 1.0, np.clip(tm * 1.17, 0, 255)
D0, D1 = tm * 0.42, tm * 0.58
tiles = {f'p{ty}{tx}': P[ty * 16:(ty + 1) * 16, tx * 16:(tx + 1) * 16] for ty in range(3) for tx in range(3)}
for k, o in enumerate([8, 13, 19, 24]): tiles[f'f{k}'] = P[32:48, o:o + 16]
for k, o in enumerate([9, 14, 18, 23]): tiles[f'n{k}'] = P[0:16, o:o + 16]
for k, o in enumerate([9, 12, 16]): tiles[f'l{k}'] = P[o:o + 16, 0:16]; tiles[f'e{k}'] = P[o:o + 16, 32:48]


def deco(k):
    """dessus décoré : la tuile du milieu du plateau, et par-dessus des fissures, des cailloux, un creux ou une bosse"""
    t = tiles['p11'].copy(); r = np.random.default_rng(100 + k)
    put = lambda x, y, c: t.__setitem__((y % 16, x % 16), np.r_[c, 255])

    def crack(x, y, n, branch=True):
        for s in range(n):
            put(x, y, D0); put(x - 1, y, D1); put(x + 1, y, T3)
            if branch and s == n // 2: crack(x + 1, y + 1, 3, False)
            x += int(r.integers(-1, 2)); y += 1

    def stone(x, y, w, h):
        for yy in range(h):
            for xx in range(w):
                edge = (yy == 0 and xx in (0, w - 1)) or (yy == h - 1 and xx in (0, w - 1))
                if edge: continue
                put(x + xx, y + yy, T3 if yy == 0 or xx == 0 else T2 if yy < h - 1 else T1)
        for xx in range(1, w - 1): put(x + xx, y + h, D0)
        put(x + w - 1, y + h - 1, D0); put(x, y + h - 1, D1)

    def creux(cx, cy, rx, ry):
        for y in range(16):
            for x in range(16):
                dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                q2 = dx * dx + dy * dy
                if q2 < 1: put(x, y, D1 if dy < -0.35 and q2 > 0.45 else T0 if dy < 0.3 else T1)
                elif q2 < 1.5 and dy > 0.5: put(x, y, T3)

    if k == 0: crack(int(r.integers(5, 10)), 1, 12)
    elif k == 1: stone(2, 3, 5, 4); stone(10, 9, 4, 3); stone(5, 12, 3, 2)
    elif k == 2: crack(11, 2, 7); stone(2, 8, 5, 4)
    elif k == 3: creux(8, 8, 5, 3.5)
    elif k == 4: stone(4, 5, 7, 5)
    else:
        for _ in range(9):
            x, y = int(r.integers(1, 14)), int(r.integers(1, 14)); put(x, y, T3); put(x + 1, y, T2); put(x, y + 1, D1); put(x + 1, y + 1, D1)
    return t


for k in range(6): tiles[f'q{k}'] = deco(k)
NAMES = list(tiles)
top_mean = top.reshape(-1, 3).mean(0)

rel = np.array(Image.open(REL).convert('RGBA'))[:, :320]            # sols, faces, dessus (tools/odyssee-grottes.py)
out = np.zeros((rel.shape[0], 320 + len(NAMES) * 32, 4), np.uint8); out[:, :320] = rel
for j, b in enumerate(BIOMES):
    sol = rel[j * 32:(j + 1) * 32, 0:32, :3].reshape(-1, 3).astype(float).mean(0)
    f = np.clip(sol * 1.22 + (sol.mean() - sol) * 0.2, 0, 240) / top_mean
    for i, n in enumerate(NAMES):
        t = tiles[n].astype(float).copy(); t[..., :3] = np.clip(t[..., :3] * f, 0, 255)
        big = np.repeat(np.repeat(t, 2, 0), 2, 1).astype(np.uint8)
        out[j * 32:(j + 1) * 32, 320 + i * 32:320 + (i + 1) * 32] = big
Image.fromarray(out).save(OUT)
print('relief.png :', ' '.join(NAMES))
