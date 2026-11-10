// odyssee/js/world/plan.js — le plan de la grande région d'Odyssée (1200 × 1392 cases, blocs de 24 × 24).
//
// Au nord-ouest, le continent : Bourg-Aube au bord du détroit, Sylvebourg dans ses forêts, Pierrefort et sa mine sous les
// crêtes du nord, le Mont Lunaire et sa grotte, Port-Azur sur la côte nord, Voltacité au nord-est, Floralia au centre,
// Mirage à l'est et sa Forêt des Torii. Au centre-ouest, la Chaîne Céleste, une vraie chaîne de montagnes : la Route
// Victoire y grimpe en lacets depuis Cimelune jusqu'au Plateau Céleste, la Ligue, perché au cœur des sommets.
// Au sud-est du continent, l'archipel des trois frères derrière ses tourbillons ; à l'est, au-delà d'une autre ceinture
// de tourbillons, les trois îles du bateau (Île Givrée, Île de la Grue, Île Orageuse). Au sud du détroit, que franchit
// le Pont de l'Austral, les Terres du Sud : Métropole, Port-Lisière sur ses falaises, le marais, le désert et le Canyon
// d'Ocre, Forge-Acier, Rosebrume et la sombre Ombreval.
//
// Les îles du bateau (Port-Orage, Hautegrue, Givrebourg) sont bâties telles quelles dans leur ancien repère et posées à
// l'est par l'atelier (region.js).
// Les villes sont données en blocs (bx, by, bw, bh) ; cx, cy : coin de l'ancienne ville (le centre) dans la grande ;
// sorties : portes de la grande ville (dir, k : décalage en cases le long du côté). Les territoires des routes sont des
// rectangles de blocs [c0, r0, c1, r1] où le sentier serpente (chemins.js).
export const BLOC = 24, COLS = 50, ROWS = 58, LARGEUR = COLS * BLOC, HAUTEUR = ROWS * BLOC;

/** les villes (lettre de la ville dans region.js / sud.js) */
export const VILLES = {
  A: { bx: 1, by: 22, bw: 4, bh: 3, cx: 28, cy: 24, theme: 'aube', devise: 'Là où chaque aventure commence.', toits: ['red', 'orange'], arbres: ['cerisier', 'pommier'], rue: 2, quartiers: { maisons: 4, parc: 1, place: 0, marche: 1, jardins: 2, ferme: 2 },
    sorties: [{ dir: 'n', k: 42, vers: 'r1' }, { dir: 'e', k: 34, vers: 'r10', garde: 'garde10' }] },
  B: { bx: 1, by: 13, bw: 7, bh: 6, cx: 57, cy: 50, theme: 'sylve', devise: 'La ville où murmurent les feuilles.', arbres: ['pin', 'erable'], toits: ['green', 'teal', 'brown'], rue: 6, quartiers: { maisons: 4, parc: 1, place: 1, marche: 1, jardins: 1 },
    sorties: [{ dir: 'n', k: 60, vers: 'r2', garde: 'garde' }, { dir: 's', k: 42, vers: 'r1' }] },
  C: { bx: 3, by: 2, bw: 6, bh: 4, cx: 42, cy: 12, theme: 'pierre', devise: 'Une ville taillée dans la montagne.', quartiers: { maisons: 6, parc: 1, place: 1, marche: 1, jardins: 0 },
    sorties: [{ dir: 's', k: 100, vers: 'bois' }, { dir: 'e', k: 40, vers: 'r3' }, { dir: 'n', k: 86, vers: 'mine' }] },
  D: { bx: 19, by: 1, bw: 5, bh: 6, cx: 42, cy: 26, theme: 'azur', mer: 'n', devise: 'Le parfum des embruns et des voyages.', quartiers: { maisons: 6, parc: 1, place: 1, marche: 1, jardins: 0 },
    sorties: [{ dir: 'w', k: 60, vers: 'r3e' }, { dir: 'e', k: 88, vers: 'r4', garde: 'garde' }] },
  E: { bx: 31, by: 2, bw: 6, bh: 6, cx: 50, cy: 48, theme: 'volta', releve: true, organique: false, pasX: [16, 21], pasY: [13, 16], saute: 0, devise: 'La ville qui ne s\'éteint jamais.', quartiers: { maisons: 5, parc: 1, place: 1, marche: 1, jardins: 0, affaires: 3 },
    sorties: [{ dir: 'w', k: 44, vers: 'r4' }, { dir: 's', k: 110, vers: 'r5', garde: 'garde' }] },
  F: { bx: 19, by: 12, bw: 7, bh: 5, cx: 60, cy: 42, theme: 'flora', devise: 'La cité aux mille couleurs.', arbres: ['cerisier', 'erable', 'cerisier'], quartiers: { maisons: 7, parc: 2, place: 1, marche: 1, jardins: 3 },
    sorties: [{ dir: 'n', k: 150, vers: 'r5', garde: 'garde' }, { dir: 'e', k: 74, vers: 'r6', coupe: true }] },
  G: { bx: 32, by: 14, bw: 6, bh: 5, cx: 50, cy: 44, theme: 'mirage', devise: 'La ville où l\'esprit voit plus loin.', statue: 'stele', quartiers: { maisons: 7, parc: 1, place: 1, marche: 1, jardins: 1 },
    sorties: [{ dir: 'w', k: 22, vers: 'r6' }, { dir: 'w', k: 71, vers: 'torii' }, { dir: 's', k: 90, vers: 'r7' }] },
  K: { bx: 34, by: 25, bw: 4, bh: 4, cx: 33, cy: 40, theme: 'granit', devise: 'Île de Granit.', quartiers: { maisons: 4, parc: 1, place: 1, marche: 1, jardins: 0 },
    sorties: [{ dir: 'n', k: 53, vers: 'quai' }] },
  H: { bx: 29, by: 28, bw: 4, bh: 4, cx: 42, cy: 40, theme: 'cendre', devise: 'L\'île où dort le volcan.', quartiers: { maisons: 5, parc: 1, place: 1, marche: 1, jardins: 0 },
    sorties: [{ dir: 'n', k: 60, vers: 'plage-n' }, { dir: 'w', k: 40, vers: 'plage-w' }] },
  L: { bx: 21, by: 25, bw: 5, bh: 5, cx: 40, cy: 40, theme: 'ecaille', devise: 'Capitale de l\'archipel.', statue: 'statue_dragon', quartiers: { maisons: 6, parc: 1, place: 1, marche: 1, jardins: 0 },
    sorties: [{ dir: 'e', k: 50, vers: 'r11' }, { dir: 'n', k: 60, vers: 'cap', garde: 'garde-cap' }, { dir: 's', k: 60, vers: 'r12' }] },
  I: { bx: 15, by: 24, bw: 4, bh: 4, cx: 32, cy: 36, theme: 'cime', devise: 'La cité des dragons anciens.', statue: 'statue_dragon', quartiers: { maisons: 5, parc: 1, place: 1, marche: 1, jardins: 0 },
    sorties: [{ dir: 'w', k: 52, vers: 'r10' }, { dir: 'n', k: 30, vers: 'r9', garde: 'garde' }, { dir: 'e', k: 52, vers: 'plage' }] },
  J: { bx: 11, by: 9, bw: 5, bh: 6, cx: 43, cy: 70, theme: 'plateau', releve: false, devise: 'Le sommet des dresseurs.', quartiers: { maisons: 0, parc: 3, place: 1, marche: 0, jardins: 0, zen: 3, fleurs: 2, verger: 2 }, defaut: 'esplanade', pasX: [34, 46], pasY: [26, 36], saute: 0.4, arbres: ['erable', 'cerisier'], statue: 'statue',
    sorties: [{ dir: 's', k: 59, vers: 'r9b' }] },
  // Terres du Sud
  SM: { bx: 3, by: 36, bw: 12, bh: 8, cx: 96, cy: 66, theme: 'metro', releve: true, organique: false, pasX: [20, 26], pasY: [15, 19], saute: 0.06, devise: 'La ville qui ne dort jamais.', quartiers: { maisons: 6, parc: 2, place: 2, marche: 1, jardins: 0, affaires: 8 },
    sorties: [{ dir: 'n', k: 150, vers: 'r13' }, { dir: 'e', k: 100, vers: 'r14', garde: 'garde-est' }, { dir: 's', k: 130, vers: 'r20', garde: 'garde-sud' }] },
  SP: { bx: 22, by: 34, bw: 7, bh: 6, cx: 60, cy: 60, theme: 'lisiere', mer: 'n', digue: true, devise: 'Là où le vent prend son élan.', quartiers: { maisons: 7, parc: 1, place: 1, marche: 1, jardins: 1 },
    sorties: [{ dir: 'w', k: 90, vers: 'r14' }, { dir: 'e', k: 80, vers: 'r15', garde: 'garde' }] },
  SN: { bx: 35, by: 35, bw: 6, bh: 5, cx: 50, cy: 40, theme: 'marais', devise: 'On y entre en bottes, on en sort en rampant.', quartiers: { maisons: 6, parc: 1, place: 1, marche: 1, jardins: 1 },
    sorties: [{ dir: 'w', k: 55, vers: 'r15' }, { dir: 's', k: 70, vers: 'r16', garde: 'garde' }] },
  SD: { bx: 41, by: 47, bw: 6, bh: 5, cx: 50, cy: 40, theme: 'dunes', devise: 'Le vent sculpte la ville chaque nuit.', arbres: ['palm', 'cactus', 'palm'], quartiers: { maisons: 6, parc: 1, place: 1, marche: 1, jardins: 0 },
    sorties: [{ dir: 'n', k: 60, vers: 'r16' }, { dir: 'w', k: 80, vers: 'r17', garde: 'garde' }] },
  SF: { bx: 27, by: 49, bw: 6, bh: 5, cx: 50, cy: 40, theme: 'forge', releve: true, organique: false, pasX: [30, 38], pasY: [22, 28], saute: 0.25, devise: 'Le cœur battant de l\'industrie du Sud.', quartiers: { maisons: 5, parc: 1, place: 1, marche: 1, jardins: 0, affaires: 3 },
    sorties: [{ dir: 'e', k: 55, vers: 'r17' }, { dir: 'w', k: 60, vers: 'r18', garde: 'garde' }] },
  SR: { bx: 15, by: 50, bw: 6, bh: 5, cx: 48, cy: 40, theme: 'rose', devise: 'La ville qui sent bon le rêve.', arbres: ['cerisier', 'cerisier', 'erable'], quartiers: { maisons: 6, parc: 2, place: 1, marche: 1, jardins: 2 },
    sorties: [{ dir: 'e', k: 50, vers: 'r18' }, { dir: 'w', k: 60, vers: 'r19', garde: 'garde' }] },
  SO: { bx: 2, by: 50, bw: 6, bh: 5, cx: 48, cy: 40, theme: 'ombre', devise: 'Ici, même la lune baisse les yeux.', arbres: ['lanterne', 'erable'], quartiers: { maisons: 7, parc: 1, place: 1, marche: 1, jardins: 0 },
    sorties: [{ dir: 'e', k: 55, vers: 'r19' }, { dir: 'n', k: 64, vers: 'r20' }] },
};
// les villes qu'on visite après Sylvebourg sont plus petites que leur territoire (echelle : part de chaque côté) : la
// ville au milieu, la forêt tout autour, des avenues d'accès depuis les portes (quartiers.js, noyau)
const ECHELLES = { C: 0.75, D: 0.75, E: 0.72, F: 0.74, G: 0.75, K: 0.75, H: 0.75, L: 0.75, I: 0.75, J: 0.75, SM: 0.68, SP: 0.74, SN: 0.75, SD: 0.74, SF: 0.72, SR: 0.75, SO: 0.75 };
for (const [k, v] of Object.entries(VILLES)) Object.assign(v, { x: v.bx * BLOC, y: v.by * BLOC, w: v.bw * BLOC, h: v.bh * BLOC, echelle: ECHELLES[k] ?? 1 });

/** case juste devant une porte de ville (hors de la ville) et direction en sortant */
export function porte(lettre, vers) {
  const V = VILLES[lettre], s = V.sorties.find((q) => q.vers === vers);
  if (!s) throw new Error(`porte ${lettre} → ${vers} inconnue`);
  const x = s.dir === 'n' || s.dir === 's' ? V.x + s.k : s.dir === 'w' ? V.x - 1 : V.x + V.w;
  const y = s.dir === 'e' || s.dir === 'w' ? V.y + s.k : s.dir === 'n' ? V.y - 1 : V.y + V.h;
  return { x, y, dir: s.dir };
}
/** la même, vue d'une route qui arrive (direction vers la ville) */
export const arrivee = (lettre, vers) => { const p = porte(lettre, vers); return { ...p, dir: { n: 's', s: 'n', e: 'w', w: 'e' }[p.dir] }; };

/** territoires des routes (blocs) */
export const TERR = {
  r1: [[1, 19, 3, 21]],
  r2: [[1, 6, 5, 12]],
  bois: [[6, 6, 9, 11]],
  r3: [[9, 1, 11, 5], [12, 4, 12, 5]],
  r3e: [[13, 4, 13, 5], [14, 1, 18, 5]],
  r4: [[24, 1, 30, 8]],
  r5: [[24, 9, 37, 11], [24, 8, 25, 8], [33, 8, 37, 8]],
  r6: [[26, 12, 31, 15]],
  r7: [[32, 19, 37, 22]],
  r10: [[5, 23, 14, 27]],
  r9: [[15, 16, 18, 23], [13, 18, 14, 22]],
  r9b: [[11, 15, 14, 17]],
  r11: [[26, 25, 27, 32]],
  r12: [[21, 30, 25, 32]],
  // Terres du Sud
  r13: [[8, 34, 9, 35]],
  r14: [[15, 34, 21, 41]],
  r15: [[29, 34, 34, 41]],
  r16: [[34, 40, 47, 46]],
  r17: [[33, 47, 40, 54]],
  r18: [[21, 46, 26, 55]],
  r19: [[8, 49, 14, 55]],
  r20: [[2, 44, 10, 48], [2, 49, 5, 49]],
};

/** la Forêt des Torii (lieu fait main, world/quetes.js et world/cendree.js) : son ancien rectangle et son décalage, pour
 *  que son sentier débouche sur la porte ouest (y 407) de Mirage */
export const TORII = { zone: [158, 148, 275, 199], dx: VILLES.G.x - 276, dy: VILLES.G.y + 71 - 164 };
/** le Mont Lunaire (montagnes.js) : ancien rectangle, décalage ; ses grottes (Grotte Lunaire) */
export const LUNAIRE = { zone: [137, 10, 184, 50], dx: 146, dy: 52 };
/** la Chaîne Céleste : blocs de montagne (roche infranchissable, où serpente la Route Victoire) */
export const CHAINE = [[10, 6, 18, 22], [11, 0, 14, 3]];
