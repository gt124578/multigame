/* =============================================================================
   Mini-Golf Party — LE MARATHON : un parcours de 18 trous très longs (100 à 260 m chacun)
   Chaque trou enchaîne plusieurs épreuves des autres parcours : lacets, descentes glacées, sauts, loopings,
   tapis roulants, plafonds aimantés, trampolines, marteaux, moulins, spirale…
   Repère local : départ à l'origine vers +z ; +x = gauche ; tourner de +deg = à gauche (voir build.js).
   Les lignes droites plates sont découpées tous les mètres (step) : même forme, beaucoup moins de triangles.
   ============================================================================= */
import { V } from './build.js';

const ring = (c, R, a0, a1, n = 24) => { const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([c[0] + Math.sin(a) * R, c[2] + Math.cos(a) * R]); } return pts; };
const STEP = 1.0;

/* ---------- obstacles ---------- */
function windmill(B, t, o = {}) {
  const yaw = t.dir(), depth = 2.2;
  for (const s of [1, -1]) B.box(t.here(depth / 2, s * 0.86, 0.32), [0.78, 0.64, depth], { yaw, mat: 'whitew' });
  B.deco('windmill', t.here(depth / 2, 0, 0), { yaw, w: 3.4, d: depth });
  B.kin({ pivot: t.here(-0.24, 0, 1.5), pose: { type: 'spin', axis: [0, 0, 1], speed: o.speed ?? 1.25, phase: o.phase || 0, yaw }, look: 'blades', mat: 'wood',
    boxes: [{ c: [0, 0.8, 0], s: [0.3, 1.4, 0.07] }, { c: [0, -0.8, 0], s: [0.3, 1.4, 0.07] }, { c: [0.8, 0, 0], s: [1.4, 0.3, 0.07] }, { c: [-0.8, 0, 0], s: [1.4, 0.3, 0.07] }] });
  t.straight(depth);
}
function slider(B, t, ahead, o = {}) {
  const yaw = t.dir(), p = t.here(ahead, o.lat || 0, 0), s = o.size || [1.1, 0.5, 0.35];
  B.kin({ pivot: p, pose: { type: 'slide', dir: [1, 0, 0], amp: o.amp ?? 1.2, period: o.period ?? 2.6, phase: o.phase || 0, yaw }, look: o.look || 'door', mat: o.mat || 'metalw',
    boxes: [{ c: [0, s[1] / 2, 0], s }] });
}
function spinner(B, t, ahead, o = {}) {
  const yaw = t.dir(), p = t.here(ahead, o.lat || 0, 0.14), L = o.len ?? (t.last.w - 0.1);
  const boxes = [{ c: [0, 0, 0], s: [L, 0.16, 0.16] }];
  if (o.cross) boxes.push({ c: [0, 0, 0], s: [0.16, 0.16, L] });
  B.kin({ pivot: p, pose: { type: 'spin', axis: [0, 1, 0], speed: o.speed ?? 1.6, phase: o.phase || 0, yaw }, look: o.look || 'bar', mat: o.mat || 'hazard', boxes });
  B.cyl(t.here(ahead, o.lat || 0, 0), 0.08, 0.55, { mat: 'metalw', seg: 10 });
}
function pendulum(B, t, ahead, o = {}) {
  const yaw = t.dir(), H = o.h ?? 2.6, p = t.here(ahead, 0, 0);
  B.kin({ pivot: V.add(p, [0, H, 0]), pose: { type: 'swing', axis: [0, 0, 1], amp: o.amp ?? 0.95, period: o.period ?? 2.4, phase: o.phase || 0, yaw }, look: o.look || 'log', mat: o.mat || 'logw',
    boxes: [{ c: [0, -H + 0.27, 0], s: o.head || [0.8, 0.48, 0.5] }, { c: [0, -H / 2, 0], s: [0.1, H - 0.6, 0.1] }] });
  B.deco('gantry', p, { yaw, h: H + 0.3 });
}
function hammer(B, t, ahead, o = {}) {
  const yaw = t.dir(), p = t.here(ahead, 0, 0);
  B.kin({ pivot: V.add(p, [0, 2.7, 0]), pose: { type: 'swing', axis: [0, 0, 1], amp: 1.0, period: o.period ?? 2.4, phase: o.phase || 0, yaw }, look: 'hammer', mat: 'hazard',
    boxes: [{ c: [0, -2.43, 0], s: [0.9, 0.5, 0.55] }, { c: [0, -1.2, 0], s: [0.12, 2.0, 0.12] }] });
  B.deco('gantry', p, { yaw, h: 2.9 });
}
function wheel(B, t, ahead, o = {}) {
  const yaw = t.dir(), R = o.R ?? 1.5, w = (o.w ?? t.last.w) - 0.15, piv = t.here(ahead, 0, R + 0.05);
  B.kin({ pivot: piv, pose: { type: 'spin', axis: [1, 0, 0], speed: o.speed ?? 1.2, phase: o.phase || 0, yaw }, look: o.look || 'wheel', mat: o.mat || 'logw',
    boxes: [{ c: [0, R / 2, 0], s: [w, R, 0.12] }, { c: [0, -R / 2, 0], s: [w, R, 0.12] }, { c: [0, 0, R / 2], s: [w, 0.12, R] }, { c: [0, 0, -R / 2], s: [w, 0.12, R] }] });
}
/** Tunnel à plafond aimanté : on roule la tête en bas ; le sol disparaît sur « gap » mètres */
function magnetTunnel(B, t, len, gap) {
  t.wallH(1.0);
  const s0 = t.last.s;
  t.roof(true, 'magnet');
  const lead = (len - gap) / 2;
  t.straight(lead).floorOff(true).straight(gap).floorOff(false).straight(lead);
  const s1 = t.last.s;
  t.roof(false).wallH(0.3);
  B.zoneAlong(t, s0 + 0.6, s1 - 0.6, 'antigrav', { above: 0.25 });
}
/** Saut : petit tremplin, trou de len mètres, réception (dh : différence de hauteur à l'arrivée) */
function jump(t, len, dh, wLand = 4.2) {
  t.slope(2.4, 0.6, { ease: 'in' });
  t.w = wLand; t.gap(len, dh - 0.6);
}
/** Plots posés le long de l'allée : [abscisse depuis la fin actuelle (négative = en arrière), décalage latéral] */
function bumpers(B, t, list, o = {}) {
  for (const [d, l] of list) B.cyl(t.here(d, l, 0), o.r ?? 0.24, 0.35, { mat: o.mat || 'bumper', seg: 14 });
}
/** Arrivée dans une cuvette : le trou au fond */
function bowlFinish(B, t, R, o = {}) {
  t.straight(0.4);
  const c = t.here(R - 0.2, 0, 0); t.straight(0.2);
  const y = c[1];
  B.cup(B.bowl(c, R, o.depth ?? 0.7, { floor: o.floor || 'felt' }));
  const back = t.dir() + Math.PI, gapA = Math.asin(Math.min(0.95, (t.last.w / 2 + 0.22) / R));
  B.wallLine(ring(c, R, back + gapA, back + 2 * Math.PI - gapA, 30), y, { center: c, mat: o.wall || 'stonew' });
  B.cyl([c[0], 0, c[2]], R + 0.2, y, { mat: o.skirt || 'skirtstone', phys: false, noTop: true, seg: 40 });
}
function lamp(B, p, color = 0xffb35a) { B.deco('lamp', p); B.light([p[0], p[1] + 2.7, p[2]], color, 5, 9); }
function sign(B, n, lat = 2.9) { B.deco('sign', B.L(lat, 0, 0.6), { yaw: B.Y(180), n }); }

/* =============================================================================
   LE MARATHON
   ============================================================================= */
const holes = [
  /* 1 — une longue mise en jambes : ligne droite, grande descente, deux virages et des plots */
  { name: 'Le Grand Départ', par: 6, build(B) {
    const t = B.path({ y: 4, w: 3.0, step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 1);
    t.straight(22);
    bumpers(B, t, [[-12, 0.7], [-8, -0.8], [-4, 0.2]]);
    t.slope(36, -3.4, { ease: 'lin' }).straight(6).turn(-40, 16, { bank: -5 }).straight(16, { bank: 0 });
    bumpers(B, t, [[-12, -0.9], [-9, 0.8], [-6, -0.3], [-3, 0.9]]);
    t.turn(40, 16, { bank: 5 }).straight(4, { bank: 0 }).straight(22).capEnd();
    B.cup(t.here(-1.6, 0.4));
    bumpers(B, t, [[-9, 0.9], [-7, -0.8], [-5, 0.1]]);
    lamp(B, t.here(0.6, 2.4, -0.35));
  } },
  /* 2 — trois moulins sur une route de campagne */
  { name: 'La Route des Moulins', par: 5, build(B) {
    const t = B.path({ y: 0.35, w: 2.2, step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 2, 2.4);
    t.straight(16); windmill(B, t, { speed: 1.1 }); t.straight(18).turn(60, 12, { bank: 6 }).straight(14, { bank: 0 });
    windmill(B, t, { speed: -1.4, phase: 1 }); t.straight(10).turn(-60, 12, { bank: -6 }).straight(20, { bank: 0 });
    windmill(B, t, { speed: 1.7, phase: 2 }); t.straight(14).capEnd();
    B.cup(t.here(-1.4));
  } },
  /* 3 — cinq épingles qui grimpent au col */
  { name: 'Les Lacets du Col', par: 8, build(B) {
    const t = B.path({ y: 1, w: 2.8, step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 3);
    t.straight(14);
    for (let k = 0; k < 5; k++) {
      const s = k % 2 ? -1 : 1;
      t.seg({ len: 20, turn: 180 * s, dh: 1.4, bank: 12 * s }).straight(2, { bank: 0 }).straight(14);
      if (k === 1 || k === 3) slider(B, t, -6, { size: [1.0, 0.7, 0.9], amp: 1.0, period: 3.0 + k * 0.3, look: 'boulder', mat: 'redrock' });
    }
    t.straight(6).capEnd(); B.cup(t.here(-1.4));
    B.deco('cliff', t.here(-8, -9, -t.last.p[1]), { r: 5, h: 8 });
  } },
  /* 4 — du sommet, grande descente glacée en virages relevés, puis la neige pour freiner */
  { name: 'La Grande Descente', par: 5, skirt: 'skirtice', build(B) {
    const t = B.path({ y: 16, w: 2.6, wall: 'icew', step: STEP }).capStart(); B.tee(t.here(0.9));
    t.straight(5).wallH(0.5).mat('ice')
      .seg({ len: 22, turn: 55, dh: -3.2, bank: 14 }).seg({ len: 26, turn: -110, dh: -3.6, bank: -16 }).seg({ len: 22, turn: 55, dh: -3, bank: 12 })
      .straight(3, { bank: 0 }).mat('snow').straight(4).mat('snowpack').slope(22, -3.4).straight(10).wallH(0.3)
      .turn(90, 8, { bank: 8 }).straight(10, { bank: 0 }).mat('sand').straight(3).mat('snowpack').straight(10).capEnd();
    B.cup(t.here(-1.5));
    B.deco('snowpine', t.here(-6, 3.4, 0)); B.deco('snowpine', t.here(-14, -3.4, 0)); B.deco('snowman', t.here(0.6, 2.4, 0));
  } },
  /* 5 — accélérateurs et deux grands sauts */
  { name: 'Le Saut de l\'Ange', par: 4, build(B) {
    const t = B.path({ y: 2.4, w: 2.6, step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 5);
    t.straight(18).mat('boost').flow(1).straight(1.6).flow(0).mat('felt').straight(8);
    jump(t, 7, -1.0, 4.6);
    t.straight(16, { w: 4.6 }).straight(2, { w: 2.6 }).turn(-60, 10).straight(12).mat('boost').flow(1).straight(1.6).flow(0).mat('felt').straight(6);
    jump(t, 6, 0.2, 4.4);
    t.straight(12, { w: 4.4 }).straight(2, { w: 2.6 }).turn(60, 10).straight(16).capEnd();
    B.cup(t.here(-1.5));
  } },
  /* 6 — le serpent : six grands virages relevés et des bras qui tournent */
  { name: 'Le Serpent', par: 6, build(B) {
    const t = B.path({ y: 1, w: 2.6, step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 6);
    t.straight(12);
    for (let k = 0; k < 6; k++) {
      const s = k % 2 ? -1 : 1;
      t.seg({ len: 18, turn: 80 * s, bank: 10 * s }).straight(7, { bank: 0 });
      if (k % 2 === 0) spinner(B, t, -3.5, { speed: 1.2 + k * 0.15, phase: k });
    }
    t.straight(12).capEnd(); B.cup(t.here(-1.4));
  } },
  /* 7 — deux ponts sans bordure au-dessus du vide, et des troncs qui balancent */
  { name: 'Le Pont Suspendu', par: 5, skirt: 'skirtwood', build(B) {
    const t = B.path({ y: 5, w: 2.6, base: 'slab', floor: 'plank', wall: 'wood', step: STEP }).capStart(); B.tee(t.here(0.9));
    t.straight(14).walls(false, false).mat('logf', 'logw').straight(1, { w: 1.8 }).straight(28);
    pendulum(B, t, -19, { period: 2.6 }); pendulum(B, t, -8, { period: 2.2, phase: 1.1 });
    t.straight(1, { w: 2.6 }).walls(true, true).mat('plank', 'wood').straight(8).turn(70, 8).straight(10)
      .walls(false, false).mat('logf', 'logw').straight(1, { w: 1.8 }).straight(22);
    pendulum(B, t, -11, { period: 2.8, phase: 0.6 });
    t.straight(1, { w: 2.6 }).walls(true, true).mat('plank', 'wood').turn(-70, 8).slope(16, -3.6).straight(12).capEnd();
    B.cup(t.here(-1.5));
    B.deco('cliff', B.L(0, 0, 3), { r: 4, h: 5 });
  } },
  /* 8 — tapis roulants dans les deux sens et accélérateurs */
  { name: 'Les Tapis Roulants', par: 5, skirt: 'skirtmetal', build(B) {
    const t = B.path({ y: 1, w: 2.6, floor: 'metal', wall: 'metalw', trim: 'neon', step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 8);
    t.straight(8).mat('conveyor').flow(-1).straight(6).flow(0).mat('metal').straight(6).mat('boost').flow(1).straight(1.6).flow(0).mat('metal').straight(10)
      .turn(90, 6).straight(4).mat('conveyor').flow(1).slope(16, 3.2).flow(0).mat('metal').straight(8).turn(-90, 6).straight(6)
      .mat('conveyor').flow(-1).straight(6).flow(0).mat('metal').straight(4).mat('boost').flow(1).straight(1.6).flow(0).mat('metal').straight(22)
      .turn(-90, 6).slope(14, -3.2).straight(14).capEnd();
    B.cup(t.here(-1.5));
  } },
  /* 9 — trois loopings, de plus en plus grands */
  { name: 'Les Trois Loopings', par: 5, skirt: 'skirtcandy', build(B) {
    const t = B.path({ y: 1, w: 2.4, floor: 'candy', wall: 'candyw', trim: 'goldtrim', step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 9);
    t.straight(8).mat('boost').flow(1).straight(1.6).flow(0).mat('candy').straight(4).loop(1.7).straight(12)
      .mat('boost').flow(1).straight(1.6).flow(0).mat('candy').straight(3).loop(2.0).straight(14).turn(-90, 8).straight(12)
      .mat('boost').flow(1).straight(1.6).flow(0).mat('candy').straight(3).loop(2.3).straight(16).turn(90, 8).straight(18).capEnd();
    B.cup(t.here(-1.4));
    B.deco('lollipop', t.here(0.6, 2.2, 0)); B.deco('ferris', B.L(-16, 0, 30), { yaw: B.Y(90), r: 8 });
  } },
  /* 10 — un labyrinthe d'angles droits gardé par des portes coulissantes */
  { name: 'Le Labyrinthe des Portes', par: 6, skirt: 'skirtstone', build(B) {
    const t = B.path({ y: 0.6, w: 2.4, floor: 'stone', wall: 'stonew', step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 10, 2.6);
    t.straight(14);
    const turns = [90, -90, -90, 90, 90, -90, -90, 90];
    turns.forEach((a, k) => {
      t.turn(a, 3).straight(k % 2 ? 10 : 16);
      if (k % 3 !== 2) slider(B, t, -(k % 2 ? 5 : 8), { amp: 1.05, period: 2.2 + (k % 4) * 0.35, phase: k * 0.9 });
    });
    t.straight(8).capEnd(); B.cup(t.here(-1.4));
    lamp(B, t.here(0.6, 2.2, -0.6));
  } },
  /* 11 — le marais : boue, glu et nénuphars */
  { name: 'La Traversée du Marais', par: 5, skirt: 'skirtwood', build(B) {
    const t = B.path({ y: 0.9, w: 2.6, floor: 'logf', wall: 'logw', trim: 'woodtrim', step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 11);
    t.straight(12).mat('moss').straight(6).mat('mud').straight(2.5).mat('logf').straight(8);
    const s0 = t.last.s; t.straight(6); B.zoneAlong(t, s0, t.last.s, 'slow', { above: 0.3, extra: { k: 1.8 } });
    t.straight(6).turn(70, 9, { bank: 8 }).straight(4, { bank: 0 });
    for (let k = 0; k < 3; k++) { t.slope(1.8, 0.35, { ease: 'in' }); t.w = 3.4; t.gap(2.2, -0.35); t.mat('moss').straight(3).mat('logf').straight(1, { w: 2.6 }); }
    t.straight(10).turn(-70, 9, { bank: -8 }).straight(6, { bank: 0 }).mat('mud').straight(3).mat('logf').straight(16).capEnd();
    B.cup(t.here(-1.4));
    lamp(B, t.here(0.5, 2.1, -0.9), 0xd8ff6a); B.deco('hut', B.L(-10, 0, 14));
  } },
  /* 12 — piste de bobsleigh olympique : virages relevés, tunnel et looping */
  { name: 'La Piste Olympique', par: 5, skirt: 'skirtice', build(B) {
    const t = B.path({ y: 17, w: 2.4, wall: 'icew', step: STEP }).capStart(); B.tee(t.here(0.9));
    t.straight(4).wallH(0.6).mat('ice').seg({ len: 14, turn: 120, dh: -2.4, bank: 25 }).seg({ len: 14, turn: -150, dh: -2.4, bank: -25 }).straight(1, { bank: 0 })
      .roof(true, 'icew').straight(8).roof(false).seg({ len: 14, turn: 120, dh: -2.4, bank: 25 }).straight(1, { bank: 0 }).loop(2.0)
      .seg({ len: 12, turn: -90, dh: -2, bank: -20 }).straight(4, { bank: 0 }).wallH(0.3).mat('snow').straight(3).mat('snowpack').slope(22, -4)
      .straight(12).turn(-60, 10).straight(14).capEnd();
    B.cup(t.here(-1.4));
    B.deco('chalet', t.here(-6, -6, 0)); B.deco('snowpine', t.here(-16, 4, 0));
  } },
  /* 13 — de trampoline en trampoline */
  { name: 'Les Trampolines', par: 5, skirt: 'skirtcandy', build(B) {
    const t = B.path({ y: 2, w: 2.6, floor: 'candy', wall: 'candyw', trim: 'goldtrim', step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 13);
    t.straight(10);
    for (let k = 0; k < 3; k++) {
      t.w = 3; t.wallH(0.5); t.gap(1.0, -1.4);
      t.mat('tramp').straight(3);
      t.wallH(0.3); t.w = 3.4; t.gap(1.6, 1.8);
      t.mat('candy').straight(5).straight(1, { w: 2.6 }).straight(k === 1 ? 4 : 10);
      if (k === 0) t.turn(80, 8).straight(6);
      if (k === 1) t.turn(-80, 8).straight(6);
    }
    t.straight(10).capEnd(); B.cup(t.here(-1.5));
    B.deco('tent', B.L(-9, 0, 12));
  } },
  /* 14 — deux tunnels aimantés : on joue au plafond au-dessus du vide */
  { name: 'Les Tunnels Aimantés', par: 5, skirt: 'skirtmetal', build(B) {
    const t = B.path({ y: 2, w: 2.4, floor: 'metal', wall: 'metalw', trim: 'neon', step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 14);
    t.straight(10).mat('boost').flow(1).straight(1.6).flow(0).mat('metal').straight(4);
    magnetTunnel(B, t, 14, 8);
    t.straight(10).turn(90, 6).straight(12);
    for (const [d, l] of [[-8, 0.5], [-5, -0.6]]) B.cyl(t.here(d, l, 0), 0.24, 0.35, { mat: 'bumper', seg: 14 });
    t.mat('boost').flow(1).straight(1.6).flow(0).mat('metal').straight(4);
    magnetTunnel(B, t, 16, 10);
    t.straight(10).turn(-90, 6).straight(22).capEnd();
    B.cup(t.here(-1.5));
    B.light(t.here(-16, 0, 1.4), 0xb36bff, 6, 10);
  } },
  /* 15 — une spirale qui descend vers le centre, le trou au fond d'une cuvette */
  { name: 'La Spirale', par: 7, skirt: 'skirtstone', build(B) {
    const t = B.path({ y: 5.4, w: 2.6, floor: 'stone', wall: 'stonew', step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 15);
    t.straight(10);
    const n = 9;
    for (let k = 0; k < n; k++) t.seg({ len: Math.PI / 2 * (28 - k * 1.9), turn: 90, dh: -0.5, bank: 6 });
    t.straight(1, { bank: 0 });
    bowlFinish(B, t, 3.4, { floor: 'stone', wall: 'stonew', skirt: 'skirtstone' });
  } },
  /* 16 — un flipper géant : la pente large semée de plots, puis le couloir */
  { name: 'Le Flipper Géant', par: 4, skirt: 'skirtcandy', build(B) {
    const t = B.path({ y: 4.6, w: 2.6, floor: 'candy', wall: 'candyw', trim: 'goldtrim', step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 16);
    t.straight(6).straight(3, { w: 7 }).slope(54, -3.2, { ease: 'lin' });
    const list = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 4; c++) list.push([-50 + r * 5.4 + (c % 2) * 2.4, -2.6 + c * 1.75 + (r % 2 ? 0.8 : 0)]);
    bumpers(B, t, list.filter(([, l]) => Math.abs(l) < 3.1));
    const yaw = t.dir();
    for (const s of [1, -1]) B.box(t.here(-3, s * 2.4, 0.15), [2.4, 0.3, 0.25], { yaw: yaw + s * 0.55, mat: 'jelly' });
    t.straight(3, { w: 2.6 }).straight(18).turn(90, 8).straight(14).turn(-90, 8).straight(24).capEnd();
    B.cup(t.here(-1.4));
  } },
  /* 17 — l'atelier des marteaux */
  { name: 'Les Marteaux', par: 6, skirt: 'skirtmetal', build(B) {
    const t = B.path({ y: 1.2, w: 2.6, floor: 'metal', wall: 'metalw', trim: 'neon', step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 17);
    t.straight(8).walls(false, false).straight(1, { w: 1.8 }).straight(16);
    [[3, 2.3, 0], [8, 2.9, 1.4], [13, 2.0, 2.6]].forEach(([d, per, ph]) => hammer(B, t, d - 16, { period: per, phase: ph }));
    t.straight(1, { w: 2.6 }).walls(true, true).straight(6).turn(-90, 7).straight(10)
      .walls(false, false).straight(1, { w: 1.8 }).straight(16);
    [[4, 2.6, 0.5], [10, 2.1, 1.9]].forEach(([d, per, ph]) => hammer(B, t, d - 16, { period: per, phase: ph }));
    t.straight(1, { w: 2.6 }).walls(true, true).straight(6).turn(90, 7).straight(10)
      .walls(false, false).straight(1, { w: 1.8 }).straight(18);
    [[3, 2.0, 0.2], [8, 2.5, 1.2], [13, 2.2, 2.2]].forEach(([d, per, ph]) => hammer(B, t, d - 18, { period: per, phase: ph }));
    t.straight(1, { w: 2.6 }).walls(true, true).straight(14).capEnd();
    B.cup(t.here(-1.4));
  } },
  /* 18 — le grand final : un peu de tout, et le trou au fond d'une cuvette */
  { name: 'Le Grand Final', par: 7, skirt: 'skirtstone', build(B) {
    const t = B.path({ y: 1.2, w: 2.6, step: STEP }).capStart(); B.tee(t.here(0.9)); sign(B, 18);
    t.straight(12); windmill(B, t, { speed: 1.3 }); t.straight(10)
      .mat('boost').flow(1).straight(1.6).flow(0).mat('felt').straight(4).loop(1.9).straight(12).turn(70, 10, { bank: 8 }).straight(8, { bank: 0 });
    jump(t, 6, 0, 4.4);
    t.straight(10, { w: 4.4 }).straight(2, { w: 2.6 }).mat('conveyor').flow(1).slope(14, 3.0).flow(0).mat('felt').straight(6);
    spinner(B, t, -3, { speed: 1.5 });
    t.turn(-70, 10, { bank: -8 }).straight(6, { bank: 0 }).mat('metal', 'metalw').straight(3);
    magnetTunnel(B, t, 14, 8);
    t.mat('felt', 'stonew').straight(10).mat('ice').seg({ len: 20, turn: 90, dh: -3.0, bank: 12 }).straight(2, { bank: 0 }).mat('felt').straight(14);
    for (let k = 0; k < 2; k++) { t.straight(2.4); slider(B, t, -1.2, { amp: 1.15, period: 2.4, phase: k * 2.1 }); }
    t.straight(12);
    bowlFinish(B, t, 3.6, { floor: 'felt', wall: 'stonew', skirt: 'skirtstone' });
    lamp(B, t.here(-2, 4.6, -t.last.p[1]));
  } },
];

/* Emplacement de chaque trou sur la carte : [x, z, cap en degrés] (calculé pour qu'aucun ne chevauche l'autre) */
const AT = [
  [-210, -198, 0], [-170, -190, 0], [-103, -143, 0], [-7, -193, 0], [104, -192, 0], [139, -199, 0],
  [160, -54, 0], [61, -45, 0], [36, -38, 0], [-83, -43, 0], [-176, -48, 0], [-232, -51, 0],
  [-236, 92, 0], [-180, 100, 0], [-99, 124, 0], [-5, 75, 0], [105, 92, 0], [129, 74, 0],
];
holes.forEach((h, i) => { h.at = AT[i]; });

export const marathon = {
  id: 'marathon', name: 'Le Marathon', sub: '18 trous géants, de 110 à 300 m', diff: 3, theme: 'marathon', groundY: 0, groundType: 'grass',
  groundSize: 2600, scatterMax: 1100,
  holes,
  center: [{ type: 'clubhouse', p: [-12, 0, -238], yaw: 0 }, { type: 'fountain', p: [14, 0, -236] }],
};
export const THEME_MATS3 = { marathon: { floor: 'felt', wall: 'stonew', trim: 'stonecap', skirt: 'skirtstone' } };
