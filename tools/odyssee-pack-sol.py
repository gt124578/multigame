#!/usr/bin/env python3
"""tools/odyssee-pack-sol.py — découpe les tuiles de sol d'un pack Pokémon (Odyssée → Options → Graphismes).

Pack « Lumineux » : planche « Bright » de Flurmimon (adaptée par Bivurnum), tirée du dépôt Team Aqua's Asset Repo :
  Tilesets/Other Tilesets/Voluptuas Collected Tilesets/1.png
Chaque tuile fait 16 × 16 px ; le jeu les agrandit ×2 comme celles de son sol classique. Les noms des fichiers sont ceux
du sol classique (odyssee/js/render/textures.js : grass0, path0, sand0, water0…).

Usage :
  python3 tools/odyssee-pack-sol.py <planche 1.png> [dossier de sortie, défaut odyssee/img/gfx/lumineux]
"""
import json
import os
import sys

from PIL import Image, ImageEnhance

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'odyssee', 'img', 'gfx', 'lumineux')
os.makedirs(OUT, exist_ok=True)
sheet = Image.open(SRC).convert('RGBA')
T = 16


def tile(cx, cy):
    return sheet.crop((cx * T, cy * T, cx * T + T, cy * T + T))


def flip(t):
    return t.transpose(Image.FLIP_LEFT_RIGHT)


def roll(t, dx):
    """tuile décalée en boucle (l'eau qui bouge)"""
    o = Image.new('RGBA', (T, T))
    o.paste(t, (dx, 0)); o.paste(t, (dx - T, 0))
    return o


def tone(t, bright=1.0, sat=1.0):
    r, g, b, a = t.split()
    rgb = Image.merge('RGB', (r, g, b))
    rgb = ImageEnhance.Color(rgb).enhance(sat)
    rgb = ImageEnhance.Brightness(rgb).enhance(bright)
    r, g, b = rgb.split()
    return Image.merge('RGBA', (r, g, b, a))


def over(base, sprite):
    o = base.copy(); o.alpha_composite(sprite); return o


# --- cases de la planche (colonne, ligne en tuiles de 16 px) ---
g = tile(1, 0)
grass = [g, flip(g), roll(g, 8)]   # trois herbes de même ton : pas de damier
dark = tile(12, 0)
tuft, tuft_ice = tile(3, 0), tile(4, 0)
dirt, sand, stone = tile(6, 37), tile(1, 37), tile(21, 37)
snow = tile(11, 40)
water, deep = tile(16, 43), tile(21, 43)
lava = [tile(33, 40), tile(31, 40)]

files = {
    'grass0': grass[0], 'grass1': grass[1], 'grass2': grass[2],
    'forest0': tone(g, 0.82, 1.05), 'forest1': flip(tone(g, 0.78, 1.05)),   # sous-bois : la même herbe, plus sombre
    'path0': dirt, 'sand0': sand, 'pave0': stone,
    'snow0': snow, 'snow1': flip(snow),
    'ash0': tone(stone, 0.62, 0.15), 'ash1': flip(tone(stone, 0.55, 0.15)),
    'cave0': tone(dirt, 0.72, 0.8), 'cave1': flip(tone(dirt, 0.66, 0.8)),
    'lava0': lava[0], 'lava1': lava[1],
    'tall0': over(grass[0], tuft), 'tall1': over(grass[1], flip(tuft)),
    'darktall0': over(dark, tone(tuft, 0.7)), 'darktall1': over(dark, flip(tone(tuft, 0.7))),
    'snowtall0': over(snow, tuft_ice), 'snowtall1': over(snow, flip(tuft_ice)),
}
for f in range(4):
    files[f'water{f}'] = roll(water, 4 * f)
    files[f'deep{f}'] = roll(deep, 4 * f)

for name, im in files.items():
    im.save(os.path.join(OUT, name + '.png'))
json.dump(sorted(files), open(os.path.join(OUT, 'liste.json'), 'w'), indent=0)
print(len(files), 'tuiles écrites dans', os.path.normpath(OUT))
