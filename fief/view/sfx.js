// Fief Maudit : les sons. Enregistrements libres (CC0) déjà dans Arcadia : coups dans le bois et pas d'Island Rush,
// arbre et ambiance de campagne de Birdie Party (crédits dans royale/sounds/LICENSE.txt et golf/sounds/LICENSE.txt).
// Ce qui manque est synthétisé (WebAudio). Le contexte audio naît au premier geste. Les niveaux (musique, effets)
// viennent du panneau Réglages commun d'Arcadia (shared/volume.js).
import { Music } from './music.js';
const V = window.DDVolume;
const R = '../royale/sounds/', G = '../golf/sounds/';
const BANK = {
  hache: [R + 'impact-bois-1.mp3', R + 'impact-bois-2.mp3', R + 'impact-bois-3.mp3'],
  souffle: [G + 'swoosh.mp3'],
  arbre: [G + 'tree.mp3'], tronc: [G + 'trunk.mp3'],
  craque: [R + 'grince-1.mp3', R + 'grince-2.mp3'],
  sol: [R + 'impact-sol-1.mp3', R + 'impact-sol-2.mp3', R + 'impact-sol-3.mp3'],
  herbe: [1, 2, 3, 4, 5].map((i) => R + `pas-herbe-${i}.mp3`),
  gravier: [1, 2, 3, 4, 5].map((i) => R + `pas-gravier-${i}.mp3`),
  bois: [1, 2, 3, 4, 5].map((i) => R + `pas-bois-${i}.mp3`),
  ui: [G + 'ui-confirm.mp3'],
  os: [R + 'impact-bois-1.mp3', R + 'impact-bois-3.mp3'],
  bouclier: [R + 'impact-bouclier-1.mp3', R + 'impact-bouclier-2.mp3', R + 'impact-bouclier-3.mp3'],
  coup: [R + 'impact-corps-1.mp3', R + 'impact-corps-2.mp3', R + 'impact-corps-3.mp3'],
  terre: [R + 'impact-sol-1.mp3', R + 'impact-sol-2.mp3'],
  feu: [G + 'swoosh.mp3'],
  aube: [G + 'jingle-good.mp3'],
};

export class Sfx {
  constructor() { this.ctx = null; this.buf = new Map(); this.amb = null; this.mood = null; if (V) V.legacy('fief_mute'); }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    this.out = V ? V.gain(this.ctx, 'fx') : this.ctx.createGain(); this.out.connect(this.ctx.destination);
    const mus = V ? V.gain(this.ctx, 'music') : this.ctx.createGain(); mus.connect(this.ctx.destination);
    this.music = new Music(this.ctx, mus); if (this.mood) this.music.set(this.mood);
    for (const [k, list] of Object.entries(BANK)) list.forEach((u, i) => fetch(u).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((d) => { if (!this.buf.has(k)) this.buf.set(k, []); this.buf.get(k)[i] = d; }).catch(() => {}));
    // ambiance de campagne en boucle
    fetch(G + 'amb-campagne.mp3').then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((d) => {
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = d; s.loop = true; g.gain.value = this.isNight ? 0.08 : 0.35; s.connect(g).connect(this.out); s.start(); this.amb = g;
    }).catch(() => {});
  }
  toggleMute() { return V ? V.toggle() : false; }
  setMood(m) { this.mood = m; if (this.music) this.music.set(m); }
  // l'ambiance de la vallée se tait sous terre
  under(on) { if (!this.ctx || this.isUnder === on) return; this.isUnder = on; const t = this.ctx.currentTime; if (this.amb) this.amb.gain.setTargetAtTime(on ? 0 : this.isNight ? 0.08 : 0.35, t, 1); if (this.wind) this.wind.gain.setTargetAtTime(on ? 0.12 : this.isNight ? 0.5 : 0, t, 1.5); }
  // vol : 0..1 ; dist : mètres jusqu'à la caméra (atténue)
  play(k, { vol = 1, rate = 1, dist = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const list = (this.buf.get(k) || []).filter(Boolean);
    const att = 1 / (1 + Math.max(0, dist - 4) * 0.12);
    if (k === 'cloche') return this.bell(vol * att, rate, delay);
    if (!list.length) return this.synth(k, vol * att, delay);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = list[Math.floor(Math.random() * list.length)];
    s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    g.gain.value = vol * att;
    s.connect(g).connect(this.out); s.start(this.ctx.currentTime + delay);
  }
  // la nuit : la campagne se tait, un vent sourd se lève
  night(on) {
    this.isNight = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.amb) this.amb.gain.setTargetAtTime(on ? 0.08 : 0.35, t, 2);
    if (!this.wind) {
      const len = this.ctx.sampleRate * 4, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      let v = 0; for (let i = 0; i < len; i++) { v = v * 0.985 + (Math.random() * 2 - 1) * 0.015; d[i] = v * 3; }
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(f).connect(g).connect(this.out); s.start(); this.wind = g;
    }
    this.wind.gain.setTargetAtTime(on ? 0.5 : 0, t, 2.5);
  }
  // cloche du village (synthèse : quelques partiels qui s'éteignent lentement)
  bell(vol, rate, delay) {
    const c = this.ctx, t = c.currentTime + delay;
    for (const [f, a, d] of [[1, 1, 3.5], [2.4, 0.5, 2.2], [3.0, 0.35, 1.6], [4.5, 0.2, 1.0], [0.5, 0.4, 4]]) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 220 * rate * f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * a * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.out); o.start(t); o.stop(t + d + 0.1);
    }
  }
  // repli : un coup sourd
  synth(k, vol, delay) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(k === 'ui' ? 660 : 140, t); o.frequency.exponentialRampToValueAtTime(k === 'ui' ? 990 : 60, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.25);
  }
}
