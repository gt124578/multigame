// odyssee/js/render/solgen-worker.js — calcule le sol généré d'un bloc de carte hors du fil principal (voir sol.js).
import { rendreBloc } from './solgen.js';

self.onmessage = (e) => {
  const { key, z, seed, cave } = e.data;
  try {
    // sortes de cases et relief qui ont servi au calcul (sol.js vérifie qu'ils n'ont pas changé)
    const t0 = performance.now(), kinds = z.kinds.slice(), rel = z.rel ? z.rel.slice() : null;
    const frames = rendreBloc({ ...z, seed, cave });
    self.postMessage({ key, bw: z.bw, bh: z.bh, frames, kinds, rel, ms: performance.now() - t0 }, [...frames.map((f) => f.buffer), kinds.buffer, ...(rel ? [rel.buffer] : [])]);
  } catch (err) {
    self.postMessage({ key, error: String(err && err.stack || err) });
  }
};
