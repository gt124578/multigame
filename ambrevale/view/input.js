// Clavier : flèches ou ZQSD (et WASD), Espace / Entrée / E pour valider, Échap / Retour / X pour annuler,
// Tab ou C pour le menu, Maj pour courir.
const MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyZ: 'up', KeyW: 'up', KeyS: 'down', KeyQ: 'left', KeyA: 'left', KeyD: 'right',
  Space: 'a', Enter: 'a', NumpadEnter: 'a', KeyE: 'a', KeyK: 'a',
  Escape: 'b', Backspace: 'b', KeyX: 'b', KeyL: 'b',
  Tab: 'menu', KeyC: 'menu',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyM: 'mute',
};

export function createInput() {
  const held = new Set(), queue = [];
  const I = {
    held, mouseHandler: null,
    isHeld: (k) => held.has(k),
    /** dernière direction appuyée encore tenue (pour le déplacement) */
    dir() { for (let i = I.order.length - 1; i >= 0; i--) if (held.has(I.order[i])) return I.order[i]; return null; },
    order: [],
    take() { return queue.shift(); },
    clear() { queue.length = 0; },
    push(k) { queue.push(k); },
  };
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = MAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { I.order = I.order.filter((x) => x !== k); I.order.push(k); }
    if (!held.has(k) || ['up', 'down', 'left', 'right'].includes(k)) queue.push(k);
    held.add(k);
    if (window.__audioUnlock) window.__audioUnlock();
  });
  addEventListener('keyup', (e) => { const k = MAP[e.code]; if (k) { held.delete(k); I.order = I.order.filter((x) => x !== k); } });
  addEventListener('blur', () => { held.clear(); I.order = []; });
  return I;
}
