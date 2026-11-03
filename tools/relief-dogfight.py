#!/usr/bin/env python3
"""Relief réel des cartes de Dogfight 3D, tiré du modèle numérique de surface Copernicus GLO-30.
© DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni dans le cadre de COPERNICUS
par l'Union européenne et l'ESA. Les dalles se téléchargent sans compte (registre Open Data d'AWS).

Usage : python3 tools/relief-dogfight.py dossier-cache [carte…]
Écrit dogfight/relief/<carte>.bin, lu par dogfight/engine/maps.js :
  - la grille proche : 561 × 561 points tous les 25 m (14 km autour du centre de la zone), en décimètres ;
  - la grille lointaine : 321 × 321 points tous les 100 m (32 km), en mètres, pour l'horizon.
Entiers signés de 16 bits, petit-boutistes, ligne par ligne du nord au sud, d'ouest en est.
Le fond de la mer n'est pas dans le relief : il descend avec la distance à la côte.
L'île d'Island Rush (carré de 1,6 km) est posée en mer : l'outil vérifie qu'aucune terre ne la touche.
Prérequis : numpy, scipy, Pillow."""
import math, os, sys, urllib.request
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, map_coordinates

# centre de la zone de jeu (latitude, longitude) et place de l'île d'Island Rush par rapport à ce centre (m, x à l'est, z au sud)
MAPS = {
    'eoliennes': (38.445, 14.955, 1900, 0),       # Lipari, Vulcanello et Vulcano
    'teno': (28.29, -16.86, -1500, 1300),          # Tenerife : le massif de Teno, Masca, les falaises de Los Gigantes
    'kauai': (22.20, -159.62, -600, -1200),        # Kauai : la côte de Nā Pali et la vallée de Kalalau
    'lofoten': (67.93, 13.075, 1300, 1800),        # Moskenesøya : Reine, ses fjords et ses aiguilles
}
NEAR, NEAR_STEP = 14000, 25
FAR, FAR_STEP = 32000, 100
ISLAND = 1600
URL = 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{0}_DEM/Copernicus_DSM_COG_10_{0}_DEM.tif'


def tile_name(lat, lon):
    return f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}_00_{'E' if lon >= 0 else 'W'}{abs(lon):03d}_00"


tiles = {}
def tile(cache, lat, lon):
    name = tile_name(lat, lon)
    if name in tiles: return tiles[name]
    path = os.path.join(cache, name + '.tif')
    if not os.path.exists(path):
        try:
            print('  téléchargement', name, file=sys.stderr)
            urllib.request.urlretrieve(URL.format(name), path)
        except Exception:
            tiles[name] = None   # pas de dalle : la pleine mer
            return None
    tiles[name] = np.array(Image.open(path), dtype=np.float32)
    return tiles[name]


def sample(cache, lat0, lon0, size, step):
    """Grille carrée centrée sur (lat0, lon0) : x vers l'est, z vers le sud."""
    n = int(size / step) + 1
    phi = math.radians(lat0)
    k_lat = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    k_lon = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
    xs = (np.arange(n) - (n - 1) / 2) * step
    X, Z = np.meshgrid(xs, xs)
    lat = lat0 - Z / k_lat
    lon = lon0 + X / k_lon
    out = np.zeros((n, n), np.float32)
    fl, fo = np.floor(lat).astype(int), np.floor(lon).astype(int)
    for a, b in set(zip(fl.ravel(), fo.ravel())):
        t = tile(cache, int(a), int(b))
        if t is None: continue
        H, W = t.shape
        m = (fl == a) & (fo == b)
        out[m] = map_coordinates(t, [(a + 1 - lat[m]) * H - 0.5, (lon[m] - b) * W - 0.5], order=1, mode='nearest')
    out[~np.isfinite(out)] = 0
    return out


def seabed(h, step):
    """La terre garde sa hauteur ; la mer descend en pente douce depuis la côte (hauts-fonds clairs, puis le large)."""
    land = h > 0.3
    d = distance_transform_edt(~land) * step
    return np.where(land, h, -(2 + 58 * (1 - np.exp(-d / 450)))).astype(np.float32)


def place_island(h):
    n = h.shape[0]; c = (n - 1) / 2; r = (ISLAND / 2 + 350) / NEAR_STEP; best = None
    for oz in range(-3800, 3801, 100):
        for ox in range(-3800, 3801, 100):
            d = math.hypot(ox, oz)
            if best and d >= best[0]: continue
            i0, i1 = int(c + ox / NEAR_STEP - r), int(c + ox / NEAR_STEP + r)
            j0, j1 = int(c + oz / NEAR_STEP - r), int(c + oz / NEAR_STEP + r)
            if i0 >= 0 and j0 >= 0 and i1 < n and j1 < n and (h[j0:j1 + 1, i0:i1 + 1] <= 0.3).all(): best = (d, ox, oz)
    return best


def build(cache, key, out_dir):
    lat0, lon0, ox, oz = MAPS[key]
    near = sample(cache, lat0, lon0, NEAR, NEAR_STEP)
    far = sample(cache, lat0, lon0, FAR, FAR_STEP)
    found = place_island(near)
    n = near.shape[0]; c = (n - 1) / 2; r = (ISLAND / 2) / NEAR_STEP
    sq = near[int(c + oz / NEAR_STEP - r):int(c + oz / NEAR_STEP + r) + 1, int(c + ox / NEAR_STEP - r):int(c + ox / NEAR_STEP + r) + 1]
    assert (sq <= 0.3).all(), f'{key} : de la terre sous l\'île d\'Island Rush (place libre la plus proche : {found})'
    near, far = seabed(near, NEAR_STEP), seabed(far, FAR_STEP)
    far_i = np.clip(np.round(far), -32000, 32000).astype('<i2')
    # le bord de la grille proche rejoint la lointaine : pas de marche à la couture
    k = FAR_STEP // NEAR_STEP; m = (FAR - NEAR) / 2 / FAR_STEP
    jj, ii = np.meshgrid(np.arange(n), np.arange(n), indexing='ij')
    coarse = map_coordinates(far_i.astype(np.float32), [m + jj / k, m + ii / k], order=1)
    edge = np.minimum(np.minimum(ii, jj), np.minimum(n - 1 - ii, n - 1 - jj))
    w = np.clip(edge / 20, 0, 1)
    near = near * w + coarse * (1 - w)
    near_i = np.clip(np.round(near * 10), -32000, 32000).astype('<i2')
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, key + '.bin'), 'wb') as f:
        f.write(near_i.tobytes()); f.write(far_i.tobytes())
    print(f"{key} : sommet {near.max():.0f} m, terre {(near > 0.3).mean() * 100:.0f} %, centre de la zone x {800 - ox} z {800 - oz}, place libre la plus proche {found}")


if __name__ == '__main__':
    cache = sys.argv[1]
    os.makedirs(cache, exist_ok=True)
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dogfight', 'relief')
    for key in sys.argv[2:] or MAPS:
        build(cache, key, out_dir)
