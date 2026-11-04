// Dessin d'une carte (face ou dos) en HTML.
import { RANK_LABEL, SUIT_SYMBOL, isRed } from '../engine/deck.js';

export function cardEl(code, { small = false, back = false, cls = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (small ? ' sm' : '') + (back || !code ? ' back' : '') + (cls ? ' ' + cls : '');
  if (code && !back) {
    el.dataset.card = code;
    if (isRed(code)) el.classList.add('red');
    const r = RANK_LABEL[code[0]] || code[0], s = SUIT_SYMBOL[code[1]];
    el.innerHTML = `<span class="c1">${r}<i>${s}</i></span><span class="c2">${s}</span><span class="c3">${r}<i>${s}</i></span>`;
  }
  return el;
}

export function handEl(cards, opts = {}) {
  const w = document.createElement('div');
  w.className = 'hand' + (opts.small ? ' sm' : '');
  for (const c of cards) w.appendChild(cardEl(c, opts));
  return w;
}
