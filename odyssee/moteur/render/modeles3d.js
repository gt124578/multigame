// odyssee/moteur/render/modeles3d.js — les vrais bâtiments de HeartGold / SoulSilver en three.js.
// L'archive des bâtiments du dehors (bm_field.narc) est lue à la volée dans le dépôt public de la décompilation
// pret/pokeheartgold (commit épinglé) : rien n'est copié ici. Sans réseau, le rendu garde ses boîtes.
import * as THREE from 'three';
import { lireNarc, lireNsbmd } from './nsbmd.js';

export const PRET = 'https://raw.githubusercontent.com/pret/pokeheartgold/8946577385ef0e3b1a29f2f56c03db20fd675cb0/';
/** adresse de l'archive ; `?pret=<adresse>` pour une autre copie */
export const ADRESSE_BATIMENTS = 'files/fielddata/build_model/bm_field.narc';

export class Batiments3D {
  constructor() { this.fichiers = null; this.parNom = new Map(); this.cache = new Map(); this.pret = false; }
  /** charge l'archive (une fois) ; rend true si les modèles sont disponibles */
  async charger(base) {
    try {
      const r = await fetch(base + ADRESSE_BATIMENTS);
      if (!r.ok) throw new Error(r.status);
      const buf = new Uint8Array(await r.arrayBuffer());
      this.fichiers = lireNarc(buf);
      this.fichiers.forEach((f, i) => {
        // le nom du modèle est dans le dictionnaire du bloc MDL0 : on le lit sans tout décoder
        try { const m = lireNsbmd(f); for (const md of m.modeles) this.parNom.set(md.nom, { i, fichier: m, modele: md }); } catch { /* fichier sans modèle */ }
      });
      this.pret = true;
    } catch (e) { console.warn('bâtiments HGSS indisponibles :', e.message || e); }
    return this.pret;
  }
  a(nom) { return this.parNom.has(nom); }
  /** dimensions d'un modèle en cases (x, hauteur, z) et son centre */
  boite(nom) { const e = this.parNom.get(nom); if (!e) return null; const { min, max } = e.modele.boite; return { min: min.map((v) => v / 16), max: max.map((v) => v / 16) }; }
  /** un groupe three.js du modèle, en cases (16 unités DS = une case), origine au centre du pied */
  objet(nom) {
    const e = this.parNom.get(nom);
    if (!e) return null;
    if (!this.cache.has(nom)) this.cache.set(nom, this.construire(e));
    return this.cache.get(nom).clone();
  }
  construire({ fichier, modele }) {
    const g = new THREE.Group();
    const textures = new Map();
    const tex = (m) => {
      if (!m.texture) return null;
      const cle = m.texture + '|' + m.palette + '|' + m.repS + m.repT + m.miroirS + m.miroirT;
      if (textures.has(cle)) return textures.get(cle);
      const d = fichier.decoder(m.texture, m.palette);
      let t = null;
      if (d) {
        t = new THREE.DataTexture(d.rgba, d.larg, d.haut, THREE.RGBAFormat);
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = m.repS ? (m.miroirS ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping) : THREE.ClampToEdgeWrapping;
        t.wrapT = m.repT ? (m.miroirT ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping) : THREE.ClampToEdgeWrapping;
        t.needsUpdate = true;
        t.aTrous = d.rgba.some((v, i) => (i & 3) === 3 && v < 128);
        t.translucide = d.rgba.some((v, i) => (i & 3) === 3 && v > 0 && v < 250);
      }
      textures.set(cle, t);
      return t;
    };
    for (const lot of modele.lots) {
      const m = lot.materiau, n = lot.sommets.length;
      if (!n) continue;
      const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
      let couleurs = false;
      const L = m.larg || 1, H = m.haut || 1;
      lot.sommets.forEach((s, k) => {
        pos.set([s.p[0] / 16, s.p[1] / 16, s.p[2] / 16], k * 3);
        uv.set([(s.st[0] * m.sS + m.tS) / L, (s.st[1] * m.sT + m.tT) / H], k * 2);
        if (s.col) couleurs = true;
        col.set(s.col || [1, 1, 1], k * 3);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (couleurs) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const t = tex(m);
      const d = m.diffuse;
      const mat = new THREE.MeshBasicMaterial({
        map: t, vertexColors: couleurs, side: THREE.DoubleSide,
        color: t || couleurs ? 0xffffff : new THREE.Color(((d & 31) / 31), (((d >> 5) & 31) / 31), (((d >> 10) & 31) / 31)),
        transparent: m.alpha < 1 || !!t?.translucide, opacity: m.alpha, alphaTest: t?.aTrous && !t.translucide ? 0.5 : 0,
        depthWrite: !(m.alpha < 1 || t?.translucide),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.partage = true;   // géométrie et matériau partagés par toutes les copies : jamais libérés avec un bloc
      if (m.texture === 'h_kage') mesh.renderOrder = -1;   // l'ombre au pied du bâtiment
      g.add(mesh);
    }
    return g;
  }
}
