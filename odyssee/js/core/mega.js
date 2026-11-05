// odyssee/js/core/mega.js — Méga-Évolution.
// Un Pokémon méga-évolue en combat si son dresseur a le Méga-Anneau et s'il tient la Méga-Gemme de son espèce ;
// une seule Méga-Évolution par dresseur et par combat. Pendant le combat, il prend l'espèce de sa forme Méga
// (types, statistiques sauf les PV, talent, sprite), et la retrouve à la fin (revertMegas).
// Les formes (n° PokeAPI 10033 et suivants) viennent de data/megas.js (tools/odyssee-megas.mjs).
import { SPECIES } from '../data/species.js';
import { TALENTS_ESPECES } from '../data/talents.js';
import { ABILITIES } from '../data/abilities.js';
import { ITEMS } from './items.js';
import { MEGA_FORMS as OFFICIELLES, MEGA_ABILITIES } from '../data/megas.js';
import { MEGA_FANS } from '../data/megasFans.js';
/** toutes les formes Méga : officielles (PokeAPI) et imaginées par des fans (n° 20001 et plus) */
export const MEGA_FORMS = { ...OFFICIELLES, ...MEGA_FANS };
import { calcStats } from './mon.js';

export const MEGA_RING = 'mega-ring';
/** Méga des légendaires : leurs gemmes ne se vendent qu'au Maître de la Ligue */
export const LEGEND = new Set([150, 380, 381, 485, 491, 719]);
/** gemme → n° de la forme Méga */
export const STONE_FORM = {};
/** espèce de base → [n° des formes Méga] */
export const MEGAS_OF = {};

for (const [pidS, f] of Object.entries(MEGA_FORMS)) {
  const pid = +pidS, base = SPECIES[f.base];
  if (!base) continue;
  // la forme Méga est une « espèce » que le moteur sait lire, mais invisible des listes (Pokédex, rencontres, trophées)
  if (!Object.prototype.hasOwnProperty.call(SPECIES, pid)) {
    Object.defineProperty(SPECIES, pid, {
      enumerable: false, configurable: true,
      value: { ...base, n: f.n, k: f.key, t: f.t, b: f.b, ev: [], mega: f.base, megaShiny: f.shiny },
    });
  }
  const baseAb = TALENTS_ESPECES[f.base] || [null, null, null];
  TALENTS_ESPECES[pid] = f.ab ? [f.ab, null, null] : baseAb;
  if (f.ab && !ABILITIES[f.ab]) { const [name, desc] = MEGA_ABILITIES[f.ab] || [f.ab, '']; ABILITIES[f.ab] = { id: f.ab, name, desc }; }
  STONE_FORM[f.stone] = pid;
  (MEGAS_OF[f.base] ||= []).push(pid);
  // la Méga-Gemme : un objet à tenir, rangé avec les objets
  if (!ITEMS[f.stone]) {
    ITEMS[f.stone] = { pocket: 'objets', price: LEGEND.has(f.base) ? 50000 : pid >= 10278 ? 25000 : 20000, hold: 'mega', mega: pid, name: f.stoneName, icon: f.fan ? 'altarianite' : f.stoneIcon ? f.stone : 'gift',
      desc: `Méga-Gemme. Tenue par ${base.n}, elle lui permet de méga-évoluer en combat si son dresseur porte un Méga-Anneau.` };
  }
}
ITEMS[MEGA_RING] ||= { pocket: 'cles', price: 0, key: true, icon: 'mega-ring', name: 'Méga-Anneau',
  desc: 'Un anneau serti d\'une Pierre Clé. En combat, il fait réagir la Méga-Gemme que tient un Pokémon et le fait méga-évoluer, une fois par combat.' };

/** espèce de base d'un Pokémon, même méga-évolué */
export const baseSpecies = (m) => m.megaFrom || m.sp;
/** n° de la forme Méga qu'atteindrait ce Pokémon avec la gemme qu'il tient (ou null) */
export function megaFormOf(m) {
  if (!m || m.megaFrom || !m.item) return null;
  const pid = STONE_FORM[m.item];
  return pid && MEGA_FORMS[pid].base === m.sp ? pid : null;
}
/** transforme le Pokémon (les PV ne bougent pas) */
export function megaEvolve(m) {
  const pid = megaFormOf(m); if (!pid) return false;
  const hpMax = m.stats[0];
  m.megaFrom = m.sp; m.sp = pid;
  m.stats = calcStats(m); m.stats[0] = hpMax;
  return true;
}
/** retour à la forme de base (fin de combat, ou partie rechargée en plein combat) */
export function revertMega(m) {
  if (!m?.megaFrom) return;
  const hp = m.hp;
  m.sp = m.megaFrom; delete m.megaFrom;
  m.stats = calcStats(m); m.hp = Math.min(hp, m.stats[0]);
}
export function revertMegas(party) { for (const m of party || []) revertMega(m); }
