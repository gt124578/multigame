// odyssee/js/input.js — clavier : flèches ou ZQSD (WASD en QWERTY), F (ou Espace / Entrée) = interagir / valider,
// Échap / Retour arrière = annuler, menu ; Maj = courir ; C = carte ; H = aide des touches
const MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyF: 'a', Space: 'a', Enter: 'a', NumpadEnter: 'a', KeyE: 'a', KeyK: 'a',
  Escape: 'b', Backspace: 'b', KeyX: 'b', KeyL: 'b',
  ShiftLeft: 'run', ShiftRight: 'run',
  Tab: 'menu', KeyM: 'menu', KeyC: 'map', KeyH: 'help', F1: 'help',
};
export class Input {
  constructor() {
    this.held = new Map(); this.handlers = []; this.dirOrder = [];
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = MAP[e.code]; if (!k) return;
      e.preventDefault();
      // l'aide des touches s'ouvre partout, par-dessus le reste
      if (k === 'help') { if (!e.repeat) this.onHelp?.(); return; }
      if (this.helpOpen) { if (k === 'b' || k === 'a') this.onHelp?.(); return; }
      if (!this.held.has(k)) {
        this.held.set(k, performance.now());
        if (['up', 'down', 'left', 'right'].includes(k)) { this.dirOrder = this.dirOrder.filter((d) => d !== k); this.dirOrder.push(k); this.tap = k; }
      }
      this.emit(k, e.repeat);
    });
    addEventListener('keyup', (e) => { const k = MAP[e.code]; if (!k) return; this.held.delete(k); this.dirOrder = this.dirOrder.filter((d) => d !== k); });
    addEventListener('blur', () => { this.held.clear(); this.dirOrder = []; });
  }
  /** dernière direction enfoncée encore maintenue */
  dir() { return this.dirOrder.length ? this.dirOrder[this.dirOrder.length - 1] : null; }
  /** direction tapée depuis la dernière lecture (un appui très bref compte quand même) */
  takeTap() { const t = this.tap; this.tap = null; return t; }
  heldFor(k) { const t = this.held.get(k); return t ? performance.now() - t : 0; }
  isDown(k) { return this.held.has(k); }
  /** pile de récepteurs : le dernier ajouté reçoit les touches */
  push(fn) { this.handlers.push(fn); return () => { const i = this.handlers.lastIndexOf(fn); if (i >= 0) this.handlers.splice(i, 1); }; }
  emit(k, repeat) {
    const h = this.handlers[this.handlers.length - 1];
    if (h) h(k, repeat);
    else this.onFree?.(k, repeat);
  }
  get free() { return this.handlers.length === 0; }
}
