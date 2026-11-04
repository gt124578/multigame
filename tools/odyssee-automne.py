#!/usr/bin/env python3
"""tools/odyssee-automne.py — arbres d'automne d'Odyssée : les feuillus de la planche nature (tree, tree2, tree3) repeints
aux couleurs de l'automne (érables rouges, orangés, dorés), même dessin et même densité que les arbres verts.
  python3 tools/odyssee-automne.py   → odyssee/img/nature/automne0.png … automne5.png
Seuls les verts du feuillage changent de teinte (le tronc et l'ombre gardent les leurs) ; la lumière est conservée."""
import colorsys, os
from PIL import Image

RACINE = os.path.join(os.path.dirname(__file__), '..', 'odyssee', 'img', 'nature')
# (arbre source, teinte cible, saturation ×, luminosité ×) : rouge érable, orangé, doré
TEINTES = [('tree', 0.012, 1.15, 1.0), ('tree2', 0.045, 1.9, 1.55), ('tree', 0.115, 1.1, 1.1),
           ('tree', 0.07, 1.25, 1.06), ('tree2', 0.005, 1.8, 1.45), ('tree2', 0.1, 1.7, 1.6)]

def repeindre(src, cible, ks, kv):
    im = Image.open(os.path.join(RACINE, src + '.png')).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.17 < h < 0.5 and s > 0.18:          # feuillage vert
                # les ombres tirent vers le brun-pourpre, les lumières vers le jaune : l'automne n'est pas d'une seule couleur
                dh = (v - 0.5) * 0.06
                h2 = (cible + dh) % 1.0
                s2 = min(1.0, s * ks)
                v2 = min(1.0, v * kv * (1.08 if v > 0.55 else 0.95))
                r2, g2, b2 = colorsys.hsv_to_rgb(h2, s2, v2)
                px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return im

if __name__ == '__main__':
    for i, (src, h, ks, kv) in enumerate(TEINTES):
        out = os.path.join(RACINE, f'automne{i}.png')
        repeindre(src, h, ks, kv).save(out)
        print('écrit', out)
