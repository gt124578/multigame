// odyssee/moteur/render/rendu.js — rendu three.js du terrain. Il ne fait que LIRE le moteur (terrain.js) :
// blocs construits à l'approche (3 × 3 autour du joueur) et défaits au loin, sprites des objets, caméra de la zone.
import * as THREE from 'three';
import { BLOC, MB } from '../engine/const.js';
import { chargerTout, facade, toit, texture, PACK_HGSS } from './textures.js';
import { Batiments3D, PRET } from './modeles3d.js';
import { ModelesPlatine } from './platine3d.js';

/** un niveau de hauteur = trois quarts de case, comme dans Odyssée */
export const NIV = 0.75;
/** hauteur ajoutée aux cases qui se dressent (murs des intérieurs, parois des grottes) */
const DRESSE = { mur: 2.0, paroi: 1.0 };
/** murs des intérieurs (papier peint selon le lieu) : comme dans HGSS, seul le mur du fond se dresse, le reste est noir */
const estMur = (s) => s === 'mur' || s?.startsWith('mur_');
/** objets du terrain dessinés comme du décor (pas de planche de marche) */
const DECOR_OBJET = { objet: 'objet', arbre_coupe: 'arbre_coupe', rocher: 'rocher' };
/** hauteur des murs de chaque sorte de bâtiment, en cases */
const HAUT_BAT = { labo: 2.2, grotte: 1.6, maison: 1.8, centre: 2.0, boutique: 1.8, arene: 2.2, ecole: 2.0, tour: 2.4, poste: 1.6 };
/**
 * Un personnage prend tout entier la profondeur d'un point juste devant ses pieds (comme un sprite de DS) : il ne
 * s'enfonce plus dans le mur, le toit ou le meuble à côté de lui (le rival collé à la fenêtre du labo n'est plus coupé),
 * et un bâtiment posé devant lui le cache toujours.
 */
/** avancée du bas du dessin : grande dehors (bâtiments à côté), petite dedans (comptoirs et meubles devant) */
const PIED = { value: 3 };
function profondeurPieds(mat, tete = 6) {
  mat.onBeforeCompile = (sh) => {
    // la profondeur des pieds, avancée vers la caméra de PIED cases en bas du dessin et de `tete` en haut : un toit
    // qui déborde ou un mur à côté ne mord plus le personnage, et un bâtiment entier devant lui le cache toujours ;
    // dedans, un comptoir devant l'infirmière cache encore ses jambes
    sh.uniforms.uPied = PIED;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPied;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 vPieds = viewMatrix * ( modelMatrix * vec4( 0.0, 0.25, 0.0, 1.0 ) );
      vPieds.z += mix( uPied, ${tete.toFixed(2)}, clamp( transformed.y / 2.0, 0.0, 1.0 ) );
      vec4 pPieds = projectionMatrix * vPieds;
      gl_Position.z = pPieds.z / pPieds.w * gl_Position.w;`);
  };
  mat.customProgramCacheKey = () => 'pieds' + tete;
  return mat;
}
/** pieds des personnages : un peu au sud du centre de la case */
const PIEDS = 0.78;

export class Rendu {
  constructor(canvas, T, opts = {}) {
    this.T = T;
    this.pack = opts.pack === 'odyssee' ? null : PACK_HGSS;
    // vrais bâtiments de HGSS (lus sur pret) : quand ils arrivent, les blocs sont refaits avec eux
    this.b3d = new Batiments3D();
    if (this.pack) this.b3d.charger(opts.pret || PRET).then((ok) => { if (ok) this.refaire = true; });
    // modèles de Platine (Arène de Frimapic), chargés quand un bloc en a besoin
    this.pt = new ModelesPlatine(opts.platine);
    // vraies cartes de HGSS (sol et bâtiments de chaque carte) : quand elles sont prêtes, les blocs sont refaits
    this.hg = opts.hg || null;
    this.hg?.pret.then((ok) => { if (ok) this.refaire = true; });
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setClearColor(0x000000);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(22, 4 / 3, 0.5, 600);
    this.blocs = new Map();          // indice du bloc → groupe
    this.sprites = new Map();        // objet du terrain → meshes
    this.mondeId = null;
    this.qualite = 'net';
    // modèles faits à la main (glTF) : quand un fichier arrive, blocs et personnages sont refaits avec lui
    this.rem = opts.remplacements?.vide ? null : opts.remplacements || null;
    if (this.rem) this.rem.surPret = () => { this.refaire = true; this.refaireSprites = true; };
    this.tPrec = null;
  }
  async charger() {
    const persos = new Set(['player_m', 'player_f', 'player_m_velo', 'player_f_velo']);
    for (const z of Object.values(this.T.d.zones)) for (const o of z.objets || []) if (o.sprite && !o.sprite.startsWith('mm:') && !o.sprite.startsWith('var:') && !DECOR_OBJET[o.type]) persos.add(o.sprite);
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
      if (o.userData.partage) return;
      o.geometry?.dispose();
      const p = o.userData.propre;
      if (!p) return;
      for (const m of [].concat(o.material)) { if (p === 'tout') m.map?.dispose(); m.dispose(); }
    });
  }
  /**
   * Blocs autour du joueur. Pour éviter les à-coups : les 3 × 3 blocs visibles sont construits en premier, au plus un
   * par image (tous d'un coup seulement dans le noir d'une transition) ; ceux de la couronne suivante (5 × 5) sont
   * construits en avance, un par image quand rien ne presse, leurs textures envoyées à la carte graphique tout de
   * suite ; un bloc n'est défait qu'à plus de trois blocs (aller et venir sur une limite ne refait rien).
   */
  majBlocs() {
    const T = this.T, M = T.M;
    if (this.mondeId !== M.id) { this.defaireTout(); this.mondeId = M.id; }
    const bx = (T.joueur.x / BLOC) | 0, by = (T.joueur.y / BLOC) | 0;
    const dist = (i) => Math.max(Math.abs((i % M.lb) - bx), Math.abs(((i / M.lb) | 0) - by));
    let budget = T.noir >= 0.99 || this.blocs.size === 0 ? 9 : 1;
    for (let r = 0; r <= 2 && budget > 0; r++) {
      for (let y = by - r; y <= by + r && budget > 0; y++) for (let x = bx - r; x <= bx + r && budget > 0; x++) {
        if (Math.max(Math.abs(x - bx), Math.abs(y - by)) !== r || x < 0 || y < 0 || x >= M.lb || y >= M.hb) continue;
        const i = y * M.lb + x;
        if (!M.blocs[i] || this.blocs.has(i)) continue;
        const g = this.construireBloc(x, y);
        this.scene.add(g); this.blocs.set(i, g);
        if (r === 2) this.envoyer(g);
        budget--;
      }
      // la couronne d'avance n'est construite que si tout ce qui se voit est là
      if (r === 1 && budget <= 0) break;
    }
    for (const [i, g] of this.blocs) if (dist(i) > 3) { this.defaire(g); this.blocs.delete(i); }
  }
  /** envoie à la carte graphique les textures d'un groupe pas encore vu (sinon c'est au moment où il paraît) */
  envoyer(g) {
    const vues = (this.texEnvoyees ||= new WeakSet());
    g.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        const t = m.map;
        if (t && !vues.has(t)) { vues.add(t); try { this.renderer.initTexture(t); } catch { /* rien */ } }
      }
    });
  }
  /** hauteur du dessus d'une case (avec ce qui se dresse) ; -1 pour le vide */
  dessus(x, y) {
    const M = this.T.M;
    const s = this.T.d.sols[M.sol(x, y)];
    if (!M.dedans(x, y) || s === 'vide') return -1;
    return M.hauteurCase(x, y) * this.niv() + this.dresse(x, y, s);
  }
  /** un mur se dresse, sauf la rangée du bas d'une pièce (sol praticable juste au nord) : on voit dans la pièce */
  dresse(x, y, s) {
    if (estMur(s)) {
      // le mur se dresse quand il donne sur le sol de la pièce, au sud
      const M = this.T.M, sud = this.T.d.sols[M.sol(x, y + 1)];
      return M.dedans(x, y + 1) && sud !== 'vide' && !estMur(sud) ? DRESSE.mur : 0;
    }
    return DRESSE[s] || 0;
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
    // carte de HGSS : son vrai modèle (sol, relief, eau, arbres) et ses bâtiments
    const th = M.blocs[by * M.lb + bx].decor.find((d) => d.type === 'terrain_hg');
    if (th && this.hg?.ok) {
      // une carte refaite à la main (remplacements.json) : son modèle, et les bâtiments du jeu si on les garde
      const e = this.rem?.carte(th.carte, M.zone(x0 + BLOC / 2, y0 + BLOC / 2)?.id);
      const c = e && this.rem.copie(e);
      let o = null;
      if (c) {
        c.objet.position.set(x0 + BLOC / 2, 0, y0 + BLOC / 2);
        g.add(c.objet);
        if (e.garderBatiments) { o = this.hg.carte(th); for (const k of [...o.children]) if (k.userData.sol) o.remove(k); }
      } else o = this.hg.carte(th);
      if (o) {
        // bâtiments refaits à la main : posés là où le jeu pose les siens
        if (this.rem) for (const k of [...o.children]) {
          const eb = k.userData.batiment !== undefined && this.rem.batiment(k.userData.batiment);
          const cb = eb && this.rem.copie(eb);
          if (!cb) continue;
          cb.objet.position.copy(k.position); cb.objet.rotation.copy(k.rotation);
          o.remove(k); o.add(cb.objet);
        }
        o.position.set(x0 + BLOC / 2, 0, y0 + BLOC / 2);
        g.add(o);
      }
      return g;
    }
    // carte de Platine : son vrai modèle 3D (dès qu'il est chargé ; avant, le sol dessiné par cases)
    const tp = M.blocs[by * M.lb + bx].decor.find((d) => d.type === 'terrain_pt');
    if (tp && this.pack) {
      if (this.pt.pret('terrain:' + tp.carte)) {
        const o = this.pt.copie('terrain:' + tp.carte);
        o.position.set(x0 + BLOC / 2, 0, y0 + BLOC / 2);
        g.add(o);
        return g;
      }
      this.pt.chargerTerrain(tp).then((ok) => { if (ok) this.refaire = true; });
    }
    // sous un escalier qui descend, le sol est ouvert : on voit les marches s'enfoncer
    const creux = new Set();
    for (const d of M.blocs[by * M.lb + bx].decor) if (d.type === 'meuble' && d.creux)
      for (let yy = d.y; yy < d.y + (d.p ?? 1); yy++) for (let xx = d.x; xx < d.x + (d.l ?? 1); xx++) creux.add(yy * BLOC + xx);
    for (let ly = 0; ly < BLOC; ly++) for (let lx = 0; lx < BLOC; lx++) {
      const x = x0 + lx, y = y0 + ly, s = sols[M.sol(x, y)];
      if (s === 'vide' || (creux.has(ly * BLOC + lx) && !estMur(s))) continue;
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
      else quad(pts, uv(s, x, y), estMur(s) ? 0 : 1);   // le dessus des murs est noir, comme le vide
      // parois vers le sud, l'est et l'ouest (le nord ne se voit pas) ; les murs : papier peint au sud, noir sur les côtés
      const face = this.dresse(x, y, s) ? 'face_' + s : (s === 'grotte' ? 'face_paroi' : s.startsWith('herbe') || s === 'fleurs' ? 'face_terre' : 'face_falaise');
      const mur = estMur(s);
      for (const [dx, dy, c0] of [[0, 1, 0.85], [1, 0, 0.7], [-1, 0, 0.7]]) {
        const c = mur ? (dy === 1 ? 1 : 0) : c0;
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
    const incl = THREE.MathUtils.degToRad(this.inclinaison()), k = this.etirement();
    for (const [type, liste] of Object.entries(parType)) {
      if (type === 'meuble' || type === 'caisse') continue;
      const D = this.A.decor[type];
      if (!D) continue;
      const pg = new THREE.PlaneGeometry(D.l, D.h); pg.translate(0, D.h / 2, 0);
      const mat = new THREE.MeshBasicMaterial({ map: D.tex, transparent: true, alphaTest: 0.5 });
      const im = new THREE.InstancedMesh(pg, mat, liste.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Vector3(1, k, 1);
      liste.forEach((d, i) => {
        const x = x0 + d.x, y = y0 + d.y, h = M.hauteurCase(x, y) * this.niv();
        m4.compose(new THREE.Vector3(x + 0.5, h, y + PIEDS), q, e);
        im.setMatrixAt(i, m4);
      });
      im.userData.propre = 'mat';
      g.add(im);
    }
    for (const d of b.decor) if (d.type === 'batiment') g.add(this.batiment(d, x0, y0));
    for (const d of b.decor) if (d.type === 'meuble') { const o = this.meuble(d, x0, y0, incl); if (o) g.add(o); }
    for (const d of b.decor) if (d.type === 'caisse') g.add(this.caisse(d, x0, y0));
    return g;
  }
  /**
   * un meuble de HGSS (archive des meubles) posé sur son emprise : centré dessus, au sol de la case ;
   * `mur` : accroché au mur du fond (fenêtre, horloge, carte), sur la face sud de la case de mur
   */
  meuble(d, x0, y0, incl) {
    const M = this.T.M, x = x0 + d.x, y = y0 + d.y, l = d.l ?? 1, p = d.p ?? 1;
    const h = M.hauteurCase(x, y) * this.niv() + (d.dy ?? 0);
    // accroché au mur : les modèles muraux de HGSS ont leur origine 0,13 case derrière leur face ; un rien devant le mur
    const cx = x + l / 2 + (d.dx ?? 0), cz = (d.mur ? y + 1 + 0.16 : y + p / 2) + (d.dz ?? 0);
    if (this.b3d.a(d.m)) {
      const o = this.b3d.objet(d.m);
      o.position.set(cx, h, cz);
      if (d.rot) o.rotation.y = -d.rot * Math.PI / 180;
      return o;
    }
    // sans les modèles (hors ligne) : le dessin d'Odyssée, s'il y en a un
    const D = d.repli && this.A.decor[d.repli];
    if (!D) return null;
    const pg = new THREE.PlaneGeometry(D.l, D.h); pg.translate(0, D.h / 2, 0);
    const o = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: D.tex, transparent: true, alphaTest: 0.5 }));
    o.position.set(cx, h, y + p - 1 + PIEDS); o.scale.y = this.etirement();
    o.userData.propre = 'mat';
    return o;
  }
  /** un comptoir (Centre, boutique, guichet) : une caisse aux couleurs du lieu ; il fait partie de la carte dans HGSS */
  caisse(d, x0, y0) {
    const x = x0 + d.x, y = y0 + d.y, l = d.l ?? 1, p = d.p ?? 1, H = d.haut ?? 0.8;
    const [dessus, face, bande] = d.couleurs || ['#f4efe6', '#d84040', '#ffffff'];
    const cv = document.createElement('canvas'); cv.width = 16 * l; cv.height = 16;
    const gc = cv.getContext('2d');
    gc.fillStyle = face; gc.fillRect(0, 0, cv.width, 16);
    gc.fillStyle = bande; gc.fillRect(0, 2, cv.width, 2);
    gc.fillStyle = 'rgba(0,0,0,0.25)'; gc.fillRect(0, 14, cv.width, 2);
    for (let i = 1; i < l; i++) { gc.fillStyle = 'rgba(0,0,0,0.12)'; gc.fillRect(i * 16, 5, 1, 9); }
    const t = texture(cv);
    const cote = new THREE.MeshBasicMaterial({ color: new THREE.Color(face).multiplyScalar(0.7) });
    const mats = [cote, cote, new THREE.MeshBasicMaterial({ color: dessus }), cote, new THREE.MeshBasicMaterial({ map: t }), cote];
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, H, p - 0.1), mats);
    m.position.set(x + l / 2, this.T.M.hauteurCase(x, y) * this.niv() + H / 2, y + (p + 0.1) / 2);
    m.userData.propre = 'tout';
    return m;
  }
  batiment(b, x0, y0) {
    const g = new THREE.Group();
    const x = x0 + b.x, z = y0 + b.y, l = b.l, p = b.p;
    const h = this.T.M.hauteurCase(x, z + p - 1) * this.niv();
    // le vrai modèle de HGSS : centré sur la porte, façade sur le bord sud de l'emprise
    if (b.m3d && this.b3d.a(b.m3d)) {
      const o = this.b3d.objet(b.m3d), bt = this.b3d.boite(b.m3d);
      // origine du modèle donnée par les données (posé par sa porte), sinon centré sur la porte
      if (b.ox !== undefined) o.position.set(x0 + b.ox, h, y0 + b.oz);
      else o.position.set(b.porte !== undefined ? x + b.porte + 0.5 : x + l / 2 - (bt.min[0] + bt.max[0]) / 2, h, z + p - bt.max[2]);
      if (b.rot) o.rotation.y = -b.rot * Math.PI / 180;
      g.add(o);
      return g;
    }
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
  /**
   * réglages de la caméra choisis par le joueur (molette, + / −, labo) : `zoom` (1 = la vue de la DS, plus grand = on
   * voit plus loin), `inclinaison` (degrés, null = celle de la carte), `champ` (degrés, null = celui de la carte)
   */
  inclinaison() { return this.cam?.inclinaison ?? this.T.camera?.inclinaison ?? 52; }
  /** hauteur d'un niveau en cases : 0,75 (comme Odyssée), ou celle du monde (Platine : demi-cases) */
  niv() { return this.T.M?.niv ?? NIV; }
  /**
   * Les personnages et le décor plat sont des plans DEBOUT (comme sur DS), étirés en hauteur de 1 / cos(inclinaison) :
   * vus par la caméra plongeante, ils gardent leur taille de dessin, et un personnage devant un comptoir ou un meuble
   * ne s'y enfonce plus (un plan penché vers la caméra traversait ce qui est derrière lui).
   */
  etirement() {
    const i = THREE.MathUtils.degToRad(this.inclinaison());
    // cases carrées (largeur resserrée de sin) : un pixel du personnage = un pixel du sol, soit tan au lieu de 1 / cos
    return this.T.camera?.carre ? Math.tan(i) : 1 / Math.cos(i);
  }

  // ——— objets ———
  /**
   * le nom de la planche d'un objet : « var:VAR_OBJ_n » (SPRITE_VAR du jeu) se lit dans la variable, qui donne le numéro
   * du modèle (l'ami du joueur par défaut : Célesta)
   */
  nomSprite(o) {
    const sp = o.sprite;
    if (!sp?.startsWith('var:')) return sp;
    const d = this.T.d, n = this.T.etat.vars[sp.slice(4)] ?? (this.T.etat.joueur?.sprite === 'player_f' ? d.spriteAmi?.f : d.spriteAmi?.m);
    const nom = d.modelesParNumero?.[n];
    return nom ? 'mm:' + nom : 'player_m';
  }
  sprite(o) {
    let s = this.sprites.get(o);
    if (s && s.sp !== undefined && o !== this.T.joueur && s.sp !== this.nomSprite(o)) { this.defaireSprite(s); this.sprites.delete(o); s = null; }
    if (s) return s;
    const sp = o === this.T.joueur ? o.sprite : this.nomSprite(o);
    const g = new THREE.Group();
    let mat, n = 1, l = 2, h = 2;
    // personnage ou objet refait à la main (remplacements.json) : son modèle 3D, animé s'il a des animations
    const er = this.rem && (this.rem.personnage(o === this.T.joueur ? this.T.etat.joueur.sprite || 'player_m' : o.sprite) || this.rem.objet(o.def?.type));
    const cr = er && this.rem.copie(er);
    if (cr) {
      g.add(cr.objet); this.scene.add(g);
      const mixer = cr.animations.length ? new THREE.AnimationMixer(cr.objet) : null;
      s = { g, modele: cr.objet, glb: true, mixer, clips: cr.animations, action: null, n: 0 };
      this.sprites.set(o, s);
      return s;
    }
    if (o.def?.modele3d === 'boule') {
      // boule de neige de Frimapic : son modèle de Platine, sinon une boule blanche
      const m3 = this.pt.pret('boule') ? this.pt.copie('boule') : new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8).translate(0, 0.45, 0), new THREE.MeshBasicMaterial({ color: 0xf4f8ff }));
      if (!this.pt.pret('boule')) { m3.userData.propre = 'mat'; this.pt.chargerBoule('res/graphics/field_effects/snowpoint_gym_snowball.nsbmd').then((ok) => { if (ok) { this.defaireSprite(this.sprites.get(o)); this.sprites.delete(o); } }); }
      g.add(m3); this.scene.add(g);
      s = { g, modele: m3, n: 0 };
      this.sprites.set(o, s);
      return s;
    }
    if (DECOR_OBJET[o.def?.type] && !sp?.startsWith('mm:')) {
      const D = this.A.decor[DECOR_OBJET[o.def.type]]; mat = new THREE.MeshBasicMaterial({ map: D.tex, transparent: true, alphaTest: 0.5 }); l = D.l; h = D.h;
    } else {
      // personnage du jeu (« mm:NOM ») : sa planche est lue dans le dépôt de la décompilation, puis le sprite refait
      if (!this.A.persos[sp] && sp?.startsWith('mm:') && this.hg && !this.planchesEnCours?.has(sp)) {
        (this.planchesEnCours ||= new Set()).add(sp);
        this.hg.planche(sp.slice(3)).then((cv) => {
          if (!cv) return;
          this.A.persos[sp] = cv;
          for (const [ob, so] of this.sprites) if (so.sp === sp) { this.defaireSprite(so); this.sprites.delete(ob); }
        });
      }
      const im = this.A.persos[sp] || this.A.persos.player_m;
      const t = texture(im); n = im.width / 32;
      t.repeat.set(1 / n, 1);
      mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5 });
    }
    // à vélo : la planche du vélo (même ordre que la marche)
    let matVelo = null, nVelo = 0;
    const imV = o === this.T.joueur && this.A.persos[(o.sprite || 'player_m') + '_velo'];
    if (imV) { const t = texture(imV); nVelo = imV.width / 32; t.repeat.set(1 / nVelo, 1); matVelo = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5 }); }
    profondeurPieds(mat); if (matVelo) profondeurPieds(matVelo);
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
    s = { g, corps, ombre, herbe, bulle, vague, n, mat: corps.material, matVelo, nVelo, sp };
    this.sprites.set(o, s);
    return s;
  }
  defaireSprite(s) {
    if (!s) return;
    this.scene.remove(s.g);
    if (s.modele) { s.mixer?.stopAllAction(); s.g.traverse((o) => { if (o.userData.propre) { o.geometry?.dispose(); o.material?.dispose(); } }); return; }
    s.g.traverse((o) => { if (o.geometry && o !== s.ombre) o.geometry.dispose(); if (o.material && o !== s.ombre && o !== s.corps) o.material.dispose(); });
    for (const m of [s.mat, s.matVelo]) if (m) { m.map?.dispose(); m.dispose(); }
  }
  placerSprite(o, joueur) {
    const T = this.T, M = T.M, s = this.sprite(o);
    s.g.visible = o.visible;
    if (!o.visible) return;
    if (s.glb) { this.placerModele(o, s, joueur); return; }
    if (s.modele) { s.g.position.set(o.x + 0.5, M.hauteurCase(o.x, o.y) * this.niv(), o.y + 0.5); return; }
    let h = M.hauteurCase(o.x, o.y);
    if (o.m && (o.m.vx !== o.m.dx || o.m.vy !== o.m.dy)) {
      const k = Math.min(1, o.m.t / o.m.duree);
      h = M.hauteurCase(o.m.dx, o.m.dy) + (M.hauteurCase(o.m.vx, o.m.vy) - M.hauteurCase(o.m.dx, o.m.dy)) * k;
    }
    const surf = joueur && T.mode === 'surf';
    const y = h * this.niv();
    s.g.position.set(o.px + 0.5, y, o.py + PIEDS);
    const k = this.etirement();
    s.corps.scale.y = k; s.herbe.scale.y = k; s.bulle.scale.y = k;
    s.corps.position.y = o.saut + (surf ? 0.15 : 0);
    s.ombre.position.set(0, 0.02, -0.25);
    s.ombre.visible = !surf;
    s.vague.visible = surf; s.vague.position.set(0, 0.03, -0.25);
    if (s.n > 1) {
      // planches de HGSS : haut, bas, gauche ; la droite est la gauche en miroir (comme sur DS)
      const velo = joueur && T.mode === 'velo' && s.matVelo;
      const mat = velo ? s.matVelo : s.mat, n = velo ? s.nVelo : s.n;
      if (s.corps.material !== mat) s.corps.material = mat;
      const droite = o.dir === 3;
      let idx = (droite ? 2 : o.dir) * 4 + o.frame;
      if (!velo && joueur && o.course && n >= 32 && o.m) idx += 16;
      mat.map.repeat.x = (droite ? -1 : 1) / n;
      mat.map.offset.x = (droite ? idx + 1 : idx) / n;
    }
    // hautes herbes : le bas du personnage passe derrière les brins
    const enHerbe = !o.m && M.mb(o.x, o.y) === MB.HERBE && o.def?.type !== 'objet';
    s.herbe.visible = enHerbe; s.herbe.position.set(0, 0.01, 0.02);
    s.bulle.visible = !!o.bulle; s.bulle.position.set(0, (1.75 + o.saut) * k, 0.05);
  }

  /**
   * un personnage en 3D (modèle fait à la main) : au milieu de sa case, tourné selon sa direction, avec l'animation de
   * ce qu'il fait — clips nommés « repos », « marche », « course », « velo », « surf » (ou idle, walk, run, bike)
   */
  placerModele(o, s, joueur) {
    const T = this.T, M = T.M;
    let h = M.hauteurCase(o.x, o.y);
    if (o.m && (o.m.vx !== o.m.dx || o.m.vy !== o.m.dy)) {
      const k = Math.min(1, o.m.t / o.m.duree);
      h = M.hauteurCase(o.m.dx, o.m.dy) + (M.hauteurCase(o.m.vx, o.m.vy) - M.hauteurCase(o.m.dx, o.m.dy)) * k;
    }
    s.g.position.set(o.px + 0.5, h * this.niv() + (o.saut || 0), o.py + 0.5);
    if (o.dir !== undefined) s.modele.rotation.y = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][o.dir] ?? 0;
    if (!s.mixer) return;
    const quoi = joueur && T.mode === 'velo' ? 'velo' : joueur && T.mode === 'surf' ? 'surf' : o.m && o.course ? 'course' : o.m ? 'marche' : 'repos';
    const AUSSI = { repos: 'idle', marche: 'walk', course: 'run', velo: 'bike', surf: 'swim' };
    const clip = s.clips.find((c) => c.name.toLowerCase() === quoi) || s.clips.find((c) => c.name.toLowerCase().includes(AUSSI[quoi]))
      || (quoi === 'course' || quoi === 'velo' ? s.clips.find((c) => /marche|walk/i.test(c.name)) : null) || (quoi === 'repos' ? s.clips[0] : null);
    if (clip?.name !== s.action?.getClip().name) {
      const a = clip ? s.mixer.clipAction(clip) : null;
      if (a) { a.reset().play(); if (s.action) a.crossFadeFrom(s.action, 0.12, false); }
      else s.action?.stop();
      s.action = a;
    }
  }

  dessiner(temps) {
    const T = this.T;
    const dt = this.tPrec === null ? 0 : Math.min(0.1, (temps - this.tPrec) / 1000); this.tPrec = temps;
    if (this.refaireSprites) { this.refaireSprites = false; for (const sp of this.sprites.values()) this.defaireSprite(sp); this.sprites.clear(); }
    for (const sp of this.sprites.values()) sp.mixer?.update(dt);
    if (this.refaire) { this.refaire = false; for (const g of this.blocs.values()) this.defaire(g); this.blocs.clear(); }
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
    PIED.value = T.zone?.interieur ? 0.6 : 3;
    const c = T.camera, incl = THREE.MathUtils.degToRad(this.inclinaison());
    const cible = new THREE.Vector3(c.x, c.z * this.niv() + 0.5, c.y);
    const sec = T.secousse > 0 ? Math.sin(temps / 20) * 0.08 : 0;
    // un autre champ garde la même largeur de vue au sol (la distance suit), le zoom éloigne
    const fov = this.cam?.champ ?? c.fov;
    const dist = c.distance * (this.zoom || 1) * (this.cam?.zoom ?? 1) * Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    this.camera.position.set(cible.x + sec, cible.y + Math.sin(incl) * dist, cible.z + Math.cos(incl) * dist);
    this.camera.fov = fov; this.camera.far = Math.max(2000, dist * 3); this.camera.updateProjectionMatrix();
    // comme Odyssée (et la DS) : la largeur est resserrée de sin(inclinaison), les cases sont carrées à l'écran
    if (c.carre) { this.camera.projectionMatrix.elements[0] *= Math.sin(incl); this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert(); }
    this.camera.lookAt(cible.x + sec, cible.y, cible.z);
    this.renderer.render(this.scene, this.camera);
  }
  infos() { const i = this.renderer.info; return { appels: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures }; }
}
