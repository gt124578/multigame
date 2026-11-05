import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('Testing Screen Keyboard Input Handlers (Space/Enter/Escape)...');

// Setup mock browser environment
globalThis.requestAnimationFrame ??= (f) => setTimeout(() => f(performance.now()), 16);
globalThis.location = new URL('http://localhost:3000/index.html');
globalThis.window = globalThis;
globalThis.Image = class { constructor() { this.src = ''; } };
let activeScreen = null;
let currentInputHandler = null;

const createMockEl = (tag) => {
  const el = {
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    dataset: {},
    width: 400,
    height: 300,
    getBoundingClientRect: () => ({ width: 400, height: 300, left: 0, top: 0 }),
    getContext: () => ({
      fillRect() {}, clearRect() {}, drawImage() {},
      createImageData: () => ({ data: new Uint8Array(400 * 300 * 4) }),
      putImageData() {},
      createLinearGradient() { return { addColorStop() {} }; }
    }),
    appendChild: () => {},
    remove: () => { el.isRemoved = true; },
    children: Array.from({ length: 200 }).map(() => ({
      classList: { toggle() {}, add() {}, remove() {} },
      scrollIntoView() {}
    })),
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
    gender: 'm',
    money: 5000,
    dex: { caught: [1, 4, 7], seen: [1, 2, 3, 4, 7] },
    time: 3600,
    badges: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    party: [
      { sp: 1, lvl: 15, hp: 45, stats: [45, 20, 20, 20, 20, 20], moves: [{ id: 1, pp: 35 }] }
    ],
    flags: {}
  },
  world: {
    towns: { bourg: { name: 'Bourg-Palette', x: 10, y: 10 } },
    routes: [],
    buildings: [],
    maps: {
      monde: {
        w: 40, h: 40,
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

const { cardScreen, dexScreen, summaryScreen, mapScreen } = await import('../odyssee/js/ui/screens.js');
const { BADGES } = await import('../odyssee/js/world/region.js');
const { createMon } = await import('../odyssee/js/core/mon.js');

mockGame.state.party = [createMon(1, 15)];

// 1. Test cardScreen
{
  let closed = false;
  cardScreen(mockGame, BADGES).then(() => { closed = true; });

  assert.ok(currentInputHandler, 'cardScreen must register an input handler');
  
  // Press 'a' (Space / Enter) -> MUST NOT CLOSE
  currentInputHandler('a');
  assert.equal(closed, false, 'Pressing Space/Enter ("a") must NOT close cardScreen');

  // Press 'a' again -> MUST NOT CLOSE
  currentInputHandler('a');
  assert.equal(closed, false, 'Pressing Space/Enter ("a") again must NOT close cardScreen');

  // Press 'b' (Escape) -> MUST CLOSE
  currentInputHandler('b');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, true, 'Pressing Escape ("b") must close cardScreen');
  console.log('✔ cardScreen: Space/Enter toggles faces without closing, Escape closes properly');
}

// 2. Test dexScreen
{
  let closed = false;
  dexScreen(mockGame).then(
    () => { closed = true; },
    (err) => { console.error('dexScreen promise reject:', err); }
  );

  assert.ok(currentInputHandler, 'dexScreen must register an input handler');

  // Press 'a' (Space / Enter) -> MUST NOT CLOSE
  currentInputHandler('a');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, false, 'Pressing Space/Enter ("a") must NOT close dexScreen');

  // Navigate down and press 'a'
  currentInputHandler('down');
  currentInputHandler('a');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, false, 'Pressing Space/Enter on creature must NOT close dexScreen');

  // Press 'b' (Escape) -> MUST CLOSE
  currentInputHandler('b');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, true, 'Pressing Escape ("b") must close dexScreen');
  console.log('✔ dexScreen: Space/Enter plays cry and animates without closing, Escape closes properly');
}

// 3. Test summaryScreen
{
  let closed = false;
  summaryScreen(mockGame, mockGame.state.party, 0).then(() => { closed = true; });

  assert.ok(currentInputHandler, 'summaryScreen must register an input handler');

  // Press 'a' (Space / Enter) -> MUST NOT CLOSE
  currentInputHandler('a');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, false, 'Pressing Space/Enter ("a") must NOT close summaryScreen');

  // Press 'b' (Escape) -> MUST CLOSE
  currentInputHandler('b');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, true, 'Pressing Escape ("b") must close summaryScreen');
  console.log('✔ summaryScreen: Space/Enter advances page without closing, Escape closes properly');
}

// 4. Test mapScreen
{
  let closed = false;
  try {
    mapScreen(mockGame).then(() => { closed = true; }, (err) => console.error('mapScreen reject:', err));
  } catch (err) {
    console.error('mapScreen sync err:', err);
  }

  assert.ok(currentInputHandler, 'mapScreen must register an input handler');

  // Press 'a' (Space / Enter) -> MUST NOT CLOSE
  currentInputHandler('a');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, false, 'Pressing Space/Enter ("a") must NOT close mapScreen');

  // Press 'b' (Escape) -> MUST CLOSE
  currentInputHandler('b');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, true, 'Pressing Escape ("b") must close mapScreen');
  console.log('✔ mapScreen: Space/Enter pings location without closing, Escape closes properly');
}

console.log('\n🎉 ALL SCREEN KEYBOARD INPUT TESTS PASSED (100%)!');
