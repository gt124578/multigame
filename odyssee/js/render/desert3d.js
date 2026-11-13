// odyssee/js/render/desert3d.js — monuments du désert en fausse 3D (même atelier que batiments3d.js : volumes simples,
// textures pixel art à D px par unité, éclairage en paliers). Ajoute deux modèles :
//   pyramide (12 × 12) : pyramide à degrés de grès, pyramidion d'or, portail à pylônes au pied de la face sud (porte
//                        de 2 cases), deux obélisques et deux brasiers devant ;
//   temple   (11 × 8)  : tombeau du pharaon — terrasse et escalier, deux pylônes à corniche à gorge couverts de
//                        bas-reliefs, porte au disque ailé, cour à colonnes papyriformes, sanctuaire au fond, chacals
//                        couchés et obélisques.
// Coordonnées comme les autres modèles : x de 0 à w, z de 0 à d (façade sud en z = d), y vers le haut.
import * as THREE from 'three';

export function monumentsDesert({ B, tex, hash, mix, S, D, boite, at, M, COL, LUM, cyl, brasero, reperePorte, OR }) {
  const GRES = '#d8b47c', GRES_C = '#ecd2a2', GRES_S = '#a8824e', LAPIS = '#2f5ab8', NUIT = '#140c0e';

  /* ---------------------------------------------------------------- textures */
  // grès : assises de 8 px, blocs de longueurs inégales, joints fins, un ton par bloc, quelques éclats
  const gres = (col = GRES) => tex('gres' + col, D, D, (g, px, w, h) => {
    const rh = 8 * S, COUPES = [[0, 14], [7, 23], [0, 11, 22], [4, 18]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / rh) % 4, ly = y % rh, xs = x / S, c = COUPES[row];
      let k = c.length - 1; for (let q = 0; q < c.length; q++) if (xs >= c[q]) k = q; if (xs < c[0]) k = c.length - 1;
      const lx = xs >= c[k] ? xs - c[k] : xs + 32 - c[k], id = hash(k, row, 17);
      let f = id < 0.3 ? -0.06 : id < 0.7 ? 0 : 0.05;
      if (ly < S) f += 0.09; else if (hash(x, y, 18) < 0.025) f -= 0.08;
      if (ly >= rh - S || lx < 1) f = -0.24;
      px(x, y, mix(col, f));
    }
  });
  // hiéroglyphes gravés en colonnes (creux sombre, arête claire en bas à droite), sur fond de grès
  const GLYPHES = [
    ['.##.', '#..#', '.##.', '..#.', '.##.'], ['.#..', '.##.', '####', '.#..', '.#..'], ['#..#', '####', '#..#', '#..#', '####'],
    ['....', '####', '#.##', '####', '....'], ['..#.', '.#.#', '#..#', '.#.#', '..#.'], ['.#.#', '.###', '..#.', '..#.', '.###'],
    ['####', '#..#', '#..#', '#..#', '####'], ['.#..', '###.', '.#..', '.###', '...#']];
  const hiero = (col = GRES) => tex('hiero' + col, D, D, (g, px, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hash(x, y, 31) < 0.04) px(x, y, mix(col, -0.06));
    const cw = 8 * S, ch = 8 * S;
    for (let cy = 0; cy < h / ch; cy++) for (let cx = 0; cx < w / cw; cx++) {
      const m = GLYPHES[Math.floor(hash(cx, cy, 33) * GLYPHES.length)];
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 4; xx++) if (m[yy][xx] === '#') {
        for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
          const X = cx * cw + (2 + xx) * S + a, Y = cy * ch + (1 + yy) * S + b;
          px(X, Y, mix(col, -0.42));
          if (a === S - 1 && b === S - 1 && (xx === 3 || m[yy][xx + 1] !== '#')) px(X + 1, Y + 1, mix(col, 0.22));
        }
      }
      for (let y = 0; y < ch; y++) px(cx * cw, cy * ch + y, mix(col, -0.18));       // filet entre les colonnes
    }
  }, true);
  // grand bas-relief d'un pylône : un roi coiffé du némès qui tend un sceptre, encadré de deux colonnes de glyphes
  const reliefRoi = (col = GRES) => tex('roi' + col, 3 * D, 4 * D, (g, px, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hash(x, y, 41) < 0.04) px(x, y, mix(col, -0.05));
    const roi = ['....#####.....', '...#######....', '..##.###.##...', '..#..###..#...', '.....###......', '....#####...#.',
      '...#######.##.', '..#.#####.#...', '.#..#####.....', '#...#####.....', '....#####.....', '....##.##.....', '....##.##.....',
      '....##.##.....', '...###.###....'];
    const k = w / 20, ox = w * 0.18, oy = h * 0.16;
    for (let yy = 0; yy < roi.length; yy++) for (let xx = 0; xx < roi[yy].length; xx++) if (roi[yy][xx] === '#') {
      const x0 = Math.floor(ox + xx * k), y0 = Math.floor(oy + yy * k * 1.45);
      for (let a = 0; a < Math.ceil(k); a++) for (let b = 0; b < Math.ceil(k * 1.45); b++) px(x0 + a, y0 + b, mix(col, -0.3));
      px(x0 + Math.ceil(k), y0 + Math.ceil(k * 1.45), mix(col, 0.2));
    }
    // couleurs anciennes : némès bleu et or, collier
    for (let xx = 4; xx <= 8; xx++) for (let b = 0; b < Math.ceil(k * 1.45); b++) px(Math.floor(ox + xx * k + 1), Math.floor(oy + k * 1.45 * 0) + b, xx % 2 ? mix(LAPIS, 0.1) : '#d8a830');
    for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 6; cy++) {
      const m = GLYPHES[Math.floor(hash(cx, cy, 43) * GLYPHES.length)], X0 = Math.floor(w * (cx ? 0.8 : 0.04)), Y0 = Math.floor(h * 0.1 + cy * h * 0.13);
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 4; xx++) if (m[yy][xx] === '#') for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) px(X0 + xx * S + a, Y0 + yy * S + b, mix(col, -0.4));
    }
  }, false);
  // disque solaire ailé (bandeau au-dessus des portes)
  const disqueAile = () => tex('disqueAile', 4 * D, D, (g, px, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2), dd = Math.hypot(dx * 4, dy);
      if (dd < 0.55) { px(x, y, dd < 0.3 ? '#fff0a0' : '#e8b830'); continue; }
      const aile = Math.abs(dx) < 0.97 && Math.abs(dy - Math.abs(dx) * 0.35) < 0.42 - Math.abs(dx) * 0.25;
      if (aile) { const b = Math.floor((dy + 1) * 3); px(x, y, b % 2 ? mix(LAPIS, 0.15) : (Math.floor(Math.abs(dx) * 14) % 2 ? '#e8b830' : mix(LAPIS, -0.2))); }
      else px(x, y, mix(GRES, 0.05));
    }
  }, false);

  /* ---------------------------------------------------------------- volumes */
  // tronc de pyramide à base rectangulaire (pylônes, obélisques, socles) ; UV en unités de monde (textures répétées)
  function tronc(wb, db, wt, dt, h, mat, matHaut = mat) {
    const P = [], U = [], grp = [];
    const B0 = [[-wb / 2, 0, db / 2], [wb / 2, 0, db / 2], [wb / 2, 0, -db / 2], [-wb / 2, 0, -db / 2]];
    const T0 = [[-wt / 2, h, dt / 2], [wt / 2, h, dt / 2], [wt / 2, h, -dt / 2], [-wt / 2, h, -dt / 2]];
    const face = (a, b, c, d2, lu, lv) => {   // quad a b c d (sens trigo vu de l'extérieur)
      for (const [p, u, v] of [[a, 0, 0], [b, lu, 0], [c, lu, lv], [a, 0, 0], [c, lu, lv], [d2, 0, lv]]) { P.push(...p); U.push(u, v); }
    };
    const pente = (bw, tw, dd) => Math.hypot(h, (bw - tw) / 2 + 0) || h;
    face(B0[0], B0[1], T0[1], T0[0], wb, pente(db, dt));           // sud
    face(B0[1], B0[2], T0[2], T0[1], db, pente(wb, wt));           // est
    face(B0[2], B0[3], T0[3], T0[2], wb, pente(db, dt));           // nord
    face(B0[3], B0[0], T0[0], T0[3], db, pente(wb, wt));           // ouest
    const n1 = P.length / 3;
    face(T0[0], T0[1], T0[2], T0[3], wt, dt);                       // dessus
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.addGroup(0, n1, 0); g.addGroup(n1, 6, 1); g.computeVertexNormals();
    const m = new THREE.Mesh(g, [mat, matHaut]); m.castShadow = m.receiveShadow = true; return m;
  }
  // corniche à gorge : lèvre évasée qui coiffe un pylône ou une porte (trois boîtes de plus en plus larges + tore)
  function corniche(G, cx, y, cz, w, d, col = GRES_C) {
    const m1 = gres(mix(col, -0.08)), m2 = gres(col);
    G.add(at(boite(w + 0.06, 0.1, d + 0.06, COL(mix(col, -0.3))), cx, y + 0.05, cz));          // tore, dans l'ombre
    G.add(at(boite(w + 0.12, 0.12, d + 0.12, M({ map: m1 })), cx, y + 0.16, cz));
    G.add(at(boite(w + 0.22, 0.14, d + 0.22, M({ map: m2 })), cx, y + 0.29, cz));
    G.add(at(boite(w + 0.28, 0.05, d + 0.28, COL(mix(col, 0.18))), cx, y + 0.385, cz));
  }
  function obelisque(G, x, z, h = 3.4, col = GRES, y = 0) {
    G.add(at(boite(0.9, 0.3, 0.9, M({ map: gres(GRES_S) })), x, y + 0.15, z));
    G.add(at(tronc(0.5, 0.5, 0.34, 0.34, h, M({ map: hiero(col) }), COL(col)), x, y + 0.3, z));
    const pointe = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 4), OR); pointe.rotation.y = Math.PI / 4; pointe.castShadow = true;
    G.add(at(pointe, x, y + 0.3 + h + 0.21, z));
  }
  // chacal couché sur son socle (gardien de la porte), regard vers le sud
  function chacal(G, x, z, s = 1, y = 0) {
    const NOIR = COL('#24202a'), ORn = OR;
    G.add(at(boite(1.0 * s, 0.5 * s, 1.5 * s, M({ map: gres(GRES_S) })), x, 0.25 * s + y, z));
    G.add(at(boite(0.62 * s, 0.32 * s, 1.1 * s, NOIR), x, 0.66 * s + y, z - 0.08 * s));        // corps couché
    G.add(at(boite(0.5 * s, 0.5 * s, 0.34 * s, NOIR), x, 0.92 * s + y, z + 0.32 * s));         // poitrail dressé
    G.add(at(boite(0.32 * s, 0.3 * s, 0.4 * s, NOIR), x, 1.24 * s + y, z + 0.4 * s));          // tête
    G.add(at(boite(0.14 * s, 0.12 * s, 0.26 * s, NOIR), x, 1.2 * s + y, z + 0.68 * s));        // museau
    for (const e of [-1, 1]) G.add(at(boite(0.08 * s, 0.26 * s, 0.08 * s, NOIR), x + e * 0.1 * s, 1.5 * s + y, z + 0.34 * s));   // oreilles
    G.add(at(boite(0.52 * s, 0.07 * s, 0.36 * s, ORn), x, 1.06 * s + y, z + 0.33 * s));       // collier d'or
    for (const e of [-1, 1]) G.add(at(boite(0.12 * s, 0.1 * s, 0.4 * s, NOIR), x + e * 0.18 * s, 0.56 * s + y, z + 0.6 * s)); // pattes
  }
  // colonne papyriforme : fût fuselé, bagues, chapiteau en ombelle, dé
  function colonnePapyrus(G, x, z, y0, h, col = GRES) {
    const pied = new THREE.LatheGeometry([[0, 0], [0.3, 0], [0.3, 0.08], [0.26, 0.12], [0.24, h * 0.75], [0.2, h * 0.86], [0.38, h * 0.97], [0.38, h], [0, h]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
    const m = new THREE.Mesh(pied, M({ map: gres(col) })); m.castShadow = m.receiveShadow = true; G.add(at(m, x, y0, z));
    for (const yy of [0.72, 0.78]) G.add(at(cyl(0.235, 0.235, 0.05, COL(LAPIS), 10), x, y0 + h * yy, z));
    G.add(at(boite(0.56, 0.16, 0.56, M({ map: gres(GRES_C) })), x, y0 + h + 0.08, z));
  }
  // porte sombre au fond d'une embrasure, deux vantaux de bronze entrouverts
  function entree(G, x, z, y0, w, h) {
    reperePorte(G, x, y0, z, w, h);
    G.add(at(boite(w, h, 0.04, COL(NUIT)), x, y0 + h / 2, z + 0.01));
    for (const s of [-1, 1]) {
      const v = boite(w * 0.18, h, 0.06, LUM('#a8742a', '#2a1600')); v.rotation.y = s * 0.9;
      G.add(at(v, x + s * (w / 2 - 0.05), y0 + h / 2, z + 0.14));
    }
    G.add(at(boite(w + 0.24, 0.16, 0.2, M({ map: gres(GRES_C) })), x, y0 + h + 0.08, z + 0.06));      // linteau
    for (const s of [-1, 1]) G.add(at(boite(0.14, h, 0.2, M({ map: gres(GRES_C) })), x + s * (w / 2 + 0.07), y0 + h / 2, z + 0.06));
  }

  /* ---------------------------------------------------------------- pyramide (12 × 12) */
  B.pyramide = ({ etages = 8, col = GRES } = {}) => {
    const G = new THREE.Group(), cx = 6, cz = 5.6, base = 10.6, recul = 0.55, hE = 0.8;
    // dalle de fondation
    G.add(at(boite(11.6, 0.2, 11.0, M({ map: gres(GRES_S) })), cx, 0.1, cz + 0.2));
    // gradins : chaque étage en retrait du précédent, l'arête de chaque gradin éclaircie
    for (let k = 0; k < etages; k++) {
      const L = base - 2 * recul * k, y = 0.2 + k * hE;
      const tons = mix(col, (k % 2 ? -0.03 : 0.02));
      G.add(at(boite(L, hE, L, [M({ map: gres(mix(tons, -0.1)) }), M({ map: gres(mix(tons, 0.08)) }), M({ map: gres(mix(tons, 0.14)) }), M({ map: gres(tons) }), M({ map: gres(tons) }), M({ map: gres(tons) })]), cx, y + hE / 2, cz));
      G.add(at(boite(L + 0.04, 0.05, 0.05, COL(mix(col, 0.32))), cx, y + hE - 0.02, cz + L / 2));     // nez du gradin, face sud
    }
    // pyramidion d'or
    const top = 0.2 + etages * hE, Lt = base - 2 * recul * etages;
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(Lt * 0.7, 1.5, 4), OR); pyr.rotation.y = Math.PI / 4; pyr.castShadow = true;
    G.add(at(pyr, cx, top + 0.75, cz));
    // portail : deux pylônes inclinés, porte au disque ailé, au pied de la face sud
    const zp = 11.2, yp = 0.2;
    for (const s of [-1, 1]) {
      const p = tronc(1.5, 1.4, 1.2, 1.1, 3.2, M({ map: hiero(col) }), M({ map: gres(GRES_C) }));
      G.add(at(p, cx + s * 1.75, yp, zp - 0.7)); corniche(G, cx + s * 1.75, yp + 3.2, zp - 0.7, 1.2, 1.1);
    }
    G.add(at(boite(2.2, 2.6, 1.3, M({ map: gres(col) })), cx, yp + 1.3, zp - 0.7));
    corniche(G, cx, yp + 2.6, zp - 0.7, 2.2, 1.3);
    const da = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), M({ map: disqueAile(), transparent: false })); G.add(at(da, cx, yp + 2.28, zp - 0.04));
    entree(G, cx, zp - 0.05, yp, 1.6, 1.9);
    // seuil et deux marches
    G.add(at(boite(2.4, 0.1, 0.5, M({ map: gres(GRES_C) })), cx, 0.15, zp + 0.25));
    // obélisques et brasiers de part et d'autre de l'allée
    for (const s of [-1, 1]) { obelisque(G, cx + s * 4.3, 11.2, 3.6, col); brasero(G, cx + s * 2.9, 0.2, 11.6, 0.8, 0.7); }
    return G;
  };

  /* ---------------------------------------------------------------- temple du pharaon (11 × 8) */
  B.temple = ({ col = GRES } = {}) => {
    const G = new THREE.Group(), cx = 5.5;
    // terrasse et escalier central
    G.add(at(boite(11, 0.55, 7.2, M({ map: gres(GRES_S) })), cx, 0.275, 3.6));
    G.add(at(boite(11.1, 0.06, 7.3, COL(mix(GRES_C, 0.1))), cx, 0.56, 3.6));
    for (let k = 0; k < 4; k++) G.add(at(boite(3.2 - k * 0.0, 0.55 - k * 0.137, 0.2, M({ map: gres(GRES_C) })), cx, (0.55 - k * 0.137) / 2, 7.3 + k * 0.2));
    const y0 = 0.58;
    // sanctuaire au fond (toit plat, frise de glyphes)
    G.add(at(boite(5, 2.6, 1.6, M({ map: gres(col) })), cx, y0 + 1.3, 1.0));
    G.add(at(boite(5.1, 0.5, 1.7, M({ map: hiero(col) })), cx, y0 + 2.35, 1.0));
    corniche(G, cx, y0 + 2.6, 1.0, 5, 1.6);
    G.add(at(boite(1.0, 1.6, 0.05, COL(NUIT)), cx, y0 + 0.8, 1.82));
    // cour à colonnes papyriformes
    G.add(at(boite(7.0, 0.04, 3.2, M({ map: gres(GRES_C) })), cx, y0 + 0.02, 3.4));
    for (const x of [2.6, 4.1, 6.9, 8.4]) for (const z of [2.4, 4.2]) colonnePapyrus(G, x, z, y0, 2.3, col);
    for (const z of [2.4, 4.2]) G.add(at(boite(6.6, 0.24, 0.56, M({ map: gres(GRES_C) })), cx, y0 + 2.6, z));   // architraves
    // murs latéraux de la cour
    for (const x of [1.55, 9.45]) G.add(at(boite(0.4, 1.8, 3.6, M({ map: gres(col) })), x, y0 + 0.9, 3.3));
    // deux pylônes inclinés, couverts d'un grand bas-relief, coiffés d'une corniche à gorge
    const zf = 5.9, hP = 4.4, dP = 1.2;
    for (const s of [-1, 1]) {
      const px = cx + s * 3.25;
      G.add(at(tronc(3.5, dP, 2.9, dP * 0.82, hP, M({ map: gres(col) }), M({ map: gres(GRES_C) })), px, y0, zf - dP / 2));
      corniche(G, px, y0 + hP, zf - dP / 2, 2.9, dP * 0.82);
      // bas-relief plaqué sur la face sud (qui penche de l'inclinaison du pylône)
      const ang = Math.atan2((dP - dP * 0.82) / 2, hP);
      const rel = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.1), M({ map: reliefRoi(col) }));
      rel.rotation.x = -ang; G.add(at(rel, px, y0 + 2.0, zf - Math.tan(ang) * 2.0 + 0.02));
      // mât à oriflamme dans la rainure du pylône
      G.add(at(cyl(0.05, 0.05, hP + 1.2, COL('#6a4a2a'), 6), px - s * 1.2, y0 + (hP + 1.2) / 2, zf + 0.1));
      G.add(at(boite(0.02, 0.9, 0.38, COL(s < 0 ? '#c83a2a' : '#2f5ab8')), px - s * 1.2, y0 + hP + 0.6, zf + 0.32));
    }
    // porte centrale plus basse entre les pylônes, disque ailé et cobras
    G.add(at(boite(3.0, 3.1, 1.0, M({ map: gres(col) })), cx, y0 + 1.55, zf - 0.5));
    corniche(G, cx, y0 + 3.1, zf - 0.5, 3.0, 1.0);
    const da = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), M({ map: disqueAile() })); G.add(at(da, cx, y0 + 2.7, zf + 0.01));
    for (const s of [-1, 1]) { G.add(at(cyl(0.05, 0.07, 0.4, OR, 6), cx + s * 0.75, y0 + 3.15, zf - 0.05)); G.add(at(boite(0.14, 0.12, 0.08, OR), cx + s * 0.75, y0 + 3.4, zf - 0.02)); }
    entree(G, cx, zf + 0.02, y0, 1.5, 2.2);
    // gardiens : chacals couchés au bord de l'escalier, obélisques aux angles, brasiers
    for (const s of [-1, 1]) {
      chacal(G, cx + s * 2.3, 6.5, 0.82, y0);
      obelisque(G, cx + s * 4.9, 6.5, 3.0, col, y0);
      brasero(G, cx + s * 1.9, y0, 6.95, 0.6, 0.5);
    }
    return G;
  };
}
