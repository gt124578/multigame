// odyssee/js/assets.js — adresses des images. Les créatures originales, les personnages, les portraits et les objets
// viennent de img/ (préparés par tools/odyssee-sprites.py à partir de assets/graphics) ; les Pokémon du prototype
// gardent leurs sprites HeartGold/SoulSilver de PokeAPI (Noir / Blanc au-delà du n° 493).
import { SPECIES } from './data/species.js';
import { SPRITES } from './data/sprites.js';
import { ITEMS as ITEM_DEFS } from './core/items.js';

const params = new URLSearchParams(location.search);
const BASE = params.get('sprites') || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';
const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';
const HG = BASE + '/pokemon/versions/generation-iv/heartgold-soulsilver';
// après le n° 493 (pas de dessin HeartGold / SoulSilver) : dessins Noir / Blanc, même style pixel
const BW = BASE + '/pokemon/versions/generation-v/black-white';
const gen = (id) => (id <= 493 ? HG : BW);
const IMG = new URL('../img/', import.meta.url).href;
const ITEMS = new Set(SPRITES.items || []), PORTRAITS = new Set(SPRITES.portraits || []), DRESSEURS = new Set(SPRITES.dresseurs || []);
// champions dont le portrait de combat n'est pas encore dessiné : un dresseur qui leur ressemble
const SOSIES = { pierre: 'topdresseur', croupier: 'garde' };
const orig = (id) => id >= 1000 && SPECIES[id];
// espèces dont la version obscure a son dessin
const OBSCURS = new Set([249]);

export const ASSETS = {
  // version obscure (Lugia Obscur) : son propre dessin s'il existe (img/crea/<espèce>-shadow-f / -b / -i.png)
  front: (id, shiny, shadow) => (shadow && OBSCURS.has(id) ? `${IMG}crea/${SPECIES[id].k}-shadow-f.png` : orig(id) ? `${IMG}crea/${SPECIES[id].k}-f${shiny ? 's' : ''}.png` : `${gen(id)}${shiny ? '/shiny' : ''}/${id}.png`),
  back: (id, shiny, shadow) => (shadow && OBSCURS.has(id) ? `${IMG}crea/${SPECIES[id].k}-shadow-b.png` : orig(id) ? `${IMG}crea/${SPECIES[id].k}-b${shiny ? 's' : ''}.png` : `${gen(id)}/back${shiny ? '/shiny' : ''}/${id}.png`),
  icon: (id, shadow) => (shadow && OBSCURS.has(id) ? `${IMG}crea/${SPECIES[id].k}-shadow-i.png` : orig(id) ? `${IMG}crea/${SPECIES[id].k}-i.png` : `${BASE}/pokemon/versions/generation-vii/icons/${id}.png`),
  shadowFront: (id) => `${IMG}crea/${SPECIES[id].k}-shadow-f.png`,
  shadowBack: (id) => `${IMG}crea/${SPECIES[id].k}-shadow-b.png`,
  shadowIcon: (id) => `${IMG}crea/${SPECIES[id].k}-shadow-i.png`,
  item: (k) => { const ic = ITEM_DEFS[k]?.icon || k; return ITEMS.has(ic) ? `${IMG}items/${ic}.png` : `${BASE}/items/${ic}.png`; },
  // cri : enregistrement PokeAPI pour un Pokémon, cri synthétisé (« synth:id ») pour une créature originale
  cry: (id) => (orig(id) ? 'synth:' + id : params.has('sprites') ? null : `${CRIES}/${id}.ogg`),
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
  sol16: (k) => `${IMG}sol16/${k}.png`,
  herbe: (k) => `${IMG}herbes/${k}.png`,
  hgss: (k) => `${IMG}hgss/${k}.png`,
  deco: (k) => `${IMG}deco/${k}.png`,
  carte: (k) => `${IMG}carte/${k}.png`,
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
