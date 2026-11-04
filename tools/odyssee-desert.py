#!/usr/bin/env python3
"""tools/odyssee-desert.py — cactus du désert de la route 16 (densité 2, lumière en haut à gauche, contour sombre).
  python3 tools/odyssee-desert.py   → odyssee/img/nature/cactus.png, cactus2.png"""
import os
from PIL import Image
OUT = os.path.join(os.path.dirname(__file__), '..', 'odyssee', 'img', 'nature')
V = ['#16341c', '#245a2c', '#36803a', '#52a048', '#7cc062', '#b4e08a']
def hexa(c): return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)

def colonne(im, x0, y0, w, h):
    """bras de cactus arrondi : côtes verticales, piquants clairs"""
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            dx = (x - x0 - (w - 1) / 2) / (w / 2)
            top = y - y0 < w / 2 and (dx * dx + ((y - y0 - w / 2) / (w / 2)) ** 2) > 1
            if top: continue
            edge = abs(dx) > 0.82 or (y - y0 < w / 2 and (dx * dx + ((y - y0 - w / 2) / (w / 2)) ** 2) > 0.7)
            k = 0 if edge else 4 if dx < -0.35 else 3 if dx < 0.1 else 2
            if not edge and int((dx + 1) * 3) % 2 == 0 and k > 1: k -= 1
            if not edge and (y * 7 + x * 3) % 13 == 0: k = 5
            im.putpixel((x, y), hexa(V[k]))

def saguaro():
    im = Image.new('RGBA', (30, 50), (0, 0, 0, 0))
    colonne(im, 10, 2, 10, 48)
    colonne(im, 1, 14, 8, 16); colonne(im, 21, 8, 8, 16)
    for y in (24, 25, 26): 
        for x in range(4, 11): im.putpixel((x, y), hexa(V[2] if y == 25 else V[0]))
    for y in (18, 19, 20):
        for x in range(19, 26): im.putpixel((x, y), hexa(V[2] if y == 19 else V[0]))
    for x in (13, 14, 15): im.putpixel((x, 3), hexa('#f08aa0'))   # fleur
    return im

def tonneau():
    im = Image.new('RGBA', (26, 24), (0, 0, 0, 0))
    for y in range(24):
        for x in range(26):
            dx, dy = (x - 12.5) / 12.5, (y - 13) / 11
            q = dx * dx + dy * dy
            if q > 1: continue
            k = 0 if q > 0.8 else 4 if dx < -0.3 and dy < 0 else 3 if dx < 0.2 else 2
            if q <= 0.8 and int((dx + 1) * 4) % 2 == 0 and k > 1: k -= 1
            im.putpixel((x, y), hexa(V[k]))
    # piquants : petits points clairs en rangées sur les côtes
    for y in range(4, 22, 3):
        for x in range(3, 23, 4):
            if im.getpixel((x, y))[3] and im.getpixel((x, y))[:3] != hexa(V[0])[:3]: im.putpixel((x, y), hexa('#f4f0d0'))
    # fleurs jaunes au sommet
    for x, y in [(10, 2), (11, 1), (12, 2), (13, 1), (14, 2), (12, 0)]: im.putpixel((x, y), hexa('#f6d050'))
    im.putpixel((12, 1), hexa('#e07020'))
    return im

if __name__ == '__main__':
    saguaro().save(os.path.join(OUT, 'cactus.png')); tonneau().save(os.path.join(OUT, 'cactus2.png')); print('cactus écrits')
