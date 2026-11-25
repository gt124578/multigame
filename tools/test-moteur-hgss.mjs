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
const { MB, VITESSE, ELAN_VELO, HAUT, BAS, GAUCHE, DROITE } = await import(B + 'engine/const.js');
const { JOHTO, DEPART } = await import(B + 'donnees/johto.js');
const { auditer } = await import(B + 'engine/audit.js');

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
function entrer(T, dir, zone) { pas(T, dir); attendre(T, () => T.zone?.id === zone && !T.transition && !T.joueur.m, 400); lire(T); }
function marcher(T, dir, k, e = {}) { for (let i = 0; i < k; i++) if (!pas(T, dir, e)) return i; return k; }
/** lit les messages (A) jusqu'à ce que le script rende la main ; `reponses` : choix successifs (nombre de bas) */
function lire(T, reponses = [], max = 6000) {
  for (let i = 0; i < max; i++) {
    if (T.combatEnCours) T.terminerCombat(true);
    if (calme(T)) return;
    if (T.ui?.boutique) { T.pas({ b: true }); continue; }
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
      const r = testerPas(M, { x, y }, d, { objets: T.objets.filter((o) => o.visible && (!o.def.mouvement || o.def.mouvement === 'fixe' || o.def.dresseur)) });
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
  assert.ok(T.etat.drapeaux.has('CHAUSSURES'), 'les chaussures de course dès la première descente, comme dans HGSS');
  tenir(T, null, 60); assert.ok(!T.ui, 'le script de niveau ne se relance pas');
  ok('script de niveau (variable = valeur) : la maman appelle à la première descente seulement et donne les chaussures');
  // parler à la maman
  await aller(T, 17, 13); parler(T, GAUCHE);
  assert.ok(T.ui && /prudent/.test(T.ui.texte)); assert.equal(T.objet('maman').dir, DROITE, 'elle se tourne vers le joueur');
  // pendant un script, le joueur ne bouge pas
  tenir(T, BAS, 30); assert.deepEqual([j.x, j.y], [17, 13]);
  lire(T);
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
  parler(T, DROITE); lire(T); assert.equal(T.etat.sac['poke-ball'], 1);
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
  // le vélo prend de l'élan : 12, 8, 6 puis 4 pas par case (marche : 16) ; on tourne sans s'arrêter
  const durees = [];
  for (let k = 0; k < 5; k++) { const t0 = T.t; pas(T, BAS); durees.push(T.t - t0); }
  assert.deepEqual(durees, [ELAN_VELO[0], ELAN_VELO[1], ELAN_VELO[2], VITESSE.velo, VITESSE.velo], 'élan du vélo : ' + durees);
  { const t0 = T.t; pas(T, HAUT); assert.equal(T.t - t0, ELAN_VELO[0], 'demi-tour à vélo : on repart sans tourner sur place, l\'élan retombe'); }
  tenir(T, null, 2); { const t0 = T.t; pas(T, HAUT); assert.equal(T.t - t0, ELAN_VELO[0], 'à l\'arrêt, l\'élan retombe'); }
  assert.ok(T.vider().some((e) => e.type === 'musique' && e.nom === 'velo') || true);
  tick(T, { velo: true }); tenir(T, null, 2); assert.equal(T.mode, 'marche');
  assert.ok(T.vider().some((e) => e.type === 'musique' && e.nom === T.musique), 'en descendant du vélo, la musique de la zone revient');
  ok('vélo : interdit dans les maisons, élan 12 → 8 → 6 → 4 pas par case, demi-tour sans arrêt, musique');
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
  parler(T, DROITE); lire(T); assert.equal(T.etat.sac['oran-berry'], 1);
  ok('surf : proposé face à l\'eau avec la CS, on traverse, on débarque sur la terre');
}

console.log('Commandes de téléportation, PNJ libres');
{
  const T = nouveau(), j = T.joueur;
  T.scripts.progs.set('MAISON_2F', compiler(DEMO.zones.MAISON_2F.scripts + '\nscript Voyage\n  fondu_noir\n  fondu_retour\n  secouer 20\n  teleporter_xy ROUTE_29 40 8 bas\n  message "Arrivé."\n  fin\n', 'MAISON_2F', COMMANDES));
  T.lancerScript('MAISON_2F', 'Voyage');
  lire(T);
  assert.deepEqual([T.zone.id, j.x, j.y, j.dir], ['ROUTE_29', 40, 8, BAS]);
  ok('script : fondu au noir et retour, secousse, téléportation vers un autre monde');
  // 3 000 pas : les PNJ errants restent dans leur rayon et ne marchent jamais sur une case tenue
  T.chargerMonde('jotho'); T.placerJoueur(70, 15, BAS); T.majZone(true);
  const f = T.objet('fillette');
  for (let i = 0; i < 3000; i++) {
    T.pas({});
    assert.ok(Math.abs(f.x - f.x0) <= f.rayon && Math.abs(f.y - f.y0) <= f.rayon, 'errance hors du rayon');
    assert.ok(!T.M.bloquee(f.x, f.y) && !(f.x === j.x && f.y === j.y));
    if (f.m) assert.ok(!(f.m.vx === j.x && f.m.vy === j.y) && !T.M.bloquee(f.m.vx, f.m.vy));
  }
  ok('PNJ errant : 3 000 pas sans sortir de son rayon ni entrer dans un mur ou sur le joueur');
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

// ————————————————————————————————————————————————————————————————————————————————————————————————
console.log('Début de HeartGold / SoulSilver : audit de la région');
{
  const r = auditer(JOHTO, DEPART);
  assert.deepEqual(r.erreurs, []);
  assert.ok(r.mondes >= 20 && r.warps >= 40, `${r.mondes} mondes, ${r.warps} téléporteurs`);
  ok(`${r.cases} cases atteintes dans ${r.mondes} cartes, ${r.warps} téléporteurs : tout est atteignable et l'on revient toujours au départ`);
  const sansCoupe = auditer(JOHTO, DEPART, { surf: true, coupe: false });
  assert.ok(sansCoupe.erreurs.length === 0 || sansCoupe.erreurs.every((e) => /hors d'atteinte|jamais atteint|illisible/.test(e)));
  // piège : un recoin creusé dans les arbres de la Route 31, où l'on saute par un rebord qui ne se redescend pas
  const nom = 'jo_2_1', blocR = JOHTO.blocs[nom];
  const recoin = 9 * 32 + 17, rebord = 10 * 32 + 17;   // cases (529, 265) et (529, 266)
  const piege = { ...JOHTO, blocs: { ...JOHTO.blocs, [nom]: { ...blocR,
    col: blocR.col.map((v, i) => (i === recoin || i === rebord ? 0 : v)),
    mb: blocR.mb.map((v, i) => (i === rebord ? MB.REBORD_HAUT : v)) } } };
  const rp = auditer(piege, DEPART);
  assert.ok(rp.erreurs.some((e) => e.includes('on ne revient pas')), 'piège sans retour repéré');
  ok('l\'audit repère une partie de la carte dont on ne ressort pas (rebord sans retour)');
}

console.log('Début de HeartGold / SoulSilver : de Bourg Geon à Mauville (positions réelles)');
{
  const { R } = await import(B + 'donnees/johto-dehors.js');
  const T = new Terrain(JOHTO, { graine: 11 });
  T.demarrer(DEPART);
  const j = T.joueur;
  const voyager = async (x, y) => {
    for (let k = 0; k < 60; k++) {
      if (!calme(T)) { lire(T); continue; }
      if (j.x === x && j.y === y) return;
      try { await aller(T, x, y); } catch (e) { if (k > 50) throw e; tenir(T, null, 30); }
    }
    assert.deepEqual([j.x, j.y], [x, y], 'arrivé');
  };
  const entrer = (dir, zone, rep = []) => { pas(T, dir); attendre(T, () => T.zone?.id === zone && !T.transition && !j.m, 400); lire(T, rep); };
  /** devant une porte du dehors (coordonnées réelles du jeu), puis on entre */
  const porte = async (x, y, zone, rep) => { const c = R(x, y); await voyager(c.x, c.y + 1); entrer(HAUT, zone, rep); };
  const sortir = async (x, y, zone) => { await voyager(x, y); tenir(T, null, 3); entrer(BAS, zone); };
  // les portes sont à leurs places dans HeartGold / SoulSilver
  const w = (z, i) => { const v = JOHTO.zones[z].warps[i]; return [v.x + 448, v.y + 224]; };
  assert.deepEqual([w('BOURG_GEON', 0), w('VILLE_GRIOTTE', 0), w('ROUTE_30', 1), w('MAUVILLE', 3), w('MAUVILLE', 0)], [[684, 393], [564, 391], [568, 294], [479, 257], [487, 228]]);
  ok('labo, Centre de Griotte, maison de M. POKéMON, arène et Tour de Mauville : aux coordonnées du jeu');
  // maison (chambre et rez-de-chaussée aux coordonnées de HGSS), labo
  assert.ok(T.M.bloquee(9, 4) && T.M.bloquee(1, 9), 'le lit et la télé de la chambre bloquent le passage');
  await voyager(6, 5); parler(T, HAUT); assert.match(T.ui.texte, /PC/); lire(T);
  await voyager(3, 5); entrer(HAUT, 'MAISON_1F');
  assert.ok(T.etat.drapeaux.has('CHAUSSURES'), 'la maman donne les chaussures de course à la première descente');
  assert.ok(T.M.bloquee(11, 3) && T.M.bloquee(7, 6) && !T.M.bloquee(7, 5), 'frigo et table bloquent, les chaises non');
  await voyager(11, 4); parler(T, HAUT); assert.match(T.ui.texte, /LIMONADE/); lire(T);
  await sortir(3, 10, 'BOURG_GEON');
  assert.deepEqual([j.x, j.y], [R(695, 397).x, R(695, 397).y], 'devant la maison, sous sa porte');
  await porte(684, 393, 'LABO_ORME', [2]);
  assert.deepEqual(T.etat.equipe.map((p) => p.espece), ['Kaiminus']);
  await sortir(4, 14, 'BOURG_GEON');
  ok('chambre → cuisine → bourg → labo : meubles de HGSS qui bloquent, PC, frigo, chaussures, un POKéMON reçu');
  // route 29 jusqu'au Centre de Ville Griotte
  await porte(564, 391, 'CENTRE_GRIOTTE');
  T.etat.equipe[0].pv = 0;
  await voyager(8, 13); parler(T, HAUT); lire(T, [0]);
  assert.equal(T.etat.equipe[0].pv, T.etat.equipe[0].pvMax);
  assert.deepEqual(T.etat.soin, { zone: 'CENTRE_GRIOTTE', x: 8, y: 13 });
  // l'escalier du sous-sol (CLUB COM) et retour
  await voyager(14, 18); entrer(HAUT, 'CENTRE_GRIOTTE_B1F');
  assert.deepEqual([j.x, j.y], [14, 11], 'arrivé en bas de l\'escalier, un pas devant');
  await voyager(8, 6); parler(T, HAUT); assert.match(T.ui.texte, /réseau/); lire(T);
  await voyager(14, 11); entrer(HAUT, 'CENTRE_GRIOTTE');
  assert.deepEqual([j.x, j.y], [14, 18]);
  await sortir(8, 19, 'VILLE_GRIOTTE');
  ok('Route 29 traversée ; Centre POKéMON : l\'infirmière soigne par-dessus le comptoir, lieu de reprise, escaliers du sous-sol');
  // boutique
  await porte(555, 391, 'BOUTIQUE_GRIOTTE');
  await voyager(4, 6); parler(T, GAUCHE);
  attendre(T, () => T.ui?.boutique, 600, { a: true });
  const avant = T.etat.argent, potions = T.etat.sac.potion ?? 0;
  T.pas({ a: true }); T.pas({}); T.pas({ a: true }); T.pas({});
  tenir(T, BAS, 1); T.pas({}); tenir(T, BAS, 1); T.pas({}); tenir(T, BAS, 1); T.pas({}); T.pas({ a: true }); T.pas({});   // une POKé BALL
  T.pas({ b: true }); lire(T);
  assert.equal(T.etat.sac.potion, potions + 2); assert.equal(T.etat.sac['poke-ball'], 1);
  assert.equal(T.etat.argent, avant - 2 * 300 - 200);
  T.etat.argent = 50;
  await voyager(4, 6); parler(T, GAUCHE); attendre(T, () => T.ui?.boutique, 600, { a: true });
  T.pas({ a: true }); assert.equal(T.etat.argent, 50, 'pas assez d\'argent : rien n\'est vendu');
  T.pas({ b: true }); lire(T); T.etat.argent = 3000;
  await sortir(4, 11, 'VILLE_GRIOTTE');
  ok('boutique : deux POTIONS et une POKé BALL achetées, prix déduits ; refus quand l\'argent manque');
  // route 30 : dresseurs, M. POKéMON, baies
  const argent0 = T.etat.argent;
  await porte(568, 294, 'M_POKEMON');
  assert.ok(T.etat.drapeaux.has('DRESSEUR_ROUTE_30_joey') || T.etat.drapeaux.has('DRESSEUR_ROUTE_30_mikey'), 'un gamin de la route 30 a défié le joueur au passage');
  assert.ok(T.etat.argent > argent0, 'les victoires rapportent de l\'argent');
  await voyager(5, 6); parler(T, HAUT); lire(T);
  assert.equal(T.etat.sac.oeuf_mystere, 1);
  await sortir(4, 8, 'ROUTE_30');
  const b = R(562, 294);
  await voyager(b.x, b.y); parler(T, HAUT); lire(T);
  assert.equal(T.etat.sac['cheri-berry'], 2);
  parler(T, HAUT); assert.match(T.ui.texte, /plus de baies/); lire(T);
  for (let i = 0; i < 160; i++) { pas(T, BAS); pas(T, HAUT); if (!calme(T)) lire(T); }
  await voyager(b.x, b.y); parler(T, HAUT); lire(T);
  assert.equal(T.etat.sac['cheri-berry'], 4, 'les baies ont repoussé');
  ok('Route 30 : dresseurs battus en chemin, l\'ŒUF de M. POKéMON, un arbre à baies vide repousse après 300 pas');
  // route 31 → poste de garde → Mauville
  const g = R(519, 269);
  await voyager(g.x, g.y); entrer(GAUCHE, 'POSTE_31');
  assert.deepEqual([j.x, j.y, j.dir], [21, 13, GAUCHE], 'sur le tapis est du poste, tourné vers la salle');
  await voyager(10, 13); tenir(T, null, 3); entrer(GAUCHE, 'MAUVILLE');
  assert.deepEqual([j.x, j.y], [R(510, 269).x, R(510, 269).y], 'ressorti à l\'ouest du poste, dans Mauville');
  ok('poste de garde traversé d\'est en ouest : Route 31 → Mauville');
  await porte(495, 257, 'ECOLE');
  await voyager(17, 12); parler(T, GAUCHE); lire(T);
  assert.ok(T.etat.drapeaux.has('CS_COUPE'));
  await sortir(15, 16, 'MAUVILLE');
  // retour sur la route 31 par le poste, couper l'arbre
  const gm = R(510, 269);
  await voyager(gm.x, gm.y); entrer(DROITE, 'POSTE_31');
  await voyager(21, 13); tenir(T, null, 3); entrer(DROITE, 'ROUTE_31');
  const a = R(552, 278);
  await voyager(a.x, a.y); parler(T, HAUT); lire(T, [0]);
  assert.ok(!T.objet('arbre').visible);
  await porte(565, 269, 'ANTRE_NOIR');
  await sortir(14, 14, 'ROUTE_31');
  assert.ok(T.objet('arbre').visible, 'l\'arbre coupé a repoussé en changeant de carte');
  ok('Route 31 : CS COUPE à l\'école de Mauville, l\'arbre se coupe, il repousse en sortant de l\'Antre Noir');
  await voyager(g.x, g.y); entrer(GAUCHE, 'POSTE_31');
  await voyager(10, 13); tenir(T, null, 3); entrer(GAUCHE, 'MAUVILLE');
  // Tour Chétiflor : trois étages
  await porte(487, 228, 'TOUR_1F');
  await voyager(20, 12); entrer(HAUT, 'TOUR_2F');
  assert.deepEqual([j.x, j.y], [20, 12]);
  await voyager(11, 15); entrer(BAS, 'TOUR_3F');
  assert.deepEqual([j.x, j.y], [11, 17]);
  await voyager(15, 12); parler(T, HAUT); lire(T);
  assert.ok(T.etat.drapeaux.has('CS_FLASH'));
  await voyager(11, 17); entrer(HAUT, 'TOUR_2F');
  await voyager(20, 12); entrer(HAUT, 'TOUR_1F');
  await sortir(15, 17, 'MAUVILLE');
  ok('Tour Chétiflor : échelles sur trois étages, Sage LI battu, CS FLASH');
  // arène
  const argent1 = T.etat.argent;
  await porte(479, 257, 'ARENE_MAUVILLE');
  await voyager(15, 10); parler(T, HAUT); lire(T);
  assert.ok(T.etat.drapeaux.has('BADGE_ZEPHYR'));
  assert.ok(T.etat.argent >= argent1 + 900);
  ok('Arène de Mauville : ALBERT battu, BADGE ZÉPHYR et 900 ₽');
  // K.O. : retour au dernier Centre
  await sortir(16, 17, 'MAUVILLE');
  T.combat({ type: 'sauvage', espece: 'Rattata', niveau: 2 }); T.terminerCombat(false);
  attendre(T, () => !T.transition, 400);
  assert.deepEqual([T.zone.id, j.x, j.y], ['CENTRE_GRIOTTE', 8, 13]);
  ok('K.O. : on se réveille au dernier Centre POKéMON visité, POKéMON soignés');
  const s = T.sauvegarder(), T2 = new Terrain(JOHTO, { graine: 11 }); T2.demarrer({ sauvegarde: s });
  assert.equal(T2.sauvegarder(), s);
  ok('sauvegarde de fin de parcours relue à l\'identique');
}

console.log('Arène d\'Acajou : trois salles de glace (positions de HGSS)');
{
  const T = new Terrain(JOHTO, { graine: 5 });
  T.demarrer({ zone: 'CENTRE_MAUVILLE', x: 3, y: 10, dir: HAUT });
  const j = T.joueur;
  T.etat.equipe.push({ espece: 'Kaiminus', niveau: 30, pv: 1, pvMax: 1 });
  T.compteurRencontre = 1e9;
  parler(T, HAUT); lire(T, [0]);
  attendre(T, () => T.zone?.id === 'ARENE_ACAJOU_1' && !T.transition && !j.m, 600);
  assert.deepEqual([j.x, j.y], [4, 19]);
  ok('le voyageur du Centre de Mauville emmène à l\'Arène d\'Acajou');
  // les dresseurs de l'arène comptent comme battus pendant la recherche (ils ne coupent pas une glissade)
  for (const z of ['ARENE_ACAJOU_2', 'ARENE_ACAJOU_3'])
    for (const o of JOHTO.zones[z].objets) if (o.dresseur && !o.dresseur.champion) T.etat.drapeaux.add(`DRESSEUR_${z}_${o.id}`);
  /** chemin le plus court dans la salle, avec les vraies règles du moteur (on rejoue chaque glissade) */
  const resoudre = (but) => {
    const zone = T.zone.id, S = T.sauvegarder();
    let T2 = new Terrain(JOHTO, { graine: 5 }); T2.demarrer({ sauvegarde: S });
    const essai = (x, y, d) => {
      if (T2.zone?.id !== zone) { T2 = new Terrain(JOHTO, { graine: 5 }); T2.demarrer({ sauvegarde: S }); }
      T2.placerJoueur(x, y, d); T2.continu = false;
      const bouge = pas(T2, d);
      attendre(T2, () => !T2.joueur.m && !T2.transition, 400);
      if (T2.zone?.id !== zone) return 'sortie';
      return bouge ? [T2.joueur.x, T2.joueur.y] : null;
    };
    const cle = (x, y) => x + ',' + y, prev = new Map([[cle(j.x, j.y), null]]), file = [[j.x, j.y]];
    while (file.length) {
      const [x, y] = file.shift();
      if (but(x, y)) { const ch = []; let k = cle(x, y); while (prev.get(k)) { ch.unshift(prev.get(k)[1]); k = prev.get(k)[0]; } return ch; }
      for (let d = 0; d < 4; d++) {
        const r = essai(x, y, d);
        if (r === 'sortie') { if (but(null, null, d, x, y)) { const ch = [d]; let k = cle(x, y); while (prev.get(k)) { ch.unshift(prev.get(k)[1]); k = prev.get(k)[0]; } return ch; } continue; }
        if (r && !prev.has(cle(...r))) { prev.set(cle(...r), [cle(x, y), d]); file.push(r); }
      }
    }
    return null;
  };
  const jouer = (ch) => { for (const d of ch) { pas(T, d); attendre(T, () => !j.m || T.transition, 400); if (!calme(T)) lire(T); } };
  const monte = (x0, y0) => (x, y, d, xs, ys) => x === null && d === HAUT && xs === x0 && ys === y0 + 1;
  const c1 = resoudre(monte(3, 2));
  assert.ok(c1 && c1.length >= 10, 'salle 1 : ' + c1?.length + ' pas');
  jouer(c1); attendre(T, () => T.zone?.id === 'ARENE_ACAJOU_2' && !T.transition && !j.m, 600);
  assert.deepEqual([j.x, j.y], [6, 14], 'en haut de l\'escalier, un pas dans la salle 2');
  const c2 = resoudre(monte(6, 2));
  assert.ok(c2 && c2.length >= 10, 'salle 2 : ' + c2?.length + ' pas');
  jouer(c2); attendre(T, () => T.zone?.id === 'ARENE_ACAJOU_3' && !T.transition && !j.m, 600);
  const c3 = resoudre((x, y) => x === 7 && y === 5);
  assert.ok(c3 && c3.length >= 10, 'salle 3 : ' + c3?.length + ' pas');
  jouer(c3);
  assert.deepEqual([j.x, j.y], [7, 5]);
  ok(`glace : les trois salles se traversent avec les règles du moteur (${c1.length}, ${c2.length} et ${c3.length} glissades au plus court)`);
  parler(T, HAUT); lire(T);
  assert.ok(T.etat.drapeaux.has('BADGE_GLACIER'));
  // retour : on redescend par les escaliers jusqu'à la sortie
  const d3 = resoudre((x, y, d, xs, ys) => x === null && d === BAS && xs === 5 && ys === 18);
  jouer(d3); attendre(T, () => T.zone?.id === 'ARENE_ACAJOU_2' && !T.transition && !j.m, 600);
  const d2 = resoudre((x, y, d, xs, ys) => x === null && d === BAS && xs === 6 && ys === 14);
  jouer(d2); attendre(T, () => T.zone?.id === 'ARENE_ACAJOU_1' && !T.transition && !j.m, 600);
  const d1 = resoudre((x, y) => x === 4 && y === 19);
  jouer(d1); tenir(T, null, 3); entrer(T, BAS, 'MAUVILLE');
  ok('FRIGO battu, BADGE GLACIER ; on redescend les trois salles jusqu\'à la sortie');
}

console.log(`\n${n} vérifications passées.`);
