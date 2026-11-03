// odyssee/js/ui/domaine.js — le Domaine, façon Pokémon Pokopia : le frigo de la maison (l'aimant de l'agence : acheter
// le terrain, 50 000 ₽), la téléportation depuis le menu, la récolte (souches, rochers, broussailles), l'architecte et
// le mode chantier (on survole son terrain et on pose sous ses pieds, au clavier ou d'un clic), les Pokémon qui viennent
// s'installer quand leur habitat est prêt et qui apprennent leurs talents. Tout est gardé dans state.domaine
// (world/domaine.js rejoue la carte à chaque lancement).
import * as THREE from 'three';
import { T } from '../world/tiles.js';
import {
  DOMAINE, PRIX_TERRAIN, PORTE_MAISON, ENTREE, CATALOGUE, ARTICLE, TOITS, HABITANTS, MATERIAUX, TALENTS, RESIDENTS, RESIDENT, RECOLTE, REPOUSSE,
  batirDomaine, posable, emprise, caseLibre, compter, rang, etatDomaine,
} from '../world/domaine.js';
import { el, esc } from './ui.js';

const PROPRE = new Set([T.GRASS, T.PATH, T.PAVE, T.SAND, T.FLOWER, T.TALL, T.BRIDGE, T.ASH]);
const fmt = (n) => n.toLocaleString('fr-FR');
const ICO = Object.fromEntries(MATERIAUX.map(([k, i]) => [k, i]));
export const coutTexte = (c) => Object.entries(c || {}).filter(([, v]) => v).map(([k, v]) => `${v} ${ICO[k]}`).join(' ') || 'gratuit';
const assez = (mat, c) => Object.entries(c || {}).every(([k, v]) => (mat[k] || 0) >= v);

/** remet le Domaine (et la porte du jardin) d'aplomb pour la partie en cours */
export function preparerDomaine(game) {
  const st = game.state, maps = game.world.maps, maison = maps[PORTE_MAISON.map];
  if (!st?.domaine) return null;
  const d = etatDomaine(st.domaine), now = Date.now();
  for (const [k, t] of Object.entries(d.recolte)) if (now - t >= REPOUSSE) delete d.recolte[k];   // les ressources ont repoussé
  const m = batirDomaine(maps, d, now);
  if (maison) {
    maison.set(PORTE_MAISON.x, PORTE_MAISON.y, T.MAT);
    maison.warp(PORTE_MAISON.x, PORTE_MAISON.y, { map: DOMAINE, x: ENTREE.arrivee[0], y: ENTREE.arrivee[1], dir: 'up' });
  }
  return m;
}
/** redessine le Domaine en gardant le dresseur où il est */
function refaire(game) {
  const p = game.player, q = { x: p.x, y: p.y, dir: p.dir }, busy = game.busy;
  preparerDomaine(game);
  if (game.mapObj.id === DOMAINE) { game.setMap(DOMAINE); Object.assign(p, q); }
  game.busy = busy;
}

/** le frigo de la maison : à manger, et l'aimant de l'agence immobilière */
export async function frigo(game) {
  const st = game.state, ui = game.ui;
  if (st.domaine) {
    await ui.say(['Le frigo est plein de bonnes choses.', 'Un mot de Maman, sous l\'aimant : « Ton terrain t\'attend ! Passe par la porte du jardin, ou choisis DOMAINE dans ton menu pour t\'y rendre de n\'importe où. »']);
    return;
  }
  await ui.say(['Le frigo est plein de bonnes choses.', 'Un aimant y tient un prospectus : « Agence Bourg-Immo — TRÈS GRAND TERRAIN À VENDRE. Une terre desséchée à faire revivre : récoltez, bâtissez, et les Pokémon viendront y vivre ! »']);
  if (!(await ui.yesNo(`Acheter le terrain pour ${fmt(PRIX_TERRAIN)} ₽ ?`))) return;
  if (st.money < PRIX_TERRAIN) { await ui.say(`Il te faut ${fmt(PRIX_TERRAIN)} ₽… Tu en as ${fmt(st.money)}. Reviens quand tu auras économisé !`); return; }
  const nom = await ui.nameEntry('Nom de ton domaine', `Domaine de ${st.name}`);
  st.money -= PRIX_TERRAIN;
  st.domaine = etatDomaine({ nom: (nom || `Domaine de ${st.name}`).slice(0, 24), travaux: [], hab: 0 });
  st.domaine.mat = { bois: 10, pierre: 10, fibre: 5, graines: 10 };   // de quoi commencer
  preparerDomaine(game); game.setMap(game.mapObj.id);
  game.sound.sfx('levelup'); game.hud?.update(true);
  await ui.say([`Félicitations ! Le terrain est à toi : « ${st.domaine.nom} » !`, 'Choisis DOMAINE dans ton menu pour t\'y téléporter de n\'importe où (ou prends la porte du jardin, au fond de la chambre).', 'L\'agence t\'offre de quoi commencer : 10 bois, 10 pierres, 5 fibres et 10 graines.']);
  game.save?.();
}

/** DOMAINE dans le menu : on s'y téléporte, et on en revient là où l'on était */
export async function allerDomaine(game) {
  const st = game.state, ui = game.ui, p = game.player;
  if (!st.domaine) return false;
  if (game.mapObj.gymLock != null && st.flags['IN:' + game.mapObj.id] && !game.libre) { await ui.say('Pas pendant un défi d\'arène !'); return false; }
  if (game.mapObj.id === DOMAINE) {
    const r = st.domaine.retour || { map: PORTE_MAISON.map, x: PORTE_MAISON.arrivee[0], y: PORTE_MAISON.arrivee[1], dir: 'left' };
    if (!(await ui.yesNo(`Revenir ${r.map === PORTE_MAISON.map ? 'à la maison' : 'là où tu étais'} ?`))) return false;
    await game.warp(r, 'select'); return true;
  }
  if (p.surf) { await ui.say('Pas en pleine mer !'); return false; }
  st.domaine.retour = { map: game.mapObj.id, x: p.x, y: p.y, dir: p.dir };
  preparerDomaine(game);
  await game.warp({ map: DOMAINE, x: ENTREE.arrivee[0], y: ENTREE.arrivee[1], dir: 'up' }, 'select');
  return true;
}

/** récolter une souche, un rocher ou une broussaille */
export async function recolter(game, x, y, k) {
  const st = game.state, d = etatDomaine(st.domaine); if (!d) return;
  const gain = RECOLTE[k]; if (!gain) return;
  for (const [m, v] of Object.entries(gain)) d.mat[m] = (d.mat[m] || 0) + v;
  d.recolte[x + ',' + y] = Date.now();
  game.sound.sfx(k === 'rocher' ? 'bump' : 'select');
  refaire(game);
  const nom = { souche: 'la souche morte', rocher: 'le rocher', broussaille: 'les broussailles' }[k];
  game.ui.toast(`${nom[0].toUpperCase() + nom.slice(1)} : ${coutTexte(gain).replace(/(\d+) /g, '+$1 ')}`, 1400);
}

/** les Pokémon dont l'habitat est prêt viennent s'installer (et apprennent leur talent) */
export async function arrivees(game) {
  const st = game.state, d = etatDomaine(st.domaine); if (!d) return;
  const m = game.world.maps[DOMAINE]; if (!m) return;
  const c = compter(m), venus = [];
  for (const r of RESIDENTS) if (!d.res.includes(r.sp) && r.cond(c)) { d.res.push(r.sp); venus.push(r); if (r.talent && !d.talents.includes(r.talent)) d.talents.push(r.talent); }
  if (!venus.length) return;
  refaire(game);
  for (const r of venus) {
    game.sound.sfx('levelup');
    const lignes = [`Un ${r.nom} est venu s'installer dans ton domaine !`, r.dit];
    if (r.talent) lignes.push(`${r.nom} t'apprend le talent « ${TALENTS[r.talent].nom} » : tu peux maintenant ${TALENTS[r.talent].desc} !`);
    await game.ui.say(lignes);
  }
  await game.ui.say(`Ton domaine est maintenant : ${rang(d, compter(game.world.maps[DOMAINE]))}.`);
}

/** parler à un Pokémon installé : ce qu'il dit, et un indice sur le prochain habitant */
export async function resident(game, n) {
  const d = etatDomaine(game.state.domaine), r = RESIDENT[n?.def?.sp]; if (!r || !d) return;
  game.sound.cry?.(null);
  const prochain = RESIDENTS.find((q) => !d.res.includes(q.sp));
  const lignes = [r.dit];
  if (prochain) lignes.push(`(${r.nom} a entendu dire qu'un ${prochain.nom} aimerait vivre ici s'il y avait ${prochain.habitat}.)`);
  else lignes.push(`(${r.nom} a l'air parfaitement heureux. Tous les Pokémon des environs vivent chez toi !)`);
  await game.ui.say(lignes, { speaker: r.nom });
}

/** l'architecte du Domaine : chantier, carnet des habitats, matériaux */
export async function architecte(game) {
  const ui = game.ui, st = game.state, d = etatDomaine(st.domaine); if (!d) return;
  const sp = { speaker: 'Architecte' };
  if (!d.vuArchitecte) {
    d.vuArchitecte = true;
    await ui.say(['Bonjour, patron ! Je suis l\'architecte de ton domaine.', 'Ce terrain est tout desséché. Récolte les souches mortes, les rochers et les broussailles : ça donne du bois, de la pierre, des fibres et des graines.', 'Avec ça, on bâtit ! Et les Pokémon viendront vivre ici quand leur habitat leur plaira. Chacun t\'apprendra un talent pour construire de nouvelles choses.', 'Ton premier ami t\'attend déjà : Bulbizarre ! Grâce à sa Verdure, tu peux faire repousser l\'herbe.'], sp);
  }
  for (;;) {
    const c = compter(game.mapObj.id === DOMAINE ? game.mapObj : game.world.maps[DOMAINE]);
    const k = await ui.list({ title: `${d.nom} · ${rang(d, c)}`, items: [{ label: '🔨 Construire' }, { label: '📖 Carnet des habitats' }, { label: '🎒 Matériaux et talents' }, { label: 'Au revoir' }], cls: 'shop', cancel: 3 });
    if (k === 0) { await chantier(game); await arrivees(game); }
    else if (k === 1) await carnet(game);
    else if (k === 2) {
      await ui.say([`Matériaux : ${MATERIAUX.map(([m, i, nom]) => `${i} ${nom} ${d.mat[m] || 0}`).join(' · ')}`,
        `Talents : ${d.talents.map((t) => TALENTS[t].nom).join(', ') || 'aucun'}.`], sp);
    } else return;
  }
}
async function carnet(game) {
  const d = game.state.domaine, ui = game.ui;
  const items = RESIDENTS.map((r) => {
    const ok = d.res.includes(r.sp);
    return { label: `${ok ? '✔' : '·'} ${r.nom}`, right: ok ? (r.talent ? TALENTS[r.talent].nom : 'installé') : r.habitat };
  });
  await ui.list({ title: `Habitats · ${d.res.length}/${RESIDENTS.length} Pokémon`, items: items.concat([{ label: 'Fermer' }]), cls: 'shop carnet', cancel: items.length });
}

/** le mode chantier */
export async function chantier(game) {
  const st = game.state, ui = game.ui, m0 = game.mapObj; if (!st.domaine || m0.id !== DOMAINE) return;
  const d = etatDomaine(st.domaine);
  game.busy = true;
  const p = game.player, depart = { x: p.x, y: p.y };
  let art = ARTICLE.chemin, retirer = false, done;
  const fini = new Promise((r) => { done = r; });
  if (game.hud?.root) game.hud.root.style.visibility = 'hidden';
  const bar = el('div', 'chantier');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'edit-cursor');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon'); svg.appendChild(poly);
  ui.root.appendChild(bar); ui.root.appendChild(svg);
  const bloque = (a) => a.talent && !d.talents.includes(a.talent);
  const majBar = () => {
    bar.innerHTML = `<div class="ch-art">${retirer ? '🧹 <b>Retirer</b> <small>rend la moitié des matériaux</small>' : `🔨 <b>${esc(art.nom)}</b> <small>${esc(coutTexte(art.cout))}</small>`}</div>
      <div class="ch-argent">${MATERIAUX.map(([m, i]) => `${i} ${d.mat[m] || 0}`).join(' &nbsp; ')}</div>
      <div class="ch-btns"><button type="button" data-c>📖 Catalogue</button><button type="button" data-r class="${retirer ? 'on' : ''}">🧹 Retirer</button><button type="button" data-f>✔ Terminer</button></div>
      <div class="ch-aide">Flèches : se déplacer · Entrée ou clic : poser · Échap : catalogue</div>`;
    bar.querySelector('[data-c]').onclick = (e) => { e.stopPropagation(); if (!occupe) { occupe = true; catalogue().finally(() => { occupe = false; }); } };
    bar.querySelector('[data-r]').onclick = (e) => { e.stopPropagation(); retirer = !retirer; majBar(); };
    bar.querySelector('[data-f]').onclick = (e) => { e.stopPropagation(); fermer(); };
  };
  let occupe = false;
  majBar();
  const cv = game.view.renderer.domElement, ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const cadre = () => {
    const cam = game.view.camera, r = cv.getBoundingClientRect();
    const pt = (x, z) => { const v = new THREE.Vector3(x, 0, z).project(cam); return `${r.left + (v.x + 1) / 2 * r.width},${r.top + (1 - v.y) / 2 * r.height}`; };
    const [w, h] = !retirer && art.b ? [art.taille[0], art.taille[1] + 1] : [1, 1];
    poly.setAttribute('points', [pt(p.x, p.y), pt(p.x + w, p.y), pt(p.x + w, p.y + h), pt(p.x, p.y + h)].join(' '));
    poly.setAttribute('class', retirer ? 'ret' : posable({ a: art.id, x: p.x, y: p.y }, d.travaux, art) && !bloque(art) && assez(d.mat, art.cout) ? '' : 'non');
  };
  let raf = requestAnimationFrame(function f() { cadre(); raf = requestAnimationFrame(f); });

  const remettre = () => { refaire(game); game.busy = true; };
  const poser = async () => {
    const T0 = d.travaux;
    if (retirer) {
      // le dernier travail qui touche cette case : la moitié des matériaux revient
      for (let i = T0.length - 1; i >= 0; i--) if (emprise(T0[i]).some(([x, y]) => x === p.x && y === p.y)) {
        const a = ARTICLE[T0[i].a]; T0.splice(i, 1);
        for (const [k, v] of Object.entries(a?.cout || {})) d.mat[k] = (d.mat[k] || 0) + Math.floor(v / 2);
        game.sound.sfx('cancel'); remettre(); majBar(); return;
      }
      game.sound.sfx('bump'); return;
    }
    const trav = { a: art.id, x: p.x, y: p.y };
    if (bloque(art)) { game.sound.sfx('bump'); ui.toast(`Il faut le talent « ${TALENTS[art.talent].nom} » (${TALENTS[art.talent].de})`); return; }
    if (!caseLibre(p.x, p.y) || !posable(trav, T0, art)) { game.sound.sfx('bump'); ui.toast('Impossible ici'); return; }
    if (game.mapObj.objectAt(p.x, p.y)?.recolte) { game.sound.sfx('bump'); ui.toast('Récolte d\'abord ce qui pousse là'); return; }
    if (!assez(d.mat, art.cout)) { game.sound.sfx('bump'); ui.toast(`Il faut ${coutTexte(art.cout)}`); return; }
    if (art.t != null) {
      const der = [...T0].reverse().find((t) => t.x === p.x && t.y === p.y && ARTICLE[t.a]?.t != null);
      if (der?.a === art.id) return;
    }
    if (art.b) {
      const toit = await ui.list({ title: 'Couleur du toit', items: TOITS.map((t) => ({ label: t })), cls: 'shop', cancel: -1 }); if (toit < 0) return;
      trav.toit = TOITS[toit]; trav.nom = art.nom;
      if (!(await ui.yesNo(`Construire : ${art.nom} pour ${coutTexte(art.cout)} ?`))) return;
    } else if (art.s) {
      trav.texte = (await ui.nameEntry('Texte du panneau', d.nom.toUpperCase())) || 'PANNEAU';
    } else if (art.n) {
      const c = compter(game.mapObj), habitants = T0.filter((t) => ARTICLE[t.a]?.n).length;
      if (habitants >= c.maisons) { game.sound.sfx('bump'); ui.toast('Il faut une maison libre pour chaque habitant'); return; }
      const k = await ui.list({ title: 'Qui inviter ?', items: HABITANTS.map((h) => ({ label: h.replace('_', ' ') })), cls: 'shop', cancel: -1 }); if (k < 0) return;
      d.hab = (d.hab || 0) + 1; trav.k = d.hab; trav.sprite = HABITANTS[k];
    }
    for (const [k, v] of Object.entries(art.cout || {})) d.mat[k] -= v;
    T0.push(trav); game.sound.sfx(art.b ? 'levelup' : 'select');
    remettre(); majBar();
  };
  const catalogue = async () => {
    const cats = [...new Set(CATALOGUE.map((c) => c.cat))];
    const c = await ui.list({ title: 'Catalogue', items: cats.map((k) => ({ label: k })).concat([{ label: '🧹 Retirer un élément' }, { label: '✔ Terminer les travaux' }]), cls: 'shop', cancel: -1 });
    if (c < 0) return;
    if (c === cats.length) { retirer = true; majBar(); return; }
    if (c === cats.length + 1) { fermer(); return; }
    const L = CATALOGUE.filter((a) => a.cat === cats[c]);
    const i = await ui.list({ title: cats[c], items: L.map((a) => ({ label: (bloque(a) ? '🔒 ' : '') + a.nom, right: bloque(a) ? `talent de ${TALENTS[a.talent].de}` : coutTexte(a.cout) })), cls: 'shop', cancel: -1 });
    if (i < 0) return;
    if (bloque(L[i])) { await ui.say(`Pour ça, il faut le talent « ${TALENTS[L[i].talent].nom} ». ${TALENTS[L[i].talent].de} te l'apprendra quand il viendra vivre ici.`); return; }
    art = L[i]; retirer = false; majBar();
  };
  const pop = game.input.push((k) => {
    if (occupe) return;
    const dd = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k];
    if (dd) { p.x = Math.max(1, Math.min(m0.w - 2, p.x + dd[0])); p.y = Math.max(1, Math.min(m0.h - 2, p.y + dd[1])); p.dir = k; return; }
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
