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
import { tenueCode, tenueDecode, tenueValide, tenueOrigine, composer } from '../render/tenue.js';

const WALK = 0.20, RUN = 0.068;
const trainerSprite = (gender) => (gender === 'f' ? 'serena' : 'calem');

export function installSocial(game) {
  const link = new Link(window.HubBridge);
  game.link = link;
  const tags = el('div', 'peer-tags'); game.ui.root.appendChild(tags);
  const tagEls = new Map();
  const bubbles = new Map(); // id -> { el, until, targetId }
  game.clearSpeechBubbles = () => { for (const b of bubbles.values()) b.el?.remove(); bubbles.clear(); };

  game.showSpeechBubble = (targetId, text, emote) => {
    let b = bubbles.get(targetId);
    if (!b) {
      const bEl = el('div', 'speech-bubble');
      tags.appendChild(bEl);
      b = { el: bEl, until: 0, targetId };
      bubbles.set(targetId, b);
    }
    const name = targetId === 'me' ? (game.state?.name || 'Moi') : (link.nameOf(targetId) || 'Dresseur');
    b.el.innerHTML = `
      <div class="bubble-sender">${esc(name)}</div>
      <div class="bubble-body">
        ${emote ? `<span class="bubble-emote">${esc(emote)}</span>` : ''}
        ${text ? `<span class="bubble-text">${esc(text)}</span>` : ''}
      </div>
      <div class="bubble-tail"></div>
    `;
    b.el.classList.remove('fade');
    b.el.style.display = '';
    b.until = performance.now() + 4500;
    try { (game.sound || game.ui?.sound)?.sfx?.('blip'); } catch (e) {}
  };

  link.me = () => {
    if (!game.state || !game.player || !game.mapObj) return null;
    const p = game.player, st = game.state;
    return {
      map: game.mapObj.id, x: p.move ? p.move.tx : p.x, y: p.move ? p.move.ty : p.y, dir: p.dir,
      run: !!(game.autoRun || game.input.isDown('run')), busy: !!(game.busy || !game.input.free || game.bv.alive || game.session),
      pvp: game.pvpBattleInfo || null,
      name: st.name, gender: st.gender, tn: st.tenue && !tenueOrigine(tenueValide(st.tenue, st.gender)) ? tenueCode(tenueValide(st.tenue, st.gender)) : undefined,
    };
  };
  link.onRequest = (from, m) => onRequest(game, from, m);
  link.onChat = (from, m) => {
    if (!m) return;
    const text = typeof m.text === 'string' ? m.text.slice(0, 40) : '';
    const emote = typeof m.emote === 'string' ? m.emote.slice(0, 8) : '';
    if (text || emote) game.showSpeechBubble(from, text, emote);
  };
  // fiche demandée par un autre joueur : réponse automatique, sans interrompre la partie
  link.onCard = () => (game.state ? trainerCard(game.state) : null);
  game.talkToPeer = (peer) => talkToPeer(game, peer);
  game.showPeerCard = (peer) => showCard(game, peer);

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
      // les couleurs de sa tenue, posées sur le dresseur ou la dresseuse par défaut
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
    const v = game.view, mapId = game.mapObj?.id;
    if (!v || !mapId) return;
    const live = new Set();
    for (const o of link.others.values()) {
      if (o.map !== game.mapObj.id) continue;
      const pos = game.view.screenPos(o.dx, o.dy, 25);
      if (!pos) continue;
      live.add(o.id);
      let t = tagEls.get(o.id);
      if (!t) { t = el('div', 'peer-tag'); tags.appendChild(t); tagEls.set(o.id, t); }
      if (o.pvp) {
        t.innerHTML = `<span class="peer-tag-name">${esc(o.name)}</span> <span class="peer-tag-pvp">⚔️ vs ${esc(o.pvp.foeName || 'Duel')}</span>`;
      } else {
        t.textContent = o.busy ? `${o.name} · occupé` : o.name;
      }
      t.style.setProperty('--pc', o.color);
      t.classList.toggle('busy', !!o.busy && !o.pvp);
      t.classList.toggle('pvp', !!o.pvp);
      t.style.transform = `translate(${Math.round(pos.left)}px, ${Math.round(pos.top)}px) translate(-50%, -100%)`;
    }
    for (const [id, t] of tagEls) if (!live.has(id)) { t.remove(); tagEls.delete(id); }

    // Positionnement des bulles de dialogue flottantes
    const now = performance.now();
    for (const [targetId, b] of bubbles) {
      if (now > b.until) {
        b.el.classList.add('fade');
        if (now > b.until + 500) { b.el.remove(); bubbles.delete(targetId); continue; }
      }
      let x, y;
      if (targetId === 'me') {
        const p = game.player;
        if (!p) continue;
        x = p.move ? p.move.tx : p.x;
        y = p.move ? p.move.ty : p.y;
      } else {
        const o = link.others.get(String(targetId));
        if (!o || o.map !== mapId) { b.el.style.display = 'none'; continue; }
        x = o.dx;
        y = o.dy;
      }
      const bPos = v.screenPos(x, y, 52);
      if (!bPos) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      b.el.style.transform = `translate(${Math.round(bPos.left)}px, ${Math.round(bPos.top)}px) translate(-50%, -100%)`;
    }
  };

  /** un autre joueur sur la case visée ? */
  game.peerAt = (x, y) => link.playerAt(game.mapObj.id, x, y);
  game.spectateDuel = (hostId, rid, p0, p1) => spectateSession(game, hostId, rid, p0, p1);
  game.getActiveDuels = () => {
    const list = [];
    const seen = new Set();
    for (const o of link.others.values()) {
      if (o.pvp?.rid && !seen.has(o.pvp.rid)) {
        seen.add(o.pvp.rid);
        list.push({
          rid: o.pvp.rid,
          hostId: o.pvp.hostId || o.id,
          p0: o.pvp.p0 || o.name,
          p1: o.pvp.p1 || o.pvp.foeName,
        });
      }
    }
    return list;
  };
}

/* ======================================================================
   Parler à un joueur : choisir, envoyer l'invitation, attendre la réponse
   ====================================================================== */
export async function talkToPeer(game, peer) {
  const ui = game.ui, link = game.link, st = game.state;
  if (peer.pvp) {
    const foeName = peer.pvp.foeName || 'un autre dresseur';
    const c = await ui.ask(`${peer.name} affronte ${foeName} en combat ! Que veux-tu faire ?`, ['Regarder le combat', 'Sa fiche', 'Rien'], { speaker: peer.name });
    if (c === 0) {
      await spectateSession(game, peer.pvp.hostId || peer.id, peer.pvp.rid, peer.name, foeName);
      return;
    }
    if (c === 1) { await showCard(game, peer); return; }
    return;
  }
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
export async function showCard(game, peer) {
  const rid = newId();
  game.link.send(peer.id, { t: 'card?', rid });
  const r = await game.link.wait(peer.id, (m) => m.t === 'card' && m.rid === rid, 8000);
  if (r.t !== 'card' || !r.card) { await game.ui.say(r.t === 'left' ? `${peer.name} a quitté la partie.` : `${peer.name} ne répond pas.`); return; }
  const c = r.card;
  // données venues d'un autre joueur : on ne garde que ce qu'on sait afficher
  const card = {
    name: String(c.name || peer.name).slice(0, 12), id: (c.id | 0) % 100000, gender: c.gender === 'f' ? 'f' : 'm', dex: c.dex | 0, seen: c.seen | 0, time: +c.time || 0, champion: !!c.champion,
    badges: Array.isArray(c.badges) ? c.badges.slice(0, 15).map(Boolean) : [],
    team: Array.isArray(c.team) ? c.team.slice(0, 6).filter((q) => SPECIES[q?.sp]).map((q) => ({ sp: q.sp, lvl: Math.max(1, Math.min(100, q.lvl | 0)), nick: q.nick ? String(q.nick).slice(0, 12) : null, shiny: !!q.shiny, hp: q.hp != null ? q.hp : null, maxHp: q.maxHp != null ? q.maxHp : null, ball: q.ball || 'poke-ball' })) : [],
    trophies: (c.trophies | 0) || 0,
    pvpWins: (c.pvpWins | 0) || 0,
    pvpLosses: (c.pvpLosses | 0) || 0,
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
  const card = (m, who) => `<div class="box trade-card"><div class="trade-who">${esc(who)}</div><img class="${m.shadow ? 'shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny, m.shadow)}" alt=""><b>${esc(monName(m))}</b><div>N.${m.lvl} · ${SPECIES[m.sp].t.map((t) => TYPE_FR[t]).join(' / ')}</div></div>`;
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
  const hostId = challenger ? link.myId : from;
  game.pvpBattleInfo = {
    rid,
    foeName,
    foeId: from,
    hostId,
    p0: challenger ? st.name : foeName,
    p1: challenger ? foeName : st.name,
  };

  const spectators = new Set();
  const exportBattleSnapshot = () => ({
    turn: battle.turn,
    weather: battle.weather,
    weatherTurns: battle.weatherTurns,
    state: battle.state,
    bg,
    night: m.outdoor && (h >= 20 || h < 5.5),
    p0: {
      name: battle.sides[0].name,
      bs: battle.sides[0].trainer?.bs || trainerSprite(st.gender),
      active: battle.sides[0].active,
      st: battle.sides[0].v.st,
      party: battle.sides[0].party.map(exportMonForSpectator),
    },
    p1: {
      name: battle.sides[1].name,
      bs: battle.sides[1].trainer?.bs || trainerSprite(r.gender || gender),
      active: battle.sides[1].active,
      st: battle.sides[1].v.st,
      party: battle.sides[1].party.map(exportMonForSpectator),
    },
  });

  const broadcastEvents = (evs, isEnd = false, winner = null) => {
    if (!spectators.size) return;
    const msg = isEnd
      ? { t: 'spec_end', rid, events: evs, winner }
      : { t: 'spec_ev', rid, turn: battle.turn, events: evs };
    for (const specId of spectators) {
      link.send(specId, msg);
    }
  };

  if (challenger) {
    link.onSpectate = (specFrom, msg) => {
      if (msg.rid !== rid) return false;
      if (msg.t === 'spec_join') {
        spectators.add(String(specFrom));
        const snap = exportBattleSnapshot();
        link.send(specFrom, { t: 'spec_init', rid, ...snap });
        return true;
      }
      if (msg.t === 'spec_leave') {
        spectators.delete(String(specFrom));
        return true;
      }
      return false;
    };
  }

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
    broadcastEvents: challenger ? broadcastEvents : null,
  };

  // l'écran d'équipe montre les copies du combat (PV du combat) : on les met à la place de l'équipe le temps du duel
  const real = st.party;
  const curtain = await game.encounterIntro('trainer');
  const m = game.mapObj, z = game.zone, h = game.hour();
  const isVillage = z?.town === 'aube' || z?.town === 'sylve' || z?.theme === 'village';
  const isCity = !!z?.town || z?.name?.includes('Cité') || z?.name?.includes('Port-');
  const gymKind = (m.arene === 'rock' || m.arene === 'ground' || m.arene === 'fire' || m.arene === 'fighting') ? 'gym_rock' : 'gym';
  const bg = !m.outdoor ? (m.floor === 'cave' ? 'cave' : m.battleBg === 'gym' ? gymKind : m.battleBg) : z?.theme === 'volcanic' ? 'volcanic' : z?.route === 'r8' ? 'water' : isVillage ? 'village' : isCity ? 'city' : 'grass';
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
    game.pvpBattleInfo = null;
    if (challenger) {
      link.onSpectate = null;
      for (const sId of spectators) {
        link.send(sId, { t: 'spec_end', rid, winner: result === 'win' ? st.name : result === 'lose' ? foeName : null });
      }
      spectators.clear();
    }
  }
  game.sound.stopMusic(0.1); game.sound.current = null;
  game.updateZone();
  if (result === 'win' || result === 'lose' || result === 'tie' || result === 'draw') {
    try { game.recordPvpResult?.(foeName, result); } catch (e) { console.error('PvP record error:', e); }
  }
  await ui.say(result === 'win' ? `Tu as battu ${foeName} !` : result === 'lose' ? `${foeName} a gagné ce combat. La revanche t'attend !` : 'Le combat se termine sans vainqueur.');
}


/** Exporte un Pokémon pour affichage fidèle chez le spectateur */
export function exportMonForSpectator(m) {
  if (!m) return null;
  return {
    uid: m.uid,
    sp: m.sp,
    lvl: m.lvl,
    hp: m.hp,
    stats: m.stats ? [...m.stats] : [m.hp || 50, 50, 50, 50, 50, 50],
    status: m.status || null,
    shiny: !!m.shiny,
    shadow: !!m.shadow,
    gender: m.gender || null,
    nick: m.nick || null,
    ball: m.ball || 'poke-ball',
    moves: (m.moves || []).map((q) => ({ id: q.id, pp: q.pp })),
  };
}

/** Session d'observation d'un combat PvP en direct */
export async function spectateSession(game, hostId, rid, p0Name, p1Name) {
  const ui = game.ui, link = game.link, st = game.state;
  if (!link || !link.enabled) {
    await ui.say("La connexion réseau n'est pas active.");
    return;
  }
  if (game.busy || game.bv.alive || game.session) {
    await ui.say("Tu ne peux pas regarder de combat pour le moment.");
    return;
  }
  game.busy = true;
  game.session = rid;

  link.send(hostId, { t: 'spec_join', rid, specName: st.name });

  const box = ui.dialogBox();
  ui.typePage(box, `Connexion au combat (${p0Name} vs ${p1Name})… (Échap : annuler)`, { last: true });
  await wait(30);

  const pop = game.input.push((k) => { if (k === 'b' || k === 'cancel') link.abort(hostId); });
  const init = await link.wait(hostId, (m) => m.t === 'spec_init' && m.rid === rid, 10000);
  pop();
  ui.closeDialog();

  if (init.t === 'abort' || init.t === 'timeout' || init.t === 'left' || !init.p0) {
    link.send(hostId, { t: 'spec_leave', rid });
    if (init.t === 'timeout') await ui.say("Le dresseur ne répond pas ou le combat est déjà terminé.");
    else if (init.t === 'left') await ui.say("Le dresseur a quitté la partie.");
    else if (init.t === 'abort') await ui.say("Connexion annulée.");
    else await ui.say("Impossible d'accéder au combat.");
    game.busy = false;
    game.session = null;
    return;
  }

  let userQuit = false;
  const specSession = {
    hostId,
    rid,
    turn: init.turn || 0,
    weather: init.weather || 'none',
    weatherTurns: init.weatherTurns || 0,
    bg: init.bg || 'grass',
    night: !!init.night,
    p0: init.p0,
    p1: init.p1,
    waitNext: async () => {
      if (userQuit) return null;
      return await link.wait(hostId, (m) => (m.t === 'spec_ev' || m.t === 'spec_end') && m.rid === rid, 300000);
    },
    leave: () => {
      userQuit = true;
      link.send(hostId, { t: 'spec_leave', rid });
      link.abort(hostId);
    },
  };

  game.bv.pvp = true;
  try {
    await game.bv.runSpectate(specSession, { bg: init.bg, night: init.night });
  } finally {
    specSession.leave();
    game.bv.pvp = false;
    game.bv.close();
    game.busy = false;
    game.session = null;
  }
  game.sound.stopMusic(0.1);
  game.sound.current = null;
  game.updateZone();
}
