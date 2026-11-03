// Commandes de Dogfight 3D : souris (l'instructeur suit le point visé), clavier (commandes directes), manette, tactile.
// Le clavier et la souris marchent ensemble : tant qu'on appuie, on pilote soi-même ; en lâchant, l'avion garde son cap et remet les ailes à plat.
// La souris est capturée en vol. Si le navigateur refuse, elle devient un manche : l'écart du curseur au centre de l'écran fait tourner le point visé.
import { ZONE_MAX, zoneDist, CEILING, KEY_ATTACK, keyRamp, keyCurve } from '../engine/flight.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const AIM_LAG = 0.07;      // lissage du point visé : efface les à-coups d'un trackpad (s)
const MAX_DELTA = 220;     // un écart plus grand en un seul événement est un raté du verrou de souris (px)
const STICK_DEAD = 0.06;   // zone morte du manche souris, en part du demi-écran
const STICK_LEAD = Math.cos(0.7);   // le manche souris ne fait pas devancer le nez de plus de 40° environ
const stickCurve = (v) => { const a = Math.abs(v); return a < STICK_DEAD ? 0 : Math.sign(v) * ((a - STICK_DEAD) / (1 - STICK_DEAD)) ** 1.5; };
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'ShiftLeft', 'ShiftRight']);

export class FlightControls {
  constructor({ surface, onFirstGesture = null, touchBox = null } = {}) {
    this.surface = surface;
    this.keys = new Set();
    this.firing = false;
    this.mslPulse = false; this.flarePulse = false; this.abPulse = false;
    this.yaw = 0; this.pitch = 0; this.sYaw = 0; this.sPitch = 0; this.mouseUsed = 0; this.dirty = false;
    this.stickP = 0; this.stickR = 0; this.stickY = 0;
    this.sens = 1; this.invert = false; this.assist = true;
    this.enabled = false;
    this.locked = false; this.everLocked = false; this.free = false; this.mx = 0; this.my = 0; this.padActive = false;
    this.onFirstGesture = onFirstGesture; this.gesture = false;
    this.stick = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
    this.btn = { fire: false, boost: false, brake: false };
    this.padPrev = {};
    this.touch = false;
    this.off = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); this.off.push(() => el.removeEventListener(ev, fn, opt)); };

    on(window, 'keydown', (e) => {
      this.triggerGesture();
      if (!this.enabled && e.code !== 'Tab') return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.mslPulse = true;
      if (e.code === 'KeyF') this.flarePulse = true;
      if (e.code === 'KeyR') this.abPulse = true;
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.release());
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === surface;
      if (this.locked) { this.everLocked = true; this.free = false; this.mx = this.my = 0; } else this.firing = false;
      this.cursor();
    });
    on(document, 'pointerlockerror', () => this.refused());
    on(window, 'mousemove', (e) => {
      if (!this.enabled) return;
      if (this.free && !this.locked) {
        const r = surface.getBoundingClientRect(), h = Math.min(r.width, r.height) / 2 || 1;
        this.mx = clamp((e.clientX - r.left - r.width / 2) / h, -1, 1); this.my = clamp((e.clientY - r.top - r.height / 2) / h, -1, 1);
        return;
      }
      const k = 0.0019 * this.sens, dx = clamp(e.movementX || 0, -MAX_DELTA, MAX_DELTA), dy = clamp(e.movementY || 0, -MAX_DELTA, MAX_DELTA);
      if (!dx && !dy) return;
      this.yaw -= dx * k;
      this.pitch = clamp(this.pitch - dy * k * (this.invert ? -1 : 1), -1.45, 1.45);
      this.mouseUsed = 1; this.dirty = true;
    });
    on(surface, 'mousedown', (e) => {
      this.triggerGesture();
      if (!this.enabled) return;
      // le clic qui reprend la souris ne tire pas
      if (!this.locked && !this.touch) { this.lock(); if (!this.free) return; }
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.mslPulse = true;
    });
    on(window, 'mouseup', (e) => { if (e.button === 0) this.firing = false; });
    on(surface, 'contextmenu', (e) => e.preventDefault());

    // manche tactile : moitié gauche de l'écran
    on(surface, 'touchstart', (e) => {
      this.triggerGesture(); this.setTouch();
      for (const t of e.changedTouches) if (this.stick.id === null && t.clientX < innerWidth * 0.55) { this.stick.id = t.identifier; this.stick.x0 = t.clientX; this.stick.y0 = t.clientY; this.stick.dx = 0; this.stick.dy = 0; }
      e.preventDefault();
    }, { passive: false });
    on(window, 'touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === this.stick.id) { this.stick.dx = clamp((t.clientX - this.stick.x0) / 70, -1, 1); this.stick.dy = clamp((t.clientY - this.stick.y0) / 70, -1, 1); } }, { passive: true });
    const endTouch = (e) => { for (const t of e.changedTouches) if (t.identifier === this.stick.id) { this.stick.id = null; this.stick.dx = 0; this.stick.dy = 0; } };
    on(window, 'touchend', endTouch); on(window, 'touchcancel', endTouch);
    if (touchBox) for (const b of touchBox.querySelectorAll('button[data-a]')) {
      const a = b.dataset.a;
      on(b, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.setTouch(); if (a === 'msl') this.mslPulse = true; else if (a === 'flare') this.flarePulse = true; else if (a === 'ab') this.abPulse = true; else this.btn[a] = true; b.classList.add('on'); });
      const up = () => { if (this.btn[a] !== undefined) this.btn[a] = false; b.classList.remove('on'); };
      on(b, 'pointerup', up); on(b, 'pointerleave', up); on(b, 'pointercancel', up);
    }
  }

  setTouch() { if (!this.touch) { this.touch = true; document.body.classList.add('touch'); } }
  triggerGesture() { if (!this.gesture) { this.gesture = true; if (this.onFirstGesture) this.onFirstGesture(); } }
  lock() {
    if (this.touch || this.locked) return;
    try { const r = this.surface.requestPointerLock(); if (r && r.catch) r.catch(() => this.refused()); } catch (e) { this.refused(); }
  }
  // capture refusée (navigateur intégré, iframe sans droit…) : manche souris, tant qu'aucune capture n'a marché
  refused() { if (this.everLocked || this.free) return; this.free = true; this.mx = this.my = 0; this.cursor(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  // en manche souris, le curseur laisse place au repère du HUD
  cursor() { this.surface.style.cursor = this.enabled && this.free && !this.locked ? 'none' : ''; }
  release() { this.stickP = this.stickR = this.stickY = 0; this.keys.clear(); this.firing = false; this.btn.fire = this.btn.boost = this.btn.brake = false; this.stick.id = null; this.stick.dx = this.stick.dy = 0; this.mx = this.my = 0; }
  setEnabled(v) { if (this.enabled === v) return; this.enabled = v; this.release(); this.dirty = false; if (!v) this.unlock(); this.cursor(); }
  get scoreboard() { return this.keys.has('Tab'); }
  // pour le HUD : le repère du manche souris, ou le rappel de cliquer quand la souris n'est plus capturée
  get mouseStick() { return this.enabled && this.free && !this.locked && !this.touch ? { x: this.mx, y: this.my, dead: STICK_DEAD } : null; }
  get mouseHint() { return this.enabled && !this.locked && !this.free && !this.touch && !this.padActive ? 'Clique pour reprendre la main à la souris' : ''; }

  aimFrom(fx, fy, fz) { this.yaw = this.sYaw = Math.atan2(fx, fz); this.pitch = this.sPitch = Math.asin(clamp(fy, -1, 1)); this.dirty = false; }
  aim() { const c = Math.cos(this.sPitch); return { x: c * Math.sin(this.sYaw), y: Math.sin(this.sPitch), z: c * Math.cos(this.sYaw) }; }

  pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [], gp = [...pads].find((p) => p && p.connected);
    this.padActive = !!gp;
    if (!gp) return null;
    const dz = (v) => (Math.abs(v) > 0.15 ? v : 0), b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.3)), edge = (i) => { const on = b(i), was = this.padPrev[i]; this.padPrev[i] = on; return on && !was; };
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (rx || ry) { this.yaw -= rx * 1.6 * this.sens * dt; this.pitch = clamp(this.pitch - ry * 1.3 * this.sens * dt * (this.invert ? -1 : 1), -1.45, 1.45); this.dirty = true; }
    if (edge(0)) this.mslPulse = true;
    if (edge(2)) this.flarePulse = true;
    if (edge(3)) this.abPulse = true;
    return { p: ly * (this.invert ? -1 : 1), r: lx, y: (b(15) ? 1 : 0) - (b(14) ? 1 : 0), boost: b(5), brake: b(6) || b(4), fire: b(7) };
  }

  // Manche souris : le point visé avance, sans trop devancer le nez
  steer(me, sx, sy, dt) {
    this.yaw -= sx * 1.8 * this.sens * dt;
    this.pitch = clamp(this.pitch - sy * 1.4 * this.sens * dt * (this.invert ? -1 : 1), -1.45, 1.45);
    this.dirty = true;
    if (!me) return;
    const c = Math.cos(this.pitch), x = c * Math.sin(this.yaw), y = Math.sin(this.pitch), z = c * Math.cos(this.yaw), d = x * me.fx + y * me.fy + z * me.fz;
    if (d >= STICK_LEAD) return;
    const px = x - me.fx * d, py = y - me.fy * d, pz = z - me.fz * d, l = Math.hypot(px, py, pz) || 1, k = Math.sqrt(1 - STICK_LEAD * STICK_LEAD) / l;
    const ax = me.fx * STICK_LEAD + px * k, ay = me.fy * STICK_LEAD + py * k, az = me.fz * STICK_LEAD + pz * k, yaw = Math.atan2(ax, az);
    // même tour que le lissage, pour qu'il ne reparte pas dans l'autre sens
    this.yaw = yaw + Math.round((this.yaw - yaw) / (2 * Math.PI)) * 2 * Math.PI;
    this.pitch = Math.asin(clamp(ay, -1, 1));
  }

  // Les commandes de cette image. me : l'avion du joueur (pour recaler le point visé)
  sample(me, dt) {
    const out = { p: 0, r: 0, y: 0, boost: false, brake: false, fire: false, msl: false, flare: false, ab: false, free: false, ax: 0, ay: 0, az: 1 };
    const k = this.keys, has = (...c) => c.some((x) => k.has(x));
    if (!this.enabled) { if (me) { const a = this.aim(); out.ax = a.x; out.ay = a.y; out.az = a.z; } return out; }
    let keyP = (has('KeyS', 'ArrowDown') ? 1 : 0) - (has('KeyZ', 'KeyW', 'ArrowUp') ? 1 : 0);
    if (this.invert) keyP = -keyP;
    const keyR = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyQ', 'KeyA', 'ArrowLeft') ? 1 : 0);
    const keyY = (k.has('KeyL') ? 1 : 0) - (k.has('KeyJ') ? 1 : 0);
    // le clavier pousse un manche virtuel : une tape corrige, un appui long tire à fond
    this.stickP = keyRamp(this.stickP, keyP, dt, KEY_ATTACK.pitch);
    this.stickR = keyRamp(this.stickR, keyR, dt, KEY_ATTACK.roll);
    this.stickY = keyRamp(this.stickY, keyY, dt, KEY_ATTACK.yaw);
    let pitch = keyCurve(this.stickP), roll = keyCurve(this.stickR), yaw = keyCurve(this.stickY);
    out.boost = has('ShiftLeft', 'ShiftRight') || this.btn.boost;
    out.brake = has('KeyC', 'KeyX') || this.btn.brake;
    out.fire = this.firing || k.has('Space') || this.btn.fire;
    out.free = k.has('KeyV') || !this.assist;
    const pad = this.pollPad(dt);
    const sx = stickCurve(this.mx), sy = stickCurve(this.my);
    if (this.free && !this.locked && (sx || sy)) this.steer(me, sx, sy, dt);
    if (pad) { if (pad.p) pitch = pad.p; if (pad.r) roll = pad.r; if (pad.y) yaw = pad.y; out.boost = out.boost || pad.boost; out.brake = out.brake || pad.brake; out.fire = out.fire || pad.fire; }
    if (this.stick.id !== null) { pitch = this.stick.dy; roll = this.stick.dx; }
    out.msl = this.mslPulse; out.flare = this.flarePulse; out.ab = this.abPulse; this.mslPulse = false; this.flarePulse = false; this.abPulse = false;
    out.p = pitch; out.r = roll; out.y = yaw;
    // appui direct, ou instructeur repris hors zone : le point visé suit le nez, pour ne pas ramener l'avion en arrière au relâchement
    if (me) {
      const direct = pitch !== 0 || roll !== 0 || yaw !== 0, forced = zoneDist(me.x, me.z) > ZONE_MAX || me.y > CEILING;
      if (direct || forced || (!this.assist && !this.dirty)) this.aimFrom(me.fx, me.fy, me.fz);
    }
    const smooth = 1 - Math.exp(-dt / AIM_LAG);
    this.sYaw += (this.yaw - this.sYaw) * smooth; this.sPitch += (this.pitch - this.sPitch) * smooth;
    const a = this.aim(); out.ax = a.x; out.ay = a.y; out.az = a.z;
    // sans aide au vol, tant que la souris ne vise rien, l'avion garde son attitude : pas de remise à plat
    if (!this.assist && !this.dirty) { out.ax = 0; out.ay = 0; out.az = 0; }
    return out;
  }

  dispose() { for (const f of this.off) f(); this.off = []; this.unlock(); }
}
