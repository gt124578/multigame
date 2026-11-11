// odyssee/js/render/bati-jeu.js — les bâtiments en fausse 3D (batiments3d.js) posés dans le jeu.
// Chaque bâtiment de la carte reçoit le modèle qui correspond à sa sorte, à son nom et à son emprise ; le modèle est
// construit une fois, son éclairage « en paliers » est cuit dans les couleurs de sommets (le monde n'a pas de lumières :
// tout est en MeshBasicMaterial, teinté selon l'heure), puis ses morceaux sont fusionnés par matériau (quelques appels
// de dessin par bâtiment au lieu de plusieurs centaines).
import * as THREE from 'three';
import { atelier, EMPRISES } from './batiments3d.js';
import { maisonDeVille } from './styles-villes.js';

const EL = 55 * Math.PI / 180, YS = Math.tan(EL);
let AT = null;
const atelierJeu = () => (AT ||= atelier(32));

/** couleurs des toits de la carte (b.roof) */
const TOITS = { red: '#c05a40', blue: '#3a68c8', green: '#4a9a4a', brown: '#8a5a3a', gray: '#6a6e78', teal: '#3a8a8a', orange: '#d8803a', purple: '#7a4a9a', gold: '#c89a30', yellow: '#c8a838' };
const hashB = (b) => Math.abs((b.x * 73856093) ^ (b.y * 19349663));
/** type de l'arène d'une ville (pour la couleur et les ornements) */
const TYPE_ARENE = { bug: 'plante', grass: 'plante', water: 'eau', fire: 'feu', electric: 'electrik', psychic: 'psy', dragon: 'dragon', ice: 'glace', rock: 'roche', ground: 'roche', fighting: 'combat', ghost: 'spectre', dark: 'spectre', poison: 'psy', flying: 'eau', normal: 'roche', steel: 'electrik', fairy: 'psy' };

/**
 * Le modèle d'un bâtiment de la carte : { nom, o } (paramètres du modèle), ou null pour garder l'ancien rendu (façade
 * plate) quand aucun modèle n'a la bonne emprise. ctx : { theme, ville, typeArene }.
 */
export function choisirModele(b, ctx = {}) {
  const roof = TOITS[b.roof] || TOITS.red, h = hashB(b), n = b.name || '', th = ctx.theme || '';
  const egal = (nom) => { const e = EMPRISES[nom]; return e && e[0] === b.w && e[1] === b.d; };
  let r = null;
  // maisons ordinaires des villes : l'architecture de la ville (styles-villes.js) ; ?styles=0 remet les anciennes
  if (ctx.ville && !/[?&]styles=0/.test(globalThis.location?.search || '')) { const mv = maisonDeVille(b, ctx.ville); if (mv) return mv; }
  if (b.modele) return { nom: b.modele, o: { toit: roof, ...(b.opts || {}) } };
  if (b.kind === 'house') {
    const colombage = ctx.ville === 'aube' || /village|campagne|foret|forêt/.test(th) || h % 3 === 0;
    r = { nom: 'maison', o: { toit: roof, colombage, mur: colombage ? '#f4ead2' : ['#f2e6c8', '#efe4cc', '#f4ecd8', '#ece0c8'][h % 4], porte: b.door + 0.5, volets: h % 2 ? null : undefined } };
  } else if (b.kind === 'house2') r = { nom: 'maisonLongue', o: { toit: roof, bardage: ['#7aa0b0', '#c8a070', '#a8b890', '#c89a8a'][h % 4] } };
  else if (b.kind === 'bighouse') r = { nom: 'residence', o: { toit: roof, porte: b.door + 0.5, mur: ['#f0e0d0', '#e8eef4', '#f2ead8'][h % 3] } };
  else if (b.kind === 'center') r = { nom: 'centre', o: {} };
  else if (b.kind === 'mart') r = { nom: 'boutique', o: {} };
  else if (b.kind === 'lab') r = { nom: 'labo', o: {} };
  else if (b.kind === 'gym') r = b.w === 8 ? { nom: 'areneVoute', o: { style: 'portique', type: TYPE_ARENE[ctx.typeArene] || 'feu', statue: 'bronze', champion: b.champion } }
    : { nom: 'areneCour', o: { type: TYPE_ARENE[ctx.typeArene] || 'feu' } };
  else if (b.kind === 'league') r = { nom: 'ligue', o: {} };
  else if (b.kind === 'tower') {
    if (/Grue|Dorée/.test(n)) r = { nom: 'pagode', o: {} };
    else if (/Casino/.test(n)) r = { nom: 'casino', o: {} };
    else if (/Bourse/.test(n)) r = { nom: 'bourse', o: {} };
    else if (/Phare/.test(n)) r = { nom: 'phare', o: {}, ajuste: true };
    else if (b.door < 0 || /^Tour$/.test(n)) {
      if (b.h >= 14 && b.w >= 9) return { nom: 'tourVerre', o: { etages: Math.round(b.h * 2) }, ajuste: true };
      return { nom: 'tour', o: { etages: Math.max(5, Math.round(b.h * 1.25)), w: b.w, d: b.d, col: ['#8a98b0', '#a8a090', '#7a8aa0', '#9aa4a8'][h % 4] }, libre: true };
    }
  }
  if (!r) return null;
  if (r.libre || r.ajuste || egal(r.nom)) return r;
  return null;
}

/* ---------------- cuisson de l'éclairage et fusion ---------------- */
const SOLEIL = new THREE.Vector3(-8, 14 / YS, 9).normalize();   // même soleil que la galerie (avant l'étirement vertical)
const PALIERS = [0.6, 0.74, 0.88, 1.0];
function eclairage(n) {
  const d = Math.max(0, n.dot(SOLEIL)), up = Math.max(0, n.y);
  const p = PALIERS[Math.min(3, Math.floor(d * 4))];
  return Math.min(1.08, p * 0.86 + up * 0.08 + 0.1);
}
const cleMat = (m) => [m.map ? m.map.uuid : '-', m.color ? m.color.getHexString() : 'fff', m.emissive ? m.emissive.getHexString() : '000', m.transparent ? 1 : 0, m.opacity ?? 1, m.side, m.alphaTest || 0].join('|');

/**
 * Construit le modèle, cuit l'éclairage et fusionne. Renvoie une liste de { geo, cle, mat0 } où mat0 est le matériau
 * d'origine (couleur, texture, transparence) ; les positions sont déjà étirées en hauteur (tan EL) et posées en (ox, oz).
 */
const CACHE = new Map();
export function geometriesModele(nom, o) {
  const key = nom + JSON.stringify(o);
  if (CACHE.has(key)) return CACHE.get(key);
  const { B } = atelierJeu();
  const G = B[nom](o);
  G.updateMatrixWorld(true);
  const n3 = new THREE.Matrix3(), nv = new THREE.Vector3(), pv = new THREE.Vector3(), mm = new THREE.Matrix4();
  const fumees = [], fanaux = [];   // repères posés par batiments3d.js : hauts des cheminées (fumée), lanterne d'un phare
  // parties qui tournent (ailes d'un moulin : userData.tourne) : fusionnées à part, dans leur propre repère
  const tournes = []; G.traverse((m) => { if (m.userData.tourne && m !== G) tournes.push(m); });
  const sous = new Set(); for (const T of tournes) T.traverse((m) => sous.add(m));
  /** fusionne les maillages de racine (sauf exclus) par matériau, positions ramenées par inv (null : le monde) ;
   *  ys : étirement vertical (les parties qui tournent sont étirées par leur groupe, après la rotation) */
  const fusionner = (racine, inv, ys, exclus) => {
    const lots = new Map();
    racine.traverse((m) => {
      if (exclus?.has(m)) return;
      if (m.userData.fumee || m.userData.fanal) { if (!inv) { pv.set(0, 0, 0).applyMatrix4(m.matrixWorld); (m.userData.fumee ? fumees : fanaux).push([pv.x, pv.y * YS, pv.z]); } return; }
      if (!m.isMesh) return;
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const groups = Array.isArray(m.material) && g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
      n3.getNormalMatrix(m.matrixWorld);
      mm.copy(m.matrixWorld); if (inv) mm.premultiply(inv);
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      for (const gr of groups) {
        const mat = mats[gr.materialIndex] || mats[0]; if (!mat || mat.visible === false) continue;
        const k = cleMat(mat);
        if (!lots.has(k)) lots.set(k, { mat0: mat, pos: [], uv: [], col: [] });
        const L = lots.get(k);
        const emis = mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.05;
        for (let i = gr.start; i < gr.start + gr.count; i++) {
          pv.fromBufferAttribute(P, i).applyMatrix4(mm);
          L.pos.push(pv.x, pv.y * ys, pv.z);
          nv.fromBufferAttribute(N, i).applyMatrix3(n3).normalize();
          const s = emis ? 1.15 : eclairage(nv);
          // rampe façon DS : les faces à l'ombre tirent vers le bleu-violet, les faces au soleil un peu vers le jaune
          // (un gris qui assombrit seulement donne des volumes ternes)
          if (emis) L.col.push(s, s, s);
          else { const o = Math.max(0, 0.95 - s) / 0.35, c = Math.max(0, s - 0.95) / 0.13; L.col.push(s * (1 - 0.13 * o) * (1 + 0.03 * c), s * (1 - 0.07 * o) * (1 + 0.015 * c), s * (1 + 0.10 * o) * (1 - 0.05 * c)); }
          if (U) L.uv.push(U.getX(i), U.getY(i)); else L.uv.push(0, 0);
        }
      }
      g.dispose();
    });
    const res = [];
    for (const [cle, L] of lots) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(L.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.col, 3));
      g.computeBoundingSphere();
      res.push({ geo: g, cle, mat0: L.mat0 });
    }
    return res;
  };
  const out = fusionner(G, null, YS, sous);
  // chaque partie qui tourne : ses géométries dans son repère (pivot), sa position et sa vitesse (tours par seconde)
  out.tournants = tournes.map((T) => {
    const pivot = new THREE.Vector3().setFromMatrixPosition(T.matrixWorld), inv = T.matrixWorld.clone().invert();
    const q = new THREE.Quaternion(); T.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    return { parts: fusionner(T, inv, 1, null), pivot: [pivot.x, pivot.y, pivot.z], quat: q, vitesse: T.userData.tourne.vitesse || 0.2 };
  });
  out.fumees = fumees; out.fanaux = fanaux;
  CACHE.set(key, out);
  return out;
}

/** couleur de base d'un matériau du modèle (couleur + lueur des matériaux lumineux) */
export function couleurBase(mat0) {
  const c = mat0.color ? mat0.color.clone() : new THREE.Color(1, 1, 1);
  if (mat0.emissive) c.add(mat0.emissive.clone().multiplyScalar(0.6));
  return c;
}
export { EMPRISES };
