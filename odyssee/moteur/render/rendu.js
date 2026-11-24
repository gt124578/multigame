// odyssee/moteur/render/rendu.js — rendu three.js du terrain. Il ne fait que LIRE le moteur (terrain.js) :
// blocs construits à l'approche (3 × 3 autour du joueur) et défaits au loin, sprites des objets, caméra de la zone.
import * as THREE from 'three';
import { BLOC, MB } from '../engine/const.js';
import { chargerTout, facade, toit, texture, PACK_HGSS } from './textures.js';

/** un niveau de hauteur = trois quarts de case, comme dans Odyssée */
export const NIV = 0.75;
/** hauteur ajoutée aux cases qui se dressent (murs des maisons, parois des grottes) */
const DRESSE = { mur: 1.6, paroi: 1.0 };
/** objets du terrain dessinés comme du décor (pas de planche de marche) */
const DECOR_OBJET = { objet: 'objet', arbre_coupe: 'arbre_coupe' };
/** hauteur des murs de chaque sorte de bâtiment, en cases */
const HAUT_BAT = { labo: 2.2, grotte: 1.6, maison: 1.8, centre: 2.0, boutique: 1.8, arene: 2.2, ecole: 2.0, tour: 2.4, poste: 1.6 };
/** pieds des personnages : un peu au sud du centre de la case */
const PIEDS = 0.78;

export class Rendu {
  constructor(canvas, T, opts = {}) {
    this.T = T;
    this.pack = opts.pack === 'odyssee' ? null : PACK_HGSS;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setClearColor(0x000000);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(22, 4 / 3, 0.5, 300);
    this.blocs = new Map();          // indice du bloc → groupe
    this.sprites = new Map();        // objet du terrain → meshes
    this.mondeId = null;
    this.qualite = 'net';
  }
  async charger() {
    const persos = new Set(['player_m', 'player_f']);
    for (const z of Object.values(this.T.d.zones)) for (const o of z.objets || []) if (o.sprite && !DECOR_OBJET[o.type]) persos.add(o.sprite);
    this.A = await chargerTout(this.T.d.sols, [...persos], this.pack);
    this.matSol = new THREE.MeshBasicMaterial({ map: this.A.atlas.tex, vertexColors: true });
    this.matEau = new THREE.MeshBasicMaterial({ map: this.A.eau });
    this.ombre = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    this.ombre.rotation.x = -Math.PI / 2; this.ombre.scale.set(1, 0.55, 1);
    const im = new Image(); im.src = new URL('../../img/sol16/hautes_herbes_front.png', import.meta.url).href;
    await new Promise((ok) => { im.onload = ok; im.onerror = ok; });
    this.texHerbe = texture(im);
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.strokeStyle = '#222'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(2, 1, 12, 12, 3); g.fill(); g.stroke();
    g.fillStyle = '#d02020'; g.fillRect(7, 3, 2, 6); g.fillRect(7, 10, 2, 2);
    this.texBulle = texture(cv);
  }
  taille(l, h) {
    this.renderer.setPixelRatio(this.qualite === 'ds' ? 384 / h : Math.min(2, devicePixelRatio));
    this.renderer.setSize(l, h, false);
    this.camera.aspect = l / h; this.camera.updateProjectionMatrix();
  }

  // ——— blocs ———
  defaireTout() {
    for (const g of this.blocs.values()) this.defaire(g);
    this.blocs.clear();
    for (const s of this.sprites.values()) this.defaireSprite(s);
    this.sprites.clear();
  }
  defaire(g) {
    this.scene.remove(g);
    // géométries toujours ; matériaux propres au bloc (« mat »), et leurs images si elles lui sont propres (« tout »)
    g.traverse((o) => {
      o.geometry?.dispose();
      const p = o.userData.propre;
      if (!p) return;
      for (const m of [].concat(o.material)) { if (p === 'tout') m.map?.dispose(); m.dispose(); }
    });
  }
  majBlocs() {
    const T = this.T, M = T.M;
    if (this.mondeId !== M.id) { this.defaireTout(); this.mondeId = M.id; }
    const bx = (T.joueur.x / BLOC) | 0, by = (T.joueur.y / BLOC) | 0;
    const voulus = new Set();
    for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) {
      if (x < 0 || y < 0 || x >= M.lb || y >= M.hb) continue;
      const i = y * M.lb + x;
      if (!M.blocs[i]) continue;
      voulus.add(i);
      if (!this.blocs.has(i)) { const g = this.construireBloc(x, y); this.scene.add(g); this.blocs.set(i, g); }
    }
    for (const [i, g] of this.blocs) if (!voulus.has(i)) { this.defaire(g); this.blocs.delete(i); }
  }
  /** hauteur du dessus d'une case (avec ce qui se dresse) ; -1 pour le vide */
  dessus(x, y) {
    const M = this.T.M;
    const s = this.T.d.sols[M.sol(x, y)];
    if (!M.dedans(x, y) || s === 'vide') return -1;
    return M.hauteurCase(x, y) * NIV + this.dresse(x, y, s);
  }
  /** un mur se dresse, sauf la rangée du bas d'une pièce (sol praticable juste au nord) : on voit dans la pièce */
  dresse(x, y, s) {
    const d = DRESSE[s] || 0;
    if (!d || s !== 'mur') return d;
    const M = this.T.M, n = this.T.d.sols[M.sol(x, y - 1)];
    return M.dedans(x, y - 1) && !M.bloquee(x, y - 1) && n !== 'vide' ? 0 : d;
  }
  construireBloc(bx, by) {
    const T = this.T, M = T.M, sols = T.d.sols, uv = this.A.atlas.uv;
    const g = new THREE.Group();
    const P = [], U = [], C = [], I = [];
    const EP = [], EU = [], EI = [];
    const quad = (pts, r, c = 1, cible = 'sol') => {
      const [p, u, ix] = cible === 'eau' ? [EP, EU, EI] : [P, U, I];
      const n = p.length / 3;
      for (const q of pts) p.push(...q);
      if (cible === 'eau') { const [u0, v0, u1, v1] = r; u.push(u0, v0, u1, v0, u1, v1, u0, v1); }
      else { const [u0, v0, u1, v1] = r; u.push(u0, v0, u1, v0, u1, v1, u0, v1); C.push(c, c, c, c, c, c, c, c, c, c, c, c); }
      ix.push(n, n + 1, n + 2, n, n + 2, n + 3);
    };
    const x0 = bx * BLOC, y0 = by * BLOC;
    for (let ly = 0; ly < BLOC; ly++) for (let lx = 0; lx < BLOC; lx++) {
      const x = x0 + lx, y = y0 + ly, s = sols[M.sol(x, y)];
      if (s === 'vide') continue;
      const top = this.dessus(x, y);
      // dessus ; une case de marches descend vers sa voisine du sud
      let ys = top;
      if (M.mb(x, y) === MB.MARCHES) ys = Math.min(top, Math.max(0, this.dessus(x, y + 1)));
      const pts = [[x, ys, y + 1], [x + 1, ys, y + 1], [x + 1, top, y], [x, top, y]];
      if (s === 'eau' || s === 'eau_profonde') {
        // eau du pack HGSS : une image pour 2 × 2 cases
        const q = this.pack ? [(x & 1) / 2, 1 - ((y & 1) + 1) / 2, (x & 1) / 2 + 0.5, 1 - (y & 1) / 2] : [0, 0, 1, 1];
        quad(pts, q, 1, 'eau');
      }
      else quad(pts, uv(s, x, y));
      // parois vers le sud, l'est et l'ouest (le nord ne se voit pas)
      const face = this.dresse(x, y, s) ? 'face_' + s : (s === 'grotte' ? 'face_paroi' : s.startsWith('herbe') || s === 'fleurs' ? 'face_terre' : 'face_falaise');
      for (const [dx, dy, c] of [[0, 1, 0.85], [1, 0, 0.7], [-1, 0, 0.7]]) {
        const nt = Math.max(0, this.dessus(x + dx, y + dy));
        if (nt >= top - 1e-6) continue;
        if (M.mb(x, y) === MB.MARCHES && dy === 1) continue;
        for (let b = nt; b < top - 1e-6; b += 1) {
          const t = Math.min(top, b + 1), r = uv(face), v1 = r[1] + (r[3] - r[1]) * (t - b);
          let q;
          if (dy === 1) q = [[x, b, y + 1], [x + 1, b, y + 1], [x + 1, t, y + 1], [x, t, y + 1]];
          else if (dx === 1) q = [[x + 1, b, y + 1], [x + 1, b, y], [x + 1, t, y], [x + 1, t, y + 1]];
          else q = [[x, b, y], [x, b, y + 1], [x, t, y + 1], [x, t, y]];
          quad(q, [r[0], r[1], r[2], v1], c);
        }
      }
    }
    const geo = (p, u, ix, c) => {
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      gg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
      if (c) gg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      gg.setIndex(ix);
      return gg;
    };
    if (I.length) g.add(new THREE.Mesh(geo(P, U, I, C), this.matSol));
    if (EI.length) g.add(new THREE.Mesh(geo(EP, EU, EI), this.matEau));
    // décor : un maillage instancié par sorte
    const b = M.blocs[by * M.lb + bx];
    const parType = {};
    for (const d of b.decor) if (d.type !== 'batiment') (parType[d.type] ||= []).push(d);
    const incl = THREE.MathUtils.degToRad(this.inclinaison());
    for (const [type, liste] of Object.entries(parType)) {
      const D = this.A.decor[type];
      if (!D) continue;
      const pg = new THREE.PlaneGeometry(D.l, D.h); pg.translate(0, D.h / 2, 0);
      const mat = new THREE.MeshBasicMaterial({ map: D.tex, transparent: true, alphaTest: 0.5 });
      const im = new THREE.InstancedMesh(pg, mat, liste.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-incl, 0, 0));
      liste.forEach((d, k) => {
        const x = x0 + d.x, y = y0 + d.y, h = M.hauteurCase(x, y) * NIV;
        m4.compose(new THREE.Vector3(x + 0.5, h, y + PIEDS), q, new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(k, m4);
      });
      im.userData.propre = 'mat';
      g.add(im);
    }
    for (const d of b.decor) if (d.type === 'batiment') g.add(this.batiment(d, x0, y0));
    return g;
  }
  batiment(b, x0, y0) {
    const g = new THREE.Group();
    const x = x0 + b.x, z = y0 + b.y, l = b.l, p = b.p;
    const h = this.T.M.hauteurCase(x, z + p - 1) * NIV;
    const H = HAUT_BAT[b.modele] ?? 1.8;
    const fac = facade(b, l, H, this.A.facade);
    const mats = [new THREE.MeshBasicMaterial({ color: 0xb8ae98 }), new THREE.MeshBasicMaterial({ color: 0xb8ae98 }),
      new THREE.MeshBasicMaterial({ color: 0x8a826e }), new THREE.MeshBasicMaterial({ color: 0x8a826e }),
      new THREE.MeshBasicMaterial({ map: fac }), new THREE.MeshBasicMaterial({ color: 0x8a826e })];
    const corps = new THREE.Mesh(new THREE.BoxGeometry(l, H, p - 0.4), mats);
    corps.position.set(x + l / 2, h + H / 2, z + (p - 0.4) / 2 + 0.4);
    corps.userData.propre = 'tout';
    g.add(corps);
    if (b.modele === 'tour') {
      // tour : un second étage en retrait, puis le toit
      const e = new THREE.Mesh(new THREE.BoxGeometry(l - 2, 1.4, p - 1.6), new THREE.MeshBasicMaterial({ color: 0x6a4a30 }));
      e.position.set(x + l / 2, h + H + 0.9, z + (p - 0.4) / 2 + 0.6);
      e.userData.propre = 'mat';
      g.add(e);
      const t = new THREE.Mesh(new THREE.ConeGeometry(Math.max(l, p) * 0.5, 1.4, 4), new THREE.MeshBasicMaterial({ color: 0x4e3420 }));
      t.rotation.y = Math.PI / 4; t.position.set(x + l / 2, h + H + 2.3, z + (p - 0.4) / 2 + 0.6);
      t.userData.propre = 'mat';
      g.add(t);
    } else if (b.modele !== 'grotte') {
      // toit à deux pans, faîtage est-ouest
      const R = 1.1, a = -0.15, zN = z + 0.1, zS = z + p + 0.15, zm = (zN + zS) / 2, y1 = h + H, y2 = y1 + R;
      const pos = [x + a, y1, zS, x + l - a, y1, zS, x + l - a, y2, zm, x + a, y2, zm,
        x + l - a, y1, zN, x + a, y1, zN, x + a, y2, zm, x + l - a, y2, zm];
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      gg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, l, 0, l, p / 2, 0, p / 2, 0, 0, l, 0, l, p / 2, 0, p / 2], 2));
      gg.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
      const mt = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ map: toit(b.toit), side: THREE.DoubleSide }));
      mt.userData.propre = 'tout';
      g.add(mt);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute([x, y1, zS, x, y1, zN, x, y2, zm, x + l, y1, zN, x + l, y1, zS, x + l, y2, zm], 3));
      pg.setIndex([0, 1, 2, 3, 4, 5]);
      const pm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xa89c80, side: THREE.DoubleSide }));
      pm.userData.propre = 'mat';
      g.add(pm);
    }
    return g;
  }
  inclinaison() { return this.T.camera?.inclinaison ?? 52; }

  // ——— objets ———
  sprite(o) {
    let s = this.sprites.get(o);
    if (s) return s;
    const g = new THREE.Group();
    let mat, n = 1, l = 2, h = 2;
    if (DECOR_OBJET[o.def?.type]) {
      const D = this.A.decor[DECOR_OBJET[o.def.type]]; mat = new THREE.MeshBasicMaterial({ map: D.tex, transparent: true, alphaTest: 0.5 }); l = D.l; h = D.h;
    } else {
      const im = this.A.persos[o.sprite] || this.A.persos.player_m;
      const t = texture(im); n = im.width / 32;
      t.repeat.set(1 / n, 1);
      mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5 });
    }
    const pg = new THREE.PlaneGeometry(l, h); pg.translate(0, h / 2, 0);
    const corps = new THREE.Mesh(pg, mat);
    const ombre = this.ombre.clone();
    const herbe = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.56).translate(0, 0.28, 0), new THREE.MeshBasicMaterial({ map: this.texHerbe, transparent: true, alphaTest: 0.5 }));
    const bulle = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8).translate(0, 0.4, 0), new THREE.MeshBasicMaterial({ map: this.texBulle, transparent: true, alphaTest: 0.5, depthTest: false }));
    bulle.renderOrder = 10;
    const vague = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.7 }));
    vague.rotation.x = -Math.PI / 2; vague.scale.set(1, 0.6, 1);
    g.add(ombre, corps, herbe, bulle, vague);
    this.scene.add(g);
    s = { g, corps, ombre, herbe, bulle, vague, n };
    this.sprites.set(o, s);
    return s;
  }
  defaireSprite(s) {
    this.scene.remove(s.g);
    s.g.traverse((o) => { if (o.geometry && o !== s.ombre) o.geometry.dispose(); if (o.material && o !== s.ombre) { if (o.material.map && o === s.corps) o.material.map.dispose(); o.material.dispose(); } });
  }
  placerSprite(o, joueur) {
    const T = this.T, M = T.M, s = this.sprite(o);
    s.g.visible = o.visible;
    if (!o.visible) return;
    let h = M.hauteurCase(o.x, o.y);
    if (o.m && (o.m.vx !== o.m.dx || o.m.vy !== o.m.dy)) {
      const k = Math.min(1, o.m.t / o.m.duree);
      h = M.hauteurCase(o.m.dx, o.m.dy) + (M.hauteurCase(o.m.vx, o.m.vy) - M.hauteurCase(o.m.dx, o.m.dy)) * k;
    }
    const surf = joueur && T.mode === 'surf';
    const y = h * NIV;
    s.g.position.set(o.px + 0.5, y, o.py + PIEDS);
    const incl = THREE.MathUtils.degToRad(this.inclinaison());
    s.corps.rotation.x = -incl; s.herbe.rotation.x = -incl; s.bulle.rotation.x = -incl;
    s.corps.position.y = o.saut + (surf ? 0.15 : 0);
    s.ombre.position.set(0, 0.02, -0.25);
    s.ombre.visible = !surf;
    s.vague.visible = surf; s.vague.position.set(0, 0.03, -0.25);
    if (s.n > 1) {
      let idx = o.dir * 4 + o.frame;
      if (joueur && (o.course || T.mode === 'velo') && s.n >= 32 && o.m) idx += 16;
      s.corps.material.map.offset.x = idx / s.n;
    }
    // hautes herbes : le bas du personnage passe derrière les brins
    const enHerbe = !o.m && M.mb(o.x, o.y) === MB.HERBE && o.def?.type !== 'objet';
    s.herbe.visible = enHerbe; s.herbe.position.set(0, 0.01, 0.02);
    s.bulle.visible = !!o.bulle; s.bulle.position.set(0, 2.05 + o.saut, -1.4);
  }

  dessiner(temps) {
    const T = this.T;
    this.majBlocs();
    const vus = new Set([T.joueur, ...T.objets]);
    for (const [o, s] of this.sprites) if (!vus.has(o)) { this.defaireSprite(s); this.sprites.delete(o); }
    for (const o of T.objets) {
      const loin = Math.abs(o.x - T.joueur.x) > 40 || Math.abs(o.y - T.joueur.y) > 30;
      if (loin) { const s = this.sprites.get(o); if (s) s.g.visible = false; continue; }
      this.placerSprite(o, false);
    }
    this.placerSprite(T.joueur, true);
    this.A.eau.offset.y = (((temps / 250) | 0) % 4) * 0.25;
    // caméra : celle de la zone, centrée sur le joueur
    const c = T.camera, incl = THREE.MathUtils.degToRad(c.inclinaison);
    const cible = new THREE.Vector3(c.x, c.z * NIV + 0.5, c.y);
    const sec = T.secousse > 0 ? Math.sin(temps / 20) * 0.08 : 0;
    this.camera.position.set(cible.x + sec, cible.y + Math.sin(incl) * c.distance, cible.z + Math.cos(incl) * c.distance);
    this.camera.fov = c.fov; this.camera.updateProjectionMatrix();
    this.camera.lookAt(cible.x + sec, cible.y, cible.z);
    this.renderer.render(this.scene, this.camera);
  }
  infos() { const i = this.renderer.info; return { appels: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures }; }
}
