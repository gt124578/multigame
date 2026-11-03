// Capacités de Dogfight 3D : une par avion, toutes les 25 s, prête dès la réapparition.
// Moteur pur : l'effet vit dans l'avion (abT : temps d'effet restant, abCd : recharge restante), les armes et le vol le lisent.
import { TYPES, startCobra, COBRA_TIME } from './flight.js';
import { fireMissile, hidden, LOCK_RANGE } from './weapons.js';

export const ABILITY_COOLDOWN = 25;
export const ABILITIES = {
  surge: { name: 'Surcharge', short: 'SURCH.', time: 6, desc: 'Canon sans surchauffe et 30 % plus rapide pendant 6 s.' },
  stealth: { name: 'Furtivité', short: 'FURTIF', time: 6, desc: '6 s sans pouvoir être accroché ni suivi, et invisible au radar ennemi.' },
  salvo: { name: 'Salve', short: 'SALVE', time: 0, desc: 'Deux missiles d\'un coup sur les deux ennemis devant toi, sans attendre l\'accrochage.' },
  cobra: { name: 'Cobra', short: 'COBRA', time: COBRA_TIME, desc: 'Cabré brutal sans changer de route : tu casses ta vitesse et le poursuivant passe devant.' },
  jam: { name: 'Brouilleur', short: 'BROUIL.', time: 5, desc: 'Les missiles ennemis autour de toi décrochent, et personne n\'accroche à moins d\'un kilomètre pendant 5 s.' },
  brrrt: { name: 'Brrrt', short: 'BRRRT', time: 4, desc: 'Canon à dégâts doublés, sans surchauffe, pendant 4 s.' },
};
export const abilityOf = (type) => ABILITIES[(TYPES[type] || {}).ab] || null;
const SALVO_CONE = 0.8;   // cos(37°)

// Les deux cibles de la Salve : devant, visibles, les plus proches du nez
function salvoTargets(p, planes, world) {
  const list = [];
  for (const t of planes) {
    if (!t.alive || t.id === p.id || (p.team && p.team === t.team) || t.inv > 0) continue;
    const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, d = Math.hypot(dx, dy, dz), dot = (dx * p.fx + dy * p.fy + dz * p.fz) / (d || 1);
    if (d < 150 || d > LOCK_RANGE * 1.15 || dot < SALVO_CONE || hidden(t, world)) continue;
    list.push({ t, score: dot * 2 - d / LOCK_RANGE + (t.id === p.lockId ? 1 : 0) });
  }
  return list.sort((a, b) => b.score - a.score).map((q) => q.t);
}

// Déclenche la capacité si elle est prête ; rend faux si rien ne s'est passé (une Salve sans cible n'est pas gâchée)
export function useAbility(p, g, world) {
  const id = (TYPES[p.type] || {}).ab, A = ABILITIES[id];
  if (!A || p.abCd > 0 || !p.alive || p.cob > 0) return false;
  if (id === 'salvo') {
    const ts = salvoTargets(p, g.planes, world);
    if (!ts.length) { g.events.push({ e: 'abno', id: p.id }); return false; }
    fireMissile(p, ts[0].id, g.missiles, g.events, -1);
    fireMissile(p, (ts[1] || ts[0]).id, g.missiles, g.events, 1);
  } else if (id === 'cobra') startCobra(p);
  p.abCd = ABILITY_COOLDOWN; p.abT = A.time; p.abUses = (p.abUses || 0) + 1;
  if (id === 'surge' || id === 'brrrt') { p.heat = 0; p.over = false; p.overT = 0; }
  g.events.push({ e: 'ab', id: p.id, ab: id, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) });
  return true;
}
