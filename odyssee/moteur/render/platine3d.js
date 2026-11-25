// odyssee/moteur/render/platine3d.js — modèles de Pokémon Platine lus à la volée dans le dépôt public de la
// décompilation (pret/pokeplatinum) : le modèle 3D d'une carte (dans son fichier de carte), son jeu de textures à part
// (NSBTX), les accessoires posés par la carte (statues…) et la boule de neige de l'Arène de Frimapic.
// Rien n'est copié dans ce dépôt ; sans réseau, le rendu garde le sol dessiné par cases.
import * as THREE from 'three';
import { lireNsbmd, lireNsbtx } from './nsbmd.js';
import { Batiments3D } from './modeles3d.js';
import { lireCarte, PLATINE } from '../donnees/platine.js';

export class ModelesPlatine {
  constructor(base = PLATINE) { this.base = base; this.cache = new Map(); this.enCours = new Map(); this.b = new Batiments3D(); }
  async lire(chemin) {
    const r = await fetch(this.base + chemin);
    if (!r.ok) throw new Error(chemin + ' : ' + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }
  /** un groupe three.js depuis un NSBMD (textures internes, ou celles d'un NSBTX à part) */
  groupe(fichier) {
    const g = new THREE.Group();
    for (const modele of fichier.modeles) g.add(this.b.construire({ fichier, modele }));
    return g;
  }
  pret(cle) { return this.cache.has(cle); }
  /** charge une fois ; rend une promesse de réussite */
  charger(cle, faire) {
    if (this.cache.has(cle)) return Promise.resolve(true);
    if (!this.enCours.has(cle)) this.enCours.set(cle, faire().then((g) => { this.cache.set(cle, g); return true; })
      .catch((e) => { console.warn('modèle de Platine indisponible :', e.message || e); return false; }));
    return this.enCours.get(cle);
  }
  /** la salle : modèle de la carte habillé de son jeu de textures, et ses accessoires à leur place */
  chargerTerrain(tp) {
    return this.charger('terrain:' + tp.carte, async () => {
      const C = lireCarte(await this.lire(tp.carte));
      const tex = lireNsbtx(await this.lire(tp.textures));
      const m = lireNsbmd(C.modele);
      const g = this.groupe({ modeles: m.modeles, decoder: tex.decoder });
      for (const a of tp.accessoiresPoses || []) {
        const chemin = tp.accessoires?.[a.id];
        if (!chemin) continue;
        const o = this.groupe(lireNsbmd(await this.lire(chemin)));
        o.position.set(a.x, a.y, a.z);
        g.add(o);
      }
      g.traverse((o) => { o.userData.partage = true; });
      return g;
    });
  }
  chargerBoule(chemin) {
    return this.charger('boule', async () => {
      const g = this.groupe(lireNsbmd(await this.lire(chemin)));
      g.traverse((o) => { o.userData.partage = true; });
      return g;
    });
  }
  /** une copie (géométries et matériaux partagés) */
  copie(cle) { return this.cache.get(cle)?.clone() || null; }
}
