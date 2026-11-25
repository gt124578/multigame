// odyssee/moteur/main.js — banc d'essai (page odyssee/moteur.html) : le moteur de terrain (engine/), le jeu HGSS lu dans
// la décompilation (donnees/jeu-hg.js : cartes, événements, scripts, en anglais), le rendu three.js (render/) et, par
// odyssee.js, les combats, l'équipe, le sac, la musique et les bruitages d'Odyssée. Le moteur avance à pas fixe (60 par seconde) ; l'écran ne fait que le montrer.
//   ?nouveau            nouvelle partie (ignore la sauvegarde)
//   ?zone=ID&x=..&y=..  départ ailleurs
//   ?debug              window.__moteur (terrain, rendu) et infos affichées
//   ?tout               chaussures de course et vélo dès le départ
//   ?demo               la petite zone d'essai au lieu du jeu
//   ?pret=URL           autre copie des fichiers de la décompilation
import { Terrain } from './engine/terrain.js';
import { PAS_PAR_SECONDE } from './engine/const.js';
import { DEMO } from './donnees/demo.js';
import { frimapic, PLATINE } from './donnees/platine.js';
import { jeuHG, DEPART_HG } from './donnees/jeu-hg.js';
import { PRET_HG } from './donnees/hgss.js';
import { Rendu } from './render/rendu.js';
import { ModelesHGSS } from './render/hgss3d.js';
import { PontOdyssee } from './odyssee.js';
import { CarteRegion } from './render/carte-region.js';
import { Traducteur, messagesDe } from './render/traduction.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
/** lecture d'un fichier du dépôt de la décompilation, gardée dans le cache du navigateur (adresses à commit épinglé) */
const lireDepuis = (base) => async (c) => {
  const url = base + c;
  let cache = null;
  try { cache = await caches.open('moteur-hgss-pret'); const r = await cache.match(url); if (r) return new Uint8Array(await r.arrayBuffer()); } catch { cache = null; }
  const r = await fetch(url);
  if (!r.ok) throw new Error(c + ' : ' + r.status);
  if (cache) try { await cache.put(url, r.clone()); } catch { /* cache plein */ }
  return new Uint8Array(await r.arrayBuffer());
};
// langue : français (noms de la version française, dialogues traduits dans le navigateur) ou anglais (le texte du jeu)
const LANGUE = Q.get('langue') || (() => { try { return localStorage.getItem('moteur-hgss-langue'); } catch { return null; } })() || 'fr';
const fusionner = (D, p) => { if (!p) return; Object.assign(D.zones, p.zones); Object.assign(D.blocs, p.blocs); Object.assign(D.mondes, p.mondes); };
let DONNEES = DEMO, HG = null, G = null;
if (!Q.has('demo')) {
  // le jeu entier depuis les données publiées par la décompilation de HGSS (pret/pokeheartgold) : les cartes (~20 Mo
  // la première fois, ensuite gardées par le navigateur), les événements et les scripts de chaque lieu
  $('chargement').textContent = 'Chargement des cartes de HeartGold / SoulSilver…';
  const baseHG = Q.get('pret') || PRET_HG, lireHG = lireDepuis(baseHG);
  G = await jeuHG(lireHG, { langue: LANGUE });
  DONNEES = G.donnees;
  HG = new ModelesHGSS(baseHG, { terrains: G.archives.brut.terrains }, lireHG, G.personnages);
  // l'Arène de Frimapic (Platine) se construit à partir des fichiers du jeu, lus dans le dépôt de la décompilation
  try { fusionner(DONNEES, await frimapic(lireDepuis(Q.get('platine') || PLATINE), { vers: 'MAHOGANY_POKECENTER_1F', n: 0 })); }
  catch (e) { console.warn('Arène de Frimapic indisponible :', e.message || e); }
}
const DEBUT = Q.has('demo') ? { zone: 'MAISON_2F', x: 14, y: 13 } : DEPART_HG;
const CLE = 'odyssee-moteur-hgss' + (Q.has('demo') ? '-demo' : '-jeu');

// ——— touches : on mémorise les appuis entre deux pas pour n'en perdre aucun ———
const TOUCHES = {
  ArrowUp: 'haut', ArrowDown: 'bas', ArrowLeft: 'gauche', ArrowRight: 'droite', KeyW: 'haut', KeyS: 'bas', KeyA: 'gauche', KeyD: 'droite',
  KeyZ: 'haut', KeyQ: 'gauche',
  Space: 'a', Enter: 'a', KeyF: 'a', KeyK: 'a', Escape: 'b', Backspace: 'b', KeyX: 'b', KeyL: 'b',
  ShiftLeft: 'course', ShiftRight: 'course', CapsLock: 'toujours', KeyV: 'velo', KeyO: 'sauver', F3: 'debug', KeyG: 'qualite', Tab: 'menu', KeyM: 'menu', KeyC: 'carte',
};
const DIRS = ['haut', 'bas', 'gauche', 'droite'];
const tenues = new Set(), ordre = [], appuis = new Set();
let courseAuto = false, carte = null;
addEventListener('keydown', (e) => {
  const k = TOUCHES[e.code]; if (!k) return;
  e.preventDefault();
  if (e.repeat || pont?.occupe) return;   // un écran d'Odyssée (combat, menu) a les touches
  // la carte de la région ouverte : flèches pour le curseur, C / B pour fermer
  if (carte?.ouverte) {
    if (k === 'carte' || k === 'b' || k === 'menu') carte.fermer();
    else if (DIRS.includes(k)) carte.bouger(...[[0, -1], [0, 1], [-1, 0], [1, 0]][DIRS.indexOf(k)]);
    return;
  }
  if (k === 'toujours') { courseAuto = !courseAuto; return; }
  tenues.add(k); appuis.add(k);
  if (DIRS.includes(k)) { ordre.splice(ordre.indexOf(k) >>> 0, ordre.includes(k) ? 1 : 0); ordre.push(k); }
});
addEventListener('keyup', (e) => {
  const k = TOUCHES[e.code]; if (!k) return;
  tenues.delete(k);
  const i = ordre.indexOf(k); if (i >= 0) ordre.splice(i, 1);
});
addEventListener('blur', () => { tenues.clear(); ordre.length = 0; });
function entrees() {
  const d = ordre.length ? DIRS.indexOf(ordre[ordre.length - 1]) : null;
  // courir : Maj, ou B tenu en marchant (comme sur DS) ; CapsLock fait courir tout le temps
  const e = { dir: d, a: appuis.has('a'), b: appuis.has('b'), course: tenues.has('course') || (d !== null && tenues.has('b')) || courseAuto, velo: appuis.has('velo') };
  appuis.delete('a'); appuis.delete('b'); appuis.delete('velo');
  return e;
}

// ——— démarrage ———
// la carte où l'on commence est chargée avant le premier pas
const sauvegarde = !Q.has('nouveau') && localStorage.getItem(CLE);
let zoneDepart = Q.get('zone') || DEBUT.zone;
if (!Q.get('zone') && sauvegarde) try { zoneDepart = JSON.parse(sauvegarde).position.zone; } catch { /* sauvegarde illisible */ }
// (et la chambre du début : c'est là qu'on repart si la position est perdue)
for (const z of new Set([zoneDepart, DEBUT.zone])) if (G && DONNEES.zones[z]?.aCharger) fusionner(DONNEES, await G.chargerCarte(z));
// les POKéMON du terrain sont ceux d'Odyssée (le pont est créé juste après le terrain, d'où ces renvois)
let pont = null;
const T = new Terrain(DONNEES, { graine: (Math.random() * 2 ** 31) | 0, pokemon: {
  creer: (nom, niveau) => pont.pokemon.creer(nom, niveau),
  soigner: (m) => pont.pokemon.soigner(m),
} });
pont = new PontOdyssee($('ui'), T);
// dialogues en français : traduits à la volée (et en avance, carte par carte)
let TR = null;
if (G && LANGUE === 'fr') {
  TR = new Traducteur(pont.especesFr);
  T.traduire = (texte) => TR.connue(texte) ?? (TR.etat === 'indisponible' ? null : TR.traduire(texte));
  T.traduireCourt = (o) => TR.connue(o);
  TR.demarrer();
  const premierGeste = () => { TR.demarrer(); removeEventListener('keydown', premierGeste); removeEventListener('pointerdown', premierGeste); };
  addEventListener('keydown', premierGeste); addEventListener('pointerdown', premierGeste);
}
if (TR) {
  const etat = document.createElement('div'); etat.style.cssText = 'opacity:.8;margin-top:2px';
  $('aide').append(etat);
  setInterval(() => {
    etat.textContent = TR.etat === 'prêt' ? 'Dialogues : traduits en français' : TR.etat === 'indisponible'
      ? 'Dialogues : traduction indisponible dans ce navigateur (texte anglais)' : `Dialogues : traduction — ${TR.etat}`;
  }, 1000);
}
const prevoirTextes = (z) => { if (TR && z?.scripts) TR.prevoir(messagesDe(z.scripts, T.etat.joueur.nom, T.etat.joueur.rival || 'SILVER')); };
pont.surSauvegarde = () => localStorage.setItem(CLE, T.sauvegarder());
const taillePx = () => {
  document.documentElement.style.setProperty('--px', Math.max(2, Math.round(innerHeight / 270)) + 'px');
  document.documentElement.style.setProperty('--bp', (innerHeight / 192) + 'px');
};
addEventListener('resize', taillePx); taillePx();
if (Q.get('zone')) T.demarrer({ zone: Q.get('zone'), x: Q.has('x') ? +Q.get('x') : undefined, y: Q.has('y') ? +Q.get('y') : undefined });
else if (sauvegarde) { try { T.demarrer({ sauvegarde }); } catch (e) { console.warn('sauvegarde illisible', e); T.demarrer(DEBUT); } }
else {
  T.demarrer(DEBUT);
  // nouvelle partie : les drapeaux et variables que le jeu pose avant le premier pas
  for (const f of G?.drapeauxDepart || []) T.etat.drapeaux.add(f);
  Object.assign(T.etat.vars, G?.varsDepart || {});
  T.majVisibles();
}
// cartes chargées en route : celle où l'on va (le moteur attend dans le noir), et en avance celles d'à côté
const enCours = new Map();
function charger(id) {
  if (!G || !T.d.zones[id]?.aCharger) return Promise.resolve();
  if (!enCours.has(id)) enCours.set(id, G.chargerCarte(id).then((p) => { T.ajouterDonnees(p); prevoirTextes(p?.zones?.[id]); }).catch((e) => { console.warn('carte', id, e); enCours.delete(id); }));
  return enCours.get(id);
}
T.chargeur = charger;
// les écrans de nom du jeu (le rival) : une simple question
T.saisieNom = (quoi, defaut) => new Promise((ok) => setTimeout(() => ok(prompt(LANGUE === 'fr' ? 'Quel est son nom ?' : "What's his name?", defaut)), 50));
prevoirTextes(T.d.zones[T.zone?.id]);
// L : changer de langue (français / anglais) ; la page se recharge, la partie est gardée
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyL' || e.repeat || pont?.occupe || Q.has('demo')) return;
  try { localStorage.setItem(CLE, T.sauvegarder()); localStorage.setItem('moteur-hgss-langue', LANGUE === 'fr' ? 'en' : 'fr'); } catch { /* rien */ }
  const u = new URL(location.href); u.searchParams.delete('langue'); u.searchParams.delete('nouveau'); location.href = u.href;
});
let file = [], actifs = 0;
function prevoir() {
  if (!G) return;
  const j = T.joueur, M = T.M, voulues = [];
  if (T.zone) voulues.push(T.zone.id, ...(T.zone.warps || []).map((w) => w.vers).filter(Boolean));
  // les cartes du dehors dans un rayon de deux blocs
  if (M.id === 'johto') for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const z = M.zone(j.x + dx * 32, j.y + dy * 32); if (z) voulues.push(z.id);
  }
  file = [...new Set(voulues)].filter((id) => T.d.zones[id]?.aCharger && !enCours.has(id));
}
setInterval(() => {
  prevoir();
  while (actifs < 3 && file.length) { actifs++; charger(file.shift()).finally(() => { actifs--; }); }
}, 400);
// une sauvegarde d'avant une retouche de carte peut poser le joueur dans un mur ou hors de la pièce : on repart du début
{
  const j = T.joueur, s = T.d.sols[T.M.sol(j.x, j.y)];
  if (!T.M.dedans(j.x, j.y) || T.M.bloquee(j.x, j.y) || s === 'vide') {
    // la case libre la plus proche dans la même zone, sinon le début
    const M = T.M, zid = T.zone?.id;
    let p = null;
    for (let r = 1; r < 40 && !p; r++) for (let dy = -r; dy <= r && !p; dy++) for (let dx = -r; dx <= r && !p; dx++) {
      const x = j.x + dx, y = j.y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && M.dedans(x, y) && !M.bloquee(x, y) && !M.warp(x, y) && M.zone(x, y)?.id === zid && T.d.sols[M.sol(x, y)] !== 'vide') p = [x, y];
    }
    if (p) T.placerJoueur(p[0], p[1], j.dir);
    else { console.warn('position hors carte : nouveau départ'); T.demarrer(DEBUT); }
  }
}
// ?tout : chaussures de course et vélo tout de suite (pour essayer)
if (Q.has('tout')) { T.etat.drapeaux.add('CHAUSSURES'); T.etat.drapeaux.add('TOUT_CS'); T.etat.sac.velo = 1; }

carte = G ? new CarteRegion($('cadre'), T) : null;
const R = new Rendu($('vue'), T, { pack: Q.get('pack') || 'hgss', platine: Q.get('platine') || undefined, hg: HG });
await R.charger();
const taille = () => { const c = $('cadre'); R.taille(c.clientWidth, c.clientHeight); };
addEventListener('resize', taille); taille();
$('chargement').remove();
if (Q.has('debug')) { window.__moteur = { T, R, pont }; $('debug').style.display = 'block'; }
pont.musique(T.musique);
if (Q.has('zoom')) R.zoom = +Q.get('zoom');   // vue élargie (regarder une ville entière)

// ——— interface : elle reflète l'état du moteur ———
let tZone = 0;
function ui(temps) {
  for (const e of T.vider()) {
    if (e.type === 'son') pont.son(e.nom);
    if (e.type === 'musique') pont.musique(e.nom);
    if (e.type === 'zone' && e.annonce) { $('zone').textContent = e.nom; $('zone').classList.add('vu'); tZone = temps + 2600; }
    if (e.type === 'combat') pont.combat(e).then((r) => { vider(); T.terminerCombat(r !== 'lose'); }, (err) => { console.error(err); T.terminerCombat(true); });
  }
  if (tZone && temps > tZone) { $('zone').classList.remove('vu'); tZone = 0; }
  const u = T.ui;
  $('boite').style.display = u && u.texte ? 'block' : 'none';
  if (u) {
    $('texte').textContent = u.texte.slice(0, u.vus);
    $('boite').querySelector('.suite').style.display = u.vus >= u.texte.length && !u.lu && !u.choix ? 'inline' : 'none';
  }
  const c = u?.choix, bq = u?.boutique;
  $('choix').style.display = c || bq ? 'block' : 'none';
  if (c) $('choix').innerHTML = c.options.map((o, i) => `<div class="${i === c.i ? 'sel' : ''}">${o}</div>`).join('');
  if (bq) {
    const lignes = [...bq.articles.map((a) => `${a.nom}<span style="float:right;margin-left:2em">${a.prix} ₽</span>`), 'QUITTER'];
    $('choix').innerHTML = `<div style="font-size:0.8em;opacity:0.75">Argent : ${T.etat.argent} ₽</div>`
      + lignes.map((l, i) => `<div class="${i === bq.i ? 'sel' : ''}">${l}</div>`).join('');
  }
  $('noir').style.opacity = T.noir;
}
/** les touches enfoncées pendant un écran d'Odyssée ne doivent pas faire marcher le joueur au retour */
function vider() { tenues.clear(); ordre.length = 0; appuis.clear(); }

// ——— boucle : pas fixes, au plus 6 par image (un onglet revenu de veille ne rattrape pas des minutes) ———
const DT = 1000 / PAS_PAR_SECONDE;
let reste = 0, avant = performance.now(), coutPas = 0, images = 0, ips = 0, tIps = avant;
function boucle(temps) {
  reste = Math.min(reste + temps - avant, DT * 6); avant = temps;
  if (appuis.has('sauver')) { appuis.delete('sauver'); if (!T.ctxs.length && !T.transition && !T.joueur.m) { localStorage.setItem(CLE, T.sauvegarder()); T.lancerScript(T.zone.id, 'MessageSauvegarde'); } }
  if (appuis.has('debug')) { appuis.delete('debug'); const d = $('debug'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; }
  if (appuis.has('qualite')) { appuis.delete('qualite'); R.qualite = R.qualite === 'ds' ? 'net' : 'ds'; taille(); }
  if (appuis.has('carte')) { appuis.delete('carte'); if (carte && !T.ctxs.length && !T.transition && !T.joueur.m && !T.ui && !T.combatEnCours) { carte.ouvrir(); vider(); } }
  if (appuis.has('menu')) { appuis.delete('menu'); if (!T.ctxs.length && !T.transition && !T.joueur.m && !T.ui && !T.combatEnCours) pont.menu().then(vider); }
  try {
    while (reste >= DT) {
      if (!pont.occupe && !carte?.ouverte) { const t0 = performance.now(); T.pas(entrees()); coutPas = coutPas * 0.95 + (performance.now() - t0) * 0.05; }
      reste -= DT;
    }
    R.dessiner(temps);
    ui(temps);
    carte?.suivre(); carte?.dessiner(temps);
  } catch (e) {
    console.error(e);
    $('debug').style.display = 'block'; $('debug').textContent = 'Erreur : ' + e.message;
    return;
  }
  images++;
  if (temps - tIps > 500) { ips = Math.round(images * 1000 / (temps - tIps)); images = 0; tIps = temps; }
  if ($('debug').style.display === 'block') {
    const j = T.joueur, i = R.infos();
    $('debug').textContent = `${T.zone?.id} (${T.M.id})  x ${j.x} y ${j.y} h ${T.M.hauteurCase(j.x, j.y)}  comportement ${T.M.mb(j.x, j.y)}  mode ${T.mode}\n`
      + `${ips} i/s  pas ${coutPas.toFixed(3)} ms  appels ${i.appels}  triangles ${i.triangles}  géométries ${i.geometries}  textures ${i.textures}\n`
      + `scripts ${T.ctxs.map((c) => c.nom).join(', ') || '—'}  drapeaux ${[...T.etat.drapeaux].join(' ')}`;
  }
  requestAnimationFrame(boucle);
}
requestAnimationFrame(boucle);
