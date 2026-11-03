// Interface de vol de Dogfight 3D, dessinée en pixels CSS : télémétrie fine, étiquettes, réticules, radar rond,
// scores, alertes, fil des éliminations. Le réticule du canon montre où vont vraiment les balles.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { computeLead, BULLET_SPEED, BULLET_GRAVITY } from '../engine/weapons.js';
import { ZONE_WARN, CENTER, TYPES } from '../engine/flight.js';
import { ZONE_CEIL, isTeamMode } from '../engine/modes.js';

const GREEN = '#3dff5c', RED = '#ff5a4d', BLUE = '#6f9dff', GOLD = '#ffc53d', WHITE = 'rgba(255,255,255,.92)';
const SIDE = ['rgba(235,238,242,.9)', '#4f8dff', '#ff5a4d'];
const CAUSE = { mer: 'a fini à la mer', sol: 's\'est écrasé', collision: 'collision', force: 'forcé au crash' };
const v = new THREE.Vector3();

const project = (x, y, z, camera, W, H) => { v.set(x, y, z).project(camera); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, front: v.z < 1 }; };

export class CockpitHUD {
  constructor(canvas, radarSource) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.feed = []; this.hitT = 0; this.hurtT = 0; this.toastText = ''; this.toastT = 0; this.bigText = ''; this.bigT = 0; this.veil = 0; this.awardText = ''; this.awardT = 0;
    this.mini = document.createElement('canvas'); this.mini.width = this.mini.height = 320;
    this.mini.getContext('2d').drawImage(radarSource, 0, 0, 320, 320);
    this.W = 0; this.H = 0;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * dpr); this.canvas.height = Math.floor(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  hitMarker() { this.hitT = 0.16; }
  hurt() { this.hurtT = 0.45; }
  toast(t, d = 2.4) { this.toastText = t; this.toastT = d; }
  big(t, d = 1.6) { this.bigText = t; this.bigT = d; }
  // Une récompense s'affiche sous la grande annonce ; plusieurs au même instant s'enchaînent sur la ligne
  award(t, d = 2.6) { this.awardText = this.awardT > 0.5 && this.awardText !== t ? `${this.awardText}  ·  ${t}` : t; this.awardT = d; }
  addFeed(text, mine) { this.feed.unshift({ text, t: 5, mine }); if (this.feed.length > 5) this.feed.pop(); }
  clear() { this.ctx.clearRect(0, 0, this.W, this.H); }

  text(t, x, y, color = WHITE, font = '600 12px ui-monospace,Menlo,Consolas,monospace', align = 'left') {
    const c = this.ctx; c.font = font; c.textAlign = align; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(t, x, y); c.fillStyle = color; c.fillText(t, x, y);
  }

  render(view, me, camera, aim, dt, opts = {}) {
    const c = this.ctx, W = this.W, H = this.H;
    c.clearRect(0, 0, W, H);
    c.lineJoin = 'round';
    this.hitT = Math.max(0, this.hitT - dt); this.hurtT = Math.max(0, this.hurtT - dt); this.toastT = Math.max(0, this.toastT - dt); this.bigT = Math.max(0, this.bigT - dt); this.awardT = Math.max(0, this.awardT - dt);
    for (let i = this.feed.length - 1; i >= 0; i--) { this.feed[i].t -= dt; if (this.feed[i].t <= 0) this.feed.splice(i, 1); }

    // voile dans les nuages
    this.veil += ((opts.inCloud ? 0.72 : 0) - this.veil) * Math.min(1, dt * 5);
    if (this.veil > 0.01) { c.fillStyle = `rgba(226,232,240,${this.veil})`; c.fillRect(0, 0, W, H); }

    if (this.hurtT > 0) {
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(220,30,20,0)'); g.addColorStop(1, `rgba(220,30,20,${this.hurtT})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }

    this.drawScores(view, me);
    if (me) {
      this.drawTags(view, me, camera, opts);
      if (view.zones) this.drawZoneMarks(view, me, camera);
      if (me.alive) {
        this.drawReticles(view, me, camera, aim);
        this.drawOffscreen(view, me, camera);
        this.drawTelemetry(me);
        this.drawGauges(me);
        if (view.ph !== 'over') this.drawAlerts(view, me, opts);
        if (view.zones) this.drawZoneHint(view, me, opts);
      }
      if (!me.out) this.drawRadar(view, me, camera);
    }
    this.drawFeed();
    this.drawCenterMessages(view, me);
    if (opts.scoreboard) this.drawScoreboard(view);
  }

  isEnemy(me, p) { return p.id !== me.id && !(me.team && me.team === p.team); }

  // Étiquettes : nom, type, distance
  drawTags(view, me, camera) {
    const W = this.W, H = this.H, list = [];
    for (const p of view.planes) {
      if (p.id === me.id || !p.alive) continue;
      const d = Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z), s = project(p.x, p.y, p.z, camera, W, H);
      if (!s.front || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) continue;
      list.push({ p, d, s });
    }
    list.sort((a, b) => a.d - b.d);
    const boxes = [];
    for (const { p, d, s } of list) {
      const big = p.type === 'cargo', col = big ? GOLD : this.isEnemy(me, p) ? RED : BLUE, full = d < 2200;
      let top = s.y - (full ? 30 : 18);
      // on écarte les étiquettes qui se chevauchent
      for (let k = 0; k < 4; k++) { const hit = boxes.find((b) => Math.abs(b.x - s.x) < 78 && Math.abs(b.y - top) < 38); if (hit) top = hit.y - 38; else break; }
      boxes.push({ x: s.x, y: top });
      this.text(p.name, s.x, top, col, '700 12px system-ui,sans-serif', 'center');
      if (big) this.text(`${Math.round(p.health / p.maxHp * 100)} %`, s.x, top + 13, col, '600 11px system-ui,sans-serif', 'center');
      else if (full) this.text((TYPES[p.type] || TYPES.f16).name, s.x, top + 13, col, '600 11px system-ui,sans-serif', 'center');
      this.text((d / 1000).toFixed(2) + ' km', s.x, s.y + 19, col, '600 11px system-ui,sans-serif', 'center');
      this.ctx.strokeStyle = col; this.ctx.lineWidth = 1.2; this.ctx.beginPath(); this.ctx.moveTo(s.x - 5, s.y + 6); this.ctx.lineTo(s.x, s.y + 2); this.ctx.lineTo(s.x + 5, s.y + 6); this.ctx.stroke();
    }
  }

  // La cible, son point d'anticipation, l'accrochage, et le réticule du canon
  drawReticles(view, me, camera, aim) {
    const c = this.ctx, W = this.W, H = this.H;
    let target = null, best = -1;
    for (const p of view.planes) {
      if (!p.alive || !this.isEnemy(me, p)) continue;
      const dx = p.x - me.x, dy = p.y - me.y, dz = p.z - me.z, d = Math.hypot(dx, dy, dz);
      if (d > 1600) continue;
      const dot = (dx * me.fx + dy * me.fy + dz * me.fz) / d, score = dot - d / 6000;
      if (dot > 0.6 && score > best) { best = score; target = p; }
    }
    let range = 900;
    if (target) {
      const dist = Math.hypot(target.x - me.x, target.y - me.y, target.z - me.z);
      range = Math.max(120, Math.min(1000, dist));
      const s = project(target.x, target.y, target.z, camera, W, H);
      c.strokeStyle = GREEN; c.lineWidth = 1.8;
      if (s.front) c.strokeRect(s.x - 14, s.y - 14, 28, 28);
      const l = computeLead(me.x, me.y, me.z, me.fx * me.speed, me.fy * me.speed, me.fz * me.speed, target.x, target.y, target.z, target.fx * target.speed, target.fy * target.speed, target.fz * target.speed);
      const ls = project(l.x, l.y, l.z, camera, W, H);
      if (ls.front && dist < 1300) {
        c.lineWidth = 1.6; c.beginPath(); c.arc(ls.x, ls.y, 11, 0, 6.283); c.stroke();
        c.fillStyle = GREEN; c.beginPath(); c.arc(ls.x, ls.y, 1.8, 0, 6.283); c.fill();
      }
      // accrochage du missile : un arc qui se referme autour de la cible
      if (me.lockId === target.id && me.lockT > 0 && s.front && me.ms > 0) {
        const lockd = me.lockT >= 1;
        c.strokeStyle = lockd ? RED : '#ffd24d'; c.lineWidth = 2.2; c.beginPath(); c.arc(s.x, s.y, 22, -Math.PI / 2, -Math.PI / 2 + me.lockT * 6.283); c.stroke();
        if (lockd) this.text('ACCROCHÉ', s.x, s.y + 36, RED, '700 11px system-ui,sans-serif', 'center');
      }
    }
    // réticule du canon : le point où passent les balles à la distance de la cible
    const t = range / BULLET_SPEED, gx = me.x + me.fx * range + me.fx * me.speed * t, gy = me.y + me.fy * range + me.fy * me.speed * t - 0.5 * BULLET_GRAVITY * t * t, gz = me.z + me.fz * range + me.fz * me.speed * t;
    const g = project(gx, gy, gz, camera, W, H);
    if (g.front) {
      c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 1.6; c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 3;
      c.beginPath(); c.arc(g.x, g.y, 9, 0, 6.283); c.moveTo(g.x - 18, g.y); c.lineTo(g.x - 9, g.y); c.moveTo(g.x + 9, g.y); c.lineTo(g.x + 18, g.y); c.moveTo(g.x, g.y + 9); c.lineTo(g.x, g.y + 15); c.stroke();
      c.shadowBlur = 0;
      if (this.hitT > 0) { c.strokeStyle = '#ffffff'; c.lineWidth = 2.4; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.moveTo(g.x + a * 13, g.y + b * 13); c.lineTo(g.x + a * 21, g.y + b * 21); c.stroke(); } }
    }
    // le point visé à la souris, quand il s'écarte du nez
    if (aim && aim.x * me.fx + aim.y * me.fy + aim.z * me.fz < 0.9995) {
      const a = project(me.x + aim.x * 900, me.y + aim.y * 900, me.z + aim.z * 900, camera, W, H);
      if (a.front) { c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.4; c.beginPath(); c.arc(a.x, a.y, 5, 0, 6.283); c.stroke(); }
    }
  }

  // Flèches au bord de l'écran vers les ennemis hors champ
  drawOffscreen(view, me, camera) {
    const c = this.ctx, W = this.W, H = this.H, cx = W / 2, cy = H / 2;
    const list = [];
    for (const p of view.planes) {
      if (!p.alive || (p.type !== 'cargo' && !this.isEnemy(me, p))) continue;
      const s = project(p.x, p.y, p.z, camera, W, H);
      if (s.front && s.x > 0 && s.x < W && s.y > 0 && s.y < H) continue;
      list.push({ p, s, d: p.type === 'cargo' ? 0 : Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z) });
    }
    list.sort((a, b) => a.d - b.d);   // le transport d'abord : c'est l'objectif de tout le monde
    for (const { s, p } of list.slice(0, 3)) {
      const col = p.type === 'cargo' ? GOLD : RED, d = Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z);
      let dx = s.x - cx, dy = s.y - cy;
      if (!s.front) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy, dx), R = Math.min(W, H) * 0.38, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(11, 0); c.lineTo(-6, 7); c.lineTo(-3, 0); c.lineTo(-6, -7); c.closePath(); c.stroke(); c.fill(); c.restore();
      this.text((d / 1000).toFixed(1) + ' km', x, y + 22, col, '600 10px system-ui,sans-serif', 'center');
    }
  }

  drawTelemetry(me) {
    const T = TYPES[me.type] || TYPES.f16, gaz = me.boosting ? 'POSTCOMB.' : me.braking ? 'AÉROFREIN' : '100 %';
    const lines = [
      ['GAZ', gaz, me.boosting ? RED : null], ['VIT', `${Math.round(me.speed * 3.6)} km/h`], ['ALT', `${Math.max(0, Math.round(me.y))} m`], ['', ''],
      ['CANON', me.over ? 'SURCHAUFFE' : `${Math.round(me.heat * 100)} %`, me.over ? RED : me.heat > 0.75 ? '#ffb04d' : null],
      ['MISSILES', `${me.ms}`], ['LEURRES', `${me.fl}`], ['STRUCT.', `${Math.round(me.health / me.maxHp * 100)} %`, me.health / me.maxHp < 0.35 ? RED : null],
      ['', ''], ['AVION', T.name],
    ];
    let y = 22;
    for (const [a, b, col] of lines) { if (a) { this.text(a, 16, y); this.text(b, 92, y, col || WHITE); } y += 15; }
  }

  // Jauges et état des zones de l'avion, en bas
  drawGauges(me) {
    const c = this.ctx, W = this.W, H = this.H, bw = 170, x = W / 2 - bw / 2, y = H - 40;
    const bar = (yy, f, col, label) => { c.fillStyle = 'rgba(8,12,20,.5)'; c.fillRect(x, yy, bw, 5); c.fillStyle = col; c.fillRect(x, yy, bw * Math.max(0, Math.min(1, f)), 5); this.text(label, x - 8, yy + 6, WHITE, '600 10px ui-monospace,Menlo,monospace', 'right'); };
    bar(y, me.ab, me.abOut ? RED : '#ff9d6e', 'PC');
    bar(y + 11, me.health / me.maxHp, me.health / me.maxHp < 0.35 ? RED : GREEN, 'VIE');
    // silhouette : les parties touchées virent à l'orange puis au rouge
    const sx = 54, sy = H - 62, zone = (d) => (d > 0.66 ? RED : d > 0.2 ? '#ffb04d' : 'rgba(255,255,255,.8)');
    c.lineWidth = 3.5; c.lineCap = 'round';
    const seg = (x1, y1, x2, y2, col) => { c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 5.5; c.beginPath(); c.moveTo(sx + x1, sy + y1); c.lineTo(sx + x2, sy + y2); c.stroke(); c.strokeStyle = col; c.lineWidth = 3.2; c.beginPath(); c.moveTo(sx + x1, sy + y1); c.lineTo(sx + x2, sy + y2); c.stroke(); };
    seg(0, -22, 0, 6, 'rgba(255,255,255,.8)');
    seg(0, 6, 0, 22, zone(me.dE));
    seg(-3, -2, -28, 9, zone(me.dL));
    seg(3, -2, 28, 9, zone(me.dR));
    seg(-11, 19, 11, 19, zone(me.dT));
    c.lineCap = 'butt';
  }

  drawAlerts(view, me, opts) {
    const W = this.W, H = this.H, blink = Math.floor(performance.now() / 180) % 2 === 0;
    let y = H * 0.27;
    const alert = (t, col = RED) => { this.text(t, W / 2, y, col, '800 22px system-ui,sans-serif', 'center'); y += 28; };
    if (me.warn && blink) alert('MISSILE !');
    if (opts.terrain && blink) alert('REDRESSE !');
    const dist = Math.hypot(me.x - CENTER, me.z - CENTER);
    if (dist > ZONE_WARN) alert('RETOUR VERS L\'ÎLE', '#ffb04d');
    if (me.speed < 58) alert('DÉCROCHAGE', '#ffb04d');
    if (me.dE > 0.7) { this.text('Moteur endommagé', W / 2, H - 56, '#ffb04d', '700 12px system-ui,sans-serif', 'center'); }
  }

  // Radar rond : la vraie île, et les avions à portée
  drawRadar(view, me, camera) {
    const c = this.ctx, R = 58, mx = this.W - R - 16, my = R + 66, range = 1100;
    const yaw = Math.atan2(me.fx, me.fz);
    c.save(); c.beginPath(); c.arc(mx, my, R, 0, 6.283); c.clip();
    c.fillStyle = '#2d4a63'; c.fillRect(mx - R, my - R, R * 2, R * 2);
    c.translate(mx, my); c.rotate(yaw + Math.PI); c.scale(1 * R / range, -1 * R / range * -1);
    c.translate(-me.x, -me.z);
    c.globalAlpha = 0.92; c.drawImage(this.mini, 0, 0, 1600, 1600); c.globalAlpha = 1;
    if (view.zones) for (const z of view.zones) {
      c.strokeStyle = SIDE[z.own]; c.lineWidth = 20; c.fillStyle = z.own === 1 ? 'rgba(79,141,255,.28)' : z.own === 2 ? 'rgba(255,90,77,.28)' : 'rgba(235,238,242,.16)';
      c.beginPath(); c.arc(z.x, z.z, z.r, 0, 6.283); c.fill(); c.stroke();
    }
    for (const p of view.planes) {
      if (!p.alive || p.id === me.id) continue;
      const big = p.type === 'cargo';
      c.fillStyle = big ? GOLD : this.isEnemy(me, p) ? RED : BLUE; c.strokeStyle = '#10151c'; c.lineWidth = 8;
      c.beginPath(); c.arc(p.x, p.z, big ? 58 : 36, 0, 6.283); c.stroke(); c.fill();
    }
    c.restore();
    if (view.zones) {
      // la lettre reste à plat : on la place à la main, et au bord du radar si la zone est loin
      const a = yaw + Math.PI, k = R / range;
      for (const z of view.zones) {
        const dx = z.x - me.x, dz = z.z - me.z; let x = (dx * Math.cos(a) - dz * Math.sin(a)) * k, y = (dx * Math.sin(a) + dz * Math.cos(a)) * k;
        const n = Math.hypot(x, y); if (n > R - 9) { x *= (R - 9) / n; y *= (R - 9) / n; }
        this.text(z.id, mx + x, my + y + 4, '#fff', '800 11px system-ui,sans-serif', 'center');
      }
    }
    c.strokeStyle = 'rgba(255,255,255,.78)'; c.lineWidth = 1.5; c.beginPath(); c.arc(mx, my, R, 0, 6.283); c.stroke();
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(mx, my - 7); c.lineTo(mx + 5, my + 5); c.lineTo(mx, my + 2.5); c.lineTo(mx - 5, my + 5); c.closePath(); c.stroke(); c.fill();
    for (const [t, a] of [['N', Math.PI], ['E', Math.PI / 2], ['S', 0], ['O', -Math.PI / 2]]) {
      const an = a - yaw;
      this.text(t, mx - Math.sin(an) * (R - 8), my - Math.cos(an) * (R - 8) + 4, '#fff', '700 10px system-ui,sans-serif', 'center');
    }
  }

  // Domination : où sont les zones, à qui, et à combien
  drawZoneMarks(view, me, camera) {
    for (const z of view.zones) {
      const s = project(z.x, z.y + ZONE_CEIL, z.z, camera, this.W, this.H);
      if (!s.front || s.x < 0 || s.x > this.W || s.y < 0 || s.y > this.H) continue;
      this.text(z.id, s.x, s.y, SIDE[z.own], '800 18px system-ui,sans-serif', 'center');
      this.text(`${(Math.hypot(z.x - me.x, z.z - me.z) / 1000).toFixed(1)} km`, s.x, s.y + 14, SIDE[z.own], '600 11px system-ui,sans-serif', 'center');
    }
  }

  drawZoneBadges(view, me) {
    const c = this.ctx, size = 26, gap = 8, n = view.zones.length, y = 66;
    let x = this.W / 2 - (n * size + (n - 1) * gap) / 2;
    for (const z of view.zones) {
      const f = Math.min(1, Math.abs(z.cap)), side = z.cap >= 0 ? 1 : 2, here = me && me.alive && Math.hypot(z.x - me.x, z.z - me.z) < z.r;
      c.fillStyle = 'rgba(10,14,22,.62)'; c.fillRect(x, y, size, size);
      c.fillStyle = SIDE[side]; c.globalAlpha = z.own ? 0.9 : 0.55; c.fillRect(x, y + size * (1 - f), size, size * f); c.globalAlpha = 1;
      c.strokeStyle = here ? '#fff' : SIDE[z.own]; c.lineWidth = here ? 2 : 1.2; c.strokeRect(x, y, size, size);
      this.text(z.id, x + size / 2, y + 18, '#fff', '800 13px system-ui,sans-serif', 'center');
      x += size + gap;
    }
  }

  drawZoneHint(view, me, opts) {
    const z = opts.zone; if (!z) return;
    const y = this.H * 0.2;
    if (opts.zoneHigh > 0) this.text(`Descends pour capturer ${z.id} : encore ${Math.ceil(opts.zoneHigh)} m`, this.W / 2, y, '#ffb04d', '700 14px system-ui,sans-serif', 'center');
    else if (z.own !== me.team) this.text(`Capture de ${z.id} (${z.name})`, this.W / 2, y, GREEN, '700 14px system-ui,sans-serif', 'center');
    else this.text(`Tu gardes ${z.id} (${z.name})`, this.W / 2, y, 'rgba(255,255,255,.8)', '600 13px system-ui,sans-serif', 'center');
  }

  drawScores(view, me) {
    const c = this.ctx, W = this.W, bw = Math.min(250, W * 0.3), x = W / 2 - bw / 2;
    const mm = Math.floor(view.left / 60), ss = Math.floor(view.left % 60).toString().padStart(2, '0'), target = view.target;
    c.fillStyle = 'rgba(10,14,22,.62)'; c.fillRect(x - 2, 12, bw + 4, 12);
    const cargo = view.mode === 'escorte' ? view.planes.find((p) => p.type === 'cargo') : null;
    if (cargo) {
      const f = cargo.alive && cargo.maxHp ? cargo.health / cargo.maxHp : 0;
      c.fillStyle = f < 0.3 ? RED : GOLD; c.fillRect(x, 14, bw * Math.max(0, f), 8);
      this.text(`Transport ${Math.ceil(f * 100)} %`, W / 2, 40, '#fff', '700 13px system-ui,sans-serif', 'center');
      if (me && view.ph === 'play') this.text(me.team === 1 ? 'Protège-le jusqu\'à la fin du temps' : 'Abats-le avant la fin du temps', W / 2, 74, 'rgba(255,255,255,.8)', '600 12px system-ui,sans-serif', 'center');
    } else if (isTeamMode(view.mode)) {
      const a = Math.round(view.tk[1] || 0), b = Math.round(view.tk[2] || 0);
      c.fillStyle = '#3f6fe0'; c.fillRect(x, 14, bw / 2 * Math.min(1, a / target), 8);
      c.fillStyle = '#dd3b30'; c.fillRect(x + bw - bw / 2 * Math.min(1, b / target), 14, bw / 2 * Math.min(1, b / target), 8);
      c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(W / 2 - 0.5, 12, 1, 12);
      this.text(`${a} — ${b}`, W / 2, 40, '#fff', '700 13px system-ui,sans-serif', 'center');
    } else {
      const lead = view.planes.filter((p) => p.type !== 'cargo').sort((p, q) => q.kills - p.kills)[0], mine = me ? me.kills : 0;
      c.fillStyle = '#3f6fe0'; c.fillRect(x, 14, bw * Math.min(1, mine / target), 8);
      c.fillStyle = 'rgba(221,59,48,.8)'; if (lead && lead.kills > mine) c.fillRect(x + bw * Math.min(1, mine / target), 14, bw * Math.min(1, (lead.kills - mine) / target), 8);
      this.text(`${mine} / ${target}${lead && me && lead.id !== me.id && lead.kills ? `  ·  ${lead.name} ${lead.kills}` : ''}`, W / 2, 40, '#fff', '700 13px system-ui,sans-serif', 'center');
    }
    if (view.ph === 'play' || view.ph === 'countdown') this.text(`${mm}:${ss}`, W / 2, 56, 'rgba(255,255,255,.85)', '600 12px ui-monospace,Menlo,monospace', 'center');
    if (view.zones) this.drawZoneBadges(view, me);
    if (view.duel && (view.ph === 'play' || view.ph === 'countdown')) {
      const name = (id) => { const p = view.planes.find((q) => q.id === id); return !p ? '?' : me && p.id === me.id ? 'Toi' : p.name; };
      this.text(`Manche ${view.duel.round} : ${name(view.duel.a)} contre ${name(view.duel.b)}${view.duel.pause > 0 ? '' : ` · ${Math.max(0, Math.ceil(view.duel.t))} s`}`, W / 2, 74, 'rgba(255,255,255,.85)', '600 12px system-ui,sans-serif', 'center');
    }
  }

  drawFeed() {
    let y = 210;
    for (const m of this.feed) {
      this.ctx.globalAlpha = Math.min(1, m.t);
      this.text(m.text, this.W - 16, y, m.mine ? '#ffd24d' : '#fff', '600 12px system-ui,sans-serif', 'right');
      y += 18;
    }
    this.ctx.globalAlpha = 1;
  }

  drawCenterMessages(view, me) {
    const W = this.W, H = this.H;
    if (view.ph === 'countdown') {
      this.text(String(Math.max(1, Math.ceil(view.t))), W / 2, H * 0.42, '#fff', '900 76px system-ui,sans-serif', 'center');
      this.text('Prêts au combat', W / 2, H * 0.42 + 34, '#fff', '700 16px system-ui,sans-serif', 'center');
    }
    if (this.bigT > 0) { this.ctx.globalAlpha = Math.min(1, this.bigT * 2); this.text(this.bigText, W / 2, H * 0.36, '#ffd24d', '800 24px system-ui,sans-serif', 'center'); this.ctx.globalAlpha = 1; }
    if (this.awardT > 0) { this.ctx.globalAlpha = Math.min(1, this.awardT * 2); this.text(this.awardText, W / 2, H * 0.36 + 26, '#fff', '700 15px system-ui,sans-serif', 'center'); this.ctx.globalAlpha = 1; }
    if (this.toastT > 0) { this.ctx.globalAlpha = Math.min(1, this.toastT * 2); this.text(this.toastText, W / 2, H * 0.72, '#fff', '700 15px system-ui,sans-serif', 'center'); this.ctx.globalAlpha = 1; }
    if (me && !me.alive && view.ph === 'play' && view.duel) {
      const left = view.duel.q.indexOf(me.id);
      this.text(me.out ? 'Tu regardes le duel' : 'Manche perdue', W / 2, H * 0.14, '#fff', '800 20px system-ui,sans-serif', 'center');
      if (me.out) this.text(left === 0 ? 'Le gagnant t\'affronte à la prochaine manche' : `Encore ${left + 1} manches avant ton tour`, W / 2, H * 0.14 + 22, 'rgba(255,255,255,.85)', '600 13px system-ui,sans-serif', 'center');
    } else if (me && !me.alive && view.ph === 'play') {
      const c = this.ctx; c.fillStyle = 'rgba(20,6,6,.28)'; c.fillRect(0, 0, W, H);
      const by = me.killedBy ? `Abattu par ${me.killedBy}` : (CAUSE[me.deathCause] ? `Tu ${me.deathCause === 'mer' ? 'as fini à la mer' : me.deathCause === 'collision' ? 'es entré en collision' : 't\'es écrasé'}` : 'Avion détruit');
      this.text(by, W / 2, H * 0.38, '#fff', '800 28px system-ui,sans-serif', 'center');
      this.text(`Réapparition dans ${Math.max(1, Math.ceil(me.respawn))} s`, W / 2, H * 0.38 + 30, 'rgba(255,255,255,.9)', '600 15px system-ui,sans-serif', 'center');
    }
  }

  drawScoreboard(view) {
    const c = this.ctx, rows = view.planes.filter((p) => p.type !== 'cargo').sort((a, b) => b.kills - a.kills || a.deaths - b.deaths), w = Math.min(420, this.W - 32), h = 56 + rows.length * 26, x = this.W / 2 - w / 2, y = Math.max(70, this.H / 2 - h / 2);
    c.fillStyle = 'rgba(9,13,22,.8)'; c.fillRect(x, y, w, h);
    this.text('Pilote', x + 14, y + 24, 'rgba(255,255,255,.65)', '700 12px system-ui,sans-serif');
    this.text('Élim.', x + w - 86, y + 24, 'rgba(255,255,255,.65)', '700 12px system-ui,sans-serif', 'right');
    this.text('Morts', x + w - 18, y + 24, 'rgba(255,255,255,.65)', '700 12px system-ui,sans-serif', 'right');
    rows.forEach((p, i) => {
      const yy = y + 50 + i * 26, col = p.team === 1 ? BLUE : p.team === 2 ? RED : '#fff';
      c.fillStyle = p.color; c.fillRect(x + 14, yy - 10, 10, 10);
      this.text(`${p.name}${p.bot ? ' (bot)' : ''} · ${(TYPES[p.type] || TYPES.f16).name}`, x + 32, yy, col, '600 13px system-ui,sans-serif');
      this.text(String(p.kills), x + w - 86, yy, '#fff', '700 13px system-ui,sans-serif', 'right');
      this.text(String(p.deaths), x + w - 18, yy, '#fff', '600 13px system-ui,sans-serif', 'right');
    });
  }
}
