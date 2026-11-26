// odyssee/moteur/render/labo.js — le labo du banc d'essai (page odyssee/moteur.html?labo), comme Odyssée Test :
// tous les lieux du jeu (villes, routes, arènes, grottes, intérieurs…) pour s'y téléporter et les passer en revue un
// par un, et des réglages d'essai : rencontres sauvages, dresseurs qui défient, combats gagnés d'office, passer les
// murs, vitesse du jeu, équipe toute faite, badges, CS. Rien n'est sauvegardé dans la partie (sauf si on sauvegarde),
// la revue des lieux (bon / à revoir, avec une note) est gardée dans le navigateur.
import { Monde } from '../engine/carte.js';

const CLE_REVUE = 'moteur-hgss-labo-revue';
const CLE_REGLAGES = 'moteur-hgss-labo';
/** les huit badges de Johto puis les huit de Kanto (drapeaux posés par les scripts du jeu) */
export const BADGES = ['ZEPHYR', 'HIVE', 'PLAIN', 'FOG', 'STORM', 'MINERAL', 'GLACIER', 'RISING',
  'BOULDER', 'CASCADE', 'THUNDER', 'RAINBOW', 'SOUL', 'MARSH', 'VOLCANO', 'EARTH'].map((b) => 'BADGE_' + b);
const NOMS_BADGES = ['Zéphyr', 'Essaim', 'Plaine', 'Brume', 'Choc', 'Minéral', 'Glacier', 'Lever',
  'Roche', 'Cascade', 'Foudre', 'Prisme', 'Âme', 'Marais', 'Volcan', 'Terre'];
/** équipes toutes faites : [numéro du Pokédex, niveau] */
const EQUIPES = [
  { nom: 'Faible (N.10)', team: [[155, 10], [16, 9], [19, 8]] },
  { nom: 'Moyenne (N.35)', team: [[157, 35], [160, 35], [154, 35], [181, 33], [130, 34], [196, 33]] },
  { nom: 'Forte (N.60)', team: [[248, 60], [149, 60], [157, 60], [160, 60], [230, 58], [212, 58]] },
  { nom: 'Légendaires (N.70)', team: [[249, 70], [250, 70], [243, 70], [244, 70], [245, 70], [150, 70]] },
];
/** familles de lieux, d'après l'identifiant de la carte (ceux de la décompilation) */
const FAMILLES = [
  ['Arènes', /_GYM\b|_GYM_/],
  ['Ligue', /^POKEMON_LEAGUE|^INDIGO|HALL_OF_FAME|ELITE/],
  ['Centres, boutiques', /POKECENTER|_MART\b|_MART_|DEPT_STORE/],
  ['Grottes, tours, donjons', /CAVE|TOWER|TUNNEL|RUINS|MOUNT_|MT_|ISLANDS|ICE_PATH|DRAGONS_DEN|SLOWPOKE_WELL|ROCKET|MAZE|DUNGEON|FOREST|VICTORY_ROAD|SPROUT|BELL|WHIRL|SEAFOAM|DIGLETT|SAFARI|EMBEDDED|CLIFF|CHAMBER|POWER_PLANT/],
  ['Routes', /^ROUTE_\d+$/],
];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Labo {
  /** `ctx` : { T, R, pont, charger, langue, vitesse: { get, set }, combats: { get, set } } */
  constructor(racine, ctx) {
    this.ctx = ctx; this.T = ctx.T;
    try { this.revue = JSON.parse(localStorage.getItem(CLE_REVUE) || '{}'); } catch { this.revue = {}; }
    try { Object.assign(this.T.reglages, JSON.parse(localStorage.getItem(CLE_REGLAGES) || '{}').reglages || {}); } catch { /* rien */ }
    this.lieux = this.lister();
    this.style(racine);
    this.barre = document.createElement('div'); this.barre.className = 'labo-barre';
    racine.append(this.barre);
    this.info = document.createElement('div'); this.info.className = 'labo-info';
    racine.append(this.info);
    this.majBarre();
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.repeat) return;
      if (e.code === 'KeyJ') { e.preventDefault(); this.panneau ? this.fermer() : this.ouvrirLieux(); }
      else if (e.code === 'KeyN' && !this.panneau) { e.preventDefault(); this.suivant(e.shiftKey ? -1 : 1); }
    }, true);
    setInterval(() => this.majInfo(), 300);
  }

  // ——— les lieux ———
  /** tous les lieux du jeu, rangés par famille : [{ id, nom, famille }] */
  lister() {
    const out = [];
    const D = this.T.d;
    for (const [id, z] of Object.entries(D.zones)) {
      if (/^WIFI|UNUSED|^UNION|^NOTHING|^EVERYWHERE|^BATTLE_/.test(id)) continue;
      let f = z.ville ? 'Villes' : null;
      for (const [nom, re] of FAMILLES) if (!f && re.test(id)) f = nom;
      if (!f) f = z.interieur ? 'Intérieurs' : z.route ? 'Routes' : 'Autres lieux';
      out.push({ id, nom: z.nom && z.nom !== id ? `${z.nom} — ${id}` : id, famille: f });
    }
    const ordre = ['Villes', 'Routes', 'Arènes', 'Ligue', 'Grottes, tours, donjons', 'Centres, boutiques', 'Intérieurs', 'Autres lieux'];
    return out.sort((a, b) => ordre.indexOf(a.famille) - ordre.indexOf(b.famille) || a.nom.localeCompare(b.nom));
  }
  /** se téléporter dans un lieu (chargé s'il ne l'est pas encore) : sur son premier téléporteur, sinon une case libre */
  async aller(id) {
    const T = this.T;
    if (T.combatEnCours || this.ctx.pont.occupe || T.transition) { this.toast('Pas pendant un combat ou une transition'); return; }
    // un script en cours (dialogue, scène d'arrivée) est arrêté : on part d'ici quoi qu'il arrive
    if (T.ctxs.length || T.ui) { T.ctxs.length = 0; T.ui = null; T.verrous = 0; T.joueur.file = []; for (const o of T.objets) o.file = []; }
    this.toast('Chargement de ' + id + '…');
    await this.ctx.charger(id);
    const z = T.d.zones[id];
    if (!z || z.aCharger) { this.toast('Lieu introuvable : ' + id); return; }
    const w = (z.warps || []).find((q) => q && q.x !== undefined);
    if (w) { T.teleporter({ zone: id, warp: z.warps.indexOf(w), sortie: w.sortie }); this.toast(''); return; }
    // sans téléporteur : la case libre la plus au centre de la zone
    const mid = T.d.mondeDeZone[id];
    const M = T.M?.id === mid ? T.M : new Monde(T.d, mid);
    let n = 0, sx = 0, sy = 0; const cases = [];
    M.zonesBloc.forEach((zb, i) => {
      if (zb !== id) return;
      const x0 = (i % M.lb) * 32, y0 = ((i / M.lb) | 0) * 32;
      for (let y = y0; y < y0 + 32; y++) for (let x = x0; x < x0 + 32; x++) {
        if (M.zone(x, y)?.id !== id || M.bloquee(x, y) || M.warp(x, y) || M.props(x, y).surf) continue;
        n++; sx += x; sy += y; cases.push([x, y]);
      }
    });
    if (!n) { this.toast('Aucune case libre dans ' + id); return; }
    const cx = sx / n, cy = sy / n;
    const [x, y] = cases.reduce((a, b) => ((b[0] - cx) ** 2 + (b[1] - cy) ** 2 < (a[0] - cx) ** 2 + (a[1] - cy) ** 2 ? b : a));
    T.teleporter({ zone: id, x, y, dir: 1 });
    this.toast('');
  }
  /** lieu suivant (ou précédent) de la liste : pour tout passer en revue */
  suivant(sens) {
    const ici = this.T.zone?.id, k = this.lieux.findIndex((l) => l.id === ici);
    const l = this.lieux[(k + sens + this.lieux.length) % this.lieux.length];
    if (l) this.aller(l.id);
  }
  noter(id, etat, note) {
    if (etat === null) delete this.revue[id]; else this.revue[id] = { etat, note: note || '' };
    try { localStorage.setItem(CLE_REVUE, JSON.stringify(this.revue)); } catch { /* rien */ }
    this.majBarre();
  }
  rapport() {
    const l = ['Revue des lieux du moteur HGSS', ''];
    const ok = this.lieux.filter((q) => this.revue[q.id]?.etat === 'ok').length;
    const pb = this.lieux.filter((q) => this.revue[q.id]?.etat === 'pb');
    l.push(`${ok} bons, ${pb.length} à revoir, ${this.lieux.length - ok - pb.length} pas vus (sur ${this.lieux.length})`, '');
    for (const q of pb) l.push(`✗ ${q.nom}${this.revue[q.id].note ? ' : ' + this.revue[q.id].note : ''}`);
    return l.join('\n');
  }

  // ——— interface ———
  garder() { try { const o = JSON.parse(localStorage.getItem(CLE_REGLAGES) || '{}'); o.reglages = this.T.reglages; localStorage.setItem(CLE_REGLAGES, JSON.stringify(o)); } catch { /* rien */ } }
  majBarre() {
    const T = this.T, r = T.reglages, c = this.ctx;
    const vus = Object.keys(this.revue).length;
    const items = [
      ['🧭 Lieux (J)', () => this.ouvrirLieux()],
      ['◀', () => this.suivant(-1), 'Lieu précédent (Maj + N)'],
      ['▶ Suivant (N)', () => this.suivant(1), 'Lieu suivant de la liste'],
      [`🌿 Rencontres : ${r.rencontres !== false ? 'oui' : 'non'}`, () => { r.rencontres = r.rencontres === false; this.garder(); }],
      [`⚔️ Dresseurs : ${r.dresseurs !== false ? 'oui' : 'non'}`, () => { r.dresseurs = r.dresseurs === false; this.garder(); }, 'Non : les dresseurs ne t\'arrêtent plus en te voyant (on peut encore leur parler)'],
      [`🥊 Combats : ${c.combats.get() === 'gagner' ? 'gagnés d\'office' : 'à jouer'}`, () => c.combats.set(c.combats.get() === 'gagner' ? 'jouer' : 'gagner'), 'Gagnés d\'office : chaque combat (sauvage ou dresseur) est gagné sans être joué'],
      [`👻 Murs : ${r.murs !== false ? 'oui' : 'non'}`, () => { r.murs = r.murs === false; this.garder(); }, 'Non : on passe à travers tout'],
      [`⏩ Vitesse ×${c.vitesse.get()}`, () => c.vitesse.set(c.vitesse.get() >= 4 ? 1 : c.vitesse.get() * 2), 'Aussi la touche T'],
      ['🎒 Équipe et badges', () => this.ouvrirStatut()],
      ['📷 Caméra', () => this.ouvrirCamera(), 'Zoom, inclinaison et champ de la caméra (molette, + / − pour le zoom)'],
      ['💖 Soigner', () => { for (const m of T.etat.equipe) c.pont.pokemon.soigner(m); this.toast('Équipe soignée'); }],
      [`📝 Revue ${vus}/${this.lieux.length}`, () => this.ouvrirRevue()],
      ['📐 Gabarit (.obj)', () => this.gabarit(), 'Les formes de la carte où l\'on est (sans textures), à ouvrir dans Blender pour modeler par-dessus'],
    ];
    this.barre.innerHTML = '';
    for (const [label, fn, titre] of items) {
      const b = document.createElement('button'); b.type = 'button'; b.tabIndex = -1; b.textContent = label; if (titre) b.title = titre;
      b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); fn(); this.majBarre(); });
      this.barre.append(b);
    }
  }
  majInfo() {
    const T = this.T, z = T.zone; if (!z) return;
    // sous la barre (qui peut tenir sur deux lignes), le panneau aussi
    const haut = this.barre.offsetHeight + 4 + 'px';
    this.info.style.top = haut; if (this.panneau) this.panneau.style.top = haut;
    const r = this.revue[z.id], j = T.joueur;
    const bl = T.M.blocs?.[((j.y / 32) | 0) * T.M.lb + ((j.x / 32) | 0)];
    const th = bl?.decor?.find((d) => d.type === 'terrain_hg');
    const nb = (a) => (a || []).length;
    const bat = this.batimentProche();
    const renc = Object.keys(z.rencontres || {}).filter((k) => z.rencontres[k]?.especes?.length).join(', ') || 'aucune';
    this.info.innerHTML = `<b>${esc(z.nom || z.id)}</b> <span>${esc(z.id)}</span>${th ? ` · carte n° ${th.carte}` : ''} · x ${j.x} y ${j.y}${bat ? ` · bâtiment n° ${bat}` : ''}<br>`
      + `${nb(z.warps)} portes · ${nb(z.objets)} objets · ${nb(z.panneaux)} panneaux · ${nb(z.declencheurs)} déclencheurs · rencontres : ${esc(renc)}`
      + (r ? `<br>${r.etat === 'ok' ? '✓ bon' : '✗ à revoir'}${r.note ? ' — ' + esc(r.note) : ''}` : '');
  }
  /** le bloc du joueur et son modèle (carte de HGSS) dans le rendu */
  modeleIci() {
    const T = this.T, M = T.M, j = T.joueur, i = ((j.y / 32) | 0) * M.lb + ((j.x / 32) | 0);
    const g = this.ctx.R.blocs.get(i);
    const o = g?.children.find((k) => k.children.some((c) => c.userData.sol || c.userData.batiment !== undefined));
    return o ? { o, th: M.blocs[i]?.decor.find((d) => d.type === 'terrain_hg') } : null;
  }
  /** numéro du bâtiment le plus proche du joueur (à moins de 6 cases), pour remplacements.json */
  batimentProche() {
    const m = this.modeleIci(); if (!m) return null;
    const j = this.T.joueur; let best = null, bd = 36;
    for (const k of m.o.children) {
      if (k.userData.batiment === undefined) continue;
      const d = (m.o.position.x + k.position.x - j.x - 0.5) ** 2 + (m.o.position.z + k.position.z - j.y - 0.5) ** 2;
      if (d < bd) { bd = d; best = k.userData.batiment; }
    }
    return best;
  }
  /**
   * Gabarit pour Blender : les formes de la carte où l'on est (sol et bâtiments, sans textures ni couleurs), en .obj.
   * 1 unité = une case, origine au milieu de la carte : importé tel quel dans Blender (axes par défaut), il est dans
   * le repère où remplacements.json attend le modèle. Pour modeler par-dessus ; ne pas le mettre dans le dépôt.
   */
  gabarit() {
    const m = this.modeleIci();
    if (!m) { this.toast('Pas de carte du jeu ici'); return; }
    const l = [`# gabarit de la carte ${m.th?.carte ?? ''} (${this.T.zone?.id}) : 1 unité = 1 case, origine au milieu de la carte`];
    let base = 1;
    const racine = m.o.clone(); racine.position.set(0, 0, 0); racine.updateMatrixWorld(true);
    const v = new (racine.position.constructor)();
    racine.traverse((k) => {
      if (!k.isMesh) return;
      let nom = 'sol';
      for (let p = k; p && p !== racine; p = p.parent) if (p.userData.batiment !== undefined) { nom = 'batiment_' + String(p.userData.batiment).replace(':', '_'); break; }
      const pos = k.geometry.attributes.position, idx = k.geometry.index;
      l.push(`o ${nom}`);
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(k.matrixWorld); l.push(`v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`); }
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) { const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2; l.push(`f ${a + base} ${b + base} ${c + base}`); }
      base += pos.count;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([l.join('\n')], { type: 'text/plain' }));
    a.download = `gabarit_${this.T.zone?.id || 'carte'}_${m.th?.carte ?? ''}.obj`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.toast('Gabarit téléchargé');
  }
  toast(t) {
    if (!this.tst) { this.tst = document.createElement('div'); this.tst.className = 'labo-toast'; this.barre.parentNode.append(this.tst); }
    this.tst.textContent = t; this.tst.style.display = t ? 'block' : 'none';
    clearTimeout(this.tTst); if (t) this.tTst = setTimeout(() => { this.tst.style.display = 'none'; }, 2500);
  }
  fermer() { this.panneau?.remove(); this.panneau = null; }
  ouvrir(titre, html) {
    this.fermer();
    const p = document.createElement('div'); p.className = 'labo-panneau';
    p.innerHTML = `<div class="labo-titre">${esc(titre)} <button type="button" data-x>✕</button></div>${html}`;
    p.querySelector('[data-x]').onclick = () => this.fermer();
    // les touches tapées dans le panneau ne vont pas au jeu
    p.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.fermer(); });
    p.addEventListener('keyup', (e) => e.stopPropagation());
    this.barre.parentNode.append(p);
    this.panneau = p;
    return p;
  }
  ouvrirLieux() {
    const ici = this.T.zone?.id;
    const marque = (id) => ({ ok: '✓ ', pb: '✗ ' }[this.revue[id]?.etat] || '· ');
    const familles = [...new Set(this.lieux.map((l) => l.famille))];
    const opts = familles.map((f) => `<optgroup label="${esc(f)} (${this.lieux.filter((l) => l.famille === f).length})">${this.lieux.map((l, i) => (l.famille === f
      ? `<option value="${i}"${l.id === ici ? ' selected' : ''}>${marque(l.id)}${esc(l.nom)}</option>` : '')).join('')}</optgroup>`).join('');
    const r = this.revue[ici] || {};
    const p = this.ouvrir(`LIEUX (${this.lieux.length})`, `
      <input class="labo-cherche" placeholder="Chercher (ville, route, arène, grotte, identifiant…)">
      <select class="labo-liste" size="16">${opts}</select>
      <div class="labo-ligne"><button type="button" class="labo-go" data-go>▶ Y aller</button>
        <label><input type="checkbox" data-pasvus> seulement les pas vus</label></div>
      <div class="labo-ligne">Ici (${esc(ici || '?')}) : <button type="button" data-ok>✓ Bon</button><button type="button" data-pb>✗ À revoir</button><button type="button" data-rien>effacer</button></div>
      <input class="labo-note" placeholder="Note (ce qui ne va pas)" value="${esc(r.note || '')}">`);
    const sel = p.querySelector('.labo-liste'), q = p.querySelector('.labo-cherche'), pv = p.querySelector('[data-pasvus]'), note = p.querySelector('.labo-note');
    const filtrer = () => {
      const v = q.value.toLowerCase();
      for (const o of sel.querySelectorAll('option')) { const l = this.lieux[+o.value]; o.hidden = (v && !l.nom.toLowerCase().includes(v)) || (pv.checked && this.revue[l.id]); }
    };
    q.addEventListener('input', filtrer); pv.addEventListener('change', filtrer);
    const go = () => { const l = this.lieux[+sel.value]; if (!l) return; this.fermer(); this.aller(l.id); };
    p.querySelector('[data-go]').onclick = go; sel.addEventListener('dblclick', go);
    sel.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const o = [...sel.options].find((x) => !x.hidden); if (o) { sel.value = o.value; go(); } } });
    p.querySelector('[data-ok]').onclick = () => { if (ici) this.noter(ici, 'ok', note.value); this.fermer(); };
    p.querySelector('[data-pb]').onclick = () => { if (ici) this.noter(ici, 'pb', note.value); this.fermer(); };
    p.querySelector('[data-rien]').onclick = () => { if (ici) this.noter(ici, null); this.fermer(); };
    q.focus();
  }
  ouvrirStatut() {
    const T = this.T, D = T.etat.drapeaux;
    const p = this.ouvrir('ÉQUIPE ET BADGES', `
      <div class="labo-ligne"><b>Équipe</b> ${EQUIPES.map((e, i) => `<button type="button" data-eq="${i}">${esc(e.nom)}</button>`).join('')}</div>
      <div class="labo-ligne"><b>Badges</b> <button type="button" data-tous>tous</button><button type="button" data-aucun>aucun</button></div>
      <div class="labo-badges">${BADGES.map((b, i) => `<label title="${b}"><input type="checkbox" data-b="${b}"${D.has(b) ? ' checked' : ''}> ${NOMS_BADGES[i]}</label>`).join('')}</div>
      <div class="labo-ligne"><label><input type="checkbox" data-cs${D.has('TOUT_CS') ? ' checked' : ''}> toutes les capacités de terrain (sans badge ni CS)</label></div>
      <div class="labo-ligne"><label><input type="checkbox" data-ch${D.has('CHAUSSURES') ? ' checked' : ''}> chaussures de course</label>
        <label><input type="checkbox" data-velo${T.etat.sac.velo ? ' checked' : ''}> vélo</label></div>
      <div class="labo-ligne"><b>Argent</b> <input type="number" data-argent value="${T.etat.argent}" style="width:8em"></div>`);
    p.querySelectorAll('[data-eq]').forEach((b) => { b.onclick = () => {
      const e = EQUIPES[+b.dataset.eq];
      T.etat.equipe.length = 0;
      for (const [sp, n] of e.team) T.etat.equipe.push(this.ctx.pont.pokemon.creer(sp, n));
      this.toast('Équipe : ' + e.nom);
    }; });
    const coche = (b, oui) => { if (oui) D.add(b); else D.delete(b); };
    p.querySelectorAll('[data-b]').forEach((c) => { c.onchange = () => coche(c.dataset.b, c.checked); });
    p.querySelector('[data-tous]').onclick = () => p.querySelectorAll('[data-b]').forEach((c) => { c.checked = true; coche(c.dataset.b, true); });
    p.querySelector('[data-aucun]').onclick = () => p.querySelectorAll('[data-b]').forEach((c) => { c.checked = false; coche(c.dataset.b, false); });
    p.querySelector('[data-cs]').onchange = (e) => coche('TOUT_CS', e.target.checked);
    p.querySelector('[data-ch]').onchange = (e) => coche('CHAUSSURES', e.target.checked);
    p.querySelector('[data-velo]').onchange = (e) => { T.etat.sac.velo = e.target.checked ? 1 : 0; };
    p.querySelector('[data-argent]').onchange = (e) => { T.etat.argent = Math.max(0, +e.target.value | 0); };
  }
  ouvrirCamera() {
    const R = this.ctx.R, c = R.cam, T = this.T;
    const ligne = (cle, nom, min, max, pas, defaut) => `<div class="labo-ligne"><b style="width:7em">${nom}</b>
      <input type="range" data-c="${cle}" min="${min}" max="${max}" step="${pas}" value="${c[cle] ?? defaut}" style="flex:1">
      <span data-v="${cle}" style="width:3.5em">${c[cle] ?? defaut}</span></div>`;
    const p = this.ouvrir('CAMÉRA', `
      ${ligne('zoom', 'Zoom', 0.6, 3, 0.05, 1)}
      ${ligne('inclinaison', 'Inclinaison (°)', 25, 85, 1, T.camera?.inclinaison ?? 55)}
      ${ligne('champ', 'Champ (°)', 6, 60, 1, T.camera?.fov ?? 13)}
      <div class="labo-ligne"><button type="button" data-hgss>Comme HGSS (55°, champ de la carte)</button><button type="button" data-raz>Remettre</button></div>
      <div style="opacity:.75;font-size:12px">Zoom > 1 : on voit plus loin. Inclinaison : 90° = vu du dessus. Un champ plus large accentue la perspective.
      Le zoom se règle aussi à la molette ou avec + / −.</div>`);
    p.querySelectorAll('[data-c]').forEach((i) => { i.oninput = () => { c[i.dataset.c] = +i.value; p.querySelector(`[data-v="${i.dataset.c}"]`).textContent = i.value; R.garderCam?.(); }; });
    p.querySelector('[data-hgss]').onclick = () => { c.inclinaison = null; c.champ = null; R.garderCam?.(); this.ouvrirCamera(); };
    p.querySelector('[data-raz]').onclick = () => { c.zoom = 1.25; c.inclinaison = null; c.champ = null; R.garderCam?.(); this.ouvrirCamera(); };
  }
  ouvrirRevue() {
    const p = this.ouvrir('REVUE DES LIEUX', `<textarea class="labo-rapport" readonly rows="14"></textarea>
      <div class="labo-ligne"><button type="button" data-copier>Copier</button><button type="button" data-raz>Tout effacer</button></div>`);
    const t = p.querySelector('textarea'); t.value = this.rapport();
    p.querySelector('[data-copier]').onclick = () => { t.select(); navigator.clipboard?.writeText(t.value).catch(() => {}); this.toast('Revue copiée'); };
    p.querySelector('[data-raz]').onclick = () => { if (confirm('Effacer toute la revue des lieux ?')) { this.revue = {}; this.noter('_', null); t.value = this.rapport(); } };
  }
  style(racine) {
    const s = document.createElement('style');
    s.textContent = `
      .labo-barre { position: absolute; left: 0; right: 0; top: 0; display: flex; flex-wrap: wrap; gap: 3px; padding: 3px; background: rgba(10, 16, 30, 0.72); z-index: 20; }
      .labo-barre button, .labo-panneau button { font: 12px system-ui, sans-serif; color: #fff; background: #2c3a5c; border: 1px solid #5a6c96; border-radius: 4px; padding: 3px 7px; cursor: pointer; }
      .labo-barre button:hover, .labo-panneau button:hover { background: #3c4e7a; }
      .labo-info { position: absolute; left: 0.6%; top: 34px; font: 12px/1.4 system-ui, sans-serif; color: #fff; background: rgba(0, 0, 0, 0.55); padding: 4px 7px; border-radius: 4px; pointer-events: none; z-index: 20; }
      .labo-info span { opacity: 0.7; font-family: monospace; }
      .labo-toast { position: absolute; left: 50%; top: 40%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.8); color: #fff; font: 14px system-ui; padding: 8px 14px; border-radius: 6px; display: none; z-index: 30; }
      .labo-panneau { position: absolute; right: 2%; top: 40px; width: min(440px, 90%); max-height: 86%; overflow: auto; background: #182238; color: #e8ecf6; border: 2px solid #5a6c96; border-radius: 8px; padding: 8px 10px; font: 13px/1.5 system-ui, sans-serif; z-index: 25; }
      .labo-titre { font-weight: bold; letter-spacing: 1px; margin-bottom: 6px; display: flex; justify-content: space-between; }
      .labo-panneau input, .labo-panneau select, .labo-panneau textarea { width: 100%; box-sizing: border-box; background: #0e1626; color: #fff; border: 1px solid #4a5a80; border-radius: 4px; font: 13px system-ui; padding: 3px 5px; }
      .labo-panneau input[type=checkbox] { width: auto; }
      .labo-liste { margin: 4px 0; }
      .labo-ligne { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 5px 0; }
      .labo-badges { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 8px; }
      .labo-go { background: #2f6a3c !important; }
    `;
    racine.append(s);
  }
}
