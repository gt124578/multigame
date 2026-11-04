// Cartes à jouer : une carte est une chaîne « rang + couleur », ex. 'AS' (as de pique), 'TH' (dix de cœur), '7D', 'JC'.
// Rangs : 2 3 4 5 6 7 8 9 T J Q K A — couleurs : S (pique), H (cœur), D (carreau), C (trèfle).
export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' };
export const RANK_LABEL = { T: '10', J: 'V', Q: 'D', K: 'R', A: 'A' };

export const rankOf = (c) => c[0];
export const suitOf = (c) => c[1];
export const rankValue = (c) => RANKS.indexOf(c[0]); // 0 (deux) à 12 (as)
export const isRed = (c) => c[1] === 'H' || c[1] === 'D';
export const label = (c) => (RANK_LABEL[c[0]] || c[0]) + SUIT_SYMBOL[c[1]];

// 52 cartes (poker)
export function deck52() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}

// 32 cartes (belote) : du 7 à l'as
export function deck32() {
  const d = [];
  for (const s of SUITS) for (const r of ['7', '8', '9', 'T', 'J', 'Q', 'K', 'A']) d.push(r + s);
  return d;
}

export function shuffled(rng, cards) {
  return rng.shuffle(cards.slice());
}
