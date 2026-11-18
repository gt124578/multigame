#!/usr/bin/env python3
# Odyssée — PixelForge / revue des décors : quels sprites « font plat » face à la caméra du jeu ?
#
# Le monde du jeu est vu d'en haut (55°, hauteurs étirées) : le dessus d'une caisse, d'une table ou d'un socle s'y voit.
# Un sprite dessiné en élévation pure (la face avant seule, un trait de 1 ou 2 px pour le dessus) paraît collé à la
# caméra, comme un décor de carton. Ce n'est pas le dessin qui est en cause, c'est la perspective.
# Classement fait à l'œil (127 sprites de nature/, deco/ et mobilier/, une variante par famille), à mettre à jour ici.
#   python3 tools/pixelforge/audit_perspective.py [sortie.png]
import os, sys
from PIL import Image, ImageDraw, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__)); IMG = os.path.join(ICI, '..', '..', 'odyssee', 'img')
SORTIE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ICI, 'audit_perspective.png')

GROUPES = [
    ('À refaire : socle ou base vus de face, aucun dessus', (220, 60, 60), [
        ('nature', 'gymstatue'), ('nature', 'statue'), ('deco', 'statue_dragon'), ('deco', 'gargouille'), ('deco', 'colonne'),
        ('deco', 'pilier_ball'), ('deco', 'brasero'), ('deco', 'trone'), ('nature', 'poutre_brulee'), ('nature', 'etai'), ('nature', 'poteau')]),
    ('Limite : défaut moins visible (objet fin, adossé au mur, dessus cassé)', (235, 170, 40), [
        ('nature', 'souche_brulee'), ('nature', 'pilier_brule'), ('nature', 'wagonnet'), ('deco', 'stele'),
        ('mobilier', 'armoire'), ('mobilier', 'fridge'), ('mobilier', 'books')]),
    ('Bons exemples : le dessus se voit (à imiter)', (80, 200, 110), [
        ('deco', 'fontaine'), ('deco', 'fossile'), ('deco', 'tonneau'), ('deco', 'cuve'), ('deco', 'caisses'), ('deco', 'coussin'),
        ('nature', 'mailbox'), ('nature', 'pot'), ('mobilier', 'table'), ('mobilier', 'trash'), ('mobilier', 'bed')]),
]
# densité des dossiers : nature/ et mobilier/ à 64 px par case, deco/ à 32 (agrandi ×2 pour comparer)
DENSITE = {'nature': 2, 'mobilier': 2, 'deco': 1}


def police(t):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', 'C:/Windows/Fonts/arial.ttf'):
        if os.path.exists(f): return ImageFont.truetype(f, t)
    return ImageFont.load_default()


def planche(Z=3, W=1560):
    herbe = Image.open(os.path.join(IMG, 'sol32', 'grass0.png')).convert('RGBA').resize((96, 96), Image.NEAREST)
    F, Ft = police(13), police(16)
    blocs = []
    for titre, coul, L in GROUPES:
        ims = []
        for d, n in L:
            im = Image.open(os.path.join(IMG, d, n + '.png')).convert('RGBA')
            k = 2 // DENSITE[d]; im = im.resize((im.width * k, im.height * k), Image.NEAREST)
            im = im.crop(im.getbbox()); ims.append((n, im.resize((im.width * Z, im.height * Z), Image.NEAREST)))
        rows, row, x = [], [], 0
        for n, im in ims:
            w = max(im.width, 110) + 18
            if x + w > W - 10: rows.append(row); row, x = [], 0
            row.append((n, im)); x += w
        rows.append(row)
        H = 44 + sum(max(i.height for _, i in r) + 36 for r in rows)
        B = Image.new('RGBA', (W, H))
        for xx in range(0, W, 96):
            for yy in range(0, H, 96): B.paste(herbe, (xx, yy))
        dr = ImageDraw.Draw(B)
        dr.rectangle((0, 0, W - 1, 32), fill=(20, 22, 28, 240)); dr.text((12, 7), titre, fill=coul + (255,), font=Ft)
        dr.rectangle((0, 0, W - 1, H - 1), outline=coul + (255,), width=4)
        y = 44
        for r in rows:
            h = max(i.height for _, i in r); x = 12
            for n, im in r:
                B.alpha_composite(im, (x, y + h - im.height))
                dr.rectangle((x, y + h + 6, x + max(im.width, 90), y + h + 26), fill=(20, 22, 28, 230)); dr.text((x + 4, y + h + 8), n, fill=(255, 235, 170, 255), font=F)
                x += max(im.width, 110) + 18
            y += h + 36
        blocs.append(B)
    P = Image.new('RGBA', (W, sum(b.height for b in blocs) + 20 * (len(blocs) - 1)), (27, 30, 36, 255)); y = 0
    for b in blocs: P.alpha_composite(b, (0, y)); y += b.height + 20
    return P


if __name__ == '__main__':
    planche().save(SORTIE); print('écrit', SORTIE)
