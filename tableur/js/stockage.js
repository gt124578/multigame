// Petit magasin IndexedDB : classeurs gardés dans le navigateur (sans la limite de localStorage),
// poignées des fichiers du disque (pour réenregistrer au même endroit) et fichiers récents.

const BASE = 'sprezz', MAGASIN = 'kv';
let ouverture = null;
function base() {
  if (!ouverture) {
    ouverture = new Promise((ok, ko) => {
      if (typeof indexedDB === 'undefined') return ko(new Error('IndexedDB indisponible'));
      const req = indexedDB.open(BASE, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(MAGASIN);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error);
    });
    ouverture.catch(() => { ouverture = null; });
  }
  return ouverture;
}
function operation(mode, fn) {
  return base().then((db) => new Promise((ok, ko) => {
    const tx = db.transaction(MAGASIN, mode), st = tx.objectStore(MAGASIN);
    const req = fn(st);
    tx.oncomplete = () => ok(req && req.result);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error);
  }));
}
export const idbLire = (cle) => operation('readonly', (st) => st.get(cle));
export const idbEcrire = (cle, val) => operation('readwrite', (st) => st.put(val, cle));
export const idbSupprimer = (cle) => operation('readwrite', (st) => st.delete(cle));

/** Demande au navigateur de ne pas effacer ce stockage quand la place manque. */
export function stockagePersistant() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* sans importance */ } }
