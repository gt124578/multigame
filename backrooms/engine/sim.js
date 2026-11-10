// The Backrooms - Moteur de simulation (60 Hz), sans DOM
// Plusieurs joueurs possibles (l'hôte fait autorité). Deux niveaux :
//   Level 0 : deux étages superposés (on tombe par les trous du haut, on remonte par les escaliers ; celui du bas est
//             plus petit). 6 cassettes VHS réparties entre les étages ; un ascenseur à chaque étage, mais un seul est le
//             vrai : quand les 6 cassettes sont trouvées, le faux se referme en mur et le vrai s'ouvre.
//   Level 1 : l'entrepôt ; 3 fusibles à rapporter au panneau du monte-charge, des coupures de courant, et l'entité
//             qui se cache au bout des rangées d'étagères pour tendre des embuscades.
//   Level 37 (numéro interne 2) : les Poolrooms (engine/poolrooms.js) ; 3 volants de vanne, puis trois toboggans.
//   Level 2 (numéro interne 3, derrière le toboggan jaune des Poolrooms) : les galeries de service ; 4 vannes à
//             tourner (rester devant) pour couper la vapeur qui bloque l'ascenseur de service, des jets de vapeur
//             brûlante en travers des couloirs (ils repoussent). Pas d'entité ici : un troupeau de chèvres noires qui
//             fonce sur les joueurs, mais craint la lumière (engine/goats.js).
// Le rythme est réglé par le directeur de tension (engine/director.js) : montée, pic, relâche, fausses alertes.
// L'entité voit dans un cône et entend le bruit qu'on fait (marcher, courir, tomber, ramasser) ; accroupi, on ne fait
// presque aucun bruit. Sa première prise n'est pas mortelle : on se débat, ou un coéquipier l'aveugle à la lampe.
// Qui entre dans l'ascenseur ouvert devient spectateur ; il part quand plus personne n'est dehors. Plus il y a de
// monde dans la cabine, plus l'entité s'énerve contre ceux qui restent.
// Chacun part avec sa lampe torche dans la case 1. Un joueur attrapé regarde les autres jusqu'à la fin de l'étage ;
// si l'équipe le termine, tout le monde repart à l'étage suivant, lampe en main.
import { CELL_SIZE, T, CASSETTES, createLevel0, PIT_HALF, FLOOR_DY, bfs, pillarDist, segHitsPillar } from './map.js';
import { createWarehouseMap, DOCK_PASS, guardDoorWant } from './level1.js';
import { createPoolMap, MOUTH } from './poolrooms.js';
import { createHotelMap, WORDS, LETTERS, HIDE_R as SPOT_R, MAIL_R, KEYPAD_R, LETTER_R } from './hotel.js';
import { createPipesMap, VALVES, PIPES_LEVEL, jetState, inJet, JET_HALF } from './level2.js';
import { hasLineOfSight } from './nav.js';
import { planTo, move as gaitMove, faceTo, shove, stagger, feetOf, cageAt, BODY_R, roamable } from './gait.js';
import { Track } from './interp.js';
import { createGoats, updateGoats, senseGoats, alertGoats, goatSnapshot, applyGoatSnapshot, goatCount } from './goats.js';
import { createDirector, updateDirector, blackoutAllowed, entityRelaxed, updateLightsOut, lightsChanged } from './director.js';
import { placeHides, HIDE_R, LOCKER_R, BREATH_HOLD, BREATH_BACK, hideInside, hideFront } from './hides.js';

export const DT = 1 / 60;
export const PLAYER_RADIUS = 0.38;
// On avance lentement dans les Backrooms : la carte est immense et chaque pas compte
export const WALK_SPEED = 2.1;
export const SPRINT_SPEED = 4.4; // la course : nettement plus vite que la marche (l'entité en chasse reste en dessous)
export const MONSTER_PATROL_SPEED = 1.8;
export const MONSTER_CHASE_SPEED = 3.3; // plus vite qu'en marchant, un peu moins qu'en sprintant
export const CHASE_MIN = 1.45; // en chasse, au moins 1,45 fois la marche (3 m/s), toujours sous le sprint
export const CROUCH_SPEED = 0.5; // accroupi : moitié moins vite, presque sans bruit
// le saut : un petit bond (0,35 m, 0,4 s en l'air) ; même en courant on ne franchit pas un trou (2 m)
export const JUMP_V = 3.4;
export const JUMP_G = 17;
// en l'air, on garde son élan (la vitesse prise à l'appel) ; les touches ne font que l'infléchir, de 3 m/s² au plus
export const AIR_ACCEL = 3;
// La soif : on court sans fin, mais on se déshydrate peu à peu (plus vite en courant). Sous THIRST_BLUR, la vue se
// brouille de plus en plus ; à sec, on s'effondre. L'eau d'amande désaltère
export const WATER_DRAIN = 100 / 540; // par seconde : 9 minutes d'une gourde pleine à sec, en marchant
export const WATER_RUN = 1.7; // en courant, on se déshydrate 1,7 fois plus vite
export const THIRST_BLUR = 35; // en dessous, la vue se brouille (de plus en plus jusqu'à 0)
export const WATER_LEVEL_MIN = 55; // un nouvel étage : on repart au moins avec ça (on a bu ce qu'on a trouvé en route)
export const LOSE_TRACK_T = 4; // secondes sans voir le joueur avant que l'entité ne le perde
export const BATTERY_DRAIN = 0.42; // % par seconde de lampe allumée (environ 4 minutes pour une pile pleine)
export const CAM_DRAIN = 0.15; // % par seconde de caméscope sorti (V) : il tire sur la même pile que la lampe
export const BATTERY_PACK = 60; // % rendus par une pile utilisée
export const INV_SIZE = 2; // cases d'objets (piles, eau d'amande, échelle) : la case 1 de l'inventaire est réservée à la lampe
export const DROP_AHEAD = 0.55; // m : G pose l'objet choisi par terre, à cette distance devant soi
export const PICK_R = 1.4; // portée de F pour ramasser
export const ALMOND_WATER = 50; // une bouteille d'eau d'amande rend la moitié de la gourde
export const BLACKOUT_DRAIN = 1.5; // dans le noir d'une coupure, la lampe tire plus fort sur la pile
export const SIGNAL_RANGE = 34; // m : au-delà, le caméscope ne capte plus rien
// La prise : la première fois par niveau, l'entité agrippe au lieu de tuer. On se débat (GRAB_STRUGGLES appuis) ou un
// coéquipier lui braque sa lampe dans les yeux ; sinon, au bout de GRAB_T, c'est fini. Lâchée, elle reste sonnée.
export const GRAB_T = 2.6;
export const GRAB_STRUGGLES = 8;
export const MONSTER_STUN_T = 3;
// le bruit qu'on fait (0 à 1+) : il porte jusqu'à NOISE_RANGE × bruit mètres (moins à travers les murs)
// tout fait du bruit : accroupi presque rien, marcher un peu, courir beaucoup ; allumer la lampe, boire, changer les
// piles, sauter, ramasser… et la voix au micro (voir voice)
export const NOISE = { walk: 0.3, run: 1, crouch: 0.07, land: 0.55, pick: 0.45, use: 0.3, click: 0.18, fall: 1.6, breath: 0.12, panic: 0.3, gasp: 1.2 };
export const NOISE_RANGE = 13;
export const VOICE_MIN = 0.15; // niveau du micro en dessous duquel on ne compte pas (le souffle, la pièce)
export const DIN_RATE = 0.04; // le vacarme : parler une cinquantaine de secondes d'affilée le fait monter au maximum
export const DIN_DECAY = 0.006; // et il retombe en un peu moins de trois minutes de silence
export const VISION_CONE = 0.96; // demi-angle du regard de l'entité (55°) ; tout près, elle sent qu'on est là
export const DORMANT_T = 60; // au tout début, l'entité reste au loin une minute (on apprend à se déplacer)
const GLIMPSE_DARK_R = 9.5; // m : le noir qui entoure son apparition (et sa disparition) : ni elle, ni sa silhouette
export const PANEL_T = 4; // Level 1 : secondes devant le panneau du monte-charge pour le relancer (bruyant)
// Barre d'équilibre : sur une arête entre deux trous, on n'avance que tout droit et le corps tangue ; Q et D
// corrigent. tilt va de -1 (penché à gauche) à 1 (à droite) : au bout, on tombe dans le trou de ce côté.
export const BEAM_SPEED = 0.65; // vitesse de marche sur une arête (part de la marche normale)
// (réglé pour un joueur qui réagit en 0,4 s : il traverse ; sans rien faire, on tombe au bout de 6 s environ)
export const BEAM_UNSTABLE = 2; // plus on penche, plus on penche
export const BEAM_NOISE = [5, 8.5]; // à-coups au hasard (immobile, en marchant)
export const BEAM_FIX = 5; // force de Q / D
export const BEAM_DAMP = 3.5;
export const FALL_LOCK = 2.2; // secondes à terre après une chute d'un étage (plus d'une seconde de chute, puis sonné)
export const WHISTLE_CD = 1.2;
export const WHISTLE_HEAT = 2.5; // chaque coup compte 1 et s'oublie en 20 s : au 3e coup rapproché, l'entité vient à coup sûr
export { CASSETTES };
export const FUSES = 3;
export { VALVES, PIPES_LEVEL };
export const HOTEL_LEVEL = 4; // Level 5, le Terror Hotel (par le toboggan rouge des Poolrooms)
export const LAST_LEVEL = PIPES_LEVEL; // 0 : Level 0, 1 : Level 1 (entrepôt), 2 : Level 37 (Poolrooms), 3 : Level 2 (Tuyauteries, toboggan jaune), 4 : Level 5 (Terror Hotel, toboggan rouge)
export const VALVE_T = 6.5; // secondes devant une vanne pour la fermer (elle revient doucement si on la lâche) : on s'expose
export const VALVE_R = 1.5; // portée : il faut se tenir devant
export const BREAKER_T = 4.5; // secondes devant un disjoncteur pour le réarmer
export const BREAKER_R = 1.4;
// Level 1 : les quais du mur coupe-feu, les alarmes incendie, le poste de garde, les gaines de ventilation
export const DOCK_OPEN_T = 8; // secondes pour relever un rideau (le moteur peine, ça s'entend de loin : on a le temps d'avoir peur)
export const DOCK_CLOSE_T = 2.6; // pour le baisser
export const DOCK_FORCE_T = 3.2; // l'entité qui bute sur un rideau baissé s'acharne : il cède au bout de ce temps
export const USE_R = 1.35; // portée de F devant un boîtier, un déclencheur d'alarme, le fauteuil du poste
export const ALARM_T = 20; // la cloche sonne ce temps-là (l'entité y court, la frappe et la fait taire)
export const ALARM_R = 90; // et s'entend de presque tout l'entrepôt
export const DUCT_SPEED = 2.6; // m/s : elle rampe dans les gaines
export const DUCT_CD = [70, 110]; // secondes entre deux passages par les gaines
export const DUCT_MAX = 75; // m : jamais un trajet plus long dans les gaines (une demi-minute au plus)
export const DUCT_LAND = 0.75; // sa chute de la bouche jusqu'au sol (elle ne fait rien d'autre)
export const CCTV_FOV = 62; // champ vertical des caméras de surveillance (image 4:3)
const CCTV_HALF = Math.atan(Math.tan((CCTV_FOV / 2) * (Math.PI / 180)) * (4 / 3)); // la moitié de leur champ horizontal
const rnd2 = (v) => Math.round(v * 100) / 100;
export const BLOW_DELAY = 2.2; // la vanne fermée, les néons de son secteur grésillent puis sautent
export const BURN_LOCK = 0.9; // brûlé par un jet de vapeur : repoussé, sonné un instant
export const DEPART_T = 3; // secondes entre la fermeture des portes et l'arrivée
export const BOARD_T = 45; // Poolrooms : dès qu'un joueur est dans un toboggan, les autres ont ce temps pour le suivre
export const LIFT_CLOSE_T = 2; // le bouton pressé dans la cabine : les portes mettent ce temps à se fermer
export const LIFT_SHUT_T = 1.7; // … dont celui que mettent les vantaux à se rejoindre (à l'écran comme ici)
export const ARRIVE_T = 4.2; // à l'arrivée, la cabine finit de descendre (portes fermées) avant de s'ouvrir
export const LIFT_BAY = 0.6; // demi-largeur de la baie des portes de l'ascenseur : on n'entre dans la cabine que par là
export const LIFT_FACE = 0.19; // épaisseur de sa façade (cadre et portes)
// Level 0 : la 6e cassette trouvée, rien ne se passe pendant FINALE_WAIT secondes ; puis les néons s'éteignent un à un
// et, HUNT_DELAY plus tard (les feux rouges, les alarmes), l'entité sait où l'on est et ne lâche plus
export const FINALE_WAIT = 7;
export const HUNT_DELAY = 4.8;
export const DOOR_GAP = 0.32; // distance minimale entre le joueur et les murs (et la porte) de la cage d'escalier, vus du dehors
// coupures de courant du Level 1 : toutes les 45 à 80 s (et seulement après un moment de calme), pendant 15 à 20 s
export const BLACKOUT_EVERY = [45, 80];
export const BLACKOUT_LEN = [15, 20];
// Level 2 : de temps en temps, tout le courant saute ; plus rien ne protège, le troupeau passe à l'attaque
export const PIPES_BLACKOUT_EVERY = [85, 130];
export const PIPES_BLACKOUT_LEN = [11, 15];
// Level 0 : une seule panne, au milieu de la partie. La moitié des cassettes trouvée, elle tombe 8 à 30 s plus tard (au
// premier moment de calme, ou au plus tard 45 s après), et tout reste noir 25 à 35 s : plus de néons, plus de refuge
// sous la lumière, plus de signal
export const L0_BLACKOUT_DELAY = [8, 30];
export const L0_BLACKOUT_LEN = [25, 35];
export const L0_BLACKOUT_AT = Math.ceil(CASSETTES / 2);

const rand = (a, b) => a + Math.random() * (b - a);
const cellOf = (v) => Math.floor(v / CELL_SIZE);
export const STARE_R = 15; // la fixer à moins de 15 m (en la voyant vraiment) la provoque
export const STARE_T = 1.0; // … au bout d'une seconde (une demi-seconde à moins de 7 m)
export const NEAR_CHARGE = 6; // s'approcher à moins de 6 m d'elle quand elle observe : elle charge
// jamais plantée sous les yeux de quelqu'un : immobile, dans le cadre d'un joueur à moins de SEEN_R m, elle agit au
// bout de PLANTED_T secondes (elle charge, ou se glisse hors de vue)
export const PLANTED_T = 1.0;
export const SEEN_R = 26;
export const L0_AGGRO = 0.8; // Level 0 : son agressivité (1 : celle d'avant) ; ses tricheries et ses traques s'espacent d'autant
export const FRONT_TAPES = 3; // Level 0 : avant la 3e cassette, elle ne se lance jamais sur quelqu'un qui ne l'a pas vue
export const BACK_SHARE = 0.3; // ensuite, part des poursuites qui peuvent partir dans le dos
export const RUSH_WIND = 0.6; // secondes de cri sur place avant de s'élancer, quand on la découvre
export const SAW_T = 6; // secondes pendant lesquelles on « l'a vue » (elle peut alors se lancer)
export const CALM_HOLD = 45; // secondes de répit dans un recoin calme, avant que sa lampe grésille
export const HAUNT_COOLDOWN = 12; // un spectateur ne hante qu'une fois toutes les 12 s

// Les recoins calmes d'un étage du Level 0 : des culs-de-sac (une seule case voisine libre), loin du départ et les uns
// des autres. Une lampe chaude y brille, un air doux y joue : rien ne s'y passe… pendant un moment
export function findCalmNooks(map, seed, spawn) {
  const W = map.W;
  const free = new Set((map.walkable || []).map((c) => c.z * W + c.x));
  const stairs = new Set((map.stairs || []).flatMap((st) => st.cells.map((k) => k.gz * W + k.gx)));
  const hash = (i) => {
    let h = (i * 2654435761 + seed * 40503) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
    return (h ^ (h >>> 13)) / 4294967296;
  };
  const cands = [];
  for (const c of map.walkable || []) {
    const i = c.z * W + c.x;
    if (stairs.has(i) || (map.pitAt && map.pitAt(c.x, c.z) >= 0)) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => free.has((c.z + dz) * W + c.x + dx));
    if (nb.length !== 1) continue;
    const [dx, dz] = nb[0];
    if (stairs.has((c.z + dz) * W + c.x + dx)) continue;
    const x = (c.x + 0.5) * CELL_SIZE;
    const z = (c.z + 0.5) * CELL_SIZE;
    if (spawn && Math.hypot(x - spawn.x, z - spawn.z) < 18) continue;
    if (map.exit && Math.hypot(x - map.exit.x, z - map.exit.z) < 8) continue;
    cands.push({ x, z, gx: c.x, gz: c.z, dx: -dx || 0, dz: -dz || 0, cells: [{ x: c.x, z: c.z }, { x: c.x + dx, z: c.z + dz }], r: hash(i) });
  }
  cands.sort((a, b) => a.r - b.r);
  const out = [];
  for (const n of cands) {
    if (out.some((o) => Math.hypot(o.x - n.x, o.z - n.z) < 30)) continue;
    out.push({ x: n.x, z: n.z, gx: n.gx, gz: n.gz, dx: n.dx, dz: n.dz, cells: n.cells, wear: 0 });
    if (out.length >= 2) break;
  }
  return out;
}
// Level 0 : la clé de la cage d'escalier. La porte du haut est fermée au cadenas ; la clé traîne au fond d'une zone
// morte de l'étage du haut, loin du départ et des escaliers (de préférence dans un cul-de-sac). Le tirage ne dépend que
// de la carte et de la graine : l'hôte et les invités la posent au même endroit. dark(x, z) : la case est dans le noir.
export function findStairKey(map, seed, dark) {
  const W = map.W;
  const free = new Set((map.walkable || []).map((c) => c.z * W + c.x));
  const stairs = map.stairs || [];
  const busy = new Set(stairs.flatMap((st) => st.cells.map((k) => k.gz * W + k.gx)));
  for (const n of map.calm || []) for (const c of n.cells) busy.add(c.z * W + c.x);
  let best = null;
  for (const c of map.walkable || []) {
    const i = c.z * W + c.x;
    if (busy.has(i) || (map.pitAt && map.pitAt(c.x, c.z) >= 0)) continue;
    const x = (c.x + 0.5) * CELL_SIZE;
    const z = (c.z + 0.5) * CELL_SIZE;
    const ds = map.spawn ? Math.hypot(x - map.spawn.x, z - map.spawn.z) : 99;
    if (ds < 30 || ds > 80) continue;
    if (stairs.some((st) => Math.hypot(st.x - x, st.z - z) < 18)) continue;
    if (map.exit && Math.hypot(x - map.exit.x, z - map.exit.z) < 10) continue;
    if ((map.items || []).some((it) => Math.hypot(it.x - x, it.z - z) < 2)) continue;
    if (dark && !dark(x, z)) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => free.has((c.z + dz) * W + c.x + dx)).length;
    let h = (i * 2654435761 + seed * 40503) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
    const score = (h ^ (h >>> 13)) / 4294967296 + (nb === 1 ? 1 : 0);
    if (!best || score > best.score) best = { x, z, gx: c.x, gz: c.z, score };
  }
  return best ? { x: best.x, z: best.z, gx: best.gx, gz: best.gz, taken: false } : null;
}

// les bruits d'ambiance de chaque niveau : tous les combien (s) ; ce qu'ils sont, c'est view/sfx.js (ambCue) qui le sait
const AMB_CUES = {
  0: { rec: [20, 50] },
  1: { rec: [20, 50], a: [7, 20], b: [25, 50] },
  2: { rec: [20, 50], a: [4, 10] },
  [PIPES_LEVEL]: { rec: [20, 50], a: [9, 22], b: [18, 40], c: [14, 32] },
  4: { rec: [9, 27] }, // Level 5 (HOTEL_LEVEL) : craquements et boîte à musique, plus souvent
};

// un tirage qui ne dépend que de la graine (hôte et invités tirent pareil)
const hashRnd = (...k) => {
  let h = 2166136261;
  for (const v of k) h = Math.imul(h ^ (v | 0), 16777619) ^ (h >>> 13);
  return ((h >>> 0) % 100000) / 100000;
};
// part des piles et de l'eau d'amande gardée selon le nombre de joueurs (le reste n'est jamais là)
const KEEP_ITEMS = [0.6, 0.6, 0.72, 0.82, 0.9];

// les étages d'un niveau : même graine de partie, des cartes différentes par niveau
export function makeLevelMap(level, seed) {
  if (level === HOTEL_LEVEL) return [createHotelMap(seed * 13 + 5)];
  if (level === 2) return [createPoolMap(seed * 11 + 37)];
  if (level === PIPES_LEVEL) return [createPipesMap(seed * 11 + 29)];
  return level === 1 ? [createWarehouseMap(seed * 7 + 13)] : createLevel0(seed).floors;
}

// Départ du Level 0 à plusieurs : chacun dans son coin du dédale, à 4 à 8 cases de marche du départ (pas en vue des
// autres, mais assez près pour s'entendre siffler), au moins 3 cases entre deux joueurs. Le tirage ne dépend que de la
// carte : l'hôte et les invités placent tout le monde au même endroit.
export function spreadSpawns(map, n) {
  const spots = [{ x: map.spawn.x, z: map.spawn.z }];
  if (!map.dist || !map.walkable || n < 2) return spots;
  const W = map.W;
  const near = (c, list, d) => list.some((o) => Math.abs((o.gx ?? o.x) - c.x) < d && Math.abs((o.gz ?? o.z) - c.z) < d);
  const pitAt = (c) => (map.pitAt ? map.pitAt(c.x, c.z) >= 0 : false);
  const cage = new Set((map.stairs || []).flatMap((st) => (st.cells || []).map((k) => k.gz * W + k.gx)));
  const nearCage = (c) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (cage.has((c.z + dz) * W + c.x + dx)) return true;
    return false;
  };
  const free = (c) =>
    !pitAt(c) &&
    !near(c, map.stairs || [], 2) &&
    !nearCage(c) &&
    !(map.props || []).some((p) => Math.hypot(p.x - (c.x + 0.5) * CELL_SIZE, p.z - (c.z + 0.5) * CELL_SIZE) < p.r + 0.6);
  const hash = (c) => (((c.x * 73856093) ^ (c.z * 19349663) ^ (map.spawn.gx * 83492791)) >>> 0) % 1000;
  const cand = map.walkable.filter((c) => {
    const d = map.dist[c.z * W + c.x];
    return d >= 4 && d <= 8 && Math.hypot(c.x - map.spawn.gx, c.z - map.spawn.gz) * CELL_SIZE < 22 && free(c);
  }).sort((a, b) => hash(a) - hash(b));
  const taken = [{ x: map.spawn.gx, z: map.spawn.gz }];
  for (const c of cand) {
    if (spots.length >= n) break;
    if (taken.some((t) => Math.abs(t.x - c.x) + Math.abs(t.z - c.z) < 3)) continue;
    taken.push(c);
    spots.push({ x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE });
  }
  return spots;
}

// Où en est-on dans un escalier coudé ? u : le long des volées (0 à 3 cases), v : en travers (0 à 2 cases) ;
// lane : 'A' (première volée, v < 1 case), 'B' (seconde volée) ou 'L' (palier, u > 2 cases) ;
// h : la hauteur, de 0 (en bas) à 1 (en haut) ; t : comme h. null : pas dans un escalier
export function stairLocal(st, x, z) {
  const ex = x - st.ox;
  const ez = z - st.oz;
  return { u: ex * st.dx + ez * st.dz, v: ex * st.px + ez * st.pz };
}
export function stairHeight(u, v) {
  const C = CELL_SIZE;
  if (u >= 2 * C) return 0.5;
  const f = Math.max(0, u) / (2 * C);
  return v < C ? f * 0.5 : 1 - f * 0.5;
}
// le seuil de la porte d'une cage, côté couloir : en haut (étage 0), devant la seconde volée ; en bas (étage 1), devant
// la première
export function stairDoor(st, floor = 0) {
  const u = -0.5;
  const v = (floor === 1 ? 0.5 : 1.5) * CELL_SIZE;
  return { x: st.ox + st.dx * u + st.px * v, z: st.oz + st.dz * u + st.pz * v, st };
}
// L'empreinte d'une carte : les murs, les cages d'escalier, les cassettes, les objets, la clé et l'ascenseur de chaque étage. Tout le monde construit la même à partir
// de la graine ; si l'empreinte de l'hôte diffère, c'est que ce navigateur fait tourner une autre version du jeu.
// un objet au sol change de place ou de genre (échange, objets lâchés à la mort) : on garde ce qu'il était au
// départ (it.o), pour que les instantanés n'envoient que ceux qui ont changé
function placeItem(it, kind, x, z) {
  if (!it.o) it.o = [it.kind, it.x, it.z];
  it.kind = kind;
  it.x = x;
  it.z = z;
  it.gx = cellOf(x);
  it.gz = cellOf(z);
}

export function mapPrint(floors) {
  let h = 2166136261;
  const mix = (v) => {
    h ^= v & 0xffff;
    h = Math.imul(h, 16777619);
  };
  for (const f of floors || []) {
    mix(f.W || 0);
    mix(f.H || 0);
    const g = f.grid || [];
    for (let i = 0; i < g.length; i++) mix(g[i] + i * 7);
    for (const st of f.stairs || []) for (const k of st.cells || []) mix(k.gx * 131 + k.gz);
    // et tout ce qu'on cherche : cassettes, objets, clé, ascenseur, néons
    const at = (o) => {
      mix(Math.round((o.x || 0) * 10));
      mix(Math.round((o.z || 0) * 10));
    };
    for (const c of f.cassettes || []) { mix(c.id); at(c); }
    for (const it of f.items || []) { mix((it.kind || '').length); at(it); }
    if (f.key) at(f.key);
    if (f.elevator) at(f.elevator);
    mix((f.lights || []).length);
  }
  return (h >>> 0).toString(36);
}

export function stairAt(stairs, x, z) {
  const C = CELL_SIZE;
  for (const st of stairs || []) {
    const { u, v } = stairLocal(st, x, z);
    if (u < 0 || u > 3 * C || v < 0 || v > 2 * C) continue;
    const h = stairHeight(u, v);
    return { st, u, v, h, t: h, lane: u >= 2 * C ? 'L' : v < C ? 'A' : 'B' };
  }
  return null;
}

// Hauteur des pieds (0 : sol de l'étage du haut, -FLOOR_DY : sol du bas) ; dans l'escalier, elle suit les marches
export function feetY(stairs, x, z, floor) {
  const s = stairAt(stairs, x, z);
  return s ? -FLOOR_DY + s.h * FLOOR_DY : -(floor || 0) * FLOOR_DY;
}

function newPlayer(id, name, map, i) {
  // les joueurs arrivent côte à côte autour du départ
  const off = [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7], [0.7, 0.7]][i % 6];
  return {
    id,
    name,
    floor: 0, // étage (0 : en haut, 1 : en bas)
    x: map.spawn.x + off[0],
    z: map.spawn.z + off[1],
    yaw: 0,
    pitch: 0,
    water: 100, // hydratation, de 100 (désaltéré) à 0 (on s'effondre)
    running: false,
    flashlight: false,
    hasLamp: true, // lampe torche, toujours dans la case 1
    bottles: 0,
    battery: 100, // pile de la lampe torche (0 à 100)
    inv: new Array(INV_SIZE).fill(null), // cases 2 et 3 de l'inventaire : 'battery', 'bottle', 'ladder' ou null
    sel: 1, // case choisie (1 à INV_SIZE ; la case 0, c'est la lampe) : E l'utilise, G la pose par terre, F l'échange
    // contre un objet au sol quand l'inventaire est plein
    lockT: 0, // immobile un instant (après une chute, dans l'escalier)
    onBeam: false, // sur une arête entre deux trous
    tilt: 0, // équilibre (-1 à 1)
    tiltV: 0,
    onLadder: false, // en haut de l'échelle (la caméra monte)
    whistleCd: 0,
    burnT: 0, // brûlé il y a peu (Level 2) : le jet ne repousse pas deux fois de suite
    heat: 0, // coups de sifflet récents : trop, et l'entité vient
    signal: 0, // 0 à 1 : force du signal de l'objectif le plus proche (affiché par la caméra)
    sigTo: 'goal', // ce que suit le signal : 'goal', 'stairs' ou 'exit'
    moving: false,
    status: 'alive', // 'alive' | 'elevator' (à l'abri, spectateur) | 'dead' (spectateur)
    danger: 0, // 0 à 1 : proximité de l'entité, pour ce joueur (son, image)
    pan: 0,
    found: 0, // objets d'objectif trouvés (cassettes, fusibles)
    crouch: false, // accroupi (C / Ctrl) : lent et silencieux
    noise: 0, // bruit fait à l'instant (0 à 1+) : ce que l'entité peut entendre
    grabT: 0, // agrippé par l'entité : secondes avant la fin
    grabs: 0, // prises déjà subies à ce niveau (la deuxième est mortelle)
    struggle: 0, // appuis pour se débattre
    cam: false, // caméscope sorti (V) : image 4:3, signal des objectifs, mode nuit
    jy: 0, // hauteur du saut (m) et sa vitesse verticale
    jvy: 0,
    hurt: 0, // coups de chèvre encaissés à ce niveau (le deuxième est mortel)
    hidden: -1, // cachette où l'on est (casier ; au Level 5, lit ou armoire) (-1 : dehors)
    desk: false, // assis au poste de garde (Level 1) : on regarde les écrans des caméras
    camSel: 0, // la caméra affichée
    breath: 100, // souffle retenu dans un casier (0 à 100)
    holding: false, // souffle retenu en ce moment
    carry: [], // Level 1 : fusibles en poche (leurs numéros), à rapporter au panneau
    letters: [], // Level 5 : les lettres en poche (pas encore postées)
    detect: 0, // Level 5 : jauge de détection par l'entité (0 à 1)
  };
}

export class BackroomsSim {
  // players : [{ id, name }] (le premier est l'hôte) ; localId : le joueur de cet écran
  // map : une carte d'un seul étage (tests) ; sinon le niveau est généré à partir de la graine
  constructor({ map = null, difficulty = 'normal', seed = 42, players = null, localId = 0, level = 0, skill = 0.5, words = null } = {}) {
    // words : les mots du Level 5 (version VIP) ; sinon la liste standard
    this.words = words && words.length ? words : WORDS;
    this.difficulty = difficulty;
    // difficulté adaptative (0 à 1) : on est mort vite la dernière fois, elle triche moins ; on s'en sort, elle s'enhardit
    this.skill = Math.max(0, Math.min(1, Number.isFinite(+skill) ? +skill : 0.5));
    this.seed = seed;
    this.time = 0;
    this.state = 'playing'; // 'playing' | 'won' | 'dead'
    this.localId = localId;
    this.roster = players && players.length ? players : [{ id: localId, name: 'Joueur' }];
    this.hasMonster = difficulty !== 'peaceful';
    this.monsterChaseSpeed = MONSTER_CHASE_SPEED * (difficulty === 'hard' ? 1.2 : 1);
    this.events = [];
    this.chases = 0; // poursuites de toute la partie : la toute première est plus clémente
    this.loadLevel(level, map ? [map] : null);
  }

  // Installe un niveau : nouveaux étages, joueurs au départ (les morts reviennent), entité au loin
  loadLevel(level, floors = null) {
    const prev = this.players || [];
    this.level = level;
    const generated = !floors;
    this.floors = floors || makeLevelMap(level, this.seed);
    this.map = this.floors[0];
    // moins de piles et d'eau d'amande quand on est peu nombreux (toujours les mêmes, chez tout le monde)
    if (generated) {
      const keep = KEEP_ITEMS[Math.min(KEEP_ITEMS.length - 1, this.roster.length)];
      this.floors.forEach((f, fi) => {
        for (const it of f.items || []) if ((it.kind === 'battery' || it.kind === 'bottle') && hashRnd(this.seed, level, fi, it.id, 3) > keep) it.taken = true;
      });
    }
    // des casiers où se cacher (entrepôt, galeries de service)
    if ((level === 1 || level === PIPES_LEVEL) && !this.map.hides) this.map.hides = placeHides(this.map, level === 1 ? 5 : 6, this.seed * 31 + level);
    this.stairs = this.map.stairs || [];
    // au début de la partie, chacun part de son côté ; aux étages suivants, tout le monde sort ensemble de l'ascenseur
    const spots = level === 0 && !prev.length ? spreadSpawns(this.map, this.roster.length) : [];
    this.players = this.roster.map((r, i) => {
      const P = newPlayer(r.id, r.name, this.map, i);
      if (spots[i]) {
        P.x = spots[i].x;
        P.z = spots[i].z;
      }
      const old = prev.find((p) => p.id === r.id);
      if (old) {
        // on garde son inventaire, sa pile et ses trouvailles d'un étage à l'autre
        P.inv = old.inv;
        P.sel = old.sel;
        P.battery = old.battery;
        P.bottles = old.bottles;
        P.water = Math.max(old.water ?? 100, WATER_LEVEL_MIN); // on a bu en route : jamais à sec en arrivant
        P.found = old.found;
        P.yaw = old.yaw;
      }
      // tout le monde part avec sa lampe torche dans la case 1 (ceux qui étaient tombés en reçoivent une), éteinte : on
      // l'allume soi-même. D'un étage à l'autre, elle reste comme on l'avait laissée.
      P.hasLamp = true;
      P.flashlight = !!old && old.status === 'alive' && !!old.flashlight;
      // Level 1 : tout le monde arrive dans la cabine de l'ascenseur, qui finit de descendre, face à ses portes
      const A = this.map.arrival;
      if (A) {
        const [lx, lz] = [[0, 1.3], [0.55, 1.65], [-0.55, 1.65], [0.5, 0.85], [-0.5, 0.85], [0, 1.95]][i % 6];
        const fx = A.x - A.dx * (CELL_SIZE / 2);
        const fz = A.z - A.dz * (CELL_SIZE / 2);
        P.x = fx + A.dx * lz + A.dz * lx;
        P.z = fz + A.dz * lz - A.dx * lx;
        P.yaw = Math.atan2(A.dx, A.dz);
        P.pitch = 0;
      }
      return P;
    });
    this.cassettes = 0; // cassettes trouvées par l'équipe (Level 0)
    this.fuses = 0; // fusibles ramassés (Level 1 ; aux Poolrooms, les volants)
    this.delivered = 0; // Level 1 : fusibles rapportés au panneau
    this.valves = 0; // vannes fermées (Level 2)
    this.items0 = this.floors.map((f) => (f.items || []).length); // objets d'origine (les suivants ont été posés par des joueurs)
    // un seul vrai ascenseur : décidé quand tout se met en route, le plus loin de l'équipe (pickRealFloor)
    this.realFloor = this.floors.length > 1 ? (hashRnd(this.seed, level, 7) < 0.5 ? 0 : 1) : 0;
    this.unlocked = false;
    this.powered = false; // panneau du monte-charge réalimenté (aux Poolrooms : les 3 volants trouvés)
    this.slide = -1; // Poolrooms : le toboggan pris par le premier qui s'y est glissé (les autres le suivent)
    // Level 5 : le mot des 6 lettres (même graine, même mot ; l'hôte l'envoie de toute façon), lettres postées, code
    this.word = level === HOTEL_LEVEL ? this.words[(((this.seed * 2654435761) >>> 0) % 9973) % this.words.length] : '';
    this.posted = 0;
    this.codeShown = false;
    this.departT = 0; // compte à rebours du départ de l'ascenseur
    this.boardT = 0; // Poolrooms : compte à rebours de l'équipe, le premier glissé dans un toboggan
    this.liftT = 0; // le bouton pressé dans la cabine : les portes se ferment
    this.arriveT = this.map.arrival ? ARRIVE_T : 0; // Level 1 : la cabine d'arrivée finit de descendre
    this.liftShut = false; // Level 1 : la cabine d'arrivée s'est refermée derrière tout le monde
    this.finaleT = 0; // Level 0 : la 6e cassette trouvée, le silence avant la phase finale
    this.huntT = 0; // … puis le temps que les feux rouges s'allument
    this.hunt = false; // … et l'entité traque l'équipe sans la lâcher
    this.panel = 0; // Level 1 : avancée du redémarrage du monte-charge (0 à 1)
    this.panelNoiseT = 0;
    this.director = createDirector(level);
    this.ambT = null; // les bruits d'ambiance repartent avec le niveau
    // Level 0 : un ou deux recoins calmes par étage, où rien ne se passe… un moment ; la première rencontre, mise en scène
    if (level === 0) this.floors.forEach((f, fi) => (f.calm = f.calm || findCalmNooks(f, this.seed * 13 + fi, fi === 0 ? f.spawn : null)));
    // Level 0 : les portes des cages d'escalier sont cadenassées, en haut comme en bas ; une clé à chaque étage (la
    // première trouvée ouvre tout, l'autre disparaît)
    if (level === 0 && this.floors.length > 1 && (this.floors[0].stairs || []).length) {
      this.floors.forEach((f, fi) => {
        if (f.key === undefined) f.key = findStairKey(f, this.seed * 17 + 5 + fi * 11, (x, z) => !this.litCell(f, x, z));
      });
    }
    // l'état d'origine des néons (les instantanés n'envoient que ceux qui ont changé)
    for (const f of this.floors) for (const l of f.lights || []) if (l.s0 === undefined) l.s0 = l.state;
    // l'empreinte de la carte, une fois tout placé (la clé de l'escalier, les casiers, les recoins calmes)
    this.fp = mapPrint(this.floors);

    this.lightsOut = null;
    this.blackout = 0; // secondes de noir restantes
    this.nextBlackout = level === 1 ? rand(...BLACKOUT_EVERY) * 0.6 : level === PIPES_LEVEL && this.hasMonster ? rand(...PIPES_BLACKOUT_EVERY) * 0.75 : Infinity;
    this.midBlackout = false; // Level 0 : la panne du milieu de partie a eu lieu
    this.blackoutWait = 0;

    const ms = this.map.monsterSpawn;
    this.monster = {
      floor: 0,
      x: ms.x,
      z: ms.z,
      yaw: 0,
      mode: 'patrol', // 'patrol' | 'search' | 'chase' | 'ambush'
      speed: MONSTER_PATROL_SPEED,
      path: [],
      pathIndex: 0,
      repathT: 0,
      lastSeenX: ms.x,
      lastSeenZ: ms.z,
      targetWander: null,
      target: null, // id du joueur traqué
      distToPlayer: 999,
      danger: 0, // proximité vue par le joueur de cet écran (son, image)
      pan: 0,
      hasLineOfSight: false,
      unseenT: 0,
      ambush: null, // case d'embuscade
      ambushT: 8, // délai avant la prochaine embuscade
      waitT: 0,
      burstT: 0, // élan de la charge après une embuscade
      silent: false, // l'entité se tait quand elle attend en embuscade
      stairT: 0, // dans l'escalier
      stalkT: 4, // délai avant d'aller se cacher pour observer
      watch: null, // case sombre d'où elle observe
      // au tout début de la partie, elle reste au loin une minute : on apprend à se déplacer
      dormantT: level === 0 && !this.time ? DORMANT_T * (this.difficulty === 'hard' ? 0.75 : 1) * (1.3 - 0.6 * this.skill) : 0,
      flees: 0, // fuites devant la lampe : à la troisième, elle ne fuit plus
      escapes: [], // là où on l'a semée : elle s'en souvient pour ses embuscades
      stunT: 0, // sonnée (aveuglée, ou après avoir lâché sa prise)
      grabbing: null, // le joueur qu'elle agrippe
      faceT: 0, // depuis combien de temps un joueur la regarde en face, de près
      rushT: 0, // découverte nez à nez : elle hurle et fonce (secondes de charge)
      warpT: 25, // Level 0 : délai avant sa prochaine apparition « trichée » (quand personne ne la voit)
      unseenAllT: 0, // depuis combien de temps aucun joueur ne l'a dans son champ de vision
      edgeT: 0, // sa proie s'est réfugiée dans la lumière : elle hésite au bord
      lurk: false, // postée là où on va tomber sur elle (après une apparition)
      vanish: false, // elle a fini d'observer : dès que personne ne la regarde, elle disparaît
      pending: null, // apparition annoncée : { spot, kind, t } (le signe a été donné, elle arrive)
      glimpse: null, // Level 0 : la toute première rencontre, mise en scène ({ t, looked })
      sawHide: -1, // le casier où elle a vu quelqu'un entrer
      // sa marche (gait.js) : vitesse réelle, passage en cours (escalier, trou), hauteur des pieds, poussée
      v: 0,
      trav: null,
      dropY: 0,
      y: 0,
      push: null,
      portal: null,
      route: null,
      arrived: false,
      lastSeenF: 0, // l'étage où elle a vu (ou entendu) sa proie pour la dernière fois
      plantT: 0, // depuis combien de temps elle se tient immobile sous les yeux d'un joueur (voir PLANTED_T)
      pace: null,
      paceSide: 1,
      modeT: 0, // depuis combien de temps elle est dans ce mode
      lastMode: 'patrol',
    };
    // la première rencontre arrive pendant la minute de calme du début (elle n'est encore qu'une silhouette)
    this.glimpseAt = level === 0 && !prev.length && this.hasMonster && this.monster.dormantT > 0 ? this.monster.dormantT * rand(0.4, 0.7) : Infinity;
    this.glimpseTries = 0;
    // Level 2 : le troupeau remplace l'entité (elle reste là pour relayer le son et l'image de la chèvre la plus proche)
    this.goats = level === PIPES_LEVEL && this.hasMonster ? createGoats(this.map, goatCount(this.roster.length, this.difficulty)) : null;
    this.herd = null;
  }

  // dans l'eau (Poolrooms) on avance moins vite : 90 % dans 20 cm d'eau, 70 % dans 60 cm, 40 % au plus profond
  wade(P) {
    const m = this.fm(P.floor);
    const d = m.depthAt ? m.depthAt(P.x, P.z) : 0;
    return d > 0 ? Math.max(0.4, 1 - d * 0.55) : 1;
  }

  // la carte d'un étage
  fm(floor) {
    return this.floors[floor] || this.floors[0];
  }

  // toutes les cassettes, des deux étages, dans l'ordre de leur numéro
  get allCassettes() {
    return this.floors.flatMap((f) => f.cassettes || []).sort((a, b) => a.id - b.id);
  }

  // le joueur de cet écran
  get player() {
    return this.players.find((p) => p.id === this.localId) || this.players[0];
  }

  // le joueur que la caméra suit : soi-même, ou un joueur encore dehors quand on est spectateur
  viewPlayer(pick = 0) {
    const me = this.player;
    if (me.status === 'alive') return me;
    const out = this.players.filter((p) => p.status === 'alive');
    if (!out.length) return me;
    return out[((pick % out.length) + out.length) % out.length];
  }

  get open() {
    if (this.level === PIPES_LEVEL) return this.valves >= VALVES;
    return this.level === 0 ? this.cassettes >= CASSETTES && !(this.finaleT > 0) : this.powered;
  }

  // dans la cabine du vrai ascenseur ouvert (ou devant la sortie, sans cabine)
  inCabin(P) {
    if (!this.open || (P.floor || 0) !== this.realFloor || this.map.slides) return false;
    const m = this.fm(P.floor);
    const E = m.elevator;
    if (E) return !E.fake && cellOf(P.x) === E.gx && cellOf(P.z) === E.gz;
    return !!m.exit && Math.hypot(m.exit.x - P.x, m.exit.z - P.z) < 1.8;
  }

  // Level 2 : un jet de vapeur au repos (0), qui siffle (1) ou qui crache (2) ; sa vanne fermée, il se tait
  jetOn(j) {
    const v = (this.map.valves || [])[j.sector];
    if (v && v.closed) return 0;
    return jetState(j, this.time);
  }

  // le jet qui crache au point (x, z), ou null
  steamAt(x, z) {
    const j = this.map.jetAt ? this.map.jetAt(cellOf(x), cellOf(z)) : null;
    return j && this.jetOn(j) === 2 && inJet(j, x, z) ? j : null;
  }

  // Brûlé : on est rejeté du côté d'où l'on venait, sonné et le souffle coupé
  burn(P, j) {
    const C = CELL_SIZE;
    const pos = j.axis === 'x' ? P.x : P.z;
    const mid = j.axis === 'x' ? j.x : j.z;
    let dir = Math.sign(pos - mid);
    if (!dir) dir = j.axis === 'x' ? -Math.sign(-Math.sin(P.yaw)) || 1 : -Math.sign(-Math.cos(P.yaw)) || 1;
    const to = Math.max((j.axis === 'x' ? j.gx : j.gz) * C - C * 0.4, Math.min((j.axis === 'x' ? j.gx + 1 : j.gz + 1) * C + C * 0.4, mid + dir * (JET_HALF + 0.5)));
    const p = this.moveWithCollisions(P.x, P.z, j.axis === 'x' ? to - P.x : 0, j.axis === 'x' ? 0 : to - P.z, PLAYER_RADIUS, P.floor);
    P.x = p.x;
    P.z = p.z;
    P.lockT = BURN_LOCK;
    P.burnT = 1.6;
    P.running = false;
  }

  // un grand bruit (cri, vanne qui claque) : l'entité vient voir, si elle est assez près et pas déjà en chasse
  alertMonster(x, z, range, floor = 0) {
    if (this.goats) {
      alertGoats(this, x, z, range);
      return true;
    }
    const M = this.monster;
    if (!this.hasMonster || M.mode === 'chase' || M.floor !== floor) return false;
    if (Math.hypot(M.x - x, M.z - z) > range) return false;
    M.mode = 'search';
    M.silent = false;
    M.ambush = null;
    M.watch = null;
    M.lastSeenX = x;
    M.lastSeenZ = z;
    M.lastSeenF = floor;
    M.probe = null;
    M.repathT = 0;
    return true;
  }

  // Les vannes : on les ferme en restant devant (à plusieurs, plus vite) ; lâchées, elles se rouvrent doucement.
  // Une vanne qui claque résonne dans tous les tuyaux : l'entité vient voir.
  updateValves() {
    for (const v of this.map.valves || []) {
      if (v.closed) continue;
      const near = this.players.filter((P) => P.status === 'alive' && P.hidden < 0 && Math.hypot(v.sx - P.x, v.sz - P.z) < VALVE_R);
      if (near.length) {
        if (v.turn === 0) this.emit({ type: 'valveStart', id: v.id, by: near[0].id });
        for (const P of near) this.makeNoise(P, 0.55, 0.3);
        v.turn = Math.min(1, v.turn + (DT / VALVE_T) * (near.length > 1 ? 1.5 : 1));
      } else v.turn = Math.max(0, v.turn - DT * 0.18);
      if (v.turn < 1) continue;
      v.closed = true;
      this.valves++;
      v.blowT = BLOW_DELAY;
      this.setSector(v.id, 1);
      near[0].found++;
      this.emit({ type: 'valve', id: v.id, by: near[0].id, count: this.valves, total: VALVES, x: v.x, z: v.z });
      this.alertMonster(v.sx, v.sz, 60);
      if (this.valves >= VALVES) this.emit({ type: 'exitUnlocked' });
    }
  }

  // Le courant d'un secteur du Level 2 (power : 0 normal, 1 les néons grésillent, 2 ils ont sauté, 3 réarmé). Les
  // lampes gardent leur état d'origine (base) ; les chèvres et l'image relisent l'éclairage (map.lightGen)
  setSector(i, power) {
    const map = this.map;
    const v = (map.valves || [])[i];
    if (!v || v.power === power) return;
    v.power = power;
    const drops = this.director ? this.director.drops : [];
    for (const l of map.lights) {
      if (l.sector !== i || l.base === 'off') continue;
      l.state = power === 1 ? 'flicker' : power === 2 ? 'off' : l.base;
      l.flicker = l.state === 'flicker';
      // éteint un instant par le metteur en scène : quand il reviendra, ce sera dans l'état du secteur
      for (const d of drops) if (d.l === l) d.back = l.state;
    }
    map.goatLit = null;
    map.darkCells = null;
    map.lightGen = (map.lightGen || 0) + 1;
  }

  // Les néons qui sautent après une vanne, et les disjoncteurs : on reste devant pour réarmer (à plusieurs, plus vite).
  // Le claquement s'entend loin : le troupeau vient voir.
  updateBreakers() {
    const map = this.map;
    for (const v of map.valves || []) {
      if (!(v.blowT > 0)) continue;
      v.blowT -= DT;
      if (v.blowT > 0) continue;
      this.setSector(v.id, 2);
      this.emit({ type: 'blowout', sector: v.id, x: v.x, z: v.z });
    }
    for (const b of map.breakers || []) {
      const v = map.valves[b.sector];
      if (b.done || !v || v.power !== 2) continue;
      const near = this.players.filter((P) => P.status === 'alive' && P.hidden < 0 && Math.hypot(b.sx - P.x, b.sz - P.z) < BREAKER_R);
      if (near.length) {
        if (b.turn === 0) this.emit({ type: 'breakerStart', id: b.id, by: near[0].id });
        b.turn = Math.min(1, b.turn + (DT / BREAKER_T) * (near.length > 1 ? 1.5 : 1));
      } else b.turn = Math.max(0, b.turn - DT * 0.25);
      if (b.turn < 1) continue;
      b.done = true;
      this.setSector(b.sector, 3);
      this.emit({ type: 'breaker', id: b.id, sector: b.sector, by: near[0].id, x: b.x, z: b.z });
      this.alertMonster(b.x, b.z, 24);
    }
  }

  // La voix (niveau du micro de 0 à 1, mesuré chez chaque joueur) : parler fait du bruit là où l'on est ; au talkie, on
  // parle plus bas, mais le haut-parleur de chaque vivant grésille aussi, là où il est. Et le vacarme s'accumule :
  // plus l'équipe parle, plus l'entité devient agressive.
  voice(P, input) {
    const v = P.status === 'alive' ? Math.max(0, Math.min(1, +input.voice || 0)) : 0;
    P.voice = v;
    P.radio = v > 0 && !!input.radio && !this.radioDead; // coupure de courant : le talkie ne passe plus
    if (v < VOICE_MIN) return;
    const loud = 0.1 + v * 1.1; // un murmure ~ marcher, une voix normale entre marcher et courir, un cri plus que courir
    this.makeNoise(P, P.radio ? loud * 0.7 : loud, 0.35);
    if (P.radio) for (const Q of this.players) if (Q !== P && Q.status === 'alive') this.makeNoise(Q, 0.25 + v * 0.75, 0.35);
    this.din = Math.min(1, (this.din || 0) + v * DT * DIN_RATE * (P.radio ? 1.5 : 1));
  }

  // les talkies ne marchent plus pendant une coupure de courant (Level 1, Tuyauteries) ou quand les néons du Level 0
  // meurent un à un (chez l'invité, l'hôte le dit dans l'instantané)
  get radioDead() {
    return this.blackout > 0 || !!this.lightsOut || !!this.rdSnap;
  }

  // le vacarme retombe peu à peu ; il prévient quand il franchit un palier
  // Les bruits d'ambiance (un enregistrement au loin, la tôle qui craque, un coup dans les conduites…) : c'est l'hôte
  // qui les tire, à un endroit du niveau, et tout le monde les entend en même temps, au même endroit (fort pour celui
  // qui est à côté, étouffé pour celui qui est loin). Avant, chacun avait les siens.
  updateAmbience() {
    if (this.state !== 'playing' || this.departT > 0) return;
    const cues = AMB_CUES[this.level] || AMB_CUES[0];
    const T = this.ambT || (this.ambT = { rec: rand(6, 16), a: rand(6, 14), b: rand(10, 20), c: rand(14, 26) });
    const M = this.monster;
    const busy = this.hasMonster && M && (M.mode === 'chase' || M.mode === 'grab');
    for (const slot of Object.keys(cues)) {
      T[slot] -= DT;
      if (T[slot] > 0) continue;
      T[slot] = rand(...cues[slot]);
      if (busy) continue; // pas pendant une poursuite
      const alive = this.players.filter((P) => P.status === 'alive');
      if (!alive.length) continue;
      const P = alive[Math.floor(Math.random() * alive.length)];
      const r2 = (v) => Math.round(v * 1000) / 1000;
      this.emit({ type: 'amb', s: slot, id: P.id, x: r2(P.x), z: r2(P.z), floor: P.floor || 0, a: r2(Math.random() * Math.PI * 2), u: r2(Math.random()), v: r2(Math.random()), w: r2(Math.random()) });
    }
  }

  // Une position annoncée par un invité est-elle atteignable ? Il a pu courir pendant tout le temps écoulé chez lui
  // (seq : ses pas de simulation) : après une saccade ou un onglet en arrière-plan chez l'hôte, l'écart est grand
  // mais légitime ; le refuser renvoyait l'invité en arrière (une « téléportation »).
  posReach(P, pos, seq) {
    const d = Math.hypot(pos.x - P.x, pos.z - P.z);
    if (d < 4.5) return true;
    if (!Number.isFinite(seq)) return false;
    if (!Number.isFinite(P.posSeq)) {
      P.posSeq = seq; // première annonce de loin : on part de là
      return false;
    }
    if (seq <= P.posSeq) return false;
    return d < Math.min(60, (seq - P.posSeq) * DT * SPRINT_SPEED * 1.35 + 2);
  }

  // Le prélude : au Level 0, tant que l'équipe n'a pas trouvé sa première cassette, il ne se passe rien… sauf la
  // première apparition, mise en scène. Ni traque, ni fausse alerte, ni néons qui meurent, ni triche de l'entité,
  // ni parasites du talkie : on découvre les lieux, on se sent seul. La peur commence avec la première cassette.
  get prelude() {
    return BackroomsSim.PRELUDE !== false && this.level === 0 && this.hasMonster && !this.goats && (this.cassettes || 0) === 0;
  }

  updateDin() {
    if (this.prelude) this.din = 0; // parler ne l'énerve pas encore
    this.din = Math.max(0, (this.din || 0) - DIN_DECAY * DT);
    const lv = this.din >= 0.7 ? 2 : this.din >= 0.35 ? 1 : 0;
    const was = this.dinLv || 0;
    if (lv > was) {
      this.dinLv = lv;
      this.emit({ type: 'din', level: lv });
    } else if (was > 0 && this.din < (was === 1 ? 0.25 : 0.6)) this.dinLv = was - 1; // un peu d'écart avant de redescendre
  }

  // les portes des cages d'escalier sont-elles encore cadenassées ? (tant qu'aucune des deux clés n'est trouvée)
  get stairsLocked() {
    const keys = (this.floors || []).map((f) => f.key).filter(Boolean);
    return keys.length > 0 && !keys.some((K) => K.taken);
  }

  // la porte cadenassée devant laquelle se tient ce joueur, sinon null
  lockedDoorNear(P, r = 1.8) {
    if (!this.stairsLocked) return null;
    for (const st of this.stairs) {
      const d = stairDoor(st, P.floor || 0);
      if (Math.hypot(d.x - P.x, d.z - P.z) < r) return d;
    }
    return null;
  }

  // la clé de son étage, encore à trouver
  keyOf(floor) {
    const K = this.floors[floor || 0] && this.floors[floor || 0].key;
    return K && !K.taken && this.stairsLocked ? K : null;
  }

  // la clé à portée de F
  nearKey(P) {
    const K = this.keyOf(P.floor);
    return K && Math.hypot(K.x - P.x, K.z - P.z) < PICK_R + 0.2 ? K : null;
  }

  // la cassette à portée de F (posée par terre ; la perchée, seulement du haut de l'échelle)
  nearCassette(P) {
    let best = null;
    let bd = PICK_R;
    for (const cas of this.fm(P.floor).cassettes || []) {
      if (cas.collected || (cas.high && !P.onLadder)) continue;
      const d = Math.hypot(cas.x - P.x, cas.z - P.z);
      if (d < bd) {
        bd = d;
        best = cas;
      }
    }
    return best;
  }

  // agressivité de l'entité (0 à 1) : elle monte à chaque cassette trouvée (Level 0), à chaque fusible (Level 1, où elle
  // part déjà plus haut)
  // ; le vacarme des voix l'y pousse aussi
  get aggro() {
    const loud = (this.din || 0) * 0.45;
    if (this.level === 0) return Math.min(1, this.cassettes / CASSETTES + loud) * L0_AGGRO;
    if (this.level === HOTEL_LEVEL) return Math.min(1, 0.5 + (0.4 * this.posted) / LETTERS + loud);
    if (this.level === PIPES_LEVEL) return Math.min(1, 0.3 + (0.7 * this.valves) / VALVES + loud);
    return Math.min(1, 0.25 + (0.75 * (this.fuses + (this.powered ? FUSES : 0))) / FUSES + loud);
  }

  // part de l'équipe déjà à l'abri dans l'ascenseur (0 à 1) : l'entité devient plus agressive
  get rage() {
    // tous les autres sont dans la cabine (entrés, ou déjà partis) : 1
    const n = this.players.length;
    if (n < 2) return 0;
    const safe = this.players.filter((p) => p.status === 'elevator' || (p.status === 'alive' && this.inCabin(p))).length;
    return Math.min(1, safe / (n - 1));
  }

  emit(ev) {
    this.events.push(ev);
  }

  drainEvents() {
    const list = this.events;
    this.events = [];
    return list;
  }

  // Le vrai ascenseur, au moment où tout se met en route : le plus loin de l'équipe. Celui qui est le plus près (en
  // marchant, par l'escalier pour l'autre étage) se referme en mur sous son nez
  pickRealFloor() {
    if (this.floors.length < 2) return 0;
    const alive = this.players.filter((P) => P.status === 'alive');
    if (!alive.length) return this.realFloor;
    // la distance en cases d'un champ à une case (si elle est pleine, par sa voisine la plus proche)
    const at = (m, d, x, z) => {
      const gx = cellOf(x);
      const gz = cellOf(z);
      let best = Infinity;
      for (const [ox, oz, k] of [[0, 0, 0], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]]) {
        const nx = gx + ox;
        const nz = gz + oz;
        if (nx < 0 || nz < 0 || nx >= m.W || nz >= m.H) continue;
        const v = d[nz * m.W + nx];
        if (v >= 0) best = Math.min(best, v + k);
      }
      return best;
    };
    const fromExit = this.floors.map((m) => (m.exit ? bfs(m.grid, m.W, m.H, m.exit.gx, m.exit.gz) : null));
    const STAIR = 6; // les deux volées de la cage, en cases
    const far = this.floors.map(() => Infinity); // pour chaque ascenseur : le coéquipier le plus proche
    for (const P of alive) {
      const a = P.floor || 0;
      const m = this.fm(a);
      const mine = bfs(m.grid, m.W, m.H, cellOf(P.x), cellOf(P.z));
      for (let b = 0; b < this.floors.length; b++) {
        if (!fromExit[b]) continue;
        let d = Infinity;
        if (b === a) d = at(m, mine, m.exit.x, m.exit.z);
        else
          for (const st of this.stairs) {
            const here = a === 0 ? st.up : st.down;
            const there = b === 0 ? st.up : st.down;
            d = Math.min(d, at(m, mine, here.x, here.z) + STAIR + at(this.floors[b], fromExit[b], there.x, there.z));
          }
        far[b] = Math.min(far[b], d);
      }
    }
    if (!Number.isFinite(far[0]) && !Number.isFinite(far[1])) return this.realFloor;
    return far[0] < far[1] ? 1 : 0;
  }

  // Toutes les cassettes trouvées : le faux ascenseur se referme en mur (on ne le sait qu'en arrivant devant)
  unlockLevel0() {
    this.unlocked = true;
    for (let f = 0; f < this.floors.length; f++) {
      const E = this.floors[f].elevator;
      if (E) E.fake = f !== this.realFloor;
    }
  }

  // Déplacement avec glissement contre les murs
  moveWithCollisions(px, pz, dx, dz, radius = PLAYER_RADIUS, floor = 0) {
    let nextX = px + dx;
    let nextZ = pz + dz;
    if (this.isColliding(nextX, pz, radius, floor)) nextX = px;
    if (this.isColliding(nextX, nextZ, radius, floor)) nextZ = pz;
    return { x: nextX, z: nextZ };
  }

  // la cabine de l'ascenseur se traverse seulement quand il est ouvert (et que c'est le vrai)
  blocked(gx, gz, floor = 0) {
    const m = this.fm(floor);
    if (!m.isWall(gx, gz)) return false;
    // Level 1 : la cabine d'arrivée, tant qu'elle ne s'est pas refermée derrière tout le monde
    if (m.arrival && gx === m.arrival.gx && gz === m.arrival.gz) return this.liftShut;
    return !(this.open && m.grid[gz * m.W + gx] === T.EXIT && !(m.elevator && m.elevator.fake));
  }

  // la façade d'une cabine ouverte (l'ascenseur du départ, celui d'arrivée) : on n'y entre que par la baie des portes
  facadeHit(x, z, radius, floor) {
    const m = this.fm(floor);
    for (const E of [m.elevator, m.arrival]) {
      if (!E) continue;
      const fx = E.x - E.dx * (CELL_SIZE / 2);
      const fz = E.z - E.dz * (CELL_SIZE / 2);
      const lz = (x - fx) * E.dx + (z - fz) * E.dz;
      if (lz < -radius || lz > LIFT_FACE + radius) continue;
      const ax = Math.abs((x - fx) * E.dz - (z - fz) * E.dx);
      if (ax > CELL_SIZE / 2 + radius || this.blocked(E.gx, E.gz, floor)) continue;
      const gap = this.liftGap(E, m); // portes refermées : la baie est un mur comme la façade
      const ex = ax < gap ? gap - ax : ax > CELL_SIZE / 2 ? ax - CELL_SIZE / 2 : 0;
      const ez = lz < 0 ? -lz : lz > LIFT_FACE ? lz - LIFT_FACE : 0;
      if (ex * ex + ez * ez < radius * radius * 0.8) return true;
    }
    return false;
  }

  // demi-largeur encore ouverte entre les portes d'une cabine (LIFT_BAY grandes ouvertes, 0 fermées) : après le
  // bouton, elles se rejoignent en LIFT_SHUT_T, comme à l'écran
  liftGap(E, m) {
    if (E === m.arrival) return this.arriveT > 0 ? 0 : LIFT_BAY;
    if (this.departT > 0) return 0;
    if (this.liftT > 0) return LIFT_BAY * Math.max(0, Math.min(1, (this.liftT - (LIFT_CLOSE_T - LIFT_SHUT_T)) / LIFT_SHUT_T));
    return LIFT_BAY;
  }

  // les portes qui se referment poussent celui qui se tient dans la baie : dans la cabine s'il y était entré, dehors
  // sinon. Personne ne reste entre les vantaux (on y voyait à travers, et on y passait)
  doorShove(P) {
    const E = this.fm(P.floor).elevator;
    if (!E || E.fake || (P.floor || 0) !== this.realFloor) return;
    const fx = E.x - E.dx * (CELL_SIZE / 2);
    const fz = E.z - E.dz * (CELL_SIZE / 2);
    const lz = (P.x - fx) * E.dx + (P.z - fz) * E.dz;
    const ax = Math.abs((P.x - fx) * E.dz - (P.z - fz) * E.dx);
    const R = PLAYER_RADIUS + 0.03;
    if (ax > LIFT_BAY + R || lz <= -R || lz >= LIFT_FACE + R) return;
    const want = lz >= 0 ? LIFT_FACE + R : -R;
    const step = Math.sign(want - lz) * Math.min(Math.abs(want - lz), 2.4 * DT);
    P.x += E.dx * step;
    P.z += E.dz * step;
  }

  isColliding(x, z, radius, floor = 0) {
    // Poolrooms : cloisons minces entre les salles et colonnes
    const cm = this.fm(floor);
    if (cm.collide && cm.collide(x, z, radius)) return true;
    const minGx = cellOf(x - radius);
    const maxGx = cellOf(x + radius);
    const minGz = cellOf(z - radius);
    const maxGz = cellOf(z + radius);
    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (!this.blocked(gx, gz, floor)) continue;
        // un pilier fin ou une cloison : sa vraie forme (carré, rond, rectangles de 12 cm), pas toute la case
        const fm = this.fm(floor);
        const pl = fm.pillarAt && fm.pillarAt(gx, gz);
        if (pl) {
          if (pillarDist(pl, x, z) < radius) return true;
          continue;
        }
        const closestX = Math.max(gx * CELL_SIZE, Math.min(x, (gx + 1) * CELL_SIZE));
        const closestZ = Math.max(gz * CELL_SIZE, Math.min(z, (gz + 1) * CELL_SIZE));
        if ((x - closestX) ** 2 + (z - closestZ) ** 2 < radius * radius) return true;
      }
    }
    if (this.facadeHit(x, z, radius, floor)) return true;
    // caisses et meubles abandonnés (cercles)
    for (const pr of this.fm(floor).props || []) {
      if (pr.walk || !(pr.r > 0)) continue; // papiers, canettes : on marche dessus ; posé sur un meuble ou suspendu : rien à heurter
      const rr = radius + pr.r;
      if (Math.abs(pr.x - x) < rr && Math.abs(pr.z - z) < rr && (pr.x - x) ** 2 + (pr.z - z) ** 2 < rr * rr) return true;
    }
    // les casiers
    for (const h of this.fm(floor).hides || []) if (Math.hypot(h.x - x, h.z - z) < radius + LOCKER_R) return true;
    return false;
  }

  // un bruit bref (ramasser, tomber, siffler, suffoquer) : il s'ajoute au bruit de la marche pendant t secondes
  makeNoise(P, v, t = 1) {
    if (v >= (P.bumpV || 0) || !(P.bumpT > 0)) {
      P.bumpV = v;
      P.bumpT = t;
    }
  }

  // le joueur meurt : ce qu'il portait tombe là où il est (Level 1 : les fusibles), il sort de son casier
  killPlayer(P, extra = {}) {
    if (P.status !== 'alive') return;
    P.status = 'dead';
    P.cam = false;
    P.moving = false;
    P.grabT = 0;
    if (P.hidden >= 0) {
      const h = (this.fm(P.floor).hides || [])[P.hidden];
      if (h) h.by = -1;
      P.hidden = -1;
    }
    if (P.desk) {
      P.desk = false;
      if (this.map.post && this.map.post.by === P.id) this.map.post.by = -1;
    }
    this.dropCarry(P);
    this.dropInv(P);
    this.dropLetters(P);
    // (tombé dans un puits sans fond, ou mort de soif : pas d'entité qui surgit)
    if (!extra.abyss && !extra.thirst) this.emit({ type: 'jumpscare', x: extra.x ?? P.x, z: extra.z ?? P.z, id: P.id, goat: !!extra.goat });
    this.emit({ type: 'dead', id: P.id, name: P.name, time: this.time, abyss: !!extra.abyss, thirst: !!extra.thirst });
  }

  // Level 1 : les fusibles en poche tombent par terre (on peut aller les rechercher)
  dropCarry(P) {
    if (!P.carry || !P.carry.length) return;
    const map = this.fm(P.floor);
    P.carry.forEach((id, i) => {
      const f = map.fuses[id];
      if (!f) return;
      const a = (i / Math.max(1, P.carry.length)) * Math.PI * 2;
      let x = P.x + Math.cos(a) * 0.5;
      let z = P.z + Math.sin(a) * 0.5;
      if (this.isColliding(x, z, 0.2, P.floor)) {
        x = P.x;
        z = P.z;
      }
      f.x = x;
      f.z = z;
      f.gx = cellOf(x);
      f.gz = cellOf(z);
      f.taken = false;
    });
    this.fuses = Math.max(0, this.fuses - P.carry.length);
    this.emit({ type: 'fuseDrop', id: P.id, name: P.name, n: P.carry.length, x: P.x, z: P.z });
    P.carry = [];
  }

  // ce qu'il avait en poche (piles, eau d'amande, l'échelle) tombe autour de lui : sans l'échelle, la cassette du
  // renfoncement serait hors d'atteinte pour toujours. On reprend un objet ramassé du même genre à cet étage (il
  // change de place : les instantanés l'envoient), sinon on en pose un nouveau
  dropInv(P) {
    const items = this.fm(P.floor).items;
    if (!items || !P.inv) return;
    const kinds = P.inv.filter(Boolean);
    kinds.forEach((kind, i) => {
      const a = (i / Math.max(1, kinds.length)) * Math.PI * 2 + 0.7;
      let x = P.x + Math.cos(a) * 0.45;
      let z = P.z + Math.sin(a) * 0.45;
      if (this.isColliding(x, z, 0.2, P.floor)) {
        x = P.x;
        z = P.z;
      }
      let it = items.find((o) => o.taken && o.kind === kind);
      if (it) {
        placeItem(it, kind, x, z);
        it.taken = false;
      } else items.push((it = { id: items.length, kind, x, z, gx: cellOf(x), gz: cellOf(z), taken: false }));
      // l'échelle tombée : toute l'équipe l'apprend, et le caméscope y mène tant que personne ne l'a reprise
      if (kind === 'ladder') {
        it.lost = true;
        this.emit({ type: 'ladderDrop', id: P.id, name: P.name, x, z, floor: P.floor || 0 });
      }
    });
    P.inv = P.inv.map(() => null);
  }

  // le casier le plus proche à portée de F (et libre), ou null
  nearHide(P) {
    let best = null;
    let bd = HIDE_R;
    for (const h of this.fm(P.floor).hides || []) {
      const f = hideFront(h);
      const d = Math.hypot(f.x - P.x, f.z - P.z);
      if (d < bd && (h.by < 0 || h.by === P.id)) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  // s'enfermer dans un casier : l'entité qui t'a vu entrer saura où chercher
  enterHide(P, h) {
    h.by = P.id;
    P.hidden = h.id;
    const p = hideInside(h);
    P.x = p.x;
    P.z = p.z;
    P.yaw = p.yaw;
    P.pitch = 0;
    P.flashlight = false;
    P.crouch = false;
    P.jy = P.jvy = 0;
    P.running = false;
    P.moving = false;
    P.breath = 100;
    P.holding = false;
    const M = this.monster;
    if (this.hasMonster && !this.goats && M.floor === (P.floor || 0) && Math.hypot(M.x - P.x, M.z - P.z) < 22 && this.inCone(M, P.x, P.z) && hasLineOfSight(this.fm(M.floor), M.x, M.z, h.x + h.dx, h.z + h.dz)) M.sawHide = h.id;
    this.emit({ type: 'hide', id: P.id, on: true, x: h.x, z: h.z });
  }

  leaveHide(P) {
    const h = (this.fm(P.floor).hides || [])[P.hidden];
    P.hidden = -1;
    P.holding = false;
    if (!h) return;
    h.by = -1;
    const f = hideFront(h);
    P.x = f.x;
    P.z = f.z;
    this.emit({ type: 'hide', id: P.id, on: false, x: h.x, z: h.z });
  }

  // le point (x, z) est-il dans le champ de vision de l'entité ?
  inCone(M, x, z) {
    return Math.abs(this.angleTo(M, x, z)) < VISION_CONE;
  }

  // ------------------------------------------------------------------ Level 1 : quais, alarmes, poste, gaines

  // ce que F actionne ici (Level 1) : le boîtier d'un quai, un déclencheur d'alarme encore intact, le fauteuil libre du
  // poste de garde ; le plus proche à portée, sans rien entre (le rideau baissé cache le boîtier de l'autre côté)
  nearControl(P) {
    if (this.level !== 1 || (P.floor || 0) !== 0) return null;
    const m = this.map;
    let best = null;
    const see = (kind, obj, x, z) => {
      const d = Math.hypot(x - P.x, z - P.z);
      if (d < USE_R && (!best || d < best.d) && hasLineOfSight(m, P.x, P.z, x, z)) best = { kind, obj, d };
    };
    for (const d of m.docks || []) for (const b of d.btn) see('dock', d, b.x + b.nx * 0.5, b.z + b.nz * 0.5);
    for (const a of m.alarms || []) if (!a.used) see('alarm', a, a.x + a.nx * 0.55, a.z + a.nz * 0.55);
    const S = m.post;
    if (S && S.by < 0) see('desk', S, S.seat.x, S.seat.z);
    return best;
  }

  // la commande que F actionnerait ici : plus proche que l'objet par terre et que le casier (l'invite à l'écran dit la
  // même chose que ce que fera la touche)
  controlFor(P, it = this.nearItem(P), h = this.nearHide(P)) {
    const ctl = this.nearControl(P);
    if (!ctl) return null;
    const dIt = it ? Math.hypot(it.x - P.x, it.z - P.z) : Infinity;
    const dH = h ? Math.hypot(hideFront(h).x - P.x, hideFront(h).z - P.z) : Infinity;
    return ctl.d < dIt && ctl.d < dH ? ctl : null;
  }

  useControl(P, c) {
    if (c.kind === 'dock') return this.toggleDock(c.obj, P);
    if (c.kind === 'alarm') return this.ringAlarm(c.obj, P);
    if (c.kind === 'desk') return this.sitDesk(P);
  }

  // Le bouton d'un quai : le rideau monte (lentement, à grand bruit) ou redescend ; arraché par l'entité, il reste en haut
  toggleDock(d, P) {
    if (d.broken) return this.emit({ type: 'dockJam', id: d.id, by: P.id });
    const open = d.dir < 0 || (d.dir === 0 && d.o < 1);
    d.dir = open ? 1 : -1;
    this.makeNoise(P, NOISE.use, 0.8);
    this.emit({ type: 'dock', id: d.id, dir: d.dir, by: P.id, x: d.x, z: d.z });
    // le moteur et la chaîne s'entendent loin (moins en descendant : c'est plus court)
    this.alertMonster(d.x, d.z, open ? 34 : 18);
  }

  updateDocks() {
    for (const d of this.map.docks || []) {
      if (!d.dir) continue;
      const T = d.dir > 0 ? (d.broken ? 0.6 : DOCK_OPEN_T) : DOCK_CLOSE_T;
      let o = d.o + (d.dir * DT) / T;
      // en descendant, il s'arrête au-dessus de quelqu'un qui passe dessous (une cellule, comme sur les vrais quais)
      if (d.dir < 0 && o < DOCK_PASS && this.underDock(d)) o = Math.min(d.o, DOCK_PASS);
      d.o = Math.max(0, Math.min(1, o));
      if ((d.dir > 0 && d.o >= 1) || (d.dir < 0 && d.o <= 0)) {
        d.dir = 0;
        this.emit({ type: 'dockStop', id: d.id, open: d.o >= 1, x: d.x, z: d.z });
      }
    }
  }

  // quelqu'un (un joueur, l'entité) sous le rideau
  underDock(d) {
    const r = 0.42;
    const under = (x, z) => d.slab.some(({ rects: [q] }) => x > q[0] - r && x < q[2] + r && z > q[1] - r && z < q[3] + r);
    if (this.players.some((P) => P.status === 'alive' && (P.floor || 0) === 0 && under(P.x, P.z))) return true;
    const M = this.monster;
    return !!(this.hasMonster && M && !M.inDuct && (M.floor || 0) === 0 && under(M.x, M.z));
  }

  // L'entité vient de faire un pas (x0, z0 → M.x, M.z) : un rideau baissé l'arrête. Elle cogne dedans ; la tôle cède
  // au bout de DOCK_FORCE_T (et le rideau, arraché, reste ouvert)
  dockPush(M, x0, z0) {
    for (const d of this.fm(M.floor || 0).docks) {
      if (d.o >= DOCK_PASS) continue;
      if (!d.slab.some((sl) => pillarDist(sl, M.x, M.z) < BODY_R || segHitsPillar(sl, x0, z0, M.x, M.z))) continue;
      M.x = x0;
      M.z = z0;
      M.v = 0;
      d.force = Math.min(1, d.force + DT / DOCK_FORCE_T);
      d.bangT = (d.bangT || 0) - DT;
      if (d.bangT <= 0) {
        d.bangT = rand(0.4, 0.75) * (1.15 - d.force * 0.4);
        this.emit({ type: 'dockBang', id: d.id, x: d.x, z: d.z, k: rnd2(d.force) });
      }
      if (d.force >= 1) {
        d.broken = true;
        d.dir = 1;
        d.o = Math.max(d.o, DOCK_PASS);
        this.emit({ type: 'dockBreak', id: d.id, x: d.x, z: d.z });
      }
      return;
    }
  }

  // un rideau baissé entre deux points (elle n'attrape personne au travers)
  dockBetween(floor, ax, az, bx, bz) {
    const m = this.fm(floor);
    return !!m.docks && m.docks.some((d) => d.o < DOCK_PASS && d.slab.some((sl) => segHitsPillar(sl, ax, az, bx, bz)));
  }

  // Briser la vitre d'un déclencheur : la cloche sonne ALARM_T secondes, l'entité y court (une seule fois chacun)
  ringAlarm(a, P) {
    if (a.used) return;
    a.used = true;
    a.ringT = ALARM_T;
    this.makeNoise(P, NOISE.use, 0.8);
    this.emit({ type: 'alarm', id: a.id, by: P.id, name: P.name, x: a.x, z: a.z });
  }

  updateAlarms() {
    for (const a of this.map.alarms || []) {
      if (!(a.ringT > 0)) continue;
      a.ringT = Math.max(0, a.ringT - DT);
      if (a.ringT === 0) this.emit({ type: 'alarmEnd', id: a.id, x: a.x, z: a.z });
    }
  }

  // la cloche qui sonne le plus près d'elle (à portée), ou null
  bellFor(M) {
    if ((M.floor || 0) !== 0) return null;
    let best = null;
    let bd = ALARM_R;
    for (const a of this.map.alarms || []) {
      if (!(a.ringT > 0.05)) continue;
      const d = Math.hypot(a.x - M.x, a.z - M.z);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  // elle court à la cloche (elle y cherche ensuite quelques secondes) ; arrivée devant, elle frappe : la cloche se tait
  lureTo(M, a) {
    const fx = a.x + a.nx * 0.9;
    const fz = a.z + a.nz * 0.9;
    if (M.lure !== a.id || M.mode !== 'search') {
      M.lure = a.id;
      M.mode = 'search';
      M.silent = false;
      M.ambush = null;
      M.watch = null;
      M.pace = null;
      M.lurk = false;
      M.probe = null;
      M.probeFrom = null;
      M.targetWander = null;
      M.ductGo = null;
      M.repathT = 0;
    }
    M.lastSeenX = fx;
    M.lastSeenZ = fz;
    M.lastSeenF = 0;
    if (Math.hypot(M.x - fx, M.z - fz) < 2.2 && a.ringT > 0.6) {
      a.ringT = 0.6;
      this.emit({ type: 'alarmSmash', id: a.id, x: a.x, z: a.z });
    }
  }

  // S'asseoir au poste de garde : immobile, lampe et caméscope rangés, on regarde les écrans (on reste une proie)
  sitDesk(P) {
    const S = this.map.post;
    if (!S || S.by >= 0) return;
    S.by = P.id;
    P.desk = true;
    P.x = S.seat.x;
    P.z = S.seat.z;
    P.yaw = S.seat.yaw;
    P.pitch = -0.15;
    P.flashlight = false;
    P.cam = false;
    P.running = false;
    P.moving = false;
    P.jy = P.jvy = 0;
    P.crouch = true;
    const n = (this.map.cams || []).length;
    if (!(P.camSel >= 0 && P.camSel < n)) P.camSel = 0;
    this.makeNoise(P, NOISE.pick, 0.6);
    this.emit({ type: 'desk', id: P.id, on: true, x: S.x, z: S.z });
  }

  // se lever (devant le bureau) ; attrapé par l'entité, on est tiré du fauteuil sur place
  leaveDesk(P, caught = false) {
    const S = this.map.post;
    P.desk = false;
    P.crouch = false;
    if (!S) return;
    if (S.by === P.id) S.by = -1;
    if (!caught) {
      P.x = S.front.x;
      P.z = S.front.z;
    }
    this.emit({ type: 'desk', id: P.id, on: false, x: S.x, z: S.z });
  }

  stepDesk(P, input) {
    const S = this.map.post;
    if (input.pick || !S) return this.leaveDesk(P);
    const n = (this.map.cams || []).length;
    if (Number.isInteger(input.camSel) && n) P.camSel = ((input.camSel % n) + n) % n;
    P.yaw = S.seat.yaw;
    P.pitch = -0.15;
    P.moving = false;
    P.running = false;
    P.flashlight = false;
    P.cam = false;
    P.crouch = true;
    P.bumpT = Math.max(0, (P.bumpT || 0) - DT);
    P.noise = P.bumpT > 0 ? P.bumpV : NOISE.breath * 0.5;
    this.updateSignal(P);
  }

  // le point (x, z) est-il à l'écran du gardien Q (la caméra qu'il regarde) ?
  onScreen(Q, floor, x, z, margin = 0) {
    const m = this.fm(floor);
    const c = (m.cams || [])[Q.camSel || 0];
    if (!c || floor !== (Q.floor || 0)) return false;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d > 48) return false;
    let a = Math.atan2(-(x - c.x), -(z - c.z)) - c.yaw;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    if (Math.abs(a) > CCTV_HALF + margin + Math.atan2(0.5, Math.max(0.5, d))) return false;
    return hasLineOfSight(m, c.x, c.z, x, z);
  }

  // longueur d'un trajet dans les gaines : le long du tronc, puis en travers jusqu'à celui de la sortie
  ductLen(a, b) {
    return Math.abs(a.z - b.z) + Math.abs(a.x - b.x);
  }

  // les bouches de sortie pour ressortir près de P : à 7-16 m de lui, personne juste dessous ; from : la bouche
  // d'entrée (un trajet ni trop court ni trop long)
  ductExits(P, from = null) {
    const alive = this.players.filter((Q) => Q.status === 'alive');
    return this.map.ducts.vents.filter((v) => {
      if (v === from || (from && (this.ductLen(from, v) < 14 || this.ductLen(from, v) > DUCT_MAX))) return false;
      const d = Math.hypot(v.x - P.x, v.z - P.z);
      return d > 7 && d < 16 && alive.every((Q) => Math.hypot(Q.x - v.x, Q.z - v.z) > 4.5);
    });
  }

  // de préférence une bouche qu'il voit (il verra la grille tomber)
  ductExit(P, from = null) {
    const outs = this.ductExits(P, from);
    if (!outs.length) return null;
    const seen = outs.filter((v) => hasLineOfSight(this.map, P.x, P.z, v.x, v.z));
    const pool = seen.length ? seen : outs;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Les gaines : loin de sa proie, hors de vue, sans alarme ni poursuite, elle va jusqu'à la bouche la plus proche et
  // s'y glisse quand personne ne la regarde
  ductPlan(M, P, dist, busy) {
    const D = this.map.ducts;
    if (M.ductCD === undefined) M.ductCD = rand(45, 70);
    M.ductCD -= DT;
    if (M.ductGo) {
      const v = D.vents[M.ductGo.in];
      if (busy || (M.mode !== 'patrol' && M.mode !== 'search') || this.time > M.ductGo.until) {
        M.ductGo = null;
        M.ductCD = 12;
        return;
      }
      if (Math.hypot(M.x - v.x, M.z - v.z) < 1.4) {
        if (!this.inSomeView(M.floor || 0, M.x, M.z, 0.15)) this.enterDuct(M, P);
        return;
      }
      if (M.mode !== 'patrol' || !M.targetWander || M.targetWander.x !== v.x || M.targetWander.z !== v.z) {
        M.mode = 'patrol';
        M.targetWander = { x: v.x, z: v.z };
        M.repathT = 0;
      }
      return;
    }
    if (M.ductCD > 0 || busy || (M.mode !== 'patrol' && M.mode !== 'search') || !(dist > 24) || M.trav) return;
    M.ductCD = 4; // (rien ne va : elle réessaiera dans un moment)
    if (this.inSomeView(M.floor || 0, M.x, M.z, 0.1)) return;
    // l'entrée à moins de 18 m d'elle, la sortie près de sa proie : le trajet le plus court (une sortie qu'il voit
    // compte pour un peu moins)
    const outs = this.ductExits(P);
    if (!outs.length) return;
    let inn = null;
    let out = null;
    let best = Infinity;
    for (const v of D.vents) {
      const d = Math.hypot(v.x - M.x, v.z - M.z);
      if (d > 18) continue;
      for (const w of outs) {
        const L = this.ductLen(v, w);
        if (w === v || L < 18 || L > DUCT_MAX) continue;
        const k = d + L * 0.6 - (hasLineOfSight(this.map, P.x, P.z, w.x, w.z) ? 8 : 0) + Math.random() * 4;
        if (k < best) {
          best = k;
          inn = v;
          out = w;
        }
      }
    }
    if (!inn) return;
    M.ductGo = { in: inn.id, out: out.id, until: this.time + 16 };
    M.mode = 'patrol';
    M.targetWander = { x: inn.x, z: inn.z };
    M.repathT = 0;
  }

  // elle se hisse dans la gaine (la grille de la bouche reste ouverte) ; sa proie a pu bouger : la sortie est revue
  enterDuct(M, P) {
    const D = this.map.ducts;
    const a = D.vents[M.ductGo.in];
    let b = D.vents[M.ductGo.out];
    const d = Math.hypot(b.x - P.x, b.z - P.z);
    if (d < 7 || d > 16) b = this.ductExit(P, a) || b;
    const path = [{ x: a.x, z: a.z }];
    if (a.t !== b.t) path.push({ x: a.x, z: b.z });
    path.push({ x: b.x, z: b.z });
    a.open = true;
    M.ductGo = null;
    M.duct = { path, i: 0, out: b.id, bangT: 0.3, landT: 0 };
    M.inDuct = true;
    M.x = a.x;
    M.z = a.z;
    M.v = 0;
    M.path = [];
    M.pathIndex = 0;
    M.trav = null;
    M.portal = null;
    M.silent = true;
    M.mode = 'patrol';
    M.targetWander = null;
    this.emit({ type: 'ductIn', vent: a.id, x: a.x, z: a.z });
  }

  // dans la gaine : elle rampe (des coups de tôle qui se déplacent au-dessus des têtes) ; au-dessus de la sortie, la
  // grille tombe, elle se laisse tomber derrière (DUCT_LAND), puis elle cherche sa proie
  ductStep(M, P) {
    const T = M.duct;
    M.speed = 0;
    M.v = 0;
    if (T.landT > 0) {
      T.landT -= DT;
      if (T.landT > 0) return;
      M.duct = null;
      M.silent = false;
      M.ductCD = rand(...DUCT_CD);
      M.mode = 'search';
      M.lastSeenX = P.x;
      M.lastSeenZ = P.z;
      M.lastSeenF = P.floor || 0;
      M.probe = null;
      M.probeFrom = null;
      M.repathT = 0;
      return;
    }
    let step = DUCT_SPEED * DT;
    while (step > 1e-6 && T.i < T.path.length - 1) {
      const q = T.path[T.i + 1];
      const d = Math.hypot(q.x - M.x, q.z - M.z);
      if (d <= step) {
        M.x = q.x;
        M.z = q.z;
        T.i++;
        step -= d;
      } else {
        M.yaw = Math.atan2(q.x - M.x, q.z - M.z);
        M.x += ((q.x - M.x) / d) * step;
        M.z += ((q.z - M.z) / d) * step;
        step = 0;
      }
    }
    T.bangT -= DT;
    if (T.bangT <= 0) {
      T.bangT = rand(0.3, 0.9);
      this.emit({ type: 'ductBang', x: rnd2(M.x), z: rnd2(M.z), k: rnd2(Math.random()) });
    }
    if (T.i < T.path.length - 1) return;
    const v = this.map.ducts.vents[T.out];
    v.open = true;
    T.landT = DUCT_LAND;
    M.inDuct = false;
    M.silent = false;
    M.yaw = Math.atan2(P.x - M.x, P.z - M.z);
    this.emit({ type: 'ductOut', vent: v.id, x: v.x, z: v.z });
  }

  // Boire l'eau d'amande (la gourde remonte), changer la pile de la lampe, poser l'échelle : ça s'entend un peu
  useItem(P, i) {
    const kind = P.inv[i];
    if (!kind) return this.emit({ type: 'emptySlot', id: P.id });
    if (kind === 'ladder') {
      // l'échelle se pose sous le renfoncement de la cassette
      const N = this.fm(P.floor).niche;
      if (!N || N.ladder || Math.hypot(N.baseX - P.x, N.baseZ - P.z) > 2.2) return this.emit({ type: 'ladderFar', id: P.id });
      N.ladder = true;
      P.inv[i] = null;
      this.makeNoise(P, NOISE.use, 0.8);
      return this.emit({ type: 'ladderPlaced', id: P.id });
    }
    if (kind === 'bottle') {
      if (P.water >= 97) return this.emit({ type: 'useless', kind, id: P.id });
      P.bottles++;
      P.water = Math.min(100, P.water + ALMOND_WATER);
    } else {
      if (P.battery >= 100) return this.emit({ type: 'useless', kind, id: P.id });
      P.battery = Math.min(100, P.battery + BATTERY_PACK);
    }
    P.inv[i] = null;
    this.makeNoise(P, NOISE.use, 0.8);
    this.emit({ type: kind, used: true, id: P.id });
  }

  // G : poser l'objet de la case choisie par terre, juste devant soi (un coéquipier peut le ramasser), un peu à côté
  // si un autre objet y est déjà. Contre un mur ou au bord d'un trou, il tombe à nos pieds ; sur une arête ou dans
  // l'escalier, nulle part où le poser. Comme pour les objets d'un joueur qui meurt, on reprend un objet ramassé du
  // même genre à cet étage (les instantanés restent petits), sinon on en ajoute un
  dropItem(P, i) {
    const kind = P.inv[i];
    if (!kind) return this.emit({ type: 'emptySlot', id: P.id });
    const floor = P.floor || 0;
    const m = this.fm(floor);
    const items = m.items;
    const ok = (x, z) => !this.isColliding(x, z, 0.15, floor) && this.pitUnder(x, z, floor) < 0 && !stairAt(this.stairs, x, z) && hasLineOfSight(m, P.x, P.z, x, z);
    const clear = (x, z) => !(items || []).some((o) => !o.taken && Math.hypot(o.x - x, o.z - z) < 0.28);
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    // devant, puis de part et d'autre, puis à ses pieds (en avant, à droite)
    const spots = [[DROP_AHEAD, 0], [DROP_AHEAD, 0.3], [DROP_AHEAD, -0.3], [0.3, 0.45], [0.3, -0.45], [0, 0]].map(([a, r]) => ({ x: P.x + fx * a - fz * r, z: P.z + fz * a + fx * r })).filter((s) => ok(s.x, s.z));
    const spot = spots.find((s) => clear(s.x, s.z)) || spots[0];
    if (!items || P.onLadder || !spot) return this.emit({ type: 'noDrop', id: P.id });
    const { x, z } = spot;
    let it = items.find((o) => o.taken && o.kind === kind);
    if (it) placeItem(it, kind, x, z);
    else items.push((it = { id: items.length, kind, x, z, gx: cellOf(x), gz: cellOf(z), taken: false }));
    it.taken = false;
    it.lost = false;
    P.inv[i] = null;
    this.makeNoise(P, NOISE.pick, 0.8);
    this.emit({ type: 'drop', kind, id: P.id, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, floor });
  }

  // F : ramasser l'objet le plus proche (dans une case vide, sinon échangé avec la case choisie)
  pickUp(P) {
    // dans un casier : F en ressort ; devant un casier (sans objet plus près) : on s'y enferme
    if (P.hidden >= 0) return this.leaveHide(P);
    // dans la cabine : le bouton (les portes se ferment, l'ascenseur part)
    if (this.inCabin(P) && this.fm(P.floor).elevator && !this.fm(P.floor).elevator.fire) return this.pressLift(P);
    const K = this.nearKey(P);
    if (K) {
      // la première clé trouvée ouvre les portes des deux étages : l'autre disparaît
      for (const f of this.floors) if (f.key) f.key.taken = true;
      this.makeNoise(P, NOISE.pick, 0.8);
      return this.emit({ type: 'key', by: P.id, name: P.name, x: K.x, z: K.z, floor: P.floor || 0 });
    }
    const cas = this.nearCassette(P);
    if (cas) return this.takeCassette(P, cas);
    if (P.desk) return this.leaveDesk(P);
    const it = this.nearItem(P);
    const h = this.nearHide(P);
    // Level 1 : le boîtier d'un quai, un déclencheur d'alarme, le fauteuil du poste (le plus proche l'emporte)
    const ctl = this.controlFor(P, it, h);
    if (ctl) return this.useControl(P, ctl);
    const dIt = it ? Math.hypot(it.x - P.x, it.z - P.z) : Infinity;
    const dH = h ? Math.hypot(hideFront(h).x - P.x, hideFront(h).z - P.z) : Infinity;
    if (h && dH < dIt) return this.enterHide(P, h);
    if (!it) return this.emit({ type: 'nothing', id: P.id });
    this.makeNoise(P, NOISE.pick, 0.8);
    it.taken = true;
    it.lost = false;
    let slot = P.inv.indexOf(null);
    let dropped = null;
    if (slot < 0) {
      // inventaire plein : l'objet de la case choisie reste par terre à sa place
      slot = P.sel - 1;
      dropped = P.inv[slot];
    }
    const kind = it.kind;
    // l'objet de la case choisie reste par terre, à la place de celui qu'on ramasse (le même objet change de genre :
    // avant, chaque échange en ajoutait un nouveau, et les instantanés grossissaient sans fin)
    if (dropped) {
      placeItem(it, dropped, it.x, it.z);
      it.taken = false;
    }
    P.inv[slot] = kind;
    this.emit({ type: 'pickup', kind, dropped, by: P.id });
  }

  // l'objet au sol le plus proche à portée de F (à son étage)
  nearItem(P) {
    let best = null;
    let bd = PICK_R;
    for (const it of this.fm(P.floor).items || []) {
      if (it.taken) continue;
      const d = Math.hypot(it.x - P.x, it.z - P.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  // le trou sous un point (-1 : pas de trou) : ceux du haut mènent à l'étage du dessous, les puits sans fond nulle part
  pitUnder(x, z, floor) {
    const m = this.fm(floor);
    const id = m.pitAt ? m.pitAt(cellOf(x), cellOf(z)) : -1;
    if (id < 0) return -1;
    if (!m.pits[id].deep && !this.floors[floor + 1]) return -1; // pas d'étage en dessous : pas de trou
    return id;
  }

  // l'hôte (ou le joueur seul) tient son équilibre ; s'il le perd, il tombe
  balanceSide(P, mx, my) {
    P.moving = mx !== 0 || my !== 0;
    const side = this.balance(P, mx);
    if (side) this.beamFall(P, side);
    return side;
  }

  // Barre d'équilibre : renvoie le côté de la chute (-1 gauche, 1 droite) ou 0
  balance(P, mx) {
    // (en l'air, on passe au-dessus : l'élan du saut n'est pas cassé par l'arête qu'on survole)
    P.onBeam = !(P.jy > 0) && this.pitUnder(P.x, P.z, P.floor) >= 0;
    if (!P.onBeam) {
      P.tilt *= Math.max(0, 1 - DT * 5);
      P.tiltV = 0;
      return 0;
    }
    const noise = (Math.random() - 0.5) * BEAM_NOISE[P.moving ? 1 : 0];
    P.tiltV += (P.tilt * BEAM_UNSTABLE + noise + mx * BEAM_FIX) * DT;
    P.tiltV *= 1 - DT * BEAM_DAMP;
    P.tilt = Math.max(-1, Math.min(1, P.tilt + P.tiltV * DT));
    return Math.abs(P.tilt) >= 1 ? Math.sign(P.tilt) : 0;
  }

  // Sur l'arête : seulement tout droit (Q et D servent à l'équilibre), lentement, et le pas suit l'arête la plus proche
  beamStep(P, my) {
    const C = CELL_SIZE;
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    const v = my * WALK_SPEED * BEAM_SPEED * DT;
    let dx = fx * v;
    let dz = fz * v;
    // les arêtes sont sur les bords des cases : on y est ramené en douceur, dans le sens de la marche
    const pull = 1.6 * DT;
    if (Math.abs(fx) > Math.abs(fz)) {
      const t = Math.round(P.z / C) * C - P.z;
      if (Math.abs(t) < 0.4) dz += Math.sign(t) * Math.min(Math.abs(t), pull);
    } else {
      const t = Math.round(P.x / C) * C - P.x;
      if (Math.abs(t) < 0.4) dx += Math.sign(t) * Math.min(Math.abs(t), pull);
    }
    return this.moveWithCollisions(P.x, P.z, dx, dz, PLAYER_RADIUS, P.floor);
  }

  // Tomber par un trou : on atterrit à l'étage du dessous, juste en dessous, sonné un instant
  fallThrough(P, pitId, balance = false) {
    const pit = this.fm(P.floor).pits[pitId];
    if (pit.deep) return this.fallDeep(P, pit, balance);
    P.floor += 1;
    P.x = pit.x;
    P.z = pit.z;
    // un meuble juste dessous : on roule à côté (sinon on y resterait coincé)
    if (this.isColliding(P.x, P.z, PLAYER_RADIUS, P.floor)) {
      search: for (let r = 0.4; r <= 3; r += 0.3) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const x = pit.x + Math.cos(a) * r;
          const z = pit.z + Math.sin(a) * r;
          if (!this.isColliding(x, z, PLAYER_RADIUS + 0.05, P.floor)) {
            P.x = x;
            P.z = z;
            break search;
          }
        }
      }
    }
    P.lockT = FALL_LOCK;
    P.running = false;
    P.onBeam = false;
    P.tilt = 0;
    P.tiltV = 0;
    // la chute s'entend de loin
    this.makeNoise(P, NOISE.fall, 1.5);
    this.emit({ type: 'fall', id: P.id, name: P.name, balance, x: P.x, z: P.z, floor: P.floor });
    this.alertMonster(P.x, P.z, 30, P.floor);
  }

  // Un puits sans fond (étage du bas du Level 0) : on y tombe pour de bon. Ce qu'on portait reste au bord, sur le sol
  // le plus proche (sinon l'échelle, perdue au fond, rendrait la partie impossible) ; le cri s'entend de loin
  fallDeep(P, pit, balance = false) {
    if (P.status !== 'alive') return;
    const m = this.fm(P.floor);
    let best = null;
    for (let r = 1; r <= 6 && !best; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const gx = pit.gx + dx;
          const gz = pit.gz + dz;
          if (m.isWall(gx, gz) || m.pitAt(gx, gz) >= 0 || (m.pillarAt && m.pillarAt(gx, gz))) continue;
          const x = (gx + 0.5) * CELL_SIZE;
          const z = (gz + 0.5) * CELL_SIZE;
          const d = (x - P.x) * (x - P.x) + (z - P.z) * (z - P.z);
          if (!best || d < best.d) best = { x, z, d };
        }
      }
    }
    if (best) {
      P.x = best.x;
      P.z = best.z;
    }
    P.onBeam = false;
    P.tilt = 0;
    P.tiltV = 0;
    P.running = false;
    this.makeNoise(P, NOISE.fall, 1.5);
    this.emit({ type: 'abyss', id: P.id, name: P.name, balance, x: pit.x, z: pit.z, floor: P.floor, yaw: P.yaw });
    this.killPlayer(P, { abyss: true });
  }

  // Perdre l'équilibre : on bascule dans le trou du côté où l'on penche
  beamFall(P, side) {
    const rx = Math.cos(P.yaw);
    const rz = -Math.sin(P.yaw);
    P.tilt = 0;
    P.tiltV = 0;
    for (const d of [0.9, 0.6, 1.3]) {
      const id = this.pitUnder(P.x + rx * side * d, P.z + rz * side * d, P.floor);
      if (id >= 0) return this.fallThrough(P, id, true);
    }
  }

  // L'escalier coudé se monte et se descend en marchant : on n'y entre que par le bas de la première volée (depuis
  // l'étage du bas) ou par le haut de la seconde (depuis l'étage du haut), on ne passe ni par-dessus les rampes ni
  // d'une volée à l'autre (il faut faire demi-tour sur le palier), et on change d'étage à mi-hauteur.
  // Renvoie la position permise pour un pas de (P.x, P.z) vers (nx, nz) ; met à jour P.floor.
  stairStep(P, nx, nz) {
    if (!this.stairs.length) return { x: nx, z: nz };
    const C = CELL_SIZE;
    const from = stairAt(this.stairs, P.x, P.z);
    const to = stairAt(this.stairs, nx, nz);
    // La cage vue du dehors : ses murs sont minces, on s'arrête à DOOR_GAP de chacun (collé contre, la caméra passait
    // au travers). Seule son entrée de l'étage laisse passer : le bas de la première volée en bas, la porte en haut
    // (si elle n'est plus cadenassée ; sinon, pousser dessus fait cogner sa chaîne). On n'est jamais tiré vers la cage
    // ni repoussé en sortant : seul le pas qui s'en approche trop est raccourci. Au Level 0, les deux portes (en haut
    // et en bas) restent cadenassées tant que personne n'a trouvé une des deux clés
    if (!from) {
      const fl = P.floor || 0;
      for (const st of this.stairs) {
        const q = stairLocal(st, nx, nz);
        const cu = Math.max(0, Math.min(3 * C, q.u));
        const cv = Math.max(0, Math.min(2 * C, q.v));
        const eu = q.u - cu;
        const ev = q.v - cv;
        const d = Math.hypot(eu, ev);
        if (d >= DOOR_GAP || d < 1e-6) continue;
        const front = eu < 0 && ev === 0; // devant la face des entrées (u = 0)
        const doorSpan = fl === 1 ? q.v > 0.05 && q.v < C - 0.05 : q.v > C + 0.05 && q.v < 2 * C - 0.05;
        if (front && doorSpan && !this.stairsLocked) continue;
        const p0 = stairLocal(st, P.x, P.z);
        const d0 = Math.hypot(p0.u - Math.max(0, Math.min(3 * C, p0.u)), p0.v - Math.max(0, Math.min(2 * C, p0.v)));
        if (d >= d0 - 1e-6) continue; // on s'en éloigne
        if (front && doorSpan && this.stairsLocked && !(P.lockedT > 0)) {
          P.lockedT = 1.6;
          this.makeNoise(P, NOISE.pick, 0.6);
          this.emit({ type: 'locked', id: P.id, x: P.x, z: P.z, floor: P.floor });
        }
        const k = Math.min(DOOR_GAP, d0) / d;
        const u = cu + eu * k;
        const v = cv + ev * k;
        return { x: st.ox + st.dx * u + st.px * v, z: st.oz + st.dz * u + st.pz * v };
      }
    }
    if (!from && !to) return { x: nx, z: nz };
    const st = (from || to).st;
    const r = 0.3; // demi-largeur du joueur entre les rampes
    let lane;
    if (from) lane = from.lane;
    else {
      // on entre : par le bas de la première volée depuis l'étage du bas, par le haut de la seconde depuis celui du haut
      const p0 = stairLocal(st, P.x, P.z);
      const okA = p0.u < 0 && p0.v > 0 && p0.v < C && P.floor === 1;
      const okB = p0.u < 0 && p0.v > C && p0.v < 2 * C && P.floor === 0;
      if (!okA && !okB) return { x: P.x, z: P.z };
      // les portes sont cadenassées tant que personne n'a trouvé une des deux clés
      if (this.stairsLocked) {
        if (!(P.lockedT > 0)) {
          P.lockedT = 1.6;
          this.makeNoise(P, NOISE.pick, 0.6);
          this.emit({ type: 'locked', id: P.id, x: P.x, z: P.z, floor: P.floor });
        }
        return { x: P.x, z: P.z };
      }
      lane = okA ? 'A' : 'B';
    }
    let { u, v } = stairLocal(st, nx, nz);
    v = Math.max(r, Math.min(2 * C - r, v));
    u = Math.min(3 * C - r, u);
    if (lane === 'L') {
      // du palier, on ne s'engage dans une volée qu'en face d'elle (pas à cheval sur la rampe du milieu)
      if (u < 2 * C && Math.abs(v - C) < r) u = 2 * C;
    } else if (u < 2 * C) {
      v = lane === 'A' ? Math.min(v, C - r) : Math.max(v, C + r);
    }
    if (u < 0) {
      const lv = u < 2 * C && lane !== 'L' ? lane : v < C ? 'A' : 'B';
      // on ne sort par le bas qu'en bas, par le haut qu'en haut (l'autre bout donne sur le vide ou sous la dalle)
      if ((lv === 'A' && P.floor !== 1) || (lv === 'B' && P.floor !== 0)) u = 0;
    }
    const x = st.ox + st.dx * u + st.px * v;
    const z = st.oz + st.dz * u + st.pz * v;
    const now = stairAt(this.stairs, x, z);
    if (now) {
      const floor = now.h > 0.5 ? 0 : 1;
      if (floor !== P.floor) {
        P.floor = floor;
        this.emit({ type: 'stairs', id: P.id, up: floor === 0 });
      }
    }
    return { x, z };
  }

  // T : siffler. Les autres l'entendent ; trop de coups de sifflet rapprochés attirent l'entité
  whistle(P) {
    if (P.whistleCd > 0) return;
    P.whistleCd = WHISTLE_CD;
    P.heat += 1;
    this.makeNoise(P, 0.9, 1);
    this.emit({ type: 'whistle', id: P.id, name: P.name, x: P.x, z: P.z, floor: P.floor });
    if (this.goats) {
      if (P.heat >= WHISTLE_HEAT) {
        alertGoats(this, P.x, P.z, 45);
        this.emit({ type: 'heard', id: P.id });
      }
      return;
    }
    const M = this.monster;
    if (!this.hasMonster || M.mode === 'chase' || M.floor !== P.floor) return;
    if (Math.hypot(M.x - P.x, M.z - P.z) > 45) return;
    // trop de coups rapprochés : elle vient à coup sûr (de près, elle l'entend de toute façon : c'est du bruit)
    if (P.heat >= WHISTLE_HEAT && this.alertMonster(P.x, P.z, 45, P.floor)) this.emit({ type: 'heard', id: P.id });
  }

  // Un pas de simulation. input : les commandes du joueur de cet écran ; others : { id: commandes } des autres
  step(input = {}, others = null) {
    if (this.state !== 'playing') return;
    this.time += DT;
    this.updateDin();
    this.updateAmbience();

    // l'ascenseur part : les portes sont fermées, on attend l'arrivée
    if (this.departT > 0) {
      this.departT -= DT;
      if (this.departT <= 0) this.arrive();
      return;
    }
    this.updateBoarding();
    this.updateLift();
    if (this.finaleT > 0) {
      this.finaleT = Math.max(0, this.finaleT - DT);
      if (this.finaleT === 0) this.startFinale();
    }
    if (this.huntT > 0) {
      this.huntT = Math.max(0, this.huntT - DT);
      if (this.huntT === 0) this.startHunt();
    }

    // coupures de courant du Level 1 ; au Level 2, le noir total et le troupeau qui attaque
    if (this.level === 1 || this.level === PIPES_LEVEL) {
      const L2 = this.level === PIPES_LEVEL;
      if (this.blackout > 0) {
        this.blackout -= DT;
        if (this.blackout <= 0) {
          this.blackout = 0;
          this.nextBlackout = rand(...(L2 ? PIPES_BLACKOUT_EVERY : BLACKOUT_EVERY));
          this.map.dark = false;
          this.emit({ type: 'power' });
        }
      } else {
        this.nextBlackout -= DT;
        // la coupure attend un vrai moment de calme (jamais en pleine poursuite)
        if (this.nextBlackout <= 0 && !blackoutAllowed(this)) this.nextBlackout = 2;
        else if (this.nextBlackout <= 0) {
          this.blackout = rand(...(L2 ? PIPES_BLACKOUT_LEN : BLACKOUT_LEN));
          this.map.dark = L2;
          this.emit({ type: 'blackout', len: this.blackout, level: this.level });
        }
      }
    } else if (this.level === 0) this.updateMidBlackout();

    for (const P of this.players) {
      const inp = P.id === this.localId ? input : (others && others[P.id]) || {};
      if (P.status === 'alive') {
        this.stepPlayer(P, inp);
        this.thirst(P);
      }
      // spectateur : il peut encore aider (ou piéger) les vivants
      else if (inp.haunt || inp.useSel || inp.whistle) this.haunt(P, inp.haunt || (inp.useSel ? 'flicker' : 'knock'), inp.view);
    }
    if (this.level === 0) this.updateCalm();
    if (this.state !== 'playing') return;
    if (this.level === 1) {
      this.updatePanel();
      this.updateDocks();
      this.updateAlarms();
      // la porte du poste de garde s'ouvre devant qui arrive (fermée, elle cache et étouffe comme une cloison)
      const gd = this.map.guardDoor;
      if (gd) {
        const want = guardDoorWant(gd, [...this.players.filter((q) => q.status === 'alive' && !((q.floor || 0) > 0)), this.monster && !this.monster.duct ? this.monster : null]);
        if (want !== gd.open) this.emit({ type: 'guardDoor', open: want, x: gd.x, z: gd.z });
        gd.open = want;
      }
    }
    updateDirector(this);
    updateLightsOut(this);
    if (this.level === PIPES_LEVEL) {
      this.updateValves();
      this.updateBreakers();
    }

    if (this.goats) {
      updateGoats(this);
      senseGoats(this);
    } else if (this.hasMonster) this.updateMonster(); // aux Poolrooms aussi : l'entité du Level 1 y chasse
    this.checkElevator();
  }

  // La soif : on se déshydrate peu à peu, plus vite en courant ; sous THIRST_BLUR, la vue se brouille, et à sec on
  // s'effondre. Rien ne bouge dans la cabine d'un ascenseur
  thirst(P) {
    if (P.status !== 'alive' || this.arriveT > 0 || this.liftT > 0) return;
    const was = P.water;
    P.water = Math.max(0, P.water - WATER_DRAIN * (P.running ? WATER_RUN : 1) * DT);
    if (was >= THIRST_BLUR && P.water < THIRST_BLUR) this.emit({ type: 'thirsty', id: P.id, level: 1 });
    if (was >= 12 && P.water < 12) this.emit({ type: 'thirsty', id: P.id, level: 2 });
    if (P.water <= 0) this.killPlayer(P, { thirst: true });
  }

  // F sur une cassette : elle compte pour toute l'équipe. La 6e trouvée, rien ne se passe… quelques secondes
  takeCassette(P, cas) {
    cas.collected = true;
    this.cassettes++;
    P.found++;
    this.makeNoise(P, NOISE.pick, 0.8);
    this.emit({ type: 'cassette', id: cas.id, by: P.id, count: this.cassettes, total: CASSETTES, x: cas.x, z: cas.z, floor: P.floor || 0 });
    if (this.cassettes === CASSETTES && this.level === 0) this.finaleT = FINALE_WAIT;
  }

  // la phase finale du Level 0 : le vrai ascenseur s'ouvre, les néons s'éteignent un à un ; HUNT_DELAY plus tard, les
  // feux rouges et les alarmes, et l'entité se lance à la poursuite de l'équipe
  startFinale() {
    this.realFloor = this.pickRealFloor();
    this.unlockLevel0();
    this.emit({ type: 'exitUnlocked' });
    this.huntT = HUNT_DELAY;
  }

  startHunt() {
    this.hunt = true;
    const M = this.monster;
    if (!this.hasMonster || this.goats || !M) return;
    const P = this.senseMonster();
    if (!P) return;
    // trop loin (ou à l'autre étage) : elle surgit à une vingtaine de mètres, hors de vue
    const far = (M.floor || 0) !== (P.floor || 0) || Math.hypot(M.x - P.x, M.z - P.z) > 38;
    if (far || M.away) {
      const spot = this.warpSpot(P, 'hunt');
      if (spot) {
        M.x = spot.x;
        M.z = spot.z;
        M.floor = spot.floor;
        M.trav = null;
        M.portal = null;
        M.dropY = 0;
        this.placed(M);
      }
    }
    M.away = false;
    M.dormantT = 0;
    M.stunT = 0;
    M.path = [];
    M.repathT = 0;
    this.emit({ type: 'finalHunt', id: P.id, x: M.x, z: M.z, floor: M.floor || 0 });
  }

  // le bouton de la cabine : les portes se ferment en LIFT_CLOSE_T. À plusieurs, si quelqu'un est encore dehors, il
  // faut appuyer une seconde fois (on part sans lui)
  pressLift(P) {
    if (this.liftT > 0 || this.departT > 0) return;
    const out = this.players.filter((Q) => Q.status === 'alive' && !this.inCabin(Q));
    if (out.length && !(P.liftAsk > this.time)) {
      P.liftAsk = this.time + 4;
      this.emit({ type: 'liftWait', id: P.id, n: out.length, names: out.map((Q) => Q.name) });
      return;
    }
    P.liftAsk = 0;
    this.liftT = LIFT_CLOSE_T;
    this.makeNoise(P, NOISE.click, 0.5);
    this.emit({ type: 'liftClose', id: P.id, name: P.name });
  }

  // les portes de la cabine (départ) et de la cabine d'arrivée (Level 1)
  updateLift() {
    if (this.arriveT > 0) {
      this.arriveT = Math.max(0, this.arriveT - DT);
      if (this.arriveT === 0) {
        this.arrivedAt = this.time;
        this.emit({ type: 'arrived' });
      }
    } else if (this.map.arrival && !this.liftShut && this.time - (this.arrivedAt ?? -99) > 1.5) {
      // tout le monde est sorti et s'est éloigné : la cabine d'arrivée se referme pour de bon
      const A = this.map.arrival;
      const alive = this.players.filter((P) => P.status === 'alive');
      if (alive.length && alive.every((P) => Math.hypot(P.x - A.x, P.z - A.z) > 3.4 && !(cellOf(P.x) === A.gx && cellOf(P.z) === A.gz))) {
        this.liftShut = true;
        this.emit({ type: 'arrivalShut' });
      }
    }
    if (!(this.liftT > 0)) return;
    this.liftT = Math.max(0, this.liftT - DT);
    if (this.liftT > 0) return;
    // les portes sont fermées : ceux qui sont dedans partent (pas celui qu'elle tient), les autres restent
    const alive = this.players.filter((P) => P.status === 'alive');
    const inside = alive.filter((P) => this.inCabin(P) && !(P.grabT > 0));
    if (!inside.length) {
      // tout le monde est ressorti : les portes se rouvrent
      this.emit({ type: 'liftOpen' });
      return;
    }
    for (const P of inside) {
      P.status = 'elevator';
      P.moving = false;
      P.running = false;
      P.crouch = false;
      this.emit({ type: 'board', id: P.id, name: P.name });
    }
    for (const P of alive) {
      if (inside.includes(P)) continue;
      this.emit({ type: 'leftBehind', id: P.id, name: P.name });
      this.killPlayer(P);
    }
  }

  stepPlayer(P, input) {
    // 1. Orientation, lampe et inventaire
    if (input.yaw !== undefined) P.yaw = input.yaw;
    if (input.pitch !== undefined) P.pitch = input.pitch;
    if (Number.isInteger(input.sel) && input.sel >= 1 && input.sel <= INV_SIZE) P.sel = input.sel;
    P.whistleCd = Math.max(0, P.whistleCd - DT);
    P.heat = Math.max(0, P.heat - DT / 20);
    P.bumpT = Math.max(0, (P.bumpT || 0) - DT);
    P.lockedT = Math.max(0, (P.lockedT || 0) - DT);
    P.hurtT = Math.max(0, (P.hurtT || 0) - DT);
    this.voice(P, input);
    // agrippé : on ne fait plus que se débattre (n'importe quelle touche)
    if (P.grabT > 0) {
      if (input.struggle) P.struggle += Math.min(4, +input.struggle || 1);
      P.moving = false;
      P.running = false;
      P.noise = NOISE.panic;
      return;
    }
    // caché dans un casier : immobile, lampe éteinte ; Maj retient le souffle (trop longtemps, on suffoque)
    if (P.hidden >= 0) return this.stepHidden(P, input);
    // assis au poste de garde : on ne bouge plus, on passe d'une caméra à l'autre
    if (P.desk) return this.stepDesk(P, input);
    if (input.whistle) this.whistle(P);
    if (input.pick) this.pickUp(P);
    if (P.hidden >= 0) return;
    if (input.toggleFlashlight) {
      if (!P.hasLamp) this.emit({ type: 'noLamp', id: P.id });
      else if (!P.flashlight && P.battery <= 0) this.emit({ type: 'batteryEmpty', id: P.id });
      else {
        P.flashlight = !P.flashlight;
        this.makeNoise(P, NOISE.click, 0.3); // le déclic de la lampe
        this.emit({ type: 'flashlight', on: P.flashlight, id: P.id });
      }
    }
    if (input.use !== undefined && input.use !== null) this.useItem(P, input.use);
    // E : au Level 5, d'abord ce qu'il y a devant soi (cachette, boîtes aux lettres, clavier), sinon l'objet choisi
    if (input.useSel && !(this.level === HOTEL_LEVEL && this.interact(P))) this.useItem(P, P.sel - 1);
    if (typeof input.code === 'string') this.enterCode(P, input.code);
    if (input.drop) this.dropItem(P, P.sel - 1);

    // le caméscope (V) : il tire un peu sur la pile (à plat, il filme encore, mais sans mode nuit)
    if (input.cam !== undefined) P.cam = !!input.cam;
    if (P.cam) P.battery = Math.max(0, P.battery - CAM_DRAIN * DT);
    // la lampe vide la pile ; à plat, elle s'éteint
    if (P.flashlight) {
      P.battery = Math.max(0, P.battery - BATTERY_DRAIN * (this.blackout > 0 ? BLACKOUT_DRAIN : 1) * DT);
      if (P.battery <= 0) {
        P.flashlight = false;
        this.emit({ type: 'batteryEmpty', id: P.id });
      }
    }

    // 2. La course : sans fin (mais elle s'entend de loin, et elle donne soif)
    const mx = input.mx || 0;
    const my = input.my || 0;
    P.crouch = !!input.crouch && !P.onBeam;
    const landed = this.jumpStep(P, input.jump);
    P.running = !!input.run && (mx !== 0 || my !== 0) && !P.onBeam && !P.crouch;

    // 3. Déplacement (un invité se déplace chez lui et annonce sa position : l'hôte la prend si elle est plausible)
    const speed = (P.running ? SPRINT_SPEED : P.crouch ? WALK_SPEED * CROUCH_SPEED : WALK_SPEED) * this.wade(P);
    P.moving = mx !== 0 || my !== 0;
    const pos = input.pos;
    // un invité a perdu l'équilibre chez lui : il bascule dans le trou de ce côté
    if (input.beamFall) this.beamFall(P, Math.sign(input.beamFall));
    if (this.arriveT > 0) {
      // la cabine d'arrivée finit de descendre, portes fermées
      P.moving = false;
      P.running = false;
    } else if (P.lockT > 0) {
      P.lockT = Math.max(0, P.lockT - DT);
      P.moving = false;
    } else if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) && this.posReach(P, pos, input.seq) && !this.isColliding(pos.x, pos.z, PLAYER_RADIUS * 0.8, P.floor)) {
      // un invité se déplace chez lui (et tient son équilibre chez lui) : l'hôte prend sa position et son inclinaison
      if (Number.isFinite(input.seq)) P.posSeq = input.seq;
      const ps = this.stairStep(P, pos.x, pos.z);
      P.x = ps.x;
      P.z = ps.z;
      if (Number.isFinite(input.tilt)) P.tilt = Math.max(-1, Math.min(1, input.tilt));
      P.onBeam = this.pitUnder(P.x, P.z, P.floor) >= 0;
    } else if (input.remote) {
      // invité sans position ce pas-ci : il reste où il est
    } else if (this.balanceSide(P, mx, my) !== 0) {
      // perdu l'équilibre : c'est fait dans balanceSide
    } else if (P.onBeam) {
      P.moving = my !== 0;
      if (my !== 0) {
        const b = this.beamStep(P, my);
        P.x = b.x;
        P.z = b.z;
      }
    } else if (P.moving || P.jy > 0) {
      const v = this.stride(P, this.wishVel(P, mx, my, speed));
      if (v.x || v.z) {
        const p2 = this.moveWithCollisions(P.x, P.z, v.x * DT, v.z * DT, PLAYER_RADIUS, P.floor);
        this.bumpAir(P, p2);
        const p3 = this.stairStep(P, p2.x, p2.z);
        P.x = p3.x;
        P.z = p3.z;
      }
    }

    // 3a. Les portes de la cabine se referment : on ne reste pas entre les vantaux
    if (this.liftT > 0) this.doorShove(P);

    // le bruit qu'on fait : ce que l'entité peut entendre (la course s'entend loin, accroupi presque rien)
    let noise = !P.moving ? 0 : P.running ? NOISE.run : P.crouch ? NOISE.crouch : NOISE.walk;
    if (P.bumpT > 0) noise = Math.max(noise, P.bumpV || 0);
    if (landed) P.landT = 0.25;
    P.landT = Math.max(0, (P.landT || 0) - DT);
    if (P.landT > 0) noise = Math.max(noise, NOISE.land);
    P.noise = noise;

    // 3b. Un pas de trop au-dessus d'un trou : on tombe à l'étage du dessous
    const pitId = P.jy > 0 ? -1 : this.pitUnder(P.x, P.z, P.floor); // en l'air, on passe au-dessus (on retombe dedans)
    if (pitId >= 0) {
      const pit = this.fm(P.floor).pits[pitId];
      if (Math.abs(P.x - pit.x) < PIT_HALF && Math.abs(P.z - pit.z) < PIT_HALF) this.fallThrough(P, pitId);
    }
    // 3c. Level 2 : un jet de vapeur brûlant repousse (l'invité le vit chez lui et le dit à l'hôte) ; le cri attire
    // l'entité
    P.burnT = Math.max(0, (P.burnT || 0) - DT);
    if (this.level === PIPES_LEVEL) {
      const j = !input.remote && !(P.burnT > 0) && P.lockT <= 0 ? this.steamAt(P.x, P.z) : null;
      if (j) this.burn(P, j);
      if (j || input.burn) {
        this.emit({ type: 'burn', id: P.id, name: P.name, x: P.x, z: P.z });
        this.alertMonster(P.x, P.z, 40, P.floor);
      }
    }
    // 3d. Au pied de l'échelle posée : on grimpe jusqu'au renfoncement
    const map = this.fm(P.floor);
    const N = map.niche;
    P.onLadder = !!(N && N.ladder && Math.hypot(N.baseX - P.x, N.baseZ - P.z) < 0.9);

    // 4. Objectifs : les fusibles (Level 1), pour toute l'équipe (les cassettes du Level 0 se ramassent avec F)
    for (const f of map.fuses || []) {
      if (f.taken || Math.hypot(f.x - P.x, f.z - P.z) >= 1.3) continue;
      f.taken = true;
      this.fuses++;
      P.found++;
      // Level 1 : le fusible reste en poche jusqu'au panneau (s'il tombe, il le lâche)
      if (this.level === 1) P.carry.push(f.id);
      this.makeNoise(P, NOISE.pick, 0.8);
      this.emit({ type: 'fuse', id: f.id, by: P.id, count: this.fuses, total: FUSES, x: f.x, z: f.z });
    }
    // Level 5 : les lettres sur papier, ramassées en passant (chacun garde les siennes jusqu'aux boîtes aux lettres)
    for (const L of map.letters || []) {
      if (L.taken || P.hidden >= 0 || Math.hypot(L.x - P.x, L.z - P.z) >= LETTER_R) continue;
      L.taken = true;
      P.letters.push(L.id);
      P.found++;
      this.emit({ type: 'letter', id: L.id, by: P.id, num: L.num, char: this.word[L.idx] || '?' });
    }
    // Level 1 : les fusibles rapportés au panneau du monte-charge (il faudra ensuite le relancer, voir updatePanel)
    if (this.level === 1 && P.carry.length && Math.hypot(map.exit.x - P.x, map.exit.z - P.z) < 2.6) {
      this.delivered = (this.delivered || 0) + P.carry.length;
      this.emit({ type: 'fuseIn', id: P.id, n: P.carry.length, count: this.delivered, total: FUSES });
      P.carry = [];
    }
    // aux Poolrooms, les 3 volants trouvés suffisent : les toboggans s'ouvrent
    if (this.level === 2 && !this.powered && this.fuses >= FUSES) {
      this.powered = true;
      this.emit({ type: 'powered', by: P.id });
      this.emit({ type: 'exitUnlocked' });
    }

    // 4c. Signal (à vol d'oiseau, 0 au-delà de 45 m) : l'objectif le plus proche à cet étage ; s'il n'en reste qu'à
    // l'autre étage, l'escalier ; une fois tout trouvé, l'ascenseur de cet étage (le vrai… ou le faux)
    this.updateSignal(P);

    // 5. Aux Poolrooms : se glisser dans un toboggan ; le premier choisit la couleur, les autres toboggans se referment.
    // (Dans un ascenseur, on entre dans la cabine et on appuie sur le bouton : voir pressLift)
    if (this.open && map.slides) {
      for (const sl of map.slides) {
        if ((this.slide >= 0 && sl.id !== this.slide) || Math.hypot(sl.x - P.x, sl.z - P.z) > MOUTH.enter) continue;
        if (this.slide < 0) this.slide = sl.id;
        P.status = 'elevator';
        P.moving = false;
        P.running = false;
        this.emit({ type: 'board', id: P.id, name: P.name, slide: sl.id });
        break;
      }
    } else if ((!map.elevator || map.elevator.fire) && this.inCabin(P)) {
      // une sortie sans cabine (ou la porte de l'escalier de secours du Level 5) : on part en y arrivant
      P.status = 'elevator';
      P.moving = false;
      P.running = false;
      this.emit({ type: 'board', id: P.id, name: P.name });
    }
  }

  // Level 5 : E devant quelque chose. Renvoie true si E a servi.
  interact(P) {
    const map = this.fm(P.floor);
    if (!map.spots) return false;
    // poster ses lettres : chacune va dans la boîte de sa chambre
    const mb = map.mailbox;
    if (Math.abs(P.x - mb.x) < MAIL_R && P.z > mb.z0 - 0.6 && P.z < mb.z1 + 0.6) {
      if (!P.letters.length) {
        this.emit({ type: 'mailEmpty', id: P.id });
        return true;
      }
      for (const id of P.letters) {
        const L = map.letters[id];
        if (L.posted) continue;
        L.posted = true;
        this.posted++;
        this.emit({ type: 'posted', id: L.id, by: P.id, num: L.num, char: this.word[L.idx] || '?', count: this.posted, total: LETTERS });
      }
      P.letters = [];
      if (this.posted >= LETTERS && !this.codeShown) {
        this.codeShown = true;
        this.emit({ type: 'codeShown' });
      }
      return true;
    }
    // le clavier de la porte de secours : l'écran du joueur ouvre le pavé numérique
    const kp = map.keypad;
    if (!this.open && Math.hypot(P.x - kp.x, P.z - kp.z) < KEYPAD_R) {
      this.emit({ type: 'keypad', id: P.id });
      return true;
    }
    // se cacher sous un lit ou dans une armoire (les cachettes de l'hôtel sont ses « casiers » : map.hides)
    let best = null;
    let bd = Infinity;
    for (const sp of map.spots) {
      const d = Math.min(Math.hypot(sp.out.x - P.x, sp.out.z - P.z), Math.hypot(sp.x - P.x, sp.z - P.z) - 0.6);
      if (d < SPOT_R && d < bd && sp.by < 0) {
        best = sp;
        bd = d;
      }
    }
    if (!best) return false;
    this.enterHide(P, best);
    return true;
  }

  // Level 5 : les lettres d'un joueur attrapé (ou parti) retournent là où elles étaient
  dropLetters(P) {
    for (const id of P.letters || []) {
      const L = (this.map.letters || [])[id];
      if (L && !L.posted) L.taken = false;
    }
    P.letters = [];
  }

  // Level 5 : l'entité renonce et reprend sa ronde, vers un bout du couloir loin de sa proie cachée
  leaveRoom(M, P) {
    const map = this.fm(M.floor);
    const far = (map.corridorCells || map.walkable).filter((c) => Math.hypot((c.x + 0.5) * CELL_SIZE - P.x, (c.z + 0.5) * CELL_SIZE - P.z) > 14);
    const c = far.length ? far[Math.floor(Math.random() * far.length)] : null;
    M.mode = 'patrol';
    M.probe = null;
    M.probeFrom = null;
    M.searchT = 0;
    M.targetWander = c ? { x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE } : null;
    M.repathT = 0;
  }

  // Level 5 : un code tapé sur le clavier de la porte de secours
  enterCode(P, code) {
    const map = this.fm(P.floor);
    if (this.level !== HOTEL_LEVEL || this.open || !map.code) return;
    if (String(code) === map.code) {
      this.powered = true;
      this.emit({ type: 'powered', by: P.id });
      this.emit({ type: 'exitUnlocked' });
    } else this.emit({ type: 'codeWrong', id: P.id });
  }

  // Level 0 : la cassette perchée ne se prend qu'avec l'échelle. Tant que personne ne l'a en main ni ne l'a posée sous
  // le renfoncement, le caméscope mène à l'échelle s'il ne reste à cet étage que la cassette perchée (ou plus rien),
  // ou si l'échelle est tombée des mains d'un joueur mort (ou parti). Elle est à un autre étage : il mène à l'escalier.
  // left : les cassettes à prendre à l'étage du joueur. Rend { sig: 'ladder', x, z }, { sig: 'stairs' } ou null
  ladderGoal(P, left) {
    const N = this.floors[0] && this.floors[0].niche;
    const high = N && this.allCassettes.find((c) => c.high);
    if (!high || high.collected || N.ladder) return null;
    if (this.players.some((Q) => Q.status === 'alive' && Q.inv && Q.inv.includes('ladder'))) return null;
    const lying = this.floors.flatMap((f, fi) => (f.items || []).filter((o) => o.kind === 'ladder' && !o.taken).map((o) => ({ o, fi })));
    if (!lying.length) return null;
    const lost = lying.some(({ o }) => o.lost);
    if (!lost && left.some((c) => !c.high)) return null;
    const here = lying.filter(({ fi }) => fi === (P.floor || 0));
    if (here.length) {
      const o = here.reduce((b, l) => (Math.hypot(l.o.x - P.x, l.o.z - P.z) < Math.hypot(b.o.x - P.x, b.o.z - P.z) ? l : b)).o;
      return { sig: 'ladder', x: o.x, z: o.z };
    }
    // l'échelle est à l'autre étage : à l'escalier, si l'on est à l'étage de la cassette perchée ou si l'échelle est perdue
    return this.stairs.length && (left.some((c) => c.high) || lost) ? { sig: 'stairs' } : null;
  }

  // Level 0 : la panne du milieu de partie (une seule). L'entité en profite : elle sait à peu près où est le joueur
  // le plus proche d'elle
  updateMidBlackout() {
    if (this.blackout > 0) {
      this.blackout -= DT;
      if (this.blackout <= 0) {
        this.blackout = 0;
        this.emit({ type: 'power' });
      }
      return;
    }
    if (this.midBlackout || !this.hasMonster || this.goats || this.open || this.cassettes < L0_BLACKOUT_AT) return;
    if (this.nextBlackout === Infinity) this.nextBlackout = rand(...L0_BLACKOUT_DELAY);
    this.nextBlackout -= DT;
    if (this.nextBlackout > 0) return;
    this.blackoutWait += DT;
    const M = this.monster;
    const busy = M && (M.mode === 'chase' || M.mode === 'grab');
    if (busy || !(blackoutAllowed(this) || this.blackoutWait > 45)) return;
    this.midBlackout = true;
    this.lightsOut = null;
    this.blackout = rand(...L0_BLACKOUT_LEN);
    this.emit({ type: 'blackout', len: this.blackout, level: this.level });
    const alive = this.players.filter((Q) => Q.status === 'alive' && (Q.floor || 0) === (M.floor || 0));
    if (alive.length) {
      const Q = alive.reduce((b, q) => (Math.hypot(q.x - M.x, q.z - M.z) < Math.hypot(b.x - M.x, b.z - M.z) ? q : b));
      this.alertMonster(Q.x + rand(-6, 6), Q.z + rand(-6, 6), 60, Q.floor || 0);
    }
  }

  // Level 0, tout trouvé : le vrai ascenseur. À son étage, droit dessus ; à l'autre, l'escalier (ou d'abord la clé de
  // la porte du haut, si elle est encore cadenassée et qu'il est en bas). Rend { x, z, sig }
  exitGoal(P) {
    const fl = P.floor || 0;
    if (fl === this.realFloor || !this.stairs.length) {
      const X = this.fm(this.realFloor).exit;
      return { x: X.x, z: X.z, sig: 'exit' };
    }
    const K = this.keyOf(fl);
    if (K) return { x: K.x, z: K.z, sig: 'key' };
    const st = this.stairs.reduce((b, q) => (Math.hypot(q.cx - P.x, q.cz - P.z) < Math.hypot(b.cx - P.x, b.cz - P.z) ? q : b));
    const door = fl === 0 ? st.up : st.down;
    return { x: door.x, z: door.z, sig: 'stairs' };
  }

  updateSignal(P) {
    const map = this.fm(P.floor);
    const near = (list) => list.reduce((b, g) => Math.min(b, Math.hypot(g.x - P.x, g.z - P.z)), Infinity);
    let best = Infinity;
    P.sigTo = 'goal';
    if (this.level === 0 && this.finaleT > 0) {
      // la 6e cassette trouvée : plus rien ne capte… quelques secondes
      P.signal = 0;
      return;
    }
    if (this.level === 0 && !this.open) {
      const left = (map.cassettes || []).filter((c) => !c.collected);
      best = near(left);
      const lad = this.ladderGoal(P, left);
      if (lad) {
        best = lad.sig === 'ladder' ? Math.hypot(lad.x - P.x, lad.z - P.z) : near(this.stairs);
        P.sigTo = lad.sig;
      } else if (best === Infinity && this.stairs.length) {
        const K = this.keyOf(P.floor);
        if (K) {
          best = Math.hypot(K.x - P.x, K.z - P.z);
          P.sigTo = 'key';
        } else {
          best = near(this.stairs);
          P.sigTo = 'stairs';
        }
      }
    } else if ((this.level === 1 || this.level === 2) && (map.fuses || []).some((f) => !f.taken)) {
      best = near((map.fuses || []).filter((f) => !f.taken));
    } else if (this.level === HOTEL_LEVEL && !this.open) {
      // Level 5 : les lettres à trouver ; des lettres en poche, les boîtes aux lettres ; toutes postées, le clavier
      const mb = map.mailbox;
      const box = { x: mb.x + 0.8, z: (mb.z0 + mb.z1) / 2 };
      if (this.posted >= LETTERS) {
        best = near([map.keypad]);
        P.sigTo = 'keypad';
      } else if (P.letters.length) {
        best = near([box]);
        P.sigTo = 'mail';
      } else best = near((map.letters || []).filter((L) => !L.taken));
    } else if (map.slides && map.slides.length) {
      best = near(this.slide >= 0 ? [map.slides[this.slide]] : map.slides);
      P.sigTo = 'exit';
    } else if (this.level === PIPES_LEVEL && !this.open) {
      best = (map.valves || []).filter((v) => !v.closed).reduce((b, v) => Math.min(b, Math.hypot(v.sx - P.x, v.sz - P.z)), Infinity);
    } else if (this.level === 0 && this.floors.length > 1) {
      // tout est trouvé : le caméscope montre le vrai ascenseur, de partout (jamais tout à fait sans signal)
      const G = this.exitGoal(P);
      P.sigTo = G.sig;
      P.sigX = G.x;
      P.sigZ = G.z;
      P.signal = Math.max(0.2, 1 - Math.hypot(G.x - P.x, G.z - P.z) / SIGNAL_RANGE);
      if (this.blackout > 0) P.signal = 0;
      return;
    } else {
      best = Math.hypot(map.exit.x - P.x, map.exit.z - P.z);
      P.sigTo = 'exit';
    }
    P.signal = best === Infinity ? 0 : Math.max(0, 1 - best / SIGNAL_RANGE);
    // dans le noir d'une coupure, le caméscope ne capte plus rien
    if (this.blackout > 0) P.signal = 0;
  }

  // Caché dans un casier : on ne bouge pas, on retient son souffle (Maj) ; à bout de souffle, on suffoque bruyamment
  stepHidden(P, input) {
    if (input.pick || (input.useSel && this.fm(P.floor).spots)) return this.leaveHide(P);
    P.moving = false;
    P.running = false;
    P.flashlight = false;
    const want = !!input.run && P.breath > 0 && !(P.gaspT > 0);
    if (want !== P.holding) this.emit({ type: 'breath', id: P.id, on: want });
    P.holding = want;
    P.gaspT = Math.max(0, (P.gaspT || 0) - DT);
    if (P.holding) {
      P.breath = Math.max(0, P.breath - (100 / BREATH_HOLD) * DT);
      if (P.breath <= 0) {
        P.holding = false;
        P.gaspT = 2.5;
        this.makeNoise(P, NOISE.gasp, 1.2);
        this.emit({ type: 'gasp', id: P.id, x: P.x, z: P.z, floor: P.floor });
      }
    } else P.breath = Math.min(100, P.breath + BREATH_BACK * DT);
    P.bumpT = Math.max(0, (P.bumpT || 0) - DT);
    P.noise = P.holding ? 0 : Math.max(NOISE.breath, P.bumpT > 0 ? P.bumpV : 0);
    this.updateSignal(P);
  }

  // Level 1 : les 3 fusibles au panneau, il faut encore relancer le monte-charge en restant devant (bruyant : le moteur
  // tousse, l'entité l'entend de loin). À plusieurs, plus vite ; lâché, il redescend doucement.
  updatePanel() {
    if (this.powered || (this.delivered || 0) < FUSES) return;
    const E = this.map.exit;
    const near = this.players.filter((P) => P.status === 'alive' && P.hidden < 0 && Math.hypot(E.x - P.x, E.z - P.z) < 2.6);
    if (near.length) {
      if (this.panel === 0) this.emit({ type: 'panelStart', by: near[0].id, x: E.x, z: E.z });
      this.panel = Math.min(1, this.panel + (DT / PANEL_T) * (near.length > 1 ? 1.5 : 1));
      this.panelNoiseT -= DT;
      if (this.panelNoiseT <= 0) {
        this.panelNoiseT = 1.5;
        this.alertMonster(E.x, E.z, 30, 0);
        this.emit({ type: 'panelNoise', x: E.x, z: E.z, p: this.panel });
      }
      for (const P of near) this.makeNoise(P, 0.6, 0.3);
    } else this.panel = Math.max(0, this.panel - DT * 0.1);
    if (this.panel < 1) return;
    this.powered = true;
    this.emit({ type: 'powered', by: near[0].id });
    this.emit({ type: 'exitUnlocked' });
  }

  // Invité : il déplace seulement son joueur, sans rien ramasser ni décider (l'hôte le fera). Renvoie le côté d'une
  // chute de la barre d'équilibre (l'hôte fera tomber), sinon 0.
  // Le saut (Espace) : un petit bond qui s'entend à la réception. Pas sur une arête ni sur une échelle ; accroupi, on
  // se relève d'abord. Rend true au pas où l'on retombe.
  jumpStep(P, want) {
    if (want && !(P.jy > 0) && !P.onBeam && !P.onLadder && !(P.lockT > 0) && !(this.arriveT > 0)) {
      P.jy = 0.001;
      P.jvy = JUMP_V;
      P.crouch = false;
      P.takeoff = true; // l'élan est pris au premier pas en l'air (stride)
    }
    if (!(P.jy > 0)) return false;
    P.crouch = false;
    P.jy += P.jvy * DT;
    P.jvy -= JUMP_G * DT;
    if (P.jy > 0) return false;
    P.jy = 0;
    P.jvy = 0;
    P.takeoff = false;
    return true;
  }

  // la vitesse voulue (m/s) d'après les touches, dans le repère du regard
  wishVel(P, mx, my, speed) {
    if (!mx && !my) return { x: 0, z: 0 };
    const len = Math.hypot(mx, my) || 1;
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    const rx = Math.cos(P.yaw);
    const rz = -Math.sin(P.yaw);
    return { x: ((fx * my + rx * mx) / len) * speed, z: ((fz * my + rz * mx) / len) * speed };
  }

  // La vitesse du pas (m/s) : au sol, celle des touches ; en l'air, on garde l'élan pris à l'appel (un saut en courant
  // file à la vitesse de la course, même touches lâchées). Les touches ne font que l'infléchir (AIR_ACCEL) : elles
  // n'enlèvent rien à l'élan dans leur sens, et l'on ne dépasse jamais la course
  stride(P, w) {
    if (!(P.jy > 0)) return w;
    if (P.takeoff) {
      P.takeoff = false;
      P.avx = w.x;
      P.avz = w.z;
      return w;
    }
    const ws = Math.hypot(w.x, w.z);
    if (ws > 0) {
      const ux = w.x / ws;
      const uz = w.z / ws;
      const add = Math.min(Math.max(0, ws - ((P.avx || 0) * ux + (P.avz || 0) * uz)), AIR_ACCEL * DT);
      P.avx = (P.avx || 0) + ux * add;
      P.avz = (P.avz || 0) + uz * add;
      const v = Math.hypot(P.avx, P.avz);
      const cap = SPRINT_SPEED * this.wade(P);
      if (v > cap) {
        P.avx *= cap / v;
        P.avz *= cap / v;
      }
    }
    return { x: P.avx || 0, z: P.avz || 0 };
  }

  // en l'air, un mur arrête l'élan qui va vers lui (on glisse le long)
  bumpAir(P, p) {
    if (!(P.jy > 0)) return;
    P.avx = (p.x - P.x) / DT;
    P.avz = (p.z - P.z) / DT;
  }

  predict(input = {}) {
    const P = this.player;
    P.lockedT = Math.max(0, (P.lockedT || 0) - DT);
    // trace de ses positions de la dernière seconde et demie : l'instantané de l'hôte, en retard, est comparé à elle
    const tr = this.trail || (this.trail = []);
    tr.push(P.x, P.z, P.floor);
    if (tr.length > 270) tr.splice(0, tr.length - 270);
    if (input.cam !== undefined) P.cam = !!input.cam && P.status === 'alive';
    if (this.state !== 'playing' || P.status !== 'alive' || this.departT > 0 || this.arriveT > 0) return 0;
    // agrippé ou dans un casier : l'hôte décide de tout (on ne bouge pas, le regard suit l'instantané)
    if (P.grabT > 0 || P.hidden >= 0 || P.desk) {
      P.moving = false;
      P.running = false;
      if (P.hidden >= 0 && input.yaw !== undefined) P.yaw = input.yaw;
      // au poste : la caméra choisie s'affiche tout de suite (l'hôte la reçoit avec les commandes)
      const n = (this.map.cams || []).length;
      if (P.desk && n && Number.isInteger(input.camSel)) P.camSel = ((input.camSel % n) + n) % n;
      return 0;
    }
    if (input.yaw !== undefined) P.yaw = input.yaw;
    if (input.pitch !== undefined) P.pitch = input.pitch;
    if (P.lockT > 0) {
      P.lockT = Math.max(0, P.lockT - DT);
      return 0;
    }
    const mx = input.mx || 0;
    const my = input.my || 0;
    P.moving = mx !== 0 || my !== 0;
    P.crouch = !!input.crouch && !P.onBeam;
    this.jumpStep(P, input.jump);
    const side = this.balance(P, mx);
    if (side) {
      P.tilt = 0;
      P.tiltV = 0;
      return side;
    }
    if (P.onBeam) {
      P.running = false;
      P.moving = my !== 0;
      if (my !== 0) {
        const b = this.beamStep(P, my);
        P.x = b.x;
        P.z = b.z;
      }
      return 0;
    }
    P.running = !!input.run && P.moving && !P.crouch;
    const speed = (P.running ? SPRINT_SPEED : P.crouch ? WALK_SPEED * CROUCH_SPEED : WALK_SPEED) * this.wade(P);
    const v = this.stride(P, this.wishVel(P, mx, my, speed));
    if (!v.x && !v.z) {
      // immobile dans un jet de vapeur : on se brûle aussi
      this.predictBurn(P);
      return 0;
    }
    const pos = this.moveWithCollisions(P.x, P.z, v.x * DT, v.z * DT, PLAYER_RADIUS, P.floor);
    this.bumpAir(P, pos);
    const ps = this.stairStep(P, pos.x, pos.z);
    P.x = ps.x;
    P.z = ps.z;
    this.predictBurn(P);
    return 0;
  }

  // l'invité se brûle chez lui : repoussé tout de suite ; burned dit à l'application de prévenir l'hôte
  predictBurn(P) {
    P.burnT = Math.max(0, (P.burnT || 0) - DT);
    if (this.level !== PIPES_LEVEL || P.burnT > 0) return;
    const j = this.steamAt(P.x, P.z);
    if (!j) return;
    this.burn(P, j);
    this.burned = true;
  }

  // Un joueur arrive en cours de partie : spectateur jusqu'au prochain étage
  addPlayer(id, name) {
    if (this.players.some((p) => p.id === id)) return;
    this.roster.push({ id, name });
    const P = newPlayer(id, name, this.map, this.players.length);
    P.status = 'dead';
    P.cam = false;
    this.players.push(P);
  }

  // Pistes d'affichage des autres (interp.js) : chez l'invité, les instantanés de l'hôte (l'entité est la piste 'M') ;
  // chez l'hôte, les positions annoncées par les invités. Elles ne servent qu'à l'image : ni la logique du jeu ni les
  // instantanés ne les lisent
  netPush(id, t, now, x, z, yaw, f, live = true, h = 0) {
    const tracks = this.tracks || (this.tracks = new Map());
    let tr = tracks.get(id);
    // l'entité change d'étage en marchant (l'escalier) ou en tombant (un trou) : pas de coupure de la piste
    if (!tr) tracks.set(id, (tr = new Track(id === 'M' ? { floorCut: false } : undefined)));
    if (live) tr.push(t, now, x, z, yaw, f, h);
    else tr.reset();
  }

  // la position à afficher de id, dans out { x, z, yaw, f } : false sans piste ou loin de E (un saut que la piste
  // n'a pas encore reçu : chute, téléportation, retour au point de départ)
  netSample(id, now, out, E = null) {
    const tr = this.tracks && this.tracks.get(id);
    if (!tr || !tr.sample(now, out)) return false;
    return !E || ((out.f === (E.floor || 0) || id === 'M') && Math.hypot(out.x - E.x, out.z - E.z) < 4);
  }

  // Invité : avant chaque image, les autres joueurs et l'entité prennent leur position interpolée (un mouvement
  // régulier, au lieu d'un pas toutes les 50 ms) ; l'instantané suivant remet les positions reçues, ce pas-ci repasse
  interpolate(now) {
    const o = this.interpOut || (this.interpOut = { x: 0, z: 0, yaw: 0, f: 0, h: 0 });
    const put = (E, id) => {
      if (!this.netSample(id, now, o, E)) return;
      E.x = o.x;
      E.z = o.z;
      E.yaw = o.yaw;
      if (id === 'M') E.y = o.h;
    };
    for (const Q of this.players) if (Q !== this.player && Q.status === 'alive') put(Q, Q.id);
    if (this.monster) put(this.monster, 'M');
  }

  // Un joueur s'en va : il disparaît de la partie ; s'il était le dernier dehors, l'ascenseur part
  removePlayer(id) {
    const P = this.players.find((p) => p.id === id);
    if (P) {
      this.dropLetters(P); // Level 5 : ses lettres retournent à leur place
      // ce qu'il portait reste dans la partie (fusibles, échelle, piles), et son casier se libère
      if (P.status === 'alive') {
        this.dropCarry(P);
        this.dropInv(P);
      }
      if (P.hidden >= 0) {
        const h = (this.fm(P.floor).hides || [])[P.hidden];
        if (h && h.by === id) h.by = -1;
        P.hidden = -1;
      }
      const M = this.monster;
      if (M && M.grabbing === id) {
        M.grabbing = null;
        if (M.mode === 'grab') {
          M.mode = 'search';
          M.lastSeenX = P.x;
          M.lastSeenZ = P.z;
          M.lastSeenF = P.floor || 0;
          M.repathT = 0;
        }
      }
    }
    this.roster = this.roster.filter((r) => r.id !== id);
    this.players = this.players.filter((p) => p.id !== id);
    if (this.players.length && this.state === 'playing') this.checkElevator();
  }

  // Instantané envoyé par l'hôte aux invités (~20 fois par seconde)
  snapshot() {
    const M = this.monster;
    const bits = (list, k) => (list || []).map((o) => (o[k] ? 1 : 0)).join('');
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      lv: this.level,
      st: this.state,
      tm: r2(this.time),
      c: this.cassettes,
      f: this.fuses,
      pw: this.powered ? 1 : 0,
      bo: r2(this.blackout),
      mb: this.midBlackout ? 1 : 0,
      dp: r2(this.departT),
      bt: r2(this.boardT),
      // les portes de la cabine qui se ferment, la cabine d'arrivée (Level 1), le silence puis la traque du Level 0
      lt: r2(this.liftT),
      at: r2(this.arriveT),
      lk: this.liftShut ? 1 : 0,
      fw: r2(this.finaleT),
      hu: this.hunt ? 1 : 0,
      sl: this.slide,
      wd: this.word,
      po: this.posted,
      cs: this.codeShown ? 1 : 0,
      lt: (this.map.letters || []).map((L) => (L.posted ? 2 : L.taken ? 1 : 0)).join(''),
      // le vrai ascenseur ne se dévoile qu'une fois les cassettes trouvées
      rf: this.open ? this.realFloor : -1,
      p: this.players.map((P) => [P.id, r2(P.x), r2(P.z), r2(P.yaw), r2(P.pitch), P.status, P.flashlight ? 1 : 0, Math.round(P.battery), Math.round(P.water * 10) / 10, P.inv.map((k) => k || '').join(','), r2(P.signal), P.running ? 1 : 0, P.moving ? 1 : 0, P.found, P.name, P.hasLamp ? 1 : 0, P.sel, P.floor, P.sigTo, P.onLadder ? 1 : 0, r2(P.lockT), r2(P.tilt), P.onBeam ? 1 : 0, P.bottles, r2(P.grabT), P.hidden, P.crouch ? 1 : 0, P.carry.join('.'), P.hurt || 0, Math.round(P.breath), P.holding ? 1 : 0, P.grabs || 0, r2(P.struggle || 0), r2(P.jy || 0), P.cam ? 1 : 0, r2(P.noise || 0), P.letters.join('.'), r2(P.detect), P.desk ? 1 : 0, P.camSel || 0]),
      // l'entité : position, regard, mode, … et la hauteur de ses pieds (les marches, la chute dans un trou)
      // (et, pour un invité qui deviendrait l'hôte : sa minute de calme, et si la première rencontre a eu lieu)
      m: [r2(M.x), r2(M.z), r2(M.yaw), M.mode, M.silent ? 1 : 0, M.floor, M.grabbing ?? -1, r2(M.rushT || 0), M.away ? 1 : 0, r2(M.y ?? -(M.floor || 0) * FLOOR_DY), Math.round(M.dormantT || 0), this.glimpseAt === Infinity ? 1 : 0, M.inDuct ? 1 : 0, r2(M.duct && M.duct.landT > 0 ? M.duct.landT : 0)],
      // néons : 1 allumé, 0 éteint, 2 qui grésille (les coupures du directeur, les néons qui meurent un à un)
      ls: this.floors.map((f) => (f.lights || []).flatMap((l, i) => (l.state !== l.s0 ? [i * 3 + (l.state === 'off' ? 0 : l.state === 'flicker' ? 2 : 1)] : []))),
      // les néons éteints un instant par le metteur en scène : [étage, néon, secondes, état au retour]
      dr: this.director && this.director.drops.length ? this.director.drops.map((d) => [Math.max(0, this.floors.indexOf(d.map || this.map)), (d.map || this.map).lights.indexOf(d.l), r2(d.t), d.back]) : undefined,
      cw: this.level === 0 ? this.floors.map((f) => (f.calm || []).map((n) => r2(n.wear || 0))) : null,
      rd: this.lightsOut ? 1 : undefined, // les néons meurent : plus de talkie
      mp: this.fp, // l’empreinte de la carte : un invité qui n'a pas la même (vieille version en cache) est prévenu
      kk: this.floors.some((f) => f.key) ? (this.stairsLocked ? 0 : 1) : undefined, // une des clés de l'escalier trouvée
      // Level 1 : fusibles (ils peuvent être tombés ailleurs), fusibles au panneau, redémarrage du monte-charge
      fp: this.level === 1 ? (this.map.fuses || []).map((f) => [r2(f.x), r2(f.z)]) : null,
      dl: this.delivered || 0,
      pn: r2(this.panel || 0),
      hd: (this.map.hides || []).map((h) => h.by),
      // Level 1 : les rideaux des quais [ouverture, sens, arraché, forcé], les alarmes (0 : intacte, sinon 1 + ce qu'il
      // reste à sonner), les bouches de ventilation ouvertes, qui est assis au poste
      dk: this.map.docks ? this.map.docks.map((d) => [r2(d.o), d.dir, d.broken ? 1 : 0, r2(d.force)]) : undefined,
      al: this.map.alarms ? this.map.alarms.map((a) => (a.used ? 1 + r2(a.ringT) : 0)) : undefined,
      vo: this.map.ducts ? bits(this.map.ducts.vents, 'open') : undefined,
      pb: this.map.post ? this.map.post.by : undefined,
      k: [bits(this.allCassettes, 'collected'), bits(this.map.fuses, 'taken'), this.floors.map((f) => bits(f.items, 'taken')).join('|'), ''],
      // objets posés par des joueurs (échanges) : [étage, objet, x, z] ; échelle posée
      ix: this.floors.flatMap((f, fi) => (f.items || []).slice(this.items0[fi]).map((o) => [fi, o.kind, r2(o.x), r2(o.z)])),
      // objets d'origine qui ont changé de place ou de genre (échangés, lâchés par un joueur mort) : [numéro, genre, x, z]
      im: this.floors.map((f) => (f.items || []).flatMap((o, i) => (o.o && (o.kind !== o.o[0] || o.x !== o.o[1] || o.z !== o.o[2]) ? [[i, o.kind, r2(o.x), r2(o.z)]] : []))),
      nl: this.floors.some((f) => f.niche && f.niche.ladder) ? 1 : 0,
      // échelles tombées des mains d'un mort, que le caméscope montre : [étage, numéro de l'objet]
      ll: this.floors.flatMap((f, fi) => (f.items || []).flatMap((o, i) => (o.lost && !o.taken ? [[fi, i]] : []))),
      // vannes du Level 2 : -1 fermée, sinon combien elle est tournée
      v: (this.map.valves || []).map((v) => (v.closed ? -1 : r2(v.turn))),
      // courant des secteurs (0 à 3) et disjoncteurs (-1 réarmé, sinon l'avancée)
      sp: (this.map.valves || []).map((v) => v.power || 0),
      br: (this.map.breakers || []).map((b) => (b.done ? -1 : r2(b.turn))),
      // le troupeau du Level 2 : [x, z, cap, état] par chèvre
      gt: this.goats ? goatSnapshot(this.goats) : null,
    };
  }

  // Invité : applique l'instantané de l'hôte. Son propre joueur garde sa position prédite, sauf grand écart
  // now : l'heure locale de réception (en secondes), pour interpoler l'affichage des autres (interpolate)
  applySnapshot(snap, now) {
    if (snap.lv !== this.level) this.loadLevel(snap.lv);
    this.state = snap.st;
    this.time = snap.tm;
    this.cassettes = snap.c;
    this.fuses = snap.f;
    this.powered = !!snap.pw;
    this.blackout = snap.bo;
    this.midBlackout = !!snap.mb;
    if (Array.isArray(snap.ls)) {
      snap.ls.forEach((row, fi) => {
        const f = this.floors[fi];
        if (!f || !f.lights || !Array.isArray(row)) return;
        const want = new Map();
        for (const v of row) want.set(Math.floor(v / 3), ['off', 'on', 'flicker'][v % 3]);
        let changed = false;
        f.lights.forEach((l, i) => {
          const st = want.get(i) || l.s0 || l.state;
          if (l.state !== st) {
            l.state = st;
            l.flicker = st === 'flicker';
            changed = true;
          }
        });
        if (changed) lightsChanged(f);
      });
    }
    if (this.director) {
      const drops = [];
      for (const [fi, li, t, back] of snap.dr || []) {
        const f = this.floors[fi];
        const l = f && f.lights ? f.lights[li] : null;
        if (l) drops.push({ l, t, back, map: f });
      }
      this.director.drops = drops;
    }
    if (snap.cw) snap.cw.forEach((row, fi) => (this.floors[fi] && this.floors[fi].calm || []).forEach((n, i) => (n.wear = row[i] || 0)));
    this.rdSnap = !!snap.rd;
    if (snap.kk !== undefined) for (const f of this.floors) if (f.key) f.key.taken = !!snap.kk;
    this.map.dark = this.level === PIPES_LEVEL && this.blackout > 0;
    this.departT = snap.dp;
    this.boardT = snap.bt || 0;
    this.liftT = snap.lt || 0;
    this.arriveT = snap.at || 0;
    this.liftShut = !!snap.lk;
    this.finaleT = snap.fw || 0;
    this.hunt = !!snap.hu;
    this.slide = snap.sl ?? -1;
    if (snap.wd) this.word = snap.wd;
    this.posted = snap.po || 0;
    this.codeShown = !!snap.cs;
    (this.map.letters || []).forEach((L, i) => {
      const v = (snap.lt || '')[i];
      L.taken = v === '1' || v === '2';
      L.posted = v === '2';
    });
    if (snap.rf >= 0 && !this.unlocked) {
      this.realFloor = snap.rf;
      if (this.level === 0) this.unlockLevel0();
    }
    const seen = new Set();
    for (const row of snap.p) {
      const [id, x, z, yaw, pitch, status, fl, bat, water, inv, signal, running, moving, found, name, lamp, sel, floor, sigTo, onLadder, lockT, tilt, onBeam, bottles, grabT, hidden, crouch, carryN, hurt, breath, holding, grabs, struggle, jy, cam, noise, letters = '', detect = 0, desk = 0, camSel = 0] = row;
      seen.add(id);
      let P = this.players.find((q) => q.id === id);
      if (!P) {
        this.roster.push({ id, name });
        P = newPlayer(id, name, this.map, this.players.length);
        this.players.push(P);
      }
      const mine = id === this.localId;
      // un coup (une chèvre) ou une chute commence : la position de l'hôte compte (le recul, l'arrivée en bas)
      const lockStart = lockT > 0 && !(P.lockSeen > 0) && !(P.lockT > 0);
      // l'hôte voit l'invité avec un temps de retard : on ne le ramène que si sa position ne figure nulle part
      // dans sa trace récente (sinon, à la course, chaque instantané le tirerait en arrière)
      // entrer dans une cachette ou en sortir : l'hôte place le joueur
      const hideChange = mine && hidden !== P.hidden;
      let far = Math.hypot(P.x - x, P.z - z) > 2.5 || hideChange;
      if (far && mine && this.trail && status === 'alive' && P.status === 'alive') {
        const tr = this.trail;
        for (let i = 0; i < tr.length; i += 3) if (tr[i + 2] === floor && Math.hypot(tr[i] - x, tr[i + 1] - z) < 1.2) { far = false; break; }
      }
      if (far && mine) this.trail = [];
      // dans l'escalier, l'invité change d'étage chez lui (l'hôte suit sa position avec un temps de retard) : il ne
      // doit pas être ramené en arrière à chaque instantané qui a encore l'ancien étage
      const ownStairs = mine && !far && status === 'alive' && P.status === 'alive' && (stairAt(this.stairs, P.x, P.z) || stairAt(this.stairs, x, z));
      // l'hôte décide des chutes : la position suit
      if (!mine) {
        // les autres : leurs positions reçues vont dans leur piste, et l'affichage les interpole (interpolate)
        if (now !== undefined) this.netPush(id, snap.tm, now, x, z, yaw, floor || 0, status === 'alive');
        P.x = x;
        P.z = z;
        P.yaw = yaw;
      } else if (!ownStairs && (far || lockStart || status !== 'alive' || P.status !== 'alive' || P.floor !== floor)) {
        P.x = x;
        P.z = z;
      }
      if (!mine) {
        P.pitch = pitch;
        P.running = !!running;
        P.moving = !!moving;
      } else if ((P.floor !== floor && !ownStairs) || (hideChange && hidden >= 0)) P.yaw = yaw;
      P.letters = letters ? String(letters).split('.').map(Number) : [];
      P.detect = detect;
      if (!ownStairs) P.floor = floor || 0;
      P.status = status;
      P.flashlight = !!fl;
      P.hasLamp = !!lamp;
      if (!mine && sel) P.sel = sel;
      P.sigTo = sigTo || 'goal';
      P.onLadder = !!onLadder;
      // un blocage (coup, chute) ne s'applique qu'à son début : un instantané en retard ne le relance pas une fois fini
      if (lockT > 0 && !(P.lockSeen > 0) && !(P.lockT > 0)) P.lockT = lockT;
      P.lockSeen = lockT;
      if (!mine) {
        P.tilt = tilt || 0;
        P.onBeam = !!onBeam;
      }
      // la soif et le bruit se comptent chez l'hôte
      P.water = water ?? 100;
      P.noise = noise || 0;
      P.bottles = bottles || 0;
      P.battery = bat;
      P.grabT = grabT || 0;
      P.grabs = grabs || 0;
      // la poussée du joueur de cet écran se compte chez lui ; l'hôte confirme
      if (!mine || !(P.grabT > 0)) P.struggle = struggle || 0;
      const wasHidden = P.hidden;
      P.hidden = hidden ?? -1;
      // il vient de sortir du casier : sa position est celle de l'hôte (devant la porte)
      if (mine && wasHidden >= 0 && P.hidden < 0) {
        P.x = x;
        P.z = z;
      }
      // assis au poste ou relevé : là où l'hôte l'a mis (le fauteuil, devant le bureau)
      const wasDesk = !!P.desk;
      P.desk = !!desk;
      if (mine && wasDesk !== P.desk) {
        P.x = x;
        P.z = z;
      }
      if (!mine) P.camSel = camSel || 0;
      if (!mine) P.crouch = !!crouch;
      if (!mine) P.jy = +jy || 0;
      if (!mine) P.cam = !!cam;
      // les fusibles qu'il a en poche (s'il devient l'hôte, ils ne se perdent pas)
      P.carry = typeof carryN === 'string' && carryN ? carryN.split('.').map(Number) : [];
      P.carryN = P.carry.length;
      P.hurt = hurt || 0;
      P.breath = breath ?? 100;
      P.holding = !!holding;
      const kinds = (inv || '').split(',');
      P.inv = Array.from({ length: INV_SIZE }, (_, i) => kinds[i] || null);
      P.signal = signal;
      P.found = found;
    }
    this.players = this.players.filter((q) => seen.has(q.id));
    this.roster = this.roster.filter((r) => seen.has(r.id));
    const M = this.monster;
    const [mx, mz] = snap.m;
    M.x = mx;
    M.z = mz;
    [, , M.yaw, M.mode] = snap.m;
    M.y = snap.m[9] ?? -(snap.m[5] || 0) * FLOOR_DY;
    if (now !== undefined) this.netPush('M', snap.tm, now, mx, mz, M.yaw, snap.m[5] || 0, !snap.m[8], M.y);
    M.silent = !!snap.m[4];
    M.floor = snap.m[5] || 0;
    M.grabbing = snap.m[6] >= 0 ? snap.m[6] : null;
    M.rushT = snap.m[7] || 0;
    M.away = !!snap.m[8]; // le prélude : elle n'est pas là
    // devenu l'hôte, on reprend l'entité où elle en était (pas de nouvelle minute de calme, pas de seconde apparition)
    if (snap.m[10] !== undefined) M.dormantT = snap.m[10];
    if (snap.m[11]) this.glimpseAt = Infinity;
    M.inDuct = !!snap.m[12];
    M.landT = snap.m[13] || 0;
    if (snap.fp) (this.map.fuses || []).forEach((f, i) => {
      const q = snap.fp[i];
      if (!q) return;
      f.x = q[0];
      f.z = q[1];
      f.gx = cellOf(q[0]);
      f.gz = cellOf(q[1]);
    });
    this.delivered = snap.dl || 0;
    this.panel = snap.pn || 0;
    (snap.hd || []).forEach((by, i) => {
      const h = (this.map.hides || [])[i];
      if (h) h.by = by;
    });
    (snap.dk || []).forEach(([o, dir, broken, force], i) => {
      const d = (this.map.docks || [])[i];
      if (!d) return;
      d.o = o;
      d.dir = dir;
      d.broken = !!broken;
      d.force = force || 0;
    });
    (snap.al || []).forEach((v, i) => {
      const a = (this.map.alarms || [])[i];
      if (!a) return;
      a.used = v > 0;
      a.ringT = v > 0 ? v - 1 : 0;
    });
    if (this.map.ducts && typeof snap.vo === 'string') this.map.ducts.vents.forEach((v, i) => (v.open = snap.vo[i] === '1'));
    if (this.map.post && snap.pb !== undefined) this.map.post.by = snap.pb;
    const set = (list, k, b) => (list || []).forEach((o, i) => {
      o[k] = (b || '')[i] === '1';
    });
    set(this.allCassettes, 'collected', snap.k[0]);
    set(this.map.fuses, 'taken', snap.k[1]);
    // objets posés par des joueurs : on ajoute ceux qu'on n'a pas encore, étage par étage
    this.floors.forEach((f, fi) => {
      const list = (snap.ix || []).filter((o) => o[0] === fi);
      for (const [, kind, x, z] of list.slice(f.items.length - this.items0[fi])) f.items.push({ id: f.items.length, kind, x, z, gx: cellOf(x), gz: cellOf(z), taken: false });
    });
    if (Array.isArray(snap.im)) this.floors.forEach((f, fi) => {
      const want = new Map((snap.im[fi] || []).map((r) => [r[0], r]));
      (f.items || []).forEach((o, i) => {
        const r = want.get(i);
        if (r) placeItem(o, r[1], r[2], r[3]);
        else if (o.o && (o.kind !== o.o[0] || o.x !== o.o[1] || o.z !== o.o[2])) placeItem(o, o.o[0], o.o[1], o.o[2]);
      });
    });
    const takenBits = (snap.k[2] || '').split('|');
    this.floors.forEach((f, fi) => set(f.items, 'taken', takenBits[fi]));
    for (const f of this.floors) if (f.niche) f.niche.ladder = !!snap.nl;
    const lost = new Set((snap.ll || []).map(([fi, i]) => `${fi}:${i}`));
    this.floors.forEach((f, fi) => (f.items || []).forEach((o, i) => (o.lost = lost.has(`${fi}:${i}`))));
    (this.map.valves || []).forEach((v, i) => {
      const t = (snap.v || [])[i];
      if (t === undefined) return;
      v.closed = t < 0;
      v.turn = t < 0 ? 1 : t;
    });
    this.valves = (this.map.valves || []).filter((v) => v.closed).length;
    (snap.sp || []).forEach((p, i) => this.setSector(i, p));
    (this.map.breakers || []).forEach((b, i) => {
      const t = (snap.br || [])[i];
      if (t === undefined) return;
      b.done = t < 0;
      b.turn = t < 0 ? 1 : t;
    });
    if (snap.gt) applyGoatSnapshot(this, snap.gt);
    if (this.goats) senseGoats(this);
    else if (this.hasMonster) this.senseMonster();
  }

  // Fin d'équipe : le premier dans l'ascenseur lance le compte à rebours. L'entité est attirée vers la cabine, puis
  // vers les retardataires ; à zéro, les portes se ferment et ceux qui sont restés dehors sont perdus
  updateBoarding() {
    if (this.boardT <= 0) return;
    const was = this.boardT;
    this.boardT = Math.max(0, this.boardT - DT);
    const out = this.players.filter((p) => p.status === 'alive');
    if (!out.length) {
      this.boardT = 0;
      return;
    }
    if (was > 20 && this.boardT <= 20) {
      // elle sent ceux qui traînent
      const P = out[Math.floor(this.time * 7) % out.length];
      this.alertMonster(P.x, P.z, 80, P.floor);
      this.emit({ type: 'boardCount', t: 20 });
    }
    if (was > 10 && this.boardT <= 10) this.emit({ type: 'boardCount', t: 10 });
    if (this.boardT > 0) return;
    for (const P of out) {
      this.emit({ type: 'leftBehind', id: P.id, name: P.name });
      this.killPlayer(P);
    }
  }

  // L'ascenseur part quand plus personne n'est dehors (et qu'au moins un joueur est dedans). Aux Poolrooms, le premier
  // glissé dans un toboggan lance le compte à rebours des autres
  checkElevator() {
    if (this.departT > 0 || this.state !== 'playing') return;
    const alive = this.players.filter((p) => p.status === 'alive').length;
    const inside = this.players.filter((p) => p.status === 'elevator').length;
    if (alive > 0 && this.map.slides) {
      // celui qui attendait dans la cabine est parti : plus de compte à rebours (sinon ceux du dehors mourraient)
      if (inside === 0 && this.boardT > 0) {
        this.boardT = 0;
        this.emit({ type: 'boardCount', t: 0, cancel: true });
      }
      if (inside > 0 && this.boardT <= 0) {
        this.boardT = BOARD_T;
        this.emit({ type: 'boardCount', t: BOARD_T, start: true });
        // l'entité entend la cabine : elle arrive
        const E = this.fm(this.realFloor);
        const ex = E && E.exit ? E.exit : null;
        if (ex) this.alertMonster(ex.x, ex.z, 999, this.realFloor);
      }
      return;
    }
    if (alive > 0) return;
    this.boardT = 0;
    if (inside > 0) {
      this.departT = DEPART_T;
      this.emit({ type: 'depart', level: this.level });
    } else {
      this.state = 'dead';
      this.emit({ type: 'gameover', time: this.time });
    }
  }

  arrive() {
    // Poolrooms : le toboggan pris décide du niveau suivant (sans niveau d'arrivée : on sort des Backrooms)
    const sl = this.map.slides && this.slide >= 0 ? this.map.slides[this.slide] : null;
    if (sl && sl.to != null) {
      this.loadLevel(sl.to);
      this.emit({ type: 'level', level: this.level });
      return;
    }
    // les autres toboggans sortent des Backrooms ; les Tuyauteries sont le dernier niveau
    if (this.map.slides || this.level >= LAST_LEVEL) {
      this.state = 'won';
      this.emit({ type: 'win', time: this.time });
      return;
    }
    this.loadLevel(this.level + 1);
    this.emit({ type: 'level', level: this.level });
  }

  // Proximité de l'entité pour chaque joueur (son, image) et cible de la traque. À l'autre étage, on l'entend
  // étouffée à travers le plancher et elle ne voit personne.
  senseMonster() {
    const M = this.monster;
    let target = null;
    let bestScore = Infinity;
    for (const P of this.players) {
      const same = P.floor === M.floor;
      const dx = P.x - M.x;
      const dz = P.z - M.z;
      const dist = Math.hypot(dx, dz);
      P.mDist = same ? dist : dist + 40;
      // bourdonnement : de 0 à 35 m, il monte vite quand elle est à portée ; elle se tait en embuscade
      const ratio = 1 - Math.min(1, Math.max(0, (dist - 1.2) / 32));
      // Poolrooms : derrière une cloison, on l'entend étouffée
      const wall = same && dist > 3 && this.fm(P.floor).lightBlocked && this.fm(P.floor).lightBlocked(M.x, M.z, P.x, P.z) ? 0.45 : 1;
      P.danger = M.away || dist > 35 ? 0 : Math.pow(ratio, 1.6) * (M.silent && dist > 4 ? 0.35 : 1) * (same ? 1 : 0.25) * wall; // tout près, même tapie, on l'entend
      let diff = Math.atan2(M.x - P.x, M.z - P.z) - (P.yaw - Math.PI);
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      P.pan = Math.max(-0.9, Math.min(0.9, Math.sin(diff)));
      if (P.status !== 'alive') continue;
      P.seen = same && hasLineOfSight(this.fm(M.floor), M.x, M.z, P.x, P.z);
      const concealed = P.hidden >= 0 && M.sawHide !== P.hidden;
      // elle préfère celui qui s'est éloigné des autres, et celui qui fait du bruit
      let mate = Infinity;
      for (const Q of this.players) if (Q !== P && Q.status === 'alive' && Q.floor === P.floor) mate = Math.min(mate, Math.hypot(Q.x - P.x, Q.z - P.z));
      // plus il est loin des autres, plus elle le préfère (jusqu'à 22 m d'avance sur un joueur bien entouré)
      const alone = mate !== Infinity && mate > 12 ? Math.min(22, 6 + (mate - 12) * 0.6) : 0;
      const resting = this.calmAt(P);
      // (pendant sa charge, elle ne lâche pas celui sur qui elle fonce)
      const score = P.mDist - (P.seen && !concealed ? 12 : 0) - (P.id === M.target ? (M.rushT > 0 ? 60 : 6) : 0) - alone - Math.min(12, (P.noise || 0) * 12) + (concealed ? 30 : 0) + (resting ? 40 : 0);
      if (score < bestScore) {
        bestScore = score;
        target = P;
      }
    }
    const view = this.viewPlayer(this.spectate || 0);
    M.danger = view.danger;
    M.pan = view.pan;
    return target;
  }

  updateMonster() {
    const M = this.monster;
    const P0 = this.senseMonster();
    if (M.mode !== M.lastMode) {
      M.lastMode = M.mode;
      M.modeT = 0;
    } else M.modeT += DT;
    if (M.mode === 'chase') M.chasedAt = this.time;
    // elle tient quelqu'un : elle ne fait rien d'autre
    if (M.mode === 'grab') return this.updateGrab(M);
    // sonnée (on s'est dégagé, ou un coéquipier l'a aveuglée) : elle titube en arrière, puis s'enfuit dans le noir
    if (M.stunT > 0) {
      M.stunT -= DT;
      M.speed = 0;
      M.path = [];
      stagger(this, M);
      if (M.stunT <= 0) {
        M.stunT = 0;
        const spot = P0 ? this.darkSpot(this.fm(M.floor), P0, M, 18, 32, false) : null;
        M.mode = spot ? 'flee' : 'patrol';
        M.watch = spot;
        M.repathT = 0;
      }
      return;
    }
    const P = P0;
    if (!P) return;
    M.target = P.id;
    M.dormantT = Math.max(0, (M.dormantT || 0) - DT);
    // le prélude : elle n'est pas là (elle n'arrive que 20 s après la première cassette, et de loin)
    const prelude = this.prelude;
    if (prelude) M.dormantT = Math.max(M.dormantT, 20);
    // la phase finale du Level 0 : elle sait où l'on est et ne lâche plus (ni répit, ni abri, ni lumière qui protège)
    const hunt = this.hunt && this.level === 0;
    if (hunt) M.dormantT = 0;
    // au tout début de la partie, ou pendant le répit qui suit une poursuite, elle reste au loin et se tait
    const calm = !hunt && (M.dormantT > 0 || (entityRelaxed(this) && M.mode !== 'chase'));
    if (this.level === 0 && !hunt && this.firstGlimpse(M, P)) {
      M.away = prelude && !M.glimpse; // l'apparition finie, elle repart déjà loin : de nouveau absente
      if (M.away) for (const Q of this.players) Q.danger = 0;
      return;
    }
    // le prélude, hors de l'apparition : elle n'existe tout simplement pas (ni vue, ni son, ni bourdonnement)
    if (prelude) {
      if (!M.away) {
        // elle s'en va loin des joueurs, là où elle reviendra
        const far = this.warpSpot && this.warpSpot(P, 'far');
        if (far) {
          M.x = far.x;
          M.z = far.z;
          M.floor = far.floor;
          this.placed(M);
        }
      }
      M.away = true;
      M.mode = 'patrol';
      M.speed = 0;
      M.v = 0;
      M.trav = null;
      M.portal = null;
      M.dropY = 0;
      M.path = [];
      M.silent = true;
      M.faceT = 0;
      M.danger = 0;
      for (const Q of this.players) Q.danger = 0;
      return;
    }
    if (M.away) {
      // elle revient du prélude : jamais sous les yeux de quelqu'un, ni tout près
      const near = this.players.some((Q) => Q.status === 'alive' && (Q.floor || 0) === (M.floor || 0) && Math.hypot(Q.x - M.x, Q.z - M.z) < 25);
      if (near || this.inSomeView(M.floor || 0, M.x, M.z, 0.2)) {
        const far = this.warpSpot(P, 'far');
        if (!far) {
          for (const Q of this.players) Q.danger = 0;
          return;
        }
        M.x = far.x;
        M.z = far.z;
        M.floor = far.floor;
        M.path = [];
        M.repathT = 0;
      }
      M.y = feetOf(this, M);
    }
    M.away = false;
    // Level 1 : dans les gaines de ventilation (on l'entend cogner au-dessus), puis sa chute par une bouche
    if (M.duct) return this.ductStep(M, P);
    const map = this.fm(M.floor);
    const rage = this.rage; // 0 seul ou personne à l'abri, jusqu'à 1 quand il ne reste qu'un joueur dehors
    const dark = this.blackout > 0;
    const same = P.floor === M.floor;
    const dx = P.x - M.x;
    const dz = P.z - M.z;
    const dist = same ? Math.hypot(dx, dz) : Infinity;
    M.distToPlayer = dist;
    M.hasLineOfSight = P.seen;
    // Level 0 : qui l'a vue (dans son champ, rien entre eux, assez de lumière pour la distinguer), et quand
    if (this.level === 0) for (const Q of this.players) if (this.seesMonster(Q, M, dark)) Q.sawM = this.time;

    // Détection : vue directe (moins loin lampe éteinte ; dans le noir, une lampe allumée se voit de loin),
    // bruit de course, présence rapprochée. La colère allonge tout.
    const A = this.aggro;
    // Vue : seulement devant elle (une lampe allumée se remarque bien plus sur le côté) ; accroupi lampe éteinte, on
    // passe mieux inaperçu. Au début elle voit et entend moins loin ; chaque objectif l'aiguise
    const sight = ((dark ? (P.flashlight ? 28 : 7) : P.flashlight ? 24 : 15) * (0.8 + A * 0.3) + rage * 10) * (P.crouch && !P.flashlight ? 0.7 : 1) * (calm ? 0.5 : 1);
    const ang = Math.abs(this.angleTo(M, P.x, P.z));
    const inView = ang < VISION_CONE || (P.flashlight && ang < VISION_CONE * 1.7) || dist < 2.5;
    // Ouïe : le bruit du joueur (course, chute, ramassage, panneau…) porte moins à travers les murs
    const heardR = NOISE_RANGE * (P.noise || 0) * (M.hasLineOfSight ? 1 : 0.65) * (dark ? 1.15 : 1) * (0.85 + A * 0.3) * (calm ? 0.5 : 1) + (P.noise > 0.2 ? rage * 6 : 0);
    let canSee = M.hasLineOfSight && dist < sight && inView;
    let canHear = (P.noise || 0) > 0 && dist < heardR;
    // tout près, elle sent sa présence… si elle le voit ou l'entend respirer ; accroupi derrière un mur, on passe
    let isNearby = dist < 1.6 || (dist < 4 + rage * 2 + A * 2 && (M.hasLineOfSight || (P.noise || 0) > 0.1) && !(calm && dist > 2.5));
    // caché dans un casier qu'elle ne l'a pas vu prendre : invisible ; seule sa respiration le trahit, de tout près
    if (P.hidden >= 0 && M.sawHide !== P.hidden) {
      canSee = false;
      isNearby = false;
      canHear = (P.noise || 0) > 0 && dist < 3.2 + P.noise * 8;
      if (canHear) M.sawHide = P.hidden;
    }
    if (M.dormantT > 0 && !isNearby && !(canHear && P.running && dist < 7)) {
      canSee = false;
      canHear = false;
    }
    // Nez à nez : le joueur la regarde en face, de près, et la voit vraiment (sous un néon, dans sa lampe, ou à deux
    // pas). Elle ne reste pas plantée là : au bout d'une demi-seconde, elle hurle et fonce sur lui, même au repos
    // Level 0 : dans la lumière franche d'une zone claire, on est presque à l'abri (sauf pendant une coupure)
    const safe = this.level === 0 && !hunt && !dark && this.brightCell(this.fm(P.floor), P.x, P.z);
    // Plus loin (jusqu'à STARE_R), la fixer la provoque aussi : il faut la regarder bien en face un peu plus longtemps
    const near = dist < 7;
    // (on la voit : sous un néon, dans sa lampe, dans l'infrarouge du caméscope, ou à deux pas)
    const exposed = same && M.hasLineOfSight && !(P.hidden >= 0) && !P.desk && !this.calmAt(P) && dist < STARE_R && (!safe || dist < 4) && this.facing(P, M.x, M.z) < (near ? 0.4 : 0.3) &&
      ((P.flashlight && dist < 20) || (P.cam && (P.battery ?? 100) > 0 && dist < 14) || dist < 3.2 || (!dark && this.litCell(map, M.x, M.z)));
    if (exposed && M.mode !== 'chase' && M.mode !== 'flee' && M.mode !== 'ambush') M.faceT += DT;
    else M.faceT = Math.max(0, M.faceT - DT * 2);
    if (M.faceT > (near ? 0.5 : STARE_T)) {
      this.rushAt(M, P);
      canSee = true;
    }
    M.rushT = Math.max(0, M.rushT - DT);
    // tapie dans le noir, elle observe : elle ne charge que si on s'approche trop (ou, déjà énervée, si on la voit)
    const hiding = M.mode === 'stalk' || M.mode === 'watch' || M.mode === 'flee';
    if (hiding) {
      // la lampe braquée sur elle : au début elle s'enfuit dans le noir, plus tard elle charge
      const lit = P.flashlight && M.hasLineOfSight && dist < 22 && this.facing(P, M.x, M.z) < 0.3;
      // on s'approche trop près d'elle : elle charge
      isNearby = dist < 3.5 + A * 4 || (dist < NEAR_CHARGE + A * 2 && M.hasLineOfSight && !(P.hidden >= 0));
      canSee = (A >= 0.5 && canSee && dist < sight * 0.6) || (lit && A >= 0.4);
      canHear = A >= 0.6 && canHear;
      // un seul sursaut devant la lampe, tout au début et de loin : ensuite, la lumière ne la fait plus reculer (de près,
      // la fixer la fait charger)
      if (lit && A < 0.2 && M.flees < 1 && dist > STARE_R && M.mode !== 'flee' && !isNearby && !exposed) {
        const spot = this.darkSpot(map, P, M, 18, 30, false);
        if (spot) {
          M.flees++;
          M.mode = 'flee';
          M.watch = spot;
          M.repathT = 0;
          this.emit({ type: 'monsterFlee' });
        }
      }
    } else if (this.level < 2 && M.mode === 'patrol' && A < 0.5 && canSee && !isNearby && !(canHear && dist < 8)) {
      // encore calme, elle aperçoit quelqu'un : au lieu de charger, elle va se tapir dans le noir pour l'observer
      const spot = this.darkSpot(map, P, M, 8, 20, true);
      if (spot) {
        M.mode = 'stalk';
        M.watch = spot;
        M.silent = true;
        M.repathT = 0;
        canSee = false;
      }
    }

    // dans un recoin calme (tant qu'il tient) : elle ne le voit pas, ne l'entend pas, et ne franchit pas le seuil ; elle
    // ne reste pas non plus plantée devant : elle se fond dans le noir, derrière un angle, et on la perd
    if (this.calmAt(P)) {
      canSee = false;
      canHear = false;
      isNearby = false;
      if (M.mode === 'chase' || M.mode === 'search') {
        this.slipAway(M, P, true);
        this.emit({ type: 'lost', id: P.id });
      }
    }
    // à l'abri dans la lumière : elle ne s'y lance qu'à bout portant ; si elle le poursuivait, elle renonce au bord de
    // l'ombre et s'y fond, hors de sa vue (elle l'attendra ailleurs)
    if (safe) {
      canSee = canSee && dist < 3.5;
      canHear = canHear && dist < 2.5;
      isNearby = dist < 1.8;
      if ((M.mode === 'chase' || M.mode === 'search') && dist > 2.2 && !(M.rushT > 0)) {
        M.edgeT += DT;
        if (M.edgeT > 1.0 + rage * 1.5) {
          M.edgeT = 0;
          this.slipAway(M, P, true);
          this.emit({ type: 'lost', id: P.id });
        }
      } else M.edgeT = 0;
    } else M.edgeT = 0;

    // Jamais plantée sous les yeux de quelqu'un : hors poursuite, presque immobile dans le cadre d'un joueur, elle agit
    // au bout d'une seconde (d'une demi, postée au coin d'un couloir). Fixée par quelqu'un à découvert (sa proie ou un
    // autre : c'est alors lui qu'elle charge), découverte de près ou à son poste : elle hurle et charge. Vue de côté,
    // de loin, ou par quelqu'un à l'abri (lumière franche, recoin calme), ou pendant son répit : elle se glisse
    // derrière un angle, hors de vue. Arrêtée pour écouter, en ronde ou en fouille : elle repart
    if (M.mode !== 'chase') {
      const V = (M.v || 0) < 0.45 && !M.trav ? this.viewerOf(M, SEEN_R) : null;
      M.plantT = V ? (M.plantT || 0) + DT : Math.max(0, (M.plantT || 0) - DT * 2);
      if (V && M.plantT > (M.lurk ? 0.5 : PLANTED_T)) {
        M.plantT = 0;
        const Q = V.Q;
        const shelter = this.shelteredAt(Q);
        if ((M.mode === 'patrol' || M.mode === 'search') && M.arrived) {
          M.repathT = 0;
          if (M.mode === 'patrol') M.targetWander = null;
        } else if (!shelter && !calm && V.d < STARE_R + 5 && (V.f < 0.45 || M.lurk || M.mode === 'ambush' || V.d < NEAR_CHARGE + 2)) {
          this.rushAt(M, Q);
          if (Q === P) canSee = true;
          else M.target = Q.id; // elle change de proie : celui qui l'a fixée (voir senseMonster)
        } else this.slipAway(M, Q, shelter || calm);
      }
    } else M.plantT = 0;

    if (hunt && !(P.hidden >= 0)) {
      // la traque : elle le sent, où qu'il soit
      canSee = true;
      if (M.mode !== 'chase') {
        M.watch = null;
        M.ambush = null;
        M.pace = null;
        M.lurk = false;
        if (M.mode !== 'patrol' && M.mode !== 'search') M.mode = 'patrol';
      }
    }

    // Level 1 : une alarme incendie sonne : elle y court, quoi qu'elle fasse (sauf si elle tient sa proie de près, sous
    // ses yeux), et frappe la cloche jusqu'à la faire taire. Le vacarme couvre le reste : elle n'entend plus personne
    const bell = this.level === 1 ? this.bellFor(M) : null;
    if (bell && !(canSee && dist < 7) && !(dist < 1.6)) {
      canSee = false;
      canHear = false;
      isNearby = false;
      this.lureTo(M, bell);
    } else M.lure = -1;

    if (M.mode === 'ambush') {
      // en embuscade, elle attend que sa proie passe tout près
      M.waitT -= DT;
      const atSpot = M.ambush && Math.hypot(M.x - M.ambush.x, M.z - M.ambush.z) < 0.6;
      if ((dist < 6.5 || (M.hasLineOfSight && dist < 9)) && this.mayChase(M, P, hunt)) {
        this.emit({ type: 'spotted', ambush: true });
        M.mode = 'chase';
        M.silent = false;
        M.burstT = 2;
        M.unseenT = 0;
        M.lastSeenX = P.x;
        M.lastSeenZ = P.z;
        M.lastSeenF = P.floor || 0;
      } else if (M.waitT <= 0) {
        // personne n'est passé : elle part voir là où se trouvait sa proie
        M.mode = 'search';
        M.silent = false;
        M.ambush = null;
        M.lastSeenX = P.x;
        M.lastSeenZ = P.z;
        M.lastSeenF = P.floor || 0;
        M.repathT = 0;
        M.ambushT = (rand(14, 22) * (1 - rage * 0.5)) / (this.level === 0 ? L0_AGGRO : 1);
      } else if (atSpot) {
        M.path = [];
      }
    } else if ((canSee || canHear || isNearby) && (M.mode === 'chase' || this.mayChase(M, P, hunt))) {
      if (M.mode !== 'chase') {
        this.chases++;
        this.emit({ type: 'spotted', heard: !canSee && canHear, id: P.id });
      }
      M.mode = 'chase';
      M.watch = null;
      M.silent = false;
      if (M.unseenT > 0) M.repathT = 0; // elle le revoit : droit sur lui
      M.unseenT = 0;
      M.lastSeenX = P.x;
      M.lastSeenZ = P.z;
      M.lastSeenF = P.floor || 0;
      M.lastYaw = P.yaw;
    } else if (M.mode === 'chase') {
      // hors de vue : elle ne sait plus où il est. Elle court jusqu'à l'endroit où elle l'a vu pour la dernière fois,
      // puis fouille les environs ; au bout de quelques secondes sans le voir, le joueur l'a semée
      if (M.unseenT === 0) M.repathT = 0;
      if (!same && M.unseenT < 1.5) {
        M.lastSeenX = P.x;
        M.lastSeenZ = P.z;
        M.lastSeenF = P.floor || 0;
      }
      M.unseenT += DT;
      const atLast = Math.hypot(M.x - M.lastSeenX, M.z - M.lastSeenZ) < 1.5;
      if (this.level === HOTEL_LEVEL && P.hidden >= 0 && M.unseenT > 0.5) {
        // Level 5 : sa proie s'est cachée loin de ses yeux : elle a perdu sa trace, elle quitte la pièce
        this.leaveRoom(M, P);
        this.emit({ type: 'lost', id: P.id });
      } else if (atLast || M.unseenT > LOSE_TRACK_T + rage * 4 + A * 3 || !same) {
        M.mode = 'search';
        M.repathT = 0;
        // elle retient l'endroit où on l'a semée : elle y reviendra se poster
        if (same) {
          M.escapes.push({ x: M.lastSeenX, z: M.lastSeenZ });
          if (M.escapes.length > 4) M.escapes.shift();
        }
        // Level 5 : sa proie s'est cachée sous un lit ou dans une armoire : elle quitte la pièce et reprend sa ronde
        if (this.level === HOTEL_LEVEL && P.hidden >= 0) this.leaveRoom(M, P);
        this.emit({ type: 'lost', id: P.id });
      }
    }

    // Level 0 : elle triche. Quand aucun joueur ne l'a dans son champ de vision, elle se téléporte : juste derrière
    // un angle devant sa proie (on tombe nez à nez avec elle), dans son dos (elle approche sans un bruit), ou très
    // loin (on se retourne, elle a disparu)
    if (this.level === 0) this.monsterWarp(M, P, calm, A, rage);

    // Vitesse selon le mode, la colère et le noir
    const k = (1 + rage * 0.35 + (dark ? 0.1 : 0)) * (0.9 + A * 0.22);
    M.burstT = Math.max(0, M.burstT - DT);
    if (M.mode === 'search' && M.probe) M.searchT = Math.max(0, (M.searchT || 0) - DT);
    // en chasse, jamais moins de CHASE_MIN fois la marche : à pied, on ne la sème pas ; il faut courir
    if (M.mode === 'chase') {
      M.speed = Math.max(WALK_SPEED * CHASE_MIN * (1 + A * 0.15), this.monsterChaseSpeed * k * (M.rushT > 0 ? 1.25 : M.burstT > 0 ? 1.15 : 1) * (this.chases <= (this.skill < 0.3 ? 2 : 1) && !(M.rushT > 0) ? 0.86 : 1));
      // la traque : presque aussi vite qu'on court (on ne la distance qu'en courant tout droit, sans se tromper de chemin)
      if (hunt) M.speed = Math.min(SPRINT_SPEED * 0.94, Math.max(M.speed, SPRINT_SPEED * 0.86));
    } else if (M.mode === 'search') M.speed = Math.max(MONSTER_PATROL_SPEED * 1.3, WALK_SPEED * 1.15) * k; // elle cherche plus vite qu'on ne marche
    else if (M.mode === 'ambush') M.speed = MONSTER_PATROL_SPEED * 1.5;
    else if (M.mode === 'flee') M.speed = this.monsterChaseSpeed * 1.05;
    else if (M.mode === 'stalk') M.speed = MONSTER_PATROL_SPEED * 1.15;
    else if (M.mode === 'watch') M.speed = 0;
    else M.speed = MONSTER_PATROL_SPEED * (1 + rage * 0.5) * (calm ? 0.8 : 1);
    if (M.windT > 0) {
      M.windT = Math.max(0, M.windT - DT);
      M.speed = 0;
      faceTo(M, P.x, P.z, 10);
    }
    if (calm && M.mode === 'patrol') M.silent = true;
    else if (M.mode === 'patrol' && !calm) M.silent = false;
    // Poolrooms : l'eau la freine aussi (un peu moins que les joueurs)
    if (map.depthAt) M.speed *= Math.max(0.55, 1 - map.depthAt(M.x, M.z) * 0.4);

    // En ronde, elle va souvent se tapir dans un coin sombre pour observer les joueurs de loin (de moins en moins à
    // mesure qu'elle s'énerve)
    if (M.mode === 'patrol' && same && this.level < 2) { // l'affût dans le noir : Level 0 et Level 1 seulement
      M.stalkT -= DT;
      if (M.stalkT <= 0) {
        M.stalkT = rand(6, 12);
        if (!calm && dist < 40 && Math.random() < 0.6 - A * 0.45) {
          const spot = this.darkSpot(map, P, M, 8, 20, true);
          if (spot) {
            M.mode = 'stalk';
            M.watch = spot;
            M.silent = true;
            M.repathT = 0;
          }
        }
      }
    }
    if (M.mode === 'stalk' || M.mode === 'flee') {
      if (!same) M.mode = 'patrol';
      else if (!M.watch || Math.hypot(M.x - M.watch.x, M.z - M.watch.z) < 0.6 || (M.lastMode === M.mode && ((M.arrived && !M.trav && M.modeT > 0.4) || M.modeT > 25))) {
        // arrivée dans le noir (ou au plus près, si l'endroit était hors d'atteinte) : elle se fige et regarde
        // (après une fuite, elle se calme un peu plus longtemps)
        M.waitT = M.mode === 'flee' ? rand(4, 8) : rand(6, 12) * (1 - A * 0.5);
        M.mode = 'watch';
        M.path = [];
        M.pace = null;
      }
    } else if (M.mode === 'watch') {
      M.waitT -= DT;
      const looked = this.inSomeView(M.floor || 0, M.x, M.z, 0.1);
      M.unseenWT = looked ? 0 : (M.unseenWT || 0) + DT;
      if (M.pace && M.arrived) {
        // au bout de son pas : un temps d'arrêt, les yeux sur sa proie
        M.pace = null;
        M.paceT = rand(0.3, 0.8);
      }
      if (!M.lurk && same && M.modeT > 3.5 && M.unseenWT > 1.2 && dist > NEAR_CHARGE + 3 && dist < 26 && !(P.hidden >= 0) && !((M.hideUntil || 0) > this.time)) {
        // elle a observé un moment ; personne ne la regarde : elle se rapproche sans un bruit, d'une ombre à l'autre
        // (on se retourne : elle est plus près qu'avant, immobile)
        if (!M.pace) {
          M.paceT = (M.paceT || 0) - DT;
          if (M.paceT <= 0) {
            M.pace = this.darkSpot(map, P, M, Math.max(NEAR_CHARGE + 2.5, dist - 4.5), Math.max(NEAR_CHARGE + 3, dist - 1.5), true);
            M.paceT = 0.8;
            M.repathT = 0;
          }
        }
      } else if (M.pace) {
        // on la regarde : elle se fige (une seconde au plus : ensuite elle charge, ou se glisse hors de vue)
        M.pace = null;
        M.repathT = 0;
      }
      if (!M.pace) faceTo(M, P.x, P.z, 3.2);
      if (M.waitT <= 0 || !same) {
        M.mode = 'patrol';
        M.silent = false;
        M.watch = null;
        M.pace = null;
        M.stalkT = rand(3, 8);
        // Level 0 : on se retourne… elle n'est plus là
        if (this.level === 0) M.vanish = true;
        M.lurk = false;
      }
    }

    // Level 1 : en patrouille, elle contourne par les rangées d'étagères pour attendre le joueur plus loin ; Level 2 :
    // elle l'attend juste après un croisement
    if (M.mode === 'patrol' && (map.isAmbush || map.isShelfSide || M.escapes.length) && same && !calm) {
      M.ambushT -= DT;
      if (M.ambushT <= 0 && dist < 45) {
        const spot = (M.escapes.length && Math.random() < 0.5 ? this.escapeAmbush(P) : null) || (map.isAmbush || map.isShelfSide ? this.findAmbush(P) : null);
        M.ambushT = this.level === 0 ? 4 / L0_AGGRO : 4;
        if (spot) {
          M.mode = 'ambush';
          M.silent = true;
          M.ambush = spot;
          M.waitT = 14;
          M.repathT = 0;
        }
      }
    }

    // Level 1 : loin de tout le monde, hors de vue, elle se glisse dans une gaine pour ressortir près de sa proie
    if (this.level === 1 && map.ducts && map.ducts.vents.length) this.ductPlan(M, P, dist, calm || !!bell);

    // Recalcul de trajectoire. Sa proie est à l'autre étage (ou dans une cage d'escalier) : elle prend l'escalier ; en
    // poursuite, pour descendre, elle peut aussi sauter dans un trou
    M.repathT -= DT;
    if (M.repathT <= 0) {
      M.repathT = M.mode === 'chase' ? 0.35 : 1.2;
      // en chasse, elle ne va droit sur le joueur que si elle le voit ou l'entend ; sinon, là où il était
      let tx = M.mode === 'chase' && M.unseenT > 0 ? M.lastSeenX : P.x;
      let tz = M.mode === 'chase' && M.unseenT > 0 ? M.lastSeenZ : P.z;
      let tf = M.floor || 0;
      if (M.mode === 'chase' && M.unseenT > 0) tf = M.lastSeenF ?? tf;
      const caged = this.stairs.length && cageAt(this.stairs, P.x, P.z);
      if ((M.mode === 'chase' || M.mode === 'search') && this.stairs.length && (!same || (caged && (M.mode === 'search' || M.unseenT === 0)))) {
        tx = P.x;
        tz = P.z;
        tf = !same ? P.floor || 0 : (M.floor || 0) === 1 ? 0 : 1;
      } else if (M.mode === 'patrol') {
        if (!M.targetWander || Math.hypot(M.x - M.targetWander.x, M.z - M.targetWander.z) < 1.5 || M.arrived || (M.bumps || 0) > 2) {
          M.bumps = 0;
          // l'entité rôde : souvent non loin d'un joueur de son étage (de plus en plus quand elle s'énerve) ;
          // de temps en temps, elle change d'étage
          if (!same && this.stairs.length && Math.random() < 0.35 + rage * 0.4) {
            M.mode = 'search';
            M.lastSeenX = tx = P.x;
            M.lastSeenZ = tz = P.z;
            M.lastSeenF = tf = P.floor || 0;
            M.targetWander = null;
          } else {
            // Level 5 : surtout le couloir, parfois une chambre
            const near = calm
              ? map.walkable.filter((c) => Math.hypot((c.x + 0.5) * CELL_SIZE - P.x, (c.z + 0.5) * CELL_SIZE - P.z) > 30)
              : this.level === HOTEL_LEVEL ? (Math.random() < 0.7 ? map.corridorCells : [])
              : same && Math.random() < 0.5 + rage * 0.4 ? map.walkable.filter((c) => Math.hypot((c.x + 0.5) * CELL_SIZE - P.x, (c.z + 0.5) * CELL_SIZE - P.z) < 28 - rage * 12) : [];
            // Level 0 : elle rôde dans l'ombre, pas dans la lumière franche des zones claires
            const shade = this.level === 0 && !dark ? near.filter((c) => !this.brightCell(map, (c.x + 0.5) * CELL_SIZE, (c.z + 0.5) * CELL_SIZE)) : near;
            const pool = shade.length ? shade : near.length ? near : map.walkable;
            const c = pool[Math.floor(Math.random() * pool.length)];
            M.targetWander = { x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE };
          }
        }
        if (M.targetWander && M.mode === 'patrol') {
          tx = M.targetWander.x;
          tz = M.targetWander.z;
        }
      } else if (M.mode === 'search') {
        // d'abord là où elle a vu (ou entendu) sa proie pour la dernière fois, puis elle fouille autour quelques secondes,
        // en commençant dans la direction où elle allait, avant de reprendre sa ronde
        if (M.probeFrom && (M.probeFrom.x !== M.lastSeenX || M.probeFrom.z !== M.lastSeenZ)) M.probe = null;
        const goal = M.probe || { x: M.lastSeenX, z: M.lastSeenZ };
        tf = M.lastSeenF ?? tf;
        // Level 5 : arrivée là où elle l'avait entendu, et il s'est caché : rien à voir, elle s'en va
        if (this.level === HOTEL_LEVEL && P.hidden >= 0 && Math.hypot(M.x - goal.x, M.z - goal.z) < 2) this.leaveRoom(M, P);
        else if (Math.hypot(M.x - goal.x, M.z - goal.z) < 2 || (M.arrived && M.lastMode === M.mode && M.modeT > 0.5 && tf === (M.floor || 0))) {
          if (!M.probe) {
            M.searchT = 7 + rage * 5;
            M.probeFrom = { x: M.lastSeenX, z: M.lastSeenZ };
          }
          M.probe = this.searchProbe(map, M, !M.probe);
        }
        if (M.searchT <= 0 && M.probe) {
          M.mode = 'patrol';
          M.probe = null;
          M.probeFrom = null;
        }
        tx = M.probe ? M.probe.x : M.lastSeenX;
        tz = M.probe ? M.probe.z : M.lastSeenZ;
      } else if (M.mode === 'ambush') {
        tx = M.ambush.x;
        tz = M.ambush.z;
      } else if ((M.mode === 'stalk' || M.mode === 'flee') && M.watch) {
        tx = M.watch.x;
        tz = M.watch.z;
      } else if (M.mode === 'watch') {
        tx = M.pace ? M.pace.x : M.x;
        tz = M.pace ? M.pace.z : M.z;
      }
      planTo(this, M, tx, tz, tf, { allowDrop: M.mode === 'chase' || M.mode === 'search' });
    }

    // La marche (gait.js) : elle se tourne avant d'avancer, accélère et freine, ne traverse rien, prend les marches.
    // En chasse, quand elle voit sa proie et que la voie est libre : droit sur elle. Level 2 : elle n'entre pas dans
    // un jet de vapeur qui crache, elle attend devant
    const chasing = M.mode === 'chase';
    const rushing = M.rushT > 0;
    const speed = M.mode === 'watch' ? (M.pace ? 0.7 : 0) : M.speed;
    const gx0 = M.x;
    const gz0 = M.z;
    gaitMove(this, M, {
      speed,
      turn: rushing ? 12 : chasing ? 7.5 : M.mode === 'flee' ? 6.5 : M.mode === 'search' ? 5 : M.mode === 'watch' ? 3.2 : 3.6,
      accel: rushing ? 16 : chasing ? 8 : M.mode === 'flee' ? 7 : M.mode === 'search' ? 5 : 3,
      decel: chasing ? 10 : 7,
      direct: chasing && same && M.unseenT === 0 ? { x: P.x, z: P.z } : null,
      stopR: chasing ? 0 : 0.15,
      avoid: this.level === PIPES_LEVEL ? (x, z) => this.steamAt(x, z) : null,
    });
    // Level 1 : un rideau baissé l'arrête (ses chemins passent par les quais) : elle s'acharne dessus jusqu'à l'arracher
    if (map.docks && map.docks.length) this.dockPush(M, gx0, gz0);
    // arrivée au bout de son chemin : elle repart plus vite (en ronde, après s'être arrêtée pour écouter un instant :
    // jamais un arrêt d'une image entre deux pas)
    if (M.arrived && !M.trav && (M.mode === 'search' || M.mode === 'patrol')) {
      if (!M.wasArrived) M.repathT = M.mode === 'search' ? 0.25 : rand(0.7, 1.6);
      M.wasArrived = true;
    } else M.wasArrived = false;
    // en poursuite, les néons qu'elle frôle grésillent sur son passage (jamais ceux des zones très éclairées)
    if (chasing && M.v > 2 && this.level === 0 && this.director) this.wakeNeons(M);
    // un étage de passé (l'escalier, un trou) : elle cherche sa proie autour de là où elle l'imagine
    if (M.crossed) {
      M.crossed = false;
      if ((P.floor || 0) === (M.floor || 0) && (M.mode === 'search' || M.mode === 'chase')) {
        if (M.mode === 'search') {
          M.lastSeenX = P.x + rand(-5, 5);
          M.lastSeenZ = P.z + rand(-5, 5);
          M.lastSeenF = M.floor || 0;
          M.probe = null;
          M.probeFrom = null;
        }
        M.repathT = 0;
      }
    }

    // L'entité attrape le joueur : la première fois, elle l'agrippe (on peut se dégager) ; la seconde est mortelle.
    // Au Level 5, elle tue d'un coup.
    const reach = P.hidden >= 0 ? (map.spots ? 2.0 : 1.4) : 1.15; // Level 5 : sous un lit, elle t'attrape par le pied du lit
    const leaping = M.trav && M.trav.kind === 'drop' && M.trav.phase !== 'peer';
    const level = Math.abs(feetOf(this, M) - feetY(this.stairs, P.x, P.z, P.floor || 0)) < 1.3;
    if (same && dist < reach && level && !leaping && (P.hidden < 0 || M.sawHide === P.hidden) && !this.calmAt(P) && !this.dockBetween(M.floor || 0, M.x, M.z, P.x, P.z)) {
      if (P.hidden >= 0) this.leaveHide(P);
      if (P.desk) this.leaveDesk(P, true);
      if (this.level === HOTEL_LEVEL || P.grabs >= 1 || this.difficulty === 'hard' && this.rage >= 1) {
        this.killPlayer(P, { x: M.x, z: M.z });
        this.afterCatch(M);
        return;
      }
      P.grabs++;
      P.grabT = GRAB_T * (this.difficulty === 'hard' ? 0.8 : 1);
      P.struggle = 0;
      P.running = false;
      P.crouch = false;
      P.jy = P.jvy = 0;
      M.mode = 'grab';
      M.grabbing = P.id;
      M.path = [];
      M.v = 0;
      this.emit({ type: 'grab', id: P.id, name: P.name, x: M.x, z: M.z, floor: M.floor });
    }
  }

  // La prise : on se débat (n'importe quelle touche), ou un coéquipier l'aveugle avec sa lampe ; sinon c'est la fin
  updateGrab(M) {
    const G = this.players.find((Q) => Q.id === M.grabbing);
    if (!G || G.status !== 'alive') {
      this.afterCatch(M);
      return;
    }
    M.speed = 0;
    M.v = 0;
    M.silent = false;
    // elle le tient face à elle (elle finit de se tourner vers lui, très vite)
    const a = Math.atan2(G.x - M.x, G.z - M.z);
    faceTo(M, G.x, G.z, 14);
    G.yaw = a + Math.PI;
    G.pitch = 0.05;
    G.grabT -= DT;
    const need = GRAB_STRUGGLES + (this.difficulty === 'hard' ? 3 : 0);
    const blinded = this.players.some((Q) => Q !== G && Q.status === 'alive' && Q.flashlight && Q.floor === M.floor && Math.hypot(Q.x - M.x, Q.z - M.z) < 12 && this.facing(Q, M.x, M.z) < 0.35 && hasLineOfSight(this.fm(M.floor), Q.x, Q.z, M.x, M.z));
    if (G.struggle >= need || blinded) {
      G.grabT = 0;
      G.struggle = 0;
      G.lockT = 0.3;
      M.mode = 'stun';
      M.stunT = MONSTER_STUN_T;
      M.grabbing = null;
      M.unseenT = 0;
      // repoussée, elle titube en arrière (un mètre environ, en une demi-seconde)
      shove(M, -Math.sin(a), -Math.cos(a), 4.2);
      this.emit({ type: 'release', id: G.id, escaped: true, blinded, x: M.x, z: M.z, floor: M.floor });
      return;
    }
    if (G.grabT <= 0) {
      G.grabT = 0;
      this.killPlayer(G, { x: M.x, z: M.z });
      this.afterCatch(M);
    }
  }

  // après une victime : elle repart en ronde, loin de la cabine
  afterCatch(M) {
    M.mode = 'patrol';
    M.grabbing = null;
    M.target = null;
    M.path = [];
    M.ambushT = 6;
    M.sawHide = -1;
  }

  // angle entre le regard de l'entité et un point (0 : droit devant elle)
  angleTo(M, x, z) {
    let d = Math.atan2(x - M.x, z - M.z) - M.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  // une embuscade là où on l'a déjà semée, si le joueur s'en approche (hors de sa vue)
  escapeAmbush(P) {
    const map = this.fm(P.floor);
    let best = null;
    let bd = Infinity;
    for (const e of this.monster.escapes) {
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      if (d < 8 || d > 30 || d >= bd) continue;
      if (hasLineOfSight(map, P.x, P.z, e.x, e.z)) continue;
      const gx = cellOf(e.x);
      const gz = cellOf(e.z);
      if (map.isWall(gx, gz)) continue;
      best = { x: (gx + 0.5) * CELL_SIZE, z: (gz + 0.5) * CELL_SIZE, gx, gz };
      bd = d;
    }
    return best;
  }

  // angle entre là où regarde le joueur et un point (0 : droit devant)
  facing(P, x, z) {
    let d = Math.atan2(-(x - P.x), -(z - P.z)) - P.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  }

  // la case la plus sombre possible (aucun néon allumé tout autour, sinon le moins possible), entre rMin et rMax du
  // joueur ; seen : d'où on le voit. map.darkCells : 0 pour le noir complet, plus pour chaque néon allumé à côté
  // Level 0 : une case dans la lumière franche d'une zone claire (sous ou à côté d'un néon d'une zone où tous marchent)
  brightCell(map, x, z) {
    if (!map.brightCells) {
      map.brightCells = new Uint8Array(map.W * map.H);
      map.brightThin = null;
      for (const l of map.lights || []) {
        if (!l.bright || l.state !== 'on') continue;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const gx = l.gx + dx;
            const gz = l.gz + dz;
            if (gx < 0 || gz < 0 || gx >= map.W || gz >= map.H) continue;
            const k = gz * map.W + gx;
            map.brightCells[k] = 1;
            // la case d'une cloison fine : seul le côté tourné vers le néon est dans sa lumière
            const p = map.lightBlocked && map.pillarAt && map.pillarAt(gx, gz);
            if (p && p.rects) {
              if (!map.brightThin) map.brightThin = new Map();
              if (!map.brightThin.has(k)) map.brightThin.set(k, []);
              map.brightThin.get(k).push(l);
            }
          }
        }
      }
    }
    const gx = cellOf(x);
    const gz = cellOf(z);
    if (gx < 0 || gz < 0 || gx >= map.W || gz >= map.H || map.brightCells[gz * map.W + gx] !== 1) return false;
    const by = map.brightThin && map.brightThin.get(gz * map.W + gx);
    return !by || by.some((l) => !map.lightBlocked(l.x, l.z, x, z));
  }

  // ce point est-il dans le champ de vision d'un joueur ? (dans le cadre de sa caméra, rien entre eux ; tout près,
  // on la sentirait même dans son dos)
  inSomeView(floor, x, z, margin = 0) {
    const map = this.fm(floor);
    for (const Q of this.players) {
      if (Q.status !== 'alive') continue;
      // le gardien assis au poste : il voit ce que montre la caméra choisie, pas ce qu'il a devant lui
      if (Q.desk) {
        if (this.onScreen(Q, floor, x, z, margin)) return true;
        continue;
      }
      const d = Math.hypot(Q.x - x, Q.z - z);
      // dans une cage d'escalier, on voit par ses ouvertures les deux étages tout autour
      if ((Q.floor || 0) !== floor && !(d < 16 && this.stairs.length && cageAt(this.stairs, Q.x, Q.z))) continue;
      if (d < 3.5) return true;
      // le cadre le plus large qu'un joueur puisse régler (100° en hauteur, en 16:9), plus la largeur de son corps
      if (d > 60 || this.facing(Q, x, z) > 1.25 + margin + Math.atan2(0.5, d)) continue;
      // son centre ou l'une de ses épaules (un bras qui dépasse d'un angle, ça se voit)
      const nx = (-(z - Q.z) / d) * 0.45;
      const nz = ((x - Q.x) / d) * 0.45;
      if (hasLineOfSight(map, Q.x, Q.z, x, z) || hasLineOfSight(map, Q.x, Q.z, x + nx, z + nz) || hasLineOfSight(map, Q.x, Q.z, x - nx, z - nz)) return true;
    }
    return false;
  }

  // le joueur (hors casier) qui l'a dans le cadre de sa caméra, son centre ou une épaule sans rien entre eux, à moins
  // de r m ; le plus proche : { Q, d, f } (f : l'angle entre son regard et elle), ou null
  viewerOf(M, r) {
    const floor = M.floor || 0;
    const map = this.fm(floor);
    let best = null;
    for (const Q of this.players) {
      if (Q.status !== 'alive' || Q.hidden >= 0 || Q.desk || (Q.floor || 0) !== floor) continue;
      const d = Math.hypot(Q.x - M.x, Q.z - M.z);
      if (d > r || (best && d >= best.d)) continue;
      const f = this.facing(Q, M.x, M.z);
      if (f > 1.25 + Math.atan2(0.5, Math.max(0.5, d))) continue;
      const nx = (-(M.z - Q.z) / Math.max(0.01, d)) * 0.45;
      const nz = ((M.x - Q.x) / Math.max(0.01, d)) * 0.45;
      if (!hasLineOfSight(map, Q.x, Q.z, M.x, M.z) && !hasLineOfSight(map, Q.x, Q.z, M.x + nx, M.z + nz) && !hasLineOfSight(map, Q.x, Q.z, M.x - nx, M.z - nz)) continue;
      best = { Q, d, f };
    }
    return best;
  }

  // à l'abri d'elle : dans un casier, dans un recoin calme qui tient encore, ou (Level 0, hors coupure) dans la lumière
  // franche d'une zone claire
  shelteredAt(Q) {
    if (Q.hidden >= 0 || this.calmAt(Q)) return true;
    return this.level === 0 && !(this.blackout > 0) && this.brightCell(this.fm(Q.floor || 0), Q.x, Q.z);
  }

  // Q la voit-il vraiment ? Dans le cadre de sa caméra (un peu en deçà des bords), rien entre eux, et assez de lumière
  // pour la distinguer : sous un néon, dans sa lampe, dans le caméscope, ou tout près
  seesMonster(Q, M, dark) {
    if (Q.status !== 'alive' || Q.hidden >= 0 || Q.desk || (Q.floor || 0) !== (M.floor || 0)) return false;
    const d = Math.hypot(Q.x - M.x, Q.z - M.z);
    if (d > SEEN_R) return false;
    const f = this.facing(Q, M.x, M.z);
    if (f > 1.0 + Math.atan2(0.5, Math.max(0.5, d))) return false;
    const map = this.fm(M.floor || 0);
    if (!hasLineOfSight(map, Q.x, Q.z, M.x, M.z)) return false;
    return d < 4 || (!dark && this.litCell(map, M.x, M.z)) || (Q.flashlight && d < 20 && f < 0.6) || (Q.cam && (Q.battery ?? 100) > 0 && d < 14);
  }

  // Level 0 : peut-elle se lancer sur P ? Seulement s'il l'a vue (pas par derrière), sauf pendant la traque finale, juste
  // après l'avoir perdu de vue, et (à partir de la 3e cassette) de temps en temps. Sinon, elle se montre d'abord
  mayChase(M, P, hunt) {
    if (this.level !== 0 || hunt) return true;
    if (this.time - (P.sawM ?? -1e9) < SAW_T || this.time - (M.chasedAt ?? -1e9) < 8) return true;
    if (this.cassettes >= FRONT_TAPES) {
      if (this.time > (M.backRollT || 0)) {
        M.backRollT = this.time + 20;
        M.backOk = Math.random() < BACK_SHARE;
      }
      if (M.backOk) return true;
    }
    this.showFirst(M, P);
    return false;
  }

  // elle voudrait se lancer, mais sa proie ne l'a pas vue : hors de la vue de tous, elle passe devant elle, postée au
  // coin d'un couloir, face à l'endroit d'où elle va surgir (ou, sans endroit où aller, elle attend là, tournée vers
  // elle, sans un bruit). Dès qu'on la regarde, elle crie puis charge
  showFirst(M, P) {
    // quelqu'un l'a dans son champ (à découvert) : elle ne se fige pas, elle crie et se lance sur lui
    const V = this.viewerOf(M, SEEN_R);
    if (V && !this.shelteredAt(V.Q)) {
      this.rushAt(M, V.Q);
      if (V.Q !== P) M.target = V.Q.id;
      return;
    }
    if (M.mode === 'watch' && M.lurk) return;
    if ((M.showT || 0) > this.time) return;
    M.showT = this.time + 1.5;
    M.pending = null;
    M.ambush = null;
    M.pace = null;
    M.watch = null;
    M.path = [];
    M.silent = true;
    M.lurk = true;
    M.mode = 'watch';
    M.waitT = rand(10, 16);
    if (!this.inSomeView(M.floor || 0, M.x, M.z, 0.15)) {
      const spot = this.warpSpot(P, 'corner');
      if (spot && !this.inSomeView(spot.floor, spot.x, spot.z, 0.1)) {
        M.x = spot.x;
        M.z = spot.z;
        M.floor = spot.floor;
        this.placed(M);
        M.targetWander = null;
        M.unseenAllT = 0;
        this.emit({ type: 'warp', kind: 'corner' });
      }
    }
    M.yaw = Math.atan2(P.x - M.x, P.z - M.z);
  }

  // découverte, fixée : elle hurle et fonce sur sa proie (même au repos)
  rushAt(M, P) {
    M.faceT = 0;
    M.plantT = 0;
    M.dormantT = 0;
    M.mode = 'chase';
    M.watch = null;
    M.pace = null;
    M.lurk = false;
    M.ambush = null;
    M.silent = false;
    // le cri d'abord (elle reste sur place, tournée vers lui, tout le corps qui tremble), la course ensuite
    M.windT = RUSH_WIND;
    M.rushT = 2.4 + RUSH_WIND;
    M.burstT = 2.4 + RUSH_WIND;
    M.unseenT = 0;
    M.repathT = 0;
    M.lastSeenX = P.x;
    M.lastSeenZ = P.z;
    M.lastSeenF = P.floor || 0;
    this.chases++;
    this.emit({ type: 'rush', id: P.id, x: M.x, z: M.z, floor: M.floor });
  }

  // vue sans pouvoir (ou devoir) charger : elle se glisse derrière un angle, à quelques pas, hors de la vue de tous ;
  // giveUp (sa proie est à l'abri, ou c'est son répit) : elle renonce, et disparaîtra dès que personne ne la regarde
  slipAway(M, Q, giveUp) {
    const map = this.fm(M.floor || 0);
    const spot = this.hideSpot(map, M, Q);
    M.plantT = 0;
    M.pace = null;
    M.lurk = false;
    M.ambush = null;
    M.ambushT = Math.max(M.ambushT || 0, 6);
    M.silent = true;
    M.repathT = 0;
    M.vanish = !!giveUp && this.level === 0;
    M.hideUntil = this.time + rand(8, 14); // repérée : elle ne revient pas tout de suite se montrer
    if (spot) {
      M.mode = 'stalk';
      M.watch = spot;
      M.stalkT = rand(6, 12);
    } else {
      // nulle part où se cacher tout près : elle s'éloigne de lui, dans l'ombre
      M.mode = 'patrol';
      M.watch = null;
      M.targetWander = this.awaySpot(map, M, Q);
      M.stalkT = rand(6, 12);
    }
  }

  // une case à quelques pas d'elle (en marche), derrière un angle pour Q (rien en ligne droite entre eux) et hors de la
  // vue de tous, dans l'ombre, pas collée à lui ; la plus proche d'elle
  hideSpot(map, M, Q) {
    const W = map.W;
    const H = map.H;
    const gx = cellOf(M.x);
    const gz = cellOf(M.z);
    if (gx < 0 || gz < 0 || gx >= W || gz >= H) return null;
    const pd = bfs(map.grid, W, H, gx, gz);
    const dark = this.blackout > 0;
    const stairCell = this.stairs && this.stairs.length ? new Set(this.stairs.flatMap((st) => st.cells.map((k) => k.gz * W + k.gx))) : null;
    const floor = M.floor || 0;
    let best = null;
    let bestS = Infinity;
    const R = 9;
    for (let z = Math.max(1, gz - R); z <= Math.min(H - 2, gz + R); z++) {
      for (let x = Math.max(1, gx - R); x <= Math.min(W - 2, gx + R); x++) {
        const steps = pd[z * W + x];
        if (steps < 1 || steps > 12 || map.isWall(x, z)) continue;
        if ((map.pillarAt && map.pillarAt(x, z)) || (stairCell && stairCell.has(z * W + x)) || (map.pitAt && map.pitAt(x, z) >= 0)) continue;
        const cx = (x + 0.5) * CELL_SIZE;
        const cz = (z + 0.5) * CELL_SIZE;
        const dq = Math.hypot(cx - Q.x, cz - Q.z);
        if (dq < 5) continue;
        const s = steps + (dq < 8 ? 4 : 0) + Math.random() * 0.5;
        if (s >= bestS) continue;
        if (!dark && this.level === 0 && this.brightCell(map, cx, cz)) continue;
        if ((map.calm || []).some((n) => n.cells.some((c) => c.x === x && c.z === z))) continue;
        if (hasLineOfSight(map, Q.x, Q.z, cx, cz) || this.inSomeView(floor, cx, cz, 0.2)) continue;
        bestS = s;
        best = { x: cx, z: cz };
      }
    }
    return best;
  }

  // une case loin de Q (14 à 40 m), dans l'ombre, plutôt vers elle
  awaySpot(map, M, Q) {
    const dark = this.blackout > 0;
    let best = null;
    let bs = -Infinity;
    for (let i = 0; i < 60 && map.walkable && map.walkable.length; i++) {
      const c = map.walkable[Math.floor(Math.random() * map.walkable.length)];
      const x = (c.x + 0.5) * CELL_SIZE;
      const z = (c.z + 0.5) * CELL_SIZE;
      const dq = Math.hypot(x - Q.x, z - Q.z);
      if (dq < 14 || dq > 40) continue;
      if (!dark && this.level === 0 && this.brightCell(map, x, z)) continue;
      const s = dq - Math.hypot(x - M.x, z - M.z) * 0.5;
      if (s > bs) {
        bs = s;
        best = { x, z };
      }
    }
    return best;
  }

  // en poursuite, les néons au-dessus d'elle grésillent un instant à son passage (jamais ceux des zones très
  // éclairées : la lumière franche reste un abri sûr)
  wakeNeons(M) {
    if ((M.wakeT || 0) > this.time) return;
    M.wakeT = this.time + 0.12;
    const map = this.fm(M.floor || 0);
    const D = this.director;
    for (const l of map.lights || []) {
      if (l.state !== 'on' || l.bright || Math.abs(l.x - M.x) > 1.6 || Math.abs(l.z - M.z) > 1.6) continue;
      if (D.drops.some((d) => d.l === l)) continue;
      D.drops.push({ l, t: rand(0.25, 0.6), back: 'on', map });
      l.state = 'flicker';
      l.flicker = true;
      lightsChanged(map);
      this.emit({ type: 'neonWake', x: l.x, z: l.z, floor: M.floor || 0 });
    }
  }

  // les néons à moins de r m de (x, z) s'éteignent t secondes (puis reviennent tels qu'ils étaient), sauf ceux des
  // zones claires
  lightsDown(map, x, z, r, t) {
    const D = this.director;
    if (!D) return 0;
    let n = 0;
    for (const l of map.lights || []) {
      // jamais ceux des zones claires : la lumière franche reste un abri sûr
      if (l.state === 'off' || l.bright || Math.hypot(l.x - x, l.z - z) >= r) continue;
      const busy = D && D.drops.find((d) => d.l === l);
      if (busy) busy.t = Math.max(busy.t, t);
      else if (D) D.drops.push({ l, t, back: l.state, map });
      l.state = 'off';
      l.flicker = false;
      n++;
    }
    if (n) lightsChanged(map);
    return n;
  }

  // elle vient d'être déplacée d'un coup (hors de toute vue) : elle repart de là, immobile
  placed(M) {
    M.v = 0;
    M.trav = null;
    M.portal = null;
    M.push = null;
    M.dropY = 0;
    M.pace = null;
    M.path = [];
    M.pathIndex = 0;
    M.goal = null;
    M.arrived = false;
    M.repathT = 0;
    M.y = feetOf(this, M);
  }

  // Où réapparaître sans être vue. kind : 'corner' (devant sa proie, à quelques pas de marche, caché juste derrière un
  // angle qu'elle va passer), 'behind' (dans son dos, dans l'ombre), 'far' (loin de tout le monde), 'hunt' (la traque
  // finale : à une vingtaine de mètres de marche, hors de vue)
  warpSpot(P, kind) {
    const floor = P.floor || 0;
    const map = this.fm(floor);
    const W = map.W;
    const pd = bfs(map.grid, W, map.H, cellOf(P.x), cellOf(P.z));
    const stairCell = new Set((this.stairs || []).flatMap((st) => st.cells.map((k) => k.gz * W + k.gx)));
    const dark = this.blackout > 0;
    let best = null;
    let bestS = Infinity;
    for (const c of map.walkable || []) {
      const i = c.z * W + c.x;
      const d = pd[i];
      if (d < 0 || stairCell.has(i)) continue;
      if (kind === 'corner' && (d < 3 || d > 8)) continue;
      if (kind === 'behind' && (d < 2 || d > 6)) continue;
      if (kind === 'hunt' && (d < 6 || d > 18)) continue;
      const x = (c.x + 0.5) * CELL_SIZE;
      const z = (c.z + 0.5) * CELL_SIZE;
      const e = Math.hypot(x - P.x, z - P.z);
      if (kind === 'far' ? this.players.some((Q) => Q.status === 'alive' && (Q.floor || 0) === floor && Math.hypot(Q.x - x, Q.z - z) < 30) : e < NEAR_CHARGE + 0.5) continue; // postée hors de portée de charge : c'est au joueur de s'approcher
      if (map.pitAt && map.pitAt(c.x, c.z) >= 0) continue;
      if (!dark && kind !== 'hunt' && this.brightCell(map, x, z)) continue; // l'alarme : elle surgit même sous un néon
      if ((map.props || []).some((pr) => Math.hypot(pr.x - x, pr.z - z) < pr.r + 0.6)) continue;
      if ((map.calm || []).some((n) => n.cells.some((k) => k.x === c.x && k.z === c.z))) continue;
      const ang = this.facing(P, x, z);
      if (kind === 'corner' && ang > 1.1) continue;
      if (kind === 'behind' && ang < 2.0) continue;
      if (this.inSomeView(floor, x, z, 0.2)) continue;
      if (!roamable(this, floor, x, z)) continue; // pas dans un recoin d'où elle ne pourrait plus sortir
      let s = Math.random() * 2;
      if (kind === 'corner') {
        // juste derrière un angle : une case voisine est déjà en vue du joueur
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
          const nx = c.x + dx;
          const nz = c.z + dz;
          return pd[nz * W + nx] >= 0 && hasLineOfSight(map, P.x, P.z, (nx + 0.5) * CELL_SIZE, (nz + 0.5) * CELL_SIZE);
        });
        if (!edge) continue;
        s += ang * 3 + Math.abs(d - 5);
      } else if (kind === 'behind') s += Math.abs(d - 3) + (Math.PI - ang) * 2;
      else if (kind === 'hunt') s += Math.abs(d - 9);
      else s += Math.random() * 4;
      if (s < bestS) {
        bestS = s;
        best = { x, z, floor };
      }
    }
    return best;
  }

  // dans un recoin calme, et il tient encore (on s'y repose 45 s ; ensuite sa lampe grésille et plus rien n'y protège)
  calmAt(P) {
    if (this.level !== 0 || !P || P.status !== 'alive' || this.open) return false; // la phase finale : plus d'abri
    const n = this.nookOf(P);
    return !!n && (n.wear || 0) < 1;
  }

  nookOf(P) {
    const f = this.fm(P.floor || 0);
    if (!f.calm || !f.calm.length) return null;
    const gx = cellOf(P.x);
    const gz = cellOf(P.z);
    return f.calm.find((n) => n.cells.some((c) => c.x === gx && c.z === gz)) || null;
  }

  // l'usure des recoins : elle monte quand quelqu'un s'y abrite, redescend lentement quand il est vide
  updateCalm() {
    for (const f of this.floors) {
      for (const n of f.calm || []) {
        const inside = this.players.some((P) => P.status === 'alive' && this.nookOf(P) === n);
        const was = n.wear || 0;
        n.wear = inside ? Math.min(1.2, was + DT / CALM_HOLD) : Math.max(0, was - DT / (CALM_HOLD * 2.5));
        if (was < 1 && n.wear >= 1) this.emit({ type: 'calmWorn', x: n.x, z: n.z, floor: this.floors.indexOf(f) });
      }
    }
  }

  // un spectateur hante : 'flicker' (le néon au-dessus de celui qu'il regarde grésille : attention) ou 'knock'
  // (des coups un peu plus loin, qui attirent l'entité : pour l'éloigner… ou la lui amener)
  haunt(P, kind, viewId) {
    if ((P.hauntAt || 0) > this.time || this.state !== 'playing') return;
    const alive = this.players.filter((Q) => Q.status === 'alive');
    const V = alive.find((Q) => Q.id === viewId) || alive[0];
    if (!V) return;
    const map = this.fm(V.floor || 0);
    P.hauntAt = this.time + HAUNT_COOLDOWN;
    if (kind === 'flicker') {
      const near = (map.lights || []).filter((l) => l.state === 'on').sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0];
      if (!near || Math.hypot(near.x - V.x, near.z - V.z) > 14) {
        P.hauntAt = this.time + 1;
        return;
      }
      if (this.director) this.director.drops.push({ l: near, t: 1.4, back: near.state, map });
      near.state = 'flicker';
      near.flicker = true;
      lightsChanged(map);
      this.emit({ type: 'haunt', kind, x: near.x, z: near.z, floor: V.floor || 0, by: P.id, name: P.name, id: V.id });
      return;
    }
    // des coups à 8-16 m de lui, dans la direction où il regarde (le spectateur choisit en tournant avec lui)
    const fx = -Math.sin(V.yaw);
    const fz = -Math.cos(V.yaw);
    let spot = null;
    for (let d = 16; d >= 8 && !spot; d -= 2) {
      const x = V.x + fx * d;
      const z = V.z + fz * d;
      if (!map.isWall(cellOf(x), cellOf(z))) spot = { x: (cellOf(x) + 0.5) * CELL_SIZE, z: (cellOf(z) + 0.5) * CELL_SIZE };
    }
    if (!spot) spot = { x: V.x + fx * 6, z: V.z + fz * 6 };
    if (this.hasMonster && !this.goats) this.alertMonster(spot.x, spot.z, 34, V.floor || 0);
    this.emit({ type: 'haunt', kind: 'knock', x: spot.x, z: spot.z, floor: V.floor || 0, by: P.id, name: P.name, id: V.id });
  }

  // La toute première rencontre (Level 0, une fois) : au bout d'un couloir, droit devant, elle est là, immobile. Dès
  // qu'on la regarde vraiment (ou qu'on approche), le néon au-dessus d'elle claque… et il n'y a plus personne. On
  // apprend sans un mot qu'elle existe, que le noir est à elle, et qu'il ne faut pas la fixer
  firstGlimpse(M, P) {
    if (!M.glimpse) {
      if (this.time < this.glimpseAt || !(M.dormantT > 0) || M.mode !== 'patrol' || P.status !== 'alive' || P.hidden >= 0 || this.blackout > 0) return false;
      this.glimpseAt = this.time + 1;
      if (++this.glimpseTries > 40) {
        this.glimpseAt = Infinity;
        return false;
      }
      // là où elle est, quelqu'un la voit : pas maintenant (elle ne disparaît jamais sous nos yeux)
      if (!M.away && this.inSomeView(M.floor || 0, M.x, M.z, 0.15)) return false;
      const map = this.fm(P.floor || 0);
      const fx = -Math.sin(P.yaw);
      const fz = -Math.cos(P.yaw);
      let spot = null;
      // d'abord sous un néon (pas une zone très éclairée) : on doit la distinguer ; sinon, où l'on peut
      for (let pass = 0; pass < 2 && !spot; pass++)
      for (let d = 20; d >= 12; d -= 1.5) {
        if (spot) break;
        for (const side of [0, 0.12, -0.12]) {
          const ax = fx * Math.cos(side) - fz * Math.sin(side);
          const az = fz * Math.cos(side) + fx * Math.sin(side);
          const gx = cellOf(P.x + ax * d);
          const gz = cellOf(P.z + az * d);
          if (map.isWall(gx, gz) || (map.pitAt && map.pitAt(gx, gz) >= 0)) continue;
          const x = (gx + 0.5) * CELL_SIZE;
          const z = (gz + 0.5) * CELL_SIZE;
          if (this.brightCell(map, x, z) || !hasLineOfSight(map, P.x, P.z, x, z)) continue;
          // pas devant la lumière d'une zone claire (ses néons ne s'éteignent jamais) : sa silhouette s'y découperait
          if ((map.lights || []).some((l) => {
            if (!l.bright || l.state !== 'on') return false;
            const t = Math.max(0, Math.min(4.5, (l.x - x) * ax + (l.z - z) * az));
            return Math.hypot(l.x - (x + ax * t), l.z - (z + az * t)) < 7;
          })) continue;
          if (pass === 0 && !this.litCell(map, x, z)) continue;
          // un autre joueur ne doit pas tomber dessus de près
          if (this.players.some((Q) => Q !== P && Q.status === 'alive' && Math.hypot(Q.x - x, Q.z - z) < 10)) continue;
          spot = { x, z };
          break;
        }
      }
      if (!spot) return false;
      this.glimpseAt = Infinity;
      // elle arrive dans le noir : les néons autour de l'endroit claquent un instant (et les lampes qui le
      // montreraient vacillent) ; quand la lumière revient, elle est là. Jamais elle ne surgit sous nos yeux
      const DARK = 0.5;
      this.lightsDown(map, spot.x, spot.z, GLIMPSE_DARK_R, DARK);
      this.emit({ type: 'lampCut', t: DARK + 0.1, x: spot.x, z: spot.z, floor: P.floor || 0, r: 30 });
      M.x = spot.x;
      M.z = spot.z;
      M.floor = P.floor || 0;
      this.placed(M);
      M.mode = 'watch';
      M.watch = null;
      M.waitT = 30;
      M.silent = true;
      M.yaw = Math.atan2(P.x - M.x, P.z - M.z);
      M.glimpse = { t: 0, looked: 0, id: P.id, darkT: DARK };
      this.emit({ type: 'glimpse', phase: 'show', x: M.x, z: M.z, floor: M.floor, id: P.id });
    }
    const G = M.glimpse;
    const V = this.players.find((Q) => Q.id === G.id && Q.status === 'alive') || P;
    G.t += DT;
    G.darkT = Math.max(0, (G.darkT || 0) - DT);
    M.speed = 0;
    M.v = 0;
    M.path = [];
    M.silent = true;
    faceTo(M, V.x, V.z, 4);
    // on ne compte les regards (le sien ou celui d'un autre) qu'une fois la lumière revenue : en face, elle part au bout
    // de 0,8 s ; vue de côté (dans le cadre), un peu plus tard. Jamais elle ne reste plantée sous nos yeux
    let d = Infinity;
    let look = 0;
    for (const Q of this.players) {
      if (Q.status !== 'alive' || (Q.floor || 0) !== (M.floor || 0)) continue;
      const dq = Math.hypot(Q.x - M.x, Q.z - M.z);
      d = Math.min(d, dq);
      if (G.darkT > 0 || Q.hidden >= 0 || !hasLineOfSight(this.fm(M.floor || 0), Q.x, Q.z, M.x, M.z)) continue;
      const f = this.facing(Q, M.x, M.z);
      look = Math.max(look, f < 0.3 ? 1 : f < 1.25 + Math.atan2(0.5, Math.max(0.5, dq)) ? 0.85 : 0);
    }
    G.looked += DT * look;
    const unseen = !this.inSomeView(M.floor || 0, M.x, M.z, 0.15);
    // regardée assez longtemps, ou trop approchée : le néon claque (et les lampes vacillent) ; dans ce noir complet,
    // elle n'est plus là. Ignorée, elle s'en va quand personne ne regarde
    if (G.looked > 0.8 || d < 9 || (G.t > 10 && unseen) || G.t > 25) {
      const map = this.fm(M.floor || 0);
      this.lightsDown(map, M.x, M.z, GLIMPSE_DARK_R, 0.7);
      this.emit({ type: 'lampCut', t: 0.8, x: M.x, z: M.z, floor: M.floor || 0, r: 30 });
      this.emit({ type: 'glimpse', phase: 'gone', x: M.x, z: M.z, floor: M.floor || 0, id: V.id, seen: G.looked > 0.8 });
      const far = this.warpSpot(V, 'far');
      if (far) {
        M.x = far.x;
        M.z = far.z;
        M.floor = far.floor;
        this.placed(M);
      }
      M.glimpse = null;
      M.mode = 'patrol';
      M.targetWander = null;
      M.repathT = 0;
      M.unseenAllT = 0;
      M.warpT = Math.max(M.warpT, 30);
    }
    return true;
  }

  // la traque annoncée : le dernier néon vient de mourir. Elle est lâchée là où le premier s'est éteint (le plus loin),
  // hors de vue, et vient droit sur celui qu'on a plongé dans le noir
  huntFrom(S) {
    const M = this.monster;
    const P = this.players.find((Q) => Q.id === S.id && Q.status === 'alive');
    if (!P || !this.hasMonster || this.goats || M.mode === 'chase' || M.mode === 'grab' || M.glimpse) return;
    const floor = S.floor || 0;
    const map = this.fm(floor);
    let spot = null;
    const W = map.W;
    const stairCell = new Set((this.stairs || []).flatMap((st) => st.cells.map((k) => k.gz * W + k.gx)));
    for (const l of S.list) {
      const gx = cellOf(l.x);
      const gz = cellOf(l.z);
      // jamais au-dessus d'un trou, dans le plâtre d'un pilier ou d'une cloison, ni dans la cage d'escalier
      if (map.isWall(gx, gz) || (map.pitAt && map.pitAt(gx, gz) >= 0) || (map.pillarAt && map.pillarAt(gx, gz)) || stairCell.has(gz * W + gx)) continue;
      const x = (gx + 0.5) * CELL_SIZE;
      const z = (gz + 0.5) * CELL_SIZE;
      if (Math.hypot(x - P.x, z - P.z) < 10 || this.inSomeView(floor, x, z, 0.1)) continue;
      spot = { x, z, floor };
      break;
    }
    if (!spot) spot = this.warpSpot(P, 'corner') || this.warpSpot(P, 'behind');
    if (!spot) return;
    M.x = spot.x;
    M.z = spot.z;
    M.floor = spot.floor;
    this.placed(M);
    M.pending = null;
    M.mode = 'search';
    M.silent = false;
    M.probe = null;
    M.probeFrom = null;
    M.lastSeenX = P.x;
    M.lastSeenZ = P.z;
    M.lastSeenF = P.floor || 0;
    M.yaw = Math.atan2(P.x - M.x, P.z - M.z);
    M.unseenAllT = 0;
    M.warpT = Math.max(M.warpT, 20);
    this.emit({ type: 'hunt', x: M.x, z: M.z, floor: M.floor, id: P.id });
  }

  // la téléportation elle-même : elle n'arrive ni ne disparaît jamais sous les yeux d'un joueur
  monsterWarp(M, P, calm, A, rage) {
    const unseen = !this.inSomeView(M.floor || 0, M.x, M.z, 0.15);
    M.unseenAllT = unseen ? M.unseenAllT + DT : 0;
    M.warpT -= DT;
    const place = (spot) => {
      M.x = spot.x;
      M.z = spot.z;
      M.floor = spot.floor;
      this.placed(M);
      M.targetWander = null;
      M.unseenAllT = 0;
    };
    // une apparition annoncée : le signe a été donné (un craquement, un souffle), elle arrive… si personne ne regarde
    // encore l'endroit et si elle n'a pas trouvé mieux à faire entre-temps
    if (M.pending) {
      const W = M.pending;
      W.t -= DT;
      if ((M.mode !== 'patrol' && M.mode !== 'search') || P.status !== 'alive' || P.hidden >= 0) M.pending = null;
      else if (W.t <= 0) {
        M.pending = null;
        if (!unseen || this.inSomeView(W.spot.floor, W.spot.x, W.spot.z, 0.1)) {
          M.warpT = rand(3, 6); // on regardait par là : elle réessaiera un peu plus tard
          return;
        }
        place(W.spot);
        M.yaw = Math.atan2(P.x - M.x, P.z - M.z);
        if (W.kind === 'corner') {
          // postée, immobile et muette, face à l'endroit d'où il va surgir
          M.mode = 'watch';
          M.lurk = true;
          M.waitT = rand(10, 16);
          M.watch = null;
          M.silent = true;
        } else {
          // elle s'approche par derrière, sans un bruit
          M.mode = 'search';
          M.silent = true;
          M.probe = null;
          M.probeFrom = null;
          M.lastSeenX = P.x;
          M.lastSeenZ = P.z;
          M.lastSeenF = P.floor || 0;
        }
        this.emit({ type: 'warp', kind: W.kind });
      }
      return;
    }
    if (!unseen || M.unseenAllT < 1.2 || P.status !== 'alive') return;
    // elle a fini d'observer : dès qu'on ne la regarde plus, elle n'est plus là
    if (M.vanish) {
      M.vanish = false;
      if (M.mode === 'patrol' || M.mode === 'stalk') {
        const spot = this.warpSpot(P, 'far');
        if (spot) {
          place(spot);
          M.mode = 'patrol';
          this.emit({ type: 'warp', kind: 'far' });
        }
      }
      return;
    }
    if (M.warpT > 0 || calm || (M.mode !== 'patrol' && M.mode !== 'search') || P.hidden >= 0 || this.calmAt(P)) return;
    // plus on joue bien (difficulté adaptative), plus elle triche souvent
    M.warpT = (rand(20, 38) * (1 - A * 0.35) * (1 - rage * 0.3) * (1.25 - this.skill * 0.5)) / L0_AGGRO;
    // (avant la 3e cassette, jamais dans le dos : elle doit être vue avant de se lancer)
    const kind = this.cassettes >= FRONT_TAPES && Math.random() < 0.35 ? 'behind' : 'corner';
    let k2 = kind;
    let spot = this.warpSpot(P, kind);
    if (!spot && kind === 'behind') {
      spot = this.warpSpot(P, 'corner');
      k2 = 'corner';
    }
    if (!spot) return;
    // le signe, une seconde et demie avant : de là où elle va surgir, un craquement ou un souffle (jamais rien sans
    // rien : la triche reste juste, on la sent venir sans savoir exactement où)
    M.pending = { spot, kind: k2, t: rand(1.3, 1.9) };
    this.emit({ type: 'tell', kind: k2, x: spot.x, z: spot.z, floor: spot.floor, id: P.id });
  }

  // une case éclairée par un néon allumé (le sien ou un voisin direct)
  litCell(map, x, z) {
    this.darkCellsOf(map);
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    return gx >= 0 && gz >= 0 && gx < map.W && gz < map.H && map.darkCells[gz * map.W + gx] >= 3;
  }

  darkCellsOf(map) {
    if (!map.darkCells) {
      map.darkCells = new Uint8Array(map.W * map.H);
      for (const l of map.lights || []) {
        if (l.state !== 'on') continue;
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const x = l.gx + dx;
            const z = l.gz + dz;
            if (x < 0 || z < 0 || x >= map.W || z >= map.H) continue;
            const k = z * map.W + x;
            map.darkCells[k] = Math.min(255, map.darkCells[k] + (Math.max(Math.abs(dx), Math.abs(dz)) <= 1 ? 3 : 1));
          }
        }
      }
    }
    return map.darkCells;
  }

  darkSpot(map, P, M, rMin, rMax, seen) {
    this.darkCellsOf(map);
    const R = Math.ceil(rMax / CELL_SIZE);
    const cx = Math.floor(P.x / CELL_SIZE);
    const cz = Math.floor(P.z / CELL_SIZE);
    // en marche (cases) depuis elle et depuis le joueur : pour y aller, passerait-elle sous son nez ?
    const W = map.W;
    const inGrid = (x, z) => x >= 0 && z >= 0 && x < W && z < map.H;
    const mx = cellOf(M.x);
    const mz = cellOf(M.z);
    const md = (M.floor || 0) === (P.floor || 0) && inGrid(mx, mz) && inGrid(cx, cz) ? bfs(map.grid, W, map.H, mx, mz) : null;
    const pd = md ? bfs(map.grid, W, map.H, cx, cz) : null;
    // (le joueur peut se tenir dans une case de cloison, bloquante pour le parcours : on passe par ses voisines)
    let mP = md ? md[cz * W + cx] : -1;
    if (md && mP < 0) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inGrid(cx + dx, cz + dz) && md[(cz + dz) * W + cx + dx] >= 0) mP = mP < 0 ? md[(cz + dz) * W + cx + dx] + 1 : Math.min(mP, md[(cz + dz) * W + cx + dx] + 1);
    let best = null;
    let bestS = Infinity;
    for (let gz = cz - R; gz <= cz + R; gz++) {
      for (let gx = cx - R; gx <= cx + R; gx++) {
        // (le centre d'une case de pilier ou de cloison fine est dans le plâtre)
        if (map.isWall(gx, gz) || (map.pitAt && map.pitAt(gx, gz) >= 0) || (map.pillarAt && map.pillarAt(gx, gz))) continue;
        const x = (gx + 0.5) * CELL_SIZE;
        const z = (gz + 0.5) * CELL_SIZE;
        const d = Math.hypot(x - P.x, z - P.z);
        if (d < rMin || d > rMax) continue;
        const dark = map.darkCells[gz * map.W + gx];
        if (seen && !hasLineOfSight(map, x, z, P.x, P.z)) continue;
        // le plus sombre, puis le plus près d'elle, et plutôt hors du regard du joueur (vue, elle ne s'y attarderait pas)
        const f = this.facing(P, x, z);
        let sc = dark * 40 + Math.hypot(x - M.x, z - M.z) + (f < 0.4 ? 15 : 0) + (f < 1.3 ? 8 : 0);
        // elle n'y va pas en passant sous son nez : si l'un de ses plus courts chemins frôle le joueur (à deux cases ou
        // moins), passer par lui ne rallonge presque rien (md[P] + pd[S] - md[S] <= 4 cases)
        if (md && mP >= 0) {
          const k = gz * W + gx;
          if (md[k] >= 0 && pd[k] >= 0 && mP + pd[k] - md[k] <= 4) sc += 200;
        }
        if (sc < bestS) {
          bestS = sc;
          best = { x, z };
        }
      }
    }
    return best;
  }

  // Fouille : une case libre près du dernier endroit où elle a vu sa proie (la première dans la direction où elle filait)
  searchProbe(map, M, first) {
    const ox = M.lastSeenX + (first && M.lastYaw !== undefined ? -Math.sin(M.lastYaw) * 6 : 0);
    const oz = M.lastSeenZ + (first && M.lastYaw !== undefined ? -Math.cos(M.lastYaw) * 6 : 0);
    const R = first ? 4 : 9;
    const near = map.walkable.filter((c) => {
      const d = Math.hypot((c.x + 0.5) * CELL_SIZE - ox, (c.z + 0.5) * CELL_SIZE - oz);
      return d < R && Math.hypot((c.x + 0.5) * CELL_SIZE - M.x, (c.z + 0.5) * CELL_SIZE - M.z) > 2.5;
    });
    if (!near.length) return { x: M.lastSeenX, z: M.lastSeenZ };
    const c = near[Math.floor(Math.random() * near.length)];
    return { x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE };
  }

  // Une case au bout ou le long d'une rangée d'étagères, sur la route probable du joueur et hors de sa vue
  findAmbush(P) {
    const map = this.fm(P.floor);
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    const px = P.x + fx * 10;
    const pz = P.z + fz * 10;
    let best = null;
    let bestD = Infinity;
    for (const c of map.walkable) {
      const x = (c.x + 0.5) * CELL_SIZE;
      const z = (c.z + 0.5) * CELL_SIZE;
      const dp = Math.hypot(x - px, z - pz);
      if (dp > 8 || dp >= bestD) continue;
      if (Math.hypot(x - P.x, z - P.z) < 7) continue;
      if (!(map.isAmbush ? map.isAmbush(c.x, c.z) : map.isShelfSide(c.x, c.z))) continue;
      if (hasLineOfSight(map, P.x, P.z, x, z)) continue;
      best = { x, z, gx: c.x, gz: c.z };
      bestD = dp;
    }
    return best;
  }
}
