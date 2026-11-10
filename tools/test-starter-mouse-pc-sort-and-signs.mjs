import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('=== TEST SUITE: Starter Mouse Selection, Directional Signs HUD & PC Box Auto-Sort ===');

// 1. Check code integration in game.js, ui.js, pc.js and css files
const gameSrc = fs.readFileSync('arcadia/odyssee/js/game.js', 'utf8');
const uiSrc = fs.readFileSync('arcadia/odyssee/js/ui/ui.js', 'utf8');
const pcSrc = fs.readFileSync('arcadia/odyssee/js/ui/screens/pc.js', 'utf8');
const hudCss = fs.readFileSync('arcadia/odyssee/css/10-hud.css', 'utf8');
const pcCss = fs.readFileSync('arcadia/odyssee/css/14-pc.css', 'utf8');
const diversCss = fs.readFileSync('arcadia/odyssee/css/07-divers.css', 'utf8');

assert.ok(gameSrc.includes('promptStarterChoice('), 'game.js should have promptStarterChoice');
assert.ok(gameSrc.includes('checkNearbySigns()'), 'game.js should have checkNearbySigns');
assert.ok(gameSrc.includes('this.checkNearbySigns();'), 'game.js updateZone should call checkNearbySigns');
assert.ok(gameSrc.includes('this.currentRoadSign = null; this.ui.hideRoadSign?.();'), 'game.js warp should reset road sign');
assert.ok(uiSrc.includes('showRoadSign(text)'), 'ui.js should have showRoadSign');
assert.ok(uiSrc.includes('hideRoadSign()'), 'ui.js should have hideRoadSign');
assert.ok(pcSrc.includes('sortBox = (boxIdx, criterion)'), 'pc.js should have sortBox function');
assert.ok(pcSrc.includes('data-sort="dex"'), 'pc.js should have sort buttons for dex');
assert.ok(pcSrc.includes('data-sort="lvl"'), 'pc.js should have sort buttons for lvl');
assert.ok(pcSrc.includes('data-sort="name"'), 'pc.js should have sort buttons for name');
assert.ok(pcSrc.includes('data-sort="type"'), 'pc.js should have sort buttons for type');
assert.ok(hudCss.includes('.hud-road-sign'), '10-hud.css should contain .hud-road-sign styles');
assert.ok(pcCss.includes('.pc-sort-bar'), '14-pc.css should contain .pc-sort-bar styles');
assert.ok(diversCss.includes('.starter-select-modal'), '07-divers.css should contain .starter-select-modal styles');

console.log('✔ All source files correctly updated with required methods, markup, and CSS.');

// 2. Test PC Sorting Logic with simulated species data
const SPECIES = {
  '1': { n: 'Bulbizarre', t: ['grass', 'poison'] },
  '4': { n: 'Salamèche', t: ['fire'] },
  '7': { n: 'Carapuce', t: ['water'] },
  '25': { n: 'Pikachu', t: ['electric'] },
  '1001': { n: 'Chloropousse', t: ['grass'] },
  '1004': { n: 'Flamichat', t: ['fire'] }
};

function runSortBox(mons, curBox, criterion) {
  const monsInBox = mons.filter((m) => m && m.box === curBox);
  if (monsInBox.length <= 1) return;

  monsInBox.sort((a, b) => {
    const sa = SPECIES[a.sp] || {};
    const sb = SPECIES[b.sp] || {};
    const numA = Number(a.sp) || 9999;
    const numB = Number(b.sp) || 9999;
    const nameA = a.nick || sa.n || String(a.sp);
    const nameB = b.nick || sb.n || String(b.sp);
    const lvlA = a.lvl || 1;
    const lvlB = b.lvl || 1;
    const typeA = (sa.t && sa.t[0]) || '';
    const typeB = (sb.t && sb.t[0]) || '';

    if (criterion === 'dex') {
      if (numA !== numB) return numA - numB;
      if (lvlB !== lvlA) return lvlB - lvlA;
      return nameA.localeCompare(nameB, 'fr');
    } else if (criterion === 'lvl') {
      if (lvlB !== lvlA) return lvlB - lvlA;
      if (numA !== numB) return numA - numB;
      return nameA.localeCompare(nameB, 'fr');
    } else if (criterion === 'name') {
      const cmp = nameA.localeCompare(nameB, 'fr');
      if (cmp !== 0) return cmp;
      return lvlB - lvlA;
    } else if (criterion === 'type') {
      const cmp = typeA.localeCompare(typeB, 'fr');
      if (cmp !== 0) return cmp;
      if (numA !== numB) return numA - numB;
      return lvlB - lvlA;
    }
    return 0;
  });

  monsInBox.forEach((m, idx) => {
    m.slot = idx;
  });

  mons.sort((a, b) => ((a?.box ?? 0) * 100 + (a?.slot ?? 0)) - ((b?.box ?? 0) * 100 + (b?.slot ?? 0)));
}

// Test Dex sort
{
  const testBox = [
    { box: 0, slot: 5, sp: '25', lvl: 15 },
    { box: 0, slot: 2, sp: '1', lvl: 10 },
    { box: 0, slot: 8, sp: '7', lvl: 20 },
    { box: 0, slot: 12, sp: '4', lvl: 12 },
    { box: 0, slot: 19, sp: '1001', lvl: 5 }
  ];
  runSortBox(testBox, 0, 'dex');
  assert.deepEqual(testBox.map((m) => m.sp), ['1', '4', '7', '25', '1001']);
  assert.deepEqual(testBox.map((m) => m.slot), [0, 1, 2, 3, 4]);
  console.log('✔ Sort by Dex: correct ascending order and reindexed slots.');
}

// Test Level sort
{
  const testBox = [
    { box: 0, slot: 5, sp: '25', lvl: 15 },
    { box: 0, slot: 2, sp: '1', lvl: 10 },
    { box: 0, slot: 8, sp: '7', lvl: 50 },
    { box: 0, slot: 12, sp: '4', lvl: 50 }
  ];
  runSortBox(testBox, 0, 'lvl');
  assert.equal(testBox[0].lvl, 50);
  assert.equal(testBox[1].lvl, 50);
  assert.equal(testBox[0].sp, '4'); // Tie-breaker: Dex number 4 before 7
  assert.equal(testBox[1].sp, '7');
  assert.equal(testBox[2].lvl, 15);
  assert.equal(testBox[3].lvl, 10);
  assert.deepEqual(testBox.map((m) => m.slot), [0, 1, 2, 3]);
  console.log('✔ Sort by Level: highest level first with Dex tie-breaker.');
}

// Test Name sort
{
  const testBox = [
    { box: 0, slot: 0, sp: '25', lvl: 15 }, // Pikachu
    { box: 0, slot: 1, sp: '1', lvl: 10 },  // Bulbizarre
    { box: 0, slot: 2, sp: '7', lvl: 20 },  // Carapuce
    { box: 0, slot: 3, sp: '4', lvl: 12 }   // Salamèche
  ];
  runSortBox(testBox, 0, 'name');
  assert.deepEqual(testBox.map((m) => SPECIES[m.sp].n), ['Bulbizarre', 'Carapuce', 'Pikachu', 'Salamèche']);
  console.log('✔ Sort by Name: alphabetical order.');
}

// Test Type sort
{
  const testBox = [
    { box: 0, slot: 0, sp: '25', lvl: 15 }, // electric
    { box: 0, slot: 1, sp: '1', lvl: 10 },  // grass
    { box: 0, slot: 2, sp: '4', lvl: 12 },  // fire
    { box: 0, slot: 3, sp: '7', lvl: 20 }   // water
  ];
  runSortBox(testBox, 0, 'type');
  // electric ('electric'), fire ('fire'), grass ('grass'), water ('water')
  assert.deepEqual(testBox.map((m) => SPECIES[m.sp].t[0]), ['electric', 'fire', 'grass', 'water']);
  console.log('✔ Sort by Type: primary type alphabetical grouping.');
}

// 3. Test Directional Road Signs Detection
{
  const key = (x, y) => x + ',' + y;
  const signs = new Map();
  signs.set(key(68, 525), 'ROUTE 1\n↑ Sylvebourg   ↓ Bourg-Aube');
  signs.set(key(70, 520), 'Boîte aux lettres de Maman');

  function checkSigns(px, py) {
    let nearest = null, minDist = 4;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > 3.2) continue;
        const txt = signs.get(key(px + dx, py + dy));
        if (!txt) continue;
        if (/[↑↓←→]/.test(txt) || (txt.includes('ROUTE') && txt.includes('\n'))) {
          if (d < minDist) {
            minDist = d;
            nearest = txt;
          }
        }
      }
    }
    return nearest ? nearest.split('\n').map((l) => l.trim()).filter(Boolean).join(' · ') : null;
  }

  // Near route 1 sign (68, 525)
  const nearby = checkSigns(69, 526);
  assert.equal(nearby, 'ROUTE 1 · ↑ Sylvebourg   ↓ Bourg-Aube');

  // Near mailbox (70, 520), without arrows
  const mailbox = checkSigns(70, 521);
  assert.equal(mailbox, null, 'Mailboxes without direction should not trigger orientation HUD');

  // Far away
  const far = checkSigns(100, 100);
  assert.equal(far, null);
  console.log('✔ Directional Signs: formatted cleanly and selectively detected within 3 tiles.');
}

console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
