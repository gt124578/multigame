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
    t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; cache.set(key, t); return t;
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
  B.residence = ({ mur = '#f0e0d0', toit = '#8a4a3a' } = {}) => {
    const G = new THREE.Group(), w = 6, d = 4, H = 2.9, cx = 3;
    socle(G, 0, 0, w, d, 0.3);
    G.add(at(boite(w, H, d, M({ map: TX.enduit(mur) })), cx, H / 2 + 0.3, d / 2));
    G.add(at(boite(w + 0.06, 0.12, d + 0.06, COL('#c8b8a4')), cx, 1.75, d / 2));    // bandeau entre les étages
    G.add(toit4(G, cx, d / 2, H + 0.3, w / 2 + 0.3, d / 2 + 0.3, 1.2, M({ map: TX.canalPetit(toit) }), 0.35));
    for (const xx of [0.9, 2.1, 3.9, 5.1]) fenetre2(G, xx, 2.55, d, 0.55, 0.6, { volets: '#5a7a5a', rideau: '#f0e8d8', fleurs: xx < 1 || xx > 5 ? ['#f05a6a', '#fafaf2'] : null });
    for (const xx of [0.9, 5.1]) fenetre2(G, xx, 1.1, d, 0.6, 0.55, { volets: '#5a7a5a', rideau: '#f0e8d8', fleurs: ['#f05a6a', '#f8d850', '#fafaf2'] });
    // balcon au-dessus de la porte
    G.add(at(boite(1.9, 0.1, 0.55, M({ map: TX.pierre() })), cx, 1.95, d + 0.27));
    for (let i = 0; i <= 8; i++) G.add(at(boite(0.04, 0.38, 0.04, COL('#2a2a30')), cx - 0.92 + i * 0.23, 2.17, d + 0.52));
    G.add(at(boite(1.9, 0.05, 0.05, COL('#2a2a30')), cx, 2.37, d + 0.52));
    G.add(at(boite(0.8, 0.95, 0.03, M({ map: TX.verre() })), cx, 2.45, d + 0.01));
    porte(G, cx, d, 0.3, 1.2, M({ map: TX.bois('#5a3a2a') }), COL('#ffffff'), 0.85);
    for (const xx of [1.2, 4.8]) G.add(at(boite(0.4, 0.8, 0.4, M({ map: TX.pierre('#b07060') })), xx, H + 1.0, 1.0));
    return G;
  };
  /** boutique (4 × 4) : toit bleu, enseigne au sac, store rayé, vitrine remplie, portes vitrées de 2 cases */
  B.boutique = () => {
    const G = new THREE.Group(), w = 4, d = 4, H = 2.3;
    G.add(at(boite(w, H, d, M({ map: TX.enduit('#ece4d0') })), w / 2, H / 2, d / 2));
    G.add(at(boite(w + 0.3, 0.22, d + 0.3, COL('#f4f4f6')), w / 2, H + 0.11, d / 2));
    voute(G, 0, w, 0, d, H + 0.22, 1.2, M({ map: TX.tole('#3a68c8') }), COL('#2c58b0'));
    const sac = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.65, 0.1), [COL('#1a2e6a'), COL('#1a2e6a'), COL('#1a2e6a'), COL('#1a2e6a'), M({ map: TX.sac() }), COL('#1a2e6a')]);
    sac.castShadow = true; G.add(at(sac, w / 2, H + 0.6, d + 0.18));
    G.add(at(boite(1.6, 0.95, 0.03, M({ map: TX.etals() })), 0.95, 1.0, d + 0.01));
    for (const [dx, dy, ww, hh] of [[0, 0.5, 1.7, 0.08], [0, -0.5, 1.7, 0.08], [-0.82, 0, 0.08, 1.05], [0.82, 0, 0.08, 1.05]]) G.add(at(boite(ww, hh, 0.08, COL('#c4bca8')), 0.95 + dx, 1.0 + dy, d + 0.04));
    const st = boite(4.1, 0.06, 0.8, M({ map: TX.store('#3a68c8') })); st.rotation.x = 0.35; G.add(at(st, w / 2, 1.85, d + 0.36));
    portesVitrees(G, 2.95, d, 1.55, 1.4, COL('#6e7480'));
    G.add(at(boite(0.55, 0.32, 0.38, M({ map: TX.bois() })), 0.5, 0.16, d + 0.45));
    for (let i = 0; i < 3; i++) G.add(at(boite(0.11, 0.11, 0.11, COL('#e24a4a')), 0.35 + i * 0.15, 0.37, d + 0.45));
    return G;
  };
  /** Ligue (9 × 6) : marbre, grand escalier, colonnade, dôme doré, porte monumentale de 2 cases */
  B.ligue = () => {
    const G = new THREE.Group(), w = 9, d = 6, H = 3.0, cx = 4.5;
    G.add(at(boite(w + 0.2, 0.4, d + 0.2, M({ map: TX.marbre() })), cx, 0.2, d / 2));
    G.add(at(boite(w, H, d - 0.6, M({ map: TX.marbre() })), cx, H / 2 + 0.4, (d - 0.6) / 2));
    G.add(at(boite(w + 0.3, 0.3, d + 0.1, M({ map: TX.ardoise('#2a4a9c') })), cx, H + 0.55, d / 2 - 0.25));
    G.add(at(boite(w + 0.36, 0.12, d + 0.16, COL('#e8b830')), cx, H + 0.4, d / 2 - 0.25));
    for (let i = 0; i < 8; i++) { const xx = 0.6 + i * (w - 1.2) / 7; if (Math.abs(xx - cx) < 1) continue; G.add(at(cyl(0.2, 0.22, H - 0.1, M({ map: TX.marbre() })), xx, H / 2 + 0.4, d - 0.3)); }
    // fronton triangulaire
    const fr = new THREE.Shape(); fr.moveTo(-2.2, 0); fr.lineTo(2.2, 0); fr.lineTo(0, 0.9); fr.closePath();
    const fm = new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 0.3, bevelEnabled: false }), COL('#f2f0f6')); fm.castShadow = true; G.add(at(fm, cx, H + 0.7, d - 0.5));
    G.add(at(boite(0.6, 0.6, 0.06, LUM('#f0c840', '#806010')), cx, H + 1.0, d - 0.15));
    G.add(at(cyl(1.3, 1.4, 0.6, COL('#e8e4f0'), 24), cx, H + 0.95, 2.0));                      // tambour du dôme
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M({ map: TX.canal('#e8b830') })); dome.castShadow = true; G.add(at(dome, cx, H + 1.25, 2.0));
    G.add(at(cyl(0.06, 0.1, 0.6, COL('#e8b830')), cx, H + 2.8, 2.0));
    G.add(at(boite(1.7, 2.0, 0.04, M({ map: TX.bois('#5a2a1a') })), cx, 1.4, d - 0.6 + 0.01));
    for (const s of [-1, 1]) G.add(at(boite(0.2, 2.2, 0.2, COL('#e8b830')), cx + s * 0.95, 1.5, d - 0.55));
    for (let k = 0; k < 3; k++) G.add(at(boite(3.0 + k * 0.8, 0.13, 0.3, M({ map: TX.marbre() })), cx, 0.07 + (2 - k) * 0.13, d + 0.1 + k * 0.28));
    for (const s of [-1, 1]) G.add(at(boite(0.5, 1.4, 0.03, COL('#2a4a9c')), cx + s * 1.7, 2.4, d - 0.55));
    return G;
  };
  /** tour de ville (8 × 5, Métropole) : mur-rideau vitré, socle de pierre, marquise et portes de 2 cases, toit technique */
  B.tour = ({ etages = 8, col = '#8a98b0' } = {}) => {
    const G = new THREE.Group(), w = 8, d = 5, H = 1.1 * etages, cx = 4;
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
  B.maison = ({ toit = '#c05a40', mur = '#f2e6c8', bois = '#5a3a26', colombage = false, fleurs = ['#f05a6a', '#f8d850', '#fafaf2'], rideau = '#f0d8b0', volets = null, w = 4, d = 3 } = {}) => {
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
    porte(G, cx, z1, 0.3, 1.12, M({ map: TX.bois('#7a4a2a') }), COL(colombage ? bois : '#6a4228'));
    // petit auvent au-dessus de la porte, lanterne, banc et pot de fleurs
    const au = boite(1.1, 0.06, 0.45, M({ map: TX.canalPetit(toit) })); au.rotation.x = 0.4; G.add(at(au, cx, 1.62, z1 + 0.22));
    G.add(at(boite(0.12, 0.2, 0.12, LUM('#fff4c0', '#806020')), cx + 0.6, 1.2, z1 + 0.1));
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

  /* -------------------------------------------------------------- centre de soins ------------------------------------ */
  /** centre de soins (5 × 4) : toit rouge lisse tout en rondeur, corniche blanche, grande enseigne ronde, baies cintrées,
   *  portes vitrées de 2 cases sous une marquise arrondie */
  B.centre = () => {
    const G = new THREE.Group(), w = 5, d = 4, H = 2.3, cx = 2.5;
    G.add(at(boite(w, H, d, M({ map: TX.enduit('#f2f2f6') })), cx, H / 2, d / 2));
    G.add(at(boite(w + 0.2, 0.3, d + 0.2, COL('#f8f8fa')), cx, H + 0.15, d / 2));
    toitRond(G, cx, d / 2, H + 0.25, w / 2 + 0.16, d / 2 + 0.16, 0.8, '#d63a3a', 4);
    G.add(at(boite(w, 0.2, 0.04, COL('#d63a3a')), cx, 0.5, d + 0.02));
    for (const xx of [0.72, 4.28]) {                      // baies cintrées
      G.add(at(boite(0.95, 0.9, 0.03, M({ map: TX.verre() })), xx, 1.35, d + 0.01));
      const arc = new THREE.Mesh(new THREE.CircleGeometry(0.48, 12, 0, Math.PI), M({ map: TX.verre() })); G.add(at(arc, xx, 1.8, d + 0.01));
      const ca = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 4, 12, Math.PI), COL('#c6c8d0')); G.add(at(ca, xx, 1.8, d + 0.04));
      for (const s of [-1, 1]) G.add(at(boite(0.06, 0.9, 0.07, COL('#c6c8d0')), xx + s * 0.48, 1.35, d + 0.04));
      G.add(at(boite(1.1, 0.07, 0.16, COL('#c6c8d0')), xx, 0.87, d + 0.08));
    }
    portesVitrees(G, cx, d, 1.7, 1.45, COL('#9a9ca4'));
    // marquise arrondie au-dessus des portes
    const mq = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.3, 16, 1, false, 0, Math.PI), COL('#d63a3a')); mq.rotation.z = Math.PI / 2; mq.castShadow = true; G.add(at(mq, cx, 1.62, d + 0.05));
    // enseigne : grand disque à croix sur l'avant du toit, cerclé de blanc
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 28), [COL('#f4f4f6'), M({ map: TX.croix() }), COL('#f4f4f6')]);
    disc.rotation.x = Math.PI / 2; disc.castShadow = true; G.add(at(disc, cx, H + 0.55, d + 0.3));
    const cc = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 6, 24), COL('#ffffff')); G.add(at(cc, cx, H + 0.55, d + 0.38));
    return G;
  };

  /* -------------------------------------------------------------- arène ---------------------------------------------- */
  /** arène (9 × 6) : socle, façade de pierre à pilastres et fenêtres cintrées, voûte d'ardoise à nervures colorées et
   *  verrière, deux tours d'angle coiffées de cônes, portique à colonnes et fronton à l'emblème, porte en arc à vitrail,
   *  statues sur piédestaux, bannières, lanternes ; entrée de 2 cases */
  B.arene = ({ acc = '#e07030', pierre = '#c8c2b6' } = {}) => {
    const G = new THREE.Group(), w = 9, d = 6, H = 2.8, cx = 4.5, z1 = d, P = M({ map: TX.pierre(pierre) }), A = COL(acc);
    G.add(at(boite(w + 0.2, 0.35, d + 0.2, M({ map: TX.pierre(mix(pierre, -0.15)) })), cx, 0.17, d / 2));
    G.add(at(boite(w - 1.6, H, d, P), cx, H / 2 + 0.35, d / 2));
    // voûte, nervures à la couleur du type, verrière au sommet
    G.add(at(boite(w - 1.4, 0.2, d + 0.15, A), cx, H + 0.45, d / 2));
    voute(G, 0.8, w - 0.8, 0, d, H + 0.55, 1.8, M({ map: TX.ardoise('#3a4152') }), A, 0.15);
    for (let k = 0; k < 5; k++) { const x = 1.4 + k * (w - 2.8) / 4, nv = new THREE.Mesh(new THREE.TorusGeometry(d / 2 + 0.2, 0.06, 4, 16, Math.PI), A); nv.scale.set(1, 1.8 / (d / 2 + 0.2), 1); nv.rotation.y = Math.PI / 2; G.add(at(nv, x, H + 0.55, d / 2)); }
    G.add(at(boite(w - 3.2, 0.12, 0.9, M({ map: TX.verre() })), cx, H + 2.38, d / 2));
    // tours d'angle
    for (const xx of [0.85, w - 0.85]) {
      G.add(at(cyl(0.85, 0.9, H + 1.2, P, 16), xx, (H + 1.2) / 2 + 0.35, z1 - 0.85));
      G.add(at(cyl(0.95, 0.95, 0.16, A, 16), xx, H + 1.6, z1 - 0.85));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 16), M({ map: TX.ardoise(mix(acc, -0.35)) })); cone.castShadow = true; G.add(at(cone, xx, H + 2.4, z1 - 0.85));
      G.add(at(cyl(0.03, 0.03, 0.5, COL('#e8c060')), xx, H + 3.3, z1 - 0.85)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), COL('#e8c060')), xx, H + 3.55, z1 - 0.85));
      for (const yy of [1.4, 2.6]) { G.add(at(boite(0.3, 0.5, 0.05, M({ map: TX.verre() })), xx, yy, z1 + 0.02)); G.add(at(boite(0.4, 0.06, 0.12, A), xx, yy - 0.28, z1 + 0.05)); }
      const ban = boite(0.5, 1.1, 0.03, A); G.add(at(ban, xx, 2.0, z1 + 0.04));
      G.add(at(boite(0.24, 0.24, 0.04, COL('#f4f0e6')), xx, 2.2, z1 + 0.07));
    }
    // façade : pilastres et fenêtres cintrées entre tours et portique
    for (const xx of [2.4, w - 2.4]) {
      G.add(at(boite(0.7, 1.1, 0.03, M({ map: TX.verre() })), xx, 1.55, z1 + 0.01));
      const ar = new THREE.Mesh(new THREE.CircleGeometry(0.35, 10, 0, Math.PI), M({ map: TX.vitrail(acc) })); G.add(at(ar, xx, 2.1, z1 + 0.01));
      const ca = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.06, 4, 10, Math.PI), M({ map: TX.pierre('#e8e2d6') })); G.add(at(ca, xx, 2.1, z1 + 0.05));
      G.add(at(boite(0.85, 0.08, 0.16, A), xx, 0.96, z1 + 0.08));
    }
    for (const xx of [1.85, 2.95, w - 2.95, w - 1.85]) G.add(at(boite(0.2, H, 0.12, M({ map: TX.pierre('#e2ddd2') })), xx, H / 2 + 0.35, z1 + 0.06));
    // portique : colonnes, entablement, fronton à l'emblème
    for (const xx of [cx - 1.45, cx - 0.65, cx + 0.65, cx + 1.45]) {
      G.add(at(cyl(0.16, 0.18, H - 0.2, M({ map: TX.marbre() })), xx, H / 2 + 0.35, z1 + 0.65));
      G.add(at(boite(0.42, 0.14, 0.42, COL('#e8e2d6')), xx, H + 0.2, z1 + 0.65)); G.add(at(boite(0.42, 0.14, 0.42, COL('#e8e2d6')), xx, 0.42, z1 + 0.65));
    }
    G.add(at(boite(3.6, 0.3, 1.0, M({ map: TX.pierre('#e8e2d6') })), cx, H + 0.4, z1 + 0.45));
    G.add(at(boite(3.62, 0.08, 1.02, A), cx, H + 0.28, z1 + 0.45));
    const fr = new THREE.Shape(); fr.moveTo(-1.85, 0); fr.lineTo(1.85, 0); fr.lineTo(0, 0.85); fr.closePath();
    const fm = new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 1.0, bevelEnabled: false }), M({ map: TX.pierre('#e8e2d6') })); fm.castShadow = true; G.add(at(fm, cx, H + 0.55, z1 - 0.05));
    const lo = boite(0.5, 0.5, 0.1, A); lo.rotation.z = Math.PI / 4; G.add(at(lo, cx, H + 0.85, z1 + 0.97));
    const lo2 = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), COL('#f4f0e6')); G.add(at(lo2, cx, H + 0.85, z1 + 1.03));
    // porte en arc à double battant, vitrail en éventail au-dessus
    G.add(at(boite(1.5, 1.6, 0.04, M({ map: TX.bois('#6a3a22') })), cx, 1.15, z1 + 0.01));
    G.add(at(boite(0.04, 1.6, 0.05, COL('#2a1a10')), cx, 1.15, z1 + 0.03));
    const vt = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16, 0, Math.PI), M({ map: TX.vitrail(acc) })); G.add(at(vt, cx, 1.95, z1 + 0.01));
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.09, 6, 16, Math.PI), A); arc.castShadow = true; G.add(at(arc, cx, 1.95, z1 + 0.06));
    for (const s of [-1, 1]) G.add(at(boite(0.14, 1.6, 0.14, A), cx + s * 0.82, 1.15, z1 + 0.06));
    for (let k = 0; k < 3; k++) G.add(at(boite(3.8 + k * 0.5, 0.12, 0.3, M({ map: TX.pierre('#d8d2c6') })), cx, 0.06 + (2 - k) * 0.12, z1 + 1.2 + k * 0.28));
    // statues sur piédestaux (silhouette de créature stylisée) et lanternes
    for (const s of [-1, 1]) {
      const sx = cx + s * 2.6;
      G.add(at(boite(0.6, 0.7, 0.6, M({ map: TX.pierre('#d8d2c6') })), sx, 0.35, z1 + 1.35));
      G.add(at(boite(0.68, 0.08, 0.68, A), sx, 0.72, z1 + 1.35));
      const st = M({ map: TX.pierre('#9a9aa2') });
      G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), st), sx, 0.98, z1 + 1.35));
      G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), st), sx, 1.32, z1 + 1.42));
      for (const e of [-1, 1]) { const o = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), st); o.rotation.z = -e * 0.4; G.add(at(o, sx + e * 0.1, 1.52, z1 + 1.42)); }
      G.add(at(boite(0.1, 0.5, 0.1, COL('#3e3a38')), cx + s * 1.25, 0.6, z1 + 1.45));
      G.add(at(boite(0.2, 0.22, 0.2, LUM('#ffd070', '#ff8a00')), cx + s * 1.25, 0.95, z1 + 1.45));
    }
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
        toitChinois(G, cx, cz, y - 0.08, b + 0.6, b + 0.6, 1.7, { ...T, xt: 1.2, zt: 0.12, lift: 0.6 });
        const fy = y - 0.08 + 1.8;
        G.add(at(cyl(0.12, 0.2, 0.5, COL(bord), 10), cx, fy + 0.25, cz));
        G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), LUM('#f0c840', '#604000')), cx, fy + 0.7, cz));
        G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), LUM('#f0c840', '#604000')), cx, fy + 1.15, cz));
        G.add(at(cyl(0.03, 0.06, 0.6, COL(bord), 6), cx, fy + 1.55, cz));
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
  maison: [4, 3], maisonL: [5, 5], maisonLongue: [5, 3], residence: [6, 4], mairie: [9, 6], fontaine: [3, 3], centre: [5, 4],
  boutique: [4, 4], arene: [9, 8], labo: [10, 8], ligue: [9, 6], pagode: [11, 12], pavillon: [8, 7], tour: [8, 5],
  escalierMontant: [1, 2], escalierDescendant: [1, 2],
};
