// odyssee/js/audio.js — musique « chiptune » originale générée à partir de grilles d'accords, et bruitages synthétisés.
// Aucun morceau existant n'est repris : mélodies composées par un générateur à graine (toujours les mêmes pour un thème).

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const midiOf = (n) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return 12 * (+m[2] + 1) + NOTE[m[1]]; };
const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11] };

/* ---------------- thèmes : tonalité, tempo, grille, caractère ---------------- */
const THEMES = {
  title: { key: 'Bb3', scale: 'maj', bpm: 112, prog: ['I', 'V', 'vi', 'IV', 'I', 'V', 'IV', 'V'], seed: 11, style: 'anthem' },
  town: { key: 'F3', scale: 'maj', bpm: 100, prog: ['I', 'vi', 'IV', 'V', 'I', 'iii', 'IV', 'V'], seed: 21, style: 'gentle' },
  house: { key: 'F3', scale: 'maj', bpm: 92, prog: ['I', 'IV', 'I', 'V', 'vi', 'IV', 'ii', 'V'], seed: 23, style: 'gentle', soft: 1 },
  lab: { key: 'G3', scale: 'maj', bpm: 104, prog: ['I', 'iii', 'IV', 'V', 'I', 'vi', 'ii', 'V'], seed: 27, style: 'gentle' },
  route: { key: 'G3', scale: 'maj', bpm: 132, prog: ['I', 'vi', 'IV', 'V', 'I', 'vi', 'ii', 'V'], seed: 31, style: 'march' },
  route2: { key: 'D3', scale: 'maj', bpm: 128, prog: ['I', 'V', 'vi', 'IV', 'ii', 'V', 'I', 'V'], seed: 33, style: 'march' },
  forest: { key: 'E3', scale: 'dor', bpm: 108, prog: ['i', 'VII', 'IV', 'i', 'i', 'VII', 'VI', 'v'], seed: 41, style: 'mystery' },
  city: { key: 'Eb3', scale: 'maj', bpm: 120, prog: ['I', 'vi', 'ii', 'V', 'iii', 'vi', 'ii', 'V'], seed: 51, style: 'swing' },
  port: { key: 'D3', scale: 'maj', bpm: 116, prog: ['I', 'IV', 'V', 'I', 'vi', 'IV', 'V', 'V'], seed: 55, style: 'gentle' },
  mystic: { key: 'B2', scale: 'min', bpm: 96, prog: ['i', 'VI', 'iv', 'V', 'i', 'III', 'VI', 'V'], seed: 61, style: 'mystery' },
  volcano: { key: 'G3', scale: 'harm', bpm: 120, prog: ['i', 'VI', 'VII', 'i', 'iv', 'VI', 'V', 'V'], seed: 71, style: 'march' },
  league: { key: 'C3', scale: 'min', bpm: 120, prog: ['i', 'VI', 'III', 'VII', 'i', 'iv', 'V', 'V'], seed: 81, style: 'anthem' },
  center: { key: 'C4', scale: 'maj', bpm: 96, prog: ['I', 'vi', 'IV', 'V', 'I', 'IV', 'ii', 'V'], seed: 91, style: 'gentle', soft: 1 },
  mart: { key: 'A3', scale: 'maj', bpm: 112, prog: ['I', 'IV', 'ii', 'V', 'I', 'vi', 'IV', 'V'], seed: 95, style: 'swing', soft: 1 },
  gym: { key: 'A3', scale: 'min', bpm: 126, prog: ['i', 'VI', 'VII', 'i', 'i', 'iv', 'VII', 'V'], seed: 101, style: 'march' },
  cave: { key: 'D3', scale: 'min', bpm: 84, prog: ['i', 'VI', 'iv', 'V', 'i', 'VI', 'VII', 'V'], seed: 111, style: 'mystery', soft: 1 },
  wild: { key: 'A3', scale: 'harm', bpm: 158, prog: ['i', 'VI', 'VII', 'V', 'i', 'iv', 'VI', 'V'], seed: 121, style: 'battle' },
  trainer: { key: 'D3', scale: 'harm', bpm: 164, prog: ['i', 'VI', 'VII', 'i', 'iv', 'VII', 'III', 'V'], seed: 131, style: 'battle' },
  leader: { key: 'E3', scale: 'harm', bpm: 172, prog: ['i', 'VI', 'III', 'VII', 'i', 'iv', 'VI', 'V'], seed: 141, style: 'battle', big: 1 },
  champion: { key: 'C3', scale: 'harm', bpm: 176, prog: ['i', 'VI', 'VII', 'III', 'iv', 'VI', 'V', 'V'], seed: 151, style: 'battle', big: 1 },
  rival: { key: 'G3', scale: 'harm', bpm: 168, prog: ['i', 'VII', 'VI', 'V', 'i', 'iv', 'VII', 'V'], seed: 161, style: 'battle' },
  victory: { key: 'C4', scale: 'maj', bpm: 132, prog: ['I', 'IV', 'V', 'I'], seed: 171, style: 'anthem' },
  evolution: { key: 'F3', scale: 'maj', bpm: 120, prog: ['I', 'ii', 'IV', 'V'], seed: 181, style: 'gentle' },
};
const ROMAN = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6 };
function chordOf(sym, key, scale) {
  const minor = sym === sym.toLowerCase();
  const deg = ROMAN[sym.toUpperCase()];
  const sc = SCALES[scale];
  const root = midiOf(key) + sc[deg] + (deg >= sc.length ? 12 : 0);
  // tierce selon la casse (majeur / mineur), quinte juste
  return { root, tones: [0, minor ? 3 : 4, 7], deg };
}

/** compose un morceau : renvoie des pistes [{ type, vol, notes:[{s, d, m}] }] sur 16 pas par mesure */
function compose(th) {
  const r = rng(th.seed), sc = SCALES[th.scale], tonic = midiOf(th.key);
  const bars = th.prog.length, steps = bars * 16;
  const lead = [], harm = [], bass = [], drum = [];
  const scaleNotes = []; for (let o = -1; o < 4; o++) for (const s of sc) scaleNotes.push(tonic + 12 * o + s);
  const nearest = (m) => scaleNotes.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
  const RHY = {
    gentle: [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]], march: [[0, 3], [3, 1], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
    swing: [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], mystery: [[0, 6], [6, 2], [8, 8]], anthem: [[0, 4], [4, 4], [8, 3], [11, 1], [12, 4]],
    battle: [[0, 2], [2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
  };
  // motif de deux mesures, répété avec variations (forme A A' B A'')
  const motif = [];
  let cur = tonic + 12 + sc[r() < 0.5 ? 2 : 4];
  for (let b = 0; b < 2; b++) {
    const rh = RHY[th.style];
    for (const [s, d] of rh) { if (r() < 0.12 && s) continue; const step = [-2, -1, -1, 1, 1, 2, 0, 3, -3][Math.floor(r() * 9)]; motif.push({ s: b * 16 + s, d, step }); }
  }
  for (let bar = 0; bar < bars; bar++) {
    const ch = chordOf(th.prog[bar], th.key, th.scale);
    const chordTones = []; for (let o = -1; o < 4; o++) for (const t of ch.tones) chordTones.push(ch.root + 12 * o + t);
    const near = (m) => chordTones.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
    const phrase = Math.floor(bar / 2) % 4; // A A' B A''
    for (const n of motif) {
      if (Math.floor(n.s / 16) !== bar % 2) continue;
      const s = (n.s % 16);
      let step = n.step;
      if (phrase === 2) step = -step + (r() < 0.3 ? 1 : 0);
      if (phrase === 1 && s >= 8 && r() < 0.5) step += 1;
      cur = nearest(cur + step * 1.6);
      let m = s % 4 === 0 ? near(cur) : nearest(cur);
      // cadence : dernière note de la phrase sur la tonique de l'accord
      if (bar % 2 === 1 && s >= 12) m = near(m);
      m = Math.max(tonic + 7, Math.min(tonic + 26, m)); cur = m;
      lead.push({ s: bar * 16 + s, d: n.d, m });
    }
    // basse
    const root = ch.root - 12 - (ch.root - 12 >= tonic + 2 ? 12 : 0);
    const bassPat = th.style === 'battle' ? [[0, 2, 0], [2, 2, 12], [4, 2, 0], [6, 2, 12], [8, 2, 0], [10, 2, 12], [12, 2, 7], [14, 2, 12]]
      : th.style === 'march' ? [[0, 3, 0], [4, 3, 7], [8, 3, 0], [12, 3, 7]]
        : th.style === 'swing' ? [[0, 3, 0], [3, 3, 4], [6, 2, 7], [8, 3, 9], [11, 3, 7], [14, 2, 4]]
          : th.style === 'mystery' ? [[0, 8, 0], [8, 8, 7]] : [[0, 4, 0], [4, 4, 7], [8, 4, 12], [12, 4, 7]];
    for (const [s, d, iv] of bassPat) bass.push({ s: bar * 16 + s, d, m: root + (iv === 4 ? ch.tones[1] : iv === 9 ? 9 : iv) });
    // accompagnement en arpèges
    const arp = th.style === 'mystery' ? 4 : th.style === 'battle' ? 1 : 2;
    for (let s = 0; s < 16; s += arp) {
      const k = Math.floor(s / arp) % 4, t = [0, 1, 2, 1][k];
      harm.push({ s: bar * 16 + s, d: arp, m: ch.root + ch.tones[t] + (k === 2 ? 12 : 0) });
    }
    // percussions
    if (!th.soft) for (let s = 0; s < 16; s++) {
      if (th.style === 'battle') { if (s % 4 === 0) drum.push({ s: bar * 16 + s, k: 'k' }); if (s % 8 === 4) drum.push({ s: bar * 16 + s, k: 's' }); if (s % 2 === 1) drum.push({ s: bar * 16 + s, k: 'h' }); }
      else if (th.style === 'march' || th.style === 'anthem') { if (s % 8 === 0) drum.push({ s: bar * 16 + s, k: 'k' }); if (s % 8 === 4) drum.push({ s: bar * 16 + s, k: 's' }); if (s % 4 === 2) drum.push({ s: bar * 16 + s, k: 'h' }); }
      else if (th.style === 'swing') { if (s % 8 === 0) drum.push({ s: bar * 16 + s, k: 'k' }); if (s % 3 === 0) drum.push({ s: bar * 16 + s, k: 'h' }); }
      else if (s % 8 === 0 && th.style !== 'mystery') drum.push({ s: bar * 16 + s, k: 'h' });
    }
  }
  return { steps, bpm: th.bpm, tracks: [{ type: 'pulse25', vol: th.big ? 0.13 : 0.11, notes: lead }, { type: 'pulse50', vol: 0.045, notes: harm }, { type: 'triangle', vol: 0.16, notes: bass }, { type: 'drum', vol: 0.1, notes: drum }] };
}

export class Sound {
  constructor() {
    this.ctx = null; this.vol = 0.7; this.music = null; this.songs = {}; this.muted = false;
    try { const v = localStorage.getItem('odyssee-vol'); if (v != null) this.vol = +v; } catch (e) {}
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
    // les réglages de volume du Hub (musique / effets) s'appliquent s'ils sont disponibles
    const DV = window.DDVolume, via = (kind) => { if (!DV) return this.master; const g = DV.gain(this.ctx, kind); g.connect(this.master); return g; };
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.8; this.musicBus.connect(via('music'));
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(via('fx'));
    const real = (duty) => { const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * 1; return this.ctx.createPeriodicWave(re, im); };
    // onde « pulse » : on fabrique les coefficients en cosinus pour un rapport cyclique donné
    const pulse = (duty) => { const n = 40, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty); im[k] = 0; } return this.ctx.createPeriodicWave(re, im, { disableNormalization: false }); };
    this.waves = { pulse25: pulse(0.25), pulse50: pulse(0.5), pulse12: pulse(0.125) };
    void real;
    const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    if (this.pending) { const p = this.pending; this.pending = null; this.play(p); }
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; try { localStorage.setItem('odyssee-vol', v); } catch (e) {} }

  tone(type, f, t, dur, vol, bus, o = {}) {
    const c = this.ctx; const g = c.createGain();
    let src;
    if (type === 'noise') { src = c.createBufferSource(); src.buffer = this.noise; const bp = c.createBiquadFilter(); bp.type = o.filter || 'highpass'; bp.frequency.value = f; src.connect(bp); bp.connect(g); }
    else { src = c.createOscillator(); if (this.waves[type]) src.setPeriodicWave(this.waves[type]); else src.type = type; src.frequency.setValueAtTime(f, t); if (o.slide) src.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur); src.connect(g); }
    const a = o.attack ?? 0.005, rel = o.release ?? 0.05;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus); src.start(t); src.stop(t + dur + 0.02);
  }

  /* ---------------- musique ---------------- */
  play(name) {
    if (this.current === name) return;
    this.current = name;
    if (!this.ctx) { this.pending = name; return; }
    this.stopMusic(0.25);
    if (!name || !THEMES[name]) return;
    const song = this.songs[name] ||= compose(THEMES[name]);
    const stepDur = 60 / song.bpm / 4;
    const bus = this.ctx.createGain(); bus.gain.value = 1; bus.connect(this.musicBus);
    const st = { song, bus, step: 0, t: this.ctx.currentTime + 0.12, stepDur, alive: true, oneShot: name === 'victory' && false };
    const byStep = song.tracks.map((tr) => { const m = new Map(); for (const n of tr.notes) { if (!m.has(n.s)) m.set(n.s, []); m.get(n.s).push(n); } return m; });
    const tick = () => {
      if (!st.alive) return;
      const now = this.ctx.currentTime;
      while (st.t < now + 0.25) {
        const s = st.step % song.steps;
        song.tracks.forEach((tr, i) => {
          const ns = byStep[i].get(s); if (!ns) return;
          for (const n of ns) {
            if (tr.type === 'drum') {
              if (n.k === 'k') this.tone('triangle', 140, st.t, 0.12, tr.vol * 1.6, bus, { slide: 45 });
              else if (n.k === 's') this.tone('noise', 1800, st.t, 0.09, tr.vol * 0.8, bus);
              else this.tone('noise', 7000, st.t, 0.03, tr.vol * 0.35, bus);
            } else this.tone(tr.type, freq(n.m), st.t, n.d * stepDur * 0.92, tr.vol, bus, { release: Math.min(0.08, n.d * stepDur * 0.3) });
          }
        });
        st.step++; st.t += stepDur;
      }
      st.timer = setTimeout(tick, 60);
    };
    tick();
    this.music = st;
  }
  stopMusic(fade = 0.2) {
    const st = this.music; if (!st) return; st.alive = false; clearTimeout(st.timer);
    if (this.ctx) { const t = this.ctx.currentTime; st.bus.gain.setValueAtTime(st.bus.gain.value, t); st.bus.gain.linearRampToValueAtTime(0.0001, t + fade); setTimeout(() => st.bus.disconnect(), fade * 1000 + 600); }
    this.music = null;
  }
  /** coupe la musique un instant (jingle) puis la reprend */
  duck(ms) { if (!this.musicBus || !this.ctx) return; const t = this.ctx.currentTime; this.musicBus.gain.cancelScheduledValues(t); this.musicBus.gain.setValueAtTime(0.0001, t); this.musicBus.gain.setValueAtTime(0.0001, t + ms / 1000); this.musicBus.gain.linearRampToValueAtTime(0.8, t + ms / 1000 + 0.4); }

  /* ---------------- bruitages ---------------- */
  sfx(k) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01, B = this.sfxBus, P = (f, dt, d, v = 0.12, ty = 'pulse25', o) => this.tone(ty, f, t + dt, d, v, B, o);
    const n = (m) => freq(midiOf(m));
    switch (k) {
      case 'blip': P(n('A5'), 0, 0.045, 0.07, 'pulse50'); break;
      case 'select': P(n('E5'), 0, 0.05, 0.08); P(n('A5'), 0.05, 0.07, 0.08); break;
      case 'cancel': P(n('A4'), 0, 0.05, 0.07); P(n('E4'), 0.05, 0.06, 0.07); break;
      case 'bump': P(110, 0, 0.09, 0.14, 'triangle', { slide: 70 }); break;
      case 'door': this.tone('noise', 900, t, 0.18, 0.08, B, { filter: 'bandpass' }); P(n('C4'), 0.02, 0.1, 0.06, 'triangle'); break;
      case 'exit': P(n('G4'), 0, 0.06, 0.07, 'triangle'); P(n('C4'), 0.06, 0.1, 0.07, 'triangle'); break;
      case 'ledge': P(n('C5'), 0, 0.12, 0.09, 'pulse50', { slide: n('C6') }); break;
      case 'heal': this.duck(2600); [['C5', 0], ['E5', 0.18], ['G5', 0.36], ['C6', 0.54], ['G5', 0.9], ['C6', 1.08]].forEach(([m, d], i) => P(n(m), d, i === 5 ? 0.9 : 0.16, 0.1)); break;
      case 'item': this.duck(1500); [['G5', 0], ['A5', 0.12], ['B5', 0.24], ['D6', 0.36]].forEach(([m, d], i) => P(n(m), d, i === 3 ? 0.6 : 0.11, 0.1)); break;
      case 'badge': this.duck(3200); [['C5', 0], ['C5', 0.15], ['C5', 0.3], ['E5', 0.45], ['G5', 0.75], ['E5', 1.05], ['G5', 1.2], ['C6', 1.5]].forEach(([m, d], i) => { P(n(m), d, i === 7 ? 1.2 : 0.14, 0.1); P(n(m) / 2, d, i === 7 ? 1.2 : 0.14, 0.06, 'triangle'); }); break;
      case 'levelup': this.duck(1300); [['C5', 0], ['E5', 0.1], ['G5', 0.2], ['C6', 0.3], ['G5', 0.45], ['C6', 0.55]].forEach(([m, d], i) => P(n(m), d, i === 5 ? 0.5 : 0.09, 0.1)); break;
      case 'caught': this.duck(2400); [['G4', 0], ['C5', 0.18], ['E5', 0.36], ['G5', 0.54], ['E5', 0.8], ['G5', 0.98], ['C6', 1.16]].forEach(([m, d], i) => P(n(m), d, i === 6 ? 0.9 : 0.16, 0.1)); break;
      case 'save': [['E5', 0], ['A5', 0.1], ['E6', 0.2]].forEach(([m, d]) => P(n(m), d, 0.1, 0.08)); break;
      case 'encounter': for (let i = 0; i < 6; i++) P(n(i % 2 ? 'E6' : 'B5'), i * 0.06, 0.05, 0.08); break;
      case 'bang': P(n('E6'), 0, 0.08, 0.1); P(n('B6'), 0.08, 0.16, 0.1); break;
      case 'hit': this.tone('noise', 600, t, 0.14, 0.22, B, { filter: 'lowpass' }); P(90, 0, 0.12, 0.14, 'triangle', { slide: 40 }); break;
      case 'hitweak': this.tone('noise', 1200, t, 0.09, 0.12, B, { filter: 'lowpass' }); break;
      case 'hitstrong': this.tone('noise', 400, t, 0.24, 0.3, B, { filter: 'lowpass' }); P(70, 0, 0.2, 0.18, 'triangle', { slide: 30 }); P(n('C6'), 0, 0.05, 0.06); break;
      case 'faint': P(n('E5'), 0, 0.6, 0.1, 'pulse25', { slide: n('C3') }); break;
      case 'throw': P(n('C5'), 0, 0.25, 0.07, 'pulse50', { slide: n('C6') }); break;
      case 'shake': P(n('C4'), 0, 0.05, 0.1, 'triangle'); this.tone('noise', 2000, t, 0.04, 0.05, B); break;
      case 'poof': this.tone('noise', 3000, t, 0.25, 0.1, B, { filter: 'bandpass' }); break;
      case 'stat': for (let i = 0; i < 5; i++) P(n('C5') * Math.pow(1.12, i), i * 0.04, 0.05, 0.06); break;
      case 'statdown': for (let i = 0; i < 5; i++) P(n('C6') / Math.pow(1.12, i), i * 0.04, 0.05, 0.06); break;
      case 'exp': P(n('C6'), 0, 0.04, 0.03, 'pulse50'); break;
      case 'run': this.tone('noise', 1500, t, 0.3, 0.08, B, { filter: 'bandpass' }); break;
      case 'learn': [['C5', 0], ['G5', 0.1], ['C6', 0.2]].forEach(([m, d]) => P(n(m), d, 0.09, 0.08)); break;
      case 'evolve': for (let i = 0; i < 12; i++) P(n('C5') * Math.pow(2, (i % 6) / 6), i * 0.12, 0.1, 0.06, 'pulse50'); break;
      case 'buy': P(n('B5'), 0, 0.06, 0.08); P(n('E6'), 0.07, 0.12, 0.08); break;
      case 'pc': [['C6', 0], ['E6', 0.06], ['G6', 0.12]].forEach(([m, d]) => P(n(m), d, 0.05, 0.05, 'pulse12')); break;
      case 'status': P(n('A4'), 0, 0.3, 0.08, 'pulse50', { slide: n('E4') }); break;
      default: break;
    }
  }

  cry(url) {
    if (!url || this.vol <= 0) return;
    // créature originale : petit cri synthétisé, toujours le même pour une espèce
    if (url.startsWith('synth:')) {
      if (!this.ctx) return;
      let s = (+url.slice(6) * 2654435761) >>> 0; const r = () => ((s = (s ^ (s << 13)) >>> 0, s = (s ^ (s >>> 17)) >>> 0, s = (s ^ (s << 5)) >>> 0) % 1000) / 1000;
      const t = this.ctx.currentTime + 0.02, base = 260 + r() * 520, n = 2 + Math.floor(r() * 3), ty = ['pulse25', 'pulse12', 'pulse50', 'triangle'][Math.floor(r() * 4)];
      let dt = 0;
      for (let i = 0; i < n; i++) {
        const f = base * (0.75 + r() * 0.8), d = 0.08 + r() * 0.16;
        this.tone(ty, f, t + dt, d, 0.11, this.sfxBus, { slide: f * (0.6 + r() * 0.9), release: 0.04 });
        if (r() < 0.5) this.tone('noise', 2500 + r() * 3000, t + dt, d * 0.6, 0.03, this.sfxBus, { filter: 'bandpass' });
        dt += d * (0.7 + r() * 0.4);
      }
      return;
    }
    try { const a = new window.Audio(url); a.volume = Math.min(1, this.vol * 0.45); a.play().catch(() => {}); } catch (e) {}
  }
}
