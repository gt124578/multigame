// Odyssée — PixelForge : capture des bâtiments en fausse 3D (galerie3d.html), serveur local à la racine du dépôt.
//   node tools/pixelforge/galerie3d-capture.cjs [dossier de sortie] [port]
// Écrit un sprite PNG transparent par bâtiment (sprites/), les vues de la rue et l'intérieur avec escaliers.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || 'galerie3d', PORT = process.argv[3] || 8766;
const SPRITES = [
  // maisons et village
  ['maison_colombage', 'maison', { colombage: true, toit: '#b0503a', mur: '#f4ead2' }], ['maison_rouge', 'maison', {}],
  ['maison_bleue', 'maison', { toit: '#3a68c8', mur: '#efe4cc', fleurs: ['#7aa0f8', '#fafaf2'], volets: '#3a5a9a' }],
  ['maisonL', 'maisonL', {}], ['maisonL_colombage', 'maisonL', { colombage: true, toit: '#a84a32', mur: '#f2e6cc' }],
  ['maison_haute', 'maisonHaute', {}], ['maison_longue', 'maisonLongue', {}], ['maison_extension', 'maisonExt', {}],
  ['residence', 'residence', {}], ['chalet', 'chalet', {}], ['cabane_chasseur', 'cabaneChasseur', {}], ['cabane_pecheur', 'cabanePecheur', {}],
  ['grange', 'grange', {}], ['moulin', 'moulin', {}], ['phare', 'phare', {}], ['auberge', 'auberge', {}], ['chapelle', 'chapelle', {}],
  ['boulangerie', 'boulangerie', {}], ['maison_the', 'maisonThe', {}], ['gare', 'gare', {}], ['kiosque', 'kiosque', {}], ['puits', 'puits', {}], ['etal', 'etal', {}],
  ['mairie', 'mairie', {}], ['fontaine', 'fontaine', {}],
  // services
  ['centre', 'centre', {}], ['boutique', 'boutique', {}], ['labo', 'labo', {}],
  ...['feu', 'eau', 'plante', 'electrik', 'psy', 'dragon', 'glace', 'roche', 'combat', 'spectre'].map((t) => ['arene_' + t, 'arene', { type: t }]),
  ...['feu', 'eau', 'plante', 'electrik', 'psy', 'dragon', 'glace', 'roche', 'combat', 'spectre'].map((t) => ['arene_cour_' + t, 'areneCour', { type: t }]),
  ...'ABCDEFGHIJKLMN'.split('').map((v) => ['pavillon_feu_' + v, 'pavillonFeu', { v }]),
  ...Array.from({ length: 20 }, (_, i) => ['arene_feu_style' + String(i + 1).padStart(2, '0'), 'areneFeu', { style: i + 1 }]),
  // monuments et ville
  ['pagode', 'pagode', {}], ['pagode_cendree', 'pagode', { toit: '#6a6a72', rive: '#3a3a44', bord: '#c8a060', bois: '#7a2a20' }], ['pavillon', 'pavillon', {}],
  ['tour', 'tour', { etages: 8 }], ['tour_verre', 'tourVerre', {}], ['tour_deco', 'tourDeco', {}], ['bourse', 'bourse', {}], ['casino', 'casino', {}], ['ligue', 'ligue', {}],
  ['escalier_montant', 'escalierMontant', {}], ['escalier_descendant', 'escalierDescendant', {}],
  // désert
  ['pyramide', 'pyramide', {}], ['temple_pharaon', 'temple', {}],
];
(async () => {
  fs.mkdirSync(OUT + '/sprites', { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const logs = []; p.on('pageerror', (e) => logs.push('ERR ' + e.message));
  const shot = async (q, file, alpha = false) => {
    await p.goto(`http://localhost:${PORT}/tools/pixelforge/galerie3d.html?${q}`);
    await p.waitForFunction(() => window.done, null, { timeout: 90000 });
    const url = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  };
  for (const [name, b3, o] of SPRITES) {
    const tall = { pagode: '&w=22&h=44&dz=-9', pagode_cendree: '&w=22&h=44&dz=-9', tour: '&h=20&dz=-4', tour_verre: '&w=16&h=60&dz=-16', tour_deco: '&w=14&h=85&dz=-24',
      pyramide: '&w=18&h=26&dz=-3', temple_pharaon: '&w=16&h=20&dz=-3',
      ligue: '&w=36&h=76&dz=-8', casino: '&w=20&h=22&dz=-3', bourse: '&w=18&h=24&dz=-4', phare: '&h=20&dz=-4', maison_haute: '&h=20&dz=-3', kiosque: '&h=16&dz=-2' }[name]
      || (/arene_cour_/.test(name) ? '&w=24&h=40&dz=-7' : /pavillon_feu_/.test(name) ? '&w=24&h=34&dz=-6' : /arene_feu_style/.test(name) ? '&w=20&h=32&dz=-6' : /arene/.test(name) ? '&w=18&h=27&dz=-4.5' : /mairie|labo|pavillon|chapelle|moulin|chalet|grange|gare|auberge/.test(name) ? '&w=18&h=22&dz=-3' : '');
    await shot(`vue=seul&b=${b3}&o=${encodeURIComponent(JSON.stringify(o))}${tall}`, `${OUT}/sprites/${name}.png`, true);
    console.log('sprite', name);
  }
  for (const [cx, n] of [[12, 1], [36, 2], [62, 3]]) { await shot(`vue=rue&cx=${cx}&cz=8`, `${OUT}/rue_haut_${n}.png`); await shot(`vue=rue&cx=${cx}&cz=20`, `${OUT}/rue_bas_${n}.png`); console.log('rue', n); }
  await shot('vue=interieur&w=13&h=9', `${OUT}/interieur_escaliers.png`);
  await shot('vue=village', `${OUT}/village_place.png`);
  await shot('vue=village&cx=17&cz=13&w=34&h=26', `${OUT}/village_large.png`);
  await shot('vue=campagne&cx=25&cz=14&w=50&h=30', `${OUT}/campagne_large.png`);
  await shot('vue=ville&cx=33&cz=-8&w=66&h=84', `${OUT}/ville_large.png`);
  await shot('vue=ville&cx=31&cz=15', `${OUT}/ville_jeu.png`);
  await shot('vue=monument', `${OUT}/pagode_jeu.png`);
  await shot('vue=monument&cx=22&cz=20&w=44&h=44', `${OUT}/pagode_vue_large.png`);
  await shot('vue=ligue&cx=20&cz=15', `${OUT}/ligue_jeu_portail.png`);                   // devant la porte : le bâtiment dépasse l'écran
  await shot('vue=ligue&cx=20&cz=36', `${OUT}/ligue_jeu_colonnade.png`);
  await shot('vue=ligue&cx=20&cz=26&w=40&h=72', `${OUT}/ligue_vue_large.png`);
  console.log(logs.slice(0, 5).join('\n'));
  await b.close();
})();
