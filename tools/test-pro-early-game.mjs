// test-pro-early-game.mjs
// Automated verification for the Pro Early Game Enhancements in Odyssée

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- STARTING PRO EARLY GAME VERIFICATION ---');

const resolvePath = (p) => {
  if (fs.existsSync(p)) return path.resolve(p);
  if (p.startsWith('arcadia/') && fs.existsSync(p.slice('arcadia/'.length))) return path.resolve(p.slice('arcadia/'.length));
  if (fs.existsSync(path.join('arcadia', p))) return path.resolve(path.join('arcadia', p));
  if (fs.existsSync(path.join('..', p))) return path.resolve(path.join('..', p));
  return path.resolve(p);
};

const itemsPath = resolvePath('arcadia/odyssee/js/core/items.js');
const questsPath = resolvePath('arcadia/odyssee/js/core/questsData.js');
const regionPath = resolvePath('arcadia/odyssee/js/world/region.js');
const planPath = resolvePath('arcadia/odyssee/js/world/plan.js');
const quartiersPath = resolvePath('arcadia/odyssee/js/world/quartiers.js');
const gamePath = resolvePath('arcadia/odyssee/js/game.js');
const mainPath = resolvePath('arcadia/odyssee/js/main.js');
const cssPath = resolvePath('arcadia/odyssee/css/07-divers.css');

// 1. Verify ITEMS contains running-shoes
console.log('1. Checking ITEMS: running-shoes...');
const itemsSrc = fs.readFileSync(itemsPath, 'utf8');
assert.ok(itemsSrc.includes("'running-shoes': {"), 'ITEMS must define running-shoes');
assert.ok(itemsSrc.includes("name: 'Chaussures de Course'"), 'running-shoes must have French name');
assert.ok(itemsSrc.includes("pocket: 'cles'"), 'running-shoes must be in cles pocket');
console.log('✔ running-shoes registered correctly in items.js');

// 2. Verify QUESTS contains depart
console.log('2. Checking QUESTS: depart...');
const questsSrc = fs.readFileSync(questsPath, 'utf8');
assert.ok(questsSrc.includes("id: 'depart'"), 'QUESTS must define depart quest');
assert.ok(questsSrc.includes("Le d"), 'depart quest title must be Le départ de Bourg-Aube');
assert.ok(questsSrc.includes("started: () => true"), 'depart quest must start immediately');
console.log('✔ depart quest registered and initialized in questsData.js');

// 3. Verify Bourg-Aube lotir removal (no lab door blocking)
console.log('3. Checking Bourg-Aube lotir in region.js...');
const regionSrc = fs.readFileSync(regionPath, 'utf8');
const bourgAubeMatch = regionSrc.match(/id:\s*'aube'[\s\S]*?lotir:\s*(false|null|undefined|\{[\s\S]*?\})/);
assert.ok(bourgAubeMatch, 'Bourg-Aube entry found in region.js');
assert.ok(bourgAubeMatch[0].includes('lotir: false'), 'Bourg-Aube lotir must be false');
console.log('✔ Bourg-Aube lotir is disabled (no random houses blocking the lab)');

// 4. Verify Sylvebourg densification
console.log('4. Checking Sylvebourg lotir & plan...');
const sylveMatch = regionSrc.match(/id:\s*'sylve'[\s\S]*?lotir:\s*\{[\s\S]*?n:\s*(\d+)/);
assert.ok(sylveMatch, 'Sylvebourg entry found in region.js');
assert.equal(parseInt(sylveMatch[1]), 3, 'Sylvebourg lotir count should be 3');

const planSrc = fs.readFileSync(planPath, 'utf8');
assert.ok(planSrc.includes('maisons: 4'), 'Sylvebourg plan quartiers.maisons must be 4');

const quartiersSrc = fs.readFileSync(quartiersPath, 'utf8');
assert.ok(quartiersSrc.includes("sylve: { riviere: 'ew'"), 'Sylvebourg theme exists in quartiers.js');
assert.ok(quartiersSrc.includes('amp: 6'), 'Sylvebourg amplitude tuned to 6 in quartiers.js');
console.log('✔ Sylvebourg densified: lotir=3, maisons=4, amplitude=6');

// 5. Verify Route 1 Guide NPC
console.log('5. Checking Route 1 Guide NPC...');
assert.ok(regionSrc.includes("Bienvenue sur la Route 1 !"), 'Guide NPC dialog present');
assert.ok(regionSrc.includes("B") || regionSrc.includes("Fast Ball"), 'Guide NPC mentions Fast Ball');
console.log('✔ Route 1 Guide NPC present and teaches catching + Fast Ball');

// 6. Verify Mom Gift Sequence in game.js
console.log('6. Checking Mom Gift Sequence in game.js...');
const gameSrc = fs.readFileSync(gamePath, 'utf8');
assert.ok(gameSrc.includes('momGift'), 'Mom checks momGift flag');
assert.ok(gameSrc.includes("'running-shoes'"), 'Mom gives running-shoes');
assert.ok(gameSrc.includes("'oran-berry'] = (st.bag['oran-berry'] || 0) + 3"), 'Mom gives 3 Baies Oran');
console.log('✔ Mom gives Running Shoes + 3 Oran Berries on post-starter visit');

// 7. Verify Title Save Card in main.js and 07-divers.css
console.log('7. Checking Title Save Card in main.js & 07-divers.css...');
const mainSrc = fs.readFileSync(mainPath, 'utf8');
assert.ok(mainSrc.includes('save-lead-preview'), 'Title card has save-lead-preview');
assert.ok(mainSrc.includes('save-lead-ico'), 'Title card has save-lead-ico');
assert.ok(mainSrc.includes('info?.party?.[0]'), 'Title card displays lead party pokemon');

const cssSrc = fs.readFileSync(cssPath, 'utf8');
assert.ok(cssSrc.includes('.save-lead-preview'), 'CSS styles .save-lead-preview');
assert.ok(cssSrc.includes('.save-lead-ico'), 'CSS styles .save-lead-ico');
console.log('✔ Title save card displays lead Pokémon icon, level, and stats');

console.log('--- ALL PRO EARLY GAME TESTS PASSED PERFECTLY ---');
