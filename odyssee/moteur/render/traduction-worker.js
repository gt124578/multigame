// odyssee/moteur/render/traduction-worker.js — le modèle de traduction (opus-mt-en-fr, Transformers.js) dans un fil à
// part : traduire une phrase prend un moment, et dans la page cela figeait le jeu (les dialogues des cartes voisines
// sont traduits en avance). Messages reçus : { type: 'demarrer', modele, url } puis { id, texte } ; rendus : { etat },
// { pret }, { erreur }, { id, texte }.
let traduire = null;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'demarrer') {
    try {
      const { pipeline, env } = await import(m.url);
      // un seul fil pour le calcul : la page garde le reste de la machine
      try { env.backends.onnx.wasm.numThreads = 1; } catch { /* rien */ }
      const p = await pipeline('translation', m.modele, { progress_callback: (x) => { if (x.progress) self.postMessage({ etat: `téléchargement ${Math.round(x.progress)} %` }); } });
      traduire = async (s) => (await p(s))[0].translation_text;
      self.postMessage({ pret: true });
    } catch (err) { self.postMessage({ erreur: String(err?.message || err) }); }
    return;
  }
  if (!traduire) { self.postMessage({ id: m.id, texte: m.texte }); return; }
  try { self.postMessage({ id: m.id, texte: await traduire(m.texte) }); }
  catch (err) { self.postMessage({ id: m.id, texte: m.texte, erreur: String(err?.message || err) }); }
};
