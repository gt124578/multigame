// odyssee/js/ui/screens/common.js — outils partagés par les écrans plein cadre
import { el, esc } from '../ui.js';
import { ASSETS } from '../../assets.js';

export const TYPE_FR = { fairy: 'Fée', normal: 'Normal', fighting: 'Combat', flying: 'Vol', poison: 'Poison', ground: 'Sol', rock: 'Roche', bug: 'Insecte', ghost: 'Spectre', steel: 'Acier', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', psychic: 'Psy', ice: 'Glace', dragon: 'Dragon', dark: 'Ténèbres' };
export const TYPE_COL = { fairy: '#ee99ac', normal: '#a8a878', fighting: '#c03028', flying: '#a890f0', poison: '#a040a0', ground: '#e0c068', rock: '#b8a038', bug: '#a8b820', ghost: '#705898', steel: '#b8b8d0', fire: '#f08030', water: '#6890f0', grass: '#78c850', electric: '#f8d030', psychic: '#f85888', ice: '#98d8d8', dragon: '#7038f8', dark: '#705848' };
export const STATUS_FR = { par: ['PAR', '#e8c020'], slp: ['SOM', '#8890a0'], psn: ['PSN', '#a050b0'], tox: ['PSN', '#7a3090'], brn: ['BRÛ', '#e86030'], frz: ['GEL', '#60c0e8'] };
export const typeTag = (t) => `<span class="type" style="background:${TYPE_COL[t]}">${TYPE_FR[t]}</span>`;
export const hpCol = (r) => (r > 0.5 ? '#48d058' : r > 0.2 ? '#f0c020' : '#f04838');
export function hpBar(m) { const r = m.hp / m.stats[0]; return `<div class="hp"><b>PV</b><i><u style="width:${Math.max(0, r * 100)}%;background:${hpCol(r)}"></u></i></div>`; }
export const statusTag = (m) => (m.hp <= 0 ? '<span class="st" style="background:#c03838">K.O.</span>' : m.status ? `<span class="st" style="background:${STATUS_FR[m.status][1]}">${STATUS_FR[m.status][0]}</span>` : '');
export const gender = (m) => (m.gender === 'm' ? '<span class="g m">♂</span>' : m.gender === 'f' ? '<span class="g f">♀</span>' : '');
export const iconImg = (m) => `<img class="ico${m?.shadow ? ' shadowmon' : ''}" src="${ASSETS.icon(m.sp, m?.shadow)}" alt="" onerror="this.src='${ASSETS.front(m.sp, false, m?.shadow)}';this.classList.add('fallback')">`;

export function screen(ui, cls, title) {
  const s = el('div', 'screen ' + cls);
  if (title) s.appendChild(el('div', 'scr-title', esc(title)));
  ui.root.appendChild(s);
  return s;
}

/** fermeture commune d'un écran : nettoie (minuteurs, abonnements…), rend la main au clavier, retire l'écran,
 *  joue le son et tient la promesse. Ne s'exécute qu'une fois (Échap + clic sur « Fermer » au même instant).
 *  cleanup(value) est appelé en premier, écran encore en place. */
export function closer(ui, s, getPop, resolve, sound = 'cancel', cleanup = null) {
  let done = false;
  return (value) => {
    if (done) return;
    done = true;
    cleanup?.(value);
    getPop()?.();
    s.remove();
    if (sound) ui.sound?.sfx(sound);
    resolve(value);
  };
}
