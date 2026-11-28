// odyssee/js/game/world-events.js — événements du monde : réveil des bêtes, légendaires, Odyssor, ferry et scènes PNJ.
import { ASSETS, loadImg } from '../assets.js';
import { SPECIES } from '../data/species.js';
import { monName, healFull } from '../core/mon.js';
import { formatObtainItem } from '../core/items.js';
import { RIVAL_NAME, LEADERS } from '../world/region.js';
import { TYPE_FR } from '../ui/screens.js';
import { wait } from '../ui/ui.js';
import { battleMusicForLegend } from '../audio.js';
import { playBossCinematic } from '../ui/cinematic.js';
import { purify } from '../story.js';

export const GYM_HINTS = {
  bug: 'le Feu, le Vol et la Roche',
  rock: 'l\'Eau, la Plante, le Combat, le Sol et l\'Acier',
  water: 'l\'Électrik et la Plante',
  electric: 'le Sol',
  grass: 'le Feu, la Glace, le Vol, le Poison et l\'Insecte',
  psychic: 'l\'Insecte, le Spectre et les Ténèbres',
  fire: 'l\'Eau, la Roche et le Sol',
  dragon: 'la Glace, le Dragon et la Fée',
  normal: 'le Combat',
  flying: 'l\'Électrik, la Glace et la Roche',
  poison: 'le Sol et le Psy',
  ground: 'l\'Eau, la Plante et la Glace',
  steel: 'le Feu, le Combat et le Sol',
  fairy: 'le Poison et l\'Acier',
  dark: 'le Combat, l\'Insecte et la Fée',
};

/** Les trois bêtes du sous-sol de la Tour Cendrée : elles s'éveillent et se dispersent dans les îles. */
export async function reveilBetes(g) {
  const st = g.state, m = g.mapObj, v = g.view, ids = m.betes.map(([sp]) => 'betes:' + sp);
  st.flags.beasts = true;
  const imgs = await Promise.all(m.betes.map(([sp]) => loadImg(ASSETS.front(sp)).catch(() => null)));
  if (g.mapObj !== m) return;
  const acteurs = m.betes.map(([sp, x, y], i) => { if (!imgs[i]) return null; const a = v.imageActor(ids[i], imgs[i], 0.5); v.place(a, x, y - 0.1); return a; });
  await g.ui.say(['Au fond du sous-sol, trois grands Pokémon se tiennent immobiles dans la cendre, les yeux clos...', 'Ils respirent lentement, comme s\'ils dormaient depuis très longtemps.']);
  g.sound.sfx('bang'); v.shake = 0.3;
  g.sound.cry(ASSETS.cry(m.betes[1]?.[0] ?? m.betes[0][0]));
  await g.ui.say('Les trois Pokémon ouvrent les yeux et se dressent d\'un bond !');
  const [ex, ey] = m.betesSortie || [2, 3];
  for (let i = 0; i < m.betes.length; i++) {
    const a = acteurs[i]; if (!a) continue;
    const [, x0, y0] = m.betes[i], t0 = performance.now(), dur = 520;
    for (let t = 0; t < 1; t = (performance.now() - t0) / dur) { v.place(a, x0 + (ex - x0) * t, y0 - 0.1 + (ey - y0) * t, Math.sin(t * Math.PI) * 0.8); await wait(16); }
    v.removeActor(ids[i]);
  }
  await g.ui.flash(2, '#ffffff', 80);
  await g.ui.say(['Un éclair jaune... une flamme... un souffle cristallin...', 'Raikou, Entei et Suicune se sont enfuis de la tour et dispersés dans les îles.']);
}

/** Fait apparaître les Pokémon légendaires présents et disponibles sur la carte courante. */
export function spawnLegends(g) {
  for (const L of g.legends || []) g.view.removeActor('legend:' + L.id);
  const st = g.state, mapNow = g.mapObj;
  g.legends = (g.world.legends || []).filter((L) => L.map === mapNow.id && st.flags['L:' + L.id] !== 'caught' && legendReady(g, L)).map((L) => ({ ...L }));
  for (const L of g.legends) loadImg(ASSETS.front(L.sp)).then((img) => {
    if (!img || g.mapObj !== mapNow || !g.legends.includes(L)) return;
    const a = g.view.imageActor('legend:' + L.id, img, 0.5); g.view.place(a, L.x, L.y - 0.1);
  });
}

/** Indique si les conditions scénaristiques d'un légendaire fixe sont remplies. */
export function legendReady(g, L) {
  const f = g.state.flags, b = g.badgeCount();
  if (typeof L.cond === 'function') return !!L.cond(f, g);
  switch (L.cond) {
    case 'celebi': return !!f.celebiCalled;
    case 'pylons': return !!f.pylons;
    case 'mew': return !!(f['S:1'] && f['S:2'] && f['S:3']) && b >= 4;
    case 'plume': return !!f.plume && b >= 8;
    case 'beasts': return !!f.beasts && b >= 8;
    default: return true;
  }
}

/** Lance la cinématique puis le combat contre un Pokémon légendaire fixe. */
export async function legendBattle(g, L) {
  const st = g.state, ui = g.ui, name = SPECIES[L.sp].n;
  g.sound.cry(ASSETS.cry(L.sp));
  await ui.say(L.intro);
  if (!(await ui.yesNo(`${name} te fixe du regard.\nL'affronter ?`))) return;
  if (!st.flags['L:' + L.id]) st.flags['L:' + L.id] = 'met';
  await playBossCinematic(g, { sp: L.sp, id: L.id, title: name, shadow: !!L.shadow });
  const res = await g.wildBattle([[L.sp, L.lvl, L.lvl, 1]], { fixed: true, music: battleMusicForLegend(L.sp, !!L.shadow) });
  if (L.id === 'hooh') st.flags.hoohDone = true;
  if (L.after) await L.after(g.api(), res);
  if (res === 'caught' || res === 'win') {
    g.legends = g.legends.filter((q) => q !== L); g.view.removeActor('legend:' + L.id);
    if (res === 'caught') st.flags['L:' + L.id] = 'caught';
    else await ui.say([`${name} s'envole au loin...`, 'Il reviendra peut-être plus tard.']);
  }
  g.save(true);
}

/** Bateau de l'Embarcadère : chaque île s'ouvre avec un nombre de badges. */
export async function ferry(g, n) {
  const st = g.state, ui = g.ui, docks = g.world.docks, here = n.def.dock, sp = 'Capitaine';
  // sans permis bateau, les quais du Nord/Est sont bloqués — sauf l'aller-retour Cap Mirage <-> Port-Granit
  if (!st.bag['permis-bateau'] && here !== 'cap' && here !== 'granit') {
    await ui.say(['Ahoy, moussaillon ! Tu veux prendre la mer ?', 'Pas sans ton permis bateau ! La Capitainerie de Port-Azur fait passer l\'examen.', 'Reviens avec, et je te fais embarquer.'], { speaker: sp });
    if (!st.flags['Q:permis']) { st.flags['Q:permis'] = 1; g.refreshNpcs(); }
    return;
  }
  if (!st.flags.passe && st.bag['permis-bateau']) {
    st.flags.passe = true; g.give('ferry-ticket'); g.sound.sfx('item');
    const archipelMsg = (st.badges[7] || st.flags.drakos)
      ? 'L\'archipel des trois frères est désormais grand ouvert à tous les dresseurs confirmés.'
      : 'Pour l\'archipel des trois frères, au-delà des tourbillons, il faut 5 badges : Drakos n\'aime pas les débutants.';
    await ui.say(['Ahoy, moussaillon ! Mon bateau fait le tour des îles de l\'Est.', 'L\'Île Orageuse pour ceux qui ont 2 badges, l\'Île de la Grue avec 3, et l\'Île Givrée, tout au nord, avec 5.', archipelMsg, 'Tiens, voici ton Passe Marin.'], { speaker: sp });
  }
  const shuttle = new Set(['cap', 'granit']);
  const opts = Object.entries(docks).filter(([k, d]) => k !== here && (!d.show || d.show(st.flags)) && (st.bag['permis-bateau'] || shuttle.has(k))), b = g.badgeCount();
  await ui.say('Où veux-tu aller ?', { keep: true, speaker: sp });
  const r = await ui.list({ title: 'Destination', items: opts.map(([, d]) => ({ label: d.name, right: b >= d.badges ? '' : `${d.badges} badges`, disabled: b < d.badges })).concat([{ label: 'Rester ici' }]), cls: 'shop', cancel: opts.length });
  if (r < 0 || r >= opts.length) { await ui.say('Bon vent, moussaillon !', { speaker: sp }); return; }
  const d = opts[r][1];
  await ui.say([`Cap sur ${d.name} !`, 'Le bateau largue les amarres...'], { speaker: sp });
  await g.warp({ map: d.map, x: d.x, y: d.y, dir: d.dir }, 'door');
  g.ui.banner(d.name);
}

/** Cap des Étoiles : Odyssor apparaît (après le badge de Drakos), on peut tenter de le capturer. */
export async function odyssorEvent(g) {
  const st = g.state, ui = g.ui;
  if (!st.badges[7] || st.flags.odyssor === 'caught' || g._odyssorNow) return false;
  delete st.flags.odyssorNow;
  g.busy = true; g._odyssorNow = true; st.flags.odyssorMet = true;
  try {
    g.musicLock = true; g.sound.play('mystic');
    await ui.say(['La mer se met à scintiller...', 'Une immense silhouette bleue glisse entre les vagues.', 'C\'est Odyssor, le géant des océans !']);
    if (st.flags.rivalB4) await ui.say([`Tu repenses aux mots de ${g.rivalB().name} : « Les anciens disent qu'Odyssor a guidé les premiers marins jusqu'aux îles, avant même la Ligue. »`, 'Le géant des océans s\'approche doucement, porté par la lumière des étoiles...']);
    await ui.flash(4, '#cfe4ff', 90);
    await playBossCinematic(g, {
      sp: 1052,
      id: 'odyssor',
      title: 'Odyssor',
      sub: 'Gardien des Étoiles et des Marées',
      badge: 'LÉGENDAIRE MYTHIQUE · CAP DES ÉTOILES',
      preset: 'abyssal',
      duration: 8.0,
    });
    const res = await g.wildBattle([[1052, 50, 50, 1]], { fixed: true, music: battleMusicForLegend(1052) });
    if (res === 'caught') { st.flags.odyssor = 'caught'; st.flags['L:odyssor'] = 'caught'; await ui.say(['Odyssor a rejoint ton équipe.', 'Les marins d\'Odyssée raconteront longtemps cette nuit-là.']); }
    else await ui.say(['Odyssor replonge et disparaît vers le large...', 'Peut-être reviendra-t-il un autre jour.']);
  } finally {
    g.musicLock = false; g.updateZone();
    setTimeout(() => { g._odyssorNow = false; }, 4000);
    g.busy = false;
  }
  return true;
}

/** Gère les dialogues scénarisés des PNJ nommés (Maman, Prof. Saule, gardiens des îles, ferry). */
export async function runNpcScript(g, name, n) {
  const st = g.state, ui = g.ui;
  if (name === 'mom') {
    if (!st.flags.starter) { await ui.say([`Ah, ${st.name}, tu es enfin réveillé${st.gender === 'f' ? 'e' : ''} !`, 'Le Professeur Saule est passé ce matin. Il t\'attend à son laboratoire, juste à l\'est du village.', 'Théo y est déjà, bien sûr... Allez, file !'], { speaker: 'Maman' }); return true; }
    if (!st.flags.momGift) {
      st.flags.momGift = true;
      const starterMon = st.party[0];
      const sName = starterMon ? monName(starterMon) : 'compagnon';
      await ui.say([
        `Oh, ${st.name} ! Quel magnifique ${sName} !`,
        'Le Professeur Saule a vu juste, vous formez déjà une superbe équipe.',
        'Avant que tu ne partes explorer la région, tiens ! Ton père et moi t\'avions préparé ceci.'
      ], { speaker: 'Maman' });
      g.sound.sfx('item');
      g.give('running-shoes');
      await ui.say(`${st.name} reçoit les Chaussures de Course !`);
      await ui.say([
        'Enfile-les vite ! Tu peux courir en maintenant la touche Maj, ou appuyer sur R (ou sur le bouton du Pokématos) pour activer la course continue.',
        'Prends aussi ces quelques baies pour requinquer ton équipe en cas de coup dur sur la route.'
      ], { speaker: 'Maman' });
      g.sound.sfx('item');
      st.bag['oran-berry'] = (st.bag['oran-berry'] || 0) + 3;
      await ui.say(`${st.name} reçoit 3 Baies Oran !`);
      await ui.say('Fais bien attention à toi sur la Route 1. Reviens me voir quand tu auras besoin de repos !', { speaker: 'Maman' });
      g.save(true);
      return true;
    }
    await ui.say(`${st.name} ! Tu as l'air épuisé${st.gender === 'f' ? 'e' : ''}. Repose-toi un peu.`, { keep: true, speaker: 'Maman' });
    g.sound.sfx('heal'); await wait(2000);
    for (const m of st.party) healFull(m);
    st.lastCenter = { map: 'aube:maison', x: 4, y: 5, dir: 'up' };
    await ui.say(['Voilà, tes Pokémon sont en pleine forme !', 'Je suis fière de toi. Reviens quand tu veux !'], { speaker: 'Maman' });
    return true;
  }
  if (name === 'rivalMom') {
    await ui.say(st.badges[7] ? ['Théo m\'a appelée : il paraît que tu as battu Drakos !', 'Il en parle comme si c\'était lui qui avait gagné, ha ha.'] : ['Théo est parti au labo dès l\'aube.', 'Il ne tient pas en place, celui-là !'], { speaker: 'Mère de Théo' });
    return true;
  }
  if (name === 'prof') {
    if (!st.flags.metProf) {
      st.flags.metProf = true;
      await ui.say([`Ah, ${st.name} ! Te voilà enfin.`, 'J\'étudie les Pokémon d\'Odyssée depuis trente ans. Et aujourd\'hui, j\'ai besoin de jeunes dresseurs pour m\'aider.', 'Sur la table, il y a trois coffrets : Plante, Feu et Eau.', 'Dans chacun, trois Poké Balls : trois Pokémon attendent un partenaire : un d\'ici, d\'Odyssée, et deux venus de régions lointaines, Kanto et Johto.', 'Approche-toi de la table et choisis celui qui te plaît !'], { speaker: 'Prof. Saule' });
      const rival = g.npcs.find((q) => q.id === 'rival-lab');
      if (rival) { rival.dir = 'up'; await ui.say('Hé ! T\'en as mis du temps ! Allez, choisis vite, je prendrai après toi.', { speaker: RIVAL_NAME }); rival.dir = 'left'; }
      return true;
    }
    if (!st.flags.starter) { await ui.say('Les trois coffrets sont sur la table. Approche-toi et choisis !', { speaker: 'Prof. Saule' }); return true; }
    if (await purify(g)) return true;
    if (g.eclipseOn()) { await ui.say(['Cette nuit violette... C\'est l\'œuvre de la Team Éclipse, n\'est-ce pas ?', 'Si Lugia se réveille avec un cœur fermé, la nuit ne finira jamais.', 'La voyante de Mirage connaît les vieilles légendes de la mer. Va la voir !'], { speaker: 'Prof. Saule' }); return true; }
    const LEG = (g.world.legends || []).map((L) => L.id), seen = LEG.filter((k) => st.flags['L:' + k]).length, caught = LEG.filter((k) => st.flags['L:' + k] === 'caught').length;
    const B = g.rivalB(), lines = [];
    if (st.flags.rivalB3) lines.push(`${B.name} m'a raconté votre combat à Fort-Écaille. Merci, ${st.name}. Tu m'as rendu ${B.e ? 'ma' : 'mon'} ${B.fils}.`);
    else if (st.flags.rivalB1) lines.push(`Tu as croisé ${B.name} ? ${B.il === 'il' ? 'Il' : 'Elle'} a toujours eu la tête dure... comme sa grand-mère.`);
    if (seen) lines.push(`Tu as déjà rencontré ${seen} Pokémon légendaire${seen > 1 ? 's' : ''}${caught ? `, et tu en as capturé ${caught}` : ''} !`, caught >= 10 ? 'Presque toutes les légendes d\'Odyssée sont dans ton équipe ou ton PC. Odyssor lui-même doit t\'observer.' : 'Les anciens disent que les légendaires ne choisissent que les dresseurs au cœur sincère.');
    else lines.push('Chaque Pokémon que tu rencontreras remplira ton Pokédex.', 'On raconte que des Pokémon légendaires dorment sur les îles de l\'Est. Le capitaine de l\'Embarcadère pourra t\'y emmener.');
    lines.push(st.flags.champion ? 'Maître de la Ligue Céleste… Quel chemin parcouru depuis notre labo ! Le Parc des Légendes, la Tour de Combat et les îles lointaines n\'attendent plus que toi.' : g.badgeCount() >= 15 ? 'Il ne te reste que la Ligue Céleste. Je suis fier de toi.' : st.badges[7] ? 'Les trois frères sont tombés ! Au-delà du Pont de l\'Austral, au sud de Bourg-Aube, sept Champions t\'attendent dans les Terres du Sud.' : 'Les cinq Champions du continent t\'attendent, puis les trois frères de l\'archipel, et enfin les sept Champions des Terres du Sud. Et au bout du chemin : la Ligue Céleste !');
    await ui.say(lines, { speaker: 'Prof. Saule' });
    return true;
  }
  if (name === 'rivalLab') {
    if (st.flags.starter) { await ui.say('Hé, ne traîne pas !', { speaker: RIVAL_NAME }); return true; }
    await ui.say(st.flags.metProf ? ['Vas-y, choisis ! Je prendrai celle qui bat la tienne, évidemment.'] : ['Yo ! Va parler au prof d\'abord, il t\'attend depuis ce matin.'], { speaker: RIVAL_NAME });
    return true;
  }
  if (name === 'gymguide') {
    const L = LEADERS[n.def.gym];
    if (st.badges[n.def.gym]) { await ui.say(['Bravo, champion en devenir !', 'Tu as battu ' + L.name + ' ! Continue comme ça !'], { speaker: 'Guide' }); return true; }
    await ui.say(['Yo, futur Maître ! Bienvenue dans l\'Arène.', `${L.name} utilise des Pokémon de type ${TYPE_FR[L.type]}.`, `Pour en venir à bout, mise sur ${GYM_HINTS[L.type]} !`], { speaker: 'Guide' });
    return true;
  }
  if (name === 'ferry') { await g.ferry(n); return true; }
  if (name === 'gsBall') {
    const sp = 'Vieille dame';
    if (st.flags.gsGiven) { await ui.say(st.flags['L:celebi'] === 'caught' ? ['Tu as vu Celebi ? Oh... Alors la légende était vraie.', 'Prends bien soin de lui, mon petit.'] : ['L\'autel est dans le Bois Murmure, un peu à l\'écart du sentier.', 'Pose la GS Ball dans le creux... et sois patient.'], { speaker: sp }); return true; }
    if (g.badgeCount() < 3) { await ui.say(['Quand j\'étais jeune, j\'ai trouvé une étrange Poké Ball dorée dans le Bois Murmure.', 'Reviens me voir quand tu auras trois badges. Le gardien de la forêt ne se montre qu\'aux dresseurs aguerris.'], { speaker: sp }); return true; }
    st.flags.gsGiven = true; g.give('gs-ball'); g.sound.sfx('item');
    await ui.say(['Trois badges ! Tu es devenu un vrai dresseur, maintenant.', 'Tiens, prends cette Poké Ball dorée. Je l\'ai trouvée près d\'un vieil autel du Bois Murmure.'], { speaker: sp });
    await ui.say(formatObtainItem(st.name, 'gs-ball', 1));
    await ui.say('On dit que le gardien de la forêt, un petit être qui voyage dans le temps, attend qu\'on la lui rapporte...', { speaker: sp });
    return true;
  }
  if (name === 'phare') {
    const sp = 'Gardien du phare', f = st.flags;
    if (f.pylons) { await ui.say(f['L:zapdos'] === 'caught' ? 'Électhor dans ton équipe ! L\'île n\'a jamais été aussi calme.' : ['Le Pic Tonnerre est ouvert.', 'Électhor y attend, au milieu des éclairs. Prépare de quoi soigner la paralysie !'], { speaker: sp }); return true; }
    if (!f.orageQuest) {
      f.orageQuest = true;
      await ui.say(['Bienvenue au Phare de l\'Orage ! Enfin... ce qu\'il en reste.', 'Depuis la grande tempête, les trois relais de l\'île sont coupés, et le phare est éteint.', 'Les anciens disent que la tempête vient d\'Électhor, l\'oiseau de foudre qui niche sur le Pic Tonnerre.', 'Tu veux bien rallumer les relais ? Ils sont le long du Sentier Orageux, au nord.', 'Quand les trois seront allumés, le technicien te laissera monter au Pic.'], { speaker: sp });
      return true;
    }
    const k = [1, 2, 3].filter((q) => f['P:' + q]).length;
    await ui.say(`Encore ${3 - k} relais à rallumer sur le Sentier Orageux. Courage !`, { speaker: sp });
    return true;
  }
  if (name === 'ermite') {
    const sp = 'Ermite', f = st.flags; f.ermite = true;
    if (st.flags.eclipse && !st.flags.lugia) { await ui.say(['Les courants de la grotte se sont tus... Lugia n\'est plus là.', 'Je l\'ai senti partir vers le sud, vers un vieux sanctuaire au large du Cap Mirage.', 'Quelque chose l\'appelle. Quelque chose de mauvais.'], { speaker: sp }); return true; }
    if (f.plumeArgent) { await ui.say(f['L:lugia'] === 'caught' ? 'Lugia... Tu l\'as vu de tes propres yeux. Moi, j\'ai attendu toute ma vie.' : ['La Grotte des Tourbillons est à l\'est du village.', 'Avec la Plume Argentée, les courants te laisseront passer jusqu\'à Lugia.'], { speaker: sp }); return true; }
    if (f['L:articuno']) {
      f.plumeArgent = true; if (!st.bag['plume-argent']) g.give('plume-argent'); g.sound.sfx('item');
      await ui.say([`Tu as affronté Artikodin sur la Cime Givrée ? Alors tu es prêt${st.gender === 'f' ? 'e' : ''}.`, 'Prends cette plume. Je l\'ai trouvée sur la plage, il y a quarante ans. Elle vient de Lugia, le gardien des mers.'], { speaker: sp });
      await ui.say(formatObtainItem(st.name, 'plume-argent', 1));
      await ui.say('Le pêcheur qui garde la Grotte des Tourbillons te laissera entrer.', { speaker: sp });
      g.refreshGates();
      return true;
    }
    await ui.say(['Hmm. Un dresseur, jusqu\'ici ? Rare.', 'Sous cette île dort Lugia, le gardien des mers. Ses courants protègent la Grotte des Tourbillons.', 'Mais avant de le voir, va affronter Artikodin, sur la Cime Givrée, au bout de la Pente Givrée.', 'Reviens me voir ensuite.'], { speaker: sp });
    return true;
  }
  if (name === 'granitDock') {
    if (!st.flags.granitDock) {
      st.flags.granitDock = true;
      await ui.say(['Halte ! Tu accostes sur l\'Île de Granit, territoire de l\'archipel.', 'Ici, ce n\'est pas la Ligue qui fait la loi. C\'est Drakos.', '... Un dresseur avec cinq badges ? Bah. Basalte sera ravi de te remettre à ta place.', 'Passe. Et ne pêche rien sans autorisation !'], { speaker: 'Garde d\'Écaille' });
    } else await ui.say(st.badges[7] ? 'Drakos a levé l\'impôt sur les pêches. Les gens sourient à nouveau, sur le port.' : 'Circule, et pas d\'histoires.', { speaker: 'Garde d\'Écaille' });
    return true;
  }
  return false;
}
