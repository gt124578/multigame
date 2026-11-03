#!/usr/bin/env python3
# Odyssée — PixelForge : pixel art écrit en texte → PNG exact (1 caractère = 1 pixel, alpha réel).
#
#   python3 tools/pixelforge/render.py tools/pixelforge/tiles/nature.pf            → PNG par tuile dans out/
#   python3 tools/pixelforge/render.py fichier.pf --out odyssee/img/sol32 --preview
#
# Format d'un fichier .pf (voir tiles/nature.pf) :
#   palette                      bloc de palette, réutilisable par toutes les tuiles qui suivent
#     . = transparent
#     g = #58b858
#   tile herbe 32x32             début d'une tuile (taille attendue, vérifiée)
#     repeat 2x2                 (option) la grille qui suit est répétée pour atteindre la taille
#     base g                     (option) dans cette tuile, « . » vaut g (fond opaque, plus lisible)
#     gggggggg gggggggg           lignes de la grille, un caractère par pixel (les espaces sont ignorés)
#     ...
#   derive rivage_S = flipv rivage_N      tuile dérivée : flipv, fliph, rot90, rot180, rot270
#   derive coin_NE  = fliph coin_NW
#
# Prérequis : pip install pillow
import os, sys, re
from PIL import Image

def parse_color(s):
    s = s.strip()
    if s in ('transparent', 'none', '-'): return (0, 0, 0, 0)
    m = re.fullmatch(r'#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?', s)
    if not m: raise ValueError(f'couleur invalide : {s}')
    rgb = tuple(int(m.group(1)[i:i+2], 16) for i in (0, 2, 4))
    a = int(m.group(2), 16) if m.group(2) else 255
    return rgb + (a,)

def parse(path):
    palette, tiles, order = {}, {}, []
    cur = None      # (nom, w, h, repeat, lignes)
    base = [None]   # « base X » : dans la tuile courante, « . » vaut X (fond opaque)
    mode = None
    def flush():
        nonlocal cur
        if not cur: return
        name, w, h, rep, rows = cur
        rw, rh = rep
        bw, bh = w // rw, h // rh
        if len(rows) != bh or any(len(r) != bw for r in rows):
            raise ValueError(f'{name} : grille attendue {bw}x{bh}, reçu {[len(r) for r in rows]} ({len(rows)} lignes)')
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        px = im.load()
        for y in range(h):
            for x in range(w):
                c = rows[y % bh][x % bw]
                if c not in palette: raise ValueError(f'{name} : caractère « {c} » absent de la palette')
                px[x, y] = palette[c]
        tiles[name] = im; order.append(name); cur = None
    for ln in open(path, encoding='utf-8'):
        line = ln.rstrip('\n')
        s = line.strip()
        if not s or s.startswith('#'):
            continue
        if s == 'palette':
            flush(); mode = 'palette'; continue
        m = re.fullmatch(r'tile\s+(\S+)\s+(\d+)x(\d+)', s)
        if m:
            flush(); mode = 'tile'
            cur = (m.group(1), int(m.group(2)), int(m.group(3)), (1, 1), []); base[0] = None
            continue
        m = re.fullmatch(r'derive\s+(\S+)\s*=\s*(flipv|fliph|rot90|rot180|rot270)\s+(\S+)', s)
        if m:
            flush(); mode = None
            name, op, src = m.groups()
            if src not in tiles: raise ValueError(f'derive {name} : tuile source « {src} » inconnue')
            im = tiles[src]
            im = {'flipv': lambda i: i.transpose(Image.FLIP_TOP_BOTTOM),
                  'fliph': lambda i: i.transpose(Image.FLIP_LEFT_RIGHT),
                  'rot90': lambda i: i.transpose(Image.ROTATE_90),
                  'rot180': lambda i: i.transpose(Image.ROTATE_180),
                  'rot270': lambda i: i.transpose(Image.ROTATE_270)}[op](im)
            tiles[name] = im; order.append(name)
            continue
        if mode == 'palette':
            k, v = s.split('=', 1)
            k = k.strip()
            if len(k) != 1: raise ValueError(f'clé de palette « {k} » : un seul caractère')
            palette[k] = parse_color(v)
        elif mode == 'tile':
            m = re.fullmatch(r'repeat\s+(\d+)x(\d+)', s)
            mb = re.fullmatch(r'base\s+(\S)', s)
            if m:
                cur = cur[:3] + ((int(m.group(1)), int(m.group(2))),) + (cur[4],)
            elif mb:
                base[0] = mb.group(1)
            else:
                s = s.replace(' ', '')   # les espaces servent à aérer la grille en groupes de 8
                cur[4].append(s.replace('.', base[0]) if base[0] else s)
        else:
            raise ValueError(f'ligne inattendue : {line}')
    flush()
    return [(n, tiles[n]) for n in order]

def preview(tiles, path, zoom=6, cols=8, bg=(44, 44, 52, 255)):
    """planche de contrôle : tuiles agrandies en nearest-neighbor, sur fond neutre"""
    if not tiles: return
    tw = max(im.width for _, im in tiles); th = max(im.height for _, im in tiles)
    rows = (len(tiles) + cols - 1) // cols
    pad = 4
    sheet = Image.new('RGBA', (cols * (tw * zoom + pad) + pad, rows * (th * zoom + pad) + pad), bg)
    for i, (_, im) in enumerate(tiles):
        big = im.resize((im.width * zoom, im.height * zoom), Image.NEAREST)
        x = pad + (i % cols) * (tw * zoom + pad); y = pad + (i // cols) * (th * zoom + pad)
        sheet.paste(big, (x, y), big)
    sheet.save(path)

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args: print(__doc__); sys.exit(1)
    out = 'out'; do_prev = False; files = []
    i = 0
    while i < len(args):
        if args[i] == '--out': out = args[i + 1]; i += 2
        elif args[i] == '--preview': do_prev = True; i += 1
        else: files.append(args[i]); i += 1
    os.makedirs(out, exist_ok=True)
    for f in files:
        tiles = parse(f)
        for name, im in tiles:
            im.save(os.path.join(out, name + '.png'))
        if do_prev:
            p = os.path.join(out, os.path.splitext(os.path.basename(f))[0] + '_preview.png')
            preview(tiles, p)
        print(f'{f} : {len(tiles)} tuiles → {out}/')
