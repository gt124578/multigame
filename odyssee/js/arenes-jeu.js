// odyssee/js/arenes-jeu.js — les arènes dessinées dans un plan (world/arenes-plans.js) côté jeu : registres gardés dans la
// sauvegarde (drapeau « R:<carte> »), cases qui réagissent quand on marche dessus (dalles, trous, canons, dalles qui se
// fendent), interrupteurs, leviers et miroirs, rochers qui comblent les fosses, rayon qui barre la route, pupitre qui
// remet l'arène à zéro. Les règles sont celles du solveur (world/arenes-plan.js) : ce qui se résout là se résout ici.
import { T, DIRS } from './world/tiles.js';
import { appliquerEtat, agir, tirCanon, rayons, pousserTourniquet } from './world/arenes-plan.js';
import { wait } from './ui/ui.js';

const k2 = (x, y) => x + ',' + y;

/** registres de l'arène (sauvegardés), ou ceux du début */
export function regsArene(g, m = g.mapObj) {
  const R = g.state.flags['R:' + m.id];
  return Array.isArray(R) && R.length === m.regs0.length ? R.slice() : m.regs0.slice();
}
/** à l'entrée sur la carte : portes, tapis, miroirs et rayons dans l'état sauvegardé (avant que la vue ne dessine) */
export function preparerArene(g, m) {
  if (!m.etat) return;
  // sauvegarde d'avant les arènes dessinées (ou d'une autre version du plan) : rochers poussés et registres oubliés
  const st = g.state, v = 'PV:' + m.id, ver = m.planArene.version || 1;
  if (st.flags[v] !== ver) {
    if (st.tiles?.[m.id]) { delete st.tiles[m.id]; g.applyTiles(m); }
    delete st.flags['R:' + m.id]; delete st.flags['B:' + m.id];
    st.flags[v] = ver;
  }
  appliquerEtat(m, regsArene(g, m));
  // dalles fendues : rien ne reste fendu d'une visite à l'autre
  for (const d of m.deco) if (d.k === 'fragile') d.f = 0;
  m._fend = null;
}
/** nouveaux registres : la carte change, les cases touchées sont redessinées */
export function changerRegs(g, R2) {
  const m = g.mapObj, p = g.player;
  g.state.flags['R:' + m.id] = R2.slice();
  appliquerEtat(m, R2, [p.x, p.y]);
  // l'arène est petite : on la redessine toute (murs révélés, lanternes allumées, rayon…)
  for (let y = 0; y < m.h; y += 4) for (let x = 0; x < m.w; x += 4) g.view.rebuildAt(x, y);
  if (m.planArene?.noir) g.updateOverlay?.();
}

/** le joueur vient d'arriver sur une case (pas, glissade) ; renvoie true s'il a été déplacé (il faut rejouer l'arrivée) */
export async function surCaseArene(g, o, slid) {
  const m = g.mapObj, p = g.player;
  if (!m.etat || !o) return false;
  if (o.type === 'reg' && !o.actionne) {
    const R = regsArene(g), R2 = agir(o.a, R, m);
    if (R2.join() === R.join()) return false;
    g.sound.sfx(o.son || 'select'); g.view.shake = 0.04;
    changerRegs(g, R2);
    if (o.msg) await g.ui.say(o.msg, { auto: 1300 });
    return false;
  }
  if (o.type === 'chute') {
    g.sound.sfx('ledge'); g.view.shake = 0.1;
    await g.ui.fade(true, 220);
    p.x = o.to[0]; p.y = o.to[1]; p.move = null; p.dir = 'down';
    g.view.update(0, p.x, p.y); g.resetFollower?.();
    await g.view.solPret?.();
    await g.ui.fade(false, 220);
    if (o.msg) await g.ui.say(o.msg);
    return true;
  }
  if (o.type === 'canon' && !slid) {
    const R = regsArene(g), t = tirCanon(o, R);
    if (!t) { g.sound.sfx('bump'); await g.ui.say('Le canon à vent vise le vide… Il ne tire pas.', { auto: 1400 }); return false; }
    g.sound.sfx('whistle'); g.view.shake = 0.12;
    changerRegs(g, t.R);
    p.dir = t.dir;
    p.move = { fx: p.x, fy: p.y, tx: t.vers[0], ty: t.vers[1], t: 0, dur: 0.75, jump: true, scripted: true, haut: 2.5 };
    while (p.move) await wait(16);
    g.sound.sfx('ledge'); g.view.shake = 0.08;
    return true;
  }
  if (o.type === 'fragile') return fendre(g, o);
  return false;
}

/** dalle d'argile : la première fois elle se fend, la seconde elle cède ; toutes fendues, la salle est réussie */
async function fendre(g, o) {
  const m = g.mapObj, p = g.player, f = m.etat.fragiles[o.salle], R = regsArene(g);
  if (!f || R[f.r]) return false;   // salle réussie : ses dalles tiennent
  const k = k2(p.x, p.y), fend = (m._fend ||= new Set());
  const deco = m.deco.find((d) => d.k === 'fragile' && d.x === p.x && d.y === p.y);
  if (!fend.has(k)) {
    fend.add(k); if (deco) deco.f = 1; g.view.rebuildAt(p.x, p.y);
    g.sound.sfx('hitweak'); g.view.shake = 0.03;
    if (fend.size === f.cases.length) {
      const R2 = R.slice(); R2[f.r] = 1; changerRegs(g, R2);
      g.sound.sfx('door'); g.view.shake = 0.1;
      await g.ui.say('Crac… crac… Toutes les dalles sont fendues ! Le sol se raffermit, et un passage s\'ouvre plus loin.');
    }
    return false;
  }
  // déjà fendue : elle cède
  g.sound.sfx('hitstrong'); g.view.shake = 0.15;
  await g.ui.fade(true, 220);
  for (const [x, y] of f.cases) { const d = m.deco.find((q) => q.k === 'fragile' && q.x === x && q.y === y); if (d) d.f = 0; g.view.rebuildAt(x, y); }
  m._fend = null;
  const [rx, ry] = f.retour || [m.exitX, m.exitY - 1];
  p.x = rx; p.y = ry; p.move = null; g.view.update(0, p.x, p.y); g.resetFollower?.();
  await g.view.solPret?.();
  await g.ui.fade(false, 220);
  await g.ui.say('La dalle fendue a cédé sous ton poids ! Tu as glissé hors de la salle… Les dalles se sont reformées : recommence.');
  return true;
}

/** interagir avec un interrupteur (levier, statue, vitrine, miroir, lanterne…) ou le pupitre de remise */
export async function actionnerArene(g, o) {
  const m = g.mapObj, p = g.player;
  if (o.type === 'remise') {
    if (!(await g.ui.yesNo('Un pupitre de commande. Remettre l\'arène comme au début ? (tu reviendras à l\'entrée)'))) return;
    await remettreArene(g, true);
    return;
  }
  const R = regsArene(g), R2 = agir(o.a, R, m);
  if (R2.join() === R.join()) { await g.ui.say(o.dejaMsg || 'Rien ne se passe.'); return; }
  // arène Fée : le rayon ne doit pas traverser le joueur
  if (m.planArene?.rayonBloque && rayons(m, R2).some((r) => r.cases.some(([x, y]) => x === p.x && y === p.y))) {
    g.sound.sfx('bump');
    await g.ui.say('Le miroir pivoterait le rayon droit sur toi ! Écarte-toi d\'abord du chemin de la lumière.');
    return;
  }
  g.sound.sfx(o.son || 'select'); g.view.shake = 0.05;
  changerRegs(g, R2);
  if (o.msg) await g.ui.say(o.msg);
}

/** tout remettre comme au début : registres, rochers et fosses, dalles fendues ; à l'entrée si a l'entree */
export async function remettreArene(g, aLEntree = false) {
  const m = g.mapObj, p = g.player, st = g.state;
  if (aLEntree) await g.ui.fade(true, 200);
  delete st.flags['R:' + m.id];
  delete st.tiles?.[m.id];
  g.applyTiles(m);
  preparerArene(g, m);
  if (aLEntree) {
    p.x = m.exitX; p.y = m.exitY - 1; p.dir = 'up'; p.move = null;
    g.view.setMap(m); g.view.update(0, p.x, p.y); g.resetFollower?.();
    await g.view.solPret?.();
    await g.ui.fade(false, 200);
    g.sound.sfx('door');
  }
}

/** un pas vers (tx, ty) dans une arène dessinée : rayon qui barre, bras de tourniquet à pousser. Renvoie true si géré */
export function pasArene(g, d, tx, ty) {
  const m = g.mapObj, p = g.player;
  if (!m.etat) return false;
  if (m.planArene?.rayonBloque && m.rayon?.has(k2(tx, ty))) {
    p.walking = false;
    if (p.bumpT <= 0) { g.sound.sfx('bump'); p.bumpT = 0.4; }
    if (!g._rayonDit) { g._rayonDit = true; g.ui.say('Le rayon de lumière est trop vif : impossible de le traverser !', { auto: 1500 }); }
    return true;
  }
  if (m.etat.armes.has(k2(tx, ty)) && m.get(tx, ty) === T.BLOCK) {
    const R2 = pousserTourniquet(m, regsArene(g), p.x, p.y, d, (x, y) => g.occupied(x, y));
    if (!R2) return false;
    g.sound.sfx('door'); changerRegs(g, R2);
    p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: 0.22 }; p.walking = true;
    return true;
  }
  return false;
}

/** un rocher poussé dans une fosse la comble (renvoie true si c'est le cas) */
export function rocherDansFosse(g, tx, ty, bx, by) {
  const m = g.mapObj;
  if (!m.etat?.fosses?.some(([x, y]) => x === bx && y === by) || m.get(bx, by) !== T.BLOCK) return false;
  g.setTile(tx, ty, T.FLOOR); g.setTile(bx, by, T.FLOOR);
  g.sound.sfx('hitstrong'); g.view.shake = 0.14;
  g.ui.say('Le rocher bascule dans la fosse et la comble. On peut passer !', { auto: 1500 });
  return true;
}
export { DIRS };
