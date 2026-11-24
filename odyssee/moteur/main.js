// odyssee/moteur/main.js — banc d'essai : le moteur de terrain (engine/), la zone d'essai (donnees/demo.js) et le
// rendu three.js (render/). Le moteur avance à pas fixe (60 par seconde) ; l'écran ne fait que le montrer.
//   ?nouveau            nouvelle partie (ignore la sauvegarde)
//   ?zone=ID&x=..&y=..  départ ailleurs
//   ?debug              window.__moteur (terrain, rendu) et infos affichées
import { Terrain } from './engine/terrain.js';
import { PAS_PAR_SECONDE } from './engine/const.js';
import { DEMO } from './donnees/demo.js';
import { Rendu } from './render/rendu.js';

const Q = new URLSearchParams(location.search);
const CLE = 'odyssee-moteur-hgss';
const $ = (id) => document.getElementById(id);

// ——— touches : on mémorise les appuis entre deux pas pour n'en perdre aucun ———
const TOUCHES = {
  ArrowUp: 'haut', ArrowDown: 'bas', ArrowLeft: 'gauche', ArrowRight: 'droite', KeyW: 'haut', KeyS: 'bas', KeyA: 'gauche', KeyD: 'droite',
  KeyZ: 'haut', KeyQ: 'gauche',
  Space: 'a', Enter: 'a', KeyF: 'a', KeyK: 'a', Escape: 'b', Backspace: 'b', KeyX: 'b', KeyL: 'b',
  ShiftLeft: 'course', ShiftRight: 'course', KeyV: 'velo', KeyO: 'sauver', F3: 'debug', KeyG: 'qualite',
};
const DIRS = ['haut', 'bas', 'gauche', 'droite'];
const tenues = new Set(), ordre = [], appuis = new Set();
addEventListener('keydown', (e) => {
  const k = TOUCHES[e.code]; if (!k) return;
  e.preventDefault();
  if (e.repeat) return;
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

// ——— sons : quelques bips en attendant les vrais ———
let audio = null;
function bip(f, d = 0.06, type = 'square', v = 0.05) {
  try {
    audio ||= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = v;
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + d);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + d);
  } catch { /* pas de son */ }
}
const SONS = { heurt: () => bip(90, 0.09, 'square', 0.06), texte: () => bip(880, 0.03), choix: () => bip(990, 0.04), porte: () => bip(330, 0.12, 'triangle', 0.08),
  escalier: () => bip(260, 0.12, 'triangle', 0.08), saut: () => bip(520, 0.1, 'triangle', 0.06), exclamation: () => { bip(1200, 0.06); setTimeout(() => bip(1500, 0.08), 70); },
  objet: () => { bip(660, 0.08); setTimeout(() => bip(880, 0.12), 90); }, fanfare: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => bip(f, 0.12, 'triangle', 0.07), i * 110)),
  soin: () => bip(700, 0.3, 'sine', 0.06) };

// ——— démarrage ———
const T = new Terrain(DEMO, { graine: (Math.random() * 2 ** 31) | 0 });
const sauvegarde = !Q.has('nouveau') && localStorage.getItem(CLE);
if (Q.get('zone')) T.demarrer({ zone: Q.get('zone'), x: Q.has('x') ? +Q.get('x') : undefined, y: Q.has('y') ? +Q.get('y') : undefined });
else if (sauvegarde) { try { T.demarrer({ sauvegarde }); } catch (e) { console.warn('sauvegarde illisible', e); T.demarrer({ zone: 'MAISON_2F', x: 14, y: 13 }); } }
else T.demarrer({ zone: 'MAISON_2F', x: 14, y: 13 });

const R = new Rendu($('gl'), T);
await R.charger();
const taille = () => { const c = $('cadre'); R.taille(c.clientWidth, c.clientHeight); };
addEventListener('resize', taille); taille();
$('chargement').remove();
if (Q.has('debug')) { window.__moteur = { T, R }; $('debug').style.display = 'block'; }

// ——— interface : elle reflète l'état du moteur ———
let tZone = 0;
function ui(temps) {
  for (const e of T.vider()) {
    if (e.type === 'son') SONS[e.nom]?.();
    if (e.type === 'zone' && e.annonce) { $('zone').textContent = e.nom; $('zone').classList.add('vu'); tZone = temps + 2600; }
    if (e.type === 'combat') ouvrirCombat(e);
  }
  if (tZone && temps > tZone) { $('zone').classList.remove('vu'); tZone = 0; }
  const u = T.ui;
  $('boite').style.display = u && u.texte ? 'block' : 'none';
  if (u) {
    $('texte').textContent = u.texte.slice(0, u.vus);
    $('boite').querySelector('.suite').style.display = u.vus >= u.texte.length && !u.lu && !u.choix ? 'inline' : 'none';
  }
  const c = u?.choix;
  $('choix').style.display = c ? 'block' : 'none';
  if (c) $('choix').innerHTML = c.options.map((o, i) => `<div class="${i === c.i ? 'sel' : ''}">${o}</div>`).join('');
  $('noir').style.opacity = T.noir;
}
function ouvrirCombat(e) {
  const el = $('combat');
  el.style.display = 'flex';
  el.innerHTML = e.genre === 'sauvage'
    ? `<div>Un ${e.espece} sauvage (N. ${e.niveau}) apparaît !</div><small>Le combat n'est pas branché sur ce banc d'essai.<br>A : gagner · B : perdre</small>`
    : `<div>${e.nom} veut se battre !</div><small>A : gagner · B : perdre</small>`;
  combatOuvert = true;
}
let combatOuvert = false;
function majCombat() {
  if (!combatOuvert) return false;
  if (appuis.has('a') || appuis.has('b')) {
    const v = appuis.has('a'); appuis.clear();
    $('combat').style.display = 'none'; combatOuvert = false;
    T.terminerCombat(v);
  }
  return true;
}

// ——— boucle : pas fixes, au plus 6 par image (un onglet revenu de veille ne rattrape pas des minutes) ———
const DT = 1000 / PAS_PAR_SECONDE;
let reste = 0, avant = performance.now(), coutPas = 0, images = 0, ips = 0, tIps = avant;
function boucle(temps) {
  reste = Math.min(reste + temps - avant, DT * 6); avant = temps;
  if (appuis.has('sauver')) { appuis.delete('sauver'); if (!T.ctxs.length && !T.transition && !T.joueur.m) { localStorage.setItem(CLE, T.sauvegarder()); T.lancerScript(T.zone.id, 'MessageSauvegarde'); } }
  if (appuis.has('debug')) { appuis.delete('debug'); const d = $('debug'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; }
  if (appuis.has('qualite')) { appuis.delete('qualite'); R.qualite = R.qualite === 'ds' ? 'net' : 'ds'; taille(); }
  try {
    while (reste >= DT) {
      if (!majCombat()) { const t0 = performance.now(); T.pas(entrees()); coutPas = coutPas * 0.95 + (performance.now() - t0) * 0.05; }
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
