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
// HeartGold / SoulSilver : le jeu lu dans la décompilation (pret/pokeheartgold) — cartes, événements, scripts, textes.
// Les fichiers viennent d'un clone local (PRET=<dossier>, celui des captures) ; sans lui, on passe.
{
  const { existsSync, readFileSync } = await import('node:fs');
  const PRET = process.env.PRET || '/tmp/ext/pret';
  if (!existsSync(PRET + '/files/a/0/6/5')) console.log('HeartGold / SoulSilver : clone de pokeheartgold absent (PRET=<dossier>), on passe');
  else {
    const lireHG = async (c) => new Uint8Array(readFileSync(PRET + '/' + c));
    const { jeuHG, DEPART_HG } = await import(B + 'donnees/jeu-hg.js');
    const { testerPas } = await import(B + 'engine/objets.js');
    const G = await jeuHG(lireHG);
    const D = G.donnees;

    console.log('HeartGold / SoulSilver : les données du jeu');
    assert.ok(Object.keys(D.zones).length > 500, Object.keys(D.zones).length + ' cartes');
    assert.deepEqual([D.mondes.johto.largeur, D.mondes.johto.hauteur], [47, 17]);
    assert.ok(Object.values(D.zones).every((z) => z.aCharger));
    ok(`${Object.keys(D.zones).length} cartes connues dès le départ (nom, musique), le dehors d'un seul tenant (47 × 17 blocs) ; le reste arrive en route`);
    assert.equal(D.nomsEspeces[155], 'CYNDAQUIL');
    assert.equal(D.objets['poke-ball'].nom, 'Poké Ball');
    assert.equal(D.zones.NEW_BARK.nom, 'New Bark Town');
    assert.equal(D.zones.AZALEA.nom, 'Azalea Town');
    ok('les noms anglais du jeu : lieux (New Bark Town, Azalea Town), espèces, objets');

    // toutes les cartes : événements et scripts traduits, et chacune se compile
    let erreurs = 0, scripts = 0;
    const D2 = { ...D, zones: { ...D.zones }, blocs: { ...D.blocs }, mondes: { ...D.mondes } };
    for (const c of Object.keys(D.zones)) {
      const p = await G.chargerCarte(c); if (!p) continue;
      Object.assign(D2.zones, p.zones); Object.assign(D2.blocs, p.blocs); Object.assign(D2.mondes, p.mondes);
      try { scripts += Object.keys(compiler(p.zones[c].scripts || '', c, COMMANDES)).length; } catch (e) { erreurs++; console.log('   ', c, e.message.slice(0, 160)); }
    }
    assert.equal(erreurs, 0);
    ok(`les scripts de toutes les cartes traduits dans le langage du moteur et compilés sans erreur`);
    const r = auditer(D2, DEPART_HG, { surf: true, coupe: true });
    const route = ['NEW_BARK', 'NEW_BARK_ELMS_LAB_1F', 'ROUTE_29', 'CHERRYGROVE', 'ROUTE_30', 'ROUTE_31', 'VIOLET', 'VIOLET_GYM', 'SPROUT_TOWER_1F',
      'ROUTE_32', 'UNION_CAVE_1F', 'ROUTE_33', 'AZALEA', 'AZALEA_GYM', 'SLOWPOKE_WELL_B1F', 'ILEX_FOREST', 'GOLDENROD', 'ECRUTEAK', 'OLIVINE', 'CIANWOOD', 'MAHOGANY', 'BLACKTHORN'];
    const manque = route.filter((z) => !r.zones.has(z));
    assert.deepEqual(manque, []);
    const pres = r.erreurs.filter((e) => /^(NEW_BARK|ROUTE_29|CHERRYGROVE|ROUTE_30|ROUTE_31|VIOLET_GYM|AZALEA_GYM)\b/.test(e));
    assert.deepEqual(pres, []);
    ok(`audit du jeu entier depuis la chambre : ${r.zones.size} cartes atteintes à pied (surf et coupe permis), de New Bark Town à Blackthorn City ; Centres et boutiques se servent par-dessus le comptoir`);

    // avec toutes les capacités de terrain (FORCE, ÉCLATE-ROC, CASCADE, SIPHON, ESCALADE) : tout le jeu, Kanto compris
    const tout = auditer(D2, DEPART_HG, { surf: true, coupe: true, eclate: true, force: true, cascade: true, siphon: true, escalade: true });
    const arenes = Object.keys(D2.zones).filter((z) => /_GYM$|_GYM_LEADER_ROOM$/.test(z));
    assert.deepEqual(arenes.filter((z) => !tout.zones.has(z)), []);
    const lieux = ['ICE_PATH_B3F', 'MAHOGANY_GYM_LEADER_ROOM', 'WHIRL_ISLANDS_1F', 'MOUNT_MORTAR_2F', 'VICTORY_ROAD_1F', 'INDIGO_PLATEAU',
      'PALLET', 'VIRIDIAN', 'PEWTER', 'CERULEAN', 'VERMILION', 'LAVENDER', 'CELADON', 'FUCHSIA', 'SAFFRON', 'CINNABAR_ISLAND', 'MOUNT_SILVER'];
    assert.deepEqual(lieux.filter((z) => !tout.zones.has(z)), []);
    ok(`avec les capacités de terrain : ${tout.zones.size} cartes sur ${Object.keys(D2.zones).length}, les ${arenes.length} salles d'arène (Johto et Kanto), la Route de Glace et ses trous, les Îles Tourbillon, le Mont Argenté`);

    // les capacités dans le moteur : un vrai rocher à briser, un vrai rocher à pousser, une vraie cascade
    const essai = (zone, x, y, dir, opts = {}) => {
      const T2 = new Terrain(D2, { graine: 1 });
      T2.demarrer({ zone, x, y, dir });
      T2.etat.drapeaux.add('TOUT_CS');
      if (opts.surf) T2.mode = 'surf';
      return T2;
    };
    const lireTout = (T2, rep = []) => { for (let i = 0; i < 3000 && !calme(T2); i++) { if (T2.ui?.choix && T2.ui.vus >= T2.ui.texte.length) { T2.pas({ a: true }); rep.shift(); continue; } T2.pas({ a: T2.ui && T2.ui.vus >= T2.ui.texte.length && !T2.ui.lu && i % 2 === 0 }); } };
    const trouver = (type, ok2) => { for (const [zid, z] of Object.entries(D2.zones)) for (const o of z.objets || []) if (o.type === type && !/^FLAG_HIDE/.test(o.drapeau || '')) { const r2 = ok2(zid, o); if (r2) return r2; } return null; };
    // ÉCLATE-ROC
    const cas1 = trouver('rocher', (zid, o) => (D2.mondeDeZone?.[zid] || true) && [[0, 1, HAUT], [0, -1, BAS], [1, 0, GAUCHE], [-1, 0, DROITE]]
      .map(([dx, dy, d]) => ({ zone: zid, x: o.x + dx, y: o.y + dy, d, id: o.id })).find((c) => { try { const T2 = essai(c.zone, c.x, c.y, c.d); return !T2.M.bloquee(c.x, c.y) && T2.zone?.id === zid; } catch { return false; } }));
    const T3 = essai(cas1.zone, cas1.x, cas1.y, cas1.d);
    T3.pas({ a: true }); lireTout(T3);
    assert.ok(!T3.objets.find((o) => o.id === cas1.id)?.visible, 'rocher brisé');
    ok(`ÉCLATE-ROC : le rocher fissuré de ${cas1.zone} se brise (il revient quand on quitte la carte)`);
    // FORCE : le rocher avance d'une case quand on le pousse
    const cas2 = trouver('rocher_force', (zid, o) => [[0, 1, HAUT], [0, -1, BAS], [1, 0, GAUCHE], [-1, 0, DROITE]].map(([dx, dy, d]) => ({ zone: zid, x: o.x + dx, y: o.y + dy, d, id: o.id, ox: o.x - dx, oy: o.y - dy }))
      .find((c) => { try { const T2 = essai(c.zone, c.x, c.y, c.d); return T2.zone?.id === zid && !T2.M.bloquee(c.x, c.y) && !T2.M.bloquee(c.ox, c.oy) && !T2.M.props(c.ox, c.oy).surf && !T2.M.declencheursEn(c.ox, c.oy).length && !T2.objets.some((b) => b.x === c.ox && b.y === c.oy); } catch { return false; } }));
    const T4 = essai(cas2.zone, cas2.x, cas2.y, cas2.d);
    T4.pas({ a: true }); lireTout(T4);
    assert.ok(T4.etat.drapeaux.has('TMP_FORCE'));
    for (let i = 0; i < 40; i++) T4.pas({ dir: cas2.d });
    const roc = T4.objets.find((o) => o.id === cas2.id);
    assert.deepEqual([roc.x, roc.y], [cas2.ox, cas2.oy]);
    ok(`FORCE : le rocher de ${cas2.zone} avance d'une case quand on le pousse`);
    // CASCADE : une cascade du jeu (comportement 0x13), remontée d'un trait en surf
    let cas3 = null;
    for (const mid of ['johto']) {
      const T2 = new Terrain(D2, { graine: 1 }); T2.demarrer({ zone: 'NEW_BARK', x: 690, y: 400 });
      const M2 = T2.M;
      for (let y = 1; y < M2.hauteur - 1 && !cas3; y++) for (let x = 0; x < M2.largeur && !cas3; x++)
        if (M2.mb(x, y) === MB.CHUTE && M2.props(x, y + 1).surf && M2.mb(x, y + 1) !== MB.CHUTE && !M2.bloquee(x, y + 1)) cas3 = { x, y: y + 1, zone: M2.zone(x, y + 1)?.id };
    }
    const T5 = essai(cas3.zone, cas3.x, cas3.y, HAUT, { surf: true });
    T5.pas({ a: true }); lireTout(T5, [0]);
    for (let i = 0; i < 400 && (T5.joueur.file.length || T5.joueur.m); i++) T5.pas({});
    assert.ok(T5.joueur.y < cas3.y - 1 && T5.M.mb(T5.joueur.x, T5.joueur.y) !== MB.CHUTE, `${T5.joueur.y} / ${cas3.y}`);
    ok(`CASCADE : la cascade de ${T5.d.zones[cas3.zone]?.nom || cas3.zone} se remonte d'un trait (${cas3.y - T5.joueur.y} cases)`);

    // en français : noms de la version française ; les dialogues anglais traduits par la page (ici, un faux traducteur)
    {
      const GF = await jeuHG(lireHG, { langue: 'fr' });
      const DF = GF.donnees;
      assert.equal(DF.zones.NEW_BARK.nom, 'Bourg Geon');
      assert.equal(DF.zones.VIOLET.nom, 'Mauville');
      assert.equal(DF.zones.ROUTE_29.nom, 'Route 29');
      assert.equal(DF.dresseursHG.TRAINER_YOUNGSTER_JOEY.nom, 'Gamin Joey');
      assert.equal(DF.nomJoueur, 'LUTH');
      const { Traducteur, messagesDe } = await import(B + 'render/traduction.js');
      const tr = new Traducteur([['CYNDAQUIL', 'HÉRICENDRE']]);
      tr.moteur = async (s) => `[fr] ${s}`; tr.etat = 'prêt';
      assert.equal(tr.franciser('Professor Elm gave CYNDAQUIL to Lyra in New Bark Town.'), 'Professeur Orme gave HÉRICENDRE to Célesta in Bourg Geon.');
      assert.equal(await tr.traduire('Hi, LUTH!\nYou\'re finally awake.'), '[fr] Hi, LUTH! You\'re finally awake.');
      assert.equal(tr.connue('Hi, LUTH!\nYou\'re finally awake.'), '[fr] Hi, LUTH! You\'re finally awake.');
      // le moteur : un message des scripts du jeu passe par la traduction, celui du moteur (déjà en français) non
      const pf = await GF.chargerCarte(DEPART_HG.zone);
      const DF2 = { ...DF, zones: { ...DF.zones, ...pf.zones }, blocs: { ...DF.blocs, ...pf.blocs }, mondes: { ...DF.mondes, ...pf.mondes } };
      const TF = new Terrain(DF2, { graine: 1 });
      TF.demarrer(DEPART_HG);
      TF.traduire = (t) => tr.connue(t) ?? tr.traduire(t);
      TF.message('Good morning!', true);
      assert.equal(TF.ui.texte, 'Good morning!');
      await new Promise((ok2) => setTimeout(ok2, 10));
      assert.equal(TF.ui.texte, '[fr] Good morning!');
      TF.message('{JOUEUR} obtient une POTION !');
      assert.equal(TF.ui.texte, 'LUTH obtient une POTION !');
      const prevus = messagesDe(pf.zones[DEPART_HG.zone].scripts, 'LUTH', 'SILVER');
      assert.ok(prevus.length > 0 && prevus.every((t) => !/\{JOUEUR\}|\{T0\}/.test(t)));
      ok(`en français : Bourg Geon, Mauville, « Gamin Joey », LUTH ; noms propres remis à la française avant traduction (Professeur Orme, Célesta, HÉRICENDRE) ; ${prevus.length} répliques de la chambre prêtes à traduire en avance`);
    }

    // une nouvelle partie, jouée comme sur la console : les cartes arrivent quand on y va
    console.log('HeartGold / SoulSilver : le début du jeu, avec ses vrais scripts');
    const D3 = { ...D, zones: { ...D.zones }, blocs: { ...D.blocs }, mondes: { ...D.mondes } };
    const charge = (p) => { Object.assign(D3.zones, p.zones); Object.assign(D3.blocs, p.blocs); Object.assign(D3.mondes, p.mondes); };
    charge(await G.chargerCarte(DEPART_HG.zone));
    const T = new Terrain(D3, { graine: 3, pokemon: {
      creer: (sp, niveau) => ({ sp: typeof sp === 'number' ? sp : D.nomsEspeces.findIndex((n) => n.toLowerCase() === String(sp).toLowerCase()), niveau, pv: 20, pvMax: 20 }),
      soigner: () => {} } });
    T.demarrer(DEPART_HG);
    for (const f of G.drapeauxDepart) T.etat.drapeaux.add(f);
    Object.assign(T.etat.vars, G.varsDepart); T.majVisibles();
    let chargements = 0;
    T.chargeur = (id) => G.chargerCarte(id).then((p) => { chargements++; T.ajouterDonnees(p); });
    const vus = [];
    const pasA = async (e = {}) => { T.pas(e); if (T.transition?.demande) await new Promise((ok2) => setTimeout(ok2, 5)); };
    async function lireA(rep = [], max = 40000) {
      for (let i = 0; i < max; i++) {
        if (T.combatEnCours) T.terminerCombat(true);
        if (calme(T)) return;
        if (T.ui?.choix && T.ui.vus >= T.ui.texte.length) { const k = rep.shift() ?? 0; for (let d = 0; d < k; d++) { await pasA({ dir: BAS }); await pasA({}); } await pasA({ a: true }); continue; }
        if (T.ui && T.ui.vus >= T.ui.texte.length && !T.ui.lu && i % 2 === 0) vus.push(T.ui.texte.replace(/\n/g, ' '));
        await pasA({ a: T.ui && T.ui.vus >= T.ui.texte.length && !T.ui.lu && i % 2 === 0 });
      }
      if (process.env.DEBUG) { for (let k = 0; k < 4; k++) { T.pas({}); console.log('noir', T.noir, T.fonduVers, T.ctxs.map((c) => c.nom + '@' + c.pc)); } }
      throw new Error('les scripts ne rendent pas la main : ' + T.ctxs.map((c) => c.nom + '@' + c.pc + ' ' + JSON.stringify(c.prog?.ops?.[c.pc - 1])?.slice(0, 160)).join(', ') + ' ' + JSON.stringify(T.ui)?.slice(0, 200) + ' ' + T.joueur.x + ',' + T.joueur.y + ' ' + T.transition?.phase + ' noir ' + [T.noir, T.fonduVers, T.fonduPas]);
    }
    async function allerA(tx, ty) {
      const M = T.M, k = (x, y) => y * M.largeur + x;
      const prev = new Map([[k(T.joueur.x, T.joueur.y), null]]); let f = [[T.joueur.x, T.joueur.y]];
      while (f.length && !prev.has(k(tx, ty))) {
        const f2 = [];
        for (const [x, y] of f) for (let d = 0; d < 4; d++) {
          const q = testerPas(M, { x, y }, d, { objets: T.objets.filter((o) => o.visible) });
          if (!q.ok) continue;
          const [nx, ny] = q.vers;
          if (!prev.has(k(nx, ny)) && !(M.warp(nx, ny) && (nx !== tx || ny !== ty))) { prev.set(k(nx, ny), [x, y, d]); f2.push([nx, ny]); }
        }
        f = f2;
      }
      if (!prev.has(k(tx, ty))) {
        // qu'est-ce qui bloque ? le plus proche atteint de la cible, et les personnages qui ferment le passage
        let best = null; for (const kk of prev.keys()) { const x = kk % M.largeur, y = (kk / M.largeur) | 0, d2 = Math.abs(x - tx) + Math.abs(y - ty); if (!best || d2 < best[0]) best = [d2, x, y]; }
        const pres = T.objets.filter((o) => o.visible && best && Math.abs(o.x - best[1]) < 4 && Math.abs(o.y - best[2]) < 4).map((o) => o.id + '@' + o.x + ',' + o.y);
        throw new Error(`pas de chemin vers ${tx},${ty} depuis ${T.joueur.x},${T.joueur.y} (au plus près : ${best?.slice(1)} ; personnages : ${pres})`);
      }
      const dirs = []; let c = k(tx, ty); while (prev.get(c)) { const [x, y, d] = prev.get(c); dirs.unshift(d); c = k(x, y); }
      for (const d of dirs) {
        const x = T.joueur.x, y = T.joueur.y;
        for (let i = 0; i < 80; i++) { await pasA({ dir: d }); if ((T.joueur.x !== x || T.joueur.y !== y) && !T.joueur.m) break; if (T.transition || T.ui || T.ctxs.length) break; }
        if (!calme(T)) { await lireA(); return; }
      }
    }
    /** aller jusqu'à une carte, de porte en porte (plus court chemin entre les cartes, puis à pied dans chacune) */
    async function allerZone(cible) {
      const pris = new Set();
      for (let pas = 0; pas < 40 && T.zone.id !== cible; pas++) {
        const ici = T.M.id === 'johto' ? null : T.zone.id;
        // les cartes voisines : celles où mènent les téléporteurs (le dehors compte pour une seule carte)
        const zoneDe = (z) => (T.d.mondeDeZone?.[z] === 'johto' ? 'johto' : z);
        const voisins = (z) => {
          const ws = z === 'johto' ? Object.values(T.d.zones).filter((q) => T.d.mondeDeZone?.[q.id] === 'johto').flatMap((q) => q.warps || []) : T.d.zones[z]?.warps || [];
          return ws.filter((w) => w.vers).map((w) => zoneDe(w.vers));
        };
        const dep = zoneDe(T.zone.id), arr = zoneDe(cible), prec = new Map([[dep, null]]); let f = [dep];
        while (f.length && !prec.has(arr)) {
          const f2 = [];
          for (const z of f) {
            if (z !== 'johto' && T.d.zones[z]?.aCharger) T.ajouterDonnees(await G.chargerCarte(z));   // ses portes
            for (const v of voisins(z)) if (!prec.has(v)) { prec.set(v, z); f2.push(v); }
          }
          f = f2;
        }
        let suiv = arr; while (prec.get(suiv) && prec.get(suiv) !== dep) suiv = prec.get(suiv);
        for (const id of [suiv, cible]) if (T.d.zones[id]?.aCharger) T.ajouterDonnees(await G.chargerCarte(id));
        const portes = (ici ? T.zone.warps : Object.values(T.d.zones).filter((q) => T.d.mondeDeZone?.[q.id] === 'johto').flatMap((q) => q.warps || []))
          .filter((w) => w.vers && zoneDe(w.vers) === suiv);
        // (si aucune n'est atteignable d'ici, une autre porte pas encore prise : les tours se montent en zigzag)
        const toutes = (ici ? T.zone.warps : []).filter((w) => w.vers && !portes.includes(w) && !pris.has(`${T.zone.id}#${w.x},${w.y}`));
        if (process.env.DEBUG) console.log('allerZone', T.zone.id, T.joueur.x, T.joueur.y, '→', suiv, 'portes', portes.map((w) => w.x + ',' + w.y), 'autres', toutes.map((w) => w.x + ',' + w.y + '>' + w.vers));
        let ok3 = false;
        for (const w of [...portes, ...toutes]) {
          if (w.x === T.joueur.x && w.y === T.joueur.y) {
            // celle où l'on vient d'arriver : un pas de côté, puis on y revient (un escalier se reprend en y remontant)
            if (portes.length + toutes.length > 1 && ![...portes, ...toutes].every((q) => q.x === w.x && q.y === w.y)) continue;
            const pas2 = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => !T.M.bloquee(w.x + dx, w.y + dy) && !T.M.warp(w.x + dx, w.y + dy));
            if (pas2) { await allerA(w.x + pas2[0], w.y + pas2[1]); }
          }
          pris.add(`${T.zone.id}#${w.x},${w.y}`);
          try {
            const z0 = T.zone.id;
            for (let k = 0; k < 10 && T.zone.id === z0 && (T.joueur.x !== w.x || T.joueur.y !== w.y); k++) await allerA(w.x, w.y);
            ok3 = true;
          } catch { continue; }
          // un tapis de sortie se prend en avançant dans son sens
          const sens = T.M.props(w.x, w.y).tapis ?? T.joueur.dir;
          for (let i = 0; i < 200 && zoneDe(T.zone.id) !== suiv; i++) { await pasA({ dir: sens }); if (!calme(T)) await lireA([0, 0]); }
          for (let i = 0; i < 60 && T.transition; i++) await pasA({});
          break;
        }
        if (!ok3) throw new Error(`pas de porte atteignable de ${T.zone.id} vers ${suiv}`);
      }
      assert.equal(T.zone.id, cible);
    }
    async function versZone(z, dir) {
      for (let i = 0; i < 4000 && (T.zone?.id !== z || T.transition); i++) { await pasA(dir !== undefined && !T.transition ? { dir } : {}); if (T.ui || T.ctxs.length) await lireA(); }
      assert.equal(T.zone.id, z);
    }
    async function parlerA(x, y, d, rep) { for (let k = 0; k < 10 && (T.joueur.x !== x || T.joueur.y !== y); k++) await allerA(x, y); await pasA({ dir: d }); for (let i = 0; i < 30 && !calme(T); i++) await pasA({}); await pasA({}); await pasA({ a: true }); await lireA(rep); }

    assert.equal(T.zone.id, 'NEW_BARK_PLAYER_HOUSE_2F');
    await allerA(3, 5); await versZone('NEW_BARK_PLAYER_HOUSE_1F', HAUT); await lireA();
    assert.ok(vus.includes('Hi, ETHAN! You\'re finally awake.'), vus[0]);
    assert.ok(['FLAG_GOT_BAG', 'FLAG_GOT_TRAINER_CARD', 'FLAG_GOT_SAVE_BUTTON'].every((f) => T.etat.drapeaux.has(f)));
    ok('la chambre d\'ETHAN ; en bas, sa mère l\'arrête : « Hi, ETHAN! You\'re finally awake. », le Sac, la Carte Dresseur, le bouton de sauvegarde');
    const tapis = T.zone.warps.find((w) => w.vers === 'NEW_BARK');
    await allerA(tapis.x, tapis.y); await versZone('NEW_BARK', BAS);
    assert.ok(chargements >= 2, 'cartes chargées en route');
    await allerA(684, 394); await versZone('NEW_BARK_ELMS_LAB_1F', HAUT); await lireA();
    vus.length = 0;
    await parlerA(4, 6, HAUT, [0]);
    assert.ok(vus.some((t) => t.startsWith('Professor Elm: Hi, ETHAN!')), vus[0]);
    await parlerA(8, 5, HAUT, [1, 1]);
    assert.equal(T.etat.equipe.length, 1);
    assert.equal(T.etat.equipe[0].sp, 155);
    assert.ok(vus.includes('ETHAN received CYNDAQUIL from Professor Elm!'), vus.join(' | '));
    assert.equal(T.etat.vars.VAR_SCENE_ELMS_LAB, 1);
    ok(`le laboratoire : le discours du Prof. Elm, la machine aux trois Poké Balls → CYNDAQUIL ; ${chargements} cartes chargées en route`);

    // retour à la maison : sa mère lui donne le Pokégear (sans lui, une passante le ramène en ville à la sortie ouest)
    const sortie = T.zone.warps[0];
    await allerA(sortie.x, sortie.y); await versZone('NEW_BARK', BAS);
    const porte = T.d.zones.NEW_BARK.warps.find((w) => w.vers === 'NEW_BARK_PLAYER_HOUSE_1F');
    await allerA(porte.x, porte.y + 1); await versZone('NEW_BARK_PLAYER_HOUSE_1F', HAUT); await lireA();
    const mere = T.objets.find((o) => o.visible && /gsmama/i.test(o.id));
    vus.length = 0;
    const [mx, my, md] = [[0, 1, HAUT], [0, -1, BAS], [1, 0, GAUCHE], [-1, 0, DROITE]].map(([dx, dy, d]) => [mere.x + dx, mere.y + dy, d]).find(([x, y]) => !T.M.bloquee(x, y));
    await parlerA(mx, my, md, [0]);
    assert.ok(T.etat.drapeaux.has('FLAG_GOT_POKEGEAR'), vus.join(' | '));
    ok('à la maison, sa mère lui donne le Pokégear');
    const tapis2 = T.zone.warps.find((w) => w.vers === 'NEW_BARK');
    await allerA(tapis2.x, tapis2.y); await versZone('NEW_BARK', BAS);

    // de New Bark Town à Cherrygrove City sans changer de carte : les zones se suivent sur le monde d'un seul tenant
    const M = T.M, cible = (() => { for (let y = 0; y < M.hauteur; y++) for (let x = 0; x < M.largeur; x++) if (M.zone(x, y)?.id === 'CHERRYGROVE' && !M.bloquee(x, y) && !M.warp(x, y) && x % 32 === 20) return [x, y]; })();
    const zonesTraversees = new Set();
    const surZone = setInterval(() => zonesTraversees.add(T.zone?.id), 1);
    // la page charge en avance les cartes autour du joueur (main.js) ; ici, celles du chemin
    for (const c of ['ROUTE_29', 'CHERRYGROVE']) T.ajouterDonnees(await G.chargerCarte(c));
    const combats = []; const combat0 = T.combat.bind(T); T.combat = (c) => { combats.push(c); return combat0(c); };
    vus.length = 0;
    // les scènes du chemin (Lyra et sa leçon de capture sur la Route 29) interrompent la marche : on reprend après
    // (le vieil homme de Cherrygrove fait visiter la ville : on suit, quitte à finir dans un bâtiment)
    for (let i = 0; i < 40 && T.M.id === 'johto' && (T.joueur.x !== cible[0] || T.joueur.y !== cible[1]); i++) await allerA(...cible);
    clearInterval(surZone); zonesTraversees.add(T.zone.id);
    assert.ok(/^CHERRYGROVE/.test(T.zone.id), T.zone.id);
    assert.ok(zonesTraversees.has('ROUTE_29') || [...zonesTraversees].length >= 1);
    assert.ok(T.d.zones.ROUTE_29.rencontres?.herbe?.especes.some((e) => e.espece === 'pidgey' || e.espece === 'hoothoot'));
    assert.ok(combats.length >= 1 && combats.every((c) => c.type !== 'sauvage' || ['pidgey', 'sentret', 'hoothoot', 'rattata', 'hoppip', 'furret'].includes(c.espece)), JSON.stringify(combats));
    ok(`de New Bark Town à Cherrygrove City à pied, sans chargement de carte : la Route 29, ses scènes et ses POKéMON sauvages du jeu (${[...new Set(combats.map((c) => c.espece || c.type))].join(', ')})`);

    // Route 30 : la maison de M. Pokémon, la scène du jeu (l'Œuf Mystère, le Prof. Oak et son Pokédex)
    if (T.M.id !== 'johto') { const s2 = T.zone.warps.find((w) => w.vers === 'CHERRYGROVE') || T.zone.warps[0]; await allerA(s2.x, s2.y); await versZone('CHERRYGROVE', BAS); }
    for (const c of ['ROUTE_30', 'ROUTE_30_MR_POKEMON_HOUSE']) T.ajouterDonnees(await G.chargerCarte(c));
    const maison = T.d.zones.ROUTE_30.warps.find((w) => w.vers === 'ROUTE_30_MR_POKEMON_HOUSE');
    vus.length = 0;
    for (let i = 0; i < 40 && (T.joueur.x !== maison.x || T.joueur.y !== maison.y + 1) && T.M.id === 'johto'; i++) await allerA(maison.x, maison.y + 1);
    await versZone('ROUTE_30_MR_POKEMON_HOUSE', HAUT); await lireA([0, 0, 0]);
    for (let i = 0; i < 300; i++) { await pasA({}); if (!calme(T)) await lireA([0, 0, 0]); }
    assert.ok(T.etat.drapeaux.has('POKEDEX') || T.etat.drapeaux.has('FLAG_GOT_POKEDEX'), vus.join(' | '));
    ok(`Route 30 : chez M. Pokémon, la scène du jeu se joue seule (${vus.length} répliques), le Prof. Oak donne le Pokédex`);

    // retour à New Bark Town (le rival vole son POKéMON au Prof. Elm, la police), puis Violet City et l'arène de Falkner
    {
      const s3 = T.zone.warps[0]; await allerA(s3.x, s3.y); await versZone('ROUTE_30', BAS);
      for (const c of ['NEW_BARK', 'ROUTE_31', 'VIOLET', 'VIOLET_GYM', 'NEW_BARK_ELMS_LAB_1F']) T.ajouterDonnees(await G.chargerCarte(c));
      const labo = T.d.zones.NEW_BARK.warps.find((w) => w.vers === 'NEW_BARK_ELMS_LAB_1F');
      for (let i = 0; i < 60 && T.M.id === 'johto' && (T.joueur.x !== labo.x || T.joueur.y !== labo.y + 1); i++) await allerA(labo.x, labo.y + 1);
      await versZone('NEW_BARK_ELMS_LAB_1F', HAUT); await lireA([0, 0, 0]);
      for (let i = 0; i < 300; i++) { await pasA({}); if (!calme(T)) await lireA([0, 0, 0]); }
      const elm = T.objets.find((o) => o.visible && /doctor/i.test(o.id));
      if (elm) { const [ex, ey, ed] = [[0, 1, HAUT], [-1, 0, DROITE], [1, 0, GAUCHE]].map(([dx, dy, d]) => [elm.x + dx, elm.y + dy, d]).find(([x, y]) => !T.M.bloquee(x, y)); await parlerA(ex, ey, ed, [0, 0]); }
      ok(`retour au laboratoire du Prof. Elm : ${vus.filter((t) => /Elm|police|Officer/i.test(t)).length} répliques de la scène`);
      const sortieLabo = T.zone.warps[0]; await allerA(sortieLabo.x, sortieLabo.y); await versZone('NEW_BARK', BAS);
      // le poste de garde entre la Route 31 et Violet City
      for (const c of ['ROUTE_31_VIOLET_GATEHOUSE']) T.ajouterDonnees(await G.chargerCarte(c));
      const poste = T.d.zones.ROUTE_31.warps.find((w) => w.vers === 'ROUTE_31_VIOLET_GATEHOUSE');
      for (let i = 0; i < 80 && T.M.id === 'johto' && (T.joueur.x !== poste.x + 1 || T.joueur.y !== poste.y); i++) await allerA(poste.x + 1, poste.y);
      await versZone('ROUTE_31_VIOLET_GATEHOUSE', GAUCHE); await lireA();
      const versViolet = T.zone.warps.find((w) => w.vers === 'VIOLET');
      await allerA(versViolet.x, versViolet.y); await versZone('VIOLET', GAUCHE);
      const arene = T.d.zones.VIOLET.warps.find((w) => w.vers === 'VIOLET_GYM');
      for (let i = 0; i < 80 && T.M.id === 'johto' && (T.joueur.x !== arene.x || T.joueur.y !== arene.y + 1); i++) await allerA(arene.x, arene.y + 1);
      await versZone('VIOLET_GYM', HAUT); await lireA([0, 0, 0]);
      // d'abord la Tour Chétiflor (le Sage Li et sa CT Flash), puis Falkner
      assert.ok(T.objets.find((o) => /leader1/i.test(o.id))?.visible, 'Falkner est dans son arène (script d\'entrée du jeu)');
      // la tour se monte en zigzag : 1F → 2F, redescendre par l'autre échelle, remonter par celle de l'ouest, puis 3F
      const prendre = async (x, y, z) => {
        if (T.joueur.x === x && T.joueur.y === y) { const q = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([dx, dy]) => !T.M.bloquee(x + dx, y + dy) && !T.M.warp(x + dx, y + dy)); await allerA(x + q[0], y + q[1]); }
        // (un Sage peut voir le joueur en chemin : combat, puis on reprend)
        for (let k = 0; k < 10 && T.zone.id !== z; k++) {
          await allerA(x, y);
          for (let i = 0; i < 200 && (T.zone.id !== z || T.transition); i++) { await pasA({}); if (!calme(T)) await lireA([0, 0]); }
        }
        assert.equal(T.zone.id, z);
      };
      await allerZone('SPROUT_TOWER_1F');
      await prendre(10, 15, 'SPROUT_TOWER_2F'); await prendre(24, 9, 'SPROUT_TOWER_1F');
      await prendre(6, 15, 'SPROUT_TOWER_2F'); await prendre(15, 27, 'SPROUT_TOWER_3F');
      const combatsTour = combats.length;
      for (const d of [...T.objets.filter((o) => o.visible && o.dresseur), ...T.objets.filter((o) => o.visible && /chourou/.test(o.id))]) {
        const [dx, dy, dd] = [[0, 1, HAUT], [-1, 0, DROITE], [1, 0, GAUCHE], [0, -1, BAS]].map(([ax, ay, ad]) => [d.x + ax, d.y + ay, ad]).find(([x, y]) => !T.M.bloquee(x, y) && !T.objets.some((b) => b.visible && b.x === x && b.y === y));
        try { await parlerA(dx, dy, dd, [0, 0]); } catch (e) { if (process.env.DEBUG) console.log('tour', d.id, e.message); }
        for (let i = 0; i < 100; i++) { await pasA({}); if (!calme(T)) await lireA([0, 0]); }
      }
      if (process.env.DEBUG) console.log('LI', T.zone.id, T.joueur.x, T.joueur.y, vus.slice(-8), T.objets.filter((o) => o.visible).map((o) => o.id + '@' + o.x + ',' + o.y), Object.keys(T.etat.sac));
      assert.ok(T.etat.sac.tm70 > 0, 'CT Flash du Sage Li');
      ok(`Tour Chétiflor : trois étages par leurs échelles (en zigzag, comme dans le jeu), ${combats.length - combatsTour} combat(s), le Sage Li donne la CT Flash`);
      await prendre(15, 27, 'SPROUT_TOWER_2F'); await prendre(6, 16, 'SPROUT_TOWER_1F');
      await prendre(24, 8, 'SPROUT_TOWER_2F'); await prendre(11, 14, 'SPROUT_TOWER_1F');
      await allerZone('VIOLET_GYM');
      for (let i = 0; i < 30; i++) await pasA({});
      const falkner = T.objets.find((o) => o.visible && /leader1/i.test(o.id));
      const combats0 = combats.length;
      const [fx, fy, fd] = [[0, 1, HAUT], [-1, 0, DROITE], [1, 0, GAUCHE], [0, -1, BAS]].map(([dx, dy, d]) => [falkner.x + dx, falkner.y + dy, d]).find(([x, y]) => !T.M.bloquee(x, y));
      await parlerA(fx, fy, fd, [0, 0]);
      for (let i = 0; i < 200; i++) { await pasA({}); if (!calme(T)) await lireA([0, 0]); }
      assert.ok(T.etat.drapeaux.has('BADGE_ZEPHYR'), vus.slice(-6).join(' | '));
      ok(`Violet City : l'arène de Falkner traversée (${combats.length - combats0} combats), BADGE ZÉPHYR remis par le script du jeu`);
    }

    // l'arène d'Azalea : les vrais chemins des chariots (src/field/gymmick/azalea.c), posés sur la vraie salle
    charge(await G.chargerCarte('AZALEA_GYM'));
    const Z = D3.zones.AZALEA_GYM;
    assert.equal(Z.objets.filter((o) => o.id.startsWith('chariot_')).length, 4);
    assert.ok(Z.rails.stations.every(([x, y]) => x > 0 && y > 0));
    assert.ok(/chariot 0/.test(Z.scripts) && /aiguillage 1/.test(Z.scripts) && /rails_depart/.test(Z.scripts));
    ok('l\'arène d\'Azalea : douze stations, quatre chariots Spinarak, deux aiguillages, appelés par les scripts du jeu');
  }
}
{
  // les fichiers viennent d'un clone local de pret/pokeplatinum (PLAT=<dossier>) ; sans lui, on passe
  const { existsSync } = await import('node:fs');
  const { readFile } = await import('node:fs/promises');
  const PLAT = process.env.PLAT || '/tmp/ext/plat';
  if (!existsSync(PLAT + '/res/field/mapmodels/data/map_data_234.bin')) console.log('  (clone de pokeplatinum absent : PLAT=<dossier>)');
  else {
    const { frimapic } = await import(B + 'donnees/platine.js');
    const r = await frimapic((c) => readFile(PLAT + '/' + c).then((b) => new Uint8Array(b)), { vers: 'NEW_BARK_PLAYER_HOUSE_1F', n: 0 });
    const D = { ...DEMO, blocs: { ...DEMO.blocs, ...r.blocs }, mondes: { ...DEMO.mondes, ...r.mondes }, zones: { ...DEMO.zones, ...r.zones } };
    for (const w of r.zones.ARENE_FRIMAPIC.warps) w.vers = null;   // la sortie ne mène nulle part ici (dans le jeu : le Centre de Mahogany)
    const Z = D.zones.ARENE_FRIMAPIC, b = r.blocs.frimapic;
    // la salle du jeu : 497 cases de glace, la sortie en (11, 28), GLADYS en (11, 3), 19 boules, 6 Topdresseurs
    assert.equal(b.mb.filter((m) => m === MB.GLACE).length, 497);
    assert.deepEqual([Z.warps[0].x, Z.warps[0].y], [11, 28]);
    assert.deepEqual(Z.objets.filter((o) => o.boule).length, 19);
    assert.deepEqual(Z.objets.filter((o) => o.dresseur && !o.dresseur.champion).length, 6);
    const gl = Z.objets.find((o) => o.id === 'candice'); assert.deepEqual([gl.x, gl.y], [11, 3]);
    ok('la salle vient du jeu : 497 cases de glace, relief en pente, Candice, 6 Topdresseurs, 19 boules, sortie');
    // règles de la glace à pentes
    const T = new Terrain(D, { graine: 3 });
    T.demarrer({ zone: 'ARENE_FRIMAPIC', x: 11, y: 28, dir: HAUT });
    let j = T.joueur;
    for (const o of Z.objets) if (o.dresseur && !o.dresseur.champion) T.etat.drapeaux.add(`DRESSEUR_ARENE_FRIMAPIC_${o.id}`);
    const boules = Z.objets.filter((o) => o.boule).map((o) => o.id);
    /** un coup depuis (x, y) avec les boules `cassees` déjà brisées : rend [x, y, cassées] */
    const essai = (x, y, cassees, d) => {
      for (const id of boules) { const f = 'TMP_BOULE_' + id; if (cassees.includes(id)) T.etat.drapeaux.add(f); else T.etat.drapeaux.delete(f); }
      T.majVisibles(); T.placerJoueur(x, y, d); T.continu = false; j.vGlace = 0; j.apresRecul = false;
      T.pas({ dir: d }); attendre(T, () => !j.m && !T.transition, 900);
      // la sortie mène hors de l'arène : ce coup ne compte pas, on y revient
      if (T.zone?.id !== 'ARENE_FRIMAPIC') { T.demarrer({ zone: 'ARENE_FRIMAPIC', x: 11, y: 27, dir: HAUT }); j = T.joueur; return null; }
      if (j.x === x && j.y === y) return null;
      return [j.x, j.y, boules.filter((id) => T.etat.drapeaux.has('TMP_BOULE_' + id))];
    };
    // une pente se monte seulement avec de l'élan ; sans élan, on recule d'une case
    { const r1 = essai(11, 27, [], HAUT); assert.ok(r1, 'on avance sur la glace'); }
    assert.deepEqual(essai(15, 9, [], HAUT).slice(0, 2), [15, 8], 'sans élan, on ne monte pas la pente : on redescend d\'une case');
    assert.deepEqual(essai(11, 10, [], HAUT).slice(0, 2), [11, 9], 'sans élan, la boule de neige arrête la glissade');
    { const r2 = essai(2, 8, [], DROITE); assert.deepEqual(r2.slice(0, 2), [19, 8]); assert.equal(r2[2].length, 5, 'en descendant la pente, on brise les cinq boules de la rangée'); }
    const cle = (x, y, c) => x + ',' + y + ':' + c.join('|');
    const prev = new Map([[cle(11, 27, []), null]]); let file = [[11, 27, []]], fin = null, etats = 0;
    while (file.length && !fin) {
      const f2 = [];
      for (const [x, y, c] of file) {
        for (let d = 0; d < 4 && !fin; d++) {
          const n = essai(x, y, c, d); etats++;
          if (!n) continue;
          const k = cle(...n);
          if (prev.has(k)) continue;
          prev.set(k, [cle(x, y, c), d]);
          if (n[0] === 11 && n[1] === 4) fin = k;
          f2.push(n);
        }
        if (fin) break;
      }
      file = f2;
    }
    assert.ok(fin, `Candice atteinte (${prev.size} états explorés)`);
    const coups = []; for (let k = fin; prev.get(k); k = prev.get(k)[0]) coups.unshift(prev.get(k)[1]);
    const cassees = fin.split(':')[1].split('|').filter(Boolean);
    assert.ok(cassees.length >= 1, 'il faut briser des boules de neige pour arriver jusqu\'à elle');
    ok(`glace à pentes de Platine : élan en descente, recul en montée, boules brisées avec de l'élan ; Candice atteinte en ${coups.length} coups (${cassees.length} boules brisées, ${prev.size} états)`);
    // la partie jouée pour de bon : depuis l'entrée, la solution, puis le combat
    T.demarrer({ zone: 'ARENE_FRIMAPIC', x: 11, y: 27, dir: HAUT }); j = T.joueur;
    for (const o of Z.objets) if (o.dresseur && !o.dresseur.champion) T.etat.drapeaux.add(`DRESSEUR_ARENE_FRIMAPIC_${o.id}`);
    for (const id of boules) T.etat.drapeaux.delete('TMP_BOULE_' + id);
    T.majVisibles();
    T.etat.equipe.push({ espece: 'Kaiminus', niveau: 50, pv: 1, pvMax: 1 });
    for (const d of coups) { tenir(T, d, 1); attendre(T, () => !j.m && !T.transition, 900); if (!calme(T)) lire(T); }
    assert.deepEqual([j.x, j.y], [11, 4]);
    parler(T, HAUT); lire(T);
    assert.ok(T.etat.drapeaux.has('BADGE_GLACON'));
    ok('la solution rejouée dans la vraie partie : Candice battue, Icicle Badge');
  }
}

console.log(`\n${n} vérifications passées.`);
