// tools/test-epic-boss-music.mjs - Validation rigoureuse des musiques de boss
import assert from 'assert';

// Mock Web Audio API
class MockAudioNode {
  constructor() {
    this.gain = {
      value: 1,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {},
      cancelScheduledValues() {},
    };
    this.frequency = {
      value: 440,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    };
  }
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
  setPeriodicWave() {}
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode();
  }
  createGain() { return new MockAudioNode(); }
  createOscillator() { return new MockAudioNode(); }
  createBufferSource() { return new MockAudioNode(); }
  createBiquadFilter() { return new MockAudioNode(); }
  createWaveShaper() { return { curve: null, oversample: '2x', connect() {} }; }
  createBuffer(channels, length, rate) {
    return { getChannelData() { return new Float32Array(length); } };
  }
  createPeriodicWave() { return {}; }
}

globalThis.window = {
  AudioContext: MockAudioContext,
};

// Importer le moteur audio mis à jour
import { Sound, THEMES, CUSTOM_COMPOSERS } from '../odyssee/js/audio.js';

console.log('Testing Odyssée Epic Boss Battle Music System (v3.99)...');

// 1. Vérification des définitions THEMES
const bossThemes = ['leader', 'gymTension', 'champion', 'legend', 'eclipse', 'rival'];
for (const name of bossThemes) {
  assert(THEMES[name], `Thème manquant : ${name}`);
  assert.strictEqual(THEMES[name].custom, name, `THEMES[${name}].custom doit être "${name}"`);
  assert(typeof CUSTOM_COMPOSERS[name] === 'function', `CUSTOM_COMPOSERS[${name}] doit être une fonction`);
}
console.log('✔ All 6 boss themes registered in THEMES and CUSTOM_COMPOSERS!');

// 2. Vérification des propriétés musicales de chaque morceau
for (const name of bossThemes) {
  const song = CUSTOM_COMPOSERS[name]();
  assert(song.steps > 0, `${name}: steps doit être > 0`);
  assert(song.loopStart != null, `${name}: loopStart doit être défini pour une boucle de combat`);
  assert(song.loopStart < song.steps, `${name}: loopStart (${song.loopStart}) doit être < steps (${song.steps})`);
  assert(song.bpm >= 150 && song.bpm <= 200, `${name}: bpm (${song.bpm}) doit être rapide et épique (150-200)`);
  assert(song.tracks.length >= 6, `${name}: doit contenir au moins 6 pistes instrumentales (obtenu ${song.tracks.length})`);

  // Vérifier la présence d'une guitare saturée en distorsion pour la puissance rock / DS
  const hasDist = song.tracks.some((tr) => tr.dist && tr.type === 'sawtooth');
  assert(hasDist, `${name}: doit comporter une piste guitare saturée dist: true`);

  // Vérifier la batterie
  const drumTrack = song.tracks.find((tr) => tr.type === 'drum');
  assert(drumTrack, `${name}: piste drum requise`);
  const drumKinds = new Set(drumTrack.notes.map((n) => n.k));
  assert(drumKinds.has('k'), `${name}: batterie doit contenir des kicks (k)`);
  assert(drumKinds.has('s'), `${name}: batterie doit contenir des snares (s)`);
  assert(drumKinds.has('c'), `${name}: batterie doit contenir des cymbales crash (c)`);
  assert(drumKinds.has('h'), `${name}: batterie doit contenir des hi-hats (h)`);

  // Vérifier les notes mélodiques
  for (const tr of song.tracks) {
    if (tr.type === 'drum') continue;
    for (const note of tr.notes) {
      assert(note.s >= 0 && note.s < song.steps, `${name}: note s (${note.s}) hors limites [0, ${song.steps}[`);
      assert(note.d > 0, `${name}: note d (${note.d}) doit être > 0`);
      assert(note.m >= 20 && note.m <= 110, `${name}: note midi (${note.m}) hors registre [20, 110]`);
    }
  }
  console.log(`✔ Theme [${name.padEnd(10)}] -> ${song.steps} steps (${(song.steps / 16)} mesures), loopStart: ${song.loopStart}, ${song.bpm} BPM, ${song.tracks.length} tracks, ${song.tracks.reduce((acc, t) => acc + t.notes.length, 0)} notes`);
}

// 3. Simulation d'exécution dans le moteur Sound (Playback & transition en combat)
const sound = new Sound();
sound.init();

for (const name of bossThemes) {
  sound.play(name);
  assert.strictEqual(sound.current, name, `Sound.current doit valoir ${name}`);
  assert(sound.songs[name], `sound.songs[${name}] doit être initialisé`);
}

// Transition de combat d'arène : début avec 'leader', puis passage à 'gymTension' au dernier Pokémon
sound.play('leader');
assert.strictEqual(sound.current, 'leader');
sound.play('gymTension');
assert.strictEqual(sound.current, 'gymTension');
sound.stopMusic(0.1);
assert.strictEqual(sound.music, null);

console.log('🎉 ALL EPIC BOSS BATTLE MUSIC TESTS PASSED 100%!');
