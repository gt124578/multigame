// Aléa reproductible (mulberry32). L'état tient dans un entier : il est stocké dans l'état de partie,
// ce qui rend chaque partie rejouable à l'identique et permet la reprise après migration d'hôte.
export function nextRandom(seed) {
  let t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { seed: t, value: ((r ^ (r >>> 14)) >>> 0) / 4294967296 };
}

// Petit générateur attaché à un état : rng.next() avance state.seed.
export function rngOf(state) {
  return {
    next() { const o = nextRandom(state.seed); state.seed = o.seed; return o.value; },
    int(n) { return Math.floor(this.next() * n); },
    die() { return 1 + this.int(6); },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    },
  };
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
