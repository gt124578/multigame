// odyssee/js/audio.js — musique « chiptune » originale générée à partir de grilles d'accords, et bruitages synthétisés.
// Aucun morceau existant n'est repris : mélodies composées par un générateur à graine (toujours les mêmes pour un thème).

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const midiOf = (n) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return 12 * (+m[2] + 1) + NOTE[m[1]]; };
const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11] };

/* ---------------- thèmes : tonalité, tempo, grille, caractère ---------------- */
const at = (bar, step) => bar * 16 + step;

export const THEMES = {
  title: { custom: 'title', key: 'B3', scale: 'min', bpm: 138, prog: ['i'], seed: 11, style: 'battle' },
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
  // Musiques épiques écrites à la main pour les combats de boss
  leader: { custom: 'leader', key: 'E3', scale: 'harm', bpm: 175, prog: ['i'], seed: 141, style: 'battle', big: 1 },
  gymTension: { custom: 'gymTension', key: 'G3', scale: 'maj', bpm: 188, prog: ['i'], seed: 212, style: 'battle', big: 1 },
  champion: { custom: 'champion', key: 'C3', scale: 'harm', bpm: 178, prog: ['i'], seed: 151, style: 'battle', big: 1 },
  legend: { custom: 'legend', key: 'B2', scale: 'harm', bpm: 164, prog: ['i'], seed: 250, style: 'battle', big: 1 },
  eclipse: { custom: 'eclipse', key: 'F3', scale: 'harm', bpm: 170, prog: ['i'], seed: 191, style: 'battle' },
  rival: { custom: 'rival', key: 'D3', scale: 'harm', bpm: 172, prog: ['i'], seed: 161, style: 'battle' },
  tower: { key: 'A2', scale: 'dor', bpm: 88, prog: ['i', 'IV', 'i', 'VII', 'i', 'IV', 'VI', 'V'], seed: 77, style: 'mystery' },
  snow: { key: 'F3', scale: 'min', bpm: 100, prog: ['i', 'VI', 'III', 'VII', 'i', 'iv', 'VI', 'V'], seed: 144, style: 'mystery' },
  island: { key: 'A3', scale: 'maj', bpm: 124, prog: ['I', 'IV', 'V', 'vi', 'I', 'IV', 'ii', 'V'], seed: 91, style: 'march' },
  victory: { key: 'C4', scale: 'maj', bpm: 132, prog: ['I', 'IV', 'V', 'I'], seed: 171, style: 'anthem' },
  evolution: { key: 'F3', scale: 'maj', bpm: 120, prog: ['I', 'ii', 'IV', 'V'], seed: 181, style: 'gentle' },
  hideout: { key: 'C3', scale: 'min', bpm: 112, prog: ['i', 'iv', 'VI', 'V', 'i', 'iv', 'VII', 'V'], seed: 195, style: 'mystery' },
  sanctuary: { key: 'A2', scale: 'min', bpm: 78, prog: ['i', 'VI', 'III', 'VII', 'i', 'iv', 'VI', 'V'], seed: 205, style: 'mystery', soft: 1 },
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

/**
 * Thème de l'écran titre, écrit à la main : il commence tout doucement (nappes et clochettes sur la mer de nuit),
 * puis un riff rapide en doubles croches monte en puissance, un roulement de toms… et la batterie entre avec la
 * guitare saturée. Après l'introduction, seule la partie énergique tourne en boucle.
 */
function composeTitle() {
  const B = 59, tracks = { pad: [], bell: [], riff: [], gtr: [], bass: [], lead: [], drum: [] };
  // accords (racines, en demi-tons au-dessus de si) : si mineur, sol, ré, la
  const CH = { Bm: [0, 3, 7], G: [-4, 0, 3], D: [3, 7, 10], A: [-2, 2, 5], E: [5, 8, 12], Fs: [7, 10, 14] };
  // A · introduction calme (4 mesures) : nappe tenue et quelques notes de clochette
  const intro = ['Bm', 'G', 'D', 'A'];
  intro.forEach((c, b) => {
    for (const t of CH[c]) tracks.pad.push({ s: at(b, 0), d: 16, m: B - 12 + t, v: 0.5 + b * 0.15 });
    [[0, 7], [6, 3], [10, 0], [12, 10]].forEach(([st, iv], k) => { if (b === 3 && k === 3) return; tracks.bell.push({ s: at(b, st), d: 4, m: B + 12 + CH[c][0] + iv, v: 0.6 }); });
  });
  // le riff : la note pédale (fa dièse) une double croche sur deux, une ligne d'accord qui monte et redescend
  const riffBar = (c) => { const t = CH[c], line = [t[0], t[1], t[2], t[1], t[2], t[1], t[0] + 12, t[2]]; const out = []; for (let k = 0; k < 8; k++) { out.push(B + line[k]); out.push(B + 7); } return out; };
  const prog = ['Bm', 'Bm', 'G', 'A', 'Bm', 'Bm', 'E', 'Fs'];
  // B · le riff seul, de plus en plus fort (4 mesures), puis un roulement de toms
  for (let b = 4; b < 8; b++) {
    const notes = riffBar(prog[b - 4]);
    notes.forEach((m, k) => tracks.riff.push({ s: at(b, k), d: 1, m, v: 0.25 + 0.75 * ((b - 4) * 16 + k) / 64 }));
    if (b >= 6) tracks.pad.push({ s: at(b, 0), d: 16, m: B - 24 + CH[prog[b - 4]][0], v: 0.6 });
  }
  for (let k = 8; k < 16; k++) tracks.drum.push({ s: at(7, k), k: 't', m: 60 - k * 2, v: 0.5 + k * 0.04 });
  // C · tout le monde (8 mesures, en boucle) : batterie, basse, guitare saturée, et une mélodie la seconde fois
  const melody = [[0, 4, 12], [4, 2, 14], [6, 2, 15], [8, 6, 19], [14, 2, 17], [16, 4, 15], [20, 4, 14], [24, 8, 12],
    [32, 4, 7], [36, 2, 8], [38, 2, 12], [40, 6, 15], [46, 2, 14], [48, 4, 12], [52, 4, 10], [56, 8, 7]];
  for (let b = 8; b < 24; b++) {
    const c = prog[(b - 8) % 8], t = CH[c];
    riffBar(c).forEach((m, k) => tracks.riff.push({ s: at(b, k), d: 1, m, v: 1 }));
    // guitare saturée : quintes (accords « en puissance ») sur les temps forts
    for (const [st, d] of [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]]) { tracks.gtr.push({ s: at(b, st), d, m: B - 12 + t[0], v: 1 }); tracks.gtr.push({ s: at(b, st), d, m: B - 12 + t[0] + 7, v: 0.8 }); }
    for (let k = 0; k < 16; k += 2) tracks.bass.push({ s: at(b, k), d: 2, m: B - 24 + t[0] + (k === 12 ? 7 : 0) });
    for (let k = 0; k < 16; k++) {
      if (k % 4 === 0) tracks.drum.push({ s: at(b, k), k: 'k' });
      if (k === 10) tracks.drum.push({ s: at(b, k), k: 'k' });
      if (k % 8 === 4) tracks.drum.push({ s: at(b, k), k: 's' });
      if (k % 2 === 0) tracks.drum.push({ s: at(b, k), k: 'h' });
    }
    if ((b - 8) % 8 === 0) tracks.drum.push({ s: at(b, 0), k: 'c' });
    if ((b - 8) % 8 === 7) for (const k of [12, 13, 14, 15]) tracks.drum.push({ s: at(b, k), k: 's', v: 0.7 + (k - 12) * 0.1 });
    // la seconde moitié de la boucle (mesures 16 à 23) porte la mélodie : deux fois ses quatre mesures
    if (b >= 16) for (const [st, d, iv] of melody) if (Math.floor(st / 16) === (b - 16) % 4) tracks.lead.push({ s: at(b, st % 16), d, m: B + iv });
  }
  return {
    steps: 24 * 16, loopStart: 8 * 16, bpm: 138,
    // volumes un peu au-dessus des autres musiques (c'est l'écran titre), sans écraser l'introduction
    tracks: [
      { type: 'triangle', vol: 0.09, notes: tracks.pad, attack: 0.6 }, { type: 'pulse12', vol: 0.05, notes: tracks.bell, release: 0.3 },
      { type: 'pulse25', vol: 0.06, notes: tracks.riff }, { type: 'sawtooth', vol: 0.028, notes: tracks.gtr, dist: true },
      { type: 'triangle', vol: 0.14, notes: tracks.bass }, { type: 'pulse50', vol: 0.05, notes: tracks.lead },
      { type: 'drum', vol: 0.09, notes: tracks.drum },
    ],
  };
}


/* ---------------- compositions épiques de boss écrites à la main ---------------- */

function composeLeader() {
  const B = midiOf('E3'); // 52
  const tracks = { pad: [], riff: [], gtr: [], bass: [], lead: [], harm: [], drum: [] };

  const CHORDS = {
    Em:  { root: 0,  tones: [0, 3, 7] },
    G:   { root: 3,  tones: [3, 7, 10] },
    A:   { root: 5,  tones: [5, 9, 12] },
    Am:  { root: 5,  tones: [5, 8, 12] },
    C:   { root: -4, tones: [-4, 0, 3] },
    D:   { root: -2, tones: [-2, 2, 5] },
    B7:  { root: -1, tones: [-1, 3, 6] },
    Bsus:{ root: -1, tones: [-1, 4, 6] },
  };

  // --- INTRO (Mesures 0 à 3) ---
  for (let s = 0; s < 16; s++) {
    tracks.drum.push({ s: at(0, s), k: s >= 8 && s % 2 === 1 ? 't' : 's', v: 0.35 + (s / 16) * 0.55, m: 58 - s });
    if (s % 2 === 0) tracks.drum.push({ s: at(0, s), k: 'h', v: 0.5 });
  }
  const bassIntro = [0, 3, 5, 7, 10, 12, 14, 15];
  bassIntro.forEach((iv, k) => tracks.bass.push({ s: at(0, k * 2), d: 2, m: B - 12 + iv }));

  [0, 3, 6, 8, 11, 14].forEach((s) => {
    tracks.gtr.push({ s: at(1, s), d: 2, m: B + 0, v: 0.9 });
    tracks.gtr.push({ s: at(1, s), d: 2, m: B + 7, v: 0.8 });
    tracks.drum.push({ s: at(1, s), k: 's', v: 0.8 });
    tracks.drum.push({ s: at(1, s), k: 'k', v: 0.9 });
  });
  for (let s = 0; s < 16; s += 2) tracks.drum.push({ s: at(1, s), k: 'h', v: 0.7 });

  const fanfareLead = [
    [0, 3, 12], [3, 3, 15], [6, 2, 19], [8, 4, 24], [12, 4, 22],
    [16, 3, 19], [19, 3, 17], [22, 2, 19], [24, 4, 23], [28, 4, 24]
  ];
  fanfareLead.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: at(2, st), d, m: B + iv, v: 1 });
    tracks.harm.push({ s: at(2, st), d, m: B + iv - 4, v: 0.75 });
  });
  [0, 4, 8, 12].forEach((s) => {
    tracks.drum.push({ s: at(2, s), k: 'k', v: 1 });
    tracks.drum.push({ s: at(3, s), k: 'k', v: 1 });
    tracks.drum.push({ s: at(2, s + 2), k: 's', v: 0.8 });
  });
  for (let s = 8; s < 16; s++) tracks.drum.push({ s: at(3, s), k: 's', v: 0.6 + (s - 8) * 0.05 });
  for (let s = 12; s < 16; s++) tracks.drum.push({ s: at(3, s), k: 't', m: 62 - (s - 12) * 3, v: 0.8 });

  // --- LOOP PRINCIPALE (Mesures 4 à 19 = 16 mesures) ---
  const loopChords = [
    'Em', 'Em', 'C', 'C', 'D', 'D', 'G', 'B7',
    'Em', 'Em', 'Am', 'Am', 'C', 'D', 'B7', 'Em'
  ];

  const arpeggiate = (c, bar) => {
    const ch = CHORDS[c];
    for (let s = 0; s < 16; s++) {
      const idx = s % 4;
      const t = idx === 3 ? ch.tones[1] + 12 : ch.tones[idx % 3] + (idx >= 2 ? 12 : 0);
      tracks.riff.push({ s: at(bar, s), d: 1, m: B + 12 + t, v: 0.85 });
    }
  };

  const leadMelody = [
    // Phrase 1 (bars 4-7)
    [0, 3, 12], [3, 1, 15], [4, 4, 19], [8, 4, 17], [12, 4, 15],
    [16, 2, 14], [18, 2, 15], [20, 6, 17], [26, 2, 19], [28, 4, 15],
    [32, 3, 14], [35, 1, 12], [36, 4, 10], [40, 4, 12], [44, 4, 14],
    [48, 4, 15], [52, 4, 17], [56, 6, 19], [62, 2, 23],
    // Phrase 2 (bars 8-11)
    [64, 3, 24], [67, 1, 22], [68, 4, 19], [72, 4, 15], [76, 4, 19],
    [80, 2, 17], [82, 2, 15], [84, 6, 14], [90, 2, 15], [92, 4, 17],
    [96, 3, 19], [99, 1, 17], [100, 4, 15], [104, 4, 14], [108, 4, 12],
    [112, 4, 11], [116, 4, 14], [120, 8, 12],
    // Phrase 3 (bars 12-15)
    [128, 3, 12], [131, 1, 15], [132, 2, 19], [134, 2, 24], [136, 4, 26], [140, 4, 24],
    [144, 3, 22], [147, 1, 19], [148, 4, 17], [152, 4, 15], [156, 4, 14],
    [160, 4, 15], [164, 4, 17], [168, 4, 19], [172, 4, 22],
    [176, 6, 24], [182, 2, 23], [184, 8, 24],
    // Phrase 4 (bars 16-19)
    [192, 3, 24], [195, 1, 22], [196, 4, 19], [200, 4, 15], [204, 4, 19],
    [208, 4, 17], [212, 4, 19], [216, 4, 21], [220, 4, 23],
    [224, 6, 24], [230, 2, 23], [232, 4, 22], [236, 4, 19],
    [240, 6, 12], [246, 2, 11], [248, 8, 12]
  ];

  for (let b = 4; b < 20; b++) {
    const barIdx = b - 4;
    const c = loopChords[barIdx];
    const ch = CHORDS[c];

    arpeggiate(c, b);

    [0, 3, 6, 8, 11, 14].forEach((st) => {
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root, v: 0.95 });
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root + 7, v: 0.85 });
    });

    for (let s = 0; s < 16; s += 2) {
      const oct = (s % 4 === 2) ? 12 : 0;
      tracks.bass.push({ s: at(b, s), d: 2, m: B - 24 + ch.root + oct, v: 1 });
    }

    for (const t of ch.tones) {
      tracks.pad.push({ s: at(b, 0), d: 16, m: B - 12 + t, v: 0.6 });
    }

    tracks.drum.push({ s: at(b, 0), k: 'k', v: 1.1 });
    tracks.drum.push({ s: at(b, 8), k: 'k', v: 1.0 });
    tracks.drum.push({ s: at(b, 10), k: 'k', v: 0.9 });
    if (b % 2 === 1) tracks.drum.push({ s: at(b, 14), k: 'k', v: 0.85 });

    tracks.drum.push({ s: at(b, 4), k: 's', v: 1.0 });
    tracks.drum.push({ s: at(b, 12), k: 's', v: 1.0 });

    for (let s = 0; s < 16; s += 2) tracks.drum.push({ s: at(b, s), k: 'h', v: 0.6 });

    if (b === 4 || b === 12) tracks.drum.push({ s: at(b, 0), k: 'c', v: 1.2 });
    if (b % 4 === 3) {
      for (const s of [12, 13, 14, 15]) {
        tracks.drum.push({ s: at(b, s), k: 's', v: 0.8 + (s - 12) * 0.08 });
      }
      tracks.drum.push({ s: at(b, 14), k: 't', m: 58, v: 0.9 });
      tracks.drum.push({ s: at(b, 15), k: 't', m: 52, v: 1.0 });
    }
  }

  leadMelody.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: at(4, st), d, m: B + iv, v: 1 });
    tracks.harm.push({ s: at(4, st), d, m: B + iv - (iv >= 19 ? 4 : 3), v: 0.65 });
  });

  return {
    steps: 20 * 16,
    loopStart: 4 * 16,
    bpm: 175,
    tracks: [
      { type: 'triangle', vol: 0.08, notes: tracks.pad, attack: 0.35 },
      { type: 'pulse25', vol: 0.065, notes: tracks.riff },
      { type: 'sawtooth', vol: 0.038, notes: tracks.gtr, dist: true },
      { type: 'triangle', vol: 0.16, notes: tracks.bass },
      { type: 'pulse50', vol: 0.075, notes: tracks.lead },
      { type: 'pulse12', vol: 0.045, notes: tracks.harm },
      { type: 'drum', vol: 0.1, notes: tracks.drum }
    ]
  };
}

function composeGymTension() {
  const B = midiOf('G3'); // 55 (Tonalité lumineuse et victorieuse)
  const tracks = { pad: [], bell: [], gtr: [], bass: [], lead: [], harm: [], drum: [] };

  const CHORDS = {
    G:  { root: 0,  tones: [0, 4, 7] },
    D:  { root: -5, tones: [-5, -1, 2] },
    Em: { root: -3, tones: [-3, 0, 4] },
    C:  { root: -7, tones: [-7, -3, 0] },
    B7: { root: 4,  tones: [4, 8, 11] },
  };

  // --- INTRO (Mesures 0 à 3) ---
  // Silence au pas 0 puis explosion de crash et montée fulgurante
  tracks.drum.push({ s: 0, k: 'c', v: 1.4 });
  tracks.drum.push({ s: 0, k: 'k', v: 1.3 });
  for (let s = 1; s < 16; s++) {
    tracks.drum.push({ s, k: s % 2 === 0 ? 's' : 't', m: 50 + s, v: 0.5 + s * 0.03 });
  }

  // Bar 1 : Galop de basse montant
  const introBass = [0, 2, 4, 7, 9, 11, 12, 14];
  introBass.forEach((iv, k) => tracks.bass.push({ s: at(1, k * 2), d: 2, m: B - 12 + iv, v: 1 }));

  // Bar 2-3 : Fanfare d'encouragement
  const aceFanfare = [
    [0, 3, 12], [3, 1, 14], [4, 4, 16], [8, 4, 19], [12, 4, 21],
    [16, 2, 23], [18, 2, 24], [20, 4, 26], [24, 4, 24], [28, 4, 23]
  ];
  aceFanfare.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: at(2, st), d, m: B + iv, v: 1 });
    tracks.bell.push({ s: at(2, st), d, m: B + iv + 12, v: 0.6 });
  });

  for (let s = 0; s < 32; s += 2) {
    tracks.drum.push({ s: at(2, s), k: s % 4 === 0 ? 'k' : 's', v: 0.9 });
    tracks.drum.push({ s: at(2, s), k: 'h', v: 0.7 });
  }

  // --- LOOP VICTOIRE & FRÉNÉSIE (Mesures 4 à 19 = 16 mesures, loopStart: 64) ---
  const loopChords = [
    'G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D',
    'Em', 'C', 'G', 'D', 'C', 'D', 'Em', 'D'
  ];

  const aceMelody = [
    // Phrase 1 (mesures 4-7) : Thème victorieux très accrocheur
    [0, 2, 12], [2, 2, 14], [4, 4, 16], [8, 4, 19], [12, 4, 16],
    [16, 2, 14], [18, 2, 16], [20, 4, 14], [24, 4, 11], [28, 4, 9],
    [32, 2, 9], [34, 2, 11], [36, 4, 12], [40, 4, 16], [44, 4, 14],
    [48, 2, 12], [50, 2, 14], [52, 6, 16], [58, 2, 14], [60, 4, 12],
    // Phrase 2 (mesures 8-11) : Envolée vers les aigus
    [64, 2, 16], [66, 2, 19], [68, 4, 21], [72, 4, 24], [76, 4, 23],
    [80, 2, 21], [82, 2, 19], [84, 4, 21], [88, 4, 19], [92, 4, 16],
    [96, 2, 16], [98, 2, 17], [100, 4, 19], [104, 4, 21], [108, 4, 23],
    [112, 6, 24], [118, 2, 23], [120, 8, 24],
    // Phrase 3 (mesures 12-15) : Staccato intense et rythmique
    [128, 2, 16], [130, 2, 16], [132, 2, 19], [134, 2, 19], [136, 4, 21], [140, 4, 19],
    [144, 2, 14], [146, 2, 14], [148, 2, 16], [150, 2, 16], [152, 4, 19], [156, 4, 16],
    [160, 2, 12], [162, 2, 12], [164, 2, 14], [166, 2, 14], [168, 4, 16], [172, 4, 14],
    [176, 4, 16], [180, 4, 19], [184, 8, 21],
    // Phrase 4 (mesures 16-19) : Climax & Déferlante
    [192, 3, 24], [195, 1, 23], [196, 4, 21], [200, 4, 19], [204, 4, 21],
    [208, 3, 23], [211, 1, 21], [212, 4, 19], [216, 4, 16], [220, 4, 19],
    [224, 4, 21], [228, 4, 23], [232, 4, 24], [236, 4, 26],
    [240, 8, 28], [248, 8, 24]
  ];

  for (let b = 4; b < 20; b++) {
    const barIdx = b - 4;
    const c = loopChords[barIdx];
    const ch = CHORDS[c];

    // Clochettes / arpège brillant
    for (let s = 0; s < 16; s += 2) {
      const noteIdx = (s / 2) % ch.tones.length;
      tracks.bell.push({ s: at(b, s), d: 2, m: B + 24 + ch.tones[noteIdx], v: 0.65 });
    }

    // Guitare saturée
    [0, 3, 6, 8, 11, 14].forEach((st) => {
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root, v: 0.95 });
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root + 7, v: 0.85 });
    });

    // Basse en double-croches ultra rapide (188 BPM)
    for (let s = 0; s < 16; s++) {
      tracks.bass.push({ s: at(b, s), d: 1, m: B - 24 + ch.root + (s % 4 === 2 ? 12 : 0), v: 0.95 });
    }

    // Nappe
    for (const t of ch.tones) {
      tracks.pad.push({ s: at(b, 0), d: 16, m: B - 12 + t, v: 0.55 });
    }

    // Batterie frénétique style Gen 5
    // Double kick
    for (let s = 0; s < 16; s += 2) {
      tracks.drum.push({ s: at(b, s), k: 'k', v: s % 4 === 0 ? 1.1 : 0.85 });
    }
    // Snare claquant sur 4 et 12
    tracks.drum.push({ s: at(b, 4), k: 's', v: 1.1 });
    tracks.drum.push({ s: at(b, 12), k: 's', v: 1.1 });

    // Hi-hats rapides en doubles-croches
    for (let s = 0; s < 16; s++) {
      tracks.drum.push({ s: at(b, s), k: 'h', v: s % 2 === 1 ? 0.7 : 0.45 });
    }

    if (b === 4 || b === 12) tracks.drum.push({ s: at(b, 0), k: 'c', v: 1.3 });
    if (b % 4 === 3) {
      for (const s of [12, 13, 14, 15]) {
        tracks.drum.push({ s: at(b, s), k: 's', v: 0.9 + (s - 12) * 0.08 });
      }
    }
  }

  aceMelody.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: at(4, st), d, m: B + iv, v: 1 });
    tracks.harm.push({ s: at(4, st), d, m: B + iv - 4, v: 0.65 });
  });

  return {
    steps: 20 * 16,
    loopStart: 4 * 16,
    bpm: 188,
    tracks: [
      { type: 'triangle', vol: 0.08, notes: tracks.pad, attack: 0.2 },
      { type: 'pulse12', vol: 0.055, notes: tracks.bell, release: 0.25 },
      { type: 'sawtooth', vol: 0.038, notes: tracks.gtr, dist: true },
      { type: 'triangle', vol: 0.16, notes: tracks.bass },
      { type: 'pulse50', vol: 0.08, notes: tracks.lead },
      { type: 'pulse25', vol: 0.05, notes: tracks.harm },
      { type: 'drum', vol: 0.105, notes: tracks.drum }
    ]
  };
}

function composeChampion() {
  const B = midiOf('C3'); // 48 (Do mineur harmonique)
  const tracks = { pad: [], riff: [], gtr: [], bass: [], lead: [], harm: [], drum: [] };

  const CHORDS = {
    Cm:   { root: 0,  tones: [0, 3, 7] },
    Ab:   { root: -4, tones: [-4, 0, 3] },
    Fm:   { root: 5,  tones: [5, 8, 12] },
    G7:   { root: 7,  tones: [7, 11, 14] },
    Eb:   { root: 3,  tones: [3, 7, 10] },
    Bb:   { root: -2, tones: [-2, 2, 5] },
    Ddim: { root: 2,  tones: [2, 5, 8] },
    Gsus: { root: 7,  tones: [7, 12, 14] },
  };

  // --- INTRO LÉGENDAIRE (Mesures 0 à 3) : Prélude mystérieux puis explosion ---
  // Bar 0 : Notes solitaires suspendues dans le vide
  const cynthiaIntro = [
    [0, 4, 24], [4, 4, 27], [8, 4, 31], [12, 4, 35],
    [16, 4, 36], [20, 4, 31], [24, 4, 27], [28, 4, 24]
  ];
  cynthiaIntro.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: st, d, m: B + iv, v: 0.85 });
    tracks.harm.push({ s: st, d, m: B + iv - 12, v: 0.5 });
  });

  // Bar 1 : Roulement de toms sourds et montée chromatique
  for (let s = 8; s < 16; s++) {
    tracks.drum.push({ s: at(1, s), k: 't', m: 50 + s, v: 0.5 + (s - 8) * 0.06 });
  }
  const bassRun = [7, 8, 9, 10, 11, 12, 13, 14];
  bassRun.forEach((iv, k) => tracks.bass.push({ s: at(1, 8 + k), d: 1, m: B - 12 + iv, v: 1 }));

  // Bar 2-3 : Déflagration symphonique avec crashs et power chords
  [0, 4, 8, 12].forEach((s) => {
    tracks.drum.push({ s: at(2, s), k: 'k', v: 1.2 });
    tracks.drum.push({ s: at(2, s), k: 'c', v: 1.0 });
    tracks.drum.push({ s: at(3, s), k: 'k', v: 1.2 });
    tracks.drum.push({ s: at(2, s + 2), k: 's', v: 1.0 });
    tracks.drum.push({ s: at(3, s + 2), k: 's', v: 1.0 });
  });
  // Guitare saturée sur bars 2-3
  [0, 6, 8, 14].forEach((s) => {
    tracks.gtr.push({ s: at(2, s), d: 4, m: B + 0, v: 1 });
    tracks.gtr.push({ s: at(2, s), d: 4, m: B + 7, v: 0.9 });
    tracks.gtr.push({ s: at(3, s), d: 4, m: B + 7, v: 1 });
    tracks.gtr.push({ s: at(3, s), d: 4, m: B + 14, v: 0.9 });
  });

  // --- GRANDE BOUCLE SYMPHONIQUE DE 24 MESURES (Mesures 4 à 27, loopStart: 64) ---
  const loopChords = [
    'Cm', 'Cm', 'Ab', 'Ab', 'Fm', 'Fm', 'G7', 'G7',
    'Cm', 'Cm', 'Eb', 'Eb', 'Bb', 'Bb', 'G7', 'G7',
    'Ab', 'Bb', 'Cm', 'Ddim', 'Fm', 'G7', 'Cm', 'Gsus'
  ];

  // Riff virtuose en doubles croches (gamme mineure harmonique de Do)
  const champRiff = (c, bar) => {
    const ch = CHORDS[c];
    for (let s = 0; s < 16; s++) {
      const stepInChord = [ch.tones[0], ch.tones[1], ch.tones[2], ch.tones[1]][s % 4];
      const oct = s >= 8 ? 24 : 12;
      tracks.riff.push({ s: at(bar, s), d: 1, m: B + oct + stepInChord, v: 0.8 });
    }
  };

  // Mélodie grandiose de Maître de la Ligue (24 mesures)
  const championMelody = [
    // Section A (bars 4-11) : Thème dramatique et impérial
    [0, 3, 24], [3, 1, 27], [4, 4, 31], [8, 4, 35], [12, 4, 36],
    [16, 2, 35], [18, 2, 32], [20, 6, 31], [26, 2, 27], [28, 4, 24],
    [32, 3, 25], [35, 1, 28], [36, 4, 32], [40, 4, 31], [44, 4, 28],
    [48, 6, 27], [54, 2, 26], [56, 8, 27],
    [64, 3, 20], [67, 1, 24], [68, 4, 27], [72, 4, 25], [76, 4, 24],
    [80, 2, 23], [82, 2, 20], [84, 6, 19], [90, 2, 23], [92, 4, 27],
    [96, 4, 31], [100, 4, 32], [104, 4, 35], [108, 4, 36],
    [112, 8, 38], [120, 8, 35],
    // Section B (bars 12-19) : Envolée lyrique et héroïque
    [128, 3, 36], [131, 1, 35], [132, 4, 32], [136, 4, 31], [140, 4, 32],
    [144, 3, 35], [147, 1, 32], [148, 4, 31], [152, 4, 27], [156, 4, 31],
    [160, 3, 34], [163, 1, 31], [164, 4, 29], [168, 4, 26], [172, 4, 29],
    [176, 6, 31], [182, 2, 32], [184, 8, 35],
    [192, 4, 36], [196, 4, 35], [200, 4, 32], [204, 4, 31],
    [208, 4, 28], [212, 4, 27], [216, 4, 24], [220, 4, 23],
    [224, 8, 19], [232, 8, 23],
    // Section C (bars 20-27) : Climax apothéose
    [256, 3, 20], [259, 1, 24], [260, 4, 27], [264, 4, 32], [268, 4, 31],
    [272, 3, 22], [275, 1, 26], [276, 4, 29], [280, 4, 34], [284, 4, 32],
    [288, 3, 24], [291, 1, 27], [292, 4, 31], [296, 4, 36], [300, 4, 35],
    [304, 6, 38], [310, 2, 37], [312, 8, 38],
    [320, 4, 32], [324, 4, 31], [328, 4, 28], [332, 4, 27],
    [336, 4, 31], [340, 4, 35], [344, 4, 36], [348, 4, 38],
    [352, 8, 36], [360, 8, 35],
    [368, 8, 36]
  ];

  for (let b = 4; b < 28; b++) {
    const barIdx = b - 4;
    const c = loopChords[barIdx];
    const ch = CHORDS[c];

    champRiff(c, b);

    // Power chords lourds et majestueux
    [0, 3, 6, 8, 11, 14].forEach((st) => {
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root, v: 0.95 });
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root + 7, v: 0.85 });
    });

    // Basse puissante
    for (let s = 0; s < 16; s += 2) {
      tracks.bass.push({ s: at(b, s), d: 2, m: B - 24 + ch.root + (s % 4 === 2 ? 12 : 0), v: 1 });
    }

    // Nappe d'harmonie
    for (const t of ch.tones) {
      tracks.pad.push({ s: at(b, 0), d: 16, m: B - 12 + t, v: 0.65 });
    }

    // Batterie de metal symphonique
    tracks.drum.push({ s: at(b, 0), k: 'k', v: 1.2 });
    tracks.drum.push({ s: at(b, 6), k: 'k', v: 0.9 });
    tracks.drum.push({ s: at(b, 8), k: 'k', v: 1.1 });
    tracks.drum.push({ s: at(b, 10), k: 'k', v: 0.85 });
    if (b % 2 === 1) tracks.drum.push({ s: at(b, 14), k: 'k', v: 0.9 });

    tracks.drum.push({ s: at(b, 4), k: 's', v: 1.1 });
    tracks.drum.push({ s: at(b, 12), k: 's', v: 1.1 });

    for (let s = 0; s < 16; s += 2) tracks.drum.push({ s: at(b, s), k: 'h', v: 0.65 });

    if (b === 4 || b === 12 || b === 20) tracks.drum.push({ s: at(b, 0), k: 'c', v: 1.3 });
    if (b % 4 === 3) {
      for (const s of [12, 13, 14, 15]) {
        tracks.drum.push({ s: at(b, s), k: 's', v: 0.85 + (s - 12) * 0.08 });
      }
      tracks.drum.push({ s: at(b, 14), k: 't', m: 54, v: 0.9 });
      tracks.drum.push({ s: at(b, 15), k: 't', m: 48, v: 1.0 });
    }
  }

  championMelody.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: at(4, st), d, m: B + iv, v: 1 });
    tracks.harm.push({ s: at(4, st), d, m: B + iv - (iv >= 30 ? 4 : 3), v: 0.7 });
  });

  return {
    steps: 28 * 16,
    loopStart: 4 * 16,
    bpm: 178,
    tracks: [
      { type: 'triangle', vol: 0.09, notes: tracks.pad, attack: 0.4 },
      { type: 'pulse25', vol: 0.065, notes: tracks.riff },
      { type: 'sawtooth', vol: 0.04, notes: tracks.gtr, dist: true },
      { type: 'triangle', vol: 0.16, notes: tracks.bass },
      { type: 'pulse50', vol: 0.08, notes: tracks.lead },
      { type: 'pulse12', vol: 0.05, notes: tracks.harm },
      { type: 'drum', vol: 0.11, notes: tracks.drum }
    ]
  };
}

function composeLegend() {
  const B = midiOf('B2'); // 47 (Si grave, abyssal et ténébreux)
  const tracks = { pad: [], bell: [], gtr: [], bass: [], lead: [], harm: [], drum: [] };

  const CHORDS = {
    Bm:   { root: 0,  tones: [0, 3, 7] },
    Fdim: { root: 6,  tones: [6, 9, 12] }, // Le triton (diabolus in musica)
    G:    { root: 8,  tones: [8, 12, 15] },
    Em:   { root: 5,  tones: [5, 8, 12] },
    Fs:   { root: 7,  tones: [7, 11, 14] },
    D:    { root: 3,  tones: [3, 7, 10] },
    C:    { root: 1,  tones: [1, 5, 8] },
  };

  // --- INTRO APOCALYPTIQUE (Mesures 0 à 3) ---
  // Battement colossal et notes dissonantes
  tracks.drum.push({ s: 0, k: 'k', v: 1.4 });
  tracks.drum.push({ s: 8, k: 'k', v: 1.2 });
  tracks.drum.push({ s: 16, k: 'k', v: 1.4 });
  tracks.drum.push({ s: 24, k: 'k', v: 1.2 });

  tracks.bass.push({ s: 0, d: 16, m: B - 12, v: 1.2 });
  tracks.bass.push({ s: 16, d: 16, m: B - 12 + 6, v: 1.2 }); // triton !

  const creepyBells = [
    [0, 6, 18], [6, 6, 24], [12, 4, 18], [16, 6, 17], [22, 6, 23], [28, 4, 17]
  ];
  creepyBells.forEach(([st, d, iv]) => tracks.bell.push({ s: st, d, m: B + iv, v: 0.8 }));

  // Bars 2-3 : Rugissement & Roulement frénétique
  for (let s = 0; s < 32; s++) {
    tracks.drum.push({ s: at(2, s), k: s % 2 === 0 ? 'k' : 't', m: 56 - (s % 8), v: 0.6 + (s / 32) * 0.6 });
    if (s % 4 === 2) tracks.drum.push({ s: at(2, s), k: 's', v: 0.8 });
  }
  // Montée de distorsion
  tracks.gtr.push({ s: at(2, 0), d: 16, m: B, v: 0.8 });
  tracks.gtr.push({ s: at(2, 0), d: 16, m: B + 6, v: 0.8 });
  tracks.gtr.push({ s: at(3, 0), d: 16, m: B + 7, v: 1.0 });
  tracks.gtr.push({ s: at(3, 0), d: 16, m: B + 14, v: 1.0 });

  // --- LOOP COMBAT DIVIN (Mesures 4 à 23 = 20 mesures, loopStart: 64) ---
  const loopChords = [
    'Bm', 'Bm', 'Fdim', 'Fdim', 'G', 'Em', 'Fs', 'Fs',
    'Bm', 'D', 'Em', 'Fs', 'G', 'Fdim', 'Fs', 'Bm',
    'G', 'A', 'Bm', 'Fs'
  ];

  const legendMelody = [
    // Phrase 1 (mesures 4-7) : Sombre, lourde, terrifiante
    [0, 4, 12], [4, 2, 15], [6, 2, 18], [8, 6, 17], [14, 2, 15],
    [16, 4, 18], [20, 2, 17], [22, 2, 15], [24, 8, 14],
    [32, 4, 15], [36, 2, 18], [38, 2, 20], [40, 6, 19], [46, 2, 18],
    [48, 4, 21], [52, 4, 19], [56, 8, 18],
    // Phrase 2 (mesures 8-11) : Tempête mystique
    [64, 4, 24], [68, 2, 23], [70, 2, 21], [72, 6, 24], [78, 2, 23],
    [80, 4, 21], [84, 4, 19], [88, 8, 18],
    [96, 4, 19], [100, 2, 18], [102, 2, 15], [104, 6, 18], [110, 2, 17],
    [112, 4, 15], [116, 4, 14], [120, 8, 12],
    // Phrase 3 (mesures 12-15) : Clameur des abysses
    [128, 3, 12], [131, 1, 15], [132, 4, 18], [136, 4, 24], [140, 4, 23],
    [144, 3, 21], [147, 1, 19], [148, 4, 18], [152, 4, 15], [156, 4, 18],
    [160, 4, 19], [164, 4, 21], [168, 4, 23], [172, 4, 24],
    [176, 8, 26], [184, 8, 24],
    // Phrase 4 (mesures 16-19) : Climax apocalyptique
    [192, 4, 24], [196, 4, 23], [200, 4, 21], [204, 4, 19],
    [208, 4, 18], [212, 4, 15], [216, 4, 14], [220, 4, 12],
    [224, 6, 11], [230, 2, 12], [232, 4, 14], [236, 4, 18],
    [240, 8, 12], [248, 8, 11]
  ];

  for (let b = 4; b < 24; b++) {
    const barIdx = b - 4;
    const c = loopChords[barIdx] || 'Bm';
    const ch = CHORDS[c] || CHORDS.Bm;

    // Arpèges sombres
    for (let s = 0; s < 16; s += 2) {
      tracks.bell.push({ s: at(b, s), d: 2, m: B + 12 + ch.tones[s % ch.tones.length], v: 0.65 });
    }

    // Guitare saturée en accords tranchants
    [0, 3, 6, 8, 11, 14].forEach((st) => {
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root, v: 1.0 });
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root + (c === 'Fdim' ? 6 : 7), v: 0.9 });
    });

    // Basse martelée
    for (let s = 0; s < 16; s += 2) {
      tracks.bass.push({ s: at(b, s), d: 2, m: B - 24 + ch.root + (s % 4 === 2 ? 12 : 0), v: 1.1 });
    }

    // Choeur / Nappe mystique
    for (const t of ch.tones) {
      tracks.pad.push({ s: at(b, 0), d: 16, m: B - 12 + t, v: 0.65 });
    }

    // Batterie lourde et menaçante
    tracks.drum.push({ s: at(b, 0), k: 'k', v: 1.2 });
    tracks.drum.push({ s: at(b, 3), k: 'k', v: 0.9 });
    tracks.drum.push({ s: at(b, 8), k: 'k', v: 1.1 });
    tracks.drum.push({ s: at(b, 11), k: 'k', v: 0.85 });

    tracks.drum.push({ s: at(b, 4), k: 's', v: 1.1 });
    tracks.drum.push({ s: at(b, 12), k: 's', v: 1.1 });

    for (let s = 0; s < 16; s += 2) tracks.drum.push({ s: at(b, s), k: 'h', v: 0.55 });

    if (b === 4 || b === 12 || b === 20) tracks.drum.push({ s: at(b, 0), k: 'c', v: 1.3 });
    if (b % 4 === 3) {
      for (const s of [12, 13, 14, 15]) {
        tracks.drum.push({ s: at(b, s), k: 's', v: 0.85 + (s - 12) * 0.08 });
      }
      tracks.drum.push({ s: at(b, 14), k: 't', m: 52, v: 0.9 });
      tracks.drum.push({ s: at(b, 15), k: 't', m: 46, v: 1.0 });
    }
  }

  legendMelody.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: at(4, st), d, m: B + iv, v: 1 });
    tracks.harm.push({ s: at(4, st), d, m: B + iv - 4, v: 0.65 });
  });

  return {
    steps: 24 * 16,
    loopStart: 4 * 16,
    bpm: 164,
    tracks: [
      { type: 'triangle', vol: 0.09, notes: tracks.pad, attack: 0.4 },
      { type: 'pulse12', vol: 0.05, notes: tracks.bell, release: 0.3 },
      { type: 'sawtooth', vol: 0.042, notes: tracks.gtr, dist: true },
      { type: 'triangle', vol: 0.17, notes: tracks.bass },
      { type: 'pulse50', vol: 0.08, notes: tracks.lead },
      { type: 'pulse25', vol: 0.05, notes: tracks.harm },
      { type: 'drum', vol: 0.11, notes: tracks.drum }
    ]
  };
}

function composeEclipse() {
  const B = midiOf('F3'); // 53 (Fa mineur, agressif et technologique)
  const tracks = { pad: [], riff: [], gtr: [], bass: [], lead: [], harm: [], drum: [] };

  const CHORDS = {
    Fm:  { root: 0,  tones: [0, 3, 7] },
    Db:  { root: -4, tones: [-4, 0, 3] },
    Bbm: { root: 5,  tones: [5, 8, 12] },
    C7:  { root: 7,  tones: [7, 11, 14] },
    Eb:  { root: -2, tones: [-2, 2, 5] },
    Ab:  { root: 3,  tones: [3, 7, 10] },
  };

  // --- INTRO CYBER-ALARME (Mesures 0 à 3) ---
  const alarmSiren = [
    [0, 2, 24], [2, 2, 29], [4, 2, 24], [6, 2, 31],
    [8, 2, 24], [10, 2, 29], [12, 2, 24], [14, 2, 32]
  ];
  for (let b = 0; b < 2; b++) {
    alarmSiren.forEach(([s, d, iv]) => tracks.riff.push({ s: at(b, s), d, m: B + iv, v: 0.85 }));
    // Kick techno 4 temps
    for (let s = 0; s < 16; s += 4) tracks.drum.push({ s: at(b, s), k: 'k', v: 0.9 + b * 0.2 });
  }

  // Bars 2-3 : Montée de basse acid et roulement de caisse claire industrielle
  for (let s = 0; s < 16; s++) {
    tracks.bass.push({ s: at(2, s), d: 1, m: B - 12 + (s % 2 === 0 ? 0 : 12), v: 0.9 });
    tracks.drum.push({ s: at(3, s), k: 's', v: 0.6 + (s / 16) * 0.5 });
  }
  tracks.drum.push({ s: at(3, 14), k: 'c', v: 1.2 });

  // --- LOOP INDUSTRIELLE TECHNO-ROCK (Mesures 4 à 19 = 16 mesures, loopStart: 64) ---
  const loopChords = [
    'Fm', 'Fm', 'Db', 'Db', 'Bbm', 'Bbm', 'C7', 'C7',
    'Fm', 'Ab', 'Db', 'Eb', 'Fm', 'Bbm', 'C7', 'Fm'
  ];

  // Riff acide en doubles-croches
  const acidRiff = (c, bar) => {
    const ch = CHORDS[c];
    for (let s = 0; s < 16; s++) {
      const oct = (s % 4 === 1 || s % 4 === 3) ? 12 : 0;
      tracks.riff.push({ s: at(bar, s), d: 1, m: B + oct + ch.tones[s % 3], v: 0.85 });
    }
  };

  const eclipseMelody = [
    // Phrase 1 (mesures 4-7) : Froid, arrogant et incisif
    [0, 2, 12], [2, 2, 15], [4, 4, 19], [8, 4, 18], [12, 4, 15],
    [16, 2, 12], [18, 2, 15], [20, 4, 17], [24, 4, 15], [28, 4, 12],
    [32, 2, 13], [34, 2, 17], [36, 4, 20], [40, 4, 19], [44, 4, 17],
    [48, 4, 19], [52, 4, 20], [56, 8, 23],
    // Phrase 2 (mesures 8-11) : Domination machiavélique
    [64, 2, 24], [66, 2, 23], [68, 4, 20], [72, 4, 19], [76, 4, 17],
    [80, 2, 19], [82, 2, 17], [84, 4, 15], [88, 4, 13], [92, 4, 12],
    [96, 2, 15], [98, 2, 17], [100, 4, 19], [104, 4, 20], [108, 4, 23],
    [112, 6, 24], [118, 2, 23], [120, 8, 24],
    // Phrase 3 (mesures 12-15) : Stabs techno agressifs
    [128, 2, 24], [130, 2, 24], [132, 4, 27], [136, 4, 24], [140, 4, 20],
    [144, 2, 22], [146, 2, 22], [148, 4, 25], [152, 4, 22], [156, 4, 19],
    [160, 2, 20], [162, 2, 20], [164, 4, 24], [168, 4, 20], [172, 4, 17],
    [176, 4, 19], [180, 4, 20], [184, 8, 23],
    // Phrase 4 (mesures 16-19) : Climax & Chute
    [192, 3, 24], [195, 1, 23], [196, 4, 20], [200, 4, 19], [204, 4, 17],
    [208, 3, 20], [211, 1, 19], [212, 4, 17], [216, 4, 15], [220, 4, 12],
    [224, 4, 11], [228, 4, 14], [232, 4, 17], [236, 4, 20],
    [240, 8, 12], [248, 8, 0]
  ];

  for (let b = 4; b < 20; b++) {
    const barIdx = b - 4;
    const c = loopChords[barIdx];
    const ch = CHORDS[c];

    acidRiff(c, b);

    // Stabs de guitare saturée syncopés
    [0, 3, 6, 8, 11, 14].forEach((st) => {
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root, v: 0.95 });
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root + 7, v: 0.85 });
    });

    // Basse synthétique acid (octaves bondissantes)
    for (let s = 0; s < 16; s += 2) {
      tracks.bass.push({ s: at(b, s), d: 2, m: B - 24 + ch.root + (s % 4 === 2 ? 12 : 0), v: 1.1 });
    }

    // Nappe
    for (const t of ch.tones) {
      tracks.pad.push({ s: at(b, 0), d: 16, m: B - 12 + t, v: 0.6 });
    }

    // Beat Techno-Rock 4-on-the-floor
    tracks.drum.push({ s: at(b, 0), k: 'k', v: 1.15 });
    tracks.drum.push({ s: at(b, 4), k: 'k', v: 1.0 });
    tracks.drum.push({ s: at(b, 8), k: 'k', v: 1.15 });
    tracks.drum.push({ s: at(b, 12), k: 'k', v: 1.0 });

    // Snare percutant
    tracks.drum.push({ s: at(b, 4), k: 's', v: 1.1 });
    tracks.drum.push({ s: at(b, 12), k: 's', v: 1.1 });

    // Hi-hats ouverts sur les contre-temps (dancefloor style)
    for (let s = 2; s < 16; s += 4) {
      tracks.drum.push({ s: at(b, s), k: 'h', v: 0.9 });
    }
    for (let s = 0; s < 16; s += 2) {
      tracks.drum.push({ s: at(b, s), k: 'h', v: 0.5 });
    }

    if (b === 4 || b === 12) tracks.drum.push({ s: at(b, 0), k: 'c', v: 1.25 });
    if (b % 4 === 3) {
      for (const s of [12, 13, 14, 15]) {
        tracks.drum.push({ s: at(b, s), k: 's', v: 0.85 + (s - 12) * 0.08 });
      }
      tracks.drum.push({ s: at(b, 15), k: 'c', v: 0.9 });
    }
  }

  eclipseMelody.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: at(4, st), d, m: B + iv, v: 1 });
    tracks.harm.push({ s: at(4, st), d, m: B + iv - 4, v: 0.65 });
  });

  return {
    steps: 20 * 16,
    loopStart: 4 * 16,
    bpm: 170,
    tracks: [
      { type: 'triangle', vol: 0.08, notes: tracks.pad, attack: 0.25 },
      { type: 'pulse25', vol: 0.065, notes: tracks.riff },
      { type: 'sawtooth', vol: 0.04, notes: tracks.gtr, dist: true },
      { type: 'triangle', vol: 0.16, notes: tracks.bass },
      { type: 'pulse50', vol: 0.08, notes: tracks.lead },
      { type: 'pulse12', vol: 0.05, notes: tracks.harm },
      { type: 'drum', vol: 0.11, notes: tracks.drum }
    ]
  };
}

function composeRival() {
  const B = midiOf('D3'); // 50 (Ré mineur, fougueux et combatif)
  const tracks = { pad: [], riff: [], gtr: [], bass: [], lead: [], harm: [], drum: [] };

  const CHORDS = {
    Dm: { root: 0,  tones: [0, 3, 7] },
    Bb: { root: -4, tones: [-4, 0, 3] },
    C:  { root: -2, tones: [-2, 2, 5] },
    Am: { root: -5, tones: [-5, -2, 2] },
    Gm: { root: 5,  tones: [5, 8, 12] },
    A7: { root: 7,  tones: [7, 11, 14] },
    F:  { root: 3,  tones: [3, 7, 10] },
  };

  // --- INTRO COMBATIVE (Mesures 0 à 3) ---
  for (let s = 0; s < 16; s++) {
    tracks.drum.push({ s: at(0, s), k: s % 2 === 0 ? 's' : 'h', v: 0.5 + (s / 16) * 0.4 });
  }
  const bassRun = [0, 3, 5, 7, 8, 10, 12, 13];
  bassRun.forEach((iv, k) => tracks.bass.push({ s: at(0, k * 2), d: 2, m: B - 12 + iv, v: 1 }));

  [0, 3, 6, 8, 11, 14].forEach((s) => {
    tracks.gtr.push({ s: at(1, s), d: 2, m: B, v: 0.9 });
    tracks.gtr.push({ s: at(1, s), d: 2, m: B + 7, v: 0.85 });
    tracks.drum.push({ s: at(1, s), k: 'k', v: 1 });
    tracks.drum.push({ s: at(1, s), k: 's', v: 0.9 });
  });

  const fanfare = [
    [0, 3, 12], [3, 1, 15], [4, 4, 19], [8, 4, 17], [12, 4, 15],
    [16, 2, 14], [18, 2, 15], [20, 4, 17], [24, 4, 21], [28, 4, 24]
  ];
  fanfare.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: at(2, st), d, m: B + iv, v: 1 });
    tracks.harm.push({ s: at(2, st), d, m: B + iv - 4, v: 0.7 });
  });

  for (let s = 0; s < 32; s += 2) {
    tracks.drum.push({ s: at(2, s), k: s % 4 === 0 ? 'k' : 's', v: 0.9 });
    tracks.drum.push({ s: at(2, s), k: 'h', v: 0.6 });
  }

  // --- LOOP PRINCIPALE (Mesures 4 à 19 = 16 mesures, loopStart: 64) ---
  const loopChords = [
    'Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A7',
    'Dm', 'F', 'Bb', 'C', 'Dm', 'Gm', 'A7', 'Dm'
  ];

  const rivalMelody = [
    // Phrase 1 (mesures 4-7)
    [0, 3, 12], [3, 1, 15], [4, 4, 17], [8, 4, 19], [12, 4, 17],
    [16, 2, 15], [18, 2, 17], [20, 4, 15], [24, 4, 13], [28, 4, 12],
    [32, 3, 13], [35, 1, 15], [36, 4, 17], [40, 4, 20], [44, 4, 19],
    [48, 4, 17], [52, 4, 19], [56, 8, 21],
    // Phrase 2 (mesures 8-11)
    [64, 3, 24], [67, 1, 22], [68, 4, 19], [72, 4, 17], [76, 4, 19],
    [80, 2, 17], [82, 2, 15], [84, 4, 14], [88, 4, 12], [92, 4, 10],
    [96, 3, 12], [99, 1, 14], [100, 4, 15], [104, 4, 17], [108, 4, 19],
    [112, 6, 21], [118, 2, 22], [120, 8, 21],
    // Phrase 3 (mesures 12-15)
    [128, 2, 24], [130, 2, 24], [132, 4, 22], [136, 4, 19], [140, 4, 17],
    [144, 2, 20], [146, 2, 20], [148, 4, 19], [152, 4, 17], [156, 4, 15],
    [160, 2, 17], [162, 2, 17], [164, 4, 19], [168, 4, 21], [172, 4, 22],
    [176, 6, 24], [182, 2, 22], [184, 8, 21],
    // Phrase 4 (mesures 16-19)
    [192, 3, 24], [195, 1, 22], [196, 4, 19], [200, 4, 17], [204, 4, 15],
    [208, 3, 17], [211, 1, 15], [212, 4, 14], [216, 4, 12], [220, 4, 10],
    [224, 4, 9], [228, 4, 12], [232, 4, 16], [236, 4, 19],
    [240, 8, 12], [248, 8, 12]
  ];

  for (let b = 4; b < 20; b++) {
    const barIdx = b - 4;
    const c = loopChords[barIdx];
    const ch = CHORDS[c];

    // Riff rapide en doubles croches
    for (let s = 0; s < 16; s++) {
      tracks.riff.push({ s: at(b, s), d: 1, m: B + 12 + ch.tones[s % ch.tones.length], v: 0.8 });
    }

    // Guitare saturée
    [0, 3, 6, 8, 11, 14].forEach((st) => {
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root, v: 0.95 });
      tracks.gtr.push({ s: at(b, st), d: 2, m: B - 12 + ch.root + 7, v: 0.85 });
    });

    // Basse rapide
    for (let s = 0; s < 16; s += 2) {
      tracks.bass.push({ s: at(b, s), d: 2, m: B - 24 + ch.root + (s % 4 === 2 ? 12 : 0), v: 1.05 });
    }

    // Nappe
    for (const t of ch.tones) {
      tracks.pad.push({ s: at(b, 0), d: 16, m: B - 12 + t, v: 0.6 });
    }

    // Batterie rock percutante
    tracks.drum.push({ s: at(b, 0), k: 'k', v: 1.15 });
    tracks.drum.push({ s: at(b, 8), k: 'k', v: 1.0 });
    tracks.drum.push({ s: at(b, 10), k: 'k', v: 0.9 });
    if (b % 2 === 1) tracks.drum.push({ s: at(b, 14), k: 'k', v: 0.85 });

    tracks.drum.push({ s: at(b, 4), k: 's', v: 1.1 });
    tracks.drum.push({ s: at(b, 12), k: 's', v: 1.1 });

    for (let s = 0; s < 16; s += 2) tracks.drum.push({ s: at(b, s), k: 'h', v: 0.6 });

    if (b === 4 || b === 12) tracks.drum.push({ s: at(b, 0), k: 'c', v: 1.25 });
    if (b % 4 === 3) {
      for (const s of [12, 13, 14, 15]) {
        tracks.drum.push({ s: at(b, s), k: 's', v: 0.85 + (s - 12) * 0.08 });
      }
      tracks.drum.push({ s: at(b, 14), k: 't', m: 54, v: 0.9 });
      tracks.drum.push({ s: at(b, 15), k: 't', m: 48, v: 1.0 });
    }
  }

  rivalMelody.forEach(([st, d, iv]) => {
    tracks.lead.push({ s: at(4, st), d, m: B + iv, v: 1 });
    tracks.harm.push({ s: at(4, st), d, m: B + iv - 4, v: 0.65 });
  });

  return {
    steps: 20 * 16,
    loopStart: 4 * 16,
    bpm: 172,
    tracks: [
      { type: 'triangle', vol: 0.08, notes: tracks.pad, attack: 0.3 },
      { type: 'pulse25', vol: 0.065, notes: tracks.riff },
      { type: 'sawtooth', vol: 0.038, notes: tracks.gtr, dist: true },
      { type: 'triangle', vol: 0.16, notes: tracks.bass },
      { type: 'pulse50', vol: 0.075, notes: tracks.lead },
      { type: 'pulse12', vol: 0.045, notes: tracks.harm },
      { type: 'drum', vol: 0.1, notes: tracks.drum }
    ]
  };
}

export const CUSTOM_COMPOSERS = {
  title: composeTitle,
  leader: composeLeader,
  gymTension: composeGymTension,
  champion: composeChampion,
  legend: composeLegend,
  eclipse: composeEclipse,
  rival: composeRival,
};

export class Sound {
  constructor() {
    this.ctx = null; this.vol = 0.7; this.music = null; this.songs = {}; this.muted = false;
    try { const v = localStorage.getItem('odyssee-vol'); if (v != null) this.vol = +v; } catch (e) {}
    // « moderne » : instruments doux, batterie et réverbération ; « retro » : les ondes 8 bits d'origine
    this.style = 'moderne';
    try { const st = localStorage.getItem('odyssee-son'); if (st === 'retro' || st === 'moderne') this.style = st; } catch (e) {}
    // onglet caché, application en arrière-plan : le son s'arrête et reprend au retour (le temps de l'audio s'arrête
    // aussi, la musique repart là où elle en était)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (!this.ctx || this.offline || !this.ctx.suspend) return;
      if (document.hidden) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {});
    });
  }
  setStyle(st) { this.style = st === 'retro' ? 'retro' : 'moderne'; try { localStorage.setItem('odyssee-son', this.style); } catch (e) {} const cur = this.current; this.current = null; if (cur) this.play(cur); }
  init(offline) {
    if (offline) { this.ctx = null; this.offline = offline.length / offline.sampleRate; }
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC && !offline) return;
    this.ctx = offline || new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
    // les réglages de volume du Hub (musique / effets) s'appliquent s'ils sont disponibles
    const DV = window.DDVolume, via = (kind) => { if (!DV) return this.master; const g = DV.gain(this.ctx, kind); g.connect(this.master); return g; };
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.8; this.musicBus.connect(via('music'));
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(via('fx'));
    // salle de concert : une réverbération synthétique (bruit qui décroît) partagée par la musique et un peu par les effets
    try {
      const sr = this.ctx.sampleRate, L = Math.floor(sr * 2.4), ir = this.ctx.createBuffer(2, L, sr);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3.2); }
      this.reverb = this.ctx.createConvolver(); this.reverb.buffer = ir;
      this.revMusic = this.ctx.createGain(); this.revMusic.gain.value = 0.3;
      this.revSfx = this.ctx.createGain(); this.revSfx.gain.value = 0.12;
      this.revMusic.connect(this.reverb); this.revSfx.connect(this.reverb);
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
      this.reverb.connect(comp); comp.connect(this.musicBus);
    } catch (e) { this.reverb = null; }
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

  /**
   * Instruments « modernes » : la même partition, jouée par de vrais timbres au lieu des ondes 8 bits.
   *  pulse25 / pulse12 / square → mélodie (deux dents de scie désaccordées, filtre doux, vibrato) ;
   *  pulse50 → piano électrique (arpèges) ; triangle grave → basse ronde ; sawtooth → nappe de cordes ; sine → clochette.
   */
  voice(type, f, t, dur, vol, bus, o = {}) {
    if (this.style === 'retro' || type === 'noise' || !this.ctx) return this.tone(type, f, t, dur, vol, bus, o);
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass';
    const role = type === 'pulse50' ? 'keys' : type === 'sawtooth' ? 'pad' : type === 'sine' ? 'bell' : type === 'triangle' ? (f < 220 ? 'bass' : 'flute') : 'lead';
    const oscs = [];
    const osc = (ty, mul = 1, cents = 0, gain = 1) => { const x = c.createOscillator(); x.type = ty; x.frequency.setValueAtTime(f * mul, t); x.detune.value = cents; if (o.slide) x.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide * mul), t + dur); const gg = c.createGain(); gg.gain.value = gain; x.connect(gg); gg.connect(lp); oscs.push(x); return x; };
    let a = 0.01, peak = vol, sus = vol, rel = Math.min(0.25, dur * 0.4);
    if (role === 'lead') { osc('sawtooth', 1, -7, 0.5); osc('sawtooth', 1, 7, 0.5); osc('triangle', 0.5, 0, 0.35); lp.frequency.value = Math.min(4200, f * 5); lp.Q.value = 0.6; a = 0.025; peak = vol * 0.62; sus = peak * 0.85;
      if (dur > 0.3) { const lfo = c.createOscillator(), ld = c.createGain(); lfo.frequency.value = 5.2; ld.gain.setValueAtTime(0, t); ld.gain.linearRampToValueAtTime(f * 0.006, t + 0.25); lfo.connect(ld); for (const x of oscs) ld.connect(x.frequency); lfo.start(t); lfo.stop(t + dur + 0.3); } }
    else if (role === 'keys') { osc('triangle', 1, 0, 0.8); osc('sine', 2, 3, 0.35); osc('sine', 4, 0, 0.08); lp.frequency.value = 3200; a = 0.004; peak = vol * 1.5; sus = peak * 0.25; rel = Math.min(0.35, dur * 0.6); }
    else if (role === 'bass') { osc('sine', 1, 0, 0.9); osc('sawtooth', 1, 0, 0.35); lp.frequency.value = 420; lp.Q.value = 1.2; a = 0.006; peak = vol * 1.25; sus = peak * 0.7; }
    else if (role === 'pad') { osc('sawtooth', 1, -9, 0.4); osc('sawtooth', 1, 9, 0.4); lp.frequency.value = 1800; a = Math.min(0.12, dur * 0.3); peak = vol * 0.8; sus = peak; rel = Math.min(0.4, dur * 0.5); }
    else if (role === 'bell') { osc('sine', 1, 0, 0.8); osc('sine', 2.76, 0, 0.18); lp.frequency.value = 6000; a = 0.003; peak = vol * 1.2; sus = peak * 0.2; rel = Math.min(0.6, dur); }
    else { osc('triangle', 1, 0, 0.9); osc('sine', 2, 0, 0.12); lp.frequency.value = 3000; a = 0.03; peak = vol * 1.1; sus = peak * 0.9; }
    if (o.attack != null && role !== 'keys') a = Math.max(a, o.attack);
    const end = t + dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, sus), t + Math.max(a + 0.01, Math.min(dur * 0.5, a + 0.18)));
    g.gain.setValueAtTime(Math.max(0.0002, sus), Math.max(t + a + 0.02, end - rel)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.02);
    lp.connect(g); g.connect(bus);
    for (const x of oscs) { x.start(t); x.stop(end + 0.06); }
  }
  /** batterie « moderne » : grosse caisse ronde, caisse claire claquée, charleston fin, cymbale, toms */
  drum(k, t, v, bus, m) {
    if (this.style === 'retro') {
      if (k === 'k') this.tone('triangle', 140, t, 0.12, v * 1.6, bus, { slide: 45 });
      else if (k === 's') this.tone('noise', 1800, t, 0.09, v * 0.8, bus);
      else if (k === 'c') this.tone('noise', 4500, t, 0.9, v * 0.7, bus, { release: 0.8 });
      else if (k === 't') this.tone('triangle', freq(m), t, 0.16, v * 1.4, bus, { slide: freq(m) * 0.55 });
      else this.tone('noise', 7000, t, 0.03, v * 0.35, bus);
      return;
    }
    if (k === 'k') { this.tone('sine', 150, t, 0.28, v * 2.6, bus, { slide: 42, attack: 0.002, release: 0.2 }); this.tone('noise', 3000, t, 0.012, v * 0.5, bus, { filter: 'bandpass' }); }
    else if (k === 's') { this.tone('noise', 1900, t, 0.16, v * 1.1, bus, { filter: 'bandpass', release: 0.12 }); this.tone('triangle', 190, t, 0.08, v * 0.9, bus, { slide: 150 }); }
    else if (k === 'c') this.tone('noise', 6000, t, 1.4, v * 0.45, bus, { release: 1.3 });
    else if (k === 't') this.tone('sine', freq(m), t, 0.24, v * 2, bus, { slide: freq(m) * 0.5, attack: 0.002 });
    else this.tone('noise', 9000, t, 0.035, v * 0.28, bus);
  }

  /* ---------------- musique ---------------- */
  play(name) {
    if (this.current === name) return;
    this.current = name;
    if (!this.ctx) { this.pending = name; return; }
    this.stopMusic(0.25);
    if (!name || !THEMES[name]) return;
    const song = this.songs[name] ||= (THEMES[name].custom && CUSTOM_COMPOSERS[THEMES[name].custom] ? CUSTOM_COMPOSERS[THEMES[name].custom]() : compose(THEMES[name]));
    const stepDur = 60 / song.bpm / 4;
    const bus = this.ctx.createGain(); bus.gain.value = 1; bus.connect(this.musicBus);
    if (this.reverb && this.style !== 'retro') bus.connect(this.revMusic);
    // guitare saturée : courbe de distorsion douce puis filtre passe-bas
    let dist = null;
    if (song.tracks.some((tr) => tr.dist)) {
      const ws = this.ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 6); }
      ws.curve = curve; ws.oversample = '2x';
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      dist = this.ctx.createGain(); dist.gain.value = 1; dist.connect(ws); ws.connect(lp); lp.connect(bus);
    }
    const st = { song, bus, step: 0, t: this.ctx.currentTime + 0.12, stepDur, alive: true, oneShot: name === 'victory' && false };
    const byStep = song.tracks.map((tr) => { const m = new Map(); for (const n of tr.notes) { if (!m.has(n.s)) m.set(n.s, []); m.get(n.s).push(n); } return m; });
    const tick = () => {
      if (!st.alive) return;
      const now = this.ctx.currentTime;
      // le minuteur a pris du retard (page occupée, onglet en arrière-plan) : on saute les pas manqués au lieu de les
      // jouer tous d'un coup
      if (!this.offline && st.t < now - 0.3) { const k = Math.ceil((now - st.t) / stepDur); st.step += k; st.t += k * stepDur; }
      while (st.t < now + (this.offline || 0.25)) {
        const s = song.loopStart != null && st.step >= song.steps ? song.loopStart + (st.step - song.loopStart) % (song.steps - song.loopStart) : st.step % song.steps;
        song.tracks.forEach((tr, i) => {
          const ns = byStep[i].get(s); if (!ns) return;
          for (const n of ns) {
            if (tr.type === 'drum') this.drum(n.k, st.t, tr.vol * (n.v ?? 1), bus, n.m);
            // la guitare saturée garde son timbre brut (c'est la distorsion qui fait le son)
            else if (tr.dist && dist) this.tone(tr.type, freq(n.m), st.t, n.d * stepDur * 0.92, tr.vol * (n.v ?? 1), dist, { attack: tr.attack, release: tr.release ?? Math.min(0.08, n.d * stepDur * 0.3) });
            else this.voice(tr.type, freq(n.m), st.t, n.d * stepDur * 0.92, tr.vol * (n.v ?? 1), bus, { attack: tr.attack, release: tr.release ?? Math.min(0.08, n.d * stepDur * 0.3) });
          }
        });
        st.step++; st.t += stepDur;
      }
      if (!this.offline) st.timer = setTimeout(tick, 60);
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
    const t = this.ctx.currentTime + 0.01;
    // en style moderne, les effets passent aussi un peu dans la réverbération, et leurs notes sont jouées en clochettes / piano
    let B = this.sfxBus;
    if (this.style !== 'retro' && this.reverb) { B = this.ctx.createGain(); B.connect(this.sfxBus); B.connect(this.revSfx); setTimeout(() => B.disconnect(), 4000); }
    const SFXV = { pulse25: 'sine', pulse12: 'sine', pulse50: 'pulse50', triangle: 'triangle', sine: 'sine' };
    const P = (f, dt, d, v = 0.12, ty = 'pulse25', o) => (this.style === 'retro' ? this.tone(ty, f, t + dt, d, v, B, o) : this.voice(SFXV[ty] || ty, f, t + dt, Math.max(d, 0.06), v * 1.1, B, o));
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
      case 'medal': this.duck(2500); [['C5', 0], ['E5', 0.1], ['G5', 0.2], ['C6', 0.32], ['B5', 0.44], ['C6', 0.58], ['G6', 0.72]].forEach(([m, d], i) => P(n(m), d, i === 6 ? 1.0 : 0.12, 0.11, 'pulse25')); break;
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
      case 'mega': this.duck(2200); for (let i = 0; i < 10; i++) P(n('C5') * Math.pow(2, i / 7), i * 0.07, 0.12, 0.07, 'pulse50'); [['C6', 0.75], ['G6', 0.75], ['E6', 0.75]].forEach(([m, d]) => P(n(m), d, 1.1, 0.07, 'sine')); this.tone('noise', 6000, t + 0.7, 0.9, 0.06, B, { release: 0.8 }); break;
      case 'evolve': for (let i = 0; i < 12; i++) P(n('C5') * Math.pow(2, (i % 6) / 6), i * 0.12, 0.1, 0.06, 'pulse50'); break;
      case 'buy': P(n('B5'), 0, 0.06, 0.08); P(n('E6'), 0.07, 0.12, 0.08); break;
      case 'pc': [['C6', 0], ['E6', 0.06], ['G6', 0.12]].forEach(([m, d]) => P(n(m), d, 0.05, 0.05, 'pulse12')); break;
      case 'status': P(n('A4'), 0, 0.3, 0.08, 'pulse50', { slide: n('E4') }); break;
      case 'cut':
        this.tone('noise', 3800, t, 0.07, 0.22, B, { filter: 'bandpass' });
        P(n('E6'), 0, 0.06, 0.14, 'triangle', { slide: n('B4') });
        this.tone('noise', 1600, t + 0.06, 0.14, 0.1, B, { filter: 'lowpass' });
        break;
      case 'splash':
        this.tone('noise', 900, t, 0.14, 0.24, B, { filter: 'lowpass' });
        P(n('G5'), 0.01, 0.08, 0.12, 'triangle', { slide: n('C5') });
        P(n('D6'), 0.05, 0.09, 0.1, 'sine', { slide: n('G5') });
        break;
      case 'whistle':
        this.duck(1800);
        [['E5', 0], ['B5', 0.1], ['E6', 0.2], ['G#6', 0.32], ['B6', 0.48]].forEach(([m, d], i) => {
          P(n(m), d, i === 4 ? 0.7 : 0.13, 0.12, 'sine');
        });
        break;
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

  /* ---------------- carillon cristallin interactif des 15 badges B2W2 (gamme de victoire) ---------------- */
  badgeChime(idx = 0) {
    if (!this.ctx || this.vol <= 0) return;
    const notes = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6', 'F6', 'G6', 'A6', 'B6', 'C7'];
    const m = notes[Math.max(0, Math.min(notes.length - 1, idx))];
    const t = this.ctx.currentTime + 0.01;
    const f = freq(midiOf(m));
    this.tone('sine', f, t, 0.35, 0.22, this.sfxBus, { attack: 0.005, release: 0.25 });
    this.tone('triangle', f * 2, t, 0.18, 0.09, this.sfxBus, { release: 0.14 });
    this.tone('pulse50', f * 0.5, t, 0.22, 0.07, this.sfxBus, { release: 0.16 });
  }

  /* ---------------- cinématique Lugia Obscur : sound design complet ---------------- */
  playLugiaCinematicAudio() {
    if (!this.ctx) return { stop: () => {} };
    const c = this.ctx;
    const bus = c.createGain();
    const masterVol = Math.max(0.1, Math.min(1.4, (this.vol ?? 0.7) * 1.3));
    bus.gain.value = masterVol;
    bus.connect(this.master || c.destination);

    const nodes = [];
    const timers = [];
    let stopped = false;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      timers.forEach((id) => clearTimeout(id));
      const now = c.currentTime;
      try {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0.0001, now + 0.35);
        setTimeout(() => {
          nodes.forEach((n) => {
            try { n.stop(); } catch (e) {}
            try { n.disconnect(); } catch (e) {}
          });
          try { bus.disconnect(); } catch (e) {}
        }, 400);
      } catch (e) {}
    };

    const t0 = c.currentTime + 0.05;

    // Distorsion WaveShaper (harmoniques démoniaques)
    const makeDistortion = (k = 10) => {
      const n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * k);
      }
      const ws = c.createWaveShaper();
      ws.curve = curve;
      ws.oversample = '2x';
      return ws;
    };
    const dist = makeDistortion(10);
    const distGain = c.createGain();
    distGain.gain.value = 0.85;
    dist.connect(distGain);
    distGain.connect(bus);

    // 1. Sub-bass Drone & Rumble sous-marin (0s -> 15s)
    try {
      const sub = c.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(38, t0);
      sub.frequency.exponentialRampToValueAtTime(55, t0 + 2.5);
      sub.frequency.exponentialRampToValueAtTime(32, t0 + 3.5);
      sub.frequency.exponentialRampToValueAtTime(48, t0 + 10.5);
      sub.frequency.exponentialRampToValueAtTime(25, t0 + 14.5);

      const subGain = c.createGain();
      subGain.gain.setValueAtTime(0.0001, t0);
      subGain.gain.exponentialRampToValueAtTime(0.48, t0 + 0.8);
      subGain.gain.setValueAtTime(0.48, t0 + 13.5);
      subGain.gain.linearRampToValueAtTime(0.0001, t0 + 15.0);

      sub.connect(subGain);
      subGain.connect(bus);
      sub.start(t0);
      sub.stop(t0 + 15.2);
      nodes.push(sub);

      // Bruit de grondement et bouillonnement de l'eau
      if (this.noise) {
        const nSrc = c.createBufferSource();
        nSrc.buffer = this.noise;
        nSrc.loop = true;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(140, t0);
        lp.frequency.exponentialRampToValueAtTime(280, t0 + 3.0);
        lp.frequency.exponentialRampToValueAtTime(180, t0 + 7.0);
        lp.frequency.exponentialRampToValueAtTime(380, t0 + 11.0);
        lp.frequency.exponentialRampToValueAtTime(90, t0 + 14.8);

        const nGain = c.createGain();
        nGain.gain.setValueAtTime(0.0001, t0);
        nGain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.6);
        nGain.gain.setValueAtTime(0.35, t0 + 13.5);
        nGain.gain.linearRampToValueAtTime(0.0001, t0 + 15.0);

        nSrc.connect(lp);
        lp.connect(nGain);
        nGain.connect(bus);
        nSrc.start(t0);
        nSrc.stop(t0 + 15.2);
        nodes.push(nSrc);
      }
    } catch (e) {}

    // 2. Accords dissonants sinistres (Chœur des Ténèbres / Cuivres apocalyptiques)
    try {
      const chordNotes = [61.74, 87.31, 103.83, 146.83]; // B1, F2, G#2, D3
      chordNotes.forEach((fVal, idx) => {
        const osc = c.createOscillator();
        osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(fVal, t0);
        osc.detune.setValueAtTime((idx - 1.5) * 8, t0);

        const flt = c.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(220, t0);
        flt.frequency.exponentialRampToValueAtTime(650, t0 + 3.0);
        flt.frequency.exponentialRampToValueAtTime(320, t0 + 7.0);
        flt.frequency.exponentialRampToValueAtTime(900, t0 + 11.5);
        flt.frequency.exponentialRampToValueAtTime(200, t0 + 14.8);

        const cGain = c.createGain();
        cGain.gain.setValueAtTime(0.0001, t0);
        cGain.gain.exponentialRampToValueAtTime(0.14, t0 + 1.0);
        cGain.gain.setValueAtTime(0.14, t0 + 13.5);
        cGain.gain.linearRampToValueAtTime(0.0001, t0 + 15.0);

        osc.connect(flt);
        flt.connect(cGain);
        cGain.connect(bus);
        osc.start(t0);
        osc.stop(t0 + 15.2);
        nodes.push(osc);
      });
    } catch (e) {}

    // 3. Rugissement monstrueux de Lugia Obscur (à 2.8s)
    timers.push(setTimeout(() => {
      if (stopped) return;
      const tRoar = c.currentTime;

      // Déflagration d'impact
      this.tone('noise', 400, tRoar, 0.45, 0.55, bus, { filter: 'lowpass' });
      this.tone('triangle', 95, tRoar, 0.5, 0.45, bus, { slide: 25 });

      // Cri de Lugia officiel (PokeAPI)
      try {
        const cryUrl = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/249.ogg';
        const a = new window.Audio(cryUrl);
        a.volume = Math.min(1, this.vol * 0.95);
        a.playbackRate = 0.85;
        a.play().catch(() => {});
      } catch (e) {}

      // Couche gutturale démoniaque synthétisée
      try {
        const r1 = c.createOscillator();
        r1.type = 'sawtooth';
        r1.frequency.setValueAtTime(240, tRoar);
        r1.frequency.exponentialRampToValueAtTime(85, tRoar + 1.8);

        const r2 = c.createOscillator();
        r2.type = 'sawtooth';
        r2.frequency.setValueAtTime(160, tRoar);
        r2.frequency.exponentialRampToValueAtTime(55, tRoar + 1.9);

        // LFO vibrato sur le rugissement
        const lfo = c.createOscillator();
        lfo.frequency.value = 9;
        const lfoGain = c.createGain();
        lfoGain.gain.value = 25;
        lfo.connect(lfoGain);
        lfoGain.connect(r1.frequency);
        lfoGain.connect(r2.frequency);
        lfo.start(tRoar);
        lfo.stop(tRoar + 2.0);
        nodes.push(lfo);

        const rGain = c.createGain();
        rGain.gain.setValueAtTime(0.0001, tRoar);
        rGain.gain.exponentialRampToValueAtTime(0.5, tRoar + 0.15);
        rGain.gain.setValueAtTime(0.5, tRoar + 1.2);
        rGain.gain.exponentialRampToValueAtTime(0.0001, tRoar + 2.0);

        r1.connect(dist);
        r2.connect(dist);
        distGain.connect(rGain);
        rGain.connect(bus);

        r1.start(tRoar);
        r1.stop(tRoar + 2.05);
        r2.start(tRoar);
        r2.stop(tRoar + 2.05);
        nodes.push(r1, r2);

        // Cri strident métallique aigu
        const scream = c.createOscillator();
        scream.type = 'sawtooth';
        scream.frequency.setValueAtTime(1400, tRoar + 0.05);
        scream.frequency.exponentialRampToValueAtTime(550, tRoar + 1.4);
        const sGain = c.createGain();
        sGain.gain.setValueAtTime(0.0001, tRoar);
        sGain.gain.exponentialRampToValueAtTime(0.18, tRoar + 0.12);
        sGain.gain.exponentialRampToValueAtTime(0.0001, tRoar + 1.5);
        scream.connect(sGain);
        sGain.connect(bus);
        scream.start(tRoar);
        scream.stop(tRoar + 1.55);
        nodes.push(scream);
      } catch (e) {}
    }, 2800));

    // 4. Déchaînement de la Tornade Obscure (6.5s -> 14.5s)
    timers.push(setTimeout(() => {
      if (stopped) return;
      const tWind = c.currentTime;
      if (this.noise) {
        const wSrc = c.createBufferSource();
        wSrc.buffer = this.noise;
        wSrc.loop = true;

        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 2.4;
        bp.frequency.setValueAtTime(450, tWind);
        bp.frequency.exponentialRampToValueAtTime(2200, tWind + 1.5);
        bp.frequency.exponentialRampToValueAtTime(650, tWind + 3.0);
        bp.frequency.exponentialRampToValueAtTime(2900, tWind + 4.5);
        bp.frequency.exponentialRampToValueAtTime(500, tWind + 7.5);

        const wGain = c.createGain();
        wGain.gain.setValueAtTime(0.0001, tWind);
        wGain.gain.exponentialRampToValueAtTime(0.48, tWind + 0.8);
        wGain.gain.setValueAtTime(0.48, tWind + 5.5);
        wGain.gain.linearRampToValueAtTime(0.0001, tWind + 8.0);

        wSrc.connect(bp);
        bp.connect(wGain);
        wGain.connect(bus);
        wSrc.start(tWind);
        wSrc.stop(tWind + 8.2);
        nodes.push(wSrc);
      }

      // Pulsations rythmiques de tonnerre / tambours de guerre
      for (let i = 0; i < 6; i++) {
        const beatT = tWind + i * 0.75;
        this.tone('triangle', 130, beatT, 0.18, 0.42, bus, { slide: 40 });
        this.tone('noise', 1200, beatT, 0.12, 0.22, bus, { filter: 'lowpass' });
      }
    }, 6500));

    // 5. Impact Cataclysmique & Crash de la Tornade (à 10.8s)
    timers.push(setTimeout(() => {
      if (stopped) return;
      const tHit = c.currentTime;

      // Explosion gigantesque
      this.tone('noise', 250, tHit, 0.7, 0.7, bus, { filter: 'lowpass' });
      this.tone('triangle', 180, tHit, 0.6, 0.58, bus, { slide: 30 });
      this.tone('pulse25', 1800, tHit, 0.15, 0.28, bus, { slide: 200 });

      // Onde de choc gutturale finale
      try {
        const bOsc = c.createOscillator();
        bOsc.type = 'sawtooth';
        bOsc.frequency.setValueAtTime(110, tHit);
        bOsc.frequency.exponentialRampToValueAtTime(35, tHit + 2.0);

        const bGain = c.createGain();
        bGain.gain.setValueAtTime(0.0001, tHit);
        bGain.gain.exponentialRampToValueAtTime(0.38, tHit + 0.08);
        bGain.gain.exponentialRampToValueAtTime(0.0001, tHit + 2.2);

        bOsc.connect(dist);
        distGain.connect(bGain);
        bGain.connect(bus);
        bOsc.start(tHit);
        bOsc.stop(tHit + 2.25);
        nodes.push(bOsc);
      } catch (e) {}
    }, 10800));

    return { stop };
  }

}
