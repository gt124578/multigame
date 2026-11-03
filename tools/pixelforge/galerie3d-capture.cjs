// Odyssée — PixelForge : capture des bâtiments en fausse 3D (galerie3d.html), serveur local à la racine du dépôt.
//   node tools/pixelforge/galerie3d-capture.cjs [dossier de sortie] [port]
// Écrit un sprite PNG transparent par bâtiment (sprites/), les vues de la rue et l'intérieur avec escaliers.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || 'galerie3d', PORT = process.argv[3] || 8766;
const SPRITES = [
  ['maison_rouge', 'maison', {}], ['maison_bleue', 'maison', { toit: '#3a68c8', mur: '#efe4cc', fleurs: ['#7aa0f8', '#fafaf2'] }],
  ['maison_verte', 'maison', { toit: '#4a9a4a', mur: '#f4ecd8', fleurs: ['#f08ac0', '#fafaf2'] }],
  ['maison_longue', 'maisonLongue', {}], ['maison_longue_bois', 'maisonLongue', { bardage: '#c8a070', toit: '#7a3a2a' }],
  ['residence', 'residence', {}], ['residence_bleue', 'residence', { mur: '#e8eef4', toit: '#3a4a6a' }],
  ['centre', 'centre', {}], ['boutique', 'boutique', {}], ['labo', 'labo', {}],
  ['arene_feu', 'arene', { acc: '#e07030' }], ['arene_eau', 'arene', { acc: '#3a8ce0', pierre: '#b8bec8' }], ['arene_plante', 'arene', { acc: '#58c060', pierre: '#c8c0a8' }],
  ['arene_electrik', 'arene', { acc: '#e8c030', pierre: '#c4c4c4' }], ['arene_psy', 'arene', { acc: '#d060c0', pierre: '#d0c8d8' }], ['arene_dragon', 'arene', { acc: '#6a50d0', pierre: '#9a96a8' }],
  ['ligue', 'ligue', {}], ['pagode', 'pagode', {}], ['pavillon', 'pavillon', {}], ['tour', 'tour', { etages: 8 }],
  ['escalier_montant', 'escalierMontant', {}], ['escalier_descendant', 'escalierDescendant', {}],
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
    const tall = /tour|pagode|ligue|pavillon/.test(name) ? '&h=18&dz=-3' : '';
    await shot(`vue=seul&b=${b3}&o=${encodeURIComponent(JSON.stringify(o))}${tall}`, `${OUT}/sprites/${name}.png`, true);
    console.log('sprite', name);
  }
  for (const [cx, n] of [[12, 1], [33, 2], [52, 3]]) { await shot(`vue=rue&cx=${cx}&cz=9`, `${OUT}/rue_haut_${n}.png`); await shot(`vue=rue&cx=${cx}&cz=16`, `${OUT}/rue_bas_${n}.png`); console.log('rue', n); }
  await shot('vue=interieur&w=13&h=9', `${OUT}/interieur_escaliers.png`);
  console.log(logs.slice(0, 5).join('\n'));
  await b.close();
})();
