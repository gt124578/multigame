// odyssee/js/core/battle.js — moteur de combat 1v1, Double (2v2) et Triple (3v3), sans DOM.
// Le moteur calcule un tour d'un coup et renvoie une liste d'événements que la vue rejoue (textes, PV, animations).
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { monName, gainExp, gainEffort, isFainted, expProgress } from './mon.js';
import { RESIST, SOIN, STAT_BAIE } from '../data/baies-objets.js';
import { ITEMS, itemName, applyItem, estSoin } from './items.js';
import { ABILITIES, getAbility } from '../data/abilities.js';
import { megaFormOf, megaEvolve, revertMegas } from './mega.js';
import { STAGE_NAMES, SOUND_MOVES, POWDER_MOVES, VANISH_MOVES, BULLET_MOVES, typeEff, hiddenPower, freshVol, nomDresseur } from './battle-helpers.js';
import { foeThreatInfo, foePickBestReplacement, foeConsiderSwitch, foeChooseAll, foeChooseSlot, damagePreview, estimate } from './battle-ai.js';

export { STAGE_NAMES, typeEff, hiddenPower } from './battle-helpers.js';

const STATUS_TXT = { par: 'est paralysé ! Il aura du mal à attaquer !', slp: 's\'est endormi !', frz: 'est gelé !', brn: 'est brûlé !', psn: 'est empoisonné !', tox: 'est gravement empoisonné !' };
const TYPE_FR_MSG = { normal: 'Normal', fighting: 'Combat', flying: 'Vol', poison: 'Poison', ground: 'Sol', rock: 'Roche', bug: 'Insecte', ghost: 'Spectre', steel: 'Acier', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', psychic: 'Psy', ice: 'Glace', dragon: 'Dragon', dark: 'Ténèbres', fairy: 'Fée' };
const NON_CONTACT_PHYS = new Set([
  'poison-sting', 'twineedle', 'pin-missile', 'razor-leaf', 'rock-throw', 'earthquake', 'fissure', 'self-destruct',
  'egg-bomb', 'bone-club', 'spike-cannon', 'barrage', 'sky-attack', 'explosion', 'bonemerang', 'rock-slide',
  'bone-rush', 'sacred-fire', 'magnitude', 'rock-tomb', 'sand-tomb', 'bullet-seed', 'icicle-spear', 'rock-blast',
  'seed-bomb', 'ice-shard', 'psycho-cut', 'rock-wrecker', 'gunk-shot', 'magnet-bomb', 'stone-edge', 'attack-order',
  'smack-down', 'bulldoze', 'gear-grind', 'icicle-crash', 'fusion-bolt', 'flying-press', 'petal-blizzard', 'diamond-storm',
]);
const SPECIAL_CONTACT = new Set(['petal-dance', 'draining-kiss']);
const isContact = (mv) => !!mv && ((mv.c === 'physical' && !NON_CONTACT_PHYS.has(mv.key)) || SPECIAL_CONTACT.has(mv.key));
const PULSE_MOVES = new Set(['water-pulse', 'dark-pulse', 'dragon-pulse', 'aura-sphere', 'heal-pulse']);
const BITE_MOVES = new Set(['bite', 'crunch', 'fire-fang', 'ice-fang', 'thunder-fang', 'poison-fang', 'hyper-fang']);
const SLICE_MOVES = new Set([
  'cut', 'razor-leaf', 'slash', 'fury-cutter', 'air-cutter', 'aerial-ace', 'leaf-blade', 'night-slash',
  'air-slash', 'x-scissor', 'psycho-cut', 'cross-poison', 'sacred-sword', 'razor-shell',
]);
const IGNORES_ABILITY = new Set(['mold-breaker', 'turboblaze', 'teravolt']);
const UNTRACEABLE = new Set(['trace', 'multitype', 'illusion', 'imposter', 'stance-change', 'zen-mode', 'forecast', 'flower-gift', 'tera-shift']);
const isSheerForceMove = (mv) => {
  const x = mv?.m;
  if (!mv || mv.c === 'status' || !x) return false;
  if (x.flinch || x.ailc) return true;
  if (x.stc && x.st?.length) {
    if (x.cat === 7 && x.st.some(([, c]) => c < 0)) return false;
    return true;
  }
  return false;
};

const stageMul = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
const accMul = (s) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s));
const refKey = (r) => `${r.side}:${r.slot}`;

function initSide(name, party, slots, extra) {
  const activeSlots = Array(slots).fill(-1);
  let k = 0;
  for (let i = 0; i < party.length && k < slots; i++) if (party[i] && party[i].hp > 0) activeSlots[k++] = i;
  if (activeSlots[0] < 0) activeSlots[0] = Math.max(0, party.findIndex((m) => m && m.hp > 0));
  const vs = Array.from({ length: slots }, freshVol);
  const s = { name, party, activeSlots, vs, screens: {}, ...extra };
  // rétro-compatibilité 1v1 : sides[i].active et sides[i].v pointent vers le premier emplacement
  Object.defineProperty(s, 'active', { get: () => s.activeSlots[0], set: (v) => { s.activeSlots[0] = v; }, configurable: true, enumerable: true });
  Object.defineProperty(s, 'v', { get: () => s.vs[0], set: (v) => { s.vs[0] = v; }, configurable: true, enumerable: true });
  return s;
}

export class Battle {
  /**
   * @param o.player { name, party, bag }   bag = { item: qté } (modifié par le combat)
   * @param o.foe    { name, party, trainer?: { cls, name, prize, items: {item:qté}, ai } }
   * @param o.format 'single' | 'double' | 'triple' | 'quadruple' | 1 | 2 | 3 | 4 (ou o.slots)
   */
  constructor(o) {
    this.rng = o.rng || Math.random;
    this.wild = !o.foe.trainer;
    const rawSlots = o.slots ?? (o.format === 'quadruple' || o.format === 4 ? 4 : o.format === 'triple' || o.format === '3v3' || o.format === 3 ? 3 : o.format === 'double' || o.format === '2v2' || o.format === 2 ? 2 : 1);
    // 4 emplacements : seulement pour les raids (quatre joueurs contre un boss)
    this.slots = Math.max(1, Math.min(4, rawSlots | 0));
    this.format = this.slots === 4 ? 'quadruple' : this.slots === 3 ? 'triple' : this.slots === 2 ? 'double' : 'single';
    this.sides = [
      initSide(o.player.name, o.player.party, this.slots, { player: true, mega: !!o.player.mega }),
      initSide(o.foe.name, o.foe.party, this.slots, { trainer: o.foe.trainer || null, mega: !!o.foe.trainer?.mega }),
    ];
    this.bag = o.player.bag || {};
    this.participants = new Set();
    this.runTries = 0;
    this.state = 'choose';
    this.result = null;
    this.ev = [];
    this.turn = 0;
    this.cap = o.cap || 100;
    this.dex = o.dex || null;
    this.prizeMoney = 0;
    this.levelUps = new Set();
    this.weather = o.weather || 'none';
    this.weatherTurns = o.weatherTurns || 0;
    this.terrain = o.terrain || 'none';
    this.terrainTurns = o.terrainTurns || 0;
    this.gymCrisisTriggered = false;
    this.baseWeather = this.weather; this.baseWeatherTurns = this.weatherTurns;
    this.inverse = !!o.inverse;
    this.chaosWeather = !!o.chaosWeather;
    this.alpha = !!o.alpha;
    this.sansSoins = !!o.sansSoins;   // ni objets de soin
    this.sansFuite = !!o.sansFuite;   // dans une faille, on ne fuit pas (ni Fuite, ni Téléport, ni Hurlement)
    this.aura = o.aura || (this.alpha ? 'rouge' : null);
    this.clutchUids = new Set();
    this.needPlayerSlots = [];
    this.pendingFoeSlots = [];
    this.caughtMon = null;
    for (const s of this.sides) for (const m of s.party) delete m._ko;
  }

  norm(ref) { return typeof ref === 'number' ? { side: ref, slot: 0 } : ref; }
  get me() { return this.monAt(0, 0) || this.sides[0].party.find((_, i) => this.sides[0].activeSlots.includes(i)) || this.sides[0].party[0]; }
  get foe() { return this.monAt(1, 0) || this.sides[1].party.find((_, i) => this.sides[1].activeSlots.includes(i)) || this.sides[1].party[0]; }
  monAt(side, slot = 0) { const idx = this.sides[side]?.activeSlots?.[slot]; return idx != null && idx >= 0 ? this.sides[side].party[idx] || null : null; }
  act(ref, slotArg) { const r = typeof ref === 'number' ? { side: ref, slot: slotArg ?? 0 } : ref; return this.monAt(r.side, r.slot); }
  vol(ref) { const r = this.norm(ref); return this.sides[r.side].vs[r.slot]; }
  aliveSlots(side) {
    const out = [];
    for (let sl = 0; sl < this.slots; sl++) { const m = this.monAt(side, sl); if (m && !isFainted(m)) out.push(sl); }
    return out;
  }
  allAliveRefs() {
    const out = [];
    const order = this.eotOrder ? this.eotOrder() : [0, 1];
    for (const side of order) for (const slot of this.aliveSlots(side)) out.push({ side, slot });
    return out;
  }
  /** trie des références / actions par priorité (optionnelle), Vive Griffe, Vitesse et bris d'égalité déterministe sans appeler rng() dans TimSort */
  sortBySpeed(list, prioFn = null) {
    const order = this.eotOrder ? this.eotOrder() : [0, 1];
    const items = [...list].sort((a, b) => order.indexOf(a.side ?? a.i) - order.indexOf(b.side ?? b.i) || (a.slot ?? 0) - (b.slot ?? 0));
    if (this.slots > 1 || this.pvp) {
      for (const r of items) r._tie = this.rng();
    }
    return items.sort((p, q) => {
      const dp = prioFn ? prioFn(q) - prioFn(p) : 0;
      if (dp) return dp;
      const gq = q.griffe ? 1 : 0, gp = p.griffe ? 1 : 0;
      if (gq !== gp) return gq - gp;
      const ds = this.stat(q, 5) - this.stat(p, 5);
      if (ds) return ds;
      return (q._tie != null && p._tie != null) ? (q._tie - p._tie) : this.tie(p, q);
    });
  }
  isAdjacent(a, b) { return this.slots < 3 || Math.abs(a.slot - b.slot) <= 1; }
  isLongRange(mv) {
    if (this.slots < 3 || !mv) return true;
    return mv.c === 'special' || mv.t === 'flying' || /pulse|aura|beam|ray|laser|thunder|psychic|shadow-ball|focus-blast|aerial-ace|bounce|fly/.test(mv.key || '');
  }
  validFoeTargets(attRef, mv) {
    const opp = 1 - attRef.side, alive = this.aliveSlots(opp);
    if (!alive.length) return [];
    if (this.slots < 3 || this.isLongRange(mv) || mv?.tg === 11) return alive.map((slot) => ({ side: opp, slot }));
    const adj = alive.filter((slot) => Math.abs(attRef.slot - slot) <= 1);
    return (adj.length ? adj : alive).map((slot) => ({ side: opp, slot }));
  }
  validAllyTargets(attRef) {
    const alive = this.aliveSlots(attRef.side).filter((sl) => sl !== attRef.slot);
    if (this.slots < 3) return alive.map((slot) => ({ side: attRef.side, slot }));
    const adj = alive.filter((sl) => Math.abs(attRef.slot - sl) <= 1);
    return (adj.length ? adj : alive).map((slot) => ({ side: attRef.side, slot }));
  }

  /** crans de stats : en 1v1 renvoie [st0, st1] pour compatibilité ; `allStages()` renvoie tous les emplacements */
  stages() { return this.sides.map((x) => x.vs[0].st.slice()); }
  allStages() { return this.sides.map((x) => x.vs.map((v) => v.st.slice())); }
  ab(ref) {
    const r = this.norm(ref), m = this.act(r);
    if (!m || isFainted(m)) return null;
    return this.vol(r)?.ability || getAbility(m)?.id || null;
  }
  abName(ref) { const id = this.ab(ref); return id ? (ABILITIES[id]?.name || id) : 'Talent'; }
  ignoresDefAbility(aRef) { return IGNORES_ABILITY.has(this.ab(aRef)); }
  defAb(aRef, dRef) { return this.ignoresDefAbility(aRef) ? null : this.ab(dRef); }
  hasOppAbility(ref, id) {
    const r = this.norm(ref), opp = 1 - r.side;
    return this.aliveSlots(opp).some((sl) => this.ab({ side: opp, slot: sl }) === id);
  }
  hasFieldAbility(id) { return this.allAliveRefs().some((r) => this.ab(r) === id); }
  typesOf(ref) {
    const r = this.norm(ref), m = this.act(r);
    if (!m) return ['normal'];
    return this.vol(r)?.types || SPECIES[m.sp]?.t || ['normal'];
  }
  isGrounded(ref) {
    const types = this.typesOf(ref), id = this.ab(ref);
    return !types.includes('flying') && id !== 'levitate' && id !== 'eelevate';
  }
  effOn(a, d, type) {
    let t = this.typesOf(d);
    if (!this.inverse && this.ab(a) === 'scrappy' && (type === 'normal' || type === 'fighting')) t = t.filter((x) => x !== 'ghost');
    return typeEff(type, t, this.inverse);
  }
  r(n) { return Math.floor(this.rng() * n); }
  tie() { return this.rng() < 0.5 ? -1 : 1; }
  say(text) { this.ev.push({ t: 'msg', text }); }
  nm(ref) {
    const r = this.norm(ref), m = this.act(r);
    if (!m) return 'Pokémon';
    return r.side === 1 ? (this.wild ? `${monName(m)} sauvage` : `${monName(m)} ennemi`) : monName(m);
  }
  Nm(ref) { const s = this.nm(ref); return s[0].toUpperCase() + s.slice(1); }

  setWeather(w, turns = 5) {
    if (this.weather === w && turns === this.weatherTurns) return;
    this.weather = w; this.weatherTurns = turns;
    const txt = {
      rain: 'Une pluie battante commence à tomber !',
      sun: 'Le soleil commence à briller intensément !',
      sandstorm: 'Une tempête de sable se lève !',
      hail: 'Une averse de grêle commence à tomber !',
      none: 'Le temps redevient normal.',
    }[w] || '';
    if (txt) this.say(txt);
    this.ev.push({ t: 'weather', weather: w, turns });
  }

  setTerrain(t, turns = 5) {
    if (this.terrain === t && turns === this.terrainTurns) return;
    this.terrain = t; this.terrainTurns = turns;
    if (t === 'electric') this.say('Un champ électrifié se répand sur le terrain !');
    else if (t === 'none') this.say('Le champ électrifié se dissipe.');
  }

  triggerEntry(ref) {
    const r = this.norm(ref), m = this.act(r), v = this.vol(r);
    if (!m || isFainted(m)) return;
    const abId = this.ab(r);
    if (!abId) return;
    const foes = this.validFoeTargets(r, null);
    if (abId === 'trace') {
      const src = foes.find((f) => { const fid = this.ab(f); return fid && !UNTRACEABLE.has(fid); });
      if (src) {
        const copied = this.ab(src);
        v.ability = copied;
        this.say(`${this.Nm(r)} calque le talent ${ABILITIES[copied]?.name || copied} de ${this.nm(src)} !`);
        this.triggerEntry(r);
      }
      return;
    }
    if (abId === 'intimidate') {
      if (foes.length) {
        this.say(`Le talent Intimidation de ${this.nm(r)} s'active !`);
        for (const f of foes) this.boost(f, 2, -1, true, r);
      }
    } else if (abId === 'halo-sylvestre') {
      if (this.sides[1].trainer?.friendly) return;
      if (foes.length) {
        this.say(`Le Halo Sylvestre de ${this.nm(r)} rayonne doucement !`);
        for (const f of foes) this.boost(f, 4, -1, true, r);
      }
    } else if (abId === 'coeur-vaillant') {
      if (this.sides[1].trainer?.friendly) return;
      if ((this.coeurUsed ||= new Set()).has(m.uid)) return;
      this.coeurUsed.add(m.uid);
      this.say(`Le Cœur Vaillant de ${this.nm(r)} s'enflamme de bravoure !`);
      this.boost(r, 2, 1, true, r);
    } else if (abId === 'drizzle') {
      this.say(`Le talent Crachin de ${this.nm(r)} fait tomber la pluie !`); this.setWeather('rain', 5);
    } else if (abId === 'drought') {
      this.say(`Le talent Sécheresse de ${this.nm(r)} intensifie les rayons du soleil !`); this.setWeather('sun', 5);
    } else if (abId === 'sand-stream') {
      this.say(`Le talent Sable Volant de ${this.nm(r)} déclenche une tempête de sable !`); this.setWeather('sandstorm', 5);
    } else if (abId === 'snow-warning') {
      this.say(`Le talent Alerte Neige de ${this.nm(r)} fait tomber la grêle !`); this.setWeather('hail', 5);
    } else if (abId === 'electric-surge') {
      this.say(`Créa-Élec de ${this.nm(r)} électrise le sol !`); this.setTerrain('electric', 5);
    } else if (abId === 'pressure') {
      this.say(`${this.Nm(r)} met la pression !`);
    } else if (abId === 'unnerve') {
      this.say(`${this.Nm(r)} rend nerveuse l'équipe adverse !`);
    } else if (abId === 'mold-breaker') {
      this.say(`${this.Nm(r)} brise le moule !`);
    } else if (abId === 'cloud-nine' || abId === 'air-lock') {
      if (this.weather && this.weather !== 'none') { this.say('Les effets de la météo disparaissent !'); this.setWeather('none', 0); }
    } else if (abId === 'frisk') {
      for (const f of foes) { const fm = this.act(f); if (fm?.item) { this.say(`${this.Nm(r)} fouille ${this.nm(f)} et trouve ${itemName(fm.item)} !`); break; } }
    } else if (abId === 'anticipation') {
      for (const f of foes) {
        const fm = this.act(f);
        if (fm?.moves?.some((q) => MOVES[q.id] && MOVES[q.id].c !== 'status' && typeEff(this.moveType(f, MOVES[q.id]), this.typesOf(r)) > 1)) { this.say(`${this.Nm(r)} frissonne !`); break; }
      }
    }
  }

  checkBerries(ref) {
    const r = this.norm(ref), m = this.act(r), v = this.vol(r);
    if (!m || isFainted(m) || !m.item) return;
    if (this.hasOppAbility(r, 'unnerve') && /-(berry)$/.test(m.item)) return;
    if (m.item === 'sitrus-berry' && m.hp <= m.stats[0] / 2) {
      m.item = null;
      this.hp(r, Math.max(1, Math.floor(m.stats[0] / 4)));
      this.ev.push({ t: 'sfx', k: 'heal' });
      this.say(`${this.Nm(r)} consomme sa Baie Sitrus et récupère des PV !`);
    } else if (m.item === 'oran-berry' && m.hp <= m.stats[0] / 2) {
      m.item = null; this.hp(r, 10); this.ev.push({ t: 'sfx', k: 'heal' });
      this.say(`${this.Nm(r)} consomme sa Baie Oran et récupère des PV !`);
    } else if (SOIN[m.item] && (SOIN[m.item] === 'conf' ? v.conf > 0 : m.status === SOIN[m.item] || (SOIN[m.item] === 'psn' && m.status === 'tox'))) {
      const k = m.item; m.item = null;
      if (SOIN[k] === 'conf') { v.conf = 0; this.say(`La ${itemName(k)} guérit la confusion de ${this.nm(r)} !`); }
      else { m.status = null; m.slp = 0; m.tox = 0; this.ev.push({ t: 'status', side: r.side, slot: r.slot, status: null }); this.say(`La ${itemName(k)} guérit ${this.nm(r)} !`); }
    } else if (STAT_BAIE[m.item] && m.hp <= m.stats[0] / 4) {
      const k = m.item; m.item = null;
      this.say(`${this.Nm(r)} mange sa ${itemName(k)} !`); this.boost(r, STAT_BAIE[k], 1, true, r);
    } else if (m.item === 'lum-berry' && (m.status || v.conf > 0)) {
      m.item = null; m.status = null; m.slp = 0; m.tox = 0; v.conf = 0;
      this.ev.push({ t: 'status', side: r.side, slot: r.slot, status: null });
      this.say(`La Baie Prine guérit les altérations d'état de ${this.nm(r)} !`);
    }
  }

  start() {
    this.ev = [];
    const t = this.sides[1].trainer;
    const foeSlots = this.aliveSlots(1), mySlots = this.aliveSlots(0);
    const joinNames = (arr) => arr.length <= 1 ? arr[0] : arr.slice(0, -1).join(', ') + ' et ' + arr[arr.length - 1];
    if (this.slots === 1) {
      const f = this.foe;
      if (this.wild) this.say(`Un ${monName(f)} sauvage apparaît !`);
      else { this.say(`${nomDresseur(t)} veut se battre !`); this.ev.push({ t: 'send', side: 1, slot: 0, idx: this.sides[1].activeSlots[0] }); this.say(`${nomDresseur(t)} envoie ${monName(f)} !`); }
      this.ev.push({ t: 'send', side: 0, slot: 0, idx: this.sides[0].activeSlots[0] });
      this.say(`En avant ! ${monName(this.me)} !`);
      this.participants.add(this.me.uid);
    } else {
      const foeNames = foeSlots.map((sl) => monName(this.monAt(1, sl)));
      if (this.wild) {
        this.say(`${joinNames(foeNames)} sauvages apparaissent !`);
      } else {
        this.say(`${nomDresseur(t)} lance un combat ${this.slots === 4 ? 'Quatuor' : this.slots === 3 ? 'Trio' : 'Duo'} !`);
        for (const sl of foeSlots) this.ev.push({ t: 'send', side: 1, slot: sl, idx: this.sides[1].activeSlots[sl] });
        this.say(`${nomDresseur(t)} envoie ${joinNames(foeNames)} !`);
      }
      const myNames = mySlots.map((sl) => monName(this.monAt(0, sl)));
      for (const sl of mySlots) {
        this.ev.push({ t: 'send', side: 0, slot: sl, idx: this.sides[0].activeSlots[sl] });
        this.participants.add(this.monAt(0, sl).uid);
      }
      this.say(`En avant ! ${joinNames(myNames)} !`);
    }
    if (this.weather && this.weather !== 'none') this.ev.push({ t: 'weather', weather: this.weather, turns: this.weatherTurns });
    if (this.inverse) this.say('Distorsion spatiale ! Les affinités de types sont inversées !');
    if (this.chaosWeather) this.say('Météo chaotique ! Le ciel bascule à chaque fin de tour !');
    if (this.alpha) this.say('Une aura écrasante émane de ce Pokémon Alpha géant !');
    const startRefs = this.sortBySpeed([...mySlots.map((slot) => ({ side: 0, slot })), ...foeSlots.map((slot) => ({ side: 1, slot }))]);
    for (const r of startRefs) this.triggerEntry(r);
    return this.flush();
  }
  flush() { const e = this.ev; this.ev = []; return e; }

  /* ---------------- statistiques effectives ---------------- */
  stat(ref, k, crit = false, atkSide = true, ignore = false) {
    const r = this.norm(ref), m = this.act(r), v = this.vol(r);
    if (!m) return 1;
    let s = ignore ? 0 : v.st[k];
    if (crit) s = atkSide ? Math.max(0, s) : Math.min(0, s);
    const bs = (v.blade && m.sp === 681) ? [m.stats[0], m.stats[2], m.stats[1], m.stats[4], m.stats[3], m.stats[5]] : m.stats;
    let x = Math.floor(bs[k] * stageMul(s));
    const id = this.ab(r), w = this.weather;
    if (k === 1) {
      if (m.item === 'choice-band') x = Math.floor(x * 1.5);
      if (id === 'guts' && m.status) x = Math.floor(x * 1.5);
      if (id === 'huge-power' || id === 'pure-power') x *= 2;
      if (id === 'hustle') x = Math.floor(x * 1.5);
      if (id === 'toxic-boost' && (m.status === 'psn' || m.status === 'tox')) x = Math.floor(x * 1.5);
    } else if (k === 2) {
      if (m.item === 'eviolite' && SPECIES[m.sp]?.ev?.length) x = Math.floor(x * 1.5);
      if (id === 'marvel-scale' && m.status) x = Math.floor(x * 1.5);
    } else if (k === 3) {
      if (m.item === 'choice-specs') x = Math.floor(x * 1.5);
      if (id === 'solar-power' && w === 'sun') x = Math.floor(x * 1.5);
      if (id === 'flare-boost' && m.status === 'brn') x = Math.floor(x * 1.5);
    } else if (k === 4) {
      if (m.item === 'eviolite' && SPECIES[m.sp]?.ev?.length) x = Math.floor(x * 1.5);
      if (m.item === 'assault-vest') x = Math.floor(x * 1.5);
      if (this.weather === 'sandstorm' && this.typesOf(r).includes('rock')) x = Math.floor(x * 1.5);
    } else if (k === 5) {
      if (m.item === 'choice-scarf') x = Math.floor(x * 1.5);
      if ((id === 'swift-swim' && w === 'rain') || (id === 'chlorophyll' && w === 'sun') || (id === 'sand-rush' && w === 'sandstorm') || (id === 'slush-rush' && w === 'hail')) x *= 2;
      if (id === 'quick-feet' && m.status) x = Math.floor(x * 1.5);
      else if (m.status === 'par') x = Math.floor(x / 4);
    }
    return Math.max(1, x);
  }

  /* ---------------- choix du joueur ---------------- */
  usableMoves(ref) {
    const m = this.act(ref);
    if (!m) return [];
    const lock = !this.pvp ? this.choiceLock(ref) : null;
    return m.moves.map((x, k) => (x.pp > 0 && (lock == null || x.id === lock) ? k : -1)).filter((k) => k >= 0);
  }
  forcedAction(ref) {
    const v = this.vol(ref);
    if (!v) return null;
    if (v.recharge) return { type: 'recharge' };
    if (v.charge) return { type: 'move', id: v.charge };
    if (v.rampage) return { type: 'move', id: v.rampage.id };
    return null;
  }

  normalizeSlotAction(ref, rawAction) {
    const m = this.act(ref);
    const forced = this.forcedAction(ref);
    let a = forced ? { ...forced } : { ...(rawAction || { type: 'move', idx: 0 }) };
    if (a.type === 'move' && a.idx == null && a.id == null) {
      const u = this.usableMoves(ref); a = u.length ? { ...a, type: 'move', idx: u[0] } : { ...a, type: 'move', id: 165 };
    }
    if (a.type === 'move' && a.idx != null && m) {
      const mv = m.moves[a.idx];
      if (!this.usableMoves(ref).length) a = { ...a, type: 'move', id: 165 };
      else if (!mv || mv.pp <= 0) return { err: 'Plus de PP pour cette attaque !' };
      else a = { ...a, type: 'move', id: mv.id, slot: a.idx };
    }
    if (!this.pvp && !forced && m) {
      if (a.type === 'switch' && this.trapped(ref)) return { err: `${monName(m)} est pris au piège et ne peut pas être rappelé !` };
      const lock = this.choiceLock(ref);
      if (a.type === 'move' && lock != null && a.id !== 165 && a.id !== lock) return { err: `${itemName(m.item)} ne laisse utiliser que ${MOVES[lock].n} !` };
    }
    return { ok: a, wantMega: !!rawAction?.mega && a.type === 'move' };
  }

  /**
   * Exécute un tour :
   * - 1v1 : `action = { type, idx, ... }`
   * - 2v2 / 3v3 : tableau d'actions par emplacement joueur (ou une seule action { type: 'run' })
   */
  playerAction(input) {
    if (this.state !== 'choose') return [];
    const actions = Array.isArray(input) ? input : [input];
    this.ev = [];
    this.turn++;
    const alive0 = this.aliveSlots(0);
    if (actions.some((a) => a?.type === 'run') && (!this.wild || this.sansFuite)) {
      this.turn--; return [{ t: 'msg', text: this.wild ? 'La faille s\'est refermée : impossible de fuir !' : 'Impossible de fuir un combat de Dresseur !' }];
    }
    if (this.sansSoins && actions.some((a) => a?.type === 'item' && estSoin(a.item))) {
      this.turn--; return [{ t: 'msg', text: 'Les objets de soin n\'ont aucun effet dans une faille !' }];
    }
    if (this.slots > 1 && actions.some((a) => a?.type === 'item' && ITEMS[a.item]?.ball) && this.aliveSlots(1).length > 1) {
      this.turn--; return [{ t: 'msg', text: 'Il y a trop de cibles ! Mets-en d\'abord K.O. pour n\'en laisser qu\'une !' }];
    }

    const playerActs = [];
    let playerWantsMegaSlot = null;
    if (actions.some((a) => a?.type === 'run')) {
      const leadSl = alive0[0] ?? 0;
      playerActs.push({ i: 0, side: 0, slot: leadSl, a: { type: 'run' } });
    } else {
      for (let k = 0; k < alive0.length; k++) {
        const sl = alive0[k];
        const raw = actions.find((x) => x && x.slot === sl) ?? actions[k] ?? actions[0];
        const norm = this.normalizeSlotAction({ side: 0, slot: sl }, raw);
        if (norm.err) { this.turn--; return [{ t: 'msg', text: norm.err }]; }
        playerActs.push({ i: 0, side: 0, slot: sl, a: norm.ok });
        if (norm.wantMega && playerWantsMegaSlot == null && this.canMega({ side: 0, slot: sl })) playerWantsMegaSlot = sl;
      }
    }

    const foeActs = this.slots === 1
      ? [{ i: 1, side: 1, slot: 0, a: this.foeChoose() }]
      : this.foeChooseAll();

    // Méga-Évolutions du tour, une seule par camp et par combat
    let foeWantsMegaSlot = null;
    for (const fa of foeActs) {
      if (this.foeWantsMega(fa.a, fa.slot) && foeWantsMegaSlot == null) foeWantsMegaSlot = fa.slot;
    }
    for (const s of (this.eotOrder ? this.eotOrder() : [0, 1])) {
      const mSlot = s === 0 ? playerWantsMegaSlot : foeWantsMegaSlot;
      if (mSlot != null && this.canMega({ side: s, slot: mSlot })) this.doMega({ side: s, slot: mSlot });
    }

    this.resolveAll([...playerActs, ...foeActs]);
    return this.flush();
  }

  canMega(ref) {
    const r = this.norm(ref), s = this.sides[r.side], m = this.act(r);
    return !!m && !isFainted(m) && !!s.mega && !s.megaUsed && !!megaFormOf(m);
  }
  foeWantsMega(b, slot = 0) { return b?.type === 'move' && this.canMega({ side: 1, slot }); }
  doMega(ref) {
    const r = this.norm(ref), m = this.act(r), v = this.vol(r), before = this.Nm(r);
    const prevAb = this.ab(r);
    const trainer = r.side === 0 ? this.sides[0].name : (this.sides[1].trainer?.name || this.sides[1].name);
    const de = /^[AEIOUYÉÈÊÂÎÔH]/i.test(trainer) ? 'd\'' : 'de ';
    this.say(`${before} réagit au Méga-Anneau ${de}${trainer} !`);
    megaEvolve(m); this.sides[r.side].megaUsed = true;
    if (v) { delete v.ability; delete v.types; }
    this.ev.push({ t: 'mega', side: r.side, slot: r.slot, sp: m.sp });
    this.say(`${before} méga-évolue en ${SPECIES[m.sp].n} !`);
    if (this.ab(r) !== prevAb) this.triggerEntry(r);
  }

  /** après un K.O. : en 1v1 reçoit un indice ; en 2v2/3v3 reçoit un indice, un tableau d'indices ou [{ slot, idx }] */
  playerSwitch(picks) {
    if (this.state !== 'switch') return [];
    this.ev = [];
    if (this.slots === 1) {
      const idx = Array.isArray(picks) ? (picks[0]?.idx ?? picks[0]) : picks;
      if (this.pendingFoe != null) { this.doSwitch(1, this.pendingFoe, true); this.pendingFoe = null; }
      this.doSwitch(0, idx, true);
      this.state = 'choose';
      return this.flush();
    }
    const list = Array.isArray(picks) ? picks : [picks];
    const switched = [];
    for (let k = 0; k < this.needPlayerSlots.length; k++) {
      const sl = this.needPlayerSlots[k];
      const item = list.find((x) => x && typeof x === 'object' && x.slot === sl) ?? list[k];
      let idx = typeof item === 'object' ? item?.idx : item;
      const party = this.sides[0].party;
      if (idx == null || !party[idx] || party[idx].hp <= 0 || this.sides[0].activeSlots.includes(idx)) {
        idx = party.findIndex((m, j) => m && m.hp > 0 && !this.sides[0].activeSlots.includes(j));
      }
      if (idx >= 0) {
        this.doSwitchSlot(0, sl, idx, true, false);
        switched.push({ side: 0, slot: sl });
      } else {
        this.sides[0].activeSlots[sl] = -1;
      }
    }
    this.needPlayerSlots = [];
    for (const p of this.pendingFoeSlots) switched.push(p);
    this.pendingFoeSlots = [];
    for (const r of this.sortBySpeed(switched)) this.triggerEntry(r);
    this.state = 'choose';
    return this.flush();
  }

  trapped(ref) {
    const m = this.act(ref);
    if (!m || this.typesOf(ref).includes('ghost')) return false;
    const trp = this.vol(ref)?.trap;
    return (typeof trp === 'object' ? trp?.t : trp) > 0;
  }
  choiceLock(ref) {
    const m = this.act(ref), v = this.vol(ref);
    if (!m || !v) return null;
    const id = v.choice;
    if (id == null || !/^choice-/.test(m.item || '')) return null;
    return m.moves.some((q) => q.id === id) ? id : null;
  }
  canSwitchTo(idx) {
    const m = this.sides[0].party[idx];
    return !!m && m.hp > 0 && !this.sides[0].activeSlots.includes(idx);
  }
  roarBench(side, slot) {
    const tgtSide = this.sides[side];
    const owners = this.sideOwners ? this.sideOwners[side] : (side === 0 && this.owners?.length ? this.owners : null);
    return tgtSide.party.map((pm, j) => (
      pm && pm.hp > 0 && !tgtSide.activeSlots.includes(j) && (!owners || owners[j] === slot) ? j : -1
    )).filter((j) => j >= 0);
  }
  shouldDisobey(attRef) {
    if (attRef.side !== 0 || this.pvp || this.coop || !this.cap || this.cap >= 100) return false;
    const m = this.act(attRef);
    if (!m || m.lvl <= this.cap) return false;
    const traded = !!(m.ot && this.sides[0].name && m.ot !== this.sides[0].name);
    const legend = !!(SPECIES[m.sp]?.leg || SPECIES[m.sp]?.legend);
    if (!traded && !legend) return false;
    const over = m.lvl - this.cap;
    const chance = Math.min(0.75, 0.25 + over * 0.08);
    return this.rng() < chance;
  }

  /* ---------------- IA (1v1 & Multi) ---------------- */
  /** Estime la menace maximale adverse envers un emplacement de l'IA */
  foeThreatInfo(slot = 0) { return foeThreatInfo(this, slot); }

  /** Choisit le meilleur remplaçant du banc de l'IA face aux Pokémon actifs du joueur */
  foePickBestReplacement(slot = 0, candidateIndices = null) { return foePickBestReplacement(this, slot, candidateIndices); }

  /** Évalue s'il est tactiquement avantageux pour l'IA de rappeler le Pokémon actif */
  foeConsiderSwitch(slot, threat, bestMoveDamage, ctx = null) { return foeConsiderSwitch(this, slot, threat, bestMoveDamage, ctx); }

  foeChooseAll() { return foeChooseAll(this); }
  foeChoose() { return this.foeChooseSlot(0, false, null); }
  foeChooseSlot(slot = 0, itemUsed = false, ctx = null) { return foeChooseSlot(this, slot, itemUsed, ctx); }

  damagePreview(a, d, moveId) { return damagePreview(this, a, d, moveId); }
  estimate(a, d, mv) { return estimate(this, a, d, mv); }

  /* ---------------- résolution d'un tour ---------------- */
  resolve(a, b) { this.resolveAll([{ i: 0, side: 0, slot: 0, a }, { i: 1, side: 1, slot: 0, a: b }]); }

  resolveAll(acts) {
    const order = this.eotOrder ? this.eotOrder() : [0, 1];
    acts = [...acts].sort((a, b) => order.indexOf(a.side ?? a.i) - order.indexOf(b.side ?? b.i) || (a.slot ?? 0) - (b.slot ?? 0));
    this._switchedThisTurn = new Set();
    for (const s of this.sides) for (const v of s.vs) { v.flinch = false; v.dmgTaken = null; }
    for (const x of acts) {
      const ref = { side: x.side, slot: x.slot };
      if (x.a.type === 'switch' && this.trapped(ref)) { this.say(`${this.Nm(ref)} est pris au piège et ne peut pas être rappelé !`); x.a = { type: 'none' }; x.done = true; }
      const lock = this.choiceLock(ref);
      if (x.a.type === 'move' && lock != null && x.a.id !== 165 && x.a.id !== lock) {
        const lSlot = this.act(ref).moves.findIndex((q) => q.id === lock);
        if (lSlot >= 0 && this.act(ref).moves[lSlot].pp > 0) x.a = { ...x.a, type: 'move', id: lock, slot: lSlot };
        else x.a = { ...x.a, type: 'move', id: 165, slot: undefined };
      }
    }
    const reservedSwitch = new Set();
    for (const x of acts) {
      if (this.state === 'over') return;
      const ref = { side: x.side, slot: x.slot };
      if (x.a.type === 'run') { if (this.tryRun()) return; x.done = true; }
      else if (x.a.type === 'switch') {
        const sk = x.side + ':' + x.a.idx;
        if (!reservedSwitch.has(sk) && this.sides[x.side].party[x.a.idx]?.hp > 0 && !this.sides[x.side].activeSlots.includes(x.a.idx)) {
          reservedSwitch.add(sk);
          this.doSwitchSlot(x.side, x.slot, x.a.idx, false, false);
        }
        x.done = true;
      } else if (x.a.type === 'item') {
        if (this.useItem(x.side, x.a, x.slot)) return;
        x.done = true;
      }
    }
    const switched = acts.filter((x) => x.a.type === 'switch');
    if (switched.length) {
      for (const x of this.sortBySpeed(switched)) this.triggerEntry({ side: x.side, slot: x.slot });
    }
    const movers = acts.filter((x) => !x.done);
    const prio = (x) => {
      if (x.a.type !== 'move') return 0;
      const mv = MOVES[x.a.id], id = this.ab(x), am = this.act(x);
      return mv.pr + ((id === 'prankster' && mv.c === 'status') || (id === 'gale-wings' && mv.t === 'flying' && am && am.hp === am.stats[0]) ? 1 : 0);
    };
    for (const x of movers) {
      const m = this.act(x);
      x.monUid = m?.uid || null;
      x.griffe = m && m.item === 'quick-claw' && x.a.type === 'move' && this.r(5) === 0;
    }
    const sortedMovers = this.sortBySpeed(movers, prio);
    for (const x of sortedMovers) if (x.griffe && sortedMovers[0] === x && sortedMovers.length > 1) this.say(`La Vive Griffe de ${this.nm(x)} lui permet d'agir en premier !`);
    const acted = new Set();
    for (const x of sortedMovers) {
      if (this.state === 'over') return;
      const ref = { side: x.side, slot: x.slot };
      const curMon = this.act(ref);
      if (!curMon || isFainted(curMon) || (x.monUid && curMon.uid !== x.monUid)) continue;
      if (x.a.type === 'recharge') { this.say(`${this.Nm(ref)} doit se recharger !`); this.vol(ref).recharge = false; acted.add(refKey(ref)); continue; }
      this.useMoveRef(ref, x.a, acted);
      acted.add(refKey(ref));
      if (this.checkFaints(true)) break;
    }
    if (this.state !== 'over') this.endOfTurn();
  }

  tryRun() {
    if (!this.wild) { this.say('Impossible de fuir un combat de Dresseur !'); return false; }
    if (this.sansFuite) { this.say('La faille s\'est refermée : impossible de fuir !'); return false; }
    this.runTries++;
    const lead = { side: 0, slot: this.aliveSlots(0)[0] ?? 0 }, fLead = { side: 1, slot: this.aliveSlots(1)[0] ?? 0 };
    if (this.trapped(lead)) { this.say(`${monName(this.act(lead))} est pris au piège : impossible de fuir !`); return false; }
    if (this.ab(lead) === 'run-away') { this.ev.push({ t: 'sfx', k: 'run' }); this.say('Tu prends la fuite !'); this.end('run'); return true; }
    if ((this.ab(fLead) === 'shadow-tag' && this.ab(lead) !== 'shadow-tag') || (this.ab(fLead) === 'arena-trap' && this.isGrounded(lead))) {
      this.say(`${this.Nm(fLead)} empêche la fuite !`); return false;
    }
    const a = this.stat(lead, 5), b = this.stat(fLead, 5);
    const f = Math.floor(a * 128 / b) + 30 * this.runTries;
    if (a >= b || f > 255 || this.r(256) < f) { this.ev.push({ t: 'sfx', k: 'run' }); this.say('Tu prends la fuite !'); this.end('run'); return true; }
    this.say('Impossible de fuir !'); return false;
  }

  doSwitch(side, idx, afterFaint, trigger = true) { return this.doSwitchSlot(side, 0, idx, afterFaint, trigger); }
  doSwitchSlot(i, slot, idx, afterFaint, trigger = true) {
    const side = this.sides[i], ref = { side: i, slot }, cur = this.act(ref);
    if (!afterFaint && cur) {
      this.say(i === 0 ? `${monName(cur)}, reviens !` : `${side.trainer ? `${nomDresseur(side.trainer)}` : side.name} rappelle ${monName(cur)} !`);
      this.ev.push({ t: 'recall', side: i, slot });
    }
    if (cur && !isFainted(cur)) {
      const id = this.ab(ref);
      if (id === 'natural-cure' && cur.status) { cur.status = null; cur.slp = 0; cur.tox = 0; }
      if (id === 'regenerator') cur.hp = Math.min(cur.stats[0], cur.hp + Math.floor(cur.stats[0] / 3));
    }
    side.activeSlots[slot] = idx;
    side.vs[slot] = freshVol();
    this._switchedThisTurn?.add(refKey(ref));
    const sent = this.act(ref);
    this.ev.push({ t: 'send', side: i, slot, idx });
    if (i === 0 && sent) {
      this.say(`En avant ! ${monName(sent)} !`);
      this.participants.add(sent.uid);
    } else if (sent) {
      this.say(side.trainer ? `${nomDresseur(side.trainer)} envoie ${monName(sent)} !` : `${monName(sent)} sauvage apparaît !`);
      if (this.slots === 1) this.participants = new Set(this.aliveSlots(0).map((s0) => this.monAt(0, s0).uid));
    }
    for (const vOpp of this.sides[1 - i].vs) if (vOpp.trap && vOpp.trap.by === refKey(ref)) vOpp.trap = 0;
    if (this.slots === 1) this.sides[1 - i].vs[0].trap = 0;
    if (trigger) this.triggerEntry(ref);
  }

  useItem(i, a, slot = 0) {
    if (i === 1) {
      const ref = { side: 1, slot: a.slot ?? slot }, m = this.act(ref), t = this.sides[1].trainer;
      if (!m) return false;
      const before = m.hp, st0 = m.status;
      applyItem(a.item, m);
      this.say(`${nomDresseur(t)} utilise ${itemName(a.item)} !`);
      this.ev.push({ t: 'hp', side: 1, slot: ref.slot, hp: m.hp, from: before, max: m.stats[0] });
      if (st0 && !m.status) this.ev.push({ t: 'status', side: 1, slot: ref.slot, status: null });
      return false;
    }
    const it = ITEMS[a.item];
    if (!(it.ball && !this.wild)) { this.bag[a.item] = (this.bag[a.item] || 0) - 1; if (this.bag[a.item] <= 0) delete this.bag[a.item]; }
    if (it.ball) return this.throwBall(a.item);
    const m = this.sides[0].party[a.target], before = m.hp;
    this.say(`Tu utilises ${itemName(a.item)} !`);
    const msg = applyItem(a.item, m, a.moveIdx ?? -1);
    if (m.hp > 0) delete m._ko;
    const onSlot = this.sides[0].activeSlots.indexOf(a.target);
    if (onSlot >= 0) this.ev.push({ t: 'hp', side: 0, slot: onSlot, hp: m.hp, from: before, status: m.status, max: m.stats[0] });
    this.ev.push({ t: 'sfx', k: 'heal' });
    this.say(msg || 'Mais cela n\'a aucun effet...');
    return false;
  }

  throwBall(item) {
    const fSlots = this.aliveSlots(1), tgtSlot = fSlots[0] ?? 0;
    this.say(`Tu lances une ${itemName(item)} !`);
    if (!this.wild) { this.ev.push({ t: 'ball', item, slot: tgtSlot, blocked: true }); this.say('Le Dresseur dévie la Ball !'); this.say('Voler, c\'est mal !'); return false; }
    const m = this.monAt(1, tgtSlot), S = SPECIES[m.sp], max = m.stats[0];
    const st = m.status === 'slp' || m.status === 'frz' ? 2 : m.status ? 1.5 : 1;
    const a = Math.floor(((3 * max - 2 * m.hp) * S.cr * ITEMS[item].ball) / (3 * max) * st);
    let shakes = 0, caught = false;
    if (a >= 255 || ITEMS[item].ball >= 255) { shakes = 4; caught = true; }
    else {
      const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / Math.max(1, a))));
      while (shakes < 4 && this.r(65536) < b) shakes++;
      caught = shakes === 4;
    }
    this.ev.push({ t: 'ball', item, slot: tgtSlot, shakes: Math.min(3, shakes), caught });
    if (caught) {
      m.ball = item; m.status = m.status === 'frz' ? null : m.status;
      this.caughtMon = m;
      this.say(`Et hop ! ${monName(m)} est attrapé !`);
      this.awardExp(m);
      this.end('caught');
      return true;
    }
    this.say(['Oh non ! Le Pokémon s\'est libéré !', 'Raaah ! Ça y était presque !', 'Aaaah ! Presque !', 'Mince ! Ça y était presque !'][shakes] || 'Raté !');
    return false;
  }

  moveType(i, mv) {
    if (!mv) return 'normal';
    if (mv.m?.u === 'hidden-power') return hiddenPower(this.act(i)).type;
    const id = this.ab(i);
    if (id === 'normalize' && mv.id !== 165) return 'normal';
    if (mv.t === 'normal' && mv.c !== 'status' && mv.id !== 165) {
      if (id === 'aerilate') return 'flying';
      if (id === 'pixilate') return 'fairy';
      if (id === 'refrigerate') return 'ice';
      if (id === 'dragonize') return 'dragon';
    }
    return mv.t;
  }
  movePower(i, d, mv) {
    const u = mv.m?.u, m = this.act(i), t = this.act(d);
    if (u === 'hidden-power') return hiddenPower(m).power;
    if (mv.key === 'eruption' || mv.key === 'water-spout') return Math.max(1, Math.floor(150 * m.hp / Math.max(1, m.stats[0])));
    if (mv.key === 'electro-ball') { const q = this.stat(i, 5) / this.stat(d, 5); return q >= 4 ? 150 : q >= 3 ? 120 : q >= 2 ? 80 : q >= 1 ? 60 : 40; }
    if (mv.key === 'heat-crash') { const q = (SPECIES[m.sp].w || 100) / (SPECIES[t.sp].w || 100); return q >= 5 ? 120 : q >= 4 ? 100 : q >= 3 ? 80 : q >= 2 ? 60 : 40; }
    if (u === 'flail' || u === 'reversal') { const p = Math.floor(48 * m.hp / m.stats[0]); return p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20; }
    if (u === 'low-kick') { const w = SPECIES[t.sp].w || 100; return w < 100 ? 20 : w < 250 ? 40 : w < 500 ? 60 : w < 1000 ? 80 : w < 2000 ? 100 : 120; }
    if (u === 'return') return 102;
    if (u === 'frustration') return 40;
    if (u === 'facade') return m.status ? 140 : 70;
    if (u === 'magnitude') return [10, 30, 50, 70, 90, 110, 150][[0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6][this.r(100)]];
    return mv.p || 0;
  }

  damageCore(a, d, mv, power, type, crit, rand, late = false) {
    const aR = this.norm(a), dR = this.norm(d);
    const A = this.act(aR), D = this.act(dR);
    const phys = mv.c === 'physical';
    const aId = this.ab(aR), dId = this.defAb(aR, dR), x = mv.m || {};
    const atk = this.stat(aR, phys ? 1 : 3, crit, true, dId === 'unaware'), def = this.stat(dR, phys ? 2 : 4, crit, false, aId === 'unaware');
    let dmg = Math.floor(Math.floor(Math.floor(2 * A.lvl / 5 + 2) * power * atk / def) / 50);
    if (phys && A.status === 'brn' && aId !== 'guts' && mv.m?.u !== 'facade') dmg = Math.floor(dmg / 2);
    const scr = this.sides[dR.side].screens;
    const bypassScreens = crit || aId === 'infiltrator' || (aId === 'piercing-drill' && isContact(mv));
    if (!bypassScreens && ((phys && scr.reflect) || (!phys && scr.light))) dmg = Math.floor(dmg / 2);
    dmg += 2;
    if (crit) dmg = Math.floor(dmg * 1.5);
    dmg = Math.floor(dmg * rand);
    if (this.typesOf(aR).includes(type)) dmg = Math.floor(dmg * (aId === 'adaptability' ? 2.0 : 1.5));
    if (A.hp <= A.stats[0] / 3) {
      if (type === 'fire' && aId === 'blaze') dmg = Math.floor(dmg * 1.5);
      if (type === 'water' && aId === 'torrent') dmg = Math.floor(dmg * 1.5);
      if (type === 'grass' && aId === 'overgrow') dmg = Math.floor(dmg * 1.5);
      if (type === 'bug' && aId === 'swarm') dmg = Math.floor(dmg * 1.5);
    }
    if (aId === 'technician' && power <= 60) dmg = Math.floor(dmg * 1.5);
    if (aId === 'iron-fist' && /punch|poing/.test(mv.key || '')) dmg = Math.floor(dmg * 1.2);
    if (aId === 'tough-claws' && isContact(mv)) dmg = Math.floor(dmg * 1.3);
    if (aId === 'mega-launcher' && PULSE_MOVES.has(mv.key)) dmg = Math.floor(dmg * 1.5);
    if (aId === 'strong-jaw' && BITE_MOVES.has(mv.key)) dmg = Math.floor(dmg * 1.5);
    if (aId === 'sharpness' && SLICE_MOVES.has(mv.key)) dmg = Math.floor(dmg * 1.5);
    if (aId === 'analytic' && late) dmg = Math.floor(dmg * 1.3);
    if (mv.c !== 'status' && mv.id !== 165) {
      if (aId === 'normalize' || (mv.t === 'normal' && ['aerilate', 'pixilate', 'refrigerate', 'dragonize'].includes(aId))) dmg = Math.floor(dmg * 1.2);
    }
    if (aId === 'eelevate' && type === 'electric') dmg = Math.floor(dmg * 1.2);
    if (aId === 'fire-mane' && type === 'fire') dmg = Math.floor(dmg * 1.2);
    if (aId === 'mega-sol' && this.weather === 'sun' && type === 'grass') dmg = Math.floor(dmg * 1.2);
    if (aId === 'reckless' && x.drain < 0) dmg = Math.floor(dmg * 1.2);
    if (aId === 'sheer-force' && isSheerForceMove(mv)) dmg = Math.floor(dmg * 1.3);
    if (aId === 'sand-force' && this.weather === 'sandstorm' && ['rock', 'ground', 'steel'].includes(type)) dmg = Math.floor(dmg * 1.3);
    if (aId === 'sniper' && crit) dmg = Math.floor(dmg * 1.5);
    if (type === 'fire' && this.vol(aR).flashFire) dmg = Math.floor(dmg * 1.5);
    if ((type === 'fairy' && this.hasFieldAbility('fairy-aura')) || (type === 'dark' && this.hasFieldAbility('dark-aura'))) {
      dmg = Math.floor(dmg * (this.hasFieldAbility('aura-break') ? 0.75 : 4 / 3));
    }
    if (this.terrain === 'electric' && type === 'electric' && this.isGrounded(aR)) dmg = Math.floor(dmg * 1.3);
    const typeBoosters = {
      fire: 'charcoal', water: 'mystic-water', grass: 'miracle-seed', electric: 'magnet', dark: 'black-glasses',
      rock: 'hard-stone', ground: 'soft-sand', flying: 'sharp-beak', fighting: 'black-belt', poison: 'poison-barb',
      psychic: 'twisted-spoon', bug: 'silver-powder', dragon: 'dragon-fang', ice: 'never-melt-ice', steel: 'metal-coat',
      normal: 'silk-scarf', ghost: 'spell-tag', fairy: 'fairy-feather',
    };
    if (typeBoosters[type] && A.item === typeBoosters[type]) dmg = Math.floor(dmg * 1.2);
    if (A.item === 'life-orb') dmg = Math.floor(dmg * 1.3);
    if ((A.item === 'muscle-band' && phys) || (A.item === 'wise-glasses' && !phys)) dmg = Math.floor(dmg * 1.1);
    if (this.weather === 'rain') { if (type === 'water') dmg = Math.floor(dmg * 1.5); else if (type === 'fire') dmg = Math.floor(dmg * 0.5); }
    else if (this.weather === 'sun') { if (type === 'fire') dmg = Math.floor(dmg * 1.5); else if (type === 'water') dmg = Math.floor(dmg * 0.5); }
    const eff = this.effOn(aR, dR, type);
    dmg = Math.floor(dmg * eff);
    if (aId === 'tinted-lens' && eff > 0 && eff < 1) dmg *= 2;
    if (A.item === 'expert-belt' && eff > 1) dmg = Math.floor(dmg * 1.2);
    if (dId === 'thick-fat' && (type === 'fire' || type === 'ice')) dmg = Math.floor(dmg / 2);
    if (dId === 'heatproof' && type === 'fire') dmg = Math.floor(dmg / 2);
    if (dId === 'dry-skin' && type === 'fire') dmg = Math.floor(dmg * 1.25);
    if (phys && dId === 'fur-coat') dmg = Math.floor(dmg / 2);
    if ((dId === 'filter' || dId === 'solid-rock' || dId === 'aura-guard') && eff > 1) dmg = Math.floor(dmg * 0.75);
    if (dId === 'multiscale' && D.hp === D.stats[0]) dmg = Math.floor(dmg / 2);
    return Math.max(1, dmg);
  }

  hp(ref, delta, cause) {
    const r = this.norm(ref), m = this.act(r);
    if (!m) return 0;
    const before = m.hp;
    m.hp = Math.max(0, Math.min(m.stats[0], m.hp + delta));
    if (m.hp !== before) this.ev.push({ t: 'hp', side: r.side, slot: r.slot, hp: m.hp, from: before, cause, max: m.stats[0] });
    if (delta < 0 && r.side === 0 && m.hp > 0 && before > m.hp && m.hp <= Math.max(1, Math.floor(m.stats[0] * 0.05))) {
      this.clutchUids?.add(m.uid);
    }
    const half = m.stats[0] / 2;
    if (m.hp > 0 && m.hp <= half && before > half && this.ab(r) === 'sacoches-pollen' && !(this.sacoches ||= new Set()).has(m.uid)) {
      this.sacoches.add(m.uid);
      this.say(`${this.Nm(r)} puise dans ses Sacoches de Pollen !`);
      this.hp(r, Math.max(1, Math.floor(m.stats[0] / 4)));
      this.boost(r, 6, 1, true, r);
    }
    return before - m.hp;
  }

  resolveTargets(attRef, a, mv) {
    const opp = 1 - attRef.side;
    if (mv.tg === 7 || mv.tg === 4 || mv.tg === 5 || mv.tg === 6) return { targets: [attRef], isSpread: false, selfTarget: true };
    if (mv.tg === 12 || mv.tg === 14) return { targets: this.allAliveRefs(), isSpread: false, selfTarget: true };
    if (mv.tg === 13) return { targets: this.aliveSlots(attRef.side).map((slot) => ({ side: attRef.side, slot })), isSpread: false, selfTarget: true };
    if (mv.tg === 3) {
      const allies = this.validAllyTargets(attRef);
      const picked = a.targetSide === attRef.side && allies.find((t) => t.slot === a.targetSlot);
      return { targets: [picked || allies[0] || attRef], isSpread: false, selfTarget: true };
    }
    if (mv.tg === 11) {
      const targets = this.validFoeTargets(attRef, mv);
      return { targets, isSpread: targets.length > 1, selfTarget: false };
    }
    if (mv.tg === 9) {
      const others = this.allAliveRefs().filter((t) => !(t.side === attRef.side && t.slot === attRef.slot) && this.isAdjacent(attRef, t));
      const targets = others.length ? others : this.validFoeTargets(attRef, mv);
      return { targets, isSpread: targets.length > 1, selfTarget: false };
    }
    const cands = this.validFoeTargets(attRef, mv);
    if (!cands.length) return { targets: [], isSpread: false, selfTarget: false };
    if (mv.tg === 8) return { targets: [cands[this.r(cands.length)]], isSpread: false, selfTarget: false };
    const picked = a.targetSide === opp && cands.find((t) => t.slot === a.targetSlot);
    let tgt = picked || cands[0];
    // en Duo/Trio, Paratonnerre et Lavabo attirent les attaques monocibles Électrik/Eau, sauf face à Nerfs d'Acier (stalwart)
    const attAb = this.ab(attRef);
    if (this.slots > 1 && mv.c !== 'status' && attAb !== 'stalwart' && attAb !== 'propeller-tail') {
      const mType = this.moveType(attRef, mv);
      const redirAb = mType === 'electric' ? 'lightning-rod' : mType === 'water' ? 'storm-drain' : null;
      if (redirAb && this.defAb(attRef, tgt) !== redirAb) {
        const magnet = this.allAliveRefs().find((t) => !(t.side === attRef.side && t.slot === attRef.slot) && this.defAb(attRef, t) === redirAb);
        if (magnet) tgt = magnet;
      }
    }
    return { targets: [tgt], isSpread: false, selfTarget: false };
  }

  useMove(i, a, first) { return this.useMoveRef({ side: i, slot: 0 }, a, first ? null : new Set(['acted'])); }

  useMoveRef(attRef, a, actedSet) {
    const v = this.vol(attRef), m = this.act(attRef), mv = MOVES[a.id], x = mv.m || {};
    v.turns++; this.lastUser = attRef;
    const stop = () => { v.charge = null; v.rampage = null; if (v.invuln) { v.invuln = null; this.ev.push({ t: 'hide', side: attRef.side, slot: attRef.slot, on: false }); } };
    const boomOut = () => { if (x.boom && !isFainted(m)) this.hp(attRef, -m.hp); };

    if (m.status === 'frz') {
      if (this.r(5) === 0) { m.status = null; this.ev.push({ t: 'status', side: attRef.side, slot: attRef.slot, status: null }); this.say(`${this.Nm(attRef)} n'est plus gelé !`); }
      else { this.say(`${this.Nm(attRef)} est gelé !`); stop(); return; }
    }
    if (m.status === 'slp') {
      m.slp -= this.ab(attRef) === 'early-bird' ? 2 : 1;
      if (m.slp <= 0) { m.status = null; this.ev.push({ t: 'status', side: attRef.side, slot: attRef.slot, status: null }); this.say(`${this.Nm(attRef)} se réveille !`); }
      else { this.ev.push({ t: 'anim', side: attRef.side, slot: attRef.slot, k: 'sleep' }); this.say(`${this.Nm(attRef)} dort profondément.`); stop(); return; }
    }
    if (v.flinch && this.ab(attRef) !== 'inner-focus') { this.say(`${this.Nm(attRef)} a peur ! Il ne peut pas attaquer !`); stop(); return; }
    if (v.conf > 0) {
      v.conf--;
      if (v.conf === 0) this.say(`${this.Nm(attRef)} n'est plus confus !`);
      else {
        this.ev.push({ t: 'anim', side: attRef.side, slot: attRef.slot, k: 'confused' });
        this.say(`${this.Nm(attRef)} est confus !`);
        if (this.r(2) === 0) {
          const atk = this.stat(attRef, 1), def = this.stat(attRef, 2);
          const dmg = Math.max(1, Math.floor(Math.floor(Math.floor(2 * m.lvl / 5 + 2) * 40 * atk / def) / 50) + 2);
          this.say('Il se blesse dans sa confusion !');
          this.ev.push({ t: 'hit', side: attRef.side, slot: attRef.slot, eff: 1 });
          this.hp(attRef, -dmg); stop(); return;
        }
      }
    }
    if (m.status === 'par' && this.r(4) === 0) { this.ev.push({ t: 'anim', side: attRef.side, slot: attRef.slot, k: 'para' }); this.say(`${this.Nm(attRef)} est paralysé ! Il n'a pas pu attaquer !`); stop(); return; }
    if (!v.charge && !v.rampage && this.shouldDisobey(attRef)) {
      const msgs = [
        `${this.Nm(attRef)} fait la sourde oreille !`,
        `${this.Nm(attRef)} se détourne !`,
        `${this.Nm(attRef)} paresse et refuse d'obéir !`,
        `${this.Nm(attRef)} fait comme s'il n'avait rien entendu !`,
      ];
      this.say(msgs[this.r(msgs.length)]);
      stop();
      return;
    }

    if ((x.charge || VANISH_MOVES.has(mv.key)) && v.charge !== mv.id && !(mv.key === 'solar-beam' && (this.weather === 'sun' || this.ab(attRef) === 'mega-sol'))) {
      v.charge = mv.id;
      const slot = m.moves.findIndex((q) => q.id === mv.id); if (slot >= 0 && m.moves[slot].pp > 0) m.moves[slot].pp--;
      const txt = { 'solar-beam': 'absorbe la lumière !', 'razor-wind': 'se prépare !', 'sky-attack': 'est entouré d\'une lumière intense !', 'skull-bash': 'baisse la tête !', fly: 's\'envole !', dig: 's\'enfonce dans le sol !', dive: 'plonge !', bounce: 'saute très haut !', 'shadow-force': 'disparaît dans l\'ombre !', 'phantom-force': 'disparaît instantanément !' }[mv.key] || 'se concentre !';
      if (['fly', 'dig', 'dive', 'bounce'].includes(mv.key)) { v.invuln = mv.key; this.ev.push({ t: 'hide', side: attRef.side, slot: attRef.slot, on: true }); }
      else if (VANISH_MOVES.has(mv.key)) { v.invuln = 'shadow'; this.ev.push({ t: 'hide', side: attRef.side, slot: attRef.slot, on: true }); }
      if (mv.key === 'skull-bash') this.boost(attRef, 3, 1, true, attRef);
      this.say(`${this.Nm(attRef)} ${txt}`);
      return;
    }
    const charged = v.charge === mv.id; v.charge = null;
    if (v.invuln) { v.invuln = null; this.ev.push({ t: 'hide', side: attRef.side, slot: attRef.slot, on: false }); }

    if (this.ab(attRef) === 'truant') { v.loaf = !v.loaf; if (!v.loaf) { this.say(`${this.Nm(attRef)} paresse !`); return; } }
    const foePressure = this.aliveSlots(1 - attRef.side).some((sl) => this.ab({ side: 1 - attRef.side, slot: sl }) === 'pressure');
    if (!charged && !v.rampage && mv.id !== 165) {
      const mSlot = a.slot ?? m.moves.findIndex((q) => q.id === mv.id);
      if (mSlot >= 0 && m.moves[mSlot]) m.moves[mSlot].pp = Math.max(0, m.moves[mSlot].pp - (foePressure ? 2 : 1));
    }
    this.say(`${this.Nm(attRef)} utilise ${mv.n} !`);
    if (mv.id !== 165 && /^choice-/.test(m.item || '') && v.choice == null) v.choice = mv.id;
    if (mv.key === 'fake-out' && v.turns > 1) { this.say('Mais cela échoue !'); return; }
    if (mv.c === 'status' && m.item === 'assault-vest') { this.say(`La Veste de Combat empêche ${this.nm(attRef)} d'utiliser ${mv.n} !`); return; }
    if (x.rampage && !v.rampage) v.rampage = { id: mv.id, turns: 2 + this.r(2) };

    if (x.u === 'protect' || x.u === 'detect') {
      if (this.ab(attRef) === 'stance-change' && m.sp === 681 && v.blade) {
        v.blade = false;
        this.say(`${this.Nm(attRef)} passe en Forme Parade !`);
      }
      const ok = this.r(Math.pow(2, Math.min(4, v.protChain))) === 0;
      if (ok) { v.protect = true; v.protChain++; this.ev.push({ t: 'anim', side: attRef.side, slot: attRef.slot, k: 'protect' }); this.say(`${this.Nm(attRef)} se protège !`); }
      else { v.protChain = 0; this.say('Mais cela échoue !'); }
      return;
    }
    v.protChain = 0;
    if (this.ab(attRef) === 'stance-change' && m.sp === 681 && mv.c !== 'status' && !v.blade) {
      v.blade = true;
      this.say(`${this.Nm(attRef)} passe en Forme Assaut !`);
    }

    const { targets, isSpread, selfTarget } = this.resolveTargets(attRef, a, mv);
    if (!selfTarget && !targets.length) { this.say('Mais il n\'y a pas de cible...'); return; }

    const attAb = this.ab(attRef);
    const bypassProtect = VANISH_MOVES.has(mv.key) || ((attAb === 'unseen-fist' || attAb === 'piercing-drill') && isContact(mv));

    // Filtrage protection / esquive pour savoir qui est effectivement touché
    const hitTargets = [];
    for (const dRef of targets) {
      const T = this.act(dRef), tv = this.vol(dRef);
      if (!T || isFainted(T)) { if (!isSpread) this.say('Mais il n\'y a pas de cible...'); continue; }
      if (!selfTarget && tv.protect) {
        if (bypassProtect) { tv.protect = false; this.say(`${this.Nm(attRef)} passe à travers la protection de ${this.nm(dRef)} !`); }
        else { this.say(`${this.Nm(dRef)} se protège !`); if (!isSpread) v.rampage = null; continue; }
      }
      if (!selfTarget && !this.hits(attRef, dRef, mv)) {
        this.say(`${this.Nm(attRef)} rate ${this.slots > 1 ? this.nm(dRef) : 'son attaque'} !`);
        if (!isSpread) v.rampage = null;
        if (['jump-kick', 'high-jump-kick'].includes(mv.key)) { this.say(`${this.Nm(attRef)} s'écrase au sol !`); this.hp(attRef, -Math.floor(m.stats[0] / 8)); }
        continue;
      }
      hitTargets.push(dRef);
    }
    if (!hitTargets.length) { boomOut(); return; }

    const type = this.moveType(attRef, mv);
    if (attAb === 'protean' && !v.proteanUsed && mv.id !== 165) {
      v.types = [type]; v.proteanUsed = true;
      this.say(`${this.Nm(attRef)} prend le type ${TYPE_FR_MSG[type] || type} grâce à Protéen !`);
    }
    const primaryTgt = hitTargets[0];
    this.ev.push({
      t: 'move',
      side: attRef.side,
      slot: attRef.slot,
      targetSide: primaryTgt.side,
      targetSlot: primaryTgt.slot,
      targets: hitTargets.map((t) => ({ side: t.side, slot: t.slot })),
      move: mv.id,
      type,
    });

    if (mv.c === 'status' && !selfTarget && !a._bounced) {
      const mirrored = [], normal = [];
      for (const dRef of hitTargets) {
        if (dRef.side !== attRef.side && this.defAb(attRef, dRef) === 'magic-bounce') mirrored.push(dRef);
        else normal.push(dRef);
      }
      if (mirrored.length) {
        for (const dRef of mirrored) {
          this.say(`Miroir Magik de ${this.nm(dRef)} renvoie ${mv.n} !`);
          if (x.u === 'roar' || x.u === 'whirlwind') this.special(dRef, attRef, mv);
          else this.statusMove(dRef, attRef, mv, [attRef]);
        }
        if (!normal.length) { this.afterRampage(attRef); return; }
        hitTargets.length = 0; hitTargets.push(...normal);
      }
    }

    if (this.special(attRef, hitTargets[0], mv)) { this.afterRampage(attRef); return; }
    if (mv.c === 'status' && x.u !== 'rest' && x.u !== 'belly-drum' && x.u !== 'reflect' && x.u !== 'light-screen' && x.u !== 'mist' && x.u !== 'safeguard' && x.u !== 'haze') {
      if (mv.tg === 4 || mv.tg === 7 || mv.tg === 12 || mv.tg === 13 || mv.tg === 14) {
        this.statusMove(attRef, hitTargets[0], mv, hitTargets);
      } else {
        for (const dRef of hitTargets) {
          if (this.defAb(attRef, dRef) === 'soundproof' && SOUND_MOVES.has(mv.key)) {
            this.say(`Anti-Bruit protège ${this.nm(dRef)} !`); continue;
          }
          this.statusMove(attRef, dRef, mv, [dRef]);
        }
      }
      return;
    }
    if (mv.c === 'status') { this.statusMove(attRef, hitTargets[0], mv, hitTargets); return; }

    const spreadMul = isSpread && hitTargets.length > 1 ? 0.75 : 1;
    const sfActive = attAb === 'sheer-force' && isSheerForceMove(mv);
    const hasUnnerveOpp = this.hasOppAbility(attRef, 'unnerve');
    let hitAny = false;

    for (const dRef of hitTargets) {
      if (isFainted(m)) break;
      const T = this.act(dRef), tv = this.vol(dRef);
      if (!T || isFainted(T)) continue;
      const tAbId = this.defAb(attRef, dRef);
      const tAb = tAbId ? ABILITIES[tAbId] : null;
      const dRawAb = this.ab(dRef);
      if (tAbId === 'soundproof' && SOUND_MOVES.has(mv.key)) { this.say(`Anti-Bruit protège ${this.nm(dRef)} !`); v.rampage = null; continue; }
      if (tAbId === 'bulletproof' && BULLET_MOVES.has(mv.key)) { this.say(`Pare-Balles protège ${this.nm(dRef)} !`); v.rampage = null; continue; }
      if (type === 'ground' && (tAbId === 'levitate' || tAbId === 'eelevate')) { this.say(`${tAb?.name || 'Lévitation'} immunise ${this.nm(dRef)} contre les attaques Sol !`); v.rampage = null; continue; }
      if (type === 'water' && tAbId === 'water-absorb') { this.say(`Absorb-Eau absorbe l'attaque et soigne ${this.nm(dRef)} !`); this.hp(dRef, Math.floor(T.stats[0] / 4)); v.rampage = null; continue; }
      if (type === 'electric' && tAbId === 'volt-absorb') { this.say(`Absorb-Volt absorbe l'électricité et soigne ${this.nm(dRef)} !`); this.hp(dRef, Math.floor(T.stats[0] / 4)); v.rampage = null; continue; }
      if (type === 'fire' && tAbId === 'flash-fire') { this.say(`Torche absorbe les flammes et renforce ${this.nm(dRef)} !`); tv.flashFire = true; v.rampage = null; continue; }
      if (type === 'water' && tAbId === 'dry-skin') { this.say(`Peau Sèche absorbe l'eau et soigne ${this.nm(dRef)} !`); this.hp(dRef, Math.floor(T.stats[0] / 4)); v.rampage = null; continue; }
      const absorb = { 'storm-drain': ['water', 4], 'lightning-rod': ['electric', 4], 'motor-drive': ['electric', 6], 'sap-sipper': ['grass', 2] }[tAbId];
      if (absorb && absorb[0] === type) { this.say(`${tAb?.name || tAbId} attire l'attaque vers ${this.nm(dRef)} !`); this.boost(dRef, absorb[1], 1, true, dRef); v.rampage = null; continue; }
      const eff = this.effOn(attRef, dRef, type);
      if (tAbId === 'wonder-guard' && eff <= 1 && this.fixedDamage(attRef, dRef, mv) == null) { this.say(`Garde Mystik protège ${this.nm(dRef)} !`); v.rampage = null; continue; }
      if (eff === 0) { this.say(`Ça n'affecte pas ${this.nm(dRef)}...`); v.rampage = null; continue; }
      if (this.fixedDamage(attRef, dRef, mv) === 0) { this.say('Mais cela échoue !'); continue; }
      if (x.cat === 9) {
        if (T.lvl > m.lvl || tAbId === 'sturdy') { this.say('Mais cela échoue !'); continue; }
        this.ev.push({ t: 'hit', side: dRef.side, slot: dRef.slot, eff: 2 });
        this.hp(dRef, -T.hp); this.say('K.O. en un coup !'); hitAny = true; continue;
      }

      const late = actedSet ? (actedSet.has(refKey(dRef)) || this._switchedThisTurn?.has(refKey(dRef))) : false;
      let hits = 1, isParentalBond = false;
      if (x.h0) hits = x.h0 === x.h1 ? x.h0 : attAb === 'skill-link' ? x.h1 : x.h0 === 2 && x.h1 === 5 ? [2, 2, 2, 3, 3, 3, 4, 5][this.r(8)] : x.h0 + this.r(x.h1 - x.h0 + 1);
      else if (attAb === 'parental-bond' && !isSpread && !x.boom && mv.key !== 'final-gambit' && mv.id !== 165) { hits = 2; isParentalBond = true; }
      let total = 0, n = 0, koRemainingHp = 0;
      for (; n < hits; n++) {
        if (isFainted(T)) break;
        const hpBeforeHit = T.hp;
        const noCrit = tAbId === 'battle-armor' || tAbId === 'shell-armor' || tAbId === 'aura-guard';
        const crit = !noCrit && this.r(24) < [1, 3, 12, 24][Math.min(3, (x.crit || 0) + (attAb === 'super-luck' ? 1 : 0) + (m.item === 'scope-lens' ? 1 : 0))];
        let p = this.movePower(attRef, dRef, mv);
        if (tv.invuln === 'dig' && ['earthquake', 'magnitude'].includes(mv.key)) p *= 2;
        let dmg = this.fixedDamage(attRef, dRef, mv);
        if (dmg == null) {
          dmg = this.damageCore(attRef, dRef, mv, p, type, crit, (85 + this.r(16)) / 100, late);
          if (spreadMul < 1) dmg = Math.max(1, Math.floor(dmg * spreadMul));
          if (isParentalBond && n === 1) dmg = Math.max(1, Math.floor(dmg * 0.25));
        } else if (eff === 0) dmg = 0;
        if (x.u === 'false-swipe' && dmg >= T.hp) dmg = T.hp - 1;
        const foeHasUnnerve = hasUnnerveOpp || this.ab(attRef) === 'unnerve';
        if (dmg > 0 && RESIST[T.item] === type && (eff > 1 || type === 'normal') && this.fixedDamage(attRef, dRef, mv) == null && !foeHasUnnerve) {
          const k = T.item; T.item = null; dmg = Math.max(1, Math.floor(dmg / 2));
          this.say(`${this.Nm(dRef)} mange sa ${itemName(k)} : elle affaiblit l'attaque !`);
        }
        if (dmg >= T.hp && T.hp === T.stats[0]) {
          if (T.item === 'focus-sash') { dmg = T.hp - 1; T.item = null; this.say(`${this.Nm(dRef)} tient bon grâce à sa Ceinture Force !`); }
          else if (tAbId === 'sturdy') { dmg = T.hp - 1; this.say(`${this.Nm(dRef)} tient bon grâce à son talent Fermeté !`); }
        }
        dmg = Math.min(dmg, T.hp);
        this.ev.push({ t: 'hit', side: dRef.side, slot: dRef.slot, eff: this.fixedDamage(attRef, dRef, mv) != null ? 1 : eff, crit });
        this.hp(dRef, -dmg);
        if (T.hp === 0) koRemainingHp = hpBeforeHit;
        tv.dmgTaken = { amount: dmg, c: mv.c };
        total += dmg;
        if (crit) {
          this.say('Coup critique !');
          if (dRawAb === 'anger-point' && !isFainted(T)) {
            this.say(`Colérique de ${this.nm(dRef)} monte son Attaque au maximum !`);
            tv.st[1] = 6; this.ev.push({ t: 'stat', side: dRef.side, slot: dRef.slot, up: true, all: this.stages(), slots: this.allStages() });
          }
        }
      }
      if (total > 0) hitAny = true;
      if (this.fixedDamage(attRef, dRef, mv) == null) {
        if (eff > 1) this.say('C\'est super efficace !');
        else if (eff < 1) this.say('Ce n\'est pas très efficace...');
      }
      if (hits > 1) this.say(`Touché ${n} fois !`);
      const targetCanFlinch = actedSet ? !actedSet.has(refKey(dRef)) : true;
      if (m.item === 'shell-bell' && total > 0 && !isFainted(m) && m.hp < m.stats[0] && !sfActive) { this.hp(attRef, Math.max(1, Math.floor(total / 8))); this.say(`${this.Nm(attRef)} récupère des PV grâce au Grelot Coque !`); }
      if (m.item === 'kings-rock' && total > 0 && targetCanFlinch && !x.flinch && !isFainted(T) && this.r(10) === 0 && tAbId !== 'inner-focus') tv.flinch = true;
      if (x.drain > 0 && total > 0 && !isFainted(m)) { const h = Math.max(1, Math.floor(total * x.drain / 100 * (m.item === 'big-root' ? 1.3 : 1))); if (this.hp(attRef, h)) this.say(`${this.Nm(dRef)} a perdu de l'énergie !`); }
      if (x.drain < 0 && total > 0 && this.ab(attRef) !== 'rock-head' && this.ab(attRef) !== 'magic-guard') { this.hp(attRef, -Math.max(1, Math.floor(total * -x.drain / 100))); this.say(`${this.Nm(attRef)} est blessé par le contrecoup !`); }
      if (isContact(mv) && total > 0 && !isFainted(T)) {
        if (T.item === 'rocky-helmet') { this.hp(attRef, -Math.max(1, Math.floor(m.stats[0] / 6))); this.say(`Le Casque Brut de ${this.nm(dRef)} blesse ${this.nm(attRef)} !`); }
        if (dRawAb === 'rough-skin') { this.hp(attRef, -Math.max(1, Math.floor(m.stats[0] / 8))); this.say(`La Peau Dure de ${this.nm(dRef)} blesse ${this.nm(attRef)} !`); }
        if (dRawAb === 'static' && this.r(100) < 30) this.inflict(attRef, 'par', mv, true, dRef);
        if (dRawAb === 'flame-body' && this.r(100) < 30) this.inflict(attRef, 'brn', mv, true, dRef);
        if (dRawAb === 'cire-brulante' && !this.sides[1].trainer?.friendly) { this.say(`La Cire Brûlante de ${this.nm(dRef)} jaillit !`); if (this.r(100) < 30) this.inflict(attRef, 'brn', mv, true, dRef); this.boost(attRef, 6, -1, true, dRef); }
        if (dRawAb === 'poison-point' && this.r(100) < 30) this.inflict(attRef, 'psn', mv, true, dRef);
        if (dRawAb === 'iron-barbs') { this.hp(attRef, -Math.max(1, Math.floor(m.stats[0] / 8))); this.say(`Épine de Fer de ${this.nm(dRef)} blesse ${this.nm(attRef)} !`); }
        if (dRawAb === 'effect-spore' && this.r(100) < 30 && !this.typesOf(attRef).includes('grass') && this.defAb(dRef, attRef) !== 'overcoat') this.inflict(attRef, ['psn', 'par', 'slp'][this.r(3)], mv, true, dRef);
        if (dRawAb === 'gooey') { this.boost(attRef, 6, -1, true, dRef); }
        if (dRawAb === 'cute-charm' && this.r(100) < 30 && m.gender && T.gender && m.gender !== T.gender && !v.conf) { v.conf = 2 + this.r(4); this.say(`Joli Sourire de ${this.nm(dRef)} rend ${this.nm(attRef)} confus !`); this.checkBerries(attRef); }
        if (this.ab(attRef) === 'poison-touch' && this.r(100) < 30) this.inflict(dRef, 'psn', mv, true, attRef);
      }
      if (total > 0 && isFainted(T) && !isFainted(m)) {
        if (isContact(mv) && dRawAb === 'aftermath') { this.hp(attRef, -Math.max(1, Math.floor(m.stats[0] / 4))); this.say(`Boom Final de ${this.nm(dRef)} blesse ${this.nm(attRef)} !`); }
        if (dRawAb === 'innards-out' && koRemainingHp > 0 && this.ab(attRef) !== 'magic-guard') { this.hp(attRef, -koRemainingHp); this.say(`Expuls'Organes de ${this.nm(dRef)} inflige ${koRemainingHp} PV à ${this.nm(attRef)} !`); }
      }
      if (total > 0 && isFainted(T) && this.ab(attRef) === 'moxie') this.boost(attRef, 2, 1, true, attRef);
      this.checkBerries(dRef);
      this.checkBerries(attRef);

      const ch = (c) => (this.ab(attRef) === 'serene-grace' ? c * 2 : c), shieldDust = tAbId === 'shield-dust';
      if (!isFainted(T) && !sfActive && !shieldDust) {
        if (x.flinch && targetCanFlinch && this.r(100) < ch(x.flinch)) {
          if (tAbId !== 'inner-focus') { tv.flinch = true; if (dRawAb === 'steadfast') this.boost(dRef, 6, 1, true, dRef); }
        }
        if (x.ail && x.ailc && this.r(100) < ch(x.ailc)) this.inflict(dRef, x.ail, mv, true, attRef);
        if (x.st && x.cat !== 7 && x.stc && this.r(100) < ch(x.stc)) for (const [s, c] of x.st) this.boost(dRef, s, c, true, attRef);
      }
      if (!isFainted(m) && x.st && x.cat === 7 && x.stc && !sfActive && this.r(100) < ch(x.stc)) {
        for (const [s, c] of x.st) this.boost(attRef, s, c, true, attRef);
      }
      if (T.status === 'frz' && type === 'fire' && !isFainted(T)) { T.status = null; this.ev.push({ t: 'status', side: dRef.side, slot: dRef.slot, status: null }); this.say(`${this.Nm(dRef)} n'est plus gelé !`); }
    }

    if (hitAny && m.item === 'life-orb' && !isFainted(m) && this.ab(attRef) !== 'magic-guard' && !sfActive) {
      this.hp(attRef, -Math.max(1, Math.floor(m.stats[0] / 10)));
      this.say(`L'Orbe Vie draine un peu d'énergie de ${this.nm(attRef)} !`);
    }
    if (mv.id === 165 && !isFainted(m)) { this.hp(attRef, -Math.max(1, Math.floor(m.stats[0] / 4))); this.say(`${this.Nm(attRef)} est blessé par le contrecoup !`); }
    if (x.boom || mv.key === 'final-gambit') this.hp(attRef, -m.hp);
    if (x.recharge) v.recharge = true;
    this.afterRampage(attRef);
  }

  afterRampage(ref) {
    const v = this.vol(ref); if (!v.rampage) return;
    v.rampage.turns--; if (v.rampage.turns <= 0) { v.rampage = null; if (!v.conf) { v.conf = 2 + this.r(4); this.say(`${this.Nm(ref)} est épuisé et devient confus !`); } }
  }

  hits(i, d, mv) {
    const tv = this.vol(d), iv = this.vol(i), x = mv.m || {};
    if (tv.invuln) {
      const ok = (tv.invuln === 'fly' || tv.invuln === 'bounce') ? ['thunder', 'gust', 'twister', 'sky-uppercut'].includes(mv.key)
        : tv.invuln === 'dig' ? ['earthquake', 'magnitude', 'fissure'].includes(mv.key)
        : tv.invuln === 'dive' ? ['surf', 'whirlpool'].includes(mv.key) : false;
      if (!ok) return false;
    }
    if (x.cat === 9) return this.r(100) < 30 + (this.act(i).lvl - this.act(d).lvl);
    if (mv.a == null || x.sure) return true;
    const ai = this.ab(i), di = this.defAb(i, d);
    if (ai === 'no-guard' || this.ab(d) === 'no-guard') return true;
    const s = Math.max(-6, Math.min(6, iv.st[6] - (ai === 'unaware' ? 0 : tv.st[7])));
    let acc = mv.a * accMul(s);
    if (ai === 'compound-eyes') acc *= 1.3;
    if (ai === 'hustle' && mv.c === 'physical') acc *= 0.8;
    if ((di === 'sand-veil' && this.weather === 'sandstorm') || (di === 'snow-cloak' && this.weather === 'hail')) acc *= 0.8;
    if (di === 'tangled-feet' && tv.conf) acc *= 0.5;
    if (di === 'wonder-skin' && mv.c === 'status') acc = Math.min(acc, 50);
    return this.r(100) < acc;
  }

  fixedDamage(i, d, mv) {
    const u = mv.m?.u, m = this.act(i), T = this.act(d);
    if (u === 'dragon-rage') return 40;
    if (u === 'sonic-boom') return 20;
    if (u === 'seismic-toss' || u === 'night-shade') return m.lvl;
    if (u === 'super-fang') return Math.max(1, Math.floor(T.hp / 2));
    if (u === 'psywave') return Math.max(1, Math.floor(m.lvl * (5 + this.r(11)) / 10));
    if (u === 'endeavor') return Math.max(0, T.hp - m.hp);
    if (u === 'counter' || u === 'mirror-coat') { const t = this.vol(i).dmgTaken; return t && t.c === (u === 'counter' ? 'physical' : 'special') ? t.amount * 2 : 0; }
    if (mv.key === 'metal-burst') { const t = this.vol(i).dmgTaken; return t ? Math.floor(t.amount * 1.5) : 0; }
    if (mv.key === 'final-gambit') return m.hp;
    return null;
  }

  special(attRef, dRef, mv) {
    const aR = this.norm(attRef), dR = this.norm(dRef);
    const u = mv.m?.u, m = this.act(aR), v = this.vol(aR), T = this.act(dR);
    if (!u) return false;
    switch (u) {
      case 'splash': this.say('Mais rien ne se passe !'); return true;
      case 'teleport': if (this.sansFuite) this.say('Mais cela échoue !'); else if (this.wild && aR.side === 0) { this.say(`${this.Nm(aR)} se téléporte !`); this.end('run'); } else if (this.wild) { this.say(`${this.Nm(aR)} se téléporte !`); this.end('fled'); } else this.say('Mais cela échoue !'); return true;
      case 'rest':
        if (m.hp >= m.stats[0] || this.ab(aR) === 'insomnia' || this.ab(aR) === 'vital-spirit' || (this.terrain === 'electric' && this.isGrounded(aR))) { this.say('Mais cela échoue !'); return true; }
        m.status = 'slp'; m.slp = 3; this.ev.push({ t: 'status', side: aR.side, slot: aR.slot, status: 'slp' });
        this.hp(aR, m.stats[0]); this.say(`${this.Nm(aR)} s'endort et récupère ses PV !`); this.checkBerries(aR); return true;
      case 'belly-drum':
        if (m.hp <= m.stats[0] / 2) { this.say('Mais cela échoue !'); return true; }
        this.hp(aR, -Math.floor(m.stats[0] / 2)); v.st[1] = 6; this.ev.push({ t: 'stat', side: aR.side, slot: aR.slot, up: true, all: this.stages(), slots: this.allStages() });
        this.say(`${this.Nm(aR)} sacrifie des PV et monte son Attaque au maximum !`); return true;
      case 'pain-split': { const avg = Math.floor((m.hp + T.hp) / 2); this.hp(aR, avg - m.hp); this.hp(dR, avg - T.hp); this.say('Les deux Pokémon partagent leur douleur !'); return true; }
      case 'haze': for (const s of this.sides) for (const vs of s.vs) vs.st = [0, 0, 0, 0, 0, 0, 0, 0]; this.ev.push({ t: 'stat', side: -1, all: this.stages(), slots: this.allStages() }); this.say('Les changements de stats sont annulés !'); return true;
      case 'reflect': case 'light-screen': {
        const k = u === 'reflect' ? 'reflect' : 'light', scr = this.sides[aR.side].screens;
        if (scr[k]) { this.say('Mais cela échoue !'); return true; }
        scr[k] = 5; this.say(u === 'reflect' ? 'Protection augmente la résistance aux attaques physiques !' : 'Mur Lumière augmente la résistance aux attaques spéciales !'); return true;
      }
      case 'mist': case 'safeguard': { const scr = this.sides[aR.side].screens; if (scr[u]) { this.say('Mais cela échoue !'); return true; } scr[u] = 5; this.say(u === 'mist' ? `${this.Nm(aR)} s'entoure de brume !` : `${this.Nm(aR)} est protégé par un voile mystique !`); return true; }
      case 'roar': case 'whirlwind': {
        if (this.sansFuite && dR.side === 1) { this.say('Mais cela échoue !'); return true; }
        if (this.wild && this.slots === 1 && !this.sansFuite) {
          this.say(aR.side === 0 ? `${this.Nm(dR)} prend la fuite !` : 'Tu es renvoyé !');
          this.end(aR.side === 0 ? 'win-flee' : 'fled');
          return true;
        }
        const tId = this.defAb(aR, dR);
        if (tId === 'suction-cups' || tId === 'guard-dog') {
          this.say(`${ABILITIES[tId]?.name || tId} ancre ${this.nm(dR)} solidement au sol !`);
          return true;
        }
        const bench = this.roarBench(dR.side, dR.slot);
        if (!bench.length) { this.say('Mais cela échoue !'); return true; }
        const pick = bench[this.r(bench.length)];
        if (this.slots === 1 && dR.slot === 0) this.doSwitch(dR.side, pick, false, true);
        else this.doSwitchSlot(dR.side, dR.slot, pick, false, true);
        return true;
      }
      case 'present':
        if (this.r(5) === 0) { this.hp(dR, Math.floor(T.stats[0] / 4)); this.say(`${this.Nm(dR)} récupère des PV !`); return true; }
        return false;
      default: return false;
    }
  }

  statusMove(attRef, dRef, mv, multiTargets) {
    const aR = this.norm(attRef), dR = this.norm(dRef);
    const x = mv.m || {}, m = this.act(aR), T = this.act(dR);
    let did = false;
    if (x.cat === 3 || x.heal) {
      const target = (mv.tg === 3 || mv.tg === 10) ? dR : aR, tm = this.act(target);
      if (tm.hp >= tm.stats[0]) { this.say('Mais ses PV sont déjà au maximum !'); return; }
      this.hp(target, Math.max(1, Math.floor(tm.stats[0] * (x.heal || 50) / 100))); this.say(`${this.Nm(target)} récupère des PV !`); return;
    }
    if (x.ail) {
      if (POWDER_MOVES.has(mv.key) && (this.typesOf(dR).includes('grass') || this.defAb(aR, dR) === 'overcoat')) {
        this.say(this.typesOf(dR).includes('grass') ? `Ça n'affecte pas ${this.nm(dR)}...` : `Envelocape protège ${this.nm(dR)} !`);
        return;
      }
      if (mv.key === 'thunder-wave' && !this.inverse && this.typesOf(dR).includes('ground')) { this.say(`Ça n'affecte pas ${this.nm(dR)}...`); return; }
      did = this.inflict(dR, x.ail, mv, false, aR) || did;
    }
    if (x.st) {
      const isSelf = mv.tg === 7 || (x.st.every(([, c]) => c > 0) && mv.tg !== 10 && mv.tg !== 11 && mv.tg !== 13 && mv.tg !== 14);
      const tgtList = isSelf ? [aR] : (multiTargets || [dR]);
      for (const t of tgtList) {
        if (!isSelf && POWDER_MOVES.has(mv.key) && (this.typesOf(t).includes('grass') || this.defAb(aR, t) === 'overcoat')) {
          this.say(this.typesOf(t).includes('grass') ? `Ça n'affecte pas ${this.nm(t)}...` : `Envelocape protège ${this.nm(t)} !`);
          continue;
        }
        for (const [s, c] of x.st) did = this.boost(t, s, c, false, aR) || did;
      }
    }
    if (!x.ail && !x.st) this.say('Mais cela échoue !');
  }

  inflict(dRef, ail, mv, secondary, srcRef) {
    const dR = this.norm(dRef), T = this.act(dR), tv = this.vol(dR);
    const fail = () => { if (!secondary) this.say('Mais cela échoue !'); return false; };
    if (!T || isFainted(T)) return false;
    const types = this.typesOf(dR), scr = this.sides[dR.side].screens;
    const tid = srcRef ? this.defAb(srcRef, dR) : this.ab(dR);
    if (POWDER_MOVES.has(mv?.key) && (types.includes('grass') || tid === 'overcoat')) return fail();
    if (ail === 'conf' && tid === 'own-tempo') return fail();
    if (ail === 'conf') {
      if (tv.conf) { if (!secondary) this.say(`${this.Nm(dR)} est déjà confus !`); return false; }
      tv.conf = 2 + this.r(4); this.ev.push({ t: 'anim', side: dR.side, slot: dR.slot, k: 'confused' }); this.say(`${this.Nm(dR)} devient confus !`);
      this.checkBerries(dR);
      return true;
    }
    if (ail === 'seed') {
      if (types.includes('grass') || tv.seed) return fail();
      const healer = srcRef ? this.norm(srcRef) : { side: 1 - dR.side, slot: 0 };
      tv.seed = healer; this.say(`${this.Nm(dR)} est infecté !`); return true;
    }
    if (ail === 'trap') {
      if (!tv.trap) { tv.trap = { t: 4 + this.r(2), by: srcRef ? refKey(this.norm(srcRef)) : null }; this.say(`${this.Nm(dR)} est pris au piège !`); }
      return true;
    }
    let st = ail;
    if (ail === 'psn' && mv.key === 'toxic') st = 'tox';
    if (T.status) { if (!secondary) this.say(T.status === st ? `${this.Nm(dR)} ${STATUS_TXT[st].replace(/^est /, 'est déjà ').replace(/^s'est endormi/, 'dort déjà')}` : 'Mais cela échoue !'); return false; }
    if (scr.safeguard) return fail();
    if ((st === 'psn' || st === 'tox') && (types.includes('poison') || types.includes('steel'))) return fail();
    if (st === 'brn' && types.includes('fire')) return fail();
    if (st === 'par' && types.includes('electric')) return fail();
    if (st === 'frz' && types.includes('ice')) return fail();
    if (st === 'slp' && this.terrain === 'electric' && this.isGrounded(dR)) return fail();
    const immune = { limber: ['par'], insomnia: ['slp'], 'vital-spirit': ['slp'], immunity: ['psn', 'tox'], 'water-veil': ['brn'], 'fire-mane': ['brn'], 'magma-armor': ['frz'] }[tid];
    if ((immune && immune.includes(st)) || (tid === 'leaf-guard' && this.weather === 'sun')) { if (!secondary) this.say(`${ABILITIES[tid]?.name || tid} protège ${this.nm(dR)} !`); return false; }
    T.status = st;
    if (st === 'slp') T.slp = 2 + this.r(4);
    if (st === 'tox') T.tox = 0;
    this.ev.push({ t: 'status', side: dR.side, slot: dR.slot, status: st });
    this.say(`${this.Nm(dR)} ${STATUS_TXT[st]}`);
    if (st === 'slp') tv.rampage = null;
    if (this.ab(dR) === 'synchronize' && ['psn', 'tox', 'par', 'brn'].includes(st) && !this._sync) {
      const src = srcRef ? this.norm(srcRef) : { side: 1 - dR.side, slot: 0 };
      const sm = this.act(src);
      if (sm && !isFainted(sm) && !sm.status) { this._sync = true; this.say(`Synchro de ${this.nm(dR)} s'active !`); this.inflict(src, st === 'tox' ? 'psn' : st, mv, true, dR); this._sync = false; }
    }
    this.checkBerries(dR);
    return true;
  }

  boost(ref, sid, c, secondary, srcRef = null) {
    const r = this.norm(ref), v = this.vol(r), m = this.act(r), s = sid - 1;
    if (!m || isFainted(m)) return false;
    const sr = srcRef ? this.norm(srcRef) : (this.lastUser ? this.norm(this.lastUser) : null);
    const byOther = c < 0 && (!sr || sr.side !== r.side || sr.slot !== r.slot);
    const byFoe = c < 0 && (!sr || sr.side !== r.side);
    const id = (byOther && sr) ? this.defAb(sr, r) : this.ab(r);
    const rawId = this.ab(r);
    if (c < 0 && this.sides[r.side].screens.mist && byFoe && !(sr && this.ab(sr) === 'infiltrator')) {
      if (!secondary) this.say(`${this.Nm(r)} est protégé par la brume !`); return false;
    }
    if (byOther && (id === 'clear-body' || id === 'white-smoke' || (id === 'hyper-cutter' && s === 1) || (id === 'coeur-vaillant' && s === 1) || (id === 'keen-eye' && s === 6) || (id === 'big-pecks' && s === 2))) {
      if (!secondary || sid === 2) this.say(`${ABILITIES[id]?.name || id} de ${this.nm(r)} empêche la baisse !`); return false;
    }
    let delta = c;
    if (rawId === 'simple') delta *= 2;
    if (id === 'contrary') delta = -delta;
    const before = v.st[s];
    v.st[s] = Math.max(-6, Math.min(6, v.st[s] + delta));
    const name = STAGE_NAMES[s];
    if (v.st[s] === before) { if (!secondary) this.say(`${name[0].toUpperCase() + name.slice(1)} de ${this.nm(r)} ne peut plus ${delta > 0 ? 'augmenter' : 'baisser'} !`); return false; }
    this.ev.push({ t: 'stat', side: r.side, slot: r.slot, up: delta > 0, all: this.stages(), slots: this.allStages() });
    const amt = Math.abs(delta) >= 2 ? 'beaucoup ' : '';
    this.say(`${name[0].toUpperCase() + name.slice(1)} de ${this.nm(r)} ${delta > 0 ? 'augmente' : 'baisse'}${amt ? ' ' + amt.trim() : ''} !`);
    if (delta < 0 && m.item === 'white-herb') {
      for (let k = 0; k < v.st.length; k++) if (v.st[k] < 0) v.st[k] = 0;
      m.item = null; this.ev.push({ t: 'stat', side: r.side, slot: r.slot, up: true, all: this.stages(), slots: this.allStages() });
      this.say(`${this.Nm(r)} utilise son Herbe Blanche : ses stats reviennent à la normale !`);
    }
    if (byFoe && delta < 0 && (rawId === 'defiant' || rawId === 'competitive') && !this._defiant) {
      this._defiant = true; this.say(`${ABILITIES[rawId]?.name || rawId} de ${this.nm(r)} s'active !`);
      this.boost(r, rawId === 'defiant' ? 2 : 4, 2, true, r); this._defiant = false;
    }
    return true;
  }

  eotOrder() { return [0, 1]; }
  endOfTurn() {
    for (const i of this.eotOrder()) {
      for (let slot = 0; slot < this.slots; slot++) {
        const ref = { side: i, slot }, m = this.act(ref), v = this.vol(ref);
        v.protect = false;
        if (!m || isFainted(m)) continue;
        const abId = this.ab(ref), mg = abId === 'magic-guard', types = this.typesOf(ref);
        if (abId === 'poison-heal' && (m.status === 'psn' || m.status === 'tox')) {
          if (m.hp < m.stats[0]) { this.hp(ref, Math.max(1, Math.floor(m.stats[0] / 8))); this.say(`Soin Poison soigne ${this.nm(ref)} !`); }
        } else if (mg) { /* Garde Magik */ }
        else if (m.status === 'brn') { this.ev.push({ t: 'anim', side: i, slot, k: 'burn' }); this.say(`${this.Nm(ref)} souffre de sa brûlure !`); this.hp(ref, -Math.max(1, Math.floor(m.stats[0] / 8))); }
        else if (m.status === 'psn') { this.ev.push({ t: 'anim', side: i, slot, k: 'poison' }); this.say(`${this.Nm(ref)} souffre du poison !`); this.hp(ref, -Math.max(1, Math.floor(m.stats[0] / 8))); }
        else if (m.status === 'tox') { m.tox = Math.min(15, (m.tox || 0) + 1); this.ev.push({ t: 'anim', side: i, slot, k: 'poison' }); this.say(`${this.Nm(ref)} souffre du poison !`); this.hp(ref, -Math.max(1, Math.floor(m.stats[0] * m.tox / 16))); }
        if (isFainted(m)) continue;
        if (v.seed && !mg) {
          const healer = typeof v.seed === 'object' ? v.seed : { side: 1 - i, slot: 0 };
          if (!isFainted(this.act(healer))) {
            const dmg = this.hp(ref, -Math.max(1, Math.floor(m.stats[0] / 8)));
            this.ev.push({ t: 'anim', side: i, slot, k: 'seed' }); this.say(`Vampigraine draine l'énergie de ${this.nm(ref)} !`);
            this.hp(healer, dmg);
          }
        }
        if (isFainted(m)) continue;
        const trapN = typeof v.trap === 'object' ? v.trap.t : v.trap;
        if (trapN > 0) {
          const nt = trapN - 1;
          v.trap = typeof v.trap === 'object' ? (nt ? { ...v.trap, t: nt } : 0) : nt;
          this.say(`${this.Nm(ref)} est blessé par le piège !`); this.hp(ref, -Math.max(1, Math.floor(m.stats[0] / 16)));
          if (!v.trap) this.say(`${this.Nm(ref)} est libéré !`);
        }
        if (isFainted(m)) continue;
        if (m.item === 'black-sludge') {
          if (types.includes('poison')) { if (m.hp < m.stats[0]) { this.hp(ref, Math.max(1, Math.floor(m.stats[0] / 16))); this.say(`${this.Nm(ref)} récupère un peu de PV grâce à sa Boue Noire !`); } }
          else if (!mg) { this.hp(ref, -Math.max(1, Math.floor(m.stats[0] / 8))); this.say(`${this.Nm(ref)} est blessé par la Boue Noire !`); if (isFainted(m)) continue; }
        }
        if (m.item === 'leftovers' && m.hp < m.stats[0]) { this.hp(ref, Math.max(1, Math.floor(m.stats[0] / 16))); this.say(`${this.Nm(ref)} récupère un peu de PV grâce à ses Restes !`); }
        const wImm = ['magic-guard', 'overcoat'].includes(abId);
        if (this.weather === 'sandstorm' && !wImm && !['sand-veil', 'sand-rush', 'sand-force'].includes(abId)) {
          if (!types.includes('rock') && !types.includes('ground') && !types.includes('steel')) { this.hp(ref, -Math.max(1, Math.floor(m.stats[0] / 16))); this.say(`${this.Nm(ref)} est blessé par la tempête de sable !`); }
        } else if (this.weather === 'hail' && !wImm && !['ice-body', 'snow-cloak', 'slush-rush'].includes(abId)) {
          if (!types.includes('ice')) { this.hp(ref, -Math.max(1, Math.floor(m.stats[0] / 16))); this.say(`${this.Nm(ref)} est blessé par la grêle !`); }
        }
        if (abId === 'speed-boost' && !isFainted(m)) this.boost(ref, 6, 1, true, ref);
        if (abId === 'bad-dreams' && !isFainted(m)) {
          for (const fRef of this.validFoeTargets(ref, null)) {
            const fm = this.act(fRef);
            if (fm && !isFainted(fm) && fm.status === 'slp' && this.ab(fRef) !== 'magic-guard') {
              this.hp(fRef, -Math.max(1, Math.floor(fm.stats[0] / 8)));
              this.say(`${this.Nm(fRef)} est tourmenté par un Mauvais Rêve !`);
            }
          }
        }
        if (!isFainted(m)) {
          const heal = (f, txt) => { if (m.hp < m.stats[0]) { this.hp(ref, Math.max(1, Math.floor(m.stats[0] * f))); this.say(txt); } };
          const w = this.weather;
          if (abId === 'rain-dish' && w === 'rain') heal(1 / 16, `Cuvette soigne ${this.nm(ref)} !`);
          if (abId === 'ice-body' && w === 'hail') heal(1 / 16, `Corps Gel soigne ${this.nm(ref)} !`);
          if (abId === 'dry-skin' && w === 'rain') heal(1 / 8, `Peau Sèche soigne ${this.nm(ref)} !`);
          if ((abId === 'dry-skin' || abId === 'solar-power') && w === 'sun') { this.hp(ref, -Math.max(1, Math.floor(m.stats[0] / 8))); this.say(`${this.Nm(ref)} souffre du soleil !`); }
          if (abId === 'healer' && this.slots > 1) {
            for (const sl of this.aliveSlots(i)) {
              if (sl === slot) continue;
              const allyRef = { side: i, slot: sl }, ally = this.act(allyRef);
              if (ally?.status && this.rng() < 0.3) {
                ally.status = null; ally.slp = 0; ally.tox = 0;
                this.ev.push({ t: 'status', side: i, slot: sl, status: null });
                this.say(`Cœur Soin de ${this.nm(ref)} soigne le statut de ${this.nm(allyRef)} !`);
              }
            }
          }
          const cure = (abId === 'shed-skin' && this.r(100) < 30) || (abId === 'hydration' && w === 'rain');
          if (cure && m.status && !isFainted(m)) { m.status = null; m.slp = 0; m.tox = 0; this.ev.push({ t: 'status', side: i, slot, status: null }); this.say(`${ABILITIES[abId]?.name || abId} guérit ${this.nm(ref)} !`); }
        }
        this.checkBerries(ref);
      }
    }
    if (this.weatherTurns > 0) {
      this.weatherTurns--;
      if (this.weatherTurns === 0 && this.weather !== 'none') {
        const back = this.baseWeather !== this.weather && !this.baseWeatherTurns ? this.baseWeather : 'none';
        this.setWeather(back, 0);
      }
    }
    if (this.terrainTurns > 0) {
      this.terrainTurns--;
      if (this.terrainTurns === 0 && this.terrain !== 'none') this.setTerrain('none', 0);
    }
    if (this.chaosWeather && this.state !== 'over' && this.aliveSlots(0).length && this.aliveSlots(1).length) {
      const opts = ['rain', 'sun', 'sandstorm', 'hail'].filter((w) => w !== this.weather);
      const nextW = opts[this.r(opts.length)];
      this.say('La faille déchaîne un nouveau climat !');
      this.setWeather(nextW, 0);
    }
    for (const s of this.sides) for (const k of Object.keys(s.screens)) { s.screens[k]--; if (s.screens[k] <= 0) { delete s.screens[k]; this.say(k === 'reflect' ? 'L\'effet de Protection prend fin.' : k === 'light' ? 'L\'effet de Mur Lumière prend fin.' : k === 'mist' ? 'La brume se dissipe.' : 'Le voile mystique disparaît.'); } }
    this.checkFaints(false);
  }

  /** gère les K.O. (en 1v1 stoppe le tour dès le K.O., en 2v2/3v3 laisse finir le tour sauf si un camp entier est K.O.) */
  checkFaints(midTurn = false) {
    let stop = false;
    for (let slot = 0; slot < this.slots; slot++) {
      const foe = this.monAt(1, slot);
      if (foe && isFainted(foe) && !foe._ko) {
        foe._ko = true;
        this.ev.push({ t: 'faint', side: 1, slot });
        this.say(`${this.Nm({ side: 1, slot })} est K.O. !`);
        this.awardExp(foe);
        stop = true;
      }
    }
    for (let slot = 0; slot < this.slots; slot++) {
      const me = this.monAt(0, slot);
      if (me && isFainted(me) && !me._ko) {
        me._ko = true;
        this.ev.push({ t: 'faint', side: 0, slot });
        this.say(`${monName(me)} est K.O. !`);
        stop = true;
      }
    }
    const foeLeft = this.sides[1].party.some((m) => m.hp > 0), meLeft = this.sides[0].party.some((m) => m.hp > 0);
    if (!meLeft) { this.loseBattle(); return true; }
    if (!foeLeft) { this.winBattle(); return true; }

    if (this.slots === 1) {
      if (midTurn) return stop;
      const faint1 = isFainted(this.foe), faint0 = isFainted(this.me);
      if (!faint1 && !faint0) return false;
      if (faint1) {
        const tr = this.sides[1].trainer;
        const aliveFoes = this.sides[1].party.filter((m) => m.hp > 0).length;
        if (tr && (tr.leader != null || tr.champion || tr.cls === 'Champion' || tr.cls === 'Championne') && aliveFoes === 1 && !this.gymCrisisTriggered) {
          this.gymCrisisTriggered = true;
          this.ev.push({ t: 'gym-tension', foe: this.sides[1].party.find((m) => m.hp > 0), trainer: tr });
          this.say(`${tr.name} : « C'est mon dernier partenaire... Mais notre volonté est inébranlable ! »`);
        }
        const idx = this.foePickBestReplacement(0);
        if (faint0) { this.state = 'switch'; this.pendingFoe = idx; this.ev.push({ t: 'switch-prompt' }); return true; }
        this.doSwitch(1, idx, true);
      }
      if (faint0) { this.state = 'switch'; this.ev.push({ t: 'switch-prompt' }); }
      return true;
    }

    // 2v2 / 3v3 : on ne remplit les emplacements K.O. qu'en fin de tour
    if (midTurn) return false;

    const emptyFoeSlots = [], emptyMeSlots = [];
    for (let sl = 0; sl < this.slots; sl++) {
      const f = this.monAt(1, sl), m = this.monAt(0, sl);
      if (f && isFainted(f)) emptyFoeSlots.push(sl);
      if (m && isFainted(m)) emptyMeSlots.push(sl);
    }
    const foeBench = this.sides[1].party.map((q, j) => (q && q.hp > 0 && !this.sides[1].activeSlots.includes(j) ? j : -1)).filter((j) => j >= 0);
    const meBench = this.sides[0].party.map((q, j) => (q && q.hp > 0 && !this.sides[0].activeSlots.includes(j) ? j : -1)).filter((j) => j >= 0);

    const pendingFoe = [];
    for (const sl of emptyFoeSlots) {
      if (foeBench.length) {
        const idx = this.foePickBestReplacement(sl, foeBench);
        const k = foeBench.indexOf(idx);
        if (k >= 0) foeBench.splice(k, 1); else foeBench.shift();
        this.doSwitchSlot(1, sl, idx, true, false);
        pendingFoe.push({ side: 1, slot: sl });
      } else {
        this.sides[1].activeSlots[sl] = -1;
      }
    }
    const tr = this.sides[1].trainer;
    const aliveFoes = this.sides[1].party.filter((m) => m.hp > 0).length;
    if (emptyFoeSlots.length && tr && (tr.leader != null || tr.champion || tr.cls === 'Champion' || tr.cls === 'Championne') && aliveFoes === 1 && !this.gymCrisisTriggered) {
      this.gymCrisisTriggered = true;
      this.ev.push({ t: 'gym-tension', foe: this.sides[1].party.find((m) => m.hp > 0), trainer: tr });
      this.say(`${tr.name} : « C'est mon dernier partenaire... Mais notre volonté est inébranlable ! »`);
    }

    const needMe = [];
    for (const sl of emptyMeSlots) {
      if (needMe.length < meBench.length) needMe.push(sl);
      else this.sides[0].activeSlots[sl] = -1;
    }
    if (needMe.length) {
      this.needPlayerSlots = needMe;
      this.pendingFoeSlots = pendingFoe;
      this.state = 'switch';
      this.ev.push({ t: 'switch-prompt', slots: [...needMe] });
      return true;
    }
    if (pendingFoe.length) {
      for (const r of this.sortBySpeed(pendingFoe)) this.triggerEntry(r);
    }
    return false;
  }

  awardExp(foe) {
    const S = SPECIES[foe.sp], party = this.sides[0].party;
    const ps = party.filter((m) => this.participants.has(m.uid) && m.hp > 0);
    if (!ps.length) return;
    const xpMul = !this.wild && this.sides[1]?.trainer?.xpMul != null ? this.sides[1].trainer.xpMul : 1;
    const rawBase = ((this.wild ? 1 : 1.5) * S.xp * foe.lvl) / (7 * ps.length);
    const base = Math.floor(xpMul === 1 ? rawBase : rawBase * xpMul);
    for (const m of ps) {
      const idx = party.indexOf(m), slot = this.sides[0].activeSlots.indexOf(idx);
      gainEffort(m, foe.sp);
      if (m.lvl >= 100) continue;
      if (m.lvl >= this.cap) {
        if (!this.capDit) { this.capDit = true; this.say(`${monName(m)} a atteint la limite de niveau actuelle (N.${this.cap}) !`); }
        continue;
      }
      const amount = Math.max(1, base), lv0 = m.lvl, p0 = this.expFrac(m);
      const steps = gainExp(m, amount, this.cap);
      this.say(`${monName(m)} gagne ${amount} points d'Exp. !`);
      this.ev.push({ t: 'exp', idx, slot, from: p0, lv0, to: this.expFrac(m), lv: m.lvl, active: slot >= 0 });
      for (const st of steps) {
        this.levelUps.add(m.uid);
        this.ev.push({ t: 'level', idx, slot, lvl: st.lvl, before: st.before, after: st.after, hp: m.hp, active: slot >= 0 });
        this.say(`${monName(m)} monte au niveau ${st.lvl} !`);
        for (const id of st.learned) { this.ev.push({ t: 'sfx', k: 'learn' }); this.say(`${monName(m)} apprend ${MOVES[id].n} !`); }
        for (const id of st.ask) this.ev.push({ t: 'ask-learn', idx, move: id });
      }
      if (m.lvl >= this.cap && steps.length) this.say(`${monName(m)} atteint la limite de niveau actuelle (N.${this.cap}) !`);
    }
  }
  expFrac(m) { return expProgress(m, this.cap); }

  winBattle() {
    const t = this.sides[1].trainer;
    if (t) {
      this.ev.push({ t: 'trainer-back' });
      this.say(`Tu as battu ${nomDresseur(t)} !`);
      if (t.lose) for (const l of [].concat(t.lose)) this.ev.push({ t: 'msg', text: l, speaker: t.name });
      const last = this.sides[1].party[this.sides[1].party.length - 1];
      this.prizeMoney = (t.prize || 20) * last.lvl * (this.slots > 1 ? this.slots : 1);
      this.say(`Tu remportes ${this.prizeMoney} ₽ !`);
    }
    this.end('win');
  }
  loseBattle() {
    this.say('Tu n\'as plus de Pokémon en forme !');
    if (!this.sides[1].trainer?.friendly) this.say('Tu perds connaissance dans la panique...');
    this.end('lose');
  }
  end(result) {
    this.state = 'over'; this.result = result;
    for (const s of this.sides) revertMegas(s.party);
    for (const s of this.sides) for (const m of s.party) delete m._ko;
    for (const m of this.sides[0].party) if (m.status === 'tox') m.status = 'psn';
    this.ev.push({ t: 'end', result });
  }
}
