// odyssee/js/world/habitants.js — les requêtes des habitants : une vingtaine de petites quêtes dans les villes, pour que
// la région vive (un goûter à porter, des jumelles oubliées, une bouteille à la mer, des dresseurs trop collants…),
// et deux combats d'après la Ligue qui ferment l'histoire (la revanche de Drakos, le dernier duel contre Théo).
// Sans DOM : les PNJ reçoivent un `mission` que joue js/story.js ; le journal (core/questsData.js) lit MISSIONS.
//
// Une mission : un PNJ qui demande (« ask »), accepte la quête (drapeau `A:id`), et la termine (drapeau `id`) quand
//   show  : on lui montre un Pokémon qui convient (test)
//   bring : on lui rapporte un objet (item × qty, posé quelque part dans la région : place)
//   check : une condition est remplie (des dresseurs battus, un lieu visité de nuit, un Pokémon enregistré…)
//   relay : il confie un objet à porter à un autre habitant (to) ; c'est ce dernier qui termine la quête
//   duel  : il propose un combat (après la Ligue)
// `journal` : le nom de la quête et les phrases du journal (quand on l'accepte, quand on la termine) — sans indice.
import { T, walkable } from './tiles.js';
import { along, nearestWalkable } from './mapgen.js';
import { ITEMS } from '../core/items.js';
import { SPECIES } from '../data/species.js';

/* objets de quête (poche des Objets rares) */
Object.assign(ITEMS, {
  'panier-gouter': { pocket: 'cles', price: 0, key: true, icon: 'gift', name: 'Panier-goûter', desc: 'Le goûter de Nils, préparé par sa maman : des sandwichs et une part de tarte aux Baies.' },
  jumelles: { pocket: 'cles', price: 0, key: true, icon: 'scope-lens', name: 'Jumelles', desc: 'De vieilles jumelles de cuivre. Gravé dessus : « Gustave, Sylvebourg ».' },
  'casque-mineur': { pocket: 'cles', price: 0, key: true, icon: 'explorer-kit', name: 'Casque de mineur', desc: 'Un casque jaune cabossé, avec une lampe frontale. Il appartient à un mineur de Pierrefort.' },
  'lettre-mineurs': { pocket: 'cles', price: 0, key: true, icon: 'letter', name: 'Lettre des mineurs', desc: 'Une lettre signée par tous les mineurs de Pierrefort, pour la mère de Basalte.' },
  'bouteille-mer': { pocket: 'cles', price: 0, key: true, icon: 'fresh-water', name: 'Bouteille à la mer', desc: 'Une bouteille avec un message : « Je suis Sven, pêcheur à Givrebourg. Écris-moi ! »' },
  'flacon-parfum': { pocket: 'cles', price: 0, key: true, icon: 'gift', name: 'Flacon de parfum', desc: 'Un parfum de fleurs de Floralia, pour Madame Opaline, à Mirage.' },
  'collier-miaouss': { pocket: 'cles', price: 0, key: true, icon: 'soothe-bell', name: 'Collier à clochette', desc: 'Un petit collier rouge avec une clochette. Celui d\'un Miaouss ?' },
  clochette: { pocket: 'cles', price: 0, key: true, icon: 'cleanse-tag', name: 'Clochette de vent', desc: 'Une clochette du Jardin de la Grue, emportée par la tempête. Il y en a trois.' },
});

// la Master Ball (donnée par le Dr Lumen, le chercheur de Mirage, l'Ancien de Fumerolle et Drakos) : connue dès le départ
if (!ITEMS['master-ball']) ITEMS['master-ball'] = { pocket: 'balls', price: 0, ball: 255, desc: 'La meilleure Ball qui soit. Elle capture à coup sûr.' };

const has = (t) => (m) => SPECIES[m.sp]?.t.includes(t);
const caughtOfType = (st, t) => st.dex.caught.filter((sp) => SPECIES[sp]?.t.includes(t)).length;

/* ======================================================================
   Les missions
   ====================================================================== */
export const MISSIONS = [
  { id: 'mPanier', town: 'A', at: [7, 14], sprite: 'habitante', who: 'Mme Rose', kind: 'relay', item: 'panier-gouter',
    to: { town: 'B', at: [12, 16], sprite: 'gamin', who: 'Nils', reward: [['super-potion', 2]],
      idle: ['Je suis venu tout seul jusqu\'à Sylvebourg ! Mais... j\'ai un peu faim.'],
      thanks: ['Mon goûter ! Maman pense vraiment à tout.', 'Tiens, prends ça. Maman dit qu\'il faut toujours en avoir sur soi.'],
      done: ['Miam ! Je vais pouvoir aller voir l\'Arène d\'Hector.'] },
    ask: ['Bonjour ! Mon fils Nils est parti ce matin pour Sylvebourg, et il a oublié son goûter.', 'Tu vas vers le nord, toi aussi ? Tu veux bien lui apporter ce panier ?'],
    wait: ['Nils doit avoir faim, le pauvre...'], done: ['Nils a eu son goûter ? Merci, tu es un amour !'],
    journal: { name: 'Le goûter de Nils', start: 'Mme Rose, à Bourg-Aube, m\'a confié le goûter de son fils Nils, parti pour Sylvebourg.', end: 'Nils a eu son goûter.' } },

  { id: 'mInsecte', town: 'B', at: [24, 21], sprite: 'insectomane', who: 'Jules', kind: 'show', test: (m, st) => has('bug')(m) && m.ot === st.name, reward: [['great-ball', 3]],
    ask: ['Je suis le plus grand chasseur d\'insectes de Sylvebourg ! Enfin... après Hector.', 'Montre-moi un Pokémon Insecte que tu as attrapé toi-même !'],
    again: ['Alors, ce Pokémon Insecte ? Attrapé de tes mains, hein !'],
    thanks: ['Pas mal du tout ! On voit que tu l\'as bien choisi.', 'Tiens, des Super Balls. Les insectes rapides s\'échappent souvent.'], done: ['Un jour, j\'aurai mon arène à moi !'],
    journal: { name: 'Le chasseur d\'insectes', start: 'Jules, un chasseur d\'insectes de Sylvebourg, veut voir un Pokémon Insecte que j\'ai capturé moi-même.', end: 'Jules a vu mon Pokémon Insecte. Il m\'a donné des Super Balls.' } },

  { id: 'mJumelles', town: 'B', at: [3, 13], sprite: 'vieil_homme', who: 'Papi Gustave', kind: 'bring', item: 'jumelles', place: { route: 'bois', t: 0.36, side: 1, off: 6 }, reward: [['rare-candy', 1]],
    ask: ['Mes jumelles ! Je les ai posées pour observer un Coxy dans le Bois Murmure... et je suis rentré sans elles.', 'Mes jambes ne me portent plus aussi loin. Si tu les vois, rapporte-les-moi.'],
    again: ['Mes jumelles... Tu ne les aurais pas vues ?'],
    thanks: ['Mes jumelles ! Je vais enfin revoir les Coxy danser.', 'Prends ça, tu l\'as bien mérité.'], done: ['Regarde là-haut... un Roucool qui plane !'],
    journal: { name: 'Les jumelles de Gustave', start: 'Papi Gustave, à Sylvebourg, a oublié ses jumelles dans le Bois Murmure.', end: 'J\'ai rendu ses jumelles à Papi Gustave.' } },

  { id: 'mCasque', town: 'C', at: [25, 22], sprite: 'montagnard', who: 'Firmin', kind: 'bring', item: 'casque-mineur', place: { cave: 'grotte', x: 22, y: 12 }, reward: [['escape-rope', 3], ['moon-stone', 1]],
    ask: ['La Team Éclipse a semé la pagaille dans la Grotte Lunaire. J\'ai filé si vite que j\'y ai laissé mon casque !', 'Un casque jaune, avec une lampe. Il est quelque part dans les galeries.'],
    again: ['Mon casque... Sans lui, pas question de redescendre à la mine.'],
    thanks: ['Mon casque ! Avec ça, je retourne à la mine dès demain.', 'Voilà de quoi sortir des grottes, et une Pierre Lune que j\'ai trouvée là-dessous.'], done: ['La mine reprend du service !'],
    journal: { name: 'Le casque de Firmin', start: 'Firmin, un mineur de Pierrefort, a perdu son casque en fuyant la Team Éclipse dans la Grotte Lunaire.', end: 'Firmin a retrouvé son casque.' } },

  { id: 'mLettre', town: 'C', at: [28, 9], sprite: 'vieil_homme', who: 'Vieux Léon', kind: 'relay', item: 'lettre-mineurs',
    to: { town: 'K', at: [26, 14], sprite: 'habitante', who: 'Mère Ardoise', reward: [['hyper-potion', 3]],
      idle: ['Je suis la mère des trois frères. Drakos, Pyros, Basalte...', 'Ils ne viennent plus me voir. Le continent non plus.'],
      thanks: ['Une lettre de Pierrefort ? Les mineurs se souviennent de mon Basalte...', 'Mes trois garçons se sont perdus dans la rancune de l\'aîné.', 'Merci, petit. Prends ça. Et si tu les croises, dis-leur que leur mère les attend pour dîner.'],
      done: (st) => (st.badges[7] ? ['Ils sont venus dîner, tous les trois. Pour la première fois depuis dix ans.'] : ['Basalte m\'a répondu. Les choses changent, je crois.']) },
    ask: ['Basalte travaillait ici, avec nous. Le meilleur mineur que j\'aie connu.', 'Sa mère vit toujours à Port-Granit, sur l\'Île de Granit. Elle n\'a plus de nouvelles du continent depuis que Drakos a fermé les ports.', 'Si un jour tu passes là-bas, apporte-lui cette lettre de la part des mineurs.'],
    wait: ['L\'Île de Granit est loin, au-delà du Cap Mirage. Prends ton temps.'], done: ['La mère de Basalte a eu notre lettre ? Les mineurs vont être contents.'],
    journal: { name: 'Des nouvelles du continent', start: 'Le vieux Léon, à Pierrefort, m\'a confié une lettre des mineurs pour la mère de Basalte, qui vit à Port-Granit.', end: 'La mère des trois frères a reçu la lettre des mineurs.' } },

  { id: 'mBouteille', town: 'D', at: [8, 5], sprite: 'enfant', who: 'Lison', kind: 'relay', item: 'bouteille-mer',
    to: { town: 'V', at: [21, 13], sprite: 'pecheur', who: 'Sven', reward: [['ultra-ball', 5]],
      idle: ['Il y a quelques années, j\'ai jeté une bouteille à la mer. Je me demande où elle a fini...'],
      thanks: ['Ma bouteille ! Elle a traversé toute la mer de l\'Est ?', 'Une petite fille de Port-Azur l\'a trouvée ? Ça me réchauffe le cœur. Tiens, pour la route.'],
      done: ['J\'ai écrit à Lison. Le capitaine du bateau lui portera ma lettre.'] },
    ask: ['Regarde ce que j\'ai trouvé sur la plage : une bouteille avec un message !', '« À qui trouvera cette bouteille : je suis Sven, pêcheur à Givrebourg, tout au nord. Écris-moi ! »', 'Givrebourg, c\'est trop loin pour moi... Tu veux bien la lui rapporter ?'],
    wait: ['Givrebourg, c\'est sur une île tout au nord, je crois.'], done: ['Sven m\'a écrit ! Il dit qu\'il neige tout le temps chez lui.'],
    journal: { name: 'La bouteille à la mer', start: 'Lison, à Port-Azur, a trouvé sur la plage une bouteille à la mer envoyée par Sven, un pêcheur de Givrebourg.', end: 'Sven a récupéré sa bouteille, et il a écrit à Lison.' } },

  { id: 'mCapitaine', town: 'D', at: [29, 23], sprite: 'marin', who: 'Capitaine Corentin', kind: 'check', test: (st) => caughtOfType(st, 'water') >= 10, reward: [['water-stone', 1], ['ultra-ball', 3]],
    ask: ['Je tiens le registre des Pokémon de la mer depuis quarante ans.', 'Enregistre dix Pokémon Eau dans ton Pokédex, et je te ferai une place dans mon registre !'],
    again: (st) => [`Ton Pokédex compte ${caughtOfType(st, 'water')} Pokémon Eau. Il m\'en faut dix !`],
    thanks: ['Dix Pokémon Eau ! Tu as l\'âme d\'un marin.', 'Ton nom est dans mon registre. Et voici pour toi.'], done: ['La mer t\'a adopté, moussaillon.'],
    journal: { name: 'Le registre du capitaine', start: 'Le capitaine Corentin, à Port-Azur, veut que j\'enregistre dix Pokémon Eau dans mon Pokédex.', end: 'Mon nom est dans le registre du capitaine Corentin.' } },

  { id: 'mWatt', town: 'E', at: [23, 22], sprite: 'scientifique', who: 'Mlle Watt', kind: 'show', test: (m) => has('electric')(m) && m.lvl >= 25, reward: [['thunder-stone', 1], ['elixir', 1]],
    ask: ['Depuis que la Team Éclipse a vidé les générateurs, je cherche des Pokémon Électrik puissants pour relancer mes expériences.', 'Montre-moi un Pokémon Électrik d\'au moins le niveau 25 !'],
    again: ['Un Pokémon Électrik, niveau 25 au moins. Je suis prête à mesurer !'],
    thanks: ['Regarde-moi ces étincelles ! Mon voltmètre s\'affole.', 'Merci ! Prends ça pour ta peine.'], done: ['Mes expériences avancent à pleine tension !'],
    journal: { name: 'Haute tension', start: 'Mlle Watt, chercheuse à Voltacité, veut mesurer un Pokémon Électrik d\'au moins le niveau 25.', end: 'Mlle Watt a pu mesurer mon Pokémon Électrik.' } },

  { id: 'mLivreur', town: 'E', at: [13, 23], sprite: 'habitant', who: 'M. Fernand', kind: 'check', test: (st, g) => g.missionTrainers('r5').every((id) => st.flags['T:' + id]), reward: [['rare-candy', 1], ['super-repel', 3]],
    ask: ['Je livre des colis à Floralia par la route 5, mais tous ces dresseurs m\'arrêtent pour se battre !', 'Si quelqu\'un les battait tous, ils me laisseraient peut-être tranquille...'],
    again: (st, g) => { const L = g.missionTrainers('r5'), k = L.filter((id) => st.flags['T:' + id]).length; return [`Il reste encore ${L.length - k} dresseur${L.length - k > 1 ? 's' : ''} qui m'arrête${L.length - k > 1 ? 'nt' : ''} sur la route 5...`]; },
    thanks: ['Ils m\'ont laissé passer sans un mot ! C\'est toi qui les as tous battus ?', 'Prends ça, c\'était dans un colis que personne n\'est venu chercher.'], done: ['Mes colis arrivent à l\'heure, maintenant !'],
    journal: { name: 'Le livreur de Voltacité', start: 'M. Fernand, livreur à Voltacité, n\'en peut plus d\'être arrêté par les dresseurs de la route 5.', end: 'Plus personne n\'arrête M. Fernand sur la route 5.' } },

  { id: 'mHibou', town: 'E', at: [28, 14], sprite: 'enfant', who: 'Timéo', kind: 'show', test: (m) => [163, 164, 1015, 1016].includes(m.sp), reward: [['great-ball', 3]],
    ask: ['Mon livre dit que les Hoothoot ne sortent que la nuit.', 'Mais maman ne veut pas que je sorte le soir... Tu m\'en montrerais un ?'],
    again: ['Un Hoothoot ! Ou un Noarfang ! S\'il te plaît !'],
    thanks: ['Waouh ! Il tourne la tête dans tous les sens !', 'Tiens, c\'est mon trésor, mais tu le mérites.'], done: ['Quand je serai grand, j\'irai les voir la nuit !'],
    journal: { name: 'Le hibou de la nuit', start: 'Timéo, à Voltacité, rêve de voir un Hoothoot, qui ne sort que la nuit.', end: 'Timéo a vu son Pokémon hibou.' } },

  { id: 'mFee', town: 'F', at: [27, 26], sprite: 'fillette', who: 'Rosalie', kind: 'show', test: has('fairy'), reward: [['shiny-stone', 1]],
    ask: ['Grand-mère dit que les Pokémon Fée aiment les jardins fleuris de Floralia.', 'Je n\'en ai jamais vu un seul... Tu m\'en montrerais un ?'],
    again: ['Un Pokémon Fée... Ils existent vraiment ?'],
    thanks: ['Il est encore plus joli que dans mes rêves !', 'Tiens, une pierre qui brille comme lui.'], done: ['Je planterai des fleurs pour les attirer !'],
    journal: { name: 'Les fées de Floralia', start: 'Rosalie, à Floralia, n\'a jamais vu de Pokémon Fée.', end: 'Rosalie a vu un Pokémon Fée.' } },

  { id: 'mParfum', town: 'F', at: [6, 14], sprite: 'dame', who: 'Mme Héliotrope', kind: 'relay', item: 'flacon-parfum',
    to: { town: 'G', at: [7, 21], sprite: 'medium', who: 'Madame Opaline', reward: [['dusk-stone', 1]],
      idle: ['Les parfums de Floralia me manquent... À Mirage, tout sent l\'encens.'],
      thanks: ['Le parfum d\'Héliotrope ! Ses fleurs me rappellent ma jeunesse.', 'Prends cette pierre. Elle vient du crépuscule, comme moi.'],
      done: ['Chaque matin, une goutte de parfum, et je revois les jardins de Floralia.'] },
    ask: ['Je suis parfumeuse. Mon amie Opaline, à Mirage, m\'a commandé mon parfum de fleurs.', 'Mais la route de Mirage est longue... Tu passeras par là ? Apporte-lui ce flacon.'],
    wait: ['Opaline vit à Mirage. Elle attend son parfum.'], done: ['Opaline a eu son parfum ? Elle m\'a écrit une lettre adorable.'],
    journal: { name: 'Le parfum d\'Héliotrope', start: 'Mme Héliotrope, parfumeuse à Floralia, m\'a confié un flacon pour son amie Opaline, à Mirage.', end: 'Madame Opaline a reçu son parfum.' } },

  { id: 'mReves', town: 'G', at: [26, 21], sprite: 'medium', who: 'Séraphine', kind: 'check', test: (st) => !!st.flags['VN:jardin'], reward: [['full-heal', 2], ['rare-candy', 1]],
    ask: ['Le Jardin des Songes... Les nuits de lune, les rêves y prennent forme.', 'Va t\'y promener une nuit, et reviens me dire ce que tu as ressenti.'],
    again: ['Une nuit au Jardin des Songes. Pas le jour : la nuit.'],
    thanks: ['Je le vois dans tes yeux : tu y es allé, la nuit.', 'Garde ceci. Ça veille sur les dormeurs.'], done: ['Fais de beaux rêves, voyageur.'],
    journal: { name: 'Une nuit au jardin', start: 'Séraphine, à Mirage, m\'a demandé de me promener une nuit au Jardin des Songes.', end: 'J\'ai raconté ma nuit au Jardin des Songes à Séraphine.' } },

  { id: 'mPierreFeu', town: 'H', at: [26, 22], sprite: 'habitante', who: 'Salomé', kind: 'bring', item: 'fire-stone', reward: [['full-restore', 1], ['burn-heal', 3]],
    ask: ['Mon Goupix rêve d\'évoluer, mais on ne trouve plus aucune Pierre Feu sur l\'île depuis que les ports sont fermés.', 'Si tu en as une, je te l\'échange contre de quoi soigner ton équipe !'],
    again: ['Une Pierre Feu... On en vendait dans les boutiques du continent.'],
    thanks: ['Une Pierre Feu ! Goupix, regarde !', 'Voilà, comme promis.'], done: ['Mon Feunard est magnifique, non ?'],
    journal: { name: 'La pierre de Goupix', start: 'Salomé, à Cendrelune, cherche une Pierre Feu pour faire évoluer son Goupix.', end: 'Le Goupix de Salomé est devenu un Feunard.' } },

  { id: 'mRacket', town: 'K', at: [26, 8], sprite: 'pecheur', who: 'Gaël', kind: 'check', test: (st, g) => g.missionTrainers('r11').every((id) => st.flags['T:' + id]), reward: [['ultra-ball', 4]],
    ask: ['Sur la Grande Île, deux Gardes d\'Écaille arrêtent les pêcheurs pour prélever « la part de Drakos ».', 'Si quelqu\'un leur donnait une bonne leçon...'],
    again: ['Ces deux gardes sont sur la route qui mène à Fort-Écaille.'],
    thanks: ['Ronan et Solène ont rendu nos pêches ? C\'est grâce à toi !', 'Tiens. Les pêcheurs de Granit n\'oublient pas.'], done: ['On pêche de nouveau sans peur.'],
    journal: { name: 'La part de Drakos', start: 'Gaël, pêcheur de Port-Granit, se plaint de deux Gardes d\'Écaille qui rackettent les pêcheurs sur la Grande Île.', end: 'Les deux Gardes d\'Écaille ont rendu les pêches de Granit.' } },

  { id: 'mDoute', town: 'L', at: [33, 25], sprite: 'garde', who: 'Garde Yvon', kind: 'check', test: (st) => !!st.badges[7], reward: [['max-potion', 2], ['full-restore', 1]],
    ask: ['Je sers Drakos depuis dix ans. Mais je ne reconnais plus l\'homme qui nous a recrutés.', 'Il faudrait que quelqu\'un le batte. Pour qu\'il se souvienne de qui il était.'],
    again: ['Drakos t\'attend dans sa tour. Moi, je n\'ose pas le défier.'],
    thanks: ['Drakos a perdu ? Et il a rouvert les ports...', 'Alors je peux enfin rentrer chez moi, à Port-Azur. Prends ça, je n\'en aurai plus besoin.'], done: ['Je pars demain par le premier bateau.'],
    journal: { name: 'Le garde qui doutait', start: 'Le garde Yvon, à Fort-Écaille, doute de Drakos et espère que quelqu\'un le batte.', end: 'Drakos a perdu, et Yvon rentre enfin chez lui.' } },

  { id: 'mMusee', town: 'I', at: [6, 22], sprite: 'scientifique', who: 'Conservatrice Ysé', kind: 'show', test: has('dragon'), reward: [['max-potion', 2]],
    ask: ['Le Musée des Dragons n\'a que des squelettes et des fresques. Moi, je rêve d\'étudier un dragon vivant.', 'Si tu en as un dans ton équipe, laisse-moi l\'observer !'],
    again: ['Un Pokémon Dragon... Même un tout petit !'],
    thanks: ['Ses écailles, ses yeux... Les fresques ne mentaient pas.', 'Merci ! Voici pour ton équipe.'], done: ['Mes notes vont faire trembler le musée !'],
    journal: { name: 'Un dragon vivant', start: 'La conservatrice du Musée des Dragons, à Cimelune, veut étudier un Pokémon Dragon vivant.', end: 'La conservatrice a pu étudier mon Pokémon Dragon.' } },

  { id: 'mCollier', town: 'O', at: [23, 12], sprite: 'fillette', who: 'Mila', kind: 'bring', item: 'collier-miaouss', place: { route: 'orage1', t: 0.62, side: -1, off: 6 }, reward: [['thunder-stone', 1]],
    ask: ['Mon Miaouss est revenu tout seul de sa promenade sur le Sentier Orageux... mais sans son collier !', 'Un collier rouge, avec une clochette. Tu l\'as peut-être vu ?'],
    again: ['Miaouss n\'arrête pas de miauler. Il veut son collier.'],
    thanks: ['Son collier ! Miaouss, regarde, il est là !', 'Tiens, une pierre que j\'ai trouvée après l\'orage.'], done: ['Ding ding ! On l\'entend arriver de loin.'],
    journal: { name: 'Le collier de Miaouss', start: 'Mila, à Port-Orage, cherche le collier que son Miaouss a perdu sur le Sentier Orageux.', end: 'Le Miaouss de Mila a retrouvé son collier.' } },

  { id: 'mClochettes', town: 'Q', at: [27, 21], sprite: 'pretre', who: 'Frère Anselme', kind: 'bring', item: 'clochette', qty: 3,
    place: [{ route: 'grue1', t: 0.3, side: -1, off: 5 }, { route: 'grue2', t: 0.55, side: 1, off: 5 }, { route: 'grue1', t: 0.85, side: 1, off: 5 }], reward: [['rare-candy', 2]],
    ask: ['La tempête a arraché les trois clochettes de vent du Jardin de la Grue.', 'Les Sages de la Tour Dorée venaient méditer à leur chant... Si tu les trouves, rapporte-les-moi.'],
    again: (st) => [`Il manque encore ${3 - (st.bag.clochette || 0)} clochette${3 - (st.bag.clochette || 0) > 1 ? 's' : ''}...`],
    thanks: ['Les trois clochettes ! Écoute : le jardin chante de nouveau.', 'Que le vent te porte, voyageur.'], done: ['Ding... Ding... Le jardin respire.'],
    journal: { name: 'Les clochettes de vent', start: 'Frère Anselme, à Hautegrue, a perdu les trois clochettes de vent du Jardin de la Grue dans la tempête.', end: 'Les trois clochettes chantent de nouveau au Jardin de la Grue.' } },

  { id: 'mGlace', town: 'V', at: [9, 18], sprite: 'enfant', who: 'Inuk', kind: 'show', test: has('ice'), reward: [['ice-heal', 3], ['ultra-ball', 2]],
    ask: ['Ici, tout le monde a un Pokémon Glace. Sauf moi...', 'Tu m\'en montres un ? Je veux voir s\'il a froid, lui aussi.'],
    again: ['Un Pokémon Glace ! On en trouve plein sur la Pente Givrée.'],
    thanks: ['Il n\'a pas froid du tout ! Moi, si.', 'Tiens, pour te réchauffer... euh, pour te dégeler.'], done: ['Un jour, j\'aurai le mien.'],
    journal: { name: 'Le Pokémon des glaces', start: 'Inuk, à Givrebourg, voudrait voir un Pokémon Glace.', end: 'Inuk a vu mon Pokémon Glace.' } },

  // après la Ligue : la fin de l'histoire des trois frères et de Théo
  { id: 'mRevanche', town: 'L', at: [22, 5], sprite: 'drakos', who: 'Drakos', kind: 'duel', showIf: 'champion', cat: 'main',
    duel: { cls: 'Champion', name: 'Drakos', bs: 'drakos', team: [[149, 64], [1051, 64], [1050, 63], [373, 64], [445, 65], [1044, 63]], prize: 300 },
    ask: ['Maître de la Ligue, hein ? Célestine a trouvé son héritière.', 'Je t\'avais dit que le vieux Drakos attendait sa revanche. Pas contre elle. Contre toi.', 'Cette fois, mes dragons ne retiendront rien.'],
    lose: 'Ha ! Je savais que tu ne me ferais pas de cadeau.',
    thanks: ['... Deux fois. Tu m\'as battu deux fois.', 'Ma mère m\'a dit : « Un frère qui perd avec honneur vaut mieux qu\'un roi qui gagne seul. »', 'Les îles sont ouvertes, pour de bon. Prends ceci, Maître.'], reward: [['master-ball', 1]],
    again: ['Prêt pour ma revanche ?'], done: ['Pyros et Basalte veulent t\'affronter aussi. Les îles t\'appartiennent, Maître.'],
    journal: { name: 'La revanche de Drakos', start: 'Drakos m\'a défié à Fort-Écaille : il voulait sa revanche contre le nouveau Maître de la Ligue.', end: 'J\'ai battu Drakos une seconde fois. Les îles sont ouvertes pour de bon.' } },

  { id: 'mTheo', town: 'A', at: [17, 21], sprite: 'theo', who: 'Théo', kind: 'duel', showIf: 'champion', cat: 'main',
    duel: { cls: 'Rival', name: 'Théo', bs: 'theo', team: (st, g) => { const R = g.rivalLine(); return [[1012, 62], [1035, 61], [1022, 62], [1040, 62], [1051, 63], [R[2], 65]]; }, prize: 200 },
    ask: [`Hé ! Le Maître de la Ligue revient à Bourg-Aube ?`, 'Tu te souviens de notre premier combat, au labo ? Moi, oui. Tous les jours.', 'On rejoue ? Là où tout a commencé. Sans retenue !'],
    lose: 'Encore toi... Toujours toi.',
    thanks: ['... Bon. Tu es vraiment le Maître.', 'Tu sais quoi ? Je vais partir pour une autre région. Voir des Pokémon que personne ici ne connaît.', 'Mais je reviendrai. Et ce jour-là, c\'est moi qui gagnerai ! Tiens, un souvenir.'], reward: [['rare-candy', 3]],
    again: ['Alors, on se le fait, ce dernier combat ?'], done: ['Je pars demain. Prends soin de Bourg-Aube pour moi !'],
    journal: { name: 'Là où tout a commencé', start: 'Théo m\'attendait à Bourg-Aube pour un dernier combat, là où tout a commencé.', end: 'J\'ai battu Théo une dernière fois. Il part découvrir une autre région.' } },
];

/** missions par identifiant (pour le journal) */
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

/* ======================================================================
   Pose des PNJ et des objets sur la carte
   ====================================================================== */
const key = (x, y) => x + ',' + y;
function free(m, x, y, avoidPath = true) {
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const a = x + dx, b = y + dy, t = m.get(a, b);
    if (!m.in(a, b) || !walkable(t) || t === T.DOOR || t === T.MAT || t === T.CAVEDOOR || t === T.STAIRS || t === T.TALL || t === T.DARKTALL) continue;
    if (m.npcs.some((n) => Math.abs(n.x - a) + Math.abs(n.y - b) < 2) || m.items.some((n) => n.x === a && n.y === b) || m.warpAt(a, b) || m.objectAt(a, b)) continue;
    if (m.get(a, b - 1) === T.DOOR || m.get(a, b + 1) === T.DOOR) continue;
    if (avoidPath && (t === T.PATH || t === T.PAVE || t === T.BRIDGE)) continue;
    return [a, b];
  }
  return avoidPath ? free(m, x, y, false) : [x, y];
}
function caveSpot(m, x, y) {
  for (let r = 0; r < 16; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const a = x + dx, b = y + dy;
    let ok = true; for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) if (m.get(a + i, b + j) !== T.CAVE) { ok = false; break; }
    if (ok && !m.npcs.some((n) => Math.abs(n.x - a) + Math.abs(n.y - b) < 2) && !m.items.some((n) => n.x === a && n.y === b) && !m.warpAt(a, b)) return [a, b];
  }
  return [x, y];
}

export function addHabitants({ W, maps, towns, routes }) {
  const route = (id) => routes.find((r) => r.id === id)?.pts;
  const placeItem = (p, item) => {
    if (p.cave) { const m = maps[p.cave]; const [x, y] = caveSpot(m, p.x, p.y); m.item(x, y, item); return; }
    const pts = route(p.route); if (!pts) return;
    const q = along(pts, p.t);
    const [x, y] = nearestWalkable(W, q.x + 0.5 + q.nx * p.side * p.off, q.y + 0.5 + q.ny * p.side * p.off);
    W.item(x, y, item);
  };
  // les dresseurs d'une route (pour « bats-les tous »)
  // chaque dresseur de la grande carte appartient à la route dont le tracé passe le plus près de lui
  const trainersOn = {};
  const segDist = (px, py, [ax, ay], [bx, by]) => { const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)); return Math.hypot(px - ax - u * vx, py - ay - u * vy); };
  for (const n of W.npcs) {
    if (!n.trainer || W.zoneAt(n.x, n.y)?.town) continue;
    let best = null, bd = 9;
    for (const r of routes) for (let i = 1; i < r.pts.length; i++) { const d = segDist(n.x, n.y, r.pts[i - 1], r.pts[i]); if (d < bd) { bd = d; best = r.id; } }
    if (best) (trainersOn[best] ||= []).push(n.id);
  }
  W.missionTrainers = trainersOn;
  for (const M of MISSIONS) {
    const t = towns[M.town]; if (!t) continue;
    const [x, y] = free(W, t.x + (t.decal?.[0] || 0) + M.at[0], t.y + (t.decal?.[1] || 0) + M.at[1]);   // decal : déplacement de l'ancien centre d'une ville agrandie
    W.npc({ id: `${t.id}:${M.id}`, x, y, sprite: M.sprite, dir: 'down', move: M.kind === 'duel' ? 'static' : 'turn', script: 'mission', mission: M, showIf: M.showIf });
    if (M.to) {
      const t2 = towns[M.to.town];
      const [x2, y2] = free(W, t2.x + (t2.decal?.[0] || 0) + M.to.at[0], t2.y + (t2.decal?.[1] || 0) + M.to.at[1]);
      W.npc({ id: `${t2.id}:${M.id}-dest`, x: x2, y: y2, sprite: M.to.sprite, dir: 'down', move: 'turn', script: 'mission', mission: { ...M, role: 'receiver' } });
    }
    if (M.place) for (const p of [].concat(M.place)) placeItem(p, M.item);
  }
}
void key;
