// odyssee/js/render/maisons-villes.js — maisons des villes, une architecture par ville (styles-villes.js choisit les
// réglages). Ajoute au générateur de bâtiments (atelier() de batiments3d.js) le modèle « maisonVille » : une maison
// réglable qui tient dans n'importe quelle emprise de maison du jeu (w × d cases, porte d'une case sur la façade sud),
// et les textures qui manquaient (granit, moellons, chaume, lauzes, adobe, colombages normands et basques…).
//
// Réglages (o) — tous facultatifs sauf l'emprise :
//   w, d, px            emprise et milieu de la porte (en cases)
//   prof, recul         profondeur du corps de logis, recul de la façade (porche devant)
//   et, he, socle       nombre de niveaux, hauteur d'un niveau, hauteur du soubassement
//   mur { t, c, c2 }    t : enduit | pierre | granit | moellons | colombage | normand | basque | brique | bardage |
//                       planches | rondins | adobe | panneaux | koshi ; c, c2 : couleurs (mur, bois)
//   haut { t, c, c2 }   mur des étages s'il diffère du rez-de-chaussée (pierre en bas, bois en haut…)
//   chaine              couleur des chaînes d'angle (pierre), encadrements des fenêtres
//   toit { f, m, c, hr, deb, zr, faite }
//                       f : 2p (faîtage parallèle à la rue) | rue (pignon sur rue) | asym (pignon sur rue, faîtage
//                       décalé) | 4p | plat | mansarde | jap ; m : ardoise | tuiles | canal | bardeaux | tole | chaume |
//                       lauze | neige | zinc | kawara
//   fen { t, cadre, volets, rideau, fleurs, linteau }  t : std | arc | ogive | petite | baie | shoji | hublot
//   porte { c, cadre, t } t : simple | arc | double | coulissante
//   chem [[x, col]]     cheminées (x en cases, 'g' / 'd' : sur le pignon gauche / droit)
//   lucarnes            nombre de lucarnes sur le pan avant (toits 2p et mansarde)
//   av                  avancée : auvent | porche | veranda | perron | balcon | galerie | engawa | pergola | bowindow |
//                       marquise | serre | hisashi
//   pilotis             hauteur des pilotis (maison du marais), escalier jusqu'au sol devant la porte
//   annexe { cote, w, t, c, toit }  appentis sur le côté (atelier, remise, garage)
//   orn [ … ]           ornements : filet, bouee, casiers, rames, lanternes, noren, bonsai, bambou, cactus, jarres,
//                       poutres, solaire, antenne, parabole, clim, neon, tuyaux, chemMetal, rosier, glycine, lierre,
//                       pots, banc, bucher, lanterneFer, gargouille, dome, bougainvillee, dragon, velo, tonneaux, enseigne
import * as THREE from 'three';

export function maisonsVilles(K) {
  const { B, TX, tex, hash, mix, S, D, boite, at, M, COL, LUM, cyl, fenetre2, fenArc, porte, portesVitrees, toit4, toitChinois, cheminee, balustrade, bucher, socle } = K;

  /* ------------------------------------------------------------------ textures ------------------------------------ */
  /** granit : gros blocs irréguliers, grain moucheté, joints clairs (granit gris ou rose des côtes bretonnes) */
  TX.granit = (col = '#a8a8a4') => tex('gr' + col, D, D, (g, px, w, h) => {
    const rows = [0, 9 * S, 16 * S, 25 * S, h];
    for (let r = 0; r < rows.length - 1; r++) {
      const y0 = rows[r], y1 = rows[r + 1], off = Math.floor(hash(r, 3, 70) * 12 * S);
      for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
        const xx = (x + off) % w, bw = (hash(r, 5, 71) < 0.5 ? 11 : 15) * S, k = Math.floor(xx / bw), lx = xx % bw;
        const id = hash(k, r, 72), gr = hash(x, y, 73);
        let f = (id - 0.5) * 0.22 + (gr < 0.12 ? -0.16 : gr > 0.9 ? 0.16 : 0);
        if (y === y0 || lx === 0) f = 0.3; else if (y === y1 - 1 || lx === bw - 1) f = -0.32;
        px(x, y, mix(col, f));
      }
    }
  });
  /** moellons : pierres irrégulières en cellules (murs de montagne, basalte, lauzes de mur) */
  TX.moellons = (col = '#9a948a') => tex('mo' + col, D, D, (g, px, w, h) => {
    const N = 4, P = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) P.push([(i + 0.2 + hash(i, j, 74) * 0.6) * w / N, (j + 0.2 + hash(i, j, 75) * 0.6) * h / N, hash(i, j, 76)]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 1e9, b = 1e9, ia = 0;
      for (const [k, [qx, qy]] of P.entries()) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { const dd = (x - qx - ox) ** 2 + ((y - qy - oy) * 1.4) ** 2; if (dd < a) { b = a; a = dd; ia = k; } else if (dd < b) b = dd; }
      const e = Math.sqrt(b) - Math.sqrt(a);
      let f = (P[ia][2] - 0.5) * 0.3 + (hash(x, y, 77) < 0.08 ? -0.1 : 0);
      if (e < 1.2 * S) f = -0.42; else if (e < 2.2 * S) f += 0.14;
      px(x, y, mix(col, f));
    }
  });
  /** adobe / terre crue : enduit épais, taches et petites fissures */
  TX.adobe = (col = '#d8a870') => tex('ad' + col, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = hash(x >> 3, y >> 3, 78) * 0.5 + hash(x >> 1, y >> 1, 79) * 0.5;
      let f = (n - 0.5) * 0.12; if (hash(x, y, 80) < 0.04) f -= 0.1;
      if (Math.abs(((x * 0.6 + y) % 23) - 11) < 0.5 && hash(x >> 2, y >> 2, 81) < 0.15) f -= 0.25;
      px(x, y, mix(col, f));
    }
  });
  /** chaume : bottes de roseaux, stries dans la pente, bord inférieur ondulé de chaque rang */
  TX.chaume = (col = '#b89a5a') => tex('ch' + col, D, D, (g, px, w, h) => {
    const rh = 11 * S;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / rh), ly = y % rh, ond = Math.sin((x + row * 7) / (3 * S)) * 1.5 * S;
      let f = (hash(x, row, 82) - 0.5) * 0.28 + (x % 2 ? -0.04 : 0.04);
      if (ly > rh - 2.5 * S + ond) f -= 0.3; else if (ly < 2 * S) f += 0.1;
      px(x, y, mix(col, f));
    }
  });
  /** lauzes : dalles de pierre en rangs irréguliers (toits de montagne) */
  TX.lauze = (col = '#7a7874') => tex('lz' + col, D, D, (g, px, w, h) => {
    const rh = 8 * S;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / rh), ly = y % rh, off = Math.floor(hash(row, 1, 83) * 16 * S), tw = (9 + Math.floor(hash(row, 2, 84) * 6)) * S;
      const xx = x + off, k = Math.floor(xx / tw), lx = xx % tw;
      let f = (hash(k, row, 85) - 0.5) * 0.3; if (ly >= rh - 1.5 * S) f = -0.4; else if (lx < S) f -= 0.3; else if (ly < S) f += 0.15;
      if (hash(x, y, 86) < 0.05) f += 0.12;
      px(x, y, mix(col, f));
    }
  });
  /** lauzes sous la neige : la neige couvre le haut de chaque rang, les bords des dalles dépassent */
  TX.neige = (col = '#7a7874') => tex('ng' + col, D, D, (g, px, w, h) => {
    const rh = 8 * S;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / rh), ly = y % rh, bord = rh - 2.5 * S + Math.sin((x + row * 5) / (2.5 * S)) * S;
      px(x, y, ly > bord ? mix(col, ly >= rh - S ? -0.35 : 0) : ly < S ? '#ffffff' : hash(x, y, 87) < 0.1 ? '#dfe8f2' : '#f2f6fa');
    }
  });
  /** gravier / bitume des toits plats : grain fin, quelques taches */
  TX.gravier = (col = '#8a9098') => tex('gv' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = hash(x, y, 100), v = hash(x >> 3, y >> 3, 101); px(x, y, mix(col, (u < 0.15 ? -0.12 : u > 0.88 ? 0.1 : 0) + (v - 0.5) * 0.08)); } });
  /** zinc : bandes de métal gris à joints debout (mansardes, toits de ville) */
  TX.zinc = (col = '#8a929a') => tex('zn' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lx = x % (8 * S); px(x, y, mix(col, lx < S ? 0.3 : lx < 2 * S ? -0.25 : hash(x >> 2, y >> 3, 88) < 0.1 ? 0.06 : 0)); } });
  /** tuiles japonaises (kawara) : rangs de tuiles rondes gris sombre, bord de chaque rang marqué */
  TX.kawara = (col = '#4a4e58') => tex('kw' + col, D, D, (g, px, w, h) => {
    const tw = 5 * S, rh = 6 * S;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lx = x % tw, ly = y % rh; let f = lx < S ? -0.4 : lx < 2 * S ? 0.25 : lx > tw - S ? -0.2 : 0.05;
      if (ly >= rh - S) f = -0.45; else if (ly >= rh - 2 * S && (lx < 2 * S)) f = 0.35;
      px(x, y, mix(col, f));
    }
  });
  /** colombages normands : colombes verticales serrées, sablières, quelques écharpes */
  TX.normand = (mur = '#f0e2c4', bois = '#4a2e1c') => tex('nm' + mur + bois, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lx = x % (8 * S), dg = Math.abs((x - (h - y) * 0.5) % (16 * S));
      let c = hash(x, y, 89) < 0.05 ? mix(mur, -0.06) : mur;
      if (lx < 2.5 * S || y < 2 * S || y >= h - 2 * S || (dg < 2.2 * S && x < 16 * S && y > 2 * S)) c = hash(x >> 1, y >> 2, 90) < 0.2 ? mix(bois, 0.15) : bois;
      px(x, y, c);
    }
  });
  /** colombages basques : enduit blanc, poteaux et sablières épais peints (rouge basque, vert) */
  TX.basque = (mur = '#f6f2ea', bois = '#a0282a') => tex('bq' + mur + bois, D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = hash(x, y, 91) < 0.04 ? mix(mur, -0.05) : mur;
      if (x < 3 * S || y < 3 * S) c = mix(bois, hash(x >> 2, y >> 2, 93) < 0.2 ? 0.12 : 0);
      px(x, y, c);
    }
  });
  /** treillis de bois sombre à barreaux serrés (rez-de-chaussée des machiya) */
  TX.koshi = (col = '#4a3020') => tex('ko' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lx = x % (4 * S); px(x, y, lx < 2 * S ? mix(col, lx < S ? 0.15 : 0) : y % (16 * S) < S ? col : '#1e1610'); } });
  /** namako : carreaux sombres à joints blancs en losange (bas des murs des réserves japonaises) */
  TX.namako = (col = '#3a3e46') => tex('nk' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = (x + y) % (16 * S), b = (x - y + 64 * S) % (16 * S); px(x, y, a < 2 * S || b < 2 * S ? '#f2f0ea' : mix(col, hash(Math.floor((x + y) / (16 * S)), Math.floor((x - y + 64 * S) / (16 * S)), 94) * 0.2 - 0.1)); } });
  /** tôle ondulée (ateliers, cabanes du marais), rouille en coulures */
  TX.ondulee = (col = '#8a8a86') => tex('od' + col, D, D, (g, px, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lx = x % (4 * S); let f = lx < S ? 0.22 : lx < 2 * S ? 0.06 : lx < 3 * S ? -0.1 : -0.22; let c = mix(col, f); if (hash(x >> 2, 0, 95) < 0.25 && hash(x, y >> 2, 96) < 0.5 - y / h * 0.4) c = mix('#8a4a2a', f); px(x, y, c); } }, true);

  const matMur = ({ t = 'enduit', c = '#f2e6c8', c2 = '#5a3a26' } = {}) => {
    const T = { enduit: () => TX.enduit(c), pierre: () => TX.pierre(c), granit: () => TX.granit(c), moellons: () => TX.moellons(c), colombage: () => TX.colombage(c, c2), normand: () => TX.normand(c, c2),
      basque: () => TX.basque(c, c2), brique: () => TX.brique(c), bardage: () => TX.bardage(c), planches: () => TX.planches(c), rondins: () => TX.rondins(c), adobe: () => TX.adobe(c),
      panneaux: () => TX.panneaux(c), koshi: () => TX.koshi(c), namako: () => TX.namako(c), ondulee: () => TX.ondulee(c) };
    return M({ map: (T[t] || T.enduit)() });
  };
  const matToit = (m, c) => {
    const T = { ardoise: TX.ardoise, tuiles: TX.tuiles, canal: TX.canalPetit, bardeaux: TX.bardeaux, tole: TX.ondulee, chaume: TX.chaume, lauze: TX.lauze, neige: TX.neige, zinc: TX.zinc, kawara: TX.kawara };
    return M({ map: (T[m] || TX.tuiles)(c) });
  };

  /* ------------------------------------------------------------------ toits --------------------------------------- */
  /** toit à deux pans, faîtage le long de x à la profondeur zr (zr au milieu : symétrique), débord deb, pignons en mP */
  function pans(G, x0, x1, z0, z1, y, hr, zr, mT, mP, deb, faite, ep = 0.1) {
    const wx = x1 - x0 + 2 * deb, cx = (x0 + x1) / 2;
    const pan = (za, ya, zb, yb) => { const L = Math.hypot(zb - za, yb - ya), a = Math.atan2(yb - ya, zb - za); const p = boite(wx, ep, L, mT); p.rotation.x = -a; G.add(at(p, cx, (ya + yb) / 2 + ep / 2, (za + zb) / 2)); };
    const yt = y + hr, pente1 = hr / (z1 - zr), pente0 = hr / (zr - z0);
    pan(zr, yt, z1 + deb, y - deb * pente1);     // pan avant
    pan(z0 - deb, y - deb * pente0, zr, yt);     // pan arrière
    G.add(at(boite(wx, 0.12, 0.16, COL(faite)), cx, yt + 0.08, zr));
    for (const [xx, s] of [[x0 + 0.01, -1], [x1 - 0.01, 1]]) {
      const sh = new THREE.Shape(), u = (z) => (s < 0 ? z : -z);
      sh.moveTo(u(z0), 0); sh.lineTo(u(z1), 0); sh.lineTo(u(zr), hr); sh.closePath();
      const gm = new THREE.Mesh(new THREE.ShapeGeometry(sh), mP); gm.rotation.y = s * Math.PI / 2; gm.position.set(xx, y, 0); gm.castShadow = true; G.add(gm);
    }
    // rives (bordure des pignons), un peu plus sombres
    const rive = COL(mix(faite, 0.1));
    for (const xx of [x0 - deb, x1 + deb]) for (const [za, ya, zb, yb] of [[zr, yt, z1 + deb, y - deb * pente1], [z0 - deb, y - deb * pente0, zr, yt]]) {
      const L = Math.hypot(zb - za, yb - ya), a = Math.atan2(yb - ya, zb - za), r = boite(0.1, 0.14, L, rive); r.rotation.x = -a; G.add(at(r, xx, (ya + yb) / 2 + 0.07, (za + zb) / 2));
    }
  }
  /** même toit, pignon sur rue (faîtage nord-sud) ; xr : abscisse du faîtage */
  function pansRue(G, x0, x1, z0, z1, y, hr, xr, mT, mP, deb, faite) {
    const R = new THREE.Group(); R.rotation.y = Math.PI / 2; G.add(R);
    // repère tourné : x local = -z monde, z local = x monde
    pans(R, -z1, -z0, x0, x1, y, hr, xr, mT, mP, deb, faite);
    return R;
  }
  /** toit à la Mansart : brisis presque vertical puis terrasson en pente douce, faîtage le long de x */
  function mansarde(G, x0, x1, z0, z1, y, h1, h2, mT, mB, deb = 0.15) {
    const a = (z1 - z0) / 2 + deb, sh = new THREE.Shape();
    sh.moveTo(-a, 0); sh.lineTo(-a + 0.35, h1); sh.lineTo(-0.15, h1 + h2); sh.lineTo(0.15, h1 + h2); sh.lineTo(a - 0.35, h1); sh.lineTo(a, 0); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0 + 2 * deb, bevelEnabled: false });
    const m = new THREE.Mesh(g, [mB, mT]); m.castShadow = m.receiveShadow = true; m.rotation.y = Math.PI / 2; m.position.set(x0 - deb, y, (z0 + z1) / 2); G.add(m);
    G.add(at(boite(x1 - x0 + 2 * deb + 0.06, 0.12, 2 * a + 0.06, COL('#d8d0c0')), (x0 + x1) / 2, y + 0.04, (z0 + z1) / 2));   // corniche
  }

  /* ------------------------------------------------------------------ fenêtres, portes ----------------------------- */
  function fen(G, x, y, z, w, h, F = {}) {
    const t = F.t || 'std';
    if (t === 'arc' || t === 'ogive') {
      fenArc(G, x, y - w / 4, z, w, h - w / 2, M({ map: TX.pierre(F.linteau || '#d8ccb4') }), M({ map: t === 'ogive' && F.lueur ? TX.vitrail(F.lueur) : TX.vitreRideau(F.rideau || '#f0e0c0') }));
      if (F.volets) for (const s of [-1, 1]) G.add(at(boite(w * 0.45, h - 0.1, 0.05, COL(F.volets)), x + s * (w / 2 + w * 0.27), y - 0.05, z + 0.03));
      return;
    }
    if (t === 'baie') {
      G.add(at(boite(w, h, 0.02, M({ map: TX.verre() })), x, y, z + 0.005));
      for (const [dx, dy, ww, hh] of [[0, h / 2, w + 0.08, 0.05], [0, -h / 2, w + 0.08, 0.05], [-w / 2, 0, 0.05, h], [w / 2, 0, 0.05, h], [0, 0, 0.04, h]]) G.add(at(boite(ww, hh, 0.06, COL(F.cadre || '#3a4048')), x + dx, y + dy, z + 0.03));
      return;
    }
    if (t === 'shoji') {
      G.add(at(boite(w, h, 0.02, M({ map: TX.shoji() })), x, y, z + 0.005));
      for (const [dx, dy, ww, hh] of [[0, h / 2, w + 0.1, 0.06], [0, -h / 2, w + 0.1, 0.06], [-w / 2, 0, 0.06, h], [w / 2, 0, 0.06, h]]) G.add(at(boite(ww, hh, 0.06, COL(F.cadre || '#3a2414')), x + dx, y + dy, z + 0.03));
      return;
    }
    if (t === 'hublot') {
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(w / 2, 14), M({ map: TX.verre() })), x, y, z + 0.01));
      G.add(at(new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.02, 0.05, 5, 14), COL(F.cadre || '#f4f0e6')), x, y, z + 0.03));
      return;
    }
    if (t === 'petite') { w *= 0.75; h *= 0.8; }
    fenetre2(G, x, y, z, w, h, { cadre: F.cadre, rideau: F.rideau, volets: F.volets || null, fleurs: F.fleurs || null, linteau: F.linteau });
  }
  function portee(G, x, z, y0, P = {}, larg = 0.78, marches = true) {
    if (!marches && y0 > 0) { const R = new THREE.Group(); R.position.y = y0; G.add(R); return portee(R, x, z, 0, P, larg); }   // pilotis : l'escalier de bois remplace les marches de pierre
    const t = P.t || 'simple', bois = M({ map: TX.planches(P.c || '#7a4a2a') }), cadre = COL(P.cadre || '#5a3a24');
    if (t === 'double' || t === 'coulissante') {
      if (t === 'coulissante') portesVitrees(G, x, z, 1.0, 1.25, cadre);
      else { porte(G, x, z, y0, 1.25, bois, cadre, 0.95); G.add(at(boite(0.03, 1.2, 0.04, COL(mix(P.c || '#7a4a2a', -0.4))), x, y0 + 0.6, z + 0.03)); }
      return;
    }
    porte(G, x, z, y0, 1.12, bois, cadre, larg);
    if (t === 'arc') {
      G.add(at(new THREE.Mesh(new THREE.CircleGeometry(larg / 2, 12, 0, Math.PI), bois), x, y0 + 1.12, z + 0.012));
      G.add(at(new THREE.Mesh(new THREE.TorusGeometry(larg / 2 + 0.06, 0.07, 4, 12, Math.PI), cadre), x, y0 + 1.12, z + 0.04));
    }
  }

  /* ------------------------------------------------------------------ ornements ----------------------------------- */
  const vert = (k = 0) => COL(['#3c8c3c', '#2c6e30', '#4a9a44'][k % 3]);
  function grimpante(G, x, y0, y1, z, fleur, n = 7, larg = 0.5) {
    for (let i = 0; i < n; i++) {
      const yy = y0 + (y1 - y0) * i / (n - 1), xx = x + Math.sin(i * 1.7) * larg * 0.4;
      G.add(at(boite(0.22 + (i % 3) * 0.06, 0.2, 0.08, vert(i)), xx, yy, z + 0.05));
      if (fleur && i % 2 === 0) G.add(at(boite(0.08, 0.08, 0.06, COL(fleur)), xx + ((i % 4) - 1.5) * 0.06, yy + 0.06, z + 0.1));
    }
  }
  function orner(G, o, L, ctx) {
    const { bx0, bx1, zf, Hm, y0, px, et, he, toitY, cote } = ctx;
    const libreX = (pref) => { const c = [bx0 + 0.45, bx1 - 0.45, bx0 + 0.9, bx1 - 0.9].filter((x) => Math.abs(x - px) > 0.8); return pref === 'g' ? c[0] : pref === 'd' ? c.reverse()[0] : c[0] ?? bx0 + 0.4; };
    for (const k of L) {
      if (k === 'filet') {   // filet de pêche tendu sur la façade, flotteurs
        const x = libreX('d'); G.add(at(boite(0.9, 0.7, 0.02, M({ map: TX.treillis('#5a4a3a'), transparent: true, opacity: 0.85 })), x, y0 + 0.9, zf + 0.06));
        for (let i = 0; i < 3; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), COL(['#e8a020', '#e83a3a', '#f4f2ea'][i])), x - 0.3 + i * 0.3, y0 + 1.25, zf + 0.08));
      } else if (k === 'bouee') {
        const x = libreX('g'), b = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 6, 14), COL('#e8463a')); G.add(at(b, x, y0 + 1.0, zf + 0.06));
        for (let i = 0; i < 4; i++) { const s = boite(0.06, 0.07, 0.07, COL('#f4f2ea')); G.add(at(s, x + Math.cos(i * Math.PI / 2 + 0.78) * 0.17, y0 + 1.0 + Math.sin(i * Math.PI / 2 + 0.78) * 0.17, zf + 0.1)); }
      } else if (k === 'casiers') {   // casiers à homards empilés
        const x = cote === 'g' ? bx0 - 0.25 : bx1 + 0.25;
        for (const [dx, dy] of [[0, 0], [0.42, 0], [0.2, 0.32]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8, 1, false, 0, Math.PI), M({ map: TX.treillis('#7a5a3a'), side: THREE.DoubleSide })); c.rotation.z = Math.PI / 2; c.castShadow = true; G.add(at(c, x - (cote === 'g' ? 0.2 : -0.2) + (cote === 'g' ? -dx : dx) * 0.5, 0.02 + dy, zf - 0.4 + dx)); }
      } else if (k === 'rames') {
        const x = libreX('d') + 0.35; for (const dx of [0, 0.14]) { const r = boite(0.06, 1.3, 0.08, M({ map: TX.bois('#c8a070') })); r.rotation.z = -0.12; G.add(at(r, x + dx, 0.7, zf + 0.12)); }
      } else if (k === 'lanternes') {   // lanternes de papier rouges
        for (const x of [px - 0.62, px + 0.62]) { G.add(at(cyl(0.13, 0.13, 0.3, LUM('#e0402a', '#701808'), 8), x, y0 + 1.25, zf + 0.15)); for (const dy of [0.16, -0.16]) G.add(at(cyl(0.08, 0.08, 0.04, COL('#2a2020'), 8), x, y0 + 1.25 + dy, zf + 0.15)); }
      } else if (k === 'noren') {   // rideau fendu au-dessus de la porte
        for (let i = 0; i < 3; i++) G.add(at(boite(0.27, 0.42, 0.02, COL(ctx.noren || '#2a3a6a')), px - 0.28 + i * 0.28, y0 + 1.0, zf + 0.06));
        G.add(at(boite(0.95, 0.04, 0.04, COL('#3a2a1a')), px, y0 + 1.22, zf + 0.07));
      } else if (k === 'bonsai') {
        const x = libreX('g'); G.add(at(boite(0.4, 0.15, 0.3, COL('#5a4a40')), x, 0.08, zf + 0.35));
        G.add(at(cyl(0.03, 0.05, 0.3, COL('#5a3a20'), 5), x, 0.3, zf + 0.35));
        for (const [dx, dy, r] of [[-0.12, 0.42, 0.15], [0.12, 0.5, 0.13], [0, 0.6, 0.1]]) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), vert(1)), x + dx, dy, zf + 0.35));
      } else if (k === 'bambou') {
        const x = cote === 'g' ? bx0 - 0.15 : bx1 + 0.15;
        for (let i = 0; i < 5; i++) { const h = 1.6 + hash(i, 3, 97) * 0.8; G.add(at(cyl(0.035, 0.035, h, COL(i % 2 ? '#6aa04a' : '#5a8a3a'), 5), x + (i - 2) * 0.09 * (cote === 'g' ? -1 : 1), h / 2, zf - 0.3 + (i % 3) * 0.2)); G.add(at(boite(0.3, 0.12, 0.05, vert(i)), x + (i - 2) * 0.09, h, zf - 0.3 + (i % 3) * 0.2)); }
      } else if (k === 'cactus') {
        const x = cote === 'g' ? bx0 - 0.2 : bx1 + 0.2, C = COL('#5a8a4a');
        G.add(at(cyl(0.12, 0.13, 1.0, C, 8), x, 0.5, zf + 0.2));
        for (const s of [-1, 1]) { G.add(at(cyl(0.07, 0.07, 0.25, C, 6), x + s * 0.17, 0.55 + s * 0.1, zf + 0.2)); G.add(at(cyl(0.07, 0.07, 0.3, C, 6), x + s * 0.24, 0.72 + s * 0.1, zf + 0.2)); }
      } else if (k === 'jarres') {
        const x = libreX('d');
        for (const [dx, r, c] of [[0, 0.2, '#b8683a'], [0.38, 0.15, '#c87a48'], [-0.3, 0.13, '#a85a30']]) { const j = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [r * 0.6, 0], [r, r * 0.9], [r * 0.9, r * 1.7], [r * 0.45, r * 2.1], [r * 0.5, r * 2.3]].map(([a, b]) => new THREE.Vector2(a, b)), 10), COL(c)); j.castShadow = true; G.add(at(j, x + dx, 0, zf + 0.35)); }
      } else if (k === 'poutres') {   // vigas : bouts de poutres qui dépassent sous le toit plat
        for (let x = bx0 + 0.35; x < bx1 - 0.2; x += 0.62) { const p = cyl(0.07, 0.07, 0.45, COL('#6a4428'), 6); p.rotation.x = Math.PI / 2; G.add(at(p, x, Hm - 0.25, zf + 0.15)); }
      } else if (k === 'solaire') {   // panneaux solaires sur le toit
        const n = Math.max(1, Math.floor((bx1 - bx0 - 0.6) / 1.1));
        for (let i = 0; i < n; i++) { const p = boite(0.95, 0.05, 1.2, M({ map: TX.panneauSolaire() })); p.rotation.x = -0.35; G.add(at(p, bx0 + 0.6 + i * 1.1 + 0.4, toitY + 0.45, ctx.zc)); G.add(at(boite(0.05, 0.4, 0.05, COL('#8a9098')), bx0 + 0.6 + i * 1.1 + 0.4, toitY + 0.2, ctx.zc - 0.4)); }
      } else if (k === 'antenne') {
        const x = bx0 + 0.6; G.add(at(cyl(0.025, 0.025, 1.2, COL('#5a6068'), 4), x, ctx.faite + 0.5, ctx.zc));
        for (let i = 0; i < 3; i++) G.add(at(boite(0.6 - i * 0.12, 0.03, 0.03, COL('#5a6068')), x, ctx.faite + 0.75 + i * 0.18, ctx.zc));
      } else if (k === 'parabole') {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3), COL('#e4e6ea')); p.rotation.x = 1.2; G.add(at(p, bx1 - 0.35, y0 + he * et - 0.4, zf + 0.12));
      } else if (k === 'clim') {
        G.add(at(boite(0.5, 0.35, 0.25, COL('#d8dade')), libreX('d'), y0 + 0.55 + (et > 1 ? he : 0), zf + 0.13));
        G.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), COL('#5a6068')), libreX('d') + 0.08, y0 + 0.55 + (et > 1 ? he : 0), zf + 0.26));
      } else if (k === 'neon') {   // bandeau lumineux sous le toit
        G.add(at(boite(bx1 - bx0 - 0.2, 0.06, 0.05, LUM(ctx.neon || '#60e0f0', ctx.neon || '#30b0c8')), (bx0 + bx1) / 2, Hm - 0.12, zf + 0.06));
      } else if (k === 'tuyaux') {
        const x = cote === 'g' ? bx0 + 0.15 : bx1 - 0.15;
        G.add(at(cyl(0.06, 0.06, Hm, COL('#6a6e74'), 6), x, Hm / 2, zf + 0.08));
        const c = cyl(0.06, 0.06, 0.4, COL('#6a6e74'), 6); c.rotation.z = Math.PI / 2; G.add(at(c, x + (cote === 'g' ? 0.2 : -0.2), 0.6, zf + 0.08));
      } else if (k === 'chemMetal') {
        const x = cote === 'g' ? bx0 + 0.6 : bx1 - 0.6;
        G.add(at(cyl(0.12, 0.12, 1.6, COL('#4a4c50'), 8), x, ctx.faite + 0.3, ctx.zc - 0.3));
        G.add(at(cyl(0.18, 0.12, 0.15, COL('#3a3c40'), 8), x, ctx.faite + 1.12, ctx.zc - 0.3));
      } else if (k === 'rosier') {   // rosiers grimpants de part et d'autre de la porte, arche au-dessus
        for (const s of [-1, 1]) grimpante(G, px + s * 0.62, y0 + 0.1, y0 + 1.35, zf + 0.02, ctx.rose || '#f06a8a', 7, 0.3);
        for (let i = 0; i < 5; i++) { const a = Math.PI * i / 4; G.add(at(boite(0.2, 0.18, 0.08, vert(i)), px + Math.cos(a) * 0.62, y0 + 1.35 + Math.sin(a) * 0.3, zf + 0.08)); if (i % 2 === 0) G.add(at(boite(0.08, 0.08, 0.06, COL(ctx.rose || '#f06a8a')), px + Math.cos(a) * 0.62, y0 + 1.42 + Math.sin(a) * 0.3, zf + 0.12)); }
      } else if (k === 'glycine') {   // glycine qui court sous le toit, grappes mauves
        for (let x = bx0 + 0.2; x < bx1 - 0.1; x += 0.3) {
          G.add(at(boite(0.32, 0.14, 0.12, vert(Math.round(x * 3))), x, Hm - 0.15, zf + 0.08));
          if (hash(Math.round(x * 10), 1, 98) < 0.6) G.add(at(boite(0.09, 0.22 + hash(Math.round(x * 10), 2, 98) * 0.15, 0.08, COL(hash(Math.round(x * 10), 3, 98) < 0.5 ? '#a882d8' : '#c4a4ee')), x + 0.05, Hm - 0.35, zf + 0.12));
        }
      } else if (k === 'bougainvillee') {   // bougainvillée sur l'angle de la maison
        const x = cote === 'g' ? bx0 + 0.3 : bx1 - 0.3;
        grimpante(G, x, y0 + 0.2, Hm - 0.1, zf + 0.02, '#d8308a', 8, 0.5);
        for (let i = 0; i < 6; i++) G.add(at(boite(0.14, 0.12, 0.08, COL(i % 2 ? '#e8409a' : '#c0207a')), x + (hash(i, 4, 99) - 0.5) * 0.6, Hm - 0.2 - hash(i, 5, 99) * 0.5, zf + 0.12));
      } else if (k === 'lierre') {
        const x = cote === 'g' ? bx0 + 0.25 : bx1 - 0.25; grimpante(G, x, y0, Hm - 0.1, zf + 0.01, null, 9, 0.6);
      } else if (k === 'pots') {
        for (const [x, c] of [[px - 0.62, '#f05a6a'], [px + 0.62, '#f8d850']]) { G.add(at(cyl(0.14, 0.1, 0.22, COL('#b8603a'), 8), x, 0.11, zf + 0.25)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), vert(1)), x, 0.32, zf + 0.25)); for (let i = 0; i < 3; i++) G.add(at(boite(0.07, 0.07, 0.07, COL(c)), x - 0.08 + i * 0.08, 0.42, zf + 0.33)); }
      } else if (k === 'banc') {
        const x = libreX('g'); G.add(at(boite(0.9, 0.07, 0.28, M({ map: TX.bois('#a8744a') })), x, 0.42, zf + 0.25)); for (const s of [-1, 1]) G.add(at(boite(0.06, 0.4, 0.24, COL('#5a3a22')), x + s * 0.38, 0.2, zf + 0.25));
      } else if (k === 'bucher') bucher(G, cote === 'g' ? bx0 - 0.3 : bx1 + 0.3, zf - 0.6, 3, 1.0);
      else if (k === 'tonneaux') { const x = libreX('d'); for (const dx of [0, 0.45]) G.add(at(cyl(0.2, 0.2, 0.5, M({ map: TX.bois('#8a5a34') }), 10), x + dx - 0.2, 0.25, zf + 0.3)); }
      else if (k === 'lanterneFer') {   // applique de fer forgé, lueur violette
        for (const x of [px - 0.6, px + 0.6]) { G.add(at(boite(0.04, 0.04, 0.22, COL('#1a1820')), x, y0 + 1.25, zf + 0.1)); G.add(at(boite(0.14, 0.22, 0.14, LUM(ctx.lueur || '#b090ff', ctx.lueur || '#6040c0')), x, y0 + 1.12, zf + 0.2)); G.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.12, 4), COL('#1a1820')), x, y0 + 1.28, zf + 0.2)); }
      } else if (k === 'gargouille') {
        for (const x of [bx0 + 0.15, bx1 - 0.15]) { const g = boite(0.12, 0.12, 0.45, COL('#4a4650')); g.rotation.x = -0.4; G.add(at(g, x, Hm - 0.1, zf + 0.15)); G.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), COL('#4a4650')), x, Hm - 0.02, zf + 0.35)); }
      } else if (k === 'dome') {   // petite coupole (sur un toit plat)
        const r = Math.min(0.9, (bx1 - bx0) / 4), x = cote === 'g' ? bx0 + r + 0.25 : bx1 - r - 0.25;
        G.add(at(cyl(r, r, 0.3, M({ map: TX.enduit(ctx.mur || '#f6f4ee') }), 16), x, toitY + 0.15, ctx.zc));
        const d = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), COL(ctx.dome || '#2a62c0')); d.castShadow = true; d.scale.y = 0.5; G.add(at(d, x, toitY + 0.3, ctx.zc));
        G.add(at(cyl(0.03, 0.03, 0.3, COL('#e8e4dc'), 5), x, toitY + 0.3 + r * 0.5 + 0.1, ctx.zc));
      } else if (k === 'dragon') {   // têtes de dragon sculptées au bout du faîtage
        for (const x of [ctx.xr0, ctx.xr1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 5), COL(ctx.dragon || '#b8382a')); t.rotation.z = (x < (bx0 + bx1) / 2 ? 1 : -1) * 0.9; G.add(at(t, x, ctx.faite + 0.25, ctx.zc)); G.add(at(boite(0.06, 0.2, 0.06, COL(ctx.dragon || '#b8382a')), x, ctx.faite + 0.45, ctx.zc)); }
      } else if (k === 'velo') {
        const x = libreX('d'); for (const dx of [-0.25, 0.25]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 4, 12), COL('#2a2a30')); G.add(at(r, x + dx, 0.19, zf + 0.25)); }
        G.add(at(boite(0.5, 0.04, 0.04, COL('#c83a3a')), x, 0.32, zf + 0.25)); G.add(at(boite(0.04, 0.25, 0.04, COL('#c83a3a')), x - 0.08, 0.42, zf + 0.25));
      } else if (k === 'enseigne') {
        const x = px + 0.85; G.add(at(boite(0.05, 0.05, 0.5, COL('#2a2a30')), x, y0 + 1.5, zf + 0.25)); G.add(at(boite(0.4, 0.3, 0.04, M({ map: TX.bois(ctx.enseigne || '#c89a5a') })), x, y0 + 1.3, zf + 0.45));
      }
    }
  }

  /* ------------------------------------------------------------------ la maison ----------------------------------- */
  B.maisonVille = (o = {}) => {
    const G = new THREE.Group();
    const w = o.w || 4, d = o.d || 3, px0 = o.px ?? w / 2;
    const P = o.pilotis || 0, et = o.et || 1, he = o.he || 1.5, so = o.socle ?? 0.3;
    const toit = { f: '2p', m: 'tuiles', c: '#b85a3a', hr: 1.3, deb: 0.3, faite: null, ...(o.toit || {}) };
    const F = o.fen || {}, ann = o.annexe || null;
    // corps de logis : x bx0 → bx1, z z0 → zf (façade) ; l'annexe prend un côté
    let bx0 = 0, bx1 = w;
    if (ann) { if (ann.cote === 'g') bx0 = ann.w; else bx1 = w - ann.w; }
    const recul = o.recul || 0, zf = d - recul, prof = Math.min(o.prof || d, zf), z0 = zf - prof;
    const px = Math.min(bx1 - 0.5, Math.max(bx0 + 0.5, px0));
    const y0 = P + so, Hm = y0 + et * he + (et === 1 ? 0.15 : 0), bw = bx1 - bx0, cx = (bx0 + bx1) / 2, zc = (z0 + zf) / 2;
    const mR = matMur(o.mur), mH = o.haut ? matMur(o.haut) : mR;
    const mRD = M({ map: mR.map, side: THREE.DoubleSide }), mHD = M({ map: mH.map, side: THREE.DoubleSide });
    // soubassement, pilotis
    if (P) {
      // pilotis : la maison est en retrait (recul) ; devant, la plate-forme de planches et l'escalier qui descend jusqu'au
      // bord sud de l'emprise, devant la porte (rien ne dépasse sur la rue)
      const dv = d - zf, PL = M({ map: TX.planches('#8a7a5e') }), BO = COL('#4a3a2a');
      G.add(at(boite(bw + 0.3, 0.02, d - z0 + 0.1, COL('#3a3828')), cx, 0.01, (z0 + d) / 2));   // l'ombre sous la maison
      for (const x of [bx0 + 0.15, cx, bx1 - 0.15]) for (const z of [z0 + 0.15, zf - 0.15, d - 0.12]) G.add(at(cyl(0.08, 0.09, P + 0.05, BO, 6), x, P / 2, z));
      G.add(at(boite(bw + 0.2, 0.12, prof, PL), cx, P, z0 + prof / 2));
      for (const [xa, xb] of [[bx0 - 0.1, px - 0.45], [px + 0.45, bx1 + 0.1]]) if (xb - xa > 0.05) {
        G.add(at(boite(xb - xa, 0.12, dv, PL), (xa + xb) / 2, P, zf + dv / 2));
        balustrade(G, xa + 0.05, d - 0.06, xb - 0.05, d - 0.06, P, COL('#5a4a36'), 0.42, 0.3);
      }
      const n = 4; for (let k = 0; k < n; k++) G.add(at(boite(0.86, P * (n - k) / n, (dv - 0.05) / n, M({ map: TX.bois('#8a7a5e') })), px, P * (n - k) / n / 2, zf + 0.05 + (k + 0.5) * (dv - 0.05) / n));
    }
    if (so > 0.02) G.add(at(boite(bw + 0.08, so, prof + 0.08, M({ map: TX.pierre(o.socleCol || '#a8a090') })), cx, P + so / 2, z0 + prof / 2));
    // murs : rez-de-chaussée, puis les étages
    G.add(at(boite(bw, he + (et === 1 ? 0.15 : 0), prof, mR), cx, y0 + (he + (et === 1 ? 0.15 : 0)) / 2, z0 + prof / 2));
    if (et > 1) {
      G.add(at(boite(bw, Hm - y0 - he, prof, mH), cx, y0 + he + (Hm - y0 - he) / 2, z0 + prof / 2));
      if (o.bandeau !== false) for (let k = 1; k < et; k++) G.add(at(boite(bw + 0.06, 0.1, prof + 0.06, o.haut && k === 1 ? COL(o.bandeau || '#5a3a26') : M({ map: TX.pierre(o.chaine || o.bandeau || '#d4ccb8') })), cx, y0 + k * he, z0 + prof / 2));
    }
    if (o.chaine) for (const x of [bx0 + 0.07, bx1 - 0.07]) for (let y = y0; y < Hm - 0.1; y += 0.36) G.add(at(boite(y % 0.72 < 0.36 ? 0.26 : 0.18, 0.3, 0.16, M({ map: TX.pierre(o.chaine) })), x + (x < cx ? 0.03 : -0.03), y + 0.15, zf - 0.02));
    // fenêtres : emplacements réguliers sur la façade ; au rez-de-chaussée, pas devant la porte
    const fw = F.w || (F.t === 'baie' ? 0.9 : 0.58), fh = F.h || (F.t === 'baie' ? 0.8 : F.t === 'shoji' ? 0.75 : 0.6);
    const n = Math.max(1, Math.round(bw / (F.pas || (F.volets && F.t !== 'baie' ? 1.35 : 1.2))));
    const slots = []; for (let i = 0; i < n; i++) slots.push(bx0 + (i + 0.5) * bw / n);
    for (let k = 0; k < et; k++) {
      const yc = y0 + k * he + he * 0.58;
      for (const x of slots) {
        if (k === 0 && Math.abs(x - px) < (o.av === 'bowindow' ? 0.5 : 0.72)) continue;
        if (k === 0 && o.av === 'bowindow' && Math.abs(x - px) > 0.72 && x === slots.filter((s) => Math.abs(s - px) > 0.72)[0]) continue;
        if (x - fw / 2 < bx0 + 0.12 || x + fw / 2 > bx1 - 0.12) continue;
        const Fk = k === 0 && F.rdc ? { ...F, ...F.rdc } : F;
        fen(G, x, yc, zf, fw * (Fk.t === 'baie' && k === 0 ? 1.2 : 1), fh, { ...Fk, fleurs: Fk.fleurs && (k > 0 || !F.fleursHaut) ? Fk.fleurs : null });
      }
    }
    // porte
    if (o.porte?.t === 'koshi') portee(G, px, zf, y0, { ...o.porte, t: 'coulissante' }, 0.78, !P);
    else portee(G, px, zf, y0, o.porte || {}, 0.78, !P);
    if (o.av === 'perron' || (y0 > 0.4 && !P)) for (let k = 0; k < 3; k++) G.add(at(boite(1.1 - k * 0.1, y0 * (3 - k) / 3, 0.22, M({ map: TX.pierre('#b8b0a0') })), px, y0 * (3 - k) / 6, zf + 0.33 - k * 0.2));
    // toit
    const deb = toit.deb, hr = toit.hr, mT = matToit(toit.m, toit.c), faite = toit.faite || mix(toit.c, -0.35);
    let faiteY = Hm + hr, toitY = Hm, xr0 = bx0, xr1 = bx1;
    if (toit.f === '2p') pans(G, bx0, bx1, z0, zf, Hm, hr, z0 + prof * (toit.zr ?? 0.5), mT, mHD, deb, faite);
    else if (toit.f === 'rue' || toit.f === 'asym') {
      const xr = toit.f === 'asym' ? bx0 + bw * (toit.zr ?? 0.4) : cx;
      pansRue(G, bx0, bx1, z0, zf, Hm, hr, xr, mT, mHD, deb, faite);
      xr0 = xr1 = xr;
      // fenêtre (ou œil-de-bœuf) dans le pignon
      if (hr > 0.9) fen(G, xr, Hm + hr * 0.36, zf + 0.01, Math.min(0.5, bw * 0.14), 0.42, F.pignon || { ...F, t: F.t === 'ogive' ? 'ogive' : F.t === 'baie' ? 'baie' : F.t === 'shoji' ? 'shoji' : 'std', volets: null, fleurs: null });
    } else if (toit.f === '4p') { G.add(toit4(G, cx, zc, Hm - 0.05, bw / 2 + deb, prof / 2 + deb, hr, mT, toit.k ?? 0.3)); xr0 = cx - bw * 0.15; xr1 = cx + bw * 0.15; }
    else if (toit.f === 'mansarde') { mansarde(G, bx0, bx1, z0, zf, Hm, hr * 0.75, hr * 0.3, mT, mHD); faiteY = Hm + hr * 1.05; }
    else if (toit.f === 'jap') { toitChinois(G, cx, zc, Hm, bw / 2 + deb + 0.1, prof / 2 + deb + 0.1, hr, { col: toit.c, rive: toit.rive || '#2a2a30', bord: toit.bord || '#5a5a62', xt: Math.max(0.3, bw / 2 - prof / 2), zt: 0.12, lift: toit.lift ?? 0.25, flare: 0.05, uvk: 0.7, ornement: false }); G.add(at(boite(Math.max(0.6, bw - prof) + 0.2, 0.16, 0.26, COL(toit.faite || '#3a3a42')), cx, Hm + hr + 0.03, zc)); }
    else {   // plat : dalle, acrotère, et parfois une terrasse
      faiteY = Hm + 0.35; toitY = Hm + 0.08;
      G.add(at(boite(bw + 0.12, 0.12, prof + 0.12, M({ map: TX.gravier(toit.c) })), cx, Hm + 0.02, zc));
      // édicule de l'escalier du toit (coin du fond, côté opposé à la porte), parfois une citerne ou des bacs
      if (toit.edicule !== false && bw >= 3.5) {
        const ex = px > cx ? bx0 + 0.75 : bx1 - 0.75, mE = o.haut ? mH : mR;
        G.add(at(boite(1.1, 0.75, 1.0, mE), ex, Hm + 0.45, z0 + 0.65)); G.add(at(boite(1.2, 0.08, 1.1, COL(mix(toit.c, -0.2))), ex, Hm + 0.84, z0 + 0.65));
        G.add(at(boite(0.45, 0.6, 0.02, M({ map: TX.planches(o.porte?.c || '#6a4a2a') })), ex, Hm + 0.38, z0 + 1.16));
        if (toit.citerne) { G.add(at(cyl(0.3, 0.3, 0.55, COL(toit.citerne), 10), cx, Hm + 0.4, z0 + 0.6)); }
      }
      const ac = toit.acrotere ?? 0.3, mA = o.haut ? mH : mR;
      if (ac > 0) for (const [x, z, ww, dd] of [[cx, zf, bw + 0.12, 0.12], [cx, z0, bw + 0.12, 0.12], [bx0, zc, 0.12, prof], [bx1, zc, 0.12, prof]]) G.add(at(boite(ww, ac, dd, mA), x, Hm + ac / 2 + 0.06, z));
      if (toit.creneaux) for (let x = bx0 + 0.2; x < bx1; x += 0.5) G.add(at(boite(0.24, 0.22, 0.14, mA), x, Hm + ac + 0.15, zf));
    }
    // lucarnes sur le pan avant
    const nl = o.lucarnes || 0;
    if (nl && (toit.f === '2p' || toit.f === 'mansarde')) {
      for (let i = 0; i < nl; i++) {
        const x = bx0 + (i + 0.5) * bw / nl, zl = toit.f === 'mansarde' ? zf - 0.05 : zf - 0.55, yl = Hm + (toit.f === 'mansarde' ? 0.15 : 0.35);
        G.add(at(boite(0.72, 0.7, 0.7, mH), x, yl + 0.35, zl - 0.25));
        pans(G, x - 0.36, x + 0.36, zl - 0.6, zl + 0.1, yl + 0.7, 0.35, zl - 0.25, mT, mHD, 0.08, faite, 0.06);
        fen(G, x, yl + 0.36, zl + 0.1, 0.38, 0.4, { ...F, t: F.t === 'arc' ? 'arc' : 'std', volets: null, fleurs: null });
      }
    }
    // cheminées
    for (const [cxh, col] of o.chem || []) {
      const ch = col || '#a07a62';
      if (cxh === 'g' || cxh === 'd') {   // souche massive sur le pignon (granit breton)
        const x = cxh === 'g' ? bx0 + 0.3 : bx1 - 0.3, yr = toit.f === '2p' ? faiteY : Hm + hr * 0.6;
        G.add(at(boite(0.6, 0.9, 0.55, M({ map: TX.granit(ch) })), x, yr + 0.2, toit.f === '2p' ? zc : zc - 0.3));
        G.add(at(boite(0.68, 0.08, 0.62, COL('#5a5552')), x, yr + 0.68, toit.f === '2p' ? zc : zc - 0.3));
        for (const dx of [-0.14, 0.14]) G.add(at(cyl(0.06, 0.07, 0.18, COL('#b86a4a'), 6), x + dx, yr + 0.8, toit.f === '2p' ? zc : zc - 0.3));
      } else cheminee(G, bx0 + cxh * bw, faiteY - 0.75, z0 + prof * 0.35, ch, 1.0);
    }
    // avancées
    const av = o.av, toitAv = matToit(toit.m === 'chaume' ? 'tuiles' : toit.m, toit.c);
    if (av === 'auvent') { const a = boite(1.15, 0.06, 0.5, toitAv); a.rotation.x = 0.4; G.add(at(a, px, y0 + 1.32, zf + 0.22)); for (const s of [-1, 1]) { const c = boite(0.05, 0.05, 0.4, COL('#3a2a1a')); c.rotation.x = -0.7; G.add(at(c, px + s * 0.5, y0 + 1.15, zf + 0.15)); } }
    else if (av === 'porche') {
      G.add(at(boite(1.4, 0.1, 0.85, M({ map: TX.pierre('#b8b0a0') })), px, y0 - 0.05, zf + 0.42));
      for (const s of [-1, 1]) G.add(at(boite(0.1, 1.3, 0.1, COL(o.bois || '#f0ece2')), px + s * 0.6, y0 + 0.65, zf + 0.78));
      pansRue(G, px - 0.7, px + 0.7, zf - 0.05, zf + 0.9, y0 + 1.3, 0.45, px, toitAv, mHD, 0.1, faite);
    } else if (av === 'veranda' || av === 'galerie' || av === 'engawa') {
      const yv = av === 'galerie' && et > 1 ? y0 + he : y0, dv = av === 'engawa' ? 0.55 : 0.75;
      G.add(at(boite(bw + (av === 'galerie' ? 0.2 : -0.1), 0.12, dv, M({ map: TX.bois(o.boisSol || '#a8744a') })), cx, yv - 0.04, zf + dv / 2));
      for (const x of [bx0 + 0.1, ...(bw > 4 ? [cx] : []), bx1 - 0.1]) if (Math.abs(x - px) > 0.5) G.add(at(boite(0.1, (av === 'galerie' ? he : 1.35) + (yv - P), 0.1, COL(o.bois || '#f0ece2')), x, P + ((av === 'galerie' ? he : 1.35) + yv - P) / 2, zf + dv - 0.05));
      if (av === 'galerie') { balustrade(G, bx0 + 0.05, zf + dv - 0.05, bx1 - 0.05, zf + dv - 0.05, yv, COL(o.bois || '#7a4a2a'), 0.5, 0.18); }
      else if (av === 'veranda') { const ap = boite(bw + 0.1, 0.07, dv + 0.1, toitAv); ap.rotation.x = 0.45; G.add(at(ap, cx, Hm - 0.05, zf + dv / 2)); }
      else { const ap = boite(bw + 0.4, 0.07, 0.75, toitAv); ap.rotation.x = 0.35; G.add(at(ap, cx, y0 + 1.5, zf + 0.25)); }
    } else if (av === 'balcon' && et > 1) {
      const yb = y0 + he;
      G.add(at(boite(Math.min(bw - 0.4, 2.2), 0.1, 0.5, M({ map: TX.pierre('#d8d0c0') })), px, yb, zf + 0.25));
      balustrade(G, px - Math.min(bw - 0.4, 2.2) / 2, zf + 0.48, px + Math.min(bw - 0.4, 2.2) / 2, zf + 0.48, yb, COL(o.fer || '#2a2a30'), 0.4, 0.12);
    } else if (av === 'pergola') {
      for (const s of [-1, 1]) G.add(at(boite(0.09, 1.45, 0.09, COL('#8a6a4a')), px + s * 0.75, y0 + 0.72, zf + 0.85));
      for (let i = 0; i < 6; i++) G.add(at(boite(0.06, 0.08, 1.0, COL('#8a6a4a')), px - 0.8 + i * 0.32, y0 + 1.48, zf + 0.45));
      grimpante(G, px - 0.75, y0 + 0.2, y0 + 1.45, zf + 0.82, o.fleurPergola || '#b08ae0', 5, 0.2);
      for (let i = 0; i < 7; i++) { G.add(at(boite(0.24, 0.12, 0.3, vert(i)), px - 0.8 + i * 0.27, y0 + 1.56, zf + 0.3 + (i % 3) * 0.25)); if (i % 2 === 0) G.add(at(boite(0.08, 0.2, 0.08, COL(o.fleurPergola || '#b08ae0')), px - 0.8 + i * 0.27, y0 + 1.38, zf + 0.4 + (i % 3) * 0.2)); }
    } else if (av === 'bowindow') {
      const s = slots.filter((x) => Math.abs(x - px) > 0.72)[0] ?? bx0 + 0.8, ww = 1.0;
      G.add(at(boite(ww, 1.05, 0.4, mR), s, y0 + 0.55, zf + 0.2));
      G.add(at(boite(ww - 0.2, 0.62, 0.02, M({ map: TX.vitreRideau(F.rideau || '#f0d8e0') })), s, y0 + 0.65, zf + 0.415));
      for (const dx of [-0.2, 0.2]) G.add(at(boite(0.04, 0.62, 0.04, COL(F.cadre || '#f4f0e6')), s + dx, y0 + 0.65, zf + 0.43));
      const t = boite(ww + 0.1, 0.06, 0.55, toitAv); t.rotation.x = 0.35; G.add(at(t, s, y0 + 1.16, zf + 0.22));
    } else if (av === 'marquise') {
      G.add(at(boite(1.4, 0.05, 0.6, M({ color: new THREE.Color('#bfe0f0'), transparent: true, opacity: 0.6 })), px, y0 + 1.35, zf + 0.3));
      for (const s of [-1, 1]) { const t = boite(0.04, 0.04, 0.7, COL('#3a4048')); t.rotation.x = -0.45; G.add(at(t, px + s * 0.6, y0 + 1.5, zf + 0.28)); }
    } else if (av === 'hisashi' && et > 1) {   // petit avant-toit entre le rez-de-chaussée et l'étage (machiya)
      const a = boite(bw + 0.2, 0.07, 0.6, toitAv); a.rotation.x = 0.38; G.add(at(a, cx, y0 + he + 0.05, zf + 0.22));
    } else if (av === 'serre') {   // petite serre vitrée sur le côté du jardin de devant
      const x = slots.filter((x) => Math.abs(x - px) > 0.9)[0] ?? bx0 + 0.7, V = M({ color: new THREE.Color('#d8f0f4'), transparent: true, opacity: 0.45 });
      G.add(at(boite(1.0, 0.9, 0.7, V), x, y0 + 0.45, zf + 0.36)); G.add(at(boite(1.0, 0.05, 0.75, V), x, y0 + 1.0, zf + 0.36));
      for (const dx of [-0.5, 0, 0.5]) G.add(at(boite(0.03, 1.0, 0.03, COL('#f4f4f0')), x + dx, y0 + 0.5, zf + 0.72));
      for (let i = 0; i < 4; i++) G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), COL(['#3c8c3c', '#f05a6a', '#4a9a44', '#f8d850'][i])), x - 0.3 + i * 0.2, y0 + 0.25, zf + 0.35));
    }
    // annexe (appentis : remise, atelier, garage)
    if (ann) {
      const aw = ann.w, ax0 = ann.cote === 'g' ? 0 : w - aw, ax1 = ax0 + aw, ha = so + (ann.h || 1.35), ad = Math.min(prof, ann.d || Math.min(prof - 0.3, 2.4)), az0 = zf - ad;
      const mA = matMur({ t: ann.t || 'planches', c: ann.c || '#8a6a4a' });
      G.add(at(boite(aw, ha, ad, mA), (ax0 + ax1) / 2, P + ha / 2, az0 + ad / 2));
      if (toit.f === 'plat' && !ann.toit) { G.add(at(boite(aw + 0.1, 0.1, ad + 0.1, COL(toit.c)), (ax0 + ax1) / 2, P + ha, az0 + ad / 2)); G.add(at(boite(aw + 0.1, 0.22, 0.1, mA), (ax0 + ax1) / 2, P + ha + 0.11, zf)); }
      else { const ap = boite(aw + 0.3, 0.08, ad + 0.4, ann.toit ? matToit(ann.toit, ann.toitC || toit.c) : toitAv); ap.rotation.z = (ann.cote === 'g' ? 1 : -1) * 0.28; G.add(at(ap, (ax0 + ax1) / 2, P + ha + 0.2, az0 + ad / 2)); }
      if (ann.porte === 'garage') { G.add(at(boite(aw - 0.3, ha - 0.4, 0.03, M({ map: TX.bardage('#c8ccd0') })), (ax0 + ax1) / 2, P + (ha - 0.4) / 2, zf + 0.01)); }
      else if (ann.porte === 'fenetre') fen(G, (ax0 + ax1) / 2, P + so + 0.7, zf, 0.5, 0.45, { ...F, fleurs: null, volets: null });
      else { G.add(at(boite(aw - 0.5, ha - 0.3, 0.03, M({ map: TX.planches(ann.pc || '#6a4a2a') })), (ax0 + ax1) / 2, P + (ha - 0.3) / 2, zf + 0.01)); for (const s of [-1, 1]) { const x = boite(0.05, Math.hypot(aw - 0.5, ha - 0.3), 0.03, COL('#4a3020')); x.rotation.z = s * Math.atan2(aw - 0.5, ha - 0.3); G.add(at(x, (ax0 + ax1) / 2, P + (ha - 0.3) / 2, zf + 0.03)); } }
    }
    orner(G, o, o.orn || [], { bx0, bx1, zf, Hm, y0, px, et, he, toitY, faite: faiteY, zc, xr0, xr1, cote: o.cote || (px > cx ? 'g' : 'd'), ...(o.ctx || {}) });
    return G;
  };
}
