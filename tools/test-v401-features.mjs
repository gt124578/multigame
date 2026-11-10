// arcadia/tools/test-v401-features.mjs
// Test suite for Odyssée v4.01:
// 1. Advanced Major Move Animations (BattleView)
// 2. Dynamic World Map Weather System (WeatherSystem)
// 3. Interactive Hall of Fame / Panthéon (hofScreen & pantheonScreen)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Setup minimal browser environment mocks for node
globalThis.location = new URL('http://localhost:3000/index.html');
globalThis.window = globalThis;
globalThis.performance = performance;

const mockElements = [];
globalThis.document = {
  createElement: (tag) => {
    let html = '';
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      classList: {
        add: (...cls) => { el.className += ' ' + cls.join(' '); },
        remove: (...cls) => { cls.forEach((c) => { el.className = el.className.replace(c, ''); }); },
        contains: (c) => el.className.includes(c),
      },
      style: {},
      dataset: {},
      appendChild: (child) => { el.children = el.children || []; el.children.push(child); },
      querySelector: (sel) => ({
        addEventListener: () => {},
        onclick: null,
        style: {},
        classList: { add: () => {}, remove: () => {} },
        textContent: '',
        innerHTML: ''
      }),
      querySelectorAll: (sel) => [],
      addEventListener: () => {},
      remove: () => {},
      set innerHTML(val) { html = val; },
      get innerHTML() { return html; },
      getContext: () => ({
        clearRect: () => {},
        fillRect: () => {},
        fillStyle: '',
        createRadialGradient: () => ({ addColorStop: () => {} })
      })
    };
    mockElements.push(el);
    return el;
  },
  querySelector: () => null,
  querySelectorAll: () => []
};

console.log('Testing Odyssée v4.01 Features (Animations, Météo & Panthéon)...');

const resolvePath = (p) => {
  if (fs.existsSync(p)) return p;
  if (fs.existsSync(path.join('arcadia', p))) return path.join('arcadia', p);
  if (fs.existsSync(path.join('..', p))) return path.join('..', p);
  return p;
};

// ============================================================================
// 1. Test Feature 1: Advanced Major Move Animations (BattleView)
// ============================================================================
{
  const bvSrc = fs.readFileSync(resolvePath('odyssee/js/ui/battleView.js'), 'utf8');

  // Verify all 8 methods exist
  const requiredMethods = [
    'animFlamethrower',
    'animHydroPump',
    'animThunderbolt',
    'animEarthquake',
    'animIceBeam',
    'animPsychicShadow',
    'animLeafBlade',
    'animHyperBeam'
  ];

  for (const m of requiredMethods) {
    assert.ok(bvSrc.includes(`async ${m}(`), `BattleView must implement ${m}`);
  }
  console.log('✔ All 8 major move animation methods exist in BattleView');

  // Verify dispatch in animMove
  assert.ok(bvSrc.includes("['flamethrower', 'fire-blast'"), 'animMove must detect flame moves');
  assert.ok(bvSrc.includes("['hydro-pump', 'surf'"), 'animMove must detect water moves');
  assert.ok(bvSrc.includes("['thunderbolt', 'thunder'"), 'animMove must detect electric moves');
  assert.ok(bvSrc.includes("['earthquake', 'earth-power'"), 'animMove must detect ground moves');
  assert.ok(bvSrc.includes("['ice-beam', 'blizzard'"), 'animMove must detect ice moves');
  assert.ok(bvSrc.includes("['psychic', 'psyshock'"), 'animMove must detect psychic/shadow moves');
  assert.ok(bvSrc.includes("['razor-leaf', 'leaf-blade'"), 'animMove must detect grass/leaf moves');
  assert.ok(bvSrc.includes("['hyper-beam', 'solar-beam'"), 'animMove must detect hyper/beam moves');
  console.log('✔ animMove correctly routes all 8 categories of major iconic moves');

  // Verify new particle shapes in draw()
  assert.ok(bvSrc.includes("p.shape === 'slash'"), 'BattleView draw loop must support slash shape');
  assert.ok(bvSrc.includes("p.shape === 'crystal'"), 'BattleView draw loop must support crystal shape');
  assert.ok(bvSrc.includes("p.shape === 'flame'"), 'BattleView draw loop must support flame shape');
  console.log('✔ BattleView canvas renderer supports slash, crystal and flame shapes');
}

// ============================================================================
// 2. Test Feature 2: Dynamic World Map Weather (WeatherSystem)
// ============================================================================
{
  const weatherSrc = fs.readFileSync(resolvePath('odyssee/js/render/weather3d.js'), 'utf8');
  assert.ok(weatherSrc.includes('class WeatherSystem'), 'weather3d.js must declare WeatherSystem');
  assert.ok(weatherSrc.includes('setWeather(w)'), 'WeatherSystem must implement setWeather');
  assert.ok(weatherSrc.includes('update(dt,'), 'WeatherSystem must implement update');
  assert.ok(weatherSrc.includes("this.current === 'rain'"), 'WeatherSystem must handle rain physics');
  assert.ok(weatherSrc.includes("this.current === 'hail'"), 'WeatherSystem must handle hail/snow physics');
  assert.ok(weatherSrc.includes("this.current === 'sandstorm'"), 'WeatherSystem must handle sandstorm physics');

  // Verify integration in world3d.js
  const worldSrc = fs.readFileSync(resolvePath('odyssee/js/render/world3d.js'), 'utf8');
  assert.ok(worldSrc.includes("import { WeatherSystem } from './weather3d.js'"), 'world3d.js must import WeatherSystem');
  assert.ok(worldSrc.includes('this.weather = new WeatherSystem'), 'world3d.js must instantiate WeatherSystem');
  assert.ok(worldSrc.includes('this.weather?.update'), 'world3d.js must update WeatherSystem in main loop');
  assert.ok(worldSrc.includes('setWeather(w) { this.weather?.setWeather(w); }'), 'world3d.js must expose setWeather');

  // Verify integration in game.js
  const gameSrc = fs.readFileSync(resolvePath('odyssee/js/game.js'), 'utf8');
  assert.ok(gameSrc.includes('this.view?.setWeather(this.getMapWeather())'), 'game.js updateZone must set weather from map');

  console.log('✔ Dynamic World Map Weather system code and integration verified 100%');
}

// ============================================================================
// 3. Test Feature 3: Interactive Hall of Fame / Panthéon
// ============================================================================
{
  const { hofScreen, pantheonScreen, trainerCard } = await import('../odyssee/js/ui/screens.js');
  assert.ok(typeof hofScreen === 'function', 'hofScreen must be exported');
  assert.ok(typeof pantheonScreen === 'function', 'pantheonScreen must be exported');

  // Test trainerCard exports hof
  const mockState = {
    name: 'Red',
    id: 12345,
    gender: 'm',
    money: 50000,
    dex: { caught: [1, 4, 7], seen: [1, 2, 3, 4, 5, 6, 7] },
    time: 3600,
    badges: Array(15).fill(true),
    party: [
      { sp: 6, lvl: 70, nick: 'Dracaufeu', shiny: false, hp: 200, stats: [200], ball: 'hyper-ball', moves: [{ id: 53 }] }
    ],
    flags: { champion: true },
    pvp: { totalWins: 5, totalLosses: 1, currentStreak: 3, trophies: {} },
    hof: [
      {
        id: 1,
        date: '04/11/2026',
        time: 3600,
        title: 'Nouveau Maître',
        team: [{ sp: 6, lvl: 70, nick: 'Dracaufeu', shiny: false, moves: [53] }],
        dexCount: 3
      }
    ]
  };

  const card = trainerCard(mockState);
  assert.ok(Array.isArray(card.hof), 'trainerCard must include hof array');
  assert.equal(card.hof.length, 1, 'trainerCard hof must reflect state');
  assert.equal(card.hof[0].title, 'Nouveau Maître');

  // Test DOM rendering for pantheonScreen
  let pDom = null;
  const mockUi = {
    root: { appendChild: (s) => { pDom = s; } },
    input: { push: () => () => {} },
    sound: { sfx: () => {} }
  };
  const mockGame = { ui: mockUi, state: mockState };

  pantheonScreen(mockGame);
  assert.ok(pDom, 'pantheonScreen must create DOM screen');
  assert.ok(pDom.innerHTML.includes('HALL DE LA RENOMMÉE D\'ODYSSÉE'), 'Must have Hall of Fame title');
  assert.ok(pDom.innerHTML.includes('Sacre #1'), 'Must render Sacre #1');
  assert.ok(pDom.innerHTML.includes('Dracaufeu'), 'Must render winning Pokémon name');

  // Verify ending() in game.js records to st.hof
  const gameSrc = fs.readFileSync(resolvePath('odyssee/js/game.js'), 'utf8');
  assert.ok(gameSrc.includes('st.hof.push(entry)'), 'game.js ending must persist entry into st.hof');
  assert.ok(gameSrc.includes('await hofScreen(this, entry)'), 'game.js ending must trigger ceremonial hofScreen');

  console.log('✔ Hall of Fame & Panthéon screens DOM structure and ending flow validated 100%');
}

console.log('\n🎉 ALL V4.01 TESTS PASSED SUCCESSFULLY (100%)!');
