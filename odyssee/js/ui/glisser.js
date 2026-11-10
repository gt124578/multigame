// odyssee/js/ui/glisser.js — glisser un élément sur un autre (souris, pavé tactile ou doigt) pour échanger leurs places.
// L'élément saisi suit le pointeur ; celui qu'il survole s'entoure de pointillés ; au lâcher, echange(de, vers).
// Un simple clic (moins de 6 pixels de déplacement) reste un clic ordinaire.

/**
 * @param root    conteneur qui reste en place (les éléments peuvent être redessinés entre deux glissements)
 * @param o.item  sélecteur des éléments déplaçables, qui portent data-idx
 * @param o.actif () => booléen : le glissement est-il permis maintenant ?
 * @param o.echange (de, vers) => void
 * @param o.debut / o.fin  appelés quand un glissement commence / se termine (pour suspendre les redessins)
 */
export function glisserPourRanger(root, o) {
  const item = o.item || '[data-idx]';
  let d = null;
  const cible = (x, y) => {
    const e = document.elementFromPoint(x, y)?.closest(item);
    return e && root.contains(e) && e !== d.el && e.dataset.idx != null && !e.classList.contains('empty') ? e : null;
  };
  const bouge = (e) => {
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.hypot(dx, dy) < 6) return;
      d.on = true; o.debut?.();
      // l'élément peut être agrandi ou réduit par un parent (HUD) : le déplacement se compte dans son repère
      const r = d.el.getBoundingClientRect();
      d.k = d.el.offsetWidth ? r.width / d.el.offsetWidth : 1;
      d.el.classList.add('glisse-src');
      // l'élément et ses parents (jusqu'au conteneur) passent au premier plan, sinon une colonne voisine le cache
      d.leves = [];
      for (let n = d.el; n && n !== root.parentElement; n = n.parentElement) {
        d.leves.push([n, n.style.position, n.style.zIndex]);
        if (getComputedStyle(n).position === 'static') n.style.position = 'relative';
        n.style.zIndex = n === d.el ? '60' : '59';
      }
      d.el.style.pointerEvents = 'none'; d.el.style.transition = 'none';
      d.el.style.opacity = '.85';
    }
    e.preventDefault();
    d.el.style.translate = `${dx / d.k}px ${dy / d.k}px`;
    const c = cible(e.clientX, e.clientY);
    if (c !== d.c) { d.c?.classList.remove('glisse-cible'); d.c = c; c?.classList.add('glisse-cible'); }
  };
  const lache = (e) => {
    if (!d || e.pointerId !== d.id) return;
    const f = d; d = null;
    removeEventListener('pointermove', bouge); removeEventListener('pointerup', lache); removeEventListener('pointercancel', lache);
    if (!f.on) return;
    // le clic qui suit le lâcher ne doit pas ouvrir le résumé
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    addEventListener('click', stop, true); setTimeout(() => removeEventListener('click', stop, true), 0);
    f.c?.classList.remove('glisse-cible');
    for (const k of ['translate', 'pointerEvents', 'transition', 'opacity']) f.el.style[k] = '';
    for (const [n, pos, z] of f.leves || []) { n.style.position = pos; n.style.zIndex = z; }
    f.el.classList.remove('glisse-src');
    const de = +f.el.dataset.idx, vers = f.c ? +f.c.dataset.idx : -1;
    o.fin?.();
    if (e.type === 'pointerup' && vers >= 0 && vers !== de) o.echange(de, vers);
  };
  root.addEventListener('pointerdown', (e) => {
    if (d || (e.pointerType === 'mouse' && e.button !== 0) || !o.actif()) return;
    const el = e.target.closest(item);
    if (!el || !root.contains(el) || el.dataset.idx == null || el.classList.contains('empty') || e.target.closest('button')) return;
    d = { el, id: e.pointerId, x: e.clientX, y: e.clientY, on: false, c: null, k: 1 };
    addEventListener('pointermove', bouge, { passive: false }); addEventListener('pointerup', lache); addEventListener('pointercancel', lache);
  });
}
