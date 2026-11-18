# Workflows ComfyUI pour les personnages d'Odyssée

Quatre workflows à glisser dans ComfyUI (ils sont écrits par `fabriquer.py` : modifier ce script, puis le relancer, plutôt
que les fichiers JSON à la main).

| Fichier | Rôle |
|---|---|
| `1-reference.json` | Le personnage de référence en style HeartGold sur fond magenta, avec FLUX.2 Klein 4B et notre LoRA HGSS (4 images par lancement, quelques secondes sur 12 Go). |
| `1-reference-qwen.json` | L'ancienne étape 1 sur Qwen-Image 2512, sans LoRA HGSS. |
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
| `diffusion_models` | `flux-2-klein-4b.safetensors` (rapide, 4 étapes ; `flux-2-klein-base-4b` pour 20 étapes) | Comfy-Org/flux2-klein |
| `text_encoders` | `qwen_3_4b.safetensors` | Comfy-Org/flux2-klein |
| `vae` | `flux2-vae.safetensors` | Comfy-Org/flux2-dev |
| `loras` | `hgss_klein4b.safetensors` : notre LoRA, à entraîner (voir plus bas) | — |
| `loras` (facultatif) | Pixel Art Redmond pour Qwen-Image 2512 | artificialguybr/PIXELART-REDMOND-QWENIMAGE |
| `loras` (facultatif) | `pixel_4walk_32x48_qwen_image_edit_2511_v1.safetensors` (planche de marche 32 × 48 ; les fichiers `…_000001750`, `…_2000`, `…_2500` sont des étapes intermédiaires de l'entraînement, inutiles au départ) | svntax-dev (ou Leon1000)/pixel_spritesheet_4walk_combat_32x48_v1 |

Si un nom de fichier diffère chez toi, le nœud s'affiche en rouge : choisis le bon fichier dans sa liste déroulante.
Les LoRA facultatives (et la LoRA HGSS tant qu'elle n'est pas entraînée) sont **contournées** au départ (nœud grisé) : Ctrl+B dessus pour les activer.

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

## Entraîner la LoRA HGSS (FLUX.2 Klein 4B, 12 Go)

ComfyUI ne sait pas entraîner Klein de façon fiable : on passe par **AI-Toolkit** (ostris), une appli à part avec sa page web.
Tout est prêt dans `entrainement/` :

- `hgss_klein4b.yaml` : les réglages (Klein 4B base, quantifié en fp8, `low_vram`, 1024 px, rang 32, 2 000 pas,
  une LoRA et 3 images d'essai tous les 250 pas) ;
- `lancer-entrainement.bat` : lance l'entraînement sous Windows.

1. Installer AI-Toolkit dans `C:\ai-toolkit` (suivre son README : `git clone`, `python -m venv venv`, torch, `pip install -r requirements.txt`).
2. Jeu de données : dézipper `lora_hgss_platine.zip` et copier ses dossiers `marche\` et `combat\` dans
   `C:\ai-toolkit\datasets\hgss\` (sans `natif\`). Chaque image garde son `.txt`.
3. Copier `hgss_klein4b.yaml` dans `C:\ai-toolkit\config\`, puis double-cliquer sur `lancer-entrainement.bat`.
   Le modèle (~15 Go) se télécharge tout seul au premier lancement. Autre chemin : interface d'AI-Toolkit
   (`cd ui`, `npm run build_and_start`, http://localhost:8675), New Job → Advanced, coller le fichier.
4. Les LoRA tombent dans `C:\ai-toolkit\output\hgss_klein4b\`, avec les images d'essai à côté (`samples\`). Choisir la
   meilleure à l'œil (souvent entre 750 et 1 500 pas), la copier dans `ComfyUI\models\loras\hgss_klein4b.safetensors`,
   puis dans `1-reference.json` : Ctrl+B sur le nœud LoRA HGSS.

Durée sur une RTX 3080 Ti : environ 2 à 4 h pour 2 000 pas, plus 15 à 30 min au départ (encodage des 458 images et des légendes).
Pendant ce temps, fermer ComfyUI et le navigateur. Si la mémoire manque : `resolution` ne baisse pas (la grille des pixels se
brouillerait), baisser plutôt `linear` à 16, ou activer `layer_offloading` dans `model`.

Un dossier ailleurs que `C:\ai-toolkit` : corriger les deux `folder_path` du `.yaml` et la ligne `cd` du `.bat`.
