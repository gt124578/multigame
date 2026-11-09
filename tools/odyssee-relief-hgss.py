#!/usr/bin/env python3
# Odyssée — textures du relief reprises de HeartGold / SoulSilver (provisoires, comme les personnages HGSS).
#
# Sources (dans assets/graphics/hgss/relief/, tirées des tilesets HGSS de Pokémon DS Map Studio) :
#   wall01_d.png  paroi de roche du dehors (lèvre de roche, rochers, pied)      Tileset 2 « Overworld »
#   wall01_g.png  la même avec une lèvre d'herbe (et un pied sur l'herbe)
#   cliff01.png   dessus plat de la roche
#   dwall01_n.png paroi de grotte                                              Tileset 73 « Cerulean Cave »
#   dcliff01.png  dessus de la roche dans une grotte
#
#   python3 tools/odyssee-relief-hgss.py
#
# Écrit odyssee/img/hgss/relief.png, lu par odyssee/js/render/falaises.js : 128 px de large, une rangée de 64 px par
# biome (BIOMES de falaises.js), d'abord les biomes du dehors, puis les mêmes pour les grottes.
#   x 0..63   dessus de la roche (32 × 32 répété), recoloré dans la palette DESSUS du biome
#   x 64..127 bandes de paroi (32 de large, répétées deux fois), 17 rangées chacune :
#             rangées 0-2 lèvre (sur le replat, au bord), 3-13 la paroi, 14-16 le pied
#             bande 0 (y 0..16)  : roche (paroi de roche, lèvre de roche)
#             bande 1 (y 17..33) : paroi à lèvre d'herbe — la lèvre et le pied sont codés : (255, 0, 255) = le sol
#             voisin se voit au travers, (0 | 100 | 200, 0, 255) = teinte 0, 1 ou 2 de la lèvre (herbe, neige, sable :
#             le shader la choisit selon le dessus)
# La paroi est recolorée dans la palette FACE du biome (rang de luminance) ; « montagne » garde les couleurs de HGSS.
import os, re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'graphics', 'hgss', 'relief')
OUT = os.path.join(ROOT, 'odyssee', 'img', 'hgss', 'relief.png')
JS = open(os.path.join(ROOT, 'odyssee', 'js', 'render', 'falaises.js'), encoding='utf-8').read()

BIOMES = re.findall(r"'(\w+)'", re.search(r"export const BIOMES = \[([^\]]+)\]", JS).group(1))
def palettes(nom):
    bloc = re.search(r"const " + nom + r" = \{(.*?)\n\};", JS, re.S).group(1)
    return {b: [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in re.findall(r"'(#[0-9a-fA-F]{6})'", l)]
            for b, l in re.findall(r"(\w+): \[([^\]]+)\]", bloc)}
FACE, DESSUS = palettes('FACE'), palettes('DESSUS')

lum = lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
img = lambda n: Image.open(os.path.join(SRC, n)).convert('RGBA')
CLE = (255, 0, 255, 255)
VERTS = {(0x70, 0xd8, 0xa8), (0x70, 0xd0, 0xa8)}          # l'herbe de HGSS : le sol voisin
def vert(c): return c[1] > c[0] + 12 and c[1] > c[2] - 40      # pixel d'herbe (lèvre, pied)

def recolore(src, cible, garder=False):
    """dictionnaire couleur source → couleur cible, par rang de luminance (sur les couleurs de roche de src)"""
    cols = sorted({c[:3] for c in src if not vert(c)}, key=lum)
    if garder: return {c: c for c in cols}
    l0, l1 = lum(cols[0]), lum(cols[-1])
    return {c: cible[min(len(cible) - 1, int(round((lum(c) - l0) / max(1, l1 - l0) * (len(cible) - 1))))] for c in cols}

def bande(im, rangs, pal, herbe=False):
    """17 rangées × 32 colonnes, à partir des rangées `rangs` de l'image"""
    out = []
    for r in rangs:
        ligne = []
        for x in range(32):
            c = im.getpixel((x % im.width, r))[:3]
            if herbe and c in VERTS: ligne.append(CLE)
            elif herbe and vert(c): ligne.append((0 if lum(c) < 130 else 100 if lum(c) < 158 else 200, 0, 255, 255))
            else: ligne.append(pal.get(c, c) + (255,))
        out.append(ligne)
    return out

# rangées des sources : lèvre (3), paroi (11), pied (3)
R_ROCHE = [0, 1, 2] + list(range(3, 14)) + [29, 30, 31]
R_HERBE = [0, 1, 2] + list(range(3, 14)) + [13, 14, 15]
R_GROTTE = [1, 2, 3] + [4, 5, 6, 7, 8, 8, 9, 10, 11, 12, 13] + [13, 14, 15]

wd, wg, cl, gw, gc = img('wall01_d.png'), img('wall01_g.png'), img('cliff01.png'), img('dwall01_n.png'), img('dcliff01.png')
n = len(BIOMES)
atlas = Image.new('RGBA', (128, 64 * n * 2), (0, 0, 0, 0))
for grotte in (0, 1):
    for k, b in enumerate(BIOMES):
        y0 = (grotte * n + k) * 64
        garder = b == 'montagne' and not grotte
        mur, dessus = (gw, gc) if grotte else (wd, cl)
        pf = recolore([mur.getpixel((x, y)) for y in range(mur.height) for x in range(mur.width)] + [wg.getpixel((x, y)) for y in range(wg.height) for x in range(wg.width)] * (not grotte), FACE[b], garder)
        # (dans une grotte, le dessus de la roche reste dans les teintes sombres : c'est le haut du massif, sous la voûte)
        pd = recolore([dessus.getpixel((x, y)) for y in range(dessus.height) for x in range(dessus.width)], DESSUS[b][:4] if grotte else DESSUS[b], garder)
        for y in range(64):
            for x in range(64):
                c = dessus.getpixel((x % 32, y % 32))[:3]
                atlas.putpixel((x, y0 + y), pd.get(c, c) + (255,))
        b0 = bande(mur, R_GROTTE if grotte else R_ROCHE, pf)
        b1 = b0 if grotte else bande(wg, R_HERBE, pf, herbe=True)
        for j, ligne in enumerate(b0 + b1):
            for x in range(64):
                atlas.putpixel((64 + x, y0 + j), ligne[x % 32])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
atlas.save(OUT, optimize=True)
print('écrit', os.path.relpath(OUT, ROOT), atlas.size, '·', n, 'biomes ×2')
