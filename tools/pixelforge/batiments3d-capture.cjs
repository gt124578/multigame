// Capture du prototype de bâtiments 3D (serveur local sur 8766 à la racine du dépôt) : node tools/pixelforge/batiments3d-capture.cjs /tmp/sortie
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 896 } });
  const logs = []; p.on('console', (m) => logs.push(m.text().slice(0, 300))); p.on('pageerror', (e) => logs.push('ERR ' + e.message));
  for (const [hd, cx, name] of [[0, 12.5, 'village_32'], [1, 12.5, 'village_64'], [0, 31, 'arene_32'], [1, 31, 'arene_64']]) {
    await p.goto(`http://localhost:8766/tools/pixelforge/batiments3d.html?hd=${hd}&cx=${cx}&cz=9.5`);
    await p.waitForFunction(() => window.done, null, { timeout: 60000 }).catch(() => logs.push('timeout'));
    await p.waitForTimeout(300);
    await p.locator('canvas').screenshot({ path: `${process.argv[2] || '.'}/${name}.png` });
    console.log('ok', name);
  }
  console.log(logs.slice(0, 8).join('\n'));
  await b.close();
})();
