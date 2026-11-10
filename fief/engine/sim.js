// Fief Maudit : la simulation. Moteur PUR (aucun DOM, aucun réseau).
// Le jour : abattre les arbres à la hache, ramasser les bûches, les ranger à l'entrepôt ou les mettre dans les braseros.
// La nuit : la brume monte, les squelettes sortent du sol au nord (côté château) et marchent sur le village ; ils
// visent les joueurs proches, sinon les braseros allumés, sinon l'entrepôt. Un squelette tombé dans la brume se relève ;
// dans la lumière d'un brasero ou du feu, il reste à terre. Un joueur à 0 PV tombe : un équipier le relève en tenant E.
// À l'aube, les squelettes encore debout tombent en poussière. Défaite si toute l'équipe est à terre ou si l'entrepôt tombe.
// Le pas est fixe (DT). Entrée d'un joueur : { wx, wz } (direction voulue dans le monde, longueur ≤ 1), walk, jump,
// hold (E tenu) et des compteurs d'appuis fc (frapper) et uc (utiliser) : un appui bref n'est jamais perdu.
import { createValley, TREE_HP, LIGHT_R, FIRE_LIGHT_R, rectOf, doorPoint } from './map.js';
import { TORCH_R, inZone } from './crypt.js';
import { createNav } from './nav.js';
import { makeRng } from './rng.js';
import { botInput } from './bots.js';

export const DT = 1 / 30;
export const SPEED = { run: 5.2, walk: 2.4, carry: 3.0 };
export const ACT = {
  chop: { dur: 0.95, hit: 0.48 },     // coup de hache (arbre)
  strike: { dur: 0.8, hit: 0.38 },    // coup sur un squelette
  pick: { dur: 0.75, at: 0.45 },      // ramasser une bûche
  store: { dur: 0.6, at: 0.35 },      // ranger à l'entrepôt
  feed: { dur: 0.7, at: 0.4 },        // bûche dans un brasero
  take: { dur: 0.6, at: 0.35 },       // reprendre une bûche à l'entrepôt
  drop: { dur: 0.45, at: 0.2 },       // poser la bûche par terre
  repair: { dur: 1.1, at: 0.7 },      // réparer l'entrepôt avec une bûche (forgeronne)
  build: { dur: 0.9, hit: 0.45 },     // coup de marteau sur un chantier
  gather: { dur: 0.9, at: 0.55 },     // cueillir des baies
  eat: { dur: 1.0, at: 0.6 },         // manger à l'entrepôt
  relight: { dur: 1.1, at: 0.8 },     // rallumer une torche de la crypte
  ability: { dur: 0.8, hit: 0.4 },    // la capacité du métier (F)
  open: { dur: 1.2, at: 0.9 },        // ouvrir un coffre
};
export const REACH = { chop: 1.6, pick: 1.9, store: 3.2, feed: 2.3, strike: 2.4, revive: 1.9, build: 2.4, gather: 1.9, site: 3.2 };
export const P_R = 0.42;
export const CYCLE = { day: 220, first: 150, dusk: 25, night: 150, dawn: 10 };
export const dayLen = (day) => (day <= 1 ? CYCLE.first : CYCLE.day);
export const LOAD_MAX = 3;           // bûches portées à la fois
// coffres gardés dans les bois : ce qu'on y trouve
export const LOOT = {
  bois: { text: '5 bûches rangées à l\'entrepôt' }, vivres: { text: '5 vivres rangés à l\'entrepôt' }, poutre: { text: '2 poutres rangées à l\'entrepôt' },
  huile: { text: 'de l\'huile : tous les braseros sont pleins' }, elixir: { text: 'un élixir : toute l\'équipe est soignée, capacités prêtes' },
};
export const CHEST = { r: 1.4, wake: 11, leash: 22, open: 1.2 };
export const HP = { player: 100, revived: 45, bleed: 40, revive: 3 };
export const FUEL = { start: 70, log: 50, max: 150, hit: 20, burn: 0.6 };
export const FOES = {
  minion: { hp: 55, speed: 2.7, dmg: 8, reach: 1.35, dur: 1.1, hit: 0.5 },
  warrior: { hp: 100, speed: 2.2, dmg: 13, reach: 1.45, dur: 1.25, hit: 0.6, block: true },
  // le chevalier noir des nuits de siège : il enfonce l'entrepôt
  knight: { hp: 420, speed: 2.0, dmg: 24, reach: 2.0, dur: 1.5, hit: 0.75, wall: 3, boss: true },
  // le Roi-Squelette, au fond de la crypte (sa vie suit la taille de l'équipe)
  king: { hp: 1400, speed: 2.3, dmg: 22, reach: 2.3, dur: 1.35, hit: 0.65, boss: true, king: true },
};
export const RISE = { delay: 6, dur: 2.3, max: 2, awaken: 2.4, crumble: 9 };
export const WAREHOUSE_HP = 600;
// les bâtiments à relever : coût (pris au stock de l'entrepôt), travail (coups de marteau) et effet
export const BUILDS = {
  maison1: { bois: 8, poutre: 1, work: 10, text: '+15 PV pour toute l\'équipe ; on y récupère la nuit' },
  maison2: { bois: 8, poutre: 1, work: 10, text: '+15 PV pour toute l\'équipe ; on y récupère la nuit' },
  forge: { bois: 10, poutre: 2, work: 14, text: 'Des armes forgées : +30 % de dégâts pour tous' },
  moulin: { bois: 10, poutre: 2, work: 14, text: 'Du pain : la faim baisse deux fois moins vite, +4 vivres à chaque aube' },
  chapelle: { bois: 14, poutre: 3, work: 18, text: 'Autour d\'elle, les morts ne se relèvent plus ; les tombés reviennent à ses pieds' },
};
export const FOOD = { max: 100, drain: 100 / 520, starve: 1, eat: 55, berries: 2, regrow: 300 };
export const COLD = 0.5, COLD_AFTER = 3;   // PV perdus par seconde, la nuit, après quelques secondes hors de toute lumière
export const MODES = { expedition: 10 };
export const DIFF = {
  paisible: { count: 0.7, dmg: 0.7, rise: false, food: 0.7 },
  normale: { count: 1, dmg: 1, rise: true, food: 1 },
  peste: { count: 1.35, dmg: 1.2, rise: true, food: 1.5 },
};
export const siegeNight = (n) => n % 5 === 0;
export const nightLen = (n) => (siegeNight(n) ? 200 : CYCLE.night);
// les métiers : chacun son modèle (vue), sa vie, ses coups et un talent
export const JOBS = {
  bucheron: { name: 'Bûcheron', hp: 100, dmg: 30, chop: 1.34, build: 1.2, beamAlone: true, ab: 'grandcoup', abName: 'Grand coup', cd: 18, abText: 'un coup circulaire qui repousse et sonne', perk: 'Abat un arbre en 3 coups, porte une poutre seul' },
  chevalier: { name: 'Chevalier', hp: 130, dmg: 34, armor: 0.75, ab: 'rempart', abName: 'Rempart', cd: 25, abText: 'attire les morts sur lui et encaisse moitié moins', perk: '+30 % de vie, encaisse un quart des coups en moins' },
  chasseuse: { name: 'Chasseuse', hp: 90, dmg: 26, speed: 1.12, reach: 0.5, ab: 'fusee', abName: 'Fusée', cd: 22, abText: 'une fusée qui éclaire au loin : les morts y restent à terre', perk: 'Court plus vite, frappe de plus loin' },
  pretre: { name: 'Prêtre', hp: 95, dmg: 22, aura: 2.5, revive: 2, ab: 'priere', abName: 'Prière', cd: 28, abText: 'soigne tout le monde autour, aide à relever', perk: 'Soigne les équipiers autour de lui, relève deux fois plus vite' },
  forgeronne: { name: 'Forgeronne', hp: 105, dmg: 28, feed: 1.5, repair: 60, build: 2, ab: 'barricade', abName: 'Barricade', cd: 25, abText: 'une barricade que les morts doivent casser', perk: 'Construit deux fois plus vite, répare l\'entrepôt, ses bûches brûlent plus longtemps' },
};
export const jobOf = (p) => JOBS[p.job] || JOBS.bucheron;
export const BEAM = { len: 3.4, speed: 2.3, alone: 1.9, grab: 1.5, store: 4.4 };
const GRAV = 22, JUMP_V = 7.2;
const LOGS_PER_TREE = 2, LOG_DELAY = 1.3;

// étapes du tutoriel des premiers jours
export const GOALS = [
  { id: 'chop', text: 'Abats un arbre à la hache', hint: 'Approche-toi d\'un arbre et frappe (clic)' },
  { id: 'pick', text: 'Ramasse une bûche', hint: 'E près d\'une bûche' },
  { id: 'store', text: 'Range-la à l\'entrepôt', hint: 'E devant la porte de l\'entrepôt' },
  { id: 'ten', text: 'Rentre 10 bûches', hint: 'Chaque arbre donne deux bûches' },
  { id: 'feed', text: 'Charge les braseros avant la nuit', hint: 'Porte une bûche à un brasero et appuie sur E' },
  { id: 'night', text: 'Tiens jusqu\'à l\'aube', hint: 'Garde les braseros allumés : dans leur lumière, les morts ne se relèvent pas' },
  { id: 'build', text: 'Relève un bâtiment du village', hint: 'E devant une ruine : du bois et des poutres de l\'entrepôt, puis des coups de marteau (clic)' },
  { id: 'free', text: 'Tenez dix nuits', hint: 'Nuits 5 et 10 : siège du chevalier noir. Pensez aux vivres : E devant l\'entrepôt pour manger' },
  { id: 'crypt', text: 'Descendez dans la crypte', hint: 'Au nord, sous le château : E devant la porte du donjon. Le Roi-Squelette vous attend' },
  { id: 'king', text: 'Abattez le Roi-Squelette', hint: 'Deux leviers ensemble lèvent la herse. Près des torches, on reprend des forces' },
];

const doorOf = (M, id) => doorPoint(M.buildings.find((b) => b.id === id), 1.8);
export const emptyInput = () => ({ wx: 0, wz: 0, walk: false, jump: false, hold: false, fc: 0, uc: 0, ac: 0 });
export const ABILITY = { grandcoup: { r: 3.2, dmg: 45, stun: 0.9 }, rempart: { dur: 6, r: 10, armor: 0.5 }, fusee: { dur: 14, r: 7.5, dist: 9 }, priere: { r: 9, heal: 35, revive: 1.8 }, barricade: { hp: 150, dur: 45, r: 0.8 } };
export const LEVER_T = 1.2;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Sim {
  constructor({ seed = 1, players = [{ id: 0, name: 'Toi', job: 'bucheron', color: '#e0a040' }], bots = 0, mode = 'expedition', diff = 'normale' } = {}) {
    this.seed = seed;
    this.mode = MODES[mode] ? mode : 'sansfin'; this.diff = DIFF[diff] ? diff : 'normale';
    this.build = Object.fromEntries(Object.keys(BUILDS).map((id) => [id, { state: 'ruine', prog: 0 }]));
    this.berries = []; this.won = false;
    this.crypt = { open: false, gate: false, leverT: 0, held: [false, false], brume: false, throne: false, king: null, phase: 0, summonAt: 0, torches: null };
    this.flares = []; this.bars = []; this.nextBar = 1;
    this.chests = []; this.nextChest = 1; this.chestSites = null;
    this.map = createValley(seed);
    this.nav = createNav(this.map);
    this.rng = makeRng(seed * 31 + 5);
    this.t = 0; this.tick = 0;
    this.clock = { day: 1, phase: 'jour', t: 0 };
    this.stock = { bois: 0, poutre: 0, pierre: 0, nourriture: 0 };
    this.beams = []; this.nextBeam = 1;
    this.trees = this.map.trees.map((t) => ({ id: t.id, hp: TREE_HP, down: false, fallAt: 0, dir: 0 }));
    this.logs = []; this.nextLog = 1;
    this.braziers = this.map.braziers.map((b) => ({ id: b.id, fuel: FUEL.start }));
    this.village = { hp: WAREHOUSE_HP };
    this.foes = []; this.nextFoe = 1; this.spawnQ = [];
    this.goal = 0; this.over = null; this.stats = { kills: 0, nights: 0 };
    this.events = [];
    const list = [...players];
    const BOT_NAMES = ['Bertrand', 'Aliénor', 'Gauvain', 'Mahaut', 'Tristan'];
    for (let i = 0; i < bots; i++) list.push({ id: 100 + i, name: BOT_NAMES[i % BOT_NAMES.length], job: 'chevalier', color: '#6aa0e0', bot: true });
    this.berries = this.map.bushes.map((b) => ({ id: b.id, ready: true, at: 0 }));
    this.players = list.map((p, i) => this.makePlayer(p, i));
    if (this.players.length) this.placeChests();
    this.inputs = new Map();
    this.lastC = new Map();
  }
  makePlayer(p, i) {
    const s = this.map.spawn, a = i * 2.1;
    let x = s.x + Math.sin(a) * i * 1.4, z = s.z + Math.cos(a) * i * 1.4;
    [x, z] = this.map.collide(x, z, P_R, this.fallen);
    const job = JOBS[p.job] ? p.job : 'bucheron';
    return { id: p.id, name: p.name, job, color: p.color || '#e0a040', bot: !!p.bot, x, z, y: this.map.heightAt(x, z), vy: 0, ground: true,
      yaw: s.yaw, speed: 0, moving: 0, carry: null, beam: null, end: 0, act: null, actT: 0, target: null,
      hp: JOBS[job].hp + this.hpBonus(), maxHp: JOBS[job].hp + this.hpBonus(), food: FOOD.max, cd: 0, guardT: 0, lever: -1, load: 0, cold: false, deadT: 0, down: false, downT: 0, dead: false, revive: 0, reviving: null, hurtT: 0, stored: 0, felled: 0, kills: 0, ai: null };
  }
  // un joueur arrive en cours de partie (près du feu de camp)
  addPlayer(p) {
    if (this.player(p.id)) return this.player(p.id);
    const q = this.makePlayer(p, this.players.length);
    this.players.push(q); this.events.push({ t: 'join', pid: q.id });
    return q;
  }
  // un joueur s'en va : ce qu'il portait reste par terre
  removePlayer(id) {
    const p = this.player(id); if (!p) return;
    this.release(p);
    this.players = this.players.filter((o) => o !== p);
    for (const o of this.players) if (o.reviving === id) o.reviving = null;
    this.inputs.delete(id); this.lastC.delete(id);
    this.events.push({ t: 'leave', pid: id, name: p.name });
  }
  setJob(id, job) {
    const p = this.player(id); if (!p || !JOBS[job] || p.job === job) return;
    const k = p.hp / p.maxHp; p.job = job; p.maxHp = JOBS[job].hp + this.hpBonus(); p.hp = Math.max(1, Math.round(p.maxHp * k));
    this.events.push({ t: 'job', pid: id, job });
  }
  // lâcher ce qu'on porte (à terre, en partant)
  release(p) {
    if (p.carry === 'vivres') this.stock.nourriture += 1;   // le panier n'est pas perdu
    if (p.carry === 'bois') for (let i = 0; i < Math.max(1, p.load); i++) { const x = p.x + 0.6 + i * 0.35, z = p.z + i * 0.5; this.logs.push({ id: this.nextLog++, x, z, y: this.map.heightAt(x, z), rot: p.yaw, at: this.t, ready: true }); }
    if (p.carry === 'poutre') this.letGo(p);
    p.carry = null; p.beam = null; p.load = 0;
  }
  // une bûche de moins dans les bras
  dropOne(p) { p.load = Math.max(0, (p.load || 1) - 1); if (!p.load) p.carry = null; }
  fallen = (id) => this.trees[id].down;
  player(id) { return this.players.find((p) => p.id === id); }
  foe(id) { return this.foes.find((f) => f.id === id); }
  setInput(id, inp) { this.inputs.set(id, inp); }
  get night() { return this.clock.phase === 'nuit'; }
  // 0 en plein jour, 1 en pleine nuit (crépuscule et aube en fondu)
  get darkness() {
    const c = this.clock;
    if (c.phase === 'nuit') return 1;
    if (c.t > this.dayLen - CYCLE.dusk) return (c.t - (this.dayLen - CYCLE.dusk)) / CYCLE.dusk;
    if (c.day > 1 && c.t < CYCLE.dawn) return 1 - c.t / CYCLE.dawn;
    return 0;
  }
  // temps avant le prochain changement (pour l'horloge à l'écran)
  get timeLeft() { const c = this.clock; return c.phase === 'nuit' ? nightLen(c.day) - c.t : this.dayLen - c.t; }
  get dayLen() { return dayLen(this.clock.day); }
  get D() { return DIFF[this.diff]; }
  built(id) { return this.build[id] && this.build[id].state === 'debout'; }
  hpBonus() { return this.build ? 15 * ((this.built('maison1') ? 1 : 0) + (this.built('maison2') ? 1 : 0)) : 0; }
  dmgMul() { return this.built('forge') ? 1.3 : 1; }
  // un squelette tombé ici se relèvera-t-il ?
  canRise(x, z) {
    if (!this.D.rise || this.lit(x, z)) return false;
    if (this.built('chapelle')) { const c = this.map.buildings.find((b) => b.id === 'chapelle'); if (Math.hypot(x - c.x, z - c.z) < 24) return false; }
    return true;
  }
  // abri : feu de camp, ou une maison relevée
  sheltered(x, z) {
    const c = this.map.campfire;
    if (Math.hypot(x - c.x, z - c.z) < 6) return true;
    for (const id of ['maison1', 'maison2']) if (this.built(id)) { const b = this.map.buildings.find((o) => o.id === id); if (Math.hypot(x - b.x, z - b.z) < 6.5) return true; }
    return false;
  }
  // un point est-il dans la lumière (feu de camp ou brasero allumé) ?
  inCrypt(x, z) { return this.map.crypt.inside(x, z); }
  torchLit(i) { return !this.crypt.torches || this.crypt.torches[i] !== false; }
  lit(x, z) {
    for (const f of this.flares) if (Math.hypot(x - f.x, z - f.z) < ABILITY.fusee.r) return true;
    if (this.inCrypt(x, z)) { for (const t of this.map.crypt.torches) if (this.torchLit(t.id) && Math.hypot(x - t.x, z - t.z) < TORCH_R) return true; return false; }
    const c = this.map.campfire;
    if (Math.hypot(x - c.x, z - c.z) < FIRE_LIGHT_R) return true;
    for (const b of this.map.braziers) if (this.braziers[b.id].fuel > 0 && Math.hypot(x - b.x, z - b.z) < LIGHT_R) return true;
    return false;
  }
  skipToDusk() { if (this.clock.phase === 'jour' && this.clock.t < this.dayLen - CYCLE.dusk) this.clock.t = this.dayLen - CYCLE.dusk; }

  // ------------------------------------------------------------------ un pas
  step() {
    if (this.over) return;
    this.t += DT; this.tick++;
    this.stepClock();
    // braseros : ils brûlent à la nuit tombée
    if (this.darkness > 0.5) for (const b of this.braziers) b.fuel = Math.max(0, b.fuel - DT * FUEL.burn);
    for (const p of this.players) if (p.bot) this.inputs.set(p.id, botInput(this, p));
    for (const p of this.players) this.stepPlayer(p, this.inputs.get(p.id) || emptyInput());
    this.stepRevives();
    this.stepCrypt();
    this.flares = this.flares.filter((f) => f.until > this.t);
    this.bars = this.bars.filter((b) => b.hp > 0 && b.until > this.t);
    this.stepFoes();
    for (const l of this.logs) if (!l.ready && this.t >= l.at) l.ready = true;
    for (const b of this.beams) if (!b.ready && this.t >= b.at) b.ready = true;
    this.stepBeams();
    for (const b of this.berries) if (!b.ready && this.t >= b.at) b.ready = true;
    if (this.goal === 3 && this.stock.bois >= 10) this.setGoal(4);
    this.checkOver();
  }
  setGoal(g) { if (g > this.goal) { this.goal = g; this.events.push({ t: 'goal', goal: g }); } }

  stepClock() {
    const c = this.clock;
    if (this.crypt.open) return;   // le temps s'arrête : tout se joue dans la crypte
    c.t += DT;
    if (c.phase === 'jour') {
      if (c.t >= this.dayLen - CYCLE.dusk && !c.duskSaid) { c.duskSaid = true; this.events.push({ t: 'dusk' }); this.duskSnap = this.snapshot(); }
      if (c.t >= this.dayLen) { c.phase = 'nuit'; c.t = 0; this.startNight(); }
    } else if (c.t >= nightLen(c.day)) {
      c.phase = 'jour'; c.t = 0; c.day++; c.duskSaid = false;
      this.dawn();
    }
  }
  startNight() {
    const n = this.clock.day;
    this.events.push({ t: 'night', n });
    if (this.goal < 5) this.setGoal(5);
    // les squelettes arrivent par petits groupes pendant les deux premiers tiers de la nuit
    const siege = siegeNight(n), len = nightLen(n);
    // plus on est nombreux, plus ils sont nombreux
    const team = Math.min(1.6, Math.max(0.75, 0.55 + 0.2 * this.players.length));
    const total = Math.round((6 + 2 * (n - 1)) * team * this.D.count * (siege ? 1.3 : 1)), warriors = Math.max(1, Math.floor(total * (n === 1 ? 0.2 : 0.33)));
    const kinds = []; for (let i = 0; i < total; i++) kinds.push(i < warriors ? 'warrior' : 'minion');
    this.rng.shuffle(kinds);
    this.spawnQ = [];
    let at = 4;
    for (let i = 0; i < total;) {
      const g = Math.min(total - i, this.rng.int(2, 3)), side = this.rng.range(-1.4, 1.4);
      for (let k = 0; k < g; k++, i++) this.spawnQ.push({ at: at + k * 0.8, kind: kinds[i], side: side + this.rng.range(-0.25, 0.25) });
      at += (len * 0.62) / Math.ceil(total / 2.5);
    }
    // nuit de siège : le chevalier noir (deux à la dixième nuit)
    if (siege) { for (let k = 0; k < (n >= 10 ? 2 : 1); k++) this.spawnQ.push({ at: 35 + k * 25, kind: 'knight', side: k ? 0.5 : -0.3 }); this.spawnQ.sort((a, b) => a.at - b.at); this.events.push({ t: 'siege', n }); }
  }
  dawn() {
    this.stats.nights++;
    this.spawnQ = [];
    for (const f of this.foes) if (f.state !== 'dead') { f.state = 'dead'; f.t = 0; f.sun = true; }
    for (const f of this.foes) f.sun = true;
    for (const p of this.players) {
      if (p.dead || p.down) { p.dead = false; p.down = false; p.revive = 0; const c = this.map.campfire; p.x = c.x + 1.6; p.z = c.z + 1.6; p.y = this.map.heightAt(p.x, p.z); }
      p.hp = p.maxHp;
    }
    if (this.built('moulin')) this.stock.nourriture += 4;
    const n = this.clock.day - 1;
    this.events.push({ t: 'dawn', n });
    if (!(MODES[this.mode] && n >= MODES[this.mode])) this.placeChests();
    if (this.goal === 5) this.setGoal(6);
    // l'expédition : dix nuits tenues
    if (MODES[this.mode] && n >= MODES[this.mode]) this.openCrypt();
    this.saveNow = true;
  }
  checkOver() {
    if (this.over) return;
    const alive = this.players.filter((p) => !p.dead);
    if (this.village.hp <= 0) this.over = { reason: 'entrepot' };
    else if (!alive.length || alive.every((p) => p.down)) this.over = { reason: 'equipe' };
    if (this.over) this.events.push({ t: 'over', reason: this.over.reason });
  }

  // ------------------------------------------------------------------ joueurs
  stepPlayer(p, inp) {
    const last = this.lastC.get(p.id) || { fc: 0, uc: 0 };
    const wantHit = inp.fc > last.fc, wantUse = inp.uc > last.uc, wantAb = (inp.ac || 0) > (last.ac || 0);
    this.lastC.set(p.id, { fc: inp.fc, uc: inp.uc, ac: inp.ac || 0 });
    p.cd = Math.max(0, p.cd - DT); p.guardT = Math.max(0, p.guardT - DT); p.lever = -1;
    const M = this.map;
    p.hurtT = Math.max(0, p.hurtT - DT);
    if (p.dead) {
      // la chapelle relevée ramène les tombés à ses pieds
      p.deadT += DT;
      if (this.built('chapelle') && p.deadT > 20) { const c = doorOf(this.map, 'chapelle'); p.dead = false; p.down = false; p.x = c.x; p.z = c.z; p.y = this.map.heightAt(c.x, c.z); p.hp = Math.round(p.maxHp * 0.5); this.events.push({ t: 'back', pid: p.id }); }
      return;
    }
    if (p.down) {
      p.downT += DT;
      if (p.downT >= HP.bleed) { p.dead = true; p.down = false; p.deadT = 0; this.events.push({ t: 'dead', pid: p.id }); }
      return;
    }
    // relever un équipier : E tenu tout près de lui
    p.reviving = null;
    if (inp.hold && p.carry !== 'poutre' && !p.act) {
      const m = this.players.find((o) => o !== p && o.down && Math.hypot(o.x - p.x, o.z - p.z) < REACH.revive);
      if (m) { p.reviving = m.id; p.yaw = Math.atan2(m.x - p.x, m.z - p.z); }
      // tenir un levier de la crypte
      else if (this.crypt.open && !this.crypt.gate) for (const l of this.map.crypt.levers) if (Math.hypot(l.x - p.x, l.z - p.z) < 1.6) { p.lever = l.id; p.yaw = l.wall < 0 ? -Math.PI / 2 : Math.PI / 2; }
    }

    if (p.act) {
      const A = ACT[p.act], before = p.actT;
      p.actT += DT;
      const at = A.hit ?? A.at;
      if (before < at && p.actT >= at) this.resolve(p);
      if (p.actT >= A.dur) { p.act = null; p.target = null; }
    } else if (p.reviving !== null || p.lever >= 0) {
      // immobile pendant qu'on relève ou qu'on tient un levier
    } else if (wantAb && p.ground && !p.carry && p.cd <= 0) {
      p.act = 'ability'; p.actT = 0; p.cd = jobOf(p).cd;
      const f = this.foeNear(p.x, p.z, 4); if (f) p.yaw = Math.atan2(f.x - p.x, f.z - p.z);
      this.events.push({ t: 'ability', pid: p.id, ab: jobOf(p).ab });
    } else if (wantHit && !p.carry && p.ground) {
      // un squelette à portée passe avant les arbres
      const f = this.foeNear(p.x, p.z, REACH.strike + 0.4 + (jobOf(p).reach || 0));
      const site = !f && this.siteNear(p.x, p.z, REACH.build);
      if (f) { p.yaw = Math.atan2(f.x - p.x, f.z - p.z); p.act = 'strike'; p.actT = 0; p.target = f.id; }
      else if (site && this.build[site.id].state === 'chantier') { p.yaw = Math.atan2(site.x - p.x, site.z - p.z); p.act = 'build'; p.actT = 0; p.target = site.id; }
      else {
        const t = M.treeNear(p.x, p.z, REACH.chop + 0.6, this.fallen);
        if (t) p.yaw = Math.atan2(t.x - p.x, t.z - p.z);
        p.act = 'chop'; p.actT = 0; p.target = t ? t.id : null;
      }
    } else if (wantUse && p.ground) this.use(p);

    let wx = inp.wx || 0, wz = inp.wz || 0;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    const busy = !!p.act || p.reviving !== null || p.lever >= 0;
    const J = jobOf(p);
    let sp = busy ? 0 : p.carry === 'poutre' ? this.beamSpeed(p) : p.carry ? SPEED.carry - 0.3 * Math.max(0, (p.load || 1) - 1) : inp.walk ? SPEED.walk : SPEED.run * (J.speed || 1);
    if (inp.walk && sp > SPEED.walk) sp = SPEED.walk;
    const k = Math.min(1, len);
    let nx = p.x + wx * sp * DT, nz = p.z + wz * sp * DT;
    if (!busy && k > 0.05) p.yaw += wrap(Math.atan2(wx, wz) - p.yaw) * Math.min(1, DT * 12);
    if (M.isWater(nx, nz)) { nx = p.x; nz = p.z; }
    [nx, nz] = M.collide(nx, nz, P_R, this.fallen);
    [nx, nz] = this.pushBars(nx, nz, P_R);
    p.speed = Math.hypot(nx - p.x, nz - p.z) / DT;
    p.x = nx; p.z = nz; p.moving = busy ? 0 : k;
    const g = M.heightAt(p.x, p.z);
    if (p.ground && inp.jump && !busy && !p.carry) { p.vy = JUMP_V; p.ground = false; this.events.push({ t: 'jump', pid: p.id }); }
    if (!p.ground) {
      p.vy -= GRAV * DT; p.y += p.vy * DT;
      if (p.y <= g) { p.y = g; p.vy = 0; p.ground = true; this.events.push({ t: 'land', pid: p.id }); }
    } else p.y = g;
    // près du feu de camp (le jour) ou d'une maison relevée, on récupère
    const home = this.sheltered(p.x, p.z);
    if (home && (!this.night || Math.hypot(p.x - M.campfire.x, p.z - M.campfire.z) > 6)) p.hp = Math.min(p.maxHp, p.hp + 4 * DT);
    // la faim
    // dans la crypte, près d'une torche et loin des morts, on reprend son souffle
    if (this.crypt.open && !p.down && this.inCrypt(p.x, p.z) && p.hp < p.maxHp && this.lit(p.x, p.z) && !this.foeNear(p.x, p.z, 6)) p.hp = Math.min(p.maxHp, p.hp + 4 * DT);
    if (!this.crypt.open) p.food = Math.max(0, p.food - FOOD.drain * this.D.food * (this.built('moulin') ? 0.5 : 1) * DT);
    if (p.food <= 0 && !this.crypt.open) this.hurtBy(p, FOOD.starve * DT, 'faim');
    // le froid : la nuit, loin de toute lumière
    const dark = this.night && !this.inCrypt(p.x, p.z) && !this.lit(p.x, p.z) && !home;
    p.coldT = dark ? (p.coldT || 0) + DT : 0;
    p.cold = p.coldT > COLD_AFTER;
    if (p.cold) this.hurtBy(p, COLD * DT, 'froid');
    // le prêtre soigne autour de lui
    if (J.aura) for (const o of this.players) if (!o.down && !o.dead && Math.hypot(o.x - p.x, o.z - p.z) < 7) o.hp = Math.min(o.maxHp, o.hp + J.aura * DT);
  }
  stepRevives() {
    for (const m of this.players) {
      if (!m.down) continue;
      const helpers = this.players.filter((p) => p.reviving === m.id);
      if (helpers.length) m.revive += DT * Math.max(...helpers.map((p) => jobOf(p).revive || 1)) * (1 + 0.5 * (helpers.length - 1));
      else m.revive = Math.max(0, m.revive - DT * 2);
      if (m.revive >= HP.revive) { m.down = false; m.revive = 0; m.downT = 0; m.hp = HP.revived; this.events.push({ t: 'up', pid: m.id }); }
    }
  }
  // une perte lente (faim, froid) : pas de cri à chaque pas
  hurtBy(p, dmg) {
    if (p.down || p.dead) return;
    p.hp -= dmg;
    if (p.hp <= 0) this.hurt(p, 1);
  }
  hurt(p, dmg, from) {
    if (p.down || p.dead) return;
    dmg *= (jobOf(p).armor || 1) * (p.guardT > 0 ? ABILITY.rempart.armor : 1);
    p.hp -= dmg; p.hurtT = 0.4;
    this.events.push({ t: 'hurt', pid: p.id, dmg });
    if (p.hp <= 0) {
      p.hp = 0; p.down = true; p.downT = 0; p.revive = 0; p.act = null;
      // ce qu'il portait tombe avec lui
      this.release(p);
      this.events.push({ t: 'down', pid: p.id });
    }
  }

  // E : poser dans un brasero, ranger, poser par terre, ramasser
  use(p) {
    const M = this.map;
    if (p.carry === 'poutre') {
      const b = this.beams.find((o) => o.id === p.beam);
      if (b && b.lifted && Math.hypot(b.x - M.depot.x, b.z - M.depot.z) < BEAM.store) this.storeBeam(b, p);
      else this.letGo(p);
      return;
    }
    if (this.players.some((o) => o !== p && o.down && Math.hypot(o.x - p.x, o.z - p.z) < REACH.revive)) return; // E se tient pour relever
    if (p.carry) {
      if (p.carry === 'bois' && jobOf(p).repair && this.village.hp < WAREHOUSE_HP - 20 && Math.hypot(p.x - M.depot.x, p.z - M.depot.z) < REACH.store) { p.act = 'repair'; p.actT = 0; p.yaw = Math.atan2(M.warehouse.x - p.x, M.warehouse.z - p.z); return; }
      const b = this.brazierNear(p.x, p.z, REACH.feed);
      if (b && p.carry === 'bois' && this.braziers[b.id].fuel < FUEL.max - 5) { p.act = 'feed'; p.actT = 0; p.target = b.id; p.yaw = Math.atan2(b.x - p.x, b.z - p.z); return; }
      if (Math.hypot(p.x - M.depot.x, p.z - M.depot.z) < REACH.store) { p.act = 'store'; p.actT = 0; p.yaw = Math.atan2(M.warehouse.x - p.x, M.warehouse.z - p.z); return; }
      if (p.carry === 'bois' && p.load < LOAD_MAX) { const l = this.logNear(p.x, p.z, REACH.pick); if (l) { p.act = 'pick'; p.actT = 0; p.target = l.id; p.yaw = Math.atan2(l.x - p.x, l.z - p.z); return; } }
      if (p.carry === 'vivres') return;   // un panier ne se pose pas : on le range
      p.act = 'drop'; p.actT = 0; return;
    }
    // la crypte : y descendre, en remonter, rallumer une torche
    if (this.crypt.open && Math.hypot(p.x - M.cryptDoor.x, p.z - M.cryptDoor.z) < 3) { this.teleport(p, M.crypt.spawn.x, M.crypt.spawn.z + 1.5, Math.PI); this.events.push({ t: 'descend', pid: p.id }); return; }
    if (this.inCrypt(p.x, p.z) && Math.hypot(p.x - M.crypt.spawn.x, p.z - M.crypt.spawn.z) < 1.4) { this.teleport(p, M.cryptDoor.x, M.cryptDoor.z + 1.5, 0); return; }
    const torch = this.torchNear(p.x, p.z);
    if (torch) { p.act = 'relight'; p.actT = 0; p.target = torch.id; return; }
    const ch = this.chestNear(p.x, p.z);
    if (ch) { p.act = 'open'; p.actT = 0; p.target = ch.id; p.yaw = Math.atan2(ch.x - p.x, ch.z - p.z); return; }
    if (this.canRing(p)) { this.ring(p); return; }
    // ordre : ce qui traîne par terre, puis l'entrepôt (manger, reprendre du bois), les baies, les ruines
    const l = this.logNear(p.x, p.z, REACH.pick);
    const e = this.beamEndNear(p.x, p.z);
    if (e && (!l || e.d < Math.hypot(l.x - p.x, l.z - p.z))) { this.grab(p, e.beam, e.end); return; }
    if (l) { p.act = 'pick'; p.actT = 0; p.target = l.id; p.yaw = Math.atan2(l.x - p.x, l.z - p.z); return; }
    if (this.canEat(p)) { p.act = 'eat'; p.actT = 0; p.yaw = Math.atan2(M.warehouse.x - p.x, M.warehouse.z - p.z); return; }
    if (this.canTake(p)) { p.act = 'take'; p.actT = 0; p.yaw = Math.atan2(M.warehouse.x - p.x, M.warehouse.z - p.z); return; }
    const bush = this.bushNear(p.x, p.z);
    if (bush) { p.act = 'gather'; p.actT = 0; p.target = bush.id; p.yaw = Math.atan2(bush.x - p.x, bush.z - p.z); return; }
    const site = this.siteNear(p.x, p.z);
    if (site && this.build[site.id].state === 'ruine') this.startBuild(site.id, p);
  }
  // reprendre une bûche à l'entrepôt (pour les braseros), une fois le tutoriel des bûches passé
  canTake(p) { return this.stock.bois > 0 && this.goal >= 4 && Math.hypot(p.x - this.map.depot.x, p.z - this.map.depot.z) < REACH.store; }
  // le guerrier pare avec son bouclier les coups venus de face
  blocks(f, x, z) { return !!FOES[f.kind].block && f.state !== 'awaken' && f.stun <= 0 && Math.abs(wrap(Math.atan2(x - f.x, z - f.z) - f.yaw)) < 0.9; }
  logNear(x, z, r) {
    let best = null, bd = r;
    for (const l of this.logs) { if (!l.ready) continue; const d = Math.hypot(l.x - x, l.z - z); if (d < bd) { bd = d; best = l; } }
    return best;
  }
  brazierNear(x, z, r) {
    let best = null, bd = r;
    for (const b of this.map.braziers) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  foeNear(x, z, r) {
    let best = null, bd = r;
    for (const f of this.foes) { if (f.state === 'dead' || f.state === 'rise') continue; const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  resolve(p) {
    const M = this.map;
    if (p.act === 'chop') {
      const id = p.target;
      if (id === null || this.trees[id].down) { this.events.push({ t: 'swing', pid: p.id }); return; }
      const T = this.trees[id], src = M.trees[id];
      if (Math.hypot(src.x - p.x, src.z - p.z) - 0.55 * src.s > REACH.chop + 0.7) { this.events.push({ t: 'swing', pid: p.id }); return; }
      T.hp -= jobOf(p).chop || 1;
      this.events.push({ t: 'hit', pid: p.id, tree: id, hp: Math.max(0, T.hp) });
      if (T.hp <= 0.01) {
        T.down = true; T.fallAt = this.t;
        T.dir = Math.atan2(src.x - p.x, src.z - p.z);
        p.felled++;
        this.events.push({ t: 'fall', pid: p.id, tree: id, dir: T.dir });
        // un chêne donne une poutre (à porter à deux) en plus d'une bûche
        if (src.kind === 'oak') {
          let x = src.x + Math.sin(T.dir) * 3.4 * src.s, z = src.z + Math.cos(T.dir) * 3.4 * src.s;
          if (M.isWater(x, z)) { x = src.x + Math.sin(T.dir) * 1.8; z = src.z + Math.cos(T.dir) * 1.8; }
          [x, z] = M.collide(x, z, 0.5, this.fallen);
          this.beams.push({ id: this.nextBeam++, x, z, y: M.heightAt(x, z), rot: T.dir, h: [null, null], lifted: false, at: this.t + LOG_DELAY, ready: false });
        }
        for (let i = 0; i < (src.kind === 'oak' ? 1 : LOGS_PER_TREE); i++) {
          const d = 2.2 + i * 2.1 * src.s;
          let x = src.x + Math.sin(T.dir) * d, z = src.z + Math.cos(T.dir) * d;
          if (M.isWater(x, z)) { x = src.x + Math.sin(T.dir) * 1.2; z = src.z + Math.cos(T.dir) * 1.2; }
          [x, z] = M.collide(x, z, 0.3, this.fallen);
          this.logs.push({ id: this.nextLog++, x, z, y: M.heightAt(x, z), rot: T.dir + (i ? 0.25 : -0.15), at: this.t + LOG_DELAY, ready: false });
        }
        if (this.goal === 0) this.setGoal(1);
      }
    } else if (p.act === 'strike') {
      const f = this.foe(p.target);
      if (!f || f.state === 'dead' || f.state === 'rise' || Math.hypot(f.x - p.x, f.z - p.z) > REACH.strike + 0.6 + (jobOf(p).reach || 0)) { this.events.push({ t: 'swing', pid: p.id }); return; }
      let dmg = jobOf(p).dmg * this.dmgMul();
      // le guerrier pare de face avec son bouclier
      const blocked = this.blocks(f, p.x, p.z);
      if (blocked) dmg *= 0.3;
      f.hp -= dmg; f.stun = blocked ? 0.15 : 0.4;
      const d = Math.hypot(f.x - p.x, f.z - p.z) || 1;
      [f.x, f.z] = M.collide(f.x + (f.x - p.x) / d * (blocked ? 0.15 : 0.45), f.z + (f.z - p.z) / d * (blocked ? 0.15 : 0.45), 0.4, this.fallen);
      this.events.push({ t: blocked ? 'block' : 'strike', pid: p.id, foe: f.id, x: f.x, z: f.z });
      if (f.hp <= 0) this.killFoe(f, p);
    } else if (p.act === 'pick') {
      const l = this.logs.find((o) => o.id === p.target);
      if (!l) return;
      this.logs = this.logs.filter((o) => o !== l);
      if (p.carry === 'bois') p.load = Math.min(LOAD_MAX, p.load + 1); else { p.carry = 'bois'; p.load = 1; }
      this.events.push({ t: 'pick', pid: p.id });
      if (this.goal === 1) this.setGoal(2);
    } else if (p.act === 'store') {
      if (!p.carry) return;
      if (p.carry === 'vivres') { this.stock.nourriture += FOOD.berries; p.carry = null; this.events.push({ t: 'storeFood', pid: p.id, n: this.stock.nourriture }); return; }
      const k = Math.max(1, p.load); this.stock.bois += k; p.stored += k; p.carry = null; p.load = 0;
      this.events.push({ t: 'store', pid: p.id, n: this.stock.bois, k });
      if (this.goal === 2) this.setGoal(3);
    } else if (p.act === 'feed') {
      if (!p.carry) return;
      const B = this.braziers[p.target];
      B.fuel = Math.min(FUEL.max, B.fuel + FUEL.log * (jobOf(p).feed || 1)); this.dropOne(p);
      this.events.push({ t: 'feed', pid: p.id, brazier: p.target, fuel: B.fuel });
      if (this.goal === 4) this.setGoal(5);
    } else if (p.act === 'build') {
      const B = this.build[p.target], C = BUILDS[p.target];
      if (!B || B.state !== 'chantier') return;
      B.prog = Math.min(C.work, B.prog + (jobOf(p).build || 1));
      this.events.push({ t: 'hammer', pid: p.id, site: p.target, prog: B.prog / C.work });
      if (B.prog >= C.work) this.finishBuild(p.target, p);
    } else if (p.act === 'gather') {
      const b = this.berries[p.target];
      if (!b || !b.ready || p.carry) return;
      b.ready = false; b.at = this.t + FOOD.regrow; p.carry = 'vivres';
      this.events.push({ t: 'gather', pid: p.id, bush: b.id });
    } else if (p.act === 'eat') {
      if (this.stock.nourriture <= 0) return;
      this.stock.nourriture--; p.food = Math.min(FOOD.max, p.food + FOOD.eat);
      this.events.push({ t: 'eat', pid: p.id });
    } else if (p.act === 'relight') {
      if (this.crypt.torches) this.crypt.torches[p.target] = true;
      this.events.push({ t: 'relight', pid: p.id, torch: p.target });
    } else if (p.act === 'ability') this.ability(p);
    else if (p.act === 'open') this.openChest(p, p.target);
    else if (p.act === 'repair') {
      if (!p.carry) return;
      this.dropOne(p); this.village.hp = Math.min(WAREHOUSE_HP, this.village.hp + jobOf(p).repair);
      this.events.push({ t: 'repair', pid: p.id, hp: this.village.hp });
    } else if (p.act === 'take') {
      if (p.carry || this.stock.bois <= 0) return;
      this.stock.bois--; p.carry = 'bois'; p.load = 1;
      this.events.push({ t: 'take', pid: p.id, n: this.stock.bois });
    } else if (p.act === 'drop') {
      if (!p.carry) return;
      let x = p.x + Math.sin(p.yaw) * 0.9, z = p.z + Math.cos(p.yaw) * 0.9;
      [x, z] = M.collide(x, z, 0.3, this.fallen);
      this.logs.push({ id: this.nextLog++, x, z, y: M.heightAt(x, z), rot: p.yaw + Math.PI / 2, at: this.t, ready: true });
      this.dropOne(p);
      this.events.push({ t: 'drop', pid: p.id });
    }
  }

  // ------------------------------------------------------------------ squelettes
  spawnFoe(kind, side) {
    const M = this.map;
    for (let tries = 0; tries < 40; tries++) {
      // ils sortent du sol au nord, entre le village et le château
      const a = Math.PI + side + this.rng.range(-0.3, 0.3), r = this.rng.range(34, 50);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (this.nav.blocked(x, z, this.fallen) || this.lit(x, z) || M.isWater(x, z)) continue;
      const F = FOES[kind];
      const f = { id: this.nextFoe++, kind, x, z, y: M.heightAt(x, z), yaw: Math.atan2(-x, -z), hp: F.hp, state: 'awaken', t: 0, rises: 0, stun: 0,
        tgt: null, path: null, pathAt: -9, pathTo: null, atkT: 0, stuck: 0 };
      this.foes.push(f);
      this.events.push({ t: 'spawn', foe: f.id, kind, x, z });
      return f;
    }
    return null;
  }
  killFoe(f, by) {
    f.state = 'dead'; f.t = 0; f.stun = 0;
    if (by) { by.kills++; this.stats.kills++; }
    this.events.push({ t: 'kill', foe: f.id, pid: by ? by.id : null, lit: this.lit(f.x, f.z) });
    // le Roi tombe : la malédiction est brisée
    if (f.kind === 'king') {
      for (const o of this.foes) if (o !== f) { o.state = 'dead'; o.t = 0; o.sun = true; }
      this.won = true; this.over = { reason: 'victoire' };
      this.events.push({ t: 'kingDown', pid: by ? by.id : null }, { t: 'over', reason: 'victoire' });
    }
  }
  // la cible d'un squelette : un joueur proche, sinon un brasero allumé, sinon l'entrepôt
  chooseTarget(f) {
    if (f.guard) return this.guardTarget(f);
    // le Rempart du chevalier attire tout ce qui est proche
    const guard = this.players.find((p) => p.guardT > 0 && !p.down && Math.hypot(p.x - f.x, p.z - f.z) < ABILITY.rempart.r);
    if (guard) return { type: 'p', id: guard.id };
    // dans la crypte : le joueur le plus proche, où qu'il soit
    if (this.inCrypt(f.x, f.z)) {
      let b2 = null, d2 = 1e9;
      for (const p of this.players) { if (p.down || p.dead || !this.inCrypt(p.x, p.z)) continue; const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < d2) { d2 = d; b2 = { type: 'p', id: p.id }; } }
      return b2 || { type: 'none' };
    }
    let best = null, bd = 9;
    for (const p of this.players) { if (p.down || p.dead) continue; const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < bd) { bd = d; best = { type: 'p', id: p.id }; } }
    if (best) return best;
    bd = 26;
    for (const b of this.map.braziers) { if (this.braziers[b.id].fuel <= 0) continue; const d = Math.hypot(b.x - f.x, b.z - f.z); if (d < bd) { bd = d; best = { type: 'b', id: b.id }; } }
    return best || { type: 'w' };
  }
  // point visé et distance à laquelle on frappe
  targetPoint(f, tg) {
    if (tg.type === 'none') return null;
    if (tg.type === 'home') return { x: tg.x, z: tg.z, reach: 0.8 };
    if (tg.type === 'bar') { const b = this.bars.find((o) => o.id === tg.id); return b ? { x: b.x, z: b.z, reach: ABILITY.barricade.r + 0.9 } : null; }
    if (tg.type === 'p') { const p = this.player(tg.id); return p && !p.down && !p.dead ? { x: p.x, z: p.z, reach: FOES[f.kind].reach } : null; }
    if (tg.type === 'b') { const b = this.map.braziers[tg.id]; return this.braziers[tg.id].fuel > 0 ? { x: b.x, z: b.z, reach: 1.25 } : null; }
    const box = this.map.boxes.find((o) => o.id === 'entrepot');
    return { x: clamp(f.x, box.x0, box.x1), z: clamp(f.z, box.z0, box.z1), reach: 0.95 };
  }
  stepFoes() {
    const M = this.map;
    if (this.night) while (this.spawnQ.length && this.spawnQ[0].at <= this.clock.t) { const s = this.spawnQ.shift(); this.spawnFoe(s.kind, s.side); }
    for (const f of this.foes) {
      const F = FOES[f.kind];
      f.t += DT; f.stun = Math.max(0, f.stun - DT);
      if (f.state === 'sleep') { if (this.guardWakes(f)) { f.state = 'awaken'; f.t = 0; this.events.push({ t: 'guardWake', foe: f.id, x: f.x, z: f.z }); } continue; }
      if (f.state === 'awaken') { if (f.t >= RISE.awaken) { f.state = 'walk'; f.t = 0; } continue; }
      if (f.state === 'dead') {
        // dans la brume, il se relève (deux fois au plus) ; dans la lumière, il reste à terre
        if (!f.sun && !FOES[f.kind].boss && f.t >= RISE.delay && f.rises < RISE.max && this.canRise(f.x, f.z) && (this.night || this.inCrypt(f.x, f.z))) { f.state = 'rise'; f.t = 0; f.rises++; this.events.push({ t: 'rise', foe: f.id }); }
        continue;
      }
      if (f.state === 'rise') { if (f.t >= RISE.dur) { f.state = 'walk'; f.t = 0; f.hp = F.hp * 0.6; } continue; }
      if (f.stun > 0) continue;
      // une barricade sur le chemin : on la casse d'abord
      const bar = this.bars.find((b) => Math.hypot(b.x - f.x, b.z - f.z) < ABILITY.barricade.r + 0.7);
      if (bar && f.state !== 'attack') f.tgt = { type: 'bar', id: bar.id };
      // cible revue deux fois par seconde
      if (!f.tgt || (this.tick % 15 === f.id % 15 && f.tgt.type !== 'bar')) f.tgt = this.chooseTarget(f);
      let tp = this.targetPoint(f, f.tgt);
      if (!tp) { f.tgt = this.chooseTarget(f); tp = this.targetPoint(f, f.tgt); if (!tp) continue; }
      const dx = tp.x - f.x, dz = tp.z - f.z, d = Math.hypot(dx, dz);
      if (f.state === 'attack') {
        f.yaw += wrap(Math.atan2(dx, dz) - f.yaw) * Math.min(1, DT * 10);
        const before = f.atkT; f.atkT += DT;
        if (before < F.hit && f.atkT >= F.hit && d < tp.reach + 0.5) this.foeHits(f, f.tgt);
        if (f.atkT >= F.dur) { f.state = 'walk'; f.atkT = 0; }
        continue;
      }
      if (d < tp.reach && f.tgt.type === 'home') { f.state = 'sleep'; f.t = 0; f.hp = Math.min(f.maxHp || FOES[f.kind].hp, f.hp + 20); continue; }
      if (d < tp.reach) { f.state = 'attack'; f.atkT = 0; this.events.push({ t: 'swingFoe', foe: f.id }); continue; }
      // chemin : recalculé quand la cible a bougé, ou de temps en temps
      if (!f.path || this.t - f.pathAt > 2 || (f.pathTo && Math.hypot(f.pathTo[0] - tp.x, f.pathTo[1] - tp.z) > 2.5)) {
        f.path = this.nav.path(f.x, f.z, tp.x, tp.z, this.fallen) || [[tp.x, tp.z]];
        f.pathAt = this.t; f.pathTo = [tp.x, tp.z];
      }
      while (f.path.length > 1 && Math.hypot(f.path[0][0] - f.x, f.path[0][1] - f.z) < 0.6) f.path.shift();
      const w = f.path[0] || [tp.x, tp.z];
      const wx = w[0] - f.x, wz = w[1] - f.z, wd = Math.hypot(wx, wz) || 1;
      const sp = F.speed * (this.lit(f.x, f.z) ? 0.85 : 1);
      let nx = f.x + wx / wd * sp * DT, nz = f.z + wz / wd * sp * DT;
      [nx, nz] = M.collide(nx, nz, 0.4, this.fallen);
      [nx, nz] = this.pushBars(nx, nz, 0.4);
      const moved = Math.hypot(nx - f.x, nz - f.z);
      f.stuck = moved < sp * DT * 0.3 ? f.stuck + DT : 0;
      if (f.stuck > 0.8) { f.path = null; f.stuck = 0; }
      f.x = nx; f.z = nz; f.y = M.heightAt(f.x, f.z);
      f.yaw += wrap(Math.atan2(wx, wz) - f.yaw) * Math.min(1, DT * 8);
    }
    // ils ne se marchent pas dessus
    const act = this.foes.filter((f) => f.state === 'walk' || f.state === 'attack');
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 0.85 && d > 1e-4) { const k = (0.85 - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    }
    // les squelettes tombés à la lumière, ou au soleil, finissent en poussière
    this.foes = this.foes.filter((f) => {
      if (f.state === 'dead' && (f.sun ? f.t > 3 : (f.t > RISE.crumble && (this.lit(f.x, f.z) || f.rises >= RISE.max || FOES[f.kind].boss || (!this.night && !this.inCrypt(f.x, f.z)))))) { this.events.push({ t: 'crumble', foe: f.id }); return false; }
      return true;
    });
  }
  foeHits(f, tg) {
    const F = FOES[f.kind];
    const dm = this.D.dmg;
    if (tg.type === 'p') { const p = this.player(tg.id); if (p) this.hurt(p, F.dmg * dm * (f.enrage ? 1.3 : 1) * (F.king && this.alive().length <= 2 ? 0.8 : 1), f); }
    else if (tg.type === 'bar') { const b = this.bars.find((o) => o.id === tg.id); if (b) { b.hp -= F.dmg * 1.5; this.events.push({ t: 'barHit', x: b.x, z: b.z }); } }
    else if (tg.type === 'b') { const B = this.braziers[tg.id]; B.fuel = Math.max(0, B.fuel - FUEL.hit); this.events.push({ t: 'brazierHit', brazier: tg.id, fuel: B.fuel }); }
    else { this.village.hp = Math.max(0, this.village.hp - F.dmg * 0.7 * dm * (F.wall || 1)); this.events.push({ t: 'wallHit', hp: this.village.hp, big: !!F.wall }); }
  }

  // ------------------------------------------------------------------ village : chantiers, baies, repas
  // la ruine dont on est devant la porte (ou contre le mur, pour bâtir)
  siteNear(x, z, r = REACH.site) {
    let best = null, bd = r;
    for (const b of this.map.buildings) {
      if (!this.build[b.id] || this.build[b.id].state === 'debout') continue;
      const R = rectOf(b), cx = clamp(x, R.x0, R.x1), cz = clamp(z, R.z0, R.z1), d = Math.hypot(x - cx, z - cz);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  startBuild(id, p) {
    const C = BUILDS[id];
    if (this.stock.bois < C.bois || this.stock.poutre < C.poutre) { this.events.push({ t: 'poor', pid: p.id, site: id }); return false; }
    this.stock.bois -= C.bois; this.stock.poutre -= C.poutre;
    this.build[id] = { state: 'chantier', prog: 0 };
    this.events.push({ t: 'site', pid: p.id, site: id });
    return true;
  }
  finishBuild(id, by) {
    this.build[id] = { state: 'debout', prog: BUILDS[id].work };
    // les nouveaux PV des maisons, pour tout le monde
    for (const q of this.players) { const m = JOBS[q.job].hp + this.hpBonus(); q.hp += m - q.maxHp; q.maxHp = m; }
    this.events.push({ t: 'built', pid: by ? by.id : null, site: id });
    if (this.goal <= 6) { this.setGoal(6); this.setGoal(7); }
    this.saveNow = true;
  }
  bushNear(x, z) {
    let best = null, bd = REACH.gather;
    for (const b of this.map.bushes) { if (!this.berries[b.id].ready) continue; const d = Math.hypot(b.x - x, b.z - z) - 0.5; if (d < bd) { bd = d; best = b; } }
    return best;
  }
  canEat(p) { return !p.carry && p.food < FOOD.max - FOOD.eat * 0.6 && this.stock.nourriture > 0 && Math.hypot(p.x - this.map.depot.x, p.z - this.map.depot.z) < REACH.store; }

  // ce qui reste d'une partie d'un soir à l'autre (sauvegardé à chaque aube par l'hôte)
  saveData() {
    return { v: 1, seed: this.seed, mode: this.mode, diff: this.diff, day: this.clock.day, stock: this.stock, build: this.build, village: this.village,
      braziers: this.braziers.map((b) => b.fuel), trees: this.trees.filter((t) => t.down).map((t) => [t.id, t.dir]), stats: this.stats, goal: this.goal, crypt: this.crypt.open };
  }
  loadSave(s) {
    if (!s || s.v !== 1 || s.seed !== this.seed) return false;
    this.mode = s.mode; this.diff = s.diff;
    this.clock = { day: s.day, phase: 'jour', t: 0, duskSaid: false };
    Object.assign(this.stock, s.stock); this.build = structuredClone(s.build); this.village = { ...s.village };
    s.braziers.forEach((f, i) => { if (this.braziers[i]) this.braziers[i].fuel = f; });
    for (const [id, dir] of s.trees) if (this.trees[id]) { this.trees[id].down = true; this.trees[id].dir = dir; this.trees[id].hp = 0; }
    Object.assign(this.stats, s.stats); this.goal = Math.max(this.goal, s.goal);
    for (const p of this.players) { p.maxHp = JOBS[p.job].hp + this.hpBonus(); p.hp = p.maxHp; }
    if (s.crypt) this.openCrypt();
    return true;
  }

  // ------------------------------------------------------------------ coffres gardés et cloche
  // des clairières dans les bois, entre 28 et 95 m du feu de camp, loin des bâtiments
  sites() {
    if (this.chestSites) return this.chestSites;
    const M = this.map, r = makeRng(this.seed * 7 + 3), out = [];
    for (let k = 0; k < 4000 && out.length < 14; k++) {
      const a = r.range(0, Math.PI * 2), d = r.range(28, 95), x = Math.sin(a) * d, z = M.campfire.z + Math.cos(a) * d;
      if (M.isWater(x, z) || Math.abs(M.riverZ(x) - z) < 6) continue;
      const [cx, cz] = M.collide(x, z, 1.3);
      if (Math.hypot(cx - x, cz - z) > 0.01) continue;
      if (M.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < 12) || Math.hypot(x - M.cryptDoor.x, z - M.cryptDoor.z) < 24) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 22)) continue;
      out.push({ x, z, d });
    }
    out.sort((a, b) => a.d - b.d);
    return (this.chestSites = out);
  }
  // à chaque aube (et au premier matin) : de nouveaux coffres, chacun gardé par des squelettes endormis
  placeChests() {
    const S = this.sites(), day = this.clock.day;
    this.chests = this.chests.filter((c) => !c.open);
    const want = Math.min(S.length, 2 + Math.ceil(this.players.length / 2));
    const kinds = Object.keys(LOOT);
    let tries = 0;
    while (this.chests.length < want && tries++ < 50) {
      // le tout premier coffre est près du village, avec un seul garde : de quoi apprendre à se battre
      const first = day === 1 && this.chests.length === 0;
      const site = first ? S[0] : S[this.rng.int(1, S.length - 1)];
      if (!site || this.chests.some((c) => c.site === S.indexOf(site))) continue;
      const loot = first ? 'bois' : kinds[this.rng.int(0, kinds.length - 1)];
      const c = { id: this.nextChest++, site: S.indexOf(site), x: site.x, z: site.z, rot: this.rng.range(0, Math.PI * 2), loot, open: false };
      this.chests.push(c);
      const n = first ? 1 : Math.min(4, 1 + Math.ceil(day / 3) + (this.players.length > 2 ? 1 : 0));
      for (let i = 0; i < n; i++) {
        const a = c.rot + i * (Math.PI * 2 / n) + 0.4, kind = !first && (i === 1 || day >= 6 && i === 2) ? 'warrior' : 'minion';
        const f = this.spawnFoeAt(kind, c.x + Math.sin(a) * 2.6, c.z + Math.cos(a) * 2.6, true);
        f.state = 'sleep'; f.guard = c.id; f.home = [f.x, f.z]; f.yaw = a;
      }
    }
  }
  chestNear(x, z) { for (const c of this.chests) if (!c.open && Math.hypot(c.x - x, c.z - z) < CHEST.r + 0.6) return c; return null; }
  guardWakes(f) {
    const c = this.chests.find((o) => o.id === f.guard);
    if (!c || c.open) return true;
    return this.players.some((p) => !p.down && !p.dead && Math.hypot(p.x - c.x, p.z - c.z) < CHEST.wake);
  }
  // un garde défend son coffre et n'en va pas trop loin
  guardTarget(f) {
    const c = this.chests.find((o) => o.id === f.guard);
    const cx = c ? c.x : f.home[0], cz = c ? c.z : f.home[1];
    let best = null, bd = CHEST.leash;
    for (const p of this.players) { if (p.down || p.dead) continue; const d = Math.hypot(p.x - cx, p.z - cz); if (d < bd) { bd = d; best = { type: 'p', id: p.id }; } }
    return best || { type: 'home', x: f.home[0], z: f.home[1] };
  }
  openChest(p, id) {
    const c = this.chests.find((o) => o.id === id);
    if (!c || c.open) return;
    c.open = true; const S = this.stock;
    if (c.loot === 'bois') S.bois += 5;
    else if (c.loot === 'vivres') S.nourriture += 5;
    else if (c.loot === 'poutre') S.poutre += 2;
    else if (c.loot === 'huile') for (const b of this.braziers) b.fuel = FUEL.max;
    else if (c.loot === 'elixir') for (const o of this.players) { if (o.dead) continue; if (o.down) { o.down = false; o.revive = 0; } o.hp = o.maxHp; o.cd = 0; }
    this.stats.chests = (this.stats.chests || 0) + 1;
    this.events.push({ t: 'chest', pid: p.id, chest: c.id, loot: c.loot, x: c.x, z: c.z });
    // les gardes encore couchés se lèvent
    for (const f of this.foes) if (f.guard === c.id && f.state === 'sleep') { f.state = 'awaken'; f.t = 0; }
  }
  // la cloche du feu de camp : on appelle la nuit tout de suite
  canRing(p) {
    const c = this.map.campfire;
    return this.clock.phase === 'jour' && this.goal >= 4 && !this.crypt.open && this.clock.t < this.dayLen - CYCLE.dusk && Math.hypot(p.x - c.x, p.z - c.z) < 2.6;
  }
  ring(p) { this.skipToDusk(); this.events.push({ t: 'bell', pid: p.id }); }

  // ------------------------------------------------------------------ la crypte
  alive() { return this.players.filter((p) => !p.dead); }
  teleport(p, x, z, yaw) { p.x = x; p.z = z; p.y = this.map.heightAt(x, z); p.yaw = yaw; p.vy = 0; p.ground = true; }
  torchNear(x, z) {
    if (!this.crypt.torches) return null;
    for (const t of this.map.crypt.torches) if (!this.torchLit(t.id) && Math.hypot(t.x - x, t.z - z) < 2.4) return t;
    return null;
  }
  openCrypt() {
    const C = this.crypt;
    if (C.open) return;
    C.open = true; C.torches = this.map.crypt.torches.map(() => true);
    this.cryptSnap = null;
    this.events.push({ t: 'crypt' });
    this.setGoal(GOALS.findIndex((g) => g.id === 'crypt'));
    this.saveNow = true;
  }
  // la herse, la brume du couloir, le trône et le Roi
  stepCrypt() {
    const C = this.crypt, K = this.map.crypt;
    if (!C.open) return;
    // le premier qui descend : on garde de quoi rejouer la crypte
    if (!this.cryptSnap && this.players.some((p) => this.inCrypt(p.x, p.z))) { this.cryptSnap = this.snapshot(); this.setGoal(GOALS.findIndex((g) => g.id === 'king')); }
    if (!C.gate) {
      const held = K.levers.map((l) => this.players.some((p) => p.lever === l.id));
      C.held = held;
      const ok = held.every(Boolean) || (this.alive().length < 2 && held.some(Boolean));
      C.leverT = ok ? C.leverT + DT : Math.max(0, C.leverT - DT * 2);
      if (C.leverT >= LEVER_T) { C.gate = true; K.gate.open = true; this.events.push({ t: 'gate' }); }
    }
    const inside = (z) => this.players.some((p) => !p.dead && inZone(z, p.x, p.z));
    if (C.gate && !C.brume && inside(K.halls.brume)) {
      C.brume = true; this.events.push({ t: 'brumeCrypt' });
      // autant de morts que l'équipe peut en tenir, répartis le long du couloir
      const n = Math.round((1 + 2 * this.alive().length) * this.D.count), cells = K.brumeCells;
      for (let i = 0; i < n; i++) { const c = cells[Math.floor((i + 0.5) / n * cells.length)]; const f = this.spawnFoeAt(i % 4 === 3 ? 'warrior' : 'minion', c.x + this.rng.range(-0.5, 0.5), c.z); if (f) f.yaw = 0; }
    }
    if (C.gate && !C.throne && inside(K.halls.trone)) {
      C.throne = true;
      const k = this.spawnFoeAt('king', K.king.x, K.king.z);
      const team = Math.min(1.8, 0.45 + 0.25 * this.alive().length);
      k.hp = k.maxHp = Math.round(FOES.king.hp * team * this.D.count); k.yaw = Math.PI;
      C.king = k.id; C.phase = 1; C.summonAt = this.t + 8;
      this.events.push({ t: 'king' });
    }
    const king = C.king !== null && this.foe(C.king);
    if (king && king.state !== 'dead') {
      const r = king.hp / king.maxHp;
      const phase = r < 0.3 ? 3 : r < 0.6 ? 2 : 1;
      if (phase > C.phase) {
        C.phase = phase; this.events.push({ t: 'kingPhase', phase });
        // troisième phase : il souffle les torches du trône et devient furieux
        if (phase === 3) { K.torches.forEach((t) => { if (t.throne) C.torches[t.id] = false; }); king.enrage = true; }
      }
      if (this.t >= C.summonAt && king.state !== 'awaken') {
        const n = (phase === 1 ? 1 : 2) + (this.alive().length > 2 ? 1 : 0);
        for (let i = 0; i < n; i++) { const a = this.rng.range(0, Math.PI * 2); this.spawnFoeAt(i === 2 ? 'warrior' : 'minion', king.x + Math.sin(a) * 3.5, king.z + Math.cos(a) * 3.5); }
        C.summonAt = this.t + (phase === 1 ? 14 : phase === 2 ? 11 : 9);
        this.events.push({ t: 'summon', foe: king.id, x: king.x, z: king.z });
      }
    }
  }
  spawnFoeAt(kind, x, z, quiet) {
    [x, z] = this.map.collide(x, z, 0.4, this.fallen);
    const F = FOES[kind];
    const f = { id: this.nextFoe++, kind, x, z, y: this.map.heightAt(x, z), yaw: 0, hp: F.hp, maxHp: F.hp, state: 'awaken', t: 0, rises: 0, stun: 0, tgt: null, path: null, pathAt: -9, pathTo: null, atkT: 0, stuck: 0 };
    this.foes.push(f);
    if (!quiet) this.events.push({ t: 'spawn', foe: f.id, kind, x, z });
    return f;
  }

  // ------------------------------------------------------------------ capacités des métiers (F)
  ability(p) {
    const J = jobOf(p), A = ABILITY[J.ab];
    if (J.ab === 'grandcoup') {
      // un coup circulaire devant soi : tout ce qui est près recule, sonné
      for (const f of this.foes) {
        if (f.state === 'dead' || f.state === 'rise') continue;
        const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz);
        if (d > A.r || Math.abs(wrap(Math.atan2(dx, dz) - p.yaw)) > 1.0) continue;
        f.hp -= A.dmg * this.dmgMul(); f.stun = A.stun;
        [f.x, f.z] = this.map.collide(f.x + dx / (d || 1) * 1.6, f.z + dz / (d || 1) * 1.6, 0.4, this.fallen);
        this.events.push({ t: 'strike', pid: p.id, foe: f.id, x: f.x, z: f.z });
        if (f.hp <= 0) this.killFoe(f, p);
      }
    } else if (J.ab === 'rempart') {
      p.guardT = A.dur;
      for (const f of this.foes) if (f.state !== 'dead' && Math.hypot(f.x - p.x, f.z - p.z) < A.r) f.tgt = { type: 'p', id: p.id };
    } else if (J.ab === 'fusee') {
      const x = p.x + Math.sin(p.yaw) * A.dist, z = p.z + Math.cos(p.yaw) * A.dist;
      this.flares.push({ x, z, until: this.t + A.dur });
    } else if (J.ab === 'priere') {
      for (const o of this.players) {
        if (o.dead || Math.hypot(o.x - p.x, o.z - p.z) > A.r) continue;
        if (o.down) o.revive += A.revive; else o.hp = Math.min(o.maxHp, o.hp + A.heal);
      }
    } else if (J.ab === 'barricade') {
      let x = p.x + Math.sin(p.yaw) * 1.7, z = p.z + Math.cos(p.yaw) * 1.7;
      [x, z] = this.map.collide(x, z, A.r, this.fallen);
      this.bars.push({ id: this.nextBar++, x, z, rot: p.yaw, hp: A.hp, until: this.t + A.dur });
    }
    this.events.push({ t: 'abilityHit', pid: p.id, ab: J.ab, x: p.x, z: p.z });
  }
  // les barricades bloquent le passage
  pushBars(x, z, r) {
    for (const b of this.bars) { const R = ABILITY.barricade.r + r, dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz); if (d < R && d > 1e-6) { x = b.x + dx / d * R; z = b.z + dz / d * R; } }
    return [x, z];
  }

  // ------------------------------------------------------------------ poutres
  // les deux bouts d'une poutre
  beamEnds(b) { const h = BEAM.len / 2, sx = Math.sin(b.rot) * h, sz = Math.cos(b.rot) * h; return [[b.x - sx, b.z - sz], [b.x + sx, b.z + sz]]; }
  beamEndNear(x, z) {
    let best = null;
    for (const b of this.beams) {
      if (!b.ready || b.lifted) continue;
      this.beamEnds(b).forEach(([ex, ez], k) => { if (b.h[k] !== null) return; const d = Math.hypot(ex - x, ez - z); if (d < BEAM.grab && (!best || d < best.d)) best = { beam: b, end: k, d }; });
    }
    return best;
  }
  grab(p, b, end) {
    b.h[end] = p.id; p.carry = 'poutre'; p.beam = b.id; p.end = end;
    const [ex, ez] = this.beamEnds(b)[end]; p.yaw = Math.atan2(b.x - ex, b.z - ez);
    this.events.push({ t: 'grab', pid: p.id, beam: b.id });
    this.liftCheck(b);
  }
  liftCheck(b) {
    const hs = b.h.filter((id) => id !== null).map((id) => this.player(id));
    const was = b.lifted;
    b.lifted = hs.length === 2 || (hs.length === 1 && !!jobOf(hs[0]).beamAlone);
    if (b.lifted && !was) this.events.push({ t: 'lift', beam: b.id });
  }
  letGo(p) {
    const b = this.beams.find((o) => o.id === p.beam);
    p.carry = null; p.beam = null;
    if (!b) return;
    b.h = b.h.map((id) => (id === p.id ? null : id));
    const wasUp = b.lifted;
    this.liftCheck(b);
    if (wasUp && !b.lifted) {
      // la poutre retombe : l'autre garde son bout en main
      [b.x, b.z] = this.map.collide(b.x, b.z, 0.5, this.fallen); b.y = this.map.heightAt(b.x, b.z);
      this.events.push({ t: 'beamDrop', beam: b.id });
    }
  }
  storeBeam(b, by) {
    for (const id of b.h) { const o = this.player(id); if (o) { o.carry = null; o.beam = null; } }
    this.beams = this.beams.filter((o) => o !== b);
    this.stock.poutre++;
    this.events.push({ t: 'storeBeam', pid: by.id, n: this.stock.poutre });
  }
  beamSpeed(p) {
    const b = this.beams.find((o) => o.id === p.beam);
    if (!b || !b.lifted) return 0.9;   // on ne peut que tirer un peu sur son bout
    return b.h.filter((id) => id !== null).length === 2 ? BEAM.speed : BEAM.alone;
  }
  // après le déplacement des joueurs : la poutre suit ses porteurs, qui restent à bonne distance l'un de l'autre
  stepBeams() {
    for (const b of this.beams) {
      const hs = b.h.map((id) => (id === null ? null : this.player(id)));
      for (let k = 0; k < 2; k++) if (b.h[k] !== null && (!hs[k] || hs[k].carry !== 'poutre' || hs[k].beam !== b.id)) { b.h[k] = null; this.liftCheck(b); }
      const H = b.h.map((id) => (id === null ? null : this.player(id)));
      if (!b.lifted) {
        // un seul porteur qui ne peut pas la soulever : il reste à son bout
        for (let k = 0; k < 2; k++) { const p = H[k]; if (!p) continue; const [ex, ez] = this.beamEnds(b)[k], d = Math.hypot(p.x - ex, p.z - ez); if (d > 0.9) { p.x = ex + (p.x - ex) / d * 0.9; p.z = ez + (p.z - ez) / d * 0.9; } }
        continue;
      }
      if (H[0] && H[1]) {
        const a = H[0], c = H[1], dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz) || 1e-3, k = (d - BEAM.len) / 2 / d;
        a.x += dx * k; a.z += dz * k; c.x -= dx * k; c.z -= dz * k;
        [a.x, a.z] = this.map.collide(a.x, a.z, P_R, this.fallen); [c.x, c.z] = this.map.collide(c.x, c.z, P_R, this.fallen);
        b.x = (a.x + c.x) / 2; b.z = (a.z + c.z) / 2; b.rot = Math.atan2(c.x - a.x, c.z - a.z);
        b.y = (a.y + c.y) / 2 + 1.15;
      } else {
        const p = H[0] || H[1];
        b.x = p.x; b.z = p.z; b.rot = p.yaw; b.y = p.y + 1.35;
      }
    }
  }

  // ------------------------------------------------------------------ pour l'écran
  // ce que E (ou le clic) ferait maintenant
  prompt(id) {
    const p = this.player(id), M = this.map;
    if (!p || p.act || p.down || p.dead) return null;
    const mate = this.players.find((o) => o !== p && o.down && Math.hypot(o.x - p.x, o.z - p.z) < REACH.revive + 0.4);
    if (mate && p.carry !== 'poutre') return { key: 'E', hold: true, text: `Relever ${mate.name} (tenir E)`, hp: mate.revive / HP.revive };
    if (p.carry === 'poutre') {
      const b = this.beams.find((o) => o.id === p.beam);
      if (!b) return null;
      if (!b.lifted) return { key: 'E', text: 'Il faut quelqu\'un à l\'autre bout (E pour lâcher)' };
      if (Math.hypot(b.x - M.depot.x, b.z - M.depot.z) < BEAM.store) return { key: 'E', text: 'Ranger la poutre dans l\'entrepôt' };
      return { key: 'E', text: 'Poser la poutre' };
    }
    if (p.carry) {
      if (p.carry === 'bois' && jobOf(p).repair && this.village.hp < WAREHOUSE_HP - 20 && Math.hypot(p.x - M.depot.x, p.z - M.depot.z) < REACH.store) return { key: 'E', text: 'Réparer l\'entrepôt avec la bûche', hp: this.village.hp / WAREHOUSE_HP };
      const b = this.brazierNear(p.x, p.z, REACH.feed);
      if (b && p.carry === 'bois' && this.braziers[b.id].fuel < FUEL.max - 5) return { key: 'E', text: 'Mettre la bûche dans le brasero', hp: this.braziers[b.id].fuel / FUEL.max };
      const k = p.load || 1;
      if (Math.hypot(p.x - M.depot.x, p.z - M.depot.z) < REACH.store) return { key: 'E', text: p.carry === 'vivres' ? 'Ranger les baies dans l\'entrepôt' : k > 1 ? `Ranger les ${k} bûches dans l\'entrepôt` : 'Ranger la bûche dans l\'entrepôt' };
      if (p.carry === 'bois' && k < LOAD_MAX && this.logNear(p.x, p.z, REACH.pick)) return { key: 'E', text: `Ramasser une autre bûche (${k + 1}/${LOAD_MAX})` };
      return p.carry === 'vivres' ? { key: '', text: 'Rapporte les baies à l\'entrepôt' } : { key: 'E', text: k > 1 ? `Poser une bûche (${k} portées)` : 'Poser la bûche' };
    }
    if (this.foeNear(p.x, p.z, REACH.strike + 0.4)) return { key: 'Clic', text: 'Frapper' };
    if (this.crypt.open && Math.hypot(p.x - M.cryptDoor.x, p.z - M.cryptDoor.z) < 3) return { key: 'E', text: 'Descendre dans la crypte' };
    if (this.inCrypt(p.x, p.z) && Math.hypot(p.x - M.crypt.spawn.x, p.z - M.crypt.spawn.z) < 1.4) return { key: 'E', text: 'Remonter au château' };
    if (this.crypt.open && !this.crypt.gate) for (const l of M.crypt.levers) if (Math.hypot(l.x - p.x, l.z - p.z) < 1.6) {
      const other = this.players.find((o) => o !== p && o.lever >= 0 && o.lever !== l.id);
      return { key: 'E', hold: true, text: this.alive().length < 2 ? 'Tenir le levier (E)' : other ? `Tenir le levier : ${other.name} tient l'autre !` : 'Tenir le levier (E) : il faut quelqu\'un à l\'autre', hp: this.crypt.leverT / LEVER_T };
    }
    const torch = this.torchNear(p.x, p.z);
    if (torch) return { key: 'E', text: 'Rallumer la torche' };
    const ch = this.chestNear(p.x, p.z);
    if (ch) return { key: 'E', text: 'Ouvrir le coffre' };
    if (this.canRing(p)) return { key: 'E', text: 'Sonner la cloche : la nuit tombe tout de suite' };
    const be = this.beamEndNear(p.x, p.z);
    if (be) { const other = be.beam.h[1 - be.end]; return { key: 'E', text: other !== null ? `Soulever la poutre avec ${this.player(other)?.name || 'ton équipier'}` : jobOf(p).beamAlone ? 'Prendre la poutre (seul, lentement)' : 'Prendre un bout de la poutre (il faut être deux)' }; }
    if (this.logNear(p.x, p.z, REACH.pick)) return { key: 'E', text: 'Ramasser la bûche' };
    if (this.canEat(p)) return { key: 'E', text: `Manger (${this.stock.nourriture} vivre${this.stock.nourriture > 1 ? 's' : ''} à l'entrepôt)`, hp: p.food / FOOD.max };
    if (this.canTake(p)) return { key: 'E', text: `Prendre une bûche à l'entrepôt (${this.stock.bois})` };
    const bush = this.bushNear(p.x, p.z);
    if (bush) return { key: 'E', text: 'Cueillir des baies' };
    const site = this.siteNear(p.x, p.z);
    let info = null;
    if (site) {
      const B = this.build[site.id], C = BUILDS[site.id];
      if (B.state === 'chantier') return { key: 'Clic', text: `${site.name} en chantier : frappe pour bâtir`, hp: B.prog / C.work };
      const cost = `${C.bois} bois, ${C.poutre} poutre${C.poutre > 1 ? 's' : ''}`;
      const miss = [this.stock.bois < C.bois ? `${C.bois - this.stock.bois} bois` : '', this.stock.poutre < C.poutre ? `${C.poutre - this.stock.poutre} poutre${C.poutre - this.stock.poutre > 1 ? 's' : ''}` : ''].filter(Boolean);
      if (!miss.length) return { key: 'E', text: `Relever : ${site.name} (${cost})` };
      info = { key: '', text: `${site.name} (${cost}) : il manque ${miss.join(' et ')}` };
    }
    const t = M.treeNear(p.x, p.z, REACH.chop + 0.6, this.fallen);
    if (t) return { key: 'Clic', text: 'Couper l\'arbre', hp: this.trees[t.id].hp / TREE_HP };
    if (info) return info;
    const b = this.brazierNear(p.x, p.z, REACH.feed);
    if (b) return { key: '', text: `Brasero : ${Math.round(this.braziers[b.id].fuel)} s de feu (apporte une bûche)`, hp: this.braziers[b.id].fuel / FUEL.max };
    return null;
  }
  takeEvents() { const e = this.events; this.events = []; return e; }

  // état complet (sans la carte), pour rejouer une nuit ; plus tard pour le réseau
  snapshot() {
    return structuredClone({ t: this.t, tick: this.tick, clock: this.clock, stock: this.stock, trees: this.trees, logs: this.logs, nextLog: this.nextLog,
      braziers: this.braziers, village: this.village, beams: this.beams, nextBeam: this.nextBeam, foes: this.foes.map((f) => ({ ...f, path: null })), nextFoe: this.nextFoe, spawnQ: this.spawnQ, goal: this.goal, stats: this.stats,
      build: this.build, berries: this.berries, mode: this.mode, diff: this.diff, won: this.won, crypt: this.crypt, flares: this.flares, bars: this.bars, nextBar: this.nextBar, chests: this.chests, nextChest: this.nextChest,
      players: this.players.map((p) => ({ ...p, ai: null })) });
  }
  restore(s) {
    const c = structuredClone(s);
    Object.assign(this, c);
    this.over = null; this.events = []; this.inputs = new Map();   // lastC est gardé : les compteurs d'appuis continuent
    if (!this.chests) { this.chests = []; this.nextChest = 1; }
    if (!this.crypt) this.crypt = { open: false, gate: false, leverT: 0, held: [false, false], brume: false, throne: false, king: null, phase: 0, summonAt: 0, torches: null };
    this.map.crypt.gate.open = !!this.crypt.gate;
  }
}
