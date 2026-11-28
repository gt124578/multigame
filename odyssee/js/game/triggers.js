// odyssee/js/game/triggers.js — déclencheurs de carte et combats scénarisés contre les rivaux.
import { walkable, DIRS, OPP } from '../world/tiles.js';
import { STARTERS, STARTER_TABLE, RIVAL_NAME } from '../world/region.js';
import { buildRivalParty, getRivalItems } from '../world/rival.js';
import { healFull } from '../core/mon.js';
import { wait } from '../ui/ui.js';
import { playBossCinematic } from '../ui/cinematic.js';
import { storyTrigger } from '../story.js';

export const RIVAL_TEAMS = {};
for (let t = 0; t < 3; t++) for (let k = 0; k < 3; k++) RIVAL_TEAMS[STARTER_TABLE[t].lines[k][0]] = STARTER_TABLE[(t + 1) % 3].lines[k];

/** Case libre où faire apparaître le rival : jusqu'à 4 cases dans la direction d'où il arrive, chemin dégagé. */
export function spawnAhead(g, dir, max = 4) {
  const p = g.player, m = g.mapObj, [dx, dy] = DIRS[dir];
  let best = 0;
  for (let k = 1; k <= max; k++) {
    const x = p.x + dx * k, y = p.y + dy * k;
    if (!m.in(x, y) || !walkable(m.get(x, y)) || g.occupied(x, y)) break;
    best = k;
  }
  return best;
}

async function rivalFight(g, flag, team, lvlText, lines, after, who = null) {
  const st = g.state, p = g.player, ui = g.ui;
  if (st.flags[flag] || !st.flags.rival1 || !st.party.some((m) => m.hp > 0)) return false;
  const W = who || { name: RIVAL_NAME, sprite: 'theo', bs: 'theo' };
  g.busy = true;
  const R = RIVAL_TEAMS[st.flags.rivalSp] || RIVAL_TEAMS[STARTERS[0]];
  // le rival arrive par le haut (ou par le côté si la place manque), jamais à travers un mur
  let dir = 'up', n = spawnAhead(g, 'up');
  for (const d of ['left', 'right', 'down']) { if (n >= 2) break; const k = spawnAhead(g, d); if (k > n) { n = k; dir = d; } }
  const [dx, dy] = DIRS[dir];
  const rival = { def: { id: 'rival-' + flag }, id: 'rival-' + flag, x: p.x + dx * Math.max(1, n), y: p.y + dy * Math.max(1, n), dir: OPP[dir], sprite: W.sprite, home: [0, 0], timer: 99, move: null, step: 0 };
  g.npcs.push(rival);
  g.musicLock = true; g.sound.play('rival');
  p.dir = dir; rival.bang = true; g.sound.sfx('bang'); await wait(500); rival.bang = false;
  if (n > 1) await g.npcWalk(rival, OPP[dir], n - 1);
  rival.dir = OPP[dir];
  const face = W.bs || W.sprite;
  await ui.say(lines, { speaker: W.name, face });
  if (st.party.some((m) => m.hp < m.stats[0] || m.status)) {
    for (const m of st.party) healFull(m);
    g.sound.sfx('heal');
    await ui.say('Avant de commencer, laisse-moi soigner ton équipe : je veux t\'affronter à pleine puissance !', { speaker: W.name, face });
  }
  if (flag === 'rivalB3' || flag === 'rivalB4' || flag === 'rival4' || flag === 'rival5' || flag === 'rivalS1' || flag === 'rivalS2') {
    const subMap = {
      rivalB3: 'Dernier Rempart · Fort-Écaille',
      rivalB4: 'Duel au Sommet · Cap des Étoiles',
      rival4: 'Aux Portes de l\'Archipel',
      rival5: 'Combat Ultime avant la Ligue',
      rivalS1: 'Sous le Vent · Route 14',
      rivalS2: 'Parcours des Fées · Route 18',
    };
    await playBossCinematic(g, {
      preset: flag === 'rivalB3' ? 'eclipse' : 'rival',
      title: W.name,
      sub: subMap[flag],
      badge: flag === 'rivalB3' ? 'GARDE D\'ÉCAILLE · DERNIER REMPART' : 'AFFRONTEMENT RIVAL',
      bs: W.bs || W.sprite,
      trainer: { cls: W.cls || 'Rival', name: W.name, bs: W.bs },
    });
  }
  const party = buildRivalParty(g, team(R));
  const res = await g.runBattle({ trainer: { cls: W.cls || 'Rival', name: W.name, prize: 40, bs: W.bs, ai: st.badges.some(Boolean) ? 'smart' : 'normal', items: getRivalItems(g), lose: lvlText, megaSp: st.badges.filter(Boolean).length >= 8 ? 'ace' : undefined }, party, music: 'rival', rival: true });
  g.musicLock = false;
  if (res === 'win') {
    st.flags[flag] = true;
    await ui.say(after, { speaker: W.name, face });
    // il repart par où il est venu
    if (n > 1) await g.npcWalk(rival, dir, n - 1);
  }
  g.npcs = g.npcs.filter((q) => q !== rival); g.view.removeActor('npc:' + rival.id);
  g.updateZone();
  g.busy = false;
  return true;
}

/** Exécute un déclencheur de tuile ou d'événement scénarisé (histoire, blocage starter, combats rivaux). */
export async function trigger(g, name) {
  const st = g.state, ui = g.ui;
  if (await storyTrigger(g, name)) return true;
  if (name === 'needStarter' && !st.flags.starter) {
    g.busy = true;
    await ui.say(['Hé ! Attends !', 'Les hautes herbes sont pleines de Pokémon sauvages. Sans Pokémon à toi, c\'est bien trop dangereux !', 'Va d\'abord voir le Professeur Saule, à son labo.'], { speaker: '???' });
    await g.playerWalk('down', 1);
    g.busy = false; return true;
  }
  // Théo t'attend sur la Route 2 une fois ton premier badge en poche (sa réplique et son équipe vont avec)
  if (name === 'rival2' && st.badges[0]) return rivalFight(g, 'rival2', (R) => [[1010, 12], [1013, 12], [R[0], 13]], 'Grr... Tu as eu de la chance !', [`${st.name} ! Tu as déjà ton premier badge ?`, 'Moi aussi, évidemment. Voyons qui a le plus progressé !'], ['Je vais m\'entraîner dans le Bois Murmure.', 'La prochaine fois, je ne perdrai pas !']);
  if (name === 'rival3') return rivalFight(g, 'rival3', (R) => [[1011, 27], [1034, 26], [1021, 26], [R[1], 29]], 'Encore ?! Tes Pokémon sont devenus sacrément forts...', [`Tiens, tiens... ${st.gender === 'f' ? 'La grande voyageuse' : 'Le grand voyageur'} !`, 'Floralia, c\'est ma ville porte-bonheur. Prépare-toi !'], ['Flora t\'attend à l\'Arène. Moi, je file vers l\'est.', 'On se retrouvera tout en haut, à la Ligue !']);
  if (name === 'rival4' && st.badges[4]) return rivalFight(g, 'rival4', (R) => [[1012, 36], [1035, 35], [1022, 36], [1019, 36], [R[2], 39]], 'Toi et tes Pokémon, vous êtes vraiment synchronisés...', [`${st.name} ! Tu vas sur les îles, toi aussi ?`, 'On dit que Drakos a battu tous ceux qui ont osé le défier, sauf Célestine.', `Avant que tu y ailles, montre-moi si tu es prêt${st.gender === 'f' ? 'e' : ''} !`], [`Bon. Tu es prêt${st.gender === 'f' ? 'e' : ''}. Fonce !`, 'Moi, je vais m\'entraîner sur la route 10. On se revoit avant la Ligue.']);
  // second rival : l'autre enfant, petit-fils / petite-fille du professeur, recrue des Gardes d'Écaille
  const B = g.rivalB(), L3 = g.thirdLine(), bd = (k) => st.badges[k];
  const asB = { name: B.name, sprite: B.sprite, bs: B.bs, cls: 'Garde d\'Écaille' };
  if (name === 'rivalB1' && bd(3)) return rivalFight(g, 'rivalB1', () => [[1044, 33], [1016, 33], [L3[1], 36]], 'Pas mal... pour quelqu\'un du continent.',
    [`Alors c'est toi, ${st.name}. Le prodige de Bourg-Aube.`, `Moi, c'est ${B.name}. J'ai pris la dernière Poké Ball de mon grand-père, le lendemain de ton départ.`, 'J\'ai grandi sur les îles. Là-bas, la Ligue ne vient jamais. Personne ne nous aide... sauf Drakos.', 'Je suis Garde d\'Écaille, maintenant. Et je viens voir de quoi tu es capable avant que tu ne mettes les pieds chez nous.'],
    ['Tu viendras sur les îles, je le sais. Drakos t\'attend.', 'Et moi aussi.'], { ...asB, cls: 'Rival' });
  if (name === 'rivalB2' && bd(5)) return rivalFight(g, 'rivalB2', () => [[1044, 40], [1015, 39], [1039, 39], [L3[2], 43]], 'Basalte avait raison... tu ne lâches rien.',
    [`${st.name}. Tu as battu Basalte.`, 'C\'est lui qui m\'a appris à me battre, tu sais.', 'Les pêcheurs disent que Drakos leur prend trop. Je... je ne veux pas y croire.', 'Montre-moi que tu mérites d\'aller plus loin !'],
    ['Va voir Pyros, à Cendrelune.', `Moi... je vais parler aux pêcheurs. Juste pour savoir.`], { ...asB, cls: 'Rival' });
  if (name === 'rivalB3' && bd(6) && !bd(7)) return rivalFight(g, 'rivalB3', () => [[1044, 45], [1016, 45], [1040, 46], [148, 45], [L3[2], 48]], 'C\'est fini. Je ne suis plus sûr' + B.e + ' de rien.',
    [`Stop, ${st.name}. Je suis le dernier rempart avant la Tour de Drakos.`, 'Les pêcheurs m\'ont tout raconté. Les ports fermés, les pêches confisquées...', 'Mais Drakos nous a protégés quand personne d\'autre ne le faisait.', 'Alors je vais me battre. Une dernière fois. Pour savoir lequel de nous deux a raison !'],
    ['Vas-y. Montre-lui ce que ça fait de perdre... comme moi.', 'Je quitte les Gardes. Peut-être qu\'après toi, Drakos écoutera enfin les îles.'], asB);
  if (name === 'rivalB4' && bd(7)) return rivalFight(g, 'rivalB4', () => [[1044, 54], [1016, 54], [1040, 54], [149, 55], [1046, 54], [L3[2], 57]], 'Merci. J\'avais besoin de ce combat.',
    [`${st.name} ! Je savais que tu viendrais ici.`, 'Drakos m\'a parlé, hier soir. Il dit qu\'Odyssor passe au Cap quand quelqu\'un a eu le courage de changer les choses.', 'J\'aimerais le voir avec toi. Mais d\'abord... un vrai combat. Sans uniforme, sans camp. Juste nous deux !'],
    ['Mon grand-père a raison : on apprend plus en perdant qu\'en gagnant.', 'Avance jusqu\'au bord de la falaise. Si Odyssor vient, c\'est pour toi.'], { ...asB, cls: 'Rival' });
  if (name === 'rivalS1' && bd(8)) return rivalFight(g, 'rivalS1', (R) => [[1012, 57], [1035, 57], [1022, 58], [1040, 58], [R[2], 60]], 'Tu prends encore de l\'avance !', [`${st.name} ! Déjà le Badge Pavé de Margot en poche ?`, 'Ces falaises venteuses mènent à Port-Lisière. Voyons si ton équipe résiste aux Terres du Sud !'], ['Pas mal… Aurèle ne te laissera pas planer tranquille à Port-Lisière.', 'On se retrouve plus loin sur la route du Sud !']);
  if (name === 'rivalS2' && bd(12)) return rivalFight(g, 'rivalS2', (R) => [[1012, 69], [1035, 69], [1022, 70], [1040, 70], [1051, 71], [R[2], 72]], 'Ferdinand avait raison… ton équipe est forgée dans l\'acier.', [`${st.name} ! Tu viens de battre Ferdinand à Forge-Acier ?`, 'Avant d\'entrer sur les terres de Lilas à Rosebrume, je veux un vrai combat. Cette fois, j\'utilise ma Méga-Gemme !'], ['Vaincu même avec la Méga-Évolution…', 'Direction la Ligue après le Sud. Ne perds surtout pas en route !']);
  if (name === 'rival5') return rivalFight(g, 'rival5', (R) => [[1012, 72], [1035, 71], [1022, 72], [1040, 72], [1051, 73], [R[2], 76]], 'Incroyable... Tu mérites d\'aller jusqu\'au bout.', [`${st.name}... Je savais que tu viendrais.`, 'Quinze badges, dont celui de Drakos et les sept du Sud. Tout le monde ne parle que de toi.', 'Mais avant la Ligue, il y a moi. Donne tout ce que tu as !'], ['Va. La Maître de la Ligue t\'attend.', 'Et bats-la, sinon c\'est moi qui m\'en chargerai !']);
  return false;
}
