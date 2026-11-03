"""Paroi de grotte façon HeartGold / SoulSilver, tirée du jeu de tuiles envoyé (plateau 3 × 3 de 16 px, pixels doublés,
image JPEG) : on revient aux vrais pixels (2 × 2 → 1), on nettoie les couleurs (palette réduite), on rend le fond
transparent, puis on recolore pour chaque biome et on ajoute 9 colonnes (p00..p22) à chaque rangée de relief.png."""
import sys, numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "assets/graphics/hgss/grotte_tileset.jpg"
REL = OUT = "odyssee/img/relief.png"
BIOMES = ['terre', 'montagne', 'mer', 'magma', 'glace', 'lune']
im = np.array(Image.open(SRC).convert('RGB')).astype(float)
blk = im[0:96, 0:96]
art = blk.reshape(48, 2, 48, 2, 3).mean((1, 3))          # vrais pixels (16 px par tuile)
mx, mn = art.max(-1), art.min(-1)
alpha = ~((mn > 200) | ((mx > 165) & (mx - mn < 24)))   # fond blanc et frange grise claire → transparent
# palette réduite (k-moyennes) pour effacer les bavures du JPEG
px = art[alpha]
rng = np.random.default_rng(3)
C = px[rng.choice(len(px), 12, replace=False)]
for _ in range(30):
    d = ((px[:, None] - C[None]) ** 2).sum(-1); lab = d.argmin(1)
    for k in range(len(C)):
        if (lab == k).any(): C[k] = px[lab == k].mean(0)
d = ((art[..., None, :] - C[None, None]) ** 2).sum(-1); q = C[d.argmin(-1)]
# un pixel transparent isolé au milieu de la roche (bavure) redevient de la roche
a = alpha.copy()
for y in range(1, 47):
    for x in range(1, 47):
        if not a[y, x] and alpha[y - 1, x] and alpha[y + 1, x] and alpha[y, x - 1] and alpha[y, x + 1]: a[y, x] = True
top_mean = q[16:32, 16:32].reshape(-1, 3).mean(0)

rel = np.array(Image.open(REL).convert('RGBA'))
rel = rel[:, :320]   # sols, faces, dessus (tools/odyssee-grottes.py) ; les colonnes du plateau sont refaites
out = np.zeros((rel.shape[0], 320 + 9 * 32, 4), np.uint8); out[:, :320] = rel
for j, b in enumerate(BIOMES):
    sol = rel[j * 32:(j + 1) * 32, 0:32, :3].reshape(-1, 3).astype(float).mean(0)
    target = np.clip(sol * 1.22 + (sol.mean() - sol) * 0.2, 0, 240)
    f = target / top_mean
    col = np.clip(q * f, 0, 255)
    rgba = np.zeros((48, 48, 4)); rgba[..., :3] = col; rgba[..., 3] = np.where(a, 255, 0)
    big = np.repeat(np.repeat(rgba, 2, 0), 2, 1).astype(np.uint8)   # 96 × 96 : 3 × 3 tuiles de 32
    for ty in range(3):
        for tx in range(3):
            out[j * 32:(j + 1) * 32, 320 + (ty * 3 + tx) * 32:320 + (ty * 3 + tx + 1) * 32] = big[ty * 32:(ty + 1) * 32, tx * 32:(tx + 1) * 32]
Image.fromarray(out).save(OUT)

print('ok', out.shape)
