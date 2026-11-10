// The Backrooms - Interface façon caméscope (REC, signal, bande), jumpscare et écran de fin
import { ENTITY_IMG, ENTITY_ANIM } from './scene.js';
import { DEPART_T, PIPES_LEVEL, CASSETTES, NOISE, VOICE_MIN, THIRST_BLUR, INV_SIZE, HOTEL_LEVEL } from '../engine/sim.js';

const GOAT_DEATH_IMG = new URL('../img/bouc.jpg', import.meta.url).href;
const GOAT_DEATH_FADE = 8; // secondes de montée de l'image

// nom affiché d'un niveau : le troisième, ce sont les Poolrooms (Level 37) ; le quatrième, les Tuyauteries (Level 2)
export const levelName = (lv) => (lv === 2 ? 37 : lv === PIPES_LEVEL ? 2 : lv === HOTEL_LEVEL ? 5 : lv);
// Poolrooms : le toboggan pris par l'équipe (ou null)
const slideOf = (sim) => (sim.map.slides && sim.slide >= 0 ? sim.map.slides[sim.slide] : null);
export const levelSub = (lv) => (lv === HOTEL_LEVEL ? 'The Terror Hotel' : lv === PIPES_LEVEL ? 'Pipe Dreams · the service tunnels' : lv === 2 ? 'The Poolrooms' : lv === 1 ? 'The industrial basement' : 'The Lobby');

// Les cassettes du Level 0 racontent une histoire : dix enregistrements, cinq par partie (toujours d'autres, selon la
// graine). Ceux qu'on a déjà écoutés restent dans la collection (sur cet appareil).
export const LORE = [
  'Safia Expedition, day three. The hum never stops. I counted the lights: forty-one. Then forty. Nobody turned one off.',
  "If you hear it, don't run. Running is the loudest thing you can do down here. Crouch. Wait. Let it pass.",
  'The elevators lie. One of them is a wall. You only find out once every tape is in your bag.',
  'There are lockers further down. I sat in one for an hour. It stood right outside the door. Breathing with me.',
  'Kevin went to check the noise behind the shelves. The noise was Kevin. Kevin was standing next to me.',
  "Almond water. Drink it slowly. It doesn't fix you. It just buys you a minute.",
  "Something whistled my name tonight. In my voice. I think I'm the one whistling.",
  "The goats hate the light. The big one, with the bell… the big one stopped caring.",
  'The pool rooms have three slides. Red, blue, yellow. Two of them take you home. Home is wrong now.',
  'If anyone finds this: the yellow slide. Take it. I never did. I stayed to keep the lights company.',
];
export const loreOf = (seed, id) => {
  // cinq enregistrements différents pour cette graine
  const order = LORE.map((_, i) => i).sort((a, b) => ((a * 7919 + seed * 104729) % 1009) - ((b * 7919 + seed * 104729) % 1009));
  return order[id % order.length];
};
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  },
};
export const tapesHeard = () => store.get('backrooms_lore', []);
export function hearTape(i) {
  const h = tapesHeard();
  if (!h.includes(i)) store.set('backrooms_lore', [...h, i]);
}
export { store };

// Les écrits des autres niveaux : ce qu'on trouve avec les fusibles (Level 1, Khaoula), les volants de vanne
// (Poolrooms, St Didier Auroux), les vannes (Pipe Dreams, Teo le bouc) et les lettres (Terror Hotel, le registre).
// Un par objet ramassé, dans un ordre qui dépend de la graine ; ceux qu'on a lus restent dans la collection.
export const NOTES = {
  1: { tag: 'SCRAWLED NOTE', list: [
    "Daesh Daesh Daesh.... My mission kill all white",
    "Nobody knows I'm here. Allah Akbar",
    'I keep the lights off so I can hear footsteps first. And I can cut the throat of the european people',
    "I'm not afraid anymore. I don't remember what that felt like. I just remember the hiding.",
    "If you don't love islam, just die.",
  ] },
  2: { tag: 'CARVED TILE', list: [
    'Before the water, there were only equations. St Didier Auroux wrote them down, and the water began to flow.',
    'He did not build the pools. He solved them.',
    'Every drop that falls here is a boundary condition. Every drowning is a solution he already knew.',
    'The thing in the water was his first draft. He never threw it away. He just stopped looking at it.',
    'Three slides, three answers. The Father of All Things knows which one is right. He will not tell you. He wants you to work it out.',
  ] },
  pipes: { tag: 'CHALK ON THE PIPES', list: [
    "Class of '34 field trip. Teacher said: don't touch anything. Teo took a key.",
    "Teo has a bell around his neck now. He says he didn't put it there.",
    'We count heads every morning. Twelve kids. Thirteen goats.',
    "The goats follow him. They hate the light. He doesn't, he just pretends.",
    "Don't follow the warm pipes. That's where he sleeps.",
  ] },
  hotel: { tag: 'GUEST REGISTER · 1934', list: [
    'Room 12 · Safia, explorer · arrived with maps · Key not returned.',
    'Room 14 · Khaoula · paid cash, asked for the room nearest the stairs · Key not returned.',
    'Room 9 · T., accompanied by goat · Key not returned.',
    'Room 13 · {name} · Key not returned.',
  ] },
};
export const FINAL_LORE = 'Every key you take keeps you here. Leave yours at the desk.';
export const notesHeard = (k) => store.get('backrooms_notes_' + k, []);
// le prochain écrit de ce niveau (i : combien d'objets on a déjà ramassés), marqué comme lu
export function readNote(k, seed, i) {
  const L = NOTES[k].list;
  const n = (i + (seed % L.length)) % L.length;
  const h = notesHeard(k);
  const isNew = !h.includes(n);
  if (isNew) store.set('backrooms_notes_' + k, [...h, n]);
  return { n, isNew };
}
export const loreComplete = () => tapesHeard().length >= LORE.length && Object.keys(NOTES).every((k) => notesHeard(k).length >= NOTES[k].list.length);


export class BackroomsHUD {
  constructor(container, actions = {}) {
    this.el = container;
    this.actions = actions;
    this.el.innerHTML = `
      <div class="jumpscare-overlay" id="jumpscareOverlay" hidden><img id="scareImg" alt=""><div class="scare-anim" id="scareAnim" hidden></div></div>
      <div class="goat-death" id="goatDeath" hidden>
        <div class="gd-pic" id="gdImg">
          <img class="gd-img" src="${GOAT_DEATH_IMG}" alt="">
          <img class="gd-img gd-red" src="${GOAT_DEATH_IMG}" alt="">
          <img class="gd-img gd-cyan" src="${GOAT_DEATH_IMG}" alt="">
          <div class="gd-grain" id="gdGrain"></div>
        </div>
        <div class="gd-vignette"></div>
      </div>

      <!-- Incrustations du caméscope -->
      <div class="cam cam-tl">
        <div class="vhs-rec"><span class="rec-dot">●</span> REC</div>
        <div class="vhs-play">PLAY ▶ SP</div>
        <div class="vhs-level" id="levelTag">LEVEL 0</div>
        <div class="blackout-tag" id="blackoutTag" hidden>⚠ POWER OUTAGE</div>
        <!-- l'équipe : soi d'abord, puis les autres (mort, déjà dans la cabine, en train de parler) -->
        <div class="team" id="team"></div>
      </div>
      <div class="cam cam-tr">
        <div class="battery" id="battery"><i></i></div>
        <div id="vhsTimer">00:00:00</div>
      </div>
      <div class="cam cam-bl">
        <div class="tape-date" id="tapeDate"></div>
        <!-- la soif : la gourde se vide peu à peu (plus vite en courant) -->
        <div class="stamina" id="stamina"><span>WATER</span><div class="stamina-track"><div class="stamina-bar" id="staminaBar"></div></div></div>
        <!-- le bruit qu'on fait (pas, course, voix, objets) : toujours affiché ; plus il monte, plus loin on l'entend -->
        <div class="noise" id="noise"><span>NOISE</span><div class="noise-track"><div class="noise-bar" id="noiseBar"></div></div></div>
        <div class="crouch-tag" id="crouchTag" hidden>▼ CROUCHED</div>
        <!-- les touches utiles, en petit, comme une ligne de plus de l'écran du caméscope -->
        <!-- la jauge du micro : un trait fin ; au-delà du repère, on t'entend (et l'entité aussi) -->
        <div class="mic-meter" id="micMeter" hidden><span id="micTxt">MIC</span><i><b id="micFill"></b></i></div>
        <div class="keys-tag" id="keysTag"></div>
      </div>
      <div class="cam cam-br">
        <div class="tapes"><span id="cassetteIcons"></span> <b id="cassetteText">0/${CASSETTES}</b></div>
        <div class="carry" id="carryTag" hidden></div>
        <div class="signal" id="signal"><b class="sig-arrow" id="signalArrow" hidden><svg viewBox="0 0 16 24" aria-hidden="true"><path d="M8 1 15 11H10.2V23H5.8V11H1Z"/></svg></b><span id="signalLabel">SIGNAL</span> <span id="signalBars">${'<i></i>'.repeat(5)}</span></div>
      </div>

      <!-- Au caméscope (V) : l'image passe en 4:3, et les bandes noires servent d'écrans : à gauche le signal des
           objectifs (plus fin qu'au petit indicateur), à droite les parasites (l'entité brouille la bande) et le mode nuit -->
      <!-- le zoom de l'objectif (molette) : la barre W ─── T, le temps de zoomer -->
      <div class="cam-zoom" id="camZoom"><span>W</span><i><b id="camZoomBar"></b></i><span>T</span><em id="camZoomX">×1.5</em></div>
      <div class="cam-bar cam-bar-l"><b class="sig-arrow cam-arrow" id="camArrow" hidden><svg viewBox="0 0 16 24" aria-hidden="true"><path d="M8 1 15 11H10.2V23H5.8V11H1Z"/></svg></b><small id="camSigLbl">SIGNAL</small><div class="cam-gauge" id="camSig">${'<i></i>'.repeat(10)}</div><small>TAPE</small></div>
      <div class="cam-bar cam-bar-r"><small class="cam-night" id="camNight">AUTO</small><div class="cam-gauge interf" id="camInt">${'<i></i>'.repeat(10)}</div><small>INTERF.</small></div>

      <!-- Dans un casier : les fentes de la porte, et le souffle retenu -->
      <div class="locker" id="locker" hidden><div class="locker-slits"></div><div class="locker-ui"><span id="lockerText">HOLD SHIFT TO HOLD YOUR BREATH · PRESS F TO GET OUT</span><div class="breath"><i id="breathBar"></i></div></div></div>
      <!-- Agrippé : se débattre -->
      <div class="grab" id="grab" hidden><b>BREAK FREE!</b><span id="grabText">MASH ANY KEY</span><div class="grab-bar"><i id="grabBar"></i></div></div>
      <div class="hurt" id="hurt"></div>
      <!-- Sous-titres (réglages) et enregistrements des cassettes -->
      <div class="captions" id="captions"></div>
      <div class="calib" id="calib" hidden><i></i><i></i><i></i><span>The left square should be barely visible</span></div>
      <div class="lore" id="lore" hidden><small id="loreTag"></small><p id="loreText"></p></div>

      <!-- Inventaire : la case 1 est réservée à la lampe torche, les suivantes aux piles, à l'eau d'amande, à l'échelle -->
      <div class="inv" id="inv">${Array.from({ length: INV_SIZE + 1 }, (_, i) => i).map((i) => `<button class="slot" data-slot="${i}"><b>${i + 1}</b><span></span></button>`).join('')}</div>

      <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
      <div class="crosshair"></div>

      <div class="objective-banner" id="objBanner"></div>
      <!-- Level 5 : la jauge de détection, la vue depuis la cachette, le clavier de la porte de secours -->
      <div class="detect" id="detect" hidden><span>👁</span><div class="detect-track"><i id="detectBar"></i></div></div>
      <div class="hide-view" id="hideView" hidden></div>
      <div class="keypad" id="keypad" hidden>
        <div class="keypad-box">
          <div class="keypad-title">FIRE ESCAPE</div>
          <div class="keypad-screen" id="keypadScreen">····</div>
          <div class="keypad-keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div>
          <div class="keypad-help">Type the code · Enter to confirm · Esc to step back</div>
        </div>
      </div>
      <!-- Fin d'équipe : l'ascenseur attend les autres, pas longtemps -->
      <div class="board-timer" id="boardTimer" hidden></div>
      <!-- Spectateur : à l'abri dans l'ascenseur, ou attrapé -->
      <div class="spectate" id="spectate" hidden><b id="specTitle"></b><span id="specSub"></span><small id="specHaunt"></small></div>
      <!-- Le rejeu de la mort, vu de sa tête -->
      <div class="voice-tag" id="voiceTag" hidden><span id="voiceOut"></span><i id="voiceBar"><b></b></i><span id="voiceIn"></span><span id="voiceLore"></span></div>
      <!-- Fondu : l'ascenseur descend, carte de l'étage -->
      <div class="fade" id="fade"><div><b id="fadeTitle"></b><span id="fadeSub"></span><div class="fade-bar" id="fadeBarBox" hidden><i id="fadeBar"></i></div></div></div>
      <div class="toast" id="toast" hidden></div>
      <!-- Ce que tu peux faire ici : ramasser, échanger, poser l'échelle ; la jauge d'équilibre sur une arête -->
      <div class="prompt" id="prompt" hidden><span id="promptText"></span><div class="beam" id="beamBar" hidden><b></b><i></i></div></div>
      <!-- Au poste de garde (Level 1) : l'incrustation de la caméra de surveillance regardée -->
      <div class="cctv" id="cctv" hidden><div class="cctv-tl"><b id="cctvCam"></b><span id="cctvName"></span></div><div class="cctv-tr"><span class="cctv-rec">●</span> REC</div><div class="cctv-bl" id="cctvClock"></div><div class="cctv-hint" id="cctvHint"></div></div>

      <!-- Pause : prendre le contrôle et choisir ses commandes -->
      <div class="click-prompt" id="clickPrompt">
        <div class="title-card" id="titleCard" hidden>
          <div class="tc-label"><b>THE BACKROOMS</b><span>FOUND FOOTAGE · TAPE 1 OF ?</span></div>
          <button class="tc-continue" id="btnContinue" hidden></button>
          <p class="tc-phones">🎧 BEST WITH HEADPHONES, LIGHTS OFF</p>
          <div class="tc-calib" id="tcCalib"><i></i><i></i><i></i><span>Brightness ⚙: the left square should be barely visible</span></div>
          <p class="tc-warn" id="tcWarn">This tape contains flashing lights, loud sounds and screen distortion. Settings ⚙ can reduce flashes and camera motion.</p>
        </div>
        <div class="pause-title" id="pauseTitle">II PAUSE</div>
        <div class="pause-go" id="pauseGo"></div>
        <div class="ctrl-choice">
          <span>CONTROLS</span>
          <button data-kb="0">MOUSE</button>
          <button data-kb="1">NO MOUSE</button>
        </div>
        <small id="pauseKeys"></small>
      </div>

      <!-- Écran de Fin (Mort ou Victoire) -->
      <div class="end-screen" id="endScreen" hidden>
        <div class="end-card">
          <div class="end-label"><small id="endTape">TAPE 1996 · DO NOT ERASE</small><h1 id="endTitle">YOU DIED</h1></div>
          <p id="endSubtitle">The entity caught you...</p>
          <div class="end-stats" id="endStats"></div>
          <div class="end-run" id="endRun"></div>
          <div class="end-lore" id="endLore"></div>
          <button class="btn-restart" id="btnRestart">PLAY AGAIN</button>
        </div>
      </div>
    `;

    this.$ = (s) => this.el.querySelector(s);
    // les éléments mis à jour à chaque image (on ne les recherche pas à chaque fois)
    this.E = {};
    for (const id of ['vhsTimer', 'battery', 'levelTag', 'cassetteIcons', 'cassetteText', 'objBanner', 'blackoutTag', 'fadeBar', 'spectate', 'specTitle', 'specSub', 'specHaunt', 'signal', 'signalBars', 'signalLabel', 'stamina', 'staminaBar', 'noise', 'noiseBar', 'crouchTag', 'carryTag', 'inv', 'toast', 'locker', 'lockerText', 'breathBar', 'grab', 'grabBar', 'grabText', 'hurt', 'captions', 'lore', 'loreText', 'loreTag', 'prompt', 'promptText', 'beamBar', 'camSigLbl', 'signalArrow', 'camArrow', 'camNight', 'boardTimer', 'camZoom', 'camZoomBar', 'camZoomX', 'team', 'cctv', 'cctvCam', 'cctvName', 'cctvClock', 'cctvHint']) this.E[id] = this.$('#' + id);
    this.barEls = [...this.E.signalBars.children];
    this.camSigEls = [...this.$('#camSig').children];
    this.camIntEls = [...this.$('#camInt').children];
    this.barEls.forEach((b, i) => (b.style.height = `${6 + i * 3}px`));
    this.sigShown = -1;
    this.sigT = 0;
    this.cache = {};
    this.invIdle = 0;
    this.$('#btnContinue').addEventListener('click', (e) => {
      e.stopPropagation();
      this.actions.resume?.();
    });
    // sauter l'écran de mort au bout de 3 s (clic ou touche)
    const skip = () => {
      if (this.endPending && performance.now() - this.endAt > 3000) this.endPending();
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    this.invKey = '';
    // une case : la lampe s'allume d'un appui ; une case d'objet se choisit (ou s'utilise si elle l'était déjà) au
    // relâcher, et un appui long (0,45 s) pose son objet par terre
    const inv = this.$('#inv');
    let hold = null;
    inv.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.slot');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      const i = +b.dataset.slot;
      if (i === 0) return this.actions.use?.(0);
      if (hold) clearTimeout(hold.t);
      hold = { i, t: setTimeout(() => { hold = null; this.actions.drop?.(i); }, 450) };
    });
    inv.addEventListener('pointerup', (e) => {
      if (!hold) return;
      e.stopPropagation();
      clearTimeout(hold.t);
      const i = hold.i;
      hold = null;
      this.actions.use?.(i);
    });
    for (const ev of ['pointercancel', 'pointerleave']) inv.addEventListener(ev, () => {
      if (hold) clearTimeout(hold.t);
      hold = null;
    });
    this.$('#clickPrompt').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-kb]');
      if (b) this.actions.setKbMode?.(b.dataset.kb === '1');
      else this.actions.play?.();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !this.$('#endScreen').hidden && !e.repeat) this.$('#btnRestart').click();
    });
    this.applyMonsters();

    // date du caméscope, figée en 1996 comme une vieille cassette retrouvée
    const d = new Date();
    this.$('#tapeDate').textContent = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.1996`;
    this.bannerT = 9;
    this.lastCount = -1;
    this.toastT = 0;
  }

  // le texte d'un élément, seulement s'il change
  text(id, v) {
    if (this.cache[id] === v) return;
    this.cache[id] = v;
    this.E[id].textContent = v;
  }

  // une classe d'un élément, seulement si elle change
  flag(id, cls, on) {
    const k = id + '.' + cls;
    if (this.cache[k] === on) return;
    this.cache[k] = on;
    this.E[id].classList.toggle(cls, on);
  }

  show(id, on) {
    const k = id + '!';
    if (this.cache[k] === on) return;
    this.cache[k] = on;
    this.E[id].hidden = !on;
  }

  update(sim, time, dt = 1 / 60) {
    const P = sim.player;
    const E = this.E;

    // 1. Compteur de bande, pile de la lampe (la batterie du caméscope)
    const totalSec = Math.floor(time);
    this.text('vhsTimer', `${String(Math.floor(totalSec / 3600)).padStart(2, '0')}:${String(Math.floor(totalSec / 60) % 60).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`);
    const bat = Math.round(P.battery ?? 100);
    if (this.cache.bat !== bat) {
      this.cache.bat = bat;
      E.battery.style.setProperty('--b', Math.max(0.04, bat / 100).toFixed(3));
    }
    this.flag('battery', 'low', bat < 20);

    // 1 bis. L'équipe, en haut à gauche : réécrite seulement quand quelque chose change
    this.teamList(sim, P);

    // 2. Objectif de l'étage : 5 cassettes (Level 0), 3 fusibles à rapporter au monte-charge (Level 1), 3 volants
    // (Level 37), 4 vannes (Level 2), 6 lettres à poster (Level 5)
    const L5 = sim.level === HOTEL_LEVEL;
    const L1 = sim.level === 1 || sim.level === 2;
    const L37 = sim.level === 2;
    const PIPES = sim.level === PIPES_LEVEL;
    const got = L5 ? sim.posted : PIPES ? sim.valves : L1 ? sim.fuses : sim.cassettes;
    const total = L5 ? 6 : PIPES ? 4 : L1 ? 3 : CASSETTES;
    const delivered = sim.delivered || 0;
    const objKey = `${sim.level}:${got}:${delivered}:${sim.open}:${sim.slide}:${sim.codeShown}:${(P.letters || []).length}:${sim.word}`;
    if (objKey !== this.lastCount) {
      this.lastCount = objKey;
      this.text('levelTag', `LEVEL ${levelName(sim.level)}`);
      this.floorShown = -1;
      // Level 5 : une case par lettre, dans l'ordre des chambres ; postée, sa lettre s'affiche
      E.cassetteIcons.innerHTML = L5
        ? (sim.map.letters || []).map((Lt) => `<i class="letter${Lt.posted ? ' on' : P.letters.includes(Lt.id) ? ' carry' : ''}">${Lt.posted ? sim.word[Lt.idx] || '?' : P.letters.includes(Lt.id) ? '✉' : ''}</i>`).join('')
        : Array.from({ length: total }, (_, i) => `<i class="${i < (sim.level === 1 ? delivered : got) ? 'on' : i < got ? 'half' : ''}${L1 ? ' fuse' : ''}"></i>`).join('');
      this.text('cassetteText', `${sim.level === 1 ? delivered : got}/${total}`);
      this.bannerT = 6;
      const banner = E.objBanner;
      banner.classList.toggle('unlocked', sim.open);
      let b;
      if (L5) {
        const carry = (P.letters || []).length;
        b = sim.open
          ? 'THE FIRE ESCAPE IS OPEN: EVERYONE GET OUT'
          : sim.codeShown
          ? 'LOOK UP AT THE LOBBY CEILING · TYPE THE CODE ON THE FIRE ESCAPE KEYPAD'
          : carry
          ? `${carry} LETTER${carry > 1 ? 'S' : ''} IN YOUR POCKET · POST ${carry > 1 ? 'THEM' : 'IT'} IN THE LOBBY MAILBOXES`
          : got === 0
          ? 'LEVEL 5 · 6 LETTERS ARE HIDDEN IN THE ROOMS · HIDE UNDER BEDS AND IN WARDROBES (E), CROUCH (C)'
          : `LETTER ${got}/6 POSTED`;
      } else if (sim.open && L37) b = slideOf(sim) ? `EVERYONE INTO THE ${slideOf(sim).name} SLIDE · THE OTHERS ARE SHUT` : 'THE PUMPS STOPPED · THE SLIDES ARE OPEN: RED, YELLOW OR BLUE, EACH ONE LEADS SOMEWHERE ELSE';
      else if (sim.open) b = PIPES ? 'THE STEAM IS OFF: THE SERVICE ELEVATOR IS OPEN · EVERYONE GET IN' : L1 ? 'THE FREIGHT ELEVATOR HAS POWER: EVERYONE GET IN' : 'ONLY ONE OF THE TWO ELEVATORS OPENED… THE OTHER ONE IS JUST A WALL NOW · FOLLOW THE RED ARROW';
      else if (L37) b = got === 0 ? 'LEVEL 37 · FIND THE 3 VALVE WHEELS IN THE PUMP ROOMS' : `VALVE WHEEL ${got}/3 RECOVERED`;
      else if (PIPES) {
        const dark = (sim.map.breakers || []).some((x) => !x.done && (sim.map.valves[x.sector] || {}).power === 2);
        b = got === 0 ? 'LEVEL 2 · CLOSE THE 4 STEAM VALVES IN THE BOILER ROOMS · STAY IN THE LIGHT' : `VALVE ${got}/4 CLOSED` + (dark ? ' · A SECTOR WENT DARK: RESET ITS BREAKER (ELECTRICAL)' : '');
      } else if (L1 && delivered >= total) b = 'ALL FUSES IN · STAY AT THE PANEL TO RESTART THE FREIGHT ELEVATOR · IT WILL BE LOUD';
      else if (L1 && got > delivered) b = `FUSE IN YOUR POCKET · BRING IT TO THE FREIGHT ELEVATOR PANEL (${delivered}/3 IN)`;
      else if (L1) b = got === 0 ? 'LEVEL 1 · FIND THE 3 FUSES IN THE AISLES' : `FUSE ${got}/3 RECOVERED`;
      else b = got === 0 ? `FIND THE ${CASSETTES} VHS TAPES · THE SIGNAL GETS STRONGER AS YOU GET CLOSER` : `TAPE ${got}/${CASSETTES} RECOVERED`;
      banner.textContent = b;
    }
    this.bannerT -= dt;
    this.flag('objBanner', 'hide', this.bannerT <= 0);
    this.show('blackoutTag', sim.blackout > 0);
    // compte à rebours de l'équipe : dehors, il faut courir ; dedans, on regarde les autres arriver
    const bt = sim.departT > 0 ? 0 : sim.boardT || 0;
    this.show('boardTimer', bt > 0 && sim.state === 'playing');
    if (bt > 0) {
      const sec = Math.ceil(bt);
      const out = sim.players.filter((p) => p.status === 'alive').length;
      const sl = slideOf(sim);
      const what = sl ? 'THE SLIDE' : 'THE ELEVATOR';
      E.boardTimer.textContent = P.status === 'alive' ? `GET TO ${what} · DOORS CLOSE IN ${sec}s` : `WAITING FOR ${out} · DOORS CLOSE IN ${sec}s`;
      E.boardTimer.classList.toggle('urgent', bt <= 10);
    }

    // 2a. Trajet en ascenseur : barre de chargement ; à l'arrivée, la carte de l'étage (même si l'annonce s'est perdue)
    if (this.fadeRide) {
      const k = sim.departT > 0 ? 1 - sim.departT / DEPART_T : 1;
      E.fadeBar.style.width = `${Math.round(k * 100)}%`;
      if (!(sim.departT > 0)) {
        this.fadeRide = false;
        if (sim.state === 'playing') this.fade(`LEVEL ${levelName(sim.level)}`, levelSub(sim.level), 2.2);
        else this.$('#fade').classList.remove('on');
      }
    }

    // 2b. Spectateur : dans l'ascenseur ou attrapé, on regarde ceux qui sont encore dehors
    const spec = P.status !== 'alive' && sim.state === 'playing';
    this.show('spectate', spec);
    if (spec) {
      const view = sim.viewPlayer(sim.spectate || 0);
      const inside = sim.players.filter((p) => p.status === 'elevator').length;
      const sl = slideOf(sim);
      this.text('specTitle', sim.departT > 0 ? (sl ? 'DOWN THE SLIDE…' : L5 ? 'DOWN THE STAIRS…' : 'THE DOORS ARE CLOSING…') : P.status === 'elevator' ? (sl ? `YOU'RE IN THE ${sl.name} SLIDE` : L5 ? 'YOU REACHED THE FIRE ESCAPE' : "YOU'RE IN THE ELEVATOR") : sim.goats ? 'THE HERD GOT YOU' : 'THE ENTITY GOT YOU');
      this.text('specSub', sim.departT > 0 ? '' : `${inside}/${sim.players.length} safe · watching ${view.name}${view !== P ? ' · click or Space: switch' : ''}`);
      // on peut encore aider (ou piéger) ceux qui sont dehors
      const canHaunt = view !== P && sim.departT <= 0 && sim.hasMonster && !sim.goats;
      const wait = Math.ceil(this.hauntWait || 0);
      this.text('specHaunt', !canHaunt ? '' : wait > 0 ? `The other side needs ${wait}s…` : `E: make their light flicker · T: knock further on (it will come)`);
    }

    // 3. Signal de l'objectif le plus proche (25 m) : il tremble quatre fois par seconde, pas à chaque image ; rien
    // pendant une coupure
    this.sigT -= dt;
    if (this.sigT <= 0) {
      this.sigT = 0.25;
      const bars = Math.round((P.signal || 0) * 5);
      const shown = bars > 0 && Math.random() < 0.25 ? Math.max(0, bars - 1 + (Math.random() < 0.3 ? 2 : 0)) : bars;
      const n = Math.min(5, shown);
      if (n !== this.sigShown) {
        this.sigShown = n;
        this.barEls.forEach((b, i) => b.classList.toggle('on', i < n));
      }
      // la jauge du caméscope : dix crans, plus fine
      if (this.camOn) {
        const s10 = Math.round((P.signal || 0) * 10);
        const m = Math.min(10, s10 > 0 && Math.random() < 0.3 ? s10 + (Math.random() < 0.5 ? -1 : 1) : s10);
        this.camSigEls.forEach((b, i) => b.classList.toggle('on', i < m));
      }
    }
    const noSig = !(P.signal > 0);
    this.text('signalLabel', noSig ? 'NO SIGNAL' : L5 ? (sim.open ? 'FIRE ESCAPE' : P.sigTo === 'keypad' ? 'KEYPAD' : P.sigTo === 'mail' ? 'MAILBOXES' : 'LETTER') : P.sigTo === 'stairs' ? 'STAIRS' : P.sigTo === 'key' ? 'KEY' : P.sigTo === 'ladder' ? 'LADDER' : L37 && sim.open ? 'SLIDE' : sim.open || (sim.level === 1 && delivered >= total) || (sim.level === 1 && !(sim.map.fuses || []).some((f) => !f.taken)) ? (sim.level === 1 ? 'FREIGHT ELEVATOR' : 'ELEVATOR') : 'SIGNAL');
    this.flag('signal', 'none', noSig);
    if (this.camOn) this.text('camSigLbl', this.E.signalLabel.textContent.replace('FREIGHT ', ''));
    // Level 0, tout trouvé : une flèche montre la direction du vrai ascenseur (ou de l'escalier, de la clé qui y mène)
    const arrow = sim.level === 0 && sim.open && P.status === 'alive' && P.sigX !== undefined && !noSig;
    this.show('signalArrow', arrow);
    this.show('camArrow', arrow && this.camOn);
    if (arrow) {
      const want = Math.atan2(-(P.sigX - P.x), -(P.sigZ - P.z));
      const rel = Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw));
      const deg = `rotate(${(-rel * 180) / Math.PI}deg)`;
      this.E.signalArrow.style.transform = deg;
      if (this.camOn) this.E.camArrow.style.transform = deg;
    }
    if (sim.floors.length > 1 && this.floorShown !== P.floor) {
      this.floorShown = P.floor;
      this.text('levelTag', `LEVEL ${levelName(sim.level)} · ${P.floor ? 'LOWER' : 'UPPER'} FLOOR`);
    }

    // 4. La soif : la gourde, discrète tant qu'elle est pleine, bien visible quand elle baisse, rouge sous le seuil
    // où la vue se brouille
    const wt = Math.round(P.water ?? 100);
    if (this.cache.st !== wt) {
      this.cache.st = wt;
      E.staminaBar.style.width = `${Math.max(0, Math.min(100, wt))}%`;
    }
    this.flag('staminaBar', 'low', wt < THIRST_BLUR);
    this.flag('stamina', 'idle', wt >= 60);
    this.show('stamina', P.status === 'alive');
    // 4a. Le bruit qu'on fait : celui que l'entité peut entendre (l'hôte le compte ; on y ajoute tout de suite ses
    // propres pas et sa voix, sans attendre l'hôte). Une aiguille de vumètre : elle monte vite, retombe doucement
    const voice = this.micRaw >= VOICE_MIN ? 0.1 + this.micRaw * 1.1 : 0;
    const step = !P.moving ? 0 : P.running ? NOISE.run : P.crouch ? NOISE.crouch : NOISE.walk;
    const nz = P.status === 'alive' ? Math.max(P.noise || 0, step, voice) : 0;
    const want = Math.min(1, nz / 1.2);
    this.noiseLv = want > (this.noiseLv || 0) ? want : Math.max(want, (this.noiseLv || 0) - dt * 0.9);
    // une barre continue (transform : rien à remettre en page), blanche, puis ambre, puis rouge quand ça s'entend loin
    const lv = Math.round(this.noiseLv * 400) / 400;
    if (this.cache.nz !== lv) {
      this.cache.nz = lv;
      E.noiseBar.style.transform = `scaleX(${lv})`;
      const tone = lv >= 0.72 ? 'noise-bar hot' : lv >= 0.4 ? 'noise-bar warm' : 'noise-bar';
      if (E.noiseBar.className !== tone) E.noiseBar.className = tone;
    }
    this.show('noise', P.status === 'alive');
    this.show('crouchTag', !!P.crouch && P.status === 'alive');
    // Level 1 : les fusibles en poche
    const carry = P.carry ? P.carry.length : P.carryN || 0;
    this.show('carryTag', carry > 0);
    if (carry > 0) this.text('carryTag', `${'▮'.repeat(carry)} FUSE${carry > 1 ? 'S' : ''} IN POCKET`);

    // 4b. Inventaire (il s'efface quand on ne s'en sert pas)
    const inv = P.inv || [];
    const slotsKey = `${inv.join(',')}|${P.hasLamp ? 1 : 0}${P.flashlight ? 1 : 0}|${P.sel}`;
    if (slotsKey !== this.invKey) {
      this.invKey = slotsKey;
      this.invIdle = 0;
      E.inv.querySelectorAll('.slot').forEach((b, i) => {
        if (i === 0) {
          b.classList.toggle('full', !!P.hasLamp);
          b.classList.toggle('lamp-on', !!P.flashlight);
          b.classList.add('lamp-slot');
          b.querySelector('span').innerHTML = P.hasLamp ? `<i class="ico-lamp"></i>${P.flashlight ? 'ON' : 'OFF'}` : 'LAMP';
          return;
        }
        const k = inv[i - 1];
        b.classList.toggle('full', !!k);
        b.classList.toggle('sel', P.sel === i);
        b.querySelector('span').innerHTML = k === 'battery' ? '<i class="ico-bat"></i>BATTERY' : k === 'bottle' ? '<i class="ico-bot"></i>WATER' : k === 'ladder' ? '<i class="ico-ladder"></i>LADDER' : '';
      });
    }
    this.invIdle += dt;
    this.flag('inv', 'idle', this.invIdle > 5 && !document.body.classList.contains('touch'));

    // 4c. Casier, prise, coup de chèvre
    const hidden = P.hidden >= 0 && P.status === 'alive';
    this.show('locker', hidden);
    if (hidden) {
      const br = Math.round(P.breath ?? 100);
      if (this.cache.br !== br) {
        this.cache.br = br;
        E.breathBar.style.width = `${br}%`;
      }
      this.flag('locker', 'holding', !!P.holding);
      this.text('lockerText', P.holding ? (br < 30 ? "YOU CAN'T HOLD IT MUCH LONGER…" : 'HOLDING YOUR BREATH…') : 'HOLD SHIFT TO HOLD YOUR BREATH · PRESS F TO GET OUT');
    }
    const grabbed = P.grabT > 0 && P.status === 'alive';
    this.show('grab', grabbed);
    if (grabbed) {
      const need = 8 + (sim.difficulty === 'hard' ? 3 : 0);
      E.grabBar.style.width = `${Math.min(100, ((P.struggle || 0) / need) * 100)}%`;
      this.text('grabText', document.body.classList.contains('touch') ? 'TAP THE SCREEN AS FAST AS YOU CAN' : 'MASH ANY KEY');
    }
    const hurt = (P.hurt || 0) > 0 && P.status === 'alive';
    this.flag('hurt', 'on', hurt);

    // 4d. Invite : ce que la touche fait ici
    this.prompt(sim, P);

    // 4e. Level 5 : jauge de détection, vue depuis la cachette
    const det = this.$('#detect');
    det.hidden = !L5 || P.status !== 'alive';
    if (!det.hidden) {
      const v = Math.max(0, Math.min(1, P.detect || 0));
      this.$('#detectBar').style.width = `${Math.round(v * 100)}%`;
      det.classList.toggle('hot', v > 0.6);
      det.classList.toggle('hidden-on', P.hidden >= 0);
    }
    const hv = this.$('#hideView');
    const sp = L5 && P.hidden >= 0 && sim.map.spots ? sim.map.spots[P.hidden] : null;
    hv.hidden = !sp || P.status !== 'alive';
    if (sp) hv.className = `hide-view ${sp.kind}`;
    if (this.keypadOpen && (!L5 || P.status !== 'alive' || sim.open)) this.closeKeypad();
    // 4f. Au poste de garde : la caméra regardée (son numéro, son nom), l'heure qui défile, les touches
    const cams = sim.map.cams;
    const cctv = !!(P.desk && P.status === 'alive' && cams && cams.length);
    this.show('cctv', cctv);
    if (this.cache.cctvOn !== cctv) {
      this.cache.cctvOn = cctv;
      this.el.classList.toggle('cctv-on', cctv);
    }
    if (cctv) {
      const i = (P.camSel || 0) % cams.length;
      const two = (n) => String(n).padStart(2, '0');
      this.text('cctvCam', `CAM ${two(i + 1)}/${two(cams.length)}`);
      this.text('cctvName', cams[i].name);
      const t = Math.floor(time) + 3 * 3600 + 17 * 60;
      this.text('cctvClock', `${this.$('#tapeDate').textContent}  ${two(Math.floor(t / 3600) % 24)}:${two(Math.floor(t / 60) % 60)}:${two(t % 60)}`);
      const k = this.keyNames(this.qwerty);
      this.text('cctvHint', document.body.classList.contains('touch') ? 'SLIDE ◄ ► TO SWITCH CAMERA · TAP F TO STAND UP' : `◄ ${k.l} / ${k.r} ► OR WHEEL · SWITCH CAMERA · F · STAND UP`);
    }

    // 5. Messages passagers, sous-titres, enregistrement
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) E.toast.hidden = true;
    }
    if (this.loreT > 0) {
      this.loreT -= dt;
      if (this.loreT <= 0) E.lore.hidden = true;
    }
    for (const c of [...E.captions.children]) {
      c.t -= dt;
      if (c.t <= 0) c.remove();
    }
  }

  // un sous-titre (réglage) : dir : 'left' | 'right' | 'behind' | 'ahead' | null
  caption(text, dir = null) {
    const box = this.E.captions;
    for (const c of box.children) if (c.dataset.text === text) {
      c.t = 2.6;
      return;
    }
    const el = document.createElement('div');
    el.dataset.text = text;
    const arrow = { left: '◀ ', right: '', behind: '▼ ', ahead: '▲ ' }[dir] || '';
    el.textContent = `${arrow}[${text}]${dir === 'right' ? ' ▶' : ''}`;
    el.t = 2.6;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
  }

  // l'enregistrement d'une cassette, en sous-titre de bande
  showLore(n, text, isNew, tag = 'TAPE') {
    this.E.loreTag.textContent = n == null ? tag : `${tag} #${String(n + 1).padStart(2, '0')}${isNew ? ' · NEW' : ''}`;
    this.E.loreText.textContent = `“${text}”`;
    this.E.lore.hidden = false;
    this.loreT = 3 + text.length / 16;
  }

  // la liste de l'équipe : soi d'abord ; ✕ attrapé (il revient à l'étage suivant), ▼ déjà parti dans la cabine ou
  // le toboggan, ))) parle dans le talkie (ou au micro, pour soi)
  teamList(sim, P) {
    const el = this.E.team;
    if (!el) return;
    const ps = [P, ...sim.players.filter((Q) => Q !== P)];
    const talk = this.talkIds || new Set();
    const selfTalk = (this.micRaw || 0) > VOICE_MIN;
    const row = (Q) => {
      const st = Q.status === 'dead' ? 'dead' : Q.status === 'elevator' ? 'gone' : 'alive';
      return [Q.id, Q.name, st, Q === P ? selfTalk : talk.has(Q.id)];
    };
    const rows = ps.map(row);
    const key = rows.map((r) => r.join(':')).join('|');
    if (key === this.teamKey) return;
    this.teamKey = key;
    const esc = (t) => String(t || '?').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    el.innerHTML = rows.map(([, name, st, talking], i) => {
      const mark = st === 'dead' ? '✕' : st === 'gone' ? '▼' : '●';
      return `<div class="mate ${st}${i === 0 ? ' me' : ''}${talking ? ' talk' : ''}"><i>${mark}</i><span>${esc(name).toUpperCase()}</span>${talking ? '<s>)))</s>' : ''}</div>`;
    }).join('');
  }

  // la voix : ce qu'on émet (VOICE à côté de soi, RADIO dans le talkie) et qui parle dans le talkie
  voice(v, sim, multi, dead = false) {
    this.micRaw = v && v.micState === 'on' ? v.raw || 0 : 0; // la voix compte dans la jauge de bruit
    this.keysLine(sim, multi);
    this.micMeter(v, sim, multi);
    const el = this.$('#voiceTag');
    if (!el) return;
    const mode = v.mode;
    if (dead) {
      // coupure : on appuie sur le talkie, il ne se passe rien
      el.hidden = false;
      el.classList.add('radio');
      this.$('#voiceOut').textContent = 'RADIO · NO SIGNAL';
      this.$('#voiceBar').hidden = true;
      this.$('#voiceIn').textContent = '';
      this.$('#voiceLore').textContent = this.loreTxt = '';
      return;
    }
    const ids = v.talking();
    this.talkIds = new Set(ids);
    const names = ids.map((id) => {
      const Q = sim.players.find((q) => q.id === id);
      return Q ? Q.name : null;
    }).filter(Boolean);
    // une voix perdue sur le canal : sa transcription s'écrit au rythme de la voix
    const lore = v.loreLine ? v.loreLine() : null;
    const loreTxt = lore ? `RADIO ▸ ${lore.text.slice(0, lore.shown)}${lore.shown < lore.text.length ? '▌' : ''}` : '';
    if (loreTxt !== this.loreTxt) {
      this.loreTxt = loreTxt;
      this.$('#voiceLore').textContent = loreTxt;
    }
    const show = mode === 2 || names.length > 0 || !!lore;
    el.hidden = !show;
    if (!show) return;
    el.classList.toggle('radio', mode === 2);
    this.$('#voiceOut').textContent = mode === 2 ? '● RADIO' : '';
    this.$('#voiceBar').hidden = true; // le niveau est sur la jauge MIC
    this.$('#voiceIn').textContent = names.length ? `RADIO · ${names.join(', ').toUpperCase()}` : '';
  }

  // le rappel des touches : interagir, utiliser, et le talkie à plusieurs (la voix de proximité n'a pas de touche)
  // Le caméscope (V) : les incrustations (REC, compteur, coins du viseur, signal) n'apparaissent qu'avec lui, calées
  // dans l'image 4:3 ; ses bandes noires affichent le signal et les parasites. c : { t, night, bars } de la scène
  camera(c, sim, dt = 1 / 60) {
    const on = c.t > 0.5;
    if (on !== this.camOn) {
      this.camOn = on;
      this.el.classList.toggle('camcorder', on);
      this.sigShown = -1;
    }
    const bx = Math.round(c.bars);
    if (bx !== this.camBx) {
      this.camBx = bx;
      this.el.style.setProperty('--bx', `${bx}px`);
      this.el.classList.toggle('cam-wide', bx >= 64);
    }
    if (!on) return;
    this.intT = (this.intT || 0) - dt;
    if (this.intT > 0) return;
    this.intT = 0.12;
    // les parasites : l'entité brouille la bande quand elle approche (rien au prélude, rien chez les chèvres)
    const M = sim.monster;
    const d = sim.hasMonster && !sim.goats && M && !M.away ? M.danger || 0 : 0;
    const n = Math.min(10, Math.round(d * 10 + (d > 0.05 ? (Math.random() - 0.3) * 2.2 : Math.random() < 0.05 ? 1 : 0)));
    if (n !== this.intShown) {
      this.intShown = n;
      this.camIntEls.forEach((b, i) => b.classList.toggle('on', i < n));
    }
    const P = sim.player;
    const night = (P.battery ?? 100) <= 0 ? 'NO IR' : c.night > 0.5 ? 'NIGHT' : 'AUTO';
    this.text('camNight', night);
    this.flag('camNight', 'on', night === 'NIGHT');
  }

  // le zoom de l'objectif (molette) : la barre W ─── T et le grossissement, affichés le temps de zoomer
  camZoom(z, lo, hi) {
    const k = Math.max(0, Math.min(1, Math.log(z / lo) / Math.log(hi / lo)));
    this.E.camZoomBar.style.width = `${Math.round(k * 100)}%`;
    this.text('camZoomX', `×${z < 9.95 ? z.toFixed(1) : Math.round(z)}`);
    this.E.camZoom.classList.add('on');
    clearTimeout(this.zoomT);
    this.zoomT = setTimeout(() => this.E.camZoom.classList.remove('on'), 1600);
  }

  keysLine(sim, multi) {
    const el = this.$('#keysTag');
    if (!el) return;
    const P = sim.player;
    const on = !!P && P.status === 'alive' && P.hidden < 0 && !document.body.classList.contains('touch');
    const k = on ? `${multi ? 1 : 0}` : '';
    if (k === this.keysK) return;
    this.keysK = k;
    el.hidden = !on;
    if (!on) return;
    // la lampe part éteinte : sa touche vient en premier
    const keys = [['1', 'LAMP'], ['F', 'INTERACT'], ['E', 'USE'], ['G', 'DROP'], ['SPACE', 'JUMP'], ['C', 'CROUCH'], ['V', 'CAMCORDER']];
    if (multi) keys.push(['R', 'RADIO']);
    el.innerHTML = keys.map(([key, what]) => `<span><kbd>${key}</kbd>${what}</span>`).join('');
  }

  // la jauge du micro : un trait fin qui suit la voix. Sous le repère (un murmure), rien ne part ; au-dessus, on
  // t'entend (elle aussi) et le trait s'affirme ; tout en haut, il rougit. Visible dès que le micro est ouvert.
  micMeter(v, sim, multi) {
    const el = this.$('#micMeter');
    if (!el) return;
    const P = sim.player;
    const st = v ? v.micState : 'off';
    const on = !!P && P.status === 'alive' && !document.body.classList.contains('touch') && (st === 'on' || (multi && st === 'denied'));
    el.hidden = !on;
    if (!on) { this.micK = ''; return; }
    if (st === 'denied') {
      if (this.micK !== 'denied') {
        this.micK = 'denied';
        el.className = 'mic-meter off';
        this.$('#micTxt').textContent = 'MIC OFF';
        this.$('#micFill').style.width = '0%';
      }
      return;
    }
    const lv = Math.max(0, Math.min(1, v.raw || 0));
    const w = Math.round(lv * 40) * 2.5; // par pas de 2,5 % : assez fin, sans réécrire le style à chaque image
    const state = v.mode === 0 ? 'quiet' : lv >= 0.8 ? 'loud' : 'heard';
    const k = `${w}|${state}`;
    if (k === this.micK) return;
    this.micK = k;
    el.className = `mic-meter ${state}`;
    this.$('#micTxt').textContent = 'MIC';
    this.$('#micFill').style.width = `${w}%`;
  }

  // calibrage de la luminosité : trois carrés presque noirs, éclaircis comme l'image du jeu
  calibrate(v, quiet = false) {
    const el = this.$('#calib');
    const lv = [4, 12, 26];
    for (const box of [el, this.$('#tcCalib')]) {
      box.querySelectorAll('i').forEach((sq, i) => {
        const c = Math.round(255 * Math.pow(lv[i] / 255, 1 / v));
        sq.style.background = `rgb(${c},${c},${c})`;
      });
    }
    if (quiet) return;
    el.hidden = false;
    clearTimeout(this.calibT);
    this.calibT = setTimeout(() => (el.hidden = true), 2500);
  }

  // touche choisie par le joueur : ZQSD (AZERTY) ou WASD (QWERTY)
  keyNames(qwerty) {
    return qwerty ? { move: 'WASD', l: 'A', r: 'D', f: 'W' } : { move: 'ZQSD', l: 'Q', r: 'D', f: 'Z' };
  }

  // ce que fait F devant une commande du Level 1
  controlText(c) {
    if (c.kind === 'alarm') return 'PRESS F · BREAK THE GLASS · THE BELL WILL DRAW IT THERE';
    if (c.kind === 'desk') return 'PRESS F · SIT AT THE GUARD POST · WATCH THE CAMERAS';
    const d = c.obj;
    if (d.broken) return 'THE SHUTTER IS TORN OPEN · IT WILL NEVER CLOSE AGAIN';
    const up = d.dir < 0 || (d.dir === 0 && d.o < 1);
    return up ? 'PRESS F · RAISE THE SHUTTER (SLOW AND LOUD)' : 'PRESS F · LOWER THE SHUTTER';
  }

  prompt(sim, P) {
    const NAME = { bottle: 'ALMOND WATER', battery: 'BATTERIES', ladder: 'THE LADDER' };
    let text = '';
    let beam = null;
    if (P.status === 'alive' && sim.state === 'playing' && !(sim.departT > 0)) {
      const N = sim.fm(P.floor).niche;
      const nicheCas = N && sim.allCassettes.find((c) => c.id === N.cas);
      {
        if (P.onBeam) {
          // barre d'équilibre : le repère penche avec toi, Q et D le ramènent au milieu
          text = 'BALANCE · Z TO MOVE FORWARD, Q / D TO STEADY YOURSELF';
          beam = P.tilt || 0;
        }
        const it = sim.nearItem(P);
        const sel = P.inv[P.sel - 1];
        const h = P.hidden < 0 && sim.nearHide ? sim.nearHide(P) : null;
        // Level 1 : le boîtier d'un quai, un déclencheur d'alarme, le fauteuil du poste (s'ils passent avant le reste)
        const ctl = sim.level === 1 && sim.controlFor ? sim.controlFor(P, it, h) : null;
        const E1 = sim.level === 1 && sim.map.exit;
        const atPanel = E1 && !sim.powered && (sim.delivered || 0) >= 3 && Math.hypot(E1.x - P.x, E1.z - P.z) < 2.6;
        if (P.grabT > 0 || P.hidden >= 0) {
          // la prise et le casier ont leur propre affichage
        } else if (beam !== null) {
          // rien d'autre sur l'arête
        } else if (N && !N.ladder && sel === 'ladder' && Math.hypot(N.baseX - P.x, N.baseZ - P.z) < 2.2) text = 'PRESS E · PLACE THE LADDER UNDER THE TAPE';
        else if (sim.inCabin && sim.inCabin(P) && sim.fm(P.floor).elevator) text = sim.liftT > 0 ? 'THE DOORS ARE CLOSING…' : 'PRESS F · PRESS THE BUTTON TO GO DOWN';
        else if (sim.nearCassette && sim.nearCassette(P)) text = 'PRESS F · TAKE THE TAPE';
        else if (P.desk) {
          // au poste : l'incrustation de la caméra dit les touches
        } else if (ctl) text = this.controlText(ctl);
        else if (it) text = P.inv.includes(null) ? `PRESS F · PICK UP ${NAME[it.kind]}` : `PRESS F · SWAP ${NAME[sel || 'bottle']} (SLOT ${P.sel + 1}) FOR ${NAME[it.kind]}`;
        else if (h) text = 'PRESS F · HIDE IN THE LOCKER';
        else if (sim.nearKey && sim.nearKey(P)) text = 'PRESS F · TAKE THE STAIRWELL KEY';
        else if (sim.lockedDoorNear && sim.lockedDoorNear(P)) text = 'LOCKED · FIND THE STAIRWELL KEY ON THIS FLOOR';
        else if (atPanel) text = `RESTARTING THE FREIGHT ELEVATOR… ${Math.round((sim.panel || 0) * 100)}% · STAY HERE`;
        else if (N && !N.ladder && nicheCas && !nicheCas.collected && Math.hypot(N.baseX - P.x, N.baseZ - P.z) < 2.6) text = 'THE TAPE IS TOO HIGH: YOU NEED A LADDER';
        else if (sim.level === HOTEL_LEVEL) text = this.hotelPrompt(sim, P);
        // ce qu'on tient servirait maintenant : assoiffé avec de l'eau d'amande, la lampe presque vide avec des piles
        else if (sel === 'bottle' && (P.water ?? 100) < 50) text = 'PRESS E · DRINK THE ALMOND WATER';
        else if (sel === 'battery' && P.hasLamp && P.battery < 35) text = 'PRESS E · CHANGE THE BATTERIES';
      }
    }
    if (this.qwerty) text = text.replace('Z TO MOVE FORWARD, Q / D', 'W TO MOVE FORWARD, A / D');
    this.show('prompt', !!text);
    if (text) this.text('promptText', text);
    this.show('beamBar', beam !== null);
    if (beam !== null) {
      const mark = this.E.beamBar.querySelector('i');
      mark.style.left = `${50 + beam * 50}%`;
      mark.classList.toggle('danger', Math.abs(beam) > 0.6);
    }
  }

  // Level 5 : ce que fait E ici (sortir de sa cachette, poster ses lettres, le clavier, se cacher)
  hotelPrompt(sim, P) {
    const m = sim.map;
    if (P.hidden >= 0) return m.spots[P.hidden].kind === 'bed' ? '[E] CRAWL OUT FROM UNDER THE BED' : '[E] STEP OUT OF THE WARDROBE';
    const mb = m.mailbox;
    if (Math.abs(P.x - mb.x) < 1.6 && P.z > mb.z0 - 0.6 && P.z < mb.z1 + 0.6) return P.letters.length ? `[E] POST ${P.letters.length > 1 ? `THE ${P.letters.length} LETTERS` : 'THE LETTER'}` : 'MAILBOXES · ONE PER ROOM';
    if (!sim.open && Math.hypot(P.x - m.keypad.x, P.z - m.keypad.z) < 1.5) return '[E] USE THE KEYPAD';
    for (const sp of m.spots) {
      const d = Math.min(Math.hypot(sp.out.x - P.x, sp.out.z - P.z), Math.hypot(sp.x - P.x, sp.z - P.z) - 0.6);
      if (d < 1.45) return sp.kind === 'bed' ? '[E] HIDE UNDER THE BED' : '[E] HIDE IN THE WARDROBE';
    }
    return '';
  }

  // Level 5 : le pavé numérique de la porte de secours (4 chiffres)
  openKeypad(onSubmit, onKey) {
    this.keypadOpen = true;
    this.keypadCode = '';
    this.keypadSubmit = onSubmit;
    this.keypadBeep = onKey;
    const el = this.$('#keypad');
    el.hidden = false;
    el.classList.remove('wrong');
    this.drawKeypad();
    if (!this.keypadBound) {
      this.keypadBound = true;
      el.querySelectorAll('button').forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          this.keypadPress(b.dataset.k);
        };
      });
      el.onclick = (e) => {
        if (e.target === el) this.closeKeypad();
      };
    }
  }

  keypadKey(e) {
    if (/^(Digit|Numpad)\d$/.test(e.code)) this.keypadPress(e.code.slice(-1));
    else if (e.code === 'Backspace') this.keypadPress('C');
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.keypadPress('OK');
    else if (e.code === 'Escape' || e.code === 'KeyE') this.closeKeypad();
  }

  keypadPress(k) {
    if (!this.keypadOpen) return;
    if (this.keypadBeep) this.keypadBeep();
    this.$('#keypad').classList.remove('wrong');
    if (k === 'C') this.keypadCode = this.keypadCode.slice(0, -1);
    else if (k === 'OK') {
      if (this.keypadCode.length === 4 && this.keypadSubmit) this.keypadSubmit(this.keypadCode);
      return;
    } else if (this.keypadCode.length < 4) this.keypadCode += k;
    this.drawKeypad();
  }

  drawKeypad() {
    this.$('#keypadScreen').textContent = (this.keypadCode + '····').slice(0, 4);
  }

  keypadWrong() {
    const el = this.$('#keypad');
    el.classList.add('wrong');
    this.keypadCode = '';
    this.$('#keypadScreen').textContent = 'ERR ';
  }

  closeKeypad() {
    if (!this.keypadOpen) return;
    this.keypadOpen = false;
    this.$('#keypad').hidden = true;
  }

  toast(text, secs = 2.5) {
    const t = this.$('#toast');
    t.textContent = text;
    t.hidden = false;
    this.toastT = secs;
  }

  // images du screamer selon le mode (normal / VIP) : à rappeler quand l'hôte lance une partie
  applyMonsters() {
    const img = this.$('#scareImg');
    if (img) { img.onerror = () => (img.hidden = true); img.hidden = false; img.src = ENTITY_IMG; }
    // celle du Level 1 : sa vidéo, qui continue de gesticuler en plein écran
    const A = ENTITY_ANIM;
    const anim = this.$('#scareAnim');
    anim.style.backgroundImage = `url("${A.url}")`;
    anim.style.backgroundSize = `${A.cols * 100}% ${A.rows * 100}%`;
    anim.style.aspectRatio = String(A.aspect);
  }

  // level : le screamer est celui de l'entité du level en cours
  // goat : percuté par une chèvre (Level 2) : pas de visage, l'éclair seul (la chèvre est dans la scène)
  showJumpscare(level = 0, goat = false, flat = false) {
    const j = this.$('#jumpscareOverlay');
    // l'entité surgit dans la scène (3D) : ici, seulement l'éclair rouge (sans éclair si on l'a demandé)
    j.classList.toggle('soft', !!this.reduceFlashes);
    j.classList.toggle('three', !flat && !goat);
    if (!flat && !goat) {
      const img = this.$('#scareImg');
      if (img) img.hidden = true;
      this.$('#scareAnim').hidden = true;
      // un cinquième de seconde de noir complet (le son coupe en même temps), puis l'éclair et elle
      j.hidden = false;
      j.classList.remove('flash');
      j.classList.add('pre');
      clearTimeout(this.scarePreT);
      this.scarePreT = setTimeout(() => {
        j.classList.remove('pre');
        void j.offsetWidth;
        j.classList.add('flash');
      }, 200);
      clearTimeout(this.scareHideT);
      this.scareHideT = setTimeout(() => (j.hidden = true), 1600);
      return;
    }
    const A = ENTITY_ANIM;
    const anim = this.$('#scareAnim');
    const img = this.$('#scareImg');
    anim.hidden = level !== 1 || goat;
    j.classList.toggle('goat', goat); // percuté : un éclair rouge par-dessus la scène, sans fond noir
    // Level 5 : le screamer est en 3D (la scène) ; l'écran ne fait qu'un éclair rouge et de la neige par-dessus
    j.classList.toggle('l5', level === HOTEL_LEVEL);
    if (img) img.hidden = level === 1 || goat || level === HOTEL_LEVEL;
    clearInterval(this.scareTimer);
    if (level === 1) {
      let f = 0;
      const show = () => {
        anim.style.backgroundPosition = `${((f % A.cols) / (A.cols - 1)) * 100}% ${(Math.floor(f / A.cols) / (A.rows - 1)) * 100}%`;
        f = (f + 1) % A.frames;
      };
      show();
      this.scareTimer = setInterval(show, 1000 / A.fps);
      setTimeout(() => clearInterval(this.scareTimer), 1500);
    }
    j.hidden = false;
    j.classList.remove('flash');
    void j.offsetWidth;
    j.classList.add('flash');
    clearTimeout(this.scareHideT);
    this.scareHideT = setTimeout(() => {
      j.hidden = true;
    }, 1400);
  }

  // Level 2, attrapé par le troupeau : après le choc, l'image du bouc monte très lentement du noir, fixe, sombre et
  // rien d'autre à l'écran. Elle reste en fin de partie (gdHold) ; sinon elle s'efface et l'on devient spectateur.
  // delay : le temps du choc avant le noir
  showGoatDeath(delay = 0) {
    const el = this.$('#goatDeath');
    const img = this.$('#gdImg');
    const grain = this.$('#gdGrain');
    if (!grain.style.backgroundImage) {
      // un grain de bande, fixe (il ne bouge pas)
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const d = g.createImageData(256, 256);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = 128 + (Math.random() - 0.5) * 255;
        d.data[i] = v;
        d.data[i + 1] = v * 0.95;
        d.data[i + 2] = v * 0.9;
        d.data[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
      grain.style.backgroundImage = `url(${c.toDataURL()})`;
    }
    for (const k of ['gdT1', 'gdT3', 'gdOutT']) clearTimeout(this[k]);
    this.gdHold = false;
    this.gdActive = true;
    el.classList.remove('out');
    img.style.transition = 'none';
    img.style.opacity = '0';
    el.hidden = true;
    this.gdT1 = setTimeout(() => {
      el.hidden = false;
      void img.offsetWidth;
      img.style.transition = `opacity ${GOAT_DEATH_FADE}s cubic-bezier(0.6, 0, 0.8, 1)`;
      img.style.opacity = '1';
    }, delay * 1000);
    this.gdT3 = setTimeout(() => {
      if (this.gdHold) return;
      el.classList.add('out');
      this.gdOutT = setTimeout(() => this.hideGoatDeath(), 1600);
    }, (delay + 14) * 1000);
  }

  hideGoatDeath() {
    for (const k of ['gdT1', 'gdT3', 'gdOutT']) clearTimeout(this[k]);
    this.gdActive = false;
    this.gdHold = false;
    const el = this.$('#goatDeath');
    if (el) el.hidden = true;
  }

  // extra : { stats: { seen, rushes, escapes, closest, haunts }, daily: 'Nov 7' | null, best: secondes | null,
  // abyss: bool (le dernier mort est tombé dans un puits sans fond : on le laisse tomber jusqu'au noir),
  // thirst: bool (le dernier mort s'est effondré, mort de soif) }
  showEnd(sim, onRestart, extra = {}) {
    const end = this.$('#endScreen');
    const title = this.$('#endTitle');
    const sub = this.$('#endSubtitle');
    const stats = this.$('#endStats');

    // laisser le jumpscare à l'écran avant la carte de fin
    // au Level 2, l'image du bouc reste derrière la carte de fin
    const goat = sim.state === 'dead' && this.gdActive;
    if (goat) this.gdHold = true;
    end.classList.toggle('over-goat', goat);
    // la carte de fin arrive après le choc ; au bout de 3 s, un clic ou une touche la fait venir tout de suite
    clearTimeout(this.endT);
    const reveal = () => {
      clearTimeout(this.endT);
      this.endPending = null;
      end.hidden = false;
    };
    this.endAt = performance.now();
    this.endPending = reveal;
    this.endT = setTimeout(reveal, goat ? 12500 : sim.state === 'dead' ? (extra.abyss ? 5200 : extra.thirst ? 3400 : 1300) : 300);
    // le bilan de la bande : ce qu'elle a vu de toi
    const S = extra.stats;
    const lines = [];
    if (S && sim.hasMonster && !sim.goats) {
      const times = (n, one) => (n === 1 ? one : `${n} times`);
      const seen = S.seen ? `IT SAW YOU ${times(S.seen, 'ONCE')}` : sim.state === 'dead' ? 'YOU NEVER SAW IT COMING' : 'IT NEVER SAW YOU';
      lines.push(`${seen} · CHASES ESCAPED ${S.escapes}${S.closest < 50 ? ` · CLOSEST CALL ${S.closest.toFixed(1)} M` : ''}`.toUpperCase());
      if (S.haunts) lines.push(`FROM THE OTHER SIDE: ${S.haunts} SIGN${S.haunts > 1 ? 'S' : ''} TO THE LIVING`);
    }
    if (extra.daily) lines.push(`DAILY MAP · ${extra.daily.toUpperCase()}${extra.best ? ` · YOUR BEST ${formatTime(extra.best)}` : ''}`);
    this.$('#endRun').textContent = lines.join('\n');

    const solo = sim.players.length === 1;
    const heard = tapesHeard().length;
    this.$('#endLore').textContent = `TAPES ARCHIVED · ${heard}/${LORE.length}`;
    const d = this.$('#tapeDate').textContent;
    if (sim.state === 'won') {
      const sl = slideOf(sim);
      if (sim.level === HOTEL_LEVEL) {
        // le Terror Hotel : par l'escalier de secours
        title.textContent = solo ? 'YOU ESCAPED' : 'YOU ALL ESCAPED';
        title.style.color = '#22c55e';
        sub.textContent = 'The fire escape spiralled down for hours, then opened onto daylight. The hotel let you go… this time.';
        stats.textContent = `HOTEL ENDING · ${formatTime(sim.time)} · Level 0, 1, 37 and 5 cleared`;
        this.$('#endTape').textContent = `${d} · CHECK-OUT`;
      } else if (sim.level === PIPES_LEVEL) {
        // la vraie fin : par le toboggan jaune et les tuyauteries
        title.textContent = solo ? 'YOU ESCAPED' : 'YOU ALL ESCAPED';
        title.style.color = '#22c55e';
        sub.textContent = 'The service elevator climbed for a long time. Then daylight, real daylight, through a crack in a door. Nobody is humming.';
        stats.textContent = `TRUE ENDING · ${formatTime(sim.time)} · Level 0, 1, 37 and 2 cleared`;
        this.$('#endTape').textContent = `${d} · FINAL TAPE · DO NOT ERASE`;
      } else {
        // la fausse sortie : rouge ou bleu… on se réveille sur la moquette du Level 0
        title.textContent = 'YOU WOKE UP';
        title.style.color = '#ffcf3a';
        sub.textContent = `The ${sl ? sl.name.toLowerCase() : ''} slide spat you out onto wet carpet. The lights hum. The wallpaper is yellow. Level 0, again. Maybe the yellow slide…`.replace('The  slide', 'The slide');
        stats.textContent = `LOOP ENDING · ${formatTime(sim.time)} · Level 0, 1 and 37 cleared`;
        this.$('#endTape').textContent = `${d} · TAPE ENDS · REWIND?`;
      }
    } else {
      title.textContent = solo ? 'YOU DIED' : 'NOBODY MADE IT OUT';
      title.style.color = '#ef4444';
      const PIPES = sim.level === PIPES_LEVEL;
      sub.textContent = sim.level === HOTEL_LEVEL ? 'Room service never knocks…' : PIPES ? 'The herd found you in the dark…' : sim.level === 1 ? 'The entity was waiting at the end of the shelves…' : extra.abyss ? 'You fell, and you are still falling. Nobody heard you land…' : extra.thirst ? 'Your mouth went dry, then your eyes. The hum went on without you…' : 'The entity caught you in the endless hallways…';
      stats.textContent = `Level ${levelName(sim.level)} · ${sim.level === HOTEL_LEVEL ? `letters ${sim.posted}/6` : PIPES ? `valves ${sim.valves}/4` : sim.level === 2 ? `valves ${sim.fuses}/3` : sim.level === 1 ? `fuses ${sim.delivered || 0}/3` : `tapes ${sim.cassettes}/${CASSETTES}`} · Survived for ${formatTime(sim.time)}`;
      this.$('#endTape').textContent = `${d} · RECORDING STOPPED`;
    }

    // un invité attend que l'hôte relance une partie
    const btn = this.$('#btnRestart');
    btn.disabled = !onRestart;
    btn.textContent = onRestart ? 'PLAY AGAIN' : 'WAITING FOR THE HOST…';
    this.$('#btnRestart').onclick = () => {
      if (!onRestart) return;
      this.endPending = null;
      clearTimeout(this.endT);
      end.hidden = true;
      this.hideGoatDeath();
      this.lastCount = -1;
      if (onRestart) onRestart();
    };
  }

  // Fondu au noir : l'ascenseur descend, puis la carte de l'étage
  fade(title, sub = '', hold = 0, ride = false) {
    const f = this.$('#fade');
    this.fadeRide = ride;
    this.$('#fadeBarBox').hidden = !ride;
    if (ride) this.$('#fadeBar').style.width = '0%';
    this.$('#fadeTitle').textContent = title;
    this.$('#fadeSub').textContent = sub;
    f.classList.add('on');
    clearTimeout(this.fadeTimer);
    if (hold > 0) this.fadeTimer = setTimeout(() => f.classList.remove('on'), hold * 1000);
  }

  // pause ; avant la toute première prise en main, c'est l'écran titre (et « Continuer » si une partie s'est arrêtée
  // plus loin, en solo)
  showPause(visible, kb, title = false, resume = null) {
    this.$('#clickPrompt').style.display = visible ? 'block' : 'none';
    this.$('#clickPrompt').classList.toggle('title', !!title);
    this.$('#titleCard').hidden = !title;
    this.$('#pauseTitle').hidden = !!title;
    const btn = this.$('#btnContinue');
    btn.hidden = !(title && resume);
    if (resume) btn.textContent = `▶▶ CONTINUE FROM LEVEL ${levelName(resume)}`;
    const tactile = document.body.classList.contains('touch') || matchMedia('(pointer: coarse)').matches;
    this.$('#pauseGo').textContent = tactile ? 'TAP THE SCREEN TO PLAY' : kb ? 'PRESS ENTER TO PLAY' : title ? 'CLICK TO PRESS PLAY' : 'CLICK TO TAKE CONTROL';
    const mv = this.qwerty ? 'WASD' : 'ZQSD';
    this.$('#pauseKeys').textContent = kb
      ? `${mv} move · Arrows or trackpad (two-finger swipe) look · Shift run · Space jump · C crouch · V camcorder · 1 flashlight · 2–${INV_SIZE + 1} select · E use (hotel: hide) · G drop · F pick up / hide · T whistle · Esc pause`
      : `${mv} move · Mouse look · Shift run · Space jump · C crouch · V camcorder · 1 flashlight · 2–${INV_SIZE + 1} or wheel select · E use (hotel: hide) · G drop · F pick up / hide · T whistle · Esc pause`;
    for (const b of this.el.querySelectorAll('button[data-kb]')) b.classList.toggle('on', (b.dataset.kb === '1') === kb);
  }
}

function formatTime(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}
