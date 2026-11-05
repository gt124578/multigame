import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arcadiaDir = path.resolve(__dirname, '..');

console.log('Testing Odyssée B2W2 Trainer Card & 15 Badges System (v3.98)...');

// ============================================================================
// 1. Verify all 15 Badges asset files exist on disk
// ============================================================================
const badgesDir = path.join(arcadiaDir, 'odyssee/img/badges');
assert.ok(fs.existsSync(badgesDir), 'odyssee/img/badges directory must exist');

for (let i = 1; i <= 15; i++) {
  const stdPath = path.join(badgesDir, `badge_${i}.png`);
  const lockPath = path.join(badgesDir, `badge_${i}_locked.png`);
  const bigPath = path.join(badgesDir, `badge_${i}_128.png`);

  assert.ok(fs.existsSync(stdPath), `Badge standard sprite missing: badge_${i}.png`);
  assert.ok(fs.existsSync(lockPath), `Badge locked silhouette missing: badge_${i}_locked.png`);
  assert.ok(fs.existsSync(bigPath), `Badge high-res 128px sprite missing: badge_${i}_128.png`);

  const stdSize = fs.statSync(stdPath).size;
  const lockSize = fs.statSync(lockPath).size;
  const bigSize = fs.statSync(bigPath).size;

  assert.ok(stdSize > 500, `badge_${i}.png must not be empty (size=${stdSize})`);
  assert.ok(lockSize > 300, `badge_${i}_locked.png must not be empty (size=${lockSize})`);
  assert.ok(bigSize > 1000, `badge_${i}_128.png must not be empty (size=${bigSize})`);
}
console.log('✔ All 45 badge image assets (15 standard, 15 locked, 15 high-res) verified!');

// Verify Nanobanana pixel art backgrounds for trainer card
const cardImgDir = path.join(arcadiaDir, 'odyssee/img/card');
const rankThemes = ['normal', 'bronze', 'silver', 'gold', 'master'];
for (const theme of rankThemes) {
  const bgPath = path.join(cardImgDir, `card_front_${theme}.jpg`);
  assert.ok(fs.existsSync(bgPath), `Card front background missing: card_front_${theme}.jpg`);
  assert.ok(fs.statSync(bgPath).size > 10000, `card_front_${theme}.jpg must not be empty`);
}
const backCasePath = path.join(cardImgDir, 'card_back_case.jpg');
assert.ok(fs.existsSync(backCasePath), 'Card back case image missing: card_back_case.jpg');
assert.ok(fs.statSync(backCasePath).size > 10000, 'card_back_case.jpg must not be empty');
console.log('✔ All 6 Nanobanana pixel art card backgrounds (5 rank themes + velvet case) verified!');

// ============================================================================
// 2. Setup minimal browser mocks to test screens.js in node
// ============================================================================
globalThis.location = new URL('http://localhost:3000/index.html');
globalThis.window = globalThis;
globalThis.document = {
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    className: '',
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    dataset: {},
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    remove: () => {}
  }),
  querySelector: () => null,
  querySelectorAll: () => []
};

const { BADGE_SPECS, getCardRank, trainerCard, cardScreen } = await import('../odyssee/js/ui/screens.js');
const { BADGES } = await import('../odyssee/js/world/region.js');

// ============================================================================
// 3. BADGE_SPECS integrity with region.js BADGES
// ============================================================================
assert.equal(BADGE_SPECS.length, 15, 'BADGE_SPECS must define exactly 15 badges');
assert.equal(BADGES.length, 15, 'region.js BADGES must have 15 badges');

for (let i = 0; i < 15; i++) {
  assert.equal(BADGE_SPECS[i].id, i + 1);
  assert.equal(BADGE_SPECS[i].name, BADGES[i].name, `Badge ${i+1} name mismatch`);
  assert.equal(BADGE_SPECS[i].type, BADGES[i].type, `Badge ${i+1} type mismatch`);
  assert.ok(BADGE_SPECS[i].leader, `Badge ${i+1} must specify a gym leader`);
  assert.ok(BADGE_SPECS[i].town, `Badge ${i+1} must specify an arena town`);
  assert.ok(BADGE_SPECS[i].reward, `Badge ${i+1} must specify a field/rule privilege`);
}
console.log('✔ BADGE_SPECS matches region.js BADGES for all 15 arenas!');

// ============================================================================
// 4. Test Card Prestige Rank and Star calculation
// ============================================================================
{
  // Beginner card
  const c0 = { badges: Array(15).fill(false), champion: false, dex: 10, trophies: 0, pvpWins: 0 };
  const r0 = getCardRank(c0);
  assert.equal(r0.stars, 0);
  assert.equal(r0.grade, 'NORMAL');
  assert.equal(r0.themeCls, 'card-normal');

  // 8 badges
  const c1 = { badges: Array(15).fill(false).map((_, i) => i < 8), champion: false, dex: 25, trophies: 2 };
  const r1 = getCardRank(c1);
  assert.equal(r1.stars, 1);
  assert.equal(r1.grade, 'BRONZE');
  assert.equal(r1.themeCls, 'card-bronze');

  // 15 badges + Champion
  const c2 = { badges: Array(15).fill(true), champion: true, dex: 45, trophies: 5 };
  const r2 = getCardRank(c2);
  assert.equal(r2.stars, 3);
  assert.equal(r2.grade, 'OR');
  assert.equal(r2.themeCls, 'card-gold');

  // Complete master
  const c3 = { badges: Array(15).fill(true), champion: true, dex: 80, trophies: 15, pvpWins: 12 };
  const r3 = getCardRank(c3);
  assert.equal(r3.stars, 5);
  assert.equal(r3.grade, 'MAÎTRE');
  assert.equal(r3.themeCls, 'card-master');
}
console.log('✔ getCardRank B2W2 stars and prestige progression validated!');

// ============================================================================
// 5. Test trainerCard data export
// ============================================================================
{
  const mockState = {
    name: 'Aurore',
    id: 12345,
    gender: 'f',
    money: 85000,
    dex: { caught: [1, 2, 3, 25, 150], seen: [1, 2, 3, 4, 5, 25, 150] },
    time: 4520,
    badges: [true, true, true, false, false, false, false, false, false, false, false, false, false, false, false],
    party: [
      { sp: 25, lvl: 35, shiny: true, nick: 'Pika', hp: 80, stats: [80, 50, 40, 50, 40, 90], ball: 'hyper-ball' },
      { sp: 6, lvl: 42, shiny: false, nick: null, hp: 120, stats: [120, 90, 80, 110, 85, 100], ball: 'super-ball' }
    ],
    flags: { champion: true },
    pvp: {
      totalWins: 7,
      totalLosses: 2,
      currentStreak: 4,
      trophies: {
        pvp_first_win: { unlocked: true },
        pvp_streak_3: { unlocked: true }
      }
    }
  };

  const card = trainerCard(mockState);
  assert.equal(card.name, 'Aurore');
  assert.equal(card.id, 12345);
  assert.equal(card.gender, 'f');
  assert.equal(card.money, 85000);
  assert.equal(card.dex, 5);
  assert.equal(card.seen, 7);
  assert.equal(card.badges.filter(Boolean).length, 3);
  assert.equal(card.champion, true);
  assert.equal(card.trophies, 2);
  assert.equal(card.pvpWins, 7);
  assert.equal(card.pvpLosses, 2);
  assert.equal(card.team.length, 2);
  assert.equal(card.team[0].sp, 25);
  assert.equal(card.team[0].shiny, true);
  assert.equal(card.team[0].ball, 'hyper-ball');
}
console.log('✔ trainerCard state export validated with full B2W2 metrics!');

// ============================================================================
// 6. Test cardScreen HTML DOM rendering
// ============================================================================
{
  let screenHtml = '';
  const mockScreenEl = {
    classList: { add() {} },
    appendChild() {},
    remove() {},
    querySelectorAll: (sel) => {
      // Mock buttons
      return [
        {
          dataset: { act: 'flip' },
          onclick: null,
          addEventListener() {}
        }
      ];
    },
    set innerHTML(val) {
      screenHtml = val;
    },
    get innerHTML() {
      return screenHtml;
    }
  };

  const mockUi = {
    root: {
      appendChild: () => {}
    },
    input: {
      push: () => () => {}
    },
    sound: {
      sfx: () => {}
    }
  };

  // Mock global screen helper
  const mockGame = {
    ui: mockUi,
    state: {
      name: 'Red',
      id: 48291,
      gender: 'm',
      money: 120000,
      dex: { caught: Array(60).fill(1), seen: Array(90).fill(1) },
      time: 7200,
      badges: Array(15).fill(false).map((_, i) => i < 8),
      party: [
        { sp: 6, lvl: 65, shiny: false, nick: 'Dracaufeu', hp: 150, stats: [150], ball: 'hyper-ball' }
      ],
      flags: { champion: true },
      pvp: { totalWins: 10, totalLosses: 3, currentStreak: 5, trophies: {} }
    }
  };

  // Override screen creation for testing
  const origCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = () => mockScreenEl;

  // Launch cardScreen
  cardScreen(mockGame, BADGES);

  // Restore document.createElement
  globalThis.document.createElement = origCreateElement;

  // Assertions on generated HTML
  assert.ok(screenHtml.includes('b2w2-card-casing'), 'Must contain B2W2 card casing element');
  assert.ok(screenHtml.includes('tc-pixelart-bg'), 'Must contain Nanobanana pixel art background image');
  assert.ok(screenHtml.includes('tc-pixelart-scanlines'), 'Must contain DS scanlines overlay');
  assert.ok(screenHtml.includes('N° 48291'), 'Must display padded trainer number');
  assert.ok(screenHtml.includes('CARTE DE DRESSEUR'), 'Must display title header');
  assert.ok(screenHtml.includes('tc-face-profile'), 'Must contain profile face');
  assert.ok(screenHtml.includes('tc-face-badges'), 'Must contain badges face');
  assert.ok(screenHtml.includes('CONTINENT NORD & ARCHIPEL'), 'Must contain Nord badges tray');
  assert.ok(screenHtml.includes('TERRES DU SUD'), 'Must contain Sud badges tray');
  assert.ok(screenHtml.includes('tc-badge-inspector'), 'Must contain interactive badge inspector');
  assert.ok(screenHtml.includes('badge_1.png'), 'Must link to badge 1 pixel art sprite');
  assert.ok(screenHtml.includes('badge_15_locked.png'), 'Must link to locked badge silhouette for badge 15');
}
console.log('✔ cardScreen DOM structure and B2W2 dual-face rendering validated!');

console.log('\n🎉 ALL B2W2 TRAINER CARD & 15 BADGES TESTS PASSED 100%!');
