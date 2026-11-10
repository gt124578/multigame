#!/usr/bin/env python3
"""tools/odyssee-pack-noirblanc.py — pack de graphismes « Noir & Blanc » d'Odyssée (Options → Graphismes).

Planches de fans au style Pokémon Noir / Blanc gardées dans assets/graphics/noirblanc/ (crédits : LISEZMOI.txt du pack) :
  printemps.png (BW Spring Tileset, thefloofypanthar), eau.png (B/W Water Tiles, UltimoSpriter),
  volcan.png (Alternate Volcano Tiles, Phyromatical), arbres.png (Taragonia Mix Special Trees, Phyromatical).
Sortie : odyssee/img/gfx/noirblanc/ — tuiles de sol de 16 px (noms du sol classique) et décor (arbres, rochers…) à densité 2.
"""
import os
import numpy as np
from PIL import Image, ImageEnhance

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'graphics', 'noirblanc')
OUT = os.path.join(ROOT, 'odyssee', 'img', 'gfx', 'noirblanc')
os.makedirs(OUT, exist_ok=True)
L = lambda n: Image.open(os.path.join(SRC, n)).convert('RGBA')
spring, eau, volc, arbres = L('printemps.png'), L('eau.png'), L('volcan.png'), L('arbres.png')
T = 16
tile = lambda im, cx, cy: im.crop((cx * T, cy * T, cx * T + T, cy * T + T))
flip = lambda t: t.transpose(Image.FLIP_LEFT_RIGHT)


def roll(t, dx):
    o = Image.new('RGBA', (T, T)); o.paste(t, (dx, 0)); o.paste(t, (dx - T, 0)); return o


def tone(t, b=1.0, s=1.0):
    r, g, bl, a = t.split(); rgb = Image.merge('RGB', (r, g, bl))
    rgb = ImageEnhance.Brightness(ImageEnhance.Color(rgb).enhance(s)).enhance(b)
    return Image.merge('RGBA', (*rgb.split(), a))


def over(base, sp):
    o = base.copy(); o.alpha_composite(sp); return o


def trim(im, box):
    c = im.crop(box); bb = c.getbbox(); return c.crop(bb) if bb else c


def verdir(t):
    a = np.array(t).astype(float); a[..., 0] *= 0.85; a[..., 1] *= 1.02; a[..., 2] *= 0.55
    return Image.fromarray(a.clip(0, 255).astype('uint8'), 'RGBA')


grass = [verdir(tile(spring, 0, 0)), verdir(tile(spring, 1, 0)), verdir(tile(spring, 2, 1))]   # herbe turquoise ramenée vers le vert
dirt, sand = tile(spring, 1, 2), tile(spring, 2, 7)
water = eau.crop((104, 616, 120, 632))
rockfloor, lava = tile(volc, 0, 0), [tile(volc, 5, 4), tile(volc, 11, 4)]
tuft, tuft2 = tile(volc, 2, 0), tile(volc, 2, 1)
files = {
    'grass0': grass[0], 'grass1': grass[1], 'grass2': grass[2],
    'forest0': tone(grass[0], 0.8), 'forest1': flip(tone(grass[1], 0.78)),
    'path0': dirt, 'sand0': sand, 'pave0': tone(rockfloor, 1.15, 0.3),
    'snow0': tone(sand, 1.18, 0.15), 'snow1': flip(tone(sand, 1.16, 0.15)),
    'ash0': tone(rockfloor, 0.7, 0.4), 'ash1': flip(tone(rockfloor, 0.66, 0.4)),
    'cave0': rockfloor, 'cave1': flip(rockfloor), 'lava0': lava[0], 'lava1': lava[1],
    'tall0': over(grass[0], tuft), 'tall1': over(grass[1], flip(tuft2)),
    'darktall0': over(tone(grass[0], 0.8), tone(tuft, 0.75)), 'darktall1': over(tone(grass[1], 0.78), flip(tone(tuft2, 0.75))),
    'snowtall0': over(tone(sand, 1.35, 0.1), tone(tuft, 1.2, 0.3)), 'snowtall1': over(tone(sand, 1.32, 0.1), flip(tone(tuft2, 1.2, 0.3))),
}
for f in range(4):
    files[f'water{f}'] = roll(water, 4 * f); files[f'deep{f}'] = roll(tone(water, 0.75), 4 * f)
# décor (sprites ancrés aux pieds, densité 2 : pixel pour pixel à l'écran)
deco = {
    'tree': trim(arbres, (79, 4, 113, 64)), 'tree2': trim(arbres, (143, 4, 177, 64)),
    'pine': trim(arbres, (16, 127, 49, 209)), 'snowpine': trim(arbres, (527, 127, 561, 209)),
    'palm': trim(arbres, (73, 70, 119, 129)), 'bush': trim(arbres, (79, 304, 97, 326)),
    'rock': trim(volc, (256, 32, 288, 64)), 'deadtree': trim(volc, (330, 0, 368, 64)),
}
# bâtiments entiers (maisons_bw2.png, Phyromatical) : posés devant l'emprise du bâtiment du jeu
mais = L('maisons_bw2.png')
bats = {'center': trim(mais, (16, 15, 160, 159)), 'house': trim(mais, (175, 36, 268, 159)),
        'house2': trim(mais, (188, 186, 283, 287)), 'gym': trim(mais, (22, 178, 170, 383))}
def sans_ombre(im):   # l'ombre (pixels à moitié transparents) sous le bâtiment : coupée, le pied de l'image = le bas du mur
    a = np.array(im); rows = np.where((a[..., 3] > 128).any(1))[0]
    return im.crop((0, 0, im.width, rows.max() + 1))


# (bats ne sert plus qu'à découper les kits ci-dessous)
# kits de façade (4 × 4 cellules de 16 px, rôles de odyssee/js/data/regles.js) découpés dans les bâtiments Noir & Blanc 2 :
# le jeu assemble avec eux des bâtiments de n'importe quelle taille, à l'échelle de tout le reste
GRILLE = [['mur', 'fenetre', 'fenetre_nuit', 'socle'], ['porte', 'porte_nuit', 'linteau', 'cote'],
          ['toit', 'rebord', 'faite', 'cheminee'], ['enseigne_g', 'enseigne_d', 'fleurs', 'lampe']]
ODY = os.path.join(ROOT, 'odyssee', 'img', 'facades')


def nuit(t):
    a = np.array(t).astype(float); vitre = (a[..., 2] > a[..., 0] + 45) & (a[..., 2] > a[..., 1]) & (a[..., 3] > 0)
    a[vitre, 0] = 255; a[vitre, 1] = 225; a[vitre, 2] = 140
    return Image.fromarray(a.clip(0, 255).astype('uint8'), 'RGBA')


def kit(src, cases, base):
    old = Image.open(os.path.join(ODY, base + '.png')).convert('RGBA')
    k = Image.new('RGBA', (64, 64))
    for j, row in enumerate(GRILLE):
        for i, role in enumerate(row):
            if role in cases:
                x, y = cases[role]; c = src.crop((x, y, x + 16, y + 16))
            elif role == 'fenetre_nuit':
                x, y = cases['fenetre']; c = nuit(src.crop((x, y, x + 16, y + 16)))
            elif role == 'porte_nuit':
                x, y = cases['porte']; c = src.crop((x, y, x + 16, y + 16))
            else:
                c = old.crop((i * 16, j * 16, i * 16 + 16, j * 16 + 16))   # enseignes, fleurs, lampe : ceux du jeu
            k.paste(c, (i * 16, j * 16))
    return k


h, c = bats['house'], bats['center']
deco['kit_maison'] = kit(h, {'mur': (4, 80), 'fenetre': (32, 64), 'socle': (4, 92), 'porte': (32, 90), 'linteau': (32, 76),
                             'cote': (60, 82), 'toit': (2, 34), 'rebord': (4, 64), 'faite': (2, 34), 'cheminee': (2, 34)}, 'maison')
deco['kit_centre'] = kit(c, {'mur': (24, 104), 'fenetre': (100, 66), 'socle': (24, 116), 'porte': (62, 114), 'linteau': (62, 98),
                             'cote': (8, 104), 'toit': (30, 40), 'rebord': (30, 84), 'faite': (30, 40), 'cheminee': (30, 40)}, 'centre')
# planches de villes détourées (tools/odyssee-detourer.py) : maisons_toits.png et ville.png
toits, ville = L('maisons_toits.png'), L('ville.png')
teal = ville.crop((147, 432, 233, 561))
deco['kit_bleue'] = kit(toits, {'mur': (64, 94), 'fenetre': (60, 82), 'socle': (64, 100), 'porte': (36, 92), 'linteau': (36, 80),
                                'cote': (20, 90), 'toit': (110, 12), 'rebord': (40, 54), 'faite': (110, 12), 'cheminee': (110, 30)}, 'maison')
deco['kit_turquoise'] = kit(teal, {'mur': (56, 74), 'fenetre': (42, 74), 'socle': (2, 96), 'porte': (16, 94), 'linteau': (16, 82),
                                   'cote': (2, 90), 'toit': (40, 50), 'rebord': (40, 62), 'faite': (40, 50), 'cheminee': (8, 4)}, 'maison')
deco['kit_orange'] = kit(ville.crop((245, 397, 363, 555)), {'mur': (12, 120), 'fenetre': (20, 104), 'socle': (12, 136), 'porte': (52, 128), 'linteau': (52, 104),
                                   'cote': (4, 120), 'toit': (20, 60), 'rebord': (20, 76), 'faite': (20, 60), 'cheminee': (20, 60)}, 'maison')
# vrais arbres Noir & Blanc (route.png) : remplacent ceux de Taragonia
route = L('route.png')
deco['tree'] = trim(route, (219, 11, 254, 68)); deco['tree2'] = trim(route, (219, 75, 254, 132))
deco['pine'] = trim(route, (169, 10, 207, 68))
# bâtiments entiers du kit « Pokémon Essentials BW » (KleinStudio), planche PkmnBlackWhiteSet.png : tuiles de 32 px,
# soit pile la taille d'une case à l'écran ; posés tels quels (pixel pour pixel) par le jeu
BW = L('kit_bw_set.png')
BATS = {   # nom : (x0, y0, x1, y1) dans la planche
    'centre': None, 'boutique': None,
}
import json as _json
COMPS = _json.load(open(os.path.join(SRC, 'kit_bw_batiments.json')))
for nom, (x0, y0, x1, y1, porte) in COMPS.items():
    deco['b_' + nom] = BW.crop((x0, y0, x1, y1))
# mer du kit (autotiles animés de 8 images de 96 px ; la tuile pleine est au centre, 32 px)
mer, merp = L('mer.png'), L('mer_profonde.png')
for f in range(4):
    files[f'water{f}'] = mer.crop((f * 192 + 32, 64, f * 192 + 64, 96)); files[f'deep{f}'] = merp.crop((f * 192 + 32, 64, f * 192 + 64, 96))
# hautes herbes du kit (32 px, pixel pour pixel à l'écran) posées sur l'herbe agrandie
big = lambda t: t.resize((32, 32), Image.NEAREST)
th = BW.crop((128, 352, 160, 384)); thd = BW.crop((160, 352, 192, 384))
files['tall0'] = over(big(grass[0]), verdir(th)); files['tall1'] = over(big(grass[1]), verdir(th).transpose(Image.FLIP_LEFT_RIGHT))
files['darktall0'] = over(big(files['forest0']), tone(verdir(th), 0.8)); files['darktall1'] = over(big(files['forest1']), tone(verdir(th), 0.78).transpose(Image.FLIP_LEFT_RIGHT))
files['snowtall0'] = over(big(files['snow0']), thd); files['snowtall1'] = over(big(files['snow1']), thd.transpose(Image.FLIP_LEFT_RIGHT))
for n, im in {**files, **{('' if k.startswith(('kit_', 'b_')) else 'd_') + k: v for k, v in deco.items()}}.items():
    im.save(os.path.join(OUT, n + '.png'))
print(len(files), 'tuiles et', len(deco), 'décors dans', os.path.normpath(OUT))
