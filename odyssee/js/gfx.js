// odyssee/js/gfx.js — choix des graphismes (Options → Graphismes) : le sol du dehors et le style des sprites de Pokémon.
// Les choix sont gardés dans le navigateur (localStorage). Le sol se charge au lancement du jeu (il faut relancer pour
// le changer) ; les sprites se lisent à chaque image demandée (assets.js) et changent tout de suite pour les nouveaux écrans.

const lire = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* navigation privée : le choix ne dure que le temps de la page */ } };

/** sol du dehors : « odyssee » (sol généré, relief 3D), « classique » (tuiles d'origine) ou un pack de tuiles Pokémon */
export const SOLS_CHOIX = [
  { id: 'odyssee', nom: 'Odyssée (de base)', info: 'les graphismes d\'origine du jeu' },
  { id: 'noirblanc', nom: 'Noir & Blanc', info: 'sol, eau, arbres et maisons dans le style Pokémon Noir & Blanc' },
];
/** sprites de Pokémon (face, dos, chromatiques) : HeartGold / SoulSilver (Gen 4) ou Noir / Blanc (Gen 5) */
export const SPRITES_CHOIX = [
  { id: 'hgss', nom: 'HeartGold / SoulSilver', info: 'Gen 4' },
  { id: 'bw', nom: 'Noir & Blanc', info: 'Gen 5' },
];

/** packs de tuiles : dossier sous img/ et fichiers (16 × 16 px, noms du sol classique ; tools/odyssee-pack-sol.py) */
export const PACKS = {
  lumineux: {
    dossier: 'gfx/lumineux',
    tuiles: ['ash0', 'ash1', 'cave0', 'cave1', 'darktall0', 'darktall1', 'deep0', 'deep1', 'deep2', 'deep3', 'forest0', 'forest1',
      'grass0', 'grass1', 'grass2', 'lava0', 'lava1', 'path0', 'pave0', 'sand0', 'snow0', 'snow1', 'snowtall0', 'snowtall1',
      'tall0', 'tall1', 'water0', 'water1', 'water2', 'water3'],
  },
  noirblanc: {
    dossier: 'gfx/noirblanc',
    tuiles: ['ash0', 'ash1', 'cave0', 'cave1', 'darktall0', 'darktall1', 'deep0', 'deep1', 'deep2', 'deep3', 'forest0', 'forest1',
      'grass0', 'grass1', 'grass2', 'lava0', 'lava1', 'path0', 'pave0', 'sand0', 'snow0', 'snow1', 'snowtall0', 'snowtall1',
      'tall0', 'tall1', 'water0', 'water1', 'water2', 'water3'],
    // décor remplacé (fichier d_<nom>.png, dessiné pixel pour pixel)
    decor: ['tree', 'tree2', 'pine', 'snowpine', 'palm', 'bush', 'rock', 'deadtree'],
    // bâtiments entiers du kit Pokémon Essentials BW (b_<nom>.png, 32 px par case : posés pixel pour pixel) :
    // [image, largeur en px, colonne du milieu de la porte]. Le jeu prend l'image dont la largeur colle à l'emprise
    // (à une case et demie près) ; sinon le bâtiment de base reste.
    batiments: {
      center: [['centre', 200, 99]], mart: [['boutique', 148, 91], ['boutique_b', 150, 75]], gym: [['arene', 222, 143]], lab: [['labo', 188, 88]], tower: [['tour', 116, null]],
      house: [['maison_bleue', 154, 48], ['maison_a', 148, 73], ['maison_c', 176, 71], ['maison_d', 150, 75], ['maison_brique', 192, 94], ['maison_b', 200, 99], ['maison_e', 200, 74], ['maison_orange', 246, 134]], house2: [['maison_bleue', 154, 48], ['maison_a', 148, 73], ['maison_c', 176, 71], ['maison_d', 150, 75], ['maison_brique', 192, 94], ['maison_b', 200, 99], ['maison_e', 200, 74], ['maison_orange', 246, 134]], house3: [['maison_bleue', 154, 48], ['maison_a', 148, 73], ['maison_c', 176, 71], ['maison_d', 150, 75], ['maison_brique', 192, 94], ['maison_b', 200, 99], ['maison_e', 200, 74], ['maison_orange', 246, 134]], bighouse: [['maison_bleue', 154, 48], ['maison_a', 148, 73], ['maison_c', 176, 71], ['maison_d', 150, 75], ['maison_brique', 192, 94], ['maison_b', 200, 99], ['maison_e', 200, 74], ['maison_orange', 246, 134]],
    },
  },
};

export function solChoix() {
  // ?sol=0 : ancien sol à tuiles, pour comparer
  try { if (/[?&]sol=0\b/.test(location.search)) return 'classique'; } catch (e) { /* hors navigateur */ }
  const v = lire('odyssee-gfx-sol', null);
  if (v && SOLS_CHOIX.some((s) => s.id === v)) return v;
  return 'odyssee';   // anciens choix (« Classique », « Lumineux ») : retour aux graphismes de base
}
export const spritesChoix = () => (lire('odyssee-gfx-sprites', 'hgss') === 'bw' ? 'bw' : 'hgss');
export const packActif = () => PACKS[solChoix()] || null;

export function choisirSol(id) { if (SOLS_CHOIX.some((s) => s.id === id)) { ecrire('odyssee-gfx-sol', id); ecrire('odyssee-sol', id === 'odyssee' ? '1' : '0'); } }
export function choisirSprites(id) { if (SPRITES_CHOIX.some((s) => s.id === id)) ecrire('odyssee-gfx-sprites', id); }

/** crédits affichés dans Options → Crédits graphismes */
export const CREDITS = [
  ['Sol « Pokémon Lumineux »', 'Tuiles de Flurmimon (planche « Bright »), adaptées par Bivurnum — Team Aqua\'s Asset Repo.'],
  ['Graphismes « Noir & Blanc »', 'Bâtiments, mer et hautes herbes du kit « Pokémon Essentials BW » de KleinStudio ; sol de thefloofypanthar ; lave et rochers de Phyromatical ; arbres des planches Noir & Blanc partagées sur DeviantArt. Graphismes de Pokémon Noir & Blanc © Nintendo / Game Freak.'],
  ['Sprites Noir & Blanc', 'Sprites des jeux Pokémon © Nintendo / Game Freak / Creatures, récupérés par PokeAPI (projet PokeAPI/sprites).'],
  ['Sprites HeartGold / SoulSilver', 'Même source : PokeAPI/sprites.'],
  ['Utilisation', 'Projet de fans sans but lucratif. Les artistes restent propriétaires de leurs créations.'],
];
