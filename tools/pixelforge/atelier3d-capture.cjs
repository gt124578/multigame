// Odyssée — PixelForge : captures de l'Atelier 3D (atelier3d.html) pour regarder un objet sans ouvrir de navigateur.
//   node tools/pixelforge/atelier3d-capture.cjs <dossier> <port> '<json : [{ nom, m, vue, D, contour, … }, …]>'
// Chaque entrée est un état de l'atelier (voir l'adresse #m=…) ; écrit <dossier>/<nom>.png à la taille réelle.
// Serveur local à la racine du dépôt (python3 -m http.server <port>). CHROME_PATH pour un Chrome installé.
const { chromium } = require('playwright');
const fs = require('fs');
const [OUT = '/tmp/atelier3d', PORT = '8766', SPECS = '[]'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  p.on('pageerror', (e) => console.log('ERREUR ' + e.message));
  await p.goto(`http://localhost:${PORT}/tools/pixelforge/atelier3d.html`);
  await p.waitForFunction(() => window.atelier && window.done, null, { timeout: 120000 });
  for (const s of JSON.parse(SPECS)) {
    const { nom, ...etat } = s;
    await p.evaluate((e) => window.atelier.regler(e), { z: 1, ...etat });
    const url = await p.evaluate(() => window.atelier.image());
    fs.writeFileSync(`${OUT}/${nom}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(nom);
  }
  await b.close();
})();
