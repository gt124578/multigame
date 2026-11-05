// odyssee/js/world/migration.js — les sauvegardes d'avant une nouvelle carte du monde (sans DOM).
// La carte porte un numéro de version (CARTE_VERSION de region.js, `world.carte`) et la sauvegarde aussi (`state.carte`,
// absent = 1, l'ancienne carte de 440 × 520). Quand la carte a changé, les positions sur la carte du monde ne veulent
// plus rien dire : la partie reprend au Centre de soins de la dernière ville visitée (la maison, à Bourg-Aube). Rien
// d'autre ne se perd : badges, équipe, objets, quêtes, dresseurs battus et objets ramassés sont notés par identifiant,
// et ces identifiants n'ont pas changé. Seul ce qui dépend des cases du monde repart à zéro : petits arbres coupés et
// rochers brisés ou poussés (ils sont revenus), carte explorée (redessinée autour des villes visitées).

/** met à jour une sauvegarde chargée ; renvoie la ville où elle reprend, ou null si elle était déjà à jour */
export function migrerCarte(state, world) {
  const version = world.carte || 1;
  if ((state.carte || 1) >= version) return null;
  const villes = Object.values(world.towns), visited = state.visited || ['aube'];
  let t = null;
  for (let i = visited.length - 1; i >= 0 && !t; i--) t = villes.find((q) => q.id === visited[i] && (q.centerId || q.homeDoor)) || null;
  t ||= villes.find((q) => q.id === 'aube');
  if (t?.centerId && world.maps[t.centerId]) {
    const c = world.maps[t.centerId];
    Object.assign(state, { map: c.id, x: c.exitX, y: c.exitY - 1, dir: 'up' });
  } else Object.assign(state, { ...world.start });
  state.surf = false;
  if (state.cleared) delete state.cleared.monde;
  if (state.tiles) delete state.tiles.monde;
  state.lastOutdoor = null;
  // la carte de la région : les villes déjà visitées restent dévoilées (blocs de 8 × 8 cases, comme game.explore)
  const W = world.maps.monde, B = 8, cw = Math.ceil(W.w / B), vus = new Set();
  for (const id of visited) {
    const v = villes.find((q) => q.id === id); if (!v) continue;
    const r = v.ville || v;
    for (let y = Math.floor(r.y / B); y <= Math.floor((r.y + r.h) / B); y++) for (let x = Math.floor(r.x / B); x <= Math.floor((r.x + r.w) / B); x++) vus.add(y * cw + x);
  }
  state.explored = [...vus];
  state.carte = version;
  return t;
}
