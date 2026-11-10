// Fief Maudit : prépare les modèles du jeu à partir des packs CC0 d'origine.
//
//   git clone https://github.com/J-Ponzo/gltf-medieval-village-megakit
//   git clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
//   git clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
//   npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp   (dans un dossier à part)
//   node tools/fief-assets.mjs <dossier des trois clones>
//
// Sorties dans fief/models/ :
//   village.glb          les pièces du Medieval Village MegaKit retenues (un nœud par pièce, nommé comme le fichier d'origine),
//                        textures partagées en WebP (couleur 1024 px, relief 512 px)
//   persos/<nom>.glb     les personnages KayKit sans leurs animations (texture en WebP 512 px)
//   anims.glb            le squelette d'animation et les clips communs (tirés du Chevalier)
//   anims-squelettes.glb les clips propres aux squelettes (réveil, mort, résurrection), tirés du Squelette
//   armes-squelettes.glb les armes des squelettes (un nœud par arme), à accrocher aux mains
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, textureCompress, mergeDocuments, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = process.argv[2];
if (!SRC) { console.error('usage : node tools/fief-assets.mjs <dossier des clones>'); process.exit(1); }
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fief', 'models');
fs.mkdirSync(path.join(OUT, 'persos'), { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const KIT = path.join(SRC, 'gltf-medieval-village-megakit', 'glTF');
const ADV = path.join(SRC, 'KayKit-Character-Pack-Adventures-1.0', 'addons', 'kaykit_character_pack_adventures', 'Characters', 'gltf');
const SKL = path.join(SRC, 'KayKit-Character-Pack-Skeletons-1.0', 'addons', 'kaykit_character_pack_skeletons', 'Characters', 'gltf');

// ------------------------------------------------------------------ village
export const PIECES = [
  'Wall_Plaster_Straight', 'Wall_Plaster_WoodGrid', 'Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Window_Thin_Round', 'Wall_Plaster_Door_Round',
  'Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Window_Wide_Round', 'Wall_UnevenBrick_Window_Thin_Round', 'Wall_UnevenBrick_Door_Round', 'Wall_Arch', 'Wall_BottomCover',
  'Corner_Exterior_Brick', 'Corner_Exterior_Wood',
  'Door_8_Round', 'DoorFrame_Round_Brick', 'DoorFrame_Round_WoodDark',
  'Window_Wide_Round1', 'Window_Thin_Round1', 'WindowShutters_Wide_Round_Open', 'WindowShutters_Thin_Round_Open', 'WindowShutters_Wide_Round_Closed',
  'Floor_WoodDark', 'Floor_UnevenBrick', 'Floor_Brick',
  'Roof_RoundTiles_4x4', 'Roof_RoundTiles_4x6', 'Roof_RoundTiles_4x8', 'Roof_RoundTiles_6x6', 'Roof_RoundTiles_6x8', 'Roof_RoundTiles_6x10',
  'Roof_Front_Brick4', 'Roof_Front_Brick6', 'Roof_Tower_RoundTiles', 'Roof_Log', 'Roof_Support2',
  'Prop_Brick1', 'Prop_Brick2', 'Prop_Brick3', 'Prop_Brick4', 'Prop_Chimney', 'Prop_Crate', 'Prop_Wagon', 'Prop_Support',
  'Prop_WoodenFence_Single', 'Prop_WoodenFence_Extension1', 'Prop_MetalFence_Simple',
  'Prop_Vine1', 'Prop_Vine2', 'Prop_Vine5', 'Prop_Vine6', 'Prop_ExteriorBorder_Straight1', 'Prop_ExteriorBorder_Corner',
  'Stairs_Exterior_Straight', 'Stairs_Exterior_Platform',
];

async function village() {
  const doc = new Document();
  for (const name of PIECES) {
    const part = await io.read(path.join(KIT, name + '.gltf'));
    // un seul nœud racine par pièce, au nom de la pièce
    const scene = part.getRoot().listScenes()[0];
    const kids = scene.listChildren();
    if (kids.length === 1) kids[0].setName(name);
    else { const g = part.createNode(name); for (const k of kids) { scene.removeChild(k); g.addChild(k); } scene.addChild(g); }
    mergeDocuments(doc, part);
  }
  // une seule scène qui porte toutes les pièces
  const root = doc.getRoot(), [first, ...rest] = root.listScenes();
  for (const s of rest) { for (const k of s.listChildren()) { s.removeChild(k); first.addChild(k); } s.dispose(); }
  // les cartes de rugosité et ORM alourdissent sans se voir dans ce style : on garde couleur + relief
  for (const m of root.listMaterials()) {
    const r = m.getMetallicRoughnessTexture(); if (r) m.setMetallicRoughnessTexture(null);
    m.setOcclusionTexture(null); m.setRoughnessFactor(0.92); m.setMetallicFactor(0);
  }
  await doc.transform(
    dedup(), prune(), unpartition(), weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [1024, 1024], slots: /^(baseColor|emissive)/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86, resize: [512, 512], slots: /^normal/ }),
    quantize(),
  );
  await io.write(path.join(OUT, 'village.glb'), doc);
}

// ------------------------------------------------------------------ personnages
const HEROS = ['Barbarian', 'Knight', 'Rogue', 'Mage', 'Rogue_Hooded'];
const SQUELETTES = ['Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage'];

// supprimer une animation et ses données (sinon les tableaux de clés restent dans le fichier)
function dropAnim(a) {
  for (const s of a.listSamplers()) { const i = s.getInput(), o = s.getOutput(); s.dispose(); if (i && !i.listParents().some((p) => p.propertyType !== 'Root')) i.dispose(); if (o && !o.listParents().some((p) => p.propertyType !== 'Root')) o.dispose(); }
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}

async function perso(file, out) {
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) dropAnim(a);
  await doc.transform(dedup(), prune({ keepLeaves: true }), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [512, 512] }), quantize({ quantizeSkin: false }));
  await io.write(out, doc);
}

// clips communs à tous (héros et squelettes partagent le même squelette d'animation)
const CLIPS = [
  'Idle', 'Unarmed_Idle', 'Walking_A', 'Walking_B', 'Walking_Backwards', 'Running_A', 'Running_B', 'Running_Strafe_Left', 'Running_Strafe_Right',
  'Jump_Start', 'Jump_Idle', 'Jump_Land', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab',
  '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Idle', 'Block', 'Blocking', 'Block_Hit', 'Interact', 'PickUp', 'Use_Item', 'Throw',
  'Hit_A', 'Hit_B', 'Death_A', 'Death_A_Pose', 'Lie_Down', 'Lie_Idle', 'Lie_StandUp', 'Cheer', 'Spellcast_Raise', 'Spellcast_Shoot',
  '2H_Ranged_Aiming', '2H_Ranged_Shoot', '2H_Ranged_Reload', 'Sit_Floor_Down', 'Sit_Floor_Idle', 'Sit_Floor_StandUp',
];
const CLIPS_SQUELETTES = ['Skeletons_Awaken_Floor', 'Skeletons_Awaken_Floor_Long', 'Skeletons_Inactive_Floor_Pose', 'Death_C_Skeletons', 'Death_C_Skeletons_Resurrect', 'Spawn_Ground_Skeletons', 'Spellcast_Summon', 'Running_C', 'Walking_C', 'Idle_Combat'];

async function anims(file, keep, out) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!keep.includes(a.getName())) dropAnim(a);
  // on ne garde que le squelette : plus aucun maillage
  for (const n of root.listNodes()) if (n.getMesh()) { n.setMesh(null); n.setSkin(null); }
  for (const m of root.listMeshes()) m.dispose();
  await doc.transform(prune({ keepLeaves: true }), dedup());
  const got = root.listAnimations().map((a) => a.getName());
  const missing = keep.filter((k) => !got.includes(k));
  if (missing.length) console.warn('clips absents :', missing.join(', '));
  await io.write(out, doc);
}

// armes des squelettes : un seul fichier, un nœud par arme
const ARMES = ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Shield_Large_A', 'Skeleton_Shield_Small_A', 'Skeleton_Staff', 'Skeleton_Crossbow'];
async function armes() {
  const doc = new Document();
  const dir = path.join(SRC, 'KayKit-Character-Pack-Skeletons-1.0', 'addons', 'kaykit_character_pack_skeletons', 'Assets', 'gltf');
  for (const name of ARMES) {
    const part = await io.read(path.join(dir, name + '.gltf'));
    const scene = part.getRoot().listScenes()[0], kids = scene.listChildren();
    if (kids.length === 1) kids[0].setName(name);
    else { const g = part.createNode(name); for (const k of kids) { scene.removeChild(k); g.addChild(k); } scene.addChild(g); }
    mergeDocuments(doc, part);
  }
  const root = doc.getRoot(), [first, ...rest] = root.listScenes();
  for (const s of rest) { for (const k of s.listChildren()) { s.removeChild(k); first.addChild(k); } s.dispose(); }
  await doc.transform(dedup(), prune(), unpartition(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [512, 512] }), quantize());
  await io.write(path.join(OUT, 'armes-squelettes.glb'), doc);
}

await armes();
await village();
for (const n of HEROS) await perso(path.join(ADV, n + '.glb'), path.join(OUT, 'persos', n.toLowerCase() + '.glb'));
for (const n of SQUELETTES) await perso(path.join(SKL, n + '.glb'), path.join(OUT, 'persos', n.toLowerCase() + '.glb'));
await anims(path.join(ADV, 'Knight.glb'), CLIPS, path.join(OUT, 'anims.glb'));
await anims(path.join(SKL, 'Skeleton_Minion.glb'), CLIPS_SQUELETTES, path.join(OUT, 'anims-squelettes.glb'));
console.log('ok');
