import assert from 'node:assert/strict';

console.log('Testing Odyssée PC Storage & Access System (v4.06)...');

// 1. Test Interiors PC Object Placement
const { houseInterior, labInterior, centerInterior } = await import('../odyssee/js/world/interiors.js');

// 1.1 Player bedroom houseInterior
const home = houseInterior('maison', 'Maison du Joueur', { w: 9, h: 8, bed: true, kitchen: true });
const homePC = home.objectAt(2, 2);
assert.ok(homePC, 'Player bedroom must have an object at (2, 2)');
assert.equal(homePC.type, 'pc', 'Player bedroom object at (2, 2) must be type "pc"');
console.log('✔ Player bedroom PC verified at (2, 2)!');

// 1.2 Prof. Saule Lab
const lab = labInterior('labo');
const labPC1 = lab.objectAt(5, 2);
const labPC2 = lab.objectAt(7, 2);
assert.ok(labPC1, 'Lab must have an object at (5, 2)');
assert.equal(labPC1.type, 'pc', 'Lab object at (5, 2) must be type "pc"');
assert.ok(labPC2, 'Lab must have an object at (7, 2)');
assert.equal(labPC2.type, 'pc', 'Lab object at (7, 2) must be type "pc"');
console.log('✔ Prof. Saule Lab PCs verified at (5, 2) and (7, 2)!');

// 1.3 Pokémon Center
const center = centerInterior('center_sylve', 'Centre Pokémon de Sylvebourg');
const centerPC = center.objectAt(11, 2);
assert.ok(centerPC, 'Pokemon Center must have PC at (11, 2)');
assert.equal(centerPC.type, 'pc', 'Pokemon Center object at (11, 2) must be type "pc"');
console.log('✔ Pokémon Center PC verified at (11, 2)!');

// 2. Setup mock browser environment for screens
globalThis.location = new URL('http://localhost:3000/index.html');
globalThis.window = globalThis;
globalThis.Image = class { constructor() { this.src = ''; } };

const createMockEl = (tag) => {
  const el = {
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    dataset: {},
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
    appendChild: (c) => el.children.push(c),
    append: (...cs) => el.children.push(...cs),
    insertBefore: (n) => el.children.push(n),
    remove: () => { el.isRemoved = true; },
    children: [],
    querySelector: () => createMockEl('DIV'),
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  return el;
};

globalThis.document = {
  createElement: createMockEl,
  querySelector: () => createMockEl('DIV'),
  querySelectorAll: () => []
};

let currentInputHandler = null;
const mockUi = {
  root: createMockEl('DIV'),
  input: {
    push: (fn) => {
      currentInputHandler = fn;
      return () => { currentInputHandler = null; };
    }
  },
  sound: {
    sfx: () => {},
    cry: () => {}
  },
  ask: async () => 5, // Annuler
  say: async () => {},
  list: async () => 0,
  closeDialog: () => {}
};

const mockGame = {
  ui: mockUi,
  state: {
    name: 'Red',
    id: 12345,
    badges: [true],
    party: [
      { sp: 1, lvl: 10, hp: 30, stats: [30, 15, 15, 15, 15, 15], moves: [1] }
    ],
    box: [
      { sp: 4, lvl: 5, hp: 20, stats: [20, 12, 10, 12, 10, 14], moves: [10], box: 0, slot: 0 }
    ],
    flags: { dex: true }
  },
  save: () => {}
};

// 3. Test pcScreen input handling (Space & Escape)
const { pcScreen } = await import('../odyssee/js/ui/screens.js');

let closedPC = false;
pcScreen(mockGame).then(() => { closedPC = true; });

assert.ok(currentInputHandler, 'pcScreen must register an input handler');

// Test Space / Enter on empty or cancelled menu (does not close)
await currentInputHandler('space');
assert.equal(closedPC, false, 'Pressing Space must NOT close pcScreen');

await currentInputHandler('a');
assert.equal(closedPC, false, 'Pressing "a" must NOT close pcScreen');

// Test Escape ('b') closes pcScreen cleanly
await currentInputHandler('b');
await new Promise((r) => setTimeout(r, 10));
assert.equal(closedPC, true, 'Pressing "b" (Escape) must close pcScreen');

console.log('✔ pcScreen Space/Enter and Escape controls validated!');
console.log('\n🎉 ALL PC STORAGE ACCESS TESTS PASSED 100%!');
