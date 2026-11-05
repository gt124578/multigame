// The Backrooms - Interface façon caméscope (REC, signal, bande), jumpscare et écran de fin
import { ENTITY_IMG, ENTITY_ANIM } from './scene.js';
import { DEPART_T } from '../engine/sim.js';

export class BackroomsHUD {
  constructor(container, actions = {}) {
    this.el = container;
    this.actions = actions;
    this.el.innerHTML = `
      <div class="jumpscare-overlay" id="jumpscareOverlay" hidden><img id="scareImg" alt=""><div class="scare-anim" id="scareAnim" hidden></div></div>

      <!-- Incrustations du caméscope -->
      <div class="cam cam-tl">
        <div class="vhs-rec"><span class="rec-dot">●</span> REC</div>
        <div class="vhs-play">PLAY ▶ SP</div>
        <div class="vhs-level" id="levelTag">LEVEL 0</div>
        <div class="blackout-tag" id="blackoutTag" hidden>⚠ POWER OUTAGE</div>
      </div>
      <div class="cam cam-tr">
        <div class="battery" id="battery"><i></i></div>
        <div id="vhsTimer">00:00:00</div>
      </div>
      <div class="cam cam-bl">
        <div class="tape-date" id="tapeDate"></div>
        <div class="stamina"><span>STAMINA</span><div class="stamina-track"><div class="stamina-bar" id="staminaBar"></div></div></div>
      </div>
      <div class="cam cam-br">
        <div class="tapes"><span id="cassetteIcons"></span> <b id="cassetteText">0/5</b></div>
        <div class="signal"><span id="signalLabel">SIGNAL</span> <span id="signalBars"></span></div>
        <div class="flash-indicator" id="flashStatus">[1] FLASHLIGHT ON</div>
      </div>

      <!-- Inventaire : la case 1 est réservée à la lampe torche, les cases 2 et 3 aux piles et à l'eau d'amande -->
      <div class="inv" id="inv">${[0, 1, 2].map((i) => `<button class="slot" data-slot="${i}"><b>${i + 1}</b><span></span></button>`).join('')}</div>

      <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
      <div class="crosshair"></div>

      <div class="objective-banner" id="objBanner"></div>
      <!-- Spectateur : à l'abri dans l'ascenseur, ou attrapé -->
      <div class="spectate" id="spectate" hidden><b id="specTitle"></b><span id="specSub"></span></div>
      <!-- Fondu : l'ascenseur descend, carte de l'étage -->
      <div class="fade" id="fade"><div><b id="fadeTitle"></b><span id="fadeSub"></span><div class="fade-bar" id="fadeBarBox" hidden><i id="fadeBar"></i></div></div></div>
      <div class="toast" id="toast" hidden></div>
      <!-- Ce que tu peux faire ici : ramasser, échanger, poser l'échelle ; la jauge d'équilibre sur une arête -->
      <div class="prompt" id="prompt" hidden><span id="promptText"></span><div class="beam" id="beamBar" hidden><b></b><i></i></div></div>

      <!-- Pause : prendre le contrôle et choisir ses commandes -->
      <div class="click-prompt" id="clickPrompt">
        <div class="pause-title">II PAUSE</div>
        <div class="pause-go" id="pauseGo"></div>
        <div class="ctrl-choice">
          <span>COMMANDES</span>
          <button data-kb="0">SOURIS</button>
          <button data-kb="1">SANS SOURIS</button>
        </div>
        <small id="pauseKeys"></small>
      </div>

      <!-- Écran de Fin (Mort ou Victoire) -->
      <div class="end-screen" id="endScreen" hidden>
        <div class="end-card">
          <h1 id="endTitle">MORT</h1>
          <p id="endSubtitle">The entity caught you...</p>
          <div class="end-stats" id="endStats"></div>
          <button class="btn-restart" id="btnRestart">PLAY AGAIN</button>
        </div>
      </div>
    `;

    this.$ = (s) => this.el.querySelector(s);
    this.invKey = '';
    this.$('#inv').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.slot');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      this.actions.use?.(+b.dataset.slot);
    });
    this.$('#clickPrompt').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-kb]');
      if (b) this.actions.setKbMode?.(b.dataset.kb === '1');
      else this.actions.play?.();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !this.$('#endScreen').hidden) this.$('#btnRestart').click();
    });
    this.applyMonsters();

    // date du caméscope, figée en 1996 comme une vieille cassette retrouvée
    const d = new Date();
    this.$('#tapeDate').textContent = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.1996`;
    this.bannerT = 9;
    this.lastCount = -1;
    this.toastT = 0;
  }

  update(sim, time, dt = 1 / 60) {
    const P = sim.player;

    // 1. Compteur de bande
    const totalSec = Math.floor(time);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor(totalSec / 60) % 60).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    this.$('#vhsTimer').textContent = `${h}:${m}:${s}`;
    // la batterie se vide doucement (purement décorative)
    // la batterie du caméscope, c'est la pile de la lampe
    const bat = P.battery ?? 100;
    this.$('#battery').style.setProperty('--b', Math.max(0.04, bat / 100).toFixed(3));
    this.$('#battery').classList.toggle('low', bat < 20);

    // 2. Objectif de l'étage : 5 cassettes (Level 0) ou 3 fusibles à rapporter au monte-charge (Level 1)
    const L1 = sim.level === 1;
    const got = L1 ? sim.fuses : sim.cassettes;
    const total = L1 ? 3 : 5;
    const objKey = `${sim.level}:${got}:${sim.open}`;
    if (objKey !== this.lastCount) {
      this.lastCount = objKey;
      this.$('#levelTag').textContent = `LEVEL ${sim.level}`;
      this.floorShown = -1;
      this.$('#cassetteIcons').innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < got ? 'on' : ''}${L1 ? ' fuse' : ''}"></i>`).join('');
      this.$('#cassetteText').textContent = `${got}/${total}`;
      this.bannerT = 6;
      const banner = this.$('#objBanner');
      banner.classList.toggle('unlocked', sim.open);
      if (sim.open) banner.textContent = L1 ? 'THE FREIGHT ELEVATOR HAS POWER: EVERYONE GET IN' : 'ONLY ONE OF THE TWO ELEVATORS OPENED… THE OTHER ONE IS JUST A WALL NOW';
      else if (L1 && got >= total) banner.textContent = 'BRING THE FUSES TO THE FREIGHT ELEVATOR PANEL · FOLLOW THE SIGNAL';
      else if (L1) banner.textContent = got === 0 ? 'LEVEL 1 · FIND THE 3 FUSES IN THE AISLES' : `FUSE ${got}/3 RECOVERED`;
      else banner.textContent = got === 0 ? 'FIND THE 5 VHS TAPES · THE SIGNAL GETS STRONGER AS YOU GET CLOSER' : `TAPE ${got}/5 RECOVERED`;
    }
    this.bannerT -= dt;
    this.$('#objBanner').classList.toggle('hide', this.bannerT <= 0);
    this.$('#blackoutTag').hidden = !(sim.blackout > 0);

    // 2a. Trajet en ascenseur : barre de chargement ; à l'arrivée, la carte de l'étage (même si l'annonce s'est perdue)
    if (this.fadeRide) {
      const k = sim.departT > 0 ? 1 - sim.departT / DEPART_T : 1;
      this.$('#fadeBar').style.width = `${Math.round(k * 100)}%`;
      if (!(sim.departT > 0)) {
        this.fadeRide = false;
        if (sim.state === 'playing') this.fade(`LEVEL ${sim.level}`, sim.level === 1 ? 'The industrial basement' : '', 2.2);
        else this.$('#fade').classList.remove('on');
      }
    }

    // 2b. Spectateur : dans l'ascenseur ou attrapé, on regarde ceux qui sont encore dehors
    const spec = P.status !== 'alive' && sim.state === 'playing';
    this.$('#spectate').hidden = !spec;
    if (spec) {
      const view = sim.viewPlayer(sim.spectate || 0);
      const inside = sim.players.filter((p) => p.status === 'elevator').length;
      this.$('#specTitle').textContent = sim.departT > 0 ? 'THE DOORS ARE CLOSING…' : P.status === 'elevator' ? "YOU'RE IN THE ELEVATOR" : 'THE ENTITY GOT YOU';
      this.$('#specSub').textContent = sim.departT > 0 ? '' : `${inside}/${sim.players.length} safe · watching ${view.name}${view !== P ? ' · click or Space: switch' : ''}`;
    }

    // 3. Signal de la cassette (ou de la sortie) la plus proche
    const bars = Math.round(P.signal * 5);
    const flick = P.signal > 0 && Math.random() < 0.08 ? Math.max(0, bars - 1) : bars;
    this.$('#signalBars').innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < flick ? 'on' : ''}" style="height:${6 + i * 3}px"></i>`).join('');
    this.$('#signalLabel').textContent = P.sigTo === 'stairs' ? 'STAIRS' : sim.open || (L1 && got >= total) ? (L1 ? 'FREIGHT ELEVATOR' : 'ELEVATOR') : 'SIGNAL';
    // l'étage où l'on est (Level 0, sur deux étages)
    if (sim.floors.length > 1 && this.floorShown !== P.floor) {
      this.floorShown = P.floor;
      this.$('#levelTag').textContent = `LEVEL ${sim.level} · ${P.floor ? 'LOWER' : 'UPPER'} FLOOR`;
    }

    // 4. Souffle (endurance)
    const stamBar = this.$('#staminaBar');
    stamBar.style.width = `${P.stamina}%`;
    stamBar.classList.toggle('low', P.stamina < 25);

    // 4b. Inventaire
    const inv = P.inv || [];
    const key = inv.join(',');
    const slotsKey = `${inv.join(',')}|${P.hasLamp ? 1 : 0}${P.flashlight ? 1 : 0}|${P.sel}`;
    if (slotsKey !== this.invKey) {
      this.invKey = slotsKey;
      this.$('#inv').querySelectorAll('.slot').forEach((b, i) => {
        if (i === 0) {
          // case de la lampe (toujours là depuis le départ)
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

    // 4c. Invite : ce que la touche fait ici
    this.prompt(sim, P);

    // 5. Lampe torche
    this.$('#flashStatus').textContent = P.hasLamp ? `[1] FLASHLIGHT ${P.flashlight ? 'ON' : 'OFF'}` : 'NO FLASHLIGHT';

    // 6. Message passager
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.$('#toast').hidden = true;
    }
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
        if (beam !== null) {
          // rien d'autre sur l'arête
        } else if (N && !N.ladder && sel === 'ladder' && Math.hypot(N.baseX - P.x, N.baseZ - P.z) < 2.2) text = '[E] PLACE THE LADDER UNDER THE TAPE';
        else if (it) text = P.inv.includes(null) ? `[F] PICK UP ${NAME[it.kind]}` : `[F] SWAP ${NAME[sel || 'bottle']} (SLOT ${P.sel + 1}) FOR ${NAME[it.kind]}`;
        else if (N && !N.ladder && nicheCas && !nicheCas.collected && Math.hypot(N.baseX - P.x, N.baseZ - P.z) < 2.6) text = 'THE TAPE IS TOO HIGH: YOU NEED A LADDER';
      }
    }
    const el = this.$('#prompt');
    el.hidden = !text;
    if (text) this.$('#promptText').textContent = text;
    this.$('#beamBar').hidden = beam === null;
    if (beam !== null) {
      const mark = this.$('#beamBar i');
      mark.style.left = `${50 + beam * 50}%`;
      mark.classList.toggle('danger', Math.abs(beam) > 0.6);
    }
  }

  toast(text) {
    const t = this.$('#toast');
    t.textContent = text;
    t.hidden = false;
    this.toastT = 2.5;
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
  showJumpscare(level = 0) {
    const j = this.$('#jumpscareOverlay');
    const A = ENTITY_ANIM;
    const anim = this.$('#scareAnim');
    const img = this.$('#scareImg');
    anim.hidden = level !== 1;
    if (img) img.hidden = level === 1;
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
    setTimeout(() => {
      j.hidden = true;
    }, 1400);
  }

  showEnd(sim, onRestart) {
    const end = this.$('#endScreen');
    const title = this.$('#endTitle');
    const sub = this.$('#endSubtitle');
    const stats = this.$('#endStats');

    // laisser le jumpscare à l'écran avant la carte de fin
    setTimeout(() => {
      end.hidden = false;
    }, sim.state === 'dead' ? 1300 : 300);

    const solo = sim.players.length === 1;
    if (sim.state === 'won') {
      title.textContent = solo ? 'YOU ESCAPED!' : 'YOU ALL ESCAPED!';
      title.style.color = '#22c55e';
      sub.textContent = 'The freight elevator brought you up out of the warehouse. The Backrooms let you go… this time.';
      stats.textContent = `Escape time: ${formatTime(sim.time)} · Level 0 and Level 1 cleared`;
    } else {
      title.textContent = solo ? 'YOU DIED' : 'NOBODY MADE IT OUT';
      title.style.color = '#ef4444';
      sub.textContent = sim.level === 1 ? 'The entity was waiting at the end of the shelves…' : 'The entity caught you in the endless hallways...';
      stats.textContent = `Level ${sim.level} · ${sim.level === 1 ? `fuses ${sim.fuses}/3` : `tapes ${sim.cassettes}/5`} · Survived for ${formatTime(sim.time)}`;
    }

    // un invité attend que l'hôte relance une partie
    const btn = this.$('#btnRestart');
    btn.disabled = !onRestart;
    btn.textContent = onRestart ? 'PLAY AGAIN' : 'WAITING FOR THE HOST…';
    this.$('#btnRestart').onclick = () => {
      if (!onRestart) return;
      end.hidden = true;
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

  showPause(visible, kb) {
    this.$('#clickPrompt').style.display = visible ? 'block' : 'none';
    const tactile = document.body.classList.contains('touch') || matchMedia('(pointer: coarse)').matches;
    this.$('#pauseGo').textContent = tactile ? 'TAP THE SCREEN TO PLAY' : kb ? 'PRESS ENTER TO PLAY' : 'CLICK TO TAKE CONTROL';
    this.$('#pauseKeys').textContent = kb
      ? 'ZQSD move · Arrows look · Shift run · 1 flashlight · 2 3 select · E use · F pick up · T whistle · Esc pause'
      : 'ZQSD move · Mouse look · Shift run · 1 flashlight · 2 3 select · E use · F pick up · T whistle · Esc pause';
    for (const b of this.el.querySelectorAll('button[data-kb]')) b.classList.toggle('on', (b.dataset.kb === '1') === kb);
  }
}

function formatTime(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}
