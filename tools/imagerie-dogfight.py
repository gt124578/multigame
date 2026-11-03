#!/usr/bin/env python3
"""Vue satellite des cartes de Dogfight 3D : la mosaïque Sentinel-2 sans nuages d'EOX (EOxCloudless,
https://cloudless.eox.at, par EOX IT Services GmbH ; contient des données Copernicus Sentinel modifiées).
L'édition 2017 est sous licence Creative Commons Attribution 4.0 ; elle ne couvre pas Hawaï : Kauai vient de
l'édition 2024, sous licence Creative Commons BY-NC-SA 4.0 (pas d'usage commercial). Les tuiles se téléchargent sans compte.

Usage : python3 -I tools/imagerie-dogfight.py dossier-cache [carte…]
Écrit, pour chaque carte, à côté de son relief (dogfight/relief/) :
  - <carte>.webp : 2048 × 2048 pixels sur le carré de la grille proche (14 km, environ 7 m par pixel) ;
  - <carte>-loin.webp : 1024 × 1024 pixels sur la grille lointaine (32 km), pour l'horizon.
Le nord en haut, l'ouest à gauche, chaque carré centré comme le relief (tools/relief-dogfight.py).
Prérequis : numpy, scipy, Pillow."""
import io, math, os, sys, time, urllib.request
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

# mêmes centres que tools/relief-dogfight.py, et l'édition de la mosaïque
MAPS = {
    'eoliennes': (38.445, 14.955, 's2cloudless-2017'),
    'teno': (28.29, -16.86, 's2cloudless-2017'),
    'kauai': (22.20, -159.62, 's2cloudless-2024'),
    'lofoten': (67.93, 13.075, 's2cloudless-2017'),
}
NEAR, NEAR_STEP = 14000, 25
FAR, FAR_STEP = 32000, 100
URL = 'https://tiles.maps.eox.at/wmts/1.0.0/{layer}/default/WGS84/{z}/{row}/{col}.jpg'
TILE = 256


def fetch(cache, layer, z, row, col):
    path = os.path.join(cache, f'{layer}-{z}-{row}-{col}.jpg')
    if not os.path.exists(path):
        req = urllib.request.Request(URL.format(layer=layer, z=z, row=row, col=col), headers={'User-Agent': 'arcadia-dogfight-tools'})
        with urllib.request.urlopen(req, timeout=60) as r: data = r.read()
        with open(path, 'wb') as f: f.write(data)
        time.sleep(0.05)
    im = Image.open(path)
    assert im.format == 'JPEG', f'{path} : tuile vide, hors de la mosaïque {layer}'
    return np.asarray(im.convert('RGB'), dtype=np.float32)


def render(cache, layer, lat0, lon0, size, cells, px, z):
    """Le carré de `cells` cases de la grille (centré sur lat0, lon0), rendu en px × px : x vers l'est, z vers le sud."""
    phi = math.radians(lat0)
    k_lat = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    k_lon = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
    span = cells * size                       # le carré couvert par la texture : une demi-case de plus de chaque côté
    c = (np.arange(px) + 0.5) / px * span - span / 2
    X, Z = np.meshgrid(c, c)
    lat, lon = lat0 - Z / k_lat, lon0 + X / k_lon
    deg = 180 / 2 ** z / TILE                  # degrés par pixel de tuile
    gx, gy = (lon + 180) / deg, (90 - lat) / deg
    c0, c1 = int(gx.min() // TILE), int(gx.max() // TILE)
    r0, r1 = int(gy.min() // TILE), int(gy.max() // TILE)
    mosaic = np.zeros(((r1 - r0 + 1) * TILE, (c1 - c0 + 1) * TILE, 3), np.float32)
    print(f'  {(r1 - r0 + 1) * (c1 - c0 + 1)} tuiles au niveau {z}', file=sys.stderr)
    for row in range(r0, r1 + 1):
        for col in range(c0, c1 + 1):
            mosaic[(row - r0) * TILE:(row - r0 + 1) * TILE, (col - c0) * TILE:(col - c0 + 1) * TILE] = fetch(cache, layer, z, row, col)
    yy, xx = gy - r0 * TILE - 0.5, gx - c0 * TILE - 0.5
    out = np.stack([map_coordinates(mosaic[..., k], [yy, xx], order=1, mode='nearest') for k in range(3)], -1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def build(cache, key, out_dir):
    lat0, lon0, layer = MAPS[key]
    near = render(cache, layer, lat0, lon0, NEAR_STEP, NEAR // NEAR_STEP + 1, 2048, 13)
    far = render(cache, layer, lat0, lon0, FAR_STEP, FAR // FAR_STEP + 1, 1024, 11)
    near.save(os.path.join(out_dir, key + '.webp'), 'WEBP', quality=80, method=6)
    far.save(os.path.join(out_dir, key + '-loin.webp'), 'WEBP', quality=80, method=6)
    print(f'{key} : {os.path.getsize(os.path.join(out_dir, key + ".webp")) // 1024} Ko + {os.path.getsize(os.path.join(out_dir, key + "-loin.webp")) // 1024} Ko')


if __name__ == '__main__':
    cache = sys.argv[1]
    os.makedirs(cache, exist_ok=True)
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dogfight', 'relief')
    for key in sys.argv[2:] or MAPS:
        build(cache, key, out_dir)
