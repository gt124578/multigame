// odyssee/js/labo/editeur.js — l'éditeur de carte de la version test : on peint le terrain (herbe, chemins, eau, arbres,
// rebords…), on pose du décor, des panneaux, des habitants, des objets et même des maisons, sur n'importe quelle carte.
// Chaque retouche est gardée dans ce navigateur et rejouée au prochain lancement ; « Exporter » donne le texte à coller
// dans odyssee/js/world/retouches.js pour qu'elle fasse partie du jeu de tout le monde.
//
// Commandes : flèches / ZQSD pour survoler la carte (on passe à travers tout), molette pour zoomer, clic (ou glisser)
// pour appliquer l'outil, clic droit pour la pipette (prendre le terrain sous la souris), Ctrl+Z pour annuler, B pour fermer.
import * as THREE from 'three';
import { T } from '../world/tiles.js';
import { SPRITES } from '../data/sprites.js';
import { CHAR_ROWS } from '../render/world3d.js';
import { buildWorld } from '../world/region.js';
import { applyOps } from '../world/retouches.js';
import { el, esc } from '../ui/ui.js';

const LOCAL_KEY = 'odyssee-retouches';
// terrain proposé dans la palette (code T, nom affiché, couleur de la pastille)
const SOLS = [
  [T.GRASS, 'Herbe', '#62c56b'], [T.TALL, 'Hautes herbes', '#2f9a48'], [T.DARKTALL, 'Herbes sombres', '#1f6a38'], [T.FLOWER, 'Fleurs', '#f07aa0'],
  [T.PATH, 'Chemin', '#d8b878'], [T.PAVE, 'Pavés', '#b0a8a0'], [T.SAND, 'Sable', '#f0dc98'], [T.SNOW, 'Neige', '#f4f8ff'], [T.ASH, 'Cendre', '#8a7a78'],
  [T.WATER, 'Eau', '#4a9ae8'], [T.BRIDGE, 'Pont', '#a07040'], [T.TREE, 'Arbre', '#2e6a32'], [T.PINE, 'Sapin', '#24543a'], [T.BUSH, 'Buisson', '#3c8040'],
  [T.ROCK, 'Rocher', '#8a8a8a'], [T.FENCE, 'Clôture', '#c8a070'], [T.LEDGE, 'Rebord ↓', '#7a6040'], [T.LEDGE_E, 'Rebord →', '#7a6040'], [T.LEDGE_W, 'Rebord ←', '#7a6040'],
  [T.CUT, 'Petit arbre (Coupe)', '#5a9a3a'], [T.SMASH, 'Rocher fissuré (Éclate-Roc)', '#9a8070'], [T.BOULDER, 'Gros rocher (Force)', '#6a6a6a'],
  [T.FLOOR, 'Sol (intérieur)', '#c8a878'], [T.WALL, 'Mur (intérieur)', '#606878'], [T.CAVE, 'Sol de grotte', '#8a7058'], [T.CAVEWALL, 'Paroi de grotte', '#4a3a30'],
];
const NOM_T = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
const BATIMENTS = [['house', 'Maison'], ['house2', 'Grande maison'], ['bighouse', 'Résidence'], ['center', 'Centre de soins'], ['mart', 'Boutique']];
const TOITS = ['red', 'blue', 'green', 'brown', 'gray', 'teal', 'purple', 'orange', 'gold'];

export class Editeur {
  constructor(game) {
    this.game = game; this.on = false;
    this.edits = {};            // carte → liste de retouches (gardées dans le navigateur)
    this.tool = { kind: 'sol', v: T.PATH };
    this.cursor = null; this.zoom = 1;
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }
  /* ---------------- retouches gardées dans le navigateur ---------------- */
  loadLocal() {
    try { this.edits = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch (e) { this.edits = {}; }
    for (const [id, ops] of Object.entries(this.edits)) if (this.game.world.maps[id]) applyOps(this.game.world.maps[id], ops, this.game.world.maps);
  }
  saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.edits)); } catch (e) { this.game.ui.toast('Stockage du navigateur plein'); } }
  count() { return Object.values(this.edits).reduce((a, l) => a + l.length, 0); }

  /* ---------------- ouverture ---------------- */
  toggle() { if (this.on) this.close(); else this.open(); }
  open() {
    const g = this.game; if (!g.state || this.on || g.bv.alive) return;
    this.on = true; g.busy = true; g.input.clearDirs?.();
    if (g.hud?.root) g.hud.root.style.visibility = 'hidden';   // le HUD laisse la place au panneau
    this.panel = el('div', 'edit-panel'); g.ui.root.appendChild(this.panel);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.svg.setAttribute('class', 'edit-cursor');
    this.poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon'); this.svg.appendChild(this.poly); g.ui.root.appendChild(this.svg);
    this.drawPanel();
    const cv = g.view.renderer.domElement;
    this.onMove = (e) => { this.pick(e); if (this.down && this.tool.kind === 'sol') this.apply(); };
    this.onDown = (e) => { if (e.target !== cv) return; this.pick(e); if (e.button === 2) { this.pipette(); e.preventDefault(); return; } this.down = true; this.apply(); };
    this.onUp = () => { this.down = false; this.lastPaint = null; };
    this.onWheel = (e) => { if (e.target !== cv) return; e.preventDefault(); this.setZoom(this.zoom * (e.deltaY > 0 ? 1.15 : 1 / 1.15)); };
    this.onCtx = (e) => { if (e.target === cv) e.preventDefault(); };
    this.onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); this.undo(); }
    };
    cv.addEventListener('pointermove', this.onMove); cv.addEventListener('pointerdown', this.onDown); addEventListener('pointerup', this.onUp);
    cv.addEventListener('wheel', this.onWheel, { passive: false }); cv.addEventListener('contextmenu', this.onCtx); addEventListener('keydown', this.onKey);
    // survol : les flèches déplacent le point de vue (le dresseur passe à travers tout)
    this.popInput = g.input.push((k) => {
      const p = g.player, d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k];
      if (d) { const n = Math.max(1, Math.round(this.zoom * 2)); p.x = Math.max(0, Math.min(g.mapObj.w - 1, p.x + d[0] * n)); p.y = Math.max(0, Math.min(g.mapObj.h - 1, p.y + d[1] * n)); return; }
      if (k === 'b') this.close();
    });
    this.raf = requestAnimationFrame(this.frame = () => { this.drawCursor(); this.raf = requestAnimationFrame(this.frame); });
  }
  close() {
    if (!this.on) return;
    const g = this.game, cv = g.view.renderer.domElement;
    this.on = false; cancelAnimationFrame(this.raf); this.popInput?.();
    cv.removeEventListener('pointermove', this.onMove); cv.removeEventListener('pointerdown', this.onDown); removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('wheel', this.onWheel); cv.removeEventListener('contextmenu', this.onCtx); removeEventListener('keydown', this.onKey);
    this.panel?.remove(); this.svg?.remove();
    if (g.hud?.root) g.hud.root.style.visibility = '';
    this.setZoom(1);
    // le dresseur se pose sur la case praticable la plus proche
    const p = g.player, m = g.mapObj;
    if (![T.GRASS, T.PATH, T.TALL, T.SAND, T.FLOWER, T.PAVE, T.BRIDGE, T.CAVE, T.FLOOR, T.ASH, T.SNOW, T.DARKTALL].includes(m.get(p.x, p.y))) {
      for (let r = 1; r < 12; r++) { let done = false; for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r; dx++) { const t = m.get(p.x + dx, p.y + dy); if ([T.GRASS, T.PATH, T.SAND, T.PAVE, T.FLOOR, T.CAVE, T.SNOW, T.ASH].includes(t)) { p.x += dx; p.y += dy; done = true; break; } } if (done) break; }
    }
    g.setMap(m.id);
    g.busy = false;
  }
  setZoom(z) {
    const v = this.game.view; this.zoom = Math.max(0.6, Math.min(2.6, z)); v.zoom = this.zoom;
    const s = new THREE.Vector2(); v.renderer.getSize(s); v.resize(s.x, s.y);
  }

  /* ---------------- case sous la souris ---------------- */
  pick(e) {
    const g = this.game, cv = g.view.renderer.domElement, r = cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    g.view.camera.updateMatrixWorld();
    this.ray.setFromCamera(ndc, g.view.camera);
    const p = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.plane, p)) return;
    const x = Math.floor(p.x), y = Math.floor(p.z);
    if (!g.mapObj.in(x, y)) { this.cursor = null; return; }
    this.cursor = { x, y }; this.drawInfo();
  }
  drawCursor() {
    const g = this.game, c = this.cursor; if (!c) { this.poly.setAttribute('points', ''); return; }
    const cv = g.view.renderer.domElement, r = cv.getBoundingClientRect(), cam = g.view.camera;
    const pt = (x, z) => { const v = new THREE.Vector3(x, 0, z).project(cam); return `${r.left + (v.x + 1) / 2 * r.width},${r.top + (1 - v.y) / 2 * r.height}`; };
    const w = this.tool.kind === 'batiment' ? ({ house: 4, house2: 5, bighouse: 6, center: 5, mart: 4 }[this.tool.v] || 4) : 1, h = this.tool.kind === 'batiment' ? ({ bighouse: 4, center: 4, mart: 4 }[this.tool.v] || 3) : 1;
    this.poly.setAttribute('points', [pt(c.x, c.y), pt(c.x + w, c.y), pt(c.x + w, c.y + h), pt(c.x, c.y + h)].join(' '));
  }
  drawInfo() {
    const g = this.game, m = g.mapObj, c = this.cursor, info = this.panel?.querySelector('.edit-info'); if (!info || !c) return;
    const z = m.outdoor ? m.zoneAt(c.x, c.y) : null, d = m.deco.find((q) => q.x === c.x && q.y === c.y), n = m.npcs.find((q) => q.x === c.x && q.y === c.y);
    info.innerHTML = `<b>${esc(m.id)}</b> · case <b>${c.x}, ${c.y}</b><br>${esc(NOM_T[m.get(c.x, c.y)] || '?')}${d ? ' · décor ' + esc(d.k) : ''}${n ? ' · PNJ ' + esc(n.id) : ''}${z?.name ? '<br>' + esc(z.name) : ''}`;
  }

  /* ---------------- outils ---------------- */
  drawPanel() {
    const props = [...new Set([...Object.keys(SPRITES.nature || {}), ...Object.keys(SPRITES.mobilier || {}), ...Object.keys(SPRITES.deco || {})])].filter((k) => !/front|tuft|bang|itemball/.test(k)).sort();
    const sprites = Object.keys(CHAR_ROWS).filter((k) => !k.startsWith('poke:')).sort();
    const t = this.tool;
    this.panel.innerHTML = `
      <div class="edit-head">ÉDITEUR DE CARTE <button type="button" data-close>✕</button></div>
      <div class="edit-info">Survole la carte…</div>
      <div class="edit-tabs">${[['sol', 'Terrain'], ['decor', 'Décor'], ['pnj', 'Habitant'], ['panneau', 'Panneau'], ['objet', 'Objet'], ['batiment', 'Bâtiment'], ['gomme', 'Gomme']].map(([k, l]) => `<button type="button" data-tab="${k}" class="${t.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="edit-body">${
  t.kind === 'sol' ? `<div class="edit-sols">${SOLS.map(([v, n, c]) => `<button type="button" data-sol="${v}" class="${t.v === v ? 'on' : ''}" title="${esc(n)}"><i style="background:${c}"></i>${esc(n)}</button>`).join('')}</div>`
  : t.kind === 'decor' ? `<select data-f="v" size="12">${props.map((k) => `<option${k === t.v ? ' selected' : ''}>${k}</option>`).join('')}</select>`
  : t.kind === 'pnj' ? `<label>Apparence <select data-f="v">${sprites.map((k) => `<option${k === t.v ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label>Regard <select data-f="dir">${['down', 'up', 'left', 'right'].map((d) => `<option${d === t.dir ? ' selected' : ''}>${d}</option>`).join('')}</select></label><label>Ce qu'il dit (une phrase par ligne)<textarea data-f="text" rows="4">${esc(t.text || '')}</textarea></label>`
  : t.kind === 'panneau' ? `<label>Texte du panneau<textarea data-f="text" rows="3">${esc(t.text || 'NOUVEAU LIEU\nUne petite phrase.')}</textarea></label>`
  : t.kind === 'objet' ? `<label>Objet <input data-f="v" value="${esc(t.v || 'potion')}"></label><label>Quantité <input data-f="qty" type="number" min="1" value="${t.qty || 1}"></label>`
  : t.kind === 'batiment' ? `<label>Type <select data-f="v">${BATIMENTS.map(([k, n]) => `<option value="${k}"${k === t.v ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label>Toit <select data-f="roof">${TOITS.map((k) => `<option${k === t.roof ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label>Nom <input data-f="name" value="${esc(t.name || 'Maison')}"></label><small>Le coin en haut à gauche du bâtiment se pose sur la case visée ; on entre par la porte.</small>`
  : '<small>Clic : retire le décor, le panneau, l\'habitant ou l\'objet de la case (le terrain reste).</small>'}
      </div>
      <div class="edit-foot">
        <span>${this.count()} retouche(s)</span>
        <button type="button" data-undo>↶ Annuler</button><button type="button" data-export>⇩ Exporter</button><button type="button" data-reset>Tout effacer</button>
      </div>
      <div class="edit-keys">Flèches : survoler · molette : zoom · clic / glisser : appliquer · clic droit : pipette · Ctrl+Z · B : fermer</div>`;
    const P = this.panel;
    P.querySelector('[data-close]').onclick = () => this.close();
    P.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { const k = b.dataset.tab; this.tool = { kind: k, v: k === 'sol' ? T.PATH : k === 'decor' ? 'lamp' : k === 'pnj' ? 'habitant' : k === 'batiment' ? 'house' : k === 'objet' ? 'potion' : null, dir: 'down', roof: 'red' }; this.drawPanel(); }));
    P.querySelectorAll('[data-sol]').forEach((b) => (b.onclick = () => { this.tool.v = +b.dataset.sol; this.drawPanel(); }));
    P.querySelectorAll('[data-f]').forEach((i) => (i.oninput = i.onchange = () => { const f = i.dataset.f; this.tool[f] = i.type === 'number' ? +i.value : i.value; }));
    P.querySelector('[data-undo]').onclick = () => this.undo();
    P.querySelector('[data-export]').onclick = () => this.exporter();
    P.querySelector('[data-reset]').onclick = () => { if (confirm('Effacer toutes les retouches de ce navigateur ?')) { this.edits = {}; this.saveLocal(); this.rebuild(); } };
    for (const i of P.querySelectorAll('input, textarea, select')) i.addEventListener('keydown', (e) => e.stopPropagation());
  }
  pipette() { const c = this.cursor; if (!c) return; this.tool = { kind: 'sol', v: this.game.mapObj.get(c.x, c.y) }; this.drawPanel(); }

  /** applique l'outil sur la case visée */
  apply() {
    const g = this.game, m = g.mapObj, c = this.cursor, t = this.tool; if (!c) return;
    const k = c.x + ',' + c.y;
    if (t.kind === 'sol' && this.lastPaint === k + t.v) return;
    let op = null;
    if (t.kind === 'sol') { if (m.get(c.x, c.y) === t.v) return; op = ['t', c.x, c.y, t.v]; this.lastPaint = k + t.v; }
    else if (t.kind === 'decor') op = ['p', t.v, c.x, c.y];
    else if (t.kind === 'panneau') op = ['s', c.x, c.y, t.text || '...'];
    else if (t.kind === 'objet') op = ['i', c.x, c.y, t.v || 'potion', t.qty || 1];
    else if (t.kind === 'pnj') { const n = (this.edits[m.id] || []).filter((o) => o[0] === 'n').length; op = ['n', { id: `${m.id}:retouche${n + 1}-${c.x}-${c.y}`, x: c.x, y: c.y, sprite: t.v || 'habitant', dir: t.dir || 'down', text: (t.text || 'Bonjour !').split('\n').filter(Boolean) }]; }
    else if (t.kind === 'batiment') op = ['b', t.v || 'house', c.x, c.y, t.roof || 'red', t.name || 'Maison'];
    else if (t.kind === 'gomme') {
      const n = m.npcs.find((q) => q.x === c.x && q.y === c.y);
      if (n) op = ['-n', n.id];
      else if (m.items.some((q) => q.x === c.x && q.y === c.y)) op = ['-i', c.x, c.y];
      else if (m.deco.some((q) => q.x === c.x && q.y === c.y)) op = ['-p', c.x, c.y];
      else return;
    }
    if (!op) return;
    (this.edits[m.id] ||= []).push(op); this.saveLocal();
    applyOps(m, [op], g.world.maps);
    this.refresh(op, c);
    this.panel.querySelector('.edit-foot span').textContent = `${this.count()} retouche(s)`;
    this.drawInfo();
  }
  /** redessine ce qui a changé (une case et ses voisines ; toute la carte pour un bâtiment ou un habitant) */
  refresh(op, c) {
    const g = this.game, v = g.view, m = g.mapObj;
    if (op[0] === 'b' || op[0] === 'n' || op[0] === '-n' || op[0] === 'i' || op[0] === '-i') {
      const p = { ...g.player }; g.setMap(m.id); Object.assign(g.player, { x: p.x, y: p.y }); g.busy = true; return;
    }
    v.decoAt = new Map(); for (const d of m.deco) v.decoAt.set(d.x + ',' + d.y, d);
    // la case et ses voisines (les bords des sols se raccordent), même si elles sont dans un autre morceau de carte
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v.rebuildAt(c.x + dx, c.y + dy);
  }
  /** annule la dernière retouche (la région est reconstruite, avec les retouches restantes) */
  undo() {
    const id = this.game.mapObj.id, l = this.edits[id]; if (!l?.length) { this.game.ui.toast('Rien à annuler sur cette carte'); return; }
    l.pop(); if (!l.length) delete this.edits[id]; this.saveLocal(); this.rebuild();
  }
  rebuild() {
    const g = this.game, p = { x: g.player.x, y: g.player.y }, id = g.mapObj.id;
    const w = buildWorld(); g.world.maps = w.maps; Object.assign(g.world, { towns: w.towns, routes: w.routes, legends: w.legends, docks: w.docks, quests: w.quests });
    g._regionTerrain = null;
    for (const [mid, ops] of Object.entries(this.edits)) if (w.maps[mid]) applyOps(w.maps[mid], ops, w.maps);
    g.setMap(id); Object.assign(g.player, p); g.busy = true;
    if (this.panel) this.drawPanel();
  }
  /** texte à coller dans odyssee/js/world/retouches.js (copié dans le presse-papiers et téléchargé) */
  exporter() {
    const lines = Object.entries(this.edits).map(([id, ops]) => `  '${id}': [\n${ops.map((o) => '    ' + JSON.stringify(o) + ',').join('\n')}\n  ],`).join('\n');
    const txt = `// à coller dans RETOUCHES (odyssee/js/world/retouches.js)\n${lines}\n`;
    navigator.clipboard?.writeText(txt).catch(() => {});
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'retouches-odyssee.txt'; a.click();
    this.game.ui.toast('Retouches copiées et téléchargées');
  }
}
