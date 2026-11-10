import os
import math
from PIL import Image, ImageDraw, ImageFilter

def make_c_gear_bg(path='arcadia/odyssee/img/carte/c_gear_b2w2_bg.jpg', w=1200, h=896):
    im = Image.new('RGB', (w, h), (10, 16, 28))
    draw = ImageDraw.Draw(im)

    # 1. Subtle carbon micro-weave
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            val = 12 if ((x // 4 + y // 4) % 2 == 0) else 16
            draw.point((x, y), fill=(val, val + 6, val + 18))

    # 2. Main Outer Console Bezel
    margin = 12
    draw.rectangle([margin, margin, w - margin, h - margin], outline=(20, 45, 75), width=2)
    draw.rectangle([margin + 2, margin + 2, w - margin - 2, h - margin - 2], outline=(35, 75, 120), width=2)

    # Corner brackets (B2W2 C-Gear style)
    c_len = 36
    for cx, cy, sx, sy in [
        (margin + 4, margin + 4, 1, 1),
        (w - margin - 4, margin + 4, -1, 1),
        (margin + 4, h - margin - 4, 1, -1),
        (w - margin - 4, h - margin - 4, -1, -1)
    ]:
        draw.line([(cx, cy), (cx + sx * c_len, cy)], fill=(0, 224, 255), width=3)
        draw.line([(cx, cy), (cx, cy + sy * c_len)], fill=(0, 224, 255), width=3)

    # 3. Top Digital Status Bar housing
    top_h = 58
    draw.rectangle([margin + 16, margin + 12, w - margin - 16, margin + top_h], fill=(12, 22, 38), outline=(28, 56, 92), width=1)
    # Tech lines across top
    for i in range(margin + 24, w - margin - 24, 16):
        draw.line([(i, margin + 16), (i + 8, margin + 16)], fill=(20, 50, 80), width=2)

    # 4. Main Display Recess (Left 70%) & Tactical Panel Recess (Right 30%)
    disp_top = margin + top_h + 12
    bot_h = 56
    disp_bot = h - margin - bot_h - 12
    split_x = int(w * 0.68)

    # Left Screen (Radar & World Map area)
    draw.rectangle([margin + 16, disp_top, split_x - 8, disp_bot], fill=(6, 12, 22), outline=(24, 52, 88), width=2)
    # Tactical blueprint grid inside screen
    for gy in range(disp_top + 16, disp_bot, 40):
        draw.line([(margin + 18, gy), (split_x - 10, gy)], fill=(10, 22, 38), width=1)
    for gx in range(margin + 36, split_x - 8, 40):
        draw.line([(gx, disp_top + 2), (gx, disp_bot - 2)], fill=(10, 22, 38), width=1)

    # Corner ticks for the screen
    for scx, scy, ssx, ssy in [
        (margin + 20, disp_top + 4, 1, 1),
        (split_x - 12, disp_top + 4, -1, 1),
        (margin + 20, disp_bot - 4, 1, -1),
        (split_x - 12, disp_bot - 4, -1, -1)
    ]:
        draw.line([(scx, scy), (scx + ssx * 16, scy)], fill=(0, 200, 255), width=2)
        draw.line([(scx, scy), (scx, scy + ssy * 16)], fill=(0, 200, 255), width=2)

    # Right Screen (Tactical Inspector housing)
    draw.rectangle([split_x + 8, disp_top, w - margin - 16, disp_bot], fill=(8, 16, 28), outline=(24, 52, 88), width=2)
    # Top header bar for inspector
    draw.rectangle([split_x + 10, disp_top + 2, w - margin - 18, disp_top + 34], fill=(14, 28, 48), outline=(32, 68, 110), width=1)

    # 5. Bottom Navigation / Controls Bar housing
    draw.rectangle([margin + 16, h - margin - bot_h, w - margin - 16, h - margin - 8], fill=(12, 22, 38), outline=(28, 56, 92), width=1)

    # 6. Status LEDs
    draw.ellipse([w - margin - 38, margin + 24, w - margin - 26, margin + 36], fill=(0, 224, 255), outline=(100, 255, 255))
    draw.ellipse([w - margin - 58, margin + 24, w - margin - 46, margin + 36], fill=(52, 211, 153), outline=(150, 255, 200))

    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'JPEG', quality=95)
    print(f"Generated clean C-Gear console frame: {path} ({w}x{h})")

def make_card_bg(theme, path, w=960, h=720):
    palette = {
        'normal': {
            'bg0': (10, 18, 32), 'bg1': (16, 28, 50), 'accent': (0, 180, 240),
            'border0': (24, 48, 80), 'border1': (40, 80, 130), 'sheen': (0, 200, 255)
        },
        'bronze': {
            'bg0': (28, 18, 12), 'bg1': (45, 28, 18), 'accent': (217, 119, 6),
            'border0': (70, 42, 24), 'border1': (120, 70, 36), 'sheen': (245, 158, 11)
        },
        'silver': {
            'bg0': (18, 24, 34), 'bg1': (30, 40, 54), 'accent': (148, 163, 184),
            'border0': (45, 60, 80), 'border1': (90, 115, 145), 'sheen': (226, 232, 240)
        },
        'gold': {
            'bg0': (32, 24, 10), 'bg1': (52, 40, 16), 'accent': (245, 158, 11),
            'border0': (80, 60, 24), 'border1': (140, 105, 36), 'sheen': (252, 211, 77)
        },
        'master': {
            'bg0': (18, 12, 32), 'bg1': (32, 18, 54), 'accent': (168, 85, 247),
            'border0': (55, 30, 90), 'border1': (110, 60, 170), 'sheen': (216, 180, 254)
        }
    }
    p = palette.get(theme, palette['normal'])
    im = Image.new('RGB', (w, h), p['bg0'])
    draw = ImageDraw.Draw(im)

    # 1. Diagonal gradient fill
    for y in range(h):
        r = y / h
        col = (
            int(p['bg0'][0] * (1 - r) + p['bg1'][0] * r),
            int(p['bg0'][1] * (1 - r) + p['bg1'][1] * r),
            int(p['bg0'][2] * (1 - r) + p['bg1'][2] * r),
        )
        draw.line([(0, y), (w, y)], fill=col)

    # 2. Micro carbon-weave texture
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            if (x // 4 + y // 4) % 2 == 0:
                draw.point((x, y), fill=(p['bg1'][0] + 8, p['bg1'][1] + 8, p['bg1'][2] + 12))

    # 3. Holographic angled sheen beam
    for offset in range(-100, 300, 80):
        for i in range(40):
            alpha = max(0, 1 - abs(i - 20) / 20.0)
            col = (
                int(min(255, p['sheen'][0] * 0.15 * alpha)),
                int(min(255, p['sheen'][1] * 0.15 * alpha)),
                int(min(255, p['sheen'][2] * 0.15 * alpha)),
            )
            x_start = offset + i * 2
            draw.line([(x_start, 0), (x_start + 400, h)], fill=col, width=2)

    # 4. Stylized watermark Pokéball in bottom-right
    cx, cy, rad = w - 160, h - 160, 110
    draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=(p['border1'][0], p['border1'][1], p['border1'][2]), width=3)
    draw.line([(cx - rad, cy), (cx + rad, cy)], fill=(p['border1'][0], p['border1'][1], p['border1'][2]), width=3)
    draw.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], fill=p['bg1'], outline=p['border1'], width=3)
    draw.ellipse([cx - 14, cy - 14, cx + 14, cy + 14], fill=p['accent'])

    # 5. Beveled Metallic Border
    m = 10
    draw.rectangle([m, m, w - m, h - m], outline=(0, 0, 0), width=3)
    draw.rectangle([m + 3, m + 3, w - m - 3, h - m - 3], outline=p['border0'], width=2)
    draw.rectangle([m + 5, m + 5, w - m - 5, h - m - 5], outline=p['border1'], width=1)

    # Corner brackets
    blen = 32
    for cx, cy, sx, sy in [
        (m + 8, m + 8, 1, 1),
        (w - m - 8, m + 8, -1, 1),
        (m + 8, h - m - 8, 1, -1),
        (w - m - 8, h - m - 8, -1, -1)
    ]:
        draw.line([(cx, cy), (cx + sx * blen, cy)], fill=p['accent'], width=3)
        draw.line([(cx, cy), (cx, cy + sy * blen)], fill=p['accent'], width=3)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'JPEG', quality=95)
    print(f"Generated clean card front: {path} ({theme})")

def make_card_back_case(path='arcadia/odyssee/img/card/card_back_case.jpg', w=960, h=720):
    im = Image.new('RGB', (w, h), (12, 14, 22))
    draw = ImageDraw.Draw(im)

    # Rich velvet texture
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            v = 12 if ((x // 2 + y // 2) % 2 == 0) else 16
            draw.point((x, y), fill=(v, v + 2, v + 8))

    # Outer metallic casing
    m = 12
    draw.rectangle([m, m, w - m, h - m], outline=(18, 32, 54), width=3)
    draw.rectangle([m + 3, m + 3, w - m - 3, h - m - 3], outline=(36, 64, 105), width=2)

    # Velvet badge recess trays
    # Tray 1: Nord (8 badges)
    tray1_y1, tray1_y2 = 80, 360
    draw.rectangle([m + 20, tray1_y1, w - m - 20, tray1_y2], fill=(8, 10, 16), outline=(28, 48, 76), width=2)

    # Tray 2: Sud (7 badges)
    tray2_y1, tray2_y2 = 380, 660
    draw.rectangle([m + 20, tray2_y1, w - m - 20, tray2_y2], fill=(8, 10, 16), outline=(28, 48, 76), width=2)

    # Corner gold rivets
    for cx, cy in [
        (m + 8, m + 8), (w - m - 8, m + 8),
        (m + 8, h - m - 8), (w - m - 8, h - m - 8)
    ]:
        draw.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(217, 119, 6), outline=(252, 211, 77))

    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'JPEG', quality=95)
    print(f"Generated clean card back case: {path}")

if __name__ == '__main__':
    make_c_gear_bg()
    for t in ['normal', 'bronze', 'silver', 'gold', 'master']:
        make_card_bg(t, f'arcadia/odyssee/img/card/card_front_{t}.jpg')
    make_card_bg('normal', 'arcadia/odyssee/img/card/card_front_base.jpg')
    make_card_back_case()
