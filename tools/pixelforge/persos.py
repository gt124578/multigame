#!/usr/bin/env python3
# Odyssée — PixelForge / personnages : essai de dresseurs et d'habitants à la façon des jeux DS (cases de 32 × 32,
# personnage d'une quinzaine de pixels de large, grosse tête, trois tons par matière, contour sombre teinté).
# Tout est écrit ici : gabarits en texte (un caractère = un pixel) pour la tête et le corps, vus de face, de dos et
# de profil ; une fiche par personnage (coiffure, couleurs, accessoires). Personnages originaux, aucun dessin repris.
#
#   python3 tools/pixelforge/persos.py out/            → out/persos_planche.png (×6), out/<nom>.png (planche 12 × 1)
#   python3 tools/pixelforge/persos.py out/ --jeu      → aussi out/chars_essai.png : la planche du jeu (odyssee/img/
#        chars.png) où ces personnages remplacent quelques rangées, agrandis ×2 (cases de 64 px), pour un essai en jeu
#
# Ordre des 12 cases, comme chars.png : bas (pas 1, arrêt, pas 2), gauche, droite, haut.
import os, sys
from PIL import Image

# ------------------------------------------------------------------ gabarits (16 de large) ----------------------
# . vide   o contour   s S peau / ombre   h H cheveux / ombre   c C couvre-chef / ombre   v visière
# t T haut / ombre   p P bas / ombre   f chaussures   e œil   b sac
def R(*parts):
    r = ''.join(parts); assert len(r) == 16, (r, len(r)); return r

FACE = [R('.oh', 'ssessssess', 'ho.'), R('.os', 'ssessssesS', 'so.'), R('..o', 'sssssssssS', 'o..'), R('...o', 'sssSSsss', 'o...'), R('....oooooooo....')]
TETE = {
    'face': {
        'casquette': [R('....oooooooo....'), R('...occcccccco...'), R('..o', 'cccccccccC', 'o..'), R('..o', 'cccccccccC', 'o..'), R('..o', 'CCCCCCCCCC', 'o..'),
                      R('.o', 'vvvvvvvvvvvv', 'o.'), R('.oh', 'ssssssssss', 'ho.')] + FACE,
        'court': [R('....oooooooo....'), R('...ohhhhhhhho...'), R('..o', 'hhhhhhhhhH', 'o..'), R('.o', 'hhhhhhhhhhhH', 'o.'), R('.o', 'hhhhhhhhhhhH', 'o.'),
                  R('.o', 'hhhhshhshhhH', 'o.'), R('.oh', 'hsssssssss', 'Ho.')] + FACE,
        'long': [R('....oooooooo....'), R('...ohhhhhhhho...'), R('..o', 'hhhhhhhhhH', 'o..'), R('.o', 'hhhhhhhhhhhH', 'o.'), R('.o', 'hhhhhhhhhhhH', 'o.'),
                 R('.o', 'hhhsshhsshhH', 'o.'), R('.oh', 'hsssssssss', 'Ho.'), R('.oh', 'ssessssess', 'Ho.'), R('.oh', 'ssessssesS', 'Ho.'),
                 R('.oh', 'sssssssssS', 'Ho.'), R('.oho', 'sssSSsss', 'oHo.'), R('.ohhoooooooohHo.')],
        'ancien': [R('....oooooooo....'), R('...osssssssso...'), R('..o', 'sssssssssS', 'o..'), R('.o', 'ssssssssssss', 'o.'), R('.oh', 'ssssssssss', 'ho.'),
                   R('.oh', 'hsssssssss', 'Ho.'), R('.oh', 'hsssssssss', 'Ho.'), R('.oh', 'ssessssess', 'ho.'), R('.os', 'ssessssesS', 'so.'),
                   R('..o', 'sshhhhhhsS', 'o..'), R('...o', 'shhhhhhs', 'o...'), R('....oooooooo....')],
    },
    'dos': {
        'casquette': [R('....oooooooo....'), R('...occcccccco...'), R('..o', 'cccccccccC', 'o..'), R('..o', 'cccccccccC', 'o..'), R('..o', 'cccccccccC', 'o..'),
                      R('.oo', 'ccccooccCC', 'oo.'), R('.o', 'hhhhcccchhhH', 'o.'), R('.o', 'hhhhhhhhhhhH', 'o.'), R('.os', 'hhhhhhhhhH', 'so.'),
                      R('..o', 'hhhhhhhhhH', 'o..'), R('...o', 'ssssssSS', 'o...'), R('....oooooooo....')],
        'court': [R('....oooooooo....'), R('...ohhhhhhhho...'), R('..o', 'hhhhhhhhhH', 'o..')] + [R('.o', 'hhhhhhhhhhhH', 'o.')] * 5 +
                 [R('.os', 'hhhhhhhhhH', 'so.'), R('..o', 'hhhhhhhhhH', 'o..'), R('...o', 'ssssssSS', 'o...'), R('....oooooooo....')],
        'long': [R('....oooooooo....'), R('...ohhhhhhhho...'), R('..o', 'hhhhhhhhhH', 'o..')] + [R('.o', 'hhhhhhhhhhhH', 'o.')] * 9,
        'ancien': [R('....oooooooo....'), R('...osssssssso...'), R('..o', 'sssssssssS', 'o..'), R('.o', 'sssssssssssS', 'o.'), R('.oh', 'ssssssssss', 'Ho.')] +
                  [R('.o', 'hhhhhhhhhhhH', 'o.')] * 3 + [R('.os', 'hhhhhhhhhH', 'so.'), R('..o', 'hhhhhhhhhH', 'o..'), R('...o', 'ssssssSS', 'o...'), R('....oooooooo....')],
    },
    # profil : le personnage regarde à gauche
    'profil': {
        'casquette': [R('....oooooooo....'), R('...occcccccco...'), R('..o', 'ccccccccCC', 'o..'), R('..o', 'ccccccccCC', 'o..'), R('..o', 'CCCCCCCCCC', 'o..'),
                      R('o', 'vvvvv', 'sshhhhH', 'o..'), R('.oo', 'sesss', 'hhhhH', 'o..'), R('..o', 'sesss', 'shhhH', 'o..'), R('.os', 'sssss', 'shhhH', 'o..'),
                      R('..o', 'sssss', 'sshhH', 'o..'), R('...o', 'ssSSs', 'ssoo', '...'), R('....ooooooo.....')],
        'court': [R('....oooooooo....'), R('...ohhhhhhhho...'), R('..o', 'hhhhhhhhhH', 'o..'), R('..o', 'hhhhhhhhhH', 'o..'), R('..o', 'hhhhhhhhhH', 'o..'),
                  R('..o', 'hshhh', 'hhhhH', 'o..'), R('..o', 'sesss', 'hhhhH', 'o..'), R('..o', 'sesss', 'shhhH', 'o..'), R('.os', 'sssss', 'shhhH', 'o..'),
                  R('..o', 'sssss', 'sshhH', 'o..'), R('...o', 'ssSSs', 'ssoo', '...'), R('....ooooooo.....')],
        'long': [R('....oooooooo....'), R('...ohhhhhhhho...'), R('..o', 'hhhhhhhhhH', 'o..'), R('..o', 'hhhhhhhhhH', 'o..'), R('..o', 'hhhhhhhhhH', 'o..'),
                 R('..o', 'hshhh', 'hhhhH', 'o..'), R('..o', 'sesss', 'hhhhH', 'o..'), R('..o', 'sesss', 'shhhH', 'o..'), R('.os', 'sssss', 'shhhH', 'o..'),
                 R('..o', 'sssss', 'shhhH', 'o..'), R('...o', 'ssSSs', 'ohhH', 'o..'), R('....ooooo', 'hhhH', 'o..')],
        'ancien': [R('....oooooooo....'), R('...osssssssso...'), R('..o', 'sssssssssS', 'o..'), R('..o', 'sssssssssS', 'o..'), R('..o', 'ssssss', 'hhhH', 'o..'),
                   R('..o', 'sssss', 'shhhH', 'o..'), R('..o', 'sesss', 'hhhhH', 'o..'), R('..o', 'sesss', 'shhhH', 'o..'), R('.os', 'sssss', 'shhhH', 'o..'),
                   R('..o', 'hhhss', 'sshhH', 'o..'), R('...o', 'hhSSs', 'ssoo', '...'), R('....ooooooo.....')],
    },
}
CORPS = {
    'face': [R('..o', 'tttttttttT', 'o..'), R('.o', 'tttttttttttT', 'o.'), R('.o', 'tt', 'o', 'ttttttt', 'oT', 'o.'), R('.o', 'tt', 'o', 'ttttttt', 'oT', 'o.'),
             R('.o', 'ss', 'o', 'ttttttT', 'oS', 'o.'), R('..oo', 'tttttttT', 'oo..'), R('...o', 'pppppppP', 'o...'), R('...o', 'ppp', 'oo', 'ppP', 'o...'),
             R('...o', 'ppp', 'oo', 'ppP', 'o...'), R('...o', 'fff', 'oo', 'fff', 'o...'), R('...oooooooooo...')],
    'dos': [R('..o', 'tttttttttT', 'o..'), R('.o', 'tttttttttttT', 'o.'), R('.o', 'tt', 'o', 'ttttttt', 'oT', 'o.'), R('.o', 'tt', 'o', 'ttttttt', 'oT', 'o.'),
            R('.o', 'ss', 'o', 'ttttttT', 'oS', 'o.'), R('..oo', 'tttttttT', 'oo..'), R('...o', 'pppppppP', 'o...'), R('...o', 'ppp', 'oo', 'ppP', 'o...'),
            R('...o', 'ppp', 'oo', 'ppP', 'o...'), R('...o', 'fff', 'oo', 'fff', 'o...'), R('...oooooooooo...')],
    'profil': [R('....o', 'tttttT', 'o....'), R('....o', 'tttTtT', 'o....'), R('....o', 'tttTtT', 'o....'), R('....o', 'tttTtT', 'o....'),
               R('....o', 'ttsstT', 'o....'), R('....o', 'tttttT', 'o....'), R('....o', 'pppppP', 'o....'), R('....o', 'pppppP', 'o....'),
               R('....o', 'pppppP', 'o....'), R('...o', 'ffffff', 'o.....'), R('...oooooooo.....')],
}
# jambes en marche : de face / de dos, une jambe levée (plus courte) ; de profil, jambes écartées
def pas_face(corps, cote):
    c = [list(r) for r in corps]
    xs = range(3, 8) if cote == 'g' else range(8, 13)          # jambe levée : gauche ou droite de l'image
    for x in xs: c[8][x], c[9][x], c[10][x] = c[9][x], c[10][x], '.'
    return [''.join(r) for r in c]
def pas_profil(corps, k):
    c = list(corps)
    c[8] = R('...o', 'pp' if k == 1 else 'PP', 'oo', 'ppP' if k == 1 else 'ppp', 'o....')
    c[9] = R('..o', 'ff', 'o..o', 'ff', 'o....')
    c[10] = R('..ooo....ooo....')
    # le bras suit : la main avance ou recule d'un pixel
    c[4] = R('....o', 'tsstTT' if k == 1 else 'tttssT', 'o....')
    return c

# ------------------------------------------------------------------ couleurs ------------------------------------
def hx(c): return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))
def ombre(c, f=0.72):
    """ton d'ombre : plus sombre, tiré vers le bleu-violet (rampe façon DS)"""
    r, g, b = c; return (int(r * f * 0.94), int(g * f * 0.96), min(255, int(b * f * 1.08)))
def contour(c):
    r, g, b = c; return (int(r * 0.30), int(g * 0.28), int(b * 0.42))

def palette(f):
    P = {'s': hx(f.get('peau', '#f6c9a0')), 'h': hx(f.get('cheveux', '#5a3a26')), 'c': hx(f.get('coiffe', '#2a8a80')), 't': hx(f.get('haut', '#e8562a')),
         'p': hx(f.get('bas', '#3a4050')), 'f': hx(f.get('chaussures', '#c83232')), 'b': hx(f.get('sac', '#e8c040')), 'e': (34, 28, 40)}
    P['S'] = ombre(P['s'], 0.82); P['H'] = ombre(P['h']); P['C'] = ombre(P['c']); P['T'] = ombre(P['t']); P['P'] = ombre(P['p'])
    P['v'] = ombre(P['c'], 0.6)
    return P

def dessiner(lignes, f, extras=()):
    """lignes : 23 rangées de 16 caractères → image 32 × 32 (personnage centré, pieds à la rangée 30)"""
    P = palette(f); g = [list(r) for r in lignes]
    for (x, y, ch) in extras:
        if 0 <= y < len(g) and 0 <= x < 16: g[y][x] = ch
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); px = im.load()
    H = len(g); oy = 31 - H; ox = 8
    for y in range(H):
        for x in range(16):
            ch = g[y][x]
            if ch == '.': continue
            if ch == 'o':
                # contour teinté : la couleur de la matière voisine, très assombrie
                vs = [P[g[j][i]] for i, j in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1), (x + 1, y + 1))
                      if 0 <= j < H and 0 <= i < 16 and g[j][i] in P]
                c = contour(tuple(sum(v[k] for v in vs) // len(vs) for k in range(3))) if vs else (30, 26, 40)
            else: c = P[ch]
            px[ox + x, oy + y] = c + (255,)
    return im

def miroir(lignes): return [r[::-1] for r in lignes]

def extras(f, vue):
    E = []
    if f.get('sangle') and vue == 'face':                       # sangle du sac en travers du torse
        for k in range(5): E.append((10 - k, 12 + k, 'b'))
    if f.get('sangle') and vue == 'dos':                        # le sac, dans le dos
        for y in (14, 15, 16):
            for x in range(8, 12): E.append((x, y, 'b'))
        for k in range(3): E.append((6 + k, 12 + k, 'b'))
    if f.get('sangle') and vue == 'profil':
        for y in (14, 15, 16): E.append((10, y, 'b'))
    if f.get('coiffure') == 'long':                              # cheveux sur les épaules
        if vue == 'face': E += [(x, y, 'h') for y in (12, 13) for x in (1, 2)] + [(x, y, 'H') for y in (12, 13) for x in (13, 14)]
        if vue == 'dos': E += [(x, y, 'h') for y in (12, 13, 14) for x in range(3, 12)] + [(12, y, 'H') for y in (12, 13, 14)] + [(x, 15, 'o') for x in range(3, 13)]
        if vue == 'profil': E += [(x, y, 'h') for y in (12, 13) for x in (9, 10)] + [(11, y, 'H') for y in (12, 13)]
    if f.get('jupe') and vue in ('face', 'dos'):                 # jupe : le bas s'évase d'un pixel
        E += [(2, 18, 'o'), (13, 18, 'o')] + [(x, 18, 't') for x in range(3, 12)] + [(12, 18, 'T')]
    return E

def planche(f):
    """les 12 cases d'un personnage : bas, gauche, droite, haut ; chacune : pas 1, arrêt, pas 2"""
    st = f.get('coiffure', 'court'); cases = []
    for vue in ('face', 'profil', 'profilD', 'dos'):
        v = 'profil' if vue == 'profilD' else vue
        tete, corps = TETE[v][st], CORPS[v]
        if v == 'profil': var = [pas_profil(corps, 1), corps, pas_profil(corps, 2)]
        else: var = [pas_face(corps, 'g'), corps, pas_face(corps, 'd')]
        for k, c in enumerate(var):
            lig = tete + c; E = extras(f, v)
            # petit sursaut d'un pixel quand le pied se lève (la tête et le buste montent)
            im = dessiner(lig, f, E)
            if vue == 'profilD': im = im.transpose(Image.FLIP_LEFT_RIGHT)
            cases.append(im)
    sh = Image.new('RGBA', (12 * 32, 32), (0, 0, 0, 0))
    for i, im in enumerate(cases): sh.alpha_composite(im, (i * 32, 0))
    return sh

# ------------------------------------------------------------------ fiches --------------------------------------
FICHES = {
    'dresseur': dict(coiffure='casquette', coiffe='#2a8a80', cheveux='#5a3422', haut='#e8562a', bas='#3a4050', chaussures='#d03030', sac='#f0c838', sangle=True),
    'dresseuse': dict(coiffure='long', cheveux='#2a2430', haut='#8a4ac0', bas='#2e6a70', chaussures='#7a4a2a', sac='#f0c838', sangle=True),
    'gamin': dict(coiffure='casquette', coiffe='#3a68c8', cheveux='#3a2a20', haut='#f6d84a', bas='#3a5aa8', chaussures='#2a3a6a'),
    'habitante': dict(coiffure='long', cheveux='#8a4a2a', haut='#3aa860', bas='#3aa860', chaussures='#6a4a3a', jupe=True),
    'ancien': dict(coiffure='ancien', cheveux='#e8e6e0', haut='#7a4a2e', bas='#5a4634', chaussures='#3a2a22', peau='#f0c0a0'),
    'montagnard': dict(coiffure='court', cheveux='#6a4a2a', haut='#c83a32', bas='#4a4a52', chaussures='#5a3a22', peau='#e8b890'),
}
# rangées de odyssee/img/chars.png remplacées par l'essai (--jeu)
RANGEES_JEU = {'dresseur': 'player_m', 'dresseuse': 'player_f', 'gamin': 'gamin', 'habitante': 'habitante', 'ancien': 'vieil_homme', 'montagnard': 'montagnard'}

if __name__ == '__main__':
    out = next((a for a in sys.argv[1:] if not a.startswith('--')), '.')
    os.makedirs(out, exist_ok=True)
    feuilles = {n: planche(f) for n, f in FICHES.items()}
    for n, sh in feuilles.items(): sh.save(os.path.join(out, n + '.png'))
    z = 6; W = 12 * 32 * z + 24; H = len(feuilles) * (32 * z + 12) + 12
    pl = Image.new('RGBA', (W, H), (104, 184, 96, 255))
    for i, sh in enumerate(feuilles.values()): pl.alpha_composite(sh.resize((sh.width * z, sh.height * z), Image.NEAREST), (12, 12 + i * (32 * z + 12)))
    pl.save(os.path.join(out, 'persos_planche.png'))
    if '--jeu' in sys.argv:
        import json, re
        racine = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
        src = open(os.path.join(racine, 'odyssee', 'js', 'data', 'sprites.js'), encoding='utf-8').read()
        rows = json.loads(re.search(r'"rows":(\{.*?\})', src).group(1))
        ch = Image.open(os.path.join(racine, 'odyssee', 'img', 'chars.png')).convert('RGBA')
        for n, cible in RANGEES_JEU.items():
            y = rows[cible] * 64
            ch.paste(Image.new('RGBA', (768, 64), (0, 0, 0, 0)), (0, y))
            big = feuilles[n].resize((768, 64), Image.NEAREST)
            # dans le jeu, les pieds sont 3 pixels (denses) au-dessus du bas de la case : même place
            ch.alpha_composite(big, (0, y))
        ch.save(os.path.join(out, 'chars_essai.png'))
    print('ok', out)
