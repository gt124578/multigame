/* Golf Party — sons synthétisés (WebAudio), aucun fichier */
// volume : le curseur « Effets » des réglages (à 0, plus de son ; l'ancien bouton « son coupé » y est repris)
let ctx = null, master = null, noiseBuf = null, rollG = null, rollF = null, ambG = null, ambTimer = null;
DDVolume.legacy('minigolf_mute', ['fx']);
const muted = () => !(DDVolume.get('fx') > 0);

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.7;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(DDVolume.gain(ctx, 'fx')).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // roulement continu
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  rollF = ctx.createBiquadFilter(); rollF.type = 'lowpass'; rollF.frequency.value = 400; rollF.Q.value = 0.7;
  rollG = ctx.createGain(); rollG.gain.value = 0; src.connect(rollF); rollF.connect(rollG); rollG.connect(master); src.start();
}

function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function tone(type, f0, f1, dur, vol, delay = 0, dest = master) {
  if (!ctx) return; const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, type, f0, f1, q = 1, delay = 0) {
  if (!ctx) return; const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  env(g, t, 0.004, vol, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

const METAL = new Set(['metalw', 'neon', 'hazard', 'goldtrim']);
export const sfx = {
  putt(p) { noise(0.05, 0.5 + p * 0.4, 'bandpass', 2600, 2000, 2); tone('sine', 260 + p * 80, 120, 0.12, 0.35 + p * 0.3); },
  hit(s, mat) {
    const v = Math.min(0.85, s / 10);
    if (METAL.has(mat)) { tone('triangle', 900 + Math.random() * 200, 700, 0.25, 0.15 + v * 0.3); tone('sine', 1840, 1500, 0.3, 0.05 + v * 0.1); }
    else if (mat === 'rock' || mat === 'stonew' || mat === 'brick' || mat === 'stonecap') { noise(0.06, 0.25 + v * 0.4, 'bandpass', 1800, 900, 1.5); tone('sine', 420, 260, 0.06, 0.15 + v * 0.3); }
    else { tone('sine', 520 + Math.random() * 80, 330, 0.09, 0.2 + v * 0.45); noise(0.04, 0.15 + v * 0.3, 'bandpass', 1400, 900, 2); }
  },
  bumper() { tone('square', 220, 660, 0.12, 0.18); tone('sine', 880, 1320, 0.15, 0.15, 0.03); },
  bounce(s) { const v = Math.min(1, s / 8); tone('sine', 160, 70, 0.12, 0.25 + v * 0.4); noise(0.05, 0.1 + v * 0.2, 'lowpass', 900, 300); },
  sand() { noise(0.25, 0.35, 'bandpass', 1200, 500, 0.8); },
  ball(s) { const v = Math.min(1, s / 6); tone('sine', 1400, 1100, 0.05, 0.2 + v * 0.4); noise(0.03, 0.3 * v + 0.1, 'highpass', 3000, 3000); },
  cup() { [0, 0.07, 0.15].forEach((d, i) => { noise(0.035, 0.3 - i * 0.07, 'bandpass', 3200 - i * 600, 2200, 3, d); }); tone('sine', 180, 90, 0.25, 0.45, 0.18); },
  cheer(big) {
    const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
    notes.forEach((f, i) => { tone('triangle', f, f, 0.22, 0.22, i * 0.09); tone('sine', f * 2, f * 2, 0.18, 0.06, i * 0.09); });
    if (big) for (let i = 0; i < 18; i++) noise(0.08, 0.12, 'bandpass', 2000 + Math.random() * 3000, 1500, 2, 0.4 + i * 0.05);
  },
  water() { noise(0.5, 0.55, 'lowpass', 3000, 300, 0.7); tone('sine', 700, 200, 0.2, 0.15); },
  lava() { noise(1.0, 0.4, 'highpass', 2500, 5000, 0.6); tone('sawtooth', 120, 50, 0.4, 0.12); },
  out() { tone('sine', 140, 60, 0.2, 0.4); tone('triangle', 392, 330, 0.18, 0.12, 0.25); tone('triangle', 330, 262, 0.3, 0.12, 0.45); },
  boost() { noise(0.45, 0.35, 'bandpass', 500, 3500, 2); tone('sawtooth', 220, 880, 0.35, 0.08); },
  tramp() { tone('sine', 180, 520, 0.22, 0.35); },
  slow() { tone('sine', 300, 120, 0.5, 0.15); noise(0.4, 0.15, 'lowpass', 600, 200, 1); },
  flip(sg) { tone('sine', sg < 0 ? 300 : 900, sg < 0 ? 900 : 300, 0.35, 0.18); tone('triangle', sg < 0 ? 450 : 1350, sg < 0 ? 1350 : 450, 0.35, 0.06); },
  tele() { tone('sine', 300, 1600, 0.3, 0.2); tone('sine', 1600, 300, 0.3, 0.15, 0.25); },
  turn() { tone('triangle', 660, 660, 0.12, 0.18); tone('triangle', 990, 990, 0.2, 0.18, 0.12); },
  tick() { tone('square', 1200, 1200, 0.03, 0.06); },
  click() { tone('triangle', 800, 600, 0.05, 0.12); },
  ace() { sfx.cheer(true); [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, f, 0.3, 0.07, 0.5 + i * 0.12)); },
  /** volume du roulement selon la vitesse de la balle suivie */
  roll(speed, grounded, sand) {
    if (!rollG) return; const v = grounded ? Math.min(1, speed / 10) : 0;
    rollG.gain.setTargetAtTime(v * (sand ? 0.25 : 0.18), ctx.currentTime, 0.05);
    rollF.frequency.setTargetAtTime(sand ? 1500 : 250 + v * 900, ctx.currentTime, 0.05);
  },
};

/** Ambiance discrète par parcours */
export function ambience(theme) {
  if (!ctx) return;
  if (ambTimer) clearInterval(ambTimer);
  if (ambG) { ambG.gain.setTargetAtTime(0, ctx.currentTime, 0.3); }
  const g = ambG = ctx.createGain(); g.gain.value = 0; g.connect(master);
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); s.connect(f); f.connect(g); s.start();
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.connect(lg);
  if (theme === 'pirate') { f.type = 'lowpass'; f.frequency.value = 600; lfo.frequency.value = 0.12; lg.gain.value = 0.05; lg.connect(g.gain); g.gain.setTargetAtTime(0.07, ctx.currentTime, 1); }
  else if (theme === 'forge') { f.type = 'lowpass'; f.frequency.value = 140; lfo.frequency.value = 0.3; lg.gain.value = 0.04; lg.connect(g.gain); g.gain.setTargetAtTime(0.12, ctx.currentTime, 1); }
  else if (theme === 'zen') { f.type = 'bandpass'; f.frequency.value = 900; lfo.frequency.value = 0.07; lg.gain.value = 0.01; lg.connect(g.gain); g.gain.setTargetAtTime(0.015, ctx.currentTime, 1); }
  else { f.type = 'highpass'; f.frequency.value = 3000; g.gain.setTargetAtTime(0.008, ctx.currentTime, 1); }
  lfo.start();
  ambTimer = setInterval(() => {
    if (!ctx || muted()) return;
    if ((theme === 'park' || theme === 'marathon') && Math.random() < 0.5) { const b = 2200 + Math.random() * 1500; for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) tone('sine', b, b * 1.25, 0.07, 0.03, i * 0.11); }
    if (theme === 'zen' && Math.random() < 0.35) { const n = [523, 587, 659, 784, 880, 1047][(Math.random() * 6) | 0]; tone('sine', n, n, 2.2, 0.035); tone('sine', n * 2.76, n * 2.76, 1.2, 0.01); }
    if (theme === 'pirate' && Math.random() < 0.2) { tone('sine', 1800, 1300, 0.25, 0.02); tone('sine', 1700, 1200, 0.3, 0.02, 0.3); }
    if (theme === 'forge' && Math.random() < 0.3) { noise(0.3, 0.06, 'highpass', 3000, 6000); tone('triangle', 70, 60, 0.6, 0.06); }
  }, 1800);
}
