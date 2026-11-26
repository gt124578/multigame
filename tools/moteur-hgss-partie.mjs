// Outils pour jouer HeartGold / SoulSilver dans le moteur (odyssee/moteur/), sans navigateur : une partie à partir des
// données du jeu (clone de pret/pokeheartgold), et les gestes d'un joueur (lire les dialogues, marcher jusqu'à une
// case, aller de carte en carte, parler à quelqu'un, se téléporter). Les combats sont gagnés d'office.
// Utilisé par tools/test-moteur-hgss-histoire.mjs.
import assert from 'node:assert/strict';
const B = new URL('../odyssee/moteur/', import.meta.url).href;
const { Terrain } = await import(B + 'engine/terrain.js');
const { testerPas } = await import(B + 'engine/objets.js');
const { BAS } = await import(B + 'engine/const.js');
const { Monde } = await import(B + 'engine/carte.js');

export const calme = (T) => !T.joueur.m && !T.transition && !T.ui && !T.ctxs.length && !T.combatEnCours && !T.ecranEnCours;

/**
 * une partie neuve (drapeaux et variables de départ du jeu), au départ `depart` ({ zone, warp } ou { zone, x, y }) ;
 * `G` : le résultat de jeuHG. Rend { T, vus, combats, … gestes }.
 */
export async function partie(G, depart, { graine = 3 } = {}) {
  const D = G.donnees;
  const D3 = { ...D, zones: { ...D.zones }, blocs: { ...D.blocs }, mondes: { ...D.mondes } };
  const charge = (p) => { Object.assign(D3.zones, p.zones); Object.assign(D3.blocs, p.blocs); Object.assign(D3.mondes, p.mondes); };
  charge(await G.chargerCarte(depart.zone));
  const T = new Terrain(D3, { graine, pokemon: {
    creer: (sp, niveau) => ({ sp: typeof sp === 'number' ? sp : D.nomsEspeces.findIndex((n) => n.toLowerCase() === String(sp).toLowerCase()), niveau, pv: 20, pvMax: 20 }),
    soigner: () => {} } });
  T.demarrer(depart);
  for (const f of G.drapeauxDepart) T.etat.drapeaux.add(f);
  Object.assign(T.etat.vars, G.varsDepart); T.majVisibles();
  T.chargeur = (id) => G.chargerCarte(id).then((p) => T.ajouterDonnees(p));
  const vus = [], combats = [], ecrans = [];
  const combat0 = T.combat.bind(T); T.combat = (c, ...r) => { combats.push(c); return combat0(c, ...r); };
  const pasA = async (e = {}) => { T.pas(e); if (T.transition?.demande) await new Promise((ok) => setTimeout(ok, 5)); };
  async function charger(...ids) { for (const id of ids) if (T.d.zones[id]?.aCharger) T.ajouterDonnees(await G.chargerCarte(id)); }
  /** lit les dialogues jusqu'à ce que les scripts rendent la main ; `rep` : choix successifs (nombre de « bas ») */
  async function lireA(rep = [], max = 40000) {
    for (let i = 0; i < max; i++) {
      if (T.combatEnCours) T.terminerCombat(true);
      if (T.ecranEnCours) { ecrans.push(T.ecranEnCours.quoi); T.finEcran(); }
      if (calme(T)) return;
      if (T.ui?.boutique) { await pasA({ b: true }); continue; }
      if (T.ui?.choix && T.ui.vus >= T.ui.texte.length) { const k = rep.shift() ?? 0; for (let d = 0; d < k; d++) { await pasA({ dir: BAS }); await pasA({}); } await pasA({ a: true }); continue; }
      if (T.ui && T.ui.vus >= T.ui.texte.length && !T.ui.lu && i % 2 === 0) vus.push(T.ui.texte.replace(/\n/g, ' '));
      await pasA({ a: T.ui && T.ui.vus >= T.ui.texte.length && !T.ui.lu && i % 2 === 0 });
    }
    throw new Error('les scripts ne rendent pas la main : ' + T.ctxs.map((c) => c.nom + '@' + c.pc + ' ' + JSON.stringify(c.prog?.ops?.[c.pc - 1])?.slice(0, 160)).join(', ') + ' ' + JSON.stringify(T.ui)?.slice(0, 200) + ' ' + T.joueur.x + ',' + T.joueur.y);
  }
  /** laisse jouer `n` pas, en lisant ce qui s'affiche */
  async function laisser(n = 200, rep = [0, 0, 0]) { for (let i = 0; i < n; i++) { await pasA({}); if (!calme(T)) await lireA(rep); } }
  /** marche jusqu'à (tx, ty) sur la carte où l'on est (plus court chemin ; un script en route est lu puis on s'arrête) */
  async function allerA(tx, ty) {
    const M = T.M, k = (x, y) => y * M.largeur + x;
    // les déclencheurs au sol actifs (scènes, pièges, dalles qui renvoient au départ) : évités si un autre chemin existe
    const pieges = new Set();
    for (const d of M.declencheurs || []) {
      if (d.var && (T.etat.vars[d.var] ?? 0) !== (d.val ?? 0)) continue;
      for (let y = d.y; y < d.y + (d.h || 1); y++) for (let x = d.x; x < d.x + (d.l || 1); x++) if (x !== tx || y !== ty) pieges.add(k(x, y));
    }
    const chercher = (eviter) => {
      const prev = new Map([[k(T.joueur.x, T.joueur.y), null]]); let f = [[T.joueur.x, T.joueur.y]];
      while (f.length && !prev.has(k(tx, ty))) {
        const f2 = [];
        for (const [x, y] of f) for (let d = 0; d < 4; d++) {
          const q = testerPas(M, { x, y }, d, { objets: T.objets.filter((o) => o.visible) });
          if (!q.ok) continue;
          const [nx, ny] = q.vers;
          if (eviter && pieges.has(k(nx, ny))) continue;
          if (!prev.has(k(nx, ny)) && !(M.warp(nx, ny) && (nx !== tx || ny !== ty))) { prev.set(k(nx, ny), [x, y, d]); f2.push([nx, ny]); }
        }
        f = f2;
      }
      return prev;
    };
    let prev = chercher(true);
    if (!prev.has(k(tx, ty))) prev = chercher(false);
    if (!prev.has(k(tx, ty))) {
      let best = null; for (const kk of prev.keys()) { const x = kk % M.largeur, y = (kk / M.largeur) | 0, d2 = Math.abs(x - tx) + Math.abs(y - ty); if (!best || d2 < best[0]) best = [d2, x, y]; }
      const pres = T.objets.filter((o) => o.visible && best && Math.abs(o.x - best[1]) < 4 && Math.abs(o.y - best[2]) < 4).map((o) => o.id + '@' + o.x + ',' + o.y);
      throw new Error(`${T.zone.id} : pas de chemin vers ${tx},${ty} depuis ${T.joueur.x},${T.joueur.y} (au plus près : ${best?.slice(1)} ; personnages : ${pres})`);
    }
    const dirs = []; let c = k(tx, ty); while (prev.get(c)) { const [x, y, d] = prev.get(c); dirs.unshift(d); c = k(x, y); }
    for (const d of dirs) {
      const x = T.joueur.x, y = T.joueur.y;
      for (let i = 0; i < 80; i++) { await pasA({ dir: d }); if ((T.joueur.x !== x || T.joueur.y !== y) && !T.joueur.m) break; if (T.transition || T.ui || T.ctxs.length) break; }
      if (!calme(T)) { await lireA(); return; }
    }
  }
  /** jusqu'à (x, y), quitte à reprendre après les scènes du chemin */
  async function rejoindre(x, y, essais = 20) { const z = T.zone.id; for (let i = 0; i < essais && T.zone.id === z && (T.joueur.x !== x || T.joueur.y !== y); i++) await allerA(x, y); }
  /** prendre la porte (x, y) jusqu'à la carte `z` (un tapis se prend en avançant dans son sens) */
  async function porte(x, y, z) {
    if (T.joueur.x === x && T.joueur.y === y) { const q = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([dx, dy]) => !T.M.bloquee(x + dx, y + dy) && !T.M.warp(x + dx, y + dy)); if (q) await allerA(x + q[0], y + q[1]); }
    for (let k = 0; k < 10 && T.zone.id !== z; k++) {
      await rejoindre(x, y, 80);
      const sens = T.M.props(T.joueur.x, T.joueur.y).tapis ?? T.joueur.dir;
      for (let i = 0; i < 200 && (T.zone.id !== z || T.transition); i++) { await pasA(T.joueur.x === x && T.joueur.y === y && !T.transition ? { dir: sens } : {}); if (!calme(T)) await lireA([0, 0]); }
    }
    assert.equal(T.zone.id, z, `porte ${x},${y} vers ${z}`);
  }
  /** la porte de la carte où l'on est qui mène à `z`, et la prendre */
  async function versCarte(z) {
    await charger(z);
    const w = (T.M.id === T.d.mondeDeZone[T.zone.id] && T.d.mondeDeZone[T.zone.id] === 'johto'
      ? Object.values(T.d.zones).filter((q) => T.d.mondeDeZone[q.id] === 'johto').flatMap((q) => (q.warps || []).map((w2, i) => ({ ...w2, i, zone: q.id })))
      : T.zone.warps.map((w2, i) => ({ ...w2, i, zone: T.zone.id }))).find((w2) => w2.vers === z && T.M.warp(w2.x, w2.y)?.vers === z);
    assert.ok(w, `${T.zone.id} : pas de porte vers ${z}`);
    await porte(w.x, w.y, z);
  }
  /**
   * aller jusqu'à la carte `cible`, de porte en porte : plus court chemin entre les cartes (par leurs portes), puis à
   * pied dans chacune ; une porte qu'on ne peut pas rejoindre d'ici est laissée pour une autre
   */
  async function allerZone(cible, max = 30) {
    const essayees = new Set();
    for (let k = 0; k < max && T.zone.id !== cible; k++) {
      await charger(cible);
      const zoneDe = (z) => (T.d.mondeDeZone?.[z] === 'johto' ? 'johto' : z);
      const portesDe = (z) => (z === 'johto' ? Object.values(T.d.zones).filter((q) => T.d.mondeDeZone?.[q.id] === 'johto').flatMap((q) => q.warps || []) : T.d.zones[z]?.warps || []);
      // les cartes, de proche en proche (leurs portes arrivent en route)
      const dep = zoneDe(T.zone.id), arr = zoneDe(cible), prec = new Map([[dep, null]]); let f = [dep];
      while (f.length && !prec.has(arr)) {
        const f2 = [];
        for (const z of f) {
          if (z !== 'johto') await charger(z);
          for (const w of portesDe(z)) { const v = w.vers && zoneDe(w.vers); if (v && !prec.has(v) && !essayees.has(`${z}>${v}`)) { prec.set(v, z); f2.push(v); } }
        }
        f = f2;
      }
      assert.ok(prec.has(arr), `${T.zone.id} : aucun chemin de portes vers ${cible}`);
      let suiv = arr; while (prec.get(suiv) && prec.get(suiv) !== dep) suiv = prec.get(suiv);
      await charger(suiv);
      const ws = [];
      T.M.warps.forEach((w) => { if (w.vers && zoneDe(w.vers) === suiv) ws.push(w); });
      let pris = false;
      for (const w of ws) {
        try { await porte(w.x, w.y, w.vers); pris = true; break; } catch (e) { if (process.env.DEBUG) console.log('  (porte', w.x, w.y, '→', w.vers, e.message.slice(0, 90), ')'); }
      }
      if (!pris) essayees.add(`${dep}>${suiv}`);
      await laisser(20);
    }
    assert.equal(T.zone.id, cible);
  }
  /**
   * aller jusqu'à la carte `cible` dans un lieu fait de plusieurs cartes (tours, grottes, bateau) : plus court chemin
   * d'escalier en escalier, en tenant compte des parties d'une même carte qui ne se rejoignent pas (on monte en zigzag)
   */
  async function allerLieu(cible, maxCartes = 60) {
    const mondes = new Map();
    const monde = async (z) => { await charger(z); const mid = T.d.mondeDeZone[z]; if (!mondes.has(mid)) mondes.set(mid, mid === T.M.id ? T.M : new Monde(T.d, mid)); return mondes.get(mid); };
    const cle = (z, x, y) => `${z}:${x},${y}`;
    const dep = { z: T.zone.id, x: T.joueur.x, y: T.joueur.y }, prec = new Map([[cle(dep.z, dep.x, dep.y), null]]);
    let f = [dep], fin = null, vues = 0;
    while (f.length && !fin && vues < maxCartes * 8) {
      const f2 = [];
      for (const s of f) {
        if (fin) break;
        vues++;
        const M = await monde(s.z), k = (x, y) => y * M.largeur + x, vu = new Set([k(s.x, s.y)]); let q = [[s.x, s.y]];
        const sorties = [];
        while (q.length) {
          const q2 = [];
          for (const [x, y] of q) for (let d = 0; d < 4; d++) {
            const r = testerPas(M, { x, y }, d, { objets: [] });
            if (!r.ok) continue;
            const [nx, ny] = r.vers;
            if (vu.has(k(nx, ny))) continue;
            vu.add(k(nx, ny));
            const w = M.warp(nx, ny);
            if (w && w.zone === s.z) { sorties.push(w); continue; }
            if (M.zone(nx, ny)?.id === s.z) q2.push([nx, ny]);
          }
          q = q2;
        }
        // la case d'arrivée peut être elle-même une porte (tapis) : on peut la reprendre
        const ici = M.warp(s.x, s.y); if (ici && ici.zone === s.z) sorties.push(ici);
        for (const w of sorties) {
          if (!w.vers) continue;
          await charger(w.vers);
          const d = T.d.zones[w.vers]?.warps?.[w.n ?? 0]; if (!d) continue;
          const c = cle(w.vers, d.x, d.y); if (prec.has(c)) continue;
          prec.set(c, { de: cle(s.z, s.x, s.y), w });
          const n = { z: w.vers, x: d.x, y: d.y };
          if (w.vers === cible) { fin = c; break; }
          f2.push(n);
        }
      }
      f = f2;
    }
    assert.ok(fin, `${T.zone.id} : aucun chemin d'escaliers vers ${cible}`);
    const etapes = []; let c = fin; while (prec.get(c)) { etapes.unshift(prec.get(c).w); c = prec.get(c).de; }
    for (const w of etapes) { if (T.zone.id !== w.zone) break; await porte(w.x, w.y, w.vers); await laisser(20); }
    assert.equal(T.zone.id, cible);
  }
  /** parler à un personnage (son identifiant, ou un test sur lui), depuis une case libre à côté */
  async function parlerA(qui, rep = [0, 0, 0]) {
    const o = typeof qui === 'function' ? T.objets.find((b) => b.visible && qui(b)) : T.objets.find((b) => b.visible && b.id === qui);
    assert.ok(o, `${T.zone.id} : personne à qui parler (${qui})`);
    // une case libre à côté de lui, qu'on peut rejoindre (on essaie chacune)
    const cases = [[0, 1, 0], [-1, 0, 3], [1, 0, 2], [0, -1, 1]].map(([dx, dy, dd]) => [o.x + dx, o.y + dy, dd])
      .filter(([px, py]) => (px === T.joueur.x && py === T.joueur.y) || (!T.M.bloquee(px, py) && !T.objets.some((b) => b !== o && b.visible && b.x === px && b.y === py)));
    let d = null, err = null;
    for (const [x, y, dd] of cases) {
      try { await rejoindre(x, y); } catch (e) { err = e; continue; }
      if (T.joueur.x === x && T.joueur.y === y) { d = dd; break; }
    }
    if (d === null) throw err || new Error(`${T.zone.id} : impossible d'approcher ${o.id}`);
    await pasA({ dir: d }); for (let i = 0; i < 30 && !calme(T); i++) await pasA({});
    await pasA({}); await pasA({ a: true }); await lireA(rep);
  }
  /** parler à tous les personnages de la carte qui ont quelque chose à dire (ceux qu'on ne peut pas rejoindre sont passés) */
  async function toutParler(rep = [0, 0, 0], filtre = () => true) {
    const z = T.zone.id;
    for (const o of T.objets.filter((b) => b.visible && b.def.script && filtre(b))) {
      if (T.zone.id !== z) return;
      try { await parlerA(o.id, [...rep]); await laisser(40); } catch (e) { if (process.env.DEBUG) console.log('  (', o.id, e.message.slice(0, 120), ')'); }
    }
  }
  /** se téléporter (comme le labo) ; la carte est chargée d'abord */
  async function teleporter(o) {
    await charger(o.zone);
    T.ctxs.length = 0; T.ui = null;
    T.teleporter(o);
    for (let i = 0; i < 400 && T.transition; i++) await pasA({});
    await lireA();
  }
  return { T, D3, vus, combats, ecrans, pasA, charger, lireA, laisser, allerA, rejoindre, porte, versCarte, allerZone, allerLieu, parlerA, toutParler, teleporter };
}
