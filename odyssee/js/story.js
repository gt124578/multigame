// odyssee/js/story.js — les scènes de l'histoire : la Team Éclipse, l'Éclipse, Lugia Obscur, les cadeaux et les quêtes.
// Les PNJ et les lieux sont posés par world/story.js ; ici on joue leurs dialogues et leurs combats.
import { T } from './world/tiles.js';
import { LUGIA_ALTAR } from './world/story.js';
import { FIELD } from './world/region.js';
import { createMon, monName, healFull } from './core/mon.js';
import { SPECIES } from './data/species.js';
import { MOVES } from './data/moves.js';
import { ITEMS, itemName, formatObtainItem } from './core/items.js';
import { partyScreen } from './ui/screens.js';
import { ASSETS, loadImg } from './assets.js';
import { el } from './ui/ui.js';
import { shadowCanvas } from './render/shadow.js';
import { playLugiaCinematic } from './ui/cinematic.js';

const say = (g, lines, who) => g.ui.say(lines, who ? { speaker: who } : undefined);
const val = (v, st) => (typeof v === 'function' ? v(st) : v);
const LUGIA = 249, SHADOW_MOVE = 10001, AEROBLAST = 177;

/** reçoit un objet : message adapté (objet rare, CS, quantité) */
async function receive(g, item, qty = 1) {
  const st = g.state;
  g.give(item, qty); g.sound.sfx('item');
  await g.ui.say(formatObtainItem(st.name, item, qty));
}

/** reçoit un Pokémon (équipe, ou PC si elle est pleine) */
async function receiveMon(g, mon, from) {
  const st = g.state;
  mon.ot = mon.ot || st.name; mon.met = mon.met || g.locationName();
  g.markCaught(mon.sp); g.sound.sfx('caught');
  await g.ui.say(`${st.name} reçoit ${monName(mon)}${from ? ' de la part de ' + from : ''} !`);
  if (st.party.length < 6) st.party.push(mon);
  else { st.box.push(mon); await g.ui.say(`L'équipe est pleine : ${monName(mon)} a été envoyé dans le PC.`); }
}

/* ======================================================================
   Dialogues des PNJ (renvoie true si le script est géré ici)
   ====================================================================== */
export async function storyTalk(g, name, n) {
  const st = g.state, f = st.flags, d = n?.def || {};
  switch (name) {
    case 'gift': {
      const q = d.gift;
      if (f[q.flag]) { await say(g, val(q.done, st), q.who); return true; }
      if (q.need && !q.need(st)) { await say(g, val(q.pre, st), q.who); f['A:' + q.flag] = true; return true; }
      await say(g, val(q.give, st), q.who);
      f[q.flag] = true; if (q.set) f[q.set] = true;
      await receive(g, q.item, q.qty || 1);
      await say(g, val(q.got, st), q.who);
      g.refreshNpcs();
      return true;
    }
    case 'show': {
      const q = d.show;
      if (f[q.flag]) { await say(g, q.done, q.who); return true; }
      await say(g, q.ask, q.who); f['A:' + q.flag] = true;
      if (!st.party.some(q.test)) return true;
      const i = await partyScreen(g, { mode: 'pick', prompt: 'Quel Pokémon montrer ?', filter: (m) => (q.test(m) ? null : 'Pas celui-là') });
      if (i < 0) return true;
      await say(g, q.thanks, q.who);
      for (const [it, k] of q.reward) await receive(g, it, k);
      f[q.flag] = true;
      return true;
    }
    case 'deliver': {
      const q = d.deliver;
      if (f[q.flag]) { await say(g, q.done, q.who); return true; }
      f['A:' + q.flag] = true;
      if (!st.bag[q.item]) { await say(g, q.ask, q.who); return true; }
      await g.ui.say(`${st.name} rend le ${itemName(q.item)}.`);
      g.take(q.item); f[q.flag] = true;
      await say(g, q.thanks, q.who);
      for (const [it, k] of q.reward) await receive(g, it, k);
      return true;
    }
    case 'trade': {
      const q = d.trade, want = SPECIES[q.want].n, got = SPECIES[q.give].n;
      if (f[q.flag]) { await say(g, q.done, q.who); return true; }
      await say(g, q.ask, q.who); f['A:' + q.flag] = true;
      if (!st.party.some((m) => m.sp === q.want)) { await say(g, `Reviens quand tu auras un ${want} dans ton équipe !`, q.who); return true; }
      if (!(await g.ui.yesNo(`Échanger un ${want} contre ${q.nick} (${got}) ?`))) return true;
      const i = await partyScreen(g, { mode: 'pick', prompt: `Quel ${want} échanger ?`, filter: (m) => (m.sp === q.want ? null : 'Pas celui-là') });
      if (i < 0) return true;
      if (st.party.length === 1) { await say(g, 'Tu ne peux pas te séparer de ton dernier Pokémon !', q.who); return true; }
      const [old] = st.party.splice(i, 1);
      const mon = createMon(q.give, q.lvl, { ot: q.who, met: g.locationName(), iv: Array(6).fill(24) }); mon.nick = q.nick;
      st.party.splice(i, 0, mon); g.markCaught(q.give); f[q.flag] = true;
      g.sound.sfx('caught');
      await g.ui.say(`${st.name} échange ${monName(old)} contre ${q.nick} !`);
      await say(g, q.thanks, q.who);
      return true;
    }
    case 'giftmon': {
      const q = d.giftmon;
      if (f[q.flag]) { await say(g, q.done, q.who); return true; }
      if (q.need && !q.need(st)) { await say(g, q.pre, q.who); return true; }
      await say(g, q.ask, q.who);
      if (!(await g.ui.yesNo(`Accepter ${SPECIES[q.sp].n} ?`))) { await say(g, 'Oh... Reviens si tu changes d\'avis.', q.who); return true; }
      f[q.flag] = true;
      await receiveMon(g, createMon(q.sp, q.lvl, { ot: q.who, met: g.locationName(), iv: Array(6).fill(26) }), q.who);
      await say(g, q.got, q.who);
      return true;
    }
    case 'dexq': {
      const q = d.dexq, n0 = st.dex.caught.length; f['A:dexpert'] = true;
      const next = q.tiers.find(([k]) => !f['dex' + k]);
      if (!next) { await say(g, ['Ton Pokédex est impressionnant. Tu n\'as plus besoin de moi !', 'Le Prof. Saule doit être fier de toi.'], q.who); return true; }
      const [need, it, k] = next;
      if (n0 < need) { await say(g, [`J'étudie les Pokédex des dresseurs de passage. Le tien compte ${n0} Pokémon capturés.`, `Reviens quand tu en auras ${need} : je te donnerai ${k > 1 ? k + ' × ' : ''}${itemName(it)}.`], q.who); return true; }
      await say(g, [`${n0} Pokémon capturés ! Ça, c'est du beau travail.`, 'Voici ta récompense, comme promis.'], q.who);
      f['dex' + need] = true;
      await receive(g, it, k);
      return true;
    }
    case 'lumenBois': {
      const who = 'Dr Lumen';
      if (!f['T:ecl:bois1'] || !f['T:ecl:bois2']) { await say(g, ['Au secours ! Ces gens en uniforme sombre veulent mes recherches !', 'Ils se disent de la « Team Éclipse »... Je t\'en prie, chasse-les !'], who); return true; }
      if (!f.giftFlash) {
        await say(g, ['Merci, tu m\'as sauvé la mise ! Je suis le Dr Lumen. J\'étudie les Plumes Argentées.', 'Ces plumes, c\'est Lugia, le gardien des marées, qui les laisse derrière lui.', 'La Team Éclipse prépare un « Prisme Noir », un appareil capable de fermer le cœur d\'un Pokémon. Si elle s\'en sert sur Lugia...', 'Ils parlaient aussi de la Grotte Lunaire. Elle est plongée dans le noir : prends ceci, ça t\'aidera.'], who);
        f.giftFlash = true;
        await receive(g, 'cs-flash');
        await say(g, ['Avec Flash, ton Pokémon éclairera les grottes sombres tout seul.', 'Fais attention à toi. Et si tu croises encore la Team Éclipse... méfie-toi.'], who);
        g.updateOverlay();
        return true;
      }
      await say(g, ['Les Plumes Argentées brillent comme la lune sur la mer...', 'Je vais continuer mes recherches. On se reverra, j\'en suis sûr !'], who);
      return true;
    }
    case 'mission': return mission(g, d.mission);
    case 'lumenSanct': return lumenSanct(g, true);
    case 'victoireGate': {
      if (g.badgeCount() < 15) await say(g, 'Halte ! La Route Victoire est réservée aux dresseurs aux quinze badges.', 'Garde');
      else await say(g, ['Quinze badges... Mais je ne peux pas te laisser passer.', 'Tant que la nuit violette recouvre la région, la Ligue a fermé la Route Victoire.', 'Il paraît que tout vient du Sanctuaire des Marées, sur un îlot au sud du Cap Mirage.'], 'Garde');
      return true;
    }
  }
  return false;
}

/* ======================================================================
   Requêtes des habitants (world/habitants.js)
   ====================================================================== */
async function mission(g, q) {
  const st = g.state, f = st.flags, A = 'A:' + q.id, who = q.role === 'receiver' ? q.to.who : q.who;
  const lines = (v) => (typeof v === 'function' ? v(st, g) : v);
  const reward = async (list) => { for (const [it, k] of list || []) await receive(g, it, k); };
  // destinataire d'un objet à porter : c'est lui qui termine la quête
  if (q.role === 'receiver') {
    const R = q.to;
    if (f[q.id]) { await say(g, lines(R.done), who); return true; }
    if (!st.bag[q.item]) { await say(g, lines(R.idle), who); return true; }
    await g.ui.say(`${st.name} donne : ${itemName(q.item)}.`);
    g.take(q.item, st.bag[q.item]); f[q.id] = true;
    await say(g, lines(R.thanks), who); await reward(R.reward);
    return true;
  }
  if (f[q.id]) { await say(g, lines(q.done), who); return true; }
  const first = !f[A];
  if (q.kind === 'relay') {
    if (!first) { await say(g, lines(q.wait), who); return true; }
    await say(g, lines(q.ask), who); f[A] = true;
    await receive(g, q.item, 1);
    return true;
  }
  if (q.kind === 'duel') {
    await say(g, lines(first ? q.ask : q.again), who); f[A] = true;
    if (!g.lead()) return true;
    if (!(await g.ui.yesNo('Accepter le combat ?'))) return true;
    const d = q.duel, team = typeof d.team === 'function' ? d.team(st, g) : d.team;
    const res = await g.api().fight({ ...d, team, ai: 'smart', items: { 'full-restore': 2 }, intro: null, lose: q.lose, noWhiteout: true, music: d.music || 'champion' });
    if (res === 'win') { f[q.id] = true; await say(g, lines(q.thanks), who); await reward(q.reward); }
    else await say(g, 'Reviens quand tu veux. Je serai là.', who);
    return true;
  }
  // show, bring, check : la demande (en entier la première fois, en bref ensuite), puis la vérification
  await say(g, lines(first || !q.again ? q.ask : q.again), who); f[A] = true;
  let ok = false;
  if (q.kind === 'show') {
    if (!st.party.some((m) => q.test(m, st))) return true;
    const i = await (g.pickParty || partyScreen)(g, { mode: 'pick', prompt: 'Quel Pokémon montrer ?', filter: (m) => (q.test(m, st) ? null : 'Pas celui-là') });
    ok = i >= 0;
  } else if (q.kind === 'bring') {
    const n = q.qty || 1;
    if ((st.bag[q.item] || 0) >= n) { await g.ui.say(`${st.name} donne : ${n > 1 ? n + ' × ' : ''}${itemName(q.item)}.`); g.take(q.item, n); ok = true; }
  } else if (q.kind === 'check') ok = !!q.test(st, g);
  if (!ok) return true;
  f[q.id] = true;
  await say(g, lines(q.thanks), who); await reward(q.reward);
  return true;
}

/** zones déclencheuses propres à l'histoire */
export async function storyTrigger(g, name) {
  if (name === 'lumenSanct') return lumenSanct(g, false);
  return false;
}

async function lumenSanct(g, talked) {
  const st = g.state, f = st.flags, who = 'Dr Lumen';
  if (f.giftMaster) { if (talked) await say(g, f.lugia ? ['Lugia est apaisé... Tu as rendu le jour à la région. Merci.'] : ['Lugia dort au fond du Sanctuaire. Bonne chance !'], who); return talked; }
  g.busy = true;
  const n = g.npcs.find((q) => q.id === 'lumen-sanct'); if (n) n.dir = 'left';
  await say(g, [`${st.name} ! Toi aussi, tu as trouvé le chemin du Sanctuaire !`, 'La Team Éclipse est au fond, près de l\'autel. Le Prisme Noir a fermé le cœur de Lugia : c\'est devenu un Pokémon Obscur.', 'Si Lugia se réveille, il faudra le calmer. Le capturer, c\'est la seule façon de le libérer du Prisme.', 'Prends cette Master Ball. Elle capture n\'importe quel Pokémon, à coup sûr. Ne la gaspille pas !'], who);
  f.giftMaster = true;
  await receive(g, 'master-ball');
  g.busy = false;
  return true;
}

/* ======================================================================
   Après un combat gagné (dresseur avec winScript)
   ====================================================================== */
export async function storyWin(g, name) {
  const st = g.state, ui = g.ui;
  if (name === 'boss1') {
    await say(g, ['Le Prisme Noir est en route pour le Sanctuaire des Marées. Lugia y dort.', 'Quand son cœur sera fermé, il m\'obéira. Et la nuit ne finira plus jamais.', 'Regarde... Ça commence déjà.'], 'Nocturne');
    st.flags.eclipse = true;
    g.sound.sfx('bang'); await ui.flash(2, '#40206a', 160);
    g.setEclipse();
    await ui.say(['Un grondement sourd fait trembler le repaire...', 'Dehors, le ciel s\'éteint d\'un coup : une nuit violette recouvre toute la région !']);
    await ui.say(['Les sbires qui gardaient l\'entrée de Mirage ont dû filer.', 'Il faut trouver où se cache ce Sanctuaire des Marées.']);
    g.save(true);
    return;
  }
  if (name === 'boss2') {
    await say(g, ['Non... Le Prisme... Il se fissure !', 'Lugia ! Réveille-toi ! Obéis-moi !'], 'Nocturne');
    await lugiaWakes(g);
  }
}

/* ======================================================================
   Lugia Obscur
   ====================================================================== */
export function shadowLugia() {
  const m = createMon(LUGIA, 50, { moves: [SHADOW_MOVE, 56, 94, 105], iv: Array(6).fill(28), met: 'Sanctuaire des Marées' });
  m.shadow = true;
  return m;
}

async function lugiaWakes(g) {
  const ui = g.ui;
  g.view.shake = 0.5; g.sound.sfx('bang');
  await ui.flash(3, '#6020a0', 120);
  g.sound.cry(ASSETS.cry(LUGIA));
  await ui.say(['Un cri immense résonne dans tout le Sanctuaire !', 'Les eaux de l\'autel bouillonnent... Lugia Obscur ouvre les yeux !']);
  await playLugiaCinematic(g);
  await lugiaBattle(g);
}

/** combat contre Lugia Obscur (au réveil, ou en lui parlant plus tard s'il est toujours sur l'autel) */
export async function lugiaBattle(g) {
  const st = g.state, ui = g.ui;
  if (!g.lead()) return;
  if (!st.flags.seenLugiaCinematic) {
    await playLugiaCinematic(g);
  }
  if (!(await ui.yesNo('Lugia Obscur te fixe de ses yeux sombres.\nL\'affronter ?'))) return;
  const res = await g.runBattle({ wild: shadowLugia(), music: 'legend' });
  if (res === 'caught') {
    st.flags['L:lugia'] = 'caught'; st.flags.lugiaCaught = true;
    g.setTile(LUGIA_ALTAR.x, LUGIA_ALTAR.y, T.CAVE); g.view.removeActor('lugia');
    await ui.say(['Le Prisme Noir se brise en mille éclats !', 'Lugia est libéré de son emprise... mais son cœur reste encore fermé. Le Prof. Saule saura peut-être l\'ouvrir.']);
    g.give('prism-shard');
  } else if (res === 'win') {
    st.flags['L:lugia'] = st.flags['L:lugia'] || 'met';
    g.setTile(LUGIA_ALTAR.x, LUGIA_ALTAR.y, T.CAVE); g.view.removeActor('lugia');
    await ui.say(['Lugia Obscur s\'effondre sur l\'autel... Le Prisme Noir vole en éclats.', 'Libéré, Lugia déploie ses ailes et s\'envole vers le nord, au-dessus de la mer.', 'Il doit retourner dormir dans la Grotte des Tourbillons, sous l\'Île Givrée...']);
    g.give('prism-shard');
  } else if (res === 'lose') return;
  else { await ui.say('Lugia Obscur reste sur l\'autel, les yeux fixés sur toi...'); return; }
  if (!st.flags.lugia) await endEclipse(g);
}

async function endEclipse(g) {
  const st = g.state, ui = g.ui;
  st.flags.lugia = true;
  await ui.flash(2, '#fff0c0', 160);
  g.setEclipse();
  await ui.say(['Une lueur dorée traverse les fissures de la grotte...', 'La nuit violette se déchire : le jour revient sur toute la région !', 'La Team Éclipse est vaincue. La Route Victoire va rouvrir.']);
  g.refreshNpcs();
  g.save(true);
}

/** sprite de Lugia Obscur posé sur l'autel */
export async function placeLugia(g) {
  const f = g.state.flags;
  if (g.mapObj.id !== LUGIA_ALTAR.map || f.lugiaCaught || f.lugia) {
    // Lugia n'est plus sur l'autel : la case redevient praticable
    if (g.mapObj.id === LUGIA_ALTAR.map && g.mapObj.get(LUGIA_ALTAR.x, LUGIA_ALTAR.y) === T.BLOCK) g.mapObj.set(LUGIA_ALTAR.x, LUGIA_ALTAR.y, T.CAVE);
    return;
  }
  const img = await loadImg(ASSETS.front(LUGIA, false, true));
  if (g.mapObj.id !== LUGIA_ALTAR.map || !img) return;
  const a = g.view.imageActor('lugia', img, 0.55);
  g.view.place(a, LUGIA_ALTAR.x, LUGIA_ALTAR.y - 0.1);
}

/** le Prof. Saule ouvre le cœur d'un Pokémon Obscur */
export async function purify(g) {
  const st = g.state, i = st.party.findIndex((m) => m.shadow);
  if (i < 0) return false;
  const m = st.party[i], who = 'Prof. Saule';
  await say(g, [`Ce ${SPECIES[m.sp].n}... Son cœur est fermé. C'est donc ça, un Pokémon Obscur.`, 'Le lien entre un dresseur et son Pokémon peut tout réparer. Laisse-moi t\'aider.'], who);
  if (!(await g.ui.yesNo(`Ouvrir le cœur de ${monName(m)} ?`))) return true;
  g.sound.sfx('evolve'); await g.ui.flash(3, '#ffffff', 120);
  m.shadow = false;
  for (const mv of m.moves) if (mv.id === SHADOW_MOVE) { mv.id = AEROBLAST; mv.pp = MOVES[AEROBLAST].pp; }
  healFull(m);
  g.sound.cry(ASSETS.cry(m.sp)); g.sound.sfx('levelup');
  await g.ui.say([`Le cœur de ${monName(m)} s'est ouvert !`, `${monName(m)} oublie Rafale Obscure... et apprend Aéroblast !`]);
  await say(g, ['Regarde comme il te regarde, maintenant. Vous êtes faits pour voyager ensemble.'], who);
  return true;
}

/** halo de l'Éclipse et obscurité des grottes : calque HTML au-dessus du rendu */
export function overlay(g) {
  let ov = g._ov;
  if (!ov) { ov = g._ov = el('div', 'dark-ov'); g.ui.root.prepend(ov); }
  const m = g.mapObj, dark = !!m?.dark, flash = m?.dark !== 'arene' && g.hasField('flash') && g.badgeCount() >= FIELD.flash.badge;   // l'arène Ténèbres reste dans le noir
  // arène dessinée dans le noir : chaque torche allumée élargit la lueur autour du joueur
  const lueur = dark && m.planArene?.noir ? ' lueur' + Math.min(3, (m.regs || []).filter((v) => v).length) : '';
  ov.className = 'dark-ov' + (dark ? (flash ? ' cave flash' : ' cave') : '') + lueur + (g.eclipseOn() && m?.outdoor ? ' eclipse' : '');
}
