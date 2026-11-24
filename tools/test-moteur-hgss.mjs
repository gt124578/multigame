// Moteur de terrain façon HeartGold / SoulSilver (odyssee/moteur/) : format des cartes, scripts d'événements,
// déplacements. Joue la zone d'essai de bout en bout dans Node, sans navigateur.
//   node tools/test-moteur-hgss.mjs
import assert from 'node:assert/strict';
const B = new URL('../odyssee/moteur/', import.meta.url).href;
const { Terrain } = await import(B + 'engine/terrain.js');
const { DEMO } = await import(B + 'donnees/demo.js');
const { compiler } = await import(B + 'engine/script.js');
const { COMMANDES } = await import(B + 'engine/commandes.js');
const { valider, preparer } = await import(B + 'engine/carte.js');
const { MB, VITESSE, HAUT, BAS, GAUCHE, DROITE } = await import(B + 'engine/const.js');

let n = 0;
const ok = (nom) => { n++; console.log('  ✓ ' + nom); };

// ——— petits outils pour jouer ———
const tick = (T, e = {}) => T.pas(e);
function tenir(T, dir, k, e = {}) { for (let i = 0; i < k; i++) T.pas({ dir, ...e }); }
function attendre(T, pred, max = 2000, e = {}) {
  for (let i = 0; i < max; i++) { if (pred()) return i; T.pas(e); }
  throw new Error('attente trop longue : ' + pred.toString());
}
const calme = (T) => !T.joueur.m && !T.transition && !T.ui && !T.ctxs.length && !T.combatEnCours;
/** un pas d'une case dans `dir` (avec le demi-tour si besoin) ; rend true si le joueur a bougé */
function pas(T, dir, e = {}) {
  const j = T.joueur, x = j.x, y = j.y;
  for (let i = 0; i < 80; i++) {
    T.pas({ dir, ...e });
    if ((j.x !== x || j.y !== y) && !j.m) return true;
    if (T.transition || T.ui || T.ctxs.length) return true;
  }
  return false;
}
/** se tourner vers `dir` (sans avancer) puis appuyer sur A */
function parler(T, dir) { tenir(T, dir, 3); attendre(T, () => !T.joueur.m, 100); T.pas({ a: true }); }
function marcher(T, dir, k, e = {}) { for (let i = 0; i < k; i++) if (!pas(T, dir, e)) return i; return k; }
/** lit les messages (A) jusqu'à ce que le script rende la main ; `reponses` : choix successifs (nombre de bas) */
function lire(T, reponses = [], max = 6000) {
  for (let i = 0; i < max; i++) {
    if (T.combatEnCours) T.terminerCombat(true);
    if (calme(T)) return;
    if (T.ui?.choix && T.ui.vus >= T.ui.texte.length) {
      const k = reponses.shift() ?? 0;
      for (let d = 0; d < k; d++) { T.pas({ dir: BAS }); T.pas({}); }
      T.pas({ a: true }); continue;
    }
    T.pas({ a: T.ui && T.ui.vus >= T.ui.texte.length && !T.ui.lu && i % 2 === 0 });
  }
  throw new Error('les scripts ne rendent pas la main');
}
/** chemin le plus court (largeur d'abord) sur les cases où l'on peut marcher, rebords compris */
async function aller(T, tx, ty, e = {}) {
  const { testerPas } = await import(B + 'engine/objets.js');
  const M = T.M, k = (x, y) => y * M.largeur + x;
  const prev = new Map([[k(T.joueur.x, T.joueur.y), null]]); let file = [[T.joueur.x, T.joueur.y]];
  while (file.length && !prev.has(k(tx, ty))) {
    const f2 = [];
    for (const [x, y] of file) for (let d = 0; d < 4; d++) {
      const r = testerPas(M, { x, y }, d, { objets: T.objets.filter((o) => !o.def.mouvement || o.def.mouvement === 'fixe' || o.def.dresseur) });
      if (!r.ok) continue;
      const [nx, ny] = r.vers;
      if (M.props(nx, ny).glisse) continue;
      if (!prev.has(k(nx, ny)) && !(M.warp(nx, ny) && (nx !== tx || ny !== ty))) { prev.set(k(nx, ny), [x, y, d]); f2.push([nx, ny]); }
    }
    file = f2;
  }
  if (!prev.has(k(tx, ty))) throw new Error(`pas de chemin vers ${tx},${ty}`);
  const dirs = []; let c = k(tx, ty);
  while (prev.get(c)) { const [x, y, d] = prev.get(c); dirs.unshift(d); c = k(x, y); }
  for (const d of dirs) { if (!pas(T, d, e)) throw new Error(`bloqué en allant vers ${tx},${ty} (en ${T.joueur.x},${T.joueur.y})`); if (!calme(T)) return false; }
  return true;
}
const nouveau = (opts = {}) => {
  const T = new Terrain(DEMO, { graine: 7, ...opts });
  T.demarrer({ zone: 'MAISON_2F', x: 14, y: 13, dir: BAS });
  return T;
};

console.log('Format des cartes');
{
  assert.deepEqual(valider(preparer(DEMO)), []);
  const casse = structuredClone({ ...DEMO, blocs: {} });
  Object.assign(casse.blocs, DEMO.blocs);
  casse.zones.BOURG_GEON.warps[0] = { x: 71, y: 8, vers: 'LABO_ORME', n: 4 };
  casse.zones.ROUTE_29.objets[0] = { ...casse.zones.ROUTE_29.objets[0], x: 0, y: 0 };
  const err = valider(preparer(casse));
  assert.ok(err.some((e) => e.includes('LABO_ORME#4')), 'téléporteur vers un numéro absent');
  assert.ok(err.some((e) => e.includes('gamin') && e.includes('bloquée')), 'objet sur une case bloquée');
  assert.throws(() => new Terrain(casse), /données invalides/);
  ok('la zone d\'essai est valide ; un téléporteur cassé ou un PNJ dans un mur sont refusés au chargement');
  const T = nouveau();
  const M = T.M;
  assert.equal(M.id, 'maison_2f');
  T.chargerMonde('jotho');
  assert.equal(T.M.largeur, 96); assert.equal(T.M.zone(10, 12).id, 'ROUTE_29'); assert.equal(T.M.zone(70, 12).id, 'BOURG_GEON');
  assert.equal(T.M.mb(71, 8), MB.PORTE); assert.ok(T.M.bloquee(70, 8), 'le mur du labo bloque');
  assert.equal(T.M.hauteurCase(20, 16), 1); assert.equal(T.M.hauteurCase(20, 22), 0);
  assert.ok(T.M.bloquee(-1, 5) && T.M.bloquee(96, 5), 'hors du monde : bloqué');
  ok('un monde de trois blocs, deux zones ; portes, murs, hauteurs et bords lus case par case');
}

console.log('Langage de scripts');
{
  const erreurs = [
    ['script A\n  danser\n  fin', /x:2 : commande inconnue « danser »/],
    ['script A\n  aller Nulle\n', /x:2 : étiquette inconnue « Nulle »/],
    ['script A\n  message Bonjour\n', /x:2 : message : texte entre guillemets attendu/],
    ['script A\n  attendre beaucoup\n', /x:2 : attendre : nombre attendu/],
    ['script A\n  si drapeau X sauter Y\n', /« aller » ou « appeler »/],
    ['script A\nscript A\n', /x:2 : A défini deux fois/],
    ['mouvement M\n  haut 2\n  voler\nfin', /x:3 : pas de mouvement inconnu « voler »/],
    ['script A\n  message "pas fermé\n', /guillemet non fermé/],
  ];
  for (const [src, re] of erreurs) assert.throws(() => compiler(src, 'x', COMMANDES), re);
  ok('erreurs signalées à la compilation, avec la ligne : ' + erreurs.length + ' cas');
  const p = compiler('script A\n  si non drapeau X aller B\n  var V 3\nB:\n  ajouter V 2\n  fin\nmouvement M\n  vite_haut 2\n  regard_bas\n  saut_droite\nfin', 'x', COMMANDES);
  assert.ok(p.entrees.has('A') && p.etiquettes.has('B') && p.mouvements.get('M').length === 3);
  ok('étiquettes, conditions, mouvements compilés');
  // boucle sans attente : arrêtée net au lieu de figer le jeu
  const T = nouveau();
  T.scripts.progs.set('MAISON_2F', compiler('script Boucle\nX:\n  aller X\n', 'MAISON_2F', COMMANDES));
  assert.throws(() => T.lancerScript('MAISON_2F', 'Boucle'), /boucle sans attente/);
  ok('une boucle sans attente est arrêtée avec une erreur');
}

console.log('Déplacements');
{
  const T = nouveau(), j = T.joueur;
  // appui bref : demi-tour sur place
  tenir(T, GAUCHE, 3); tenir(T, null, 20);
  assert.deepEqual([j.x, j.y, j.dir], [14, 13, GAUCHE]);
  ok('un appui bref depuis l\'arrêt tourne le joueur sans le faire avancer');
  // marche : 16 pas par case
  const t0 = T.t; pas(T, GAUCHE); assert.equal(T.t - t0, VITESSE.marche); assert.equal(j.x, 13);
  // tenir : enchaîne sans s'arrêter, même en changeant de direction
  const t1 = T.t; tenir(T, DROITE, VITESSE.marche * 3); tenir(T, null, 1);
  assert.equal(j.x, 16, 'trois cases en 48 pas en changeant de sens en marchant');
  void t1;
  ok('marche : une case en 16 pas, enchaînée sans arrêt, changement de sens sans demi-tour');
  // course sans chaussures : non ; mur : pas sur place
  tenir(T, DROITE, 200, { course: true }); assert.equal(j.x, 19); assert.ok(T.vider().some((e) => e.nom === 'heurt'));
  tenir(T, null, 40);
  ok('mur : le joueur s\'arrête et marche sur place (son de heurt)');
}
{
  const T = nouveau(), j = T.joueur;
  T.etat.drapeaux.add('CHAUSSURES');
  pas(T, DROITE, { course: true }); const t0 = T.t; pas(T, DROITE, { course: true });
  assert.equal(T.t - t0, VITESSE.course); assert.ok(j.course === true);
  ok('course : une case en 8 pas avec les chaussures');
}

console.log('Scripts de la maison, téléporteurs, scripts de niveau');
const partie = nouveau();
{
  const T = partie, j = T.joueur;
  await aller(T, 19, 12);
  pas(T, HAUT);
  attendre(T, () => T.zone?.id === 'MAISON_1F' && !T.transition && !j.m);
  assert.deepEqual([j.x, j.y, j.dir], [19, 12, BAS], 'en bas des escaliers, un pas plus bas');
  ok('escalier : on change de carte et l\'on descend d\'une case');
  // script de niveau : la maman appelle (une seule fois)
  attendre(T, () => T.ui);
  assert.match(T.ui.texte, /PR ORME te cherchait/);
  assert.equal(T.objet('maman').dir, DROITE);
  lire(T);
  assert.equal(T.etat.vars.MAMAN_ACCUEIL, 1);
  tenir(T, null, 60); assert.ok(!T.ui, 'le script de niveau ne se relance pas');
  ok('script de niveau (variable = valeur) : la maman appelle à la première descente seulement');
  // parler à la maman
  await aller(T, 17, 13); parler(T, GAUCHE);
  assert.ok(T.ui && /CHAUSSURES/.test(T.ui.texte)); assert.equal(T.objet('maman').dir, DROITE, 'elle se tourne vers le joueur');
  // pendant un script, le joueur ne bouge pas
  tenir(T, BAS, 30); assert.deepEqual([j.x, j.y], [17, 13]);
  lire(T); assert.ok(T.etat.drapeaux.has('CHAUSSURES'));
  tick(T, { a: true }); lire(T); assert.ok(T.etat.drapeaux.has('CHAUSSURES'));
  ok('parler : le PNJ se tourne, le joueur est figé pendant le script, le drapeau change la réplique');
  // tapis de sortie
  await aller(T, 16, 16);
  tenir(T, null, 5); pas(T, BAS);
  attendre(T, () => T.zone?.id === 'BOURG_GEON' && !T.transition && !j.m);
  assert.deepEqual([j.x, j.y, j.dir], [84, 9, BAS], 'devant la porte de la maison');
  assert.ok(T.vider().some((e) => e.type === 'carte'));
  ok('tapis de sortie : on ressort devant la porte, d\'un pas');
}

console.log('Déclencheur au sol, labo, choix');
{
  const T = partie, j = T.joueur;
  await aller(T, 65, 12);
  pas(T, GAUCHE);
  attendre(T, () => T.ui); assert.match(T.ui.texte, /Attends/);
  lire(T);
  assert.equal(j.x, 65, 'renvoyé d\'une case vers le bourg');
  ok('déclencheur au sol (variable = 0) : on ne quitte pas le bourg sans POKéMON');
  await aller(T, 71, 9); pas(T, HAUT);
  attendre(T, () => T.zone?.id === 'LABO_ORME' && !T.transition);
  attendre(T, () => T.ui);
  lire(T, [1]);
  assert.deepEqual(T.etat.equipe.map((p) => p.espece), ['Héricendre']);
  assert.ok(T.etat.drapeaux.has('A_POKEMON') && T.etat.sac.pokedex === 1 && T.etat.vars.ORME_POKEMON === 1);
  assert.deepEqual([j.x, j.y], [15, 12], 'le script a fait monter le joueur jusqu\'au professeur');
  ok('script d\'arrivée : le joueur avance jusqu\'au PR ORME, choix (bas, A), POKéMON et POKéDEX donnés');
  // sortie du labo, passage vers la route
  await aller(T, 15, 17); pas(T, BAS);
  attendre(T, () => T.zone?.id === 'BOURG_GEON' && !T.transition && !j.m);
  assert.deepEqual([j.x, j.y], [71, 9]);
  await aller(T, 63, 12);
  assert.equal(T.zone.id, 'ROUTE_29');
  assert.ok(T.vider().some((e) => e.type === 'zone' && e.nom === 'Route 29' && e.annonce));
  ok('passage du bourg à la route sans chargement : la zone change (nom, musique)');
}

console.log('Dresseur');
{
  const T = partie, j = T.joueur;
  T.compteurRencontre = 1e9;   // pas de rencontre sauvage pendant ce passage
  T.vider();
  for (let i = 0; i < 30 && !T.ctxs.length; i++) pas(T, GAUCHE);
  assert.equal(j.x, 47, 'arrêté dans le regard du gamin');
  for (let i = 0; i < 600 && !T.combatEnCours; i++) T.pas({ a: !!T.ui && T.ui.vus >= T.ui.texte.length && i % 2 === 0 });
  assert.ok(T.combatEnCours);
  const g = T.objet('gamin');
  assert.deepEqual([g.x, g.y], [47, 11], 'le dresseur s\'est approché jusqu\'à la case voisine');
  assert.equal(j.dir, HAUT, 'le joueur se tourne vers lui');
  const ev = T.vider();
  assert.ok(ev.some((e) => e.nom === 'exclamation') && ev.some((e) => e.type === 'combat' && e.nom === 'Gamin Tom'));
  T.terminerCombat(true); lire(T);
  assert.ok(T.etat.drapeaux.has('DRESSEUR_ROUTE_29_gamin'));
  pas(T, DROITE); pas(T, GAUCHE); pas(T, GAUCHE);
  assert.ok(calme(T), 'un dresseur battu ne défie plus');
  pas(T, DROITE); parler(T, HAUT);
  assert.match(T.ui.texte, /entraîner/); lire(T);
  ok('dresseur : « ! », il approche, combat, drapeau ; ensuite il parle sans défier');
  T.compteurRencontre = 0;
}

console.log('Rebords, hauteurs, objets au sol');
{
  const T = partie, j = T.joueur;
  T.compteurRencontre = 1e9;
  await aller(T, 40, 5);
  const t0 = T.t; pas(T, BAS);
  assert.deepEqual([j.x, j.y], [40, 7]); assert.equal(T.t - t0, VITESSE.saut);
  pas(T, HAUT); assert.deepEqual([j.x, j.y], [40, 7], 'on ne remonte pas un rebord');
  ok('rebord : saut de deux cases vers le bas seulement');
  await aller(T, 14, 22);
  pas(T, HAUT); assert.equal(j.y, 22, 'le plateau ne se gravit pas par le côté');
  await aller(T, 15, 22); pas(T, HAUT); pas(T, HAUT);
  assert.deepEqual([j.x, j.y], [15, 20]); assert.equal(T.M.hauteurCase(j.x, j.y), 1);
  ok('hauteurs : on monte sur le plateau par les marches, pas par les côtés');
  await aller(T, 20, 17); parler(T, HAUT);
  assert.match(T.ui.texte, /trouve une POTION/); lire(T);
  assert.equal(T.etat.sac.potion, 1); assert.ok(!T.objet('potion_plateau').visible);
  pas(T, HAUT); assert.deepEqual([j.x, j.y], [20, 16], 'l\'objet ramassé ne bloque plus');
  ok('objet au sol : ramassé, caché par son drapeau, la case se libère');
  T.compteurRencontre = 0;
}

console.log('Rencontres');
{
  const T = partie, j = T.joueur;
  await aller(T, 10, 16);
  let combats = 0;
  for (let i = 0; i < 200; i++) {
    pas(T, i % 2 ? GAUCHE : DROITE);
    if (T.combatEnCours) { combats++; assert.equal(T.combatEnCours.type, 'sauvage'); assert.ok(['Fouinette', 'Roucool', 'Hoothoot'].includes(T.combatEnCours.espece)); T.terminerCombat(true); }
  }
  assert.ok(combats > 5 && combats < 60, `${combats} combats en 200 pas dans les herbes`);
  ok(`hautes herbes : ${combats} rencontres en 200 pas, tirées dans la table de la zone`);
  void j;
}

console.log('Grotte, glace');
{
  const T = partie, j = T.joueur;
  await aller(T, 5, 5); pas(T, HAUT);
  attendre(T, () => T.zone?.id === 'GROTTE_GLACE' && !T.transition && !j.m);
  assert.deepEqual([j.x, j.y, j.dir], [14, 14, HAUT], 'sur le tapis, tourné vers la salle');
  await aller(T, 5, 5);
  pas(T, DROITE);
  attendre(T, () => !j.m, 400);
  assert.deepEqual([j.x, j.y], [16, 5], 'glissade arrêtée par la POKé BALL');
  parler(T, DROITE); lire(T); assert.equal(T.etat.sac.poke_ball, 1);
  pas(T, DROITE); attendre(T, () => !j.m, 400);
  assert.deepEqual([j.x, j.y], [21, 5], 'glissade arrêtée par le rocher');
  ok('glace : on glisse jusqu\'au premier obstacle (objet ou rocher), on reprend la main à l\'arrêt');
  pas(T, BAS); attendre(T, () => !j.m, 400); assert.deepEqual([j.x, j.y], [21, 10], 'glissade jusqu\'au sol de la grotte');
  await aller(T, 14, 14); tenir(T, null, 3); pas(T, BAS);
  attendre(T, () => T.zone?.id === 'ROUTE_29' && !T.transition && !j.m);
  assert.deepEqual([j.x, j.y], [5, 5]);
  ok('sortie de la grotte devant son entrée');
}

console.log('Vélo, surf');
{
  const T = partie, j = T.joueur;
  T.compteurRencontre = 1e9;
  await aller(T, 75, 21); pas(T, HAUT);
  attendre(T, () => T.zone?.id === 'MAISON_VOISIN' && !T.transition && !j.m);
  await aller(T, 17, 13); parler(T, HAUT); lire(T);
  assert.equal(T.etat.sac.velo, 1);
  tick(T, { velo: true }); tenir(T, null, 3); assert.equal(T.mode, 'marche', 'pas de vélo dans une maison');
  lire(T);
  await aller(T, 15, 15); tenir(T, null, 3); pas(T, BAS);
  attendre(T, () => T.zone?.id === 'BOURG_GEON' && !T.transition && !j.m);
  tick(T, { velo: true }); tenir(T, null, 2); assert.equal(T.mode, 'velo');
  const t0 = T.t; pas(T, BAS); pas(T, BAS); assert.equal(T.t - t0, 2 * VITESSE.velo);
  tick(T, { velo: true }); tenir(T, null, 2); assert.equal(T.mode, 'marche');
  ok('vélo : interdit dans les maisons, une case en 4 pas dehors');
  // le pêcheur donne SURF ; on surfe jusqu'à l'îlot
  await aller(T, 89, 22); parler(T, DROITE); lire(T);
  assert.ok(T.etat.drapeaux.has('CS_SURF'));
  await aller(T, 92, 24); tenir(T, DROITE, 3); tenir(T, null, 10);
  assert.equal(T.M.mb(93, 24), MB.EAU);
  pas(T, DROITE); assert.equal(j.x, 92, 'sans surf, l\'eau bloque');
  parler(T, DROITE); assert.ok(T.ui, 'le surf est proposé'); lire(T, [0]);
  assert.equal(T.mode, 'surf'); assert.deepEqual([j.x, j.y], [93, 24]);
  pas(T, DROITE); assert.equal(T.mode, 'marche', 'on débarque sur l\'îlot');
  assert.deepEqual([j.x, j.y], [94, 24]);
  parler(T, DROITE); lire(T); assert.equal(T.etat.sac.baie_oran, 1);
  ok('surf : proposé face à l\'eau avec la CS, on traverse, on débarque sur la terre');
}

console.log('Déterminisme, sauvegarde');
{
  const jouer = (T) => {
    const r = (s => () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296)(42);
    for (let i = 0; i < 4000; i++) {
      const v = r();
      T.pas({ dir: v < 0.6 ? (v * 10 | 0) % 4 : null, a: v > 0.97, course: v > 0.3 });
      if (T.combatEnCours) T.terminerCombat(true);
    }
    return T.empreinte();
  };
  const a = nouveau(), b = nouveau();
  a.etat.drapeaux.add('CHAUSSURES'); b.etat.drapeaux.add('CHAUSSURES');
  assert.equal(jouer(a), jouer(b));
  ok('même graine, mêmes touches → même état après 4 000 pas (PNJ, scripts, rencontres)');
  const s = partie.sauvegarder();
  const c = new Terrain(DEMO, { graine: 7 }); c.demarrer({ sauvegarde: s });
  assert.equal(c.sauvegarder(), s);
  assert.deepEqual([c.joueur.x, c.joueur.y, c.zone.id], [partie.joueur.x, partie.joueur.y, partie.zone.id]);
  assert.ok(!c.objet('baie_ile') || c.objet('baie_ile').visible === partie.objet('baie_ile').visible);
  ok('sauvegarde → chargement → même sauvegarde (drapeaux, variables, sac, équipe, position)');
}

console.log(`\n${n} vérifications passées.`);
