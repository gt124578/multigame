#!/usr/bin/env python3
# Odyssée — PixelForge / démonstration des outils de volume et de finition (pixel.py) :
#   1. un rocher dessiné en aplats (l'ancienne méthode) puis en relief : carte des hauteurs, rampe teintée,
#      occlusion des creux, contour sélectif, pixels orphelins nettoyés — à côté du rocher du jeu ;
#   2. des sculptures de l'Atelier 3D réduites en sprites du jeu (depuis_3d) — à côté des statues du jeu.
# Tout est posé sur le vrai sol du jeu avec le dresseur pour l'échelle (apercu_jeu).
#   python3 tools/pixelforge/demo2d.py [dossier des rendus de l'atelier] [dossier de sortie]
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from pixel import Toile, rampe, rampe_teintee, hauteur_bombee, ombrer_relief, selout, nettoyer, depuis_3d, apercu_jeu, bruit

ICI = os.path.dirname(os.path.abspath(__file__)); RACINE = os.path.join(ICI, '..', '..')
RENDUS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/atelier3d'
SORTIE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ICI, 'demo2d')
os.makedirs(SORTIE, exist_ok=True)


def forme_rocher(W=30, H=26, graine=3):
    """silhouette d'un rocher : quelques ellipses fondues, base aplatie"""
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    blocs = [(W * 0.42, H * 0.6, W * 0.4, H * 0.42), (W * 0.64, H * 0.66, W * 0.33, H * 0.34), (W * 0.36, H * 0.42, W * 0.25, H * 0.3)]
    champ = np.zeros((H, W))
    for cx, cy, rx, ry in blocs: champ += np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) * 2.2)
    m = champ > 0.5
    m[H - 1:, :] = False
    return m


def rocher_aplats():
    """l'ancienne façon : un aplat, un reflet en haut à gauche, une ombre en bas à droite, contour sombre"""
    m = forme_rocher(); H, W = m.shape
    R = rampe('#4a4a52', '#7a7a80', '#a4a4a8', '#c8c8cc')
    t = Toile(W, H)
    for y in range(H):
        for x in range(W):
            if m[y, x]: t.p(x, y, R[2])
    for y in range(H):
        for x in range(W):
            if m[y, x] and (y + 1 >= H or not m[y + 1, x] or x + 1 >= W or not m[y, x + 1]): t.p(x, y, R[1])
    t.ellipse(W * 0.36, H * 0.3, 5, 3, R[3])
    t.contour(R[0])
    return t.a


def rocher_relief():
    m = forme_rocher(); H, W = m.shape
    h = hauteur_bombee(m, rayon=10, bruit_ampl=0.25, graine=4, echelle=3)
    # trois blocs qui se chevauchent : chacun son bombé, le plus haut l'emporte (arêtes nettes entre les blocs)
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    for cx, cy, rx, ry, z in [(W * 0.36, H * 0.42, 9, 8, 4), (W * 0.66, H * 0.66, 10, 8, 1), (W * 0.3, H * 0.72, 9, 6, 0)]:
        d = 1 - ((xx - cx) / rx) ** 2 - ((yy - cy) / ry) ** 2
        h = np.maximum(h, np.where(d > 0, np.sqrt(np.clip(d, 0, 1)) * 9 + z, 0) * m)
    for i in range(7): h[min(H - 1, 9 + i // 2), 15 + i] -= 4      # une fissure
    R = rampe_teintee('#8f8a84', 6, ecart=0.55)
    a = ombrer_relief(m, h, R, ao=0.8)
    a = nettoyer(a)
    a = np.pad(a, ((1, 1), (1, 1), (0, 0)))
    return selout(a)


avant, apres = rocher_aplats(), rocher_relief()
jeu = os.path.join(RACINE, 'odyssee/img/nature/rock.png')
apercu_jeu([avant, apres, jeu], echelle=4).save(os.path.join(SORTIE, '1_rocher_aplats_relief_jeu.png'))
Image.fromarray(apres, 'RGBA').save(os.path.join(SORTIE, 'rocher_relief.png'))

# sculptures de l'atelier → sprites du jeu (densité 1 : 32 px par case)
sprites = []
for nom in ('komainu32', 'dresseur32', 'toro32', 'jarre32'):
    f = os.path.join(RENDUS, nom + '.png')
    if os.path.exists(f):
        s = depuis_3d(f, couleurs=10); Image.fromarray(s, 'RGBA').save(os.path.join(SORTIE, nom.replace('32', '') + '_sprite32.png')); sprites.append(s)
nat = os.path.join(RACINE, 'odyssee/img/nature')
if sprites:
    apercu_jeu([os.path.join(nat, 'gymstatue.png'), os.path.join(nat, 'statue.png')] + sprites, echelle=3).save(os.path.join(SORTIE, '2_sculptures_32px.png'))
# même chose à densité 2 (64 px par case, comme les personnages « version 2 ») : bien plus lisible
sprites64 = []
for nom in ('komainu64', 'dresseur64', 'toro64', 'jarre64'):
    f = os.path.join(RENDUS, nom + '.png')
    if os.path.exists(f):
        s = depuis_3d(f, couleurs=14); Image.fromarray(s, 'RGBA').save(os.path.join(SORTIE, nom.replace('64', '') + '_sprite64.png')); sprites64.append(s)
if sprites64:
    apercu_jeu([os.path.join(nat, 'gymstatue.png'), os.path.join(nat, 'statue.png')] + sprites64, densites=[1, 1] + [2] * len(sprites64), echelle=2).save(os.path.join(SORTIE, '3_sculptures_64px.png'))
print('écrit dans', SORTIE)
