// odyssee/js/core/questsData.js — le journal des quêtes : un carnet de voyage, pas un guide.
// Chaque quête acceptée y laisse de courtes phrases qui rappellent ce qu'on nous a demandé et ce qui s'est passé,
// jamais où aller ni quoi faire ensuite. Le journal retient aussi quand la quête a été acceptée (en temps de jeu),
// pour qu'on se souvienne d'une promesse faite deux heures plus tôt.
//
// Une entrée : { id, cat, name, giver, started(f, g), done(f, g), notes: [[condition(f, g), phrase], …] }
// Les phrases dont la condition est vraie s'affichent dans l'ordre ; la dernière est la plus récente.
import { SPECIES } from '../data/species.js';
import { BADGES, LEADERS } from '../world/region.js';
import { ELITE } from '../world/story.js';
import { MISSIONS } from '../world/habitants.js';

export const QUEST_CATEGORIES = {
  main: { id: 'main', label: 'Histoire', badge: 'HISTOIRE', color: '#f8d030' },
  side: { id: 'side', label: 'Aventures', badge: 'AVENTURE', color: '#00f0ff' },
  legend: { id: 'legend', label: 'Légendes', badge: 'LÉGENDE', color: '#e070ff' },
  npc: { id: 'npc', label: 'Habitants', badge: 'HABITANT', color: '#78c850' },
};

const step = (f, id) => f['Q:' + id] || 0;
const atLeast = (id, n) => (f) => { const s = step(f, id); return s === 'fin' || (typeof s === 'number' && s >= n); };
const fin = (id) => (f) => step(f, id) === 'fin';
const sp = (n) => SPECIES[n]?.n || '?';
const gymTown = (g, i) => Object.values(g.world?.towns || {}).find((t) => t.gym === i)?.name || '';
const rivalB = (g) => (g.rivalB ? g.rivalB() : { name: 'Lyra', il: 'elle', e: 'e', fils: 'petite-fille' });

/* ======================================================================
   Le registre
   ====================================================================== */
const QUESTS = [
  /* ---------- les voyages : le vélo et le permis bateau ---------- */
  { id: 'velo', cat: 'npc', name: 'Le vélo de Lucien', giver: 'Lucien',
    started: (f) => !!f['Q:velo'], done: (f) => f['Q:velo'] === 'fin',
    notes: [
      [(f) => f['Q:velo'], 'À Voltacité, Lucien m\'a promis un vélo s\'il récupérait deux pièces : une chambre à air et un dérailleur.'],
      [(f) => f.velo_chambre, 'Yves, le marin, m\'a donné la chambre à air.'],
      [(f) => f.velo_derailleur, 'Les mineurs m\'ont forgé un dérailleur.'],
      [(f) => f['Q:velo'] === 'fin', 'Lucien a assemblé mon vélo. Je file sur les routes !'],
    ] },
  { id: 'permis', cat: 'npc', name: 'Le permis bateau', giver: 'Capitaine',
    started: (f) => !!f['Q:permis'], done: (f) => f['Q:permis'] === 'fin',
    notes: [
      [(f) => f['Q:permis'], 'Le capitaine de l\'Embarcadère de l\'Aube ne fait embarquer que les titulaires du permis bateau.'],
      [(f) => f['Q:permis'] === 'fin', 'J\'ai réussi l\'examen de la Capitainerie : j\'ai mon permis bateau.'],
    ] },
  /* ---------- l'histoire ---------- */
  { id: 'ligue', cat: 'main', name: 'Le voyage du dresseur', giver: 'Prof. Saule',
    started: (f) => !!f.starter, done: (f) => !!f.champion,
    notes: [
      [(f) => f.starter, (f) => `Le Prof. Saule m'a confié ${sp(f.starter)} et un Pokédex. Mon rêve : devenir Maître de la Ligue Céleste.`],
      ...BADGES.map((b, i) => [(f, g) => g.state.badges[i], (f, g) => `${LEADERS[i].name} m'a remis le ${b.name}${gymTown(g, i) ? ' à ' + gymTown(g, i) : ''}.`]),
      [(f, g) => g.state.badges.every(Boolean), 'Quinze badges en poche. La Ligue Céleste m\'attend.'],
      ...ELITE.map((e) => [(f) => f['T:' + e.id], `${e.name}, du Conseil 4, s'est incliné${e.name === 'Ombrelle' ? 'e' : ''}.`]),
      [(f) => f.champion, 'Célestine s\'est inclinée. Je suis le nouveau Maître de la Ligue Céleste !'],
    ] },
  { id: 'eclipse', cat: 'main', name: 'L\'ombre de la Team Éclipse', giver: 'Dr Lumen',
    started: (f) => !!(f['T:ecl:bois1'] || f['T:ecl:bois2'] || f.giftFlash), done: (f) => !!f.lugia,
    notes: [
      [(f) => f['T:ecl:bois1'] || f['T:ecl:bois2'] || f.giftFlash, 'Dans le Bois Murmure, des sbires de la Team Éclipse menaçaient le Dr Lumen, un savant qui étudie les Plumes Argentées.'],
      [(f) => f.giftFlash, 'Le Dr Lumen m\'a parlé d\'un « Prisme Noir », capable de fermer le cœur d\'un Pokémon.'],
      [(f) => f['T:ecl:erebe1'], 'Erèbe, un Admin de la Team Éclipse, pillait les Pierres Lune de la Grotte Lunaire.'],
      [(f) => f['T:ecl:nyx1'], 'Nyx, une autre Admin, harcelait un vieux marin de Port-Azur au sujet du gardien des mers.'],
      [(f) => f['T:ecl:erebe2'], 'J\'ai chassé la Team Éclipse de la Centrale de Voltacité. Elle volait l\'électricité de la région pour son Prisme.'],
      [(f) => f.eclipse, 'J\'ai battu Nocturne, le chef de la Team Éclipse, dans son repaire. Mais une nuit violette est tombée sur toute la région.'],
      [(f) => f.giftPlume, 'La voyante de Mirage m\'a confié la Plume Argentée, qui ouvre le Sanctuaire des Marées.'],
      [(f) => f.giftMaster, 'Au Sanctuaire des Marées, le Dr Lumen m\'a donné une Master Ball.'],
      [(f) => f['T:ecl:boss2'], 'Nocturne est vaincu, mais Lugia s\'est réveillé, le cœur fermé par le Prisme Noir.'],
      [(f) => f.lugia, (f) => (f.lugiaCaught ? 'J\'ai capturé Lugia et brisé le Prisme Noir. Le jour est revenu.' : 'Lugia est libéré du Prisme Noir et s\'est envolé. Le jour est revenu.')],
      [(f) => f.lugiaCaught && f.lugia, 'Le Prof. Saule saura peut-être ouvrir le cœur de Lugia.'],
    ] },
  { id: 'freres', cat: 'main', name: 'Les trois frères de l\'archipel', giver: 'Gardes d\'Écaille',
    started: (f, g) => !!(f.granitDock || g.state.badges[5]), done: (f, g) => !!g.state.badges[7],
    notes: [
      [(f, g) => f.granitDock || g.state.badges[5], 'Sur l\'Île de Granit, on m\'a prévenu : sur l\'archipel, ce n\'est pas la Ligue qui fait la loi, c\'est Drakos.'],
      [(f, g) => g.state.badges[5], 'Basalte, le plus jeune des trois frères, m\'a remis le Badge Granit.'],
      [(f, g) => g.state.badges[6], 'Pyros, le frère du milieu, m\'a remis le Badge Braise.'],
      [(f, g) => g.state.badges[7], 'Drakos, l\'aîné, est tombé. Il a promis de rouvrir les ports de l\'archipel.'],
    ] },
  { id: 'theo', cat: 'main', name: 'Théo, mon rival', giver: 'Théo',
    started: (f) => !!f.rival1, done: (f) => !!f.mTheo,
    notes: [
      [(f) => f.rival1, (f, g) => `Théo a pris ${sp(g.rivalLine ? g.rivalLine()[0] : 0)} au labo, juste après moi, et m'a défié sur-le-champ.`],
      [(f) => f.rival2, 'Théo m\'a rattrapé sur la route 2. Lui aussi a son premier badge.'],
      [(f) => f.rival3, 'Théo m\'attendait à Floralia, sa « ville porte-bonheur ».'],
      [(f) => f.rival4, 'Au Cap Mirage, Théo a voulu vérifier que j\'étais prêt pour les îles.'],
      [(f) => f.rival5, 'Sur la route 9, Théo m\'a donné tout ce qu\'il avait avant la Ligue.'],
      [(f) => f.mTheo, 'J\'ai battu Théo une dernière fois, à Bourg-Aube. Il part découvrir une autre région.'],
    ] },
  { id: 'rivalB', cat: 'main', name: (g) => `${rivalB(g).name}, de l'archipel`, giver: 'Prof. Saule',
    started: (f) => !!f.rivalB1, done: (f) => !!f.rivalB4,
    notes: [
      [(f) => f.rivalB1, (f, g) => { const B = rivalB(g); return `${B.name}, ${B.e ? 'la' : 'le'} ${B.fils} du Prof. Saule, est devenu${B.e} Garde d'Écaille. ${B.e ? 'Elle' : 'Il'} voulait voir ce que je valais.`; }],
      [(f) => f.rivalB2, (f, g) => `À Port-Granit, ${rivalB(g).name} a commencé à douter de Drakos.`],
      [(f) => f.rivalB3, (f, g) => `${rivalB(g).name} a quitté les Gardes d'Écaille après notre combat devant la Tour de Drakos.`],
      [(f) => f.rivalB4, (f, g) => `Au Cap des Étoiles, ${rivalB(g).name} et moi nous sommes battus sans uniforme ni camp.`],
    ] },

  /* ---------- les aventures (histoire de la Brume et nouveaux lieux) ---------- */
  { id: 'ponyta', cat: 'side', name: 'Le Ponyta de Lucie', giver: 'Lucie', started: atLeast('ponyta', 1), done: fin('ponyta'),
    notes: [
      [atLeast('ponyta', 1), 'Lucie, à Sylvebourg, s\'est fait voler son Ponyta par un individu vêtu de noir. Je lui ai promis de le retrouver.'],
      [atLeast('ponyta', 2), 'Les habitants de Sylvebourg ont vu le voleur filer vers le Bois Murmure.'],
      [atLeast('ponyta', 3), 'J\'ai rattrapé le voleur : un sbire d\'une bande qui se fait appeler « la Brume ».'],
      [atLeast('ponyta', 4), 'J\'ai délivré Ponyta de sa cage.'],
      [fin('ponyta'), 'Lucie a retrouvé son Ponyta. Mais qui est cette « Brume » ?'],
    ] },
  { id: 'lac', cat: 'side', name: 'Les eaux troubles du Lac Miroir', giver: 'Gaston', started: atLeast('lac', 1), done: fin('lac'),
    notes: [
      [atLeast('lac', 1), 'Gaston, à Rive-Claire, s\'inquiète : les pompes de la Brume troublent l\'eau du Lac Miroir.'],
      [atLeast('lac', 2), 'J\'ai arrêté les trois pompes de la Brume.'],
      [atLeast('lac', 3), 'J\'ai battu Sylas, un admin de la Brume. Il s\'est enfui.'],
      [atLeast('lac', 4), 'J\'ai rattrapé Sylas dans la Grotte des Marées. Quelque chose s\'éveille au fond de l\'eau.'],
      [atLeast('lac', 5), 'J\'ai rencontré la gardienne du lac.'],
      [fin('lac'), 'Le Lac Miroir a retrouvé son eau claire. Gaston m\'a confié son Lokhlass.'],
    ] },
  { id: 'courrier', cat: 'side', name: 'Le courrier perdu', giver: 'Le facteur', started: atLeast('courrier', 1), done: fin('courrier'),
    notes: [
      [atLeast('courrier', 1), 'Le facteur de Port-Azur m\'a confié quatre lettres qu\'il n\'arrivait pas à distribuer.'],
      [atLeast('courrier', 2), 'Les quatre lettres sont arrivées à leurs destinataires.'],
      [fin('courrier'), 'Le facteur m\'a remercié pour ma tournée.'],
    ] },
  { id: 'songes', cat: 'side', name: 'Les nuits blanches de Floralia', giver: 'Hélène', started: atLeast('songes', 1), done: fin('songes'),
    notes: [
      [atLeast('songes', 1), 'Hélène, à Floralia, s\'inquiète : les enfants de la ville font des cauchemars toutes les nuits.'],
      [atLeast('songes', 2), 'Le jardinier du Jardin des Songes m\'a parlé d\'une créature qui chasse les cauchemars.'],
      [atLeast('songes', 3), 'J\'ai trouvé une Plume Lune sur l\'îlot du Lac Miroir.'],
      [atLeast('songes', 4), 'Hélène a reçu la Plume Lune. Mais les cauchemars continuent.'],
      [atLeast('songes', 5), 'Une nuit, au jardin, j\'ai surpris Ariane, de la Brume, avec un étrange projecteur.'],
      [atLeast('songes', 6), 'J\'ai rattrapé Ariane au Temple Kagura. Darkrai rôde dans le sanctuaire.'],
      [atLeast('songes', 7), 'Darkrai s\'est apaisé.'],
      [fin('songes'), 'Les enfants de Floralia dorment de nouveau sur leurs deux oreilles.'],
    ] },
  { id: 'mine', cat: 'side', name: 'Le fond de la mine', giver: 'Albin', started: atLeast('mine', 1), done: fin('mine'),
    notes: [
      [atLeast('mine', 1), 'Albin, le chef mineur de Pierrefort, m\'a parlé d\'un fossile resté au fond de la mine, derrière un éboulement.'],
      [fin('mine'), 'Le Dr Silex a ranimé le fossile de la mine.'],
    ] },
  { id: 'kagura', cat: 'side', name: 'Les talismans du Temple Kagura', giver: 'Dame Hana', started: atLeast('kagura', 1), done: fin('kagura'),
    notes: [
      [atLeast('kagura', 1), 'Dame Hana, à Mirage, m\'a parlé de trois talismans volés au Temple Kagura.'],
      [atLeast('kagura', 2), 'J\'ai retrouvé les trois talismans.'],
      [atLeast('kagura', 3), 'Le Grand Prêtre du temple a reçu les talismans.'],
      [fin('kagura'), 'La cloche du Temple Kagura chante de nouveau. La Brume, elle, a emporté l\'Orbe Rouge.'],
    ] },
  { id: 'voeu', cat: 'side', name: 'Le vœu de la fontaine', giver: 'La fontaine', started: atLeast('voeu', 1), done: fin('voeu'),
    notes: [
      [atLeast('voeu', 1), 'La fontaine du Jardin des Songes réclame sept Éclats d\'Étoile.'],
      [atLeast('voeu', 2), 'Les sept Éclats d\'Étoile sont dans la fontaine. Une petite étoile s\'est posée sur un banc.'],
      [fin('voeu'), 'J\'ai rencontré Jirachi.'],
    ] },
  { id: 'magma', cat: 'side', name: 'Le cœur du volcan', giver: 'L\'Ancien de Fumerolle', started: atLeast('magma', 1), done: fin('magma'),
    notes: [
      [atLeast('magma', 1), 'L\'Ancien de Fumerolle m\'a appris que la Brume s\'est installée sur l\'Île du Magma, avec l\'Orbe Rouge.'],
      [atLeast('magma', 2), 'J\'ai battu Sylas dans la base de la Brume. Nox, leur chef, s\'est enfui.'],
      [atLeast('magma', 3), 'J\'ai rattrapé Nox dans la Caverne du Magma. Groudon s\'est réveillé.'],
      [atLeast('magma', 4), 'Le volcan s\'est apaisé.'],
      [fin('magma'), 'La Brume est dissoute. L\'Ancien m\'a remis sa Master Ball.'],
    ] },
  { id: 'fossile', cat: 'side', name: 'Le dragon de pierre', giver: 'Le savant du musée', started: atLeast('fossile', 1), done: fin('fossile'),
    notes: [
      [atLeast('fossile', 1), 'Le savant du Musée des Dragons rêve de ranimer un Pokémon d\'avant l\'histoire.'],
      [fin('fossile'), 'Le savant a ranimé un Ptéra à partir du Vieil Ambre.'],
    ] },

  /* ---------- les légendes ---------- */
  { id: 'celebi', cat: 'legend', name: 'La Balle GS', giver: 'Une vieille dame', started: (f) => !!f.gsGiven, done: (f) => !!f['L:celebi'],
    notes: [
      [(f) => f.gsGiven, 'Une vieille dame de Sylvebourg m\'a confié la Balle GS, trouvée près d\'un vieil autel du Bois Murmure.'],
      [(f) => f.celebiCalled, 'J\'ai posé la Balle GS sur l\'autel.'],
      [(f) => f['L:celebi'], 'Celebi, le gardien de la forêt, est apparu.'],
    ] },
  { id: 'orage', cat: 'legend', name: 'Les relais de l\'Île Orageuse', giver: 'Le gardien du phare', started: (f) => !!f.orageQuest, done: (f) => !!f['L:zapdos'],
    notes: [
      [(f) => f.orageQuest, 'Le gardien du phare de Port-Orage m\'a demandé de rallumer les trois relais de l\'île.'],
      [(f) => [1, 2, 3].some((k) => f['P:' + k]) && !f.pylons, (f) => `J'ai rallumé ${[1, 2, 3].filter((k) => f['P:' + k]).length} relais sur 3.`],
      [(f) => f.pylons, 'Les trois relais sont rallumés. Le Pic Tonnerre s\'est couvert d\'éclairs.'],
      [(f) => f['L:zapdos'], 'J\'ai affronté Électhor, l\'oiseau de foudre.'],
    ] },
  { id: 'mew', cat: 'legend', name: 'Les stèles des ruines', giver: 'Les stèles', started: (f) => !!(f['S:1'] || f['S:2'] || f['S:3']), done: (f) => !!f['L:mew'],
    notes: [
      [(f) => f['S:1'] || f['S:2'] || f['S:3'], 'Une stèle de la Côte des Ruines parle d\'une créature minuscule, rose comme l\'aube.'],
      [(f) => f['S:1'] && f['S:2'] && f['S:3'], 'J\'ai lu les trois stèles.'],
      [(f) => f['L:mew'], 'Mew a dansé sur l\'autel.'],
    ] },
  { id: 'hooh', cat: 'legend', name: 'La Plume Arc-en-ciel', giver: 'Doyenne Amaya', started: (f) => !!f.grueQuest, done: (f) => !!f['L:hooh'],
    notes: [
      [(f) => f.grueQuest, 'La doyenne de Hautegrue m\'a raconté la légende de Ho-Oh et de la Plume Arc-en-ciel.'],
      [(f) => f.plume, 'Le Grand Sage Hoël m\'a confié la Plume Arc-en-ciel.'],
      [(f) => f['L:hooh'], 'Ho-Oh s\'est posé sur la Tour de la Grue.'],
    ] },
  { id: 'betes', cat: 'legend', name: 'Les trois bêtes', giver: 'La Tour de la Grue', started: (f) => !!f.beasts, done: (f) => !!(f['L:raikou'] && f['L:entei'] && f['L:suicune']),
    notes: [
      [(f) => f.beasts, 'À la Tour de la Grue, Raikou, Entei et Suicune se sont enfuis devant moi et se sont dispersés dans les îles.'],
      [(f) => f['L:raikou'], 'J\'ai croisé Raikou.'], [(f) => f['L:entei'], 'J\'ai croisé Entei.'], [(f) => f['L:suicune'], 'J\'ai croisé Suicune.'],
    ] },
  { id: 'ermite', cat: 'legend', name: 'Le gardien des mers', giver: 'L\'Ermite', started: (f) => !!f.ermite, done: (f) => f['L:lugia'] === 'caught' || (!!f['L:lugia'] && !!f.lugia),
    notes: [
      [(f) => f.ermite, 'L\'Ermite de Givrebourg m\'a parlé de Lugia, qui dort sous l\'Île Givrée.'],
      [(f) => f['L:articuno'], 'J\'ai affronté Artikodin sur la Cime Givrée.'],
      [(f) => f.plumeArgent, 'J\'ai la Plume Argentée.'],
      [(f) => f['L:lugia'], 'J\'ai revu Lugia, apaisé.'],
    ] },
  { id: 'odyssor', cat: 'legend', name: 'Le géant des océans', giver: 'Drakos', started: (f, g) => !!g.state.badges[7], done: (f) => !!f.odyssorMet,
    notes: [
      [(f, g) => g.state.badges[7], 'Drakos m\'a ouvert le Cap des Étoiles, où passe parfois Odyssor, le géant des océans.'],
      [(f) => f.odyssorMet, (f) => (f.odyssor === 'caught' ? 'Odyssor a rejoint mon équipe.' : 'J\'ai vu Odyssor glisser entre les vagues.')],
    ] },

  /* ---------- les habitants ---------- */
  { id: 'qMedaillon', cat: 'npc', name: 'Le médaillon de Margaux', giver: 'Margaux', started: (f) => !!f['A:qMedaillon'], done: (f) => !!f.qMedaillon,
    notes: [[(f) => f['A:qMedaillon'], 'Margaux, à Sylvebourg, a perdu le médaillon de sa grand-mère dans le Bois Murmure.'], [(f) => f.qMedaillon, 'J\'ai rendu son médaillon à Margaux.']] },
  { id: 'qMagicarpe', cat: 'npc', name: 'Le spécimen du pêcheur', giver: 'Un pêcheur', started: (f) => !!f['A:qMagicarpe'], done: (f) => !!f.qMagicarpe,
    notes: [[(f) => f['A:qMagicarpe'], 'Un pêcheur de Port-Azur voudrait voir un Magicarpe.'], [(f) => f.qMagicarpe, 'Le pêcheur a admiré mon Magicarpe.']] },
  { id: 'qRoche', cat: 'npc', name: 'L\'observation géologique', giver: 'Un géologue', started: (f) => !!f['A:qRoche'], done: (f) => !!f.qRoche,
    notes: [[(f) => f['A:qRoche'], 'Un géologue de Pierrefort collectionne les observations de Pokémon Roche.'], [(f) => f.qRoche, 'Le géologue a observé mon Pokémon Roche.']] },
  { id: 'qEchange', cat: 'npc', name: 'L\'échange de Bastien', giver: 'Bastien', started: (f) => !!f['A:qEchange'], done: (f) => !!f.qEchange,
    notes: [[(f) => f['A:qEchange'], 'Bastien, à Voltacité, voudrait échanger son Magnéti, Boulon, contre un Roucool.'], [(f) => f.qEchange, 'J\'ai échangé un Roucool contre Boulon.']] },
  { id: 'qNiveau', cat: 'npc', name: 'Les sources chaudes', giver: 'Un vétéran', started: (f) => !!f['A:qNiveau'], done: (f) => !!f.qNiveau,
    notes: [[(f) => f['A:qNiveau'], 'Le vétéran des sources chaudes de Cendrelune n\'accepte que les Pokémon aguerris.'], [(f) => f.qNiveau, 'Le vétéran a salué mon Pokémon.']] },
  { id: 'dexpert', cat: 'npc', name: 'Les recherches du chercheur', giver: 'Un chercheur', started: (f) => !!(f['A:dexpert'] || f.dex25), done: (f) => !!f.dex80,
    notes: [[(f) => f['A:dexpert'] || f.dex25, 'Un chercheur de Mirage récompense les dresseurs qui remplissent leur Pokédex.'], [(f) => f.dex25, 'Il a vu 25 Pokémon dans mon Pokédex.'], [(f) => f.dex50, 'Puis 50.'], [(f) => f.dex80, 'Puis 80. Il n\'a plus rien à m\'apprendre.']] },
  ...MISSIONS.map((M) => ({ id: M.id, cat: M.cat || 'npc', name: M.journal.name, giver: M.who,
    started: (f) => !!f['A:' + M.id], done: (f) => !!f[M.id],
    notes: [[(f) => f['A:' + M.id], M.journal.start], [(f) => f[M.id], M.journal.end]] })),
];

/* ======================================================================
   Lecture du journal
   ====================================================================== */
const txt = (v, f, g) => (typeof v === 'function' ? v(f, g) : v);
/** temps de jeu écoulé depuis t, en clair (« 2 h 05 », « 12 min ») */
export function since(game, t) {
  if (t == null || t < 0) return 'il y a longtemps';
  const s = Math.max(0, (game.state.time || 0) - t), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `il y a ${h} h ${String(m).padStart(2, '0')} de jeu` : m ? `il y a ${m} min de jeu` : 'à l\'instant';
}

/** toutes les quêtes acceptées (en cours et terminées), les plus récentes d'abord */
export function getAllQuests(game) {
  const st = game.state || {}, f = st.flags || {}, J = st.journal || {};
  const out = [];
  for (const Q of QUESTS) {
    let started = false, done = false;
    try { started = !!Q.started(f, game); done = started && !!Q.done(f, game); } catch (e) { continue; }
    if (!started) continue;
    const notes = [];
    for (const [cond, t] of Q.notes) { try { if (cond(f, game)) notes.push(txt(t, f, game)); } catch (e) { /* drapeau absent */ } }
    const j = J[Q.id] || {};
    out.push({
      id: Q.id, cat: Q.cat, name: txt(Q.name, f, game), giver: Q.giver, status: done ? 'done' : 'active',
      notes, note: notes[notes.length - 1] || '', since: since(game, j.t), at: j.t ?? -1, doneAt: j.d ?? null,
      isTracked: st.trackedQuest === Q.id,
      // compatibilité avec l'ancien écran et le HUD
      stepDesc: notes[notes.length - 1] || '', destination: '',
    });
  }
  out.sort((a, b) => (a.status === b.status ? (b.at - a.at) : a.status === 'active' ? -1 : 1));
  return out;
}

/** la quête suivie (affichée dans le HUD) : celle choisie, sinon la plus récente en cours */
export function getTrackedQuest(game) {
  const all = getAllQuests(game).filter((q) => q.status === 'active');
  const id = game.state?.trackedQuest;
  return (id && all.find((q) => q.id === id)) || null;
}
export function setTrackedQuest(game, questId) {
  if (!game.state) return;
  game.state.trackedQuest = game.state.trackedQuest === questId ? null : questId;
  game.save?.(true);
}

/** note dans le journal l'heure (en temps de jeu) où chaque quête est acceptée, puis terminée ;
 *  renvoie les quêtes qui viennent d'apparaître (pour l'annoncer au joueur) */
export function syncJournal(game) {
  const st = game.state; if (!st) return [];
  const legacy = !st.journal; st.journal ||= {};
  const fresh = [], f = st.flags || {};
  for (const Q of QUESTS) {
    let started = false, done = false;
    try { started = !!Q.started(f, game); done = started && !!Q.done(f, game); } catch (e) { continue; }
    if (!started) continue;
    let j = st.journal[Q.id];
    if (!j) { j = st.journal[Q.id] = { t: legacy ? -1 : Math.round(st.time || 0) }; if (!legacy) fresh.push({ id: Q.id, name: txt(Q.name, f, game), done }); }
    if (done && j.d == null) j.d = Math.round(st.time || 0);
  }
  return fresh;
}

export const QUEST_COUNT = QUESTS.length;
