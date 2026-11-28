// odyssee/js/game.js — le jeu : déplacements sur la grille, PNJ, dresseurs, rencontres, capacités de terrain (Coupe,
// Surf, Éclate-Roc, Vol), menus, histoire (les quinze arènes et l'archipel des trois frères), sauvegarde
import { T, walkable, isGrassEnc, DIRS, OPP } from './world/tiles.js';
import { nearestWalkable } from './world/mapgen.js';
import { encAt } from './world/rencontres.js';
import { MEGAS_OF, MEGA_RING, LEGEND, STONE_FORM, revertMegas } from './core/mega.js';
import { MEGA_FORMS } from './core/mega.js';
import { createMon, movesChoisies, monName, healFull, levelEvolution, itemEvolution, evolve, setUidBase, levelCap, ensureNature, apteCT } from './core/mon.js';
import { Battle } from './core/battle.js';
import { nomDresseur } from './core/battle-helpers.js';
import { CT_DU_BADGE } from './data/cts.js';
import { rattraperCT } from './world/cts.js';
import { ITEMS, itemName, applyItem, estSoin, canUseOn, useCandy, formatFindItem, formatObtainItem } from './core/items.js';
import { SPECIES } from './data/species.js';
import { MOVES } from './data/moves.js';
import { moveDesc } from './data/moveDescriptions.js';
import { SAUVAGE, R } from './data/remplacants.js';
import { STARTERS, STARTER_CHOICES, STARTER_TABLE, starterSlot, RIVAL_NAME, BADGES, LEADERS, FIELD, CARTE_VERSION } from './world/region.js';
import { migrerCarte } from './world/migration.js';
import { BattleView } from './ui/battleView.js';
import { Hud } from './ui/hud.js';
import { partyScreen, bagScreen, dexScreen, mapScreen, cardScreen, shopScreen, pcScreen, naturePcScreen, moveRelearnerScreen, learnMoveScreen, optionsScreen, pokedexRegisterScene, TYPE_FR, typeTag, questsScreen, trophiesScreen, showTrophyToast, hofScreen, pantheonScreen, friendsScreen } from './ui/screens.js';
import { openChatModal } from './ui/chatModal.js';
import { getFriendsManager } from './net/friends.js';
import { recordPvpMatch, ensurePvpState, checkAllTrophies } from './core/trophies.js';
import { el, esc, wait } from './ui/ui.js';
import { ASSETS, loadImg } from './assets.js';
import { HPX, CHAR_ROWS } from './render/world3d.js';
import { saveCodeScreen } from './ui/screens.js';
import { encodeSave, saveSummary } from './core/savecode.js';
import { installSocial, talkToPeer } from './net/social.js';
import { RaidMonde } from './raid-monde.js';
import { Donjons } from './donjons/jeu.js';
import { storyTalk, storyWin, lugiaBattle, placeLugia, overlay } from './story.js';
import { battleMusicForLegend } from './audio.js';
import { playBossCinematic, isLegendarySpecies } from './ui/cinematic.js';
import { syncJournal, nomQuete } from './core/questsData.js';
import { preparerArene, surCaseArene, actionnerArene, remettreArene, pasArene, rocherDansFosse } from './arenes-jeu.js';
import { casinoScreen, bourseScreen, entretienPierre } from './ui/metropole.js';
import { arcadeScreen } from './ui/arcade.js';
import { apparenceScreen } from './ui/apparence.js';
import { preparerDomaine, frigo, architecte, recolter, allerDomaine, resident, arrivees, gardienDomaine } from './ui/domaine.js';
import { composer, tenueValide, tenueOrigine } from './render/tenue.js';
import { buildRivalParty, getRivalItems } from './world/rival.js';
import { Vie, parlerFaune, rentreLeSoir } from './vie.js';
import { revancheBossPossible, revancheBoss, tourCombat, clubCombat } from './tour-combat.js';
import { dojoMamadou, dojoBoutique, dojoMascotte } from './dojo-mamadou.js';
import { VieMonde, colporteur, marche, cueillir, fouiller, revanchePossible, revanche, noteCombat, ragot, echange, relais, concours, loterie, musicien } from './vie-monde.js';
import { storeGet, storeSet, sessSet, warnDev } from './core/safe.js';
import { BIOMES, biomeEn, estLave } from './world/biomes.js';
import { glisse, dalle, souffle, remiseSerre, pupitreSerre, teleporte, savoir, pylon, stele, shrine } from './game/puzzles.js';
import { RIVAL_TEAMS, spawnAhead, trigger } from './game/triggers.js';
import { GYM_HINTS, reveilBetes, spawnLegends, legendReady, legendBattle, ferry, odyssorEvent, runNpcScript } from './game/world-events.js';
import { CelestialSystem } from './game/celestial.js';
import { RiftSystem, normalizeCapturedAlpha } from './game/rifts.js';
import { talkFollowerRich, followerTickLife, followerDanceHop, recordBattleMemories, addMemory, annoncerSouvenirs } from './game/follower-life.js';

/** météos qui comptent en combat (brume et cendres ne sont que du décor, comme dans les jeux 5G) */
const BATTLE_WEATHERS = ['rain', 'sun', 'sandstorm', 'hail'];

// v2 : nouvelle région (arènes dans un autre ordre, archipel, créatures originales) — les sauvegardes v1 ne sont pas reprises
const SAVE_KEY = 'odyssee-save-v2';
const SUIVEUR = 0.75;   // taille du Pokémon qui suit (1 = celle de son dessin)
// le vélo va nettement plus vite que la course, même en Turbo (0,046)
export const WALK = 0.27, SURF = 0.11, VELO = 0.034;
export const RUN_SPEEDS = [
  { id: 'norm', label: 'Normale (1×)', dur: 0.100 },
  { id: 'fast', label: 'Rapide (1.7×)', dur: 0.068 },
  { id: 'turbo', label: 'Turbo (2.5×)', dur: 0.046 },
];
export const RUN = RUN_SPEEDS[1].dur;
const key = (x, y) => x + ',' + y;
void R;
// capacité de terrain donnée par chaque Champion après sa victoire
const GYM_GIFT = { 3: 'coupe', 4: 'surf', 5: 'eclate', 6: 'vol' };
// portrait affiché à côté de la boîte de dialogue 5G, selon qui parle
const FACES = {
  // Professeur & Rivaux
  'Prof. Saule': 'saule', 'Professeur Saule': 'saule', 'Saule': 'saule',
  'Dr Lumen': 'lumen', 'Lumen': 'lumen',
  [RIVAL_NAME]: 'theo', 'Théo': 'theo', 'Theo': 'theo', 'Rival': 'theo',
  'Ethan': 'player_m', 'Lyra': 'player_f',
  // Famille & PNJ récurrents
  'Maman': 'maman', 'Mère de Théo': 'habitante', 'Infirmière': 'nurse',
  'Vendeur': 'vendeur', 'Garde': 'garde', 'Capitaine': 'capitaine', 'Capitaine Corentin': 'capitaine',
  'Architecte': 'topdresseur', 'Pierre': 'pierre', 'Croupier': 'croupier', 'Facteur': 'facteur',
  'Gardien du phare': 'scientifique', 'Ermite': 'montagnard', 'Styliste': 'topdresseuse',
  'Gardien du savoir': 'scientifique', 'Inspectrice Morvan': 'topdresseuse', 'Morvan': 'topdresseuse',
  'Ingénieur': 'scientifique', 'Voyante': 'medium', 'Guide': 'habitant',
  'Éleveuse': 'habitante', 'Chercheur': 'scientifique', 'Hélène': 'habitante',
  'Dr Cassandre': 'scientifique', 'Conteuse Éléonore': 'habitante', 'Papi Octave': 'vieil_homme',
  'Mme Léonie': 'habitante', 'Présentatrice': 'topdresseuse', 'Ingrid': 'habitante',
  // le Professeur Cèdre attend son buste (img/portraits/savant-l.png) : d'ici là, celui du scientifique
  'Pr Cèdre': ASSETS.aBuste('savant') ? 'savant' : 'scientifique', 'Doyenne Amaya': 'habitante', 'Vieille dame': 'habitante',
  'Jardinier Firmin': 'jardinier', 'Lucien': 'habitant', 'Gustave': 'vieil_homme',
  // Champions du Continent
  'Hector': 'hector', 'Marine': 'marine', 'Volta': 'volta', 'Flora': 'flora',
  'Sibylle': 'sibylle', 'Basalte': 'basalte', 'Pyros': 'pyros', 'Drakos': 'drakos',
  'Célestine': 'celestine',
  // Champions des Terres du Sud
  'Margot': 'margot', 'Aurèle': 'aurele', 'Morgane': 'morgane', 'Gaspard': 'gaspard',
  'Ferdinand': 'ferdinand', 'Lilas': 'lilas', 'Corbin': 'corbin',
  // Team Éclipse & Brume
  'Nyx': 'nyx', 'Érèbe': 'erebe', 'Erebe': 'erebe', 'Nocturne': 'nocturne',
  'Frimas': 'frimas', 'Spectrel': 'spectrel', 'Brutus': 'brutus', 'Sylas': 'sylas',
  'Ariane': 'ariane', 'Nox': 'nox', 'Sbire': 'brume_f', 'Sbire de la Brume': 'brume', 'Sbire Éclipse': 'eclipse_m',
  'Mamadou': 'mamadou', 'Maître Mamadou': 'mamadou',
  'Mascotte du Dojo': 'bouc', 'Le Bouc du Dojo': 'bouc', 'Bouc': 'bouc',
};

const TRAINER_NAME_TO_SPRITE = {
  'léo': 'gamin', 'malo': 'gamin', 'sacha': 'gamin', 'joris': 'gamin', 'nathan': 'gamin',
  'inès': 'fillette', 'mila': 'fillette', 'jade': 'fillette', 'lise': 'fillette', 'romane': 'fillette', 'capucine': 'fillette', 'églantine': 'fillette', 'nora': 'fillette',
  'noé': 'insectomane', 'adam': 'insectomane', 'timothée': 'insectomane', 'hugo': 'insectomane',
  'clara': 'randonneuse', 'célia': 'randonneuse', 'maëlle': 'randonneuse', 'élise': 'randonneuse', 'nina': 'randonneuse', 'iris': 'randonneuse', 'sahra': 'randonneuse',
  'gaston': 'montagnard', 'bastien': 'montagnard', 'gaspard': 'montagnard', 'erwan': 'montagnard', 'caravane': 'montagnard', 'touareg': 'montagnard', 'boulon': 'montagnard', 'écrou': 'montagnard',
  'yves': 'pecheur', 'gaël': 'pecheur', 'albin': 'pecheur', 'loïc': 'marin',
  'alba': 'topdresseuse', 'zoé': 'topdresseuse', 'lou': 'topdresseuse', 'solène': 'topdresseuse', 'maya': 'topdresseuse', 'céleste': 'topdresseuse', 'alice': 'topdresseuse', 'nuit': 'topdresseuse', 'garance': 'topdresseuse',
  'yanis': 'topdresseur', 'kylian': 'topdresseur', 'axel': 'topdresseur', 'éloi': 'topdresseur', 'florent': 'topdresseur', 'valentin': 'topdresseur', 'ilan': 'topdresseur', 'mirage': 'topdresseur',
  'pierre': 'scientifique', 'vipère': 'scientifique', 'dr vipère': 'scientifique',
  'kenji': 'karateka', 'bruno': 'karateka', 'tao': 'karateka', 'kaito': 'karateka', 'masao': 'karateka',
  'ophélie': 'medium', 'séléné': 'medium', 'bérénice': 'medium', 'ronan': 'garde',
  'neige': 'randonneuse', 'flocon': 'randonneuse', 'hayate': 'voleur', 'raiden': 'voleur', 'arsène': 'voleur', 'sakura': 'kimono',
  'nils': 'gamin', 'timéo': 'gamin', 'rosalie': 'fillette', 'lison': 'fillette', 'fernand': 'habitant', 'm. fernand': 'habitant',
  'rose': 'habitante', 'mme rose': 'habitante', 'héliotrope': 'habitante', 'mme héliotrope': 'habitante',
  'opaline': 'medium', 'madame opaline': 'medium', 'jules': 'insectomane', 'watt': 'scientifique', 'mlle watt': 'scientifique',
  'gustave': 'vieil_homme', 'papi gustave': 'vieil_homme', 'léon': 'vieil_homme', 'vieux léon': 'vieil_homme', 'firmin': 'montagnard',
  'séraphine': 'medium', 'sven': 'pecheur', 'corentin': 'marin',
};

const CLASS_TO_SPRITE = {
  gamin: 'gamin', fillette: 'fillette', montagnard: 'montagnard', marin: 'marin',
  topdresseur: 'topdresseur', topdresseuse: 'topdresseuse', scientifique: 'scientifique',
  pecheur: 'pecheur', pêcheur: 'pecheur', insectomane: 'insectomane', randonneuse: 'randonneuse',
  medium: 'medium', médium: 'medium', karateka: 'karateka', karatéka: 'karateka',
  garde: 'garde', 'garde d\'écaille': 'garde', voleur: 'voleur', moine: 'pretre',
  prêtre: 'pretre', pretre: 'pretre', kimono: 'kimono', 'dame kimono': 'kimono',
  skieuse: 'randonneuse', alpiniste: 'montagnard', pilote: 'marin', ninja: 'voleur',
  ouvrier: 'montagnard', sage: 'medium', 'grand sage': 'medium', habitant: 'habitant',
  habitante: 'habitante', enfant: 'enfant', 'vieil homme': 'vieil_homme',
};

export class Game {
  static SAVE_KEY = SAVE_KEY;
  constructor({ view, ui, input, sound, world }) {
    Object.assign(this, { view, ui, input, sound, world });
    this.busy = false; this.player = null; this.npcs = []; this.items = [];
    this.bv = new BattleView(this);
    this.vie = new Vie(this);
    this.vieMonde = new VieMonde(this);
    this.jour = () => new Date();
    this.followerOk = (sp) => CHAR_ROWS['poke:' + sp] != null;
    this.autoRun = storeGet('odyssee-autorun') === '1';
    const rs = storeGet('odyssee-runspeed');
    this.runSpeed = rs != null ? Math.max(0, Math.min(2, +rs)) : 1; // 0: Normale (1×), 1: Rapide (1.7×), 2: Turbo (2.5×)
    this.followOff = storeGet('odyssee-suiveur') === '0';   // le Pokémon de tête suit le dresseur (option)
    this.hud = new Hud(this);
    this.session = null; // échange ou combat en cours avec un autre joueur
    installSocial(this);
    this.raidMonde = new RaidMonde(this);   // boss de raid qui surgissent sur les routes
    this.celestial = new CelestialSystem(this);
    this.rifts = new RiftSystem(this);
    // les donjons à plusieurs (la Crypte des Murmures) : état partagé par le salon, encadré d'avancement
    this.donjons = new Donjons(this, undefined, window.HubBridge);
    input.onFree = (k) => this.onKey(k);
    // visage d'un personnage : son portrait peint s'il en a un, sinon le haut de son dessin de la carte (de face)
    const bustes = new Map();
    const visage = (k) => {
      if (!k) return null;
      const p = ASSETS.portrait(k); if (p) return p;
      if (bustes.has(k)) return bustes.get(k);
      const row = CHAR_ROWS[k], src = this.view?.charsCanvas; if (row == null || !src) return null;
      const c = document.createElement('canvas'); c.width = c.height = 40;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      // le haut du personnage : première rangée dessinée de l'image de face, immobile
      const f = src.getContext('2d').getImageData(64, row * 64, 64, 64).data;
      let top = 0; for (let y = 0; y < 64 && !top; y++) for (let i = 0; i < 64; i++) if (f[(y * 64 + i) * 4 + 3] > 100) { top = Math.max(0, y - 2); break; }
      x.drawImage(src, 64 + 12, row * 64 + top, 40, 40, 0, 0, 40, 40);
      const big = document.createElement('canvas'); big.width = big.height = 160;
      const bx = big.getContext('2d'); bx.imageSmoothingEnabled = false; bx.drawImage(c, 0, 0, 160, 160);
      const url = big.toDataURL(); bustes.set(k, url); return url;
    };
    ui.faceOf = (who, o = {}) => {
      if (!who && !o?.face) return null;
      if (o?.face) {
        const p = ASSETS.portrait(o.face);
        if (p) return p;
        if (typeof o.face === 'string' && (o.face.startsWith('http') || o.face.startsWith('data:') || o.face.includes('/'))) return o.face;
      }
      const s = String(who || '').trim();
      if (!s) return null;
      if (FACES[s]) { const p = visage(FACES[s]); if (p) return p; }
      const low = s.toLowerCase();
      if (FACES[low]) { const p = visage(FACES[low]); if (p) return p; }
      if (TRAINER_NAME_TO_SPRITE[low]) { const p = visage(TRAINER_NAME_TO_SPRITE[low]); if (p) return p; }
      if (CLASS_TO_SPRITE[low]) { const p = visage(CLASS_TO_SPRITE[low]); if (p) return p; }
      const words = s.split(/\s+/);
      for (const raw of words) {
        const w = raw.replace(/^[,.:;!?«»"']+|[,.:;!?«»"']+$/g, '');
        if (!w) continue;
        const wLow = w.toLowerCase();
        if (FACES[w]) { const p = visage(FACES[w]); if (p) return p; }
        if (FACES[wLow]) { const p = visage(FACES[wLow]); if (p) return p; }
        if (TRAINER_NAME_TO_SPRITE[wLow]) { const p = visage(TRAINER_NAME_TO_SPRITE[wLow]); if (p) return p; }
        if (CLASS_TO_SPRITE[wLow]) { const p = visage(CLASS_TO_SPRITE[wLow]); if (p) return p; }
      }
      return visage(low);
    };
  }

  /* ================= sauvegarde ================= */
  static hasSave() { try { return !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(SAVE_KEY + '-secours')); } catch (e) { return false; } }
  /** la sauvegarde de cet appareil ; si elle est illisible, sa copie de secours (celle du dernier lancement réussi) ; null sinon */
  static lireSauvegarde() {
    for (const k of [SAVE_KEY, SAVE_KEY + '-secours']) {
      try { const s = JSON.parse(localStorage.getItem(k)); if (s && Array.isArray(s.party) && Array.isArray(s.badges)) return s; } catch (e) { /* abîmée : on essaie la suivante */ }
    }
    return null;
  }
  newState(name, gender) {
    return {
      v: 2, name, gender, id: Math.floor(Math.random() * 65536), money: 3000, badges: Array(BADGES.length).fill(false), flags: {},
      party: [], box: [], bag: { potion: 1 }, dex: { seen: [], caught: [], seenCount: {} }, time: 0, visited: ['aube'], repel: 0,
      cleared: {}, surf: false, explored: [], explores: {}, journal: {},
      pvp: { totalWins: 0, totalLosses: 0, totalDraws: 0, currentStreak: 0, bestStreak: 0, players: {}, trophies: {} },
      lastCenter: { map: 'aube:maison', x: 4, y: 5, dir: 'up' }, ...this.world.start, carte: CARTE_VERSION,
    };
  }
  save(silent = false) {
    const s = this.state; const p = this.player;
    // les médailles se vérifient à chaque sauvegarde, même automatique (porte, fin de raid, de donjon, du Dojo) ;
    // celles débloquées pendant une scène attendent sa fin (showTrophyToast)
    if (s) { try { this.checkTrophies(true); } catch (e) { warnDev('trophies', e); } }
    s.map = this.mapObj.id; s.x = p.x; s.y = p.y; s.dir = p.dir; s.surf = !!p.surf;
    // dans une faille (île éphémère), la partie se sauvegarde sur la route où elle s'est ouverte
    const rf = this.mapObj.faille && this.rifts?.exp?.retour; if (rf) Object.assign(s, { map: 'monde', x: rf.x, y: rf.y, dir: rf.dir });
    const toSave = this._dojoRealParty ? { ...s, party: this._dojoRealParty } : s;
    if (!storeSet(SAVE_KEY, JSON.stringify(toSave))) return false;
    if (!silent) this.sound.sfx('save');
    this.onSaved?.(silent);
    return true;
  }
  load(from) {
    const s = from ? JSON.parse(JSON.stringify(from)) : Game.lireSauvegarde();
    // copie de secours : la partie telle qu'elle était à ce lancement (récupérable si la sauvegarde s'abîme ensuite)
    if (!from) { storeSet(SAVE_KEY + '-secours', JSON.stringify(s)); }
    s.cleared ||= {}; s.explored ||= []; s.explores ||= {};
    s.dex ||= { seen: [], caught: [], seenCount: {} };
    s.dex.seenCount ||= {};
    // CT posées à la place d'objets qu'une ancienne partie avait déjà ramassés : elle les reçoit
    rattraperCT(s, this.world?.cts);
    let maxUid = 0; for (const m of s.party.concat(s.box)) { maxUid = Math.max(maxUid, m.uid || 0); delete m._ko; }
    setUidBase(maxUid + 1);
    // Pokémon d'avant les natures : chacun reçoit la sienne (toujours la même), ses stats sont recalculées
    while (s.badges.length < BADGES.length) s.badges.push(false);   // anciennes parties : 8 badges → 15
    for (const m of s.party.concat(s.box)) ensureNature(m);
    ensurePvpState(s);
    return s;
  }

  async start(state) {
    // partie d'avant le remaniement de la carte du monde : elle reprend au Centre de la dernière ville visitée
    // (world/migration.js) ; badges, équipe, objets, quêtes et dresseurs battus ne bougent pas
    const repriseVille = migrerCarte(state, this.world);
    // ancienne partie arrêtée sur une carte qui n'existe plus (lieu déplacé sur la carte du monde) ou dans un décor
    // qui a changé (falaise, arbre) : on la reprend sur la case libre la plus proche
    const mv = this.world.moved?.[state.map];
    if (mv) Object.assign(state, { map: mv.map, x: mv.x, y: mv.y, dir: mv.dir || state.dir, surf: false });
    if (state.map === 'monde' && !state.surf && !walkable(this.world.maps.monde.get(state.x, state.y))) [state.x, state.y] = nearestWalkable(this.world.maps.monde, state.x, state.y);
    // intérieur redessiné depuis (l'Arène de Sylvebourg, par exemple) : une partie arrêtée dans un mur reprend à l'entrée
    { const M0 = this.world.maps[state.map]; if (M0 && state.map !== 'monde' && !state.surf && M0.exitX != null && (!M0.in(state.x, state.y) || !walkable(M0.get(state.x, state.y)) || (M0.planArene && state.flags?.['PV:' + M0.id] !== (M0.planArene.version || 1)))) Object.assign(state, { x: M0.exitX, y: M0.exitY - 1, dir: 'up' }); }
    // une partie sauvegardée dans un donjon reprend à son entrée ; le premier badge donne la clé de la crypte (anciennes parties)
    this.donjons?.reprise(state);
    if (state.badges?.[0] && !state.bag?.['cle-crypte'] && !state.flags?.['D:crypte:cle']) { state.bag['cle-crypte'] = 1; state.flags['D:crypte:cle'] = true; }
    // l'Astrolabe n'existe plus (les phénomènes arrivent au hasard) ; une faille déjà payée rend son fragment
    { const b = state.bag || {}, f = state.flags || {}; delete b.astrolabe; if (state.registeredItem === 'astrolabe') state.registeredItem = null; if (f.failleAstro) b['fragment-meteore'] = (b['fragment-meteore'] || 0) + 1; for (const k of ['astrolabeGiven', 'astroCiel', 'astroFaille', 'failleAstro', 'lastRiftSlot']) delete f[k]; }
    this.state = state; this._seen = null;
    revertMegas(state.party); revertMegas(state.box);
    this.stepLock = false; this.stepGap = false;
    this.player = { x: state.x, y: state.y, dir: state.dir || 'down', move: null, step: 0, turnLock: 0, bumpT: 0, surf: !!state.surf };
    this.appliquerTenue();
    preparerDomaine(this);   // le terrain acheté grâce au frigo, avec tout ce qui y a été bâti
    this.setMap(state.map);
    this.view.setTimeOfDay(this.hour());
    this.celestial?.syncView();
    // la météo change avec le temps, pas seulement en changeant de zone
    clearInterval(this._wxTimer);
    this._wxTimer = setInterval(() => { try { this.view?.setWeather(this.getMapWeather()); this.celestial?.syncView(); } catch (e) { warnDev('weather', e); } }, 30000);
    this.hud?.update(true);
    this.link?.hello();
    this.view.update(0, this.player.x, this.player.y); await this.view.solPret?.();   // le sol généré est prêt avant d'ouvrir l'écran
    await this.ui.fade(false, 400);
    // la partie a été quittée en plein combat de dresseur : il compte comme une défaite
    if (state.combatEnCours) {
      delete state.combatEnCours; this.busy = true;
      await this.ui.say('Tu as quitté un combat de dresseur avant la fin : il compte comme une défaite.');
      await this.whiteout(); this.busy = false; this.save(true);
    }
    if (!state.flags.intro) { state.flags.intro = true; this.busy = true; await this.ui.say(['Une douce lumière filtre à travers les rideaux...', `Aujourd'hui, ${state.name}, ton aventure commence !`, 'Le Prof. Saule t\'attend à son laboratoire, le grand bâtiment blanc au cœur du village.', 'Appuie sur H à tout moment pour revoir les touches.']); this.busy = false; }
    else if (repriseVille) {
      this.busy = true;
      await this.ui.say(['La région d\'Odyssée s\'est agrandie pendant ton absence : les villes ont poussé, les routes serpentent plus loin.', `Tu reprends ton voyage au ${repriseVille.centerId ? 'Centre de soins de ' + repriseVille.name : 'calme de ta maison'}.`]);
      this.busy = false; this.save(true);
    }
  }
  hour() { if (this.eclipseOn()) return 0.5; if (this.hourOverride != null) return this.hourOverride; const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
  /** la nuit violette, entre la victoire contre Nocturne au repaire et le réveil de Lugia */
  eclipseOn() { const f = this.state?.flags || {}; return !!f.eclipse && !f.lugia; }
  setEclipse() { this.view.eclipse = this.eclipseOn(); this.view.setTimeOfDay(this.hour()); this.updateOverlay(); this.refreshNpcs(); }
  updateOverlay() { overlay(this); }

  /* ================= cartes ================= */
  setMap(id) {
    const m = this.world.maps[id] || this.world.maps.monde;
    this.mapObj = m;
    // arbres coupés, rochers brisés : la carte garde la trace de ce qu'on a dégagé
    for (const k of this.state.cleared[m.id] || []) { const [x, y] = k.split(',').map(Number); if (m.get(x, y) === T.CUT || m.get(x, y) === T.SMASH) m.set(x, y, m.outdoor ? T.GRASS : T.CAVE); }
    this.applyTiles(m);   // rochers poussés avec Force, autel du Sanctuaire
    preparerArene(this, m);   // arènes dessinées : portes, tapis, miroirs dans l'état sauvegardé
    if (this.strengthOn !== m.id) this.strengthOn = null;
    this.view.eclipse = this.eclipseOn();
    this.view.setMap(m);
    this.celestial?.clearActors();
    this.rifts?.clearActor();
    this.vie?.onMap(m);
    this.vieMonde?.onMap(m);
    const st = this.state;
    this.npcs = m.npcs.filter((n) => this.npcVisible(n)).map((n) => this.npcState(n));
    // le rival attend au labo tant que le premier combat n'a pas eu lieu
    if (id === 'aube:labo' && !st.flags.rival1) this.npcs.push({ def: { id: 'rival-lab', script: 'rivalLab' }, id: 'rival-lab', x: 8, y: 6, dir: 'left', sprite: 'theo', home: [8, 6], timer: 99, move: null, step: 0 });
    this.items = m.items.filter((it) => !st.flags['I:' + it.id]).map((it) => ({ ...it }));
    for (const it of this.items) { const a = this.view.actor('item:' + it.id, { kind: 'item' }); this.view.place(a, it.x, it.y - 0.15); }
    this.gateBlock = new Set();
    for (const g of m.gates) if (this.gateClosed(g)) for (const [x, y] of g.tiles) this.gateBlock.add(key(x, y));
    this.spawnLegends();
    this.view.setTimeOfDay(this.hour());
    this.hud?.update(true);
    this.updateOverlay();
    placeLugia(this);
    this.zone = null; this.updateZone();
    this.resetFollower();
  }

  /* ================= Pokémon qui suit (comme dans HeartGold / SoulSilver) ================= */
  /** espèce du Pokémon de tête s'il a un sprite pour suivre (partenaires de départ et leurs évolutions) */
  followerSp() {
    if (this.followOff || !this.state) return null;
    const m = this.state.party[0];
    return m && m.hp > 0 && CHAR_ROWS['poke:' + m.sp] != null ? m.sp : null;
  }
  /** après un changement de carte : il se pose derrière le dresseur (ou reste dans sa Ball jusqu'au premier pas) */
  resetFollower() {
    const p = this.player, m = this.mapObj, [dx, dy] = DIRS[p.dir] || [0, 1], bx = p.x - dx, by = p.y - dy, t = m.get(bx, by);
    const ok = m.in(bx, by) && walkable(t) && ![T.DOOR, T.MAT, T.CAVEDOOR].includes(t) && !this.occupied(bx, by) && m.height(bx, by) === m.height(p.x, p.y);
    this.fol = { x: ok ? bx : p.x, y: ok ? by : p.y, dir: p.dir, move: null, step: 0, hidden: !ok || !!p.surf };
    this._folMv = p.move;
  }
  /** il marche sur la case que le dresseur vient de quitter */
  followTick(dt) {
    const p = this.player; if (!this.fol) this.resetFollower();
    const f = this.fol;
    if (p.move && p.move !== this._folMv) {
      this._folMv = p.move;
      const fx = p.move.fx, fy = p.move.fy;
      if (p.surf || p.move.land) { f.hidden = true; f.move = null; f.x = p.move.tx; f.y = p.move.ty; }
      else if (f.hidden) { f.hidden = false; f.x = fx; f.y = fy; f.move = null; f.dir = p.dir; }
      else if (f.x !== fx || f.y !== fy) {
        const ddx = fx - f.x, ddy = fy - f.y;
        f.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'right' : 'left') : (ddy > 0 ? 'down' : 'up');
        f.move = { fx: f.x, fy: f.y, tx: fx, ty: fy, t: 0, dur: p.move.dur, jump: Math.abs(ddx) + Math.abs(ddy) > 1 };
        f.x = fx; f.y = fy;
      }
    }
    if (f.move) { f.move.t += dt / f.move.dur; if (f.move.t >= 1) { f.move = null; f.step++; } }
  }
  drawFollower(v) {
    const f = this.fol, sp = this.followerSp();
    if (!f || f.hidden || !sp) { if (v.actors.has('follower')) v.removeActor('follower'); return; }
    let x = f.x, y = f.y, hop = 0, sf = 0;
    if (f.move) { const u = Math.min(1, f.move.t); x = f.move.fx + (f.move.tx - f.move.fx) * u; y = f.move.fy + (f.move.ty - f.move.fy) * u; sf = u < 0.5 ? (f.step % 2 ? 1 : 2) : 0; if (f.move.jump) hop = Math.sin(u * Math.PI) * 0.45; }
    else sf = Math.floor(performance.now() / 420) % 2 ? 1 : 0;
    if (f.flyElevation) hop += f.flyElevation;   // il piétine sur place, comme dans HGSS
    hop += followerDanceHop(f);
    const a = v.actor('follower', {});
    a.mesh.scale.setScalar(SUIVEUR);   // un peu plus petit que le dresseur
    v.setFrame(a, 'poke:' + sp, f.dir, sf);
    const t = this.mapObj.get(Math.round(x), Math.round(y)), grass = isGrassEnc(t) && !f.move;
    v.place(a, x, y, hop, grass);
    v.cover(a, ...(isGrassEnc(t) && hop < 0.05 ? [Math.round(x), Math.round(y)] : [null]));
  }
  /** parler à son Pokémon */
  async talkFollower() {
    const m = this.state?.party?.[0];
    if (m) this.sound.cry(ASSETS.cry(m.sp));
    return talkFollowerRich(this);
  }
  /** PNJ tel qu'il se tient sur la carte (un membre du Conseil 4 battu s'est écarté) */
  npcState(n) {
    const beaten = n.beatenPos && this.state.flags['T:' + n.id], x = beaten ? n.beatenPos[0] : n.x, y = beaten ? n.beatenPos[1] : n.y;
    return { def: n, id: n.id, x, y, dir: n.dir || 'down', sprite: n.sprite, home: [x, y], timer: 1 + Math.random() * 3, move: null, step: 0 };
  }
  npcVisible(n) {
    const f = this.state.flags;
    if (n.when && !n.when(f, this)) return false;   // PNJ de quête : présent selon l'avancée
    if (rentreLeSoir(n, this)) return false;          // le soir, les enfants et une partie des passants sont rentrés
    if (n.gate) return this.gateClosed(n.gate);
    if (n.vanish && f['T:' + n.id]) return false;    // sbire de la Team Éclipse battu : il s'en va
    if (n.showIf && !f[n.showIf]) return false;
    if (n.hideIf && f[n.hideIf]) return false;
    return true;
  }
  /** modifications durables du terrain (rochers poussés), rejouées à chaque entrée sur la carte */
  applyTiles(m) {
    if (m._orig) for (const [k, v] of m._orig) { const [x, y] = k.split(',').map(Number); m.set(x, y, v); }
    m._orig = new Map();
    const t = this.state.tiles?.[m.id]; if (!t) return;
    for (const [k, v] of Object.entries(t)) { const [x, y] = k.split(',').map(Number); m._orig.set(k, m.get(x, y)); m.set(x, y, v); }
  }
  setTile(x, y, v) {
    const m = this.mapObj, st = this.state, k = key(x, y);
    st.tiles = st.tiles || {}; (st.tiles[m.id] = st.tiles[m.id] || {})[k] = v;
    if (!m._orig) m._orig = new Map();
    if (!m._orig.has(k)) m._orig.set(k, m.get(x, y));
    m.set(x, y, v);
    this.view.rebuildAt(x, y);
  }
  /** après une étape de quête : les PNJ qui doivent (dis)paraître sur la carte courante, les passages qui s'ouvrent */
  refreshNpcs() {
    const m = this.mapObj, keep = new Map(this.npcs.map((n) => [n.id, n]));
    const next = [];
    for (const d of m.npcs) {
      if (!this.npcVisible(d)) continue;
      next.push(keep.get(d.id) || this.npcState(d));
    }
    for (const n of this.npcs) if (!next.includes(n) && m.npcs.includes(n.def)) this.view.removeActor('npc:' + n.id);
    this.npcs = next.concat(this.npcs.filter((n) => !m.npcs.includes(n.def) && !next.includes(n)));
    this.refreshGates(); this.spawnLegends(); this.updateOverlay();
  }
  /** un passage gardé est fermé tant qu'il manque des badges, ou tant qu'un drapeau d'histoire n'est pas levé */
  gateClosed(g) { if (g.open) return !g.open(this.state.flags, this); return g.flag ? !this.state.flags[g.flag] : this.badgeCount() < g.badges; }
  badgeCount() { return this.state.badges.filter(Boolean).length; }
  levelCap() { return levelCap(this.state?.badges); }
  worldPos() {
    if (this.mapObj.id === 'monde') return { x: this.player.x, y: this.player.y };
    // carte annexe (lac, forêt…) ou intérieur d'une carte annexe : on remonte jusqu'à l'entrée sur la grande carte
    let o = this.mapObj.outside, guard = 0;
    while (o && o.map && o.map !== 'monde' && guard++ < 4) o = this.world.maps[o.map]?.outside || null;
    o = o || this.state.lastOutdoor; return o ? { x: o.x, y: o.y } : { x: 0, y: 0 };
  }
  locationName() { const z = this.mapObj.outdoor ? this.mapObj.zoneAt(this.player.x, this.player.y) : null; return z?.name || this.mapObj.name || 'Odyssée'; }
  currentSpawns() {
    const m = this.mapObj, p = this.player;
    if (!m || !p) return null;
    const z = m.outdoor ? m.zoneAt(p.x, p.y) : (m.zones?.length && m.zoneAt(p.x, p.y)) || null;
    const k = z?.spawns || z?.route || m.spawns || (!m.outdoor && m.id && !m.id.includes(':') ? m.id : null);
    const enc = m.outdoor ? z?.enc : (m.encounter || m.enc);
    const surfEnc = m.outdoor ? (z?.surfEnc || m.surfEnc) : m.surfEnc;
    const name = z?.name || m.name || 'Zone';
    const isTown = !!(z?.town || (m.outdoor && !enc && !surfEnc && !k) || m.id?.includes(':'));
    return {
      key: k || null,
      name,
      isTown,
      enc: enc || null,
      surfEnc: surfEnc || null
    };
  }

  /** la carte se découvre en marchant : blocs de 8 × 8 cases autour du joueur (et toute ville visitée) */
  explore() {
    if (this.mapObj.id !== 'monde') return this.exploreLocal();
    const st = this.state, W = this.mapObj, B = 8, cw = Math.ceil(W.w / B), p = this.player;
    this._seen ||= new Set(st.explored);
    const add = (i) => { if (!this._seen.has(i)) { this._seen.add(i); st.explored.push(i); } };
    const R = 12;   // on voit un peu au-delà du chemin
    for (let y = Math.floor((p.y - R) / B); y <= Math.floor((p.y + R) / B); y++) for (let x = Math.floor((p.x - R) / B); x <= Math.floor((p.x + R) / B); x++) if (x >= 0 && y >= 0 && x < cw && y * B < W.h) add(y * cw + x);
    const t = this.zone?.town && Object.values(this.world.towns).find((q) => q.id === this.zone.town);
    if (t) for (let y = Math.floor(t.y / B); y <= Math.floor((t.y + t.h) / B); y++) for (let x = Math.floor(t.x / B); x <= Math.floor((t.x + t.w) / B); x++) add(y * cw + x);
  }
  /** grottes et autres lieux du dehors : leur carte locale se découvre aussi en marchant (blocs de 4 × 4 cases) */
  exploreLocal() {
    const m = this.mapObj; if (!m || !(m.floor === 'cave' || m.outdoor)) return;
    const st = this.state, B = 4, cw = Math.ceil(m.w / B), p = this.player, R = m.floor === 'cave' ? 5 : 8;
    st.explores ||= {};
    const L = st.explores[m.id] ||= [];
    this._seenL ||= {};
    const S = this._seenL[m.id] && this._seenL[m.id].L === L ? this._seenL[m.id] : (this._seenL[m.id] = { L, set: new Set(L) });
    for (let y = Math.floor((p.y - R) / B); y <= Math.floor((p.y + R) / B); y++) for (let x = Math.floor((p.x - R) / B); x <= Math.floor((p.x + R) / B); x++) {
      if (x < 0 || y < 0 || x >= cw || y * B >= m.h) continue;
      const i = y * cw + x; if (!S.set.has(i)) { S.set.add(i); L.push(i); }
    }
  }
  updateZone() {
    const m = this.mapObj, p = this.player;
    const z = m.outdoor ? m.zoneAt(p.x, p.y) : (m.zones.length && m.zoneAt(p.x, p.y)) || { name: m.name, music: m.music };
    const name = z?.name || m.name;
    // bandeau du lieu : en extérieur et dans les grottes (pas en sortant d'une maison)
    if ((m.outdoor || m.floor === 'cave') && name !== this.zoneName) { this.zoneName = name; this.ui.banner(name); }
    if (z?.town && !this.state.visited.includes(z.town)) this.state.visited.push(z.town);
    this.zone = z; this.explore();
    this.view.lumCible = (m.outdoor && BIOMES[biomeEn(m, this.player.x, this.player.y)]?.lum) || [1, 1, 1];   // la lumière du biome
    this.view.ombreCible = (m.outdoor && z?.ombre) || 1;   // sous-bois : l'image s'assombrit doucement
    if (!this.musicLock) {
      const celMusic = m.id === 'monde' && m.outdoor && this.celestial?.activeKind !== 'none' ? this.celestial.activeKind : null;
      // la Centrale libérée reprend l'air de Voltacité ; pendant la Nuit Violette, les routes deviennent inquiètes
      const nuitViolette = m.outdoor && z?.route && !z.town && this.eclipseOn();
      const track = (m.id === 'volta:tower17' && this.state.flags['T:ecl:erebe2']) ? 'cityVolt' : nuitViolette ? 'routeNuit' : ((z && z.music) || m.music);
      this.sound.play(celMusic || (p.surf && m.outdoor ? 'route2' : track));
    }
    this.zone = z;
    try { this.view?.setWeather(this.getMapWeather()); this.celestial?.syncView(); } catch (e) { warnDev('weather', e); }
    this.checkNearbySigns();
  }

  
  checkNearbySigns() {
    const m = this.mapObj, p = this.player;
    if (!m?.signs) {
      if (this.currentRoadSign) {
        this.currentRoadSign = null;
        this.ui.hideRoadSign?.();
      }
      return;
    }
    let nearest = null, minDist = 4;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > 3.2) continue;
        const txt = m.signs.get(key(p.x + dx, p.y + dy));
        if (!txt) continue;
        if (/[↑↓←→]/.test(txt) || (txt.includes('ROUTE') && txt.includes('\n'))) {
          if (d < minDist) {
            minDist = d;
            nearest = txt;
          }
        }
      }
    }
    if (nearest) {
      const formatted = nearest.split('\n').map((l) => l.trim()).filter(Boolean).join(' · ');
      if (this.currentRoadSign !== formatted) {
        this.currentRoadSign = formatted;
        this.ui.showRoadSign?.(formatted);
      }
    } else if (this.currentRoadSign) {
      this.currentRoadSign = null;
      this.ui.hideRoadSign?.();
    }
  }
  async warp(to, sfx = 'door') {
    this.busy = true;
    if (this.currentRoadSign) { this.currentRoadSign = null; this.ui.hideRoadSign?.(); }
    if (!this.porteOuverte) this.sound.sfx(sfx);   // la porte a déjà fait son bruit en s'ouvrant
    this.porteOuverte = false;
    await this.ui.doorTransition(true, 240);
    const from = this.mapObj.id;
    this.clearSpeechBubbles?.();
    if (this.mapObj.id === 'monde' && to.map !== 'monde') this.state.lastOutdoor = { x: this.player.x, y: this.player.y + 1, map: 'monde' };
    this.player.x = to.x; this.player.y = to.y; this.player.dir = to.dir || this.player.dir; this.player.move = null; this.player.surf = false;
    this.setMap(to.map);
    this.view.update(0, this.player.x, this.player.y);
    this.save(true);
    await this.view.solPret?.();   // l'écran se rouvre sur le sol généré, jamais sur l'ancien
    // on sort d'un bâtiment : le joueur est dans l'embrasure, porte ouverte ; il fait un pas dehors et elle se referme
    const pl = this.player, mo = this.mapObj;
    const sortie = mo.outdoor && (to.dir || pl.dir) === 'down' && mo.get(to.x, to.y - 1) === T.DOOR && !this.occupied(to.x, to.y, pl) && this.view.porte?.(to.x, to.y - 1, true, true);
    if (sortie) { pl.y = to.y - 1; this.view.update(0, pl.x, pl.y); }
    await this.ui.doorTransition(false, 240);
    if (sortie) { await this.playerWalk('down', 1); if (pl.y !== to.y) { pl.y = to.y; pl.move = null; } this.view.porte?.(to.x, to.y - 1, false); }
    if (this.mapObj.dark && this.mapObj.dark !== 'arene' && this.canField('flash') && this.lead()) await this.ui.say(`${monName(this.lead())} utilise Flash !\nLa grotte s'éclaire.`, { auto: 900 });
    await this.onEnterMap(from);
    this.busy = false;
  }
  /** petites scènes à l'entrée d'une carte */
  async onEnterMap(from = null) {
    const st = this.state;
    // lieux visités (et visités la nuit) : certaines requêtes des habitants en dépendent
    st.flags['V:' + this.mapObj.id] = true;
    // arène : en arrivant de dehors, le guide accueille le Dresseur et lui demande s'il est prêt (les portes se ferment alors)
    if (this.mapObj.gymLock != null && from !== this.mapObj.id) {
      st.flags['IN:' + this.mapObj.id] = false;
      if (!st.badges[this.mapObj.gymLock] && !this.libre) { await this.gymWelcome(); return; }
    }
    if (this.mapObj.id === 'domaine' && st.domaine) await arrivees(this);   // des Pokémon dont l'habitat est prêt viennent s'installer
    { const h = this.hour(); if (h >= 20 || h < 5) st.flags['VN:' + this.mapObj.id] = true; }
    // au labo, le professeur accueille le joueur avant qu'il ne touche aux capsules
    // sous-sol de la Tour Cendrée : trois bêtes se réveillent à l'arrivée du joueur et s'enfuient (m.betes : [espèce, x, y])
    if (this.mapObj.betes && !st.flags.beasts) await this.reveilBetes();
    if (this.mapObj.id === 'aube:labo' && !st.flags.metProf) {
      const prof = this.npcs.find((n) => n.id === 'prof');
      await this.playerWalk('up', 2);
      if (prof) prof.dir = 'down';
      await this.script('prof', prof);
    }
  }

  /** les trois bêtes du sous-sol de la Tour Cendrée : elles dorment, se réveillent, bondissent vers l'échelle et
   *  disparaissent ; on les croise ensuite dans les îles (légendaires `cond: 'beasts'`) */
  async reveilBetes() { return reveilBetes(this); }

  /* ================= boucle ================= */
  tick(dt) {
    const st = this.state; if (!st) return;
    this.donjons?.tick(dt);
    this.raidMonde?.tick(dt);
    this.celestial?.tick(dt);
    this.rifts?.tick(dt);
    followerTickLife(this, dt);
    st.time += dt;
    const p = this.player;
    // déplacement du joueur
    // un pas terminé est traité (rencontre, dresseur, porte) avant que le suivant ne parte : sinon, en gardant la
    // direction enfoncée, on sortait déjà des herbes quand le combat commençait (et il se jouait sur la case d'après)
    let stepped = false;
    if (p.move) {
      p.move.t += dt / p.move.dur;
      if (p.move.t >= 1) {
        const mv = p.move; p.x = mv.tx; p.y = mv.ty; p.move = null; p.step++; if (mv.land) p.surf = false; stepped = true;
        if (!mv.scripted) { this.stepLock = true; this.onStep(mv).finally(() => { this.stepLock = false; }); }
      }
    }
    if (p.turnLock > 0) p.turnLock -= dt;
    if (p.bumpT > 0) p.bumpT -= dt;
    if (!p.move && !this.busy && !this.stepLock && this.input.free) {
      const tap = this.input.takeTap();
      const d = this.input.dir() || tap;
      if (d) {
        if (p.dir !== d && !p.walking) { p.dir = d; p.turnLock = 0.1; }
        else if (p.turnLock <= 0 || (tap && !this.input.dir())) {
          this.tryStep(d);
          // le pas a attendu une image : on la rattrape, la marche reste aussi fluide qu'avant
          if (p.move && this.stepGap) p.move.t = Math.min(0.5, dt / p.move.dur);
        }
      } else p.walking = false;
    }
    this.stepGap = stepped;
    this.followTick(dt);
    // journal des quêtes : on note quand une quête est acceptée (une nouvelle entrée s'annonce en bas de l'écran)
    this._jT = (this._jT || 0) + dt;
    if (this._jT > 1.2) {
      this._jT = 0;
      for (const q of syncJournal(this)) if (!q.done) this.ui.toast(`📖 Journal : « ${q.name} »`, 2200);
    }
    // PNJ et autres joueurs
    for (const n of this.npcs) this.npcTick(n, dt);
    this.vie?.tick(dt);
    this.vieMonde?.tick(dt);
    this.peersTick?.(dt);
    // la carte n'est pas redessinée sous un combat, cinématique ou écran plein cadre
    if (this.bv.alive || this.ui.root.querySelector('.screen, .wipe, .door-iris.on')) { this.drawTags?.(false); return; }
    this.hud?.update();
    this.draw(dt);
  }

  draw(dt) {
    const p = this.player, v = this.view;
    let px = p.x, py = p.y, hop = 0, stepFrame = 0;
    if (p.move) {
      const u = Math.min(1, p.move.t);
      px = p.move.fx + (p.move.tx - p.move.fx) * u; py = p.move.fy + (p.move.ty - p.move.fy) * u;
      if (p.move.jump) hop = Math.sin(u * Math.PI) * (p.move.haut || 0.55);
      stepFrame = p.surf ? 0 : u < 0.5 ? (p.step % 2 ? 1 : 2) : 0;
    } else if (p.bumpT > 0) stepFrame = p.bumpT > 0.15 ? (p.step % 2 ? 1 : 2) : 0;
    if (p.flyElevation) hop += p.flyElevation;
    const a = v.actor('player', {});
    const bike = this.onBike();
    if (bike) { stepFrame = 0; hop += 6 * HPX; }   // assis sur la selle
    v.setFrame(a, this.playerSprite(), p.dir, stepFrame);
    if (bike) {
      const b = v.actor('velo', { kind: 'item' }), k = 'velo_' + { down: 's', up: 'n', left: 'w', right: 'e' }[p.dir], r = v.S.rects[k];
      if (r && b.veloKey !== k) { v.setSpriteRect(b, r, r.w, r.h); b.veloKey = k; b.shadow.visible = false; }
      b.mesh.position.set(px + 0.5, hop - 6 * HPX + v.hAt(px + 0.5, py + 0.55), py + (p.dir === 'up' ? 0.62 : 0.6));
    } else if (v.actors.has('velo')) v.removeActor('velo');
    const t = this.mapObj.get(Math.round(px), Math.round(py));
    // sur l'eau : le joueur flotte sur le dos d'une créature, entouré d'un sillage
    const bob = p.surf ? 0.04 + Math.sin(performance.now() / 260) * 0.03 : 0;
    v.place(a, px, py, hop + bob, (isGrassEnc(t) && !p.move) || p.surf);
    v.cover(a, ...(isGrassEnc(t) && !p.surf && hop < 0.05 ? [Math.round(px), Math.round(py)] : [null]));
    this.drawFollower(v);
    this.drawPeers?.(); this.drawTags?.(true);
    if (p.surf) {
      const w = v.actor('wake', { kind: 'flat' }); if (!w.wakeSet) { const r = v.S.rects.wake; v.setSpriteRect(w, r, r.w, r.h); w.wakeSet = true; w.shadow.visible = false; }
      w.mesh.position.set(px + 0.5, 0.01 + bob * 0.3 + v.hAt(px + 0.5, py + 0.62), py + 0.62); w.mesh.rotation.x = -1.1;
    } else if (v.actors.has('wake')) v.removeActor('wake');
    if (p.bang) {
      const b = v.actor('bang:player', { kind: 'bang' });
      b.mesh.position.set(px + 0.5, 34 * HPX + v.hAt(px + 0.5, py + 0.55), py + 0.56);
    } else if (v.actors.has('bang:player')) {
      v.removeActor('bang:player');
    }
    for (const n of this.npcs) {
      let nx = n.x, ny = n.y, sf = 0;
      if (n.move) { const u = Math.min(1, n.move.t); nx = n.move.fx + (n.x - n.move.fx) * u; ny = n.move.fy + (n.y - n.move.fy) * u; sf = u < 0.5 ? (n.step % 2 ? 1 : 2) : 0; }
      const na = v.actor('npc:' + n.id, {});
      const seed = ((n.home?.[0] ?? n.x) * 73 + (n.home?.[1] ?? n.y) * 137) >>> 0;
      v.setFrame(na, n.sprite, n.dir, sf, seed); v.place(na, nx, ny, 0, isGrassEnc(this.mapObj.get(n.x, n.y)) && !n.move);
      { const gx = Math.round(nx), gy = Math.round(ny); v.cover(na, ...(isGrassEnc(this.mapObj.get(gx, gy)) ? [gx, gy] : [null])); }
      if (n.bang) { const b = v.actor('bang:' + n.id, { kind: 'bang' }); b.mesh.position.set(nx + 0.5, 34 * HPX + v.hAt(nx + 0.5, ny + 0.55), ny + 0.56); }
      else if (v.actors.has('bang:' + n.id)) v.removeActor('bang:' + n.id);
    }
    // éditeur de carte : caméra libre, sans dresseur ni compagnon
    if (this.camLibre) {
      px = this.camLibre.x; py = this.camLibre.y;
      for (const k of ['player', 'follower', 'velo', 'wake']) { const x = v.actors.get(k); if (x) { x.mesh.visible = false; if (x.shadow) x.shadow.visible = false; } }
    }
    v.update(dt, px, py);
    v.render();
  }

  occupied(x, y, except) {
    if (this.donjons?.occupe(x, y)) return true;   // le reflet du joueur (Donjon des Miroirs)
    if (this.raidMonde?.occupe(x, y)) return true;   // le boss de raid de la région
    if (this.mapObj?.faille && this.rifts?.exp?.occupe(x, y)) return true;   // le Pokémon d'une île de faille
    if (this.player && this.player.x === x && this.player.y === y && except !== this.player) return true;
    for (const n of this.npcs) if (n !== except && ((n.x === x && n.y === y) || (n.move && n.move.fx === x && n.move.fy === y))) return true;
    for (const it of this.items) if (it.x === x && it.y === y) return true;
    for (const L of this.legends || []) if (L.x === x && L.y === y) return true;
    return this.gateBlock.has(key(x, y));
  }

  runDur(isTurbo = false) {
    if (isTurbo) return RUN_SPEEDS[2].dur;
    return (RUN_SPEEDS[this.runSpeed] || RUN_SPEEDS[1]).dur;
  }

  tryStep(d) {
    const p = this.player, avant = p.move, depart = [p.x, p.y];
    this.tryStepJeu(d);
    if (!avant && p.move) this.donjons?.apresDepart(d, depart);
  }
  tryStepJeu(d) {
    const p = this.player, m = this.mapObj, [dx, dy] = DIRS[d];
    p.dir = d;
    const tx = p.x + dx, ty = p.y + dy, t = m.get(tx, ty);
    // donjons à plusieurs : glace et reflet (Miroirs), caisses à pousser (Trois Voies), porte fermée à clé (la crypte)
    if (!p.move && (this.donjons?.pasSpecial(d) || this.donjons?.pousser(d) || this.donjons?.porteACle(tx, ty))) return;
    // sortie par le tapis
    if (m.get(p.x, p.y) === T.MAT && d === 'down') {
      const w = m.warpAt(p.x, p.y);
      // arène : on n'en ressort pas avant d'avoir affronté le Champion (une défaite ramène au Centre de soins)
      if (w && !this.libre && m.gymLock != null && !this.state.badges[m.gymLock] && this.state.flags['IN:' + m.id]) { this.gymLocked(w); return; }
      if (w) { this.warp(w, 'exit'); return; }
    }
    // courir demande les Chaussures de Course (Maman les donne après le choix du premier Pokémon)
    const isShift = this.input.isDown('run') && this.aChaussures();
    const isRunning = isShift || (this.autoRun && this.aChaussures());
    const isTurbo = (this.autoRun && isShift) || (this.runSpeed === 2 && isRunning);
    // en surf : on glisse sur l'eau, et on descend sur la berge
    if (p.surf) {
      if (m.in(tx, ty) && t === T.WATER && !this.occupied(tx, ty)) { p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: SURF }; p.walking = true; return; }
      if (m.in(tx, ty) && walkable(t) && t !== T.DOOR && t !== T.BRIDGE && !this.occupied(tx, ty) && m.height(tx, ty) === m.height(p.x, p.y)) { p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: 0.25, jump: true, land: true }; p.walking = true; this.sound.sfx('ledge'); return; }
      p.walking = false; if (p.bumpT <= 0) { this.sound.sfx('bump'); p.bumpT = 0.3; } return;
    }
    // arènes dessinées : un rayon de lumière barre la route, un bras de tourniquet se pousse
    if (m.etat && pasArene(this, d, tx, ty)) return;
    // Force : pousser un rocher
    if (t === T.BOULDER && !m.bloc && (this.strengthOn === m.id || m.pushFree)) {
      const bx = tx + dx, by = ty + dy, bt = m.get(bx, by);
      // arène de la Carrière : le rocher comble la fosse
      if (m.etat && !this.occupied(bx, by) && rocherDansFosse(this, tx, ty, bx, by)) { p.bumpT = 0.3; p.walking = false; return; }
      if (walkable(bt) && ![T.DOOR, T.MAT, T.CAVEDOOR, T.STAIRS].includes(bt) && !this.occupied(bx, by) && !m.warpAt(bx, by) && !(m.etat && m.objectAt(bx, by)) && (m.etat || m.canStep(tx, ty, bx, by))) {
        if (m.etat) {
          this.setTile(tx, ty, T.FLOOR); this.setTile(bx, by, T.BOULDER);
        } else {
          // hors arène, les rochers poussés ne sont pas gravés définitivement : ils se réinitialisent en quittant la zone
          if (!m._orig) m._orig = new Map();
          const kt = key(tx, ty), kb = key(bx, by);
          if (!m._orig.has(kt)) m._orig.set(kt, m.get(tx, ty));
          if (!m._orig.has(kb)) m._orig.set(kb, bt);
          const under = m._orig.get(kt);
          m.set(tx, ty, under === T.BOULDER ? (m.outdoor ? T.GRASS : T.CAVE) : under);
          m.set(bx, by, T.BOULDER);
          this.view.rebuildAt(tx, ty); this.view.rebuildAt(bx, by);
        }
        this.sound.sfx('ledge'); this.view.shake = 0.08; p.bumpT = 0.3; p.walking = false;
        return;
      }
    }
    // rebords
    if ((t === T.LEDGE && d === 'down') || (t === T.LEDGE_E && d === 'right') || (t === T.LEDGE_W && d === 'left')) {
      const lx = tx + dx, ly = ty + dy;
      if (walkable(m.get(lx, ly)) && !this.occupied(lx, ly)) { p.move = { fx: p.x, fy: p.y, tx: lx, ty: ly, t: 0, dur: 0.42, jump: true }; p.walking = true; this.sound.sfx('ledge'); return; }
    }
    if (m.in(tx, ty) && walkable(t) && !this.occupied(tx, ty) && m.canStep(p.x, p.y, tx, ty)) {
      // une porte du dehors : elle s'ouvre d'abord (son, battant), puis on entre au pas ; le fondu vient ensuite (warp)
      if (t === T.DOOR && d === 'up' && m.outdoor && m.warpAt(tx, ty) && !this.porteOuverte && this.view.porte?.(tx, ty, true)) {
        this.porteOuverte = true; this.busy = true; p.walking = false; this.sound.sfx('door');
        wait(240).then(() => { p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: WALK }; p.walking = true; this.busy = false; });
        return;
      }
      const dur = this.onBike() ? VELO : isRunning ? this.runDur(isTurbo) : WALK;
      p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur }; p.walking = true;
      return;
    }
    if (this.gateBlock.has(key(tx, ty))) { const g = m.gates.find((q) => q.tiles.some(([x, y]) => x === tx && y === ty)); if (g) { const n = this.npcs.find((q) => q.id === g.npc); if (n) { this.talk(n); return; } } }
    // bute contre l'obstacle
    p.walking = false;
    if (p.bumpT <= 0) { this.sound.sfx('bump'); p.bumpT = 0.3; }
  }

  async onStep(mv) {
    await this.onStepJeu(mv);
    // donjons à plusieurs : dalles et pièges des Trois Voies
    if (!this.busy && this.mapObj && this.donjons?.dansUnDonjon()) await this.donjons.apresPasVoies();
    if (!this.busy && this.mapObj?.faille) await this.rifts?.exp?.surCase();   // îles des failles : courants, cristaux, portails
  }
  async onStepJeu(mv) {
    const p = this.player, m = this.mapObj, t = m.get(p.x, p.y);
    if (mv.jump) this.view.shake = 0.06;
    // arènes à énigmes : glace ou sable qui glisse, flèches et souffles qui poussent, dalles, téléporteurs
    const mo = m.objectAt(p.x, p.y);
    if (!mv.slid && (mo?.type === 'glace' || mo?.type === 'fleche')) { this.busy = true; try { await this.glisse(mo.type === 'fleche' ? mo.dir : p.dir); } finally { this.busy = false; } return this.onStep({ slid: true }); }
    if (mo?.type === 'dalle') this.dalle(mo);
    if (mo?.type === 'souffle' && !mv.slid) { this.busy = true; try { await this.souffle(mo); } finally { this.busy = false; } }
    if (mo?.type === 'tp' && !mv.slid) {
      if (await this.checkTrainers()) return;
      this.busy = true; try { await this.teleporte(mo); } finally { this.busy = false; } return this.onStep({ slid: true });
    }
    // arènes dessinées : dalles-interrupteurs, trous, canons à vent, dalles d'argile
    if (m.etat && mo && ['reg', 'chute', 'canon', 'fragile'].includes(mo.type)) {
      this.busy = true; let bouge = false;
      try { bouge = await surCaseArene(this, mo, mv.slid); } finally { this.busy = false; }
      if (bouge) return this.onStep({ slid: true });
    }
    if (isGrassEnc(t)) this.view.rustle(p.x, p.y);
    const w = m.warpAt(p.x, p.y);
    if (w && (t === T.DOOR || t === T.CAVEDOOR || w.step)) {
      if (w.need && !this.state.bag[w.need]) {
        this.busy = true;
        await this.ui.say(['Une force mystérieuse bloque l\'entrée...', 'Il faudrait un objet lié à ce lieu pour l\'ouvrir.']);
        await this.playerWalk('down', 1); this.view.porte?.(p.x, p.y - 1, false); this.porteOuverte = false; this.busy = false; return;
      }
      await this.warp(w, t === T.CAVEDOOR || w.step ? 'exit' : 'door'); return;
    }
    this.updateZone();
    if (this.state.repel > 0) { this.state.repel--; if (this.state.repel === 0) { this.busy = true; try { await this.repelFini(); } finally { this.busy = false; } } }
    const z = this.zone;
    // Cap des Étoiles : Odyssor
    if (m.objectAt(p.x, p.y)?.type === 'odyssor') { if (await this.odyssorEvent()) return; }
    // case de quête : un événement quand on marche dessus
    const so = m.objectAt(p.x, p.y);
    if (so?.onStep) { this.busy = true; let stop = false; try { stop = await so.onStep(this.api(), so); } finally { this.busy = false; } if (stop) return; }
    if (z?.trigger && await this.trigger(z.trigger)) return;
    if (await this.checkTrainers()) return;
    // rencontres sauvages : hautes herbes, grottes, et la mer de l'archipel quand on surfe
    const enc = this.noEnc ? null : encAt(m, p.x, p.y);   // le tronçon de la zone où l'on marche ; noEnc : version test, rencontres coupées
    if (p.surf && t === T.WATER && !this.noEnc) { const sea = m.zoneAt(p.x, p.y), enc = sea?.surfEnc || m.surfEnc; if (enc && Math.random() < 0.05) await this.wildBattle(enc); return; }
    // un Pokémon visible dans l'herbe : on lui marche dessus, c'est lui qu'on affronte
    const vu = m.outdoor && !this.noEnc ? this.vie?.at(p.x, p.y) : null;
    if (vu) { this.vie.remove(vu); await this.wildBattle([vu.e], { fixed: true }); return; }
    if (enc && (isGrassEnc(t) || (!m.outdoor && t === T.CAVE))) {
      const rate = isGrassEnc(t) ? (t === T.DARKTALL ? 0.12 : 0.1) : 0.065;
      if (Math.random() < rate) {
        // le Pokémon est tiré d'abord : si un Repousse le fait fuir, le pas continue sans aucun arrêt
        const tir = this.tirageSauvage(enc, { herbe: m.outdoor && isGrassEnc(t) }); if (!tir) return;
        // dans les grottes, il arrive qu'un Pokémon tombe du plafond
        if (!m.outdoor && t === T.CAVE && Math.random() < 0.3) await this.vie?.embuscade();
        await this.wildBattle(enc, { tirage: tir });
      }
    }
  }

  /** glisse sur la glace (ou le sable des dunes) jusqu'à un obstacle ; les flèches changent la direction */
  async glisse(dir) { return glisse(this, dir); }
  /** dalle : lève les barrières d'une couleur et baisse celles de l'autre (l'état est gardé avec la carte) */
  dalle(o) { return dalle(this, o); }
  /* ---------------- la Grande Serre (Arène de Sylvebourg, world/arene-sylve.js) ---------------- */
  /** dalle-interrupteur : la soufflerie reliée souffle ; le premier bloc de pollen dans son axe glisse jusqu'au premier
   *  obstacle, ou tombe dans la stèle-alvéole qu'il croise ; les deux stèles pleines ouvrent le portail du dôme */
  async souffle(o) { return souffle(this, o); }
  /** remet en place les blocs d'une demi-serre (ou de toute la serre) : les cases changées reprennent leur état d'origine */
  remiseSerre(m, moitie = null) { return remiseSerre(this, m, moitie); }
  /** pupitre près d'une porte de la serre : remettre les blocs de cette demi-serre en place */
  async pupitreSerre(moitie) { return pupitreSerre(this, moitie); }
  /** téléporteur : on réapparaît sur l'autre dalle */
  async teleporte(o) { return teleporte(this, o); }
  /** gardien du savoir (arène Feu) : une bonne réponse et il s'écarte ; une mauvaise, et il faut le battre */
  async savoir(n) { return savoir(this, n); }
  /** tables du Casino et terminaux de la Bourse (objets des intérieurs de Métropole) */
  casino(quoi) { return casinoScreen(this, quoi); }
  /** bornes de la salle d'arcade du Casino */
  arcade(jeu) { return arcadeScreen(this, jeu); }
  bourse() { return bourseScreen(this); }
  /** accueil d'une arène : le guide présente le Champion et demande si l'on est prêt ; oui = enfermé jusqu'à la victoire ou
   *  la défaite, non = on ressort pour se préparer */
  async gymWelcome() {
    const m = this.mapObj, st = this.state, ui = this.ui, L = LEADERS[m.gymLock];
    const g = this.npcs.find((n) => n.def.script === 'gymguide');
    if (g) { const dx = this.player.x - g.x, dy = this.player.y - g.y; g.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); }
    await ui.say([`Yo, futur Maître ! Bienvenue dans l'Arène de ${L.name} !`, `${L.name} utilise des Pokémon de type ${TYPE_FR[L.type]}. Mise sur ${GYM_HINTS[L.type]} !`,
      'Mais attention : une fois le défi lancé, tu affrontes l\'arène d\'une traite.', `Si tu ressors avant d'avoir battu ${(L.fem || ['Marine', 'Volta', 'Flora', 'Sibylle'].includes(L.name)) ? 'la Championne' : 'le Champion'}, il faudra tout recommencer depuis le début.`], { speaker: 'Guide' });
    if (await ui.yesNo(`Es-tu prêt${st.gender === 'f' ? 'e' : ''} à relever le défi ?`)) {
      st.flags['IN:' + m.id] = true; this.sound.sfx('door');
      await ui.say(['Voilà l\'esprit ! Le défi commence.', 'Bonne chance !'], { speaker: 'Guide' });
      return;
    }
    await ui.say(['Pas de souci. Soigne ton équipe, remplis ton sac…', `Et reviens quand tu seras prêt${st.gender === 'f' ? 'e' : ''} !`], { speaker: 'Guide' });
    const w = m.exitX != null ? m.warpAt(m.exitX, m.exitY) : null;
    if (w) await this.warp(w, 'exit');
  }
  /** réinitialise les dresseurs et l'énigme d'une arène en cours */
  async resetGymChallenge(m) {
    const st = this.state;
    if (!m || !st) return;
    for (const k of Object.keys(st.flags)) if (k.startsWith('T:' + m.id + ':') && !k.endsWith(':leader')) delete st.flags[k];
    st.flags['IN:' + m.id] = false;
    if (m.serre) { delete st.tiles?.[m.id]; this.applyTiles(m); }
    if (m.etat) await remettreArene(this, false);
  }
  /** l'arène est fermée derrière nous : le guide le rappelle */
  /** sortir d'une arène en plein défi : permis, mais tous les dresseurs de l'arène sont à rebattre */
  async gymLocked(w) {
    this.busy = true;
    const m = this.mapObj;
    const ok = await this.ui.yesNo('Le guide : « Si tu sors maintenant, ton défi s\'arrête là : il faudra recommencer l\'arène depuis le début. Tu veux sortir ? »');
    if (!ok) { this.busy = false; return; }
    await this.resetGymChallenge(m);
    this.busy = false;
    await this.warp(w, 'exit');
  }

  /* ================= PNJ ================= */
  npcTick(n, dt) {
    if (n.move) { if (n.move.scripted) return; n.move.t += dt / n.move.dur; if (n.move.t >= 1) { n.move = null; n.step++; } return; }
    if (this.busy || n.def.trainer || n.frozen) return;
    if (n.def.move !== 'wander' && n.def.move !== 'turn') return;
    n.timer -= dt; if (n.timer > 0) return;
    n.timer = 1.5 + Math.random() * 3;
    const dirs = ['up', 'down', 'left', 'right'], d = dirs[Math.floor(Math.random() * 4)];
    n.dir = d;
    if (n.def.move === 'wander' && Math.random() < 0.6) {
      const [dx, dy] = DIRS[d], tx = n.x + dx, ty = n.y + dy;
      const R = n.def.roam || (/:h\d+$/.test(n.id) ? 4 : 2);
      if (Math.abs(tx - n.home[0]) <= R && Math.abs(ty - n.home[1]) <= R && walkable(this.mapObj.get(tx, ty)) && this.mapObj.canStep(n.x, n.y, tx, ty) && !this.occupied(tx, ty, n) && this.mapObj.get(tx, ty) !== T.DOOR && this.mapObj.get(tx, ty) !== T.MAT) {
        n.move = { fx: n.x, fy: n.y, t: 0, dur: 0.32 }; n.x = tx; n.y = ty;
      }
    }
  }
  /** marche scriptée d'un PNJ (avance elle-même, même si le PNJ n'est plus sur la carte) */
  npcWalk(n, d, steps) {
    return new Promise(async (res) => {
      for (let i = 0; i < steps; i++) {
        const [dx, dy] = DIRS[d]; n.dir = d;
        const mv = { fx: n.x, fy: n.y, t: 0, dur: 0.26, scripted: true }; n.move = mv; n.x += dx; n.y += dy;
        const t0 = performance.now();
        while (mv.t < 1) { await wait(16); mv.t = (performance.now() - t0) / (mv.dur * 1000); }
        n.move = null; n.step++;
      }
      res();
    });
  }
  /** marche scriptée du joueur ; s'arrête devant un obstacle */
  playerWalk(d, steps) {
    return new Promise(async (res) => {
      const p = this.player, m = this.mapObj;
      for (let i = 0; i < steps; i++) {
        const [dx, dy] = DIRS[d]; p.dir = d;
        if (!walkable(m.get(p.x + dx, p.y + dy)) || this.occupied(p.x + dx, p.y + dy)) break;
        p.move = { fx: p.x, fy: p.y, tx: p.x + dx, ty: p.y + dy, t: 0, dur: WALK, scripted: true }; while (p.move) await wait(16);
      }
      res();
    });
  }

  /* ================= touches ================= */
  openChat() {
    openChatModal(this);
  }

  broadcastChat(text, emote) {
    this.showSpeechBubble?.('me', text, emote);
    if (this.link?.enabled) {
      this.link.send('all', { t: 'chat', text, emote, name: this.state?.name });
    }
  }

  async useRegisteredItem() {
    if (this.busy || !this.input.free || this.bv.alive || this.player?.move) return;
    this.busy = true;
    try { await this._useRegisteredItem(); } finally { this.busy = false; this.hud?.update(true); }
  }
  async _useRegisteredItem() {
    const st = this.state;
    if (!st) return;
    let reg = st.registeredItem;
    if (!reg && st.bag?.['running-shoes']) reg = 'running-shoes';
    if (!reg && st.bag?.['canne']) reg = 'canne';
    if (!reg && st.bag?.['velo']) reg = 'velo';
    if (!reg) {
      this.sound.sfx('bump');
      await this.ui.say(["Aucun objet n'est enregistré !", "Ouvre ton Sac (touche I), choisis un objet et clique sur 'ENREG. [Y]' pour l'assigner à ce raccourci."]);
      return;
    }
    if ((st.bag?.[reg] || 0) <= 0 && reg !== 'running-shoes') {
      this.sound.sfx('bump');
      await this.ui.say(`Tu n'as plus de ${itemName(reg)} dans ton sac.`);
      return;
    }

    if (reg === 'canne') {
      const p = this.player, m = this.mapObj, [dx, dy] = DIRS[p.dir];
      const fx = p.x + dx, fy = p.y + dy;
      if (m.get(fx, fy) === T.WATER && (m.outdoor || m.surf) && !p.surf && !estLave(m, fx, fy)) {
        await this.pecher(fx, fy);
        return;
      }
      this.sound.sfx('bump');
      await this.ui.say("Il n'y a pas d'eau praticable juste devant toi pour pêcher !");
      return;
    }

    if (reg === 'running-shoes') {
      this.toggleAutoRun();
      return;
    }

    if (reg === 'escape-rope') {
      if (this.mapObj.floor === 'cave' && st.lastOutdoor) {
        this.take(reg);
        await this.ui.say(`${st.name} utilise la Corde Sortie !`);
        await this.warp({ map: 'monde', x: st.lastOutdoor.x, y: st.lastOutdoor.y, dir: 'down' }, 'exit'); this.busy = true;
        return;
      }
      this.sound.sfx('bump');
      await this.ui.say("Ce n'est pas le moment d'utiliser ça !");
      return;
    }

    if (reg === 'repel' || reg === 'super-repel' || reg === 'max-repel') {
      const it = ITEMS[reg];
      this.take(reg);
      this.sound.sfx('item');
      st.repel = Math.max(st.repel || 0, it.repel || 100); st.lastRepel = reg;
      await this.ui.say(`${st.name} utilise un ${itemName(reg)} ! Les Pokémon sauvages s'éloignent.`);
      this.save(true);
      return;
    }

    if (reg === 'velo') {
      await this.toggleVelo();
      return;
    }

    if (reg === 'sifflet-celeste') {
      if (this.player.surf || !this.mapObj.outdoor) {
        this.sound.sfx('bump');
        await this.ui.say("On ne peut pas s'envoler d'ici.");
        return;
      }
      await this.fly();
      return;
    }

    if (reg === 'town-map') {
      await mapScreen(this);
      return;
    }

    // Generic fallback: open bag on item
    await this.fieldBag();
  }

  aChaussures() { return !!(this.libre || this.state?.bag?.['running-shoes']); }
  toggleAutoRun() {
    if (!this.aChaussures()) { this.sound.sfx('bump'); this.ui.toast('Il te faut des Chaussures de Course pour courir. Maman en a peut-être une paire…', 1800); return; }
    // Cycle : Désactivé -> Course Rapide (1.7×) -> Turbo (2.5×) -> Désactivé
    if (!this.autoRun) {
      this.autoRun = true;
      if (this.runSpeed == null || this.runSpeed === 0) this.runSpeed = 1;
    } else if (this.runSpeed === 1) {
      this.runSpeed = 2; // passe en Turbo
    } else {
      this.autoRun = false;
      this.runSpeed = 1; // réinitialise sur Rapide
    }
    storeSet('odyssee-autorun', this.autoRun ? '1' : '0');
    storeSet('odyssee-runspeed', this.runSpeed);
    this.sound.sfx(this.autoRun ? 'select' : 'cancel');
    this.hud?.update(true);
    this.ui.updateRunKeyHint?.(this.autoRun, this.runSpeed);
    const msg = !this.autoRun
      ? 'Marche classique (Course continue désactivée)'
      : this.runSpeed === 2
        ? '⚡ Course continue TURBO (2.5×) activée !'
        : '🏃 Course continue RAPIDE (1.7×) activée !';
    this.ui.toast(msg, 1400);
  }
  setRunSpeed(idx) {
    this.runSpeed = Math.max(0, Math.min(2, idx));
    storeSet('odyssee-runspeed', this.runSpeed);
    this.hud?.update(true);
    this.ui.updateRunKeyHint?.(this.autoRun, this.runSpeed);
  }
  async onKey(k) {
    if (!this.state) return;
    if (k === 'hud') { this.hud?.toggle(); return; }
    if (k === 'autorun') { if (!this.busy && !this.bv.alive) this.toggleAutoRun(); return; }
    if (k === 'chat') { if (!this.busy && !this.bv.alive && !this.player.move) this.openChat(); return; }
    if (k === 'ball') { if (!this.busy && !this.bv.alive) await this.useRegisteredItem(); return; }
    if (this.busy || !this.state || this.player.move) return;
    if (k === 'a') await this.interact();
    else if (k === 'b' || k === 'menu') await this.startMenu();
    else if (k === 'bag') { this.busy = true; try { if (await this.fieldBag()) return; } finally { this.busy = false; } }
    else if (k === 'map') { this.busy = true; try { await mapScreen(this); } finally { this.busy = false; } }
    else if (k === 'velo') { this.busy = true; try { await this.toggleVelo(); } finally { this.busy = false; } }
    else if (k === 'quests') { this.busy = true; try { await questsScreen(this); } finally { this.busy = false; } }
    else if (k === 'trophies') await this.openTrophies();
    else if (k === 'friends') { this.busy = true; try { await friendsScreen(this); } finally { this.busy = false; } }
  }
  async interact() {
    // donjons à plusieurs : miroirs, socles, brasier, coffres, statues…
    if (this.donjons && !this.busy && await this.donjons.interagir()) return;
    if (this.raidMonde && !this.busy && await this.raidMonde.interagir()) return;
    if (this.celestial && !this.busy && await this.celestial.interagir()) return;
    if (this.rifts && !this.busy && await this.rifts.interagir()) return;
    return this.interactJeu();
  }
  async interactJeu() {
    const p = this.player, m = this.mapObj, [dx, dy] = DIRS[p.dir], st0 = this.state;
    let fx = p.x + dx, fy = p.y + dy;
    let n = this.npcs.find((q) => q.x === fx && q.y === fy && !q.move);
    if (!n && m.get(fx, fy) === T.BLOCK && this.view.decoAt.get(key(fx, fy))?.k === 'counter') n = this.npcs.find((q) => q.x === fx + dx && q.y === fy + dy);
    if (!n && this.fol && !this.fol.hidden && !this.fol.move && this.fol.x === fx && this.fol.y === fy && this.followerSp()) { this.busy = true; try { await this.talkFollower(); } finally { this.busy = false; } return; }
    const peer = !n && this.peerAt?.(fx, fy);
    if (peer) { this.busy = true; try { await talkToPeer(this, peer); } finally { this.busy = false; } return; }
    this.busy = true;
    try {
      if (n) await this.talk(n);
      else if (m.get(fx, fy) === T.SIGN) await this.ui.say(m.signs.get(key(fx, fy)) || '...');
      else {
        const it = this.items.find((q) => q.x === fx && q.y === fy);
        const o = m.objectAt(fx, fy), t = m.get(fx, fy);
        // un légendaire est grand : on peut lui parler d'une case de plus
        const L = (this.legends || []).find((q) => (q.x === fx && q.y === fy) || (q.x === fx + dx && q.y === fy + dy && walkable(t)));
        if (L) await this.legendBattle(L);
        else if (it) await this.pickItem(it);
        else if (o?.type === 'baies') await cueillir(this, o);
        else if (o?.type === 'fouille') await fouiller(this, o);
        else if (m.etat && ((o?.type === 'reg' && o.actionne) || o?.type === 'remise')) await actionnerArene(this, o);
        else if (o?.use) await o.use(this.api(), o, fx, fy);
        else if (o?.type === 'pc') await pcScreen(this);
        else if (o?.type === 'naturepc') await naturePcScreen(this);
        else if (o?.type === 'lugia') { if (!st0.flags.lugia && !st0.flags.lugiaCaught) await lugiaBattle(this); }
        else if (o?.type === 'pylon') await this.pylon(o);
        else if (o?.type === 'stele') await this.stele(o);
        else if (o?.type === 'shrine') await this.shrine();
        else if (o?.type === 'starter') await this.chooseStarter(o.sp, o.cap);
        else if (t === T.BLOCK && this.view.decoAt.get(key(fx, fy))) await this.furniture(this.view.decoAt.get(key(fx, fy)).k, fx, fy);
        else if (t === T.CUT) await this.fieldObstacle('coupe', fx, fy, 'Ce petit arbre pourrait être coupé.');
        else if (t === T.SMASH) await this.fieldObstacle('eclate', fx, fy, 'Ce rocher est plein de fissures. Il pourrait être brisé.');
        else if (t === T.BOULDER && m.bloc) await this.ui.say(['Un gros bloc de pollen, tout collant.', 'Impossible de le pousser à la main... Un bon courant d\'air ferait l\'affaire !']);
        else if (t === T.BOULDER) await this.useForce();
        else if (t === T.WATER && estLave(m, fx, fy)) await this.ui.say('De la lave en fusion ! Impossible de s\'approcher davantage.');
        else if (t === T.WATER && (m.outdoor || m.surf) && !p.surf) await this.tryWaterInteraction(fx, fy);
      }
    } finally { this.busy = false; }
  }
  async talk(n) {
    const was = this.busy; this.busy = true;
    n.dir = OPP[this.player.dir];
    const d = n.def, st = this.state;
    try {
      if (d.trainer) {
        if (!st.flags['T:' + n.id]) await this.trainerBattle(n, false);
        else if (revancheBossPossible(this, n)) await revancheBoss(this, n);
        else if (revanchePossible(this, n)) await revanche(this, n);
        else {
          // (une réplique peut dépendre de la partie : (st) => texte)
          const apres = typeof d.trainer.after === 'function' ? d.trainer.after(st) : d.trainer.after;
          await this.ui.say(apres || 'Quel combat !', {
            speaker: nomDresseur(d.trainer),
            face: d.trainer.bs || d.trainer.ow || n.sprite
          });
          if (d.leader != null) await this.retourEntreeArene();
        }
      }
      else if (d.role === 'nurse') await this.nurse();
      else if (d.role === 'shop') { const stShop = (d.stockLate && this.badgeCount() >= (d.stockLateBadges || 8)) ? d.stockLate : d.stock; await shopScreen(this, stShop); }
      else if (d.role === 'relearner') await moveRelearnerScreen(this);
      else if (d.talk) await d.talk(this.api(), n);
      else if (d.script) await this.script(d.script, n);
      else if (d.text) await this.ui.say(/:h\d+$/.test(n.id) && Math.random() < 0.4 ? ragot(this) : (typeof d.text === 'function' ? d.text(this.state, this) : d.text), {
        speaker: d.name || n.name || (d.who ? d.who : null),
        face: d.sprite || n.sprite
      });
    } finally { this.save(true); this.busy = was; }
  }
  async pickItem(it) {
    this.sound.sfx('item');
    this.state.bag[it.item] = (this.state.bag[it.item] || 0) + it.qty;
    this.state.flags['I:' + it.id] = true;
    this.items = this.items.filter((q) => q !== it); this.view.removeActor('item:' + it.id);
    await this.ui.say(formatFindItem(this.state.name, it.item, it.qty));
  }

  /* ================= légendaires ================= */
  /** les légendaires de la carte courante qui sont là (quête faite, pas encore capturés) */
  spawnLegends() { return spawnLegends(this); }
  legendReady(L) { return legendReady(this, L); }
  async legendBattle(L) { return legendBattle(this, L); }
  /** Île Orageuse : les trois relais à rallumer pour ouvrir le Pic Tonnerre */
  async pylon(o) { return pylon(this, o); }
  /** Côte des Ruines : trois stèles à lire pour réveiller l'autel de Mew */
  async stele(o) { return stele(this, o); }
  /** Bois Murmure : l'autel de Celebi */
  async shrine() { return shrine(this); }
  /** bateau de l'Embarcadère : chaque île s'ouvre avec un nombre de badges */
  async ferry(n) { return ferry(this, n); }

  /* ================= animations de terrain authentiques ================= */
  async animateCut(x, y) {
    const pt = this.view.tileToScreen ? this.view.tileToScreen(x, y, 0.3) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const fx = document.createElement('div');
    fx.className = 'field-cut-fx';
    fx.style.left = `${pt.x}px`;
    fx.style.top = `${pt.y}px`;

    const s1 = document.createElement('div'); s1.className = 'cut-slash slash-1';
    const s2 = document.createElement('div'); s2.className = 'cut-slash slash-2';
    fx.append(s1, s2);

    for (let i = 0; i < 12; i++) {
      const leaf = document.createElement('div');
      leaf.className = 'cut-leaf';
      const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = 32 + Math.random() * 30;
      leaf.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      leaf.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.75 + 10}px`);
      leaf.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 720)}deg`);
      leaf.style.animationDelay = `${(i % 3) * 0.03}s`;
      fx.appendChild(leaf);
    }
    this.ui.root.appendChild(fx);

    this.sound.sfx('cut');
    this.view.shake = 0.3;
    await wait(80);
    this.sound.sfx('hitweak');
    await this.ui.flash(1, '#ffffff', 50);
    await wait(280);
    fx.remove();
  }

  animateSurfSplash(x, y) {
    if (typeof document === 'undefined') return;
    const pt = this.view.tileToScreen ? this.view.tileToScreen(x, y, 0) : { x: (typeof window !== 'undefined' ? window.innerWidth : 800) / 2, y: (typeof window !== 'undefined' ? window.innerHeight : 600) / 2 };
    const fx = document.createElement('div');
    fx.className = 'field-surf-splash';
    fx.style.left = `${pt.x}px`;
    fx.style.top = `${pt.y}px`;

    for (let i = 0; i < 3; i++) {
      const r = document.createElement('div');
      r.className = 'surf-ripple';
      fx.appendChild(r);
    }

    for (let i = 0; i < 8; i++) {
      const d = document.createElement('div');
      d.className = 'surf-droplet';
      const angle = (i / 8) * Math.PI * 2;
      const dist = 18 + Math.random() * 22;
      d.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      d.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.6}px`);
      d.style.animationDelay = `${i * 0.02}s`;
      fx.appendChild(d);
    }

    this.ui.root.appendChild(fx);
    setTimeout(() => fx.remove(), 600);
  }

  async animateFlyDeparture() {
    const pt = this.view.tileToScreen ? this.view.tileToScreen(this.player.x, this.player.y, 0.4) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const fx = document.createElement('div');
    fx.className = 'field-fly-fx';
    fx.style.left = `${pt.x}px`;
    fx.style.top = `${pt.y}px`;

    const notes = ['♪', '♫', '♬', '✦', '♪', '♫'];
    notes.forEach((glyph, i) => {
      const n = document.createElement('div');
      n.className = 'fly-musical-note';
      n.textContent = glyph;
      n.style.setProperty('--angle', `${i * 60}deg`);
      n.style.setProperty('--rad', `${36 + (i % 2) * 16}px`);
      n.style.animationDelay = `${i * 0.08}s`;
      fx.appendChild(n);
    });

    for (let i = 0; i < 10; i++) {
      const sp = document.createElement('div');
      sp.className = 'fly-sparkle';
      const a = (i / 10) * Math.PI * 2;
      sp.style.setProperty('--dx', `${Math.cos(a) * (24 + Math.random() * 24)}px`);
      sp.style.setProperty('--dy', `${-18 - Math.random() * 36}px`);
      sp.style.animationDelay = `${i * 0.05}s`;
      fx.appendChild(sp);
    }

    this.ui.root.appendChild(fx);
    await wait(750);
    fx.remove();
  }

  async animateFlyAscent() {
    const p = this.player;
    const dur = 0.55;
    const t0 = performance.now();
    while (performance.now() - t0 < dur * 1000) {
      const u = (performance.now() - t0) / (dur * 1000);
      p.flyElevation = u * u * 4.5;
      if (this.fol) this.fol.flyElevation = p.flyElevation;
      await wait(16);
    }
    p.flyElevation = 4.5;
    if (this.fol) this.fol.flyElevation = 4.5;
  }

  async animateFlyDescent() {
    const p = this.player;
    const dur = 0.65;
    const t0 = performance.now();
    while (performance.now() - t0 < dur * 1000) {
      const u = (performance.now() - t0) / (dur * 1000);
      const ease = 1 - Math.pow(1 - u, 3);
      p.flyElevation = (1 - ease) * 4.5;
      if (this.fol) this.fol.flyElevation = p.flyElevation;
      await wait(16);
    }
    p.flyElevation = 0;
    if (this.fol) this.fol.flyElevation = 0;

    this.sound.sfx('bump');
    this.view.shake = 0.15;
    this.animateLandingDust(p.x, p.y);
  }

  animateLandingDust(x, y) {
    const pt = this.view.tileToScreen ? this.view.tileToScreen(x, y, 0) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const fx = document.createElement('div');
    fx.className = 'field-fly-fx';
    fx.style.left = `${pt.x}px`;
    fx.style.top = `${pt.y}px`;

    [-18, -10, 10, 18].forEach((dx) => {
      const dust = document.createElement('div');
      dust.className = 'fly-landing-dust';
      dust.style.setProperty('--dx', `${dx}px`);
      fx.appendChild(dust);
    });

    this.ui.root.appendChild(fx);
    setTimeout(() => fx.remove(), 400);
  }

  /* ================= capacités de terrain ================= */
  hasField(k) { const f = FIELD[k]; return !!(this.state.bag['cs-' + k] || (f?.item && this.state.bag[f.item])); }
  canField(k) { return this.hasField(k) && this.badgeCount() >= FIELD[k].badge; }
  /** la créature de l'équipe qui utilise la capacité (la première en forme) */
  fieldUser() { return this.state.party.find((m) => m.hp > 0) || this.state.party[0]; }
  async fieldObstacle(k, x, y, look) {
    const F = FIELD[k], st = this.state;
    if (!this.hasField(k)) { await this.ui.say(look); return; }
    if (!this.canField(k)) { await this.ui.say([look, `Il faut le ${BADGES[F.badge - 1].name} pour utiliser ${F.name} hors combat.`]); return; }
    // Coupe : avec la CS, c'est un Pokémon qui coupe ; avec le seul Sécateur Sylvestre, c'est le joueur, et la question le dit
    const outil = k === 'coupe' && !st.bag['cs-coupe'] && F.item && st.bag[F.item] ? 'le ' + F.itemName : null;
    if (!(await this.ui.yesNo(`${look}\nUtiliser ${outil || F.name} ?`))) return;
    const mon = this.fieldUser();
    if (!outil) this.sound.cry(ASSETS.cry(mon.sp));
    if (k === 'coupe') {
      await this.ui.say(outil ? `${st.name} utilise ${outil} et coupe le petit arbre !` : `${monName(mon)} utilise Coupe et tranche le petit arbre !`, { auto: 600 });
      await this.animateCut(x, y);
    } else {
      await this.ui.say(`${monName(mon)} utilise ${F.name} !`, { auto: 500 });
      this.sound.sfx('hitstrong');
      await this.ui.flash(1, '#ffffff', 60);
    }
    const m = this.mapObj;
    m.set(x, y, m.outdoor ? T.GRASS : T.CAVE);
    (st.cleared[m.id] ||= []).push(key(x, y));
    this.view.rebuildAt(x, y);
    this.view.update(0, this.player.x, this.player.y);
  }
  /** Force : une fois activée sur la carte, on pousse les rochers en marchant contre eux */
  async useForce() {
    const look = 'C\'est un gros rocher. Un Pokémon très costaud pourrait le pousser.';
    // dans les arènes, les rochers se poussent sans Force : on le dit au lieu de proposer la CS
    if (this.mapObj?.pushFree) { await this.ui.say('Ce rocher n\'est pas si lourd : marche contre lui pour le pousser.'); return; }
    if (!this.hasField('force')) { await this.ui.say(look); return; }
    if (!this.canField('force')) { await this.ui.say([look, `Il faut le ${BADGES[FIELD.force.badge - 1].name} pour utiliser Force hors combat.`]); return; }
    if (this.strengthOn === this.mapObj.id) { await this.ui.say('Force est active : marche contre le rocher pour le pousser.'); return; }
    if (!(await this.ui.yesNo(`${look}\nUtiliser Force ?`))) return;
    const mon = this.fieldUser();
    this.strengthOn = this.mapObj.id; this.sound.cry(ASSETS.cry(mon.sp)); this.sound.sfx('ledge');
    await this.ui.say(`${monName(mon)} utilise Force !\nIl peut désormais pousser les rochers.`);
  }
  async tryWaterInteraction(fx, fy) {
    const st = this.state;
    const hasRod = !!(st.bag['canne'] > 0);
    const canSurf = this.canField('surf') && st.party.some((m) => m.hp > 0);

    if (hasRod && canSurf) {
      const choice = await this.ui.list({
        title: "L'eau est calme et profonde...",
        items: [
          { label: '🎣 Pêcher à la Canne' },
          { label: '🏄 Surfer sur l\'eau' },
          { label: 'Ne rien faire' }
        ],
        cancel: 2
      });
      if (choice === 0) await this.pecher(fx, fy);
      else if (choice === 1) await this.trySurf(fx, fy, true);
      return;
    }
    if (hasRod) {
      if (await this.ui.yesNo("L'eau est calme et profonde...\nLancer la ligne avec la Canne à Pêche ?")) {
        await this.pecher(fx, fy);
      }
      return;
    }
    await this.trySurf(fx, fy);
  }

  async pecher(fx, fy) {
    const st = this.state;
    if (!st.party.some((m) => m.hp > 0)) {
      await this.ui.say('Tous tes Pokémon sont K.O. ! Mieux vaut se reposer.');
      return;
    }
    this.sound.sfx('splash');
    this.animateSurfSplash(fx, fy);
    await this.ui.say(`${st.name} lance sa ligne...`, { auto: 650 });
    await wait(350);
    await this.ui.say('...', { auto: 450 });
    await wait(350);
    await this.ui.say('... ...', { auto: 450 });

    const m = this.mapObj;
    const z = m.outdoor ? m.zoneAt(fx, fy) : null;
    let pool = z?.surfEnc || m.surfEnc;

    if (!pool || !pool.length) {
      const waterSpecies = (encAt(m, fx, fy) || []).filter(([sp]) => {
        const types = SPECIES[sp]?.t || [];
        return types.includes('water');
      });
      if (waterSpecies.length) pool = waterSpecies;
    }

    if (!pool || !pool.length) {
      const avgLvl = (z?.enc && z.enc.length)
        ? Math.round(z.enc.reduce((a, x) => a + (x[1] + x[2]) / 2, 0) / z.enc.length)
        : Math.max(5, this.badgeCount() * 6 + 6);
      const minL = Math.max(3, avgLvl - 2);
      const maxL = avgLvl + 2;
      pool = [
        [129, minL, maxL, 35],  // Magicarpe
        [1029, minL, maxL, 25], // Bulotin (créature originale Odyssée)
        [118, minL, maxL, 20],  // Poissirène
        [1031, minL, maxL, 15], // Croâbulle
        [60, minL, maxL, 10],   // Ptitard
        [98, minL, maxL, 10],   // Krabby
      ];
    }
    // prises rares, partout où l'on pêche (une fois sur dix) : Qwilfish, Venalgue, Flingouste, Opermine, Moustillon
    if (Math.random() < 0.1) {
      const lv = pool.map((e) => e[1]), lo = Math.min(...lv), hi = Math.max(...pool.map((e) => e[2]));
      pool = [[211, lo, hi, 25], [690, lo, hi, 20], [692, lo, hi, 20], [688, lo, hi, 20], [501, lo, hi, 15]];
    }

    const bite = Math.random() < 0.85;
    if (!bite) {
      this.sound.sfx('bump');
      await this.ui.say('Pas même une touche... Les Pokémon aquatiques ne mordent pas pour l\'instant.');
      return;
    }

    this.player.bang = true;
    this.sound.sfx('bang');   // la bulle « ! » et son bip, comme un dresseur qui te repère
    await this.ui.say('Oh ! Ça mord ! Une prise vigoureuse au bout de la ligne !');
    this.player.bang = false;

    await this.wildBattle(pool, { fishing: true });
  }

  async trySurf(x, y, skipConfirm = false) {
    const st = this.state, m = this.mapObj, p = this.player;
    if (!m?.in(x, y) || m.get(p.x, p.y) === T.BRIDGE || m.height(x, y) !== m.height(p.x, p.y)) { this.sound.sfx('bump'); return; }
    if (!this.canField('surf')) { await this.ui.say(this.hasField('surf') ? ['L\'eau est d\'un bleu profond...', 'Il faut le Badge Mirage pour surfer.'] : 'L\'eau est d\'un bleu profond...'); return; }
    if (!st.party.some((q) => q.hp > 0)) return;
    if (!skipConfirm && !(await this.ui.yesNo('L\'eau est d\'un bleu profond...\nUtiliser le Harnais Flottant ?'))) return;
    await this.ui.say(`${st.name} déploie le Harnais Flottant et s'élance sur l'eau !`, { auto: 600 });
    this.sound.sfx('ledge');
    p.move = { fx: p.x, fy: p.y, tx: x, ty: y, t: 0, dur: 0.35, jump: true, scripted: true };
    while (p.move && p.move.t < 0.85) await wait(16);
    this.sound.sfx('splash');
    this.animateSurfSplash(x, y);
    p.surf = true;
    while (p.move) await wait(16);
    this.updateZone();
  }
  /** Vol : retour dans une ville déjà visitée (devant son Centre de soins) */
  async fly() {
    const st = this.state;
    const towns = Object.values(this.world.towns).filter((t) => this.state.visited.includes(t.id) && (t.centerDoor || t.homeDoor));
    const k = await this.ui.list({ title: 'Voler vers...', items: towns.map((t) => ({ label: t.name })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: towns.length });
    if (k < 0 || k >= towns.length) return false;
    const t = towns[k], mon = this.fieldUser();
    this.sound.cry(ASSETS.cry(mon.sp));
    this.sound.sfx('whistle');
    await this.animateFlyDeparture();
    await this.ui.say(`${st.name} souffle dans le Sifflet Céleste !\nUne mélodie dorée résonne et t'emporte dans les cieux.`, { auto: 700 });
    await this.animateFlyAscent();
    await this.ui.doorTransition(true, 280);
    const [x, y] = t.centerDoor || t.homeDoor;
    this.player.x = x; this.player.y = y + 1; this.player.dir = 'down'; this.player.move = null; this.player.surf = false;
    this.setMap('monde');
    this.view.update(0, this.player.x, this.player.y);
    this.save(true);
    await this.ui.doorTransition(false, 250);
    await this.animateFlyDescent();
    await this.ui.say(t.centerDoor ? `Tu atterris en douceur devant le Centre de soins de ${t.name}.` : `Tu atterris en douceur devant chez toi, à ${t.name}.`, { auto: 650 });
    return true;
  }

  /* ================= menu principal ================= */
  async startMenu() {
    this.busy = true;
    let openChatAfter = false;
    try {
      const st = this.state;
      const opts = [];
      if (st.flags.dex) opts.push(['Pokédex', 'dex']);
      if (st.party.length) opts.push(['Équipe', 'party']);
      if (st.party.length) opts.push(['Boîtes PC', 'pc']);
      opts.push(['Sac', 'bag']);
      if (this.canField('vol')) opts.push(['Vol', 'fly']);
      opts.push(['Quêtes', 'quests']);
      opts.push(['Trophées', 'trophies']);
      opts.push(['Émotes & Chat', 'chat']);
      if (this.donjons?.dansUnDonjon()) opts.push(['Journal du donjon', 'journalDonjon'], ['Quitter le donjon', 'donjon']);
      if (this.donjons?.dansLeReflet()) opts.push(['Revenir au début de la salle', 'debutSalle']);
      if (st.domaine) opts.push([this.mapObj.id === 'domaine' ? 'Revenir' : 'Domaine', 'domaine']);
      const friendsMgr = getFriendsManager(this);
      const others = Math.max(0, friendsMgr.getOnlineCount() - 1);
      opts.push([others ? `Amis (${others} en ligne)` : 'Amis', 'friends']);
      opts.push(['Carte de Dresseur', 'card'], ['Carte', 'map'], ['Code de sauvegarde', 'code'], ['Options', 'opt'], ['Fermer', 'close']);
      // une petite icône devant chaque entrée (celles du HUD et du sac)
      const ICO = { dex: ASSETS.item('dex'), party: 'img/hud/team.png', pc: 'img/hud/save.png', bag: 'img/hud/bag.png', quests: 'img/hud/quest.png', trophies: 'img/hud/trophy.png', friends: 'img/hud/friends.png', card: ASSETS.item('wallet'), map: 'img/hud/map.png', code: ASSETS.item('notebook'), domaine: ASSETS.item('gift'), fly: ASSETS.item('sifflet-celeste'), chat: 'img/hud/chat.png' };
      const itemHtml = ([l, k]) => `<i class="sm-ico">${ICO[k] ? `<img src="${ICO[k]}" alt="">` : ''}</i>${esc(l)}`;
      let idx = Math.min(this._menuIdx || 0, opts.length - 1);
      for (;;) {
        const r = await this.ui.list({ items: opts.map((x) => ({ label: x[0], html: itemHtml(x) })), cls: 'startmenu', cancel: -1, start: idx, onMove: (i) => { this._menuIdx = i; } });
        if (r < 0 || opts[r][1] === 'close') break;
        idx = r;
        const k = opts[r][1];
        if (k === 'dex') await dexScreen(this);
        else if (k === 'party') await partyScreen(this, { mode: 'menu' });
        else if (k === 'pc') await pcScreen(this);
        else if (k === 'bag') { if (await this.fieldBag()) break; }
        else if (k === 'fly') { if (this.player.surf || !this.mapObj.outdoor) { await this.ui.say('On ne peut pas s\'envoler d\'ici.'); continue; } if (await this.fly()) break; }
        else if (k === 'friends') await friendsScreen(this);
        else if (k === 'card') await cardScreen(this, BADGES);
        else if (k === 'map') await mapScreen(this);
        else if (k === 'quests') await questsScreen(this);
        else if (k === 'trophies') await trophiesScreen(this);
        else if (k === 'chat') { openChatAfter = true; break; }
        else if (k === 'donjon') { if (await this.donjons.quitter()) break; }
        else if (k === 'journalDonjon') await this.donjons.journal();
        else if (k === 'debutSalle') { if (await this.ui.yesNo('Revenir à l\'entrée de la salle ? Copycat reprendra sa place.')) { await this.donjons.recommencerSalle(); break; } }
        else if (k === 'domaine') { this.busy = false; if (await allerDomaine(this)) break; this.busy = true; }
        else if (k === 'opt') {
          const res = await optionsScreen(this);
          if (res && res.reload) {
            const ok = await this.ui.yesNo('Les graphismes ont changé ! Sauvegarder et relancer maintenant pour les appliquer ?');
            if (ok) {
              if (this.state && !this.enCombat) this.save(true);
              sessSet('odyssee-auto-action', 'continue');
              await this.ui.fade(true, 250);
              location.reload();
              return;
            }
          }
        }
        else if (k === 'code') {
          // le code reprend la partie telle qu'elle est maintenant : on sauvegarde d'abord
          this.save(true);
          await saveCodeScreen(this.ui, await encodeSave(this.state), saveSummary(this.state));
        }
      }
    } finally {
      this.busy = false;
    }
    if (openChatAfter) this.openChat();
  }
  /** le sprite du joueur : sa tenue composée s'il en a une, sinon le dresseur ou la dresseuse de base */
  recordPvpResult(foeName, result) {
    if (!this.state) return null;
    const outcome = recordPvpMatch(this.state, foeName, result);
    if (outcome.newlyUnlocked && outcome.newlyUnlocked.length > 0) {
      for (const trophy of outcome.newlyUnlocked) {
        showTrophyToast(this, trophy);
      }
    }
    this.save(true);
    return outcome;
  }

  /** un boss vaincu (admins et chefs de l'Éclipse et de la Brume, Nox, boss de la Tour de combat) : pour les médailles */
  noterBoss(nom) {
    if (!this.state || !nom) return;
    const b = (this.state.boss ||= {}); b[nom] = (b[nom] || 0) + 1;
  }
  checkTrophies(notify = true) {
    if (!this.state) return [];
    const newly = checkAllTrophies(this.state);
    if (notify && newly && newly.length > 0) {
      for (const trophy of newly) {
        showTrophyToast(this, trophy);
      }
    }
    return newly;
  }

  async openTrophies() {
    this.busy = true;
    try {
      this.checkTrophies(false);
      await trophiesScreen(this);
    } finally {
      this.busy = false;
    }
  }

  playerSprite() { return this.state.tenue && this._tenueOk ? 'joueur' : this.state.gender === 'f' ? 'player_f' : 'player_m'; }
  /** recolore le dresseur par défaut aux couleurs de sa tenue, dans la planche des personnages */
  appliquerTenue() {
    if (this.state?.tenue) this.state.tenue = tenueValide(this.state.tenue, this.state.gender);
    const T = this.state?.tenue, b = T && !tenueOrigine(T) && this.view.baseDe?.(T.genre);
    this._tenueOk = false;
    if (!b) return;
    this.view.setJoueur(composer(b.src, b.sx, b.sy, T)); this._tenueOk = true;
  }
  /** cabine d'essayage (boutique de mode) */
  async apparence(o = {}) {
    const ui = this.ui, sp = o.armoire ? {} : { speaker: 'Styliste' };
    if (!this.view.baseDe?.('m')) { await ui.say(o.armoire ? 'Ton armoire. Elle est bien rangée.' : ['Bienvenue à la boutique de mode !', 'Nos nouvelles collections arrivent très bientôt.'], sp); return; }
    if (o.armoire) await ui.say('Ton armoire ! Tu veux changer de tenue ?', sp);
    else await ui.say(['Bienvenue à la boutique de mode !', 'Casquette, haut, bas, chaussures, sacoche : choisis leurs couleurs. C\'est offert pour les dresseurs !'], sp);
    const T = await apparenceScreen(ui, { tenue: tenueValide(this.state.tenue, this.state.gender), base: (g) => this.view.baseDe(g) });
    if (!T) { if (!o.armoire) await ui.say('Reviens quand tu veux changer de style !', sp); return; }
    this.state.tenue = T; this.state.gender = T.genre; this.appliquerTenue(); this.sound.sfx('levelup');
    await ui.say(o.armoire ? 'Te voilà prêt' + (T.genre === 'f' ? 'e' : '') + ' pour l\'aventure !' : 'Superbe ! Ce style te va à merveille.', sp);
  }
  /** le frigo de la maison (et l'aimant de l'agence immobilière) */
  frigo() { return frigo(this); }
  /** récolter une ressource du Domaine (souche, rocher, broussaille) */
  recolter(x, y, k) { return recolter(this, x, y, k); }
  /** à vélo : deux fois plus vite que la course, dehors seulement */
  onBike() { return !!this.state?.velo && this.mapObj?.outdoor && !this.player?.surf; }
  async toggleVelo() {
    const st = this.state;
    if (!st.bag.velo) return false;
    if (!st.velo && (!this.mapObj.outdoor || this.player.surf)) { await this.ui.say('Pas de vélo ici ! On ne roule que dehors.'); return false; }
    st.velo = !st.velo; this.sound.sfx(st.velo ? 'select' : 'cancel');
    return true;
  }
  /** CT : apprendre son attaque à un Pokémon de l'équipe (la CT ne s'use pas) */
  async utiliserCT(k) {
    const it = ITEMS[k], M = MOVES[it.ct], st = this.state, ui = this.ui;
    if (!st.party.length) { await ui.say('Tu n\'as encore aucun Pokémon.'); return; }
    await ui.say(`${it.name} : ${it.desc}`, { keep: true });
    if (!(await ui.yesNo(`Apprendre ${M.n} à un Pokémon ?`))) return;
    const i = await partyScreen(this, { mode: 'pick', prompt: `Qui doit apprendre ${M.n} ?` });
    if (i < 0) return;
    const m = st.party[i], nom = monName(m);
    if (!apteCT(m.sp, it)) { await ui.say(`${nom} ne peut pas apprendre ${M.n}.`); return; }
    if (m.moves.some((x) => x.id === it.ct)) { await ui.say(`${nom} connaît déjà ${M.n} !`); return; }
    if (m.moves.length < 4) {
      m.moves.push({ id: it.ct, pp: M.pp }); this.sound.sfx('learn');
      await ui.say(`${nom} apprend ${M.n} !`); this.save(true); return;
    }
    await ui.say(`${nom} veut apprendre ${M.n}, mais il connaît déjà quatre attaques.`);
    const j = await ui.list({
      title: `Quelle attaque oublier pour ${M.n} ?`,
      items: m.moves.map((x) => ({ label: MOVES[x.id].n, right: `${TYPE_FR[MOVES[x.id].t]} · PP ${x.pp}/${MOVES[x.id].pp}` })).concat([{ label: 'Annuler' }]),
      cls: 'psub learn', cancel: 4,
    });
    if (j < 0 || j >= 4) { await ui.say(`${nom} n'apprend pas ${M.n}.`); return; }
    const old = MOVES[m.moves[j].id].n;
    m.moves[j] = { id: it.ct, pp: M.pp }; this.sound.sfx('learn');
    await ui.say(['1, 2, 3... et Pouf !', `${nom} oublie ${old}...`, `Et ${nom} apprend ${M.n} !`]);
    this.save(true);
  }
  /** fin d'un Repousse : on propose d'en utiliser un autre tout de suite (le même s'il en reste, sinon un autre) */
  async repelFini() {
    const st = this.state, ui = this.ui;
    await ui.say('L\'effet du Repousse s\'est dissipé...');
    const order = [st.lastRepel, 'repel', 'super-repel', 'max-repel'].filter(Boolean);
    const k = order.find((id) => st.bag[id] > 0); if (!k) return;
    if (!(await ui.yesNo(`Utiliser un autre ${itemName(k)} ?\n(il t'en reste ${st.bag[k]})`))) return;
    st.repel = ITEMS[k].repel; st.lastRepel = k; this.take(k); this.sound.sfx('item');
    await ui.say(`${st.name} utilise ${itemName(k)}.\nLes Pokémon sauvages faibles fuiront pendant ${st.repel} pas.`);
  }
  /** sac hors combat ; renvoie true si l'objet utilisé ferme le menu (Corde Sortie, Vol…) */
  async fieldBag() {
    for (;;) {
      const r = await bagScreen(this, { sansSoins: !!this.mapObj.faille }); if (!r) return false;
      if (this.mapObj.faille && estSoin(r.item)) { await this.ui.say('Les objets de soin n\'ont aucun effet dans une faille !'); continue; }
      const it = ITEMS[r.item], st = this.state;
      if (it.ball) { await this.ui.say('Ce n\'est pas le moment d\'utiliser ça !'); continue; }
      if (r.item === 'canne') {
        const p = this.player, m = this.mapObj, [dx, dy] = DIRS[p.dir];
        const fx = p.x + dx, fy = p.y + dy;
        if (m.get(fx, fy) === T.WATER && (m.outdoor || m.surf) && !p.surf && !estLave(m, fx, fy)) {
          await this.pecher(fx, fy);
          return true;
        }
        await this.ui.say('Place-toi face à l\'eau depuis la rive pour lancer ta ligne !');
        continue;
      }
      if (r.item === 'town-map') { await mapScreen(this); continue; }
      if (r.item === 'velo') { if (await this.toggleVelo()) return true; continue; }
      if (it.ct) { await this.utiliserCT(r.item); continue; }
      if (it.field) {
        if (it.field === 'vol') {
          if (this.canField('vol')) {
            if (this.player.surf || !this.mapObj.outdoor) {
              await this.ui.say('On ne peut pas s\'envoler d\'ici.');
              continue;
            }
            if (await this.fly()) return true;
            continue;
          }
          await this.ui.say([`${FIELD.vol.itemName} : ${FIELD.vol.desc}`, `Il faut le ${BADGES[FIELD.vol.badge - 1].name} pour l'utiliser hors combat.`]);
          continue;
        }
        await this.ui.say([`${FIELD[it.field].name} : ${FIELD[it.field].desc}`, this.canField(it.field) ? 'Place-toi face à l\'obstacle et appuie sur F pour l\'utiliser.' : `Il faut le ${BADGES[FIELD[it.field].badge - 1].name} pour l'utiliser hors combat.`]);
        continue;
      }
      // Repousses : on peut en utiliser plusieurs d'affilée, les pas s'additionnent (le sac reste ouvert)
      if (it.repel) {
        st.repel = Math.min(9999, (st.repel || 0) + it.repel); st.lastRepel = r.item; this.take(r.item); this.sound.sfx('item');
        await this.ui.say(`${st.name} utilise ${itemName(r.item)}.\nLes Pokémon sauvages faibles fuiront pendant ${st.repel} pas.`); continue;
      }
      if (r.item === 'escape-rope') {
        if (this.mapObj.floor === 'cave' && st.lastOutdoor) { this.take(r.item); await this.ui.say(`${st.name} utilise la Corde Sortie !`); await this.warp({ map: 'monde', x: st.lastOutdoor.x, y: st.lastOutdoor.y, dir: 'down' }, 'exit'); return true; }
        await this.ui.say('Ce n\'est pas le moment d\'utiliser ça !'); continue;
      }
      if (!st.party.length) { await this.ui.say('Tu n\'as encore aucun Pokémon.'); continue; }
      const cap = this.levelCap();
      const target = await partyScreen(this, { mode: 'pick', prompt: `Utiliser ${itemName(r.item)} sur quel Pokémon ?`, filter: (m) => (canUseOn(r.item, m, cap) ? null : it.candy && m.lvl >= cap && m.lvl < 100 ? `Niv. max (${cap})` : 'Pas d\'effet') });
      if (target < 0) continue;
      const m = st.party[target];
      // la pierre n'est consommée que si l'évolution a bien lieu (elle peut être annulée)
      if (it.stone) { if (await this.evolveScene(m, itemEvolution(m, r.item))) this.take(r.item); return true; }
      if (it.candy) {
        this.take(r.item); const steps = useCandy(m, cap); this.sound.sfx('levelup');
        await this.ui.say(`${monName(m)} monte au niveau ${m.lvl} !`);
        for (const s of steps) { for (const id of s.learned) {
          const M = MOVES[id];
          const cat = M.c === 'special' ? 'Spécial' : M.c === 'status' ? 'Statut' : 'Physique';
          const pow = M.p ? ('Puis. ' + M.p) : 'Statut';
          const acc = M.a ? ('Préc. ' + M.a + '%') : 'Préc. —';
          await this.ui.say([
            `${monName(m)} apprend ${M.n} !`,
            `[${TYPE_FR[M.t]} · ${cat} · ${pow} · ${acc}]\n${moveDesc(M)}`
          ]);
        } for (const id of s.ask) await this.askLearn(m, id); }
        const to = levelEvolution(m, this.hour()); if (to) await this.evolveScene(m, to);
        continue;
      }
      let moveIdx = -1;
      if (it.pp) { moveIdx = await this.ui.list({ title: 'Quelle attaque ?', items: m.moves.map((x) => ({ label: MOVES[x.id].n, right: `${x.pp}/${MOVES[x.id].pp}` })), cls: 'psub', cancel: -1 }); if (moveIdx < 0) continue; }
      const msg = applyItem(r.item, m, moveIdx);
      if (msg) { this.take(r.item); this.sound.sfx('heal'); await this.ui.say(msg); }
    }
  }
  take(item, n = 1) { const b = this.state.bag; b[item] = (b[item] || 0) - n; if (b[item] <= 0) delete b[item]; }
  give(item, n = 1) { if (ITEMS[item]?.key && !ITEMS[item]?.stack) { this.state.bag[item] = 1; return; } this.state.bag[item] = (this.state.bag[item] || 0) + n; }

  /* ================= combats ================= */
  seenCount(sp) {
    if (!sp) return 0;
    const dex = this.state?.dex;
    if (!dex) return 0;
    if (dex.seenCount && dex.seenCount[sp] != null) return dex.seenCount[sp];
    return dex.seen?.includes(sp) ? 1 : 0;
  }
  isSpeciesKnown(sp) {
    if (!sp) return false;
    const dex = this.state?.dex;
    if (!dex) return false;
    if (dex.caught?.includes(sp)) return true;
    for (const m of (this.state.party || []).concat(this.state.box || [])) {
      if (m && m.sp === sp) return true;
    }
    return this.seenCount(sp) >= 3;
  }
  markSeen(sp) {
    if (!sp) return;
    const dex = this.state.dex;
    dex.seenCount ||= {};
    dex.seenCount[sp] = (dex.seenCount[sp] || 0) + 1;
    if (!dex.seen.includes(sp)) dex.seen.push(sp);
  }
  markCaught(sp) {
    this.markSeen(sp);
    const dex = this.state.dex;
    if (!dex.caught.includes(sp)) dex.caught.push(sp);
  }
  lead() { return this.state.party.find((m) => m.hp > 0); }

  async encounterIntro(kind, isWild = false) {
    if (isWild) {
      this.player.move = null;
      this.player.walking = false;
      this.player.bang = true;
      this.sound.sfx('bang');
      this.view.shake = 0.18;
      await wait(180);
    } else {
      this.sound.sfx('encounter');
    }
    // Triple flash stroboscopique façon DS / 5G
    await this.ui.battleFlash();
    this.player.bang = false;
    // Démarrage de la musique de combat synchronisé avec le balayage
    this.sound.play(kind);
    // Transition cinématographique à lames horizontales biseautées (façon Noir 2 / Blanc 2)
    const curtain = await this.ui.battleWipe({ wild: isWild });
    return curtain;
  }

  /** tire le Pokémon sauvage d'une rencontre (espèce, niveau) ; null si un Repousse le fait fuir (ou équipe K.O.) */
  tirageSauvage(enc, o = {}) {
    let pool = enc;
    const h = this.hour();
    const isNight = h >= 20 || h < 6;
    // les Pokémon de la nuit ne sortent que dans les hautes herbes du dehors (ni en surf, ni à la pêche, ni dans les grottes)
    if (!o.fixed && o.herbe && isNight && enc.length > 1) {
      const avgLvl = Math.round(enc.reduce((a, x) => a + (x[1] + x[2]) / 2, 0) / enc.length);
      const minLvl = Math.max(2, avgLvl - 2), maxLvl = Math.max(minLvl, avgLvl + 2);
      const nightSp = avgLvl < 15 ? [92, 163, 167, 41] : avgLvl < 30 ? [92, 198, 41, 1039] : [93, 198, 42, 1040];
      const nightEnc = nightSp.map((sp) => [sp, minLvl, maxLvl, 12]);
      pool = [...enc.filter((x) => x[0] !== 16 && x[0] !== 1010), ...nightEnc];
    }
    let e = pool[0];
    if (!o.fixed) { const tot = pool.reduce((a, x) => a + x[3], 0); let r = Math.random() * tot; for (const x of pool) { r -= x[3]; if (r <= 0) { e = x; break; } } }
    const lvl = e[1] + Math.floor(Math.random() * (e[2] - e[1] + 1));
    const lead = this.lead(); if (!lead) return null;
    if (!o.fixed && this.state.repel > 0 && lead.lvl > lvl) return null;
    return { e, lvl };
  }

  async wildBattle(enc, o = {}) {
    const tir = o.tirage || this.tirageSauvage(enc, o); if (!tir) return;
    const { e, lvl } = tir;
    const wasBusy = this.busy;
    this.busy = true;
    try {
      const wild = createMon(o.fixed ? e[0] : SAUVAGE(e[0]), lvl, { met: this.locationName() });
      this.celestial?.applyWildBonus(wild);
      return await this.runBattle({ wild, music: o.music });
    } finally {
      this.busy = wasBusy;
    }
  }

  async trainerBattle(n, spotted) {
    const d = n.def, tr = d.trainer, st = this.state;
    if (this.noTrainers) { await this.ui.say(`${tr.cls || 'Dresseur'} ${tr.name} : (version de test, combats de dresseurs désactivés)`); return 'skip'; }
    this.busy = true;
    const isElite = tr.cls === 'Conseil 4';
    const isChampion = !!d.champion || tr.cls === 'Maître';
    const leaderObj = d.leader != null
      ? LEADERS[d.leader]
      : ((tr.cls === 'Champion' || tr.cls === 'Championne') ? LEADERS.find((L) => L.name === tr.name) : null);
    const isEclipseBoss = d.winScript === 'boss1' || d.winScript === 'boss2' || tr.cls === 'Chef Éclipse' || tr.cls === 'Admin Éclipse';
    const isTourFinale = n.id === 'tour:6';
    const isBossRematch = !!d.boss && !String(n.id || '').startsWith('tour:');
    const dMusic = (d.music === 'leader' && isElite) ? 'elite4' : d.music;
    const music = dMusic || (isChampion ? 'champion' : isElite ? 'elite4' : (d.leader != null || leaderObj) ? 'leader' : d.rival ? 'rival' : isTourFinale ? 'champion' : d.boss ? 'leader' : 'trainer');
    if (spotted) {
      this.musicLock = true; this.sound.play(music === 'trainer' ? 'trainer' : music);
      n.bang = true; this.sound.sfx('bang'); await wait(650); n.bang = false;
      // le dresseur s'approche
      const p = this.player;
      const steps = Math.abs(p.x - n.x) + Math.abs(p.y - n.y) - 1;
      if (steps > 0) { n.back = { steps, dir: n.dir }; await this.npcWalk(n, n.dir, steps); }
      p.dir = OPP[n.dir];
    }
    this.musicLock = true; this.sound.play(music);
    await this.ui.say(tr.intro, {
      speaker: nomDresseur(tr),
      face: tr.bs || tr.ow || n.sprite
    });
    // le premier champion reste une marche d'apprentissage : IV ordinaires et pas d'objet tenu
    const isBoss = (d.leader != null && d.leader !== 0) || d.champion || d.boss || isEclipseBoss;
    const leaderDefaultItem = (sp, lvl, noEviolite = false) => {
      const S = SPECIES[sp]; if (!S) return 'sitrus-berry';
      const type = S.t[0] || 'normal';
      const typeBoosters = { fire: 'charcoal', water: 'mystic-water', grass: 'miracle-seed', electric: 'magnet', dark: 'black-glasses', rock: 'hard-stone', ground: 'soft-sand', flying: 'sharp-beak', fighting: 'black-belt', poison: 'poison-barb', psychic: 'twisted-spoon', bug: 'silver-powder', dragon: 'dragon-fang', ice: 'never-melt-ice', steel: 'metal-coat', normal: 'silk-scarf' };
      if (lvl >= 65) return 'life-orb';
      if (!noEviolite && S.ev && S.ev.length) return 'eviolite';
      return typeBoosters[type] || 'sitrus-berry';
    };
    const party = tr.team.map((entry, idx) => {
      const [sp, lvl, heldItem, customMoves, ability] = Array.isArray(entry) ? entry : [entry.sp, entry.lvl, entry.item, entry.moves, entry.ability];
      const autoItem = d.leader === 1
        ? (idx === tr.team.length - 1 ? leaderDefaultItem(sp, lvl, true) : null)
        : (isBoss ? leaderDefaultItem(sp, lvl) : null);
      return createMon(sp, lvl, {
        iv: Array(6).fill(d.leader === 1 ? 20 : isBoss ? 31 : Math.min(31, 8 + lvl / 2 | 0)),
        item: heldItem || autoItem,
        // Champions, Ligue, rivaux (IA « smart ») : des attaques choisies plutôt que les quatre dernières apprises
        moves: customMoves || (isBoss || tr.ai === 'smart' ? movesChoisies(sp, lvl) : null),
        ability: ability || null,
        shiny: false
      });
    });
    if (d.leader != null || isChampion || isElite || isEclipseBoss || isTourFinale || isBossRematch) {
      await playBossCinematic(this, {
        trainer: tr,
        cls: tr.cls,
        bs: tr.bs || tr.ow || n.sprite,
        leader: d.leader,
        champion: isChampion,
        elite: isElite,
        eclipse: isEclipseBoss,
        gymType: leaderObj?.type,
        sub: isTourFinale ? 'Combat 7/7 · Sommet de la Tour' : undefined,
        badge: isTourFinale ? 'TOUR DE COMBAT · FINALE' : undefined,
      });
    }
    const res = await this.runBattle({ trainer: { ...tr, ...(d.leader != null ? { leader: d.leader } : {}), bs: tr.bs || tr.ow || n.sprite, items: { ...(tr.items || {}) } }, party, music, id: n.id, leader: d.leader, champion: d.champion, rival: d.rival, noWhiteout: d.noWhiteout, format: tr.format || d.format, slots: tr.slots || d.slots });
    this.musicLock = false;
    this.updateZone();
    if (res === 'win') {
      st.flags['T:' + n.id] = true;
      noteCombat(this, n);
      if (isEclipseBoss || isTourFinale || d.boss) this.noterBoss(tr.name);
      if (d.leader != null) await this.badgeScene(d.leader, tr.name);
      if (typeof d.onWin === 'function') await d.onWin(this.api(), n); else if (d.onWin) await this.script(d.onWin, n);
      if (d.beatenPos) { await this.npcWalk(n, 'right', d.beatenPos[0] - n.x); n.dir = 'down'; n.home = [n.x, n.y]; }
      if (d.winScript) await storyWin(this, d.winScript, n);
      if (d.vanish && this.npcs.includes(n)) { await this.ui.fade(true, 200); this.npcs = this.npcs.filter((q) => q !== n); this.view.removeActor('npc:' + n.id); await this.ui.fade(false, 200); }
      if (d.beatenPos || d.vanish || d.winScript) this.refreshNpcs();
      if (d.champion) await this.ending();
      if (d.leader != null) await this.retourEntreeArene();
      // battu, il retourne à sa place pour ne pas boucher le passage (couloirs des arènes)
      if (n.back && !d.beatenPos && !d.vanish && this.npcs.includes(n)) { const B = n.back; await this.npcWalk(n, OPP[B.dir], B.steps); n.dir = B.dir; }
    }
    n.back = null;
    this.updateZone();
    this.busy = false;
    return res;
  }
  /** après le Champion : un raccourci jusqu'à la sortie de l'arène, pour ne pas refaire l'énigme à l'envers */
  async retourEntreeArene() {
    const m = this.mapObj; if (m.gymLock == null || m.exitX == null) return;
    if (!(await this.ui.yesNo('Retourner directement à l\'entrée de l\'arène ?'))) return;
    await this.warp({ map: m.id, x: m.exitX, y: m.exitY - 1, dir: 'down' }, 'select');
  }
  async badgeScene(g, name) {
    const st = this.state, ui = this.ui;
    st.badges[g] = true;
    for (const mon of (st.party || [])) if (!this.dernierCombat?.size || this.dernierCombat.has(mon.uid)) addMemory(mon, 'gym_victory', this.mapObj?.name || name);
    try { this.checkTrophies(true); } catch (e) { warnDev('trophies', e); }
    this.sound.sfx('badge');
    await ui.say(`${st.name} reçoit le ${BADGES[g].name} de la part de ${name} !`);
    const lines = {
      0: ['Avec ce badge, tu prouves ta valeur de dresseur.', 'Le garde au nord de la ville te laissera passer vers le Bois Murmure.', 'Et prends aussi ceci : une technique de ma ruche, que mes Pokémon utilisent pour coller leurs proies au sol.'],
      1: ['La route 4, à l\'est, t\'est désormais ouverte.', 'Voltacité t\'attend au bout de la côte.'],
      2: ['Le garde de la route 5 te laissera passer.', 'Floralia et sa Championne sont au sud-ouest.'],
      3: [
        'Et prends aussi ceci : le Sécateur Sylvestre !',
        'Ciselé par les maîtres arboristes de Floralia, il tranche net les ronces et buissons épineux.',
        'Avec mon Badge Pétale, tu peux désormais ouvrir le passage de la Route 6 vers Mirage, à l\'est. Prends bien soin de nos forêts !'
      ],
      4: [
        'J\'ai vu ton avenir : ta destinée t\'attend au-delà des flots. Prends ce Harnais Flottant !',
        'Cette selle nautique profilée épouse la surface des eaux et te permettra de surfer sur la mer.',
        'Au sud, le Cap Mirage fait face au Sanctuaire des Marées et aux îles des trois frères.',
        'Méfie-toi de Drakos. Il a autrefois défié Célestine... et ne s\'en est jamais remis.'
      ],
      5: ['Tiens, la CS03 : Éclate-Roc. Elle brise les rochers fissurés.', 'Tu en auras besoin sur la Grande Île.', 'Drakos est notre frère aîné. Il a perdu la finale de la Ligue contre Célestine, il y a dix ans.', 'Depuis, il a juré qu\'aucun Maître ne dicterait sa loi aux îles. Pyros et moi... nous l\'avons suivi.'],
      6: this.hasField('vol')
        ? ['Drakos t\'attend à Fort-Écaille, sur la Grande Île, à l\'ouest.', 'Je vois que tu portes déjà le Sifflet Céleste des Sages de la Tour Dorée ! Les vents te porteront sans peine jusqu\'à lui.', 'Mon frère a besoin qu\'on le batte. Peut-être qu\'il ouvrira enfin les yeux.']
        : ['Drakos t\'attend à Fort-Écaille, sur la Grande Île, à l\'ouest.', 'Tiens, prends ce Sifflet Céleste qu\'un pèlerin de la Tour Dorée m\'a confié. Il appellera un oiseau pour te transporter d\'une ville à l\'autre en un instant !', 'Mon frère a besoin qu\'on le batte. Peut-être qu\'il ouvrira enfin les yeux.'],
      7: ['...Tu te bats comme Célestine. Avec tes Pokémon, pas contre eux.', 'Les îles resteront libres. Mais j\'arrête de prélever les pêches et de fermer les ports.', 'Il reste encore les sept Champions des Terres du Sud, au-delà du Pont de l\'Austral, avant la Ligue. Et dis à Célestine que le vieux Drakos attend sa revanche.', 'Ah, et le Cap des Étoiles, au nord de la ville, t\'est ouvert. Odyssor y passe parfois...'],
      8: [`Ton bilan est positif, ${st.name}. Tu sais calculer tes risques !`, 'La Route 14, à l\'est de la ville, mène à Port-Lisière sur les falaises. Aurèle y commande le vent.'],
      9: ['Tu as percé les courants comme un as !', 'Plus à l\'est, la Route 15 traverse le marécage jusqu\'à Marais-Noir. Garde des Antidotes dans ton sac !'],
      10: ['Le marais s\'incline devant toi...', 'Prends la Route 16 vers le sud : les Dunes d\'Ocre et le désert de Gaspard t\'attendent.'],
      11: ['Tu tiens bon même sur le sable mouvant !', 'Descends le Canyon d\'Ocre par la Route 17 jusqu\'à Forge-Acier. Ferdinand va tester ton équipe au feu et au fer.'],
      12: ['Un travail de maître forgeron !', 'À l\'ouest, la Route 18 fleurie mène à Rosebrume. Ne te laisse pas attendrir par les Fées de Lilas !'],
      13: ['Ton cœur et celui de tes Pokémon brillent d\'un bel éclat.', 'La Route 19, à l\'ouest, s\'enfonce vers Ombreval. Le garde te laissera passer — bon courage face à Corbin !'],
      14: ['Les ténèbres n\'ont pas éteint ta flamme. Tu tiens tes quinze badges !', 'Remonte vers le nord par la Route 20 pour rejoindre Métropole, puis file à Cimelune et à la Route Victoire. La Ligue Céleste est à ta portée !'],
    }[g];
    if (lines) await ui.say(lines, { speaker: name });
    const gift = GYM_GIFT[g];
    if (gift && !this.hasField(gift)) {
      const itk = FIELD[gift]?.item || ('cs-' + gift);
      this.give(itk); this.sound.sfx('item');
      await ui.say(formatObtainItem(st.name, itk, 1, FIELD[gift]));
    }
    // la CT du Champion, du type de son arène (CT01 Pollen Collant pour Hector : une attaque Insecte propre à Odyssée)
    const ct = CT_DU_BADGE[g];
    if (ct && !st.bag[ct]) {
      this.give(ct); this.sound.sfx('item');
      await ui.say(formatObtainItem(st.name, ct));
      await ui.say(g === 0
        ? ['La CT01 contient Pollen Collant : une attaque Insecte qui englue la cible et baisse sa Vitesse.', 'Une CT ne s\'use pas : tu peux l\'apprendre à autant de Pokémon que tu veux !']
        : `Elle contient ${ITEMS[ct].name.replace(/^CT\d+ /, '')}. Une CT ne s'use pas : sers-t'en autant que tu veux.`, { speaker: name });
    }
    if (g === 7) { st.flags.drakos = true; if (!st.bag['town-map']) this.give('town-map'); }
    // Hector donne aussi la clé de la Crypte des Murmures (donjons/crypte.js)
    if (g === 0 && !st.bag['cle-crypte']) {
      await ui.say(['Une dernière chose. Cette vieille clé ouvre la crypte du Cimetière des Murmures.', 'Tu le trouveras au bout d\'un sentier qui part de la Route 2, dans les bois. On dit que des esprits y murmurent...', 'Vas-y avec des amis, et avec une équipe bien plus forte qu\'aujourd\'hui.'], { speaker: name });
      this.give('cle-crypte'); st.flags['D:crypte:cle'] = true; this.sound.sfx('item');
      await ui.say(formatObtainItem(st.name, 'cle-crypte'));
    }
    this.refreshGates();
    await this.profCall(g);
  }
  /** les trois partenaires de la lignée de Théo */
  rivalLine() { return RIVAL_TEAMS[this.state.flags.rivalSp] || RIVAL_TEAMS[STARTERS[0]]; }
  /** dresseurs d'une route de la grande carte (requêtes des habitants : « bats-les tous ») */
  missionTrainers(route) { return this.world.maps.monde.missionTrainers?.[route] || []; }
  /** le second rival : l'autre enfant de l'histoire (celui que le joueur n'a pas choisi d'incarner) */
  rivalB() {
    const f = this.state.gender === 'f';
    return { name: f ? 'Ethan' : 'Lyra', sprite: f ? 'player_m' : 'player_f', bs: f ? 'player_m' : 'player_f', il: f ? 'il' : 'elle', le: f ? 'le' : 'la', fils: f ? 'petit-fils' : 'petite-fille', e: f ? '' : 'e' };
  }
  /** la troisième capsule du labo : celle que ni le joueur ni Théo n'ont prise (et ses évolutions) */
  thirdLine() {
    const slot = starterSlot(this.state.flags.starter) || { t: 0, k: 0 };
    return STARTER_TABLE[(slot.t + 2) % 3].lines[slot.k];
  }
  /** appel du Prof. Saule sur le Pokématos, après certains badges */
  async profCall(g) {
    const st = this.state, B = this.rivalB(), sp = 'Prof. Saule';
    const calls = {
      1: ['Allô, ' + st.name + ' ? Deux badges, déjà ! Bravo.', 'Écoute : le capitaine de l\'Embarcadère de l\'Aube, à l\'est de la route 1, emmène les dresseurs aguerris vers les îles de l\'Est — pense à passer ton Permis Bateau à la Capitainerie de Port-Azur.', 'On dit qu\'Électhor, l\'oiseau de foudre, dérègle les orages de l\'Île Orageuse. Ça mérite un coup d\'œil !'],
      2: ['Trois badges ! Le capitaine peut maintenant t\'emmener à l\'Île de la Grue.', 'Là-bas vit une doyenne qui connaît la légende de Ho-Oh, l\'oiseau arc-en-ciel, mieux que personne.', 'Il paraît qu\'il se posait autrefois sur une tour dorée...'],
      3: ['Quatre badges... Tu vas bientôt passer à Mirage.', 'Au fait, ' + st.name + ', je ne t\'en ai jamais parlé : j\'ai un' + (B.e ? 'e ' : ' ') + B.fils + ', ' + B.name + '.', B.name + ' a grandi à Port-Granit, sur les îles. Le lendemain de ton départ, ' + B.il + ' est passé' + B.e + ' au labo et a pris la troisième Poké Ball.', 'Depuis, ' + B.il + ' ne répond plus à mes appels. On dit qu\'' + B.il + ' s\'est engagé' + B.e + ' chez les Gardes d\'Écaille de Drakos...', 'Si tu ' + B.le + ' croises, dis-lui que son grand-père pense à ' + (B.e ? 'elle' : 'lui') + '.'],
      4: this.eclipseOn() ? ['Cinq badges ! Et Surf, en plus. Écoute bien, ' + st.name + '.', 'Cette nuit violette ne finira pas toute seule. Si la Team Éclipse a vraiment fermé le cœur de Lugia...', 'La voyante de Mirage connaît les légendes de la mer. Elle saura où dort Lugia. Va la voir avant de partir pour l\'archipel !'] : ['Cinq badges ! Avec Surf, tu peux rejoindre l\'archipel des trois frères, au sud du Cap Mirage.', 'Et le capitaine t\'emmènera aussi à l\'Île Givrée, tout au nord. Artikodin y vivrait... et plus profond encore, Lugia.'],
      7: ['Tu as battu Drakos ?! Toute la région en parle.', st.flags.rivalB3 ? B.name + ' m\'a appelé. Pour la première fois depuis des mois. ' + (B.e ? 'Elle' : 'Il') + ' a quitté les Gardes d\'Écaille.' : 'J\'espère que ' + (B.e ? 'ma ' : 'mon ') + B.fils + ' va bien, là-bas...', 'Avec les huit badges du Nord, le Pont de l\'Austral (au sud de la route 10) s\'ouvre vers les Terres du Sud et leurs sept Champions ! Mais avant, va donc voir le Cap des Étoiles, au nord de Fort-Écaille.'],
      10: ['Onze badges ! Tu avances vite dans les Terres du Sud, ' + st.name + '.', 'Entre le marais, les dunes et Forge-Acier, ces routes mettent n\'importe quel dresseur à l\'épreuve.', 'Garde confiance en tes Pokémon : il ne te reste plus que quatre Champions avant la Ligue Céleste !'],
      14: ['Quinze badges ! Tu as réussi, ' + st.name + ' !', 'Les cinq Champions du Nord, les trois frères de l\'archipel, et les sept Champions des Terres du Sud... Tous ont reconnu ta valeur.', 'La Route Victoire, au nord de Cimelune, t\'ouvre enfin ses portes. Rejoins la Ligue Céleste : toute la région d\'Odyssée compte sur toi !'],
    };
    const c = calls[g]; if (!c) return;
    this.sound.sfx('pc'); await wait(300);
    await this.ui.say('Bip bip... Bip bip... Le Prof. Saule appelle !', { auto: 900 });
    await this.ui.say(c, { speaker: sp });
  }
  refreshGates() {
    // les gardes s'écartent quand on a assez de badges
    const m = this.mapObj;
    this.gateBlock = new Set();
    for (const g of m.gates) if (this.gateClosed(g)) for (const [x, y] of g.tiles) this.gateBlock.add(key(x, y));
    this.npcs = this.npcs.filter((n) => { if (n.def.gate && !this.gateClosed(n.def.gate)) { this.view.removeActor('npc:' + n.id); return false; } return true; });
  }

  async checkTrainers() {
    if (this.noTrainers) return false;   // version de test : pas de combats de dresseurs
    const p = this.player, m = this.mapObj;
    for (const n of this.npcs) {
      const tr = n.def.trainer; if (!tr || !tr.sight || this.state.flags['T:' + n.id]) continue;
      const [dx, dy] = DIRS[n.dir];
      for (let k = 1; k <= tr.sight; k++) {
        const x = n.x + dx * k, y = n.y + dy * k;
        if (!m.canStep(x - dx, y - dy, x, y)) break;   // pas de regard par-dessus une falaise
        if (x === p.x && y === p.y) { await this.trainerBattle(n, true); return true; }
        if (!walkable(m.get(x, y)) || this.npcs.some((q) => q !== n && q.x === x && q.y === y)) break;
      }
    }
    return false;
  }

  /** tirage stable sur un créneau de 10 minutes : le même temps pour tous les joueurs au même endroit */
  weatherSlot(key) {
    let x = Math.floor(Date.now() / 600000);
    for (const ch of String(key)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  }

  getMapWeather() {
    const m = this.mapObj, z = this.zone;
    if (!m) return 'none';
    if (m.weather) return m.weather;
    // le Sanctuaire des Marées : de rares cendres violettes flottent autour de l'autel (du décor, sans effet en combat)
    if (m.id === 'sanctuaire') return 'cendresViolettes';
    // sous un toit ou sous terre, il ne pleut pas : les maisons de Cendrelune (« cendre:… ») recevaient des cendres,
    // celles de Marais-Noir de la pluie, parce que le nom de la ville est dans celui de la carte
    if (!m.outdoor) return 'none';
    if (z?.weather) return z.weather;
    if (z?.theme === 'snow' || m.id?.includes('snow') || m.id?.includes('glace')) return 'hail';
    // zones volcaniques : pluie de cendres (sans effet en combat) qui alterne avec la tempête de sable
    if (z?.theme === 'volcanic' || m.id?.includes('cendre')) return this.weatherSlot('volcan') % 2 ? 'ash' : 'sandstorm';
    if (z?.theme === 'desert' || z?.theme === 'canyon' || z?.town === 'dunes' || m.id?.includes('desert')) return 'sandstorm';
    if (z?.town === 'azur' || z?.town === 'marais' || z?.route === 'r15' || z?.name?.includes('Pluie') || m.id?.includes('marais')) return 'rain';
    // la Nuit Violette (l'Éclipse) : des cendres violettes tombent sur toute la région
    if (m.outdoor && this.eclipseOn()) return 'cendresViolettes';
    if (m.outdoor) {
      const h = this.hour();
      if ((z?.surfEnc || m.surfEnc) && (Math.sin(h * 0.7) > 0.65)) return 'rain';
      // routes : un temps qui tourne toutes les 10 minutes, le même pour tous les joueurs (graine = route + créneau)
      if (z?.route) {
        const r = this.weatherSlot(z.route) % 10;
        // brume du matin dans les forêts, entre 5 h et 10 h
        if (z.theme === 'forest' && h >= 5 && h < 10 && r < 5) return 'fog';
        if (r < 2) return 'rain';
        if (r < 4 && h >= 9 && h < 18 && z.theme !== 'forest') return 'sun';
      }
    }
    return 'none';
  }

  /** combat générique ; o.wild (créature) ou o.trainer + o.party. Si quelque chose casse, on ne reste jamais devant un écran noir. */
  async runBattle(o) {
    this.enCombat = true;
    try { return await this.runBattleSafe(o); } catch (e) {
      console.error('combat interrompu', e);
      try { revertMegas(this.state.party); for (const m of this.state.party) delete m._ko; delete this.state.combatEnCours; this.save(true); } catch { /* rien à remettre */ }
      document.querySelectorAll('.wipe, .battle-wipe').forEach((c) => c.remove());
      try { this.bv.close(); } catch { /* déjà fermé */ }
      this.sound.stopMusic?.(0.1); this.sound.current = null; this.musicLock = false;
      await this.ui.say('Le combat a été interrompu. Réessaie !');
      this.updateZone();
      return 'flee';
    } finally { this.enCombat = false; }
  }
  async runBattleSafe(o) {
    // salles claires des donjons (Miroirs) : fond de combat clair, pas celui des grottes
    const mc = this.mapObj;
    if (mc?.style === 'clair' && !o._clair) {
      const avant = [mc.floor, mc.battleBg]; mc.floor = 'clair'; mc.battleBg = 'league';
      try { return await this.runBattleSafe({ ...o, _clair: true }); } finally { [mc.floor, mc.battleBg] = avant; }
    }
    const st = this.state;
    const isWild = !!(o.wild || o.wildParty);
    const kind = isWild ? o.music || 'wild' : o.music || 'trainer';
    const curtain = await this.encounterIntro(kind, isWild);
    o.apresRideau?.();
    const m = this.mapObj, z = this.zone;
    const isVillage = z?.town === 'aube' || z?.town === 'sylve' || z?.theme === 'village';
    const isCity = !!z?.town || z?.name?.includes('Cité') || z?.name?.includes('Port-');
    const gymKind = (m.arene === 'rock' || m.arene === 'ground' || m.arene === 'fighting') ? 'gym_rock' : 'gym';
    // l'arène de Cendrelune se bat dans le volcan (fond et socles volcaniques), pas dans la grotte des arènes de roche
    const bg = !m.outdoor ? (m.floor === 'cave' ? 'cave' : m.battleBg === 'gym' ? (m.arene === 'fire' ? 'volcanic' : gymKind) : m.battleBg) : this.player.surf ? 'water' : z?.theme === 'volcanic' ? 'volcanic' : z?.theme === 'snow' ? 'snow' : isVillage ? 'village' : isCity ? 'city' : 'grass';
    const weather = o.weather || this.getMapWeather();
    // Méga-Évolution : le joueur avec son Méga-Anneau ; un dresseur marqué megaSp tend sa gemme à ce Pokémon (« ace » : le dernier)
    // À partir de la 6e arène (5 badges), les Champions et au moins un dresseur sur trois méga-évoluent
    if (o.trainer && !o.trainer.megaSp && !o.trainer.friendly && o.party?.length && this.badgeCount() >= 5) {
      const isGrunt = /sbire/i.test(o.trainer.cls || '');
      const key = String(o.id || o.trainer.name || ''); let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      if (o.leader != null || o.champion || (!isGrunt && h % 3 === 0)) o.trainer = { ...o.trainer, megaSp: 'auto', megaSeed: h };
    }
    if (o.trainer?.megaSp && o.party?.length) {
      let target = o.trainer.megaSp === 'ace' ? o.party[o.party.length - 1]
        : o.trainer.megaSp === 'auto' ? [...o.party].sort((a, b) => b.lvl - a.lvl).find((q) => MEGAS_OF[q.sp])
          : o.party.find((q) => q.sp === o.trainer.megaSp);
      // personne dans l'équipe n'a de Méga : son dernier Pokémon laisse la place à un Pokémon qui en a une (toujours le même pour ce dresseur)
      // personne dans l'équipe n'a de Méga : le dresseur s'en passe (on ne remplace plus son dernier Pokémon)
      const forms = target && MEGAS_OF[target.sp];
      const pid = (o.trainer.megaForm && forms?.includes(o.trainer.megaForm)) ? o.trainer.megaForm : forms && forms[(o.trainer.megaSeed || 0) % forms.length];
      if (pid) { target.item = MEGA_FORMS[pid].stone; o.trainer = { ...o.trainer, mega: true }; }
    }
    const format = o.format || o.trainer?.format, slots = o.slots || o.trainer?.slots;
    const wildParty = o.wildParty || (o.wild ? [o.wild] : null);
    const battle = new Battle({ player: { name: st.name, party: st.party, bag: st.bag, mega: (st.bag[MEGA_RING] || 0) > 0 }, foe: wildParty ? { name: 'sauvage', party: wildParty } : { name: o.trainer.name, party: o.party, trainer: o.trainer }, cap: this.levelCap(), weather: BATTLE_WEATHERS.includes(weather) ? weather : undefined, weatherTurns: o.weather ? 0 : 5, format, slots, inverse: !!o.inverse, chaosWeather: !!o.chaosWeather, alpha: !!o.alpha, aura: o.aura, sansFuite: !!o.sansFuite, sansSoins: !!o.sansSoins });
    // combat de dresseur en cours : noté dans la sauvegarde, pour que recharger la page ne permette pas d'y échapper
    if (o.trainer && !o.trainer.friendly && !o.noWhiteout) { st.combatEnCours = true; this.save(true); }
    const foeMons = wildParty || o.party;
    const h = this.hour();
    // fond teinté : arènes de Voltacité, Floralia, Mirage et de l'archipel (roche, feu, dragon) à leurs couleurs, et dehors
    // pendant la Nuit Violette
    const teinte = o.fond ? null : !m.outdoor && m.battleBg === 'gym' && ['electric', 'grass', 'psychic', 'rock', 'fire', 'dragon'].includes(m.arene) ? m.arene : m.outdoor && this.eclipseOn() ? 'eclipse' : null;
    // météo de décor : les cendres de Cendrelune tombent aussi pendant le combat (dehors, et dans la Forge de Pyros)
    const meteoDecor = o.fond ? null : weather === 'ash' || (!m.outdoor && m.battleBg === 'gym' && m.arene === 'fire') ? 'ash' : null;
    const result = await this.bv.run(battle, { bg: o.fond ? 'faille' : bg, teinte, meteoDecor, fond: o.fond || null, night: !o.fond && m.outdoor && (h >= 20 || h < 5.5), weather: BATTLE_WEATHERS.includes(weather) ? weather : 'none', curtain });
    // argent
    if (result === 'win' && battle.prizeMoney) st.money += battle.prizeMoney;
    this.dernierCombat = battle.participants;   // ceux qui ont combattu (souvenir d'Arène)
    const souvenirs = result === 'win' || result === 'caught' ? recordBattleMemories(this, battle, result, { rift: !!o.rift, alpha: !!o.alpha }) : [];
    try { this.checkTrophies?.(true); } catch (e) { warnDev('trophies', e); }
    if (result === 'caught') {
      const mon = battle.caughtMon || foeMons[0]; mon.ot = st.name; mon.met = this.locationName();
      normalizeCapturedAlpha(mon);
      const isNew = !st.dex.caught.includes(mon.sp);
      this.markCaught(mon.sp);
      this.bv.close();
      if (isNew) {
        await pokedexRegisterScene(this, mon);
      }
      if (await this.ui.yesNo(`Donner un surnom à ${SPECIES[mon.sp].n} ?`)) { const nick = await this.ui.nameEntry(`Surnom de ${SPECIES[mon.sp].n}`, SPECIES[mon.sp].n); if (nick && nick !== SPECIES[mon.sp].n) mon.nick = nick; }
      mon.status = mon.status === 'frz' ? null : mon.status;
      if (st.party.length < 6) st.party.push(mon);
      else { st.box.push(mon); await this.ui.say(`${monName(mon)} a été envoyé dans le PC.`); }
    } else this.bv.close();
    this.sound.stopMusic(0.1);
    // évolutions après le combat
    if (result !== 'lose') for (const mon of st.party) if (battle.levelUps.has(mon.uid) && mon.hp > 0) { const to = levelEvolution(mon, this.hour()); if (to) await this.evolveScene(mon, to); }
    if (result === 'lose' && o.noWhiteout) for (const mon of st.party) healFull(mon);
    else if (result === 'lose') { o.surDefaite?.(); await this.whiteout(); }
    this.sound.current = null;
    this.updateZone();
    delete st.combatEnCours;
    this.save(true);
    annoncerSouvenirs(this, souvenirs);
    return result;
  }

  async whiteout() {
    const st = this.state;
    if (this.mapObj?.gymLock != null && st.flags['IN:' + this.mapObj.id] && !st.badges[this.mapObj.gymLock]) {
      await this.resetGymChallenge(this.mapObj);
    }
    // comme dans les jeux : la perte dépend des badges et du meilleur niveau, sans jamais dépasser la moitié de la bourse
    const nb = (st.badges || []).filter(Boolean).length, top = Math.max(1, ...st.party.map((m) => m.lvl || 1));
    const lost = Math.min(Math.floor(st.money / 2), [8, 16, 24, 36, 48, 64, 80, 100, 120][Math.min(8, nb)] * top);
    st.money -= lost;
    await this.ui.fade(true, 400);
    for (const m of st.party) healFull(m);
    const c = st.lastCenter;
    this.player.x = c.x; this.player.y = c.y; this.player.dir = c.dir || 'up'; this.player.surf = false;
    this.setMap(c.map);
    this.view.update(0, this.player.x, this.player.y); this.view.render();
    await this.view.solPret?.();
    await this.ui.fade(false, 400);
    await this.ui.say([`${st.name} a perdu ${lost.toLocaleString('fr-FR')} ₽ dans la panique...`, '... ... ...', `${st.name} reprend ses esprits. Ses Pokémon ont été soignés.`]);
  }

  async askLearn(m, moveId) {
    const mv = MOVES[moveId], name = monName(m);
    await this.ui.say([`${name} veut apprendre ${mv.n}.`, `Mais ${name} connaît déjà quatre attaques.`], { keep: true });
    this.ui.closeDialog();
    const k = await learnMoveScreen(this, m, moveId);
    if (k >= 0 && k < 4) {
      const old = MOVES[m.moves[k].id].n;
      m.moves[k] = { id: moveId, pp: mv.pp };
      this.sound.sfx('learn');
      await this.ui.say(['1, 2 et... Tadaaa !', `${name} oublie ${old}...`, `Et ${name} apprend ${mv.n} !`]);
    } else {
      await this.ui.say(`${name} n'a pas appris ${mv.n}.`);
    }
  }

  async evolveScene(m, to) {
    if (!to) return;
    const ui = this.ui, oldName = monName(m), fromSp = m.sp;
    const s = el('div', 'screen evo-scr'); s.innerHTML = '<canvas class="evo-cv" width="256" height="192"></canvas>'; ui.root.appendChild(s);
    const cv = s.querySelector('canvas'), x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    let alive = true, pop = null;
    try {
      const [a, b] = await Promise.all([loadImg(ASSETS.front(fromSp, m.shiny)), loadImg(ASSETS.front(to, m.shiny))]);
      const white = (img) => { if (!img) return null; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const q = c.getContext('2d'); q.drawImage(img, 0, 0); q.globalCompositeOperation = 'source-atop'; q.fillStyle = '#fff'; q.fillRect(0, 0, c.width, c.height); return c; };
      const wa = white(a), wb = white(b);
      let mode = 'old', scale = 1, flashA = 0, cancelled = false;
      const drawBg = (t) => { const g = x.createRadialGradient(128, 96, 10, 128, 96, 160); g.addColorStop(0, '#406090'); g.addColorStop(1, '#101830'); x.fillStyle = g; x.fillRect(0, 0, 256, 192); x.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 30; i++) { const ang = i * 0.7 + t * 0.002, r = (t * 0.05 + i * 17) % 140; x.fillRect(128 + Math.cos(ang) * r, 96 + Math.sin(ang) * r * 0.7, 2, 2); } };
      const t0 = performance.now();
      const loop = () => { if (!alive) return; const t = performance.now() - t0; drawBg(t); const img = mode === 'old' ? a : mode === 'new' ? b : mode === 'wa' ? wa : wb; if (img) { const w = 80 * scale * 1.6, h = 80 * scale * 1.6; x.drawImage(img, 128 - w / 2, 120 - h, w, h); } if (flashA > 0) { x.fillStyle = `rgba(255,255,255,${flashA})`; x.fillRect(0, 0, 256, 192); } requestAnimationFrame(loop); };
      loop();
      this.sound.stopMusic(0.2); this.sound.play('evolution');
      await ui.say(`Quoi ? ${oldName} évolue !`, { keep: true });
      this.sound.cry(ASSETS.cry(fromSp));
      pop = this.input.push((k) => { if (k === 'b') cancelled = true; });
      mode = 'wa'; await wait(500);
      this.sound.sfx('evolve');
      for (let i = 0; i < 14 && !cancelled; i++) { mode = i % 2 ? 'wb' : 'wa'; scale = i % 2 ? 1.05 : 0.95; await wait(Math.max(70, 360 - i * 22)); }
      pop(); pop = null;
      if (cancelled) { mode = 'old'; scale = 1; await ui.say(`Hein ? ${oldName} n'a pas évolué !`); }
      else {
        flashA = 1; mode = 'new'; scale = 1; for (let i = 0; i < 20; i++) { flashA = 1 - i / 20; await wait(30); } flashA = 0;
        const res = evolve(m, to); this.markCaught(to);
        this.sound.cry(ASSETS.cry(to)); this.sound.sfx('levelup');
        await ui.say(`Félicitations ! Ton ${oldName} a évolué en ${SPECIES[to].n} !`);
        for (const id of res.learned) {
          const M = MOVES[id];
          const cat = M.c === 'special' ? 'Spécial' : M.c === 'status' ? 'Statut' : 'Physique';
          const pow = M.p ? ('Puis. ' + M.p) : 'Statut';
          const acc = M.a ? ('Préc. ' + M.a + '%') : 'Préc. —';
          await ui.say([
            `${monName(m)} apprend ${M.n} !`,
            `[${TYPE_FR[M.t]} · ${cat} · ${pow} · ${acc}]\n${moveDesc(M)}`
          ]);
        }
        for (const id of res.ask) await this.askLearn(m, id);
      }
      return !cancelled;
    } finally {
      pop?.(); alive = false; s.remove(); this.sound.current = null; this.updateZone();
    }
  }

  /** meubles et objets du décor : un petit texte, comme sur DS (le lit de la maison soigne l'équipe) */
  async furniture(k, x, y) {
    const st = this.state, ui = this.ui, home = this.mapObj.id === 'aube:maison', b = this.badgeCount();
    const pick = (a) => a[(x * 7 + y * 3 + this.mapObj.id.length) % a.length];
    const TV = [
      ['C\'est un film : quatre amis suivent une voie ferrée à travers la forêt.', 'Ça donne envie de partir à l\'aventure !'],
      ['Un reportage sur les Pokémon de la région.', '« Les Germignon adorent les journées ensoleillées... »'],
      ['La météo : grand soleil sur Bourg-Aube, tempête de neige sur l\'Île Givrée.'],
    ];
    if (b >= 3 && !st.badges[7] && !st.flags.drakos && !st.flags.rivalB4) TV.push(['Flash spécial : les Gardes d\'Écaille ferment des ports de pêche.', 'Les pêcheurs de Port-Granit protestent...']);
    if (st.flags.champion) TV.push(['On parle de toi aux informations ! Le nouveau Maître de la Ligue...', 'Maman doit être si fière.']);
    const T_ = {
      books: home ? ['Des livres d\'images sur les Pokémon...', '« Mon premier voyage », celui que Maman te lisait le soir.']
        : pick([['« Le guide du jeune Dresseur ».', 'Chapitre 1 : toujours garder des Potions dans son sac.'],
          ['« Légendes de la région ».', 'On raconte que trois bêtes sacrées veillent sur les îles de l\'est...'],
          ['Un livre de recettes de baies.', '« Tarte à la Baie Oran : de quoi requinquer toute une équipe. »'],
          ['Des cartes marines annotées à la main.', 'Une île tout au nord est entourée d\'un cercle rouge.']]),
      tv: pick(TV),
      fridge: home ? ['Le frigo est bien rempli.', 'Il y a un mot de Maman : « Une part de gâteau t\'attend pour ton retour ! »']
        : pick([['De la limonade bien fraîche et un pot de miel.'], ['Des baies, du lait Meumeu... rien qui se mange en route.'], ['Le frigo ronronne doucement.']]),
      kitchen: home ? ['L\'évier brille.', 'Maman a fait la vaisselle en chantonnant.'] : pick([['L\'évier est impeccable.'], ['De l\'eau goutte du robinet... plic... ploc...'], ['Ça sent bon la soupe de légumes.']]),
      plant: ['Une jolie plante verte, bien arrosée.'],
      clock: ['Tic... tac... L\'horloge est parfaitement à l\'heure.'],
      painting: ['Un tableau : un grand oiseau de feu au-dessus d\'une tour.'],
      boxes: ['Des cartons de déménagement, jamais déballés.'],
      sofa: ['Un canapé moelleux. Pas le temps de faire la sieste !'],
      table: ['Une table bien cirée.'],
      shelf: ['Des rayons de Potions, de Poké Balls et de Repousse bien alignés.'],
      labmachine: ['Une machine pleine de voyants clignotants.', 'Elle analyse les données du Pokédex.'],
      healer: ['La machine de soins. Seule l\'Infirmière sait s\'en servir.'],
      vase: ['Un vase de fleurs fraîches.'], trash: ['Il n\'y a rien d\'intéressant dans la poubelle.'],
      fireplace: ['Un bon feu crépite dans la cheminée.'], bench: ['Un banc pour patienter.'],
      gymstatue: ['Une statue d\'arène.', 'Les noms des Dresseurs qui ont gagné ici y sont gravés.'],
    };
    if (k === 'bed') {
      if (home) {
        await ui.say('Ton lit ! Tu fais une petite sieste...'); this.sound.sfx('heal'); await ui.flash(1, '#000', 600);
        for (const m of st.party) healFull(m);
        await ui.say('Ton équipe est en pleine forme !');
      } else await ui.say('Un lit bien fait. Ce n\'est pas le tien.');
      return;
    }
    if (T_[k]) await ui.say(T_[k]);
  }
  async nurse() {
    const ui = this.ui, st = this.state;
    await ui.say('Bienvenue au Centre Pokémon !', { keep: true, speaker: 'Infirmière' });
    if (await ui.yesNo('Veux-tu que je soigne tes Pokémon ?', { keep: true, speaker: 'Infirmière' })) {
      await ui.say('Très bien. Confie-les-moi quelques instants.', { keep: true, speaker: 'Infirmière' });
      this.sound.sfx('heal'); await wait(2400);
      for (const m of st.party) healFull(m);
      st.lastCenter = { map: this.mapObj.id, x: 6, y: 5, dir: 'up' };
      await ui.say(['Merci d\'avoir attendu.', 'Tes Pokémon sont en pleine forme !'], { keep: true, speaker: 'Infirmière' });
    }
    await ui.say('À bientôt !', { speaker: 'Infirmière' });
  }

  /* ================= quêtes ================= */
  /** avancée d'une quête : 0 = pas commencée, n = étape en cours, 'fin' = terminée */
  qstep(id) { return this.state.flags['Q:' + id] || 0; }
  /** outils donnés aux scripts de quête (world/quetes.js) */
  api() {
    if (this._api) return this._api;
    const g = this, ui = () => g.ui, st = () => g.state;
    const A = this._api = {
      game: g,
      get st() { return g.state; },
      get f() { return g.state.flags; },
      get name() { return g.state.name; },
      get e() { return g.state.gender === 'f' ? 'e' : ''; },
      say: (t, who) => ui().say(t, who ? { speaker: who } : {}),
      yesNo: (q, who) => ui().yesNo(q, who ? { speaker: who } : {}),
      ask: (q, opts, who) => ui().ask(q, opts, { speaker: who, cancel: null }),
      step: (id) => g.qstep(id),
      /** passe la quête à l'étape n (et l'annonce dans le journal) */
      set: async (id, n, quiet) => {
        const was = g.qstep(id); st().flags['Q:' + id] = n;
        // (le vélo et le permis bateau ne sont pas dans world.quests : leur nom vient du journal)
        const Q = (g.world.quests || {})[id] || (nomQuete(id, g) ? { name: nomQuete(id, g) } : null);
        if (!quiet && Q && was !== n) {
          g.sound.sfx(n === 'fin' ? 'badge' : 'item');
          await ui().say(n === 'fin' ? `Quête terminée : ${Q.name} !` : was ? `Journal des quêtes : « ${Q.name} » mis à jour.` : `Nouvelle quête : ${Q.name} !`, { auto: 1400 });
        }
        g.refreshNpcs();
      },
      flag: (k, v = true) => { st().flags[k] = v; g.refreshNpcs(); },
      has: (k, n = 1) => (st().bag[k] || 0) >= n,
      give: async (k, n = 1, quiet) => { g.give(k, n); g.sound.sfx('item'); if (!quiet) await ui().say(formatObtainItem(st().name, k, n)); },
      take: (k, n = 1) => g.take(k, n),
      money: async (n) => { st().money += n; g.sound.sfx('item'); await ui().say(`${st().name} obtient ${n.toLocaleString('fr-FR')} ₽ !`); },
      badges: () => g.badgeCount(),
      heal: () => { for (const m of st().party) healFull(m); },
      sfx: (k) => g.sound.sfx(k),
      wait: (ms) => wait(ms),
      cry: (sp) => g.sound.cry(ASSETS.cry(sp)),
      /** combat contre un dresseur de quête ; renvoie 'win' ou 'lose' */
      fight: async (tr) => {
        const t = { cls: 'Dresseur', prize: 40, ai: 'smart', ...tr, bs: tr.bs || tr.ow || 'garde' };
        if (t.intro) await ui().say(t.intro, { speaker: nomDresseur(t), face: t.bs || t.ow });
        const isRival = t.cls === 'Rival' || t.name === RIVAL_NAME || t.rival;
        const isBrumeBoss = t.cls === 'Chef de la Brume' || t.cls === 'Admin de la Brume' || t.cls === 'Chef Éclipse' || t.cls === 'Admin Éclipse';
        const leaderMatch = (t.cls === 'Champion' || t.cls === 'Championne') ? LEADERS.find((L) => L.name === t.name) : null;
        if (isBrumeBoss || leaderMatch || (t.cls === 'Rival' && t.name === RIVAL_NAME) || t.boss || t.cls === 'Maître') {
          await playBossCinematic(g, {
            trainer: t,
            cls: t.cls,
            bs: t.bs || t.ow,
            gymType: leaderMatch?.type,
            eclipse: isBrumeBoss,
            rival: isRival,
            sub: t.name === 'Nox' ? 'Chef de la Brume · Orbe Rouge' : isBrumeBoss ? t.cls : (t.name === RIVAL_NAME ? 'Dernier Duel · Bourg-Aube' : undefined),
          });
        }
        const party = isRival ? buildRivalParty(g, t.team) : t.team.map(([sp, lvl, item, moves, ab]) => createMon(sp, lvl, { item, ability: ab, iv: Array(6).fill(Math.min(31, 10 + lvl / 2 | 0)), moves: moves || movesChoisies(sp, lvl), shiny: false }));
        g.musicLock = true;
        const defaultItems = isBrumeBoss ? { 'hyper-potion': t.name === 'Nox' ? 2 : 1, ...(t.name === 'Nox' ? { 'full-restore': 1 } : {}) } : {};
        const items = isRival ? getRivalItems(g) : { ...defaultItems, ...(t.items || {}) };
        const megaSp = t.megaSp ?? ((isBrumeBoss || (t.cls === 'Rival' && t.name === RIVAL_NAME)) ? 'ace' : undefined);
        const fightMusic = t.music || (t.name === 'Nox' ? 'legendElemental' : isBrumeBoss ? 'eclipse' : leaderMatch ? 'leader' : isRival ? 'rival' : t.boss ? 'champion' : 'trainer');
        const res = await g.runBattle({ trainer: { ...t, items, megaSp }, party, music: fightMusic, rival: isRival, noWhiteout: t.noWhiteout, format: t.format, slots: t.slots });
        g.musicLock = false; g.updateZone();
        if (res === 'win' && (isBrumeBoss || t.boss)) g.noterBoss(t.name);
        if (res === 'win' && t.after) await ui().say(typeof t.after === 'function' ? t.after(st()) : t.after, { speaker: nomDresseur(t), face: t.bs || t.ow });
        return res;
      },
      /** rencontre d'un Pokémon (sauvage ou légendaire) */
      wild: async (sp, lvl, o = {}) => {
        g.sound.cry(ASSETS.cry(sp));
        if (o.cinematic === true || (o.cinematic !== false && isLegendarySpecies(sp))) {
          await playBossCinematic(g, { sp, title: SPECIES[sp]?.n, shadow: !!o.shadow, preset: o.preset, duration: o.duration });
        }
        return g.wildBattle([[sp, lvl, lvl, 1]], { fixed: true, music: o.music || battleMusicForLegend(sp, !!o.shadow) });
      },
      /** Pokémon offert (équipe, sinon PC) */
      giveMon: async (sp, lvl, o = {}) => {
        const mon = createMon(sp, lvl, { ot: o.ot || st().name, met: o.met || g.locationName(), shiny: false });
        g.markCaught(mon.sp); g.sound.sfx('caught');
        await ui().say(`${st().name} reçoit ${SPECIES[mon.sp].n} !`);
        if (st().party.length < 6) st().party.push(mon); else { st().box.push(mon); await ui().say(`${SPECIES[mon.sp].n} a été envoyé dans le PC.`); }
        return mon;
      },
      /** un Pokémon de l'équipe de cette espèce (ou d'une liste d'espèces) */
      partyHas: (sps) => st().party.find((m) => [].concat(sps).includes(m.sp)),
      warp: (to) => g.warp(to, 'door'),
      banner: (t) => g.ui.banner(t),
      /** fait marcher un PNJ de la carte courante, puis le fait disparaître si gone */
      walk: async (npcId, dir, n, gone) => {
        const q = g.npcs.find((x) => x.id === npcId || x.id.endsWith(':' + npcId)); if (!q) return;
        await g.npcWalk(q, dir, n);
        if (gone) { g.npcs = g.npcs.filter((x) => x !== q); g.view.removeActor('npc:' + q.id); }
      },
      flash: (col = '#ffffff') => ui().flash(1, col, 80),
    };
    return A;
  }
  async questLog() {
    return questsScreen(this);
  }

  /* ================= histoire ================= */
  /** Port-Granit : le Professeur Cèdre remet le Méga-Anneau (5 badges) et la gemme du starter, puis vend les Méga-Gemmes */
  async megaRing() {
    const st = this.state, ui = this.ui, sp = { speaker: 'Pr Cèdre' };
    if (!st.bag[MEGA_RING]) {
      if (this.badgeCount() < 5) { await ui.say(['Je suis le Professeur Cèdre. J\'étudie un phénomène fascinant : la Méga-Évolution.', 'Certains Pokémon dépassent leur forme finale grâce à une Méga-Gemme... et au lien qui les unit à leur dresseur.', 'Reviens quand tu auras cinq badges : je verrai alors si ce lien est assez fort.'], sp); return; }
      await ui.say(['Cinq badges... Je le sens : toi et tes Pokémon, vous êtes prêts.', 'Voici la clé de la Méga-Évolution !'], sp);
      st.bag[MEGA_RING] = 1; this.sound.sfx('badge');
      await ui.say(`${st.name} reçoit le Méga-Anneau !`);
      // la gemme du partenaire de départ, si sa lignée a une Méga
      const line = STARTER_TABLE.flatMap((c) => c.lines).find((l) => l.includes(st.flags.starter)) || [];
      const gem = line.map((x) => MEGAS_OF[x]?.[0]).filter(Boolean).map((pid) => MEGA_FORMS[pid].stone)[0];
      if (gem) { st.bag[gem] = (st.bag[gem] || 0) + 1; this.sound.sfx('item'); await ui.say(`Et ceci pour ton partenaire de toujours : ${st.name} reçoit ${itemName(gem)} !`); }
      await ui.say(['Fais tenir la Méga-Gemme de son espèce à un Pokémon.', 'En combat, appuie sur MÉGA (ou sur M) avant de choisir une attaque : il méga-évoluera, une fois par combat.', 'D\'autres gemmes dorment sur les routes du sud et des îles... et je t\'en vendrai, si tu reviens me voir.'], sp);
      this.save(true); return;
    }
    // la boutique des Méga-Gemmes (les gemmes des légendaires seulement pour le Maître de la Ligue)
    const stock = Object.values(MEGA_FORMS).map((f) => f.stone).filter((g, i, a) => a.indexOf(g) === i && (!LEGEND.has(MEGA_FORMS[STONE_FORM[g]].base) || st.flags.champion))
      .sort((a, b) => itemName(a).localeCompare(itemName(b), 'fr'));
    await ui.say(['Tu viens pour une Méga-Gemme ?', st.flags.champion ? 'Pour le Maître de la Ligue, j\'ai même celles des Pokémon légendaires.' : 'Celles des Pokémon légendaires, je ne les confie qu\'au Maître de la Ligue.'], sp);
    await shopScreen(this, stock);
  }
  async script(name, n) {
    if (await storyTalk(this, name, n)) return;   // histoire principale et quêtes annexes (story.js)
    if (name === 'savoir') return this.savoir(n);
    if (name === 'megaRing') return this.megaRing();
    // Métropole : le comptoir du Casino, Pierre à la Bourse, la styliste de la boutique de mode
    if (name === 'casino') return casinoScreen(this);
    if (name === 'pierre') return entretienPierre(this);
    if (name === 'apparence') return this.apparence();
    if (name === 'architecte') return architecte(this);
    if (name === 'gardienDomaine') return gardienDomaine(this, n);
    if (name === 'resident') return resident(this, n);
    if (name === 'faune') return parlerFaune(this, n);
    if (name === 'colporteur') return colporteur(this, n);
    if (name === 'tourCombat') return tourCombat(this, n);
    if (name === 'clubCombat') return clubCombat(this, n);
    if (name === 'dojoMamadou') return dojoMamadou(this, n);
    if (name === 'dojoBoutique') return dojoBoutique(this, n);
    if (name === 'dojoMascotte') return dojoMascotte(this, n);
    if (name === 'marche') return marche(this, n);
    if (name === 'echange') return echange(this, n);
    if (name === 'relais') return relais(this, n);
    if (name === 'concours') return concours(this, n);
    if (name === 'loterie') return loterie(this, n);
    if (name === 'musicien') return musicien(this, n);
    if (name === 'doyenne') {
      const st = this.state, ui = this.ui, sp = 'Doyenne Amaya', f = st.flags;
      if (f['L:hooh'] === 'caught') { await ui.say(['Ho-Oh t\'a choisi... Après tant d\'années.', 'Les trois bêtes errent toujours dans les îles. Raikou sur l\'Île Orageuse, Entei sur le Chemin du Brasier, Suicune près de Givrebourg.', 'Elles ne se laisseront approcher que par un dresseur aguerri (8 badges).'], { speaker: sp }); return; }
      if (f.plume) { await ui.say(['La Plume Arc-en-ciel et le Sifflet Céleste ! Le Grand Sage t\'a jugé digne de la lignée des gardiens du ciel.', 'Monte sur le toit de la Tour Dorée. Si Ho-Oh le veut, il descendra vers toi. Et le chant de ton sifflet appellera les oiseaux du ciel où que tu sois.'], { speaker: sp }); return; }
      if (!f.grueQuest) {
        f.grueQuest = true;
        await ui.say(['Tu viens du continent ? Assieds-toi, que je te raconte.', 'Là-bas, dans la Forêt des Torii, au sud-ouest de Mirage, deux tours se dressent côte à côte.', 'L\'une a brûlé, et trois Pokémon ont péri dans les flammes. Ho-Oh, l\'oiseau arc-en-ciel, les a ramenés à la vie : ce sont Raikou, Entei et Suicune.', 'Depuis, Ho-Oh ne se pose plus que sur l\'autre, la Tour Dorée... Nos anciens l\'appelaient la Tour de la Grue, comme notre village.', 'Il ne se pose que devant celui qui porte la Plume Arc-en-ciel. Le Grand Sage la garde, au sommet de la tour. Gagne le respect des Sages, et peut-être te la confiera-t-il.'], { speaker: sp });
        return;
      }
      await ui.say(['Les Sages t\'attendent dans la Tour Dorée, sur le continent : dans la Forêt des Torii, au sud-ouest de Mirage.', 'Le Grand Sage Hoël garde la Plume Arc-en-ciel au dernier étage.'], { speaker: sp });
      return;
    }
    if (name === 'grandSage') {
      const st = this.state, ui = this.ui;
      if (st.flags.plume) return;
      st.flags.plume = true; this.give('plume-arc'); this.give('great-ball', 5); this.sound.sfx('item');
      const hadVol = this.hasField('vol');
      if (!hadVol) this.give('sifflet-celeste');
      await ui.say([
        'Ton cœur et celui de tes Pokémon battent à l\'unisson.',
        'Cette Plume Arc-en-ciel t\'appartient désormais pour éveiller Ho-Oh sur le toit de la tour.',
        'Et reçois également ce trésor des cieux : le Sifflet Céleste !',
        'Sculpté dans le bois sacré de la tour et orné d\'un ruban céleste, son chant appelle les grands oiseaux du ciel pour te transporter d\'une ville à l\'autre en un instant.'
      ], { speaker: 'Grand Sage Hoël' });
      await ui.say(formatObtainItem(st.name, 'plume-arc', 1));
      if (!hadVol) await ui.say(formatObtainItem(st.name, 'sifflet-celeste', 1));
      await ui.say(formatObtainItem(st.name, 'great-ball', 5));
      await ui.say(st.badges[4]
        ? 'Monte sur le toit. Le novice te laissera passer. Quand tu auras réuni les huit badges du Nord, Ho-Oh répondra à l\'appel de la Plume !'
        : ['Ton Sifflet Céleste s\'éveillera dès que tu auras remporté le Badge Mirage.', 'Monte sur le toit. Le novice te laissera passer. Quand tu auras réuni les huit badges du Nord, Ho-Oh répondra à l\'appel de la Plume !'], { speaker: 'Grand Sage Hoël' });
      this.refreshGates();
      return;
    }
    await runNpcScript(this, name, n);
  }

    promptStarterChoice(C, picks, ORIG) {
    return new Promise((resolve) => {
      const typeLabel = TYPE_FR[C.type] || C.type;
      const wrap = el('div', 'starter-select-modal');
      wrap.innerHTML = `
        <div class="starter-select-box">
          <div class="st-header">
            <span class="st-title">Coffret ${esc(typeLabel)}</span>
            <span class="st-sub">Clique sur un Pokémon ou utilise les flèches + Entrée</span>
          </div>
          <div class="starter-cards">
            ${picks.map((p, idx) => {
              const S = SPECIES[p] || {};
              const tagsHtml = (S.t || []).map((t) => typeTag(t)).join('');
              return `
                <div class="st-card ${idx === 0 ? 'on' : ''}" data-idx="${idx}">
                  <span class="st-origin-badge">${esc(ORIG[idx] || '')}</span>
                  <div class="st-sprite-wrap">
                    <img class="st-sprite" src="${ASSETS.front(p)}" alt="${esc(S.n || '')}">
                  </div>
                  <div class="st-mon-name">${esc(S.n || '')}</div>
                  <div class="st-types">${tagsHtml}</div>
                  <button type="button" class="st-pick-btn">Choisir</button>
                </div>
              `;
            }).join('')}
          </div>
          <div class="st-footer">
            <button type="button" class="st-cancel-btn">Refermer le coffret ✕</button>
          </div>
        </div>
      `;
      this.ui.root.appendChild(wrap);

      let cur = 0;
      const cards = Array.from(wrap.querySelectorAll('.st-card'));
      const setCur = (idx, playCry = false) => {
        cur = (idx + picks.length) % picks.length;
        cards.forEach((c, k) => c.classList.toggle('on', k === cur));
        if (playCry && picks[cur]) {
          try { this.sound.cry(ASSETS.cry(picks[cur])); } catch (e) { warnDev('cry', e); }
        }
      };

      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        pop();
        wrap.remove();
        resolve(val);
      };

      cards.forEach((card) => {
        const idx = +card.dataset.idx;
        card.addEventListener('mouseenter', () => {
          if (cur !== idx) setCur(idx, true);
        });
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          this.sound.sfx('select');
          finish(idx);
        });
      });

      wrap.querySelector('.st-cancel-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sound.sfx('cancel');
        finish(null);
      });

      const pop = this.ui.input.push((k) => {
        if (k === 'left' || k === 'up') {
          this.sound.sfx('blip');
          setCur(cur - 1, true);
        } else if (k === 'right' || k === 'down') {
          this.sound.sfx('blip');
          setCur(cur + 1, true);
        } else if (k === 'a') {
          this.sound.sfx('select');
          finish(cur);
        } else if (k === 'b') {
          this.sound.sfx('cancel');
          finish(null);
        }
      });

      try { this.sound.cry(ASSETS.cry(picks[0])); } catch (e) { warnDev('cry', e); }
    });
  }

async chooseStarter(sp, cap) {
    const st = this.state, ui = this.ui;
    if (st.flags.starter) { await ui.say('C\'est un coffret vide.'); return; }
    // on n'ouvre pas les Poké Balls du professeur sans lui avoir parlé
    if (!st.flags.metProf) { await ui.say('Des Poké Balls attendent dans ce coffret... Mieux vaut d\'abord parler au Professeur Saule.'); return; }
    // la Poké Ball d'un type : deux ou trois partenaires au choix
    const C = STARTER_CHOICES[cap ?? Math.max(0, STARTERS.indexOf(sp))], picks = C.lines.map((l) => l[0]);
    const ORIG = picks.length === 3 ? ['Odyssée', 'Kanto', 'Johto'] : ['Kanto', 'Johto'];

    while (true) {
      const chosenIdx = await this.promptStarterChoice(C, picks, ORIG);
      if (chosenIdx == null || chosenIdx < 0 || chosenIdx >= picks.length) {
        ui.closeDialog();
        return;
      }
      sp = picks[chosenIdx];
      const S = SPECIES[sp];
      const typeStr = S.t.map((t) => TYPE_FR[t] || t).join('/');
      const ok = await ui.yesNo(`Tu veux ${S.n}, le Pokémon de type ${typeStr} ?`, { speaker: 'Prof. Saule' });
      if (!ok) continue;
      break;
    }
    const S = SPECIES[sp];
    const mon = createMon(sp, 5, { ot: st.name, met: 'Bourg-Aube', shiny: false });
    st.party.push(mon); st.flags.starter = sp; this.markCaught(sp);
    this.sound.sfx('caught');
    await ui.say(`${st.name} reçoit ${S.n} !`);
    if (await ui.yesNo(`Donner un surnom à ${S.n} ?`)) { const nick = await ui.nameEntry(`Surnom de ${S.n}`, S.n); if (nick && nick !== S.n) mon.nick = nick; }
    // le rival choisit le Pokémon qui a l'avantage
    const rs = RIVAL_TEAMS[sp][0];
    st.flags.rivalSp = sp;
    const rival = this.npcs.find((q) => q.id === 'rival-lab');
    if (rival) rival.dir = 'up';
    await ui.say(['Alors je prends celui-là !', `${SPECIES[rs].n} ! Il a une tête de gagnant, comme moi.`], { speaker: RIVAL_NAME });
    if (rival) rival.dir = 'left';
    await ui.say(['Hé, ' + st.name + ' ! On a nos Pokémon, alors...', 'On se fait un petit combat ? Allez !'], { speaker: RIVAL_NAME });
    const rMoves = SPECIES[rs].ls.filter(([l, id]) => l <= 4 && MOVES[id]?.t === 'normal').map(([, id]) => id);
    const rivalMon = createMon(rs, 4, { ot: RIVAL_NAME, iv: [8, 8, 8, 8, 8, 8], moves: rMoves.length ? rMoves.slice(0, 2) : SPECIES[rs].ls.filter(([l]) => l <= 1).map(([, id]) => id) });
    const res = await this.runBattle({ trainer: { cls: 'Rival', name: RIVAL_NAME, prize: 30, bs: 'theo', ai: 'normal', friendly: true, lose: 'Quoi ?! J\'aurais dû choisir l\'autre !' }, party: [rivalMon], music: 'rival', rival: true, noWhiteout: true });   // premier combat : à armes égales (même niveau, IA simple)
    for (const m of st.party) healFull(m);
    st.flags.rival1 = true;
    await ui.say(res === 'win' ? 'Pfff... Bon, c\'était juste un échauffement !' : 'Ha ha ! Je suis trop fort ! Mais t\'inquiète, tu t\'améliores déjà.', { speaker: RIVAL_NAME });
    await ui.say([res === 'win' ? 'Quel combat ! Tes Pokémon ont déjà l\'air de t\'adorer.' : 'Ne te décourage pas, ' + st.name + '. Ce n\'était que votre tout premier combat !', `${st.name}, prends aussi ceci.`], { speaker: 'Prof. Saule' });
    this.sound.sfx('item');
    st.flags.dex = true; st.bag['poke-ball'] = (st.bag['poke-ball'] || 0) + 5; st.bag.potion = (st.bag.potion || 0) + 2; this.give('town-map');
    await ui.say([`${st.name} reçoit le Pokédex, la Carte, 5 Poké Balls et 2 Potions !`, 'Le Pokédex enregistre chaque Pokémon que tu vois ou captures.', 'Quand tes Pokémon sont fatigués, reviens voir ta mère ou passe au Centre de soins.', 'La première Arène se trouve à Sylvebourg, au nord. Bonne route !'], { speaker: 'Prof. Saule' });
    await ui.say('Je file ! À plus, ' + st.name + ' !', { speaker: RIVAL_NAME });
    if (rival) { await this.npcWalk(rival, 'down', 2); this.npcs = this.npcs.filter((q) => q !== rival); this.view.removeActor('npc:rival-lab'); }
    this.save(true);
  }

  /** case libre où faire apparaître le rival : jusqu'à 4 cases dans la direction d'où il arrive, chemin dégagé */
  spawnAhead(dir, max = 4) { return spawnAhead(this, dir, max); }

  async trigger(name) { return trigger(this, name); }

  /** Cap des Étoiles : Odyssor apparaît (après le badge de Drakos), on peut tenter de le capturer */
  async odyssorEvent() { return odyssorEvent(this); }

  async ending() {
    const st = this.state, ui = this.ui;
    st.flags.champion = true;
    for (const mon of (st.party || [])) addMemory(mon, 'champion', 'Ligue Céleste');
    this.sound.play('victory');
    const B = this.rivalB();
    await ui.say([
      'Félicitations !',
      `${st.name}, tu es le nouveau Maître de la Ligue Céleste !`,
      'Quinze badges, du Nord jusqu\'à Ombreval : tu as relié toute la région d\'Odyssée, des îles jusqu\'à Métropole.',
      'Drakos m\'a fait passer un message, tu sais. « Le vieux Drakos attend sa revanche. »',
      st.flags.rivalB3 ? `Et ${B.name} m'a écrit aussi. ${B.il === 'il' ? 'Il' : 'Elle'} veut ouvrir une école de dresseurs à Fort-Écaille, ouverte à tous.` : 'Drakos a rouvert les ports de l\'archipel.',
      'Grâce à toi, les îles, le Nord et les Terres du Sud avancent enfin ensemble.',
      'Et sans toi, la nuit de la Team Éclipse recouvrirait encore la région. Lugia veille de nouveau sur les marées.',
      'Ton équipe et toi entrez au Panthéon des dresseurs.'
    ], { speaker: 'Célestine' });
    await ui.say([`Bravo, ${st.name}. Tu as tenu ta promesse.`, 'Mais la prochaine fois, c\'est moi qui serai Maître !'], { speaker: RIVAL_NAME });
    if (st.flags.rivalB4) await ui.say(['Félicitations. Je suis venu' + B.e + ' avec mon grand-père pour voir ça.', 'On se reverra sur les îles. Elles t\'attendront toujours.'], { speaker: B.name });
    if (!st.hof) st.hof = [];
    const entry = {
      id: st.hof.length + 1,
      date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: st.time || 0,
      title: st.hof.length === 0 ? 'Nouveau Maître' : `Sacre #${st.hof.length + 1}`,
      team: st.party.map((m) => ({
        sp: m.sp,
        nick: m.nick || null,
        lvl: m.lvl,
        shiny: !!m.shiny,
        shadow: !!m.shadow,
        g: m.g,
        moves: (m.moves || []).map((x) => ({ id: x.id, pp: x.pp })),
        stats: [...m.stats],
        ball: m.ball || 'poke-ball',
        ot: m.ot || st.name,
      })),
      dexCount: st.dex?.caught?.length || 0,
    };
    st.hof.push(entry);
    await hofScreen(this, entry);
    for (const m of st.party) healFull(m);
    this.save(true);
  }
}
