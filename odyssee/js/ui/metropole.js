// odyssee/js/ui/metropole.js — écrans de Métropole : le comptoir du Casino (jetons, lots ; chaque jeu a sa table
// dessinée dans ui/casino/, les bornes d'arcade dans ui/arcade.js) et la Bourse (cotations, nouvelles, ordres,
// entretien d'embauche avec Pierre).
import { el, esc } from './ui.js';
import * as B from '../core/bourse.js';
import { itemName, formatObtainItem } from '../core/items.js';
import { machineASous } from './casino/machine.js';
import { blackjackTable } from './casino/blackjack.js';
import { pokerTable } from './casino/poker.js';
import { rouletteTable } from './casino/roulette.js';
import { beloteTable } from './casino/belote.js';

const fr = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
function table(ui, cls, title) {
  const s = el('div', 'screen metro ' + cls);
  s.innerHTML = `<div class="scr-title">${esc(title)}</div><div class="metro-board"></div><div class="metro-msg box"></div>`;
  ui.root.appendChild(s);
  return { s, board: s.querySelector('.metro-board'), msg: (t) => { s.querySelector('.metro-msg').innerHTML = t; }, close: () => s.remove() };
}
/* ============================== CASINO ============================== */
export const PRIX_JETON = 20;
const LOTS = [
  { k: 'rare-candy', jetons: 120 }, { k: 'ultra-ball', jetons: 40 }, { k: 'max-potion', jetons: 60 }, { k: 'full-restore', jetons: 90 },
  { k: 'moon-stone', jetons: 150 }, { k: 'fire-stone', jetons: 150 }, { k: 'water-stone', jetons: 150 }, { k: 'thunder-stone', jetons: 150 }, { k: 'leaf-stone', jetons: 150 },
];
/** comptoir du casino : achat de jetons, choix d'une table, échange contre des lots */
export async function casinoScreen(game, quoi = null) {
  const ui = game.ui, st = game.state;
  st.jetons ??= 0;
  // jetons restés sur une table de poker (partie interrompue) : on les rend
  if (st.jetonsTable) { st.jetons += st.jetonsTable; st.jetonsTable = 0; }
  const jeux = { machine: machineASous, blackjack: blackjackTable, poker: pokerTable, roulette: rouletteTable, belote: beloteTable };
  if (quoi && jeux[quoi]) { if (st.jetons <= 0) { await ui.say('Il te faut des jetons : le comptoir est à l\'entrée.'); return; } await jeux[quoi](game); return; }
  for (;;) {
    const items = [
      { label: `Acheter des jetons (${PRIX_JETON} ₽ pièce)`, right: `${fr(st.jetons)} jetons` },
      { label: 'Échanger des jetons contre des lots' },
      { label: 'Partir' },
    ];
    const k = await ui.list({ title: `CASINO DE MÉTROPOLE — ${fr(st.money)} ₽`, items, cls: 'shop', cancel: 2 });
    if (k === 0) {
      const max = Math.min(999, Math.floor(st.money / PRIX_JETON));
      if (!max) { await ui.say('Tu n\'as pas assez de Pokédollars.'); continue; }
      const choix = [10, 50, 100, 500].filter((n) => n <= max);
      const c = await ui.list({ title: 'Combien de jetons ?', items: choix.map((n) => ({ label: `${n} jetons`, right: `${fr(n * PRIX_JETON)} ₽` })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: choix.length });
      if (c < 0 || c >= choix.length) continue;
      st.money -= choix[c] * PRIX_JETON; st.jetons += choix[c]; ui.sound.sfx('buy');
    } else if (k === 1) {
      const c = await ui.list({ title: `Lots — ${fr(st.jetons)} jetons`, items: LOTS.map((l) => ({ label: itemName(l.k), right: `${l.jetons} jetons`, disabled: st.jetons < l.jetons })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: LOTS.length });
      if (c < 0 || c >= LOTS.length) continue;
      st.jetons -= LOTS[c].jetons; game.give(LOTS[c].k, 1); ui.sound.sfx('item');
      await ui.say(formatObtainItem(st.name, LOTS[c].k, 1));
    } else return;
  }
}
/* ============================== BOURSE ============================== */
/** marché de la partie : créé au premier passage, rattrapé selon le temps de jeu écoulé */
export function marche(game) {
  const st = game.state;
  if (!st.bourse) { st.bourse = B.nouveauMarche((st.id || 1) * 97 + 13); for (let i = 0; i < 60; i++) B.seance(st.bourse); }   // un marché qui a déjà vécu
  const m = st.bourse, now = (st.time || 0) * 1000;   // temps de jeu (secondes → ms)
  if (m.vu != null && now > m.vu) B.rattraper(m, now - m.vu);
  m.vu = now;
  return m;
}
function spark(h) {
  if (!h || h.length < 2) return '';
  const lo = Math.min(...h), hi = Math.max(...h), w = 90, ht = 22;
  const pts = h.map((v, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(ht - (v - lo) / (hi - lo || 1) * ht).toFixed(1)}`).join(' ');
  return `<svg class="spark ${h[h.length - 1] >= h[0] ? 'up' : 'dn'}" viewBox="0 0 ${w} ${ht}"><polyline points="${pts}"/></svg>`;
}
/** terminal de cotations : liste des actifs (cours, variation, petite courbe), nouvelles, portefeuille ; ordres si embauché */
export async function bourseScreen(game) {
  const ui = game.ui, st = game.state, m = marche(game);
  const T = table(ui, 'bourse', 'BOURSE DE MÉTROPOLE');
  const ids = [B.INDICE.id, ...B.ACTIFS.map((a) => a.id)];
  const nom = (id) => (id === B.INDICE.id ? 'Tracker S&P Odyssée 500' : B.ACTIF[id].nom);
  const var_ = (id) => { const h = id === B.INDICE.id ? m.hist[id] : m.hist[id]; const a = h[Math.max(0, h.length - 21)], b = h[h.length - 1]; return (b / a - 1) * 100; };
  const draw = (sel) => {
    const v = B.valeur(m);
    T.board.innerHTML = `<div class="cotes">${ids.map((id) => { const vv = var_(id); return `<div class="cote ${id === sel ? 'on' : ''}"><span class="tick">${id}</span><span class="nm">${esc(nom(id))}</span><span class="px">${fr(B.prixDe(m, id), id === 'PDE' ? 4 : 2)}</span><span class="var ${vv >= 0 ? 'up' : 'dn'}">${vv >= 0 ? '+' : ''}${fr(vv, 1)} %</span>${spark(m.hist[id].slice(-40))}<span class="pos">${m.positions[id] ? '×' + m.positions[id].qte : ''}</span></div>`; }).join('')}</div>
      <div class="side"><div class="indice">S&P Odyssée 500 : <b>${fr(B.indice(m), 0)}</b> pts · 1 € = ${fr(m.prix.PDE, 4)} ₽</div>
      <div class="news"><b>Dernières nouvelles</b>${m.nouvelles.slice(0, 6).map((n) => `<p>${esc(n.texte)}</p>`).join('') || '<p>Rien de neuf.</p>'}</div>
      <div class="ptf">Portefeuille : <b>${fr(v.valeur)} ₽</b> · plus-value latente <b class="${v.plusValue >= 0 ? 'up' : 'dn'}">${v.plusValue >= 0 ? '+' : ''}${fr(v.plusValue)} ₽</b><br>Liquidités : ${fr(st.money)} ₽${m.embauche ? '' : '<br><i>Pierre ne t\'a pas encore ouvert de compte : tu peux seulement regarder.</i>'}</div></div>`;
  };
  T.msg('Haut / bas : choisir un titre · A : passer un ordre · B : quitter. Les cours bougent à chaque séance (30 secondes de jeu).');
  let i = 0; draw(ids[0]);
  const tick = setInterval(() => { B.seance(m); m.vu = (m.vu || 0) + B.SEANCE_MS; draw(ids[i]); }, 4000);
  for (;;) {
    const k = await new Promise((resolve) => {
      const pop = ui.input.push((key) => {
        if (key === 'up') { i = (i - 1 + ids.length) % ids.length; draw(ids[i]); ui.sound.sfx('blip'); }
        else if (key === 'down') { i = (i + 1) % ids.length; draw(ids[i]); ui.sound.sfx('blip'); }
        else if (key === 'a' || key === 'b') { pop(); resolve(key); }
      });
    });
    if (k === 'b') break;
    const id = ids[i], a = B.ACTIF[id];
    const info = id === B.INDICE.id ? 'Un panier des dix actions de la cote, pondéré par leur taille (1/10e de point d\'indice).' : `${a.desc || a.unite ? (a.desc || 'Cours pour ' + a.unite) : ''}${a.secteur ? ' Secteur : ' + B.SECTEURS[a.secteur] + '.' : ''}`;
    const pos = m.positions[id]?.qte || 0, px = B.prixDe(m, id);
    const c = await ui.list({ title: `${nom(id)} — ${fr(px, 2)} ₽${pos ? ` (tu en as ${pos})` : ''}`, items: [{ label: 'Acheter', disabled: !m.embauche }, { label: 'Vendre', disabled: !pos || !m.embauche }, { label: 'Pricer : dérivés sur ce titre' }, { label: 'Fiche' }, { label: 'Retour' }], cls: 'shop', cancel: 4, parent: T.s });
    if (c === 3) { await ui.say([`${nom(id)} : ${info}`, ...(m.embauche ? [] : ['Pour acheter et vendre, il faut un compte : va voir Pierre, au fond de la Bourse.'])]); continue; }
    if (c === 2) { await ui.list({ title: `Pricer — ${nom(id)}`, items: pricer(m, id).map(([label, right]) => ({ label, right })), cls: 'shop quiz', cancel: 0, parent: T.s }); continue; }
    if (c === 0) {
      const max = Math.min(99, Math.floor(st.money / (px * 1.002)));
      if (!max) { await ui.say('Pas assez de Pokédollars.'); continue; }
      const q = await ui.quantity(max, { price: Math.ceil(px * 1.002) }); if (!q) continue;
      const o = B.ordre(m, id, q, st.money); if (!o.ok) { await ui.say(o.err); continue; }
      st.money -= o.total; ui.sound.sfx('buy');
    } else if (c === 1) {
      const q = await ui.quantity(pos, { price: Math.floor(px * 0.998) }); if (!q) continue;
      const o = B.ordre(m, id, -q, Infinity); if (!o.ok) { await ui.say(o.err); continue; }
      st.money -= o.total; ui.sound.sfx('buy');
    }
    draw(ids[i]);
  }
  clearInterval(tick); T.close();
}

/** prix théoriques des produits dérivés sur un titre (6 mois, à la monnaie) : de quoi s'entraîner avant l'entretien */
function pricer(m, id) {
  const T = 0.5, r = B.R_PD;
  if (id === B.INDICE.id) { const S = B.prixDe(m, id), sig = 0.18; return [['Future 6 mois (tracker)', fr(B.forward(S, r, T, 0.02), 2) + ' ₽'], ['Call européen ATM', fr(B.blackScholes('call', S, S, T, r, sig, 0.02), 2) + ' ₽'], ['Put européen ATM', fr(B.blackScholes('put', S, S, T, r, sig, 0.02), 2) + ' ₽'], ['Call asiatique ATM', fr(B.asiatique('call', S, S, T, r, sig, 0.02, 6, 2000), 2) + ' ₽'], ['Retour', '']]; }
  const a = B.ACTIF[id], S = m.prix[id];
  if (a.fx) return [['Change à terme 6 mois', fr(B.changeATerme(S, r, B.R_PE, T), 4) + ' ₽'], ['Change à terme 1 an', fr(B.changeATerme(S, r, B.R_PE, 1), 4) + ' ₽'], ['Points de swap 1 an', fr(B.pointsSwap(S, r, B.R_PE, 1), 4) + ' ₽'], ['Taux de swap ₽ 5 ans', fr(B.tauxSwap(r, 5) * 100, 3) + ' %'], ['Call € ATM 6 mois (vol ' + Math.round(a.vol * 100) + ' %)', fr(B.blackScholes('call', S, S, T, r, a.vol, B.R_PE), 4) + ' ₽'], ['Retour', '']];
  const sig = B.volDe(a), q = a.q || 0, u = a.u || 0, y = a.y || 0, L = [];
  L.push([a.matiere ? 'Future 6 mois (stockage, rendement)' : 'Forward 6 mois (dividende)', fr(B.forward(S, r, T, q, u, y), 2) + ' ₽']);
  L.push([`Call européen ATM (vol ${Math.round(sig * 100)} %)`, fr(B.blackScholes('call', S, S, T, r, sig, q), 2) + ' ₽']);
  L.push(['Put européen ATM', fr(B.blackScholes('put', S, S, T, r, sig, q), 2) + ' ₽']);
  L.push(['Put américain ATM (arbre)', fr(B.americaine('put', S, S, T, r, sig, q, 120), 2) + ' ₽']);
  L.push(['Call asiatique ATM (Monte-Carlo)', fr(B.asiatique('call', S, S, T, r, sig, q, 6, 2000), 2) + ' ₽']);
  L.push(['Delta du call', fr(B.delta('call', S, S, T, r, sig, q), 3)]);
  if (a.lambda) L.push(['CDS 5 ans (récup. 40 %)', fr(B.primeCDS(a.lambda) * 1e4, 0) + ' pb/an'], ['Survie à 5 ans', fr(B.survie(a.lambda, 5) * 100, 1) + ' %']);
  L.push(['Retour', '']);
  return L;
}
/** Pierre, l'analyste : entretien de huit questions (forwards, change, swaps, CDS, options, corrélations) */
export async function entretienPierre(game) {
  const ui = game.ui, st = game.state, m = marche(game), sp = { speaker: 'Pierre' };
  if (m.embauche) {
    await ui.say(['Ah, mon analyste préféré !', 'Le terminal t\'attend au rez-de-chaussée. Achète bas, vends haut… et lis les nouvelles : un concurrent ne réagit pas comme son rival.'], sp);
    return;
  }
  await ui.say(['Pierre. Costume, cravate, et vingt ans de salle des marchés.', 'Je connais très bien les produits dérivés et les marchés de Métropole.', 'Tu veux un compte pour investir ? Il faut d\'abord me prouver que tu sais pricer.'], sp);
  if (!(await ui.yesNo('Huit questions. Six bonnes réponses et je t\'ouvre un compte. On y va ?', sp))) { await ui.say('Reviens quand tu veux. Les marchés ne dorment jamais.', sp); return; }
  const seed = ((st.id || 1) * 131 + (st.flags.pierreEssais || 0) * 7919) >>> 0;
  st.flags.pierreEssais = (st.flags.pierreEssais || 0) + 1;
  const qs = B.entretien(m, seed); let bon = 0;
  for (let n = 0; n < qs.length; n++) {
    const q = qs[n];
    await ui.say(`Question ${n + 1} / ${qs.length}.`, { ...sp, keep: true });
    const k = await ui.list({ title: q.q, items: q.choix.map((label) => ({ label })), cls: 'shop quiz', cancel: null });
    if (k === q.bonne) { bon++; ui.sound.sfx('select'); await ui.say(['Exact.', q.exp], sp); }
    else { ui.sound.sfx('bump'); await ui.say([`Non : c'était « ${q.choix[q.bonne]} ».`, q.exp], sp); }
  }
  if (bon >= B.SEUIL_EMBAUCHE) {
    m.embauche = true; st.flags.pierre = true; ui.sound.sfx('levelup');
    await ui.say([`${bon} sur ${qs.length}. Pas mal du tout !`, 'Je t\'ouvre un compte : tu peux acheter et vendre au terminal de la Bourse.', 'Un conseil : diversifie. Et ne mets jamais tout sur une rumeur de fusion.'], sp);
  } else await ui.say([`${bon} sur ${qs.length}. Il en faut ${B.SEUIL_EMBAUCHE}.`, 'Révise tes formules et reviens me voir. Les questions changeront.'], sp);
}
