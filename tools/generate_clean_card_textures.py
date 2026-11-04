import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 960, 720
card_dir = 'arcadia/odyssee/img/card'
os.makedirs(card_dir, exist_ok=True)

def create_carbon_weave(width, height, base_color, weave_color, highlight_color):
    """Creates an authentic 16-bit pixel-art carbon weave texture with Bayer dithering."""
    arr = np.zeros((height, width, 3), dtype=np.float32)
    base = np.array(base_color, dtype=np.float32)
    weave = np.array(weave_color, dtype=np.float32)
    high = np.array(highlight_color, dtype=np.float32)

    # 4x4 Carbon Weave pattern (standard Nintendo DS / B2W2 hi-tech texture)
    pattern = np.array([
        [0.0, 0.2, 0.7, 0.4],
        [0.2, 0.0, 0.4, 0.7],
        [0.7, 0.4, 0.0, 0.2],
        [0.4, 0.7, 0.2, 0.0],
    ], dtype=np.float32)

    tiled = np.tile(pattern, (height // 4 + 1, width // 4 + 1))[:height, :width]
    
    # 4x4 Bayer Dithering Matrix for retro 16-bit gradient
    bayer = np.array([
        [ 0,  8,  2, 10],
        [12,  4, 14,  6],
        [ 3, 11,  1,  9],
        [15,  7, 13,  5]
    ], dtype=np.float32) / 16.0 - 0.5
    bayer_tiled = np.tile(bayer, (height // 4 + 1, width // 4 + 1))[:height, :width]

    # Diagonal lighting gradient from top-left to bottom-right
    y_coords, x_coords = np.ogrid[:height, :width]
    diag = (x_coords / width * 0.45 + (1.0 - y_coords / height) * 0.55)
    
    # Subtle holographic sweeping beam (35 degrees)
    beam_dist = np.abs((x_coords * 0.7 + y_coords * 0.5) - (width * 0.45))
    beam = np.exp(- (beam_dist ** 2) / (2 * (80.0 ** 2))) * 0.25

    for c in range(3):
        # Blend base and weave according to carbon pattern
        channel = base[c] + (weave[c] - base[c]) * tiled
        # Add diagonal lighting and beam
        channel = channel * (0.8 + 0.4 * diag) + (high[c] * beam)
        # Apply subtle pixel dithering
        channel = channel + bayer_tiled * 8.0
        arr[:, :, c] = np.clip(channel, 0, 255)

    return arr.astype(np.uint8)

def draw_chassis_frame(img, border_color, glow_color, accent_color):
    """Draws crisp beveled chassis borders and chamfered DS corners on the image."""
    draw = ImageDraw.Draw(img)
    px = 3 # Pixel-art grid thickness

    # Chamfered corner coordinates (cut 24px off each corner)
    c = 24
    outer_poly = [
        (c, 0), (W - 1 - c, 0),
        (W - 1, c), (W - 1, H - 1 - c),
        (W - 1 - c, H - 1), (c, H - 1),
        (0, H - 1 - c), (0, c)
    ]

    # Outer border (dark outline)
    draw.polygon(outer_poly, outline=(10, 14, 20), width=px * 2)

    # Inner metallic bevel
    inner_poly = [
        (c + px, px), (W - 1 - c - px, px),
        (W - 1 - px, c + px), (W - 1 - px, H - 1 - c - px),
        (W - 1 - c - px, H - 1 - px), (c + px, H - 1 - px),
        (px, H - 1 - c - px), (px, c + px)
    ]
    draw.polygon(inner_poly, outline=border_color, width=px)

    # Secondary high-tech pinstripe inside
    gap = 14
    sec_poly = [
        (c + gap, gap), (W - 1 - c - gap, gap),
        (W - 1 - gap, c + gap), (W - 1 - gap, H - 1 - c - gap),
        (W - 1 - c - gap, H - 1 - gap), (c + gap, H - 1 - gap),
        (gap, H - 1 - c - gap), (gap, c + gap)
    ]
    draw.polygon(sec_poly, outline=accent_color, width=1)

    # Decorative tech corner brackets (classic B2W2 DS aesthetic)
    corner_len = 36
    # Top-Left
    draw.line([(c + gap, gap), (c + gap + corner_len, gap)], fill=glow_color, width=2)
    draw.line([(gap, c + gap), (gap, c + gap + corner_len)], fill=glow_color, width=2)
    # Top-Right
    draw.line([(W - 1 - c - gap, gap), (W - 1 - c - gap - corner_len, gap)], fill=glow_color, width=2)
    draw.line([(W - 1 - gap, c + gap), (W - 1 - gap, c + gap + corner_len)], fill=glow_color, width=2)
    # Bottom-Left
    draw.line([(c + gap, H - 1 - gap), (c + gap + corner_len, H - 1 - gap)], fill=glow_color, width=2)
    draw.line([(gap, H - 1 - c - gap), (gap, H - 1 - c - gap - corner_len)], fill=glow_color, width=2)
    # Bottom-Right
    draw.line([(W - 1 - c - gap, H - 1 - gap), (W - 1 - c - gap - corner_len, H - 1 - gap)], fill=glow_color, width=2)
    draw.line([(W - 1 - gap, H - 1 - c - gap), (W - 1 - gap, H - 1 - c - gap - corner_len)], fill=glow_color, width=2)

    return img

# -----------------------------------------------------------------------------
# Generate Front Card Backgrounds for all 5 Prestige Themes
# -----------------------------------------------------------------------------
THEMES = {
    'normal': {
        'base': (14, 22, 34),
        'weave': (24, 38, 56),
        'high': (45, 110, 180),
        'border': (60, 95, 140),
        'glow': (0, 215, 255),
        'accent': (25, 55, 90)
    },
    'bronze': {
        'base': (28, 18, 12),
        'weave': (48, 30, 20),
        'high': (180, 105, 50),
        'border': (150, 90, 50),
        'glow': (255, 160, 60),
        'accent': (75, 45, 25)
    },
    'silver': {
        'base': (20, 24, 30),
        'weave': (38, 44, 54),
        'high': (160, 180, 210),
        'border': (130, 145, 170),
        'glow': (210, 230, 255),
        'accent': (60, 70, 85)
    },
    'gold': {
        'base': (32, 24, 10),
        'weave': (54, 42, 18),
        'high': (220, 175, 50),
        'border': (190, 150, 45),
        'glow': (255, 215, 80),
        'accent': (85, 68, 25)
    },
    'master': {
        'base': (16, 12, 28),
        'weave': (30, 22, 50),
        'high': (155, 70, 230),
        'border': (130, 60, 200),
        'glow': (0, 240, 255),
        'accent': (65, 35, 105)
    }
}

for name, cfg in THEMES.items():
    raw = create_carbon_weave(W, H, cfg['base'], cfg['weave'], cfg['high'])
    img = Image.fromarray(raw, 'RGB')
    img = draw_chassis_frame(img, cfg['border'], cfg['glow'], cfg['accent'])
    out_path = f'{card_dir}/card_front_{name}.jpg'
    img.save(out_path, 'JPEG', quality=95)
    print(f'[OK] Generated clean chassis: {out_path} ({os.path.getsize(out_path)} bytes)')

# Also save base front
raw_base = create_carbon_weave(W, H, THEMES['normal']['base'], THEMES['normal']['weave'], THEMES['normal']['high'])
img_base = Image.fromarray(raw_base, 'RGB')
img_base = draw_chassis_frame(img_base, THEMES['normal']['border'], THEMES['normal']['glow'], THEMES['normal']['accent'])
img_base.save(f'{card_dir}/card_front_base.jpg', 'JPEG', quality=95)

# -----------------------------------------------------------------------------
# Generate Back Card Background (Face B: Velvet Badge Case)
# -----------------------------------------------------------------------------
def create_velvet_casing():
    """Generates a luxurious quilted sapphire velvet badge case with brass trims."""
    arr = np.zeros((H, W, 3), dtype=np.float32)
    
    # Sapphire Velvet base colors
    base = np.array([8, 16, 32], dtype=np.float32)
    velvet_high = np.array([22, 45, 85], dtype=np.float32)
    gold_trim = (200, 165, 65)
    dark_gold = (110, 85, 30)

    # Quilted diamond pattern (32x32 diamonds)
    y_coords, x_coords = np.ogrid[:H, :W]
    diamond = np.abs((x_coords % 32) - 16) + np.abs((y_coords % 32) - 16) # 0 to 32
    diamond_factor = (diamond / 32.0) ** 1.6

    # Soft radial spotlight in the center of the case
    center_dist = np.sqrt(((x_coords - W/2) / (W/2))**2 + ((y_coords - H/2) / (H/2))**2)
    spotlight = np.clip(1.25 - center_dist * 0.75, 0.4, 1.3)

    for c in range(3):
        val = base[c] + (velvet_high[c] - base[c]) * diamond_factor
        val = val * spotlight
        arr[:, :, c] = np.clip(val, 0, 255)

    img = Image.fromarray(arr.astype(np.uint8), 'RGB')
    draw = ImageDraw.Draw(img)

    # Ornate case border with brass/gold bevel
    c = 24
    outer_poly = [
        (c, 0), (W - 1 - c, 0),
        (W - 1, c), (W - 1, H - 1 - c),
        (W - 1 - c, H - 1), (c, H - 1),
        (0, H - 1 - c), (0, c)
    ]
    draw.polygon(outer_poly, outline=(12, 10, 8), width=6)
    
    inner_poly = [
        (c + 4, 4), (W - 1 - c - 4, 4),
        (W - 1 - 4, c + 4), (W - 1 - 4, H - 1 - c - 4),
        (W - 1 - c - 4, H - 1 - 4), (c + 4, H - 1 - 4),
        (4, H - 1 - c - 4), (4, c + 4)
    ]
    draw.polygon(inner_poly, outline=gold_trim, width=3)

    # Second inner border
    inner2_poly = [
        (c + 12, 12), (W - 1 - c - 12, 12),
        (W - 1 - 12, c + 12), (W - 1 - 12, H - 1 - c - 12),
        (W - 1 - c - 12, H - 1 - 12), (c + 12, H - 1 - 12),
        (12, H - 1 - c - 12), (12, c + 12)
    ]
    draw.polygon(inner2_poly, outline=dark_gold, width=2)

    # Brass corner brackets
    for (cx, cy) in [(c+12, 12), (W-1-c-12, 12), (c+12, H-1-12), (W-1-c-12, H-1-12)]:
        draw.ellipse([cx-4, cy-4, cx+4, cy+4], fill=gold_trim, outline=(15, 12, 6))

    return img

back_img = create_velvet_casing()
back_path = f'{card_dir}/card_back_case.jpg'
back_img.save(back_path, 'JPEG', quality=95)
print(f'[OK] Generated clean velvet case: {back_path} ({os.path.getsize(back_path)} bytes)')

# Also copy into artifact directory for consistency
artifact_dir = r'C:/Users/ameti/.gemini/antigravity/brain/df0f98b4-2cf7-4e3b-92b9-0e675f35e8d0'
if os.path.exists(artifact_dir):
    img_base.save(os.path.join(artifact_dir, 'card_front_base.jpg'), quality=95)
    back_img.save(os.path.join(artifact_dir, 'card_back_case.jpg'), quality=95)

print('All clean 16-bit pixel-art textures generated and saved!')
