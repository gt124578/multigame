// Cartes en cases : sol, relief, objets, bâtiments, téléporteurs, personnages. Aucun DOM : testable sous Node.

export const GR = {
  GRASS: 0, TALL: 1, PATH: 2, SAND: 3, WATER: 4, FLOWER: 5, PAVE: 6, SNOW: 7, SNOWTALL: 8, CAVE: 9, BRIDGE: 10,
  WOOD: 11, TILEF: 12, VOID: 13, ASH: 14, DARKGRASS: 15, CARPET: 16, GYM: 17, ROCKY: 18, DOCK: 19, ICEFLOOR: 20, SNOWPATH: 21,
};
export const OB = {
  NONE: 0, TREE: 1, PINE: 2, PALM: 3, ROCK: 4, BUSH: 5, SIGN: 6, FENCE: 7, LAMP: 8, POT: 9, STATUE: 10, SNOWPINE: 11,
  BOULDER: 12, CRYSTAL: 13, DEADTREE: 14, MAILBOX: 15, BLOCK: 16, // BLOCK : bloquant invisible (meubles, murs)
  BARREL: 17, CRATE: 18, BENCH: 19, STALAG: 20, WALLN: 21,
};
const SOLID_OBJ = new Set([OB.TREE, OB.PINE, OB.PALM, OB.ROCK, OB.BUSH, OB.SIGN, OB.FENCE, OB.LAMP, OB.POT, OB.STATUE, OB.SNOWPINE, OB.BOULDER, OB.CRYSTAL, OB.DEADTREE, OB.MAILBOX, OB.BLOCK, OB.BARREL, OB.CRATE, OB.BENCH, OB.STALAG, OB.WALLN]);
export const ENCOUNTER_GROUND = new Set([GR.TALL, GR.SNOWTALL]);

export class GameMap {
  constructor(id, w, h, o = {}) {
    this.id = id; this.w = w; this.h = h;
    this.name = o.name || id; this.outdoor = o.outdoor ?? false; this.music = o.music || 'town';
    this.theme = o.theme || 'house'; this.dark = o.dark || 0;
    this.ground = new Uint8Array(w * h).fill(o.fill ?? GR.GRASS);
    this.elev = new Uint8Array(w * h);
    this.obj = new Uint8Array(w * h);
    this.ledge = new Uint8Array(w * h);   // 1 = saut vers le sud
    this.bsolid = new Uint8Array(w * h);  // bâtiments, meubles
    this.buildings = []; this.furniture = []; this.decor = [];
    this.warps = new Map();               // "x,y" -> { map, x, y, dir, kind }
    this.signs = new Map();               // "x,y" -> texte
    this.npcs = []; this.items = []; this.areas = []; this.triggers = [];
    this.encounters = o.encounters || null; // pour les intérieurs (grottes)
  }
  i(x, y) { return y * this.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  g(x, y) { return this.inb(x, y) ? this.ground[this.i(x, y)] : GR.VOID; }
  e(x, y) { return this.inb(x, y) ? this.elev[this.i(x, y)] : 9; }
  o(x, y) { return this.inb(x, y) ? this.obj[this.i(x, y)] : OB.BLOCK; }
  setG(x, y, v) { if (this.inb(x, y)) this.ground[this.i(x, y)] = v; }
  setO(x, y, v) { if (this.inb(x, y)) this.obj[this.i(x, y)] = v; }
  setE(x, y, v) { if (this.inb(x, y)) this.elev[this.i(x, y)] = v; }
  key(x, y) { return x + ',' + y; }
  /** case franchissable pour un personnage (sans compter les PNJ) */
  walkable(x, y) {
    if (!this.inb(x, y)) return false;
    const i = this.i(x, y), g = this.ground[i];
    if (g === GR.WATER || g === GR.VOID) return false;
    if (this.elev[i] > 0) return false;
    if (this.bsolid[i]) return false;
    if (SOLID_OBJ.has(this.obj[i])) return false;
    return true;
  }
  areaAt(x, y) {
    for (const a of this.areas) if (x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1) return a;
    return null;
  }
  addWarp(x, y, to) { this.warps.set(this.key(x, y), to); }
  warpAt(x, y) { return this.warps.get(this.key(x, y)); }
  npcAt(x, y) { return this.npcs.find((n) => !n.hidden && n.x === x && n.y === y); }
}

/** Bâtiment : empreinte w × d cases, porte en bas (x relatif doorX) */
export function addBuilding(map, b) {
  const B = { kind: 'house', roof: '#c85040', wall: '#f0e6d0', h: 2.4, doorX: Math.floor(b.w / 2), ...b };
  map.buildings.push(B);
  for (let y = B.y; y < B.y + B.d; y++) for (let x = B.x; x < B.x + B.w; x++) if (map.inb(x, y)) { map.bsolid[map.i(x, y)] = 1; map.setO(x, y, OB.NONE); }
  B.door = B.noDoor ? null : { x: B.x + B.doorX, y: B.y + B.d - 1 };
  return B;
}

/** Meuble (boîte texturée) dans un intérieur */
export function addFurniture(map, f) {
  const F = { h: 0.8, solid: true, ...f };
  map.furniture.push(F);
  if (F.solid) for (let y = F.y; y < F.y + (F.d || 1); y++) for (let x = F.x; x < F.x + (F.w || 1); x++) if (map.inb(x, y)) map.bsolid[map.i(x, y)] = 1;
  return F;
}
