#!/usr/bin/env python3
# Odyssée — le Pokémon qui suit le dresseur, comme dans HeartGold / SoulSilver.
#
#  * partenaires de Rouge / Bleu et d'Or / Argent (et leurs évolutions) : les sprites « qui suivent » de HGSS
#    (modèles MMODEL_FOLLOWER_MON_*, 8 images de 32 × 32 : dos, face, profil gauche, profil droit, deux pas chacun),
#    lus dans un clone de pret/pokeheartgold et gardés dans assets/graphics/hgss/suiveurs/ ;
#  * créatures originales : en attendant leurs vrais dessins, leur icône (32 × 32) qui sautille.
#
#   python3 tools/odyssee-suiveurs.py [chemin/pokeheartgold]
#
# Écrit odyssee/img/suiveurs.png (cases de 64 × 64, densité 2, même disposition que chars.png : bas, gauche, droite,
# haut × pas, immobile, autre pas) et la clé « suiveurs » de odyssee/js/data/sprites.js.
import os, sys, json, importlib.util
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'graphics', 'hgss', 'suiveurs')
OUT = os.path.join(ROOT, 'odyssee', 'img')
SPJS = os.path.join(ROOT, 'odyssee', 'js', 'data', 'sprites.js')

# numéro → nom du modèle HGSS
HGSS = {1: 'BULBASAUR', 2: 'IVYSAUR', 3: 'VENUSAUR', 4: 'CHARMANDER', 5: 'CHARMELEON', 6: 'CHARIZARD',
        7: 'SQUIRTLE', 8: 'WARTORTLE', 9: 'BLASTOISE', 152: 'CHIKORITA', 153: 'BAYLEEF', 154: 'MEGANIUM',
        155: 'CYNDAQUIL', 156: 'QUILAVA', 157: 'TYPHLOSION', 158: 'TOTODILE', 159: 'CROCONAW', 160: 'FERALIGATR'}
# créatures originales (icônes de img/crea)
ORIG = {1001: 'capyousse', 1002: 'capyflore', 1003: 'capysaule', 1004: 'mechelet', 1005: 'ciroulet', 1006: 'lustrelle',
        1007: 'narvi', 1008: 'narvalier', 1009: 'narvaillant'}
CW = 64

def load_hgss_tool():
    spec = importlib.util.spec_from_file_location('hgss', os.path.join(ROOT, 'tools', 'odyssee-hgss.py'))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod

def extract(pret):
    os.makedirs(RAW, exist_ok=True)
    h = load_hgss_tool(); idx = h.mmodel_index(pret)
    for sp, name in HGSS.items():
        fr = h.nsbtx_frames(os.path.join(pret, 'files', 'data', 'mmodel', 'mmodel', f'mmodel_{idx["FOLLOWER_MON_" + name]:08d}.NSBTX'))
        strip = Image.new('RGBA', (32 * len(fr), 32))
        for i, f in enumerate(fr): strip.alpha_composite(f, (32 * i, 0))
        strip.save(os.path.join(RAW, f'{sp}.png'), optimize=True)
        print('suiveur', sp, name, len(fr), 'images')

def frames(sp):
    """images 32 × 32 : [bas, gauche, droite, haut] × [pas, immobile, autre pas]"""
    if sp in HGSS:
        strip = Image.open(os.path.join(RAW, f'{sp}.png')).convert('RGBA')
        f = [strip.crop((32 * i, 0, 32 * i + 32, 32)) for i in range(8)]
        up, down, left, right = f[0:2], f[2:4], f[4:6], f[6:8]
        return [[d[1], d[0], d[1]] for d in (down, left, right, up)]
    ic = Image.open(os.path.join(OUT, 'crea', ORIG[sp] + '-i.png')).convert('RGBA')
    hop = Image.new('RGBA', (32, 32)); hop.alpha_composite(ic, (0, -1))
    flip = lambda im: im.transpose(Image.FLIP_LEFT_RIGHT)
    # l'icône regarde vers la gauche : de face et à gauche telle quelle, à droite retournée
    return [[hop, ic, hop], [hop, ic, hop], [flip(hop), flip(ic), flip(hop)], [hop, ic, hop]]

def build():
    sps = [sp for sp in list(HGSS) + list(ORIG) if (sp in ORIG) or os.path.exists(os.path.join(RAW, f'{sp}.png'))]
    atlas = Image.new('RGBA', (CW * 12, CW * len(sps)))
    for r, sp in enumerate(sps):
        dirs = frames(sp)
        low = max(max((i for i in range(32) if any(f.getpixel((x, i))[3] for x in range(32))), default=31) for d in dirs for f in d)
        for d, cells in enumerate(dirs):
            for c, f in enumerate(cells):
                atlas.alpha_composite(f.resize((64, 64), Image.NEAREST), ((d * 3 + c) * CW, r * CW + (CW - 2) - (low * 2 + 1)))
    atlas.save(os.path.join(OUT, 'suiveurs.png'), optimize=True)
    txt = open(SPJS).read(); meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    meta['suiveurs'] = {'w': CW, 'h': CW, 'd': 2, 'rows': {str(sp): i for i, sp in enumerate(sps)}}
    head = txt[:txt.index('export')]
    with open(SPJS, 'w') as f:
        f.write(head + 'export const SPRITES = ' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{len(sps)} Pokémon qui suivent → odyssee/img/suiveurs.png')

if __name__ == '__main__':
    if len(sys.argv) > 1: extract(sys.argv[1])
    build()
