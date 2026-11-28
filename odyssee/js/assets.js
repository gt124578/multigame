// odyssee/js/assets.js — adresses des images. Les créatures originales, les personnages, les portraits et les objets
// viennent de img/ (préparés par tools/odyssee-sprites.py à partir de assets/graphics) ; les Pokémon du prototype
// gardent leurs sprites HeartGold/SoulSilver de PokeAPI (Noir / Blanc au-delà du n° 493).
import { SPECIES } from './data/species.js';
import { SPRITES } from './data/sprites.js';
import { ITEMS as ITEM_DEFS } from './core/items.js';
import { spritesChoix } from './gfx.js';
import { VERSION_ODYSSEE } from './version.js';

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
// images attendues, pas encore peintes : tant que leur nom n'est pas inscrit dans data/sprites.js, une image qui existe sert de repli
// (on ne demande jamais un fichier absent). Objets : img/items/<nom>.png, inscrit dans SPRITES.items ; bustes de dialogue sans
// portrait de combat : img/portraits/<nom>-l.png, inscrit dans SPRITES.bustes (savant = le Professeur Cèdre ; mamadou, garde et
// vieil_homme gardent d'ici là leur dessin de combat)
// Bustes de dialogue encore attendus (le dialogue montre d'ici là leur dessin de combat, img/dresseurs/<nom>.png, qui
// existe : aucune image absente n'est demandée) : margot, aurele, morgane, gaspard, ferdinand, lilas, corbin (Champions du
// Sud), pierre (la Bourse), sylas, ariane, nox (la Brume). À l'arrivée d'un buste : poser img/portraits/<nom>-l.png et
// ajouter <nom> à SPRITES.bustes (data/sprites.js) ; rien d'autre à changer (ASSETS.portrait le prend aussitôt)
const REPLI_OBJET = { 'cs-eclate': 'notebook' };
const BUSTES = new Set(SPRITES.bustes || []);
// champions dont le portrait de combat n'est pas encore dessiné : un dresseur qui leur ressemble
const SOSIES = { pierre: 'topdresseur', croupier: 'garde' };
// en combat seulement (les dialogues gardent le buste de leur dessin) : personnages sans dessin de combat ni portrait
// peint (Dr Lumen, habitants…), pour ne jamais demander une image introuvable
const SOSIES_COMBAT = { ...SOSIES, savant: 'scientifique', capitaine: 'marin', facteur: 'habitant', jardinier: 'habitant', maman: 'habitante', dame: 'habitante', lucie: 'fillette', fillette2: 'fillette', nurse: 'habitante', vendeur: 'habitant' };
// dresseurs de Poké Duel (../pokemon/assets/trainers) : derniers recours connus
const POKEDUEL = new Set(['agatha-gen3', 'blue', 'brock', 'bruno', 'calem', 'cynthia', 'cyrus', 'galacticgrunt', 'galacticgruntf', 'hiker', 'karen', 'korrina', 'lance', 'lass', 'mars', 'misty', 'morty', 'pokemoncenterlady', 'pryce', 'red', 'sailor', 'saturn', 'serena', 'sycamore', 'youngster']);
const orig = (id) => id >= 1000 && id < 10000 && SPECIES[id];
// formes Méga (n° PokeAPI 10033 et suivants) : leurs sprites copiés de PokeAPI
const mega = (id) => id >= 10000;
// espèces dont la version obscure a son dessin
const OBSCURS = new Set([249]);

export const ASSETS = {
  // version obscure (Lugia Obscur) : son propre dessin s'il existe (img/crea/<espèce>-shadow-f / -b / -i.png)
  front: (id, shiny, shadow) => (id >= 20000 ? `${IMG}megas/${id}-f.png?v=${VERSION_ODYSSEE}` : mega(id) ? `${BASE}/pokemon${shiny ? '/shiny' : ''}/${id}.png` : shadow && OBSCURS.has(id) ? `${IMG}crea/${SPECIES[id].k}-shadow-f.png?v=${VERSION_ODYSSEE}` : orig(id) ? `${IMG}crea/${SPECIES[id].k}-f${shiny ? 's' : ''}.png?v=${VERSION_ODYSSEE}` : `${gen(id)}${shiny ? '/shiny' : ''}/${id}.png`),
  back: (id, shiny, shadow) => (id >= 20000 ? `${IMG}megas/${id}-b.png?v=${VERSION_ODYSSEE}` : mega(id) ? `${BASE}/pokemon/back${shiny ? '/shiny' : ''}/${id}.png` : shadow && OBSCURS.has(id) ? `${IMG}crea/${SPECIES[id].k}-shadow-b.png?v=${VERSION_ODYSSEE}` : orig(id) ? `${IMG}crea/${SPECIES[id].k}-b${shiny ? 's' : ''}.png?v=${VERSION_ODYSSEE}` : `${gen(id)}/back${shiny ? '/shiny' : ''}/${id}.png`),
  icon: (id, shadow) => (id >= 20000 ? ASSETS.icon(SPECIES[id]?.mega || 0) : mega(id) ? `${BASE}/pokemon/versions/generation-vii/icons/${id}.png` : shadow && OBSCURS.has(id) ? `${IMG}crea/${SPECIES[id].k}-shadow-i.png?v=${VERSION_ODYSSEE}` : orig(id) ? `${IMG}crea/${SPECIES[id].k}-i.png?v=${VERSION_ODYSSEE}` : `${BASE}/pokemon/versions/generation-vii/icons/${id}.png`),
  shadowFront: (id) => `${IMG}crea/${SPECIES[id].k}-shadow-f.png?v=${VERSION_ODYSSEE}`,
  shadowBack: (id) => `${IMG}crea/${SPECIES[id].k}-shadow-b.png?v=${VERSION_ODYSSEE}`,
  shadowIcon: (id) => `${IMG}crea/${SPECIES[id].k}-shadow-i.png?v=${VERSION_ODYSSEE}`,
  item: (k) => { const voulu = ITEM_DEFS[k]?.icon || k, ic = ITEMS.has(voulu) ? voulu : REPLI_OBJET[voulu] || voulu; return ITEMS.has(ic) ? `${IMG}items/${ic}.png?v=${VERSION_ODYSSEE}` : `${BASE}/items/${ic}.png`; },
  // cri : enregistrement PokeAPI pour un Pokémon, cri synthétisé (« synth:id ») pour une créature originale
  cry: (id) => (id >= 20000 ? ASSETS.cry(SPECIES[id]?.mega) : orig(id) ? 'synth:' + id : params.has('sprites') ? null : `${CRIES}/${id}.ogg`),
  // dresseur en combat : dessins HeartGold / SoulSilver (provisoires), sinon nos portraits, sinon ceux de Poké Duel
  trainer: (k) => (!DRESSEURS.has(k) && !PORTRAITS.has(k) && SOSIES_COMBAT[k] ? ASSETS.trainer(SOSIES_COMBAT[k]) : DRESSEURS.has(k) ? `${IMG}dresseurs/${k}.png?v=${VERSION_ODYSSEE}` : PORTRAITS.has(k) ? `${IMG}portraits/${k}.png?v=${VERSION_ODYSSEE}` : POKEDUEL.has(k) ? `../pokemon/assets/trainers/${k}.png` : `${IMG}portraits/topdresseur.png?v=${VERSION_ODYSSEE}`),
  portrait: (k) => {
    if (!k) return null;
    if (PORTRAITS.has(k) || BUSTES.has(k)) return `${IMG}portraits/${k}-l.png?v=${VERSION_ODYSSEE}`;
    if (DRESSEURS.has(k)) return `${IMG}dresseurs/${k}.png?v=${VERSION_ODYSSEE}`;
    if (SOSIES[k] && (PORTRAITS.has(SOSIES[k]) || DRESSEURS.has(SOSIES[k]))) return ASSETS.portrait(SOSIES[k]);
    return null;
  },
  /** ce personnage a-t-il son buste de dialogue peint (portrait ou buste seul) ? */
  aBuste: (k) => PORTRAITS.has(k) || BUSTES.has(k),
  chars: `${IMG}chars.png?v=${VERSION_ODYSSEE}`,
  suiveurs: `${IMG}suiveurs.png?v=${VERSION_ODYSSEE}`,
  relief: `${IMG}relief.png?v=${VERSION_ODYSSEE}`,
  biomes: (k) => `${IMG}biomes/${k}.png?v=${VERSION_ODYSSEE}`,
  nature: (k) => `${IMG}nature/${k}.png?v=${VERSION_ODYSSEE}`,
  mobilier: (k) => `${IMG}mobilier/${k}.png?v=${VERSION_ODYSSEE}`,
  facade: (k) => `${IMG}facades/${k}.png?v=${VERSION_ODYSSEE}`,
  sol: (k) => `${IMG}sol/${k}.png?v=${VERSION_ODYSSEE}`,
  sol32: (k) => `${IMG}sol32/${k}.png?v=${VERSION_ODYSSEE}`,
  gfx: (dossier, k) => `${IMG}${dossier}/${k}.png?v=${VERSION_ODYSSEE}`,
  sol16: (k) => `${IMG}sol16/${k}.png?v=${VERSION_ODYSSEE}`,
  herbe: (k) => `${IMG}herbes/${k}.png?v=${VERSION_ODYSSEE}`,
  hgss: (k) => `${IMG}hgss/${k}.png?v=${VERSION_ODYSSEE}`,
  deco: (k) => `${IMG}deco/${k}.png?v=${VERSION_ODYSSEE}`,
  carte: (k) => `${IMG}carte/${k}.png?v=${VERSION_ODYSSEE}`,
  carteBg: `${IMG}carte/c_gear_b2w2_bg.jpg`,
  badge: (k, locked = false) => `${IMG}badges/badge_${k}${locked ? '_locked' : ''}.png?v=${VERSION_ODYSSEE}`,
  cardFrame: `${IMG}card/b2w2_card_frame.png?v=${VERSION_ODYSSEE}`,
  cardBg: (rankTheme = 'normal') => {
    const valid = ['normal', 'bronze', 'silver', 'gold', 'master'];
    const t = valid.includes(rankTheme) ? rankTheme : 'normal';
    return `${IMG}card/card_front_${t}.jpg`;
  },
  cardBack: `${IMG}card/card_back_case.jpg`,
  title: `${IMG}title-odyssor.png?v=${VERSION_ODYSSEE}`,
};
/** précharge une image (résout même en cas d'échec) */
export function loadImg(src) {
  // une image qui tarde (réseau lent) ne bloque jamais l'écran plus de 8 s : on continue sans elle
  return new Promise((res) => {
    if (!src) { res(null); return; }
    const im = new Image(); let done = false; let timer = null;
    const fin = (v) => { if (!done) { done = true; clearTimeout(timer); res(v); } };
    im.crossOrigin = 'anonymous'; im.onload = () => fin(im); im.onerror = () => fin(null); im.src = src;
    timer = setTimeout(() => fin(im.complete && im.naturalWidth ? im : null), 8000);
  });
}
/** précharge un lot d'images { clé: adresse } → { clé: image } */
export async function loadAll(map) {
  const out = {}; await Promise.all(Object.entries(map).map(async ([k, src]) => { out[k] = await loadImg(src); })); return out;
}
