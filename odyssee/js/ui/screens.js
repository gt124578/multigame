// odyssee/js/ui/screens.js — écrans plein cadre : équipe, résumé, sac, Pokédex, carte, carte de dresseur, boutique, PC, options
import { el, esc } from './ui.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { ITEMS, itemName, POCKETS, canUseOn } from '../core/items.js';
import { monName, expProgress, STAT_NAMES } from '../core/mon.js';
import { ASSETS } from '../assets.js';
import { T } from '../world/tiles.js';

export const TYPE_FR = { normal: 'Normal', fighting: 'Combat', flying: 'Vol', poison: 'Poison', ground: 'Sol', rock: 'Roche', bug: 'Insecte', ghost: 'Spectre', steel: 'Acier', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', psychic: 'Psy', ice: 'Glace', dragon: 'Dragon', dark: 'Ténèbres' };
export const TYPE_COL = { normal: '#a8a878', fighting: '#c03028', flying: '#a890f0', poison: '#a040a0', ground: '#e0c068', rock: '#b8a038', bug: '#a8b820', ghost: '#705898', steel: '#b8b8d0', fire: '#f08030', water: '#6890f0', grass: '#78c850', electric: '#f8d030', psychic: '#f85888', ice: '#98d8d8', dragon: '#7038f8', dark: '#705848' };
export const STATUS_FR = { par: ['PAR', '#e8c020'], slp: ['SOM', '#8890a0'], psn: ['PSN', '#a050b0'], tox: ['PSN', '#7a3090'], brn: ['BRÛ', '#e86030'], frz: ['GEL', '#60c0e8'] };
export const typeTag = (t) => `<span class="type" style="background:${TYPE_COL[t]}">${TYPE_FR[t]}</span>`;
export const hpCol = (r) => (r > 0.5 ? '#48d058' : r > 0.2 ? '#f0c020' : '#f04838');
export function hpBar(m) { const r = m.hp / m.stats[0]; return `<div class="hp"><b>PV</b><i><u style="width:${Math.max(0, r * 100)}%;background:${hpCol(r)}"></u></i></div>`; }
export const statusTag = (m) => (m.hp <= 0 ? '<span class="st" style="background:#c03838">K.O.</span>' : m.status ? `<span class="st" style="background:${STATUS_FR[m.status][1]}">${STATUS_FR[m.status][0]}</span>` : '');
const gender = (m) => (m.gender === 'm' ? '<span class="g m">♂</span>' : m.gender === 'f' ? '<span class="g f">♀</span>' : '');
const iconImg = (m) => `<img class="ico" src="${ASSETS.icon(m.sp)}" alt="" onerror="this.src='${ASSETS.front(m.sp)}';this.classList.add('fallback')">`;

function screen(ui, cls, title) {
  const s = el('div', 'screen ' + cls);
  if (title) s.appendChild(el('div', 'scr-title', esc(title)));
  ui.root.appendChild(s);
  return s;
}

/* ================= ÉQUIPE ================= */
/**
 * o.mode : 'menu' | 'pick' | 'battle' ; o.prompt ; o.filter(m) → texte d'interdiction ou null
 * renvoie l'index choisi (-1 si annulé)
 */
export function partyScreen(game, o = {}) {
  const ui = game.ui, party = game.state.party;
  return new Promise((resolve) => {
    const s = screen(ui, 'party-scr');
    const grid = el('div', 'pgrid'); s.appendChild(grid);
    const help = el('div', 'box phelp'); s.appendChild(help);
    const cancel = el('div', 'pcancel', 'RETOUR'); s.appendChild(cancel);
    let i = Math.min(o.start || 0, party.length - 1), swapFrom = -1, busy = false;
    const draw = () => {
      grid.innerHTML = '';
      party.forEach((m, k) => {
        const c = el('div', 'pslot' + (k === 0 ? ' lead' : '') + (m.hp <= 0 ? ' ko' : '') + (k === i ? ' on' : '') + (k === swapFrom ? ' swap' : ''));
        const why = o.filter ? o.filter(m, k) : null;
        c.innerHTML = `${iconImg(m)}<div class="pn">${esc(monName(m))}${gender(m)}</div><div class="pl">N.${m.lvl}</div>${statusTag(m)}${hpBar(m)}<div class="phpn">${m.hp}/${m.stats[0]}</div>${why ? `<div class="pwhy">${esc(why)}</div>` : ''}`;
        grid.appendChild(c);
      });
      for (let k = party.length; k < 6; k++) grid.appendChild(el('div', 'pslot empty'));
      cancel.classList.toggle('on', i === party.length);
      help.textContent = swapFrom >= 0 ? 'Avec quelle créature échanger sa place ?' : o.prompt || 'Choisis une créature.';
    };
    draw();
    const close = (v) => { pop(); s.remove(); resolve(v); };
    const pop = ui.input.push(async (k) => {
      if (busy) return;
      const n = party.length;
      if (k === 'up') i = i === n ? n - 1 : i - 2 >= 0 ? i - 2 : n;
      else if (k === 'down') i = i === n ? 0 : i + 2 < n ? i + 2 : n;
      else if (k === 'left') i = i === n ? n - 1 : i % 2 ? i - 1 : i;
      else if (k === 'right') i = i !== n && i % 2 === 0 && i + 1 < n ? i + 1 : i;
      else if (k === 'b') { if (swapFrom >= 0) { swapFrom = -1; draw(); return; } ui.sound.sfx('cancel'); close(-1); return; }
      else if (k === 'a') {
        if (i === n) { ui.sound.sfx('cancel'); close(-1); return; }
        ui.sound.sfx('select');
        if (swapFrom >= 0) { if (swapFrom !== i) { [party[swapFrom], party[i]] = [party[i], party[swapFrom]]; } swapFrom = -1; draw(); return; }
        const why = o.filter ? o.filter(party[i], i) : null;
        if (o.mode === 'pick') { if (why) { ui.sound.sfx('bump'); return; } close(i); return; }
        busy = true;
        const opts = o.mode === 'battle' ? ['Envoyer', 'Résumé', 'Annuler'] : ['Résumé', 'Déplacer', 'Annuler'];
        const r = await ui.list({ items: opts.map((label) => ({ label })), cls: 'psub', cancel: opts.length - 1, parent: s });
        busy = false;
        const pick = opts[r];
        if (pick === 'Résumé') { busy = true; i = await summaryScreen(game, party, i); busy = false; }
        else if (pick === 'Déplacer') swapFrom = i;
        else if (pick === 'Envoyer') { if (why) { ui.sound.sfx('bump'); await ui.say(why); } else { close(i); return; } }
        draw(); return;
      } else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}

/* ================= RÉSUMÉ ================= */
export function summaryScreen(game, list, idx) {
  const ui = game.ui;
  return new Promise((resolve) => {
    const s = screen(ui, 'sum-scr');
    let page = 0;
    const draw = () => {
      const m = list[idx], S = SPECIES[m.sp];
      const tabs = ['INFOS', 'STATS', 'ATTAQUES'].map((t, k) => `<span class="${k === page ? 'on' : ''}">${t}</span>`).join('');
      let body = '';
      if (page === 0) body = `<table class="kv"><tr><td>N° Pokédex</td><td>${String(m.sp).padStart(3, '0')}</td></tr><tr><td>Nom</td><td>${esc(S.n)}</td></tr><tr><td>Type</td><td>${S.t.map(typeTag).join(' ')}</td></tr><tr><td>D.O.</td><td>${esc(m.ot || game.state.name)}</td></tr><tr><td>Rencontré</td><td>${esc(m.met || '—')}</td></tr><tr><td>Exp.</td><td>${m.exp.toLocaleString('fr-FR')}</td></tr></table><div class="expline"><b>EXP</b><i><u style="width:${expProgress(m) * 100}%"></u></i></div><div class="dexline">${esc(S.genus || '')}</div>`;
      else if (page === 1) body = `<table class="kv stats">${STAT_NAMES.map((n, k) => `<tr><td>${n}</td><td>${k === 0 ? `${m.hp}/${m.stats[0]}` : m.stats[k]}</td><td><i class="sbar"><u style="width:${Math.min(100, S.b[k] / 1.6)}%"></u></i></td></tr>`).join('')}</table>`;
      else body = `<div class="moves">${m.moves.map((mv) => { const M = MOVES[mv.id]; return `<div class="mv" style="--tc:${TYPE_COL[M.t]}"><span class="mvn">${esc(M.n)}</span>${typeTag(M.t)}<span class="mvpp">PP ${mv.pp}/${M.pp}</span><span class="mvd">${M.c === 'status' ? 'Statut' : `Puiss. ${M.p || '—'}`} · Préc. ${M.a ?? '—'}</span></div>`; }).join('')}</div>`;
      s.innerHTML = `<div class="sum-left box"><div class="sum-head">${esc(monName(m))}${gender(m)} <span>N.${m.lvl}</span></div><img class="sum-spr" src="${ASSETS.front(m.sp, m.shiny)}" alt="">${statusTag(m)}${hpBar(m)}<div class="phpn">${m.hp}/${m.stats[0]}</div></div><div class="sum-right box"><div class="tabs">${tabs}</div>${body}</div><div class="sum-help">◀ ▶ pages · ▲ ▼ créature · Échap retour</div>`;
    };
    draw();
    const pop = ui.input.push((k) => {
      if (k === 'left') page = (page + 2) % 3; else if (k === 'right') page = (page + 1) % 3;
      else if (k === 'up') idx = (idx - 1 + list.length) % list.length; else if (k === 'down') idx = (idx + 1) % list.length;
      else if (k === 'b' || k === 'a') { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(idx); return; }
      else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}

/* ================= SAC ================= */
/** renvoie { item } choisi pour « Utiliser », ou null */
export function bagScreen(game, o = {}) {
  const ui = game.ui, bag = game.state.bag;
  return new Promise((resolve) => {
    const s = screen(ui, 'bag-scr');
    let pocket = o.pocket || 0, i = 0, busy = false;
    const entries = () => Object.keys(bag).filter((k) => ITEMS[k] && ITEMS[k].pocket === POCKETS[pocket][0] && bag[k] > 0).sort((a, b) => Object.keys(ITEMS).indexOf(a) - Object.keys(ITEMS).indexOf(b));
    const draw = () => {
      const es = entries(); if (i > es.length) i = es.length;
      const sel = es[i];
      s.innerHTML = `<div class="bag-left"><div class="bag-pic box"><div class="bag-icon b${pocket}"></div><div class="bag-pocket">◀ ${POCKETS[pocket][1]} ▶</div></div><div class="box bag-desc">${sel ? `<img class="itm-big" src="${ASSETS.item(sel)}" alt="">` + esc(ITEMS[sel].desc) : 'Fermer le Sac.'}</div></div><div class="box bag-list"><div class="list-items">${es.map((k, n) => `<div class="list-row ${n === i ? 'on' : ''}"><span class="cur">▶</span><img class="itm" src="${ASSETS.item(k)}" alt=""><span class="lbl">${esc(itemName(k))}</span><span class="rgt">× ${bag[k]}</span></div>`).join('')}<div class="list-row ${i === es.length ? 'on' : ''}"><span class="cur">▶</span><span class="lbl">FERMER</span></div></div></div>`;
      s.querySelector('.list-row.on')?.scrollIntoView({ block: 'nearest' });
    };
    draw();
    const close = (v) => { pop(); s.remove(); resolve(v); };
    const pop = ui.input.push(async (k) => {
      if (busy) return;
      const es = entries();
      if (k === 'left' || k === 'right') { pocket = (pocket + (k === 'left' ? POCKETS.length - 1 : 1)) % POCKETS.length; i = 0; ui.sound.sfx('blip'); draw(); return; }
      if (k === 'up') { i = (i - 1 + es.length + 1) % (es.length + 1); ui.sound.sfx('blip'); draw(); return; }
      if (k === 'down') { i = (i + 1) % (es.length + 1); ui.sound.sfx('blip'); draw(); return; }
      if (k === 'b') { ui.sound.sfx('cancel'); close(null); return; }
      if (k !== 'a') return;
      if (i === es.length) { ui.sound.sfx('cancel'); close(null); return; }
      ui.sound.sfx('select');
      const item = es[i], it = ITEMS[item];
      // les objets rares ne se jettent pas ; seuls ceux qui ont un usage hors combat s'utilisent
      const opts = o.battle ? ['Utiliser', 'Annuler'] : it.key ? ['Utiliser', 'Annuler'] : ['Utiliser', 'Jeter', 'Annuler'];
      busy = true;
      const r = await ui.list({ items: opts.map((label) => ({ label, disabled: label === 'Utiliser' && (o.battle ? !(it.heal || it.cure || it.revive || it.ball || it.pp || it.ppAll) : it.key && !it.field && item !== 'town-map') })), cls: 'psub', cancel: opts.length - 1, parent: s });
      busy = false;
      if (opts[r] === 'Utiliser') { close({ item }); return; }
      if (opts[r] === 'Jeter') {
        busy = true;
        const q = await ui.quantity(bag[item]);
        if (q && await ui.yesNo(`Jeter ${q} ${itemName(item)} ?`)) { bag[item] -= q; if (bag[item] <= 0) delete bag[item]; }
        busy = false;
      }
      draw();
    });
  });
}

/* ================= POKÉDEX ================= */
export function dexScreen(game) {
  const ui = game.ui, st = game.state;
  return new Promise((resolve) => {
    const s = screen(ui, 'dex-scr');
    // les créatures d'Odyssée d'abord (numéros 001 à 052), puis les Pokémon venus d'ailleurs
    const ids = Object.keys(SPECIES).map(Number).sort((a, b) => (a >= 1000) === (b >= 1000) ? a - b : a >= 1000 ? -1 : 1);
    const num = (id) => (SPECIES[id].no ? String(SPECIES[id].no).padStart(3, '0') : '#' + String(id).padStart(3, '0'));
    let i = 0;
    const seen = new Set(st.dex.seen), caught = new Set(st.dex.caught);
    s.innerHTML = `<div class="dex-left box"><img class="dex-spr" alt=""><div class="dex-info"></div></div><div class="dex-right box"><div class="dex-count">Vus : ${seen.size} · Capturés : ${caught.size}</div><div class="list-items dex-list"></div></div>`;
    const list = s.querySelector('.dex-list'), spr = s.querySelector('.dex-spr'), info = s.querySelector('.dex-info');
    list.innerHTML = ids.map((id) => `<div class="list-row" data-i="${id}"><span class="cur">▶</span><span class="dexn">${num(id)}</span><span class="lbl">${seen.has(id) ? esc(SPECIES[id].n) : '-----'}</span>${caught.has(id) ? '<span class="ball-mini"></span>' : ''}</div>`).join('');
    const rows = [...list.children];
    const draw = () => {
      rows.forEach((r, k) => r.classList.toggle('on', k === i)); rows[i].scrollIntoView({ block: 'nearest' });
      const id = ids[i], S = SPECIES[id];
      if (seen.has(id)) { spr.src = ASSETS.front(id); spr.style.visibility = ''; spr.classList.toggle('shadowed', !caught.has(id)); }
      else spr.style.visibility = 'hidden';
      info.innerHTML = caught.has(id) ? `<div class="dex-name">${num(id)} ${esc(S.n)}</div><div>${esc(S.genus || '')}</div><div>${S.t.map(typeTag).join(' ')}</div><div>Taille ${(S.h / 10).toLocaleString('fr-FR')} m · Poids ${(S.w / 10).toLocaleString('fr-FR')} kg</div><p>${esc(S.dex)}</p>` : seen.has(id) ? `<div class="dex-name">${num(id)} ${esc(S.n)}</div><p>Capture cette créature pour en savoir plus.</p>` : '<p>Créature inconnue.</p>';
    };
    draw();
    const pop = ui.input.push((k) => {
      if (k === 'up') i = (i - 1 + ids.length) % ids.length; else if (k === 'down') i = (i + 1) % ids.length;
      else if (k === 'left') i = Math.max(0, i - 10); else if (k === 'right') i = Math.min(ids.length - 1, i + 10);
      else if (k === 'b' || k === 'a') { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); return; }
      else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}

/* ================= CARTE DE LA RÉGION ================= */
// La carte se dévoile au fil du voyage : seules les zones parcourues sont dessinées, le reste n'est qu'une étendue
// verte ; le cadre est zoomé sur ce qu'on connaît et s'élargit à mesure qu'on avance.
export function mapScreen(game) {
  const ui = game.ui, W = game.world.maps.monde, towns = game.world.towns, st = game.state;
  return new Promise((resolve) => {
    const s = screen(ui, 'map-scr', 'CARTE DE LA RÉGION');
    const B = 8, cw = Math.ceil(W.w / B), seen = new Set(st.explored || []);
    const p = game.worldPos();
    if (!seen.size) seen.add(Math.floor(p.y / B) * cw + Math.floor(p.x / B));
    // cadre : ce qui a été exploré, avec une marge, au moins 64 × 48 cases, aux proportions de l'écran
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const i of seen) { const cx = (i % cw) * B, cy = Math.floor(i / cw) * B; x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx + B); y1 = Math.max(y1, cy + B); }
    x0 -= 12; y0 -= 10; x1 += 12; y1 += 10;
    let bw = Math.max(64, x1 - x0), bh = Math.max(48, y1 - y0);
    if (bw / bh > 4 / 3) bh = bw * 3 / 4; else bw = bh * 4 / 3;
    bw = Math.min(W.w, Math.ceil(bw)); bh = Math.min(W.h, Math.ceil(bh));
    const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
    const ox = Math.round(Math.max(0, Math.min(W.w - bw, cxm - bw / 2))), oy = Math.round(Math.max(0, Math.min(W.h - bh, cym - bh / 2)));
    const wrap = el('div', 'map-wrap'); wrap.style.aspectRatio = `${bw} / ${bh}`; s.appendChild(wrap);
    const c = el('canvas', 'mapcv'); c.width = bw; c.height = bh; wrap.appendChild(c);
    const ctx = c.getContext('2d'), img = ctx.createImageData(bw, bh);
    const col = (t) => {
      switch (t) { case T.WATER: return [72, 136, 224]; case T.TREE: case T.PINE: return [52, 120, 64]; case T.PATH: case T.BRIDGE: return [232, 208, 150]; case T.PAVE: case T.BUILD: case T.DOOR: return [228, 222, 208]; case T.SAND: return [240, 226, 170]; case T.TALL: case T.DARKTALL: return [90, 170, 80]; case T.ASH: return [150, 140, 136]; case T.SNOW: return [236, 242, 250]; default: return [132, 200, 110]; }
    };
    const known = (x, y) => seen.has(Math.floor(y / B) * cw + Math.floor(x / B));
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const wx = ox + x, wy = oy + y, k = (y * bw + x) * 4;
      let rgb;
      if (known(wx, wy)) {
        rgb = col(W.get(wx, wy));
        // lisière : un léger fondu vers l'inconnu
        if (!known(wx - 3, wy) || !known(wx + 3, wy) || !known(wx, wy - 3) || !known(wx, wy + 3)) rgb = rgb.map((v, i) => (v + [70, 128, 76][i]) / 2);
      } else { const n = ((wx * 7 + wy * 13) % 5) * 3; rgb = [62 + n, 116 + n, 70 + n]; }
      img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const lab = el('div', 'map-labels'); wrap.appendChild(lab);
    const visited = new Set(st.visited || []);
    for (const t of Object.values(towns)) {
      if (!visited.has(t.id)) continue;   // une ville n'apparaît qu'une fois découverte
      const tx = t.x + t.w / 2 - ox, ty = t.y + t.h / 2 - oy; if (tx < 0 || ty < 0 || tx > bw || ty > bh) continue;
      const d = el('div', 'map-town seen', `<i></i><span>${esc(t.name)}</span>`);
      d.style.left = (tx / bw * 100) + '%'; d.style.top = (ty / bh * 100) + '%'; lab.appendChild(d);
    }
    const me = el('div', 'map-me'); me.style.left = ((p.x - ox) / bw * 100) + '%'; me.style.top = ((p.y - oy) / bh * 100) + '%'; lab.appendChild(me);
    s.appendChild(el('div', 'box map-where', esc(game.locationName())));
    const pop = ui.input.push((k) => { if (k === 'a' || k === 'b' || k === 'map') { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); } });
  });
}

/* ================= CARTE DE DRESSEUR ================= */
export function cardScreen(game, BADGES) {
  const ui = game.ui, st = game.state;
  return new Promise((resolve) => {
    const s = screen(ui, 'card-scr');
    const h = Math.floor(st.time / 3600), m = Math.floor(st.time / 60) % 60;
    s.innerHTML = `<div class="tcard box"><div class="tc-top"><span>CARTE DRESSEUR</span><span>ID ${String(st.id).padStart(5, '0')}</span></div><div class="tc-body"><table class="kv"><tr><td>Nom</td><td>${esc(st.name)}</td></tr><tr><td>Argent</td><td>${st.money.toLocaleString('fr-FR')} ₽</td></tr><tr><td>Pokédex</td><td>${st.dex.caught.length}</td></tr><tr><td>Temps de jeu</td><td>${h}:${String(m).padStart(2, '0')}</td></tr></table><div class="tc-photo"><div class="tc-char ${st.gender === 'f' ? 'f' : 'm'}"></div></div></div><div class="badges">${BADGES.map((b, k) => `<div class="badge ${st.badges[k] ? 'got' : ''}" style="--bc:${b.color}" title="${esc(b.name)}"><i></i></div>`).join('')}</div></div>`;
    const pop = ui.input.push((k) => { if (k === 'a' || k === 'b') { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); } });
  });
}

/* ================= BOUTIQUE ================= */
export async function shopScreen(game, stock) {
  const ui = game.ui, st = game.state;
  for (;;) {
    const r = await ui.ask('Bonjour ! Que puis-je faire pour toi ?', ['Acheter', 'Vendre', 'Au revoir'], { keep: true, speaker: 'Vendeur' });
    if (r === 1) {
      const sellable = Object.keys(st.bag).filter((k) => st.bag[k] > 0 && ITEMS[k] && !ITEMS[k].key && ITEMS[k].price > 0);
      if (!sellable.length) { await ui.say('Tu n\'as rien à vendre.', { keep: true }); continue; }
      const k = await ui.list({ title: 'Vendre', items: sellable.map((it) => ({ label: itemName(it), right: `× ${st.bag[it]}` })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: sellable.length });
      if (k < 0 || k >= sellable.length) continue;
      const it = sellable[k], price = Math.floor(ITEMS[it].price / 2);
      const q = await ui.quantity(st.bag[it], { price });
      if (!q) continue;
      if (await ui.yesNo(`Je peux t'en donner ${(q * price).toLocaleString('fr-FR')} ₽. D'accord ?`, { keep: true })) { st.bag[it] -= q; if (st.bag[it] <= 0) delete st.bag[it]; st.money += q * price; ui.sound.sfx('buy'); }
      continue;
    }
    if (r !== 0) break;
    const money = el('div', 'box money'); ui.root.appendChild(money);
    for (;;) {
      money.innerHTML = `Argent<br><b>${st.money.toLocaleString('fr-FR')} ₽</b>`;
      const k = await ui.list({ title: 'Acheter', items: stock.map((it) => ({ html: `<img class="itm" src="${ASSETS.item(it)}" alt="">${esc(itemName(it))}`, right: `${ITEMS[it].price.toLocaleString('fr-FR')} ₽` })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: stock.length, start: game._shopIdx || 0, onMove: (i) => { game._shopIdx = i; } });
      if (k < 0 || k >= stock.length) break;
      const it = stock[k], price = ITEMS[it].price, max = Math.min(99, Math.floor(st.money / price));
      if (max < 1) { await ui.say('Tu n\'as pas assez d\'argent.', { keep: true }); continue; }
      const q = await ui.quantity(max, { price });
      if (!q) continue;
      if (!(await ui.yesNo(`${itemName(it)} × ${q}, ça fera ${(q * price).toLocaleString('fr-FR')} ₽. D'accord ?`, { keep: true }))) continue;
      st.money -= q * price; st.bag[it] = (st.bag[it] || 0) + q; ui.sound.sfx('buy');
      money.innerHTML = `Argent<br><b>${st.money.toLocaleString('fr-FR')} ₽</b>`;
      if (q >= 10 && it === 'poke-ball') { st.bag['poke-ball']++; await ui.say('Voici une Poké Ball en cadeau pour ton achat !', { keep: true }); }
      else await ui.say('Et voilà ! Merci !', { keep: true });
    }
    money.remove();
  }
  await ui.say('Reviens quand tu veux !');
}

/* ================= PC ================= */
export async function pcScreen(game) {
  const ui = game.ui, st = game.state;
  ui.sound.sfx('pc');
  await ui.say(`${st.name} allume le PC.\nAccès au système de stockage des créatures.`, { keep: true });
  for (;;) {
    const r = await ui.ask('Que veux-tu faire ?', ['Retirer une créature', 'Déposer une créature', 'Éteindre'], { keep: true });
    if (r === 0) {
      if (!st.box.length) { await ui.say('Il n\'y a aucune créature dans la boîte.', { keep: true }); continue; }
      if (st.party.length >= 6) { await ui.say('Ton équipe est complète !', { keep: true }); continue; }
      const k = await ui.list({ title: `Boîte (${st.box.length})`, items: st.box.map((m) => ({ label: monName(m), right: `N.${m.lvl}` })).concat([{ label: 'Annuler' }]), cls: 'shop pcbox', cancel: st.box.length });
      if (k < 0 || k >= st.box.length) continue;
      const m = st.box.splice(k, 1)[0]; st.party.push(m);
      await ui.say(`${monName(m)} a rejoint ton équipe.`, { keep: true });
    } else if (r === 1) {
      if (st.party.length <= 1) { await ui.say('C\'est ta dernière créature !', { keep: true }); continue; }
      ui.closeDialog();
      const k = await partyScreen(game, { mode: 'pick', prompt: 'Quelle créature déposer ?' });
      if (k < 0) continue;
      if (st.party.filter((m, j) => j !== k && m.hp > 0).length === 0) { await ui.say('Il te faut au moins une créature en forme dans ton équipe !', { keep: true }); continue; }
      const m = st.party.splice(k, 1)[0]; st.box.push(m);
      await ui.say(`${monName(m)} a été déposé dans la boîte.`, { keep: true });
    } else break;
  }
  ui.closeDialog();
}

/* ================= OPTIONS ================= */
export function optionsScreen(game) {
  const ui = game.ui, snd = game.sound;
  return new Promise((resolve) => {
    const s = screen(ui, 'opt-scr', 'OPTIONS');
    const box = el('div', 'box opts'); s.appendChild(box);
    const speeds = ['Lente', 'Normale', 'Rapide', 'Instantanée'];
    let i = 0;
    const rows = () => [
      ['Vitesse du texte', speeds[ui.textSpeed]],
      ['Volume', '■'.repeat(Math.round(snd.vol * 10)) + '□'.repeat(10 - Math.round(snd.vol * 10))],
      ['Retour', ''],
    ];
    const draw = () => { box.innerHTML = rows().map(([a, b], k) => `<div class="list-row ${k === i ? 'on' : ''}"><span class="cur">▶</span><span class="lbl">${a}</span><span class="rgt">${b ? '◀ ' + b + ' ▶' : ''}</span></div>`).join('') + '<div class="keys"><b>Commandes</b><br>Flèches ou ZQSD : se déplacer · Espace / Entrée : valider, parler<br>Échap : annuler, menu · Maj (maintenue) : courir · C : carte</div>'; };
    draw();
    const pop = ui.input.push((k) => {
      if (k === 'up') i = (i + 2) % 3; else if (k === 'down') i = (i + 1) % 3;
      else if (k === 'left' || k === 'right') {
        const d = k === 'left' ? -1 : 1;
        if (i === 0) { ui.textSpeed = (ui.textSpeed + d + 4) % 4; try { localStorage.setItem('odyssee-textspeed', ui.textSpeed); } catch (e) {} }
        if (i === 1) snd.setVolume(Math.max(0, Math.min(1, Math.round(snd.vol * 10 + d) / 10)));
      } else if (k === 'b' || (k === 'a' && i === 2)) { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); return; }
      else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}
export { canUseOn };
