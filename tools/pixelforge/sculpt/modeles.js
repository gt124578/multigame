// Odyssée — PixelForge / sculptures : petits objets détaillés faits de formes arrondies fondues (sculpt3d.js).
// Unités : la case (1 = une case du jeu), y vers le haut, z vers le sud (vers la caméra), base posée en y = 0,
// centrée en x = 0, z = 0. Chaque entrée : (S, o) => void, avec S = sculpture() et o = options (matière, pose…).
// Les hauteurs sont « à plat » : le rendu les étire de tan(55°) comme les bâtiments du jeu.

const PI = Math.PI;

/** matières communes */
function matieres(S, o = {}) {
  S.mat('bronze', o.bronze || '#a86e36', { grain: 0.05, echelle: 22, patine: '#4f8a72', brillance: 0.8 });
  S.mat('bronzeClair', '#d29a50', { grain: 0.04, echelle: 22, patine: '#4f8a72', brillance: 1 });
  S.mat('pierre', o.pierre || '#aaa395', { grain: 0.09, echelle: 16, patine: o.mousse === false ? '#7a756c' : '#6f7d4e' });
  S.mat('pierreSombre', '#8e897e', { grain: 0.09, echelle: 16, patine: '#5d6a40' });
  S.mat('or', '#e0b44a', { grain: 0.03, echelle: 30, brillance: 1 });
  S.mat('creux', '#2a2622', { grain: 0 });
  S.mat('lumiere', '#ffd870', { grain: 0, lueur: 1 });
  S.mat('terre', '#c2703c', { grain: 0.06, echelle: 20, brillance: 0.15 });
  S.mat('noir', '#2c2a2e', { grain: 0.02, brillance: 0.3 });
}

/** socle carré à moulures (plinthe, dé, corniche) ; renvoie la hauteur du dessus */
function socle(S, { l = 0.46, h = 0.7, mat = 'pierre', plaque = true } = {}) {
  const P = [[0, 0], [l, 0], [l, 0.07], [l - 0.03, 0.1], [l - 0.06, 0.12], [l - 0.08, 0.13], [l - 0.08, h - 0.1], [l - 0.05, h - 0.08], [l - 0.03, h - 0.05], [l - 0.03, h], [0, h]];
  S.tour([0, 0, 0], P, { pans: 4, mat, k: 0.01 });
  if (plaque) {
    const z = (l - 0.08) * Math.SQRT1_2;
    S.boite([0, h * 0.52, z], [0.17, 0.08, 0.02], { op: 'peindre', mat: 'or', net: true, k: 0 });
    for (let i = -1; i <= 1; i++) S.boite([0, h * 0.52 + i * 0.035, z + 0.005], [0.12 - Math.abs(i) * 0.03, 0.006, 0.02], { op: 'creuser', mat: 'bronze', k: 0.004 });
  }
  return h;
}

export const SCULPTURES = {
  /** statue de dresseur en bronze, aux proportions des personnages du jeu (grosse tête) : pas en avant, casquette,
   *  sacoche, poing sur la hanche, l'autre bras levé qui brandit une Poké Ball ; la tête regarde la balle, levée vers
   *  la caméra du jeu (o.regard, radians) : vue d'en haut à 55°, un visage droit disparaîtrait sous la visière */
  dresseur(S, o = {}) {
    matieres(S, o);
    const h0 = o.socle === false ? 0 : socle(S, { mat: 'pierre', l: 0.42, h: 0.42 });
    const B = o.mat || 'bronze';
    S.groupe({ t: [0, h0, 0], e: o.taille || 1 }, () => {
      // jambes (gauche en avant), chaussures montantes
      S.capsule([-0.09, 0.46, 0.01], [-0.1, 0.1, 0.07], [0.078, 0.066], { mat: B, k: 0.03 });
      S.capsule([0.09, 0.46, -0.01], [0.1, 0.1, -0.06], [0.078, 0.066], { mat: B, k: 0.03 });
      S.ellipsoide([-0.1, 0.06, 0.11], [0.082, 0.065, 0.125], { mat: B, k: 0.035 });
      S.ellipsoide([0.1, 0.06, -0.02], [0.082, 0.065, 0.125], { mat: B, k: 0.035 });
      S.miroirX(() => S.tore([0.1, 0.13, 0.03], 0.07, 0.012, { mat: B, k: 0.01 }));
      // short, buste, veste ouverte au col relevé, ceinture
      S.ellipsoide([0, 0.47, 0], [0.175, 0.11, 0.125], { mat: B, k: 0.04 });
      S.ellipsoide([0, 0.67, 0], [0.18, 0.2, 0.135], { mat: B, k: 0.06 });
      S.boite([0, 0.66, 0.15], [0.02, 0.19, 0.05], { op: 'creuser', k: 0.012 });
      S.capsule([-0.2, 0.5, 0.12], [0.2, 0.5, 0.12], 0.011, { op: 'creuser', k: 0.01 });
      S.tore([0, 0.83, 0.005], 0.08, 0.032, { mat: B, k: 0.02, r: [-0.15, 0, 0] });
      // sacoche à la hanche gauche, sangle en travers
      S.boite([-0.2, 0.48, 0.06], [0.06, 0.085, 0.1], { arrondi: 0.035, mat: B, k: 0.015 });
      S.boite([-0.2, 0.53, 0.065], [0.066, 0.028, 0.105], { arrondi: 0.02, mat: B, k: 0.008 });
      S.capsule([0.13, 0.8, 0.085], [-0.19, 0.53, 0.12], 0.02, { mat: B, k: 0.01 });
      S.capsule([0.13, 0.8, -0.08], [-0.2, 0.53, -0.03], 0.02, { mat: B, k: 0.01 });
      // épaules, bras droit levé, Poké Ball au poing
      S.miroirX(() => S.sphere([0.17, 0.79, 0], 0.07, { mat: B, k: 0.05 }));
      S.capsule([0.18, 0.79, 0], [0.25, 0.95, 0.07], [0.062, 0.055], { mat: B, k: 0.04 });
      S.capsule([0.25, 0.95, 0.07], [0.27, 1.12, 0.11], [0.055, 0.048], { mat: B, k: 0.03 });
      S.ellipsoide([0.272, 1.155, 0.115], [0.055, 0.06, 0.05], { mat: B, k: 0.025 });
      const bc = [0.275, 1.25, 0.13];
      S.sphere(bc, 0.085, { mat: 'bronzeClair', k: 0.02, net: true });
      S.tore(bc, 0.085, 0.009, { op: 'creuser', r: [0.3, 0, 0], k: 0.004 });
      S.cylindre([bc[0], bc[1] - 0.01, bc[2] + 0.05], [bc[0], bc[1] - 0.01, bc[2] + 0.1], 0.028, { op: 'creuser', k: 0.006 });
      S.sphere([bc[0], bc[1] - 0.01, bc[2] + 0.07], 0.018, { mat: 'bronzeClair', k: 0.004 });
      // bras gauche, poing sur la hanche
      S.capsule([-0.18, 0.79, 0], [-0.3, 0.62, -0.03], [0.06, 0.052], { mat: B, k: 0.04 });
      S.capsule([-0.3, 0.62, -0.03], [-0.19, 0.53, 0.06], [0.052, 0.045], { mat: B, k: 0.03 });
      S.sphere([-0.18, 0.525, 0.075], 0.05, { mat: B, k: 0.02 });
      // tête : crâne rond, joues, menton, nez, yeux creusés, sourcils, oreilles, mèches, casquette
      S.capsule([0, 0.82, 0], [0, 0.9, 0.01], 0.05, { mat: B, k: 0.03 });
      S.groupe({ t: [0, 0.9, 0.01], r: [-(o.regard ?? 0.32), 0, -0.1] }, () => S.groupe({ t: [0, 0.13, 0] }, () => {
        S.ellipsoide([0, 0, 0], [0.19, 0.185, 0.18], { mat: B, k: 0.04 });
        S.ellipsoide([0, -0.08, 0.06], [0.14, 0.1, 0.12], { mat: B, k: 0.05 });
        S.ellipsoide([0, -0.025, 0.178], [0.022, 0.028, 0.022], { mat: B, k: 0.02 });
        S.miroirX(() => {
          S.ellipsoide([0.072, 0.01, 0.16], [0.03, 0.038, 0.03], { op: 'creuser', k: 0.012 });
          S.sphere([0.07, 0.008, 0.155], 0.016, { mat: 'bronzeClair', k: 0.006 });
          S.ellipsoide([0.075, 0.065, 0.155], [0.045, 0.012, 0.02], { mat: B, k: 0.012, r: [0, 0, 0.15] });
          S.ellipsoide([0.188, -0.01, -0.005], [0.028, 0.048, 0.035], { mat: B, k: 0.015 });
          S.capsule([0.13, 0.07, 0.12], [0.16, -0.06, 0.1], [0.04, 0.02], { mat: B, k: 0.02 });   // mèches sur les tempes
        });
        S.capsule([-0.045, -0.085, 0.165], [0.045, -0.085, 0.165], 0.009, { op: 'creuser', k: 0.008 });
        for (const [x, y] of [[-0.12, -0.02], [0, -0.04], [0.12, -0.02], [-0.07, -0.1], [0.07, -0.1]]) S.sphere([x, y, -0.13], 0.06, { mat: B, k: 0.025 });
        for (const x of [-0.08, -0.02, 0.05]) S.capsule([x, 0.1, 0.16], [x + 0.02, 0.04, 0.19], [0.03, 0.012], { mat: B, k: 0.015 });   // frange
        S.tour([0, 0.045, 0], [[0, 0], [0.2, 0], [0.2, 0.035], [0.18, 0.11], [0.11, 0.16], [0, 0.17]], { lisser: 2, mat: B, k: 0.012 });
        S.sphere([0, 0.212, 0], 0.022, { mat: B, k: 0.006 });
        S.ellipsoide([0, 0.06, 0.205], [0.15, 0.016, 0.12], { mat: B, k: 0.012, r: [-0.12, 0, 0] });
        S.ellipsoide([0, 0.13, 0.17], [0.07, 0.045, 0.02], { op: 'peindre', mat: 'bronzeClair', k: 0.01 });   // écusson
      }));
    });
  },

  /** komainu (chien-lion gardien de temple) assis sur son socle, une patte sur une boule, crinière bouclée */
  komainu(S, o = {}) {
    matieres(S, o);
    const P = o.mat || 'pierre';
    // socle : plinthe, dé, dalle
    S.boite([0, 0.06, 0], [0.42, 0.06, 0.46], { arrondi: 0.02, mat: 'pierreSombre', k: 0.01 });
    S.boite([0, 0.26, 0], [0.36, 0.16, 0.4], { arrondi: 0.025, mat: P, k: 0.01 });
    S.boite([0, 0.44, 0], [0.4, 0.035, 0.44], { arrondi: 0.02, mat: P, k: 0.01 });
    for (const x of [-0.18, 0, 0.18]) S.boite([x, 0.26, 0.4], [0.06, 0.1, 0.02], { op: 'creuser', k: 0.01 });
    S.groupe({ t: [0, 0.475, -0.02] }, () => {
      // arrière-train assis, cuisses, pattes arrière
      S.miroirX(() => {
        S.ellipsoide([0.17, 0.17, -0.1], [0.13, 0.17, 0.21], { mat: P, k: 0.08 });
        S.ellipsoide([0.2, 0.04, 0.06], [0.065, 0.045, 0.1], { mat: P, k: 0.04 });
        for (let i = -1; i <= 1; i++) S.capsule([0.2 + i * 0.03, 0.03, 0.15], [0.2 + i * 0.03, 0.08, 0.15], 0.004, { op: 'creuser', k: 0.006 });
      });
      // buste dressé, poitrail bombé
      S.ellipsoide([0, 0.4, -0.02], [0.19, 0.3, 0.19], { mat: P, k: 0.09, r: [-0.25, 0, 0] });
      S.ellipsoide([0, 0.45, 0.1], [0.16, 0.2, 0.12], { mat: P, k: 0.07 });
      // patte avant gauche droite, patte avant droite posée sur la boule
      S.capsule([-0.11, 0.45, 0.13], [-0.12, 0.06, 0.2], [0.062, 0.055], { mat: P, k: 0.05 });
      S.ellipsoide([-0.12, 0.04, 0.245], [0.07, 0.045, 0.08], { mat: P, k: 0.03 });
      S.capsule([0.11, 0.45, 0.13], [0.15, 0.22, 0.22], [0.062, 0.055], { mat: P, k: 0.05 });
      S.ellipsoide([0.155, 0.2, 0.26], [0.07, 0.04, 0.075], { mat: P, k: 0.03 });
      S.sphere([0.155, 0.085, 0.27], 0.085, { mat: P, k: 0.015 });
      S.tore([0.155, 0.085, 0.27], 0.085, 0.007, { op: 'creuser', r: [0.5, 0, 0.3], k: 0.004 });
      S.tore([0.155, 0.085, 0.27], 0.085, 0.007, { op: 'creuser', r: [-0.4, 0, 1.3], k: 0.004 });
      for (const [x, z] of [[-0.15, 0.31], [-0.12, 0.32], [-0.09, 0.31], [0.125, 0.33], [0.155, 0.335], [0.185, 0.33]])
        S.capsule([x, x < 0 ? 0.02 : 0.18, z], [x, x < 0 ? 0.07 : 0.22, z - 0.02], 0.004, { op: 'creuser', k: 0.006 });
      // crinière : un grand disque bouclé derrière la tête et sur la nuque, boucles en spirale creusées
      S.groupe({ t: [0, 0.74, 0.02] }, () => {
        S.ellipsoide([0, 0, -0.04], [0.29, 0.27, 0.15], { mat: P, k: 0.06 });
        for (let rang = 0; rang < 3; rang++) {
          const n = 11 + rang * 3, R = 0.15 + rang * 0.065, rr = 0.058 - rang * 0.006;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * 2 * PI + rang * 0.3, x = Math.cos(a) * R, y = Math.sin(a) * R * 0.95 - 0.02, z = 0.07 - rang * 0.05;
            S.sphere([x, y, z], rr, { mat: P, k: 0.018 });
            S.tore([x, y, z + rr * 0.75], rr * 0.42, rr * 0.13, { op: 'creuser', r: [PI / 2, 0, 0], k: 0.006 });
          }
        }
        S.capsule([0, -0.12, -0.12], [0, -0.32, -0.2], [0.17, 0.12], { mat: P, k: 0.06 });
      });
      // tête : face large et plate, sourcils en volutes, gros yeux ronds, nez épaté, gueule ouverte et crocs
      S.groupe({ t: [0, 0.76, 0.13], e: 1.15 }, () => {
        S.ellipsoide([0, 0, 0], [0.16, 0.14, 0.13], { mat: P, k: 0.05 });
        S.ellipsoide([0, -0.055, 0.1], [0.12, 0.08, 0.08], { mat: P, k: 0.05 });
        S.ellipsoide([0, -0.02, 0.17], [0.055, 0.035, 0.04], { mat: P, k: 0.03 });
        S.miroirX(() => {
          S.sphere([0.025, -0.03, 0.205], 0.013, { op: 'creuser', mat: 'pierreSombre', k: 0.006 });
          S.sphere([0.068, 0.045, 0.1], 0.04, { mat: P, k: 0.012 });
          S.sphere([0.07, 0.048, 0.132], 0.016, { op: 'creuser', mat: 'pierreSombre', k: 0.004 });
          S.tore([0.075, 0.1, 0.085], 0.04, 0.016, { mat: P, k: 0.012, r: [1.2, 0, 0.2] });
          S.sphere([0.12, 0.11, 0.07], 0.028, { mat: P, k: 0.015 });
          S.ellipsoide([0.16, 0.03, -0.01], [0.03, 0.07, 0.05], { mat: P, k: 0.02, r: [0.3, 0, -0.5] });
          S.ellipsoide([0.06, -0.075, 0.13], [0.05, 0.035, 0.04], { mat: P, k: 0.025 });
        });
        S.ellipsoide([0, -0.12, 0.12], [0.085, 0.035, 0.07], { op: 'creuser', mat: 'creux', k: 0.012 });
        S.miroirX(() => { S.capsule([0.055, -0.095, 0.165], [0.05, -0.13, 0.168], [0.013, 0.004], { mat: P, k: 0.004 }); S.capsule([0.05, -0.16, 0.15], [0.048, -0.13, 0.155], [0.011, 0.004], { mat: P, k: 0.004 }); });
        S.ellipsoide([0, -0.165, 0.1], [0.075, 0.03, 0.06], { mat: P, k: 0.025 });
      });
      // queue en flammes bouclées, dressée dans le dos
      S.capsule([0, 0.12, -0.27], [0, 0.42, -0.36], [0.07, 0.05], { mat: P, k: 0.05 });
      for (const [x, y, z, r] of [[0, 0.46, -0.36, 0.06], [-0.07, 0.4, -0.37, 0.045], [0.07, 0.4, -0.37, 0.045], [0, 0.55, -0.33, 0.045], [-0.05, 0.52, -0.35, 0.035], [0.05, 0.52, -0.35, 0.035]])
        S.sphere([x, y, z], r, { mat: P, k: 0.02 });
    });
  },

  /** lanterne de pierre (tōrō, style kasuga) : base hexagonale, fût à anneaux, chambre de lumière, toit retroussé */
  toro(S, o = {}) {
    matieres(S, o);
    const P = o.mat || 'pierre';
    const H6 = { pans: 6, r: [0, PI / 6, 0] };   // une face hexagonale tournée vers le sud
    S.tour([0, 0, 0], [[0, 0], [0.32, 0], [0.32, 0.07], [0.27, 0.11], [0.15, 0.15], [0, 0.15]], { ...H6, lisser: 1, mat: P, k: 0.01 });
    S.tour([0, 0, 0], [[0, 0.13], [0.1, 0.13], [0.085, 0.3], [0.08, 0.6], [0.095, 0.66], [0, 0.66]], { lisser: 2, mat: P, k: 0.02 });
    for (const y of [0.36, 0.39, 0.42]) S.tore([0, y, 0], 0.085, 0.009, { mat: P, k: 0.006 });
    S.tour([0, 0, 0], [[0, 0.64], [0.11, 0.64], [0.23, 0.71], [0.25, 0.75], [0, 0.75]], { ...H6, mat: P, k: 0.01 });
    S.tour([0, 0, 0], [[0, 0.74], [0.165, 0.74], [0.165, 1.0], [0, 1.0]], { ...H6, mat: P, k: 0.008 });
    // fenêtres : un jour carré devant et derrière, des jours en lune sur les autres faces, éclairés de l'intérieur
    S.boite([0, 0.87, 0], [0.06, 0.07, 0.3], { op: 'creuser', mat: 'lumiere', k: 0.006, net: true });
    for (const a of [30, 150, 210, 330]) { const r = (a * PI) / 180; S.sphere([0.16 * Math.cos(r), 0.88, 0.16 * Math.sin(r)], 0.045, { op: 'creuser', mat: 'lumiere', k: 0.006 }); }
    S.sphere([0, 0.87, 0], 0.13, { op: 'peindre', mat: 'lumiere', k: 0.01 });
    // toit retroussé, crosses aux six coins, bouton en oignon
    S.tour([0, 0, 0], [[0, 0.98], [0.33, 0.98], [0.37, 1.03], [0.34, 1.045], [0.22, 1.1], [0.11, 1.17], [0.05, 1.21], [0, 1.22]], { ...H6, lisser: 2, mat: P, k: 0.01 });
    for (let i = 0; i < 6; i++) { const r = (i * PI) / 3; S.sphere([0.335 * Math.cos(r), 1.06, 0.335 * Math.sin(r)], 0.034, { mat: P, k: 0.03 }); }
    S.tour([0, 0, 0], [[0, 1.2], [0.06, 1.2], [0.07, 1.23], [0.05, 1.25], [0.085, 1.29], [0.065, 1.35], [0.025, 1.4], [0, 1.43]], { lisser: 2, mat: P, k: 0.012 });
  },

  /** jarre de terre cuite à anses, frises peintes (désert) */
  jarre(S, o = {}) {
    matieres(S, o);
    const T = o.mat || 'terre';
    S.tour([0, 0, 0], [[0, 0], [0.13, 0], [0.15, 0.02], [0.24, 0.16], [0.27, 0.32], [0.24, 0.48], [0.14, 0.58], [0.11, 0.62], [0.12, 0.66], [0.15, 0.69], [0.15, 0.71], [0.1, 0.71], [0.09, 0.66], [0, 0.66]], { lisser: 2, mat: T, k: 0.01 });
    S.cylindre([0, 0.6, 0], [0, 0.8, 0], 0.085, { op: 'creuser', mat: 'creux', k: 0.01 });
    S.miroirX(() => S.tore([0.2, 0.52, 0], 0.07, 0.018, { r: [PI / 2, 0, 0.5], mat: T, k: 0.02 }));
    S.cylindre([0, 0.3, 0], [0, 0.36, 0], 0.4, { op: 'peindre', mat: 'noir', net: true, k: 0 });
    S.cylindre([0, 0.405, 0], [0, 0.42, 0], 0.4, { op: 'peindre', mat: 'noir', net: true, k: 0 });
    S.cylindre([0, 0.24, 0], [0, 0.255, 0], 0.4, { op: 'peindre', mat: 'noir', net: true, k: 0 });
    for (let i = 0; i < 10; i++) {   // triangles de la frise
      const a = (i / 10) * 2 * PI;
      S.groupe({ r: [0, a, 0] }, () => S.plaque([0, 0.33, 0.265], [[-0.025, -0.02], [0.025, -0.02], [0, 0.022]], 0.04, { op: 'peindre', mat: 'or', net: true, k: 0 }));
    }
  },
};

/** repères pour juger l'inclinaison : un cube d'une case (dalle) à côté d'un socle de statue */
SCULPTURES.reperes = (S, o = {}) => {
  matieres(S, o);
  S.boite([-0.6, 0.5, 0], [0.5, 0.5, 0.5], { arrondi: 0.03, mat: 'pierreSombre', k: 0 });
  S.boite([-0.6, 1.0, 0], [0.47, 0.02, 0.47], { op: 'peindre', mat: 'or', net: true, k: 0 });   // dessus doré : on voit sa profondeur
  S.groupe({ t: [0.75, 0, 0] }, () => socle(S, { mat: 'pierre', l: 0.42, h: 0.6 }));
};

/** socle de statue d'arène refait en volume, aux mesures du sprite gymstatue (46 × 82 px à 64 px par case) :
 *  plinthe, dé appareillé avec sa plaque, corniche — pour montrer ce que le sprite plat devient avec ses dessus */
SCULPTURES.socleGym = (S, o = {}) => {
  S.mat('granit', o.pierre || '#8c8c9a', { grain: 0.07, echelle: 18, patine: '#4a4a56' });
  S.mat('plaque', '#d9b67c', { grain: 0.02, brillance: 0.4 });
  S.mat('rivet', '#6a4a2a', { grain: 0 });
  const G = 'granit';
  S.boite([0, 0.07, 0], [0.36, 0.07, 0.24], { arrondi: 0.015, mat: G, k: 0 });
  S.boite([0, 0.33, 0], [0.25, 0.19, 0.17], { arrondi: 0.012, mat: G, k: 0.005 });
  S.boite([0, 0.595, 0], [0.295, 0.075, 0.21], { arrondi: 0.015, mat: G, k: 0.005 });
  // joints de l'appareil : blocs de la plinthe, de la corniche et du dé
  for (const x of [-0.12, 0.12]) {
    S.boite([x, 0.07, 0], [0.006, 0.08, 0.26], { op: 'creuser', k: 0.004 });
    S.boite([x * 0.82, 0.595, 0], [0.006, 0.08, 0.23], { op: 'creuser', k: 0.004 });
  }
  S.boite([0, 0.07, 0], [0.38, 0.08, 0.006], { op: 'creuser', k: 0.004 });
  S.boite([0, 0.595, 0], [0.31, 0.08, 0.006], { op: 'creuser', k: 0.004 });
  for (const y of [0.27, 0.4]) S.boite([0, y, 0], [0.27, 0.005, 0.19], { op: 'creuser', k: 0.003 });
  // plaque de laiton et ses rivets
  S.boite([0, 0.335, 0.175], [0.15, 0.085, 0.012], { arrondi: 0.008, mat: 'plaque', k: 0.004 });
  for (const x of [-0.125, 0.125]) for (const y of [0.275, 0.395]) S.sphere([x, y, 0.188], 0.009, { mat: 'rivet', k: 0.002 });
};

/** liste pour l'atelier : nom → { titre, options par défaut } */
export const CATALOGUE = {
  dresseur: { titre: 'Statue de dresseur (bronze)', o: {} },
  komainu: { titre: 'Komainu (gardien de temple)', o: {} },
  toro: { titre: 'Lanterne de pierre (tōrō)', o: {} },
  jarre: { titre: 'Jarre à frise (désert)', o: {} },
  socleGym: { titre: 'Socle de statue d\'arène (refait en volume)', o: {} },
  reperes: { titre: 'Repères : cube d\'une case et socle', o: {} },
};
