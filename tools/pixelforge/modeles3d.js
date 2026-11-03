// Odyssée — PixelForge / modèles 3D des bâtiments (fausse 3D façon HeartGold / SoulSilver : volumes simples, textures
// pixel art à D px par unité, éclairage en paliers nets). Chaque modèle tient dans l'emprise du jeu (w × d cases, porte
// de 1 ou 2 cases de large sur la façade sud) ; les hauteurs sont en cases « à plat », étirées de tan(EL) par l'appelant.
import * as THREE from 'three';

export function atelier(D) {
  /* -------------------------------------------------------------- textures ------------------------------------------ */
  const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 974711) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
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
  /** maison (4 × 3) : toit de tuiles, lucarne, cheminée, volets, jardinières ; porte d'une case */
  B.maison = ({ toit = '#c8483c', mur = '#f2e6c8', fleurs = ['#f05a6a', '#f8d850', '#fafaf2'], w = 4, d = 3 } = {}) => {
    const G = new THREE.Group(), H = 1.75, x1 = w, z1 = d, cx = w / 2;
    socle(G, 0, 0, w, d);
    G.add(at(boite(w, H, d, M({ map: TX.enduit(mur) })), cx, H / 2 + 0.3, d / 2));
    for (const xx of [0.06, x1 - 0.06]) G.add(at(boite(0.14, H, 0.14, COL('#8e5c36')), xx, H / 2 + 0.3, z1));
    toit2(G, 0, x1, 0, z1, H + 0.3, 1.25, M({ map: TX.tuiles(toit) }), M({ map: TX.enduit(mur), side: THREE.DoubleSide }));
    G.add(at(boite(0.5, 0.9, 0.5, M({ map: TX.pierre('#c87a60') })), x1 - 0.8, H + 1.25, 0.9));
    G.add(at(boite(0.64, 0.1, 0.64, COL('#5a5552')), x1 - 0.8, H + 1.72, 0.9));
    G.add(at(boite(0.9, 0.7, 0.8, M({ map: TX.enduit(mur) })), cx, H + 0.85, z1 - 0.7));
    toit2(G, cx - 0.45, cx + 0.45, z1 - 1.1, z1 - 0.3, H + 1.2, 0.35, M({ map: TX.tuiles(toit) }), M({ map: TX.enduit(mur), side: THREE.DoubleSide }), 0.1);
    fenetre(G, cx, H + 0.85, z1 - 0.29, 0.44, 0.36, COL('#f4f0e6'));
    fenetre(G, 0.75, 1.35, z1, 0.62, 0.55, COL('#f4f0e6'), COL(toit), fleurs);
    fenetre(G, x1 - 0.75, 1.35, z1, 0.62, 0.55, COL('#f4f0e6'), COL(toit), fleurs);
    porte(G, cx, z1, 0.3, 1.1, M({ map: TX.bois() }), COL('#6a4228'));
    G.add(at(boite(0.12, 0.2, 0.12, LUM('#fff4c0', '#806020')), cx + 0.6, 1.15, z1 + 0.1));
    return G;
  };
  /** maison longue (5 × 3) : bardage de bois, véranda couverte sur poteaux devant la porte, toit d'ardoise */
  B.maisonLongue = ({ bardage = '#7aa0b0', toit = '#4a5a72' } = {}) => {
    const G = new THREE.Group(), w = 5, d = 3, H = 1.7, cx = 2.5;
    socle(G, 0, 0, w, d);
    G.add(at(boite(w, H, d, M({ map: TX.bardage(bardage) })), cx, H / 2 + 0.3, d / 2));
    toit2(G, 0, w, 0, d, H + 0.3, 1.15, M({ map: TX.ardoise(toit) }), M({ map: TX.bardage(bardage), side: THREE.DoubleSide }), 0.3, '#2a3040');
    for (const xx of [0.8, 4.2]) fenetre(G, xx, 1.3, d, 0.75, 0.55, COL('#f4f0e6'), null, ['#f8d850', '#fafaf2']);
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
    G.add(toit4(G, cx, d / 2, H + 0.3, w / 2 + 0.3, d / 2 + 0.3, 1.2, M({ map: TX.tuiles(toit) }), 0.35));
    for (const xx of [0.9, 2.1, 3.9, 5.1]) fenetre(G, xx, 2.55, d, 0.55, 0.6, COL('#ffffff'), COL('#5a7a5a'));
    for (const xx of [0.9, 5.1]) fenetre(G, xx, 1.1, d, 0.6, 0.55, COL('#ffffff'), COL('#5a7a5a'), ['#f05a6a', '#fafaf2']);
    // balcon au-dessus de la porte
    G.add(at(boite(1.9, 0.1, 0.55, M({ map: TX.pierre() })), cx, 1.95, d + 0.27));
    for (let i = 0; i <= 8; i++) G.add(at(boite(0.04, 0.38, 0.04, COL('#2a2a30')), cx - 0.92 + i * 0.23, 2.17, d + 0.52));
    G.add(at(boite(1.9, 0.05, 0.05, COL('#2a2a30')), cx, 2.37, d + 0.52));
    G.add(at(boite(0.8, 0.95, 0.03, M({ map: TX.verre() })), cx, 2.45, d + 0.01));
    porte(G, cx, d, 0.3, 1.2, M({ map: TX.bois('#5a3a2a') }), COL('#ffffff'), 0.85);
    for (const xx of [1.2, 4.8]) G.add(at(boite(0.4, 0.8, 0.4, M({ map: TX.pierre('#b07060') })), xx, H + 1.0, 1.0));
    return G;
  };
  /** centre de soins (5 × 4) : toit rouge, enseigne ronde, baies, portes vitrées de 2 cases sous un auvent */
  B.centre = () => {
    const G = new THREE.Group(), w = 5, d = 4, H = 2.4, cx = 2.5;
    G.add(at(boite(w, H, d, M({ map: TX.enduit('#eceef2') })), cx, H / 2, d / 2));
    G.add(at(boite(w + 0.3, 0.22, d + 0.3, COL('#f4f4f6')), cx, H + 0.11, d / 2));                    // corniche blanche
    voute(G, 0, w, 0, d, H + 0.22, 1.3, M({ map: TX.tole('#d0403c') }), COL('#b83434'));
    G.add(at(boite(w, 0.18, 0.04, COL('#d0403c')), cx, 0.45, d + 0.02));
    for (const xx of [0.75, 4.25]) fenetre(G, xx, 1.5, d, 0.9, 0.85, COL('#c6c8d0'));
    G.add(at(boite(w, 0.14, 0.04, COL('#d0403c')), cx, 2.25, d + 0.02));
    portesVitrees(G, cx, d, 1.7, 1.45, COL('#8c8e96'));
    const au = boite(2.3, 0.08, 0.7, COL('#d0403c')); au.rotation.x = 0.25; G.add(at(au, cx, 1.62, d + 0.32));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 24), [COL('#e4e6ec'), M({ map: TX.croix() }), COL('#e4e6ec')]);
    disc.rotation.x = Math.PI / 2; disc.castShadow = true; G.add(at(disc, cx, H + 0.7, d + 0.2));
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
  /** arène (7 × 5) : pierre de taille, toit d'ardoise, médaillon au type, colonnes, porte en arc de 2 cases */
  B.arene = ({ acc = '#e07030', pierre = '#c8c2b6' } = {}) => {
    const G = new THREE.Group(), w = 7, d = 5, H = 2.6, cx = 3.5, z1 = d;
    G.add(at(boite(w, H, d, M({ map: TX.pierre(pierre) })), cx, H / 2, d / 2));
    G.add(at(boite(w + 0.3, 0.24, d + 0.3, COL(acc)), cx, H + 0.12, d / 2));
    voute(G, 0, w, 0, d, H + 0.24, 1.7, M({ map: TX.ardoise() }), COL(acc), 0.2);
    for (const xx of [0.6, 1.9, w - 1.9, w - 0.6]) {
      G.add(at(cyl(0.2, 0.22, H - 0.3, COL('#e2ddd2')), xx, H / 2, z1 + 0.25));
      G.add(at(boite(0.55, 0.16, 0.55, COL('#cec8bc')), xx, H - 0.08, z1 + 0.25)); G.add(at(boite(0.55, 0.16, 0.55, COL('#cec8bc')), xx, 0.08, z1 + 0.25));
    }
    G.add(at(boite(1.6, 1.7, 0.04, M({ map: TX.bois('#7a4e2c') })), cx, 0.85, z1 + 0.01));
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.1, 6, 16, Math.PI), COL(acc)); arc.castShadow = true; G.add(at(arc, cx, 1.65, z1 + 0.06));
    G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.76, 16, 0, Math.PI), M({ map: TX.bois('#7a4e2c') })), cx, 1.68, z1 + 0.02));
    for (const s of [-1, 1]) G.add(at(boite(0.16, 1.7, 0.16, COL(acc)), cx + s * 0.84, 0.85, z1 + 0.06));
    const lo = boite(0.9, 0.9, 0.12, COL(acc)); lo.rotation.z = Math.PI / 4; G.add(at(lo, cx, H + 0.8, z1 + 0.1));
    const lo2 = boite(0.45, 0.45, 0.14, COL('#f4f0e6')); lo2.rotation.z = Math.PI / 4; G.add(at(lo2, cx, H + 0.8, z1 + 0.15));
    for (const s of [-1, 1]) G.add(at(boite(0.38, 1.0, 0.03, COL(acc)), cx + s * 2.55, 1.55, z1 + 0.03));
    for (let k = 0; k < 2; k++) G.add(at(boite(2.2 + k * 0.6, 0.1, 0.32, M({ map: TX.pierre() })), cx, 0.05 + (1 - k) * 0.1, z1 + 0.2 + k * 0.28));
    for (const s of [-1, 1]) { G.add(at(boite(0.12, 0.36, 0.12, COL('#3e3a38')), cx + s * 1.1, 1.3, z1 + 0.12)); G.add(at(boite(0.11, 0.14, 0.11, LUM('#ffb040', '#ff7a00')), cx + s * 1.1, 1.53, z1 + 0.12)); }
    return G;
  };
  /** laboratoire (6 × 4) : moderne, toit plat à panneaux solaires, antenne parabolique, grandes baies, portes de 2 cases */
  B.labo = () => {
    const G = new THREE.Group(), w = 6, d = 4, H = 2.3, cx = 3;
    G.add(at(boite(w, H, d, M({ map: TX.enduit('#f4f6f8') })), cx, H / 2, d / 2));
    G.add(at(boite(w + 0.2, 0.22, d + 0.2, COL('#5a8ab8')), cx, H + 0.11, d / 2));
    for (const xx of [1.1, 2.3]) { const p = boite(1.0, 0.05, 1.4, M({ map: TX.panneauSolaire() })); p.rotation.x = -0.35; G.add(at(p, xx, H + 0.45, 1.5)); }
    G.add(at(cyl(0.05, 0.05, 0.7, COL('#9aa0a8')), 4.6, H + 0.55, 1.2));
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3), COL('#e8eaee')); dish.rotation.x = -0.9; dish.castShadow = true; G.add(at(dish, 4.6, H + 0.95, 1.3));
    G.add(at(boite(w, 0.85, 0.03, M({ map: TX.verre() })), cx, 1.45, d + 0.01));                // bandeau vitré
    for (let i = 0; i <= 6; i++) G.add(at(boite(0.06, 0.85, 0.06, COL('#5a8ab8')), i, 1.45, d + 0.03));
    G.add(at(boite(w, 0.12, 0.06, COL('#5a8ab8')), cx, 1.92, d + 0.03));
    portesVitrees(G, cx, d, 1.6, 1.0, COL('#5a8ab8'));
    const au = boite(2.2, 0.08, 0.6, COL('#e8eaee')); au.rotation.x = 0.15; G.add(at(au, cx, 1.12, d + 0.3));
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
  /** toit courbe de pagode (octogonal, profil concave qui se relève au bord) : rayon r au bord, hauteur hr */
  function toitCourbe(G, cx, cz, y, r, hr, col, bord, k = 0.3) {
    // profil concave (f = 0 au bord, 1 au sommet) : la pente se creuse puis se relève en lèvre au bord
    const pts = [], n = 14;
    for (let i = 0; i <= n; i++) {
      const f = i / n, rr = r * (1 - f * (1 - k)), yy = hr * Math.pow(f, 1.7) + (i === 0 ? 0.14 : i === 1 ? 0.03 : 0);
      pts.push(new THREE.Vector2(rr, yy));
    }
    pts.reverse();
    const g = new THREE.LatheGeometry(pts, 8, Math.PI / 8);
    const tx = TX.canal(col).clone(); tx.repeat.set(r * 8 * 0.9, Math.hypot(r, hr) * 1.1); tx.needsUpdate = true;
    const m = new THREE.Mesh(g, M({ map: tx, side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true;
    G.add(at(m, cx, y, cz));
    // rive dorée et crochets relevés aux huit coins
    const rive = new THREE.Mesh(new THREE.TorusGeometry(r * Math.cos(Math.PI / 8) / Math.cos(Math.PI / 8), 0.07, 4, 8, Math.PI * 2), COL(bord));
    rive.rotation.x = Math.PI / 2; rive.rotation.z = Math.PI / 8; G.add(at(rive, cx, y - 0.04, cz));
    for (let i = 0; i < 8; i++) {
      const th = Math.PI / 8 + i * Math.PI / 4 + Math.PI / 8, x = Math.sin(th) * r, z = Math.cos(th) * r;
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 4, 6, Math.PI / 2), COL(bord));
      c.rotation.y = th + Math.PI / 2; c.castShadow = true; G.add(at(c, cx + x * 1.02, y + 0.12, cz + z * 1.02));
    }
  }
  const pagodeMur = (bois) => tex('pagodeMur' + bois, 2 * D, 2 * D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lx = x % w, pil = lx < 5 * S || lx >= w - 5 * S, fy = y / h;
      let c = pil ? bois : fy < 0.1 || fy > 0.86 ? mix(bois, -0.35) : (x % (6 * S) < S || y % (6 * S) < S ? '#7a4424' : '#f2e8d0');
      if (pil && (lx === Math.round(2 * S) || lx === w - Math.round(3 * S))) c = mix(bois, 0.2);
      px(x, y, c);
    }
  });
  /** pagode monumentale (Tour de la Grue, façon Tour Carillon de Ho-Oh) : emprise 9 × 9, grand perron, sept étages
   *  octogonaux à balcons, toits courbes verts aux crochets dorés, flèche ; porte de 2 cases */
  B.pagode = ({ etages = 7, toit = '#3a8a72', bord = '#e8c060', bois = '#b0442e' } = {}) => {
    const G = new THREE.Group(), w = 9, cx = 4.5, cz = 4.5;
    // socle à deux gradins et grand escalier
    G.add(at(boite(w, 0.45, w, M({ map: TX.pierre('#b8b0a0') })), cx, 0.22, cz));
    G.add(at(boite(w - 1.2, 0.45, w - 1.2, M({ map: TX.pierre('#c4bcac') })), cx, 0.67, cz));
    for (let k = 0; k < 5; k++) G.add(at(boite(2.6, 0.18, 0.3, M({ map: TX.pierre('#c4bcac') })), cx, 0.09 + (4 - k) * 0.18, w - 0.6 + k * 0.3 - 1.0 + 0.95));
    for (const s of [-1, 1]) { G.add(at(boite(0.5, 1.2, 0.5, M({ map: TX.pierre('#9a948a') })), cx + s * 1.6, 0.6, w + 0.1)); G.add(at(boite(0.34, 0.3, 0.34, LUM('#fff0b0', '#806020')), cx + s * 1.6, 1.35, w + 0.1)); }
    let y = 0.9, r = 3.4;
    for (let k = 0; k < etages; k++) {
      const h = k === 0 ? 2.4 : 1.5;
      const mur = pagodeMur(bois).clone(); mur.repeat.set(8, 1); mur.needsUpdate = true;
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8, 1, false, Math.PI / 8), M({ map: mur })); tw.castShadow = tw.receiveShadow = true;
      G.add(at(tw, cx, y + h / 2, cz));
      if (k === 0) {
        G.add(at(boite(1.7, 1.9, 0.06, M({ map: TX.bois('#4a2414') })), cx, y + 0.95, cz + r * Math.cos(Math.PI / 8) + 0.02));
        G.add(at(boite(2.1, 0.16, 0.12, COL(bord)), cx, y + 1.95, cz + r * Math.cos(Math.PI / 8) + 0.05));
      } else {
        // balcon : plancher et garde-corps tout autour
        const bal = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.45, r + 0.45, 0.12, 8, 1, false, Math.PI / 8), COL('#6a2a1a')); bal.castShadow = true; G.add(at(bal, cx, y + 0.06, cz));
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.42, r + 0.42, 0.35, 8, 1, true, Math.PI / 8), M({ map: TX.laque('#8a2a1a'), side: THREE.DoubleSide, transparent: false })); G.add(at(rail, cx, y + 0.3, cz));
      }
      y += h;
      toitCourbe(G, cx, cz, y, r + (k === 0 ? 1.6 : 1.15), k === 0 ? 1.4 : 1.1, toit, bord);
      y += k === 0 ? 0.8 : 0.6; r *= 0.86;
    }
    // flèche : anneaux dorés, perle
    G.add(at(cyl(0.1, 0.18, 2.6, COL(bord)), cx, y + 1.3, cz));
    for (let i = 0; i < 7; i++) G.add(at(cyl(0.34 - i * 0.03, 0.34 - i * 0.03, 0.09, COL(bord), 12), cx, y + 0.4 + i * 0.3, cz));
    const perle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), LUM('#f8e8a0', '#806020')); G.add(at(perle, cx, y + 2.8, cz));
    return G;
  };
  /** pavillon (7 × 5, temple à deux toits) : estrade, piliers rouges, double toit à coins relevés, portes coulissantes de 2 cases */
  B.pavillon = ({ toit = '#7a3a2a', bord = '#e8c060' } = {}) => {
    const G = new THREE.Group(), w = 7, d = 5, cx = 3.5, cz = 2.5;
    G.add(at(boite(w + 0.2, 0.5, d + 0.2, M({ map: TX.pierre('#b4ae9e') })), cx, 0.25, cz));
    G.add(at(boite(w - 1, 1.7, d - 1.2, M({ map: TX.shoji() })), cx, 0.5 + 0.85, cz - 0.2));
    for (let i = 0; i < 6; i++) G.add(at(boite(0.2, 1.7, 0.2, COL('#c03a2a')), 0.6 + i * 1.16, 1.35, d - 0.5));
    G.add(at(boite(w - 0.6, 0.18, 0.2, COL('#c03a2a')), cx, 2.2, d - 0.5));
    G.add(at(boite(1.7, 1.5, 0.03, M({ map: TX.bois('#5a2a1a') })), cx, 1.25, cz + (d - 1.2) / 2 - 0.19));
    toitPagode(G, cx, cz, 2.3, 3.0, 1.3, toit, bord);
    G.add(at(boite(w - 2.6, 0.8, d - 2.4, M({ map: TX.laque('#c03a2a') })), cx, 3.3 + 0.4, cz));
    for (let i = 0; i < 4; i++) G.add(at(boite(0.5, 0.4, 0.03, M({ map: TX.shoji() })), cx - 1.2 + i * 0.8, 3.75, cz + (d - 2.4) / 2 + 0.01));
    toitPagode(G, cx, cz, 4.1, 2.2, 1.2, toit, bord);
    G.add(at(boite(1.6, 0.16, 0.2, COL(bord)), cx, 5.2, cz));
    for (const s of [-1, 1]) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), COL(bord)); o.castShadow = true; G.add(at(o, cx + s * 0.8, 5.3, cz)); }
    for (let k = 0; k < 3; k++) G.add(at(boite(2.2 + k * 0.4, 0.17, 0.3, M({ map: TX.pierre('#b4ae9e') })), cx, 0.08 + (2 - k) * 0.17, d + 0.12 + k * 0.28));
    for (const s of [-1, 1]) { G.add(at(boite(0.3, 0.5, 0.3, M({ map: TX.pierre('#9a948a') })), cx + s * 2.0, 0.75, d + 0.3)); G.add(at(boite(0.22, 0.2, 0.22, LUM('#fff0b0', '#806020')), cx + s * 2.0, 1.1, d + 0.3)); }
    return G;
  };
  /** tour de ville (8 × 5, Métropole) : mur-rideau vitré, socle de pierre, marquise et portes de 2 cases, toit technique */
  B.tour = ({ etages = 8, col = '#8a98b0' } = {}) => {
    const G = new THREE.Group(), w = 8, d = 5, H = 1.1 * etages, cx = 4;
    G.add(at(boite(w, 1.6, d, M({ map: TX.pierre('#9a9ca4') })), cx, 0.8, d / 2));
    G.add(at(boite(w - 0.3, H - 1.6, d - 0.3, M({ map: TX.rideau(col) })), cx, 1.6 + (H - 1.6) / 2, d / 2));
    for (const xx of [0, w]) G.add(at(boite(0.3, H, 0.3, COL(col)), xx + (xx ? -0.15 : 0.15), H / 2, d - 0.15));
    G.add(at(boite(w + 0.1, 0.25, d + 0.1, M({ map: TX.tole('#6a7488') })), cx, H + 0.12, d / 2));
    for (const [x, z, ww, dd] of [[cx, 0.05, w + 0.1, 0.1], [cx, d - 0.05, w + 0.1, 0.1], [0.05, d / 2, 0.1, d], [w - 0.05, d / 2, 0.1, d]]) G.add(at(boite(ww, 0.35, dd, COL('#9aa2b4')), x, H + 0.4, z));
    G.add(at(boite(2.0, 0.6, 1.4, COL('#9aa0aa')), cx + 1.5, H + 0.55, 1.6));
    G.add(at(cyl(0.04, 0.04, 1.6, COL('#c8ccd4')), cx - 2.5, H + 0.9, 1.2));
    G.add(at(boite(0.12, 0.12, 0.12, LUM('#ff4040', '#c00000')), cx - 2.5, H + 1.75, 1.2));
    portesVitrees(G, cx, d, 1.7, 1.3, COL('#5a6478'));
    G.add(at(boite(3.0, 0.12, 0.9, COL('#3a4458')), cx, 1.45, d + 0.45));
    for (const s of [-1, 1]) G.add(at(boite(1.5, 0.95, 0.03, M({ map: TX.verre() })), cx + s * 2.7, 0.8, d + 0.01));
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
  maison: [4, 3], maisonLongue: [5, 3], residence: [6, 4], centre: [5, 4], boutique: [4, 4], arene: [7, 5], labo: [6, 4],
  ligue: [9, 6], pagode: [9, 9], pavillon: [7, 5], tour: [8, 5], escalierMontant: [1, 2], escalierDescendant: [1, 2],
};
