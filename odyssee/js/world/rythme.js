// odyssee/js/world/rythme.js — le rythme des grandes routes, façon HeartGold / SoulSilver, posé une fois toutes les routes
// taillées (après les écrans de verdure, avant les barrières) :
//   - raccourcis à sens unique : là où deux morceaux d'une même route se frôlent derrière une lisière, une trouée dans
//     les arbres et un rebord à sauter ramènent d'un morceau à l'autre (on saute vers le bas ou sur le côté, jamais dans
//     l'autre sens : pour revenir, il faut refaire le chemin) ;
//   - rebords en travers des prairies, le long du sentier : on les saute en descendant, on les contourne en montant ;
//   - objets cachés : rien ne se voit, on les trouve en fouillant le bout d'une impasse, un rocher ou une souche
//     (identifiants fixes `<route>:cN`, ramassés comme les objets posés : drapeau `I:<id>`) ;
//   - panneaux aux deux bouts de chaque route qui n'en a pas.
// Chaque rebord est vérifié : tout ce qu'on atteignait et d'où l'on revenait reste atteignable et l'on en revient (pas
// de piège), et un raccourci n'ouvre rien qu'on n'atteignait déjà à pied (il ne fait que gagner du temps).
import { T, walkable } from './tiles.js';
import { along, caseLibre } from './mapgen.js';
import { bruit } from './quartiers.js';
import { lotsPour, rangRoute, adapter } from './bareme.js';
import { PRENOMS } from './voix.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FORET = (t) => t === T.TREE || t === T.PINE;
const HERBE = (t) => t === T.GRASS || t === T.TALL || t === T.FLOWER || t === T.DARKTALL;

/** le graphe des pas du joueur dans un rectangle (sans capacité : Coupe, Éclate-Roc, Surf et Force ferment le passage),
 *  PNJ et objets posés comptant comme des murs ; renvoie { avant(i) : ce qu'on atteint depuis i, arriere(i) : d'où l'on
 *  atteint i } en indices du rectangle */
function graphe(W, box, occ) {
  const [x0, y0, x1, y1] = box, w = x1 - x0 + 1, h = y1 - y0 + 1, n = w * h;
  const at = (x, y) => (y - y0) * w + (x - x0);
  // pour chaque case du rectangle : praticable et libre (1), rebord (2 : vers le bas, 3 : l'est, 4 : l'ouest), escalier (bit 8)
  const c = new Uint8Array(n), hg = new Int8Array(n);
  const maj = (x, y) => {
    const i = at(x, y), t = W.get(x, y); hg[i] = W.height(x, y); c[i] = 0;
    if (t === T.LEDGE) c[i] = 2; else if (t === T.LEDGE_E) c[i] = 3; else if (t === T.LEDGE_W) c[i] = 4;
    else if (walkable(t) && !occ.has(x + ',' + y)) c[i] = t === T.STAIRS ? 9 : 1;
  };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) maj(x, y);
  const lib = (i) => (c[i] & 7) === 1;
  const pas = (i, j) => ((c[i] | c[j]) & 8 ? Math.abs(hg[i] - hg[j]) <= 1 : hg[i] === hg[j]);
  const D = [[1, 0, 3], [-1, 0, 4], [0, 1, 2], [0, -1, 0]];
  const q = new Int32Array(n);
  const parcours = (s, sens) => {
    const vu = new Uint8Array(n); let lo = 0, hi = 0; q[hi++] = s; vu[s] = 1;
    while (lo < hi) {
      const i = q[lo++], x = i % w, y = (i - x) / w;
      for (const [dx, dy, led] of D) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx, cj = c[j] & 7;
        if (sens > 0) {   // ce qu'on atteint depuis la case
          if (cj >= 2) { const ax = nx + dx, ay = ny + dy, k = ay * w + ax; if (cj === led && ax >= 0 && ay >= 0 && ax < w && ay < h && lib(k) && !vu[k]) { vu[k] = 1; q[hi++] = k; } continue; }
          if (cj === 1 && !vu[j] && pas(i, j)) { vu[j] = 1; q[hi++] = j; }
        } else {          // d'où l'on atteint la case : un pas ordinaire, ou un saut par-dessus un rebord
          if (cj === 1 && !vu[j] && pas(j, i)) { vu[j] = 1; q[hi++] = j; }
          const opp = dx === 1 ? 4 : dx === -1 ? 3 : dy === -1 ? 2 : 0;
          if (cj >= 2 && cj === opp) { const ax = nx + dx, ay = ny + dy, k = ay * w + ax; if (ax >= 0 && ay >= 0 && ax < w && ay < h && lib(k) && !vu[k]) { vu[k] = 1; q[hi++] = k; } }
        }
      }
    }
    return vu;
  };
  return { n, at, w, maj, avant: (i) => parcours(i, 1), arriere: (i) => parcours(i, -1) };
}

/**
 * Pose rebords, raccourcis, objets cachés et panneaux sur les grandes routes. routes : la liste de buildWorld (pts.res :
 * le résultat de grandeRoute). Renvoie le bilan { raccourcis, rebords, caches, panneaux }.
 */
export function rythme(W, routes, ctx = {}) {
  const bilan = { raccourcis: [], rebords: 0, lignes: [], caches: [], panneaux: 0, dresseurs: 0 };
  const occ = new Set([...W.npcs.map((q) => q.x + ',' + q.y), ...W.items.map((q) => q.x + ',' + q.y), ...W.signs.keys(), ...W.warps.keys(), ...W.objects.keys()]);
  for (const d of W.deco) if (d.x != null) occ.add(d.x + ',' + d.y);
  const ids = new Set();
  for (const R of routes) {
    const res = R.pts?.res; if (!res?.cells) continue;
    const fait = routeRythme(W, R, res, occ, ids, ctx);
    bilan.raccourcis.push(...fait.raccourcis); bilan.rebords += fait.rebords; bilan.lignes.push(...fait.lignes); bilan.caches.push(...fait.caches); bilan.panneaux += fait.panneaux; bilan.dresseurs += fait.dresseurs; bilan.ilots = (bilan.ilots || 0) + (fait.ilots || 0); bilan.coupes = (bilan.coupes || 0) + (fait.coupes || 0);
  }
  return bilan;
}

function routeRythme(W, R, res, occ, ids, ctx) {
  const out = { raccourcis: [], rebords: 0, lignes: [], caches: [], panneaux: 0, dresseurs: 0 };
  const pts = res.pts, cells = res.cells;
  // le rectangle de travail : le territoire de la route et une marge
  let box = res.rect;
  if (!box) { let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9; for (const k of cells) { const [x, y] = k.split(',').map(Number); bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); } box = [bx0, by0, bx1, by1]; }
  box = [Math.max(1, box[0] - 6), Math.max(1, box[1] - 6), Math.min(W.w - 2, box[2] + 6), Math.min(W.h - 2, box[3] + 6)];
  const bw = box[2] - box[0] + 1, moi = new Int8Array(bw * (box[3] - box[1] + 1)).fill(-1);
  // la zone de la route : on ne touche qu'à ce qui est à elle (pas aux villes, aux lieux voisins ni à la mer)
  const aMoi = (x, y) => {
    if (x < box[0] || y < box[1] || x > box[2] || y > box[3]) return false;
    const i = (y - box[1]) * bw + (x - box[0]);
    if (moi[i] < 0) { const z = W.zoneAt(x, y); moi[i] = z && z.route && !z.town && !z.sea && cells.has(x + ',' + y) ? 1 : 0; }
    return moi[i] === 1;
  };
  // position le long du tracé (0..1) des cases du sentier : échantillons tous les demi-pas
  const ech = new Map(), dirs = [], total = res.total || 1, NS = Math.max(2, Math.ceil(total * 2));
  { // (les points du tracé parcourus une seule fois)
    const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const tot = L[L.length - 1] || 1; let j = 1;
    for (let i = 0; i <= NS; i++) {
      const d = i / NS * tot; while (j < pts.length - 1 && L[j] < d) j++;
      const u = (d - L[j - 1]) / ((L[j] - L[j - 1]) || 1), x = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, y = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u;
      const k = Math.round(x) + ',' + Math.round(y); if (!ech.has(k)) ech.set(k, i / NS);
      dirs.push([(pts[j][0] - pts[j - 1][0]) / ((L[j] - L[j - 1]) || 1), (pts[j][1] - pts[j - 1][1]) / ((L[j] - L[j - 1]) || 1)]);
    }
  }
  const sDe = (x, y) => { let best = -1, bd = 9; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const s = ech.get((x + i) + ',' + (y + j)); if (s != null && i * i + j * j < bd) { bd = i * i + j * j; best = s; } } return best; };
  const sentier = [];
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) if (W.get(x, y) === T.PATH && aMoi(x, y)) { const s = sDe(x, y); if (s >= 0) sentier.push([x, y, s]); }
  if (sentier.length < 20) return out;
  const depart = sentier[Math.floor(sentier.length / 2)];
  // l'état des lieux avant : ce qu'on atteint depuis le sentier, et d'où l'on revient
  const G = graphe(W, box, occ), i0 = G.at(depart[0], depart[1]);
  const etat = () => ({ G, av: G.avant(i0), ar: G.arriere(i0) });
  let E = etat();
  const sur = (E2, changees) => {
    // rien de perdu (hors des cases changées), et pas de nouveau piège (une case atteinte d'où l'on ne revient pas)
    const ch = new Set(changees.map(([x, y]) => E.G.at(x, y)));
    for (let i = 0; i < E.G.n; i++) {
      if (E.av[i] && E.ar[i] && !(E2.av[i] && E2.ar[i]) && !ch.has(i)) return false;
      if (E2.av[i] && !E2.ar[i] && !(E.av[i] && !E.ar[i])) return false;
    }
    return true;
  };
  const essai = (poser) => { const avant = poser(); for (const [x, y] of avant) G.maj(x, y); const E2 = etat(); if (sur(E2, avant)) { E = E2; return true; } for (const [x, y, t] of avant) { W.set(x, y, t); G.maj(x, y); } return false; };
  const libreSol = (x, y, h) => !occ.has(x + ',' + y) && W.height(x, y) === h && aMoi(x, y);

  /* 1. raccourcis à travers la lisière : du sentier, droit vers le sud, l'est ou l'ouest, à travers une bande d'arbres,
        jusqu'à un morceau du sentier bien plus loin le long de la route */
  const cands = [];
  for (let si = 0; si < sentier.length; si += 2) {
    const [x, y, s] = sentier[si], h = W.height(x, y);
    for (const [dx, dy, led] of [[0, 1, T.LEDGE], [1, 0, T.LEDGE_E], [-1, 0, T.LEDGE_W]]) {
      const px = -dy, py = dx;   // le travers du couloir (3 cases de large)
      let k = 1, arbres = 0, phase = 0, fin = null, rebord = -1;
      for (; k <= 40; k++) {
        const cx = x + dx * k, cy = y + dy * k, t = W.get(cx, cy);
        if (!aMoi(cx, cy) && !FORET(t)) break;
        if (W.height(cx, cy) !== h) break;
        if (phase === 0) {   // dans la bande du morceau de départ
          if (FORET(t)) { phase = 1; }
          else if (!HERBE(t) && t !== T.PATH) break;
        }
        if (phase === 1) {   // la lisière : trois cases d'arbres de front
          let foret = true, sol = true;
          for (let o = -1; o <= 1; o++) { const a = cx + px * o, b = cy + py * o, q = W.get(a, b); if (!FORET(q) || W.height(a, b) !== h || occ.has(a + ',' + b)) foret = false; if (!walkable(q) || !libreSol(a, b, h)) sol = false; }
          if (foret) { arbres++; continue; }
          if (arbres < 2 || !sol) break;
          phase = 2; rebord = k - 1;
        }
        if (phase === 2) {   // la bande du morceau d'arrivée, jusqu'à son sentier
          if (!walkable(t) || W.get(cx, cy) === T.STAIRS || occ.has(cx + ',' + cy)) break;
          if (t === T.PATH && aMoi(cx, cy)) { const s2 = sDe(cx, cy); if (s2 >= 0) fin = [cx, cy, s2]; break; }
        }
      }
      if (!fin || arbres > 9) continue;
      const gain = Math.abs(fin[2] - s) * total - k;   // le chemin qu'on s'épargne
      if (gain < 45) continue;
      cands.push({ x, y, s, dx, dy, px, py, led, rebord, arbres, fin, gain, k });
    }
  }
  cands.sort((a, b) => b.gain - a.gain || a.k - b.k || a.y - b.y || a.x - b.x);
  const maxR = total > 520 ? 2 : 1, pris = [];
  for (const c of cands) {
    if (pris.length >= maxR) break;
    if (pris.some((p) => Math.abs(p.s - c.s) < 0.2 || Math.abs(p.fin[2] - c.fin[2]) < 0.2)) continue;
    // le raccourci n'ouvre rien : le point d'arrivée s'atteint déjà à pied depuis le départ
    if (!E.av[E.G.at(c.fin[0], c.fin[1])]) continue;
    const ok = essai(() => {
      const avant = [];
      for (let k = 1; k <= c.rebord; k++) for (const o of [-1, 0, 1]) {
        const a = c.x + c.dx * k + c.px * o, b = c.y + c.dy * k + c.py * o, t = W.get(a, b);
        if (!FORET(t)) continue;
        avant.push([a, b, t]); W.set(a, b, k === c.rebord ? c.led : T.GRASS); cells.add(a + ',' + b);
      }
      return avant;
    });
    if (ok) { pris.push(c); out.raccourcis.push({ route: R.id, x: c.x + c.dx * c.rebord, y: c.y + c.dy * c.rebord, gain: Math.round(c.gain) }); }
  }

  /* 2. rebords en travers des prairies : là où le sentier file du nord au sud, une ligne de rebord part de son bord et
        barre la prairie jusqu'aux arbres */
  const nb = Math.max(1, Math.round(total / 160));
  const lignes = [];
  for (let i = 0; i < sentier.length; i++) {
    const [x, y, s] = sentier[i]; if (s < 0.06 || s > 0.94) continue;
    if (Math.abs(dirs[Math.round(s * NS)][1]) < 0.8) continue;   // le sentier va du nord au sud
    for (const side of [1, -1]) {
      if (W.get(x + side, y) === T.PATH) continue;   // depuis le bord du sentier
      const h = W.height(x, y), L = [];
      let k = 1, bout = false;
      for (; k <= 22; k++) {
        const cx = x + side * k, t = W.get(cx, y);
        if (FORET(t) || t === T.ROCK || t === T.WATER || t === T.CLIFF || t === T.CAVEWALL) { bout = true; break; }
        if (!HERBE(t) || !libreSol(cx, y, h) || !aMoi(cx, y)) break;
        // au-dessus et au-dessous, de quoi se tenir (on saute d'une case d'herbe à une autre)
        if (!walkable(W.get(cx, y - 1)) || !walkable(W.get(cx, y + 1)) || W.height(cx, y - 1) !== h || W.height(cx, y + 1) !== h || occ.has(cx + ',' + (y + 1))) break;
        L.push([cx, y]);
      }
      if (!bout || L.length < 4) continue;
      lignes.push({ x, y, s, side, L, note: L.length + 6 * bruit(x, y, 5, 977) });
    }
  }
  lignes.sort((a, b) => b.note - a.note || a.y - b.y || a.x - b.x);
  const poses = [];
  for (const l of lignes) {
    if (poses.length >= nb) break;
    if (poses.some((p) => Math.abs(p.s - l.s) < 0.12)) continue;
    if (l.L.some(([a, b]) => W.get(a, b - 1) === T.LEDGE || W.get(a, b + 1) === T.LEDGE)) continue;
    const ok = essai(() => { const avant = []; for (const [a, b] of l.L) { avant.push([a, b, W.get(a, b)]); W.set(a, b, T.LEDGE); } return avant; });
    if (ok) { poses.push(l); out.rebords++; out.lignes.push([R.id, l.L[0][0], l.L[0][1], l.L.length * l.side]); }
  }

  /* 2 bis. des dresseurs aux passages étroits, comme sur les routes de HeartGold : là où la prairie se resserre autour du
        sentier, un dresseur se tient sur le côté et son regard barre le passage (identifiants `<route>:eN`) ; la
        densité vise un dresseur pour 16 cases de sentier (22 sur les routes du début), cinq de plus au plus */
  if (ctx.trainerNpc && !['r1', 'r9', 'r9b'].includes(R.id)) {
    const rang = rangRoute(R.id), pas = rang <= 1 ? 22 : 16;
    const deja = W.npcs.filter((n) => n.trainer && aMoi(n.x, n.y));
    const ajout = Math.max(0, Math.min(5, Math.round(total / pas) - deja.length));
    const enc = W.zoneAt(depart[0], depart[1])?.enc || [];
    if (ajout && enc.length) {
      const niv = [Math.min(...enc.map((e) => e[1])), Math.max(...enc.map((e) => e[2]))];
      const sDeN = deja.map((n) => sDe(...plusProche(sentier, n.x, n.y)));
      // largeur du praticable de part et d'autre du sentier (perpendiculaire au tracé)
      const passages = [];
      for (let i = 0; i < sentier.length; i += 3) {
        const [x, y, s] = sentier[i]; if (s < 0.08 || s > 0.92) continue;
        const [dx, dy] = dirs[Math.round(s * NS)] || [0, 1], nx = Math.round(-dy), ny = Math.round(dx);
        if (!nx && !ny) continue;
        const cote = (sg) => { let k = 1; while (k < 14 && walkable(W.get(x + nx * sg * k, y + ny * sg * k)) && W.height(x + nx * sg * k, y + ny * sg * k) === W.height(x, y)) k++; return k - 1; };
        const a = cote(1), b = cote(-1), larg = a + b + 1;
        if (larg < 5 || larg > 12) continue;
        passages.push({ x, y, s, nx, ny, a, b, larg, note: larg + 3 * bruit(x, y, 4, 4411) });
      }
      passages.sort((p, q) => p.note - q.note || p.y - q.y || p.x - q.x);
      const CLASSES = ['Gamin', 'Fillette', 'Randonneuse', 'Montagnard', 'Topdresseur', 'Topdresseuse', 'Insectomane', 'Karatéka'];
      const pris = [...sDeN]; let k = 0;
      for (const p of passages) {
        if (k >= ajout) break;
        if (pris.some((q) => Math.abs(q - p.s) < 0.7 / (deja.length + ajout + 1))) continue;
        // sur le côté le plus large, à deux cases du sentier, le regard tourné vers l'autre bord
        const sg = p.a >= p.b ? 1 : -1, d = Math.min(3, sg > 0 ? p.a : p.b);
        if (d < 2) continue;
        const x = p.x + p.nx * sg * d, y = p.y + p.ny * sg * d, t = W.get(x, y);
        if (!(t === T.GRASS || t === T.FLOWER || t === T.TALL || t === T.SAND) || !aMoi(x, y) || occ.has(x + ',' + y)) continue;
        // personne, aucune porte ni aucun panneau à cinq cases ; la case ne bouche rien (ses huit voisines sont du sol)
        let gene = false; for (let j = -5; j <= 5 && !gene; j++) for (let i = -5; i <= 5; i++) { const q = W.get(x + i, y + j); if (q === T.SIGN || q === T.DOOR || (Math.abs(i) <= 1 && Math.abs(j) <= 1 && (i || j) && !walkable(q)) || occ.has((x + i) + ',' + (y + j))) { gene = true; break; } }
        if (gene) continue;
        const vx = -p.nx * sg, vy = -p.ny * sg, dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
        const h = (q) => bruit(x * 3 + q, y * 5 - q, 1.37, 4412 + q);
        const n = 1 + Math.floor(h(1) * 3), team = [];
        for (let i = 0; i < n; i++) { const e = enc[Math.floor(h(2 + i) * enc.length) % enc.length]; team.push([e[0], Math.max(2, Math.min(100, niv[1] - 1 + Math.floor(h(9 + i) * 3) - (n - 1)))]); }
        const id = `${R.id}:e${k}`;
        // le regard traverse le sentier jusqu'à l'autre bord de la prairie
        ctx.trainerNpc(W, x, y, dir, CLASSES[Math.floor(h(20) * CLASSES.length) % CLASSES.length], PRENOMS[Math.floor(h(21) * PRENOMS.length) % PRENOMS.length], team, { id, sight: Math.min(6, d + (sg > 0 ? p.b : p.a) + 1) });
        occ.add(x + ',' + y); pris.push(p.s); k++; out.dresseurs++;
      }
    }
  }

  /* 3. objets cachés : au bout des impasses (devant l'arbre qui la ferme), dans un rocher, loin du sentier ; rien ne
        les montre, il faut fouiller */
  const nc = Math.max(1, Math.round(total / 170)), dist = distanceAuSentier(W, box, sentier);
  const caches = [];
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    // une case à fouiller : rocher ou arbre, touchée par une case atteinte (et dont on revient)
    const t = W.get(x, y);
    if (!(t === T.ROCK || FORET(t))) continue;
    let vers = null;
    for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (a < box[0] || b < box[1] || a > box[2] || b > box[3]) continue; const i = E.G.at(a, b); if (E.av[i] && E.ar[i] && W.get(a, b) !== T.PATH && aMoi(a, b)) { vers = [a, b]; break; } }
    if (!vers || occ.has(x + ',' + y)) continue;
    const d = dist(vers[0], vers[1]); if (d < 4) continue;
    // une impasse : la case d'où l'on fouille n'a qu'une autre case praticable autour d'elle
    const ouverts = N4.filter(([dx, dy]) => walkable(W.get(vers[0] + dx, vers[1] + dy))).length;
    const note = (t === T.ROCK ? 6 : 0) + (ouverts <= 1 ? 10 : ouverts === 2 ? 3 : 0) + Math.min(12, d) + 3 * bruit(x, y, 4, 313);
    if (t !== T.ROCK && ouverts > 2) continue;
    caches.push({ x, y, note });
  }
  caches.sort((a, b) => b.note - a.note || a.y - b.y || a.x - b.x);
  const rang = rangRoute(R.id), LOTS = lotsPour(rang), choisis = [];
  for (const c of caches) {
    if (choisis.length >= nc) break;
    c.s = sDe(...plusProche(sentier, c.x, c.y));
    if (choisis.some((q) => Math.abs(q.s - c.s) < 0.6 / nc || Math.hypot(q.x - c.x, q.y - c.y) < 20)) continue;
    let n = 0, id; do id = `${R.id}:c${n++}`; while (ids.has(id)); ids.add(id);
    const item = adapter(LOTS[Math.floor(bruit(c.x, c.y, 1.7, 41) * LOTS.length) % LOTS.length], rang);
    cacher(W, c.x, c.y, id, item);
    occ.add(c.x + ',' + c.y); choisis.push(c); out.caches.push({ id, x: c.x, y: c.y, item });
  }

  /* 3 bis. des récompenses qu'on vient chercher plus tard, comme dans HeartGold : un îlot au milieu d'un étang de la
        route (Surf), une petite clairière derrière un arbuste à couper (Coupe) sur les routes du début */
  {
    const rangR = rangRoute(R.id), lotsTard = (r) => lotsPour(Math.max(rangR, r));
    // l'îlot (2 × 2) : au milieu d'un carré de 6 × 6 cases d'eau de la route
    let ilot = null; const grandesEaux = new Set();
    for (let y = box[1] + 3; y <= box[3] - 3 && !ilot; y++) for (let x = box[0] + 3; x <= box[2] - 3; x++) {
      if (W.get(x, y) !== T.WATER || W.zoneAt(x, y)?.route !== R.id || W.zoneAt(x, y)?.town) continue;
      if (grandesEaux.has(x + ',' + y)) continue;
      let ok = true; for (let j = -2; j <= 3 && ok; j++) for (let i = -2; i <= 3; i++) if (W.get(x + i, y + j) !== T.WATER) { ok = false; break; }
      for (let j = -2; j <= 3 && ok; j++) for (let i = -2; i <= 3; i++) if (occ.has((x + i) + ',' + (y + j))) { ok = false; break; }
      // un étang ou un lac de la route, pas la mer : la nappe d'eau tient en moins de 1 500 cases
      // (la nappe est suivie dans le rectangle de la route ; si elle en sort, c'est la mer ou un grand lac de fond)
      if (ok) { const vu = new Set([x + ',' + y]), q = [[x, y]]; let bord = false; while (q.length) { const [a, b] = q.pop(); for (const [dx, dy] of N4) { const u = a + dx, v = b + dy, k = u + ',' + v; if (vu.has(k) || !(W.get(u, v) === T.WATER || W.get(u, v) === T.WHIRL)) continue; if (u <= box[0] || v <= box[1] || u >= box[2] || v >= box[3]) { bord = true; continue; } vu.add(k); q.push([u, v]); } } if (bord || vu.size >= 1500) { ok = false; for (const k of vu) grandesEaux.add(k); }
        // on y met l'eau depuis une rive qu'on atteint (et d'où l'on revient) à pied
        else { let rive = false; for (const k of vu) { const [a, b] = k.split(',').map(Number); for (const [dx, dy] of N4) { const u = a + dx, v = b + dy; if (u < box[0] || v < box[1] || u > box[2] || v > box[3]) continue; const i = E.G.at(u, v); if (E.av[i] && E.ar[i] && walkable(W.get(u, v))) { rive = true; break; } } if (rive) break; } if (!rive) { ok = false; for (const k of vu) grandesEaux.add(k); } } }
      if (ok) { ilot = [x, y]; break; }
    }
    if (ilot) {
      const [x, y] = ilot; for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { W.set(x + a, y + b, T.SAND); W.setHeight(x + a, y + b, W.height(x - 2, y)); }
      W.item(x + 1, y, adapter(lotsTard(5)[Math.floor(bruit(x, y, 1.7, 51) * 10) % 10], Math.max(rangR, 5)), 1, `${R.id}:i0`); occ.add((x + 1) + ',' + y);
      out.ilots = (out.ilots || 0) + 1;
    }
    // la clairière derrière un arbuste : depuis la prairie, un passage d'une case dans la lisière, l'arbuste, puis 3 × 3
    if (rangR <= 3) {
      let fait = false;
      for (let si = 0; si < sentier.length && !fait; si += 7) {
        const [px0, py0] = sentier[si];
        for (const [dx, dy] of N4) {
          if (fait) break;
          // le bord de la prairie dans cette direction
          let k = 1; while (k < 22 && walkable(W.get(px0 + dx * k, py0 + dy * k)) && aMoi(px0 + dx * k, py0 + dy * k)) k++;
          if (k < 4 || k >= 22) continue;
          const bx0 = px0 + dx * (k - 1), by0 = py0 + dy * (k - 1), h = W.height(bx0, by0);
          if (!HERBE(W.get(bx0, by0)) || occ.has(bx0 + ',' + by0)) continue;
          // l'arbuste (k), une case d'herbe (k + 1), puis la clairière centrée en k + 3 : tout en forêt, rien autour
          const cx = px0 + dx * (k + 3), cy = py0 + dy * (k + 3);
          let ok = true;
          for (let j = -2; j <= 2 && ok; j++) for (let i = -2; i <= 2; i++) { const t = W.get(cx + i, cy + j); if (!FORET(t) || W.height(cx + i, cy + j) !== h) { ok = false; break; } }
          for (let j = -3; j <= 3 && ok; j++) for (let i = -3; i <= 3; i++) { const u = cx + i, v = cy + j; if (walkable(W.get(u, v)) || W.get(u, v) === T.WATER) { ok = false; break; } }
          for (const kk of [k, k + 1]) { const u = px0 + dx * kk, v = py0 + dy * kk; if (!FORET(W.get(u, v)) || W.height(u, v) !== h || walkable(W.get(u - dy, v - dx)) || walkable(W.get(u + dy, v + dx))) ok = false; }
          if (!ok) continue;
          W.set(px0 + dx * k, py0 + dy * k, T.CUT); W.set(px0 + dx * (k + 1), py0 + dy * (k + 1), T.GRASS);
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) W.set(cx + i, cy + j, i || j ? T.GRASS : T.FLOWER);
          W.item(cx, cy, adapter(lotsTard(4)[Math.floor(bruit(cx, cy, 1.7, 53) * 10) % 10], 4), 1, `${R.id}:i1`); occ.add(cx + ',' + cy);
          fait = true; out.coupes = (out.coupes || 0) + 1;
        }
      }
    }
  }

  /* 4. panneaux aux deux bouts : le nom de la route et où elle mène */
  const nomBout = (t) => { const p = along(pts, t), q = along(pts, t < 0.5 ? 0 : 1); for (const [a, b] of [[q.x, q.y], [q.x - q.dx * 4, q.y - q.dy * 4], [q.x + q.dx * 4, q.y + q.dy * 4]]) { const z = W.zoneAt(Math.round(a), Math.round(b)); if (z && z.name && z.name !== R.name && !z.sea) return z.name; } void p; return null; };
  for (const [t, autre] of [[0.03, 1], [0.97, 0]]) {
    const p = along(pts, t);
    let deja = false; for (const k of W.signs.keys()) { const [a, b] = k.split(',').map(Number); if (Math.hypot(a - p.x, b - p.y) < 14) { deja = true; break; } }
    if (deja) continue;
    const vers = nomBout(autre), ici = nomBout(1 - autre);
    if (!vers) continue;
    const [a, b] = caseLibre(W, p.x + 0.5 + p.nx * 2.4, p.y + 0.5 + p.ny * 2.4);
    if (!aMoi(a, b) || W.get(a, b) === T.PATH || occ.has(a + ',' + b)) continue;
    W.sign(a, b, `${R.name.toUpperCase()}\n→ ${vers}${ici && ici !== vers ? `\n← ${ici}` : ''}`);
    occ.add(a + ',' + b); out.panneaux++;
  }
  return out;
}

/** un objet caché dans la case (x, y) : on le trouve en fouillant (touche A face à la case) ; le drapeau `I:<id>` est
 *  celui des objets posés (un objet trouvé le reste) */
export function cacher(W, x, y, id, item, qty = 1) {
  W.object(x, y, { cache: true, id, item, qty, use: async (A) => {
    if (A.f['I:' + id]) return;
    A.f['I:' + id] = true;
    await A.say('Tiens ? Il y a quelque chose de caché ici...');
    await A.give(item, qty);
  } });
}

function plusProche(sentier, x, y) { let b = sentier[0], bd = 1e9; for (const p of sentier) { const d = Math.abs(p[0] - x) + Math.abs(p[1] - y); if (d < bd) { bd = d; b = p; } } return [b[0], b[1]]; }
/** distance (pas) au sentier dans le rectangle */
function distanceAuSentier(W, box, sentier) {
  const [x0, y0, x1, y1] = box, w = x1 - x0 + 1, h = y1 - y0 + 1, d = new Float32Array(w * h).fill(1e9);
  for (const [x, y] of sentier) d[(y - y0) * w + (x - x0)] = 0;
  for (let j = 1; j < h; j++) for (let i = 1; i < w - 1; i++) { const p = j * w + i; d[p] = Math.min(d[p], d[p - 1] + 1, d[p - w] + 1, d[p - w - 1] + 1.41, d[p - w + 1] + 1.41); }
  for (let j = h - 2; j >= 0; j--) for (let i = w - 2; i >= 1; i--) { const p = j * w + i; d[p] = Math.min(d[p], d[p + 1] + 1, d[p + w] + 1, d[p + w + 1] + 1.41, d[p + w - 1] + 1.41); }
  return (x, y) => (x < x0 || y < y0 || x > x1 || y > y1 ? 1e9 : d[(y - y0) * w + (x - x0)]);
}
