// test-hud-render.mjs — rend le HUD (objet rapide + DexNav) dans un faux DOM : aucune erreur de référence
import assert from 'node:assert/strict';
const mk = () => {
  const e = { style: { setProperty() {} }, dataset: {}, children: [], innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; }, append() {}, remove() {}, addEventListener() {},
    querySelector: () => mk(), querySelectorAll: () => [], setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }) };
  return e;
};
globalThis.window = globalThis;
globalThis.document = { createElement: mk, querySelector: () => mk(), body: mk() };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.location = new URL('http://localhost/');
const { Hud } = await import('../odyssee/js/ui/hud.js');
const st = { name: 'Red', money: 1234, badges: Array(15).fill(false), party: [], bag: { canne: 1, 'running-shoes': 1 }, dex: { seen: [16, 19], caught: [16] }, flags: { dex: true }, registeredItem: 'canne' };
const zones = { route: { key: 'r1', name: 'Route 1', isTown: false, enc: null }, ville: { key: null, name: 'Bourg-Aube', isTown: true } };
let cur = zones.route;
const game = { state: st, mapObj: { id: 'monde' }, ui: { root: mk() }, sound: { sfx() {} }, bv: {}, locationName: () => cur.name, badgeCount: () => 0, levelCap: () => 12, currentSpawns: () => cur, autoRun: false };
const hud = new Hud(game);
hud.update(true);
const html = hud.gearEl.innerHTML;
assert.ok(html.includes('hud-quick-item'), 'objet rapide affiché');
assert.ok(html.includes('1/39'), 'DexNav Route 1 : 1/39');
assert.ok(html.includes('hdn-slot caught'), 'vignette capturée');
cur = zones.ville; hud.update(true);
assert.ok(hud.gearEl.innerHTML.includes('Zone urbaine'), 'DexNav en ville');
console.log('✔ HUD : objet rapide et DexNav rendus sans erreur (route et ville)');
