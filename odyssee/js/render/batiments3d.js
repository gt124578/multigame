// Odyssée — PixelForge / modèles 3D des bâtiments (fausse 3D façon HeartGold / SoulSilver : volumes simples, textures
// pixel art à D px par unité, éclairage en paliers nets). Chaque modèle tient dans l'emprise du jeu (w × d cases, porte
// de 1 ou 2 cases de large sur la façade sud) ; les hauteurs sont en cases « à plat », étirées de tan(EL) par l'appelant.
import * as THREE from 'three';

export function atelier(D) {
  /* -------------------------------------------------------------- textures ------------------------------------------ */
  const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 974711) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const hex = (c) => c[0] === '#' ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : c.match(/\d+/g).map(Number);
  const mix = (c, f) => { const [r, g, b] = hex(c); const m = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return `rgb(${m(r)},${m(g)},${m(b)})`; };
  const S = D / 32, cache = new Map();
  const NETTES = new Set(['verre', 'croix', 'sac', 'etals', 'sol', 'shoji', 'pagodeMur']);
  function tex(key, w, h, draw, rep = true) {
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    draw(g, px, w, h);
    if (!NETTES.has(key)) {
      // douceur : on rapproche chaque pixel de la teinte moyenne de la texture (motif gardé, contraste divisé par ~2)
      const im = g.getImageData(0, 0, w, h), d = im.data, n = w * h, moy = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { moy[0] += d[i]; moy[1] += d[i + 1]; moy[2] += d[i + 2]; }
      for (let k = 0; k < 3; k++) moy[k] /= n;
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.round(moy[k] + (d[i + k] - moy[k]) * 0.55);
      g.putImageData(im, 0, 0);
    }
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.cle = key; cache.set(key, t); return t;
  }
  const TX = {
    enduit: (col) => tex('e' + col, D, D, (g, px, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = hash(x, y, 1); if (u < 0.06) px(x, y, mix(col, -0.07)); else if (u > 0.96) px(x, y, mix(col, 0.25)); } }),
    tuiles: (col) => tex('t' + col, D, D, (g, px, w, h) => {
      const rh = 8 * S, tw = 10 * S;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const row = Math.floor(y / rh), ly = y % rh, lx = (x + (row % 2) * tw / 2) % tw;
        let f = 0; if (ly < S) f = 0.25; if (ly > rh * 0.7) f = -0.25; if (lx < S && ly < rh * 0.8) f = -0.3;
        if (ly >= rh - S) f = -0.45; if (ly > rh * 0.55 && (lx < 1.5 * S || lx > tw - 1.5 * S)) f = -0.4;
        if (hash(Math.floor((x + (row % 2) * tw / 2) / tw), row, 3) < 0.15 && f === 0) f = 0.12;
        px(x, y, mix(col, f));
      }
    }),
    // tuiles rondes des toits de pagode : rangées verticales de tuiles canal
    canal: (col) => tex('c' + col, D, D, (g, px, w, h) => { const tw = 5 * S; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lx = x % tw, ly = y % (8 * S); let f = lx < S ? -0.4 : lx < 2 * S ? 0.22 : lx > tw - 1.5 * S ? -0.18 : 0.05; if (ly === 0) f -= 0.25; px(x, y, mix(col, f)); } }),
    ardoise: (col = '#3c4354') => tex('a' + col, D, D, (g, px, w, h) => { const rh = 6 * S, tw = 8 * S; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const row = Math.floor(y / rh), ly = y % rh, lx = (x + (row % 2) * tw / 2) % tw; let c = hash(Math.floor((x + (row % 2) * tw / 2) / tw), row, 5) < 0.3 ? mix(col, 0.1) : col; if (ly === 0) c = mix(col, 0.28); if (ly >= rh - S || lx < S) c = mix(col, -0.35); px(x, y, c); } }),
    tole: (col) => tex('o' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lx = x % (8 * S); px(x, y, mix(col, lx < S ? 0.25 : lx < 2 * S ? 0.1 : lx > 6 * S ? -0.2 : 0)); } }),
    pierre: (col = '#c8c2b6') => tex('p' + col, D, D, (g, px, w, h) => { const rh = 8 * S, tw = 16 * S; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const row = Math.floor(y / rh), ly = y % rh, lx = (x + (row % 2) * tw / 2) % tw; const id = hash(Math.floor((x + (row % 2) * tw / 2) / tw), row, 7); let c = mix(col, id < 0.3 ? -0.06 : id < 0.7 ? 0 : 0.05); if (ly < S || lx < S) c = mix(col, 0.18); if (ly >= rh - S || lx >= tw - S) c = mix(col, -0.3); px(x, y, c); } }),
    marbre: () => tex('marbre', D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = Math.sin((x + y * 0.6) / (5 * S) + hash(x >> 2, y >> 2, 4) * 2); px(x, y, v > 0.92 ? '#c8c4d2' : (x % (16 * S) === 0 || y % (16 * S) === 0) ? '#d4d0dc' : '#f2f0f6'); } }),
    bois: (col = '#8e5c36') => tex('b' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lx = x % (6 * S); px(x, y, lx < S ? mix(col, -0.45) : hash(x >> 1, y >> 3, 9) < 0.15 ? mix(col, -0.15) : col); } }),
    bardage: (col) => tex('g' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ly = y % (6 * S); px(x, y, ly < S ? mix(col, 0.2) : ly >= 5 * S ? mix(col, -0.3) : hash(x >> 2, y, 2) < 0.04 ? mix(col, -0.1) : col); } }),
    verre: () => tex('verre', D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = y / h, d = (x + y) % Math.round(22 * S); px(x, y, d < 2 * S ? '#d8ecff' : d < 4 * S ? '#9cc0e8' : t < 0.5 ? '#5a7cb0' : '#36507a'); } }, false),
    // mur-rideau des tours de ville : fenêtres en grille, quelques-unes allumées
    rideau: (col) => tex('r' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lx = x % (8 * S), ly = y % (10 * S), cell = hash(Math.floor(x / (8 * S)), Math.floor(y / (10 * S)), 6); let c = lx < S || ly < 2 * S ? col : cell > 0.85 ? '#f4e2a0' : (lx + ly) % Math.round(9 * S) < S ? '#a8c8ec' : ly > 6 * S ? '#2e4870' : '#45689c'; px(x, y, c); } }),
    laque: (col) => tex('l' + col, D, D, (g, px, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x % (8 * S) < S) px(x, y, mix(col, -0.3)); }),
    shoji: () => tex('shoji', D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, x % (8 * S) < S || y % (8 * S) < S ? '#6a3a20' : '#f4ecd6'); }),
    etals: () => tex('etals', 2 * D, D, (g, px, w, h) => { g.fillStyle = '#36507a'; g.fillRect(0, 0, w, h); const C = ['#e24a4a', '#f6d84a', '#7aa0f8', '#7acc6a', '#f08ac0', '#f8a040', '#ffffff']; for (const sy of [0.33, 0.66, 0.97]) { const y0 = Math.round(sy * h); g.fillStyle = '#5a3a22'; g.fillRect(0, y0 - S, w, 2 * S); let x = 2; while (x < w - 2) { const ww = Math.round((3 + hash(x, y0, 2) * 3) * S), hh = Math.round((5 + hash(x, y0, 3) * 4) * S); g.fillStyle = C[Math.floor(hash(x, y0, 4) * C.length)]; g.fillRect(x, y0 - S - hh, ww, hh); x += ww + S; } } }, false),
    store: (col) => tex('s' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, Math.floor(x / (8 * S)) % 2 ? '#f4f4f6' : col); }),
    croix: () => tex('croix', D, D, (g, px, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8343a'; g.fillRect(w * 0.38, h * 0.16, w * 0.24, h * 0.68); g.fillRect(w * 0.16, h * 0.38, w * 0.68, h * 0.24); }, false),
    sac: () => tex('sac', D, D, (g, px, w, h) => { g.fillStyle = '#284a9c'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(w * 0.28, h * 0.4, w * 0.44, h * 0.42); g.fillRect(w * 0.36, h * 0.24, w * 0.06, h * 0.18); g.fillRect(w * 0.58, h * 0.24, w * 0.06, h * 0.18); g.fillRect(w * 0.36, h * 0.24, w * 0.28, h * 0.05); }, false),
    panneauSolaire: () => tex('sol', D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, x % (8 * S) < S || y % (8 * S) < S ? '#c8ccd4' : (x + y) % (10 * S) < 2 * S ? '#4a6aa8' : '#1e2c54'); }),
    parquet: () => tex('parquet', D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ly = y % (8 * S), off = Math.floor(y / (8 * S)) % 2 ? 12 * S : 0; const lx = (x + off) % (24 * S); px(x, y, ly < S || lx < S ? '#7a4e2c' : hash(Math.floor((x + off) / (24 * S)), Math.floor(y / (8 * S)), 8) < 0.4 ? '#c08a56' : '#b07c4a'); } }),
  };

  /* -------------------------------------------------------------- matériaux, primitives ----------------------------- */
  const paliers = (() => { const d = new Uint8Array([135, 180, 222, 255]); const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
  const M = (o) => new THREE.MeshToonMaterial({ gradientMap: paliers, ...o });
  const COL = (c) => M({ color: new THREE.Color(c) });
  const LUM = (c, e) => M({ color: new THREE.Color(c), emissive: new THREE.Color(e) });
  function boite(w, h, d, mat) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
  }
  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  const cyl = (r1, r2, h, mat, n = 12) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, n), mat); m.castShadow = m.receiveShadow = true; return m; };

  function fenetre(G, x, y, z, w, h, cadre, volets = null, fleurs = null) {
    G.add(at(boite(w, h, 0.02, M({ map: TX.verre() })), x, y, z + 0.005));
    for (const [dx, dy, ww, hh] of [[0, h / 2, w + 0.12, 0.06], [0, -h / 2, w + 0.12, 0.06], [-w / 2, 0, 0.06, h], [w / 2, 0, 0.06, h], [0, 0, 0.04, h], [0, 0, w, 0.04]])
      G.add(at(boite(ww, hh, 0.08, cadre), x + dx, y + dy, z + 0.04));
    G.add(at(boite(w + 0.24, 0.06, 0.18, cadre), x, y - h / 2 - 0.05, z + 0.09));
    if (volets) for (const s of [-1, 1]) G.add(at(boite(w * 0.42, h + 0.06, 0.05, volets), x + s * (w / 2 + w * 0.24), y, z + 0.03));
    if (fleurs) {
      G.add(at(boite(w + 0.1, 0.12, 0.16, COL('#7a4e2c')), x, y - h / 2 - 0.14, z + 0.12));
      for (let i = 0; i < 7; i++) G.add(at(boite(0.08, 0.08, 0.08, COL(fleurs[i % fleurs.length])), x - w / 2 + 0.08 + i * (w / 6.5), y - h / 2 - 0.04, z + 0.13 + (i % 2) * 0.04));
    }
  }
  /** porte de bois d'une case de large (0,75) posée sur un socle de hauteur y0 */
  function porte(G, x, z, y0, h, mat, cadre, w = 0.75) {
    G.add(at(boite(w, h, 0.03, mat), x, h / 2 + y0, z + 0.01));
    for (const [dx, dy, ww, hh] of [[0, h + 0.04, w + 0.2, 0.08], [-w / 2 - 0.05, h / 2, 0.08, h], [w / 2 + 0.05, h / 2, 0.08, h]]) G.add(at(boite(ww, hh, 0.1, cadre), x + dx, dy + y0, z + 0.03));
    G.add(at(boite(0.05, 0.05, 0.05, COL('#f0d060')), x + w * 0.3, h * 0.5 + y0, z + 0.04));
    if (y0 > 0.05) { G.add(at(boite(w + 0.5, 0.15, 0.4, M({ map: TX.pierre() })), x, y0 - 0.08, z + 0.2)); G.add(at(boite(w + 0.7, y0 - 0.15 > 0 ? 0.15 : y0, 0.5, M({ map: TX.pierre() })), x, 0.07, z + 0.3)); }
  }
  /** portes vitrées coulissantes (largeur w, 2 cases = 1,7) */
  function portesVitrees(G, x, z, w, h, cadre) {
    G.add(at(boite(w, h, 0.03, M({ map: TX.verre() })), x, h / 2, z + 0.01));
    for (const dx of [-w / 2, 0, w / 2]) G.add(at(boite(0.07, h, 0.08, cadre), x + dx, h / 2, z + 0.04));
    G.add(at(boite(w + 0.1, 0.08, 0.08, cadre), x, h, z + 0.04));
    G.add(at(boite(w + 0.4, 0.04, 0.5, COL('#b8b4aa')), x, 0.02, z + 0.25));   // paillasson / seuil
  }
  /** toit à deux pans, faîtage le long de x, débord deb, pignons */
  function toit2(G, x0, x1, z0, z1, y, hr, mat, pignon, deb = 0.28, faite = '#5a3a2a') {
    const w = x1 - x0 + 2 * deb, dz = (z1 - z0) / 2 + deb, L = Math.hypot(dz, hr), a = Math.atan2(hr, dz), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const s of [-1, 1]) { const p = boite(w, 0.1, L, mat); p.rotation.x = s * a; at(p, cx, y + hr / 2 + 0.05, cz + s * dz / 2); G.add(p); }
    G.add(at(boite(w, 0.12, 0.16, COL(faite)), cx, y + hr + 0.08, cz));
    const sh = new THREE.Shape(); sh.moveTo(-(z1 - z0) / 2, 0); sh.lineTo((z1 - z0) / 2, 0); sh.lineTo(0, hr); sh.closePath();
    for (const xx of [x0 + 0.01, x1 - 0.01]) { const gm = new THREE.Mesh(new THREE.ShapeGeometry(sh), pignon); gm.rotation.y = Math.PI / 2 * (xx < cx ? -1 : 1); gm.position.set(xx, y, cz); gm.castShadow = true; G.add(gm); }
  }
  /** toit arrondi (voûte en demi-ellipse, axe le long de x) : x0 → x1, profondeur z0 → z1, hauteur hr, débord deb */
  function voute(G, x0, x1, z0, z1, y, hr, mat, bout, deb = 0.25) {
    const a = (z1 - z0) / 2 + deb, sh = new THREE.Shape(), n = 20;
    sh.moveTo(-a, 0); for (let i = 1; i <= n; i++) { const th = Math.PI * i / n; sh.lineTo(-a * Math.cos(th), hr * Math.sin(th)); }
    sh.lineTo(-a, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0 + 2 * deb, bevelEnabled: false, curveSegments: n });
    const m = new THREE.Mesh(g, [bout, mat]); m.castShadow = m.receiveShadow = true;
    m.rotation.y = Math.PI / 2; m.position.set(x0 - deb, y, (z0 + z1) / 2); G.add(m);
    // bordure de la voûte (gouttière) devant et derrière
    for (const s of [-1, 1]) G.add(at(boite(x1 - x0 + 2 * deb, 0.1, 0.12, bout), (x0 + x1) / 2, y + 0.04, (z0 + z1) / 2 + s * a));
    return m;
  }
  /** toit à quatre pans (pyramide tronquée) : rx, rz demi-côtés en bas, k part du haut (0 = pointe) */
  function toit4(G, cx, cz, y, rx, rz, hr, mat, k = 0.25) {
    const g = new THREE.CylinderGeometry(k * Math.SQRT2, Math.SQRT2, 1, 4, 1, false, Math.PI / 4);
    const m = new THREE.Mesh(g, mat); m.scale.set(rx, hr, rz); m.castShadow = m.receiveShadow = true;
    // coordonnées de texture à l'échelle (tuiles de taille constante)
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4 * rx * 2, uv.getY(i) * Math.hypot(rx, hr) * 1.2);
    return at(m, cx, y + hr / 2, cz);
  }
  /** toit de pagode : pyramide basse à large débord, coins relevés, bordure claire */
  function toitPagode(G, cx, cz, y, r, hr, col, bord) {
    // deux pentes : un bas presque plat (le débord) puis le toit, pentu ; coins relevés en crochets dorés
    G.add(toit4(G, cx, cz, y, r, r, hr * 0.35, M({ map: TX.canal(col) }), 0.72));
    G.add(toit4(G, cx, cz, y + hr * 0.3, r * 0.72, r * 0.72, hr * 0.85, M({ map: TX.canal(col) }), 0.3));
    G.add(at(boite(2 * r + 0.08, 0.1, 2 * r + 0.08, COL(bord)), cx, y + 0.02, cz));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 6), COL(bord)); c.castShadow = true;
      c.rotation.z = -sx * 0.55; c.rotation.x = sz * 0.55; G.add(at(c, cx + sx * (r + 0.06), y + 0.32, cz + sz * (r + 0.06)));
    }
  }
  const socle = (G, x0, z0, w, d, h = 0.3, col) => G.add(at(boite(w + 0.1, h, d + 0.1, M({ map: TX.pierre(col) })), x0 + w / 2, h / 2, z0 + d / 2));

  /* -------------------------------------------------------------- bâtiments ------------------------------------------ */
  const B = {};
  /** maison longue (5 × 3) : bardage de bois, véranda couverte sur poteaux devant la porte, toit d'ardoise */
  B.maisonLongue = ({ bardage = '#7aa0b0', toit = '#4a5a72' } = {}) => {
    const G = new THREE.Group(), w = 5, d = 3, H = 1.7, cx = 2.5;
    socle(G, 0, 0, w, d);
    G.add(at(boite(w, H, d, M({ map: TX.bardage(bardage) })), cx, H / 2 + 0.3, d / 2));
    toit2(G, 0, w, 0, d, H + 0.3, 1.15, M({ map: TX.ardoise(toit) }), M({ map: TX.bardage(bardage), side: THREE.DoubleSide }), 0.3, '#2a3040');
    for (const xx of [0.8, 4.2]) fenetre2(G, xx, 1.3, d, 0.75, 0.55, { rideau: '#f8f0e0', fleurs: ['#f8d850', '#fafaf2', '#a070e0'] });
    // véranda : plancher, poteaux, petit toit en appentis
    G.add(at(boite(2.2, 0.12, 0.7, M({ map: TX.bois('#a8744a') })), cx, 0.36, d + 0.35));
    for (const dx of [-1.0, 1.0]) G.add(at(boite(0.1, 1.5, 0.1, COL('#f0ece2')), cx + dx, 1.1, d + 0.65));
    const ap = boite(2.4, 0.08, 0.95, M({ map: TX.ardoise(toit) })); ap.rotation.x = 0.35; G.add(at(ap, cx, 1.95, d + 0.4));
    porte(G, cx, d, 0.42, 1.05, M({ map: TX.bois('#5a6a4a') }), COL('#f0ece2'));
    G.add(at(boite(0.14, 0.6, 0.14, M({ map: TX.pierre('#a0a0a0') })), 4.5, 3.0, 1.2));
    return G;
  };
  /** résidence (6 × 4, deux étages) : toit à quatre pans, balcon, deux rangées de fenêtres */
  B.residence = ({ mur = '#f0e0d0', toit = '#8a4a3a', porte: px = 3 } = {}) => {
    const G = new THREE.Group(), w = 6, d = 4, H = 2.9, cx = 3;
    socle(G, 0, 0, w, d, 0.3);
    G.add(at(boite(w, H, d, M({ map: TX.enduit(mur) })), cx, H / 2 + 0.3, d / 2));
    G.add(at(boite(w + 0.06, 0.12, d + 0.06, COL('#c8b8a4')), cx, 1.75, d / 2));    // bandeau entre les étages
    G.add(toit4(G, cx, d / 2, H + 0.3, w / 2 + 0.3, d / 2 + 0.3, 1.2, M({ map: TX.canalPetit(toit) }), 0.35));
    for (const xx of [0.9, 2.1, 3.9, 5.1]) fenetre2(G, xx, 2.55, d, 0.55, 0.6, { volets: '#5a7a5a', rideau: '#f0e8d8', fleurs: xx < 1 || xx > 5 ? ['#f05a6a', '#fafaf2'] : null });
    for (const xx of [0.9, 5.1]) fenetre2(G, xx, 1.1, d, 0.6, 0.55, { volets: '#5a7a5a', rideau: '#f0e8d8', fleurs: ['#f05a6a', '#f8d850', '#fafaf2'] });
    // balcon au-dessus de la porte
    G.add(at(boite(1.9, 0.1, 0.55, M({ map: TX.pierre() })), px, 1.95, d + 0.27));
    for (let i = 0; i <= 8; i++) G.add(at(boite(0.04, 0.38, 0.04, COL('#2a2a30')), px - 0.92 + i * 0.23, 2.17, d + 0.52));
    G.add(at(boite(1.9, 0.05, 0.05, COL('#2a2a30')), px, 2.37, d + 0.52));
    G.add(at(boite(0.8, 0.95, 0.03, M({ map: TX.verre() })), px, 2.45, d + 0.01));
    porte(G, px, d, 0.3, 1.2, M({ map: TX.bois('#5a3a2a') }), COL('#ffffff'), 0.85);
    for (const xx of [1.2, 4.8]) G.add(at(boite(0.4, 0.8, 0.4, M({ map: TX.pierre('#b07060') })), xx, H + 1.0, 1.0));
    return G;
  };
  /** tour de ville (8 × 5, Métropole) : mur-rideau vitré, socle de pierre, marquise et portes de 2 cases, toit technique */
  B.tour = ({ etages = 8, col = '#8a98b0', w = 8, d = 5 } = {}) => {
    const G = new THREE.Group(), H = 1.1 * etages, cx = w / 2;
    G.add(at(boite(w, 1.6, d, M({ map: TX.pierre('#9a9ca4') })), cx, 0.8, d / 2));
    G.add(at(boite(w - 0.3, H - 1.6, d - 0.3, M({ map: TX.rideau(col) })), cx, 1.6 + (H - 1.6) / 2, d / 2));
    for (const xx of [0, w]) G.add(at(boite(0.3, H, 0.3, COL(col)), xx + (xx ? -0.15 : 0.15), H / 2, d - 0.15));
    G.add(at(boite(w + 0.1, 0.25, d + 0.1, M({ map: TX.tole('#6a7488') })), cx, H + 0.12, d / 2));
    for (const [x, z, ww, dd] of [[cx, 0.05, w + 0.1, 0.1], [cx, d - 0.05, w + 0.1, 0.1], [0.05, d / 2, 0.1, d], [w - 0.05, d / 2, 0.1, d]]) { G.add(at(boite(ww, 0.55, dd, M({ color: new THREE.Color('#bfe0f0'), transparent: true, opacity: 0.5 })), x, H + 0.52, z)); G.add(at(boite(ww + 0.02, 0.06, dd + 0.02, COL('#c8ccd4')), x, H + 0.82, z)); }
    G.add(at(boite(2.0, 0.6, 1.4, COL('#9aa0aa')), cx + 1.5, H + 0.55, 1.6));
    G.add(at(cyl(0.04, 0.04, 1.6, COL('#c8ccd4')), cx - 2.5, H + 0.9, 1.2));
    G.add(at(boite(0.12, 0.12, 0.12, LUM('#ff4040', '#c00000')), cx - 2.5, H + 1.75, 1.2));
    // balcons où l'on sort (tous les trois étages) : dalle en avancée sur toute la façade, garde-corps vitré, porte-fenêtre
    for (let k = 3; k < etages - 1; k += 3) {
      const yb = k * 1.1;
      G.add(at(boite(w - 0.6, 0.14, 1.1, COL('#d8dce4')), cx, yb, d + 0.4));
      G.add(at(boite(w - 0.6, 0.5, 0.04, M({ color: new THREE.Color('#bfe0f0'), transparent: true, opacity: 0.55 })), cx, yb + 0.32, d + 0.93));
      G.add(at(boite(w - 0.6, 0.05, 0.06, COL('#c8ccd4')), cx, yb + 0.58, d + 0.93));
      for (const s of [-1, 1]) G.add(at(boite(0.05, 0.5, 1.1, M({ color: new THREE.Color('#bfe0f0'), transparent: true, opacity: 0.55 })), cx + s * (w / 2 - 0.32), yb + 0.32, d + 0.4));
      for (const xx of [cx - 2.4, cx + 2.4]) { G.add(at(boite(0.4, 0.3, 0.4, COL('#a85a3a')), xx, yb + 0.22, d + 0.3)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), COL('#3c8c3c')), xx, yb + 0.55, d + 0.3)); }
      G.add(at(boite(1.0, 0.95, 0.03, M({ map: TX.verre() })), cx, yb + 0.55, d - 0.14));
    }
    // terrasse panoramique tout en haut : plancher, garde-corps vitré, longue-vue, banc
    G.add(at(boite(w - 2.4, 0.08, d - 1.6, M({ map: TX.parquet() })), cx - 0.6, H + 0.29, d / 2 + 0.3));
    { const lv = cyl(0.06, 0.09, 0.4, COL('#5a6070')); lv.rotation.x = -1.1; G.add(at(cyl(0.04, 0.04, 0.6, COL('#5a6070')), cx - 1.2, H + 0.6, d - 0.6)); G.add(at(lv, cx - 1.2, H + 0.95, d - 0.55)); }
    G.add(at(boite(1.2, 0.1, 0.35, M({ map: TX.bois('#a8744a') })), cx - 2.6, H + 0.55, d - 0.7));
    portesVitrees(G, cx, d, 1.7, 1.3, COL('#5a6478'));
    G.add(at(boite(3.0, 0.12, 0.9, COL('#3a4458')), cx, 1.45, d + 0.45));
    for (const s of [-1, 1]) G.add(at(boite(1.5, 0.95, 0.03, M({ map: TX.verre() })), cx + s * 2.7, 0.8, d + 0.01));
    return G;
  };

  /* ============================================================== version 3 : détails et nouveaux bâtiments ========= */
  /** petites tuiles canal (tuiles rondes posées en rangs, bas arrondi, teinte propre à chaque tuile) */
  TX.canalPetit = (col) => tex('k' + col, D, D, (g, px, w, h) => {
    const tw = 4 * S, rh = 5 * S;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / rh), off = (row % 2) * tw / 2, lx = (x + off) % tw, ly = y % rh, id = hash(Math.floor((x + off) / tw), row, 31);
      let f = (id - 0.5) * 0.16;
      if (lx < 0.6 * S) f -= 0.32; else if (lx < 1.4 * S) f += 0.18; else if (lx > tw - 1.2 * S) f -= 0.14;
      if (ly > rh - 1.2 * S && (lx < S || lx > tw - S)) f -= 0.3;                       // bas arrondi de la tuile
      if (ly >= rh - 0.6 * S) f -= 0.22;
      px(x, y, mix(col, f));
    }
  });
  /** colombages : enduit clair, poutres sombres (poteaux, sablières, croix de Saint-André), sur 2 × 2 unités */
  TX.colombage = (mur, bois) => tex('cb' + mur + bois, 2 * D, 2 * D, (g, px, w, h) => {
    const b = 2.5 * S;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, near = (a) => Math.abs(a) * w < b / 2;
      const poteau = (x % D) < b, traverse = Math.abs(y - h / 2) < b / 2 || y < b / 2 || y > h - b / 2;
      const croix = near((u % 0.5) - (v % 0.5)) && u % 0.5 > 0.05 || near((u % 0.5) + (v % 0.5) - 0.5) && u % 0.5 > 0.05;
      let c = mur;
      if (hash(x, y, 33) < 0.05) c = mix(mur, -0.05);
      if (poteau || traverse || (croix && v < 0.5)) c = hash(x >> 1, y >> 2, 34) < 0.2 ? mix(bois, 0.12) : bois;
      px(x, y, c);
    }
  });
  /** vitre avec rideaux (coins drapés, embrasses), reflet en diagonale */
  TX.vitreRideau = (rid) => tex('vr' + rid, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = y / h, d = (x + y) % Math.round(22 * S);
      let c = d < 2 * S ? '#d8ecff' : t < 0.5 ? '#5a7cb0' : '#36507a';
      const bord = Math.min(x, w - 1 - x) / w;
      if (bord < 0.22 - t * 0.12 || y < 3 * S) c = (x + y) % 3 ? rid : mix(rid, -0.2);       // rideaux drapés et cantonnière
      px(x, y, c);
    }
  });
  /** panneaux de façade blancs (labo) : plaques, joints fins, rivets */
  TX.panneaux = (col = '#eef2f6') => tex('pn' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let c = col; if (x % (16 * S) < S || y % (10 * S) < S) c = mix(col, -0.18); else if (x % (16 * S) < 2 * S || y % (10 * S) < 2 * S) c = mix(col, 0.4); px(x, y, c); } });
  /** vitrail en éventail (imposte des arènes), couleur du type */
  TX.vitrail = (acc) => tex('vt' + acc, 2 * D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2), dy = (h - y) / h, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      let c = '#1a1420';
      if (r < 0.95) { const k = Math.floor(a / Math.PI * 7); c = r < 0.3 ? '#f8e8a0' : k % 2 ? acc : mix(acc, 0.45); if (Math.abs((a / Math.PI * 7) % 1) < 0.08 || Math.abs(r - 0.3) < 0.04 || Math.abs(r - 0.65) < 0.03) c = '#2a2018'; }
      px(x, y, c);
    }
  }, false);
  TX.lisse = (col) => tex('li' + col, D, D, (g, px, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); });
  TX.treillis = (col) => tex('tr' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lx = x % (6 * S), ly = y % (6 * S); px(x, y, lx < S || ly < S ? col : (lx + ly) % (6 * S) < S ? mix(col, 0.15) : '#f0e2c0'); } });
  TX.eau = () => tex('eaufont', D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = Math.sin(x / (3 * S) + Math.sin(y / (4 * S)) * 2); px(x, y, v > 0.85 ? '#e6f6ff' : v > 0.4 ? '#6cb8ee' : '#357ed6'); } });

  /** fenêtre affinée : rideaux, croisillons, appui et linteau de pierre, volets, jardinière fournie (lierre qui tombe) */
  function fenetre2(G, x, y, z, w, h, { cadre = '#f4f0e6', rideau = '#f0e0c0', volets = null, fleurs = null, linteau = '#d8d0c0' } = {}) {
    G.add(at(boite(w, h, 0.02, M({ map: TX.vitreRideau(rideau) })), x, y, z + 0.005));
    const C = COL(cadre);
    for (const [dx, dy, ww, hh] of [[0, h / 2, w + 0.1, 0.06], [0, -h / 2, w + 0.1, 0.06], [-w / 2, 0, 0.06, h], [w / 2, 0, 0.06, h], [0, 0, 0.035, h], [0, h * 0.1, w, 0.035]])
      G.add(at(boite(ww, hh, 0.07, C), x + dx, y + dy, z + 0.035));
    G.add(at(boite(w + 0.26, 0.1, 0.1, M({ map: TX.pierre(linteau) })), x, y + h / 2 + 0.08, z + 0.05));      // linteau
    G.add(at(boite(w + 0.22, 0.06, 0.2, M({ map: TX.pierre(linteau) })), x, y - h / 2 - 0.05, z + 0.1));      // appui
    if (volets) for (const s of [-1, 1]) {
      G.add(at(boite(w * 0.45, h + 0.04, 0.05, COL(volets)), x + s * (w / 2 + w * 0.25), y, z + 0.03));
      for (let k = 0; k < 4; k++) G.add(at(boite(w * 0.4, 0.02, 0.06, COL(mix(volets, -0.25))), x + s * (w / 2 + w * 0.25), y - h / 2 + 0.08 + k * h / 4, z + 0.04));
    }
    if (fleurs) {
      G.add(at(boite(w + 0.12, 0.14, 0.18, M({ map: TX.bois('#7a4e2c') })), x, y - h / 2 - 0.16, z + 0.14));
      for (let i = 0; i < 9; i++) {
        const fx = x - w / 2 + 0.02 + i * (w + 0.04) / 8;
        G.add(at(boite(0.11, 0.09, 0.11, COL(i % 3 ? '#3c8c3c' : '#2c6e30')), fx, y - h / 2 - 0.05, z + 0.12 + (i % 2) * 0.05));
        G.add(at(boite(0.08, 0.08, 0.08, COL(fleurs[i % fleurs.length])), fx + 0.02, y - h / 2 + 0.01 + (i % 2) * 0.03, z + 0.13 + ((i + 1) % 2) * 0.05));
        if (i % 3 === 1) G.add(at(boite(0.05, 0.16, 0.05, COL('#3c8c3c')), fx, y - h / 2 - 0.3, z + 0.24));   // lierre qui tombe
      }
    }
  }
  /** toit à deux pans en petites tuiles canal, sur un groupe (rotation libre) */
  function toitCanal(G, x0, x1, z0, z1, y, hr, col, pignon, deb = 0.3) {
    toit2(G, x0, x1, z0, z1, y, hr, M({ map: TX.canalPetit(col) }), pignon, deb, mix(col, -0.4));
    // rives : rang de tuiles de bordure, plus sombre
    const dz = (z1 - z0) / 2 + deb, L = Math.hypot(dz, hr), a = Math.atan2(hr, dz), cz = (z0 + z1) / 2;
    for (const xx of [x0 - deb, x1 + deb]) for (const s of [-1, 1]) { const r = boite(0.12, 0.12, L, COL(mix(col, -0.3))); r.rotation.x = s * a; G.add(at(r, xx, y + hr / 2 + 0.08, cz + s * dz / 2)); }
  }

  /** toit chinois à coins relevés (plan rectangulaire) : bord évasé qui se relève vers les coins, pente concave, rive dorée
   *  en épaisseur, crochets aux coins, faîtage orné. ax, az : demi-côtés au bord ; xt, zt : demi-côtés en haut (faîtage) */
  function toitChinois(G, cx, cz, y, ax, az, hr, { col = '#e8b030', rive = '#3a7a6a', bord = '#e8c060', xt = 0.3, zt = 0.15, lift = 0.6, flare = 0.16, ornement = true, uvk = 1 } = {}) {
    const N = 22, Mr = 10, pos = [], uv = [], idx = [], posS = [];
    const faces = [
      (s) => [ax * (1 + flare) * s, az * (1 + flare * s ** 4), xt * s, zt],
      (s) => [-ax * (1 + flare) * s, -az * (1 + flare * s ** 4), -xt * s, -zt],
      (s) => [ax * (1 + flare * s ** 4), -az * (1 + flare) * s, xt, -zt * s],
      (s) => [-ax * (1 + flare * s ** 4), az * (1 + flare) * s, -xt, zt * s],
    ];
    const slant = Math.hypot(Math.max(ax - xt, az - zt), hr);
    for (const F of faces) {
      const base = pos.length / 3;
      for (let j = 0; j <= Mr; j++) for (let i = 0; i <= N; i++) {
        const s = -1 + 2 * i / N, tt = j / Mr, [ex, ez, tx2, tz] = F(s);
        const tzz = F === faces[0] || F === faces[1] ? tz : tz, ye = lift * s ** 4;
        const X = ex + (tx2 - ex) * tt, Z = ez + (tzz - ez) * tt, Y = ye + (hr - ye) * Math.pow(tt, 1.6);
        pos.push(cx + X, y + Y, cz + Z); uv.push(s * ax * 1.2 * uvk, tt * slant * 1.4 * uvk);
        if (j === 0) posS.push([cx + X, y + Y, cz + Z]);
      }
      for (let j = 0; j < Mr; j++) for (let i = 0; i < N; i++) {
        const a = base + j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M({ map: TX.canalPetit(col), side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; G.add(m);
    // rive : bandeau vertical sous le bord (épaisseur du toit, poutres peintes), liseré doré
    const pr = [], ir = []; let n = 0;
    for (let f = 0; f < 4; f++) for (let i = 0; i < N; i++) {
      const p = posS[f * (N + 1) + i], q = posS[f * (N + 1) + i + 1];
      pr.push(p[0], p[1], p[2], q[0], q[1], q[2], q[0], q[1] - 0.2, q[2], p[0], p[1] - 0.2, p[2]); ir.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
    }
    const gr = new THREE.BufferGeometry(); gr.setAttribute('position', new THREE.Float32BufferAttribute(pr, 3)); gr.setIndex(ir); gr.computeVertexNormals();
    G.add(new THREE.Mesh(gr, M({ color: new THREE.Color(rive), side: THREE.DoubleSide })));
    const gl = gr.clone(); const pa = gl.attributes.position; for (let i = 0; i < pa.count; i++) if (i % 4 >= 2) pa.setY(i, pa.getY(i) + 0.14); pa.needsUpdate = true;
    const lis = new THREE.Mesh(gl, M({ color: new THREE.Color(bord), side: THREE.DoubleSide })); lis.position.y = 0.01; G.add(lis);
    if (!ornement) return;
    // crochets relevés aux quatre coins
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 6), COL(bord)); c.castShadow = true;
      c.rotation.z = -sx * 0.9; c.rotation.x = sz * 0.9;
      G.add(at(c, cx + sx * ax * (1 + flare) * 1.04, y + lift + 0.12, cz + sz * az * (1 + flare) * 1.04));
    }
    // faîtage et ses deux ornements recourbés
    if (xt > 0.2 && zt < 0.4) {
      G.add(at(boite(2 * xt + 0.1, 0.16, 0.2, COL(mix(col, -0.25))), cx, y + hr + 0.06, cz));
      for (const s of [-1, 1]) { const o = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 4, 8, Math.PI), COL(bord)); o.rotation.y = Math.PI / 2; o.castShadow = true; G.add(at(o, cx + s * xt, y + hr + 0.2, cz)); }
    }
  }

  /** toit arrondi lisse (dôme en super-ellipse : plan aux coins arrondis, bords qui tombent en rond) */
  function toitRond(G, cx, cz, y, a, b, hr, col, p = 6) {
    const NT = 64, NR = 14, pos = [], idx = [];
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NT; i++) {
      const th = i / NT * Math.PI * 2, rho = j / NR, c = Math.cos(th), s = Math.sin(th);
      const bx = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), bz = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
      pos.push(cx + bx * rho, y + hr * Math.sqrt(Math.max(0, 1 - Math.pow(rho, 5))), cz + bz * rho);
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NT; i++) { const A = j * (NT + 1) + i, B2 = A + 1, Cc = A + NT + 1, Dd = Cc + 1; idx.push(A, B2, Cc, B2, Dd, Cc); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M({ color: new THREE.Color(col), side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; G.add(m);
    return m;
  }

  /* -------------------------------------------------------------- maisons ------------------------------------------- */
  /** maison (4 × 3) : petites tuiles canal ; style « colombage » (village de départ) ou enduit ; fenêtres à rideaux,
   *  jardinières fournies, lucarne, cheminée ; porte d'une case */
  B.maison = ({ toit = '#c05a40', mur = '#f2e6c8', bois = '#5a3a26', colombage = false, fleurs = ['#f05a6a', '#f8d850', '#fafaf2'], rideau = '#f0d8b0', volets = null, w = 4, d = 3, porte: px = w / 2 } = {}) => {
    const G = new THREE.Group(), H = 1.8, x1 = w, z1 = d, cx = w / 2;
    socle(G, 0, 0, w, d, 0.3, '#a8a090');
    const murM = M({ map: colombage ? TX.colombage(mur, bois) : TX.enduit(mur) });
    G.add(at(boite(w, H, d, murM), cx, H / 2 + 0.3, d / 2));
    if (!colombage) for (const xx of [0.06, x1 - 0.06]) G.add(at(boite(0.14, H, 0.14, M({ map: TX.pierre('#d0c6b4') })), xx, H / 2 + 0.3, z1));   // chaînes d'angle
    toitCanal(G, 0, x1, 0, z1, H + 0.3, 1.3, toit, M({ map: colombage ? TX.colombage(mur, bois) : TX.enduit(mur), side: THREE.DoubleSide }));
    G.add(at(boite(0.5, 0.95, 0.5, M({ map: TX.pierre('#b87a62') })), x1 - 0.8, H + 1.3, 0.9));
    G.add(at(boite(0.62, 0.1, 0.62, COL('#5a5552')), x1 - 0.8, H + 1.8, 0.9));
    G.add(at(boite(0.9, 0.75, 0.8, murM), cx, H + 0.85, z1 - 0.7));
    toitCanal(G, cx - 0.45, cx + 0.45, z1 - 1.1, z1 - 0.3, H + 1.22, 0.38, toit, murM, 0.12);
    fenetre2(G, cx, H + 0.88, z1 - 0.29, 0.44, 0.38, { rideau });
    const vol = volets || mix(toit, -0.1);
    fenetre2(G, 0.78, 1.38, z1, 0.6, 0.58, { rideau, volets: vol, fleurs });
    fenetre2(G, x1 - 0.78, 1.38, z1, 0.6, 0.58, { rideau, volets: vol, fleurs });
    porte(G, px, z1, 0.3, 1.12, M({ map: TX.bois('#7a4a2a') }), COL(colombage ? bois : '#6a4228'));
    // petit auvent au-dessus de la porte, lanterne, banc et pot de fleurs
    const au = boite(1.1, 0.06, 0.45, M({ map: TX.canalPetit(toit) })); au.rotation.x = 0.4; G.add(at(au, px, 1.62, z1 + 0.22));
    G.add(at(boite(0.12, 0.2, 0.12, LUM('#fff4c0', '#806020')), px + 0.6, 1.2, z1 + 0.1));
    G.add(at(cyl(0.16, 0.12, 0.25, COL('#a85a3a'), 8), x1 - 0.35, 0.42, z1 + 0.35));
    G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), COL('#4a9a4a')), x1 - 0.35, 0.65, z1 + 0.35));
    return G;
  };
  /** maison en L (5 × 5) : corps principal et aile en avant à gauche, pignon sur rue avec fenêtre ronde, porte dans
   *  l'angle sous un porche ; tuiles canal, enduit ou colombages */
  B.maisonL = ({ toit = '#b85a3a', mur = '#f0e4cc', bois = '#5a3a26', colombage = false, fleurs = ['#f05a6a', '#fafaf2', '#f8a040'] } = {}) => {
    const G = new THREE.Group(), H = 1.8, murT = colombage ? TX.colombage(mur, bois) : TX.enduit(mur), murM = M({ map: murT });
    // corps : x 0 → 5, z 0 → 3 ; aile : x 0 → 2, z 3 → 5
    socle(G, 0, 0, 5, 3, 0.3, '#a8a090'); socle(G, 0, 3, 2, 2, 0.3, '#a8a090');
    G.add(at(boite(5, H, 3, murM), 2.5, H / 2 + 0.3, 1.5));
    G.add(at(boite(2, H, 2.05, murM), 1, H / 2 + 0.3, 4));
    toitCanal(G, 0, 5, 0, 3, H + 0.3, 1.3, toit, M({ map: murT, side: THREE.DoubleSide }));
    const aile = new THREE.Group(); aile.rotation.y = Math.PI / 2; aile.position.set(1, 0, 4);   // l'aile : faîtage nord-sud
    toitCanal(aile, -1, 2, -1, 1, H + 0.3, 1.3, toit, M({ map: murT, side: THREE.DoubleSide }));
    G.add(aile);
    // pignon de l'aile : fenêtre ronde (œil-de-bœuf)
    const oeil = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), M({ map: TX.verre() })); G.add(at(oeil, 1, H + 0.72, 5.03));
    const cer = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 16), COL('#f4f0e6')); G.add(at(cer, 1, H + 0.72, 5.05));
    fenetre2(G, 1, 1.38, 5, 0.7, 0.6, { volets: mix(toit, -0.1), fleurs });
    fenetre2(G, 4.2, 1.38, 3, 0.6, 0.58, { volets: mix(toit, -0.1), fleurs });
    // porche dans l'angle : porte sur la façade du corps, poteaux et petit toit
    porte(G, 2.75, 3, 0.3, 1.12, M({ map: TX.bois('#5a6a4a') }), COL(colombage ? bois : '#f0ece2'));
    G.add(at(boite(1.5, 0.12, 0.9, M({ map: TX.bois('#a8744a') })), 2.85, 0.36, 3.45));
    G.add(at(boite(0.1, 1.5, 0.1, COL('#f0ece2')), 3.5, 1.05, 3.85));
    const ap = boite(1.6, 0.07, 1.1, M({ map: TX.canalPetit(toit) })); ap.rotation.x = 0.32; G.add(at(ap, 2.85, 1.9, 3.5));
    G.add(at(boite(0.5, 1.0, 0.5, M({ map: TX.pierre('#b87a62') })), 4.1, H + 1.35, 0.9));
    return G;
  };
  /** mairie (9 × 5, trois niveaux) : avant-corps à fronton et fenêtre ronde en haut, horloge, toit d'ardoise à lucarnes,
   *  balcon, drapeaux, perron et double porte de 2 cases */
  B.mairie = ({ mur = '#f2e8d4', toit = '#4a5266', acc = '#3a5aa8' } = {}) => {
    const G = new THREE.Group(), w = 9, d = 5, H = 4.2, cx = 4.5, z1 = d;
    socle(G, 0, 0, w, d, 0.45, '#a8a090');
    G.add(at(boite(w, H, d, M({ map: TX.enduit(mur) })), cx, H / 2 + 0.45, d / 2));
    for (const yy of [1.85, 3.25]) G.add(at(boite(w + 0.06, 0.12, d + 0.06, M({ map: TX.pierre('#d8ccb4') })), cx, yy, d / 2));   // cordons
    for (const xx of [0.08, w - 0.08]) G.add(at(boite(0.22, H, 0.22, M({ map: TX.pierre('#d8ccb4') })), xx, H / 2 + 0.45, z1));
    G.add(toit4(G, cx, d / 2, H + 0.45, w / 2 + 0.25, d / 2 + 0.25, 1.4, M({ map: TX.ardoise(toit) }), 0.55));
    for (const xx of [1.5, 7.5]) {            // lucarnes
      G.add(at(boite(0.8, 0.7, 0.6, M({ map: TX.enduit(mur) })), xx, H + 0.85, z1 - 0.2));
      fenetre2(G, xx, H + 0.85, z1 + 0.1, 0.42, 0.42, { rideau: '#e8e0d0' });
      G.add(toit4(G, xx, z1 - 0.2, H + 1.2, 0.5, 0.4, 0.35, M({ map: TX.ardoise(toit) }), 0.1));
    }
    // avant-corps central (3 cases), plus haut, à fronton
    G.add(at(boite(3, H + 0.6, 0.4, M({ map: TX.pierre('#e2d8c4') })), cx, (H + 0.6) / 2 + 0.45, z1 + 0.2));
    const fr = new THREE.Shape(); fr.moveTo(-1.65, 0); fr.lineTo(1.65, 0); fr.lineTo(0, 0.9); fr.closePath();
    const fm = new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 0.45, bevelEnabled: false }), M({ map: TX.pierre('#e2d8c4') })); fm.castShadow = true; G.add(at(fm, cx, H + 1.05, z1 - 0.05));
    const oeil = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), M({ map: TX.verre() })); G.add(at(oeil, cx, 3.95, z1 + 0.41));
    const cer = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 6, 20), M({ map: TX.pierre('#cfc4ae') })); G.add(at(cer, cx, 3.95, z1 + 0.43));
    for (let k = 0; k < 4; k++) { const r = boite(0.05, 0.84, 0.03, COL('#e2d8c4')); r.rotation.z = k * Math.PI / 4; G.add(at(r, cx, 3.95, z1 + 0.42)); }
    const hor = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), COL('#f8f4e8')); G.add(at(hor, cx, H + 1.33, z1 + 0.42));   // horloge dans le fronton
    G.add(at(boite(0.03, 0.2, 0.02, COL('#2a2a30')), cx, H + 1.4, z1 + 0.44)); const ai = boite(0.14, 0.03, 0.02, COL('#2a2a30')); G.add(at(ai, cx + 0.06, H + 1.33, z1 + 0.44));
    // fenêtres des trois niveaux
    for (const xx of [0.9, 2.1, 6.9, 8.1]) for (const [yy, f] of [[1.25, true], [2.6, false], [3.95, false]]) fenetre2(G, xx, yy, z1, 0.6, 0.72, { rideau: '#e8d8b8', volets: '#5a7a9a', fleurs: f ? ['#f05a6a', '#fafaf2'] : null });
    fenetre2(G, cx, 2.6, z1 + 0.4, 0.75, 0.75, { rideau: '#e8d8b8' });
    // balcon devant la fenêtre du 1er étage, drapeaux
    G.add(at(boite(2.0, 0.1, 0.55, M({ map: TX.pierre('#e2d8c4') })), cx, 2.05, z1 + 0.65));
    for (let i = 0; i <= 8; i++) G.add(at(boite(0.05, 0.36, 0.05, COL('#2a2a30')), cx - 0.96 + i * 0.24, 2.27, z1 + 0.9));
    G.add(at(boite(2.0, 0.05, 0.05, COL('#2a2a30')), cx, 2.46, z1 + 0.9));
    for (const s of [-1, 1]) { const m2 = boite(0.04, 0.9, 0.04, COL('#c8ccd4')); m2.rotation.z = s * 0.5; G.add(at(m2, cx + s * 1.5, 3.0, z1 + 0.5)); G.add(at(boite(0.5, 0.32, 0.02, COL(s < 0 ? acc : '#f0f0f0')), cx + s * 1.9, 3.25, z1 + 0.5)); }
    // double porte vitrée de 2 cases, perron
    G.add(at(boite(1.6, 1.3, 0.04, M({ map: TX.bois('#5a3a22') })), cx, 1.1, z1 + 0.41));
    G.add(at(boite(1.4, 0.4, 0.03, M({ map: TX.vitrail('#e8c060') })), cx, 1.62, z1 + 0.43));
    for (const s of [-1, 1]) G.add(at(boite(0.14, 1.5, 0.14, M({ map: TX.pierre('#cfc4ae') })), cx + s * 0.88, 1.2, z1 + 0.44));
    for (let k = 0; k < 3; k++) G.add(at(boite(2.6 + k * 0.5, 0.15, 0.3, M({ map: TX.pierre('#cfc4ae') })), cx, 0.07 + (2 - k) * 0.15, z1 + 0.55 + k * 0.28));
    return G;
  };
  /** fontaine de place (3 × 3) : bassin rond à margelle, vasque sur colonne, jets d'eau */
  B.fontaine = () => {
    const G = new THREE.Group(), c = 1.5;
    G.add(at(cyl(1.45, 1.5, 0.4, M({ map: TX.pierre('#cfc6b4') }), 24), c, 0.2, c));
    G.add(at(cyl(1.28, 1.28, 0.04, M({ map: TX.eau() }), 24), c, 0.42, c));
    const marg = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.12, 6, 32), M({ map: TX.pierre('#e2dccc') })); marg.rotation.x = Math.PI / 2; marg.castShadow = true; G.add(at(marg, c, 0.44, c));
    G.add(at(cyl(0.16, 0.22, 1.1, M({ map: TX.pierre('#d8d0c0') }), 10), c, 0.95, c));
    G.add(at(cyl(0.55, 0.25, 0.22, M({ map: TX.pierre('#d8d0c0') }), 16), c, 1.5, c));
    G.add(at(cyl(0.47, 0.47, 0.04, M({ map: TX.eau() }), 16), c, 1.63, c));
    G.add(at(cyl(0.06, 0.1, 0.45, M({ map: TX.pierre('#d8d0c0') }), 8), c, 1.85, c));
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, j = boite(0.05, 0.6, 0.05, M({ color: new THREE.Color('#b8e0ff'), transparent: true, opacity: 0.85 })); j.rotation.z = Math.cos(a) * 0.5; j.rotation.x = -Math.sin(a) * 0.5; G.add(at(j, c + Math.cos(a) * 0.62, 1.25, c + Math.sin(a) * 0.62)); }
    return G;
  };

  /* -------------------------------------------------------------- laboratoire ----------------------------------------- */
  /** laboratoire (10 × 7) : corps de deux niveaux en panneaux blancs à bandeaux vitrés, hall d'entrée vitré double hauteur
   *  sous une casquette en porte-à-faux (logo), aile serre à toit de verre et plantes, tour d'observatoire à coupole
   *  fendue, toiture technique (panneaux solaires, climatiseurs, antenne, garde-corps), jardinières et banc ; entrée de 2 cases */
  B.labo = ({ acc = '#3a8ad0' } = {}) => {
    const G = new THREE.Group(), PN = M({ map: TX.panneaux() }), AC = COL(acc);
    // corps principal : x 0 → 6, z 0 → 5, deux niveaux
    const H = 3.0;
    G.add(at(boite(6, 0.25, 5, M({ map: TX.pierre('#b8bcc4') })), 3, 0.12, 2.5));
    G.add(at(boite(6, H, 5, PN), 3, H / 2 + 0.25, 2.5));
    for (const yy of [1.0, 2.45]) {           // bandeaux vitrés de chaque niveau, meneaux, bandes de couleur
      G.add(at(boite(6.02, 0.75, 5.02, M({ map: TX.verre() })), 3, yy, 2.5));
      for (let i = 0; i <= 12; i++) G.add(at(boite(0.05, 0.75, 0.05, COL('#c8ccd4')), i * 0.5, yy, 5.02));
      G.add(at(boite(6.06, 0.1, 5.06, AC), 3, yy + 0.43, 2.5));
    }
    G.add(at(boite(6.2, 0.2, 5.2, COL('#e8ecf0')), 3, H + 0.35, 2.5));
    // hall vitré double hauteur devant l'entrée (x 1.5 → 4.5) et casquette en porte-à-faux avec logo
    G.add(at(boite(3, H - 0.1, 1.2, M({ map: TX.verre(), transparent: false })), 3, (H - 0.1) / 2 + 0.25, 5.6));
    for (let i = 0; i <= 6; i++) G.add(at(boite(0.06, H - 0.1, 0.06, COL('#d8dce4')), 1.5 + i * 0.5, (H - 0.1) / 2 + 0.25, 6.21));
    G.add(at(boite(0.06, 0.06, 1.2, COL('#d8dce4')), 1.5, H + 0.15, 5.6)); G.add(at(boite(3.06, 0.06, 0.06, COL('#d8dce4')), 3, 1.75, 6.21));
    G.add(at(boite(4.2, 0.2, 2.2, COL('#f4f6f8')), 3, H + 0.3, 6.0));
    G.add(at(boite(4.22, 0.08, 2.22, AC), 3, H + 0.18, 6.0));
    const logo = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24), [COL('#ffffff'), COL('#ffffff'), COL('#ffffff')]); logo.rotation.x = Math.PI / 2; G.add(at(logo, 3, H + 0.62, 7.0));
    const demi = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24, 0, Math.PI), AC); G.add(at(demi, 3, H + 0.62, 7.05));
    G.add(at(boite(0.84, 0.06, 0.02, COL('#2a2a30')), 3, H + 0.62, 7.06)); G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), COL('#ffffff')), 3, H + 0.62, 7.07));
    G.add(at(boite(0.08, H + 0.1, 0.08, COL('#c8ccd4')), 1.0, (H + 0.1) / 2, 7.0)); G.add(at(boite(0.08, H + 0.1, 0.08, COL('#c8ccd4')), 5.0, (H + 0.1) / 2, 7.0));
    portesVitrees(G, 3, 6.2, 1.7, 1.5, COL('#9aa0aa'));
    // aile serre (x 6 → 10, z 1 → 5) : murets, parois et toit de verre, plantes
    G.add(at(boite(4, 0.45, 4, M({ map: TX.pierre('#c4c8ce') })), 8, 0.22, 3));
    for (let i = 0; i < 18; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22 + hash(i, 1) * 0.2, 7, 5), COL(i % 3 ? '#3c8c3c' : '#58b050')), 6.4 + (i % 6) * 0.65, 0.6 + hash(i, 2) * 0.5, 1.4 + Math.floor(i / 6) * 1.2));
    const verreS = M({ color: new THREE.Color('#bfe0f0'), transparent: true, opacity: 0.45 });
    G.add(at(boite(4, 1.6, 4, verreS), 8, 1.25, 3));
    for (let i = 0; i <= 8; i++) { G.add(at(boite(0.05, 1.6, 0.05, COL('#e8ecf0')), 6 + i * 0.5, 1.25, 5.0)); }
    for (const s of [-1, 1]) { const p = boite(4.1, 0.05, 2.3, verreS); p.rotation.x = s * 0.5; G.add(at(p, 8, 2.55, 3 + s * 1.0)); }
    for (let i = 0; i <= 8; i++) for (const s of [-1, 1]) { const r = boite(0.05, 0.06, 2.3, COL('#e8ecf0')); r.rotation.x = s * 0.5; G.add(at(r, 6 + i * 0.5, 2.58, 3 + s * 1.0)); }
    G.add(at(boite(4.1, 0.1, 0.1, COL('#e8ecf0')), 8, 3.08, 3));
    // tour d'observatoire sur le toit (coin nord-ouest) : tambour, coupole à fente, télescope
    G.add(at(cyl(1.0, 1.0, 1.0, PN, 20), 1.4, H + 0.95, 1.4));
    G.add(at(cyl(1.05, 1.05, 0.1, AC, 20), 1.4, H + 1.48, 1.4));
    const coup = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), COL('#dfe4ea')); coup.castShadow = true; G.add(at(coup, 1.4, H + 1.5, 1.4));
    const fente = boite(0.3, 1.1, 0.06, COL('#1a2030')); fente.rotation.x = -0.75; G.add(at(fente, 1.4, H + 2.15, 1.95));
    const tel = cyl(0.08, 0.1, 0.8, COL('#5a6070')); tel.rotation.x = -0.7; G.add(at(tel, 1.4, H + 2.3, 2.0));
    // toiture technique : panneaux solaires, climatiseurs, antenne, garde-corps
    for (let i = 0; i < 3; i++) { const p = boite(0.9, 0.05, 1.2, M({ map: TX.panneauSolaire() })); p.rotation.x = -0.35; G.add(at(p, 3.3 + i * 1.0, H + 0.75, 3.4)); }
    for (const [x, z] of [[4.8, 1.0], [5.4, 1.0]]) { G.add(at(boite(0.5, 0.4, 0.5, COL('#c8ccd4')), x, H + 0.65, z)); G.add(at(cyl(0.16, 0.16, 0.04, COL('#5a6070'), 10), x, H + 0.86, z)); }
    G.add(at(cyl(0.04, 0.05, 1.8, COL('#b8bcc4')), 3.0, H + 1.35, 0.6));
    for (const yy of [H + 1.1, H + 1.5]) G.add(at(boite(0.5, 0.03, 0.03, COL('#b8bcc4')), 3.0, yy, 0.6));
    G.add(at(boite(0.1, 0.1, 0.1, LUM('#ff4040', '#c00000')), 3.0, H + 2.28, 0.6));
    for (const [x, z, ww, dd] of [[3, 0.08, 6, 0.04], [5.92, 2.5, 0.04, 5], [3, 4.92, 6, 0.04]]) G.add(at(boite(ww, 0.3, dd, M({ color: new THREE.Color('#c8ccd4') })), x, H + 0.6, z));
    // abords : jardinières, arbustes, banc, plaque
    for (const x of [0.4, 5.6]) { G.add(at(boite(0.7, 0.35, 0.7, M({ map: TX.pierre('#c4c8ce') })), x, 0.17, 6.6)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), COL('#3c8c3c')), x, 0.55, 6.6)); }
    G.add(at(boite(1.2, 0.08, 0.35, M({ map: TX.bois('#a8744a') })), 7.4, 0.42, 5.6)); for (const s of [-1, 1]) G.add(at(boite(0.08, 0.4, 0.3, COL('#5a6070')), 7.4 + s * 0.5, 0.2, 5.6));
    G.add(at(boite(1.0, 0.5, 0.06, AC), 5.6, 0.6, 7.2)); G.add(at(boite(0.84, 0.36, 0.02, COL('#f4f6f8')), 5.6, 0.6, 7.24));
    return G;
  };

  /* -------------------------------------------------------------- pagode-pavillon ------------------------------------- */
  const murChinois = (bois) => tex('pagodeMur' + bois, 2 * D, 2 * D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lx = x % w, pil = lx < 5 * S || lx >= w - 5 * S, fy = y / h;
      let c = pil ? bois : fy < 0.12 ? '#2f6f62' : fy > 0.84 ? mix(bois, -0.35) : (x % (5 * S) < S || y % (5 * S) < S ? '#7a3a1c' : '#f2e2c0');
      if (fy < 0.12 && (x % (6 * S)) < 2 * S) c = '#e8c060';                 // frise peinte sous l'avant-toit
      if (pil && (lx === Math.round(2 * S) || lx === w - Math.round(3 * S))) c = mix(bois, 0.2);
      px(x, y, c);
    }
  });
  /** balcon : plancher, garde-corps à balustres, piliers rouges aux angles et tous les 1,3 */
  function balcon(G, cx, cz, y, r, bois, ouvert = 0) {
    G.add(at(boite(2 * r, 0.16, 2 * r, COL('#6a2a1a')), cx, y + 0.08, cz));
    const R = COL('#b8322a');
    for (const s of [-1, 1]) {
      const o = s > 0 ? ouvert : 0;
      for (const [u0, u1] of o ? [[-r, -o], [o, r]] : [[-r, r]]) for (const yy of [0.55, 0.3]) G.add(at(boite(u1 - u0, yy > 0.5 ? 0.07 : 0.05, 0.06, R), cx + (u0 + u1) / 2, y + yy, cz + s * r));
      G.add(at(boite(0.07, 0.07, 2 * r, R), cx + s * r, y + 0.55, cz)); G.add(at(boite(0.05, 0.05, 2 * r, R), cx + s * r, y + 0.3, cz));
      const n = Math.max(2, Math.round(2 * r / 0.35));
      for (let i = 0; i <= n; i++) { const u = -r + 2 * r * i / n; if (!(o && Math.abs(u) < o)) G.add(at(boite(0.04, 0.4, 0.04, R), cx + u, y + 0.35, cz + s * r)); G.add(at(boite(0.04, 0.4, 0.04, R), cx + s * r, y + 0.35, cz + u)); }
    }
  }
  /** pagode-pavillon monumentale (Tour de la Grue, à la manière de la Tour de la Grue jaune et de la Tour Cendrée) : terrasse
   *  de pierre à balustrade, cinq étages ceints de balcons où l'on peut sortir (et une terrasse tout en haut), chaque étage
   *  coiffé d'un toit chinois à coins relevés (le premier, double), toit de couronnement à faîtage orné et gourde dorée ;
   *  porte de 2 cases. Emprise 11 × 11 */
  B.pagode = ({ etages = 5, toit = '#e8b030', rive = '#2f6f62', bord = '#e8c060', bois = '#b8322a', pierre = '#d4cfc4' } = {}) => {
    const G = new THREE.Group(), w = 11, cx = 5.5, cz = 5.5;
    // terrasse à deux gradins, balustrade, grand escalier au sud
    G.add(at(boite(w, 0.5, w, M({ map: TX.pierre(pierre) })), cx, 0.25, cz));
    G.add(at(boite(w - 1.4, 0.5, w - 1.4, M({ map: TX.pierre(mix(pierre, 0.08)) })), cx, 0.75, cz));
    const BL = M({ map: TX.pierre('#ece8de') });
    for (const s of [-1, 1]) for (const [a, b] of [[1, 0], [0, 1]]) {
      const L = w - 1.4, x = cx + (a ? 0 : s * L / 2), z = cz + (b ? 0 : s * L / 2);
      if (s > 0 && b === 0) {   // côté sud : balustrade coupée par l'escalier
        for (const t of [-1, 1]) G.add(at(boite((L - 3.2) / 2, 0.08, 0.12, BL), cx + t * (1.6 + (L - 3.2) / 4), 1.38, z));
      } else G.add(at(boite(a ? L : 0.12, 0.08, a ? 0.12 : L, BL), x, 1.38, z));
      for (let i = 0; i <= 14; i++) { const u = -L / 2 + L * i / 14; if (s > 0 && b === 0 && Math.abs(u) < 1.6) continue; G.add(at(boite(0.1, 0.38, 0.1, BL), x + (a ? u : 0), 1.19, z + (a ? 0 : u))); }
    }
    for (let k = 0; k < 6; k++) G.add(at(boite(3.0, 0.17, 0.3, M({ map: TX.pierre(pierre) })), cx, 0.085 + (5 - k) * 0.17, w + 0.15 + k * 0.3 - 0.3));
    for (const s of [-1, 1]) { G.add(at(boite(0.5, 1.1, 0.5, BL), cx + s * 1.8, 1.55, w - 0.85)); G.add(at(boite(0.3, 0.32, 0.3, LUM('#fff0b0', '#806020')), cx + s * 1.8, 2.2, w - 0.85)); }
    // étages : murs hauts, balcon étroit, avant-toit court qui laisse voir chaque étage
    let y = 1.0, c = 3.4;
    const T = { col: toit, rive, bord, uvk: 0.55, flare: 0.1 };
    for (let k = 0; k < etages; k++) {
      const h = k === 0 ? 2.9 : 2.3, last = k === etages - 1;
      G.add(at(boite(2 * c, h, 2 * c, M({ map: murChinois(bois) })), cx, y + h / 2, cz));
      const b = c + 0.6;                                        // balcon tout autour
      balcon(G, cx, cz, y - 0.02, b, bois, k === 0 ? 1.3 : 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.add(at(cyl(0.13, 0.13, h, COL(bois), 8), cx + sx * b, y + h / 2, cz + sz * b));
      for (const s of [-1, 1]) for (let i = 1; i < 4; i++) { const u = -b + 2 * b * i / 4; G.add(at(cyl(0.1, 0.1, h, COL(bois), 8), cx + u, y + h / 2, cz + s * b)); G.add(at(cyl(0.1, 0.1, h, COL(bois), 8), cx + s * b, y + h / 2, cz + u)); }
      for (const s of [-1, 1]) { G.add(at(boite(2 * b, 0.18, 0.08, COL('#2f6f62')), cx, y + h - 0.1, cz + s * b)); G.add(at(boite(0.08, 0.18, 2 * b, COL('#2f6f62')), cx + s * b, y + h - 0.1, cz)); }   // poutre peinte
      if (k === 0) {
        G.add(at(boite(1.8, 2.0, 0.06, M({ map: TX.bois('#5a2414') })), cx, y + 1.0, cz + c + 0.02));
        G.add(at(boite(2.3, 0.5, 0.08, COL('#2f6f62')), cx, y + 2.3, cz + c + 0.05)); G.add(at(boite(2.0, 0.34, 0.1, LUM('#e8c060', '#504010')), cx, y + 2.3, cz + c + 0.06));
        toitChinois(G, cx, cz, y + 1.5, b + 0.5, b + 0.5, 0.35, { ...T, xt: c + 0.02, zt: c + 0.02, lift: 0.35 });   // double avant-toit
      } else for (const s of [-1, 1]) G.add(at(boite(1.0, 1.2, 0.05, M({ map: TX.treillis('#7a2a1a') })), cx + s * c * 0.45, y + 1.0, cz + c + 0.02));   // portes à treillis sur le balcon
      y += h;
      const nc = c * 0.88;
      if (!last) toitChinois(G, cx, cz, y - 0.08, b + 0.45, b + 0.45, 0.5, { ...T, xt: nc + 0.02, zt: nc + 0.02, lift: 0.45 });
      else {
        // toit-terrasse où l'on marche (Ho-Oh s'y pose) : avant-toit en anneau, dalle, chemin de ronde tout autour derrière
        // une balustrade, socle central à escalier en façade (une case de large) et pinacle doré ; l'escalier intérieur
        // débouche par la porte à l'arrière du socle
        toitChinois(G, cx, cz, y - 0.08, b + 0.6, b + 0.6, 0.5, { ...T, xt: b, zt: b, lift: 0.45 });
        const yt = y + 0.42, R = b, P = 1.15, OR = LUM('#f0c840', '#604000');
        G.add(at(boite(2 * R, 0.14, 2 * R, M({ map: TX.pierre('#d8d0c0') })), cx, yt + 0.07, cz));
        balcon(G, cx, cz, yt + 0.1, R - 0.06, bois);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { G.add(at(boite(0.2, 0.75, 0.2, COL(bois)), cx + sx * (R - 0.06), yt + 0.47, cz + sz * (R - 0.06))); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), OR), cx + sx * (R - 0.06), yt + 0.92, cz + sz * (R - 0.06))); }
        const ys = yt + 0.14, hs = 0.9, SP = M({ map: TX.pierre('#ece6d8') });
        G.add(at(boite(2 * P, hs, 2 * P, SP), cx, ys + hs / 2, cz));
        G.add(at(boite(2 * P + 0.14, 0.1, 2 * P + 0.14, COL(bord)), cx, ys + hs, cz));
        for (const s of [-1, 1]) G.add(at(boite(2 * P, 0.08, 0.06, COL('#2f6f62')), cx, ys + hs - 0.2, cz + s * (P + 0.01)));
        // balustrade du socle, ouverte en haut de l'escalier
        for (const [x0, z0, x1, z1] of [[-P, -P, P, -P], [-P, -P, -P, P], [P, -P, P, P], [-P, P, -0.5, P], [0.5, P, P, P]]) {
          const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.3));
          G.add(at(boite(Math.max(0.06, x1 - x0), 0.06, Math.max(0.06, z1 - z0), COL(bois)), cx + (x0 + x1) / 2, ys + hs + 0.42, cz + (z0 + z1) / 2));
          for (let i = 0; i <= n; i++) G.add(at(boite(0.05, 0.36, 0.05, COL(bois)), cx + x0 + (x1 - x0) * i / n, ys + hs + 0.24, cz + z0 + (z1 - z0) * i / n));
        }
        for (let k2 = 0; k2 < 5; k2++) { const hh = (k2 + 1) * hs / 5; G.add(at(boite(0.95, hh, 0.2, SP), cx, ys + hh / 2, cz + P + 1.0 - k2 * 0.2 - 0.1)); }
        for (const s of [-1, 1]) G.add(at(boite(0.08, 0.5, 1.0, COL(bois)), cx + s * 0.52, ys + hs * 0.55, cz + P + 0.5));
        G.add(at(boite(0.7, 0.75, 0.05, M({ map: TX.bois('#5a2414') })), cx, ys + 0.38, cz - P - 0.02));
        // pinacle doré : fleur de lotus, gourdes, anneaux, aiguille
        const yp = ys + hs;
        G.add(at(cyl(0.65, 0.8, 0.22, OR, 16), cx, yp + 0.11, cz));
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), OR); p.scale.set(1, 0.6, 0.5); p.rotation.y = -a; G.add(at(p, cx + Math.cos(a) * 0.6, yp + 0.3, cz + Math.sin(a) * 0.6)); }
        G.add(at(cyl(0.22, 0.35, 0.35, OR, 12), cx, yp + 0.4, cz));
        G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 10), OR), cx, yp + 0.95, cz));
        for (const [yy, r] of [[1.42, 0.3], [1.55, 0.26], [1.68, 0.22]]) { const an = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 16), OR); an.rotation.x = Math.PI / 2; G.add(at(an, cx, yp + yy, cz)); }
        G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), OR), cx, yp + 2.0, cz));
        G.add(at(cyl(0.03, 0.08, 0.9, OR, 6), cx, yp + 2.7, cz));
        G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), LUM('#ff6040', '#a02000')), cx, yp + 3.18, cz));
      }
      y += last ? 0 : 0.5; c = nc;
    }
    return G;
  };
  /** pavillon de temple (8 × 6) : estrade, colonnade rouge, double toit chinois (le bas en anneau, le haut à demi-croupe),
   *  portes à treillis, lanternes, encensoir ; entrée de 2 cases */
  B.pavillon = ({ toit = '#7a3a2a', rive = '#2f6f62', bord = '#e8c060', bois = '#b8322a' } = {}) => {
    const G = new THREE.Group(), w = 8, d = 6, cx = 4, cz = 3;
    G.add(at(boite(w, 0.55, d, M({ map: TX.pierre('#cfc8ba') })), cx, 0.27, cz));
    const ax = 2.6, az = 1.7;
    G.add(at(boite(2 * ax, 1.9, 2 * az, M({ map: TX.treillis('#7a2a1a') })), cx, 0.55 + 0.95, cz));
    for (let i = 0; i <= 5; i++) for (const s of [-1, 1]) G.add(at(cyl(0.12, 0.12, 1.9, COL(bois), 8), cx - ax - 0.5 + i * (2 * ax + 1) / 5, 1.5, cz + s * (az + 0.5)));
    for (const s of [-1, 1]) for (let i = 1; i < 3; i++) G.add(at(cyl(0.12, 0.12, 1.9, COL(bois), 8), cx + s * (ax + 0.5), 1.5, cz - az - 0.5 + i * (2 * az + 1) / 3));
    G.add(at(boite(1.7, 1.6, 0.05, M({ map: TX.treillis('#5a1a0a') })), cx, 1.35, cz + az + 0.03));
    toitChinois(G, cx, cz, 2.45, ax + 1.1, az + 1.1, 0.7, { col: toit, rive, bord, xt: ax - 0.3, zt: az - 0.3, lift: 0.4, flare: 0.1, uvk: 0.6 });
    G.add(at(boite(2 * ax - 0.6, 0.8, 2 * az - 0.6, M({ map: murChinois(bois) })), cx, 3.15, cz));
    toitChinois(G, cx, cz, 3.5, ax + 0.6, az + 0.6, 1.3, { col: toit, rive, bord, xt: ax - 0.6, zt: 0.12, lift: 0.45, flare: 0.1, uvk: 0.6 });
    for (let k = 0; k < 3; k++) G.add(at(boite(2.6 + k * 0.4, 0.18, 0.3, M({ map: TX.pierre('#cfc8ba') })), cx, 0.09 + (2 - k) * 0.18, d + 0.15 + k * 0.28 - 0.3));
    for (const s of [-1, 1]) {
      G.add(at(boite(0.34, 0.6, 0.34, M({ map: TX.pierre('#9a948a') })), cx + s * 2.2, 0.85, d - 0.2));
      G.add(at(boite(0.5, 0.12, 0.5, M({ map: TX.pierre('#9a948a') })), cx + s * 2.2, 1.2, d - 0.2));
      G.add(at(boite(0.26, 0.24, 0.26, LUM('#fff0b0', '#806020')), cx + s * 2.2, 1.38, d - 0.2));
    }
    G.add(at(cyl(0.35, 0.28, 0.4, COL('#6a5a3a'), 10), cx, 0.75, d - 0.45));
    return G;
  };


  /* ============================================================== version 4 : village, ville, Ligue ================= */
  /** bardeaux (petites planchettes de bois en rangs décalés) */
  TX.bardeaux = (col) => tex('bx' + col, D, D, (g, px, w, h) => {
    const tw = 6 * S, rh = 5 * S;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / rh), off = (row % 2) * tw / 2, lx = (x + off) % tw, ly = y % rh, id = hash(Math.floor((x + off) / tw), row, 41);
      let f = (id - 0.5) * 0.24; if (lx < S) f -= 0.35; if (ly >= rh - S) f -= 0.3; if (ly < S) f += 0.12;
      px(x, y, mix(col, f));
    }
  });
  /** planches verticales (cabanes, granges), vieillies */
  TX.planches = (col) => tex('pl' + col, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = Math.floor(x / (8 * S)), lx = x % (8 * S), id = hash(k, 0, 42);
      let f = (id - 0.5) * 0.2; if (lx < S) f = -0.45; else if (lx > 7 * S) f -= 0.12; if (hash(x >> 1, y >> 3, 43) < 0.08) f -= 0.12;
      if ((y + k * 7 * S) % (40 * S) < S && lx > S) f -= 0.25;
      px(x, y, mix(col, f));
    }
  });
  /** rondins horizontaux (cabane de chasseur) */
  TX.rondins = (col) => tex('ro' + col, D, D, (g, px, w, h) => {
    const rh = 8 * S;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ly = y % rh, t = ly / rh; let f = 0.18 - Math.abs(t - 0.4) * 0.7; if (ly >= rh - S) f = -0.55;
      if (hash(x >> 2, Math.floor(y / rh), 44) < 0.06) f -= 0.15;
      px(x, y, mix(col, f));
    }
  });
  /** briques */
  TX.brique = (col) => tex('br' + col, D, D, (g, px, w, h) => {
    const rh = 4 * S, tw = 8 * S;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / rh), off = (row % 2) * tw / 2, lx = (x + off) % tw, ly = y % rh, id = hash(Math.floor((x + off) / tw), row, 45);
      px(x, y, ly < S || lx < S ? '#d8d0c4' : mix(col, (id - 0.5) * 0.25));
    }
  });
  /** mur-rideau sombre (grande tour) : grands vitrages carrés, meneaux fins, reflets */
  TX.rideauSombre = (col) => tex('rs' + col, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lx = x % (16 * S), ly = y % (11 * S), cell = hash(Math.floor(x / (16 * S)), Math.floor(y / (11 * S)), 46);
      let c = lx < S || ly < S ? '#9aa2ae' : cell > 0.93 ? '#e8d8a0' : (lx + 2 * ly) % Math.round(30 * S) < 3 * S ? mix(col, 0.35) : ly > 7 * S ? mix(col, -0.2) : col;
      px(x, y, c);
    }
  });
  const OR = LUM('#f0c840', '#5a3a00');

  /* -------------------------------------------------------------- aides ---------------------------------------------- */
  /** toit à deux pans dont le pignon donne sur la rue (faîtage nord-sud) ; matToit : matériau du toit, sinon tuiles canal */
  function toitRue(G, x0, x1, z0, z1, y, hr, col, pignon, deb = 0.3, matToit = null, faite = null) {
    const R = new THREE.Group(); R.rotation.y = Math.PI / 2; R.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const dz = z1 - z0, dx = x1 - x0;
    if (matToit) toit2(R, -dz / 2, dz / 2, -dx / 2, dx / 2, y, hr, matToit, pignon, deb, faite || '#3a2a20');
    else toitCanal(R, -dz / 2, dz / 2, -dx / 2, dx / 2, y, hr, col, pignon, deb);
    G.add(R); return R;
  }
  /** colonne (base, fût, chapiteau) */
  function colonne(G, x, z, y0, h, r, mat, chap = mat) {
    G.add(at(boite(2.5 * r, 0.14, 2.5 * r, chap), x, y0 + 0.07, z));
    G.add(at(cyl(r * 0.88, r, h - 0.34, mat, 14), x, y0 + 0.14 + (h - 0.34) / 2, z));
    G.add(at(cyl(r * 1.25, r * 0.9, 0.08, chap, 14), x, y0 + h - 0.24, z));
    G.add(at(boite(2.7 * r, 0.16, 2.7 * r, chap), x, y0 + h - 0.08, z));
  }
  /** fronton triangulaire, face avant à z, épaisseur prof */
  function fronton(G, cx, y, z, w, h, prof, mat) {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: prof, bevelEnabled: false }), mat); m.castShadow = true;
    G.add(at(m, cx, y, z - prof));
    // corniche rampante
    const L = Math.hypot(w / 2, h), a = Math.atan2(h, w / 2);
    for (const s of [-1, 1]) { const r = boite(L + 0.1, 0.1, prof + 0.12, mat); r.rotation.z = s * a; G.add(at(r, cx - s * w / 4, y + h / 2 + 0.03, z - prof / 2 + 0.03)); }
    G.add(at(boite(w + 0.2, 0.12, prof + 0.12, mat), cx, y - 0.02, z - prof / 2 + 0.03));
  }
  /** balustrade entre deux points (main courante et balustres) */
  function balustrade(G, x0, z0, x1, z1, y, mat, h = 0.45, pas = 0.28) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / pas));
    G.add(at(boite(Math.max(0.08, Math.abs(x1 - x0)), 0.08, Math.max(0.08, Math.abs(z1 - z0)), mat), (x0 + x1) / 2, y + h, (z0 + z1) / 2));
    for (let i = 0; i <= n; i++) G.add(at(cyl(0.035, 0.05, h, mat, 6), x0 + (x1 - x0) * i / n, y + h / 2, z0 + (z1 - z0) * i / n));
  }
  /** flamme (cône lumineux) */
  function flamme(G, x, y, z, s = 1, col = '#ff8a20', coeur = '#ffe070') {
    G.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.5 * s, 7), LUM(col, col)), x, y + 0.25 * s, z));
    G.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.3 * s, 6), LUM(coeur, coeur)), x, y + 0.17 * s, z + 0.06 * s));
  }
  /** torche sur pied (ou applique si h petit) */
  function torche(G, x, z, y0, h = 1.1, col = '#ff8a20') {
    G.add(at(cyl(0.05, 0.07, h, COL('#3a3230'), 6), x, y0 + h / 2, z));
    G.add(at(cyl(0.18, 0.08, 0.18, OR, 8), x, y0 + h + 0.05, z));
    flamme(G, x, y0 + h + 0.1, z, 0.9, col);
  }
  /** fenêtre cintrée (arc en plein cintre au-dessus), encadrement de pierre */
  function fenArc(G, x, y, z, w, h, cadre, verre = M({ map: TX.verre() })) {
    G.add(at(boite(w, h, 0.03, verre), x, y, z + 0.01));
    const ar = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 12, 0, Math.PI), verre); G.add(at(ar, x, y + h / 2, z + 0.01));
    const ca = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.04, 0.06, 4, 12, Math.PI), cadre); G.add(at(ca, x, y + h / 2, z + 0.05));
    for (const s of [-1, 1]) G.add(at(boite(0.08, h, 0.08, cadre), x + s * (w / 2 + 0.04), y, z + 0.05));
    G.add(at(boite(0.04, h + w / 2, 0.06, cadre), x, y + w / 4, z + 0.04));
    G.add(at(boite(w + 0.24, 0.08, 0.16, cadre), x, y - h / 2 - 0.04, z + 0.08));
  }
  /** caisses de produits colorés (étal) : petits fruits en grappe, comme les fleurs des jardinières */
  function caisse(G, x, y, z, couleurs) {
    G.add(at(boite(0.42, 0.16, 0.3, M({ map: TX.bois('#b88a5a') })), x, y + 0.08, z));
    for (let i = 0; i < 6; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), COL(couleurs[i % couleurs.length])), x - 0.13 + (i % 3) * 0.13, y + 0.19 + (i > 2 ? 0.02 : 0), z - 0.06 + (i > 2 ? 0.12 : 0)));
  }
  /** tas de bûches */
  function bucher(G, x, z, n = 3, L = 1.0) {
    for (let r = 0; r < n; r++) for (let i = 0; i < n + 1 - r; i++) { const b = cyl(0.1, 0.1, L, M({ map: TX.bois('#8a5a34') }), 7); b.rotation.x = Math.PI / 2; G.add(at(b, x + (i - (n - r) / 2) * 0.21, 0.1 + r * 0.18, z)); }
  }
  const cheminee = (G, x, y, z, col = '#a07a62', h = 1.0) => { G.add(at(boite(0.5, h, 0.5, M({ map: TX.pierre(col) })), x, y + h / 2, z)); G.add(at(boite(0.62, 0.1, 0.62, COL('#5a5552')), x, y + h + 0.05, z)); };

  /* -------------------------------------------------------------- maisons de village ------------------------------- */
  /** maison haute à colombages (4 × 4, quatre niveaux) : rez-de-chaussée de pierre à échoppe, trois étages en
   *  encorbellement, pignon sur rue très pentu, poulie de grenier */
  B.maisonHaute = ({ mur = '#f4e8cc', bois = '#5a3a26', toit = '#a84a32', rdc = '#c8bca8', fleurs = ['#f05a6a', '#fafaf2', '#f8d850'], volets = '#3a6a5a' } = {}) => {
    const G = new THREE.Group(), w = 4, d = 3.4, cx = 2, hE = 1.45, CB = M({ map: TX.colombage(mur, bois) });
    socle(G, 0, 0, w, d, 0.25, '#a8a090');
    G.add(at(boite(w, hE, d, M({ map: TX.pierre(rdc) })), cx, 0.25 + hE / 2, d / 2));
    porte(G, 1.0, d, 0.25, 1.1, M({ map: TX.bois('#6a3a22') }), COL('#4a3020'));
    G.add(at(boite(1.4, 0.8, 0.03, M({ map: TX.etals() })), 2.9, 0.95, d + 0.01));                      // échoppe
    for (const [dx, dy, ww, hh] of [[0, 0.42, 1.5, 0.08], [0, -0.42, 1.5, 0.08], [-0.72, 0, 0.08, 0.84], [0.72, 0, 0.08, 0.84]]) G.add(at(boite(ww, hh, 0.08, COL(bois)), 2.9 + dx, 0.95 + dy, d + 0.04));
    const st = boite(1.7, 0.05, 0.55, M({ map: TX.store('#c84a3a') })); st.rotation.x = 0.4; G.add(at(st, 2.9, 1.5, d + 0.25));
    G.add(at(boite(0.05, 0.05, 0.55, COL('#2a2a30')), 1.0, 1.72, d + 0.27)); G.add(at(boite(0.45, 0.32, 0.04, M({ map: TX.bois('#c89a5a') })), 1.0, 1.5, d + 0.52));
    let y = 0.25 + hE, o = 0;
    for (let k = 0; k < 3; k++) {
      o += 0.14;
      G.add(at(boite(w + 0.08, 0.14, d + o + 0.04, COL(bois)), cx, y + 0.07, (d + o) / 2));            // sablière
      G.add(at(boite(w, hE, d + o, CB), cx, y + 0.14 + hE / 2, (d + o) / 2));
      for (const xx of [1.0, 3.0]) fenetre2(G, xx, y + 0.85, d + o, 0.56, 0.62, { rideau: '#f0e0c8', volets, fleurs: k < 2 ? fleurs : null });
      y += hE + 0.14;
    }
    toitRue(G, 0, w, 0, d + o, y, 2.3, toit, CB, 0.32);
    fenetre2(G, cx, y + 0.65, d + o + 0.01, 0.42, 0.48, { rideau: '#f0e0c8' });
    G.add(at(boite(0.1, 0.1, 0.7, COL(bois)), cx, y + 1.45, d + o + 0.2)); G.add(at(cyl(0.1, 0.1, 0.06, COL('#3a3a3a'), 8), cx, y + 1.38, d + o + 0.5));   // poutre de levage
    cheminee(G, 3.1, y + 0.9, 1.0, '#a07a62', 1.2);
    return G;
  };
  /** maison longue de ferme avec extension (7 × 3) : pierre, tuiles canal, appentis de planches sur le côté (porte de
   *  grange), bûcher, banc */
  B.maisonExt = ({ pierre = '#cdbfa8', toit = '#b0583c', planches = '#8a6a4a' } = {}) => {
    const G = new THREE.Group(), w = 5, d = 3, H = 1.8, PM = M({ map: TX.pierre(pierre) });
    socle(G, 0, 0, w, d, 0.25, '#9a9284');
    G.add(at(boite(w, H, d, PM), w / 2, H / 2 + 0.25, d / 2));
    toitCanal(G, 0, w, 0, d, H + 0.25, 1.3, toit, M({ map: TX.pierre(pierre), side: THREE.DoubleSide }));
    for (const xx of [0.8, 3.0, 4.3]) fenetre2(G, xx, 1.3, d, 0.56, 0.56, { volets: '#6a8a5a', rideau: '#f4e8d0', fleurs: xx > 4 ? null : ['#f05a6a', '#fafaf2'] });
    porte(G, 1.9, d, 0.25, 1.15, M({ map: TX.bois('#6a8a5a') }), COL('#d8ccb4'));
    cheminee(G, 0.7, H + 0.9, 1.0, '#a89a84', 1.1);
    // appentis : x 5 → 7, z 0,4 → 3, toit en pente vers l'extérieur
    const PL = M({ map: TX.planches(planches) }), hA = 1.45;
    G.add(at(boite(2.1, hA, 2.6, PL), 6.05, hA / 2 + 0.1, 1.7));
    const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(2.1, 0); tri.lineTo(0, 0.55); tri.closePath();
    for (const zz of [0.4, 3.0]) { const tm = new THREE.Mesh(new THREE.ShapeGeometry(tri), M({ map: TX.planches(planches), side: THREE.DoubleSide })); G.add(at(tm, 5.0, hA + 0.1, zz)); }
    const ap = boite(2.45, 0.08, 3.0, M({ map: TX.canalPetit(toit) })); ap.rotation.z = -Math.atan2(0.55, 2.1); G.add(at(ap, 6.1, hA + 0.42, 1.7));
    G.add(at(boite(1.3, 1.25, 0.04, M({ map: TX.planches('#6a4a2a') })), 6.05, 0.72, 3.01));
    for (const s of [-1, 1]) { const x = boite(0.06, 1.7, 0.03, COL('#4a3020')); x.rotation.z = s * 0.8; G.add(at(x, 6.05, 0.72, 3.04)); }
    bucher(G, 6.1, 3.35, 3, 1.4);
    G.add(at(boite(1.0, 0.08, 0.3, M({ map: TX.bois('#a8744a') })), 3.4, 0.45, d + 0.3));
    return G;
  };
  /** chalet (5 × 4) : soubassement de pierre, étage de bois, grand toit de bardeaux à fort débord, balcon de bois
   *  découpé sur toute la façade, géraniums, bûcher */
  B.chalet = ({ bois = '#8a5a34', toit = '#5a4a40', fleurs = ['#e83a3a', '#f05a6a', '#fafaf2'] } = {}) => {
    const G = new THREE.Group(), w = 5, d = 3.4, cx = 2.5, BD = M({ map: TX.bardage(bois) });
    G.add(at(boite(w, 1.2, d, M({ map: TX.pierre('#a8a49a') })), cx, 0.6, d / 2));
    G.add(at(boite(w, 1.7, d, BD), cx, 1.2 + 0.85, d / 2));
    toitRue(G, 0, w, 0, d, 2.9, 1.5, null, BD, 0.85, M({ map: TX.bardeaux(toit) }), '#3a2a20');
    // décor du pignon : planches croisées, fenêtre
    fenetre2(G, cx, 3.45, d + 0.02, 0.5, 0.5, { rideau: '#f0e0c0', cadre: '#e8dcc0' });
    for (const s of [-1, 1]) { const p = boite(0.08, 1.9, 0.05, COL('#5a3a20')); p.rotation.z = s * 1.05; G.add(at(p, cx + s * 1.25, 3.38, d + 0.04)); }
    porte(G, 1.2, d, 0, 1.05, M({ map: TX.bois('#6a3a1a') }), COL('#5a3a20'));
    fenetre2(G, 3.5, 0.7, d, 0.6, 0.5, { volets: '#6a8a3a', rideau: '#f0e0c0', cadre: '#e8dcc0' });
    // balcon de l'étage
    G.add(at(boite(w + 0.2, 0.12, 0.85, M({ map: TX.bois('#a8744a') })), cx, 1.85, d + 0.42));
    for (let i = 0; i < 24; i++) { const x = 0.05 + i * (w - 0.1) / 23; G.add(at(boite(0.12, 0.5, 0.04, COL(i % 2 ? '#a8744a' : '#946038')), x, 2.17, d + 0.83)); }
    G.add(at(boite(w + 0.2, 0.08, 0.1, COL('#7a4a2a')), cx, 2.45, d + 0.83));
    for (const x of [0.15, w - 0.15]) G.add(at(boite(0.14, 2.9, 0.14, COL('#7a4a2a')), x, 1.45, d + 0.82));
    for (const xx of [1.0, 4.0]) { G.add(at(boite(0.95, 0.15, 0.2, M({ map: TX.bois('#7a4e2c') })), xx, 2.55, d + 0.85)); for (let i = 0; i < 6; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), COL(fleurs[i % 3])), xx - 0.38 + i * 0.15, 2.7, d + 0.86)); for (let i = 0; i < 3; i++) G.add(at(boite(0.06, 0.25, 0.06, COL('#3c8c3c')), xx - 0.3 + i * 0.3, 2.35, d + 0.95)); }
    fenetre2(G, 2.5, 2.2, d, 1.0, 0.8, { rideau: '#f0e0c0', cadre: '#e8dcc0' });
    cheminee(G, 3.8, 3.3, 1.2, '#9a948a', 1.0);
    bucher(G, -0.25, 1.8, 4, 1.2);
    return G;
  };
  /** cabane de chasseur (3 × 3) : rondins, toit de bardeaux, trophée de bois de cerf, peau tendue sur un cadre,
   *  billot et hache, tonneau, lanterne */
  B.cabaneChasseur = ({ bois = '#7a5232', toit = '#5a4a3a' } = {}) => {
    const G = new THREE.Group(), w = 3, d = 2.4, cx = 1.5, RO = M({ map: TX.rondins(bois) });
    G.add(at(boite(w, 1.55, d, RO), cx, 0.78, d / 2));
    for (const x of [0, w]) for (const z of [0, d]) for (let i = 0; i < 6; i++) { const b = cyl(0.11, 0.11, 0.3, COL(mix(bois, 0.1)), 7); b.rotation.x = Math.PI / 2; G.add(at(b, x, 0.12 + i * 0.26, z)); }
    toitRue(G, 0, w, 0, d, 1.55, 1.15, null, RO, 0.4, M({ map: TX.bardeaux(toit) }), '#3a2a1a');
    porte(G, cx, d, 0, 1.05, M({ map: TX.planches('#5a3a20') }), COL('#4a2a14'));
    // bois de cerf au-dessus de la porte
    const OS = COL('#e8dcc0');
    G.add(at(boite(0.3, 0.2, 0.06, M({ map: TX.bois('#6a4020') })), cx, 1.62, d + 0.05));
    for (const s of [-1, 1]) {
      const a = boite(0.05, 0.55, 0.05, OS); a.rotation.z = s * 0.7; G.add(at(a, cx + s * 0.2, 1.85, d + 0.1));
      for (const k of [0, 1]) { const p = boite(0.04, 0.22, 0.04, OS); p.rotation.z = -s * 0.2; G.add(at(p, cx + s * (0.22 + k * 0.12), 1.95 + k * 0.1, d + 0.1)); }
    }
    G.add(at(boite(0.45, 0.4, 0.03, M({ map: TX.verre() })), 2.4, 0.95, d + 0.01));
    // peau sur cadre, billot, hache, tonneau, lanterne
    for (const x of [-0.65, -0.05]) G.add(at(boite(0.06, 1.2, 0.06, COL('#5a3a20')), x, 0.6, d + 0.3));
    G.add(at(boite(0.65, 0.06, 0.06, COL('#5a3a20')), -0.35, 1.15, d + 0.3)); G.add(at(boite(0.65, 0.06, 0.06, COL('#5a3a20')), -0.35, 0.25, d + 0.3));
    G.add(at(boite(0.5, 0.75, 0.02, COL('#b8865a')), -0.35, 0.7, d + 0.31));
    G.add(at(cyl(0.25, 0.27, 0.35, M({ map: TX.bois('#9a6a3a') }), 10), 2.6, 0.17, d + 0.5));
    const h = boite(0.05, 0.5, 0.05, COL('#6a4020')); h.rotation.z = 0.5; G.add(at(h, 2.68, 0.55, d + 0.5)); G.add(at(boite(0.18, 0.12, 0.03, COL('#b8bcc4')), 2.82, 0.75, d + 0.5));
    G.add(at(cyl(0.2, 0.2, 0.5, M({ map: TX.bois('#7a5232') }), 10), 3.05, 0.25, 1.2));
    G.add(at(boite(0.14, 0.2, 0.14, LUM('#fff0b0', '#806020')), 0.9, 1.25, d + 0.08));
    bucher(G, 3.2, 0.4, 3, 0.8);
    return G;
  };
  /** cabane de pêcheur (4 × 4) : planches délavées, tôle rouge, ponton de bois, filets tendus, bouées, tonneaux,
   *  barque retournée, séchoir à poissons */
  B.cabanePecheur = ({ planches = '#7a98aa', toit = '#b84a3a' } = {}) => {
    const G = new THREE.Group(), PL = M({ map: TX.planches(planches) });
    // plancher sur pilotis
    G.add(at(boite(4, 0.18, 4, M({ map: TX.planches('#9a7a5a') })), 2, 0.3, 2));
    for (const x of [0.15, 2, 3.85]) for (const z of [0.15, 2, 3.85]) G.add(at(cyl(0.08, 0.08, 0.4, COL('#5a4430'), 6), x, 0.15, z));
    G.add(at(boite(3, 1.6, 2.4, PL), 1.7, 1.19, 1.3));
    toit2(G, 0.2, 3.2, 0.1, 2.5, 1.99, 0.9, M({ map: TX.tole(toit) }), PL, 0.25, '#7a2a20');
    porte(G, 1.2, 2.5, 0.39, 1.05, M({ map: TX.planches('#4a6a7a') }), COL('#e8e4dc'));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), M({ map: TX.verre() })), 2.4, 1.35, 2.51));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.04, 6, 12), COL('#e8e4dc')), 2.4, 1.35, 2.53));
    // filets tendus sur le côté
    for (const z of [0.4, 2.2]) G.add(at(boite(0.06, 1.6, 0.06, COL('#5a4430')), 3.65, 1.2, z));
    const filet = boite(0.02, 1.0, 1.8, M({ map: TX.treillis('#6a5a40'), transparent: true, opacity: 0.8 })); G.add(at(filet, 3.65, 1.4, 1.3));
    // bouées, tonneaux, caisse, rames
    for (const [x, z, c] of [[0.3, 2.9, '#e83a3a'], [0.55, 3.1, '#f8f4ec'], [3.5, 3.0, '#f0a020']]) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), COL(c)), x, 0.55, z));
    for (const [x, z] of [[2.9, 3.3], [3.4, 3.5]]) G.add(at(cyl(0.22, 0.22, 0.5, M({ map: TX.bois('#8a5a34') }), 10), x, 0.64, z));
    G.add(at(boite(0.5, 0.3, 0.4, M({ map: TX.bois('#b88a5a') })), 2.2, 0.54, 3.3));
    for (const x of [0.15, 0.32]) { const r = boite(0.06, 1.4, 0.1, M({ map: TX.bois('#c8a070') })); r.rotation.z = -0.15; G.add(at(r, x, 1.1, 2.0)); }
    // séchoir à poissons
    G.add(at(boite(0.05, 0.9, 0.05, COL('#5a4430')), 0.8, 0.85, 3.7)); G.add(at(boite(0.05, 0.9, 0.05, COL('#5a4430')), 2.0, 0.85, 3.7));
    G.add(at(boite(1.25, 0.03, 0.03, COL('#5a4430')), 1.4, 1.28, 3.7));
    for (let i = 0; i < 5; i++) G.add(at(boite(0.07, 0.22, 0.03, COL('#a8b4bc')), 0.95 + i * 0.22, 1.12, 3.7));
    // barque retournée
    const bq = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.6, 10, 1, false, 0, Math.PI), M({ map: TX.planches('#c8583a'), side: THREE.DoubleSide }));
    bq.rotation.z = Math.PI / 2; bq.castShadow = true; G.add(at(bq, 4.5, 0.05, 2.6));
    return G;
  };
  /** grange (6 × 5) : planches rouges à encadrements blancs, toit à la Mansart (deux pentes) de bardeaux, grande porte
   *  à croix de Saint-André, porte du fenil, bottes de foin, charrette */
  B.grange = ({ planches = '#a83a2a', toit = '#5a5450' } = {}) => {
    const G = new THREE.Group(), w = 5, d = 4.5, H = 2.2, cx = 2.5, PL = M({ map: TX.planches(planches) }), BL = COL('#f2eee6');
    G.add(at(boite(w, H, d, PL), cx, H / 2, d / 2));
    const a = w / 2 + 0.25, sh = new THREE.Shape(); sh.moveTo(-a, 0); sh.lineTo(-a * 0.78, 1.3); sh.lineTo(0, 2.0); sh.lineTo(a * 0.78, 1.3); sh.lineTo(a, 0); sh.closePath();
    const gr = new THREE.ExtrudeGeometry(sh, { depth: d + 0.4, bevelEnabled: false });
    const uv = gr.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
    const r = new THREE.Mesh(gr, [M({ map: TX.planches(planches) }), M({ map: TX.bardeaux(toit) })]); r.castShadow = r.receiveShadow = true; G.add(at(r, cx, H, -0.2));
    for (const [x, y, ww, hh] of [[cx, H, w + 0.1, 0.12], [0.05, H / 2, 0.12, H], [w - 0.05, H / 2, 0.12, H]]) G.add(at(boite(ww, hh, 0.08, BL), x, y, d + 0.02));
    G.add(at(boite(2.0, 1.8, 0.05, M({ map: TX.planches(mix(planches, -0.1)) })), cx, 0.9, d + 0.03));
    for (const [x, y, ww, hh] of [[cx, 1.8, 2.1, 0.1], [cx - 1.0, 0.9, 0.1, 1.8], [cx + 1.0, 0.9, 0.1, 1.8], [cx, 0.9, 0.08, 1.8]]) G.add(at(boite(ww, hh, 0.08, BL), x, y, d + 0.06));
    for (const s of [-1, 1]) for (const o of [-1, 1]) { const x = boite(0.08, 2.0, 0.05, BL); x.rotation.z = s * 0.5; G.add(at(x, cx + o * 0.5, 0.9, d + 0.07)); }
    G.add(at(boite(0.8, 0.7, 0.05, M({ map: TX.planches('#6a2a1a') })), cx, H + 0.8, d + 0.22));
    G.add(at(boite(0.9, 0.08, 0.06, BL), cx, H + 1.18, d + 0.24)); G.add(at(boite(0.1, 0.1, 0.6, COL('#5a4430')), cx, H + 1.35, d + 0.45));
    for (const [x, z] of [[-0.3, d + 0.2], [-0.3, d - 0.6], [0.2, d + 0.5]]) { const b = cyl(0.32, 0.32, 0.55, COL('#e0c060'), 12); b.rotation.z = Math.PI / 2; G.add(at(b, x, 0.32, z)); }
    G.add(at(boite(1.2, 0.1, 0.7, M({ map: TX.bois('#9a6a3a') })), w + 0.4, 0.6, 2.0));
    for (const z of [1.6, 2.4]) { const rr = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 4, 12), COL('#5a3a20')); rr.rotation.y = Math.PI / 2; G.add(at(rr, w + 0.4, 0.34, z)); }
    G.add(at(boite(0.06, 0.06, 1.0, COL('#5a3a20')), w + 0.4, 0.62, 3.0));
    for (let i = 0; i < 5; i++) G.add(at(boite(0.2, 0.15, 0.2, COL('#e0c060')), w + 0.1 + i * 0.15, 0.72, 2.0));
    return G;
  };
  /** moulin à vent (4 × 4) : tour de pierre blanchie, chapeau conique de bardeaux, quatre ailes à lattes, sacs de farine */
  B.moulin = ({ mur = '#e8e2d4', toit = '#6a4a3a' } = {}) => {
    const G = new THREE.Group(), cx = 2, cz = 2;
    G.add(at(cyl(1.2, 1.55, 4.6, M({ map: TX.enduit(mur) }), 20), cx, 2.3, cz));
    G.add(at(cyl(1.25, 1.25, 0.15, COL('#8a6a4a'), 20), cx, 4.6, cz));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.42, 1.5, 20), M({ map: TX.bardeaux(toit) })); cone.castShadow = true; G.add(at(cone, cx, 5.4, cz));
    G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), OR), cx, 6.2, cz));
    porte(G, cx, cz + 1.53, 0, 1.1, M({ map: TX.bois('#5a3a20') }), COL('#8a6a4a'), 0.7);
    for (const [y, a] of [[2.3, 0.4], [3.4, -0.3]]) G.add(at(boite(0.32, 0.4, 0.05, M({ map: TX.verre() })), cx + Math.sin(a) * 1.4, y, cz + Math.cos(a) * 1.4));
    const hub = cyl(0.18, 0.18, 0.5, COL('#5a3a20'), 10); hub.rotation.x = Math.PI / 2; G.add(at(hub, cx, 4.3, cz + 1.4));
    const ailes = new THREE.Group(); ailes.position.set(cx, 4.3, cz + 1.65); ailes.rotation.z = 0.3;
    for (let k = 0; k < 4; k++) {
      const A = new THREE.Group(); A.rotation.z = k * Math.PI / 2;
      A.add(at(boite(0.1, 3.0, 0.08, COL('#6a4a2a')), 0, 1.6, 0));
      A.add(at(boite(0.62, 2.4, 0.02, M({ map: TX.treillis('#6a4a2a') })), 0.38, 1.85, 0));
      for (let i = 0; i < 7; i++) A.add(at(boite(0.7, 0.04, 0.05, COL('#6a4a2a')), 0.36, 0.75 + i * 0.37, 0.02));
      ailes.add(A);
    }
    ailes.traverse((o) => { if (o.isMesh) o.castShadow = true; }); G.add(ailes);
    for (const [x, z] of [[cx + 1.2, cz + 1.5], [cx + 1.55, cz + 1.3], [cx + 1.35, cz + 1.75]]) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), COL('#e8dcc0')), x, 0.18, z));
    return G;
  };
  /** phare (3 × 3) : soubassement de pierre, tour à bandes rouges et blanches, galerie à garde-corps, lanterne
   *  allumée, coupole rouge */
  B.phare = ({ bande = '#d03a32' } = {}) => {
    const G = new THREE.Group(), cx = 1.5, cz = 1.5, N = 6, Ht = 7.2;
    G.add(at(cyl(1.45, 1.55, 0.6, M({ map: TX.pierre('#a8a49a') }), 8), cx, 0.3, cz));
    for (let i = 0; i < N; i++) { const r0 = 1.05 - 0.3 * i / N, r1 = 1.05 - 0.3 * (i + 1) / N; G.add(at(cyl(r1, r0, Ht / N, COL(i % 2 ? bande : '#f4f2ec'), 18), cx, 0.6 + Ht / N * (i + 0.5), cz)); }
    const yg = 0.6 + Ht;
    G.add(at(cyl(1.05, 0.85, 0.2, COL('#3a3a40'), 18), cx, yg + 0.1, cz));
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; G.add(at(boite(0.04, 0.45, 0.04, COL('#2a2a30')), cx + Math.cos(a) * 1.0, yg + 0.42, cz + Math.sin(a) * 1.0)); }
    const an = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 4, 24), COL('#2a2a30')); an.rotation.x = Math.PI / 2; G.add(at(an, cx, yg + 0.64, cz));
    G.add(at(cyl(0.55, 0.55, 0.9, LUM('#fff4b0', '#c09020'), 12), cx, yg + 0.65, cz));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; G.add(at(boite(0.05, 0.9, 0.05, COL('#2a2a30')), cx + Math.cos(a) * 0.56, yg + 0.65, cz + Math.sin(a) * 0.56)); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), COL(bande)); dome.castShadow = true; G.add(at(dome, cx, yg + 1.1, cz));
    G.add(at(cyl(0.03, 0.06, 0.5, COL('#2a2a30'), 6), cx, yg + 1.9, cz));
    porte(G, cx, cz + 1.0, 0.6, 1.0, M({ map: TX.bois('#3a5a7a') }), COL('#f4f2ec'), 0.6);
    for (let k = 0; k < 3; k++) G.add(at(boite(1.0 - k * 0.15, 0.2, 0.25, M({ map: TX.pierre('#a8a49a') })), cx, 0.1 + (2 - k) * 0.2, cz + 1.65 + k * 0.22 - 0.1));
    for (const [y, a] of [[3.0, 0.5], [5.0, -0.4]]) G.add(at(boite(0.24, 0.36, 0.04, M({ map: TX.verre() })), cx + Math.sin(a) * 0.98, y, cz + Math.cos(a) * 0.98 - 0.05));
    return G;
  };
  /** auberge (6 × 4) : rez-de-chaussée de pierre, étage à colombages, deux lucarnes, enseigne pendue, terrasse à
   *  tables et parasols, tonneaux */
  B.auberge = ({ mur = '#f2e4c4', bois = '#4a3020', toit = '#a8503a' } = {}) => {
    const G = new THREE.Group(), w = 6, d = 3.2, cx = 3, CB = M({ map: TX.colombage(mur, bois) });
    socle(G, 0, 0, w, d, 0.25, '#a8a090');
    G.add(at(boite(w, 1.6, d, M({ map: TX.pierre('#c4b8a4') })), cx, 1.05, d / 2));
    G.add(at(boite(w + 0.1, 0.14, d + 0.25, COL(bois)), cx, 1.92, d / 2 + 0.1));
    G.add(at(boite(w, 1.5, d + 0.2, CB), cx, 2.74, d / 2 + 0.1));
    toitCanal(G, 0, w, 0, d + 0.2, 3.49, 1.5, toit, CB);
    for (const xx of [1.5, 4.5]) { G.add(at(boite(0.9, 0.75, 0.8, CB), xx, 4.0, d - 0.55)); toitCanal(G, xx - 0.45, xx + 0.45, d - 0.95, d - 0.15, 4.37, 0.38, toit, CB, 0.12); fenetre2(G, xx, 4.02, d - 0.14, 0.44, 0.4, { rideau: '#f0d0a0' }); }
    for (const xx of [0.9, 2.2, 3.8, 5.1]) fenetre2(G, xx, 2.75, d + 0.2, 0.55, 0.6, { volets: '#7a3a2a', rideau: '#f0d0a0', fleurs: ['#f05a6a', '#f8d850', '#fafaf2'] });
    for (const xx of [1.2, 4.8]) fenArc(G, xx, 1.0, d, 0.8, 0.6, M({ map: TX.pierre('#d8ccb4') }));
    porte(G, cx, d, 0.25, 1.25, M({ map: TX.bois('#6a3a1a') }), COL(bois), 1.0);
    // enseigne pendue à une potence de fer forgé
    G.add(at(boite(0.06, 0.06, 0.8, COL('#2a2a30')), cx + 0.9, 2.0, d + 0.4)); G.add(at(boite(0.55, 0.42, 0.05, M({ map: TX.bois('#c89a5a') })), cx + 0.9, 1.7, d + 0.7));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), OR), cx + 0.9, 1.72, d + 0.73));
    // terrasse
    for (const [x, c] of [[0.9, '#c83a3a'], [5.1, '#3a6ac8']]) {
      G.add(at(cyl(0.38, 0.38, 0.06, M({ map: TX.bois('#a8744a') }), 12), x, 0.75, d + 0.85)); G.add(at(cyl(0.05, 0.05, 0.72, COL('#3a3a3a'), 6), x, 0.36, d + 0.85));
      for (const s of [-1, 1]) G.add(at(boite(0.3, 0.42, 0.3, M({ map: TX.bois('#8a5a34') })), x + s * 0.55, 0.21, d + 0.85));
      G.add(at(cyl(0.03, 0.03, 1.5, COL('#e8e4dc'), 6), x, 1.4, d + 0.85));
      const pa = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.4, 8), M({ map: TX.store(c) })); pa.castShadow = true; G.add(at(pa, x, 2.1, d + 0.85));
    }
    for (const x of [2.1, 3.9]) G.add(at(cyl(0.24, 0.24, 0.55, M({ map: TX.bois('#8a5a34') }), 10), x, 0.28, d + 0.4));
    cheminee(G, 5.2, 4.2, 1.2, '#a07a62', 1.0);
    return G;
  };
  /** chapelle (4 × 7) : nef de pierre, toit d'ardoise pentu, clocher-porche à flèche et croix, rosace, portail en arc,
   *  contreforts, vitraux */
  B.chapelle = ({ pierre = '#d4ccbc', toit = '#4a5266' } = {}) => {
    const G = new THREE.Group(), PM = M({ map: TX.pierre(pierre) }), cx = 2;
    G.add(at(boite(3, 2.7, 4.8, PM), cx, 1.35, 2.4));
    toitRue(G, 0.5, 3.5, 0, 4.8, 2.7, 2.1, null, PM, 0.25, M({ map: TX.ardoise(toit) }), '#2a3040');
    for (const z of [0.6, 1.8, 3.0]) for (const s of [-1, 1]) { G.add(at(boite(0.3, 2.0, 0.35, PM), cx + s * 1.62, 1.0, z)); }
    for (const z of [1.2, 2.4, 3.6]) for (const s of [1]) { const v = boite(0.03, 1.0, 0.36, M({ map: TX.vitrail('#3a6ac8') })); G.add(at(v, cx + s * 1.51, 1.6, z)); }
    // clocher-porche : z 4,8 → 6,3
    const zc = 5.55;
    G.add(at(boite(1.6, 4.9, 1.5, PM), cx, 2.45, zc));
    G.add(at(boite(1.75, 0.15, 1.65, M({ map: TX.pierre(mix(pierre, -0.1)) })), cx, 3.4, zc));
    for (const [dx, dz] of [[0, 0.76], [0.81, 0]]) G.add(at(boite(dx ? 0.03 : 0.5, 0.8, dx ? 0.5 : 0.03, COL('#1a1614')), cx + dx, 4.0, zc + dz));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.35, 14, 0, Math.PI), COL('#1a1614')), cx, 4.4, zc + 0.76));
    G.add(toit4(G, cx, zc, 4.9, 0.95, 0.9, 2.6, M({ map: TX.ardoise(toit) }), 0));
    G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), OR), cx, 7.6, zc));
    const ro = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), M({ map: TX.vitrail('#c83a5a') })); G.add(at(ro, cx, 2.6, zc + 0.76));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 6, 16), PM), cx, 2.6, zc + 0.78));
    G.add(at(boite(0.8, 1.2, 0.04, M({ map: TX.bois('#5a3020') })), cx, 0.6, zc + 0.76));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.4, 12, 0, Math.PI), M({ map: TX.bois('#5a3020') })), cx, 1.2, zc + 0.76));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.08, 6, 12, Math.PI), PM), cx, 1.2, zc + 0.8));
    for (const s of [-1, 1]) G.add(at(boite(0.12, 1.2, 0.12, PM), cx + s * 0.46, 0.6, zc + 0.8));
    return G;
  };
  /** boulangerie (4 × 4) : boutique à store rayé, vitrine de pains, enseigne en forme de miche, étage à volets,
   *  cheminée du four, panière dehors */
  B.boulangerie = ({ mur = '#f4ead4', toit = '#b8603a', acc = '#8a5a2a' } = {}) => {
    const G = new THREE.Group(), w = 4, d = 3.2, cx = 2;
    socle(G, 0, 0, w, d, 0.2, '#a8a090');
    G.add(at(boite(w, 2.9, d, M({ map: TX.enduit(mur) })), cx, 1.65, d / 2));
    G.add(at(boite(w, 1.2, 0.06, COL(acc)), cx, 0.95, d + 0.02));
    toitCanal(G, 0, w, 0, d, 3.1, 1.25, toit, M({ map: TX.enduit(mur), side: THREE.DoubleSide }));
    // vitrine : étagères et pains
    G.add(at(boite(1.8, 0.9, 0.03, COL('#3a2a1a')), 1.15, 0.95, d + 0.05));
    for (const y of [0.65, 1.05]) { G.add(at(boite(1.7, 0.04, 0.12, COL('#c8a070')), 1.15, y, d + 0.08)); for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 2, 6), COL(i % 2 ? '#d89a50' : '#c07a38')); p.rotation.z = Math.PI / 2; G.add(at(p, 0.4 + i * 0.29, y + 0.08, d + 0.1)); } }
    G.add(at(boite(1.8, 0.92, 0.02, M({ color: new THREE.Color('#cfe4f4'), transparent: true, opacity: 0.25 })), 1.15, 0.95, d + 0.12));
    portesVitrees(G, 3.2, d + 0.02, 0.9, 1.35, COL(acc));
    const st = boite(4.1, 0.05, 0.75, M({ map: TX.store('#8a5a2a') })); st.rotation.x = 0.38; G.add(at(st, cx, 1.8, d + 0.32));
    // enseigne : une miche dorée
    G.add(at(boite(0.06, 0.06, 0.6, COL('#2a2a30')), 3.6, 2.3, d + 0.3));
    const mi = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 8), M({ color: new THREE.Color('#d89a40'), emissive: new THREE.Color('#3a2000') })); mi.rotation.z = Math.PI / 2; G.add(at(mi, 3.6, 2.05, d + 0.55));
    for (const xx of [1.0, 3.0]) fenetre2(G, xx, 2.55, d, 0.55, 0.6, { volets: acc, rideau: '#f8ecd0', fleurs: ['#f8d850', '#fafaf2'] });
    cheminee(G, 0.7, 3.6, 1.0, '#a07a62', 1.2);
    G.add(at(cyl(0.3, 0.22, 0.25, COL('#b88a4a'), 10), 0.35, 0.35, d + 0.5));
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.4, 2, 6), COL('#d89a50')); p.rotation.x = 0.4 + i * 0.1; p.rotation.z = (i - 1.5) * 0.25; G.add(at(p, 0.35 + (i - 1.5) * 0.06, 0.6, d + 0.5)); }
    return G;
  };
  /** maison de thé (5 × 4) : plancher surélevé et galerie de bois (engawa), murs de shoji, poteaux sombres, toit à
   *  coins doucement relevés, lanternes de pierre, pin taillé, pas japonais */
  B.maisonThe = ({ toit = '#4a4e58', bois = '#4a3020' } = {}) => {
    const G = new THREE.Group(), cx = 2.5, cz = 1.6;
    G.add(at(boite(4.6, 0.45, 3.4, M({ map: TX.planches('#9a7448') })), cx, 0.22, cz + 0.2));
    G.add(at(boite(3.6, 1.7, 2.4, M({ map: TX.shoji() })), cx, 1.3, cz));
    for (const x of [0.25, 1.4, 2.5, 3.6, 4.75]) G.add(at(boite(0.12, 1.75, 0.12, COL(bois)), x, 1.3, cz + 1.75));
    G.add(at(boite(4.6, 0.14, 0.14, COL(bois)), cx, 2.15, cz + 1.75));
    G.add(at(boite(1.2, 1.45, 0.04, M({ map: TX.shoji() })), cx, 1.2, cz + 1.21));
    toitChinois(G, cx, cz + 0.2, 2.2, 2.75, 2.1, 1.1, { col: toit, rive: '#2a2a30', bord: '#5a5a62', xt: 1.3, zt: 0.12, lift: 0.22, flare: 0.05, uvk: 0.7, ornement: false });
    G.add(at(boite(2.7, 0.14, 0.24, COL('#3a3a42')), cx, 3.33, cz + 0.2));
    for (let k = 0; k < 2; k++) G.add(at(boite(1.2, 0.15, 0.32, M({ map: TX.pierre('#a8a49a') })), cx, 0.07 + (1 - k) * 0.15, cz + 2.05 + k * 0.3));
    for (const s of [-1, 1]) {   // lanternes de pierre (tōrō)
      const x = cx + s * 2.0, z = cz + 2.6, P = M({ map: TX.pierre('#9a968c') });
      G.add(at(cyl(0.1, 0.14, 0.55, P, 6), x, 0.28, z)); G.add(at(boite(0.38, 0.28, 0.38, P), x, 0.68, z));
      G.add(at(boite(0.2, 0.16, 0.04, LUM('#fff0b0', '#806020')), x, 0.68, z + 0.18));
      G.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.25, 4), P), x, 0.95, z)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), P), x, 1.1, z));
    }
    for (const [x, z, r] of [[5.0, 0.4, 0.35], [5.1, 0.9, 0.28], [4.9, 1.3, 0.22]]) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(r, 8, 5), COL('#3a6a3a')), x, 0.55 + r, z));
    G.add(at(cyl(0.06, 0.08, 0.8, COL('#5a3a20'), 6), 5.0, 0.4, 0.8));
    for (let i = 0; i < 3; i++) G.add(at(cyl(0.22, 0.24, 0.05, M({ map: TX.pierre('#b0aca2') }), 8), cx + (i % 2 ? 0.2 : -0.15), 0.03, cz + 2.8 + i * 0.5));
    return G;
  };
  /** gare (8 × 4) : briques, toit d'ardoise, horloge sous un petit fronton, trois portes en arc (celle du milieu de
   *  2 cases), marquise vitrée sur colonnettes de fonte au-dessus du quai, banc */
  B.gare = ({ brique = '#b86a4a', toit = '#3c4354' } = {}) => {
    const G = new THREE.Group(), w = 6, d = 3.2, cx = 3, BR = M({ map: TX.brique(brique) }), PB = M({ map: TX.pierre('#e2d8c4') });
    socle(G, 0, 0, w, d, 0.25, '#9a9284');
    G.add(at(boite(w, 2.6, d, BR), cx, 1.55, d / 2));
    for (const y of [0.4, 2.8]) G.add(at(boite(w + 0.06, 0.14, d + 0.06, PB), cx, y, d / 2));
    G.add(toit4(G, cx, d / 2, 2.85, w / 2 + 0.25, d / 2 + 0.25, 1.3, M({ map: TX.ardoise(toit) }), 0.45));
    fronton(G, cx, 2.85, d + 0.12, 2.2, 0.8, 0.3, PB);
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), COL('#f8f4e8')), cx, 3.2, d + 0.13));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 20), OR), cx, 3.2, d + 0.14));
    G.add(at(boite(0.03, 0.2, 0.02, COL('#2a2a30')), cx, 3.27, d + 0.15)); G.add(at(boite(0.14, 0.03, 0.02, COL('#2a2a30')), cx + 0.06, 3.2, d + 0.15));
    G.add(at(boite(2.4, 0.3, 0.05, COL('#2a3a5a')), cx, 2.45, d + 0.03)); G.add(at(boite(2.1, 0.12, 0.06, COL('#f0e8d0')), cx, 2.45, d + 0.05));
    fenArc(G, cx, 1.15, d, 1.6, 1.2, PB, M({ map: TX.verre() }));
    for (const xx of [1.0, 5.0]) fenArc(G, xx, 1.15, d, 0.8, 1.1, PB);
    for (const xx of [0.25, 5.75]) G.add(at(boite(0.3, 2.6, 0.12, PB), xx, 1.55, d + 0.04));
    // marquise du quai (x 6 → 8)
    for (const z of [0.3, 1.6, 2.9]) { G.add(at(cyl(0.05, 0.07, 2.3, COL('#2a4a3a'), 8), 7.7, 1.15, z)); G.add(at(boite(1.7, 0.06, 0.06, COL('#2a4a3a')), 6.85, 2.3, z)); }
    const mq = boite(2.0, 0.05, 3.2, M({ color: new THREE.Color('#bfe0f0'), transparent: true, opacity: 0.6 })); mq.rotation.z = -0.12; G.add(at(mq, 7.0, 2.4, 1.6));
    G.add(at(boite(0.05, 0.08, 3.2, COL('#2a4a3a')), 7.95, 2.3, 1.6));
    G.add(at(boite(0.4, 0.08, 1.2, M({ map: TX.bois('#a8744a') })), 6.6, 0.42, 1.6)); G.add(at(boite(0.06, 0.4, 1.2, M({ map: TX.bois('#a8744a') })), 6.42, 0.65, 1.6));
    G.add(at(boite(0.06, 0.06, 0.06, COL('#2a2a30')), 7.7, 2.0, 3.0)); G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), COL('#f8f4e8')), 7.7, 1.75, 3.08));
    return G;
  };
  /** kiosque à musique (4 × 4) : estrade octogonale, colonnettes de fonte, garde-corps, toit en pavillon de zinc vert,
   *  épi doré, lanternes */
  B.kiosque = ({ toit = '#4a8a78', fonte = '#2a3a34' } = {}) => {
    const G = new THREE.Group(), c = 2;
    G.add(at(cyl(1.85, 1.95, 0.55, M({ map: TX.pierre('#d8d0c0') }), 8), c, 0.27, c));
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * Math.PI * 2, x = c + Math.cos(a) * 1.6, z = c + Math.sin(a) * 1.6;
      G.add(at(cyl(0.05, 0.06, 2.0, COL(fonte), 6), x, 1.55, z));
      if (i !== 1) { const b = (i + 1.5) / 8 * Math.PI * 2; balustrade(G, x, z, c + Math.cos(b) * 1.6, c + Math.sin(b) * 1.6, 0.55, COL(fonte), 0.4, 0.15); }
      G.add(at(boite(0.12, 0.2, 0.12, LUM('#fff0b0', '#806020')), x, 2.35, z));
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.25, 1.4, 8, 1, false, Math.PI / 8), M({ map: TX.tole(toit) })); cone.castShadow = true; G.add(at(cone, c, 3.25, c));
    G.add(at(cyl(2.25, 2.25, 0.14, COL('#f0ece2'), 8), c, 2.55, c));
    G.add(at(cyl(0.04, 0.1, 0.7, OR, 6), c, 4.2, c)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), OR), c, 4.6, c));
    for (let k = 0; k < 3; k++) G.add(at(boite(0.9, 0.18, 0.25, M({ map: TX.pierre('#d8d0c0') })), c, 0.09 + (2 - k) * 0.17, c + 1.85 + k * 0.22));
    return G;
  };
  /** puits (2 × 2) : margelle ronde, deux montants, petit toit de tuiles, treuil et seau */
  B.puits = () => {
    const G = new THREE.Group(), c = 1;
    G.add(at(cyl(0.7, 0.75, 0.7, M({ map: TX.pierre('#b8b0a0') }), 14), c, 0.35, c));
    G.add(at(cyl(0.55, 0.55, 0.02, COL('#1a2430'), 14), c, 0.69, c));
    for (const s of [-1, 1]) G.add(at(boite(0.1, 1.5, 0.1, M({ map: TX.bois('#6a4a2a') })), c + s * 0.6, 1.2, c));
    toit2(G, c - 0.75, c + 0.75, c - 0.55, c + 0.55, 1.9, 0.5, M({ map: TX.canalPetit('#b0503a') }), COL('#6a4a2a'), 0.1);
    const tr = cyl(0.08, 0.08, 1.15, COL('#6a4a2a'), 8); tr.rotation.z = Math.PI / 2; G.add(at(tr, c, 1.55, c));
    G.add(at(boite(0.02, 0.5, 0.02, COL('#c8b890')), c, 1.25, c)); G.add(at(cyl(0.12, 0.1, 0.18, COL('#7a5a3a'), 8), c, 0.95, c));
    return G;
  };
  /** étal de marché (2 × 2) : table, caisses de fruits et légumes, store rayé sur montants */
  B.etal = ({ store = '#d84a3a' } = {}) => {
    const G = new THREE.Group();
    G.add(at(boite(1.8, 0.08, 0.9, M({ map: TX.bois('#a8744a') })), 1, 0.72, 1));
    for (const x of [0.2, 1.8]) for (const z of [0.65, 1.35]) G.add(at(boite(0.06, 0.72, 0.06, COL('#6a4a2a')), x, 0.36, z));
    const C = [['#e83a3a', '#c82a2a'], ['#f0a020', '#f8c040'], ['#5ab040', '#3c8c3c'], ['#a050c0', '#7a3a9a'], ['#f8e060', '#e8c840'], ['#e86a3a']];
    for (let i = 0; i < 6; i++) caisse(G, 0.4 + (i % 3) * 0.6, 0.76, 0.8 + Math.floor(i / 3) * 0.4, C[i]);
    for (const x of [0.12, 1.88]) G.add(at(boite(0.05, 1.8, 0.05, COL('#6a4a2a')), x, 0.9, 0.5));
    const st = boite(2.0, 0.04, 1.1, M({ map: TX.store(store) })); st.rotation.x = 0.3; G.add(at(st, 1, 1.75, 0.95));
    for (let i = 0; i < 2; i++) caisse(G, 0.5 + i * 1.0, 0, 1.75, C[i + 2]);
    return G;
  };
  /* -------------------------------------------------------------- centre de soins (v4) ------------------------------ */
  /** centre de soins (7 × 5, plus large que profond) : enduit blanc, chaînes d'angle, toit d'ardoise rouge à croupes et
   *  lucarnes (comme la mairie), avant-corps à fronton et grande enseigne ronde, portes vitrées de 2 cases sous une
   *  imposte en arc, grandes baies cintrées ; va au village comme à la ville */
  B.centre = ({ toit = '#c8383a', mur = '#f6f2ea' } = {}) => {
    const G = new THREE.Group(), w = 7, d = 4.2, H = 2.9, cx = 3.5, PB = M({ map: TX.pierre('#e2dccc') }), R = COL('#d63a3a'), EN = M({ map: TX.enduit(mur) });
    socle(G, 0, 0, w, d, 0.3, '#b8b4aa');
    G.add(at(boite(w, H, d, EN), cx, H / 2 + 0.3, d / 2));
    for (const xx of [0.1, w - 0.1]) G.add(at(boite(0.24, H, 0.24, PB), xx, H / 2 + 0.3, d));
    G.add(at(boite(w + 0.06, 0.14, d + 0.06, R), cx, 2.2, d / 2));
    G.add(at(boite(w + 0.24, 0.18, d + 0.24, PB), cx, H + 0.36, d / 2));
    G.add(toit4(G, cx, d / 2, H + 0.45, w / 2 + 0.3, d / 2 + 0.3, 1.45, M({ map: TX.ardoise(toit) }), 0.5));
    for (const xx of [1.3, 5.7]) {
      G.add(at(boite(0.8, 0.7, 0.6, EN), xx, H + 0.95, d - 0.15));
      fenetre2(G, xx, H + 0.95, d + 0.15, 0.42, 0.42, { rideau: '#f4f0f0' });
      G.add(toit4(G, xx, d - 0.15, H + 1.3, 0.5, 0.4, 0.35, M({ map: TX.ardoise(toit) }), 0.1));
    }
    // avant-corps central, fronton, enseigne
    G.add(at(boite(2.8, H + 0.15, 0.3, PB), cx, (H + 0.15) / 2 + 0.3, d + 0.15));
    fronton(G, cx, H + 0.45, d + 0.3, 3.0, 1.0, 0.3, PB);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 28), [COL('#f4f4f6'), M({ map: TX.croix() }), COL('#f4f4f6')]);
    disc.rotation.x = Math.PI / 2; G.add(at(disc, cx, H + 0.82, d + 0.34));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 6, 24), R), cx, H + 0.82, d + 0.4));
    portesVitrees(G, cx, d + 0.3, 1.8, 1.65, COL('#9a9ca4'));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.9, 16, 0, Math.PI), M({ map: TX.verre() })), cx, 1.65, d + 0.31));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 6, 16, Math.PI), R), cx, 1.65, d + 0.34));
    G.add(at(boite(2.2, 0.14, 0.9, COL('#f4f4f6')), cx, 2.75, d + 0.7));                             // marquise
    G.add(at(boite(2.22, 0.06, 0.92, R), cx, 2.66, d + 0.7));
    for (const xx of [0.9, 2.0, 5.0, 6.1]) { fenArc(G, xx, 1.2, d, 0.75, 1.0, PB); fenetre2(G, xx, 2.75, d, 0.6, 0.5, { rideau: '#f8f0f0', cadre: '#f4f0e6' }); }
    for (const s of [-1, 1]) {
      G.add(at(boite(0.9, 0.35, 0.45, PB), cx + s * 2.5, 0.18, d + 0.55));
      for (let i = 0; i < 3; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), COL('#4a9a4a')), cx + s * 2.5 - 0.28 + i * 0.28, 0.48, d + 0.55));
      for (let i = 0; i < 4; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), COL(i % 2 ? '#f05a7a' : '#fafaf2')), cx + s * 2.5 - 0.3 + i * 0.2, 0.62, d + 0.68));
    }
    return G;
  };

  /* -------------------------------------------------------------- boutique (v4) ------------------------------------ */
  /** boutique (5 × 5, carrée) : murs blancs à liserés bleu marine, toit plat à acrotère, enseigne au sac sur le toit,
   *  hublots, grande vitrine, portes vitrées de 2 cases sous un store rayé, étal de produits devant */
  B.boutique = ({ mur = '#f8f8f4', marine = '#1e4a8a' } = {}) => {
    const G = new THREE.Group(), w = 5, d = 4.2, H = 3.2, cx = 2.5, MA = COL(marine), BL = M({ map: TX.enduit(mur) });
    G.add(at(boite(w, 0.35, d, MA), cx, 0.17, d / 2));
    G.add(at(boite(w, H - 0.35, d, BL), cx, 0.35 + (H - 0.35) / 2, d / 2));
    G.add(at(boite(w + 0.04, 0.12, d + 0.04, MA), cx, H - 0.12, d / 2));
    G.add(at(boite(w + 0.2, 0.14, d + 0.2, COL('#e8e8e4')), cx, H + 0.07, d / 2));
    for (const [x, z, ww, dd] of [[cx, -0.04, w + 0.2, 0.12], [cx, d + 0.04, w + 0.2, 0.12], [-0.04, d / 2, 0.12, d + 0.2], [w + 0.04, d / 2, 0.12, d + 0.2]]) {
      G.add(at(boite(ww, 0.45, dd, BL), x, H + 0.36, z)); G.add(at(boite(ww + 0.04, 0.07, dd + 0.04, MA), x, H + 0.62, z));
    }
    const sac = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.12), [MA, MA, MA, MA, M({ map: TX.sac() }), MA]);
    sac.castShadow = true; G.add(at(sac, cx, H + 1.0, d - 0.1));
    for (const s of [-1, 1]) G.add(at(boite(0.06, 0.6, 0.06, COL('#8a8e98')), cx + s * 0.6, H + 0.6, d - 0.2));
    G.add(at(boite(0.8, 0.45, 0.6, COL('#c8ccd4')), 0.8, H + 0.4, 0.8));
    for (const xx of [1.0, 2.5, 4.0]) {
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), M({ map: TX.verre() })), xx, 2.6, d + 0.01));
      G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 16), MA), xx, 2.6, d + 0.03));
    }
    G.add(at(boite(2.1, 1.3, 0.03, M({ map: TX.etals() })), 1.25, 1.1, d + 0.01));
    for (const [dx, dy, ww, hh] of [[0, 0.68, 2.25, 0.08], [0, -0.68, 2.25, 0.08], [-1.1, 0, 0.08, 1.4], [1.1, 0, 0.08, 1.4]]) G.add(at(boite(ww, hh, 0.08, MA), 1.25 + dx, 1.1 + dy, d + 0.04));
    portesVitrees(G, 3.5, d, 1.6, 1.6, MA);
    const st = boite(w + 0.1, 0.05, 0.95, M({ map: TX.store(marine) })); st.rotation.x = 0.33; G.add(at(st, cx, 2.12, d + 0.42));
    for (let i = 0; i < 10; i++) G.add(at(boite(0.5, 0.14, 0.03, COL(i % 2 ? '#f4f4f6' : marine)), 0.25 + i * 0.5, 1.88, d + 0.88));
    // étal : tréteaux et caisses de produits colorés, ardoise, plantes
    G.add(at(boite(2.2, 0.08, 0.6, M({ map: TX.bois('#b88a5a') })), 1.3, 0.62, d + 0.95));
    for (const x of [0.3, 2.3]) for (const z of [0.7, 1.2]) G.add(at(boite(0.05, 0.62, 0.05, COL('#6a4a2a')), x, 0.31, d + z));
    const C = [['#e83a3a', '#c82a2a'], ['#f0a020', '#f8c040'], ['#5ab040', '#3c8c3c'], ['#f8e060', '#a050c0'], ['#7aa0f8', '#fafaf2']];
    for (let i = 0; i < 4; i++) caisse(G, 0.5 + i * 0.53, 0.66, d + 0.95, C[i]);
    caisse(G, 0.6, 0, d + 0.95, C[4]); caisse(G, 2.0, 0, d + 0.95, C[2]);
    const ar = boite(0.45, 0.65, 0.04, COL('#2a2e2a')); ar.rotation.x = -0.25; G.add(at(ar, 4.5, 0.35, d + 0.9)); G.add(at(boite(0.3, 0.03, 0.02, COL('#f0f0e8')), 4.5, 0.45, d + 0.93));
    G.add(at(cyl(0.2, 0.15, 0.3, MA, 10), 2.9, 0.15, d + 0.45)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), COL('#3c8c3c')), 2.9, 0.45, d + 0.45));
    return G;
  };

  /* -------------------------------------------------------------- arènes par type ----------------------------------- */
  const ARENES = {
    feu: { acc: '#e05a20', pierre: '#c8b0a0', toit: '#b8402a' },
    eau: { acc: '#2a86d8', pierre: '#dce4ea', toit: '#2a6aa8' },
    plante: { acc: '#4aa040', pierre: '#d8d0b0', toit: '#3a7a3a' },
    electrik: { acc: '#f0c020', pierre: '#c8ccd2', toit: '#c89a20' },
    psy: { acc: '#c050c0', pierre: '#e4dcea', toit: '#7a3a9a' },
    dragon: { acc: '#6a4ad0', pierre: '#9a96a8', toit: '#3a2a6a' },
    glace: { acc: '#60c0f0', pierre: '#eaf2f6', toit: '#8ac8e8' },
    roche: { acc: '#b08a50', pierre: '#c0b29a', toit: '#7a6a52' },
    combat: { acc: '#c83028', pierre: '#d4c8b4', toit: '#8a2a22' },
    spectre: { acc: '#8a50c8', pierre: '#86829a', toit: '#3a2c4a' },
  };

  /** emblème du type dessiné sur un médaillon */
  const emblemeTex = (type, acc) => tex('em' + type, 2 * D, 2 * D, (g, px, w, h) => {
    g.fillStyle = '#f4f0e6'; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, 7); g.fill();
    g.fillStyle = acc; g.beginPath(); g.arc(w / 2, h / 2, w * 0.44, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = w * 0.07; g.lineCap = 'round';
    const P = (pts) => { g.beginPath(); g.moveTo(pts[0] * w, pts[1] * h); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] * w, pts[i + 1] * h); g.closePath(); g.fill(); };
    g.beginPath();
    switch (type) {
      case 'feu': g.moveTo(.5 * w, .2 * h); g.bezierCurveTo(.75 * w, .45 * h, .72 * w, .8 * h, .5 * w, .8 * h); g.bezierCurveTo(.28 * w, .8 * h, .25 * w, .55 * h, .42 * w, .42 * h); g.bezierCurveTo(.42 * w, .55 * h, .5 * w, .55 * h, .5 * w, .2 * h); g.fill(); break;
      case 'eau': g.moveTo(.5 * w, .18 * h); g.quadraticCurveTo(.72 * w, .5 * h, .7 * w, .6 * h); g.arc(.5 * w, .6 * h, .2 * w, 0, Math.PI); g.quadraticCurveTo(.28 * w, .5 * h, .5 * w, .18 * h); g.fill(); break;
      case 'plante': g.ellipse(.5 * w, .5 * h, .14 * w, .3 * h, 0.6, 0, 7); g.fill(); g.strokeStyle = acc; g.lineWidth = w * 0.03; g.beginPath(); g.moveTo(.34 * w, .72 * h); g.lineTo(.64 * w, .3 * h); g.stroke(); break;
      case 'electrik': P([.56, .16, .32, .54, .48, .54, .42, .84, .7, .42, .53, .42, .62, .16]); break;
      case 'psy': g.ellipse(.5 * w, .5 * h, .3 * w, .16 * h, 0, 0, 7); g.fill(); g.fillStyle = acc; g.beginPath(); g.arc(.5 * w, .5 * h, .1 * w, 0, 7); g.fill(); break;
      case 'dragon': P([.3, .25, .45, .78, .5, .45]); P([.5, .2, .58, .8, .62, .4]); P([.68, .28, .7, .74, .78, .45]); break;
      case 'glace': for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(.5 * w - Math.cos(a) * .3 * w, .5 * h - Math.sin(a) * .3 * h); g.lineTo(.5 * w + Math.cos(a) * .3 * w, .5 * h + Math.sin(a) * .3 * h); g.stroke(); } break;
      case 'roche': P([.3, .7, .26, .48, .4, .28, .62, .26, .76, .44, .72, .7]); break;
      case 'combat': g.fillRect(.3 * w, .32 * h, .4 * w, .36 * h); g.fillStyle = acc; for (let k = 1; k < 4; k++) g.fillRect((.3 + k * .1) * w, .32 * h, .02 * w, .18 * h); break;
      case 'spectre': g.arc(.5 * w, .45 * h, .2 * w, Math.PI, 0); g.lineTo(.7 * w, .75 * h); g.lineTo(.6 * w, .68 * h); g.lineTo(.5 * w, .75 * h); g.lineTo(.4 * w, .68 * h); g.lineTo(.3 * w, .75 * h); g.closePath(); g.fill(); g.fillStyle = acc; g.fillRect(.42 * w, .42 * h, .05 * w, .08 * h); g.fillRect(.53 * w, .42 * h, .05 * w, .08 * h); break;
    }
  }, false);
  /** ornement posé au sommet d'un pylône, selon le type */
  function sommetType(G, type, x, y, z, acc) {
    const A = COL(acc), ver = (c, o = 0.75) => M({ color: new THREE.Color(c), emissive: new THREE.Color(c).multiplyScalar(0.35), transparent: true, opacity: o });
    switch (type) {
      case 'feu': case 'combat':
        G.add(at(cyl(0.6, 0.32, 0.45, COL('#3a3230'), 12), x, y + 0.22, z)); G.add(at(cyl(0.62, 0.62, 0.06, OR, 12), x, y + 0.46, z));
        for (const [dx, dz, s] of [[0, 0, 2.2], [0.25, 0.1, 1.4], [-0.25, -0.05, 1.5], [0.05, 0.28, 1.2]]) flamme(G, x + dx, y + 0.45, z + dz, s, type === 'feu' ? '#ff7a20' : '#ff4a30');
        break;
      case 'eau': {
        const d2 = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), A); d2.castShadow = true; G.add(at(d2, x, y, z));
        G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), ver('#a8dcff', 0.85)), x, y + 0.95, z));
        G.add(at(cyl(0.05, 0.05, 0.4, OR, 6), x, y + 0.65, z)); break;
      }
      case 'plante':
        G.add(at(cyl(0.6, 0.5, 0.35, M({ map: TX.pierre('#b8b098') }), 10), x, y + 0.17, z));
        G.add(at(cyl(0.1, 0.14, 0.8, COL('#6a4a2a'), 6), x, y + 0.7, z));
        for (const [dx, dy, dz, r] of [[0, 1.3, 0, 0.6], [0.35, 1.0, 0.2, 0.4], [-0.35, 1.05, -0.1, 0.45], [0.1, 1.0, -0.35, 0.38]]) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), COL(dx > 0 ? '#4a9a40' : '#3a8a38')), x + dx, y + dy, z + dz));
        break;
      case 'electrik':
        G.add(at(cyl(0.1, 0.16, 1.4, COL('#5a5e68'), 8), x, y + 0.7, z));
        for (const yy of [0.5, 0.8, 1.1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.32 - yy * 0.1, 0.06, 6, 16), COL('#c87a3a')); t.rotation.x = Math.PI / 2; G.add(at(t, x, y + yy, z)); }
        G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), LUM('#fff080', '#c0a000')), x, y + 1.6, z));
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const e = boite(0.05, 0.28, 0.05, LUM('#fff6a0', '#e0c000')); e.rotation.z = (k % 2 ? 0.6 : -0.6) * s; G.add(at(e, x + s * (0.38 + k * 0.12), y + 1.55 - k * 0.2, z)); }
        break;
      case 'psy':
        G.add(at(cyl(0.45, 0.55, 0.3, A, 8), x, y + 0.15, z));
        { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), ver('#f0a0f0', 0.9)); o.scale.y = 1.5; o.castShadow = true; G.add(at(o, x, y + 1.25, z)); }
        { const r = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 24), LUM('#f8c0f8', '#a040a0')); r.rotation.x = 1.2; G.add(at(r, x, y + 1.25, z)); }
        break;
      case 'dragon':
        G.add(at(cyl(0.55, 0.65, 0.3, A, 8), x, y + 0.15, z));
        for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.16 - k * 0.025, 0.42, 6), COL('#e8e0d0')); c.rotation.z = -s * (0.25 + k * 0.32); c.castShadow = true; G.add(at(c, x + s * (0.2 + k * 0.17), y + 0.5 + k * 0.28 - k * k * 0.04, z)); }
        flamme(G, x, y + 0.3, z, 1.3, '#a060ff', '#f0d0ff');
        break;
      case 'glace':
        for (const [dx, dz, h, a] of [[0, 0, 1.8, 0], [0.3, 0.1, 1.1, -0.35], [-0.3, 0, 1.2, 0.35], [0.05, 0.3, 0.9, 0.3], [-0.05, -0.3, 1.0, -0.3]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, h, 5), ver('#c8ecff', 0.85)); c.rotation.z = a; c.castShadow = true; G.add(at(c, x + dx, y + h / 2, z + dz)); }
        break;
      case 'roche':
        for (const [dx, dy, dz, r] of [[0, 0.35, 0, 0.55], [0.15, 0.95, -0.05, 0.4], [-0.05, 1.4, 0.05, 0.28]]) { const p = new THREE.Mesh(new THREE.DodecahedronGeometry(r), M({ map: TX.pierre('#8a7e6a') })); p.rotation.set(dx * 3, dy, dz * 4); p.castShadow = true; G.add(at(p, x + dx, y + dy, z + dz)); }
        break;
      case 'spectre':
        G.add(at(cyl(0.3, 0.4, 0.5, COL('#2a2438'), 6), x, y + 0.25, z));
        G.add(at(boite(0.5, 0.6, 0.5, M({ color: new THREE.Color('#d8b0ff'), emissive: new THREE.Color('#7030b0'), transparent: true, opacity: 0.7 })), x, y + 0.8, z));
        G.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 6), COL('#2a2438')), x, y + 1.55, z));
        flamme(G, x, y + 0.55, z, 1.0, '#b070ff', '#f0e0ff');
        break;
    }
  }
  /** ce qui borde l'escalier (deux de chaque côté), selon le type */
  function abordsType(G, type, x, z, acc) {
    const P = M({ map: TX.pierre('#d8d2c6') });
    G.add(at(boite(0.8, 0.7, 0.8, P), x, 0.35, z)); G.add(at(boite(0.9, 0.1, 0.9, COL(acc)), x, 0.72, z));
    if (type === 'eau') {
      G.add(at(cyl(0.7, 0.75, 0.3, P, 16), x, 0.15, z + 1.0)); G.add(at(cyl(0.6, 0.6, 0.03, M({ map: TX.eau() }), 16), x, 0.31, z + 1.0));
      G.add(at(boite(0.05, 0.6, 0.05, M({ color: new THREE.Color('#b8e0ff'), transparent: true, opacity: 0.8 })), x, 0.62, z + 1.0));
    }
    if (type === 'plante') for (let i = 0; i < 5; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), COL(['#f05a7a', '#f8d850', '#fafaf2'][i % 3])), x - 0.3 + i * 0.15, 0.85, z + 0.3));
    sommetType(G, type, x, 0.77, z, acc);
  }
  /** arène (12 × 11) : un grand temple de pierre entre le pavillon et le temple à colonnade. Haut podium à deux gradins
   *  bordé d'une balustrade, péristyle de colonnes de marbre à chapiteaux dorés tout autour d'une salle de pierre,
   *  entablement à frise de la couleur du type, premier toit en jupe à coins à peine relevés, claire-voie à vitraux,
   *  grand toit à demi-croupes de tuiles de la couleur du type, faîtage orné et ornement du type au sommet, bannières
   *  entre les colonnes de façade, lanternes sous l'avant-toit, perron monumental bordé d'ornements ; porte de 2 cases */
  B.arene = ({ type = 'feu', ...autres } = {}) => {
    const T = { ...(ARENES[type] || ARENES.feu), ...autres }, acc = T.acc;
    const G = new THREE.Group(), cx = 6, cz = 4.6, A = COL(acc);
    const PM = M({ map: TX.pierre(T.pierre) }), PB = M({ map: TX.pierre(mix(T.pierre, 0.35)) }), PS = M({ map: TX.pierre(mix(T.pierre, -0.12)) }), MA = M({ map: TX.marbre() });
    // podium à deux gradins (z 0 → 9,4), perron au sud (z 9,4 → 10,8)
    G.add(at(boite(12, 0.55, 9.4, PS), cx, 0.27, cz));
    G.add(at(boite(11.4, 0.5, 8.8, PM), cx, 0.8, cz));
    G.add(at(boite(11.5, 0.08, 8.9, PB), cx, 1.06, cz));
    const y0 = 1.05;
    for (let k = 0; k < 5; k++) G.add(at(boite(4.4 + k * 0.25, 0.21, 0.32, PB), cx, 0.105 + (4 - k) * 0.21, 9.2 + k * 0.32 - 0.16));
    for (const s of [-1, 1]) {   // limons du perron
      G.add(at(boite(0.35, 0.9, 1.7, PM), cx + s * 2.45, 0.45, 9.85));
    }
    // balustrade du podium (ouverte devant le perron)
    const bx0 = cx - 5.6, bx1 = cx + 5.6, bz0 = cz - 4.3, bz1 = cz + 4.3;
    balustrade(G, bx0, bz1, cx - 2.3, bz1, y0, PB, 0.4, 0.26); balustrade(G, cx + 2.3, bz1, bx1, bz1, y0, PB, 0.4, 0.26);
    balustrade(G, bx0, bz0, bx0, bz1, y0, PB, 0.4, 0.26); balustrade(G, bx1, bz0, bx1, bz1, y0, PB, 0.4, 0.26);
    // salle de pierre
    const hc = 4.2, sx = 4.2, sz = 2.95;
    G.add(at(boite(2 * sx, hc, 2 * sz, PM), cx, y0 + hc / 2, cz - 0.2));
    for (const yy of [y0 + 0.15, y0 + hc - 0.3]) G.add(at(boite(2 * sx + 0.08, 0.14, 2 * sz + 0.08, PB), cx, yy, cz - 0.2));
    const zf = cz - 0.2 + sz;
    // grande porte à double battant sous une imposte en vitrail, encadrement doré
    G.add(at(boite(1.8, 2.3, 0.05, M({ map: TX.bois('#5a3020') })), cx, y0 + 1.15, zf + 0.01));
    G.add(at(boite(0.04, 2.3, 0.06, COL('#2a1a10')), cx, y0 + 1.15, zf + 0.04));
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), OR), cx + s * 0.45, y0 + 0.5 + k * 0.65, zf + 0.05));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.9, 18, 0, Math.PI), M({ map: TX.vitrail(acc) })), cx, y0 + 2.3, zf + 0.01));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 18, Math.PI), OR), cx, y0 + 2.3, zf + 0.05));
    for (const s of [-1, 1]) G.add(at(boite(0.12, 2.3, 0.1, OR), cx + s * 0.96, y0 + 1.15, zf + 0.05));
    for (const s of [-1, 1]) for (const dx of [1.9, 3.0]) fenArc(G, cx + s * dx, y0 + 1.9, zf, 0.5, 2.0, PB, M({ map: TX.vitrail(acc) }));
    // péristyle : colonnes tout autour (8 en façade), chapiteaux et bagues dorés
    const px = 5.0, pz = 3.85, pzc = cz - 0.1, hcol = 4.2;
    const cols = [];
    for (let i = 0; i < 8; i++) { const x = cx - px + i * (2 * px / 7); cols.push([x, pzc + pz], [x, pzc - pz]); }
    for (let i = 1; i < 5; i++) { const z = pzc - pz + i * (2 * pz / 5); cols.push([cx - px, z], [cx + px, z]); }
    for (const [x, z] of cols) { colonne(G, x, z, y0, hcol, 0.24, MA, PB); G.add(at(cyl(0.29, 0.29, 0.07, OR, 12), x, y0 + hcol - 0.32, z)); }
    // entablement : architrave, frise de la couleur du type à médaillons, corniche
    const ye = y0 + hcol;
    G.add(at(boite(2 * px + 0.75, 0.32, 2 * pz + 0.75, PB), cx, ye + 0.16, pzc));
    G.add(at(boite(2 * px + 0.78, 0.3, 2 * pz + 0.78, A), cx, ye + 0.47, pzc));
    for (let i = 0; i < 13; i++) G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), OR), cx - px + i * (2 * px / 12), ye + 0.47, pzc + pz + 0.4));
    G.add(at(boite(2 * px + 1.0, 0.16, 2 * pz + 1.0, PB), cx, ye + 0.7, pzc));
    // plaque à l'emblème au-dessus de l'entrée
    G.add(at(boite(1.5, 0.75, 0.08, PB), cx, ye + 0.45, pzc + pz + 0.44));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), M({ map: emblemeTex(type, acc) })), cx, ye + 0.45, pzc + pz + 0.49));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 20), OR), cx, ye + 0.45, pzc + pz + 0.5));
    // premier toit en jupe : coins à peine relevés (élégance du pavillon, sans exagération)
    const yr = ye + 0.78, TT = { col: T.toit, rive: mix(T.pierre, -0.45), bord: '#e8c060', uvk: 0.4, flare: 0.04 };
    toitChinois(G, cx, pzc, yr, px + 0.55, pz + 0.55, 0.6, { ...TT, xt: sx + 0.05, zt: sz + 0.25, lift: 0.25 });
    // claire-voie : mur bas percé de vitraux ronds, poteaux de pierre
    const yv = yr + 0.55, hv = 1.8;
    G.add(at(boite(2 * sx + 0.1, hv, 2 * sz + 0.5, PM), cx, yv + hv / 2, pzc));
    for (let i = 0; i < 5; i++) { const x = cx - 2.8 + i * 1.4; fenArc(G, x, yv + hv / 2 - 0.1, pzc + sz + 0.25, 0.5, 0.75, PB, M({ map: TX.vitrail(acc) })); }
    for (let i = 0; i < 6; i++) G.add(at(boite(0.18, hv, 0.1, PB), cx - 3.5 + i * 1.4, yv + hv / 2, pzc + sz + 0.27));
    G.add(at(boite(2 * sx + 0.3, 0.14, 2 * sz + 0.7, PB), cx, yv + hv - 0.07, pzc));
    // grand toit à demi-croupes, faîtage orné, ornement du type au sommet
    const yh = yv + hv - 0.05;
    toitChinois(G, cx, pzc, yh, sx + 0.75, sz + 0.75, 1.75, { ...TT, xt: sx - 1.0, zt: 0.14, lift: 0.35 });
    const orn = new THREE.Group(); orn.scale.setScalar(0.8); G.add(orn);
    sommetType(orn, type, cx / 0.8, (yh + 1.85) / 0.8, pzc / 0.8, acc);
    // lanternes pendues aux coins de l'avant-toit, bannières entre les colonnes de façade
    for (const sxx of [-1, 1]) for (const szz of [-1, 1]) { G.add(at(boite(0.03, 0.35, 0.03, COL('#2a2a30')), cx + sxx * (px + 0.3), yr - 0.05, pzc + szz * (pz + 0.3))); G.add(at(cyl(0.12, 0.12, 0.3, LUM('#ffe0a0', '#a06020'), 8), cx + sxx * (px + 0.3), yr - 0.38, pzc + szz * (pz + 0.3))); }
    for (const s of [-1, 1]) {
      const x = cx + s * (2 * px / 7) * 1.5;
      G.add(at(boite(0.05, 0.05, 0.9, COL('#2a2a30')), x, ye - 0.08, pzc + pz - 0.1));
      G.add(at(boite(0.75, 2.2, 0.03, A), x, ye - 1.2, pzc + pz + 0.3));
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), M({ map: emblemeTex(type, acc) })), x, ye - 0.9, pzc + pz + 0.32));
      const pt = new THREE.Shape(); pt.moveTo(-0.375, 0); pt.lineTo(0.375, 0); pt.lineTo(0, -0.3); pt.closePath();
      G.add(at(new THREE.Mesh(new THREE.ShapeGeometry(pt), A), x, ye - 2.3, pzc + pz + 0.3));
    }
    // abords du perron selon le type
    for (const s of [-1, 1]) abordsType(G, type, cx + s * 4.0, 10.2, acc);
    return G;
  };

  /* ============================================================== vingt arènes de type Feu (planche de styles) ======== */
  /** arcades (une arche par unité : pilier de pierre, ouverture en plein cintre) */
  TX.arcades = (col) => tex('ac' + col, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, dans = (Math.abs(u - 0.5) < 0.3 && v > 0.45) || Math.hypot(u - 0.5, v - 0.45) < 0.3;
      let c = dans ? (v > 0.85 ? '#5a2a14' : '#2a1a14') : mix(col, hash(x >> 2, y >> 2, 51) < 0.2 ? -0.06 : 0);
      if (!dans && (y % (8 * S) < S)) c = mix(col, -0.2);
      if (!dans && Math.hypot(u - 0.5, v - 0.45) < 0.34) c = mix(col, 0.15);
      px(x, y, c);
    }
  });
  TX.beton = (col = '#a8a8a2') => tex('bt' + col, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = mix(col, (hash(x >> 1, y >> 1, 52) - 0.5) * 0.1);
      if (y % (16 * S) < S) c = mix(col, -0.18); if ((x % (16 * S) - 8 * S) ** 2 + (y % (16 * S) - 8 * S) ** 2 < (S * 1.2) ** 2) c = mix(col, -0.35);
      px(x, y, c);
    }
  });
  TX.mosaique = (a, b) => tex('mo' + a + b, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = (x + y) % (8 * S), v = (x - y + 64 * S) % (8 * S); px(x, y, u < S || v < S ? '#f0e8d0' : (Math.floor((x + y) / (8 * S)) + Math.floor((x - y + 64 * S) / (8 * S))) % 2 ? a : b); }
  });
  TX.hieroglyphes = (col) => tex('hg' + col, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cx2 = x % (6 * S), cy2 = y % (8 * S), id = hash(Math.floor(x / (6 * S)), Math.floor(y / (8 * S)), 53);
      let c = mix(col, (hash(x >> 2, y >> 2, 54) - 0.5) * 0.08);
      if (y % (16 * S) < S) c = mix(col, -0.25);
      else if (cx2 > S && cx2 < 5 * S && cy2 > 2 * S && cy2 < 7 * S && ((id < 0.33 && (cx2 + cy2) % (3 * S) < S) || (id >= 0.33 && id < 0.66 && Math.hypot(cx2 - 3 * S, cy2 - 4.5 * S) < 1.6 * S && Math.hypot(cx2 - 3 * S, cy2 - 4.5 * S) > 0.8 * S) || (id >= 0.66 && (cx2 === 2 * S || cy2 === 4 * S)))) c = mix(col, -0.4);
      px(x, y, c);
    }
  });
  const FEU = '#e05a20', LAVE = LUM('#ff7a20', '#ff4a00'), BRAISE = LUM('#ffb040', '#e06000');
  const medaillon = (G, x, y, z, r = 0.4) => { G.add(at(new THREE.Mesh(new THREE.CircleGeometry(r, 20), M({ map: emblemeTex('feu', FEU) })), x, y, z)); G.add(at(new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.05, 6, 20), OR), x, y, z + 0.02)); };
  function porte2(G, x, z, y0 = 0, h = 2.2, w = 1.8, bois = '#4a2412', cadre = OR, arc = true) {
    G.add(at(boite(w, h, 0.05, M({ map: TX.bois(bois) })), x, y0 + h / 2, z + 0.01));
    G.add(at(boite(0.04, h, 0.06, COL('#1a0e08')), x, y0 + h / 2, z + 0.03));
    for (const s of [-1, 1]) G.add(at(boite(0.12, h, 0.12, cadre), x + s * (w / 2 + 0.06), y0 + h / 2, z + 0.05));
    if (arc) { G.add(at(new THREE.Mesh(new THREE.CircleGeometry(w / 2, 16, 0, Math.PI), M({ map: TX.vitrail(FEU) })), x, y0 + h, z + 0.01)); G.add(at(new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.06, 0.08, 6, 16, Math.PI), cadre), x, y0 + h, z + 0.05)); }
    else G.add(at(boite(w + 0.36, 0.14, 0.14, cadre), x, y0 + h + 0.07, z + 0.05));
  }
  function brasero(G, x, y, z, s = 1, pied = 0) {
    if (pied) { G.add(at(cyl(0.08 * s, 0.12 * s, pied, COL('#2a2422'), 6), x, y + pied / 2, z)); y += pied; }
    G.add(at(cyl(0.45 * s, 0.22 * s, 0.35 * s, COL('#3a3230'), 12), x, y + 0.17 * s, z)); G.add(at(cyl(0.47 * s, 0.47 * s, 0.05, OR, 12), x, y + 0.35 * s, z));
    flamme(G, x, y + 0.3 * s, z, 1.8 * s); flamme(G, x + 0.2 * s, y + 0.3 * s, z + 0.1 * s, 1.1 * s); flamme(G, x - 0.2 * s, y + 0.3 * s, z - 0.05 * s, 1.2 * s);
  }
  const marches = (G, x, z, w, n, hm, pm, mat, y0 = 0) => { for (let k = 0; k < n; k++) G.add(at(boite(w, hm * (n - k), pm, mat), x, y0 + hm * (n - k) / 2, z + k * pm + pm / 2)); };
  const lathe = (pts, mat, n = 32) => { const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n), mat); m.castShadow = m.receiveShadow = true; return m; };
  const extr = (pts, prof, mat) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const [a, b] of pts.slice(1)) sh.lineTo(a, b); sh.closePath(); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: prof, bevelEnabled: false }), mat); m.castShadow = m.receiveShadow = true; return m; };

  const FEUX = {
    /** 1. Temple-pavillon (version précédente) */
    1: () => B.arene({ type: 'feu' }),
    /** 2. Volcan : cône de roche, coulées de lave, cratère embrasé, entrée en grotte */
    2: () => {
      const G = new THREE.Group(), cx = 5.5, cz = 5, R = M({ map: TX.pierre('#4e4440') });
      G.add(at(cyl(3.0, 5.4, 5.2, R, 14), cx, 2.6, cz));
      G.add(at(cyl(2.7, 2.7, 0.1, LAVE, 14), cx, 5.18, cz));
      { const t = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.25, 6, 14), R); t.rotation.x = Math.PI / 2; G.add(at(t, cx, 5.2, cz)); }
      flamme(G, cx, 5.2, cz, 4.0); flamme(G, cx + 0.9, 5.2, cz - 0.3, 2.4); flamme(G, cx - 0.8, 5.2, cz + 0.4, 2.6);
      for (const a of [-0.9, -0.35, 0.5, 1.1, 2.4, 3.6]) { const g2 = new THREE.Group(); g2.rotation.y = a; g2.position.set(cx, 0, cz); const s = boite(0.3, 5.3, 0.12, LAVE); s.rotation.x = -0.43; g2.add(at(s, 0, 2.6, 4.25)); G.add(g2); }
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = 5.3 + hash(i, 9) * 0.6, p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + hash(i, 8) * 0.45), R); p.rotation.set(i, i * 2, 0); p.castShadow = true; G.add(at(p, cx + Math.cos(a) * r, 0.25, cz + Math.sin(a) * r)); }
      G.add(at(boite(2.0, 2.4, 1.2, COL('#1a1010')), cx, 1.2, cz + 4.6));
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(1.0, 14, 0, Math.PI), COL('#1a1010')), cx, 2.4, cz + 5.21));
      G.add(at(boite(1.6, 0.3, 0.05, BRAISE), cx, 0.2, cz + 5.22));
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7), R); G.add(at(p, cx + s * 1.5, 1.2, cz + 5.0)); brasero(G, cx + s * 2.3, 0, cz + 5.8, 0.8, 0.6); }
      medaillon(G, cx, 3.2, cz + 4.55, 0.45);
      return G;
    },
    /** 3. Forge industrielle : halle de briques à toit en sheds, cheminées qui crachent le feu, grande porte coulissante */
    3: () => {
      const G = new THREE.Group(), cx = 5.5, BR = M({ map: TX.brique('#9a4a32') });
      G.add(at(boite(10, 3.6, 6.5, BR), cx, 1.8, 3.6));
      for (let i = 0; i < 4; i++) { const x0 = 0.5 + i * 2.5; const sh = extr([[0, 0], [0, 1.5], [2.5, 0]], 6.5, M({ map: TX.tole('#5a5e66') })); sh.position.set(x0, 3.6, 0.35); G.add(sh); G.add(at(boite(0.04, 1.2, 6.4, LUM('#ffd0a0', '#804010')), x0 + 0.04, 4.2, 3.6)); }
      for (const x of [1.5, 9.5]) { G.add(at(cyl(0.5, 0.65, 7.5, BR, 12), x, 3.75, 1.3)); G.add(at(cyl(0.58, 0.58, 0.25, COL('#2a2422'), 12), x, 7.5, 1.3)); flamme(G, x, 7.55, 1.3, 2.2); }
      G.add(at(boite(3.0, 2.8, 0.08, M({ map: TX.tole('#7a2a20') })), cx, 1.4, 6.9));
      G.add(at(boite(3.4, 0.2, 0.2, COL('#2a2a30')), cx, 2.9, 6.95)); medaillon(G, cx, 3.25, 6.92, 0.32);
      for (const x of [1.5, 3.0, 8.0, 9.5]) { G.add(at(boite(0.8, 1.2, 0.04, BRAISE), x, 1.9, 6.87)); for (let k = 0; k < 3; k++) G.add(at(boite(0.04, 1.2, 0.05, COL('#3a3a3a')), x - 0.27 + k * 0.27, 1.9, 6.9)); }
      G.add(at(boite(0.7, 0.4, 0.4, COL('#3a3a40')), 2.0, 0.5, 8.0)); G.add(at(boite(0.3, 0.3, 0.3, COL('#5a3a20')), 2.0, 0.15, 8.0));
      for (let i = 0; i < 9; i++) G.add(at(new THREE.Mesh(new THREE.DodecahedronGeometry(0.25), COL('#1e1c1c')), 8.6 + (i % 3) * 0.35, 0.2 + Math.floor(i / 3) * 0.2, 7.8 + (i % 2) * 0.2));
      brasero(G, 3.4, 0, 7.6, 0.8, 0.8); brasero(G, 7.6, 0, 7.6, 0.8, 0.8);
      return G;
    },
    /** 4. Château fort : donjon crénelé, deux tours rondes, herse, braseros sur les remparts, bannières */
    4: () => {
      const G = new THREE.Group(), cx = 5.5, P = M({ map: TX.pierre('#8a8478') }), PB = M({ map: TX.pierre('#a8a296') });
      G.add(at(boite(8, 6, 5, P), cx, 3, 3));
      const creneaux = (x0, x1, z0, z1, y) => { for (let x = x0; x <= x1; x += 0.6) for (const z of [z0, z1]) G.add(at(boite(0.35, 0.45, 0.35, PB), x, y + 0.22, z)); for (let z = z0; z <= z1; z += 0.6) for (const x of [x0, x1]) G.add(at(boite(0.35, 0.45, 0.35, PB), x, y + 0.22, z)); };
      creneaux(1.7, 9.3, 0.7, 5.3, 6);
      for (const x of [1.0, 10.0]) { G.add(at(cyl(1.4, 1.5, 7.5, P, 16), x, 3.75, 6.0)); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; G.add(at(boite(0.35, 0.45, 0.35, PB), x + Math.cos(a) * 1.3, 7.7, 6.0 + Math.sin(a) * 1.3)); } brasero(G, x, 7.5, 6.0, 0.9);
        for (const y of [2.5, 4.5]) G.add(at(boite(0.15, 0.6, 0.05, COL('#1a1414')), x, y, 7.5)); }
      G.add(at(boite(5.4, 4.5, 2.0, P), cx, 2.25, 6.0)); creneaux(3.1, 7.9, 5.2, 6.9, 4.5);
      G.add(at(boite(2.0, 2.4, 0.05, COL('#1a1210')), cx, 1.2, 7.02));
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(1.0, 14, 0, Math.PI), COL('#1a1210')), cx, 2.4, 7.02));
      for (let i = 0; i < 7; i++) G.add(at(boite(0.06, 2.9, 0.06, COL('#3a3a3a')), cx - 0.9 + i * 0.3, 1.9, 7.06)); for (let k = 0; k < 6; k++) G.add(at(boite(2.0, 0.06, 0.06, COL('#3a3a3a')), cx, 1.0 + k * 0.5, 7.06));
      G.add(at(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.15, 6, 14, Math.PI), PB), cx, 2.4, 7.08));
      medaillon(G, cx, 3.75, 7.02, 0.4);
      for (const s of [-1, 1]) { G.add(at(boite(0.8, 2.6, 0.03, COL('#b8322a')), cx + s * 1.9, 2.6, 7.03)); G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.22, 14), M({ map: emblemeTex('feu', FEU) })), cx + s * 1.9, 3.2, 7.06)); }
      G.add(at(boite(2.2, 0.15, 1.6, M({ map: TX.planches('#6a4a2a') })), cx, 0.07, 7.8));
      return G;
    },
    /** 5. Colisée : anneau d'arcades sur deux niveaux, gradins, arène de sable et fosse de feu, à ciel ouvert */
    5: () => {
      const G = new THREE.Group(), cx = 5.5, cz = 5, E = new THREE.Group(); E.position.set(cx, 0, cz); E.scale.z = 0.85; G.add(E);
      const t = TX.arcades('#d8c8a8').clone(); t.repeat.set(Math.round(2 * Math.PI * 5.2), 3); t.needsUpdate = true;
      const mur = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.3, 4.8, 48, 1, true), M({ map: t, side: THREE.DoubleSide })); mur.castShadow = true; E.add(at(mur, 0, 2.4, 0));
      E.add(at(lathe([[5.25, 4.8], [5.25, 5.0], [4.9, 5.0], [4.9, 4.4], [4.4, 4.4], [4.4, 3.7], [3.9, 3.7], [3.9, 3.0], [3.4, 3.0], [3.4, 2.3], [2.9, 2.3], [2.9, 1.0], [2.9, 0.3]], M({ map: TX.pierre('#c8b898'), side: THREE.DoubleSide }), 48), 0, 0, 0));
      E.add(at(cyl(2.9, 2.9, 0.3, COL('#d8b878'), 32), 0, 0.15, 0));
      E.add(at(cyl(0.8, 0.9, 0.3, COL('#3a3230'), 16), 0, 0.4, 0)); E.add(at(cyl(0.7, 0.7, 0.05, LAVE, 16), 0, 0.54, 0));
      flamme(G, cx, 0.55, cz, 2.5); flamme(G, cx + 0.3, 0.55, cz, 1.6); flamme(G, cx - 0.3, 0.55, cz + 0.1, 1.7);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; brasero(G, cx + Math.cos(a) * 5.0, 5.0, cz + Math.sin(a) * 4.25, 0.6); }
      G.add(at(boite(2.6, 3.6, 1.2, M({ map: TX.pierre('#e2d4b4') })), cx, 1.8, cz + 4.6));
      porte2(G, cx, cz + 5.21, 0, 2.2, 1.8, '#4a2412', COL('#b8322a'));
      fronton(G, cx, 3.6, cz + 5.25, 3.0, 0.8, 1.3, M({ map: TX.pierre('#e2d4b4') })); medaillon(G, cx, 3.95, cz + 5.27, 0.3);
      return G;
    },
    /** 6. Pyramide à degrés : cinq gradins sculptés, grand escalier central, temple du feu au sommet */
    6: () => {
      const G = new THREE.Group(), cx = 5.5, cz = 5, P = M({ map: TX.pierre('#b89870') }), PB = M({ map: TX.pierre('#d0b48a') });
      for (let k = 0; k < 5; k++) { const s = 5.2 - k * 0.95, y = k * 1.15; G.add(at(boite(2 * s, 1.15, 2 * s, P), cx, y + 0.575, cz)); G.add(at(boite(2 * s + 0.06, 0.22, 2 * s + 0.06, COL(k % 2 ? '#b8322a' : FEU)), cx, y + 0.9, cz)); }
      for (let k = 0; k < 20; k++) G.add(at(boite(2.0, 0.29, 0.25, PB), cx, k * 0.2875 + 0.14, cz + 5.2 - k * 0.237));
      for (const s of [-1, 1]) { const r = boite(0.35, 0.35, 6.9, PB); r.rotation.x = Math.atan2(5.75, 4.75); G.add(at(r, cx + s * 1.15, 2.9, cz + 2.8)); }
      const yt = 5.75; G.add(at(boite(2.8, 1.6, 2.4, PB), cx, yt + 0.8, cz)); G.add(at(boite(3.2, 0.3, 2.8, COL('#b8322a')), cx, yt + 1.75, cz)); G.add(at(boite(2.6, 0.5, 2.2, PB), cx, yt + 2.15, cz));
      G.add(at(boite(1.0, 1.3, 0.05, COL('#1a1010')), cx, yt + 0.65, cz + 1.22)); medaillon(G, cx, yt + 1.75, cz + 1.42, 0.3);
      brasero(G, cx, yt + 2.4, cz, 1.2);
      for (const s of [-1, 1]) brasero(G, cx + s * 4.6, 0, cz + 5.6, 0.8, 0.9);
      porte2(G, cx, cz + 5.2, 0, 1.8, 1.5, '#4a2412', COL('#b8322a'), false);
      return G;
    },
    /** 7. Temple grec d'Héphaïstos : péristyle dorique, toit de tuiles, fronton sculpté, acrotères de flammes, autel */
    7: () => {
      const G = new THREE.Group(), cx = 5.5, P = M({ map: TX.marbre() }), PB = M({ map: TX.pierre('#ece6da') });
      for (let k = 0; k < 3; k++) G.add(at(boite(10 - k * 0.5, 0.35, 8 - k * 0.5, PB), cx, 0.17 + k * 0.35, 4));
      const y0 = 1.05, H = 4.0;
      G.add(at(boite(5.4, H, 4.6, M({ map: TX.pierre('#d8ccb4') })), cx, y0 + H / 2, 3.8));
      for (let i = 0; i < 6; i++) for (const z of [0.6, 7.3]) colonne(G, cx - 3.9 + i * 1.56, z, y0, H, 0.3, P, PB);
      for (let i = 1; i < 4; i++) for (const x of [cx - 3.9, cx + 3.9]) colonne(G, x, 0.6 + i * 1.675, y0, H, 0.3, P, PB);
      G.add(at(boite(8.7, 0.5, 7.6, PB), cx, y0 + H + 0.25, 3.95)); G.add(at(boite(8.72, 0.18, 7.62, COL(FEU)), cx, y0 + H + 0.12, 3.95));
      toitRue(G, cx - 4.3, cx + 4.3, 0.2, 7.7, y0 + H + 0.5, 1.4, '#b8503a', PB, 0.15);
      fronton(G, cx, y0 + H + 0.5, 7.85, 8.6, 1.4, 0.3, PB); medaillon(G, cx, y0 + H + 1.0, 7.87, 0.35);
      for (const dx of [-2.6, -1.4, 1.4, 2.6]) { const hh = 0.55 - Math.abs(dx) * 0.12; G.add(at(boite(0.25, hh, 0.1, PB), cx + dx, y0 + H + 0.58 + hh / 2, 7.88)); }
      for (const x of [cx - 4.3, cx + 4.3]) flamme(G, x, y0 + H + 0.55, 7.8, 1.6); flamme(G, cx, y0 + H + 1.9, 7.8, 1.8);
      porte2(G, cx, 6.1, y0, 2.4, 1.8, '#4a2412', OR, false);
      G.add(at(boite(1.4, 0.8, 1.0, PB), cx, 0.4, 9.0)); G.add(at(boite(1.2, 0.08, 0.8, LAVE), cx, 0.82, 9.0)); flamme(G, cx, 0.82, 9.0, 2.0);
      return G;
    },
    /** 8. Sanctuaire : torii rouge, allée de lanternes, salle laquée vermillon sur pilotis, toit à pignons relevés, paniers de feu */
    8: () => {
      const G = new THREE.Group(), cx = 5.5, V = COL('#d8402a'), N = COL('#2a2222');
      G.add(at(boite(9.6, 1.0, 6.2, M({ map: TX.pierre('#9a948a') })), cx, 0.5, 3.4));
      G.add(at(boite(8.0, 2.8, 4.6, M({ map: TX.shoji() })), cx, 2.4, 3.4));
      for (let i = 0; i <= 6; i++) for (const z of [1.0, 5.8]) G.add(at(cyl(0.16, 0.16, 2.9, V, 10), cx - 4.0 + i * (8 / 6), 2.45, z));
      for (let i = 1; i < 3; i++) for (const x of [cx - 4.0, cx + 4.0]) G.add(at(cyl(0.16, 0.16, 2.9, V, 10), x, 2.45, 1.0 + i * 1.6));
      G.add(at(boite(8.4, 0.35, 5.2, V), cx, 3.95, 3.4));
      toitChinois(G, cx, 3.4, 4.1, 5.0, 3.4, 2.2, { col: '#3a3a44', rive: '#2a2222', bord: '#e8c060', xt: 2.6, zt: 0.15, lift: 0.5, flare: 0.08, uvk: 0.6 });
      G.add(at(boite(2.2, 2.2, 0.05, M({ map: TX.treillis('#d8402a') })), cx, 2.1, 5.72));
      marches(G, cx, 6.2, 2.4, 4, 0.25, 0.3, M({ map: TX.pierre('#9a948a') }));
      G.add(at(boite(1.8, 0.6, 0.08, N), cx, 3.6, 5.95)); medaillon(G, cx, 3.6, 6.0, 0.25);
      // torii
      for (const s of [-1, 1]) G.add(at(cyl(0.2, 0.24, 4.2, V, 12), cx + s * 2.0, 2.1, 9.6));
      G.add(at(boite(5.4, 0.3, 0.4, N), cx, 4.3, 9.6)); G.add(at(boite(4.6, 0.25, 0.3, V), cx, 3.6, 9.6));
      for (const s of [-1, 1]) { const b = boite(0.8, 0.3, 0.42, N); b.rotation.z = s * 0.25; G.add(at(b, cx + s * 2.9, 4.4, 9.6)); }
      for (const z of [7.6, 8.6]) for (const s of [-1, 1]) { const x = cx + s * 1.6; G.add(at(cyl(0.08, 0.12, 0.8, M({ map: TX.pierre('#9a948a') }), 6), x, 0.4, z)); G.add(at(boite(0.35, 0.3, 0.35, LUM('#ffe0a0', '#a06020')), x, 0.95, z)); G.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.25, 4), M({ map: TX.pierre('#9a948a') })), x, 1.22, z)); }
      for (const s of [-1, 1]) brasero(G, cx + s * 3.6, 1.0, 5.8, 0.6, 0.3);
      return G;
    },
    /** 9. Palais oriental : grand dôme bulbeux rouge et or, iwan à mosaïques, deux tours-lanternes de feu */
    9: () => {
      const G = new THREE.Group(), cx = 5.5, P = M({ map: TX.pierre('#e2cca0') });
      G.add(at(boite(9, 4.2, 6, P), cx, 2.1, 3.2));
      for (let i = 0; i < 22; i++) G.add(at(boite(0.3, 0.3, 0.3, P), 1.1 + i * 0.4, 4.35, 6.2));
      G.add(at(cyl(2.3, 2.3, 1.0, P, 24), cx, 4.7, 3.0));
      G.add(at(lathe([[2.3, 0], [2.6, 0.6], [2.6, 1.3], [2.2, 2.2], [1.4, 2.9], [0.6, 3.4], [0.15, 3.9], [0.0, 4.1]], M({ map: TX.canal('#c83a2a') }), 32), cx, 5.2, 3.0));
      G.add(at(cyl(0.05, 0.08, 0.8, OR, 6), cx, 9.6, 3.0)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), OR), cx, 10.0, 3.0));
      G.add(at(boite(4.0, 5.4, 0.6, M({ map: TX.mosaique('#2a6ab8', '#e8c060') })), cx, 2.7, 6.4));
      G.add(at(boite(2.6, 3.2, 0.05, COL('#2a1a14')), cx, 1.6, 6.71));
      { const ar = extr([[-1.3, 0], [1.3, 0], [1.3, 0.4], [0, 1.6], [-1.3, 0.4]], 0.05, COL('#2a1a14')); ar.position.set(cx, 3.2, 6.66); G.add(ar); }
      porte2(G, cx, 6.72, 0, 2.1, 1.8, '#5a2a14', OR, false); medaillon(G, cx, 3.6, 6.75, 0.35);
      for (const x of [0.6, 10.4]) { G.add(at(cyl(0.55, 0.65, 8.0, P, 12), x, 4.0, 6.0)); G.add(at(cyl(0.8, 0.8, 0.2, OR, 12), x, 6.5, 6.0)); G.add(at(cyl(0.45, 0.45, 0.8, BRAISE, 12), x, 8.4, 6.0)); const d2 = lathe([[0.55, 0], [0.6, 0.3], [0.3, 0.8], [0, 1.1]], M({ map: TX.canal('#c83a2a') }), 16); G.add(at(d2, x, 8.8, 6.0)); }
      for (const s of [-1, 1]) for (const dx of [2.8, 3.9]) fenArc(G, cx + s * dx, 2.2, 6.2, 0.6, 1.6, OR, M({ map: TX.vitrail(FEU) }));
      return G;
    },
    /** 10. Art déco : masses en gradins, ailettes verticales, grand soleil-flamme doré, cuivre et chrome */
    10: () => {
      const G = new THREE.Group(), cx = 5.5, P = M({ map: TX.pierre('#e8dcc8') }), AC = M({ color: new THREE.Color('#d6dae2'), emissive: new THREE.Color('#1a1c20') });
      G.add(at(boite(10, 3.5, 6, P), cx, 1.75, 3)); G.add(at(boite(6.5, 6.0, 5, P), cx, 3.0, 3)); G.add(at(boite(3.2, 8.5, 4, P), cx, 4.25, 3));
      for (const [w, y] of [[10.1, 3.5], [6.6, 6.0], [3.3, 8.5]]) G.add(at(boite(w, 0.18, 0.1, OR), cx, y, w > 9 ? 6.03 : w > 6 ? 5.53 : 5.03));
      for (let i = 0; i < 7; i++) G.add(at(boite(0.2, 5.5, 0.3, P), cx - 3.0 + i, 3.0, 5.6));
      for (let i = 0; i < 4; i++) G.add(at(boite(0.18, 7.6, 0.25, AC), cx - 1.35 + i * 0.9, 4.2, 5.12));
      const so = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5), new THREE.MeshToonMaterial({ gradientMap: paliers, map: TX.soleil(), transparent: true, alphaTest: 0.5, color: new THREE.Color('#f8c060'), emissive: new THREE.Color('#402000') }));
      G.add(at(so, cx, 9.25, 5.06)); flamme(G, cx, 8.5, 4.0, 2.2);
      G.add(at(boite(2.6, 3.0, 0.05, M({ map: TX.verre() })), cx, 1.5, 6.02)); for (let i = 0; i < 5; i++) G.add(at(boite(0.06, 3.0, 0.06, OR), cx - 1.3 + i * 0.65, 1.5, 6.05));
      const fr = new THREE.Shape(); fr.moveTo(-1.6, 0); fr.lineTo(1.6, 0); fr.lineTo(0.9, 0.9); fr.lineTo(-0.9, 0.9); fr.closePath(); G.add(at(new THREE.Mesh(new THREE.ShapeGeometry(fr), OR), cx, 3.0, 6.05));
      medaillon(G, cx, 3.45, 6.08, 0.32);
      for (const s of [-1, 1]) { G.add(at(boite(0.5, 1.6, 0.5, AC), cx + s * 2.2, 0.8, 7.0)); brasero(G, cx + s * 2.2, 1.6, 7.0, 0.7); }
      return G;
    },
    /** 11. Moderne : cube de verre dans un exosquelette d'acier rouge en losanges, auvent en forme de flamme */
    11: () => {
      const G = new THREE.Group(), cx = 5.5, R = COL('#c8322a'), w = 9, d = 6, H = 5.5;
      G.add(at(boite(w, H, d, M({ map: TX.verre() })), cx, H / 2, 3.2));
      for (let i = 0; i <= 6; i++) G.add(at(boite(0.2, H, 0.2, R), cx - w / 2 + i * w / 6, H / 2, 6.25));
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const L = Math.hypot(w / 6, H), b = boite(0.14, L, 0.14, R); b.rotation.z = s * Math.atan2(w / 6, H); G.add(at(b, cx - w / 2 + (i + 0.5) * w / 6, H / 2, 6.28)); }
      G.add(at(boite(w + 0.3, 0.3, d + 0.3, R), cx, H + 0.15, 3.2)); G.add(at(boite(w + 0.32, 0.1, d + 0.32, BRAISE), cx, H - 0.1, 3.2));
      const fl = extr([[-2.0, 0], [2.0, 0], [1.4, 0.6], [1.6, 1.4], [0.6, 0.9], [0, 2.0], [-0.6, 0.9], [-1.6, 1.4], [-1.4, 0.6]], 0.25, M({ color: new THREE.Color('#ff7a20'), emissive: new THREE.Color('#a03000') }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 2.8, 6.4); G.add(fl);
      portesVitrees(G, cx, 6.3, 1.9, 2.3, R);
      medaillon(G, cx, H - 0.8, 6.35, 0.5);
      G.add(at(boite(3, 0.3, 3, COL('#5a5e66')), cx + 2, H + 0.45, 2.2)); flamme(G, cx - 2.5, H + 0.3, 2.0, 2.0);
      return G;
    },
    /** 12. Brutaliste : blocs de béton brut, étage en porte-à-faux, fentes de fenêtres embrasées, vasque de béton monumentale */
    12: () => {
      const G = new THREE.Group(), cx = 5.5, B2 = M({ map: TX.beton() });
      G.add(at(boite(8, 3.2, 6, B2), cx, 1.6, 3));
      G.add(at(boite(10.5, 2.6, 5, B2), cx, 4.5, 3.6));
      G.add(at(boite(4, 2.0, 3, B2), cx - 2, 6.8, 2.6));
      for (let i = 0; i < 10; i++) G.add(at(boite(0.25, 1.8, 0.05, BRAISE), cx - 4.5 + i, 4.5, 6.12));
      for (const s of [-1, 1]) G.add(at(boite(1.0, 3.2, 1.0, B2), cx + s * 4.6, 1.6, 5.6));
      G.add(at(boite(2.4, 2.6, 0.6, COL('#3a3a38')), cx, 1.3, 6.1)); porte2(G, cx, 6.4, 0, 2.4, 1.9, '#5a3020', COL('#5a5a58'), false);
      medaillon(G, cx, 4.5, 6.15, 0.45);
      const v = lathe([[0.4, 0], [0.4, 1.2], [1.5, 1.8], [1.6, 2.2], [1.3, 2.2], [1.25, 1.95], [0, 1.95]], B2, 20); G.add(at(v, cx + 3.2, 0, 8.4));
      flamme(G, cx + 3.2, 2.0, 8.4, 3.0); flamme(G, cx + 3.6, 2.0, 8.3, 2.0); flamme(G, cx + 2.8, 2.0, 8.5, 2.1);
      return G;
    },
    /** 13. Haut-fourneau : tour de fusion conique, cowpers à dômes, conduites, coulée de métal en fusion, halle d'entrée */
    13: () => {
      const G = new THREE.Group(), cx = 5.5, AC = COL('#5a5e66'), RO = COL('#8a3a2a');
      G.add(at(boite(6, 3.2, 3.5, M({ map: TX.tole('#7a2a20') })), cx - 1.5, 1.6, 7.0));
      G.add(at(cyl(1.3, 2.0, 7.0, M({ map: TX.brique('#6a3a2a') }), 16), cx + 1.0, 3.5, 3.5));
      G.add(at(cyl(1.0, 1.3, 1.5, AC, 16), cx + 1.0, 7.75, 3.5));
      for (const x of [0.8, 2.6]) { G.add(at(cyl(0.8, 0.8, 6.5, RO, 14), x, 3.25, 2.0)); const d2 = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), RO); G.add(at(d2, x, 6.5, 2.0)); }
      for (const [x0, x1, y] of [[0.8, cx + 1, 5.5], [2.6, cx + 1, 4.5]]) { const p = cyl(0.25, 0.25, x1 - x0, AC, 8); p.rotation.z = Math.PI / 2; G.add(at(p, (x0 + x1) / 2, y, 2.6)); }
      { const p = cyl(0.3, 0.3, 4.5, AC, 8); p.rotation.z = 0.6; G.add(at(p, cx + 3.0, 7.5, 3.5)); }
      G.add(at(boite(0.8, 0.12, 2.4, LAVE), cx + 2.6, 0.3, 5.2)); flamme(G, cx + 2.6, 0.3, 4.3, 1.4); flamme(G, cx + 1.0, 8.5, 3.5, 2.6);
      G.add(at(boite(1.6, 1.0, 1.0, COL('#2a2a30')), cx + 2.6, 0.5, 6.6)); G.add(at(cyl(0.6, 0.5, 0.3, LAVE, 12), cx + 2.6, 1.05, 6.6));
      porte2(G, cx - 1.5, 8.76, 0, 2.2, 1.8, '#3a3a40', RO, false); medaillon(G, cx - 1.5, 2.75, 8.78, 0.3);
      return G;
    },
    /** 14. Égyptien : pylônes trapézoïdaux à hiéroglyphes, gorge égyptienne, obélisques à pointe d'or, salle hypostyle */
    14: () => {
      const G = new THREE.Group(), cx = 5.5, P = M({ map: TX.hieroglyphes('#d8c090') }), PB = M({ map: TX.pierre('#e2cc9a') });
      G.add(at(boite(7, 3.6, 5, PB), cx, 1.8, 2.8));
      for (let i = 0; i < 5; i++) colonne(G, cx - 2.8 + i * 1.4, 5.6, 0, 3.6, 0.32, PB, COL('#c8a050'));
      for (const s of [-1, 1]) { const py = extr([[-1.9, 0], [1.9, 0], [1.4, 6.0], [-1.4, 6.0]], 2.0, P); py.position.set(cx + s * 3.3, 0, 6.3); G.add(py); G.add(at(boite(3.1, 0.3, 2.3, COL('#b8322a')), cx + s * 3.3, 6.1, 7.3)); G.add(at(boite(0.3, 3.8, 0.05, COL('#b8322a')), cx + s * 3.3, 3.2, 8.32)); }
      G.add(at(boite(2.6, 4.2, 1.8, PB), cx, 2.1, 7.4)); G.add(at(boite(3.0, 0.4, 2.2, COL('#c8a050')), cx, 4.3, 7.4));
      porte2(G, cx, 8.3, 0, 2.6, 1.8, '#5a3a1a', COL('#c8a050'), false);
      { const dk = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), OR); G.add(at(dk, cx, 3.6, 8.32)); for (const s of [-1, 1]) { const ai = boite(0.9, 0.18, 0.04, COL('#2a6ab8')); ai.rotation.z = s * 0.1; G.add(at(ai, cx + s * 0.75, 3.6, 8.31)); } }
      for (const s of [-1, 1]) { const x = cx + s * 5.3; G.add(at(boite(0.5, 0.4, 0.5, PB), x, 0.2, 9.0)); const ob = cyl(0.12, 0.28, 5.0, PB, 4); ob.rotation.y = Math.PI / 4; G.add(at(ob, x, 2.9, 9.0)); const pt = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 4), OR); pt.rotation.y = Math.PI / 4; G.add(at(pt, x, 5.65, 9.0)); }
      for (const s of [-1, 1]) brasero(G, cx + s * 1.5, 0, 9.4, 0.8, 0.9);
      return G;
    },
    /** 15. Gothique : nef à arcs-boutants et pinacles, deux tours à flèches, rosace de feu, portail en ogive */
    15: () => {
      const G = new THREE.Group(), cx = 5.5, P = M({ map: TX.pierre('#9a9488') }), PB = M({ map: TX.pierre('#b4aea2') });
      G.add(at(boite(5.4, 5.0, 6.5, P), cx, 2.5, 3.3));
      toitRue(G, cx - 2.7, cx + 2.7, 0, 6.5, 5.0, 3.0, null, P, 0.15, M({ map: TX.ardoise('#3a3e4a') }), '#2a2e38');
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const z = 0.8 + i * 1.6, x = cx + s * 4.2; G.add(at(boite(0.6, 4.5, 0.6, P), x, 2.25, z)); G.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 4), P), x, 5.1, z)); const ab = boite(0.25, 0.25, 1.8, P); ab.rotation.y = Math.PI / 2; ab.rotation.x = 0; const g2 = new THREE.Group(); g2.add(at(boite(1.6, 0.3, 0.3, P), 0, 0, 0)); g2.rotation.z = -s * 0.5; g2.position.set(cx + s * 3.4, 4.3, z); G.add(g2); }
      for (const s of [-1, 1]) { const x = cx + s * 2.1; G.add(at(boite(1.8, 8.0, 1.8, P), x, 4.0, 7.0)); for (const y of [5.0, 6.8]) { const o = extr([[-0.3, 0], [0.3, 0], [0.3, 0.8], [0, 1.2], [-0.3, 0.8]], 0.05, COL('#1a1414')); o.position.set(x, y, 7.88); G.add(o); }
        G.add(at(new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 8), M({ map: TX.ardoise('#3a3e4a') })), x, 9.7, 7.0)); flamme(G, x, 11.35, 7.0, 1.3); }
      G.add(at(boite(2.4, 6.0, 1.0, P), cx, 3.0, 7.4));
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), M({ map: TX.vitrail(FEU) })), cx, 4.6, 7.92)); G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.1, 6, 24), PB), cx, 4.6, 7.94));
      { const o = extr([[-0.9, 0], [0.9, 0], [0.9, 1.9], [0, 3.0], [-0.9, 1.9]], 0.05, M({ map: TX.bois('#4a2412') })); o.position.set(cx, 0, 7.91); G.add(o); }
      { const f = extr([[-1.15, 0], [-0.9, 0], [-0.9, 1.9], [0, 3.0], [0.9, 1.9], [0.9, 0], [1.15, 0], [1.15, 2.0], [0, 3.35], [-1.15, 2.0]], 0.15, PB); f.position.set(cx, 0, 7.9); G.add(f); }
      medaillon(G, cx, 6.2, 7.92, 0.3);
      return G;
    },
    /** 16. Citadelle d'obsidienne : tours facettées noires, failles de lave, pointes, fenêtres embrasées, porte en mâchoire */
    16: () => {
      const G = new THREE.Group(), cx = 5.5, O = M({ color: new THREE.Color('#24202a'), emissive: new THREE.Color('#0a0408') });
      G.add(at(cyl(4.6, 5.2, 4.0, O, 6), cx, 2.0, 4.5));
      for (const [x, z, h, r] of [[cx, 3.5, 9, 1.6], [cx - 3.3, 6.2, 6.5, 1.1], [cx + 3.3, 6.2, 6.5, 1.1], [cx - 3.0, 2.2, 7, 1.0], [cx + 3.0, 2.2, 7, 1.0]]) {
        G.add(at(cyl(r * 0.7, r, h, O, 6), x, h / 2, z)); G.add(at(new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, h * 0.35, 6), O), x, h + h * 0.17, z));
        for (let k = 0; k < 3; k++) G.add(at(boite(0.08, h * 0.5, 0.05, LAVE), x + Math.sin(k * 2.1) * r * 0.5, h * 0.45, z + r * 0.85));
        G.add(at(boite(0.3, 0.5, 0.05, BRAISE), x, h * 0.7, z + r * 0.75));
      }
      for (let i = 0; i < 10; i++) { const a = -0.6 + i * 0.13 + Math.PI / 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.9, 5), O); c.rotation.x = 0.5; G.add(at(c, cx + Math.cos(a) * 5.0, 4.2, 4.5 + Math.sin(a) * 4.3)); }
      G.add(at(boite(2.2, 2.6, 0.6, COL('#120c0c')), cx, 1.3, 9.4));
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 5), M({ color: new THREE.Color('#e8e0d0') })); c.rotation.z = s > 0 ? Math.PI : 0; G.add(at(c, cx - 0.75 + k * 0.5, s > 0 ? 2.4 : 0.3, 9.75)); }
      G.add(at(boite(1.8, 0.2, 0.05, BRAISE), cx, 0.15, 9.72));
      medaillon(G, cx, 3.3, 9.72, 0.4);
      return G;
    },
    /** 17. Stade de la flamme : stade ovale à ailettes rouges, gradins rouges, grande vasque sur trépied */
    17: () => {
      const G = new THREE.Group(), cx = 5.5, cz = 4.6, E = new THREE.Group(); E.position.set(cx, 0, cz); E.scale.z = 0.8; G.add(E);
      const BL = COL('#f0eee8');
      E.add(at(lathe([[5.3, 0], [5.3, 3.6], [5.0, 3.6], [4.2, 2.4], [3.4, 1.2], [3.0, 0.5], [3.0, 0.2]], M({ color: new THREE.Color('#c8322a'), side: THREE.DoubleSide }), 48), 0, 0, 0));
      for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, f = boite(0.18, 4.0, 0.6, BL); f.rotation.y = -a; E.add(at(f, Math.cos(a) * 5.45, 2.0, Math.sin(a) * 5.45)); }
      E.add(at(cyl(3.0, 3.0, 0.2, COL('#5a9a48'), 32), 0, 0.1, 0));
      { const r = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 4, 32), COL('#c86a3a')); r.rotation.x = Math.PI / 2; E.add(at(r, 0, 0.22, 0)); }
      const zv = cz + 5.0;
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, l = cyl(0.1, 0.14, 5.5, COL('#d6dae2'), 6); l.rotation.z = Math.cos(a) * 0.2; l.rotation.x = Math.sin(a) * 0.2; G.add(at(l, cx + Math.cos(a) * 0.55, 2.7, zv + Math.sin(a) * 0.55)); }
      G.add(at(lathe([[0.2, 0], [1.1, 0.5], [1.3, 0.9], [1.2, 0.9], [0, 0.6]], OR, 20), cx, 5.4, zv));
      flamme(G, cx, 6.2, zv, 3.4); flamme(G, cx + 0.5, 6.2, zv, 2.2); flamme(G, cx - 0.5, 6.2, zv + 0.2, 2.4);
      G.add(at(boite(2.6, 3.0, 1.0, BL), cx, 1.5, cz + 4.4)); porte2(G, cx, cz + 4.92, 0, 2.2, 1.8, '#c8322a', COL('#d6dae2'), false); medaillon(G, cx, 2.65, cz + 4.95, 0.28);
      return G;
    },
    /** 18. Halle viking : longue maison de bois au faîtage courbe, têtes de dragon aux pignons, boucliers, foyer qui fume */
    18: () => {
      const G = new THREE.Group(), cx = 5.5, BO = M({ map: TX.planches('#7a5232') });
      G.add(at(boite(9.5, 0.4, 6.2, M({ map: TX.pierre('#8a8478') })), cx, 0.2, 3.4));
      G.add(at(boite(8.6, 2.4, 5.0, BO), cx, 1.6, 3.4));
      const prof = []; for (let i = 0; i <= 16; i++) { const u = i / 16 * 2 - 1; prof.push([u * 5.2, 4.2 + 0.6 * u * u]); }
      // toit à faîtage courbe : deux pans tendus du faîtage courbe aux sablières
      const pos = [], idx = []; for (let i = 0; i <= 16; i++) { const [x, y] = prof[i]; pos.push(cx + x, y, 3.4, cx + x * 0.95, 2.6, 0.4, cx + x * 0.95, 2.6, 6.4); }
      for (let i = 0; i < 16; i++) { const a = i * 3, b = a + 3; idx.push(a, b, a + 1, b, b + 1, a + 1, a, a + 2, b, b, a + 2, b + 2); }
      const gt = new THREE.BufferGeometry(); gt.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gt.setIndex(idx); gt.computeVertexNormals();
      const uvs = []; for (let i = 0; i <= 16; i++) uvs.push(i * 0.65, 0, i * 0.65, 3, i * 0.65, 3); gt.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const tm = new THREE.Mesh(gt, M({ map: TX.bardeaux('#5a4030'), side: THREE.DoubleSide })); tm.castShadow = true; G.add(tm);
      for (const s of [-1, 1]) { const x = cx + s * 5.2; for (const t of [-1, 1]) { const b = boite(0.15, 2.4, 0.2, COL('#5a3a20')); b.rotation.x = t * 0.5; G.add(at(b, x, 5.2, 3.4 + t * 0.55)); } const h = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 5), COL('#5a3a20')); h.rotation.z = -s * 1.3; G.add(at(h, x + s * 0.3, 6.2, 3.4)); }
      for (let i = 0; i < 6; i++) { const x = cx - 3.6 + i * 1.44; const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), COL(['#b8322a', '#e8c060', '#2a5a9a'][i % 3])); G.add(at(sh, x, 1.9, 5.92)); G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), COL('#8a8a90')), x, 1.9, 5.94)); }
      porte2(G, cx, 5.92, 0.4, 2.0, 1.8, '#5a3a1a', COL('#3a2410'), false); medaillon(G, cx, 2.8, 5.94, 0.3);
      G.add(at(boite(0.8, 0.5, 0.8, BRAISE), cx, 4.6, 3.4)); flamme(G, cx, 4.8, 3.4, 1.6);
      for (const s of [-1, 1]) brasero(G, cx + s * 2.2, 0, 7.0, 0.8, 1.0);
      return G;
    },
    /** 19. Tour du brasier : tambour d'arcades, haute tour ronde, couronne de merlons et brasier géant au sommet */
    19: () => {
      const G = new THREE.Group(), cx = 5.5, cz = 4.8, P = M({ map: TX.pierre('#c8b8a0') });
      const t = TX.arcades('#c8b8a0').clone(); t.repeat.set(Math.round(2 * Math.PI * 4.6), 1.5); t.needsUpdate = true;
      G.add(at(new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.7, 3.0, 40), [M({ map: t }), P, P]), cx, 1.5, cz));
      G.add(at(cyl(4.8, 4.8, 0.3, M({ map: TX.pierre('#a89880') }), 40), cx, 3.15, cz));
      G.add(at(cyl(4.4, 4.6, 0.6, M({ map: TX.canal('#b8402a') }), 40), cx, 3.6, cz));
      G.add(at(cyl(1.8, 2.1, 9.0, P, 20), cx, 7.5, cz));
      for (const y of [6.0, 9.0]) G.add(at(cyl(2.0, 2.0, 0.25, COL(FEU), 20), cx, y, cz));
      for (const y of [5.0, 7.5, 10.0]) fenArc(G, cx, y, cz + 2.0, 0.4, 0.9, P, M({ map: TX.vitrail(FEU) }));
      G.add(at(cyl(2.6, 2.0, 0.6, M({ map: TX.pierre('#a89880') }), 20), cx, 12.3, cz));
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; G.add(at(boite(0.45, 0.5, 0.45, P), cx + Math.cos(a) * 2.4, 12.85, cz + Math.sin(a) * 2.4)); }
      G.add(at(cyl(1.5, 0.9, 0.6, COL('#3a3230'), 16), cx, 12.9, cz)); G.add(at(cyl(1.4, 1.4, 0.05, LAVE, 16), cx, 13.2, cz));
      for (const [dx, dz, s] of [[0, 0, 5], [0.6, 0.2, 3.2], [-0.6, 0, 3.4], [0.1, -0.6, 3.0], [-0.2, 0.6, 2.8]]) flamme(G, cx + dx, 13.2, cz + dz, s);
      G.add(at(boite(2.4, 2.8, 1.0, P), cx, 1.4, cz + 4.6)); porte2(G, cx, cz + 5.11, 0, 2.2, 1.8); medaillon(G, cx, 4.3, cz + 4.75, 0.4);
      return G;
    },
    /** 20. Panthéon du feu : rotonde à coupole dont l'oculus laisse jaillir une colonne de flammes, portique à huit colonnes */
    20: () => {
      const G = new THREE.Group(), cx = 5.5, cz = 3.8, P = M({ map: TX.pierre('#e2dccc') }), MA = M({ map: TX.marbre() });
      G.add(at(cyl(4.0, 4.0, 4.5, P, 40), cx, 2.25, cz));
      G.add(at(cyl(4.1, 4.1, 0.25, COL(FEU), 40), cx, 4.3, cz));
      G.add(at(lathe([[4.1, 0], [4.1, 0.4], [3.6, 1.6], [2.6, 2.6], [1.3, 3.2], [0.9, 3.25], [0.9, 3.0]], M({ map: TX.canal('#7a8a8a') }), 40), cx, 4.45, cz));
      { const r = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 6, 20), OR); r.rotation.x = Math.PI / 2; G.add(at(r, cx, 7.7, cz)); }
      G.add(at(cyl(0.85, 0.85, 0.05, LAVE, 20), cx, 7.6, cz));
      for (const [dx, dz, s] of [[0, 0, 4.5], [0.4, 0.1, 2.8], [-0.35, 0.1, 3.0], [0, -0.4, 2.6]]) flamme(G, cx + dx, 7.65, cz + dz, s);
      G.add(at(boite(7.0, 0.6, 3.2, P), cx, 0.3, cz + 4.6));
      for (let i = 0; i < 8; i++) colonne(G, cx - 3.15 + i * 0.9, cz + 5.7, 0.6, 4.0, 0.25, MA, P);
      G.add(at(boite(7.4, 0.5, 2.8, P), cx, 4.85, cz + 4.7)); G.add(at(boite(7.42, 0.16, 2.82, COL(FEU)), cx, 4.68, cz + 4.7));
      fronton(G, cx, 5.1, cz + 6.1, 7.4, 1.3, 2.8, P); medaillon(G, cx, 5.55, cz + 6.12, 0.35);
      porte2(G, cx, cz + 3.95, 0.6, 2.6, 1.8, '#4a2412', OR, false);
      marches(G, cx, cz + 6.2, 5.0, 3, 0.2, 0.3, P);
      for (const s of [-1, 1]) brasero(G, cx + s * 3.8, 0, cz + 6.8, 0.8, 0.9);
      return G;
    },
  };
  /** arène de type Feu, l'un des vingt styles (1 → 20) */
  B.areneFeu = ({ style = 1 } = {}) => (FEUX[style] || FEUX[1])();
  B.areneFeu.styles = [
    'Temple-pavillon', 'Volcan', 'Forge industrielle', 'Château fort', 'Colisée', 'Pyramide à degrés', 'Temple grec d’Héphaïstos', 'Sanctuaire au torii',
    'Palais oriental', 'Art déco', 'Moderne verre et acier', 'Brutaliste', 'Haut-fourneau', 'Égyptien', 'Gothique', 'Citadelle d’obsidienne',
    'Stade de la flamme', 'Halle viking', 'Tour du brasier', 'Panthéon du feu'];

  /* ============================================================== temple-pavillon : variantes inspirées des arènes ==== */
  /** pavillon de pierre (le temple-pavillon retenu, paramétré) : péristyle, entablement à frise, toit en jupe,
   *  claire-voie, grand toit à demi-croupes ; renvoie les hauteurs utiles */
  function pavillonPierre(G, o) {
    const { cx, cz, px = 5.0, pz = 3.85, sx = 4.2, sz = 2.95, y0 = 1.05, hcol = 4.2, toit = '#b8402a', pierre = '#c8b0a0', acc = FEU,
      cols = 'tour', verre = false, sombre = false, ornement = true, bannieres = true, etages = 0, lanternes = true, rive = null, bord = '#e8c060' } = o;
    const A = COL(acc), PM = sombre ? M({ map: TX.pierre('#3a3436') }) : M({ map: TX.pierre(pierre) }), PB = sombre ? M({ map: TX.pierre('#5a5254') }) : M({ map: TX.pierre(mix(pierre, 0.35)) });
    const MA = sombre ? M({ map: TX.pierre('#2a2426') }) : M({ map: TX.marbre() }), pzc = cz;
    const TT = { col: toit, rive: rive || mix(sombre ? '#3a3436' : pierre, -0.45), bord, uvk: 0.4, flare: 0.04 };
    const zh = pzc - 0.1, zf = zh + sz;
    if (verre) {
      G.add(at(boite(2 * sx, hcol, 2 * sz, M({ color: new THREE.Color('#9cc8e8'), transparent: true, opacity: 0.55 })), cx, y0 + hcol / 2, zh));
      G.add(at(boite(2 * sx - 1.2, hcol - 0.6, 2 * sz - 1.2, BRAISE), cx, y0 + (hcol - 0.6) / 2, zh));
      for (let i = 0; i <= 8; i++) G.add(at(boite(0.08, hcol, 0.08, COL('#3a2a24')), cx - sx + i * sx / 4, y0 + hcol / 2, zf + 0.02));
    } else {
      G.add(at(boite(2 * sx, hcol, 2 * sz, PM), cx, y0 + hcol / 2, zh));
      for (const s of [-1, 1]) for (const dx of [1.9, 3.0]) if (dx < sx - 0.5) fenArc(G, cx + s * dx, y0 + 1.9, zf, 0.5, 2.0, PB, M({ map: TX.vitrail(acc) }));
    }
    for (const yy of [y0 + 0.15, y0 + hcol - 0.3]) G.add(at(boite(2 * sx + 0.08, 0.14, 2 * sz + 0.08, PB), cx, yy, zh));
    G.add(at(boite(1.8, 2.3, 0.05, M({ map: TX.bois('#5a3020') })), cx, y0 + 1.15, zf + 0.03));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.9, 18, 0, Math.PI), M({ map: TX.vitrail(acc) })), cx, y0 + 2.3, zf + 0.03));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 18, Math.PI), OR), cx, y0 + 2.3, zf + 0.07));
    for (const s of [-1, 1]) G.add(at(boite(0.12, 2.3, 0.1, OR), cx + s * 0.96, y0 + 1.15, zf + 0.07));
    // colonnes
    const pts = [];
    if (cols !== 'aucune') {
      for (let i = 0; i < 8; i++) { const x = cx - px + i * (2 * px / 7); pts.push([x, pzc + pz]); if (cols === 'tour') pts.push([x, pzc - pz]); }
      for (let i = cols === 'tour' ? 1 : 5; i < 5; i++) { const z = pzc - pz + i * (2 * pz / 5); pts.push([cx - px, z], [cx + px, z]); }
      if (cols !== 'tour') pts.push([cx - px, pzc - pz], [cx + px, pzc - pz]);
    }
    for (const [x, z] of pts) { colonne(G, x, z, y0, hcol, 0.24, MA, PB); G.add(at(cyl(0.29, 0.29, 0.07, OR, 12), x, y0 + hcol - 0.32, z)); }
    const ye = y0 + hcol;
    G.add(at(boite(2 * px + 0.75, 0.32, 2 * pz + 0.75, PB), cx, ye + 0.16, pzc));
    G.add(at(boite(2 * px + 0.78, 0.3, 2 * pz + 0.78, A), cx, ye + 0.47, pzc));
    for (let i = 0; i < 13; i++) G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), OR), cx - px + i * (2 * px / 12), ye + 0.47, pzc + pz + 0.4));
    G.add(at(boite(2 * px + 1.0, 0.16, 2 * pz + 1.0, PB), cx, ye + 0.7, pzc));
    G.add(at(boite(1.5, 0.75, 0.08, PB), cx, ye + 0.45, pzc + pz + 0.44)); medaillon(G, cx, ye + 0.45, pzc + pz + 0.49, 0.3);
    const yr = ye + 0.78;
    toitChinois(G, cx, pzc, yr, px + 0.55, pz + 0.55, 0.6, { ...TT, xt: sx + 0.05, zt: sz + 0.25, lift: 0.25 });
    let yv = yr + 0.55, hv = 1.8, cs = sx, cz2 = sz;
    G.add(at(boite(2 * cs + 0.1, hv, 2 * cz2 + 0.5, PM), cx, yv + hv / 2, pzc));
    for (let i = 0; i < 5; i++) { const x = cx - (cs - 1.4) + i * (2 * (cs - 1.4) / 4); fenArc(G, x, yv + hv / 2 - 0.1, pzc + cz2 + 0.25, 0.5, 0.75, PB, M({ map: TX.vitrail(acc) })); }
    G.add(at(boite(2 * cs + 0.3, 0.14, 2 * cz2 + 0.7, PB), cx, yv + hv - 0.07, pzc));
    let yh = yv + hv - 0.05;
    for (let e = 0; e < etages; e++) {          // étages de tour supplémentaires (pagode)
      const ncs = cs * 0.72, ncz = cz2 * 0.72;
      toitChinois(G, cx, pzc, yh, cs + 0.75, cz2 + 0.75, 0.7, { ...TT, xt: ncs + 0.05, zt: ncz + 0.05, lift: 0.3 });
      yv = yh + 0.65; hv = 1.6; cs = ncs; cz2 = ncz;
      G.add(at(boite(2 * cs, hv, 2 * cz2, PM), cx, yv + hv / 2, pzc));
      for (let i = 0; i < 3; i++) fenArc(G, cx - cs * 0.55 + i * cs * 0.55, yv + hv / 2 - 0.1, pzc + cz2, 0.4, 0.6, PB, M({ map: TX.vitrail(acc) }));
      yh = yv + hv - 0.05;
    }
    toitChinois(G, cx, pzc, yh, cs + 0.75, cz2 + 0.75, 1.75, { ...TT, xt: Math.max(0.3, cs - 1.0), zt: 0.14, lift: 0.35 });
    if (ornement) { const orn = new THREE.Group(); orn.scale.setScalar(0.8); G.add(orn); sommetType(orn, 'feu', cx / 0.8, (yh + 1.85) / 0.8, pzc / 0.8, acc); }
    if (lanternes) for (const sxx of [-1, 1]) for (const szz of [-1, 1]) { G.add(at(boite(0.03, 0.35, 0.03, COL('#2a2a30')), cx + sxx * (px + 0.3), yr - 0.05, pzc + szz * (pz + 0.3))); G.add(at(cyl(0.12, 0.12, 0.3, LUM('#ffe0a0', '#a06020'), 8), cx + sxx * (px + 0.3), yr - 0.38, pzc + szz * (pz + 0.3))); }
    if (bannieres) for (const s of [-1, 1]) {
      const x = cx + s * (2 * px / 7) * 1.5;
      G.add(at(boite(0.75, 2.2, 0.03, A), x, ye - 1.2, pzc + pz + 0.3));
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), M({ map: emblemeTex('feu', acc) })), x, ye - 0.9, pzc + pz + 0.32));
      const pt = new THREE.Shape(); pt.moveTo(-0.375, 0); pt.lineTo(0.375, 0); pt.lineTo(0, -0.3); pt.closePath();
      G.add(at(new THREE.Mesh(new THREE.ShapeGeometry(pt), A), x, ye - 2.3, pzc + pz + 0.3));
    }
    return { ye, yr, yh, ytop: yh + 1.75, zf: pzc + pz };
  }
  /** socle à gradins avec balustrade et perron au sud */
  function socleTemple(G, cx, cz, w, d, h, pierre, lgEsc = 4.4, balus = true) {
    const PS = M({ map: TX.pierre(mix(pierre, -0.12)) }), PM = M({ map: TX.pierre(pierre) }), PB = M({ map: TX.pierre(mix(pierre, 0.35)) });
    G.add(at(boite(w, h * 0.52, d, PS), cx, h * 0.26, cz)); G.add(at(boite(w - 0.6, h * 0.48, d - 0.6, PM), cx, h * 0.76, cz));
    const n = Math.max(2, Math.round(h / 0.21));
    for (let k = 0; k < n; k++) G.add(at(boite(lgEsc + k * 0.2, h / n, 0.32, PB), cx, h / n * (n - k - 0.5), cz + d / 2 - 0.2 + k * 0.32));
    if (balus) { const x0 = cx - w / 2 + 0.4, x1 = cx + w / 2 - 0.4, z0 = cz - d / 2 + 0.4, z1 = cz + d / 2 - 0.4;
      balustrade(G, x0, z1, cx - lgEsc / 2 - 0.1, z1, h, PB, 0.4, 0.26); balustrade(G, cx + lgEsc / 2 + 0.1, z1, x1, z1, h, PB, 0.4, 0.26);
      balustrade(G, x0, z0, x0, z1, h, PB, 0.4, 0.26); balustrade(G, x1, z0, x1, z1, h, PB, 0.4, 0.26); }
  }
  /** statue d'arène (comme celles qui gardent l'entrée des arènes) : socle à plaque dorée, créature de pierre dressée */
  function statueArene(G, x, z, k = 1, acc = FEU) {
    const P = M({ map: TX.pierre('#a8a49c') }), S2 = new THREE.Group(); S2.position.set(x, 0, z); S2.scale.setScalar(k);
    S2.add(at(boite(0.9, 0.9, 0.9, M({ map: TX.pierre('#d8d2c6') })), 0, 0.45, 0)); S2.add(at(boite(1.0, 0.1, 1.0, COL(acc)), 0, 0.92, 0));
    S2.add(at(boite(0.5, 0.3, 0.03, OR), 0, 0.5, 0.46));
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), P); c.scale.set(1, 1.2, 0.9); S2.add(at(c, 0, 1.35, 0));
    S2.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), P), 0, 1.85, 0.08));
    const corne = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), P); corne.rotation.x = 0.4; S2.add(at(corne, 0, 2.08, 0.18));
    for (const s of [-1, 1]) { S2.add(at(cyl(0.09, 0.11, 0.35, P, 6), s * 0.2, 1.05, 0.05)); const b = cyl(0.06, 0.07, 0.35, P, 6); b.rotation.z = s * 0.6; S2.add(at(b, s * 0.33, 1.45, 0.1)); }
    const q = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 6), P); q.rotation.x = -1.1; S2.add(at(q, 0, 1.1, -0.38));
    S2.traverse((o) => { if (o.isMesh) o.castShadow = true; }); G.add(S2);
  }
  /** panneau d'arène sur deux poteaux : emblème et lignes de texte */
  function panneauArene(G, x, z) {
    for (const s of [-1, 1]) G.add(at(boite(0.08, 1.1, 0.08, COL('#4a3a30')), x + s * 0.5, 0.55, z));
    G.add(at(boite(1.2, 0.6, 0.08, M({ map: TX.bois('#8a5a34') })), x, 0.95, z)); G.add(at(boite(1.1, 0.5, 0.02, COL('#f0e8d8')), x, 0.95, z + 0.05));
    medaillon(G, x - 0.35, 0.95, z + 0.07, 0.15);
    for (let i = 0; i < 3; i++) G.add(at(boite(0.55 - i * 0.12, 0.04, 0.01, COL('#5a4a3a')), x + 0.15, 1.08 - i * 0.12, z + 0.07));
  }
  const vapeur = (G, x, y, z, n = 5) => { for (let i = 0; i < n; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.25 + hash(i, 61) * 0.25, 8, 6), M({ color: new THREE.Color('#f4f4f8'), transparent: true, opacity: 0.45 })), x + (hash(i, 62) - 0.5) * 0.8, y + 0.3 + i * 0.35, z + (hash(i, 63) - 0.5) * 0.6)); };

  const PAVILLONS = {
    /** A. Classique : le temple-pavillon tel quel, gardé par deux statues d'arène et un panneau, comme dans les jeux */
    A: () => { const G = new THREE.Group(); socleTemple(G, 6, 4.6, 12, 9.4, 1.05, '#c8b0a0'); pavillonPierre(G, { cx: 6, cz: 4.5 });
      statueArene(G, 2.2, 10.4); statueArene(G, 9.8, 10.4); panneauArene(G, 10.2, 11.6); brasero(G, 3.4, 0, 10.6, 0.6, 0.8); brasero(G, 8.6, 0, 10.6, 0.6, 0.8); return G; },
    /** B. Sources chaudes : le pavillon flanqué de bassins fumants entre les rochers, palissade de bambou */
    B: () => { const G = new THREE.Group(); socleTemple(G, 6, 4.6, 12, 9.4, 1.05, '#c8a890'); pavillonPierre(G, { cx: 6, cz: 4.5, toit: '#a83a2a' });
      const R = M({ map: TX.pierre('#7a6a5a') });
      for (const [x, z, r] of [[14.5, 3.2, 1.6], [15.2, 7.0, 1.3], [-2.4, 5.5, 1.4]]) { G.add(at(cyl(r, r, 0.12, M({ color: new THREE.Color('#7ac0d8'), emissive: new THREE.Color('#183040') }), 16), x, 0.06, z)); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + hash(i, x) * 0.2), R); G.add(at(p, x + Math.cos(a) * (r + 0.2), 0.2, z + Math.sin(a) * (r + 0.2))); } vapeur(G, x, 0.1, z, 6); }
      for (let i = 0; i < 18; i++) G.add(at(cyl(0.07, 0.07, 1.6, COL(i % 2 ? '#8aa858' : '#9ab868'), 6), 12.6 + i * 0.27, 0.8, 0.6));
      for (let i = 0; i < 14; i++) G.add(at(cyl(0.07, 0.07, 1.6, COL(i % 2 ? '#8aa858' : '#9ab868'), 6), -3.9 + i * 0.27, 0.8, 3.2));
      statueArene(G, 2.2, 10.4); statueArene(G, 9.8, 10.4); return G; },
    /** C. Cour intérieure : enceinte à toit de tuiles, porte-pavillon, grand brasero au milieu de la cour, temple au fond */
    C: () => { const G = new THREE.Group(), P = M({ map: TX.pierre('#c8b0a0') });
      G.add(at(boite(16, 0.08, 18, M({ map: TX.pierre('#d8c8b0') })), 8, 0.04, 9));
      for (const [x, z, w, d] of [[8, 0.2, 16, 0.4], [0.2, 9, 0.4, 18], [15.8, 9, 0.4, 18], [3.2, 17.8, 6.4, 0.4], [12.8, 17.8, 6.4, 0.4]]) { G.add(at(boite(w, 2.4, d, P), x, 1.2, z)); const t = boite(w + 0.4, 0.2, d + 0.4, M({ map: TX.canalPetit('#b8402a') })); G.add(at(t, x, 2.5, z)); }
      socleTemple(G, 8, 5.6, 12, 9.0, 0.8, '#c8b0a0', 4.4, false); pavillonPierre(G, { cx: 8, cz: 5.4, y0: 0.8, hcol: 3.8 });
      G.add(at(boite(3.2, 3.0, 1.0, P), 8, 1.5, 17.8)); G.add(at(boite(2.0, 2.4, 1.1, COL('#2a1a14')), 8, 1.2, 17.8));
      toitChinois(G, 8, 17.8, 3.0, 2.4, 1.2, 1.0, { col: '#b8402a', rive: '#5a4a40', bord: '#e8c060', xt: 1.2, zt: 0.12, lift: 0.35, uvk: 0.5 });
      medaillon(G, 8, 2.6, 18.32, 0.3);
      G.add(at(cyl(1.2, 1.4, 0.6, M({ map: TX.pierre('#a89880') }), 16), 8, 0.3, 13.0)); brasero(G, 8, 0.6, 13.0, 1.6);
      statueArene(G, 5.6, 15.5, 0.9); statueArene(G, 10.4, 15.5, 0.9); return G; },
    /** D. Temple du Ciel du feu : rotonde à triple toit conique de tuiles rouges sur une terrasse ronde à trois gradins */
    D: () => { const G = new THREE.Group(), cx = 6.5, cz = 6.5, BL = M({ map: TX.pierre('#ece6da') });
      for (let k = 0; k < 3; k++) { const r = 6.2 - k * 0.9, y = k * 0.45; G.add(at(cyl(r, r, 0.45, BL, 48), cx, y + 0.22, cz)); const n = Math.round(r * 5); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; G.add(at(cyl(0.04, 0.05, 0.35, BL, 5), cx + Math.cos(a) * (r - 0.1), y + 0.62, cz + Math.sin(a) * (r - 0.1))); } }
      for (let k = 0; k < 6; k++) G.add(at(boite(2.4, 0.22 * (6 - k), 0.32, BL), cx, 0.11 * (6 - k), cz + 4.0 + k * 0.32));
      const y0 = 1.35;
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; G.add(at(cyl(0.16, 0.16, 3.2, COL('#c8322a'), 10), cx + Math.cos(a) * 3.1, y0 + 1.6, cz + Math.sin(a) * 3.1)); }
      G.add(at(cyl(2.5, 2.5, 3.2, M({ map: TX.treillis('#8a2a1a') }), 24), cx, y0 + 1.6, cz));
      let y = y0 + 3.2;
      const roof = (r, h) => { const m = lathe([[r, 0], [r * 0.82, h * 0.25], [r * 0.5, h * 0.7], [0.3, h], [0, h]], M({ map: TX.canal('#b8402a') }), 32); G.add(at(m, cx, y, cz)); const b = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 4, 32), OR); b.rotation.x = Math.PI / 2; G.add(at(b, cx, y + 0.02, cz)); };
      G.add(at(cyl(3.4, 3.4, 0.3, COL(FEU), 32), cx, y + 0.15, cz)); y += 0.3; roof(3.9, 1.0); y += 0.8;
      G.add(at(cyl(2.3, 2.3, 1.1, COL('#c8322a'), 24), cx, y + 0.55, cz)); y += 1.1; roof(3.0, 0.9); y += 0.7;
      G.add(at(cyl(1.6, 1.6, 1.0, COL('#c8322a'), 20), cx, y + 0.5, cz)); y += 1.0; roof(2.2, 1.6); y += 1.5;
      G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), OR), cx, y + 0.2, cz)); flamme(G, cx, y + 0.45, cz, 2.0);
      porte2(G, cx, cz + 2.5, y0, 2.2, 1.6); medaillon(G, cx, y0 + 3.6, cz + 3.45, 0.35);
      for (const s of [-1, 1]) brasero(G, cx + s * 2.0, 0, cz + 6.6, 0.7, 0.8);
      return G; },
    /** E. Terrasses de lave : le pavillon au sommet de trois terrasses de basalte bordées de rigoles de lave */
    E: () => { const G = new THREE.Group(), cx = 7, cz = 6, BA = M({ map: TX.pierre('#4a4446') });
      for (let k = 0; k < 3; k++) { const w = 14 - k * 1.4, d = 12 - k * 1.2, y = k * 0.8; G.add(at(boite(w, 0.8, d, BA), cx, y + 0.4, cz - k * 0.3)); G.add(at(boite(w - 0.3, 0.06, 0.22, LAVE), cx, y + 0.82, cz - k * 0.3 + d / 2 - 0.2)); }
      for (let k = 0; k < 12; k++) G.add(at(boite(3.0, 0.2 * (12 - k), 0.3, M({ map: TX.pierre('#6a6264') })), cx, 0.1 * (12 - k), cz + 5.4 + k * 0.3 - 3.0));
      const r = pavillonPierre(G, { cx, cz: cz - 0.8, y0: 2.4, px: 4.6, pz: 3.4, sx: 3.8, sz: 2.6, hcol: 3.8, toit: '#a83020', pierre: '#c0a090' });
      for (const s of [-1, 1]) { brasero(G, cx + s * 2.0, 0, cz + 6.4, 0.8, 0.9); brasero(G, cx + s * 5.6, 2.4, cz + 3.2, 0.7, 0.5); }
      return G; },
    /** F. Pavillon-stade : un stade ovale de pierre dont l'entrée est un pavillon monumental, emblème géant, mâts d'éclairage */
    F: () => { const G = new THREE.Group(), cx = 8, cz = 6, E = new THREE.Group(); E.position.set(cx, 0, cz); E.scale.z = 0.75; G.add(E);
      E.add(at(lathe([[7.6, 0], [7.6, 4.2], [7.2, 4.2], [6.0, 3.0], [5.0, 1.8], [4.4, 0.6], [4.4, 0.3]], M({ map: TX.pierre('#c8b8a4'), side: THREE.DoubleSide }), 56), 0, 0, 0));
      const t = TX.arcades('#c8b8a4').clone(); t.repeat.set(48, 2); t.needsUpdate = true; E.add(at(new THREE.Mesh(new THREE.CylinderGeometry(7.7, 7.7, 4.2, 56, 1, true), M({ map: t })), 0, 2.1, 0));
      E.add(at(cyl(4.4, 4.4, 0.25, COL('#c89060'), 40), 0, 0.12, 0)); E.add(at(new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), M({ map: emblemeTex('feu', FEU) })), 0, 0.26, 0).rotateX(-Math.PI / 2));
      pavillonPierre(G, { cx, cz: cz + 5.6, y0: 0.4, px: 4.0, pz: 1.8, sx: 3.3, sz: 1.2, hcol: 4.0, cols: 'facade', bannieres: false });
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), M({ map: emblemeTex('feu', FEU) })), cx, 9.6, cz + 7.5)); G.add(at(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 6, 24), OR), cx, 9.6, cz + 7.52));
      for (const [x, z] of [[cx - 7.2, cz - 4], [cx + 7.2, cz - 4], [cx - 7.2, cz + 4], [cx + 7.2, cz + 4]]) { G.add(at(cyl(0.12, 0.18, 8, COL('#8a8e98'), 6), x, 4, z)); G.add(at(boite(1.4, 0.8, 0.2, LUM('#fff8e0', '#a09060')), x, 8.2, z)); }
      return G; },
    /** G. Palais à ailes : le pavillon central relié à deux pavillons latéraux par des galeries couvertes à colonnes */
    G: () => { const G = new THREE.Group(), cx = 9; socleTemple(G, cx, 4.6, 18, 9.4, 1.05, '#c8b0a0', 4.4);
      pavillonPierre(G, { cx, cz: 4.5 });
      for (const s of [-1, 1]) { const x = cx + s * 7.2; G.add(at(boite(2.6, 3.0, 2.6, M({ map: TX.pierre('#c8b0a0') })), x, 2.55, 3.4)); toitChinois(G, x, 3.4, 4.05, 1.9, 1.9, 1.4, { col: '#b8402a', rive: '#5a4a40', bord: '#e8c060', xt: 0.6, zt: 0.12, lift: 0.4, uvk: 0.5 }); fenArc(G, x, 2.4, 4.7, 0.6, 1.4, M({ map: TX.pierre('#e2d8c8') }), M({ map: TX.vitrail(FEU) }));
        for (let i = 0; i < 3; i++) colonne(G, cx + s * (5.3 + i * 0.0) , 6.1 - i * 1.5, 1.05, 2.6, 0.16, M({ map: TX.marbre() }), M({ map: TX.pierre('#e2d8c8') }));
        const gal = boite(1.6, 0.1, 4.6, M({ map: TX.canalPetit('#b8402a') })); gal.rotation.z = s * 0.25; G.add(at(gal, cx + s * 5.6, 3.85, 4.4)); }
      statueArene(G, 4.6, 10.4); statueArene(G, 13.4, 10.4); return G; },
    /** H. Pavillon à tour-horloge : le pavillon et, à son côté, un beffroi de briques à horloge coiffé d'un petit pavillon de feu */
    H: () => { const G = new THREE.Group(); socleTemple(G, 6, 4.6, 12, 9.4, 1.05, '#c8b0a0'); pavillonPierre(G, { cx: 6, cz: 4.5 });
      const x = 13.4, z = 6.5, BR = M({ map: TX.brique('#9a4a32') });
      G.add(at(boite(2.6, 11, 2.6, BR), x, 5.5, z)); for (const y of [3.5, 7.5, 11]) G.add(at(boite(2.8, 0.25, 2.8, M({ map: TX.pierre('#e2d8c8') })), x, y, z));
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), COL('#f8f4e8')), x, 9.2, z + 1.31)); G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 6, 24), OR), x, 9.2, z + 1.33));
      G.add(at(boite(0.06, 0.6, 0.02, COL('#2a2a30')), x, 9.4, z + 1.34)); G.add(at(boite(0.45, 0.06, 0.02, COL('#2a2a30')), x + 0.2, 9.2, z + 1.34));
      for (let i = 0; i < 4; i++) G.add(at(cyl(0.12, 0.12, 1.6, COL('#c8322a'), 8), x + (i % 2 ? 1 : -1) * 1.0, 12.0, z + (i < 2 ? 1 : -1) * 1.0));
      toitChinois(G, x, z, 12.8, 1.8, 1.8, 1.5, { col: '#b8402a', rive: '#5a4a40', bord: '#e8c060', xt: 0.2, zt: 0.2, lift: 0.4, uvk: 0.5 });
      brasero(G, x, 11.1, z, 0.8); flamme(G, x, 14.3, z, 1.4);
      statueArene(G, 2.2, 10.4); panneauArene(G, 9.6, 11.0); return G; },
    /** I. Pavillon et pagode : une tour de trois étages s'élève au-dessus de la salle (comme une tour de maîtrise) */
    I: () => { const G = new THREE.Group(); socleTemple(G, 6, 4.6, 12, 9.4, 1.05, '#c8b0a0'); pavillonPierre(G, { cx: 6, cz: 4.5, etages: 2 });
      statueArene(G, 2.2, 10.4); statueArene(G, 9.8, 10.4); return G; },
    /** J. Île de lave : le pavillon sur une île carrée entourée d'un fossé de lave, pont en dos d'âne laqué, lanternes */
    J: () => { const G = new THREE.Group(), cx = 8, cz = 7;
      G.add(at(boite(16, 0.05, 15, LAVE), cx, 0.02, cz)); G.add(at(boite(13, 1.2, 11.5, M({ map: TX.pierre('#5a4e4a') })), cx, 0.6, cz - 0.8));
      { const S2 = new THREE.Group(); S2.position.y = 1.2; socleTemple(S2, cx, cz - 1.5, 11, 8.6, 0.6, '#c0a890', 3.4, true); G.add(S2); }
      pavillonPierre(G, { cx, cz: cz - 1.6, y0: 1.8, px: 4.6, pz: 3.4, sx: 3.8, sz: 2.6, hcol: 3.8 });
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([cx, 1.2 + Math.sin(t * Math.PI) * 0.9, cz + 4.95 + t * 2.6]); }
      for (let i = 0; i < 12; i++) { const [x, y, z] = pts[i], [, y2, z2] = pts[i + 1]; const p = boite(2.0, 0.14, Math.hypot(z2 - z, y2 - y) + 0.02, M({ map: TX.planches('#8a3a2a') })); p.rotation.x = -Math.atan2(y2 - y, z2 - z); G.add(at(p, x, (y + y2) / 2, (z + z2) / 2)); if (i % 2 === 0) for (const s of [-1, 1]) G.add(at(boite(0.08, 0.6, 0.08, COL('#c8322a')), x + s * 0.95, y + 0.3, z)); }
      for (const s of [-1, 1]) { G.add(at(cyl(0.08, 0.12, 1.2, COL('#2a2a30'), 6), cx + s * 1.4, 0.6, cz + 8.0)); G.add(at(boite(0.4, 0.5, 0.4, LUM('#ffe0a0', '#a06020')), cx + s * 1.4, 1.4, cz + 8.0)); }
      return G; },
    /** K. Avenue des portiques : trois portiques laqués couronnés de braseros mènent au pavillon */
    K: () => { const G = new THREE.Group(); socleTemple(G, 6, 4.6, 12, 9.4, 1.05, '#c8b0a0'); pavillonPierre(G, { cx: 6, cz: 4.5 });
      for (let k = 0; k < 3; k++) { const z = 11.6 + k * 2.4, V = COL('#d8402a'), N = COL('#2a2222');
        for (const s of [-1, 1]) G.add(at(cyl(0.18, 0.22, 3.6, V, 10), 6 + s * 1.9, 1.8, z));
        G.add(at(boite(5.0, 0.3, 0.4, N), 6, 3.7, z)); G.add(at(boite(4.2, 0.22, 0.3, V), 6, 3.1, z));
        for (const s of [-1, 1]) brasero(G, 6 + s * 2.2, 3.85, z, 0.5); }
      G.add(at(boite(3.2, 0.06, 7.2, M({ map: TX.pierre('#d8ccb8') })), 6, 0.03, 14.0));
      return G; },
    /** L. Pavillon d'obsidienne : pierre noire, toits rouges bordés d'or, rigoles de lave dans le socle */
    L: () => { const G = new THREE.Group(), BA = M({ map: TX.pierre('#2e2a2c') });
      G.add(at(boite(12, 1.05, 9.4, BA), 6, 0.52, 4.6)); for (const z of [1.0, 8.2]) G.add(at(boite(11.6, 0.06, 0.2, LAVE), 6, 1.06, z)); for (const x of [0.6, 11.4]) G.add(at(boite(0.2, 0.06, 7.4, LAVE), x, 1.06, 4.6));
      for (let k = 0; k < 5; k++) G.add(at(boite(4.4 + k * 0.25, 0.21 * (5 - k), 0.32, M({ map: TX.pierre('#3e3a3c') })), 6, 0.105 * (5 - k), 9.2 + k * 0.32));
      pavillonPierre(G, { cx: 6, cz: 4.5, sombre: true, toit: '#c0302a', bord: '#f0c040', rive: '#1a1416' });
      for (const s of [-1, 1]) brasero(G, 6 + s * 3.4, 0, 10.6, 0.8, 1.0); return G; },
    /** M. Fronton et pavillon : avancée à fronton grec devant la salle, toits de pavillon derrière — le mélange des deux */
    M: () => { const G = new THREE.Group(), PB = M({ map: TX.pierre('#ece2d0') }); socleTemple(G, 6, 5.2, 12, 10.6, 1.05, '#c8b0a0');
      pavillonPierre(G, { cx: 6, cz: 4.0, bannieres: false });
      for (let i = 0; i < 6; i++) colonne(G, 3.0 + i * 1.2, 9.5, 1.05, 4.2, 0.26, M({ map: TX.marbre() }), PB);
      G.add(at(boite(7.6, 0.5, 2.6, PB), 6, 5.5, 8.6)); G.add(at(boite(7.62, 0.18, 2.62, COL(FEU)), 6, 5.32, 8.6));
      fronton(G, 6, 5.75, 9.9, 7.6, 1.5, 2.6, PB); medaillon(G, 6, 6.3, 9.92, 0.4);
      for (const x of [2.2, 9.8]) flamme(G, x, 5.75, 9.6, 1.4); flamme(G, 6, 7.25, 9.6, 1.6);
      statueArene(G, 1.6, 11.4); statueArene(G, 10.4, 11.4); return G; },
    /** N. Verre et pierre : la salle devient une lanterne de verre où brûle le feu, sous les mêmes toits de pavillon */
    N: () => { const G = new THREE.Group(); socleTemple(G, 6, 4.6, 12, 9.4, 1.05, '#d0c4b4'); pavillonPierre(G, { cx: 6, cz: 4.5, verre: true, toit: '#8a3a2a', pierre: '#d0c4b4' });
      panneauArene(G, 10.2, 11.0); brasero(G, 3.4, 0, 10.6, 0.6, 0.8); brasero(G, 8.6, 0, 10.6, 0.6, 0.8); return G; },
  };
  B.pavillonFeu = ({ v = 'A' } = {}) => (PAVILLONS[v] || PAVILLONS.A)();
  B.pavillonFeu.variantes = { A: 'Classique gardé', B: 'Sources chaudes', C: 'Cour intérieure', D: 'Temple du Ciel', E: 'Terrasses de lave', F: 'Pavillon-stade', G: 'Palais à ailes',
    H: 'Tour-horloge', I: 'Pavillon et pagode', J: 'Île de lave', K: 'Avenue des portiques', L: 'Obsidienne', M: 'Fronton et pavillon', N: 'Verre et pierre' };

  /* ============================================================== arène à cour intérieure et grand dôme ============== */
  /** une face d'arcades (plan texturé d'arches, une arche par unité de large, sur toute la hauteur) */
  function faceArcades(G, x, y, z, w, h, ry, col) {
    const t = TX.arcades(col).clone(); t.repeat.set(Math.max(1, Math.round(w / 1.2)), 1); t.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M({ map: t })); p.rotation.y = ry; p.receiveShadow = true; G.add(at(p, x, y, z)); return p;
  }
  /** dôme à la manière de Saint-Pierre de Rome : haut tambour rythmé de contreforts à colonnes jumelées et de fenêtres à
   *  frontons, attique, coupole ovoïde à seize côtes de pierre et trois rangs de lucarnes, lanternon à colonnettes */
  function domeSaintPierre(G, cx, cz, y, rd, toit, pierre, acc, type) {
    const PB = M({ map: TX.pierre(mix(pierre, 0.3)) }), PM = M({ map: TX.pierre(pierre) }), N = 16;
    const ht = 1.9;
    G.add(at(cyl(rd + 0.25, rd + 0.35, 0.35, PB, 48), cx, y + 0.17, cz));                   // socle du tambour
    G.add(at(cyl(rd, rd, ht, PM, 48), cx, y + 0.35 + ht / 2, cz));
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), g2 = new THREE.Group();
      g2.position.set(cx + ca * (rd + 0.12), y + 0.35, cz + sa * (rd + 0.12)); g2.rotation.y = -a + Math.PI / 2;
      g2.add(at(boite(0.5, ht, 0.25, PB), 0, ht / 2, 0));                                    // contrefort
      for (const s of [-1, 1]) g2.add(at(cyl(0.07, 0.08, ht - 0.2, PB, 8), s * 0.17, ht / 2, 0.17));   // colonnes jumelées
      G.add(g2);
      const b = (i + 1) / N * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b), f = new THREE.Group();
      f.position.set(cx + cb * (rd + 0.02), y + 0.35, cz + sb * (rd + 0.02)); f.rotation.y = -b + Math.PI / 2;
      f.add(at(boite(0.42, 0.85, 0.04, COL('#2a2228')), 0, ht * 0.5, 0));
      if (i % 2) { const p = extr([[-0.3, 0], [0.3, 0], [0, 0.22]], 0.08, PB); f.add(at(p, 0, ht * 0.5 + 0.5, -0.02)); }
      else { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10, 1, false, -Math.PI / 2, Math.PI), PB); p.rotation.x = Math.PI / 2; f.add(at(p, 0, ht * 0.5 + 0.5, 0.02)); }
      G.add(f);
    }
    const ya = y + 0.35 + ht;
    G.add(at(cyl(rd + 0.3, rd + 0.3, 0.22, PB, 48), cx, ya + 0.11, cz));                      // corniche
    G.add(at(cyl(rd - 0.05, rd - 0.05, 0.55, PM, 48), cx, ya + 0.5, cz));                     // attique
    G.add(at(cyl(rd + 0.02, rd + 0.02, 0.12, COL(acc), 48), cx, ya + 0.75, cz));
    // coupole ovoïde
    const yc = ya + 0.8, hd = rd * 1.3, prof = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12, ang = t * Math.PI / 2; prof.push([rd * 0.98 * Math.cos(ang) ** 0.85, hd * Math.sin(ang)]); }
    prof.push([0, hd]);
    G.add(at(lathe(prof, M({ map: TX.canal(toit) }), 48), cx, yc, cz));
    for (let i = 0; i < N; i++) {                                                           // côtes de pierre
      const a = i / N * Math.PI * 2, g2 = new THREE.Group(); g2.position.set(cx, yc, cz); g2.rotation.y = -a;
      for (let k = 0; k < 12; k++) { const [r0, h0] = prof[k], [r1, h1] = prof[k + 1], L = Math.hypot(r1 - r0, h1 - h0) + 0.02, c = boite(0.16, L, 0.12, PB); c.rotation.z = Math.atan2(r0 - r1, h1 - h0); g2.add(at(c, (r0 + r1) / 2 + 0.03, (h0 + h1) / 2, 0)); }
      G.add(g2);
      for (const [kk, sz] of [[2, 0.26], [5, 0.2], [8, 0.15]]) {                              // lucarnes entre les côtes
        const b = (i + 0.5) / N * Math.PI * 2, [r, h] = prof[kk], l = new THREE.Group(); l.position.set(cx + Math.cos(b) * (r + 0.02), yc + h, cz + Math.sin(b) * (r + 0.02)); l.rotation.y = -b + Math.PI / 2;
        l.add(at(boite(sz * 1.2, sz * 1.3, sz, PB), 0, 0, 0)); l.add(at(boite(sz * 0.6, sz * 0.7, 0.02, COL('#2a2228')), 0, -0.02, sz / 2 + 0.01));
        l.add(at(new THREE.Mesh(new THREE.ConeGeometry(sz * 0.8, sz * 0.5, 4), M({ map: TX.canal(toit) })), 0, sz * 0.85, 0).rotateY(Math.PI / 4));
        G.add(l);
      }
    }
    // lanternon : anneau, colonnettes, petite coupole, boule, ornement du type
    const yl = yc + hd - 0.05;
    G.add(at(cyl(0.75, 0.75, 0.2, PB, 16), cx, yl + 0.1, cz));
    G.add(at(cyl(0.48, 0.48, 1.1, COL('#2a2228'), 16), cx, yl + 0.75, cz));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; G.add(at(cyl(0.06, 0.07, 1.1, PB, 6), cx + Math.cos(a) * 0.62, yl + 0.75, cz + Math.sin(a) * 0.62)); }
    G.add(at(cyl(0.72, 0.72, 0.16, PB, 16), cx, yl + 1.35, cz));
    G.add(at(lathe([[0.62, 0], [0.55, 0.3], [0.3, 0.6], [0.08, 0.72], [0, 0.72]], M({ map: TX.canal(toit) }), 16), cx, yl + 1.43, cz));
    G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), OR), cx, yl + 2.25, cz));
    const o = new THREE.Group(); o.scale.setScalar(0.65); G.add(o); sommetType(o, type, cx / 0.65, (yl + 2.4) / 0.65, cz / 0.65, acc);
    return yl + 2.4;
  }
  /** petite coupole latérale (comme les deux coupoles mineures de Saint-Pierre) */
  function coupoleMineure(G, cx, cz, y, r, toit, pierre) {
    const PB = M({ map: TX.pierre(mix(pierre, 0.3)) });
    G.add(at(cyl(r, r, 0.9, M({ map: TX.pierre(pierre) }), 20), cx, y + 0.45, cz));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; G.add(at(cyl(0.05, 0.06, 0.85, PB, 6), cx + Math.cos(a) * (r + 0.05), y + 0.45, cz + Math.sin(a) * (r + 0.05))); G.add(at(boite(0.14, 0.4, 0.03, COL('#2a2228')), cx + Math.cos(a + 0.4) * (r + 0.01), y + 0.5, cz + Math.sin(a + 0.4) * (r + 0.01)).rotateY(-a - 0.4 + Math.PI / 2)); }
    G.add(at(cyl(r + 0.12, r + 0.12, 0.12, PB, 20), cx, y + 0.95, cz));
    G.add(at(lathe([[r, 0], [r * 0.9, r * 0.6], [r * 0.6, r * 1.05], [0.2, r * 1.3], [0, r * 1.32]], M({ map: TX.canal(toit) }), 20), cx, y + 1.0, cz));
    G.add(at(cyl(0.18, 0.2, 0.4, PB, 8), cx, y + 1.0 + r * 1.32 + 0.15, cz)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), OR), cx, y + 1.0 + r * 1.32 + 0.45, cz));
  }
  /** arène à cour intérieure (18 × 16) : un palais de pierre bâti autour d'une cour à cloître (colonnade à arcs et galerie
   *  couverte), ornement du type au milieu de la cour ; aile d'entrée basse à arcades pour que la cour se voie ; grande
   *  salle au fond surmontée d'un second étage deux fois plus étroit ceint d'arcades, puis d'un grand dôme à la manière de
   *  Saint-Pierre de Rome flanqué de deux coupoles mineures ; terrasses à balustrades, frise de la couleur du type ;
   *  portail de 2 cases gardé par deux statues */
  B.areneCour = ({ type = 'feu', ...autres } = {}) => {
    const T = { ...(ARENES[type] || ARENES.feu), ...autres }, acc = T.acc, A = COL(acc);
    const G = new THREE.Group(), W = 18, cx = 9, ZF = 14;           // façade à z = 14
    const PM = M({ map: TX.pierre(T.pierre) }), PB = M({ map: TX.pierre(mix(T.pierre, 0.35)) }), PS = M({ map: TX.pierre(mix(T.pierre, -0.15)) }), MA = M({ map: TX.marbre() });
    const y0 = 0.5, H1 = 4.8, H0 = 3.0, DB = 6, LW = 3.2, zc0 = DB, zc1 = ZF - 2.6;      // aile du fond 0 → 6, cour 6 → 11,4
    G.add(at(boite(W + 0.4, y0, ZF + 0.4, PS), cx, y0 / 2, ZF / 2));
    G.add(at(boite(W - 2 * LW, 0.05, zc1 - zc0, M({ map: TX.pierre(mix(T.pierre, 0.2)) })), cx, y0 + 0.02, (zc0 + zc1) / 2));
    G.add(at(boite(W, H1, DB, PM), cx, y0 + H1 / 2, DB / 2));
    for (const x of [LW / 2, W - LW / 2]) G.add(at(boite(LW, H1, zc1 - zc0, PM), x, y0 + H1 / 2, (zc0 + zc1) / 2));
    G.add(at(boite(W, H0, 2.6, PM), cx, y0 + H0 / 2, zc1 + 1.3));
    const corniche = (x, z, w, d, y) => { G.add(at(boite(w + 0.1, 0.32, d + 0.1, A), x, y - 0.3, z)); G.add(at(boite(w + 0.3, 0.18, d + 0.3, PB), x, y + 0.02, z)); };
    corniche(cx, DB / 2, W, DB, y0 + H1); for (const x of [LW / 2, W - LW / 2]) corniche(x, (zc0 + zc1) / 2, LW, zc1 - zc0, y0 + H1); corniche(cx, zc1 + 1.3, W, 2.6, y0 + H0);
    const yt = y0 + H1 + 0.1;
    balustrade(G, 0.1, 0.1, W - 0.1, 0.1, yt, PB, 0.45, 0.3); balustrade(G, 0.1, 0.1, 0.1, zc1 - 0.1, yt, PB, 0.45, 0.3); balustrade(G, W - 0.1, 0.1, W - 0.1, zc1 - 0.1, yt, PB, 0.45, 0.3);
    balustrade(G, 0.1, zc1 - 0.1, LW, zc1 - 0.1, yt, PB, 0.45, 0.3); balustrade(G, W - LW, zc1 - 0.1, W - 0.1, zc1 - 0.1, yt, PB, 0.45, 0.3);
    balustrade(G, 0.1, ZF - 0.1, W - 0.1, ZF - 0.1, y0 + H0 + 0.1, PB, 0.4, 0.3);
    for (const [x, z] of [[0.1, 0.1], [W - 0.1, 0.1], [0.1, zc1 - 0.1], [W - 0.1, zc1 - 0.1]]) { G.add(at(boite(0.4, 0.7, 0.4, PB), x, yt + 0.35, z)); G.add(at(cyl(0.12, 0.2, 0.3, OR, 8), x, yt + 0.85, z)); }
    // façade : arcades, fenêtres hautes des ailes
    faceArcades(G, cx - 5.6, y0 + H0 / 2 - 0.15, ZF + 0.01, 6.4, H0 - 0.3, 0, T.pierre);
    faceArcades(G, cx + 5.6, y0 + H0 / 2 - 0.15, ZF + 0.01, 6.4, H0 - 0.3, 0, T.pierre);
    for (const x of [LW / 2, W - LW / 2]) for (const dx of [-0.8, 0, 0.8]) fenArc(G, x + dx, y0 + H0 + 0.8, zc1, 0.45, 0.9, PB, M({ map: TX.vitrail(acc) }));
    // portail
    G.add(at(boite(4.4, H0 + 1.0, 0.6, PB), cx, y0 + (H0 + 1.0) / 2, ZF + 0.1));
    G.add(at(boite(2.0, 2.3, 0.05, M({ map: TX.bois('#5a3020') })), cx, y0 + 1.15, ZF + 0.42));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(1.0, 18, 0, Math.PI), M({ map: TX.vitrail(acc) })), cx, y0 + 2.3, ZF + 0.42));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.12, 6, 18, Math.PI), OR), cx, y0 + 2.3, ZF + 0.45));
    for (const s of [-1, 1]) { G.add(at(boite(0.16, 2.3, 0.12, OR), cx + s * 1.08, y0 + 1.15, ZF + 0.45)); colonne(G, cx + s * 1.85, ZF + 0.55, y0, H0 + 0.6, 0.18, MA, PB); }
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), M({ map: emblemeTex(type, acc) })), cx, y0 + H0 + 0.2, ZF + 0.42)); G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 6, 20), OR), cx, y0 + H0 + 0.2, ZF + 0.44));
    fronton(G, cx, y0 + H0 + 1.0, ZF + 0.4, 4.8, 1.0, 0.6, PB);
    for (const s of [-1, 1]) { G.add(at(boite(0.7, 2.0, 0.03, A), cx + s * 3.0, y0 + 1.7, ZF + 0.03)); G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.22, 14), M({ map: emblemeTex(type, acc) })), cx + s * 3.0, y0 + 2.2, ZF + 0.06)); }
    marches(G, cx, ZF + 0.4, 4.6, 3, y0 / 3, 0.3, PB);
    // cloître
    const cx0 = LW + 0.8, cx1 = W - LW - 0.8, cz0 = zc0 + 0.8, cz1 = zc1 - 0.7, hc = 2.8, nf = 7, pz2 = (cz1 - cz0) / 2, cols = [];
    for (let i = 0; i <= nf; i++) cols.push([cx0 + i * (cx1 - cx0) / nf, cz0]);
    for (let i = 1; i <= 2; i++) { const z = cz0 + i * pz2; cols.push([cx0, z], [cx1, z]); }
    for (let i = 1; i < nf; i++) cols.push([cx0 + i * (cx1 - cx0) / nf, cz1]);
    for (const [x, z] of cols) { colonne(G, x, z, y0, hc, 0.17, MA, PB); G.add(at(cyl(0.21, 0.21, 0.05, OR, 10), x, y0 + hc - 0.22, z)); }
    const arc = (x1, z1, x2, z2) => { const L = Math.hypot(x2 - x1, z2 - z1), a = new THREE.Mesh(new THREE.TorusGeometry(L / 2, 0.08, 4, 12, Math.PI), PB); a.rotation.y = -Math.atan2(z2 - z1, x2 - x1); G.add(at(a, (x1 + x2) / 2, y0 + hc - 0.05, (z1 + z2) / 2)); };
    const xi = (i) => cx0 + i * (cx1 - cx0) / nf;
    for (let i = 0; i < nf; i++) arc(xi(i), cz0, xi(i + 1), cz0);
    for (let i = 0; i < 2; i++) { arc(cx0, cz0 + i * pz2, cx0, cz0 + (i + 1) * pz2); arc(cx1, cz0 + i * pz2, cx1, cz0 + (i + 1) * pz2); }
    for (let i = 0; i < nf; i++) { if (i === 3) continue; arc(xi(i), cz1, xi(i + 1), cz1); }
    const yg = y0 + hc + 0.55, TG = M({ map: TX.canalPetit(T.toit) });
    G.add(at(boite(cx1 - cx0 + 0.4, 0.2, 0.3, PB), cx, yg - 0.15, cz0)); G.add(at(boite(0.3, 0.2, cz1 - cz0, PB), cx0, yg - 0.15, (cz0 + cz1) / 2)); G.add(at(boite(0.3, 0.2, cz1 - cz0, PB), cx1, yg - 0.15, (cz0 + cz1) / 2));
    { const p = boite(cx1 - cx0 + 1.4, 0.08, 0.95, TG); p.rotation.x = -0.35; G.add(at(p, cx, yg + 0.12, cz0 - 0.4)); }
    for (const s of [-1, 1]) { const p = boite(0.95, 0.08, cz1 - cz0 + 0.4, TG); p.rotation.z = s * 0.35; G.add(at(p, (s < 0 ? cx0 : cx1) + s * 0.4, yg + 0.12, (cz0 + cz1) / 2 + 0.1)); }
    { const p = boite(cx1 - cx0 + 1.4, 0.08, 0.7, TG); p.rotation.x = 0.35; G.add(at(p, cx, yg + 0.05, cz1 + 0.35)); }
    // centre de la cour
    const zm = (zc0 + zc1) / 2;
    G.add(at(cyl(1.3, 1.4, 0.45, PB, 8), cx, y0 + 0.22, zm)); G.add(at(cyl(1.1, 1.1, 0.04, type === 'eau' || type === 'glace' ? M({ map: TX.eau() }) : LUM('#ff7a20', '#ff4a00'), 8), cx, y0 + 0.46, zm));
    G.add(at(cyl(0.3, 0.4, 0.9, PB, 8), cx, y0 + 0.9, zm));
    { const o = new THREE.Group(); o.scale.setScalar(1.1); G.add(o); sommetType(o, type, cx / 1.1, (y0 + 1.35) / 1.1, zm / 1.1, acc); }
    // second étage, deux fois plus étroit (9 × 6) : arcades
    const y2 = y0 + H1 + 0.1, H2 = 3.2, W2 = 9, x2a = cx - W2 / 2, x2b = cx + W2 / 2;
    G.add(at(boite(W2, H2, DB, PM), cx, y2 + H2 / 2, DB / 2));
    faceArcades(G, cx, y2 + H2 / 2 - 0.1, DB + 0.01, W2, H2 - 0.4, 0, T.pierre);
    faceArcades(G, x2a - 0.01, y2 + H2 / 2 - 0.1, DB / 2, DB, H2 - 0.4, -Math.PI / 2, T.pierre);
    faceArcades(G, x2b + 0.01, y2 + H2 / 2 - 0.1, DB / 2, DB, H2 - 0.4, Math.PI / 2, T.pierre);
    for (const [x, z] of [[x2a, 0], [x2b, 0], [x2a, DB], [x2b, DB]]) G.add(at(boite(0.5, H2, 0.5, PB), x, y2 + H2 / 2, z));
    corniche(cx, DB / 2, W2, DB, y2 + H2);
    balustrade(G, x2a, DB + 0.05, x2b, DB + 0.05, y2 + H2 + 0.1, PB, 0.35, 0.3);
    // grand dôme à la Saint-Pierre et deux coupoles mineures sur la terrasse
    domeSaintPierre(G, cx, DB / 2, y2 + H2 + 0.12, 2.75, T.toit, T.pierre, acc, type);
    for (const s of [-1, 1]) coupoleMineure(G, cx + s * 6.6, 1.8, yt, 0.9, T.toit, T.pierre);
    statueArene(G, cx - 4.4, ZF + 1.3, 0.95, acc); statueArene(G, cx + 4.4, ZF + 1.3, 0.95, acc);
    return G;
  };

  /* -------------------------------------------------------------- usine à Poké Balls ----------------------------- */
  /** une Poké Ball : moitié haute rouge, basse blanche, bande noire, bouton tourné vers le sud */
  function pokeBall(G, x, y, z, r, rouge = '#d83a32') {
    const h1 = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), COL(rouge));
    const h2 = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), COL('#f4f4f6'));
    for (const m of [h1, h2]) { m.castShadow = true; G.add(at(m, x, y, z)); }
    const b = new THREE.Mesh(new THREE.TorusGeometry(r * 1.005, r * 0.07, 6, 32), COL('#1e1e24')); b.rotation.x = Math.PI / 2; G.add(at(b, x, y, z));
    const bt = cyl(r * 0.3, r * 0.3, r * 0.12, COL('#1e1e24'), 18); bt.rotation.x = Math.PI / 2; G.add(at(bt, x, y, z + r * 0.97));
    const bb = cyl(r * 0.2, r * 0.2, r * 0.14, COL('#f4f4f6'), 18); bb.rotation.x = Math.PI / 2; G.add(at(bb, x, y, z + r * 1.0));
  }
  /** usine à Poké Balls (16 × 10, porte de 2 cases) : rotonde centrale coiffée d'une demi-sphère rouge à bande noire —
   *  une Poké Ball géante posée sur l'usine —, l'entrée est son bouton : un grand disque blanc cerclé de noir autour des
   *  portes ; deux ailes de production à toits en sheds rouges, cheminées rayées, cuves sphériques peintes en Poké Ball,
   *  passerelles et conduites, enseigne, drapeaux */
  B.usinePokeball = ({ rouge = '#d83a32' } = {}) => {
    const G = new THREE.Group(), W = 32, cx = 16, cz = 5, BL = M({ map: TX.panneaux('#f2f2f4') }), R = COL(rouge), N = COL('#1e1e24'), AC = COL('#9aa0aa');
    G.add(at(boite(W + 0.4, 0.4, 10.4, M({ map: TX.beton('#b8b8b4') })), cx, 0.2, cz));
    // ailes de production
    for (const [x0, x1] of [[0, cx - 3.4], [cx + 3.4, W]]) {
      const xc = (x0 + x1) / 2, w = x1 - x0;
      G.add(at(boite(w, 4.2, 8.6, BL), xc, 2.5, 4.5));
      G.add(at(boite(w + 0.04, 0.5, 8.64, R), xc, 3.0, 4.5)); G.add(at(boite(w + 0.04, 0.12, 8.64, N), xc, 2.7, 4.5));
      for (let i = 0; i < 4; i++) { const sh = extr([[0, 0], [0, 1.1], [2.15, 0]], w, M({ map: TX.tole(rouge) })); sh.rotation.y = Math.PI / 2; sh.position.set(x0, 4.6, 0.3 + (i + 1) * 2.15); G.add(sh); G.add(at(boite(w - 0.2, 0.9, 0.04, LUM('#cfe8ff', '#203040')), xc, 5.1, 0.32 + i * 2.15)); }
      const nf = Math.max(3, Math.round(w / 1.6)); for (let k = 0; k < nf; k++) G.add(at(boite(0.9, 1.1, 0.04, M({ map: TX.verre() })), x0 + 0.8 + k * (w - 1.6) / (nf - 1), 1.5, 8.82));
      G.add(at(boite(w - 0.6, 0.3, 0.06, N), xc, 4.0, 8.84));
    }
    // rotonde : tambour blanc, bande noire, demi-sphère rouge, lanternon-bouton
    const rr = 4.6;
    G.add(at(cyl(rr, rr, 4.4, BL, 40), cx, 2.6, cz));
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.5) continue; G.add(at(boite(0.4, 1.4, 0.05, M({ map: TX.verre() })), cx + Math.cos(a) * (rr + 0.01), 2.6, cz + Math.sin(a) * (rr + 0.01)).rotateY(-a + Math.PI / 2)); }
    G.add(at(cyl(rr + 0.08, rr + 0.08, 0.6, N, 40), cx, 5.05, cz));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(rr, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), R); dome.scale.y = 0.85; dome.castShadow = true; G.add(at(dome, cx, 5.35, cz));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, nv = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.05, 4, 16, Math.PI / 2), COL('#b02a24')); nv.scale.set(1, 0.85, 1); nv.rotation.y = -a; G.add(at(nv, cx, 5.35, cz)); }
    G.add(at(cyl(0.9, 0.9, 0.5, N, 20), cx, 9.3, cz)); G.add(at(cyl(0.6, 0.6, 0.55, COL('#f4f4f6'), 20), cx, 9.4, cz));
    G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), LUM('#fff8e0', '#a0a080')), cx, 9.8, cz));
    // entrée : avant-corps blanc à bandeau rouge et noir, grandes portes vitrées
    const zf = cz + rr;
    G.add(at(boite(5.2, 5.0, 0.8, BL), cx, 2.7, zf - 0.2));
    G.add(at(boite(5.24, 0.8, 0.84, R), cx, 4.4, zf - 0.2)); G.add(at(boite(5.24, 0.16, 0.86, N), cx, 3.95, zf - 0.2));
    portesVitrees(G, cx, zf + 0.2, 1.8, 2.4, N);
    G.add(at(boite(2.4, 0.16, 0.9, R), cx, 2.55, zf + 0.6));
    // cuves Poké Ball, cheminées rayées, conduites
    for (const s of [-1, 1]) {
      for (const x of [cx + s * 7.5, cx + s * 12.5]) {
      G.add(at(cyl(0.12, 0.12, 1.6, AC, 6), x - 0.5, 5.4, 1.6)); G.add(at(cyl(0.12, 0.12, 1.6, AC, 6), x + 0.5, 5.4, 1.6));
      pokeBall(G, x, 7.3, 1.6, 1.15, rouge); }
      const xc = cx + s * 10; const ch = cyl(0.45, 0.55, 5.5, BL, 14); G.add(at(ch, xc, 7.6, 1.0));
      for (const y of [6.0, 7.4, 8.8, 10.2]) G.add(at(cyl(0.48, 0.48, 0.45, R, 14), xc, y, 1.0));
      G.add(at(cyl(0.5, 0.5, 0.2, N, 14), xc, 10.4, 1.0));
      for (let i = 0; i < 3; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.4 + i * 0.12, 8, 6), M({ color: new THREE.Color('#e8e8ec'), transparent: true, opacity: 0.6 })), xc + s * i * 0.3, 10.9 + i * 0.5, 1.0 - i * 0.2));
      const p = cyl(0.18, 0.18, 2.4, AC, 8); p.rotation.z = Math.PI / 2; G.add(at(p, cx + s * 5.0, 4.6, 3.0)); const p2 = cyl(0.18, 0.18, 6, AC, 8); p2.rotation.z = Math.PI / 2; G.add(at(p2, cx + s * 10, 5.2, 7.0));
      // enseignes Poké Ball sur les ailes
      const e = cyl(0.8, 0.8, 0.1, COL('#f4f4f6'), 24); e.rotation.x = Math.PI / 2; G.add(at(e, (cx + s * 9.5), 3.7, 8.86));
      const eh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24, 0, Math.PI), R); G.add(at(eh, (cx + s * 9.5), 3.7, 8.92));
      G.add(at(boite(1.6, 0.14, 0.02, N), (cx + s * 9.5), 3.7, 8.93)); G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), N), (cx + s * 9.5), 3.7, 8.94)); G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), COL('#f4f4f6')), (cx + s * 9.5), 3.7, 8.95));
      // drapeaux
      for (const dx of [3.0, 6.0, 13.0]) { G.add(at(cyl(0.04, 0.05, 3.2, AC, 6), cx + s * dx, 1.6, 9.6)); G.add(at(boite(0.9, 0.55, 0.02, R), cx + s * dx + s * 0.46, 2.9, 9.6)); G.add(at(boite(0.9, 0.12, 0.03, N), cx + s * dx + s * 0.46, 2.62, 9.6)); }
    }
    return G;
  };

  /* -------------------------------------------------------------- ville : tours, bourse, casino ---------------------- */
  /** texture d'un étage de tour répétée verticalement (un étage = 1,1 unité) */
  const parEtage = (t) => { const c = t.clone(); c.repeat.set(1, 1 / 1.1); c.needsUpdate = true; return c; };
  TX.etageVerre = (col) => tex('ev' + col, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lx = x % (8 * S), cell = hash(Math.floor(x / (8 * S)), 0, 47);
      let c = y >= h - 5 * S ? mix(col, -0.35) : lx < S ? '#8a929e' : (x + 2 * y) % Math.round(26 * S) < 3 * S ? mix(col, 0.32) : y < 8 * S ? mix(col, 0.08) : col;
      if (y >= h - 5 * S && y < h - 4 * S) c = '#9aa2ae';
      px(x, y, c);
    }
  });
  TX.etageDeco = (col) => tex('ed' + col, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lx = x % (11 * S), fen = lx > 2 * S && lx < 9 * S && y > 6 * S && y < h - 6 * S;
      let c = fen ? (hash(Math.floor(x / (11 * S)), 1, 48) > 0.85 ? '#f0dca0' : y < 12 * S ? '#4a6488' : '#2e4060') : col;
      if (!fen && lx >= 5 * S && lx < 6 * S) c = mix(col, -0.12);
      px(x, y, c);
    }
  });
  /** grand soleil Art déco (demi-disque d'acier à rayons et fenêtres triangulaires) */
  TX.soleil = () => tex('soleil', 2 * D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2), dy = (h - y) / h, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) / Math.PI;
      let c = 'rgba(0,0,0,0)';
      if (r < 1) { const k = Math.floor(a * 12), f = (a * 12) % 1; c = (f < 0.12) ? '#8a8e98' : '#d8dce4'; if (r > 0.55 && r < 0.85 && Math.abs(f - 0.55) < 0.28 * (0.85 - r) / 0.3) c = '#f4e0a0'; if (r < 0.2) c = '#c8ccd4'; }
      if (c[0] === 'r') continue; px(x, y, c);
    }
  }, false);
  /** grande tour de verre (10 × 6, façon Montparnasse) : un parallélépipède sombre et net de 30 étages, étages
   *  techniques plus foncés, hall vitré sous une marquise, terrasse en haut et mât d'antenne */
  B.tourVerre = ({ etages = 30, col = '#2e3642' } = {}) => {
    const G = new THREE.Group(), w = 10, d = 6, cx = 5, H = 1.1 * etages, VE = M({ map: parEtage(TX.etageVerre(col)) });
    G.add(at(boite(w, 2.4, d, M({ map: TX.verre() })), cx, 1.2, d / 2));
    for (let i = 0; i <= 10; i++) G.add(at(boite(0.08, 2.4, 0.08, COL('#5a6270')), i, 1.2, d + 0.02));
    G.add(at(boite(w, H - 2.4, d, VE), cx, 2.4 + (H - 2.4) / 2, d / 2));
    for (const f of [2.2, 14, 26]) if (f * 1.1 < H) G.add(at(boite(w + 0.08, 1.1, d + 0.08, COL(mix(col, -0.35))), cx, f * 1.1 + 0.55, d / 2));
    for (const x of [0, w]) G.add(at(boite(0.14, H, 0.14, COL('#8a929e')), x, H / 2, d));
    G.add(at(boite(w + 0.1, 0.3, d + 0.1, COL('#4a525e')), cx, H + 0.15, d / 2));
    for (const [x, z, ww, dd] of [[cx, 0.05, w, 0.06], [cx, d - 0.05, w, 0.06], [0.05, d / 2, 0.06, d], [w - 0.05, d / 2, 0.06, d]]) G.add(at(boite(ww, 0.6, dd, M({ color: new THREE.Color('#bfe0f0'), transparent: true, opacity: 0.45 })), x, H + 0.6, z));
    G.add(at(boite(3.0, 1.2, 2.0, COL('#5a6270')), cx + 2.5, H + 0.9, 2.0));
    G.add(at(cyl(0.08, 0.14, 5.0, COL('#c8ccd4'), 8), cx - 2.5, H + 2.8, 2.0)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), LUM('#ff4040', '#c00000')), cx - 2.5, H + 5.35, 2.0));
    for (const y of [H + 1.6, H + 2.8, H + 4.0]) G.add(at(boite(0.8, 0.04, 0.04, COL('#c8ccd4')), cx - 2.5, y, 2.0));
    G.add(at(boite(4.0, 0.16, 1.4, COL('#3a424e')), cx, 2.5, d + 0.7));
    portesVitrees(G, cx, d, 1.8, 2.0, COL('#5a6270'));
    return G;
  };
  /** tour Art déco (8 × 8, façon Chrysler) : fût de pierre claire à fenêtres en bandes, retraits à aigles d'acier,
   *  couronne de cinq soleils d'acier en gradins à fenêtres triangulaires, aiguille ; hall à portail doré */
  B.tourDeco = ({ col = '#e6e0d4' } = {}) => {
    const G = new THREE.Group(), cx = 4, cz = 4, AC = M({ color: new THREE.Color('#d6dae2'), emissive: new THREE.Color('#1a1c20') });
    const ED = M({ map: parEtage(TX.etageDeco(col)) });
    let y = 0;
    const etage = (half, h, nom) => { G.add(at(boite(2 * half, h, 2 * half, ED), cx, y + h / 2, cz)); G.add(at(boite(2 * half + 0.12, 0.2, 2 * half + 0.12, COL(mix(col, -0.2))), cx, y + h, cz)); y += h + 0.2; };
    G.add(at(boite(8, 2.6, 8, M({ map: TX.pierre('#8a8478') })), cx, 1.3, cz)); y = 2.6;
    etage(4, 9.8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {      // aigles d'acier aux angles du premier retrait
      const e = new THREE.Group(); e.position.set(cx + sx * 3.75, y + 0.1, cz + sz * 3.75); e.rotation.y = Math.atan2(sx, sz);
      e.add(at(boite(0.3, 0.3, 1.2, AC), 0, 0, 0.5)); e.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), OR), 0, -0.05, 1.2).rotateX(Math.PI / 2));
      for (const s of [-1, 1]) { const ai = boite(0.7, 0.06, 0.4, AC); ai.rotation.z = s * 0.4; e.add(at(ai, s * 0.4, 0.15, 0.4)); }
      G.add(e);
    }
    etage(3.2, 11.8); etage(2.5, 5.4);
    // couronne
    for (let i = 0; i < 5; i++) {
      const s = 2.3 - i * 0.42, h = 1.05;
      G.add(at(boite(2 * s, h, 2 * s, AC), cx, y + h / 2, cz));
      for (const [rx, rz, ry] of [[0, s + 0.01, 0], [0, -s - 0.01, Math.PI], [s + 0.01, 0, Math.PI / 2], [-s - 0.01, 0, -Math.PI / 2]]) {
        const so = new THREE.Mesh(new THREE.PlaneGeometry(2 * s * 0.92, s * 0.92), new THREE.MeshToonMaterial({ gradientMap: paliers, map: TX.soleil(), transparent: true, alphaTest: 0.5, emissive: new THREE.Color('#202020') }));
        so.rotation.y = ry; G.add(at(so, cx + rx, y + h + s * 0.46, cz + rz));
      }
      y += h;
    }
    const aig = new THREE.Mesh(new THREE.ConeGeometry(0.4, 6.0, 8), AC); aig.castShadow = true; G.add(at(aig, cx, y + 3.0, cz));
    // hall et portail
    G.add(at(boite(2.6, 2.4, 0.06, COL('#2a2a30')), cx, 1.2, 8.02));
    for (let i = 0; i < 5; i++) G.add(at(boite(0.06, 2.4, 0.06, OR), cx - 1.3 + i * 0.65, 1.2, 8.06));
    const fr = new THREE.Shape(); fr.moveTo(-1.5, 0); fr.lineTo(1.5, 0); fr.lineTo(0.9, 0.9); fr.lineTo(-0.9, 0.9); fr.closePath();
    G.add(at(new THREE.Mesh(new THREE.ShapeGeometry(fr), OR), cx, 2.45, 8.04));
    for (const s of [-1, 1]) G.add(at(boite(1.6, 1.4, 0.03, M({ map: TX.verre() })), cx + s * 2.6, 1.0, 8.02));
    return G;
  };
  /** bourse (12 × 9, façon Wall Street) : soubassement, bloc de marbre, six colonnes géantes à chapiteaux, fronton
   *  peuplé de statues, grandes verrières entre les colonnes, balustrade d'attique, drapeau, perron */
  B.bourse = ({ acc = '#2a4a9c' } = {}) => {
    const G = new THREE.Group(), cx = 6, MA = M({ map: TX.marbre() }), PB = M({ map: TX.pierre('#ece8e0') });
    G.add(at(boite(12, 1.0, 7.6, PB), cx, 0.5, 3.8));
    G.add(at(boite(11, 6.6, 6, PB), cx, 1.0 + 3.3, 3));
    G.add(at(boite(11.3, 0.4, 6.3, MA), cx, 7.8, 3));
    for (const x of [0.8, 11.2]) { G.add(at(boite(0.5, 6.6, 0.2, MA), x, 4.3, 6.05)); for (const y of [2.6, 4.6]) fenetre2(G, x + (x < 6 ? 0.7 : -0.7), y, 6.0, 0.5, 1.0, { cadre: '#e8e4dc', rideau: '#e8e0d0' }); }
    // verrière derrière la colonnade
    G.add(at(boite(7.6, 5.0, 0.04, M({ map: TX.verre() })), cx, 3.7, 6.02));
    for (let i = 0; i <= 8; i++) G.add(at(boite(0.06, 5.0, 0.06, COL('#c8c4bc')), cx - 3.8 + i * 0.95, 3.7, 6.05));
    for (const y of [2.0, 3.6, 5.2]) G.add(at(boite(7.6, 0.06, 0.06, COL('#c8c4bc')), cx, y, 6.05));
    portesVitrees(G, cx, 6.02, 1.9, 1.9, COL('#8a8478'));
    G.add(at(boite(1.0, 4.0, 0.03, COL(acc)), cx - 2.85, 4.2, 6.08)); G.add(at(boite(1.0, 4.0, 0.03, COL(acc)), cx + 2.85, 4.2, 6.08));
    for (const x of [cx - 2.85, cx + 2.85]) G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), OR), x, 5.0, 6.1));
    // colonnade
    for (let i = 0; i < 6; i++) colonne(G, cx - 3.75 + i * 1.5, 6.95, 1.0, 5.6, 0.33, MA, PB);
    G.add(at(boite(9.4, 0.75, 2.1, PB), cx, 1.0 + 5.6 + 0.37, 6.9));
    G.add(at(boite(9.0, 0.18, 0.04, COL('#3a3a40')), cx, 1.0 + 5.6 + 0.35, 7.96));
    fronton(G, cx, 7.35, 7.95, 9.6, 1.7, 2.1, PB);
    // statues du fronton (en relief)
    const ST = M({ map: TX.pierre('#f4f2ec') });
    for (const [dx, hh] of [[0, 1.0], [-1.0, 0.75], [1.0, 0.75], [-2.0, 0.5], [2.0, 0.5], [-2.9, 0.3], [2.9, 0.3]]) {
      G.add(at(boite(0.32, hh, 0.25, ST), cx + dx, 7.45 + hh / 2, 7.98)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), ST), cx + dx, 7.5 + hh + 0.08, 7.98));
    }
    for (const x of [0.6, 11.4]) balustrade(G, x, 0.2, x, 5.8, 8.0, PB, 0.5, 0.35);
    balustrade(G, 0.6, 0.2, 11.4, 0.2, 8.0, PB, 0.5, 0.35);
    G.add(at(cyl(0.04, 0.05, 3.0, COL('#c8ccd4'), 6), cx, 9.5, 2.0));
    G.add(at(boite(1.4, 0.8, 0.03, COL(acc)), cx + 0.72, 10.5, 2.0)); G.add(at(boite(0.5, 0.3, 0.04, OR), cx + 0.72, 10.5, 2.0));
    for (let k = 0; k < 5; k++) G.add(at(boite(9.0 + k * 0.4, 0.2, 0.32, PB), cx, 0.1 + (4 - k) * 0.2, 7.75 + k * 0.3));
    for (const s of [-1, 1]) { G.add(at(boite(0.4, 1.2, 0.4, PB), cx + s * 5.2, 0.6, 8.4)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), LUM('#fff4c0', '#806020')), cx + s * 5.2, 1.4, 8.4)); }
    return G;
  };
  /** casino (14 × 10, façon Monte-Carlo) : pavillon central à grande baie dorée, horloge et statues, deux tours à
   *  lanternons en cuivre vert, toit à la Mansart à œils-de-bœuf, ailes basses à arcades et balustrades à vases,
   *  lampadaires, parterre rond et palmiers */
  B.casino = ({ pierre = '#ecdcbc', cuivre = '#5a9a88' } = {}) => {
    const G = new THREE.Group(), cx = 7, PM = M({ map: TX.pierre(pierre) }), PB = M({ map: TX.pierre(mix(pierre, 0.3)) }), CU = M({ map: TX.ardoise(cuivre) });
    G.add(at(boite(14, 0.4, 7.4, PB), cx, 0.2, 3.7));
    // ailes
    for (const [x0, x1] of [[0, 3.6], [10.4, 14]]) {
      const xc = (x0 + x1) / 2, w = x1 - x0;
      G.add(at(boite(w, 3.0, 5.6, PM), xc, 1.9, 3.5));
      G.add(at(boite(w + 0.1, 0.25, 5.7, PB), xc, 3.5, 3.5));
      for (let i = 0; i < 3; i++) fenArc(G, x0 + 0.65 + i * 1.15, 1.7, 6.3, 0.7, 1.5, PB);
      balustrade(G, x0 + 0.1, 6.25, x1 - 0.1, 6.25, 3.62, PB, 0.4, 0.22);
      for (const x of [x0 + 0.2, x1 - 0.2]) { G.add(at(boite(0.3, 0.5, 0.3, PB), x, 3.87, 6.25)); G.add(at(cyl(0.12, 0.18, 0.35, OR, 8), x, 4.3, 6.25)); }
    }
    // corps central
    G.add(at(boite(6.8, 4.6, 7.0, PM), cx, 2.7, 3.5));
    G.add(at(boite(7.0, 0.3, 7.2, PB), cx, 5.1, 3.5));
    G.add(at(boite(7.0, 0.14, 7.2, OR), cx, 4.85, 3.5));
    G.add(toit4(G, cx, 3.5, 5.25, 3.5, 3.6, 1.7, CU, 0.55));
    for (const x of [cx - 1.5, cx + 1.5]) { const oe = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), M({ map: TX.verre() })); G.add(at(oe, x, 5.9, 6.45)); G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 14), OR), x, 5.9, 6.47)); }
    // tours à lanternons
    for (const x of [cx - 2.8, cx + 2.8]) {
      G.add(at(boite(1.6, 6.4, 1.6, PM), x, 3.6, 6.3));
      for (const y of [4.9, 6.85]) G.add(at(boite(1.75, 0.2, 1.75, PB), x, y, 6.3));
      fenArc(G, x, 2.2, 7.1, 0.7, 1.9, PB); fenArc(G, x, 5.6, 7.1, 0.5, 0.8, PB);
      G.add(at(cyl(0.6, 0.75, 0.5, CU, 12), x, 7.2, 6.3));
      const dm = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), CU); dm.scale.y = 1.4; dm.castShadow = true; G.add(at(dm, x, 7.45, 6.3));
      G.add(at(cyl(0.2, 0.2, 0.45, PB, 8), x, 8.5, 6.3)); G.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 8), CU), x, 8.95, 6.3));
      G.add(at(cyl(0.02, 0.05, 0.6, OR, 6), x, 9.5, 6.3));
      for (const s of [-1, 1]) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), OR), x + s * 0.8, 7.1, 7.1));
    }
    // pavillon d'entrée : grande baie dorée, horloge, statues
    G.add(at(boite(3.6, 5.2, 0.6, PM), cx, 3.0, 7.3));
    fenArc(G, cx, 1.9, 7.6, 2.0, 2.2, OR, M({ map: TX.verre() }));
    G.add(at(boite(1.8, 1.9, 0.04, M({ map: TX.bois('#3a2010') })), cx, 1.35, 7.62));
    G.add(at(boite(2.6, 0.6, 0.1, PB), cx, 4.55, 7.62));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), COL('#f8f4e8')), cx, 4.75, 7.68)); G.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.08, 6, 20), OR), cx, 4.75, 7.7));
    G.add(at(boite(0.03, 0.3, 0.02, COL('#2a2a30')), cx, 4.85, 7.7)); G.add(at(boite(0.2, 0.03, 0.02, COL('#2a2a30')), cx + 0.08, 4.75, 7.7));
    for (const s of [-1, 1]) { const x = cx + s * 1.2; G.add(at(boite(0.4, 0.3, 0.4, PB), x, 5.75, 7.3)); G.add(at(boite(0.26, 0.6, 0.22, PB), x, 6.2, 7.3)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), PB), x, 6.6, 7.3)); }
    G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), OR), cx, 5.9, 7.35));
    for (let k = 0; k < 3; k++) G.add(at(boite(3.4 + k * 0.4, 0.14, 0.3, PB), cx, 0.07 + (2 - k) * 0.14, 7.75 + k * 0.28));
    // lampadaires, parterre rond, palmiers
    for (const x of [cx - 4.6, cx - 2.0, cx + 2.0, cx + 4.6]) { G.add(at(cyl(0.05, 0.08, 1.9, COL('#2a2a30'), 6), x, 0.95, 8.6)); for (const s of [-1, 1]) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), LUM('#fff4c0', '#a08020')), x + s * 0.22, 1.95, 8.6)); }
    for (const x of [0.8, 13.2]) {
      G.add(at(cyl(0.1, 0.16, 2.4, COL('#8a6a4a'), 6), x, 1.2, 8.4));
      for (let i = 0; i < 7; i++) { const g2 = new THREE.Group(); g2.rotation.y = i * Math.PI * 2 / 7; for (let k = 0; k < 4; k++) { const f = boite(0.3, 0.05, 0.22 - k * 0.03, COL(k % 2 ? '#3c8c3c' : '#4a9a40')); f.rotation.z = -0.15 - k * 0.3; g2.add(at(f, 0.15 + k * 0.26, -k * k * 0.05, 0)); } g2.position.set(x, 2.45, 8.4); G.add(g2); }
    }
    return G;
  };

  /* -------------------------------------------------------------- la Ligue ----------------------------------------- */
  /** la Ligue (30 × 38) : une allée droite de 22 cases sous une colonnade à ciel ouvert (colonnes, architraves et
   *  traverses, torches entre les colonnes), un perron, puis un bâtiment d'un blanc immaculé de 30 × 14 et 11 de haut
   *  — plus large que l'écran même devant la porte : pilastres géants, grand portail en arc, frise de bas-reliefs,
   *  statues géantes, torches ; aucun autre ornement */
  B.ligue = ({ blanc = '#f4f4f2' } = {}) => {
    const G = new THREE.Group(), cx = 15, W = M({ map: TX.pierre(blanc) }), WB = M({ map: TX.pierre(mix(blanc, 0.4)) }), MA = M({ map: TX.marbre() });
    const H = 11, D0 = 14;
    // allée de 32 cases (≈ 8 s à pied) bordée de colonnes isolées, sans architrave ni traverse : rien ne passe au-dessus
    // du chemin ni ne masque le portail ; chaque colonne porte une vasque de feu
    const LA = 32;
    G.add(at(boite(8.0, 0.08, LA + 1, MA), cx, 0.04, D0 + 1 + LA / 2));
    for (const s of [-1, 1]) G.add(at(boite(0.3, 0.12, LA + 1, WB), cx + s * 4.1, 0.06, D0 + 1 + LA / 2));
    G.add(at(boite(14, 0.1, 3.0, MA), cx, 0.05, D0 + 1.5));
    for (let z = D0 + 5; z <= D0 + LA; z += 2.5) for (const s of [-1, 1]) {
      const x = cx + s * 3.6;
      G.add(at(boite(0.95, 0.5, 0.95, WB), x, 0.25, z));
      colonne(G, x, z, 0.5, 4.6, 0.3, W, WB);
      G.add(at(cyl(0.42, 0.22, 0.32, OR, 12), x, 5.3, z)); flamme(G, x, 5.42, z, 1.6);
    }
    // entrée de l'allée : deux piliers à statues et quelques marches
    for (const s of [-1, 1]) {
      const x = cx + s * 4.9, z = D0 + LA + 1.4;
      G.add(at(boite(1.4, 2.4, 1.4, W), x, 1.2, z)); G.add(at(boite(1.55, 0.2, 1.55, WB), x, 2.45, z));
      statue(G, x, 2.55, z, 1.0, s);
    }
    for (let k = 0; k < 3; k++) G.add(at(boite(8.0 + k * 0.6, 0.12, 0.35, MA), cx, 0.06 + (2 - k) * 0.08, D0 + LA + 1.6 + k * 0.3));
    // le bâtiment
    G.add(at(boite(30, 0.8, D0, W), cx, 0.4, D0 / 2));
    G.add(at(boite(30, H, D0 - 0.4, W), cx, 0.8 + H / 2, (D0 - 0.4) / 2));
    for (let i = 0; i <= 10; i++) { const x = 0.3 + i * 2.94; if (Math.abs(x - cx) < 3.2) continue; G.add(at(boite(0.7, H - 0.6, 0.35, WB), x, 0.8 + (H - 0.6) / 2, D0 - 0.25)); G.add(at(boite(0.9, 0.3, 0.45, WB), x, 0.8 + H - 0.45, D0 - 0.25)); }
    G.add(at(boite(30.6, 0.6, D0 + 0.2, WB), cx, 0.8 + H + 0.3, D0 / 2 - 0.1));
    // frise de bas-reliefs sous la corniche
    for (let i = 0; i < 46; i++) { const x = 0.6 + i * 0.63; if (Math.abs(x - cx) < 0.3) continue; const hh = 0.55 + (i % 3) * 0.12; G.add(at(boite(0.22, hh, 0.12, WB), x, 0.8 + H - 1.25 + hh / 2, D0 - 0.32)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), WB), x, 0.8 + H - 1.15 + hh, D0 - 0.32)); }
    G.add(at(boite(30, 0.12, 0.2, WB), cx, 0.8 + H - 1.35, D0 - 0.35));
    // attique en gradins et groupe sculpté au sommet
    G.add(at(boite(26, 1.4, D0 - 2, W), cx, 0.8 + H + 1.3, D0 / 2 - 0.5));
    G.add(at(boite(12, 1.0, D0 - 5, W), cx, 0.8 + H + 2.5, D0 / 2 - 0.5));
    statue(G, cx, 0.8 + H + 3.0, D0 - 4, 2.4, 1);
    for (const s of [-1, 1]) statue(G, cx + s * 5.2, 0.8 + H + 3.0, D0 - 4.2, 1.4, s);
    // grand portail en arc (5 de large, 8 de haut), profond, éclairé de l'intérieur
    G.add(at(boite(8.4, H - 0.2, 0.8, W), cx, 0.8 + (H - 0.2) / 2, D0));
    G.add(at(boite(5.0, 6.0, 0.05, COL('#3a3428')), cx, 0.8 + 3.0, D0 + 0.41));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(2.5, 24, 0, Math.PI), COL('#3a3428')), cx, 0.8 + 6.0, D0 + 0.41));
    G.add(at(boite(4.2, 5.6, 0.04, LUM('#f8e8b0', '#a08040')), cx, 0.8 + 2.8, D0 + 0.44));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(2.1, 24, 0, Math.PI), LUM('#f8e8b0', '#a08040')), cx, 0.8 + 5.6, D0 + 0.45));
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.4, 8, 24, Math.PI), WB), cx, 0.8 + 6.0, D0 + 0.5));
    for (const s of [-1, 1]) G.add(at(boite(0.8, 6.0, 0.8, WB), cx + s * 2.75, 0.8 + 3.0, D0 + 0.5));
    G.add(at(boite(1.2, 1.3, 0.4, WB), cx, 0.8 + 8.75, D0 + 0.55));
    for (let k = 0; k < 4; k++) G.add(at(boite(8 - k * 0.5, 0.2, 0.4, MA), cx, 0.1 + k * 0.2, D0 + 1.4 - k * 0.35));
    // statues géantes et torches de part et d'autre du portail
    for (const s of [-1, 1]) {
      const x = cx + s * 5.0;
      G.add(at(boite(2.0, 2.4, 2.0, W), x, 1.2, D0 + 1.6)); G.add(at(boite(2.2, 0.25, 2.2, WB), x, 2.5, D0 + 1.6));
      statue(G, x, 2.6, D0 + 1.6, 1.8, s);
      torche(G, cx + s * 2.6, D0 + 1.0, 0.1, 2.2);
      for (const xx of [cx + s * 8.5, cx + s * 11.5]) torche(G, xx, D0 + 0.25, 3.0, 0.5);
    }
    return G;
  };
  /** statue de pierre blanche : créature légendaire stylisée (corps, cou, tête, ailes déployées, queue) */
  function statue(G, x, y, z, k = 1, sens = 1) {
    const ST = M({ map: TX.pierre('#f8f8f6') }), S2 = new THREE.Group(); S2.position.set(x, y, z); S2.scale.setScalar(k); S2.rotation.y = sens * 0.25;
    S2.add(at(boite(0.7, 0.2, 0.6, ST), 0, 0.1, 0));
    const corps = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), ST); corps.scale.set(1, 1.3, 0.9); S2.add(at(corps, 0, 0.6, 0));
    const cou = cyl(0.1, 0.16, 0.5, ST, 8); cou.rotation.x = 0.3; S2.add(at(cou, 0, 1.0, 0.08));
    S2.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), ST), 0, 1.3, 0.2));
    const bec = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), ST); bec.rotation.x = Math.PI / 2; S2.add(at(bec, 0, 1.28, 0.38));
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const p = boite(0.55 - i * 0.1, 0.06, 0.14, ST); p.rotation.z = s * (0.6 + i * 0.25); S2.add(at(p, s * (0.32 + i * 0.05), 0.85 + i * 0.14, -0.08 - i * 0.03)); }
    const q = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 6), ST); q.rotation.x = -1.2; S2.add(at(q, 0, 0.35, -0.4));
    S2.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.add(S2);
  }

  /* -------------------------------------------------------------- escaliers intérieurs (une case de large) ---------- */
  /** escalier qui monte vers le mur du fond : 6 marches de bois sur une case de large et deux de long, rampe */
  B.escalierMontant = () => {
    const G = new THREE.Group(), n = 6, L = 2, w = 1;
    for (let i = 0; i < n; i++) {
      const hh = (i + 1) * 0.28, z = L - (i + 0.5) * L / n;
      G.add(at(boite(w * 0.9, hh, L / n, M({ map: TX.bois('#a8744a') })), w / 2, hh / 2, z));
      G.add(at(boite(w * 0.9, 0.04, L / n, COL('#c89a66')), w / 2, hh + 0.02, z));          // nez de marche clair
    }
    for (const s of [0.04, w - 0.04]) {
      const r = boite(0.06, 0.06, Math.hypot(L, n * 0.28) + 0.1, COL('#5a3a22')); r.rotation.x = Math.atan2(n * 0.28, L); G.add(at(r, s, n * 0.28 / 2 + 0.5, L / 2));
      for (let i = 0; i <= n; i += 2) G.add(at(boite(0.05, 0.5, 0.05, COL('#5a3a22')), s, i * 0.28 + 0.25, L - i * L / n));
    }
    return G;
  };
  /** escalier qui descend : trémie dans le plancher (une case de large), marches qui s'enfoncent dans l'ombre, garde-corps */
  B.escalierDescendant = () => {
    const G = new THREE.Group(), n = 6, L = 2, w = 1;
    G.add(at(boite(w, 0.05, L, COL('#120c08')), w / 2, -1.5, L / 2));                        // le fond, dans le noir
    for (const [x, ww] of [[0, 0.05], [w, 0.05]]) G.add(at(boite(ww, 1.5, L, COL('#2a1a10')), x, -0.75, L / 2));   // parois de la trémie
    for (let i = 0; i < n; i++) {
      const y = -(i + 1) * 0.22, z = (i + 0.5) * L / n, f = 1 - i / n;
      const top = y + 0.23, hh = top + 1.5;   // marche pleine jusqu'au fond (pas de jour entre deux marches)
      G.add(at(boite(w * 0.96, hh, L / n, COL(`rgb(${Math.round(168 * f)},${Math.round(116 * f)},${Math.round(74 * f)})`)), w / 2, top - hh / 2, z));
      G.add(at(boite(w * 0.96, 0.03, 0.05, COL(`rgb(${Math.round(210 * f)},${Math.round(160 * f)},${Math.round(110 * f)})`)), w / 2, top + 0.01, z - L / n / 2 + 0.025));
    }
    for (const [x, z, ww, dd] of [[w / 2, -0.02, w + 0.14, 0.06], [-0.02, L / 2, 0.06, L + 0.1], [w + 0.02, L / 2, 0.06, L + 0.1]]) G.add(at(boite(ww, 0.06, dd, COL('#5a3a22')), x, 0.45, z));
    for (const [x, z] of [[-0.02, -0.02], [w + 0.02, -0.02], [-0.02, L], [w + 0.02, L], [-0.02, L / 2], [w + 0.02, L / 2]]) G.add(at(boite(0.05, 0.45, 0.05, COL('#5a3a22')), x, 0.22, z));
    return G;
  };

  return { B, boite, at, M, COL, TX };
}

/** emprise au sol (w × d) de chaque modèle, comme dans le jeu */
export const EMPRISES = {
  maison: [4, 3], maisonL: [5, 5], maisonLongue: [5, 3], maisonHaute: [4, 4], maisonExt: [7, 4], chalet: [5, 5], residence: [6, 4],
  cabaneChasseur: [4, 3], cabanePecheur: [5, 4], grange: [6, 5], moulin: [4, 4], phare: [3, 3], auberge: [6, 5], chapelle: [4, 7],
  boulangerie: [4, 4], maisonThe: [5, 5], gare: [8, 4], kiosque: [4, 5], puits: [2, 2], etal: [2, 2],
  mairie: [9, 5], fontaine: [3, 3], centre: [7, 5], boutique: [5, 4], arene: [12, 11], areneFeu: [12, 11], pavillonFeu: [12, 11], areneCour: [18, 14], labo: [10, 7],
  pagode: [11, 11], pavillon: [8, 7], tour: [8, 5], tourVerre: [10, 7], tourDeco: [8, 8], bourse: [12, 8], casino: [14, 8], ligue: [30, 14], usinePokeball: [32, 10],
  escalierMontant: [1, 2], escalierDescendant: [1, 2],
};
