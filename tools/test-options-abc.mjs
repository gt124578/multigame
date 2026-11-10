// test-options-abc.mjs
// Automated verification suite for Options A, B, and C

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('=== RUNNING TESTS FOR OPTIONS A, B & C ===');

const resolvePath = (p) => {
  if (fs.existsSync(p)) return p;
  if (p.startsWith('arcadia/') && fs.existsSync(p.slice('arcadia/'.length))) return p.slice('arcadia/'.length);
  if (fs.existsSync(path.join('arcadia', p))) return path.join('arcadia', p);
  if (fs.existsSync(path.join('..', p))) return path.join('..', p);
  return p;
};

// --- 1. OPTION A : Registered Item & Quick Shortcut ---
console.log('1. Checking Option A (Registered Item)...');
const bagJs = fs.readFileSync(resolvePath('arcadia/odyssee/js/ui/screens/bag.js'), 'utf8');
const bagCss = fs.readFileSync(resolvePath('arcadia/odyssee/css/03-sac.css'), 'utf8');
const gameJs = fs.readFileSync(resolvePath('arcadia/odyssee/js/game.js'), 'utf8');
const hudJs = fs.readFileSync(resolvePath('arcadia/odyssee/js/ui/hud.js'), 'utf8');
const hudCss = fs.readFileSync(resolvePath('arcadia/odyssee/css/10-hud.css'), 'utf8');

assert.ok(bagJs.includes('b2w2-btn-reg'), 'bag.js must include b2w2-btn-reg button');
assert.ok(bagJs.includes('b2w2-reg-badge'), 'bag.js must include b2w2-reg-badge badge in renderList');
assert.ok(bagJs.includes('st.registeredItem'), 'bag.js must manage st.registeredItem');
assert.ok(bagCss.includes('.b2w2-btn-reg'), '03-sac.css must style .b2w2-btn-reg');
assert.ok(bagCss.includes('.b2w2-reg-badge'), '03-sac.css must style .b2w2-reg-badge');

assert.ok(gameJs.includes('async useRegisteredItem()'), 'game.js must define useRegisteredItem()');
assert.ok(gameJs.includes("reg === 'canne'"), 'useRegisteredItem must support canne instant fishing');
assert.ok(gameJs.includes("reg === 'running-shoes'"), 'useRegisteredItem must support running shoes autorun');
assert.ok(gameJs.includes("reg === 'repel'"), 'useRegisteredItem must support repel');

assert.ok(hudJs.includes('hud-quick-item'), 'hud.js must render .hud-quick-item widget');
assert.ok(hudJs.includes('data-act="quick-item"'), 'hud.js must handle data-act="quick-item"');
assert.ok(hudCss.includes('.hud-quick-item'), '10-hud.css must style .hud-quick-item');
assert.ok(hudCss.includes('.hqi-key'), '10-hud.css must style .hqi-key shortcut pill');
console.log('✔ Option A verified: Bag register action, [Y] badge, quick overworld use & HUD button');

// --- 2. OPTION B : Habitat DexNav Bar ---
console.log('2. Checking Option B (Habitat DexNav)...');
const trophiesJs = fs.readFileSync(resolvePath('arcadia/odyssee/js/core/trophies.js'), 'utf8');
assert.ok(trophiesJs.includes('speciesList: [...pool]'), 'getZoneCatchStats must return speciesList');

assert.ok(hudJs.includes('hud-dexnav'), 'hud.js must render .hud-dexnav');
assert.ok(hudJs.includes('hdn-slot'), 'hud.js must render .hdn-slot for habitat species');
assert.ok(hudJs.includes('data-act="toggle-dexnav"'), 'hud.js must support toggle-dexnav');
assert.ok(hudCss.includes('.hud-dexnav'), '10-hud.css must style .hud-dexnav');
assert.ok(hudCss.includes('.hdn-slot.caught'), '10-hud.css must style .hdn-slot.caught');
assert.ok(hudCss.includes('.hdn-slot.seen'), '10-hud.css must style .hdn-slot.seen');
console.log('✔ Option B verified: Habitat DexNav data, full route species slots, completion badge');

// --- 3. OPTION C : Multiplayer Speech Bubbles & Live Chat ---
console.log('3. Checking Option C (Multiplayer Speech Bubbles & Live Chat)...');
assert.ok(fs.existsSync(resolvePath('arcadia/odyssee/img/hud/chat.png')), 'img/hud/chat.png must exist');
assert.ok(fs.existsSync(resolvePath('arcadia/odyssee/js/ui/chatModal.js')), 'chatModal.js must exist');

const chatModalJs = fs.readFileSync(resolvePath('arcadia/odyssee/js/ui/chatModal.js'), 'utf8');
assert.ok(chatModalJs.includes('export function openChatModal'), 'chatModal.js must export openChatModal');
assert.ok(chatModalJs.includes('chat-emote-btn'), 'chatModal.js must provide emote buttons');

const socialJs = fs.readFileSync(resolvePath('arcadia/odyssee/js/net/social.js'), 'utf8');
assert.ok(socialJs.includes('game.showSpeechBubble ='), 'social.js must define showSpeechBubble');
assert.ok(socialJs.includes('speech-bubble'), 'social.js must create .speech-bubble elements');
assert.ok(socialJs.includes('link.onChat ='), 'social.js must listen for P2P chat messages');

assert.ok(gameJs.includes('broadcastChat(text, emote)'), 'game.js must define broadcastChat');
assert.ok(gameJs.includes('openChat()'), 'game.js must define openChat');

assert.ok(hudJs.includes('hud-chat-btn'), 'hud.js must include chat button in hud-actions');
assert.ok(hudJs.includes('data-act="chat"'), 'hud.js must handle data-act="chat"');

const diversCss = fs.readFileSync('arcadia/odyssee/css/07-divers.css', 'utf8');
assert.ok(diversCss.includes('.speech-bubble'), '07-divers.css must style .speech-bubble');
assert.ok(diversCss.includes('@keyframes bubblePop'), '07-divers.css must animate bubbles with bubblePop');
assert.ok(diversCss.includes('.chat-modal'), '07-divers.css must style .chat-modal');
console.log('✔ Option C verified: P2P chat broadcast, animated speech bubbles, emote wheel modal');

console.log('=== ALL TESTS FOR OPTIONS A, B & C PASSED PERFECTLY (100%) ===');
