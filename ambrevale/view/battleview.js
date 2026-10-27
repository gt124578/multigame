// Scène de combat façon DS : écran du haut (décor, créatures, barres), écran du bas (commandes).
import { audio } from './audio.js';
import { frame, button, hpBar, xpBar, typeTag, statusTag, subBackground, topBar, drawText, drawTextCentered, drawTextRight, wrap, rrect, ballIcon, icon } from './ui.js';
import { Battle } from '../engine/battle.js';
import { species } from '../engine/species.js';
import { move as MV } from '../engine/moves.js';
import { TYPES } from '../engine/types.js';
import { monName, xpFor, learnMove, evolutionTarget, evolve, STAT_NAMES, STAT_KEYS } from '../engine/mon.js';
import { ITEMS } from '../engine/items.js';
import { creatureSprite } from '../gfx/creatures.js';
import { personSheet } from '../gfx/people.js';
import { makeCanvas, shade, noise2 } from '../gfx/pixel.js';
import { PartyPanel, BagPanel, LearnPanel } from './menus.js';

const inR = (p, x, y, w, h) => p.x >= x && p.y >= y && p.x < x + w && p.y < y + h;
const ease = (k) => 1 - (1 - k) * (1 - k);

const ENV = {
  grass: { sky: ['#78b8f0', '#d8f0ff'], far: '#5aa060', ground: ['#90cc70', '#78b858'], plat: ['#b0dc88', '#6aa048', '#c8ec9c'] },
  forest: { sky: ['#3a6a48', '#7aaa78'], far: '#2a5a38', ground: ['#5a9a4a', '#4a8a3c'], plat: ['#7ab860', '#4a7a3a', '#94cc78'] },
  cave: { sky: ['#1a1418', '#3a2e2c'], far: '#2a2220', ground: ['#5a4a42', '#4a3c36'], plat: ['#7a6a5c', '#4a3c34', '#8e7e6e'] },
  snow: { sky: ['#a8c0e0', '#eef4fc'], far: '#c8d8ec', ground: ['#f2f6fa', '#dce6f0'], plat: ['#ffffff', '#a8bcd4', '#ffffff'] },
  beach: { sky: ['#70b8f8', '#d8f0ff'], far: '#3a8ae0', ground: ['#f2dea4', '#e6cc8a'], plat: ['#f8ecc0', '#c8b070', '#fff6d8'] },
  rocky: { sky: ['#e8b880', '#f8e8c8'], far: '#a87850', ground: ['#c8a878', '#b49064'], plat: ['#dcc090', '#8a6a44', '#ecd4a8'] },
  town: { sky: ['#88c0f0', '#e0f2ff'], far: '#8a98b0', ground: ['#c8c4bc', '#b4b0a8'], plat: ['#d8d4cc', '#8a867e', '#e8e4dc'] },
  indoor: { sky: ['#d8c8a8', '#efe4cc'], far: '#c0a880', ground: ['#c89c68', '#b88a58'], plat: ['#dcb888', '#8a6438', '#ecd0a0'] },
};
const PARTICLE_COL = { feu: ['#ff8a2a', '#ffd84a', '#ff4a2a'], eau: ['#4a9af0', '#9ad0ff', '#ffffff'], plante: ['#58c048', '#9ae070', '#2a8a3a'], elec: ['#fff04a', '#ffffff', '#f0c020'], glace: ['#9ae8ff', '#ffffff', '#58b8e8'], combat: ['#ff9a4a', '#ffffff', '#e04a2a'], poison: ['#b058d0', '#e0a0f0', '#7a2a9a'], sol: ['#b8905a', '#8a6a3a', '#e0c08a'], vol: ['#ffffff', '#d8ecff', '#a8c8e8'], psy: ['#ff70b0', '#ffb0d8', '#c03a80'], insecte: ['#a8c830', '#d8f070', '#6a8a20'], roche: ['#a89878', '#8a7a5a', '#c8b898'], spectre: ['#6a4a9a', '#a080d0', '#2a1a4a'], dragon: ['#7a4af0', '#b090ff', '#4a2aa0'], tenebres: ['#3a2a3a', '#6a5a6a', '#201020'], acier: ['#d8d8e8', '#ffffff', '#9a9ab0'], fee: ['#ffa0c8', '#ffffff', '#ff70a8'], normal: ['#ffffff', '#f0f0d0', '#d8d8c0'] };

let SIL = new Map();
function silhouette(c, col = '#ffffff') {
  const k = c.width + 'x' + col + (c.__id ||= Math.random());
  if (SIL.has(k)) return SIL.get(k);
  const { c: o, ctx } = makeCanvas(c.width, c.height);
  ctx.drawImage(c, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = col; ctx.fillRect(0, 0, c.width, c.height);
  SIL.set(k, o); return o;
}

export class BattleView {
  constructor(G, o) {
    this.G = G; this.o = o; this.t = 0;
    const party = G.st.party;
    this.B = new Battle({ party, foe: o.foe, wild: o.wild, trainer: o.trainer });
    const env = (o.env || 'grass').split(':');
    this.env = env[0] === 'gym' ? 'indoor' : env[0];
    this.envPal = ENV[this.env] || ENV.grass;
    if (env[0] === 'gym') this.gymType = env[1];
    this.side = [this.mkSide(0), this.mkSide(1)];
    this.msgText = null; this.mode = 'wait'; this.sel = 0; this.msel = 0;
    this.parts = []; this.ballFx = null; this.intro = 0;
    this.trainerSprite = o.trainer ? this.bigPerson(o.look || 'youngster', 0) : null;
    this.heroSprite = this.bigPerson(G.st.look, 1);
    this.trainerX = 0; this.heroX = 0;
    this.statsBox = null;
  }
  bigPerson(look, row) {
    const sheet = personSheet(look), { c, ctx } = makeCanvas(48, 72);
    ctx.drawImage(sheet, 0, row * 24, 16, 24, 0, 0, 48, 72); return c;
  }
  mkSide(s) {
    return { s, vis: false, dx: 0, dy: 0, flash: 0, alpha: 1, scale: 1, clip: 0, hp: 0, max: 1, xp: 0, mon: null, spr: null, status: null, boxVis: false };
  }
  setMon(s) {
    const m = this.B.mon(s), S = this.side[s];
    S.mon = m; S.spr = creatureSprite(m.sp, species(m.sp).sp, s === 0 ? 'back' : 'front', 64);
    S.hp = m.hp; S.max = m.stats.hp; S.status = m.status;
    const lo = xpFor(m.level), hi = xpFor(m.level + 1); S.xp = (m.xp - lo) / Math.max(1, hi - lo);
  }

  // ------------------------------------------------------------------ outils d'animation
  tween(dur, fn) { return new Promise((res) => { const t0 = performance.now(); const st = () => { const k = Math.min(1, (performance.now() - t0) / (dur * 1000)); fn(k); if (k < 1) requestAnimationFrame(st); else res(); }; st(); }); }
  wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
  waitKey() { return new Promise((res) => { this.keyWait = res; }); }
  async msg(text, o = {}) {
    if (!text) return;
    this.msgText = { lines: wrap(this.G.fmt(text), 230), chars: 0 };
    const total = this.msgText.lines.join(' ').length;
    await new Promise((res) => { this.msgDone = res; });
    if (o.wait) { this.msgText.arrow = true; await this.waitKey(); this.msgText.arrow = false; }
    else await this.wait(o.pause ?? 700);
  }

  // ------------------------------------------------------------------ déroulé du combat
  async run() {
    const B = this.B, G = this.G, o = this.o;
    this.setMon(1); this.setMon(0);
    // entrée en scène
    this.side[1].vis = !o.trainer;
    this.side[1].dark = !o.trainer;
    this.intro = 0;
    await this.tween(0.7, (k) => { this.intro = ease(k); });
    if (o.trainer) {
      await this.msg(`${o.trainer.cls} ${o.trainer.name} veut se battre !`, { wait: true });
      await this.tween(0.35, (k) => { this.trainerX = k * 90; });
      await this.sendOutFoe(`${o.trainer.cls} ${o.trainer.name} envoie ${species(B.mon(1).sp).name} !`);
    } else {
      this.side[1].dark = false;
      audio.sfx('cry', { seed: species(B.mon(1).sp).num * 977 });
      this.side[1].boxVis = true;
      await this.msg(o.legend ? `${species(B.mon(1).sp).name} pousse un cri qui fait trembler la grotte !` : `Un ${species(B.mon(1).sp).name} sauvage apparaît !`, { wait: true });
    }
    await this.tween(0.3, (k) => { this.heroX = k * 110; });
    await this.sendOutMine(`En avant, ${monName(B.mon(0))} !`);
    // tours
    while (!B.over) {
      const action = await this.chooseAction();
      if (!action) continue;
      const r = B.turnWith(action);
      await this.play(r.events);
      if (B.over) break;
      if (r.need === 'switch') {
        const i = await this.G.openPanel(new PartyPanel(G, 'switch', { forced: true, active: B.S[0].i, hint: 'Qui envoyer au combat ?' }));
        await this.play(B.switchTo(0, i));
      }
    }
    return this.finish();
  }

  async sendOutFoe(text) {
    const S = this.side[1];
    this.setMon(1);
    S.vis = true; S.scale = 0; S.boxVis = true;
    if (text) this.msg(text, { pause: 10 });
    audio.sfx('open');
    await this.tween(0.3, (k) => { S.scale = ease(k); S.flash = 1 - k; });
    audio.sfx('cry', { seed: species(S.mon.sp).num * 977 });
    await this.wait(600);
  }
  async sendOutMine(text) {
    const S = this.side[0];
    this.setMon(0);
    if (text) this.msg(text, { pause: 10 });
    await this.wait(250);
    S.vis = true; S.scale = 0;
    audio.sfx('open');
    await this.tween(0.3, (k) => { S.scale = ease(k); S.flash = 1 - k; });
    S.boxVis = true;
    audio.sfx('cry', { seed: species(S.mon.sp).num * 977 });
    await this.wait(500);
  }

  chooseAction() {
    const m = this.B.mon(0);
    this.msgText = { lines: wrap(`Que doit faire ${monName(m)} ?`, 230), chars: 999 };
    this.mode = 'main';
    return new Promise((res) => { this.choose = res; });
  }
  async pickMain(i) {
    const G = this.G, B = this.B;
    audio.sfx('select');
    if (i === 0) { this.mode = 'moves'; this.msel = Math.min(this.msel, B.mon(0).moves.length - 1); return; }
    this.mode = 'wait';
    if (i === 1) {
      const r = await G.openPanel(new BagPanel(G, 'battle'));
      if (!r) { this.mode = 'main'; return; }
      G.st.bag[r.ball || r.item]--;
      if (r.ball) return this.resolve({ type: 'ball', item: r.ball });
      return this.resolve({ type: 'item', item: r.item, target: r.target });
    }
    if (i === 2) return this.resolve({ type: 'run' });
    if (i === 3) {
      const t = await G.openPanel(new PartyPanel(G, 'switch', { active: B.S[0].i }));
      if (t < 0) { this.mode = 'main'; return; }
      return this.resolve({ type: 'switch', to: t });
    }
  }
  pickMove(i) {
    const m = this.B.mon(0), mv = m.moves[i];
    if (!mv) return;
    if (mv.pp <= 0) { audio.sfx('bump'); if (!m.moves.some((x) => x.pp > 0)) return this.resolve({ type: 'move', index: -1 }); return; }
    audio.sfx('select');
    this.resolve({ type: 'move', index: i });
  }
  resolve(a) { this.mode = 'wait'; this.msgText = null; const c = this.choose; this.choose = null; c && c(a); }

  async play(events) {
    const B = this.B;
    for (const e of events) {
      const S = e.side != null ? this.side[e.side] : null;
      switch (e.t) {
        case 'text': await this.msg(e.msg); break;
        case 'sfx': audio.sfx(e.id); break;
        case 'use': await this.attackAnim(e); break;
        case 'hit': {
          audio.sfx(e.eff > 1 ? 'hitSuper' : e.eff < 1 ? 'hitWeak' : 'hit');
          if (e.eff > 1 || e.crit) this.G.view.shake = 0;
          for (let k = 0; k < 3; k++) { S.alpha = 0.15; await this.wait(60); S.alpha = 1; await this.wait(60); }
          break;
        }
        case 'hp': await this.animHp(S, e.from, e.to, e.max); break;
        case 'status': S.status = e.status; break;
        case 'statusAnim': audio.sfx('status'); this.burst(e.side, { slp: 'normal', psn: 'poison', brn: 'feu', par: 'elec', frz: 'glace' }[e.status] || 'normal', 14, true); await this.wait(500); break;
        case 'stage': audio.sfx('stat', { down: !e.up }); this.stageFx(e.side, e.up); await this.wait(450); break;
        case 'heal': audio.sfx('heal'); this.burst(e.side, 'plante', 18, true); await this.wait(350); break;
        case 'faint': {
          audio.sfx('cry', { seed: species(S.mon.sp).num * 977, pitch: 0.7 });
          await this.wait(350); audio.sfx('faint');
          await this.tween(0.45, (k) => { S.clip = k; });
          S.vis = false; S.clip = 0;
          if (e.side === 1) S.boxVis = false;
          break;
        }
        case 'xp': {
          await this.msg(e.msg);
          if (e.index === B.S[0].i) {
            const m = B.mon(0), lo = xpFor(m.level), hi = xpFor(m.level + 1);
            const to = Math.min(1, (m.xp - lo) / Math.max(1, hi - lo));
            const from = this.side[0].xp > to ? 0 : this.side[0].xp;
            await this.tween(0.6, (k) => { this.side[0].xp = from + (to - from) * k; });
          }
          break;
        }
        case 'levelUp': {
          audio.jingle('level');
          if (e.index === B.S[0].i) { const m = B.mon(0); this.side[0].hp = m.hp; this.side[0].max = m.stats.hp; this.side[0].xp = 0; }
          await this.msg(e.msg, { pause: 300 });
          this.statsBox = { before: e.before, after: e.after, phase: 0 };
          await this.waitKey(); this.statsBox.phase = 1; await this.waitKey(); this.statsBox = null;
          break;
        }
        case 'learn': await this.learn(B.S[0].mons[e.index], e.move); break;
        case 'recall': {
          await this.msg(e.msg, { pause: 200 });
          await this.tween(0.25, (k) => { this.side[0].scale = 1 - k; this.side[0].flash = k; });
          this.side[0].vis = false; this.side[0].boxVis = false; this.side[0].flash = 0;
          break;
        }
        case 'sendOut': if (e.side === 0) await this.sendOutMine(e.msg); break;
        case 'foeNext': await this.sendOutFoe(`${this.o.trainer.cls} ${this.o.trainer.name} envoie ${e.name} !`); break;
        case 'ball': await this.ballAnim(e); break;
        case 'victory': {
          audio.play('victory', true);
          await this.tween(0.4, (k) => { this.trainerX = 90 * (1 - k); });
          await this.msg(`Tu as battu ${this.o.trainer.cls} ${this.o.trainer.name} !`, { wait: true });
          if (this.o.trainer.lose) await this.msg(this.o.trainer.lose, { wait: true });
          this.G.st.money += e.money;
          await this.msg(`Tu remportes ${e.money.toLocaleString('fr-FR')} ¤ !`, { wait: true });
          break;
        }
        case 'end': if (e.outcome === 'win' && this.o.wild) audio.play('victory', true); break;
      }
    }
  }

  async learn(m, id) {
    const G = this.G, M = MV(id), n = monName(m);
    if (m.moves.length < 4) { learnMove(m, id); audio.jingle('level'); return this.msg(`${n} apprend ${M.name} !`, { wait: true }); }
    await this.msg(`${n} veut apprendre ${M.name}...`, { wait: true });
    await this.msg(`Mais ${n} connaît déjà quatre capacités.`, { wait: true });
    const r = await G.openPanel(new LearnPanel(G, m, id));
    if (r < 0) return this.msg(`${n} n'apprend pas ${M.name}.`, { wait: true });
    const old = MV(m.moves[r].id).name;
    learnMove(m, id, r);
    await this.msg(`1, 2 et... Tada ! ${n} oublie ${old}...`, { wait: true });
    await this.msg(`Et ${n} apprend ${M.name} !`, { wait: true });
  }

  async animHp(S, from, to, max) {
    const d = Math.abs(to - from); if (!d) return;
    S.max = max;
    await this.tween(Math.min(1.1, 0.25 + d / max * 0.9), (k) => { S.hp = Math.round(from + (to - from) * k); });
  }

  async finish() {
    const B = this.B, G = this.G, st = G.st;
    const out = B.over;
    if (out === 'caught') {
      const m = B.caught;
      const first = !st.caught[m.sp];
      m.status = m.status === 'frz' ? null : m.status;
      const where = G.receiveMon(m);
      if (first) await this.msg(`Les données de ${species(m.sp).name} sont ajoutées au Bestiaire !`, { wait: true });
      if (where === 'box') await this.msg(`${species(m.sp).name} est envoyé dans la Boîte de stockage.`, { wait: true });
    }
    if (out === 'run') await this.wait(300);
    // évolutions
    if (out === 'win' || out === 'caught') {
      for (const i of B.leveled) {
        const m = st.party[i]; if (!m || m.hp <= 0) continue;
        const to = evolutionTarget(m);
        if (to) await this.evolveScene(m, to);
      }
    }
    // sortie : fondu
    await this.tween(0.35, (k) => { G.fade = k; });
    return out;
  }

  async evolveScene(m, to) {
    const G = this.G;
    this.evo = { a: creatureSprite(m.sp, species(m.sp).sp, 'front', 64), b: creatureSprite(to, species(to).sp, 'front', 64), k: 0, show: 'a' };
    const oldName = monName(m);
    audio.stopMusic();
    await this.msg(`Quoi ? ${oldName} évolue !`, { wait: true });
    audio.jingle('evolve');
    // alternance de plus en plus rapide
    let period = 500;
    for (let n = 0; n < 14; n++) { this.evo.show = n % 2 ? 'b' : 'a'; this.evo.white = true; await this.wait(period); period *= 0.82; }
    this.evo.show = 'b'; this.evo.flash = 1;
    await this.tween(0.6, (k) => { this.evo.flash = 1 - k; });
    this.evo.white = false;
    evolve(m, to);
    G.st.caught[to] = true; G.st.seen[to] = true;
    audio.sfx('cry', { seed: species(to).num * 977 });
    audio.jingle('caught');
    await this.msg(`Félicitations ! ${oldName} a évolué en ${species(to).name} !`, { wait: true });
    // capacités apprises au niveau de l'évolution
    const learnNow = species(to).learn.filter(([l]) => l === m.level).map(([, id]) => id).filter((id) => !m.moves.some((x) => x.id === id));
    for (const id of learnNow) await this.learn(m, id);
    this.evo = null;
  }

  // ------------------------------------------------------------------ effets
  pos(s) { return s === 0 ? { x: 64, y: 112 } : { x: 188, y: 58 }; }
  burst(s, type, n = 16, onSelf = false) {
    const P = this.pos(s), col = PARTICLE_COL[type] || PARTICLE_COL.normal;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 60;
      const up = type === 'feu' || type === 'plante' || type === 'sol' || onSelf;
      this.parts.push({ x: P.x + (Math.random() - 0.5) * 30, y: P.y + (Math.random() - 0.5) * 24, vx: Math.cos(a) * sp, vy: up ? -Math.abs(Math.sin(a) * sp) - 20 : Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, col: col[k % col.length], sz: type === 'roche' || type === 'sol' ? 3 : 2, g: type === 'eau' || type === 'roche' ? 160 : 0, shape: type === 'fee' || type === 'psy' ? 'star' : 'sq' });
    }
  }
  stageFx(s, up) {
    const P = this.pos(s);
    for (let k = 0; k < 14; k++) this.parts.push({ x: P.x - 24 + Math.random() * 48, y: P.y + (up ? 20 : -20) + Math.random() * 10, vx: 0, vy: up ? -70 : 70, life: 0.6, col: up ? '#ff6a4a' : '#4a8af0', sz: 2, shape: 'arrow', up });
  }
  async attackAnim(e) {
    const s = e.side, A = this.side[s], T = this.side[1 - s], dir = s === 0 ? 1 : -1;
    if (e.cat === 'P') {
      await this.tween(0.12, (k) => { A.dx = dir * 14 * k; A.dy = -dir * 6 * k; });
      this.burst(1 - s, e.type, 18);
      await this.tween(0.15, (k) => { A.dx = dir * 14 * (1 - k); A.dy = -dir * 6 * (1 - k); });
    } else if (e.cat === 'S') {
      const P0 = this.pos(s), P1 = this.pos(1 - s), col = PARTICLE_COL[e.type] || PARTICLE_COL.normal;
      audio.sfx('select');
      await this.tween(0.35, (k) => {
        for (let j = 0; j < 3; j++) { const q = Math.min(1, k + j * 0.05); this.parts.push({ x: P0.x + (P1.x - P0.x) * q + (Math.random() - 0.5) * 6, y: P0.y + (P1.y - P0.y) * q + (Math.random() - 0.5) * 6, vx: 0, vy: 0, life: 0.18, col: col[j % 3], sz: 3, shape: e.type === 'elec' ? 'sq' : 'sq' }); }
      });
      this.burst(1 - s, e.type, 22);
    } else {
      this.burst(s, e.type, 12, true);
      await this.tween(0.3, (k) => { A.dy = -Math.sin(k * Math.PI) * 5; });
    }
  }
  async ballAnim(e) {
    const T = this.side[1], col = ITEMS[e.item].color;
    const P0 = { x: 30, y: 130 }, P1 = { x: 188, y: 52 };
    this.ballFx = { x: P0.x, y: P0.y, col, rot: 0 };
    audio.sfx('ball');
    await this.tween(0.55, (k) => { this.ballFx.x = P0.x + (P1.x - P0.x) * k; this.ballFx.y = P0.y + (P1.y - P0.y) * k - Math.sin(k * Math.PI) * 50; this.ballFx.rot = k * 12; });
    audio.sfx('open');
    await this.tween(0.3, (k) => { T.flash = k; T.scale = 1 - k; });
    T.vis = false;
    await this.tween(0.3, (k) => { this.ballFx.y = P1.y + (82 - P1.y) * (k < 0.7 ? ease(k / 0.7) : 1 - Math.sin((k - 0.7) / 0.3 * Math.PI) * 0.1); });
    for (let n = 0; n < e.shakes; n++) {
      await this.wait(450); audio.sfx('shake');
      await this.tween(0.35, (k) => { this.ballFx.rot = Math.sin(k * Math.PI * 2) * 0.5; });
      this.ballFx.rot = 0;
    }
    await this.wait(450);
    if (e.caught) {
      audio.sfx('select');
      this.ballFx.dim = true;
      for (let k = 0; k < 6; k++) this.parts.push({ x: this.ballFx.x, y: this.ballFx.y, vx: (k - 2.5) * 18, vy: -50, life: 0.7, col: '#fff08a', sz: 2, shape: 'star', g: 120 });
      await audio.jingle('caught');
    } else {
      audio.sfx('open');
      this.ballFx = null;
      T.vis = true;
      await this.tween(0.25, (k) => { T.scale = k; T.flash = 1 - k; });
      T.flash = 0;
    }
  }

  // ------------------------------------------------------------------ entrées
  key(k) {
    if (this.G.panels.length) return this.G.panels[this.G.panels.length - 1].key(k);
    if (this.keyWait && (k === 'a' || k === 'b')) { const w = this.keyWait; this.keyWait = null; audio.sfx('text'); return w(); }
    if (this.msgText && this.msgText.chars < 999 && k === 'a' && this.mode === 'wait') { this.msgText.chars = 999; return; }
    if (this.mode === 'main') {
      const nav = { 0: { down: 2, left: 1, right: 3 }, 1: { up: 0, right: 2 }, 2: { up: 0, left: 1, right: 3 }, 3: { up: 0, left: 2 } }[this.sel];
      if (nav[k] != null) { this.sel = nav[k]; audio.sfx('move'); }
      else if (k === 'a') this.pickMain(this.sel);
      else if (k === 'b' && this.sel !== 2) { this.sel = 2; audio.sfx('move'); }
    } else if (this.mode === 'moves') {
      const n = this.B.mon(0).moves.length;
      if (k === 'left' || k === 'right') { this.msel ^= 1; if (this.msel >= n) this.msel = n - 1; audio.sfx('move'); }
      else if (k === 'up' || k === 'down') { const t = this.msel ^ 2; if (t < n) this.msel = t; audio.sfx('move'); }
      else if (k === 'a') this.pickMove(this.msel);
      else if (k === 'b') { this.mode = 'main'; audio.sfx('back'); }
    }
  }
  click(p) {
    const G = this.G;
    if (G.panels.length) return G.panels[G.panels.length - 1].click?.(p);
    if (this.keyWait || (this.msgText && this.mode === 'wait')) return this.key('a');
    if (this.mode === 'main') {
      if (inR(p, 8, 20, 240, 96)) { this.sel = 0; return this.pickMain(0); }
      if (inR(p, 6, 124, 78, 62)) { this.sel = 1; return this.pickMain(1); }
      if (inR(p, 90, 132, 76, 54)) { this.sel = 2; return this.pickMain(2); }
      if (inR(p, 172, 124, 78, 62)) { this.sel = 3; return this.pickMain(3); }
    } else if (this.mode === 'moves') {
      const m = this.B.mon(0);
      for (let i = 0; i < m.moves.length; i++) { const x = 4 + (i % 2) * 126, y = 18 + Math.floor(i / 2) * 64; if (inR(p, x, y, 122, 60)) { this.msel = i; return this.pickMove(i); } }
      if (inR(p, 60, 150, 136, 38)) { this.mode = 'main'; audio.sfx('back'); }
    }
  }

  update(dt) {
    this.t += dt;
    for (const P of this.parts) { P.life -= dt; P.x += P.vx * dt; P.y += P.vy * dt; P.vy += (P.g || 0) * dt; }
    this.parts = this.parts.filter((P) => P.life > 0);
    if (this.msgText && this.msgText.chars < 999) {
      const total = this.msgText.lines.join(' ').length;
      this.msgText.chars += dt * (this.G.input.isHeld('a') ? 160 : 70);
      if (this.msgText.chars >= total) { this.msgText.chars = 999; const d = this.msgDone; this.msgDone = null; d && d(); }
    } else if (this.msgDone) { const d = this.msgDone; this.msgDone = null; d(); }
  }

  // ------------------------------------------------------------------ dessin
  draw() {
    const c = this.G.S.uctx;
    this.G.S.tint.style.display = 'none';
    c.clearRect(0, 0, 256, 192);
    if (this.evo) { this.drawEvo(c); this.drawBottom(); return; }
    this.drawBg(c);
    const k = this.intro;
    // plateformes qui glissent en entrée
    const ex = 188 + (1 - k) * 200, px = 64 - (1 - k) * 200;
    this.platform(c, ex, 86, 56, 13);
    this.platform(c, px, 152, 72, 16);
    // dresseur adverse
    if (this.trainerSprite && this.trainerX < 90) c.drawImage(this.trainerSprite, ex - 24 + this.trainerX, 86 - 70);
    if (this.heroX < 110) c.drawImage(this.heroSprite, px - 24 - this.heroX, 152 - 72 + 10);
    // créatures
    this.drawMon(c, 1, ex, 86);
    this.drawMon(c, 0, px, 152);
    // Sphère
    if (this.ballFx) { const B = this.ballFx; c.save(); c.translate(Math.round(B.x), Math.round(B.y)); c.rotate(B.rot); ballIcon(c, -5, -5, B.dim ? shade(B.col, -0.35) : B.col, 10); c.restore(); }
    // particules
    for (const P of this.parts) {
      c.fillStyle = P.col; const x = Math.round(P.x), y = Math.round(P.y);
      if (P.shape === 'star') { c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3); }
      else if (P.shape === 'arrow') { c.fillRect(x, y, 1, 4); c.fillRect(x - 1, y + (P.up ? 1 : 2), 3, 1); }
      else c.fillRect(x, y, P.sz, P.sz);
    }
    if (k >= 1) { this.drawFoeBox(c); this.drawMyBox(c); }
    // boîte de texte
    frame(c, 2, 144, 252, 46, 'dark');
    if (this.msgText) {
      let left = Math.floor(this.msgText.chars);
      this.msgText.lines.slice(0, 2).forEach((l, i) => { drawText(c, l.slice(0, Math.max(0, left)), 12, 150 + i * 16, '#ffffff', '#5a5a7a'); left -= l.length + 1; });
      if ((this.keyWait || this.msgText.arrow) && Math.floor(this.t * 3) % 2) drawText(c, '▼', 238, 172, '#f86a5a', null);
    }
    if (this.statsBox) this.drawStatsBox(c);
    this.drawBottom();
  }
  drawBg(c) {
    const P = this.envPal;
    if (this.gymType) {
      const T = TYPES[this.gymType];
      for (let y = 0; y < 192; y++) { c.fillStyle = y < 70 ? shade(T.color, -0.35 + y / 400) : shade(T.color, -0.1 - (y - 70) / 600); c.fillRect(0, y, 256, 1); }
      for (let x = 0; x < 256; x += 32) { c.fillStyle = shade(T.color, -0.45); c.fillRect(x, 20, 6, 50); }
      return;
    }
    for (let y = 0; y < 72; y++) { const k = y / 72; c.fillStyle = mix(P.sky[0], P.sky[1], k); c.fillRect(0, y, 256, 1); }
    // horizon : collines ou silhouettes
    c.fillStyle = P.far;
    for (let x = 0; x < 256; x++) { const h = this.env === 'beach' ? 6 : 10 + Math.sin(x * 0.05) * 6 + Math.sin(x * 0.13 + 1) * 4 + (this.env === 'forest' || this.env === 'grass' ? (noise2(x >> 2, 0, 3) > 0.6 ? 4 : 0) : 0); c.fillRect(x, 72 - h, 1, h); }
    for (let y = 72; y < 192; y++) { const k = (y - 72) / 120; c.fillStyle = ((y >> 2) % 2) ? P.ground[0] : mix(P.ground[0], P.ground[1], 0.5 + k * 0.5); c.fillRect(0, y, 256, 1); }
    if (this.env === 'snow') for (let k = 0; k < 30; k++) { const x = (k * 53 + this.t * 20) % 256, y = (k * 37 + this.t * 30) % 140; c.fillStyle = '#ffffff'; c.fillRect(Math.round(x), Math.round(y), 1, 1); }
  }
  platform(c, x, y, rx, ry) {
    const P = this.envPal.plat;
    for (let yy = -ry; yy <= ry + 3; yy++) for (let xx = -rx; xx <= rx; xx++) {
      const d = (xx / rx) ** 2 + (Math.min(yy, ry) / ry) ** 2;
      if (yy <= 0 && d > 1) continue;
      if (yy > 0 && (xx / rx) ** 2 + ((yy - 3) / ry) ** 2 > 1 && (xx / rx) ** 2 + (yy / ry) ** 2 > 1) continue;
      let col = yy > ry - 1 || (yy > 0 && (xx / rx) ** 2 + (yy / ry) ** 2 > 1) ? P[1] : d > 0.82 ? P[1] : d < 0.3 && yy < 0 ? P[2] : P[0];
      c.fillStyle = col; c.fillRect(Math.round(x + xx), Math.round(y + yy), 1, 1);
    }
  }
  drawMon(c, s, bx, by) {
    const S = this.side[s]; if (!S.vis || !S.spr) return;
    const img = S.dark ? silhouette(S.spr, '#202030') : S.spr;
    const w = 64 * S.scale, h = 64 * S.scale;
    const bob = s === 0 && this.mode !== 'wait' ? Math.round(Math.sin(this.t * 5) * 1) : 0;
    const x = Math.round(bx - w / 2 + S.dx), y = Math.round(by - h + (s === 0 ? 14 : 4) + S.dy + bob);
    c.save();
    c.globalAlpha = S.alpha;
    if (S.clip > 0) { c.beginPath(); c.rect(0, 0, 256, by + (s === 0 ? 14 : 4)); c.clip(); c.drawImage(img, x, y + S.clip * 64, w, h); }
    else c.drawImage(img, x, y, w, h);
    if (S.flash > 0) { c.globalAlpha = S.flash * S.alpha; c.drawImage(silhouette(S.spr, '#ffffff'), x, y, w, h); }
    c.restore();
  }
  drawFoeBox(c) {
    const S = this.side[1]; if (!S.boxVis || !S.mon) return;
    const x = 6, y = 14;
    rrect(c, x, y, 112, 32, '#3a3a4a', 4); rrect(c, x + 1, y + 1, 110, 30, '#f8f4ea', 3);
    c.fillStyle = '#e8dcc0'; c.fillRect(x + 3, y + 26, 106, 3);
    drawText(c, monName(S.mon), x + 6, y + 3);
    drawTextRight(c, 'Nv' + S.mon.level, x + 108, y + 3, '#4a4a5a', null);
    if (this.o.wild && this.G.st.caught[S.mon.sp]) ballIcon(c, x + 92, y - 3, '#e84848', 7);
    hpBar(c, x + 30, y + 18, 64, S.hp / S.max);
    statusTag(c, x + 4, y + 17, S.status);
  }
  drawMyBox(c) {
    const S = this.side[0]; if (!S.boxVis || !S.mon) return;
    const x = 134, y = 100;
    rrect(c, x, y, 118, 40, '#3a3a4a', 4); rrect(c, x + 1, y + 1, 116, 38, '#f8f4ea', 3);
    drawText(c, monName(S.mon), x + 6, y + 3);
    drawTextRight(c, 'Nv' + S.mon.level, x + 114, y + 3, '#4a4a5a', null);
    hpBar(c, x + 34, y + 17, 64, S.hp / S.max);
    statusTag(c, x + 6, y + 16, S.status);
    drawTextRight(c, `${Math.max(0, S.hp)}/${S.max}`, x + 112, y + 22, '#4a4a5a', null);
    xpBar(c, x + 6, y + 34, 106, S.xp);
  }
  drawStatsBox(c) {
    const B = this.statsBox;
    frame(c, 150, 8, 102, 90, 'text');
    STAT_KEYS.forEach((k, i) => {
      drawText(c, STAT_NAMES[i].slice(0, 9), 158, 13 + i * 13, '#6a7088', null);
      const v = B.phase === 0 ? '+' + (B.after[k] - B.before[k]) : String(B.after[k]);
      drawTextRight(c, v, 244, 13 + i * 13);
    });
  }
  drawEvo(c) {
    const E = this.evo;
    for (let y = 0; y < 192; y++) { c.fillStyle = mix('#203060', '#5a7ac8', Math.sin(y * 0.03 + this.t) * 0.5 + 0.5); c.fillRect(0, y, 256, 1); }
    const img = E.show === 'a' ? E.a : E.b;
    const draw = E.white ? silhouette(img, '#ffffff') : img;
    c.drawImage(draw, 64, 20, 128, 128);
    if (E.flash) { c.fillStyle = `rgba(255,255,255,${E.flash})`; c.fillRect(0, 0, 256, 192); }
    frame(c, 2, 144, 252, 46, 'dark');
    if (this.msgText) {
      let left = Math.floor(this.msgText.chars);
      this.msgText.lines.slice(0, 2).forEach((l, i) => { drawText(c, l.slice(0, Math.max(0, left)), 12, 150 + i * 16, '#ffffff', '#5a5a7a'); left -= l.length + 1; });
      if (this.keyWait && Math.floor(this.t * 3) % 2) drawText(c, '▼', 238, 172, '#f86a5a', null);
    }
  }

  drawBottom() {
    const c = this.G.S.sctx, G = this.G;
    const P = G.panels[G.panels.length - 1];
    if (P) { P.draw(c, this.t); return; }
    if (this.mode === 'main') {
      subBackground(c, '#3a4a6a', '#34425e', this.t);
      button(c, 8, 20, 240, 96, '#e0483c', 'COMBAT', { sel: this.sel === 0 });
      button(c, 6, 124, 78, 62, '#e0a030', 'SAC', { sel: this.sel === 1, icon: icon('bag') });
      button(c, 90, 132, 76, 54, '#4a82d8', 'FUITE', { sel: this.sel === 2 });
      button(c, 172, 124, 78, 62, '#48a858', 'ÉQUIPE', { sel: this.sel === 3, icon: icon('team') });
      return;
    }
    if (this.mode === 'moves') {
      subBackground(c, '#3a4a6a', '#34425e', this.t);
      const m = this.B.mon(0);
      for (let i = 0; i < 4; i++) {
        const x = 4 + (i % 2) * 126, y = 18 + Math.floor(i / 2) * 64, mv = m.moves[i];
        if (!mv) { rrect(c, x, y, 122, 60, '#2a3450', 4); continue; }
        const M = MV(mv.id), T = TYPES[M.type];
        button(c, x, y, 122, 60, T.color, null, { sel: this.msel === i, disabled: mv.pp <= 0 });
        drawTextCentered(c, M.name, x + 61, y + 10, '#ffffff', shade(T.color, -0.55));
        drawTextCentered(c, `PP ${mv.pp}/${M.pp}`, x + 61, y + 28, '#ffffff', shade(T.color, -0.55));
        drawTextCentered(c, T.name, x + 61, y + 42, shade(T.color, -0.6), null);
      }
      button(c, 60, 150, 136, 38, '#6a6a8a', 'Retour', {});
      return;
    }
    // en attente : fond avec une grande Sphère
    subBackground(c, '#3a4a6a', '#34425e', this.t);
    const r = 40;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y); if (d > r) continue;
      c.fillStyle = d > r - 3 ? '#1e2638' : Math.abs(y) < 4 ? '#1e2638' : y < 0 ? '#4e5e82' : '#46567a';
      c.fillRect(128 + x, 96 + y, 1, 1);
    }
    for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) { const d = Math.hypot(x, y); if (d <= 10) { c.fillStyle = d > 7 ? '#1e2638' : '#5a6a90'; c.fillRect(128 + x, 96 + y, 1, 1); } }
  }
}

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k, g = ((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k, bl = (pa & 255) * (1 - k) + (pb & 255) * k;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}
