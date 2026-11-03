/* Arcadia — naviguer dans les menus à la manette (Xbox, PlayStation, Switch… : disposition « standard »).

   Chargé par le Hub (index.html) et par chaque jeu (via shared/bridge.js).
   - Croix ou stick gauche : passer d'un bouton à l'autre (le plus proche dans la direction choisie).
   - A (croix PlayStation) : valider. B (rond) : retour (comme la touche Échap).
   - Gauche / droite sur un curseur (volume) : le régler.
   - Bouton Vue / Share / Select : ouvrir ou fermer le menu Arcadia (son, plein écran, retour au salon).

   Pour ne pas gêner la partie, il n'agit que quand un menu est affiché :
   - dans un jeu : la souris n'est pas capturée et le centre de l'écran n'est pas le dessin du jeu (une carte, un panneau…) ;
   - dans le Hub : hors partie, ou quand l'écran de chargement ou le menu Arcadia est ouvert (le jeu se tait alors). */
(function () {
  if (window.ArcadiaPad) return;
  const inFrame = window.parent !== window;
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])';
  const REPEAT_FIRST = 380, REPEAT = 140;

  // repère visuel du bouton choisi à la manette
  const css = document.createElement('style');
  css.textContent = '.pad-focus{outline:4px solid #ffcb05 !important;outline-offset:3px !important;box-shadow:0 0 0 7px rgba(255,203,5,.35) !important;border-radius:8px}';
  (document.head || document.documentElement).appendChild(css);

  let cur = null, prev = {}, held = null, heldSince = 0, lastRep = 0, usedPad = false;

  function hubDoc() { try { return inFrame ? window.parent.document : document; } catch (e) { return null; } }
  /** écran de chargement ou menu Arcadia ouverts dans le Hub ? */
  function hubOverlay() {
    const d = hubDoc();
    return !!(d && (d.querySelector('.amenu') || d.querySelector('.gload.on')));
  }
  function visible(el) {
    if (!el || el.disabled || el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.15 || st.pointerEvents === 'none') return false;
    // pas caché derrière une fenêtre par-dessus
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    return !!top && (top === el || el.contains(top) || top.contains(el));
  }
  /** zone où l'on navigue : la fenêtre par-dessus si une est ouverte, sinon toute la page */
  function scope() {
    const modal = document.querySelector('.amenu .am-panel, .gload.on .gl-card, .ntov .nt, [role=dialog]:not([hidden])');
    return modal && visible(modal.querySelector(SEL) || modal) ? modal : document;
  }
  const candidates = () => [...scope().querySelectorAll(SEL)].filter(visible);

  /** un menu est-il à l'écran (et non la partie elle-même) ? */
  function menuActive() {
    if (document.pointerLockElement) return false;
    if (!inFrame) {
      // Hub : hors partie, ou par-dessus la partie (chargement, menu Arcadia)
      const playing = document.querySelector('#play.on');
      return !playing || hubOverlay();
    }
    if (hubOverlay()) return false;   // c'est le Hub qui a la main
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    if (!hit || hit.tagName === 'CANVAS' || hit === document.body || hit === document.documentElement) {
      // centre = dessin du jeu : on ne prend la main que si une fenêtre est clairement ouverte
      return !!document.querySelector('[role=dialog]:not([hidden]), .modal.on, .overlay.on');
    }
    return candidates().length > 0;
  }

  function setFocus(el) {
    if (cur && cur !== el) cur.classList.remove('pad-focus');
    cur = el;
    if (!el) return;
    el.classList.add('pad-focus');
    try { el.focus({ preventScroll: true }); } catch (e) {}
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /** le bouton le plus proche dans une direction (dx, dy) */
  function move(dx, dy) {
    const list = candidates();
    if (!list.length) return;
    if (!cur || !list.includes(cur)) {
      // premier choix : Reprendre, C'est parti !, puis un bouton principal
      const pref = list.find((e) => e.matches('.am-resume, .gl-go')) || list.find((e) => /primary|yellow|ready|launch|start|big/i.test(e.className + ' ' + e.id)) || list[0];
      return setFocus(pref);
    }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(), bx = r.left + r.width / 2, by = r.top + r.height / 2;
      const vx = bx - ax, vy = by - ay, along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const s = along + across * 2.2;
      if (s < bs) { bs = s; best = el; }
    }
    if (best) setFocus(best);
  }
  function nudgeRange(el, dir) {
    const step = Number(el.step) || 1, span = (Number(el.max) || 100) - (Number(el.min) || 0);
    el.value = Math.max(Number(el.min) || 0, Math.min(Number(el.max) || 100, Number(el.value) + dir * Math.max(step, span / 20)));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function press() {
    if (!cur || !candidates().includes(cur)) return move(0, 1);
    if (cur.tagName === 'INPUT' && /^(text|password|search|email|number)$/i.test(cur.type)) { cur.focus(); return; }
    if (cur.tagName === 'INPUT' && cur.type === 'range') return;
    cur.click();
  }
  function back() {
    const t = document.activeElement || document.body;
    const ev = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true };
    t.dispatchEvent(new KeyboardEvent('keydown', ev));
    t.dispatchEvent(new KeyboardEvent('keyup', ev));
    const x = document.querySelector('.amenu .am-x, .ntov .ntx');
    if (x && !inFrame) x.click();
  }
  function arcadiaMenu() {
    try {
      const w = inFrame ? window.parent : window;
      if (!w.HubInGame || !w.document.querySelector('#play.on')) return;
      w.HubInGame.menu(!w.document.querySelector('.amenu'));
    } catch (e) {}
  }

  function poll(now) {
    requestAnimationFrame(poll);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) { prev = {}; return; }
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const edge = (i) => b(i) && !prev[i];
    // bouton Vue / Share / Select : menu Arcadia (traité une seule fois, par le Hub)
    if (!inFrame && edge(8)) arcadiaMenu();
    const active = menuActive();
    if (active) {
      const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
      const dir = b(12) || ly < -0.55 ? 'u' : b(13) || ly > 0.55 ? 'd' : b(14) || lx < -0.55 ? 'l' : b(15) || lx > 0.55 ? 'r' : null;
      if (dir !== held) { held = dir; heldSince = now; lastRep = 0; }
      if (dir && (lastRep === 0 || (now - heldSince > REPEAT_FIRST && now - lastRep > REPEAT))) {
        lastRep = now; usedPad = true;
        if ((dir === 'l' || dir === 'r') && cur && cur.type === 'range' && candidates().includes(cur)) nudgeRange(cur, dir === 'l' ? -1 : 1);
        else move(dir === 'l' ? -1 : dir === 'r' ? 1 : 0, dir === 'u' ? -1 : dir === 'd' ? 1 : 0);
      }
      if (edge(0)) { usedPad = true; press(); }
      if (edge(1)) { usedPad = true; back(); }
    } else if (cur) { cur.classList.remove('pad-focus'); cur = null; held = null; }
    prev = {}; for (let i = 0; i < gp.buttons.length; i++) prev[i] = b(i);
  }
  // la souris reprend la main : on retire le repère
  addEventListener('pointermove', () => { if (usedPad && cur) { cur.classList.remove('pad-focus'); cur = null; usedPad = false; } }, { passive: true });
  addEventListener('gamepadconnected', () => {}, { passive: true });
  requestAnimationFrame(poll);
  window.ArcadiaPad = { move, press, back, active: menuActive };
})();
