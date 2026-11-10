// odyssee/js/core/trophies.js — Système de Journal des Trophées, Médailles B2W2,
// Historique Face-à-Face, Séries de Victoires et Objectifs d'Aventure

import { SPECIES } from '../data/species.js';
import { SPAWNS } from '../world/region.js';

/**
 * Retourne la liste unique des espèces sauvages présentes dans une zone ou route donnée
 * (herbes, grottes, eau et pêche combinées), ainsi que le nombre déjà capturé par le joueur,
 * SANS révéler l'identité des espèces non capturées.
 */
export function getZoneCatchStats(st, zoneOrData) {
  if (!zoneOrData) return null;
  const pool = new Set();
  const addFromTable = (table) => {
    if (Array.isArray(table)) {
      for (const row of table) {
        if (Array.isArray(row) && row[0] != null) pool.add(Number(row[0]));
        else if (typeof row === 'number') pool.add(row);
      }
    } else if (table && typeof table === 'object') {
      if (Array.isArray(table.land)) addFromTable(table.land);
      if (Array.isArray(table.water)) addFromTable(table.water);
      if (Array.isArray(table.fish)) addFromTable(table.fish);
    }
  };

  let zoneKey = 'zone', zoneName = '', isTown = false;
  if (typeof zoneOrData === 'string') {
    zoneKey = zoneOrData;
    if (SPAWNS[zoneOrData]) addFromTable(SPAWNS[zoneOrData]);
  } else if (Array.isArray(zoneOrData)) {
    addFromTable(zoneOrData);
  } else if (typeof zoneOrData === 'object') {
    zoneKey = zoneOrData.key || 'zone';
    zoneName = zoneOrData.name || '';
    isTown = !!zoneOrData.isTown;
    if (zoneOrData.enc) addFromTable(zoneOrData.enc);
    if (zoneOrData.surfEnc) addFromTable(zoneOrData.surfEnc);
    if (zoneOrData.key && SPAWNS[zoneOrData.key]) addFromTable(SPAWNS[zoneOrData.key]);
  }

  if (!pool.size) {
    return {
      zoneKey,
      zoneName,
      isTown: true,
      caught: 0,
      total: 0,
      complete: true,
      speciesList: []
    };
  }
  const caughtSet = new Set((st?.dex?.caught || []).map(Number));
  let caughtCount = 0;
  for (const sp of pool) {
    if (caughtSet.has(sp)) caughtCount++;
  }
  const totalCount = pool.size;
  return {
    zoneKey,
    zoneName,
    isTown: false,
    caught: caughtCount,
    total: totalCount,
    complete: totalCount > 0 && caughtCount >= totalCount,
    speciesList: [...pool]
  };
}

/**
 * Calcule le bilan global des routes et zones sauvages complétées à 100%.
 */
export function getAllRoutesCatchSummary(st) {
  const keys = Object.keys(SPAWNS);
  let completedZones = 0;
  let totalZones = 0;
  const zones = {};
  for (const k of keys) {
    const stat = getZoneCatchStats(st, k);
    if (stat && stat.total > 0) {
      totalZones++;
      zones[k] = stat;
      if (stat.complete) completedZones++;
    }
  }
  return { completedZones, totalZones, zones };
}

// Identification rapide des espèces évoluées et évoluées par pierre
const EVOLVED_SPECIES = new Set();
const STONE_EVO_SPECIES = new Set([134, 135, 136]); // Aquali, Voltali, Pyroli

for (const [id, sp] of Object.entries(SPECIES)) {
  if (sp && sp.ev) {
    for (const e of sp.ev) {
      if (e.to) {
        EVOLVED_SPECIES.add(e.to);
        if (e.item && String(e.item).includes('stone')) {
          STONE_EVO_SPECIES.add(e.to);
        }
      }
    }
  }
}

export const TROPHIES_CATALOG = [
  /* ==========================================================================
     1. DUELS MULTIJOUEUR & COMBAT PVP (12 trophées)
     ========================================================================== */
  {
    id: 'pvp_first_win',
    title: 'Premier Sang',
    desc: 'Remporter votre tout premier duel en combat PvP.',
    tier: 'bronze',
    category: 'combat',
    reward: { item: 'rare-candy', count: 2, label: 'Super Bonbon ×2' },
    check: (st) => {
      const w = st.pvp?.totalWins || 0;
      return { current: Math.min(w, 1), max: 1, done: w >= 1 };
    }
  },
  {
    id: 'pvp_two_players',
    title: 'Premier Réseau',
    desc: 'Battre au moins 2 dresseurs différents en duel.',
    tier: 'bronze',
    category: 'reseau',
    reward: { item: 'hyper-potion', count: 3, label: 'Hyper Potion ×3' },
    check: (st) => {
      const beaten = Object.values(st.pvp?.players || {}).filter((p) => (p.wins || 0) >= 1).length;
      return { current: Math.min(beaten, 2), max: 2, done: beaten >= 2 };
    }
  },
  {
    id: 'pvp_five_same_player',
    title: 'Rival Éternel',
    desc: 'Battre 5 fois le même dresseur en duel.',
    tier: 'silver',
    category: 'rival',
    reward: { item: 'leftovers', count: 1, label: 'Restes ×1' },
    check: (st) => {
      const list = Object.values(st.pvp?.players || {}).map((p) => p.wins || 0);
      const m = list.length ? Math.max(...list) : 0;
      return { current: Math.min(m, 5), max: 5, done: m >= 5 };
    }
  },
  {
    id: 'pvp_ten_same_player',
    title: 'Némésis Suprême',
    desc: 'Battre 10 fois le même dresseur en duel.',
    tier: 'gold',
    category: 'rival',
    reward: { item: 'choice-specs', count: 1, label: 'Lunettes Choix ×1' },
    check: (st) => {
      const list = Object.values(st.pvp?.players || {}).map((p) => p.wins || 0);
      const m = list.length ? Math.max(...list) : 0;
      return { current: Math.min(m, 10), max: 10, done: m >= 10 };
    }
  },
  {
    id: 'pvp_streak_3',
    title: 'Étincelle Guerrière',
    desc: 'Aligner une série de 3 victoires consécutives sans défaite.',
    tier: 'bronze',
    category: 'streak',
    reward: { item: 'super-potion', count: 5, label: 'Super Potion ×5' },
    check: (st) => {
      const s = st.pvp?.bestStreak || 0;
      return { current: Math.min(s, 3), max: 3, done: s >= 3 };
    }
  },
  {
    id: 'pvp_streak_5',
    title: 'Flamme Ardente',
    desc: 'Aligner une série de 5 victoires consécutives sans défaite.',
    tier: 'silver',
    category: 'streak',
    reward: { item: 'life-orb', count: 1, label: 'Orbe Vie ×1' },
    check: (st) => {
      const s = st.pvp?.bestStreak || 0;
      return { current: Math.min(s, 5), max: 5, done: s >= 5 };
    }
  },
  {
    id: 'pvp_streak_10',
    title: 'Légende Invaincue',
    desc: 'Aligner une série mythique de 10 victoires consécutives sans aucune défaite !',
    tier: 'platinum',
    category: 'streak',
    reward: { item: 'rare-candy', count: 5, label: 'Super Bonbon ×5' },
    check: (st) => {
      const s = st.pvp?.bestStreak || 0;
      return { current: Math.min(s, 10), max: 10, done: s >= 10 };
    }
  },
  {
    id: 'pvp_five_players',
    title: 'Globe-Trotteur',
    desc: 'Battre 5 dresseurs différents en duel.',
    tier: 'silver',
    category: 'reseau',
    reward: { item: 'choice-band', count: 1, label: 'Bandeau Choix ×1' },
    check: (st) => {
      const beaten = Object.values(st.pvp?.players || {}).filter((p) => (p.wins || 0) >= 1).length;
      return { current: Math.min(beaten, 5), max: 5, done: beaten >= 5 };
    }
  },
  {
    id: 'pvp_ten_players',
    title: 'Grand Maître du Réseau',
    desc: 'Battre 10 dresseurs différents en duel.',
    tier: 'platinum',
    category: 'reseau',
    reward: { item: 'focus-sash', count: 2, label: 'Ceinture Force ×2' },
    check: (st) => {
      const beaten = Object.values(st.pvp?.players || {}).filter((p) => (p.wins || 0) >= 1).length;
      return { current: Math.min(beaten, 10), max: 10, done: beaten >= 10 };
    }
  },
  {
    id: 'pvp_ten_battles',
    title: 'Vétéran de l\'Arène',
    desc: 'Disputer au moins 10 combats PvP au total.',
    tier: 'bronze',
    category: 'combat',
    reward: { item: 'full-restore', count: 3, label: 'Guérison ×3' },
    check: (st) => {
      const tot = (st.pvp?.totalWins || 0) + (st.pvp?.totalLosses || 0) + (st.pvp?.totalDraws || 0);
      return { current: Math.min(tot, 10), max: 10, done: tot >= 10 };
    }
  },
  {
    id: 'pvp_twentyfive_wins',
    title: 'Champion de la Ligue',
    desc: 'Cumuler 25 victoires en combat PvP au total.',
    tier: 'gold',
    category: 'combat',
    reward: { item: 'rocky-helmet', count: 1, label: 'Casque Brut ×1' },
    check: (st) => {
      const w = st.pvp?.totalWins || 0;
      return { current: Math.min(w, 25), max: 25, done: w >= 25 };
    }
  },
  {
    id: 'pvp_fifty_wins',
    title: 'Seigneur des Duels',
    desc: 'Cumuler 50 victoires en combat PvP au total.',
    tier: 'platinum',
    category: 'combat',
    reward: { item: 'master-ball', count: 1, label: 'Master Ball ×1' },
    check: (st) => {
      const w = st.pvp?.totalWins || 0;
      return { current: Math.min(w, 50), max: 50, done: w >= 50 };
    }
  },

  /* ==========================================================================
     2. HISTOIRE & BADGES DU MONDE (4 trophées)
     ========================================================================== */
  {
    id: 'story_badges_4',
    title: 'Étoile Montante',
    desc: 'Décrocher les 4 premiers Badges d\'Arène du Continent.',
    tier: 'bronze',
    category: 'aventure',
    reward: { item: 'hyper-potion', count: 3, label: 'Hyper Potion ×3' },
    check: (st) => {
      const cnt = (st.badges || []).slice(0, 4).filter(Boolean).length;
      return { current: Math.min(cnt, 4), max: 4, done: cnt >= 4 };
    }
  },
  {
    id: 'story_badges_8',
    title: 'Maître du Continent',
    desc: 'Décrocher les 8 Badges d\'Arène du Continent d\'Odyssée.',
    tier: 'silver',
    category: 'aventure',
    reward: { item: 'dusk-stone', count: 1, label: 'Pierre Nuit ×1' },
    check: (st) => {
      const cnt = (st.badges || []).slice(0, 8).filter(Boolean).length;
      return { current: Math.min(cnt, 8), max: 8, done: cnt >= 8 };
    }
  },
  {
    id: 'story_badges_15',
    title: 'Conquérant du Sud',
    desc: 'Décrocher la totalité des 15 Badges d\'Arène de la région.',
    tier: 'gold',
    category: 'aventure',
    reward: { item: 'choice-scarf', count: 1, label: 'Mouchoir Choix ×1' },
    check: (st) => {
      const cnt = (st.badges || []).filter(Boolean).length;
      return { current: Math.min(cnt, 15), max: 15, done: cnt >= 15 };
    }
  },
  {
    id: 'story_shadow_lugia',
    title: 'Sauveur d\'Odyssée',
    desc: 'Triompher de la Team Éclipse, dissiper la nuit violette et libérer Lugia.',
    tier: 'platinum',
    category: 'aventure',
    reward: { item: 'rare-candy', count: 5, label: 'Super Bonbon ×5' },
    check: (st) => {
      const done = !!(st.flags?.lugia || st.flags?.lugiaCaught || st.flags?.champion);
      return { current: done ? 1 : 0, max: 1, done };
    }
  },

  /* ==========================================================================
     3. POKÉDEX & COLLECTION (4 trophées)
     ========================================================================== */
  {
    id: 'dex_caught_20',
    title: 'Naturaliste Débutant',
    desc: 'Enregistrer au moins 20 Pokémon capturés dans le Pokédex.',
    tier: 'bronze',
    category: 'pokedex',
    reward: { item: 'great-ball', count: 10, label: 'Super Ball ×10' },
    check: (st) => {
      const cnt = st.dex?.caught?.length || 0;
      return { current: Math.min(cnt, 20), max: 20, done: cnt >= 20 };
    }
  },
  {
    id: 'dex_caught_60',
    title: 'Zoologiste Émérite',
    desc: 'Enregistrer au moins 60 Pokémon capturés dans le Pokédex.',
    tier: 'silver',
    category: 'pokedex',
    reward: { item: 'eviolite', count: 1, label: 'Évoluroc ×1' },
    check: (st) => {
      const cnt = st.dex?.caught?.length || 0;
      return { current: Math.min(cnt, 60), max: 60, done: cnt >= 60 };
    }
  },
  {
    id: 'dex_caught_120',
    title: 'Encyclopédie Vivante',
    desc: 'Compléter le Pokédex Régional avec au moins 120 Pokémon capturés.',
    tier: 'gold',
    category: 'pokedex',
    reward: { item: 'heart-scale', count: 3, label: 'Écaille Cœur ×3' },
    check: (st) => {
      const cnt = st.dex?.caught?.length || 0;
      return { current: Math.min(cnt, 120), max: 120, done: cnt >= 120 };
    }
  },
  {
    id: 'dex_caught_200',
    title: 'Maître Suprême du Pokédex',
    desc: 'Capturer au moins 200 espèces différentes de Pokémon à travers toute la région d\'Odyssée.',
    tier: 'platinum',
    category: 'pokedex',
    reward: { item: 'rare-candy', count: 10, label: 'Super Bonbon ×10' },
    check: (st) => {
      const cnt = st.dex?.caught?.length || 0;
      return { current: Math.min(cnt, 200), max: 200, done: cnt >= 200 };
    }
  },
  {
    id: 'dex_route_1',
    title: 'Éclaireur de Route',
    desc: 'Capturer 100% des espèces de Pokémon sauvages présentes sur une route ou zone sauvage.',
    tier: 'bronze',
    category: 'pokedex',
    reward: { item: 'ultra-ball', count: 10, label: 'Hyper Ball ×10' },
    check: (st) => {
      const { completedZones } = getAllRoutesCatchSummary(st);
      return { current: Math.min(completedZones, 1), max: 1, done: completedZones >= 1 };
    }
  },
  {
    id: 'dex_route_5',
    title: 'Chasseur Régional',
    desc: 'Capturer tous les Pokémon sauvages de 5 routes ou zones différentes.',
    tier: 'silver',
    category: 'pokedex',
    reward: { item: 'rare-candy', count: 3, label: 'Super Bonbon ×3' },
    check: (st) => {
      const { completedZones } = getAllRoutesCatchSummary(st);
      return { current: Math.min(completedZones, 5), max: 5, done: completedZones >= 5 };
    }
  },
  {
    id: 'dex_route_all',
    title: 'Cartographe de la Faune',
    desc: 'Capturer l\'intégralité des Pokémon sauvages sur chacune des routes et zones sauvages de la région.',
    tier: 'gold',
    category: 'pokedex',
    reward: { item: 'leftovers', count: 2, label: 'Restes ×2' },
    check: (st) => {
      const { completedZones, totalZones } = getAllRoutesCatchSummary(st);
      const max = Math.max(1, totalZones);
      return { current: Math.min(completedZones, max), max, done: completedZones >= max };
    }
  },
  {
    id: 'dex_shiny_hunter',
    title: 'Étoile Miraculeuse',
    desc: 'Trouver et posséder un Pokémon chromatique (Shiny) dans son équipe ou ses boîtes.',
    tier: 'platinum',
    category: 'pokedex',
    reward: { item: 'leftovers', count: 1, label: 'Restes ×1' },
    check: (st) => {
      const all = (st.party || []).concat(st.box || []);
      const hasShiny = all.some((m) => m && m.shiny);
      return { current: hasShiny ? 1 : 0, max: 1, done: hasShiny };
    }
  },

  /* ==========================================================================
     4. ENTRAÎNEMENT & PUISSANCE (4 trophées)
     ========================================================================== */
  {
    id: 'train_first_evo',
    title: 'Premier Envol',
    desc: 'Faire évoluer un Pokémon pour la première fois.',
    tier: 'bronze',
    category: 'entrainement',
    reward: { item: 'rare-candy', count: 2, label: 'Super Bonbon ×2' },
    check: (st) => {
      const all = (st.party || []).concat(st.box || []);
      const evolved = !!st.flags?.evolved_once || all.some((m) => m && EVOLVED_SPECIES.has(m.sp));
      return { current: evolved ? 1 : 0, max: 1, done: evolved };
    }
  },
  {
    id: 'train_stone_evo',
    title: 'Lien Élémentaire',
    desc: 'Faire évoluer un Pokémon à l\'aide d\'une Pierre d\'évolution.',
    tier: 'silver',
    category: 'entrainement',
    reward: { item: 'moon-stone', count: 1, label: 'Pierre Lune ×1' },
    check: (st) => {
      const all = (st.party || []).concat(st.box || []);
      const stoneEvo = !!st.flags?.stone_evo_done || all.some((m) => m && STONE_EVO_SPECIES.has(m.sp));
      return { current: stoneEvo ? 1 : 0, max: 1, done: stoneEvo };
    }
  },
  {
    id: 'train_level_100',
    title: 'Sommet de la Puissance',
    desc: 'Hisser un Pokémon jusqu\'au Niveau 100.',
    tier: 'gold',
    category: 'entrainement',
    reward: { item: 'choice-specs', count: 1, label: 'Lunettes Choix ×1' },
    check: (st) => {
      const all = (st.party || []).concat(st.box || []);
      const maxLvl = all.reduce((mx, m) => Math.max(mx, m?.lvl || 0), 0);
      return { current: Math.min(maxLvl, 100), max: 100, done: maxLvl >= 100 };
    }
  },
  {
    id: 'train_team_60',
    title: 'Bataillon d\'Élite',
    desc: 'Former une équipe complète de 6 Pokémon tous au Niveau 60 ou plus.',
    tier: 'platinum',
    category: 'entrainement',
    reward: { item: 'life-orb', count: 1, label: 'Orbe Vie ×1' },
    check: (st) => {
      const valid = (st.party || []).filter((m) => m && (m.lvl || 0) >= 60).length;
      return { current: Math.min(valid, 6), max: 6, done: (st.party?.length >= 6) && valid >= 6 };
    }
  },

  /* ==========================================================================
     5. EXPLORATION & QUÊTES (4 trophées)
     ========================================================================== */
  {
    id: 'explor_items_15',
    title: 'Fouilleur Curieux',
    desc: 'Ramasser au moins 15 objets ou Poké Balls abandonnés au sol sur les routes et grottes.',
    tier: 'bronze',
    category: 'exploration',
    reward: { item: 'max-repel', count: 5, label: 'Repousse Max ×5' },
    check: (st) => {
      const cnt = Object.keys(st.flags || {}).filter((k) => k.startsWith('I:')).length;
      return { current: Math.min(cnt, 15), max: 15, done: cnt >= 15 };
    }
  },
  {
    id: 'explor_all_towns',
    title: 'Grand Voyageur',
    desc: 'Découvrir et visiter au moins 10 villes et villages de la région d\'Odyssée.',
    tier: 'silver',
    category: 'exploration',
    reward: { item: 'elixir', count: 3, label: 'Élixir ×3' },
    check: (st) => {
      const cnt = (st.visited || []).length;
      return { current: Math.min(cnt, 10), max: 10, done: cnt >= 10 };
    }
  },
  {
    id: 'quests_completed_5',
    title: 'Ami des Habitants',
    desc: 'Accomplir avec succès au moins 5 quêtes secondaires du Carnet de Voyage.',
    tier: 'silver',
    category: 'exploration',
    reward: { item: 'black-belt', count: 1, label: 'Ceinture Noire ×1' },
    check: (st) => {
      const cnt = Object.values(st.journal || {}).filter((q) => q && (q.done || q.step === 'done' || q.status === 'done')).length;
      return { current: Math.min(cnt, 5), max: 5, done: cnt >= 5 };
    }
  },
  {
    id: 'explor_field_items',
    title: 'Pionnier du Terrain',
    desc: 'Posséder les 3 Objets Rares d\'exploration (Sécateur Sylvestre, Harnais Flottant, Sifflet Céleste).',
    tier: 'gold',
    category: 'exploration',
    reward: { item: 'silk-scarf', count: 1, label: 'Mouchoir Soie ×1' },
    check: (st) => {
      const bag = st.bag || {};
      const c1 = !!(bag['secateur-sylvestre'] || bag['cs-coupe']);
      const c2 = !!(bag['harnais-flottant'] || bag['cs-surf']);
      const c3 = !!(bag['sifflet-celeste'] || bag['cs-vol']);
      const cnt = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0);
      return { current: cnt, max: 3, done: cnt >= 3 };
    }
  },

  /* ==========================================================================
     6. DOMAINE, CASINO & RICHESSE (4 trophées)
     ========================================================================== */
  {
    id: 'domaine_first_build',
    title: 'Bâtisseur du Domaine',
    desc: 'Acquérir le Domaine d\'Aube et y poser votre toute première construction.',
    tier: 'bronze',
    category: 'domaine',
    reward: { item: 'hyper-potion', count: 5, label: 'Hyper Potion ×5' },
    check: (st) => {
      const d = st.domaine;
      const done = !!d && ((d.travaux || []).length >= 1 || (d.trav || []).length >= 1 || !!d.maisons);
      return { current: done ? 1 : 0, max: 1, done };
    }
  },
  {
    id: 'domaine_residents_3',
    title: 'Maire Prospère',
    desc: 'Accueillir et installer au moins 3 résidents dans votre Domaine d\'Aube.',
    tier: 'silver',
    category: 'domaine',
    reward: { item: 'sitrus-berry', count: 5, label: 'Baie Sitrus ×5' },
    check: (st) => {
      const d = st.domaine;
      const cnt = Array.isArray(d?.hab) ? d.hab.length : (typeof d?.hab === 'number' ? d.hab : 0);
      return { current: Math.min(cnt, 3), max: 3, done: cnt >= 3 };
    }
  },
  {
    id: 'casino_coins_1000',
    title: 'Flambeur de Métropole',
    desc: 'Amasser ou détenir au moins 1 000 jetons au Casino de Métropole.',
    tier: 'silver',
    category: 'domaine',
    reward: { item: 'charcoal', count: 1, label: 'Charbon ×1' },
    check: (st) => {
      const jetons = st.jetons || st.casino?.jetons || 0;
      return { current: Math.min(jetons, 1000), max: 1000, done: jetons >= 1000 };
    }
  },
  {
    id: 'economy_rich_100k',
    title: 'Magnat d\'Odyssée',
    desc: 'Amasser une fortune d\'au moins 100 000 ₽ sur votre compte.',
    tier: 'gold',
    category: 'domaine',
    reward: { item: 'choice-band', count: 1, label: 'Bandeau Choix ×1' },
    check: (st) => {
      const money = st.money || 0;
      return { current: Math.min(money, 100000), max: 100000, done: money >= 100000 };
    }
  }
];

export const STREAK_RANKS = [
  { min: 0, title: 'Challenger', desc: 'En apprentissage', icon: 'medal_bronze', flame: 'none' },
  { min: 3, title: '🔥 En Série', desc: 'Série de 3 victoires', icon: 'medal_silver', flame: 'low' },
  { min: 5, title: '🔥🔥 Flamboyant', desc: 'Série de 5 victoires', icon: 'medal_gold', flame: 'medium' },
  { min: 10, title: '⚡ Foudre d\'Élite', desc: 'Série de 10 victoires', icon: 'medal_platinum', flame: 'high' },
  { min: 15, title: '👑 Légende Invaincue', desc: 'Record absolu du réseau', icon: 'streak_crown', flame: 'legend' }
];

export function getStreakRank(streak = 0, bestStreak = 0) {
  const eff = Math.max(streak, bestStreak);
  let rank = STREAK_RANKS[0];
  for (const r of STREAK_RANKS) {
    if (eff >= r.min) rank = r;
  }
  return { ...rank, currentStreak: streak, bestStreak };
}

/** Assure que st.pvp est correctement initialisé */
export function ensurePvpState(st) {
  if (!st) return null;
  st.pvp ||= {
    totalWins: 0,
    totalLosses: 0,
    totalDraws: 0,
    currentStreak: 0,
    bestStreak: 0,
    players: {},
    trophies: {}
  };
  st.pvp.totalWins ||= 0;
  st.pvp.totalLosses ||= 0;
  st.pvp.totalDraws ||= 0;
  st.pvp.currentStreak ||= 0;
  st.pvp.bestStreak ||= 0;
  st.pvp.players ||= {};
  st.pvp.trophies ||= {};
  return st.pvp;
}

/**
 * Vérifie l'ensemble des trophées du catalogue par rapport à l'état du jeu.
 * Débloque tout trophée accompli et renvoie les nouveaux déblocages.
 */
export function checkAllTrophies(st) {
  ensurePvpState(st);
  const pvp = st.pvp;
  const newlyUnlocked = [];

  for (const trophy of TROPHIES_CATALOG) {
    const userTrophy = pvp.trophies[trophy.id];
    if (!userTrophy || !userTrophy.unlocked) {
      const status = trophy.check(st);
      if (status.done) {
        pvp.trophies[trophy.id] = {
          unlocked: true,
          unlockedAt: Date.now(),
          claimed: false
        };
        newlyUnlocked.push(trophy);
      }
    }
  }

  return newlyUnlocked;
}

/**
 * Enregistre le résultat d'un duel PvP contre un joueur.
 * @param {object} st État de sauvegarde du jeu (game.state)
 * @param {string} foeName Nom de l'adversaire
 * @param {'win'|'lose'|'tie'|'draw'} result Résultat du combat
 * @returns {{ newlyUnlocked: Array, streakChanged: boolean, rankChanged: boolean, rank: object }}
 */
export function recordPvpMatch(st, foeName, result) {
  ensurePvpState(st);
  const pvp = st.pvp;
  const name = String(foeName || 'Inconnu').trim();
  const oldRank = getStreakRank(pvp.currentStreak, pvp.bestStreak);

  // Initialisation de la fiche joueur adverse
  pvp.players[name] ||= {
    name,
    wins: 0,
    losses: 0,
    draws: 0,
    streakAgainst: 0,
    bestStreakAgainst: 0,
    lastResult: null,
    lastDate: null
  };
  const pRecord = pvp.players[name];

  if (result === 'win') {
    pvp.totalWins++;
    pvp.currentStreak++;
    if (pvp.currentStreak > pvp.bestStreak) {
      pvp.bestStreak = pvp.currentStreak;
    }
    pRecord.wins++;
    pRecord.streakAgainst = (pRecord.streakAgainst || 0) + 1;
    if (pRecord.streakAgainst > (pRecord.bestStreakAgainst || 0)) {
      pRecord.bestStreakAgainst = pRecord.streakAgainst;
    }
  } else if (result === 'lose') {
    pvp.totalLosses++;
    pvp.currentStreak = 0;
    pRecord.losses++;
    pRecord.streakAgainst = 0;
  } else {
    // Égalité
    pvp.totalDraws++;
    pRecord.draws = (pRecord.draws || 0) + 1;
  }

  pRecord.lastResult = result;
  pRecord.lastDate = Date.now();

  // Vérification de tous les trophées
  const newlyUnlocked = checkAllTrophies(st);

  const newRank = getStreakRank(pvp.currentStreak, pvp.bestStreak);
  const rankChanged = newRank.title !== oldRank.title;

  return {
    newlyUnlocked,
    streakChanged: result === 'win' || result === 'lose',
    rankChanged,
    rank: newRank,
    currentStreak: pvp.currentStreak,
    bestStreak: pvp.bestStreak
  };
}

/**
 * Réclame la récompense d'un trophée débloqué.
 * @param {object} st État de sauvegarde du jeu
 * @param {string} trophyId Identifiant du trophée
 * @returns {{ ok: boolean, message?: string, reward?: object }}
 */
export function claimTrophyReward(st, trophyId) {
  ensurePvpState(st);
  const trophy = TROPHIES_CATALOG.find((t) => t.id === trophyId);
  if (!trophy) return { ok: false, message: 'Trophée introuvable.' };

  const userTrophy = st.pvp.trophies[trophyId];
  if (!userTrophy || !userTrophy.unlocked) {
    return { ok: false, message: 'Ce trophée n\'est pas encore débloqué.' };
  }
  if (userTrophy.claimed) {
    return { ok: false, message: 'Récompense déjà réclamée.' };
  }

  // Distribution dans le sac
  st.bag ||= {};
  const it = trophy.reward.item;
  const count = trophy.reward.count || 1;
  st.bag[it] = (st.bag[it] || 0) + count;

  userTrophy.claimed = true;
  userTrophy.claimedAt = Date.now();

  return {
    ok: true,
    reward: trophy.reward,
    item: it,
    count,
    label: trophy.reward.label
  };
}

/**
 * Retourne le résumé complet des statistiques PvP et trophées.
 */
export function getPvpSummary(st) {
  ensurePvpState(st);
  const pvp = st.pvp;
  const totalMatches = pvp.totalWins + pvp.totalLosses + pvp.totalDraws;
  const winRate = totalMatches > 0 ? ((pvp.totalWins / totalMatches) * 100).toFixed(1) : '0.0';

  const playersList = Object.values(pvp.players).sort((a, b) => {
    const totA = a.wins + a.losses + (a.draws || 0);
    const totB = b.wins + b.losses + (b.draws || 0);
    return totB - totA || (b.lastDate || 0) - (a.lastDate || 0);
  });

  const unlockedCount = Object.values(pvp.trophies).filter((t) => t.unlocked).length;
  const claimedCount = Object.values(pvp.trophies).filter((t) => t.claimed).length;
  const claimableCount = unlockedCount - claimedCount;

  const rank = getStreakRank(pvp.currentStreak, pvp.bestStreak);

  return {
    totalWins: pvp.totalWins,
    totalLosses: pvp.totalLosses,
    totalDraws: pvp.totalDraws,
    totalMatches,
    winRate: `${winRate}%`,
    currentStreak: pvp.currentStreak,
    bestStreak: pvp.bestStreak,
    rank,
    playersCount: playersList.length,
    players: playersList,
    trophiesTotal: TROPHIES_CATALOG.length,
    unlockedCount,
    claimedCount,
    claimableCount
  };
}

/** Détermine le statut face à un adversaire donné */
export function getHeadToHeadStatus(record) {
  if (!record) return { label: 'Inconnu', cls: 'neutral' };
  if (record.wins > record.losses) {
    return { label: '👑 Domination', cls: 'domination', desc: `Vous menez face à ce dresseur (+${record.wins - record.losses})` };
  }
  if (record.wins === record.losses) {
    return { label: '⚖️ Égalité', cls: 'equality', desc: 'Score parfaitement équilibré' };
  }
  return { label: '⚔️ Revanche Requise', cls: 'revenge', desc: `Revanche à prendre (-${record.losses - record.wins})` };
}
