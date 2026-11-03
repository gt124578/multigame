// odyssee/js/render/solgen-worker.js — calcule le sol généré d'un bloc de carte hors du fil principal (voir sol.js).
import { rendreBloc } from './solgen.js';

self.onmessage = (e) => {
  const { key, gen, z, seed, cave } = e.data;
  try {
    const frames = rendreBloc({ ...z, seed, cave });
    self.postMessage({ key, gen, bw: z.bw, bh: z.bh, frames }, frames.map((f) => f.buffer));
  } catch (err) {
    self.postMessage({ key, gen, error: String(err && err.stack || err) });
  }
};
