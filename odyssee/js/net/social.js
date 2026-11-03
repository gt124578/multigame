// odyssee/js/net/social.js — les autres joueurs dans la région : les voir marcher, leur parler,
// échanger un Pokémon, se défier en combat. Branché sur Game par installSocial(game).

import { Link, newId } from './link.js';
import { PvpBattle, battleCopy, validMon, validParty, TRADE_EVO } from '../core/pvp.js';
import { monName } from '../core/mon.js';
import { SPECIES } from '../data/species.js';
import { ASSETS, loadImg } from '../assets.js';
import { isGrassEnc } from '../world/tiles.js';
import { partyScreen, cardScreen, trainerCard, TYPE_FR } from '../ui/screens.js';
import { BADGES } from '../world/region.js';
import { el, esc, wait } from '../ui/ui.js';
import { tenueCode, tenueDecode, composer } from '../render/tenue.js';

const WALK = 0.26, RUN = 0.135;
const trainerSprite = (gender) => (gender === 'f' ? 'serena' : 'calem');

export function installSocial(game) {
  const link = new Link(window.HubBridge);
  game.link = link;
  const tags = el('div', 'peer-tags'); game.ui.root.appendChild(tags);
  const tagEls = new Map();

  link.me = () => {
    if (!game.state || !game.player || !game.mapObj) return null;
    const p = game.player, st = game.state;
    return {
      map: game.mapObj.id, x: p.move ? p.move.tx : p.x, y: p.move ? p.move.ty : p.y, dir: p.dir,
      run: !!(game.autoRun || game.input.isDown('run')), busy: !!(game.busy || !game.input.free || game.bv.alive || game.session),
      name: st.name, gender: st.gender, tn: st.tenue ? tenueCode(st.tenue) : undefined,
    };
  };
  link.onRequest = (from, m) => onRequest(game, from, m);
  // fiche demandée par un autre joueur : réponse automatique, sans interrompre la partie
  link.onCard = () => (game.state ? trainerCard(game.state) : null);

  /* ---------------- affichage ---------------- */
  game.peersTick = (dt) => {
    link.tick();
    for (const o of link.others.values()) {
      const speed = dt / (o.run ? RUN : WALK);
      const ddx = o.x - o.dx, ddy = o.y - o.dy, d = Math.hypot(ddx, ddy);
      if (d > 3) { o.dx = o.x; o.dy = o.y; o.walking = false; continue; }
      if (d < 1e-3) { o.dx = o.x; o.dy = o.y; o.walking = false; continue; }
      const k = Math.min(1, speed / d);
      const before = Math.floor((Math.abs(o.dx) + Math.abs(o.dy)) * 2);
      o.dx += ddx * k; o.dy += ddy * k; o.walking = true;
      if (Math.floor((Math.abs(o.dx) + Math.abs(o.dy)) * 2) !== before) o.step = (o.step + 1) % 4;
    }
  };

  game.drawPeers = () => {
    const v = game.view, mapId = game.mapObj.id;
    const seen = new Set();
    for (const o of link.others.values()) {
      if (o.map !== mapId) continue;
      const id = 'peer:' + o.id; seen.add(id);
      const a = v.actor(id, {});
      // sa tenue, composée sur le modèle de base (sinon le dresseur ou la dresseuse par défaut)
      let spr = o.gender === 'f' ? 'green' : 'red';
      const T = o.tn && tenueDecode(o.tn), b = T && v.baseDe?.(T.genre);
      if (b) spr = v.pairSprite(o.tn, () => composer(b.src, b.sx, b.sy, T)) || (T.genre === 'f' ? 'green' : 'red');
      v.setFrame(a, spr, o.dir, o.walking ? (o.step % 2 ? 1 : 2) : 0);
      v.place(a, o.dx, o.dy, 0, isGrassEnc(game.mapObj.get(Math.round(o.dx), Math.round(o.dy))) && !o.walking);
    }
    for (const id of [...v.actors.keys()]) if (id.startsWith('peer:') && !seen.has(id)) v.removeActor(id);
  };

  /** noms au-dessus des autres joueurs (après le rendu, quand la caméra est à jour) */
  game.drawTags = (show = true) => {
    tags.style.display = show ? '' : 'none';
    if (!show) return;
    const live = new Set();
    for (const o of link.others.values()) {
      if (o.map !== game.mapObj.id) continue;
      const pos = game.view.screenPos(o.dx, o.dy, 25);
      if (!pos) continue;
      live.add(o.id);
      let t = tagEls.get(o.id);
      if (!t) { t = el('div', 'peer-tag'); tags.appendChild(t); tagEls.set(o.id, t); }
      t.textContent = o.busy ? `${o.name} · occupé` : o.name;
      t.style.setProperty('--pc', o.color);
      t.classList.toggle('busy', o.busy);
      t.style.transform = `translate(${Math.round(pos.left)}px, ${Math.round(pos.top)}px) translate(-50%, -100%)`;
    }
    for (const [id, t] of tagEls) if (!live.has(id)) { t.remove(); tagEls.delete(id); }
  };

  /** un autre joueur sur la case visée ? */
  game.peerAt = (x, y) => link.playerAt(game.mapObj.id, x, y);
}

/* ======================================================================
   Parler à un joueur : choisir, envoyer l'invitation, attendre la réponse
   ====================================================================== */
export async function talkToPeer(game, peer) {
  const ui = game.ui, link = game.link, st = game.state;
  if (peer.busy) { await ui.say(`${peer.name} est occupé${peer.gender === 'f' ? 'e' : ''} pour le moment.`); return; }
  const c = await ui.ask(`${peer.name} est là. Que veux-tu faire ?`, ['Échanger', 'Combattre', 'Sa fiche', 'Rien'], { speaker: peer.name });
  if (c === 2) { await showCard(game, peer); return; }
  if (c !== 0 && c !== 1) return;
  if (!st.party.length) { await ui.say('Il te faut d\'abord un Pokémon !'); return; }
  const kind = c === 0 ? 'trade' : 'battle';
  if (kind === 'trade' && !st.badges?.[3]) {
    await ui.say('Les échanges sont bloqués tant que tu n\'as pas obtenu le 4e Badge (Badge Pétale de l\'Arène de Floralia) !');
    return;
  }
  const myCap = game.levelCap ? game.levelCap() : 100;
  if (kind === 'trade' && !st.party.some((m) => m.lvl <= myCap)) {
    await ui.say(`Aucun de tes Pokémon ne respecte ta limite de niveau actuelle (N.${myCap}) pour pouvoir échanger.`);
    return;
  }
  const rid = newId();
  link.send(peer.id, { t: 'req', kind, rid, name: st.name, gender: st.gender, cap: myCap });
  const box = ui.dialogBox();
  ui.typePage(box, `Tu proposes ${kind === 'trade' ? 'un échange' : 'un combat'} à ${peer.name}… (Échap : annuler)`, { last: true });
  await wait(30);
  const pop = game.input.push((k) => { if (k === 'b') link.abort(peer.id); });
  const r = await link.wait(peer.id, (m) => m.t === 'rep' && m.rid === rid, 30000);
  pop(); ui.closeDialog();
  if (r.t === 'abort' || r.t === 'timeout') {
    link.send(peer.id, { t: 'req-cancel', rid });
    if (r.t === 'timeout') await ui.say(`${peer.name} ne répond pas.`);
    return;
  }
  if (r.t === 'left') { await ui.say(`${peer.name} a quitté la partie.`); return; }
  if (!r.ok) {
    const why = {
      busy: `${peer.name} est occupé${peer.gender === 'f' ? 'e' : ''} pour le moment.`,
      nomon: `${peer.name} n'a pas encore de Pokémon.`,
      nobadge: `${peer.name} n'a pas encore le 4e Badge (Badge Pétale) pour pouvoir échanger.`,
    }[r.why] || `${peer.name} refuse.`;
    await ui.say(why); return;
  }
  game.session = rid;
  try {
    if (kind === 'trade') await tradeSession(game, peer.id, peer.name, rid, r.cap || 100);
    else await battleSession(game, peer.id, peer.name, peer.gender, rid, true);
  } finally { game.session = null; }
}

/** fiche dresseur d'un autre joueur : badges, Pokédex, temps de jeu, équipe */
async function showCard(game, peer) {
  const rid = newId();
  game.link.send(peer.id, { t: 'card?', rid });
  const r = await game.link.wait(peer.id, (m) => m.t === 'card' && m.rid === rid, 8000);
  if (r.t !== 'card' || !r.card) { await game.ui.say(r.t === 'left' ? `${peer.name} a quitté la partie.` : `${peer.name} ne répond pas.`); return; }
  const c = r.card;
  // données venues d'un autre joueur : on ne garde que ce qu'on sait afficher
  const card = {
    name: String(c.name || peer.name).slice(0, 12), id: (c.id | 0) % 100000, gender: c.gender === 'f' ? 'f' : 'm', dex: c.dex | 0, seen: c.seen | 0, time: +c.time || 0, champion: !!c.champion,
    badges: Array.isArray(c.badges) ? c.badges.slice(0, 15).map(Boolean) : [],
    team: Array.isArray(c.team) ? c.team.slice(0, 6).filter((q) => SPECIES[q?.sp]).map((q) => ({ sp: q.sp, lvl: Math.max(1, Math.min(100, q.lvl | 0)), nick: q.nick ? String(q.nick).slice(0, 12) : null })) : [],
  };
  game.ui.sound.sfx('select');
  await cardScreen(game, BADGES, card);
}

/** invitation reçue */
async function onRequest(game, from, m) {
  const link = game.link, st = game.state, ui = game.ui;
  const free = st && game.player && !game.busy && game.input.free && !game.bv.alive && !game.session && !game.player.move;
  if (!free) { link.send(from, { t: 'rep', rid: m.rid, ok: false, why: 'busy' }); return; }
  if (!st.party.length) { link.send(from, { t: 'rep', rid: m.rid, ok: false, why: 'nomon' }); return; }
  if (m.kind === 'trade' && !st.badges?.[3]) { link.send(from, { t: 'rep', rid: m.rid, ok: false, why: 'nobadge' }); return; }
  const myCap = game.levelCap ? game.levelCap() : 100;
  const name = String(m.name || link.nameOf(from)).slice(0, 12);
  game.busy = true; game.session = m.rid;
  try {
    // l'invitation tombe si l'autre annule ou après 25 s
    let gone = false;
    const cancel = link.wait(from, (q) => q.t === 'req-cancel' && q.rid === m.rid, 25000).then((r) => {
      gone = true;
      const open = ui.root.querySelector('.list.choice');
      if (open && open._close) open._close(1);
      return r;
    });
    ui.sound.sfx('bang');
    const yes = await ui.yesNo(m.kind === 'trade' ? `${name} te propose un échange de Pokémon. Accepter ?` : `${name} te défie en combat ! Accepter ?`, { speaker: name });
    if (gone) { ui.closeDialog(); await ui.say(`${name} a retiré sa proposition.`); return; }
    link.abort(from); void cancel;
    link.send(from, { t: 'rep', rid: m.rid, ok: yes, why: yes ? null : 'no', cap: myCap });
    if (!yes) return;
    const peer = link.others.get(String(from));
    if (m.kind === 'trade') await tradeSession(game, from, name, m.rid, m.cap || 100);
    else await battleSession(game, from, name, m.gender || peer?.gender, m.rid, false);
  } finally { game.busy = false; game.session = null; }
}

/** attente avec Échap pour abandonner ; renvoie le message ou { t: 'abort' | 'left' | 'timeout' } */
async function waitFor(game, from, match, text, ms = 180000) {
  const ui = game.ui;
  const box = ui.dialogBox();
  ui.typePage(box, `${text} (Échap : annuler)`, { last: true });
  await wait(30);
  const pop = game.input.push((k) => { if (k === 'b') game.link.abort(from); });
  const r = await game.link.wait(from, match, ms);
  pop(); ui.closeDialog();
  return r;
}

/* ======================================================================
   Échange
   ====================================================================== */
async function tradeSession(game, from, name, rid, peerCap = 100) {
  const ui = game.ui, link = game.link, st = game.state;
  const myCap = game.levelCap ? game.levelCap() : 100;
  const M = (step) => (m) => m.t === 'tr' && m.rid === rid && (m.step === step || m.step === 'cancel');
  const ended = async (r) => {
    if (r.t === 'abort') { link.send(from, { t: 'tr', rid, step: 'cancel' }); await ui.say('Échange annulé.'); }
    else if (r.t === 'left') await ui.say(`${name} a quitté la partie. Échange annulé.`);
    else if (r.t === 'timeout') { link.send(from, { t: 'tr', rid, step: 'cancel' }); await ui.say(`${name} ne répond plus. Échange annulé.`); }
    else await ui.say(`${name} a annulé l'échange.`);
  };

  await ui.say(`Échange avec ${name} : choisis le Pokémon que tu proposes (Niv. max autorisé : N.${Math.min(myCap, peerCap)}).`);
  const idx = await partyScreen(game, {
    mode: 'pick',
    prompt: `Quel Pokémon proposer ? (Max N.${Math.min(myCap, peerCap)})`,
    filter: (m) => (m.lvl > myCap ? ` > Niv. max (N.${myCap})` : m.lvl > peerCap ? ` > Niv. max ${name} (N.${peerCap})` : null),
  });
  if (idx < 0) { link.send(from, { t: 'tr', rid, step: 'cancel' }); await ui.say('Échange annulé.'); return; }
  const mine = st.party[idx];
  link.send(from, { t: 'tr', rid, step: 'pick', mon: JSON.parse(JSON.stringify(mine)) });

  const r1 = await waitFor(game, from, M('pick'), `${name} choisit son Pokémon…`);
  if (r1.step !== 'pick') return ended(r1);
  if (!validMon(r1.mon)) { link.send(from, { t: 'tr', rid, step: 'cancel' }); await ui.say('Le Pokémon reçu est illisible. Échange annulé.'); return; }
  const theirs = r1.mon;
  if (theirs.lvl > myCap || theirs.lvl > peerCap) {
    link.send(from, { t: 'tr', rid, step: 'cancel' });
    await ui.say(`Échange interdit : ${monName(theirs)} (N.${theirs.lvl}) dépasse la limite de niveau actuelle (N.${Math.min(myCap, peerCap)}) !`);
    return;
  }

  // les deux Pokémon face à face
  const s = el('div', 'screen trade-scr');
  const card = (m, who) => `<div class="box trade-card"><div class="trade-who">${esc(who)}</div><img class="${m.shadow ? 'shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny)}" alt=""><b>${esc(monName(m))}</b><div>N.${m.lvl} · ${SPECIES[m.sp].t.map((t) => TYPE_FR[t]).join(' / ')}</div></div>`;
  s.innerHTML = `<div class="scr-title">ÉCHANGE</div><div class="trade-row">${card(mine, 'Toi')}<div class="trade-arrows">⇄</div>${card(theirs, name)}</div>`;
  ui.root.appendChild(s);
  const yes = await ui.yesNo(`Échanger ton ${monName(mine)} contre le ${monName(theirs)} de ${name} ?`);
  link.send(from, { t: 'tr', rid, step: 'ok', yes });
  if (!yes) { s.remove(); await ui.say('Échange annulé.'); return; }
  const r2 = await waitFor(game, from, M('ok'), `${name} réfléchit…`);
  if (r2.step !== 'ok') { s.remove(); return ended(r2); }
  if (!r2.yes) { s.remove(); await ui.say(`${name} a refusé l'échange.`); return; }

  // échange : le Pokémon reçu prend la place de celui qui part
  const k = st.party.indexOf(mine);
  if (k < 0) { s.remove(); await ui.say('Échange annulé.'); return; }
  let maxUid = 0; for (const m of st.party.concat(st.box)) maxUid = Math.max(maxUid, m.uid || 0);
  const got = { ...theirs, uid: maxUid + 1 }; delete got._ko;
  st.party[k] = got;
  game.markCaught(got.sp);
  game.save(true);
  ui.sound.sfx('evolve');
  s.classList.add('swap');
  await wait(1400);
  ui.sound.cry(ASSETS.cry(got.sp));
  await ui.say([`Tu envoies ${monName(mine)} à ${name}.`, `${name} t'envoie ${monName(got)} !`, `Prends bien soin de ${monName(got)} !`]);
  s.remove();
  const to = TRADE_EVO[got.sp];
  if (to) await game.evolveScene(got, to);
  game.save(true);
}

/* ======================================================================
   Combat
   ====================================================================== */
async function battleSession(game, from, name, gender, rid, challenger) {
  const ui = game.ui, link = game.link, st = game.state;
  const mine = battleCopy(st.party);
  const seed = challenger ? (Math.random() * 2 ** 32) >>> 0 : 0;
  link.send(from, { t: 'bt', rid, step: 'party', party: JSON.parse(JSON.stringify(mine)), seed, gender: st.gender });
  const r = await waitFor(game, from, (m) => m.t === 'bt' && m.rid === rid && (m.step === 'party' || m.step === 'quit'), `${name} se prépare…`, 60000);
  if (r.step !== 'party') {
    if (r.t === 'abort') link.send(from, { t: 'bt', rid, step: 'quit' });
    await ui.say(r.t === 'left' ? `${name} a quitté la partie.` : r.t === 'abort' ? 'Combat annulé.' : `${name} a annulé le combat.`);
    return;
  }
  if (!validParty(r.party)) { link.send(from, { t: 'bt', rid, step: 'quit' }); await ui.say('L\'équipe reçue est illisible. Combat annulé.'); return; }
  const foeName = name;
  const battle = new PvpBattle({
    me: { name: st.name, party: mine },
    foe: { name: foeName, party: r.party, bs: trainerSprite(r.gender || gender) },
    seed: challenger ? seed : r.seed >>> 0,
    canon: challenger ? 0 : 1,
  });
  const B = (step, n) => (m) => m.t === 'bt' && m.rid === rid && ((m.step === step && m.n === n) || m.step === 'quit');
  // pendant l'attente, Échap propose d'abandonner
  const waitTurn = async (step, n) => {
    for (;;) {
      const pop = game.input.push((k) => { if (k === 'b') link.abort(from); });
      const q = await link.wait(from, B(step, n), 300000);
      pop();
      if (q.t === 'abort') {
        if (await ui.yesNo('Abandonner le combat ?')) { link.send(from, { t: 'bt', rid, step: 'quit' }); return { mine: true }; }
        continue;
      }
      if (q.t === 'left') return { left: true };
      if (q.t === 'timeout') return { timeout: true };
      if (q.step === 'quit') return { quit: true };
      return q;
    }
  };
  const duel = {
    foeName,
    sendAct: (n, action, sum) => link.send(from, { t: 'bt', rid, step: 'act', n, action, sum }),
    waitAct: async (n) => { const q = await waitTurn('act', n); return q.action ? { action: q.action, sum: q.sum } : q; },
    sendSwitch: (n, idx) => link.send(from, { t: 'bt', rid, step: 'sw', n, idx }),
    waitSwitch: async (n) => { const q = await waitTurn('sw', n); return q.step === 'sw' ? { idx: q.idx } : q; },
    sendQuit: () => link.send(from, { t: 'bt', rid, step: 'quit' }),
  };

  // l'écran d'équipe montre les copies du combat (PV du combat) : on les met à la place de l'équipe le temps du duel
  const real = st.party;
  const curtain = await game.encounterIntro('trainer');
  const m = game.mapObj, z = game.zone, h = game.hour();
  const bg = !m.outdoor ? (m.floor === 'cave' ? 'cave' : m.battleBg) : z?.theme === 'volcanic' ? 'volcanic' : z?.route === 'r8' || z?.town === 'azur' ? 'water' : 'grass';
  curtain.remove();
  game.bv.pvp = true;
  st.party = mine;
  let result;
  try {
    result = await game.bv.runPvp(battle, duel, { bg, night: m.outdoor && (h >= 20 || h < 5.5) });
  } finally {
    st.party = real;
    game.bv.pvp = false;
    game.bv.close();
  }
  game.sound.stopMusic(0.1); game.sound.current = null;
  game.updateZone();
  await ui.say(result === 'win' ? `Tu as battu ${foeName} !` : result === 'lose' ? `${foeName} a gagné ce combat. La revanche t'attend !` : 'Le combat se termine sans vainqueur.');
}
