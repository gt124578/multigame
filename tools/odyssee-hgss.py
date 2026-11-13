#!/usr/bin/env python3
# Odyssée — personnages provisoires repris de HeartGold / SoulSilver, en attendant les dessins définitifs.
#
#  * sur la carte : les modèles « mmodel » du jeu (textures NSBTX, 16 images de 32 × 32 par personnage),
#    lus dans un clone de pret/pokeheartgold ;
#  * en combat : les dessins de dresseurs HGSS / DP du dépôt smogon/sprites.
#
# Les images brutes sont gardées dans assets/graphics/hgss/ : une fois extraites, plus besoin des clones.
#
#   python3 tools/odyssee-hgss.py [chemin/pokeheartgold] [chemin/smogon-sprites]
#
# Écrit odyssee/img/chars.png (cases de 64 × 64, densité 2 : une image HGSS agrandie ×2), odyssee/img/dresseurs/*.png
# et met à jour odyssee/js/data/sprites.js (« chars » et « dresseurs »). Les portraits des boîtes de dialogue restent.
import os, re, sys, json, struct, subprocess
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'graphics', 'hgss')
OUT = os.path.join(ROOT, 'odyssee', 'img')

# personnage du jeu → modèle HGSS sur la carte (nom de MMODEL_*) et dessin de combat (fichier smogon/sprites)
CHARS = {
    'player_m': ('HERO', 'heartgold-soulsilver/Ethan'),
    'player_f': ('HEROINE', 'heartgold-soulsilver/Lyra'),
    'theo': ('GSRIVEL', 'heartgold-soulsilver/Silver'),
    'saule': ('OOKIDO', None),
    'maman': ('GSMAMA', None),
    'nurse': ('PCWOMAN1', None),
    'vendeur': ('SHOPM1_2', None),
    'garde': ('POLICEMAN', 'diamond-pearl/Policeman'),
    'hector': ('GSLEADER2', 'heartgold-soulsilver/Bugsy'),
    'basalte': ('GSLEADER14', 'heartgold-soulsilver/Brock'),
    'marine': ('GSLEADER11', 'heartgold-soulsilver/Misty'),
    'volta': ('GSLEADER9', 'heartgold-soulsilver/Lt._Surge'),
    'flora': ('GSLEADER12', 'heartgold-soulsilver/Erika'),
    'sibylle': ('GSLEADER10', 'heartgold-soulsilver/Sabrina'),
    'pyros': ('GSLEADER15', 'heartgold-soulsilver/Blaine'),
    'drakos': ('WATARU', 'heartgold-soulsilver/Lance'),
    'celestine': ('CHAMPION', 'diamond-pearl/Cynthia'),
    'gamin': ('GSBOY2', 'heartgold-soulsilver/Youngster'),
    'fillette': ('GSGIRL1', 'heartgold-soulsilver/Lass'),
    'montagnard': ('MOUNT', 'diamond-pearl/Hiker'),
    'marin': ('SEAMAN', 'diamond-pearl/Sailor'),
    'topdresseur': ('MAN3', 'heartgold-soulsilver/Ace_Trainer'),
    'topdresseuse': ('WOMAN3', 'heartgold-soulsilver/Ace_Trainer~F'),
    'scientifique': ('ASSISTANTM', 'heartgold-soulsilver/Scientist'),
    'pecheur': ('FISHING', 'diamond-pearl/Fisherman'),
    'insectomane': ('BOY3', 'heartgold-soulsilver/Bug_Catcher'),
    'randonneuse': ('PICNICGIRL', 'diamond-pearl/Picnicker'),
    'medium': ('ITAKO', 'heartgold-soulsilver/Medium'),
    'karateka': ('FIGHTER', 'heartgold-soulsilver/Blackbelt'),
    'habitant': ('GSMAN1', 'heartgold-soulsilver/Gentleman'),
    'habitante': ('GSWOMAN1', 'heartgold-soulsilver/Beauty'),
    'vieil_homme': ('GSOLDMAN1', 'heartgold-soulsilver/Sage'),
    'enfant': ('GSBABYBOY1', 'heartgold-soulsilver/School_Kid'),
    # histoire secondaire : la Brume et les habitants des nouveaux lieux
    'brume': ('ROCKETM', 'heartgold-soulsilver/Rocket_Grunt'),
    'brume_f': ('ROCKETW', 'heartgold-soulsilver/Rocket_Grunt~F'),
    'sylas': ('RKANBUM', 'heartgold-soulsilver/Proton'),
    'ariane': ('RKANBUW', 'heartgold-soulsilver/Ariana'),
    'nox': ('SAKAKI', 'heartgold-soulsilver/Giovanni'),
    'voleur': ('THIEF', 'heartgold-soulsilver/Burglar'),
    'pretre': ('BOZU', 'heartgold-soulsilver/Sage'),
    'kimono': ('DANCER', 'heartgold-soulsilver/Kimono_Girl'),
    'jardinier': ('FARMER', None),
    'facteur': ('DELIVERY', None),
    'capitaine': ('CAPTAIN', None),
    'lucie': ('GIRL3', None),
    'fillette2': ('GSGIRL2', None),
    'dame': ('LADY', None),
    'savant': ('DOCTOR', None),
}

# ------------------------------------------------------------------ textures NSBTX (DS)
def u16(b, o): return struct.unpack_from('<H', b, o)[0]
def u32(b, o): return struct.unpack_from('<I', b, o)[0]

def _dict(b, o, esize):
    cnt = b[o + 1]; p = o + 4 + 8 + cnt * 4 + 4
    ents = [b[p + i * esize:p + (i + 1) * esize] for i in range(cnt)]; p += cnt * esize
    names = [b[p + i * 16:p + i * 16 + 16].split(b'\0')[0].decode('latin1') for i in range(cnt)]
    return list(zip(names, ents))

def _bgr(c): return ((c & 31) * 255 // 31, ((c >> 5) & 31) * 255 // 31, ((c >> 10) & 31) * 255 // 31)

def nsbtx_frames(path):
    """images d'un modèle HGSS, dans l'ordre du jeu : 1-4 de dos, 5-8 de face, 9-12 et 13-16 de profil (vers la gauche)"""
    b = open(path, 'rb').read(); assert b[:4] == b'BTX0'
    T = b[u32(b, 0x10):]
    texs = _dict(T, u16(T, 0x0E), 8); pals = _dict(T, u32(T, 0x34), 4); pdata = u32(T, 0x38); tdata = u32(T, 0x14)
    off = u16(pals[0][1], 0) << 3
    pal = [_bgr(u16(T, pdata + off + 2 * i)) for i in range(16)]
    out = []
    for name, e in sorted(texs, key=lambda ne: int(re.search(r'(\d+)$', ne[0]).group(1))):
        o = tdata + (u16(e, 0) << 3); p = u16(e, 2)
        w = 8 << ((p >> 4) & 7); h = 8 << ((p >> 7) & 7); fmt = (p >> 10) & 7
        if fmt != 3: raise ValueError(f'{path}: format {fmt}')
        im = Image.new('RGBA', (w, h)); px = im.load()
        for i in range(w * h):
            v = (T[o + i // 2] >> ((i & 1) * 4)) & 15
            px[i % w, i // w] = pal[v] + ((0,) if v == 0 else (255,))
        out.append(im)
    return out

def narc_files(path):
    """fichiers d'une archive NARC (DS)"""
    b = open(path, 'rb').read(); assert b[:4] == b'NARC'
    o = u16(b, 0xC); assert b[o:o + 4] == b'BTAF'
    n = u32(b, o + 8); fat = [struct.unpack_from('<II', b, o + 12 + 8 * i) for i in range(n)]
    o2 = o + u32(b, o + 4); o3 = o2 + u32(b, o2 + 4); base = o3 + 8
    return [b[base + s:base + e] for s, e in fat]

def btx_textures(b):
    """toutes les textures d'un fichier BTX0 (formats 4, 16 et 256 couleurs), dans l'ordre de leurs numéros"""
    T = b[u32(b, 0x10):]
    texs = _dict(T, u16(T, 0x0E), 8); pals = dict(_dict(T, u32(T, 0x34), 4)); pdata = u32(T, 0x38); tdata = u32(T, 0x14)
    out = []
    num = lambda ne: int(re.search(r'(\d+)$', ne[0]).group(1)) if re.search(r'(\d+)$', ne[0]) else 0
    for name, e in sorted(texs, key=num):
        pe = pals.get(name + '_pl') or pals.get(name) or next(iter(pals.values()))
        poff = u16(pe, 0) << 3
        o = tdata + (u16(e, 0) << 3); p = u16(e, 2)
        w = 8 << ((p >> 4) & 7); h = 8 << ((p >> 7) & 7); fmt = (p >> 10) & 7; tr = (p >> 13) & 1
        bits = {2: 2, 3: 4, 4: 8}.get(fmt)
        if not bits: continue
        pal = [_bgr(u16(T, pdata + poff + 2 * i)) for i in range(1 << bits) if pdata + poff + 2 * i + 2 <= len(T)]
        im = Image.new('RGBA', (w, h)); px = im.load(); per = 8 // bits
        for i in range(w * h):
            v = (T[o + i // per] >> ((i % per) * bits)) & ((1 << bits) - 1)
            px[i % w, i // w] = (pal[v] if v < len(pal) else (0, 0, 0)) + ((0,) if (v == 0 and tr) else (255,))
        out.append(im)
    return out

# animations de terrain de HGSS : mer, rivage, fleurs des villes (fichier, n° dans fldtanime.narc ou None)
ANIM = {
    'mer': ('files/data/minimum.nsbtx', None), 'rivage': ('files/data/minihamabe.nsbtx', None),
    'vague': ('files/data/fldtanime.narc', 3), 'fleur_r': ('files/data/t3_fl_r.nsbtx', None), 'fleur_y': ('files/data/t3_fl_y.nsbtx', None),
    'fleur_b': ('files/data/t3_fl_b.nsbtx', None), 'fleur_p': ('files/data/t3_fl_p.nsbtx', None),
    'fleur_o': ('files/data/fldtanime.narc', 6), 'fleur_w': ('files/data/fldtanime.narc', 7), 'rocher_mer': ('files/data/fldtanime.narc', 4),
}

def extract_anim(pret):
    os.makedirs(os.path.join(RAW, 'anim'), exist_ok=True)
    for k, (f, i) in ANIM.items():
        path = os.path.join(pret, f)
        b = narc_files(path)[i] if i is not None else open(path, 'rb').read()
        fr = btx_textures(b)
        strip = Image.new('RGBA', (sum(x.width for x in fr), max(x.height for x in fr)))
        x = 0
        for im in fr: strip.alpha_composite(im, (x, 0)); x += im.width
        strip.save(os.path.join(RAW, 'anim', k + '.png'), optimize=True)
        print('animation', k, len(fr), 'images', fr[0].size)

def mmodel_index(pret):
    idx = {}
    for l in open(os.path.join(pret, 'include', 'constants', 'mmodel.h')):
        m = re.match(r'#define MMODEL_(\w+)\s+(\d+)', l)
        if m: idx.setdefault(m.group(1), int(m.group(2)))
    return idx

def extract(pret, smogon):
    os.makedirs(os.path.join(RAW, 'ow'), exist_ok=True); os.makedirs(os.path.join(RAW, 'dresseurs'), exist_ok=True)
    if pret:
        extract_anim(pret)
        idx = mmodel_index(pret)
        for cid, (mm, _) in CHARS.items():
            fr = nsbtx_frames(os.path.join(pret, 'files', 'data', 'mmodel', 'mmodel', f'mmodel_{idx[mm]:08d}.NSBTX'))
            strip = Image.new('RGBA', (32 * len(fr), 32))
            for i, f in enumerate(fr): strip.alpha_composite(f, (32 * i, 0))
            strip.save(os.path.join(RAW, 'ow', cid + '.png'), optimize=True)
    if smogon:
        base = 'src/_uncategorized/canonical/trainers/gen4/'
        for cid, (_, tr) in CHARS.items():
            if not tr: continue
            data = subprocess.run(['git', '-C', smogon, 'show', 'HEAD:' + base + tr + '.png'], capture_output=True, check=True).stdout
            open(os.path.join(RAW, 'dresseurs', cid + '.png'), 'wb').write(data)

# ------------------------------------------------------------------ planches du jeu
CW = 64

def build():
    ids = [c for c in CHARS if os.path.exists(os.path.join(RAW, 'ow', c + '.png'))]
    atlas = Image.new('RGBA', (CW * 12, CW * len(ids)))
    for r, cid in enumerate(ids):
        strip = Image.open(os.path.join(RAW, 'ow', cid + '.png')).convert('RGBA')
        fr = [strip.crop((32 * i, 0, 32 * i + 32, 32)) for i in range(strip.width // 32)]
        if len(fr) < 16: fr = (fr * 16)[:16]
        up, down, left = fr[0:4], fr[4:8], fr[8:12]
        right = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in left]
        # pas, immobile, autre pas (ordre des colonnes de chars.png) ; directions : bas, gauche, droite, haut
        dirs = [[d[1], d[0], d[3]] for d in (down, left, right, up)]
        # tous les pieds sur la même ligne (l'avant-dernière rangée de la case)
        low = max(max(i for i in range(32) if any(f.getpixel((x, i))[3] for x in range(32))) for d in dirs for f in d)
        for d, cells in enumerate(dirs):
            for c, f in enumerate(cells):
                big = f.resize((64, 64), Image.NEAREST)
                atlas.alpha_composite(big, ((d * 3 + c) * CW, r * CW + (CW - 2) - (low * 2 + 1)))
    atlas.save(os.path.join(OUT, 'chars.png'), optimize=True)
    # dessins de combat : fond transparent, agrandis ×2 comme les Pokémon HGSS
    os.makedirs(os.path.join(OUT, 'dresseurs'), exist_ok=True)
    dres = []
    js = os.path.join(ROOT, 'odyssee', 'js', 'data', 'sprites.js')
    txt = open(js).read(); meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    # un personnage qui a déjà son portrait peint (img/portraits/) ou son dessin de combat à nous
    # (assets/graphics/portraits-combat/) garde le sien : pas de dessin HGSS provisoire par-dessus
    notres = set(meta.get('portraits', [])) | {f[:-4] for f in os.listdir(os.path.join(ROOT, 'assets', 'graphics', 'portraits-combat')) if f.endswith('.png')}
    for cid in CHARS:
        p = os.path.join(RAW, 'dresseurs', cid + '.png')
        if not os.path.exists(p) or cid in notres: continue
        im = Image.open(p).convert('RGBA')
        a = im.load(); bg = a[0, 0]
        if bg[3]:
            for y in range(im.height):
                for x in range(im.width):
                    if a[x, y][:3] == bg[:3]: a[x, y] = (0, 0, 0, 0)
        im.save(os.path.join(OUT, 'dresseurs', cid + '.png'), optimize=True)
        dres.append(cid)
    dres += [c for c in meta.get('dresseurs', []) if c not in dres and os.path.exists(os.path.join(OUT, 'dresseurs', c + '.png')) and c in notres]
    meta['chars'] = {'w': CW, 'h': CW, 'd': 2, 'rows': {c: i for i, c in enumerate(ids)}}
    meta['dresseurs'] = dres
    # animations de terrain : copiées telles quelles (bandes d'images de 16 ou 32 px)
    anim = {}
    os.makedirs(os.path.join(OUT, 'hgss'), exist_ok=True)
    for k in ANIM:
        p = os.path.join(RAW, 'anim', k + '.png')
        if not os.path.exists(p): continue
        im = Image.open(p); im.save(os.path.join(OUT, 'hgss', k + '.png'), optimize=True)
        anim[k] = [im.height, im.width // im.height]
    meta['hgss'] = anim
    meta['carte'] = do_carte()
    with open(js, 'w') as f:
        f.write('// Généré par tools/odyssee-sprites.py — ne pas modifier à la main.\n')
        f.write('export const SPRITES = ' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{len(ids)} personnages, {len(dres)} dessins de combat')

# ------------------------------------------------------------------ carte de la région, façon Pokégear de HGSS
# assets/graphics/hgss/carte_guide.png : le guide « Pokémon mapmaking guide HG|SS » (ripped by Pocram, Spriters Resource)
CARTE_ICONES = {
    'arbre_o': (630, 416, 13, 12), 'arbre_v': (646, 416, 11, 12), 'arbres_o': (610, 423, 19, 20), 'remous': (526, 424, 12, 12),
    'puits': (646, 473, 9, 8), 'grotte': (540, 476, 19, 13), 'grotte_p': (527, 480, 10, 9), 'grotte_m': (533, 492, 16, 12),
    'cascade': (633, 507, 14, 12), 'colline': (560, 525, 26, 19), 'montagne': (531, 533, 30, 23),
}

def do_carte():
    import numpy as np
    p = os.path.join(RAW, 'carte_guide.png')
    if not os.path.exists(p): return []
    A = np.array(Image.open(p).convert('RGB')).astype(int)
    os.makedirs(os.path.join(OUT, 'carte'), exist_ok=True)
    bg = A[440, 520]   # fond du panneau des objets
    for k, (x, y, w, h) in CARTE_ICONES.items():
        sub = A[y - 1:y + h + 1, x - 1:x + w + 1]
        alpha = (np.abs(sub - bg).sum(2) > 30).astype(np.uint8) * 255
        im = np.dstack([sub.astype(np.uint8), alpha])
        Image.fromarray(im, 'RGBA').save(os.path.join(OUT, 'carte', k + '.png'), optimize=True)
    return list(CARTE_ICONES)

if __name__ == '__main__':
    pret = sys.argv[1] if len(sys.argv) > 1 else None
    smogon = sys.argv[2] if len(sys.argv) > 2 else None
    if pret or smogon: extract(pret, smogon)
    build()
