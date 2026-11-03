#!/usr/bin/env python3
# Odyssée — PixelForge / bâtiments : propositions de design (maison, centre de soins, boutique, arène) en pixel art,
# vue 3/4 façon HeartGold / SoulSilver, à la densité du décor (32 px par case). Lumière en haut à gauche.
#
#   python3 tools/pixelforge/batiments.py out/   → batiments_planche.png (chaque bâtiment, ×3) et batiments_scene.png
import os, sys, math
import numpy as np
from PIL import Image

def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
OUT = rgb('#241a1e')            # contour

def h(x, y, s=0):
    v = (x * 374761393 + y * 668265263 + s * 974711) & 0xFFFFFFFF
    v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 0xFFFFFFFF) / 4294967296

class Toile:
    def __init__(self, w, hh): self.w, self.h = w, hh; self.a = np.zeros((hh, w, 4), np.uint8)
    def p(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h: self.a[y, x] = c
    def rect(self, x0, y0, x1, y1, c):
        for y in range(max(0, y0), min(self.h, y1 + 1)):
            for x in range(max(0, x0), min(self.w, x1 + 1)): self.a[y, x] = c
    def hl(self, x0, x1, y, c): self.rect(x0, y, x1, y, c)
    def vl(self, x, y0, y1, c): self.rect(x, y0, x, y1, c)
    def box(self, x0, y0, x1, y1, fill, light=None, dark=None, out=OUT):
        self.rect(x0, y0, x1, y1, out); self.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill)
        if light: self.hl(x0 + 1, x1 - 1, y0 + 1, light); self.vl(x0 + 1, y0 + 1, y1 - 1, light)
        if dark: self.hl(x0 + 1, x1 - 1, y1 - 1, dark); self.vl(x1 - 1, y0 + 2, y1 - 1, dark)
    def img(self): return Image.fromarray(self.a, 'RGBA')

# ------------------------------------------------------------------ éléments communs -----------------------------
def toit_tuiles(T, x0, y0, x1, y1, R, ridge=True, seed=0, over=4):
    """toit à deux pans vu de face (pan avant) : tuiles écailles en rangées décalées, faîtage, rive claire, débord"""
    xa, xb = x0 - over, x1 + over
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        ins = int((1 - t) * 6)                       # le haut du toit est un peu plus étroit (perspective)
        for x in range(xa + ins, xb - ins + 1):
            row = (y - y0) // 7; ly = (y - y0) % 7
            off = 5 if row % 2 else 0
            lx = (x + off - xa) % 10
            k = 2
            if ly == 0: k = 3                         # haut de la rangée, éclairé
            if ly >= 5: k = 1                         # bas de la tuile, ombré
            if lx == 9 and ly < 6: k = 1              # séparation des tuiles
            if ly >= 4 and (lx == 0 or lx == 8) or ly == 5 and lx in (1, 7): k = 0   # bas arrondi des écailles
            if ly == 1 and lx in (2, 3): k = 4         # reflet
            if ly == 6: k = 0                         # ombre sous la rangée
            if h(x // 10 + off, row, seed) < 0.12 and 0 < ly < 5: k = min(4, k + 1)     # tuiles plus claires çà et là
            if x - (xa + ins) < 3: k = min(4, k + 1)  # rive gauche éclairée
            if (xb - ins) - x < 3: k = max(0, k - 1)
            T.p(x, y, R[k])
        T.p(xa + ins, y, OUT); T.p(xb - ins, y, OUT)
    T.hl(xa + 6, xb - 6, y0, OUT)
    if ridge:                                         # faîtage
        T.hl(xa + 6, xb - 6, y0 + 1, R[4]); T.hl(xa + 6, xb - 6, y0 + 2, R[3]); T.hl(xa + 7, xb - 7, y0 + 3, R[0])
    T.hl(xa, xb, y1, OUT); T.hl(xa + 1, xb - 1, y1 - 1, R[0])
    return xa, xb

def toit_plat(T, x0, y0, x1, y1, R, band=None):
    """toit plat à rebord (centre, boutique, arène) : dalle vue de dessus avec nervures, bandeau de façade en dessous"""
    T.box(x0, y0, x1, y1, R[2], R[3], R[1])
    for y in range(y0 + 1, y1):                       # dégradé : le haut de la dalle, plus loin, plus clair
        f = (y - y0) / max(1, y1 - y0)
        for x in range(x0 + 1, x1):
            if f < 0.25 and (x + y) % 2 == 0 or f < 0.12: T.p(x, y, R[3])
            elif f > 0.8 and ((x + y) % 2 == 0 or f > 0.9): T.p(x, y, R[1])
    for x in range(x0 + 6, x1 - 3, 12):
        T.vl(x, y0 + 3, y1 - 4, R[1]); T.vl(x + 1, y0 + 3, y1 - 4, R[3])
    T.hl(x0 + 2, x1 - 2, y0 + 2, R[4])
    if band:
        T.box(x0 - 2, y1, x1 + 2, y1 + 7, band[2], band[3], band[1])

def mur_enduit(T, x0, y0, x1, y1, Wc, seed=0):
    """mur enduit : aplat, grain discret, ombre portée du toit en haut, soubassement de pierres"""
    T.rect(x0, y0, x1, y1, Wc[2])
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            u = h(x, y, seed + 1)
            if u < 0.05: T.p(x, y, Wc[1])
            elif u > 0.97: T.p(x, y, Wc[3])
    T.rect(x0, y0, x1, y0 + 3, Wc[1]); T.hl(x0, x1, y0 + 4, Wc[1] if True else Wc[2])
    for y in range(y0 + 5, y0 + 7):
        for x in range(x0, x1 + 1):
            if (x + y) % 2 == 0: T.p(x, y, Wc[1])
    T.vl(x0, y0, y1, OUT); T.vl(x1, y0, y1, OUT)

def soubassement(T, x0, x1, y0, y1, S):
    T.rect(x0, y0, x1, y1, S[1])
    x = x0 + 1
    row = 0
    for y in range(y0 + 1, y1, 5):
        x = x0 + 1 + (3 if row % 2 else 0)
        while x < x1:
            w = 6 + int(h(x, y, 3) * 4)
            T.box(x, y, min(x1 - 1, x + w), min(y1 - 1, y + 4), S[2 + int(h(x, y, 4) * 1.6)], S[4], S[1], out=S[0])
            x += w + 1
        row += 1
    T.hl(x0, x1, y1, OUT); T.vl(x0, y0, y1, OUT); T.vl(x1, y0, y1, OUT)

GLASS = [rgb('#1e2c48'), rgb('#36507a'), rgb('#5a7cb0'), rgb('#9cc0e8'), rgb('#e8f4ff')]
def fenetre(T, x0, y0, w, hh, F, croix=True, volets=None, jardiniere=None):
    T.box(x0 - 2, y0 - 2, x0 + w + 1, y0 + hh + 1, F[2], F[3], F[1])            # cadre
    for y in range(y0, y0 + hh):
        for x in range(x0, x0 + w):
            t = (y - y0) / hh
            T.p(x, y, GLASS[1] if t > 0.6 else GLASS[2])
    for k in range(min(w, hh)):                                                    # reflet en diagonale
        if 0 <= k + 2 < w: T.p(x0 + k + 2, y0 + hh - 1 - k, GLASS[3])
        if 0 <= k + 4 < w: T.p(x0 + k + 4, y0 + hh - 1 - k, GLASS[4])
    T.hl(x0, x0 + w - 1, y0, GLASS[0])
    if croix:
        T.vl(x0 + w // 2, y0, y0 + hh - 1, F[2]); T.hl(x0, x0 + w - 1, y0 + hh // 2, F[2])
    if volets:
        for vx in (x0 - 9, x0 + w + 2):
            T.box(vx, y0 - 2, vx + 6, y0 + hh + 1, volets[2], volets[3], volets[1])
            for y in range(y0, y0 + hh, 3): T.hl(vx + 1, vx + 5, y, volets[1])
    if jardiniere:
        T.box(x0 - 3, y0 + hh + 2, x0 + w + 2, y0 + hh + 6, F[1], F[2], F[0])
        for x in range(x0 - 2, x0 + w + 2):
            if h(x, 7, 9) < 0.7: T.p(x, y0 + hh + 1, rgb('#3c8c3c'))
            if h(x, 8, 9) < 0.35: T.p(x, y0 + hh, jardiniere[int(h(x, 9, 9) * len(jardiniere))])

def porte_bois(T, cx, y1, w, hh, Wd, vitre=True):
    x0, y0 = cx - w // 2, y1 - hh
    T.box(x0 - 2, y0 - 2, x0 + w + 1, y1, Wd[1], Wd[2], Wd[0])
    for x in range(x0, x0 + w):
        for y in range(y0, y1):
            T.p(x, y, Wd[3] if (x - x0) % 5 == 0 else Wd[2])
    T.hl(x0, x0 + w - 1, y0, Wd[4])
    if vitre:
        T.box(x0 + 3, y0 + 4, x0 + w - 4, y0 + 11, GLASS[2], GLASS[3], GLASS[1])
    T.p(x0 + w - 4, y0 + hh // 2 + 2, rgb('#f0d060')); T.p(x0 + w - 4, y0 + hh // 2 + 3, rgb('#a07820'))
    # marche
    T.box(x0 - 4, y1, x0 + w + 3, y1 + 3, rgb('#a49a8a'), rgb('#cfc6b6'), rgb('#7a7266'))

def ombre_sol(T, x0, x1, y):
    for x in range(x0, x1 + 1):
        for d in range(4):
            if (x + d) % 2 == 0 or d < 2: T.p(x + 3, y + d, (20, 40, 28, 110))

# ------------------------------------------------------------------ bâtiments -------------------------------------
def maison(toit='#c8483c', mur='#f2e6c8', seed=1):
    W, H = 160, 168
    T = Toile(W, H)
    R = [rgb(c) for c in ramp_from(toit)]
    Wc = [rgb(c) for c in ramp_from(mur, 0.10)]
    Wd = [rgb(c) for c in ['#3e2618', '#6a4228', '#8e5c36', '#a8744a', '#c8945e']]
    S = [rgb(c) for c in ['#3a3634', '#6e6862', '#8a847c', '#a29c92', '#c4bdb2']]
    # cheminée derrière le toit
    T.box(112, 4, 126, 30, rgb('#9a4a36'), rgb('#c06a50'), rgb('#6e3224'))
    for y in range(8, 30, 4):
        T.hl(113, 125, y, rgb('#6e3224'))
        for x in range(113 + (4 if (y // 4) % 2 else 0), 126, 8): T.vl(x, y, y + 3, rgb('#6e3224'))
    T.box(110, 2, 128, 7, rgb('#5a5552'), rgb('#7e7874'), rgb('#3e3a38'))
    toit_tuiles(T, 14, 14, 146, 92, R, seed=seed)
    # lucarne au milieu du toit
    T.box(66, 34, 94, 64, Wc[2], Wc[3], Wc[1])
    fenetre(T, 72, 42, 16, 14, Wd)
    for y in range(26, 36):
        hw = (y - 26) * 1.7
        T.hl(int(80 - hw), int(80 + hw), y, R[3 if y < 30 else 2]); T.p(int(80 - hw), y, OUT); T.p(int(80 + hw), y, OUT)
    T.hl(62, 98, 35, OUT)
    mur_enduit(T, 14, 93, 146, 150, Wc, seed)
    # colombages d'angle
    for x in (14, 144):
        T.rect(x, 93, x + 2, 150, Wd[2]); T.vl(x, 93, 150, OUT)
    soubassement(T, 14, 146, 150, 160, S)
    fenetre(T, 30, 108, 22, 18, Wd, volets=[rgb(c) for c in ramp_from(toit)][1:] + [rgb('#000000')], jardiniere=[rgb('#f05a6a'), rgb('#f8d850'), rgb('#fafaf2')])
    fenetre(T, 112, 108, 22, 18, Wd, volets=[rgb(c) for c in ramp_from(toit)][1:] + [rgb('#000000')], jardiniere=[rgb('#7aa0f8'), rgb('#fafaf2')])
    porte_bois(T, 80, 160, 20, 36, Wd)
    # lanterne à côté de la porte
    T.box(96, 118, 101, 126, rgb('#f8e8a0'), rgb('#fff8d8'), rgb('#d8b858')); T.hl(95, 102, 117, OUT); T.vl(98, 114, 117, OUT)
    # boîte aux lettres
    T.box(4, 140, 12, 147, rgb('#c83c3c'), rgb('#e86a5a'), rgb('#8a2424')); T.vl(8, 148, 163, rgb('#5a3a22'))
    ombre_sol(T, 14, 146, 161)
    return T.img()

def centre():
    W, H = 200, 168
    T = Toile(W, H)
    R = [rgb(c) for c in ['#6e1c22', '#a02c30', '#d0403c', '#e8685a', '#f6a08a']]
    Wc = [rgb(c) for c in ['#8c8e96', '#c6c8d0', '#eceef2', '#ffffff', '#ffffff']]
    toit_plat(T, 8, 20, 192, 74, R, band=[rgb(c) for c in ['#8c8e96', '#c6c8d0', '#f4f4f6', '#ffffff']])
    # enseigne : rond blanc à croix rouge au-dessus du toit
    cx, cy, r = 100, 22, 16
    for y in range(cy - r - 1, cy + r + 2):
        for x in range(cx - r - 1, cx + r + 2):
            d = math.hypot(x - cx + 0.5, y - cy + 0.5)
            if d <= r + 0.5: T.p(x, y, OUT if d > r - 1 else rgb('#ffffff') if (x - cx) + (y - cy) < 6 else rgb('#e4e6ec'))
    T.rect(cx - 3, cy - 10, cx + 2, cy + 9, rgb('#d8343a')); T.rect(cx - 10, cy - 3, cx + 9, cy + 2, rgb('#d8343a'))
    T.vl(cx - 3, cy - 10, cy - 3, rgb('#f07068')); T.hl(cx - 10, cx - 3, cy - 3, rgb('#f07068'))
    mur_enduit(T, 10, 83, 190, 150, Wc, 5)
    # bande rouge en bas du mur
    T.rect(10, 140, 190, 146, R[2]); T.hl(10, 190, 140, R[3]); T.hl(10, 190, 146, R[0])
    # baies vitrées
    for x0 in (22, 140):
        T.box(x0 - 2, 94, x0 + 39, 128, Wc[1], Wc[3], Wc[0])
        for y in range(96, 127):
            for x in range(x0, x0 + 38):
                T.p(x, y, GLASS[2] if y < 112 else GLASS[1])
        for k in range(30): T.p(x0 + 6 + k, 126 - k, GLASS[3]) if 96 <= 126 - k else None
        T.vl(x0 + 18, 96, 126, Wc[1]); T.hl(x0, x0 + 37, 111, Wc[1])
    # portes vitrées coulissantes et auvent
    T.box(76, 92, 124, 150, rgb('#8c8e96'), rgb('#c6c8d0'), rgb('#5c5e66'))
    for half in (78, 101):
        for y in range(96, 150):
            for x in range(half, half + 21):
                T.p(x, y, GLASS[2] if y < 120 else GLASS[1])
        for k in range(18): T.p(half + 3 + k, 146 - k * 2, GLASS[3])
        T.vl(half + 20, 96, 149, rgb('#5c5e66'))
    T.box(70, 84, 130, 92, R[2], R[3], R[0])
    soubassement(T, 10, 190, 150, 158, [rgb(c) for c in ['#3a3634', '#8a8c94', '#a8aab2', '#c4c6cc', '#e2e4e8']])
    T.box(72, 150, 128, 156, rgb('#c8c0b0'), rgb('#e8e2d6'), rgb('#9a9284'))
    ombre_sol(T, 10, 190, 159)
    return T.img()

def boutique():
    W, H = 168, 168
    T = Toile(W, H)
    R = [rgb(c) for c in ['#1a2e6a', '#284a9c', '#3a68c8', '#5c8ce0', '#9cbcf2']]
    Wc = [rgb(c) for c in ['#8a8478', '#c4bca8', '#ece4d0', '#fbf6ea', '#ffffff']]
    toit_plat(T, 8, 16, 160, 66, R, band=[rgb(c) for c in ['#1a2e6a', '#284a9c', '#3a68c8', '#5c8ce0']])
    # enseigne : sac de courses blanc sur fond bleu
    T.box(60, 24, 108, 52, R[1], R[3], R[0])
    T.box(74, 32, 94, 49, rgb('#ffffff'), rgb('#ffffff'), rgb('#c8d4ec'))
    for x in range(78, 91):
        y = 32 - int(4 * math.sin((x - 78) / 12 * math.pi)); T.p(x, y, rgb('#ffffff')); T.p(x, y - 1, OUT)
    T.hl(77, 91, 39, R[2])
    mur_enduit(T, 10, 75, 158, 150, Wc, 9)
    # store rayé au-dessus de la vitrine
    for x in range(14, 92):
        for y in range(80, 92):
            T.p(x, y, rgb('#3a68c8') if ((x - 14) // 6) % 2 == 0 else rgb('#f4f4f6'))
        yb = 92 + (2 if (x - 14) % 6 < 3 else 0)
        T.vl(x, 92, yb, rgb('#3a68c8') if ((x - 14) // 6) % 2 == 0 else rgb('#f4f4f6'))
    T.hl(14, 91, 79, OUT); T.hl(14, 91, 80, R[3])
    # vitrine : étagères et marchandises colorées
    T.box(16, 96, 90, 134, Wc[1], Wc[3], Wc[0])
    for y in range(98, 133):
        for x in range(18, 89): T.p(x, y, GLASS[1] if y > 118 else GLASS[2])
    COLS = ['#e24a4a', '#f6d84a', '#7aa0f8', '#7acc6a', '#f08ac0', '#f8a040', '#ffffff']
    for sy in (108, 122, 132):
        T.hl(18, 88, sy, rgb('#8e5c36')); T.hl(18, 88, sy + 1, rgb('#5a3a22'))
        x = 20
        while x < 86:
            c = rgb(COLS[int(h(x, sy, 2) * len(COLS))]); w, hh = 3 + int(h(x, sy, 3) * 3), 4 + int(h(x, sy, 4) * 4)
            T.rect(x, sy - hh, x + w - 1, sy - 1, c); T.vl(x, sy - hh, sy - 1, OUT if h(x, sy, 5) < 0.3 else c)
            x += w + 1 + int(h(x, sy, 6) * 2)
    for k in range(24): T.p(30 + k, 132 - k, GLASS[3])
    # porte vitrée
    T.box(104, 92, 146, 150, rgb('#6e7480'), rgb('#a8aeb8'), rgb('#4c525c'))
    for half in (106, 126):
        for y in range(95, 150):
            for x in range(half, half + 19): T.p(x, y, GLASS[2] if y < 120 else GLASS[1])
        for k in range(16): T.p(half + 3 + k, 146 - k * 2, GLASS[3])
    T.box(100, 84, 150, 91, R[2], R[3], R[0])
    soubassement(T, 10, 158, 150, 158, [rgb(c) for c in ['#3a3634', '#6e6862', '#8a847c', '#a29c92', '#c4bdb2']])
    # caisse de pommes devant la vitrine
    T.box(24, 142, 44, 156, rgb('#a8744a'), rgb('#c8945e'), rgb('#6a4228'))
    for x in range(26, 43, 3): T.box(x, 139, x + 3, 142, rgb('#e24a4a'), rgb('#f88a7a'), rgb('#a02c3a'), out=rgb('#7a1c22'))
    ombre_sol(T, 10, 158, 159)
    return T.img()

def arene(accent='#e07030'):
    W, H = 264, 208
    T = Toile(W, H)
    A = [rgb(c) for c in ramp_from(accent)]
    R = [rgb(c) for c in ['#262a36', '#3a4050', '#4e5668', '#687288', '#8c96aa']]
    St = [rgb(c) for c in ['#4a4640', '#8a847a', '#b0aa9e', '#cec8bc', '#ece6da']]
    # toit en gradins : grande dalle sombre, bordure à la couleur de l'arène, faîtage
    toit_tuiles(T, 12, 28, 252, 94, R, seed=4, over=6)
    T.box(4, 94, 260, 100, A[2], A[3], A[1])
    toit_plat(T, 56, 6, 208, 34, R)
    for x in range(64, 204, 16): T.box(x, 12, x + 8, 22, A[2], A[3], A[1])          # créneaux décoratifs
    # médaillon (badge en losange) au-dessus de la porte
    cx, cy = 132, 56
    for y in range(cy - 22, cy + 23):
        for x in range(cx - 22, cx + 23):
            d = abs(x - cx) + abs(y - cy)
            if d <= 22: T.p(x, y, OUT if d > 20 else A[3] if (x - cx) + (y - cy) < -4 else A[2] if d > 12 else St[4])
    for y in range(cy - 9, cy + 10):
        for x in range(cx - 9, cx + 10):
            d = abs(x - cx) + abs(y - cy)
            if d <= 9: T.p(x, y, A[1] if d > 7 else A[2] if (x - cx) + (y - cy) > 0 else A[4])
    # façade de pierre de taille
    T.rect(8, 101, 256, 168, St[2])
    for y in range(101, 168):
        row = (y - 101) // 8
        for x in range(8, 257):
            lx = (x + (8 if row % 2 else 0)) % 16
            if (y - 101) % 8 == 7 or lx == 15: T.p(x, y, St[1])
            elif (y - 101) % 8 == 0 or lx == 0: T.p(x, y, St[3])
            elif h(x // 16, row, 7) < 0.25: T.p(x, y, St[3] if (x + y) % 3 else St[2])
    T.rect(8, 101, 256, 105, St[1]); T.vl(8, 101, 168, OUT); T.vl(256, 101, 168, OUT)
    # colonnes
    for x0 in (24, 72, 176, 224):
        T.box(x0, 104, x0 + 16, 168, St[3], St[4], St[1])
        for x in range(x0 + 4, x0 + 14, 4): T.vl(x, 110, 164, St[2])
        T.box(x0 - 3, 100, x0 + 19, 106, St[3], St[4], St[1]); T.box(x0 - 3, 164, x0 + 19, 170, St[3], St[4], St[1])
    # grande porte à deux battants sous un arc
    x0, x1, yt, yb = 108, 156, 112, 168
    for y in range(yt - 14, yb + 1):
        for x in range(x0 - 6, x1 + 7):
            dx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2 + 6)
            top = yt - 14 * math.sqrt(max(0, 1 - dx * dx))
            if y >= top: T.p(x, y, A[2] if y < top + 5 else St[1])
    for y in range(yt - 8, yb):
        for x in range(x0, x1):
            dx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2)
            top = yt - 8 * math.sqrt(max(0, 1 - dx * dx))
            if y >= top:
                k = 2 if (x - x0) % 6 else 1
                T.p(x, y, [rgb('#3e2618'), rgb('#5a3a22'), rgb('#7a4e2c')][k])
    T.vl((x0 + x1) // 2, yt - 8, yb - 1, rgb('#2a1a10'))
    for x in ((x0 + x1) // 2 - 5, (x0 + x1) // 2 + 4): T.rect(x, 140, x + 1, 143, rgb('#f0d060'))
    # bannières à la couleur de l'arène
    for bx in (50, 202):
        T.box(bx, 108, bx + 12, 146, A[2], A[3], A[1])
        for y in range(146, 152): T.hl(bx + (y - 146), bx + 12 - (y - 146), y, A[2])
        T.box(bx + 3, 116, bx + 9, 122, St[4], St[4], A[1])
    # marches
    for k, y in enumerate((168, 173, 178)):
        T.box(96 - k * 6, y, 168 + k * 6, y + 5, St[3], St[4], St[1])
    # torches
    for tx in (92, 166):
        T.box(tx, 120, tx + 6, 132, rgb('#5a5552'), rgb('#7e7874'), rgb('#3e3a38'))
        T.rect(tx + 1, 112, tx + 5, 119, rgb('#f8a040')); T.rect(tx + 2, 108, tx + 4, 113, rgb('#f8e070')); T.p(tx + 3, 106, rgb('#fff8d8'))
    ombre_sol(T, 8, 256, 184)
    return T.img()

def ramp_from(hexc, k=0.16):
    """5 tons (ombre → clair) autour d'une couleur"""
    r, g, b = (int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    def m(f):
        if f < 0: return tuple(int(v * (1 + f)) for v in (r, g, b))
        return tuple(int(v + (255 - v) * f) for v in (r, g, b))
    return ['#%02x%02x%02x' % m(f) for f in (-0.55, -0.28, 0, k * 2, k * 4)]

# ------------------------------------------------------------------ planche et scène ------------------------------
def scene(out):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import terrain2 as T2
    # sol : herbe, place pavée, chemin
    G = ['GRASS'] * 30
    grid = [list(G) for _ in range(16)]
    for y in range(9, 12):
        for x in range(1, 29): grid[y][x] = 'PAVE'
    for y in range(12, 16):
        for x in (14, 15): grid[y][x] = 'PATH'
    t = np.array([[T2.T[c] for c in row] for row in grid])
    cv, img = T2.render(t, 200, 300, 32, 5)
    base = Image.fromarray(T2.RGB[img]).convert('RGBA')
    pos = [(maison('#c8483c'), 0, 4), (maison('#3a68c8', '#efe4cc', 2), 5, 4), (centre(), 10, 4), (boutique(), 16.5, 4), (arene(), 22, 3)]
    for im, cx, cy in pos:
        base.alpha_composite(im, (int(cx * 32), 300 - im.height))
    big = base.resize((base.width * 2, base.height * 2), Image.NEAREST)
    chars = Image.open(os.path.join(T2.ROOT, 'odyssee', 'img', 'chars.png')).convert('RGBA')
    for k, (row, x, y) in enumerate(((0, 14.5, 9.6), (5, 11.6, 9.3), (1, 19.2, 10.2), (6, 6.2, 9.4))):
        sp = chars.crop((0, row * 64, 64, row * 64 + 64))
        big.alpha_composite(sp, (int(x * 64), int(y * 64)))
    big.save(os.path.join(out, 'batiments_scene.png'))

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    ims = [maison(), maison('#3a68c8', '#efe4cc', 2), maison('#4a9a4a', '#f4ecd8', 3), centre(), boutique(), arene(), arene('#3a8ce0')]
    z = 3; pad = 16
    W = sum(im.width * z + pad for im in ims[:4]) + pad
    H2 = max(im.height for im in ims) * z * 2 + pad * 3
    sheet = Image.new('RGBA', (max(W, sum(im.width * z + pad for im in ims[4:]) + pad), H2), (116, 196, 96, 255))
    x = pad
    for im in ims[:4]: sheet.alpha_composite(im.resize((im.width * z, im.height * z), Image.NEAREST), (x, pad)); x += im.width * z + pad
    x = pad; y2 = pad * 2 + max(im.height for im in ims[:4]) * z
    for im in ims[4:]: sheet.alpha_composite(im.resize((im.width * z, im.height * z), Image.NEAREST), (x, y2)); x += im.width * z + pad
    sheet.save(os.path.join(out, 'batiments_planche.png'))
    scene(out)
    print('ok')
