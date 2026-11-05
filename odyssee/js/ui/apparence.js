// odyssee/js/ui/apparence.js — création du personnage (au début de l'aventure) et cabine d'essayage de la boutique de
// mode : genre, peau, cheveux, chapeau, haut, bas, chaussures, sac, et la couleur de chaque vêtement. Aperçu vivant
// dans les quatre directions (le sprite composé par render/tenue.js).
import { el, esc } from './ui.js';
import { TENUE, COULEURS, TENUE_DEFAUT, composer } from '../render/tenue.js';

const LIGNES = [
  ['genre', 'Genre', TENUE.genre], ['peau', 'Peau', TENUE.peau], ['cheveux', 'Cheveux', TENUE.cheveux],
  ['chapeau', 'Chapeau', TENUE.chapeau], ['chapeauC', '· couleur', COULEURS, (T) => T.chapeau !== 'aucun'],
  ['haut', 'Haut', TENUE.haut], ['hautC', '· couleur', COULEURS],
  ['bas', 'Bas', TENUE.bas], ['basC', '· couleur', COULEURS],
  ['chaussures', 'Chaussures', TENUE.chaussures], ['chaussuresC', '· couleur', COULEURS],
  ['sac', 'Sac', TENUE.sac], ['sacC', '· couleur', COULEURS, (T) => T.sac !== 'aucun'],
];

/**
 * écran d'apparence ; renvoie la tenue choisie (ou null si on annule dans une boutique)
 * o.premiere : création au début du jeu (pas d'annulation) ; o.base(genre) → { src, sx, sy } du modèle de base
 */
export function apparenceScreen(ui, o = {}) {
  return new Promise((resolve) => {
    const T = { ...TENUE_DEFAUT, ...(o.tenue || {}) };
    const s = el('div', 'screen appar-scr');
    s.innerHTML = `<div class="scr-title">${o.premiere ? 'TON APPARENCE DE DRESSEUR' : 'CABINE D\'ESSAYAGE'}</div>
      <div class="appar"><div class="appar-prev"></div><div class="appar-opts box"></div></div>
      <div class="appar-aide">Haut / bas : choisir · Gauche / droite : changer · Entrée : valider${o.premiere ? '' : ' · Échap : annuler'}</div>`;
    ui.root.appendChild(s);
    const prev = s.querySelector('.appar-prev'), opts = s.querySelector('.appar-opts');
    let i = 0, t = 0;
    // à la création, le genre vient d'être choisi sur l'écran précédent : pas besoin de le redemander
    const rows = () => LIGNES.filter((l) => (!l[3] || l[3](T)) && !(o.premiere && l[0] === 'genre'));
    const valeur = (l) => { const L = l[2], k = L.findIndex(([v]) => v === T[l[0]]); return [Math.max(0, k), L]; };
    let sheet = null;
    const recompose = () => { const b = o.base?.(T.genre); sheet = b ? composer(b.src, b.sx, b.sy, T) : null; };
    const draw = () => {
      const R = rows(); i = Math.min(i, R.length);
      opts.innerHTML = R.map((l, k) => { const [n, L] = valeur(l); const isCol = L === COULEURS || l[0] === 'peau' || l[0] === 'cheveux';
        return `<div class="list-row ${k === i ? 'on' : ''}"><span class="cur">▶</span><span class="lbl">${esc(l[1])}</span><span class="rgt">◀ ${isCol ? `<i class="pastille" style="background:${L[n][0]}"></i>` : ''}${esc(L[n][1])} ▶</span></div>`; }).join('')
        + `<div class="list-row ${i === R.length ? 'on' : ''}"><span class="cur">▶</span><span class="lbl"><b>${o.premiere ? 'C\'est moi !' : 'Valider'}</b></span></div>`;
      if (sheet) {
        prev.innerHTML = '';
        for (const d of [0, 1, 3, 2]) { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(sheet, (d * 3 + (t % 2 ? 0 : 1)) * 64, 0, 64, 64, 0, 0, 64, 64); prev.appendChild(c); }
      }
    };
    recompose(); draw();
    // au doigt ou à la souris : toucher une ligne la choisit, toucher ◀ ou ▶ change la valeur
    opts.addEventListener('click', (e) => {
      const row = e.target.closest('.list-row'); if (!row) return;
      const k = [...opts.children].indexOf(row), R = rows();
      if (k === R.length) { ui.sound.sfx('select'); close(T); return; }
      i = k; const r = row.querySelector('.rgt').getBoundingClientRect();
      if (e.clientX >= r.left) { const l = R[i], [n, L] = valeur(l), d = e.clientX < r.left + r.width / 2 ? -1 : 1; T[l[0]] = L[(n + d + L.length) % L.length][0]; recompose(); }
      ui.sound.sfx('blip'); draw();
    });
    const anim = setInterval(() => { t++; draw(); }, 420);
    const close = (v) => { clearInterval(anim); pop(); s.remove(); resolve(v); };
    const pop = ui.input.push((k) => {
      const R = rows();
      if (k === 'up') i = (i + R.length) % (R.length + 1);
      else if (k === 'down') i = (i + 1) % (R.length + 1);
      else if ((k === 'left' || k === 'right') && i < R.length) {
        const l = R[i], [n, L] = valeur(l), d = k === 'left' ? -1 : 1;
        T[l[0]] = L[(n + d + L.length) % L.length][0]; recompose();
      } else if (k === 'a') { ui.sound.sfx('select'); close(T); return; }   // Entrée valide depuis n'importe quelle ligne
      else if (k === 'b' && !o.premiere) { ui.sound.sfx('cancel'); close(null); return; }
      else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}
