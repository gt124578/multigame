// odyssee/moteur/donnees/platine.js — l'Arène de Frimapic de Pokémon Platine, à l'identique, lue au chargement dans
// le dépôt public de la décompilation (pret/pokeplatinum, commit épinglé) : rien de Nintendo n'est copié ici.
//
// Ce qui vient du jeu, sans retouche :
//   - la grille de la salle (fichier de carte map_data_234 : 32 × 32 cases, collisions et comportements : glace,
//     cases bloquées dans un axe, tapis de sortie) ;
//   - le relief (bloc BDHC du même fichier : plaques planes et pentes à 45° ; on lit la hauteur au centre de chaque case,
//     en demi-cases) ;
//   - les événements (events.json : GLADYS, le guide, les six Topdresseurs, les dix-neuf boules de neige, les statues,
//     la sortie) ;
//   - pour le rendu : le modèle 3D de la salle, son jeu de textures et ses accessoires (render/platine3d.js).
// Les règles de la glace à pentes sont celles du code du jeu (player_move.c), reprises dans engine/terrain.js.
// Ce qui est à nous : les dialogues, les équipes des dresseurs, le branchement dans Johto.

import { BLOC, MB, BAS, HAUT, GAUCHE, DROITE } from '../engine/const.js';
import { SOLS } from './auteur.js';

export const PLATINE = 'https://raw.githubusercontent.com/pret/pokeplatinum/485c400f9d7bad10d906d556ba23e5e46d5b3e5e/';
export const FICHIERS_FRIMAPIC = {
  carte: 'res/field/mapmodels/data/map_data_234.bin',
  evenements: 'res/field/maps/snowpoint_city_gym/events.json',
  textures: 'res/field/mapmodels/texture_sets/map_texture_set_027.nsbtx',
  accessoires: { 78: 'res/field/props/models/prop_model_078.nsbmd', 152: 'res/field/props/models/prop_model_152.nsbmd' },
  boule: 'res/graphics/field_effects/snowpoint_gym_snowball.nsbmd',
};

/** fichier de carte de Platine (« land data ») : en-tête de 4 tailles, puis permissions, accessoires, modèle, relief */
export function lireCarte(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const [nPerm, nAcc, nMod, nBdhc] = [0, 4, 8, 12].map((o) => d.getUint32(o, true));
  const perm = [];
  for (let i = 0; i < 1024; i++) perm.push(d.getUint16(16 + 2 * i, true));
  const accessoires = [];
  for (let i = 0; i < nAcc / 48; i++) {
    const o = 16 + nPerm + 48 * i, f = (k) => d.getInt32(o + 4 + 4 * k, true) / 4096 / 16;
    accessoires.push({ id: d.getUint32(o, true), x: f(0), y: f(1), z: f(2) });
  }
  const oMod = 16 + nPerm + nAcc;
  return { perm, accessoires, modele: buf.slice(oMod, oMod + nMod), relief: lireBdhc(buf.slice(oMod + nMod, oMod + nMod + nBdhc)) };
}

/** relief BDHC → hauteur (en cases) au point (x, z) en cases depuis le coin nord-ouest de la carte */
export function lireBdhc(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (String.fromCharCode(...buf.slice(0, 4)) !== 'BDHC') throw new Error('relief BDHC absent');
  const [nP, nN, nC, nPl] = [4, 6, 8, 10].map((o) => d.getUint16(o, true));
  let q = 16;
  const pts = []; for (let i = 0; i < nP; i++, q += 8) pts.push([d.getInt32(q, true), d.getInt32(q + 4, true)]);
  const nor = []; for (let i = 0; i < nN; i++, q += 12) nor.push([d.getInt32(q, true), d.getInt32(q + 4, true), d.getInt32(q + 8, true)]);
  const con = []; for (let i = 0; i < nC; i++, q += 4) con.push(d.getInt32(q, true));
  const pl = []; for (let i = 0; i < nPl; i++, q += 8) pl.push([0, 2, 4, 6].map((k) => d.getUint16(q + k, true)));
  return {
    /** sens de la montée de la plaque sous (x, z) : [gx, gz] dans { -1, 0, 1 } (0, 0 à plat) */
    pente(x, z) {
      const X = (x * 16 - 256) * 4096, Z = (z * 16 - 256) * 4096;
      for (const [a, b, n] of pl) {
        const [p1, p2] = [pts[a], pts[b]];
        if (X < Math.min(p1[0], p2[0]) || X > Math.max(p1[0], p2[0]) || Z < Math.min(p1[1], p2[1]) || Z > Math.max(p1[1], p2[1])) continue;
        const [nx, , nz] = nor[n];
        return [-Math.sign(nx), -Math.sign(nz)];
      }
      return [0, 0];
    },
    /** hauteur en cases ; null hors de toute plaque. Le jeu prend la plaque la plus proche de la hauteur actuelle ;
     *  ici chaque case n'en a qu'une */
    hauteur(x, z) {
      const X = (x * 16 - 256) * 4096, Z = (z * 16 - 256) * 4096;
      for (const [a, b, n, k] of pl) {
        const [p1, p2] = [pts[a], pts[b]];
        if (X < Math.min(p1[0], p2[0]) || X > Math.max(p1[0], p2[0]) || Z < Math.min(p1[1], p2[1]) || Z > Math.max(p1[1], p2[1])) continue;
        const [nx, ny, nz] = nor[n];
        if (!ny) continue;
        return -((nx * X + nz * Z) / 4096 + con[k]) / ny / 16;
      }
      return null;
    },
  };
}

// comportements de Platine → ceux du moteur
const COMPORTEMENTS = { 0x20: MB.GLACE, 0x49: MB.BLOQUE_NS, 0x4a: MB.BLOQUE_EO, 0x65: MB.TAPIS_BAS };
const S = Object.fromEntries(SOLS.map((n, i) => [n, i]));

/** équipes et dialogues des dresseurs (à nous) ; les places, les regards et la portée viennent du jeu */
const DRESSEURS = {
  LOCALID_ACE_TRAINER_ANTON: { nom: 'Ace Trainer Anton', equipe: [['Farfuret', 36], ['Blizzi', 37]], dit: 'Sliding is an art form!', perd: 'I skidded...' },
  LOCALID_ACE_TRAINER_SAVANNAH: { nom: 'Ace Trainer Savannah', equipe: [['Stalgamin', 36], ['Lippoutou', 38]], dit: 'You smashed all those snowballs?', perd: 'I melted...' },
  LOCALID_ACE_TRAINER_ALICIA: { nom: 'Ace Trainer Alicia', equipe: [['Otaria', 36], ['Lamantine', 38]], dit: 'The cold sharpens the mind!', perd: 'Brrr...' },
  LOCALID_ACE_TRAINER_ISAIAH: { nom: 'Ace Trainer Isaiah', equipe: [['Marcacrin', 35], ['Cochignon', 37]], dit: 'Build up speed before you charge!', perd: 'Too much speed for me.' },
  LOCALID_ACE_TRAINER_BRENNA: { nom: 'Ace Trainer Brenna', equipe: [['Momartik', 38]], dit: 'Candice is the strongest!', perd: 'She is still the strongest...' },
  LOCALID_ACE_TRAINER_SERGIO: { nom: 'Ace Trainer Sergio', equipe: [['Blizzi', 36], ['Oniglali', 38]], dit: 'You climb slopes with speed!', perd: 'And you go down them fast...' },
};
const SPRITES = { OBJ_EVENT_GFX_ACE_TRAINER_SNOW_M: 'topdresseur_neige_m', OBJ_EVENT_GFX_ACE_TRAINER_SNOW_F: 'topdresseur_neige_f',
  OBJ_EVENT_GFX_CANDICE: 'gladys', OBJ_EVENT_GFX_GYM_GUIDE: 'guide_arene' };
const DIRS = { DIR_NORTH: HAUT, DIR_SOUTH: BAS, DIR_WEST: GAUCHE, DIR_EAST: DROITE };
/** types de mouvement de Platine → ceux du moteur (un regard qui tourne entre plusieurs sens : regard au hasard) */
const MOUVEMENTS = (m) => (/^MOVEMENT_TYPE_LOOK_(NORTH|SOUTH|EAST|WEST)$/.test(m) ? 'fixe' : m.startsWith('MOVEMENT_TYPE_LOOK_') ? 'regard_alea' : 'fixe');

/**
 * Construit l'arène à partir des fichiers du jeu. `lire(chemin)` rend un Uint8Array (fetch dans le navigateur, fichier
 * local dans Node). Rend { blocs, mondes, zones } à fusionner dans les données du moteur.
 * `sortie` : { vers, n } où mène le tapis de sortie.
 */
export async function frimapic(lire, sortie) {
  const C = lireCarte(await lire(FICHIERS_FRIMAPIC.carte));
  const ev = JSON.parse(new TextDecoder().decode(await lire(FICHIERS_FRIMAPIC.evenements)));
  const N = BLOC * BLOC;
  const col = new Array(N).fill(1), mb = new Array(N).fill(0), h = new Array(N).fill(0), sol = new Array(N).fill(S.vide), pente = new Array(N).fill(0);
  for (let z = 0; z < BLOC; z++) for (let x = 0; x < BLOC; x++) {
    const k = z * BLOC + x, v = C.perm[k];
    const haut = C.relief.hauteur(x + 0.5, z + 0.5);
    if (haut === null) continue;                       // hors de la salle
    col[k] = v & 0x8000 ? 1 : 0;
    mb[k] = COMPORTEMENTS[v & 0xff] ?? MB.NORMAL;
    h[k] = Math.round(haut * 2);                      // en demi-cases (un niveau = une demi-case, voir `niv`)
    const [gx, gz] = C.relief.pente(x + 0.5, z + 0.5);
    pente[k] = gx || gz ? 1 + (gx + 1) * 3 + (gz + 1) : 0;
    sol[k] = mb[k] === MB.GLACE ? S.glace : S.neige;
  }
  const bloc = { col, mb, h, sol, pente, decor: [{ type: 'terrain_pt', ...FICHIERS_FRIMAPIC, accessoiresPoses: C.accessoires }] };

  const objets = [], panneaux = [], warps = [];
  for (const o of ev.object_events) {
    const base = { id: o.id.replace('LOCALID_', '').toLowerCase(), x: o.x, y: o.z, dir: DIRS[o.initial_dir] ?? BAS, mouvement: MOUVEMENTS(o.movement_type) };
    if (o.graphics_id === 'OBJ_EVENT_GFX_SNOWBALL') { objets.push({ ...base, boule: true, modele3d: 'boule', mouvement: 'fixe', drapeau: 'TMP_BOULE_' + base.id }); continue; }
    if (o.id === 'LOCALID_CANDICE') {
      objets.push({ ...base, sprite: 'gladys', nom: 'Leader Candice', dresseur: { portee: 0, champion: true, portrait: 'frimas', prix: 4400,
        script: 'Gladys_Defi', apres: 'Gladys_Apres', equipe: [['Farfuret', 38], ['Cochignon', 38], ['Blizzaroi', 42], ['Momartik', 44]].map(([espece, niveau]) => ({ espece, niveau })) } });
      continue;
    }
    if (o.id === 'LOCALID_GYM_GUIDE') { objets.push({ ...base, sprite: 'guide_arene', script: 'GuideFrimapic' }); continue; }
    const t = DRESSEURS[o.id];
    if (!t) continue;
    const n = base.id;
    objets.push({ ...base, sprite: SPRITES[o.graphics_id], nom: t.nom, dresseur: { portee: o.trainer?.sight_range ?? 1, portrait: o.graphics_id.endsWith('_F') ? 'serena' : 'calem',
      script: n + '_Defi', apres: n + '_Apres', equipe: t.equipe.map(([espece, niveau]) => ({ espece, niveau })) } });
  }
  for (const b of ev.bg_events) panneaux.push({ x: b.x, y: b.z, depuis: HAUT, script: 'StatueFrimapic' });
  for (const w of ev.warp_events) warps.push({ x: w.x, y: w.z, ...sortie });
  const dresseurs = Object.entries(DRESSEURS).map(([id, t]) => {
    const n = id.replace('LOCALID_', '').toLowerCase();
    return `script ${n}_Defi\n  message "${t.dit}"\n  combat_dresseur\n  message "${t.perd}"\n  liberer\n  fin\nscript ${n}_Apres\n  regarder_joueur\n  message "${t.dit}"\n  liberer\n  fin\n`;
  }).join('');

  return {
    blocs: { frimapic: bloc },
    // le relief est en demi-cases : un niveau = 0,5 case ; pas de mur entre deux hauteurs (les pentes du jeu)
    mondes: { frimapic: { largeur: 1, hauteur: 1, blocs: ['frimapic'], zones: ['ARENE_FRIMAPIC'], pentes: true, niv: 0.5 } },
    zones: {
      ARENE_FRIMAPIC: {
        nom: 'Snowpoint Gym', annonce: false, musique: 'arene', camera: 'interieur', interieur: true, velo: false, course: false,
        warps, panneaux, objets,
        scripts: `
script Gladys_Defi
  message "I'm Candice, the Snowpoint Gym Leader!\\nMy Ice Pokémon have diamond-hard focus. Ready?"
  combat_dresseur
  message "Wow! Your focus is impressive.\\nYou deserve the Icicle Badge!"
  drapeau BADGE_GLACON
  son fanfare
  message "{JOUEUR} received the Icicle Badge!"
  liberer
  fin
script Gladys_Apres
  regarder_joueur
  message "Keep your cool, {JOUEUR}, and nothing will stop you!"
  liberer
  fin
script GuideFrimapic
  regarder_joueur
  si drapeau BADGE_GLACON aller GuideFrimapic_Bravo
  message "Hey, Champ in the making! Everything here is ice and slopes.\\nSlide down a slope to build speed: at full speed you smash the snowballs!"
  message "Without speed you can't climb a slope: you'll slide back down."
  liberer
  fin
GuideFrimapic_Bravo:
  message "You beat Candice! Now that's sliding!"
  liberer
  fin
script StatueFrimapic
  message "SNOWPOINT CITY POKéMON GYM\\nLEADER: CANDICE"
  fin
` + dresseurs,
      },
    },
  };
}
