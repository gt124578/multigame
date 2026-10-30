// odyssee/js/world/tiles.js — codes de terrain partagés par la carte, le rendu et les déplacements
export const T = {
  GRASS: 0, PATH: 1, TALL: 2, TREE: 3, WATER: 4, SAND: 5, FLOWER: 6, FENCE: 7, ROCK: 8, LEDGE: 9,
  BUILD: 10, DOOR: 11, PAVE: 12, BRIDGE: 13, SIGN: 14, CAVE: 15, CAVEWALL: 16, FLOOR: 17, WALL: 18, BLOCK: 19,
  MAT: 20, STAIRS: 21, ASH: 22, PINE: 23, BUSH: 24, CAVEDOOR: 25, SNOW: 26, DARKTALL: 27, LEDGE_E: 28, LEDGE_W: 29,
  CUT: 30,   // petit arbre qu'on tranche avec Coupe
  SMASH: 31, // rocher fissuré qu'on brise avec Éclate-Roc
};
const WALK = new Set([T.GRASS, T.PATH, T.TALL, T.SAND, T.FLOWER, T.DOOR, T.PAVE, T.BRIDGE, T.CAVE, T.FLOOR, T.MAT, T.STAIRS, T.ASH, T.CAVEDOOR, T.SNOW, T.DARKTALL]);
export const walkable = (t) => WALK.has(t);
// obstacles qu'une capacité de terrain fait disparaître, eau qu'on traverse avec Surf
export const FIELD_TILE = { [T.CUT]: 'coupe', [T.SMASH]: 'eclate' };
export const surfable = (t) => t === T.WATER;
export const isGrassEnc = (t) => t === T.TALL || t === T.DARKTALL;
export const isLedge = (t) => t === T.LEDGE || t === T.LEDGE_E || t === T.LEDGE_W;
export const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
export const OPP = { down: 'up', up: 'down', left: 'right', right: 'left' };
