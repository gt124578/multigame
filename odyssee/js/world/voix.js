// odyssee/js/world/voix.js — ce que disent les habitants des nouveaux quartiers et les promeneurs des routes.
// Des conseils de dresseur, des nouvelles du coin, des petites histoires ; rien qui dévoile l'histoire principale.
// GENERAL : partout ; VILLES[thème] : propre à une ville ; ROUTES[paysage] : le long des routes.

export const GENERAL = [
  ['Une attaque du même type que le Pokémon qui la lance frappe moitié plus fort.', 'Pense à varier quand même !'],
  ['Quand un Pokémon sauvage est endormi ou paralysé, il se laisse plus facilement capturer.'],
  ['Le Centre de soins ne ferme jamais. L\'infirmière ne dort donc jamais ?'],
  ['J\'ai rangé six Pokémon dans mon équipe et vingt dans le PC du Centre.', 'Mon préféré change tous les jours.'],
  ['Les baies sauvages sont plus sucrées après la pluie.', 'Mais n\'en cueille pas trop : les Pokémon en ont besoin aussi.'],
  ['Prends le temps de parler aux gens. On apprend toujours quelque chose.'],
  ['Changer de Pokémon au bon moment, c\'est la moitié d\'un combat.'],
  ['Mon voisin élève des Chenipan. Le jardin ressemble à une passoire…'],
  ['Les Roucool rentrent au nid quand le soleil se couche.', 'Ils passent toujours au-dessus des toits.'],
  ['J\'ai échangé mon goûter contre une Poké Ball. Bonne affaire, non ?'],
  ['Les jeunes courent partout. Moi, je regarde les nuages.', 'Ils ont parfois la forme d\'un Pokémon.'],
  ['Une Repousse évite les Pokémon sauvages plus faibles que ton premier Pokémon.', 'Pratique pour traverser une longue route.'],
  ['Si tu te perds, regarde la carte de la région : elle se dévoile à mesure que tu voyages.'],
  ['On a construit ce quartier il y a dix ans. Avant, c\'était la forêt !'],
  ['Le marché du matin, c\'est le meilleur moment de la journée.'],
  ['Mon grand-père a fait le tour de la région à pied. Il dit qu\'aucune route ne se ressemble.'],
  ['Le soir, on entend les Hoothoot dans les arbres du parc.'],
  ['Une Super Potion soigne cinquante PV de plus qu\'une Potion. Le calcul est vite fait.'],
  ['Tu as un vélo ? Avec un vélo, les grandes villes rapetissent.'],
  ['Quand ton Pokémon tient un objet, regarde bien ce qu\'il fait : certains en ont besoin pour évoluer.'],
  ['Les dresseurs des routes ne combattent qu\'une fois. Après, ils te laissent passer… et ils te félicitent.'],
  ['On raconte qu\'un Pokémon chromatique brille d\'une autre couleur.', 'Je n\'en ai jamais vu. Et toi ?'],
  ['Courir, c\'est bien. Mais en ville, on se promène !'],
  ['Les fontaines de la région viennent toutes de la même carrière, dit-on.'],
  ['J\'ai perdu ma Poké Ball préférée dans un recoin du quartier. Si tu la trouves, garde-la.'],
  ['Il y a des objets cachés partout : au bout des impasses, derrière les maisons, au fond des clairières.'],
  ['Les routes sont longues, maintenant. Prends des Potions, et un peu de patience.'],
  ['Quand une route se divise, le chemin le plus long cache souvent quelque chose.'],
  ['Mon chat dort sur le muret tous les après-midi. Ne le réveille pas.'],
  ['Le facteur passe deux fois par jour. Sauf quand il pleut. Ou quand il fait beau.'],
];

export const VILLES = {
  aube: [
    ['Bourg-Aube est petit, mais tout le monde se connaît.', 'Ici, on ne ferme jamais sa porte à clé.'],
    ['Le moulin tourne depuis cent ans. Il moud le grain de tout le bourg.'],
    ['Les vaches Écrémeuh du pré donnent le meilleur lait de la région.'],
    ['Au nord, la route 1 mène à Sylvebourg. Les dresseurs débutants y font leurs premiers combats.'],
    ['Le professeur Saule travaille tard. On voit souvent la lumière du labo à minuit.'],
  ],
  sylve: [
    ['Sylvebourg a poussé au milieu des arbres. Les plus vieux chênes sont plus âgés que la ville.'],
    ['Le soir, les Lumivole dansent au-dessus de l\'étang du parc.'],
    ['Les créatures Insecte craignent le Feu, le Vol et la Roche.', 'Hector le sait mieux que personne.'],
    ['Au marché, on trouve du miel de Apitrini. Il colle aux doigts toute la journée.'],
    ['Le Bois Murmure, au nord, est si dense qu\'on s\'y perd en plein midi.'],
    ['Les enfants d\'ici chassent les Chenipan avec des épuisettes. Mais ils les relâchent toujours.'],
  ],
  pierre: [
    ['Pierrefort vit de la mine depuis trois générations.'],
    ['Le soir, les mineurs remontent couverts de poussière. On les reconnaît à leur casque.'],
    ['L\'usine Poké Ball fabrique des milliers de Balls par jour. Personne ne sait vraiment comment.'],
    ['Les Racaillou dorment dans les tas de cailloux. Fais attention où tu t\'assois.'],
    ['À l\'est, la Grotte Lunaire traverse la montagne. Il y fait noir comme dans un four.'],
  ],
  azur: [
    ['Port-Azur sent le sel et le poisson grillé.'],
    ['Les bateaux de pêche rentrent à l\'aube. Les Goélise les suivent en criant.'],
    ['Le phare guide les marins depuis cent cinquante ans.'],
    ['Les créatures Eau craignent l\'Électrik et la Plante.', 'Marine, à l\'Arène, adore les vagues.'],
    ['Sur les quais, on raccommode les filets en chantant. C\'est une tradition.'],
  ],
  volta: [
    ['Voltacité ne s\'éteint jamais. Même à trois heures du matin, les néons brillent.'],
    ['La Centrale alimente toute la région. Les Magnéti s\'y collent par grappes.'],
    ['Les créatures Sol ne craignent pas du tout l\'électricité.'],
    ['Les tramways passaient ici autrefois. On a gardé les rails pour faire joli.'],
    ['Au marché de nuit, on vend des piles, des câbles et des brochettes. Tout ce qu\'il faut !'],
  ],
  flora: [
    ['Floralia compte plus de fleurs que d\'habitants. Mille fois plus.'],
    ['Au printemps, la ville entière sent le miel.'],
    ['Les serres du jardin botanique gardent des fleurs de toute la région.'],
    ['Les créatures Plante craignent le Feu, la Glace, le Vol, le Poison et l\'Insecte.', 'Flora a pourtant de la ressource.'],
    ['Les buissons épineux à l\'est ne se laissent pas traverser. Il faut une capacité spéciale.'],
  ],
  mirage: [
    ['À Mirage, on dit que les rêves se souviennent de nous.'],
    ['La place des Pierres Levées est plus vieille que la ville. Personne ne sait qui les a dressées.'],
    ['Les attaques Psy ne touchent pas les créatures Ténèbres.'],
    ['Ma voisine devine toujours ce que je vais dire. C\'est fatigant, à la longue.'],
    ['Au sud, la route 7 descend vers le Cap Mirage et la mer.'],
  ],
  granit: [
    ['Sur Granit, on vit de la pêche et de la pierre.'],
    ['Les Rocrabe se cachent dans les rochers du port. Gare aux orteils.'],
    ['Les créatures Roche craignent l\'Eau, la Plante, le Combat, le Sol et l\'Acier.'],
  ],
  cendre: [
    ['Les sources chaudes de Cendrelune soignent les rhumatismes. Et les Ponyta adorent y tremper les pattes.'],
    ['Le volcan gronde un peu tous les matins. On s\'y habitue.'],
    ['L\'Eau, la Roche et le Sol éteignent le Feu.'],
  ],
  ecaille: [
    ['Fort-Écaille a été bâti comme une forteresse. Les remparts datent des anciens rois.'],
    ['Les Gardes d\'Écaille s\'entraînent sur la place chaque matin.'],
    ['Les dragons ne craignent que la Glace, la Fée et les autres dragons.'],
  ],
  cime: [
    ['Cimelune garde la mémoire des dragons anciens.'],
    ['Au nord, la Route Victoire grimpe dans la Chaîne Céleste, jusqu\'au Plateau.'],
    ['Les lacs d\'altitude sont si clairs qu\'on y voit les étoiles en plein jour.'],
  ],
  plateau: [
    ['Ici, l\'air est rare. Les dresseurs qui arrivent ont tous le souffle court.'],
    ['Du haut du Plateau, par temps clair, on voit toute la région.'],
  ],
  metro: [
    ['Métropole compte plus de gratte-ciel que d\'arbres.'],
    ['Le métro ? On l\'attend depuis vingt ans.'],
    ['Au quartier des affaires, personne ne regarde le ciel.'],
    ['Le parc central est le seul endroit calme de la ville. Le matin, il est plein de joggeurs.'],
    ['Les créatures Normal ne craignent que le Combat. Mais Margot a plus d\'un tour dans son sac.'],
  ],
  lisiere: [
    ['À Port-Lisière, le vent souffle tellement que les éoliennes ne s\'arrêtent jamais.'],
    ['Les Vol craignent l\'Électrik, la Glace et la Roche.'],
    ['Du haut des falaises, on voit le Pont de l\'Austral.'],
  ],
  marais: [
    ['On ne marche pas dans le marais sans bottes. Ni sans Antidote.'],
    ['Les passerelles de bois sont glissantes après la pluie.'],
    ['Le Poison craint le Sol et le Psy.'],
  ],
  dunes: [
    ['Le vent sculpte les dunes chaque nuit. Le matin, la ville n\'est plus tout à fait la même.'],
    ['L\'oasis ne s\'assèche jamais. On dit qu\'un Pokémon la garde.'],
    ['Le Sol craint l\'Eau, la Plante et la Glace. Et il ne craint pas l\'Électrik.'],
  ],
  forge: [
    ['Forge-Acier fond l\'acier des rails et des ponts de toute la région.'],
    ['Les cheminées fument jour et nuit. Le linge sèche toujours un peu gris.'],
    ['L\'Acier craint le Feu, le Combat et le Sol.'],
  ],
  rose: [
    ['Rosebrume a la plus grande roseraie du monde. Enfin, c\'est ce qu\'on dit.'],
    ['Les créatures Fée craignent le Poison et l\'Acier.'],
    ['Les Fées dansent dans la brume du matin, autour du kiosque.'],
  ],
  ombre: [
    ['À Ombreval, le soleil ne passe presque jamais la cime des pins.'],
    ['Les lanternes restent allumées toute la journée.'],
    ['Les Ténèbres craignent le Combat, l\'Insecte et la Fée.'],
  ],
  orage: [['Les orages d\'ici ne préviennent jamais.']],
  grue: [['Le village vit au rythme du gong du matin.']],
  givre: [['Ici, il neige même en été.']],
};

/** paroles des marchands des étals (selon ce qu'ils vendent) */
export const ETALS = [
  ['Baies fraîches ! Ceriz, Pêcha, Oran ! Cueillies ce matin !'],
  ['Du miel de la forêt, du vrai ! Goûtez, goûtez !'],
  ['Poissons du port, pêchés à l\'aube !'],
  ['Des fleurs pour la maison ? Elles tiennent une semaine. Promis.'],
  ['Pain chaud, croissants ! Le Ronflex du boulanger en a déjà mangé la moitié.'],
  ['Des fromages de la ferme ! Celui-ci a un caractère… comme un Tauros.'],
  ['Poteries, paniers, bibelots ! Tout est fait main.'],
  ['Des légumes du potager ! Les Mystherbe n\'en ont pas encore croqué.'],
];

/** promeneurs et campeurs des routes (selon le paysage) */
export const ROUTES = {
  general: [
    ['Cette route n\'en finit pas ! Mais qu\'est-ce qu\'elle est belle.'],
    ['J\'ai pris le chemin de gauche, puis celui de droite… et me revoilà.', 'Au moins, je ne m\'ennuie pas.'],
    ['Une impasse ? Les impasses cachent souvent un trésor.'],
    ['Quand j\'ai trop marché, je m\'assois et je regarde les Pokémon passer.'],
    ['Les rebords, on les saute dans un sens. Jamais dans l\'autre !'],
    ['Les hautes herbes, c\'est là que vivent les Pokémon sauvages. Le chemin, lui, est sûr.'],
  ],
  bois: [['Dans les bois, on n\'entend que les feuilles. Et parfois, un Hoothoot.'], ['Si tu vois une clairière, va voir : on y trouve souvent quelque chose.']],
  montagne: [['L\'air se fait rare, là-haut. Avance doucement.'], ['Les Racaillou dévalent les pentes quand il pleut. Garde l\'œil ouvert.'], ['Du col, on voit les deux versants de la Chaîne Céleste.']],
  mer: [['Le vent du large sent l\'aventure.'], ['Les Tentacool s\'échouent parfois sur la plage. Ne les touche pas !']],
  desert: [['Bois avant d\'avoir soif. C\'est la règle du désert.'], ['Les mirages, c\'est vrai ! J\'ai vu une oasis… ce n\'était qu\'un Sablaireau.']],
  marais: [['Les passerelles craquent, mais elles tiennent. Enfin, j\'espère.']],
};

/** prénoms des dresseurs ajoutés le long des routes */
export const PRENOMS = ['Alix', 'Anouk', 'Arthur', 'Bastien', 'Blanche', 'Camille', 'Cyril', 'Daphné', 'Damien', 'Élio', 'Elsa', 'Émile', 'Fanny', 'Félicien', 'Gabin', 'Gaëlle', 'Hélène', 'Henri',
  'Ilona', 'Ivan', 'Jasmine', 'Joachim', 'Juliette', 'Kévin', 'Laure', 'Léon', 'Lina', 'Lucien', 'Maud', 'Marius', 'Mathis', 'Nadia', 'Noam', 'Octave', 'Olga', 'Pablo', 'Pauline', 'Quentin',
  'Rémi', 'Rosalie', 'Sacha', 'Salomé', 'Simon', 'Tess', 'Tristan', 'Ulysse', 'Valérie', 'Victor', 'Wendy', 'Xavier', 'Yasmine', 'Yvan', 'Zélie', 'Zoé', 'Aubin', 'Bérénice', 'Corentin',
  'Delphine', 'Ernest', 'Flavie', 'Gustave', 'Hortense', 'Isidore', 'Jeanne', 'Lazare', 'Margaux', 'Nestor', 'Ophélie', 'Prosper', 'Romy', 'Sixte', 'Thaïs', 'Urbain', 'Violette'];
