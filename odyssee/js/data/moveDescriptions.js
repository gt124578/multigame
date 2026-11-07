// odyssee/js/data/moveDescriptions.js — Descriptions officielles et explicatives des capacités Pokémon en français
import { MOVES } from './moves.js';

export const SPECIFIC_MOVE_DESCS = {
  10002: "Projette un nuage de pollen gluant qui englue la cible : elle subit des dégâts et sa Vitesse baisse.",
  // Capacités uniques et tactiques
  18: "Souffle un violent coup de vent qui force l'ennemi à fuir ou à changer de Pokémon.",
  46: "Un rugissement effrayant qui met fin au combat sauvage ou force l'adversaire à échanger.",
  49: "Envoie une onde de choc qui inflige toujours exactement 20 PV de dégâts fixes.",
  54: "Crée une brume protectrice empêchant l'ennemi de baisser les statistiques de l'équipe.",
  67: "Un coup de pied balayant. Plus la cible est lourde, plus l'attaque est puissante.",
  68: "Riposte en infligeant le double des dégâts physiques subis durant ce tour.",
  69: "Projette l'ennemi au sol. Inflige des dégâts strictement égaux au niveau du lanceur.",
  82: "Projette une onde draconique infligeant toujours exactement 40 PV de dégâts fixes.",
  100: "Téléporte instantanément le lanceur loin du combat contre une créature sauvage.",
  101: "Fait surgir un mirage spectral infligeant des dégâts égaux au niveau du lanceur.",
  113: "Dresse un mur de lumière réduisant de moitié les dégâts spéciaux pendant 5 tours.",
  114: "Répand un nuage de buée noire qui annule immédiatement tous les changements de stats.",
  115: "Crée une barrière psychique réduisant de moitié les dégâts physiques pendant 5 tours.",
  149: "Émet une onde psychique chaotique infligeant des dégâts aléatoires basés sur le niveau.",
  150: "Le lanceur barbotte joyeusement... mais cela ne produit aucun effet en combat !",
  156: "Le lanceur dort pendant 2 tours pour récupérer tous ses PV et guérir de tout statut.",
  162: "Plante des crocs acérés pour réduire les PV actuels de la cible de moitié.",
  165: "Attaque de désespoir quand le lanceur n'a plus de PP. Blesse aussi le lanceur.",
  175: "Plus les PV du lanceur sont bas, plus cette attaque inflige des dégâts colossaux.",
  179: "Contre-attaque désespérée dont la puissance augmente drastiquement si les PV sont bas.",
  182: "Esquive totalement les attaques ennemies ce tour-ci. Peut échouer si réutilisé.",
  187: "Sacrifie la moitié de ses PV max pour booster instantanément l'Attaque au maximum (+6) !",
  197: "Anticipe les coups adverses pour esquiver toute attaque ce tour-ci. Peut échouer si réutilisé.",
  206: "Une attaque retenue qui laisse toujours la cible à au moins 1 PV (idéal pour la capture).",
  216: "Attaque d'amitié dont la puissance augmente si le Pokémon est très attaché à son dresseur.",
  217: "Offre un cadeau surprise qui inflige de gros dégâts aléatoires ou soigne parfois la cible.",
  218: "Attaque de colère dont la puissance augmente si le Pokémon déteste son dresseur.",
  219: "Crée une aura bienfaisante protégeant l'équipe des altérations de statut pendant 5 tours.",
  220: "Additionne les PV restants des deux combattants et les partage équitablement.",
  222: "Provoque un tremblement de terre d'intensité variable (Magnitude 4 à 10).",
  237: "Une onde mystérieuse dont le type et la puissance dépendent du potentiel du Pokémon.",
  243: "Renvoie le double des dégâts spéciaux subis durant le tour.",
  263: "La puissance de l'attaque est doublée si le lanceur est brûlé, paralysé ou empoisonné.",
  283: "Ronge les forces de l'adversaire pour réduire ses PV au même niveau que le lanceur.",

  // Attaques de statut et boosts
  14: "Une danse belliqueuse qui augmente beaucoup l'Attaque du lanceur (+2).",
  39: "Remue gentiment la queue pour distraire l'ennemi et baisser sa Défense (-1).",
  43: "Un regard terrifiant qui baisse la Défense de la cible d'un niveau (-1).",
  45: "Pousse un cri intimidant pour baisser l'Attaque de la cible d'un niveau (-1).",
  73: "Plante des graines sur l'ennemi pour lui voler des PV à chaque fin de tour.",
  76: "Répand une poussière toxique qui empoisonne la cible.",
  77: "Endort profondément la cible grâce à un doux nuage de pollen somnifère.",
  78: "Projette des spores paralysantes qui paralysent l'adversaire.",
  86: "Envoie une onde électrique qui paralyse à coup sûr le Pokémon ennemi.",
  95: "Un violent souffle toxique qui empoisonne gravement la cible (dégâts progressifs).",
  97: "Détend son corps pour courir plus vite. Augmente beaucoup la Vitesse (+2).",
  104: "Se déplace si vite qu'il crée des clones illusoires. Augmente l'Esquive (+1).",
  109: "Un rayon mystérieux plonge la cible dans une profonde confusion.",
  110: "Rend le corps dur comme du roc pour augmenter la Défense d'un niveau (+1).",
  111: "S'enroule sur lui-même pour dissimuler ses faiblesses. Augmente la Défense (+1).",
  139: "Projette un nuage de gaz étouffant qui empoisonne l'adversaire.",
  142: "Fait un bisou avec une moue terrifiante qui endort la cible.",
  339: "Gonfle ses muscles pour augmenter son Attaque et sa Défense d'un niveau (+1).",
  347: "Médite profondément pour augmenter l'Attaque Spéciale et la Défense Spéciale (+1).",
  349: "Une danse mystique qui augmente à la fois l'Attaque et la Vitesse du lanceur (+1).",

  // Attaques directes emblématiques
  1: "Frappe l'ennemi avec les pattes avant ou la queue dans un impact physique.",
  2: "Frappe l'ennemi d'un coup tranchant de la main. Taux de coups critiques élevé.",
  10: "Lacère l'ennemi avec des griffes acérées pour lui infliger des dégâts physiques.",
  11: "Serre violemment l'ennemi entre deux puissantes pinces pour lui infliger des dégâts.",
  33: "Le lanceur charge l'ennemi de tout son corps dans un impact physique direct.",
  36: "Une charge tête baissée très brutale infligeant 25% de dégâts de recul au lanceur.",
  37: "Attaque avec fureur pendant 2 à 3 tours, puis devient confus par épuisement.",
  38: "Une charge désespérée d'une grande violence causant 33% de dégâts de recul.",
  44: "Mord l'ennemi de ses crocs acérés. 30% de chance d'apeurer la cible.",
  52: "Frappe violemment avec une massue ou un os. Frappe 2 à 5 fois d'affilée.",
  55: "Projette un jet d'eau puissant sur la cible.",
  56: "Projette une violente trombe d'eau surpressée sur la cible.",
  57: "Projette une grande vague d'eau qui submerge tout le champ de bataille.",
  63: "Tire un rayon destructeur d'une puissance inouïe. Le lanceur doit se reposer au tour suivant.",
  71: "Une gerbe de feuilles acérées lacère l'ennemi. Taux de coups critiques élevé.",
  72: "Une petite flamme est projetée sur l'ennemi. 10% de chance de brûler.",
  80: "Une danse florale furieuse pendant 2 à 3 tours, puis devient confus par épuisement.",
  84: "Lance une décharge électrique sur l'ennemi. 10% de chance de paralyser.",
  85: "Projette un torrent de flammes incandescentes sur la cible. 10% de chance de brûler.",
  88: "Jette des cailloux sur l'ennemi pour lui infliger des dégâts physiques.",
  89: "Un violent tremblement de terre secoue le terrain et inflige d'énormes dégâts.",
  91: "Creuse sous terre au 1er tour pour éviter les attaques, puis frappe au 2e tour.",
  93: "Une onde télékinétique attaque l'ennemi. 10% de chance de le rendre confus.",
  94: "Une puissante foudre foudroie la cible. 10% de chance de paralyser.",
  98: "Fonce à une vitesse fulgurante sur la cible. Frappe toujours en priorité (+1).",
  106: "Durcit les muscles ou la carapace pour augmenter la Défense du lanceur (+1).",
  120: "Fait exploser le corps du lanceur pour infliger des dégâts titanesques, mais tombe K.O.",
  126: "Projette un souffle de feu intense en forme d'idéogramme. 10% de chance de brûler.",
  127: "Charge l'ennemi dans un jaillissement d'eau. 20% de chance d'apeurer la cible.",
  153: "Provoque une explosion cataclysmique dévastant tout autour, mais met le lanceur K.O.",
  157: "Fait s'abattre de lourds rochers sur l'ennemi. 30% de chance d'apeurer.",
  185: "Feinte pour contourner les défenses et toucher même si la cible utilise Abri.",
  200: "Attaque avec une rage destructrice pendant 2 à 3 tours, puis devient confus.",
  202: "Une attaque végétale qui draine les forces ennemies et soigne le lanceur de moitié.",
  209: "Une charge électrique enveloppe l'ennemi. 30% de chance de paralyser.",
  232: "Lacère l'ennemi de griffes d'acier. A 10% de chance d'augmenter l'Attaque du lanceur (+1).",
  242: "Lacère l'ennemi de crocs puissants. 20% de chance de baisser sa Défense (-1).",
  246: "Une attaque préhistorique. 10% de chance d'augmenter toutes les stats d'un niveau !",
  247: "Projette une boule d'énergie ténébreuse. 20% de chance de baisser la Déf. Spé. adverse.",
  291: "Plonge sous l'eau au premier tour, puis jaillit pour frapper au second tour.",
  318: "Bribes d'écailles argentées. 10% de chance d'augmenter toutes les stats d'un niveau !",
  332: "Une attaque aérienne fulgurante qui contourne la défense et ne rate jamais sa cible.",
  337: "Lacère la cible de griffes draconiques acérées sans temps de recharge.",
  340: "Bondit très haut dans les airs au 1er tour et retombe au 2e. 30% de chance de paralyser.",
  344: "Une charge électrique d'une puissance extrême qui blesse le lanceur en contrecoup.",
  389: "Frappe en priorité (+1). Ne fonctionne que si l'ennemi prépare une attaque offensive.",
  394: "Charge enflammée dévastatrice. 10% de chance de brûler, mais 33% de recul.",
  413: "Plonge serres en avant sur la cible. Cause 33% de dégâts de recul au lanceur.",
  422: "Morsure électrifiée. 10% de chance de paralyser et 10% de chance d'apeurer.",
  423: "Morsure glacée. 10% de chance de geler et 10% de chance d'apeurer.",
  424: "Morsure enflammée. 10% de chance de brûler et 10% de chance d'apeurer.",
  444: "Fait jaillir des lames de pierre tranchantes. Taux de coup critique très élevé.",
  453: "Fonce à vive allure entouré d'eau. Frappe toujours en priorité (+1).",
  457: "Un coup de tête d'une violence extrême causant 50% de dégâts de recul au lanceur.",
  466: "Souffle un vent spectral maudit. 10% de chance d'augmenter toutes les stats d'un niveau !",
};

const STAT_NAMES = {
  2: "l'Attaque",
  3: "la Défense",
  4: "l'Atq. Spé.",
  5: "la Déf. Spé.",
  6: "la Vitesse",
  7: "la Précision",
  8: "l'Esquive"
};

const AIL_NAMES = {
  par: 'la paralysie',
  brn: 'une brûlure',
  slp: 'le sommeil',
  psn: 'le poison',
  tox: 'un grave empoisonnement',
  frz: 'le gel',
  con: 'la confusion'
};

/**
 * Renvoie une description en français expliquant clairement ce que fait la capacité.
 * @param {Object|number} moveOrId - Objet capacité de MOVES ou son ID numérique
 * @returns {string} Description explicative
 */
export function moveDesc(moveOrId) {
  if (!moveOrId) return '';
  const M = typeof moveOrId === 'object' ? moveOrId : MOVES[moveOrId];
  if (!M) return '';

  if (SPECIFIC_MOVE_DESCS[M.id]) return SPECIFIC_MOVE_DESCS[M.id];
  if (M.d) return M.d;

  const parts = [];
  const meta = M.m || {};

  if (M.pr && M.pr > 0) parts.push(`Attaque prioritaire (+${M.pr}). Frappe avant les autres capacités.`);
  if (M.pr && M.pr < 0) parts.push(`Attaque ralentie (${M.pr}). Frappe après les autres capacités.`);
  if (meta.crit) parts.push('Taux de coups critiques particulièrement élevé.');
  if (meta.sure) parts.push('Ne rate jamais sa cible.');
  if (meta.h0 && meta.h1) parts.push(`Frappe ${meta.h0} à ${meta.h1} fois en un seul tour.`);
  if (meta.flinch) parts.push(`A ${meta.flinch}% de chance d'apeurer l'adversaire.`);
  if (meta.heal) parts.push(`Restaure ${meta.heal}% des PV max du lanceur.`);
  if (meta.drain && meta.drain > 0) parts.push(`Absorbe ${meta.drain}% des dégâts infligés pour soigner le lanceur.`);
  if (meta.drain && meta.drain < 0) parts.push(`Le lanceur subit ${Math.abs(meta.drain)}% des dégâts infligés en contrecoup.`);
  if (meta.recharge) parts.push('Attaque dévastatrice. Le lanceur doit se reposer au tour suivant.');
  if (meta.charge) parts.push('Attaque en 2 tours. Se concentre au premier tour et frappe au second.');

  if (meta.ail) {
    const name = AIL_NAMES[meta.ail] || meta.ail;
    if (M.c === 'status') parts.push(`Inflige ${name} à la cible.`);
    else parts.push(`A ${meta.ailc || 100}% de chance d'infliger ${name}.`);
  }

  if (meta.st) {
    for (const [sid, stages] of meta.st) {
      const sName = STAT_NAMES[sid] || 'une statistique';
      const isUp = stages > 0;
      const verb = isUp ? 'augmente' : 'baisse';
      const verbInf = isUp ? "d'augmenter" : "de baisser";
      const deg = Math.abs(stages) >= 2 ? 'beaucoup ' : '';
      const tgt = (M.tg === 7 || (isUp && (M.tg !== 10 && M.tg !== 11 || (M.p && M.p > 0)))) ? 'du lanceur' : 'de la cible';
      if (M.c === 'status') {
        parts.push(`${verb[0].toUpperCase() + verb.slice(1)} ${deg}${sName} ${tgt} (${isUp ? '+' : ''}${stages}).`);
      } else {
        parts.push(`A ${meta.stc || 100}% de chance ${verbInf} ${sName} ${tgt} (${isUp ? '+' : ''}${stages}).`);
      }
    }
  }

  if (parts.length === 0) {
    if (M.c === 'status') {
      parts.push('Capacité tactique influençant le déroulement du combat.');
    } else {
      const cat = M.c === 'physical' ? 'physique' : 'spéciale';
      parts.push(`Attaque ${cat} de type ${M.t} infligeant des dégâts directs.`);
    }
  }

  return parts.join(' ');
}
