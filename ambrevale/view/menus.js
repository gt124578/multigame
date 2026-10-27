// Panneaux de l'écran du bas (et leur partie sur l'écran du haut).
import { audio } from './audio.js';
import { frame, button, hpBar, xpBar, typeTag, statusTag, subBackground, topBar, icon, ballIcon, drawText, drawTextCentered, drawTextRight, textWidth, wrap, rrect, drawTiny } from './ui.js';
import { species, SPECIES_LIST } from '../engine/species.js';
import { move as MV } from '../engine/moves.js';
import { TYPES } from '../engine/types.js';
import { monName, xpFor, STAT_NAMES, STAT_KEYS, healMon } from '../engine/mon.js';
import { ITEMS, POCKETS } from '../engine/items.js';
import { BADGES, GYMS } from '../engine/gyms.js';
import { TOWNS_DATA } from '../engine/towns.js';
import { creatureSprite } from '../gfx/creatures.js';
import { personSheet } from '../gfx/people.js';
import { GR } from '../engine/world.js';
import { makeCanvas, shade } from '../gfx/pixel.js';

const fmtMoney = (n) => n.toLocaleString('fr-FR').replace(/ | /g, ' ') + ' ¤';
const inR = (p, x, y, w, h) => p.x >= x && p.y >= y && p.x < x + w && p.y < y + h;
function spr(id, view = 'front', size = 64) { const s = species(id); return creatureSprite(id, s.sp, view, size); }

/** grand aperçu d'une créature sur l'écran du haut */
export function drawMonSummary(c, m, t = 0) {
  const S = species(m.sp);
  c.fillStyle = '#f2eee4'; c.fillRect(0, 0, 256, 192);
  for (let y = 0; y < 192; y += 8) { c.fillStyle = y % 16 ? '#ebe6da' : '#f2eee4'; c.fillRect(0, y, 256, 8); }
  rrect(c, 4, 4, 104, 104, '#7a90b8', 4); rrect(c, 6, 6, 100, 100, '#dce6f4', 3);
  c.fillStyle = '#c8d4e8'; c.beginPath(); c.ellipse(56, 92, 36, 9, 0, 0, Math.PI * 2); c.fill();
  c.drawImage(spr(m.sp), 24, 34 + Math.round(Math.sin(t * 3) * 1));
  drawText(c, `N°${String(S.num).padStart(3, '0')}`, 10, 8, '#5a6a8a', null);
  frame(c, 112, 4, 140, 50, 'text');
  drawText(c, monName(m), 120, 9); drawTextRight(c, 'Nv ' + m.level, 246, 9);
  S.types.forEach((ty, i) => typeTag(c, 120 + i * 38, 24, ty));
  statusTag(c, 200, 25, m.status);
  hpBar(c, 120, 40, 60, m.hp / m.stats.hp); drawTextRight(c, `${m.hp}/${m.stats.hp}`, 246, 36);
  frame(c, 112, 56, 140, 52, 'text');
  STAT_KEYS.slice(1).forEach((k, i) => { const col = i < 3 ? 0 : 1, row = i % 3; drawText(c, STAT_NAMES[i + 1].slice(0, 7), 119 + col * 68, 61 + row * 14, '#6a7088', null); drawTextRight(c, String(m.stats[k]), 177 + col * 68, 61 + row * 14); });
  frame(c, 4, 110, 248, 78, 'text');
  m.moves.forEach((mv, i) => {
    const M = MV(mv.id), y = 116 + i * 17;
    typeTag(c, 11, y + 1, M.type, 36);
    drawText(c, M.name, 52, y); drawTextRight(c, `PP ${mv.pp}/${M.pp}`, 244, y, '#6a7088', null);
  });
  const nx = xpFor(m.level + 1), px = xpFor(m.level);
  xpBar(c, 120, 49, 124, m.level >= 100 ? 1 : (m.xp - px) / Math.max(1, nx - px));
}

// ===================================================================== carnet (menu principal)
export class MainMenu {
  constructor(G) { this.G = G; this.sel = 0; }
  items() {
    return [
      { id: 'team', label: 'Équipe', col: '#e05050', icon: 'team' },
      { id: 'bag', label: 'Sac', col: '#e08a30', icon: 'bag' },
      { id: 'dex', label: 'Bestiaire', col: '#2a9a8a', icon: 'dex', off: !this.G.st.flags.dex },
      { id: 'map', label: 'Carte', col: '#58a848', icon: 'map' },
      { id: 'card', label: 'Badges', col: '#c89a28', icon: 'badge' },
      { id: 'save', label: 'Sauver', col: '#4a78d0', icon: 'save' },
    ];
  }
  rect(i) { return [6 + (i % 3) * 82, 22 + Math.floor(i / 3) * 64, 78, 58]; }
  draw(c, t) {
    const G = this.G;
    subBackground(c, '#e4ecf4', '#d4e0ec', t);
    const d = new Date(), hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    const loc = G.map.outdoor ? (G.area?.name || 'Ambrevale') : G.map.name;
    topBar(c, loc, '#4a6aa8', `${hh}${Math.floor(t * 2) % 2 ? ':' : ' '}${mm}`);
    this.items().forEach((it, i) => {
      const [x, y, w, h] = this.rect(i);
      button(c, x, y, w, h, it.col, it.label, { sel: G.menuFocus && i === this.sel, disabled: it.off || (it.id === 'team' && !G.st.party.length), icon: icon(it.icon) });
    });
    rrect(c, 4, 152, 248, 36, '#3a4a6a', 3); rrect(c, 5, 153, 246, 34, '#f8fafc', 3);
    drawText(c, fmtMoney(G.st.money), 12, 156, '#3a4a6a', null);
    drawText(c, `Badges : ${G.st.badges}`, 12, 170, '#3a4a6a', null);
    button(c, 178, 156, 70, 28, audio.muted ? '#8a8a96' : '#5a9ad8', audio.muted ? 'Son : non' : 'Son : oui', {});
    if (!G.menuFocus) drawTextCentered(c, 'Tab : menu', 128, 170, '#8a98b0', null);
  }
  key(k) {
    const G = this.G, n = 6;
    if (k === 'left') this.sel = (this.sel + n - 1) % n;
    else if (k === 'right') this.sel = (this.sel + 1) % n;
    else if (k === 'up' || k === 'down') this.sel = (this.sel + 3) % n;
    else if (k === 'a') return this.open(this.items()[this.sel].id);
    else if (k === 'b' || k === 'menu') { G.menuFocus = false; audio.sfx('back'); return; }
    else return;
    audio.sfx('move');
  }
  click(p) {
    const G = this.G;
    if (G.busy || G.player?.moving) return;
    if (inR(p, 178, 156, 70, 28)) { audio.toggleMute(); return; }
    this.items().forEach((it, i) => { const [x, y, w, h] = this.rect(i); if (inR(p, x, y, w, h)) { this.sel = i; this.open(it.id); } });
  }
  open(id) {
    const G = this.G, it = this.items().find((x) => x.id === id);
    if (!it || it.off || (id === 'team' && !G.st.party.length)) { audio.sfx('bump'); return; }
    audio.sfx('select');
    G.menuFocus = false;
    G.run(async () => {
      if (id === 'team') await G.openPanel(new PartyPanel(G, 'view'));
      if (id === 'bag') await G.openPanel(new BagPanel(G, 'field'));
      if (id === 'dex') await G.openPanel(new DexPanel(G));
      if (id === 'map') await G.openPanel(new MapPanel(G, 'view'));
      if (id === 'card') await G.openPanel(new CardPanel(G));
      if (id === 'save') {
        const r = await G.ask('Veux-tu sauvegarder ta partie ?');
        if (r === 0) { G.save(false); audio.sfx('save'); await G.say(`${G.st.name} a sauvegardé la partie.`); }
      }
      G.menuFocus = true;
    });
  }
}

// ===================================================================== équipe
export class PartyPanel {
  /** mode : view | switch | item | select ; o.forced : pas d'annulation ; o.item : objet à utiliser */
  constructor(G, mode, o = {}) { this.G = G; this.mode = mode; this.o = o; this.sel = o.start ?? 0; this.menu = null; this.swap = null; }
  get party() { return this.G.st.party; }
  rect(i) { return [3 + (i % 2) * 126, 18 + Math.floor(i / 2) * 50, 124, 47]; }
  draw(c, t) {
    subBackground(c, '#e8e0f0', '#dcd2e8', t);
    const title = { view: 'Ton équipe', switch: 'Choisis une créature', item: 'Sur quelle créature ?', select: 'Choisis une créature' }[this.mode];
    topBar(c, title, '#8a5ab0');
    for (let i = 0; i < 6; i++) {
      const [x, y, w, h] = this.rect(i), m = this.party[i];
      const sel = i === this.sel, sw = this.swap === i;
      if (!m) { rrect(c, x, y, w, h, '#c8c0d4', 4); rrect(c, x + 1, y + 1, w - 2, h - 2, '#d8d0e2', 3); continue; }
      const base = m.hp <= 0 ? '#e8a0a0' : i === 0 ? '#9ad0f0' : '#b8d8a8';
      rrect(c, x, y, w, h, sel ? '#ff6a4a' : sw ? '#f0c030' : '#4a4a6a', 4);
      rrect(c, x + 2, y + 2, w - 4, h - 4, base, 3);
      c.fillStyle = shade(base, 0.3); c.fillRect(x + 4, y + 3, w - 8, 3);
      const bob = sel ? Math.round(Math.sin(t * 8) * 1.5) : 0;
      c.drawImage(spr(m.sp, 'front', 32), x + 2, y + 3 + bob);
      drawText(c, monName(m), x + 36, y + 4);
      drawText(c, 'Nv' + m.level, x + 36, y + 17, '#4a4a6a', null);
      statusTag(c, x + 70, y + 19, m.status);
      hpBar(c, x + 36, y + 31, 54, m.hp / m.stats.hp);
      drawTextRight(c, `${m.hp}/${m.stats.hp}`, x + w - 5, y + 33, '#4a4a6a', null);
    }
    if (!this.o.forced) button(c, 186, 168, 66, 22, '#6a6a8a', 'Retour', { sel: this.sel === 6 });
    if (this.o.hint) drawText(c, this.o.hint, 6, 172, '#6a5a8a', null);
    if (this.menu) {
      const opts = this.menu.opts, h = opts.length * 15 + 10, x = 150, y = 160 - h;
      frame(c, x, y, 100, h, 'text');
      opts.forEach((o, i) => { drawText(c, o, x + 14, y + 6 + i * 15); if (i === this.menu.sel) drawText(c, '▶', x + 5, y + 6 + i * 15, '#484850', null); });
    }
  }
  drawTop(c) { const m = this.party[Math.min(this.sel, this.party.length - 1)]; if (m) drawMonSummary(c, m, this.G.t); }
  key(k) {
    const n = this.party.length;
    if (this.menu) {
      const M = this.menu;
      if (k === 'up') M.sel = (M.sel + M.opts.length - 1) % M.opts.length;
      else if (k === 'down') M.sel = (M.sel + 1) % M.opts.length;
      else if (k === 'b') { this.menu = null; audio.sfx('back'); return; }
      else if (k === 'a') { const o = M.opts[M.sel]; this.menu = null; audio.sfx('select'); return this.menuPick(o); }
      else return;
      audio.sfx('move'); return;
    }
    if (k === 'left' || k === 'right') { if (this.sel < 6) this.sel = this.sel % 2 ? this.sel - 1 : Math.min(n - 1, this.sel + 1); }
    else if (k === 'up') this.sel = this.sel === 6 ? n - 1 : Math.max(0, this.sel - 2);
    else if (k === 'down') this.sel = this.sel + 2 >= n ? (this.o.forced ? this.sel : 6) : this.sel + 2;
    else if (k === 'a') return this.pick(this.sel);
    else if (k === 'b' || k === 'menu') { if (this.swap != null) { this.swap = null; return; } if (!this.o.forced) { audio.sfx('back'); this.G.closePanel(this, -1); } return; }
    else return;
    audio.sfx('move');
  }
  click(p) {
    if (this.menu) { const M = this.menu, h = M.opts.length * 15 + 10, y0 = 160 - h; M.opts.forEach((o, i) => { if (inR(p, 150, y0 + 5 + i * 15, 100, 15)) { M.sel = i; this.key('a'); } }); return; }
    if (!this.o.forced && inR(p, 186, 168, 66, 22)) { this.sel = 6; return this.key('a'); }
    for (let i = 0; i < this.party.length; i++) { const [x, y, w, h] = this.rect(i); if (inR(p, x, y, w, h)) { this.sel = i; return this.pick(i); } }
  }
  pick(i) {
    const G = this.G;
    if (i === 6) { audio.sfx('back'); return G.closePanel(this, -1); }
    const m = this.party[i]; if (!m) return;
    audio.sfx('select');
    if (this.swap != null) {
      const a = this.swap; this.swap = null;
      [this.party[a], this.party[i]] = [this.party[i], this.party[a]];
      G.refreshFollower?.(); return;
    }
    if (this.mode === 'view') { this.menu = { opts: ['Déplacer', 'Retour'], sel: 0, i }; return; }
    if (this.mode === 'switch') {
      if (m.hp <= 0) return G.run(() => G.say(`${monName(m)} est K.O. et ne peut pas se battre !`));
      if (i === this.o.active) return G.run(() => G.say(`${monName(m)} est déjà au combat !`));
      return G.closePanel(this, i);
    }
    if (this.mode === 'item') return this.useItem(i);
    return G.closePanel(this, i);
  }
  menuPick(o) { if (o === 'Déplacer') this.swap = this.sel; }
  async useItem(i) {
    const G = this.G, m = this.party[i], it = ITEMS[this.o.item];
    const ok = (it.heal && m.hp > 0 && m.hp < m.stats.hp) || (it.revive && m.hp <= 0) || (it.cure && m.status && it.cure.includes(m.status));
    if (!ok) return G.run(() => G.say('Cela n\'aurait aucun effet.'));
    if (this.o.battle) return G.closePanel(this, i);
    G.st.bag[this.o.item]--;
    if (it.revive) { m.hp = Math.max(1, Math.floor(m.stats.hp * it.revive)); m.status = null; }
    let gain = 0;
    if (it.heal) { const b = m.hp; m.hp = Math.min(m.stats.hp, m.hp + it.heal); gain = m.hp - b; }
    if (it.cure) m.status = null;
    audio.sfx('heal');
    G.closePanel(this, i);
    await G.say(it.heal ? `${monName(m)} récupère ${gain} PV.` : it.revive ? `${monName(m)} est ranimé !` : `${monName(m)} est soigné.`);
  }
}

// ===================================================================== sac
export class BagPanel {
  constructor(G, mode) { this.G = G; this.mode = mode; this.pocket = mode === 'battle' ? 0 : 0; this.sel = 0; this.scroll = 0; }
  list() { const pk = POCKETS[this.pocket][0]; return Object.entries(this.G.st.bag).filter(([id, n]) => n > 0 && ITEMS[id] && ITEMS[id].pocket === pk).map(([id, n]) => ({ id, n })); }
  draw(c, t) {
    subBackground(c, '#f4e6d4', '#ecd8c0', t);
    topBar(c, 'Sac', '#c07030');
    POCKETS.forEach(([, name], i) => button(c, 4 + i * 84, 18, 80, 18, i === this.pocket ? '#e0903a' : '#b8a090', name, {}));
    const L = this.list();
    rrect(c, 4, 40, 248, 124, '#7a5a3a', 4); rrect(c, 5, 41, 246, 122, '#fffaf2', 3);
    if (!L.length) drawTextCentered(c, 'Rien ici.', 128, 92, '#a08a70', null);
    const vis = 7;
    if (this.sel < this.scroll) this.scroll = this.sel; if (this.sel >= this.scroll + vis) this.scroll = this.sel - vis + 1;
    L.slice(this.scroll, this.scroll + vis).forEach((it, k) => {
      const i = k + this.scroll, y = 44 + k * 17, I = ITEMS[it.id];
      if (i === this.sel) { rrect(c, 8, y, 240, 16, '#f8d8a8', 2); drawText(c, '▶', 11, y + 2, '#7a4a2a', null); }
      if (I.ball) ballIcon(c, 22, y + 4, I.color); else { rrect(c, 22, y + 4, 8, 8, I.pocket === 'soin' ? '#8a5ad0' : '#58a8d0', 2); }
      drawText(c, I.name, 36, y + 2); drawTextRight(c, '× ' + it.n, 242, y + 2, '#6a5a4a', null);
    });
    button(c, 186, 168, 66, 22, '#8a7a6a', 'Retour', {});
    drawText(c, '← → : poche', 8, 172, '#8a7a6a', null);
  }
  drawTop(c) {
    const it = this.list()[this.sel];
    if (this.G.mode === 'battle') return;
    if (!it) return;
    frame(c, 4, 120, 248, 68, 'menu');
    drawText(c, ITEMS[it.id].name, 14, 126, '#7a3a2a', null);
    wrap(ITEMS[it.id].desc, 228).forEach((l, i) => drawText(c, l, 14, 144 + i * 14));
  }
  key(k) {
    const L = this.list();
    if (k === 'left') { this.pocket = (this.pocket + 2) % 3; this.sel = 0; }
    else if (k === 'right') { this.pocket = (this.pocket + 1) % 3; this.sel = 0; }
    else if (k === 'up') this.sel = Math.max(0, this.sel - 1);
    else if (k === 'down') this.sel = Math.min(Math.max(0, L.length - 1), this.sel + 1);
    else if (k === 'a') { if (L[this.sel]) this.use(L[this.sel].id); return; }
    else if (k === 'b' || k === 'menu') { audio.sfx('back'); this.G.closePanel(this, null); return; }
    else return;
    audio.sfx('move');
  }
  click(p) {
    if (inR(p, 186, 168, 66, 22)) return this.key('b');
    for (let i = 0; i < 3; i++) if (inR(p, 4 + i * 84, 18, 80, 18)) { this.pocket = i; this.sel = 0; return; }
    const L = this.list();
    for (let k = 0; k < 7; k++) if (inR(p, 8, 44 + k * 17, 240, 16) && L[k + this.scroll]) { if (this.sel === k + this.scroll) return this.use(L[this.sel].id); this.sel = k + this.scroll; }
  }
  async use(id) {
    const G = this.G, I = ITEMS[id];
    audio.sfx('select');
    if (this.mode === 'battle') {
      if (I.ball) return G.closePanel(this, { ball: id });
      if (I.repel) return G.run(() => G.say('Ce n\'est pas le moment d\'utiliser ça !'));
      const t = await G.openPanel(new PartyPanel(G, 'item', { item: id, battle: true }));
      if (t >= 0) G.closePanel(this, { item: id, target: t });
      return;
    }
    if (I.ball) return G.run(() => G.say('Ce n\'est pas le moment d\'utiliser ça !'));
    if (I.repel) { G.st.bag[id]--; G.st.repel = I.repel; audio.sfx('heal'); return G.run(() => G.say('Tu utilises un Repousse. Les créatures faibles t\'éviteront.')); }
    await G.openPanel(new PartyPanel(G, 'item', { item: id }));
  }
}

// ===================================================================== bestiaire
export class DexPanel {
  constructor(G) { this.G = G; this.sel = 0; this.scroll = 0; }
  draw(c, t) {
    subBackground(c, '#d8f0e8', '#c4e4d8', t);
    const st = this.G.st, seen = Object.keys(st.seen).length, caught = Object.keys(st.caught).length;
    topBar(c, 'Bestiaire', '#2a9a8a', `Vus ${seen}  Pris ${caught}`);
    rrect(c, 4, 18, 248, 146, '#2a6a5a', 4); rrect(c, 5, 19, 246, 144, '#f4fffa', 3);
    const vis = 9;
    if (this.sel < this.scroll) this.scroll = this.sel; if (this.sel >= this.scroll + vis) this.scroll = this.sel - vis + 1;
    SPECIES_LIST.slice(this.scroll, this.scroll + vis).forEach((s, k) => {
      const i = k + this.scroll, y = 21 + k * 16;
      if (i === this.sel) rrect(c, 8, y, 240, 15, '#b8ecd8', 2);
      drawText(c, String(s.num).padStart(3, '0'), 14, y + 2, '#4a7a6a', null);
      if (st.caught[s.id]) ballIcon(c, 40, y + 4, '#e84848');
      drawText(c, st.seen[s.id] ? s.name : '- - - - -', 54, y + 2, st.seen[s.id] ? '#2a3a3a' : '#9ab0a8', null);
      if (st.seen[s.id]) s.types.forEach((ty, j) => typeTag(c, 160 + j * 42, y + 2, ty, 40));
    });
    button(c, 186, 168, 66, 22, '#4a8a7a', 'Retour', {});
  }
  drawTop(c) {
    const s = SPECIES_LIST[this.sel], st = this.G.st;
    c.fillStyle = '#e4f4ee'; c.fillRect(0, 0, 256, 192);
    rrect(c, 6, 6, 100, 100, '#2a9a8a', 4); rrect(c, 8, 8, 96, 96, '#f8fffc', 3);
    if (st.seen[s.id]) c.drawImage(spr(s.id), 24, 26);
    else drawTextCentered(c, '?', 56, 50, '#9ab0a8', null);
    frame(c, 112, 6, 138, 100, 'green');
    drawText(c, `N°${String(s.num).padStart(3, '0')}`, 122, 12, '#4a7a6a', null);
    drawText(c, st.seen[s.id] ? s.name : '?????', 122, 28);
    if (st.seen[s.id]) s.types.forEach((ty, j) => typeTag(c, 122 + j * 40, 46, ty, 38));
    drawText(c, st.caught[s.id] ? 'Capturé' : st.seen[s.id] ? 'Aperçu' : 'Inconnu', 122, 64, st.caught[s.id] ? '#c84040' : '#6a8a80', null);
    frame(c, 6, 110, 244, 76, 'green');
    const d = st.caught[s.id] ? (s.desc || 'Une créature encore peu étudiée.') : 'Capture cette créature pour en savoir plus.';
    wrap(d, 224).forEach((l, i) => drawText(c, l, 16, 118 + i * 15));
  }
  key(k) {
    const n = SPECIES_LIST.length;
    if (k === 'up') this.sel = (this.sel + n - 1) % n;
    else if (k === 'down') this.sel = (this.sel + 1) % n;
    else if (k === 'left') this.sel = Math.max(0, this.sel - 9);
    else if (k === 'right') this.sel = Math.min(n - 1, this.sel + 9);
    else if (k === 'b' || k === 'menu' || k === 'a') { if (k !== 'a') { audio.sfx('back'); this.G.closePanel(this); } return; }
    else return;
    audio.sfx('move');
  }
  click(p) { if (inR(p, 186, 168, 66, 22)) return this.key('b'); for (let k = 0; k < 9; k++) if (inR(p, 8, 21 + k * 16, 240, 15)) this.sel = Math.min(SPECIES_LIST.length - 1, k + this.scroll); }
}

// ===================================================================== carte de la région
let MAPCANVAS = null;
function regionCanvas(W) {
  if (MAPCANVAS) return MAPCANVAS;
  const { c, ctx } = makeCanvas(240, 200);
  const img = ctx.createImageData(240, 200), d = img.data;
  const col = { [GR.WATER]: [72, 132, 220], [GR.SAND]: [236, 216, 150], [GR.SNOW]: [236, 242, 248], [GR.SNOWTALL]: [210, 226, 236], [GR.SNOWPATH]: [210, 220, 232], [GR.ROCKY]: [176, 150, 112], [GR.ASH]: [120, 108, 104], [GR.PAVE]: [200, 196, 200], [GR.PATH]: [222, 196, 132], [GR.BRIDGE]: [170, 120, 70], [GR.DOCK]: [150, 110, 70] };
  for (let y = 0; y < 200; y++) for (let x = 0; x < 240; x++) {
    const i = W.i(x, y), g = W.ground[i];
    let cc = col[g] || [112, 184, 88];
    if (W.obj[i] && (g === GR.GRASS || g === GR.DARKGRASS)) cc = [56, 128, 64];
    if (W.obj[i] && g === GR.SNOW) cc = [90, 140, 120];
    if (W.elev[i]) cc = cc.map((v) => v * (1 - 0.12 * W.elev[i]));
    if (W.routeMask && W.routeMask[i] && !W.obj[i] && g !== GR.WATER) cc = [228, 214, 150];
    const o = (y * 240 + x) * 4; d[o] = cc[0]; d[o + 1] = cc[1]; d[o + 2] = cc[2]; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  MAPCANVAS = c; return c;
}
export class MapPanel {
  constructor(G, mode) {
    this.G = G; this.mode = mode;
    this.towns = TOWNS_DATA.filter((T) => mode !== 'fly' || G.st.visited[T.id]);
    const cur = G.map.outdoor && G.area ? this.towns.findIndex((T) => T.id === G.area.id) : -1;
    this.sel = Math.max(0, cur);
  }
  draw(c, t) {
    const G = this.G;
    c.fillStyle = '#2a3a5a'; c.fillRect(0, 0, 256, 192);
    topBar(c, this.mode === 'fly' ? 'Envol : choisis une ville' : 'Carte d\'Ambrevale', '#3a6a9a');
    const ox = 8, oy = 18, sx = 240 / 240, sy = 150 / 200;
    c.drawImage(regionCanvas(G.world), 0, 0, 240, 200, ox, oy, 240, 150);
    for (const [i, T] of this.towns.entries()) {
      const r = T.rect, x = ox + ((r[0] + r[2]) / 2) * sx, y = oy + ((r[1] + r[3]) / 2) * sy;
      const s = i === this.sel;
      c.fillStyle = '#2a2a3a'; c.fillRect(x - 4, y - 3, 9, 7);
      c.fillStyle = G.st.visited[T.id] ? (s ? '#ff5a3a' : '#f8e070') : '#a0a0b0'; c.fillRect(x - 3, y - 2, 7, 5);
    }
    // position du joueur
    if (Math.floor(t * 3) % 2) {
      let px = G.player.x, py = G.player.y;
      if (!G.map.outdoor) { const def = G.world.interiors[G.map.id]; if (def) { px = def.exit.x; py = def.exit.y; } else if (G.map.id === 'grotte') { px = 167; py = 132; } else if (G.map.id === 'antre') { px = 201; py = 12; } }
      c.fillStyle = '#ffffff'; c.fillRect(ox + px * sx - 2, oy + py * sy - 2, 5, 5); c.fillStyle = '#3a8ae0'; c.fillRect(ox + px * sx - 1, oy + py * sy - 1, 3, 3);
    }
    const T = this.towns[this.sel];
    rrect(c, 4, 170, 176, 20, '#1a2a4a', 3); drawText(c, T ? T.name : '', 10, 174, '#ffffff', null);
    button(c, 186, 168, 66, 22, '#6a7a9a', this.mode === 'fly' ? 'Annuler' : 'Retour', {});
  }
  drawTop(c) {
    const T = this.towns[this.sel]; if (!T) return;
    frame(c, 4, 140, 248, 48, 'text');
    drawText(c, T.name, 14, 146, '#3a4a6a', null);
    const g = GYMS[Object.keys(GYMS).find((k) => this.G.world.interiors[T.id + ':gym']?.gym === k)];
    drawText(c, g ? `Arène : ${g.leader.name} (${TYPES[Object.keys(GYMS).find((k) => GYMS[k] === g)].name})` : T.id === 'hameau' ? 'Ton village natal.' : T.id === 'plateau' ? 'La Ligue d\'Ambrevale.' : '', 14, 164);
  }
  key(k) {
    const n = this.towns.length;
    if (k === 'left' || k === 'up') this.sel = (this.sel + n - 1) % n;
    else if (k === 'right' || k === 'down') this.sel = (this.sel + 1) % n;
    else if (k === 'a') { if (this.mode === 'fly') { audio.sfx('select'); this.G.closePanel(this, this.towns[this.sel]?.id); } return; }
    else if (k === 'b' || k === 'menu') { audio.sfx('back'); this.G.closePanel(this, null); return; }
    else return;
    audio.sfx('move');
  }
  click(p) {
    if (inR(p, 186, 168, 66, 22)) return this.key('b');
    let best = -1, bd = 12;
    this.towns.forEach((T, i) => { const r = T.rect, x = 8 + (r[0] + r[2]) / 2, y = 18 + ((r[1] + r[3]) / 2) * 0.75; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { if (best === this.sel && this.mode === 'fly') return this.key('a'); this.sel = best; }
  }
}

// ===================================================================== carte de dresseur et badges
function badgeIcon(c, x, y, col, got) {
  const R = 11;
  for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
    const d = Math.max(Math.abs(xx), Math.abs(yy), (Math.abs(xx) + Math.abs(yy)) * 0.72);
    if (d > R) continue;
    c.fillStyle = !got ? (d > R - 1.5 ? '#8a8aa0' : '#c8c8d8') : d > R - 1.5 ? shade(col, -0.5) : d > R - 3 ? shade(col, -0.15) : (xx + yy < -4 ? shade(col, 0.45) : col);
    c.fillRect(x + xx, y + yy, 1, 1);
  }
  if (got) { c.fillStyle = '#ffffff'; c.fillRect(x - 4, y - 5, 2, 2); }
}
export class CardPanel {
  constructor(G) { this.G = G; this.sel = 0; }
  draw(c, t) {
    subBackground(c, '#f4ecd4', '#ecdfc0', t);
    topBar(c, 'Badges', '#b08a28');
    BADGES.forEach((b, i) => {
      const x = 32 + (i % 4) * 64, y = 50 + Math.floor(i / 4) * 62, got = this.G.st.badges > i;
      rrect(c, x - 26, y - 24, 52, 58, i === this.sel ? '#e0a030' : '#a8946a', 4); rrect(c, x - 25, y - 23, 50, 56, '#fffaee', 3);
      badgeIcon(c, x, y - 2, b.color, got);
      drawTextCentered(c, got ? b.name.replace('Badge ', '') : '???', x, y + 15, got ? '#6a4a1a' : '#a8a090', null);
    });
    button(c, 186, 168, 66, 22, '#a08a5a', 'Retour', {});
  }
  drawTop(c) {
    const G = this.G, st = G.st;
    c.fillStyle = '#d8c8a0'; c.fillRect(0, 0, 256, 192);
    rrect(c, 8, 10, 240, 172, '#6a5030', 6); rrect(c, 10, 12, 236, 168, '#fff6e0', 5);
    rrect(c, 10, 12, 236, 22, '#d8a840', 5); drawText(c, 'CARTE DE DRESSEUR', 18, 17, '#ffffff', '#8a6a20');
    const sheet = personSheet(st.look);
    c.save(); c.imageSmoothingEnabled = false; c.drawImage(sheet, 0, 0, 16, 24, 176, 46, 48, 72); c.restore();
    const L = [['Nom', st.name], ['Argent', fmtMoney(st.money)], ['Bestiaire', `${Object.keys(st.caught).length} capturées`], ['Badges', `${st.badges} / 8`], ['Temps de jeu', `${Math.floor(st.time / 3600)} h ${String(Math.floor(st.time / 60) % 60).padStart(2, '0')}`]];
    L.forEach(([k, v], i) => { drawText(c, k, 20, 44 + i * 20, '#8a6a3a', null); drawText(c, v, 92, 44 + i * 20); });
    const b = BADGES[this.sel];
    drawText(c, (st.badges > this.sel ? b.name : '???') + (st.badges > this.sel ? ' — ' + GYMS[b.id].leader.name : ''), 20, 150, '#6a4a1a', null);
  }
  key(k) {
    if (k === 'left') this.sel = (this.sel + 7) % 8; else if (k === 'right') this.sel = (this.sel + 1) % 8; else if (k === 'up' || k === 'down') this.sel = (this.sel + 4) % 8;
    else if (k === 'b' || k === 'menu' || k === 'a') { if (k !== 'a') { audio.sfx('back'); this.G.closePanel(this); } return; } else return;
    audio.sfx('move');
  }
  click(p) { if (inR(p, 186, 168, 66, 22)) this.key('b'); for (let i = 0; i < 8; i++) { const x = 32 + (i % 4) * 64, y = 50 + Math.floor(i / 4) * 62; if (inR(p, x - 26, y - 24, 52, 58)) this.sel = i; } }
}

// ===================================================================== boutique
export class ShopPanel {
  constructor(G, stock) { this.G = G; this.stock = stock; this.sel = 0; this.qty = null; }
  draw(c, t) {
    subBackground(c, '#dce8f8', '#cadcf2', t);
    topBar(c, 'Boutique', '#3a78d0', fmtMoney(this.G.st.money));
    rrect(c, 4, 18, 248, 146, '#2a4a7a', 4); rrect(c, 5, 19, 246, 144, '#f8fbff', 3);
    this.stock.forEach((id, i) => {
      const I = ITEMS[id], y = 22 + i * 17;
      if (i === this.sel) { rrect(c, 8, y, 240, 16, '#cce0ff', 2); drawText(c, '▶', 11, y + 2, '#2a4a7a', null); }
      if (I.ball) ballIcon(c, 22, y + 4, I.color); else rrect(c, 22, y + 4, 8, 8, I.pocket === 'soin' ? '#8a5ad0' : '#58a8d0', 2);
      drawText(c, I.name, 36, y + 2); drawTextRight(c, fmtMoney(I.price), 242, y + 2, '#3a4a6a', null);
    });
    button(c, 186, 168, 66, 22, '#5a6a8a', 'Retour', {});
    drawText(c, `Dans le sac : ${this.G.st.bag[this.stock[this.sel]] || 0}`, 8, 172, '#3a4a6a', null);
    if (this.qty) {
      const I = ITEMS[this.qty.id];
      frame(c, 60, 60, 136, 60, 'text');
      drawTextCentered(c, I.name, 128, 66);
      drawTextCentered(c, `◀  × ${this.qty.n}  ▶`.replace('◀', '«').replace('▶', '»'), 128, 82, '#3a4a6a', null);
      drawTextCentered(c, fmtMoney(I.price * this.qty.n), 128, 98, '#c84040', null);
    }
  }
  drawTop(c) { const I = ITEMS[this.stock[this.sel]]; frame(c, 4, 120, 248, 68, 'text'); drawText(c, I.name, 14, 126, '#3a4a8a', null); wrap(I.desc, 228).forEach((l, i) => drawText(c, l, 14, 144 + i * 14)); }
  key(k) {
    const G = this.G;
    if (this.qty) {
      const I = ITEMS[this.qty.id], max = Math.max(1, Math.min(99, Math.floor(G.st.money / I.price)));
      if (k === 'left' || k === 'down') this.qty.n = Math.max(1, this.qty.n - (k === 'down' ? 10 : 1));
      else if (k === 'right' || k === 'up') this.qty.n = Math.min(max, this.qty.n + (k === 'up' ? 10 : 1));
      else if (k === 'b') { this.qty = null; audio.sfx('back'); return; }
      else if (k === 'a') return this.buy();
      audio.sfx('move'); return;
    }
    if (k === 'up') this.sel = (this.sel + this.stock.length - 1) % this.stock.length;
    else if (k === 'down') this.sel = (this.sel + 1) % this.stock.length;
    else if (k === 'a') { const I = ITEMS[this.stock[this.sel]]; if (G.st.money < I.price) { audio.sfx('bump'); G.run(() => G.say('Tu n\'as pas assez d\'argent.')); return; } this.qty = { id: this.stock[this.sel], n: 1 }; audio.sfx('select'); return; }
    else if (k === 'b' || k === 'menu') { audio.sfx('back'); G.closePanel(this); return; }
    else return;
    audio.sfx('move');
  }
  click(p) {
    if (this.qty) { if (inR(p, 60, 80, 40, 16)) return this.key('left'); if (inR(p, 156, 80, 40, 16)) return this.key('right'); if (inR(p, 60, 60, 136, 60)) return this.key('a'); return this.key('b'); }
    if (inR(p, 186, 168, 66, 22)) return this.key('b');
    this.stock.forEach((id, i) => { if (inR(p, 8, 22 + i * 17, 240, 16)) { if (this.sel === i) this.key('a'); else this.sel = i; } });
  }
  async buy() {
    const G = this.G, { id, n } = this.qty, I = ITEMS[id];
    this.qty = null;
    if (G.st.money < I.price * n) return;
    G.st.money -= I.price * n; G.addItem(id, n);
    audio.sfx('buy');
    let extra = '';
    if (id === 'sphere' && n >= 10) { G.addItem('supersphere', 1); extra = ' Et voici une Super Sphère en cadeau !'; }
    await G.say(`Tu achètes ${n} × ${I.name}. Merci !${extra}`);
  }
}

// ===================================================================== PC de stockage
export class PCPanel {
  constructor(G) { this.G = G; this.side = 0; this.sel = 0; this.scroll = 0; }
  list(s) { return s === 0 ? this.G.st.party : this.G.st.box; }
  draw(c, t) {
    subBackground(c, '#e0e4ec', '#d0d6e2', t);
    topBar(c, 'Stockage des créatures', '#5a6a8a');
    ['Équipe', 'Boîte'].forEach((n, s) => {
      const x = 4 + s * 126;
      rrect(c, x, 18, 122, 146, s === this.side ? '#ff6a4a' : '#4a5a7a', 4); rrect(c, x + 2, 20, 118, 142, '#f8fafe', 3);
      drawText(c, `${n} (${this.list(s).length})`, x + 8, 22, '#4a5a7a', null);
      const L = this.list(s), vis = 6, sc = s === this.side ? this.scroll : 0;
      L.slice(sc, sc + vis).forEach((m, k) => {
        const i = k + sc, y = 36 + k * 21;
        if (s === this.side && i === this.sel) rrect(c, x + 4, y, 114, 20, '#ffd8c8', 2);
        c.drawImage(spr(m.sp, 'front', 32), x + 2, y - 8, 28, 28);
        drawText(c, monName(m), x + 32, y + 1); drawTextRight(c, 'Nv' + m.level, x + 116, y + 1, '#6a6a8a', null);
      });
    });
    button(c, 186, 168, 66, 22, '#6a6a8a', 'Retour', {});
    drawText(c, 'A : déplacer  ← → : côté', 6, 172, '#5a6a8a', null);
  }
  drawTop(c) { const m = this.list(this.side)[this.sel]; if (m) drawMonSummary(c, m, this.G.t); }
  key(k) {
    const L = this.list(this.side);
    if (k === 'left' || k === 'right') { this.side = 1 - this.side; this.sel = 0; this.scroll = 0; }
    else if (k === 'up') this.sel = Math.max(0, this.sel - 1);
    else if (k === 'down') this.sel = Math.min(Math.max(0, L.length - 1), this.sel + 1);
    else if (k === 'a') return this.moveSel();
    else if (k === 'b' || k === 'menu') { audio.sfx('back'); this.G.refreshFollower(); this.G.closePanel(this); return; }
    else return;
    if (this.sel < this.scroll) this.scroll = this.sel; if (this.sel >= this.scroll + 6) this.scroll = this.sel - 5;
    audio.sfx('move');
  }
  click(p) { if (inR(p, 186, 168, 66, 22)) return this.key('b'); for (let s = 0; s < 2; s++) for (let k = 0; k < 6; k++) if (inR(p, 6 + s * 126, 36 + k * 21, 118, 20)) { const i = k + (s === this.side ? this.scroll : 0); if (s === this.side && i === this.sel) return this.moveSel(); this.side = s; this.sel = Math.min(i, Math.max(0, this.list(s).length - 1)); } }
  moveSel() {
    const G = this.G, P = G.st.party, B = G.st.box;
    if (this.side === 0) {
      if (P.length <= 1) return G.run(() => G.say('Tu dois garder au moins une créature avec toi !'));
      const m = P[this.sel]; if (!m) return;
      if (P.filter((x) => x.hp > 0 && x !== m).length === 0) return G.run(() => G.say('Tu dois garder au moins une créature en forme !'));
      P.splice(this.sel, 1); healMon(m); B.push(m); this.sel = Math.max(0, Math.min(this.sel, P.length - 1));
    } else {
      if (P.length >= 6) return G.run(() => G.say('Ton équipe est déjà complète.'));
      const m = B[this.sel]; if (!m) return;
      B.splice(this.sel, 1); P.push(m); this.sel = Math.max(0, Math.min(this.sel, B.length - 1));
    }
    audio.sfx('select');
  }
}

// ===================================================================== oublier une capacité
export class LearnPanel {
  constructor(G, mon, moveId) { this.G = G; this.mon = mon; this.moveId = moveId; this.sel = 0; }
  draw(c, t) {
    subBackground(c, '#f0e4e4', '#e6d4d4', t);
    topBar(c, 'Oublier quelle capacité ?', '#b05a5a');
    const all = this.mon.moves.map((m) => m.id).concat([this.moveId]);
    all.forEach((id, i) => {
      const M = MV(id), x = i < 4 ? 4 + (i % 2) * 126 : 66, y = i < 4 ? 20 + Math.floor(i / 2) * 44 : 110;
      button(c, x, y, 122, 40, TYPES[M.type].color, M.name + (i === 4 ? '\n(nouvelle)' : ''), { sel: i === this.sel });
    });
    button(c, 186, 160, 66, 26, '#8a6a6a', 'Renoncer', { sel: this.sel === 5 });
  }
  drawTop(c) {
    const id = this.sel < 4 ? this.mon.moves[this.sel].id : this.moveId; const M = MV(id);
    frame(c, 4, 104, 248, 84, 'text');
    drawText(c, M.name, 14, 110); typeTag(c, 140, 111, M.type, 40);
    drawText(c, `Puissance : ${M.pow || '-'}   Précision : ${M.acc || '-'}   PP : ${M.pp}`, 14, 128, '#6a7088', null);
    drawText(c, M.cat === 'P' ? 'Physique' : M.cat === 'S' ? 'Spéciale' : 'Statut', 14, 144, '#6a7088', null);
    if (M.desc) drawText(c, M.desc, 14, 160);
  }
  key(k) {
    if (k === 'left' || k === 'up') this.sel = (this.sel + 5) % 6; else if (k === 'right' || k === 'down') this.sel = (this.sel + 1) % 6;
    else if (k === 'a') { audio.sfx('select'); this.G.closePanel(this, this.sel >= 4 ? -1 : this.sel); return; }
    else if (k === 'b') { audio.sfx('back'); this.G.closePanel(this, -1); return; } else return;
    audio.sfx('move');
  }
  click(p) {
    if (inR(p, 186, 160, 66, 26)) { this.sel = 5; return this.key('a'); }
    for (let i = 0; i < 5; i++) { const x = i < 4 ? 4 + (i % 2) * 126 : 66, y = i < 4 ? 20 + Math.floor(i / 2) * 44 : 110; if (inR(p, x, y, 122, 40)) { this.sel = i; return this.key('a'); } }
  }
}

// ===================================================================== choix du premier compagnon
export class StarterPanel {
  constructor(G) { this.G = G; this.ids = ['brindou', 'braisille', 'gouttin']; this.sel = 0; }
  draw(c, t) {
    subBackground(c, '#f4f0e0', '#ebe4cc', t);
    topBar(c, 'Choisis ton compagnon', '#a07a3a');
    this.ids.forEach((id, i) => {
      const S = species(id);
      button(c, 6 + i * 83, 26, 78, 120, TYPES[S.types[0]].color, null, { sel: i === this.sel });
      c.drawImage(spr(id, 'front', 64), 13 + i * 83, 40 + (i === this.sel ? Math.round(Math.sin(t * 6) * 2) : 0));
      drawTextCentered(c, S.name, 45 + i * 83, 112, '#ffffff', '#3a3a3a');
      drawTextCentered(c, TYPES[S.types[0]].name, 45 + i * 83, 126, '#ffffff', '#3a3a3a');
    });
    drawTextCentered(c, '← → puis Espace', 128, 160, '#8a7a5a', null);
  }
  drawTop(c) {
    const S = species(this.ids[this.sel]);
    frame(c, 4, 120, 248, 68, 'gold');
    drawText(c, `${S.name} — type ${TYPES[S.types[0]].name}`, 14, 126, '#6a4a1a', null);
    wrap(S.desc, 228).forEach((l, i) => drawText(c, l, 14, 144 + i * 14));
  }
  key(k) {
    if (k === 'left') this.sel = (this.sel + 2) % 3; else if (k === 'right') this.sel = (this.sel + 1) % 3;
    else if (k === 'a') { audio.sfx('select'); this.G.closePanel(this, this.ids[this.sel]); return; }
    else if (k === 'b') { audio.sfx('back'); this.G.closePanel(this, null); return; } else return;
    audio.sfx('move');
  }
  click(p) { for (let i = 0; i < 3; i++) if (inR(p, 6 + i * 83, 26, 78, 120)) { if (this.sel === i) return this.key('a'); this.sel = i; } }
}

// ===================================================================== saisie du nom (clavier de l'écran du bas)
const KB = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZÉÈÀÇ', 'abcdefghij', 'klmnopqrst', 'uvwxyzéèêï'];
export class NamePanel {
  constructor(G, def) {
    this.G = G; this.name = def || ''; this.r = 0; this.c = 0;
    this.onKey = (e) => {
      if (e.key.length === 1 && /[\p{L}\- ']/u.test(e.key)) { if (this.name.length < 10) this.name += e.key; e.stopImmediatePropagation(); e.preventDefault(); }
      else if (e.key === 'Backspace') { this.name = this.name.slice(0, -1); e.stopImmediatePropagation(); e.preventDefault(); }
      else if (e.key === 'Enter') { e.stopImmediatePropagation(); e.preventDefault(); this.done(); }
    };
    addEventListener('keydown', this.onKey, true);
  }
  done() { if (!this.name.trim()) return; removeEventListener('keydown', this.onKey, true); audio.sfx('select'); this.G.closePanel(this, this.name.trim()); }
  draw(c, t) {
    subBackground(c, '#e8ecf4', '#d8dee8', t);
    topBar(c, 'Ton nom', '#4a6aa8');
    KB.forEach((row, r) => [...row].forEach((ch, k) => {
      const x = 8 + k * 24, y = 22 + r * 22, s = r === this.r && k === this.c;
      rrect(c, x, y, 22, 20, s ? '#ff6a4a' : '#5a6a8a', 3); rrect(c, x + 1, y + 1, 20, 18, s ? '#ffe0d4' : '#ffffff', 2);
      drawTextCentered(c, ch, x + 11, y + 4);
    }));
    button(c, 8, 158, 80, 28, '#8a6a6a', 'Effacer', { sel: this.r === 6 && this.c < 4 });
    button(c, 168, 158, 80, 28, '#4aa060', 'OK', { sel: this.r === 6 && this.c >= 4 });
  }
  drawTop(c) {
    frame(c, 40, 70, 176, 40, 'text');
    drawText(c, 'Nom :', 52, 84, '#6a7088', null);
    drawText(c, this.name + (Math.floor(this.G.t * 2) % 2 ? '_' : ''), 96, 84);
    drawTextCentered(c, 'Tape au clavier ou choisis les lettres', 128, 120, '#ffffff', '#202030');
  }
  key(k) {
    if (k === 'up') this.r = (this.r + 6) % 7; else if (k === 'down') this.r = (this.r + 1) % 7;
    else if (k === 'left') this.c = (this.c + 9) % 10; else if (k === 'right') this.c = (this.c + 1) % 10;
    else if (k === 'a') { if (this.r === 6) { if (this.c < 4) this.name = this.name.slice(0, -1); else this.done(); } else if (this.name.length < 10) this.name += KB[this.r][this.c]; audio.sfx('select'); return; }
    else if (k === 'b') { this.name = this.name.slice(0, -1); return; } else return;
    audio.sfx('move');
  }
  click(p) {
    if (inR(p, 8, 158, 80, 28)) { this.name = this.name.slice(0, -1); return; }
    if (inR(p, 168, 158, 80, 28)) return this.done();
    KB.forEach((row, r) => [...row].forEach((ch, k) => { if (inR(p, 8 + k * 24, 22 + r * 22, 22, 20) && this.name.length < 10) { this.name += ch; audio.sfx('select'); } }));
  }
}
