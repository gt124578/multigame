#!/usr/bin/env python3
# Odyssée — PixelForge / pixel : petite boîte à outils pour dessiner du pixel art au pixel près (tableaux RGBA numpy).
# Lumière en haut à gauche, contour sombre teinté (pas de noir pur), rampes de couleurs du sombre au clair.
import numpy as np
from PIL import Image


def hexa(c):
    c = c.lstrip('#'); return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)] + [255], dtype=np.uint8)


def rampe(*cs):
    """une rampe de couleurs, du plus sombre au plus clair"""
    return [hexa(c) for c in cs]


class Toile:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), dtype=np.uint8)

    # --- primitives ---
    def p(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h and c is not None: self.a[y, x] = c

    def get(self, x, y):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h: return self.a[y, x]
        return np.zeros(4, np.uint8)

    def vide(self, x, y): return self.get(x, y)[3] == 0

    def rect(self, x0, y0, x1, y1, c):
        x0, x1 = max(0, int(x0)), min(self.w - 1, int(x1)); y0, y1 = max(0, int(y0)), min(self.h - 1, int(y1))
        if x1 >= x0 and y1 >= y0: self.a[y0:y1 + 1, x0:x1 + 1] = c

    def hline(self, x0, x1, y, c): self.rect(min(x0, x1), y, max(x0, x1), y, c)
    def vline(self, x, y0, y1, c): self.rect(x, min(y0, y1), x, max(y0, y1), c)

    def ligne(self, x0, y0, x1, y1, c):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0); sx = 1 if x0 < x1 else -1; sy = 1 if y0 < y1 else -1; e = dx + dy
        while True:
            self.p(x0, y0, c)
            if x0 == x1 and y0 == y1: break
            e2 = 2 * e
            if e2 >= dy: e += dy; x0 += sx
            if e2 <= dx: e += dx; y0 += sy

    def ellipse(self, cx, cy, rx, ry, c, plein=True):
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                d = ((x + .5 - cx) / max(rx, .5)) ** 2 + ((y + .5 - cy) / max(ry, .5)) ** 2
                if (d <= 1) if plein else (0.7 <= d <= 1): self.p(x, y, c)

    def poly(self, pts, c):
        """polygone plein (règle pair-impair, centres des pixels)"""
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            yc = y + .5; xs = []
            for i in range(len(pts)):
                (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
                if (y0 <= yc < y1) or (y1 <= yc < y0): xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for k in range(0, len(xs) - 1, 2):
                for x in range(int(np.ceil(xs[k] - .5)), int(np.floor(xs[k + 1] - .5)) + 1): self.p(x, y, c)

    def coller(self, autre, ox, oy):
        for y in range(autre.h):
            for x in range(autre.w):
                c = autre.a[y, x]
                if c[3]: self.p(ox + x, oy + y, c)

    # --- finitions ---
    def contour(self, c, diag=False):
        """contour d'un pixel autour de tout ce qui est dessiné"""
        m = self.a[..., 3] > 0; o = np.zeros_like(m)
        o[1:, :] |= m[:-1, :]; o[:-1, :] |= m[1:, :]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
        if diag: o[1:, 1:] |= m[:-1, :-1]; o[:-1, :-1] |= m[1:, 1:]; o[1:, :-1] |= m[:-1, 1:]; o[:-1, 1:] |= m[1:, :-1]
        self.a[o & ~m] = c

    def image(self): return Image.fromarray(self.a, 'RGBA')
    def save(self, path): self.image().save(path, optimize=True)


def bruit(x, y, graine=0):
    """bruit déterministe 0..1 par pixel"""
    n = (x * 374761393 + y * 668265263 + graine * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
def bayer(x, y): return (BAYER[y % 4][x % 4] + .5) / 16


def nuance(R, t, x=0, y=0, tramer=False):
    """couleur de la rampe R pour une valeur t (0 sombre … 1 clair), tramée entre deux crans"""
    t = min(max(t, 0), 1) * (len(R) - 1)
    i = int(t); f = t - i
    if tramer and i + 1 < len(R) and f > bayer(x, y): i += 1
    elif not tramer and f > .5 and i + 1 < len(R): i += 1
    return R[min(i, len(R) - 1)]


def planche(images, fond='#9cc48a', marge=8, colonnes=None, echelle=3, titres=None):
    """réunit des images (PIL) sur une planche de présentation, agrandie sans lissage"""
    colonnes = colonnes or len(images)
    lignes = (len(images) + colonnes - 1) // colonnes
    cw = max(im.width for im in images) + marge; ch = max(im.height for im in images) + marge
    P = Image.new('RGBA', (colonnes * cw + marge, lignes * ch + marge), fond)
    for i, im in enumerate(images):
        cx, cy = i % colonnes, i // colonnes
        P.alpha_composite(im, (marge + cx * cw + (cw - marge - im.width) // 2, marge + cy * ch + (ch - marge - im.height)))
    return P.resize((P.width * echelle, P.height * echelle), Image.NEAREST)


# ======================================================================================================================
# Volume, lumière et finitions : dessiner en relief plutôt qu'en aplats, puis finir comme les sprites du jeu
# (lumière en haut à gauche, rampes teintées, contour sélectif, pas de pixels orphelins). Voir demo2d.py.
# ======================================================================================================================
import colorsys


def rampe_teintee(base, n=5, ecart=0.42, teinte=0.06, sat=0.12):
    """rampe de n couleurs autour de `base`, du sombre au clair, avec glissement de teinte (« hue shift ») :
    les ombres tirent vers le bleu-violet et se saturent, les lumières vers le jaune et se désaturent un peu.
    C'est ce qui donne la chaleur du pixel art (une rampe qui ne fait qu'assombrir paraît grise et sale)."""
    r, g, b = [int(base.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    R = []
    for i in range(n):
        t = i / (n - 1) * 2 - 1                                  # -1 (ombre) … +1 (lumière)
        # ombre : vers le bleu-violet (0,7) ; lumière : vers le jaune (0,14) — par le plus court chemin du cercle
        cible = 0.7 if t < 0 else 0.14
        d = ((cible - h + 0.5) % 1) - 0.5
        hh = (h + d * min(abs(t) * teinte * 2.2, 0.5)) % 1
        ss = min(max(s + (-t) * sat * min(1, s * 3 + 0.15), 0), 1)
        vv = min(max(v * (1 + t * ecart * (0.55 if t > 0 else 1)), 0.04), 1)
        rr, gg, bb = colorsys.hsv_to_rgb(hh, ss, vv)
        R.append(np.array([round(rr * 255), round(gg * 255), round(bb * 255), 255], dtype=np.uint8))
    return R


def hauteur_bombee(masque, rayon=None, bruit_ampl=0.0, graine=0, echelle=6.0):
    """carte des hauteurs d'une forme plate (masque booléen) : un « coussin » qui monte depuis les bords
    (distance au bord, profil en quart de cercle), avec un bruit optionnel pour les matières organiques"""
    from scipy.ndimage import distance_transform_edt
    d = distance_transform_edt(masque)
    R = rayon or max(d.max(), 1)
    t = np.clip(d / R, 0, 1)
    h = np.sqrt(1 - (1 - t) ** 2) * R
    if bruit_ampl:
        H, W = masque.shape
        yy, xx = np.mgrid[0:H, 0:W]
        n = np.vectorize(lambda x, y: bruit(x, y, graine))((xx / echelle).astype(int), (yy / echelle).astype(int))
        from scipy.ndimage import zoom, gaussian_filter
        n = gaussian_filter(n.astype(float), echelle / 2)
        h = h + (n - n.mean()) * bruit_ampl * R
    return np.where(masque, h, 0)


def ombrer_relief(masque, h, R, lumiere=(-0.55, -0.75, 0.9), ao=0.5, tramer=False, plat=0.0):
    """colore une forme selon le relief h : normale tirée des pentes, éclairage de face (lumière en haut à gauche,
    comme le jeu), occlusion des creux (h plus bas que son voisinage), rampe R du sombre au clair.
    plat : part d'éclairage uniforme (0 = tout en volume). Renvoie un tableau RGBA."""
    from scipy.ndimage import gaussian_filter
    gy, gx = np.gradient(gaussian_filter(h, 0.7))
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    L = np.array(lumiere, dtype=float); L /= np.linalg.norm(L)     # vers la lumière : x à gauche (< 0), y en haut (< 0)
    e = np.clip(n @ L, 0, 1)
    e = plat + (1 - plat) * e
    if ao:
        creux = np.clip(gaussian_filter(h, 2.0) - h, 0, None)
        e = e - ao * creux / (creux.max() + 1e-6) * 0.6
    H, W = masque.shape
    out = np.zeros((H, W, 4), np.uint8)
    for y in range(H):
        for x in range(W):
            if masque[y, x]: out[y, x] = nuance(R, e[y, x], x, y, tramer)
    return out


def selout(a, f_ombre=0.32, f_lumiere=0.55, exterieur=True, lumiere_hg=True):
    """contour sélectif : chaque pixel de bord prend la couleur de l'intérieur, assombrie (et bleuie) —
    plus foncé du côté de l'ombre (bas, droite) que du côté de la lumière (haut, gauche).
    exterieur : le trait est ajouté autour de la forme (comme les sprites du jeu) ; sinon il remplace le bord."""
    a = a.copy(); H, W = a.shape[:2]; m = a[..., 3] > 0
    def sombre(c, f):
        return np.array([c[0] * f * 0.9, c[1] * f * 0.9, min(255, c[2] * f * 1.05 + 18 * (1 - f)), 255], np.uint8)
    out = a.copy()
    for y in range(H):
        for x in range(W):
            if exterieur:
                if m[y, x]: continue
                vois = [(x + dx, y + dy, dx, dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < W and 0 <= y + dy < H and m[y + dy, x + dx]]
                if not vois: continue
                # le pixel à l'extérieur, à droite ou en bas de la forme, est du côté de l'ombre
                cote_ombre = any(dx < 0 or dy < 0 for _, _, dx, dy in vois) if lumiere_hg else True
                cs = [a[yy, xx][:3].astype(float) for xx, yy, _, _ in vois]
                c = np.mean(cs, axis=0)
                out[y, x] = sombre(c, f_ombre * (0.8 if cote_ombre else 1.15))
            else:
                if not m[y, x]: continue
                bord = [(dx, dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if not (0 <= x + dx < W and 0 <= y + dy < H and m[y + dy, x + dx])]
                if bord: out[y, x] = sombre(a[y, x], f_ombre if any(dx > 0 or dy > 0 for dx, dy in bord) else f_lumiere)
    return out


def nettoyer(a, passes=2):
    """pixels orphelins : un pixel seul de sa couleur, entouré d'au moins trois voisins d'une même autre couleur,
    prend cette couleur ; puis lignes « pixel perfect » : un coin en L d'un trait d'un pixel est retiré"""
    a = a.copy(); H, W = a.shape[:2]
    key = lambda c: tuple(int(v) for v in c)
    for _ in range(passes):
        b = a.copy()
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if a[y, x, 3] == 0: continue
                c = key(a[y, x]); vs = [key(a[y + dy, x + dx]) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                if c in vs: continue
                for v in set(vs):
                    if vs.count(v) >= 3 and v[3] > 0: b[y, x] = v; break
        a = b
    return a


def reduire_palette(a, n=12, iterations=10):
    """palette réduite (k-moyennes pondérées par la luminance perçue) sur les pixels opaques"""
    m = a[..., 3] > 0; P = a[m][:, :3].astype(float)
    if len(P) <= n: return a
    lum = P @ np.array([0.299, 0.587, 0.114]); ordre = np.argsort(lum)
    C = P[ordre[((np.arange(n) + 0.5) / n * len(P)).astype(int)]]
    w = np.array([0.3, 0.59, 0.11])
    for _ in range(iterations):
        d = (((P[:, None, :] - C[None, :, :]) ** 2) * w).sum(2); lab = d.argmin(1)
        for k in range(n):
            if (lab == k).any(): C[k] = P[lab == k].mean(0)
    out = a.copy(); q = out[m]; q[:, :3] = np.round(C[lab]).astype(np.uint8); out[m] = q
    return out


def contraste(a, gain=1.6, centre=None):
    """écarte les valeurs de l'objet autour de leur médiane (un rendu 3D est souvent trop gris pour du pixel art) :
    les ombres se creusent, les lumières montent, la teinte moyenne ne bouge pas"""
    m = a[..., 3] > 0; P = a[m][:, :3].astype(float)
    lum = P @ np.array([0.299, 0.587, 0.114]); c = np.median(lum) if centre is None else centre
    cible = np.clip(c + (lum - c) * gain, 12, 250)
    k = (cible / np.maximum(lum, 1))[:, None]
    out = a.copy(); q = out[m]; q[:, :3] = np.clip(P * k, 0, 255).astype(np.uint8); out[m] = q
    return out


def depuis_3d(chemin, couleurs=12, trait=True, etirer=True):
    """sprite tiré d'un rendu de l'Atelier 3D (fond transparent : sol « Aucun ») : ombre portée retirée,
    valeurs étirées, palette réduite, pixels orphelins nettoyés, contour extérieur sélectif, recadré au plus juste"""
    a = np.array(Image.open(chemin).convert('RGBA'))
    a[a[..., 3] < 200] = 0                                       # l'ombre portée (semi-transparente) part : le jeu pose la sienne
    if etirer: a = contraste(a)
    a = reduire_palette(a, couleurs); a = nettoyer(a)
    if trait:
        a = np.pad(a, ((1, 1), (1, 1), (0, 0))); a = selout(a)
    ys, xs = np.nonzero(a[..., 3]); return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def apercu_jeu(sprites, sol='grass0', perso=True, echelle=3, marge=24, racine=None, densites=None):
    """met des sprites (tableaux RGBA ou chemins) sur le vrai sol du jeu, pieds alignés, avec le dresseur à côté
    pour l'échelle : c'est là qu'on juge si un objet est « intégré » (couleurs, contraste, contour, taille).
    densites : une par sprite (1 = 32 px par case, comme les décors ; 2 = 64 px par case, comme les personnages) ;
    l'aperçu est fait à 64 px par case dès qu'un sprite est à densité 2 (les autres agrandis ×2)."""
    import os
    racine = racine or os.path.join(os.path.dirname(__file__), '..', '..')
    densites = list(densites or [1] * len(sprites)); k = max(densites)
    tuile = Image.open(os.path.join(racine, 'odyssee/img/sol32', sol + '.png')).convert('RGBA')
    tuile = tuile.resize((32 * k, 32 * k), Image.NEAREST)
    ims = [Image.fromarray(s, 'RGBA') if isinstance(s, np.ndarray) else Image.open(s).convert('RGBA') for s in sprites]
    ims = [i.resize((i.width * k // d, i.height * k // d), Image.NEAREST) for i, d in zip(ims, densites)]
    if perso:
        p = Image.open(os.path.join(racine, 'odyssee/img/chars.png')).convert('RGBA').crop((64, 0, 128, 64))
        ims.insert(0, p if k == 2 else p.resize((32, 32), Image.NEAREST))   # personnage dessiné à densité 2
    marge *= k
    W = sum(i.width for i in ims) + marge * (len(ims) + 1); H = max(i.height for i in ims) + 2 * marge
    T = 32 * k; W, H = (W + T - 1) // T * T, (H + T - 1) // T * T
    P = Image.new('RGBA', (W, H))
    for x in range(0, W, T):
        for y in range(0, H, T): P.paste(tuile, (x, y))
    x = marge
    for i in ims:
        ombre = Image.new('RGBA', (i.width, max(4, i.width // 3)), (0, 0, 0, 0))
        from PIL import ImageDraw
        ImageDraw.Draw(ombre).ellipse((1, 0, i.width - 2, ombre.height - 1), fill=(10, 40, 20, 80))
        P.alpha_composite(ombre, (x, H - marge - ombre.height // 2 - 1))
        P.alpha_composite(i, (x, H - marge - i.height)); x += i.width + marge
    return P.resize((W * echelle, H * echelle), Image.NEAREST)
