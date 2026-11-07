// odyssee/js/core/mon.js — créatures : création, statistiques, expérience, attaques, évolution (sans DOM)
import { SPECIES } from '../data/species.js';
import { R } from '../data/remplacants.js';
import { MOVES } from '../data/moves.js';
import { EFFORT } from '../data/rencontres.js';

// attaque propre aux Pokémon Obscurs (Lugia Obscur) : n'existe dans aucun jeu officiel sous ce nom
MOVES[10001] = { id: 10001, key: 'shadow-blast', n: 'Rafale Obscure', t: 'dark', c: 'special', p: 100, a: 100, pp: 10, pr: 0, tg: 10, m: { cat: 0, crit: 1 } };
// CT01 d'Hector (Arène de Sylvebourg) : attaque Insecte propre à Odyssée, un nuage de pollen gluant qui baisse la Vitesse
MOVES[10002] = { id: 10002, key: 'pollen-collant', n: 'Pollen Collant', t: 'bug', c: 'special', p: 55, a: 95, pp: 15, pr: 0, tg: 10, m: { cat: 6, st: [[6, -1]], stc: 100 } };

export const STAT_NAMES = ['PV', 'Attaque', 'Défense', 'Atq. Spé.', 'Déf. Spé.', 'Vitesse'];

/* ---------------- natures ---------------- */
// 25 natures, dans l'ordre des jeux : ligne = stat augmentée de 10 %, colonne = stat baissée de 10 %
// (Attaque, Défense, Vitesse, Atq. Spé., Déf. Spé.) ; les cinq de la diagonale sont neutres
export const NATURES = ['Hardi', 'Solo', 'Brave', 'Rigide', 'Mauvais', 'Assuré', 'Docile', 'Relax', 'Malin', 'Lâche',
  'Timide', 'Pressé', 'Sérieux', 'Jovial', 'Naïf', 'Modeste', 'Doux', 'Discret', 'Pudique', 'Foufou',
  'Calme', 'Gentil', 'Malpoli', 'Prudent', 'Bizarre'];
const NAT_STAT = [1, 2, 5, 3, 4];   // ordre des natures → indice de stat du jeu
/** stats [augmentée, baissée] d'une nature (indices de STAT_NAMES), ou null si elle est neutre */
export function natureEffect(n) {
  const up = NAT_STAT[Math.floor(n / 5)], down = NAT_STAT[n % 5];
  return up === down ? null : [up, down];
}
export function natureName(n) { return NATURES[n] ?? NATURES[0]; }
/** nature d'un Pokémon d'une ancienne sauvegarde : toujours la même pour un même Pokémon */
export const legacyNature = (m) => ((m.uid || 1) * 7 + (m.sp || 0) * 3) % 25;
/** les Pokémon d'avant les natures en reçoivent une ; renvoie true si quelque chose a changé */
export function ensureNature(m) {
  if (m.nat != null) return false;
  m.nat = legacyNature(m); m.ev ||= [0, 0, 0, 0, 0, 0];
  refreshStats(m, true);
  return true;
}
let UID = 1;
export const setUidBase = (n) => { UID = Math.max(UID, n); };

/** points d'expérience totaux pour atteindre le niveau L (courbes de croissance officielles) */
export function expFor(g, L) {
  if (L <= 1) return 0;
  const n = L, n3 = n * n * n;
  switch (g) {
    case 1: return Math.floor(5 * n3 / 4);
    case 2: return n3;
    case 3: return Math.floor(4 * n3 / 5);
    case 4: return Math.max(0, Math.floor(6 * n3 / 5 - 15 * n * n + 100 * n - 140));
    case 5: // erratique
      if (n <= 50) return Math.floor(n3 * (100 - n) / 50);
      if (n <= 68) return Math.floor(n3 * (150 - n) / 100);
      if (n <= 98) return Math.floor(n3 * Math.floor((1911 - 10 * n) / 3) / 500);
      return Math.floor(n3 * (160 - n) / 100);
    case 6: // fluctuante
      if (n <= 15) return Math.floor(n3 * (Math.floor((n + 1) / 3) + 24) / 50);
      if (n <= 36) return Math.floor(n3 * (n + 14) / 50);
      return Math.floor(n3 * (Math.floor(n / 2) + 32) / 50);
    default: return n3;
  }
}

export function calcStats(m) {
  const b = SPECIES[m.sp].b, L = m.lvl, iv = m.iv, ev = m.ev || [0, 0, 0, 0, 0, 0], ne = m.nat != null ? natureEffect(m.nat) : null;
  return b.map((B, i) => {
    const core = Math.floor((2 * B + iv[i] + Math.floor(ev[i] / 4)) * L / 100);
    if (i === 0) return m.sp === 292 ? 1 : core + L + 10;
    const x = core + 5;
    return ne && ne[0] === i ? Math.floor(x * 1.1) : ne && ne[1] === i ? Math.floor(x * 0.9) : x;
  });
}

export function refreshStats(m, keepRatio = false) {
  const old = m.stats ? m.stats[0] : 0;
  m.stats = calcStats(m);
  if (m.hp == null) m.hp = m.stats[0];
  else if (keepRatio && old) m.hp = Math.min(m.stats[0], m.hp + (m.stats[0] - old));
  m.hp = Math.min(m.hp, m.stats[0]);
  return m;
}

/** les 4 dernières attaques apprises jusqu'à ce niveau */
export function defaultMoves(sp, lvl) {
  const ls = SPECIES[sp].ls.filter(([l]) => l <= lvl).map(([, id]) => id);
  const uniq = []; for (const id of ls) { const k = uniq.indexOf(id); if (k >= 0) uniq.splice(k, 1); uniq.push(id); }
  return uniq.slice(-4).map((id) => ({ id, pp: MOVES[id].pp }));
}

export function createMon(sp, lvl, o = {}) {
  sp = R(sp); // créature originale → son Pokémon remplaçant (data/remplacants.js)
  const r = o.rng || Math.random;
  const S = SPECIES[sp];
  const m = {
    uid: UID++, sp, lvl, exp: expFor(S.g, lvl),
    iv: o.iv || Array.from({ length: 6 }, () => Math.floor(r() * 32)),
    ev: [0, 0, 0, 0, 0, 0],
    nat: o.nat ?? Math.floor(r() * 25),
    moves: o.moves ? o.moves.map((id) => ({ id, pp: MOVES[id].pp })) : defaultMoves(sp, lvl),
    status: null, slp: 0, tox: 0,
    gender: S.gr < 0 ? null : (r() * 8 < S.gr ? 'f' : 'm'),
    shiny: o.shiny ?? r() < 1 / 1024,
    ball: o.ball || 'poke-ball',
    met: o.met || '', ot: o.ot || '',
    item: o.item || null,
    ability: o.ability || null,
  };
  refreshStats(m);
  return m;
}

export const monName = (m) => m.nick || SPECIES[m.sp].n;
export const species = (m) => SPECIES[m.sp];
export const isFainted = (m) => m.hp <= 0;

export function healFull(m) {
  refreshStats(m, true);
  m.hp = m.stats[0]; m.status = null; m.slp = 0; m.tox = 0;
  for (const mv of m.moves) mv.pp = MOVES[mv.id].pp;
}

/** attaques apprises en passant au niveau L */
export const movesAtLevel = (sp, L) => SPECIES[sp].ls.filter(([l]) => l === L).map(([, id]) => id);

/** Niveau max autorisé avant chaque Arène (niveau max du Champion - 1) */
// les cinq arènes du nord, les trois frères, puis les sept arènes des Terres du Sud
export const GYM_CAPS = [13, 21, 28, 33, 38, 43, 48, 55, 59, 62, 65, 68, 71, 74, 76];
export function levelCap(badges) {
  if (!Array.isArray(badges)) return 100;
  for (let i = 0; i < GYM_CAPS.length; i++) if (!badges[i]) return GYM_CAPS[i];
  return 100;
}

/**
 * Ajoute de l'expérience. Renvoie les étapes : [{ lvl, stats avant/après, learn: [ids] }]
 * Les attaques sont apprises seules s'il reste une place ; sinon elles sont renvoyées dans `ask`.
 */
export function gainExp(m, amount, maxLvl = 100) {
  const S = SPECIES[m.sp], steps = [], cap = Math.min(100, maxLvl || 100);
  if (m.lvl >= cap) {
    m.exp = Math.min(m.exp, expFor(S.g, cap));
    return steps;
  }
  m.exp += amount;
  while (m.lvl < cap && m.exp >= expFor(S.g, m.lvl + 1)) {
    const before = m.stats.slice();
    m.lvl++;
    refreshStats(m, true);
    const st = { lvl: m.lvl, before, after: m.stats.slice(), learned: [], ask: [] };
    for (const id of movesAtLevel(m.sp, m.lvl)) {
      if (m.moves.some((x) => x.id === id)) continue;
      if (m.moves.length < 4) { m.moves.push({ id, pp: MOVES[id].pp }); st.learned.push(id); }
      else st.ask.push(id);
    }
    steps.push(st);
  }
  if (m.lvl >= cap) m.exp = expFor(S.g, cap);
  return steps;
}

export function expProgress(m, maxLvl = 100) {
  if (m.lvl >= 100 || m.lvl >= maxLvl) return 1;
  const g = SPECIES[m.sp].g, a = expFor(g, m.lvl), b = expFor(g, m.lvl + 1);
  return Math.max(0, Math.min(1, (m.exp - a) / (b - a)));
}

/** évolution par niveau possible ? renvoie l'espèce cible */
export function levelEvolution(m, hour = 12) {
  const S = SPECIES[m.sp]; if (!S) return null;
  // Cas spécial Évoli : évolution temporelle (Mentali le jour, Noctali la nuit)
  if (m.sp === 133 && m.lvl >= 25) {
    const isNight = hour >= 20 || hour < 6;
    return isNight ? 197 : 196; // 197 = Noctali, 196 = Mentali
  }
  const ev = S.ev; if (!ev) return null;
  const e = ev.find((x) => x.lvl && m.lvl >= x.lvl);
  return e ? e.to : null;
}
export function itemEvolution(m, item) {
  if (m.sp === 133) {
    if (item === 'sun-stone') return 196; // Mentali
    if (item === 'moon-stone' || item === 'dusk-stone') return 197; // Noctali
  }
  const ev = SPECIES[m.sp]?.ev; if (!ev) return null;
  const e = ev.find((x) => x.item === item);
  return e ? e.to : null;
}
export function evolve(m, to) {
  const hadNick = !!m.nick;
  m.sp = to; if (!hadNick) delete m.nick;
  refreshStats(m, true);
  const learned = [], ask = [];
  for (const id of movesAtLevel(to, m.lvl)) {
    if (m.moves.some((x) => x.id === id)) continue;
    if (m.moves.length < 4) { m.moves.push({ id, pp: MOVES[id].pp }); learned.push(id); } else ask.push(id);
  }
  return { learned, ask };
}

/** points d'effort que donne un Pokémon vaincu : ceux des jeux officiels ; pour une créature originale, 1 à 3 points
 *  dans sa meilleure stat de base (selon son rang dans sa famille) */
export function effortYield(sp) {
  const e = EFFORT[sp]; if (e) return [...e].map(Number);
  const b = SPECIES[sp].b; let k = 0; for (let i = 1; i < 6; i++) if (b[i] > b[k]) k = i;
  const y = [0, 0, 0, 0, 0, 0]; y[k] = b.reduce((a, x) => a + x, 0) >= 480 ? 3 : b.reduce((a, x) => a + x, 0) >= 380 ? 2 : 1; return y;
}
/** gain d'effort (plafonds des jeux : 252 par stat, 510 en tout) ; renvoie les points gagnés */
export function gainEffort(m, foeSp) {
  m.ev ||= [0, 0, 0, 0, 0, 0];
  const y = effortYield(foeSp); let got = 0;
  for (let k = 0; k < 6; k++) {
    if (!y[k]) continue;
    const tot = m.ev.reduce((a, x) => a + x, 0), add = Math.max(0, Math.min(y[k], 252 - m.ev[k], 510 - tot));
    m.ev[k] += add; got += add;
  }
  return got;   // les stats suivent au prochain niveau ou au prochain soin (comme dans les jeux)
}

/** un Pokémon peut-il apprendre la CT ? Ceux des types de la CT, ceux qui apprennent déjà une attaque de ces types en
 *  montant de niveau, et les espèces nommées à part (it : l'objet CT de core/items.js) */
export function apteCT(sp, it) {
  const S = SPECIES[sp]; if (!S || !it?.ct) return false;
  const types = it.types || [MOVES[it.ct]?.t];
  if ((it.especes || []).includes(sp)) return true;
  if (S.t.some((t) => types.includes(t))) return true;
  return (S.ls || []).some(([, id]) => types.includes(MOVES[id]?.t));
}
