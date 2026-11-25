// odyssee/moteur/render/hgss3d.js — le rendu des vraies cartes de HeartGold / SoulSilver : le modèle 3D du sol de chaque
// carte, habillé du jeu de textures de sa zone, et ses bâtiments à leur place (archives lues à la volée dans le dépôt
// public de la décompilation, rien n'est copié dans ce dépôt).
import * as THREE from 'three';
import { lireNsbmd, lireNsbtx } from './nsbmd.js';
import { Batiments3D, ADRESSE_BATIMENTS, ADRESSE_MEUBLES } from './modeles3d.js';
import { lireNarcHG, lireTerrainHG, CHEMINS_HG, PRET_HG } from '../donnees/hgss.js';

export class ModelesHGSS {
  /** `archives` : { terrains, zones, textures } déjà lues (Uint8Array), ou null pour les lire ici */
  constructor(base = PRET_HG, archives = null, lireF = null, personnages = null) {
    this.base = base; this.cache = new Map(); this.enCours = new Map(); this.textures = new Map();
    this.personnages = personnages;
    this.lireF = lireF || (async (c) => { const r = await fetch(base + c); if (!r.ok) throw new Error(c + ' : ' + r.status); return new Uint8Array(await r.arrayBuffer()); });
    this.b = new Batiments3D(); this.ok = false;
    this.pret = (async () => {
      const lire = this.lireF;
      const a = archives || {};
      this.terrains = lireNarcHG(a.terrains || await lire(CHEMINS_HG.terrains));
      this.zones = lireNarcHG(a.zones || await lire(CHEMINS_HG.zones));
      this.jeux = lireNarcHG(a.textures || await lire(CHEMINS_HG.textures));
      await this.b.charger(base, [ADRESSE_BATIMENTS, ADRESSE_MEUBLES]);
      this.ok = true;
      return true;
    })().catch((e) => { console.warn('cartes de HGSS indisponibles :', e.message || e); return false; });
  }
  /**
   * La planche d'un personnage du jeu (modèle « mmodel », 16 images de 32 × 32 : dos, face, profil gauche ; ou 8
   * images pour les POKéMON qui suivent, remises dans le même ordre) → un canevas de 16 × 32 px de large.
   */
  async planche(nom) {
    const i = this.personnages?.[nom];
    if (i === undefined) return null;
    try {
      const T = lireNsbtx(await this.lireF(CHEMINS_HG.personnage(i)));
      const noms = Object.keys(T.textures).sort((a, b) => (+(a.match(/(\d+)$/) || [0, 0])[1]) - (+(b.match(/(\d+)$/) || [0, 0])[1]));
      const pal = Object.keys(T.palettes || {})[0];
      const images = noms.map((n) => T.decoder(n, pal, true)).filter(Boolean);
      const ordre = images.length === 8 ? [0, 1, 0, 1, 2, 3, 2, 3, 4, 5, 4, 5] : images.map((_, k) => k);
      const cv = document.createElement('canvas'); cv.width = 32 * Math.max(ordre.length, 12); cv.height = 32;
      const g = cv.getContext('2d');
      ordre.forEach((k, j) => {
        const d = images[k]; if (!d) return;
        const im = new ImageData(new Uint8ClampedArray(d.rgba.buffer.slice(0)), d.larg, d.haut);
        const c2 = document.createElement('canvas'); c2.width = d.larg; c2.height = d.haut; c2.getContext('2d').putImageData(im, 0, 0);
        g.drawImage(c2, j * 32 + (32 - d.larg) / 2, 32 - d.haut);
      });
      return cv;
    } catch (e) { console.warn('personnage', nom, e.message || e); return null; }
  }
  /** jeu de textures d'une zone (données de zone : numéro du jeu de textures, intérieur ou dehors) */
  jeuTextures(zone) {
    const z = this.zones[zone], t = z[2] | (z[3] << 8);
    if (!this.textures.has(t)) this.textures.set(t, lireNsbtx(this.jeux[t]));
    return this.textures.get(t);
  }
  /** le groupe d'une carte : sol (modèle de la carte) et bâtiments ; centré sur le milieu de la carte */
  carte(d) {
    const cle = 'carte:' + d.carte;
    if (!this.cache.has(cle)) {
      const T = lireTerrainHG(this.terrains[d.carte]);
      const g = new THREE.Group();
      const tex = this.jeuTextures(d.zone);
      for (const modele of lireNsbmd(T.modele).modeles) g.add(this.b.construire({ fichier: { decoder: tex.decoder }, modele }));
      const archive = d.interieur ? ADRESSE_MEUBLES : ADRESSE_BATIMENTS;
      for (const b of T.batiments) {
        // les effets qui couvrent toute la carte (vent, ciel : en_sky, wind) sont animés par le jeu ; on ne les pose pas
        const e = this.b.parIndice[archive]?.[b.id], bt = e?.modele.boite;
        if (bt && (bt.max[0] - bt.min[0] > 320 || bt.max[2] - bt.min[2] > 320)) continue;
        const o = this.b.objetIndice(archive, b.id);
        if (!o) continue;
        o.position.set(b.x, b.y, b.z);
        g.add(o);
      }
      g.traverse((o) => { o.userData.partage = true; });
      this.cache.set(cle, g);
    }
    return this.cache.get(cle).clone();
  }
}
