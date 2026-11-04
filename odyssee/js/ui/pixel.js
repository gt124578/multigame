// odyssee/js/ui/pixel.js — une « scène » en pixel art pour les jeux du Casino et les bornes d'arcade :
// une toile de 400 × 240 pixels agrandie sans lissage (facteur entier quand l'écran le permet), une couche HTML
// par-dessus pour les textes et les boutons (police du jeu), des zones cliquables sur la toile, et une police
// de 5 × 7 pixels pour écrire dans le décor (cartes, compteurs, écrans de borne).
import { el, esc } from './ui.js';

/* ---------------- police 5 × 7 ---------------- */
const G = {
  "A": '.###.|#...#|#...#|#####|#...#|#...#|#...#', "B": '####.|#...#|#...#|####.|#...#|#...#|####.', "C": '.###.|#...#|#....|#....|#....|#...#|.###.', "D": '####.|#...#|#...#|#...#|#...#|#...#|####.',
  "E": '#####|#....|#....|####.|#....|#....|#####', "F": '#####|#....|#....|####.|#....|#....|#....', "G": '.###.|#...#|#....|#.###|#...#|#...#|.####', "H": '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  "I": '.###.|..#..|..#..|..#..|..#..|..#..|.###.', "J": '..###|...#.|...#.|...#.|...#.|#..#.|.##..', "K": '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', "L": '#....|#....|#....|#....|#....|#....|#####',
  "M": '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', "N": '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#', "O": '.###.|#...#|#...#|#...#|#...#|#...#|.###.', "P": '####.|#...#|#...#|####.|#....|#....|#....',
  "Q": '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', "R": '####.|#...#|#...#|####.|#.#..|#..#.|#...#', "S": '.####|#....|#....|.###.|....#|....#|####.', "T": '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  "U": '#...#|#...#|#...#|#...#|#...#|#...#|.###.', "V": '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', "W": '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', "X": '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  "Y": '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', "Z": '#####|....#|...#.|..#..|.#...|#....|#####', "0": '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', "1": '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  "2": '.###.|#...#|....#|...#.|..#..|.#...|#####', "3": '#####|...#.|..#..|...#.|....#|#...#|.###.', "4": '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', "5": '#####|#....|####.|....#|....#|#...#|.###.',
  "6": '..##.|.#...|#....|####.|#...#|#...#|.###.', "7": '#####|....#|...#.|..#..|.#...|.#...|.#...', "8": '.###.|#...#|#...#|.###.|#...#|#...#|.###.', "9": '.###.|#...#|#...#|.####|....#|...#.|.##..',
  ":": '.....|.##..|.##..|.....|.##..|.##..|.....', ".": '.....|.....|.....|.....|.....|.##..|.##..', "!": '..#..|..#..|..#..|..#..|..#..|.....|..#..', "?": '.###.|#...#|....#|...#.|..#..|.....|..#..',
  "-": '.....|.....|.....|.###.|.....|.....|.....', "+": '.....|..#..|..#..|#####|..#..|..#..|.....', "/": '....#|...#.|...#.|..#..|.#...|.#...|#....', "×": '.....|#...#|.#.#.|..#..|.#.#.|#...#|.....',
  "'": '..#..|..#..|.#...|.....|.....|.....|.....', "%": '##..#|##..#|...#.|..#..|.#...|#..##|#..##', "(": '...#.|..#..|.#...|.#...|.#...|..#..|...#.', ")": '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  ",": '.....|.....|.....|.....|.##..|..#..|.#...', "=": '.....|.....|#####|.....|#####|.....|.....', "<": '...#.|..#..|.#...|#....|.#...|..#..|...#.', ">": '.#...|..#..|...#.|....#|...#.|..#..|.#...',
  "♠": '..#..|.###.|#####|#####|#.#.#|..#..|.###.', "♥": '.....|.#.#.|#####|#####|.###.|..#..|.....', "♦": '.....|..#..|.###.|#####|.###.|..#..|.....', "♣": '.###.|.###.|#.#.#|#####|#.#.#|..#..|.###.',
  "₽": '####.|#...#|#...#|####.|#....|###..|#....', "▲": '.....|..#..|.###.|#####|.....|.....|.....', "▼": '.....|.....|#####|.###.|..#..|.....|.....', "*": '.....|..#..|#.#.#|.###.|#.#.#|..#..|.....',
};
for (const k in G) G[k] = G[k].replace(/\|/g, '');
export const GLYPHES = G;
const ACCENTS = { À: 'A', Â: 'A', Ä: 'A', Ç: 'C', É: 'E', È: 'E', Ê: 'E', Ë: 'E', Î: 'I', Ï: 'I', Ô: 'O', Ö: 'O', Ù: 'U', Û: 'U', Ü: 'U', Œ: 'OE' };
const norm = (s) => String(s).toUpperCase().replace(/[ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ]/g, (c) => ACCENTS[c]);
const avance = (ch) => (ch === ' ' ? 4 : ch === '1' || ch === 'I' || ch === '.' || ch === ':' || ch === '!' || ch === "'" || ch === ',' ? 5 : 6);
/** largeur d'un texte écrit avec texte() */
export function largeur(s, e = 1) { let w = 0; for (const ch of norm(s)) w += avance(ch); return Math.max(0, w - 1) * e; }
/** écrit un texte en pixels ; o : { e: échelle entière, a: 'c' (centré) | 'd' (aligné à droite), ombre: couleur, renverse } */
export function texte(g, s, x, y, col, o = {}) {
  const e = o.e || 1; s = norm(s);
  let cx = Math.round(o.a === 'c' ? x - largeur(s, e) / 2 : o.a === 'd' ? x - largeur(s, e) : x); y = Math.round(y);
  if (o.ombre) { const c2 = { ...o, ombre: null }; texte(g, s, x + e, y + e, o.ombre, c2); }
  g.fillStyle = col;
  for (const ch of s) {
    const gl = G[ch];
    if (gl) {
      // les chiffres étroits (1, I, ponctuation) sont recentrés dans leur avance
      const dx = avance(ch) === 5 ? -1 : 0;
      for (let i = 0; i < 35; i++) if (gl[i] === '#') {
        const px = i % 5, py = (i / 5) | 0;
        if (o.renverse) g.fillRect(cx + (4 - px + dx) * e, y + (6 - py) * e, e, e); else g.fillRect(cx + (px + dx) * e, y + py * e, e, e);
      }
    }
    cx += avance(ch) * e;
  }
}

/* ---------------- petits outils de dessin ---------------- */
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = { out: (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3), inOut: (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }, back: (t) => { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
export function toile(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
export const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
/** rectangle aux coins coupés d'un pixel, avec contour éventuel */
export function pave(g, x, y, w, h, fond, bord) {
  x = Math.round(x); y = Math.round(y);
  if (bord) { g.fillStyle = bord; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2); g.fillStyle = fond; g.fillRect(x + 1, y + 1, w - 2, h - 2); }
  else { g.fillStyle = fond; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2); }
}
/** ellipse pleine au pixel près (sans anticrénelage) */
export function ellipse(g, cx, cy, rx, ry, col) {
  g.fillStyle = col;
  for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); }
}
/** motif tramé (deux couleurs en damier clairsemé) sur un rectangle : le feutre, le velours */
export function trame(g, x, y, w, h, c1, c2, pas = 3, graine = 7) {
  g.fillStyle = c1; g.fillRect(x, y, w, h); g.fillStyle = c2;
  let s = graine; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let j = 0; j < h; j++) for (let i = (j * 2) % pas; i < w; i += pas) if (r() < 0.5) g.fillRect(x + i, y + j, 1, 1);
}

/* ---------------- la scène ---------------- */
/**
 * crée l'écran : { s (élément), g (contexte 2D de la toile), ov (couche HTML), W, H, zone(), boucle(), choisir(), msg(), fermer() }
 * o : { W, H, fond (couleur autour de la scène) }
 */
export function scene(ui, cls, o = {}) {
  const W = o.W || 400, H = o.H || 240;
  const s = el('div', 'screen pxs ' + cls);
  const stage = el('div', 'pxs-stage'), cv = document.createElement('canvas'), ov = el('div', 'pxs-ov');
  cv.width = W; cv.height = H; cv.className = 'pxs-cv';
  stage.append(cv, ov); s.appendChild(stage); ui.root.appendChild(s);
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const T = { s, stage, cv, g, ov, W, H, ui, zones: [], survol: null, raf: 0, fini: false };
  const fit = () => {
    // facteur entier dès que possible : chaque pixel de la scène fait k × k pixels d'écran
    let k = Math.min(innerWidth / W, innerHeight / H); if (k >= 2) k = Math.floor(k);
    stage.style.width = W * k + 'px'; stage.style.height = H * k + 'px';
    s.style.setProperty('--k', k + 'px'); T.k = k;
  };
  fit(); addEventListener('resize', fit);
  // les touches ne passent jamais au monde derrière la scène
  const popBase = ui.input.push(() => {});
  // zones cliquables de la toile (refaites à chaque image par le dessin)
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const trouve = (x, y) => { for (let i = T.zones.length - 1; i >= 0; i--) { const z = T.zones[i]; if (x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h) return z; } return null; };
  const down = (e) => { const [x, y] = pos(e); const z = trouve(x, y); if (z) { e.preventDefault(); z.fn(x, y, e); } };
  const move = (e) => { const [x, y] = pos(e); const z = trouve(x, y); T.survol = z ? z.id ?? z : null; cv.style.cursor = z ? 'pointer' : ''; };
  cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  /** zone cliquable (à redéclarer à chaque dessin : T.zones est vidé par la boucle) */
  T.zone = (x, y, w, h, fn, id) => { T.zones.push({ x, y, w, h, fn, id }); };
  /** boucle d'animation : f(t en ms, dt en s) ; les zones sont vidées avant chaque image */
  T.boucle = (f) => {
    let der = performance.now();
    const tick = (now) => { if (T.fini) return; const dt = Math.min(0.1, (now - der) / 1000); der = now; T.zones = []; f(now, dt); T.raf = requestAnimationFrame(tick); };
    T.raf = requestAnimationFrame(tick);
  };
  /** une bulle de message en haut de la scène (texte HTML) */
  const bulle = el('div', 'pxs-msg'); ov.appendChild(bulle);
  T.msg = (html) => { bulle.innerHTML = html || ''; bulle.classList.toggle('on', !!html); };
  /** barre de boutons en bas ; choisir() renvoie l'id du bouton pressé (clavier : ← → et A, B = o.cancel) */
  const barre = el('div', 'pxs-bar'); ov.appendChild(barre); T.barre = barre;
  let enCours = null;
  T.choisir = (defs, oc = {}) => new Promise((resolve) => {
    if (enCours) enCours.fin(undefined);
    barre.innerHTML = ''; barre.className = 'pxs-bar ' + (oc.cls || '') + (barre.classList.contains('inactif') ? ' inactif' : '');
    const btns = defs.map((d, i) => {
      const b = el('button', 'pxs-btn ' + (d.cls || '') + (d.off ? ' off' : ''), d.html ?? esc(d.label)); b.type = 'button'; b.tabIndex = -1;
      if (d.titre) b.title = d.titre;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (d.off) { ui.sound.sfx('bump'); return; } i0 = i; montre(); valider(); });
      barre.appendChild(b); return b;
    });
    let i0 = Math.max(0, defs.findIndex((d) => d.id === oc.start && !d.off)); if (defs[i0]?.off) i0 = Math.max(0, defs.findIndex((d) => !d.off));
    const montre = () => { btns.forEach((b, k) => b.classList.toggle('on', k === i0)); oc.onMove?.(defs[i0]?.id); };
    const fin = (v) => { if (!enCours || enCours.fin !== fin) return; enCours = null; pop(); if (!oc.garder) barre.innerHTML = ''; resolve(v); };
    const valider = () => { ui.sound.sfx('select'); fin(defs[i0].id); };
    const pop = ui.input.push((k, rep) => {
      if (oc.onKey && oc.onKey(k, defs[i0]?.id, rep)) return;
      const n = defs.length;
      if (k === 'left' || k === 'right') { const d = k === 'left' ? -1 : 1; for (let m = 1; m <= n; m++) { const j = (i0 + d * m + n * 2) % n; if (!defs[j].off) { i0 = j; break; } } ui.sound.sfx('blip'); montre(); }
      else if (k === 'a') { if (defs[i0] && !defs[i0].off) valider(); else ui.sound.sfx('bump'); }
      else if (k === 'b' && oc.cancel !== undefined) { ui.sound.sfx('cancel'); fin(oc.cancel); }
    });
    enCours = { fin, rafraichir: (id, d) => { const k = defs.findIndex((x) => x.id === id); if (k >= 0) { Object.assign(defs[k], d); btns[k].innerHTML = defs[k].html ?? esc(defs[k].label); btns[k].classList.toggle('off', !!defs[k].off); } } };
    montre();
  });
  /** termine le choix en cours de l'extérieur (un clic sur la toile) */
  T.resoudre = (v) => { if (enCours) { enCours.fin(v); return true; } return false; };
  /** met à jour un bouton du choix en cours (libellé, désactivé) */
  T.majBouton = (id, d) => enCours?.rafraichir(id, d);
  T.enChoix = () => !!enCours;
  /** attend un délai (ou un appui sur A / clic, si o.passer) */
  T.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  T.fermer = () => {
    T.fini = true; cancelAnimationFrame(T.raf); removeEventListener('resize', fit);
    if (enCours) enCours.fin(undefined);
    popBase(); s.remove();
  };
  return T;
}
/** une étiquette HTML posée sur la scène, en coordonnées de la toile */
export function etiquette(T, cls, x, y, html = '') {
  const e = el('div', 'pxs-lbl ' + cls, html); T.ov.appendChild(e);
  e.place = (nx, ny) => { e.style.left = `calc(var(--k) * ${nx})`; e.style.top = `calc(var(--k) * ${ny})`; };
  e.place(x, y);
  e.texte = (h) => { if (e._h !== h) { e._h = h; e.innerHTML = h; } };
  return e;
}
