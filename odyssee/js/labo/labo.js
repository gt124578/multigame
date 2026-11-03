// odyssee/js/labo/labo.js — Odyssée Test (odyssee/test/) : la version de test, inspirée du labo de Lucas (testodyssee).
// On choisit un lieu et une équipe toute prête, et on apparaît directement dans la région, avec le vrai jeu.
// Rien n'est sauvegardé : la vraie partie n'est jamais touchée. Une barre d'outils permet de tester les nouveautés
// (heure, Éclipse, badges, carte dévoilée, rencontres) et d'ouvrir l'éditeur de carte (labo/editeur.js).
import { createMon } from '../core/mon.js';
import { walkable, T } from '../world/tiles.js';
import { nearestWalkable } from '../world/mapgen.js';
import { STARTER_CHOICES } from '../world/region.js';
import { Editeur } from './editeur.js';
import { el, esc } from '../ui/ui.js';

const CHOIX_KEY = 'odyssee-test-choix';

/* ---------------- équipes prêtes ---------------- */
const CS = ['cs-coupe', 'cs-surf', 'cs-eclate', 'cs-vol', 'cs-flash', 'cs-force'];
const SAC = { 'poke-ball': 50, 'great-ball': 30, 'ultra-ball': 30, 'master-ball': 3, potion: 30, 'super-potion': 30, 'hyper-potion': 30, 'max-potion': 10, 'full-restore': 10, revive: 10, 'full-heal': 20, 'rare-candy': 30, 'max-repel': 20, 'escape-rope': 10,
  'fire-stone': 3, 'water-stone': 3, 'thunder-stone': 3, 'leaf-stone': 3, 'moon-stone': 3, 'sun-stone': 3, 'town-map': 1 };
export const EQUIPES = [
  { id: 'debut', nom: 'Début d\'aventure', desc: 'N.8, aucun badge', badges: 0, team: [[1, 8], [16, 6]], cs: [] },
  { id: 'milieu', nom: 'Mi-parcours', desc: 'N.32, 4 badges, Coupe, Flash, Force', badges: 4, team: [[3, 32], [6, 32], [9, 32], [25, 30], [149, 32]], cs: ['cs-coupe', 'cs-flash', 'cs-force'] },
  { id: 'fin', nom: 'Fin de jeu', desc: 'N.60, 8 badges, toutes les CS', badges: 8, team: [[3, 60], [6, 60], [9, 60], [149, 60], [248, 60], [445, 60]], cs: CS },
  { id: 'starters', nom: 'Les 9 partenaires', desc: 'Les neuf starters au N.20 (pour voir le Pokémon qui suit)', badges: 4, team: STARTER_CHOICES.flatMap((c) => c.lines.map((l) => [l[0], 20])), cs: CS },
  { id: 'legende', nom: 'Légendaires', desc: 'N.70, 8 badges, toutes les CS', badges: 8, team: [[249, 70], [250, 70], [382, 70], [383, 70], [384, 70], [150, 70]], cs: CS },
  { id: 'vide', nom: 'Sans Pokémon', desc: 'Pour tester le choix des partenaires au labo', badges: 0, team: [], cs: [] },
];

/** partie de test : équipe, sac, badges ; rien n'est sauvegardé */
export function partieTest(game, eq, perso, lieu) {
  const st = game.newState(perso === 'f' ? 'Léa' : 'Léo', perso);
  const team = eq.team.map(([sp, l]) => createMon(sp, l, { ot: st.name, met: 'Labo de test' }));
  st.party = team.slice(0, 6); st.box = team.slice(6);
  st.badges = Array(8).fill(false).map((_, i) => i < eq.badges);
  st.money = 999999;
  st.bag = { ...SAC }; for (const c of eq.cs) st.bag[c] = 1;
  Object.assign(st.flags, { intro: true, dex: !!team.length, test: true });
  if (team.length) Object.assign(st.flags, { starter: team[0].sp, metProf: true, rival1: true, rivalSp: STARTER_CHOICES[0].lines[0][0] });
  for (const m of team) { if (!st.dex.caught.includes(m.sp)) st.dex.caught.push(m.sp); if (!st.dex.seen.includes(m.sp)) st.dex.seen.push(m.sp); }
  st.visited = Object.values(game.world.towns).map((t) => t.id);
  st.map = lieu.map; st.x = lieu.x; st.y = lieu.y; st.dir = 'down';
  st.lastCenter = { map: lieu.map, x: lieu.x, y: lieu.y, dir: 'down' };
  return st;
}

/* ---------------- lieux ---------------- */
export function listerLieux(world) {
  const W = world.maps.monde, out = [];
  const at = (m, x, y) => { const [a, b] = nearestWalkable(m, x + 0.5, y + 0.5); return { x: a, y: b }; };
  for (const t of Object.values(world.towns)) out.push({ cat: 'Villes', nom: t.name, map: 'monde', ...at(W, t.x + (t.w >> 1), t.y + (t.h >> 1)) });
  const seen = new Set();
  for (const r of world.routes) {
    const p = r.pts[Math.floor(r.pts.length / 2)], nom = seen.has(r.name) ? r.name + ' (suite)' : r.name; seen.add(r.name);
    out.push({ cat: 'Routes', nom, map: 'monde', ...at(W, p[0], p[1]) });
  }
  const pick = (re) => Object.values(world.maps).filter((m) => re.test(m.id));
  for (const m of Object.values(world.maps)) {
    if (m.id === 'monde' || m.id.includes(':')) continue;
    // lieu à part : on entre par sa première porte vers la grande carte, sinon au milieu
    const w = [...m.warps.entries()].find(([, to]) => to.map === 'monde');
    const [x, y] = w ? w[0].split(',').map(Number) : [m.w >> 1, m.h >> 1];
    const q = walkable(m.get(x, y - 1)) ? { x, y: y - 1 } : at(m, x, y);
    out.push({ cat: 'Grottes et lieux à part', nom: m.name || m.id, map: m.id, ...q });
  }
  const inside = (m) => ({ map: m.id, x: m.exitX ?? (m.w >> 1), y: (m.exitY ?? m.h - 1) - 1 });
  for (const m of [...pick(/^aube:labo$/), ...pick(/:center/).slice(0, 1), ...pick(/:gym/), ...pick(/^plateau:ligue$|^ligue:/)]) out.push({ cat: 'Intérieurs', nom: (m.name || m.id) + (m.id.includes(':center') ? ' (PC des Natures)' : ''), ...inside(m) });
  return out;
}

/* ---------------- démarrage ---------------- */
export async function startLabo({ game, world, view, ui, input, sound, setMode }) {
  const lieux = listerLieux(world);
  let choix = { lieu: 0, equipe: 'milieu', perso: 'm' };
  try { Object.assign(choix, JSON.parse(localStorage.getItem(CHOIX_KEY) || '{}')); } catch (e) { /* premier passage */ }
  // la partie de test n'est jamais sauvegardée
  game.save = () => true;
  const editeur = new Editeur(game);
  window.__ody.editeur = editeur;
  editeur.loadLocal();                         // retouches de l'éditeur gardées dans ce navigateur
  let bar = null;

  const menu = () => new Promise((resolve) => {
    const s = el('div', 'screen labo-scr');
    const cats = [...new Set(lieux.map((l) => l.cat))];
    s.innerHTML = `<div class="labo-box">
      <div class="labo-title">ODYSSÉE TEST <small>le labo des nouveautés · rien n'est sauvegardé</small></div>
      <div class="labo-cols">
        <div class="labo-col"><b>Lieu</b><select class="labo-lieu" size="16">${cats.map((c) => `<optgroup label="${esc(c)}">${lieux.map((l, i) => (l.cat === c ? `<option value="${i}"${i === choix.lieu ? ' selected' : ''}>${esc(l.nom)}</option>` : '')).join('')}</optgroup>`).join('')}</select></div>
        <div class="labo-col"><b>Équipe</b>${EQUIPES.map((e) => `<label class="labo-eq"><input type="radio" name="eq" value="${e.id}"${e.id === choix.equipe ? ' checked' : ''}><span>${esc(e.nom)}<small>${esc(e.desc)}</small></span></label>`).join('')}
          <b>Personnage</b><label class="labo-eq"><input type="radio" name="pp" value="m"${choix.perso !== 'f' ? ' checked' : ''}><span>Garçon</span></label><label class="labo-eq"><input type="radio" name="pp" value="f"${choix.perso === 'f' ? ' checked' : ''}><span>Fille</span></label></div>
      </div>
      <div class="labo-go"><button type="button" class="labo-btn" data-go>▶ APPARAÎTRE ICI</button></div>
      <div class="labo-help">Dans le jeu : barre d'outils en haut · <b>B</b> ouvre l'éditeur de carte · <b>G</b> change de lieu</div>
    </div>`;
    ui.root.appendChild(s);
    const go = () => {
      choix.lieu = +s.querySelector('.labo-lieu').value || 0;
      choix.equipe = s.querySelector('input[name=eq]:checked')?.value || 'milieu';
      choix.perso = s.querySelector('input[name=pp]:checked')?.value || 'm';
      try { localStorage.setItem(CHOIX_KEY, JSON.stringify(choix)); } catch (e) { /* stockage plein */ }
      pop(); s.remove(); resolve();
    };
    s.querySelector('[data-go]').addEventListener('click', go);
    s.querySelector('.labo-lieu').addEventListener('dblclick', go);
    const pop = input.push((k) => { if (k === 'a') go(); });
  });

  const lancer = async () => {
    setMode('menu'); bar?.remove(); editeur.close();
    document.querySelector('.title-scr')?.remove(); ui.closeDialog();
    await menu();
    const eq = EQUIPES.find((e) => e.id === choix.equipe) || EQUIPES[1];
    const st = partieTest(game, eq, choix.perso, lieux[choix.lieu] || lieux[0]);
    setMode('game');
    await game.start(st);
    bar = barre();
  };

  /* ---------------- barre d'outils ---------------- */
  const barre = () => {
    const b = el('div', 'labo-bar');
    const hours = [[null, 'Heure réelle'], [9, 'Matin'], [14, 'Jour'], [19, 'Soir'], [23, 'Nuit']];
    let h = 0;
    const st = () => game.state;
    const items = [
      ['📍 Lieu (G)', () => lancer()],
      ['✏️ Éditeur (B)', () => editeur.toggle()],
      ['🕑 ' + hours[0][1], (btn) => { h = (h + 1) % hours.length; game.hourOverride = hours[h][0]; game.view.setTimeOfDay(game.hour()); btn.textContent = '🕑 ' + hours[h][1]; }],
      ['🌿 Rencontres : oui', (btn) => { game.noEnc = !game.noEnc; btn.textContent = '🌿 Rencontres : ' + (game.noEnc ? 'non' : 'oui'); }],
      ['🏅 Badge +1', () => { const k = st().badges.indexOf(false); if (k >= 0) st().badges[k] = true; else st().badges.fill(false); game.refreshGates(); game.hud?.update(true); ui.toast(`${st().badges.filter(Boolean).length} badge(s)`); }],
      ['🌑 Éclipse', () => { const f = st().flags; if (game.eclipseOn()) f.lugia = true; else { f.eclipse = true; f.lugia = false; } game.setEclipse(); }],
      ['🗺️ Tout dévoiler', () => { const W = world.maps.monde, n = Math.ceil(W.w / 8) * Math.ceil(W.h / 8); st().explored = Array.from({ length: n }, (_, i) => i); game._seen = null; st().mapView = null; ui.toast('Carte entièrement dévoilée'); }],
      ['🗺️ Rien dévoilé', () => { st().explored = []; game._seen = null; st().mapView = null; game.explore(); ui.toast('Exploration remise à zéro'); }],
      ['💖 Soigner', () => { for (const m of st().party) { m.hp = m.stats[0]; m.status = null; } game.hud?.update(true); ui.toast('Équipe soignée'); }],
    ];
    for (const [label, fn] of items) { const btn = el('button', 'labo-tb', esc(label)); btn.type = 'button'; btn.tabIndex = -1; btn.addEventListener('click', (e) => { e.stopPropagation(); btn.blur(); fn(btn); }); b.appendChild(btn); }
    ui.root.appendChild(b);
    return b;
  };
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if (!game.state || document.querySelector('.labo-scr')) return;
    if (e.code === 'KeyB' && !game.bv.alive) { e.preventDefault(); editeur.toggle(); }
    if (e.code === 'KeyG' && !game.busy && !editeur.on) { e.preventDefault(); lancer(); }
  });
  void T; void sound; void view;
  await lancer();
}
