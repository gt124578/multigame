// odyssee/js/render/ambiance.js — la vie à l'écran : fumée des cheminées, papillons sur les fleurs, lucioles la nuit,
// feuilles d'automne qui tombent. Un seul nuage de points (un appel de dessin), dessiné au pixel près : chaque point est
// un petit sprite de quelques pixels d'écran, calé sur la grille des pixels comme les personnages.
//
// Tout se passe près du joueur (on ne calcule rien hors de l'écran) ; rien ne dépend de l'aléa du jeu (Math.random
// ici ne touche ni aux combats ni à la carte).
import * as THREE from 'three';
import { T } from '../world/tiles.js';

const N = 320;                       // points au plus à l'écran
const F = { BOUFFEE: 0, PAPILLON_O: 1, PAPILLON_F: 2, LUCIOLE: 3, FEUILLE_A: 4, FEUILLE_B: 5 };
const EL = 55 * Math.PI / 180, TAN = Math.tan(EL);

const VERT = /* glsl */`
  attribute float aTaille; attribute vec4 aCoul; attribute float aForme;
  uniform vec2 uRes; uniform float uEch;
  varying vec4 vCoul; varying float vForme; varying float vTaille;
  void main() {
    vec4 c = projectionMatrix * viewMatrix * vec4( position, 1.0 );
    // centre calé sur la grille des pixels (au milieu d'un pixel si la taille est impaire, sur un coin sinon)
    float s = max( 1.0, floor( aTaille / uEch + 0.5 ) );
    vec2 px = floor( ( c.xy / c.w * 0.5 + 0.5 ) * uRes ) + ( mod( s, 2.0 ) > 0.5 ? 0.5 : 0.0 );
    gl_Position = vec4( ( px / uRes * 2.0 - 1.0 ) * c.w, c.z, c.w );
    gl_PointSize = s;
    vCoul = aCoul; vForme = aForme; vTaille = s;
  }`;

// motifs des petits sprites (lignes du haut vers le bas) : 1 = couleur, 2 = corps / contour plus sombre
const FRAG = /* glsl */`
  uniform vec3 uTeinte;
  varying vec4 vCoul; varying float vForme; varying float vTaille;
  const int PAP_O[20] = int[20]( 1,1,0,1,1,  1,1,2,1,1,  0,1,2,1,0,  0,0,2,0,0 );
  const int PAP_F[20] = int[20]( 0,1,0,1,0,  0,1,2,1,0,  0,0,2,0,0,  0,0,0,0,0 );
  void main() {
    vec2 q = floor( gl_PointCoord * vTaille );
    vec3 col = vCoul.rgb; float a = vCoul.a;
    int f = int( vForme + 0.5 );
    if ( f == 0 ) {
      // bouffée de fumée : disque, ombré en bas à droite, éclairé en haut à gauche
      vec2 d = q + 0.5 - vTaille * 0.5; float r = vTaille * 0.5;
      if ( dot( d, d ) > r * r ) discard;
      if ( d.x + d.y > r * 0.55 ) col *= 0.86; else if ( d.x + d.y < - r * 0.6 ) col = min( vec3( 1.0 ), col * 1.08 );
    } else if ( f == 1 || f == 2 ) {
      int i = int( q.y ) * 5 + int( q.x );
      if ( q.x > 4.0 || q.y > 3.0 ) discard;
      int v = f == 1 ? PAP_O[ i ] : PAP_F[ i ];
      if ( v == 0 ) discard;
      if ( v == 2 ) col = vec3( 0.18, 0.14, 0.12 );
    } else if ( f == 3 ) {
      // luciole : un pixel vif, une croix jaune autour, un halo vert tramé
      vec2 d = abs( q - 3.0 ); float m = d.x + d.y;
      if ( m > 3.5 || max( d.x, d.y ) > 2.5 ) discard;
      if ( m < 0.5 ) col = vec3( 1.0, 1.0, 0.85 );
      else if ( m < 1.5 ) a *= 0.95;
      else if ( m < 2.5 ) { a *= 0.5; col *= vec3( 0.75, 1.0, 0.6 ); }
      else { if ( mod( q.x + q.y, 2.0 ) > 0.5 ) discard; a *= 0.3; col *= vec3( 0.6, 0.95, 0.5 ); }
    } else {
      // feuille qui tombe : trois pixels en biais, dans un sens puis dans l'autre ; un pixel plus sombre
      bool on = f == 4 ? ( q.y == q.x || ( q.y == 1.0 && q.x == 0.0 ) ) : ( q.y == 2.0 - q.x );
      if ( !on || q.y > 2.0 ) discard;
      if ( q.x == 2.0 ) col *= 0.75;
    }
    // la teinte de l'heure, sauf pour les lucioles (elles éclairent)
    gl_FragColor = vec4( f == 3 ? col : col * uTeinte, a );
    #include <colorspace_fragment>
  }`;

const COUL_PAP = [[0.98, 0.98, 0.94], [0.99, 0.88, 0.32], [0.98, 0.6, 0.22], [0.66, 0.82, 1.0], [0.98, 0.74, 0.86]];
const COUL_FEUILLE = [[0.86, 0.28, 0.14], [0.94, 0.52, 0.16], [0.95, 0.74, 0.22], [0.72, 0.2, 0.16]];
const COUL_PETALE = [[1.0, 0.8, 0.86], [0.98, 0.7, 0.8]];

export class Ambiance {
  constructor(view, uniforms) {
    this.view = view;
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.taille = new Float32Array(N); this.coul = new Float32Array(N * 4); this.forme = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aTaille', new THREE.BufferAttribute(this.taille, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCoul', new THREE.BufferAttribute(this.coul, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aForme', new THREE.BufferAttribute(this.forme, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uTeinte = { value: new THREE.Color(1, 1, 1) };
    // la fumée passe devant le toit dont elle sort (un bâtiment a la profondeur de sa façade) : pas de test de profondeur
    // pour elle ; les autres points (papillons, lucioles, feuilles) en ont un, dans un second nuage
    const mat = (depth) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: depth,
      uniforms: { uRes: uniforms.uRes, uEch: uniforms.uEch, uTeinte: this.uTeinte },
    });
    this.fumee = new THREE.Points(g, mat(false)); this.fumee.frustumCulled = false; this.fumee.renderOrder = 5;
    // second nuage : même géométrie, autre plage (voir maj)
    this.g2 = new THREE.BufferGeometry();
    for (const k of ['position', 'aTaille', 'aCoul', 'aForme']) this.g2.setAttribute(k, g.getAttribute(k));
    this.vie = new THREE.Points(this.g2, mat(true)); this.vie.frustumCulled = false; this.vie.renderOrder = 3;
    this.parts = [];         // particules vivantes : { k, x, y, z, vx, vy, vz, t, vie, ... }
    this.cheminees = [];     // [x, y, z] des hauts de cheminée (monde)
    this.attente = 0; this.horloge = 0;
  }
  /** nouvelle carte : on repart de zéro (les cheminées sont redonnées par poserBat) */
  vider(root) {
    this.parts.length = 0; this.cheminees.length = 0;
    root.add(this.fumee); root.add(this.vie);
  }
  ajouterCheminee(x, y, z) { const c = { x, y, z, t: Math.random() * 2 }; this.cheminees.push(c); return c; }
  retirerCheminees(L) { if (L?.length) this.cheminees = this.cheminees.filter((c) => !L.includes(c)); }

  maj(dt, fx, fy) {
    const v = this.view, m = v.map; if (!m) return;
    this.horloge += dt;
    this.uTeinte.value.copy(v.tint);
    const dehors = !!m.outdoor, nuit = v.night > 0.5, pluie = /rain|hail|sandstorm/.test(v.weather?.current || '');
    const cx = fx + 0.5, cz = fy + 0.5;
    // ---- fumée : chaque cheminée proche lâche une bouffée toutes les 0,6 à 0,9 s
    if (dehors) for (const c of this.cheminees) {
      if (Math.abs(c.x - cx) > 13 || Math.abs(c.z - cz) > 12) continue;
      c.t -= dt;
      if (c.t > 0) continue;
      c.t = 0.3 + Math.random() * 0.15;
      this.ajout({ k: 'fumee', x: c.x + (Math.random() - 0.5) * 0.1, y: c.y, z: c.z, vie: 2.8 + Math.random() * 0.8, ph: Math.random() * 6 });
    }
    // ---- vie selon l'heure : papillons le jour près des fleurs, lucioles la nuit dans l'herbe, feuilles d'automne
    this.attente -= dt;
    if (dehors && !pluie && this.attente <= 0) {
      this.attente = 0.25;
      const n = (k) => this.parts.reduce((s, p) => s + (p.k === k ? 1 : 0), 0);
      for (let essai = 0; essai < 6; essai++) {
        const x = Math.floor(cx + (Math.random() - 0.5) * 22), y = Math.floor(cz + (Math.random() - 0.5) * 14), t = m.get(x, y);
        if (t == null) continue;
        const th = m.zoneAt?.(x, y)?.theme;
        if (!nuit && (t === T.FLOWER || (t === T.GRASS && Math.random() < 0.12)) && th !== 'snow' && th !== 'volcanic' && n('papillon') < 7) {
          const h = v.hAt(x + 0.5, y + 0.5);
          this.ajout({ k: 'papillon', x: x + 0.5, y: h + 0.4 + Math.random() * 0.5, z: y + 0.5, vie: 9 + Math.random() * 8, c: COUL_PAP[Math.floor(Math.random() * COUL_PAP.length)], cap: Math.random() * 6.28, ph: Math.random() * 6 });
          break;
        }
        if (nuit && (t === T.GRASS || t === T.TALL || t === T.FLOWER || t === T.DARKTALL) && th !== 'snow' && th !== 'volcanic' && th !== 'desert' && n('luciole') < 22) {
          const h = v.hAt(x + 0.5, y + 0.5);
          this.ajout({ k: 'luciole', x: x + Math.random(), y: h + 0.25 + Math.random() * 0.6, z: y + Math.random(), vie: 6 + Math.random() * 6, cap: Math.random() * 6.28, ph: Math.random() * 6 });
          break;
        }
        const arbre = t === T.TREE || t === T.PINE;
        const petale = !arbre && v.decoAt?.get(x + ',' + y)?.k === 'cerisier';
        if ((arbre && th === 'automne') || petale) {
          if (n('feuille') >= 14) continue;
          const h = v.hAt(x + 0.5, y + 0.7);
          const pal = petale ? COUL_PETALE : COUL_FEUILLE;
          this.ajout({ k: 'feuille', x: x + 0.2 + Math.random() * 0.6, y: h + 1.4 + Math.random() * 0.8, z: y + 0.8, sol: h + 0.02, vie: 9, c: pal[Math.floor(Math.random() * pal.length)], ph: Math.random() * 6 });
          break;
        }
      }
    }
    // ---- mouvement
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.t += dt;
      if (p.t >= p.vie || Math.abs(p.x - cx) > 16 || Math.abs(p.z - cz) > 14) { P.splice(i, 1); continue; }
      if (p.k === 'fumee') {
        // monte (0,7 case par seconde à l'écran), dérive au vent, ondule
        p.y += dt * 0.6 * TAN * (1 - p.t / p.vie * 0.5);
        p.x += dt * (0.22 + Math.sin(p.ph + p.t * 1.7) * 0.12);
      } else if (p.k === 'papillon') {
        // vol hésitant : le cap tourne doucement, petits bonds
        p.cap += (Math.random() - 0.5) * dt * 5;
        p.x += Math.cos(p.cap) * dt * 0.9; p.z += Math.sin(p.cap) * dt * 0.6;
        p.y += Math.sin(p.ph + p.t * 7) * dt * 0.5;
      } else if (p.k === 'luciole') {
        p.cap += (Math.random() - 0.5) * dt * 2;
        p.x += Math.cos(p.cap) * dt * 0.25; p.z += Math.sin(p.cap) * dt * 0.18; p.y += Math.sin(p.ph + p.t * 1.3) * dt * 0.12;
      } else if (p.k === 'feuille') {
        if (p.y > p.sol) { p.y = Math.max(p.sol, p.y - dt * 0.45 * TAN * 0.6); p.x += Math.sin(p.ph + p.t * 2.2) * dt * 0.5 + dt * 0.08; }
        else if (!p.pose) { p.pose = p.t; p.vie = Math.min(p.vie, p.t + 2.5); }   // posée : elle s'efface au sol
      }
    }
    // ---- géométrie : fumée d'abord (premier nuage), puis le reste (second nuage)
    let n = 0;
    const ecrire = (p) => {
      if (n >= N) return;
      const u = p.t / p.vie;
      let taille = 3, a = 1, c = p.c || [1, 1, 1], f = F.BOUFFEE;
      if (p.k === 'fumee') { taille = Math.round(4 + u * 9); a = 0.82 * Math.min(1, p.t * 5) * Math.pow(1 - u, 0.8); c = [0.8, 0.8, 0.84]; }
      else if (p.k === 'papillon') { taille = 5; f = Math.floor(p.t * 9 + p.ph) % 2 ? F.PAPILLON_O : F.PAPILLON_F; a = Math.min(1, p.t * 2, (p.vie - p.t) * 2); }
      else if (p.k === 'luciole') { taille = 7; f = F.LUCIOLE; c = [0.9, 1.0, 0.4]; a = Math.min(1, Math.max(0, Math.sin(p.ph + p.t * 2.4) * 1.6)) * Math.min(1, p.vie - p.t, p.t); }
      else if (p.k === 'feuille') { taille = 3; f = p.pose ? F.FEUILLE_A : Math.floor(p.t * 3 + p.ph) % 2 ? F.FEUILLE_A : F.FEUILLE_B; a = p.pose ? Math.max(0, 1 - (p.t - p.pose) / 2.5) : Math.min(1, p.t * 2); }
      if (a <= 0.01) return;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.taille[n] = taille; this.forme[n] = f;
      // couleurs données telles qu'on les voit : passées en linéaire (le rendu repasse en sRGB à la sortie)
      this.coul[n * 4] = c[0] ** 2.2; this.coul[n * 4 + 1] = c[1] ** 2.2; this.coul[n * 4 + 2] = c[2] ** 2.2; this.coul[n * 4 + 3] = a;
      n++;
    };
    for (const p of P) if (p.k === 'fumee') ecrire(p);
    const nf = n;
    for (const p of P) if (p.k !== 'fumee') ecrire(p);
    this.geo.setDrawRange(0, nf); this.g2.setDrawRange(nf, n - nf);
    for (const k of ['position', 'aTaille', 'aCoul', 'aForme']) { const at = this.geo.getAttribute(k); at.needsUpdate = true; at.clearUpdateRanges?.(); }
  }
  ajout(p) { if (this.parts.length < N) { p.t = 0; this.parts.push(p); } }
}
