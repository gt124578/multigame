/* Tests de Mini-Golf Party : construction des 72 trous et vérification qu'un bot expert peut les finir.
   node tools/test-minigolf.mjs [parcours] [trou]   (ex. node tools/test-minigolf.mjs forge 3) */
import { COURSES, buildCourseHole } from '../minigolf/js/courses.js';
import { makeBall, strike, simulate, resetOOB, BALL_R } from '../minigolf/js/physics.js';
import { planShotSync } from '../minigolf/js/ai.js';

let seed = 12345; const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const onlyC = process.argv[2], onlyH = process.argv[3] != null ? Number(process.argv[3]) - 1 : null;
let fails = 0, total = 0;
const ok = (c, msg) => { total++; if (!c) { fails++; console.log('  ✗ ' + msg); } };
for (const course of COURSES) {
  if (onlyC && course.id !== onlyC) continue;
  console.log(`\n${course.name}`);
  const boxes = [];
  for (let i = 0; i < course.holes.length; i++) {
    if (onlyH != null && i !== onlyH) continue;
    const t0 = Date.now();
    const h = buildCourseHole(course, i);
    ok(h.tee && h.cup, `${h.name}: départ et trou définis`);
    // la balle posée au départ ne bouge pas
    const b0 = makeBall(0, h.tee); b0.awake = true; simulate(h.world, [b0], 0, { maxT: 3 });
    ok(Math.hypot(b0.p[0] - h.tee[0], b0.p[2] - h.tee[2]) < 0.05 && !b0.oob, `${h.name}: la balle reste au départ (${b0.p.map((v) => v.toFixed(2))}, oob=${b0.oob})`);
    // un bot expert finit le trou
    const ball = makeBall(0, h.tee); let strokes = 0, T = 10, log = [];
    while (!ball.holed && strokes < h.par + 5) {
      const s = planShotSync(h, [ball], 0, T, 'expert', rng);
      strike(h.world, ball, s.yaw, s.power); strokes++;
      simulate(h.world, [ball], T, { maxT: 30 });
      log.push(`${s.power.toFixed(2)}${ball.oob ? '!' + ball.oob : ''}${ball.holed ? '⛳' : ''}`);
      if (ball.oob) { resetOOB(ball); strokes++; }
      T += 17.3;
    }
    ok(ball.holed, `${h.name}: bot expert n'a pas fini (${strokes} coups : ${log.join(' ')})`);
    console.log(`  ${ball.holed ? '✓' : '✗'} ${String(i + 1).padStart(2)}. ${h.name.padEnd(24)} par ${h.par}  bot ${strokes}  [${log.join(' ')}]  ${h.tris} tri  ${Date.now() - t0} ms`);
    boxes.push({ i, name: h.name, min: h.bounds.min, max: h.bounds.max });
    // le trou reste sur le sol du parcours (900 m de côté, ou groundSize)
    const G2 = (course.groundSize || 900) / 2 - 20;
    ok(Math.max(-h.bounds.min[0], h.bounds.max[0], -h.bounds.min[2], h.bounds.max[2]) < G2, `${h.name}: sort du sol du parcours`);
  }
  // les trous ne se chevauchent pas
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const A = boxes[a], B = boxes[b];
    const over = A.min[0] < B.max[0] && A.max[0] > B.min[0] && A.min[2] < B.max[2] && A.max[2] > B.min[2];
    ok(!over, `${A.name} et ${B.name} se chevauchent`);
  }
}
console.log(`\n${total - fails}/${total} vérifications OK`);
process.exit(fails ? 1 : 0);
