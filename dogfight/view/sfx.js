// Sons de Dogfight 3D, synthétisés avec WebAudio : réacteur, canon, explosions, et alarmes.
// Tout ce qui vient d'un autre avion est placé dans l'espace : volume selon la distance, gauche ou droite selon la caméra.

export class DogfightAudio {
  constructor() {
    this.ctx = null; this.unlocked = false;
    this.cam = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 };
    this.alarmT = { ground: 0, missile: 0, lock: 0 };
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.fx = window.DDVolume ? window.DDVolume.gain(this.ctx, 'fx') : this.ctx.createGain();
    if (!window.DDVolume) this.fx.gain.value = 0.8;
    this.fx.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.startEngine();
    this.startGun();
    this.unlocked = true;
  }

  startEngine() {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    this.engF = c.createBiquadFilter(); this.engF.type = 'bandpass'; this.engF.frequency.value = 320; this.engF.Q.value = 1.8;
    this.engG = c.createGain(); this.engG.gain.value = 0;
    src.connect(this.engF).connect(this.engG).connect(this.fx); src.start();
    this.turb = c.createOscillator(); this.turb.type = 'triangle'; this.turb.frequency.value = 420;
    const g = c.createGain(); g.gain.value = 0.06;
    this.turb.connect(g).connect(this.engG); this.turb.start();
  }

  // Canon en boucle : plus de cinquante oscillateurs par seconde en moins, et un vrai BRRRT
  startGun() {
    const c = this.ctx, saw = c.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = 95;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.7;
    const am = c.createGain(); am.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 25;
    const depth = c.createGain(); depth.gain.value = 0.5; lfo.connect(depth).connect(am.gain);
    this.gunG = c.createGain(); this.gunG.gain.value = 0;
    const sg = c.createGain(); sg.gain.value = 0.3;
    saw.connect(sg).connect(am); src.connect(nf).connect(am); am.connect(this.gunG).connect(this.fx);
    saw.start(); src.start(); lfo.start();
  }

  setListener(pos, right) { this.cam.x = pos.x; this.cam.y = pos.y; this.cam.z = pos.z; this.cam.rx = right.x; this.cam.ry = right.y; this.cam.rz = right.z; }

  // Sortie placée dans l'espace, ou null si c'est trop loin pour s'entendre
  spatial(x, y, z, reach = 1500, vol = 1) {
    if (!this.ctx) return null;
    const dx = x - this.cam.x, dy = y - this.cam.y, dz = z - this.cam.z, d = Math.hypot(dx, dy, dz), g = vol * Math.min(1, 90 / Math.max(90, d)) * (1 - Math.min(1, d / reach));
    if (g < 0.01) return null;
    const c = this.ctx, gain = c.createGain(); gain.gain.value = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = d > 1 ? Math.max(-1, Math.min(1, (dx * this.cam.rx + dy * this.cam.ry + dz * this.cam.rz) / d)) : 0; gain.connect(p).connect(this.fx); }
    else gain.connect(this.fx);
    return gain;
  }

  updateEngine(speed, boosting, braking, alive) {
    if (!this.unlocked) return;
    const t = this.ctx.currentTime;
    this.engF.frequency.setTargetAtTime(boosting ? 650 : braking ? 220 : 300 + (speed / 200) * 220, t, 0.15);
    this.turb.frequency.setTargetAtTime(boosting ? 880 : 320 + (speed / 200) * 300, t, 0.15);
    this.engG.gain.setTargetAtTime(!alive ? 0 : boosting ? 0.42 : braking ? 0.14 : 0.24, t, 0.12);
  }
  setFiring(on) { if (this.unlocked) this.gunG.gain.setTargetAtTime(on ? 0.34 : 0, this.ctx.currentTime, 0.012); }
  silence() { if (!this.unlocked) return; const t = this.ctx.currentTime; this.engG.gain.setTargetAtTime(0, t, 0.2); this.gunG.gain.setTargetAtTime(0, t, 0.02); }

  tone(out, type, f0, f1, dur, vol) {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.008, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(out, dur, vol, f0 = 600, f1 = 80) {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(f0, t); f.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.008, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  // Le canon d'un autre avion : quelques claquements, au loin
  otherGun(x, y, z) { const o = this.spatial(x, y, z, 1100, 0.5); if (o) this.tone(o, 'sawtooth', 130, 40, 0.05, 0.3); }
  // Mon tir touche
  hitConfirm() { if (this.unlocked) this.tone(this.fx, 'triangle', 1500, 900, 0.05, 0.16); }
  // On me touche : impact sec dans la carlingue
  hitMe() { if (!this.unlocked) return; this.tone(this.fx, 'square', 240, 60, 0.09, 0.42); this.burst(this.fx, 0.1, 0.4, 2600, 500); }
  // Un autre avion est touché
  hitOther(x, y, z) { const o = this.spatial(x, y, z, 900, 0.5); if (o) this.tone(o, 'triangle', 320, 70, 0.07, 0.4); }
  explosion(x, y, z, big = true) {
    if (!this.unlocked) return;
    const o = this.spatial(x, y, z, 3200, big ? 1.5 : 0.8); if (!o) return;
    this.tone(o, 'sine', 110, 18, big ? 0.7 : 0.35, 0.85); this.burst(o, big ? 0.7 : 0.35, 0.7);
  }
  missileLaunch(x, y, z) { const o = this.spatial(x, y, z, 1500, 1.1); if (o) this.burst(o, 0.8, 0.5, 1800, 300); }
  overheat() { if (this.unlocked) { this.tone(this.fx, 'sine', 800, 800, 0.08, 0.25); setTimeout(() => this.unlocked && this.tone(this.fx, 'sine', 600, 600, 0.1, 0.25), 90); } }
  flare() { if (this.unlocked) this.burst(this.fx, 0.25, 0.3, 3000, 900); }
  start() { if (this.unlocked) this.tone(this.fx, 'triangle', 660, 990, 0.25, 0.3); }
  count() { if (this.unlocked) this.tone(this.fx, 'sine', 520, 520, 0.12, 0.25); }
  win() { if (!this.unlocked) return; [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.unlocked && this.tone(this.fx, 'triangle', f, f, 0.22, 0.28), i * 130)); }
  lose() { if (!this.unlocked) return; [392, 330, 262].forEach((f, i) => setTimeout(() => this.unlocked && this.tone(this.fx, 'triangle', f, f, 0.3, 0.25), i * 180)); }

  // Une récompense : deux notes qui montent
  reward() { if (!this.unlocked) return; [880, 1320].forEach((f, i) => setTimeout(() => this.unlocked && this.tone(this.fx, 'triangle', f, f, 0.14, 0.2), i * 80)); }
  zoneWon() { if (!this.unlocked) return; [587, 784, 988].forEach((f, i) => setTimeout(() => this.unlocked && this.tone(this.fx, 'sine', f, f, 0.2, 0.24), i * 90)); }
  zoneLost() { if (!this.unlocked) return; [494, 370].forEach((f, i) => setTimeout(() => this.unlocked && this.tone(this.fx, 'sine', f, f, 0.26, 0.24), i * 130)); }

  // Alarmes en bips réguliers
  alarms(dt, { ground, missile, lock, locked }) {
    if (!this.unlocked) return;
    const A = this.alarmT;
    A.ground -= dt; A.missile -= dt; A.lock -= dt;
    if (ground && A.ground <= 0) { A.ground = 0.42; this.tone(this.fx, 'square', 760, 760, 0.14, 0.14); }
    if (missile && A.missile <= 0) { A.missile = 0.2; this.tone(this.fx, 'sawtooth', 1250, 1250, 0.09, 0.14); }
    if (locked && A.lock <= 0) { A.lock = 0.1; this.tone(this.fx, 'sine', 1400, 1400, 0.07, 0.1); }
    else if (lock > 0 && !locked && A.lock <= 0) { A.lock = 0.32 - lock * 0.18; this.tone(this.fx, 'sine', 700 + lock * 500, 700 + lock * 500, 0.05, 0.08); }
  }

  dispose() { this.unlocked = false; if (this.ctx) { try { this.ctx.close(); } catch (e) { /* déjà fermé */ } this.ctx = null; } }
}
