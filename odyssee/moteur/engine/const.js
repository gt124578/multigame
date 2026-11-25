// odyssee/moteur/engine/const.js — constantes du moteur de terrain (sans DOM).
// Organisation reprise de HeartGold / SoulSilver : une case = une permission (bloquée ou non) + un comportement
// (herbe, eau, rebord, porte…) + une hauteur. Tout ce que fait une case vient de son comportement, jamais d'un cas
// particulier écrit dans le code du joueur.

/** taille d'un bloc de carte, en cases (comme les « land data » 32 × 32 de HGSS) */
export const BLOC = 32;

/** directions, dans l'ordre des planches de personnages HGSS (haut, bas, gauche, droite) */
export const HAUT = 0, BAS = 1, GAUCHE = 2, DROITE = 3;
export const DX = [0, 0, -1, 1];
export const DY = [-1, 1, 0, 0];
export const OPPOSE = [BAS, HAUT, DROITE, GAUCHE];
export const NOMS_DIR = ['haut', 'bas', 'gauche', 'droite'];
export const dirDe = (nom) => {
  const i = NOMS_DIR.indexOf(nom);
  if (i < 0) throw new Error(`direction inconnue : ${nom}`);
  return i;
};

/** le moteur tourne à pas fixe : 60 pas par seconde, quel que soit l'écran */
export const PAS_PAR_SECONDE = 60;

/** durée d'un déplacement d'une case, en pas (marche HGSS : 16 images à 60 i/s) */
/** vélo de HGSS : il démarre doucement et prend de l'élan pas après pas (durée de chaque pas, puis la croisière) */
export const ELAN_VELO = [12, 8, 6, 4];
/** glace à pentes (Arène de Frimapic, Platine) : durée d'une case de glissade selon la vitesse 0 à 3 */
export const VITESSE_GLACE = [8, 6, 4, 2];

export const VITESSE = {
  marche: 16,
  course: 8,
  velo: 4,       // vitesse de croisière du vélo (après l'élan)
  surf: 8,
  glisse: 4,      // glace, tapis roulants
  pnj: 16,
  pnjLent: 32,
  saut: 32,       // un rebord : deux cases en 32 pas
  heurt: 32,      // marcher contre un mur : pas sur place, plus lent
  demiTour: 8,    // appui bref : le joueur se tourne sans avancer
};

/**
 * Comportements de case (« map behaviors »). Chaque comportement a ses propriétés dans PROPS : c'est la seule table
 * à consulter pour savoir ce que fait une case.
 */
export const MB = {
  NORMAL: 0,
  HERBE: 1,          // hautes herbes : rencontres
  HERBE_DENSE: 2,    // herbes très hautes : rencontres, pas de vélo, pas de course
  EAU: 3,            // surf, rencontres aquatiques
  FLAQUE: 4,         // eau peu profonde : on y marche
  CASCADE: 5,        // courant qui pousse vers le bas
  GLACE: 6,          // on glisse jusqu'à un obstacle
  SABLE: 7,          // pas de course
  REBORD_BAS: 8,     // saut d'un rebord, vers le bas seulement
  REBORD_HAUT: 9,
  REBORD_GAUCHE: 10,
  REBORD_DROITE: 11,
  PORTE: 12,         // téléporteur en entrant sur la case
  TAPIS_BAS: 13,     // tapis de sortie : on sort en avançant vers le bas
  TAPIS_HAUT: 14,
  TAPIS_GAUCHE: 15,
  TAPIS_DROITE: 16,
  ESCALIER: 17,      // téléporteur en entrant (escaliers d'intérieur, échelles)
  MARCHES: 18,       // marches entre deux hauteurs, franchies dans l'axe
  TAPIS_ROULANT_HAUT: 20,
  TAPIS_ROULANT_BAS: 21,
  TAPIS_ROULANT_GAUCHE: 22,
  TAPIS_ROULANT_DROITE: 23,
  COMPTOIR: 24,      // on parle par-dessus (vendeurs)
  TROU: 25,          // on tombe à l'étage du dessous
  NEIGE: 26,         // empreintes, pas de vélo
  BLOQUE_NS: 27,     // on n'y entre ni n'en sort vers le nord ou le sud (Platine : TILE_BEHAVIOR_BLOCK_NORTH_AND_SOUTH)
  BLOQUE_EO: 28,     // de même vers l'est ou l'ouest
};

const P = (o) => Object.freeze({
  rencontre: null, surf: false, glisse: false, force: null, rebord: null, warp: null, tapis: null,
  pasCourse: false, pasVelo: false, comptoir: false, marches: false, bloque: null, ...o,
});

/** propriétés de chaque comportement */
export const PROPS = (() => {
  const t = [];
  for (let i = 0; i < 64; i++) t[i] = P({});
  t[MB.HERBE] = P({ rencontre: 'herbe' });
  t[MB.HERBE_DENSE] = P({ rencontre: 'herbe', pasCourse: true, pasVelo: true });
  t[MB.EAU] = P({ rencontre: 'eau', surf: true });
  t[MB.CASCADE] = P({ surf: true, force: BAS });
  t[MB.GLACE] = P({ glisse: true });
  t[MB.SABLE] = P({ pasCourse: true });
  t[MB.REBORD_BAS] = P({ rebord: BAS });
  t[MB.REBORD_HAUT] = P({ rebord: HAUT });
  t[MB.REBORD_GAUCHE] = P({ rebord: GAUCHE });
  t[MB.REBORD_DROITE] = P({ rebord: DROITE });
  t[MB.PORTE] = P({ warp: 'entree' });
  t[MB.TAPIS_BAS] = P({ tapis: BAS });
  t[MB.TAPIS_HAUT] = P({ tapis: HAUT });
  t[MB.TAPIS_GAUCHE] = P({ tapis: GAUCHE });
  t[MB.TAPIS_DROITE] = P({ tapis: DROITE });
  t[MB.ESCALIER] = P({ warp: 'entree' });
  t[MB.MARCHES] = P({ marches: true });
  t[MB.TAPIS_ROULANT_HAUT] = P({ force: HAUT });
  t[MB.TAPIS_ROULANT_BAS] = P({ force: BAS });
  t[MB.TAPIS_ROULANT_GAUCHE] = P({ force: GAUCHE });
  t[MB.TAPIS_ROULANT_DROITE] = P({ force: DROITE });
  t[MB.COMPTOIR] = P({ comptoir: true });
  t[MB.TROU] = P({ warp: 'chute' });
  t[MB.NEIGE] = P({ pasVelo: true });
  t[MB.BLOQUE_NS] = P({ bloque: 'ns' });
  t[MB.BLOQUE_EO] = P({ bloque: 'eo' });
  return Object.freeze(t);
})();

/** générateur pseudo-aléatoire à graine (même suite partout : Node, Chrome, Firefox) */
export function rng(graine) {
  let s = (graine >>> 0) || 0x9e3779b9;
  const f = () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  f.etat = () => s;
  f.fixer = (v) => { s = (v >>> 0) || 0x9e3779b9; };
  return f;
}
