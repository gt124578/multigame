// odyssee/js/ui/battleView.js — scène de combat façon HeartGold/SoulSilver : décor, socles, sprites, effets, barres de PV
import { el, esc, wait } from './ui.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { monName, expProgress } from '../core/mon.js';
import { ITEMS, canUseOn, itemName } from '../core/items.js';
import { ASSETS, loadImg } from '../assets.js';
import { TYPE_COL, TYPE_FR, STATUS_FR, hpCol, partyScreen, bagScreen } from './screens.js';

const BH = 192;
const TYPE_FX = {
  normal: ['#ffffff', '#f0f0d0'], fighting: ['#ffffff', '#f06040'], flying: ['#ffffff', '#c8d8ff'], poison: ['#b050c8', '#e090f0'], ground: ['#c8a050', '#8a6a30'],
  rock: ['#b0a080', '#706050'], bug: ['#a8c830', '#e0f080'], ghost: ['#705898', '#302040'], steel: ['#e0e0f0', '#a0a0b8'], fire: ['#ff9030', '#ffe060'],
  water: ['#58a0ff', '#c0e0ff'], grass: ['#58c040', '#b0f080'], electric: ['#ffe040', '#ffffff'], psychic: ['#ff70b0', '#ffc0e0'], ice: ['#a0e8ff', '#ffffff'],
  dragon: ['#7050f0', '#c0a0ff'], dark: ['#403030', '#a08070'],
};
const BALL_COL = { 'poke-ball': ['#e83838', '#f4f4f4'], 'great-ball': ['#3870e8', '#f4f4f4'], 'ultra-ball': ['#303030', '#f0c830'] };

function tinted(img, color) {
  if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}
const ease = (t) => t * t * (3 - 2 * t);

export class BattleView {
  constructor(game) { this.game = game; this.ui = game.ui; this.sound = game.sound; }

  /* ---------------- décor ---------------- */
  makeBg(kind, night) {
    const W = this.W, c = document.createElement('canvas'); c.width = W; c.height = BH; const x = c.getContext('2d');
    const grad = (y0, y1, a, b) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, y0, W, y1 - y0); };
    const stripes = (y0, y1, col, gap = 6) => { x.fillStyle = col; for (let y = y0; y < y1; y += gap) x.fillRect(0, y, W, 1); };
    if (kind === 'cave') {
      grad(0, BH, '#3a2e26', '#6a5440');
      x.fillStyle = '#2a201a'; for (let i = 0; i < 9; i++) { const bx = (i * 53) % W, bw = 40 + (i * 17) % 30; x.beginPath(); x.moveTo(bx, 0); x.lineTo(bx + bw / 2, 30 + (i * 13) % 25); x.lineTo(bx + bw, 0); x.fill(); }
      stripes(110, BH, 'rgba(0,0,0,0.12)', 5);
    } else if (kind === 'indoor' || kind === 'gym' || kind === 'league') {
      const [a, b, f1, f2] = kind === 'league' ? ['#3a2c60', '#6a54a0', '#8a78c0', '#b0a0e0'] : kind === 'gym' ? ['#505868', '#8890a8', '#b8c0d0', '#e0e4ee'] : ['#c8b090', '#e0d0b0', '#e8dcc4', '#f6eee0'];
      grad(0, 80, a, b); grad(80, BH, f1, f2);
      x.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < W; i += 24) x.fillRect(i, 80, 1, BH - 80);
      stripes(84, BH, 'rgba(0,0,0,0.06)', 8);
    } else if (kind === 'water') {
      grad(0, 70, night ? '#182850' : '#88c8f8', night ? '#304078' : '#d8f0ff');
      grad(70, 120, '#3878d0', '#58a0e8'); stripes(72, 120, 'rgba(255,255,255,0.35)', 7);
      grad(120, BH, '#f0dca0', '#e0c880'); stripes(122, BH, 'rgba(160,120,60,0.15)', 6);
    } else if (kind === 'snow') {
      grad(0, 74, night ? '#1a2450' : '#a8c8e8', night ? '#3a4a88' : '#eef6ff');
      x.fillStyle = night ? '#5a6a98' : '#c8d8ec'; x.beginPath(); x.moveTo(0, 74); x.lineTo(W * 0.18, 30); x.lineTo(W * 0.34, 74); x.lineTo(W * 0.5, 40); x.lineTo(W * 0.7, 74); x.lineTo(W * 0.85, 26); x.lineTo(W, 74); x.fill();
      x.fillStyle = '#ffffff'; for (const [a1, b1] of [[0.18, 30], [0.5, 40], [0.85, 26]]) { x.beginPath(); x.moveTo(W * a1 - 10, b1 + 12); x.lineTo(W * a1, b1); x.lineTo(W * a1 + 10, b1 + 12); x.fill(); }
      grad(74, BH, '#f4f8fc', '#d0deec'); stripes(76, BH, 'rgba(120,150,190,0.12)', 6);
    } else if (kind === 'volcanic') {
      grad(0, 80, '#70384a', '#e0906a'); x.fillStyle = '#4a3a40'; x.beginPath(); x.moveTo(W * 0.55, 80); x.lineTo(W * 0.72, 22); x.lineTo(W * 0.78, 24); x.lineTo(W * 0.95, 80); x.fill();
      grad(80, BH, '#9a8e88', '#7a706c'); stripes(82, BH, 'rgba(0,0,0,0.08)', 6);
    } else {
      // prairie : ciel, collines, lisière, herbe rayée
      grad(0, 74, night ? '#1a2450' : '#80c8f8', night ? '#3a4a88' : '#e0f6ff');
      if (night) { x.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) x.fillRect((i * 97) % W, (i * 31) % 60, 1, 1); }
      else { x.fillStyle = 'rgba(255,255,255,0.85)'; for (const [cx, cy, r] of [[W * 0.15, 22, 10], [W * 0.2, 20, 13], [W * 0.27, 23, 9], [W * 0.66, 14, 9], [W * 0.71, 12, 12]]) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); } }
      x.fillStyle = night ? '#2a5a48' : '#78b878'; x.beginPath(); x.moveTo(0, 74); for (let i = 0; i <= W; i += 8) x.lineTo(i, 60 + Math.sin(i * 0.035) * 8 + Math.sin(i * 0.11) * 3); x.lineTo(W, 74); x.fill();
      x.fillStyle = night ? '#1e4a34' : '#4a9858'; for (let i = -10; i < W; i += 11) { x.beginPath(); x.arc(i, 74, 9 + (i * 7) % 5, Math.PI, 0); x.fill(); }
      grad(74, BH, night ? '#3a7048' : '#a0e078', night ? '#2a5a38' : '#68c050'); stripes(76, BH, night ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.18)', 6);
    }
    return c;
  }
  drawPlatform(x, cx, cy, rx, ry, kind) {
    const cols = kind === 'cave' ? ['#4a3a2c', '#8a7258', '#a08a6c'] : kind === 'indoor' || kind === 'gym' || kind === 'league' ? ['#9098a8', '#d8dce8', '#f2f4f8'] : kind === 'water' ? ['#c0a060', '#f0dca0', '#fbecc0'] : kind === 'volcanic' ? ['#5a5250', '#8a8280', '#a8a09c'] : kind === 'snow' ? ['#a0b4cc', '#dce8f4', '#ffffff'] : ['#3c8a3c', '#6cc458', '#90dc78'];
    x.fillStyle = cols[0]; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill();
    x.fillStyle = cols[1]; x.beginPath(); x.ellipse(cx, cy - 2, rx - 3, ry - 3, 0, 0, 7); x.fill();
    x.fillStyle = cols[2]; x.beginPath(); x.ellipse(cx - rx * 0.15, cy - 4, rx * 0.55, ry * 0.4, 0, 0, 7); x.fill();
  }

  /* ---------------- boucle d'animation ---------------- */
  frame = () => {
    if (!this.alive) return;
    const x = this.ctx, W = this.W, s = this.st;
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, W, BH);
    x.save(); x.translate(Math.round(s.shakeX), Math.round(s.shakeY));
    x.drawImage(this.bg, 0, 0);
    const eP = this.ePos(), pP = this.pPos();
    this.drawPlatform(x, eP.x + s.eSlide, eP.y, 58, 13, this.kind);
    this.drawPlatform(x, pP.x + s.pSlide, pP.y, 76, 17, this.kind);
    // ombres
    x.fillStyle = 'rgba(0,0,0,0.18)';
    if (s.foe.visible && s.foe.scale > 0.3) { x.beginPath(); x.ellipse(eP.x + s.eSlide + s.foe.dx, eP.y - 1, 26 * s.foe.scale, 5, 0, 0, 7); x.fill(); }
    const drawSpr = (o, cx, cy, flip) => {
      if (!o.visible || !o.img) return;
      if (o.blink && Math.floor(performance.now() / 70) % 2) return;
      let img = o.img;
      if (o.white > 0.01) img = o.whiteImg || (o.whiteImg = tinted(o.img, '#ffffff'));
      if (o.dark) img = o.darkImg || (o.darkImg = tinted(o.img, '#203048'));
      const w = img.width * o.scale, h = img.height * o.scale;
      x.save(); x.globalAlpha = o.alpha;
      if (o.clipY != null) { x.beginPath(); x.rect(0, 0, W, cy + o.clipY); x.clip(); }
      x.drawImage(img, Math.round(cx - w / 2 + o.dx), Math.round(cy - h + o.dy), Math.round(w), Math.round(h));
      if (o.white > 0.01 && o.white < 1 && o.img) { x.globalAlpha = o.alpha * (1 - o.white); x.drawImage(o.img, Math.round(cx - w / 2 + o.dx), Math.round(cy - h + o.dy), Math.round(w), Math.round(h)); }
      x.restore();
    };
    drawSpr(s.trainer, eP.x + s.eSlide, eP.y + 6);
    drawSpr(s.foe, eP.x + s.eSlide, eP.y + 8);
    drawSpr(s.me, pP.x + s.pSlide, pP.y + 18);
    // balls
    for (const b of s.balls) this.drawBall(x, b);
    // particules
    for (const p of s.parts) {
      x.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      x.fillStyle = p.c;
      if (p.shape === 'ring') { x.strokeStyle = p.c; x.lineWidth = 2; x.beginPath(); x.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, 7); x.stroke(); }
      else if (p.shape === 'bolt') { x.strokeStyle = p.c; x.lineWidth = 2; x.beginPath(); x.moveTo(p.x, p.y); for (let k = 1; k < 5; k++) x.lineTo(p.x + (Math.random() - 0.5) * 10, p.y + k * 7); x.stroke(); }
      else if (p.shape === 'leaf') { x.save(); x.translate(p.x, p.y); x.rotate(p.a || 0); x.fillRect(-3, -1, 6, 3); x.restore(); }
      else x.fillRect(Math.round(p.x - p.r), Math.round(p.y - p.r), Math.max(1, Math.round(p.r * 2)), Math.max(1, Math.round(p.r * 2)));
      x.globalAlpha = 1;
    }
    x.restore();
    if (s.screenFlash > 0) { x.fillStyle = `rgba(255,255,255,${s.screenFlash})`; x.fillRect(0, 0, W, BH); }
    if (s.wipe > 0) { x.fillStyle = '#000'; const h = BH / 2 * s.wipe; x.fillRect(0, 0, W, h); x.fillRect(0, BH - h, W, h); }
    // mise à jour des particules
    const dt = 1 / 60;
    for (const p of s.parts) { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += (p.g || 0); p.life -= dt; if (p.grow) p.r += p.grow; if (p.a != null) p.a += 0.2; }
    s.parts = s.parts.filter((p) => p.life > 0);
    requestAnimationFrame(this.frame);
  };
  drawBall(x, b) {
    const [top, bot] = BALL_COL[b.item] || BALL_COL['poke-ball'];
    x.save(); x.translate(Math.round(b.x), Math.round(b.y)); x.rotate(b.rot || 0);
    x.fillStyle = '#202020'; x.beginPath(); x.arc(0, 0, 5.5, 0, 7); x.fill();
    x.fillStyle = top; x.beginPath(); x.arc(0, 0, 4.5, Math.PI, 0); x.fill();
    x.fillStyle = bot; x.beginPath(); x.arc(0, 0, 4.5, 0, Math.PI); x.fill();
    x.fillStyle = '#202020'; x.fillRect(-5, -0.5, 10, 1.5); x.fillStyle = '#fff'; x.fillRect(-1, -1, 2, 2);
    x.restore();
  }
  ePos() { return { x: Math.round(this.W * 0.71), y: 86 }; }
  pPos() { return { x: Math.round(this.W * 0.26), y: 140 }; }

  tween(ms, fn) { return new Promise((res) => { const t0 = performance.now(); const step = () => { const u = Math.min(1, (performance.now() - t0) / ms); fn(u); if (u < 1) requestAnimationFrame(step); else res(); }; step(); }); }
  burst(cx, cy, cols, n = 14, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 1.6) * (0.4 + Math.random());
      this.st.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - (o.up || 0), r: o.r || 1.5 + Math.random() * 1.5, c: cols[i % cols.length], life: o.life || 0.45, max: o.life || 0.45, g: o.g || 0, shape: o.shape });
    }
  }
  sprCenter(side) { const p = side === 1 ? this.ePos() : this.pPos(); return { x: p.x, y: p.y - (side === 1 ? 30 : 36) }; }

  /* ---------------- interface HTML ---------------- */
  buildDom() {
    const r = el('div', 'battle'); this.root = r;
    const cv = el('canvas', 'bcv'); cv.width = this.W; cv.height = BH; r.appendChild(cv);
    this.ctx = cv.getContext('2d');
    r.insertAdjacentHTML('beforeend', `
      <div class="bhud foe"><div class="bh-top"><span class="bh-name"></span><span class="bh-lv"></span></div><div class="bh-mid"><span class="bh-st"></span><div class="bh-hp"><b>PV</b><i><u></u></i></div></div><div class="bh-caught"></div></div>
      <div class="bhud me"><div class="bh-top"><span class="bh-name"></span><span class="bh-lv"></span></div><div class="bh-mid"><span class="bh-st"></span><div class="bh-hp"><b>PV</b><i><u></u></i></div></div><div class="bh-hpn"></div><div class="bh-exp"><i><u></u></i></div></div>
      <div class="dlg box btext"><div class="dlg-name" style="display:none"></div><div class="dlg-txt"></div><div class="dlg-arrow">▼</div></div>
      <div class="bcmd"></div>`);
    this.game.ui.root.appendChild(r);
    this.hud = { foe: r.querySelector('.bhud.foe'), me: r.querySelector('.bhud.me') };
    this.textBox = r.querySelector('.btext'); this.cmd = r.querySelector('.bcmd');
  }
  setHud(side, m, hp) {
    if (m && hp == null) hp = m.hp;
    const h = side === 1 ? this.hud.foe : this.hud.me; if (!m) { h.style.visibility = 'hidden'; return; }
    if (side === 1) this.game.markSeen(m.sp);
    h.style.visibility = '';
    const g = m.gender === 'm' ? '<span class="g m">♂</span>' : m.gender === 'f' ? '<span class="g f">♀</span>' : '';
    h.querySelector('.bh-name').innerHTML = esc(monName(m)) + g;
    h.querySelector('.bh-lv').textContent = 'N.' + m.lvl;
    const st = h.querySelector('.bh-st'); const S = m.hp > 0 && m.status ? STATUS_FR[m.status] : null; st.textContent = S ? S[0] : ''; st.style.background = S ? S[1] : 'transparent'; st.style.display = S ? '' : 'none';
    this.setHp(side, hp, m.stats[0]);
    if (side === 0) { h.querySelector('.bh-exp u').style.width = expProgress(m) * 100 + '%'; }
    if (side === 1) h.querySelector('.bh-caught').classList.toggle('on', this.game.state.dex.caught.includes(m.sp) && this.battle.wild);
  }
  setHp(side, hp, max) {
    const h = side === 1 ? this.hud.foe : this.hud.me, r = Math.max(0, hp / max);
    const u = h.querySelector('.bh-hp u'); u.style.width = r * 100 + '%'; u.style.background = hpCol(r);
    if (side === 0) h.querySelector('.bh-hpn').textContent = `${Math.max(0, Math.round(hp))}/${max}`;
  }

  async msg(text, o = {}) {
    await this.ui.typePage(this.textBox, text, { auto: o.wait ? 0 : 750 });
  }

  /* ---------------- lancement ---------------- */
  async run(battle, o = {}) {
    this.battle = battle; this.kind = o.bg || 'grass'; this.alive = true;
    this.W = Math.max(256, Math.min(420, Math.round(BH * innerWidth / innerHeight)));
    this.bg = this.makeBg(this.kind, o.night);
    this.st = { shakeX: 0, shakeY: 0, eSlide: -this.W, pSlide: this.W, screenFlash: 0, wipe: 0, parts: [], balls: [],
      foe: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 }, me: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 },
      trainer: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 } };
    this.buildDom();
    this.root.style.setProperty('--bp', (innerHeight / BH) + 'px');
    this.setHud(1, null); this.setHud(0, null);
    // images
    const foeSide = battle.sides[1];
    await this.loadSide(1); await this.loadSide(0);
    if (foeSide.trainer) this.st.trainer.img = await loadImg(ASSETS.trainer(foeSide.trainer.bs));
    requestAnimationFrame(this.frame);
    // intro : les socles glissent en place
    this.st.screenFlash = 0;
    if (battle.wild) { this.st.foe.visible = true; this.st.foe.dark = true; }
    else this.st.trainer.visible = true;
    await this.tween(700, (u) => { const e = ease(u); this.st.eSlide = -this.W * (1 - e); this.st.pSlide = this.W * (1 - e); });
    if (battle.wild) { this.st.foe.dark = false; this.sound.cry(ASSETS.cry(battle.foe.sp)); this.setHud(1, battle.foe); }
    const evs = battle.start();
    await this.play(evs);
    // boucle de tours
    while (battle.state !== 'over') {
      if (battle.state === 'switch') { await this.forcedSwitch(); continue; }
      const action = await this.chooseAction();
      if (!action) continue;
      await this.play(battle.playerAction(action));
    }
    await wait(300);
    return battle.result;
  }
  async loadSide(side) {
    const m = this.battle.act(side), o = side === 1 ? this.st.foe : this.st.me;
    o.img = await loadImg(side === 1 ? ASSETS.front(m.sp, m.shiny) : ASSETS.back(m.sp, m.shiny));
    o.whiteImg = null; o.darkImg = null;
    if (!o.img) { const c = document.createElement('canvas'); c.width = c.height = 80; const x = c.getContext('2d'); x.fillStyle = TYPE_COL[SPECIES[m.sp].t[0]]; x.beginPath(); x.arc(40, 50, 24, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = '20px sans-serif'; x.fillText('?', 34, 58); o.img = c; }
  }
  close() { this.alive = false; this.root?.remove(); this.ui.closeDialog(); }

  /* ---------------- choix du joueur ---------------- */
  async chooseAction() {
    const b = this.battle, me = b.me;
    const forced = b.forcedAction(0); if (forced) return { type: 'move', idx: 0 };
    for (;;) {
      this.ui.typePage(this.textBox, `Que doit faire ${monName(me)} ?`, { last: true });
      const c = await this.commandMenu();
      if (c === 0) { const mv = await this.moveMenu(); if (mv < 0) continue; return { type: 'move', idx: mv }; }
      if (c === 1) {
        const r = await bagScreen(this.game, { battle: true }); if (!r) continue;
        const it = ITEMS[r.item];
        if (it.ball) { if (this.game.state.party.length >= 6 && this.game.state.box.length >= 300) { await this.msg('Plus de place dans le PC !', { wait: true }); continue; } return { type: 'item', item: r.item }; }
        const target = await partyScreen(this.game, { mode: 'pick', prompt: `Utiliser ${itemName(r.item)} sur quelle créature ?`, filter: (m) => (canUseOn(r.item, m) ? null : 'Pas d\'effet') });
        if (target < 0) continue;
        let moveIdx = -1;
        if (it.pp) { const m = this.game.state.party[target]; moveIdx = await this.ui.list({ title: 'Quelle attaque ?', items: m.moves.map((x) => ({ label: MOVES[x.id].n, right: `${x.pp}/${MOVES[x.id].pp}` })), cls: 'psub', cancel: -1 }); if (moveIdx < 0) continue; }
        return { type: 'item', item: r.item, target, moveIdx };
      }
      if (c === 2) {
        const k = await partyScreen(this.game, { mode: 'battle', prompt: 'Choisis une créature.', filter: (m, i) => (m.hp <= 0 ? `${monName(m)} n'a plus la force de se battre !` : i === b.sides[0].active ? `${monName(m)} est déjà au combat !` : null) });
        if (k < 0) continue;
        return { type: 'switch', idx: k };
      }
      if (c === 3) return { type: 'run' };
    }
  }
  commandMenu() {
    return new Promise((resolve) => {
      const labels = [['ATTAQUE', 'fight'], ['SAC', 'bag'], ['ÉQUIPE', 'mon'], ['FUITE', 'run']];
      this.cmd.innerHTML = `<div class="cmd-grid">${labels.map(([l, c], i) => `<div class="cbtn ${c}" data-i="${i}">${l}</div>`).join('')}</div>`;
      this.cmd.classList.add('on'); this.root.classList.add('cmdon');
      let i = this.lastCmd || 0;
      const btns = [...this.cmd.querySelectorAll('.cbtn')];
      const show = () => btns.forEach((b, k) => b.classList.toggle('sel', k === i));
      show();
      const pop = this.ui.input.push((k) => {
        if (k === 'up' || k === 'down') i ^= 2; else if (k === 'left' || k === 'right') i ^= 1;
        else if (k === 'a') { pop(); this.cmd.classList.remove('on'); this.root.classList.remove('cmdon'); this.lastCmd = i === 3 ? 0 : i; this.sound.sfx('select'); resolve(i); return; }
        else if (k === 'b') { i = 3; }
        else return;
        this.sound.sfx('blip'); show();
      });
    });
  }
  moveMenu() {
    return new Promise((resolve) => {
      const m = this.battle.me;
      this.cmd.innerHTML = `<div class="mv-grid">${[0, 1, 2, 3].map((k) => { const x = m.moves[k]; if (!x) return '<div class="mbtn empty">—</div>'; const M = MOVES[x.id]; return `<div class="mbtn" style="--tc:${TYPE_COL[M.t]}"><span class="mn">${esc(M.n)}</span><span class="mpp">PP ${x.pp}/${M.pp}</span><span class="mt">${TYPE_FR[M.t]}</span></div>`; }).join('')}</div>`;
      this.cmd.classList.add('on', 'moves'); this.root.classList.add('cmdon');
      let i = this.lastMove || 0; if (!m.moves[i]) i = 0;
      const btns = [...this.cmd.querySelectorAll('.mbtn')];
      const show = () => btns.forEach((b, k) => b.classList.toggle('sel', k === i));
      show();
      const pop = this.ui.input.push((k) => {
        let j = i;
        if (k === 'up' || k === 'down') j = i ^ 2; else if (k === 'left' || k === 'right') j = i ^ 1;
        else if (k === 'a') { const x = m.moves[i]; if (x.pp <= 0 && this.battle.usableMoves(0).length) { this.sound.sfx('bump'); return; } pop(); this.cmd.classList.remove('on', 'moves'); this.root.classList.remove('cmdon'); this.lastMove = i; this.sound.sfx('select'); resolve(i); return; }
        else if (k === 'b') { pop(); this.cmd.classList.remove('on', 'moves'); this.root.classList.remove('cmdon'); this.sound.sfx('cancel'); resolve(-1); return; }
        else return;
        if (m.moves[j]) { i = j; this.sound.sfx('blip'); show(); }
      });
    });
  }
  async forcedSwitch() {
    const b = this.battle;
    const k = await partyScreen(this.game, { mode: 'pick', prompt: 'Envoyer quelle créature ?', filter: (m, i) => (m.hp <= 0 ? 'K.O.' : i === b.sides[0].active ? 'Au combat' : null) });
    if (k < 0) return;
    await this.play(b.playerSwitch(k));
  }

  /* ---------------- relecture des événements ---------------- */
  async play(evs) {
    for (const e of evs) {
      switch (e.t) {
        case 'msg': await this.msg(e.text, { wait: this.battle.state === 'over' && /remportez|battu|K\.O\.|perdez|attrapé|panique/.test(e.text) }); break;
        case 'send': await this.animSend(e.side); break;
        case 'recall': await this.animRecall(e.side); break;
        case 'move': await this.animMove(e.side, e.move, e.type); break;
        case 'hit': await this.animHit(e.side, e.eff, e.crit); break;
        case 'hp': await this.animHp(e.side, e.from, e.hp, e.status); break;
        case 'status': { const m = this.battle.act(e.side); this.setHud(e.side, m); if (e.status) { this.sound.sfx('status'); const c = this.sprCenter(e.side); this.burst(c.x, c.y, [STATUS_FR[e.status]?.[1] || '#fff', '#ffffff'], 12, { r: 2 }); await wait(250); } break; }
        case 'stat': await this.animStat(e.side, e.up); break;
        case 'anim': await this.animStatus(e.side, e.k); break;
        case 'faint': await this.animFaint(e.side); break;
        case 'exp': if (e.active) await this.animExp(e); break;
        case 'level': if (e.active) { const m = this.battle.me; this.hud.me.querySelector('.bh-lv').textContent = 'N.' + e.lvl; this.setHp(0, e.hp, e.after[0]); } this.sound.sfx('levelup'); await this.levelBox(e); break;
        case 'ask-learn': await this.game.askLearn(this.game.state.party[e.idx], e.move, this.textBox); break;
        case 'ball': await this.animBall(e); break;
        case 'hide': { const o = e.side === 1 ? this.st.foe : this.st.me; o.visible = !e.on; break; }
        case 'trainer-back': { this.st.trainer.visible = true; this.st.trainer.dx = 120; await this.tween(400, (u) => { this.st.trainer.dx = 120 * (1 - ease(u)); }); break; }
        case 'sfx': this.sound.sfx(e.k); break;
        case 'switch-prompt': break;
        case 'end': break;
        default: break;
      }
    }
  }

  async animSend(side) {
    const b = this.battle, m = b.act(side), o = side === 1 ? this.st.foe : this.st.me;
    await this.loadSide(side);
    this.setHud(side, m);
    if (side === 1 && this.st.trainer.visible) { await this.tween(350, (u) => { this.st.trainer.dx = 130 * ease(u); }); this.st.trainer.visible = false; this.st.trainer.dx = 0; }
    // la Ball part et s'ouvre dans un éclair blanc
    const target = side === 1 ? this.ePos() : this.pPos(), tx = target.x, ty = target.y - 18;
    const ball = { x: side === 1 ? tx : -10, y: side === 1 ? ty - 30 : 120, item: m.ball || 'poke-ball', rot: 0 };
    this.st.balls.push(ball); this.sound.sfx('throw');
    const x0 = ball.x, y0 = ball.y;
    await this.tween(side === 1 ? 250 : 450, (u) => { ball.x = x0 + (tx - x0) * u; ball.y = y0 + (ty - y0) * u - Math.sin(u * Math.PI) * 40; ball.rot = u * 10; });
    this.st.balls = this.st.balls.filter((q) => q !== ball);
    this.sound.sfx('poof'); this.burst(tx, ty, ['#ffffff', '#fff6a0', '#a0e0ff'], 18, { speed: 2.2 });
    o.visible = true; o.white = 1; o.scale = 0.1;
    await this.tween(260, (u) => { o.scale = 0.1 + 0.9 * ease(u); });
    this.sound.cry(ASSETS.cry(m.sp));
    await this.tween(220, (u) => { o.white = 1 - u; });
    o.white = 0;
  }
  async animRecall(side) {
    const o = side === 1 ? this.st.foe : this.st.me;
    o.white = 1; await this.tween(260, (u) => { o.scale = 1 - u * 0.9; }); o.visible = false; o.scale = 1; o.white = 0;
    this.setHud(side, null);
  }
  async animMove(side, moveId, type) {
    const M = MOVES[moveId], fx = TYPE_FX[type] || TYPE_FX.normal, from = this.sprCenter(side), to = this.sprCenter(1 - side);
    const o = side === 1 ? this.st.foe : this.st.me, dir = side === 1 ? -1 : 1;
    const selfMove = M.tg === 7 || M.c === 'status' && (M.m?.st?.every(([, c]) => c > 0) || M.m?.heal);
    if (M.c === 'physical') {
      await this.tween(130, (u) => { o.dx = dir * 14 * Math.sin(u * Math.PI / 2); o.dy = -dir * 6 * Math.sin(u * Math.PI / 2); });
      this.burst(to.x, to.y, fx, 16, { speed: 2.4, r: 2 });
      if (type === 'fighting' || type === 'normal') this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, r: 4, grow: 1.2, shape: 'ring', c: '#ffffff', life: 0.3, max: 0.3 });
      await this.tween(140, (u) => { o.dx = dir * 14 * (1 - u); o.dy = -dir * 6 * (1 - u); });
    } else if (M.c === 'special') {
      const n = 22, dur = 520;
      await this.tween(dur, (u) => {
        const k = Math.floor(u * n);
        while ((this._emitted || 0) < k) {
          this._emitted = (this._emitted || 0) + 1;
          const t = this._emitted / n;
          const px = from.x + (to.x - from.x) * t, py = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * (type === 'water' || type === 'grass' ? 20 : 6);
          const shape = type === 'electric' ? 'bolt' : type === 'grass' ? 'leaf' : type === 'psychic' ? 'ring' : null;
          this.st.parts.push({ x: px, y: py, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6 - (type === 'fire' ? 0.5 : 0), r: shape === 'ring' ? 3 : 2 + Math.random() * 2, c: fx[this._emitted % 2], life: 0.35, max: 0.35, shape, grow: shape === 'ring' ? 0.5 : 0, a: 0 });
        }
      });
      this._emitted = 0;
      this.burst(to.x, to.y, fx, 18, { speed: 2, r: 2.2 });
      if (type === 'ground' || type === 'rock') await this.shakeScreen(5, 300);
    } else {
      const c = selfMove ? from : to;
      for (let i = 0; i < 3; i++) { this.st.parts.push({ x: c.x, y: c.y, vx: 0, vy: 0, r: 4 + i * 4, grow: 0.8, shape: 'ring', c: fx[i % 2], life: 0.45, max: 0.45 }); await wait(90); }
      this.burst(c.x, c.y, fx, 10, { speed: 1, r: 1.5, up: 0.6 });
      await wait(180);
    }
  }
  async animHit(side, eff, crit) {
    const o = side === 1 ? this.st.foe : this.st.me;
    this.sound.sfx(eff > 1 || crit ? 'hitstrong' : eff < 1 ? 'hitweak' : 'hit');
    o.blink = true; if (eff > 1 || crit) this.shakeScreen(3, 200);
    await this.tween(360, (u) => { o.dx = Math.sin(u * 30) * 3 * (1 - u); });
    o.blink = false; o.dx = 0;
  }
  async animHp(side, from, to, status) {
    const m = this.battle.act(side), max = m.stats[0];
    const d = Math.abs(to - from), dur = Math.min(1100, 300 + d / max * 900);
    if (status !== undefined && side === 0) this.setHud(0, m, from);
    await this.tween(dur, (u) => this.setHp(side, from + (to - from) * u, max));
    this.setHp(side, to, max);
    if (side === 0 && to > 0 && to / max <= 0.2 && from / max > 0.2) this.sound.sfx('status');
  }
  async animStat(side, up) {
    const c = this.sprCenter(side);
    this.sound.sfx(up ? 'stat' : 'statdown');
    for (let i = 0; i < 16; i++) this.st.parts.push({ x: c.x - 24 + Math.random() * 48, y: c.y + (up ? 20 : -24) + Math.random() * 10, vx: 0, vy: up ? -1.2 : 1.2, r: 1.5, c: up ? '#ff8870' : '#70a0ff', life: 0.5, max: 0.5 });
    await wait(450);
  }
  async animStatus(side, k) {
    const c = this.sprCenter(side), cols = { sleep: ['#c0c8ff', '#ffffff'], confused: ['#ffe060', '#ffffff'], burn: ['#ff8030', '#ffd040'], poison: ['#b050c8', '#e090f0'], para: ['#ffe040', '#ffffff'], seed: ['#58c040', '#b0f080'], protect: ['#a0e0ff', '#ffffff'] }[k] || ['#fff'];
    if (k === 'protect') { this.st.parts.push({ x: c.x, y: c.y, vx: 0, vy: 0, r: 22, grow: 0.2, shape: 'ring', c: '#a0e0ff', life: 0.5, max: 0.5 }); }
    else if (k === 'para') this.burst(c.x, c.y, cols, 8, { shape: 'bolt', speed: 1.2 });
    else this.burst(c.x, c.y - 4, cols, 10, { speed: 0.8, up: 0.7, r: 1.8 });
    await wait(380);
  }
  async animFaint(side) {
    const o = side === 1 ? this.st.foe : this.st.me, m = this.battle.act(side);
    this.sound.cry(ASSETS.cry(m.sp)); await wait(200);
    this.sound.sfx('faint');
    o.clipY = 0;
    await this.tween(420, (u) => { o.dy = 80 * u; });
    o.visible = false; o.dy = 0; o.clipY = null;
    this.setHud(side, null);
  }
  async animExp(e) {
    const bar = this.hud.me.querySelector('.bh-exp u');
    const go = (a, b, ms) => this.tween(ms, (u) => { bar.style.width = (a + (b - a) * u) * 100 + '%'; if (Math.random() < 0.3) this.sound.sfx('exp'); });
    if (e.lv > e.lv0) { await go(e.from, 1, 500); bar.style.width = '0%'; await go(0, e.to, 400); }
    else await go(e.from, e.to, Math.max(200, (e.to - e.from) * 1200));
  }
  async levelBox(e) {
    const names = ['PV', 'Attaque', 'Défense', 'Atq. Spé.', 'Déf. Spé.', 'Vitesse'];
    const box = el('div', 'box lvbox', names.map((n, k) => `<div><span>${n}</span><b>+${e.after[k] - e.before[k]}</b></div>`).join(''));
    this.root.appendChild(box);
    await this.msg(`${monName(this.game.state.party[e.idx])} monte au niveau ${e.lvl} !`, { wait: true });
    box.innerHTML = names.map((n, k) => `<div><span>${n}</span><b>${e.after[k]}</b></div>`).join('');
    await new Promise((res) => { const pop = this.ui.input.push((k) => { if (k === 'a' || k === 'b') { pop(); res(); } }); });
    box.remove();
  }
  async animBall(e) {
    const ep = this.ePos(), tx = ep.x, ty = ep.y - 34;
    const ball = { x: 10, y: 150, item: e.item, rot: 0 }; this.st.balls.push(ball);
    this.sound.sfx('throw');
    await this.tween(520, (u) => { ball.x = 10 + (tx - 10) * u; ball.y = 150 + (ty - 150) * u - Math.sin(u * Math.PI) * 70; ball.rot = u * 14; });
    if (e.blocked) { await this.tween(300, (u) => { ball.x = tx + 60 * u; ball.y = ty - 30 * u; }); this.st.balls = []; return; }
    // le Pokémon est aspiré dans la Ball
    const o = this.st.foe; this.sound.sfx('poof'); this.burst(tx, ty + 8, ['#ffffff', '#ffe0f0'], 16, { speed: 1.6 });
    o.white = 1; await this.tween(300, (u) => { o.scale = 1 - u; }); o.visible = false;
    await this.tween(380, (u) => { ball.y = ty + (ep.y - 8 - ty) * Math.min(1, u * 1.4) - (u > 0.7 ? Math.sin((u - 0.7) / 0.3 * Math.PI) * 6 : 0); });
    for (let i = 0; i < e.shakes; i++) {
      await wait(380); this.sound.sfx('shake');
      await this.tween(300, (u) => { ball.rot = Math.sin(u * Math.PI * 2) * 0.5; ball.x = tx + Math.sin(u * Math.PI * 2) * 2; });
    }
    await wait(400);
    if (e.caught) {
      this.sound.sfx('shake'); this.burst(ball.x, ball.y - 4, ['#ffe060', '#ffffff'], 10, { speed: 1, up: 0.8, r: 1.5 });
      this.sound.sfx('caught'); await wait(500);
      this.setHud(1, null);
    } else {
      this.sound.sfx('poof'); this.burst(ball.x, ball.y, ['#ffffff', '#fff6a0'], 18, { speed: 2 });
      this.st.balls = []; o.visible = true; o.white = 1;
      await this.tween(260, (u) => { o.scale = u; }); await this.tween(200, (u) => { o.white = 1 - u; }); o.white = 0;
    }
    this.st.balls = this.st.balls.filter((q) => q !== ball || e.caught);
  }
  async shakeScreen(a, ms) { await this.tween(ms, (u) => { this.st.shakeX = (Math.random() - 0.5) * a * (1 - u) * 2; this.st.shakeY = (Math.random() - 0.5) * a * (1 - u); }); this.st.shakeX = this.st.shakeY = 0; }
}
