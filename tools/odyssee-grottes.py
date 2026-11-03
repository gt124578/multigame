"""Grottes façon HeartGold / SoulSilver : parois de odyssee/img/relief.png (faces cannelées w0..w2, dessus en dalles t0 t1,
rebord bosselé r0 ; les sols s0..s3 sont gardés) et rochers pointus de chaque biome (odyssee/img/nature/pic_* et cone_*),
tirés des planches PixelLab de assets/graphics/pixellab/rochers_*.png. Usage : python3 tools/odyssee-grottes.py"""
import sys, json, numpy as np
from PIL import Image


SRC = OUT = 'odyssee/img/relief.png'
im = np.array(Image.open(SRC).convert('RGBA')).astype(float)
BIOMES = ['terre', 'montagne', 'mer', 'magma', 'glace', 'lune']


def ramp(base, n=6):
    """rampe de 6 tons du contour à la lumière, ombres un peu chaudes / lumières un peu froides"""
    b = np.array(base, float)
    out = []
    for t in np.linspace(0, 1, n):
        k = 0.32 + 0.9 * t
        c = b * k
        c = c + (np.array([6, 2, -6]) * (1 - t)) + (np.array([-2, 2, 6]) * t)
        out.append(np.clip(c, 0, 255))
    return out


def voronoi(rng, n, sx=1.0, sy=1.0, W=32):
    pts = [(rng.uniform(0, W), rng.uniform(0, W)) for _ in range(n)]
    F1 = np.full((W, W), 1e9); F2 = np.full((W, W), 1e9); dxs = np.zeros((W, W)); dys = np.zeros((W, W)); idx = np.zeros((W, W), int)
    ys, xs = np.mgrid[0:W, 0:W] + 0.5
    for k, (px, py) in enumerate(pts):
        dx = (xs - px + W / 2) % W - W / 2; dy = (ys - py + W / 2) % W - W / 2
        d = np.sqrt((dx * sx) ** 2 + (dy * sy) ** 2)
        closer = d < F1
        F2 = np.where(closer, F1, np.minimum(F2, d))
        dxs = np.where(closer, dx, dxs); dys = np.where(closer, dy, dys); idx = np.where(closer, k, idx)
        F1 = np.where(closer, d, F1)
    return F1, F2, dxs, dys, idx


def tile_face(R, rng):
    """pente de roche (HeartGold / SoulSilver) : stries fines dans le sens de la pente, un trait sombre et un reflet à
    sa gauche, des traits plus ou moins longs ; liseré clair en haut, un peu plus sombre vers le bas"""
    W = H = 32
    lvl = np.full((H, W), 2.55) + rng.normal(0, 0.08, (H, W))
    x = float(rng.uniform(0, 3))
    while x < W:
        y0 = int(rng.integers(-4, 10)); y1 = int(rng.integers(20, 40))
        wob = rng.uniform(-0.08, 0.08)
        for y in range(max(0, y0), min(H, y1)):
            xi = int(round(x + wob * (y - y0))) % W
            lvl[y, xi] = 1.25
            lvl[y, (xi - 1) % W] = max(lvl[y, (xi - 1) % W], 3.35)
            if rng.random() < 0.5: lvl[y, (xi + 1) % W] = min(lvl[y, (xi + 1) % W], 2.1)
        x += rng.uniform(2.6, 4.6)
    ys = (np.arange(H)[:, None] + 0.5) / H
    lvl -= 0.7 * ys ** 2
    lvl[0] = np.maximum(lvl[0], 3.7); lvl[1] = np.maximum(lvl[1], 3.0)
    return paint(lvl, R)


def tile_top(R, rng, base=3.0, n=7):
    """dessus : roche à peine bosselée (grosses plaques douces, joints discrets), raccord sur les quatre côtés"""
    F1, F2, dx, dy, idx = voronoi(rng, n)
    edge = F2 - F1
    r = np.maximum(F2, 1e-3)
    lit = -(dx + dy) / (r * 1.6)
    tone = rng.uniform(-0.12, 0.12, idx.max() + 1)[idx]
    lvl = base + 0.1 + 0.3 * lit + tone
    shadow = (dx + dy) > 0
    lvl = np.where((edge < 0.55) & shadow, base - 0.7, lvl)
    lvl = np.where((edge >= 0.55) & (edge < 1.1) & ~shadow, base + 1.0, lvl)
    lvl += rng.normal(0, 0.06, lvl.shape)
    return paint(lvl, R), lvl


def tile_rim(R, rng, top_lvl):
    """rebord sud : le dessus, puis une rangée de grosses bosses arrondies qui débordent sur la face"""
    W = 32
    lvl = top_lvl.copy()
    edge = np.full(W, 27.0)
    x = -2
    while x < W + 2:
        r = rng.uniform(3.6, 5.6); cx = x + r
        for i in range(W):
            d = abs(i + 0.5 - cx)
            if d < r: edge[i] = max(edge[i], 27.5 + 0.8 * (r * r - d * d) ** 0.5)
        x += 2 * r - 0.8
    edge = np.minimum(edge, 31.0)
    for i in range(W):
        e = int(edge[i])
        for y in range(18, W):
            if y < e - 7: continue
            if y < e:  # bosse : lumière sur le haut, ombre vers le bas
                t = (y - (e - 7)) / 7
                lvl[y, i] = 3.6 - 2.3 * t + (0.4 if i % 7 == 0 else 0)
            elif y == e: lvl[y, i] = -0.2      # contour
            else: lvl[y, i] = 0.7               # pied du rebord, dans l'ombre
    # quelques crevasses entre les bosses
    lvl += rng.normal(0, 0.1, lvl.shape)
    return paint(lvl, R)


def paint(lvl, R):
    q = np.clip(np.round(lvl), 0, len(R) - 1).astype(int)
    out = np.zeros(lvl.shape + (4,))
    for k, c in enumerate(R):
        out[q == k, :3] = c
    out[..., 3] = 255
    return out


for j, b in enumerate(BIOMES):
    row = im[j * 32:(j + 1) * 32]
    sol = row[:, 0:32, :3].reshape(-1, 3).mean(0)
    rng = np.random.default_rng(1000 + j)
    Rw = ramp(sol * 0.92)
    Rt = ramp(np.clip(sol * 1.16 + (sol.mean() - sol) * 0.25, 0, 235))
    for k in range(3):
        im[j * 32:(j + 1) * 32, (4 + k) * 32:(5 + k) * 32] = tile_face(Rw, rng)
    t0, l0 = tile_top(Rt, rng)
    t1, _ = tile_top(Rt, rng, n=6)
    im[j * 32:(j + 1) * 32, 7 * 32:8 * 32] = t0
    im[j * 32:(j + 1) * 32, 8 * 32:9 * 32] = t1
    im[j * 32:(j + 1) * 32, 9 * 32:10 * 32] = tile_rim(Rt, rng, l0)

Image.fromarray(im.astype(np.uint8)).save(OUT)

from scipy import ndimage

OUT = 'odyssee/img/nature'
rel = im[..., :3]
C = np.array(Image.open('assets/graphics/pixellab/rochers_amas.png'))
S = np.array(Image.open('assets/graphics/pixellab/rochers_pointes.png'))
cell = lambda A, i: A[(i // 8) * 32:(i // 8) * 32 + 32, (i % 8) * 32:(i % 8) * 32 + 32]


def crop(a):
    ys, xs = np.where(a[..., 3] > 0)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


cones = []   # chaque case de la planche : une bosse et une pointe ; on garde la pointe (la plus haute)
for i in range(64):
    a = cell(S, i); lab, n = ndimage.label(a[..., 3] > 0); best = None
    for k in range(1, n + 1):
        ys, xs = np.where(lab == k)
        if len(ys) >= 30 and (best is None or np.ptp(ys) > best[0]): best = (np.ptp(ys), k)
    if best: b2 = a.copy(); b2[lab != best[1]] = 0; cones.append((i, crop(b2)))
src = {f'pic_{k}': crop(cell(C, i)) for k, i in enumerate([4, 17, 0])}
src.update({f'cone_{k}': cones[j][1] for k, j in enumerate([0, 12, 30])})
allpx = np.concatenate([a[a[..., 3] > 0, :3] for a in src.values()]).astype(float)
smean = allpx.mean(0)
dims = {}
for j, b in enumerate(BIOMES):
    sol = rel[j * 32:(j + 1) * 32, 0:32].reshape(-1, 3).mean(0)
    target = sol * 0.78
    for k, a in src.items():
        o = a.astype(float).copy()
        m = o[..., 3] > 0
        o[m, :3] = np.clip(o[m, :3] * (target / smean), 0, 255)
        name = k.replace('_', f'_{b}_')
        Image.fromarray(o.astype(np.uint8)).save(f'{OUT}/{name}.png')
        dims[name] = [a.shape[1], a.shape[0], 1.6 if k.startswith('pic') else 1.5]
p = 'odyssee/js/data/sprites.js'; L = open(p).read().split('\n'); pre = 'export const SPRITES = '
d = json.loads(L[1][len(pre):].rstrip(';')); d['nature'].update(dims)
L[1] = pre + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';'; open(p, 'w').write('\n'.join(L))
print('relief.png et', len(dims), 'rochers pointus')
