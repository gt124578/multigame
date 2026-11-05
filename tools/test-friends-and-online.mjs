import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('Testing Friends and Online System (v4.07)...');

// 1. Setup mock browser environment before dynamic imports
globalThis.location = new URL('http://localhost:3000/index.html');
globalThis.window = globalThis;
globalThis.localStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
})();

const createMockEl = (tag = 'DIV') => {
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    classList: {
      _classes: new Set(),
      add(...cs) { cs.forEach((c) => this._classes.add(c)); },
      remove(...cs) { cs.forEach((c) => this._classes.delete(c)); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c);
          else this._classes.add(c);
        } else if (force) this._classes.add(c);
        else this._classes.delete(c);
      },
      has(c) { return this._classes.has(c); },
    },
    style: {},
    dataset: {},
    innerHTML: '',
    appendChild(child) { return child; },
    append(...children) {},
    remove() { el.isRemoved = true; },
    querySelector(sel) {
      if (sel.includes('.fr-tab.active')) return createMockEl('BUTTON');
      if (sel.includes('.fr-code-input')) return { value: '', focus() {}, set oninput(fn) {}, set onkeydown(fn) {} };
      return createMockEl('DIV');
    },
    querySelectorAll(sel) {
      return [createMockEl('BUTTON'), createMockEl('BUTTON')];
    },
    addEventListener() {},
  };
  return el;
};

globalThis.document = {
  createElement: createMockEl,
  querySelector: () => createMockEl('DIV'),
  querySelectorAll: () => [],
  body: createMockEl('BODY'),
  addEventListener() {},
};

// 2. Test FriendsManager in standalone mode
const { FriendsManager, formatFid, parseFid, deriveFid } = await import('../odyssee/js/net/friends.js');

console.log('--- Testing FriendsManager basics ---');
assert.equal(formatFid('ABCD1234'), 'ABCD-1234', 'formatFid formats 8 chars with hyphen');
assert.equal(parseFid('abcd-1234'), 'ABCD1234', 'parseFid cleans input');
assert.equal(parseFid(' A1-b2-C3-d4 '), 'A1B2C3D4', 'parseFid trims and strips spaces');

const mockGame = {
  state: {
    name: 'Red',
    gender: 'm',
    badges: [true, true, false, false],
    party: [{ sp: 25, lvl: 15, hp: 35, stats: [35] }],
    money: 2500,
  },
  player: { x: 30, y: 40 },
  mapObj: { id: 'monde' },
  locationName: () => 'Bourg-Aube',
  link: {
    others: new Map([
      ['peer-1', {
        id: 'peer-1',
        name: 'Blue',
        gender: 'm',
        map: 'monde',
        x: 32,
        y: 42,
        busy: false,
        pvp: null,
      }],
    ]),
  },
  ui: {
    root: createMockEl('DIV'),
    sound: { sfx() {} },
    input: {
      handlers: [],
      push(fn) {
        this.handlers.push(fn);
        return () => {
          const idx = this.handlers.indexOf(fn);
          if (idx >= 0) this.handlers.splice(idx, 1);
        };
      },
    },
  },
};

const mgr = new FriendsManager(mockGame);
const myCode = mgr.getMyCode();
assert.ok(myCode && myCode.length === 8, 'MyCode is an 8-character string');
console.log('Derived MyCode:', formatFid(myCode));

// Online count
const count = mgr.getOnlineCount();
assert.equal(count, 2, 'Online count should be 2 (self + peer-1)');

// Online peers
const peers = mgr.getOnlinePeers();
assert.equal(peers.length, 2, 'Should have 2 online peers');
assert.equal(peers[0].id, 'me', 'First peer is self');
assert.equal(peers[0].locName, 'Bourg-Aube', 'Self location is Bourg-Aube');
assert.equal(peers[1].id, 'peer-1', 'Second peer is Blue');
assert.equal(peers[1].name, 'Blue', 'Peer name is Blue');

// Add friend
await mgr.addFriend('K9L2-M4P6');
const friends = mgr.getFriendsList();
assert.equal(friends.length, 1, 'Friend should be added');
assert.equal(friends[0].fid, 'K9L2M4P6', 'Friend FID should match');

// Remove friend
await mgr.removeFriend('K9L2-M4P6');
assert.equal(mgr.getFriendsList().length, 0, 'Friend should be removed');
console.log('✓ FriendsManager tests passed');

// 3. Test friendsScreen lifecycle and keyboard inputs
console.log('--- Testing friendsScreen lifecycle & controls ---');
const { friendsScreen } = await import('../odyssee/js/ui/screens.js');

let screenPromise = friendsScreen(mockGame);
assert.equal(mockGame.ui.input.handlers.length, 1, 'Input handler pushed for friendsScreen');

const handler = mockGame.ui.input.handlers[0];

// Test Non-destructive Space & Enter
handler('a'); // Space / Enter action
assert.equal(mockGame.ui.input.handlers.length, 1, 'Space/Enter should NOT close friendsScreen');
handler('space');
assert.equal(mockGame.ui.input.handlers.length, 1, 'Space should NOT close friendsScreen');
handler('enter');
assert.equal(mockGame.ui.input.handlers.length, 1, 'Enter should NOT close friendsScreen');

// Test Tab Navigation
handler('right');
handler('left');
assert.equal(mockGame.ui.input.handlers.length, 1, 'Tab navigation works without closing screen');

// Test Close with Escape ('b')
handler('b');
await screenPromise;
assert.equal(mockGame.ui.input.handlers.length, 0, 'Escape cleanly resolves and pops friendsScreen');
console.log('✓ friendsScreen lifecycle & controls tests passed');

// 4. Test startMenu inclusion in game.js
console.log('--- Testing startMenu option in game.js ---');
const gameSrc = fs.readFileSync('odyssee/js/game.js', 'utf8');
assert.ok(gameSrc.includes("'friends']") && gameSrc.includes('en ligne'), 'game.js startMenu includes the Amis option (with the number of other players online)');
assert.ok(gameSrc.includes("else if (k === 'friends') await friendsScreen(this);"), 'game.js handles friends menu action');

// 5. Test HUD online pill in hud.js
console.log('--- Testing HUD integration in hud.js ---');
const hudSrc = fs.readFileSync('odyssee/js/ui/hud.js', 'utf8');
assert.ok(hudSrc.includes("hud-online-badge"), 'hud.js includes hud-online-badge in location row');
assert.ok(hudSrc.includes("hud-friends-btn"), 'hud.js includes hud-friends-btn in actions');
assert.ok(hudSrc.includes("else if (act === 'friends')"), 'hud.js handles friends action click');

// 6. Test Input shortcut in input.js
console.log('--- Testing Input mapping in input.js ---');
const inputSrc = fs.readFileSync('odyssee/js/input.js', 'utf8');
assert.ok(inputSrc.includes("KeyO: 'friends'"), 'input.js maps KeyO to friends');

console.log('\n=======================================');
console.log('ALL FRIENDS & ONLINE TESTS PASSED (100%)');
console.log('=======================================\n');
