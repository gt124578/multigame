// Odyssée — PixelForge : essai en jeu du sol généré. Lance le vrai jeu (sans rien modifier), pose la texture cuite par
// bake.py juste au-dessus du sol d'origine (sous les arbres, barrières, rochers, parois, bâtiments, ombres) et prend
// une capture avant / après à chaque endroit.
//   (serveur : python3 -m http.server 8765 à la racine du dépôt, textures dans _essai/)
//   node tools/pixelforge/essai-jeu.cjs /tmp/essai
const { chromium } = require('playwright');
const OUT = process.argv[2] || '/tmp/essai';
const SCENES = [
  ['monde', 36, 208, 'route1'], ['monde', 30, 212, 'route1_sud'], ['monde', 30, 159, 'ville'], ['monde', 52, 213, 'pont'],
  ['grotte', 23, 16, 'grotte'], ['marees', 21, 20, 'marees'],
];
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 200)));
  await p.goto('http://localhost:8765/odyssee/index.html');
  await p.waitForFunction(() => window.__ody && window.__ody.game, null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  for (const [map, x, y, name] of SCENES) {
    await p.evaluate(async ([map, x, y]) => {
      const g = window.__ody.game, m = g.world.maps[map]; m.dark = false;
      const s = g.newState('Test', 'm'); s.map = map; s.flags.intro = true; s.x = x; s.y = y;
      await window.__ody.play(s); g.hourOverride = 12; g.view.setTimeOfDay(12);
    }, [map, x, y]);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/${name}_avant.png` });
    await p.evaluate(async (map) => {
      const THREE = await import('three');
      const v = window.__ody.view, meta = await (await fetch(`../_essai/${map}.json`)).json();
      const img = new Image(); img.src = `../_essai/${map}.png`; await img.decode();
      const t = new THREE.Texture(img); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5 }); mat.color.copy(v.tint);
      const geo = new THREE.PlaneGeometry(meta.w, meta.h); geo.rotateX(-Math.PI / 2);
      const me = new THREE.Mesh(geo, mat); me.position.set(meta.x0 + meta.w / 2, 0.006, meta.y0 + meta.h / 2); me.frustumCulled = false;
      v.root.add(me);
    }, map);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/${name}_apres.png` });
    console.log('ok', name);
  }
  await b.close();
})();
