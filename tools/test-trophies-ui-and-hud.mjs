// arcadia/tools/test-trophies-ui-and-hud.mjs — Test automatisé du HUD et de l'écran Trophées/Médailles
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = fs.existsSync(path.resolve('odyssee')) ? path.resolve('.') : path.resolve('arcadia');

console.log('Testing Odyssée Trophies Screen & HUD Integrations...');

// 1. Check odyssee.css rules
const css = fs.readFileSync(path.join(ROOT, 'odyssee/odyssee.css'), 'utf8');

assert(
  css.includes('.screen { position: absolute; inset: 0; z-index: 22;') && css.includes('pointer-events: auto;'),
  'odyssee.css must have pointer-events: auto on .screen'
);
assert(
  css.includes('.trophies-scr {') && css.includes('pointer-events: auto;'),
  'odyssee.css must have pointer-events: auto on .trophies-scr'
);
assert(
  css.includes('.trophies-scr button,') && css.includes('.trophies-scr .ttab,'),
  'odyssee.css must explicitly enable pointer-events on buttons and tabs inside .trophies-scr'
);
assert(
  css.includes('.scr-close-btn, .scr-btn-close,'),
  'odyssee.css must style .scr-btn-close along with .scr-close-btn'
);
assert(
  css.includes('grid-template-columns: repeat(6, 1fr);'),
  'odyssee.css must specify repeat(6, 1fr) for 6 HUD action buttons'
);
console.log('✔ CSS rules for pointer-events and 6-column HUD validated');

// 2. Check input.js
const inputJs = fs.readFileSync(path.join(ROOT, 'odyssee/js/input.js'), 'utf8');
assert(inputJs.includes("KeyT: 'trophies'"), 'input.js must map KeyT to trophies');
console.log('✔ KeyT mapped to trophies in input.js');

// 3. Check game.js
const gameJs = fs.readFileSync(path.join(ROOT, 'odyssee/js/game.js'), 'utf8');
assert(
  gameJs.includes("else if (k === 'trophies') { this.busy = true; await trophiesScreen(this); this.busy = false; }"),
  'game.js must handle k === trophies in onKey'
);
assert(
  gameJs.includes('async openTrophies()'),
  'game.js must provide openTrophies method'
);
console.log('✔ game.js field key handler and openTrophies method validated');

// 4. Check trophiesView.js
const trophiesViewJs = fs.readFileSync(path.join(ROOT, 'odyssee/js/ui/trophiesView.js'), 'utf8');
assert(
  trophiesViewJs.includes('let currentTrophies = [];') && trophiesViewJs.includes('let currentFiltered = [];'),
  'trophiesView.js must declare currentTrophies and currentFiltered in outer scope'
);
assert(
  trophiesViewJs.includes("s.querySelectorAll('[data-act=\"close\"]')"),
  'trophiesView.js must bind all close buttons'
);
assert(
  trophiesViewJs.includes("s.querySelectorAll('.tmedal-card.claimable')"),
  'trophiesView.js must allow clicking claimable medal cards directly'
);
assert(
  trophiesViewJs.includes("k === 'trophies'"),
  'trophiesView.js keyboard pop handler must accept trophies key T to close'
);
console.log('✔ trophiesView.js scope, click bindings and keyboard controls validated');

// 5. Check hud.js
const hudJs = fs.readFileSync(path.join(ROOT, 'odyssee/js/ui/hud.js'), 'utf8');
assert(hudJs.includes('trophiesScreen'), 'hud.js must import trophiesScreen');
assert(hudJs.includes('getPvpSummary'), 'hud.js must import getPvpSummary');
assert(
  hudJs.includes('else if (act === \'trophies\')'),
  'hud.js must have click handler for act === trophies'
);
assert(
  hudJs.includes('data-act="trophies"') && hudJs.includes('TROPHÉES'),
  'hud.js must render TROPHÉES button with data-act="trophies"'
);
assert(
  hudJs.includes('hud-trophy-pill') && hudJs.includes('trUnlocked'),
  'hud.js must render clickable trophy pill in Pokégear header'
);
console.log('✔ hud.js button and header pill validated');

console.log('\n🎉 ALL HUD & TROPHIES TESTS PASSED SUCCESSFULLY!');
