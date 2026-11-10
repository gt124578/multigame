/* Arcadia — jouer à la manette aux jeux qui n'ont que clavier et souris.

   Chargé par shared/bridge.js dans chaque jeu (à côté de padnav.js, qui s'occupe des menus).
   Pour chaque jeu sans manette native, un profil traduit la manette en touches du clavier
   (croix, sticks, boutons) et, pour les jeux à la souris, en un curseur qu'on déplace au stick gauche :
   A = clic gauche (maintenu : glisser), X = clic droit, gâchettes = molette (zoom).
   Il se tait quand un menu est à l'écran (padnav.js prend la main) et dans les jeux qui lisent déjà la manette.

   Boutons (disposition « standard ») : 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Vue, 9 Menu, 12-15 croix. */
(function () {
  if (window.ArcadiaPadPlay || window.parent === window) return;
  const game = (location.pathname.match(/\/([a-z0-9]+)\/(?:index\.html)?$/i) || [])[1] || '';

  const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const ZQSD = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
  // profils : stick gauche / croix → touches, boutons → touches, cursor : curseur souris
  const PROFILES = {
    golf: { ls: { left: 'ArrowLeft', right: 'ArrowRight' }, dpad: ARROWS, btn: { 0: 'Space', 9: 'Escape' } },
    pokemon: { ls: ARROWS, dpad: ARROWS, btn: { 0: 'Enter', 1: 'Escape', 9: 'Escape' } },
    // Odyssée lit la manette elle-même (odyssee/js/manette.js) : pas de profil ici
    calcul: { cursor: true, btn: { 9: 'Escape' } },
    david: { cursor: true, rs: ARROWS, btn: { 9: 'Escape' } },
    bastion: { cursor: true, rs: ZQSD, btn: { 4: 'F1', 5: 'F2', 9: 'Escape' } },
    filrouge: { cursor: true, rs: ZQSD, btn: { 4: 'KeyQ', 5: 'KeyE', 9: 'Escape' } },
    minigolf: { cursor: true, btn: { 3: 'KeyV', 9: 'Escape' } },
  };
  const P = PROFILES[game];
  if (!P) return;
  window.ArcadiaPadPlay = { game };

  const down = new Set();
  function key(code, on) {
    if (on === down.has(code)) return;
    if (on) down.add(code); else down.delete(code);
    const k = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code.replace(/Left$|Right$/, '');
    const map = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32, Escape: 27, Enter: 13, ShiftLeft: 16, Tab: 9 };
    const ev = { key: k, code, keyCode: map[code] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0), bubbles: true, cancelable: true, shiftKey: code === 'ShiftLeft' && on };
    const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body || document;
    t.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', ev));
  }
  function releaseAll() { for (const c of [...down]) key(c, false); if (mouse.held) mouseUp(0); }

  // —— curseur virtuel ——
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, held: false, target: null, shown: false };
  let dot = null;
  function showDot(on) {
    if (!dot) {
      dot = document.createElement('div');
      dot.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-3px 0 0 -3px;pointer-events:none;display:none;'
        + 'background:no-repeat center/contain url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M3 2l15 9-7 1.5L8 20z" fill="#ffcb05" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>') + '")';
      document.documentElement.appendChild(dot);
    }
    mouse.shown = on;
    dot.style.display = on ? 'block' : 'none';
  }
  function at() { return document.elementFromPoint(mouse.x, mouse.y) || document.body; }
  function fire(t, type, button, extra = {}) {
    const o = { bubbles: true, cancelable: true, composed: true, clientX: mouse.x, clientY: mouse.y, screenX: mouse.x, screenY: mouse.y, button, buttons: mouse.held ? 1 : button === 2 && type.endsWith('down') ? 2 : 0, ...extra };
    if (type.startsWith('pointer')) t.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, ...o }));
    else if (type === 'wheel') t.dispatchEvent(new WheelEvent(type, o));
    else t.dispatchEvent(new MouseEvent(type, o));
  }
  function mouseDown(button) {
    const t = at(); mouse.target = t;
    if (button === 0) mouse.held = true;
    fire(t, 'pointerdown', button); fire(t, 'mousedown', button);
    if (button === 0 && t.focus) try { t.focus({ preventScroll: true }); } catch (e) {}
  }
  function mouseUp(button) {
    const t = button === 0 && mouse.target && document.contains(mouse.target) ? (document.pointerLockElement || at()) : at();
    if (button === 0) mouse.held = false;
    fire(t, 'pointerup', button); fire(t, 'mouseup', button);
    if (button === 0 && (t === mouse.target || t.contains(mouse.target) || (mouse.target && mouse.target.contains(t)))) fire(t, 'click', 0);
    if (button === 2) fire(t, 'contextmenu', 2);
  }
  function mouseMove(dx, dy) {
    mouse.x = Math.max(0, Math.min(innerWidth - 1, mouse.x + dx));
    mouse.y = Math.max(0, Math.min(innerHeight - 1, mouse.y + dy));
    if (dot) { dot.style.left = mouse.x + 'px'; dot.style.top = mouse.y + 'px'; }
    const t = mouse.held && mouse.target && document.contains(mouse.target) && !document.pointerLockElement ? at() : at();
    fire(t, 'pointermove', 0, { movementX: dx, movementY: dy });
    fire(t, 'mousemove', 0, { movementX: dx, movementY: dy });
  }

  // —— lecture de la manette ——
  const DEAD = 0.35;
  let prev = {}, last = 0;
  function stickKeys(map, x, y) {
    if (!map) return;
    if (map.left) key(map.left, x < -DEAD);
    if (map.right) key(map.right, x > DEAD);
    if (map.up) key(map.up, y < -DEAD);
    if (map.down) key(map.down, y > DEAD);
  }
  function poll(now) {
    requestAnimationFrame(poll);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) { if (down.size || mouse.held) releaseAll(); if (mouse.shown) showDot(false); prev = {}; return; }
    // un menu à l'écran : c'est padnav qui joue
    const menu = window.ArcadiaPad && window.ArcadiaPad.active && window.ArcadiaPad.active();
    let hub = false; try { hub = !!window.parent.document.querySelector('.amenu, .gload.on'); } catch (e) {}
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    if (menu || hub) { releaseAll(); prev = {}; for (let i = 0; i < gp.buttons.length; i++) prev[i] = b(i); return; }
    const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.15 ? 0 : v; };
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    if (P.cursor) {
      if (!mouse.shown && (lx || ly || b(0))) showDot(true);
      const sp = 1100 * dt * (b(10) ? 0.35 : 1); // stick enfoncé : curseur lent et précis
      if (lx || ly) mouseMove(Math.sign(lx) * lx * lx * sp, Math.sign(ly) * ly * ly * sp);
      if (b(0) !== !!prev[0]) (b(0) ? mouseDown(0) : mouseUp(0));
      if (b(2) && !prev[2]) { mouseDown(2); mouseUp(2); }
      if (b(6) || b(7)) { const t = at(); fire(t, 'wheel', 0, { deltaY: (b(7) ? -1 : 1) * 600 * dt, deltaMode: 0 }); }
      // croix : comme le stick des menus, si le jeu en a un ; sinon les flèches
      stickKeys(ARROWS, (b(15) ? 1 : 0) - (b(14) ? 1 : 0), (b(13) ? 1 : 0) - (b(12) ? 1 : 0));
    } else {
      stickKeys(P.ls, lx, ly);
      const d = P.dpad;
      if (d) for (const [i, dir] of [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']]) {
        // la croix et le stick partagent les mêmes touches : on ne relâche pas ce que le stick tient
        const stick = dir === 'up' ? ly < -DEAD : dir === 'down' ? ly > DEAD : dir === 'left' ? lx < -DEAD : lx > DEAD;
        if (d[dir]) key(d[dir], b(i) || (P.ls && P.ls[dir] === d[dir] && stick));
      }
    }
    stickKeys(P.rs, rx, ry);
    // boutons → touches (deux boutons peuvent viser la même touche)
    const want = {};
    for (const [i, code] of Object.entries(P.btn || {})) want[code] = want[code] || b(+i);
    for (const [code, on] of Object.entries(want)) {
      const fromStick = (P.ls && Object.values(P.ls).includes(code)) || (P.dpad && Object.values(P.dpad).includes(code));
      if (on) key(code, true); else if (!fromStick || !down.has(code) || !stickHolds(code, lx, ly, b)) key(code, false);
    }
    prev = {}; for (let i = 0; i < gp.buttons.length; i++) prev[i] = b(i);
  }
  function stickHolds(code, lx, ly, b) {
    const m = { ArrowUp: ly < -DEAD || b(12), ArrowDown: ly > DEAD || b(13), ArrowLeft: lx < -DEAD || b(14), ArrowRight: lx > DEAD || b(15) };
    return !!m[code];
  }
  addEventListener('blur', releaseAll);
  addEventListener('mousemove', (e) => { if (e.isTrusted && mouse.shown) showDot(false); }, { passive: true });
  requestAnimationFrame(poll);
})();
