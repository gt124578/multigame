// odyssee/js/input.js — clavier : flèches ou ZQSD (WASD en QWERTY), F (ou Espace / Entrée) = interagir / valider,
// Échap / Retour arrière = annuler, menu ; Maj = courir ; R = course continue ; C = carte ; V = vélo ; U = afficher / replier le HUD ; H = aide des touches
const MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyF: 'a', Space: 'a', Enter: 'a', NumpadEnter: 'a', KeyE: 'a', KeyK: 'a',
  Escape: 'b', Backspace: 'b', KeyX: 'b', KeyL: 'b',
  ShiftLeft: 'run', ShiftRight: 'run', KeyR: 'autorun', CapsLock: 'autorun',
  Tab: 'menu', KeyM: 'menu', KeyC: 'map', KeyV: 'velo', KeyQ: 'quests', KeyJ: 'quests', KeyT: 'trophies', KeyO: 'friends', KeyG: 'friends', KeyU: 'hud', KeyH: 'help', F1: 'help',
};
export class Input {
  constructor() {
    this.held = new Map(); this.handlers = []; this.dirOrder = []; this.tap = null;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = MAP[e.code]; if (!k) return;
      e.preventDefault();
      // l'aide des touches s'ouvre partout, par-dessus le reste
      if (k === 'help') { if (!e.repeat) this.onHelp?.(); return; }
      if (this.helpOpen) { if (k === 'b' || k === 'a') this.onHelp?.(); return; }
      if (!this.held.has(k)) {
        this.held.set(k, performance.now());
        if (['up', 'down', 'left', 'right'].includes(k)) {
          this.dirOrder = this.dirOrder.filter((d) => d !== k);
          this.dirOrder.push(k);
          // On n'enregistre un tap de déplacement que si le joueur est libre sur la carte
          if (this.free) this.tap = k;
        }
      }
      this.emit(k, e.repeat);
    });
    addEventListener('keyup', (e) => { const k = MAP[e.code]; if (!k) return; this.held.delete(k); this.dirOrder = this.dirOrder.filter((d) => d !== k); });
    addEventListener('blur', () => { this.clearDirs(); });
  }
  /** nettoie les directions mémorisées (en sortant d'un combat ou d'un menu pour éviter un pas involontaire) */
  clearDirs() {
    this.tap = null;
    this.dirOrder = [];
    this.held.delete('up');
    this.held.delete('down');
    this.held.delete('left');
    this.held.delete('right');
  }
  /** dernière direction enfoncée encore maintenue */
  dir() { return this.dirOrder.length ? this.dirOrder[this.dirOrder.length - 1] : null; }
  /** direction tapée depuis la dernière lecture (un appui très bref compte quand même) */
  takeTap() { const t = this.tap; this.tap = null; return t; }
  heldFor(k) { const t = this.held.get(k); return t ? performance.now() - t : 0; }
  isDown(k) { return this.held.has(k); }
  /** pile de récepteurs : le dernier ajouté reçoit les touches */
  push(fn) {
    this.tap = null;
    this.handlers.push(fn);
    return () => {
      const i = this.handlers.lastIndexOf(fn);
      if (i >= 0) this.handlers.splice(i, 1);
      this.tap = null;
    };
  }
  emit(k, repeat) {
    const h = this.handlers[this.handlers.length - 1];
    if (h) h(k, repeat);
    else this.onFree?.(k, repeat);
  }
  get free() { return this.handlers.length === 0; }
}
