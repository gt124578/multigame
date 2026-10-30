#!/usr/bin/env python3
# Odyssée — prépare les images du jeu à partir des planches dessinées (assets/graphics, en 1024 px) :
# découpe chaque planche en cases, retire le fond (magenta des personnages, fonds unis, damiers, panneaux),
# réduit chaque élément à la taille du jeu et écrit le résultat dans odyssee/img/ (+ odyssee/js/data/sprites.js).
#
#   python3 tools/odyssee-sprites.py            (tout)
#   python3 tools/odyssee-sprites.py crea chars (seulement certaines familles)
#
# Prérequis : pip install pillow numpy scipy opencv-python-headless
import os, sys, json, colorsys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'graphics')
OUT = os.path.join(ROOT, 'odyssee', 'img')
os.makedirs(OUT, exist_ok=True)

def load(name):
    im = Image.open(os.path.join(SRC, name))
    if im.mode in ('RGBA', 'LA', 'PA') or (im.mode == 'P' and 'transparency' in im.info):
        # fond transparent : les pixels transparents deviennent magenta pur, le reste reste opaque
        a = np.array(im.convert('RGBA'))
        if (a[..., 3] < 128).any():
            rgb = a[..., :3].copy(); rgb[a[..., 3] < 128] = (255, 0, 255)
            return rgb
    return np.array(im.convert('RGB'))

def save(img, *parts):
    p = os.path.join(OUT, *parts); os.makedirs(os.path.dirname(p), exist_ok=True); img.save(p, optimize=True)

# ------------------------------------------------------------------ détourage
def keep_main(fg, frac=0.04, opening=2):
    if opening: fg = ndimage.binary_opening(fg, iterations=opening)
    lab, n = ndimage.label(fg)
    if n == 0: return fg
    sizes = ndimage.sum(fg, lab, range(1, n + 1)); big = sizes.max()
    keep = np.zeros_like(fg)
    for k, s in enumerate(sizes):
        if s > big * frac: keep |= lab == k + 1
    return keep

def grab(cell, bg=None, margin=0.03, iters=5):
    h, w = cell.shape[:2]; m = max(1, int(min(h, w) * margin))
    mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    if bg is not None: mask[bg] = cv2.GC_BGD
    mask[:m] = cv2.GC_BGD; mask[-m:] = cv2.GC_BGD; mask[:, :m] = cv2.GC_BGD; mask[:, -m:] = cv2.GC_BGD
    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(cell, cv2.COLOR_RGB2BGR), mask, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    fg = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    if bg is not None: fg &= ~bg
    return fg

def flat_bg(cell, src_band, seed_band, tol=30, k=6, minshare=0.05):
    """fond uni (ou damier, panneau) : couleurs dominantes du bord, reliées au bord"""
    h, w = cell.shape[:2]
    def band(f):
        b = max(2, int(min(h, w) * f)); r = np.ones((h, w), bool); r[b:h - b, b:w - b] = False; return r
    src, seed = band(src_band), band(seed_band)
    px = cell[src].reshape(-1, 3).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, lab, cen = cv2.kmeans(px, k, None, crit, 2, cv2.KMEANS_PP_CENTERS)
    cnt = np.bincount(lab.ravel(), minlength=k) / len(px)
    cen = cen[cnt > minshare]
    d = np.min(np.linalg.norm(cell[..., None, :].astype(np.float32) - cen[None, None], axis=-1), axis=-1)
    cand = d < tol
    lb, _ = ndimage.label(cand)
    ids = set(np.unique(lb[seed & cand])) - {0}
    return np.isin(lb, list(ids))

def cutout(cell, how='A'):
    """A : GrabCut sur toute la case ; G : en laissant une marge ; C / E : fond uni retiré d'abord"""
    if how == 'A': return keep_main(grab(cell))
    if how == 'G': return keep_main(grab(cell, margin=0.09))
    bg = flat_bg(cell, 0.03, 0.12) if how == 'C' else flat_bg(cell, 0.1, 0.1)
    fg = grab(cell, bg)
    if fg.mean() < 0.05: fg = ~bg
    return keep_main(fg)

def magenta(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    mx = np.maximum(r, b); mn = np.minimum(r, b)
    return (g < 0.3 * mn + 10) & (np.abs(r - b) < 0.22 * mx + 10) & (mx > 20)

def border_flood(cand):
    lab, _ = ndimage.label(cand)
    ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return np.isin(lab, list(ids))

# ------------------------------------------------------------------ réduction
def shrink_rgba(rgb, keep, w, h, alpha_cut=100):
    """réduction en moyenne (prémultipliée : pas de liseré du fond), alpha net"""
    rgba = np.dstack([rgb, keep * 255]).astype(np.float64)
    rgba[..., :3] *= rgba[..., 3:4] / 255
    r = np.array(Image.fromarray(rgba.round().astype(np.uint8)).resize((w, h), Image.BOX)).astype(np.float64)
    al = r[..., 3:4]
    col = np.where(al > 0, r[..., :3] * 255 / np.maximum(al, 1), 0)
    a = (al[..., 0] > alpha_cut) * 255
    return Image.fromarray(np.dstack([col.clip(0, 255), a]).round().astype(np.uint8))

def fit(rgb, keep, size_w, size_h, fill=1.0, anchor='bottom', scale=None, pad=0):
    ys, xs = np.nonzero(keep)
    if not len(xs): return Image.new('RGBA', (size_w, size_h)), 0
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    bw, bh = x1 - x0, y1 - y0
    sc = scale if scale else min((size_w - 2 * pad) * fill / bw, (size_h - 2 * pad) * fill / bh)
    w, h = max(1, min(size_w, round(bw * sc))), max(1, min(size_h, round(bh * sc)))
    small = shrink_rgba(rgb[y0:y1, x0:x1], keep[y0:y1, x0:x1], w, h)
    out = Image.new('RGBA', (size_w, size_h))
    y = size_h - h - pad if anchor == 'bottom' else (size_h - h) // 2
    out.alpha_composite(small, ((size_w - w) // 2, max(0, y)))
    return out, sc

def mode_down(rgb, f):
    """réduction d'un facteur entier en gardant la couleur dominante de chaque bloc (tuiles nettes)"""
    h, w = rgb.shape[:2]; H, W = h // f, w // f
    out = np.zeros((H, W, 3), np.uint8)
    q = (rgb[:H * f, :W * f] // 12).astype(np.int32)
    key = (q[..., 0] << 10) | (q[..., 1] << 5) | q[..., 2]
    for j in range(H):
        for i in range(W):
            blk = key[j * f:(j + 1) * f, i * f:(i + 1) * f].ravel()
            vals, cnt = np.unique(blk, return_counts=True)
            k = vals[cnt.argmax()]
            sel = blk == k
            out[j, i] = rgb[j * f:(j + 1) * f, i * f:(i + 1) * f].reshape(-1, 3)[sel].mean(0)
    return out

def pixel_grid(rgb, fg, lo=3, hi=16):
    """pixel art agrandi par une IA : taille et décalage de la grille des « gros pixels ». Les changements de couleur
    tombent sur les bords des blocs : on cherche la période (et la phase) qui en concentre le plus, en x et en y."""
    a = rgb.astype(np.int32)
    def axis(diff):
        # un multiple de la vraie période marque aussi bien les bords : on garde la plus petite période presque aussi bonne
        n = len(diff); res = []
        for b in range(lo, hi + 1):
            sc = []
            for ph in range(b):
                idx = np.arange(ph, n, b)
                if len(idx) >= 3: sc.append((diff[idx].mean() - diff.mean(), ph))
            if sc: res.append((max(sc), b))
        top = max(r[0][0] for r in res)
        for (score, ph), b in res:
            if score >= 0.8 * top: return b, ph
        return res[0][1], res[0][0][1]
    m = fg.astype(np.float64)
    dx = (np.abs(np.diff(a, axis=1)).sum(2) * (m[:, 1:] * m[:, :-1])).sum(0); dx = np.concatenate([[0], dx])
    dy = (np.abs(np.diff(a, axis=0)).sum(2) * (m[1:] * m[:-1])).sum(1); dy = np.concatenate([[0], dy])
    bx, px = axis(dx); by, py = axis(dy)
    b = round((bx + by) / 2)
    return b, px % b, py % b

def snap(rgb, fg, block=None, expect=None):
    """réduit un dessin « pixel art agrandi » à sa vraie résolution : un pixel par bloc, couleur dominante du bloc,
    opaque si la majorité du bloc fait partie du dessin. Renvoie une image RGBA nette (sans lissage).
    expect : taille de bloc attendue (case / pixels logiques) ; la grille trouvée n'est gardée que si elle s'en approche."""
    if block is None:
        b, px, py = pixel_grid(rgb, fg)
        if expect and abs(b - expect) > max(1, expect * 0.15): b, px, py = expect, 0, 0
    else: b, px, py = block, 0, 0
    H, W = rgb.shape[:2]
    xs = list(range(px - b if px else 0, W, b)); ys = list(range(py - b if py else 0, H, b))
    out = np.zeros((len(ys), len(xs), 4), np.uint8)
    q = (rgb // 10).astype(np.int32); key = (q[..., 0] << 10) | (q[..., 1] << 5) | q[..., 2]
    for j, y0 in enumerate(ys):
        for i, x0 in enumerate(xs):
            ya, yb, xa, xb = max(0, y0), min(H, y0 + b), max(0, x0), min(W, x0 + b)
            if yb <= ya or xb <= xa: continue
            f = fg[ya:yb, xa:xb]
            if f.mean() < 0.5: continue
            k = key[ya:yb, xa:xb][f]; vals, cnt = np.unique(k, return_counts=True)
            sel = k == vals[cnt.argmax()]
            out[j, i, :3] = rgb[ya:yb, xa:xb][f][sel].mean(0); out[j, i, 3] = 255
    return Image.fromarray(out), b

def place(img, w, h, anchor='bottom', pad=0):
    """pose un sprite déjà à la bonne résolution dans une case w × h (réduit seulement s'il déborde)"""
    al = np.array(img)[..., 3] > 0
    if not al.any(): return Image.new('RGBA', (w, h))
    ys, xs = np.nonzero(al); img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    if img.width > w or img.height > h - pad:
        sc = min(w / img.width, (h - pad) / img.height)
        img = img.resize((max(1, round(img.width * sc)), max(1, round(img.height * sc))), Image.NEAREST)
    out = Image.new('RGBA', (w, h))
    y = h - img.height - pad if anchor == 'bottom' else (h - img.height) // 2
    out.alpha_composite(img, ((w - img.width) // 2, max(0, y)))
    return out

def tile_down(rgb, size):
    """tuile carrée → size × size : moyenne locale puis couleur dominante (garde le grain sans flou)"""
    h, w = rgb.shape[:2]
    mid = np.array(Image.fromarray(rgb).resize((size * 4, size * 4), Image.BOX))
    return mode_down(mid, 4)

def hue_shift(img, deg):
    a = np.array(img).astype(np.float64) / 255
    rgb = a[..., :3]; al = a[..., 3:4]
    hsv = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.int32)
    hsv[..., 0] = (hsv[..., 0] + int(deg / 2)) % 180
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    return Image.fromarray(np.dstack([out, (al[..., 0] * 255).astype(np.uint8)]))

META = {}

# ------------------------------------------------------------------ personnages (3 × 4 sur magenta)
CHARS = {
    # id du jeu : (fichier, gauche/droite inversés sur la planche)
    'player_m': ('joueur_g.png', False), 'player_f': ('joueur_f.png', False), 'theo': ('Théo.png', False),
    'saule': ('Saule.png', False), 'maman': ('maman.png', False), 'nurse': ('infermière.png', False),
    'vendeur': ('vendeur.png', False), 'garde': ('garde.png', False),
    'hector': ('hector.png', False), 'basalte': ('basalte.png', False), 'marine': ('marine.png', False),
    'volta': ('volta.png', False), 'flora': ('flora.png', False), 'sibylle': ('sibylle.png', False),
    'pyros': ('pyros.png', False), 'drakos': ('drakos.png', False), 'celestine': ('celestine.png', False),
    'gamin': ('gamin.png', False), 'fillette': ('fillette.png', False), 'montagnard': ('montagnard.png', False),
    'marin': ('marin.png', False), 'topdresseur': ('topdresseur.png', False), 'topdresseuse': ('topdresseuse.png', False),
    'scientifique': ('scientifique.png', False), 'pecheur': ('pecheur.png', False), 'insectomane': ('insectomane.png', False),
    'randonneuse': ('randonneuse.png', False), 'medium': ('medium.png', False), 'karateka': ('karateka.png', False),
    'habitant': ('habitant_h.png', False), 'habitante': ('habitant_f.png', False), 'vieil_homme': ('vieil_homme.png', False),
    'enfant': ('enfant.png', False),
}
CW, CHH = 32, 32
LR_FILE = os.path.join(ROOT, 'tools', 'odyssee-sprites-lr.json')

def char_cells(a):
    H, W = a.shape[:2]; bg = magenta(a); cells = []
    for j in range(4):
        for i in range(3):
            x0, x1, y0, y1 = round(i * W / 3), round((i + 1) * W / 3), round(j * H / 4), round((j + 1) * H / 4)
            m = bg[y0:y1, x0:x1].copy(); m[:4] = True; m[-4:] = True; m[:, :4] = True; m[:, -4:] = True
            fg = keep_main(~border_flood(m), frac=0.02, opening=1)
            cells.append((a[y0:y1, x0:x1], fg))
    return cells

# personnages dont les profils sont inversés sur la planche (colonne 0 tournée vers la droite)
SIDE_FLIP = set()

def new_style(cells):
    """planche au nouveau format (prompts « chibi ») : chaque ligne entière regarde dans une seule direction.
    On le reconnaît à ce que la case du milieu des lignes de profil ne ressemble pas à la case de face."""
    def sig(i):
        rgb, fg = cells[i]
        if not fg.any(): return None
        ys, xs = np.nonzero(fg); c = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        return np.array(Image.fromarray(c).resize((12, 16), Image.BILINEAR)).astype(float)
    f, m1 = sig(1), sig(4)
    if f is None or m1 is None: return False
    return np.abs(f - m1).mean() > 28

def side_groups(cells, cid):
    """les quatre profils (colonnes 0 et 2 des lignes 1 et 2) rangés en « tournés vers la gauche » / « vers la droite ».
    Sur certaines planches un profil est retourné : on compare chacun au premier, tel quel ou en miroir."""
    def sig(i, flip=False):
        rgb, fg = cells[i]; ys, xs = np.nonzero(fg)
        c = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(float); m = fg[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        c[~m] = 128
        im = np.array(Image.fromarray(c.astype(np.uint8)).resize((16, 24), Image.BILINEAR)).astype(float)
        return im[:, ::-1] if flip else im
    ids = [3, 5, 6, 8]
    ref = sig(3); same, opp = [3], []
    for i in ids[1:]:
        (same if np.abs(sig(i) - ref).mean() <= np.abs(sig(i, True) - ref).mean() else opp).append(i)
    # sens absolu : la colonne 0 regarde vers la gauche sur la plupart des planches
    votes = sum(1 for i in (3, 6) if i in same) - sum(1 for i in (3, 6) if i in opp)
    left, right = (same, opp) if votes >= 0 else (opp, same)
    if cid in SIDE_FLIP: left, right = right, left
    if not left: left = right
    if not right: right = left
    return left, right

def do_chars():
    swap = {}
    if os.path.exists(LR_FILE): swap = json.load(open(LR_FILE))
    ids = list(CHARS)
    atlas = Image.new('RGBA', (CW * 12, CHH * len(ids)))
    rows = {}
    for r, cid in enumerate(ids):
        fn, _ = CHARS[cid]
        src_img = load(fn); cells = char_cells(src_img)
        v2 = abs(src_img.shape[0] / src_img.shape[1] - 4 / 3) < 0.08   # 3 colonnes × 4 lignes de cases carrées
        hmax = max((np.ptp(np.nonzero(fg)[0]) + 1) for _, fg in cells if fg.any())
        sc = (CHH - 1) / hmax
        # planches dessinées : ligne 0 de face, lignes 1 et 2 de profil, ligne 3 de dos. Sur les lignes de profil, la
        # colonne du milieu est presque toujours de face : on ne garde que les profils (colonne 0 tournée vers la
        # gauche, colonne 2 vers la droite, sauf mention contraire), sinon le personnage tourne sur lui-même en marchant.
        # case du jeu : (pas 1, immobile, pas 2)
        if v2:
            # planche « chibi » (bible, version 2) : chaque ligne regarde dans une seule direction, lue pixel pour pixel
            for d in range(4):
                for c in range(3):
                    rgb, fg = cells[d * 3 + c]
                    img, blk = snap(rgb, fg, expect=round(rgb.shape[1] / 32))
                    atlas.alpha_composite(place(img, CW, CHH, pad=1), ((d * 3 + c) * CW, r * CHH))
            rows[cid] = r
            print('personnage (v2)', cid, 'bloc', blk)
            continue
        if new_style(cells): src = {0: [0, 1, 2], 1: [3, 4, 5], 2: [6, 7, 8], 3: [9, 10, 11]}
        else:
            lefts, rights = side_groups(cells, cid)
            pick = lambda g: [g[1 % len(g)], g[0], g[1 % len(g)]]
            src = {0: [0, 1, 2], 1: pick(lefts), 2: pick(rights), 3: [9, 10, 11]}
        for d in range(4):
            for c in range(3):
                rgb, fg = cells[src[d][c]]
                img, _ = fit(rgb, fg, CW, CHH, scale=sc)
                atlas.alpha_composite(img, ((d * 3 + c) * CW, r * CHH))
        rows[cid] = r
    save(atlas, 'chars.png')
    META['chars'] = {'w': CW, 'h': CHH, 'rows': rows}
    # planche de contrôle : profils gauche / droite agrandis (pour vérifier le sens)
    chk = Image.new('RGBA', (len(ids) * 2 * CW, CHH + 10), (80, 150, 80, 255))
    for r, cid in enumerate(ids):
        for k, d in enumerate([1, 2]):
            chk.alpha_composite(atlas.crop(((d * 3 + 1) * CW, r * CHH, (d * 3 + 2) * CW, (r + 1) * CHH)), ((r * 2 + k) * CW, 0))
    chk.resize((chk.width * 4, chk.height * 4), Image.NEAREST).save(os.path.join(ROOT, 'tools', 'odyssee-sprites-lr.png'))

# ------------------------------------------------------------------ portraits
PORTRAITS = ['hector', 'basalte', 'marine', 'volta', 'flora', 'sibylle', 'pyros', 'drakos', 'celestine', 'saule', 'théo',
             'gamin', 'fillette', 'montagnard', 'marin', 'topdresseur', 'topdresseuse', 'scientifique', 'pecheur',
             'insectomane', 'randonneuse', 'medium', 'karateka', 'habitant_h', 'habitant_f']
PORTRAIT_ID = {'théo': 'theo', 'habitant_h': 'habitant', 'habitant_f': 'habitante'}

def do_portraits():
    done = []
    for p in PORTRAITS:
        a = load(f'portrait_{p}.png')
        fg = keep_main(grab(a, margin=0.015))
        pid = PORTRAIT_ID.get(p, p)
        img, _ = fit(a, fg, 80, 80, fill=0.98)
        save(img, 'portraits', pid + '.png')
        big, _ = fit(a, fg, 160, 160, fill=0.98)
        save(big, 'portraits', pid + '-l.png')
        done.append(pid)
    META['portraits'] = done

# ------------------------------------------------------------------ créatures (2 × 2 : face, dos, icônes)
CREA = ['capyousse', 'capyflore', 'capysaule', 'mechelet', 'ciroulet', 'lustrelle', 'narvi', 'narvalier', 'narvaillant',
        'piouf', 'piouffon', 'plumorage', 'grignotin', 'ronchonnet', 'chouillon', 'hulumiere', 'larvoile', 'cocoreille',
        'vitrailune', 'bourdonnet', 'champinou', 'champitron', 'cerfantome', 'noctaile', 'noctailor', 'galetin', 'rocrabe',
        'cristaupe', 'bulotin', 'bulotide', 'croabulle', 'croamonde', 'crevitonne', 'gerbizz', 'gerboltz', 'ampoulet',
        'tricotine', 'corolline', 'songebelle', 'revelaine', 'tisonnard', 'brasieraud', 'sombrecaille', 'nocturmine',
        'frimousse', 'morsegivre', 'boulonnet', 'rouagant', 'draquelin', 'draconfle', 'cieldrake', 'odyssor']
CREA_FILE = {'gerboltz': 'gerbotltz.png', 'tisonnard': 'trisonnard.png'}
# méthode de détourage choisie à l'œil pour chaque planche (face, dos)
CREA_HOW = {'capyousse': 'EE', 'lustrelle': 'EE', 'narvi': 'EE', 'ronchonnet': 'EE', 'noctaile': 'EE', 'croabulle': 'EE',
            'croamonde': 'EE', 'cieldrake': 'EE', 'piouf': 'AE', 'revelaine': 'CC', 'morsegivre': 'CC',
            'plumorage': 'GG', 'cocoreille': 'GG', 'mechelet': 'GG', 'ciroulet': 'GG'}
# taille à l'écran (part des 80 pixels de la case) : petits, moyens, grands
CREA_SIZE = {'capyousse': .62, 'mechelet': .6, 'narvi': .6, 'piouf': .55, 'grignotin': .6, 'chouillon': .58, 'larvoile': .55,
             'cocoreille': .55, 'champinou': .55, 'galetin': .55, 'bulotin': .55, 'croabulle': .6, 'gerbizz': .62,
             'ampoulet': .6, 'tricotine': .6, 'songebelle': .62, 'tisonnard': .6, 'sombrecaille': .66, 'frimousse': .62,
             'boulonnet': .6, 'draquelin': .7, 'noctaile': .62, 'bourdonnet': .6,
             'capyflore': .78, 'ciroulet': .76, 'narvalier': .8, 'piouffon': .74, 'cocoreille': .6, 'champitron': .8,
             'noctailor': .9, 'draconfle': .86, 'odyssor': .98, 'cieldrake': .98, 'capysaule': .95, 'lustrelle': .9,
             'narvaillant': .95, 'plumorage': .9, 'brasieraud': .9, 'nocturmine': .9, 'morsegivre': .9, 'rouagant': .9}

def do_crea(only=None):
    done = []
    for key in CREA:
        if only and key not in only: continue
        a = load(CREA_FILE.get(key, key + '.png'))
        H, W = a.shape[:2]
        how = CREA_HOW.get(key, 'AA'); size = CREA_SIZE.get(key, .78)
        imgs = []
        for k in range(2):
            cell = a[0:H // 2, k * W // 2:(k + 1) * W // 2].copy()
            fg = cutout(cell, how[k])
            img, _ = fit(cell, fg, 80, 80, fill=size if k == 0 else min(1, size * 1.12), pad=1)
            imgs.append(img)
        front, back = imgs
        save(front, 'crea', key + '-f.png'); save(back, 'crea', key + '-b.png')
        save(hue_shift(front, 150), 'crea', key + '-fs.png'); save(hue_shift(back, 150), 'crea', key + '-bs.png')
        # icône : la face réduite à 32 × 32
        f = np.array(front); al = f[..., 3] > 0
        ic, _ = fit(f[..., :3], al, 32, 32, fill=0.95, anchor='center')
        save(ic, 'crea', key + '-i.png')
        done.append(key)
        print('créature', key, how)
    META['crea'] = CREA

# ------------------------------------------------------------------ planches en grille sur fond gris (objets, nature, meubles)
def grid_cells(a, cols, rows):
    H, W = a.shape[:2]
    for j in range(rows):
        for i in range(cols):
            yield i, j, a[round(j * H / rows):round((j + 1) * H / rows), round(i * W / cols):round((i + 1) * W / cols)]

ITEMS = [['poke-ball', 'great-ball', 'ultra-ball', 'potion', 'super-potion', 'hyper-potion'],
         ['max-potion', 'full-heal', 'revive', 'antidote', 'paralyze-heal', 'awakening'],
         ['burn-heal', 'ice-heal', 'full-restore', 'escape-rope', 'repel', 'super-repel'],
         ['max-repel', 'rare-candy', 'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone'],
         ['moon-stone', 'sun-stone', 'oran-berry', 'ether', 'elixir', 'bag'],
         ['dex', 'town-map', 'wallet', 'notebook', 'letter', 'gift']]

# objets clairs sur fond gris clair : détourés sans retirer d'abord le fond uni
ITEM_RECT = {'full-heal', 'awakening', 'super-repel', 'ice-heal'}
ITEM_FLAT = {'repel'}

def do_items():
    a = load('objets.png'); done = []
    for i, j, cell in grid_cells(a, 6, 6):
        key = ITEMS[j][i]
        h = cell.shape[0]
        top = cell[: int(h * (0.8 if j < 5 else 0.97))].copy()   # la dernière ligne n'a pas d'étiquette
        if key in ITEM_FLAT: fg = keep_main(~flat_bg(top, 0.04, 0.04, tol=22))
        elif key in ITEM_RECT: fg = keep_main(grab(top, margin=0.08))
        else: fg = keep_main(grab(top, flat_bg(top, 0.04, 0.04, tol=22), margin=0.04))
        img, _ = fit(top, fg, 32, 32, fill=0.96, anchor='center')
        save(img, 'items', key + '.png')
        done.append(key)
    META['items'] = done

NATURE = [['tree', 'tree2', 'pine', 'snowpine', 'deadtree', 'palm'],
          ['bush', 'rock', 'caverock', 'stalag', 'tuft', 'tuft1'],
          ['darktuft', 'flowers_r', 'flowers_y', 'flowers_w', 'sign', 'fence'],
          ['lamp', 'mailbox', 'pot', 'itemball', 'bang', 'statue']]
# taille dans le jeu (pixels) : largeur × hauteur de la case, part occupée
NATURE_SIZE = {'tree': (32, 40, 1), 'tree2': (32, 40, 1), 'pine': (32, 44, 1), 'snowpine': (32, 44, 1), 'deadtree': (32, 40, 1), 'palm': (32, 44, 1),
               'bush': (16, 16, 1), 'rock': (16, 14, 1), 'caverock': (16, 16, 1), 'stalag': (16, 28, 1), 'tuft': (16, 15, 1), 'tuft1': (16, 15, 1),
               'darktuft': (16, 15, 1), 'flowers_r': (16, 10, 1), 'flowers_y': (16, 10, 1), 'flowers_w': (16, 10, 1), 'sign': (16, 18, 1), 'fence': (16, 14, 1),
               'lamp': (16, 32, 1), 'mailbox': (16, 18, 1), 'pot': (16, 12, 1), 'itemball': (16, 12, 0.8), 'bang': (14, 16, 1), 'statue': (16, 30, 1)}

MOBILIER = [['healer', 'pc', 'books', 'tv', 'bed', 'table'],
            ['plant', 'gymstatue', 'shelf', 'counterseg', 'chair', 'sofa'],
            ['fridge', 'kitchen', 'clock', 'painting', 'boxes', 'labmachine'],
            ['startertable', 'bench', 'trash', 'vase', 'fireplace', 'rug']]
MOBILIER_SIZE = {'healer': (32, 32), 'pc': (16, 32), 'books': (16, 32), 'tv': (16, 20), 'bed': (16, 32), 'table': (16, 16),
                 'plant': (16, 30), 'gymstatue': (16, 32), 'shelf': (16, 30), 'counterseg': (16, 20), 'chair': (16, 18), 'sofa': (32, 20),
                 'fridge': (16, 32), 'kitchen': (16, 22), 'clock': (16, 32), 'painting': (16, 14), 'boxes': (16, 18), 'labmachine': (16, 30),
                 'startertable': (32, 22), 'bench': (32, 18), 'trash': (16, 16), 'vase': (16, 18), 'fireplace': (32, 30), 'rug': (32, 16)}

# version 2 (bible) : décor dessiné en vue de 3/4 plongeante, pixel art agrandi ×4 sur fond magenta
NATURE2_TREES = [['tree', 'tree2', 'tree3', 'pine'], ['snowpine', 'deadtree', 'palm', 'cuttree'],
                 ['bush', 'rock', 'crackrock', 'caverock'], ['stalag', 'lamp', 'sign', 'mailbox']]
NATURE2_SMALL = [['tuft', 'tuft1', 'darktuft', 'snowtuft'], ['flowers_r', 'flowers_y', 'flowers_w', 'fence'],
                 ['pot', 'statue', 'gymstatue', 'itemball']]
NATURE2_SIZE = {'tree': (32, 44), 'tree2': (32, 44), 'tree3': (32, 44), 'pine': (32, 48), 'snowpine': (32, 48), 'deadtree': (32, 44),
                'palm': (32, 48), 'cuttree': (16, 24), 'bush': (16, 16), 'rock': (16, 16), 'crackrock': (16, 16), 'caverock': (16, 16),
                'stalag': (16, 28), 'lamp': (16, 32), 'sign': (16, 18), 'mailbox': (16, 18), 'tuft': (16, 16), 'tuft1': (16, 16),
                'darktuft': (16, 16), 'snowtuft': (16, 16), 'flowers_r': (16, 12), 'flowers_y': (16, 12), 'flowers_w': (16, 12),
                'fence': (16, 16), 'pot': (16, 14), 'statue': (16, 32), 'gymstatue': (16, 32), 'itemball': (16, 12)}

def do_nature2():
    """planches nature_arbres.png (4 × 4) et nature_petits.png (4 × 3), si elles existent"""
    done = dict(META.get('nature', {}))
    for file, names in (('nature_arbres.png', NATURE2_TREES), ('nature_petits.png', NATURE2_SMALL)):
        if not os.path.exists(os.path.join(SRC, file)): continue
        a = load(file)
        for i, j, cell in grid_cells(a, len(names[0]), len(names)):
            key = names[j][i]
            bg = magenta(cell); m = bg.copy(); m[:4] = True; m[-4:] = True; m[:, :4] = True; m[:, -4:] = True
            fg = keep_main(~border_flood(m), frac=0.05, opening=1)
            w, h = NATURE2_SIZE[key]
            img, blk = snap(cell, fg, expect=round(cell.shape[1] / 64))
            save(place(img, w, h), 'nature', key + '.png')
            done[key] = [w, h]
            print('nature (v2)', key, 'bloc', blk, img.size)
    META['nature'] = done
    META['natureV2'] = True

def do_sheet(file, names, sizes, folder, meta):
    a = load(file); done = {}
    for i, j, cell in grid_cells(a, 6, 4):
        key = names[j][i]
        sz = sizes[key]; w, h = sz[0], sz[1]; fill = sz[2] if len(sz) > 2 else 1
        fg = keep_main(grab(cell, flat_bg(cell, 0.04, 0.04, tol=20), margin=0.03))
        img, _ = fit(cell, fg, w, h, fill=fill)
        save(img, folder, key + '.png')
        done[key] = [w, h]
    META[meta] = done

# ------------------------------------------------------------------ tuiles de sol (8 × 8) et kits de façade (4 × 4)
SOL = [['grass0', 'grass1', 'grass2', 'grass3', 'tall0', 'tall1', 'forest0', 'forest1'],
       ['path', 'sand', 'pave', 'ash0', 'ash1', 'snow0', 'snow1', 'cave'],
       ['water0', 'water1', 'water2', 'water3', 'deep', 'flowerR', 'flowerY', 'flowerW'],
       ['ledge', 'ledgeE', 'ledgeW', 'bridge', 'stairs', 'cavestairs', 'mat', 'matgreen'],
       ['cliff', 'cliffplain', 'cavewall', 'cavetop', 'wall_in', 'wall_center', 'wall_mart', 'wall_gym'],
       ['wall_league', 'walltop', 'floor_wood', 'floor_center', 'floor_mart', 'floor_lab', 'floor_league', 'counter'],
       ['floor_gymBug', 'floor_gymRock', 'floor_gymWater', 'floor_gymElec', 'floor_gymGrass', 'floor_gymPsy', 'floor_gymFire', 'floor_gymDragon'],
       ['counterfront', 'martfront', 'shelf', 'roof_flat', 'lava0', 'lava1', 'grass4', 'grass5']]

def do_sol():
    a = load('sol.png'); H, W = a.shape[:2]; done = []
    for j in range(8):
        for i in range(8):
            t = a[round(j * H / 8):round((j + 1) * H / 8), round(i * W / 8):round((i + 1) * W / 8)]
            m = max(2, t.shape[0] // 40); t = t[m:-m, m:-m]   # marges (traits de grille)
            img = Image.fromarray(tile_down(np.ascontiguousarray(t), 16))
            save(img, 'sol', SOL[j][i] + '.png'); done.append(SOL[j][i])
    META['sol'] = done

FACADES = {'maison': 'facade_maison.png', 'centre': 'facade_centre.png', 'boutique': 'facade_boutique.png', 'arene': 'facade_arene.png',
           'labo': 'facade_labo.png', 'ligue': 'facade_ligue.png', 'grotte': 'facade_cave.png'}

def do_facades():
    for k, fn in FACADES.items():
        a = load(fn); H, W = a.shape[:2]
        out = Image.new('RGB', (64, 64))
        for j in range(4):
            for i in range(4):
                t = a[round(j * H / 4):round((j + 1) * H / 4), round(i * W / 4):round((i + 1) * W / 4)]
                m = max(1, t.shape[0] // 64); t = t[m:-m, m:-m]
                out.paste(Image.fromarray(tile_down(np.ascontiguousarray(t), 16)), (i * 16, j * 16))
        save(out, 'facades', k + '.png')
    META['facades'] = list(FACADES)

# ------------------------------------------------------------------ titre : Odyssor en grand
def do_title():
    a = load('odyssor.png'); H, W = a.shape[:2]
    cell = a[0:H // 2, 0:W // 2].copy()
    fg = cutout(cell, 'A')
    img, _ = fit(cell, fg, 160, 160, fill=0.98, anchor='center')
    save(img, 'title-odyssor.png')

def write_meta():
    js = os.path.join(ROOT, 'odyssee', 'js', 'data', 'sprites.js')
    old = {}
    if os.path.exists(js):
        txt = open(js).read(); s = txt.index('{'); old = json.loads(txt[s:txt.rindex('}') + 1])
    old.update(META)
    with open(js, 'w') as f:
        f.write('// Généré par tools/odyssee-sprites.py — ne pas modifier à la main.\n')
        f.write('export const SPRITES = ' + json.dumps(old, ensure_ascii=False, separators=(',', ':')) + ';\n')

if __name__ == '__main__':
    want = set(sys.argv[1:]) or {'chars', 'portraits', 'crea', 'items', 'nature', 'mobilier', 'sol', 'facades', 'title'}
    only = [w[5:] for w in want if w.startswith('crea:')]
    if 'chars' in want: do_chars()
    if 'portraits' in want: do_portraits()
    if 'crea' in want or only: do_crea(only or None)
    if 'items' in want: do_items()
    if 'nature' in want:
        do_sheet('nature.png', NATURE, NATURE_SIZE, 'nature', 'nature')
        do_nature2()
    if 'mobilier' in want: do_sheet('mobilier.png', MOBILIER, MOBILIER_SIZE, 'mobilier', 'mobilier')
    if 'sol' in want: do_sol()
    if 'facades' in want: do_facades()
    if 'title' in want: do_title()
    write_meta()
    print('ok :', ', '.join(sorted(want)))
