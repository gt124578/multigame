# Workflows ComfyUI pour les personnages d'Odyssée

Trois workflows à glisser dans ComfyUI (ils sont écrits par `fabriquer.py` : modifier ce script, puis le relancer, plutôt
que les fichiers JSON à la main).

| Fichier | Rôle |
|---|---|
| `1-reference.json` | Le personnage de référence, de face et en pied, en style HeartGold sur fond magenta (Qwen-Image 2512, 4 images par lancement). |
| `2-variations.json` | À partir de la référence (ou d'une image du jeu) : sprite de terrain de face, profil gauche, de dos, et portrait de combat (Qwen-Image-Edit 2511). |
| `3-pixel-net.json` | Le passage au pixel près seul, pour n'importe quelle image. |

Chaque sortie est enregistrée deux fois dans `ComfyUI/output/odyssee/` : l'image brute, et l'image ramenée à sa vraie grille
avec une palette réduite (`…_pixel`), celle à garder.

## À installer

Nœuds (par le ComfyUI Manager, ou `git clone` dans `ComfyUI/custom_nodes/`) :

- **ComfyUI-PixelArt-Detector** (dimtoneff) : nœud « PixelArt Detector (Image->) ».
- ComfyUI à jour (les nœuds Qwen-Image-Edit 2511 et `CFGNorm` sont dans ComfyUI lui-même).

Modèles :

| Dossier de `ComfyUI/models/` | Fichier | Où le trouver |
|---|---|---|
| `diffusion_models` | `qwen_image_2512_fp8_e4m3fn.safetensors` | Comfy-Org/Qwen-Image_ComfyUI |
| `diffusion_models` | `qwen_image_edit_2511_bf16.safetensors` (ou une version fp8 / GGUF plus légère) | Comfy-Org/Qwen-Image-Edit_ComfyUI |
| `text_encoders` | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | Comfy-Org/Qwen-Image_ComfyUI |
| `vae` | `qwen_image_vae.safetensors` | Comfy-Org/Qwen-Image_ComfyUI |
| `loras` | `Qwen-Image-Lightning-4steps-V1.0.safetensors` | lightx2v/Qwen-Image-Lightning |
| `loras` | `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | lightx2v/Qwen-Image-Edit-2511-Lightning |
| `loras` (facultatif) | Pixel Art Redmond pour Qwen-Image 2512 | artificialguybr/PIXELART-REDMOND-QWENIMAGE |
| `loras` (facultatif) | planche de marche 32 × 48 pour Qwen-Image-Edit 2511 | Leon1000/pixel_spritesheet_4walk_combat_32x48_v1 |

Si un nom de fichier diffère chez toi, le nœud s'affiche en rouge : choisis le bon fichier dans sa liste déroulante.
Les deux LoRA facultatives sont **contournées** au départ (nœud grisé) : Ctrl+B dessus pour les activer.

## Réglages

- Rapide par défaut : LoRA Lightning, 4 étapes, CFG 1, euler / simple. Pour plus de qualité : contourner la LoRA Lightning,
  40 étapes, CFG 4.
- Nombre de couleurs du passage au pixel près : 24 pour les sprites de terrain, 32 pour le portrait de combat.
- Les consignes sont en anglais (mieux comprises) ; le style HeartGold et le fond magenta y sont déjà écrits, il suffit de
  décrire le personnage à l'étape 1.

## Déroulé conseillé

1. `1-reference.json` : décrire le personnage, lancer, garder la meilleure des 4 images.
2. `2-variations.json` : charger cette référence ; garder le meilleur sprite de face et le meilleur portrait.
3. Relancer profil et dos en chargeant cette fois le **sprite de face réussi** : ils lui ressembleront davantage.
4. Les pas de marche ne se génèrent pas : un script les tire des poses debout (jambes décalées d'un ou deux pixels, corps
   qui monte d'un pixel), puis la planche 256 × 192 va dans `assets/graphics/persos64/` et le portrait 64 × 80 dans
   `assets/graphics/portraits-combat/` (voir `tools/odyssee-persos64.py`).

Pour essayer sur le jeu : charger dans `2-variations.json` un portrait de `assets/graphics/portraits-combat/` (par exemple
`aurele.png`) et regarder ce que donnent les sprites de terrain, à comparer avec `assets/graphics/persos64/aurele.png`.
