import os
from PIL import Image, ImageEnhance
import numpy as np

os.makedirs('arcadia/odyssee/img/bag', exist_ok=True)

# 1. Copier / enregistrer le sac sur piédestal HD
im_bag = Image.open(r'C:\Users\ameti\.gemini\antigravity\brain\df0f98b4-2cf7-4e3b-92b9-0e675f35e8d0\b2w2_backpack_pedestal_hd_1793700527949.jpg')
im_bag.save('arcadia/odyssee/img/bag/backpack_base.jpg', quality=95)

# Générer les 6 variantes de couleur de l'aura du sac pour chaque poche
# 0: Objets (Cyan - base), 1: Soins (Vert), 2: Balls (Rouge), 3: CT (Violet), 4: Baies (Rose), 5: Clés (Or)
HUE_SHIFTS = {
    'objets': 0,       # Cyan (base)
    'soin': 85,        # Vert
    'balls': 175,      # Rouge
    'ct': -60,         # Violet
    'baies': -95,      # Rose
    'cles': 130,       # Or / Jaune
}

im_hsv = im_bag.convert('HSV')
h, s, v = im_hsv.split()
np_h = np.array(h, dtype=np.int16)

for name, shift in HUE_SHIFTS.items():
    new_h = ((np_h + shift) % 256).astype(np.uint8)
    h_chan = Image.fromarray(new_h, mode='L')
    tinted = Image.merge('HSV', (h_chan, s, v)).convert('RGB')
    tinted.save(f'arcadia/odyssee/img/bag/backpack_{name}.jpg', quality=95)

# 2. Découper les 6 icônes de poches depuis b2w2_pocket_icons_set_1793700545501.jpg
im_icons = Image.open(r'C:\Users\ameti\.gemini\antigravity\brain\df0f98b4-2cf7-4e3b-92b9-0e675f35e8d0\b2w2_pocket_icons_set_1793700545501.jpg')
# L'image est en 3 colonnes x 3 lignes (taille environ 1024x1024)
w, h = im_icons.size
col_w = w / 3
row_h = h / 3

# Positions (col, row):
# Row 0: Bourse (Objets), Flacon (Soins), Ball (Balls)
# Row 1: CD (CT/CS), Baie (Baies), Clé (Objets Rares)
POCKET_COORDS = {
    'objets': (0, 0),
    'soin': (1, 0),
    'balls': (2, 0),
    'ct': (0, 1),
    'baies': (1, 1),
    'cles': (2, 1),
}

for name, (c, r) in POCKET_COORDS.items():
    x1 = int(c * col_w + col_w * 0.05)
    y1 = int(r * row_h + row_h * 0.05)
    x2 = int((c + 1) * col_w - col_w * 0.05)
    y2 = int((r + 1) * row_h - row_h * 0.05)
    crop_icon = im_icons.crop((x1, y1, x2, y2))
    crop_icon.save(f'arcadia/odyssee/img/bag/icon_{name}.png')

# 3. Récupérer l'arc des poches depuis concept 1
im_concept1 = Image.open(r'C:\Users\ameti\.gemini\antigravity\brain\df0f98b4-2cf7-4e3b-92b9-0e675f35e8d0\bag_concept_1_classic_b2w2_1793694761622.jpg')
arc_crop = im_concept1.crop((350, 95, 565, 605))
arc_crop.save('arcadia/odyssee/img/bag/pocket_arc.png')

# 4. Boutons DS
btn_utiliser = im_concept1.crop((680, 765, 910, 845))
btn_utiliser.save('arcadia/odyssee/img/bag/btn_utiliser.png')
btn_donner = im_concept1.crop((930, 765, 1160, 845))
btn_donner.save('arcadia/odyssee/img/bag/btn_donner.png')
btn_jeter = im_concept1.crop((680, 855, 910, 935) if 935 <= im_concept1.size[1] else (680, 855, 910, im_concept1.size[1]))
btn_jeter.save('arcadia/odyssee/img/bag/btn_jeter.png')
btn_retour = im_concept1.crop((930, 855, 1160, 935) if 935 <= im_concept1.size[1] else (930, 855, 1160, im_concept1.size[1]))
btn_retour.save('arcadia/odyssee/img/bag/btn_retour.png')

# 5. Cadre global B2W2
im_frame = Image.open(r'C:\Users\ameti\.gemini\antigravity\brain\df0f98b4-2cf7-4e3b-92b9-0e675f35e8d0\b2w2_bag_screen_frame_1793700508925.jpg')
im_frame.save('arcadia/odyssee/img/bag/frame.jpg', quality=95)

print('All bag assets extracted successfully!')
