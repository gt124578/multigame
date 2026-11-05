// odyssee/js/world/rival.js — logique stratégique et difficulté adaptative des combats contre le Rival (Théo & Rival B)
import { createMon } from '../core/mon.js';
import { SPECIES } from '../data/species.js';

/**
 * Calcule le niveau maximum actuel de l'équipe du joueur.
 */
export function getPlayerMaxLevel(party) {
  if (!Array.isArray(party) || party.length === 0) return 5;
  const lvls = party.map((m) => m?.lvl || 1).filter((l) => typeof l === 'number' && !isNaN(l));
  return lvls.length ? Math.max(5, ...lvls) : 5;
}

// Natures stratégiques compétitives :
// 3: Adamant (Rigide: +Atk -SpA), 8: Modest (Modeste: +SpA -Atk), 10: Timid (Timide: +Vit -Atk),
// 13: Jolly (Jovial: +Vit -SpA), 5: Bold (Assuré: +Def -Atk), 15: Impish (Malin: +Def -SpA), 23: Careful (Prudent: +SpDef -SpA)
export const STRAT_NATURES = {
  1010: 13, 1011: 13, 1012: 13, // Ligne Plumorage : Jovial (+Vit)
  1013: 3,                     // Grignotin : Rigide
  1034: 10, 1035: 10,          // Ligne Gerboltz : Timide (+Vit)
  1021: 15, 1022: 15,          // Ligne Champitron : Malin (+Def)
  1039: 8,  1040: 8,           // Ligne Rêvelaine : Modeste (+SpA)
  1043: 13, 1044: 13,          // Ligne Nocturmine : Jovial (+Vit)
  1046: 15,                    // Morsegivre : Malin (+Def)
  1051: 3,                     // Cieldrake : Rigide (+Atk)
  148: 23,  149: 3,            // Draco: Prudent / Dracolosse: Rigide

  // Starters
  1001: 8, 1002: 8, 1003: 8,   // Ligne Capysaule : Modeste (+SpA)
  1004: 10, 1005: 10, 1006: 10,// Ligne Lustrelle : Timide (+Vit)
  1007: 3, 1008: 3, 1009: 3,   // Ligne Narvaillant : Rigide (+Atk)
  1: 8, 2: 8, 3: 5,            // Bulbizarre / Florizarre : Assuré
  4: 10, 5: 10, 6: 10,         // Salamèche / Dracaufeu : Timide
  7: 5, 8: 5, 9: 5,            // Carapuce / Tortank : Assuré
  152: 5, 153: 5, 154: 5,      // Germignon / Méganium : Assuré
  155: 10, 156: 10, 157: 10,   // Héricendre / Typhlosion : Timide
  158: 3, 159: 3, 160: 3,      // Kaiminus / Aligatueur : Rigide
};

// Objets stratégiques compétitifs équipés à partir de la 3e arène (badges >= 3)
export const STRAT_ITEMS = {
  // Starters finaux
  1003: 'leftovers',
  1006: 'life-orb',
  1009: 'life-orb',
  3: 'leftovers',
  6: 'life-orb',
  9: 'leftovers',
  154: 'leftovers',
  157: 'choice-specs',
  160: 'life-orb',

  // Équipiers Théo
  1011: 'focus-sash',
  1012: 'focus-sash',  // Plumorage : survit à 1 PV et contre-attaque
  1013: 'sitrus-berry',
  1034: 'magnet',
  1035: 'choice-specs',// Gerboltz : Atq Spé colossale
  1021: 'eviolite',
  1022: 'leftovers',   // Champitron : Restes + sangsue
  1040: 'leftovers',   // Rêvelaine : Restes + Plénitude
  1051: 'lum-berry',   // Cieldrake : Danse Draco + Colère sans confusion

  // Équipiers Rival B
  1043: 'eviolite',
  1044: 'life-orb',    // Nocturmine : Danse Lames + Orbe Vie
  1015: 'focus-sash',
  1016: 'focus-sash',
  1039: 'eviolite',
  148: 'eviolite',     // Draco : Évoluroc (+50% Def / SpDef)
  149: 'lum-berry',    // Dracolosse : Danse Draco + Colère
  1046: 'rocky-helmet',// Morsegivre : Casque Brut
};

// Sets stratégiques avancés / fin de jeu (badges >= 6)
export const STRAT_MOVES_LATE = {
  // 1012 Plumorage (Rapace, Close Combat, Vive-Attaque, Danse Lames)
  1012: [413, 370, 98, 14],
  // 1035 Gerboltz (Tonnerre, Machination, Exploforce, Ball'Ombre)
  1035: [85, 417, 411, 247],
  // 1022 Champitron (Spore, Giga-Sangsue, Bombe Beurk, Vampigraine)
  1022: [147, 202, 188, 73],
  // 1040 Rêvelaine (Plénitude, Psyko, Éco-Sphère, Ball'Ombre)
  1040: [347, 94, 412, 247],
  // 1044 Nocturmine (Danse Lames, Tranche-Nuit, Séisme, Éboulement)
  1044: [14, 400, 89, 157],
  // 1046 Morsegivre (Laser Glace, Hydrocanon, Séisme, Repos)
  1046: [58, 56, 89, 156],
  // 1051 Cieldrake (Danse Draco, Colère, Lame de Roc, Poing Feu)
  1051: [349, 200, 444, 7],
  // 149 Dracolosse (Danse Draco, Colère, Séisme, Vitesse Extrême)
  149: [349, 200, 89, 245],
  // 148 Draco (Cage Éclair, Laser Glace, Dracogriffe, Repos)
  148: [86, 58, 337, 156],

  // Starters finaux
  1003: [412, 188, 89, 235], // Capysaule (Éco-Sphère, Bombe Beurk, Séisme, Synthèse)
  3: [202, 188, 89, 79],     // Florizarre (Giga-Sangsue, Bombe Beurk, Séisme, Poudre Dodo)
  154: [202, 89, 235, 92],    // Méganium (Giga-Sangsue, Séisme, Synthèse, Toxik)

  1006: [126, 399, 411, 417], // Lustrelle (Déflagration, Vibrobscur, Exploforce, Machination)
  6: [53, 403, 411, 89],      // Dracaufeu (Lance-Flammes, Lame d'Air, Exploforce, Séisme)
  157: [126, 411, 247, 53],   // Typhlosion (Déflagration, Exploforce, Ball'Ombre, Lance-Flammes)

  1009: [349, 127, 242, 89],  // Narvaillant (Danse Draco, Cascade, Mâchouille, Séisme)
  9: [56, 58, 94, 182],       // Tortank (Hydrocanon, Laser Glace, Psyko, Abri)
  160: [349, 127, 242, 8],    // Aligatueur (Danse Draco, Cascade, Mâchouille, Poinglace)
};

// Sets stratégiques intermédiaires (badges >= 3 && badges < 6)
export const STRAT_MOVES_MID = {
  1011: [17, 98, 403, 14],    // Piouffon (Cru-Ailes, Vive-Attaque, Lame d'Air, Danse Lames)
  1012: [17, 98, 403, 14],    // Plumorage
  1034: [85, 98, 86, 247],    // Gerbizz (Tonnerre, Vive-Attaque, Cage Éclair, Ball'Ombre)
  1035: [85, 98, 86, 247],    // Gerboltz
  1021: [202, 79, 73, 188],   // Champinou (Giga-Sangsue, Poudre Dodo, Vampigraine, Bombe Beurk)
  1022: [202, 79, 73, 188],   // Champitron
  1039: [94, 247, 86, 113],   // Songebelle (Psyko, Ball'Ombre, Cage Éclair, Protection)
  1040: [94, 247, 86, 113],   // Rêvelaine
  1043: [400, 44, 98, 14],    // Sombrecaille (Tranche-Nuit, Morsure, Vive-Attaque, Danse Lames)
  1044: [400, 89, 98, 14],    // Nocturmine
  1015: [143, 17, 98, 14],
  1016: [413, 17, 98, 14],

  // Starters intermédiaires
  1002: [202, 79, 73, 188],   // Capyflore
  1005: [53, 399, 98, 261],   // Ciroulet
  1008: [127, 242, 98, 8],    // Narvalier
  2: [202, 79, 73, 188],      // Herbizarre
  5: [53, 157, 98, 261],      // Reptincel
  8: [127, 58, 242, 182],     // Carabaffe
  153: [202, 79, 73, 92],     // Macronium
  156: [53, 98, 247, 261],    // Feurisson
  159: [127, 242, 98, 8],     // Crocrodil
};

/**
 * Crée l'équipe du rival avec auto-leveling, IVs parfaits, natures adaptées,
 * objets stratégiques (uniquement à partir de la 3e arène) et movesets évolutifs.
 * 
 * @param {object} game - Instance principale du jeu
 * @param {Array<[number, number]>} rawTeamSpec - Spécification [[spId, baseLvl], ...]
 * @returns {Array<object>} - Équipe de créatures prêtes pour le combat
 */
export function buildRivalParty(game, rawTeamSpec) {
  const st = game.state;
  const badges = Array.isArray(st.badges) ? st.badges.filter(Boolean).length : 0;
  const maxPlayerLvl = getPlayerMaxLevel(st.party);

  return rawTeamSpec.map(([sp, baseLvl], idx) => {
    // Le starter du rival est toujours le dernier Pokémon de la liste
    const isStarter = idx === rawTeamSpec.length - 1;

    // Règle 1 : Tous ses Pokémon sont au même niveau que le max de notre équipe,
    // sauf son starter qui a 2 niveaux de plus !
    // Début du jeu (aucun badge) : Théo est à ta hauteur — même niveau pour son starter, un de moins pour les autres,
    // et des IV ordinaires. La règle « +2 niveaux, IV parfaits » ne s'applique qu'à partir du premier badge.
    const early = badges < 1;
    const lvl = early
      ? (isStarter ? Math.max(baseLvl, maxPlayerLvl) : Math.max(baseLvl, maxPlayerLvl - 1))
      : (isStarter ? Math.max(baseLvl, maxPlayerLvl + 2) : Math.max(baseLvl, maxPlayerLvl));

    // Règle 2 : IVs à fond (31 partout), sauf au tout début
    const iv = early ? undefined : [31, 31, 31, 31, 31, 31];

    // Nature stratégique compétitive
    const nat = STRAT_NATURES[sp] ?? (SPECIES[sp]?.b[1] >= SPECIES[sp]?.b[3] ? 3 : 8);

    // Règle 3 : Objets stratégiques UNIQUEMENT à partir de la 3e arène (badges >= 3)
    let item = null;
    if (badges >= 3) {
      item = STRAT_ITEMS[sp] || (isStarter ? (badges >= 6 ? 'life-orb' : 'sitrus-berry') : null);
    }

    // Règle 4 : Sets stratégiques adaptatifs
    // - Au début (< 3 badges) : capacités naturelles du niveau (defaultMoves)
    // - Milieu (3 à 5 badges) : movesets intermédiaires
    // - Fin de jeu (>= 6 badges) : movesets compétitifs complets
    let moves = null;
    if (badges >= 6 && STRAT_MOVES_LATE[sp]) {
      moves = STRAT_MOVES_LATE[sp];
    } else if (badges >= 3 && (STRAT_MOVES_MID[sp] || STRAT_MOVES_LATE[sp])) {
      moves = STRAT_MOVES_MID[sp] || STRAT_MOVES_LATE[sp];
    }

    return createMon(sp, lvl, {
      iv,
      nat,
      item,
      moves,
      shiny: false,
    });
  });
}

/**
 * Détermine les objets de soin portés par le rival selon la progression dans le jeu.
 * 
 * @param {object} game - Instance principale du jeu
 * @returns {Record<string, number>} - Objets utilisables par l'IA
 */
export function getRivalItems(game) {
  const badges = Array.isArray(game.state.badges) ? game.state.badges.filter(Boolean).length : 0;
  // Au labo (0 badge) : combat amical d'apprentissage
  if (badges < 1) return {};
  // Avant 3 arènes (badges 1-2) : 1 Potion
  if (badges < 3) return { 'potion': 1 };
  // 3-4 badges (Floralia, Cap Mirage) : 2 Super Potions
  if (badges < 5) return { 'super-potion': 2 };
  // 5-6 badges (Port-Granit, Fort-Écaille) : 2 Hyper Potions
  if (badges < 7) return { 'hyper-potion': 2 };
  // 7+ badges (Ligue & post-ligue) : 2 Guérisons complètes (Full Restore)
  return { 'full-restore': 2 };
}
