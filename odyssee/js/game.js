// odyssee/js/game.js — le jeu : déplacements sur la grille, PNJ, dresseurs, rencontres, capacités de terrain (Coupe,
// Surf, Éclate-Roc, Vol), menus, histoire (les quinze arènes et l'archipel des trois frères), sauvegarde
import { T, walkable, isGrassEnc, DIRS, OPP } from './world/tiles.js';
import { reprendre } from './core/reprise.js';
import { encAt } from './world/rencontres.js';
import { MEGAS_OF, MEGA_RING, LEGEND, STONE_FORM, revertMegas } from './core/mega.js';
import { MEGA_FORMS } from './core/mega.js';
import { createMon, monName, healFull, levelEvolution, itemEvolution, evolve, setUidBase, levelCap, ensureNature, apteCT } from './core/mon.js';
import { Battle } from './core/battle.js';
import { ITEMS, itemName, applyItem, canUseOn, useCandy, formatFindItem, formatObtainItem, itemPocketName } from './core/items.js';
import { SPECIES } from './data/species.js';
import { MOVES } from './data/moves.js';
import { SAUVAGE, R } from './data/remplacants.js';
import { STARTERS, STARTER_CHOICES, STARTER_TABLE, starterSlot, RIVAL_NAME, BADGES, LEADERS, FIELD, CARTE_VERSION } from './world/region.js';
import { migrerCarte } from './world/migration.js';
import { BattleView } from './ui/battleView.js';
import { Hud } from './ui/hud.js';
import { partyScreen, bagScreen, dexScreen, mapScreen, cardScreen, shopScreen, pcScreen, naturePcScreen, moveRelearnerScreen, optionsScreen, pokedexRegisterScene, TYPE_FR, questsScreen, trophiesScreen, showTrophyToast, hofScreen, pantheonScreen, friendsScreen } from './ui/screens.js';
import { getFriendsManager } from './net/friends.js';
import { recordPvpMatch, ensurePvpState, checkAllTrophies } from './core/trophies.js';
import { el, esc, wait } from './ui/ui.js';
import { ASSETS, loadImg } from './assets.js';
import { HPX, CHAR_ROWS } from './render/world3d.js';
import { saveCodeScreen } from './ui/screens.js';
import { encodeSave, saveSummary } from './core/savecode.js';
import { installSocial, talkToPeer } from './net/social.js';
import { storyTalk, storyTrigger, storyWin, lugiaBattle, placeLugia, purify, overlay } from './story.js';
import { syncJournal } from './core/questsData.js';
import { QUIZ } from './world/arenes.js';
import { souffle, stelesPleines, moitieDe } from './world/arene-sylve.js';
import { casinoScreen, bourseScreen, entretienPierre } from './ui/metropole.js';
import { arcadeScreen } from './ui/arcade.js';
import { apparenceScreen } from './ui/apparence.js';
import { preparerDomaine, frigo, architecte, recolter, allerDomaine, resident, arrivees } from './ui/domaine.js';
import { composer } from './render/tenue.js';
import { buildRivalParty, getRivalItems } from './world/rival.js';

/** météos qui comptent en combat (brume et cendres ne sont que du décor, comme dans les jeux 5G) */
const BATTLE_WEATHERS = ['rain', 'sun', 'sandstorm', 'hail'];

// v2 : nouvelle région (arènes dans un autre ordre, archipel, créatures originales) — les sauvegardes v1 ne sont pas reprises
const SAVE_KEY = 'odyssee-save-v2';
const SUIVEUR = 0.75;   // taille du Pokémon qui suit (1 = celle de son dessin)
export const WALK = 0.20, SURF = 0.11, VELO = 0.042;
export const RUN_SPEEDS = [
  { id: 'norm', label: 'Normale (1×)', dur: 0.100 },
  { id: 'fast', label: 'Rapide (1.7×)', dur: 0.068 },
  { id: 'turbo', label: 'Turbo (2.5×)', dur: 0.046 },
];
export const RUN = RUN_SPEEDS[1].dur;
const key = (x, y) => x + ',' + y;
// le rival prend le partenaire qui a l'avantage sur le tien (Plante → Feu, Feu → Eau, Eau → Plante), de la même
// lignée que le tien : l'original d'Odyssée, celui de Rouge / Bleu ou celui d'Or / Argent
const RIVAL_TEAMS = {};
for (let t = 0; t < 3; t++) for (let k = 0; k < 3; k++) RIVAL_TEAMS[STARTER_TABLE[t].lines[k][0]] = STARTER_TABLE[(t + 1) % 3].lines[k];
void R;
const GYM_HINTS = { bug: 'le Feu, le Vol et la Roche', rock: 'l\'Eau, la Plante, le Combat et le Sol', water: 'l\'Électrik et la Plante', electric: 'le Sol', grass: 'le Feu, la Glace, le Vol, le Poison et l\'Insecte', psychic: 'l\'Insecte et les Ténèbres', fire: 'l\'Eau, la Roche et le Sol', dragon: 'la Glace, le Dragon et la Fée', normal: 'le Combat', flying: 'l\'Électrik, la Glace et la Roche', poison: 'le Sol et le Psy', ground: 'l\'Eau, la Plante et la Glace', steel: 'le Feu, le Combat et le Sol', fairy: 'le Poison et l\'Acier', dark: 'le Combat, l\'Insecte et la Fée' };
// capacité de terrain donnée par chaque Champion après sa victoire
const GYM_GIFT = { 3: 'coupe', 4: 'surf', 5: 'eclate', 6: 'vol' };
// portrait affiché à côté de la boîte de dialogue 5G, selon qui parle
const FACES = {
  // Professeur & Rivaux
  'Prof. Saule': 'saule', 'Professeur Saule': 'saule', 'Saule': 'saule',
  [RIVAL_NAME]: 'theo', 'Théo': 'theo', 'Theo': 'theo', 'Rival': 'theo',
  // Famille & PNJ récurrents
  'Maman': 'maman', 'Mère de Théo': 'habitante', 'Infirmière': 'nurse',
  'Vendeur': 'vendeur', 'Garde': 'garde', 'Capitaine': 'capitaine', 'Capitaine Corentin': 'capitaine',
  'Architecte': 'topdresseur', 'Pierre': 'pierre', 'Croupier': 'croupier', 'Facteur': 'facteur',
  'Gardien du phare': 'scientifique', 'Ermite': 'montagnard', 'Styliste': 'topdresseuse',
  'Gardien du savoir': 'scientifique', 'Inspectrice Morvan': 'topdresseuse', 'Morvan': 'topdresseuse',
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
  'opaline': 'habitante', 'madame opaline': 'habitante', 'jules': 'insectomane', 'watt': 'scientifique', 'mlle watt': 'scientifique',
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
    this.autoRun = false;
    try { this.autoRun = localStorage.getItem('odyssee-autorun') === '1'; } catch (e) {}
    this.runSpeed = 1; // 0: Normale (1×), 1: Rapide (1.7×), 2: Turbo (2.5×)
    try {
      const rs = localStorage.getItem('odyssee-runspeed');
      if (rs != null) this.runSpeed = Math.max(0, Math.min(2, +rs));
    } catch (e) {}
    this.followOff = false;   // le Pokémon de tête suit le dresseur (option)
    try { this.followOff = localStorage.getItem('odyssee-suiveur') === '0'; } catch (e) {}
    this.hud = new Hud(this);
    this.session = null; // échange ou combat en cours avec un autre joueur
    installSocial(this);
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
      for (const w of words) {
        const wLow = w.toLowerCase();
        if (FACES[w]) { const p = visage(FACES[w]); if (p) return p; }
        if (TRAINER_NAME_TO_SPRITE[wLow]) { const p = visage(TRAINER_NAME_TO_SPRITE[wLow]); if (p) return p; }
        if (CLASS_TO_SPRITE[wLow]) { const p = visage(CLASS_TO_SPRITE[wLow]); if (p) return p; }
      }
      return visage(low);
    };
  }

  /* ================= sauvegarde ================= */
  static hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  newState(name, gender) {
    return {
      v: 2, name, gender, id: Math.floor(Math.random() * 65536), money: 3000, badges: Array(BADGES.length).fill(false), flags: {},
      party: [], box: [], bag: { potion: 1 }, dex: { seen: [], caught: [], seenCount: {} }, time: 0, visited: ['aube'], repel: 0,
      cleared: {}, surf: false, explored: [], journal: {},
      pvp: { totalWins: 0, totalLosses: 0, totalDraws: 0, currentStreak: 0, bestStreak: 0, players: {}, trophies: {} },
      lastCenter: { map: 'aube:maison', x: 4, y: 5, dir: 'up' }, ...this.world.start, carte: CARTE_VERSION,
    };
  }
  save(silent = false) {
    const s = this.state; const p = this.player;
    if (s && !silent) { try { this.checkTrophies(true); } catch (e) {} }
    s.map = this.mapObj.id; s.x = p.x; s.y = p.y; s.dir = p.dir; s.surf = !!p.surf;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); if (!silent) this.sound.sfx('save'); } catch (e) { return false; }
    this.onSaved?.(silent);
    return true;
  }
  load(from) {
    const s = from ? JSON.parse(JSON.stringify(from)) : JSON.parse(localStorage.getItem(SAVE_KEY));
    // sauvegarde incomplète (ancienne version, code tapé à la main) : les champs manquants reprennent leur valeur de départ
    s.party ||= []; s.box ||= []; s.bag ||= {}; s.flags ||= {}; s.badges ||= []; s.visited ||= ['aube']; s.time ||= 0;
    s.cleared ||= {}; s.explored ||= [];
    s.dex ||= { seen: [], caught: [], seenCount: {} };
    s.dex.seenCount ||= {};
    let maxUid = 0; for (const m of s.party.concat(s.box)) maxUid = Math.max(maxUid, m.uid || 0);
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
    // intérieur redessiné depuis (l'Arène de Sylvebourg, par exemple) : une partie arrêtée dans un mur reprend à l'entrée
    { const M0 = this.world.maps[state.map]; if (M0 && state.map !== 'monde' && !state.surf && M0.exitX != null && (!M0.in(state.x, state.y) || !walkable(M0.get(state.x, state.y)))) Object.assign(state, { x: M0.exitX, y: M0.exitY - 1, dir: 'up' }); }
    // carte qui n'existe plus, case devenue un mur, poche refermée : jamais de joueur bloqué (core/reprise.js)
    const repriseSure = repriseVille ? null : reprendre(this.world, state);
    this.state = state; this._seen = null;
    revertMegas(state.party); revertMegas(state.box);
    this.stepLock = false; this.stepGap = false;
    this.player = { x: state.x, y: state.y, dir: state.dir || 'down', move: null, step: 0, turnLock: 0, bumpT: 0, surf: !!state.surf };
    this.appliquerTenue();
    preparerDomaine(this);   // le terrain acheté grâce au frigo, avec tout ce qui y a été bâti
    this.setMap(state.map);
    this.view.setTimeOfDay(this.hour());
    // la météo change avec le temps, pas seulement en changeant de zone
    clearInterval(this._wxTimer);
    this._wxTimer = setInterval(() => { try { this.view?.setWeather(this.getMapWeather()); } catch (e) {} }, 30000);
    this.hud?.update(true);
    this.link?.hello();
    this.view.update(0, this.player.x, this.player.y); await this.view.solPret?.();   // le sol généré est prêt avant d'ouvrir l'écran
    await this.ui.fade(false, 400);
    if (!state.flags.intro) { state.flags.intro = true; this.busy = true; await this.ui.say(['Une douce lumière filtre à travers les rideaux...', `Aujourd'hui, ${state.name}, ton aventure commence !`, 'Le Prof. Saule t\'attend à son laboratoire, le grand bâtiment blanc au cœur du village.', 'Appuie sur H à tout moment pour revoir les touches.']); this.busy = false; }
    else if (repriseSure === 'carte' || repriseSure === 'poche') {
      this.busy = true;
      await this.ui.say(['La région a changé depuis ta dernière visite : l\'endroit où tu t\'étais arrêté n\'existe plus tel quel.', 'Tu reprends ton voyage en lieu sûr.']);
      this.busy = false; this.save(true);
    }
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
    if (this.strengthOn !== m.id) this.strengthOn = null;
    this.view.eclipse = this.eclipseOn();
    this.view.setMap(m);
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
    const a = v.actor('follower', {});
    a.mesh.scale.setScalar(SUIVEUR);   // un peu plus petit que le dresseur
    v.setFrame(a, 'poke:' + sp, f.dir, sf);
    const t = this.mapObj.get(Math.round(x), Math.round(y)), grass = isGrassEnc(t) && !f.move;
    v.place(a, x, y, hop, grass);
    v.cover(a, ...(isGrassEnc(t) && hop < 0.05 ? [Math.round(x), Math.round(y)] : [null]));
  }
  /** parler à son Pokémon */
  async talkFollower() {
    const m = this.state.party[0], name = monName(m), h = this.hour(), ui = this.ui;
    this.sound.cry(ASSETS.cry(m.sp));
    const lines = [
      `${name} a l'air content de marcher à tes côtés.`, `${name} renifle l'air. Il sent quelque chose d'intéressant...`,
      `${name} te regarde droit dans les yeux. Il a confiance en toi.`, `${name} sautille sur place !`,
      m.hp < m.stats[0] / 2 ? `${name} a l'air fatigué... Un petit tour au Centre de soins ?` : `${name} déborde d'énergie !`,
      h >= 20 || h < 6 ? `${name} bâille. Il commence à se faire tard.` : `${name} profite du soleil.`,
      this.mapObj.outdoor ? `${name} contemple le paysage.` : `${name} explore la pièce du regard.`,
    ];
    if (this.fol) this.fol.dir = OPP[this.player.dir];
    await ui.say(lines[Math.floor(Math.random() * lines.length)]);
  }
  /** PNJ tel qu'il se tient sur la carte (un membre du Conseil 4 battu s'est écarté) */
  npcState(n) {
    const beaten = n.beatenPos && this.state.flags['T:' + n.id], x = beaten ? n.beatenPos[0] : n.x, y = beaten ? n.beatenPos[1] : n.y;
    return { def: n, id: n.id, x, y, dir: n.dir || 'down', sprite: n.sprite, home: [x, y], timer: 1 + Math.random() * 3, move: null, step: 0 };
  }
  npcVisible(n) {
    const f = this.state.flags;
    if (n.when && !n.when(f, this)) return false;   // PNJ de quête : présent selon l'avancée
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

  /** la carte se découvre en marchant : blocs de 8 × 8 cases autour du joueur (et toute ville visitée) */
  explore() {
    if (this.mapObj.id !== 'monde') return;
    const st = this.state, W = this.mapObj, B = 8, cw = Math.ceil(W.w / B), p = this.player;
    this._seen ||= new Set(st.explored);
    const add = (i) => { if (!this._seen.has(i)) { this._seen.add(i); st.explored.push(i); } };
    const R = 12;   // on voit un peu au-delà du chemin
    for (let y = Math.floor((p.y - R) / B); y <= Math.floor((p.y + R) / B); y++) for (let x = Math.floor((p.x - R) / B); x <= Math.floor((p.x + R) / B); x++) if (x >= 0 && y >= 0 && x < cw && y * B < W.h) add(y * cw + x);
    const t = this.zone?.town && Object.values(this.world.towns).find((q) => q.id === this.zone.town);
    if (t) for (let y = Math.floor(t.y / B); y <= Math.floor((t.y + t.h) / B); y++) for (let x = Math.floor(t.x / B); x <= Math.floor((t.x + t.w) / B); x++) add(y * cw + x);
  }
  updateZone() {
    const m = this.mapObj, p = this.player;
    const z = m.outdoor ? m.zoneAt(p.x, p.y) : (m.zones.length && m.zoneAt(p.x, p.y)) || { name: m.name, music: m.music };
    const name = z?.name || m.name;
    // bandeau du lieu : en extérieur et dans les grottes (pas en sortant d'une maison)
    if ((m.outdoor || m.floor === 'cave') && name !== this.zoneName) { this.zoneName = name; this.ui.banner(name); }
    if (z?.town && !this.state.visited.includes(z.town)) this.state.visited.push(z.town);
    this.zone = z; this.explore();
    this.view.ombreCible = (m.outdoor && z?.ombre) || 1;   // sous-bois : l'image s'assombrit doucement
    if (!this.musicLock) this.sound.play(p.surf && m.outdoor ? 'route2' : (z && z.music) || m.music);
    this.zone = z;
    try { this.view?.setWeather(this.getMapWeather()); } catch (e) {}
  }

  async warp(to, sfx = 'door') {
    this.busy = true;
    this.sound.sfx(sfx);
    await this.ui.doorTransition(true, 240);
    const from = this.mapObj.id;
    if (this.mapObj.id === 'monde' && to.map !== 'monde') this.state.lastOutdoor = { x: this.player.x, y: this.player.y + 1, map: 'monde' };
    this.player.x = to.x; this.player.y = to.y; this.player.dir = to.dir || this.player.dir; this.player.move = null; this.player.surf = false;
    this.setMap(to.map);
    this.view.update(0, this.player.x, this.player.y);
    this.save(true);
    await this.view.solPret?.();   // l'écran se rouvre sur le sol généré, jamais sur l'ancien
    await this.ui.doorTransition(false, 240);
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
  async reveilBetes() {
    const st = this.state, m = this.mapObj, v = this.view, ids = m.betes.map(([sp]) => 'betes:' + sp);
    st.flags.beasts = true;
    const imgs = await Promise.all(m.betes.map(([sp]) => loadImg(ASSETS.front(sp)).catch(() => null)));
    if (this.mapObj !== m) return;
    const acteurs = m.betes.map(([sp, x, y], i) => { if (!imgs[i]) return null; const a = v.imageActor(ids[i], imgs[i], 0.5); v.place(a, x, y - 0.1); return a; });
    await this.ui.say(['Au fond du sous-sol, trois grandes créatures se tiennent immobiles dans la cendre, les yeux clos...', 'Elles respirent lentement, comme si elles dormaient depuis très longtemps.']);
    this.sound.sfx('bang'); v.shake = 0.3;
    this.sound.cry(ASSETS.cry(m.betes[1]?.[0] ?? m.betes[0][0]));
    await this.ui.say('Les trois créatures ouvrent les yeux et se dressent d\'un bond !');
    // chacune file à son tour vers l'échelle, en sautant, puis s'évanouit
    const [ex, ey] = m.betesSortie || [2, 3];
    for (let i = 0; i < m.betes.length; i++) {
      const a = acteurs[i]; if (!a) continue;
      const [, x0, y0] = m.betes[i], t0 = performance.now(), dur = 520;
      for (let t = 0; t < 1; t = (performance.now() - t0) / dur) { v.place(a, x0 + (ex - x0) * t, y0 - 0.1 + (ey - y0) * t, Math.sin(t * Math.PI) * 0.8); await wait(16); }
      v.removeActor(ids[i]);
    }
    await this.ui.flash(2, '#ffffff', 80);
    await this.ui.say(['Un éclair jaune... une flamme... un souffle cristallin...', 'Raikou, Entei et Suicune se sont enfuis de la tour et dispersés dans les îles.']);
  }

  /* ================= boucle ================= */
  tick(dt) {
    const st = this.state; if (!st) return;
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
    if (!this.figer) for (const n of this.npcs) this.npcTick(n, dt);   // figés dans l'éditeur de carte
    this.peersTick?.(dt);
    // la carte n'est pas redessinée sous un combat ou un écran plein cadre
    if (this.bv.alive || this.ui.root.querySelector('.screen')) { this.drawTags?.(false); return; }
    this.hud?.update();
    this.draw(dt);
  }

  draw(dt) {
    const p = this.player, v = this.view;
    let px = p.x, py = p.y, hop = 0, stepFrame = 0;
    if (p.move) {
      const u = Math.min(1, p.move.t);
      px = p.move.fx + (p.move.tx - p.move.fx) * u; py = p.move.fy + (p.move.ty - p.move.fy) * u;
      if (p.move.jump) hop = Math.sin(u * Math.PI) * 0.55;
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
      v.setFrame(na, n.sprite, n.dir, sf); v.place(na, nx, ny, 0, isGrassEnc(this.mapObj.get(n.x, n.y)) && !n.move);
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
    const p = this.player, m = this.mapObj, [dx, dy] = DIRS[d];
    p.dir = d;
    const tx = p.x + dx, ty = p.y + dy, t = m.get(tx, ty);
    // sortie par le tapis
    if (m.get(p.x, p.y) === T.MAT && d === 'down') {
      const w = m.warpAt(p.x, p.y);
      // arène : on n'en ressort pas avant d'avoir affronté le Champion (une défaite ramène au Centre de soins)
      if (w && !this.libre && m.gymLock != null && !this.state.badges[m.gymLock] && this.state.flags['IN:' + m.id]) { this.gymLocked(w); return; }
      if (w) { this.warp(w, 'exit'); return; }
    }
    const isShift = this.input.isDown('run');
    const isRunning = this.autoRun || isShift;
    const isTurbo = (this.autoRun && isShift) || (this.runSpeed === 2 && isRunning);
    // en surf : on glisse sur l'eau, et on descend sur la berge
    if (p.surf) {
      if (m.in(tx, ty) && t === T.WATER && !this.occupied(tx, ty)) { p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: SURF }; p.walking = true; return; }
      if (m.in(tx, ty) && walkable(t) && t !== T.DOOR && t !== T.BRIDGE && !this.occupied(tx, ty) && m.height(tx, ty) === m.height(p.x, p.y)) { p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: 0.25, jump: true, land: true }; p.walking = true; this.sound.sfx('ledge'); return; }
      p.walking = false; if (p.bumpT <= 0) { this.sound.sfx('bump'); p.bumpT = 0.3; } return;
    }
    // Force : pousser un rocher
    if (t === T.BOULDER && !m.bloc && (this.strengthOn === m.id || m.pushFree)) {
      const bx = tx + dx, by = ty + dy, bt = m.get(bx, by);
      if (walkable(bt) && ![T.DOOR, T.MAT, T.CAVEDOOR, T.STAIRS].includes(bt) && !this.occupied(bx, by) && !m.warpAt(bx, by)) {
        this.setTile(tx, ty, m.outdoor ? T.GRASS : T.CAVE); this.setTile(bx, by, T.BOULDER);
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
    const p = this.player, m = this.mapObj, t = m.get(p.x, p.y);
    if (mv.jump) this.view.shake = 0.06;
    // arènes à énigmes : glace ou sable qui glisse, flèches et souffles qui poussent, dalles, téléporteurs
    const mo = m.objectAt(p.x, p.y);
    if (!mv.slid && (mo?.type === 'glace' || mo?.type === 'fleche')) { this.busy = true; try { await this.glisse(mo.type === 'fleche' ? mo.dir : p.dir); } finally { this.busy = false; } return this.onStep({ slid: true }); }
    if (mo?.type === 'dalle') this.dalle(mo);
    if (mo?.type === 'souffle' && !mv.slid) { this.busy = true; try { await this.souffle(mo); } finally { this.busy = false; } }
    if (mo?.type === 'tp' && !mv.slid) { this.busy = true; try { await this.teleporte(mo); } finally { this.busy = false; } return this.onStep({ slid: true }); }
    if (isGrassEnc(t)) this.view.rustle(p.x, p.y);
    const w = m.warpAt(p.x, p.y);
    if (w && (t === T.DOOR || t === T.CAVEDOOR || w.step)) {
      if (w.need && !this.state.bag[w.need]) {
        this.busy = true;
        await this.ui.say(['Une force mystérieuse bloque l\'entrée...', 'Il faudrait un objet lié à ce lieu pour l\'ouvrir.']);
        await this.playerWalk('down', 1); this.busy = false; return;
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
    if (p.surf && t === T.WATER && !this.noEnc) { const sea = m.zoneAt(p.x, p.y), enc = sea?.surfEnc || sea?.enc || m.surfEnc; if (enc && Math.random() < 0.05) await this.wildBattle(enc); return; }
    if (enc && (isGrassEnc(t) || (!m.outdoor && t === T.CAVE))) {
      const rate = isGrassEnc(t) ? (t === T.DARKTALL ? 0.12 : 0.1) : 0.065;
      if (Math.random() < rate) await this.wildBattle(enc);
    }
  }

  /** glisse sur la glace (ou le sable des dunes) jusqu'à un obstacle ; les flèches changent la direction */
  async glisse(dir) {
    const p = this.player, m = this.mapObj;
    for (let guard = 0; guard < 300; guard++) {
      const o = m.objectAt(p.x, p.y);
      if (o?.type === 'fleche') dir = o.dir; else if (o?.type !== 'glace') break;
      const [dx, dy] = DIRS[dir], tx = p.x + dx, ty = p.y + dy;
      if (!walkable(m.get(tx, ty)) || this.occupied(tx, ty)) break;
      p.dir = dir; p.walking = o?.type === 'fleche';
      p.move = { fx: p.x, fy: p.y, tx, ty, t: 0, dur: 0.1, scripted: true }; while (p.move) await wait(16);
    }
    p.walking = false;
  }
  /** dalle : lève les barrières d'une couleur et baisse celles de l'autre (l'état est gardé avec la carte) */
  dalle(o) {
    const m = this.mapObj, st = this.state, k = 'B:' + m.id, up = o.g;
    if (st.flags[k] === up) return;
    st.flags[k] = up; this.sound.sfx('select'); this.view.shake = 0.05;
    for (const [x, y, g] of m.barriers || []) { const raise = g === up; if (this.player.x === x && this.player.y === y) continue; this.setTile(x, y, raise ? (g === 'r' ? T.BARRIER_R : T.BARRIER_B) : T.FLOOR); }
  }
  /* ---------------- la Grande Serre (Arène de Sylvebourg, world/arene-sylve.js) ---------------- */
  /** dalle-interrupteur : la soufflerie reliée souffle ; le premier bloc de pollen dans son axe glisse jusqu'au premier
   *  obstacle, ou tombe dans la stèle-alvéole qu'il croise ; les deux stèles pleines ouvrent le portail du dôme */
  async souffle(o) {
    const m = this.mapObj, s = m.serre?.souffleries[o.i]; if (!s) return;
    this.sound.sfx('select'); this.view.shake = 0.04;
    const r = souffle(m, s, (x, y) => this.occupied(x, y) || (this.player.x === x && this.player.y === y));
    if (!r) { await this.ui.say('Fffffff... La soufflerie tourne, mais son souffle ne pousse rien.', { auto: 1300 }); return; }
    let [x, y] = r.de;
    for (const [nx, ny] of r.chemin) {
      this.setTile(x, y, T.FLOOR); this.setTile(nx, ny, T.BOULDER); [x, y] = [nx, ny];
      await wait(55);
    }
    this.sound.sfx('ledge'); this.view.shake = 0.06;
    if (!r.stele) return;
    await wait(150); this.sound.sfx('item'); this.view.shake = 0.12;
    await this.ui.say(`Le bloc de pollen tombe dans l'alvéole... La stèle de ${r.stele.cote} s'illumine !`);
    if (stelesPleines(m) && m.serre.portail.some(([px, py]) => m.get(px, py) !== T.FLOOR)) {
      for (const [px, py] of m.serre.portail) this.setTile(px, py, T.FLOOR);
      this.sound.sfx('door'); this.view.shake = 0.2;
      await this.ui.say(['Un long froissement de feuilles parcourt la serre...', 'Les lianes du portail du dôme se sont écartées !']);
    }
    this.save(true);
  }
  /** remet en place les blocs d'une demi-serre (ou de toute la serre) : les cases changées reprennent leur état d'origine */
  remiseSerre(m, moitie = null) {
    const t = this.state.tiles?.[m.id]; if (!t) return 0;
    const portail = new Set((m.serre?.portail || []).map(([x, y]) => x + ',' + y));
    let n = 0;
    for (const k of Object.keys(t)) {
      const [x, y] = k.split(',').map(Number);
      if (portail.has(k) || (moitie && moitieDe(x) !== moitie)) continue;
      const v0 = m._orig?.get(k); delete t[k]; n++;
      if (v0 != null) { m.set(x, y, v0); m._orig.delete(k); }
      if (m === this.mapObj) this.view.rebuildAt(x, y);
    }
    return n;
  }
  /** pupitre près d'une porte de la serre : remettre les blocs de cette demi-serre en place */
  async pupitreSerre(moitie) {
    const m = this.mapObj, ui = this.ui, cote = moitie === 'g' ? 'gauche' : 'droite';
    if (stelesPleines(m)) { await ui.say('Pupitre de la serre : « Les deux stèles sont allumées. Le dôme vous attend ! »'); return; }
    const pleine = (m.serre?.steles || []).find((s) => moitieDe(s.x) === moitie && m.get(s.x, s.y) === T.BOULDER);
    if (pleine) { await ui.say(`Pupitre de la serre : « La stèle de ${cote} est déjà allumée. Rien à remettre en place de ce côté. »`); return; }
    if (!(await ui.yesNo(`Pupitre de la serre : « Remettre les blocs de pollen de la demi-serre de ${cote} à leur place ? »`))) return;
    const n = this.remiseSerre(m, moitie);
    this.sound.sfx('door'); this.view.shake = 0.08;
    await ui.say(n ? 'Les souffleries ronronnent en sens inverse... Les blocs de pollen sont revenus à leur place.' : 'Les blocs de pollen sont déjà à leur place.');
    this.save(true);
  }
  /** téléporteur : on réapparaît sur l'autre dalle */
  async teleporte(o) {
    const p = this.player;
    this.sound.sfx('exit');
    await this.ui.fade(true, 140);
    p.x = o.to[0]; p.y = o.to[1]; p.dir = o.dir || p.dir; p.move = null;
    this.view.update(0, p.x, p.y); this.resetFollower?.();
    await this.view.solPret?.();
    await this.ui.fade(false, 140);
  }
  /** gardien du savoir (arène Feu) : une bonne réponse et il s'écarte ; une mauvaise, et il faut le battre */
  async savoir(n) {
    const ui = this.ui, q = QUIZ[(n.def.quiz || 0) % QUIZ.length], sp = { speaker: 'Gardien du savoir' };
    await ui.say('Halte ! Seuls ceux qui connaissent le feu passent. Réponds à ma question.', { ...sp, keep: true });
    const k = await ui.list({ title: q.q, items: q.choix.map((label) => ({ label })), cls: 'shop quiz', cancel: null });
    if (k !== q.bonne) {
      this.sound.sfx('bump'); await ui.say(`Faux ! C'était « ${q.choix[q.bonne]} ». Prouve ta valeur au combat, alors !`, sp);
      const lvl = Math.max(20, this.levelCap() - 4), team = [[58, lvl], [126, lvl + 1]];
      const res = await this.api().fight({ cls: 'Gardien', name: 'du savoir', team, ow: 'scientifique', bs: 'scientifique', prize: 30, lose: 'Bien joué. Tu peux passer.' });
      if (res !== 'win') return;
    } else { this.sound.sfx('select'); await ui.say('Exact ! Passe, dresseur.', sp); }
    this.state.flags['QZ:' + n.id] = true; this.refreshNpcs();
  }
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
    await ui.say([`Yo, futur Maître ! Bienvenue dans l'Arène de ${L.name} !`, `${L.name} utilise des créatures de type ${TYPE_FR[L.type]}. Mise sur ${GYM_HINTS[L.type]} !`,
      'Mais attention : une fois le défi lancé, tu affrontes l\'arène d\'une traite.', 'Si tu ressors avant d\'avoir battu le Champion, il faudra tout recommencer depuis le début.'], { speaker: 'Guide' });
    if (await ui.yesNo('Es-tu prêt à relever le défi ?')) {
      st.flags['IN:' + m.id] = true; this.sound.sfx('door');
      await ui.say(['Voilà l\'esprit ! Le défi commence.', 'Bonne chance !'], { speaker: 'Guide' });
      return;
    }
    await ui.say(['Pas de souci. Soigne ton équipe, remplis ton sac…', 'Et reviens quand tu seras prêt !'], { speaker: 'Guide' });
    const w = m.exitX != null ? m.warpAt(m.exitX, m.exitY) : null;
    if (w) await this.warp(w, 'exit');
  }
  /** l'arène est fermée derrière nous : le guide le rappelle */
  /** sortir d'une arène en plein défi : permis, mais tous les dresseurs de l'arène sont à rebattre */
  async gymLocked(w) {
    this.busy = true;
    const m = this.mapObj, st = this.state;
    const ok = await this.ui.yesNo('Le guide : « Si tu sors maintenant, ton défi s\'arrête là : il faudra recommencer l\'arène depuis le début. Tu veux sortir ? »');
    if (!ok) { this.busy = false; return; }
    // les dresseurs de l'arène (pas le Champion) reprennent leur place et redeviennent à battre
    for (const k of Object.keys(st.flags)) if (k.startsWith('T:' + m.id + ':') && !k.endsWith(':leader')) delete st.flags[k];
    st.flags['IN:' + m.id] = false;
    if (m.serre) { delete st.tiles?.[m.id]; this.applyTiles(m); }   // la Grande Serre repart de zéro
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
      if (Math.abs(tx - n.home[0]) <= 2 && Math.abs(ty - n.home[1]) <= 2 && walkable(this.mapObj.get(tx, ty)) && this.mapObj.canStep(n.x, n.y, tx, ty) && !this.occupied(tx, ty, n) && this.mapObj.get(tx, ty) !== T.DOOR && this.mapObj.get(tx, ty) !== T.MAT) {
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
  toggleAutoRun() {
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
    try {
      localStorage.setItem('odyssee-autorun', this.autoRun ? '1' : '0');
      localStorage.setItem('odyssee-runspeed', this.runSpeed);
    } catch (e) {}
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
    try { localStorage.setItem('odyssee-runspeed', this.runSpeed); } catch (e) {}
    this.hud?.update(true);
    this.ui.updateRunKeyHint?.(this.autoRun, this.runSpeed);
  }
  async onKey(k) {
    if (!this.state) return;
    if (k === 'hud') { this.hud?.toggle(); return; }
    if (k === 'autorun') { if (!this.busy && !this.bv.alive) this.toggleAutoRun(); return; }
    if (this.busy || !this.state || this.player.move) return;
    if (k === 'a') await this.interact();
    else if (k === 'b' || k === 'menu') await this.startMenu();
    else if (k === 'map') { this.busy = true; try { await mapScreen(this); } finally { this.busy = false; } }
    else if (k === 'velo') { this.busy = true; try { await this.toggleVelo(); } finally { this.busy = false; } }
    else if (k === 'quests') { this.busy = true; try { await questsScreen(this); } finally { this.busy = false; } }
    else if (k === 'trophies') { this.busy = true; try { await trophiesScreen(this); } finally { this.busy = false; } }
    else if (k === 'friends') { this.busy = true; try { await friendsScreen(this); } finally { this.busy = false; } }
    else if (k === 'hud') this.hud?.toggle();
  }
  async interact() {
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
        else if (t === T.WATER && (m.outdoor || m.surf) && !p.surf) await this.trySurf(fx, fy);
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
        else {
          await this.ui.say(d.trainer.after || 'Quel combat !', {
            speaker: d.trainer.cls ? `${d.trainer.cls} ${d.trainer.name}` : d.trainer.name,
            face: d.trainer.bs || d.trainer.ow || n.sprite
          });
          if (d.leader != null) await this.retourEntreeArene();
        }
      }
      else if (d.role === 'nurse') await this.nurse();
      else if (d.role === 'shop') await shopScreen(this, d.stock);
      else if (d.role === 'relearner') await moveRelearnerScreen(this);
      else if (d.talk) await d.talk(this.api(), n);
      else if (d.script) await this.script(d.script, n);
      else if (d.text) await this.ui.say(d.text, {
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
  spawnLegends() {
    for (const L of this.legends || []) this.view.removeActor('legend:' + L.id);
    const st = this.state, mapNow = this.mapObj;
    this.legends = (this.world.legends || []).filter((L) => L.map === mapNow.id && st.flags['L:' + L.id] !== 'caught' && this.legendReady(L)).map((L) => ({ ...L }));
    for (const L of this.legends) loadImg(ASSETS.front(L.sp)).then((img) => {
      if (!img || this.mapObj !== mapNow || !this.legends.includes(L)) return;
      const a = this.view.imageActor('legend:' + L.id, img, 0.5); this.view.place(a, L.x, L.y - 0.1);
    });
  }
  legendReady(L) {
    const f = this.state.flags, b = this.badgeCount();
    if (typeof L.cond === 'function') return !!L.cond(f, this);
    switch (L.cond) {
      case 'celebi': return !!f.celebiCalled;
      case 'pylons': return !!f.pylons;
      case 'mew': return !!(f['S:1'] && f['S:2'] && f['S:3']) && b >= 4;
      case 'plume': return !!f.plume;
      case 'beasts': return !!f.beasts && b >= 5;
      default: return true;
    }
  }
  async legendBattle(L) {
    const st = this.state, ui = this.ui, name = SPECIES[L.sp].n;
    this.sound.cry(ASSETS.cry(L.sp));
    await ui.say(L.intro);
    if (!(await ui.yesNo(`${name} te fixe du regard.\nL'affronter ?`))) return;
    if (!st.flags['L:' + L.id]) st.flags['L:' + L.id] = 'met';
    const res = await this.wildBattle([[L.sp, L.lvl, L.lvl, 1]], { fixed: true, music: 'legend' });
    if (L.id === 'hooh') st.flags.hoohDone = true;
    if (L.after) await L.after(this.api(), res);
    if (res === 'caught' || res === 'win') {
      this.legends = this.legends.filter((q) => q !== L); this.view.removeActor('legend:' + L.id);
      if (res === 'caught') st.flags['L:' + L.id] = 'caught';
      else await ui.say([`${name} s'envole au loin...`, 'Il reviendra peut-être plus tard.']);
    }
    this.save(true);
  }
  /** Île Orageuse : les trois relais à rallumer pour ouvrir le Pic Tonnerre */
  async pylon(o) {
    const f = this.state.flags, ui = this.ui;
    if (f['P:' + o.n]) { await ui.say(`Le relais n°${o.n} ronronne doucement.`); return; }
    if (!f.orageQuest) { await ui.say(`Une borne électrique éteinte. Une plaque indique : « Relais n°${o.n} ».`); return; }
    if (!(await ui.yesNo(`Relais n°${o.n}.\nRemettre le courant ?`))) return;
    f['P:' + o.n] = true; this.sound.sfx('pc'); await ui.flash(1, '#fff6a0', 70);
    const n = [1, 2, 3].filter((k) => f['P:' + k]).length;
    await ui.say(`Le relais n°${o.n} se rallume ! (${n}/3)`);
    if (n === 3) {
      f.pylons = true; this.refreshGates(); this.spawnLegends();
      this.sound.sfx('bang'); this.view.shake = 0.2;
      await ui.say(['Au loin, le Pic Tonnerre se couvre d\'éclairs...', 'Le technicien libère le sentier du Pic !']);
    }
  }
  /** Côte des Ruines : trois stèles à lire pour réveiller l'autel de Mew */
  async stele(o) {
    const f = this.state.flags;
    await this.ui.say(o.text);
    if (f['S:' + o.n]) return;
    f['S:' + o.n] = true;
    if (f['S:1'] && f['S:2'] && f['S:3']) {
      if (this.badgeCount() >= 4) { this.spawnLegends(); await this.ui.say('Une lueur rose danse au loin, du côté de l\'autel...'); }
      else await this.ui.say('Les trois stèles sont lues... mais l\'autel reste silencieux. Il faudrait plus d\'expérience (4 badges).');
    }
  }
  /** Bois Murmure : l'autel de Celebi */
  async shrine() {
    const st = this.state, ui = this.ui;
    if (st.flags['L:celebi'] === 'caught') { await ui.say('Un vieil autel de bois. Les feuilles autour bruissent doucement.'); return; }
    if (st.flags.celebiCalled) { await ui.say('L\'autel est tiède. Celebi ne doit pas être loin...'); return; }
    if (!st.bag['gs-ball']) { await ui.say(['Un vieil autel de bois, couvert de mousse.', 'Il y a un creux au centre, de la taille d\'une capsule...']); return; }
    if (!(await ui.yesNo('Un vieil autel de bois, couvert de mousse.\nPoser la Balle GS dans le creux ?'))) return;
    this.take('gs-ball'); st.flags.celebiCalled = true;
    await ui.say(['Tu poses la Balle GS sur l\'autel...', '... ... ...', 'La Balle GS s\'ouvre dans un éclat vert !']);
    await ui.flash(3, '#c8ffb0', 80);
    this.spawnLegends();
    const L = this.legends.find((q) => q.id === 'celebi');
    if (L) await this.legendBattle(L);
  }
  /** bateau de l'Embarcadère : chaque île s'ouvre avec un nombre de badges */
  async ferry(n) {
    const st = this.state, ui = this.ui, docks = this.world.docks, here = n.def.dock, sp = 'Capitaine';
    // sans permis bateau, on ne monte pas à bord : l'examen se passe à la Capitainerie de Port-Azur
    if (!st.bag['permis-bateau']) {
      await ui.say(['Ahoy, moussaillon ! Tu veux prendre la mer ?', 'Pas sans ton permis bateau ! La Capitainerie de Port-Azur fait passer l\'examen.', 'Reviens avec, et je te fais embarquer.'], { speaker: sp });
      if (!st.flags['Q:permis']) { st.flags['Q:permis'] = 1; this.refreshNpcs(); }
      return;
    }
    if (!st.flags.passe) {
      st.flags.passe = true; this.give('ferry-ticket'); this.sound.sfx('item');
      await ui.say(['Ahoy, moussaillon ! Mon bateau fait le tour des îles de l\'Est.', 'L\'Île Orageuse pour ceux qui ont 2 badges, l\'Île de la Grue avec 3, et l\'Île Givrée, tout au nord, avec 5.', 'Pour l\'archipel des trois frères, au-delà des tourbillons, il faut 5 badges : Drakos n\'aime pas les débutants.', `Tiens, voici ton Passe Marin.`], { speaker: sp });
    }
    const opts = Object.entries(docks).filter(([k, d]) => k !== here && (!d.show || d.show(st.flags))), b = this.badgeCount();
    await ui.say('Où veux-tu aller ?', { keep: true, speaker: sp });
    const r = await ui.list({ title: 'Destination', items: opts.map(([, d]) => ({ label: d.name, right: b >= d.badges ? '' : `${d.badges} badges`, disabled: b < d.badges })).concat([{ label: 'Rester ici' }]), cls: 'shop', cancel: opts.length });
    if (r < 0 || r >= opts.length) { await ui.say('Bon vent, moussaillon !', { speaker: sp }); return; }
    const d = opts[r][1];
    await ui.say([`Cap sur ${d.name} !`, 'Le bateau largue les amarres...'], { speaker: sp });
    await this.warp({ map: d.map, x: d.x, y: d.y, dir: d.dir }, 'door');
    this.ui.banner(d.name);
  }

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
    const pt = this.view.tileToScreen ? this.view.tileToScreen(x, y, 0) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
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
    if (!(await this.ui.yesNo(`${look}\nUtiliser ${F.name} ?`))) return;
    const mon = this.fieldUser();
    this.sound.cry(ASSETS.cry(mon.sp));
    if (k === 'coupe') {
      await this.ui.say(`${st.name} utilise le Sécateur Sylvestre pour trancher le buisson !`, { auto: 600 });
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
    if (!this.hasField('force')) { await this.ui.say(look); return; }
    if (!this.canField('force')) { await this.ui.say([look, `Il faut le ${BADGES[FIELD.force.badge - 1].name} pour utiliser Force hors combat.`]); return; }
    if (this.strengthOn === this.mapObj.id) { await this.ui.say('Force est active : marche contre le rocher pour le pousser.'); return; }
    if (!(await this.ui.yesNo(`${look}\nUtiliser Force ?`))) return;
    const mon = this.fieldUser();
    this.strengthOn = this.mapObj.id; this.sound.cry(ASSETS.cry(mon.sp)); this.sound.sfx('ledge');
    await this.ui.say(`${monName(mon)} utilise Force !\nIl peut désormais pousser les rochers.`);
  }
<<<<<<< ours
  async trySurf(x, y) {
=======
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
      await this.ui.say('Toutes tes créatures sont K.O. ! Mieux vaut se reposer.');
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

    const bite = Math.random() < 0.85;
    if (!bite) {
      this.sound.sfx('bump');
      await this.ui.say('Pas même une touche... Les créatures aquatiques ne mordent pas pour l\'instant.');
      return;
    }

    this.player.bang = true;
    this.sound.sfx('fanfare');
    await this.ui.say('Oh ! Ça mord ! Une prise vigoureuse au bout de la ligne !');
    this.player.bang = false;

    await this.wildBattle(pool, { fishing: true });
  }

  async trySurf(x, y, skipConfirm = false) {
>>>>>>> theirs
    const st = this.state;
    if (!this.canField('surf')) { await this.ui.say(this.hasField('surf') ? ['L\'eau est d\'un bleu profond...', 'Il faut le Badge Mirage pour surfer.'] : 'L\'eau est d\'un bleu profond...'); return; }
    if (!st.party.some((m) => m.hp > 0)) return;
    if (!(await this.ui.yesNo('L\'eau est d\'un bleu profond...\nUtiliser le Harnais Flottant ?'))) return;
    await this.ui.say(`${st.name} déploie le Harnais Flottant et s'élance sur l'eau !`, { auto: 600 });
    const p = this.player;
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
    await this.ui.say(`${st.name} souffle dans le Sifflet Céleste !\nUne mélodie dorée résonne et vous emporte dans les cieux.`, { auto: 700 });
    await this.animateFlyAscent();
    await this.ui.doorTransition(true, 280);
    const [x, y] = t.centerDoor || t.homeDoor;
    this.player.x = x; this.player.y = y + 1; this.player.dir = 'down'; this.player.move = null; this.player.surf = false;
    this.setMap('monde');
    this.view.update(0, this.player.x, this.player.y);
    this.save(true);
    await this.ui.doorTransition(false, 250);
    await this.animateFlyDescent();
    await this.ui.say(`Vous atterrissez en douceur devant le Centre de soins de ${t.name}.`, { auto: 650 });
    return true;
  }

  /* ================= menu principal ================= */
  async startMenu() {
    // un écran qui échoue ne laisse jamais le joueur figé (busy resterait vrai)
    try { await this.menuPrincipal(); } finally { this.busy = false; }
  }
  async menuPrincipal() {
    this.busy = true;
    const st = this.state;
    const opts = [];
    if (st.flags.dex) opts.push(['Pokédex', 'dex']);
    if (st.party.length) opts.push(['Équipe', 'party']);
    if (st.party.length) opts.push(['Boîtes PC', 'pc']);
    opts.push(['Sac', 'bag']);
    if (this.canField('vol')) opts.push(['Vol', 'fly']);
    opts.push(['Quêtes', 'quests']);
    opts.push(['Trophées', 'trophies']);
    if (st.domaine) opts.push([this.mapObj.id === 'domaine' ? 'Revenir' : 'Domaine', 'domaine']);
    const friendsMgr = getFriendsManager(this);
    const others = Math.max(0, friendsMgr.getOnlineCount() - 1);
    opts.push([others ? `Amis (${others} en ligne)` : 'Amis', 'friends']);
    opts.push(['Carte de Dresseur', 'card'], ['Carte', 'map'], ['Code de sauvegarde', 'code'], ['Options', 'opt'], ['Fermer', 'close']);
    // une petite icône devant chaque entrée (celles du HUD et du sac)
    const ICO = { dex: ASSETS.item('dex'), party: 'img/hud/team.png', pc: 'img/hud/save.png', bag: 'img/hud/bag.png', quests: 'img/hud/quest.png', trophies: 'img/hud/trophy.png', friends: 'img/hud/friends.png', card: ASSETS.item('wallet'), map: 'img/hud/map.png', code: ASSETS.item('notebook'), domaine: ASSETS.item('gift'), fly: ASSETS.item('sifflet-celeste') };
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
      else if (k === 'domaine') { this.busy = false; if (await allerDomaine(this)) break; this.busy = true; }
      else if (k === 'opt') await optionsScreen(this);
      else if (k === 'code') {
        // le code reprend la partie telle qu'elle est maintenant : on sauvegarde d'abord
        this.save(true);
        await saveCodeScreen(this.ui, await encodeSave(this.state), saveSummary(this.state));
      }
      else if (k === 'save') {
        if (await this.ui.yesNo('Sauvegarder la partie ?')) {
          this.save();
          if (!this.cloud?.on) await this.ui.say(`${st.name} a sauvegardé la partie.`);
          else {
            this.ui.say('Envoi de la sauvegarde en ligne…', { keep: true, noWaitLast: true });
            const okOnline = await Promise.race([this.cloud.queue(st, true), wait(12000).then(() => null)]);
            this.ui.closeDialog();
            await this.ui.say(okOnline ? `${st.name} a sauvegardé la partie.\nElle est aussi enregistrée en ligne, sur ton compte du Hub.` : okOnline === null ? `${st.name} a sauvegardé la partie.\nLe serveur se réveille : l'envoi en ligne continue en arrière-plan.` : `${st.name} a sauvegardé la partie sur cet appareil.\nLe serveur en ligne ne répond pas pour l'instant.`);
          }
        }
        break;
      }
    }
    this.busy = false;
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
  /** compose la tenue du joueur dans la planche des personnages */
  appliquerTenue() {
    const T = this.state?.tenue, b = T && this.view.baseDe?.(T.genre);
    this._tenueOk = false;
    if (!b) return;
    this.view.setJoueur(composer(b.src, b.sx, b.sy, T)); this._tenueOk = true;
  }
  /** cabine d'essayage (boutique de mode) */
  async apparence(o = {}) {
    const ui = this.ui, sp = o.armoire ? {} : { speaker: 'Styliste' };
    if (!this.view.baseDe?.('m')) { await ui.say(o.armoire ? 'Ton armoire. Elle est bien rangée.' : ['Bienvenue à la boutique de mode !', 'Nos nouvelles collections arrivent très bientôt.'], sp); return; }
    if (o.armoire) await ui.say('Ton armoire ! Tu veux changer de tenue ?', sp);
    else await ui.say(['Bienvenue à la boutique de mode !', 'Casquette, bonnet, t-shirt, veste, short, sandales… et toutes les couleurs que tu veux. C\'est offert pour les dresseurs !'], sp);
    const T = await apparenceScreen(ui, { tenue: this.state.tenue || { genre: this.state.gender || 'm' }, base: (g) => this.view.baseDe(g) });
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
    await ui.say(`${st.name} utilise ${itemName(k)}.\nLes créatures sauvages faibles fuiront pendant ${st.repel} pas.`);
  }
  /** sac hors combat ; renvoie true si l'objet utilisé ferme le menu (Corde Sortie, Vol…) */
  async fieldBag() {
    for (;;) {
      const r = await bagScreen(this, {}); if (!r) return false;
      const it = ITEMS[r.item], st = this.state;
      if (it.ball) { await this.ui.say('Ce n\'est pas le moment d\'utiliser ça !'); continue; }
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
        await this.ui.say(`${st.name} utilise ${itemName(r.item)}.\nLes créatures sauvages faibles fuiront pendant ${st.repel} pas.`); continue;
      }
      if (r.item === 'escape-rope') {
        if (this.mapObj.floor === 'cave' && st.lastOutdoor) { this.take(r.item); await this.ui.say(`${st.name} utilise la Corde Sortie !`); await this.warp({ map: 'monde', x: st.lastOutdoor.x, y: st.lastOutdoor.y, dir: 'down' }, 'exit'); return true; }
        await this.ui.say('Ce n\'est pas le moment d\'utiliser ça !'); continue;
      }
      if (!st.party.length) { await this.ui.say('Tu n\'as encore aucune créature.'); continue; }
      const cap = this.levelCap();
      const target = await partyScreen(this, { mode: 'pick', prompt: `Utiliser ${itemName(r.item)} sur quelle créature ?`, filter: (m) => (canUseOn(r.item, m, cap) ? null : it.candy && m.lvl >= cap && m.lvl < 100 ? `Niv. max (${cap})` : 'Pas d\'effet') });
      if (target < 0) continue;
      const m = st.party[target];
      if (it.stone) { this.take(r.item); await this.evolveScene(m, itemEvolution(m, r.item)); return true; }
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
  give(item, n = 1) { this.state.bag[item] = (this.state.bag[item] || 0) + n; }

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

  async wildBattle(enc, o = {}) {
    let pool = enc;
    const h = this.hour();
    const isNight = h >= 20 || h < 6;
    if (!o.fixed && isNight && enc.length > 1) {
      const avgLvl = Math.round(enc.reduce((a, x) => a + (x[1] + x[2]) / 2, 0) / enc.length);
      const minLvl = Math.max(2, avgLvl - 2), maxLvl = Math.max(minLvl, avgLvl + 2);
      const nightSp = avgLvl < 15 ? [92, 163, 167, 41] : avgLvl < 30 ? [92, 198, 41, 1039] : [93, 198, 42, 1040];
      const nightEnc = nightSp.map((sp) => [sp, minLvl, maxLvl, 12]);
      pool = [...enc.filter((x) => x[0] !== 16 && x[0] !== 1010), ...nightEnc];
    }
    let e = pool[0];
    if (!o.fixed) { const tot = pool.reduce((a, x) => a + x[3], 0); let r = Math.random() * tot; for (const x of pool) { r -= x[3]; if (r <= 0) { e = x; break; } } }
    const lvl = e[1] + Math.floor(Math.random() * (e[2] - e[1] + 1));
    const lead = this.lead(); if (!lead) return;
    if (!o.fixed && this.state.repel > 0 && lead.lvl >= lvl) return;
    this.busy = true;
    const wild = createMon(o.fixed ? e[0] : SAUVAGE(e[0]), lvl, { met: this.locationName() });
    const res = await this.runBattle({ wild, music: o.music });
    this.busy = false;
    return res;
  }

  async trainerBattle(n, spotted) {
    const d = n.def, tr = d.trainer, st = this.state;
    if (this.noTrainers) { await this.ui.say(`${tr.cls || 'Dresseur'} ${tr.name} : (version de test, combats de dresseurs désactivés)`); return 'skip'; }
    this.busy = true;
    const music = d.leader != null ? 'leader' : d.champion ? 'champion' : d.rival ? 'rival' : 'trainer';
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
      speaker: tr.cls ? `${tr.cls} ${tr.name}` : tr.name,
      face: tr.bs || tr.ow || n.sprite
    });
    // le premier champion reste une marche d'apprentissage : IV ordinaires et pas d'objet tenu
    const isBoss = (d.leader != null && d.leader !== 0) || d.champion;
    const leaderDefaultItem = (sp, lvl) => {
      const S = SPECIES[sp]; if (!S) return 'sitrus-berry';
      const type = S.t[0] || 'normal';
      const typeBoosters = { fire: 'charcoal', water: 'mystic-water', grass: 'miracle-seed', electric: 'magnet', dark: 'black-glasses', rock: 'hard-stone', ground: 'soft-sand', flying: 'sharp-beak', fighting: 'black-belt', poison: 'poison-barb', psychic: 'twisted-spoon', bug: 'silver-powder', dragon: 'dragon-fang', ice: 'never-melt-ice', steel: 'metal-coat', normal: 'silk-scarf' };
      if (lvl >= 65) return 'life-orb';
      if (S.ev && S.ev.length) return 'eviolite';
      return typeBoosters[type] || 'sitrus-berry';
    };
    const party = tr.team.map((entry) => {
      const [sp, lvl, heldItem, customMoves, ability] = Array.isArray(entry) ? entry : [entry.sp, entry.lvl, entry.item, entry.moves, entry.ability];
      return createMon(sp, lvl, {
        iv: Array(6).fill(isBoss ? 31 : Math.min(31, 8 + lvl / 2 | 0)),
        item: heldItem || (isBoss ? leaderDefaultItem(sp, lvl) : null),
        moves: customMoves || null,
        ability: ability || null,
        shiny: false
      });
    });
    const res = await this.runBattle({ trainer: { ...tr, items: { ...(tr.items || {}) } }, party, music, id: n.id, leader: d.leader, champion: d.champion, rival: d.rival });
    this.musicLock = false;
    if (res === 'win') {
      st.flags['T:' + n.id] = true;
      if (d.leader != null) await this.badgeScene(d.leader, tr.name);
      if (typeof d.onWin === 'function') await d.onWin(this.api(), n); else if (d.onWin) await this.script(d.onWin, n);
      if (d.beatenPos) { await this.npcWalk(n, 'right', d.beatenPos[0] - n.x); n.dir = 'down'; n.home = [n.x, n.y]; }
      if (d.vanish) { await this.ui.fade(true, 200); this.npcs = this.npcs.filter((q) => q !== n); this.view.removeActor('npc:' + n.id); await this.ui.fade(false, 200); }
      if (d.winScript) await storyWin(this, d.winScript, n);
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
    try { this.checkTrophies(true); } catch (e) {}
    this.sound.sfx('badge');
    await ui.say(`${st.name} reçoit le ${BADGES[g].name} de la part de ${name} !`);
    const lines = {
      0: ['Avec ce badge, tu prouves ta valeur de dresseur.', 'Le garde au nord de la ville te laissera passer vers le Bois Murmure.', 'Et prends aussi ceci : une technique de ma serre, que mes Pokémon utilisent pour coller leurs proies au sol.'],
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
      7: ['...Tu te bats comme Célestine. Avec tes créatures, pas contre elles.', 'Les îles resteront libres. Mais j\'arrête de prélever les pêches et de fermer les ports.', 'Va à la Ligue. Et dis à Célestine que le vieux Drakos attend sa revanche.', 'Ah, et le Cap des Étoiles, au nord de la ville, t\'est ouvert. Odyssor y passe parfois...'],
    }[g];
    if (lines) await ui.say(lines, { speaker: name });
    const gift = GYM_GIFT[g];
    if (gift && !this.hasField(gift)) {
      const itk = FIELD[gift]?.item || ('cs-' + gift);
      this.give(itk); this.sound.sfx('item');
      await ui.say(formatObtainItem(st.name, itk, 1, FIELD[gift]));
    }
    // CT01 Pollen Collant (Hector) : une attaque Insecte propre à Odyssée
    if (g === 0 && !st.bag['ct-01']) {
      this.give('ct-01'); this.sound.sfx('item');
      await ui.say(formatObtainItem(st.name, 'ct-01'));
      await ui.say(['La CT01 contient Pollen Collant : une attaque Insecte qui englue la cible et baisse sa Vitesse.', 'Une CT ne s\'use pas : tu peux l\'apprendre à autant de Pokémon que tu veux !'], { speaker: name });
    }
    if (g === 7) { st.flags.drakos = true; this.give('town-map'); }
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
      1: ['Allô, ' + st.name + ' ? Deux badges, déjà ! Bravo.', 'Écoute : le capitaine de l\'Embarcadère de l\'Aube, à l\'est de la route 1, emmène les dresseurs aguerris vers les îles de l\'Est.', 'On dit qu\'Électhor, l\'oiseau de foudre, dérègle les orages de l\'Île Orageuse. Ça mérite un coup d\'œil !'],
      2: ['Trois badges ! Le capitaine peut maintenant t\'emmener à l\'Île de la Grue.', 'Là-bas vit une doyenne qui connaît la légende de Ho-Oh, l\'oiseau arc-en-ciel, mieux que personne.', 'Il paraît qu\'il se posait autrefois sur une tour dorée...'],
      3: ['Quatre badges... Tu vas bientôt passer à Mirage.', 'Au fait, ' + st.name + ', je ne t\'en ai jamais parlé : j\'ai un' + (B.e ? 'e ' : ' ') + B.fils + ', ' + B.name + '.', B.name + ' a grandi à Port-Granit, sur les îles. Le lendemain de ton départ, ' + B.il + ' est passé' + B.e + ' au labo et a pris la troisième capsule.', 'Depuis, ' + B.il + ' ne répond plus à mes appels. On dit qu\'' + B.il + ' s\'est engagé' + B.e + ' chez les Gardes d\'Écaille de Drakos...', 'Si tu ' + B.le + ' croises, dis-lui que son grand-père pense à ' + (B.e ? 'elle' : 'lui') + '.'],
      4: this.eclipseOn() ? ['Cinq badges ! Et Surf, en plus. Écoute bien, ' + st.name + '.', 'Cette nuit violette ne finira pas toute seule. Si la Team Éclipse a vraiment fermé le cœur de Lugia...', 'La voyante de Mirage connaît les légendes de la mer. Elle saura où dort Lugia. Va la voir avant de partir pour l\'archipel !'] : ['Cinq badges ! Avec Surf, tu peux rejoindre l\'archipel des trois frères, au sud du Cap Mirage.', 'Et le capitaine t\'emmènera aussi à l\'Île Givrée, tout au nord. Artikodin y vivrait... et plus profond encore, Lugia.'],
      7: ['Tu as battu Drakos ?! Toute la région en parle.', st.flags.rivalB3 ? B.name + ' m\'a appelé. Pour la première fois depuis des mois. ' + (B.e ? 'Elle' : 'Il') + ' a quitté les Gardes d\'Écaille.' : 'J\'espère que mon' + (B.e ? 'e ' : ' ') + B.fils + ' va bien, là-bas...', 'Il ne te reste plus que la Ligue. Mais avant, va donc voir le Cap des Étoiles, au nord de Fort-Écaille.'],
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
    if (z?.weather) return z.weather;
    if (z?.theme === 'snow' || m.id?.includes('snow') || m.id?.includes('glace')) return 'hail';
    // zones volcaniques : pluie de cendres (sans effet en combat) qui alterne avec la tempête de sable
    if (z?.theme === 'volcanic' || m.id?.includes('cendre')) return this.weatherSlot('volcan') % 2 ? 'ash' : 'sandstorm';
    if (m.id?.includes('desert')) return 'sandstorm';
    if (z?.town === 'azur' || z?.name?.includes('Pluie') || m.id?.includes('marais')) return 'rain';
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
    try { return await this.runBattleSafe(o); } catch (e) {
      console.error('combat interrompu', e);
      document.querySelectorAll('.wipe, .battle-wipe').forEach((c) => c.remove());
      try { this.bv.close(); } catch { /* déjà fermé */ }
      this.sound.stopMusic?.(0.1); this.sound.current = null; this.musicLock = false;
      await this.ui.say('Le combat a été interrompu. Réessaie !');
      this.updateZone();
      return 'flee';
    }
  }
  async runBattleSafe(o) {
    const st = this.state;
    const kind = o.wild ? o.music || 'wild' : o.music || 'trainer';
    const curtain = await this.encounterIntro(kind, !!o.wild);
    const m = this.mapObj, z = this.zone;
    const isVillage = z?.town === 'aube' || z?.town === 'sylve' || z?.theme === 'village';
    const isCity = !!z?.town || z?.name?.includes('Cité') || z?.name?.includes('Port-');
    const gymKind = (m.arene === 'rock' || m.arene === 'ground' || m.arene === 'fire' || m.arene === 'fighting') ? 'gym_rock' : 'gym';
    const bg = !m.outdoor ? (m.floor === 'cave' ? 'cave' : m.battleBg === 'gym' ? gymKind : m.battleBg) : this.player.surf ? 'water' : z?.theme === 'volcanic' ? 'volcanic' : z?.theme === 'snow' ? 'snow' : isVillage ? 'village' : isCity ? 'city' : 'grass';
    const weather = o.weather || this.getMapWeather();
    // Méga-Évolution : le joueur avec son Méga-Anneau ; un dresseur marqué megaSp tend sa gemme à ce Pokémon (« ace » : le dernier)
    // À partir de la 6e arène (5 badges), les Champions et au moins un dresseur sur trois méga-évoluent
    if (o.trainer && !o.trainer.megaSp && !o.trainer.friendly && o.party?.length && this.badgeCount() >= 5) {
      const key = String(o.id || o.trainer.name || ''); let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      if (o.leader != null || o.champion || h % 3 === 0) o.trainer = { ...o.trainer, megaSp: 'auto', megaSeed: h };
    }
    if (o.trainer?.megaSp && o.party?.length) {
      let target = o.trainer.megaSp === 'ace' ? o.party[o.party.length - 1]
        : o.trainer.megaSp === 'auto' ? [...o.party].sort((a, b) => b.lvl - a.lvl).find((q) => MEGAS_OF[q.sp])
          : o.party.find((q) => q.sp === o.trainer.megaSp);
      // personne dans l'équipe n'a de Méga : son dernier Pokémon laisse la place à un Pokémon qui en a une (toujours le même pour ce dresseur)
      if (!target && o.trainer.megaSp === 'auto') {
        const last = o.party[o.party.length - 1], pool = Object.keys(MEGAS_OF).map(Number).filter((sp) => !LEGEND.has(sp));
        const sp = pool[(o.trainer.megaSeed || 0) % pool.length];
        target = createMon(sp, last.lvl, { iv: last.iv, shiny: false });
        o.party = [...o.party.slice(0, -1), target];
      }
      const forms = target && MEGAS_OF[target.sp];
      const pid = forms && forms[(o.trainer.megaSeed || 0) % forms.length];
      if (pid) { target.item = MEGA_FORMS[pid].stone; o.trainer = { ...o.trainer, mega: true }; }
    }
    const battle = new Battle({ player: { name: st.name, party: st.party, bag: st.bag, mega: (st.bag[MEGA_RING] || 0) > 0 }, foe: o.wild ? { name: 'sauvage', party: [o.wild] } : { name: o.trainer.name, party: o.party, trainer: o.trainer }, cap: this.levelCap(), weather: BATTLE_WEATHERS.includes(weather) ? weather : undefined });
    const foeMons = o.wild ? [o.wild] : o.party;
    const h = this.hour();
    const result = await this.bv.run(battle, { bg, night: m.outdoor && (h >= 20 || h < 5.5), weather: BATTLE_WEATHERS.includes(weather) ? weather : 'none', curtain });
    // argent
    if (result === 'win' && battle.prizeMoney) st.money += battle.prizeMoney;
    if (result === 'caught') {
      const mon = foeMons[0]; mon.ot = st.name; mon.met = this.locationName();
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
    else if (result === 'lose') await this.whiteout();
    this.sound.current = null;
    this.updateZone();
    this.save(true);
    return result;
  }

  async whiteout() {
    const st = this.state;
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
    await this.ui.say([`${st.name} a perdu ${lost.toLocaleString('fr-FR')} ₽ dans la panique...`, '... ... ...', `${st.name} reprend ses esprits. Ses créatures ont été soignées.`]);
  }

  async askLearn(m, moveId) {
    const mv = MOVES[moveId], name = monName(m);
    for (;;) {
      await this.ui.say([`${name} veut apprendre ${mv.n}.`, `Mais ${name} connaît déjà quatre attaques.`], { keep: true });
      if (await this.ui.yesNo(`Oublier une attaque pour apprendre ${mv.n} ?`, { keep: true })) {
        const k = await this.ui.list({ title: 'Oublier quelle attaque ?', items: m.moves.map((x) => ({ label: MOVES[x.id].n, right: `PP ${x.pp}/${MOVES[x.id].pp}` })).concat([{ label: mv.n + ' (nouvelle)' }]), cls: 'psub learn', cancel: 4 });
        if (k >= 0 && k < 4) {
          const old = MOVES[m.moves[k].id].n;
          m.moves[k] = { id: moveId, pp: mv.pp };
          this.sound.sfx('learn');
          await this.ui.say(['1, 2 et... Tadaaa !', `${name} oublie ${old}...`, `Et ${name} apprend ${mv.n} !`]);
          return;
        }
      }
      if (await this.ui.yesNo(`Abandonner l'apprentissage de ${mv.n} ?`, { keep: true })) { await this.ui.say(`${name} n'a pas appris ${mv.n}.`); return; }
    }
  }

  async evolveScene(m, to) {
    if (!to) return;
    const ui = this.ui, oldName = monName(m), fromSp = m.sp;
    const s = el('div', 'screen evo-scr'); s.innerHTML = '<canvas class="evo-cv" width="256" height="192"></canvas>'; ui.root.appendChild(s);
    const cv = s.querySelector('canvas'), x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    const [a, b] = await Promise.all([loadImg(ASSETS.front(fromSp, m.shiny)), loadImg(ASSETS.front(to, m.shiny))]);
    const white = (img) => { if (!img) return null; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const q = c.getContext('2d'); q.drawImage(img, 0, 0); q.globalCompositeOperation = 'source-atop'; q.fillStyle = '#fff'; q.fillRect(0, 0, c.width, c.height); return c; };
    const wa = white(a), wb = white(b);
    let mode = 'old', scale = 1, flashA = 0, cancelled = false;
    const drawBg = (t) => { const g = x.createRadialGradient(128, 96, 10, 128, 96, 160); g.addColorStop(0, '#406090'); g.addColorStop(1, '#101830'); x.fillStyle = g; x.fillRect(0, 0, 256, 192); x.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 30; i++) { const ang = i * 0.7 + t * 0.002, r = (t * 0.05 + i * 17) % 140; x.fillRect(128 + Math.cos(ang) * r, 96 + Math.sin(ang) * r * 0.7, 2, 2); } };
    let alive = true; const t0 = performance.now();
    const loop = () => { if (!alive) return; const t = performance.now() - t0; drawBg(t); const img = mode === 'old' ? a : mode === 'new' ? b : mode === 'wa' ? wa : wb; if (img) { const w = 80 * scale * 1.6, h = 80 * scale * 1.6; x.drawImage(img, 128 - w / 2, 120 - h, w, h); } if (flashA > 0) { x.fillStyle = `rgba(255,255,255,${flashA})`; x.fillRect(0, 0, 256, 192); } requestAnimationFrame(loop); };
    loop();
    this.sound.stopMusic(0.2); this.sound.play('evolution');
    await ui.say(`Quoi ? ${oldName} évolue !`, { keep: true });
    this.sound.cry(ASSETS.cry(fromSp));
    const pop = this.input.push((k) => { if (k === 'b') cancelled = true; });
    mode = 'wa'; await wait(500);
    this.sound.sfx('evolve');
    for (let i = 0; i < 14 && !cancelled; i++) { mode = i % 2 ? 'wb' : 'wa'; scale = i % 2 ? 1.05 : 0.95; await wait(Math.max(70, 360 - i * 22)); }
    pop();
    if (cancelled) { mode = 'old'; scale = 1; await ui.say(`Hein ? ${oldName} n'a pas évolué !`); }
    else {
      flashA = 1; mode = 'new'; scale = 1; for (let i = 0; i < 20; i++) { flashA = 1 - i / 20; await wait(30); } flashA = 0;
      const res = evolve(m, to); this.markCaught(to);
      this.sound.cry(ASSETS.cry(to)); this.sound.sfx('levelup');
      await ui.say(`Félicitations ! Votre ${oldName} a évolué en ${SPECIES[to].n} !`);
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
    alive = false; s.remove(); this.sound.current = null; this.updateZone();
  }

  /** meubles et objets du décor : un petit texte, comme sur DS (le lit de la maison soigne l'équipe) */
  async furniture(k, x, y) {
    const st = this.state, ui = this.ui, home = this.mapObj.id === 'aube:maison', b = this.badgeCount();
    const pick = (a) => a[(x * 7 + y * 3 + this.mapObj.id.length) % a.length];
    const TV = [
      ['C\'est un film : quatre amis suivent une voie ferrée à travers la forêt.', 'Ça donne envie de partir à l\'aventure !'],
      ['Un reportage sur les créatures de la région.', '« Les Germignon adorent les journées ensoleillées... »'],
      ['La météo : grand soleil sur Bourg-Aube, tempête de neige sur l\'Île Givrée.'],
    ];
    if (b >= 3 && !st.flags.rivalB4) TV.push(['Flash spécial : les Gardes d\'Écaille ferment des ports de pêche.', 'Les pêcheurs de Port-Granit protestent...']);
    if (st.flags.champion) TV.push(['On parle de toi aux informations ! Le nouveau Maître de la Ligue...', 'Maman doit être si fière.']);
    const T_ = {
      books: home ? ['Des livres d\'images sur les créatures...', '« Mon premier voyage », celui que Maman te lisait le soir.']
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
    await ui.say('Bienvenue au Centre de soins !', { keep: true, speaker: 'Infirmière' });
    if (await ui.yesNo('Voulez-vous que je soigne vos créatures ?', { keep: true, speaker: 'Infirmière' })) {
      await ui.say('Très bien. Confiez-les-moi quelques instants.', { keep: true, speaker: 'Infirmière' });
      this.sound.sfx('heal'); await wait(2400);
      for (const m of st.party) healFull(m);
      st.lastCenter = { map: this.mapObj.id, x: 6, y: 5, dir: 'up' };
      await ui.say(['Merci d\'avoir attendu.', 'Vos créatures sont en pleine forme !'], { keep: true, speaker: 'Infirmière' });
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
        const Q = (g.world.quests || {})[id];
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
        if (t.intro) await ui().say(t.intro, { speaker: t.cls ? `${t.cls} ${t.name}` : t.name, face: t.bs || t.ow });
        const isRival = t.cls === 'Rival' || t.name === RIVAL_NAME || t.rival;
        const party = isRival ? buildRivalParty(g, t.team) : t.team.map(([sp, lvl]) => createMon(sp, lvl, { iv: Array(6).fill(Math.min(31, 10 + lvl / 2 | 0)), shiny: false }));
        g.musicLock = true;
        const items = isRival ? getRivalItems(g) : { ...(t.items || {}) };
        const res = await g.runBattle({ trainer: { ...t, items }, party, music: t.music || (isRival ? 'rival' : 'trainer'), rival: isRival, noWhiteout: t.noWhiteout });
        g.musicLock = false; g.updateZone();
        if (res === 'win' && t.after) await ui().say(t.after, { speaker: t.cls ? `${t.cls} ${t.name}` : t.name, face: t.bs || t.ow });
        return res;
      },
      /** rencontre d'un Pokémon (sauvage ou légendaire) */
      wild: async (sp, lvl, o = {}) => { g.sound.cry(ASSETS.cry(sp)); return g.wildBattle([[sp, lvl, lvl, 1]], { fixed: true, music: o.music || 'legend' }); },
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
  /** Port-Granit : le professeur Orme remet le Méga-Anneau (5 badges) et la gemme du starter, puis vend les Méga-Gemmes */
  async megaRing() {
    const st = this.state, ui = this.ui, sp = { speaker: 'Pr Orme' };
    if (!st.bag[MEGA_RING]) {
      if (this.badgeCount() < 5) { await ui.say(['Je suis le professeur Orme. J\'étudie un phénomène fascinant : la Méga-Évolution.', 'Certains Pokémon dépassent leur forme finale grâce à une Méga-Gemme... et au lien qui les unit à leur dresseur.', 'Reviens quand tu auras cinq badges : je verrai alors si ce lien est assez fort.'], sp); return; }
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
    const st = this.state, ui = this.ui;
    if (await storyTalk(this, name, n)) return;   // histoire principale et quêtes annexes (story.js)
    if (name === 'savoir') return this.savoir(n);
    if (name === 'megaRing') return this.megaRing();
    // Métropole : le comptoir du Casino, Pierre à la Bourse, la styliste de la boutique de mode
    if (name === 'casino') return casinoScreen(this);
    if (name === 'pierre') return entretienPierre(this);
    if (name === 'apparence') return this.apparence();
    if (name === 'architecte') return architecte(this);
    if (name === 'resident') return resident(this, n);
    if (name === 'mom') {
      if (!st.flags.starter) { await ui.say([`Ah, ${st.name}, tu es enfin réveillé${st.gender === 'f' ? 'e' : ''} !`, 'Le Professeur Saule est passé ce matin. Il t\'attend à son laboratoire, juste au sud-est.', 'Théo y est déjà, bien sûr... Allez, file !'], { speaker: 'Maman' }); return; }
      await ui.say(`${st.name} ! Tu as l'air épuisé${st.gender === 'f' ? 'e' : ''}. Repose-toi un peu.`, { keep: true, speaker: 'Maman' });
      this.sound.sfx('heal'); await wait(2000);
      for (const m of st.party) healFull(m);
      st.lastCenter = { map: 'aube:maison', x: 4, y: 5, dir: 'up' };
      await ui.say(['Voilà, tes créatures sont en pleine forme !', 'Je suis fière de toi. Reviens quand tu veux !'], { speaker: 'Maman' });
    } else if (name === 'rivalMom') {
      await ui.say(st.badges[7] ? ['Théo m\'a appelée : il paraît que tu as battu Drakos !', 'Il en parle comme si c\'était lui qui avait gagné, ha ha.'] : ['Théo est parti au labo dès l\'aube.', 'Il ne tient pas en place, celui-là !'], { speaker: 'Mère de Théo' });
    } else if (name === 'prof') {
      if (!st.flags.metProf) {
        st.flags.metProf = true;
        await ui.say([`Ah, ${st.name} ! Te voilà enfin.`, 'J\'étudie les créatures d\'Odyssée depuis trente ans. Et aujourd\'hui, j\'ai besoin de jeunes dresseurs pour m\'aider.', 'Sur la table, il y a trois capsules : Plante, Feu et Eau.', 'Dans chacune, trois créatures attendent un partenaire : une d\'ici, d\'Odyssée, et deux venues de régions lointaines, Kanto et Johto.', 'Approche-toi de la table et choisis celle qui te plaît !'], { speaker: 'Prof. Saule' });
        const rival = this.npcs.find((q) => q.id === 'rival-lab');
        if (rival) { rival.dir = 'up'; await ui.say('Hé ! T\'en as mis du temps ! Allez, choisis vite, je prendrai après toi.', { speaker: RIVAL_NAME }); rival.dir = 'left'; }
        return;
      }
      if (!st.flags.starter) { await ui.say('Les trois capsules sont sur la table. Approche-toi et choisis !', { speaker: 'Prof. Saule' }); return; }
      if (await purify(this)) return;
      if (this.eclipseOn()) { await ui.say(['Cette nuit violette... C\'est l\'œuvre de la Team Éclipse, n\'est-ce pas ?', 'Si Lugia se réveille avec un cœur fermé, la nuit ne finira jamais.', 'La voyante de Mirage connaît les vieilles légendes de la mer. Va la voir !'], { speaker: 'Prof. Saule' }); return; }
      const LEG = (this.world.legends || []).map((L) => L.id), seen = LEG.filter((k) => st.flags['L:' + k]).length, caught = LEG.filter((k) => st.flags['L:' + k] === 'caught').length;
      const B = this.rivalB(), lines = [];
      if (st.flags.rivalB3) lines.push(`${B.name} m'a raconté votre combat à Fort-Écaille. Merci, ${st.name}. Tu m'as rendu mon${B.e ? 'e' : ''} ${B.fils}.`);
      else if (st.flags.rivalB1) lines.push(`Tu as croisé ${B.name} ? ${B.il === 'il' ? 'Il' : 'Elle'} a toujours eu la tête dure... comme sa grand-mère.`);
      if (seen) lines.push(`Tu as déjà rencontré ${seen} créature${seen > 1 ? 's' : ''} légendaire${seen > 1 ? 's' : ''}${caught ? `, et tu en as capturé ${caught}` : ''} !`, caught >= 10 ? 'Presque toutes les légendes d\'Odyssée sont dans ton équipe ou ton PC. Odyssor lui-même doit t\'observer.' : 'Les anciens disent que les légendaires ne choisissent que les dresseurs au cœur sincère.');
      else lines.push('Chaque créature que tu rencontreras remplira ton Pokédex.', 'On raconte que des créatures légendaires dorment sur les îles de l\'Est. Le capitaine de l\'Embarcadère pourra t\'y emmener.');
      lines.push(this.badgeCount() >= 15 ? 'Il ne te reste que la Ligue Céleste. Je suis fier de toi.' : st.badges[7] ? 'Les trois frères sont tombés ! Au-delà du Pont de l\'Austral, au sud de Bourg-Aube, sept Champions t\'attendent dans les Terres du Sud.' : 'Les cinq Champions du continent t\'attendent, puis les trois frères de l\'archipel, et enfin les sept Champions des Terres du Sud. Et au bout du chemin : la Ligue Céleste !');
      await ui.say(lines, { speaker: 'Prof. Saule' });
    } else if (name === 'rivalLab') {
      if (st.flags.starter) { await ui.say('Hé, ne traîne pas !', { speaker: RIVAL_NAME }); return; }
      await ui.say(st.flags.metProf ? ['Vas-y, choisis ! Je prendrai celle qui bat la tienne, évidemment.'] : ['Yo ! Va parler au prof d\'abord, il t\'attend depuis ce matin.'], { speaker: RIVAL_NAME });
    } else if (name === 'gymguide') {
      const L = LEADERS[n.def.gym];
      if (st.badges[n.def.gym]) { await ui.say(['Bravo, champion en devenir !', 'Tu as battu ' + L.name + ' ! Continue comme ça !'], { speaker: 'Guide' }); return; }
      await ui.say(['Yo, futur Maître ! Bienvenue dans l\'Arène.', `${L.name} utilise des créatures de type ${TYPE_FR[L.type]}.`, `Pour en venir à bout, mise sur ${GYM_HINTS[L.type]} !`], { speaker: 'Guide' });
    } else if (name === 'ferry') {
      await this.ferry(n);
    } else if (name === 'gsBall') {
      const sp = 'Vieille dame';
      if (st.flags.gsGiven) { await ui.say(st.flags['L:celebi'] === 'caught' ? ['Tu as vu Celebi ? Oh... Alors la légende était vraie.', 'Prends bien soin de lui, mon petit.'] : ['L\'autel est dans le Bois Murmure, un peu à l\'écart du sentier.', 'Pose la Balle GS dans le creux... et sois patient.'], { speaker: sp }); return; }
      if (this.badgeCount() < 1) { await ui.say(['Quand j\'étais jeune, j\'ai trouvé une étrange capsule dorée dans le Bois Murmure.', 'Reviens me voir quand tu auras le badge d\'Hector. Je te raconterai.'], { speaker: sp }); return; }
      st.flags.gsGiven = true; this.give('gs-ball'); this.sound.sfx('item');
      await ui.say(['Le badge d\'Hector ! Tu es un vrai dresseur, maintenant.', 'Tiens, prends cette capsule dorée. Je l\'ai trouvée près d\'un vieil autel du Bois Murmure.'], { speaker: sp });
      await ui.say(formatObtainItem(st.name, 'gs-ball', 1));
      await ui.say('On dit que le gardien de la forêt, un petit être qui voyage dans le temps, attend qu\'on la lui rapporte...', { speaker: sp });
    } else if (name === 'phare') {
      const sp = 'Gardien du phare', f = st.flags;
      if (f.pylons) { await ui.say(f['L:zapdos'] === 'caught' ? 'Électhor dans ton équipe ! L\'île n\'a jamais été aussi calme.' : ['Le Pic Tonnerre est ouvert.', 'Électhor y attend, au milieu des éclairs. Prépare de quoi soigner la paralysie !'], { speaker: sp }); return; }
      if (!f.orageQuest) {
        f.orageQuest = true;
        await ui.say(['Bienvenue au Phare de l\'Orage ! Enfin... ce qu\'il en reste.', 'Depuis la grande tempête, les trois relais de l\'île sont coupés, et le phare est éteint.', 'Les anciens disent que la tempête vient d\'Électhor, l\'oiseau de foudre qui niche sur le Pic Tonnerre.', 'Tu veux bien rallumer les relais ? Ils sont le long du Sentier Orageux, au nord.', 'Quand les trois seront allumés, le technicien te laissera monter au Pic.'], { speaker: sp });
        return;
      }
      const k = [1, 2, 3].filter((q) => f['P:' + q]).length;
      await ui.say(`Encore ${3 - k} relais à rallumer sur le Sentier Orageux. Courage !`, { speaker: sp });
    } else if (name === 'doyenne') {
      const sp = 'Doyenne Amaya', f = st.flags;
      if (f['L:hooh'] === 'caught') { await ui.say(['Ho-Oh t\'a choisi... Après tant d\'années.', 'Les trois bêtes errent toujours dans les îles. Raikou sur l\'Île Orageuse, Entei sur le Chemin du Brasier, Suicune près de Givrebourg.', 'Elles ne se laisseront approcher que par un dresseur aguerri (5 badges).'], { speaker: sp }); return; }
      if (f.plume) { await ui.say(['La Plume Arc-en-ciel et le Sifflet Céleste ! Le Grand Sage t\'a jugé digne de la lignée des gardiens du ciel.', 'Monte sur le toit de la Tour Dorée. Si Ho-Oh le veut, il descendra vers toi. Et le chant de ton sifflet appellera les oiseaux du ciel où que tu sois.'], { speaker: sp }); return; }
      if (!f.grueQuest) {
        f.grueQuest = true;
        await ui.say(['Tu viens du continent ? Assieds-toi, que je te raconte.', 'Là-bas, dans la Forêt des Torii, au sud-ouest de Mirage, deux tours se dressent côte à côte.', 'L\'une a brûlé, et trois créatures ont péri dans les flammes. Ho-Oh, l\'oiseau arc-en-ciel, les a ramenées à la vie : ce sont Raikou, Entei et Suicune.', 'Depuis, Ho-Oh ne se pose plus que sur l\'autre, la Tour Dorée... Nos anciens l\'appelaient la Tour de la Grue, comme notre village.', 'Il ne se pose que devant celui qui porte la Plume Arc-en-ciel. Le Grand Sage la garde, au sommet de la tour. Gagne le respect des Sages, et peut-être te la confiera-t-il.'], { speaker: sp });
        return;
      }
      await ui.say(['Les Sages t\'attendent dans la Tour Dorée, sur le continent : dans la Forêt des Torii, au sud-ouest de Mirage.', 'Le Grand Sage Hoël garde la Plume Arc-en-ciel au dernier étage.'], { speaker: sp });
    } else if (name === 'grandSage') {
      if (st.flags.plume) return;
      st.flags.plume = true; this.give('plume-arc'); this.give('great-ball', 5); this.sound.sfx('item');
      const hadVol = this.hasField('vol');
      if (!hadVol) this.give('sifflet-celeste');
      await ui.say([
        'Ton cœur et celui de tes créatures battent à l\'unisson.',
        'Cette Plume Arc-en-ciel t\'appartient désormais pour éveiller Ho-Oh sur le toit de la tour.',
        'Et reçois également ce trésor des cieux : le Sifflet Céleste !',
        'Sculpté dans le bois sacré de la tour et orné d\'un ruban céleste, son chant appelle les grands oiseaux du ciel pour te transporter d\'une ville à l\'autre en un instant.'
      ], { speaker: 'Grand Sage Hoël' });
      await ui.say(formatObtainItem(st.name, 'plume-arc', 1));
      if (!hadVol) await ui.say(formatObtainItem(st.name, 'sifflet-celeste', 1));
      await ui.say(formatObtainItem(st.name, 'great-ball', 5));
      await ui.say('Monte sur le toit. Le novice te laissera passer.', { speaker: 'Grand Sage Hoël' });
      this.refreshGates();
    } else if (name === 'ermite') {
      const sp = 'Ermite', f = st.flags; f.ermite = true;
      if (st.flags.eclipse && !st.flags.lugia) { await ui.say(['Les courants de la grotte se sont tus... Lugia n\'est plus là.', 'Je l\'ai senti partir vers le sud, vers un vieux sanctuaire au large du Cap Mirage.', 'Quelque chose l\'appelle. Quelque chose de mauvais.'], { speaker: sp }); return; }
      if (f.plumeArgent) { await ui.say(f['L:lugia'] === 'caught' ? 'Lugia... Tu l\'as vu de tes propres yeux. Moi, j\'ai attendu toute ma vie.' : ['La Grotte des Tourbillons est à l\'est du village.', 'Avec la Plume Argentée, les courants te laisseront passer jusqu\'à Lugia.'], { speaker: sp }); return; }
      if (f['L:articuno']) {
        f.plumeArgent = true; this.give('plume-argent'); this.sound.sfx('item');
        await ui.say(['Tu as affronté Artikodin sur la Cime Givrée ? Alors tu es prêt.', 'Prends cette plume. Je l\'ai trouvée sur la plage, il y a quarante ans. Elle vient de Lugia, le gardien des mers.'], { speaker: sp });
        await ui.say(formatObtainItem(st.name, 'plume-argent', 1));
        await ui.say('Le pêcheur qui garde la Grotte des Tourbillons te laissera entrer.', { speaker: sp });
        this.refreshGates();
        return;
      }
      await ui.say(['Hmm. Un dresseur, jusqu\'ici ? Rare.', 'Sous cette île dort Lugia, le gardien des mers. Ses courants protègent la Grotte des Tourbillons.', 'Mais avant de le voir, va affronter Artikodin, sur la Cime Givrée, au bout de la Pente Givrée.', 'Reviens me voir ensuite.'], { speaker: sp });
    } else if (name === 'granitDock') {
      if (!st.flags.granitDock) {
        st.flags.granitDock = true;
        await ui.say(['Halte ! Tu accostes sur l\'Île de Granit, territoire de l\'archipel.', 'Ici, ce n\'est pas la Ligue qui fait la loi. C\'est Drakos.', '... Un dresseur avec cinq badges ? Bah. Basalte sera ravi de te remettre à ta place.', 'Passe. Et ne pêche rien sans autorisation !'], { speaker: 'Garde d\'Écaille' });
      } else await ui.say(st.badges[7] ? 'Drakos a levé l\'impôt sur les pêches. Les gens sourient à nouveau, sur le port.' : 'Circule, et pas d\'histoires.', { speaker: 'Garde d\'Écaille' });
    }
  }

  async chooseStarter(sp, cap) {
    const st = this.state, ui = this.ui;
    if (st.flags.starter) { await ui.say('C\'est une capsule vide.'); return; }
    // on n'ouvre pas les capsules du professeur sans lui avoir parlé
    if (!st.flags.metProf) { await ui.say('Il y a une créature dans cette capsule... Mieux vaut d\'abord parler au Professeur Saule.'); return; }
    // la capsule d'un type : deux partenaires au choix
    const C = STARTER_CHOICES[cap ?? Math.max(0, STARTERS.indexOf(sp))], picks = C.lines.map((l) => l[0]);
    const ORIG = picks.length === 3 ? ['Odyssée', 'Kanto', 'Johto'] : ['Kanto', 'Johto'];
    const pic = el('div', 'box starter-pic starter-trio', picks.map((p, k) => `<figure data-k="${k}"><img src="${ASSETS.front(p)}" alt=""><figcaption>${esc(SPECIES[p].n)}<small>${ORIG[k]}</small></figcaption></figure>`).join(''));
    ui.root.appendChild(pic);
    const mark = (k) => pic.querySelectorAll('figure').forEach((f, j) => f.classList.toggle('on', j === k));
    mark(0);
    await ui.say(`Une capsule de type ${TYPE_FR[C.type]}. ${picks.length === 3 ? 'Trois' : 'Deux'} créatures te regardent...`, { keep: true, speaker: 'Prof. Saule' });
    const k = await ui.list({ title: `Capsule ${TYPE_FR[C.type]}`, items: picks.map((p, j) => ({ label: SPECIES[p].n, right: ORIG[j] })).concat([{ label: 'Refermer' }]), cls: 'shop', cancel: picks.length, onMove: (j) => { if (j < picks.length) { mark(j); this.sound.cry(ASSETS.cry(picks[j])); } } });
    if (k < 0 || k >= picks.length) { pic.remove(); ui.closeDialog(); return; }
    sp = picks[k]; mark(k);
    const S = SPECIES[sp];
    const ok = await ui.yesNo(`Tu veux ${S.n}, la créature de type ${TYPE_FR[S.t[0]]} ?`, { speaker: 'Prof. Saule' });
    pic.remove();
    if (!ok) return;
    const mon = createMon(sp, 5, { ot: st.name, met: 'Bourg-Aube', shiny: false });
    st.party.push(mon); st.flags.starter = sp; this.markCaught(sp);
    this.sound.sfx('caught');
    await ui.say(`${st.name} reçoit ${S.n} !`);
    if (await ui.yesNo(`Donner un surnom à ${S.n} ?`)) { const nick = await ui.nameEntry(`Surnom de ${S.n}`, S.n); if (nick && nick !== S.n) mon.nick = nick; }
    // le rival choisit la créature qui a l'avantage
    const rs = RIVAL_TEAMS[sp][0];
    st.flags.rivalSp = sp;
    const rival = this.npcs.find((q) => q.id === 'rival-lab');
    if (rival) rival.dir = 'up';
    await ui.say(['Alors je prends celle-là !', `${SPECIES[rs].n} ! Il a une tête de gagnant, comme moi.`], { speaker: RIVAL_NAME });
    if (rival) rival.dir = 'left';
    await ui.say(['Hé, ' + st.name + ' ! On a nos créatures, alors...', 'On se fait un petit combat ? Allez !'], { speaker: RIVAL_NAME });
    const res = await this.runBattle({ trainer: { cls: 'Rival', name: RIVAL_NAME, prize: 30, bs: 'theo', ai: 'normal', friendly: true, lose: 'Quoi ?! J\'aurais dû choisir l\'autre !' }, party: [createMon(rs, 5, { ot: RIVAL_NAME })], music: 'rival', rival: true, noWhiteout: true });   // premier combat : à armes égales (même niveau, IA simple)
    for (const m of st.party) healFull(m);
    st.flags.rival1 = true;
    await ui.say(res === 'win' ? 'Pfff... Bon, c\'était juste un échauffement !' : 'Ha ha ! Je suis trop fort ! Mais t\'inquiète, tu t\'améliores déjà.', { speaker: RIVAL_NAME });
    await ui.say([res === 'win' ? 'Quel combat ! Vos créatures ont déjà l\'air de vous adorer.' : 'Ne te décourage pas, ' + st.name + '. Ce n\'était que votre tout premier combat !', `${st.name}, prends aussi ceci.`], { speaker: 'Prof. Saule' });
    this.sound.sfx('item');
    st.flags.dex = true; st.bag['poke-ball'] = (st.bag['poke-ball'] || 0) + 5; st.bag.potion = (st.bag.potion || 0) + 2; this.give('town-map');
    await ui.say([`${st.name} reçoit le Pokédex, la Carte, 5 Poké Balls et 2 Potions !`, 'Le Pokédex enregistre chaque créature que tu vois ou captures.', 'Quand tes créatures sont fatiguées, reviens voir ta mère ou passe au Centre de soins.', 'La première Arène se trouve à Sylvebourg, au nord. Bonne route !'], { speaker: 'Prof. Saule' });
    await ui.say('Je file ! À plus, ' + st.name + ' !', { speaker: RIVAL_NAME });
    if (rival) { await this.npcWalk(rival, 'down', 2); this.npcs = this.npcs.filter((q) => q !== rival); this.view.removeActor('npc:rival-lab'); }
    this.save(true);
  }

  /** case libre où faire apparaître le rival : jusqu'à 4 cases dans la direction d'où il arrive, chemin dégagé */
  spawnAhead(dir, max = 4) {
    const p = this.player, m = this.mapObj, [dx, dy] = DIRS[dir];
    let best = 0;
    for (let k = 1; k <= max; k++) {
      const x = p.x + dx * k, y = p.y + dy * k;
      if (!m.in(x, y) || !walkable(m.get(x, y)) || this.occupied(x, y)) break;
      best = k;
    }
    return best;
  }

  async trigger(name) {
    const st = this.state, p = this.player, ui = this.ui;
    if (await storyTrigger(this, name)) return true;
    if (name === 'needStarter' && !st.flags.starter) {
      this.busy = true;
      await ui.say(['Hé ! Attends !', 'Les hautes herbes sont pleines de créatures sauvages. Sans créature à toi, c\'est bien trop dangereux !', 'Va d\'abord voir le Professeur Saule, à son labo.'], { speaker: '???' });
      await this.playerWalk('down', 1);
      this.busy = false; return true;
    }
    const rivalFight = async (flag, team, lvlText, lines, after, who = null) => {
      if (st.flags[flag] || !st.flags.rival1 || !st.party.some((m) => m.hp > 0)) return false;
      const W = who || { name: RIVAL_NAME, sprite: 'theo', bs: 'theo' };
      this.busy = true; st.flags[flag] = true;
      const R = RIVAL_TEAMS[st.flags.rivalSp] || RIVAL_TEAMS[STARTERS[0]];
      // le rival arrive par le haut (ou par le côté si la place manque), jamais à travers un mur
      let dir = 'up', n = this.spawnAhead('up');
      for (const d of ['left', 'right', 'down']) { if (n >= 2) break; const k = this.spawnAhead(d); if (k > n) { n = k; dir = d; } }
      const [dx, dy] = DIRS[dir];
      const rival = { def: { id: 'rival-' + flag }, id: 'rival-' + flag, x: p.x + dx * Math.max(1, n), y: p.y + dy * Math.max(1, n), dir: OPP[dir], sprite: W.sprite, home: [0, 0], timer: 99, move: null, step: 0 };
      this.npcs.push(rival);
      this.musicLock = true; this.sound.play('rival');
      p.dir = dir; rival.bang = true; this.sound.sfx('bang'); await wait(500); rival.bang = false;
      if (n > 1) await this.npcWalk(rival, OPP[dir], n - 1);
      rival.dir = OPP[dir];
      await ui.say(lines, { speaker: W.name });
      const party = buildRivalParty(this, team(R));
      const res = await this.runBattle({ trainer: { cls: W.cls || 'Rival', name: W.name, prize: 40, bs: W.bs, ai: st.badges.some(Boolean) ? 'smart' : 'normal', items: getRivalItems(this), lose: lvlText, megaSp: st.badges.filter(Boolean).length >= 8 ? 'ace' : undefined }, party, music: 'rival', rival: true });
      this.musicLock = false;
      if (res !== 'lose') {
        await ui.say(after, { speaker: W.name });
        // il repart par où il est venu
        if (n > 1) await this.npcWalk(rival, dir, n - 1);
      }
      this.npcs = this.npcs.filter((q) => q !== rival); this.view.removeActor('npc:' + rival.id);
      this.updateZone();
      this.busy = false; return true;
    };
    // Théo t'attend sur la Route 2 une fois ton premier badge en poche (sa réplique et son équipe vont avec)
    if (name === 'rival2' && st.badges[0]) return rivalFight('rival2', (R) => [[1010, 11], [1013, 11], [R[0], 13]], 'Grr... Tu as eu de la chance !', [`${st.name} ! Tu as déjà ton premier badge ?`, 'Moi aussi, évidemment. Voyons qui a le plus progressé !'], ['Je vais m\'entraîner dans le Bois Murmure.', 'La prochaine fois, je ne perdrai pas !']);
    if (name === 'rival3') return rivalFight('rival3', (R) => [[1011, 27], [1034, 26], [1021, 26], [R[1], 29]], 'Encore ?! Tes créatures sont devenues sacrément fortes...', ['Tiens, tiens... Le grand voyageur !', 'Floralia, c\'est ma ville porte-bonheur. Prépare-toi !'], ['Flora t\'attend à l\'Arène. Moi, je file vers l\'est.', 'On se retrouvera tout en haut, à la Ligue !']);
    if (name === 'rival4') return rivalFight('rival4', (R) => [[1012, 36], [1035, 35], [1022, 36], [1019, 36], [R[2], 39]], 'Toi et tes créatures, vous êtes vraiment synchronisés...', [`${st.name} ! Tu vas sur les îles, toi aussi ?`, 'On dit que Drakos a battu tous ceux qui ont osé le défier, sauf Célestine.', 'Avant que tu y ailles, montre-moi si tu es prêt !'], ['Bon. Tu es prêt. Fonce !', 'Moi, je vais m\'entraîner sur la route 10. On se revoit avant la Ligue.']);
    // second rival : l'autre enfant, petit-fils / petite-fille du professeur, recrue des Gardes d'Écaille
    const B = this.rivalB(), L3 = this.thirdLine(), bd = (k) => st.badges[k];
    const asB = { name: B.name, sprite: B.sprite, bs: B.bs, cls: 'Garde d\'Écaille' };
    if (name === 'rivalB1' && bd(3)) return rivalFight('rivalB1', () => [[1043, 33], [1015, 33], [L3[1], 36]], 'Pas mal... pour quelqu\'un du continent.',
      [`Alors c'est toi, ${st.name}. Le prodige de Bourg-Aube.`, `Moi, c'est ${B.name}. J'ai pris la dernière capsule de mon grand-père, le lendemain de ton départ.`, 'J\'ai grandi sur les îles. Là-bas, la Ligue ne vient jamais. Personne ne nous aide... sauf Drakos.', 'Je suis Garde d\'Écaille, maintenant. Et je viens voir de quoi tu es capable avant que tu ne mettes les pieds chez nous.'],
      ['Tu viendras sur les îles, je le sais. Drakos t\'attend.', 'Et moi aussi.'], { ...asB, cls: 'Rival' });
    if (name === 'rivalB2' && bd(5)) return rivalFight('rivalB2', () => [[1044, 42], [1015, 41], [1039, 41], [L3[2], 45]], 'Basalte avait raison... tu ne lâches rien.',
      [`${st.name}. Tu as battu Basalte.`, 'C\'est lui qui m\'a appris à me battre, tu sais.', 'Les pêcheurs disent que Drakos leur prend trop. Je... je ne veux pas y croire.', 'Montre-moi que tu mérites d\'aller plus loin !'],
      ['Va voir Pyros, à Cendrelune.', `Moi... je vais parler aux pêcheurs. Juste pour savoir.`], { ...asB, cls: 'Rival' });
    if (name === 'rivalB3' && bd(6) && !bd(7)) return rivalFight('rivalB3', () => [[1044, 48], [1016, 48], [1040, 49], [148, 48], [L3[2], 51]], 'C\'est fini. Je ne suis plus sûr' + B.e + ' de rien.',
      [`Stop, ${st.name}. Je suis le dernier rempart avant la Tour de Drakos.`, 'Les pêcheurs m\'ont tout raconté. Les ports fermés, les pêches confisquées...', 'Mais Drakos nous a protégés quand personne d\'autre ne le faisait.', 'Alors je vais me battre. Une dernière fois. Pour savoir lequel de nous deux a raison !'],
      ['Vas-y. Montre-lui ce que ça fait de perdre... comme moi.', 'Je quitte les Gardes. Peut-être qu\'après toi, Drakos écoutera enfin les îles.'], asB);
    if (name === 'rivalB4' && bd(7)) return rivalFight('rivalB4', () => [[1044, 54], [1016, 54], [1040, 54], [149, 55], [1046, 54], [L3[2], 57]], 'Merci. J\'avais besoin de ce combat.',
      [`${st.name} ! Je savais que tu viendrais ici.`, 'Drakos m\'a parlé, hier soir. Il dit que Odyssor passe au Cap quand quelqu\'un a eu le courage de changer les choses.', 'J\'aimerais le voir avec toi. Mais d\'abord... un vrai combat. Sans uniforme, sans camp. Juste nous deux !'],
      ['Mon grand-père a raison : on apprend plus en perdant qu\'en gagnant.', 'Avance jusqu\'au bord de la falaise. Si Odyssor vient, c\'est pour toi.'], { ...asB, cls: 'Rival' });
    if (name === 'rival5') return rivalFight('rival5', (R) => [[1012, 72], [1035, 71], [1022, 72], [1040, 72], [1051, 73], [R[2], 76]], 'Incroyable... Tu mérites d\'aller jusqu\'au bout.', [`${st.name}... Je savais que tu viendrais.`, 'Quinze badges, dont celui de Drakos et les sept du Sud. Tout le monde ne parle que de toi.', 'Mais avant la Ligue, il y a moi. Donne tout ce que tu as !'], ['Va. La Maître de la Ligue t\'attend.', 'Et bats-la, sinon c\'est moi qui m\'en chargerai !']);
    return false;
  }

  /** Cap des Étoiles : Odyssor apparaît (après le badge de Drakos), on peut tenter de le capturer */
  async odyssorEvent() {
    const st = this.state, ui = this.ui;
    if (!st.badges[7] || st.flags.odyssor === 'caught' || st.flags.odyssorNow) return false;
    this.busy = true; st.flags.odyssorNow = true; st.flags.odyssorMet = true;
    try {
      this.musicLock = true; this.sound.play('mystic');
      await ui.say(['La mer se met à scintiller...', 'Une immense silhouette bleue glisse entre les vagues.', 'C\'est Odyssor, le géant des océans !']);
      if (st.flags.rivalB4) await ui.say(['... Il est magnifique.', 'Les anciens disent que Odyssor a guidé les premiers marins jusqu\'aux îles, avant même la Ligue.', 'Vas-y. C\'est toi qu\'il est venu voir.'], { speaker: this.rivalB().name });
      await ui.flash(4, '#cfe4ff', 90);
      const res = await this.wildBattle([[1052, 50, 50, 1]], { fixed: true, music: 'champion' });
      if (res === 'caught') { st.flags.odyssor = 'caught'; await ui.say(['Odyssor a rejoint ton équipe.', 'Les marins d\'Odyssée raconteront longtemps cette nuit-là.']); }
      else await ui.say(['Odyssor replonge et disparaît vers le large...', 'Peut-être reviendra-t-il un autre jour.']);
    } finally {
      this.musicLock = false; this.updateZone();
      setTimeout(() => { st.flags.odyssorNow = false; }, 4000);
      this.busy = false;
    }
    return true;
  }

  async ending() {
    const st = this.state, ui = this.ui;
    st.flags.champion = true;
    this.sound.play('victory');
    const B = this.rivalB();
    await ui.say(['Félicitations !', `${st.name}, tu es le nouveau Maître de la Ligue Céleste !`, 'Drakos m\'a fait passer un message, tu sais. « Le vieux Drakos attend sa revanche. »', st.flags.rivalB3 ? `Et ${B.name} m'a écrit aussi. ${B.il === 'il' ? 'Il' : 'Elle'} veut ouvrir une arène à Port-Granit, ouverte à tous.` : 'Drakos a rouvert les ports de l\'archipel.', 'Grâce à toi, les îles et le continent se reparlent.', 'Et sans toi, la nuit de la Team Éclipse recouvrirait encore la région. Lugia veille de nouveau sur les marées.', 'Ton équipe et toi entrez au Panthéon des dresseurs.'], { speaker: 'Célestine' });
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
