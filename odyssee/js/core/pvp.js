// odyssee/js/core/pvp.js — combat entre deux joueurs, et échanges.
//
// Combat : les deux joueurs font tourner exactement le même combat, chacun de son point de vue
// (lui en côté 0, l'adversaire en côté 1), avec le même générateur aléatoire à graine. Ils ne s'envoient
// que leurs choix (attaque, changement) : chaque écran calcule donc le même tour. Une empreinte de l'état,
// jointe à chaque choix, vérifie que les deux combats restent identiques.
// Combat amical : on se bat avec des copies soignées de ses Pokémon, sans expérience, ni argent, ni objets.

import { Battle } from './battle.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { monName, isFainted, healFull } from './mon.js';
import { seededRng } from '../net/link.js';

/** copie d'une équipe pour un combat amical : PV, PP et statuts remis à neuf */
export function battleCopy(party) {
  return party.map((m) => {
    const c = JSON.parse(JSON.stringify(m));
    healFull(c);
    delete c._ko;
    return c;
  });
}

/** un Pokémon reçu d'un autre joueur est-il lisible ? (évite qu'un message abîmé fasse planter le jeu) */
export function validMon(m) {
  if (!m || typeof m !== 'object' || !SPECIES[m.sp]) return false;
  if (!Number.isInteger(m.lvl) || m.lvl < 1 || m.lvl > 100) return false;
  if (!Array.isArray(m.stats) || m.stats.length !== 6 || !m.stats.every((x) => Number.isFinite(x) && x > 0)) return false;
  if (!Array.isArray(m.iv) || m.iv.length !== 6) return false;
  if (!Array.isArray(m.moves) || !m.moves.length || m.moves.length > 4 || !m.moves.every((x) => x && MOVES[x.id] && Number.isFinite(x.pp))) return false;
  return Number.isFinite(m.hp);
}
export const validParty = (p) => Array.isArray(p) && p.length >= 1 && p.length <= 6 && p.every(validMon);

// Évolutions par échange (Kadabra, Machopeur, Gravalanch, Spectrum)
export const TRADE_EVO = { 64: 65, 67: 68, 75: 76, 93: 94 };

export class PvpBattle extends Battle {
  /**
   * @param o.me    { name, party }               son équipe (copie)
   * @param o.foe   { name, party, bs }           l'équipe de l'adversaire (copie reçue), bs = sprite de dresseur
   * @param o.seed  graine commune
   * @param o.canon index local du côté de celui qui a lancé le défi (0 pour lui, 1 pour l'autre)
   */
  constructor(o) {
    super({
      player: { name: o.me.name, party: o.me.party, bag: {} },
      foe: { name: o.foe.name, party: o.foe.party, trainer: { cls: 'Dresseur', name: o.foe.name, bs: o.foe.bs, prize: 0 } },
      rng: seededRng(o.seed),
    });
    this.pvp = true;
    // duel entre amis : chaque dresseur peut méga-évoluer un Pokémon qui tient sa gemme ; le choix de l'autre arrive avec son action
    this.sides[0].mega = this.sides[1].mega = true;
    this.canon = o.canon;
    this.remote = null;        // choix de l'adversaire pour le tour en cours
    this.need = [false, false]; // qui doit envoyer un Pokémon après un K.O.
  }

  /** fin de tour dans le même ordre sur les deux écrans : d'abord le côté de celui qui a lancé le défi */
  eotOrder() { return [this.canon, 1 - this.canon]; }
  /** même tirage des deux côtés : on désigne le premier par son côté « canonique » */
  tie(p) {
    const first = this.rng() < 0.5 ? this.canon : 1 - this.canon;
    return p.i === first ? -1 : 1;
  }

  foeWantsMega(b) { return b?.type === 'move' && !!this.remote?.mega && this.canMega(1); }
  /** l'adversaire ne réfléchit pas ici : c'est le choix reçu de son écran */
  foeChoose() {
    const forced = this.forcedAction(1); if (forced) return forced;
    const a = this.remote || { type: 'move', idx: 0 };
    if (a.type === 'switch' && this.sides[1].party[a.idx] && this.sides[1].party[a.idx].hp > 0 && a.idx !== this.sides[1].active) return { type: 'switch', idx: a.idx };
    if (!this.usableMoves(1).length) return { type: 'move', id: 165 };
    const k = Number.isInteger(a.idx) && this.foe.moves[a.idx]?.pp > 0 ? a.idx : this.usableMoves(1)[0];
    return { type: 'move', id: this.foe.moves[k].id, slot: k };
  }

  awardExp() { /* combat amical : pas d'expérience */ }

  checkFaints() {
    let stop = false;
    for (const i of [1, 0]) {
      const m = this.act(i);
      if (isFainted(m) && !m._ko) {
        m._ko = true;
        this.ev.push({ t: 'faint', side: i });
        this.say(`${i === 1 ? this.Nm(1) : monName(m)} est K.O. !`);
        stop = true;
      }
    }
    if (!stop) return false;
    const left = (i) => this.sides[i].party.some((m) => m.hp > 0);
    if (!left(0) && !left(1)) { this.say('Les deux dresseurs n\'ont plus de Pokémon en forme !'); this.end('draw'); return true; }
    if (!left(0)) { this.loseBattle(); return true; }
    if (!left(1)) { this.winBattle(); return true; }
    this.need = [isFainted(this.act(0)), isFainted(this.act(1))];
    this.state = 'switch';
    this.ev.push({ t: 'switch-prompt' });
    return true;
  }

  /** les deux joueurs ont choisi qui envoyer : on applique dans le même ordre des deux côtés */
  switchBoth(mine, theirs) {
    if (this.state !== 'switch') return [];
    this.ev = [];
    const pick = { 0: mine, 1: theirs };
    const switched = [];
    for (const i of [this.canon, 1 - this.canon]) {
      if (!this.need[i]) continue;
      const party = this.sides[i].party;
      let idx = pick[i];
      if (!party[idx] || party[idx].hp <= 0) idx = party.findIndex((m) => m.hp > 0);
      this.doSwitch(i, idx, true, false);
      switched.push(i);
    }
    this.need = [false, false];
    if (switched.length) {
      switched.sort((p, q) => this.stat(q, 5) - this.stat(p, 5) || this.tie({ i: p }, { i: q }));
      for (const s of switched) this.triggerEntry(s);
    }
    this.state = 'choose';
    return this.flush();
  }

  winBattle() {
    this.ev.push({ t: 'trainer-back' });
    this.say(`Vous avez battu ${this.sides[1].name} !`);
    this.end('win');
  }
  loseBattle() {
    this.say('Vous n\'avez plus de Pokémon en forme !');
    this.say(`${this.sides[1].name} remporte le combat !`);
    this.end('lose');
  }
  /** fin anticipée : abandon d'un joueur, départ, ou combats qui ne concordent plus */
  stop(result, text) {
    this.ev = [];
    if (text) this.say(text);
    this.end(result);
    return this.flush();
  }

  /** empreinte de l'état, indépendante du point de vue */
  checksum() {
    const parts = [];
    for (const i of [this.canon, 1 - this.canon]) {
      const s = this.sides[i];
      // le poison grave redevient un poison simple pour son dresseur à la fin du combat : on les compte pareil
      parts.push(s.active, ...s.party.map((m) => `${m.hp}${(m.status === 'tox' ? 'psn' : m.status) || ''}`), s.v.st.join(''));
    }
    parts.push(this.turn);
    let h = 0x811c9dc5;
    const str = parts.join('|');
    for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }
}
