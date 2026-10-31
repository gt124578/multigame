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

def is_native(name):
    """planche retouchée à la main en vraie résolution (un pixel = un pixel), sur fond transparent"""
    im = Image.open(os.path.join(SRC, name))
    return max(im.size) < 600 and (im.mode in ('RGBA', 'LA', 'PA') or 'transparency' in im.info)

def clean_alpha(a, body=None):
    """RGBA nette : les pixels à moitié transparents (ombres violettes, traits de grille, restes de fond) disparaissent.
    body : zone (au-dessus des pieds) où un pixel assez opaque fait partie du dessin — le détourage a parfois rendu
    à moitié transparent un vêtement violet, proche du fond magenta d'origine"""
    keep = a[..., 3] >= 230
    if body is not None: keep |= body & (a[..., 3] >= 140)
    a[..., 3] = np.where(keep, 255, 0)
    # liseré resté teinté par l'ancien fond magenta (vert à zéro, rouge ≈ bleu) au bord du dessin : contour sombre neutre
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    op = a[..., 3] > 0
    fringe = op & (g <= 8) & (np.minimum(r, b) > 20) & (np.abs(r - b) < 40) & ndimage.binary_dilation(~op)
    a[fringe, :3] = (38, 30, 42)
    a[a[..., 3] == 0, :3] = 0
    return a

def load_native(name):
    return clean_alpha(np.array(Image.open(os.path.join(SRC, name)).convert('RGBA')))

def native_cells(a, cols, rows, raw=False):
    """cases d'une planche en vraie résolution : (image RGBA du dessin, rognée) ou None"""
    H, W = a.shape[:2]; out = []
    for j in range(rows):
        for i in range(cols):
            x0, x1, y0, y1 = round(i * W / cols), round((i + 1) * W / cols), round(j * H / rows), round((j + 1) * H / rows)
            c = a[y0:y1, x0:x1].copy()
            if raw:
                # le corps : du haut du dessin jusqu'au-dessus des pieds (l'ombre au sol, en dessous, est retirée)
                op = c[..., 3] >= 230; ys = np.nonzero(op.any(1))[0]
                body = np.zeros(op.shape, bool)
                if len(ys): body[ys[0]:ys[0] + int((ys[-1] - ys[0]) * 0.88)] = True
                c = clean_alpha(c, body)
            fg = c[..., 3] > 0
            if fg.sum() < 20: out.append(None); continue
            # traits de grille restés opaques : taches de 1 ou 2 pixels d'épaisseur
            lab, n = ndimage.label(fg)
            for k in range(1, n + 1):
                ys, xs = np.nonzero(lab == k)
                if min(np.ptp(ys), np.ptp(xs)) <= 1 and max(np.ptp(ys), np.ptp(xs)) > 8: fg[lab == k] = False
            fg = keep_main(fg, frac=0.02, opening=0); c[~fg, 3] = 0
            out.append(crop_alpha(Image.fromarray(c)))
    return out

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

def _edge_profile(rgb, fg, axis):
    a = rgb.astype(np.int32); m = fg.astype(np.float64)
    if axis == 1: return (np.abs(np.diff(a, axis=1)).sum(2) * (m[:, 1:] * m[:, :-1])).sum(0)
    return (np.abs(np.diff(a, axis=0)).sum(2) * (m[1:] * m[:-1])).sum(1)

def _comb(prof, p):
    """énergie des bords qui tombent sur une grille de pas p (meilleure phase)"""
    n = len(prof); best = (-1.0, 0.0)
    for ph in np.arange(0, p, p / 12):
        pos = np.arange(ph, n - 1, p); i = np.floor(pos).astype(int); f = pos - i
        v = prof[i] * (1 - f) + prof[np.minimum(i + 1, n - 1)] * f
        v = np.maximum(prof[np.clip(np.round(pos).astype(int), 0, n - 1)], v)
        if v.mean() > best[0]: best = (v.mean(), ph)
    return best

def pixel_grid(rgb, fg, lo=3.0, hi=16.0, ratio=0.86):
    """pixel art agrandi (par une IA, ou retouché) : pas de la grille des « gros pixels », souvent fractionnaire
    (3,5 ; 5,7…), et sa phase en x et en y. Les changements de couleur tombent sur les bords des blocs ; un multiple
    du vrai pas marque aussi bien les bords, on garde donc le plus petit pas presque aussi bon que le meilleur."""
    px, py = _edge_profile(rgb, fg, 1), _edge_profile(rgb, fg, 0)
    px = px / (px.mean() + 1e-9); py = py / (py.mean() + 1e-9)
    res = []
    for p in np.arange(lo, hi, 0.02):
        sx, phx = _comb(px, p); sy, phy = _comb(py, p)
        res.append((sx + sy, p, phx, phy))
    top = max(r[0] for r in res)
    for sc, p, phx, phy in res:
        if sc >= ratio * top: return float(p), float(phx), float(phy)
    return float(res[0][1]), float(res[0][2]), float(res[0][3])

def snap(rgb, fg, grid=None):
    """réduit un dessin « pixel art agrandi » à sa vraie résolution : un pixel par bloc (couleur dominante du cœur
    du bloc), opaque si la majorité du bloc fait partie du dessin. Image RGBA nette, sans lissage."""
    p, phx, phy = grid or pixel_grid(rgb, fg)
    H, W = rgb.shape[:2]
    x0s = np.arange(phx - p if phx > 0 else 0, W, p); y0s = np.arange(phy - p if phy > 0 else 0, H, p)
    out = np.zeros((len(y0s), len(x0s), 4), np.uint8)
    q = (rgb // 12).astype(np.int32); key = (q[..., 0] << 10) | (q[..., 1] << 5) | q[..., 2]
    m = p * 0.25
    for j, y0 in enumerate(y0s):
        for i, x0 in enumerate(x0s):
            ya, yb = int(round(max(0, y0))), int(round(min(H, y0 + p))); xa, xb = int(round(max(0, x0))), int(round(min(W, x0 + p)))
            if yb <= ya or xb <= xa or fg[ya:yb, xa:xb].mean() < 0.5: continue
            ia, ib = int(round(max(0, y0 + m))), int(round(min(H, y0 + p - m))); ja, jb = int(round(max(0, x0 + m))), int(round(min(W, x0 + p - m)))
            if ib <= ia: ia, ib = ya, yb
            if jb <= ja: ja, jb = xa, xb
            f = fg[ia:ib, ja:jb]
            if not f.any(): f = np.ones_like(f)
            k = key[ia:ib, ja:jb][f]; vals, cnt = np.unique(k, return_counts=True)
            sel = k == vals[cnt.argmax()]
            out[j, i, :3] = rgb[ia:ib, ja:jb][f][sel].mean(0); out[j, i, 3] = 255
    return crop_alpha(Image.fromarray(out)), p

def crop_alpha(img):
    al = np.array(img)[..., 3] > 0
    if not al.any(): return img
    ys, xs = np.nonzero(al); return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

def crisp_resize(img, w, h):
    """réduction nette d'un sprite déjà en pixels : chaque pixel d'arrivée prend la couleur dominante de sa zone"""
    a = np.array(img).astype(np.int32); H, W = a.shape[:2]
    out = np.zeros((h, w, 4), np.uint8)
    q = (a[..., :3] // 12); key = (q[..., 0] << 10) | (q[..., 1] << 5) | q[..., 2]
    for j in range(h):
        for i in range(w):
            ya, yb = int(j * H / h), max(int(j * H / h) + 1, int(round((j + 1) * H / h))); xa, xb = int(i * W / w), max(int(i * W / w) + 1, int(round((i + 1) * W / w)))
            blk = a[ya:yb, xa:xb]; op = blk[..., 3] > 0
            if op.mean() < 0.5: continue
            k = key[ya:yb, xa:xb][op]; vals, cnt = np.unique(k, return_counts=True)
            out[j, i, :3] = blk[op][k == vals[cnt.argmax()]][:, :3].mean(0); out[j, i, 3] = 255
    return Image.fromarray(out)

def fit_px(img, maxw, maxh, exactw=None):
    """sprite en pixels → taille du jeu : gardé tel quel s'il tient dans maxw × maxh, sinon réduit net ;
    exactw : largeur imposée (herbes, barrières : exactement une case)"""
    w, h = img.size
    sc = exactw / w if exactw else min(1.0, maxw / w, maxh / h)
    if exactw is None and sc > 0.87: sc = 1.0 if (w <= maxw * 1.15 and h <= maxh * 1.15) else sc
    if abs(sc - 1) < 1e-6 and w <= maxw and h <= maxh: return img
    nw, nh = max(1, round(w * sc)), max(1, round(h * sc))
    return crisp_resize(img, min(nw, maxw), min(nh, maxh))

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
CW, CHH = 64, 64
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

def grid_phase(rgb, fg, p):
    px, py = _edge_profile(rgb, fg, 1), _edge_profile(rgb, fg, 0)
    return p, _comb(px / (px.mean() + 1e-9), p)[1], _comb(py / (py.mean() + 1e-9), p)[1]

def sheet_grid(cells):
    """pas commun à toute la planche (médiane des cases), phase propre à chaque case"""
    ps = [pixel_grid(rgb, fg)[0] for rgb, fg in cells[:6] if fg.sum() > 400]
    p = float(np.median(ps)) if ps else 6.0
    # un personnage fait de 40 à 100 pixels de haut : sinon on a trouvé un multiple (ou une fraction) du vrai pas
    hs = [np.ptp(np.nonzero(fg)[0]) + 1 for _, fg in cells if fg.any()]
    if hs:
        h = max(hs)
        while h / p < 42 and p / 2 >= 2.5: p /= 2
        while h / p > 100: p *= 2
    return [grid_phase(rgb, fg, p) for rgb, fg in cells], p

def _sig(img, flip=False):
    a = np.array(img).astype(float); a[a[..., 3] == 0] = 128
    s = np.array(Image.fromarray(a.astype(np.uint8)).resize((16, 24), Image.BILINEAR)).astype(float)[..., :3]
    return s[:, ::-1] if flip else s

def facing(img):
    """sens d'un profil : -1 tourné vers la gauche, +1 vers la droite, 0 de face ou de dos.
    Le visage (peau claire) est du côté où regarde le personnage ; une case symétrique est de face."""
    a = np.array(img).astype(int); op = a[..., 3] > 0; H, W = op.shape
    ys, xs = np.nonzero(op)
    sym = np.abs(_sig(img) - _sig(img, True)).mean()
    head = op.copy(); head[int(H * 0.45):] = False
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    skin = head & (r > 150) & (r > g + 10) & (g > b) & (g > 90) & (r - b > 35)
    hx = np.nonzero(head)[1].mean() if head.any() else W / 2
    if skin.sum() >= 4:
        dx = np.nonzero(skin)[1].mean() - hx
        if abs(dx) > W * 0.06: return (-1 if dx < 0 else 1), sym
    return 0, sym

def foot_spread(img):
    op = np.array(img)[..., 3] > 0; H = op.shape[0]
    rows = op[int(H * 0.85):]; xs = np.nonzero(rows.any(0))[0]
    return (xs.max() - xs.min()) if len(xs) else 0

def walk_cycle(frames):
    """trois cases (pas 1, immobile, pas 2) parmi des profils tournés du même côté"""
    uniq = []
    for f in frames:
        if all(np.abs(_sig(f) - _sig(u)).mean() > 4 for u in uniq): uniq.append(f)
    if not uniq: return None
    # les cases les plus « de profil » (les moins symétriques) d'abord : une case presque de face ferait tourner le
    # personnage sur lui-même
    sy = {id(u): np.abs(_sig(u) - _sig(u, True)).mean() for u in uniq}
    top = max(sy.values())
    good = [u for u in uniq if sy[id(u)] >= 0.75 * top]
    if len(good) >= 2: uniq = good
    uniq.sort(key=foot_spread)
    idle = uniq[0]; steps = uniq[1:] or [idle]
    if len(steps) >= 2:
        # les deux pas les plus différents l'un de l'autre
        best = max(((a, b) for i, a in enumerate(steps) for b in steps[i + 1:]), key=lambda ab: np.abs(_sig(ab[0]) - _sig(ab[1])).mean())
        return [best[0], idle, best[1]]
    return [steps[0], idle, steps[0]]

def split_profiles(frames, front=None):
    """profils rangés en « vers la gauche » / « vers la droite ». Repère : le profil dont le visage est le plus net ;
    chaque autre case est comparée à ce repère telle quelle et en miroir. Les cases presque symétriques (de face,
    égarées au milieu d'une ligne de profil) sont écartées."""
    if not frames: return [], []
    info = []
    for im in frames:
        a = np.array(im).astype(int); op = a[..., 3] > 0; H, W = op.shape
        head = op.copy(); head[int(H * 0.45):] = False
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        skin = head & (r > 150) & (r > g + 10) & (g > b) & (g > 90) & (r - b > 35)
        dx = (np.nonzero(skin)[1].mean() - np.nonzero(head)[1].mean()) / W if skin.sum() >= 4 and head.any() else 0
        sym = np.abs(_sig(im) - _sig(im, True)).mean()
        info.append((im, dx, sym))
    syms = sorted(x[2] for x in info); med = syms[len(syms) // 2]
    prof = [x for x in info if x[2] >= 0.45 * med] or info
    if front is not None and len(prof) > 2:
        # case de face égarée : elle ressemble bien plus à la case de face qu'à un profil
        df = [np.abs(_sig(x[0]) - _sig(front)).mean() for x in prof]
        md = sorted(df)[len(df) // 2]
        keep = [x for x, d in zip(prof, df) if d >= 0.6 * md]
        if len(keep) >= 2: prof = keep
    anchor = max(prof, key=lambda x: abs(x[1]))
    side = -1 if anchor[1] <= 0 else 1   # sans visage visible : la première case de profil regarde à gauche
    if abs(anchor[1]) < 0.02: side = -1; anchor = prof[0]
    L, R = [], []
    for im, dx, sym in prof:
        same = np.abs(_sig(im) - _sig(anchor[0])).mean() <= np.abs(_sig(im, True) - _sig(anchor[0])).mean()
        (L if (same and side < 0) or (not same and side > 0) else R).append(im)
    return L, R

CHAR_SMALL = {'gamin', 'fillette', 'enfant'}

def do_chars():
    """planche des personnages : cases de 64 × 64, un pixel du dessin = un pixel à l'écran (densité 2 : une case du
    décor fait 32 pixels). Les profils sont triés par sens (gauche / droite) quelle que soit leur place sur la planche."""
    ids = list(CHARS)
    atlas = Image.new('RGBA', (CW * 12, CHH * len(ids)))
    rows, report = {}, []
    for r, cid in enumerate(ids):
        fn, _ = CHARS[cid]
        if is_native(fn):
            # planche retouchée à la main en vraie résolution : rien à deviner, on garde chaque pixel
            imgs = native_cells(np.array(Image.open(os.path.join(SRC, fn)).convert('RGBA')), 3, 4, raw=True); p = 1.0
        else:
            cells = char_cells(load(fn))
            grids, p = sheet_grid(cells)
            imgs = [snap(rgb, fg, grids[k])[0] if fg.sum() > 100 else None for k, (rgb, fg) in enumerate(cells)]
        # taille : on garde la résolution du dessin, sauf s'il dépasse la case
        hmax = max(im.height for im in imgs if im)
        lim = 50 if cid in CHAR_SMALL else 60
        if hmax > lim:
            sc = (lim - 2) / hmax
            imgs = [crisp_resize(im, max(1, round(im.width * sc)), max(1, round(im.height * sc))) if im else None for im in imgs]
        # profils : toutes les cases des lignes 2 et 3 (et une éventuelle case de profil égarée ailleurs)
        L, R = split_profiles([imgs[k] for k in range(3, 9) if imgs[k] is not None], imgs[1])
        mir = lambda im: im.transpose(Image.FLIP_LEFT_RIGHT)
        left = walk_cycle(L + [mir(x) for x in R]) if len(L) < 2 else walk_cycle(L)
        right = walk_cycle(R + [mir(x) for x in L]) if len(R) < 2 else walk_cycle(R)
        left = left or [mir(x) for x in right]; right = right or [mir(x) for x in left]
        out = {0: imgs[0:3], 1: left, 2: right, 3: imgs[9:12]}
        for d in range(4):
            for c in range(3):
                im = out[d][c] or out[d][1]
                if im is None: continue
                atlas.alpha_composite(place(im, CW, CHH, pad=1), ((d * 3 + c) * CW, r * CHH))
        rows[cid] = r
        report.append(f'{cid}: pas {p:.2f}, hauteur {hmax}, profils G {len(L)} / D {len(R)}')
    save(atlas, 'chars.png')
    META['chars'] = {'w': CW, 'h': CHH, 'd': 2, 'rows': rows}
    print('\n'.join(report))

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
    if is_native('objets.png'):
        # planche en vraie résolution (6 × 6 icônes de 32 × 32) : chaque icône reprise pixel pour pixel
        done = []
        for k, img in enumerate(native_cells(load_native('objets.png'), 6, 6)):
            if img is None: continue
            key = ITEMS[k // 6][k % 6]
            save(place(fit_px(img, 32, 32), 32, 32, anchor='center'), 'items', key + '.png'); done.append(key)
        META['items'] = done; print('objets en vraie résolution :', len(done)); return
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
# taille maximale dans le jeu (pixels, densité 2 : une case du décor = 32 pixels) ; « w » impose la largeur exacte
NATURE2_FIT = {'tree': (72, 96), 'tree2': (72, 96), 'tree3': (72, 96), 'pine': (64, 100), 'snowpine': (64, 100), 'deadtree': (72, 96),
               'palm': (72, 100), 'cuttree': (32, 48), 'bush': (32, 32), 'rock': (32, 32), 'crackrock': (32, 32), 'caverock': (32, 32),
               'stalag': (32, 56), 'lamp': (32, 64), 'sign': (32, 40), 'mailbox': (32, 40), 'tuft': ('wh', 32, 40), 'tuft1': ('w', 30),
               'darktuft': ('wh', 32, 40), 'snowtuft': ('wh', 32, 40), 'flowers_r': (30, 26), 'flowers_y': (30, 26), 'flowers_w': (30, 26),
               'fence': ('w', 32), 'pot': (28, 32), 'statue': (32, 64), 'gymstatue': (32, 64), 'itemball': (20, 20)}

def fit_nature(img, fit):
    """taille du jeu. Herbes hautes et barrières sont des motifs qui se répètent : on en découpe une case
    (32 pixels de large, en bas et au centre) au lieu de les réduire, pour garder chaque pixel dessiné"""
    if fit[0] in ('wh', 'w'):
        w = fit[1]; h = min(img.height, 40) if fit[0] == 'wh' else img.height   # herbe : la case et ses pointes (40 px au plus)
        if img.width >= w and img.height >= h:
            x0 = (img.width - w) // 2
            return img.crop((x0, img.height - h, x0 + w, img.height))
        return crisp_resize(img, w, h) if fit[0] == 'wh' else fit_px(img, 32, 64, exactw=w)
    return fit_px(img, *fit)

GRASS_KEYS = ('tuft', 'darktuft', 'snowtuft')

def grass_tile(c, W=32, H=40):
    """herbe haute dessinée en tapis (une case pleine de brins, pointes en haut) : on garde les 40 lignes du haut
    (les pointes + une case) sur 32 pixels de large. Le motif se répète tous les p pixels (≈ 15) : on en prend un
    nombre entier de périodes, puis on double (ou retire) les colonnes les plus discrètes pour tomber sur 32,
    si bien que deux cases voisines se raccordent sans couture"""
    a = c[..., 3] > 0
    if not a.any(): return None
    ys, xs = np.nonzero(a); c = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    g = c[c.shape[0] // 3:, :, :3].astype(float).mean(2)
    p = min(range(8, c.shape[1] // 2), key=lambda p: np.abs(g[:, p:] - g[:, :-p]).mean())
    n = max(1, round(W / p)); base = n * p; c = c[:H]
    x0 = (c.shape[1] - base) // 2; win = c[:, x0:x0 + base].copy()
    # restes violets de l'ancien fond entre les pointes : transparents en haut, sinon la couleur du pixel du dessous
    r, gg, b = (win[..., k].astype(int) for k in range(3))
    vi = (win[..., 3] > 0) & (r > gg + 25) & (b > gg + 25)
    for y, x in sorted(zip(*np.nonzero(vi)), reverse=True):
        if y < 10 or y + 1 >= win.shape[0]: win[y, x] = 0
        else: win[y, x] = win[y + 1, x]
    d = np.abs(win[:, 1:, :3].astype(int) - win[:, :-1, :3].astype(int)).sum((0, 2))
    extra = W - base; cols = list(range(base)); pick = []
    for k in sorted(range(base - 1), key=lambda k: d[k]):
        if len(pick) == abs(extra): break
        if all(abs(k - q) >= p // 2 for q in pick): pick.append(k)
    for k in sorted(pick, reverse=True):
        if extra > 0: cols.insert(k + 1, k)
        else: cols.pop(k)
    return Image.fromarray(np.ascontiguousarray(win[:, cols]))

def sheet_objects(a, cols, rows, dil=2, minarea=150):
    """objets d'une planche sur fond magenta (cases plus ou moins régulières, traits de grille) : un objet par case,
    trouvé comme une tache de couleur, rangé dans la case où tombe son centre"""
    H, W = a.shape[:2]
    bg = magenta(a)
    dark = (a.max(2) < 90) & ~bg
    # un trait de grille est long (60 pixels et plus) et fin (4 pixels au plus) ; un dessin sombre est épais
    hl = ndimage.binary_opening(dark, structure=np.ones((1, 60))); vl = ndimage.binary_opening(dark, structure=np.ones((60, 1)))
    hl &= ~ndimage.binary_opening(hl, structure=np.ones((5, 1))); vl &= ~ndimage.binary_opening(vl, structure=np.ones((1, 5)))
    # … et il passe près d'une limite de case (les cases dessinées à la main ne sont pas parfaitement régulières)
    band_y = np.zeros(H, bool); band_x = np.zeros(W, bool)
    for k in range(1, rows): c = int(k * H / rows); band_y[max(0, c - 70):c + 70] = True
    for k in range(1, cols): c = int(k * W / cols); band_x[max(0, c - 70):c + 70] = True
    hl &= band_y[:, None]; vl &= band_x[None, :]
    lines = ndimage.binary_dilation(hl | vl, iterations=2)
    fg = ~bg & ~lines
    fg = ndimage.binary_opening(fg, iterations=1)
    lab, n = ndimage.label(ndimage.binary_dilation(fg, iterations=dil) if dil else fg)
    # chaque tache rejoint la case où tombe son centre (un objet en plusieurs morceaux, comme des fleurs, est réuni)
    masks = {}
    for k in range(1, n + 1):
        m = (lab == k) & fg
        if m.sum() < minarea: continue
        ys, xs = np.nonzero(m); cy, cx = ys.mean(), xs.mean()
        cell = (min(cols - 1, int(cx * cols / W)), min(rows - 1, int(cy * rows / H)))
        masks[cell] = masks[cell] | m if cell in masks else m
    found = {}
    for cell, m in masks.items():
        ys, xs = np.nonzero(m); found[cell] = (m, (ys.min(), ys.max() + 1, xs.min(), xs.max() + 1))
    return found

def do_nature2():
    """planches nature_arbres.png (4 × 4) et nature_petits.png (4 × 3) : pixel art ramené à sa résolution réelle"""
    done = dict(META.get('nature', {}))
    for files, names in ((('nature_arbres.png', 'nature_abre.png'), NATURE2_TREES), (('nature_petits.png',), NATURE2_SMALL)):
        file = next((f for f in files if os.path.exists(os.path.join(SRC, f))), None)
        if not file: continue
        native = is_native(file)
        if native:
            A = load_native(file); a = A[..., :3].copy(); a[A[..., 3] == 0] = (255, 0, 255)
        else: a = load(file)
        objs = sheet_objects(a, len(names[0]), len(names), *((0, 6) if native else ()))
        if native:
            # vraie résolution : chaque objet est repris pixel pour pixel
            H, W = A.shape[:2]; R, C = len(names), len(names[0])
            for j, row in enumerate(names):
                for i, key in enumerate(row):
                    if key not in GRASS_KEYS: continue
                    # tapis d'herbe : la case entière (trop sombre ou trop dense pour le détourage par taches)
                    img = grass_tile(A[round(j * H / R):round((j + 1) * H / R), round(i * W / C):round((i + 1) * W / C)])
                    if img is None: continue
                    save(img, 'nature', key + '.png'); done[key] = [img.width, img.height, 2]
                    print('herbe (tapis, vraie résolution)', key, img.size)
            for (i, j), (m, (y0, y1, x0, x1)) in sorted(objs.items()):
                key = names[j][i]
                if key in GRASS_KEYS: continue
                c = A[y0:y1, x0:x1].copy(); c[~m[y0:y1, x0:x1], 3] = 0
                img = fit_nature(crop_alpha(Image.fromarray(c)), NATURE2_FIT[key])
                save(img, 'nature', key + '.png'); done[key] = [img.width, img.height, 2]
                print('nature (vraie résolution)', key, img.size)
            continue
        crops = {}
        for (i, j), (m, (y0, y1, x0, x1)) in objs.items():
            pad = 6; y0, x0 = max(0, y0 - pad), max(0, x0 - pad); y1, x1 = min(a.shape[0], y1 + pad), min(a.shape[1], x1 + pad)
            crops[(i, j)] = (a[y0:y1, x0:x1], m[y0:y1, x0:x1])
        # même pas pour toute la planche (les petits objets seuls donnent parfois le double)
        ps = sorted(pixel_grid(rgb, fg)[0] for rgb, fg in crops.values() if fg.sum() > 3000)
        pS = ps[len(ps) // 2] if ps else None
        for (i, j), (rgb, fg) in sorted(crops.items()):
            key = names[j][i]
            img, p = snap(rgb, fg, grid_phase(rgb, fg, pS) if pS else None)
            img = fit_nature(img, NATURE2_FIT[key])
            save(img, 'nature', key + '.png')
            done[key] = [img.width, img.height, 2]
            print('nature (v2)', key, 'pas', round(p, 2), img.size)
    # cases d'herbe haute retouchées à part (32 × 40 : une case + les pointes qui dépassent au-dessus)
    for file, key in (('herbe_haute.png', 'tuft'), ('herbe_sombre.png', 'darktuft'), ('herbe_neige.png', 'snowtuft')):
        if os.path.exists(os.path.join(SRC, file)):
            img = Image.fromarray(load_native(file)) if is_native(file) else None
            if img is None: continue
            save(img, 'nature', key + '.png'); done[key] = [img.width, img.height, 2]
            print('herbe (vraie résolution)', key, img.size)
    META['nature'] = done
    META['natureV2'] = True

def do_sheet(file, names, sizes, folder, meta, dens=1):
    """planche 6 × 4 sur fond uni. dens = 2 : réduction nette (couleur dominante, pas de flou) à deux fois la résolution
    des tuiles, comme les personnages et la nature « version 2 »"""
    if is_native(file):
        # planche retouchée à la main en vraie résolution : chaque objet est repris pixel pour pixel (densité 2)
        done = {}
        for k, img in enumerate(native_cells(load_native(file), 6, 4)):
            if img is None: continue
            key = names[k // 6][k % 6]
            save(img, folder, key + '.png'); done[key] = [img.width, img.height, 2]
        META[meta] = done
        print(file, 'en vraie résolution :', ', '.join(f'{k} {v[0]}×{v[1]}' for k, v in done.items()))
        return
    a = load(file); done = {}
    for i, j, cell in grid_cells(a, 6, 4):
        key = names[j][i]
        sz = sizes[key]; w, h = sz[0], sz[1]; fill = sz[2] if len(sz) > 2 else 1
        fg = keep_main(grab(cell, flat_bg(cell, 0.04, 0.04, tol=20), margin=0.03))
        if dens == 2 and fg.any():
            ys, xs = np.nonzero(fg); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            src = Image.fromarray(np.dstack([cell[y0:y1, x0:x1], fg[y0:y1, x0:x1] * 255]).astype(np.uint8))
            W2, H2 = w * 2, h * 2; sc = min(W2 * fill / src.width, H2 * fill / src.height)
            img = place(crisp_resize(src, max(1, round(src.width * sc)), max(1, round(src.height * sc))), W2, H2)
            save(img, folder, key + '.png'); done[key] = [W2, H2, 2]
            continue
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
        if not os.path.exists(os.path.join(SRC, fn)): continue
        im = Image.open(os.path.join(SRC, fn))
        if max(im.size) <= 256:
            # kit en vraie résolution (4 × 4 tuiles de 32 pixels) : repris tel quel
            save(im.convert('RGB').resize((128, 128), Image.NEAREST) if im.size != (128, 128) else im.convert('RGB'), 'facades', k + '.png')
            print('façade (vraie résolution)', k); continue
        a = load(fn); H, W = a.shape[:2]
        out = Image.new('RGB', (64, 64))
        for j in range(4):
            for i in range(4):
                t = a[round(j * H / 4):round((j + 1) * H / 4), round(i * W / 4):round((i + 1) * W / 4)]
                m = max(1, t.shape[0] // 64); t = t[m:-m, m:-m]
                out.paste(Image.fromarray(tile_down(np.ascontiguousarray(t), 16)), (i * 16, j * 16))
        save(out, 'facades', k + '.png')
    META['facades'] = list(FACADES)

# ------------------------------------------------------------------ kits de bâtiments « tileset » (4 × 4 tuiles sur fond magenta)
# kit_<nom>.png → facades/<nom>.png : 4 colonnes × 5 lignes de tuiles de 32 pixels, avec transparence.
# Lignes 1 à 4 : mur, fenêtre, fenêtre la nuit, socle · porte, porte la nuit, linteau, côté · toit, rebord, faîte, cheminée ·
# enseigne (2 moitiés), jardinière, lampe. Ligne 5 (ajoutée ici) : fenêtre et fenêtre la nuit AVEC le socle, pour le rez-de-chaussée.
KITS = {'maison': 'maison'}

def kit_cells(a):
    """les 16 tuiles d'un kit : grille régulière, chaque tuile débarrassée de sa gouttière magenta"""
    H, W = a.shape[:2]; mag = magenta(a)
    boxes = {}
    for j in range(4):
        for i in range(4):
            y0, y1, x0, x1 = round(j * H / 4), round((j + 1) * H / 4), round(i * W / 4), round((i + 1) * W / 4)
            m = ~mag[y0:y1, x0:x1]
            ys = np.nonzero(m.mean(1) > 0.85)[0]; xs = np.nonzero(m.mean(0) > 0.85)[0]
            boxes[(i, j)] = (y0, y1, x0, x1, ys, xs)
    # taille d'une tuile pleine (lignes 1 à 3) ; les objets de la ligne 4 prennent la même zone, centrée dans leur case
    full = [(b[4][-1] - b[4][0] + 1, b[5][-1] - b[5][0] + 1) for (i, j), b in boxes.items() if j < 3 and len(b[4]) and len(b[5])]
    s = int(np.median([min(h, w) for h, w in full]))
    tiles = {}
    for (i, j), (y0, y1, x0, x1, ys, xs) in boxes.items():
        if j < 3 and len(ys) > s * 0.8 and len(xs) > s * 0.8: ty, tx = y0 + ys[0], x0 + xs[0]
        else: ty, tx = y0 + (y1 - y0 - s) // 2, x0 + (x1 - x0 - s) // 2
        c = a[ty:ty + s, tx:tx + s].copy()
        rgba = np.dstack([c, np.where(magenta(c), 0, 255).astype(np.uint8)])
        tiles[(i, j)] = np.array(crisp_resize(Image.fromarray(rgba), 32, 32))
    return tiles

def do_kits():
    for name, out in KITS.items():
        fn = 'kit_' + name + '.png'
        if not os.path.exists(os.path.join(SRC, fn)): continue
        t = kit_cells(load(fn))
        grey = lambda row: (row[:, :3].max(1).astype(int) - row[:, :3].min(1)).mean() < 22
        base = t[(3, 0)]
        # hauteur du socle : lignes du bas grises (pierre) à la fois sous le mur et sous le « socle »
        p = 0
        while p < 12 and grey(base[31 - p]) and grey(t[(0, 0)][31 - p]): p += 1
        kit = np.zeros((160, 128, 4), np.uint8)
        for (i, j), tile in t.items(): kit[j * 32:(j + 1) * 32, i * 32:(i + 1) * 32] = tile
        kit[128:160, 0:32] = t[(1, 0)]; kit[128:160, 32:64] = t[(2, 0)]           # fenêtres du rez-de-chaussée, socle compris
        if p:
            # étages : mur, fenêtres et côté sans le socle ; à sa place, le haut de la tuile (la poutre ou la corniche),
            # si bien que deux étages empilés sont séparés par une bande de bois, comme un plancher vu de dehors
            for (i, j) in ((0, 0), (1, 0), (2, 0), (3, 1)):
                y, x = j * 32, i * 32
                kit[y + 32 - p:y + 32, x:x + 32] = kit[y:y + p, x:x + 32]
        # toit : les trous du rebord, du faîte et de la cheminée laissent voir les tuiles du toit
        roof = kit[64:96, 0:32]
        for i in (1, 2, 3):
            tile = kit[64:96, i * 32:(i + 1) * 32]; hole = tile[..., 3] == 0; tile[hole] = roof[hole]
        # lampe murale : dessinée sur toute sa case par le générateur, ramenée à la taille d'une applique (22 pixels)
        lamp = kit[96:128, 96:128].copy(); ys, xs = np.nonzero(lamp[..., 3])
        if len(ys):
            obj = Image.fromarray(lamp[ys.min():ys.max() + 1, xs.min():xs.max() + 1]); h = 22; w = max(4, round(obj.width * h / obj.height))
            small = np.array(crisp_resize(obj, w, h)); kit[96:128, 96:128] = 0
            kit[96 + 4:96 + 4 + h, 96 + 2:96 + 2 + w] = small
        # fumée teintée par le fond magenta : grise
        r, g, b = kit[..., 0].astype(int), kit[..., 1].astype(int), kit[..., 2].astype(int)
        pink = (kit[..., 3] > 0) & (r > g + 40) & (b > g + 40)
        kit[pink, :3] = np.stack([(r + g + b)[pink] // 3] * 3, 1)
        save(Image.fromarray(kit), 'facades', out + '.png'); print('kit', name, '→', out, 'socle', p, 'px')

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
    if 'mobilier' in want: do_sheet('mobilier.png', MOBILIER, MOBILIER_SIZE, 'mobilier', 'mobilier', dens=2)
    if 'sol' in want: do_sol()
    if 'facades' in want: do_facades(); do_kits()
    if 'title' in want: do_title()
    write_meta()
    print('ok :', ', '.join(sorted(want)))
