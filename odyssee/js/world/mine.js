// odyssee/js/world/mine.js — la mine de Pierrefort, au nord de la ville minière, creusée dans le Mont Pierrefort.
// Trois niveaux reliés par des échelles : galeries étayées, rails et wagonnets, lanternes de mineur, filons de minerai.
// Au fond (derrière un éboulement qu'on dégage avec Force), le dernier filon garde un fossile que le paléontologue
// installé à l'entrée sait ranimer. Quête : flags['Q:mine'] (1 puis 'fin'), lue par le journal. Sans DOM.
import { T } from './tiles.js';
import { GameMap } from './mapgen.js';
import { ITEMS } from '../core/items.js';
import { massif, polygone } from './relief.js';

Object.assign(ITEMS, {
  'fossile-dome': { pocket: 'cles', price: 0, key: true, icon: 'dome-fossil', name: 'Fossile Dôme', desc: 'Un fossile en forme de dôme, trouvé au fond de la mine de Pierrefort. Un Pokémon très ancien y dort.' },
});

/** une galerie de mine vide (roche partout), sol de grotte brun */
function niveau(id, w, h, name, o = {}) {
  const m = new GameMap(id, w, h, { outdoor: false, fill: T.CAVEWALL, floor: 'cave', music: 'cave', name, battleBg: 'cave', dark: o.dark });
  m.edge = T.CAVEWALL; m.biome = 'terre';
  return m;
}
const creuse = (m, x0, y0, x1, y1) => m.rect(x0, y0, x1, y1, T.CAVE);
/** rails le long d'une ligne de cases */
const rails = (m, cells) => { m.rails ||= new Set(); for (const [x, y] of cells) m.rails.add(x + ',' + y); };
const ligne = (x0, y0, x1, y1) => { const out = []; for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y]); return out; };
/** cadre d'étayage en travers d'une galerie nord-sud de 3 cases (poteaux sur les côtés, on passe au milieu) */
function etai(m, cx, y) { m.deco.push({ k: 'etai', x: cx, y, dz: 0.7, w: 1 }); for (const x of [cx - 1, cx + 1]) { m.under.set(x + ',' + y, T.CAVE); m.set(x, y, T.BLOCK); } }
/** échelle vers un autre niveau : on y descend (ou monte) en marchant dessus */
function echelle(m, x, y, to, jour = false) { m.deco.push({ k: jour ? 'echelle_jour' : 'echelle', x, y }); m.warp(x, y, { ...to, step: true }); }

export function addMine({ W, maps, towns, trainerNpc, ENC }) {
  const C = towns.C, enc = ENC.grotte;
  /* ---------------- dehors : le chemin de la mine, au nord de Pierrefort ---------------- */
  const px = C.x + 16, py = C.y;   // colonne du chemin (entre la boutique et la Maison des Mineurs)
  W.rect(px, C.y - 6, px + 1, C.y + 9, T.PATH, [T.TREE, T.PINE, T.GRASS, T.FLOWER, T.TALL]);
  W.rect(px - 3, C.y - 7, px + 4, C.y - 4, T.GRASS, [T.TREE, T.PINE]); W.rect(px, C.y - 7, px + 1, C.y - 4, T.PATH);
  const porte = W.building('cave', px - 2, C.y - 10);
  massif(W, polygone([[C.x + 4, C.y - 24], [C.x + 30, C.y - 26], [C.x + 33, C.y - 14], [C.x + 26, C.y - 5], [C.x + 20, C.y - 8], [C.x + 12, C.y - 8], [C.x + 5, C.y - 4], [C.x + 1, C.y - 14]]));
  W.zone(C.x + 1, C.y - 26, C.x + 33, C.y - 4, { name: 'Mine de Pierrefort', music: 'route', theme: 'canyon', roche: 'terre', prio: 0 });
  W.sign(px + 3, C.y - 5, 'MINE DE PIERREFORT\nGaleries fermées au fond : éboulement.');
  W.prop('wagonnet', px - 3, C.y - 5); W.prop('lampe_mine', px - 1, C.y - 7); W.prop('caisses', px + 4, C.y - 6);

  /* ---------------- niveau 1 : les galeries hautes ---------------- */
  const m1 = niveau('mine1', 42, 30, 'Mine de Pierrefort — galeries hautes'); m1.encounter = enc;
  creuse(m1, 5, 5, 7, 27); creuse(m1, 5, 5, 37, 7);                       // galerie nord-sud, galerie est-ouest
  creuse(m1, 8, 15, 11, 17); creuse(m1, 12, 11, 21, 21);                 // chambre de l'ouest
  creuse(m1, 31, 8, 33, 13); creuse(m1, 25, 14, 37, 24);                 // chambre de l'est (l'échelle)
  rails(m1, [...ligne(6, 25, 6, 6), ...ligne(7, 6, 35, 6), ...ligne(32, 7, 32, 16)]);
  for (const y of [22, 16, 10]) etai(m1, 6, y);
  for (const x of [12, 18, 24, 30]) m1.prop('poteau', x, 5);
  m1.prop('wagonnet', 36, 6); m1.prop('wagonnet', 32, 17);
  for (const [x, y] of [[13, 12], [20, 12], [26, 15], [36, 15], [13, 20]]) m1.prop('lampe_mine', x, y);
  for (const [x, y] of [[15, 13], [18, 19], [21, 16], [28, 22], [35, 21]]) m1.prop('minerai', x, y);
  m1.set(6, 28, T.CAVEDOOR); m1.set(6, 29, T.CAVEWALL); creuse(m1, 6, 26, 6, 27);
  m1.deco.push({ k: 'exitlight', x: 6, y: 28 });
  m1.warp(6, 28, { map: 'monde', x: porte.doorX, y: porte.doorY + 1, dir: 'down' });
  W.warp(porte.doorX, porte.doorY, { map: 'mine1', x: 6, y: 27, dir: 'up' });
  m1.outside = { map: 'monde', x: porte.doorX, y: porte.doorY + 1 };
  trainerNpc(m1, 17, 13, 'down', 'Ouvrier', 'Firmin', [[74, 13], [66, 13], [1026, 14]], { sight: 3, intro: 'Hé, casque obligatoire ici ! ... Bon, un combat et on n\'en parle plus.' });
  trainerNpc(m1, 29, 18, 'left', 'Montagnard', 'Lazare', [[1024, 14], [95, 15]], { sight: 3 });
  m1.item(20, 20, 'escape-rope'); m1.item(37, 23, 'hard-stone');

  /* ---------------- niveau 2 : les galeries profondes (éboulement : Force) ---------------- */
  const m2 = niveau('mine2', 42, 30, 'Mine de Pierrefort — galeries profondes'); m2.encounter = enc;
  creuse(m2, 4, 4, 6, 25); creuse(m2, 4, 23, 34, 25);                    // galerie qui descend puis file à l'est
  creuse(m2, 7, 11, 9, 13); creuse(m2, 10, 8, 22, 16);                   // grande salle
  creuse(m2, 23, 12, 30, 12);                                            // boyau étroit, fermé par l'éboulement
  creuse(m2, 31, 6, 37, 16);                                             // salle du puits
  creuse(m2, 31, 21, 37, 25);                                            // cul-de-sac au bout des rails
  rails(m2, [...ligne(5, 6, 5, 24), ...ligne(6, 24, 33, 24)]);
  for (const y of [9, 15, 20]) etai(m2, 5, y);
  m2.set(25, 12, T.BOULDER); m2.set(28, 12, T.BOULDER);                 // l'éboulement
  m2.prop('wagonnet', 34, 24); m2.prop('wagonnet', 12, 9);
  for (const [x, y] of [[10, 8], [22, 8], [31, 7], [37, 16], [10, 16]]) m2.prop('lampe_mine', x, y);
  for (const [x, y] of [[14, 10], [19, 14], [33, 14], [36, 9], [20, 25]]) m2.prop('minerai', x, y);
  trainerNpc(m2, 16, 12, 'left', 'Ouvrier', 'Gédéon', [[75, 16], [1028, 16], [111, 17]], { sight: 3 });
  trainerNpc(m2, 28, 25, 'left', 'Montagnard', 'Hector', [[1026, 16], [74, 16], [95, 17]], { sight: 4, intro: 'Plus bas, c\'est l\'éboulement. Personne n\'y est retourné.' });
  m2.item(21, 15, 'super-potion', 2); m2.item(36, 25, 'great-ball', 3);
  echelle(m1, 35, 22, { map: 'mine2', x: 5, y: 5, dir: 'down' });
  echelle(m2, 5, 4, { map: 'mine1', x: 35, y: 21, dir: 'down' }, true);

  /* ---------------- niveau 3 : le dernier filon (dans le noir) ---------------- */
  const m3 = niveau('mine3', 34, 24, 'Mine de Pierrefort — dernier filon', { dark: true }); m3.encounter = enc;
  creuse(m3, 3, 3, 5, 12); creuse(m3, 3, 10, 18, 12); creuse(m3, 16, 6, 18, 18); creuse(m3, 16, 16, 30, 18); creuse(m3, 24, 13, 31, 21);
  rails(m3, [...ligne(4, 5, 4, 11), ...ligne(5, 11, 17, 11), ...ligne(17, 12, 17, 17), ...ligne(18, 17, 25, 17)]);
  for (const y of [8]) etai(m3, 4, y);
  m3.prop('wagonnet', 26, 17);
  for (const [x, y] of [[24, 13], [31, 13], [24, 21], [16, 6]]) m3.prop('lampe_mine', x, y);
  for (const [x, y] of [[27, 14], [30, 16], [28, 20], [25, 20], [18, 7], [12, 10]]) m3.prop('minerai', x, y);
  m3.item(29, 19, 'fossile-dome', 1, 'mine:fossile'); m3.item(13, 12, 'metal-coat'); m3.item(31, 21, 'rare-candy');
  echelle(m2, 36, 7, { map: 'mine3', x: 4, y: 4, dir: 'down' });
  echelle(m3, 4, 3, { map: 'mine2', x: 36, y: 8, dir: 'down' }, true);
  for (const m of [m1, m2, m3]) { m.townId = 'pierre'; maps[m.id] = m; }

  /* ---------------- le chef mineur et le paléontologue, à l'entrée ---------------- */
  W.npc({ id: 'mine:albin', x: px + 3, y: C.y - 7, sprite: 'montagnard', dir: 'left', talk: async (A) => {
    const s = A.step('mine'), who = 'Albin, chef mineur';
    if (s === 'fin') { await A.say(['La mine respire de nouveau. Merci, petit.', 'Basalte serait fier de voir quelqu\'un descendre aussi bas.'], who); return; }
    if (!s) {
      await A.say(['C\'est ici que Basalte a appris à lire la roche, avant de partir sur son île.', 'Un éboulement a fermé les galeries profondes. Mes gars y ont laissé une trouvaille : un fossile, pris dans le dernier filon.', 'Si ton Pokémon sait pousser les blocs, va donc voir en bas. Le Dr Silex, à côté, saura quoi en faire.'], who);
      await A.set('mine', 1); return;
    }
    await A.say(A.has('fossile-dome') ? 'Tu l\'as ! Montre-le donc au Dr Silex.' : 'Le fossile est tout au fond, au-delà de l\'éboulement. Prends de quoi t\'éclairer.', who);
  } });
  W.npc({ id: 'mine:silex', x: px - 2, y: C.y - 6, sprite: 'scientifique', dir: 'right', talk: async (A) => {
    const who = 'Dr Silex, paléontologue';
    if (A.step('mine') === 'fin') { await A.say('Prends soin de ton Kabuto. Il a quelques millions d\'années de retard à rattraper !', who); return; }
    if (!A.has('fossile-dome')) { await A.say(['Les fossiles de cette montagne sont d\'une qualité rare.', 'J\'ai de quoi ranimer un Pokémon fossile, si on m\'en rapporte un.'], who); return; }
    await A.say(['Un Fossile Dôme ! Et intact ! Laisse-moi faire...', '... ... ...', 'C\'est fait ! Le Pokémon du fossile est revenu à la vie !'], who);
    A.take('fossile-dome'); await A.giveMon(140, 20, { met: 'Mine de Pierrefort' });
    await A.set('mine', 'fin');
  } });
}
