// Fief Maudit : clavier (touches lues par position : ZQSD en AZERTY = WASD en QWERTY), souris capturée pour la caméra,
// molette pour le zoom, manette et tactile. Les appuis sont comptés (fc : frapper, uc : utiliser, ac : capacité du métier) pour qu'un appui bref
// ne soit jamais perdu. sample() rend la direction voulue dans le repère de la caméra ; app.js la tourne dans le monde.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const PITCH = [-0.25, 1.15];

export class Input {
  constructor(surface, hooks = {}) {
    this.surface = surface; this.h = hooks;
    this.keys = new Set(); this.off = [];
    this.c = { fc: 0, uc: 0, ac: 0 };
    this.yaw = 0; this.pitch = 0.32; this.zoom = 6.2; this.sens = 1;
    this.locked = false; this.free = false; this.touch = { move: null, look: null }; this.padPrev = []; this.btn = { jump: false, walk: false, use: false };
    const listen = (t, type, fn, o) => { t.addEventListener(type, fn, o); this.off.push(() => t.removeEventListener(type, fn, o)); };
    this.listen = listen;
    try { this.sens = clamp(+(localStorage.getItem('fief_sens') || 1), 0.3, 3); } catch (e) {}
    listen(document, 'pointerlockchange', () => { const was = this.locked; this.locked = document.pointerLockElement === surface; if (was && !this.locked) { this.release(); hooks.unlocked && hooks.unlocked(); } });
    listen(document, 'mousemove', (e) => { if (!this.locked && !this.free) return; this.look(e.movementX, e.movementY, 0.0024); });
    listen(window, 'keydown', (e) => {
      if (e.target.closest?.('input,textarea,select')) return;
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
      hooks.gesture && hooks.gesture();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'KeyE') this.c.uc++;
      else if (k === 'KeyF') this.c.ac++;
      else if (k === 'Escape' || k === 'KeyP') hooks.menu && hooks.menu();
      else if (k === 'KeyM') hooks.mute && hooks.mute();
    });
    listen(window, 'keyup', (e) => this.keys.delete(e.code));
    listen(window, 'blur', () => this.release());
    listen(document, 'contextmenu', (e) => e.preventDefault());
    listen(window, 'wheel', (e) => { if (!this.locked && !this.free) return; this.zoom = clamp(this.zoom + (e.deltaY > 0 ? 0.6 : -0.6), 3.2, 11); }, { passive: true });
    listen(surface, 'pointerdown', (e) => {
      hooks.gesture && hooks.gesture();
      if (e.pointerType === 'touch') {
        document.body.classList.add('touch'); this.free = true;
        if (e.clientX < innerWidth * 0.42 && !this.touch.move) this.touch.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
        else if (!this.touch.look) this.touch.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
        try { surface.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      if (!this.locked && !this.free) { this.lock(); return; }
      if (e.button === 0) this.c.fc++;
    });
    listen(surface, 'pointermove', (e) => {
      const m = this.touch.move, l = this.touch.look;
      if (m && m.id === e.pointerId) { m.x = e.clientX; m.y = e.clientY; }
      if (l && l.id === e.pointerId) { this.look(e.clientX - l.x, e.clientY - l.y, 0.006); l.x = e.clientX; l.y = e.clientY; }
    });
    const end = (e) => { const t = this.touch; if (t.move && t.move.id === e.pointerId) t.move = null; if (t.look && t.look.id === e.pointerId) t.look = null; };
    listen(window, 'pointerup', end); listen(window, 'pointercancel', end);
  }
  look(dx, dy, k) { this.yaw -= dx * k * this.sens; this.pitch = clamp(this.pitch + dy * k * this.sens, PITCH[0], PITCH[1]); }
  setSens(v) { this.sens = clamp(v, 0.3, 3); try { localStorage.setItem('fief_sens', String(this.sens)); } catch (e) {} }
  lock() {
    let r;
    try { r = this.surface.requestPointerLock({ unadjustedMovement: true }); } catch (e) { this.free = true; return; }
    if (r && r.catch) r.catch(() => { try { const r2 = this.surface.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => { this.free = true; }); } catch (e) { this.free = true; } });
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  release() { this.keys.clear(); this.btn.jump = this.btn.walk = this.btn.use = false; this.touch.move = null; this.touch.look = null; }
  bindTouch(box) {
    for (const b of box.querySelectorAll('button[data-a]')) {
      const a = b.dataset.a;
      this.listen(b, 'pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); document.body.classList.add('touch'); this.free = true;
        if (a === 'fire') this.c.fc++; else if (a === 'ability') this.c.ac++; else if (a === 'use') { this.c.uc++; this.btn.use = true; } else if (a === 'jump') this.btn.jump = true;
        b.classList.add('on');
      });
      const up = () => { if (a === 'jump') this.btn.jump = false; if (a === 'use') this.btn.use = false; b.classList.remove('on'); };
      this.listen(b, 'pointerup', up); this.listen(b, 'pointerleave', up); this.listen(b, 'pointercancel', up);
    }
  }
  pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [], gp = [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5)), edge = (i) => b(i) && !this.padPrev[i];
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    this.yaw -= rx * dt * 2.6 * this.sens; this.pitch = clamp(this.pitch + ry * dt * 1.6 * this.sens, PITCH[0], PITCH[1]);
    // RT : frapper · Y : capacité · A : sauter · X : utiliser · LB : marcher · Start : menu
    if (edge(7)) this.c.fc++;
    if (edge(3)) this.c.ac++;
    if (edge(2)) this.c.uc++;
    if (edge(9) && this.h.menu) this.h.menu();
    const out = { lx, ly, jump: b(0), walk: b(4), use: b(2) };
    this.padPrev = gp.buttons.map((x, i) => b(i));
    return out;
  }
  // direction voulue (x : droite, y : devant), dans le repère de la caméra
  sample(dt) {
    const K = this.keys;
    let mx = (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0);
    let my = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0);
    const pad = this.pollPad(dt);
    if (pad && (pad.lx || pad.ly)) { mx = pad.lx; my = -pad.ly; }
    const m = this.touch.move;
    if (m) { const dx = m.x - m.ox, dy = m.y - m.oy, d = Math.hypot(dx, dy); if (d > 8) { const k = Math.min(1, d / 60); mx = dx / d * k; my = -dy / d * k; } }
    return { mx, my, walk: K.has('ControlLeft') || K.has('AltLeft') || this.btn.walk || !!pad?.walk, jump: K.has('Space') || this.btn.jump || !!pad?.jump, hold: K.has('KeyE') || this.btn.use || !!pad?.use, ...this.c };
  }
  stick() { const m = this.touch.move; return m ? { ox: m.ox, oy: m.oy, x: m.x, y: m.y } : null; }
  dispose() { for (const f of this.off) f(); this.off = []; this.keys.clear(); this.unlock(); }
}
