// odyssee/moteur/main.js — banc d'essai (page odyssee/moteur.html) : le moteur de terrain (engine/), le début de HGSS
// redessiné (donnees/johto.js), le rendu three.js (render/) et, par odyssee.js, les combats, l'équipe, le sac, la
// musique et les bruitages d'Odyssée. Le moteur avance à pas fixe (60 par seconde) ; l'écran ne fait que le montrer.
//   ?nouveau            nouvelle partie (ignore la sauvegarde)
//   ?zone=ID&x=..&y=..  départ ailleurs
//   ?debug              window.__moteur (terrain, rendu) et infos affichées
import { Terrain } from './engine/terrain.js';
import { PAS_PAR_SECONDE } from './engine/const.js';
import { DEMO } from './donnees/demo.js';
import { JOHTO, DEPART } from './donnees/johto.js';
import { Rendu } from './render/rendu.js';
import { PontOdyssee } from './odyssee.js';

const Q = new URLSearchParams(location.search);
const DONNEES = Q.has('demo') ? DEMO : JOHTO;
const DEBUT = Q.has('demo') ? { zone: 'MAISON_2F', x: 14, y: 13 } : DEPART;
const CLE = 'odyssee-moteur-hgss' + (Q.has('demo') ? '-demo' : '-johto');
const $ = (id) => document.getElementById(id);

// ——— touches : on mémorise les appuis entre deux pas pour n'en perdre aucun ———
const TOUCHES = {
  ArrowUp: 'haut', ArrowDown: 'bas', ArrowLeft: 'gauche', ArrowRight: 'droite', KeyW: 'haut', KeyS: 'bas', KeyA: 'gauche', KeyD: 'droite',
  KeyZ: 'haut', KeyQ: 'gauche',
  Space: 'a', Enter: 'a', KeyF: 'a', KeyK: 'a', Escape: 'b', Backspace: 'b', KeyX: 'b', KeyL: 'b',
  ShiftLeft: 'course', ShiftRight: 'course', KeyV: 'velo', KeyO: 'sauver', F3: 'debug', KeyG: 'qualite', Tab: 'menu', KeyM: 'menu',
};
const DIRS = ['haut', 'bas', 'gauche', 'droite'];
const tenues = new Set(), ordre = [], appuis = new Set();
addEventListener('keydown', (e) => {
  const k = TOUCHES[e.code]; if (!k) return;
  e.preventDefault();
  if (e.repeat || pont?.occupe) return;   // un écran d'Odyssée (combat, menu) a les touches
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
  const e = { dir: d, a: appuis.has('a'), b: appuis.has('b'), course: tenues.has('course'), velo: appuis.has('velo') };
  appuis.delete('a'); appuis.delete('b'); appuis.delete('velo');
  return e;
}

// ——— démarrage ———
// les POKéMON du terrain sont ceux d'Odyssée (le pont est créé juste après le terrain, d'où ces renvois)
let pont = null;
const T = new Terrain(DONNEES, { graine: (Math.random() * 2 ** 31) | 0, pokemon: {
  creer: (nom, niveau) => pont.pokemon.creer(nom, niveau),
  soigner: (m) => pont.pokemon.soigner(m),
} });
pont = new PontOdyssee($('ui'), T);
pont.surSauvegarde = () => localStorage.setItem(CLE, T.sauvegarder());
const taillePx = () => {
  document.documentElement.style.setProperty('--px', Math.max(2, Math.round(innerHeight / 270)) + 'px');
  document.documentElement.style.setProperty('--bp', (innerHeight / 192) + 'px');
};
addEventListener('resize', taillePx); taillePx();
const sauvegarde = !Q.has('nouveau') && localStorage.getItem(CLE);
if (Q.get('zone')) T.demarrer({ zone: Q.get('zone'), x: Q.has('x') ? +Q.get('x') : undefined, y: Q.has('y') ? +Q.get('y') : undefined });
else if (sauvegarde) { try { T.demarrer({ sauvegarde }); } catch (e) { console.warn('sauvegarde illisible', e); T.demarrer(DEBUT); } }
else T.demarrer(DEBUT);

const R = new Rendu($('vue'), T, { pack: Q.get('pack') || 'hgss' });
await R.charger();
const taille = () => { const c = $('cadre'); R.taille(c.clientWidth, c.clientHeight); };
addEventListener('resize', taille); taille();
$('chargement').remove();
if (Q.has('debug')) { window.__moteur = { T, R, pont }; $('debug').style.display = 'block'; }
pont.musique(T.musique);

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
  if (appuis.has('menu')) { appuis.delete('menu'); if (!T.ctxs.length && !T.transition && !T.joueur.m && !T.ui && !T.combatEnCours) pont.menu().then(vider); }
  try {
    while (reste >= DT) {
      if (!pont.occupe) { const t0 = performance.now(); T.pas(entrees()); coutPas = coutPas * 0.95 + (performance.now() - t0) * 0.05; }
      reste -= DT;
    }
    R.dessiner(temps);
    ui(temps);
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
