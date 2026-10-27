// Créatures possédées ou sauvages : stats, expérience, capacités, évolution.
import { species } from './species.js';
import { move } from './moves.js';

let UID = 1;
export const STAT_NAMES = ['PV', 'Attaque', 'Défense', 'Atq. Spé.', 'Déf. Spé.', 'Vitesse'];
export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STATUS_NAMES = { psn: 'PSN', brn: 'BRL', par: 'PAR', slp: 'SOM', frz: 'GEL' };
export const STATUS_COLORS = { psn: '#a040a0', brn: '#f08030', par: '#d8b020', slp: '#8a8a8a', frz: '#58b8d8' };

export function xpFor(level) { return level <= 1 ? 0 : Math.floor(level ** 3); }

export function calcStats(m) {
  const S = species(m.sp), st = {};
  STAT_KEYS.forEach((k, i) => {
    const b = S.st[i], iv = m.ivs[i];
    st[k] = i === 0 ? Math.floor(((2 * b + iv) * m.level) / 100) + m.level + 10 : Math.floor(((2 * b + iv) * m.level) / 100) + 5;
  });
  return st;
}

/** les 4 dernières capacités apprises à ce niveau */
export function movesAt(spId, level) {
  const L = species(spId).learn.filter(([l]) => l <= level).map(([, id]) => id);
  const uniq = [...new Set(L)];
  return uniq.slice(-4);
}

export function makeMon(spId, level, rnd = Math.random, o = {}) {
  const m = {
    uid: o.uid ?? (Date.now() % 1e9) * 100 + UID++,
    sp: spId, level, ivs: o.ivs || Array.from({ length: 6 }, () => Math.floor(rnd() * 32)),
    nick: o.nick || null, status: null, sleep: 0, xp: xpFor(level), friend: 70,
  };
  m.stats = calcStats(m);
  m.hp = m.stats.hp;
  m.moves = (o.moves || movesAt(spId, level)).map((id) => ({ id, pp: move(id).pp }));
  return m;
}
export function monName(m) { return m.nick || species(m.sp).name; }

/** ajoute de l'expérience ; renvoie la liste des niveaux gagnés et des capacités à apprendre */
export function gainXp(m, amount) {
  const out = [];
  if (m.level >= 100) return out;
  m.xp += amount;
  while (m.level < 100 && m.xp >= xpFor(m.level + 1)) {
    const before = { ...m.stats };
    m.level++;
    m.stats = calcStats(m);
    m.hp = Math.min(m.stats.hp, m.hp + (m.stats.hp - before.hp));
    const learn = species(m.sp).learn.filter(([l]) => l === m.level).map(([, id]) => id).filter((id) => !m.moves.some((x) => x.id === id));
    out.push({ level: m.level, before, after: { ...m.stats }, learn });
  }
  return out;
}

/** apprend une capacité (si 4 déjà connues, replace = index à oublier, ou -1 pour renoncer) */
export function learnMove(m, id, replace = null) {
  if (m.moves.some((x) => x.id === id)) return false;
  if (m.moves.length < 4) { m.moves.push({ id, pp: move(id).pp }); return true; }
  if (replace == null || replace < 0) return false;
  m.moves[replace] = { id, pp: move(id).pp };
  return true;
}

export function evolutionTarget(m) {
  const e = species(m.sp).evo;
  return e && m.level >= e[0] ? e[1] : null;
}
export function evolve(m, to) {
  const hpLost = m.stats.hp - m.hp;
  m.sp = to; m.stats = calcStats(m); m.hp = Math.max(1, m.stats.hp - hpLost);
}

export function healMon(m) { m.hp = m.stats.hp; m.status = null; m.sleep = 0; for (const mv of m.moves) mv.pp = move(mv.id).pp; }
export function xpYield(foe, trainer) { return Math.floor((species(foe.sp).xp * foe.level) / 7 * (trainer ? 1.5 : 1)); }
