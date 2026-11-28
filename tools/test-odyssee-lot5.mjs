// tools/test-odyssee-lot5.mjs — tests de régression Lot 5 (Ton Nintendo, localisation FR, choix 1A/2A/3A/4A, pluriels, monde & PNJ)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

function walkJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Retire les commentaires JS // et /* ... * / en préservant les chaînes/templates simples */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\' && i + 1 < src.length) { out += src[i + 1]; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
    i++;
  }
  return out;
}

console.log('=== Tests de régression Lot 5 ===');

// 1. Chaînes interdites (anglicismes, bugs FR, 4e mur, vouvoiement combat/SAC/carte) hors commentaires
{
  const forbidden = [
    'mone ', 'Baie Prun', 'Balle GS', 'Pokégear', 'Mesprit', 'Pr Orme',
    'que Odyssor', 'de Apitrini', '**exclusivement', 'heure de ton ordinateur',
    'Premier Sang', 'Flambeur de Métropole', 'S&P Odyssée 500', 'Pokéeuro',
    "Texas Hold'em", 'Vous prenez', 'Vous utilisez', 'Vous lancez',
    'Vous avez battu', 'Vous abandonnez', 'Vous retirez', 'Vous y êtes',
    'Votre position', 'vaches Écrémeuh', 'Mon chat',
  ];
  const files = walkJs('odyssee/js').filter((f) => path.basename(f) !== 'monde-cache.js');
  for (const file of files) {
    const code = stripComments(fs.readFileSync(file, 'utf8')).replace(/\\(['"])/g, '$1');
    for (const needle of forbidden) {
      assert.equal(code.includes(needle), false, `Chaîne interdite "${needle}" trouvée dans ${file}`);
    }
  }
  console.log(`✓ Aucune chaîne interdite dans ${files.length} fichiers JS`);
}

// 2. itemPluralName et ITEMS (noms, descriptions Badges/Ball/Baies)
{
  const { ITEMS, itemPluralName } = await import('../odyssee/js/core/items.js');
  assert.equal(itemPluralName('fire-stone', 2), '2 Pierres Feu');
  assert.equal(itemPluralName('oran-berry', 3), '3 Baies Oran');
  assert.equal(itemPluralName('oran-berry', 1), 'Baie Oran');
  assert.equal(itemPluralName('full-heal', 2), '2 Total Soin');
  assert.equal(itemPluralName('escape-rope', 2), '2 Cordes Sortie');
  assert.equal(itemPluralName('mystic-water', 2), '2 Eaux Mystiques');
  assert.equal(itemPluralName('max-potion', 2), '2 Potions Max');
  assert.equal(itemPluralName('poke-ball', 5), '5 Poké Balls');
  assert.equal(itemPluralName('rare-candy', 3), '3 Super Bonbons');

  assert.equal(ITEMS['lum-berry'].name, 'Baie Prine');
  assert.equal(ITEMS['gs-ball'].name, 'GS Ball');
  assert.match(ITEMS['cs-vol'].desc, /Badge Mirage/);
  assert.match(ITEMS['sifflet-celeste'].desc, /Badge Mirage/);
  console.log('✓ itemPluralName & ITEMS conformes au français officiel');
}

// 3. Accords des baies de soin (il/elle selon le genre de l'altération)
{
  const { NOUVEAUX_OBJETS } = await import('../odyssee/js/data/baies-objets.js');
  for (const k of ['chesto-berry', 'pecha-berry', 'aspear-berry']) {
    assert.match(NOUVEAUX_OBJETS[k].desc, /dès qu'il survient/, `${k} doit accorder au masculin`);
  }
  for (const k of ['cheri-berry', 'rawst-berry', 'persim-berry']) {
    assert.match(NOUVEAUX_OBJETS[k].desc, /dès qu'elle survient/, `${k} doit accorder au féminin`);
  }
  console.log('✓ Accords des baies de soin OK');
}

// 4. Catégories Pokédex (genus) & Trophées (titres + rétrocompatibilité Erèbe/Érèbe)
{
  const { CREATURES } = await import('../odyssee/js/data/creatures.js');
  const entries = Object.values(CREATURES);
  assert.equal(entries.length, 60, '60 créatures originales attendues dans creatures.js');
  for (const sp of entries) {
    assert.equal(sp.genus.startsWith('Pokémon '), true, `genus invalide pour ${sp.n}: ${sp.genus}`);
    assert.equal(sp.genus.includes('Créature'), false, `genus contient Créature pour ${sp.n}`);
  }

  const { TROPHIES_CATALOG, checkAllTrophies } = await import('../odyssee/js/core/trophies.js');
  const byId = Object.fromEntries(TROPHIES_CATALOG.map((t) => [t.id, t]));
  assert.equal(byId.pvp_first_win.title, 'Première Victoire');
  assert.equal(byId.casino_coins_1000.title, 'As des Jetons');
  assert.equal(byId.donjon_crypte.title, 'Gardien des Esprits');

  assert.equal(byId.boss_eclipse.check({ boss: { 'Erèbe': true, 'Nyx': true, 'Nocturne': true }, flags: {} }).done, true, 'Compat ancienne clé Erèbe');
  assert.equal(byId.boss_eclipse.check({ boss: { 'Érèbe': true, 'Nyx': true, 'Nocturne': true }, flags: {} }).done, true, 'Clé Érèbe');

  const stOld = { boss: { 'Erèbe': true, 'Nyx': true, 'Nocturne': true }, flags: {}, dex: { caught: [], seen: [] }, party: [], box: [], bag: {} };
  const unlockedOld = checkAllTrophies(stOld);
  assert.equal(unlockedOld.some((t) => t.id === 'boss_eclipse'), true, 'checkAllTrophies débloque boss_eclipse avec Erèbe');
  console.log('✓ Genus Pokédex (60/60) et trophées + compat Erèbe/Érèbe OK');
}

// 5. Choix créatifs 1A / 2A / 3A / 4A préservés
{
  // 1A : Dojo de Mamadou & Mascotte bouc conservés, sans **exclusivement / (F3) / 2v2 / 3v3
  const dojoCode = stripComments(fs.readFileSync('odyssee/js/dojo-mamadou.js', 'utf8'));
  const interiorsCode = stripComments(fs.readFileSync('odyssee/js/world/interiors.js', 'utf8'));
  const multiCode = stripComments(fs.readFileSync('odyssee/js/multi-events.js', 'utf8'));
  assert.match(dojoCode, /Mamadou/);
  assert.match(dojoCode, /bouc/);
  assert.match(interiorsCode, /Mamadou/);
  assert.match(interiorsCode, /bouc/);
  for (const [label, src] of [['dojo-mamadou.js', dojoCode], ['interiors.js', interiorsCode], ['multi-events.js', multiCode]]) {
    for (const bad of ['**exclusivement', '(F3)', '2v2', '3v3']) {
      assert.equal(src.includes(bad), false, `${label} contient encore "${bad}"`);
    }
  }

  // 2A : Bourse quant conservée avec Indice Odyssée 500 et Écu de Kalos (₭)
  const bourse = await import('../odyssee/js/core/bourse.js');
  assert.equal(typeof bourse.blackScholes, 'function');
  assert.equal(typeof bourse.americaine, 'function');
  assert.equal(typeof bourse.asiatique, 'function');
  assert.equal(bourse.INDICE.nom, 'Indice Odyssée 500');
  assert.match(bourse.FX.nom, /Écu de Kalos \(₭\)/);

  // 3A : Casino renommé sans géographie réelle dans les titres
  const pokerSrc = stripComments(fs.readFileSync('odyssee/js/ui/casino/poker.js', 'utf8'));
  const rouletteSrc = stripComments(fs.readFileSync('odyssee/js/ui/casino/roulette.js', 'utf8'));
  assert.match(pokerSrc, /Hold\\?'em de Métropole/);
  assert.match(rouletteSrc, /Roue d\\?'Odyssée/);

  // 4A : Clins d'oeil intacts (Relique de Triforce & RESIDENTS du Domaine)
  const donjonsImg = fs.readFileSync('odyssee/js/donjons/images.js', 'utf8');
  assert.match(donjonsImg, /Relique de Triforce/);
  const { RESIDENTS } = await import('../odyssee/js/world/domaine.js');
  assert.equal(Array.isArray(RESIDENTS) && RESIDENTS.length >= 10, true, 'RESIDENTS du Domaine intacts');
  console.log('✓ Choix 1A, 2A, 3A, 4A préservés OK');
}

// 6. Monde : maisons post-Drakos, genre Championne, sprites, unicité dresseurs, pause battleView
{
  const { buildWorld, LEADERS } = await import('../odyssee/js/world/region.js');
  const W = buildWorld();

  // Maisons de l'Archipel dynamiques après Drakos (badge index 7)
  const archHouses = [];
  for (const prefix of ['granit:', 'cendre:', 'ecaille:']) {
    for (const [mid, m] of Object.entries(W.maps)) {
      if (!mid.startsWith(prefix)) continue;
      for (const n of m.npcs) {
        if (typeof n.text === 'function') {
          const before = n.text({ badges: Array(15).fill(false), flags: {} });
          const after = n.text({ badges: Object.assign(Array(15).fill(false), { 7: true }), flags: {} });
          assert.notDeepEqual(before, after, `Dialogue dynamique inchangé après Drakos pour ${mid}`);
          archHouses.push(mid);
        }
      }
    }
  }
  assert.equal(archHouses.length >= 5, true, `Attendu >= 5 PNJ dynamiques post-Drakos dans l'archipel (trouvé ${archHouses.length})`);

  // Genre des Championnes et dresseurs d'arènes
  const femLeaderNames = new Set(LEADERS.filter((L) => L.fem || ['Marine', 'Volta', 'Flora', 'Sibylle', 'Margot', 'Morgane', 'Lilas'].includes(L.name)).map((L) => L.name));
  for (const t of Object.values(W.towns)) {
    if (!t.gymMap) continue;
    const leaderNpc = t.gymMap.npcs.find((n) => n.leader != null);
    assert.ok(leaderNpc, `Leader manquant dans ${t.gymMap.id}`);
    const isFem = femLeaderNames.has(leaderNpc.trainer.name);
    assert.equal(leaderNpc.trainer.cls, isFem ? 'Championne' : 'Champion', `Classe incorrecte pour ${leaderNpc.trainer.name}`);
    for (const n of t.gymMap.npcs) {
      if (!n.trainer || n.leader != null) continue;
      const blob = JSON.stringify([n.trainer.intro, n.trainer.after]);
      if (isFem) {
        assert.equal(/\bChampion\b(?!ne)/.test(blob), false, `Masculin "Champion" chez ${n.trainer.name} dans l'arène féminine ${t.gymMap.id}`);
        assert.match(blob, /Championne/, `Championne attendu chez ${n.trainer.name} dans ${t.gymMap.id}`);
      } else {
        assert.equal(/Championne/.test(blob), false, `Féminin "Championne" chez ${n.trainer.name} dans l'arène masculine ${t.gymMap.id}`);
      }
    }
  }

  // Sprites corrigés
  const gsNpc = W.maps['sylve:house15']?.npcs.find((n) => n.id === 'gs');
  assert.equal(gsNpc?.sprite, 'dame', 'Vieille dame GS Ball doit utiliser le sprite dame');
  const amayaNpc = W.maps['grue:doyenne']?.npcs.find((n) => n.id === 'doyenne');
  assert.equal(amayaNpc?.sprite, 'dame', 'Doyenne Amaya doit utiliser le sprite dame');
  const marches = W.maps.monde.npcs.filter((n) => n.script === 'marche');
  assert.equal(marches.length >= 8, true);
  for (const n of marches) {
    assert.equal(n.sprite, 'habitante', `Marchande ${n.id} doit utiliser le sprite habitante`);
  }

  // Unicité des dresseurs fixes (hors antagonistes récurrents) & exclusivité des noms de Champions
  const RECURRING_VILLAINS = new Set(['Sbire', 'de la Team Éclipse', 'Nyx', 'Érèbe', 'Nocturne']);
  const isProc = (id) => /^((bois|r\w+):(d|e)\d+|lieu:[^:]+:d\d+)$/.test(id || '');
  const fixedNames = new Map();
  const leaderNames = new Set(LEADERS.map((L) => L.name));

  for (const [mid, m] of Object.entries(W.maps)) {
    for (const n of m.npcs) {
      if (!n.trainer?.name) continue;
      const name = n.trainer.name;
      if (n.leader == null) {
        assert.equal(leaderNames.has(name), false, `Nom de Champion "${name}" réutilisé par ${mid}:${n.id}`);
      }
      if (!isProc(n.id) && !RECURRING_VILLAINS.has(name)) {
        assert.equal(fixedNames.has(name), false, `Doublon de dresseur fixe "${name}": ${fixedNames.get(name)} vs ${mid}:${n.id}`);
        fixedNames.set(name, `${mid}:${n.id}`);
      }
    }
  }

  // Dresseurs procéduraux : accord du prénom au genre de la classe + zéro chevauchement avec les dresseurs fixes/Champions
  const { PRENOMS, PRENOMS_M, PRENOMS_F } = await import('../odyssee/js/world/voix.js');
  const setM = new Set(PRENOMS_M), setF = new Set(PRENOMS_F), setAllProc = new Set(PRENOMS);
  const femClasses = new Set(['Fillette', 'Randonneuse', 'Topdresseuse']);
  let procChecked = 0;
  for (const [mid, m] of Object.entries(W.maps)) {
    for (const n of m.npcs) {
      if (!n.trainer?.name) continue;
      if (isProc(n.id)) {
        procChecked++;
        const isFemCls = femClasses.has(n.trainer.cls);
        assert.equal(isFemCls ? setF.has(n.trainer.name) : setM.has(n.trainer.name), true,
          `Prénom procédural mal accordé : ${mid}:${n.id} (${n.trainer.cls} :: ${n.trainer.name})`);
      } else {
        assert.equal(setAllProc.has(n.trainer.name), false,
          `Chevauchement PRENOMS avec dresseur fixe : ${mid}:${n.id} (${n.trainer.name})`);
      }
    }
  }
  assert.equal(procChecked >= 150, true, `Attendu >= 150 dresseurs procéduraux (trouvé ${procChecked})`);

  // Regex de pause fin de combat dans ui/battleView.js
  const bvSrc = fs.readFileSync('odyssee/js/ui/battleView.js', 'utf8');
  const m = bvSrc.match(/case 'msg':[^\n]*\/([^/]+)\/\.test\(e\.text\)/);
  assert.ok(m, 'Regex de pause case msg introuvable dans battleView.js');
  const pauseRe = new RegExp(m[1]);
  assert.equal(pauseRe.test('Tu remportes le combat !'), true, 'pauseRe doit matcher "remportes"');
  assert.equal(pauseRe.test('Tu perds connaissance dans la panique...'), true, 'pauseRe doit matcher "perds"');
  assert.equal(pauseRe.test("Tu n'as plus de Pokémon en forme !"), true, 'pauseRe doit matcher "en forme"');

  console.log(`✓ Monde, archipel post-Drakos, genres d'arène, sprites, ${fixedNames.size} dresseurs fixes uniques et ${procChecked} procéduraux accordés OK`);
}

// 7. Portraits : aucune image inscrite n'est absente, et les bustes de dialogue encore attendus retombent sur un dessin présent
{
  const { SPRITES } = await import('../odyssee/js/data/sprites.js');
  const la = (f) => fs.existsSync(path.join('odyssee/img', f));
  for (const k of SPRITES.portraits) { assert.ok(la(`portraits/${k}.png`), `portraits/${k}.png inscrit mais absent`); assert.ok(la(`portraits/${k}-l.png`), `portraits/${k}-l.png inscrit mais absent`); }
  for (const k of SPRITES.bustes || []) assert.ok(la(`portraits/${k}-l.png`), `buste portraits/${k}-l.png inscrit mais absent`);
  for (const k of SPRITES.dresseurs) assert.ok(la(`dresseurs/${k}.png`), `dresseurs/${k}.png inscrit mais absent`);
  // les sept Champions du Sud, Pierre et les trois de la Brume : tant que leur buste n'est pas inscrit (portraits ou bustes),
  // le dialogue montre leur dessin de combat, qui doit donc exister
  const peints = new Set([...SPRITES.portraits, ...(SPRITES.bustes || [])]), dessins = new Set(SPRITES.dresseurs);
  for (const k of ['margot', 'aurele', 'morgane', 'gaspard', 'ferdinand', 'lilas', 'corbin', 'pierre', 'sylas', 'ariane', 'nox']) assert.ok(peints.has(k) || dessins.has(k), `${k} : ni buste peint ni dessin de combat pour le dialogue`);
  console.log('✓ Portraits : images inscrites présentes, repli des bustes attendus OK');
}

console.log('Tous les tests Lot 5 ont réussi.');
