// odyssee/moteur/render/remplacements.js — des modèles 3D faits à la main (Blender, exportés en glTF : .glb) à la place
// de ceux du jeu, à la résolution qu'on veut. La liste est dans odyssee/moteur/modeles/remplacements.json :
//   {
//     "cartes":      { "NEW_BARK": "new_bark.glb", "412": { "fichier": "route29_est.glb", "garderBatiments": true } },
//     "batiments":   { "38": "maison_jaune.glb" },
//     "personnages": { "player_m": "luth.glb", "mm:ROCK": "rocher_force.glb" },
//     "objets":      { "objet": "poke_ball.glb", "arbre_coupe": "arbuste.glb" }
//   }
// Une carte se désigne par son lieu (identifiant de la zone, celle du milieu de la carte) ou par son numéro (affiché
// par le labo et par F3) ; un bâtiment par son numéro dans l'archive des bâtiments ; un personnage par le nom de sa
// planche (celui du jeu, « mm:NOM ») ; un objet du terrain par sa sorte. Conventions (voir modeles/LISEZMOI.md) :
// 1 m dans Blender = une case ; Z en haut, Y vers le nord ; une carte a son origine au milieu de ses 32 × 32 cases, au
// niveau 0 ; un bâtiment là où le jeu pose le sien ; un personnage ou un objet au milieu de sa case, à ses pieds, tourné
// vers le sud (−Y). Les matériaux sont rendus sans lumière, comme la DS (sauf "eclairage": true).
import * as THREE from 'three';
import { GLTFLoader } from '../../../shared/vendor/three/GLTFLoader.js';

const ROT = [Math.PI, 0, -Math.PI / 2, Math.PI / 2];   // haut (nord), bas (sud), gauche (ouest), droite (est)

export class Remplacements {
  /** lit la liste (absente : rien n'est remplacé) */
  static async charger(base) {
    let liste = {};
    try { const r = await fetch(base + 'remplacements.json', { cache: 'no-cache' }); if (r.ok) liste = await r.json(); }
    catch { /* pas de liste */ }
    return new Remplacements(base, liste);
  }
  constructor(base, liste = {}) {
    this.base = base;
    const norm = (t) => Object.fromEntries(Object.entries(t || {}).filter(([k, v]) => !k.startsWith('_') && v).map(([k, v]) => [k, typeof v === 'string' ? { fichier: v } : v]));
    this.cartes = norm(liste.cartes); this.batiments = norm(liste.batiments);
    this.personnages = norm(liste.personnages); this.objets = norm(liste.objets);
    this.vide = ![this.cartes, this.batiments, this.personnages, this.objets].some((t) => Object.keys(t).length);
    this.fichiers = new Map();      // fichier → { pret, gltf } (la scène lue une fois)
    this.surPret = null;            // appelé quand un fichier arrive (le rendu refait ce qui en a besoin)
    this.chargeur = new GLTFLoader();
  }
  /** l'entrée d'une carte (par lieu ou par numéro), d'un bâtiment, d'un personnage, d'un objet ; ou null */
  carte(numero, zone) { return this.cartes[zone] || this.cartes[String(numero)] || null; }
  batiment(id) { return this.batiments[String(id)] || null; }
  personnage(sprite) { return this.personnages[sprite] || null; }
  objet(type) { return this.objets[type] || null; }
  /** le fichier est-il lu ? sinon on le demande (et le rendu sera prévenu) */
  pret(e) {
    const f = this.fichiers.get(e.fichier);
    if (f) return f.gltf ? true : false;
    const o = { gltf: null };
    this.fichiers.set(e.fichier, o);
    this.chargeur.loadAsync(this.base + e.fichier).then((g) => {
      o.gltf = g;
      for (const s of [g.scene, ...(g.scenes || [])]) this.preparer(s, e);
      this.surPret?.(e);
    }, (err) => console.warn('modèle', e.fichier, err.message || err));
    return false;
  }
  /** matériaux sans lumière (comme la DS), textures nettes si Blender les a laissées en « Closest » */
  preparer(scene, e) {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.partage = true;     // partagés par toutes les copies : jamais libérés avec un bloc
      if (e.eclairage) return;
      o.material = [].concat(o.material).map((m) => {
        const b = new THREE.MeshBasicMaterial({
          map: m.map || null, color: m.color || 0xffffff, vertexColors: !!m.vertexColors,
          transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest || 0, side: m.side,
        });
        if (m.emissiveMap && !m.map) b.map = m.emissiveMap;
        b.name = m.name;
        return b;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
  }
  /**
   * une copie posable du modèle (null s'il n'est pas encore lu) : groupe { objet, animations }. Les modèles animés
   * (personnages) sont relus à part pour avoir leur propre squelette.
   */
  copie(e) {
    if (!this.pret(e)) return null;
    const g = this.fichiers.get(e.fichier).gltf;
    const anime = g.animations?.length && (() => { let os = false; g.scene.traverse((o) => { if (o.isSkinnedMesh) os = true; }); return os; })();
    const objet = anime ? cloneAvecOs(g.scene) : g.scene.clone();
    const r = new THREE.Group();
    const s = e.echelle ?? 1;
    objet.scale.multiplyScalar(s);
    if (e.decalage) objet.position.add(new THREE.Vector3(e.decalage[0], e.decalage[2] ?? 0, -(e.decalage[1] ?? 0)));
    if (e.rotation) objet.rotation.y += THREE.MathUtils.degToRad(e.rotation);
    r.add(objet);
    r.userData.remplacement = e;
    return { objet: r, animations: g.animations || [] };
  }
  /** orientation d'un personnage selon sa direction (0 haut, 1 bas, 2 gauche, 3 droite) */
  static tourner(objet, dir) { objet.rotation.y = ROT[dir] ?? 0; }
}

/** copie d'une scène à squelette (comme SkeletonUtils.clone) : chaque copie a ses propres os */
function cloneAvecOs(source) {
  const sources = new Map(), copies = new Map();
  const copie = source.clone();
  const parcourir = (a, b, f) => { f(a, b); for (let i = 0; i < a.children.length; i++) parcourir(a.children[i], b.children[i], f); };
  parcourir(source, copie, (a, b) => { sources.set(b, a); copies.set(a, b); });
  copie.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const s = sources.get(o), sq = s.skeleton;
    o.skeleton = sq.clone();
    o.bindMatrix.copy(s.bindMatrix);
    o.skeleton.bones = sq.bones.map((os) => copies.get(os));
    o.bind(o.skeleton, o.bindMatrix);
  });
  return copie;
}
