// odyssee/js/game.js — le jeu : déplacements sur la grille, PNJ, dresseurs, rencontres, capacités de terrain (Coupe,
// Surf, Éclate-Roc, Vol), menus, histoire (les huit arènes et l'archipel des trois frères), sauvegarde
import { T, walkable, isGrassEnc, DIRS, OPP } from './world/tiles.js';
import { createMon, monName, healFull, levelEvolution, itemEvolution, evolve, setUidBase } from './core/mon.js';
import { Battle } from './core/battle.js';
import { ITEMS, itemName, applyItem, canUseOn, useCandy } from './core/items.js';
import { SPECIES } from './data/species.js';
import { MOVES } from './data/moves.js';
import { STARTERS, RIVAL_NAME, BADGES, LEADERS, FIELD } from './world/region.js';
import { BattleView } from './ui/battleView.js';
import { partyScreen, bagScreen, dexScreen, mapScreen, cardScreen, shopScreen, pcScreen, optionsScreen, TYPE_FR } from './ui/screens.js';
import { el, esc, wait } from './ui/ui.js';
import { ASSETS, loadImg } from './assets.js';
import { HPX } from './render/world3d.js';

// v2 : nouvelle région (arènes dans un autre ordre, archipel, créatures originales) — les sauvegardes v1 ne sont pas reprises
const SAVE_KEY = 'odyssee-save-v2';
const WALK = 0.26, RUN = 0.135, SURF = 0.2;
const key = (x, y) => x + ',' + y;
// le rival prend le starter qui a l'avantage sur le tien : Plante → Feu, Feu → Eau, Eau → Plante
const RIVAL_TEAMS = { 1001: [1004, 1005, 1006], 1004: [1007, 1008, 1009], 1007: [1001, 1002, 1003] };
const GYM_HINTS = { bug: 'le Feu, le Vol et la Roche', rock: 'l\'Eau, la Plante, le Combat et le Sol', water: 'l\'Électrik et la Plante', electric: 'le Sol', grass: 'le Feu, la Glace, le Vol, le Poison et l\'Insecte', psychic: 'l\'Insecte et les Ténèbres', fire: 'l\'Eau, la Roche et le Sol', dragon: 'la Glace et le Dragon' };
// capacité de terrain donnée par chaque Champion après sa victoire
const GYM_GIFT = { 3: 'coupe', 4: 'surf', 5: 'eclate', 6: 'vol' };
// portrait affiché à côté de la boîte de dialogue, selon qui parle
const FACES = { 'Prof. Saule': 'saule', [RIVAL_NAME]: 'theo', Hector: 'hector', Marine: 'marine', Volta: 'volta', Flora: 'flora', Sibylle: 'sibylle', Basalte: 'basalte', Pyros: 'pyros', Drakos: 'drakos', Célestine: 'celestine' };

export class Game {
  static SAVE_KEY = SAVE_KEY;
  constructor({ view, ui, input, sound, world }) {
    Object.assign(this, { view, ui, input, sound, world });
    this.busy = false; this.player = null; this.npcs = []; this.items = [];
    this.bv = new BattleView(this);
    input.onFree = (k) => this.onKey(k);
    ui.faceOf = (speaker) => (FACES[speaker] ? ASSETS.portrait(FACES[speaker]) : null);
  }

  /* ================= sauvegarde ================= */
  static hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  newState(name, gender) {
    return {
      v: 2, name, gender, id: Math.floor(Math.random() * 65536), money: 3000, badges: Array(8).fill(false), flags: {},
      party: [], box: [], bag: { potion: 1 }, dex: { seen: [], caught: [] }, time: 0, visited: ['aube'], repel: 0,
      cleared: {}, surf: false,
      lastCenter: { map: 'aube:maison', x: 4, y: 5, dir: 'up' }, ...this.world.start,
    };
  }
  save(silent = false) {
    const s = this.state; const p = this.player;
    s.map = this.mapObj.id; s.x = p.x; s.y = p.y; s.dir = p.dir; s.surf = !!p.surf;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); if (!silent) this.sound.sfx('save'); return true; } catch (e) { return false; }
  }
  load() {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    s.cleared ||= {};
    let maxUid = 0; for (const m of s.party.concat(s.box)) maxUid = Math.max(maxUid, m.uid || 0);
    setUidBase(maxUid + 1);
    return s;
  }

  async start(state) {
    this.state = state;
    this.player = { x: state.x, y: state.y, dir: state.dir || 'down', move: null, step: 0, turnLock: 0, bumpT: 0, surf: !!state.surf };
    this.setMap(state.map);
    this.view.setTimeOfDay(this.hour());
    await this.ui.fade(false, 400);
    if (!state.flags.intro) { state.flags.intro = true; this.busy = true; await this.ui.say(['Une douce lumière filtre à travers les rideaux...', `Aujourd'hui, ${state.name}, ton aventure commence !`, 'Appuie sur H à tout moment pour revoir les touches.']); this.busy = false; }
  }
  hour() { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }

  /* ================= cartes ================= */
  setMap(id) {
    const m = this.world.maps[id] || this.world.maps.monde;
    this.mapObj = m;
    // arbres coupés, rochers brisés : la carte garde la trace de ce qu'on a dégagé
    for (const k of this.state.cleared[m.id] || []) { const [x, y] = k.split(',').map(Number); if (m.get(x, y) === T.CUT || m.get(x, y) === T.SMASH) m.set(x, y, m.outdoor ? T.GRASS : T.CAVE); }
    this.view.setMap(m);
    const st = this.state;
    this.npcs = m.npcs.filter((n) => this.npcVisible(n)).map((n) => ({ def: n, id: n.id, x: n.x, y: n.y, dir: n.dir || 'down', sprite: n.sprite, home: [n.x, n.y], timer: 1 + Math.random() * 3, move: null, step: 0 }));
    // le rival attend au labo tant que le premier combat n'a pas eu lieu
    if (id === 'aube:labo' && !st.flags.rival1) this.npcs.push({ def: { id: 'rival-lab', script: 'rivalLab' }, id: 'rival-lab', x: 8, y: 6, dir: 'left', sprite: 'theo', home: [8, 6], timer: 99, move: null, step: 0 });
    this.items = m.items.filter((it) => !st.flags['I:' + it.id]).map((it) => ({ ...it }));
    for (const it of this.items) { const a = this.view.actor('item:' + it.id, { kind: 'item' }); this.view.place(a, it.x, it.y - 0.15); }
    this.gateBlock = new Set();
    for (const g of m.gates) if (this.badgeCount() < g.badges) for (const [x, y] of g.tiles) this.gateBlock.add(key(x, y));
    this.view.setTimeOfDay(this.hour());
    this.zone = null; this.updateZone();
  }
  npcVisible(n) {
    if (n.gate) return this.badgeCount() < n.gate.badges;
    return true;
  }
  badgeCount() { return this.state.badges.filter(Boolean).length; }
  worldPos() {
    if (this.mapObj.id === 'monde') return { x: this.player.x, y: this.player.y };
    const o = this.mapObj.outside || this.state.lastOutdoor; return o ? { x: o.x, y: o.y } : { x: 0, y: 0 };
  }
  locationName() { const z = this.mapObj.outdoor ? this.mapObj.zoneAt(this.player.x, this.player.y) : null; return z?.name || this.mapObj.name || 'Odyssée'; }

  updateZone() {
    const m = this.mapObj, p = this.player;
    const z = m.outdoor ? m.zoneAt(p.x, p.y) : { name: m.name, music: m.music };
    const name = z?.name || m.name;
    // bandeau du lieu : en extérieur et dans les grottes (pas en sortant d'une maison)
    if ((m.outdoor || m.floor === 'cave') && name !== this.zoneName) { this.zoneName = name; this.ui.banner(name); }
    if (z?.town && !this.state.visited.includes(z.town)) this.state.visited.push(z.town);
    if (!this.musicLock) this.sound.play(p.surf && m.outdoor ? 'route2' : (z && z.music) || m.music);
    this.zone = z;
  }

  async warp(to, sfx = 'door') {
    this.busy = true;
    this.sound.sfx(sfx);
    await this.ui.fade(true, 220);
    if (this.mapObj.id === 'monde' && to.map !== 'monde') this.state.lastOutdoor = { x: this.player.x, y: this.player.y + 1, map: 'monde' };
    this.player.x = to.x; this.player.y = to.y; this.player.dir = to.dir || this.player.dir; this.player.move = null; this.player.surf = false;
    this.setMap(to.map);
    this.view.update(0, this.player.x, this.player.y);
    this.save(true);
    await this.ui.fade(false, 220);
    await this.onEnterMap();
    this.busy = false;
  }
  /** petites scènes à l'entrée d'une carte */
  async onEnterMap() {
    const st = this.state;
    // au labo, le professeur accueille le joueur avant qu'il ne touche aux capsules
    if (this.mapObj.id === 'aube:labo' && !st.flags.metProf) {
      const prof = this.npcs.find((n) => n.id === 'prof');
      await this.playerWalk('up', 2);
      if (prof) prof.dir = 'down';
      await this.script('prof', prof);
    }
  }

  /* ================= boucle ================= */
  tick(dt) {
    const st = this.state; if (!st) return;
    st.time += dt;
    const p = this.player;
    // déplacement du joueur
    if (p.move) {
      p.move.t += dt / p.move.dur;
      if (p.move.t >= 1) { const mv = p.move; p.x = mv.tx; p.y = mv.ty; p.move = null; p.step++; if (mv.land) p.surf = false; if (!mv.scripted) this.onStep(mv); }
    }
    if (p.turnLock > 0) p.turnLock -= dt;
    if (p.bumpT > 0) p.bumpT -= dt;
    if (!p.move && !this.busy && this.input.free) {
      const tap = this.input.takeTap();
      const d = this.input.dir() || tap;
      if (d) {
        if (p.dir !== d && !p.walking) { p.dir = d; p.turnLock = 0.1; }
        else if (p.turnLock <= 0 || (tap && !this.input.dir())) this.tryStep(d);
      } else p.walking = false;
    }
    // PNJ
    for (const n of this.npcs) this.npcTick(n, dt);
    // la carte n'est pas redessinée sous un combat ou un écran plein cadre
    if (this.bv.alive || this.ui.root.querySelector('.screen')) return;
    this.draw(dt);
  }

  draw(dt) {
    const p = this.player, v = this.view;
    let px = p.x, py = p.y, hop = 0, stepFrame = 0;
    if (p.move) {
      const u = Math.min(1, p.move.t);
      px = p.move.fx + (p.move.tx - p.move.fx) * u; py = p.move.fy + (p.move.ty - p.move.fy) * u;
      if (p.move.jump) hop = Math.sin(u * Math.PI) * 0.55;
      stepFrame = p.surf ? 0 : u < 0.5 ? (p.step % 2 ? 1 : 2) : 0;
    } else if (p.bumpT > 0) stepFrame = p.bumpT > 0.15 ? (p.step % 2 ? 1 : 2) : 0;
    const a = v.actor('player', {});
    v.setFrame(a, this.state.gender === 'f' ? 'player_f' : 'player_m', p.dir, stepFrame);
    const t = this.mapObj.get(Math.round(px), Math.round(py));
    // sur l'eau : le joueur flotte sur le dos d'une créature, entouré d'un sillage
    const bob = p.surf ? 0.04 + Math.sin(performance.now() / 260) * 0.03 : 0;
    v.place(a, px, py, hop + bob, (isGrassEnc(t) && !p.move) || p.surf);
    if (p.surf) {
      const w = v.actor('wake', { kind: 'item' }); if (!w.wakeSet) { const r = v.S.rects.wake; v.setSpriteRect(w, r, r.w, r.h); w.wakeSet = true; w.shadow.visible = false; }
      w.mesh.position.set(px + 0.5, 0.01 + bob * 0.3, py + 0.62); w.mesh.rotation.x = -1.1;
    } else if (v.actors.has('wake')) v.removeActor('wake');
    for (const n of this.npcs) {
      let nx = n.x, ny = n.y, sf = 0;
      if (n.move) { const u = Math.min(1, n.move.t); nx = n.move.fx + (n.x - n.move.fx) * u; ny = n.move.fy + (n.y - n.move.fy) * u; sf = u < 0.5 ? (n.step % 2 ? 1 : 2) : 0; }
      const na = v.actor('npc:' + n.id, {});
      v.setFrame(na, n.sprite, n.dir, sf); v.place(na, nx, ny, 0, isGrassEnc(this.mapObj.get(n.x, n.y)) && !n.move);
      if (n.bang) { const b = v.actor('bang:' + n.id, { kind: 'bang' }); b.mesh.position.set(nx + 0.5, 34 * HPX, ny + 0.56); }
      else if (v.actors.has('bang:' + n.id)) v.removeActor('bang:' + n.id);
    }
    v.update(dt, px, py);
    v.render();
  }

  occupied(x, y, except) {
    if (this.player && this.player.x === x && this.player.y === y && except !== this.player) return true;
    for (const n of this.npcs) if (n !== except && ((n.x === x && n.y === y) || (n.move && n.move.fx === x && n.move.fy === y))) return true;
    for (const it of this.items) if (it.x === x && it.y === y) return true;
    return this.gateBlock.has(key(x, y));
  }

  tryStep(d) {
    const p = this.player, m = this.mapObj, [dx, dy] = DIRS[d];
    p.dir = d;
    const tx = p.x + dx, ty = p.y + dy, t = m.get(tx, ty);
    // sortie par le tapis
    if (m.get(p.x, p.y) === T.MAT && d === 'down') { const w = m.warpAt(p.x, p.y); if (w) { this.warp(w, 'exit'); return; } }
    const run = this.input.isDown('run');
    // en surf : on glisse sur l'eau, et on descend sur la berge
    if (p.surf) {
      if (m.in(tx, ty) && t === T.WATER && !this.occupied(tx, ty)) { p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: SURF }; p.walking = true; return; }
      if (m.in(tx, ty) && walkable(t) && t !== T.DOOR && !this.occupied(tx, ty)) { p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: 0.3, jump: true, land: true }; p.walking = true; this.sound.sfx('ledge'); return; }
      p.walking = false; if (p.bumpT <= 0) { this.sound.sfx('bump'); p.bumpT = 0.3; } return;
    }
    // rebords
    if ((t === T.LEDGE && d === 'down') || (t === T.LEDGE_E && d === 'right') || (t === T.LEDGE_W && d === 'left')) {
      const lx = tx + dx, ly = ty + dy;
      if (walkable(m.get(lx, ly)) && !this.occupied(lx, ly)) { p.move = { fx: p.x, fy: p.y, tx: lx, ty: ly, t: 0, dur: 0.42, jump: true }; p.walking = true; this.sound.sfx('ledge'); return; }
    }
    if (m.in(tx, ty) && walkable(t) && !this.occupied(tx, ty) && m.height(tx, ty) === m.height(p.x, p.y)) {
      p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: run ? RUN : WALK }; p.walking = true;
      return;
    }
    if (this.gateBlock.has(key(tx, ty))) { const g = m.gates.find((q) => q.tiles.some(([x, y]) => x === tx && y === ty)); if (g) { const n = this.npcs.find((q) => q.id === g.npc); if (n) { this.talk(n); return; } } }
    // bute contre l'obstacle
    p.walking = false;
    if (p.bumpT <= 0) { this.sound.sfx('bump'); p.bumpT = 0.3; }
  }

  async onStep(mv) {
    const p = this.player, m = this.mapObj, t = m.get(p.x, p.y);
    if (mv.jump) this.view.shake = 0.06;
    if (isGrassEnc(t)) this.view.rustle(p.x, p.y);
    const w = m.warpAt(p.x, p.y);
    if (w && (t === T.DOOR || t === T.CAVEDOOR)) { await this.warp(w, t === T.CAVEDOOR ? 'exit' : 'door'); return; }
    this.updateZone();
    if (this.state.repel > 0) { this.state.repel--; if (this.state.repel === 0) { this.busy = true; await this.ui.say('L\'effet du Repousse s\'est dissipé...'); this.busy = false; } }
    const z = this.zone;
    // Cap des Étoiles : Odyssor
    if (m.objectAt(p.x, p.y)?.type === 'odyssor') { if (await this.odyssorEvent()) return; }
    if (z?.trigger && await this.trigger(z.trigger)) return;
    if (await this.checkTrainers()) return;
    // rencontres sauvages : hautes herbes, grottes, et la mer de l'archipel quand on surfe
    const enc = m.outdoor ? z?.enc : m.encounter;
    if (p.surf && t === T.WATER) { const sea = m.zoneAt(p.x, p.y); if (sea?.enc && Math.random() < 0.05) await this.wildBattle(sea.enc); return; }
    if (enc && (isGrassEnc(t) || (!m.outdoor && t === T.CAVE))) {
      const rate = isGrassEnc(t) ? (t === T.DARKTALL ? 0.12 : 0.1) : 0.065;
      if (Math.random() < rate) await this.wildBattle(enc);
    }
  }

  /* ================= PNJ ================= */
  npcTick(n, dt) {
    if (n.move) { if (n.move.scripted) return; n.move.t += dt / n.move.dur; if (n.move.t >= 1) { n.move = null; n.step++; } return; }
    if (this.busy || n.def.trainer || n.frozen) return;
    if (n.def.move !== 'wander' && n.def.move !== 'turn') return;
    n.timer -= dt; if (n.timer > 0) return;
    n.timer = 1.5 + Math.random() * 3;
    const dirs = ['up', 'down', 'left', 'right'], d = dirs[Math.floor(Math.random() * 4)];
    n.dir = d;
    if (n.def.move === 'wander' && Math.random() < 0.6) {
      const [dx, dy] = DIRS[d], tx = n.x + dx, ty = n.y + dy;
      if (Math.abs(tx - n.home[0]) <= 2 && Math.abs(ty - n.home[1]) <= 2 && walkable(this.mapObj.get(tx, ty)) && !this.occupied(tx, ty, n) && this.mapObj.get(tx, ty) !== T.DOOR && this.mapObj.get(tx, ty) !== T.MAT) {
        n.move = { fx: n.x, fy: n.y, t: 0, dur: 0.32 }; n.x = tx; n.y = ty;
      }
    }
  }
  /** marche scriptée d'un PNJ (avance elle-même, même si le PNJ n'est plus sur la carte) */
  npcWalk(n, d, steps) {
    return new Promise(async (res) => {
      for (let i = 0; i < steps; i++) {
        const [dx, dy] = DIRS[d]; n.dir = d;
        const mv = { fx: n.x, fy: n.y, t: 0, dur: 0.26, scripted: true }; n.move = mv; n.x += dx; n.y += dy;
        const t0 = performance.now();
        while (mv.t < 1) { await wait(16); mv.t = (performance.now() - t0) / (mv.dur * 1000); }
        n.move = null; n.step++;
      }
      res();
    });
  }
  /** marche scriptée du joueur ; s'arrête devant un obstacle */
  playerWalk(d, steps) {
    return new Promise(async (res) => {
      const p = this.player, m = this.mapObj;
      for (let i = 0; i < steps; i++) {
        const [dx, dy] = DIRS[d]; p.dir = d;
        if (!walkable(m.get(p.x + dx, p.y + dy)) || this.occupied(p.x + dx, p.y + dy)) break;
        p.move = { fx: p.x, fy: p.y, tx: p.x + dx, ty: p.y + dy, t: 0, dur: WALK, scripted: true }; while (p.move) await wait(16);
      }
      res();
    });
  }

  /* ================= touches ================= */
  async onKey(k) {
    if (this.busy || !this.state || this.player.move) return;
    if (k === 'a') await this.interact();
    else if (k === 'b' || k === 'menu') await this.startMenu();
    else if (k === 'map') { this.busy = true; await mapScreen(this); this.busy = false; }
  }
  async interact() {
    const p = this.player, m = this.mapObj, [dx, dy] = DIRS[p.dir];
    let fx = p.x + dx, fy = p.y + dy;
    let n = this.npcs.find((q) => q.x === fx && q.y === fy && !q.move);
    if (!n && m.get(fx, fy) === T.BLOCK && this.view.decoAt.get(key(fx, fy))?.k === 'counter') n = this.npcs.find((q) => q.x === fx + dx && q.y === fy + dy);
    this.busy = true;
    try {
      if (n) await this.talk(n);
      else if (m.get(fx, fy) === T.SIGN) await this.ui.say(m.signs.get(key(fx, fy)) || '...');
      else {
        const it = this.items.find((q) => q.x === fx && q.y === fy);
        const o = m.objectAt(fx, fy), t = m.get(fx, fy);
        if (it) await this.pickItem(it);
        else if (o?.type === 'pc') await pcScreen(this);
        else if (o?.type === 'starter') await this.chooseStarter(o.sp);
        else if (t === T.CUT) await this.fieldObstacle('coupe', fx, fy, 'Ce petit arbre pourrait être coupé.');
        else if (t === T.SMASH) await this.fieldObstacle('eclate', fx, fy, 'Ce rocher est plein de fissures. Il pourrait être brisé.');
        else if (t === T.WATER && m.outdoor && !p.surf) await this.trySurf(fx, fy);
      }
    } finally { this.busy = false; }
  }
  async talk(n) {
    const was = this.busy; this.busy = true;
    n.dir = OPP[this.player.dir];
    const d = n.def, st = this.state;
    try {
      if (d.trainer) { if (!st.flags['T:' + n.id]) await this.trainerBattle(n, false); else await this.ui.say(d.trainer.after || 'Quel combat !', { speaker: d.trainer.name }); }
      else if (d.role === 'nurse') await this.nurse();
      else if (d.role === 'shop') await shopScreen(this, d.stock);
      else if (d.script) await this.script(d.script, n);
      else if (d.text) await this.ui.say(d.text);
    } finally { this.busy = was; }
  }
  async pickItem(it) {
    this.sound.sfx('item');
    this.state.bag[it.item] = (this.state.bag[it.item] || 0) + it.qty;
    this.state.flags['I:' + it.id] = true;
    this.items = this.items.filter((q) => q !== it); this.view.removeActor('item:' + it.id);
    await this.ui.say(`${this.state.name} trouve ${it.qty > 1 ? it.qty + ' × ' : ''}${itemName(it.item)} !\nVous rangez l'objet dans le Sac.`);
  }

  /* ================= capacités de terrain ================= */
  hasField(k) { return !!this.state.bag['cs-' + k]; }
  canField(k) { return this.hasField(k) && this.badgeCount() >= FIELD[k].badge; }
  /** la créature de l'équipe qui utilise la capacité (la première en forme) */
  fieldUser() { return this.state.party.find((m) => m.hp > 0) || this.state.party[0]; }
  async fieldObstacle(k, x, y, look) {
    const F = FIELD[k], st = this.state;
    if (!this.hasField(k)) { await this.ui.say(look); return; }
    if (!this.canField(k)) { await this.ui.say([look, `Il faut le ${BADGES[F.badge - 1].name} pour utiliser ${F.name} hors combat.`]); return; }
    if (!(await this.ui.yesNo(`${look}\nUtiliser ${F.name} ?`))) return;
    const mon = this.fieldUser();
    this.sound.cry(ASSETS.cry(mon.sp));
    await this.ui.say(`${monName(mon)} utilise ${F.name} !`, { auto: 500 });
    this.sound.sfx(k === 'coupe' ? 'hitweak' : 'hitstrong'); await this.ui.flash(1, '#ffffff', 60);
    const m = this.mapObj;
    m.set(x, y, m.outdoor ? T.GRASS : T.CAVE);
    (st.cleared[m.id] ||= []).push(key(x, y));
    this.view.rebuildAt(x, y);
    this.view.update(0, this.player.x, this.player.y);
  }
  async trySurf(x, y) {
    const st = this.state;
    if (!this.canField('surf')) { await this.ui.say(this.hasField('surf') ? ['L\'eau est d\'un bleu profond...', 'Il faut le Badge Mirage pour surfer.'] : 'L\'eau est d\'un bleu profond...'); return; }
    if (!st.party.some((m) => m.hp > 0)) return;
    if (!(await this.ui.yesNo('L\'eau est d\'un bleu profond...\nUtiliser Surf ?'))) return;
    const mon = this.fieldUser();
    this.sound.cry(ASSETS.cry(mon.sp));
    await this.ui.say(`${st.name} monte sur le dos de ${monName(mon)} !`, { auto: 500 });
    const p = this.player;
    p.surf = true; p.move = { fx: p.x, fy: p.y, tx: x, ty: y, t: 0, dur: 0.3, jump: true, scripted: true };
    while (p.move) await wait(16);
    this.updateZone();
  }
  /** Vol : retour dans une ville déjà visitée (devant son Centre de soins) */
  async fly() {
    const towns = Object.values(this.world.towns).filter((t) => this.state.visited.includes(t.id) && (t.centerDoor || t.homeDoor));
    const k = await this.ui.list({ title: 'Voler vers...', items: towns.map((t) => ({ label: t.name })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: towns.length });
    if (k < 0 || k >= towns.length) return false;
    const t = towns[k], mon = this.fieldUser();
    this.sound.cry(ASSETS.cry(mon.sp));
    await this.ui.say(`${monName(mon)} utilise Vol !`, { auto: 500 });
    const [x, y] = t.centerDoor || t.homeDoor;
    await this.warp({ map: 'monde', x, y, dir: 'down' }, 'exit');
    return true;
  }

  /* ================= menu principal ================= */
  async startMenu() {
    this.busy = true;
    const st = this.state;
    const opts = [];
    if (st.flags.dex) opts.push(['POKéDEX', 'dex']);
    if (st.party.length) opts.push(['ÉQUIPE', 'party']);
    opts.push(['SAC', 'bag']);
    if (this.canField('vol')) opts.push(['VOL', 'fly']);
    opts.push([st.name.toUpperCase(), 'card'], ['CARTE', 'map'], ['SAUVER', 'save'], ['OPTIONS', 'opt'], ['FERMER', 'close']);
    let idx = Math.min(this._menuIdx || 0, opts.length - 1);
    for (;;) {
      const r = await this.ui.list({ items: opts.map(([l]) => ({ label: l })), cls: 'startmenu', cancel: -1, start: idx, onMove: (i) => { this._menuIdx = i; } });
      if (r < 0 || opts[r][1] === 'close') break;
      idx = r;
      const k = opts[r][1];
      if (k === 'dex') await dexScreen(this);
      else if (k === 'party') await partyScreen(this, { mode: 'menu' });
      else if (k === 'bag') { if (await this.fieldBag()) break; }
      else if (k === 'fly') { if (this.player.surf || !this.mapObj.outdoor) { await this.ui.say('On ne peut pas s\'envoler d\'ici.'); continue; } if (await this.fly()) break; }
      else if (k === 'card') await cardScreen(this, BADGES);
      else if (k === 'map') await mapScreen(this);
      else if (k === 'opt') await optionsScreen(this);
      else if (k === 'save') { if (await this.ui.yesNo('Sauvegarder la partie ?')) { this.save(); await this.ui.say(`${st.name} a sauvegardé la partie.`); } break; }
    }
    this.busy = false;
  }
  /** sac hors combat ; renvoie true si l'objet utilisé ferme le menu (Corde Sortie, Vol…) */
  async fieldBag() {
    for (;;) {
      const r = await bagScreen(this, {}); if (!r) return false;
      const it = ITEMS[r.item], st = this.state;
      if (it.ball) { await this.ui.say('Ce n\'est pas le moment d\'utiliser ça !'); continue; }
      if (r.item === 'town-map') { await mapScreen(this); continue; }
      if (it.field) {
        if (it.field === 'vol' && this.canField('vol') && this.mapObj.outdoor && !this.player.surf) { if (await this.fly()) return true; continue; }
        await this.ui.say([`${FIELD[it.field].name} : ${FIELD[it.field].desc}`, this.canField(it.field) ? 'Place-toi face à l\'obstacle et appuie sur F pour l\'utiliser.' : `Il faut le ${BADGES[FIELD[it.field].badge - 1].name} pour l'utiliser hors combat.`]);
        continue;
      }
      if (it.repel) { st.repel = it.repel; this.take(r.item); this.sound.sfx('item'); await this.ui.say(`${st.name} utilise ${itemName(r.item)}.\nLes créatures sauvages faibles fuiront pendant ${it.repel} pas.`); return true; }
      if (r.item === 'escape-rope') {
        if (this.mapObj.floor === 'cave' && st.lastOutdoor) { this.take(r.item); await this.ui.say(`${st.name} utilise la Corde Sortie !`); await this.warp({ map: 'monde', x: st.lastOutdoor.x, y: st.lastOutdoor.y, dir: 'down' }, 'exit'); return true; }
        await this.ui.say('Ce n\'est pas le moment d\'utiliser ça !'); continue;
      }
      if (!st.party.length) { await this.ui.say('Tu n\'as encore aucune créature.'); continue; }
      const target = await partyScreen(this, { mode: 'pick', prompt: `Utiliser ${itemName(r.item)} sur quelle créature ?`, filter: (m) => (canUseOn(r.item, m) ? null : 'Pas d\'effet') });
      if (target < 0) continue;
      const m = st.party[target];
      if (it.stone) { this.take(r.item); await this.evolveScene(m, itemEvolution(m, r.item)); return true; }
      if (it.candy) {
        this.take(r.item); const steps = useCandy(m); this.sound.sfx('levelup');
        await this.ui.say(`${monName(m)} monte au niveau ${m.lvl} !`);
        for (const s of steps) { for (const id of s.learned) await this.ui.say(`${monName(m)} apprend ${MOVES[id].n} !`); for (const id of s.ask) await this.askLearn(m, id); }
        const to = levelEvolution(m); if (to) await this.evolveScene(m, to);
        continue;
      }
      let moveIdx = -1;
      if (it.pp) { moveIdx = await this.ui.list({ title: 'Quelle attaque ?', items: m.moves.map((x) => ({ label: MOVES[x.id].n, right: `${x.pp}/${MOVES[x.id].pp}` })), cls: 'psub', cancel: -1 }); if (moveIdx < 0) continue; }
      const msg = applyItem(r.item, m, moveIdx);
      if (msg) { this.take(r.item); this.sound.sfx('heal'); await this.ui.say(msg); }
    }
  }
  take(item, n = 1) { const b = this.state.bag; b[item] = (b[item] || 0) - n; if (b[item] <= 0) delete b[item]; }
  give(item, n = 1) { this.state.bag[item] = (this.state.bag[item] || 0) + n; }

  /* ================= combats ================= */
  markSeen(sp) { if (!this.state.dex.seen.includes(sp)) this.state.dex.seen.push(sp); }
  markCaught(sp) { this.markSeen(sp); if (!this.state.dex.caught.includes(sp)) this.state.dex.caught.push(sp); }
  lead() { return this.state.party.find((m) => m.hp > 0); }

  async encounterIntro(kind) {
    this.sound.sfx('encounter');
    this.sound.play(kind);
    await this.ui.flash(3, '#ffffff', 70);
    // rideau qui se referme, comme un passage en combat
    const c = el('div', 'wipe'); this.ui.root.appendChild(c);
    await wait(30); c.classList.add('on'); await wait(450);
    return c;
  }

  async wildBattle(enc, o = {}) {
    let e = enc[0];
    if (!o.fixed) { const tot = enc.reduce((a, x) => a + x[3], 0); let r = Math.random() * tot; for (const x of enc) { r -= x[3]; if (r <= 0) { e = x; break; } } }
    const lvl = e[1] + Math.floor(Math.random() * (e[2] - e[1] + 1));
    const lead = this.lead(); if (!lead) return;
    if (!o.fixed && this.state.repel > 0 && lead.lvl >= lvl) return;
    this.busy = true;
    const wild = createMon(e[0], lvl, { met: this.locationName() });
    const res = await this.runBattle({ wild, music: o.music });
    this.busy = false;
    return res;
  }

  async trainerBattle(n, spotted) {
    const d = n.def, tr = d.trainer, st = this.state;
    this.busy = true;
    const music = d.leader != null ? 'leader' : d.champion ? 'champion' : d.rival ? 'rival' : 'trainer';
    if (spotted) {
      this.musicLock = true; this.sound.play(music === 'trainer' ? 'trainer' : music);
      n.bang = true; this.sound.sfx('bang'); await wait(650); n.bang = false;
      // le dresseur s'approche
      const p = this.player;
      const steps = Math.abs(p.x - n.x) + Math.abs(p.y - n.y) - 1;
      if (steps > 0) await this.npcWalk(n, n.dir, steps);
      p.dir = OPP[n.dir];
    }
    this.musicLock = true; this.sound.play(music);
    await this.ui.say(tr.intro, { speaker: tr.name });
    const party = tr.team.map(([sp, lvl]) => createMon(sp, lvl, { iv: Array(6).fill(Math.min(31, 8 + lvl / 2 | 0)), shiny: false }));
    const res = await this.runBattle({ trainer: { ...tr, items: { ...(tr.items || {}) } }, party, music, id: n.id, leader: d.leader, champion: d.champion, rival: d.rival });
    this.musicLock = false;
    if (res === 'win') {
      st.flags['T:' + n.id] = true;
      if (d.leader != null) await this.badgeScene(d.leader, tr.name);
      if (d.champion) await this.ending();
    }
    this.updateZone();
    this.busy = false;
    return res;
  }
  async badgeScene(g, name) {
    const st = this.state, ui = this.ui;
    st.badges[g] = true;
    this.sound.sfx('badge');
    await ui.say(`${st.name} reçoit le ${BADGES[g].name} de la part de ${name} !`);
    const lines = {
      0: ['Avec ce badge, tu prouves ta valeur de dresseur.', 'Le garde au nord de la ville te laissera passer vers le Bois Murmure.'],
      1: ['La route 4, à l\'est, t\'est désormais ouverte.', 'Voltacité t\'attend au bout de la côte.'],
      2: ['Le garde de la route 5 te laissera passer.', 'Floralia et sa Championne sont au sud-ouest.'],
      3: ['Et prends aussi ceci : la CS01, Coupe !', 'Avec mon badge, tu peux trancher les petits arbres qui barrent la route de Mirage, à l\'est.'],
      4: ['J\'ai vu ton avenir : il est sur la mer. Prends la CS02, Surf.', 'Au sud, le Cap Mirage fait face aux îles des trois frères.', 'Méfie-toi de Drakos. Il a autrefois défié Célestine... et ne s\'en est jamais remis.'],
      5: ['Tiens, la CS03 : Éclate-Roc. Elle brise les rochers fissurés.', 'Tu en auras besoin sur la Grande Île.', 'Drakos est notre frère aîné. Il a perdu la finale de la Ligue contre Célestine, il y a dix ans.', 'Depuis, il a juré qu\'aucun Maître ne dicterait sa loi aux îles. Pyros et moi... nous l\'avons suivi.'],
      6: ['Prends la CS04 : Vol. Elle te ramènera chez toi en un instant.', 'Drakos t\'attend à Fort-Écaille, sur la Grande Île, à l\'ouest.', 'Mon frère a besoin qu\'on le batte. Peut-être qu\'il ouvrira enfin les yeux.'],
      7: ['...Tu te bats comme Célestine. Avec tes créatures, pas contre elles.', 'Les îles resteront libres. Mais j\'arrête de prélever les pêches et de fermer les ports.', 'Va à la Ligue. Et dis à Célestine que le vieux Drakos attend sa revanche.', 'Ah, et le Cap des Étoiles, au nord de la ville, t\'est ouvert. Odyssor y passe parfois...'],
    }[g];
    if (lines) await ui.say(lines, { speaker: name });
    const gift = GYM_GIFT[g];
    if (gift && !this.hasField(gift)) {
      this.give('cs-' + gift); this.sound.sfx('item');
      await ui.say(`${st.name} reçoit la ${FIELD[gift].cs} ${FIELD[gift].name} !\nElle est rangée dans les Objets rares du Sac.`);
    }
    if (g === 7) { st.flags.drakos = true; this.give('town-map'); }
    this.refreshGates();
  }
  refreshGates() {
    // les gardes s'écartent quand on a assez de badges
    const m = this.mapObj;
    this.gateBlock = new Set();
    for (const g of m.gates) if (this.badgeCount() < g.badges) for (const [x, y] of g.tiles) this.gateBlock.add(key(x, y));
    this.npcs = this.npcs.filter((n) => { if (n.def.gate && this.badgeCount() >= n.def.gate.badges) { this.view.removeActor('npc:' + n.id); return false; } return true; });
  }

  async checkTrainers() {
    const p = this.player, m = this.mapObj;
    for (const n of this.npcs) {
      const tr = n.def.trainer; if (!tr || !tr.sight || this.state.flags['T:' + n.id]) continue;
      const [dx, dy] = DIRS[n.dir];
      for (let k = 1; k <= tr.sight; k++) {
        const x = n.x + dx * k, y = n.y + dy * k;
        if (x === p.x && y === p.y) { await this.trainerBattle(n, true); return true; }
        if (!walkable(m.get(x, y)) || this.npcs.some((q) => q !== n && q.x === x && q.y === y)) break;
      }
    }
    return false;
  }

  /** combat générique ; o.wild (créature) ou o.trainer + o.party */
  async runBattle(o) {
    const st = this.state;
    const kind = o.wild ? o.music || 'wild' : o.music || 'trainer';
    const curtain = await this.encounterIntro(kind);
    const m = this.mapObj, z = this.zone;
    const bg = !m.outdoor ? (m.floor === 'cave' ? 'cave' : m.battleBg) : this.player.surf ? 'water' : z?.theme === 'volcanic' ? 'volcanic' : z?.town === 'azur' || z?.town === 'granit' || z?.name === 'Cap des Étoiles' ? 'water' : 'grass';
    const battle = new Battle({ player: { name: st.name, party: st.party, bag: st.bag }, foe: o.wild ? { name: 'sauvage', party: [o.wild] } : { name: o.trainer.name, party: o.party, trainer: o.trainer } });
    const foeMons = o.wild ? [o.wild] : o.party;
    const h = this.hour();
    curtain.remove();
    const result = await this.bv.run(battle, { bg, night: m.outdoor && (h >= 20 || h < 5.5) });
    // argent
    if (result === 'win' && battle.prizeMoney) st.money += battle.prizeMoney;
    if (result === 'caught') {
      const mon = foeMons[0]; mon.ot = st.name; mon.met = this.locationName();
      const isNew = !st.dex.caught.includes(mon.sp);
      this.markCaught(mon.sp);
      if (isNew) await this.bv.msg(`Les données de ${SPECIES[mon.sp].n} ont été ajoutées au Pokédex !`, { wait: true });
      this.bv.close();
      if (await this.ui.yesNo(`Donner un surnom à ${SPECIES[mon.sp].n} ?`)) { const nick = await this.ui.nameEntry(`Surnom de ${SPECIES[mon.sp].n}`, SPECIES[mon.sp].n); if (nick && nick !== SPECIES[mon.sp].n) mon.nick = nick; }
      mon.status = mon.status === 'frz' ? null : mon.status;
      if (st.party.length < 6) st.party.push(mon);
      else { st.box.push(mon); await this.ui.say(`${monName(mon)} a été envoyé dans le PC.`); }
    } else this.bv.close();
    this.sound.stopMusic(0.1);
    // évolutions après le combat
    if (result !== 'lose') for (const mon of st.party) if (battle.levelUps.has(mon.uid) && mon.hp > 0) { const to = levelEvolution(mon); if (to) await this.evolveScene(mon, to); }
    if (result === 'lose' && o.noWhiteout) for (const mon of st.party) healFull(mon);
    else if (result === 'lose') await this.whiteout();
    this.sound.current = null;
    this.updateZone();
    return result;
  }

  async whiteout() {
    const st = this.state;
    const lost = Math.min(st.money, Math.floor(st.money / 2));
    st.money -= lost;
    await this.ui.fade(true, 400);
    for (const m of st.party) healFull(m);
    const c = st.lastCenter;
    this.player.x = c.x; this.player.y = c.y; this.player.dir = c.dir || 'up'; this.player.surf = false;
    this.setMap(c.map);
    this.view.update(0, this.player.x, this.player.y); this.view.render();
    await this.ui.fade(false, 400);
    await this.ui.say([`${st.name} a perdu ${lost.toLocaleString('fr-FR')} ₽ dans la panique...`, '... ... ...', `${st.name} reprend ses esprits. Ses créatures ont été soignées.`]);
  }

  async askLearn(m, moveId) {
    const mv = MOVES[moveId], name = monName(m);
    for (;;) {
      await this.ui.say([`${name} veut apprendre ${mv.n}.`, `Mais ${name} connaît déjà quatre attaques.`], { keep: true });
      if (await this.ui.yesNo(`Oublier une attaque pour apprendre ${mv.n} ?`, { keep: true })) {
        const k = await this.ui.list({ title: 'Oublier quelle attaque ?', items: m.moves.map((x) => ({ label: MOVES[x.id].n, right: `PP ${x.pp}/${MOVES[x.id].pp}` })).concat([{ label: mv.n + ' (nouvelle)' }]), cls: 'psub learn', cancel: 4 });
        if (k >= 0 && k < 4) {
          const old = MOVES[m.moves[k].id].n;
          m.moves[k] = { id: moveId, pp: mv.pp };
          this.sound.sfx('learn');
          await this.ui.say(['1, 2 et... Tadaaa !', `${name} oublie ${old}...`, `Et ${name} apprend ${mv.n} !`]);
          return;
        }
      }
      if (await this.ui.yesNo(`Abandonner l'apprentissage de ${mv.n} ?`, { keep: true })) { await this.ui.say(`${name} n'a pas appris ${mv.n}.`); return; }
    }
  }

  async evolveScene(m, to) {
    if (!to) return;
    const ui = this.ui, oldName = monName(m), fromSp = m.sp;
    const s = el('div', 'screen evo-scr'); s.innerHTML = '<canvas class="evo-cv" width="256" height="192"></canvas>'; ui.root.appendChild(s);
    const cv = s.querySelector('canvas'), x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    const [a, b] = await Promise.all([loadImg(ASSETS.front(fromSp, m.shiny)), loadImg(ASSETS.front(to, m.shiny))]);
    const white = (img) => { if (!img) return null; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const q = c.getContext('2d'); q.drawImage(img, 0, 0); q.globalCompositeOperation = 'source-atop'; q.fillStyle = '#fff'; q.fillRect(0, 0, c.width, c.height); return c; };
    const wa = white(a), wb = white(b);
    let mode = 'old', scale = 1, flashA = 0, cancelled = false;
    const drawBg = (t) => { const g = x.createRadialGradient(128, 96, 10, 128, 96, 160); g.addColorStop(0, '#406090'); g.addColorStop(1, '#101830'); x.fillStyle = g; x.fillRect(0, 0, 256, 192); x.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 30; i++) { const ang = i * 0.7 + t * 0.002, r = (t * 0.05 + i * 17) % 140; x.fillRect(128 + Math.cos(ang) * r, 96 + Math.sin(ang) * r * 0.7, 2, 2); } };
    let alive = true; const t0 = performance.now();
    const loop = () => { if (!alive) return; const t = performance.now() - t0; drawBg(t); const img = mode === 'old' ? a : mode === 'new' ? b : mode === 'wa' ? wa : wb; if (img) { const w = 80 * scale * 1.6, h = 80 * scale * 1.6; x.drawImage(img, 128 - w / 2, 120 - h, w, h); } if (flashA > 0) { x.fillStyle = `rgba(255,255,255,${flashA})`; x.fillRect(0, 0, 256, 192); } requestAnimationFrame(loop); };
    loop();
    this.sound.stopMusic(0.2); this.sound.play('evolution');
    await ui.say(`Quoi ? ${oldName} évolue !`, { keep: true });
    this.sound.cry(ASSETS.cry(fromSp));
    const pop = this.input.push((k) => { if (k === 'b') cancelled = true; });
    mode = 'wa'; await wait(500);
    this.sound.sfx('evolve');
    for (let i = 0; i < 14 && !cancelled; i++) { mode = i % 2 ? 'wb' : 'wa'; scale = i % 2 ? 1.05 : 0.95; await wait(Math.max(70, 360 - i * 22)); }
    pop();
    if (cancelled) { mode = 'old'; scale = 1; await ui.say(`Hein ? ${oldName} n'a pas évolué !`); }
    else {
      flashA = 1; mode = 'new'; scale = 1; for (let i = 0; i < 20; i++) { flashA = 1 - i / 20; await wait(30); } flashA = 0;
      const res = evolve(m, to); this.markCaught(to);
      this.sound.cry(ASSETS.cry(to)); this.sound.sfx('levelup');
      await ui.say(`Félicitations ! Votre ${oldName} a évolué en ${SPECIES[to].n} !`);
      for (const id of res.learned) await ui.say(`${monName(m)} apprend ${MOVES[id].n} !`);
      for (const id of res.ask) await this.askLearn(m, id);
    }
    alive = false; s.remove(); this.sound.current = null; this.updateZone();
  }

  async nurse() {
    const ui = this.ui, st = this.state;
    await ui.say('Bienvenue au Centre de soins !', { keep: true, speaker: 'Infirmière' });
    if (await ui.yesNo('Voulez-vous que je soigne vos créatures ?', { keep: true, speaker: 'Infirmière' })) {
      await ui.say('Très bien. Confiez-les-moi quelques instants.', { keep: true, speaker: 'Infirmière' });
      this.sound.sfx('heal'); await wait(2400);
      for (const m of st.party) healFull(m);
      st.lastCenter = { map: this.mapObj.id, x: 6, y: 5, dir: 'up' };
      await ui.say(['Merci d\'avoir attendu.', 'Vos créatures sont en pleine forme !'], { keep: true, speaker: 'Infirmière' });
    }
    await ui.say('À bientôt !', { speaker: 'Infirmière' });
  }

  /* ================= histoire ================= */
  async script(name, n) {
    const st = this.state, ui = this.ui;
    if (name === 'mom') {
      if (!st.flags.starter) { await ui.say([`Ah, ${st.name}, tu es enfin réveillé${st.gender === 'f' ? 'e' : ''} !`, 'Le Professeur Saule est passé ce matin. Il t\'attend à son laboratoire, juste au sud-est.', 'Théo y est déjà, bien sûr... Allez, file !'], { speaker: 'Maman' }); return; }
      await ui.say(`${st.name} ! Tu as l'air épuisé${st.gender === 'f' ? 'e' : ''}. Repose-toi un peu.`, { keep: true, speaker: 'Maman' });
      this.sound.sfx('heal'); await wait(2000);
      for (const m of st.party) healFull(m);
      st.lastCenter = { map: 'aube:maison', x: 4, y: 5, dir: 'up' };
      await ui.say(['Voilà, tes créatures sont en pleine forme !', 'Je suis fière de toi. Reviens quand tu veux !'], { speaker: 'Maman' });
    } else if (name === 'rivalMom') {
      await ui.say(st.badges[7] ? ['Théo m\'a appelée : il paraît que tu as battu Drakos !', 'Il en parle comme si c\'était lui qui avait gagné, ha ha.'] : ['Théo est parti au labo dès l\'aube.', 'Il ne tient pas en place, celui-là !'], { speaker: 'Mère de Théo' });
    } else if (name === 'prof') {
      if (!st.flags.metProf) {
        st.flags.metProf = true;
        await ui.say([`Ah, ${st.name} ! Te voilà enfin.`, 'J\'étudie les créatures d\'Odyssée depuis trente ans. Et aujourd\'hui, j\'ai besoin de jeunes dresseurs pour m\'aider.', 'Sur la table, il y a trois capsules. Dans chacune, une créature qui n\'attend qu\'un partenaire.', 'Capyousse, de type Plante. Mèchelet, de type Feu. Et Narvi, de type Eau.', 'Approche-toi de la table et choisis celle qui te plaît !'], { speaker: 'Prof. Saule' });
        const rival = this.npcs.find((q) => q.id === 'rival-lab');
        if (rival) { rival.dir = 'up'; await ui.say('Hé ! J\'attends depuis ce matin, moi ! Allez, choisis vite, je prendrai après toi.', { speaker: RIVAL_NAME }); rival.dir = 'left'; }
        return;
      }
      if (!st.flags.starter) { await ui.say('Les trois capsules sont sur la table. Approche-toi et choisis !', { speaker: 'Prof. Saule' }); return; }
      await ui.say(['Chaque créature que tu rencontreras remplira ton Pokédex.', 'Les cinq Champions du continent t\'attendent, puis les trois frères de l\'archipel.', 'Et au bout du chemin : la Ligue Céleste !'], { speaker: 'Prof. Saule' });
    } else if (name === 'rivalLab') {
      if (st.flags.starter) { await ui.say('Hé, ne traîne pas !', { speaker: RIVAL_NAME }); return; }
      await ui.say(st.flags.metProf ? ['Vas-y, choisis ! Je prendrai celle qui bat la tienne, évidemment.'] : ['Yo ! Va parler au prof d\'abord, il t\'attend depuis ce matin.'], { speaker: RIVAL_NAME });
    } else if (name === 'gymguide') {
      const L = LEADERS[n.def.gym];
      if (st.badges[n.def.gym]) { await ui.say(['Bravo, champion en devenir !', 'Tu as battu ' + L.name + ' ! Continue comme ça !'], { speaker: 'Guide' }); return; }
      await ui.say(['Yo, futur Maître ! Bienvenue dans l\'Arène.', `${L.name} utilise des créatures de type ${TYPE_FR[L.type]}.`, `Pour en venir à bout, mise sur ${GYM_HINTS[L.type]} !`], { speaker: 'Guide' });
    } else if (name === 'granitDock') {
      if (!st.flags.granitDock) {
        st.flags.granitDock = true;
        await ui.say(['Halte ! Tu accostes sur l\'Île de Granit, territoire de l\'archipel.', 'Ici, ce n\'est pas la Ligue qui fait la loi. C\'est Drakos.', '... Un dresseur avec cinq badges ? Bah. Basalte sera ravi de te remettre à ta place.', 'Passe. Et ne pêche rien sans autorisation !'], { speaker: 'Garde d\'Écaille' });
      } else await ui.say(st.badges[7] ? 'Drakos a levé l\'impôt sur les pêches. Les gens sourient à nouveau, sur le port.' : 'Circule, et pas d\'histoires.', { speaker: 'Garde d\'Écaille' });
    }
  }

  async chooseStarter(sp) {
    const st = this.state, ui = this.ui;
    if (st.flags.starter) { await ui.say('C\'est une capsule vide.'); return; }
    // on n'ouvre pas les capsules du professeur sans lui avoir parlé
    if (!st.flags.metProf) { await ui.say('Il y a une créature dans cette capsule... Mieux vaut d\'abord parler au Professeur Saule.'); return; }
    const S = SPECIES[sp];
    const pic = el('div', 'box starter-pic', `<img src="${ASSETS.front(sp)}" alt="">`); ui.root.appendChild(pic);
    this.sound.cry(ASSETS.cry(sp));
    const ok = await ui.yesNo(`Tu veux ${S.n}, la créature de type ${TYPE_FR[S.t[0]]} ?`, { speaker: 'Prof. Saule' });
    pic.remove();
    if (!ok) return;
    const mon = createMon(sp, 5, { ot: st.name, met: 'Bourg-Aube', shiny: false });
    st.party.push(mon); st.flags.starter = sp; this.markCaught(sp);
    this.sound.sfx('caught');
    await ui.say(`${st.name} reçoit ${S.n} !`);
    if (await ui.yesNo(`Donner un surnom à ${S.n} ?`)) { const nick = await ui.nameEntry(`Surnom de ${S.n}`, S.n); if (nick && nick !== S.n) mon.nick = nick; }
    // le rival choisit la créature qui a l'avantage
    const rs = RIVAL_TEAMS[sp][0];
    st.flags.rivalSp = sp;
    const rival = this.npcs.find((q) => q.id === 'rival-lab');
    if (rival) rival.dir = 'up';
    await ui.say(['Alors je prends celle-là !', `${SPECIES[rs].n} ! Elle a une tête de gagnante, comme moi.`], { speaker: RIVAL_NAME });
    if (rival) rival.dir = 'left';
    await ui.say(['Hé, ' + st.name + ' ! On a nos créatures, alors...', 'On se fait un petit combat ? Allez !'], { speaker: RIVAL_NAME });
    const res = await this.runBattle({ trainer: { cls: 'Rival', name: RIVAL_NAME, prize: 30, bs: 'theo', ai: 'normal', friendly: true, lose: 'Quoi ?! J\'aurais dû choisir l\'autre !' }, party: [createMon(rs, 5, { shiny: false })], music: 'rival', rival: true, noWhiteout: true });
    for (const m of st.party) healFull(m);
    st.flags.rival1 = true;
    await ui.say(res === 'win' ? 'Pfff... Bon, c\'était juste un échauffement !' : 'Ha ha ! Je suis trop fort ! Mais t\'inquiète, tu t\'améliores déjà.', { speaker: RIVAL_NAME });
    await ui.say(['Bien joué, tous les deux ! Vos créatures ont déjà l\'air de vous adorer.', `${st.name}, prends aussi ceci.`], { speaker: 'Prof. Saule' });
    this.sound.sfx('item');
    st.flags.dex = true; st.bag['poke-ball'] = (st.bag['poke-ball'] || 0) + 5; st.bag.potion = (st.bag.potion || 0) + 2; this.give('town-map');
    await ui.say([`${st.name} reçoit le Pokédex, la Carte, 5 capsules et 2 Potions !`, 'Le Pokédex enregistre chaque créature que tu vois ou captures.', 'Quand tes créatures sont fatiguées, reviens voir ta mère ou passe au Centre de soins.', 'La première Arène se trouve à Sylvebourg, au nord. Bonne route !'], { speaker: 'Prof. Saule' });
    await ui.say('Je file ! À plus, ' + st.name + ' !', { speaker: RIVAL_NAME });
    if (rival) { await this.npcWalk(rival, 'down', 2); this.npcs = this.npcs.filter((q) => q !== rival); this.view.removeActor('npc:rival-lab'); }
    this.save(true);
  }

  /** case libre où faire apparaître le rival : jusqu'à 4 cases dans la direction d'où il arrive, chemin dégagé */
  spawnAhead(dir, max = 4) {
    const p = this.player, m = this.mapObj, [dx, dy] = DIRS[dir];
    let best = 0;
    for (let k = 1; k <= max; k++) {
      const x = p.x + dx * k, y = p.y + dy * k;
      if (!m.in(x, y) || !walkable(m.get(x, y)) || this.occupied(x, y)) break;
      best = k;
    }
    return best;
  }

  async trigger(name) {
    const st = this.state, p = this.player, ui = this.ui;
    if (name === 'needStarter' && !st.flags.starter) {
      this.busy = true;
      await ui.say(['Hé ! Attends !', 'Les hautes herbes sont pleines de créatures sauvages. Sans créature à toi, c\'est bien trop dangereux !', 'Va d\'abord voir le Professeur Saule, à son labo.'], { speaker: '???' });
      await this.playerWalk('down', 1);
      this.busy = false; return true;
    }
    const rivalFight = async (flag, team, lvlText, lines, after) => {
      if (st.flags[flag] || !st.flags.rival1 || !st.party.some((m) => m.hp > 0)) return false;
      this.busy = true; st.flags[flag] = true;
      const R = RIVAL_TEAMS[st.flags.rivalSp] || RIVAL_TEAMS[1001];
      // le rival arrive par le haut (ou par le côté si la place manque), jamais à travers un mur
      let dir = 'up', n = this.spawnAhead('up');
      for (const d of ['left', 'right', 'down']) { if (n >= 2) break; const k = this.spawnAhead(d); if (k > n) { n = k; dir = d; } }
      const [dx, dy] = DIRS[dir];
      const rival = { def: { id: 'rival-' + flag }, id: 'rival-' + flag, x: p.x + dx * Math.max(1, n), y: p.y + dy * Math.max(1, n), dir: OPP[dir], sprite: 'theo', home: [0, 0], timer: 99, move: null, step: 0 };
      this.npcs.push(rival);
      this.musicLock = true; this.sound.play('rival');
      p.dir = dir; rival.bang = true; this.sound.sfx('bang'); await wait(500); rival.bang = false;
      if (n > 1) await this.npcWalk(rival, OPP[dir], n - 1);
      rival.dir = OPP[dir];
      await ui.say(lines, { speaker: RIVAL_NAME });
      const party = team(R).map(([s, l]) => createMon(s, l, { iv: Array(6).fill(20), shiny: false }));
      const res = await this.runBattle({ trainer: { cls: 'Rival', name: RIVAL_NAME, prize: 40, bs: 'theo', ai: 'smart', items: { 'super-potion': 1 }, lose: lvlText }, party, music: 'rival', rival: true });
      this.musicLock = false;
      if (res !== 'lose') {
        await ui.say(after, { speaker: RIVAL_NAME });
        // il repart par où il est venu
        if (n > 1) await this.npcWalk(rival, dir, n - 1);
      }
      this.npcs = this.npcs.filter((q) => q !== rival); this.view.removeActor('npc:' + rival.id);
      this.updateZone();
      this.busy = false; return true;
    };
    if (name === 'rival2') return rivalFight('rival2', (R) => [[1010, 11], [1013, 11], [R[0], 13]], 'Grr... Tu as eu de la chance !', [`${st.name} ! Tu as déjà ton premier badge ?`, 'Moi aussi, évidemment. Voyons qui a le plus progressé !'], ['Je vais m\'entraîner dans le Bois Murmure.', 'La prochaine fois, je ne perdrai pas !']);
    if (name === 'rival3') return rivalFight('rival3', (R) => [[1011, 27], [1034, 26], [1021, 26], [R[1], 29]], 'Encore ?! Tes créatures sont devenues sacrément fortes...', ['Tiens, tiens... Le grand voyageur !', 'Floralia, c\'est ma ville porte-bonheur. Prépare-toi !'], ['Flora t\'attend à l\'Arène. Moi, je file vers l\'est.', 'On se retrouvera tout en haut, à la Ligue !']);
    if (name === 'rival4') return rivalFight('rival4', (R) => [[1012, 36], [1035, 35], [1022, 36], [1019, 36], [R[2], 39]], 'Toi et tes créatures, vous êtes vraiment synchronisés...', [`${st.name} ! Tu vas sur les îles, toi aussi ?`, 'On dit que Drakos a battu tous ceux qui ont osé le défier, sauf Célestine.', 'Avant que tu y ailles, montre-moi si tu es prêt !'], ['Bon. Tu es prêt. Fonce !', 'Moi, je vais m\'entraîner sur la route 10. On se revoit avant la Ligue.']);
    if (name === 'rival5') return rivalFight('rival5', (R) => [[1012, 50], [1035, 49], [1022, 50], [1040, 50], [1051, 51], [R[2], 54]], 'Incroyable... Tu mérites d\'aller jusqu\'au bout.', [`${st.name}... Je savais que tu viendrais.`, 'Huit badges, dont celui de Drakos. Tout le monde ne parle que de toi.', 'Mais avant la Ligue, il y a moi. Donne tout ce que tu as !'], ['Va. La Maître de la Ligue t\'attend.', 'Et bats-la, sinon c\'est moi qui m\'en chargerai !']);
    return false;
  }

  /** Cap des Étoiles : Odyssor apparaît (après le badge de Drakos), on peut tenter de le capturer */
  async odyssorEvent() {
    const st = this.state, ui = this.ui;
    if (!st.badges[7] || st.flags.odyssor === 'caught' || st.flags.odyssorNow) return false;
    this.busy = true; st.flags.odyssorNow = true;
    try {
      this.musicLock = true; this.sound.play('mystic');
      await ui.say(['La mer se met à scintiller...', 'Une immense silhouette constellée d\'étoiles glisse entre les vagues.', 'C\'est Odyssor, la baleine céleste !']);
      await ui.flash(4, '#cfe4ff', 90);
      const res = await this.wildBattle([[1052, 50, 50, 1]], { fixed: true, music: 'champion' });
      if (res === 'caught') { st.flags.odyssor = 'caught'; await ui.say(['Odyssor a rejoint ton équipe.', 'Les marins d\'Odyssée raconteront longtemps cette nuit-là.']); }
      else await ui.say(['Odyssor replonge et disparaît vers le large...', 'Peut-être reviendra-t-il un autre jour.']);
    } finally {
      this.musicLock = false; this.updateZone();
      setTimeout(() => { st.flags.odyssorNow = false; }, 4000);
      this.busy = false;
    }
    return true;
  }

  async ending() {
    const st = this.state, ui = this.ui;
    st.flags.champion = true;
    this.sound.play('victory');
    await ui.say(['Félicitations !', `${st.name}, tu es le nouveau Maître de la Ligue Céleste !`, 'Drakos m\'a fait passer un message, tu sais. « Le vieux Drakos attend sa revanche. »', 'Je crois que les îles et la Ligue vont enfin pouvoir se reparler. Grâce à toi.', 'Ton équipe et toi entrez au Panthéon des dresseurs.'], { speaker: 'Célestine' });
    const s = el('div', 'screen hof-scr'); s.innerHTML = `<div class="scr-title">PANTHÉON</div><div class="hof">${st.party.map((m) => `<div class="hof-m box"><img src="${ASSETS.front(m.sp, m.shiny)}" alt=""><div>${esc(monName(m))}</div><div>N.${m.lvl}</div></div>`).join('')}</div><div class="box hof-txt">${esc(st.name)} — Maître de la Ligue · ${st.dex.caught.length} créatures capturées<br>Merci d'avoir joué à ce prototype d'Odyssée !</div>`;
    ui.root.appendChild(s);
    await new Promise((res) => { const pop = this.input.push((k) => { if (k === 'a' || k === 'b') { pop(); res(); } }); });
    s.remove();
    for (const m of st.party) healFull(m);
    this.save(true);
  }
}
