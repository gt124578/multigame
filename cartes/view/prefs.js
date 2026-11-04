// Réglages du joueur, retenus dans ce navigateur : le coin de révélation, cartes cachées par défaut, taille du coup d'œil.
const KEY = 'cartes_prefs';
export const CORNERS = [['bl', 'En bas à gauche ↙'], ['br', 'En bas à droite ↘'], ['tl', 'En haut à gauche ↖'], ['tr', 'En haut à droite ↗']];
const DEF = { corner: 'br', hidden: true, size: 'small', dim: true, autoHide: 4 };

export function loadPrefs() {
  try { return { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || 'null') || {}) }; } catch (e) { return { ...DEF }; }
}
export function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
}
