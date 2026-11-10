// odyssee/js/vie-monde.js — la vie autour du joueur, suite de vie.js :
//  colporteurs et marché du week-end, arbres à baies et parois à fouiller (une fois par jour), revanches des dresseurs
//  de route, habitants qui parlent de tes exploits, sons d'ambiance, papillons / lucioles / mouettes.
import { T } from './world/tiles.js';
import { ITEMS } from './core/items.js';
import { MEGA_FORMS, LEGEND } from './core/mega.js';
import { levelCap } from './core/mon.js';
import { shopScreen, partyScreen } from './ui/screens.js';
import { createMon, monName } from './core/mon.js';
import { SPECIES } from './data/species.js';
import { ASSETS } from './assets.js';
import { FOSSILES, enFete } from './world/faune.js';

const jourDe = (d = new Date()) => d.toDateString();
const h32 = (a, b, s) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const etat = (st) => (st.vie ||= { baies: {}, fouilles: {}, revanche: {} });
const nomObjet = (k) => ITEMS[k]?.name || k;

/* ================= colporteurs et marché ================= */
export async function colporteur(game, n) {
  await game.ui.say(['Hé, dresseur ! Une petite pause ?', 'Je vends de quoi tenir la route, et une pierre rare que j\'ai trouvée en chemin.'], { speaker: 'Colporteur' });
  await shopScreen(game, n.def.stock.filter((k) => ITEMS[k]));
  await game.ui.say('Bonne route ! On se recroisera peut-être plus loin.', { speaker: 'Colporteur' });
}
export async function marche(game, n) {
  await game.ui.say(['Bienvenue au marché du week-end !', 'Je ne passe que le samedi et le dimanche : profites-en, j\'ai des objets qu\'on ne trouve nulle part ailleurs.'], { speaker: 'Marchande' });
  await shopScreen(game, n.def.stock.filter((k) => ITEMS[k]));
}

/* ================= arbres à baies et fouilles ================= */
export async function cueillir(game, o) {
  const st = game.state, E = etat(st), ui = game.ui;
  if (E.baies[o.id] === jourDe()) { await ui.say('Cet arbre a déjà été cueilli aujourd\'hui.\nDe nouvelles baies pousseront demain.'); return; }
  const n = 1 + Math.floor(Math.random() * 3);
  E.baies[o.id] = jourDe(); game.give(o.baie, n); game.sound.sfx('item');
  game.vieMonde?.majObjet(o);
  await ui.say(`${st.name} cueille ${n} ${nomObjet(o.baie)}${n > 1 ? ' (×' + n + ')' : ''} !`);
}
const TRESORS = [['hard-stone', 22], ['ether', 18], ['revive', 12], ['prism-shard', 14], ['fire-stone', 4], ['water-stone', 4], ['thunder-stone', 4], ['leaf-stone', 4], ['moon-stone', 4], ['dusk-stone', 3], ['dawn-stone', 3], ['shiny-stone', 3], ['ice-stone', 3], ['rare-candy', 4], ['gemme', 3], ['fossile', 9]];
export async function fouiller(game, o) {
  const st = game.state, E = etat(st), ui = game.ui;
  if (E.fouilles[o.id] === jourDe()) { await ui.say('Cette paroi a déjà été fouillée aujourd\'hui.'); return; }
  if (!(await ui.yesNo('La paroi scintille faiblement…\nGratter la roche ?'))) return;
  game.sound.sfx('hitweak'); await new Promise((r) => setTimeout(r, 250)); game.sound.sfx('hitweak'); await new Promise((r) => setTimeout(r, 250)); game.sound.sfx('hit');
  E.fouilles[o.id] = jourDe(); game.vieMonde?.majObjet(o);
  const tot = TRESORS.reduce((a, t) => a + t[1], 0); let r = Math.random() * tot, k = TRESORS[0][0];
  for (const [it, w] of TRESORS) { r -= w; if (r <= 0) { k = it; break; } }
  if (k === 'gemme') {   // une Méga-Gemme (jamais celle d'un légendaire)
    const g = Object.values(MEGA_FORMS).filter((f) => !f.fan && !LEGEND.has(f.base)).map((f) => f.stone).filter((s) => ITEMS[s]);
    k = g[Math.floor(Math.random() * g.length)];
  }
  if (k === 'fossile') { const L = Object.keys(FOSSILES); k = L[Math.floor(Math.random() * L.length)]; }
  if (!ITEMS[k]) k = 'hard-stone';
  game.give(k, 1); game.sound.sfx('item');
  await ui.say([`Quelque chose se détache de la roche…`, `${st.name} trouve : ${nomObjet(k)} !`]);
}

/* ================= revanches ================= */
const DELAI_REVANCHE = 20 * 3600e3;   // 20 heures
/** un dresseur de route déjà battu peut-il redemander un combat ? */
export function revanchePossible(game, n) {
  const d = n.def, st = game.state;
  if (!d.trainer || d.leader != null || d.champion || d.rival || d.vanish || d.winScript || d.onWin || game.mapObj?.id !== 'monde') return false;
  if (!st.flags['T:' + n.id]) return false;
  const t = etat(st).revanche[n.id];
  return t == null || Date.now() - t >= DELAI_REVANCHE;
}
export function noteCombat(game, n) { if (n.def.trainer && game.mapObj?.id === 'monde') etat(game.state).revanche[n.id] = Date.now(); }
export async function revanche(game, n) {
  const d = n.def, tr = d.trainer, st = game.state, ui = game.ui;
  const who = { speaker: tr.cls ? `${tr.cls} ${tr.name}` : tr.name, face: tr.bs || tr.ow || n.sprite };
  if (!(await ui.yesNo(`Te revoilà ! Mon équipe s'est entraînée depuis la dernière fois.\nUne revanche ?`, who))) { await ui.say('Une autre fois, alors !', who); return; }
  // l'équipe a progressé : près du niveau maximal du moment, sans jamais redescendre
  const cap = Math.min(100, levelCap(st.badges));
  const team = tr.team.map((e) => { const [sp, lvl, item, moves] = Array.isArray(e) ? e : [e.sp, e.lvl, e.item, e.moves]; return [sp, Math.max(lvl, cap - 3 - Math.floor(Math.random() * 3)), item, moves]; });
  const fake = { ...n, id: n.id + ':revanche', def: { ...d, id: n.id + ':revanche', trainer: { ...tr, team, intro: ['Cette fois, je ne vais pas me laisser faire !'] } } };
  etat(st).revanche[n.id] = Date.now();
  const res = await game.trainerBattle(fake, false);
  delete st.flags['T:' + n.id + ':revanche'];
  if (res === 'win') { await ui.say(['Toujours aussi fort…', 'Tiens, pour la peine.'], who); await game.api().give(['great-ball', 'super-potion', 'ultra-ball', 'hyper-potion'][Math.floor(Math.random() * 4)], 1); }
}

/* ================= les habitants parlent de toi ================= */
export function ragot(game) {
  const st = game.state, b = game.badgeCount(), N = st.name, f = st.flags;
  const L = [];
  if (f.champion) L.push([`C'est toi, ${N}, le Maître de la Ligue ? Je peux avoir un autographe ?`], ['Depuis que tu es Maître de la Ligue, les gamins du quartier ne parlent que de toi.']);
  else if (b >= 8) L.push(['Huit badges ! Il ne te reste plus que la Ligue Céleste.', 'Toute la région va suivre ton combat, tu sais.'], ['On dit que Célestine n\'a jamais perdu. Jamais. Bonne chance !']);
  else if (b >= 5) L.push([`${b} badges… On commence à entendre ton nom jusqu'ici.`], ['La Team Éclipse rôde encore. Fais attention à toi, sur les routes.'], ['Les dresseurs des routes se sont tous mis à s\'entraîner depuis que tu passes. Tu leur donnes envie !']);
  else if (b >= 2) L.push([`Tiens, tu as déjà ${b} badges ? Pas mal du tout !`], ['Mon fils veut devenir dresseur depuis qu\'il t\'a vu combattre.'], ['Il paraît que des gens en noir traînent du côté des ports. Bizarre…']);
  else if (b === 1) L.push(['Ton premier badge ! Ça se fête, ça.'], ['Le premier badge, c\'est le plus beau. Moi, je l\'ai encore dans un tiroir.']);
  else L.push(['Un nouveau dresseur ! Ça se voit, tu as encore l\'air tout neuf.'], ['Tu pars à la conquête des badges ? Commence par bien connaître ton Pokémon.']);
  const h = game.hour();
  if (h >= 19 || h < 6) L.push(['Bonsoir ! Il se fait tard, tu ne rentres pas ?']); else if (h < 10) L.push(['Bonjour ! Belle journée pour voyager, non ?']);
  const d = new Date().getDay(); if (d === 0 || d === 6) L.push(['C\'est le week-end ! Le marché s\'est installé près du centre de la ville.']);
  return L[Math.floor(Math.random() * L.length)];
}

/* ================= affichage : baies, paroi qui brille, petites bêtes, sons ================= */
function dessinBaies(couleur) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 26; const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // Déterminer les nuances d'ombre et de lumière selon la couleur
  const isBlue = couleur.includes('3f7') || couleur.includes('blue');
  const isYellow = couleur.includes('f2c') || couleur.includes('yellow');
  const darkCol = isBlue ? '#1e408a' : isYellow ? '#a16207' : '#15803d';
  const lightCol = isBlue ? '#93c5fd' : isYellow ? '#fde047' : '#bef264';
  const berries = [[7, 7, 3.8], [16, 5, 4.2], [24, 9, 3.8], [11, 16, 4.4], [21, 17, 4.0]];
  for (const [x, y, r] of berries) {
    // Pédoncule vert
    g.fillStyle = '#1e3a18'; g.fillRect(x, y - 6, 2, 3);
    g.fillStyle = '#3f7a28'; g.fillRect(x - 1, y - 5, 2, 2);
    // Ombre portée / contour
    g.fillStyle = '#0f172a'; g.beginPath(); g.arc(x + 0.5, y + 0.5, r + 0.8, 0, Math.PI * 2); g.fill();
    // Base de la baie
    g.fillStyle = darkCol; g.beginPath(); g.arc(x + 0.5, y + 0.5, r, 0, Math.PI * 2); g.fill();
    // Cœur coloré vibrant
    g.fillStyle = couleur; g.beginPath(); g.arc(x + 0.2, y + 0.2, r - 0.7, 0, Math.PI * 2); g.fill();
    // Éclat supérieur doux
    g.fillStyle = lightCol; g.beginPath(); g.arc(x - 1, y - 1, r * 0.45, 0, Math.PI * 2); g.fill();
    // Reflet blanc spéculaire net
    g.fillStyle = '#ffffff'; g.fillRect(x - 1, y - 2, 2, 1); g.fillRect(x - 2, y - 1, 1, 1);
  }
  return c;
}
function dessinEclat() {
  const c = document.createElement('canvas'); c.width = 30; c.height = 22; const g = c.getContext('2d');
  const etoile = (cx, cy, r, col) => { g.fillStyle = col; g.fillRect(cx, cy - r, 1, 2 * r + 1); g.fillRect(cx - r, cy, 2 * r + 1, 1); g.fillRect(cx - 1, cy - (r >> 1), 3, r + 1); g.fillRect(cx - (r >> 1), cy - 1, r + 1, 3); g.fillStyle = '#fff'; g.fillRect(cx - 1, cy - 1, 3, 3); };
  etoile(9, 11, 7, '#9fe2ff'); etoile(22, 6, 4, '#ffe28a'); etoile(23, 17, 3, '#c9a8ff');
  return c;
}
const COULEUR_BAIE = { 'oran-berry': '#3f7fe0', 'sitrus-berry': '#f2c13a', 'lum-berry': '#7fd14a' };

export class VieMonde {
  cri(sp) { this.game.sound.cry?.(ASSETS.cry(sp)); }
  constructor(game) { this.game = game; this.actors = []; this.betes = []; this.tSon = 3; this.overlay = null; }

  onMap(m) {
    const v = this.game.view;
    for (const a of this.actors) v.removeActor(a.id);
    for (const id of this.entr?.keys() || []) v.removeActor(id);
    this.entr = new Map(); this.tDecor = 0; this.fumees = [];
    this.actors = []; this.betes = [];
    for (const [k, o] of m.objects) {
      if (o.type !== 'baies' && o.type !== 'fouille') continue;
      const [x, y] = k.split(',').map(Number);
      this.actors.push({ id: 'vie:' + o.id, o, x, y });
    }
    this.actors.forEach((e) => this.majObjet(e.o));
    if (m.outdoor && !this.overlay) {
      const host = v.renderer?.domElement; const c = this.overlay = document.createElement('canvas'); c.className = 'ow-betes';
      if (host?.parentNode) host.insertAdjacentElement('afterend', c); else document.body.appendChild(c);
    }
    if (!m.outdoor && this.overlay) { this.overlay.remove(); this.overlay = null; }
  }

  /** l'arbre a-t-il ses baies, la paroi brille-t-elle encore aujourd'hui ? */
  majObjet(o) {
    const e = this.actors.find((a) => a.o === o); if (!e) return;
    const v = this.game.view, E = etat(this.game.state);
    const fait = (o.type === 'baies' ? E.baies : E.fouilles)[o.id] === jourDe();
    if (fait) { v.removeActor(e.id); e.a = null; return; }
    if (e.a) return;
    e.a = v.imageActor(e.id, o.type === 'baies' ? dessinBaies(COULEUR_BAIE[o.baie] || '#e04848') : dessinEclat(), o.type === 'baies' ? 1 : 1);
    if (e.a.shadow) e.a.shadow.visible = false;
    if (o.type === 'baies') v.place(e.a, e.x, e.y + 0.42, 0.18, true); else v.place(e.a, e.x, e.y + 0.45, 0.55, true);
  }

  tick(dt) {
    const g = this.game, m = g.mapObj; if (!m) return;
    // la paroi qui brille clignote doucement
    const t = performance.now() / 1000;
    for (const e of this.actors) if (e.a && e.o.type === 'fouille') e.a.mesh.visible = Math.sin(t * 3 + e.x) > -0.3;
    if (g.bv?.alive || g.ui.root.querySelector('.screen')) { if (this.overlay) this.overlay.getContext('2d').clearRect(0, 0, this.overlay.width, this.overlay.height); return; }
    this.sons(dt);
    this.entrTick();
    if (this.overlay) this.petitesBetes(dt);
  }

  /** ce qui entoure le joueur (dans un rayon de 7 cases) */
  autour() {
    const g = this.game, m = g.mapObj, p = g.player; let eau = 0, fleurs = 0, herbe = 0;
    for (let dy = -7; dy <= 7; dy += 2) for (let dx = -7; dx <= 7; dx += 2) {
      const t = m.get(p.x + dx, p.y + dy);
      if (t === T.WATER) eau++; else if (t === T.FLOWER) fleurs++; else if (t === T.TALL || t === T.GRASS || t === T.TREE) herbe++;
    }
    const z = m.outdoor ? m.zoneAt(p.x, p.y) : null;
    return { eau, fleurs, herbe, theme: z?.theme || '', ville: !!z?.town };
  }

  sons(dt) {
    const g = this.game, m = g.mapObj;
    if (!m.outdoor || g.busy) return;
    this.tSon -= dt; if (this.tSon > 0) return;
    this.tSon = 3 + Math.random() * 5;
    const A = this.autour(), h = g.hour(), soir = h >= 20 || h < 6;
    if (A.theme === 'snow' || A.theme === 'cime') g.sound.sfx('vent');
    else if (A.eau >= 12) g.sound.sfx('vague');
    else if (soir && A.herbe > 10) g.sound.sfx('grillon');
    else if (!soir && A.herbe > 8 && !['volcanic', 'cendre', 'forge', 'desert', 'dunes'].includes(A.theme)) g.sound.sfx('oiseau');
    else if (A.eau >= 4 && !soir && Math.random() < 0.5) g.sound.sfx('mouette');
  }

  /** papillons le jour près des fleurs, lucioles le soir dans la verdure, mouettes au-dessus de la mer */
  petitesBetes(dt) {
    const g = this.game, v = g.view, p = g.player, c = this.overlay, W = c.clientWidth || innerWidth, H = c.clientHeight || innerHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d'); x.clearRect(0, 0, W, H);
    const h = g.hour(), soir = h >= 20 || h < 6, now = performance.now() / 1000;
    this.decor(x, c, now, dt, h);
    this.tBete = (this.tBete ?? 0) - dt;
    if (this.tBete <= 0) {
      this.tBete = 0.6;
      const A = this.autour(), max = 10;
      const n = (k) => this.betes.filter((b) => b.k === k).length;
      const pres = () => [p.x + (Math.random() * 2 - 1) * 9, p.y + (Math.random() * 2 - 1) * 6];
      if (!soir && A.fleurs + A.herbe > 6 && n('papillon') < (A.fleurs > 3 ? 5 : 2) && this.betes.length < max) { const [bx, by] = pres(); this.betes.push({ k: 'papillon', x: bx, y: by, ph: Math.random() * 6, col: ['#ffd84a', '#ffffff', '#ff9ad5', '#9ad0ff'][Math.floor(Math.random() * 4)], vie: 20 }); }
      if (soir && A.herbe > 6 && n('luciole') < 9 && this.betes.length < max + 4) { const [bx, by] = pres(); this.betes.push({ k: 'luciole', x: bx, y: by, ph: Math.random() * 6, vie: 14 }); }
      if (!soir && A.eau >= 8 && n('mouette') < 2) { const g2 = Math.random() < 0.5; this.betes.push({ k: 'mouette', x: p.x + (g2 ? -14 : 14), y: p.y - 3 + Math.random() * 6, vx: g2 ? 3.2 : -3.2, ph: Math.random() * 6, vie: 12 }); }
    }
    for (const b of this.betes) {
      b.vie -= dt;
      if (b.k === 'papillon') { b.x += Math.sin(now * 0.9 + b.ph) * dt * 1.2; b.y += Math.cos(now * 0.7 + b.ph * 2) * dt * 0.9; }
      else if (b.k === 'luciole') { b.x += Math.sin(now * 0.5 + b.ph) * dt * 0.5; b.y += Math.cos(now * 0.4 + b.ph) * dt * 0.4; }
      else b.x += b.vx * dt;
      const s = v.screenPos(b.x, b.y, b.k === 'mouette' ? 120 : b.k === 'papillon' ? 26 + Math.sin(now * 3 + b.ph) * 6 : 18 + Math.sin(now + b.ph) * 8);
      if (!s) continue;
      const r = c.getBoundingClientRect(), sx = s.left - r.left, sy = s.top - r.top;
      if (b.k === 'papillon') {
        const ail = Math.abs(Math.sin(now * 14 + b.ph)) * 5 + 1;
        x.globalAlpha = Math.min(1, b.vie); x.fillStyle = b.col;
        x.fillRect(sx - ail - 1, sy - 3, ail, 4); x.fillRect(sx + 1, sy - 3, ail, 4); x.fillStyle = '#2a1a10'; x.fillRect(sx - 0.5, sy - 3, 1.5, 5);
      } else if (b.k === 'luciole') {
        const a = Math.max(0, Math.sin(now * 2.2 + b.ph)) * Math.min(1, b.vie);
        if (a < 0.05) continue;
        x.globalAlpha = a * 0.3; x.fillStyle = '#d8ff6a'; x.beginPath(); x.arc(sx, sy, 12, 0, 7); x.fill();
        x.globalAlpha = a * 0.6; x.beginPath(); x.arc(sx, sy, 5, 0, 7); x.fill();
        x.globalAlpha = a; x.fillStyle = '#fbffd8'; x.fillRect(sx - 2, sy - 2, 4, 4);
      } else {
        const ail = Math.sin(now * 5 + b.ph) * 4;
        x.globalAlpha = 0.25; x.fillStyle = '#000'; x.beginPath(); x.ellipse(sx + 10, sy + 70, 9, 3, 0, 0, 7); x.fill();
        x.globalAlpha = 1; x.strokeStyle = '#ffffff'; x.lineWidth = 2.5; x.beginPath();
        x.moveTo(sx - 11, sy - 2 - ail); x.quadraticCurveTo(sx - 5, sy - 6, sx, sy); x.quadraticCurveTo(sx + 5, sy - 6, sx + 11, sy - 2 - ail); x.stroke();
        x.strokeStyle = '#3a3a3a'; x.lineWidth = 1; x.beginPath(); x.moveTo(sx - 11, sy - 2 - ail); x.lineTo(sx - 8, sy - 3 - ail); x.stroke();
      }
    }
    x.globalAlpha = 1;
    this.betes = this.betes.filter((b) => b.vie > 0 && Math.abs(b.x - p.x) < 18 && Math.abs(b.y - p.y) < 13);
  }
}

/* ================= décor animé : fumée, drapeaux, fontaines, rosée, flaques, guirlandes de fête, dresseurs à l'entraînement ================= */
VieMonde.prototype.decor = function (x, c, now, dt, h) {
  const g = this.game, m = g.mapObj, v = g.view, p = g.player, r = c.getBoundingClientRect();
  const S = (wx, wy, hp) => { const q = v.screenPos(wx, wy, hp); return q && { x: q.left - r.left, y: q.top - r.top }; };
  // ce qui est autour du joueur, recalculé chaque seconde
  this.tDecor = (this.tDecor ?? 0) - dt;
  if (this.tDecor <= 0) {
    this.tDecor = 1;
    const pres = (o, d = 22) => Math.abs(o.x - p.x) < d && Math.abs(o.y - p.y) < d * 0.75;
    this.maisons = (m.buildings || []).filter((b) => pres(b) && ['house', 'house2', 'bighouse'].includes(b.kind) && h32(b.x, b.y, 5) < 0.55);
    this.mats = (m.buildings || []).filter((b) => pres(b) && ['gym', 'center', 'league'].includes(b.kind));
    this.fontaines = (m.deco || []).filter((d) => d.k === 'fontaine' && pres(d));
    const z = m.zoneAt?.(p.x, p.y);
    this.fete = enFete(g) && z?.town && ['aube', 'cime', 'orage', 'grue', 'givre'].some((id) => (z.id || z.name || '').toLowerCase().includes(id) || Object.values(g.world.towns).some((t) => t.id === id && p.x >= t.x - 6 && p.x <= t.x + t.w + 6 && p.y >= t.y - 6 && p.y <= t.y + t.h + 6));
    this.villeFete = this.fete ? Object.values(g.world.towns).find((t) => p.x >= t.x - 6 && p.x <= t.x + t.w + 6 && p.y >= t.y - 6 && p.y <= t.y + t.h + 6) : null;
    this.dresseurs(m);
  }
  const froid = ['snow', 'cime'].includes(m.zoneAt?.(p.x, p.y)?.theme);
  // fumée des cheminées : des volutes grises qui montent et s'étirent (plus le soir et dans le froid)
  this.fumees ||= [];
  for (const b of this.maisons || []) {
    b._t = (b._t ?? h32(b.x, b.y, 2) * 2) - dt * (froid || h >= 18 || h < 9 ? 1.6 : 1);
    if (b._t <= 0) { b._t = 0.7 + Math.random() * 0.6; this.fumees.push({ wx: b.x + b.w * 0.65, wy: b.y + 0.4, hp: (b.h || 2) * 32 + 4, age: 0, dx: 0 }); }
  }
  for (const f of this.fumees) {
    f.age += dt; f.dx += dt * 7; const q = S(f.wx, f.wy, f.hp); if (!q) continue;
    const a = Math.max(0, 0.7 - f.age * 0.19), rr = 5 + f.age * 6;
    x.globalAlpha = a; x.fillStyle = '#b9b9c3'; x.beginPath(); x.arc(q.x + f.dx + Math.sin(f.age * 2) * 3, q.y - f.age * 22, rr, 0, 7); x.fill();
  }
  this.fumees = this.fumees.filter((f) => f.age < 3.6);
  // drapeaux sur les arènes, les Centres et la Ligue
  for (const b of this.mats || []) {
    const q = S(b.x + b.w - 0.6, b.y + 0.3, (b.h || 3) * 32 + 8); if (!q) continue;
    x.globalAlpha = 1; x.fillStyle = '#4a4a52'; x.fillRect(q.x - 1, q.y - 34, 2, 36);
    const col = b.kind === 'center' ? '#e8504a' : b.kind === 'league' ? '#9b5de5' : '#f2b631';
    x.fillStyle = col; x.beginPath(); x.moveTo(q.x + 1, q.y - 34);
    for (let k = 0; k <= 6; k++) x.lineTo(q.x + 1 + k * 3.4, q.y - 34 + 4 + Math.sin(now * 5 - k * 0.8) * 2.2);
    for (let k = 6; k >= 0; k--) x.lineTo(q.x + 1 + k * 3.4, q.y - 34 + 13 + Math.sin(now * 5 - k * 0.8) * 2.2);
    x.closePath(); x.fill();
    if (b.kind === 'center') { x.fillStyle = '#fff'; x.fillRect(q.x + 9, q.y - 27, 6, 2); x.fillRect(q.x + 11, q.y - 29, 2, 6); }
  }
  // fontaines : un jet d'eau qui retombe en gouttelettes
  for (const d of this.fontaines || []) {
    const q = S(d.x, d.y, 30); if (!q) continue;
    for (let k = 0; k < 14; k++) {
      const t = ((now * 0.9 + k / 14) % 1), ang = (k / 14) * Math.PI * 2, rx = Math.cos(ang) * 14 * t, hy = -38 * t + 50 * t * t;
      x.globalAlpha = 0.85 * (1 - t); x.fillStyle = k % 3 ? '#bfe6ff' : '#ffffff'; x.fillRect(q.x + rx - 1, q.y + hy - 6, 2, 3);
    }
  }
  // rosée du matin : de petites étincelles sur l'herbe
  if (h >= 5 && h < 9 && !this.villeFete) {
    for (let k = 0; k < 26; k++) {
      const gx = p.x - 10 + Math.floor(h32(k, Math.floor(now / 3), 4) * 20), gy = p.y - 7 + Math.floor(h32(k, Math.floor(now / 3), 6) * 14);
      const t = m.get(gx, gy); if (t !== T.GRASS && t !== T.TALL && t !== T.FLOWER) continue;
      const a = Math.max(0, Math.sin(now * 3 + k)) ** 4; if (a < 0.1) continue;
      const q = S(gx + h32(k, 1, 1) - 0.5, gy + h32(k, 2, 1) - 0.5, 2); if (!q) continue;
      x.globalAlpha = a; x.fillStyle = '#ffffff'; x.fillRect(q.x - 2, q.y, 5, 1); x.fillRect(q.x, q.y - 2, 1, 5);
    }
  }
  // flaques sous la pluie : des ronds qui s'élargissent sur le sol
  if (g.view.weather?.current === 'rain') {
    this.ronds ||= [];
    if (Math.random() < dt * 14) this.ronds.push({ wx: p.x + (Math.random() * 2 - 1) * 10, wy: p.y + (Math.random() * 2 - 1) * 7, age: 0 });
    x.strokeStyle = '#d8ecff'; x.lineWidth = 1;
    for (const o of this.ronds) {
      o.age += dt; const q = S(o.wx, o.wy, 0); if (!q) continue;
      x.globalAlpha = Math.max(0, 0.6 - o.age); x.beginPath(); x.ellipse(q.x, q.y, 3 + o.age * 16, 1 + o.age * 6, 0, 0, 7); x.stroke();
    }
    this.ronds = this.ronds.filter((o) => o.age < 0.6);
  }
  // fête de village : une guirlande de lanternes autour de la place
  if (this.villeFete) {
    const t = this.villeFete, cx = t.x + t.w / 2, cy = t.y + t.h / 2, R = Math.min(t.w, t.h) * 0.32, cols = ['#ff5a5a', '#ffd23f', '#5ad1ff', '#9dff7a', '#ff8ad8'];
    let prev = null;
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2, q = S(cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.75, 70 + Math.sin(k * 1.3) * 6); if (!q) { prev = null; continue; }
      if (prev) { x.globalAlpha = 0.7; x.strokeStyle = '#3a2a1a'; x.lineWidth = 1; x.beginPath(); x.moveTo(prev.x, prev.y); x.quadraticCurveTo((prev.x + q.x) / 2, (prev.y + q.y) / 2 + 8, q.x, q.y); x.stroke(); }
      const on = 0.6 + 0.4 * Math.sin(now * 3 + k);
      x.globalAlpha = 0.35 * on; x.fillStyle = cols[k % 5]; x.beginPath(); x.arc(q.x, q.y + 6, 16, 0, 7); x.fill();
      x.globalAlpha = 1; x.fillStyle = '#2a1d12'; x.fillRect(q.x - 1, q.y - 2, 2, 3); x.fillStyle = cols[k % 5]; x.beginPath(); x.ellipse(q.x, q.y + 6, 5, 7, 0, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(q.x - 2, q.y + 2, 2, 4);
      prev = q;
    }
  }
  x.globalAlpha = 1;
};

/** les dresseurs des routes s'entraînent : leur premier Pokémon sautille à côté d'eux (s'il a un sprite de marche) */
VieMonde.prototype.dresseurs = function (m) {
  const g = this.game, v = g.view, p = g.player;
  this.entr ||= new Map();
  const vus = new Set();
  if (m.outdoor) for (const n of g.npcs) {
    const tr = n.def.trainer; if (!tr || n.def.leader != null || Math.abs(n.x - p.x) > 16 || Math.abs(n.y - p.y) > 12) continue;
    const e0 = tr.team?.[0], sp = Array.isArray(e0) ? e0[0] : e0?.sp; if (!sp || !g.followerOk?.(sp)) continue;
    const side = [[1, 0], [-1, 0], [0, 1]].find(([dx, dy]) => { const t = m.get(n.x + dx, n.y + dy); return t === T.GRASS || t === T.PATH || t === T.SAND || t === T.FLOWER; });
    if (!side) continue;
    const id = 'entr:' + n.id; vus.add(id);
    if (!this.entr.has(id)) this.entr.set(id, { a: v.actor(id, {}), sp, n, side, ph: Math.random() * 6 });
  }
  for (const [id, e] of this.entr) if (!vus.has(id)) { v.removeActor(id); this.entr.delete(id); }
};
VieMonde.prototype.entrTick = function () {
  const v = this.game.view, now = performance.now() / 1000;
  for (const e of this.entr?.values() || []) {
    const n = e.n, hop = Math.max(0, Math.sin(now * 4 + e.ph)) * 0.18;
    const dir = e.side[0] > 0 ? 'left' : e.side[0] < 0 ? 'right' : 'up';
    v.setFrame(e.a, 'poke:' + e.sp, dir, Math.floor(now * 4 + e.ph) % 2 ? 1 : 0);
    v.place(e.a, n.x + e.side[0], n.y + e.side[1], hop);
  }
};

/* ================= échanges, relais, concours, fête ================= */

export async function echange(game, n) {
  const st = game.state, ui = game.ui, E = n.def.trade, who = { speaker: E.who }, f = st.flags, k = 'X:' + E.town;
  const [gsp, glvl, gnick] = E.give, veut = E.want.map((s) => SPECIES[s]?.n).filter(Boolean);
  if (f[k]) { await ui.say(`Comment va ${gnick} ? Moi, je m'entends à merveille avec mon nouveau compagnon !`, who); return; }
  await ui.say([`J'aimerais tellement un ${veut.join(' ou un ')}…`, `En échange, je te donnerais mon ${SPECIES[gsp].n}, ${gnick}. Il est adorable, tu verras.`], who);
  if (!st.party.some((m) => E.want.includes(m.sp)) || st.party.length < 2) { await ui.say('Reviens me voir quand tu en auras un dans ton équipe !', who); return; }
  const i = await partyScreen(game, { mode: 'pick', prompt: 'Quel Pokémon échanger ?', filter: (m) => (E.want.includes(m.sp) ? null : 'Pas celui-là') });
  if (i == null || i < 0) { await ui.say('Dommage… Reviens si tu changes d\'avis !', who); return; }
  const m = st.party[i];
  if (!(await ui.yesNo(`Échanger ${monName(m)} contre ${gnick} (${SPECIES[gsp].n}, N.${glvl}) ?`))) return;
  st.party.splice(i, 1);
  const neuf = createMon(gsp, glvl, { ot: E.who, met: 'Échange à ' + (game.locationName?.() || 'la ville') });
  neuf.nick = gnick; neuf.ot = E.who;
  game.markCaught?.(gsp); st.party.push(neuf); f[k] = true;
  game.sound.sfx('caught');
  await ui.say([`${st.name} envoie ${monName(m)}…`, `… et reçoit ${gnick} !`, `Prends bien soin de ${gnick}. Et moi, je chouchouterai ${monName(m)} !`], who);
}

export async function relais(game, n) {
  const st = game.state, E = etat(st), ui = game.ui, who = { speaker: 'Gardienne du relais' };
  if ((E.relais ||= {})[n.id] === jourDe()) { await ui.say('Repose-toi sur le banc autant que tu veux. Le thé, ce sera demain !', who); return; }
  await ui.say(['Bienvenue au relais des voyageurs ! Une tasse de thé chaud ?', 'Tes Pokémon peuvent souffler un peu, eux aussi.'], who);
  E.relais[n.id] = jourDe();
  for (const m of st.party) if (m.hp > 0) m.hp = Math.max(m.hp, Math.ceil(m.stats[0] * 0.5));
  game.sound.sfx('heal');
  await ui.say('Tes Pokémon encore debout ont repris des forces (au moins la moitié de leurs PV).');
}

const CATEGORIES = [['Beauté', 3, 'élégance'], ['Force', 1, 'puissance'], ['Grâce', 5, 'agilité'], ['Sagesse', 4, 'sang-froid']];
export async function concours(game, n) {
  const st = game.state, E = etat(st), ui = game.ui, who = { speaker: 'Présentatrice' };
  if (E.concours === jourDe()) { await ui.say('Le concours du jour est terminé ! Reviens demain pour une nouvelle catégorie.', who); return; }
  const cat = CATEGORIES[new Date().getDay() % CATEGORIES.length];
  await ui.say([`Bienvenue au Concours Pokémon de Floralia ! Aujourd'hui : catégorie ${cat[0]} !`, `Le jury regarde la ${cat[2]} de ton Pokémon, son niveau… et la complicité entre vous.`], who);
  if (!(await ui.yesNo('Participer au concours ?', who))) return;
  const i = await partyScreen(game, { mode: 'pick', prompt: 'Quel Pokémon présenter ?', filter: (m) => (m.hp > 0 ? null : 'Il est K.O.') });
  if (i == null || i < 0) return;
  const m = st.party[i], L = levelCap(st.badges) - 5;
  const note = (lvl, stat, amitie, shiny) => lvl * 0.5 + stat / 3 + amitie / 10 + (shiny ? 20 : 0) + Math.random() * 18;
  const toi = note(m.lvl, m.stats[cat[1]], m.happy ?? m.friend ?? 70, m.shiny);
  const rivaux = ['Juliette et son Joliflor', 'Arthur et son Galopa', 'Inès et sa Mélodelfe'].map((nom) => [nom, note(L + Math.floor(Math.random() * 6), L * 1.5 + 20 + Math.random() * 25, 90, false)]);
  const tab = [[`${st.name} et ${monName(m)}`, toi], ...rivaux].sort((a, b) => b[1] - a[1]);
  const rang = tab.findIndex((t) => t[1] === toi) + 1;
  game.sound.cry?.(ASSETS.cry(m.sp));
  await ui.say([`${monName(m)} entre en scène et montre toute sa ${cat[2]} !`, 'Le jury délibère…', ...tab.map((t, k) => `${k + 1}. ${t[0]} — ${Math.round(t[1])} points`)], who);
  E.concours = jourDe();
  const prix = [[['rare-candy', 1], ['prism-shard', 1]], [['ultra-ball', 3]], [['super-potion', 2]], []][rang - 1];
  if (rang === 1) { game.sound.sfx('medal'); await ui.say(`Et la gagnante est… l'équipe de ${st.name} ! Bravo !`, who); }
  else await ui.say(rang === 4 ? 'Pas de prix cette fois… Reviens demain, la catégorie change chaque jour !' : `${rang}e place ! Joli passage.`, who);
  for (const [it, q] of prix) if (ITEMS[it]) await game.api().give(it, q);
}

export async function loterie(game) {
  const st = game.state, E = etat(st), ui = game.ui, who = { speaker: 'Stand de loterie' };
  if (E.loterie === jourDe()) { await ui.say('Un ticket par personne et par fête ! Reviens la semaine prochaine.', who); return; }
  await ui.say(['C\'est la fête ! Un ticket gratuit pour chaque visiteur.', 'Tire un numéro…'], who);
  E.loterie = jourDe();
  const r = Math.random(), lot = r < 0.03 ? 'rare-candy' : r < 0.12 ? 'ultra-ball' : r < 0.35 ? 'sitrus-berry' : r < 0.65 ? 'great-ball' : 'oran-berry';
  game.sound.sfx('select');
  await ui.say(`Numéro ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')} !`, who);
  await game.api().give(lot, 1);
}
export async function musicien(game) {
  game.sound.sfx('evolve');
  await game.ui.say(['♪ La la la… ♫', 'Le musicien joue un air de fête. Les enfants dansent autour de lui !'], { speaker: 'Musicien' });
}
