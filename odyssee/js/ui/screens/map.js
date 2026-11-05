// odyssee/js/ui/screens/map.js — carte de la région (C-Gear)
import { el, esc } from '../ui.js';
import { levelCap, GYM_CAPS } from '../../core/mon.js';
import { BADGES, LEADERS } from '../../world/region.js';
import { ASSETS } from '../../assets.js';
import { SPRITES } from '../../data/sprites.js';
import { T, walkable } from '../../world/tiles.js';
import { TYPE_FR, screen, closer } from './common.js';

/* ================= CARTE DE LA RÉGION ================= */
// La carte se dévoile au fil du voyage : seules les zones parcourues sont dessinées, le reste n'est qu'une étendue
// verte ; le cadre est zoomé sur ce qu'on connaît et s'élargit à mesure qu'on avance.
/** carte de la région, dessinée comme le Pokégear de HeartGold / SoulSilver : mer en trois bleus, côtes en falaises,
 *  plaines et forêts, montagnes en paliers, routes blanches cerclées de gris, villes en pastilles rouges.
 *  Un pixel = une case ; le relief est posé par blocs de 2 × 2 cases, comme les pixels doublés du DS. */
const B2W2_PALETTE = {
  open: [20, 68, 108], far: [14, 50, 84], deep: [10, 36, 62], foam: [0, 224, 255],
  flat: [60, 164, 116], shadow: [40, 126, 86], cliff: [168, 122, 88],
  top: [238, 180, 136], vhigh: [214, 158, 116], high: [188, 140, 100], low: [156, 122, 84],
  ink: '#0b1c2d', road: '#e0f4ff', town: '#ef4444', townDark: '#991b1b', special: '#00e0ff', water: '#185a9d',
};
const HG = B2W2_PALETTE;
let carteIcons = null;
function loadCarteIcons() {
  if (carteIcons) return carteIcons;
  carteIcons = {};
  for (const k of SPRITES.carte || []) { const im = new Image(); im.src = ASSETS.carte(k); carteIcons[k] = im; }
  return carteIcons;
}
/** relief de la région, une case = un pixel (gardé en cache : la carte ne change pas) */
function regionTerrain(game) {
  if (game._regionTerrain) return game._regionTerrain;
  const W = game.world.maps.monde, w = W.w, h = W.h, B = 2;
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  // nature de chaque bloc de 2 × 2 cases
  // 0 eau, 1 plaine, 2 forêt, 3 montagne, 4 pied de montagne (sol praticable des zones volcaniques et enneigées)
  const kind = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let water = 0, walk = 0, roc = 0;
    for (let dy = 0; dy < B; dy++) for (let dx = 0; dx < B; dx++) {
      const t = W.get(bx * B + dx, by * B + dy);
      if (t === T.WATER || t === T.WHIRL) water++; else if (walkable(t) || t === T.DOOR) walk++; else if (t === T.CAVEWALL) roc++;
    }
    const th = W.zoneAt(bx * B, by * B)?.theme, hill = th === 'volcanic' || th === 'snow';
    // la roche des massifs (Chaîne Céleste, mesas, canyon) est dessinée en montagne, comme les reliefs des îles
    kind[by * bw + bx] = water >= 2 ? 0 : walk ? (hill ? 4 : 1) : hill || roc >= 2 ? 3 : 2;
  }
  // distance de chaque bloc à la nature voisine (pour la mer : à la côte ; pour la montagne : au pied)
  const dist = (pred) => {
    const d = new Int16Array(bw * bh).fill(99), q = [];
    for (let i = 0; i < d.length; i++) if (pred(kind[i])) { d[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % bw, y = (i / bw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue; const j = ny * bw + nx; if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); } }
    }
    return d;
  };
  const toLand = dist((k) => k !== 0), toFoot = dist((k) => k !== 3), toOpen = dist((k) => k === 1 || k === 4 || k === 0);
  const c0 = document.createElement('canvas'); c0.width = w; c0.height = h;
  const ctx = c0.getContext('2d'), img = ctx.createImageData(w, h);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const i = by * bw + bx, k = kind[i];
    let c;
    if (k === 0) c = toLand[i] <= 1 ? HG.deep : toLand[i] <= 3 ? HG.far : (bx + by * 3) % 11 === 0 ? HG.foam : HG.open;
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => bx + dx >= 0 && by + dy >= 0 && bx + dx < bw && by + dy < bh && kind[(by + dy) * bw + bx + dx] === 0)) c = HG.cliff;
    else if (k === 3) { const d = toFoot[i]; c = d <= 1 ? HG.low : d <= 2 ? HG.high : d <= 4 ? HG.vhigh : HG.top; }
    else if (k === 4) c = HG.low;
    else c = k === 2 && toOpen[i] >= 2 ? HG.shadow : HG.flat;
    for (let dy = 0; dy < B; dy++) for (let dx = 0; dx < B; dx++) {
      const x = bx * B + dx, y = by * B + dy; if (x >= w || y >= h) continue;
      const o = (y * w + x) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return (game._regionTerrain = { canvas: c0, kind, bw, bh, toOpen, toFoot, B });
}

/** cadre de la carte : ce qu'on a exploré (plus une marge), jamais plus petit qu'un tiers de la région ;
 *  il s'adapte au ratio de l'écran (par défaut 16/10) et s'élargit à mesure qu'on avance */
export function exploredView(game, targetAspect) {
  const W = game.world.maps.monde, C = 8, cw = Math.ceil(W.w / C), seen = game.state.explored || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of seen) { const cx = i % cw, cy = Math.floor(i / cw); x0 = Math.min(x0, cx * C); y0 = Math.min(y0, cy * C); x1 = Math.max(x1, cx * C + C); y1 = Math.max(y1, cy * C + C); }
  const p = game.worldPos(); if (!isFinite(x0)) { x0 = p.x - 20; x1 = p.x + 20; y0 = p.y - 15; y1 = p.y + 15; }
  const M = 16, ar = targetAspect || (16 / 10);
  x0 -= M; y0 -= M; x1 += M; y1 += M;
  let w = Math.max(x1 - x0, 80), h = Math.max(y1 - y0, 50);
  if (w / h > ar) h = w / ar; else w = h * ar;
  w = Math.min(w, W.w); h = Math.min(h, W.h);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const x = Math.max(0, Math.min(W.w - w, cx - w / 2)), y = Math.max(0, Math.min(W.h - h, cy - h / 2));
  return { x, y, w, h };
}

/** direction cardinale d'un écart (dx, dy) en cases ; '' quand on y est déjà */
export function cardinalDir(dx, dy) {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return '';
  if (Math.abs(dy) > Math.abs(dx) * 2) return dy < 0 ? 'Nord' : 'Sud';
  if (Math.abs(dx) > Math.abs(dy) * 2) return dx < 0 ? 'Ouest' : 'Est';
  return (dy < 0 ? 'Nord-' : 'Sud-') + (dx < 0 ? 'Ouest' : 'Est');
}
const distLabel = (dx, dy) => {
  const d = Math.round(Math.hypot(dx, dy)), dir = cardinalDir(dx, dy);
  return dir ? `À ~${d} pas au ${dir}` : 'Vous y êtes';
};

/** même taille que la vue explorée, mais centrée sur le joueur (bornée à la région) */
export function playerView(game, targetAspect) {
  const W = game.world.maps.monde, v = exploredView(game, targetAspect), p = game.worldPos();
  const x = Math.max(0, Math.min(W.w - v.w, p.x - v.w / 2)), y = Math.max(0, Math.min(W.h - v.h, p.y - v.h / 2));
  return { x, y, w: v.w, h: v.h };
}

/** vue régionale complète de l'archipel d'Odyssée */
export function fullRegionView(game, targetAspect) {
  const W = game.world.maps.monde;
  const ar = targetAspect || (16 / 10);
  let w = W.w, h = W.h;
  if (w / h > ar) h = w / ar; else w = h * ar;
  const x = Math.max(0, (W.w - w) / 2), y = Math.max(0, (W.h - h) / 2);
  return { x, y, w, h };
}

/** dessine la région dans le cadre v (en cases) : relief, routes, villes, et voile radar C-Gear */
function drawRegion(game, cv, v) {
  const W = game.world.maps.monde, ctx = cv.getContext('2d'), R = regionTerrain(game);
  const sx = cv.width / v.w, sy = cv.height / v.h;
  const X = (x) => (x - v.x) * sx, Y = (y) => (y - v.y) * sy;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#060c18'; ctx.fillRect(0, 0, cv.width, cv.height);

  // Découpage sécurisé du canvas de terrain de la région
  const sx0 = Math.max(0, Math.min(W.w, Math.floor(v.x)));
  const sy0 = Math.max(0, Math.min(W.h, Math.floor(v.y)));
  const sw = Math.min(W.w - sx0, Math.ceil(v.w));
  const sh = Math.min(W.h - sy0, Math.ceil(v.h));
  if (sw > 0 && sh > 0) {
    ctx.drawImage(R.canvas, sx0, sy0, sw, sh, X(sx0), Y(sy0), sw * sx, sh * sy);
  }

  // icônes du Pokégear : grandeur fixe à l'écran (deux pixels par pixel d'icône quand la carte est zoomée)
  const k = Math.max(1, Math.min(3, Math.round(sx / 2.2)));
  const I = loadCarteIcons();
  const icon = (key, x, y) => { const im = I[key]; if (im && im.complete && im.naturalWidth) ctx.drawImage(im, Math.round(X(x) - im.width * k / 2), Math.round(Y(y) - im.height * k + 2 * k), im.width * k, im.height * k); };
  const { kind, bw, toOpen, toFoot, B } = R;
  const step = Math.max(14, Math.round(22 * 2.2 / sx * k));
  for (let y = 10; y < W.h - 6; y += step) for (let x = 10; x < W.w - 6; x += step) {
    const jx = x + ((x * 7 + y * 13) % 9) - 4, jy = y + ((x * 11 + y * 5) % 9) - 4;
    if (jx < v.x - 10 || jx > v.x + v.w + 10 || jy < v.y - 10 || jy > v.y + v.h + 14) continue;
    const i = Math.floor(jy / B) * bw + Math.floor(jx / B), kk = kind[i];
    if (kk === 2 && toOpen[i] >= 4 && ((x + y) / step | 0) % 2 === 0) icon((jx * 5 + jy) % 7 ? 'arbre_v' : 'arbre_o', jx, jy);
    else if (kk === 3 && toFoot[i] >= 3) icon((jx * 3 + jy) % 2 ? 'montagne' : 'colline', jx, jy);
  }

  // routes : un trait blanc cerclé de gris
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const roads = (game.world.routes || []).map((r) => r.pts);
  for (const [lw, col] of [[Math.max(4, sx * 1.9), HG.ink], [Math.max(2, sx * 1.1), HG.road]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    for (const pts of roads) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x + 0.5), Y(y + 0.5)) : ctx.moveTo(X(x + 0.5), Y(y + 0.5)))); ctx.stroke(); }
  }
  for (const b of W.buildings) if (b.kind === 'cave') icon('grotte_m', b.x + b.w / 2, b.y + b.d);
  const pill = (x, y, pw, ph, fill, dark) => {
    pw *= k; ph *= k; x = Math.round(X(x) - pw / 2); y = Math.round(Y(y) - ph / 2);
    ctx.fillStyle = HG.ink; ctx.fillRect(x - k, y, pw + 2 * k, ph); ctx.fillRect(x, y - k, pw, ph + 2 * k);
    ctx.fillStyle = fill; ctx.fillRect(x, y, pw, ph);
    if (dark) { ctx.fillStyle = dark; ctx.fillRect(x, y + Math.ceil(ph * 0.55), pw, Math.floor(ph * 0.45)); }
  };
  for (const m of Object.values(game.world.maps)) if (m !== W && m.outdoor && m.outside?.map === 'monde' && m.id !== 'magma') pill(m.outside.x, m.outside.y, 6, 6, HG.special);
  const visited = new Set(game.state.visited || []);
  for (const t of Object.values(game.world.towns)) {
    const isGym = t.gym != null;
    const isLigue = t.id === 'plateau';
    const big = isGym || isLigue;
    const isVis = visited.has(t.id);
    const fillCol = isLigue ? (isVis ? '#a855f7' : '#7e22ce') : isGym ? (isVis ? '#fbbf24' : '#d97706') : (isVis ? '#ef4444' : '#64748b');
    const darkCol = isLigue ? '#4c1d95' : isGym ? '#92400e' : (isVis ? '#991b1b' : '#334155');
    pill(t.x + t.w / 2, t.y + t.h / 2, big ? 14 : 10, big ? 10 : 8, fillCol, darkCol);
  }

  // Voile radar B2W2 : les zones explorées sont découpées et 100% nettes et vives,
  // les zones inexplorées restent sous un élégant filtre radar semi-transparent C-Gear
  const seen = game.state.explored || [], C = 8, cw = Math.ceil(W.w / C), ch = Math.ceil(W.h / C);
  // le masque ne change que quand on explore : on le garde tant que la liste n'a pas bougé
  let FM = game._fogMask;
  if (!FM || FM.n !== seen.length || FM.cw !== cw) {
    const mask = document.createElement('canvas'); mask.width = cw; mask.height = ch;
    const mx = mask.getContext('2d'), md = mx.createImageData(cw, ch);
    for (const i of seen) if (i >= 0 && i < cw * ch) md.data[i * 4 + 3] = 255;
    mx.putImageData(md, 0, 0);
    FM = game._fogMask = { mask, n: seen.length, cw, fog: FM?.fog || document.createElement('canvas') };
  }
  const mask = FM.mask, fog = FM.fog;
  if (fog.width !== cv.width || fog.height !== cv.height) { fog.width = cv.width; fog.height = cv.height; }
  const fx = fog.getContext('2d');
  fx.globalCompositeOperation = 'source-over'; fx.clearRect(0, 0, fog.width, fog.height);
  fx.fillStyle = 'rgba(6, 12, 22, 0.72)';
  fx.fillRect(0, 0, fog.width, fog.height);
  fx.globalCompositeOperation = 'destination-out';
  fx.imageSmoothingEnabled = true;
  fx.filter = `blur(${Math.max(2, sx * 3.2)}px)`;
  fx.drawImage(mask, X(0), Y(0), cw * C * sx, ch * C * sy);
  fx.filter = 'none'; fx.globalCompositeOperation = 'source-over';
  ctx.drawImage(fog, 0, 0);
}

/** recadre une vue mémorisée au ratio voulu, autour de son centre */
function playerAspect(v, ar) {
  let w = v.w, h = v.h;
  if (w / h > ar) h = w / ar; else w = h * ar;
  return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
}

export function mapScreen(game) {
  const ui = game.ui, W = game.world.maps.monde, towns = game.world.towns, st = game.state;
  const allTowns = Object.values(towns);
  const visited = new Set(st.visited || []);
  return new Promise((resolve) => {
    const s = screen(ui, 'map-scr');
    const p = game.worldPos();
    const near = () => { let best = null, bd = 1e9; for (const r of game.world.routes || []) for (const [x, y] of r.pts) { const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = r.name; } } return best; };
    const here = game.mapObj === W && !W.zoneAt(p.x, p.y)?.name ? near() || game.locationName() : game.locationName();

    const spots = [{
      name: here,
      x: p.x,
      y: p.y,
      sub: 'Position actuelle du dresseur',
      tag: '',
      tagCls: 'here',
    }].concat(
      allTowns.filter((t) => visited.has(t.id)).map((t) => {
        const gIdx = t.gym;
        const hasGym = gIdx != null && LEADERS[gIdx];
        const gotBadge = hasGym && st.badges?.[gIdx];
        const leader = hasGym ? LEADERS[gIdx] : null;
        const badge = hasGym ? BADGES[gIdx] : null;
        const capLvl = hasGym ? GYM_CAPS[gIdx] : null;
        return {
          id: t.id,
          name: t.name,
          x: t.x + t.w / 2,
          y: t.y + t.h / 2,
          sub: hasGym
            ? `Champion : ${leader.name}, type ${TYPE_FR[leader.type] || leader.type}${gotBadge ? ' · ' + badge.name + ' obtenu' : ` · niveau max avant l'arène : ${capLvl}`}`
            : t.id === 'plateau'
              ? 'Le Conseil 4 et la Maître de la Ligue'
              : 'Centre de soins',
          tag: hasGym ? (gotBadge ? 'Badge obtenu ✓' : `Arène ${gIdx + 1}`) : t.id === 'plateau' ? 'Ligue' : '',
          tagCls: hasGym ? (gotBadge ? 'badge-ok' : 'gym') : t.id === 'plateau' ? 'league' : 'town',
        };
      })
    );

    s.innerHTML = `
      <!-- Fond et Châssis C-Gear B2W2 Nanobanana (sans fausses cartes ni texte intrusif) -->
      <img class="map-pixelart-bg" src="${ASSETS.carteBg}" alt="">
      <div class="map-scanlines"></div>

      <!-- En-tête C-Gear B2W2 -->
      <div class="map-b2w2-hdr">
        <div class="map-hdr-left">
          <div class="map-cgear-icon"></div>
          <div class="map-hdr-titles">
            <span class="map-hdr-main">CARTE DE LA RÉGION D'ODYSSÉE</span>
            <span class="map-hdr-sub">${visited.size} / ${allTowns.length} villes découvertes</span>
          </div>
        </div>
        <div class="map-hdr-right">
          <span class="map-cap-pill">Niveau max : <b>N.${game.levelCap ? game.levelCap() : levelCap(st.badges)}</b></span>
          <button type="button" class="map-close-btn" data-act="close" title="Fermer (Échap)">FERMER ✕</button>
        </div>
      </div>

      <!-- Barre de localisation GPS en direct -->
      <div class="map-gps-bar">
        <div class="map-gps-left">
          <span class="map-gps-dot"></span>
          <span class="map-gps-title">Tu es ici :</span>
          <span class="map-gps-loc">${esc(here)}</span>
        </div>
        <div class="map-gps-right">
          <button type="button" class="map-ctrl-btn" data-act="me" title="Centrer la carte sur ma position (Espace / Entrée)">⌖ Ma position</button>
          <button type="button" class="map-ctrl-btn" data-act="toggle-view" title="Basculer entre vue zoomée et vue de la région">🗺️ Toute la région</button>
        </div>
      </div>

      <!-- Cadre Écran Cartographique Central Grand Écran B2W2 -->
      <div class="map-stage">
        <div class="map-wrap">
          <canvas class="mapcv"></canvas>
          <div class="map-labels"></div>
          <div class="map-corner tl"></div><div class="map-corner tr"></div>
          <div class="map-corner bl"></div><div class="map-corner br"></div>
        </div>
      </div>

      <!-- Panneau Inférieur Tactile B2W2 -->
      <div class="map-footer">
        <button type="button" class="map-nav-btn prev" data-act="prev" title="Lieu précédent (◀ ou Flèche Gauche)">
          <span class="map-btn-arr">◀</span> Précédent
        </button>
        <div class="map-info">
          <div class="map-info-top">
            <span class="map-where"></span>
            <span class="map-tag"></span>
          </div>
          <div class="map-sub"></div>
        </div>
        <button type="button" class="map-nav-btn next" data-act="next" title="Lieu suivant (▶ ou Flèche Droite)">
          Suivant <span class="map-btn-arr">▶</span>
        </button>
        <div class="map-legend">
          <span><i class="lg-dot me"></i> Vous</span>
          <span><i class="lg-dot town"></i> Ville</span>
          <span><i class="lg-dot gym"></i> Arène</span>
          <span><i class="lg-dot league"></i> Ligue</span>
        </div>
      </div>`;

    const c = s.querySelector('.mapcv');
    const lab = s.querySelector('.map-labels');
    const whereEl = s.querySelector('.map-where');
    const tagEl = s.querySelector('.map-tag');
    const subEl = s.querySelector('.map-sub');

    let isFullRegion = false, animId = 0;
    let view;
    const aspectNow = () => (c.width > 0 && c.height > 0 ? c.width / c.height : 16 / 10);
    const fit = () => {
      const r = c.getBoundingClientRect();
      const w = Math.max(320, Math.round(r.width * (window.devicePixelRatio || 1)));
      const h = Math.max(200, Math.round(r.height * (window.devicePixelRatio || 1)));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    };
    const place = (node, x, y) => {
      node.style.left = ((x - view.x) / view.w * 100) + '%';
      node.style.top = ((y - view.y) / view.h * 100) + '%';
    };
    const pinsAt = [];
    const draw = () => {
      if (!s.isConnected) return;
      fit();
      drawRegion(game, c, view);
      for (const [node, x, y] of pinsAt) place(node, x, y);
    };
    // la vue prend le ratio réel du canvas (sinon la carte est étirée hors 16/10)
    fit();
    const target = exploredView(game, aspectNow());
    const from = st.mapView && st.mapView.w ? playerAspect(st.mapView, aspectNow()) : target;
    view = { ...from };
    draw();
    Object.values(loadCarteIcons()).forEach((im) => { if (!im.complete) im.onload = draw; });

    if (Math.abs(from.w - target.w) > 0.5 || Math.abs(from.x - target.x) > 0.5 || Math.abs(from.y - target.y) > 0.5) {
      const id0 = animId;
      setTimeout(() => { if (animId === id0) animateTo(target, 900); }, 200);   // sauf si le joueur a déjà bougé la vue
    }
    st.mapView = target;

    // Balise Joueur "VOUS ÊTES ICI" interactive avec double halo radar
    const me = el('div', 'map-me');
    me.innerHTML = `
      <div class="map-me-radar-outer"></div>
      <div class="map-me-radar"></div>
      <div class="map-me-core"></div>
      <div class="map-me-tag">Toi</div>
    `;
    me.title = `Votre position : ${here} [${Math.round(p.x)}, ${Math.round(p.y)}]`;
    me.addEventListener('click', (e) => {
      e.stopPropagation();
      k = 0;
      ui.sound.sfx('blip');
      show();
    });
    pinsAt.push([me, p.x, p.y]); place(me, p.x, p.y);
    lab.appendChild(me);

    // Points d'intérêt des villes & arènes visitées
    spots.forEach((sp, idx) => {
      if (idx === 0) return;
      const pin = el('button', 'map-pin ' + (sp.tagCls || ''));
      pin.type = 'button';
      pinsAt.push([pin, sp.x, sp.y]); place(pin, sp.x, sp.y);
      pin.title = sp.name;
      pin.innerHTML = sp.tagCls?.includes('gym') ? '★' : sp.tagCls?.includes('badge-ok') ? '✓' : sp.tagCls?.includes('league') ? '👑' : '●';
      // le nom de la ville à côté du repère : on s'y retrouve sans cliquer partout
      // (à côté du repère, pas dedans : le repère découpe tout ce qui dépasse de sa forme)
      const nm = el('span', 'map-pin-name'); nm.textContent = sp.name; lab.appendChild(nm); pinsAt.push([nm, sp.x, sp.y]); place(nm, sp.x, sp.y);
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        k = idx;
        ui.sound.sfx('blip');
        show();
      });
      lab.appendChild(pin);
    });

    // Viseur / Réticule de ciblage B2W2
    const cur = el('div', 'map-cur');
    cur.innerHTML = `
      <div class="map-cur-bracket tl"></div>
      <div class="map-cur-bracket tr"></div>
      <div class="map-cur-bracket bl"></div>
      <div class="map-cur-bracket br"></div>
      <div class="map-cur-crosshair"></div>
    `;
    lab.appendChild(cur);
    const curAt = [cur, p.x, p.y]; pinsAt.push(curAt);

    let k = 0;
    const show = () => {
      const q = spots[k];
      curAt[1] = q.x; curAt[2] = q.y; place(cur, q.x, q.y);
      whereEl.textContent = q.name;
      tagEl.textContent = q.tag || '';
      tagEl.className = 'map-tag ' + (q.tagCls || '');
      
      if (k === 0) {
        subEl.textContent = 'Tu es ici.';
      } else {
        subEl.innerHTML = `${esc(q.sub || '')} <span class="map-sub-dist">· ${distLabel(q.x - p.x, q.y - p.y)}</span>`;
      }
    };
    show();

    // Clic n'importe où sur la carte : Waypoint GPS interactif
    c.addEventListener('click', (e) => {
      const rect = c.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / rect.width;
      const clickY = (e.clientY - rect.top) / rect.height;
      const worldX = Math.round(view.x + clickX * view.w);
      const worldY = Math.round(view.y + clickY * view.h);

      // rayon de prise : ~22 px à l'écran, quel que soit le zoom
      let nearestIdx = -1, nearestDist = Math.max(3, 22 / rect.width * view.w);
      spots.forEach((sp, i) => {
        const d = Math.hypot(sp.x - worldX, sp.y - worldY);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      });

      if (nearestIdx >= 0) {
        k = nearestIdx;
        ui.sound.sfx('blip');
        show();
      } else {
        ui.sound.sfx('select');
        curAt[1] = worldX; curAt[2] = worldY; place(cur, worldX, worldY);
        whereEl.textContent = 'Repère';
        tagEl.textContent = '';
        tagEl.className = 'map-tag waypoint';
        subEl.innerHTML = `Repère temporaire posé sur la carte <span class="map-sub-dist">· ${distLabel(worldX - p.x, worldY - p.y)}</span>`;
      }
    });

    const animateTo = (nextTarget, D) => {
      const startView = { ...view }, t0 = performance.now(), id = ++animId;
      const anim = () => {
        if (!s.isConnected || id !== animId) return;   // une nouvelle animation remplace l'ancienne
        const u = Math.min(1, (performance.now() - t0) / D), e = 1 - Math.pow(1 - u, 3);
        for (const prop of ['x', 'y', 'w', 'h']) view[prop] = startView[prop] + (nextTarget[prop] - startView[prop]) * e;
        draw();
        if (u < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    };
    const toggleView = () => {
      isFullRegion = !isFullRegion;
      animateTo(isFullRegion ? fullRegionView(game, aspectNow()) : exploredView(game, aspectNow()), 450);
      const zoomBtn = s.querySelector('[data-act="toggle-view"]');
      if (zoomBtn) zoomBtn.textContent = isFullRegion ? '🔍 Autour de moi' : '🗺️ Toute la région';
      ui.sound.sfx('blip');
    };

    const centerOnPlayer = () => {
      k = 0;
      ui.sound.sfx('select');
      show();
      isFullRegion = false;
      const zoomBtn = s.querySelector('[data-act="toggle-view"]');
      if (zoomBtn) zoomBtn.textContent = '🗺️ Toute la région';
      animateTo(playerView(game, aspectNow()), 350);
    };

    const close = closer(ui, s, () => pop, resolve);
    s.querySelector('[data-act="close"]')?.addEventListener('click', close);
    s.querySelector('[data-act="me"]')?.addEventListener('click', centerOnPlayer);
    s.querySelector('[data-act="toggle-view"]')?.addEventListener('click', toggleView);
    s.querySelector('[data-act="prev"]')?.addEventListener('click', () => {
      k = (k + spots.length - 1) % spots.length;
      ui.sound.sfx('blip');
      show();
    });
    s.querySelector('[data-act="next"]')?.addEventListener('click', () => {
      k = (k + 1) % spots.length;
      ui.sound.sfx('blip');
      show();
    });

    const pop = ui.input.push((key) => {
      if (key === 'left' || key === 'up') { k = (k + spots.length - 1) % spots.length; ui.sound.sfx('blip'); show(); return; }
      if (key === 'right' || key === 'down') { k = (k + 1) % spots.length; ui.sound.sfx('blip'); show(); return; }
      // Espace / Entrée (« a ») : recentrer sur le joueur, sans jamais fermer
      if (key === 'a') { centerOnPlayer(); return; }
      if (key === 'b' || key === 'map') close();   // C rouvre / referme la carte, comme en jeu
    });
  });
}
