import os
from PIL import Image, ImageEnhance
import numpy as np

card_dir = 'arcadia/odyssee/img/card'
os.makedirs(card_dir, exist_ok=True)

im_front = Image.open(f'{card_dir}/card_front_base.jpg')

# 1. Normal (Bleu standard)
im_front.save(f'{card_dir}/card_front_normal.jpg', quality=95)

# 2. Bronze (+35 hue, légèrement plus chaud)
im_hsv = im_front.convert('HSV')
h, s, v = im_hsv.split()
np_h = np.array(h, dtype=np.int16)
np_s = np.array(s, dtype=np.int16)

# Bronze
h_bronze = ((np_h + 115) % 256).astype(np.uint8)
s_bronze = np.clip(np_s * 1.1, 0, 255).astype(np.uint8)
bronze_img = Image.merge('HSV', (Image.fromarray(h_bronze), Image.fromarray(s_bronze), v)).convert('RGB')
bronze_img.save(f'{card_dir}/card_front_bronze.jpg', quality=95)

# Silver (Désaturé, métallique)
silver_enh = ImageEnhance.Color(im_front)
silver_img = silver_enh.enhance(0.18)
silver_bright = ImageEnhance.Brightness(silver_img).enhance(1.1)
silver_bright.save(f'{card_dir}/card_front_silver.jpg', quality=95)

# Gold (Doré flamboyant)
h_gold = ((np_h + 135) % 256).astype(np.uint8)
s_gold = np.clip(np_s * 1.3, 0, 255).astype(np.uint8)
gold_img = Image.merge('HSV', (Image.fromarray(h_gold), Image.fromarray(s_gold), v)).convert('RGB')
gold_img = ImageEnhance.Brightness(gold_img).enhance(1.08)
gold_img.save(f'{card_dir}/card_front_gold.jpg', quality=95)

# Master / Platinum (Noir profond avec liserés violets/cyan)
h_master = ((np_h - 40) % 256).astype(np.uint8)
s_master = np.clip(np_s * 1.15, 0, 255).astype(np.uint8)
master_img = Image.merge('HSV', (Image.fromarray(h_master), Image.fromarray(s_master), v)).convert('RGB')
master_img = ImageEnhance.Contrast(master_img).enhance(1.15)
master_img.save(f'{card_dir}/card_front_master.jpg', quality=95)

print('All 5 card rank backgrounds generated successfully!')
