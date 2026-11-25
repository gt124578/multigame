// odyssee/moteur/engine/audit.js — audit d'un paquet de cartes, sans jouer : en partant d'un point, on parcourt
// tout ce qu'un joueur peut atteindre (marche, rebords, glace, portes, escaliers, tapis, et selon les capacités
// données : surf, coupe), puis on vérifie que
//   - chaque téléporteur de chaque zone est atteint ;
//   - chaque objet (PNJ, objet au sol, dresseur) a une case voisine atteignable (ou de l'autre côté d'un comptoir) ;
//   - chaque panneau se lit depuis une case atteignable, dans le bon sens ;
//   - depuis toute case atteinte, on peut revenir au départ (aucun piège sans retour).
// Les téléportations écrites dans les scripts (« teleporter ZONE n ») comptent comme des passages depuis leur zone.
// C'est l'équivalent, pour ce moteur, de test-odyssee-coherence : à lancer après chaque retouche de carte.

import { DX, DY, PROPS } from './const.js';
import { Monde, preparer } from './carte.js';
import { testerPas } from './objets.js';

export function auditer(donnees, depart, capacites = { surf: true, coupe: true }) {
  const d = donnees.blocsPrets ? donnees : preparer(donnees);
  const mondes = {};
  const monde = (id) => (mondes[id] ||= new Monde(d, id));
  // objets fixes qui bloquent (les PNJ errants bougent ; un arbre se coupe ; un objet au sol bloque jusqu'à ce qu'on le
  // ramasse : on le compte comme un obstacle, c'est ce qui arrête une glissade à côté de lui)
  const bloqueurs = {};
  const fixes = (M) => (bloqueurs[M.id] ||= M.objets.filter((o) => {
    if (o.type === 'arbre_coupe') return !capacites.coupe;
    const m = o.mouvement || 'fixe';
    return !m.startsWith('errance') && m !== 'route';
  }).map((o) => ({ ...o, occupe(x, y) { return x === o.x && y === o.y; } })));
  const cle = (m, x, y) => `${m}|${x}|${y}`;
  const vus = new Set(), aretes = new Map(), warpsVus = new Set();
  const file = [];
  const ajouter = (de, m, x, y) => {
    const k = cle(m, x, y);
    if (de) { if (!aretes.has(k)) aretes.set(k, new Set()); aretes.get(k).add(de); }
    if (!vus.has(k)) { vus.add(k); file.push([m, x, y]); }
  };
  /** arrivée par un téléporteur : sur sa case, puis le pas de sortie s'il y en a un */
  const arrivee = (w) => {
    const z = d.zones[w.vers], dest = z.warps[w.n ?? 0], mid = d.mondeDeZone[w.vers], M = monde(mid);
    warpsVus.add(`${w.vers}#${w.n ?? 0}`);
    const p = M.props(dest.x, dest.y);
    const sortie = dest.sortie !== undefined ? dest.sortie : (p.warp === 'entree' && M.mb(dest.x, dest.y) === 12 ? 1 : null);
    if (sortie !== null) {
      const r = testerPas(M, { x: dest.x, y: dest.y }, sortie, { objets: fixes(M) });
      if (r.ok) return [mid, r.vers[0], r.vers[1]];
    }
    return [mid, dest.x, dest.y];
  };
  // téléportations des scripts : zone → [{ vers, n }]
  const tps = {};
  for (const [zid, z] of Object.entries(d.zones))
    for (const m of (z.scripts || '').matchAll(/^\s*teleporter\s+(\w+)\s+(\d+)/gm)) (tps[zid] ||= []).push({ vers: m[1], n: +m[2] });
  const tpFaits = new Set();
  const M0 = d.mondeDeZone[depart.zone];
  ajouter(null, M0, depart.x, depart.y);
  while (file.length) {
    const [m, x, y] = file.shift();
    const M = monde(m), ici = cle(m, x, y), pIci = M.props(x, y);
    const w = M.warp(x, y);
    if (w) warpsVus.add(`${w.zone}#${w.indice}`);
    const zid = M.zone(x, y)?.id;
    if (tps[zid] && !tpFaits.has(zid)) { tpFaits.add(zid); for (const t of tps[zid]) ajouter(ici, ...arrivee(t)); }
    for (let dir = 0; dir < 4; dir++) {
      // tapis de sortie
      if (w && pIci.tapis === dir) { ajouter(ici, ...arrivee(w)); continue; }
      const surf = pIci.surf;
      let r = testerPas(M, { x, y }, dir, { surf, objets: fixes(M) });
      if (!r.ok && r.raison === 'eau' && capacites.surf) r = { ok: true, type: 'pas', vers: [x + DX[dir], y + DY[dir]] };
      if (!r.ok) continue;
      let [nx, ny] = r.vers;
      // glace : on glisse jusqu'au premier obstacle
      while (M.props(nx, ny).glisse) {
        const g = testerPas(M, { x: nx, y: ny }, dir, { objets: fixes(M) });
        if (!g.ok || g.type !== 'pas') break;
        [nx, ny] = g.vers;
      }
      const wc = M.warp(nx, ny);
      if (wc && M.props(nx, ny).warp) { warpsVus.add(`${wc.zone}#${wc.indice}`); ajouter(ici, ...arrivee(wc)); continue; }
      ajouter(ici, m, nx, ny);
    }
  }
  // retour au départ : parcours à rebours des arêtes
  const retour = new Set([cle(M0, depart.x, depart.y)]);
  const pile = [cle(M0, depart.x, depart.y)];
  while (pile.length) {
    const k = pile.pop();
    for (const de of aretes.get(k) || []) if (!retour.has(de)) { retour.add(de); pile.push(de); }
  }
  const erreurs = [];
  const sansRetour = [...vus].filter((k) => !retour.has(k));
  if (sansRetour.length) erreurs.push(`${sansRetour.length} cases d'où l'on ne revient pas au départ (ex. ${sansRetour.slice(0, 3).join(', ')})`);
  const atteint = (m, x, y) => vus.has(cle(m, x, y));
  for (const [zid, z] of Object.entries(d.zones)) {
    const mid = d.mondeDeZone[zid];
    if (!mid) continue;
    const M = monde(mid);
    (z.warps || []).forEach((w, i) => { if (!warpsVus.has(`${zid}#${i}`)) erreurs.push(`${zid} : téléporteur ${i} (${w.x},${w.y}) jamais atteint`); });
    for (const o of z.objets || []) {
      let ok = false;
      for (let dir = 0; dir < 4 && !ok; dir++) {
        const ax = o.x + DX[dir], ay = o.y + DY[dir];
        if (atteint(mid, ax, ay)) ok = true;
        else if (PROPS[M.mb(ax, ay)].comptoir && atteint(mid, ax + DX[dir], ay + DY[dir])) ok = true;
      }
      if (!ok && (o.mouvement || '').startsWith('errance')) ok = [0, 1, 2, 3].some((dir) => atteint(mid, o.x + 2 * DX[dir], o.y + 2 * DY[dir]));
      if (!ok) erreurs.push(`${zid} : objet ${o.id} (${o.x},${o.y}) hors d'atteinte`);
    }
    for (const p of z.panneaux || []) {
      const dirs = p.depuis === undefined ? [0, 1, 2, 3] : [p.depuis];
      if (!dirs.some((dir) => atteint(mid, p.x - DX[dir], p.y - DY[dir]))) erreurs.push(`${zid} : panneau (${p.x},${p.y}) illisible`);
    }
  }
  return { erreurs, cases: vus.size, mondes: Object.keys(mondes).length, warps: warpsVus.size };
}
