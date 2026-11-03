// Modèle de vol de Dogfight 3D : orientation en quaternion (loopings et tonneaux possibles), énergie,
// postcombustion limitée, décrochage, et « instructeur » qui amène l'avion vers un point visé.
// Moteur pur : aucun DOM, aucun réseau. Les invités rejouent cette même fonction pour prédire leur avion.
// Repère de l'avion : +Z le nez, +Y le dos, +X l'aile gauche du pilote.

// ab : la capacité de l'avion (voir abilities.js) ; stall : vitesse de décrochage (m/s), plus basse pour ceux qui tiennent l'air lentement
export const TYPES = {
  f16: { name: 'F-16', full: 'F-16 Fighting Falcon', cruise: 125, boost: 208, pitch: 1.75, roll: 3.5, yaw: 0.55, hp: 100, gun: 4.6, sig: 1, stall: 50, ab: 'surge', blurb: 'Agile et nerveux : le meilleur roulis et un canon qui frappe fort.' },
  f22: { name: 'F-22', full: 'F-22 Raptor', cruise: 130, boost: 228, pitch: 1.5, roll: 2.7, yaw: 0.45, hp: 125, gun: 4.2, sig: 0.6, stall: 50, ab: 'stealth', blurb: 'Le plus rapide, solide, moins vif, et long à accrocher pour les missiles.' },
  rafale: { name: 'Rafale', full: 'Dassault Rafale', cruise: 128, boost: 216, pitch: 1.68, roll: 3.2, yaw: 0.52, hp: 110, gun: 4.5, sig: 0.8, stall: 48, ab: 'salvo', blurb: 'Polyvalent : bon partout, discret, rien d\'extrême.' },
  su35: { name: 'Su-35', full: 'Soukhoï Su-35 Flanker-E', cruise: 122, boost: 214, pitch: 1.9, roll: 2.9, yaw: 0.68, hp: 120, gun: 4.6, sig: 1.15, stall: 42, ab: 'cobra', blurb: 'Gros et costaud, le roi des virages serrés à basse vitesse.' },
  f18: { name: 'F/A-18', full: 'Boeing F/A-18E Super Hornet', cruise: 120, boost: 198, pitch: 1.72, roll: 3, yaw: 0.6, hp: 118, gun: 4.4, sig: 1.05, stall: 44, ab: 'jam', blurb: 'Solide et docile : il garde ses gouvernes même lent.' },
  a10: { name: 'A-10', full: 'Fairchild A-10 Thunderbolt II', cruise: 104, boost: 158, pitch: 1.5, roll: 2.6, yaw: 0.55, hp: 175, gun: 6.8, sig: 1.25, stall: 38, ab: 'brrrt', blurb: 'Lent mais blindé, avec un canon monstrueux : le char volant.' },
  cargo: { name: 'Transport', full: 'Avion de transport', cruise: 96, boost: 96, pitch: 0.5, roll: 0.8, yaw: 0.2, hp: 600, gun: 0, sig: 1.6, stall: 50, ab: null, blurb: '' },
};
export const TYPE_IDS = ['f16', 'f22', 'rafale', 'su35', 'f18', 'a10'];   // ceux qu'on choisit au hangar

export const CENTER = 800;      // centre de l'île d'Island Rush
export const ZONE = { x: CENTER, z: CENTER };   // centre de la zone de jeu : chaque carte place le sien (archipel.js)
export const ZONE_WARN = 6000;  // au-delà : alerte « retour dans la zone »
export const ZONE_MAX = 6400;   // au-delà : l'instructeur ramène l'avion
// la zone est un carré de 12 km : on mesure le plus grand des deux écarts au centre
export const zoneDist = (x, z) => Math.max(Math.abs(x - ZONE.x), Math.abs(z - ZONE.z));
export const CEILING = 2200;    // plafond : au-dessus, l'instructeur redescend

const G = 12;              // gravité de jeu (un peu forte : monter coûte vraiment de la vitesse)
const BOOST_THRUST = 48;   // poussée en postcombustion (m/s²)
const INDUCED = 0.00035;   // traînée des virages serrés
const BRAKE_DRAG = 30;
const AB_DRAIN = 1 / 9;    // la postcombustion tient 9 s
const AB_FILL = 1 / 16;    // et se recharge en 16 s
const AB_RESTART = 0.2;    // une fois vide, elle repart à 20 %
const LAG_PITCH = 0.13, LAG_ROLL = 0.1, LAG_YAW = 0.18;   // inertie de l'avion : temps de réponse de chaque axe (s)
const KEY_RELEASE = 0.22;  // une touche lâchée retombe à zéro en ce temps (s)
export const COBRA_TIME = 1.7;   // le Cobra du Su-35 : le nez se dresse à plus de 100° puis retombe, sans changer de route
const COBRA_ANGLE = 1.8;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Touche enfoncée (-1, 0 ou 1) vers une commande progressive : une tape corrige finement, un appui long tire à fond.
// `state` garde la position du manche ; le résultat suit une courbe douce au début de la course.
export const KEY_ATTACK = { pitch: 0.5, roll: 0.34, yaw: 0.45 };
export function keyRamp(state, key, dt, attack) {
  const step = key !== 0 && key * state >= 0 ? dt / attack : dt / KEY_RELEASE;
  const want = key === 0 || key * state >= 0 ? key : 0;
  const next = state < want ? Math.min(want, state + step) : Math.max(want, state - step);
  return next;
}
export const keyCurve = (v) => Math.sign(v) * Math.abs(v) ** 1.35;

// Crée l'état de vol, nez vers `heading` (radians autour de l'axe vertical)
export function createFlight({ x = 0, y = 200, z = 0, heading = 0, type = 'f16' } = {}) {
  const T = TYPES[type] || TYPES.f16;
  const s = { type: TYPES[type] ? type : 'f16', x, y, z, qx: 0, qy: Math.sin(heading / 2), qz: 0, qw: Math.cos(heading / 2), speed: T.cruise, ab: 1, abOut: false, boosting: false, braking: false, load: 0, wp: 0, wr: 0, wy: 0, dE: 0, dL: 0, dR: 0, dT: 0 };
  return computeAxes(s);
}

// Recalcule les axes à partir du quaternion
export function computeAxes(s) {
  const { qx: x, qy: y, qz: z, qw: w } = s;
  s.fx = 2 * (x * z + w * y); s.fy = 2 * (y * z - w * x); s.fz = 1 - 2 * (x * x + y * y);
  s.ux = 2 * (x * y - w * z); s.uy = 1 - 2 * (x * x + z * z); s.uz = 2 * (y * z + w * x);
  s.lx = 1 - 2 * (y * y + z * z); s.ly = 2 * (x * y + w * z); s.lz = 2 * (x * z - w * y);
  return s;
}

// Rotation de l'avion dans son propre repère (rad/s)
function rotate(s, wx, wy, wz, dt) {
  const { qx, qy, qz, qw } = s, h = dt * 0.5;
  s.qx += h * (qw * wx + qy * wz - qz * wy);
  s.qy += h * (qw * wy + qz * wx - qx * wz);
  s.qz += h * (qw * wz + qx * wy - qy * wx);
  s.qw += h * (-qx * wx - qy * wy - qz * wz);
  const n = 1 / Math.hypot(s.qx, s.qy, s.qz, s.qw);
  s.qx *= n; s.qy *= n; s.qz *= n; s.qw *= n;
}

// Inclinaison (positive : aile droite basse)
export const bankOf = (s) => Math.atan2(s.ly, s.uy);

// L'instructeur : commandes pour amener le nez vers la direction (ax, ay, az), ailes à plat une fois aligné
export function instructor(s, ax, ay, az) {
  const dr = -(ax * s.lx + ay * s.ly + az * s.lz), du = ax * s.ux + ay * s.uy + az * s.uz, df = ax * s.fx + ay * s.fy + az * s.fz;
  const err = Math.acos(clamp(df, -1, 1));
  const verticality = 1 - smooth(0.75, 0.95, Math.abs(s.fy));
  const level = clamp(-bankOf(s) * 1.5, -0.42, 0.42) * verticality;
  const t = smooth(0.08, 0.38, err);
  // loin de la cible : on incline vers elle puis on tire ; près d'elle : petites corrections, ailes à plat
  const rollErr = Math.atan2(dr, du < 0 && err < 0.35 ? -du : du);
  const r = clamp(rollErr * 2.6, -1, 1) * t + level * (1 - t);
  let p;
  if (err < 0.35) p = clamp(du * 5, -1, 1);
  else p = Math.abs(rollErr) < 0.7 ? 1 : 0.25;
  const y = clamp(dr * 5, -1, 1) * (1 - t * 0.7);
  return { p, r, y };
}

// Le Cobra : l'avion se cabre d'un coup en gardant sa trajectoire, perd la moitié de sa vitesse, et le poursuivant passe devant
export function startCobra(s) {
  computeAxes(s);
  Object.assign(s, { cob: COBRA_TIME, cqx: s.qx, cqy: s.qy, cqz: s.qz, cqw: s.qw, cvx: s.fx, cvy: s.fy, cvz: s.fz, cv: s.speed, wp: 0, wr: 0, wy: 0, boosting: false, braking: false });
}
function stepCobra(s, dt) {
  s.cob = Math.max(0, s.cob - dt);
  const t = 1 - s.cob / COBRA_TIME, th = COBRA_ANGLE * Math.sin(Math.PI * t) ** 0.8, h = -th / 2, sx = Math.sin(h), cw = Math.cos(h);
  // la rotation de tangage se fait dans le repère de l'avion : q = q0 × (axe des ailes, -θ)
  s.qx = s.cqw * sx + s.cqx * cw; s.qy = s.cqy * cw + s.cqz * sx; s.qz = s.cqz * cw - s.cqy * sx; s.qw = s.cqw * cw - s.cqx * sx;
  computeAxes(s);
  s.speed = Math.max(55, s.cv * (1 - 0.55 * t));
  s.load = 2 + 6 * Math.sin(Math.PI * t);
  s.x += s.cvx * s.speed * dt; s.y += s.cvy * s.speed * dt - 6 * t * dt; s.z += s.cvz * s.speed * dt;
  s.ab = Math.min(1, s.ab + AB_FILL * dt);
  return s;
}

// Un pas de vol. inp : p, r, y (commandes directes, -1 à 1), ax, ay, az (point visé), boost, brake, free (roulis libre), lim (force du tirage)
export function stepFlight(s, inp, dt) {
  const T = TYPES[s.type] || TYPES.f16, STALL = T.stall;
  if (s.cob > 0) return stepCobra(s, dt);
  computeAxes(s);

  // 1. Hors de la zone : l'instructeur reprend la main
  const dcx = ZONE.x - s.x, dcz = ZONE.z - s.z, dist = Math.hypot(dcx, dcz);
  let forced = null;
  if (zoneDist(s.x, s.z) > ZONE_MAX) { forced = { x: dcx / dist * 0.97, y: 0.24 * (s.y < 200 ? 1 : 0), z: dcz / dist * 0.97 }; }
  else if (s.y > CEILING) { forced = { x: s.fx * 0.85, y: -0.5, z: s.fz * 0.85 }; }

  // 2. Commandes : directes si le joueur appuie, instructeur sinon
  let pc = forced ? 0 : inp.p || 0, rc = forced ? 0 : inp.r || 0, yc = forced ? 0 : inp.y || 0;
  const direct = pc !== 0 || rc !== 0 || yc !== 0;
  if (!direct) {
    const a = forced || (inp.ax !== undefined ? { x: inp.ax, y: inp.ay, z: inp.az } : null);
    if (a && (a.x || a.y || a.z)) {
      const n = Math.hypot(a.x, a.y, a.z), c = instructor(s, a.x / n, a.y / n, a.z / n);
      pc = c.p * (inp.lim || 1); rc = c.r; yc = c.y;
    }
  } else if (!inp.free && rc !== 0) {
    // virage coordonné : l'inclinaison s'arrête vers 80°, et l'avion tire tout seul dans le virage
    const bank = bankOf(s), abs = Math.abs(bank);
    if (rc * bank > 0 && abs < 2.4) rc = Math.sign(rc) * Math.min(Math.abs(rc), (1.35 - abs) * 2.2);   // ralentit en approchant de la limite, sans cran
    if (pc === 0 && abs < 1.65) pc = 0.8 * Math.sin(abs);
  }

  // 3. Efficacité des gouvernes selon la vitesse, et dégâts
  const v = s.speed;
  const auth = clamp((v - (STALL - 12)) / 52, 0.2, 1) * clamp(1.25 - (v - 140) / 260, 0.72, 1);
  const wantPitch = pc * T.pitch * auth * (1 - 0.45 * s.dT);
  const wantRoll = (rc * T.roll * auth + (s.dL - s.dR) * 0.28) * (1 - 0.3 * Math.max(s.dL, s.dR));
  const wantYaw = yc * T.yaw * auth;
  // l'avion a de l'inertie : la vitesse de rotation rejoint la commande, elle ne saute jamais d'un coup
  s.wp += (wantPitch - s.wp) * (1 - Math.exp(-dt / LAG_PITCH));
  s.wr += (wantRoll - s.wr) * (1 - Math.exp(-dt / LAG_ROLL));
  s.wy += (wantYaw - s.wy) * (1 - Math.exp(-dt / LAG_YAW));
  const wPitch = s.wp;
  rotate(s, -wPitch, -s.wy, s.wr, dt);

  // 4. Décrochage : trop lent, le nez tombe
  if (v < STALL) {
    const k = (STALL - v) / STALL;
    computeAxes(s);
    rotate(s, s.uy * 1.8 * k, 0, 0, dt);
  }
  computeAxes(s);

  // 5. Énergie
  const wantBoost = !!inp.boost && !s.abOut && !forced && s.dE < 0.75;
  s.boosting = wantBoost;
  s.braking = !!inp.brake && !wantBoost;
  if (wantBoost) { s.ab -= AB_DRAIN * dt; if (s.ab <= 0) { s.ab = 0; s.abOut = true; s.boosting = false; } }
  else { s.ab = Math.min(1, s.ab + AB_FILL * dt); if (s.abOut && s.ab >= AB_RESTART) s.abOut = false; }
  const k = BOOST_THRUST / (T.boost * T.boost);
  let thrust = s.boosting ? BOOST_THRUST : k * T.cruise * T.cruise;
  thrust *= 1 - 0.5 * s.dE;
  if (s.braking) thrust *= 0.25;
  const wp = Math.abs(wPitch), turn = wp * s.speed;
  let a = thrust - k * s.speed * s.speed - G * s.fy - INDUCED * turn * turn;
  if (s.braking && s.speed > 72) a -= BRAKE_DRAG;
  s.speed = clamp(s.speed + a * dt, 30, T.boost * 1.5);
  s.load += (turn / 9.81 - s.load) * Math.min(1, dt * 8);

  // 6. Déplacement (un avion décroché s'enfonce)
  const sink = v < STALL ? (STALL - v) * 0.9 : 0;
  s.x += s.fx * s.speed * dt;
  s.y += s.fy * s.speed * dt - sink * dt;
  s.z += s.fz * s.speed * dt;
  return s;
}
