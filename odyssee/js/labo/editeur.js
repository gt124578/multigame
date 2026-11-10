// odyssee/js/labo/editeur.js — l'éditeur de carte de la version test (odyssee/test/). On l'ouvre depuis le menu du labo
// (« Éditeur de carte » : vue de haut, sans dresseur) ou en jeu avec la touche B.
//
// Une palette repliable à gauche (terrain, relief, bâtiments, décor, habitants, objets, panneau) : un clic choisit le
// pinceau, ou on glisse l'élément directement sur la carte. Sur la carte, l'outil Sélection attrape ce qui s'y trouve
// (bâtiment, décor, habitant, objet) pour le déplacer à la souris, ou trace un rectangle qu'on copie, coupe, colle ou
// efface. Chaque retouche est gardée dans ce navigateur et rejouée au prochain lancement ; « Exporter » donne le texte à
// coller dans odyssee/js/world/retouches.js pour qu'elle fasse partie du jeu de tout le monde.
//
// Souris : clic gauche = outil · glisser un objet = le déplacer · clic droit (ou molette enfoncée, ou Espace) + glisser =
// se déplacer · clic droit sans bouger, Ctrl + clic ou Alt + clic = pipette (prend ce qu'il y a sur la case : bâtiment,
// décor, habitant, objet, panneau, sinon le terrain et sa hauteur) · Maj + clic au pinceau = trait droit depuis le dernier
// point · molette = zoom. Clavier : flèches / ZQSD se déplacer, V sélection, P pinceau, E gomme, I pipette, G remplissage,
// R relief, [ et ] taille du pinceau, N hauteurs affichées, 1 à 9 éléments récents, Ctrl+C / X / V, Suppr,
// Ctrl+Z / Ctrl+Y, Échap annule, Tab replie la palette.
//
// Relief (labo/terrasse.js) : élever, abaisser, aplanir ou lisser le sol au pinceau rond ; les parois (roche ou talus
// d'herbe) et les marches des chemins se refont toutes seules autour.
import * as THREE from 'three';
import { T } from '../world/tiles.js';
import { SPRITES } from '../data/sprites.js';
import { CHAR_ROWS, EL, SPRITE_UNIFORMS } from '../render/world3d.js';
import { BUILDINGS, GRAND } from '../world/mapgen.js';
import { applyOps } from '../world/retouches.js';
import { choisirModele, geometriesModele } from '../render/bati-jeu.js';
import { EMPRISES } from '../render/batiments3d.js';
import { el, esc } from '../ui/ui.js';
import { ITEMS, itemName } from '../core/items.js';
import { ASSETS } from '../assets.js';
import { terrasser, ciblesRelief, disque, H_MAX } from './terrasse.js';

const LOCAL_KEY = 'odyssee-retouches', PALETTE_KEY = 'odyssee-editeur-palette', RECENTS_KEY = 'odyssee-editeur-recents', OUTILS_KEY = 'odyssee-editeur-reglages';
const NOM_T = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
const key = (x, y) => x + ',' + y;

/* ------------------------------------------------------------------ palette ------------------------------------------ */
const SOLS = [
  [T.GRASS, 'Herbe', '#62c56b'], [T.TALL, 'Hautes herbes', '#2f9a48'], [T.DARKTALL, 'Herbes sombres', '#1f6a38'], [T.FLOWER, 'Fleurs', '#f07aa0'],
  [T.PATH, 'Chemin', '#d8b878'], [T.PAVE, 'Pavés', '#b0a8a0'], [T.SAND, 'Sable', '#f0dc98'], [T.SNOW, 'Neige', '#f4f8ff'], [T.ASH, 'Cendre', '#8a7a78'],
  [T.WATER, 'Eau', '#4a9ae8'], [T.BRIDGE, 'Pont', '#a07040'], [T.TREE, 'Arbre', '#2e6a32'], [T.PINE, 'Sapin', '#24543a'], [T.BUSH, 'Buisson', '#3c8040'],
  [T.ROCK, 'Rocher', '#8a8a8a'], [T.FENCE, 'Clôture', '#c8a070'], [T.STAIRS, 'Marche', '#b09070'], [T.CLIFF, 'Paroi de talus', '#6a7a4a'],
  [T.LEDGE, 'Rebord ↓', '#7a6040'], [T.LEDGE_E, 'Rebord →', '#7a6040'], [T.LEDGE_W, 'Rebord ←', '#7a6040'],
  [T.CUT, 'Petit arbre (Coupe)', '#5a9a3a'], [T.SMASH, 'Rocher fissuré', '#9a8070'], [T.BOULDER, 'Gros rocher (Force)', '#6a6a6a'],
  [T.FLOOR, 'Sol (intérieur)', '#c8a878'], [T.WALL, 'Mur (intérieur)', '#606878'], [T.CAVE, 'Sol de grotte', '#8a7058'], [T.CAVEWALL, 'Paroi de grotte', '#4a3a30'],
];
/** bâtiments : sorte de la carte (pour l'intérieur) et réglages de GameMap.building ; door < 0 : décor bâti sans porte */
const BATIMENTS = [
  ['house', 'Maison', {}], ['house2', 'Maison longue', {}], ['bighouse', 'Résidence', {}],
  ['house', 'Chalet', { w: 5, d: 5, door: 2, modele: 'chalet' }], ['house', 'Maison en L', { ...GRAND.maisonL }], ['house', 'Maison haute', { w: 4, d: 4, door: 1, modele: 'maisonHaute' }],
  ['bighouse', 'Grande maison', { w: 7, d: 4, door: 3, modele: 'maisonExt' }],
  ['center', 'Centre de soins', { ...GRAND.center }], ['mart', 'Boutique', { ...GRAND.mart }], ['lab', 'Laboratoire', { ...GRAND.lab, door2: undefined }],
  ['gym', 'Arène', { ...GRAND.gym, dx: undefined, dy: undefined }],
  ['bighouse', 'Auberge', { w: 6, d: 5, door: 2, modele: 'auberge' }], ['house', 'Boulangerie', { w: 4, d: 4, door: 1, modele: 'boulangerie' }],
  ['bighouse', 'Chapelle', { w: 4, d: 7, door: 1, modele: 'chapelle' }], ['bighouse', 'Mairie', { ...GRAND.mairie }], ['bighouse', 'Gare', { w: 8, d: 4, door: 3, modele: 'gare' }],
  ['house', 'Maison de thé', { w: 5, d: 5, door: 2, modele: 'maisonThe' }],
  ['tower', 'Pagode', { ...GRAND.pagode }], ['tower', 'Pavillon de temple', { ...GRAND.pavillon }], ['tower', 'Tour Cendrée', { ...GRAND.tourCendree }],
  ['tower', 'Casino', { ...GRAND.casino }], ['tower', 'Bourse', { ...GRAND.bourse }], ['tower', 'Usine', { ...GRAND.usine }],
  ['tower', 'Moulin', { w: 4, d: 4, h: 6, door: -1, modele: 'moulin' }], ['tower', 'Grange', { w: 6, d: 5, h: 4, door: -1, modele: 'grange' }],
  ['tower', 'Phare', { w: 3, d: 3, h: 8, door: -1, modele: 'phare' }], ['tower', 'Cabane de pêcheur', { w: 5, d: 4, h: 3, door: -1, modele: 'cabanePecheur' }],
  ['tower', 'Cabane de chasseur', { w: 4, d: 3, h: 3, door: -1, modele: 'cabaneChasseur' }], ['tower', 'Puits', { w: 2, d: 2, h: 2, door: -1, modele: 'puits' }],
  ['tower', 'Kiosque', { w: 4, d: 5, h: 3, door: -1, modele: 'kiosque' }], ['tower', 'Fontaine', { w: 3, d: 3, h: 2, door: -1, modele: 'fontaine' }],
  ['tower', 'Étal', { w: 2, d: 2, h: 2, door: -1, modele: 'etal' }],
].map(([kind, nom, o], i) => { const B = { ...BUILDINGS[kind], ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) }; return { id: 'b' + i, kind, nom, o: Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)), w: B.w, d: B.d }; });
const TOITS = ['red', 'blue', 'green', 'brown', 'gray', 'teal', 'purple', 'orange', 'gold'];
const RELIEFS = [['monter', 'Élever', '⬆'], ['baisser', 'Abaisser', '⬇'], ['aplanir', 'Aplanir', '▬'], ['lisser', 'Lisser', '〰']];
const CATS = [['recents', 'Récents'], ['sol', 'Terrain'], ['relief', 'Relief'], ['bat', 'Bâtiments'], ['decor', 'Décor'], ['pnj', 'Habitants'], ['objet', 'Objets'], ['panneau', 'Panneau']];

/* ---------------------------------------------- vignettes des bâtiments (modèles 3D, rendus une fois) ---------------- */
let RV = null;
function vignetteBat(B, cv) {
  const mod = choisirModele({ kind: B.kind, x: 0, y: 0, w: B.w, d: B.d, h: B.o.h ?? BUILDINGS[B.kind]?.h ?? 3, door: B.o.door ?? BUILDINGS[B.kind]?.door ?? 1, roof: 'red', modele: B.o.modele, name: B.nom }, {});
  const x = cv.getContext('2d'); cv.width = 96; cv.height = 96;
  if (!mod) { x.fillStyle = '#c05a40'; x.fillRect(20, 30, 56, 20); x.fillStyle = '#f2e6c8'; x.fillRect(24, 50, 48, 30); return; }
  if (!RV) {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true }); r.setSize(96, 96); r.setClearColor(0x000000, 0);
    RV = { r, scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500) };
  }
  const { r, scene, cam } = RV;
  scene.clear();
  const bb = new THREE.Box3();
  for (const p of geometriesModele(mod.nom, mod.o)) {
    const m0 = p.mat0;
    const mesh = new THREE.Mesh(p.geo, new THREE.MeshBasicMaterial({ map: m0.map || null, vertexColors: true, transparent: !!m0.transparent, opacity: m0.opacity ?? 1, side: m0.side, alphaTest: m0.alphaTest || 0 }));
    mesh.material.color.copy(m0.color || new THREE.Color(1, 1, 1));
    scene.add(mesh); p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox);
  }
  const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()), R = Math.max(s.x, s.y * 0.75 + s.z * 0.6) * 0.62;
  cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.updateProjectionMatrix();
  cam.position.set(c.x, c.y + 100 * Math.sin(EL), c.z + 100 * Math.cos(EL)); cam.lookAt(c);
  r.render(scene, cam);
  x.clearRect(0, 0, 96, 96); x.drawImage(r.domElement, 0, 0);
  for (const o of scene.children) o.material.dispose();
}

/* ------------------------------------------------------------------ éditeur ------------------------------------------ */
export class Editeur {
  constructor(game) {
    this.game = game; this.on = false;
    this.edits = {};            // carte → liste de retouches (gardées dans le navigateur)
    this.outil = 'select';
    this.choix = { cat: 'sol', v: T.PATH };
    this.reglages = { dir: 'down', text: 'Bonjour !', roof: 'red', name: 'Maison', qty: 1, panneau: 'NOUVEAU LIEU\nUne petite phrase.', niv: 1 };
    this.cursor = null; this.zoom = 1.6; this.cam = { x: 0, y: 0 };
    // taille du pinceau (terrain, relief), réglages du relief, éléments récents, hauteurs affichées
    this.outilsR = { rayon: 1, bord: 'roche', niveau: 1, auto: true, marches: true, hauteurs: false };
    try { Object.assign(this.outilsR, JSON.parse(localStorage.getItem(OUTILS_KEY) || '{}')); } catch (e) { /* rien */ }
    try { this.recents = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch (e) { this.recents = []; }
    this.dernier = null;   // dernière case peinte (Maj + clic : trait droit)
    this.sel = null; this.presse = null; this.coller = false; this.objSel = null;
    this.histo = []; this.refaireL = [];
    this.touches = new Set();
    try { this.paletteOuverte = JSON.parse(localStorage.getItem(PALETTE_KEY) || '{"on":true,"cats":["recents","sol","relief","bat"]}'); } catch (e) { this.paletteOuverte = { on: true, cats: ['recents', 'sol', 'relief', 'bat'] }; }
    if (!this.paletteOuverte.cats.includes('recents') && !this.paletteOuverte.vuRecents) { this.paletteOuverte.cats.unshift('recents', 'relief'); this.paletteOuverte.vuRecents = 1; }
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }
  /* ---------------- retouches gardées dans le navigateur ---------------- */
  loadLocal() {
    try { this.edits = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch (e) { this.edits = {}; }
    for (const [id, ops] of Object.entries(this.edits)) if (this.game.world.maps[id]) applyOps(this.game.world.maps[id], ops, this.game.world.maps);
  }
  saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.edits)); } catch (e) { this.game.ui.toast('Stockage du navigateur plein'); } }
  count() { return Object.values(this.edits).reduce((a, l) => a + l.length, 0); }
  get m() { return this.game.mapObj; }

  /* ---------------- ouverture / fermeture ---------------- */
  toggle() { if (this.seul) return; if (this.on) this.close(); else this.open(); }
  /** seul : ouvert depuis le menu du labo (pas de partie à reprendre) ; retour : appelé en quittant */
  open({ seul = false, retour = null } = {}) {
    const g = this.game; if (!g.state || this.on || g.bv.alive) return;
    this.on = true; this.seul = seul; this.retour = retour;
    g.busy = true; g.figer = true; g.input.clearDirs?.();
    this.cam = { x: g.player.x, y: g.player.y }; g.camLibre = this.cam;
    if (g.hud?.root) g.hud.root.style.visibility = 'hidden';
    for (const q of ['.labo-bar', '.keybar']) document.querySelector(q)?.style.setProperty('display', 'none');
    g.view.sansFondu = true;
    this.root = el('div', 'ed'); g.ui.root.appendChild(this.root);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.svg.setAttribute('class', 'ed-svg');
    for (const k of ['sel', 'cur', 'fantome']) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon'); p.setAttribute('class', 'ed-' + k); this.svg.appendChild(p); this['p' + k] = p; }
    g.ui.root.appendChild(this.svg);
    this.calque = el('canvas', 'ed-calque'); g.ui.root.appendChild(this.calque);
    this.dessiner();
    const cv = g.view.renderer.domElement; this.cv = cv;
    this.ev = {
      move: (e) => this.surMove(e), down: (e) => this.surDown(e), up: (e) => this.surUp(e),
      wheel: (e) => { if (e.target !== cv) return; e.preventDefault(); this.zoomer(this.zoom * (e.deltaY > 0 ? 1.12 : 1 / 1.12), e); },
      ctx: (e) => { if (e.target === cv) e.preventDefault(); },
      key: (e) => this.surKey(e, true), keyup: (e) => this.surKey(e, false),
    };
    addEventListener('pointermove', this.ev.move); cv.addEventListener('pointerdown', this.ev.down); addEventListener('pointerup', this.ev.up);
    cv.addEventListener('wheel', this.ev.wheel, { passive: false }); cv.addEventListener('contextmenu', this.ev.ctx);
    addEventListener('keydown', this.ev.key, true); addEventListener('keyup', this.ev.keyup, true);
    this.popInput = g.input.push(() => {});   // le jeu ne reçoit plus les touches (menus, course…)
    this.setZoom(this.zoom);
    let t0 = performance.now();
    this.raf = requestAnimationFrame(this.frame = (t) => { const dt = Math.min(0.1, (t - t0) / 1000); t0 = t; this.tick(dt); this.raf = requestAnimationFrame(this.frame); });
  }
  close() {
    if (!this.on) return;
    const g = this.game, cv = this.cv, v = g.view;
    this.on = false; cancelAnimationFrame(this.raf); this.popInput?.();
    removeEventListener('pointermove', this.ev.move); cv.removeEventListener('pointerdown', this.ev.down); removeEventListener('pointerup', this.ev.up);
    cv.removeEventListener('wheel', this.ev.wheel); cv.removeEventListener('contextmenu', this.ev.ctx);
    removeEventListener('keydown', this.ev.key, true); removeEventListener('keyup', this.ev.keyup, true);
    this.root?.remove(); this.svg?.remove(); this.ghost?.remove(); this.calque?.remove();
    if (g.hud?.root) g.hud.root.style.visibility = '';
    for (const q of ['.labo-bar', '.keybar']) document.querySelector(q)?.style.removeProperty('display');
    v.sansFondu = false;
    g.camLibre = null; g.figer = false;
    for (const k of ['player', 'follower']) { const a = v.actors.get(k); if (a) { a.mesh.visible = true; if (a.shadow) a.shadow.visible = true; } }
    this.zoom = 1.6; v.zoom = 1; v.rayon = 2; SPRITE_UNIFORMS.uEch.value = 1; v.lastChunk = null; const s = new THREE.Vector2(); v.renderer.getSize(s); v.resize(s.x, s.y);
    const retour = this.retour; this.retour = null;
    if (this.seul) { this.seul = false; g.busy = false; retour?.(); return; }
    // le dresseur se pose sur la case praticable la plus proche du point de vue
    const p = g.player, m = g.mapObj, ok = (t) => [T.GRASS, T.PATH, T.SAND, T.PAVE, T.FLOOR, T.CAVE, T.SNOW, T.ASH, T.TALL, T.FLOWER].includes(t);
    p.x = Math.round(this.cam.x); p.y = Math.round(this.cam.y);
    if (!ok(m.get(p.x, p.y))) {
      for (let r = 1; r < 16; r++) { let done = false; for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r; dx++) if (ok(m.get(p.x + dx, p.y + dy))) { p.x += dx; p.y += dy; done = true; break; } if (done) break; }
    }
    g.setMap(m.id);
    g.busy = false;
  }
  setZoom(z) {
    const v = this.game.view; this.zoom = Math.max(0.6, Math.min(3, z)); v.zoom = this.zoom;
    v.rayon = Math.max(2, Math.ceil(1.3 * this.zoom + 0.7)); v.lastChunk = null;
    SPRITE_UNIFORMS.uEch.value = this.zoom;   // personnages, arbres et décor rapetissent avec la vue
    const s = new THREE.Vector2(); v.renderer.getSize(s); v.resize(s.x, s.y);
    const zl = this.root?.querySelector('[data-zoom]'); if (zl) zl.textContent = Math.round(100 / this.zoom) + ' %';
  }
  /** zoom vers la souris : le point visé reste sous le curseur */
  zoomer(z, e) {
    const avant = e && this.sol(e); this.setZoom(z);
    if (avant) { this.game.view.update(0, this.cam.x, this.cam.y); const apres = this.sol(e); if (apres) { this.cam.x += avant.x - apres.x; this.cam.y += avant.z - apres.z; } }
  }

  /* ---------------- boucle : déplacement au clavier, curseur ---------------- */
  tick(dt) {
    const k = this.touches, n = 22 * this.zoom * dt * (k.has('ShiftLeft') ? 2.5 : 1);
    if (k.has('ArrowLeft') || k.has('KeyA')) this.cam.x -= n;
    if (k.has('ArrowRight') || k.has('KeyD')) this.cam.x += n;
    if (k.has('ArrowUp') || k.has('KeyW')) this.cam.y -= n;
    if (k.has('ArrowDown') || k.has('KeyS')) this.cam.y += n;
    const m = this.m; this.cam.x = Math.max(-4, Math.min(m.w + 4, this.cam.x)); this.cam.y = Math.max(-4, Math.min(m.h + 4, this.cam.y));
    this.dessinerSvg(); this.dessinerHauteurs();
    if (this.aFaire && performance.now() - this.aFaire.t > 60) this.vider();
  }

  /* ---------------- souris ---------------- */
  sol(e) {
    const g = this.game, r = this.cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    g.view.camera.updateMatrixWorld(); this.ray.setFromCamera(ndc, g.view.camera);
    const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(this.plane, p) ? p : null;
  }
  caseDe(e) { const p = this.sol(e); return p ? { x: Math.floor(p.x), y: Math.floor(p.z), fx: p.x, fy: p.z } : null; }
  surCarte(e) { return e.target === this.cv || document.elementFromPoint(e.clientX, e.clientY) === this.cv; }
  /** ce qu'il y a sur la case (habitant, objet, décor, bâtiment) */
  objetEn(x, y) {
    const m = this.m;
    const n = m.npcs.find((q) => q.x === x && q.y === y); if (n) return { type: 'pnj', o: n, x, y, w: 1, d: 1 };
    const it = m.items.find((q) => q.x === x && q.y === y); if (it) return { type: 'objet', o: it, x, y, w: 1, d: 1 };
    const d = m.deco.find((q) => q.x === x && q.y === y && q.k !== 'asph' && q.k !== 'koi'); if (d) return { type: 'decor', o: d, x, y, w: 1, d: 1 };
    const b = m.buildings.find((q) => x >= q.x && y >= q.y && x < q.x + q.w && y < q.y + q.d); if (b) return { type: 'bat', o: b, x: b.x, y: b.y, w: b.w, d: b.d };
    return null;
  }
  surDown(e) {
    if (e.target !== this.cv) return;
    const c = this.caseDe(e); if (!c) return;
    this.cv.setPointerCapture?.(e.pointerId);
    // se déplacer : molette enfoncée, clic droit, Espace ou outil Main
    // Ctrl + clic droit : pipette tout de suite
    if (e.button === 2 && (e.ctrlKey || e.metaKey || e.altKey)) { e.preventDefault(); this.pipette(c); return; }
    if (e.button === 1 || e.button === 2 || this.touches.has('Space') || this.outil === 'main') {
      const p = this.sol(e); this.drag = { type: 'pan', p0: p, x0: e.clientX, y0: e.clientY, droit: e.button === 2 }; e.preventDefault(); return;
    }
    if (e.button !== 0) return;
    // pipette : Ctrl + clic, Alt + clic (sur Mac, Ctrl + clic est aussi le clic droit)
    if (e.ctrlKey || e.metaKey || e.altKey) { this.pipette(c); return; }
    if (this.coller) { this.collerEn(c.x, c.y); if (!e.shiftKey) this.finColler(); return; }
    if (this.outil === 'pipette') { this.pipette(c); return; }
    if (this.outil === 'gomme') { this.gommer(c); this.drag = { type: 'gomme' }; return; }
    if (this.outil === 'remplir') { this.remplirZone(c); return; }
    if (this.outil === 'pinceau') {
      if (this.choix.cat === 'sol' || this.choix.cat === 'relief') {
        this.debutGroupe();
        // relief : Maj fait l'inverse (abaisser au lieu d'élever) ; terrain : Maj + clic trace un trait droit
        const R = this.outilsR, relief = this.choix.cat === 'relief', mode = relief && e.shiftKey ? ({ monter: 'baisser', baisser: 'monter' }[this.choix.v] || this.choix.v) : this.choix.v;
        this.drag = { type: 'peinture', vu: new Set(), base: new Map(), mode, niveau: R.auto && this.choix.v === 'aplanir' ? this.m.height(c.x, c.y) : R.niveau, der: null };
        // Maj + clic : trait droit depuis la dernière case peinte
        if (!relief && e.shiftKey && this.dernier && this.dernier.map === this.m.id) this.trait(this.dernier, c);
        else this.peindre(c);
      }
      else this.poser(this.choix, c);
      return;
    }
    // sélection : attraper l'objet de la case, sinon tracer un rectangle
    const o = this.objetEn(c.x, c.y);
    if (o) { this.drag = { type: 'objet', o, dx: c.x - o.x, dy: c.y - o.y, x0: e.clientX, y0: e.clientY, bouge: false }; this.selectObjet(o); return; }
    this.objSel = null; this.drag = { type: 'rect', c0: c }; this.sel = { x: c.x, y: c.y, w: 1, h: 1 }; this.majInfo();
  }
  surMove(e) {
    const D = this.drag;
    if (D?.type === 'palette') { this.bougerFantome(e); return; }
    if (!this.on) return;
    if (D?.type === 'pan') {
      const p = this.sol(e); if (p && D.p0) { this.cam.x += D.p0.x - p.x; this.cam.y += D.p0.z - p.z; this.game.view.update(0, this.cam.x, this.cam.y); }
      if (Math.hypot(e.clientX - D.x0, e.clientY - D.y0) > 4) D.bouge = true;
      return;
    }
    if (e.target !== this.cv && !D) { this.cursor = null; return; }
    const c = this.caseDe(e); if (!c) return;
    this.cursor = c; this.majInfo();
    if (D?.type === 'peinture') { if (D.der && Math.abs(D.der.x - c.x) + Math.abs(D.der.y - c.y) > 1) this.trait(D.der, c); else this.peindre(c); }
    else if (D?.type === 'gomme') this.gommer(c);
    else if (D?.type === 'rect') { const a = D.c0; this.sel = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(a.x - c.x) + 1, h: Math.abs(a.y - c.y) + 1 }; }
    else if (D?.type === 'objet' && Math.hypot(e.clientX - D.x0, e.clientY - D.y0) > 5) D.bouge = true;
  }
  surUp(e) {
    const D = this.drag; this.drag = null;
    if (!D) return;
    if (D.type === 'palette') { this.lacherPalette(e, D); return; }
    if (D.type === 'pan') { if (D.droit && !D.bouge) { const c = this.caseDe(e); if (this.coller) this.finColler(); else if (c) this.pipette(c); } return; }
    if (D.type === 'peinture') { this.vider(); this.finGroupe(); if (D.der) this.dernier = { ...D.der, map: this.m.id }; return; }
    if (D.type === 'rect') { if (this.sel && this.sel.w * this.sel.h <= 1 && !e.shiftKey) this.sel = null; this.majInfo(); this.majBarre(); return; }
    if (D.type === 'objet' && D.bouge && this.cursor) {
      const o = D.o, nx = this.cursor.x - D.dx, ny = this.cursor.y - D.dy;
      if (nx === o.x && ny === o.y) return;
      if (o.type === 'bat' && this.occupe({ x: nx, y: ny, w: o.w, d: o.d }, o.o)) { this.game.ui.toast('Il y a déjà un bâtiment ici'); return; }
      const op = o.type === 'bat' ? ['mb', o.x, o.y, nx, ny] : o.type === 'decor' ? ['mp', o.x, o.y, nx, ny] : o.type === 'objet' ? ['mi', o.x, o.y, nx, ny] : ['mn', o.o.id, nx, ny];
      this.faire([op], o.type === 'bat' && /center/.test(o.o.kind) ? 'Centre déplacé (le vol arrive encore à l\'ancienne porte)' : null);
      const n = this.objetEn(nx + D.dx, ny + D.dy); if (n) this.selectObjet(n);
    }
  }
  surKey(e, bas) {
    if (!this.on) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (!bas) { this.touches.delete(e.code); return; }
    this.touches.add(e.code);
    const ctrl = e.ctrlKey || e.metaKey, c = e.code;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (ctrl && c === 'KeyZ') { stop(); if (e.shiftKey) this.refaire(); else this.annuler(); return; }
    if (ctrl && c === 'KeyY') { stop(); this.refaire(); return; }
    if (ctrl && c === 'KeyC') { stop(); this.copier(); return; }
    if (ctrl && c === 'KeyX') { stop(); this.couper(); return; }
    if (ctrl && c === 'KeyV') { stop(); this.debutColler(); return; }
    if (c === 'Delete' || c === 'Backspace') { stop(); this.effacer(); return; }
    if (c === 'Escape') { stop(); if (this.coller) this.finColler(); else if (this.sel || this.objSel) { this.sel = null; this.objSel = null; this.majInfo(); this.majBarre(); } return; }
    if (c === 'Tab') { stop(); this.replier(); return; }
    if (ctrl) return;
    const outils = { KeyV: 'select', KeyP: 'pinceau', KeyE: 'gomme', KeyI: 'pipette', KeyH: 'main', KeyG: 'remplir' };
    if (outils[c]) { stop(); this.setOutil(outils[c]); return; }
    if (c === 'KeyR') { stop(); this.choisir({ cat: 'relief', v: this.choix.cat === 'relief' ? this.choix.v : 'monter' }); return; }
    if (c === 'BracketLeft' || c === 'BracketRight' || c === 'Comma' || c === 'Period') { stop(); this.setRayon(this.outilsR.rayon + (c === 'BracketRight' || c === 'Period' ? 1 : -1)); return; }
    if (c === 'KeyN') { stop(); this.outilsR.hauteurs = !this.outilsR.hauteurs; this.gardeOutils(); this.majBarre(); return; }
    if (c === 'Equal' || c === 'NumpadAdd' || e.key === '+' || e.key === '=') { stop(); this.setZoom(this.zoom / 1.2); return; }
    if (c === 'Minus' || c === 'NumpadSubtract' || e.key === '-') { stop(); this.setZoom(this.zoom * 1.2); return; }
    if (/^Digit[1-9]$/.test(c)) { const it = this.recents[+c.slice(5) - 1]; if (it) { stop(); this.choisir(it); } return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(c)) stop();
  }

  /* ---------------- interface ---------------- */
  dessiner() {
    const g = this.game, cartes = Object.values(g.world.maps).filter((m) => !/^domaine/.test(m.id)).sort((a, b) => (a.id === 'monde' ? -1 : b.id === 'monde' ? 1 : (a.name || a.id).localeCompare(b.name || b.id)));
    const outils = [['select', '⬚', 'Sélection (V) : attraper et déplacer, ou tracer un rectangle'], ['pinceau', '🖌', 'Pinceau (P) : poser l\'élément choisi (Maj + clic : trait droit)'], ['remplir', '🪣', 'Remplissage (G) : le terrain choisi dans toute la zone pareille autour de la case'], ['gomme', '🧽', 'Gomme (E) : retirer ce qui est posé'], ['pipette', '💧', 'Pipette (I, ou Ctrl / Alt + clic, ou clic droit) : prendre ce qu\'il y a sur la case'], ['main', '✋', 'Main (H) : se déplacer']];
    this.root.innerHTML = `
      <div class="ed-barre">
        <button type="button" data-quit title="Quitter l'éditeur">◀ ${this.seul ? 'Menu' : 'Jeu'}</button>
        <select data-carte title="Carte">${cartes.map((m) => `<option value="${esc(m.id)}"${m === this.m ? ' selected' : ''}>${esc(m.name || m.id)}${m.id !== m.name ? ' · ' + esc(m.id) : ''}</option>`).join('')}</select>
        <span class="ed-sep"></span>
        ${outils.map(([k, i, t]) => `<button type="button" data-outil="${k}" title="${esc(t)}">${i}</button>`).join('')}
        <span class="ed-sep"></span>
        <button type="button" data-act="copier" title="Copier la sélection (Ctrl+C)">📋 Copier</button>
        <button type="button" data-act="couper" title="Couper la sélection (Ctrl+X)">✂️ Couper</button>
        <button type="button" data-act="coller" title="Coller (Ctrl+V), puis cliquer sur la carte">📥 Coller</button>
        <button type="button" data-act="effacer" title="Effacer la sélection ou l'objet choisi (Suppr)">🗑</button>
        <span class="ed-sep"></span>
        <button type="button" data-act="annuler" title="Annuler (Ctrl+Z)">↶</button><button type="button" data-act="refaire" title="Rétablir (Ctrl+Y)">↷</button>
        <span class="ed-sep"></span>
        <label class="ed-rayon" title="Taille du pinceau : terrain et relief ( [ et ] )">◯ <input type="range" min="1" max="15" data-rayon><b data-rayon-n></b></label>
        <button type="button" data-act="hauteurs" title="Afficher les hauteurs de chaque case (N)">⛰</button>
        <span class="ed-sep"></span>
        <button type="button" data-act="zoom-" title="Voir de plus haut">−</button><span class="ed-zoom" data-zoom></span><button type="button" data-act="zoom+" title="Voir de plus près">+</button>
        <span class="ed-grow"></span>
        <span class="ed-compte" data-compte></span>
        <button type="button" data-act="exporter" title="Copier et télécharger les retouches (à coller dans retouches.js)">⇩ Exporter</button>
        <button type="button" data-act="raz" title="Effacer toutes les retouches de ce navigateur">Tout effacer</button>
      </div>
      <div class="ed-palette">
        <div class="ed-ph"><button type="button" data-replier title="Replier la palette (Tab)">◀</button><input class="ed-filtre" placeholder="Chercher (maison, lampadaire, sapin…)"></div>
        <div class="ed-cats">${CATS.map(([k, n]) => `<details data-cat="${k}"${this.paletteOuverte.cats.includes(k) ? ' open' : ''}><summary>${n}</summary><div class="ed-grille" data-grille="${k}"></div></details>`).join('')}</div>
        <div class="ed-reglages" data-reglages></div>
      </div>
      <button type="button" class="ed-deplier" data-deplier title="Afficher la palette (Tab)">▶ Palette</button>
      <div class="ed-info" data-info></div>`;
    const R = this.root;
    R.querySelector('[data-quit]').onclick = () => this.close();
    R.querySelector('[data-carte]').onchange = (e) => this.changerCarte(e.target.value);
    R.querySelectorAll('[data-outil]').forEach((b) => (b.onclick = () => this.setOutil(b.dataset.outil)));
    const acts = { copier: () => this.copier(), couper: () => this.couper(), coller: () => this.debutColler(), effacer: () => this.effacer(), annuler: () => this.annuler(), refaire: () => this.refaire(),
      hauteurs: () => { this.outilsR.hauteurs = !this.outilsR.hauteurs; this.gardeOutils(); this.majBarre(); },
      'zoom-': () => this.setZoom(this.zoom * 1.25), 'zoom+': () => this.setZoom(this.zoom / 1.25), exporter: () => this.exporter(),
      raz: () => { if (confirm('Effacer toutes les retouches de ce navigateur ? (la carte revient comme au départ au prochain lancement)')) { this.edits = {}; this.saveLocal(); this.histo = []; this.refaireL = []; this.majBarre(); this.game.ui.toast('Retouches effacées : relance le labo pour revoir la carte d\'origine'); } } };
    R.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => acts[b.dataset.act]()));
    R.querySelector('[data-replier]').onclick = () => this.replier();
    const ry = R.querySelector('[data-rayon]'); ry.value = this.outilsR.rayon; ry.oninput = () => this.setRayon(+ry.value);
    R.querySelector('[data-deplier]').onclick = () => this.replier();
    R.querySelectorAll('details[data-cat]').forEach((d) => d.addEventListener('toggle', () => {
      const k = d.dataset.cat, L = this.paletteOuverte.cats.filter((q) => q !== k); if (d.open) { L.push(k); this.remplir(k); }
      this.paletteOuverte.cats = L; this.gardePalette();
    }));
    const f = R.querySelector('.ed-filtre');
    f.oninput = () => {
      const q = f.value.trim().toLowerCase();
      for (const d of R.querySelectorAll('details[data-cat]')) {
        if (q) { this.remplir(d.dataset.cat); d.open = true; }
        let n = 0; for (const b of d.querySelectorAll('[data-v]')) { const h = !q || b.title.toLowerCase().includes(q); b.hidden = !h; if (h) n++; }
        d.hidden = q && !n;
      }
    };
    for (const i of R.querySelectorAll('input, textarea, select')) i.addEventListener('keydown', (e) => e.stopPropagation());
    for (const d of R.querySelectorAll('details[open]')) this.remplir(d.dataset.cat);
    this.root.classList.toggle('replie', !this.paletteOuverte.on);
    this.majBarre(); this.majReglages(); this.majInfo();
  }
  gardePalette() { try { localStorage.setItem(PALETTE_KEY, JSON.stringify(this.paletteOuverte)); } catch (e) { /* plein */ } }
  replier() { this.paletteOuverte.on = !this.paletteOuverte.on; this.root.classList.toggle('replie', !this.paletteOuverte.on); this.gardePalette(); }
  /** remplit une catégorie de la palette (à la première ouverture) */
  remplir(cat) {
    const G = this.root.querySelector(`[data-grille="${cat}"]`); if (!G || G.dataset.ok) return; G.dataset.ok = 1;
    const v = this.game.view, S = v.S, chars = v.charsCanvas;
    const items = [];
    if (cat === 'sol') for (const [t, n, c] of SOLS) items.push({ v: t, nom: n, ico: `<i class="ed-pastille" style="background:${c}"></i>` });
    if (cat === 'relief') for (const [k, n, i] of RELIEFS) items.push({ v: k, nom: n, ico: `<b class="ed-niv">${i}</b>` });
    if (cat === 'recents') { this.majRecents(G); return; }
    if (cat === 'bat') for (const B of BATIMENTS) items.push({ v: B.id, nom: `${B.nom} (${B.w}×${B.d})`, ico: '<canvas data-bat></canvas>' });
    if (cat === 'decor') {
      const props = [...new Set([...Object.keys(SPRITES.nature || {}), ...Object.keys(SPRITES.mobilier || {}), ...Object.keys(SPRITES.deco || {})])].filter((k) => !/front|tuft|bang|itemball/.test(k)).sort();
      for (const k of props) items.push({ v: k, nom: k, ico: '<canvas data-deco></canvas>' });
    }
    if (cat === 'pnj') for (const k of Object.keys(CHAR_ROWS).filter((q) => !q.startsWith('poke:')).sort()) items.push({ v: k, nom: k, ico: '<canvas data-char></canvas>' });
    if (cat === 'objet') for (const k of Object.keys(ITEMS)) items.push({ v: k, nom: itemName(k), ico: `<img loading="lazy" src="${ASSETS.item(k)}" alt="">` });
    if (cat === 'panneau') items.push({ v: 'sign', nom: 'Panneau', ico: '<b class="ed-niv">🪧</b>' });
    G.innerHTML = items.map((it) => `<button type="button" data-v="${esc(String(it.v))}" title="${esc(it.nom)}">${it.ico}<span>${esc(it.nom)}</span></button>`).join('');
    const vign = [];
    for (const b of G.querySelectorAll('[data-v]')) {
      const val = cat === 'sol' ? +b.dataset.v : b.dataset.v;
      b.addEventListener('pointerdown', (e) => this.prendrePalette(e, { cat, v: val }, b));
      const cv = b.querySelector('canvas'); if (!cv) continue;
      const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
      if (cv.hasAttribute('data-deco')) { const r = S?.rects?.[val]; if (r) { const sc = Math.min(48 / r.w, 48 / r.h); cv.width = 48; cv.height = 48; x.imageSmoothingEnabled = false; x.drawImage(S.canvas, r.x, r.y, r.w, r.h, (48 - r.w * sc) / 2, 48 - r.h * sc, r.w * sc, r.h * sc); } }
      else if (cv.hasAttribute('data-char') && chars) { const row = CHAR_ROWS[val]; if (row != null) { cv.width = 64; cv.height = 64; x.drawImage(chars, 64, row * 64, 64, 64, 0, 0, 64, 64); } }
      else if (cv.hasAttribute('data-bat')) vign.push([BATIMENTS.find((q) => q.id === val), cv]);
    }
    // les bâtiments : un modèle 3D rendu par vignette, petit à petit (pas de saccade)
    const suite = () => { const p = vign.shift(); if (!p) return; try { vignetteBat(p[0], p[1]); } catch (e) { console.warn('vignette', p[0].nom, e); } setTimeout(suite, 0); };
    suite();
    this.majPalette();
  }
  majPalette() {
    for (const b of this.root.querySelectorAll('.ed-grille [data-v]')) {
      const cat = b.closest('[data-grille]').dataset.grille;
      if (cat === 'recents') { b.classList.toggle('on', b.dataset.i === '0'); continue; }
      const val = cat === 'sol' ? +b.dataset.v : b.dataset.v;
      b.classList.toggle('on', this.choix.cat === cat && this.choix.v === val);
    }
  }
  majBarre() {
    const R = this.root; if (!R) return;
    R.querySelectorAll('[data-outil]').forEach((b) => b.classList.toggle('on', b.dataset.outil === this.outil));
    R.querySelector('[data-act="coller"]').classList.toggle('on', this.coller);
    R.querySelector('[data-act="coller"]').disabled = !this.presse;
    for (const k of ['copier', 'couper']) R.querySelector(`[data-act="${k}"]`).disabled = !this.sel;
    R.querySelector('[data-act="effacer"]').disabled = !this.sel && !this.objSel;
    R.querySelector('[data-act="annuler"]').disabled = !this.histo.length;
    R.querySelector('[data-act="refaire"]').disabled = !this.refaireL.length;
    R.querySelector('[data-compte]').textContent = `${this.count()} retouche(s)`;
    R.querySelector('[data-zoom]').textContent = Math.round(100 / this.zoom) + ' %';
    R.querySelector('[data-rayon-n]').textContent = this.outilsR.rayon; R.querySelector('[data-rayon]').value = this.outilsR.rayon;
    R.querySelector('[data-act="hauteurs"]').classList.toggle('on', !!this.outilsR.hauteurs);
    if (this.calque) this.calque.style.display = this.outilsR.hauteurs ? '' : 'none';
    this.cv && (this.cv.style.cursor = this.coller ? 'copy' : { main: 'grab', pinceau: 'crosshair', gomme: 'not-allowed', pipette: 'crosshair', remplir: 'cell' }[this.outil] || 'default');
  }
  majReglages() {
    const R = this.root?.querySelector('[data-reglages]'); if (!R) return;
    const c = this.choix, r = this.reglages;
    let h = '';
    if (c.cat === 'pnj') h = `<label>Regard <select data-f="dir">${['down', 'up', 'left', 'right'].map((d) => `<option${d === r.dir ? ' selected' : ''}>${d}</option>`).join('')}</select></label><label>Ce qu'il dit (une phrase par ligne)<textarea data-f="text" rows="3">${esc(r.text)}</textarea></label>`;
    else if (c.cat === 'panneau') h = `<label>Texte du panneau<textarea data-f="panneau" rows="3">${esc(r.panneau)}</textarea></label>`;
    else if (c.cat === 'objet') h = `<label>Quantité <input data-f="qty" type="number" min="1" value="${r.qty}"></label>`;
    else if (c.cat === 'bat') h = `<label>Toit <select data-f="roof">${TOITS.map((k) => `<option${k === r.roof ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label>Nom <input data-f="name" value="${esc(r.name)}"></label><small>On le pose par le milieu de sa façade ; on entre par la porte (un intérieur de maison est créé).</small>`;
    else if (c.cat === 'relief') {
      const R2 = this.outilsR;
      h = `<label>Bord <select data-o="bord"><option value="roche"${R2.bord === 'roche' ? ' selected' : ''}>Roche (falaise de pierre)</option><option value="herbe"${R2.bord === 'herbe' ? ' selected' : ''}>Talus d'herbe</option></select></label>
        <label class="ed-coche"><input type="checkbox" data-o="marches"${R2.marches ? ' checked' : ''}> Marches là où un chemin descend</label>
        ${c.v === 'aplanir' ? `<label class="ed-coche"><input type="checkbox" data-o="auto"${R2.auto ? ' checked' : ''}> Hauteur de la case cliquée</label><label>Sinon, niveau <input data-o="niveau" type="number" min="0" max="${H_MAX}" value="${R2.niveau}"></label>` : ''}
        <small>Pinceau rond (taille : [ et ]). ${c.v === 'monter' || c.v === 'baisser' ? 'Un niveau par coup de pinceau ; Maj + clic fait l\'inverse. ' : ''}Sous un bord sud, la paroi (une case par niveau) se pose toute seule ; on passe d'un niveau à l'autre par une marche.</small>`;
    }
    else if (c.cat === 'sol') h = '<small>Pinceau rond (taille : [ et ]) · Maj + clic : trait droit · 🪣 (G) : remplir une zone.</small>';
    R.innerHTML = `<div class="ed-choix">Pinceau : <b>${esc(this.nomChoix())}</b></div>${h}`;
    R.querySelectorAll('[data-o]').forEach((i) => { i.addEventListener('keydown', (e) => e.stopPropagation()); i.oninput = i.onchange = () => { const k = i.dataset.o; this.outilsR[k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? Math.max(0, Math.min(H_MAX, +i.value || 0)) : i.value; this.gardeOutils(); }; });
    R.querySelectorAll('[data-f]').forEach((i) => { i.addEventListener('keydown', (e) => e.stopPropagation()); i.oninput = i.onchange = () => { r[i.dataset.f] = i.type === 'number' ? Math.max(1, +i.value || 1) : i.value; }; });
  }
  nomChoix() {
    const c = this.choix;
    if (c.cat === 'sol') return SOLS.find((q) => q[0] === c.v)?.[1] || NOM_T[c.v] || '?';
    if (c.cat === 'relief') return `Relief : ${RELIEFS.find((q) => q[0] === c.v)?.[1] || c.v}`;
    if (c.cat === 'bat') return this.batDe(c)?.nom || '?';
    if (c.cat === 'objet') return itemName(c.v);
    if (c.cat === 'panneau') return 'Panneau';
    return String(c.v);
  }
  majInfo() {
    const I = this.root?.querySelector('[data-info]'); if (!I) return;
    const m = this.m, c = this.cursor;
    let h = `<b>${esc(m.name || m.id)}</b>`;
    if (c && m.in(c.x, c.y)) {
      const z = m.outdoor ? m.zoneAt(c.x, c.y) : null, o = this.objetEn(c.x, c.y);
      h += ` · case <b>${c.x}, ${c.y}</b> · ${esc(NOM_T[m.get(c.x, c.y)] || '?')} · hauteur ${m.height(c.x, c.y)}${z?.name ? ' · ' + esc(z.name) : ''}${o ? ' · ' + esc(this.nomObjet(o)) : ''}`;
    }
    if (this.sel) h += ` · sélection <b>${this.sel.w} × ${this.sel.h}</b>`;
    if (this.objSel) h += ` · choisi : <b>${esc(this.nomObjet(this.objSel))}</b>`;
    if (this.coller) h += ' · <b>clic : coller ici</b> (Maj : coller plusieurs fois, Échap : arrêter)';
    I.innerHTML = h + '<span class="ed-aide">Ctrl / Alt + clic ou clic droit : pipette · Maj + clic : trait droit · [ ] : taille · clic droit / Espace + glisser : se déplacer · molette : zoom · Tab : palette</span>';
  }
  nomObjet(o) {
    if (o.type === 'bat') return `${o.o.name || o.o.label || o.o.modele || o.o.kind} (bâtiment ${o.o.w}×${o.o.d})`;
    if (o.type === 'pnj') return `habitant ${o.o.id}`;
    if (o.type === 'objet') return `objet ${itemName(o.o.item)}`;
    return `décor ${o.o.k}`;
  }
  setOutil(k) { this.outil = k; if (k !== 'select') { this.objSel = null; } this.finColler(); this.majBarre(); this.majInfo(); }
  selectObjet(o) { this.objSel = o; this.sel = null; this.majInfo(); this.majBarre(); }
  changerCarte(id) {
    const g = this.game, m = g.world.maps[id]; if (!m) return;
    g.player.x = Math.floor(m.w / 2); g.player.y = Math.floor(m.h / 2);
    g.setMap(id); g.busy = true;
    this.cam.x = g.player.x; this.cam.y = g.player.y; this.sel = null; this.objSel = null; this.histo = []; this.refaireL = [];
    this.majInfo(); this.majBarre();
  }

  /* ---------------- palette : choisir ou glisser sur la carte ---------------- */
  prendrePalette(e, item, btn) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.drag = { type: 'palette', item, btn, x0: e.clientX, y0: e.clientY, bouge: false };
  }
  bougerFantome(e) {
    const D = this.drag;
    if (!D.bouge && Math.hypot(e.clientX - D.x0, e.clientY - D.y0) > 6) {
      D.bouge = true;
      this.ghost = el('div', 'ed-ghost', D.btn.innerHTML); document.body.appendChild(this.ghost);
      const src = D.btn.querySelector('canvas'), dst = this.ghost.querySelector('canvas'); if (src && dst) { dst.width = src.width; dst.height = src.height; dst.getContext('2d').drawImage(src, 0, 0); }
    }
    if (!D.bouge) return;
    this.ghost.style.left = e.clientX + 'px'; this.ghost.style.top = e.clientY + 'px';
    this.cursor = this.surCarte(e) ? this.caseDe(e) : null;
    this.ghost.classList.toggle('dessus', !!this.cursor);
  }
  lacherPalette(e, D) {
    this.ghost?.remove(); this.ghost = null;
    if (!D.bouge) { this.choisir(D.item); return; }
    if (!this.surCarte(e)) return;
    const c = this.caseDe(e); if (!c) return;
    this.choisir(D.item, false);
    if (D.item.cat === 'sol' || D.item.cat === 'relief') { this.debutGroupe(); this.drag = { type: 'peinture', vu: new Set(), base: new Map(), mode: D.item.v, niveau: this.outilsR.niveau }; this.peindre(c); this.vider(); this.finGroupe(); this.drag = null; }
    else this.poser(D.item, c);
  }
  /** emprise de l'élément choisi (pour le curseur) et sa case de pose (bâtiment : par le milieu de sa façade) */
  emprise(item, c) {
    if (item.cat === 'bat') { const B = this.batDe(item); return { x: c.x - Math.floor(B.w / 2), y: c.y - B.d + 1, w: B.w, d: B.d }; }
    if ((item.cat === 'sol' || item.cat === 'relief') && this.outilsR.rayon > 1) { const r = this.outilsR.rayon - 1; return { x: c.x - r, y: c.y - r, w: 2 * r + 1, d: 2 * r + 1, rond: true }; }
    return { x: c.x, y: c.y, w: 1, d: 1 };
  }
  /** un bâtiment (autre que sauf) occupe-t-il ce rectangle ? */
  occupe(r, sauf = null) { return this.m.buildings.some((b) => b !== sauf && r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.d && b.y < r.y + r.d); }
  /** l'opération qui pose un élément de la palette sur une case */
  opPour(item, c) {
    const r = this.reglages, m = this.m;
    if (item.cat === 'sol') return ['t', c.x, c.y, item.v];
    if (item.cat === 'relief') return ['h', c.x, c.y, item.v, item.v > 0 ? 1 : 0];
    if (item.cat === 'decor') return item.o ? ['p', item.v, c.x, c.y, item.bloque ?? true, item.o] : ['p', item.v, c.x, c.y];
    if (item.cat === 'panneau') return ['s', c.x, c.y, r.panneau || '...'];
    if (item.cat === 'objet') return ['i', c.x, c.y, item.v, r.qty || 1];
    if (item.cat === 'pnj') return ['n', { id: `${m.id}:ed${Date.now().toString(36)}-${c.x}-${c.y}`, x: c.x, y: c.y, sprite: item.v, dir: r.dir || 'down', text: (r.text || 'Bonjour !').split('\n').filter(Boolean) }];
    if (item.cat === 'bat') { const B = this.batDe(item), e = this.emprise(item, c); return ['b', B.kind, e.x, e.y, r.roof || 'red', r.name || B.nom, B.o]; }
    return null;
  }
  poser(item, c) {
    if (item.cat === 'bat' && this.occupe(this.emprise(item, c))) { this.game.ui.toast('Il y a déjà un bâtiment ici'); return; }
    const op = this.opPour(item, c); if (op) this.faire([op]);
  }
  /** un coup de pinceau sur la case c (terrain ou relief, pinceau rond) */
  peindre(c) {
    const D = this.drag; D.der = { x: c.x, y: c.y };
    const cases = disque(c.x, c.y, this.outilsR.rayon).filter(([x, y]) => this.m.in(x, y));
    if (this.choix.cat === 'relief') {
      if (!this.m.outdoor) { if (!D.averti) { D.averti = true; this.game.ui.toast('Le relief se règle dehors (celui des grottes suit leur roche)'); } return; }
      const neuves = cases.filter(([x, y]) => !D.vu.has(key(x, y))); if (!neuves.length && D.mode !== 'lisser') return;
      for (const [x, y] of cases) D.vu.add(key(x, y));
      const R = this.outilsR, cibles = ciblesRelief(this.m, D.mode === 'lisser' ? cases : neuves, D.mode, D.base, D.niveau);
      const res = terrasser(this.m, cibles, { bord: R.bord, marches: R.marches });
      if (res) this.ajouter([res.op], true);
      return;
    }
    const ops = [];
    for (const [x, y] of cases) {
      const k = key(x, y); if (D.vu.has(k)) continue; D.vu.add(k);
      const op = this.opPour(this.choix, { x, y });
      if (op[0] === 't' && this.m.get(x, y) === op[3]) continue;
      ops.push(op);
    }
    if (ops.length) this.ajouter(ops, true);
  }
  /** trait droit de a à b (pinceau), case par case */
  trait(a, b) {
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; this.peindre({ x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) }); }
  }
  setRayon(r) { this.outilsR.rayon = Math.max(1, Math.min(15, Math.round(r) || 1)); this.gardeOutils(); this.majBarre(); }
  gardeOutils() { try { localStorage.setItem(OUTILS_KEY, JSON.stringify(this.outilsR)); } catch (e) { /* plein */ } }
  /** remplissage : le terrain choisi dans toute la zone pareille (même terrain, même hauteur) autour de la case */
  remplirZone(c) {
    const m = this.m, t0 = m.get(c.x, c.y), h0 = m.height(c.x, c.y);
    if (this.choix.cat !== 'sol') { this.game.ui.toast('Le remplissage pose un terrain : choisis-en un dans la palette'); return; }
    const v = this.choix.v; if (t0 === v) return;
    const vu = new Set([key(c.x, c.y)]), pile = [[c.x, c.y]], cases = [];
    while (pile.length && cases.length < 6000) {
      const [x, y] = pile.pop(); cases.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx, b = y + dy, k = key(a, b);
        if (vu.has(k) || !m.in(a, b) || m.get(a, b) !== t0 || m.height(a, b) !== h0 || m.deco.some((d) => d.x === a && d.y === b)) continue;
        vu.add(k); pile.push([a, b]);
      }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const [x, y] of cases) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, sols = new Array(w * h).fill(null);
    for (const [x, y] of cases) sols[(y - y0) * w + (x - x0)] = v;
    this.faire([['r', x0, y0, w, h, sols, null, null]], cases.length >= 6000 ? 'Zone très grande : remplie sur 6 000 cases' : `${cases.length} case(s) remplie(s)`);
  }
  gommer(c) {
    const o = this.objetEn(c.x, c.y); if (!o) return;
    this.faire([o.type === 'pnj' ? ['-n', o.o.id] : o.type === 'objet' ? ['-i', o.x, o.y] : o.type === 'decor' ? ['-p', o.x, o.y] : ['-b', o.x, o.y]]);
  }
  /** pipette : prend ce qu'il y a sur la case (bâtiment, décor, panneau, habitant, objet), sinon le terrain ;
   *  la hauteur de la case devient le niveau de l'outil Aplanir */
  pipette(c) {
    const m = this.m, o = this.objetEn(c.x, c.y), r = this.reglages;
    this.outilsR.niveau = m.height(c.x, c.y); this.gardeOutils();
    if (o?.type === 'bat') {
      const b = o.o, opts = { ...(b.o || {}), w: b.w, d: b.d, h: b.h, door: b.door };
      if (b.modele) opts.modele = b.modele;
      r.roof = b.roof || r.roof; r.name = b.name || r.name;
      this.choisir({ cat: 'bat', v: 'copie', copie: { id: 'copie', kind: b.kind, nom: b.name || b.modele || b.kind, o: opts, w: b.w, d: b.d } });
    } else if (o?.type === 'decor') {
      const txt = m.signs.get(key(c.x, c.y));
      if (txt != null) { r.panneau = txt; this.choisir({ cat: 'panneau', v: 'sign' }); }
      else { const { k, x, y, ...opts } = o.o; this.choisir({ cat: 'decor', v: k, o: Object.keys(opts).length ? opts : undefined, bloque: m.get(c.x, c.y) === T.BLOCK }); }
    } else if (o?.type === 'pnj') {
      r.dir = o.o.dir || 'down'; r.text = (Array.isArray(o.o.text) ? o.o.text : [o.o.text || 'Bonjour !']).join('\n');
      this.choisir({ cat: 'pnj', v: o.o.sprite });
    } else if (o?.type === 'objet') {
      r.qty = o.o.qty || 1; this.choisir({ cat: 'objet', v: o.o.item });
    } else {
      const t = m.get(c.x, c.y);
      if (!SOLS.some((q) => q[0] === t)) { this.game.ui.toast(`${NOM_T[t] || '?'} : pas dans la palette (hauteur ${m.height(c.x, c.y)} retenue)`); return; }
      this.choisir({ cat: 'sol', v: t });
    }
    this.game.ui.toast(`Pipette : ${this.nomChoix()}`);
  }
  /** choisit un élément comme pinceau (et le range dans les récents) */
  choisir(item, outil = true) {
    this.choix = item; if (outil) { this.outil = 'pinceau'; this.finColler(); }
    const id = (q) => q.cat + ':' + q.v + (q.copie ? ':' + JSON.stringify(q.copie.o) : '') + (q.o ? ':' + JSON.stringify(q.o) : '');
    this.recents = [item, ...this.recents.filter((q) => id(q) !== id(item))].slice(0, 9);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(this.recents)); } catch (e) { /* plein */ }
    this.majRecents(); this.majPalette(); this.majReglages(); this.majBarre(); this.majInfo();
  }
  /** bâtiment de la palette, ou copié par la pipette */
  batDe(item) { return item.copie || BATIMENTS.find((q) => q.id === item.v); }
  /** rangée « Récents » de la palette (touches 1 à 9) */
  majRecents(G = this.root?.querySelector('[data-grille="recents"]')) {
    if (!G) return;
    const nom = (q) => { const c0 = this.choix; this.choix = q; const n = this.nomChoix(); this.choix = c0; return n; };
    const ico = (q) => q.cat === 'sol' ? `<i class="ed-pastille" style="background:${SOLS.find((z) => z[0] === q.v)?.[2] || '#888'}"></i>` : q.cat === 'relief' ? `<b class="ed-niv">${RELIEFS.find((z) => z[0] === q.v)?.[2] || '⛰'}</b>`
      : q.cat === 'objet' ? `<img loading="lazy" src="${ASSETS.item(q.v)}" alt="">` : `<b class="ed-niv">${{ bat: '🏠', decor: '🌳', pnj: '🙂', panneau: '🪧' }[q.cat] || '?'}</b>`;
    G.innerHTML = this.recents.length ? this.recents.map((q, i) => `<button type="button" data-i="${i}" title="${esc(nom(q))} (touche ${i + 1})">${ico(q)}<span>${i + 1}. ${esc(nom(q))}</span></button>`).join('')
      : '<small class="ed-vide">Les éléments choisis (ou pris à la pipette) se rangent ici ; touches 1 à 9.</small>';
    G.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('pointerdown', (e) => { const q = this.recents[+b.dataset.i]; if (q) this.prendrePalette(e, q, b); }));
  }

  /* ---------------- copier, couper, coller, effacer ---------------- */
  copier() {
    const s = this.sel; if (!s) { this.game.ui.toast('Trace d\'abord un rectangle avec l\'outil Sélection'); return false; }
    const m = this.m, dans = (x, y) => x >= s.x && y >= s.y && x < s.x + s.w && y < s.y + s.h;
    const sols = [], hts = [], pts = [];
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const x = s.x + i, y = s.y + j; let t = m.get(x, y);
      if (t === T.BUILD || t === T.DOOR || t === T.BLOCK || t === T.SIGN) t = t === T.BLOCK || t === T.SIGN ? (m.under.get(key(x, y)) ?? T.GRASS) : (m.outdoor ? T.GRASS : T.FLOOR);
      sols.push(t); hts.push(m.height(x, y)); pts.push(m.pentes ? m.pentes[y * m.w + x] : 0);
    }
    const bats = m.buildings.filter((b) => dans(b.x, b.y)).map((b) => ({ kind: b.kind, x: b.x - s.x, y: b.y - s.y, roof: b.roof, name: b.name, o: { ...(b.o || {}), w: b.w, d: b.d, h: b.h, door: b.door } }));
    const signs = new Set();
    const deco = m.deco.filter((d) => dans(d.x, d.y) && !m.buildings.some((b) => dans(b.x, b.y) && d.x >= b.x && d.x < b.x + b.w && d.y >= b.y && d.y <= b.y + b.d)).map((d) => {
      const { k, x, y, ...o } = d, txt = m.signs.get(key(x, y)); if (txt != null) signs.add(key(x, y));
      return { k, x: x - s.x, y: y - s.y, o, bloque: m.get(x, y) === T.BLOCK, panneau: txt };
    });
    const npcs = m.npcs.filter((n) => dans(n.x, n.y)).map((n) => ({ ...n, x: n.x - s.x, y: n.y - s.y }));
    const items = m.items.filter((it) => dans(it.x, it.y)).map((it) => ({ item: it.item, qty: it.qty, x: it.x - s.x, y: it.y - s.y }));
    this.presse = { w: s.w, h: s.h, sols, hts, pts, bats, deco, npcs, items, de: m.id };
    this.game.ui.toast(`Copié : ${s.w} × ${s.h} (${bats.length} bâtiment(s), ${deco.length} décor(s))`);
    this.majBarre(); return true;
  }
  couper() { if (!this.copier()) return; const s = this.sel; this.faire([['vide', s.x, s.y, s.w, s.h]]); this.debutColler(); }
  effacer() {
    if (this.sel) { const s = this.sel; this.faire([['vide', s.x, s.y, s.w, s.h]]); return; }
    if (this.objSel) { const o = this.objSel; this.gommer({ x: o.type === 'bat' ? o.x : o.o.x, y: o.type === 'bat' ? o.y : o.o.y }); this.objSel = null; this.majInfo(); }
  }
  debutColler() { if (!this.presse) { this.game.ui.toast('Rien à coller : copie d\'abord une sélection'); return; } this.coller = true; this.objSel = null; this.majBarre(); this.majInfo(); }
  finColler() { if (!this.coller) return; this.coller = false; this.majBarre(); this.majInfo(); }
  collerEn(x, y) {
    const P = this.presse, m = this.m, ops = [['vide', x, y, P.w, P.h], ['r', x, y, P.w, P.h, P.sols, P.hts, P.pts]];
    for (const b of P.bats) ops.push(['b', b.kind, x + b.x, y + b.y, b.roof, b.name, b.o]);
    for (const d of P.deco) { if (d.panneau != null) ops.push(['s', x + d.x, y + d.y, d.panneau]); else ops.push(['p', d.k, x + d.x, y + d.y, d.bloque, d.o]); }
    const t = Date.now().toString(36);
    P.npcs.forEach((n, i) => ops.push(['n', { ...n, id: `${m.id}:ed${t}-${i}`, x: x + n.x, y: y + n.y }]));
    for (const it of P.items) ops.push(['i', x + it.x, y + it.y, it.item, it.qty]);
    this.faire(ops);
    this.sel = { x, y, w: P.w, h: P.h }; this.majInfo();
  }

  /* ---------------- appliquer, annuler, rétablir ---------------- */
  /** rectangle touché par une opération (avant et après) */
  zones(op) {
    const m = this.m, k = op[0], Z = [];
    const bat = (x, y) => { const b = m.buildings.find((q) => q.x === x && q.y === y); return b ? { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.d + 4 } : null; };
    if (['t', 'p', '-p', 's', 'i', '-i', 'h'].includes(k)) Z.push({ x: (k === 'p' ? op[2] : op[1]) - 1, y: (k === 'p' ? op[3] : op[2]) - 1, w: 3, h: 3 });
    else if (k === 'mp' || k === 'mi') Z.push({ x: op[1] - 1, y: op[2] - 1, w: 3, h: 3 }, { x: op[3] - 1, y: op[4] - 1, w: 3, h: 3 });
    else if (k === 'mn' || k === 'n' || k === '-n') { /* rien au sol */ }
    else if (k === 'mb') { const a = bat(op[1], op[2]); if (a) Z.push(a, { ...a, x: a.x + op[3] - op[1], y: a.y + op[4] - op[2] }); }
    else if (k === '-b') { const a = bat(op[1], op[2]); if (a) Z.push(a); }
    else if (k === 'b') { const o = op[6] || {}, B = { w: 4, d: 3, ...o }; Z.push({ x: op[2] - 1, y: op[3] - 1, w: (o.w || 6) + 2, h: (o.d || 5) + 4 }); void B; }
    else if (k === 'r' || k === 'vide') {
      Z.push({ x: op[1] - 1, y: op[2] - 1, w: op[3] + 2, h: op[4] + 4 });
      for (const b of m.buildings) if (b.x < op[1] + op[3] && op[1] < b.x + b.w && b.y < op[2] + op[4] && op[2] < b.y + b.d) Z.push({ x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.d + 4 });
    }
    return Z.map((r) => ({ x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(m.w, r.x + r.w) - Math.max(0, r.x), h: Math.min(m.h, r.y + r.h) - Math.max(0, r.y) })).filter((r) => r.w > 0 && r.h > 0);
  }
  /** photo de ce qu'une suite d'opérations va changer (pour Annuler) */
  photo(ops) {
    const m = this.m, maps = this.game.world.maps, rects = ops.flatMap((op) => this.zones(op));
    const lit = (r) => { const t = [], hg = [], p = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const i = y * m.w + x; t.push(m.t[i]); hg.push(m.hg[i]); p.push(m.pentes ? m.pentes[i] : 0); } return { ...r, t, hg, p }; };
    const mut = ops.some((o) => ['mp', 'mi', 'mn'].includes(o[0]));
    const interieurs = [];
    for (const op of ops) if (op[0] === 'mb') {
      const b = m.buildings.find((q) => q.x === op[1] && q.y === op[2]); if (!b) continue;
      for (const dx of [b.doorX, b.door2X]) { const w = dx != null && m.warps.get(key(dx, b.doorY)); const ins = w && maps[w.map]; if (ins) interieurs.push({ ins, warps: [...ins.warps].map(([k, v]) => [k, { ...v }]), outside: ins.outside && { ...ins.outside } }); }
    }
    return {
      map: m.id, rects: rects.map(lit), cartes: new Set(Object.keys(maps)),
      deco: mut ? m.deco.map((d) => ({ ...d })) : m.deco.slice(), npcs: mut ? m.npcs.map((n) => ({ ...n })) : m.npcs.slice(), items: mut ? m.items.map((i) => ({ ...i })) : m.items.slice(),
      buildings: m.buildings.slice(), warps: new Map(m.warps), signs: new Map(m.signs), under: new Map(m.under), interieurs,
    };
  }
  remettre(P) {
    const m = this.game.world.maps[P.map], maps = this.game.world.maps;
    for (const r of P.rects) { let n = 0; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++, n++) { const i = y * m.w + x; m.t[i] = r.t[n]; m.hg[i] = r.hg[n]; if (m.pentes) m.pentes[i] = r.p[n]; } }
    Object.assign(m, { deco: P.deco, npcs: P.npcs, items: P.items, buildings: P.buildings, warps: P.warps, signs: P.signs, under: P.under });
    for (const I of P.interieurs) { I.ins.warps = new Map(I.warps); I.ins.outside = I.outside; }
    for (const id of Object.keys(maps)) if (!P.cartes.has(id)) delete maps[id];
  }
  /** applique des opérations comme une seule action (annulable d'un coup) */
  faire(ops, msg = null) { this.debutGroupe(); this.ajouter(ops); this.finGroupe(); if (msg) this.game.ui.toast(msg); }
  debutGroupe() { this.groupe = { map: this.m.id, ops: [], photos: [], avantBats: this.m.buildings.slice() }; }
  ajouter(ops, differe = false) {
    const G = this.groupe, m = this.m; if (!G) return this.faire(ops);
    const rects = ops.flatMap((op) => this.zones(op));   // avant : un bâtiment déplacé n'est plus à son ancienne place après
    G.photos.push(this.photo(ops));
    applyOps(m, ops, this.game.world.maps);
    G.ops.push(...ops);
    (this.edits[m.id] ||= []).push(...ops);
    const tout = [...rects, ...ops.flatMap((op) => this.zones(op))];
    // pendant un coup de pinceau, le sol se redessine par paquets (pas à chaque case)
    if (differe) { this.aFaire ||= { t: performance.now(), rects: [] }; this.aFaire.rects.push(...tout); }
    else this.rafraichir(tout);
  }
  vider() { const A = this.aFaire; this.aFaire = null; if (A?.rects.length) this.rafraichir(A.rects); }
  finGroupe() {
    const G = this.groupe; this.groupe = null; if (!G || !G.ops.length) return;
    this.histo.push(G); if (this.histo.length > 60) this.histo.shift(); this.refaireL = [];
    this.saveLocal(); this.majBarre(); this.majInfo();
  }
  annuler() {
    const G = this.histo.pop(); if (!G) { this.game.ui.toast('Rien à annuler'); return; }
    if (G.map !== this.m.id) this.changerCarte(G.map);
    for (const P of [...G.photos].reverse()) this.remettre(P);
    const L = this.edits[G.map] || []; L.splice(L.length - G.ops.length, G.ops.length); if (!L.length) delete this.edits[G.map];
    this.refaireL.push(G); this.saveLocal();
    this.rafraichirTout(); this.majBarre(); this.majInfo();
  }
  refaire() {
    const G = this.refaireL.pop(); if (!G) return;
    if (G.map !== this.m.id) this.changerCarte(G.map);
    const L = this.refaireL; this.faire(G.ops); this.refaireL = L;
  }
  /** redessine ce qui a changé : le sol par blocs, les bâtiments un par un, les habitants et les objets */
  rafraichir(rects) {
    const g = this.game, v = g.view, m = this.m;
    if (v.r3d) { this.rafraichirTout(); return; }
    const avant = new Set(v.buildingMeshes.map((q) => q.userData.b));
    for (const b of avant) if (b && !m.buildings.includes(b)) v.retirerBat(b);
    for (const b of m.buildings) if (!avant.has(b) && !v.batAttente?.get?.(Math.floor(b.x / 16) + ',' + Math.floor(b.y / 16))?.includes(b)) v.poserBat(b);
    v.decoAt = new Map(); for (const d of m.deco) v.decoAt.set(d.x + ',' + d.y, d);
    const blocs = new Set();
    for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const k = Math.floor(x / 16) + ',' + Math.floor(y / 16); if (!blocs.has(k)) { blocs.add(k); } v.sol.invalider?.(x, y); }
    for (const k of blocs) { const [i, j] = k.split(',').map(Number); v.rebuildAt(i * 16, j * 16); }
    this.persos();
  }
  rafraichirTout() {
    const g = this.game, p = { x: g.player.x, y: g.player.y };
    g.setMap(this.m.id); Object.assign(g.player, p); g.busy = true;
  }
  /** habitants et objets de la carte, comme à l'arrivée sur la carte */
  persos() {
    const g = this.game, v = g.view, m = this.m;
    g.npcs = m.npcs.filter((n) => g.npcVisible(n)).map((n) => g.npcState(n));
    const ids = new Set(g.npcs.map((n) => 'npc:' + n.id));
    for (const k of [...v.actors.keys()]) if ((k.startsWith('npc:') && !ids.has(k)) || k.startsWith('item:')) v.removeActor(k);
    g.items = m.items.filter((it) => !g.state.flags['I:' + it.id]).map((it) => ({ ...it }));
    for (const it of g.items) { const a = v.actor('item:' + it.id, { kind: 'item' }); v.place(a, it.x, it.y - 0.15); }
  }
  /** texte à coller dans odyssee/js/world/retouches.js (copié dans le presse-papiers et téléchargé) */
  exporter() {
    const lines = Object.entries(this.edits).map(([id, ops]) => `  '${id}': [\n${ops.map((o) => '    ' + JSON.stringify(o) + ',').join('\n')}\n  ],`).join('\n');
    const txt = `// à coller dans RETOUCHES (odyssee/js/world/retouches.js)\n${lines}\n`;
    navigator.clipboard?.writeText(txt).catch(() => {});
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'retouches-odyssee.txt'; a.click();
    this.game.ui.toast('Retouches copiées et téléchargées');
  }

  /* ---------------- dessin du curseur, de la sélection et des fantômes ---------------- */
  dessinerSvg() {
    const g = this.game, cam = g.view.camera, r = this.cv.getBoundingClientRect(), v3 = new THREE.Vector3();
    const pt = (x, z) => { v3.set(x, 0, z).project(cam); return `${(r.left + (v3.x + 1) / 2 * r.width).toFixed(1)},${(r.top + (1 - v3.y) / 2 * r.height).toFixed(1)}`; };
    const poly = (p, q) => {
      if (q?.rond) {   // pinceau rond : le contour des cases du disque
        const cx = q.x + q.w / 2, cy = q.y + q.d / 2, R = q.w / 2, P = [];
        for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; P.push(pt(cx + Math.cos(t) * R, cy + Math.sin(t) * R)); }
        p.setAttribute('points', P.join(' ')); return;
      }
      p.setAttribute('points', q ? [pt(q.x, q.y), pt(q.x + q.w, q.y), pt(q.x + q.w, q.y + q.d), pt(q.x, q.y + q.d)].join(' ') : '');
    };
    cam.updateMatrixWorld();
    poly(this.psel, this.sel ? { x: this.sel.x, y: this.sel.y, w: this.sel.w, d: this.sel.h } : this.objSel ? { x: this.objSel.type === 'bat' ? this.objSel.x : this.objSel.o.x, y: this.objSel.type === 'bat' ? this.objSel.y : this.objSel.o.y, w: this.objSel.w, d: this.objSel.d } : null);
    const c = this.cursor, D = this.drag;
    let cur = null, fan = null;
    if (c) {
      if (D?.type === 'objet' && D.bouge) fan = { x: c.x - D.dx, y: c.y - D.dy, w: D.o.w, d: D.o.d };
      else if (D?.type === 'palette' && D.bouge) fan = this.emprise(D.item, c);
      else if (this.coller && this.presse) fan = { x: c.x, y: c.y, w: this.presse.w, d: this.presse.h };
      else if (this.outil === 'pinceau') cur = this.emprise(this.choix, c);
      else if (this.outil === 'remplir') cur = { x: c.x, y: c.y, w: 1, d: 1 };
      else if (D?.type !== 'pan') { const o = this.outil === 'select' || this.outil === 'gomme' ? this.objetEn(c.x, c.y) : null; cur = o ? { x: o.type === 'bat' ? o.x : o.o.x, y: o.type === 'bat' ? o.y : o.o.y, w: o.w, d: o.d } : { x: c.x, y: c.y, w: 1, d: 1 }; }
    }
    poly(this.pcur, cur); poly(this.pfantome, fan);
    const bat = D?.type === 'objet' ? (D.o.type === 'bat' ? D.o.o : undefined) : D?.type === 'palette' && D.item.cat === 'bat' ? null : this.outil === 'pinceau' && this.choix.cat === 'bat' ? null : undefined;
    const r0 = fan || cur; this.pfantome.classList.toggle('pris', !!(r0 && bat !== undefined && this.occupe(r0, bat))); this.pcur.classList.toggle('pris', !!(cur && bat === null && this.occupe(cur)));
    this.pcur.classList.toggle('gomme', this.outil === 'gomme');
  }

  /** calque des hauteurs (touche N) : le niveau de chaque case visible, teinté du bas (vert) vers le haut (brun puis blanc) */
  dessinerHauteurs() {
    const C = this.calque; if (!C || !this.outilsR.hauteurs) return;
    const g = this.game, cam = g.view.camera, r = this.cv.getBoundingClientRect(), m = this.m;
    const cle = `${this.cam.x.toFixed(2)},${this.cam.y.toFixed(2)},${this.zoom},${r.width},${r.height},${(this.edits[m.id] || []).length},${m.id},${this.histo.length}`;
    if (cle === this._calqueCle) return; this._calqueCle = cle;
    const dpr = devicePixelRatio || 1;
    if (C.width !== Math.round(r.width * dpr) || C.height !== Math.round(r.height * dpr)) { C.width = Math.round(r.width * dpr); C.height = Math.round(r.height * dpr); }
    Object.assign(C.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const x2 = C.getContext('2d'); x2.setTransform(dpr, 0, 0, dpr, 0, 0); x2.clearRect(0, 0, r.width, r.height);
    cam.updateMatrixWorld();
    const v3 = new THREE.Vector3(), pt = (x, z) => { v3.set(x, 0, z).project(cam); return [(v3.x + 1) / 2 * r.width, (1 - v3.y) / 2 * r.height]; };
    const [ax, ay] = pt(0, 0), [bx] = pt(1, 0), [, cy] = pt(0, 1), taille = Math.abs(bx - ax);
    const nx = Math.ceil(r.width / taille / 2) + 2, ny = Math.ceil(r.height / Math.abs(cy - ay) / 2) + 3;
    const x0 = Math.floor(this.cam.x) - nx, x1 = Math.ceil(this.cam.x) + nx, y0 = Math.floor(this.cam.y) - ny, y1 = Math.ceil(this.cam.y) + ny;
    const coul = (h) => h <= 0 ? null : `hsla(${Math.max(20, 120 - h * 14)}, ${h > 8 ? 15 : 55}%, ${Math.min(85, 38 + h * 4)}%, .38)`;
    x2.font = `700 ${Math.max(8, Math.min(14, taille * 0.42))}px system-ui, sans-serif`; x2.textAlign = 'center'; x2.textBaseline = 'middle';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!m.in(x, y)) continue;
      const h = m.height(x, y), [px, py] = pt(x, y), [qx, qy] = pt(x + 1, y + 1);
      const c = coul(h); if (c) { x2.fillStyle = c; x2.fillRect(px, py, qx - px, qy - py); }
      if (taille >= 14 && (h || m.get(x, y) === T.CLIFF)) {
        x2.lineWidth = 3; x2.strokeStyle = 'rgba(0,0,0,.7)'; const txt = m.get(x, y) === T.CLIFF ? h + '▾' : String(h);
        x2.strokeText(txt, (px + qx) / 2, (py + qy) / 2); x2.fillStyle = '#fff'; x2.fillText(txt, (px + qx) / 2, (py + qy) / 2);
      }
    }
  }
}
