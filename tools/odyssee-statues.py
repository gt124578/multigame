#!/usr/bin/env python3
"""Statues des champions d'arène : chaque portrait de combat (odyssee/img/dresseurs/<nom>.png, 64 × 80) devient une
statue en relief, pixel par pixel. Chaque pixel opaque est une colonne dont l'épaisseur grandit vers le milieu de la
silhouette (bosse), et dont le ton (0 sombre à 5 clair) vient de la luminosité du dessin. Les pixels voisins de même ton
et de même épaisseur sont fusionnés en bandes. Écrit odyssee/js/render/statues-data.js.
  python3 tools/odyssee-statues.py [noms...]"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as nd
ICI = os.path.dirname(os.path.abspath(__file__)); RACINE = os.path.dirname(ICI)
NOMS = sys.argv[1:] or ['hector', 'marine', 'volta', 'flora', 'basalte', 'sibylle', 'pyros', 'drakos',
                        'margot', 'aurele', 'morgane', 'gaspard', 'ferdinand', 'lilas', 'corbin']
out = {}
for n in NOMS:
    im = np.array(Image.open(os.path.join(RACINE, 'odyssee/img/dresseurs', n + '.png')).convert('RGBA')).astype(float)
    a = im[..., 3] > 100
    ys, xs = np.where(a); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    a = a[y0:y1, x0:x1]; rgb = im[y0:y1, x0:x1, :3]
    L = (0.3 * rgb[..., 0] + 0.55 * rgb[..., 1] + 0.15 * rgb[..., 2]) / 255
    # tons : on étire la luminosité de la silhouette sur 6 paliers (les traits noirs du dessin restent les plus sombres)
    lo, hi = np.percentile(L[a], 4), np.percentile(L[a], 97)
    t = np.clip((L - lo) / max(hi - lo, 1e-3), 0, 1)
    ton = np.clip(np.round(t ** 0.85 * 5), 0, 5).astype(int)
    ton[(L < 0.16) & a] = 0
    # épaisseur : distance au bord de la silhouette (1 à 6 pixels), adoucie
    d = nd.distance_transform_edt(a)
    ep = np.clip(np.round(1 + d * 0.8), 1, 6).astype(int)
    ep = np.where(a, ep, 0)
    H, W = a.shape; runs = []
    for y in range(H):
        x = 0
        while x < W:
            if not a[y, x]: x += 1; continue
            k = x
            while k + 1 < W and a[y, k + 1] and ton[y, k + 1] == ton[y, x] and ep[y, k + 1] == ep[y, x]: k += 1
            runs.append([int(x), int(H - 1 - y), int(k - x + 1), int(ton[y, x]), int(ep[y, x])])
            x = k + 1
    out[n] = {'w': int(W), 'h': int(H), 'r': runs}
    print(n, W, H, len(runs), 'bandes')
js = ('// odyssee/js/render/statues-data.js — généré par tools/odyssee-statues.py (ne pas modifier à la main) :\n'
      '// statues des champions en relief, tirées de leur portrait de combat. Bande : [x, y (depuis le bas), longueur, ton 0-5, épaisseur].\n'
      'export const STATUES = ' + json.dumps(out, separators=(',', ':')) + ';\n')
open(os.path.join(RACINE, 'odyssee/js/render/statues-data.js'), 'w').write(js)
print('écrit', len(js) // 1024, 'Ko')
