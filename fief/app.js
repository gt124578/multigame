// Fief Maudit : démarrage, boucle de jeu et réseau. Étape 4 du développement (docs/FIEF-MAUDIT.md) : une seule vallée
// pour tout le salon. L'hôte fait tourner la simulation (sim.js) et envoie l'état aux invités (engine/net.js) ; chaque
// invité garde une copie de la vallée, y recopie l'état reçu et prédit son propre déplacement. Si l'hôte s'en va, le
// nouvel hôte reprend depuis le dernier instantané complet. Seul (ou sans invité), c'est la même boucle, sans envoi.
// Adresse : ?seed=… (vallée), ?bots=0..2, ?job=…, ?debug (expose window.__fief), ?autostart, ?manual (images à la demande).
import { Sim, DT, GOALS, emptyInput, WAREHOUSE_HP, CYCLE, JOBS, HP, BUILDS, FOOD, FOES, MODES, LOOT } from './engine/sim.js';
import { encodeState, encodeWorld, applyState, applyWorld, smooth, predict, reconcile, cleanInput } from './engine/net.js';
import { createScene } from './view/scene.js';
import { Input } from './input.js';
import { Sfx } from './view/sfx.js';

const H = window.HubBridge;
const QS = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const PALETTE = ['#e0a040', '#6aa0e0', '#e06a8a', '#7ac46a', '#b48ae0', '#e0d06a', '#6ad6d0', '#e08a5a'];

const S = { runId: Date.now().toString(36), mode: 'expedition', diff: 'normale', role: 'solo', me: 0, name: 'Toi', job: 'bucheron', paused: true, started: false, acc: 0, last: 0, t: 0, goal: -1, stepDist: 0, bots: 1, ended: false, wallHitT: 0,
  tick: 0, netEv: [], worldDirty: true, lastWorld: -99, lastFull: -99, full: null, hostId: null, gotState: false, shownFell: new Set() };
const sfx = new Sfx();
const scene = createScene($('stage'), { onLost: () => location.reload() });
const canvas = scene.renderer.domElement;
const input = new Input(canvas, {
  gesture: () => sfx.start(),
  menu: () => (S.paused ? (S.started && !S.ended && resume()) : openMenu()),
  mute: () => toggleMute(),
  // Échap libère la souris sans que la page voie la touche : on ouvre le menu
  unlocked: () => { if (S.started && !S.paused && !input.free) openMenu(); },
});
input.bindTouch(document.querySelector('.tbtns'));
$('btnMenu').onclick = () => openMenu();
// le son, les graphismes et la souris : le panneau Réglages commun d'Arcadia ; M coupe ou remet le son
const toggleMute = () => { sfx.start(); sfx.toggleMute(); };
const QUALITY = [['bas', 'Basse'], ['moyen', 'Moyenne'], ['haut', 'Haute']];
const SETTINGS = {
  accent: '#e07a2e', hint: 'Touche <kbd>M</kbd> : couper ou remettre le son.',
  test: () => { sfx.start(); sfx.play('hache', { vol: 0.8 }); },
  sections: [
    { title: 'Graphismes', items: [{ label: 'Qualité', options: QUALITY, get: () => scene.quality, set: (v) => scene.setQuality(v) }],
      hint: 'Basse : moins d\'arbres au loin, pas d\'ombres, une seule nappe de brume.' },
    { title: 'Caméra', items: [{ label: 'Sensibilité de la souris', range: [0.3, 3, 0.1], format: (v) => v.toFixed(1), get: () => input.sens, set: (v) => input.setSens(v) }] },
    { title: 'Commandes', items: [{ keys: [
      ['Se déplacer', '<kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd>', 'stick gauche'], ['Frapper', '<kbd>Clic</kbd>', 'RT'],
      ['Ramasser, ranger, porter · tenir pour relever', '<kbd>E</kbd>', 'X'], ['Capacité du métier', '<kbd>F</kbd>', 'Y'],
      ['Sauter · marcher', '<kbd>Espace</kbd> · <kbd>Ctrl</kbd>', 'A · LB'], ['Menu', '<kbd>Échap</kbd>', 'Start'],
    ] }] },
  ],
};
if (window.DDVolume) window.DDVolume.panel($('btnSet'), SETTINGS);

const seed = +(QS.get('seed') || 0) || 1;
let sim = null, startSnap = null;
const multi = () => H.embedded && (H.players || []).length > 1;
const send = (to, m, o) => { if (H.embedded) H.send(to, m, o); };
try { const j = localStorage.getItem('fief_job'); if (JOBS[j]) S.job = j; } catch (e) {}
if (JOBS[QS.get('job')]) S.job = QS.get('job');

// ------------------------------------------------------------------ démarrage
async function boot() {
  if (H.embedded) {
    await new Promise((res) => { if (H.initDone) res(); else H.on('init', () => res()); setTimeout(res, 2500); });
    S.me = H.info.myId ?? 0;
    S.role = H.info.role === 'guest' ? 'guest' : 'host';
    S.hostId = H.info.hostId;
    const me = (H.players || []).find((p) => p.id === S.me);
    if (me && me.name) S.name = me.name;
    const st = H.info.settings || {};
    if (st.bots !== undefined && st.bots !== null) S.bots = +st.bots;
    if (st.mode) S.mode = st.mode; if (st.diff) S.diff = st.diff;
    H.on('msg', onMsg);
    H.on('roster', onRoster);
    H.signalReady();
  }
  if (QS.has('bots')) S.bots = +QS.get('bots');
  if (QS.get('mode')) S.mode = QS.get('mode'); if (QS.get('diff')) S.diff = QS.get('diff');
  sim = S.role === 'guest'
    ? new Sim({ seed, players: [] })
    : new Sim({ seed, players: [{ id: S.me, name: S.name, job: S.job, color: colorOf(S.me) }], bots: S.bots, mode: S.mode, diff: S.diff });
  startSnap = sim.snapshot();
  try {
    await scene.load(sim.map, { onProgress: (k) => { $('loadBar').style.width = Math.round(k * 100) + '%'; } });
  } catch (e) {
    console.error(e); $('loadTxt').textContent = 'Le chargement a échoué. Recharge la page.'; return;
  }
  $('loadBar').style.width = '100%';
  scene.update(view(), 0, 0);
  $('loading').classList.add('out'); setTimeout(() => $('loading').remove(), 700);
  $('hud').hidden = false;
  setGoal(0);
  if (S.role === 'guest') send('host', { t: 'look' });   // l'hôte nous envoie le monde tout de suite
  if (QS.has('autostart') || QS.has('debug')) startPlaying();
  else intro();
  S.last = performance.now();
  requestAnimationFrame(frame);
}
function colorOf(id) { const i = (H.players || []).findIndex((p) => p.id === id); return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]; }

// le choix du métier (écran d'accueil et menu)
function jobPicker() {
  return `<div class="jobs">${Object.entries(JOBS).map(([k, j]) => `<button class="job${k === S.job ? ' on' : ''}" data-job="${k}"><i class="jico ${k}"></i><b>${j.name}</b><span>${j.perk}</span><em><kbd>F</kbd> ${j.abName} : ${j.abText}</em></button>`).join('')}</div>`;
}
function bindJobs(after) {
  for (const b of document.querySelectorAll('.job')) b.onclick = () => {
    S.job = b.dataset.job; try { localStorage.setItem('fief_job', S.job); } catch (e) {}
    for (const o of document.querySelectorAll('.job')) o.classList.toggle('on', o === b);
    sfx.start(); sfx.play('ui', { vol: 0.4 });
    if (after) after();
  };
}
const SAVE_KEY = `fief_save_${seed}`;
function readSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.seed === seed && s.mode === sim.mode ? s : null; } catch (e) { return null; } }
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(sim.saveData())); } catch (e) {} }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
function intro() {
  S.paused = true;
  const save = S.role !== 'guest' ? readSave() : null;
  const guest = S.role === 'guest';
  const others = (H.players || []).filter((p) => p.id !== S.me).map((p) => esc(p.name));
  const mates = S.bots ? ` ${S.bots > 1 ? 'Deux chevaliers' : 'Un chevalier'} IA ${S.bots > 1 ? 'se battent' : 'se bat'} à vos côtés.` : '';
  showScreen(`<div class="titre"><div class="crest"><svg viewBox="0 0 64 72" aria-hidden="true"><path d="M32 3 58 12v22c0 17-11 28-26 35C17 62 6 51 6 34V12Z" fill="#3a2614" stroke="#d9b36a" stroke-width="3"/><path d="M20 46 32 20l12 26M24 38h16" fill="none" stroke="#e8c27a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div><h1>Fief Maudit</h1><p>Dix nuits pour briser la malédiction</p></div>
  <div class="sheet wide">
    <h2>${guest ? 'Rejoindre le village' : 'Jour 1 — Le bois'}</h2>
    <p class="sub">${others.length ? `Avec ${others.join(', ')}.` : 'La malédiction a vidé la vallée. Il ne reste que vous, un feu de camp et un village en ruine.'}${guest ? '' : mates}</p>
    <p>Le jour, abattez les arbres et rentrez le bois à l'entrepôt (trois bûches à la fois) ; les chênes donnent des poutres qui se portent à deux. Les lueurs dorées dans les bois sont des coffres gardés par des morts endormis : bois, vivres, huile ou élixir. Avant la nuit, chargez les braseros : quand la brume monte, les morts sortent du sol, et seuls ceux qui tombent dans la lumière restent à terre.</p>
    <h3>Ton métier</h3>
    ${jobPicker()}
    <div class="keys">
      <span><kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>Clic</kbd></span><span>Se déplacer · frapper (arbre ou squelette)</span>
      <span><kbd>E</kbd></span><span>Ramasser, ranger, charger un brasero, prendre un bout de poutre · <b>tenir</b> pour relever un équipier</span>
      <span><kbd>F</kbd></span><span>La capacité de ton métier (elle se recharge)</span>
      <span><kbd>Espace</kbd> · <kbd>Ctrl</kbd> · <kbd>Échap</kbd></span><span>Sauter · marcher · menu</span>
    </div>
    ${!guest && save ? `<p class="save">Une partie est en cours : <b>jour ${save.day}</b>, ${Object.values(save.build).filter((b) => b.state === 'debout').length} bâtiment(s) relevé(s), ${save.stock.bois} bûches et ${save.stock.poutre} poutres à l'entrepôt.</p>` : ''}
    <p class="note">${sim.mode === 'expedition' ? 'Expédition : tenez dix nuits (les nuits 5 et 10 sont des sièges), puis descendez affronter le Roi-Squelette.' : 'Sans fin : les nuits durcissent sans limite.'} · Difficulté ${S.diff === 'peste' ? 'Peste noire' : S.diff === 'paisible' ? 'Paisible' : 'Normale'}.</p>
    <div class="row">${!guest && save ? '<button class="btn" id="fresh">Nouvelle partie</button><button class="btn go" id="cont">Continuer</button>' : `<button class="btn go" id="go">${guest ? 'Rejoindre' : 'Prendre la hache'}</button>`}</div>
  </div>`);
  $('screen').classList.add('title');
  bindJobs();
  if ($('go')) $('go').onclick = () => { startPlaying(); resume(); };
  if ($('cont')) $('cont').onclick = () => { sim.loadSave(save); startSnap = sim.snapshot(); S.worldDirty = true; setGoal(sim.goal); startPlaying(); resume(); };
  if ($('fresh')) $('fresh').onclick = () => { clearSave(); startPlaying(); resume(); };
}
function startPlaying() {
  S.started = true; S.paused = false;
  if (S.role === 'guest') send('host', { t: 'hi', job: S.job });
  else sim.setJob(S.me, S.job);
}
function openMenu() {
  if (!S.started || S.ended) return;
  S.paused = true; input.unlock();
  const host = S.role !== 'guest';
  const canSkip = host && sim.clock.phase === 'jour' && sim.clock.t < sim.dayLen - CYCLE.dusk;
  const team = sim.players.map((p) => `<li><i style="background:${p.color}"></i>${esc(p.name)}${p.bot ? ' (IA)' : ''} · ${JOBS[p.job].name}${p.down ? ' · à terre' : ''}</li>`).join('');
  showScreen(`<div class="sheet wide">
    <h2>Pause</h2>
    <p class="sub">Jour ${sim.clock.day} · ${sim.stock.bois} bûche${sim.stock.bois > 1 ? 's' : ''} et ${sim.stock.poutre} poutre${sim.stock.poutre > 1 ? 's' : ''} à l'entrepôt${multi() ? ' · la partie continue pendant la pause' : ''}</p>
    <ul class="team">${team}</ul>
    <h3>Changer de métier</h3>
    ${jobPicker()}
    <label>Sensibilité de la souris <input type="range" id="sens" min="0.3" max="3" step="0.1" value="${input.sens}"></label>
    <div class="row">
      ${canSkip ? '<button class="btn" id="skip">Avancer jusqu\'au soir</button>' : ''}
      ${H.embedded ? '<button class="btn" id="quit">Retour au salon</button>' : ''}
      <button class="btn go" id="back">Reprendre</button>
    </div>
  </div>`);
  bindJobs(() => { if (S.role === 'guest') send('host', { t: 'job', job: S.job }); else sim.setJob(S.me, S.job); });
  $('sens').oninput = (e) => input.setSens(+e.target.value);
  $('back').onclick = () => resume();
  if ($('skip')) $('skip').onclick = () => { sim.skipToDusk(); resume(); };
  if ($('quit')) $('quit').onclick = () => H.exit();
}
function showScreen(html) { const s = $('screen'); s.innerHTML = html; s.hidden = false; s.classList.remove('title'); }
function resume() {
  $('screen').hidden = true; S.paused = false; $('lockHint').hidden = true;
  sfx.start();
  if (!document.body.classList.contains('touch')) input.lock();
}
document.addEventListener('visibilitychange', () => { if (document.hidden && S.started && !S.paused && !QS.has('debug')) openMenu(); });

// fin de partie : l'entrepôt est tombé, ou toute l'équipe est à terre
function gameOver(reason) {
  if (S.ended) return;
  S.ended = true; S.paused = true; input.unlock();
  if (reason === 'victoire') { victory(); return; }
  sfx.play('sol', { vol: 1, rate: 0.5 });
  const crypt = sim.crypt.open;
  const why = reason === 'entrepot' ? 'Les morts ont enfoncé l\'entrepôt : le bois du village est perdu.' : crypt ? 'Toute l\'équipe est à terre dans la crypte. Le Roi-Squelette garde son trône.' : 'Toute l\'équipe est à terre. Personne pour rallumer les braseros.';
  report(false);
  const host = S.role !== 'guest';
  showScreen(`<div class="sheet">
    <h2>${crypt ? 'La crypte vous a gardés' : 'Le village est tombé'}</h2>
    <p class="sub">${crypt ? 'Sous le château' : 'Nuit ' + sim.clock.day} · ${sim.stats.kills} squelette${sim.stats.kills > 1 ? 's' : ''} abattu${sim.stats.kills > 1 ? 's' : ''}</p>
    <p>${why}</p>
    ${host ? `<div class="row">
      <button class="btn" id="restart">Recommencer du début</button>
      ${crypt && sim.cryptSnap ? '<button class="btn go" id="retry">Retenter la crypte</button>' : sim.duskSnap ? '<button class="btn go" id="retry">Rejouer la nuit</button>' : ''}
    </div>` : '<p class="note">L\'hôte choisit : rejouer la nuit ou recommencer du début.</p>'}
  </div>`);
  if (!host) return;
  const back = (snap) => {
    // les arbres déjà abattus le restent (ils ne repoussent pas à l'écran) ; l'équipe d'aujourd'hui reprend sa place
    const s = structuredClone(snap); s.trees = sim.trees;
    const now = sim.players.map((p) => ({ id: p.id, name: p.name, job: p.job, color: p.color, bot: p.bot }));
    sim.restore(s);
    sim.players = sim.players.filter((p) => now.some((q) => q.id === p.id));
    for (const q of now) if (!sim.player(q.id)) sim.addPlayer(q);
    scene.actors.reset();
    S.ended = false; S.reported = false; S.goal = -1; setGoal(sim.goal); lastHud = ''; S.worldDirty = true; S.lastFull = -99;
    resume();
  };
  if ($('retry')) $('retry').onclick = () => { const cs = crypt && sim.cryptSnap; back(cs || sim.duskSnap); if (cs) sim.cryptSnap = cs; };
  $('restart').onclick = () => { clearSave(); back(startSnap); };
}

function victory() {
  if (S.role !== 'guest') clearSave();
  sfx.play('aube', { vol: 1 }); sfx.play('cloche', { vol: 0.9, delay: 0.4 });
  const built = Object.entries(sim.build).filter(([, b]) => b.state === 'debout').length;
  report(true);
  const best = sim.players.slice().sort((a, b) => b.kills - a.kills);
  const rows = best.map((p) => `<li><i style="background:${p.color}"></i>${esc(p.name)}${p.bot ? ' (IA)' : ''} · ${JOBS[p.job].name}<b>${p.kills} squelette${p.kills > 1 ? 's' : ''}</b></li>`).join('');
  showScreen(`<div class="sheet win">
    <h2>Le Roi-Squelette est tombé</h2>
    <p class="sub">La malédiction est brisée. Au-dessus de la vallée, la brume se déchire.</p>
    <p>${sim.clock.day - 1} nuits tenues · ${sim.stats.kills} squelettes abattus · ${built} bâtiment${built > 1 ? 's' : ''} relevé${built > 1 ? 's' : ''}.</p>
    <ul class="team score">${rows}</ul>
    <div class="row">${H.embedded ? '<button class="btn" id="quit">Retour au salon</button>' : ''}${S.role !== 'guest' ? '<button class="btn go" id="again">Nouvelle expédition</button>' : ''}</div>
  </div>`);
  if ($('quit')) $('quit').onclick = () => H.exit();
  if ($('again')) $('again').onclick = () => location.reload();
}

// le classement entre potes du salon : une ligne par partie, envoyée par l'hôte
function report(won) {
  if (S.reported || !H.embedded || S.role === 'guest') return;
  S.reported = true;
  const nights = Math.max(0, sim.clock.day - 1);
  const diff = S.diff === 'peste' ? 'Peste noire' : S.diff === 'paisible' ? 'Paisible' : 'Normale';
  const mode = sim.mode === 'sansfin' ? `Sans fin · ${nights} nuit${nights > 1 ? 's' : ''}` : won ? 'Roi-Squelette vaincu' : sim.crypt.open ? 'Expédition · tombés dans la crypte' : `Expédition · nuit ${sim.clock.day}`;
  const ranked = sim.players.slice().sort((a, b) => b.kills - a.kills);
  H.report({
    id: `fief-${seed}-${S.runId}-${sim.clock.day}`, mode: `${mode} (${diff})`,
    players: ranked.map((p, k) => ({ id: p.bot ? null : p.id, name: p.name, color: p.color, bot: !!p.bot, rank: k + 1, score: nights * 10 + p.kills + (won ? 100 : 0) })),
  });
}

// ------------------------------------------------------------------ réseau
function onMsg(from, m) {
  if (!m || typeof m !== 'object' || !sim) return;
  if (S.role !== 'guest') {
    // hôte : `from` vient du Hub, c'est la seule identité fiable
    if (m.t === 'look') { S.worldDirty = true; S.lastFull = -99; }
    else if (m.t === 'hi') {
      const p = (H.players || []).find((q) => q.id === from);
      if (!p) return;
      sim.addPlayer({ id: from, name: p.name, job: JOBS[m.job] ? m.job : 'bucheron', color: colorOf(from) });
      S.worldDirty = true; S.lastFull = -99;
    } else if (m.t === 'job' && JOBS[m.job]) { sim.setJob(from, m.job); S.worldDirty = true; }
    else if (m.t === 'i') sim.setInput(from, cleanInput(m));
    return;
  }
  if (from !== H.info.hostId) return;   // invité : seul l'hôte fait foi
  if (m.t === 's' && m.s) {
    const srv = applyState(sim, m.s, S.me);
    const p = sim.player(S.me);
    if (p && srv) { if (!S.gotState || p._fresh !== false) { Object.assign(p, srv); p._fresh = false; } reconcile(p, srv, !!p.act || p.carry === 'poutre' || p.down || p.dead); }
    S.gotState = true;
    if (S.ended && !sim.over) { S.ended = false; $('screen').hidden = true; S.paused = false; scene.actors.reset(); }
  } else if (m.t === 'w' && m.w) {
    for (const id of applyWorld(sim, m.w)) fellTree(id, sim.trees[id].dir, true);
  } else if (m.t === 'e' && Array.isArray(m.e)) for (const e of m.e) onEvent(e);
  else if (m.t === 'full' && m.s) S.full = m.s;
}
// le Hub change la liste des joueurs : un départ, une arrivée, ou un nouvel hôte
function onRoster() {
  if (!sim) return;
  if (S.role === 'guest' && H.info.role === 'host') { becomeHost(); return; }
  if (S.role === 'guest') { S.hostId = H.info.hostId; return; }
  const ids = new Set((H.players || []).map((p) => p.id));
  for (const p of [...sim.players]) if (!p.bot && p.id !== S.me && !ids.has(p.id)) { sim.removePlayer(p.id); S.worldDirty = true; }
}
// l'hôte est parti : on reprend la partie là où le dernier instantané complet l'avait laissée
function becomeHost() {
  const old = S.hostId;
  S.role = 'host'; S.hostId = S.me;
  const heir = new Sim({ seed, players: [] });
  if (S.full) heir.restore(S.full);
  else { heir.restore(structuredClone(sim.snapshot())); }
  if (old !== null && old !== S.me) heir.removePlayer(old);
  if (!heir.player(S.me)) heir.addPlayer({ id: S.me, name: S.name, job: S.job, color: colorOf(S.me) });
  const ids = new Set((H.players || []).map((p) => p.id));
  for (const p of [...heir.players]) if (!p.bot && !ids.has(p.id)) heir.removePlayer(p.id);
  heir.takeEvents();
  sim = heir; startSnap = startSnap || sim.snapshot();
  scene.actors.reset();
  S.worldDirty = true; S.lastFull = -99;
  toast('L\'hôte est parti : tu tiens le village');
}
function hostNet() {
  if (!multi()) { S.netEv = []; return; }
  S.tick++;
  if (S.tick % 2 === 0) send('all', { t: 's', s: encodeState(sim) }, { volatile: true });
  if (S.netEv.length) { send('all', { t: 'e', e: S.netEv }); S.netEv = []; }
  if (S.worldDirty || sim.t - S.lastWorld > 2) { S.worldDirty = false; S.lastWorld = sim.t; send('all', { t: 'w', w: encodeWorld(sim) }); }
  if (sim.t - S.lastFull > 4) { S.lastFull = sim.t; send('all', { t: 'full', s: sim.snapshot() }); }
}

// ------------------------------------------------------------------ boucle
function view() { return { sim, me: S.me, camYaw: input.yaw, camPitch: input.pitch, zoom: input.zoom }; }
function localInput() {
  const k = input.sample(DT);
  if (S.paused) return { ...emptyInput(), fc: k.fc, uc: k.uc, ac: k.ac };
  const Y = input.yaw, fx = -Math.sin(Y), fz = -Math.cos(Y), rx = Math.cos(Y), rz = -Math.sin(Y);
  return { ...emptyInput(), wx: fx * k.my + rx * k.mx, wz: fz * k.my + rz * k.mx, walk: k.walk, jump: k.jump, hold: k.hold, fc: k.fc, uc: k.uc, ac: k.ac };
}
function stepOnce() {
  if (S.role === 'guest') {
    const inp = localInput();
    if (S.started) {
      predict(sim, sim.player(S.me), inp);
      if ((S.tick = (S.tick || 0) + 1) % 2 === 0) send('host', { t: 'i', ...inp }, { volatile: true });
    }
    return;
  }
  sim.setInput(S.me, localInput());
  sim.step();
  if (sim.saveNow) { sim.saveNow = false; if (!sim.over) writeSave(); }
  for (const e of sim.takeEvents()) { onEvent(e); S.netEv.push(e); }
  hostNet();
}
const MANUAL = QS.has('manual');
function frame(now) {
  if (!MANUAL) requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.1, (now - S.last) / 1000)); S.last = now;
  // seul, la pause arrête le temps ; à plusieurs, la vallée continue
  const run = sim && S.started && !S.ended && (!S.paused || multi() || S.role === 'guest');
  if (run) {
    S.acc += dt;
    let n = 0;
    while (S.acc >= DT && n++ < 6 && !S.ended) { stepOnce(); S.acc -= DT; }
    if (S.acc > DT) S.acc = 0;
  }
  if (S.role === 'guest' && sim) { smooth(sim, dt, S.me); sim.events = []; }
  S.t += dt;
  scene.update(view(), S.paused && !multi() ? 0 : dt, S.t);
  hud(dt);
  if (sim) music();
}
// la musique suit la partie : le jour, la nuit, la crypte, le Roi
function music() {
  const p = sim.player(S.me), under = !!(p && sim.inCrypt(p.x, p.z));
  const king = sim.crypt.king !== null && sim.foe(sim.crypt.king);
  sfx.under(under);
  sfx.setMood(S.ended ? null : under ? (king && king.state !== 'dead' ? 'boss' : 'crypt') : sim.night || sim.foes.some((f) => f.kind === 'knight' && f.state !== 'dead') ? 'night' : 'day');
}

// ------------------------------------------------------------------ événements : sons, arbres, interface
function distTo(x, z) { const c = scene.camera.position; return Math.hypot(c.x - x, c.z - z); }
function fellTree(id, dir, quiet) {
  if (S.shownFell.has(id)) return false;
  S.shownFell.add(id); scene.treeFell(sim, id, dir, quiet);
  return true;
}
function banner(html, cls = '') { const el = $('banner'); el.innerHTML = html; el.className = 'banner ' + cls; el.hidden = false; clearTimeout(banner.t); banner.t = setTimeout(() => { el.hidden = true; }, 3300); }
function onEvent(e) {
  scene.fxEvent(e, sim);
  if (e.t === 'summon' && e.foe !== undefined && scene.actors) scene.actors.cast(e.foe);
  const p = e.pid !== undefined && e.pid !== null ? sim.player(e.pid) : null;
  const d = p ? distTo(p.x, p.z) : 0;
  const fd = e.x !== undefined ? distTo(e.x, e.z) : d;
  const mine = e.pid === S.me;
  switch (e.t) {
    case 'swing': sfx.play('souffle', { vol: 0.6, dist: d }); break;
    case 'hit': sfx.play('souffle', { vol: 0.4, dist: d }); sfx.play('hache', { vol: 1, dist: d }); break;
    case 'strike': sfx.play('souffle', { vol: 0.4, dist: d }); sfx.play('os', { vol: 1, dist: fd }); break;
    case 'block': sfx.play('bouclier', { vol: 0.9, dist: fd }); break;
    case 'fall': {
      const t = sim.map.trees[e.tree];
      if (S.role === 'guest') { sim.trees[e.tree].down = true; sim.trees[e.tree].dir = e.dir; }
      if (!fellTree(e.tree, e.dir)) break;
      sfx.play('craque', { vol: 0.8, dist: distTo(t.x, t.z), rate: 0.8 });
      sfx.play('arbre', { vol: 1, dist: distTo(t.x, t.z), delay: 0.9 });
      sfx.play('sol', { vol: 0.9, dist: distTo(t.x, t.z), delay: 1.45, rate: 0.7 });
      if (mine) toast(t.kind === 'oak' ? 'Un chêne : une poutre !' : 'Timber !');
      break;
    }
    case 'pick': case 'take': case 'grab': sfx.play('tronc', { vol: 0.6, dist: d }); break;
    case 'lift': sfx.play('tronc', { vol: 0.8 }); break;
    case 'drop': case 'beamDrop': sfx.play('sol', { vol: 0.7, dist: d }); break;
    case 'store': sfx.play('tronc', { vol: 0.9, dist: d }); if (mine) { sfx.play('ui', { vol: 0.35, delay: 0.1 }); toast(e.k > 1 ? `+${e.k} bûches` : '+1 bûche'); } bump('sBois'); break;
    case 'storeBeam': sfx.play('tronc', { vol: 1, dist: d, rate: 0.8 }); sfx.play('ui', { vol: 0.4, delay: 0.1 }); toast('+1 poutre'); bump('sPoutre'); break;
    case 'site': sfx.play('tronc', { vol: 0.9, dist: d }); banner(`Chantier ouvert<small>${esc(siteName(e.site))} : frappez-le (clic) pour le relever</small>`); bump('sBois'); break;
    case 'poor': if (mine) toast('Pas assez de bois ou de poutres à l\'entrepôt'); break;
    case 'hammer': sfx.play('hache', { vol: 0.8, dist: d, rate: 1.35 }); break;
    case 'built': sfx.play('aube', { vol: 0.7 }); banner(`${esc(siteName(e.site))} relevé${e.site === 'moulin' ? '' : 'e'} !<small>${esc(BUILDS[e.site].text)}</small>`); break;
    case 'gather': sfx.play('herbe', { vol: 0.8, dist: d, rate: 1.3 }); break;
    case 'storeFood': sfx.play('tronc', { vol: 0.6, dist: d, rate: 1.3 }); if (mine) toast(`+${FOOD.berries} vivres`); bump('sVivres'); break;
    case 'eat': if (mine) { sfx.play('ui', { vol: 0.4 }); toast('Miam'); } break;
    case 'siege': banner(`Nuit de siège<small>Le chevalier noir sort de la crypte</small>`, 'night'); break;
    case 'back': if (mine) toast('La chapelle t\'a ramené'); break;
    case 'repair': sfx.play('hache', { vol: 0.8, dist: d, rate: 1.2 }); if (mine) toast('Entrepôt réparé'); break;
    case 'feed': sfx.play('feu', { vol: 0.9, dist: d }); if (mine) toast('Le brasero flambe'); break;
    case 'land': sfx.play('herbe', { vol: 0.8, dist: d }); break;
    case 'goal': setGoal(e.goal); sfx.play('ui', { vol: 0.5 }); break;
    case 'join': if (p && p.id !== S.me && !p.bot) toast(`${p.name} rejoint le village`); break;
    case 'leave': if (e.pid !== S.me) toast(`${e.name || 'Un joueur'} est parti`); break;
    case 'dusk': banner('Le soleil se couche<small>Chargez les braseros : la nuit arrive</small>'); sfx.play('cloche', { vol: 0.8 }); break;
    case 'night': banner(`Nuit ${e.n}<small>La brume monte. Les morts se lèvent.</small>`, 'night'); sfx.play('cloche', { vol: 1, rate: 0.8 }); sfx.night(true); break;
    case 'dawn': banner(`L'aube !<small>Nuit ${e.n} tenue · les morts retournent à la poussière</small>`); sfx.play('aube', { vol: 0.8 }); sfx.night(false); if (!sim.crypt.open) setTimeout(() => toast('De nouveaux coffres luisent dans les bois'), 4500); break;
    case 'spawn': sfx.play('terre', { vol: 0.9, dist: fd, rate: 0.8 }); break;
    case 'guardWake': sfx.play('terre', { vol: 0.9, dist: fd, rate: 1.1 }); sfx.play('os', { vol: 0.7, dist: fd, delay: 0.2 }); break;
    case 'chest': sfx.play('craque', { vol: 0.8, dist: d, rate: 1.3 }); sfx.play('cloche', { vol: 0.4, dist: d, rate: 2.2, delay: 0.15 }); if (mine || d < 20) banner(`Un coffre !<small>${LOOT[e.loot].text}</small>`); bump('sBois'); break;
    case 'bell': sfx.play('cloche', { vol: 1 }); toast(`${mine ? 'Tu sonnes' : (p ? esc(p.name) : 'On') + ' sonne'} la cloche : la nuit tombe`); break;
    case 'rise': { const f = sim.foe(e.foe); sfx.play('craque', { vol: 0.7, dist: f ? distTo(f.x, f.z) : 30, rate: 1.3 }); break; }
    case 'kill': { const f = sim.foe(e.foe); sfx.play('os', { vol: 0.8, dist: f ? distTo(f.x, f.z) : 20, rate: 0.7 }); if (mine && !e.lit) toast('Il se relèvera dans la brume…'); break; }
    case 'hurt': sfx.play('coup', { vol: mine ? 1 : 0.6, dist: d }); if (mine) { document.body.classList.add('hurt'); clearTimeout(onEvent.h); onEvent.h = setTimeout(() => document.body.classList.remove('hurt'), 250); } break;
    case 'down': if (mine) sfx.play('sol', { vol: 1, rate: 0.6 }); else if (p) banner(`${esc(p.name)} est à terre<small>Tiens E près de lui pour le relever</small>`); break;
    case 'up': sfx.play('ui', { vol: 0.5 }); if (mine) toast('Debout !'); break;
    case 'dead': if (mine) banner('Tu es tombé<small>Tu reviendras au feu de camp à l\'aube</small>', 'night'); break;
    case 'brazierHit': sfx.play('bouclier', { vol: 0.5, dist: distTo(sim.map.braziers[e.brazier].x, sim.map.braziers[e.brazier].z), rate: 0.7 }); break;
    case 'wallHit': S.wallHitT = 0.4; sfx.play('hache', { vol: 0.5, dist: distTo(sim.map.warehouse.x, sim.map.warehouse.z), rate: 0.6 }); break;
    case 'crypt': banner('Dix nuits tenues !<small>Sous le château, la porte de la crypte s\'est ouverte</small>'); sfx.play('cloche', { vol: 1, rate: 0.6 }); sfx.night(false); break;
    case 'descend': if (mine) { sfx.play('sol', { vol: 0.6, rate: 0.6 }); banner('La crypte<small>Deux leviers ouvrent la herse : il faut les tenir ensemble</small>', 'night'); } break;
    case 'gate': sfx.play('craque', { vol: 1, rate: 0.5 }); sfx.play('bouclier', { vol: 0.8, rate: 0.5, delay: 0.3 }); banner('La herse se lève<small>Au-delà, le couloir de brume</small>', 'night'); break;
    case 'brumeCrypt': banner('Le couloir de brume<small>Les morts s\'y relèvent : passez vite, vers la lumière</small>', 'night'); break;
    case 'king': sfx.play('cloche', { vol: 1, rate: 0.5 }); banner('Le Roi-Squelette<small>Il se lève de son trône</small>', 'night'); break;
    case 'kingPhase': sfx.play('cloche', { vol: 0.8, rate: 0.45 }); banner(e.phase === 3 ? 'Le Roi est furieux<small>Il a soufflé les torches : rallumez-les (E)</small>' : 'Le Roi appelle ses morts<small>Ils viennent plus vite</small>', 'night'); break;
    case 'summon': sfx.play('terre', { vol: 1, dist: fd, rate: 0.6 }); break;
    case 'relight': sfx.play('feu', { vol: 0.9, dist: d }); if (mine) toast('La torche reprend'); break;
    case 'ability': if (mine) S.abFlash = 0.4; sfx.play(e.ab === 'rempart' ? 'bouclier' : e.ab === 'barricade' ? 'tronc' : e.ab === 'priere' ? 'cloche' : e.ab === 'fusee' ? 'feu' : 'souffle', { vol: e.ab === 'priere' ? 0.5 : 0.9, dist: d, rate: e.ab === 'priere' ? 1.6 : 1 }); break;
    case 'abilityHit': if (e.ab === 'grandcoup') sfx.play('sol', { vol: 0.8, dist: fd, rate: 1.2 }); else if (e.ab === 'priere' && mine) toast('Prière : l\'équipe autour reprend des forces'); break;
    case 'barHit': sfx.play('hache', { vol: 0.5, dist: fd, rate: 0.7 }); break;
    case 'kingDown': sfx.play('os', { vol: 1, rate: 0.5 }); sfx.play('craque', { vol: 1, rate: 0.4, delay: 0.2 }); break;
    case 'over': gameOver(e.reason); break;
  }
}
const siteName = (id) => (sim.map.buildings.find((b) => b.id === id) || {}).name || id;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
function bump(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function setGoal(g) {
  if (g === S.goal || !GOALS[g]) return;
  S.goal = g;
  const G = GOALS[g], el = $('goal');
  $('goalTxt').textContent = G.text; $('goalHint').textContent = G.hint;
  el.classList.remove('new'); void el.offsetWidth; el.classList.add('new');
}

let lastHud = '';
function hud(dt) {
  if (!sim) return;
  const p = sim.player(S.me);
  if (p && p.ground && p.speed > 0.5 && !S.paused) {
    S.stepDist += p.speed * dt;
    if (S.stepDist > (p.speed > 3.6 ? 1.7 : 1.1)) { S.stepDist = 0; sfx.play(sim.map.pathDist(p.x, p.z) < 2 || Math.hypot(p.x, p.z - 1) < 7 ? 'gravier' : 'herbe', { vol: p.carry ? 0.5 : 0.35 }); }
  }
  if (S.role === 'guest') setGoal(sim.goal);
  S.wallHitT = Math.max(0, S.wallHitT - dt);
  const c = sim.clock, night = c.phase === 'nuit';
  const pr = p ? sim.prompt(S.me) : null;
  const key = [sim.stock.bois, sim.stock.poutre, p && p.carry, p && p.load, pr && pr.text, pr && Math.round((pr.hp || 0) * 50), sim.goal, c.day, night, Math.ceil(sim.timeLeft), Math.round(p ? p.hp : 0), p && p.maxHp, p && p.down, p && Math.round(p.revive * 10), p && Math.round(p.downT), p && p.dead, Math.round(sim.village.hp), S.wallHitT > 0, sim.stock.nourriture, p && Math.round(p.food), p && p.cold, sim.foes.map((f) => (f.kind === 'knight' || f.kind === 'king' ? Math.round(f.hp) : '')).join(''), p && Math.ceil(p.cd), p && p.job, sim.crypt.open, sim.crypt.phase].join('|');
  if (key === lastHud) return;
  lastHud = key;
  const C = sim.crypt.open;
  $('day').textContent = C ? 'La crypte' : `${night ? 'Nuit' : 'Jour'} ${c.day}${MODES[sim.mode] ? '/' + MODES[sim.mode] : ''}`;
  $('clock').textContent = C ? 'le temps s\'est arrêté' : night ? `aube dans ${fmt(sim.timeLeft)}` : `nuit dans ${fmt(sim.timeLeft)}`;
  $('dayChip').classList.toggle('night', night || C);
  $('dayIco').className = 'ico ' + (night || C ? 'moon' : 'sun');
  $('sBois').querySelector('b').textContent = sim.stock.bois;
  $('sPoutre').querySelector('b').textContent = sim.stock.poutre;
  $('sPoutre').classList.toggle('off', !sim.stock.poutre);
  $('sVivres').querySelector('b').textContent = sim.stock.nourriture;
  $('sVivres').classList.toggle('off', !sim.stock.nourriture);
  const boss = sim.foes.find((f) => f.kind === 'king' && f.state !== 'dead') || sim.foes.find((f) => f.kind === 'knight' && f.state !== 'dead');
  $('bossBar').hidden = !boss;
  if (boss) {
    $('bossBar').querySelector('small').textContent = boss.kind === 'king' ? `Roi-Squelette${sim.crypt.phase > 1 ? ' · phase ' + sim.crypt.phase : ''}` : 'Chevalier noir';
    $('bossBar').classList.toggle('king', boss.kind === 'king');
    $('bossBar').querySelector('b').style.width = Math.max(0, boss.hp / (boss.maxHp || FOES[boss.kind].hp) * 100) + '%';
  }
  if (GOALS[S.goal] && GOALS[S.goal].id === 'ten') $('goalTxt').textContent = `${GOALS[S.goal].text} (${Math.min(10, sim.stock.bois)}/10)`;
  if (p) {
    $('hpBar').firstElementChild.style.width = (p.hp / p.maxHp * 100) + '%';
    $('hpTxt').textContent = Math.ceil(p.hp);
    $('hpBar').classList.toggle('low', p.hp < 30 && !p.down);
    document.body.classList.toggle('down', !!(p.down || p.dead));
    document.body.classList.toggle('cold', !!p.cold && !p.down);
    $('foodBar').querySelector('b i').style.width = (p.food / FOOD.max * 100) + '%';
    $('foodBar').classList.toggle('low', p.food < 20);
    $('downBox').hidden = !p.down;
    if (p.down) {
      const mate = sim.players.find((o) => o.reviving === p.id);
      $('downTxt').textContent = mate ? `${mate.name} te relève…` : `Un équipier peut te relever · ${fmt(HP.bleed - p.downT)}`;
      $('downRing').style.width = (p.revive / HP.revive * 100) + '%';
    }
  }
  $('wallBar').hidden = !(night || sim.village.hp < WAREHOUSE_HP);
  $('wallBar').querySelector('b').style.width = (sim.village.hp / WAREHOUSE_HP * 100) + '%';
  $('wallBar').classList.toggle('hit', S.wallHitT > 0);
  $('prompt').hidden = !pr;
  if (pr) {
    $('pKey').textContent = pr.key; $('pKey').hidden = !pr.key; $('pTxt').textContent = pr.text;
    $('pHp').hidden = pr.hp === undefined;
    if (pr.hp !== undefined) $('pHp').firstElementChild.style.width = Math.round(Math.min(1, pr.hp) * 100) + '%';
  }
  if (p) {
    const J = JOBS[p.job], ready = p.cd <= 0;
    $('abName').textContent = J.abName; $('abil').classList.toggle('ready', ready);
    $('abCd').textContent = ready ? '' : Math.ceil(p.cd);
    $('abil').style.setProperty('--cd', ready ? 0 : p.cd / J.cd);
    $('tAbility').classList.toggle('cool', !ready);
  }
  $('carry').hidden = !(p && p.carry);
  if (p && p.carry) $('carry').lastChild.textContent = p.carry === 'poutre' ? 'Tu portes une poutre' : p.carry === 'vivres' ? 'Tu portes un panier de baies' : p.load > 1 ? `Tu portes ${p.load} bûches` : 'Tu portes une bûche (E près d\'une autre pour empiler)';
}

// ------------------------------------------------------------------ outils de test
if (QS.has('debug')) {
  window.__fief = {
    get sim() { return sim; }, scene, input, S,
    ff(sec) { for (let i = 0; i < sec / DT; i++) stepOnce(); },
    hold(code, on = true) { if (on) input.keys.add(code); else input.keys.delete(code); },
    tp(x, z, yaw) { const p = sim.player(S.me); p.x = x; p.z = z; p.y = sim.map.heightAt(x, z); if (yaw !== undefined) { p.yaw = yaw; input.yaw = yaw + Math.PI; } Object.assign(scene.cam, { tx: x, tz: z, ty: p.y + 1.55 }); },
    cam(yaw, pitch, zoom) { input.yaw = yaw; if (pitch !== undefined) input.pitch = pitch; if (zoom !== undefined) { input.zoom = zoom; scene.cam.dist = zoom; } },
    press(k) { input.c[k]++; },
    frames(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { S.last = performance.now() - dt * 1000; frame(performance.now()); } },
  };
}
boot();
