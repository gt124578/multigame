/* =============================================================================
   Golf Party — les 4 parcours (6 trous chacun)
   Repère local d'un trou : on part de l'origine vers +z ; +x = gauche. Voir build.js pour la tortue.
   ============================================================================= */
import { HoleBuilder, V } from './build.js';
import { COURSES2, THEME_MATS2 } from './courses2.js';
import { marathon, THEME_MATS3 } from './courses3.js';

const D2R = Math.PI / 180;
const ring = (c, R, a0, a1, n = 24) => { const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([c[0] + Math.sin(a) * R, c[2] + Math.cos(a) * R]); } return pts; };

/* ---------------- éléments réutilisables ---------------- */
function windmill(B, t, o = {}) {
  const yaw = t.dir(), depth = 2.2;
  // deux blocs de maçonnerie laissent un passage au centre
  for (const s of [1, -1]) B.box(t.here(depth / 2, s * 0.86, 0.32), [0.78, 0.64, depth], { yaw, mat: 'whitew' });
  B.deco('windmill', t.here(depth / 2, 0, 0), { yaw, w: 3.4, d: depth });
  B.kin({ pivot: t.here(-0.24, 0, 1.5), pose: { type: 'spin', axis: [0, 0, 1], speed: o.speed ?? 1.25, yaw }, look: 'blades', mat: 'wood',
    boxes: [{ c: [0, 0.8, 0], s: [0.3, 1.4, 0.07] }, { c: [0, -0.8, 0], s: [0.3, 1.4, 0.07] }, { c: [0.8, 0, 0], s: [1.4, 0.3, 0.07] }, { c: [-0.8, 0, 0], s: [1.4, 0.3, 0.07] }] });
  t.straight(depth);
}
function lantern(B, p, color = 0xffb35a, big = false) {
  B.deco(big ? 'toro' : 'lantern', p);
  B.light([p[0], p[1] + (big ? 1.5 : 0.9), p[2]], color, big ? 9 : 5, big ? 9 : 6);
}
function torch(B, p, color = 0xff8a3a) { B.deco('torch', p); B.light([p[0], p[1] + 1.4, p[2]], color, 6, 7); }

/* =============================================================================
   1. GREEN PARK — très classique : moquette verte, briques, soleil de midi
   ============================================================================= */
const PARK_Y = 0.35;
const park = {
  id: 'park', name: 'Green Park', sub: 'Le mini-golf du dimanche', diff: 1, theme: 'park', groundY: 0, groundType: 'grass',
  holes: [
    { name: 'Le Départ', par: 2, at: [0, 0, 0], build(B) {
      const t = B.path({ y: PARK_Y }).capStart(); B.tee(t.here(0.9));
      t.straight(12).capEnd(); B.cup(t.here(-1.4));
      B.deco('sign', t.here(-13.6, 2.1, 0), { yaw: t.dir() + Math.PI, n: 1 });
    } },
    { name: 'Le Coude', par: 2, at: [26, 0, 0], build(B) {
      const t = B.path({ y: PARK_Y }).capStart(); B.tee(t.here(0.9));
      t.straight(6.5).turn(-90, 2.6).straight(5).capEnd(); B.cup(t.here(-1.3));
      B.deco('sign', B.L(2.2, PARK_Y - 0.35, 0.4), { yaw: B.Y(180), n: 2 });
    } },
    { name: 'La Butte', par: 2, at: [52, 0, 0], build(B) {
      const t = B.path({ y: PARK_Y }).capStart(); B.tee(t.here(0.9));
      t.straight(3.5).slope(2.6, 0.55).straight(1.2).slope(2.6, -0.55).straight(4.5).capEnd(); B.cup(t.here(-1.4));
      B.deco('sign', B.L(2.2, PARK_Y - 0.35, 0.4), { yaw: B.Y(180), n: 3 });
    } },
    { name: 'Les Plots', par: 2, at: [52, 62, 180], build(B) {
      const t = B.path({ y: PARK_Y, w: 3.0 }).capStart(); B.tee(t.here(0.9));
      t.straight(15).capEnd(); B.cup(t.here(-1.5, 0.5));
      for (const [s, l] of [[4.2, 0.55], [6.4, -0.75], [8.4, 0.35], [10.4, -0.25], [7.4, 1.05], [11.6, 0.95]]) B.cyl(t.at(s, l), 0.22, 0.32, { mat: 'bumper', seg: 16 });
      B.deco('sign', B.L(2.6, PARK_Y - 0.35, 0.4), { yaw: B.Y(180), n: 4 });
    } },
    { name: 'Le Moulin', par: 3, at: [26, 62, 180], build(B) {
      const t = B.path({ y: PARK_Y }).capStart(); B.tee(t.here(0.9));
      t.straight(6.5); windmill(B, t); t.straight(4.5).capEnd(); B.cup(t.here(-1.4));
      B.deco('sign', B.L(2.2, PARK_Y - 0.35, 0.4), { yaw: B.Y(180), n: 5 });
    } },
    { name: 'Le Grand S', par: 3, at: [0, 62, 180], build(B) {
      const t = B.path({ y: PARK_Y }).capStart(); B.tee(t.here(0.9));
      t.straight(3).turn(65, 3.2, { bank: 7 }).straight(1.0, { bank: 0 }).turn(-65, 3.2, { bank: -7 }).straight(1.5, { bank: 0 })
        .slope(3.5, 0.6).straight(3.4, { w: 3.0 }).capEnd();
      B.cup(t.here(-1.4));
      B.deco('sign', B.L(2.2, PARK_Y - 0.35, 0.4), { yaw: B.Y(180), n: 6 });
    } },
  ],
  center: [{ type: 'fountain', p: [26, 0, 31] }, { type: 'clubhouse', p: [-14, 0, 31], yaw: Math.PI / 2 }],
};

/* =============================================================================
   2. ÎLE AUX PIRATES — pontons, sable, eau, coucher de soleil
   ============================================================================= */
const PY = 1.0;
const pirate = {
  id: 'pirate', name: 'Île aux Pirates', sub: 'Pontons, sable chaud et kraken', diff: 2, theme: 'pirate', groundY: 0, groundType: 'water',
  holes: [
    { name: 'Le Ponton', par: 2, at: [0, 0, 0], build(B) {
      const t = B.path({ y: PY, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(4).turn(25, 5).straight(1.5).walls(true, false).straight(5).walls(true, true).turn(-25, 5).straight(2.2).capEnd();
      B.cup(t.here(-1.4));
      B.deco('island', B.L(0, 0, -1), { r: 4 }); B.deco('island', t.here(-1, 0, 0), { r: 4.5, palms: 3 });
      torch(B, B.L(1.6, PY, 0.4)); torch(B, t.here(0.3, -1.6, 0));
    } },
    { name: 'Le Saut du Requin', par: 3, at: [30, 0, 0], build(B) {
      const t = B.path({ y: PY, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(6).slope(2.4, 0.5, { ease: 'in' });
      const g0 = t.here();
      t.w = 3.6; t.gap(3.0, -0.5);
      t.straight(7.5).capEnd(); B.cup(t.here(-1.7));
      B.deco('shark', V.add(g0, [0, -PY, 0]), { yaw: t.dir() });
      B.deco('island', t.here(-3.5, 0, 0), { r: 6, palms: 4 });
      B.deco('island', B.L(0, 0, 0), { r: 3.5, palms: 1 });
      torch(B, t.here(0.3, 1.9, 0)); torch(B, t.here(0.3, -1.9, 0));
    } },
    { name: 'La Boucle du Kraken', par: 3, at: [60, 0, 0], build(B) {
      const t = B.path({ y: PY, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(7);
      B.deco('kraken', t.here(0.6, -1.4, -PY), { yaw: t.dir() });
      t.loop(1.7).straight(3).turn(90, 2.6).straight(4).capEnd(); B.cup(t.here(-1.4));
      B.deco('island', t.here(-1.2, 0, 0), { r: 4.5, palms: 2 });
      torch(B, t.here(0.3, 1.6, 0));
    } },
    { name: 'La Plage aux Tonneaux', par: 3, at: [60, 72, 180], build(B) {
      const t = B.path({ y: PY, w: 3.2, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(3).mat('beach').straight(5);
      const s1 = t.last.s;
      t.turn(-50, 4).straight(2.5).mat('sand').straight(2.0).mat('beach').straight(3.5).capEnd();
      B.cup(t.here(-1.5, -0.4));
      for (const [s, l] of [[s1 - 3.6, 0.7], [s1 - 1.6, -0.9], [s1 + 1.2, 0.4], [s1 + 3.5, -0.5], [s1 + 9.6, 0.9]]) B.cyl(t.at(s, l), 0.3, 0.55, { mat: 'hull', seg: 14 });
      B.deco('island', t.at(s1, 0, -PY), { r: 7, palms: 5 });
      B.deco('chest', t.here(0.4, 2.1, 0), { yaw: t.dir() });
      torch(B, t.at(s1 + 2, 2.2)); torch(B, t.here(0.3, -2.0, 0));
    } },
    { name: 'Le Navire', par: 3, at: [30, 72, 180], build(B) {
      const t = B.path({ y: PY, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(5).slope(3, 0.9, { w: 1.8 }).straight(1.0, { w: 2.6 });
      const d0 = t.here(); const yaw = t.dir();
      t.straight(4.6);
      const mid = t.here(-2.3);
      B.kin({ pivot: V.add(mid, [0, 2.45, 0]), pose: { type: 'swing', axis: [0, 0, 1], amp: 0.95, period: 2.7, yaw }, look: 'anchor', mat: 'metalw',
        boxes: [{ c: [0, -2.2, 0], s: [0.85, 0.42, 0.28] }, { c: [0, -1.15, 0], s: [0.1, 1.8, 0.1] }] });
      B.deco('ship', V.add(mid, [0, -0.05, 0]), { yaw, len: 9.5 });
      t.slope(3, -0.9, { w: 2.2 }).straight(4.5).capEnd(); B.cup(t.here(-1.4));
      B.deco('island', t.here(-1.2, 0, 0), { r: 4, palms: 2 });
      void d0;
    } },
    { name: 'La Cascade', par: 4, at: [0, 72, 180], skirt: 'skirtrock', build(B) {
      const t = B.path({ y: 4.6 }).capStart(); B.tee(t.here(0.9));
      t.straight(3).walls(false, true).seg({ len: 7, turn: 100, dh: -1.6, bank: 9 }).walls(true, true).straight(1.5, { bank: 0 })
        .walls(true, false).seg({ len: 7, turn: -120, dh: -1.4, bank: -9 }).walls(true, true).straight(1.5, { bank: 0 })
        .slope(4, -0.6).straight(3.2, { w: 3.0 }).capEnd();
      B.cup(t.here(-1.4));
      B.deco('cliff', B.L(0, 0, 1.5), { r: 5, h: 4.6 });
      B.deco('waterfall', B.L(3.0, 0, 3.0), { h: 4.4, yaw: B.Y(90) });
      B.deco('island', t.here(-1, 0, -PY + 0.0), { r: 5, palms: 3 });
      torch(B, B.L(-1.6, 4.6, 0.4));
    } },
  ],
  center: [{ type: 'wreck', p: [30, 0, 36] }, { type: 'island', p: [-16, 0, 36], r: 7, palms: 6 }, { type: 'island', p: [76, 0, 36], r: 6, palms: 4 }],
};

/* =============================================================================
   3. JARDIN ZEN — mousse, pierre, lanternes au crépuscule
   ============================================================================= */
const ZY = 0.4;
const zen = {
  id: 'zen', name: 'Jardin Zen', sub: 'Lanternes, cerisiers et sable ratissé', diff: 2, theme: 'zen', groundY: 0, groundType: 'grass',
  holes: [
    { name: 'Le Pont Rouge', par: 2, at: [0, 0, 0], build(B) {
      const t = B.path({ y: ZY }).capStart(); B.tee(t.here(0.9));
      t.straight(4); const a = t.here();
      t.base_('slab').mat('redwood', 'redw').slope(3, 0.75).slope(3, -0.75); const b = t.here();
      t.base_('ground').mat('moss', 'stonew').straight(3.5).capEnd(); B.cup(t.here(-1.4));
      const m = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
      B.water([m[0], 0.0, m[2]], [4.5, 0.16, 2.6], t.dir());
      B.deco('pond', m, { w: 9, d: 5.2, yaw: t.dir() });
      lantern(B, t.here(0.2, 1.7, 0)); lantern(B, B.L(-1.7, ZY, 0.5));
    } },
    { name: 'Le Jardin Ratissé', par: 3, at: [28, 0, 0], build(B) {
      const t = B.path({ y: ZY, w: 3.4 }).capStart(); B.tee(t.here(0.9));
      t.straight(3).mat('zen').straight(3);
      const r1 = t.here(-1.5, 0.6);
      t.mat('moss').straight(1.5).turn(60, 4).mat('zen').straight(3.0);
      const r2 = t.here(-1.4, -0.7);
      t.mat('moss').straight(1.5).turn(-60, 4).straight(2.4).capEnd(); B.cup(t.here(-1.4));
      B.box(V.add(r1, [0, 0.2, 0]), [0.7, 0.4, 0.6], { yaw: 0.6, mat: 'rock' });
      B.box(V.add(r2, [0, 0.22, 0]), [0.8, 0.44, 0.7], { yaw: 1.3, mat: 'rock' });
      lantern(B, t.here(0.3, 2.3, 0)); lantern(B, B.L(-2.2, ZY, 0.5));
    } },
    { name: 'Les Lanternes', par: 3, at: [56, 0, 0], build(B) {
      const t = B.path({ y: ZY }).capStart(); B.tee(t.here(0.9));
      t.straight(3).walls(false, true).seg({ len: 5.5, turn: 80, bank: 9 }).walls(true, true).straight(1, { bank: 0 });
      lantern(B, t.here(-2.5, 3.2, -ZY), 0xffb35a, true);
      t.walls(true, false).seg({ len: 8, turn: -150, bank: -10 }).walls(true, true).straight(1, { bank: 0 });
      lantern(B, t.here(-3.0, -3.0, -ZY), 0xffb35a, true);
      t.walls(false, true).seg({ len: 5, turn: 70, bank: 8 }).walls(true, true).straight(2, { bank: 0 }).straight(2).capEnd();
      B.cup(t.here(-1.4));
      lantern(B, t.here(0.3, -1.7, 0));
    } },
    { name: "L'Entonnoir", par: 2, at: [56, 64, 180], build(B) {
      const Y = 1.3, R = 3.3;
      const t = B.path({ y: Y }).capStart(); B.tee(t.here(0.9));
      t.straight(7.5);
      const c = t.here(R - 0.2, 0, 0);
      t.straight(0.2);
      B.cup(B.bowl(c, R, 0.75, { floor: 'stone' }));
      const back = t.dir() + Math.PI, gapA = Math.asin(1.32 / R);
      B.wallLine(ring(c, R, back + gapA, back + 2 * Math.PI - gapA, 30), Y, { center: c, mat: 'stonew' });
      B.cyl([c[0], 0, c[2]], R + 0.2, Y, { mat: 'skirtstone', phys: false, noTop: true, seg: 40 });
      lantern(B, V.add(c, [R + 0.8, 0, 0]), 0xffb35a, true); lantern(B, V.add(c, [-R - 0.8, 0, 0]), 0xffb35a, true);
      B.deco('sakura', V.add(c, [0, 0, R + 2.2]));
    } },
    { name: 'La Forêt de Bambous', par: 3, at: [28, 64, 180], build(B) {
      const t = B.path({ y: ZY }).capStart(); B.tee(t.here(0.9));
      t.straight(15).capEnd(); B.cup(t.here(-1.4));
      const yaw = t.dir();
      for (const [s, sp] of [[4.5, 1.5], [8, -2.0], [11.5, 2.5]]) {
        const p = t.at(s, 0, 0.13);
        B.kin({ pivot: p, pose: { type: 'spin', axis: [0, 1, 0], speed: sp, phase: s, yaw }, look: 'bamboo', mat: 'bamboo', boxes: [{ c: [0, 0, 0], s: [2.08, 0.14, 0.14] }] });
        B.cyl(t.at(s, 0, 0), 0.07, 0.62, { mat: 'bamboo', seg: 10 });
      }
      B.deco('bamboo', t.at(7.5, 3.0), { n: 18, r: 1.6 }); B.deco('bamboo', t.at(7.5, -3.0), { n: 18, r: 1.6 });
      lantern(B, t.here(0.3, 1.7, 0));
    } },
    { name: 'Le Dragon', par: 4, at: [0, 64, 180], build(B) {
      const t = B.path({ y: ZY }).capStart(); B.tee(t.here(0.9));
      t.straight(3).slope(4, 1.1).straight(1).seg({ len: 10, turn: 180, bank: 11 }).straight(1, { bank: 0 });
      const d0 = t.here();
      t.roof(true).straight(5).roof(false);
      B.deco('dragon', d0, { yaw: t.dir(), len: 5 });
      t.seg({ len: 6, turn: -90, dh: -1.1, bank: -8 }).straight(1.5, { bank: 0 }).straight(3, { w: 2.8 }).capEnd();
      B.cup(t.here(-1.4));
      lantern(B, B.L(-1.7, ZY, 0.5)); lantern(B, t.here(0.3, 1.9, 0));
    } },
  ],
  center: [{ type: 'pagoda', p: [28, 0, 32] }, { type: 'pond', p: [6, 0, 32], w: 10, d: 7 }, { type: 'torii', p: [50, 0, 32], yaw: Math.PI / 2 }],
};

/* =============================================================================
   4. FORGE INFERNALE — difficile : lave, pistons, tapis, loopings, marteaux
   ============================================================================= */
const FY = 1.4;
const forge = {
  id: 'forge', name: 'Forge Infernale', sub: 'Lave, pistons et loopings', diff: 3, theme: 'forge', groundY: 0, groundType: 'lava',
  holes: [
    { name: 'Les Pistons', par: 3, at: [0, 0, 0], build(B) {
      const t = B.path({ y: FY, w: 2.4, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(3);
      const yaw = t.dir(), gaps = [];
      for (let k = 0; k < 3; k++) { t.straight(2.0).walls(true, false); gaps.push(t.here(0.8)); t.straight(1.6).walls(true, true); }
      t.straight(1.6).walls(false, false).straight(1.0, { w: 1.5 }).straight(3).straight(1.0, { w: 2.6 }).walls(true, true).straight(3).capEnd();
      B.cup(t.here(-1.4));
      gaps.forEach((g, k) => {
        const piv = V.add(g, [0, 0, 0]);
        const R = (lat) => { const L = [Math.cos(yaw), 0, -Math.sin(yaw)]; return V.add(piv, V.mul(L, lat)); };
        B.kin({ pivot: R(-1.85), pose: { type: 'piston', dir: [1, 0, 0], amp: 2.15, period: 2.4, phase: k * 0.33, yaw }, look: 'piston', mat: 'hazard',
          boxes: [{ c: [0, 0.18, 0], s: [1.0, 0.36, 1.3] }] });
        B.box(V.add(R(-2.85), [0, 0.3, 0]), [1.0, 0.9, 1.9], { yaw, mat: 'metalw' });
      });
      torch(B, t.here(0.3, 1.8, 0), 0xff5a2a);
    } },
    { name: 'Tapis Roulants', par: 4, at: [30, 0, 0], build(B) {
      const t = B.path({ y: FY, base: 'slab', floor: 'metal' }).capStart(); B.tee(t.here(0.9));
      t.straight(3).mat('conveyor').flow(-1).straight(7).flow(0).mat('metal').straight(2).turn(90, 2.6).straight(1.5)
        .mat('boost').flow(1).straight(1.6).flow(0).mat('metal').straight(1.5).slope(2.2, 0.55, { ease: 'in' });
      t.w = 3.4; t.gap(3.6, -0.55);
      t.straight(7).capEnd(); B.cup(t.here(-1.6));
      torch(B, t.here(0.3, 2.0, 0), 0xff5a2a);
    } },
    { name: 'Le Broyeur', par: 4, at: [60, 0, 0], build(B) {
      const t = B.path({ y: FY, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(6);
      const R = 4.8, ap = R * Math.cos(Math.PI / 12), yaw = t.dir();
      const c = t.here(ap);
      const pts = [], walls = [];
      for (let i = 0; i < 12; i++) { const a = yaw + Math.PI / 12 + i * Math.PI / 6; pts.push([c[0] + Math.sin(a) * R, c[2] + Math.cos(a) * R]); }
      // arête i : de pts[i] à pts[i+1] ; on ouvre l'entrée (arrière) et la sortie (avant)
      for (let i = 0; i < 12; i++) { const a = yaw + Math.PI / 12 + (i + 0.5) * Math.PI / 6; const d = Math.abs(Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw))); walls.push(d > 0.3 && Math.abs(d - Math.PI) > 0.3); }
      B.pad(pts, FY, { floor: 'grate', walls, base: 'slab' });
      B.kin({ pivot: V.add(c, [0, 0, 0]), pose: { type: 'spin', axis: [0, 1, 0], speed: 1.05, yaw }, look: 'cross', mat: 'hazard',
        boxes: [{ c: [0, 0.15, 0], s: [8.6, 0.26, 0.26] }, { c: [0, 0.15, 0], s: [0.26, 0.26, 8.6] }] });
      B.cyl(c, 0.38, 0.75, { mat: 'metalw', seg: 16 });
      const t2 = B.path({ wp: V.add(c, V.mul([Math.sin(yaw), 0, Math.cos(yaw)], ap)), wyaw: yaw, base: 'slab' });
      t2.straight(5.5).capEnd(); B.cup(t2.here(-1.4));
      torch(B, V.add(c, [R + 0.6, 0, 0]), 0xff5a2a); torch(B, V.add(c, [-R - 0.6, 0, 0]), 0xff5a2a);
    } },
    { name: 'Double Looping', par: 4, at: [60, 74, 180], build(B) {
      const t = B.path({ y: FY, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(4).mat('boost').flow(1).straight(1.6).flow(0).mat('metal').straight(3).loop(1.6).straight(2.5).loop(1.6).straight(3)
        .slope(2, 0.4, { ease: 'in' });
      t.w = 3.2; t.gap(3.0, -0.4);
      t.straight(6.5).capEnd(); B.cup(t.here(-1.5));
      torch(B, t.here(0.3, 1.9, 0), 0xff5a2a);
    } },
    { name: 'Les Marteaux', par: 4, at: [30, 74, 180], build(B) {
      const t = B.path({ y: FY, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(3).walls(false, false).straight(1.0, { w: 1.6 });
      const s0 = t.last.s;
      t.straight(13).straight(1.0, { w: 2.6 }).walls(true, true).straight(1).turn(-90, 2.5).straight(3).capEnd();
      B.cup(t.here(-1.4));
      const yaw = t.frameAt(s0).f; const yw = Math.atan2(yaw[0], yaw[2]);
      [[3, 2.3, 0], [7, 2.9, 1.4], [11, 2.0, 2.6]].forEach(([ds, per, ph]) => {
        const p = t.at(s0 + ds, 0, 0);
        B.kin({ pivot: V.add(p, [0, 2.7, 0]), pose: { type: 'swing', axis: [0, 0, 1], amp: 1.0, period: per, phase: ph, yaw: yw }, look: 'hammer', mat: 'hazard',
          boxes: [{ c: [0, -2.43, 0], s: [0.9, 0.5, 0.55] }, { c: [0, -1.2, 0], s: [0.12, 2.0, 0.12] }] });
        B.deco('gantry', V.add(p, [0, 0, 0]), { yaw: yw, h: 2.9 });
      });
      torch(B, B.L(1.8, FY, 0.4), 0xff5a2a);
    } },
    { name: 'Le Cœur du Volcan', par: 5, at: [0, 74, 180], build(B) {
      const t = B.path({ y: 5.0, base: 'slab' }).capStart(); B.tee(t.here(0.9));
      t.straight(3).seg({ len: 5, turn: 90, dh: -1.0, bank: 10, ease: 'in' }).walls(false, true).seg({ len: 6, turn: 110, dh: -1.4, bank: 10, ease: 'out' }).walls(true, true).straight(1.5, { bank: 0 });
      const sw = t.here(2.0, 0, 0.13), yaw = t.dir();
      t.straight(4);
      B.kin({ pivot: sw, pose: { type: 'spin', axis: [0, 1, 0], speed: 1.8, yaw }, look: 'bar', mat: 'hazard', boxes: [{ c: [0, 0, 0], s: [2.08, 0.16, 0.16] }] });
      B.cyl(V.add(sw, [0, -0.13, 0]), 0.09, 0.6, { mat: 'metalw', seg: 10 });
      t.mat('boost').flow(1).straight(1.6).flow(0).mat('metal').straight(2).loop(1.5).straight(4).slope(2.2, 0.45, { ease: 'in' });
      t.w = 4.6; t.gap(2.6, -0.9);
      t.straight(6).capEnd(); B.cup(t.here(-1.7));
      B.deco('volcano', B.L(-14, 0, 8), { r: 9, h: 9 });
      torch(B, B.L(-1.8, 5.0, 0.4), 0xff5a2a); torch(B, t.here(0.3, 2.0, 0), 0xff5a2a);
    } },
  ],
  center: [{ type: 'forgefire', p: [30, 0, 37] }],
};

export const COURSES = [park, pirate, zen, forge, ...COURSES2, marathon];
export const courseById = (id) => COURSES.find((c) => c.id === id) || COURSES[0];

/** Construit un trou (géométrie + monde physique). Résultat mis en cache. */
const cache = new Map();
export function buildHole(course, i, theme) {
  const key = course.id + ':' + i;
  if (cache.has(key)) return cache.get(key);
  const h = course.holes[i];
  const th = { ...theme, ...(h.skirt ? { skirt: h.skirt } : {}) };
  const B = new HoleBuilder({ theme: th, at: h.at, groundY: course.groundY, groundType: course.groundType, base: course.base });
  h.build(B);
  const res = B.result({ name: h.name, par: h.par, index: i, course: course.id });
  cache.set(key, res);
  return res;
}

/** Matériaux par défaut des parcours (le rendu les habille) */
export const THEME_MATS = {
  park: { floor: 'felt', wall: 'brick', trim: 'stonecap', skirt: 'skirtbrick' },
  pirate: { floor: 'plank', wall: 'wood', trim: 'woodtrim', skirt: 'skirtwood' },
  zen: { floor: 'moss', wall: 'stonew', trim: 'stonecap', skirt: 'skirtstone' },
  forge: { floor: 'metal', wall: 'metalw', trim: 'neon', skirt: 'skirtmetal' },
  ...THEME_MATS2,
  ...THEME_MATS3,
};
export const buildCourseHole = (course, i) => buildHole(course, i, THEME_MATS[course.theme]);
