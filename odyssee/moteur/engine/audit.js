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
    if (o.traversable) return false;
    // un PNJ caché par un drapeau finit par partir (le SBIRE qui garde le puits, celui devant l'arène) : il ne ferme rien
    if (o.drapeau && o.type !== 'objet' && !o.dresseur && !o.boule) return false;
    if (o.type === 'arbre_coupe') return !capacites.coupe;
    if (o.type === 'rocher') return !capacites.eclate;
    // un rocher de FORCE se pousse hors du chemin (approché : on ne suit pas ses positions)
    if (o.type === 'rocher_force') return !capacites.force;
    // un bloc de glace se pousse : approché, on le compte comme absent (et les glissades peuvent s'arrêter devant lui)
    if (o.type === 'bloc_glace') return false;
    const m = o.mouvement || 'fixe';
    return !m.startsWith('errance') && m !== 'route';
  }).map((o) => ({ ...o, occupe(x, y) { return x === o.x && y === o.y; } })));
  const cle = (m, x, y) => `${m}|${x}|${y}`;
  const blocsGlace = {};
  const vus = new Set(), aretes = new Map(), warpsVus = new Set();
  const file = [];
  const ajouter = (de, m, x, y) => {
    const k = cle(m, x, y);
    if (de) { if (!aretes.has(k)) aretes.set(k, new Set()); aretes.get(k).add(de); }
    if (!vus.has(k)) { vus.add(k); file.push([m, x, y]); }
  };
  /** arrivée par un téléporteur : sur sa case, puis le pas de sortie s'il y en a un */
  const arrivee = (w) => {
    // arrivée à des coordonnées de la zone (téléportation de script)
    if (w.ax !== undefined) return [d.mondeDeZone[w.vers], w.ax, w.ay];
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
    for (const m of (z.scripts || '').matchAll(/^\s*teleporter\s+(\w+)\s+(\d+)/gm)) if (d.zones[m[1]]?.warps?.[+m[2]]) (tps[zid] ||= []).push({ vers: m[1], n: +m[2] });
  // téléportations à des coordonnées : écrites en chiffres (teleporter_xy), ou lues dans des variables posées juste
  // avant par le script qui y mène (teleporter_var : les trous de la Route de Glace)
  for (const [zid, z] of Object.entries(d.zones)) {
    const src = z.scripts || '';
    for (const m of src.matchAll(/^\s*teleporter_xy\s+(\w+)\s+(\d+)\s+(\d+)/gm)) if (d.zones[m[1]]) (tps[zid] ||= []).push({ vers: m[1], ax: +m[2], ay: +m[3] });
    if (!/teleporter_var/.test(src)) continue;
    const blocs = {}; let nom = null;
    for (const l of src.split('\n')) { const e = l.match(/^(?:script\s+(\w+)|(\w+):)\s*$/); if (e) nom = e[1] || e[2]; if (nom) (blocs[nom] ||= []).push(l.trim()); }
    const cibles = {};
    for (const [n, ls] of Object.entries(blocs)) for (const l of ls) { const m = l.match(/^teleporter_var\s+(\w+)\s+(\w+)\s+(\w+)/); if (m) cibles[n] = m.slice(1); }
    for (const ls of Object.values(blocs)) {
      const v = {};
      for (const l of ls) {
        let m;
        if ((m = l.match(/^var\s+(\w+)\s+(-?\d+)/))) v[m[1]] = +m[2];
        else if ((m = l.match(/^aller\s+(\w+)/)) && cibles[m[1]]) {
          const [vers, vx, vy] = cibles[m[1]], x = /^\d+$/.test(vx) ? +vx : v[vx], y = /^\d+$/.test(vy) ? +vy : v[vy];
          if (d.zones[vers] && x !== undefined && y !== undefined) (tps[zid] ||= []).push({ vers, ax: x, ay: y });
        }
      }
    }
  }
  const tpFaits = new Set();
  // chariots sur rails : de la case où l'on monte à celle où l'on descend, pour chaque position des aiguillages
  // (plus large que le jeu, où il faut aussi qu'un chariot attende : le test de l'arène rejoue l'énigme exacte)
  const rails = {};
  for (const [zid, z] of Object.entries(d.zones)) {
    const r = z.rails;
    if (!r) continue;
    const t = rails[zid] = new Map();
    r.stations.forEach(([sx, sy], s) => {
      const inv = r.inverses.includes(s);
      const cleT = inv ? `${sx},${sy}` : `${sx},${sy + 1}`;
      for (const route of r.routes[s] || []) {
        if (!route) continue;
        const fin = inv ? route.noeuds[0] : route.noeuds[route.noeuds.length - 1];
        if (!t.has(cleT)) t.set(cleT, []);
        t.get(cleT).push([fin[0], fin[1] + (inv ? 1 : 0)]);
      }
    });
  }
  const M0 = d.mondeDeZone[depart.zone];
  ajouter(null, M0, depart.x, depart.y);
  while (file.length) {
    const [m, x, y] = file.shift();
    const M = monde(m), ici = cle(m, x, y), pIci = M.props(x, y);
    const w = M.warp(x, y);
    if (w) warpsVus.add(`${w.zone}#${w.indice}`);
    const zid = M.zone(x, y)?.id;
    if (tps[zid] && !tpFaits.has(zid)) { tpFaits.add(zid); for (const t of tps[zid]) ajouter(ici, ...arrivee(t)); }
    for (const [ax, ay] of rails[zid]?.get(`${x},${y}`) || []) ajouter(ici, m, ax, ay);
    for (let dir = 0; dir < 4; dir++) {
      // tapis de sortie
      if (w && pIci.tapis === dir) { if (d.zones[w.vers]?.warps?.[w.n ?? 0]) ajouter(ici, ...arrivee(w)); continue; }
      const surf = pIci.surf;
      let r = testerPas(M, { x, y }, dir, { surf, objets: fixes(M) });
      if (!r.ok && r.raison === 'eau' && capacites.surf) r = { ok: true, type: 'pas', vers: [x + DX[dir], y + DY[dir]] };
      // cascade, tourbillon, paroi : franchis d'un trait (comme Terrain.franchir)
      if (!r.ok && r.raison === 'capacite') {
        let cx = x + DX[dir], cy = y + DY[dir];
        const pc = M.props(cx, cy), cap = pc.capacite;
        if (capacites[cap] && (!pc.surf || pIci.surf || capacites.surf)) {
          let n = 0;
          while (M.dedans(cx, cy) && M.props(cx, cy).capacite === cap && n < 40) { cx += DX[dir]; cy += DY[dir]; n++; }
          if (M.dedans(cx, cy) && !M.bloquee(cx, cy)) r = { ok: true, type: 'pas', vers: [cx, cy] };
        }
      }
      if (!r.ok) continue;
      let [nx, ny] = r.vers;
      // glace : on glisse jusqu'au premier obstacle
      const blocs = (blocsGlace[M.id] ||= new Set(M.objets.filter((o) => o.type === 'bloc_glace' || o.type === 'rocher_force' || o.drapeau).map((o) => `${o.x},${o.y}`)));
      while (M.props(nx, ny).glisse) {
        const g = testerPas(M, { x: nx, y: ny }, dir, { objets: fixes(M) });
        if (!g.ok || g.type !== 'pas') break;
        // devant un bloc de glace (à sa place d'origine), la glissade peut s'arrêter aussi
        if (blocs.has(`${g.vers[0]},${g.vers[1]}`)) ajouter(ici, m, nx, ny);
        [nx, ny] = g.vers;
      }
      const wc = M.warp(nx, ny);
      if (wc && M.props(nx, ny).warp) {
        warpsVus.add(`${wc.zone}#${wc.indice}`);
        // un téléporteur du jeu qui ne mène nulle part (ou vers une carte absente) : une case comme une autre
        if (!wc.vers || !d.zones[wc.vers]?.warps?.[wc.n ?? 0]) continue;
        ajouter(ici, ...arrivee(wc)); continue;
      }
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
      if (o.traversable) continue;
      // un acteur de scène (sans script, ou caché par un drapeau tant que la scène n'a pas lieu) : le script l'amène
      if (!o.script && !o.dresseur && o.type !== 'objet') continue;
      if (o.drapeau && o.type !== 'objet' && !o.dresseur && o.drapeau !== 'FLAG_NOTHING' && /^FLAG_HIDE/.test(o.drapeau)) continue;
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
  // les zones où l'on a posé le pied (pour un jeu entier, où tout n'est pas ouvert depuis le départ)
  const zones = new Set();
  for (const k of vus) { const [m, x, y] = k.split('|'); const z = monde(m).zone(+x, +y)?.id; if (z) zones.add(z); }
  return { erreurs, cases: vus.size, mondes: Object.keys(mondes).length, warps: warpsVus.size, zones };
}
