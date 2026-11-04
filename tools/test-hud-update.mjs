// tools/test-hud-update.mjs
globalThis.window = globalThis;
globalThis.location = { search: '', origin: 'http://localhost' };
globalThis.document = {
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    classList: { add() {}, remove() {}, toggle() {} },
    append() {},
    appendChild() {},
    setAttribute() {},
    style: {},
    addEventListener() {},
    innerHTML: ''
  }),
  documentElement: { style: { setProperty() {} } }
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { Hud } = await import('../odyssee/js/ui/hud.js');
const { createMon } = await import('../odyssee/js/core/mon.js');

// Test Case 1: Fresh state without pvp property
{
  const mockGame = {
    state: {
      party: [createMon(25, 15)],
      badges: [true, true, false],
      money: 5400,
      trackedQuest: null,
    },
    mapObj: { name: 'Bourg-Palette' },
    locationName: () => 'Bourg-Palette',
    badgeCount: () => 2,
    levelCap: () => 25,
    autoRun: false,
    runSpeed: 1,
    ui: { root: { appendChild() {} } },
    input: { free: true },
    bv: { alive: false },
    sound: { sfx() {} }
  };

  const hud = new Hud(mockGame);
  hud.update(true);
  if (!hud.gearEl.innerHTML.includes('TROPHÉES')) throw new Error('Missing TROPHÉES button in gearEl');
  if (!hud.gearEl.innerHTML.includes('0/32 🏅')) throw new Error('Missing 0/32 🏅 in gearEl');
  if (!hud.partyEl.innerHTML.includes('<b>PV</b>')) throw new Error('Missing <b>PV</b> badge in HUD party element');
  if (hud.partyEl.innerHTML.includes('<b>HP</b>')) throw new Error('Unexpected <b>HP</b> badge in HUD party element');
  console.log('✔ Test Case 1 (Fresh state without pvp) passed');
}

// Test Case 2: State with unlocked trophies
{
  const mockGame = {
    state: {
      party: [createMon(6, 65)],
      badges: [true, true, true, true, true, true, true, true],
      money: 120000,
      trackedQuest: 'quest_1',
      pvp: {
        totalWins: 5, totalLosses: 1, totalDraws: 0,
        currentStreak: 5, bestStreak: 5,
        players: { 'Alice': { name: 'Alice', wins: 5, losses: 1, draws: 0, lastDate: Date.now() } },
        trophies: {
          pvp_first_win: { unlocked: true, claimed: true, date: Date.now() },
          pvp_streak_5: { unlocked: true, claimed: false, date: Date.now() }
        }
      }
    },
    mapObj: { name: 'Plateau Indigo' },
    locationName: () => 'Plateau Indigo',
    badgeCount: () => 8,
    levelCap: () => 100,
    autoRun: true,
    runSpeed: 2,
    ui: { root: { appendChild() {} } },
    input: { free: true },
    bv: { alive: false },
    sound: { sfx() {} }
  };

  const hud = new Hud(mockGame);
  hud.update(true);
  if (!hud.gearEl.innerHTML.includes('2/32 🏅')) throw new Error('Missing 2/32 🏅 in gearEl');
  console.log('✔ Test Case 2 (State with unlocked trophies) passed');
}

console.log('\n🎉 ALL HUD UPDATE TESTS PASSED SUCCESSFULLY!');
