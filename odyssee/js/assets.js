// odyssee/js/assets.js — adresses des images. Les créatures originales, les personnages, les portraits et les objets
// viennent de img/ (préparés par tools/odyssee-sprites.py à partir de assets/graphics) ; les Pokémon du prototype
// gardent leurs sprites HeartGold/SoulSilver de PokeAPI.
import { SPECIES } from './data/species.js';
import { SPRITES } from './data/sprites.js';
import { ITEMS as ITEM_DEFS } from './core/items.js';

const params = new URLSearchParams(location.search);
const BASE = params.get('sprites') || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';
const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';
const HG = BASE + '/pokemon/versions/generation-iv/heartgold-soulsilver';
const IMG = new URL('../img/', import.meta.url).href;
const ITEMS = new Set(SPRITES.items || []), PORTRAITS = new Set(SPRITES.portraits || []);
const orig = (id) => id >= 1000 && SPECIES[id];

export const ASSETS = {
  front: (id, shiny) => (orig(id) ? `${IMG}crea/${SPECIES[id].k}-f${shiny ? 's' : ''}.png` : `${HG}${shiny ? '/shiny' : ''}/${id}.png`),
  back: (id, shiny) => (orig(id) ? `${IMG}crea/${SPECIES[id].k}-b${shiny ? 's' : ''}.png` : `${HG}/back${shiny ? '/shiny' : ''}/${id}.png`),
  icon: (id) => (orig(id) ? `${IMG}crea/${SPECIES[id].k}-i.png` : `${BASE}/pokemon/versions/generation-vii/icons/${id}.png`),
  item: (k) => { const ic = ITEM_DEFS[k]?.icon || k; return ITEMS.has(ic) ? `${IMG}items/${ic}.png` : `${BASE}/items/${ic}.png`; },
  // cri : enregistrement PokeAPI pour un Pokémon, cri synthétisé (« synth:id ») pour une créature originale
  cry: (id) => (orig(id) ? 'synth:' + id : params.has('sprites') ? null : `${CRIES}/${id}.ogg`),
  // portrait d'un dresseur (en combat) : nos portraits, sinon ceux de Poké Duel
  trainer: (k) => (PORTRAITS.has(k) ? `${IMG}portraits/${k}.png` : `../pokemon/assets/trainers/${k}.png`),
  portrait: (k) => (PORTRAITS.has(k) ? `${IMG}portraits/${k}-l.png` : null),
  chars: `${IMG}chars.png`,
  nature: (k) => `${IMG}nature/${k}.png`,
  mobilier: (k) => `${IMG}mobilier/${k}.png`,
  facade: (k) => `${IMG}facades/${k}.png`,
  sol: (k) => `${IMG}sol/${k}.png`,
  title: `${IMG}title-odyssor.png`,
};
/** précharge une image (résout même en cas d'échec) */
export function loadImg(src) {
  return new Promise((res) => { if (!src) { res(null); return; } const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
/** précharge un lot d'images { clé: adresse } → { clé: image } */
export async function loadAll(map) {
  const out = {}; await Promise.all(Object.entries(map).map(async ([k, src]) => { out[k] = await loadImg(src); })); return out;
}
