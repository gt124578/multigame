// Force d'une main de poker : la meilleure combinaison de 5 cartes parmi 5 à 7 cartes.
// evaluate(cards) → { cat (0 hauteur … 8 quinte flush), score (entier comparable), name, best (les 5 cartes) }
import { rankValue, suitOf } from './deck.js';

export const CATEGORY_NAMES = ['Hauteur', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];
const RANK_NAMES = ['deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'valet', 'dame', 'roi', 'as'];

function eval5(cards) {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  // quinte (l'as peut valoir 1 : A 2 3 4 5)
  let straightHigh = -1;
  const uniq = [...new Set(vals)];
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3 && uniq[4] === 0) straightHigh = 3; // roue : la quinte au cinq
  }
  const count = new Map();
  for (const v of vals) count.set(v, (count.get(v) || 0) + 1);
  // groupes triés : d'abord les plus nombreux, puis les plus hauts
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const kick = groups.map((g) => g[0]);
  let cat;
  if (straightHigh >= 0 && flush) cat = 8;
  else if (groups[0][1] === 4) cat = 7;
  else if (groups[0][1] === 3 && groups[1][1] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh >= 0) cat = 4;
  else if (groups[0][1] === 3) cat = 3;
  else if (groups[0][1] === 2 && groups[1][1] === 2) cat = 2;
  else if (groups[0][1] === 2) cat = 1;
  else cat = 0;
  const order = cat === 4 || cat === 8 ? [straightHigh] : kick;
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 13 + (order[i] ?? 0);
  return { cat, score, order };
}

function describe(cat, order) {
  const n = (v) => RANK_NAMES[v];
  const pl = (v) => { const w = RANK_NAMES[v]; return w === 'as' || w === 'dix' || w === 'six' || w === 'trois' ? w : w + 's'; }; // pluriel
  switch (cat) {
    case 8: return order[0] === 12 ? 'Quinte flush royale' : `Quinte flush au ${n(order[0])}`;
    case 7: return `Carré de ${pl(order[0])}`;
    case 6: return `Full aux ${pl(order[0])} par les ${pl(order[1])}`;
    case 5: return `Couleur, ${n(order[0])} en haut`;
    case 4: return `Quinte au ${n(order[0])}`;
    case 3: return `Brelan de ${pl(order[0])}`;
    case 2: return `Double paire ${pl(order[0])} et ${pl(order[1])}`;
    case 1: return `Paire de ${pl(order[0])}`;
    default: return `Hauteur ${n(order[0])}`;
  }
}

export function evaluate(cards) {
  if (cards.length < 5) {
    // avant le flop : juste pour afficher quelque chose à l'écran
    const e = eval5Partial(cards);
    return e;
  }
  let best = null;
  const n = cards.length;
  // toutes les combinaisons de 5 parmi n (21 au plus)
  for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++) for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
    const hand = [cards[a], cards[b], cards[c], cards[d], cards[e]];
    const r = eval5(hand);
    if (!best || r.score > best.score) best = { ...r, best: hand };
  }
  return { cat: best.cat, score: best.score, name: describe(best.cat, best.order), best: best.best };
}

function eval5Partial(cards) {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const count = new Map();
  for (const v of vals) count.set(v, (count.get(v) || 0) + 1);
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const cat = groups[0][1] >= 2 ? 1 : 0;
  const order = groups.map((g) => g[0]);
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 13 + (order[i] ?? 0);
  return { cat, score, name: describe(cat, order), best: cards.slice() };
}

export const compare = (a, b) => a.score - b.score;
