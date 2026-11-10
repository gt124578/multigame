// odyssee/js/assets.js — adresses des images. Les créatures originales, les personnages, les portraits et les objets
// viennent de img/ (préparés par tools/odyssee-sprites.py à partir de assets/graphics) ; les Pokémon du prototype
// gardent leurs sprites HeartGold/SoulSilver de PokeAPI (Noir / Blanc au-delà du n° 493).
import { SPECIES } from './data/species.js';
import { SPRITES } from './data/sprites.js';
import { ITEMS as ITEM_DEFS } from './core/items.js';
import { spritesChoix } from './gfx.js';

const params = new URLSearchParams(location.search);
// sprites des Pokémon (face, dos, chromatiques, icônes) copiés de PokeAPI dans le dépôt : le jeu n'en dépend plus en ligne
// (?sprites=<adresse> permet toujours d'en essayer d'autres)
const BASE = params.get('sprites') || new URL('../img/pokeapi', import.meta.url).href;
// cris des Pokémon copiés de PokeAPI dans le dépôt (tools/odyssee-megas.mjs)
const CRIES = new URL('../snd/cris', import.meta.url).href;
const HG = BASE + '/pokemon/versions/generation-iv/heartgold-soulsilver';
// après le n° 493 (pas de dessin HeartGold / SoulSilver) : dessins Noir / Blanc, même style pixel
const BW = BASE + '/pokemon/versions/generation-v/black-white';
const gen = (id) => (id <= 493 && spritesChoix() !== 'bw' ? HG : BW);   // Options → Graphismes → Sprites des Pokémon
const IMG = new URL('../img/', import.meta.url).href;
const ITEMS = new Set(SPRITES.items || []), PORTRAITS = new Set(SPRITES.portraits || []), DRESSEURS = new Set(SPRITES.dresseurs || []);
// champions dont le portrait de combat n'est pas encore dessiné : un dresseur qui leur ressemble
const SOSIES = { pierre: 'topdresseur', croupier: 'garde' };
const orig = (id) => id >= 1000 && id < 10000 && SPECIES[id];
// formes Méga (n° PokeAPI 10033 et suivants) : leurs sprites copiés de PokeAPI
const mega = (id) => id >= 10000;
// espèces dont la version obscure a son dessin
const OBSCURS = new Set([249]);

export const ASSETS = {
  // version obscure (Lugia Obscur) : son propre dessin s'il existe (img/crea/<espèce>-shadow-f / -b / -i.png)
  front: (id, shiny, shadow) => (id >= 20000 ? `${IMG}megas/${id}-f.png` : mega(id) ? `${BASE}/pokemon${shiny ? '/shiny' : ''}/${id}.png` : shadow && OBSCURS.has(id) ? `${IMG}crea/${SPECIES[id].k}-shadow-f.png` : orig(id) ? `${IMG}crea/${SPECIES[id].k}-f${shiny ? 's' : ''}.png` : `${gen(id)}${shiny ? '/shiny' : ''}/${id}.png`),
  back: (id, shiny, shadow) => (id >= 20000 ? `${IMG}megas/${id}-b.png` : mega(id) ? `${BASE}/pokemon/back${shiny ? '/shiny' : ''}/${id}.png` : shadow && OBSCURS.has(id) ? `${IMG}crea/${SPECIES[id].k}-shadow-b.png` : orig(id) ? `${IMG}crea/${SPECIES[id].k}-b${shiny ? 's' : ''}.png` : `${gen(id)}/back${shiny ? '/shiny' : ''}/${id}.png`),
  icon: (id, shadow) => (id >= 20000 ? ASSETS.icon(SPECIES[id]?.mega || 0) : mega(id) ? `${BASE}/pokemon/versions/generation-vii/icons/${id}.png` : shadow && OBSCURS.has(id) ? `${IMG}crea/${SPECIES[id].k}-shadow-i.png` : orig(id) ? `${IMG}crea/${SPECIES[id].k}-i.png` : `${BASE}/pokemon/versions/generation-vii/icons/${id}.png`),
  shadowFront: (id) => `${IMG}crea/${SPECIES[id].k}-shadow-f.png`,
  shadowBack: (id) => `${IMG}crea/${SPECIES[id].k}-shadow-b.png`,
  shadowIcon: (id) => `${IMG}crea/${SPECIES[id].k}-shadow-i.png`,
  item: (k) => { const ic = ITEM_DEFS[k]?.icon || k; return ITEMS.has(ic) ? `${IMG}items/${ic}.png` : `${BASE}/items/${ic}.png`; },
  // cri : enregistrement PokeAPI pour un Pokémon, cri synthétisé (« synth:id ») pour une créature originale
  cry: (id) => (id >= 20000 ? ASSETS.cry(SPECIES[id]?.mega) : orig(id) ? 'synth:' + id : params.has('sprites') ? null : `${CRIES}/${id}.ogg`),
  // dresseur en combat : dessins HeartGold / SoulSilver (provisoires), sinon nos portraits, sinon ceux de Poké Duel
  trainer: (k) => (!DRESSEURS.has(k) && !PORTRAITS.has(k) && SOSIES[k] ? ASSETS.trainer(SOSIES[k]) : DRESSEURS.has(k) ? `${IMG}dresseurs/${k}.png` : PORTRAITS.has(k) ? `${IMG}portraits/${k}.png` : `../pokemon/assets/trainers/${k}.png`),
  portrait: (k) => {
    if (!k) return null;
    if (PORTRAITS.has(k)) return `${IMG}portraits/${k}-l.png`;
    if (DRESSEURS.has(k)) return `${IMG}dresseurs/${k}.png`;
    if (SOSIES[k] && (PORTRAITS.has(SOSIES[k]) || DRESSEURS.has(SOSIES[k]))) return ASSETS.portrait(SOSIES[k]);
    return null;
  },
  chars: `${IMG}chars.png`,
  suiveurs: `${IMG}suiveurs.png`,
  relief: `${IMG}relief.png`,
  nature: (k) => `${IMG}nature/${k}.png`,
  mobilier: (k) => `${IMG}mobilier/${k}.png`,
  facade: (k) => `${IMG}facades/${k}.png`,
  sol: (k) => `${IMG}sol/${k}.png`,
  sol32: (k) => `${IMG}sol32/${k}.png`,
  gfx: (dossier, k) => `${IMG}${dossier}/${k}.png`,
  sol16: (k) => `${IMG}sol16/${k}.png`,
  herbe: (k) => `${IMG}herbes/${k}.png`,
  hgss: (k) => `${IMG}hgss/${k}.png`,
  deco: (k) => `${IMG}deco/${k}.png`,
  carte: (k) => `${IMG}carte/${k}.png`,
  carteBg: `${IMG}carte/c_gear_b2w2_bg.jpg`,
  badge: (k, locked = false) => `${IMG}badges/badge_${k}${locked ? '_locked' : ''}.png`,
  cardFrame: `${IMG}card/b2w2_card_frame.png`,
  cardBg: (rankTheme = 'normal') => {
    const valid = ['normal', 'bronze', 'silver', 'gold', 'master'];
    const t = valid.includes(rankTheme) ? rankTheme : 'normal';
    return `${IMG}card/card_front_${t}.jpg`;
  },
  cardBack: `${IMG}card/card_back_case.jpg`,
  title: `${IMG}title-odyssor.png`,
};
/** précharge une image (résout même en cas d'échec) */
export function loadImg(src) {
  // une image qui tarde (réseau lent) ne bloque jamais l'écran plus de 8 s : on continue sans elle
  return new Promise((res) => {
    if (!src) { res(null); return; }
    const im = new Image(); let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    im.crossOrigin = 'anonymous'; im.onload = () => fin(im); im.onerror = () => fin(null); im.src = src; setTimeout(() => fin(im.complete && im.naturalWidth ? im : null), 8000);
  });
}
/** précharge un lot d'images { clé: adresse } → { clé: image } */
export async function loadAll(map) {
  const out = {}; await Promise.all(Object.entries(map).map(async ([k, src]) => { out[k] = await loadImg(src); })); return out;
}
