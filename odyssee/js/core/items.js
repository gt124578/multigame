// odyssee/js/core/items.js — objets : prix, poche du sac, effets (sans DOM)
import { ITEM_NAMES } from '../data/types.js';
import { MOVES } from '../data/moves.js';
import { monName, healFull, gainExp, itemEvolution, expFor } from './mon.js';
import { SPECIES } from '../data/species.js';

// poche : 'soin' | 'balls' | 'objets'
export const ITEMS = {
  'poke-ball': { pocket: 'balls', price: 200, ball: 1, desc: 'Un objet semblable à une capsule, qui capture les Pokémon sauvages.' },
  'great-ball': { pocket: 'balls', price: 600, ball: 1.5, desc: 'Une Ball de bonne qualité, plus efficace que la Poké Ball.' },
  'ultra-ball': { pocket: 'balls', price: 1200, ball: 2, desc: 'Une Ball très performante, plus efficace que la Super Ball.' },
  potion: { pocket: 'soin', price: 300, heal: 20, desc: 'Restaure 20 PV d\'un Pokémon.' },
  'super-potion': { pocket: 'soin', price: 700, heal: 50, desc: 'Restaure 50 PV d\'un Pokémon.' },
  'hyper-potion': { pocket: 'soin', price: 1200, heal: 200, desc: 'Restaure 200 PV d\'un Pokémon.' },
  'max-potion': { pocket: 'soin', price: 2500, heal: 9999, desc: 'Restaure tous les PV d\'un Pokémon.' },
  'full-restore': { pocket: 'soin', price: 3000, heal: 9999, cure: 'all', desc: 'Restaure tous les PV et soigne les problèmes de statut.' },
  revive: { pocket: 'soin', price: 1500, revive: 0.5, desc: 'Ranime un Pokémon K.O. avec la moitié de ses PV.' },
  antidote: { pocket: 'soin', price: 100, cure: ['psn', 'tox'], desc: 'Soigne l\'empoisonnement.' },
  'paralyze-heal': { pocket: 'soin', price: 200, cure: ['par'], desc: 'Soigne la paralysie.' },
  awakening: { pocket: 'soin', price: 250, cure: ['slp'], desc: 'Réveille un Pokémon endormi.' },
  'burn-heal': { pocket: 'soin', price: 250, cure: ['brn'], desc: 'Soigne une brûlure.' },
  'ice-heal': { pocket: 'soin', price: 250, cure: ['frz'], desc: 'Dégèle un Pokémon gelé.' },
  'full-heal': { pocket: 'soin', price: 600, cure: 'all', desc: 'Soigne tous les problèmes de statut.' },
  'oran-berry': { pocket: 'baies', price: 80, heal: 10, desc: 'Une Baie qui restaure 10 PV.' },
  ether: { pocket: 'soin', price: 1200, pp: 10, desc: 'Restaure 10 PP d\'une attaque.' },
  elixir: { pocket: 'soin', price: 3000, ppAll: 10, desc: 'Restaure 10 PP de toutes les attaques.' },
  'escape-rope': { pocket: 'objets', price: 550, desc: 'Une longue corde pour sortir d\'une grotte en un instant.' },
  repel: { pocket: 'objets', price: 350, repel: 100, desc: 'Éloigne les Pokémon sauvages faibles pendant 100 pas.' },
  'super-repel': { pocket: 'objets', price: 500, repel: 200, desc: 'Éloigne les Pokémon sauvages faibles pendant 200 pas.' },
  'max-repel': { pocket: 'objets', price: 700, repel: 250, desc: 'Éloigne les Pokémon sauvages faibles pendant 250 pas.' },
  'rare-candy': { pocket: 'objets', price: 4800, candy: 1, desc: 'Fait monter un Pokémon d\'un niveau.' },
  'fire-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle est orange.' },
  'water-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle est bleue.' },
  'thunder-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle porte un éclair.' },
  'leaf-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle porte une feuille.' },
  'moon-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle est noire comme la nuit.' },
  'sun-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle est rouge comme le soleil.' },
  'dusk-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle est sombre comme le crépuscule.' },
  'dawn-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle scintille comme l\'aube.' },
  'shiny-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle brille d\'un éclat aveuglant.' },
  'ice-stone': { pocket: 'objets', price: 2100, stone: 1, desc: 'Une pierre qui fait évoluer certains Pokémon. Elle est froide comme la glace.' },
  // objets rares : les capacités de terrain (on les utilise face à l'obstacle, avec F)
  'cs-coupe': { pocket: 'ct', price: 0, key: true, field: 'coupe', icon: 'notebook', name: 'CS01 Coupe', desc: 'Tranche les petits arbres qui barrent le chemin. Badge Pétale requis. Place-toi face à l\'arbre et appuie sur F.' },
  'cs-surf': { pocket: 'ct', price: 0, key: true, field: 'surf', icon: 'notebook', name: 'CS02 Surf', desc: 'Traverse l\'eau sur le dos d\'une créature. Badge Mirage requis. Place-toi face à l\'eau et appuie sur F.' },
  'cs-eclate': { pocket: 'ct', price: 0, key: true, field: 'eclate', icon: 'notebook', name: 'CS03 Éclate-Roc', desc: 'Brise les rochers fissurés. Badge Granit requis. Place-toi face au rocher et appuie sur F.' },
  'cs-flash': { pocket: 'ct', price: 0, key: true, field: 'flash', icon: 'notebook', name: 'CS05 Flash', desc: 'Éclaire les grottes plongées dans le noir. Elle agit toute seule dès que tu entres dans une grotte sombre. Badge Élytre requis.' },
  'cs-force': { pocket: 'ct', price: 0, key: true, field: 'force', icon: 'notebook', name: 'CS06 Force', desc: 'Pousse les gros rochers. Place-toi face au rocher, appuie sur F, puis marche contre lui. Badge Volt requis.' },
  medaillon: { pocket: 'cles', price: 0, key: true, icon: 'soothe-bell', name: 'Médaillon', desc: 'Un médaillon gravé d\'une petite fleur. Quelqu\'un de Sylvebourg doit le chercher partout.' },
  'prism-shard': { pocket: 'cles', price: 0, key: true, icon: 'shoal-shell', name: 'Éclat de Prisme', desc: 'Un fragment noir du Prisme de la Team Éclipse. Il est glacé au toucher.' },
  // CT01 : donnée par Hector avec le Badge Élytre ; ne s'use pas
  'ct-01': { pocket: 'ct', price: 0, key: true, ct: 10002, types: ['bug'], icon: 'notebook', name: 'CT01 Pollen Collant', desc: 'Insecte · Spéciale · Puissance 55 · Précision 95. Un nuage de pollen gluant englue la cible et baisse sa Vitesse. Pour les Pokémon Insecte et ceux qui connaissent des attaques Insecte. La CT ne s\'use pas.' },
  'cs-vol': { pocket: 'ct', price: 0, key: true, field: 'vol', icon: 'notebook', name: 'CS04 Vol', desc: 'Ramène en un instant dans une ville déjà visitée (depuis le menu, ou en utilisant cet objet). Badge Braise requis.' },
  // objets de quête des légendaires
  'gs-ball': { pocket: 'cles', price: 0, key: true, icon: 'gift', name: 'Balle GS', desc: 'Une capsule dorée gravée des lettres G et S. Elle semble attirée par l\'autel du Bois Murmure.' },
  'ferry-ticket': { pocket: 'cles', price: 0, key: true, icon: 'letter', name: 'Passe Marin', desc: 'Le passe du bateau de l\'Embarcadère de l\'Aube. Les îles s\'ouvrent au fil des badges.' },
  'plume-arc': { pocket: 'cles', price: 0, key: true, icon: 'rainbow-wing', name: 'Plume Arc-en-ciel', desc: 'Une plume qui brille de sept couleurs. Elle appelle Ho-Oh au sommet de la Tour Dorée.' },
  'plume-argent': { pocket: 'cles', price: 0, key: true, icon: 'silver-wing', name: 'Plume Argentée', desc: 'Une plume d\'argent, douce comme l\'écume. Elle apaise les courants de la Grotte des Tourbillons.' },
  // --- OBJETS DE COMBAT & OBJETS TENUS (Held Items) ---
  leftovers: { pocket: 'objets', price: 4000, hold: 'leftovers', name: 'Restes', desc: "Objet à tenir. Restaure 1/16 des PV max du porteur à la fin de chaque tour." },
  'sitrus-berry': { pocket: 'baies', price: 250, hold: 'sitrus-berry', name: 'Baie Sitrus', desc: "Objet à tenir. Restaure 25% des PV quand le porteur passe sous la moitié de ses PV." },
  'lum-berry': { pocket: 'baies', price: 350, hold: 'lum-berry', name: 'Baie Prun', desc: "Objet à tenir. Guérit automatiquement toute altération de statut (brûlure, paralysie, sommeil...)." },
  'life-orb': { pocket: 'objets', price: 5000, hold: 'life-orb', name: 'Orbe Vie', desc: "Objet à tenir. Augmente la puissance des attaques de 30%, mais coûte 10% des PV max par coup réussi." },
  'choice-band': { pocket: 'objets', price: 6000, hold: 'choice-band', name: 'Bandeau Choix', desc: "Objet à tenir. Augmente l'Attaque de 50%, mais bloque sur la première capacité utilisée." },
  'choice-specs': { pocket: 'objets', price: 6000, hold: 'choice-specs', name: 'Lunettes Choix', desc: "Objet à tenir. Augmente l'Atq. Spé. de 50%, mais bloque sur la première capacité utilisée." },
  'choice-scarf': { pocket: 'objets', price: 6000, hold: 'choice-scarf', name: 'Mouchoir Choix', desc: "Objet à tenir. Augmente la Vitesse de 50%, mais bloque sur la première capacité utilisée." },
  eviolite: { pocket: 'objets', price: 4500, hold: 'eviolite', name: 'Évoluroc', desc: "Objet à tenir. Augmente la Défense et Déf. Spé. de 50% si le Pokémon peut encore évoluer." },
  'focus-sash': { pocket: 'objets', price: 3500, hold: 'focus-sash', name: 'Ceinture Force', desc: "Objet à tenir. Permet de résister à un coup mortel à 1 PV si les PV étaient au max." },
  'rocky-helmet': { pocket: 'objets', price: 4000, hold: 'rocky-helmet', name: 'Casque Brut', desc: "Objet à tenir. Blesse l'attaquant de 1/6 de ses PV max lors de chaque contact direct." },
  'heart-scale': { pocket: 'objets', price: 1000, name: 'Écaille Cœur', desc: "Une jolie écaille marine en forme de cœur. Le Maître des Capacités en raffole." },
  charcoal: { pocket: 'objets', price: 2000, hold: 'charcoal', name: 'Charbon', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Feu." },
  'mystic-water': { pocket: 'objets', price: 2000, hold: 'mystic-water', name: 'Eau Mystique', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Eau." },
  'miracle-seed': { pocket: 'objets', price: 2000, hold: 'miracle-seed', name: 'Graine Miracle', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Plante." },
  magnet: { pocket: 'objets', price: 2000, hold: 'magnet', name: 'Aimant', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Électrik." },
  'black-glasses': { pocket: 'objets', price: 2000, hold: 'black-glasses', name: 'Lunettes Noires', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Ténèbres." },
  'hard-stone': { pocket: 'objets', price: 2000, hold: 'hard-stone', name: 'Pierre Dure', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Roche." },
  'soft-sand': { pocket: 'objets', price: 2000, hold: 'soft-sand', name: 'Sable Doux', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Sol." },
  'sharp-beak': { pocket: 'objets', price: 2000, hold: 'sharp-beak', name: 'Bec Pointu', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Vol." },
  'black-belt': { pocket: 'objets', price: 2000, hold: 'black-belt', name: 'Ceinture Noire', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Combat." },
  'poison-barb': { pocket: 'objets', price: 2000, hold: 'poison-barb', name: 'Pic Venin', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Poison." },
  'twisted-spoon': { pocket: 'objets', price: 2000, hold: 'twisted-spoon', name: 'Cuillère Tordue', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Psy." },
  'silver-powder': { pocket: 'objets', price: 2000, hold: 'silver-powder', name: 'Poudre Argentée', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Insecte." },
  'dragon-fang': { pocket: 'objets', price: 2000, hold: 'dragon-fang', name: 'Croc Dragon', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Dragon." },
  'never-melt-ice': { pocket: 'objets', price: 2000, hold: 'never-melt-ice', name: 'Glace Éternelle', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Glace." },
  'metal-coat': { pocket: 'objets', price: 2000, hold: 'metal-coat', name: 'Peau Métal', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Acier." },
  'silk-scarf': { pocket: 'objets', price: 2000, hold: 'silk-scarf', name: 'Mouchoir Soie', desc: "Objet à tenir. Augmente de 20% la puissance des attaques de type Normal." },
  'town-map': { pocket: 'cles', price: 0, key: true, name: 'Carte', desc: 'La carte de la région d\'Odyssée. On peut aussi l\'ouvrir avec la touche C.' },
  'master-ball': { pocket: 'balls', price: 0, ball: 255, name: 'Master Ball', desc: 'La meilleure Ball qui soit. Elle capture à coup sûr n\'importe quel Pokémon sauvage.' },
  'insigne-brume': { pocket: 'cles', price: 0, key: true, name: 'Insigne Brume', desc: 'Un insigne prouvant votre aide contre les voleurs de Sylvebourg.' },
  'lettre-facteur': { pocket: 'cles', price: 0, key: true, name: 'Lettre du Facteur', desc: 'Une lettre à distribuer aux habitants.' },
  'plume-lune': { pocket: 'cles', price: 0, key: true, name: 'Plume Lune', desc: 'Une plume scintillante laissée par Cresselia.' },
  talisman: { pocket: 'cles', price: 0, key: true, name: 'Talisman', desc: 'Un talisman sacré du Temple Kagura.' },
  'cle-base': { pocket: 'cles', price: 0, key: true, name: 'Clé de la Base', desc: 'La clé ouvrant la porte de la base secrète.' },
  'orbe-rouge': { pocket: 'cles', price: 0, key: true, name: 'Orbe Rouge', desc: 'Un orbe incandescent vibrant d\'une énergie antique.' },
  velo: { pocket: 'cles', price: 0, key: true, name: 'Bicyclette', desc: 'Une bicyclette rouge pliable pour rouler à toute vitesse.' },
  'chambre-air': { pocket: 'cles', price: 0, key: true, name: 'Chambre à Air', desc: 'Une chambre à air robuste pour assembler le vélo.' },
  derailleur: { pocket: 'cles', price: 0, key: true, name: 'Dérailleur', desc: 'Un dérailleur forgé avec soin pour assembler le vélo.' },
  'permis-bateau': { pocket: 'cles', price: 0, key: true, name: 'Permis Bateau', desc: 'Un permis officiel autorisant la navigation vers les îles.' },
  'secateur-sylvestre': { pocket: 'cles', price: 0, key: true, field: 'coupe', icon: 'secateur-sylvestre', name: 'Sécateur Sylvestre', desc: 'Des cisailles horticoles ouvragées en acier ciselé et or. Elles tranchent net les arbustes épineux. Place-toi face au buisson et appuie sur F.' },
  'harnais-flottant': { pocket: 'cles', price: 0, key: true, field: 'surf', icon: 'harnais-flottant', name: 'Harnais Flottant', desc: 'Une selle nautique étanche avec flotteurs profilés. Permet de glisser sur l\'eau et la mer. Place-toi face à l\'eau et appuie sur F.' },
  'sifflet-celeste': { pocket: 'cles', price: 0, key: true, field: 'vol', icon: 'sifflet-celeste', name: 'Sifflet Céleste', desc: 'Un sifflet ouvragé en argent et ruban saphir. Il appelle un grand oiseau pour voyager en un instant vers une ville déjà visitée (depuis le menu ou le sac).' },
};
export const itemName = (k) => ITEMS[k]?.name || ITEM_NAMES[k] || k;
export const POCKETS = [['objets', 'Objets'], ['soin', 'Soins'], ['balls', 'Poké Balls'], ['ct', 'CT & CS'], ['baies', 'Baies'], ['cles', 'Objets Rares']];

export const POCKET_NAMES = {
  objets: 'Objets',
  soin: 'Soins',
  balls: 'Poké Balls',
  ct: 'CT & CS',
  baies: 'Baies',
  cles: 'Objets Rares',
};

export function itemPocketName(k) {
  const it = ITEMS[k];
  if (!it) {
    if (typeof k === 'string') {
      if (k.startsWith('cs-') || k.startsWith('ct-')) return 'CT & CS';
      if (k.includes('berry') || k.includes('baie')) return 'Baies';
      if (k.includes('ball')) return 'Poké Balls';
    }
    return 'Objets';
  }
  if (it.pocket === 'baies' || (typeof k === 'string' && (k.includes('berry') || k.includes('baie')))) return 'Baies';
  if (it.pocket === 'ct' || (typeof k === 'string' && (k.startsWith('cs-') || k.startsWith('ct-')))) return 'CT & CS';
  if (it.pocket === 'balls') return 'Poké Balls';
  if (it.pocket === 'soin') return 'Soins';
  if (it.pocket === 'cles' || it.key) return 'Objets Rares';
  return POCKET_NAMES[it.pocket] || 'Objets';
}

export function itemPluralName(k, qty = 1) {
  const name = itemName(k);
  if (qty <= 1) return name;
  if (name.endsWith('s') || name.endsWith('x')) return `${qty} ${name}`;
  if (name.endsWith(' Ball')) return `${qty} ${name}s`;
  if (name.endsWith(' Potion')) return `${qty} ${name}s`;
  if (name === 'Potion') return `${qty} Potions`;
  if (name === 'Super Bonbon') return `${qty} Super Bonbons`;
  if (name.startsWith('Pierre ')) return `${qty} ${name}s`;
  if (name.startsWith('Baie ')) return `${qty} ${name}s`;
  return `${qty} ${name}s`;
}

/**
 * Message lors de la trouvaille d'un objet au sol (Poké Ball sur la carte)
 * Conforme à la syntaxe officielle Pokémon Noir 2 / Blanc 2 (B2W2)
 */
export function formatFindItem(playerName, itemKey, qty = 1, csInfo = null) {
  const isActualCS = (csInfo && typeof csInfo.cs === 'string' && csInfo.cs.startsWith('CS')) ||
                     (typeof itemKey === 'string' && itemKey.startsWith('cs-')) ||
                     (ITEMS[itemKey]?.name && ITEMS[itemKey].name.startsWith('CS'));
  const cs = csInfo || (isActualCS && ITEMS[itemKey]?.field && ITEMS[itemKey].name ? {
    cs: ITEMS[itemKey].name.split(' ')[0],
    name: ITEMS[itemKey].name.split(' ').slice(1).join(' ')
  } : null);

  if (cs && cs.cs && cs.name && isActualCS) {
    return `${playerName} trouve la ${cs.cs} ${cs.name} !\n${playerName} met la ${cs.cs} dans la Poche CT & CS.`;
  }
  if (typeof itemKey === 'string' && itemKey.startsWith('ct-')) {
    const num = itemKey.replace(/^ct-?/, '').padStart(2, '0');
    const ctTag = `CT${num}`;
    const name = itemName(itemKey);
    const label = name.startsWith('CT') ? name : `${ctTag} ${name}`;
    return `${playerName} trouve la ${label} !\n${playerName} met la ${ctTag} dans la Poche CT & CS.`;
  }
  const pocket = itemPocketName(itemKey);
  const qtyStr = itemPluralName(itemKey, qty);
  const putMsg = qty > 1 ? `met les objets dans la Poche ${pocket}.` : `met l'objet dans la Poche ${pocket}.`;
  return `${playerName} trouve ${qtyStr} !\n${playerName} ${putMsg}`;
}

/**
 * Message lorsqu'un PNJ / une quête / un badge donne un objet
 * Conforme à la syntaxe officielle Pokémon Noir 2 / Blanc 2 (B2W2)
 */
export function formatObtainItem(playerName, itemKey, qty = 1, csInfo = null) {
  const isActualCS = (csInfo && typeof csInfo.cs === 'string' && csInfo.cs.startsWith('CS')) ||
                     (typeof itemKey === 'string' && itemKey.startsWith('cs-')) ||
                     (ITEMS[itemKey]?.name && ITEMS[itemKey].name.startsWith('CS'));
  const cs = csInfo || (isActualCS && ITEMS[itemKey]?.field && ITEMS[itemKey].name ? {
    cs: ITEMS[itemKey].name.split(' ')[0],
    name: ITEMS[itemKey].name.split(' ').slice(1).join(' ')
  } : null);

  if (cs && cs.cs && cs.name && isActualCS) {
    return `${playerName} obtient la ${cs.cs} ${cs.name} !\n${playerName} met la ${cs.cs} dans la Poche CT & CS.`;
  }
  if (typeof itemKey === 'string' && itemKey.startsWith('ct-')) {
    const num = itemKey.replace(/^ct-?/, '').padStart(2, '0');
    const ctTag = `CT${num}`;
    const name = itemName(itemKey);
    const label = name.startsWith('CT') ? name : `${ctTag} ${name}`;
    return `${playerName} obtient la ${label} !\n${playerName} met la ${ctTag} dans la Poche CT & CS.`;
  }
  const pocket = itemPocketName(itemKey);
  const qtyStr = itemPluralName(itemKey, qty);
  const putMsg = qty > 1 ? `met les objets dans la Poche ${pocket}.` : `met l'objet dans la Poche ${pocket}.`;
  return `${playerName} obtient ${qtyStr} !\n${playerName} ${putMsg}`;
}

/** l'objet peut-il servir sur ce Pokémon ? */
export function canUseOn(item, m, maxLvl = 100) {
  const it = ITEMS[item]; if (!it) return false;
  if (it.revive) return m.hp <= 0;
  if (m.hp <= 0) return false;
  if (it.heal && m.hp < m.stats[0]) return true;
  if (it.cure && m.status && (it.cure === 'all' || it.cure.includes(m.status))) return true;
  if (it.pp || it.ppAll) return m.moves.some((x) => x.pp < MOVES[x.id].pp);
  if (it.candy) return m.lvl < Math.min(100, maxLvl || 100);
  if (it.stone) return !!itemEvolution(m, item);
  return false;
}

/** applique un objet de soin ; renvoie le message (ou null si sans effet) */
export function applyItem(item, m, moveIdx = -1) {
  const it = ITEMS[item]; const name = monName(m);
  if (!canUseOn(item, m)) return null;
  if (it.revive) { m.hp = Math.max(1, Math.floor(m.stats[0] * it.revive)); m.status = null; return `${name} a repris connaissance !`; }
  const msgs = [];
  if (it.heal) { const before = m.hp; m.hp = Math.min(m.stats[0], m.hp + it.heal); if (m.hp > before) msgs.push(`${name} récupère ${m.hp - before} PV.`); }
  if (it.cure && m.status && (it.cure === 'all' || it.cure.includes(m.status))) { m.status = null; m.slp = 0; m.tox = 0; msgs.push(`${name} est soigné.`); }
  if (it.pp) { const mv = m.moves[moveIdx >= 0 ? moveIdx : m.moves.findIndex((x) => x.pp < MOVES[x.id].pp)]; if (mv) { mv.pp = Math.min(MOVES[mv.id].pp, mv.pp + it.pp); msgs.push(`Les PP de ${MOVES[mv.id].n} sont restaurés.`); } }
  if (it.ppAll) { for (const mv of m.moves) mv.pp = Math.min(MOVES[mv.id].pp, mv.pp + it.ppAll); msgs.push(`Les PP de ${name} sont restaurés.`); }
  return msgs.join(' ') || null;
}

/** Super Bonbon : passe au niveau suivant, renvoie les étapes de gainExp */
export function useCandy(m, maxLvl = 100) {
  const need = expFor(SPECIES[m.sp].g, m.lvl + 1) - m.exp;
  return gainExp(m, Math.max(1, need), maxLvl);
}
export { healFull };

/** Équipe un objet tenu sur un Pokémon */
export function giveHeldItem(m, item, bag) {
  if (!m || !item || !bag || !bag[item]) return null;
  const oldItem = m.item;
  m.item = item;
  bag[item]--;
  if (bag[item] <= 0) delete bag[item];
  if (oldItem) bag[oldItem] = (bag[oldItem] || 0) + 1;
  return oldItem;
}

/** Retire l'objet tenu par un Pokémon et le remet dans le sac */
export function takeHeldItem(m, bag) {
  if (!m || !m.item) return null;
  const item = m.item;
  m.item = null;
  if (bag) bag[item] = (bag[item] || 0) + 1;
  return item;
}
