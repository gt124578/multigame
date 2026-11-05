// odyssee/js/render/solgen-worker.js — calcule le sol généré d'un bloc de carte hors du fil principal (voir sol.js).
import { rendreBloc, rendreRoche } from './solgen.js';

self.onmessage = (e) => {
  const { key, z, seed, cave } = e.data;
  try {
    // sortes de cases et relief qui ont servi au calcul (sol.js vérifie qu'ils n'ont pas changé)
    const t0 = performance.now(), kinds = z.kinds.slice(), rel = z.rel ? z.rel.slice() : null;
    const frames = rendreBloc({ ...z, seed, cave });
    // relief en 3D : la roche seule, pour les pentes de roche (relief3d.js)
    const roche = z.roche && !cave ? rendreRoche({ ...z, seed }) : null;
    self.postMessage({ key, bw: z.bw, bh: z.bh, frames, kinds, rel, roche, rocheH: roche ? z.bh + z.roche : 0, ms: performance.now() - t0 },
      [...frames.map((f) => f.buffer), kinds.buffer, ...(rel ? [rel.buffer] : []), ...(roche ? [roche.buffer] : [])]);
  } catch (err) {
    self.postMessage({ key, error: String(err && err.stack || err) });
  }
};
