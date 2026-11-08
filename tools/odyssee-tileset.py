#!/usr/bin/env python3
# Odyssée — découpe le tileset global (assets/graphics/tileset.png, assemblé à la main à partir des planches générées)
# en tuiles du jeu, à 32 pixels par case (une case du décor fait 32 pixels à l'écran : affichées pixel pour pixel).
#
#   python3 tools/odyssee-tileset.py            (tout)
#   python3 tools/odyssee-tileset.py sol herbes kits
#   python3 tools/odyssee-tileset.py violet   (retire l'ombre et le liseré violets laissés par le fond magenta des planches)
#
# Chaque élément est repéré par un point à l'intérieur de son dessin : la tuile est le bloc de pixels opaques qui le
# contient (les tuiles du tileset sont séparées par du vide). Écrit odyssee/img/sol32/, odyssee/img/herbes/,
# odyssee/img/facades/ et met à jour odyssee/js/data/sprites.js (« sol32 », « herbes », « facades »).
#
# Prérequis : pip install pillow numpy scipy
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'graphics', 'tileset.png')
OUT = os.path.join(ROOT, 'odyssee', 'img')
T = 32

IM = Image.open(SRC).convert('RGBA')
A = np.array(IM)
OPAQUE = A[..., 3] > 128
LAB, _ = ndimage.label(OPAQUE)
OBJS = ndimage.find_objects(LAB)

def box_at(x, y):
    """boîte (x0, y0, x1, y1) du bloc opaque qui contient le point (x, y)"""
    k = LAB[y, x]
    if not k: raise ValueError(f'rien en ({x}, {y})')
    o = OBJS[k - 1]
    return o[1].start, o[0].start, o[1].stop, o[0].stop

def crop(b, inset=0):
    x0, y0, x1, y1 = b
    return IM.crop((x0 + inset, y0 + inset, x1 - inset, y1 - inset))

def binarize(img):
    a = np.array(img); a[..., 3] = np.where(a[..., 3] > 127, 255, 0); return Image.fromarray(a)

def texture(img, w=T, h=T):
    """texture pleine → w × h : moyenne par zone (Lanczos), alpha net"""
    return binarize(img.resize((w, h), Image.LANCZOS))

def crisp(img, w, h):
    """sprite détouré → w × h : chaque pixel prend la couleur dominante de sa zone (reste net, pas de halo)"""
    a = np.array(img).astype(np.int32); H, W = a.shape[:2]
    out = np.zeros((h, w, 4), np.uint8)
    q = a[..., :3] // 12; key = (q[..., 0] << 10) | (q[..., 1] << 5) | q[..., 2]
    for j in range(h):
        for i in range(w):
            ya, yb = int(j * H / h), max(int(j * H / h) + 1, int(round((j + 1) * H / h)))
            xa, xb = int(i * W / w), max(int(i * W / w) + 1, int(round((i + 1) * W / w)))
            blk = a[ya:yb, xa:xb]; op = blk[..., 3] > 127
            if op.mean() < 0.5: continue
            k = key[ya:yb, xa:xb][op]; vals, cnt = np.unique(k, return_counts=True)
            out[j, i, :3] = blk[op][k == vals[cnt.argmax()]][:, :3].mean(0); out[j, i, 3] = 255
    return Image.fromarray(out)

def save(img, *parts):
    p = os.path.join(OUT, *parts); os.makedirs(os.path.dirname(p), exist_ok=True); img.save(p, optimize=True)

META = {}

# ------------------------------------------------------------------ sols
# clé du jeu → point dans la tuile du tileset
SOL = {
    'snow0': (37, 37), 'snow1': (111, 37), 'snow2': (185, 37), 'snow3': (259, 37),
    'ash0': (37, 111), 'ash1': (111, 111), 'gravel0': (185, 111), 'gravel1': (259, 111),
    'path0': (38, 173), 'path1': (90, 173), 'sand0': (143, 173), 'sand1': (195, 173),
    'water0': (260, 173), 'water1': (312, 173), 'water2': (364, 173), 'water3': (415, 173),
    'pave0': (38, 225), 'pave1': (90, 225), 'grass0': (143, 225), 'grass1': (195, 225),
    'deep0': (260, 225), 'deep1': (312, 225), 'lava0': (364, 225), 'lava1': (415, 225),
    'grass2': (38, 277), 'flowerW': (90, 277), 'flowerR': (143, 277), 'field': (195, 277),
    'forest0': (38, 330), 'forest1': (90, 330), 'leaves0': (143, 330), 'leaves1': (195, 330),
    'cliffG': (38, 388), 'cliffG2': (90, 388), 'cliffGstairs': (143, 388), 'cliffG3': (195, 388),
    'cliffR': (38, 440), 'cliffR2': (90, 440), 'cliffRstairs': (143, 440), 'cliffR3': (195, 440),
    'cliffS': (38, 492), 'cliffS2': (90, 492), 'cliffSstairs': (143, 492), 'cliffS3': (195, 492),
    'stairs': (259, 385), 'stairs2': (309, 385),
    'bridgeEW': (272, 503), 'bridgeEW2': (346, 503), 'bridgeNS': (420, 503), 'bridgeNS2': (494, 503),
    'dock0': (272, 577), 'dock1': (346, 577), 'dockEnd0': (420, 560), 'dockEnd1': (494, 560),
    # intérieurs (partie 5)
    'floor_wood': (39, 639), 'floor_wood2': (91, 639), 'floor_beige': (143, 639), 'floor_pink': (196, 639),
    'floor_pink2': (39, 691), 'floor_blue': (91, 691), 'floor_blue2': (143, 691), 'floor_round': (196, 691),
    'floor_dark': (39, 743), 'floor_grate': (91, 743), 'floor_marble': (143, 743), 'floor_marble2': (196, 743),
    'carpetL': (39, 796), 'carpet': (91, 796), 'carpetR': (143, 796), 'carpet2': (196, 796),
    'floor_metal': (37, 856), 'floor_metal2': (89, 856), 'floor_grate2': (141, 856), 'floor_hazard': (192, 856),
    'cave0': (37, 907), 'cave1': (89, 907), 'cavepuddle': (141, 907), 'ice': (192, 907),
    'crystal': (37, 959), 'floor_white': (89, 959), 'floor_stone': (141, 959), 'floor_dark2': (192, 959),
    'floor_glyph': (37, 1010), 'floor_glyph2': (89, 1010), 'floor_sand': (141, 1010), 'tatami': (192, 1010),
}
LEDGES = {'ledge': (278, 675), 'ledgeW': (364, 675), 'ledgeE': (450, 675)}
SPR = {'ladder': (356, 385), 'hole': (405, 385), 'waterrock': (258, 434), 'whirl': (355, 434), 'crackrock': (406, 434)}

def do_sol():
    keys = []
    for k, (x, y) in SOL.items():
        save(texture(crop(box_at(x, y), 1)), 'sol32', k + '.png'); keys.append(k)
    # rebords : la bande de terre (lumière, talus, ombre) des tuiles du tileset, posée sur l'herbe du jeu
    grass = np.array(Image.open(os.path.join(OUT, 'sol32', 'grass0.png')))
    for k, (x, y) in LEDGES.items():
        t = np.array(texture(crop(box_at(x, y), 2)))
        g = grass.copy()
        # pixels « talus » : la bande qui s'écarte nettement de l'herbe (liseré clair, terre, ombre)
        f = t[..., :3].astype(int)
        lines = f.reshape(T, T, 3) if k == 'ledge' else f.transpose(1, 0, 2)
        ref = np.median(lines.reshape(-1, 3), 0)
        dist = np.abs(lines - ref).sum(2).mean(1)
        brown = ((lines[..., 0] > lines[..., 1] - 10) & (lines[..., 0] > lines[..., 2] + 20)).mean(1)
        idx = np.nonzero(brown > 0.3)[0]
        if len(idx):
            a0, a1 = idx.min(), idx.max() + 1
            while a0 > 0 and dist[a0 - 1] > 40: a0 -= 1
            while a1 < T and dist[a1] > 40: a1 += 1
            # au moins 8 pixels de haut (le talus se lit bien à l'écran) : la bande est agrandie
            if a1 - a0 < 8:
                band = Image.fromarray((t[a0:a1] if k == 'ledge' else t[:, a0:a1]).astype(np.uint8))
                band = band.resize((T, 8) if k == 'ledge' else (8, T), Image.NEAREST)
                t = t.copy(); bb = np.array(band)
                if k == 'ledge': t[a0:a0 + 8] = bb
                else: t[:, a0:a0 + 8] = bb
                a1 = a0 + 8
            if k == 'ledge':
                # le talus descend vers le bas de la case, comme sur DS
                h = a1 - a0; dst = T - 4 - h
                g[dst:dst + h] = t[a0:a1]
            else:
                w = a1 - a0; dst = T - 4 - w if k == 'ledgeE' else 4
                g[:, dst:dst + w] = t[:, a0:a1]
        save(Image.fromarray(g), 'sol32', k + '.png'); keys.append(k)
    os.makedirs(os.path.join(OUT, 'nature'), exist_ok=True)
    for k, (x, y) in SPR.items():
        img = crop(box_at(x, y), 1); save(crisp(img, T, T), 'sol32', k + '.png'); keys.append(k)
    META['sol32'] = keys
    print('sols :', len(keys))

# ------------------------------------------------------------------ hautes herbes (planches 4 × 4)
# lignes : coin haut-gauche, haut, coin haut-droit, plein B / gauche, plein A, droite, plein C /
#          coin bas-gauche, bas, coin bas-droit, herbe qui bouge / coins intérieurs (voir PIECES)
HERBES = {'prairie': (229, 823, 450, 1044), 'bois': (7, 1094, 222, 1310), 'neige': (229, 1094, 447, 1306)}
GRID = [['tl', 't', 'tr', 'b'], ['l', 'a', 'r', 'c'], ['bl', 'bot', 'br', 'shake'], ['i1', 'i2', 'i3', 'i4']]

def sheet_cells(x0, y0, x1, y1):
    """les 16 cases d'une planche : zone de la case et boîte des blocs opaques dont le centre est dans la zone"""
    sub = OPAQUE[y0:y1, x0:x1]
    lab, _ = ndimage.label(sub)
    boxes = {}
    for o in ndimage.find_objects(lab):
        ys, xs = o
        cx, cy = (xs.start + xs.stop) / 2, (ys.start + ys.stop) / 2
        i = min(3, int(cx * 4 / (x1 - x0))); j = min(3, int(cy * 4 / (y1 - y0)))
        b = boxes.get((i, j)); nb = (x0 + xs.start, y0 + ys.start, x0 + xs.stop, y0 + ys.stop)
        boxes[(i, j)] = nb if not b else (min(b[0], nb[0]), min(b[1], nb[1]), max(b[2], nb[2]), max(b[3], nb[3]))
    out = {}
    for j in range(4):
        for i in range(4):
            cx0, cx1 = x0 + (x1 - x0) * i // 4, x0 + (x1 - x0) * (i + 1) // 4
            cy0, cy1 = y0 + (y1 - y0) * j // 4, y0 + (y1 - y0) * (j + 1) // 4
            b = boxes.get((i, j))
            # la zone de la case s'élargit à son dessin (il peut déborder un peu sur la grille)
            if b: cx0, cy0, cx1, cy1 = min(cx0, b[0]), min(cy0, b[1]), max(cx1, b[2]), max(cy1, b[3])
            out[GRID[j][i]] = (cx0, cy0, cx1, cy1, b)
    return out

def unpink(img):
    """les liserés magenta (anticrénelage contre le fond) deviennent transparents"""
    a = np.array(img); r, g, b = (a[..., i].astype(int) for i in range(3))
    a[((g < np.minimum(r, b) - 8) & (r > 60)) | (a[..., 3] < 128), 3] = 0; a[a[..., 3] > 0, 3] = 255
    return Image.fromarray(a)

def herbe_pieces(theme, x0, y0, x1, y1):
    """pièces d'une planche, à la taille de la planche (S × S), après contrôle : une pièce ratée est remplacée par
    son miroir ou par la tuile pleine"""
    cells = sheet_cells(x0, y0, x1, y1)
    full = [cells[k][4] for k in ('a', 'b', 'c') if cells[k][4]]
    S = int(round(np.median([max(b[2] - b[0], b[3] - b[1]) for b in full])))
    P = {}
    for k, (cx0, cy0, cx1, cy1, b) in cells.items():
        if not b: continue
        bx = min(max(b[0], b[2] - S), b[0]) if k in ('l', 'tl', 'bl', 'i1', 'i3') else b[0]
        if k in ('l', 'tl', 'bl'): bx = b[2] - S
        by = b[3] - S if k in ('t', 'tl', 'tr', 'shake', 'i1', 'i2', 'i3', 'i4', 'a', 'b', 'c', 'l', 'r') else b[1]
        if k in ('i1', 'i2', 'i3', 'i4', 'a', 'b', 'c'):
            bx = b[0] if b[2] - b[0] >= S - 2 else (b[2] - S if (b[0] - cx0) > (cx1 - b[2]) else b[0])
        t = np.array(unpink(IM.crop((bx, by, bx + S, by + S))))
        # rien d'une case voisine : seuls les pixels de la zone de cette case
        yy, xx = np.mgrid[by:by + S, bx:bx + S]
        t[(yy < cy0) | (yy >= cy1) | (xx < cx0) | (xx >= cx1), 3] = 0
        P[k] = t
    op = lambda t: t[..., 3] > 0
    mir = lambda t: t[:, ::-1].copy()
    # coins extérieurs du haut : le coin doit être plein en bas, côté intérieur
    def good_corner(t, inner_right):
        o = op(t); h, w = o.shape
        return o[h // 2:, (w // 2 if inner_right else 0):(w if inner_right else w // 2)].mean() > 0.8 and o.mean() > 0.4
    if not good_corner(P['tl'], True) and good_corner(P['tr'], False): P['tl'] = mir(P['tr'])
    if not good_corner(P['tr'], False) and good_corner(P['tl'], True): P['tr'] = mir(P['tl'])
    # côtés : pleins du côté intérieur
    if op(P['l'])[:, S // 2:].mean() < 0.85 and op(P['r'])[:, :S // 2].mean() > 0.85: P['l'] = mir(P['r'])
    if op(P['r'])[:, :S // 2].mean() < 0.85 and op(P['l'])[:, S // 2:].mean() > 0.85: P['r'] = mir(P['l'])
    # coins intérieurs : rangés selon le quart le plus vide (un trou plus grand qu'un quart = pièce ratée)
    inner = {}
    for k in ('i1', 'i2', 'i3', 'i4'):
        t = P.get(k)
        if t is None: continue
        o = op(t); h = S // 2
        q = {'nw': 1 - o[:h, :h].mean(), 'ne': 1 - o[:h, h:].mean(), 'sw': 1 - o[h:, :h].mean(), 'se': 1 - o[h:, h:].mean()}
        c = max(q, key=q.get)
        if 0.12 < q[c] and (1 - o.mean()) < 0.22 and c not in inner: inner[c] = t
    for c, m in (('nw', 'ne'), ('ne', 'nw'), ('sw', 'se'), ('se', 'sw')):
        if c not in inner and m in inner: inner[c] = mir(inner[m])
    for c in ('nw', 'ne', 'sw', 'se'): P['in_' + c] = inner.get(c, P['a'])
    for k in ('i1', 'i2', 'i3', 'i4'): P.pop(k, None)
    # bas de la nappe : la tuile pleine (elle finit déjà par son contour foncé), côtés gauche / droit dans les coins
    P['bot'], P['bl'], P['br'] = P['a'], P['l'], P['r']
    return S, P

def overlap(t, s, top_edge=False, bottom_edge=False):
    """une rangée de touffes chevauche la précédente de s pixels (sans quoi le contour sombre du bas de chaque tuile
    dessine une rayure) : la case garde S - s lignes ; derrière ses pointes, le bas de la tuile du dessus"""
    S = t.shape[0]
    if bottom_edge: return t[s:].copy()
    c = t[:S - s].copy()
    if not top_edge:
        under = t[S - s:]; top = c[:s]; hole = top[..., 3] == 0; top[hole] = under[hole]
    return c

def recolor(P, ref):
    """repeint les pièces d'une planche avec les couleurs d'une autre (même rang de luminosité)"""
    lum = lambda a: a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
    src = np.sort(lum(P['a'][P['a'][..., 3] > 0].astype(float)))
    rp = ref[ref[..., 3] > 0][:, :3].astype(float); order = np.argsort(lum(rp)); rp = rp[order]
    out = {}
    for k, t in P.items():
        t = t.copy(); m = t[..., 3] > 0
        q = np.searchsorted(src, lum(t[m].astype(float))) / max(1, len(src))
        t[m, :3] = rp[np.clip((q * len(rp)).astype(int), 0, len(rp) - 1)].astype(np.uint8)
        out[k] = t
    return out

def seams(img):
    """traits de grille restés transparents (un pixel de large) : bouchés avec la couleur voisine"""
    a = np.array(img); op = a[..., 3] > 0; H, W = op.shape
    fill = np.zeros_like(op)
    fill[:, 1:-1] |= ~op[:, 1:-1] & op[:, :-2] & op[:, 2:]
    fill[1:-1, :] |= ~op[1:-1, :] & op[:-2, :] & op[2:, :]
    # colonne / ligne du bord : transparente sur une longue bande alors que sa voisine intérieure est pleine
    for sl, nb in (((slice(None), 0), (slice(None), 1)), ((slice(None), W - 1), (slice(None), W - 2)), ((0, slice(None)), (1, slice(None))), ((H - 1, slice(None)), (H - 2, slice(None)))):
        col, inn = ~op[sl], op[nb]
        if (col & inn).sum() > 8: fill[sl] |= col & inn
    if fill.any():
        _, (iy, ix) = ndimage.distance_transform_edt(~op, return_indices=True)
        a[fill] = a[iy[fill], ix[fill]]; a[fill, 3] = 255
    return Image.fromarray(a)

def do_herbes():
    meta = {}
    prairie = None
    for theme, box in HERBES.items():
        S, P = herbe_pieces(theme, *box)
        if theme == 'prairie': prairie = (S, P)
        # la planche des bois est la moins réussie : on reprend les pièces de la prairie, à ses couleurs
        if theme == 'bois' and prairie: S, P = prairie[0], recolor(prairie[1], P['a'])
        # hauteur des pointes : lignes du haut de la tuile pleine encore à moitié vides
        o = P['a'][..., 3] > 0; s = 0
        while s < S // 4 and o[s].mean() < 0.9: s += 1
        s = max(2, s)
        out = {}
        for k, t in P.items():
            if k == 'shake': continue
            c = overlap(t, s, top_edge=k in ('t', 'tl', 'tr'), bottom_edge=k in ('bot', 'bl', 'br'))
            out[k] = crisp(Image.fromarray(c), T, T)
        out = {k: seams(img) for k, img in out.items()}
        for k, img in out.items(): save(img, 'herbes', f'{theme}_{k}.png')
        # devant un personnage qui se tient dans l'herbe : le bas de la tuile pleine, découpé en pointes (la
        # silhouette du haut de la pièce « bord haut ») ; et l'image de l'herbe qui bouge
        a = np.array(out['a']); top = np.array(out['t']); H0 = 14
        front = a[H0:].copy(); n = 6
        front[:n, :, 3] = np.where(top[:n, :, 3] > 0, front[:n, :, 3], 0)
        save(Image.fromarray(front), 'herbes', f'{theme}_front.png')
        sh = np.array(crisp(Image.fromarray(P['shake']), T, T))[H0:]
        save(Image.fromarray(sh), 'herbes', f'{theme}_front2.png')
        meta[theme] = sorted(out)
        print('herbes', theme, 'case', S, 'px, pointes', s, 'px')
    META['herbes'] = meta

# ------------------------------------------------------------------ kits de façade (4 × 4 tuiles)
# rangées : mur, fenêtre, fenêtre de nuit, socle / porte, porte de nuit, linteau, côté /
#           toit, rebord, faîte, cheminée / enseigne gauche, enseigne droite, fleurs, lampe
KITS = {
    'maison': (1398, 30, 1612, 250), 'chalet': (1612, 30, 1825, 250), 'pecheur': (1398, 250, 1612, 458),
    'centre': (1615, 248, 1805, 445), 'boutique': (1393, 462, 1572, 642), 'arene': (1583, 462, 1762, 642),
    'ligue': (1393, 645, 1572, 822), 'labo': (1583, 645, 1762, 822), 'musee': (1393, 825, 1572, 1002),
    'base': (1583, 825, 1762, 1002), 'port': (1393, 1007, 1572, 1182), 'mirage': (1583, 1007, 1762, 1182),
    'phare': (1393, 1185, 1572, 1368), 'pagode': (1583, 1185, 1762, 1368),
}

def kit_tiles(x0, y0, x1, y1):
    """les 16 cases d'un kit : la boîte de ses pixels opaques coupée en 4 × 4 ; dans chaque case, le dessin
    (tuile pleine, ou objet plus petit : enseigne, lampe…)"""
    sub = OPAQUE[y0:y1, x0:x1]; ys, xs = np.nonzero(sub)
    X0, Y0, X1, Y1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
    cw, ch = (X1 - X0) / 4, (Y1 - Y0) / 4
    tiles = {}
    for j in range(4):
        for i in range(4):
            cx0, cy0 = int(round(X0 + i * cw)), int(round(Y0 + j * ch)); cx1, cy1 = int(round(X0 + (i + 1) * cw)), int(round(Y0 + (j + 1) * ch))
            o = OPAQUE[cy0:cy1, cx0:cx1]
            if o.sum() < 40: continue
            # le plus grand bloc de la case (un bout de la tuile voisine, au-delà d'un vide, ne compte pas)
            lab, n = ndimage.label(o)
            if n > 1:
                sz = ndimage.sum(o, lab, range(1, n + 1)); keep = np.isin(lab, [k + 1 for k in range(n) if sz[k] >= 0.15 * sz.max()])
                o = keep
            yy, xx = np.nonzero(o)
            b = (cx0 + xx.min(), cy0 + yy.min(), cx0 + xx.max() + 1, cy0 + yy.max() + 1)
            full = (b[2] - b[0]) >= 0.85 * cw and (b[3] - b[1]) >= 0.85 * ch
            tiles[(i, j)] = (b, full)
    return (cw + ch) / 2, tiles

def fill_holes(t, frac=0.9):
    """tuile presque pleine : les trous (traits de grille, liserés retirés) prennent la couleur du pixel opaque le plus proche"""
    a = np.array(t); op = a[..., 3] > 0
    if op.mean() < frac or op.all(): return t
    _, (iy, ix) = ndimage.distance_transform_edt(~op, return_indices=True)
    a[~op] = a[iy[~op], ix[~op]]; a[..., 3] = 255
    return Image.fromarray(a)

def do_kits():
    names = []
    for name, (x0, y0, x1, y1) in KITS.items():
        S, tiles = kit_tiles(x0, y0, x1, y1)
        kit = Image.new('RGBA', (4 * T, 4 * T))
        for (i, j), (b, full) in tiles.items():
            img = unpink(crop(b))
            if full:
                t = texture(img) if np.array(img)[..., 3].min() > 127 else crisp(img, T, T)
                t = fill_holes(t)
            else:
                # objet (enseigne, lampe, fleurs) : même échelle que les tuiles, posé en bas de sa case
                sc = T / S; w, h = max(1, round(img.width * sc)), max(1, round(img.height * sc))
                small = crisp(img, min(T, w), min(T, h)); t = Image.new('RGBA', (T, T))
                t.alpha_composite(small, ((T - small.width) // 2, T - small.height))
            kit.alpha_composite(t, (i * T, j * T))
        save(kit, 'facades', name + '.png'); names.append(name)
        print('kit', name, 'case', round(S), 'px,', len(tiles), 'cases')
    META['facades_v3'] = names

# ------------------------------------------------------------------ décor (parties 3 et 6) : sprites à la densité des
# tuiles du DS (16 pixels par case, chaque pixel fait 2 pixels à l'écran), comme dans HeartGold / SoulSilver
DECO = {
    'erable': (784, 373), 'cerisier': (759, 230), 'arbre_automne': (898, 230), 'panneau_bois': (741, 299), 'banc': (789, 302),
    'fontaine': (826, 299), 'gargouille': (857, 296), 'pilier_ball': (876, 297), 'caisse': (768, 334), 'tonneau': (788, 334),
    'borne': (806, 336), 'bouee': (823, 337), 'parasol': (845, 332), 'bateau': (885, 335), 'lanterne': (705, 378),
    'torii': (743, 356), 'stele': (809, 376), 'colonne': (827, 371), 'sanctuaire': (856, 374), 'cristal': (890, 377),
    'rocher_grand': (852, 263), 'butte': (898, 266),
    'machine_labo': (1001, 68), 'table_balls': (1058, 77), 'livres': (1101, 77), 'lampe_phare': (1143, 68), 'telescope': (1180, 76),
    'corde': (1211, 84), 'trone': (1000, 121), 'brasero': (1036, 126), 'statue_dragon': (1065, 121), 'console': (1105, 126),
    'ecran_carte': (1153, 124), 'cuve': (1190, 124), 'caisses': (1214, 126), 'cloche': (1004, 176), 'coussin': (1045, 190),
    'fossile': (1083, 183), 'squelette': (1169, 176),
}
DECO_SCALE = {'squelette': 0.75, 'cloche': 0.85, 'machine_labo': 0.85, 'lampe_phare': 0.85}

# objets vraiment violets (le coussin) : gardés tels quels
GARDE_VIOLET = {'coussin'}

def sans_violet(a):
    """Les planches générées ont été dessinées sur un fond magenta : l'ombre portée au pied des objets (bancs, arbres,
    fontaine…) et le liseré d'anticrénelage du contour en ont gardé la teinte, un violet sombre presque opaque (≈ #632169)
    que le seuil d'alpha ne retire pas. On retire ces pixels violets reliés au vide autour du dessin (le jeu pose sa
    propre ombre au sol) ; un violet à l'intérieur du dessin (coussin, cristal) est gardé."""
    r, g, b = (a[..., i].astype(int) for i in range(3))
    vide = a[..., 3] == 0
    violet = ~vide & (np.abs(r - b) <= 24) & (np.minimum(r, b) - g >= 28) & (np.maximum(r, b) <= 150)
    # violet relié au bord de l'image ou au vide, de proche en proche
    lab, n = ndimage.label(violet | vide)
    H, W = vide.shape
    dehors = set(np.unique(lab[vide])) - {0}
    dehors |= set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    ote = violet & np.isin(lab, list(dehors))
    a = a.copy(); a[ote, 3] = 0
    # puis le liseré : pixels un peu moins violets, au bord du dessin seulement (deux couches au plus)
    lache = (np.abs(r - b) <= 40) & (np.minimum(r, b) - g >= 22) & (np.maximum(r, b) <= 170)
    for _ in range(2):
        vide = a[..., 3] == 0
        bord = ndimage.binary_dilation(vide | np.pad(np.zeros((H - 2, W - 2), bool), 1, constant_values=True)) & ~vide
        a[bord & lache, 3] = 0
    return a

def pieds(a):
    """sans les rangées vides du bas : le sprite est posé par le bas de son image (ses pieds)"""
    rows = np.nonzero(a[..., 3].any(1))[0]
    return a[:rows.max() + 1] if len(rows) else a

def do_violet():
    """retire le violet des sprites de décor déjà découpés (odyssee/img/deco/, odyssee/img/nature/), sans les
    redécouper : le tileset a bougé depuis leur découpe, les redécouper changerait leurs cadrages"""
    import glob
    n = 0
    for f in sorted(glob.glob(os.path.join(OUT, 'deco', '*.png'))):
        a = np.array(Image.open(f).convert('RGBA'))
        b = a if os.path.basename(f)[:-4] in GARDE_VIOLET else sans_violet(a)
        b = pieds(b)
        k = int((a[..., 3] != b[..., 3]).sum()) if a.shape == b.shape else -1
        if k: Image.fromarray(b).save(f, optimize=True); n += 1; print('violet retiré :', os.path.basename(f), k if k > 0 else f'{a.shape[0] - b.shape[0]} rangées vides en bas', 'pixels' if k > 0 else '')
        META.setdefault('deco', {})[os.path.basename(f)[:-4]] = [b.shape[1], b.shape[0], 1]
    # arbres, rochers et plantes (planches « version 2 », odyssee-sprites.py) : quelques pixels du contour ont gardé la
    # teinte du fond magenta après la réduction ; ils prennent la couleur de leur voisin opaque, assombrie (contour)
    for f in sorted(glob.glob(os.path.join(OUT, 'nature', '*.png'))) + [os.path.join(OUT, 'mobilier', 'plant.png')]:
        a = np.array(Image.open(f).convert('RGBA')); r, g, b = (a[..., i].astype(int) for i in range(3))
        vide = a[..., 3] < 128
        violet = ~vide & (np.abs(r - b) <= 24) & (np.minimum(r, b) - g >= 28) & (np.maximum(r, b) <= 150) & ndimage.binary_dilation(vide)
        if not violet.any(): continue
        sain = ~vide & ~violet
        _, (iy, ix) = ndimage.distance_transform_edt(~sain, return_indices=True)
        a[violet, :3] = (a[iy[violet], ix[violet], :3].astype(int) * 0.7).astype(np.uint8)
        Image.fromarray(a).save(f, optimize=True); n += 1; print('contour violet recoloré :', os.path.relpath(f, OUT), int(violet.sum()), 'pixels')
    print(n, 'sprites nettoyés')

def do_deco():
    lab, _ = ndimage.label(ndimage.binary_closing(OPAQUE, iterations=2))
    objs = ndimage.find_objects(lab)
    meta = {}
    for k, (x, y) in DECO.items():
        # le point peut tomber dans un trou du dessin : le pixel opaque le plus proche
        best = None
        for r in range(0, 9):
            ys, xs = np.nonzero(lab[y - r:y + r + 1, x - r:x + r + 1])
            if len(ys): best = lab[y - r + ys[0], x - r + xs[0]]; break
        if not best: print('décor introuvable :', k); continue
        o = objs[best - 1]; b = (o[1].start, o[0].start, o[1].stop, o[0].stop)
        a = np.array(IM.crop(b)); r, g, bb = (a[..., i].astype(int) for i in range(3))
        a[((r > 180) & (bb > 180) & (g < 110)) | (a[..., 3] < 128), 3] = 0; a[a[..., 3] > 0, 3] = 255
        if k not in GARDE_VIOLET: a = pieds(sans_violet(a))
        img = Image.fromarray(a); sc = DECO_SCALE.get(k, 1.0)
        if sc != 1.0: img = crisp(img, max(1, round(img.width * sc)), max(1, round(img.height * sc)))
        save(img, 'deco', k + '.png'); meta[k] = [img.width, img.height, 1]
    META['deco'] = meta
    print('décor :', len(meta), 'éléments')

def write_meta():
    js = os.path.join(ROOT, 'odyssee', 'js', 'data', 'sprites.js')
    txt = open(js).read(); meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    if 'facades_v3' in META:
        meta['facades'] = sorted(set(meta.get('facades', [])) | set(META.pop('facades_v3')))
    meta.update(META)
    with open(js, 'w') as f:
        f.write('// Généré par tools/odyssee-sprites.py — ne pas modifier à la main.\n')
        f.write('export const SPRITES = ' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n')

if __name__ == '__main__':
    want = set(sys.argv[1:]) or {'sol', 'herbes', 'kits', 'deco'}
    if 'sol' in want: do_sol()
    if 'herbes' in want: do_herbes()
    if 'kits' in want: do_kits()
    if 'deco' in want: do_deco()
    if 'violet' in want: do_violet()
    write_meta()
