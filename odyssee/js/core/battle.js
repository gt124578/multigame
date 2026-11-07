// odyssee/js/core/battle.js — moteur de combat 1 contre 1 (règles de la 4e génération, simplifiées), sans DOM.
// Le moteur calcule un tour d'un coup et renvoie une liste d'événements que la vue rejoue (textes, PV, animations).
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { TYPE_CHART } from '../data/types.js';
import { monName, gainExp, gainEffort, isFainted, expProgress } from './mon.js';
import { ITEMS, itemName, applyItem } from './items.js';
import { getAbility, abilityName } from '../data/abilities.js';
import { megaFormOf, megaEvolve, revertMegas } from './mega.js';

export const STAGE_NAMES = { 1: 'l\'Attaque', 2: 'la Défense', 3: 'l\'Attaque Spéciale', 4: 'la Défense Spéciale', 5: 'la Vitesse', 6: 'la Précision', 7: 'l\'Esquive' };
const STATUS_TXT = { par: 'est paralysé ! Il aura du mal à attaquer !', slp: 's\'est endormi !', frz: 'est gelé !', brn: 'est brûlé !', psn: 'est empoisonné !', tox: 'est gravement empoisonné !' };
const HP_TYPES = ['fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark'];

export function typeEff(mt, defTypes) {
  let e = 1; for (const d of defTypes) { const r = TYPE_CHART[mt]?.[d]; if (r != null) e *= r; } return e;
}
export function hiddenPower(m) {
  const order = [0, 1, 2, 5, 3, 4]; let t = 0, p = 0;
  order.forEach((s, i) => { t += (m.iv[s] & 1) << i; p += ((m.iv[s] >> 1) & 1) << i; });
  return { type: HP_TYPES[Math.floor(t * 15 / 63)], power: Math.floor(p * 40 / 63) + 30 };
}
const stageMul = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
const accMul = (s) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s));
const freshVol = () => ({ st: [0, 0, 0, 0, 0, 0, 0, 0], conf: 0, flinch: false, charge: null, recharge: false, protect: false, protChain: 0, seed: false, trap: 0, rampage: null, invuln: null, dmgTaken: null, turns: 0 });

export class Battle {
  /**
   * @param o.player { name, party, bag }   bag = { item: qté } (modifié par le combat)
   * @param o.foe    { name, party, trainer?: { cls, name, prize, items: {item:qté}, ai } }
   */
  constructor(o) {
    this.rng = o.rng || Math.random;
    this.wild = !o.foe.trainer;
    this.sides = [
      { name: o.player.name, party: o.player.party, active: 0, v: freshVol(), screens: {}, player: true },
      { name: o.foe.name, party: o.foe.party, active: 0, v: freshVol(), screens: {}, trainer: o.foe.trainer || null },
    ];
    // Méga-Évolution : le joueur avec son Méga-Anneau, les dresseurs qui en ont un (trainer.mega) ; jamais un Pokémon sauvage
    this.sides[0].mega = !!o.player.mega;
    this.sides[1].mega = !!o.foe.trainer?.mega;
    this.bag = o.player.bag || {};
    this.sides[0].active = Math.max(0, o.player.party.findIndex((m) => m.hp > 0));
    this.participants = new Set();
    this.runTries = 0;
    this.state = 'choose';
    this.result = null;
    this.ev = [];
    this.turn = 0;
    this.cap = o.cap || 100;
    this.dex = o.dex || null; // { seen: Set } facultatif
    this.prizeMoney = 0;
    this.levelUps = new Set();
    this.weather = o.weather || 'none';
    this.weatherTurns = o.weatherTurns || 0;
    this.gymCrisisTriggered = false;
  }
  get me() { return this.sides[0].party[this.sides[0].active]; }
  get foe() { return this.sides[1].party[this.sides[1].active]; }
  act(i) { return this.sides[i].party[this.sides[i].active]; }
  /** crans de stats des deux Pokémon au combat, à cet instant (pour l'affichage : Atq +2, Vit −1…) */
  stages() { return this.sides.map((x) => x.v.st.slice()); }
  /** identifiant du talent du Pokémon actif d'un camp */
  ab(i) { const m = this.act(i); return m && !isFainted(m) ? getAbility(m)?.id : null; }
  /** efficacité d'un type contre le Pokémon actif d'un camp (Querelleur : Normal et Combat touchent les Spectres) */
  effOn(a, d, type) {
    let t = SPECIES[this.act(d).sp].t;
    if (this.ab(a) === 'scrappy' && (type === 'normal' || type === 'fighting')) t = t.filter((x) => x !== 'ghost');
    return typeEff(type, t);
  }
  r(n) { return Math.floor(this.rng() * n); }
  /** égalité de vitesse : tirage au sort de qui agit en premier (redéfini pour les combats entre joueurs) */
  tie() { return this.rng() < 0.5 ? -1 : 1; }
  say(text) { this.ev.push({ t: 'msg', text }); }
  nm(i) { const m = this.act(i); return i === 1 ? (this.wild ? `${monName(m)} sauvage` : `${monName(m)} ennemi`) : monName(m); }
  Nm(i) { const s = this.nm(i); return s[0].toUpperCase() + s.slice(1); }

  setWeather(w, turns = 5) {
    if (this.weather === w && turns === this.weatherTurns) return;
    this.weather = w;
    this.weatherTurns = turns;
    const txt = {
      rain: 'Une pluie battante commence à tomber !',
      sun: 'Le soleil commence à briller intensément !',
      sandstorm: 'Une tempête de sable se lève !',
      hail: 'Une averse de grêle commence à tomber !',
      none: 'Le temps redevient normal.',
    }[w] || '';
    if (txt) this.say(txt);
    this.ev.push({ t: 'weather', weather: w, turns });
  }

  triggerEntry(side) {
    const m = this.act(side);
    if (!m || isFainted(m)) return;
    const ab = getAbility(m);
    if (!ab) return;
    if (ab.id === 'intimidate') {
      const opp = 1 - side;
      const foe = this.act(opp);
      if (!isFainted(foe)) {
        this.say(`Le talent Intimidation de ${this.nm(side)} s'active !`);
        this.lastUser = side; this.boost(opp, 2, -1, true);
      }
    } else if (ab.id === 'halo-sylvestre') {
      const opp = 1 - side;
      const foe = this.act(opp);
      if (!isFainted(foe)) {
        this.say(`Le Halo Sylvestre de ${this.nm(side)} rayonne doucement !`);
        this.lastUser = side; this.boost(opp, 4, -1, true);
      }
    } else if (ab.id === 'coeur-vaillant') {
      this.say(`Le Cœur Vaillant de ${this.nm(side)} s'enflamme de bravoure !`);
      this.lastUser = side; this.boost(side, 2, 1, true);
    } else if (ab.id === 'drizzle') {
      this.say(`Le talent Crachin de ${this.nm(side)} fait tomber la pluie !`);
      this.setWeather('rain', 5);
    } else if (ab.id === 'drought') {
      this.say(`Le talent Sécheresse de ${this.nm(side)} intensifie les rayons du soleil !`);
      this.setWeather('sun', 5);
    } else if (ab.id === 'sand-stream') {
      this.say(`Le talent Sable Volant de ${this.nm(side)} déclenche une tempête de sable !`);
      this.setWeather('sandstorm', 5);
    } else if (ab.id === 'snow-warning') {
      this.say(`Le talent Alerte Neige de ${this.nm(side)} fait tomber la grêle !`);
      this.setWeather('hail', 5);
    } else if (ab.id === 'pressure') {
      this.say(`${this.Nm(side)} met la pression !`);
    } else if (ab.id === 'unnerve') {
      this.say(`${this.Nm(side)} rend nerveuse l'équipe adverse !`);
    } else if (ab.id === 'mold-breaker') {
      this.say(`${this.Nm(side)} brise le moule !`);
    } else if (ab.id === 'cloud-nine' || ab.id === 'air-lock') {
      if (this.weather && this.weather !== 'none') { this.say(`Les effets de la météo disparaissent !`); this.setWeather('none', 0); }
    } else if (ab.id === 'frisk') {
      const f = this.act(1 - side); if (f?.item) this.say(`${this.Nm(side)} fouille ${this.nm(1 - side)} et trouve ${itemName(f.item)} !`);
    } else if (ab.id === 'anticipation') {
      const f = this.act(1 - side), me = this.act(side);
      if (f.moves.some((q) => MOVES[q.id] && MOVES[q.id].c !== 'status' && typeEff(MOVES[q.id].t, SPECIES[me.sp].t) > 1)) this.say(`${this.Nm(side)} frissonne !`);
    }
  }

  checkBerries(i) {
    const m = this.act(i);
    if (!m || isFainted(m) || !m.item) return;
    if (m.item === 'sitrus-berry' && m.hp <= m.stats[0] / 2) {
      m.item = null;
      const heal = Math.max(1, Math.floor(m.stats[0] / 4));
      this.hp(i, heal);
      this.ev.push({ t: 'sfx', k: 'heal' });
      this.say(`${this.Nm(i)} consomme sa Baie Sitrus et récupère des PV !`);
    } else if (m.item === 'oran-berry' && m.hp <= m.stats[0] / 2) {
      m.item = null;
      this.hp(i, 10);
      this.ev.push({ t: 'sfx', k: 'heal' });
      this.say(`${this.Nm(i)} consomme sa Baie Oran et récupère des PV !`);
    } else if (m.item === 'lum-berry' && m.status) {
      m.item = null;
      m.status = null; m.slp = 0; m.tox = 0;
      this.ev.push({ t: 'status', side: i, status: null });
      this.say(`La Baie Prun guérit les altérations d'état de ${this.nm(i)} !`);
    }
  }

  start() {
    this.ev = [];
    const f = this.foe, t = this.sides[1].trainer;
    if (this.wild) this.say(`Un ${monName(f)} sauvage apparaît !`);
    else { this.say(`${t.cls} ${t.name} veut se battre !`); this.ev.push({ t: 'send', side: 1, idx: 0 }); this.say(`${t.cls} ${t.name} envoie ${monName(f)} !`); }
    this.ev.push({ t: 'send', side: 0, idx: this.sides[0].active });
    this.say(`En avant ! ${monName(this.me)} !`);
    this.participants.add(this.me.uid);
    if (this.weather && this.weather !== 'none') {
      this.ev.push({ t: 'weather', weather: this.weather, turns: this.weatherTurns });
    }
    const startOrder = [0, 1].sort((p, q) => this.stat(q, 5) - this.stat(p, 5) || this.tie({ i: p }, { i: q }));
    for (const s of startOrder) {
      this.triggerEntry(s);
    }
    return this.flush();
  }
  flush() { const e = this.ev; this.ev = []; return e; }

  /* ---------------- statistiques effectives ---------------- */
  stat(i, k, crit = false, atkSide = true, ignore = false) {
    const m = this.act(i), v = this.sides[i].v; let s = ignore ? 0 : v.st[k];
    if (crit) s = atkSide ? Math.max(0, s) : Math.min(0, s);
    let x = Math.floor(m.stats[k] * stageMul(s));
    // Objets tenus & Talents influençant les stats
    const ab = getAbility(m);
    const w = this.weather, id = ab?.id;
    if (k === 1) { // Attaque
      if (m.item === 'choice-band') x = Math.floor(x * 1.5);
      if (id === 'guts' && m.status) x = Math.floor(x * 1.5);
      if (id === 'huge-power' || id === 'pure-power') x *= 2;
      if (id === 'hustle') x = Math.floor(x * 1.5);
      if (id === 'toxic-boost' && (m.status === 'psn' || m.status === 'tox')) x = Math.floor(x * 1.5);
    } else if (k === 2) { // Défense
      if (m.item === 'eviolite' && SPECIES[m.sp]?.ev?.length) x = Math.floor(x * 1.5);
      if (id === 'marvel-scale' && m.status) x = Math.floor(x * 1.5);
    } else if (k === 3) { // Atq Spé
      if (m.item === 'choice-specs') x = Math.floor(x * 1.5);
      if (id === 'solar-power' && w === 'sun') x = Math.floor(x * 1.5);
      if (id === 'flare-boost' && m.status === 'brn') x = Math.floor(x * 1.5);
    } else if (k === 4) { // Déf Spé
      if (m.item === 'eviolite' && SPECIES[m.sp]?.ev?.length) x = Math.floor(x * 1.5);
      if (this.weather === 'sandstorm' && SPECIES[m.sp]?.t?.includes('rock')) x = Math.floor(x * 1.5);
    } else if (k === 5) { // Vitesse
      if (m.item === 'choice-scarf') x = Math.floor(x * 1.5);
      if ((id === 'swift-swim' && w === 'rain') || (id === 'chlorophyll' && w === 'sun') || (id === 'sand-rush' && w === 'sandstorm')) x *= 2;
      if (id === 'quick-feet' && m.status) x = Math.floor(x * 1.5);
      else if (m.status === 'par') x = Math.floor(x / 4);
    }
    return Math.max(1, x);
  }

  /* ---------------- choix du joueur ---------------- */
  usableMoves(i) { const m = this.act(i); return m.moves.map((x, k) => (x.pp > 0 ? k : -1)).filter((k) => k >= 0); }
  forcedAction(i) {
    const v = this.sides[i].v;
    if (v.recharge) return { type: 'recharge' };
    if (v.charge) return { type: 'move', id: v.charge };
    if (v.rampage) return { type: 'move', id: v.rampage.id };
    return null;
  }

  /** action = { type:'move', idx } | { type:'switch', idx } | { type:'item', item, target, moveIdx } | { type:'run' } */
  playerAction(action) {
    if (this.state !== 'choose') return [];
    this.ev = [];
    this.turn++;
    const forced = this.forcedAction(0);
    let a = forced || action;
    if (a.type === 'run' && !this.wild) {
      this.turn--;
      return [{ t: 'msg', text: 'Impossible de fuir un combat de Dresseur !' }];
    }
    // attaque sans numéro ni identifiant : la première utilisable, ou Lutte s'il n'y a plus de PP
    if (a.type === 'move' && a.idx == null && a.id == null) { const u = this.usableMoves(0); a = u.length ? { type: 'move', idx: u[0] } : { type: 'move', id: 165 }; }
    if (a.type === 'move' && a.idx != null) {
      const mv = this.me.moves[a.idx];
      if (!this.usableMoves(0).length) a = { type: 'move', id: 165 };
      else if (!mv || mv.pp <= 0) { this.turn--; return [{ t: 'msg', text: 'Plus de PP pour cette attaque !' }]; }
      else a = { type: 'move', id: mv.id, slot: a.idx };
    }
    const b = this.foeChoose();
    // Méga-Évolutions du tour, avant toute attaque (dans le même ordre sur les deux écrans en duel)
    const wants = [!!action.mega && a.type === 'move', this.foeWantsMega(b)];
    for (const i of (this.eotOrder ? this.eotOrder() : [0, 1])) if (wants[i] && this.canMega(i)) this.doMega(i);
    this.resolve(a, b);
    return this.flush();
  }
  /** ce côté peut-il méga-évoluer maintenant ? (anneau, gemme de l'espèce, pas encore utilisée dans ce combat) */
  canMega(i) { const s = this.sides[i]; return !!s.mega && !s.megaUsed && !!megaFormOf(this.act(i)); }
  /** l'adversaire méga-évolue dès qu'il le peut, en attaquant */
  foeWantsMega(b) { return b?.type === 'move' && this.canMega(1); }
  doMega(i) {
    const m = this.act(i), before = this.Nm(i), trainer = i === 0 ? this.sides[0].name : (this.sides[1].trainer?.name || this.sides[1].name);
    const de = /^[AEIOUYÉÈÊÂÎÔH]/i.test(trainer) ? 'd\'' : 'de ';
    this.say(`${before} réagit au Méga-Anneau ${de}${trainer} !`);
    megaEvolve(m); this.sides[i].megaUsed = true;
    this.ev.push({ t: 'mega', side: i, sp: m.sp });
    this.say(`${before} méga-évolue en ${SPECIES[m.sp].n} !`);
    this.triggerEntry(i);   // un talent d'entrée (Sécheresse, Intimidation…) s'active comme à l'arrivée
  }

  /** après un K.O. du Pokémon du joueur : choix du suivant */
  playerSwitch(idx) {
    if (this.state !== 'switch') return [];
    this.ev = [];
    if (this.pendingFoe != null) { this.doSwitch(1, this.pendingFoe, true); this.pendingFoe = null; }
    this.doSwitch(0, idx, true);
    this.state = 'choose';
    return this.flush();
  }
  canSwitchTo(idx) { const m = this.sides[0].party[idx]; return m && m.hp > 0 && idx !== this.sides[0].active; }

  /* ---------------- IA ---------------- */
  foeChoose() {
    const forced = this.forcedAction(1); if (forced) return forced;
    const side = this.sides[1], m = this.foe, t = side.trainer;
    const usable = this.usableMoves(1);
    if (!usable.length) return { type: 'move', id: 165 };
    if (this.wild) { const k = usable[this.r(usable.length)]; return { type: 'move', id: m.moves[k].id, slot: k }; }

    const isSmart = t.ai === 'smart';
    const isRival = t.cls === 'Rival' || t.rival || this.rival;
    // 1. Utilisation stratégique des objets de soin par les Champions / Dresseurs
    if (t.items) {
      const ratio = m.hp / m.stats[0];
      const hasStatus = !!m.status;
      const isAceOrLast = !side.party.some((p, idx) => idx !== side.active && p.hp > 0);
      const healThreshold = (isSmart || isRival) ? (isAceOrLast ? 0.52 : 0.44) : 0.28;

      // Si altéré par un statut grave (sommeil, gel, poison, brûlure, paralysie) et qu'on a un Guérison
      if (hasStatus && t.items['full-restore'] > 0 && (ratio < 0.75 || this.rng() < 0.85)) {
        t.items['full-restore']--;
        return { type: 'item', item: 'full-restore', foe: true };
      }

      // Si les PV sont en zone critique, choisir le meilleur soin disponible
      if (ratio <= healThreshold) {
        const canUse = !isSmart ? this.rng() < 0.85 : true;
        if (canUse) {
          const needed = m.stats[0] - m.hp;
          let chosen = null;
          if (t.items['full-restore'] > 0 && (hasStatus || needed > 120)) chosen = 'full-restore';
          else if (t.items['hyper-potion'] > 0 && needed > 90) chosen = 'hyper-potion';
          else if (t.items['super-potion'] > 0 && needed > 35) chosen = 'super-potion';
          else if (t.items['potion'] > 0) chosen = 'potion';
          else if (t.items['hyper-potion'] > 0) chosen = 'hyper-potion';
          else if (t.items['full-restore'] > 0) chosen = 'full-restore';

          if (chosen) {
            t.items[chosen]--;
            return { type: 'item', item: chosen, foe: true };
          }
        }
      }
    }

    // 2. Évaluation tactique avancée des capacités (IA de très haut niveau)
    const playerMon = this.me;
    const playerType = SPECIES[playerMon.sp]?.t || ['normal'];
    const mySpeed = this.stat(1, 5);
    const playerSpeed = this.stat(0, 5);
    const amFaster = mySpeed >= playerSpeed;

    const scores = usable.map((k) => {
      const mv = MOVES[m.moves[k].id];
      let s = 10;
      if (mv.c !== 'status' && (mv.p > 0 || mv.m?.u)) {
        const mvType = this.moveType(1, mv);
        const eff = typeEff(mvType, playerType);

        // Si l'attaque n'a AUCUN effet (immunité de type), ne JAMAIS la choisir
        if (eff === 0) return { k, s: 0.0001 };

        const d = this.estimate(1, 0, mv);
        const acc = (mv.a || 100) / 100;
        s = d * acc;

        // KO stratégique : coup fatal prioritaire absolu
        if (d >= playerMon.hp) {
          s *= 3.8;
          // Si c'est une attaque prioritaire (+1) et qu'on est plus lent, énorme priorité de finition
          if (mv.pr && mv.pr > 0) s *= 5.0;
        }

        // Pénalités de contrecoup / recharge
        if (eff >= 2) s *= (eff >= 4 ? 1.75 : 1.35);
        if (mv.m?.recharge) s *= 0.5;
        if (mv.m?.boom) {
          s = (m.hp < m.stats[0] * 0.22 && d >= playerMon.hp) ? s * 1.5 : s * 0.04;
        }

        // Bonus STAB (même type que le lanceur)
        const myTypes = SPECIES[m.sp]?.t || [];
        if (myTypes.includes(mvType)) s *= 1.3;

        // Bonus d'apeurement si plus rapide
        if (mv.m?.flinch && amFaster) s *= 1.25;

        // Bonus coup critique
        if (mv.m?.crit) s *= 1.15;
      } else {
        // Capacités de statut
        const x = mv.m || {};

        // Soin
        if (x.heal || x.u === 'rest') {
          if (m.hp < m.stats[0] * 0.45) s = playerMon.stats[0] * 1.4;
          else if (m.hp < m.stats[0] * 0.65) s = playerMon.stats[0] * 0.55;
          else s = 0.001;
        }
        // Statut pénalisant (sommeil, paralysie, poison, brûlure)
        else if (x.ail && !['conf', 'seed', 'trap'].includes(x.ail)) {
          if (playerMon.status) {
            s = 0.001; // déjà altéré
          } else {
            const cannot = (x.ail === 'psn' && (playerType.includes('poison') || playerType.includes('steel'))) ||
                           (x.ail === 'brn' && playerType.includes('fire')) ||
                           (x.ail === 'par' && playerType.includes('electric'));
            if (cannot) s = 0.001;
            else s = playerMon.stats[0] * (x.ail === 'slp' ? 1.85 : 1.4);
          }
        }
        // Confusion
        else if (x.ail === 'conf') {
          s = this.sides[0].v.conf ? 0.001 : playerMon.stats[0] * 0.7;
        }
        // Vampigraine
        else if (x.ail === 'seed') {
          s = (this.sides[0].v.seed || playerType.includes('grass')) ? 0.001 : playerMon.stats[0] * 0.95;
        }
        // Boost de statistiques
        else if (x.st) {
          const turn = this.sides[1].v.turns;
          const isAtkBoost = x.st.some(([stat, amt]) => (stat === 1 || stat === 3) && amt > 0);
          const curStage = Math.max(this.sides[1].v.st[1] || 0, this.sides[1].v.st[3] || 0);
          if (curStage < 2 && m.hp >= m.stats[0] * 0.50) {
            s = isAtkBoost ? playerMon.stats[0] * 1.3 : playerMon.stats[0] * 0.85;
          } else {
            s = playerMon.stats[0] * 0.1;
          }
        }
        // Protection / Abri
        else if (mv.key === 'protect' || mv.key === 'detect') {
          if (this.sides[1].v.protChain > 0) s = 0.001;
          else if (this.sides[0].v.seed || playerMon.status === 'tox') s = playerMon.stats[0] * 1.0;
          else s = playerMon.stats[0] * 0.35;
        }
        else {
          s = playerMon.stats[0] * 0.2;
        }
      }
      return { k, s: Math.max(0.01, s) };
    });

    let pick;
    if (isSmart || isRival) {
      // Pour une IA très forte : prend TOUJOURS la décision la plus optimale
      pick = scores.reduce((a, b) => (b.s > a.s ? b : a));
    } else {
      const tot = scores.reduce((a, x) => a + x.s * x.s, 0);
      let r = this.rng() * tot;
      pick = scores[0];
      for (const x of scores) {
        r -= x.s * x.s;
        if (r <= 0) { pick = x; break; }
      }
    }
    return { type: 'move', id: m.moves[pick.k].id, slot: pick.k };
  }
  /** dégâts possibles d'une attaque du côté a sur le côté d, en % des PV max de la cible (sans coup critique),
   *  sans toucher au générateur aléatoire (les combats en réseau restent identiques des deux côtés) */
  damagePreview(a, d, moveId) {
    const mv = MOVES[moveId], T = this.act(d); if (!mv || !T || !T.stats) return null;
    if (mv.c === 'status' && !mv.m?.u) return null;
    const u = mv.m?.u, max = T.stats[0];
    const pct = (lo, hi) => ({ lo: Math.max(0, Math.floor(lo * 1000 / max) / 10), hi: Math.min(999, Math.ceil(hi * 1000 / max) / 10), lo0: lo, hi0: hi, ko: hi >= T.hp, sure: lo >= T.hp });
    const type = this.moveType(a, mv), eff = typeEff(type, SPECIES[T.sp].t);
    if (eff === 0) return { lo: 0, hi: 0, eff: 0 };
    const m = this.act(a);
    const fixed = u === 'dragon-rage' ? 40 : u === 'sonic-boom' ? 20 : u === 'seismic-toss' || u === 'night-shade' ? m.lvl : u === 'super-fang' ? Math.max(1, Math.floor(T.hp / 2)) : u === 'endeavor' ? Math.max(0, T.hp - m.hp) : null;
    if (u === 'psywave') return { ...pct(Math.floor(m.lvl * 0.5), Math.floor(m.lvl * 1.5)), eff: 1 };
    if (u === 'counter' || u === 'mirror-coat' || u === 'splash' || mv.m?.cat === 9) return null;
    if (fixed != null) return { ...pct(fixed, fixed), eff: 1 };
    let p = u === 'magnitude' ? 70 : u === 'present' ? 40 : this.movePower(a, d, mv);
    if (!p) return null;
    const x = mv.m || {}, hits = x.h0 ? [x.h0, x.h1 || x.h0] : [1, 1];
    const lo = this.damageCore(a, d, mv, p, type, false, 0.85) * hits[0], hi = this.damageCore(a, d, mv, p, type, false, 1) * hits[1];
    return { ...pct(lo, hi), eff };
  }
  estimate(a, d, mv) {
    const p = this.movePower(a, d, mv); if (!p) return mv.m?.u ? this.act(d).stats[0] * 0.2 : 0;
    const t = this.moveType(a, mv);
    return this.damageCore(a, d, mv, p, t, false, 0.92);
  }

  /* ---------------- résolution d'un tour ---------------- */
  resolve(a, b) {
    const acts = [{ i: 0, a }, { i: 1, a: b }];
    for (const s of this.sides) { s.v.flinch = false; s.v.dmgTaken = null; }
    // actions sans attaque d'abord
    for (const x of acts) {
      if (this.state === 'over') return;
      if (x.a.type === 'run') { if (this.tryRun()) return; x.done = true; }
      else if (x.a.type === 'switch') { this.doSwitch(x.i, x.a.idx, false, false); x.done = true; }
      else if (x.a.type === 'item') { if (this.useItem(x.i, x.a)) return; x.done = true; }
    }
    const switched = acts.filter((x) => x.a.type === 'switch');
    if (switched.length) {
      switched.sort((p, q) => this.stat(q.i, 5) - this.stat(p.i, 5) || this.tie(p, q));
      for (const x of switched) this.triggerEntry(x.i);
    }
    const movers = acts.filter((x) => !x.done);
    const prio = (x) => {
      if (x.a.type !== 'move') return 0;
      const mv = MOVES[x.a.id], id = this.ab(x.i);
      return mv.pr + ((id === 'prankster' && mv.c === 'status') || (id === 'gale-wings' && mv.t === 'flying') ? 1 : 0);
    };
    movers.sort((p, q) => prio(q) - prio(p) || this.stat(q.i, 5) - this.stat(p.i, 5) || this.tie(p, q));
    movers.forEach((x, n) => { x.first = n === 0 && movers.length === 2; });
    for (const x of movers) {
      if (this.state === 'over') return;
      if (isFainted(this.act(x.i))) continue;
      if (x.a.type === 'recharge') { this.say(`${this.Nm(x.i)} doit se recharger !`); this.sides[x.i].v.recharge = false; continue; }
      this.useMove(x.i, x.a, x.first);
      if (this.checkFaints()) break;
    }
    if (this.state !== 'over') this.endOfTurn();
  }

  tryRun() {
    if (!this.wild) { this.say('Impossible de fuir un combat de Dresseur !'); return false; }
    this.runTries++;
    if (this.ab(0) === 'run-away') { this.ev.push({ t: 'sfx', k: 'run' }); this.say('Vous prenez la fuite !'); this.end('run'); return true; }
    if ((this.ab(1) === 'shadow-tag' && this.ab(0) !== 'shadow-tag') || (this.ab(1) === 'arena-trap' && !SPECIES[this.me.sp].t.includes('flying') && this.ab(0) !== 'levitate')) {
      this.say(`${this.Nm(1)} empêche la fuite !`); return false;
    }
    const a = this.stat(0, 5), b = this.stat(1, 5);
    const f = Math.floor(a * 128 / b) + 30 * this.runTries;
    if (a >= b || f > 255 || this.r(256) < f) { this.ev.push({ t: 'sfx', k: 'run' }); this.say('Vous prenez la fuite !'); this.end('run'); return true; }
    this.say('Impossible de fuir !'); return false;
  }

  doSwitch(i, idx, afterFaint, trigger = true) {
    const side = this.sides[i];
    if (!afterFaint) { this.say(i === 0 ? `${monName(this.me)}, reviens !` : `${side.trainer.cls} ${side.trainer.name} rappelle ${monName(this.foe)} !`); this.ev.push({ t: 'recall', side: i }); }
    if (side.v.seed) { /* la graine part avec le Pokémon */ }
    { const out = this.act(i), id = this.ab(i);
      if (out && !isFainted(out) && id === 'natural-cure' && out.status) { out.status = null; out.slp = 0; out.tox = 0; }
      if (out && !isFainted(out) && id === 'regenerator') out.hp = Math.min(out.stats[0], out.hp + Math.floor(out.stats[0] / 3)); }
    side.active = idx; side.v = freshVol();
    this.ev.push({ t: 'send', side: i, idx });
    if (i === 0) { this.say(`En avant ! ${monName(this.me)} !`); this.participants.add(this.me.uid); }
    else { this.say(`${side.trainer.cls} ${side.trainer.name} envoie ${monName(this.foe)} !`); this.participants = new Set([this.me.uid]); }
    // un Pokémon ennemi pris au piège est libéré
    this.sides[1 - i].v.trap = 0;
    if (trigger) this.triggerEntry(i);
  }

  useItem(i, a) {
    if (i === 1) {
      const m = this.foe, t = this.sides[1].trainer, before = m.hp;
      applyItem(a.item, m);
      this.say(`${t.cls} ${t.name} utilise ${itemName(a.item)} !`);
      this.ev.push({ t: 'hp', side: 1, hp: m.hp, from: before });
      return false;
    }
    const it = ITEMS[a.item];
    this.bag[a.item] = (this.bag[a.item] || 0) - 1; if (this.bag[a.item] <= 0) delete this.bag[a.item];
    if (it.ball) return this.throwBall(a.item);
    const m = this.sides[0].party[a.target], before = m.hp;
    this.say(`Vous utilisez ${itemName(a.item)} !`);
    const msg = applyItem(a.item, m, a.moveIdx ?? -1);
    if (m.hp > 0) delete m._ko;
    if (a.target === this.sides[0].active) this.ev.push({ t: 'hp', side: 0, hp: m.hp, from: before, status: m.status });
    this.ev.push({ t: 'sfx', k: 'heal' });
    this.say(msg || 'Mais cela n\'a aucun effet...');
    return false;
  }

  throwBall(item) {
    this.say(`Vous lancez une ${itemName(item)} !`);
    if (!this.wild) { this.ev.push({ t: 'ball', item, blocked: true }); this.say('Le Dresseur dévie la Ball !'); this.say('Voler, c\'est mal !'); return false; }
    const m = this.foe, S = SPECIES[m.sp], max = m.stats[0];
    const st = m.status === 'slp' || m.status === 'frz' ? 2 : m.status ? 1.5 : 1;
    const a = Math.floor(((3 * max - 2 * m.hp) * S.cr * ITEMS[item].ball) / (3 * max) * st);
    let shakes = 0, caught = false;
    if (a >= 255 || ITEMS[item].ball >= 255) { shakes = 4; caught = true; }
    else {
      const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / Math.max(1, a))));
      while (shakes < 4 && this.r(65536) < b) shakes++;
      caught = shakes === 4;
    }
    this.ev.push({ t: 'ball', item, shakes: Math.min(3, shakes), caught });
    if (caught) {
      m.ball = item; m.status = m.status === 'frz' ? null : m.status;
      this.say(`Et hop ! ${monName(m)} est attrapé !`);
      this.end('caught');
      return true;
    }
    this.say(['Oh non ! La créature s\'est libérée !', 'Raaah ! Ça y était presque !', 'Aaaah ! Presque !', 'Mince ! Ça y était presque !'][shakes] || 'Raté !');
    return false;
  }

  moveType(i, mv) { return mv.m?.u === 'hidden-power' ? hiddenPower(this.act(i)).type : mv.t; }
  movePower(i, d, mv) {
    const u = mv.m?.u, m = this.act(i), t = this.act(d);
    if (u === 'hidden-power') return hiddenPower(m).power;
    if (u === 'flail' || u === 'reversal') { const p = Math.floor(48 * m.hp / m.stats[0]); return p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20; }
    if (u === 'low-kick') { const w = SPECIES[t.sp].w || 100; return w < 100 ? 20 : w < 250 ? 40 : w < 500 ? 60 : w < 1000 ? 80 : w < 2000 ? 100 : 120; }
    if (u === 'return') return 102;
    if (u === 'frustration') return 40;
    if (u === 'facade') return m.status ? 140 : 70;
    if (u === 'magnitude') return [10, 30, 50, 70, 90, 110, 150][[0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6][this.r(100)]];
    return mv.p || 0;
  }

  damageCore(a, d, mv, power, type, crit, rand) {
    const A = this.act(a), D = this.act(d);
    const phys = mv.c === 'physical';
    const aId = this.ab(a), dId = this.ab(d), x = mv.m || {};
    const atk = this.stat(a, phys ? 1 : 3, crit, true, dId === 'unaware'), def = this.stat(d, phys ? 2 : 4, crit, false, aId === 'unaware');
    let dmg = Math.floor(Math.floor(Math.floor(2 * A.lvl / 5 + 2) * power * atk / def) / 50);
    if (phys && A.status === 'brn' && aId !== 'guts') dmg = Math.floor(dmg / 2);
    const scr = this.sides[d].screens;
    if (!crit && ((phys && scr.reflect) || (!phys && scr.light))) dmg = Math.floor(dmg / 2);
    dmg += 2;
    if (crit) dmg *= 2;
    dmg = Math.floor(dmg * rand);
    const aAb = getAbility(A);
    const dAb = getAbility(D);
    // STAB (Adaptabilité = x2.0, standard = x1.5)
    if (SPECIES[A.sp].t.includes(type)) {
      dmg = Math.floor(dmg * (aAb?.id === 'adaptability' ? 2.0 : 1.5));
    }
    // Talents Starters / types sous 1/3 PV (+50%)
    if (A.hp <= A.stats[0] / 3) {
      if (type === 'fire' && aAb?.id === 'blaze') dmg = Math.floor(dmg * 1.5);
      if (type === 'water' && aAb?.id === 'torrent') dmg = Math.floor(dmg * 1.5);
      if (type === 'grass' && aAb?.id === 'overgrow') dmg = Math.floor(dmg * 1.5);
      if (type === 'bug' && aAb?.id === 'swarm') dmg = Math.floor(dmg * 1.5);
    }
    // Technicien (+50% si puissance <= 60)
    if (aAb?.id === 'technician' && power <= 60) {
      dmg = Math.floor(dmg * 1.5);
    }
    // autres talents de l'attaquant
    if (aId === 'iron-fist' && /punch|poing/.test(mv.key || '')) dmg = Math.floor(dmg * 1.2);
    if (aId === 'reckless' && x.drain < 0) dmg = Math.floor(dmg * 1.2);
    if (aId === 'sheer-force' && (x.ailc || x.stc || x.flinch)) dmg = Math.floor(dmg * 1.3);
    if (aId === 'sand-force' && this.weather === 'sandstorm' && ['rock', 'ground', 'steel'].includes(type)) dmg = Math.floor(dmg * 1.3);
    if (aId === 'sniper' && crit) dmg = Math.floor(dmg * 1.5);
    if (type === 'fire' && this.sides[a].v.flashFire) dmg = Math.floor(dmg * 1.5);
    // Objets tenus boostant un type (+20%)
    const typeBoosters = {
      fire: 'charcoal', water: 'mystic-water', grass: 'miracle-seed',
      electric: 'magnet', dark: 'black-glasses', rock: 'hard-stone',
      ground: 'soft-sand', flying: 'sharp-beak', fighting: 'black-belt',
      poison: 'poison-barb', psychic: 'twisted-spoon', bug: 'silver-powder',
      dragon: 'dragon-fang', ice: 'never-melt-ice', steel: 'metal-coat',
      normal: 'silk-scarf'
    };
    if (typeBoosters[type] && A.item === typeBoosters[type]) {
      dmg = Math.floor(dmg * 1.2);
    }
    if (A.item === 'life-orb') {
      dmg = Math.floor(dmg * 1.3);
    }
    // Météo sur les dégâts
    if (this.weather === 'rain') {
      if (type === 'water') dmg = Math.floor(dmg * 1.5);
      else if (type === 'fire') dmg = Math.floor(dmg * 0.5);
    } else if (this.weather === 'sun') {
      if (type === 'fire') dmg = Math.floor(dmg * 1.5);
      else if (type === 'water') dmg = Math.floor(dmg * 0.5);
    }
    // Efficacité des types
    const eff = this.effOn(a, d, type);
    dmg = Math.floor(dmg * eff);
    if (aId === 'tinted-lens' && eff > 0 && eff < 1) dmg *= 2;
    // Talents du défenseur
    if (dAb?.id === 'thick-fat' && (type === 'fire' || type === 'ice')) {
      dmg = Math.floor(dmg / 2);
    }
    if (dId === 'heatproof' && type === 'fire') dmg = Math.floor(dmg / 2);
    if (dId === 'dry-skin' && type === 'fire') dmg = Math.floor(dmg * 1.25);
    if ((dId === 'filter' || dId === 'solid-rock') && eff > 1) dmg = Math.floor(dmg * 0.75);
    if (dId === 'multiscale' && D.hp === D.stats[0]) dmg = Math.floor(dmg / 2);
    return Math.max(1, dmg);
  }

  hp(i, delta, cause) {
    const m = this.act(i), before = m.hp;
    m.hp = Math.max(0, Math.min(m.stats[0], m.hp + delta));
    if (m.hp !== before) this.ev.push({ t: 'hp', side: i, hp: m.hp, from: before, cause });
    // Sacoches de Pollen (Bourdonnet d'Hector) : une fois par combat, en passant sous la moitié de ses PV, il se soigne
    // d'un quart et gagne un cran de Vitesse
    const half = m.stats[0] / 2;
    if (m.hp > 0 && m.hp <= half && before > half && this.ab(i) === 'sacoches-pollen' && !(this.sacoches ||= new Set()).has(m.uid)) {
      this.sacoches.add(m.uid);
      this.say(`${this.Nm(i)} puise dans ses Sacoches de Pollen !`);
      this.hp(i, Math.max(1, Math.floor(m.stats[0] / 4)));
      this.boost(i, 6, 1);
    }
    return before - m.hp;
  }

  useMove(i, a, first) {
    const d = 1 - i, side = this.sides[i], v = side.v, m = this.act(i), mv = MOVES[a.id], x = mv.m || {};
    v.turns++; this.lastUser = i;
    // statuts qui empêchent d'agir
    if (m.status === 'frz') {
      if (this.r(5) === 0) { m.status = null; this.ev.push({ t: 'status', side: i, status: null }); this.say(`${this.Nm(i)} n'est plus gelé !`); }
      else { this.say(`${this.Nm(i)} est gelé !`); v.charge = null; v.rampage = null; return; }
    }
    if (m.status === 'slp') {
      m.slp -= this.ab(i) === 'early-bird' ? 2 : 1;
      if (m.slp <= 0) { m.status = null; this.ev.push({ t: 'status', side: i, status: null }); this.say(`${this.Nm(i)} se réveille !`); }
      else { this.ev.push({ t: 'anim', side: i, k: 'sleep' }); this.say(`${this.Nm(i)} dort profondément.`); v.charge = null; v.rampage = null; return; }
    }
    if (v.flinch && this.ab(i) !== 'inner-focus' && this.ab(i) !== 'coeur-vaillant') { this.say(`${this.Nm(i)} a peur ! Il ne peut pas attaquer !`); v.charge = null; return; }
    if (v.conf > 0) {
      v.conf--;
      if (v.conf === 0) this.say(`${this.Nm(i)} n'est plus confus !`);
      else {
        this.ev.push({ t: 'anim', side: i, k: 'confused' });
        this.say(`${this.Nm(i)} est confus !`);
        if (this.r(2) === 0) {
          const atk = this.stat(i, 1), def = this.stat(i, 2);
          const dmg = Math.max(1, Math.floor(Math.floor(Math.floor(2 * m.lvl / 5 + 2) * 40 * atk / def) / 50) + 2);
          this.say('Il se blesse dans sa confusion !');
          this.ev.push({ t: 'hit', side: i, eff: 1 });
          this.hp(i, -dmg); v.charge = null; v.rampage = null; return;
        }
      }
    }
    if (m.status === 'par' && this.r(4) === 0) { this.ev.push({ t: 'anim', side: i, k: 'para' }); this.say(`${this.Nm(i)} est paralysé ! Il n'a pas pu attaquer !`); v.charge = null; v.rampage = null; return; }

    // attaques en deux temps : premier tour
    if (x.charge && v.charge !== mv.id) {
      v.charge = mv.id;
      const slot = m.moves.findIndex((q) => q.id === mv.id); if (slot >= 0 && m.moves[slot].pp > 0) m.moves[slot].pp--;
      const txt = { 'solar-beam': 'absorbe la lumière !', 'razor-wind': 'se prépare !', 'sky-attack': 'est entouré d\'une lumière intense !', 'skull-bash': 'baisse la tête !', fly: 's\'envole !', dig: 's\'enfonce dans le sol !', dive: 'plonge !', bounce: 'saute très haut !' }[mv.key] || 'se concentre !';
      if (['fly', 'dig', 'dive', 'bounce'].includes(mv.key)) { v.invuln = mv.key; this.ev.push({ t: 'hide', side: i, on: true }); }
      if (mv.key === 'skull-bash') this.boost(i, 3, 1, true);
      this.say(`${this.Nm(i)} ${txt}`);
      return;
    }
    const charged = v.charge === mv.id; v.charge = null;
    if (v.invuln) { v.invuln = null; this.ev.push({ t: 'hide', side: i, on: false }); }

    // Absentéisme : un tour sur deux à paresser
    if (this.ab(i) === 'truant') { v.loaf = !v.loaf; if (!v.loaf) { this.say(`${this.Nm(i)} paresse !`); return; } }
    // PP (Pression : deux PP)
    if (!charged && !v.rampage && mv.id !== 165) { const slot = a.slot ?? m.moves.findIndex((q) => q.id === mv.id); if (slot >= 0 && m.moves[slot]) m.moves[slot].pp = Math.max(0, m.moves[slot].pp - (this.ab(d) === 'pressure' ? 2 : 1)); }
    this.say(`${this.Nm(i)} utilise ${mv.n} !`);
    if (mv.id === 165) { /* Lutte */ }
    if (x.rampage && !v.rampage) v.rampage = { id: mv.id, turns: 2 + this.r(2) };

    const T = this.act(d), tv = this.sides[d].v;
    const selfTarget = mv.tg === 7 || mv.tg === 4 || mv.tg === 13 || mv.tg === 5 || mv.tg === 12 || mv.tg === 6;
    // protection
    if (x.u === 'protect' || x.u === 'detect') {
      const ok = this.r(Math.pow(2, Math.min(4, v.protChain))) === 0;
      if (ok) { v.protect = true; v.protChain++; this.ev.push({ t: 'anim', side: i, k: 'protect' }); this.say(`${this.Nm(i)} se protège !`); }
      else { v.protChain = 0; this.say('Mais cela échoue !'); }
      return;
    }
    v.protChain = 0;
    if (!selfTarget && tv.protect) { this.say(`${this.Nm(d)} se protège !`); v.rampage = null; return; }
    if (!selfTarget && isFainted(T)) { this.say('Mais il n\'y a pas de cible...'); return; }

    // précision
    if (!selfTarget && !this.hits(i, d, mv)) {
      this.say(`${this.Nm(i)} rate son attaque !`); v.rampage = null;
      if (['jump-kick', 'high-jump-kick'].includes(mv.key)) { this.say(`${this.Nm(i)} s'écrase au sol !`); this.hp(i, -Math.floor(m.stats[0] / 8)); }
      return;
    }
    this.ev.push({ t: 'move', side: i, move: mv.id, type: this.moveType(i, mv) });

    if (!selfTarget && this.ab(d) === 'soundproof' && ['growl', 'roar', 'sing', 'supersonic', 'screech', 'snore', 'uproar', 'hyper-voice', 'bug-buzz', 'perish-song', 'metal-sound', 'grass-whistle', 'echoed-voice', 'round', 'chatter', 'boomburst', 'disarming-voice', 'snarl', 'noble-roar', 'parting-shot'].includes(mv.key)) { this.say(`Anti-Bruit protège ${this.nm(d)} !`); v.rampage = null; return; }
    // attaques à effet unique / sans dégâts directs
    if (this.special(i, d, mv)) { this.afterRampage(i); return; }

    if (mv.c === 'status') { this.statusMove(i, d, mv); return; }

    // dégâts
    const type = this.moveType(i, mv);
    const tAb = getAbility(T);
    // Immunités conférées par les talents passifs
    if (type === 'ground' && tAb?.id === 'levitate') {
      this.say(`Lévitation immunise ${this.nm(d)} contre les attaques Sol !`);
      v.rampage = null; return;
    }
    if (type === 'water' && tAb?.id === 'water-absorb') {
      this.say(`Absorb-Eau absorbe l'attaque et soigne ${this.nm(d)} !`);
      this.hp(d, Math.floor(T.stats[0] / 4));
      v.rampage = null; return;
    }
    if (type === 'electric' && tAb?.id === 'volt-absorb') {
      this.say(`Absorb-Volt absorbe l'électricité et soigne ${this.nm(d)} !`);
      this.hp(d, Math.floor(T.stats[0] / 4));
      v.rampage = null; return;
    }
    if (type === 'fire' && tAb?.id === 'flash-fire') {
      this.say(`Torche absorbe les flammes et renforce ${this.nm(d)} !`);
      tv.flashFire = true; v.rampage = null; return;
    }
    if (type === 'water' && tAb?.id === 'dry-skin') { this.say(`Peau Sèche absorbe l'eau et soigne ${this.nm(d)} !`); this.hp(d, Math.floor(T.stats[0] / 4)); v.rampage = null; return; }
    const absorb = { 'storm-drain': ['water', 4], 'lightning-rod': ['electric', 4], 'motor-drive': ['electric', 6], 'sap-sipper': ['grass', 2] }[tAb?.id];
    if (absorb && absorb[0] === type) { this.say(`${tAb.name} attire l'attaque vers ${this.nm(d)} !`); this.lastUser = d; this.boost(d, absorb[1], 1, true); v.rampage = null; return; }
    const eff = this.effOn(i, d, type);
    if (tAb?.id === 'wonder-guard' && eff <= 1 && this.fixedDamage(i, d, mv) == null) { this.say(`Garde Mystik protège ${this.nm(d)} !`); v.rampage = null; return; }
    if (eff === 0) { this.say(`Ça n'affecte pas ${this.nm(d)}...`); v.rampage = null; return; }
    if (x.cat === 9) {
      if (T.lvl > m.lvl || tAb?.id === 'sturdy') { this.say('Mais cela échoue !'); return; }
      this.ev.push({ t: 'hit', side: d, eff: 2 });
      this.hp(d, -T.hp); this.say('K.O. en un coup !'); return;
    }
    let hits = 1;
    if (x.h0) hits = x.h0 === x.h1 ? x.h0 : this.ab(i) === 'skill-link' ? x.h1 : x.h0 === 2 && x.h1 === 5 ? [2, 2, 2, 3, 3, 3, 4, 5][this.r(8)] : x.h0 + this.r(x.h1 - x.h0 + 1);
    let total = 0, n = 0, critAny = false;
    for (; n < hits; n++) {
      if (isFainted(T)) break;
      const noCrit = tAb?.id === 'battle-armor' || tAb?.id === 'shell-armor';
      const crit = !noCrit && this.r(16) < [1, 2, 4, 5, 8][Math.min(4, (x.crit || 0) + (this.ab(i) === 'super-luck' ? 1 : 0))];
      let p = this.movePower(i, d, mv);
      if (tv.invuln === 'dig' && ['earthquake', 'magnitude'].includes(mv.key)) p *= 2;
      let dmg = this.fixedDamage(i, d, mv);
      if (dmg == null) dmg = this.damageCore(i, d, mv, p, type, crit, (85 + this.r(16)) / 100);
      else if (eff === 0) dmg = 0;
      if (x.u === 'false-swipe' && dmg >= T.hp) dmg = T.hp - 1;
      // Fermeté & Ceinture Force (survie à 1 PV si PV au max)
      if (dmg >= T.hp && T.hp === T.stats[0]) {
        if (T.item === 'focus-sash') {
          dmg = T.hp - 1;
          T.item = null;
          this.say(`${this.Nm(d)} tient bon grâce à sa Ceinture Force !`);
        } else if (tAb?.id === 'sturdy') {
          dmg = T.hp - 1;
          this.say(`${this.Nm(d)} tient bon grâce à son talent Fermeté !`);
        }
      }
      dmg = Math.min(dmg, T.hp);
      this.ev.push({ t: 'hit', side: d, eff: this.fixedDamage(i, d, mv) != null ? 1 : eff, crit });
      this.hp(d, -dmg);
      tv.dmgTaken = { amount: dmg, c: mv.c };
      total += dmg; if (crit) { critAny = true; this.say('Coup critique !'); if (tAb?.id === 'anger-point' && !isFainted(T)) { this.say(`Colérique de ${this.nm(d)} monte son Attaque au maximum !`); this.sides[d].v.st[1] = 6; this.ev.push({ t: 'stat', side: d, up: true, all: this.stages() }); } }
    }
    if (this.fixedDamage(i, d, mv) == null) {
      if (eff > 1) this.say('C\'est super efficace !');
      else if (eff < 1) this.say('Ce n\'est pas très efficace...');
    }
    if (hits > 1) this.say(`Touché ${n} fois !`);
    // drain / recul
    if (x.drain > 0 && total > 0 && !isFainted(m)) { const h = Math.max(1, Math.floor(total * x.drain / 100)); if (this.hp(i, h)) this.say(`${this.Nm(d)} a perdu de l'énergie !`); }
    if (x.drain < 0 && total > 0 && this.ab(i) !== 'rock-head' && this.ab(i) !== 'magic-guard') { this.hp(i, -Math.max(1, Math.floor(total * -x.drain / 100))); this.say(`${this.Nm(i)} est blessé par le contrecoup !`); }
    // Recul de l'Orbe Vie
    if (m.item === 'life-orb' && total > 0 && !isFainted(m) && this.ab(i) !== 'magic-guard') {
      this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 10)));
      this.say(`L'Orbe Vie draine un peu d'énergie de ${this.nm(i)} !`);
    }
    // Effets au contact direct (attaques physiques)
    if (mv.c === 'physical' && total > 0 && !isFainted(T)) {
      if (T.item === 'rocky-helmet') {
        this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 6)));
        this.say(`Le Casque Brut de ${this.nm(d)} blesse ${this.nm(i)} !`);
      }
      if (tAb?.id === 'rough-skin') {
        this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 8)));
        this.say(`La Peau Dure de ${this.nm(d)} blesse ${this.nm(i)} !`);
      }
      if (tAb?.id === 'static' && this.r(100) < 30) {
        this.inflict(i, 'par', mv, true);
      }
      if (tAb?.id === 'flame-body' && this.r(100) < 30) {
        this.inflict(i, 'brn', mv, true);
      }
      if (tAb?.id === 'cire-brulante') {
        this.say(`La Cire Brûlante de ${this.nm(d)} jaillit !`);
        if (this.r(100) < 30) this.inflict(i, 'brn', mv, true);
        this.lastUser = d; this.boost(i, 6, -1, true);
      }
      if (tAb?.id === 'poison-point' && this.r(100) < 30) {
        this.inflict(i, 'psn', mv, true);
      }
      if (tAb?.id === 'iron-barbs') { this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 8))); this.say(`Épine de Fer de ${this.nm(d)} blesse ${this.nm(i)} !`); }
      if (tAb?.id === 'effect-spore' && this.r(100) < 30 && !SPECIES[m.sp].t.includes('grass')) this.inflict(i, ['psn', 'par', 'slp'][this.r(3)], mv, true);
      if (tAb?.id === 'gooey') { this.lastUser = d; this.boost(i, 6, -1, true); }
      if (tAb?.id === 'cute-charm' && this.r(100) < 30 && m.gender && T.gender && m.gender !== T.gender && !this.sides[i].v.conf) { this.sides[i].v.conf = 2 + this.r(4); this.say(`Joli Sourire de ${this.nm(d)} rend ${this.nm(i)} confus !`); }
      if (this.ab(i) === 'poison-touch' && this.r(100) < 30) this.inflict(d, 'psn', mv, true);
    }
    if (mv.c === 'physical' && total > 0 && isFainted(T) && tAb?.id === 'aftermath' && !isFainted(m)) { this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 4))); this.say(`Boom Final de ${this.nm(d)} blesse ${this.nm(i)} !`); }
    if (total > 0 && isFainted(T) && this.ab(i) === 'moxie') this.boost(i, 2, 1, true);
    this.checkBerries(d);
    this.checkBerries(i);
    if (mv.id === 165) { this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 4))); this.say(`${this.Nm(i)} est blessé par le contrecoup !`); }
    if (x.boom) this.hp(i, -m.hp);
    if (x.recharge && !isFainted(T)) v.recharge = true;
    else if (x.recharge) v.recharge = true;
    // effets secondaires
    const ch = (c) => (this.ab(i) === 'serene-grace' ? c * 2 : c), noSec = this.ab(i) === 'sheer-force' || (tAb?.id === 'shield-dust');
    if (!isFainted(T) && !noSec) {
      if (x.flinch && first && this.r(100) < ch(x.flinch)) {
        if (tAb?.id === 'inner-focus' || tAb?.id === 'coeur-vaillant') { /* Attention ou Cœur Vaillant : n'a pas peur */ }
        else { tv.flinch = true; if (tAb?.id === 'steadfast') { this.lastUser = d; this.boost(d, 6, 1, true); } }
      }
      if (x.ail && x.ailc && this.r(100) < ch(x.ailc)) this.inflict(d, x.ail, mv, true);
      if (x.st && x.stc && this.r(100) < ch(x.stc)) for (const [s, c] of x.st) this.boost(x.cat === 7 ? i : d, s, c, true);
    } else if (x.st && x.cat === 7 && x.stc && this.ab(i) !== 'sheer-force' && this.r(100) < ch(x.stc)) for (const [s, c] of x.st) this.boost(i, s, c, true);
    if (T.status === 'frz' && type === 'fire' && !isFainted(T)) { T.status = null; this.ev.push({ t: 'status', side: d, status: null }); this.say(`${this.Nm(d)} n'est plus gelé !`); }
    this.afterRampage(i);
  }
  afterRampage(i) {
    const v = this.sides[i].v; if (!v.rampage) return;
    v.rampage.turns--; if (v.rampage.turns <= 0) { v.rampage = null; if (!v.conf) { v.conf = 2 + this.r(4); this.say(`${this.Nm(i)} est épuisé et devient confus !`); } }
  }

  hits(i, d, mv) {
    const tv = this.sides[d].v, x = mv.m || {};
    if (tv.invuln) {
      const ok = (tv.invuln === 'fly' || tv.invuln === 'bounce') ? ['thunder', 'gust', 'twister', 'sky-uppercut'].includes(mv.key) : tv.invuln === 'dig' ? ['earthquake', 'magnitude', 'fissure'].includes(mv.key) : ['surf', 'whirlpool'].includes(mv.key);
      if (!ok) return false;
    }
    if (x.cat === 9) return this.r(100) < 30 + (this.act(i).lvl - this.act(d).lvl);
    if (mv.a == null || x.sure) return true;
    const ai = this.ab(i), di = this.ab(d);
    if (ai === 'no-guard' || di === 'no-guard') return true;
    const s = Math.max(-6, Math.min(6, this.sides[i].v.st[6] - (ai === 'unaware' ? 0 : this.sides[d].v.st[7])));
    let acc = mv.a * accMul(s);
    if (ai === 'compound-eyes') acc *= 1.3;
    if (ai === 'hustle' && mv.c === 'physical') acc *= 0.8;
    if ((di === 'sand-veil' && this.weather === 'sandstorm') || (di === 'snow-cloak' && this.weather === 'hail')) acc *= 0.8;
    if (di === 'tangled-feet' && this.sides[d].v.conf) acc *= 0.5;
    if (di === 'wonder-skin' && mv.c === 'status') acc = Math.min(acc, 50);
    return this.r(100) < acc;
  }

  fixedDamage(i, d, mv) {
    const u = mv.m?.u, m = this.act(i), T = this.act(d);
    if (u === 'dragon-rage') return 40;
    if (u === 'sonic-boom') return 20;
    if (u === 'seismic-toss' || u === 'night-shade') return m.lvl;
    if (u === 'super-fang') return Math.max(1, Math.floor(T.hp / 2));
    if (u === 'psywave') return Math.max(1, Math.floor(m.lvl * (5 + this.r(11)) / 10));
    if (u === 'endeavor') return Math.max(0, T.hp - m.hp);
    if (u === 'counter' || u === 'mirror-coat') { const t = this.sides[i].v.dmgTaken; return t && t.c === (u === 'counter' ? 'physical' : 'special') ? t.amount * 2 : 0; }
    return null;
  }

  special(i, d, mv) {
    const u = mv.m?.u, m = this.act(i), v = this.sides[i].v, T = this.act(d);
    if (!u) return false;
    switch (u) {
      case 'splash': this.say('Mais rien ne se passe !'); return true;
      case 'teleport': if (this.wild && i === 0) { this.say(`${this.Nm(i)} se téléporte !`); this.end('run'); } else if (this.wild) { this.say(`${this.Nm(i)} se téléporte !`); this.end('fled'); } else this.say('Mais cela échoue !'); return true;
      case 'rest':
        if (m.hp >= m.stats[0]) { this.say('Mais cela échoue !'); return true; }
        m.status = 'slp'; m.slp = 3; this.ev.push({ t: 'status', side: i, status: 'slp' });
        this.hp(i, m.stats[0]); this.say(`${this.Nm(i)} s'endort et récupère ses PV !`); return true;
      case 'belly-drum':
        if (m.hp <= m.stats[0] / 2) { this.say('Mais cela échoue !'); return true; }
        this.hp(i, -Math.floor(m.stats[0] / 2)); v.st[1] = 6; this.ev.push({ t: 'stat', side: i, up: true, all: this.stages() }); this.say(`${this.Nm(i)} sacrifie des PV et monte son Attaque au maximum !`); return true;
      case 'pain-split': { const avg = Math.floor((m.hp + T.hp) / 2); this.hp(i, avg - m.hp); this.hp(d, avg - T.hp); this.say('Les deux créatures partagent leur douleur !'); return true; }
      case 'haze': for (const s of this.sides) s.v.st = [0, 0, 0, 0, 0, 0, 0, 0]; this.ev.push({ t: 'stat', side: -1, all: this.stages() }); this.say('Les changements de stats sont annulés !'); return true;
      case 'reflect': case 'light-screen': {
        const k = u === 'reflect' ? 'reflect' : 'light', scr = this.sides[i].screens;
        if (scr[k]) { this.say('Mais cela échoue !'); return true; }
        scr[k] = 5; this.say(u === 'reflect' ? 'Protection augmente la résistance aux attaques physiques !' : 'Mur Lumière augmente la résistance aux attaques spéciales !'); return true;
      }
      case 'mist': case 'safeguard': { const scr = this.sides[i].screens; scr[u] = 5; this.say(u === 'mist' ? `${this.Nm(i)} s'entoure de brume !` : `${this.Nm(i)} est protégé par un voile mystique !`); return true; }
      case 'roar': case 'whirlwind':
        if (this.wild) { this.say(i === 0 ? `${this.Nm(d)} prend la fuite !` : 'Vous êtes renvoyé !'); this.end(i === 0 ? 'win-flee' : 'fled'); }
        else this.say('Mais cela échoue !');
        return true;
      case 'present':
        if (this.r(5) === 0) { this.hp(d, Math.floor(T.stats[0] / 4)); this.say(`${this.Nm(d)} récupère des PV !`); return true; }
        return false;
      default: return false;
    }
  }

  statusMove(i, d, mv) {
    const x = mv.m || {}, m = this.act(i), T = this.act(d);
    let did = false;
    if (x.cat === 3 || x.heal) {
      if (m.hp >= m.stats[0]) { this.say('Mais ses PV sont déjà au maximum !'); return; }
      this.hp(i, Math.max(1, Math.floor(m.stats[0] * (x.heal || 50) / 100))); this.say(`${this.Nm(i)} récupère des PV !`); return;
    }
    if (x.ail) {
      if (mv.key === 'thunder-wave' && SPECIES[T.sp].t.includes('ground')) { this.say(`Ça n'affecte pas ${this.nm(d)}...`); return; }
      did = this.inflict(d, x.ail, mv, false) || did;
    }
    if (x.st) {
      const tgt = mv.tg === 7 || x.st.every(([, c]) => c > 0) && mv.tg !== 10 && mv.tg !== 11 ? i : d;
      for (const [s, c] of x.st) did = this.boost(tgt, s, c, false) || did;
    }
    if (!x.ail && !x.st) this.say('Mais cela échoue !');
  }

  inflict(d, ail, mv, secondary) {
    const T = this.act(d), tv = this.sides[d].v, types = SPECIES[T.sp].t, scr = this.sides[d].screens;
    const fail = () => { if (!secondary) this.say('Mais cela échoue !'); return false; };
    if (isFainted(T)) return false;
    const tid = this.ab(d);
    if (ail === 'conf' && tid === 'own-tempo') return fail();
    if (ail === 'conf') {
      if (tv.conf) { if (!secondary) this.say(`${this.Nm(d)} est déjà confus !`); return false; }
      tv.conf = 2 + this.r(4); this.ev.push({ t: 'anim', side: d, k: 'confused' }); this.say(`${this.Nm(d)} devient confus !`); return true;
    }
    if (ail === 'seed') {
      if (types.includes('grass') || tv.seed) return fail();
      tv.seed = true; this.say(`${this.Nm(d)} est infecté !`); return true;
    }
    if (ail === 'trap') { if (!tv.trap) { tv.trap = 4 + this.r(2); this.say(`${this.Nm(d)} est pris au piège !`); } return true; }
    let st = ail;
    if (ail === 'psn' && mv.key === 'toxic') st = 'tox';
    if (T.status) { if (!secondary) this.say(T.status === st ? `${this.Nm(d)} ${STATUS_TXT[st].replace(/^est /, 'est déjà ').replace(/^s'est endormi/, 'dort déjà')}` : 'Mais cela échoue !'); return false; }
    if (scr.safeguard) return fail();
    if ((st === 'psn' || st === 'tox') && (types.includes('poison') || types.includes('steel'))) return fail();
    if (st === 'brn' && types.includes('fire')) return fail();
    if (st === 'frz' && types.includes('ice')) return fail();
    const immune = { limber: ['par'], insomnia: ['slp'], 'vital-spirit': ['slp'], immunity: ['psn', 'tox'], 'water-veil': ['brn'], 'magma-armor': ['frz'] }[tid];
    if ((immune && immune.includes(st)) || (tid === 'leaf-guard' && this.weather === 'sun')) { if (!secondary) this.say(`${getAbility(T).name} protège ${this.nm(d)} !`); return false; }
    T.status = st;
    if (st === 'slp') T.slp = 2 + this.r(4);
    if (st === 'tox') T.tox = 0;
    this.ev.push({ t: 'status', side: d, status: st });
    this.say(`${this.Nm(d)} ${STATUS_TXT[st]}`);
    if (st === 'slp') { tv.rampage = null; }
    // Synchro : le poison, la paralysie et la brûlure reviennent à l'envoyeur
    if (tid === 'synchronize' && ['psn', 'tox', 'par', 'brn'].includes(st) && !this._sync) {
      const src = 1 - d; if (!this.act(src).status) { this._sync = true; this.say(`Synchro de ${this.nm(d)} s'active !`); this.inflict(src, st === 'tox' ? 'psn' : st, mv, true); this._sync = false; }
    }
    return true;
  }

  /** s = identifiant de stat PokeAPI (2 Attaque … 6 Vitesse, 7 Précision, 8 Esquive) */
  boost(i, sid, c, secondary) {
    const v = this.sides[i].v, s = sid - 1, id = this.ab(i), byFoe = c < 0 && i !== this.lastUser;
    if (c < 0 && this.sides[i].screens.mist && i !== this.lastUser) { if (!secondary) this.say(`${this.Nm(i)} est protégé par la brume !`); return false; }
    if (byFoe && (id === 'clear-body' || id === 'white-smoke' || (id === 'hyper-cutter' && s === 1) || (id === 'coeur-vaillant' && s === 1) || (id === 'keen-eye' && s === 6) || (id === 'big-pecks' && s === 2))) {
      if (!secondary || sid === 2) this.say(`${getAbility(this.act(i)).name} de ${this.nm(i)} empêche la baisse !`); return false;
    }
    if (id === 'simple') c *= 2;
    if (id === 'contrary') c = -c;
    const before = v.st[s];
    v.st[s] = Math.max(-6, Math.min(6, v.st[s] + c));
    const name = STAGE_NAMES[s];
    if (v.st[s] === before) { if (!secondary) this.say(`${name[0].toUpperCase() + name.slice(1)} de ${this.nm(i)} ne peut plus ${c > 0 ? 'augmenter' : 'baisser'} !`); return false; }
    this.ev.push({ t: 'stat', side: i, up: c > 0, all: this.stages() });
    const amt = Math.abs(c) >= 2 ? (c > 0 ? 'beaucoup ' : 'beaucoup ') : '';
    this.say(`${name[0].toUpperCase() + name.slice(1)} de ${this.nm(i)} ${c > 0 ? 'augmente' : 'baisse'}${amt ? ' ' + amt.trim() : ''} !`);
    if (byFoe && c < 0 && (id === 'defiant' || id === 'competitive') && !this._defiant) { this._defiant = true; this.say(`${getAbility(this.act(i)).name} de ${this.nm(i)} s'active !`); this.boost(i, id === 'defiant' ? 2 : 4, 2, true); this._defiant = false; }
    return true;
  }

  /** ordre des effets de fin de tour (brûlure, poison, Vampigraine, piège) : redéfini pour les combats entre joueurs */
  eotOrder() { return [0, 1]; }
  endOfTurn() {
    for (const i of this.eotOrder()) {
      const m = this.act(i), v = this.sides[i].v;
      v.protect = false;
      if (isFainted(m)) continue;
      const ab = getAbility(m);
      const mg = ab?.id === 'magic-guard';
      if (ab?.id === 'poison-heal' && (m.status === 'psn' || m.status === 'tox')) { if (m.hp < m.stats[0]) { this.hp(i, Math.max(1, Math.floor(m.stats[0] / 8))); this.say(`Soin Poison soigne ${this.nm(i)} !`); } }
      else if (mg) { /* Garde Magik : pas de dégâts indirects */ }
      else if (m.status === 'brn') { this.ev.push({ t: 'anim', side: i, k: 'burn' }); this.say(`${this.Nm(i)} souffre de sa brûlure !`); this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 8))); }
      else if (m.status === 'psn') { this.ev.push({ t: 'anim', side: i, k: 'poison' }); this.say(`${this.Nm(i)} souffre du poison !`); this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 8))); }
      else if (m.status === 'tox') { m.tox = Math.min(15, (m.tox || 0) + 1); this.ev.push({ t: 'anim', side: i, k: 'poison' }); this.say(`${this.Nm(i)} souffre du poison !`); this.hp(i, -Math.max(1, Math.floor(m.stats[0] * m.tox / 16))); }
      if (isFainted(m)) continue;
      if (v.seed && !mg && !isFainted(this.act(1 - i))) { const dmg = this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 8))); this.ev.push({ t: 'anim', side: i, k: 'seed' }); this.say(`Vampigraine draine l'énergie de ${this.nm(i)} !`); this.hp(1 - i, dmg); }
      if (isFainted(m)) continue;
      if (v.trap > 0) { v.trap--; this.say(`${this.Nm(i)} est blessé par le piège !`); this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 16))); if (!v.trap) this.say(`${this.Nm(i)} est libéré !`); }
      if (isFainted(m)) continue;
      // Restes (Leftovers)
      if (m.item === 'leftovers' && m.hp < m.stats[0]) {
        const rec = Math.max(1, Math.floor(m.stats[0] / 16));
        this.hp(i, rec);
        this.say(`${this.Nm(i)} récupère un peu de PV grâce à ses Restes !`);
      }
      // Dégâts de météo (sauf types immunisés ou Garde Magik)
      const wImm = ['magic-guard', 'overcoat'].includes(ab?.id);
      if (this.weather === 'sandstorm' && !wImm && !['sand-veil', 'sand-rush', 'sand-force'].includes(ab?.id)) {
        const types = SPECIES[m.sp]?.t || [];
        if (!types.includes('rock') && !types.includes('ground') && !types.includes('steel')) {
          this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 16)));
          this.say(`${this.Nm(i)} est blessé par la tempête de sable !`);
        }
      } else if (this.weather === 'hail' && !wImm && !['ice-body', 'snow-cloak'].includes(ab?.id)) {
        const types = SPECIES[m.sp]?.t || [];
        if (!types.includes('ice')) {
          this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 16)));
          this.say(`${this.Nm(i)} est blessé par la grêle !`);
        }
      }
      // Talent Turbo
      if (ab?.id === 'speed-boost' && !isFainted(m)) {
        this.boost(i, 6, 1, true);
      }
      if (!isFainted(m)) {
        const heal = (f, txt) => { if (m.hp < m.stats[0]) { this.hp(i, Math.max(1, Math.floor(m.stats[0] * f))); this.say(txt); } };
        const w = this.weather;
        if (ab?.id === 'rain-dish' && w === 'rain') heal(1 / 16, `Cuvette soigne ${this.nm(i)} !`);
        if (ab?.id === 'ice-body' && w === 'hail') heal(1 / 16, `Corps Gel soigne ${this.nm(i)} !`);
        if (ab?.id === 'dry-skin' && w === 'rain') heal(1 / 8, `Peau Sèche soigne ${this.nm(i)} !`);
        if ((ab?.id === 'dry-skin' || ab?.id === 'solar-power') && w === 'sun') { this.hp(i, -Math.max(1, Math.floor(m.stats[0] / 8))); this.say(`${this.Nm(i)} souffre du soleil !`); }
        const cure = (ab?.id === 'shed-skin' && this.r(100) < 30) || (ab?.id === 'hydration' && w === 'rain');
        if (cure && m.status && !isFainted(m)) { m.status = null; m.slp = 0; m.tox = 0; this.ev.push({ t: 'status', side: i, status: null }); this.say(`${getAbility(m).name} guérit ${this.nm(i)} !`); }
      }
      this.checkBerries(i);
    }
    // Décompte de la météo
    if (this.weatherTurns > 0) {
      this.weatherTurns--;
      if (this.weatherTurns === 0 && this.weather !== 'none') {
        this.setWeather('none', 0);
      }
    }
    for (const s of this.sides) for (const k of Object.keys(s.screens)) { s.screens[k]--; if (s.screens[k] <= 0) { delete s.screens[k]; if (s.player || true) this.say(k === 'reflect' ? 'L\'effet de Protection prend fin.' : k === 'light' ? 'L\'effet de Mur Lumière prend fin.' : k === 'mist' ? 'La brume se dissipe.' : 'Le voile mystique disparaît.'); } }
    this.checkFaints();
  }

  /** gère les K.O. ; renvoie true si le tour doit s'arrêter */
  checkFaints() {
    let stop = false;
    const foe = this.foe;
    if (isFainted(foe) && !foe._ko) {
      foe._ko = true;
      this.ev.push({ t: 'faint', side: 1 });
      this.say(`${this.Nm(1)} est K.O. !`);
      this.awardExp(foe);
      stop = true;
    }
    const me = this.me;
    if (isFainted(me) && !me._ko) {
      me._ko = true;
      this.ev.push({ t: 'faint', side: 0 });
      this.say(`${monName(me)} est K.O. !`);
      stop = true;
    }
    if (!stop) return false;
    // fin du combat ?
    const foeLeft = this.sides[1].party.some((m) => m.hp > 0), meLeft = this.sides[0].party.some((m) => m.hp > 0);
    if (!meLeft) { this.loseBattle(); return true; }
    if (!foeLeft) { this.winBattle(); return true; }
    if (isFainted(this.foe)) {
      // Vérifier si le Champion n'a plus qu'un seul Pokémon (Tension d'Arène B2W2)
      const tr = this.sides[1].trainer;
      const aliveFoes = this.sides[1].party.filter((m) => m.hp > 0).length;
      if (tr && (tr.leader != null || tr.champion || tr.cls === 'Champion') && aliveFoes === 1 && !this.gymCrisisTriggered) {
        this.gymCrisisTriggered = true;
        this.ev.push({ t: 'gym-tension', foe: this.sides[1].party.find((m) => m.hp > 0), trainer: tr });
        this.say(`${tr.name} : « C'est mon dernier partenaire... Mais notre volonté est inébranlable ! »`);
      }
      // le dresseur envoie le suivant
      const side = this.sides[1], idx = side.party.findIndex((m) => m.hp > 0);
      if (isFainted(this.me)) { this.state = 'switch'; this.pendingFoe = idx; this.ev.push({ t: 'switch-prompt' }); return true; }
      this.doSwitch(1, idx, true);
    }
    if (isFainted(this.me)) { this.state = 'switch'; this.ev.push({ t: 'switch-prompt' }); }
    return true;
  }

  awardExp(foe) {
    const S = SPECIES[foe.sp], party = this.sides[0].party;
    const ps = party.filter((m) => this.participants.has(m.uid) && m.hp > 0);
    if (!ps.length) return;
    const base = Math.floor(((this.wild ? 1 : 1.5) * S.xp * foe.lvl) / (7 * ps.length));
    for (const m of ps) {
      const idx = party.indexOf(m);
      gainEffort(m, foe.sp);
      if (m.lvl >= 100) continue;
      if (m.lvl >= this.cap) {
        this.say(`${monName(m)} a atteint la limite de niveau actuelle (N.${this.cap}) !`);
        continue;
      }
      const amount = Math.max(1, base);
      const lv0 = m.lvl, p0 = this.expFrac(m);
      const steps = gainExp(m, amount, this.cap);
      this.say(`${monName(m)} gagne ${amount} points d'Exp. !`);
      this.ev.push({ t: 'exp', idx, from: p0, lv0, to: this.expFrac(m), lv: m.lvl, active: idx === this.sides[0].active });
      for (const st of steps) {
        this.levelUps.add(m.uid);
        this.ev.push({ t: 'level', idx, lvl: st.lvl, before: st.before, after: st.after, hp: m.hp, active: idx === this.sides[0].active });
        this.say(`${monName(m)} monte au niveau ${st.lvl} !`);
        for (const id of st.learned) { this.ev.push({ t: 'sfx', k: 'learn' }); this.say(`${monName(m)} apprend ${MOVES[id].n} !`); }
        for (const id of st.ask) this.ev.push({ t: 'ask-learn', idx, move: id });
      }
      if (m.lvl >= this.cap && steps.length) {
        this.say(`${monName(m)} atteint la limite de niveau actuelle (N.${this.cap}) !`);
      }
    }
  }
  expFrac(m) { return expProgress(m, this.cap); }

  winBattle() {
    const t = this.sides[1].trainer;
    if (t) {
      this.ev.push({ t: 'trainer-back' });
      this.say(`Vous avez battu ${t.cls} ${t.name} !`);
      if (t.lose) for (const l of [].concat(t.lose)) this.ev.push({ t: 'msg', text: l, speaker: t.name });
      const last = this.sides[1].party[this.sides[1].party.length - 1];
      this.prizeMoney = (t.prize || 20) * last.lvl;
      this.say(`Vous remportez ${this.prizeMoney} ₽ !`);
    }
    this.end('win');
  }
  loseBattle() {
    this.say('Vous n\'avez plus de créature en forme !');
    // combat amical (le premier contre le rival) : pas de panique ni d'argent perdu
    if (!this.sides[1].trainer?.friendly) this.say('Vous êtes pris de panique et perdez connaissance...');
    this.end('lose');
  }
  end(result) {
    this.state = 'over'; this.result = result;
    // fin du combat : chacun retrouve sa forme de base
    for (const s of this.sides) revertMegas(s.party);
    for (const s of this.sides) for (const m of s.party) delete m._ko;
    for (const m of this.sides[0].party) if (m.status === 'tox') m.status = 'psn';
    this.ev.push({ t: 'end', result });
  }
}
