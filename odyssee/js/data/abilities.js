// odyssee/js/data/abilities.js — talents des Pokémon d'Odyssée : les vrais talents de chaque espèce (data/talents.js,
// tiré de PokeAPI), noms et descriptions en français. Le moteur de combat (core/battle.js) en joue l'effet.
import { TALENTS, TALENTS_ESPECES } from './talents.js';
import { SPECIES } from './species.js';

export const ABILITIES = Object.fromEntries(Object.entries(TALENTS).map(([id, [name, desc]]) => [id, { id, name, desc }]));

// créatures originales (sans entrée dans PokeAPI) : un talent selon leur premier type
const PAR_TYPE = { grass: 'overgrow', fire: 'blaze', water: 'torrent', bug: 'swarm', electric: 'static', ghost: 'levitate', rock: 'sturdy',
  ground: 'sand-veil', ice: 'ice-body', poison: 'poison-point', flying: 'keen-eye', fighting: 'guts', psychic: 'synchronize',
  dark: 'intimidate', dragon: 'rough-skin', steel: 'clear-body', fairy: 'cute-charm', normal: 'run-away' };
const ui = (id) => ABILITIES[id] || { id, name: id, desc: '' };

/** talents possibles d'une espèce : [talent 1, talent 2 (ou null), talent caché (ou null)] */
export function abilitiesOf(sp) {
  return TALENTS_ESPECES[sp] || [PAR_TYPE[SPECIES[sp]?.t?.[0]] || 'run-away', null, null];
}

/** talent d'un Pokémon : celui qu'on lui a donné, sinon un des talents de son espèce, choisi une fois pour toutes par ses
 *  IV et sa nature (il garde le même emplacement en évoluant) ; le talent caché est rare (environ une fois sur 25) */
export function getAbility(m) {
  if (!m) return null;
  if (m.ability && ABILITIES[m.ability]) return ABILITIES[m.ability];
  const [a, b, h] = abilitiesOf(m.sp), iv = m.iv || [0, 0, 0, 0, 0, 0];
  const seed = iv.reduce((s, x, k) => s + x * (k + 3), 0) + (m.nat || 0) * 7;
  if (h && (seed % 25 === 0 || !a)) return ui(h);
  return ui(b && seed % 2 ? b : a);
}

export function abilityName(key) {
  if (key && typeof key === 'object') return key.name || 'Aucun';
  return ABILITIES[key]?.name || key || 'Aucun';
}
