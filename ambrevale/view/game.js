// Cœur du jeu : boucle, carte courante, déplacements case par case, dialogues, portes, rencontres, dresseurs.
import * as THREE from 'three';
import { createScreens, SW, SH } from './screens.js';
import { createInput } from './input.js';
import { WorldView, CH } from './world3d.js';
import { audio } from './audio.js';
import { frame, drawText, drawTextCentered, wrap, textWidth, rrect } from './ui.js';
import { buildWorld } from '../engine/region.js';
import { buildInterior, buildCave } from '../engine/interiors.js';
import { GR } from '../engine/world.js';
import { ENCOUNTERS } from '../engine/encounters.js';
import { makeMon, healMon, monName } from '../engine/mon.js';
import { species } from '../engine/species.js';
import { ITEMS } from '../engine/items.js';
import { TOWNS_DATA } from '../engine/towns.js';
import { MainMenu } from './menus.js';
import { BattleView } from './battleview.js';
import { runScript, onArriveScripts } from './scripts.js';
import { TitleScreen } from './title.js';
import { creatureSprite } from '../gfx/creatures.js';

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SAVE_KEY = 'ambrevale-save-v1';

export class Game {
  constructor(root, opts = {}) {
    this.opts = opts;
    this.S = createScreens(root);
    this.input = createInput();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.S.gl, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1); this.renderer.setSize(SW, SH, false);
    this.view = new WorldView(this.renderer);
    this.world = buildWorld();
    this.maps = { world: this.world };
    this.panels = []; this.dialog = null; this.choice = null; this.banner = null; this.fade = 0; this.flash = 0;
    this.busy = 0; this.t = 0; this.bumpT = 0;
    this.mode = 'title';
    this.popups = [];
    this.S.sub.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.unlock(); this.onClick(this.S.subPoint(e)); });
    this.title = new TitleScreen(this);
    this.last = performance.now();
    const loop = (now) => { const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; try { this.frame(dt); } catch (e) { console.error(e); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    if (opts.debug) window.__amb = this;
  }

  // ------------------------------------------------------------------ sauvegarde
  newState(name, look) {
    return { v: 1, name, look, money: 3000, party: [], box: [], bag: { potion: 2 }, badges: 0, flags: {}, map: 'maison', mapId: 'hameau:maison',
      x: 4, y: 4, dir: 'down', lastHeal: { map: 'hameau:maison', x: 4, y: 5 }, visited: { hameau: true }, seen: {}, caught: {}, time: 0, repel: 0, created: Date.now() };
  }
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
  save(silent = true) {
    if (!this.st) return false;
    const p = this.player;
    Object.assign(this.st, { mapId: this.map.id, x: p.x, y: p.y, dir: p.dir });
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.st)); return true; } catch (e) { if (!silent) console.warn(e); return false; }
  }

  // ------------------------------------------------------------------ démarrage d'une partie
  start(st) {
    this.st = st;
    this.mode = 'world';
    this.player = { x: st.x, y: st.y, dir: st.dir, moving: false, t: 0, fx: st.x, fy: st.y, turnT: 0, step: 0 };
    this.follower = { x: st.x, y: st.y, fx: st.x, fy: st.y, dir: st.dir, moving: false, t: 0, hidden: true };
    this.mainMenu = new MainMenu(this);
    this.loadMap(st.mapId, st.x, st.y, st.dir, false);
    this.fade = 1; this.fadeTo(0, 0.5);
  }

  getMap(id) {
    if (this.maps[id]) return this.maps[id];
    let M = null;
    if (this.world.interiors[id]) M = buildInterior(this.world.interiors[id]);
    else M = buildCave(id);
    if (!M) { console.warn('carte inconnue', id); M = this.world; }
    for (const n of M.npcs) { n.home = { x: n.x, y: n.y }; n.fx = n.x; n.fy = n.y; }
    this.maps[id] = M;
    return M;
  }

  loadMap(id, x, y, dir, keepFollower = true) {
    const M = this.getMap(id);
    if (!M.npcInit) { for (const n of M.npcs) { n.home ||= { x: n.x, y: n.y }; n.fx = n.x; n.fy = n.y; } M.npcInit = true; }
    this.map = M;
    this.view.load(M);
    const p = this.player;
    Object.assign(p, { x, y, fx: x, fy: y, dir: dir || p.dir, moving: false, t: 0 });
    this.pActor = this.view.addActor('player', { look: this.st.look, x, y, dir: p.dir });
    // créature qui suit (comme dans HeartGold)
    const f = this.follower, back = DIRV[OPP[p.dir]];
    let bx = x + back[0], by = y + back[1];
    if (!M.walkable(bx, by) || M.npcAt(bx, by)) { bx = x; by = y; }
    Object.assign(f, { x: bx, y: by, fx: bx, fy: by, dir: p.dir, moving: false, t: 0, hidden: bx === x && by === y });
    this.refreshFollower();
    this.refreshNpcs();
    this.view.setItemsVisible((it) => !this.st.flags[it.flag]);
    this.area = null; this.checkArea(true);
    if (!M.outdoor) { audio.play(M.music || 'house'); this.showBanner(M.name); }
    this.updateTint();
  }
  refreshFollower() {
    this.view.removeActor('follower');
    const lead = this.st.party.find((m) => m.hp > 0);
    if (!lead || this.map.id === 'antre') { this.fActor = null; return; }
    this.fActor = this.view.addFollower('follower', lead.sp, this.follower);
    this.fActor.setVisible(!this.follower.hidden);
  }
  refreshNpcs() {
    for (const n of this.map.npcs) {
      const vis = this.npcVisible(n);
      n.hidden = !vis;
      if (!vis) { this.view.removeActor(n.id); continue; }
      const a = this.view.addActor(n.id, { look: n.look, creature: n.creature, x: n.fx ?? n.x, y: n.fy ?? n.y, dir: n.dir });
      a.setDir(n.dir);
    }
  }
  npcVisible(n) {
    const f = this.st.flags;
    if (n.hideFlag && f[n.hideFlag]) return false;
    if (n.gate && this.st.badges >= n.gate.badges) return false;
    if (n.block && f[n.block.untilFlag]) return false;
    if (n.showIfBadges != null && this.st.badges < n.showIfBadges) return false;
    if (n.showIfFlag && !f[n.showIfFlag]) return false;
    return true;
  }

  // ------------------------------------------------------------------ boucle
  frame(dt) {
    this.t += dt;
    if (this.st) this.st.time += dt;
    this.handleKeys();
    if (this.mode === 'title') { this.title.update(dt); this.title.draw(); return; }
    if (this.mode === 'battle' && this.battle) { this.battle.update(dt); this.battle.draw(); this.drawFadeOnly(); return; }
    if (this.mode === 'world') {
      if (!this.busy && !this.dialog && !this.panels.length && !this.menuFocus && this.fadeT == null) this.updatePlayer(dt);
      this.updateMovers(dt);
      this.updateNpcs(dt);
      const p = this.player;
      const ty = this.map.e(Math.round(p.fx), Math.round(p.fy)) * 0;
      this.view.update(dt, p.fx + 0.5, p.fy + 0.5, ty);
      this.view.render();
      this.drawTop();
      this.drawBottom();
    }
  }

  handleKeys() {
    let k;
    while ((k = this.input.take())) {
      if (k === 'mute') { const m = audio.toggleMute(); this.popup(m ? 'Son coupé' : 'Son activé'); continue; }
      if (k === 'run') continue;
      if (this.mode === 'title') { this.title.key(k); continue; }
      if (this.dialog) { this.dialogKey(k); continue; }
      if (this.choice) { this.choiceKey(k); continue; }
      if (this.mode === 'battle') { this.battle?.key(k); continue; }
      if (this.panels.length) { this.panels[this.panels.length - 1].key(k); continue; }
      if (this.busy || this.fadeT != null) continue;
      if (this.menuFocus) { this.mainMenu.key(k); continue; }
      if (k === 'a' && !this.player.moving) this.interact();
      else if (k === 'menu' || k === 'b') { if (!this.player.moving) { this.menuFocus = true; audio.sfx('select'); } }
    }
  }

  onClick(pt) {
    if (this.mode === 'title') return this.title.click(pt);
    if (this.dialog) return this.dialogKey('a');
    if (this.choice) return this.choiceClick(pt);
    if (this.mode === 'battle') return this.battle?.click(pt);
    if (this.panels.length) return this.panels[this.panels.length - 1].click?.(pt);
    if (this.busy) return;
    this.mainMenu.click(pt);
  }

  // ------------------------------------------------------------------ joueur
  speed() { return this.input.isHeld('run') ? 8 : 4.2; }
  updatePlayer(dt) {
    const p = this.player;
    if (p.moving) return;
    const d = this.input.dir();
    if (!d) { p.turnT = 0; this.pActor.setStep(0); return; }
    if (d !== p.dir && p.turnT === 0) { p.dir = d; this.pActor.setDir(d); p.turnT = 0.075; return; }
    if (p.turnT > 0) { p.turnT -= dt; if (p.turnT > 0) return; p.turnT = -1; }
    this.tryMove(d);
  }

  tryMove(d) {
    const p = this.player, M = this.map, [dx, dy] = DIRV[d];
    p.dir = d; this.pActor.setDir(d);
    const nx = p.x + dx, ny = p.y + dy;
    // sortie par le tapis / bas de grotte
    const here = M.warpAt(p.x, p.y);
    if (here && here.kind === 'exit' && d === 'down') return this.warp(here);
    const w = M.warpAt(nx, ny);
    if (w && w.kind === 'door' && d === 'up') { audio.sfx('door'); return this.warp(w); }
    // corniche : saut de deux cases vers le sud
    if (d === 'down' && M.inb(nx, ny) && M.ledge[M.i(nx, ny)] && M.walkable(nx, ny + 1) && !M.npcAt(nx, ny + 1)) {
      audio.sfx('jump');
      return this.startMove(nx, ny + 1, true);
    }
    const blocked = !M.walkable(nx, ny) || this.npcOn(nx, ny) || (M.inb(nx, ny) && M.ledge[M.i(nx, ny)]);
    if (blocked) {
      this.pActor.setStep(0);
      if (this.t - this.bumpT > 0.35) { audio.sfx('bump'); this.bumpT = this.t; }
      return;
    }
    this.startMove(nx, ny, false);
  }
  npcOn(x, y) { return this.map.npcs.some((n) => !n.hidden && ((n.x === x && n.y === y) || (n.moving && n.tx === x && n.ty === y))); }

  startMove(nx, ny, jump) {
    const p = this.player, f = this.follower;
    // la créature prend l'ancienne place du joueur
    if (!f.hidden || this.fActor) {
      const wasHidden = f.hidden;
      Object.assign(f, { sx: f.x, sy: f.y, x: p.x, y: p.y, moving: true, t: 0, dir: dirFrom(f.x, f.y, p.x, p.y) || p.dir });
      if (wasHidden || (f.sx === f.x && f.sy === f.y)) { f.sx = p.x; f.sy = p.y; }
      if (jump) { f.sx = f.x; f.sy = f.y - 1; }
      f.hidden = false;
      if (this.fActor) this.fActor.setVisible(true);
    }
    Object.assign(p, { sx: p.x, sy: p.y, x: nx, y: ny, moving: true, t: 0, jump, spd: jump ? 3.2 : this.speed() });
    p.step = (p.step + 1) % 2;
  }

  updateMovers(dt) {
    const p = this.player, f = this.follower;
    if (p.moving) {
      p.t = Math.min(1, p.t + dt * p.spd);
      p.fx = p.sx + (p.x - p.sx) * p.t; p.fy = p.sy + (p.y - p.sy) * p.t;
      this.pActor.setPos(p.fx, p.fy);
      this.pActor.jump = p.jump ? Math.sin(p.t * Math.PI) * 0.8 : 0;
      this.pActor.setStep(p.t < 0.5 ? 1 + p.step : 0);
      if (f.moving) {
        f.t = p.t; f.fx = f.sx + (f.x - f.sx) * f.t; f.fy = f.sy + (f.y - f.sy) * f.t;
        if (this.fActor) { this.fActor.setPos(f.fx, f.fy); this.fActor.setDir(f.dir); this.fActor.hop = Math.sin(f.t * Math.PI) * 0.12; }
      }
      if (p.t >= 1) {
        p.moving = false; p.fx = p.x; p.fy = p.y; this.pActor.jump = 0;
        if (f.moving) { f.moving = false; f.fx = f.x; f.fy = f.y; }
        this.onArrive();
      }
    } else if (this.fActor) this.fActor.hop = Math.max(0, Math.sin(this.t * 4) * 0.05);
  }

  async onArrive() {
    const p = this.player, M = this.map;
    const w = M.warpAt(p.x, p.y);
    if (w && (w.kind === 'cave')) { audio.sfx('door'); return this.warp(w); }
    if (M.outdoor) this.checkArea(false);
    if (this.st.repel > 0) { this.st.repel--; if (this.st.repel === 0) this.run(() => this.say('L\'effet du Repousse est terminé.')); }
    // dresseurs qui repèrent le joueur
    const tr = this.spotTrainer();
    if (tr) return this.run(() => this.trainerSpotted(tr));
    if (await onArriveScripts(this)) return;
    // rencontres sauvages
    const g = M.g(p.x, p.y);
    if (g === GR.TALL || g === GR.SNOWTALL || (M.cave && M.encounters)) {
      if (Math.random() < (M.cave ? 0.07 : 0.1)) this.wildEncounter();
    }
  }

  checkArea(silent) {
    const M = this.map, p = this.player;
    if (!M.outdoor) return;
    const a = M.areaAt(p.x, p.y);
    if (!a || (this.area && a.id === this.area.id)) return;
    this.area = a;
    if (a.town) { if (!this.st.visited[a.id]) this.st.visited[a.id] = true; }
    audio.play(a.music || 'route');
    this.showBanner(a.name);
    this.updateTint();
  }

  updateTint() {
    const M = this.map, tint = this.S.tint;
    let col = '#ffffff', fog = null;
    if (M.outdoor) {
      const h = new Date().getHours() + new Date().getMinutes() / 60;
      col = h >= 20 || h < 5.5 ? '#7c88c8' : h < 8 ? '#f4dcc0' : h >= 17.5 ? '#f8d0a8' : '#ffffff';
      if (this.area && this.area.mist) fog = this.area.mist;
    } else if (M.dark) col = M.dark > 0.3 ? '#7a7290' : '#a8a4b8';
    tint.style.background = col;
    tint.style.display = col === '#ffffff' ? 'none' : 'block';
    const sc = this.view.scene;
    if (fog) sc.fog = new THREE.Fog('#c8ccd4', 30 - fog * 14, 46 - fog * 18); else sc.fog = null;
    this.isNight = col === '#7c88c8';
  }

  // ------------------------------------------------------------------ PNJ
  updateNpcs(dt) {
    const M = this.map;
    for (const n of M.npcs) {
      if (n.hidden) continue;
      const a = this.view.actors.get(n.id); if (!a) continue;
      if (n.moving) {
        n.mt = Math.min(1, n.mt + dt * (n.spd || 3.5));
        n.fx = n.sx + (n.tx - n.sx) * n.mt; n.fy = n.sy + (n.ty - n.sy) * n.mt;
        a.setPos(n.fx, n.fy); a.setStep(n.mt < 0.5 ? 1 + (n.stepPar || 0) : 0);
        if (n.mt >= 1) { n.moving = false; n.x = n.tx; n.y = n.ty; n.fx = n.x; n.fy = n.y; a.setStep(0); n.onArrive?.(); }
        continue;
      }
      if (n.move !== 'wander' || this.busy || this.dialog) continue;
      n.wt = (n.wt ?? 1 + Math.random() * 3) - dt;
      if (n.wt > 0) continue;
      n.wt = 1.5 + Math.random() * 3;
      const dirs = ['up', 'down', 'left', 'right'], d = dirs[Math.floor(Math.random() * 4)];
      n.dir = d; a.setDir(d);
      if (Math.random() < 0.35) continue;
      const [dx, dy] = DIRV[d], nx = n.x + dx, ny = n.y + dy;
      if (Math.abs(nx - n.home.x) > 2 || Math.abs(ny - n.home.y) > 2) continue;
      if (!this.freeFor(n, nx, ny)) continue;
      this.npcStep(n, d);
    }
  }
  freeFor(n, x, y) {
    const M = this.map, p = this.player, f = this.follower;
    if (!M.walkable(x, y)) return false;
    if ((p.x === x && p.y === y) || (p.moving && p.sx === x && p.sy === y)) return false;
    if (!f.hidden && f.x === x && f.y === y) return false;
    if (M.warpAt(x, y)) return false;
    return !M.npcs.some((o) => o !== n && !o.hidden && ((o.x === x && o.y === y) || (o.moving && o.tx === x && o.ty === y)));
  }
  npcStep(n, d, spd = 3.5) {
    const [dx, dy] = DIRV[d];
    Object.assign(n, { sx: n.x, sy: n.y, tx: n.x + dx, ty: n.y + dy, mt: 0, moving: true, dir: d, spd, stepPar: 1 - (n.stepPar || 0) });
    this.view.actors.get(n.id)?.setDir(d);
  }
  /** fait marcher un PNJ de plusieurs cases (scripts) */
  walkNpc(n, d, steps, spd = 4) {
    return new Promise((res) => {
      let left = steps;
      const go = () => { if (left-- <= 0) { n.onArrive = null; return res(); } this.npcStep(n, d, spd); };
      n.onArrive = go; go();
    });
  }
  facePlayer(n) { const p = this.player; const d = dirFrom(n.x, n.y, p.x, p.y); if (d) { n.dir = d; this.view.actors.get(n.id)?.setDir(d); } }

  spotTrainer() {
    const M = this.map, p = this.player;
    for (const n of M.npcs) {
      if (n.hidden || !n.trainer || n.trainer.sight <= 0 || this.st.flags['tr:' + n.trainer.id] || n.moving) continue;
      const [dx, dy] = DIRV[n.dir];
      for (let k = 1; k <= n.trainer.sight; k++) {
        const x = n.x + dx * k, y = n.y + dy * k;
        if (x === p.x && y === p.y) return { n, dist: k };
        if (!M.walkable(x, y) || M.npcAt(x, y)) break;
      }
    }
    return null;
  }
  async trainerSpotted({ n, dist }) {
    audio.sfx('exclaim');
    this.exclaim = { id: n.id, t: 0.8 };
    await this.wait(700);
    // la créature qui suit se range
    const steps = dist - 1;
    if (steps > 0) {
      const f = this.follower;
      if (!f.hidden && steps > 0) { const [dx, dy] = DIRV[n.dir]; for (let k = 1; k <= steps; k++) if (f.x === n.x + dx * k && f.y === n.y + dy * k) { f.hidden = true; this.fActor?.setVisible(false); } }
      await this.walkNpc(n, n.dir, steps, 5);
    }
    this.player.dir = OPP[n.dir]; this.pActor.setDir(this.player.dir);
    await this.trainerBattle(n);
  }
  async trainerBattle(n) {
    const T = n.trainer;
    audio.play(T.leader || T.champion ? 'leader' : 'trainer');
    await this.say(Array.isArray(T.intro) ? T.intro : [T.intro || 'Un combat !'], { speaker: n });
    const res = await this.battleTrainer(T, n.look);
    if (res === 'win') {
      this.st.flags['tr:' + T.id] = true;
      if (T.after && !T.leader && !T.champion) n.talkAfter = T.after;
    }
    return res;
  }

  // ------------------------------------------------------------------ interactions
  interact() {
    const p = this.player, M = this.map, [dx, dy] = DIRV[p.dir];
    const x = p.x + dx, y = p.y + dy;
    let n = M.npcAt(x, y);
    // comptoir : on parle à la personne derrière
    if (!n && M.inb(x, y) && M.bsolid[M.i(x, y)]) { const n2 = M.npcAt(x + dx, y + dy); if (n2 && n2.counter) n = n2; }
    if (n && !n.hidden) return this.run(() => runScript(this, n));
    const f = this.follower;
    if (!f.hidden && f.x === x && f.y === y && this.fActor) {
      const lead = this.st.party.find((m) => m.hp > 0);
      if (lead) return this.run(async () => { audio.sfx('cry', { seed: species(lead.sp).num * 977 }); await this.say(followerLine(lead)); });
    }
    const it = M.items.find((i) => i.x === x && i.y === y && !this.st.flags[i.flag]);
    if (it) return this.run(async () => {
      this.st.flags[it.flag] = true; this.view.setItemsVisible((i) => !this.st.flags[i.flag]);
      this.addItem(it.item, it.n);
      audio.jingle('item');
      await this.say(`Tu as trouvé ${it.n > 1 ? it.n + ' × ' : ''}${ITEMS[it.item].name} !`);
    });
    const s = M.signs.get(M.key(x, y));
    if (s && p.dir === 'up') return this.run(() => this.say(s));
    if (s) return this.run(() => this.say(s));
    // meubles
    const fur = M.furniture.find((F) => x >= F.x && x < F.x + (F.w || 1) && y >= F.y && y < F.y + (F.d || 1) && F.solid !== false);
    if (fur) {
      const txt = { bookcase: 'Des livres sur les créatures d\'Ambrevale... Il y en a des dizaines !', tv: 'Une émission sur les créatures rares passe à la télé.', fridge: 'Le frigo est plein de baies et de jus de fruits.', shelf: 'Des rayons bien rangés.', machine: 'Une machine compliquée. Mieux vaut ne pas y toucher.', plant: 'Une jolie plante verte.', bed: 'Un lit moelleux.', healer: 'La machine de soin du Centre.', statue: 'Une statue imposante.' }[fur.kind];
      if (fur.kind === 'pc') return this.run(() => runScript(this, { script: 'pc' }));
      if (fur.kind === 'starter') return this.run(() => runScript(this, { script: 'starterTable' }));
      if (txt) return this.run(() => this.say(txt));
    }
    if (M.g(x, y) === GR.WATER) return this.run(() => this.say('L\'eau est d\'un bleu profond.'));
  }

  addItem(id, n = 1) { this.st.bag[id] = (this.st.bag[id] || 0) + n; }

  // ------------------------------------------------------------------ téléportations
  async warp(w) {
    if (this.fadeT != null) return;
    this.busy++;
    await this.fadeTo(1, 0.22);
    const target = w.entry ? null : w;
    const M = this.getMap(w.map);
    const pos = w.entry ? M.entry : target;
    this.loadMap(w.map, pos.x, pos.y, pos.dir || w.dir || this.player.dir);
    this.save();
    await this.fadeTo(0, 0.22);
    this.busy--;
  }
  async teleport(mapId, x, y, dir = 'down') {
    this.busy++;
    await this.fadeTo(1, 0.3);
    this.loadMap(mapId, x, y, dir);
    await this.fadeTo(0, 0.3);
    this.busy--;
  }
  fadeTo(v, dur) {
    return new Promise((res) => {
      const from = this.fade, t0 = performance.now();
      this.fadeT = true;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
        this.fade = from + (v - from) * k;
        if (k < 1) requestAnimationFrame(step); else { this.fadeT = null; res(); }
      };
      step();
    });
  }

  // ------------------------------------------------------------------ scripts asynchrones
  async run(fn) {
    this.busy++;
    try { await fn(); } catch (e) { console.error(e); } finally { this.busy--; }
  }
  wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  say(text, o = {}) {
    const lines = (Array.isArray(text) ? text : [text]).flatMap((t) => wrap(this.fmt(t), 232));
    const pages = [];
    for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
    return new Promise((res) => { this.dialog = { pages, page: 0, chars: 0, res, keep: o.keep, speaker: o.speaker }; });
  }
  fmt(t) { return String(t).replaceAll('{nom}', this.st?.name || '').replaceAll('{rival}', 'Noé'); }
  dialogKey(k) {
    const D = this.dialog; if (!D) return;
    if (k !== 'a' && k !== 'b') return;
    const total = D.pages[D.page].join(' ').length;
    if (D.chars < total) { D.chars = total; return; }
    if (D.page < D.pages.length - 1) { D.page++; D.chars = 0; audio.sfx('text'); return; }
    if (D.keep) { D.done = true; const r = D.res; D.res = null; r && r(); return; }
    this.dialog = null; audio.sfx('text'); D.res();
  }
  async ask(text, options = ['Oui', 'Non']) {
    await this.say(text, { keep: true });
    return new Promise((res) => { this.choice = { options, sel: 0, res }; });
  }
  choiceKey(k) {
    const C = this.choice;
    if (k === 'up') { C.sel = (C.sel + C.options.length - 1) % C.options.length; audio.sfx('move'); }
    if (k === 'down') { C.sel = (C.sel + 1) % C.options.length; audio.sfx('move'); }
    if (k === 'a' || k === 'b') { const i = k === 'b' ? C.options.length - 1 : C.sel; audio.sfx(k === 'a' ? 'select' : 'back'); this.choice = null; this.dialog = null; C.res(i); }
  }
  choiceClick() { this.choiceKey('a'); }
  showBanner(name) { if (name) this.banner = { name, t: 0 }; }
  popup(msg) { this.popups.push({ msg, t: 0 }); }

  /** pile de panneaux (menus de l'écran du bas) */
  openPanel(p) { return new Promise((res) => { p._res = res; this.panels.push(p); }); }
  closePanel(p, v) { const i = this.panels.indexOf(p); if (i >= 0) this.panels.splice(i, 1); p._res?.(v); }

  // ------------------------------------------------------------------ combats
  pickWild() {
    const M = this.map, p = this.player;
    let table = M.encounters;
    if (!table) { const a = M.areaAt(p.x, p.y); table = a && ENCOUNTERS[a.id]; if (a && a.id === 'r5' && Math.abs(p.y - 63) < 12 && p.x > 152 && p.x < 182) table = ENCOUNTERS.lac; }
    if (!table || !table.length) return null;
    const tot = table.reduce((s, e) => s + e[3], 0);
    let r = Math.random() * tot;
    for (const [sp, lo, hi, w] of table) { r -= w; if (r <= 0) return makeMon(sp, lo + Math.floor(Math.random() * (hi - lo + 1))); }
    return makeMon(table[0][0], table[0][1]);
  }
  wildEncounter() {
    const mon = this.pickWild(); if (!mon) return;
    const lead = this.st.party.find((m) => m.hp > 0);
    if (this.st.repel > 0 && lead && mon.level < lead.level) return;
    this.run(async () => { await this.battleWild(mon); });
  }
  async battleWild(mon, o = {}) {
    this.st.seen[mon.sp] = true;
    return this.startBattle({ wild: true, foe: [mon], music: o.music || 'battle', env: this.battleEnv(), legend: o.legend });
  }
  async battleTrainer(T, look) {
    const foe = T.team.map(([sp, l]) => makeMon(sp, l));
    for (const m of foe) this.st.seen[m.sp] = true;
    return this.startBattle({ wild: false, trainer: T, foe, look, music: T.leader || T.champion ? (T.champion ? 'champion' : 'leader') : 'trainer', env: this.battleEnv() });
  }
  battleEnv() {
    const M = this.map, p = this.player;
    if (M.cave) return 'cave';
    if (M.gym) return 'gym:' + M.gym;
    if (!M.outdoor) return 'indoor';
    const g = M.g(p.x, p.y);
    if (g === GR.SNOW || g === GR.SNOWTALL || g === GR.SNOWPATH) return 'snow';
    if (g === GR.SAND || g === GR.BRIDGE || g === GR.DOCK) return 'beach';
    if (g === GR.ROCKY || g === GR.ASH) return 'rocky';
    if (g === GR.PAVE) return 'town';
    if (g === GR.DARKGRASS || (this.area && this.area.id === 'bois')) return 'forest';
    return 'grass';
  }
  async startBattle(o) {
    this.busy++;
    audio.play(o.music, true);
    await this.battleTransition();
    this.mode = 'battle';
    this.battle = new BattleView(this, o);
    const outcome = await this.battle.run();
    this.battle = null;
    this.mode = 'world';
    this.refreshFollower();
    this.fade = 1;
    if (outcome === 'lose') await this.blackout();
    else { audio.play(this.map.outdoor ? (this.area?.music || 'route') : this.map.music, true); this.fadeTo(0, 0.35); }
    this.save();
    this.busy--;
    return outcome;
  }
  async battleTransition() {
    for (let k = 0; k < 2; k++) { this.flash = 1; await this.wait(90); this.flash = 0; await this.wait(70); }
    this.wipe = 0;
    await new Promise((res) => { const t0 = performance.now(); const st = () => { this.wipe = Math.min(1, (performance.now() - t0) / 550); if (this.wipe < 1) requestAnimationFrame(st); else res(); }; st(); });
    this.wipe = null;
  }
  async blackout() {
    this.fade = 1;
    const lost = Math.floor(this.st.money / 2);
    this.st.money -= lost;
    for (const m of this.st.party) healMon(m);
    const h = this.st.lastHeal;
    this.loadMap(h.map, h.x, h.y, 'up');
    await this.fadeTo(0, 0.4);
    await this.say([`Tu n'as plus de créature en état de te battre...`, `Tu perds ${lost} ¤ dans la panique et tu cours te réfugier en lieu sûr.`, 'Tes créatures ont été soignées.']);
  }
  healParty() { for (const m of this.st.party) healMon(m); this.refreshFollower(); }
  receiveMon(m) {
    this.st.caught[m.sp] = true; this.st.seen[m.sp] = true;
    if (this.st.party.length < 6) { this.st.party.push(m); this.refreshFollower(); return 'party'; }
    this.st.box.push(m); return 'box';
  }

  // ------------------------------------------------------------------ dessin (écran du haut)
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.view.camera);
    return { x: (v.x + 1) / 2 * SW, y: (1 - v.y) / 2 * SH };
  }
  drawTop() {
    const c = this.S.uctx;
    c.clearRect(0, 0, SW, SH);
    // bulle « ! » des dresseurs
    if (this.exclaim) {
      this.exclaim.t -= 1 / 60;
      const n = this.map.npcs.find((q) => q.id === this.exclaim.id);
      if (n && this.exclaim.t > 0) {
        const s = this.project(n.fx + 0.5, 1.9, n.fy + 0.5);
        frame(c, s.x - 6, s.y - 16, 13, 15, 'text'); drawText(c, '!', s.x - 1, s.y - 15, '#e03030', null);
      } else this.exclaim = null;
    }
    // panneau de lieu
    if (this.banner) {
      const B = this.banner; B.t += 1 / 60;
      const w = textWidth(B.name) + 20, y = B.t < 0.25 ? -24 + (B.t / 0.25) * 28 : B.t > 2.4 ? 4 - ((B.t - 2.4) / 0.25) * 28 : 4;
      frame(c, 4, Math.round(y), w, 20, 'gold');
      drawText(c, B.name, 14, Math.round(y) + 4, '#4a3a20', '#e8d8a8');
      if (B.t > 2.7) this.banner = null;
    }
    this.drawPopups(c);
    // panneaux qui dessinent en haut (résumé, bestiaire, carte...)
    const P = this.panels[this.panels.length - 1];
    if (P && P.drawTop) P.drawTop(c);
    this.drawDialog(c);
    this.drawFade(c);
  }
  drawPopups(c) {
    this.popups = this.popups.filter((p) => (p.t += 1 / 60) < 1.6);
    this.popups.forEach((p, i) => { const w = textWidth(p.msg) + 14; frame(c, SW - w - 4, 4 + i * 20, w, 18, 'dark'); drawText(c, p.msg, SW - w + 3, 7 + i * 20, '#ffffff', null); });
  }
  drawDialog(c) {
    const D = this.dialog;
    if (D) {
      const pg = D.pages[D.page];
      frame(c, 2, 142, 252, 48, 'text');
      const speed = this.input.isHeld('a') ? 140 : 55;
      const total = pg.join(' ').length;
      if (D.chars < total) { D.chars = Math.min(total, D.chars + speed / 60); if (Math.floor(D.chars) % 3 === 0) {} }
      let left = Math.floor(D.chars);
      pg.forEach((line, i) => { const s = line.slice(0, Math.max(0, left)); left -= line.length + 1; drawText(c, s, 13, 148 + i * 16); });
      if (D.chars >= total && !D.done && Math.floor(this.t * 3) % 2 === 0) drawText(c, '▼', 238, 172, '#e04848', null);
    }
    const C = this.choice;
    if (C) {
      const w = Math.max(...C.options.map((o) => textWidth(o))) + 26, h = C.options.length * 15 + 10;
      frame(c, SW - w - 4, 140 - h, w, h, 'text');
      C.options.forEach((o, i) => { drawText(c, o, SW - w + 12, 140 - h + 6 + i * 15); if (i === C.sel) drawText(c, '▶', SW - w + 3, 140 - h + 6 + i * 15, '#484850', null); });
    }
  }
  drawFade(c) {
    if (this.flash) { c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillRect(0, 0, SW, SH); }
    if (this.wipe != null) {
      c.fillStyle = '#000';
      const k = this.wipe;
      for (let i = 0; i < 12; i++) { const h = 16, w = Math.ceil(SW * Math.min(1, k * 1.6 - i * 0.05)); if (w <= 0) continue; if (i % 2) c.fillRect(SW - w, i * h, w, h); else c.fillRect(0, i * h, w, h); }
    }
    if (this.fade > 0) { c.fillStyle = `rgba(0,0,0,${this.fade})`; c.fillRect(0, 0, SW, SH); }
  }
  drawFadeOnly() { this.drawFade(this.S.uctx); }

  drawBottom() {
    const c = this.S.sctx;
    const P = this.panels[this.panels.length - 1];
    if (P) P.draw(c, this.t); else this.mainMenu.draw(c, this.t);
    if (this.fade > 0.01 && this.mode !== 'battle') { c.fillStyle = `rgba(0,0,0,${this.fade * 0.85})`; c.fillRect(0, 0, SW, SH); }
  }
}

export function dirFrom(x0, y0, x1, y1) {
  if (x1 > x0) return 'right'; if (x1 < x0) return 'left'; if (y1 > y0) return 'down'; if (y1 < y0) return 'up'; return null;
}
function followerLine(m) {
  const n = monName(m), r = Math.random();
  if (m.hp < m.stats.hp * 0.35) return `${n} a l'air fatigué...`;
  if (m.status) return `${n} ne se sent pas très bien.`;
  return r < 0.33 ? `${n} est content de marcher avec toi !` : r < 0.66 ? `${n} regarde autour de lui avec curiosité.` : `${n} se frotte contre ta jambe.`;
}
export { DIRV, OPP };
