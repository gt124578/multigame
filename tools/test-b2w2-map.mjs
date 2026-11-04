import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('Testing Odyssée B2W2 Map Screen & Cartography (v4.04)...');

// 1. Verify assets on disk
const cgearBg = 'odyssee/img/carte/c_gear_b2w2_bg.jpg';
const regionMap = 'odyssee/img/carte/odyssee_region_map_b2w2.jpg';

assert.ok(fs.existsSync(cgearBg), 'c_gear_b2w2_bg.jpg must exist on disk');
assert.ok(fs.existsSync(regionMap), 'odyssee_region_map_b2w2.jpg must exist on disk');
assert.ok(fs.statSync(cgearBg).size > 50000, 'c_gear_b2w2_bg.jpg must be a valid image asset');
assert.ok(fs.statSync(regionMap).size > 500000, 'odyssee_region_map_b2w2.jpg must be a valid high-res image');
console.log('✔ Map image assets verified on disk!');

// 2. Setup mock browser environment
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
    width: 440,
    height: 280,
    getBoundingClientRect: () => ({ width: 440, height: 280, left: 0, top: 0 }),
    getContext: () => ({
      fillRect() {}, clearRect() {}, drawImage() {}, stroke() {}, beginPath() {}, moveTo() {}, lineTo() {},
      createImageData: () => ({ data: new Uint8Array(440 * 280 * 4) }),
      putImageData() {},
      createLinearGradient() { return { addColorStop() {} }; }
    }),
    appendChild: () => {},
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
  root: { appendChild: () => {} },
  input: {
    push: (fn) => {
      currentInputHandler = fn;
      return () => { currentInputHandler = null; };
    }
  },
  sound: {
    sfx: () => {},
    cry: () => {},
    badgeChime: () => {}
  }
};

const mockGame = {
  ui: mockUi,
  state: {
    name: 'Red',
    id: 12345,
    badges: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    visited: ['bourg', 'plateau'],
    explored: [10, 11, 12, 13]
  },
  world: {
    towns: {
      bourg: { id: 'bourg', name: 'Bourg-Palette', x: 10, y: 10, w: 20, h: 20, gym: 0 },
      plateau: { id: 'plateau', name: 'Plateau Ligue', x: 50, y: 50, w: 20, h: 20 }
    },
    routes: [{ pts: [[10, 10], [50, 50]] }],
    maps: {
      monde: {
        w: 440, h: 520,
        buildings: [],
        get: () => 1,
        zoneAt: () => ({ theme: 'plains' }),
        in: () => true
      }
    }
  },
  worldPos: () => ({ x: 10, y: 10 }),
  locationName: () => 'Bourg-Palette',
  levelCap: () => 25
};

const { ASSETS } = await import('../odyssee/js/assets.js');
const { mapScreen, exploredView, fullRegionView } = await import('../odyssee/js/ui/screens.js');

assert.ok(ASSETS.carteBg.includes('c_gear_b2w2_bg.jpg'), 'ASSETS.carteBg must reference c_gear_b2w2_bg.jpg');
assert.ok(ASSETS.regionMapB2W2.includes('odyssee_region_map_b2w2.jpg'), 'ASSETS.regionMapB2W2 must reference odyssee_region_map_b2w2.jpg');
console.log('✔ ASSETS carteBg and regionMapB2W2 verified!');

// Test exploredView & fullRegionView calculations with widescreen aspect ratio
const expV = exploredView(mockGame, 16 / 10);
assert.ok(expV.w > 0 && expV.h > 0, 'exploredView must return positive dimensions');
assert.ok(Math.abs(expV.w / expV.h - 1.6) < 0.05, 'exploredView aspect ratio must adapt to 16/10');
const fullV = fullRegionView(mockGame, 16 / 10);
assert.ok(fullV.w >= 440, 'fullRegionView width must cover world map width');
assert.equal(fullV.h, 520, 'fullRegionView height must cover world map height');
assert.ok(fullV.h > 0, 'fullRegionView height must be positive');
console.log('✔ exploredView & fullRegionView widescreen 16:10 math validated!');

let closed = false;
mapScreen(mockGame).then(() => { closed = true; });

assert.ok(currentInputHandler, 'mapScreen must register an input handler');

// Test Space / Enter
currentInputHandler('a');
assert.equal(closed, false, 'Pressing Space/Enter must NOT close mapScreen');

// Test Escape
currentInputHandler('b');
await new Promise((r) => setTimeout(r, 10));
assert.equal(closed, true, 'Pressing Escape must close mapScreen');

console.log('✔ mapScreen B2W2 lifecycle & input controls validated!');
console.log('\n🎉 ALL B2W2 MAP TESTS PASSED 100%!');
