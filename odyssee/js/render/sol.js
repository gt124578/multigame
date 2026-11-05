// odyssee/js/render/sol.js — pose le sol généré (solgen.js) sur chaque bloc de carte, juste au-dessus du sol d'origine :
// sous les dalles et flèches des énigmes, les ombres, les arbres, les barrières, les rochers, les bâtiments et le relief
// des grottes, qui restent ceux du jeu. Le calcul se fait dans des Web Workers (le jeu ne se fige pas : un bloc coûte
// de 50 à 500 ms). L'eau est animée (NFRAMES images), seulement près du joueur.
//
// L'ancien sol ne doit jamais se montrer là où le sol généré le couvre :
//  - les blocs calculés restent en cache d'une carte à l'autre (clé : carte + bloc, avec les sortes de cases qui ont
//    servi au calcul) : en ressortant d'une maison, le dehors est déjà prêt ;
//  - une case qui change (Coupe, Éclate-Roc, rocher poussé, retouche) : le bloc reconstruit reprend tout de suite
//    l'image qu'il avait ; on ne recalcule que si les sortes de cases du bloc ont vraiment changé (un arbuste coupé
//    laisse l'herbe qui était déjà dessinée dessous), et l'ancienne image reste affichée jusqu'à l'arrivée de la nouvelle ;
//  - les blocs autour de ceux qu'on voit sont calculés d'avance (PREFETCH blocs autour du joueur) ;
//  - en changeant de carte, le jeu attend que les blocs à l'écran soient prêts avant de rouvrir l'écran (pret()).
// Désactiver pour comparer : ?sol=0 dans l'adresse, ou localStorage['odyssee-sol'] = '0'.
import * as THREE from 'three';
import { NFRAMES, LUT, CELL, MARGIN, zoneBloc } from './solgen.js';
import { matSol } from './relief3d.js';

const CH = 16;                 // taille d'un bloc de carte (comme world3d.js)
const Y = 0.0044;              // hauteur du nouveau sol (au-dessus des décalques à 0,004, sous les plateaux de roche à 0,0049)
const PAS = 0.15;              // secondes par image de l'eau
const PREFETCH = 3;            // blocs calculés d'avance autour du joueur (world3d.js en construit 2 : on garde une avance)
const BUDGET = 96 * 1024 * 1024;   // octets d'images gardés en cache (un bloc fixe : 256 Ko, un bloc d'eau : 2 Mo)

function actif() {
  try {
    if (typeof location !== 'undefined' && /[?&]sol=0\b/.test(location.search)) return false;
    return localStorage.getItem('odyssee-sol') !== '0';
  } catch (e) { return true; }
}
const graine = (id) => { let h = 7; for (const ch of String(id)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return (h >>> 0) % 100000; };
function remplir(data, idx) { const u = new Uint32Array(data.buffer, data.byteOffset, idx.length); for (let i = 0; i < idx.length; i++) u[i] = LUT[idx[i]]; }
const memes = (a, b) => { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
/** l'image d'un bloc vaut-elle encore pour ces cases ? (sortes des cases, et relief des plateaux d'herbe) */
const pareil = (c, z) => memes(c.kinds, z.kinds) && (!c.rel && !z.rel ? true : memes(c.rel, z.rel));
const bloc = (cle) => cle.slice(cle.lastIndexOf('|') + 1).split(',').map(Number);

export class Sol {
  constructor(view) {
    this.view = view; this.on = actif();
    this.workers = []; this.queue = []; this.groups = new Map(); this.anim = new Set();
    this.cache = new Map(); this.octets = 0;        // clé complète (carte|i,j) → { frames, bw, bh, kinds }, du plus ancien au plus récent
    this.enCours = new Set();                         // clés en cours de calcul dans un worker
    this.attentes = [];                               // pret() : promesses en attente de blocs
    this.frame = 0; this.t = 0; this.focus = [0, 0];   // focus : position du joueur, en cases this.map = null; this.pf = null;
  }
  /** ce sol remplace-t-il celui du jeu sur cette carte ? (routes, villes, grottes ; pas les intérieurs) */
  couvre(map = this.map) { return !!(this.on && map && (map.outdoor || map.floor === 'cave')); }
  cle(ci, cj) { return this.map.id + '|' + ci + ',' + cj; }

  pool() {
    if (this.workers.length || !this.on) return;
    const n = Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
    for (let i = 0; i < n; i++) { const w = this.nouveau(); if (!w) { this.on = false; return; } this.workers.push(w); }
  }
  nouveau() {
    let w;
    try { w = new Worker(new URL('./solgen-worker.js', import.meta.url), { type: 'module' }); } catch (e) { console.warn('[sol] pas de worker', e); return null; }
    w.libre = true;
    w.onmessage = (e) => this.recu(w, e.data);
    w.onerror = (e) => { console.warn('[sol] erreur du worker', e.message); if (w.cle) this.enCours.delete(w.cle); w.libre = true; this.pump(); };
    return w;
  }

  /* ---------------- cache (gardé d'une carte à l'autre, les plus anciens blocs s'en vont) ---------------- */
  lire(k) { const c = this.cache.get(k); if (c) { this.cache.delete(k); this.cache.set(k, c); } return c; }
  ranger(k, c) {
    const old = this.cache.get(k); if (old) { this.octets -= old.octets; this.cache.delete(k); }
    c.octets = c.frames.length * c.frames[0].length + (c.roche ? c.roche.length : 0); this.cache.set(k, c); this.octets += c.octets;
    for (const [k2, c2] of this.cache) { if (this.octets <= BUDGET) break; if (k2 === k) continue; this.cache.delete(k2); this.octets -= c2.octets; }
  }

  setMap(map) {   // la carte vue par le rendu (vueCarte de world3d.js : la région continue hors des bords)
    this.map = map; this.queue.length = 0; this.groups.clear(); this.anim.clear(); this.pf = null;
    const v = this.view; v.tinted = v.tinted.filter((m) => !m.userData.sol);
    for (const a of [...this.attentes]) a.fin(true);
  }

  /** appelé par buildChunk : un bloc vient d'être construit (ou reconstruit après une case qui change) */
  demande(ci, cj, grp) {
    if (!this.couvre()) return;
    const key = this.cle(ci, cj), avant = this.groups.get(key);
    grp.userData.key = [ci, cj]; this.groups.set(key, grp);
    // l'image que montrait le bloc remplacé (si le cache l'a oubliée) : on la reprend telle quelle
    const reprise = avant && avant !== grp ? avant.userData.sol?.d : null;
    if (avant && avant !== grp && avant.userData.sol) this.liberer(avant);
    const z = zoneBloc(this.map, ci, cj, CH);
    const c = this.lire(key) || reprise;
    if (c) this.poser(key, c);
    if (!c || !pareil(c, z)) this.file(key);
  }

  /** une case a changé : les blocs dont la marge la contient sont recalculés, s'ils changent vraiment */
  invalider(x, y) {
    if (!this.couvre()) return;
    for (let cj = Math.floor((y - MARGIN) / CH); cj <= Math.floor((y + MARGIN) / CH); cj++)
      for (let ci = Math.floor((x - MARGIN) / CH); ci <= Math.floor((x + MARGIN) / CH); ci++) {
        const key = this.cle(ci, cj), g = this.groups.get(key);
        // bloc retiré par rebuildAt : il garde son image, que le bloc reconstruit reprendra (demande)
        if (!g || !g.parent) continue;
        const d = g.userData.sol?.d;
        if (!d || !pareil(d, zoneBloc(this.map, ci, cj, CH))) this.file(key);
      }
  }

  file(key) {
    if (!this.queue.includes(key) && !this.enCours.has(key)) this.queue.push(key);
    this.planifier();
  }
  /** lance les calculs au prochain micro-tâche : tous les blocs d'une même image sont en file, le plus proche part d'abord */
  planifier() {
    if (this._p) return; this._p = true;
    queueMicrotask(() => { this._p = false; this.pump(); });
  }

  pump() {
    this.pool();
    for (const w of this.workers) {
      if (!w.libre || !this.queue.length) continue;
      // d'abord les blocs qu'on attend pour rouvrir l'écran, puis le plus proche du joueur (en cases, pas en blocs : à
      // l'écran, on voit surtout le bloc du joueur et ses voisins du côté où il se tient)
      let best = 0, bd = Infinity;
      this.queue.forEach((k, i) => { const d = this.priorite(k); if (d < bd) { bd = d; best = i; } });
      const key = this.queue.splice(best, 1)[0], [ci, cj] = bloc(key);
      const z = zoneBloc(this.map, ci, cj, CH);
      const cave = this.map.outdoor ? null : this.view.biome || 'terre';
      w.libre = false; w.cle = key; this.enCours.add(key);
      w.postMessage({ key, z, seed: graine(this.map.id), cave }, z.rel ? [z.kinds.buffer, z.rel.buffer] : [z.kinds.buffer]);
    }
  }

  priorite(k) {
    const [a, b] = bloc(k), [fx, fy] = this.focus;
    const dx = Math.max(a * CH - fx, 0, fx - (a + 1) * CH), dy = Math.max(b * CH - fy, 0, fy - (b + 1) * CH);
    const attendu = this.attentes.some(({ r }) => a >= r[0] && a <= r[2] && b >= r[1] && b <= r[3]);
    return Math.hypot(dx, dy) - (attendu ? 1e4 : 0);
  }
  /** un worker occupé à un bloc dont on n'a plus besoin tout de suite (autre carte, loin) est remplacé par un neuf */
  liberes() {
    for (const [n, w] of this.workers.entries()) {
      if (w.libre || !w.cle) continue;
      if (!w.cle.startsWith(this.map.id + '|') || this.priorite(w.cle) > -1e4) {
        w.terminate(); this.enCours.delete(w.cle);
        if (w.cle.startsWith(this.map.id + '|') && !this.queue.includes(w.cle)) this.queue.push(w.cle);   // repris plus tard
        const nw = this.nouveau(); if (nw) this.workers[n] = nw;
      }
    }
  }

  recu(w, d) {
    w.libre = true; w.cle = null; this.enCours.delete(d.key);
    if (d.error) { console.warn('[sol]', d.key, d.error); this.pump(); return; }
    const c = { frames: d.frames, bw: d.bw, bh: d.bh, kinds: d.kinds, rel: d.rel || null, roche: d.roche || null, rocheH: d.rocheH || 0 };
    this.ranger(d.key, c);
    const grp = this.groups.get(d.key);
    if (grp && grp.parent) {
      this.poser(d.key, c);
      // la carte a encore changé pendant le calcul : on recommence (l'image posée reste en attendant)
      const [ci, cj] = bloc(d.key);
      if (!pareil(c, zoneBloc(this.map, ci, cj, CH))) this.file(d.key);
    }
    this.pump();
  }

  liberer(grp) {
    const o = grp.userData.sol; if (!o) return;
    grp.remove(o.mesh); o.mesh.geometry.dispose(); o.tex.dispose(); o.mat.dispose();
    this.view.tinted = this.view.tinted.filter((m) => m !== o.mat); this.anim.delete(grp); grp.userData.sol = null;
  }

  poser(key, d) {
    const grp = this.groups.get(key); if (!grp) return;
    if (grp.userData.sol?.d === d) return;
    this.liberer(grp);
    const [ci, cj] = bloc(key), w = d.bw * CELL, r3d = this.view.r3d;
    // relief en 3D : la bande de roche (pentes de roche déroulées, relief3d.js) est rangée sous l'image du bloc
    const roche = r3d && d.roche ? d.roche : null, h = d.bh * CELL + (roche ? d.rocheH * CELL : 0);
    const data = new Uint8Array(w * h * 4);
    const f = d.frames.length > 1 ? this.frame % d.frames.length : 0;
    remplir(data, d.frames[f]);
    if (roche) remplir(data.subarray(w * d.bh * CELL * 4), roche);
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    // dessiné juste après l'ancien sol (ordre -3) et avant tout le reste, sans écrire la profondeur : rien ne se bat avec lui
    // relief en 3D (?relief3d, relief3d.js) : le sol est un maillage posé sur les hauteurs, il écrit la profondeur
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, depthTest: !!r3d, depthWrite: !!r3d });
    if (r3d) matSol(mat, w, h);
    mat.userData.sol = true; mat.userData.own = true; mat.color.copy(this.view.tint); this.view.tinted.push(mat);
    const x0 = ci * CH, z0 = cj * CH, x1 = x0 + d.bw, z1 = z0 + d.bh;
    let geo;
    if (r3d) geo = r3d.geoSol(ci, cj, d.bw, d.bh, roche ? d.rocheH : 0);
    else {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, Y, z0, x1, Y, z0, x1, Y, z1, x0, Y, z1], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));   // ligne 0 de l'image = nord
      geo.setIndex([0, 3, 2, 0, 2, 1]);
    }
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -2;
    grp.add(mesh);
    grp.userData.sol = { mesh, tex, mat, data, frames: d.frames, f, d };
    if (d.frames.length > 1) this.anim.add(grp);
    if (this.attentes.length) this.verifier();
  }

  /** image générée affichée en ce moment sous une case : { d, lx, ly } (d change quand le bloc est recalculé) ; null si pas prête */
  solCase(x, y) {
    if (!this.couvre()) return null;
    const ci = Math.floor(x / CH), cj = Math.floor(y / CH), g = this.groups.get(this.cle(ci, cj)), s = g?.parent && g.userData.sol;
    if (!s) return null;
    const d = s.d, lx = x - ci * CH, ly = y - cj * CH; if (lx < 0 || ly < 0 || lx >= d.bw || ly >= d.bh) return null;
    return { d, lx, ly };
  }
  /** indices de palette (CELL × CELL) d'une case, tels qu'affichés en ce moment (image 0 de l'eau) ; null si pas prêts */
  pixelsCase(x, y) {
    const c = this.solCase(x, y); if (!c) return null;
    const { d, lx, ly } = c, W = d.bw * CELL, src = d.frames[0], out = new Uint8Array(CELL * CELL);
    for (let r = 0; r < CELL; r++) out.set(src.subarray((ly * CELL + r) * W + lx * CELL, (ly * CELL + r) * W + lx * CELL + CELL), r * CELL);
    return { px: out, d };
  }

  /**
   * promesse tenue quand tous les blocs construits qui touchent le rectangle de cases [x0, x1] × [y0, y1] montrent leur
   * sol généré (au plus tard après ms millisecondes) : le jeu attend derrière l'écran de transition
   */
  pret(x0, y0, x1, y1, ms = 4000) {
    if (!this.couvre()) return Promise.resolve(true);
    return new Promise((res) => {
      const a = { r: [Math.floor(x0 / CH), Math.floor(y0 / CH), Math.floor(x1 / CH), Math.floor(y1 / CH)] };
      const t = setTimeout(() => a.fin(false), ms);
      a.fin = (v = true) => { clearTimeout(t); this.attentes = this.attentes.filter((b) => b !== a); res(v); };
      this.attentes.push(a); this.verifier();
      if (this.attentes.includes(a)) { this.liberes(); this.planifier(); }
    });
  }
  verifier() {
    for (const a of [...this.attentes]) {
      const [i0, j0, i1, j1] = a.r; let ok = true;
      for (let j = j0; j <= j1 && ok; j++) for (let i = i0; i <= i1; i++) {
        const g = this.groups.get(this.cle(i, j));
        if (g && g.parent && !g.userData.sol) { ok = false; break; }
      }
      if (ok) a.fin(true);
    }
  }

  /** blocs autour du joueur calculés d'avance (sans les afficher) : en marchant, un bloc qui apparaît est déjà prêt */
  prefetch(ci, cj) {
    const m = this.map, ex = m.ext ? 2 : 0;
    // ce qu'on avait demandé d'avance et qui est maintenant loin derrière : abandonné
    this.queue = this.queue.filter((k) => { const [a, b] = bloc(k); return this.groups.has(k) || Math.max(Math.abs(a - ci), Math.abs(b - cj)) <= PREFETCH; });
    for (let j = cj - PREFETCH; j <= cj + PREFETCH; j++) for (let i = ci - PREFETCH; i <= ci + PREFETCH; i++) {
      if (i < -ex || j < -ex || (i - ex) * CH >= m.w || (j - ex) * CH >= m.h) continue;   // comme ensureChunks de world3d.js
      const k = this.cle(i, j);
      if (this.groups.has(k) || this.cache.has(k) || this.enCours.has(k) || this.queue.includes(k)) continue;
      this.queue.push(k);
    }
    this.planifier();
  }

  /** chaque image : avance l'eau des blocs proches du joueur */
  update(dt, ci, cj, fx = ci * CH + CH / 2, fy = cj * CH + CH / 2) {
    this.focus = [fx, fy];
    if (this.couvre() && (!this.pf || this.pf[0] !== ci || this.pf[1] !== cj)) { this.pf = [ci, cj]; this.prefetch(ci, cj); }
    if (!this.anim.size) return;
    this.t += dt; if (this.t < PAS) return;
    this.t = 0; this.frame = (this.frame + 1) % NFRAMES;
    for (const grp of this.anim) {
      if (!grp.parent) { this.anim.delete(grp); continue; }
      const [i, j] = grp.userData.key, s = grp.userData.sol;
      if (!grp.visible || Math.abs(i - ci) > 1 || Math.abs(j - cj) > 1) continue;
      const f = this.frame % s.frames.length; if (s.f === f) continue;
      remplir(s.data, s.frames[f]); s.tex.needsUpdate = true; s.f = f;
    }
  }
}
