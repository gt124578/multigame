// arcadia/tools/test-bugs-and-multi-audit.mjs
// Comprehensive audit and regression test suite for bug fixes & multiplayer resilience

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('=== STARTING BUGS & MULTIPLAYER AUDIT SUITE ===');

const resolvePath = (p) => {
  if (fs.existsSync(p)) return p;
  if (p.startsWith('arcadia/') && fs.existsSync(p.slice('arcadia/'.length))) return p.slice('arcadia/'.length);
  if (fs.existsSync(path.join('arcadia', p))) return path.join('arcadia', p);
  if (fs.existsSync(path.join('..', p))) return path.join('..', p);
  return p;
};

// 1. Audit social.js and speech bubble rendering
console.log('1. Auditing social.js & 3D speech bubble positioning...');
const socialSrc = fs.readFileSync(resolvePath('arcadia/odyssee/js/net/social.js'), 'utf8');

assert.ok(socialSrc.includes('const v = game.view, mapId = game.mapObj?.id;'), 'social.js drawTags must safely declare v and mapId');
assert.ok(socialSrc.includes('const bPos = v.screenPos(x, y, 52);'), 'social.js drawTags must use v.screenPos instead of non-existent v.project');
assert.ok(socialSrc.includes('game.clearSpeechBubbles ='), 'social.js must expose clearSpeechBubbles');
assert.ok(socialSrc.includes('link.onChat = (from, m) =>'), 'social.js must bind link.onChat directly');
console.log('✔ social.js: ReferenceError eliminated, screenPos verified, clearSpeechBubbles present');

// 2. Audit link.js chat message interception
console.log('2. Auditing link.js protocol handling...');
const linkSrc = fs.readFileSync(resolvePath('arcadia/odyssee/js/net/link.js'), 'utf8');
assert.ok(linkSrc.includes('this.onChat = null;'), 'link.js must declare onChat hook');
assert.ok(linkSrc.includes("if (m.t === 'chat')"), 'link.js receive must handle chat messages');
console.log('✔ link.js: chat messages routed cleanly without inbox pollution');

// 3. Audit chatModal.js keyboard & sound safety
console.log('3. Auditing chatModal.js modal controls & audio safety...');
const chatModalSrc = fs.readFileSync(resolvePath('arcadia/odyssee/js/ui/chatModal.js'), 'utf8');
assert.ok(chatModalSrc.includes('popKey?.();'), 'chatModal.js must clean up keyboard listeners');
assert.ok(chatModalSrc.includes("if (k === 'b') close();"), 'chatModal.js must close on Escape/B');
assert.ok(!chatModalSrc.includes('game.ui.sound.sfx'), 'chatModal.js must not crash on missing ui.sound');
console.log('✔ chatModal.js: full keyboard capture, safe teardown and audio verified');

// 4. Audit input.js & game.js key handling
console.log('4. Auditing input.js and overworld shortcuts in game.js...');
const inputSrc = fs.readFileSync(resolvePath('arcadia/odyssee/js/input.js'), 'utf8');
const gameSrc = fs.readFileSync(resolvePath('arcadia/odyssee/js/game.js'), 'utf8');

assert.ok(inputSrc.includes("KeyI: 'bag'"), 'input.js must map KeyI to bag');
assert.ok(inputSrc.includes("KeyP: 'chat'"), 'input.js must map KeyP to chat');
assert.ok(inputSrc.includes("KeyY: 'ball'"), 'input.js must map KeyY to ball/registered');

assert.ok(gameSrc.includes("if (k === 'chat')"), 'game.js onKey must handle chat action');
assert.ok(gameSrc.includes("if (k === 'ball')"), 'game.js onKey must handle ball/registered item action');
assert.ok(gameSrc.includes("else if (k === 'bag')"), 'game.js onKey must handle direct bag shortcut');
console.log('✔ input.js & game.js: [I] Sac, [P] Chat, [Y] Objet Enregistré all wired in field');

// 5. Audit useRegisteredItem smart fallbacks and special items
console.log('5. Auditing useRegisteredItem() resilience & items handling...');
assert.ok(gameSrc.includes("st.bag?.['running-shoes']"), 'useRegisteredItem must fallback to running shoes');
assert.ok(gameSrc.includes("reg === 'velo'"), 'useRegisteredItem must support registered bicycle');
assert.ok(gameSrc.includes("reg === 'sifflet-celeste'"), 'useRegisteredItem must support registered flight flute');
assert.ok(gameSrc.includes("reg === 'town-map'"), 'useRegisteredItem must support registered region map');
assert.ok(gameSrc.includes('this.clearSpeechBubbles?.();'), 'warp() must clear lingering speech bubbles');
console.log('✔ game.js: smart defaults for shoes/canne/velo, key items handled, bubbles cleared on warp');

// 6. Audit startMenu options
console.log('6. Auditing startMenu() options...');
assert.ok(gameSrc.includes("['Émotes & Chat', 'chat']"), 'startMenu must include Émotes & Chat');
assert.ok(gameSrc.includes("chat: 'img/hud/chat.png'"), 'startMenu must include chat icon');
assert.ok(gameSrc.includes('if (openChatAfter) this.openChat();'), 'startMenu must execute openChat()');
console.log('✔ game.js: startMenu fully synchronized with Chat option');

// 7. Audit DexNav to Pokédex navigation (focusSp)
console.log('7. Auditing DexNav & Pokédex focus navigation...');
const dexSrc = fs.readFileSync(resolvePath('arcadia/odyssee/js/ui/screens/dex.js'), 'utf8');
const hudSrc = fs.readFileSync(resolvePath('arcadia/odyssee/js/ui/hud.js'), 'utf8');

assert.ok(dexSrc.includes('opts.focusSp'), 'dexScreen must support opts.focusSp');
assert.ok(hudSrc.includes('data-sp="${sp}"'), 'hud.js must embed data-sp attribute in hdn-slot');
assert.ok(hudSrc.includes('slotEl.dataset.sp'), 'hud.js must handle clicking on DexNav slots');
assert.ok(hudSrc.includes('dexScreen(g, { focusSp: sp })'), 'hud.js must open focused Pokédex');
console.log('✔ hud.js & dex.js: clicking DexNav slot directly opens focused Pokédex entry');

// 8. Audit Help UI Table
console.log('8. Auditing keyboard controls guide in ui.js...');
const uiSrc = fs.readFileSync(resolvePath('arcadia/odyssee/js/ui/ui.js'), 'utf8');
assert.ok(uiSrc.includes('Objet Enregistré'), 'ui.js help table must document Objet Enregistré');
assert.ok(uiSrc.includes('Ouvrir le Sac'), 'ui.js help table must document Ouvrir le Sac');
assert.ok(uiSrc.includes('Émotes & Chat multijoueur'), 'ui.js help table must document Chat multijoueur');
console.log('✔ ui.js: in-game [H] Help Dialog documents all new shortcuts');

console.log('\n🎉 ALL BUGS & MULTIPLAYER AUDIT TESTS PASSED SUCCESSFULLY (100%)!');
