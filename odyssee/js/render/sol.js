// odyssee/js/render/sol.js — pose le sol généré (solgen.js) sur chaque bloc de carte, juste au-dessus du sol d'origine :
// sous les dalles et flèches des énigmes, les ombres, les arbres, les barrières, les rochers, les bâtiments et le relief
// des grottes, qui restent ceux du jeu. Le calcul se fait dans des Web Workers (le jeu ne se fige pas) : en attendant,
// c'est le sol d'origine qu'on voit. L'eau est animée (NFRAMES images), seulement près du joueur.
// Désactiver pour comparer : ?sol=0 dans l'adresse, ou localStorage['odyssee-sol'] = '0'.
import * as THREE from 'three';
import { NFRAMES, LUT, CELL, MARGIN, zoneBloc } from './solgen.js';

const CH = 16;                 // taille d'un bloc de carte (comme world3d.js)
const Y = 0.0044;              // hauteur du nouveau sol (au-dessus des décalques à 0,004, sous les plateaux de roche à 0,0049)
const PAS = 0.15;              // secondes par image de l'eau

function actif() {
  try {
    if (typeof location !== 'undefined' && /[?&]sol=0\b/.test(location.search)) return false;
    return localStorage.getItem('odyssee-sol') !== '0';
  } catch (e) { return true; }
}
const graine = (id) => { let h = 7; for (const ch of String(id)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return (h >>> 0) % 100000; };
function remplir(data, idx) { const u = new Uint32Array(data.buffer); for (let i = 0; i < idx.length; i++) u[i] = LUT[idx[i]]; }

export class Sol {
  constructor(view) {
    this.view = view; this.on = actif();
    this.workers = []; this.queue = []; this.cache = new Map(); this.groups = new Map(); this.anim = new Set();
    this.gen = 0; this.frame = 0; this.t = 0; this.focus = [0, 0]; this.map = null;
  }
  /** ce sol remplace-t-il celui du jeu sur cette carte ? (routes, villes, grottes ; pas les intérieurs) */
  couvre(map = this.map) { return !!(this.on && map && (map.outdoor || map.floor === 'cave')); }

  pool() {
    if (this.workers.length || !this.on) return;
    const n = Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
    for (let i = 0; i < n; i++) {
      let w;
      try { w = new Worker(new URL('./solgen-worker.js', import.meta.url), { type: 'module' }); } catch (e) { console.warn('[sol] pas de worker', e); this.on = false; return; }
      w.libre = true;
      w.onmessage = (e) => this.recu(w, e.data);
      w.onerror = (e) => { console.warn('[sol] erreur du worker', e.message); w.libre = true; this.pump(); };
      this.workers.push(w);
    }
  }

  setMap(map) {   // la carte vue par le rendu (vueCarte de world3d.js : la région continue hors des bords)
    this.gen++; this.map = map; this.queue.length = 0; this.cache.clear(); this.groups.clear(); this.anim.clear();
    const v = this.view; v.tinted = v.tinted.filter((m) => !m.userData.sol);
  }

  /** appelé par buildChunk : un bloc vient d'être construit */
  demande(ci, cj, grp) {
    if (!this.couvre()) return;
    const key = ci + ',' + cj;
    grp.userData.key = [ci, cj]; this.groups.set(key, grp);
    const c = this.cache.get(key);
    if (c) { this.poser(key, c); return; }
    if (!this.queue.includes(key)) this.queue.push(key);
    this.pump();
  }

  /** une case a changé : les blocs dont la marge la contient sont recalculés */
  invalider(x, y) {
    if (!this.couvre()) return;
    for (let cj = Math.floor((y - MARGIN) / CH); cj <= Math.floor((y + MARGIN) / CH); cj++)
      for (let ci = Math.floor((x - MARGIN) / CH); ci <= Math.floor((x + MARGIN) / CH); ci++) {
        const key = ci + ',' + cj; this.cache.delete(key);
        const g = this.groups.get(key);
        if (g && !g.parent && g.userData.sol) { const o = g.userData.sol; o.tex.dispose(); o.mat.dispose(); this.view.tinted = this.view.tinted.filter((m) => m !== o.mat); this.anim.delete(g); g.userData.sol = null; }
        if (g && g.parent && !this.queue.includes(key)) { this.queue.push(key); }
      }
    this.pump();
  }

  pump() {
    this.pool();
    for (const w of this.workers) {
      if (!w.libre || !this.queue.length) continue;
      // le bloc le plus proche du joueur d'abord
      const [fi, fj] = this.focus; let best = 0, bd = Infinity;
      this.queue.forEach((k, i) => { const [a, b] = k.split(',').map(Number); const d = Math.max(Math.abs(a - fi), Math.abs(b - fj)); if (d < bd) { bd = d; best = i; } });
      const key = this.queue.splice(best, 1)[0], [ci, cj] = key.split(',').map(Number);
      const z = zoneBloc(this.map, ci, cj, CH);
      const cave = this.map.outdoor ? null : this.view.biome || 'terre';
      w.libre = false;
      w.postMessage({ key, gen: this.gen, z, seed: graine(this.map.id), cave }, [z.kinds.buffer]);
    }
  }

  recu(w, d) {
    w.libre = true;
    if (d.error) { console.warn('[sol]', d.key, d.error); this.pump(); return; }
    if (d.gen === this.gen) { this.cache.set(d.key, d); this.poser(d.key, d); }
    this.pump();
  }

  poser(key, d) {
    const grp = this.groups.get(key); if (!grp || !grp.parent) return;
    const old = grp.userData.sol;
    if (old) { grp.remove(old.mesh); old.mesh.geometry.dispose(); old.tex.dispose(); old.mat.dispose(); this.view.tinted = this.view.tinted.filter((m) => m !== old.mat); this.anim.delete(grp); }
    const [ci, cj] = key.split(',').map(Number), w = d.bw * CELL, h = d.bh * CELL;
    const data = new Uint8Array(w * h * 4);
    const f = d.frames.length > 1 ? this.frame % d.frames.length : 0;
    remplir(data, d.frames[f]);
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    // dessiné juste après l'ancien sol (ordre -3) et avant tout le reste, sans écrire la profondeur : rien ne se bat avec lui
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, depthTest: false, depthWrite: false });
    mat.userData.sol = true; mat.userData.own = true; mat.color.copy(this.view.tint); this.view.tinted.push(mat);
    const x0 = ci * CH, z0 = cj * CH, x1 = x0 + d.bw, z1 = z0 + d.bh;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, Y, z0, x1, Y, z0, x1, Y, z1, x0, Y, z1], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));   // ligne 0 de l'image = nord
    geo.setIndex([0, 3, 2, 0, 2, 1]);
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -2;
    grp.add(mesh);
    grp.userData.sol = { mesh, tex, mat, data, frames: d.frames, f };
    if (d.frames.length > 1) this.anim.add(grp);
  }

  /** chaque image : avance l'eau des blocs proches du joueur */
  update(dt, ci, cj) {
    this.focus = [ci, cj];
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
