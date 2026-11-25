// odyssee/moteur/donnees/fr.js — le jeu HGSS en français : les noms de la version française (lieux, personnages,
// classes de dresseurs). Les espèces, attaques et objets prennent ceux d'Odyssée (déjà en français).
// Les dialogues, eux, ne sont publiés qu'en anglais par la décompilation : la page les traduit (render/traduction.js),
// après y avoir remis ces noms.

/** les lieux (MAPSEC_…) */
export const LIEUX_FR = {
  AZALEA_TOWN: 'Écorcia', BATTLE_ARCADE: 'Arcade de Combat', BATTLE_CASTLE: 'Château de Combat', BATTLE_FACTORY: 'Usine de Combat',
  BATTLE_FRONTIER: 'Zone de Combat', BATTLE_HALL: 'Salle de Combat', BATTLE_PARK: 'Parc de Combat', BATTLE_TOWER: 'Tour de Combat',
  BELLCHIME_TRAIL: 'Sentier Carillon', BELL_TOWER: 'Tour Carillon', BLACKTHORN_CITY: 'Ébènelle', BURNED_TOWER: 'Tour Cendrée',
  CELADON_CITY: 'Céladopole', CERULEAN_CAVE: 'Grotte Inconnue', CERULEAN_CITY: 'Azuria', CHERRYGROVE_CITY: 'Ville Griotte',
  CIANWOOD_CITY: 'Irisia', CINNABAR_ISLAND: "Cramois'Île", CLIFF_CAVE: 'Grotte Falaise', CLIFF_EDGE_GATE: 'Poste de la Falaise',
  DARK_CAVE: 'Antre Noir', DIGLETTS_CAVE: 'Cave Taupiqueur', DRAGONS_DEN: 'Antre du Dragon', ECRUTEAK_CITY: 'Rosalia',
  EMBEDDED_TOWER: 'Tour Enfouie', FIGHT_AREA: 'Aire de Combat', FRONTIER_ACCESS: 'Accès Zone de Combat', FUCHSIA_CITY: 'Parmanie',
  GLOBAL_TERMINAL: 'Centre Communication Mondial', GOLDENROD_CITY: 'Doublonville', GOLDENROD_TUNNEL: 'Souterrain', ICE_PATH: 'Route de Glace',
  ILEX_FOREST: 'Bois aux Chênes', INDIGO_PLATEAU: 'Plateau Indigo', JUBILIFE_CITY: 'Féli-Cité', LAKE_OF_RAGE: 'Lac Colère',
  LAVENDER_TOWN: 'Lavanville', LIGHTHOUSE: 'Phare', MAHOGANY_TOWN: 'Acajou', MT_MOON: 'Mont Sélénite', MT_MORTAR: 'Mont Creuset',
  MT_SILVER: 'Mont Argenté', MT_SILVER_CAVE: 'Grotte du Mont Argenté', MYSTERY_ZONE: 'Zone Mystère', NATIONAL_PARK: 'Parc Naturel',
  NEW_BARK_TOWN: 'Bourg Geon', OLIVINE_CITY: 'Oliville', PALLET_TOWN: 'Bourg Palette', PAL_PARK: 'Parc des Amis', PEWTER_CITY: 'Argenta',
  POKEATHLON_DOME: 'Dôme Athlon', POKEMON_LEAGUE: 'Ligue Pokémon', POWER_PLANT: 'Centrale', RADIO_TOWER: 'Tour Radio',
  ROCK_TUNNEL: 'Grotte', ROTOMS_ROOM: 'Chambre de Motisma', RUINS_OF_ALPH: "Ruines d'Alpha", SAFARI_ZONE: 'Parc Safari',
  SAFARI_ZONE_GATE: 'Entrée du Parc Safari', SAFFRON_CITY: 'Safrania', SEAFOAM_ISLANDS: 'Îles Écume', SINJOH_RUINS: 'Ruines Sinjoh',
  SLOWPOKE_WELL: 'Puits Ramoloss', SPROUT_TOWER: 'Tour Chétiflor', SS_AQUA: 'Aquaria', TEAM_ROCKET_HQ: 'QG Team Rocket',
  TOHJO_FALLS: 'Chutes Tohjo', UNION_CAVE: 'Caves Jumelles', VERMILION_CITY: 'Carmin sur Mer', VICTORY_ROAD_JK: 'Route Victoire',
  VIOLET_CITY: 'Mauville', VIRIDIAN_CITY: 'Jadielle', VIRIDIAN_FOREST: 'Forêt de Jade', WHIRL_ISLANDS: 'Îles Tourbillon',
};

/** nom français d'un lieu (MAPSEC_…) ; les routes gardent leur numéro */
export const nomLieuFr = (lieu) => {
  const k = String(lieu || '').replace(/^MAPSEC_/, '');
  const r = k.match(/^ROUTE_(\d+)$/);
  return r ? `Route ${r[1]}` : LIEUX_FR[k] || null;
};

/** classes de dresseurs (début du nom des dresseurs de trainers.json) */
export const CLASSES_FR = {
  'Youngster': 'Gamin', 'Lass': 'Fillette', 'Bug Catcher': 'Scout', 'Bird Keeper': 'Ornithologue', 'Hiker': 'Montagnard',
  'Fisherman': 'Pêcheur', 'Swimmer♂': 'Nageur', 'Swimmer♀': 'Nageuse', 'Camper': 'Campeur', 'Picnicker': 'Pique-niqueuse',
  'Sage': 'Sage', 'Twins': 'Jumelles', 'Pokéfan': 'Pokéfan', 'Pokémaniac': 'Pokémaniac', 'Super Nerd': 'Intello',
  'Gentleman': 'Gentleman', 'Beauty': 'Canon', 'Psychic': 'Médium', 'Medium': 'Mystimana', 'Black Belt': 'Karatéka',
  'Sailor': 'Marin', 'Juggler': 'Jongleur', 'Guitarist': 'Guitariste', 'Biker': 'Motard', 'Burglar': 'Cambrioleur',
  'Scientist': 'Scientifique', 'Grunt': 'Sbire', 'Ace Trainer': 'Topdresseur', 'Cooltrainer': 'Topdresseur', 'Skier': 'Skieuse',
  'Boarder': 'Snowboardeur', 'Kimono Girl': 'Kimono', 'Schoolboy': 'Écolier', 'Schoolkid': 'Écolier', 'Teacher': 'Institutrice',
  'Officer': 'Policier', 'Policeman': 'Policier', 'Firebreather': 'Cracheur de feu', 'Rocket Executive': 'Admin Rocket',
  'Leader': 'Champion', 'Elite Four': 'Conseil 4', 'Champion': 'Maître', 'Rival': 'Rival', 'Pokémon Trainer': 'Dresseur',
  'Bird keeper': 'Ornithologue', 'Cue Ball': 'Loubard', 'Mysticalman': 'Mystimana', 'Rich Boy': 'Richard', 'Lady': 'Mademoiselle',
  'Fisher': 'Pêcheur', 'Ruin Maniac': 'Ruinemaniac', 'Hiker♂': 'Montagnard', 'Beauty♀': 'Canon',
};

/** remet le nom de classe en français (« Youngster Joey » → « Gamin Joey ») */
export function dresseurFr(nom) {
  const cles = Object.keys(CLASSES_FR).sort((a, b) => b.length - a.length);
  for (const c of cles) if (nom.startsWith(c + ' ')) return CLASSES_FR[c] + nom.slice(c.length);
  return nom;
}

/**
 * Noms propres des dialogues anglais → ceux de la version française, remplacés avant la traduction (la traduction
 * automatique laisse alors les noms tels quels). Du plus long au plus court.
 */
export const NOMS_FR = [
  ['Professor Elm', 'Professeur Orme'], ['Prof. Elm', 'Prof. Orme'], ['PROF. ELM', 'PROF. ORME'], ['Elm', 'Orme'], ['ELM', 'ORME'],
  ['Professor Oak', 'Professeur Chen'], ['Prof. Oak', 'Prof. Chen'], ['PROF. OAK', 'PROF. CHEN'], ['Oak', 'Chen'], ['OAK', 'CHEN'],
  ['Mr. Pokémon', 'M. Pokémon'], ['Lyra', 'Célesta'], ['LYRA', 'CÉLESTA'], ['Kurt', 'Fargas'], ['Falkner', 'Albert'], ['Bugsy', 'Hector'],
  ['Whitney', 'Blanche'], ['Morty', 'Mortimer'], ['Pryce', 'Frédo'], ['Clair', 'Sandra'], ['Lance', 'Peter'], ['Will', 'Clément'],
  ['Bruno', 'Aldo'], ['Karen', 'Marion'], ['Brock', 'Pierre'], ['Misty', 'Ondine'], ['Lt. Surge', 'Major Bob'], ['Sabrina', 'Morgane'],
  ['Janine', 'Jeannine'], ['Blaine', 'Auguste'], ['Bill', 'Léo'],
  ['Pokégear', 'Pokématos'], ['POKéGEAR', 'POKéMATOS'], ['Running Shoes', 'Chaussures de Sport'],
  ['New Bark Town', 'Bourg Geon'], ['Cherrygrove City', 'Ville Griotte'], ['Violet City', 'Mauville'], ['Azalea Town', 'Écorcia'],
  ['Goldenrod City', 'Doublonville'], ['Ecruteak City', 'Rosalia'], ['Olivine City', 'Oliville'], ['Cianwood City', 'Irisia'],
  ['Mahogany Town', 'Acajou'], ['Blackthorn City', 'Ébènelle'], ['Sprout Tower', 'Tour Chétiflor'], ['Union Cave', 'Caves Jumelles'],
  ['Slowpoke Well', 'Puits Ramoloss'], ['Ilex Forest', 'Bois aux Chênes'], ['Ruins of Alph', "Ruines d'Alpha"], ['Dark Cave', 'Antre Noir'],
  ['Burned Tower', 'Tour Cendrée'], ['Bell Tower', 'Tour Carillon'], ['Lake of Rage', 'Lac Colère'], ['Ice Path', 'Route de Glace'],
  ['Pallet Town', 'Bourg Palette'], ['Viridian City', 'Jadielle'], ['Pewter City', 'Argenta'], ['Cerulean City', 'Azuria'],
  ['Vermilion City', 'Carmin sur Mer'], ['Lavender Town', 'Lavanville'], ['Celadon City', 'Céladopole'], ['Fuchsia City', 'Parmanie'],
  ['Saffron City', 'Safrania'], ['Cinnabar Island', "Cramois'Île"], ['Indigo Plateau', 'Plateau Indigo'], ['Johto', 'Johto'],
].sort((a, b) => b[0].length - a[0].length);
