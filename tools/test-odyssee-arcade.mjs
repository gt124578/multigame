// tools/test-odyssee-arcade.mjs — bornes d'arcade du Casino de Métropole : Tétra-Chute, Invasion, Casse-Briques, Abo le Serpent
import * as A from '../odyssee/js/core/arcade.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('ÉCHEC :', m); } };

/* ---------- Tétra-Chute ---------- */
{
  // rotations : quatre quarts de tour reviennent au départ ; la barre passe d'horizontale à verticale
  for (const k of Object.keys(A.PIECES)) ok(JSON.stringify(A.cellules(k, 4)) === JSON.stringify(A.cellules(k, 0)), `${k} : 4 rotations = identité`);
  const I1 = A.cellules('I', 1); ok(new Set(I1.map((c) => c[0])).size === 1 && new Set(I1.map((c) => c[1])).size === 4, 'barre verticale après un quart de tour');
  // une ligne complète disparaît, ce qui est au-dessus descend
  const t = A.tetrisNouveau(5);
  for (let x = 0; x < 10; x++) t.grille[19 * 10 + x] = 3;
  t.grille[18 * 10 + 4] = 6;
  const n = A.effacerLignes(t, [19]);
  ok(n === 1 && t.lignes === 1 && t.score === 100 && t.grille[19 * 10 + 4] === 6 && t.grille.slice(0, 190).every((v) => !v), 'ligne effacée, le reste descend, 100 points');
  // quatre lignes d'un coup : 800 × niveau
  const t4 = A.tetrisNouveau(5); t4.niveau = 2;
  for (let y = 16; y < 20; y++) for (let x = 0; x < 10; x++) t4.grille[y * 10 + x] = 1;
  A.effacerLignes(t4, [16, 17, 18, 19]); ok(t4.score === 1600, 'quatre lignes au niveau 2 : 1 600 points');
  // les murs bloquent ; la rotation contre un mur décale la pièce
  const t2 = A.tetrisNouveau(9); t2.piece = { k: 'T', rot: 0, x: 0, y: 5 };
  ok(!A.tetrisBouger(t2, -1), 'mur de gauche');
  t2.piece = { k: 'I', rot: 1, x: -2, y: 5 };
  ok(A.tetrisPeut(t2, 'I', 1, -2, 5) && A.tetrisTourner(t2, 1) && A.cellules('I', t2.piece.rot).every(([cx]) => cx + t2.piece.x >= 0), 'rotation contre le mur : la barre se décale');
  // chute directe : la pièce se pose tout en bas
  const t3 = A.tetrisNouveau(3); const k = t3.piece.k, rows = A.tetrisLacher(t3);
  ok(rows > 15 && t3.grille.slice(180).some((v) => v === A.PIECES[k].c) && t3.score === rows * 2, 'chute directe : posée en bas, 2 points par ligne');
  // la gravité accélère avec le niveau
  ok(A.vitesseTetris(1) > A.vitesseTetris(5) && A.vitesseTetris(5) > A.vitesseTetris(10) && A.vitesseTetris(30) >= 0.05, 'niveaux de plus en plus rapides');
  // une partie jouée au hasard finit par se terminer, sans case hors de la grille
  const tp = A.tetrisNouveau(11); let pas = 0;
  while (!tp.fini && pas < 200000) { const x = tp.r(); if (x < 0.2) A.tetrisBouger(tp, -1); else if (x < 0.4) A.tetrisBouger(tp, 1); else if (x < 0.5) A.tetrisTourner(tp, 1); A.tetrisPas(tp, 1 / 30, { bas: x > 0.9 }); pas++; }
  ok(tp.fini && tp.grille.length === 200 && tp.pieces > 10, `partie au hasard terminée (${tp.pieces} pièces)`);
  // un joueur « parfait » qui remplit les lignes avec des barres verticales et des carrés en marque
  const tb = A.tetrisNouveau(1); tb.grille.fill(0);
  for (let y = 16; y < 20; y++) for (let x = 0; x < 9; x++) tb.grille[y * 10 + x] = 2;
  tb.piece = { k: 'I', rot: 1, x: 7, y: 0 }; A.tetrisLacher(tb);
  for (let i = 0; i < 20 && tb.effaces.length; i++) A.tetrisPas(tb, 0.05);
  ok(tb.lignes === 4, `barre verticale dans le puits : quatre lignes (${tb.lignes})`);
  // niveau suivant toutes les dix lignes
  const tn = A.tetrisNouveau(2); tn.lignes = 9; for (let x = 0; x < 10; x++) tn.grille[190 + x] = 1; A.effacerLignes(tn, [19]); ok(tn.niveau === 2, 'niveau 2 à dix lignes');
}

/* ---------- Invasion ---------- */
{
  const s = A.invadersNouveau(4);
  ok(s.aliens.length === 55 && s.abris.length === 4, '55 envahisseurs, 4 abris');
  // un tir sous un envahisseur le touche
  const cible = s.aliens.find((a) => a.l === 4 && a.c === 5);
  s.abris = []; s.joueur.x = cible.x - 1; s.tirJ = { x: cible.x + 4, y: cible.y + 20 };
  for (let i = 0; i < 20 && s.tirJ; i++) A.invadersPas(s, 1 / 60);
  ok(!cible.vivant && s.score === A.POINTS_ALIEN[4], 'tir : envahisseur du bas touché, 10 points');
  // la formation repart dans l'autre sens au bord, en descendant
  const s2 = A.invadersNouveau(1); const y0 = s2.aliens[0].y; let tours = 0;
  for (let i = 0; i < 6000 && s2.dir === 1; i++) { A.invadersPas(s2, 1 / 60); tours++; }
  ok(s2.dir === -1 && s2.aliens[0].y === y0 + 6, 'au bord : demi-tour et descente de 6 pixels');
  // moins il en reste, plus ils vont vite
  const s3 = A.invadersNouveau(1); const lent = A.intervalleInvaders(s3); s3.aliens.slice(5).forEach((a) => { a.vivant = false; }); ok(A.intervalleInvaders(s3) < lent / 3, 'les derniers envahisseurs accélèrent');
  // les abris s'effritent sous les tirs
  const s4 = A.invadersNouveau(2); const ab = s4.abris[1], plein = ab.bits.flat().filter(Boolean).length;
  ok(A.abriTouche(s4, ab.x + 10, ab.y + 2) && ab.bits.flat().filter(Boolean).length < plein, 'un abri touché perd des pixels');
  ok(!A.abriTouche(s4, ab.x + 11, ab.y + 12), 'le passage sous l\'abri est vide');
  // un tir ennemi sur le canon : une vie de moins
  const s5 = A.invadersNouveau(3); s5.abris = []; s5.tTirA = 99; s5.tirsA = [{ x: s5.joueur.x + 5, y: s5.joueur.y - 6 }];
  for (let i = 0; i < 30; i++) A.invadersPas(s5, 1 / 60);
  ok(s5.vies === 2 && s5.joueur.mort > 0, 'canon touché : une vie en moins');
  // vague détruite : la suivante arrive (un peu plus bas)
  const s6 = A.invadersNouveau(3); s6.aliens.forEach((a) => { a.vivant = false; }); A.invadersPas(s6, 1 / 60); for (let i = 0; i < 120; i++) A.invadersPas(s6, 1 / 60);
  ok(s6.vague === 2 && s6.aliens.filter((a) => a.vivant).length === 55 && s6.aliens[0].y > 26, 'vague suivante');
  // sans rien faire, la formation finit par atteindre le canon
  const s7 = A.invadersNouveau(8); s7.vies = 99; let k = 0; while (!s7.fini && k < 60 * 600) { A.invadersPas(s7, 1 / 60); s7.vies = 99; k++; }
  ok(s7.fini, 'la formation descend jusqu\'au canon : fin de partie');
}

/* ---------- Casse-Briques ---------- */
{
  const b = A.briquesNouveau(3); const n0 = b.briques.length;
  ok(n0 === 60 && b.balle.colle, '60 briques, balle sur la raquette');
  A.briquesPas(b, 1 / 60, { tir: true }); ok(!b.balle.colle && b.balle.vy < 0, 'la balle part vers le haut');
  // une raquette qui suit la balle ne la perd jamais et casse des briques
  for (let i = 0; i < 60 * 120 && !b.fini; i++) {
    const R = b.raquette, cible = b.balle.x - R.w / 2 + 2;
    A.briquesPas(b, 1 / 60, { gauche: R.x > cible + 1, droite: R.x < cible - 1, tir: true });
  }
  ok(b.vies === 3 && (b.briques.length < n0 / 2 || b.niveau > 1), `raquette automatique : ${n0 - b.briques.length} briques cassées, niveau ${b.niveau}, aucune balle perdue`);
  // sans raquette, la balle tombe : une vie de moins
  const b2 = A.briquesNouveau(4); A.briquesPas(b2, 1 / 60, { tir: true }); let i = 0;
  while (b2.vies === 3 && i < 60 * 60) { A.briquesPas(b2, 1 / 60, { gauche: true }); i++; }
  ok(b2.vies === 2 && b2.balle.colle, 'balle perdue : une vie en moins, nouvelle balle sur la raquette');
  // jamais de balle hors du terrain
  const b3 = A.briquesNouveau(5); let dehors = 0;
  for (let j = 0; j < 60 * 90 && !b3.fini; j++) { A.briquesPas(b3, 1 / 60, { tir: true, gauche: b3.r() < 0.5, droite: b3.r() < 0.5 }); if (b3.balle.x < 3 || b3.balle.x > b3.w - 6 || b3.balle.y < 15) dehors++; }
  ok(dehors === 0, 'la balle reste dans les murs');
}

/* ---------- Abo le Serpent ---------- */
{
  const s = A.serpentNouveau(2); s.baie = [12, 10];
  for (let i = 0; i < 2; i++) A.serpentPas(s, s.inter);
  ok(s.baies === 1 && s.score === 10, 'la baie est mangée');
  for (let i = 0; i < 3; i++) A.serpentPas(s, s.inter);
  ok(s.corps.length === 6, 'le serpent grandit');
  ok(!A.serpentTourner(s, 'gauche'), 'pas de demi-tour');
  ok(A.serpentTourner(s, 'haut'), 'virage');
  // contre le mur : fin
  const s2 = A.serpentNouveau(3); s2.baie = [0, 0]; let k = 0; while (!s2.fini && k < 100) { A.serpentPas(s2, s2.inter); k++; }
  ok(s2.fini && s2.corps[0][0] === A.GRILLE_SERPENT.cols - 1, 'le mur arrête la partie');
  // se mordre la queue : fin
  const s3 = A.serpentNouveau(3); s3.baie = [0, 19]; s3.corps = [[10, 10], [9, 10], [8, 10], [8, 11], [9, 11], [10, 11], [11, 11]];
  A.serpentTourner(s3, 'bas'); A.serpentPas(s3, s3.inter); ok(s3.fini, 'se mordre la queue');
  // suivre sa propre queue (qui avance) est permis
  const s4 = A.serpentNouveau(3); s4.baie = [0, 19]; s4.corps = [[10, 10], [10, 11], [11, 11], [11, 10]]; s4.dir = 'droite';
  A.serpentPas(s4, s4.inter); ok(!s4.fini, 'la tête prend la place de la queue qui part');
}

/* ---------- scores et récompenses ---------- */
{
  const sc = [900, 500]; ok(A.classer(sc, 1000) === 0 && sc[0] === 1000, 'nouveau record');
  ok(A.classer(sc, 10) === 3 && sc.length === 4, 'quatrième');
  sc.push(800, 700, 600); sc.sort((a, b) => b - a); sc.length = 5; ok(A.classer(sc, 1) === -1 && sc.length === 5, 'hors du tableau');
  ok(A.recompense('tetris', 0) === 0 && A.recompense('tetris', 3000) === 2 && A.recompense('tetris', 1e9) === 30, 'jetons selon le score, plafonnés');
}
console.log(fails ? `${fails} échec(s)` : 'Bornes d\'arcade : OK');
process.exit(fails ? 1 : 0);
