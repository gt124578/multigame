// Révélation de coin : les cartes du joueur restent cachées à l'écran. Un petit onglet dans le coin choisi
// (réglages) ouvre, tant qu'on le maintient ou que le pointeur reste dessus, un coup d'œil discret sur sa main,
// en petit et dans le coin, illisible pour les voisins de bureau. On peut aussi maintenir Espace.
// Depuis le coup d'œil, on peut cliquer une carte jouable (belote).
import { cardEl } from './cards.js';

export function mountPeek(root, prefs) {
  const tab = document.createElement('button');
  tab.className = 'peek-tab'; tab.type = 'button'; tab.title = 'Maintenir pour voir mes cartes (ou Espace)';
  tab.innerHTML = '<span class="eye">👁</span><span class="n"></span>';
  const panel = document.createElement('div');
  panel.className = 'peek-panel'; panel.hidden = true;
  root.appendChild(tab); root.appendChild(panel);

  let hand = [], legal = null, title = '', onPick = null, extra = null;
  let open = false, closeT = 0, autoT = 0, pointerIn = false, keyDown = false, pressed = false, enabled = true;

  function place() {
    for (const el of [tab, panel]) { el.dataset.corner = prefs.corner; el.dataset.size = prefs.size; }
    panel.classList.toggle('dim', !!prefs.dim);
  }
  place();

  function render() {
    panel.innerHTML = '';
    if (title) { const h = document.createElement('div'); h.className = 'pk-title'; h.textContent = title; panel.appendChild(h); }
    const row = document.createElement('div'); row.className = 'pk-cards';
    for (const c of hand) {
      const el = cardEl(c, { small: true });
      if (legal) { if (legal.includes(c)) { el.classList.add('playable'); el.onclick = (e) => { e.stopPropagation(); if (onPick) onPick(c); hide(true); }; } else el.classList.add('dead'); }
      row.appendChild(el);
    }
    panel.appendChild(row);
    if (extra) { const x = document.createElement('div'); x.className = 'pk-extra'; x.innerHTML = extra; panel.appendChild(x); }
    tab.querySelector('.n').textContent = hand.length ? hand.length : '';
  }

  function show() {
    if (!enabled || !hand.length) return;
    clearTimeout(closeT);
    if (!open) { open = true; panel.hidden = false; tab.classList.add('on'); }
    clearTimeout(autoT);
    if (prefs.autoHide > 0) autoT = setTimeout(() => hide(true), prefs.autoHide * 1000);
  }
  function hide(force = false) {
    clearTimeout(closeT);
    if (!force && (pointerIn || keyDown || pressed)) return;
    open = false; panel.hidden = true; tab.classList.remove('on');
    clearTimeout(autoT);
  }
  const later = () => { clearTimeout(closeT); closeT = setTimeout(() => hide(), 220); };

  tab.addEventListener('pointerdown', (e) => { e.preventDefault(); pressed = true; show(); });
  tab.addEventListener('pointerenter', () => { pointerIn = true; if (pressed || open) show(); });
  tab.addEventListener('pointerleave', () => { pointerIn = false; later(); });
  panel.addEventListener('pointerenter', () => { pointerIn = true; show(); });
  panel.addEventListener('pointerleave', () => { pointerIn = false; later(); });
  window.addEventListener('pointerup', () => { if (pressed) { pressed = false; later(); } });
  window.addEventListener('pointercancel', () => { pressed = false; later(); });
  // tactile : un appui ouvre, un second referme (le coup d'œil se referme seul après le délai des réglages)
  tab.addEventListener('click', (e) => { e.preventDefault(); if (e.pointerType === 'touch' || !e.pointerType) { if (open && !pressed) hide(true); else show(); } });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)) return;
    e.preventDefault(); keyDown = true; show();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') { keyDown = false; later(); } });
  window.addEventListener('blur', () => { keyDown = false; pressed = false; hide(true); });

  return {
    set({ hand: h, legal: l = null, title: t = '', onPick: f = null, extra: x = null }) {
      hand = h || []; legal = l; title = t; onPick = f; extra = x;
      render();
      if (!hand.length) hide(true);
    },
    enable(on) { enabled = on; tab.hidden = !on; if (!on) hide(true); },
    refresh() { place(); },
    get open() { return open; },
  };
}
