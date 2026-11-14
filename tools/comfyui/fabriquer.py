#!/usr/bin/env python3
"""tools/comfyui/fabriquer.py — écrit les workflows ComfyUI des personnages d'Odyssée (format de l'interface, à glisser dans ComfyUI).

  python3 tools/comfyui/fabriquer.py      → tools/comfyui/1-reference.json, 2-variations.json, 3-pixel-net.json

Les liens entre nœuds sont calculés ici (jamais écrits à la main), puis vérifiés : chaque entrée reliée a bien sa sortie.
"""
import json, os

DIR = os.path.dirname(os.path.abspath(__file__))

# fichiers des modèles (noms de Comfy-Org et lightx2v ; dans ComfyUI, la liste déroulante permet d'en choisir un autre)
UNET_T2I = 'qwen_image_2512_fp8_e4m3fn.safetensors'
UNET_EDIT = 'qwen_image_edit_2511_bf16.safetensors'
CLIP = 'qwen_2.5_vl_7b_fp8_scaled.safetensors'
VAE = 'qwen_image_vae.safetensors'
LORA_T2I = 'Qwen-Image-Lightning-4steps-V1.0.safetensors'
LORA_EDIT = 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors'
LORA_PIXEL = 'pixel-art-redmond-qwen-image.safetensors'          # Pixel Art Redmond (Qwen-Image 2512), facultative
LORA_PLANCHE = 'pixel_spritesheet_4walk_combat_32x48_v1.safetensors'  # planches de marche (Qwen-Image-Edit 2511), facultative

STYLE = ('Style of the Pokemon HeartGold and SoulSilver sprites: clean dark 1-pixel outline, flat cel shading with two or three '
         'tones per color, limited palette, crisp square pixels, no anti-aliasing, no blur, no gradient. ')
FOND = 'Single character, centered, plain solid magenta background (#FF00FF), no shadow on the ground, no text, no frame.'
GARDER = 'Keep exactly the same face, hair, clothes, colors and accessories as the character in the image. '

NEGATIF = 'blurry, anti-aliasing, gradient, photo, 3d render, realistic, painterly, soft shading, text, watermark, frame, ' \
          'several characters, cropped, cut off feet, shadow, busy background'


class Graphe:
    def __init__(self):
        self.nodes, self.links, self.groups, self.n, self.l = [], [], [], 0, 0

    def noeud(self, type_, pos, widgets=(), entrees=(), sorties=(), titre=None, taille=(320, 120), mode=0, couleur=None):
        """entrees : [(nom, type)] ; sorties : [(nom, type)]"""
        self.n += 1
        nd = {'id': self.n, 'type': type_, 'pos': list(pos), 'size': list(taille), 'flags': {}, 'order': self.n - 1, 'mode': mode,
              'inputs': [{'name': a, 'type': t, 'link': None} for a, t in entrees],
              'outputs': [{'name': a, 'type': t, 'links': [], 'slot_index': i} for i, (a, t) in enumerate(sorties)],
              'properties': {'Node name for S&R': type_}, 'widgets_values': list(widgets)}
        if titre: nd['title'] = titre
        if couleur: nd['color'], nd['bgcolor'] = couleur
        self.nodes.append(nd)
        return nd

    def relier(self, a, sa, b, eb):
        """sortie n° sa du nœud a → entrée nommée eb du nœud b"""
        self.l += 1
        t = a['outputs'][sa]['type']
        i = next(k for k, e in enumerate(b['inputs']) if e['name'] == eb)
        assert b['inputs'][i]['link'] is None, (b['type'], eb)
        b['inputs'][i]['link'] = self.l
        a['outputs'][sa]['links'].append(self.l)
        self.links.append([self.l, a['id'], sa, b['id'], i, t])

    def groupe(self, titre, x, y, w, h, couleur='#3f789e'):
        self.groups.append({'title': titre, 'bounding': [x, y, w, h], 'color': couleur, 'font_size': 24, 'flags': {}})

    def note(self, pos, texte, taille=(420, 260)):
        return self.noeud('Note', pos, [texte], taille=taille, couleur=('#432', '#653'))

    def json(self):
        # vérification : chaque lien relie une sortie existante à une entrée qui le connaît
        ids = {n['id']: n for n in self.nodes}
        for lid, a, sa, b, eb, t in self.links:
            assert lid in ids[a]['outputs'][sa]['links'] and ids[b]['inputs'][eb]['link'] == lid
        return {'last_node_id': self.n, 'last_link_id': self.l, 'nodes': self.nodes, 'links': self.links, 'groups': self.groups,
                'config': {}, 'extra': {'ds': {'scale': 0.6, 'offset': [40, 40]}}, 'version': 0.4}


def chargeurs(G, x, y, unet, lora_rapide, lora_style=None, nom_style='LoRA pixel art', lora_style_actif=False):
    """modèle + LoRA Lightning (4 étapes) + LoRA de style facultative + décalage AuraFlow ; renvoie (modèle, clip, vae)"""
    u = G.noeud('UNETLoader', (x, y), [unet, 'default'], sorties=[('MODEL', 'MODEL')], titre='Modèle (diffusion_models)')
    c = G.noeud('CLIPLoader', (x, y + 150), [CLIP, 'qwen_image', 'default'], sorties=[('CLIP', 'CLIP')], titre='Encodeur de texte (text_encoders)')
    v = G.noeud('VAELoader', (x, y + 300), [VAE], sorties=[('VAE', 'VAE')], titre='VAE (vae)')
    l1 = G.noeud('LoraLoaderModelOnly', (x + 360, y), [lora_rapide, 1.0], entrees=[('model', 'MODEL')], sorties=[('MODEL', 'MODEL')],
                 titre='Lightning : 4 étapes (désactiver → 40 étapes, CFG 4)')
    G.relier(u, 0, l1, 'model')
    dernier = l1
    if lora_style:
        l2 = G.noeud('LoraLoaderModelOnly', (x + 360, y + 150), [lora_style, 0.8], entrees=[('model', 'MODEL')], sorties=[('MODEL', 'MODEL')],
                     titre=f'{nom_style} (facultative : Ctrl+B pour l\'activer)', mode=0 if lora_style_actif else 4)
        G.relier(l1, 0, l2, 'model'); dernier = l2
    ms = G.noeud('ModelSamplingAuraFlow', (x + 360, y + 300), [3.1], entrees=[('model', 'MODEL')], sorties=[('MODEL', 'MODEL')])
    G.relier(dernier, 0, ms, 'model')
    return ms, c, v


def pixel_net(G, x, y, image, nom, couleurs=24):
    """sortie brute + passage au pixel près (grille détectée, palette réduite) + aperçu agrandi"""
    s1 = G.noeud('SaveImage', (x, y), [f'odyssee/{nom}_brut'], entrees=[('images', 'IMAGE')], taille=(300, 330), titre=f'{nom} : image brute')
    G.relier(image[0], image[1], s1, 'images')
    d = G.noeud('PixelArtDetectorToImage', (x + 320, y), [True, couleurs], entrees=[('images', 'IMAGE')], sorties=[('IMAGE', 'IMAGE')],
                titre='Au pixel près (grille + palette)', taille=(300, 110))
    G.relier(image[0], image[1], d, 'images')
    s2 = G.noeud('SaveImage', (x + 320, y + 130), [f'odyssee/{nom}_pixel'], entrees=[('images', 'IMAGE')], taille=(300, 200),
                 titre=f'{nom} : à la vraie taille (à garder)')
    G.relier(d, 0, s2, 'images')
    z = G.noeud('ImageScaleBy', (x + 640, y), ['nearest-exact', 4.0], entrees=[('image', 'IMAGE')], sorties=[('IMAGE', 'IMAGE')], titre='Aperçu ×4')
    G.relier(d, 0, z, 'image')
    p = G.noeud('PreviewImage', (x + 640, y + 110), [], entrees=[('images', 'IMAGE')], taille=(300, 330))
    G.relier(z, 0, p, 'images')


def workflow_reference():
    G = Graphe()
    G.groupe('1. Le personnage de référence : de face, en pied (on en tire 4, on garde le meilleur)', -20, -60, 2300, 820)
    G.note((0, 0), 'ÉTAPE 1 — RÉFÉRENCE\n\nDécris le personnage dans le cadre « Personnage » (en anglais, c\'est mieux compris). '
           'Le reste du texte fixe le style HeartGold et le fond magenta (facile à détourer).\n\n4 images par lancement (« batch_size »). '
           'Garde la meilleure : c\'est elle qui sert de référence aux étapes 2 et 3.\n\nRapide (Lightning, 4 étapes, CFG 1) par défaut. '
           'Pour plus de qualité : contourne la LoRA Lightning (Ctrl+B) et mets 40 étapes, CFG 4.\n\nLoRA pixel art (Pixel Art Redmond) : '
           'facultative, contournée au départ ; télécharge-la puis Ctrl+B pour l\'activer.\n\nSorties : ComfyUI/output/odyssee/', (420, 360))
    m, c, v = chargeurs(G, 460, 0, UNET_T2I, LORA_T2I, LORA_PIXEL)
    pos = G.noeud('CLIPTextEncode', (1180, 0), [
        'Pixel art character design of a young pokemon trainer: a girl with a red cap, short brown hair, a white jacket over a black '
        'shirt, blue shorts and a yellow messenger bag. Full body from head to feet, standing straight, facing the viewer, front view, '
        'arms relaxed, about three heads tall. ' + STYLE + FOND],
        entrees=[('clip', 'CLIP')], sorties=[('CONDITIONING', 'CONDITIONING')], titre='Personnage (à décrire ici)', taille=(460, 260),
        couleur=('#232', '#353'))
    neg = G.noeud('CLIPTextEncode', (1180, 290), [NEGATIF], entrees=[('clip', 'CLIP')], sorties=[('CONDITIONING', 'CONDITIONING')],
                  titre='À éviter', taille=(460, 130), couleur=('#322', '#533'))
    G.relier(c, 0, pos, 'clip'); G.relier(c, 0, neg, 'clip')
    lat = G.noeud('EmptySD3LatentImage', (1180, 450), [1024, 1024, 4], sorties=[('LATENT', 'LATENT')], titre='Taille et nombre d\'images')
    ks = G.noeud('KSampler', (1680, 0), [0, 'randomize', 4, 1.0, 'euler', 'simple', 1.0],
                 entrees=[('model', 'MODEL'), ('positive', 'CONDITIONING'), ('negative', 'CONDITIONING'), ('latent_image', 'LATENT')],
                 sorties=[('LATENT', 'LATENT')], taille=(320, 270))
    G.relier(m, 0, ks, 'model'); G.relier(pos, 0, ks, 'positive'); G.relier(neg, 0, ks, 'negative'); G.relier(lat, 0, ks, 'latent_image')
    dec = G.noeud('VAEDecode', (1680, 300), [], entrees=[('samples', 'LATENT'), ('vae', 'VAE')], sorties=[('IMAGE', 'IMAGE')])
    G.relier(ks, 0, dec, 'samples'); G.relier(v, 0, dec, 'vae')
    pixel_net(G, 0, 420, (dec, 0), 'reference')
    return G.json()


VARIANTES = [
    ('face', 'Sprite de terrain : de face', 1024, 1024, 24,
     'Redraw the character from the image as a small overworld walking sprite of a Pokemon HeartGold game: full body, about three '
     'heads tall, standing, facing the viewer (front view), feet together. ' + GARDER + STYLE + FOND),
    ('gauche', 'Sprite de terrain : profil gauche', 1024, 1024, 24,
     'Redraw the character from the image as a small overworld walking sprite of a Pokemon HeartGold game: full body, about three '
     'heads tall, standing, seen from the side, facing left (left profile). ' + GARDER + STYLE + FOND),
    ('dos', 'Sprite de terrain : de dos', 1024, 1024, 24,
     'Redraw the character from the image as a small overworld walking sprite of a Pokemon HeartGold game: full body, about three '
     'heads tall, standing, seen from behind (back view), facing away from the viewer. ' + GARDER + STYLE + FOND),
    ('combat', 'Portrait de combat (64 × 80)', 896, 1120, 32,
     'Redraw the character from the image as a Pokemon HeartGold battle trainer sprite: full body, normal proportions, three-quarter '
     'view turned slightly to the left toward the opponent, confident battle pose, one hand holding a poke ball. ' + GARDER + STYLE + FOND),
]


def workflow_variations():
    G = Graphe()
    G.note((0, 0), 'ÉTAPES 2 ET 3 — VARIATIONS (Qwen-Image-Edit 2511)\n\nCharge la référence choisie (étape 1), ou une image du jeu '
           '(assets/graphics/portraits-combat/…, assets/graphics/persos64/…) : elle est agrandie au plus proche voisin, sans flou.\n\n'
           'Chaque rangée fait une variante : de face, profil gauche, de dos (la droite = le miroir de la gauche), portrait de combat. '
           'Pour n\'en lancer qu\'une, contourne les autres groupes (clic droit sur le groupe → Bypass).\n\nAstuce cohérence : relance '
           'profil et dos en chargeant cette fois le sprite DE FACE réussi comme référence.\n\nLes pas de marche ne se font pas ici : '
           'un script les tire des poses debout (plus fiable).\n\nLoRA « planche de marche » : facultative, contournée au départ.', (420, 420))
    m, c, v = chargeurs(G, 460, 0, UNET_EDIT, LORA_EDIT, LORA_PLANCHE, 'LoRA planche de marche')
    # CFGNorm, comme dans le modèle de workflow officiel de Qwen-Image-Edit 2511
    cn = G.noeud('CFGNorm', (820, 450), [1.0], entrees=[('model', 'MODEL')], sorties=[('MODEL', 'MODEL')])
    G.relier(m, 0, cn, 'model')
    img = G.noeud('LoadImage', (0, 460), ['reference.png', 'image'], sorties=[('IMAGE', 'IMAGE'), ('MASK', 'MASK')],
                  titre='Référence (étape 1, ou image du jeu)', taille=(320, 360), couleur=('#223', '#335'))
    sc = G.noeud('ImageScaleToTotalPixels', (0, 840), ['nearest-exact', 1.0], entrees=[('image', 'IMAGE')], sorties=[('IMAGE', 'IMAGE')],
                 titre='Agrandie (plus proche voisin, ~1 mégapixel)')
    G.relier(img, 0, sc, 'image')
    y0 = 1000
    for k, (nom, titre, w, h, ncoul, texte) in enumerate(VARIANTES):
        y = y0 + k * 560
        G.groupe(titre, 440, y - 50, 2460, 540, '#a1309b' if nom == 'combat' else '#3f789e')
        pos = G.noeud('TextEncodeQwenImageEditPlus', (460, y), [texte],
                      entrees=[('clip', 'CLIP'), ('vae', 'VAE'), ('image1', 'IMAGE'), ('image2', 'IMAGE'), ('image3', 'IMAGE')],
                      sorties=[('CONDITIONING', 'CONDITIONING')], titre=f'{titre} : consigne', taille=(460, 300), couleur=('#232', '#353'))
        neg = G.noeud('TextEncodeQwenImageEditPlus', (460, y + 320), [''],
                      entrees=[('clip', 'CLIP'), ('vae', 'VAE'), ('image1', 'IMAGE'), ('image2', 'IMAGE'), ('image3', 'IMAGE')],
                      sorties=[('CONDITIONING', 'CONDITIONING')], titre='(négatif vide)', taille=(460, 120), couleur=('#322', '#533'))
        for e in (pos, neg):
            G.relier(c, 0, e, 'clip'); G.relier(v, 0, e, 'vae'); G.relier(sc, 0, e, 'image1')
        lat = G.noeud('EmptySD3LatentImage', (940, y + 320), [w, h, 2], sorties=[('LATENT', 'LATENT')], titre='Taille et nombre d\'images')
        ks = G.noeud('KSampler', (940, y), [0, 'randomize', 4, 1.0, 'euler', 'simple', 1.0],
                     entrees=[('model', 'MODEL'), ('positive', 'CONDITIONING'), ('negative', 'CONDITIONING'), ('latent_image', 'LATENT')],
                     sorties=[('LATENT', 'LATENT')], taille=(320, 270))
        G.relier(cn, 0, ks, 'model'); G.relier(pos, 0, ks, 'positive'); G.relier(neg, 0, ks, 'negative'); G.relier(lat, 0, ks, 'latent_image')
        dec = G.noeud('VAEDecode', (1280, y), [], entrees=[('samples', 'LATENT'), ('vae', 'VAE')], sorties=[('IMAGE', 'IMAGE')])
        G.relier(ks, 0, dec, 'samples'); G.relier(v, 0, dec, 'vae')
        pixel_net(G, 1480, y, (dec, 0), nom, ncoul)
    return G.json()


def workflow_pixel():
    G = Graphe()
    G.groupe('Au pixel près : n\'importe quelle image → sa vraie grille et une palette réduite', -20, -60, 1700, 560)
    G.note((0, 0), 'PASSAGE AU PIXEL PRÈS SEUL\n\nPour une image déjà générée (ou retouchée ailleurs) : détecte la taille réelle d\'un '
           '« pixel », réduit l\'image à sa vraie résolution et limite la palette (nombre de couleurs à régler).\n\nLa mise au format '
           'du jeu (case de 64 × 64 pieds en bas, portrait 64 × 80, palette des dresseurs, fond magenta retiré) se fait ensuite par '
           'notre script côté dépôt.', (420, 300))
    img = G.noeud('LoadImage', (460, 0), ['image.png', 'image'], sorties=[('IMAGE', 'IMAGE'), ('MASK', 'MASK')], taille=(320, 360))
    pixel_net(G, 800, 0, (img, 0), 'image', 24)
    return G.json()


if __name__ == '__main__':
    for nom, f in (('1-reference', workflow_reference), ('2-variations', workflow_variations), ('3-pixel-net', workflow_pixel)):
        with open(os.path.join(DIR, nom + '.json'), 'w') as fh:
            json.dump(f(), fh, ensure_ascii=False, indent=1)
        print(nom)
