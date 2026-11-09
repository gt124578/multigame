// tools/odyssee-empreinte.mjs — empreinte de la région d'Odyssée : un condensé (FNV-1a 32 bits) de chaque carte construite
// par buildWorld (cases, hauteurs, bâtiments, décor, PNJ, objets, portes, zones…), pour vérifier que la carte est la
// même partout : deux constructions de suite dans Node, et Node contre Chrome (tools/odyssee-parcours.mjs compare
// l'empreinte calculée dans la page à celle de Node). Les fonctions (scripts des quêtes) comptent par leur seule
// présence ; les clés qui commencent par « _ » (index refaits à la demande) et les durées mesurées (`ms`) sont ignorées.
//
//   node tools/odyssee-empreinte.mjs            empreinte de la région et des 10 plus grandes cartes
//   node tools/odyssee-empreinte.mjs --deux     construit deux fois et compare (hasard caché, état partagé entre deux appels)
//
// Le module s'importe aussi dans le navigateur : import('/tools/odyssee-empreinte.mjs') puis empreinte(world).

const IGNORE = new Set(['ms']);

/** condensé d'une valeur quelconque (objets parcourus dans l'ordre de leurs clés, Map et Set dans leur ordre) */
export function condense(v) {
  let h = 0x811c9dc5 >>> 0;
  const octet = (b) => { h ^= b & 255; h = Math.imul(h, 0x01000193) >>> 0; };
  const texte = (s) => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); octet(c); octet(c >> 8); } octet(0); };
  const vus = new Map();
  const f64 = new Float64Array(1), u8 = new Uint8Array(f64.buffer);
  const nombre = (x) => { if (Number.isInteger(x) && Math.abs(x) < 2 ** 31) { octet(1); octet(x); octet(x >> 8); octet(x >> 16); octet(x >> 24); } else { octet(2); f64[0] = x; for (let i = 0; i < 8; i++) octet(u8[i]); } };
  const marche = (x) => {
    if (x === null) { octet(3); return; }
    switch (typeof x) {
      case 'undefined': octet(4); return;
      case 'boolean': octet(x ? 5 : 6); return;
      case 'number': nombre(x); return;
      case 'string': octet(7); texte(x); return;
      case 'function': octet(8); return;
      case 'bigint': octet(9); texte(String(x)); return;
      case 'symbol': octet(10); return;
    }
    if (vus.has(x)) { octet(11); nombre(vus.get(x)); return; }
    vus.set(x, vus.size);
    if (ArrayBuffer.isView(x)) { octet(12); const b = new Uint8Array(x.buffer, x.byteOffset, x.byteLength); nombre(b.length); for (let i = 0; i < b.length; i++) octet(b[i]); return; }
    if (x instanceof Map) { octet(13); for (const [k, y] of x) { marche(k); marche(y); } octet(14); return; }
    if (x instanceof Set) { octet(15); for (const y of x) marche(y); octet(14); return; }
    if (Array.isArray(x)) { octet(16); nombre(x.length); for (const y of x) marche(y); return; }
    octet(17);
    for (const k of Object.keys(x)) { if (k[0] === '_' || IGNORE.has(k)) continue; texte(k); marche(x[k]); }
    octet(14);
  };
  marche(v);
  return h.toString(16).padStart(8, '0');
}

/** { total, cartes: { id: condensé } } : une empreinte par carte, et celle de tout le reste (villes, routes, quêtes…) */
export function empreinte(W) {
  const cartes = {};
  for (const [id, m] of Object.entries(W.maps)) cartes[id] = condense(m);
  const reste = {}; for (const k of Object.keys(W)) if (k !== 'maps') reste[k] = W[k];
  const autres = condense(reste);
  return { total: condense([cartes, autres]), autres, cartes };
}

/** les cartes dont l'empreinte diffère entre deux relevés */
export function differences(a, b) {
  const ids = new Set([...Object.keys(a.cartes), ...Object.keys(b.cartes)]);
  return [...ids].filter((id) => a.cartes[id] !== b.cartes[id]).concat(a.autres !== b.autres ? ['(villes, routes, quêtes…)'] : []);
}

// en ligne de commande
if (typeof process !== 'undefined' && process.argv?.[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const { buildWorld } = await import('../odyssee/js/world/region.js');
  const t0 = performance.now(), W = buildWorld(), t1 = performance.now(), E = empreinte(W), t2 = performance.now();
  console.log(`buildWorld : ${Math.round(t1 - t0)} ms, empreinte : ${Math.round(t2 - t1)} ms`);
  console.log(`région ${E.total} (${Object.keys(E.cartes).length} cartes)`);
  const grandes = Object.values(W.maps).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 10);
  for (const m of grandes) console.log(`  ${m.id.padEnd(22)} ${String(m.w + ' × ' + m.h).padEnd(12)} ${E.cartes[m.id]}`);
  if (process.argv.includes('--deux')) {
    const E2 = empreinte(buildWorld()), d = differences(E, E2);
    console.log(d.length ? `✗ deuxième construction différente : ${d.slice(0, 20).join(', ')}` : '✓ deuxième construction identique');
    if (d.length) process.exitCode = 1;
  }
}
