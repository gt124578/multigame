// Musique chiptune et effets sonores synthétisés (WebAudio). Toutes les mélodies sont originales.

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const freq = (n) => 440 * Math.pow(2, (n - 69) / 12);
function midi(name) { const m = /^([A-G][#b]?)(-?\d)$/.exec(name); return m ? NOTE[m[1]] + (+m[2] + 1) * 12 : null; }
function parseLine(s) { return s.trim().split(/\s+/).filter((t) => t && t !== '|').map((t) => { const [n, l] = t.split('.'); return [n === '-' ? null : midi(n), +(l || 2)]; }); }
const CHORD = (name) => {
  const m = /^([A-G][#b]?)(m?)$/.exec(name); const r = NOTE[m[1]];
  return m[2] ? [r, r + 3, r + 7] : [r, r + 4, r + 7];
};

// ---------------------------------------------------------------- morceaux (16 doubles-croches par mesure)
const SONGS = {
  route: { bpm: 140, duty: 0.25, arp: 'up', bassMode: 'walk', drums: 'k.h.s.h.k.h.s.hh',
    lead: 'G4.2 B4.2 D5.4 B4.2 D5.2 G5.4 | F#5.2 E5.2 D5.4 B4.4 D5.4 | C5.2 D5.2 E5.4 D5.2 C5.2 B4.4 | A4.4 B4.2 C5.2 D5.8 | G4.2 B4.2 D5.4 B4.2 D5.2 G5.4 | A5.2 G5.2 F#5.4 D5.4 E5.2 F#5.2 | G5.4 E5.4 C5.4 A4.4 | D5.4 F#5.4 G5.8',
    chords: ['G', 'D', 'C', 'D', 'G', 'D', 'C', 'G'] },
  town: { bpm: 112, duty: 0.5, arp: 'off', bassMode: 'walk', drums: 'k...h...k.k.h...',
    lead: 'E5.4 G5.2 E5.2 D5.4 C5.4 | D5.4 E5.2 D5.2 C5.4 A4.4 | G4.4 C5.2 D5.2 E5.4 G5.4 | F5.4 E5.2 D5.2 D5.8 | E5.4 G5.2 E5.2 D5.4 C5.4 | D5.4 E5.2 F5.2 G5.4 A5.4 | G5.4 E5.2 C5.2 D5.4 E5.2 D5.2 | C5.12 -.4',
    chords: ['C', 'Am', 'F', 'G', 'C', 'F', 'G', 'C'] },
  hameau: { bpm: 92, duty: 0.25, arp: 'up', bassMode: 'slow', drums: '',
    lead: 'A4.4 C5.4 F5.6 E5.2 | D5.4 C5.4 A4.8 | Bb4.4 D5.4 G5.6 F5.2 | E5.4 C5.4 G4.8 | A4.4 C5.4 F5.6 G5.2 | A5.4 G5.4 F5.4 D5.4 | C5.4 F5.4 E5.4 G5.4 | F5.12 -.4',
    chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'C', 'F'] },
  city: { bpm: 128, duty: 0.25, arp: 'off', bassMode: 'drive', drums: 'k.h.s.h.k.hks.h.',
    lead: 'D5.2 F#5.2 A5.2 F#5.2 B5.4 A5.4 | G5.2 F#5.2 E5.2 D5.2 E5.8 | C#5.2 E5.2 A5.2 E5.2 G5.4 F#5.4 | E5.2 D5.2 C#5.2 B4.2 A4.8 | D5.2 F#5.2 A5.2 F#5.2 B5.4 A5.4 | D6.4 C#6.2 B5.2 A5.4 F#5.4 | G5.2 A5.2 B5.2 G5.2 E5.4 C#5.4 | D5.8 -.4 A4.4',
    chords: ['D', 'Em', 'A', 'A', 'D', 'Bm', 'Em', 'D'] },
  forest: { bpm: 100, duty: 0.125, arp: 'up', bassMode: 'slow', drums: 'k.......h.......',
    lead: 'A4.6 C5.2 E5.4 D5.4 | C5.6 B4.2 G4.8 | A4.6 C5.2 E5.4 G5.4 | F5.6 E5.2 E5.8 | D5.6 F5.2 A5.4 G5.4 | F5.6 E5.2 C5.8 | B4.4 C5.4 D5.4 E5.4 | A4.12 -.4',
    chords: ['Am', 'G', 'Am', 'E', 'Dm', 'Am', 'E', 'Am'] },
  mist: { bpm: 78, duty: 0.125, arp: 'pad', bassMode: 'slow', drums: '',
    lead: 'D5.4 F5.4 A5.4 G#5.4 | G5.8 F5.8 | E5.4 G5.4 Bb5.4 A5.4 | A5.16 | D5.4 F5.4 A5.4 C6.4 | Bb5.8 A5.8 | G5.4 E5.4 C#5.4 E5.4 | D5.16',
    chords: ['Dm', 'Gm', 'C', 'A', 'Dm', 'Bb', 'A', 'Dm'] },
  port: { bpm: 118, duty: 0.5, arp: 'up', bassMode: 'walk', drums: 'k..h..s.k..h..s.',
    lead: 'C5.2 F5.2 A5.4 G5.2 F5.2 D5.4 | C5.4 A4.4 C5.8 | Bb4.2 D5.2 F5.4 E5.2 D5.2 C5.4 | D5.4 E5.4 C5.8 | C5.2 F5.2 A5.4 G5.2 F5.2 A5.4 | C6.4 Bb5.4 A5.8 | G5.2 A5.2 Bb5.4 A5.2 G5.2 E5.4 | F5.12 -.4',
    chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Gm', 'F'] },
  snow: { bpm: 96, duty: 0.125, arp: 'up', bassMode: 'slow', drums: '',
    lead: 'E5.4 B5.4 A5.4 G5.4 | F#5.4 G5.4 E5.8 | D5.4 F#5.4 A5.4 G5.4 | F#5.8 B4.8 | E5.4 G5.4 B5.4 D6.4 | C6.4 B5.4 A5.8 | G5.4 F#5.4 E5.4 D#5.4 | E5.16',
    chords: ['Em', 'C', 'D', 'B', 'Em', 'Am', 'B', 'Em'] },
  cave: { bpm: 88, duty: 0.5, arp: 'pad', bassMode: 'slow', drums: 'k...............',
    lead: 'C4.8 Eb4.4 G4.4 | F#4.8 G4.8 | Ab4.8 G4.4 Eb4.4 | D4.16 | C4.8 Eb4.4 G4.4 | Bb4.8 Ab4.8 | G4.4 F4.4 Eb4.4 D4.4 | C4.16',
    chords: ['Cm', 'Cm', 'Ab', 'G', 'Cm', 'Fm', 'G', 'Cm'] },
  center: { bpm: 100, duty: 0.25, arp: 'off', bassMode: 'walk', drums: 'k...h...s...h...',
    lead: 'B4.2 D5.2 G5.4 F#5.2 G5.2 A5.4 | G5.4 D5.4 B4.8 | C5.2 E5.2 A5.4 G5.2 A5.2 B5.4 | A5.4 F#5.4 D5.8 | B4.2 D5.2 G5.4 F#5.2 G5.2 A5.4 | B5.4 C6.2 B5.2 A5.8 | G5.2 F#5.2 E5.4 D5.2 C5.2 A4.4 | G4.12 -.4',
    chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'D', 'G'] },
  gym: { bpm: 132, duty: 0.25, arp: 'off', bassMode: 'drive', drums: 'k...s...k.k.s...',
    lead: 'A4.4 A4.2 C5.2 E5.4 A5.4 | G5.2 F5.2 E5.2 D5.2 E5.8 | F5.4 F5.2 E5.2 D5.4 C5.4 | B4.2 C5.2 D5.2 B4.2 E5.8 | A4.4 A4.2 C5.2 E5.4 A5.4 | B5.2 A5.2 G5.2 F5.2 G5.8 | F5.2 E5.2 D5.2 C5.2 D5.4 B4.4 | A4.12 -.4',
    chords: ['Am', 'C', 'Dm', 'E', 'Am', 'G', 'Dm', 'Am'] },
  league: { bpm: 116, duty: 0.25, arp: 'up', bassMode: 'walk', drums: 'k...s...k...s.s.',
    lead: 'C5.4 G4.2 C5.2 E5.4 G5.4 | F5.4 E5.2 D5.2 E5.8 | A5.4 G5.2 F5.2 E5.4 D5.4 | D5.4 E5.2 F5.2 G5.8 | C6.4 G5.2 E5.2 C6.4 E6.4 | D6.4 C6.2 B5.2 A5.8 | F5.4 A5.4 G5.4 B5.4 | C6.12 -.4',
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'G', 'C'] },
  battle: { bpm: 160, duty: 0.25, arp: 'off', bassMode: 'drive', drums: 'k.h.s.h.k.k.s.h.',
    lead: 'E5.2 E5.2 G5.2 E5.2 A5.2 E5.2 B5.2 A5.2 | G5.2 F#5.2 E5.2 D5.2 E5.4 B4.4 | C5.2 C5.2 E5.2 C5.2 F#5.2 C5.2 G5.2 F#5.2 | E5.2 D5.2 C5.2 B4.2 B4.8 | E5.2 E5.2 G5.2 E5.2 A5.2 E5.2 B5.2 A5.2 | C6.4 B5.4 A5.4 G5.4 | A5.2 G5.2 F#5.2 E5.2 F#5.2 G5.2 A5.2 F#5.2 | E5.8 B4.4 D#5.4',
    chords: ['Em', 'Em', 'C', 'B', 'Em', 'Am', 'D', 'B'] },
  trainer: { bpm: 168, duty: 0.25, arp: 'off', bassMode: 'drive', drums: 'k.hks.h.k.hks.hh',
    lead: 'G4.2 D5.2 G5.2 D5.2 F5.2 D5.2 Eb5.2 D5.2 | C5.2 D5.2 Eb5.2 F5.2 G5.4 D5.4 | Eb5.2 Bb4.2 Eb5.2 Bb4.2 F5.2 Bb4.2 G5.2 F5.2 | Eb5.4 D5.4 C5.4 D5.4 | G4.2 D5.2 G5.2 D5.2 F5.2 D5.2 Eb5.2 D5.2 | Bb5.4 A5.4 G5.4 F#5.4 | G5.2 F5.2 Eb5.2 D5.2 C5.2 D5.2 Eb5.2 C5.2 | D5.8 F#5.4 A5.4',
    chords: ['Gm', 'Cm', 'Eb', 'D', 'Gm', 'Eb', 'Cm', 'D'] },
  victory: { bpm: 120, duty: 0.5, arp: 'up', bassMode: 'walk', drums: 'k...s...k...s...',
    lead: 'G5.2 G5.2 G5.2 G5.6 E5.4 | F5.4 A5.4 C6.8 | B5.4 A5.4 G5.4 F5.4 | E5.4 G5.4 C6.8',
    chords: ['C', 'F', 'G', 'C'] },
};
SONGS.leader = { ...SONGS.trainer, bpm: 178, transpose: 2, duty: 0.5 };
SONGS.champion = { ...SONGS.battle, bpm: 172, transpose: -2, duty: 0.5 };
SONGS.legend = { ...SONGS.mist, bpm: 70, transpose: 3 };
SONGS.lab = { ...SONGS.center, bpm: 96, transpose: 5 };
SONGS.house = { ...SONGS.center, bpm: 88, drums: '' };
SONGS.title = { ...SONGS.league, bpm: 108 };
SONGS.surf = SONGS.port;

const JINGLES = {
  heal: 'C5.2 E5.2 G5.2 C6.4 G5.2 C6.8',
  caught: 'G5.2 A5.2 B5.2 D6.4 B5.2 G6.8',
  level: 'E5.1 G5.1 C6.1 E6.4',
  badge: 'C5.2 C5.2 C5.2 E5.4 G5.4 C6.4 B5.2 C6.10',
  evolve: 'C5.2 E5.2 G5.2 C6.2 E6.2 G6.8',
  item: 'G5.2 B5.2 D6.4 G6.6',
};

class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.song = null; this.songName = null;
    try { this.muted = localStorage.getItem('ambrevale-mute') === '1'; } catch (e) {}
    window.__audioUnlock = () => this.unlock();
    addEventListener('pointerdown', () => this.unlock());
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.22; this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.75; this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
      this.waves = {};
      for (const d of [0.125, 0.25, 0.5]) {
        const N = 32, re = new Float32Array(N), im = new Float32Array(N);
        for (let k = 1; k < N; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
        this.waves[d] = this.ctx.createPeriodicWave(re, im);
      }
      const len = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, len, len);
      const ch = this.noise.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.timer = setInterval(() => this.schedule(), 40);
      if (this.wantSong) this.play(this.wantSong, true);
    } catch (e) { this.ctx = null; }
  }
  setMuted(m) { this.muted = m; try { localStorage.setItem('ambrevale-mute', m ? '1' : '0'); } catch (e) {} if (this.master) this.master.gain.value = m ? 0 : 0.22; }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ---------------------------------------------------------------- musique
  play(name, force = false) {
    this.wantSong = name;
    if (!this.ctx || (!force && this.songName === name)) return;
    const S = SONGS[name] || SONGS.route;
    this.songName = name;
    const tr = S.transpose || 0;
    const lead = parseLine(S.lead).map(([n, l]) => [n == null ? null : n + tr, l]);
    const bars = S.chords.length;
    const chords = S.chords.map((c) => CHORD(c).map((x) => x + tr));
    this.song = { S, lead, chords, bars, step: 60 / S.bpm / 4, t0: this.ctx.currentTime + 0.08, pos: 0, gen: (this.song?.gen || 0) + 1, leadIdx: 0, leadAt: 0 };
    this.song.total = bars * 16;
    this.buildEvents();
  }
  stopMusic() { this.song = null; this.songName = null; this.wantSong = null; }
  buildEvents() {
    // liste des notes d'une boucle complète, en doubles-croches
    const s = this.song, ev = [];
    let t = 0;
    for (const [n, l] of s.lead) { if (n != null) ev.push({ t, len: l, n, ch: 'lead' }); t += l; }
    for (let b = 0; b < s.bars; b++) {
      const [r, third, fifth] = s.chords[b], o = b * 16;
      const bm = s.S.bassMode;
      const root = 36 + ((r % 12) + 12) % 12;
      if (bm === 'drive') for (let k = 0; k < 8; k++) ev.push({ t: o + k * 2, len: 2, n: root + (k === 6 ? 7 : 0), ch: 'bass' });
      else if (bm === 'slow') { ev.push({ t: o, len: 8, n: root, ch: 'bass' }); ev.push({ t: o + 8, len: 8, n: root + 7, ch: 'bass' }); }
      else [0, 7, 12, 7].forEach((d, k) => ev.push({ t: o + k * 4, len: 4, n: root + d, ch: 'bass' }));
      const ch = [r, third, fifth].map((x) => 60 + ((x % 12) + 12) % 12);
      if (s.S.arp === 'up') [0, 1, 2, 1, 0, 1, 2, 1].forEach((k, j) => ev.push({ t: o + j * 2, len: 2, n: ch[k] - 12, ch: 'harm' }));
      else if (s.S.arp === 'off') for (let j = 0; j < 4; j++) for (const n of ch) ev.push({ t: o + j * 4 + 2, len: 1, n: n - 12, ch: 'harm', v: 0.5 });
      else for (const n of ch) ev.push({ t: o, len: 16, n: n - 12, ch: 'pad' });
      const dr = s.S.drums || '';
      for (let j = 0; j < dr.length && j < 16; j++) if (dr[j] !== '.') ev.push({ t: o + j, len: 1, ch: dr[j] });
    }
    ev.sort((a, b) => a.t - b.t);
    s.events = ev; s.next = 0; s.loop = 0;
  }
  schedule() {
    const s = this.song; if (!s || !this.ctx) return;
    const now = this.ctx.currentTime, ahead = now + 0.25;
    while (true) {
      if (s.next >= s.events.length) { s.next = 0; s.loop++; }
      const e = s.events[s.next];
      const at = s.t0 + (s.loop * s.total + e.t) * s.step;
      if (at > ahead) break;
      if (at >= now - 0.05) this.noteAt(e, at, e.len * s.step);
      s.next++;
    }
  }
  noteAt(e, at, dur) {
    const c = this.ctx, S = this.song?.S || {};
    if (e.ch === 'k' || e.ch === 's' || e.ch === 'h') return this.drum(e.ch, at);
    const o = c.createOscillator(), g = c.createGain();
    if (e.ch === 'bass') o.type = 'triangle';
    else o.setPeriodicWave(this.waves[e.ch === 'lead' ? S.duty || 0.25 : 0.5]);
    o.frequency.value = freq(e.n);
    const v = e.ch === 'lead' ? 0.32 : e.ch === 'bass' ? 0.5 : e.ch === 'pad' ? 0.08 : 0.12 * (e.v || 1);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + 0.008);
    g.gain.linearRampToValueAtTime(v * (e.ch === 'lead' ? 0.7 : 0.6), at + Math.min(dur * 0.5, 0.12));
    g.gain.setValueAtTime(v * 0.6, at + dur * 0.88); g.gain.linearRampToValueAtTime(0, at + dur * 0.98);
    if (e.ch === 'lead') { const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.5; lg.gain.value = dur > 0.3 ? freq(e.n) * 0.006 : 0; lfo.connect(lg); lg.connect(o.frequency); lfo.start(at + 0.15); lfo.stop(at + dur); }
    o.connect(g); g.connect(this.musicBus); o.start(at); o.stop(at + dur + 0.02);
  }
  drum(k, at) {
    const c = this.ctx;
    if (k === 'k') {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.12);
      g.gain.setValueAtTime(0.6, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      o.connect(g); g.connect(this.musicBus); o.start(at); o.stop(at + 0.15); return;
    }
    const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noise; f.type = k === 's' ? 'bandpass' : 'highpass'; f.frequency.value = k === 's' ? 1800 : 7000;
    const d = k === 's' ? 0.12 : 0.035;
    g.gain.setValueAtTime(k === 's' ? 0.35 : 0.12, at); g.gain.exponentialRampToValueAtTime(0.001, at + d);
    n.connect(f); f.connect(g); g.connect(this.musicBus); n.start(at, Math.random() * 0.5); n.stop(at + d + 0.01);
  }
  /** courte mélodie qui interrompt la musique puis la reprend */
  jingle(name) {
    if (!this.ctx) return Promise.resolve();
    const line = parseLine(JINGLES[name] || JINGLES.item), step = 60 / 130 / 4;
    const was = this.songName; this.song = null; this.songName = null;
    let t = this.ctx.currentTime + 0.05;
    for (const [n, l] of line) { if (n != null) { this.song = null; this.noteAt({ ch: 'lead', n, len: l }, t, l * step); this.noteAt({ ch: 'bass', n: n - 24, len: l }, t, l * step); } t += l * step; }
    const ms = (t - this.ctx.currentTime) * 1000 + 250;
    return new Promise((res) => setTimeout(() => { if (was && !this.songName) this.play(was, true); res(); }, ms));
  }

  // ---------------------------------------------------------------- bruitages
  sfx(id, o = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + 0.005;
    const tone = (f0, f1, d, type = 'square', v = 0.25, at = t, duty = 0.5) => {
      const osc = c.createOscillator(), g = c.createGain();
      if (type === 'pulse') osc.setPeriodicWave(this.waves[duty]); else osc.type = type;
      osc.frequency.setValueAtTime(f0, at); if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + d);
      g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.001, at + d);
      osc.connect(g); g.connect(this.sfxBus); osc.start(at); osc.stop(at + d + 0.02);
    };
    const noise = (d, fr, v = 0.3, at = t, type = 'lowpass') => {
      const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      n.buffer = this.noise; f.type = type; f.frequency.value = fr;
      g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.001, at + d);
      n.connect(f); f.connect(g); g.connect(this.sfxBus); n.start(at); n.stop(at + d + 0.02);
    };
    switch (id) {
      case 'select': tone(1200, 1200, 0.05, 'pulse', 0.15, t, 0.25); break;
      case 'move': tone(900, 900, 0.03, 'pulse', 0.1, t, 0.25); break;
      case 'back': tone(700, 500, 0.06, 'pulse', 0.14, t, 0.25); break;
      case 'bump': tone(90, 70, 0.08, 'square', 0.25); break;
      case 'door': noise(0.18, 900, 0.3); tone(200, 120, 0.15, 'triangle', 0.3); break;
      case 'jump': tone(300, 700, 0.12, 'pulse', 0.15, t, 0.5); break;
      case 'exclaim': tone(1400, 1400, 0.06, 'pulse', 0.18, t, 0.25); tone(1800, 1800, 0.1, 'pulse', 0.18, t + 0.07, 0.25); break;
      case 'hit': noise(0.12, 2200, 0.4); tone(180, 60, 0.12, 'square', 0.2); break;
      case 'hitSuper': noise(0.2, 3000, 0.5); tone(220, 50, 0.2, 'square', 0.28); tone(440, 100, 0.12, 'square', 0.15, t + 0.06); break;
      case 'hitWeak': noise(0.08, 1200, 0.25); break;
      case 'faint': tone(600, 80, 0.6, 'pulse', 0.2, t, 0.5); break;
      case 'ball': tone(1600, 400, 0.25, 'pulse', 0.12, t, 0.125); noise(0.2, 4000, 0.1, t, 'highpass'); break;
      case 'shake': tone(300, 260, 0.08, 'square', 0.2); noise(0.06, 900, 0.2); break;
      case 'open': tone(400, 1200, 0.2, 'pulse', 0.18, t, 0.25); noise(0.25, 5000, 0.12, t, 'highpass'); break;
      case 'stat': for (let k = 0; k < 4; k++) tone((o.down ? 900 - k * 120 : 500 + k * 140), (o.down ? 800 - k * 120 : 560 + k * 140), 0.06, 'pulse', 0.12, t + k * 0.06, 0.25); break;
      case 'heal': for (let k = 0; k < 5; k++) tone(700 + k * 180, 700 + k * 180, 0.07, 'pulse', 0.1, t + k * 0.05, 0.125); break;
      case 'run': for (let k = 0; k < 3; k++) noise(0.05, 2500, 0.2, t + k * 0.07); break;
      case 'buy': tone(1500, 1500, 0.06, 'pulse', 0.15, t, 0.25); tone(2000, 2000, 0.1, 'pulse', 0.15, t + 0.07, 0.25); break;
      case 'save': for (let k = 0; k < 3; k++) tone(600 + k * 300, 600 + k * 300, 0.08, 'pulse', 0.12, t + k * 0.09, 0.5); break;
      case 'status': tone(500, 300, 0.25, 'pulse', 0.12, t, 0.125); break;
      case 'cry': this.cry(o.seed || 1, o.pitch || 1); break;
      case 'text': tone(1000, 1000, 0.015, 'pulse', 0.05, t, 0.25); break;
    }
  }
  /** cri de créature : petite phrase synthétique unique par espèce */
  cry(seed, pitch = 1) {
    const c = this.ctx, t = c.currentTime + 0.01;
    let s = seed >>> 0; const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    const base = (220 + r() * 500) * pitch, n = 2 + Math.floor(r() * 3);
    let at = t;
    for (let k = 0; k < n; k++) {
      const d = 0.06 + r() * 0.12, f0 = base * (0.7 + r() * 0.9), f1 = f0 * (0.5 + r() * 1.2);
      const o = c.createOscillator(), g = c.createGain();
      o.setPeriodicWave(this.waves[[0.125, 0.25, 0.5][Math.floor(r() * 3)]]);
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + d);
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 18 + r() * 30; lg.gain.value = f0 * 0.08; lfo.connect(lg); lg.connect(o.frequency); lfo.start(at); lfo.stop(at + d);
      g.gain.setValueAtTime(0.0, at); g.gain.linearRampToValueAtTime(0.22, at + 0.01); g.gain.exponentialRampToValueAtTime(0.001, at + d);
      o.connect(g); g.connect(this.sfxBus); o.start(at); o.stop(at + d + 0.02);
      at += d * 0.8;
    }
  }
}
export const audio = new Audio();
