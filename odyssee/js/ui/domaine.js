// odyssee/js/ui/domaine.js — le frigo de la maison (l'aimant de l'agence : acheter le grand terrain), la porte du jardin
// et le mode chantier du Domaine : on survole son terrain (on passe à travers tout), on choisit dans le catalogue et on
// pose sous ses pieds (Entrée, ou un clic sur la case) ; « Retirer » rend la moitié du prix. Tout est gardé dans
// state.domaine.travaux et rejoué à chaque lancement (world/domaine.js).
import * as THREE from 'three';
import { T } from '../world/tiles.js';
import { DOMAINE, PRIX_TERRAIN, PORTE_MAISON, ENTREE, CATALOGUE, ARTICLE, TOITS, HABITANTS, batirDomaine, posable, emprise, caseLibre } from '../world/domaine.js';
import { el, esc } from './ui.js';

const PROPRE = new Set([T.GRASS, T.PATH, T.PAVE, T.SAND, T.FLOWER, T.TALL, T.BRIDGE]);

/** remet le Domaine (et la porte du jardin) d'aplomb pour la partie en cours */
export function preparerDomaine(game) {
  const st = game.state, maps = game.world.maps, maison = maps[PORTE_MAISON.map];
  if (!st?.domaine) return;
  batirDomaine(maps, st.domaine);
  if (maison) {
    maison.set(PORTE_MAISON.x, PORTE_MAISON.y, T.MAT);
    maison.warp(PORTE_MAISON.x, PORTE_MAISON.y, { map: DOMAINE, x: ENTREE.arrivee[0], y: ENTREE.arrivee[1], dir: 'up' });
  }
}

/** le frigo de la maison : à manger, et l'aimant de l'agence immobilière */
export async function frigo(game) {
  const st = game.state, ui = game.ui;
  if (st.domaine) {
    await ui.say(['Le frigo est plein de bonnes choses.', 'Un mot de Maman, sous l\'aimant : « Ton terrain t\'attend derrière la maison, par la porte du jardin ! »']);
    return;
  }
  await ui.say(['Le frigo est plein de bonnes choses.', 'Un aimant y tient un prospectus : « Agence Bourg-Immo — GRAND TERRAIN À VENDRE juste derrière chez vous. Faites-y votre jardin, vos maisons, votre ville ! »']);
  if (!(await ui.yesNo(`Acheter le terrain pour ${PRIX_TERRAIN.toLocaleString('fr-FR')} ₽ ?`))) return;
  if (st.money < PRIX_TERRAIN) { await ui.say(`Il te faut ${PRIX_TERRAIN.toLocaleString('fr-FR')} ₽… Reviens quand tu auras économisé !`); return; }
  const nom = await ui.nameEntry('Nom de ton domaine', `Domaine de ${st.name}`);
  st.money -= PRIX_TERRAIN;
  st.domaine = { nom: (nom || `Domaine de ${st.name}`).slice(0, 24), travaux: [], hab: 0 };
  preparerDomaine(game); game.setMap(game.mapObj.id);
  game.sound.sfx('levelup'); game.hud?.update(true);
  await ui.say([`Félicitations ! Le terrain est à toi : « ${st.domaine.nom} » !`, 'La porte du jardin, au fond de la chambre, y mène directement. L\'architecte t\'y attend pour les travaux.']);
  game.save?.();
}

/** l'architecte du Domaine : ouvre le chantier */
export async function architecte(game) {
  const ui = game.ui, st = game.state;
  await ui.say(['Bonjour, patron ! Je suis l\'architecte.', 'Choisis ce que tu veux bâtir, déplace-toi et pose-le sous tes pieds. Je m\'occupe du reste !'], { speaker: 'Architecte' });
  await chantier(game);
  await ui.say(`Beau travail ! ${st.domaine?.travaux.length || 0} élément(s) dans ton domaine.`, { speaker: 'Architecte' });
}

/** le mode chantier */
export async function chantier(game) {
  const st = game.state, ui = game.ui, m0 = game.mapObj; if (!st.domaine || m0.id !== DOMAINE) return;
  game.busy = true;
  const p = game.player, depart = { x: p.x, y: p.y };
  let art = ARTICLE.chemin, retirer = false, done;
  const fini = new Promise((r) => { done = r; });
  if (game.hud?.root) game.hud.root.style.visibility = 'hidden';
  const bar = el('div', 'chantier');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'edit-cursor');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon'); svg.appendChild(poly);
  ui.root.appendChild(bar); ui.root.appendChild(svg);
  const majBar = () => {
    bar.innerHTML = `<div class="ch-art">${retirer ? '🧹 <b>Retirer</b> <small>rend la moitié du prix</small>' : `🔨 <b>${esc(art.nom)}</b> <small>${art.prix.toLocaleString('fr-FR')} ₽</small>`}</div>
      <div class="ch-argent">${st.money.toLocaleString('fr-FR')} ₽</div>
      <div class="ch-btns"><button type="button" data-c>📖 Catalogue</button><button type="button" data-r class="${retirer ? 'on' : ''}">🧹 Retirer</button><button type="button" data-f>✔ Terminer</button></div>
      <div class="ch-aide">Flèches : se déplacer · Entrée ou clic : poser · Échap : catalogue</div>`;
    bar.querySelector('[data-c]').onclick = (e) => { e.stopPropagation(); catalogue(); };
    bar.querySelector('[data-r]').onclick = (e) => { e.stopPropagation(); retirer = !retirer; majBar(); };
    bar.querySelector('[data-f]').onclick = (e) => { e.stopPropagation(); fermer(); };
  };
  majBar();
  const cv = game.view.renderer.domElement, ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const cadre = () => {
    const cam = game.view.camera, r = cv.getBoundingClientRect();
    const pt = (x, z) => { const v = new THREE.Vector3(x, 0, z).project(cam); return `${r.left + (v.x + 1) / 2 * r.width},${r.top + (1 - v.y) / 2 * r.height}`; };
    const [w, h] = !retirer && art.b ? [art.taille[0], art.taille[1] + 1] : [1, 1];
    poly.setAttribute('points', [pt(p.x, p.y), pt(p.x + w, p.y), pt(p.x + w, p.y + h), pt(p.x, p.y + h)].join(' '));
    poly.setAttribute('class', retirer ? 'ret' : posable({ a: art.id, x: p.x, y: p.y }, st.domaine.travaux, art) ? '' : 'non');
  };
  let raf = requestAnimationFrame(function f() { cadre(); raf = requestAnimationFrame(f); });

  const refaire = () => { batirDomaine(game.world.maps, st.domaine); const q = { x: p.x, y: p.y }; game.setMap(DOMAINE); Object.assign(p, q); game.busy = true; };
  const poser = async () => {
    const T0 = st.domaine.travaux;
    if (retirer) {
      // le dernier travail qui touche cette case
      for (let i = T0.length - 1; i >= 0; i--) if (emprise(T0[i]).some(([x, y]) => x === p.x && y === p.y)) {
        const a = ARTICLE[T0[i].a]; T0.splice(i, 1); st.money += Math.floor((a?.prix || 0) / 2);
        game.sound.sfx('cancel'); refaire(); majBar(); return;
      }
      game.sound.sfx('bump'); return;
    }
    const trav = { a: art.id, x: p.x, y: p.y };
    if (!caseLibre(p.x, p.y) || !posable(trav, T0, art)) { game.sound.sfx('bump'); ui.toast('Impossible ici'); return; }
    if (st.money < art.prix) { game.sound.sfx('bump'); ui.toast('Pas assez d\'argent'); return; }
    if (art.t != null) {
      // un terrain identique déjà posé : rien à payer
      const der = [...T0].reverse().find((t) => t.x === p.x && t.y === p.y && ARTICLE[t.a]?.t != null);
      if (der?.a === art.id || (!der && art.t === T.GRASS)) return;
    }
    if (art.b) {
      const toit = await ui.list({ title: 'Couleur du toit', items: TOITS.map((t) => ({ label: t })), cls: 'shop', cancel: -1 }); if (toit < 0) return;
      trav.toit = TOITS[toit]; trav.nom = art.nom;
      if (!(await ui.yesNo(`Construire : ${art.nom} pour ${art.prix.toLocaleString('fr-FR')} ₽ ?`))) return;
    } else if (art.s) {
      trav.texte = (await ui.nameEntry('Texte du panneau', st.domaine.nom.toUpperCase())) || 'PANNEAU';
    } else if (art.n) {
      const k = await ui.list({ title: 'Qui inviter ?', items: HABITANTS.map((h) => ({ label: h.replace('_', ' ') })), cls: 'shop', cancel: -1 }); if (k < 0) return;
      st.domaine.hab = (st.domaine.hab || 0) + 1; trav.k = st.domaine.hab; trav.sprite = HABITANTS[k];
    }
    st.money -= art.prix; T0.push(trav); game.sound.sfx(art.b ? 'levelup' : 'select');
    if (art.t != null || art.p) { applyLocal(trav); } else refaire();
    majBar();
  };
  // terrain et décor : on rejoue toute la carte seulement si besoin, sinon la case et ses voisines
  const applyLocal = () => { refaire(); };
  const catalogue = async () => {
    const cats = [...new Set(CATALOGUE.map((c) => c.cat))];
    const c = await ui.list({ title: 'Catalogue', items: cats.map((k) => ({ label: k })).concat([{ label: '🧹 Retirer un élément' }, { label: '✔ Terminer les travaux' }]), cls: 'shop', cancel: -1 });
    if (c < 0) return;
    if (c === cats.length) { retirer = true; majBar(); return; }
    if (c === cats.length + 1) { fermer(); return; }
    const L = CATALOGUE.filter((a) => a.cat === cats[c]);
    const i = await ui.list({ title: cats[c], items: L.map((a) => ({ label: a.nom, right: a.prix.toLocaleString('fr-FR') + ' ₽' })), cls: 'shop', cancel: -1 });
    if (i < 0) return;
    art = L[i]; retirer = false; majBar();
  };
  let occupe = false;
  const pop = game.input.push((k) => {
    if (occupe) return;
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k];
    if (d) { p.x = Math.max(1, Math.min(m0.w - 2, p.x + d[0])); p.y = Math.max(1, Math.min(m0.h - 2, p.y + d[1])); p.dir = k; return; }
    if (k === 'a') { occupe = true; poser().finally(() => { occupe = false; }); }
    else if (k === 'b') { occupe = true; catalogue().finally(() => { occupe = false; }); }
  });
  const clic = (e) => {
    if (occupe || e.target !== cv) return;
    const r = cv.getBoundingClientRect(), ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    game.view.camera.updateMatrixWorld(); ray.setFromCamera(ndc, game.view.camera);
    const q = new THREE.Vector3(); if (!ray.ray.intersectPlane(plane, q)) return;
    const x = Math.floor(q.x), y = Math.floor(q.z); if (!m0.in(x, y)) return;
    p.x = x; p.y = y; occupe = true; poser().finally(() => { occupe = false; });
  };
  cv.addEventListener('pointerdown', clic);
  const fermer = () => {
    pop(); cancelAnimationFrame(raf); cv.removeEventListener('pointerdown', clic); bar.remove(); svg.remove();
    if (game.hud?.root) game.hud.root.style.visibility = '';
    // on se pose sur une case praticable, au plus près
    const m = game.mapObj;
    if (!PROPRE.has(m.get(p.x, p.y)) || game.npcs.some((n) => n.x === p.x && n.y === p.y)) {
      let best = null;
      for (let r = 1; r < 20 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = p.x + dx, y = p.y + dy; if (PROPRE.has(m.get(x, y)) && !m.warpAt(x, y) && !game.npcs.some((n) => n.x === x && n.y === y)) { best = [x, y]; break; }
      }
      [p.x, p.y] = best || [depart.x, depart.y];
    }
    game.setMap(DOMAINE); game.busy = false; game.hud?.update(true); game.save?.();
    done();
  };
  await fini;
}
