// Fief Maudit : la musique, jouée par le navigateur (WebAudio, rien à télécharger). Quatre humeurs qui se fondent
// l'une dans l'autre : le jour (luth pincé en ré dorien sur un bourdon de quinte), la nuit (bourdon grave, cloches
// éparses en mineur), la crypte (nappe de voix sombres, gouttes) et le Roi (tambours, ostinato de cordes graves).
// Un petit séquenceur regarde 0,2 s devant et place les notes à l'heure exacte du contexte audio.
const D_DORIAN = [0, 2, 3, 5, 7, 9, 10];
const A_MINOR = [0, 2, 3, 5, 7, 8, 10];
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = out; this.mood = null; this.beat = 0; this.next = 0; this.bar = 0;
    this.rand = 1;
    // un peu d'écho pour la salle
    const d = ctx.createDelay(1.2), fb = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter();
    d.delayTime.value = 0.36; fb.gain.value = 0.32; wet.gain.value = 0.28; lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.55;
    this.bus.connect(out); this.bus.connect(d); d.connect(lp).connect(fb).connect(d); lp.connect(wet).connect(out);
    this.layers = {};
    for (const k of ['day', 'night', 'crypt', 'boss']) { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.bus); this.layers[k] = g; }
    this.drones = {};
    this.timer = setInterval(() => this.tick(), 90);
  }
  rnd() { this.rand = (this.rand * 16807) % 2147483647; return this.rand / 2147483647; }
  // humeur voulue : 'day' | 'night' | 'crypt' | 'boss' | null (silence)
  set(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    const t = this.ctx.currentTime;
    for (const [k, g] of Object.entries(this.layers)) g.gain.setTargetAtTime(k === mood ? 1 : 0, t, mood === 'boss' || k === 'boss' ? 0.6 : 2.2);
    if (mood && !this.drones[mood]) this.drones[mood] = this.drone(mood);
  }
  // bourdons tenus, un par humeur
  drone(mood) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass';
    const notes = { day: [38, 45], night: [33, 40, 45], crypt: [28, 35, 40], boss: [28, 34] }[mood];
    g.gain.value = { day: 0.05, night: 0.08, crypt: 0.1, boss: 0.09 }[mood];
    lp.frequency.value = mood === 'day' ? 600 : 380;
    for (const n of notes) for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = mood === 'crypt' ? 'sawtooth' : 'triangle'; o.frequency.value = hz(n); o.detune.value = det;
      o.connect(lp); o.start();
    }
    // la nappe respire
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = mood === 'crypt' ? 220 : 120; lfo.connect(lg).connect(lp.frequency); lfo.start();
    lp.connect(g).connect(this.layers[mood]);
    return g;
  }
  pluck(t, midi, vol, layer, { dur = 1.6, type = 'triangle', bright = 2600 } = {}) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o2.type = 'sine'; o.frequency.value = hz(midi); o2.frequency.value = hz(midi + 12); o2.detune.value = 4;
    f.type = 'lowpass'; f.frequency.setValueAtTime(bright, t); f.frequency.exponentialRampToValueAtTime(300, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.3;
    o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(this.layers[layer]);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  bell(t, midi, vol, layer) {
    const c = this.ctx;
    for (const [m, a, d] of [[1, 1, 3.2], [2.76, 0.4, 1.8], [5.4, 0.15, 0.9]]) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = hz(midi) * m;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.layers[layer]); o.start(t); o.stop(t + d + 0.05);
    }
  }
  drum(t, vol, low = true) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(low ? 110 : 190, t); o.frequency.exponentialRampToValueAtTime(low ? 42 : 80, t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.layers.boss); o.start(t); o.stop(t + 0.55);
    // la peau : un souffle filtré
    const n = c.createBufferSource(), nb = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    const ng = c.createGain(), nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = low ? 300 : 900; ng.gain.value = vol * 0.6;
    n.buffer = nb; n.connect(nf).connect(ng).connect(this.layers.boss); n.start(t);
  }
  tick() {
    const c = this.ctx; if (!this.mood || c.state !== 'running') { this.next = c.currentTime + 0.1; return; }
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.2) { this.play(this.mood, this.next, this.beat); this.beat++; this.next += this.step(); }
  }
  step() { return { day: 0.42, night: 0.6, crypt: 0.75, boss: 0.2 }[this.mood] || 0.5; }
  play(mood, t, b) {
    const r = () => this.rnd();
    if (mood === 'day') {
      // une phrase de luth de 16 croches, reprise et variée ; repos un tour sur quatre
      const phrase = Math.floor(b / 16) % 4, i = b % 16;
      if (phrase === 3) { if (i === 0) this.pluck(t, 50, 0.1, 'day', { dur: 3 }); return; }
      const deg = [0, 4, 2, 4, 3, 2, 1, 2, 0, 4, 5, 4, 3, 2, 1, 0][i] + (phrase === 1 && i > 8 ? 2 : 0);
      if (i % 2 === 0 || r() < 0.55) this.pluck(t, 62 + D_DORIAN[deg % 7] + 12 * Math.floor(deg / 7), 0.07 + (i % 4 === 0 ? 0.04 : 0), 'day');
      if (i % 8 === 0) this.pluck(t, 50 + (i === 8 ? 7 : 0), 0.08, 'day', { dur: 2.4, bright: 1200 });
    } else if (mood === 'night') {
      if (r() < 0.28) { const deg = Math.floor(r() * 7); this.bell(t, 69 + A_MINOR[deg] - (r() < 0.5 ? 12 : 0), 0.05, 'night'); }
      if (b % 16 === 0) this.pluck(t, 45, 0.09, 'night', { dur: 4, bright: 700, type: 'sine' });
    } else if (mood === 'crypt') {
      // gouttes d'eau et une note grave qui tombe de temps en temps
      if (r() < 0.22) this.pluck(t, 84 + Math.floor(r() * 7) * 2, 0.03, 'crypt', { dur: 0.35, type: 'sine', bright: 5000 });
      if (b % 12 === 0) this.bell(t, 40 + [0, 3, -2, 1][Math.floor(b / 12) % 4], 0.07, 'crypt');
    } else if (mood === 'boss') {
      // 16 doubles croches : grosse caisse, caisse claire, ostinato grave en mi mineur
      const i = b % 16, bar = Math.floor(b / 16) % 4;
      if ([0, 3, 6, 8, 11, 14].includes(i)) this.drum(t, i === 0 || i === 8 ? 0.5 : 0.3, true);
      if (i === 4 || i === 12) this.drum(t, 0.22, false);
      const root = [40, 40, 41, 38][bar];
      if (i % 2 === 0) this.pluck(t, root + (i % 4 === 2 ? 7 : 0) + (i === 14 ? 3 : 0), 0.09, 'boss', { dur: 0.4, type: 'sawtooth', bright: 900 });
      if (i === 0) this.pluck(t, root + 24 + (bar === 3 ? 3 : 0), 0.05, 'boss', { dur: 1.6, type: 'square', bright: 1600 });
    }
  }
}
