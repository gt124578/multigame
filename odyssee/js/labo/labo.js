// odyssee/js/labo/labo.js — Odyssée Test (odyssee/test/) : la version de test, inspirée du labo de Lucas (testodyssee).
// On choisit un lieu et une équipe toute prête, et on apparaît directement dans la région, avec le vrai jeu.
// Rien n'est sauvegardé : la vraie partie n'est jamais touchée. Une barre d'outils permet de tester les nouveautés
// (heure, Éclipse, badges, carte dévoilée, rencontres) et d'ouvrir l'éditeur de carte (labo/editeur.js).
import { createMon, healFull } from '../core/mon.js';
import { walkable, T } from '../world/tiles.js';
import { nearestWalkable } from '../world/mapgen.js';
import { STARTER_CHOICES, BADGES } from '../world/region.js';
import { Editeur } from './editeur.js';
import { el, esc } from '../ui/ui.js';

const CHOIX_KEY = 'odyssee-test-choix';

/* ---------------- équipes prêtes ---------------- */
const CS = ['cs-coupe', 'cs-surf', 'cs-eclate', 'cs-vol', 'cs-flash', 'cs-force'];
const SAC = { 'poke-ball': 99, 'great-ball': 99, 'ultra-ball': 99, 'master-ball': 10, potion: 99, 'super-potion': 99, 'hyper-potion': 99, 'max-potion': 50, 'full-restore': 50, revive: 50, 'full-heal': 50, 'rare-candy': 99, 'max-repel': 50, 'escape-rope': 20,
  'fire-stone': 5, 'water-stone': 5, 'thunder-stone': 5, 'leaf-stone': 5, 'moon-stone': 5, 'sun-stone': 5, 'town-map': 1, velo: 1, 'permis-bateau': 1 };
export const EQUIPES = [
  { id: 'faible', nom: 'Faible', desc: 'N.10 : de quoi tester le début', team: [[1, 10], [16, 9], [10, 8]] },
  { id: 'moyenne', nom: 'Moyenne', desc: 'N.35 : mi-parcours', team: [[3, 35], [6, 35], [9, 35], [25, 33], [149, 35], [143, 34]] },
  { id: 'forte', nom: 'Forte', desc: 'N.60 : fin de jeu', team: [[3, 60], [6, 60], [9, 60], [149, 60], [248, 60], [445, 60]] },
  { id: 'max', nom: 'Très forte', desc: 'N.100 : rien ne résiste', team: [[149, 100], [248, 100], [445, 100], [373, 100], [376, 100], [6, 100]] },
  { id: 'legende', nom: 'Légendaires', desc: 'N.70', team: [[249, 70], [250, 70], [382, 70], [383, 70], [384, 70], [150, 70]] },
  { id: 'starters', nom: 'Les partenaires', desc: 'Les six starters au N.20 (pour voir le Pokémon qui suit)', team: STARTER_CHOICES.flatMap((c) => c.lines.map((l) => [l[0], 20])) },
  { id: 'vide', nom: 'Sans Pokémon', desc: 'Pour tester le choix des partenaires au labo', team: [] },
];
export const HISTOIRES = [
  { id: 'normale', nom: 'Comme une partie normale', flags: {} },
  { id: 'eclipse', nom: 'Pendant l\'Éclipse', flags: { eclipse: true, plume: true } },
  { id: 'finie', nom: 'Histoire terminée', flags: { eclipse: true, lugia: true, plume: true } },
];

/** partie de test : équipe, sac complet, badges et histoire au choix ; rien n'est sauvegardé */
export function partieTest(game, eq, perso, lieu, statut = {}) {
  const st = game.newState(perso === 'f' ? 'Léa' : 'Léo', perso);
  const team = eq.team.map(([sp, l]) => createMon(sp, l, { ot: st.name, met: 'Labo de test' }));
  st.party = team.slice(0, 6); st.box = team.slice(6);
  const nb = statut.badges ?? BADGES.length;
  st.badges = BADGES.map((_, i) => i < nb);
  st.money = 9999999;
  st.bag = { ...SAC }; for (const c of CS) st.bag[c] = 1;
  st.velo = false;
  Object.assign(st.flags, { intro: true, dex: true, test: true, journal: true }, (HISTOIRES.find((h) => h.id === statut.histoire) || HISTOIRES[0]).flags);
  Object.assign(st.flags, { starter: team[0]?.sp || STARTER_CHOICES[0].lines[0][0], metProf: true, rival1: true, rivalSp: STARTER_CHOICES[0].lines[0][0] });
  if (!team.length) { delete st.flags.starter; st.flags.metProf = false; st.flags.rival1 = false; }
  for (const m of team) { if (!st.dex.caught.includes(m.sp)) st.dex.caught.push(m.sp); if (!st.dex.seen.includes(m.sp)) st.dex.seen.push(m.sp); }
  st.visited = Object.values(game.world.towns).map((t) => t.id);
  if (statut.domaine) st.domaine = domaineTest();
  st.map = lieu.map; st.x = lieu.x; st.y = lieu.y; st.dir = 'down';
  st.lastCenter = { map: lieu.map, x: lieu.x, y: lieu.y, dir: 'down' };
  return st;
}
/** un Domaine de test : tous les talents et de quoi tout bâtir */
function domaineTest() {
  return { nom: 'Domaine de test', travaux: [], hab: 0, recolte: {}, res: [1], talents: ['verdure', 'eau', 'pierre', 'charpente', 'etincelle', 'accueil'], mat: { bois: 9999, pierre: 9999, fibre: 9999, graines: 9999 } };
}
/** mode libre : toutes les barrières ouvertes (gardes, arènes), pas de plafond de niveau, on sort des arènes quand on veut */
export function modeLibre(game, on) {
  game.libre = on;
  if (on) { game.gateClosed = () => false; game.levelCap = () => 100; }
  else { delete game.gateClosed; delete game.levelCap; }
  if (game.state) game.refreshGates?.();
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
  const tous = Object.values(world.maps);
  for (const m of tous) {
    if (m.id === 'monde' || m.id.includes(':') || m.id === 'domaine') continue;
    // lieu à part : on entre par sa première porte vers la grande carte, sinon au milieu
    const w = [...m.warps.entries()].find(([, to]) => to.map === 'monde');
    const [x, y] = w ? w[0].split(',').map(Number) : [m.w >> 1, m.h >> 1];
    const q = walkable(m.get(x, y - 1)) ? { x, y: y - 1 } : at(m, x, y);
    out.push({ cat: 'Grottes et lieux à part', nom: m.name || m.id, map: m.id, ...q });
  }
  const inside = (m) => { const x = m.exitX ?? (m.w >> 1), y = (m.exitY ?? m.h - 1) - 1; return walkable(m.get(x, y)) ? { map: m.id, x, y } : { map: m.id, ...at(m, x, y) }; };
  // chaque arène : son nom de ville et son type
  for (const m of tous.filter((q) => /:gym/.test(q.id))) out.push({ cat: 'Arènes', nom: (m.name || m.id) + (m.arene ? ' · ' + m.arene : ''), ...inside(m) });
  for (const m of tous.filter((q) => /^plateau:|^ligue:|league/.test(q.id))) out.push({ cat: 'Ligue', nom: m.name || m.id, ...inside(m) });
  for (const m of tous.filter((q) => q.id.includes(':') && !/:gym|^plateau:|^ligue:|league|^domaine/.test(q.id))) out.push({ cat: 'Intérieurs', nom: `${m.name || m.id} (${m.id.split(':')[0]})`, ...inside(m) });
  out.push({ cat: 'Domaine', nom: 'Ton Domaine (terrain à bâtir)', map: 'domaine', x: 32, y: 44, domaine: true });
  return out;
}

/* ---------------- démarrage ---------------- */
export async function startLabo({ game, world, view, ui, input, sound, setMode }) {
  let lieux = listerLieux(world);
  let choix = { lieu: 0, equipe: 'moyenne', perso: 'm', badges: BADGES.length, histoire: 'normale', libre: true, domaine: true, dresseurs: false };
  try { Object.assign(choix, JSON.parse(localStorage.getItem(CHOIX_KEY) || '{}')); } catch (e) { /* premier passage */ }
  if (!EQUIPES.some((e) => e.id === choix.equipe)) choix.equipe = 'moyenne';
  // la partie de test n'est jamais sauvegardée
  game.save = () => true;
  const editeur = new Editeur(game);
  window.__ody.editeur = editeur;
  editeur.loadLocal();                         // retouches de l'éditeur gardées dans ce navigateur
  let bar = null;
  const garde = () => { try { localStorage.setItem(CHOIX_KEY, JSON.stringify(choix)); } catch (e) { /* stockage plein */ } };
  const optLieux = (sel) => { const cats = [...new Set(lieux.map((l) => l.cat))]; return cats.map((c) => `<optgroup label="${esc(c)}">${lieux.map((l, i) => (l.cat === c ? `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(l.nom)}</option>` : '')).join('')}</optgroup>`).join(''); };

  const menu = () => new Promise((resolve) => {
    const s = el('div', 'screen labo-scr');
    s.innerHTML = `<div class="labo-box">
      <div class="labo-title">ODYSSÉE TEST <small>la version de développement · tout est débloqué · rien n'est sauvegardé</small></div>
      <div class="labo-cols">
        <div class="labo-col"><b>Lieu</b><input class="labo-cherche" placeholder="Chercher un lieu…"><select class="labo-lieu" size="16">${optLieux(choix.lieu)}</select></div>
        <div class="labo-col"><b>Équipe</b>${EQUIPES.map((e) => `<label class="labo-eq"><input type="radio" name="eq" value="${e.id}"${e.id === choix.equipe ? ' checked' : ''}><span>${esc(e.nom)}<small>${esc(e.desc)}</small></span></label>`).join('')}
          <b>Personnage</b><label class="labo-eq"><input type="radio" name="pp" value="m"${choix.perso !== 'f' ? ' checked' : ''}><span>Garçon</span></label><label class="labo-eq"><input type="radio" name="pp" value="f"${choix.perso === 'f' ? ' checked' : ''}><span>Fille</span></label></div>
        <div class="labo-col"><b>Statut</b>
          <label class="labo-eq"><span>Badges<small>0 à ${BADGES.length}</small></span><input type="number" name="badges" min="0" max="${BADGES.length}" value="${choix.badges}"></label>
          <label class="labo-eq"><span>Histoire</span><select name="histoire">${HISTOIRES.map((h) => `<option value="${h.id}"${h.id === choix.histoire ? ' selected' : ''}>${esc(h.nom)}</option>`).join('')}</select></label>
          <label class="labo-eq"><input type="checkbox" name="libre"${choix.libre ? ' checked' : ''}><span>Mode libre<small>gardes et arènes ouverts, pas de plafond de niveau</small></span></label>
          <label class="labo-eq"><input type="checkbox" name="domaine"${choix.domaine ? ' checked' : ''}><span>Domaine acheté<small>le terrain à bâtir derrière la maison</small></span></label>
          <label class="labo-eq"><input type="checkbox" name="dresseurs"${choix.dresseurs ? ' checked' : ''}><span>Combats de dresseurs<small>décoché : les dresseurs ne t'arrêtent plus</small></span></label>
          <small>Toujours : toutes les CS, vélo, permis bateau, sac plein, 9 999 999 ₽, Pokédex et journal.</small></div>
      </div>
      <div class="labo-go"><button type="button" class="labo-btn" data-go>▶ APPARAÎTRE ICI</button></div>
      <div class="labo-help">En jeu : barre d'outils en haut · <b>T</b> se téléporter · <b>G</b> revenir à ce menu · <b>B</b> éditeur de carte</div>
    </div>`;
    ui.root.appendChild(s);
    const sel = s.querySelector('.labo-lieu');
    s.querySelector('.labo-cherche').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); for (const o of sel.querySelectorAll('option')) o.hidden = q && !o.textContent.toLowerCase().includes(q); });
    for (const i of s.querySelectorAll('input, select')) i.addEventListener('keydown', (e) => e.stopPropagation());
    const go = () => {
      choix.lieu = +sel.value || 0;
      choix.equipe = s.querySelector('input[name=eq]:checked')?.value || 'moyenne';
      choix.perso = s.querySelector('input[name=pp]:checked')?.value || 'm';
      choix.badges = Math.max(0, Math.min(BADGES.length, +s.querySelector('[name=badges]').value || 0));
      choix.histoire = s.querySelector('[name=histoire]').value;
      choix.libre = s.querySelector('[name=libre]').checked; choix.domaine = s.querySelector('[name=domaine]').checked; choix.dresseurs = s.querySelector('[name=dresseurs]').checked;
      garde(); pop(); s.remove(); resolve();
    };
    s.querySelector('[data-go]').addEventListener('click', go);
    sel.addEventListener('dblclick', go);
    const pop = input.push((k) => { if (k === 'a') go(); });
  });

  const lancer = async () => {
    setMode('menu'); bar?.remove(); editeur.close(); fermerPanneau();
    document.querySelector('.title-scr')?.remove(); ui.closeDialog();
    await menu();
    const eq = EQUIPES.find((e) => e.id === choix.equipe) || EQUIPES[1];
    const lieu = lieux[choix.lieu] || lieux[0];
    const st = partieTest(game, eq, choix.perso, lieu, { ...choix, domaine: choix.domaine || lieu.domaine });
    modeLibre(game, choix.libre);
    game.noTrainers = !choix.dresseurs;
    setMode('game');
    await game.start(st);
    bar = barre();
  };

  /* ---------------- téléportation (sans changer d'équipe ni de statut) ---------------- */
  let panneau = null;
  function fermerPanneau() { panneau?.remove(); panneau = null; }
  const ouvrirPanneau = (titre, html, onDone) => {
    fermerPanneau();
    panneau = el('div', 'labo-panneau', `<div class="labo-title">${esc(titre)} <button type="button" data-x>✕</button></div>${html}`);
    ui.root.appendChild(panneau);
    panneau.querySelector('[data-x]').onclick = () => fermerPanneau();
    for (const i of panneau.querySelectorAll('input, select, textarea')) i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') fermerPanneau(); });
    onDone?.(panneau);
  };
  const teleporter = () => {
    if (!game.state || game.bv.alive) return;
    lieux = listerLieux(world);
    ouvrirPanneau('SE TÉLÉPORTER', `<input class="labo-cherche" placeholder="Chercher (ville, arène, route, grotte, intérieur…)"><select class="labo-lieu" size="18">${optLieux(-1)}</select><button type="button" class="labo-btn" data-go>▶ Y ALLER</button>`, (P) => {
      const sel = P.querySelector('.labo-lieu'), q = P.querySelector('.labo-cherche'); q.focus();
      q.addEventListener('input', () => { const v = q.value.toLowerCase(); for (const o of sel.querySelectorAll('option')) o.hidden = v && !o.textContent.toLowerCase().includes(v); });
      const go = async () => {
        const l = lieux[+sel.value]; if (!l) return; fermerPanneau();
        if (l.domaine && !game.state.domaine) game.state.domaine = domaineTest();
        if (l.domaine) { const { preparerDomaine } = await import('../ui/domaine.js'); preparerDomaine(game); }
        while (game.busy) await new Promise((r) => setTimeout(r, 50));
        await game.warp({ map: l.map, x: l.x, y: l.y, dir: 'down' }, 'select');
      };
      P.querySelector('[data-go]').onclick = go; sel.addEventListener('dblclick', go);
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const o = [...sel.options].find((x) => !x.hidden); if (o) { sel.value = o.value; go(); } } });
    });
  };
  /* ---------------- statut et équipe en cours de partie ---------------- */
  const statut = () => {
    if (!game.state) return;
    const st = game.state, nb = st.badges.filter(Boolean).length;
    ouvrirPanneau('STATUT', `
      <label class="labo-eq"><span>Badges</span><input type="number" name="badges" min="0" max="${BADGES.length}" value="${nb}"></label>
      <div class="labo-badges">${BADGES.map((b, i) => `<label title="${esc(b.name)}"><input type="checkbox" data-b="${i}"${st.badges[i] ? ' checked' : ''}><i style="background:${b.color}"></i></label>`).join('')}</div>
      <label class="labo-eq"><span>Argent</span><input type="number" name="money" value="${st.money}"></label>
      <label class="labo-eq"><span>Histoire</span><select name="histoire"><option value="">(inchangée)</option>${HISTOIRES.map((h) => `<option value="${h.id}">${esc(h.nom)}</option>`).join('')}</select></label>
      <label class="labo-eq"><input type="checkbox" name="libre"${game.libre ? ' checked' : ''}><span>Mode libre</span></label>
      <label class="labo-eq"><input type="checkbox" name="domaine"${st.domaine ? ' checked' : ''}><span>Domaine acheté</span></label>
      <div class="labo-eq"><span>Équipe</span><select name="equipe"><option value="">(inchangée)</option>${EQUIPES.map((e) => `<option value="${e.id}">${esc(e.nom)} · ${esc(e.desc)}</option>`).join('')}</select></div>
      <button type="button" class="labo-btn" data-ok>✔ APPLIQUER</button>`, (P) => {
      P.querySelector('[name=badges]').addEventListener('input', (e) => { const n = +e.target.value || 0; P.querySelectorAll('[data-b]').forEach((c) => { c.checked = +c.dataset.b < n; }); });
      P.querySelector('[data-ok]').onclick = async () => {
        P.querySelectorAll('[data-b]').forEach((c) => { st.badges[+c.dataset.b] = c.checked; });
        st.money = Math.max(0, +P.querySelector('[name=money]').value || 0);
        const h = HISTOIRES.find((x) => x.id === P.querySelector('[name=histoire]').value);
        if (h) { delete st.flags.eclipse; delete st.flags.lugia; Object.assign(st.flags, h.flags); game.setEclipse(); }
        modeLibre(game, P.querySelector('[name=libre]').checked); choix.libre = game.libre;
        const dom = P.querySelector('[name=domaine]').checked;
        if (dom && !st.domaine) st.domaine = domaineTest();
        if (dom) { const { preparerDomaine } = await import('../ui/domaine.js'); preparerDomaine(game); }
        const eq = EQUIPES.find((e) => e.id === P.querySelector('[name=equipe]').value);
        if (eq && eq.team.length) { const team = eq.team.map(([sp, l]) => createMon(sp, l, { ot: st.name, met: 'Labo de test' })); st.party = team.slice(0, 6); game.resetFollower?.(); }
        garde(); fermerPanneau(); game.refreshGates(); game.setMap(game.mapObj.id); game.hud?.update(true);
        ui.toast(`${st.badges.filter(Boolean).length} badge(s) · ${game.libre ? 'mode libre' : 'mode normal'}`);
      };
    });
  };

  /* ---------------- barre d'outils ---------------- */
  const barre = () => {
    const b = el('div', 'labo-bar');
    const hours = [[null, 'Heure réelle'], [9, 'Matin'], [14, 'Jour'], [19, 'Soir'], [23, 'Nuit']];
    let h = 0;
    const st = () => game.state;
    const items = [
      ['📍 Menu (G)', () => lancer()],
      ['🧭 Téléporter (T)', () => teleporter()],
      ['⚙️ Statut', () => statut()],
      ['✏️ Éditeur (B)', () => editeur.toggle()],
      ['🕑 ' + hours[0][1], (btn) => { h = (h + 1) % hours.length; game.hourOverride = hours[h][0]; game.view.setTimeOfDay(game.hour()); btn.textContent = '🕑 ' + hours[h][1]; }],
      ['🌿 Rencontres : oui', (btn) => { game.noEnc = !game.noEnc; btn.textContent = '🌿 Rencontres : ' + (game.noEnc ? 'non' : 'oui'); }],
      ['⚔️ Dresseurs : ' + (game.noTrainers ? 'non' : 'oui'), (btn) => { game.noTrainers = !game.noTrainers; choix.dresseurs = !game.noTrainers; garde(); btn.textContent = '⚔️ Dresseurs : ' + (game.noTrainers ? 'non' : 'oui'); }],
      ['🗺️ Tout dévoiler', () => { const W = world.maps.monde, n = Math.ceil(W.w / 8) * Math.ceil(W.h / 8); st().explored = Array.from({ length: n }, (_, i) => i); game._seen = null; st().mapView = null; ui.toast('Carte entièrement dévoilée'); }],
      ['🗺️ Rien dévoilé', () => { st().explored = []; game._seen = null; st().mapView = null; game.explore(); ui.toast('Exploration remise à zéro'); }],
      ['💖 Soigner', () => { for (const m of st().party) healFull(m); game.hud?.update(true); ui.toast('Équipe soignée'); }],
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
    if (e.code === 'KeyT' && !editeur.on && !game.bv.alive) { e.preventDefault(); teleporter(); }
  });
  void T; void sound; void view;
  await lancer();
}
