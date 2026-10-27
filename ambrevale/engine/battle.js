// Moteur de combat au tour par tour (1 contre 1), pur : renvoie des événements que la vue anime.
import { species } from './species.js';
import { move as MV } from './moves.js';
import { effectiveness } from './types.js';
import { monName, xpYield, gainXp } from './mon.js';
import { ITEMS } from './items.js';

const STAGE_NAMES = { atk: "l'Attaque", def: 'la Défense', spa: "l'Attaque Spéciale", spd: 'la Défense Spéciale', spe: 'la Vitesse', acc: 'la Précision', eva: "l'Esquive" };
const ST_TEXT = { psn: 'est empoisonné', brn: 'est brûlé', par: 'est paralysé', slp: "s'endort", frz: 'est gelé' };
const newStages = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });
const mult = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
const accMult = (s) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s));

export class Battle {
  constructor(o) {
    this.rng = o.rng || Math.random;
    this.wild = !!o.wild;
    this.trainer = o.trainer || null;
    this.S = [
      { mons: o.party, i: o.party.findIndex((m) => m.hp > 0), st: newStages(), vol: {}, user: true },
      { mons: o.foe, i: 0, st: newStages(), vol: {}, user: false },
    ];
    this.participants = new Set([this.S[0].i]);
    this.runs = 0; this.over = null; this.turn = 0;
    this.foePotions = this.trainer ? (this.trainer.leader || this.trainer.champion ? 2 : this.trainer.potions || 0) : 0;
    this.leveled = new Set();
  }
  mon(s) { return this.S[s].mons[this.S[s].i]; }
  nm(s, cap = true) {
    const n = monName(this.mon(s));
    if (s === 0) return n;
    const q = this.wild ? n + ' sauvage' : n + ' ennemi';
    return (cap ? 'Le ' : 'le ') + q;
  }
  r(n) { return Math.floor(this.rng() * n); }

  // ------------------------------------------------------------------ tour
  /** action = { type: 'move', index } | { type: 'switch', to } | { type: 'item', item, target } | { type: 'ball', item } | { type: 'run' } */
  turnWith(action) {
    const ev = [];
    this.turn++;
    const me = this.mon(0), foe = this.mon(1);
    const foeAct = this.foeChoice();
    let myMove = null;
    // actions sans attaque : avant tout
    if (action.type === 'run') {
      if (!this.wild) { ev.push({ t: 'text', msg: 'Impossible de fuir un combat de dresseur !' }); return { events: ev, free: true }; }
      this.runs++;
      const a = this.effSpeed(0), b = Math.max(1, this.effSpeed(1));
      const odds = Math.floor((a * 128) / b) + 30 * this.runs;
      if (odds > 255 || this.r(256) < odds) { ev.push({ t: 'sfx', id: 'run' }, { t: 'text', msg: 'Tu prends la fuite !' }); this.over = 'run'; ev.push({ t: 'end', outcome: 'run' }); return { events: ev }; }
      ev.push({ t: 'text', msg: 'Impossible de fuir !' });
    } else if (action.type === 'switch') {
      ev.push(...this.switchTo(0, action.to, true));
    } else if (action.type === 'item') {
      ev.push(...this.useItem(action.item, action.target));
    } else if (action.type === 'ball') {
      const r = this.throwBall(action.item);
      ev.push(...r);
      if (this.over) return { events: ev };
    } else if (action.type === 'move') {
      myMove = action.index;
    }
    // ordre des attaques
    const acts = [];
    if (myMove != null) acts.push({ s: 0, mi: myMove });
    if (foeAct.type === 'move') acts.push({ s: 1, mi: foeAct.index });
    else if (foeAct.type === 'item') ev.push(...this.foeUseItem());
    acts.sort((a, b) => {
      const pa = this.prioOf(a), pb = this.prioOf(b);
      if (pa !== pb) return pb - pa;
      const sa = this.effSpeed(a.s), sb = this.effSpeed(b.s);
      return sa !== sb ? sb - sa : this.rng() - 0.5;
    });
    this.S[0].vol.flinch = this.S[1].vol.flinch = false;
    for (const a of acts) {
      if (this.over) break;
      if (this.mon(a.s).hp <= 0 || this.mon(1 - a.s).hp <= 0) continue;
      ev.push(...this.useMove(a.s, a.mi));
      if (this.checkFaints(ev)) break;
    }
    // fin de tour : poison, brûlure
    if (!this.over && !this.pendingSwitch) {
      for (const s of [0, 1]) {
        const m = this.mon(s);
        if (m.hp <= 0) continue;
        if (m.status === 'psn' || m.status === 'brn') {
          const d = Math.max(1, Math.floor(m.stats.hp / (m.status === 'psn' ? 8 : 16)));
          const from = m.hp; m.hp = Math.max(0, m.hp - d);
          ev.push({ t: 'text', msg: `${this.nm(s)} souffre ${m.status === 'psn' ? 'du poison' : 'de sa brûlure'} !` }, { t: 'hp', side: s, from, to: m.hp, max: m.stats.hp, residual: true });
        }
      }
      this.checkFaints(ev);
    }
    const need = this.pendingSwitch ? 'switch' : null;
    return { events: ev, need };
  }

  prioOf(a) { const mv = this.moveOf(a.s, a.mi); return mv.fx.prio || 0; }
  moveOf(s, mi) { const m = this.mon(s); if (mi < 0 || !m.moves[mi]) return MV('lutte'); return MV(m.moves[mi].id); }
  effSpeed(s) { const m = this.mon(s); let v = m.stats.spe * mult(this.S[s].st.spe); if (m.status === 'par') v *= 0.5; return v; }

  // ------------------------------------------------------------------ IA
  foeChoice() {
    const s = 1, m = this.mon(1), t = this.mon(0);
    if (this.trainer && this.foePotions > 0 && m.hp > 0 && m.hp < m.stats.hp * 0.28 && this.rng() < 0.7) return { type: 'item' };
    const usable = m.moves.map((x, i) => [x, i]).filter(([x]) => x.pp > 0);
    if (!usable.length) return { type: 'move', index: -1 };
    const scored = usable.map(([x, i]) => [i, this.scoreMove(s, MV(x.id), m, t)]);
    if (this.wild) {
      const tot = scored.reduce((a, [, v]) => a + Math.sqrt(Math.max(1, v)), 0);
      let r = this.rng() * tot;
      for (const [i, v] of scored) { r -= Math.sqrt(Math.max(1, v)); if (r <= 0) return { type: 'move', index: i }; }
      return { type: 'move', index: scored[0][0] };
    }
    scored.sort((a, b) => b[1] - a[1]);
    const smart = this.trainer && (this.trainer.leader || this.trainer.champion) ? 0.85 : 0.65;
    if (this.rng() < smart || scored.length === 1) return { type: 'move', index: scored[0][0] };
    return { type: 'move', index: scored[1 + this.r(scored.length - 1)][0] };
  }
  scoreMove(s, mv, m, t) {
    const tS = species(t.sp).types;
    if (mv.cat !== 'X') {
      const eff = effectiveness(mv.type, tS);
      if (eff === 0) return 0;
      const stab = species(m.sp).types.includes(mv.type) ? 1.5 : 1;
      const A = mv.cat === 'P' ? m.stats.atk : m.stats.spa, D = mv.cat === 'P' ? t.stats.def : t.stats.spd;
      let v = mv.pow * stab * eff * (A / D) * ((mv.acc || 100) / 100);
      if (mv.fx.drain && m.hp < m.stats.hp * 0.6) v *= 1.2;
      if (mv.fx.multi) v *= 3;
      return v;
    }
    const f = mv.fx;
    if (f.st) { if (t.status) return 0; if (f.st === 'par' && tS.includes('elec')) return 0; if (f.st === 'brn' && tS.includes('feu')) return 0; if (f.st === 'psn' && (tS.includes('poison') || tS.includes('acier'))) return 0; return f.st === 'slp' ? 70 : 50; }
    if (f.heal) return m.hp < m.stats.hp * 0.4 ? 90 : 0;
    if (f.self) { const k = Object.keys(f.self)[0]; return this.S[s].st[k] < 2 && m.hp > m.stats.hp * 0.6 ? 38 : 2; }
    if (f.stat) { const k = Object.keys(f.stat)[0]; return this.S[1 - s].st[k] > -2 ? 28 : 1; }
    return 10;
  }

  // ------------------------------------------------------------------ attaque
  useMove(s, mi) {
    const ev = [], me = this.mon(s), side = this.S[s], tgt = 1 - s, foe = this.mon(tgt);
    let mv = this.moveOf(s, mi);
    if (mi >= 0 && me.moves[mi] && me.moves[mi].pp <= 0) mv = MV('lutte');
    // empêchements
    if (side.vol.flinch) { ev.push({ t: 'text', msg: `${this.nm(s)} a peur et ne peut pas attaquer !` }); return ev; }
    if (me.status === 'slp') {
      if (me.sleep > 0) { me.sleep--; ev.push({ t: 'text', msg: `${this.nm(s)} dort profondément.` }, { t: 'statusAnim', side: s, status: 'slp' }); return ev; }
      me.status = null; ev.push({ t: 'text', msg: `${this.nm(s)} se réveille !` }, { t: 'status', side: s, status: null });
    }
    if (me.status === 'frz') {
      if (this.rng() < 0.2) { me.status = null; ev.push({ t: 'text', msg: `${this.nm(s)} dégèle !` }, { t: 'status', side: s, status: null }); }
      else { ev.push({ t: 'text', msg: `${this.nm(s)} est gelé !` }, { t: 'statusAnim', side: s, status: 'frz' }); return ev; }
    }
    if (me.status === 'par' && this.rng() < 0.25) { ev.push({ t: 'statusAnim', side: s, status: 'par' }, { t: 'text', msg: `${this.nm(s)} est paralysé ! Il ne peut pas attaquer !` }); return ev; }
    if (side.vol.conf > 0) {
      side.vol.conf--;
      if (side.vol.conf === 0) ev.push({ t: 'text', msg: `${this.nm(s)} n'est plus confus !` });
      else {
        ev.push({ t: 'text', msg: `${this.nm(s)} est confus...` });
        if (this.rng() < 0.33) {
          const d = this.calcDamage(me, me, { pow: 40, cat: 'P', type: '???' }, side, side, false).dmg;
          const from = me.hp; me.hp = Math.max(0, me.hp - d);
          ev.push({ t: 'text', msg: 'Il se blesse dans sa confusion !' }, { t: 'hit', side: s, eff: 1 }, { t: 'hp', side: s, from, to: me.hp, max: me.stats.hp });
          return ev;
        }
      }
    }
    if (mi >= 0 && me.moves[mi] && mv.id !== 'lutte') me.moves[mi].pp--;
    ev.push({ t: 'text', msg: `${this.nm(s)} utilise ${mv.name} !` }, { t: 'use', side: s, move: mv.id, type: mv.type, cat: mv.cat });
    // précision
    if (mv.acc > 0) {
      const ch = (mv.acc / 100) * accMult(side.st.acc - this.S[tgt].st.eva);
      if (this.rng() > ch) { ev.push({ t: 'text', msg: `${this.nm(tgt)} évite l'attaque !` }); return ev; }
    }
    const f = mv.fx;
    if (mv.cat !== 'X') {
      const tTypes = species(foe.sp).types;
      const eff = effectiveness(mv.type, tTypes);
      if (eff === 0) { ev.push({ t: 'text', msg: `Ça n'affecte pas ${this.nm(tgt, false)}...` }); return ev; }
      const hits = f.multi ? [2, 2, 3, 3, 4, 5][this.r(6)] : 1;
      let total = 0, n = 0, critAny = false;
      for (let h = 0; h < hits && foe.hp > 0; h++) {
        const crit = this.rng() < (f.crit ? 0.125 : 0.0625);
        const { dmg } = this.calcDamage(me, foe, mv, side, this.S[tgt], crit);
        const from = foe.hp; foe.hp = Math.max(0, foe.hp - dmg); total += from - foe.hp; n++;
        critAny = critAny || crit;
        ev.push({ t: 'hit', side: tgt, eff, crit }, { t: 'hp', side: tgt, from, to: foe.hp, max: foe.stats.hp });
        if (crit) ev.push({ t: 'text', msg: 'Coup critique !' });
      }
      if (eff > 1) ev.push({ t: 'text', msg: "C'est super efficace !" });
      else if (eff < 1) ev.push({ t: 'text', msg: "Ce n'est pas très efficace..." });
      if (hits > 1) ev.push({ t: 'text', msg: `Touché ${n} fois !` });
      // dégel par le feu
      if (mv.type === 'feu' && foe.status === 'frz' && foe.hp > 0) { foe.status = null; ev.push({ t: 'text', msg: `${this.nm(tgt)} dégèle !` }, { t: 'status', side: tgt, status: null }); }
      if (f.drain && total > 0) { const hpb = me.hp; me.hp = Math.min(me.stats.hp, me.hp + Math.max(1, Math.floor(total * f.drain))); ev.push({ t: 'hp', side: s, from: hpb, to: me.hp, max: me.stats.hp }, { t: 'text', msg: `L'énergie ${this.nm(tgt, false).startsWith('le') ? 'du ' + this.nm(tgt, false).slice(3) : 'de ' + this.nm(tgt, false)} est drainée !` }); }
      if (f.recoil && total > 0) { const hpb = me.hp; me.hp = Math.max(0, me.hp - Math.max(1, Math.floor(total * f.recoil))); ev.push({ t: 'hp', side: s, from: hpb, to: me.hp, max: me.stats.hp }, { t: 'text', msg: `${this.nm(s)} subit le contrecoup !` }); }
      if (foe.hp > 0) {
        if (f.st && (f.ch ?? 100) > this.r(100)) ev.push(...this.inflict(tgt, f.st, true));
        if (f.stat && (f.ch ?? 100) > this.r(100)) ev.push(...this.changeStages(tgt, f.stat));
        if (f.flinch && f.flinch > this.r(100)) this.S[tgt].vol.flinch = true;
        if (f.conf && f.conf > this.r(100) && !this.S[tgt].vol.conf) { this.S[tgt].vol.conf = 2 + this.r(4); ev.push({ t: 'text', msg: `${this.nm(tgt)} devient confus !` }); }
      }
      if (me.hp > 0) {
        if (f.selfStat && (f.ch ?? 100) > this.r(100)) ev.push(...this.changeStages(s, f.selfStat));
        if (f.selfAfter) ev.push(...this.changeStages(s, f.selfAfter));
      }
      return ev;
    }
    // capacités de statut
    if (f.heal) {
      if (me.hp >= me.stats.hp) { ev.push({ t: 'text', msg: 'Mais cela échoue !' }); return ev; }
      const from = me.hp; me.hp = Math.min(me.stats.hp, me.hp + Math.floor(me.stats.hp * f.heal));
      ev.push({ t: 'heal', side: s }, { t: 'hp', side: s, from, to: me.hp, max: me.stats.hp }, { t: 'text', msg: `${this.nm(s)} récupère des PV !` });
    }
    if (f.self) ev.push(...this.changeStages(s, f.self));
    if (f.stat) ev.push(...this.changeStages(tgt, f.stat));
    if (f.st) ev.push(...this.inflict(tgt, f.st, false));
    return ev;
  }

  calcDamage(a, d, mv, sa, sd, crit) {
    const phys = mv.cat === 'P';
    let A = phys ? a.stats.atk * mult(sa.st.atk) : a.stats.spa * mult(sa.st.spa);
    let D = phys ? d.stats.def * mult(sd.st.def) : d.stats.spd * mult(sd.st.spd);
    if (crit) { A = Math.max(A, phys ? a.stats.atk : a.stats.spa); D = Math.min(D, phys ? d.stats.def : d.stats.spd); }
    let dmg = Math.floor(Math.floor(Math.floor((2 * a.level) / 5 + 2) * mv.pow * A / D) / 50) + 2;
    const aT = species(a.sp).types;
    if (aT.includes(mv.type)) dmg = Math.floor(dmg * 1.5);
    dmg = Math.floor(dmg * (mv.type === '???' ? 1 : effectiveness(mv.type, species(d.sp).types)));
    if (crit) dmg = Math.floor(dmg * 1.5);
    if (phys && a.status === 'brn') dmg = Math.floor(dmg / 2);
    dmg = Math.floor((dmg * (85 + this.r(16))) / 100);
    return { dmg: Math.max(1, dmg) };
  }

  inflict(s, st, secondary) {
    const m = this.mon(s), T = species(m.sp).types;
    const immune = (st === 'par' && T.includes('elec')) || (st === 'brn' && T.includes('feu')) || (st === 'psn' && (T.includes('poison') || T.includes('acier'))) || (st === 'frz' && T.includes('glace'));
    if (m.status || immune) return secondary ? [] : [{ t: 'text', msg: m.status ? `${this.nm(s)} a déjà un problème de statut !` : 'Mais cela échoue !' }];
    m.status = st; if (st === 'slp') m.sleep = 1 + this.r(3);
    const extra = st === 'par' ? ' Il aura du mal à attaquer !' : '';
    return [{ t: 'statusAnim', side: s, status: st }, { t: 'status', side: s, status: st }, { t: 'text', msg: `${this.nm(s)} ${ST_TEXT[st]} !${extra}` }];
  }

  changeStages(s, ch) {
    const ev = [];
    for (const [k, d] of Object.entries(ch)) {
      const st = this.S[s].st, before = st[k];
      st[k] = Math.max(-6, Math.min(6, st[k] + d));
      const nm = this.nm(s, false), who = nm.startsWith('le ') ? 'du ' + nm.slice(3) : 'de ' + nm;
      if (st[k] === before) ev.push({ t: 'text', msg: `${cap(STAGE_NAMES[k])} ${who} ne peut plus ${d > 0 ? 'augmenter' : 'baisser'} !` });
      else ev.push({ t: 'stage', side: s, up: d > 0 }, { t: 'text', msg: `${cap(STAGE_NAMES[k])} ${who} ${d > 0 ? 'augmente' : 'baisse'}${Math.abs(d) > 1 ? ' beaucoup' : ''} !` });
    }
    return ev;
  }

  // ------------------------------------------------------------------ K.O., expérience, relève
  checkFaints(ev) {
    let stop = false;
    const foe = this.mon(1), me = this.mon(0);
    if (foe.hp <= 0 && !this.S[1].fainted) {
      this.S[1].fainted = true;
      ev.push({ t: 'faint', side: 1 }, { t: 'text', msg: `${this.nm(1)} est K.O. !` });
      ev.push(...this.awardXp(foe));
      const next = this.S[1].mons.findIndex((m) => m.hp > 0);
      if (next < 0) {
        this.over = 'win';
        if (this.trainer) {
          const lvl = Math.max(...this.S[1].mons.map((m) => m.level));
          const money = this.trainer.money >= 500 ? this.trainer.money : (this.trainer.money || 30) * lvl;
          ev.push({ t: 'victory', money });
        }
        ev.push({ t: 'end', outcome: 'win' });
        return true;
      }
      if (me.hp > 0) {
        this.S[1].i = next; this.S[1].st = newStages(); this.S[1].vol = {}; this.S[1].fainted = false;
        this.participants = new Set([this.S[0].i]);
        ev.push({ t: 'foeNext', index: next, mon: this.mon(1), name: species(this.mon(1).sp).name });
      } else this.foeNextPending = next;
      stop = true;
    }
    if (me.hp <= 0 && !this.S[0].fainted) {
      this.S[0].fainted = true;
      ev.push({ t: 'faint', side: 0 }, { t: 'text', msg: `${this.nm(0)} est K.O. !` });
      this.participants.delete(this.S[0].i);
      if (!this.S[0].mons.some((m) => m.hp > 0)) { this.over = 'lose'; ev.push({ t: 'end', outcome: 'lose' }); return true; }
      this.pendingSwitch = true;
      stop = true;
    }
    return stop;
  }

  awardXp(foe) {
    const ev = [];
    const alive = [...this.participants].filter((i) => this.S[0].mons[i] && this.S[0].mons[i].hp > 0);
    if (!alive.length) return ev;
    const total = xpYield(foe, !!this.trainer);
    const each = Math.max(1, Math.floor(total / alive.length));
    for (const i of alive) {
      const m = this.S[0].mons[i];
      if (m.level >= 100) continue;
      const before = m.xp;
      const ups = gainXp(m, each);
      ev.push({ t: 'xp', index: i, amount: each, from: before, to: m.xp, msg: `${monName(m)} gagne ${each} points d'expérience !` });
      for (const u of ups) {
        this.leveled.add(i);
        ev.push({ t: 'levelUp', index: i, level: u.level, before: u.before, after: u.after, msg: `${monName(m)} monte au niveau ${u.level} !` });
        for (const id of u.learn) ev.push({ t: 'learn', index: i, move: id });
      }
    }
    return ev;
  }

  /** la vue appelle ceci quand le joueur a choisi sa relève (après un K.O. ou volontairement) */
  switchTo(s, to, voluntary = false) {
    const ev = [], side = this.S[s];
    if (voluntary && s === 0) ev.push({ t: 'recall', side: 0, msg: `${monName(this.mon(0))}, reviens !` });
    side.i = to; side.st = newStages(); side.vol = {}; side.fainted = false;
    if (s === 0) { this.participants.add(to); this.pendingSwitch = false; }
    ev.push({ t: 'sendOut', side: s, index: to, mon: this.mon(s), msg: `${s === 0 ? 'En avant, ' + monName(this.mon(s)) + ' !' : ''}` });
    // le dresseur adverse envoie sa créature suivante si les deux étaient K.O.
    if (s === 0 && this.foeNextPending != null) {
      const next = this.foeNextPending; this.foeNextPending = null;
      this.S[1].i = next; this.S[1].st = newStages(); this.S[1].vol = {}; this.S[1].fainted = false;
      this.participants = new Set([to]);
      ev.push({ t: 'foeNext', index: next, mon: this.mon(1), name: species(this.mon(1).sp).name });
    }
    return ev;
  }

  useItem(id, target) {
    const it = ITEMS[id], m = this.S[0].mons[target], ev = [];
    if (!it || !m) return ev;
    if (it.revive) { m.hp = Math.max(1, Math.floor(m.stats.hp * it.revive)); m.status = null; ev.push({ t: 'text', msg: `${monName(m)} est ranimé !` }); }
    if (it.heal) { const from = m.hp; m.hp = Math.min(m.stats.hp, m.hp + it.heal); if (target === this.S[0].i) ev.push({ t: 'heal', side: 0 }, { t: 'hp', side: 0, from, to: m.hp, max: m.stats.hp }); ev.push({ t: 'text', msg: `${monName(m)} récupère ${m.hp - from} PV !` }); }
    if (it.cure && m.status && it.cure.includes(m.status)) { m.status = null; m.sleep = 0; if (target === this.S[0].i) ev.push({ t: 'status', side: 0, status: null }); ev.push({ t: 'text', msg: `${monName(m)} est soigné !` }); }
    ev.unshift({ t: 'text', msg: `Tu utilises ${it.name}.` }, { t: 'sfx', id: 'heal' });
    return ev;
  }
  foeUseItem() {
    this.foePotions--;
    const m = this.mon(1), from = m.hp;
    m.hp = Math.min(m.stats.hp, m.hp + 120);
    return [{ t: 'text', msg: `${this.trainer.cls} ${this.trainer.name} utilise une Hyper Potion !` }, { t: 'heal', side: 1 }, { t: 'hp', side: 1, from, to: m.hp, max: m.stats.hp }];
  }

  throwBall(id) {
    const ev = [], it = ITEMS[id];
    if (!this.wild) { ev.push({ t: 'text', msg: 'Le dresseur dévie la Sphère !' }, { t: 'text', msg: 'Voler une créature, c\'est mal !' }); return ev; }
    const m = this.mon(1), sp = species(m.sp);
    const M = m.stats.hp, H = m.hp;
    let a = ((3 * M - 2 * H) * sp.rate * it.ball) / (3 * M);
    if (m.status === 'slp' || m.status === 'frz') a *= 2; else if (m.status) a *= 1.5;
    let shakes = 0, caught = false;
    if (a >= 255) { shakes = 3; caught = true; }
    else {
      const b = 65536 / Math.pow(255 / Math.max(1, a), 0.1875);
      for (shakes = 0; shakes < 4; shakes++) if (this.r(65536) >= b) break;
      caught = shakes >= 4; shakes = Math.min(3, shakes);
    }
    ev.push({ t: 'text', msg: `Tu lances une ${it.name} !` }, { t: 'ball', item: id, shakes, caught });
    if (caught) {
      ev.push({ t: 'text', msg: `Et hop ! ${sp.name} est capturé !` });
      this.over = 'caught'; this.caught = m;
      ev.push({ t: 'end', outcome: 'caught' });
    } else ev.push({ t: 'text', msg: ['Oh non ! La créature s\'est libérée !', 'Raah ! Presque !', 'Mince ! C\'était si proche !', 'Argh ! Il s\'en est fallu de peu !'][shakes] });
    return ev;
  }
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
