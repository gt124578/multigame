// odyssee/js/core/battle.js — moteur de combat 1 contre 1 (règles de la 4e génération, simplifiées), sans DOM.
// Le moteur calcule un tour d'un coup et renvoie une liste d'événements que la vue rejoue (textes, PV, animations).
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { TYPE_CHART } from '../data/types.js';
import { monName, gainExp, gainEffort, isFainted, expProgress } from './mon.js';
import { ITEMS, itemName, applyItem } from './items.js';

export const STAGE_NAMES = { 1: 'l\'Attaque', 2: 'la Défense', 3: 'l\'Attaque Spéciale', 4: 'la Défense Spéciale', 5: 'la Vitesse', 6: 'la Précision', 7: 'l\'Esquive' };
const STATUS_TXT = { par: 'est paralysé ! Il aura du mal à attaquer !', slp: 's\'est endormi !', frz: 'est gelé !', brn: 'est brûlé !', psn: 'est empoisonné !', tox: 'est gravement empoisonné !' };
const HP_TYPES = ['fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark'];

export function typeEff(mt, defTypes) {
  let e = 1; for (const d of defTypes) { const r = TYPE_CHART[mt]?.[d]; if (r != null) e *= r; } return e;
}
export function hiddenPower(m) {
  const order = [0, 1, 2, 5, 3, 4]; let t = 0, p = 0;
  order.forEach((s, i) => { t += (m.iv[s] & 1) << i; p += ((m.iv[s] >> 1) & 1) << i; });
  return { type: HP_TYPES[Math.floor(t * 15 / 63)], power: Math.floor(p * 40 / 63) + 30 };
}
const stageMul = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
const accMul = (s) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s));
const freshVol = () => ({ st: [0, 0, 0, 0, 0, 0, 0, 0], conf: 0, flinch: false, charge: null, recharge: false, protect: false, protChain: 0, seed: false, trap: 0, rampage: null, invuln: null, dmgTaken: null, turns: 0 });

export class Battle {
  /**
   * @param o.player { name, party, bag }   bag = { item: qté } (modifié par le combat)
   * @param o.foe    { name, party, trainer?: { cls, name, prize, items: {item:qté}, ai } }
   */
  constructor(o) {
    this.rng = o.rng || Math.random;
    this.wild = !o.foe.trainer;
    this.sides = [
      { name: o.player.name, party: o.player.party, active: 0, v: freshVol(), screens: {}, player: true },
      { name: o.foe.name, party: o.foe.party, active: 0, v: freshVol(), screens: {}, trainer: o.foe.trainer || null },
    ];
    this.bag = o.player.bag || {};
    this.sides[0].active = Math.max(0, o.player.party.findIndex((m) => m.hp > 0));
    this.participants = new Set();
    this.runTries = 0;
    this.state = 'choose';
    this.result = null;
    this.ev = [];
    this.turn = 0;
    this.dex = o.dex || null; // { seen: Set } facultatif
    this.prizeMoney = 0;
    this.levelUps = new Set();
  }
  get me() { return this.sides[0].party[this.sides[0].active]; }
  get foe() { return this.sides[1].party[this.sides[1].active]; }
  act(i) { return this.sides[i].party[this.sides[i].active]; }
  r(n) { return Math.floor(this.rng() * n); }
  say(text) { this.ev.push({ t: 'msg', text }); }
  nm(i) { const m = this.act(i); return i === 1 ? (this.wild ? `${monName(m)} sauvage` : `${monName(m)} ennemi`) : monName(m); }
  Nm(i) { const s = this.nm(i); return s[0].toUpperCase() + s.slice(1); }

  start() {
    this.ev = [];
    const f = this.foe, t = this.sides[1].trainer;
    if (this.wild) this.say(`Un ${monName(f)} sauvage apparaît !`);
    else { this.say(`${t.cls} ${t.name} veut se battre !`); this.ev.push({ t: 'send', side: 1, idx: 0 }); this.say(`${t.cls} ${t.name} envoie ${monName(f)} !`); }
    this.ev.push({ t: 'send', side: 0, idx: this.sides[0].active });
    this.say(`En avant ! ${monName(this.me)} !`);
    this.participants.add(this.me.uid);
    return this.flush();
  }
  flush() { const e = this.ev; this.ev = []; return e; }

  /* ---------------- statistiques effectives ---------------- */
  stat(i, k, crit = false, atkSide = true) {
    const m = this.act(i), v = this.sides[i].v; let s = v.st[k];
    if (crit) s = atkSide ? Math.max(0, s) : Math.min(0, s);
    let x = Math.floor(m.stats[k] * stageMul(s));
    if (k === 5 && m.status === 'par') x = Math.floor(x / 4);
    return Math.max(1, x);
  }

  /* ---------------- choix du joueur ---------------- */
  usableMoves(i) { const m = this.act(i); return m.moves.map((x, k) => (x.pp > 0 ? k : -1)).filter((k) => k >= 0); }
  forcedAction(i) {
    const v = this.sides[i].v;
    if (v.recharge) return { type: 'recharge' };
    if (v.charge) return { type: 'move', id: v.charge };
    if (v.rampage) return { type: 'move', id: v.rampage.id };
    return null;
  }

  /** action = { type:'move', idx } | { type:'switch', idx } | { type:'item', item, target, moveIdx } | { type:'run' } */
  playerAction(action) {
    if (this.state !== 'choose') return [];
    this.ev = [];
    this.turn++;
    const forced = this.forcedAction(0);
    let a = forced || action;
    if (a.type === 'move' && a.idx != null) {
      const mv = this.me.moves[a.idx];
      if (!this.usableMoves(0).length) a = { type: 'move', id: 165 };
      else if (!mv || mv.pp <= 0) { this.turn--; return [{ t: 'msg', text: 'Plus de PP pour cette attaque !' }]; }
      else a = { type: 'move', id: mv.id, slot: a.idx };
    }
    const b = this.foeChoose();
    this.resolve(a, b);
    return this.flush();
  }

  /** après un K.O. du Pokémon du joueur : choix du suivant */
  playerSwitch(idx) {
    if (this.state !== 'switch') return [];
    this.ev = [];
    if (this.pendingFoe != null) { this.doSwitch(1, this.pendingFoe, true); this.pendingFoe = null; }
    this.doSwitch(0, idx, true);
    this.state = 'choose';
    return this.flush();
  }
  canSwitchTo(idx) { const m = this.sides[0].party[idx]; return m && m.hp > 0 && idx !== this.sides[0].active; }

  /* ---------------- IA ---------------- */
  foeChoose() {
    const forced = this.forcedAction(1); if (forced) return forced;
    const side = this.sides[1], m = this.foe, t = side.trainer;
    const usable = this.usableMoves(1);
    if (!usable.length) return { type: 'move', id: 165 };
    if (this.wild) { const k = usable[this.r(usable.length)]; return { type: 'move', id: m.moves[k].id, slot: k }; }
    // objets de soin du dresseur
    if (t.items) {
      const ratio = m.hp / m.stats[0];
      for (const it of ['hyper-potion', 'super-potion', 'potion', 'full-restore']) {
        if (t.items[it] > 0 && ratio < 0.28 && this.rng() < 0.75) { t.items[it]--; return { type: 'item', item: it, foe: true }; }
      }
    }
    const scores = usable.map((k) => {
      const mv = MOVES[m.moves[k].id];
      let s;
      if (mv.c !== 'status' && (mv.p > 0 || mv.m?.u)) {
        const d = this.estimate(1, 0, mv);
        s = d * ((mv.a || 100) / 100);
        if (d >= this.me.hp) s *= 1.6;
        if (mv.m?.recharge || mv.m?.boom) s *= 0.6;
      } else {
        const x = mv.m || {};
        if (x.ail && !['conf', 'seed', 'trap'].includes(x.ail)) s = this.me.status ? 0 : this.me.stats[0] * 0.28;
        else if (x.ail === 'conf') s = this.sides[0].v.conf ? 0 : this.me.stats[0] * 0.18;
        else if (x.ail === 'seed') s = this.sides[0].v.seed || this.me && SPECIES[this.me.sp].t.includes('grass') ? 0 : this.me.stats[0] * 0.2;
        else if (x.heal || x.u === 'rest') s = m.hp < m.stats[0] * 0.45 ? m.stats[0] * 0.5 : 0;
        else if (x.st) s = this.sides[1].v.turns < 2 ? this.me.stats[0] * 0.15 : this.me.stats[0] * 0.03;
        else s = this.me.stats[0] * 0.05;
      }
      return { k, s: Math.max(0.01, s) };
    });
    let pick;
    if (t.ai === 'smart' && this.rng() < 0.8) pick = scores.reduce((a, b) => (b.s > a.s ? b : a));
    else {
      const tot = scores.reduce((a, x) => a + x.s * x.s, 0); let r = this.rng() * tot; pick = scores[0];
      for (const x of scores) { r -= x.s * x.s; if (r <= 0) { pick = x; break; } }
    }
    return { type: 'move', id: m.moves[pick.k].id, slot: pick.k };
  }
  estimate(a, d, mv) {
    const p = this.movePower(a, d, mv); if (!p) return mv.m?.u ? this.act(d).stats[0] * 0.2 : 0;
    const t = this.moveType(a, mv);
    return this.damageCore(a, d, mv, p, t, false, 0.92);
  }

  /* ---------------- résolution d'un tour ---------------- */
  resolve(a, b) {
    const acts = [{ i: 0, a }, { i: 1, a: b }];
    for (const s of this.sides) { s.v.flinch = false; s.v.dmgTaken = null; }
    // actions sans attaque d'abord
    for (const x of acts) {
      if (this.state === 'over') return;
      if (x.a.type === 'run') { if (this.tryRun()) return; x.done = true; }
      else if (x.a.type === 'switch') { this.doSwitch(x.i, x.a.idx, false); x.done = true; }
      else if (x.a.type === 'item') { if (this.useItem(x.i, x.a)) return; x.done = true; }
    }
    const movers = acts.filter((x) => !x.done);
    const prio = (x) => (x.a.type === 'move' ? MOVES[x.a.id].pr : 0);
    movers.sort((p, q) => prio(q) - prio(p) || this.stat(q.i, 5) - this.stat(p.i, 5) || (this.rng() < 0.5 ? -1 : 1));
    movers.forEach((x, n) => { x.first = n === 0 && movers.length === 2; });
    for (const x of movers) {
      if (this.state === 'over') return;
      if (isFainted(this.act(x.i))) continue;
      if (x.a.type === 'recharge') { this.say(`${this.Nm(x.i)} doit se recharger !`); this.sides[x.i].v.recharge = false; continue; }
      this.useMove(x.i, x.a, x.first);
      if (this.checkFaints()) break;
    }
    if (this.state !== 'over') this.endOfTurn();
  }

  tryRun() {
    if (!this.wild) { this.say('Impossible de fuir un combat de Dresseur !'); return false; }
    this.runTries++;
    const a = this.stat(0, 5), b = this.stat(1, 5);
    const f = Math.floor(a * 128 / b) + 30 * this.runTries;
    if (a >= b || f > 255 || this.r(256) < f) { this.ev.push({ t: 'sfx', k: 'run' }); this.say('Vous prenez la fuite !'); this.end('run'); return true; }
    this.say('Impossible de fuir !'); return false;
  }

  doSwitch(i, idx, afterFaint) {
    const side = this.sides[i];
    if (!afterFaint) { this.say(i === 0 ? `${monName(this.me)}, reviens !` : `${side.trainer.cls} ${side.trainer.name} rappelle ${monName(this.foe)} !`); this.ev.push({ t: 'recall', side: i }); }
    if (side.v.seed) { /* la graine part avec le Pokémon */ }
    side.active = idx; side.v = freshVol();
    this.ev.push({ t: 'send', side: i, idx });
    if (i === 0) { this.say(`En avant ! ${monName(this.me)} !`); this.participants.add(this.me.uid); }
    else { this.say(`${side.trainer.cls} ${side.trainer.name} envoie ${monName(this.foe)} !`); this.participants = new Set([this.me.uid]); }
    // un Pokémon ennemi pris au piège est libéré
    this.sides[1 - i].v.trap = 0;
  }

  useItem(i, a) {
    if (i === 1) {
      const m = this.foe, t = this.sides[1].trainer, before = m.hp;
      applyItem(a.item, m);
      this.say(`${t.cls} ${t.name} utilise ${itemName(a.item)} !`);
      this.ev.push({ t: 'hp', side: 1, hp: m.hp, from: before });
      return false;
    }
    const it = ITEMS[a.item];
    this.bag[a.item] = (this.bag[a.item] || 0) - 1; if (this.bag[a.item] <= 0) delete this.bag[a.item];
    if (it.ball) return this.throwBall(a.item);
    const m = this.sides[0].party[a.target], before = m.hp;
    this.say(`Vous utilisez ${itemName(a.item)} !`);
    const msg = applyItem(a.item, m, a.moveIdx ?? -1);
    if (m.hp > 0) delete m._ko;
    if (a.target === this.sides[0].active) this.ev.push({ t: 'hp', side: 0, hp: m.hp, from: before, status: m.status });
    this.ev.push({ t: 'sfx', k: 'heal' });
    this.say(msg || 'Mais cela n\'a aucun effet...');
    return false;
  }

  throwBall(item) {
    this.say(`Vous lancez une ${itemName(item)} !`);
    if (!this.wild) { this.ev.push({ t: 'ball', item, blocked: true }); this.say('Le Dresseur dévie la Ball !'); this.say('Voler, c\'est mal !'); return false; }
    const m = this.foe, S = SPECIES[m.sp], max = m.stats[0];
    const st = m.status === 'slp' || m.status === 'frz' ? 2 : m.status ? 1.5 : 1;
    const a = Math.floor(((3 * max - 2 * m.hp) * S.cr * ITEMS[item].ball) / (3 * max) * st);
    let shakes = 0, caught = false;
    if (a >= 255) { shakes = 4; caught = true; }
    else {
      const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / Math.max(1, a))));
      while (shakes < 4 && this.r(65536) < b) shakes++;
      caught = shakes === 4;
    }
    this.ev.push({ t: 'ball', item, shakes: Math.min(3, shakes), caught });
    if (caught) {
      m.ball = item; m.status = m.status === 'frz' ? null : m.status;
      this.say(`Et hop ! ${monName(m)} est attrapé !`);
      this.end('caught');
      return true;
    }
    this.say(['Oh non ! La créature s\'est libérée !', 'Raaah ! Ça y était presque !', 'Aaaah ! Presque !', 'Mince ! Ça y était presque !'][shakes] || 'Raté !');
    return false;
  }

  moveType(i, mv) { return mv.m?.u === 'hidden-power' ? hiddenPower(this.act(i)).type : mv.t; }
  movePower(i, d, mv) {
    const u = mv.m?.u, m = this.act(i), t = this.act(d);
    if (u === 'hidden-power') return hiddenPower(m).power;
    if (u === 'flail' || u === 'reversal') { const p = Math.floor(48 * m.hp / m.stats[0]); return p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20; }
    if (u === 'low-kick') { const w = SPECIES[t.sp].w || 100; return w < 100 ? 20 : w < 250 ? 40 : w < 500 ? 60 : w < 1000 ? 80 : w < 2000 ? 100 : 120; }
    if (u === 'return') return 102;
    if (u === 'frustration') return 40;
    if (u === 'facade') return m.status ? 140 : 70;
    if (u === 'magnitude') return [10, 30, 50, 70, 90, 110, 150][[0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6][this.r(100)]];
    return mv.p || 0;
  }

  damageCore(a, d, mv, power, type, crit, rand) {
    const A = this.act(a), D = this.act(d);
    const phys = mv.c === 'physical';
    const atk = this.stat(a, phys ? 1 : 3, crit, true), def = this.stat(d, phys ? 2 : 4, crit, false);
    let dmg = Math.floor(Math.floor(Math.floor(2 * A.lvl / 5 + 2) * power * atk / def) / 50);
    if (phys && A.status === 'brn') dmg = Math.floor(dmg / 2);
    const scr = this.sides[d].screens;
    if (!crit && ((phys && scr.reflect) || (!phys && scr.light))) dmg = Math.floor(dmg / 2);
    dmg += 2;
    if (crit) dmg *= 2;
    dmg = Math.floor(dmg * rand);
    if (SPECIES[A.sp].t.includes(type)) dmg = Math.floor(dmg * 1.5);
    dmg = Math.floor(dmg * typeEff(type, SPECIES[D.sp].t));
    return Math.max(1, dmg);
  }

  hp(i, delta, cause) {
    const m = this.act(i), before = m.hp;
    m.hp = Math.max(0, Math.min(m.stats[0], m.hp + delta));
    if (m.hp !== before) this.ev.push({ t: 'hp', side: i, hp: m.hp, from: before, cause });
    return before - m.hp;
  }

  useMove(i, a, first) {
    const d = 1 - i, side = this.sides[i], v = side.v, m = this.act(i), mv = MOVES[a.id], x = mv.m || {};
    v.turns++; this.lastUser = i;
    // statuts qui empêchent d'agir
    if (m.status === 'frz') {
      if (this.r(5) === 0) { m.status = null; this.ev.push({ t: 'status', side: i, status: null }); this.say(`${this.Nm(i)} n'est plus gelé !`); }
      else { this.say(`${this.Nm(i)} est gelé !`); v.charge = null; v.rampage = null; return; }
    }
    if (m.status === 'slp') {
      m.slp--;
      if (m.slp <= 0) { m.status = null; this.ev.push({ t: 'status', side: i, status: null }); this.say(`${this.Nm(i)} se réveille !`); }
      else { this.ev.push({ t: 'anim', side: i, k: 'sleep' }); this.say(`${this.Nm(i)} dort profondément.`); v.charge = null; v.rampage = null; return; }
    }
    if (v.flinch) { this.say(`${this.Nm(i)} a peur ! Il ne peut pas attaquer !`); v.charge = null; return; }
    if (v.conf > 0) {
      v.conf--;
      if (v.conf === 0) this.say(`${this.Nm(i)} n'est plus confus !`);
      else {
        this.ev.push({ t: 'anim', side: i, k: 'confused' });
        this.say(`${this.Nm(i)} est confus !`);
        if (this.r(2) === 0) {
          const atk = this.stat(i, 1), def = this.stat(i, 2);
          const dmg = Math.max(1, Math.floor(Math.floor(Math.floor(2 * m.lvl / 5 + 2) * 40 * atk / def) / 50) + 2);
          this.say('Il se blesse dans sa confusion !');
          this.ev.push({ t: 'hit', side: i, eff: 1 });
          this.hp(i, -dmg); v.charge = null; v.rampage = null; return;
        }
      }
    }
    if (m.status === 'par' && this.r(4) === 0) { this.ev.push({ t: 'anim', side: i, k: 'para' }); this.say(`${this.Nm(i)} est paralysé ! Il n'a pas pu attaquer !`); v.charge = null; v.rampage = null; return; }

    // attaques en deux temps : premier tour
    if (x.charge && v.charge !== mv.id) {
      v.charge = mv.id;
      const slot = m.moves.findIndex((q) => q.id === mv.id); if (slot >= 0 && m.moves[slot].pp > 0) m.moves[slot].pp--;
      const txt = { 'solar-beam': 'absorbe la lumière !', 'razor-wind': 'se prépare !', 'sky-attack': 'est entouré d\'une lumière intense !', 'skull-bash': 'baisse la tête !', fly: 's\'envole !', dig: 's\'enfonce dans le sol !', dive: 'plonge !', bounce: 'saute très haut !' }[mv.key] || 'se concentre !';
      if (['fly', 'dig', 'dive', 'bounce'].includes(mv.key)) { v.invuln = mv.key; this.ev.push({ t: 'hide', side: i, on: true }); }
      if (mv.key === 'skull-bash') this.boost(i, 3, 1, true);
      this.say(`${this.Nm(i)} ${txt}`);
      return;
    }
    const charged = v.charge === mv.id; v.charge = null;
    if (v.invuln) { v.invuln = null; this.ev.push({ t: 'hide', side: i, on: false }); }

    // PP
    if (!charged && !v.rampage && mv.id !== 165) { const slot = a.slot ?? m.moves.findIndex((q) => q.id === mv.id); if (slot >= 0 && m.moves[slot]) m.moves[slot].pp = Math.max(0, m.moves[slot].pp - 1); }
    this.say(`${this.Nm(i)} utilise ${mv.n} !`);
    if (mv.id === 165) { /* Lutte */ }
    if (x.rampage && !v.rampage) v.rampage = { id: mv.id, turns: 2 + this.r(2) };

    const T = this.act(d), tv = this.sides[d].v;
    const selfTarget = mv.tg === 7 || mv.tg === 4 || mv.tg === 13 || mv.tg === 5 || mv.tg === 12 || mv.tg === 6;
    // protection
    if (x.u === 'protect' || x.u === 'detect') {
      const ok = this.r(Math.pow(2, Math.min(4, v.protChain))) === 0;
      if (ok) { v.protect = true; v.protChain++; this.ev.push({ t: 'anim', side: i, k: 'protect' }); this.say(`${this.Nm(i)} se protège !`); }
      else { v.protChain = 0; this.say('Mais cela échoue !'); }
      return;
    }
    v.protChain = 0;
    if (!selfTarget && tv.protect) { this.say(`${this.Nm(d)} se protège !`); v.rampage = null; return; }
    if (!selfTarget && isFainted(T)) { this.say('Mais il n\'y a pas de cible...'); return; }

    // précision
    if (!selfTarget && !this.hits(i, d, mv)) {
      this.say(`${this.Nm(i)} rate son attaque !`); v.rampage = null;
      if (['jump-kick', 'high-jump-kick'].includes(mv.key)) { this.say(`${this.Nm(i)} s'écrase au sol !`); this.hp(i, -Math.floor(m.stats[0] / 8)); }
      return;
    }
    this.ev.push({ t: 'move', side: i, move: mv.id, type: this.moveType(i, mv) });

    // attaques à effet unique / sans dégâts directs
    if (this.special(i, d, mv)) { this.afterRampage(i); return; }

    if (mv.c === 'status') { this.statusMove(i, d, mv); return; }

    // dégâts
    const type = this.moveType(i, mv);
    const eff = typeEff(type, SPECIES[T.sp].t);
    if (eff === 0) { this.say(`Ça n'affecte pas ${this.nm(d)}...`); v.rampage = null; return; }
    if (x.cat === 9) {
      if (T.lvl > m.lvl) { this.say('Mais cela échoue !'); return; }
      this.ev.push({ t: 'hit', side: d, eff: 2 });
      this.hp(d, -T.hp); this.say('K.O. en un coup !'); return;
    }
    let hits = 1;
    if (x.h0) hits = x.h0 === x.h1 ? x.h0 : x.h0 === 2 && x.h1 === 5 ? [2, 2, 2, 3, 3, 3, 4, 5][this.r(8)] : x.h0 + this.r(x.h1 - x.h0 + 1);
    let total = 0, n = 0, critAny = false;
    for (; n < hits; n++) {
      if (isFainted(T)) break;
      const crit = this.r(16) < [1, 2, 4, 5, 8][Math.min(4, x.crit || 0)];
      let p = this.movePower(i, d, mv);
      if (tv.invuln === 'dig' && ['earthquake', 'magnitude'].includes(mv.key)) p *= 2;
      let dmg = this.fixedDamage(i, d, mv);
      if (dmg == null) dmg = this.damageCore(i, d, mv, p, type, crit, (85 + this.r(16)) / 100);
      else if (eff === 0) dmg = 0;
      if (x.u === 'false-swipe' && dmg >= T.hp) dmg = T.hp - 1;
      dmg = Math.min(dmg, T.hp);
      this.ev.push({ t: 'hit', side: d, eff: this.fixedDamage(i, d, mv) != null ? 1 : eff, crit });
      this.hp(d, -dmg);
      tv.dmgTaken = { amount: dmg, c: mv.c };
      total += dmg; if (crit) { critAny = true; this.say('Coup critique !'); }
    }
    if (this.fixedDamage(i, d, mv) == null) {
      if (eff > 1) this.say('C\'est super efficace !');
      else if (eff < 1) this.say('Ce n\'est pas très efficace...');
    }
    if (hits > 1) this.say(`Touché ${n} fois !`);
    // drain / recul
    if (x.drain > 0 && total > 0 && !isFainted(m)) { const h = Math.max(1, Math.floor(total * x.drain / 100)); if (this.hp(i, h)) this.say(`${this.Nm(d)} a perdu de l'énergie !`); }
    if (x.drain < 0 && total > 0) { this.hp(i, -Math.max(1, Math.floor(total * -x.drain / 100))); this.say(`${this.Nm(i)} est blessé par le contrecoup !`); }
    if (mv.id === 165) { this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 4))); this.say(`${this.Nm(i)} est blessé par le contrecoup !`); }
    if (x.boom) this.hp(i, -m.hp);
    if (x.recharge && !isFainted(T)) v.recharge = true;
    else if (x.recharge) v.recharge = true;
    // effets secondaires
    if (!isFainted(T)) {
      if (x.flinch && first && this.r(100) < x.flinch) tv.flinch = true;
      if (x.ail && x.ailc && this.r(100) < x.ailc) this.inflict(d, x.ail, mv, true);
      if (x.st && x.stc && this.r(100) < x.stc) for (const [s, c] of x.st) this.boost(x.cat === 7 ? i : d, s, c, true);
    } else if (x.st && x.cat === 7 && x.stc && this.r(100) < x.stc) for (const [s, c] of x.st) this.boost(i, s, c, true);
    if (T.status === 'frz' && type === 'fire' && !isFainted(T)) { T.status = null; this.ev.push({ t: 'status', side: d, status: null }); this.say(`${this.Nm(d)} n'est plus gelé !`); }
    this.afterRampage(i);
  }
  afterRampage(i) {
    const v = this.sides[i].v; if (!v.rampage) return;
    v.rampage.turns--; if (v.rampage.turns <= 0) { v.rampage = null; if (!v.conf) { v.conf = 2 + this.r(4); this.say(`${this.Nm(i)} est épuisé et devient confus !`); } }
  }

  hits(i, d, mv) {
    const tv = this.sides[d].v, x = mv.m || {};
    if (tv.invuln) {
      const ok = (tv.invuln === 'fly' || tv.invuln === 'bounce') ? ['thunder', 'gust', 'twister', 'sky-uppercut'].includes(mv.key) : tv.invuln === 'dig' ? ['earthquake', 'magnitude', 'fissure'].includes(mv.key) : ['surf', 'whirlpool'].includes(mv.key);
      if (!ok) return false;
    }
    if (x.cat === 9) return this.r(100) < 30 + (this.act(i).lvl - this.act(d).lvl);
    if (mv.a == null || x.sure) return true;
    const s = Math.max(-6, Math.min(6, this.sides[i].v.st[6] - this.sides[d].v.st[7]));
    return this.r(100) < mv.a * accMul(s);
  }

  fixedDamage(i, d, mv) {
    const u = mv.m?.u, m = this.act(i), T = this.act(d);
    if (u === 'dragon-rage') return 40;
    if (u === 'sonic-boom') return 20;
    if (u === 'seismic-toss' || u === 'night-shade') return m.lvl;
    if (u === 'super-fang') return Math.max(1, Math.floor(T.hp / 2));
    if (u === 'psywave') return Math.max(1, Math.floor(m.lvl * (5 + this.r(11)) / 10));
    if (u === 'endeavor') return Math.max(0, T.hp - m.hp);
    if (u === 'counter' || u === 'mirror-coat') { const t = this.sides[i].v.dmgTaken; return t && t.c === (u === 'counter' ? 'physical' : 'special') ? t.amount * 2 : 0; }
    return null;
  }

  special(i, d, mv) {
    const u = mv.m?.u, m = this.act(i), v = this.sides[i].v, T = this.act(d);
    if (!u) return false;
    switch (u) {
      case 'splash': this.say('Mais rien ne se passe !'); return true;
      case 'teleport': if (this.wild && i === 0) { this.say(`${this.Nm(i)} se téléporte !`); this.end('run'); } else if (this.wild) { this.say(`${this.Nm(i)} se téléporte !`); this.end('fled'); } else this.say('Mais cela échoue !'); return true;
      case 'rest':
        if (m.hp >= m.stats[0]) { this.say('Mais cela échoue !'); return true; }
        m.status = 'slp'; m.slp = 3; this.ev.push({ t: 'status', side: i, status: 'slp' });
        this.hp(i, m.stats[0]); this.say(`${this.Nm(i)} s'endort et récupère ses PV !`); return true;
      case 'belly-drum':
        if (m.hp <= m.stats[0] / 2) { this.say('Mais cela échoue !'); return true; }
        this.hp(i, -Math.floor(m.stats[0] / 2)); v.st[1] = 6; this.ev.push({ t: 'stat', side: i, up: true }); this.say(`${this.Nm(i)} sacrifie des PV et monte son Attaque au maximum !`); return true;
      case 'pain-split': { const avg = Math.floor((m.hp + T.hp) / 2); this.hp(i, avg - m.hp); this.hp(d, avg - T.hp); this.say('Les deux créatures partagent leur douleur !'); return true; }
      case 'haze': for (const s of this.sides) s.v.st = [0, 0, 0, 0, 0, 0, 0, 0]; this.say('Les changements de stats sont annulés !'); return true;
      case 'reflect': case 'light-screen': {
        const k = u === 'reflect' ? 'reflect' : 'light', scr = this.sides[i].screens;
        if (scr[k]) { this.say('Mais cela échoue !'); return true; }
        scr[k] = 5; this.say(u === 'reflect' ? 'Protection augmente la résistance aux attaques physiques !' : 'Mur Lumière augmente la résistance aux attaques spéciales !'); return true;
      }
      case 'mist': case 'safeguard': { const scr = this.sides[i].screens; scr[u] = 5; this.say(u === 'mist' ? `${this.Nm(i)} s'entoure de brume !` : `${this.Nm(i)} est protégé par un voile mystique !`); return true; }
      case 'roar': case 'whirlwind':
        if (this.wild) { this.say(i === 0 ? `${this.Nm(d)} prend la fuite !` : 'Vous êtes renvoyé !'); this.end(i === 0 ? 'win-flee' : 'fled'); }
        else this.say('Mais cela échoue !');
        return true;
      case 'present':
        if (this.r(5) === 0) { this.hp(d, Math.floor(T.stats[0] / 4)); this.say(`${this.Nm(d)} récupère des PV !`); return true; }
        return false;
      default: return false;
    }
  }

  statusMove(i, d, mv) {
    const x = mv.m || {}, m = this.act(i), T = this.act(d);
    let did = false;
    if (x.cat === 3 || x.heal) {
      if (m.hp >= m.stats[0]) { this.say('Mais ses PV sont déjà au maximum !'); return; }
      this.hp(i, Math.max(1, Math.floor(m.stats[0] * (x.heal || 50) / 100))); this.say(`${this.Nm(i)} récupère des PV !`); return;
    }
    if (x.ail) {
      if (mv.key === 'thunder-wave' && SPECIES[T.sp].t.includes('ground')) { this.say(`Ça n'affecte pas ${this.nm(d)}...`); return; }
      did = this.inflict(d, x.ail, mv, false) || did;
    }
    if (x.st) {
      const tgt = mv.tg === 7 || x.st.every(([, c]) => c > 0) && mv.tg !== 10 && mv.tg !== 11 ? i : d;
      for (const [s, c] of x.st) did = this.boost(tgt, s, c, false) || did;
    }
    if (!x.ail && !x.st) this.say('Mais cela échoue !');
  }

  inflict(d, ail, mv, secondary) {
    const T = this.act(d), tv = this.sides[d].v, types = SPECIES[T.sp].t, scr = this.sides[d].screens;
    const fail = () => { if (!secondary) this.say('Mais cela échoue !'); return false; };
    if (isFainted(T)) return false;
    if (ail === 'conf') {
      if (tv.conf) { if (!secondary) this.say(`${this.Nm(d)} est déjà confus !`); return false; }
      tv.conf = 2 + this.r(4); this.ev.push({ t: 'anim', side: d, k: 'confused' }); this.say(`${this.Nm(d)} devient confus !`); return true;
    }
    if (ail === 'seed') {
      if (types.includes('grass') || tv.seed) return fail();
      tv.seed = true; this.say(`${this.Nm(d)} est infecté !`); return true;
    }
    if (ail === 'trap') { if (!tv.trap) { tv.trap = 4 + this.r(2); this.say(`${this.Nm(d)} est pris au piège !`); } return true; }
    let st = ail;
    if (ail === 'psn' && mv.key === 'toxic') st = 'tox';
    if (T.status) { if (!secondary) this.say(T.status === st ? `${this.Nm(d)} ${STATUS_TXT[st].replace(/^est /, 'est déjà ').replace(/^s'est endormi/, 'dort déjà')}` : 'Mais cela échoue !'); return false; }
    if (scr.safeguard) return fail();
    if ((st === 'psn' || st === 'tox') && (types.includes('poison') || types.includes('steel'))) return fail();
    if (st === 'brn' && types.includes('fire')) return fail();
    if (st === 'frz' && types.includes('ice')) return fail();
    T.status = st;
    if (st === 'slp') T.slp = 2 + this.r(4);
    if (st === 'tox') T.tox = 0;
    this.ev.push({ t: 'status', side: d, status: st });
    this.say(`${this.Nm(d)} ${STATUS_TXT[st]}`);
    if (st === 'slp') { tv.rampage = null; }
    return true;
  }

  /** s = identifiant de stat PokeAPI (2 Attaque … 6 Vitesse, 7 Précision, 8 Esquive) */
  boost(i, sid, c, secondary) {
    const v = this.sides[i].v, s = sid - 1;
    if (c < 0 && this.sides[i].screens.mist && i !== this.lastUser) { if (!secondary) this.say(`${this.Nm(i)} est protégé par la brume !`); return false; }
    const before = v.st[s];
    v.st[s] = Math.max(-6, Math.min(6, v.st[s] + c));
    const name = STAGE_NAMES[s];
    if (v.st[s] === before) { if (!secondary) this.say(`${name[0].toUpperCase() + name.slice(1)} de ${this.nm(i)} ne peut plus ${c > 0 ? 'augmenter' : 'baisser'} !`); return false; }
    this.ev.push({ t: 'stat', side: i, up: c > 0 });
    const amt = Math.abs(c) >= 2 ? (c > 0 ? 'beaucoup ' : 'beaucoup ') : '';
    this.say(`${name[0].toUpperCase() + name.slice(1)} de ${this.nm(i)} ${c > 0 ? 'augmente' : 'baisse'}${amt ? ' ' + amt.trim() : ''} !`);
    return true;
  }

  endOfTurn() {
    for (const i of [0, 1]) {
      const m = this.act(i), v = this.sides[i].v;
      v.protect = false;
      if (isFainted(m)) continue;
      if (m.status === 'brn') { this.ev.push({ t: 'anim', side: i, k: 'burn' }); this.say(`${this.Nm(i)} souffre de sa brûlure !`); this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 8))); }
      if (m.status === 'psn') { this.ev.push({ t: 'anim', side: i, k: 'poison' }); this.say(`${this.Nm(i)} souffre du poison !`); this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 8))); }
      if (m.status === 'tox') { m.tox = Math.min(15, (m.tox || 0) + 1); this.ev.push({ t: 'anim', side: i, k: 'poison' }); this.say(`${this.Nm(i)} souffre du poison !`); this.hp(i, -Math.max(1, Math.floor(m.stats[0] * m.tox / 16))); }
      if (isFainted(m)) continue;
      if (v.seed && !isFainted(this.act(1 - i))) { const dmg = this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 8))); this.ev.push({ t: 'anim', side: i, k: 'seed' }); this.say(`Vampigraine draine l'énergie de ${this.nm(i)} !`); this.hp(1 - i, dmg); }
      if (isFainted(m)) continue;
      if (v.trap > 0) { v.trap--; this.say(`${this.Nm(i)} est blessé par le piège !`); this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 16))); if (!v.trap) this.say(`${this.Nm(i)} est libéré !`); }
    }
    for (const s of this.sides) for (const k of Object.keys(s.screens)) { s.screens[k]--; if (s.screens[k] <= 0) { delete s.screens[k]; if (s.player || true) this.say(k === 'reflect' ? 'L\'effet de Protection prend fin.' : k === 'light' ? 'L\'effet de Mur Lumière prend fin.' : k === 'mist' ? 'La brume se dissipe.' : 'Le voile mystique disparaît.'); } }
    this.checkFaints();
  }

  /** gère les K.O. ; renvoie true si le tour doit s'arrêter */
  checkFaints() {
    let stop = false;
    const foe = this.foe;
    if (isFainted(foe) && !foe._ko) {
      foe._ko = true;
      this.ev.push({ t: 'faint', side: 1 });
      this.say(`${this.Nm(1)} est K.O. !`);
      this.awardExp(foe);
      stop = true;
    }
    const me = this.me;
    if (isFainted(me) && !me._ko) {
      me._ko = true;
      this.ev.push({ t: 'faint', side: 0 });
      this.say(`${monName(me)} est K.O. !`);
      stop = true;
    }
    if (!stop) return false;
    // fin du combat ?
    const foeLeft = this.sides[1].party.some((m) => m.hp > 0), meLeft = this.sides[0].party.some((m) => m.hp > 0);
    if (!meLeft) { this.loseBattle(); return true; }
    if (!foeLeft) { this.winBattle(); return true; }
    if (isFainted(this.foe)) {
      // le dresseur envoie le suivant
      const side = this.sides[1], idx = side.party.findIndex((m) => m.hp > 0);
      if (isFainted(this.me)) { this.state = 'switch'; this.pendingFoe = idx; this.ev.push({ t: 'switch-prompt' }); return true; }
      this.doSwitch(1, idx, true);
    }
    if (isFainted(this.me)) { this.state = 'switch'; this.ev.push({ t: 'switch-prompt' }); }
    return true;
  }

  awardExp(foe) {
    const S = SPECIES[foe.sp], party = this.sides[0].party;
    const ps = party.filter((m) => this.participants.has(m.uid) && m.hp > 0);
    if (!ps.length) return;
    const base = Math.floor(((this.wild ? 1 : 1.5) * S.xp * foe.lvl) / (7 * ps.length));
    for (const m of ps) {
      const idx = party.indexOf(m);
      gainEffort(m, foe.sp);
      if (m.lvl >= 100) continue;
      const amount = Math.max(1, base);
      const lv0 = m.lvl, p0 = this.expFrac(m);
      const steps = gainExp(m, amount);
      this.say(`${monName(m)} gagne ${amount} points d'Exp. !`);
      this.ev.push({ t: 'exp', idx, from: p0, lv0, to: this.expFrac(m), lv: m.lvl, active: idx === this.sides[0].active });
      for (const st of steps) {
        this.levelUps.add(m.uid);
        this.ev.push({ t: 'level', idx, lvl: st.lvl, before: st.before, after: st.after, hp: m.hp, active: idx === this.sides[0].active });
        this.say(`${monName(m)} monte au niveau ${st.lvl} !`);
        for (const id of st.learned) { this.ev.push({ t: 'sfx', k: 'learn' }); this.say(`${monName(m)} apprend ${MOVES[id].n} !`); }
        for (const id of st.ask) this.ev.push({ t: 'ask-learn', idx, move: id });
      }
    }
  }
  expFrac(m) { return expProgress(m); }

  winBattle() {
    const t = this.sides[1].trainer;
    if (t) {
      this.ev.push({ t: 'trainer-back' });
      this.say(`Vous avez battu ${t.cls} ${t.name} !`);
      if (t.lose) for (const l of [].concat(t.lose)) this.ev.push({ t: 'msg', text: l, speaker: t.name });
      const last = this.sides[1].party[this.sides[1].party.length - 1];
      this.prizeMoney = (t.prize || 20) * last.lvl;
      this.say(`Vous remportez ${this.prizeMoney} ₽ !`);
    }
    this.end('win');
  }
  loseBattle() {
    this.say('Vous n\'avez plus de créature en forme !');
    // combat amical (le premier contre le rival) : pas de panique ni d'argent perdu
    if (!this.sides[1].trainer?.friendly) this.say('Vous êtes pris de panique et perdez connaissance...');
    this.end('lose');
  }
  end(result) {
    this.state = 'over'; this.result = result;
    for (const s of this.sides) for (const m of s.party) delete m._ko;
    for (const m of this.sides[0].party) if (m.status === 'tox') m.status = 'psn';
    this.ev.push({ t: 'end', result });
  }
}
