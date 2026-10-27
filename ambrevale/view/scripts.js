// Scripts de l'histoire et des PNJ.
import { audio } from './audio.js';
import { ShopPanel, MapPanel, PCPanel, StarterPanel } from './menus.js';
import { makeMon, monName, healMon } from '../engine/mon.js';
import { species } from '../engine/species.js';
import { ITEMS } from '../engine/items.js';
import { GYMS, BADGES, CHAMPION, rivalTeam, RIVAL_TEXT } from '../engine/gyms.js';
import { TOWNS_DATA } from '../engine/towns.js';

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

export async function runScript(G, n) {
  const st = G.st, f = st.flags;
  if (n.id) G.facePlayer(n);
  if (n.trainer) {
    const T = n.trainer;
    if (T.leader) return leader(G, n);
    if (T.champion) return champion(G, n);
    if (!f['tr:' + T.id]) return G.trainerBattle(n);
    return G.say(n.talkAfter || T.after || 'Tu es vraiment fort !');
  }
  switch (n.script) {
    case 'heal': return heal(G, n);
    case 'shop': await G.say('Bienvenue ! Que puis-je faire pour toi ?'); return G.openPanel(new ShopPanel(G, n.stock || ['sphere', 'potion']));
    case 'fly': return fly(G, n);
    case 'gift': return gift(G, n);
    case 'mom': return mom(G, n);
    case 'prof': return prof(G, n);
    case 'starterTable': return starterTable(G);
    case 'rivalLab': return G.say(f.starter ? ['Hé, ne me regarde pas comme ça.', 'Mon compagnon est le meilleur, c\'est tout !'] : ['Le Prof m\'a fait venir aussi !', 'Il paraît qu\'on va recevoir une créature chacun. Trop bien !']);
    case 'rival': return rival(G, n);
    case 'legend': return legend(G, n);
    case 'pc': await G.say(`${st.name} allume le PC.`); return G.openPanel(new PCPanel(G));
  }
  if (n.block) return G.say(n.talk);
  if (n.gate) return G.say(n.talk);
  if (n.talk) return G.say(n.talk);
}

async function heal(G, n) {
  const r = await G.ask(['Bienvenue au Centre de Soin !', 'Veux-tu que je soigne tes créatures ?']);
  if (r !== 0) return G.say('À bientôt !');
  await G.say('Je m\'occupe de tes créatures quelques instants...');
  await audio.jingle('heal');
  G.healParty();
  G.st.lastHeal = { map: G.map.id, x: G.map.entry.x, y: G.map.entry.y - 2 };
  await G.say(['Merci d\'avoir attendu.', 'Tes créatures sont en pleine forme. À bientôt !']);
}

async function fly(G, n) {
  if (G.st.badges < 1) return G.say(['Service Envol ! Désolé, nos oiseaux ne transportent que les dresseurs qui ont un badge.', 'Reviens quand tu auras battu un champion d\'arène !']);
  await G.say(n.talk);
  const id = await G.openPanel(new MapPanel(G, 'fly'));
  if (!id) return G.say('À ton service quand tu veux !');
  const T = TOWNS_DATA.find((t) => t.id === id);
  await G.say(`Direction ${T.name} ! Accroche-toi bien !`);
  await G.teleport('world', T.fly[0], T.fly[1], 'down');
}

async function gift(G, n) {
  const g = n.gift;
  if (G.st.flags[g.flag]) return G.say('J\'espère que ça t\'aide pour ton voyage !');
  await G.say(n.talk);
  G.st.flags[g.flag] = true; G.addItem(g.item, g.n);
  audio.jingle('item');
  await G.say(`Tu reçois ${g.n > 1 ? g.n + ' × ' : ''}${ITEMS[g.item].name} !`);
}

async function mom(G, n) {
  const f = G.st.flags;
  if (!f.starter) return G.say(n.talk);
  await G.say([`${G.st.name} ! Tu as l'air épuisé.`, 'Repose-toi un peu, mon chéri.']);
  await audio.jingle('heal');
  G.healParty();
  await G.say(['Voilà, tes créatures sont en pleine forme !', 'Fais attention à toi sur la route !']);
}

// ------------------------------------------------------------------ professeur et départ
async function prof(G, n) {
  const f = G.st.flags;
  if (!f.met_prof) {
    await G.say([`Ah, ${G.st.name} ! Te voilà enfin !`, 'Comme promis, tu vas recevoir ta toute première créature.', 'Tu vois les trois Sphères sur la table, juste devant moi ?', 'Chacune contient une créature. Choisis celle qui te plaît !']);
    f.met_prof = true;
    return;
  }
  if (!f.starter) return G.say('Approche-toi de la table et regarde les trois Sphères !');
  const caught = Object.keys(G.st.caught).length;
  if (G.st.badges >= 8) return G.say([`Huit badges ! Je n'en reviens pas, ${G.st.name}.`, 'La Ligue t\'attend, tout au nord-est de la région.']);
  return G.say([`Ton Bestiaire compte ${caught} créature${caught > 1 ? 's' : ''} capturée${caught > 1 ? 's' : ''}.`, caught < 10 ? 'Continue ! Il y en a des dizaines à découvrir en Ambrevale.' : 'Impressionnant ! Tu deviens un vrai spécialiste.']);
}

async function starterTable(G) {
  const st = G.st, f = st.flags;
  if (f.starter) return G.say('La table est vide. Il n\'y a plus de Sphère.');
  if (!f.met_prof) return G.say('Trois Sphères sont posées sur la table. Parle d\'abord au Professeur.');
  while (true) {
    const id = await G.openPanel(new StarterPanel(G));
    if (!id) return;
    audio.sfx('cry', { seed: species(id).num * 977 });
    const r = await G.ask(`Tu choisis ${species(id).name}, la créature de type ${{ brindou: 'Plante', braisille: 'Feu', gouttin: 'Eau' }[id]} ?`);
    if (r !== 0) continue;
    const m = makeMon(id, 5);
    st.starter = id;
    G.receiveMon(m);
    f.starter = true;
    await audio.jingle('caught');
    await G.say(`${st.name} reçoit ${species(id).name} de la part du Professeur !`);
    break;
  }
  // le rival choisit celui qui a l'avantage
  const rivalN = G.map.npcs.find((x) => x.id === 'rival_lab');
  const rid = rivalTeam(1, st.starter)[0][0];
  await G.say(['Noé : Alors moi, je prends celui-là !', `Noé reçoit ${species(rid).name} de la part du Professeur !`]);
  if (rivalN) G.facePlayer(rivalN);
  await G.say(RIVAL_TEXT[1].intro);
  const T = { id: 'rival1', name: 'Noé', cls: 'Rival', team: rivalTeam(1, st.starter), money: 40, lose: RIVAL_TEXT[1].lose };
  const res = await G.startBattleNoLose(T, 'rival');
  await G.say(res === 'win' ? RIVAL_TEXT[1].lose : RIVAL_TEXT[1].win);
  await G.say(RIVAL_TEXT[1].after);
  f.rival1 = true;
  if (rivalN) { rivalN.hidden = true; G.view.removeActor(rivalN.id); }
  G.healParty();
  const p = G.map.npcs.find((x) => x.id === 'prof');
  if (p) G.facePlayer(p);
  await G.say(['Professeur : Ha ha ! Quel combat !', 'Tiens, laisse-moi soigner vos créatures... Voilà.', `${st.name}, prends aussi ceci : c'est un Bestiaire.`]);
  f.dex = true;
  audio.jingle('item');
  await G.say(`${st.name} reçoit le Bestiaire !`);
  G.addItem('sphere', 5); G.addItem('potion', 3);
  await G.say(['Il note automatiquement les créatures que tu rencontres.', 'Et voici cinq Sphères et quelques Potions pour bien commencer.', 'Ton but : battre les huit champions d\'arène d\'Ambrevale, puis le Maître de la Ligue.', 'La première arène est à Roc-Marbre, au nord, par la Route 1.', 'Bonne chance ! Et n\'oublie pas : prends soin de ton compagnon.']);
  G.refreshNpcs();
}

// ------------------------------------------------------------------ rival
async function rival(G, n) {
  const st = G.st, stage = n.rival, R = RIVAL_TEXT[stage];
  if (st.flags['rival' + stage]) return;
  audio.play('trainer', true);
  await G.say(R.intro);
  const T = { id: 'rival' + stage, name: 'Noé', cls: 'Rival', team: rivalTeam(stage, st.starter), money: 60 + stage * 20, lose: R.lose };
  const res = await G.battleTrainer(T, 'rival');
  if (res !== 'win') return;
  await G.say(R.after);
  st.flags['rival' + stage] = true;
  // il s'en va
  const away = n.dir === 'down' ? 'up' : 'down';
  for (let k = 0; k < 6; k++) { const [dx, dy] = DIRV[away]; if (!G.freeFor(n, n.x + dx, n.y + dy)) break; await G.walkNpc(n, away, 1, 5); }
  n.hidden = true; G.view.removeActor(n.id);
}

// ------------------------------------------------------------------ champions
async function leader(G, n) {
  const st = G.st, gym = n.trainer.leader, Gd = GYMS[gym];
  if (st.badges > Gd.badge) return G.say(Gd.leader.after);
  if (st.badges < Gd.badge) return G.say([`Tu n'as que ${st.badges} badge${st.badges > 1 ? 's' : ''}...`, 'Reviens quand tu auras affronté les autres champions dans l\'ordre !']);
  audio.play('leader', true);
  await G.say(Gd.leader.intro);
  const T = { ...Gd.leader, id: 'leader_' + gym, leader: gym };
  const res = await G.battleTrainer(T, Gd.leader.look);
  if (res !== 'win') return;
  st.badges = Gd.badge + 1;
  st.flags['badge' + (Gd.badge + 1)] = true;
  await audio.jingle('badge');
  await G.say(`${st.name} reçoit le ${BADGES[Gd.badge].name} des mains de ${Gd.leader.name} !`);
  await G.say(Gd.leader.after);
  G.refreshNpcs();
  G.save();
}

async function champion(G, n) {
  const st = G.st;
  if (st.flags.champion) return G.say(['Tu es le Maître de la Ligue d\'Ambrevale.', 'Reviens me défier quand tu veux. Je serai prêt.']);
  audio.play('champion', true);
  await G.say(CHAMPION.intro);
  const T = { ...CHAMPION, id: 'champion', champion: true };
  const res = await G.battleTrainer(T, CHAMPION.look);
  if (res !== 'win') return;
  st.flags.champion = true;
  await audio.jingle('badge');
  await G.say(['Célian : Bravo. Vraiment, bravo.', `${st.name}, à partir d'aujourd'hui, tu es le nouveau Maître de la Ligue d'Ambrevale !`, 'Ton nom et celui de tes créatures resteront gravés au Panthéon.']);
  await hallOfFame(G);
  await G.say(['On raconte qu\'au nord-est du Plateau, une grotte cachée abrite le gardien d\'Ambrevale...', 'Maintenant que tu es Maître, le garde te laissera passer.']);
  G.refreshNpcs(); G.save();
}

async function hallOfFame(G) {
  G.hof = { t: 0 };
  audio.play('league', true);
  await G.say(['--- PANTHÉON DE LA LIGUE ---', ...G.st.party.map((m) => `${monName(m)}, niveau ${m.level}`), `Dresseur : ${G.st.name}`, 'Merci d\'avoir joué à ce prototype d\'Ambrevale !']);
  G.hof = null;
}

async function legend(G, n) {
  await G.say('Une silhouette immense brille comme de l\'ambre au fond de la grotte...');
  audio.sfx('cry', { seed: 4242, pitch: 0.8 });
  await G.wait(600);
  const m = makeMon('ambrion', n.level || 60);
  const res = await G.battleWild(m, { music: 'champion', legend: true });
  if (res === 'caught') { G.st.flags.legend = true; G.refreshNpcs(); await G.say('Le gardien d\'Ambrevale a rejoint ton équipe. Une légende commence !'); }
  else if (res === 'win') await G.say('Ambrion s\'est envolé dans un éclat de lumière... Il reviendra peut-être.');
}

// ------------------------------------------------------------------ déclencheurs en marchant
export async function onArriveScripts(G) {
  const M = G.map, p = G.player;
  for (const n of M.npcs) {
    if (n.hidden || n.script !== 'rival' || G.st.flags['rival' + n.rival]) continue;
    // le rival repère le joueur sur sa ligne
    for (const d of ['up', 'down', 'left', 'right']) {
      const [dx, dy] = DIRV[d];
      for (let k = 1; k <= 4; k++) {
        const x = n.x + dx * k, y = n.y + dy * k;
        if (x === p.x && y === p.y) {
          G.run(async () => {
            n.dir = d; G.view.actors.get(n.id)?.setDir(d);
            audio.sfx('exclaim'); G.exclaim = { id: n.id, t: 0.8 };
            await G.wait(600);
            if (k > 1) await G.walkNpc(n, d, k - 1, 5);
            p.dir = OPP[d]; G.pActor.setDir(p.dir);
            await rival(G, n);
          });
          return true;
        }
        if (!M.walkable(x, y)) break;
      }
    }
  }
  return false;
}
