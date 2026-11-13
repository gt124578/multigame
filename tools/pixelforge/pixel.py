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
