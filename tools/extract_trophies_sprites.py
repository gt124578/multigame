import os
from PIL import Image
import numpy as np
from collections import deque

def remove_outer_white(im, tol=25):
    im = im.convert('RGBA')
    w, h = im.size
    arr = np.array(im)
    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    
    # Add borders
    for x in range(w):
        for y in (0, h - 1):
            if np.all(arr[y, x, :3] >= 255 - tol):
                q.append((x, y))
                visited[y, x] = True
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y, x] and np.all(arr[y, x, :3] >= 255 - tol):
                q.append((x, y))
                visited[y, x] = True
                
    while q:
        cx, cy = q.popleft()
        arr[cy, cx, 3] = 0
        for dx, dy in ((-1,0), (1,0), (0,-1), (0,1)):
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx]:
                if np.all(arr[ny, nx, :3] >= 255 - tol):
                    visited[ny, nx] = True
                    q.append((nx, ny))
                    
    return Image.fromarray(arr)

def auto_crop_alpha(im):
    arr = np.array(im)
    alpha = arr[:, :, 3]
    rows = np.where(np.any(alpha > 0, axis=1))[0]
    cols = np.where(np.any(alpha > 0, axis=0))[0]
    if len(rows) and len(cols):
        return im.crop((cols[0], rows[0], cols[-1] + 1, rows[-1] + 1))
    return im

def pixelate_down(im, max_h=64):
    w, h = im.size
    aspect = w / h
    th = min(h, max_h)
    tw = max(1, int(round(th * aspect)))
    # Downscale smoothly, then quantize/keep crisp
    down = im.resize((tw, th), Image.Resampling.LANCZOS)
    return down

brain_dir = r'C:\Users\ameti\.gemini\antigravity\brain\df0f98b4-2cf7-4e3b-92b9-0e675f35e8d0'
out_dir = r'arcadia\odyssee\img\trophies'
os.makedirs(out_dir, exist_ok=True)

# 1. Medals (Bronze, Silver, Gold, Platinum)
med_src = os.path.join(brain_dir, 'pokemon_b2w2_trophy_medals_pixel_art_1793744058283.jpg')
med_im = Image.open(med_src)
medal_segs = [
    ('medal_bronze', (17, 151, 328, 581)),
    ('medal_silver', (361, 151, 672, 581)),
    ('medal_gold', (705, 151, 1015, 581)),
    ('medal_platinum', (1048, 151, 1359, 581))
]

for name, box in medal_segs:
    crop = med_im.crop(box)
    trans = remove_outer_white(crop, tol=25)
    clean = auto_crop_alpha(trans)
    clean.save(os.path.join(out_dir, f'{name}.png'))
    # Also save standard 64px height thumbnail
    thumb = pixelate_down(clean, max_h=64)
    thumb.save(os.path.join(out_dir, f'{name}_64.png'))
    print(f'Saved {name}.png ({clean.size}) and {name}_64.png ({thumb.size})')

# 2. Medal Box
box_src = os.path.join(brain_dir, 'medal_box_sprite_1793744059808.jpg')
box_im = Image.open(box_src)
box_crop = box_im.crop((30, 87, 993, 926))
box_trans = remove_outer_white(box_crop, tol=25)
box_clean = auto_crop_alpha(box_trans)
box_clean.save(os.path.join(out_dir, 'box.png'))
box_thumb = pixelate_down(box_clean, max_h=120)
box_thumb.save(os.path.join(out_dir, 'box_120.png'))
print(f'Saved box.png ({box_clean.size}) and box_120.png ({box_thumb.size})')

# 3. Win streak Crown
crown_src = os.path.join(brain_dir, 'winstreak_crown_sprite_1793744063345.jpg')
cr_im = Image.open(crown_src)
cr_crop = cr_im.crop((132, 102, 891, 891))
cr_trans = remove_outer_white(cr_crop, tol=25)
cr_clean = auto_crop_alpha(cr_trans)
cr_clean.save(os.path.join(out_dir, 'streak_crown.png'))
cr_thumb = pixelate_down(cr_clean, max_h=48)
cr_thumb.save(os.path.join(out_dir, 'streak_crown_48.png'))
print(f'Saved streak_crown.png ({cr_clean.size}) and streak_crown_48.png ({cr_thumb.size})')

print('All trophy sprites successfully extracted and generated!')
