import os
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

W, H = 1200, 896
base_dir = Path(__file__).resolve().parent.parent
out_dir = base_dir / 'odyssee' / 'img' / 'carte'
out_dir.mkdir(parents=True, exist_ok=True)

def create_cgear_texture():
    """Generates an authentic 16-bit Nintendo DS C-Gear 5G chassis background texture."""
    arr = np.zeros((H, W, 3), dtype=np.float32)

    # Base palette: futuristic C-Gear deep obsidian & navy
    base = np.array([8, 14, 24], dtype=np.float32)
    weave = np.array([16, 26, 44], dtype=np.float32)
    high = np.array([0, 224, 255], dtype=np.float32)

    # 4x4 Carbon Weave pattern
    pattern = np.array([
        [0.0, 0.25, 0.75, 0.45],
        [0.25, 0.0, 0.45, 0.75],
        [0.75, 0.45, 0.0, 0.25],
        [0.45, 0.75, 0.25, 0.0],
    ], dtype=np.float32)
    tiled_weave = np.tile(pattern, (H // 4 + 1, W // 4 + 1))[:H, :W]

    # 4x4 Bayer Dithering matrix
    bayer = np.array([
        [ 0,  8,  2, 10],
        [12,  4, 14,  6],
        [ 3, 11,  1,  9],
        [15,  7, 13,  5]
    ], dtype=np.float32) / 16.0 - 0.5
    bayer_tiled = np.tile(bayer, (H // 4 + 1, W // 4 + 1))[:H, :W]

    # Coordinate grids
    y_coords, x_coords = np.ogrid[:H, :W]

    # Diagonal tech lighting
    diag = (x_coords / W * 0.4 + (1.0 - y_coords / H) * 0.6)

    # Radar sweep light beam across upper right
    beam_dist = np.abs((x_coords * 0.6 + y_coords * 0.8) - (W * 0.55))
    beam = np.exp(- (beam_dist ** 2) / (2 * (120.0 ** 2))) * 0.18

    for c in range(3):
        ch = base[c] + (weave[c] - base[c]) * tiled_weave
        ch = ch * (0.85 + 0.35 * diag) + (high[c] * beam)
        ch = ch + bayer_tiled * 6.0
        arr[:, :, c] = np.clip(ch, 0, 255)

    img = Image.fromarray(arr.astype(np.uint8), 'RGB')
    draw = ImageDraw.Draw(img)

    px = 3
    c = 28 # Corner chamfer size

    # Outer bezel chassis polygon
    outer_poly = [
        (c, 0), (W - 1 - c, 0),
        (W - 1, c), (W - 1, H - 1 - c),
        (W - 1 - c, H - 1), (c, H - 1),
        (0, H - 1 - c), (0, c)
    ]
    draw.polygon(outer_poly, outline=(4, 8, 14), width=px * 2)

    # Cyan electric border
    inner_poly = [
        (c + px, px), (W - 1 - c - px, px),
        (W - 1 - px, c + px), (W - 1 - px, H - 1 - c - px),
        (W - 1 - c - px, H - 1 - px), (c + px, H - 1 - px),
        (px, H - 1 - c - px), (px, c + px)
    ]
    draw.polygon(inner_poly, outline=(0, 224, 255), width=px)

    # Secondary deep blue pinstripe
    gap = 12
    sec_poly = [
        (c + gap, gap), (W - 1 - c - gap, gap),
        (W - 1 - gap, c + gap), (W - 1 - gap, H - 1 - c - gap),
        (W - 1 - c - gap, H - 1 - gap), (c + gap, H - 1 - gap),
        (gap, H - 1 - c - gap), (gap, c + gap)
    ]
    draw.polygon(sec_poly, outline=(2, 132, 199), width=2)

    # Top header plate area (accent shading)
    hdr_y0, hdr_y1 = 16, 86
    draw.rectangle([gap + 16, hdr_y0, W - 1 - gap - 16, hdr_y1], fill=(12, 22, 38), outline=(0, 180, 220), width=1)

    # Bottom footer plate area
    ftr_y0, ftr_y1 = H - 98, H - 20
    draw.rectangle([gap + 16, ftr_y0, W - 1 - gap - 16, ftr_y1], fill=(10, 18, 32), outline=(0, 180, 220), width=1)

    # Center Screen Aperture Frame (where the interactive map canvas sits)
    scr_x0, scr_y0 = gap + 24, hdr_y1 + 14
    scr_x1, scr_y1 = W - 1 - gap - 24, ftr_y0 - 14

    # Recessed dark display well
    draw.rectangle([scr_x0 - 4, scr_y0 - 4, scr_x1 + 4, scr_y1 + 4], fill=(4, 9, 16), outline=(0, 140, 180), width=2)
    draw.rectangle([scr_x0, scr_y0, scr_x1, scr_y1], fill=(6, 12, 22), outline=(0, 224, 255), width=2)

    # Subtle retro holographic radar grid inside screen well
    cx = (scr_x0 + scr_x1) // 2
    cy = (scr_y0 + scr_y1) // 2
    
    # Concentric faint radar rings
    for radius in [120, 240, 360, 480]:
        if radius < (scr_x1 - scr_x0) // 2:
            draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=(10, 32, 54), width=1)

    # Faint crosshair axes
    draw.line([scr_x0, cy, scr_x1, cy], fill=(12, 36, 60), width=1)
    draw.line([cx, scr_y0, cx, scr_y1], fill=(12, 36, 60), width=1)

    # Corner brackets with glowing cyan accents
    corner_sz = 40
    # Top-Left
    draw.line([(scr_x0, scr_y0), (scr_x0 + corner_sz, scr_y0)], fill=(0, 224, 255), width=3)
    draw.line([(scr_x0, scr_y0), (scr_x0 + corner_sz, scr_y0)], fill=(0, 224, 255), width=3)
    # Top-Right
    draw.line([(scr_x1, scr_y0), (scr_x1 - corner_sz, scr_y0)], fill=(0, 224, 255), width=3)
    draw.line([(scr_x1, scr_y0), (scr_x1, scr_y0 + corner_sz)], fill=(0, 224, 255), width=3)
    # Bottom-Left
    draw.line([(scr_x0, scr_y1), (scr_x0 + corner_sz, scr_y1)], fill=(0, 224, 255), width=3)
    draw.line([(scr_x0, scr_y1), (scr_x0, scr_y1 - corner_sz)], fill=(0, 224, 255), width=3)
    # Bottom-Right
    draw.line([(scr_x1, scr_y1), (scr_x1 - corner_sz, scr_y1)], fill=(0, 224, 255), width=3)
    draw.line([(scr_x1, scr_y1), (scr_x1, scr_y1 - corner_sz)], fill=(0, 224, 255), width=3)

    # Industrial DS rivets/screws in corners
    for sx, sy in [(c + 14, 18), (W - 1 - c - 14, 18), (c + 14, H - 22), (W - 1 - c - 14, H - 22)]:
        draw.ellipse([sx - 4, sy - 4, sx + 4, sy + 4], fill=(24, 40, 60), outline=(0, 224, 255), width=1)
        draw.line([sx - 2, sy, sx + 2, sy], fill=(120, 180, 220), width=1)

    # Side grip micro-notches (classic Nintendo DS ergonomics)
    for ny in range(hdr_y1 + 40, ftr_y0 - 40, 16):
        draw.line([6, ny, 14, ny], fill=(0, 140, 180), width=1)
        draw.line([W - 15, ny, W - 7, ny], fill=(0, 140, 180), width=1)

    return img

if __name__ == '__main__':
    img = create_cgear_texture()
    out_path = out_dir / 'c_gear_b2w2_bg.jpg'
    img.save(str(out_path), 'JPEG', quality=95)
    print(f'[OK] Generated clean C-Gear texture: {out_path} ({os.path.getsize(out_path)} bytes)')
