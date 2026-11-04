# arcadia/tools/generate_field_items_sprites.py
# Generates authentic 16-bit Nintendo DS style pixel-art sprites for the 9 Field Item prototypes
# Coupe (3 concepts), Surf (3 concepts), Vol (3 concepts)

import os
import math
from PIL import Image, ImageDraw

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "odyssee", "img", "items")
ARTIFACT_DIR = r"C:\Users\ameti\.gemini\antigravity\brain\df0f98b4-2cf7-4e3b-92b9-0e675f35e8d0"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

SIZE = 48
SCALE = 8  # 384x384 preview image

def save_sprite(im_48, base_name):
    # Save 48x48 sprite in odyssee/img/items/
    path_game = os.path.join(OUTPUT_DIR, f"{base_name}.png")
    im_48.save(path_game)
    
    # Save high-res nearest-neighbor scaled preview in artifacts directory
    im_scaled = im_48.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST)
    path_art = os.path.join(ARTIFACT_DIR, f"{base_name}.png")
    im_scaled.save(path_art)
    print(f"Saved {base_name}: {path_game} and {path_art}")

# ==============================================================================
# COUPE 1: Sécateur Sylvestre (Forest Shears)
# ==============================================================================
def draw_secateur():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Left blade & handle
    # Handles (emerald green & gold trim)
    # Left handle: from (16, 26) to (8, 44)
    for w in range(3):
        d.line([(18 - w, 24), (10 - w, 42)], fill=(24, 110, 52, 255), width=2)
        d.line([(17 - w, 25), (9 - w, 43)], fill=(46, 172, 88, 255), width=2)
        d.line([(16 - w, 26), (8 - w, 44)], fill=(120, 220, 140, 255), width=1)
    # Handle grip texture / rings
    for y in [30, 34, 38]:
        d.rectangle([10, y, 15, y+1], fill=(212, 175, 55, 255))
        
    # Right handle: from (30, 24) to (38, 42)
    for w in range(3):
        d.line([(30 + w, 24), (38 + w, 42)], fill=(24, 110, 52, 255), width=2)
        d.line([(31 + w, 25), (39 + w, 43)], fill=(46, 172, 88, 255), width=2)
        d.line([(32 + w, 26), (40 + w, 44)], fill=(120, 220, 140, 255), width=1)
    for y in [30, 34, 38]:
        d.rectangle([33, y, 38, y+1], fill=(212, 175, 55, 255))
        
    # Central brass pivot & golden spring
    d.ellipse([21, 21, 27, 27], fill=(255, 224, 80, 255), outline=(160, 120, 20, 255))
    d.ellipse([23, 23, 25, 25], fill=(255, 255, 180, 255))
    
    # Left blade (curved steel blade, sharp cutting edge pointing right)
    # Reaching up to (14, 6)
    blade_pts_l = [(22, 22), (18, 14), (16, 8), (17, 6), (22, 10), (24, 18)]
    d.polygon(blade_pts_l, fill=(220, 235, 245, 255), outline=(60, 80, 100, 255))
    # Bevel highlight
    d.line([(17, 7), (23, 17)], fill=(255, 255, 255, 255), width=1)
    # Golden leaf inlay engraving
    d.polygon([(20, 13), (19, 11), (21, 10), (22, 12)], fill=(255, 215, 0, 255))
    
    # Right anvil blade (crosses over, reaching up to (32, 6))
    blade_pts_r = [(26, 22), (30, 14), (32, 8), (31, 6), (26, 10), (24, 18)]
    d.polygon(blade_pts_r, fill=(180, 195, 210, 255), outline=(50, 70, 90, 255))
    d.line([(31, 7), (25, 17)], fill=(255, 255, 255, 255), width=1)
    d.polygon([(28, 13), (29, 11), (27, 10), (26, 12)], fill=(255, 215, 0, 255))
    
    # Sharp tips gleam
    d.point((17, 6), fill=(255, 255, 255, 255))
    d.point((31, 6), fill=(255, 255, 255, 255))
    
    return im

# ==============================================================================
# COUPE 2: Machette d'Aventurier (Explorer's Machete)
# ==============================================================================
def draw_machete():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Diagonal machete angled from bottom-left (10, 38) to top-right (38, 8)
    # Handle with leather wraps (10, 38) to (18, 30)
    d.line([(10, 38), (18, 30)], fill=(90, 48, 20, 255), width=4)
    # Leather wrap straps
    for i in range(4):
        x = 11 + i * 2
        y = 37 - i * 2
        d.line([(x-1, y+1), (x+1, y-1)], fill=(160, 100, 40, 255), width=1)
    # Brass guard and pommel
    d.ellipse([8, 37, 12, 41], fill=(230, 190, 50, 255), outline=(120, 90, 20, 255))
    d.line([(16, 32), (20, 28)], fill=(255, 220, 70, 255), width=3)
    
    # Heavy curved blade: from (18, 30) to (38, 8)
    blade_pts = [
        (18, 29), (24, 23), (32, 16), (39, 10), (41, 11), (40, 14),
        (35, 22), (26, 29), (20, 32)
    ]
    d.polygon(blade_pts, fill=(210, 225, 235, 255), outline=(40, 50, 65, 255))
    
    # Cutting edge shine
    d.line([(20, 32), (26, 29), (35, 22), (40, 14)], fill=(255, 255, 255, 255), width=1)
    
    # Dark carbon spine with serration notches
    d.line([(18, 29), (24, 23), (32, 16), (39, 10)], fill=(100, 115, 130, 255), width=1)
    # Notches
    for nx, ny in [(23, 23), (27, 19), (31, 15)]:
        d.point((nx, ny), fill=(40, 50, 60, 255))
        
    # Explorer leather scabbard strap hanging from pommel
    d.line([(9, 40), (7, 44), (10, 46)], fill=(139, 69, 19, 255), width=2)
    d.ellipse([9, 45, 11, 47], fill=(255, 215, 0, 255))
    
    return im

# ==============================================================================
# COUPE 3: Hachette Forestière (Ranger Hatchet)
# ==============================================================================
def draw_hachette():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Ergonomic curved handle from (14, 42) to (28, 16)
    # Dark forest composite handle
    handle_pts = [(13, 42), (16, 36), (20, 28), (25, 20), (28, 14)]
    for i in range(len(handle_pts)-1):
        d.line([handle_pts[i], handle_pts[i+1]], fill=(30, 50, 35, 255), width=4)
        d.line([handle_pts[i], handle_pts[i+1]], fill=(60, 100, 70, 255), width=2)
        
    # Grip wrap at bottom
    d.rectangle([11, 38, 15, 43], fill=(210, 140, 40, 255))
    d.ellipse([11, 42, 14, 45], fill=(20, 30, 20, 255))
    
    # Titanium double-beveled axe head at top: from (26, 12) outward to (39, 8) and (37, 24)
    head_poly = [
        (26, 17), (26, 11), (32, 9), (39, 8), (40, 11),
        (38, 20), (35, 24), (32, 21), (28, 19)
    ]
    d.polygon(head_poly, fill=(185, 205, 215, 255), outline=(35, 45, 55, 255))
    
    # Sharp curved cutting crescent
    crescent = [(39, 8), (40, 12), (39, 17), (35, 24)]
    for i in range(len(crescent)-1):
        d.line([crescent[i], crescent[i+1]], fill=(255, 255, 255, 255), width=1)
        
    # Bevel triangle
    d.polygon([(28, 14), (35, 12), (34, 18)], fill=(140, 160, 175, 255))
    # Forest ranger emblem on head (small green tree triangle)
    d.polygon([(30, 15), (32, 12), (34, 15)], fill=(40, 160, 80, 255))
    
    # Hammer poll on reverse side of head: (25, 12) to (21, 14)
    d.rectangle([21, 12, 26, 16], fill=(130, 145, 160, 255), outline=(40, 50, 60, 255))
    
    return im

# ==============================================================================
# SURF 1: Planche de Surf Hydrodynamique (Hydro Surfboard)
# ==============================================================================
def draw_surfboard():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Diagonal surfboard angled from (12, 38) to (36, 10)
    # Outer hull (cyan & white)
    # Draw rotated oval-like polygon
    hull_pts = [
        (13, 40), (10, 35), (14, 25), (22, 16), (32, 9), (37, 8),
        (39, 11), (35, 20), (28, 30), (20, 38), (15, 41)
    ]
    d.polygon(hull_pts, fill=(0, 210, 245, 255), outline=(10, 80, 120, 255))
    
    # White racing stripe along center
    stripe_pts = [
        (14, 38), (18, 28), (26, 18), (34, 10), (36, 9),
        (34, 12), (25, 21), (17, 31), (13, 39)
    ]
    d.polygon(stripe_pts, fill=(255, 255, 255, 255))
    
    # Dark blue traction pad at rear foot position (13, 35) to (18, 30)
    d.polygon([(12, 35), (15, 30), (19, 33), (16, 38)], fill=(20, 45, 90, 255))
    for px, py in [(14, 33), (16, 35), (17, 32)]:
        d.point((px, py), fill=(255, 180, 0, 255))
        
    # Blue wave decal on front
    d.line([(28, 16), (31, 13), (33, 15)], fill=(0, 120, 220, 255), width=2)
    
    # Glowing aero-tip highlight
    d.point((37, 8), fill=(255, 255, 255, 255))
    d.point((38, 9), fill=(255, 255, 255, 255))
    
    # Twin stabilizer hydro-fins under the tail
    d.polygon([(10, 39), (7, 43), (12, 42)], fill=(0, 160, 200, 255), outline=(5, 50, 80, 255))
    
    return im

# ==============================================================================
# SURF 2: Aquajet Propulseur (Sea Scooter)
# ==============================================================================
def draw_aquajet():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Main torpedo capsule body in rescue yellow & dark navy
    # Central body from (18, 16) to (30, 32)
    d.ellipse([16, 14, 32, 34], fill=(255, 204, 0, 255), outline=(40, 40, 50, 255))
    
    # Front dome (clear / bright cyan nose cone)
    d.ellipse([20, 11, 28, 18], fill=(0, 230, 255, 255), outline=(0, 120, 160, 255))
    d.point((23, 13), fill=(255, 255, 255, 255))
    d.point((24, 13), fill=(255, 255, 255, 255))
    
    # Navy blue side bumper panels
    d.rectangle([15, 20, 18, 28], fill=(25, 45, 80, 255))
    d.rectangle([30, 20, 33, 28], fill=(25, 45, 80, 255))
    
    # Twin side turbine thruster nacelles
    # Left turbine
    d.ellipse([8, 22, 16, 32], fill=(60, 75, 95, 255), outline=(20, 30, 45, 255))
    d.ellipse([9, 28, 15, 33], fill=(0, 210, 255, 255)) # jet glow
    # Right turbine
    d.ellipse([32, 22, 40, 32], fill=(60, 75, 95, 255), outline=(20, 30, 45, 255))
    d.ellipse([33, 28, 39, 33], fill=(0, 210, 255, 255)) # jet glow
    
    # Handlebar grips at the back (20, 35) to (28, 38)
    d.line([(12, 30), (14, 37), (20, 37)], fill=(40, 40, 45, 255), width=2)
    d.line([(36, 30), (34, 37), (28, 37)], fill=(40, 40, 45, 255), width=2)
    # Grips
    d.rectangle([11, 35, 14, 39], fill=(230, 60, 60, 255))
    d.rectangle([34, 35, 37, 39], fill=(230, 60, 60, 255))
    
    # Battery LED indicators (green dots)
    d.point((22, 24), fill=(50, 255, 100, 255))
    d.point((24, 24), fill=(50, 255, 100, 255))
    d.point((26, 24), fill=(50, 255, 100, 255))
    
    return im

# ==============================================================================
# SURF 3: Harnais Flottant d'Écume (Marine Float Saddle)
# ==============================================================================
def draw_harnais():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Twin buoyant side floats (marine navy & orange safety)
    # Left pontoon float
    d.ellipse([10, 16, 20, 36], fill=(0, 140, 220, 255), outline=(10, 60, 100, 255))
    d.line([(14, 18), (14, 34)], fill=(255, 255, 255, 255), width=1)
    
    # Right pontoon float
    d.ellipse([28, 16, 38, 36], fill=(0, 140, 220, 255), outline=(10, 60, 100, 255))
    d.line([(34, 18), (34, 34)], fill=(255, 255, 255, 255), width=1)
    
    # Central comfortable ergonomic seat / saddle
    d.ellipse([16, 20, 32, 34], fill=(40, 50, 65, 255), outline=(20, 30, 40, 255))
    d.ellipse([18, 22, 30, 32], fill=(245, 130, 32, 255)) # high-visibility safety pad
    
    # Front mounting pommel / grip horn
    d.ellipse([21, 14, 27, 20], fill=(255, 215, 0, 255), outline=(160, 120, 0, 255))
    
    # Reinforced water-tight harness straps
    d.line([(15, 20), (24, 16), (33, 20)], fill=(30, 35, 45, 255), width=2)
    d.line([(15, 32), (24, 30), (33, 32)], fill=(30, 35, 45, 255), width=2)
    
    # Quick-release safety buckle (brass / gold)
    d.rectangle([22, 28, 26, 32], fill=(255, 220, 60, 255), outline=(100, 80, 0, 255))
    
    # Small water splash / droplet icons around floats
    d.point((8, 26), fill=(160, 230, 255, 255))
    d.point((40, 26), fill=(160, 230, 255, 255))
    
    return im

# ==============================================================================
# VOL 1: Deltaplane Pliable (Folding Sky Glider)
# ==============================================================================
def draw_deltaplane():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Large triangular delta wing viewed in 3/4 perspective
    # Top nose point at (24, 8)
    # Left wingtip at (6, 32)
    # Right wingtip at (42, 32)
    # Rear center notch at (24, 26)
    
    # Left wing sail (vibrant sky-blue & crimson trim)
    sail_l = [(24, 8), (6, 32), (16, 29), (24, 26)]
    d.polygon(sail_l, fill=(0, 160, 245, 255), outline=(10, 50, 90, 255))
    
    # Right wing sail
    sail_r = [(24, 8), (42, 32), (32, 29), (24, 26)]
    d.polygon(sail_r, fill=(0, 190, 255, 255), outline=(10, 50, 90, 255))
    
    # Crimson racing chevron pattern across wings
    chev_l = [(24, 14), (12, 28), (15, 29), (24, 18)]
    d.polygon(chev_l, fill=(235, 45, 65, 255))
    chev_r = [(24, 14), (36, 28), (33, 29), (24, 18)]
    d.polygon(chev_r, fill=(255, 75, 95, 255))
    
    # Carbon fiber central keel strut and leading edges
    d.line([(24, 8), (24, 26)], fill=(30, 35, 45, 255), width=2)
    d.line([(24, 8), (6, 32)], fill=(255, 255, 255, 255), width=1)
    d.line([(24, 8), (42, 32)], fill=(255, 255, 255, 255), width=1)
    
    # Control A-frame and harness bar underneath
    d.line([(18, 24), (20, 37), (24, 36), (28, 37), (30, 24)], fill=(80, 90, 105, 255), width=2)
    # Horizontal control bar with padded hand grips
    d.line([(18, 37), (30, 37)], fill=(240, 180, 40, 255), width=2)
    
    # Wingtip stabilizer ribbons
    d.line([(6, 32), (4, 36)], fill=(255, 215, 0, 255), width=1)
    d.line([(42, 32), (44, 36)], fill=(255, 215, 0, 255), width=1)
    
    return im

# ==============================================================================
# VOL 2: Sifflet Céleste (Celestial Sky Whistle)
# ==============================================================================
def draw_whistle():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Silver bird-shaped whistle facing right
    # Whistle mouthpiece tube on left: (10, 22) to (18, 22)
    d.rectangle([10, 20, 18, 25], fill=(215, 225, 235, 255), outline=(90, 105, 125, 255))
    d.ellipse([8, 20, 12, 25], fill=(160, 175, 190, 255))
    
    # Whistle resonant sound window / fipple slit
    d.rectangle([18, 19, 21, 23], fill=(30, 35, 45, 255))
    
    # Bird body chamber: (20, 15) to (34, 30)
    d.ellipse([18, 14, 34, 30], fill=(230, 240, 250, 255), outline=(80, 95, 115, 255))
    
    # Sculpted golden bird head & beak pointing top-right
    d.ellipse([28, 11, 37, 21], fill=(255, 215, 60, 255), outline=(160, 120, 10, 255))
    d.polygon([(36, 15), (42, 17), (36, 19)], fill=(255, 160, 20, 255)) # Beak
    # Bird eye (tiny sparkling sapphire)
    d.point((33, 14), fill=(0, 140, 255, 255))
    d.point((33, 13), fill=(255, 255, 255, 255))
    
    # Engraved golden wings swept back
    d.polygon([(23, 16), (32, 19), (28, 26), (20, 22)], fill=(255, 225, 80, 255), outline=(170, 130, 20, 255))
    d.line([(24, 18), (30, 20)], fill=(255, 255, 255, 255), width=1)
    
    # Suspended fluttering sapphire wind streamer silk cord from mouthpiece ring
    d.ellipse([8, 21, 11, 24], fill=(255, 215, 0, 255))
    # Flowing silk ribbon undulating downward
    ribbon_pts = [(9, 24), (12, 28), (8, 33), (13, 38), (9, 43), (12, 45)]
    for i in range(len(ribbon_pts)-1):
        d.line([ribbon_pts[i], ribbon_pts[i+1]], fill=(30, 144, 255, 255), width=2)
        d.line([ribbon_pts[i], ribbon_pts[i+1]], fill=(135, 206, 250, 255), width=1)
        
    return im

# ==============================================================================
# VOL 3: Aéro-Boussole d'Éole (Aero Wind Compass)
# ==============================================================================
def draw_compass():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Outer antique brass pocket watch style compass casing
    # Central disc
    d.ellipse([10, 10, 38, 38], fill=(235, 195, 65, 255), outline=(130, 95, 20, 255))
    d.ellipse([12, 12, 36, 36], fill=(180, 140, 30, 255))
    d.ellipse([14, 14, 34, 34], fill=(245, 215, 90, 255))
    
    # Watch top pendant loop & winding crown at top (22, 6)
    d.rectangle([22, 7, 26, 11], fill=(210, 170, 40, 255))
    d.ellipse([20, 4, 28, 10], outline=(235, 195, 65, 255), width=2)
    
    # Internal dial (celestial night blue / crystal face)
    d.ellipse([15, 15, 33, 33], fill=(15, 25, 45, 255), outline=(40, 60, 90, 255))
    
    # Wind rose / miniature rotating golden wings (N, S, E, W)
    # North wing
    d.polygon([(24, 16), (22, 23), (24, 21), (26, 23)], fill=(255, 230, 120, 255))
    # South wing
    d.polygon([(24, 32), (22, 25), (24, 27), (26, 25)], fill=(180, 150, 60, 255))
    # West wing
    d.polygon([(16, 24), (23, 22), (21, 24), (23, 26)], fill=(200, 170, 70, 255))
    # East wing
    d.polygon([(32, 24), (25, 22), (27, 24), (25, 26)], fill=(200, 170, 70, 255))
    
    # Luminous cyan / wind-current magnetic needle pointing North-East
    d.line([(24, 24), (29, 18)], fill=(0, 255, 255, 255), width=2)
    d.line([(24, 24), (19, 30)], fill=(255, 70, 70, 255), width=2)
    
    # Center crystal pivot gem
    d.ellipse([22, 22, 26, 26], fill=(255, 255, 255, 255), outline=(0, 180, 255, 255))
    
    # Side aero-stabilizer brass winglets flanking the compass case
    # Left winglet
    d.polygon([(10, 20), (4, 18), (6, 26), (11, 27)], fill=(255, 215, 60, 255), outline=(130, 95, 20, 255))
    # Right winglet
    d.polygon([(38, 20), (44, 18), (42, 26), (37, 27)], fill=(255, 215, 60, 255), outline=(130, 95, 20, 255))
    
    return im

# Generate all 9 prototypes
sprites = {
    # Coupe
    "cut_prototype_a_secateur": draw_secateur(),
    "cut_prototype_b_machete": draw_machete(),
    "cut_prototype_c_hachette": draw_hachette(),
    # Surf
    "surf_prototype_a_board": draw_surfboard(),
    "surf_prototype_b_scooter": draw_aquajet(),
    "surf_prototype_c_saddle": draw_harnais(),
    # Vol
    "fly_prototype_a_glider": draw_deltaplane(),
    "fly_prototype_b_whistle": draw_whistle(),
    "fly_prototype_c_compass": draw_compass(),
}

for name, img in sprites.items():
    save_sprite(img, name)

print("All 9 Field Item Prototypes generated successfully!")
