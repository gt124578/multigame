// odyssee/js/ui/battleView.js — scène de combat 1v1, 2v2 et 3v3 façon Gen 5 : sprites animés, VFX multi-cibles, HUD 5G.
import { el, esc, wait } from './ui.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { monName, expProgress } from '../core/mon.js';
import { ITEMS, canUseOn, itemName } from '../core/items.js';
import { ASSETS, loadImg } from '../assets.js';
import { TYPE_COL, TYPE_FR, STATUS_FR, hpCol, partyScreen, bagScreen } from './screens.js';
import { typeEff } from '../core/battle.js';
import { moveDesc } from '../data/moveDescriptions.js';
import { playMoveVfx, TYPE_FX } from './battleVfx.js';
import { auraFrames, AURA_PAD } from '../render/aura.js';
import { TALENTS_ESPECES } from '../data/talents.js';
import { warnDev } from '../core/safe.js';
import { auraBurstSpec } from '../game/follower-life.js';

/** vide transparent sous les pattes d'un sprite (en pixels de l'image), mesuré une fois par image */
const PIEDS = new Map();
function videSous(img) {
  const k = img?.src || img; if (!img) return 0;
  if (PIEDS.has(k)) return PIEDS.get(k);
  let v = 0;
  try {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    bas: for (let y = c.height - 1; y >= 0; y--) { for (let i = 0; i < c.width; i++) if (d[(y * c.width + i) * 4 + 3] > 32) break bas; v++; }
    if (v >= c.height) v = 0;
  } catch (e) { v = 0; }
  PIEDS.set(k, v); return v;
}
/** rangées vides au-dessus du dessin */
function videSur(img) {
  try {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) if (d[(y * c.width + i) * 4 + 3] > 32) return y;
  } catch (e) { warnDev('sprite', e); }
  return 0;
}
/** les Pokémon qui lévitent (Fantominus, Smogo…) gardent la hauteur de leur sprite : ils flottent au-dessus du socle */
const levite = (sp) => (TALENTS_ESPECES[sp] || TALENTS_ESPECES[SPECIES[sp]?.base] || []).includes('levitate');

const BH = 192;
const BALL_COL = { 'poke-ball': ['#e83838', '#f4f4f4'], 'great-ball': ['#3870e8', '#f4f4f4'], 'ultra-ball': ['#303030', '#f0c830'], 'master-ball': ['#8a3ac8', '#f4f4f4'], 'gs-ball': ['#d8a830', '#c8c8d0'] };
const BALL_SPRITE_PATHS = {
  'poke-ball': 'img/battle/poke_ball_32.png',
  'great-ball': 'img/battle/great_ball_32.png',
  'ultra-ball': 'img/battle/ultra_ball_32.png',
  open: 'img/battle/poke_ball_open.png',
  'tilt-l': 'img/battle/poke_ball_tilt_l.png',
  'tilt-r': 'img/battle/poke_ball_tilt_r.png',
};

function tinted(img, color) {
  if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}
const ease = (t) => t * t * (3 - 2 * t);
const BOOST_NAMES = ['Atq', 'Déf', 'Atq Spé', 'Déf Spé', 'Vit', 'Préc', 'Esq'];
const freshSpr = () => ({ visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, white: 0, whiteImg: null, darkImg: null, clipY: null });

/**
 * Fond de combat reteint (sans nouvelle image) : arènes de Voltacité (éclairs jaunes), Floralia (lumière verte de serre,
 * feuillages), Mirage (lueur violette, étoiles), Port-Granit (ocre de carrière, strates et poussière), Cendrelune (rougeoiement
 * de la lave par en dessous, braises) et Fort-Écaille (pénombre indigo, écailles d'or), les sept arènes des Terres du Sud
 * (cotations de la Salle des Marchés, nuages des Hauteurs, lianes et brume du Marais, crêtes de sable des Dunes, poutrelles
 * et fours de la Fonderie, rai de lumière du Jardin de Cristal, torches de l'Abîme), et la Nuit Violette dehors (assombri,
 * ciel pourpre). Une toile par image et par teinte, gardée en cache.
 */
const FONDS_TEINTES = new Map();
function fondTeinte(im, teinte) {
  const cle = im.src + '|' + teinte;
  if (FONDS_TEINTES.has(cle)) return FONDS_TEINTES.get(cle);
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.drawImage(im, 0, 0);
  const voile = (mode, col, a) => { x.globalCompositeOperation = mode; x.globalAlpha = a; x.fillStyle = col; x.fillRect(0, 0, W, H); };
  if (teinte === 'eclipse') {
    voile('multiply', '#4a3070', 0.55);
    x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.5;
    const g = x.createLinearGradient(0, 0, 0, H * 0.55); g.addColorStop(0, '#6a2aa8'); g.addColorStop(1, 'rgba(106,42,168,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H * 0.55);
    // l'éclipse : un disque noir cerclé d'une couronne violette, haut dans le ciel
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 0.9;
    x.fillStyle = '#c8a0ff'; x.beginPath(); x.arc(W * 0.78, H * 0.16, H * 0.075, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#120a1e'; x.beginPath(); x.arc(W * 0.78, H * 0.16, H * 0.066, 0, Math.PI * 2); x.fill();
  } else {
    const col = { electric: '#f0c838', grass: '#4aa850', psychic: '#9a6ae0', rock: '#c89a5a', fire: '#ff6a20', dragon: '#5a44c8',
      normal: '#d8c088', flying: '#7ac0f4', poison: '#8a5ab8', ground: '#d8a858', steel: '#8aa0b8', fairy: '#f49ac8', dark: '#5a3a8a' }[teinte] || '#ffffff';
    if (teinte === 'dragon') voile('multiply', '#8a84b8', 0.5);   // la Tour de Drakos est sombre
    if (teinte === 'dark') voile('multiply', '#5a4c78', 0.62);     // l'Abîme de Corbin : presque le noir
    if (teinte === 'poison') voile('multiply', '#8a9a84', 0.4);    // le Marais de Morgane : une pénombre glauque
    if (teinte === 'steel') voile('multiply', '#a0a4ac', 0.3);     // la Fonderie : la fumée
    voile('soft-light', col, teinte === 'fire' ? 0.4 : 0.55);
    voile('source-over', col, 0.1);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 0.5;
    if (teinte === 'electric') {
      // éclairs pâles en haut du décor
      x.strokeStyle = '#fff4a0'; x.lineWidth = Math.max(1, W / 200);
      for (const [px, s] of [[0.14, 1], [0.52, -1], [0.86, 1]]) { x.beginPath(); let y = 0; x.moveTo(W * px, 0); for (let k = 0; k < 4; k++) { y += H * 0.05; x.lineTo(W * px + s * (k % 2 ? -1 : 1) * W * 0.02, y); } x.stroke(); }
    } else if (teinte === 'grass') {
      // feuillages de serre qui retombent des coins
      x.fillStyle = '#2e7a32';
      for (let k = 0; k < 14; k++) { const L = k < 7, px = L ? W * (0.02 + k * 0.03) : W * (0.98 - (k - 7) * 0.03), py = H * (0.02 + (k % 7) * 0.025); x.beginPath(); x.ellipse(px, py, W * 0.03, H * 0.018, L ? 0.5 : -0.5, 0, Math.PI * 2); x.fill(); }
    } else if (teinte === 'rock') {
      // strates de la carrière en haut du décor, poussière en suspension
      x.strokeStyle = '#6a4e2c'; x.lineWidth = Math.max(1, W / 240);
      for (const [py, d] of [[0.05, 0.012], [0.11, -0.01], [0.18, 0.008]]) { x.beginPath(); x.moveTo(0, H * py); for (let k = 1; k <= 8; k++) x.lineTo(W * k / 8, H * (py + (k % 2 ? d : -d))); x.stroke(); }
      x.fillStyle = '#f0dcb0';
      for (let k = 0; k < 22; k++) { const r = Math.max(1, W / 360); x.fillRect(((k * 0.618) % 1) * W, ((k * 0.271) % 1) * H * 0.6, r, r); }
    } else if (teinte === 'fire') {
      // la lave éclaire le décor par en dessous, des braises montent
      x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.55;
      const g = x.createLinearGradient(0, H, 0, H * 0.45); g.addColorStop(0, '#ff5a10'); g.addColorStop(1, 'rgba(255,90,16,0)');
      x.fillStyle = g; x.fillRect(0, H * 0.45, W, H * 0.55);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 0.8;
      for (let k = 0; k < 20; k++) { const r = Math.max(1, W / 320); x.fillStyle = k % 3 ? '#ffb040' : '#ffe890'; x.fillRect(((k * 0.618) % 1) * W, H * (0.2 + ((k * 0.377) % 1) * 0.6), r, r); }
    } else if (teinte === 'dragon') {
      // frise d'écailles d'or en haut du décor, deux lueurs violettes
      x.strokeStyle = '#e8c860'; x.lineWidth = Math.max(1, W / 260);
      const r = W / 26; for (let k = 0; k < 14; k++) { x.beginPath(); x.arc(r + k * 2 * r, H * 0.02, r, 0, Math.PI); x.stroke(); }
      x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.45;
      for (const px of [0.12, 0.88]) { const g = x.createRadialGradient(W * px, H * 0.22, 1, W * px, H * 0.22, W * 0.14); g.addColorStop(0, '#b080ff'); g.addColorStop(1, 'rgba(176,128,255,0)'); x.fillStyle = g; x.fillRect(W * (px - 0.14), 0, W * 0.28, H * 0.5); }
    } else if (teinte === 'psychic') {
      // petites étoiles qui flottent
      x.fillStyle = '#fff0ff';
      for (let k = 0; k < 18; k++) { const px = ((k * 0.618) % 1) * W, py = ((k * 0.377) % 1) * H * 0.45, r = Math.max(1, W / 320); x.fillRect(px - r, py, 3 * r, r); x.fillRect(px, py - r, r, 3 * r); }
    } else if (teinte === 'normal') {
      // la Salle des Marchés : le bandeau des cotations en haut du décor, bougies vertes et rouges, un filet d'or
      const u = Math.max(1, Math.round(W / 320));
      x.globalAlpha = 0.7; x.fillStyle = '#10201c'; x.fillRect(0, 0, W, H * 0.07);
      x.globalAlpha = 0.9;
      for (let k = 0; k < 34; k++) { const px = (k + 0.5) * W / 34, h = H * (0.012 + ((k * 0.377) % 1) * 0.035), v = (k * 7) % 5 !== 0; x.fillStyle = v ? '#3ad07a' : '#e0504a'; x.fillRect(px - u, H * 0.058 - h, 2 * u, h); }
      x.fillStyle = '#d8b45a'; x.fillRect(0, H * 0.07, W, u);
    } else if (teinte === 'flying') {
      // les Hauteurs : des nuages qui passent, le ciel qui éclaire d'en haut
      x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.5;
      const g = x.createLinearGradient(0, 0, 0, H * 0.5); g.addColorStop(0, '#d8f0ff'); g.addColorStop(1, 'rgba(216,240,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H * 0.5);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 0.75; x.fillStyle = '#ffffff';
      for (const [px, py, s] of [[0.14, 0.09, 1], [0.46, 0.05, 0.7], [0.78, 0.12, 1.2], [0.94, 0.04, 0.6]]) for (const [dx, dy, r] of [[0, 0, 1], [-0.9, 0.2, 0.7], [0.9, 0.25, 0.75], [0.3, -0.4, 0.7]]) { x.beginPath(); x.ellipse(W * px + dx * W * 0.03 * s, H * py + dy * H * 0.03 * s, W * 0.034 * s * r, H * 0.026 * s * r, 0, 0, Math.PI * 2); x.fill(); }
    } else if (teinte === 'poison') {
      // le Marais : des lianes qui pendent, une brume verte au ras du sol, des bulles
      x.strokeStyle = '#3a5a34'; x.lineWidth = Math.max(1, W / 220);
      for (let k = 0; k < 11; k++) { const px = W * (0.04 + k * 0.094), L = H * (0.06 + ((k * 0.618) % 1) * 0.14); x.beginPath(); x.moveTo(px, 0); x.quadraticCurveTo(px + W * 0.012, L * 0.5, px - W * 0.006, L); x.stroke(); }
      x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.4;
      const g = x.createLinearGradient(0, H, 0, H * 0.55); g.addColorStop(0, '#7ad08a'); g.addColorStop(1, 'rgba(122,208,138,0)'); x.fillStyle = g; x.fillRect(0, H * 0.55, W, H * 0.45);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 0.55; x.strokeStyle = '#c8a0f0';
      for (let k = 0; k < 9; k++) { x.beginPath(); x.arc(((k * 0.618) % 1) * W, H * (0.5 + ((k * 0.377) % 1) * 0.4), Math.max(1.5, W / 200) * (1 + (k % 3) * 0.5), 0, Math.PI * 2); x.stroke(); }
    } else if (teinte === 'ground') {
      // les Dunes : des crêtes de sable au fond, la poussière dorée
      x.fillStyle = '#b88a48'; x.globalAlpha = 0.35;
      for (const [py, a] of [[0.2, 0.03], [0.27, -0.025]]) { x.beginPath(); x.moveTo(0, H * py); for (let k = 1; k <= 12; k++) x.lineTo(W * k / 12, H * (py + Math.sin(k * 1.3 + py * 20) * a)); x.lineTo(W, H * (py + 0.06)); x.lineTo(0, H * (py + 0.06)); x.fill(); }
      x.globalAlpha = 0.6; x.fillStyle = '#f6e0b0';
      for (let k = 0; k < 26; k++) { const r = Math.max(1, W / 360); x.fillRect(((k * 0.618) % 1) * W, ((k * 0.271) % 1) * H * 0.7, r * (1 + k % 2), r); }
    } else if (teinte === 'steel') {
      // la Fonderie : des poutrelles rivetées en haut du décor, la lueur des fours sur les côtés
      const u = Math.max(1, Math.round(W / 320));
      x.globalAlpha = 0.75; x.fillStyle = '#2c3038'; x.fillRect(0, 0, W, H * 0.045); x.fillRect(0, H * 0.085, W, u * 2);
      for (let k = 0; k < 16; k++) { x.fillRect(W * k / 16, H * 0.045, u * 2, H * 0.04); x.beginPath(); x.moveTo(W * k / 16, H * 0.045); x.lineTo(W * (k + 1) / 16, H * 0.085); x.lineWidth = u; x.strokeStyle = '#2c3038'; x.stroke(); }
      x.fillStyle = '#a8b4c4'; for (let k = 0; k < 32; k++) x.fillRect(W * (k + 0.5) / 32, H * 0.02, u, u);
      x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.5;
      for (const px of [0, 1]) { const g = x.createRadialGradient(W * px, H * 0.6, 1, W * px, H * 0.6, W * 0.3); g.addColorStop(0, '#ff8a20'); g.addColorStop(1, 'rgba(255,138,32,0)'); x.fillStyle = g; x.fillRect(px ? W * 0.7 : 0, H * 0.2, W * 0.3, H * 0.8); }
    } else if (teinte === 'fairy') {
      // le Jardin de Cristal : un rai de lumière en travers du décor, des éclats de cristal
      x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.35;
      x.fillStyle = '#fff0fa'; x.beginPath(); x.moveTo(W * 0.08, 0); x.lineTo(W * 0.2, 0); x.lineTo(W * 0.62, H); x.lineTo(W * 0.42, H); x.fill();
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 0.85;
      for (let k = 0; k < 16; k++) { const px = ((k * 0.618) % 1) * W, py = ((k * 0.377) % 1) * H * 0.5, r = Math.max(1, W / 300) * (1 + k % 2); x.fillStyle = k % 3 ? '#ffd0ec' : '#ffffff'; x.beginPath(); x.moveTo(px, py - 2 * r); x.lineTo(px + r, py); x.lineTo(px, py + 2 * r); x.lineTo(px - r, py); x.fill(); }
    } else if (teinte === 'dark') {
      // l'Abîme : cinq torches violettes dans le noir, le vide en bas du décor
      x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.6;
      for (const px of [0.08, 0.3, 0.5, 0.7, 0.92]) { const g = x.createRadialGradient(W * px, H * 0.2, 1, W * px, H * 0.2, W * 0.09); g.addColorStop(0, '#c890ff'); g.addColorStop(1, 'rgba(200,144,255,0)'); x.fillStyle = g; x.fillRect(W * (px - 0.09), 0, W * 0.18, H * 0.45); }
      x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.5;
      const g = x.createLinearGradient(0, H, 0, H * 0.6); g.addColorStop(0, '#08040e'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, H * 0.6, W, H * 0.4);
    }
  }
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  FONDS_TEINTES.set(cle, c);
  return c;
}

/** l'air d'un lieu (météo de décor, game.js : METEO_ARENE) : dessiné même quand une vraie météo règne sur le combat */
const AIRS = new Set(['sable', 'spores', 'ombre', 'etincelles', 'paillettes', 'vent']);

export class BattleView {
  constructor(game) { this.game = game; this.ui = game.ui; this.sound = game.sound; }

  /* ---------------- décor ---------------- */
  makeBg(kind, night) {
    const W = this.W, c = document.createElement('canvas'); c.width = W; c.height = BH; const x = c.getContext('2d');
    const grad = (y0, y1, a, b) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, y0, W, y1 - y0); };
    const stripes = (y0, y1, col, gap = 6) => { x.fillStyle = col; for (let y = y0; y < y1; y += gap) x.fillRect(0, y, W, 1); };
    if (kind === 'lab') {
      grad(0, 84, '#cfe0ee', '#eef4fa');
      x.fillStyle = '#7fb4e0'; x.fillRect(W * 0.36, 10, W * 0.28, 34); x.fillStyle = '#b8daf4'; x.fillRect(W * 0.36 + 3, 13, W * 0.28 - 6, 28);
      x.fillStyle = '#ffffff'; x.fillRect(W * 0.5 - 1, 13, 2, 28); x.fillRect(W * 0.36 + 3, 26, W * 0.28 - 6, 2);
      const books = ['#c04848', '#4870c0', '#48a060', '#d0a040', '#8058b0', '#e07848'];
      for (const bx0 of [8, W * 0.68]) {
        const bw = W * 0.26;
        x.fillStyle = '#6a4a30'; x.fillRect(bx0, 20, bw, 64); x.fillStyle = '#8a6440'; x.fillRect(bx0 + 2, 22, bw - 4, 60);
        for (const sy of [24, 44, 64]) { x.fillStyle = '#5a3c26'; x.fillRect(bx0 + 2, sy + 17, bw - 4, 2); for (let k = 0, bx = bx0 + 4; bx < bx0 + bw - 6; k++) { const w = 3 + ((k * 7 + sy) % 3); x.fillStyle = books[(k + sy) % books.length]; x.fillRect(bx, sy + 2 + ((k * 5) % 4), w, 15 - ((k * 5) % 4)); bx += w + 1; } }
      }
      x.fillStyle = '#b8c4d0'; x.fillRect(0, 84, W, 2);
      grad(86, BH, '#e6ecf2', '#fbfcfe');
      x.fillStyle = 'rgba(120,140,170,0.18)'; for (let i = 0; i < W; i += 16) x.fillRect(i, 86, 1, BH - 86); for (let y = 92; y < BH; y += 12) x.fillRect(0, y, W, 1);
    } else if (kind === 'cave') {
      grad(0, BH, '#3a2e26', '#6a5440');
      x.fillStyle = '#2a201a'; for (let i = 0; i < 9; i++) { const bx = (i * 53) % W, bw = 40 + (i * 17) % 30; x.beginPath(); x.moveTo(bx, 0); x.lineTo(bx + bw / 2, 30 + (i * 13) % 25); x.lineTo(bx + bw, 0); x.fill(); }
      stripes(110, BH, 'rgba(0,0,0,0.12)', 5);
    } else if (kind === 'indoor' || kind === 'gym' || kind === 'gym_rock' || kind === 'league' || kind === 'city' || kind === 'village') {
      const [a, b, f1, f2] = kind === 'league' ? ['#3a2c60', '#6a54a0', '#8a78c0', '#b0a0e0'] : kind === 'gym' ? ['#505868', '#8890a8', '#b8c0d0', '#e0e4ee'] : ['#c8b090', '#e0d0b0', '#e8dcc4', '#f6eee0'];
      grad(0, 80, a, b); grad(80, BH, f1, f2);
      x.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < W; i += 24) x.fillRect(i, 80, 1, BH - 80);
      stripes(84, BH, 'rgba(0,0,0,0.06)', 8);
    } else if (kind === 'water') {
      grad(0, 70, night ? '#182850' : '#88c8f8', night ? '#304078' : '#d8f0ff');
      grad(70, 120, '#3878d0', '#58a0e8'); stripes(72, 120, 'rgba(255,255,255,0.35)', 7);
      grad(120, BH, '#f0dca0', '#e0c880'); stripes(122, BH, 'rgba(160,120,60,0.15)', 6);
    } else if (kind === 'snow') {
      grad(0, 74, night ? '#1a2450' : '#a8c8e8', night ? '#3a4a88' : '#eef6ff');
      x.fillStyle = night ? '#5a6a98' : '#c8d8ec'; x.beginPath(); x.moveTo(0, 74); x.lineTo(W * 0.18, 30); x.lineTo(W * 0.34, 74); x.lineTo(W * 0.5, 40); x.lineTo(W * 0.7, 74); x.lineTo(W * 0.85, 26); x.lineTo(W, 74); x.fill();
      x.fillStyle = '#ffffff'; for (const [a1, b1] of [[0.18, 30], [0.5, 40], [0.85, 26]]) { x.beginPath(); x.moveTo(W * a1 - 10, b1 + 12); x.lineTo(W * a1, b1); x.lineTo(W * a1 + 10, b1 + 12); x.fill(); }
      grad(74, BH, '#f4f8fc', '#d0deec'); stripes(76, BH, 'rgba(120,150,190,0.12)', 6);
    } else if (kind === 'volcanic') {
      grad(0, 80, '#70384a', '#e0906a'); x.fillStyle = '#4a3a40'; x.beginPath(); x.moveTo(W * 0.55, 80); x.lineTo(W * 0.72, 22); x.lineTo(W * 0.78, 24); x.lineTo(W * 0.95, 80); x.fill();
      grad(80, BH, '#9a8e88', '#7a706c'); stripes(82, BH, 'rgba(0,0,0,0.08)', 6);
    } else {
      grad(0, 74, night ? '#1a2450' : '#80c8f8', night ? '#3a4a88' : '#e0f6ff');
      if (night) { x.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) x.fillRect((i * 97) % W, (i * 31) % 60, 1, 1); }
      else { x.fillStyle = 'rgba(255,255,255,0.85)'; for (const [cx, cy, r] of [[W * 0.15, 22, 10], [W * 0.2, 20, 13], [W * 0.27, 23, 9], [W * 0.66, 14, 9], [W * 0.71, 12, 12]]) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); } }
      x.fillStyle = night ? '#2a5a48' : '#78b878'; x.beginPath(); x.moveTo(0, 74); for (let i = 0; i <= W; i += 8) x.lineTo(i, 60 + Math.sin(i * 0.035) * 8 + Math.sin(i * 0.11) * 3); x.lineTo(W, 74); x.fill();
      x.fillStyle = night ? '#1e4a34' : '#4a9858'; for (let i = -10; i < W; i += 11) { x.beginPath(); x.arc(i, 74, 9 + (i * 7) % 5, Math.PI, 0); x.fill(); }
      grad(74, BH, night ? '#3a7048' : '#a0e078', night ? '#2a5a38' : '#68c050'); stripes(76, BH, night ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.18)', 6);
    }
    return c;
  }
  drawPlatform(x, cx, cy, rx, ry, kind) {
    if (kind === 'faille') { this.socleFaille(x, cx, cy, rx, ry); return; }
    const cols = kind === 'cave' || kind === 'gym_rock' ? ['#4a3a2c', '#8a7258', '#a08a6c'] : kind === 'indoor' || kind === 'gym' || kind === 'league' || kind === 'city' ? ['#9098a8', '#d8dce8', '#f2f4f8'] : kind === 'water' ? ['#c0a060', '#f0dca0', '#fbecc0'] : kind === 'volcanic' ? ['#5a5250', '#8a8280', '#a8a09c'] : kind === 'snow' ? ['#a0b4cc', '#dce8f4', '#ffffff'] : ['#3c8a3c', '#6cc458', '#90dc78'];
    x.fillStyle = cols[0]; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill();
    x.fillStyle = cols[1]; x.beginPath(); x.ellipse(cx, cy - 2, rx - 3, ry - 3, 0, 0, 7); x.fill();
    x.fillStyle = cols[2]; x.beginPath(); x.ellipse(cx - rx * 0.15, cy - 4, rx * 0.55, ry * 0.4, 0, 0, 7); x.fill();
  }
  /** îlot de roche arraché au monde, qui flotte dans la faille */
  socleFaille(x, cx, cy, rx, ry) {
    const { core = '#38e8ff', rim = '#a848ff' } = this.fond?.info || {}, t = performance.now() / 1000;
    cx = Math.round(cx); cy = Math.round(cy);
    const rang = (y, w, c) => { x.fillStyle = c; x.fillRect(cx - w, y, w * 2, 1); };
    // dessous en pointes
    const prof = Math.round(ry * 1.7);
    for (let j = 0; j < prof; j++) {
      const u = j / prof, w = Math.round(rx * 0.92 * Math.pow(1 - u, 1.5) * (0.92 + 0.08 * Math.sin(j * 1.9)));
      if (w > 0) { rang(cy + j, w, j % 4 === 3 ? '#1c1030' : '#2a1846'); x.fillStyle = '#3c2460'; x.fillRect(cx - w, cy + j, Math.max(1, Math.round(w * 0.22)), 1); }
    }
    // lueur du bord, dessus de pierre
    for (let j = -ry; j <= ry; j++) { const w = Math.round(rx * Math.sqrt(1 - (j * j) / (ry * ry))); if (w > 0) rang(cy + j, w, rim); }
    for (let j = -ry + 1; j <= ry - 1; j++) { const w = Math.round((rx - 2) * Math.sqrt(1 - (j * j) / ((ry - 1) * (ry - 1)))); if (w > 0) rang(cy + j - 1, w, j < -ry * 0.2 ? '#6a5490' : j < ry * 0.45 ? '#5a4580' : '#48366c'); }
    x.fillStyle = core;
    for (let k = 0; k < 5; k++) { const a = k * 1.9 + 0.6, px = Math.round(cx + Math.cos(a) * rx * 0.62), py = Math.round(cy - 1 + Math.sin(a) * ry * 0.5); x.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + k); x.fillRect(px - 2, py, 4, 1); x.fillRect(px, py - 1, 1, 3); }
    x.globalAlpha = 1;
    // éclats qui tournent autour
    for (let k = 0; k < 4; k++) { const a = t * 0.5 + k * 1.57, px = Math.round(cx + Math.cos(a) * rx * 1.12), py = Math.round(cy + ry * 0.7 + Math.sin(a) * ry * 0.9 + Math.sin(t * 1.4 + k) * 2); x.fillStyle = '#4a3070'; x.fillRect(px - 2, py - 2, 4, 4); x.fillStyle = core; x.fillRect(px - 1, py - 2, 2, 1); }
  }
  async loadBattleDecor(kind, night, teinte = null) {
    const bgMap = {
      cave: 'bg_cave', gym: 'bg_gym', gym_rock: 'bg_gym_rock', league: 'bg_league', indoor: 'bg_indoor',
      city: 'bg_city', village: 'bg_village', water: night ? 'bg_water_night' : 'bg_water',
      snow: night ? 'bg_snow_night' : 'bg_snow', volcanic: 'bg_volcanic',
    };
    const drawn = kind === 'lab' || kind === 'faille', nu = kind === 'faille';
    const bgKey = bgMap[kind] || (night ? 'bg_grass_night' : 'bg_grass');
    const platMap = { cave: 'cave', gym: 'stone', gym_rock: 'cave', league: 'stone', indoor: 'stone', lab: 'stone', city: 'stone', village: 'grass', water: 'water', snow: 'snow', volcanic: 'volcanic' };
    const platKey = platMap[kind] || (this.battle?.wild ? 'tallgrass' : 'grass');
    const ballPromises = Object.entries(BALL_SPRITE_PATHS).map(async ([k, p]) => [k, await loadImg(p)]);
    const [bgImg, platE, platP, ...ballEntries] = await Promise.all([
      drawn ? Promise.resolve(null) : loadImg(`img/battle/${bgKey}.png`),
      nu ? Promise.resolve(null) : loadImg(`img/battle/plat_${platKey}_e.png`),
      nu ? Promise.resolve(null) : loadImg(`img/battle/plat_${platKey}_p.png`),
      ...ballPromises,
    ]);
    this.bgImg = bgImg && teinte ? fondTeinte(bgImg, teinte) : bgImg; this.platE = platE; this.platP = platP;
    this.ballImgs = Object.fromEntries(ballEntries);
  }

  /* ---------------- positions par format (1v1, 2v2, 3v3) ---------------- */
  posFor(side, slot = 0) {
    const W = this.W, sl = this.slots || 1;
    if (this.battle?.isRaid && side === 0 && sl >= 2) {   // l'escouade en arc devant le boss
      // comme dans les jeux DS : le bas des sprites de dos (coupé net) passe sous la boîte de texte, chacun sur son socle
      const P = { 2: [[0.2, 131], [0.43, 132]], 3: [[0.13, 128], [0.3, 129], [0.47, 130]], 4: [[0.1, 126], [0.24, 126], [0.38, 127], [0.52, 127]] }[Math.min(4, sl)];
      const [fx, y] = P[slot] || P[0];
      return { x: Math.round(W * fx), y };
    }
    // boss de raid : plus bas qu'un adversaire ordinaire, pour que sa tête (et son aura) restent dans le cadre
    if (this.battle?.alpha && sl === 1 && side === 1) return { x: Math.round(W * 0.7), y: 89 };
    if (this.battle?.isRaid && side === 1 && slot === 0) return { x: Math.round(W * (this.battle.monde ? 0.6 : 0.68)), y: 92 };
    if (sl === 1) return side === 1 ? { x: Math.round(W * 0.71), y: 86 } : { x: Math.round(W * 0.26), y: 140 };
    if (sl === 2) {
      const fx = [0.50, 0.74], fy = [65, 74], px = [0.16, 0.39], py = [118, 126];
      return side === 1 ? { x: Math.round(W * fx[slot]), y: fy[slot] } : { x: Math.round(W * px[slot]), y: py[slot] };
    }
    if (sl === 4) {   // raid à quatre : les joueurs en arc devant le boss
      const px = [0.12, 0.25, 0.38, 0.51], py = [104, 110, 116, 122];
      return side === 1 ? { x: Math.round(W * 0.68), y: 92 } : { x: Math.round(W * px[slot]), y: py[slot] };
    }
    const fx = [0.39, 0.56, 0.73], fy = [58, 65, 72], px = [0.12, 0.28, 0.44], py = [110, 116, 122];
    return side === 1 ? { x: Math.round(W * fx[slot]), y: fy[slot] } : { x: Math.round(W * px[slot]), y: py[slot] };
  }
  scaleFor(side, slot = 0) {
    const sl = this.slots || 1;
    let base = 1;
    if (this.battle?.isRaid && side === 0 && sl >= 2) base = { 2: [0.74, 0.72], 3: [0.66, 0.65, 0.64], 4: [0.6, 0.59, 0.58, 0.57] }[Math.min(4, sl)][slot] ?? 0.6;
    else if (this.battle?.isRaid && side === 1 && slot === 0) base = 1.0;
    else if (sl === 2) base = side === 1 ? (slot === 0 ? 0.80 : 0.86) : (slot === 0 ? 0.86 : 0.80);
    else if (sl === 4) base = side === 1 ? 0.7 : [0.74, 0.7, 0.66, 0.62][slot];
    else if (sl > 1) base = side === 1 ? [0.68, 0.73, 0.78][slot] : [0.78, 0.73, 0.68][slot];
    const isAlpha = (this.battle?.alpha && side === 1 && slot === 0) || !!this.battle?.act(side, slot)?.alpha;
    if (!isAlpha) return base;
    // un Alpha est plus grand que les autres, mais sa tête (et son aura) restent dans le cadre
    let grand = sl > 1 ? 1.15 : 1.25;
    const o = side === 1 ? this.spriteObj(side, slot) : null;
    if (o?.hautVu) grand = Math.max(1, Math.min(grand, (this.posFor(side, slot).y - 10) / (o.hautVu * base)));
    return base * grand;
  }
  ePos(slot = 0) { return this.posFor(1, slot); }
  pPos(slot = 0) { return this.posFor(0, slot); }
  spriteObj(side, slot = 0) { return this.st?.sides?.[side]?.[slot] || this.st?.[side === 1 ? 'foe' : 'me']; }
  sprCenter(side, slot = 0) {
    const p = this.posFor(side, slot), bs = this.scaleFor(side, slot);
    return { x: p.x, y: p.y - Math.round((side === 1 ? 30 : 36) * bs) };
  }

  /* ---------------- boucle d'animation ---------------- */
  frame = () => {
    if (!this.alive) return;
    const x = this.ctx, W = this.W, s = this.st, now = performance.now();
    x.setTransform(this.k || 1, 0, 0, this.k || 1, 0, 0);   // coordonnées de la scène (W × 192)
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, W, BH);
    x.save(); x.translate(Math.round(s.shakeX), Math.round(s.shakeY));
    const vivant = this.fond?.dessine(now);   // l'intérieur d'une faille, qui continue de défiler derrière le combat
    if (vivant) x.drawImage(vivant, 0, 0, W, BH);
    else if (this.bgImg) x.drawImage(this.bgImg, 0, 0, W, BH);
    else x.drawImage(this.bg, 0, 0);

    // Socles de combat (par emplacement)
    for (let slot = 0; slot < (this.slots || 1); slot++) {
      if (this.battle?.isRaid && slot > 0) continue;
      const eP = this.posFor(1, slot), bsE = this.scaleFor(1, slot) * (this.slots > 1 ? 0.85 : 1);
      if (this.platE) {
        const pw = this.platE.width * bsE, ph = this.platE.height * bsE;
        x.drawImage(this.platE, Math.round(eP.x + s.eSlide - pw / 2), Math.round(eP.y - ph * 0.52), Math.round(pw), Math.round(ph));
      } else {
        this.drawPlatform(x, eP.x + s.eSlide, eP.y, Math.round(58 * bsE), Math.round(13 * bsE), this.kind);
      }
    }
    for (let slot = 0; slot < (this.slots || 1); slot++) {
      const pP = this.posFor(0, slot), bsP = this.scaleFor(0, slot) * (this.slots > 1 ? 0.85 : 1);
      if (this.platP) {
        const pw = this.platP.width * bsP, ph = this.platP.height * bsP;
        x.drawImage(this.platP, Math.round(pP.x + s.pSlide - pw / 2), Math.round(pP.y - ph * 0.48), Math.round(pw), Math.round(ph));
      } else {
        this.drawPlatform(x, pP.x + s.pSlide, pP.y, Math.round(76 * bsP), Math.round(17 * bsP), this.kind);
      }
    }

    // Ombres au sol
    x.fillStyle = 'rgba(0,0,0,0.26)';
    for (const side of [1, 0]) {
      for (let slot = 0; slot < (this.slots || 1); slot++) {
        const o = this.spriteObj(side, slot), pos = this.posFor(side, slot), bs = this.scaleFor(side, slot);
        const slide = side === 1 ? s.eSlide : s.pSlide;
        if (o?.visible && o.scale > 0.3) {
          x.beginPath();
          x.ellipse(pos.x + slide + o.dx, pos.y + (side === 1 ? -1 : 4), (side === 1 ? 28 : 34) * o.scale * bs, (side === 1 ? 6 : 7) * bs, 0, 0, 7);
          x.fill();
        }
      }
    }

    // Traînées fantômes (attaques éclair / charges)
    for (const a of s.afterimages) {
      x.save();
      x.globalAlpha = Math.max(0, (a.life / a.max) * a.alpha);
      const im = a.tint ? (a._tinted || (a._tinted = tinted(a.img, a.tint))) : a.img;
      x.drawImage(im, Math.round(a.cx - a.w / 2), Math.round(a.cy - a.h), Math.round(a.w), Math.round(a.h));
      x.restore();
    }

    const drawSpr = (o, cx, cy, bs, mon, phaseOff, targetHighlight) => {
      if (!o?.visible || !o.img) return;
      if (o.blink && Math.floor(now / 70) % 2) return;
      let img = o.img;
      if (o.white > 0.01) img = o.whiteImg || (o.whiteImg = tinted(o.img, '#ffffff'));
      if (o.dark) img = o.darkImg || (o.darkImg = tinted(o.img, '#203048'));

      // Respiration vivante Gen 5 (adaptée au statut et aux PV bas)
      const slp = mon?.status === 'slp', par = mon?.status === 'par';
      const low = mon && mon.hp > 0 && mon.hp <= mon.stats[0] * 0.25;
      const spd = slp ? 0.002 : low ? 0.0075 : 0.0046;
      const wave = Math.sin(now * spd + phaseOff);
      // respiration : le sprite monte et descend d'un pixel entier (drawY arrondi), sans jamais être étiré : un sprite
      // redimensionné à chaque image fait onduler ses pixels
      const breathX = 1, breathY = 1;
      const jitX = par && Math.sin(now * 0.03 + phaseOff) > 0.92 ? (Math.sin(now) > 0 ? 1 : -1) : 0;

      const w = img.width * o.scale * bs * (o.sx || 1) * breathX;
      const h = img.height * o.scale * bs * (o.sy || 1) * breathY;
      const dy = o.dy + (o.dy === 0 && o.scale === 1 ? wave * 1.1 : 0);
      x.save(); x.globalAlpha = o.alpha;
      if (o.clipY != null) { x.beginPath(); x.rect(0, 0, W, cy + o.clipY); x.clip(); }
      // pattes au milieu de l'ombre (6 px au-dessus de l'ancre des sprites de face), quelle que soit la marge du sprite
      const sol = o.pied != null ? o.pied * (h / img.height) - 6 : 0;
      const drawX = Math.round(cx + o.dx + jitX), drawY = Math.round(cy + dy + sol);
      if (o.aura && !o.rot && !(o.white > 0.5) && !o.dark) {
        const fr = o.aura[Math.floor(now / 130) % o.aura.length], kx = w / img.width, ky = h / img.height;
        x.drawImage(fr, Math.round(drawX - w / 2 - AURA_PAD * kx), Math.round(drawY - h - AURA_PAD * ky), Math.round(fr.width * kx), Math.round(fr.height * ky));
      }
      if (o.rot) { x.translate(drawX, drawY); x.rotate(o.rot); x.drawImage(img, Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h)); }
      else x.drawImage(img, Math.round(drawX - w / 2), Math.round(drawY - h), Math.round(w), Math.round(h));
      if (o.white > 0.01 && o.white < 1 && o.img) {
        x.globalAlpha = o.alpha * (1 - o.white);
        if (o.rot) x.drawImage(o.img, Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h));
        else x.drawImage(o.img, Math.round(drawX - w / 2), Math.round(drawY - h), Math.round(w), Math.round(h));
      }
      x.restore();

      if (targetHighlight) {
        const pulse = 1 + Math.sin(now * 0.012) * 0.14;
        const cyMid = Math.round(drawY - h * 0.55);
        x.save();
        x.strokeStyle = '#ffea48'; x.lineWidth = 2;
        x.beginPath(); x.arc(drawX, cyMid, 16 * bs * pulse, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = '#ff4848'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(drawX - 20 * bs, cyMid); x.lineTo(drawX - 12 * bs, cyMid);
        x.moveTo(drawX + 12 * bs, cyMid); x.lineTo(drawX + 20 * bs, cyMid);
        x.moveTo(drawX, cyMid - 20 * bs); x.lineTo(drawX, cyMid - 12 * bs);
        x.moveTo(drawX, cyMid + 12 * bs); x.lineTo(drawX, cyMid + 20 * bs);
        x.stroke();
        x.restore();
      }
    };

    // Dresseur adverse
    const eMain = this.posFor(1, this.slots > 1 ? 1 : 0);
    drawSpr(s.trainer, eMain.x + s.eSlide, eMain.y + 6, 1, null, 0, false);

    // Aura mystique et Bouclier du Boss de Raid Co-op
    if (this.battle?.isRaid && this.spriteObj(1, 0)?.visible) {
      const rp = this.posFor(1, 0);
      const pulse = 1 + Math.sin(now * 0.005) * 0.08;
      x.save();
      x.strokeStyle = this.battle.shield?.active ? 'rgba(217, 70, 239, 0.72)' : 'rgba(250, 204, 21, 0.42)';
      x.lineWidth = this.battle.shield?.active ? 2.4 : 1.5;
      x.beginPath();
      x.ellipse(rp.x + s.eSlide, rp.y + 5, 42 * pulse, 12 * pulse, 0, 0, Math.PI * 2);
      x.stroke();
      if (this.battle.shield?.active) {
        x.strokeStyle = 'rgba(192, 132, 252, 0.38)';
        x.lineWidth = 2;
        x.beginPath();
        x.arc(rp.x + s.eSlide, rp.y - 26, 36 * pulse, 0, Math.PI * 2);
        x.stroke();
      }
      x.restore();
    }

    // Pokémon ennemis puis joueurs (ordre de profondeur)
    for (let slot = 0; slot < (this.slots || 1); slot++) {
      const p = this.posFor(1, slot), hl = this.targetHint && this.targetHint.side === 1 && this.targetHint.slot === slot;
      drawSpr(this.spriteObj(1, slot), p.x + s.eSlide, p.y + 8, this.scaleFor(1, slot), this.battle?.act({ side: 1, slot }), slot * 1.4, hl);
    }
    for (let slot = 0; slot < (this.slots || 1); slot++) {
      const p = this.posFor(0, slot), hl = this.targetHint && this.targetHint.side === 0 && this.targetHint.slot === slot;
      drawSpr(this.spriteObj(0, slot), p.x + s.pSlide, p.y + 18, this.scaleFor(0, slot), this.battle?.act({ side: 0, slot }), slot * 1.4 + 0.7, hl);
    }

    for (const b of s.balls) this.drawBall(x, b);

    // Particules météo ambiantes
    this.drawWeatherFx(x, W, now);

    // Particules d'attaques
    for (const p of s.parts) {
      x.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      x.fillStyle = p.c;
      if (p.shape === 'ring') { x.strokeStyle = p.c; x.lineWidth = 2; x.beginPath(); x.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, 7); x.stroke(); }
      else if (p.shape === 'bolt') { x.strokeStyle = p.c; x.lineWidth = p.lw || 2; x.beginPath(); x.moveTo(p.x, p.y); for (let k = 1; k < 5; k++) x.lineTo(p.x + (Math.random() - 0.5) * 10, p.y + k * 7); x.stroke(); }
      else if (p.shape === 'tornado') { x.save(); x.strokeStyle = p.c; x.lineWidth = p.lw || 2; x.beginPath(); x.ellipse(p.x, p.y, Math.max(1, p.r), Math.max(1, p.r * 0.32), p.tilt || 0, 0, Math.PI * 2); x.stroke(); x.restore(); }
      else if (p.shape === 'leaf') { x.save(); x.translate(p.x, p.y); x.rotate(p.a || 0); x.fillRect(-3, -1, 6, 3); x.restore(); }
      else if (p.shape === 'slash') {
        x.save(); x.strokeStyle = p.c; x.lineWidth = p.lw || 2.5; x.beginPath();
        const len = p.len || 16, ang = p.ang != null ? p.ang : (Math.PI / 4);
        x.moveTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
        x.lineTo(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len);
        x.stroke(); x.restore();
      } else if (p.shape === 'crystal') {
        x.save(); x.translate(p.x, p.y); x.rotate(p.a || 0); x.fillStyle = p.c; const cs = p.r || 3;
        x.beginPath(); x.moveTo(0, -cs); x.lineTo(cs * 0.7, 0); x.lineTo(0, cs); x.lineTo(-cs * 0.7, 0); x.closePath(); x.fill(); x.restore();
      } else if (p.shape === 'flame') {
        x.save(); x.translate(p.x, p.y); x.fillStyle = p.c; x.beginPath(); x.arc(0, 0, Math.max(1, p.r), 0, Math.PI * 2); x.fill(); x.restore();
      } else x.fillRect(Math.round(p.x - p.r), Math.round(p.y - p.r), Math.max(1, Math.round(p.r * 2)), Math.max(1, Math.round(p.r * 2)));
      x.globalAlpha = 1;
    }
    x.restore();
    if (s.screenFlash > 0) { x.fillStyle = `rgba(255,255,255,${s.screenFlash})`; x.fillRect(0, 0, W, BH); }
    if (s.wipe > 0) { x.fillStyle = '#000'; const h = BH / 2 * s.wipe; x.fillRect(0, 0, W, h); x.fillRect(0, BH - h, W, h); }

    const dt = this._lastFrameT ? Math.min(0.05, Math.max(0.001, (now - this._lastFrameT) / 1000)) : 1 / 60;
    this._lastFrameT = now;
    if (s.screenFlash > 0) s.screenFlash = Math.max(0, s.screenFlash - dt * 2.8);
    for (const a of s.afterimages) a.life -= dt;
    s.afterimages = s.afterimages.filter((a) => a.life > 0);
    const f = dt * 60;
    for (const p of s.parts) {
      if (p.spiral) {
        p.spiralAngle = (p.spiralAngle || 0) + (p.spiralSpd || 0.2) * f;
        p.spiralR = (p.spiralR || 0) + (p.spiralRGrow || 0) * f;
        p.x = p.cx + Math.cos(p.spiralAngle) * p.spiralR;
      } else {
        p.x += p.vx * f;
      }
      p.y += p.vy * f;
      p.vy += (p.g || 0) * f;
      p.life -= dt;
      if (p.grow) p.r += p.grow * f;
      if (p.a != null) p.a += (p.va != null ? p.va : 0.2) * f;
    }
    s.parts = s.parts.filter((p) => p.life > 0);
    requestAnimationFrame(this.frame);
  };

  drawWeatherFx(x, W, now) {
    // la météo du combat passe devant ; sans elle, le décor du lieu (cendres de Cendrelune : sans effet sur le combat).
    // L'air d'un lieu (spores, sable, cendres violettes…) flotte aussi sous une vraie météo : elle est dessinée par-dessus
    const w0 = this.battle?.weather, reel = !!w0 && w0 !== 'none';
    if (reel && AIRS.has(this.meteoDecor)) this.dessinerMeteo(x, W, now, this.meteoDecor);
    this.dessinerMeteo(x, W, now, reel ? w0 : this.meteoDecor);
  }
  dessinerMeteo(x, W, now, w) {
    if (!w || w === 'none') return;
    x.save();
    if (w === 'ash') {
      // cendres : flocons gris qui tombent en biais, quelques braises qui montent
      for (let i = 0; i < 30; i++) {
        const px = ((i * 59 + now * 0.03 + Math.sin(now * 0.0015 + i) * 9) % (W + 20) + W + 20) % (W + 20) - 10;
        const py = ((i * 41 + now * 0.05) % (BH + 10)) - 5;
        x.fillStyle = i % 4 === 0 ? 'rgba(120, 112, 110, 0.6)' : 'rgba(200, 194, 190, 0.5)';
        x.fillRect(Math.round(px), Math.round(py), i % 5 === 0 ? 3 : 2, 2);
      }
      for (let i = 0; i < 8; i++) {
        const px = (i * 97 + Math.sin(now * 0.002 + i * 2) * 12 + W) % W;
        const py = BH - ((i * 53 + now * 0.04) % (BH * 0.8));
        x.fillStyle = `rgba(255, ${150 + (i % 3) * 30}, 60, ${0.5 + 0.3 * Math.sin(now * 0.006 + i)})`;
        x.fillRect(Math.round(px), Math.round(py), 2, 2);
      }
      x.restore(); return;
    }
    // l'air des arènes du Sud et d'Ombreval (décor seulement). Sable : grains dorés qui filent ; spores : grains verts et
    // violets qui montent en flottant ; ombre : cendres violettes qui tombent ; étincelles : gerbes orange qui retombent ;
    // paillettes : éclats roses qui scintillent ; vent : traits blancs qui traversent
    if (w === 'sable' || w === 'spores' || w === 'ombre' || w === 'etincelles' || w === 'paillettes' || w === 'vent') {
      const mod = (a, b) => ((a % b) + b) % b;
      if (w === 'sable') for (let i = 0; i < 22; i++) {
        x.fillStyle = i % 3 ? 'rgba(232, 196, 128, 0.4)' : 'rgba(250, 226, 170, 0.5)';
        x.fillRect(Math.round(mod(i * 71 + now * 0.16, W + 20) - 10), Math.round(mod(i * 29 + Math.sin(now * 0.002 + i) * 6, BH)), i % 4 === 0 ? 3 : 2, 1);
      }
      else if (w === 'spores') for (let i = 0; i < 20; i++) {
        x.fillStyle = i % 3 === 0 ? `rgba(190, 140, 240, ${0.35 + 0.25 * Math.sin(now * 0.003 + i)})` : `rgba(150, 220, 130, ${0.35 + 0.25 * Math.sin(now * 0.004 + i * 2)})`;
        x.fillRect(Math.round(mod(i * 83 + Math.sin(now * 0.0012 + i * 1.7) * 14, W)), Math.round(BH - mod(i * 47 + now * 0.012, BH + 8)), 2, 2);
      }
      else if (w === 'ombre') for (let i = 0; i < 24; i++) {
        x.fillStyle = i % 4 === 0 ? 'rgba(200, 150, 255, 0.5)' : 'rgba(120, 90, 170, 0.45)';
        x.fillRect(Math.round(mod(i * 59 + now * 0.012 + Math.sin(now * 0.0013 + i) * 10, W + 20) - 10), Math.round(mod(i * 41 + now * 0.03, BH + 10) - 5), i % 5 === 0 ? 3 : 2, 2);
      }
      else if (w === 'etincelles') for (let i = 0; i < 14; i++) {
        const t = mod(now * 0.0009 + i * 0.37, 1), cote = i % 2 ? W - 6 : 6, vx = (i % 2 ? -1 : 1) * (18 + (i * 13) % 40);
        x.fillStyle = `rgba(255, ${170 + (i % 3) * 30}, 70, ${0.8 * (1 - t)})`;
        x.fillRect(Math.round(cote + vx * t), Math.round(BH * (0.45 + (i % 5) * 0.06) - 46 * t + 70 * t * t), 2, 2);
      }
      else if (w === 'paillettes') for (let i = 0; i < 16; i++) {
        const a = 0.5 + 0.5 * Math.sin(now * 0.004 + i * 1.9); if (a < 0.25) continue;
        const px = Math.round(mod(i * 97 + Math.sin(now * 0.0007 + i) * 6, W)), py = Math.round(mod(i * 53 + now * 0.008, BH));
        x.fillStyle = i % 3 ? `rgba(255, 190, 228, ${a * 0.8})` : `rgba(255, 255, 255, ${a * 0.9})`;
        x.fillRect(px - 1, py, 3, 1); x.fillRect(px, py - 1, 1, 3);
      }
      else for (let i = 0; i < 9; i++) {
        const px = mod(i * 131 + now * (0.22 + (i % 3) * 0.05), W + 80) - 40, py = Math.round(mod(i * 37 + Math.sin(now * 0.001 + i) * 5, BH * 0.9));
        x.fillStyle = 'rgba(255, 255, 255, 0.32)'; x.fillRect(Math.round(px), py, 14 + (i % 3) * 8, 1);
      }
      x.restore(); return;
    }
    if (w === 'rain') {
      x.strokeStyle = 'rgba(160, 210, 255, 0.45)'; x.lineWidth = 1;
      for (let i = 0; i < 24; i++) {
        const px = ((i * 53 + now * 0.25) % (W + 40)) - 20;
        const py = ((i * 37 + now * 0.45) % (BH + 20)) - 10;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px - 5, py + 11); x.stroke();
      }
    } else if (w === 'sun') {
      const a = 0.08 + Math.sin(now * 0.002) * 0.03;
      const g = x.createRadialGradient(W * 0.85, 10, 4, W * 0.6, 60, W * 0.8);
      g.addColorStop(0, `rgba(255, 240, 150, ${a * 2.2})`); g.addColorStop(1, 'rgba(255, 200, 80, 0)');
      x.fillStyle = g; x.fillRect(0, 0, W, BH);
    } else if (w === 'sandstorm') {
      x.fillStyle = 'rgba(218, 178, 104, 0.42)';
      for (let i = 0; i < 26; i++) {
        const px = ((i * 71 + now * 0.28) % (W + 20)) - 10;
        const py = (i * 29 + Math.sin(now * 0.003 + i) * 8) % BH;
        x.fillRect(Math.round(px), Math.round(py), 3, 2);
      }
    } else if (w === 'hail') {
      x.fillStyle = 'rgba(235, 248, 255, 0.72)';
      for (let i = 0; i < 20; i++) {
        const px = ((i * 61 + now * 0.08) % W);
        const py = ((i * 43 + now * 0.22) % BH);
        x.fillRect(Math.round(px), Math.round(py), 2, 2);
      }
    }
    x.restore();
  }

  drawBall(x, b) {
    const itemKey = b.item || 'poke-ball', propre = itemKey === 'poke-ball';
    const imgKey = b.state && propre ? b.state : itemKey;
    const img = this.ballImgs?.[imgKey] || this.ballImgs?.[itemKey] || null;
    const penche = !propre && (b.state === 'tilt-l' ? -0.45 : b.state === 'tilt-r' ? 0.45 : 0);
    if (b.groundY != null && b.groundY > b.y) {
      const dist = Math.max(0, b.groundY - b.y);
      x.save(); x.fillStyle = `rgba(0,0,0,${Math.max(0.12, 0.45 - dist * 0.0035)})`;
      const rx = Math.max(3, 8 - dist * 0.05);
      x.beginPath(); x.ellipse(Math.round(b.x), Math.round(b.groundY), rx, Math.max(1.5, rx * 0.4), 0, 0, Math.PI * 2); x.fill(); x.restore();
    }
    x.save(); x.translate(Math.round(b.x), Math.round(b.y));
    if (b.rot || penche) x.rotate((b.rot || 0) + penche);
    const size = 18;
    if (img) { x.imageSmoothingEnabled = false; x.drawImage(img, Math.round(-size / 2), Math.round(-size / 2), size, size); }
    else {
      const [top, bot] = BALL_COL[itemKey] || BALL_COL['poke-ball'];
      x.fillStyle = '#181e28'; x.beginPath(); x.arc(0, 0, 5.5, 0, 7); x.fill();
      x.fillStyle = top; x.beginPath(); x.arc(0, 0, 4.5, Math.PI, 0); x.fill();
      x.fillStyle = bot; x.beginPath(); x.arc(0, 0, 4.5, 0, Math.PI); x.fill();
      x.fillStyle = '#181e28'; x.fillRect(-5, -0.6, 10, 1.2); x.fillStyle = '#fff'; x.fillRect(-1.2, -1.2, 2.4, 2.4);
    }
    x.restore();
  }

  tween(ms, fn) { return new Promise((res) => { const t0 = performance.now(); const step = () => { const u = Math.min(1, (performance.now() - t0) / ms); fn(u); if (u < 1) requestAnimationFrame(step); else res(); }; step(); }); }
  burst(cx, cy, cols, n = 14, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 1.6) * (0.4 + Math.random());
      this.st.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - (o.up || 0), r: o.r || 1.5 + Math.random() * 1.5, c: cols[i % cols.length], life: o.life || 0.45, max: o.life || 0.45, g: o.g || 0, shape: o.shape });
    }
  }

  /* ---------------- interface HTML ---------------- */
  buildDom() {
    const sl = this.slots || 1;
    const r = el('div', `battle slots-${sl}${sl > 1 ? ' multi' : ''}${this.battle?.monde ? ' raid-monde' : ''}`); this.root = r;
    // dessiné à un multiple entier de la scène (192 px de haut ×4 en 720p), au pixel près, puis à peine réduit par le
    // navigateur pour remplir l'écran : tous les pixels ont la même taille (agrandi directement ×3,75, ils faisaient
    // tantôt 3, tantôt 4 points)
    this.k = Math.max(1, Math.ceil(innerHeight / BH));
    const cv = el('canvas', 'bcv'); cv.width = this.W * this.k; cv.height = BH * this.k; r.appendChild(cv);
    this.ctx = cv.getContext('2d');
    if (sl === 1) {
      r.insertAdjacentHTML('beforeend', `
        <div class="bhud foe">
          <div class="bh-head"><div class="bh-balls"></div><div class="bh-types"></div></div>
          <div class="bh-top"><span class="bh-name"></span><span class="bh-lv"></span></div>
          <div class="bh-mid"><span class="bh-st"></span><div class="bh-hp"><b>PV</b><i><u></u></i></div></div>
          <div class="bh-caught" title="Déjà capturé"></div>
          <div class="bh-boosts"></div>
        </div>
        <div class="bhud me">
          <div class="bh-head"><div class="bh-balls"></div><div class="bh-types"></div></div>
          <div class="bh-top"><span class="bh-name"></span><span class="bh-lv"></span></div>
          <div class="bh-mid"><span class="bh-st"></span><div class="bh-hp"><b>PV</b><i><u></u></i></div></div>
          <div class="bh-bot"><div class="bh-exp-wrap"><b>EXP</b><div class="bh-exp"><i><u></u></i></div></div><div class="bh-hpn"></div></div>
          <div class="bh-boosts"></div>
        </div>`);
      this.hud = { foe: [r.querySelector('.bhud.foe')], me: [r.querySelector('.bhud.me')] };
    } else {
      const cardHtml = (side, k) => side === 1
        ? `<div class="bhud-card foe" data-side="1" data-slot="${k}">
            <div class="bh-top"><span class="bh-name"></span><span class="bh-types"></span><span class="bh-lv"></span></div>
            <div class="bh-mid"><span class="bh-st"></span><div class="bh-hp"><b>PV</b><i><u></u></i></div></div>
            <div class="bh-caught"></div><div class="bh-boosts"></div>
          </div>`
        : `<div class="bhud-card me" data-side="0" data-slot="${k}">
            <div class="bh-top"><span class="bh-name"></span><span class="bh-types"></span><span class="bh-lv"></span></div>
            <div class="bh-mid"><span class="bh-st"></span><div class="bh-hp"><b>PV</b><i><u></u></i></div></div>
            <div class="bh-bot"><div class="bh-exp-wrap"><div class="bh-exp"><i><u></u></i></div></div><div class="bh-hpn"></div></div>
            <div class="bh-boosts"></div>
          </div>`;
      const fmtCls = this.battle?.isRaid ? ' raid' : this.battle?.is4p ? ' multi4p' : '';
      const fmtTxt = this.battle?.isRaid ? (this.battle.monde ? `💥 RAID LÉGENDAIRE · ${sl} DRESSEURS` : '🐉 RAID CO-OP') : this.battle?.is4p ? '⚔️ MULTI DUO · 4 DRESSEURS' : sl === 3 ? 'COMBAT TRIO' : 'COMBAT DUO';
      r.insertAdjacentHTML('beforeend', `
        <div class="battle-format-badge${fmtCls}">${fmtTxt}</div>
        <div class="bhud-stack foe">
          <div class="bhud-party-strip foe"><div class="bh-balls"></div></div>
          ${Array.from({ length: this.battle?.isRaid ? 1 : sl }, (_, k) => cardHtml(1, k)).join('')}
        </div>
        <div class="bhud-stack me">
          ${Array.from({ length: sl }, (_, k) => cardHtml(0, k)).join('')}
          <div class="bhud-party-strip me"><div class="bh-balls"></div></div>
        </div>`);
      this.hud = {
        foe: [...r.querySelectorAll('.bhud-card.foe')],
        me: [...r.querySelectorAll('.bhud-card.me')],
      };
    }
    r.insertAdjacentHTML('beforeend', `
      <div class="battle-weather-badge" style="display:none"></div>
      <div class="battle-anomaly-badge" style="display:none"></div>
      <div class="dlg box btext"><div class="dlg-name" style="display:none"></div><div class="dlg-txt"></div><div class="dlg-arrow">▼</div></div>
      <div class="bcmd"></div>`);
    this.game.ui.root.appendChild(r);
    this.textBox = r.querySelector('.btext'); this.cmd = r.querySelector('.bcmd');
    this.weatherBadge = r.querySelector('.battle-weather-badge');
    this.anomalyBadge = r.querySelector('.battle-anomaly-badge');
  }
  hudFor(side, slot = 0) { return (side === 1 ? this.hud?.foe : this.hud?.me)?.[slot] || null; }

  updateAnomaly() {
    if (!this.anomalyBadge) this.anomalyBadge = this.root?.querySelector('.battle-anomaly-badge');
    if (!this.anomalyBadge) return;
    const b = this.battle;
    const info = b?.inverse ? { cls: 'inverse', icon: '⚡', label: b.alpha ? 'Inversé · Alpha' : 'Types Inversés' }
      : b?.chaosWeather ? { cls: 'chaos', icon: '🌀', label: b.alpha ? 'Chaos · Alpha' : 'Météo Chaotique' }
        : b?.alpha ? { cls: 'alpha', icon: '🔥', label: 'Alpha Géant' }
          : null;
    if (!info) {
      this.anomalyBadge.style.display = 'none';
      this.anomalyBadge.className = 'battle-anomaly-badge';
      return;
    }
    this.anomalyBadge.innerHTML = `<span class="bab-icon">${info.icon}</span><span class="bab-label">${info.label}</span>`;
    this.anomalyBadge.className = `battle-anomaly-badge ${info.cls}`;
    this.anomalyBadge.style.display = 'flex';
  }

  updateWeather(w) {
    if (!this.weatherBadge) this.weatherBadge = this.root?.querySelector('.battle-weather-badge');
    if (!this.weatherBadge) return;
    if (!w || w === 'none') { this.weatherBadge.style.display = 'none'; this.weatherBadge.className = 'battle-weather-badge'; return; }
    const W_INFO = { rain: { icon: '🌧️', label: 'Pluie' }, sun: { icon: '☀️', label: 'Zénith' }, sandstorm: { icon: '🌪️', label: 'Sable' }, hail: { icon: '❄️', label: 'Grêle' } };
    const info = W_INFO[w] || { icon: '⛅', label: w };
    this.weatherBadge.innerHTML = `<span class="bwb-icon">${info.icon}</span><span class="bwb-label">${info.label}</span>`;
    this.weatherBadge.className = `battle-weather-badge ${w}`;
    this.weatherBadge.style.display = 'flex';
  }
  renderPartyBalls(side) {
    const party = this.battle?.sides?.[side]?.party || [];
    if (side === 1 && this.battle?.wild) return '<span class="bh-wild-tag">SAUVAGE</span>';
    return [0, 1, 2, 3, 4, 5].map((idx) => {
      const p = party[idx];
      const st = !p ? 'empty' : p.hp <= 0 ? 'ko' : p.status ? 'status' : 'ok';
      return `<img class="bh-ball" src="img/battle/ball_${st}.png" alt="">`;
    }).join('');
  }
  refreshBalls(side) {
    if (this.slots > 1) {
      const bEl = this.root?.querySelector(`.bhud-party-strip.${side === 1 ? 'foe' : 'me'} .bh-balls`);
      if (bEl) bEl.innerHTML = this.renderPartyBalls(side);
    } else {
      const bEl = this.hudFor(side, 0)?.querySelector('.bh-balls');
      if (bEl) bEl.innerHTML = this.renderPartyBalls(side);
    }
  }
  showBoosts(side, slot) {
    const list = slot != null ? [slot] : Array.from({ length: this.slots || 1 }, (_, k) => k);
    for (const k of list) {
      const h = this.hudFor(side, k), box = h?.querySelector('.bh-boosts'); if (!box) continue;
      const st = this.boostSlots?.[side]?.[k] || (k === 0 ? this.boosts?.[side] : null) || [];
      box.innerHTML = BOOST_NAMES.map((n, j) => { const c = st[j + 1] || 0; return c ? `<span class="bh-boost ${c > 0 ? 'up' : 'down'}">${n} ${c > 0 ? '+' : '−'}${Math.abs(c)}</span>` : ''; }).join('');
    }
  }
  setHud(side, m, hp, slot = 0) {
    if (m && hp == null) hp = m.hp;
    const h = this.hudFor(side, slot); if (!h) return;
    if (!m) { h.style.visibility = 'hidden'; return; }
    if (side === 1 && !this.seenInBattle?.has(m.uid || m.sp)) { this.seenInBattle?.add(m.uid || m.sp); this.game.markSeen(m.sp); }
    h.style.visibility = '';
    const g = m.gender === 'm' ? '<span class="g m">♂</span>' : m.gender === 'f' ? '<span class="g f">♀</span>' : '';
    const coopOwner = this.battle?.sideOwnerNames?.[side]?.[slot] || (side === 0 && this.battle?.coop ? this.battle.ownerNames?.[slot] : null);
    const trainerTag = this.spectator && slot === 0 && this.battle?.sides?.[side]?.name
      ? `<span class="bh-trainer-tag">${esc(this.battle.sides[side].name)} :</span> `
      : coopOwner
        ? `<span class="bh-trainer-tag">${esc(coopOwner)} ·</span> `
        : '';
    const alphaTag = m.alpha ? '<span class="bh-alpha-tag">ALPHA</span>' : '';
    h.querySelector('.bh-name').innerHTML = trainerTag + alphaTag + esc(monName(m)) + g;
    h.querySelector('.bh-lv').textContent = 'N.' + m.lvl;
    const typesEl = h.querySelector('.bh-types');
    if (typesEl) {
      if (side === 0 || this.game.isSpeciesKnown(m.sp)) {
        typesEl.innerHTML = (SPECIES[m.sp]?.t || ['normal']).map((t) => `<span class="bh-type" style="--tc:${TYPE_COL[t] || '#888'}">${TYPE_FR[t] || t}</span>`).join('');
      } else {
        typesEl.innerHTML = `<span class="bh-type unknown" title="Type inconnu">???</span>`;
      }
    }
    this.refreshBalls(side);
    const st = h.querySelector('.bh-st'), S = m.hp > 0 && m.status ? STATUS_FR[m.status] : null;
    st.textContent = S ? S[0] : ''; st.style.background = S ? S[1] : 'transparent'; st.style.display = S ? '' : 'none';
    this.setHp(side, hp, m.stats[0], slot);
    if (side === 0) h.querySelector('.bh-exp u').style.width = expProgress(m, this.game.levelCap()) * 100 + '%';
    if (side === 1) h.querySelector('.bh-caught')?.classList.toggle('on', this.game.state.dex.caught.includes(m.sp) && this.battle.wild);
  }
  setHp(side, hp, max, slot = 0) {
    const h = this.hudFor(side, slot); if (!h) return;
    const r = Math.max(0, hp / max), u = h.querySelector('.bh-hp u');
    u.style.width = r * 100 + '%'; u.style.background = hpCol(r);
    if (side === 0) h.querySelector('.bh-hpn').textContent = `${Math.max(0, Math.round(hp))} / ${max}`;
  }
  highlightActor(slot) {
    this.hud?.me?.forEach((c, k) => c.classList.toggle('actor-now', k === slot));
  }

  async msg(text, o = {}) { await this.ui.typePage(this.textBox, text, { auto: o.wait ? 0 : 750 }); }

  initState() {
    this._lastFrameT = 0;
    const mk = () => Array.from({ length: this.slots }, freshSpr);
    this.st = {
      shakeX: 0, shakeY: 0, eSlide: -this.W, pSlide: this.W, screenFlash: 0, wipe: 0, parts: [], balls: [], afterimages: [],
      sides: [mk(), mk()],
      trainer: freshSpr(),
    };
    this.st.me = this.st.sides[0][0];
    this.st.foe = this.st.sides[1][0];
  }

  /* ---------------- lancement ---------------- */
  async run(battle, o = {}) {
    this.battle = battle; this.slots = battle.slots || 1; this.kind = o.bg || 'grass'; this.alive = true; this.fond = o.fond || null; this.teinte = o.teinte || null; this.meteoDecor = o.meteoDecor || null;
    this.lastMove = 0; this.lastMoveMon = null;
    this.seenInBattle = new Set();
    this.W = Math.max(256, Math.min(420, Math.round(BH * innerWidth / innerHeight)));
    this.bg = this.makeBg(this.kind, o.night);
    this.boosts = null; this.boostSlots = null;
    this.initState();
    this.buildDom();
    this.root.style.setProperty('--bp', (innerHeight / BH) + 'px');
    this.updateWeather(battle.weather);
    this.updateAnomaly();
    for (let sl = 0; sl < this.slots; sl++) { this.setHud(1, null, 0, sl); this.setHud(0, null, 0, sl); }
    const jobs = [this.loadBattleDecor(this.kind, o.night, this.teinte)];
    for (let sl = 0; sl < this.slots; sl++) { jobs.push(this.loadSide(1, sl), this.loadSide(0, sl)); }
    await Promise.all(jobs);
    if (battle.sides[1].trainer) this.st.trainer.img = await loadImg(ASSETS.trainer(battle.sides[1].trainer.bs));
    requestAnimationFrame(this.frame);
    if (o.curtain?.open) o.curtain.open(); else if (o.curtain?.remove) o.curtain.remove();
    this.st.screenFlash = 0;
    if (battle.wild) {
      for (const sl of battle.aliveSlots(1)) { const oF = this.spriteObj(1, sl); oF.visible = true; oF.dark = true; }
    } else this.st.trainer.visible = true;
    await this.tween(700, (u) => { const e = ease(u); this.st.eSlide = -this.W * (1 - e); this.st.pSlide = this.W * (1 - e); });
    if (battle.wild) {
      for (const sl of battle.aliveSlots(1)) {
        const m = battle.monAt(1, sl), oF = this.spriteObj(1, sl);
        oF.dark = false; this.setHud(1, m, m.hp, sl);
      }
      this.sound.cry(ASSETS.cry(battle.foe.sp));
    }
    const evs = battle.start();
    await this.play(evs);
    while (battle.state !== 'over') {
      if (battle.state === 'switch') { await this.forcedSwitch(); continue; }
      const action = await this.chooseAction();
      if (!action) continue;
      await this.play(battle.playerAction(action));
    }
    await wait(300);
    return battle.result;
  }

  /* ---------------- mode spectateur ---------------- */
  async runSpectate(specSession, o = {}) {
    const p0 = specSession.p0, p1 = specSession.p1;
    const sl = specSession.slots || 1;
    const b = {
      pvp: true, spectator: true, slots: sl, state: 'choose',
      weather: specSession.weather || 'none', weatherTurns: specSession.weatherTurns || 0, turn: specSession.turn || 0,
      sides: [
        { name: p0.name, trainer: { cls: 'Dresseur', name: p0.name, bs: p0.bs || 'calem', prize: 0 }, party: p0.party || [], active: p0.active ?? 0, activeSlots: p0.activeSlots || [p0.active ?? 0], v: { st: p0.st ? [...p0.st] : [0, 0, 0, 0, 0, 0, 0, 0] } },
        { name: p1.name, trainer: { cls: 'Dresseur', name: p1.name, bs: p1.bs || 'serena', prize: 0 }, party: p1.party || [], active: p1.active ?? 0, activeSlots: p1.activeSlots || [p1.active ?? 0], v: { st: p1.st ? [...p1.st] : [0, 0, 0, 0, 0, 0, 0, 0] } },
      ],
      monAt(side, s = 0) { const sd = this.sides[side]; const i = sd?.activeSlots?.[s] ?? sd?.active; return sd?.party?.[i] || null; },
      act(ref, sArg) { const r = typeof ref === 'number' ? { side: ref, slot: sArg ?? 0 } : ref; return this.monAt(r.side, r.slot); },
      aliveSlots(side) { return Array.from({ length: sl }, (_, k) => k).filter((k) => { const m = this.monAt(side, k); return m && m.hp > 0; }); },
      get me() { return this.act(0); },
      get foe() { return this.act(1); },
      stages() { return [this.sides[0].v.st, this.sides[1].v.st]; },
    };
    this.battle = b; this.slots = sl; this.spectator = true; this.kind = o.bg || specSession.bg || 'grass'; this.alive = true;
    this.W = Math.max(256, Math.min(420, Math.round(BH * innerWidth / innerHeight)));
    this.bg = this.makeBg(this.kind, o.night ?? specSession.night);
    this.boosts = [b.sides[0].v.st, b.sides[1].v.st];
    this.initState(); this.st.eSlide = 0; this.st.pSlide = 0;
    this.buildDom();
    this.root.style.setProperty('--bp', (innerHeight / BH) + 'px');
    this.updateWeather(b.weather);
    this.game.sound.play('trainer');
    const jobs = [this.loadBattleDecor(this.kind, o.night ?? specSession.night)];
    for (let k = 0; k < sl; k++) jobs.push(this.loadSide(1, k), this.loadSide(0, k));
    await Promise.all(jobs);
    requestAnimationFrame(this.frame);
    for (const side of [0, 1]) for (let k = 0; k < sl; k++) {
      const m = b.monAt(side, k);
      if (m && m.hp > 0) { this.spriteObj(side, k).visible = true; this.setHud(side, m, m.hp, k); }
      else this.setHud(side, null, 0, k);
    }
    this.showBoosts(0); this.showBoosts(1);
    const banner = el('div', 'spectator-banner');
    banner.innerHTML = `<div class="spec-live-pill"><span class="spec-dot">●</span> EN DIRECT</div><div class="spec-matchup">${esc(p0.name)} <small>vs</small> ${esc(p1.name)}</div><button type="button" class="spec-leave-btn" title="Quitter (Échap)">Quitter ✕</button>`;
    this.root.appendChild(banner);
    let spectatorQuit = false;
    const leave = () => { if (!spectatorQuit) { spectatorQuit = true; specSession.leave?.(); } };
    banner.querySelector('.spec-leave-btn').onclick = leave;
    const popInput = this.game.input.push((k) => { if (k === 'b' || k === 'cancel') leave(); });
    try {
      this.cmd.innerHTML = `<div class="spec-cmd-box"><div class="spec-cmd-title">👁️ MODE SPECTATEUR</div><div class="spec-cmd-status">Combat entre ${esc(p0.name)} et ${esc(p1.name)}</div><button type="button" class="spec-cmd-quit-btn">Quitter le combat</button></div>`;
      this.cmd.querySelector('.spec-cmd-quit-btn').onclick = leave;
      await this.msg(`Tu observes le combat en direct entre ${p0.name} et ${p1.name} !`);
      while (!spectatorQuit && b.state !== 'over') {
        this.ui.typePage(this.textBox, `En attente du tour ${b.turn + 1} de ${p0.name} et ${p1.name}…`, { last: true });
        const msg = await specSession.waitNext();
        if (spectatorQuit) break;
        if (!msg || msg.t === 'left' || msg.t === 'timeout') { await this.msg("Le combat s'est arrêté ou la connexion avec l'hôte a été interrompue."); await wait(1200); break; }
        if (msg.t === 'spec_ev') { b.turn = msg.turn ?? (b.turn + 1); await this.playSpecEvs(msg.events); }
        if (msg.t === 'spec_end') { if (msg.events?.length) await this.playSpecEvs(msg.events); b.state = 'over'; await this.msg(msg.winner ? `${msg.winner} remporte le combat !` : "Le combat est terminé !", { wait: true }); await wait(1800); break; }
      }
    } finally {
      popInput();
      this.spectator = false;
    }
  }

  async playSpecEvs(evs) {
    if (!evs?.length) return;
    for (const e of evs) {
      const slot = e.slot ?? 0;
      if (e.t === 'send' && Number.isInteger(e.side) && Number.isInteger(e.idx)) {
        const s = this.battle.sides[e.side]; if (s) { if (s.activeSlots) s.activeSlots[slot] = e.idx; else s.active = e.idx; }
      } else if (e.t === 'hp' && Number.isInteger(e.side)) { const m = this.battle.act(e.side, slot); if (m) m.hp = e.hp; }
      else if (e.t === 'faint' && Number.isInteger(e.side)) { const m = this.battle.act(e.side, slot); if (m) m.hp = 0; }
      else if (e.t === 'status' && Number.isInteger(e.side)) { const m = this.battle.act(e.side, slot); if (m) m.status = e.status; }
    }
    await this.play(evs);
  }

  async runPvp(battle, duel, o = {}) {
    this.battle = battle; this.slots = battle.slots || 1; this.kind = o.bg || 'grass'; this.alive = true;
    this.W = Math.max(256, Math.min(420, Math.round(BH * innerWidth / innerHeight)));
    this.bg = this.makeBg(this.kind, o.night);
    this.boosts = null; this.boostSlots = null;
    this.initState();
    this.buildDom();
    this.root.style.setProperty('--bp', (innerHeight / BH) + 'px');
    this.updateWeather(battle.weather);
    this.updateAnomaly();
    for (let sl = 0; sl < this.slots; sl++) { this.setHud(1, null, 0, sl); this.setHud(0, null, 0, sl); }
    const jobs = [this.loadBattleDecor(this.kind, o.night)];
    for (let sl = 0; sl < this.slots; sl++) jobs.push(this.loadSide(1, sl), this.loadSide(0, sl));
    await Promise.all(jobs);
    this.st.trainer.img = await loadImg(ASSETS.trainer(battle.sides[1].trainer.bs));
    requestAnimationFrame(this.frame);
    this.st.trainer.visible = true;
    await this.tween(700, (u) => { const e = ease(u); this.st.eSlide = -this.W * (1 - e); this.st.pSlide = this.W * (1 - e); });
    const startEvs = battle.start();
    await this.play(startEvs);
    duel.broadcastEvents?.(startEvs);
    const waiting = () => this.ui.typePage(this.textBox, `En attente de ${duel.foeName}…`, { last: true });
    const lost = async (r) => {
      if (r.mine) { const stopEvs = battle.stop('lose', 'Tu abandonnes le combat...'); await this.play(stopEvs); duel.broadcastEvents?.(stopEvs, true, duel.foeName); return; }
      const why = r.quit ? `${duel.foeName} abandonne le combat !` : r.left ? `${duel.foeName} a quitté la partie.` : r.desync ? 'La connexion a mélangé le combat : il s\'arrête ici, sans vainqueur.' : `${duel.foeName} ne répond plus.`;
      const stopEvs = battle.stop(r.desync ? 'draw' : 'win', why);
      await this.play(stopEvs); duel.broadcastEvents?.(stopEvs, true, r.quit ? battle.sides[0].name : duel.foeName);
    };
    while (battle.state !== 'over') {
      if (battle.state === 'switch') {
        const n = battle.turn;
        let mine = null;
        if (battle.need[0]) mine = await this.pickReplacementList(battle.needSlots?.[0]?.length ? battle.needSlots[0] : [0]);
        if (this.slots === 1 && Array.isArray(mine)) mine = mine[0];
        duel.sendSwitch(n, mine);
        if (battle.need[1]) waiting();
        const r = await duel.waitSwitch(n);
        if (r.idx === undefined) { await lost(r); break; }
        const swEvs = battle.switchBoth(mine, r.idx);
        await this.play(swEvs); duel.broadcastEvents?.(swEvs);
        continue;
      }
      const action = await this.chooseAction();
      if (!action) continue;
      if (action.type === 'forfeit' || (Array.isArray(action) && action.some((a) => a.type === 'forfeit'))) {
        duel.sendQuit(); const stopEvs = battle.stop('lose', 'Tu abandonnes le combat...');
        await this.play(stopEvs); duel.broadcastEvents?.(stopEvs, true, duel.foeName); break;
      }
      const n = battle.turn + 1, sum = battle.checksum();
      duel.sendAct(n, action, sum);
      waiting();
      const r = await duel.waitAct(n);
      if (!r.action) { await lost(r); break; }
      if (r.sum !== sum) { await lost({ desync: true }); break; }
      battle.remote = r.action;
      const actEvs = battle.playerAction(action);
      await this.play(actEvs);
      const isOver = battle.state === 'over';
      duel.broadcastEvents?.(actEvs, isOver, isOver ? (battle.result === 'win' ? battle.sides[0].name : duel.foeName) : null);
    }
    await wait(300);
    return battle.result;
  }

  /** Sélectionne la cible d'une capacité en Duo / Trio (renvoie `null` si l'utilisateur annule) */
  async _pickMoveTarget(ref, M) {
    const b = this.battle;
    let targetSide = 1, targetSlot = b.aliveSlots(1)[0] ?? 0;
    if (this.slots <= 1) return { targetSide, targetSlot };
    if (M?.tg === 3) {
      const allies = b.validAllyTargets(ref);
      if (allies.length > 1) {
        const p = await this.targetMenu(ref, M, allies, true);
        return p ? { targetSide: p.side, targetSlot: p.slot } : null;
      }
      if (allies.length === 1) return { targetSide: allies[0].side, targetSlot: allies[0].slot };
    } else if (M && M.tg !== 7 && M.tg !== 4 && M.tg !== 13 && M.tg !== 12 && M.tg !== 14 && M.tg !== 9 && M.tg !== 11 && M.tg !== 8) {
      const foes = b.validFoeTargets(ref, M);
      if (foes.length > 1) {
        const p = await this.targetMenu(ref, M, foes, false);
        return p ? { targetSide: p.side, targetSlot: p.slot } : null;
      }
      if (foes.length === 1) return { targetSide: foes[0].side, targetSlot: foes[0].slot };
    }
    return { targetSide, targetSlot };
  }

  /** Choix du Pokémon de remplacement limité aux Pokémon possédés par le joueur (`owners[i] === mySlot`) */
  async pickCoopReplacement(mySlot) {
    const b = this.battle;
    const ownerOf = (i) => b.owners?.[i];
    const k = await partyScreen(this.game, {
      mode: 'pick',
      pickLabel: 'Envoyer',
      prompt: 'Remplacer ton Pokémon K.O. :',
      filter: (m, i) => (
        ownerOf(i) !== mySlot ? (b.ownerNames?.[ownerOf(i)] || 'Allié')
          : m.hp <= 0 ? 'K.O.'
          : b.sides[0].activeSlots.includes(i) ? 'Au combat'
          : null
      ),
    });
    if (k >= 0 && ownerOf(k) === mySlot) return k;
    return b.sides[0].party.findIndex((m, j) => ownerOf(j) === mySlot && m && m.hp > 0 && !b.sides[0].activeSlots.includes(j));
  }

  /** Menu d'ordre restreint au seul emplacement du joueur en Co-op (`mySlot`) */
  async chooseCoopSlotAction(mySlot) {
    const b = this.battle, ref = { side: 0, slot: mySlot }, me = b.act(ref);
    if (!me || me.hp <= 0) return { slot: mySlot, type: 'none' };
    const forced = b.forcedAction(ref);
    if (forced) return { slot: mySlot, type: 'move', idx: 0 };
    this.highlightActor(mySlot);
    try {
      for (;;) {
        this.ui.typePage(this.textBox, `${me ? monName(me) : 'À toi'} — choisis ton action !`, { last: true });
        const c = await this.commandMenu(false);
        if (c === 0) {
          this.megaArmed = false;
          const mvIdx = await this.moveMenu(mySlot, false);
          if (mvIdx < 0) continue;
          const mvObj = me.moves[mvIdx];
          const M = mvObj ? MOVES[mvObj.id] : MOVES[165];
          const tgt = await this._pickMoveTarget(ref, M);
          if (!tgt) continue;
          const { targetSide, targetSlot } = tgt;
          const mega = !!this.megaArmed && b.canMega(ref);
          this.megaArmed = false;
          return { slot: mySlot, type: 'move', idx: mvIdx, targetSide, targetSlot, ...(mega ? { mega: true } : {}) };
        }
        if (c === 1) { await this.msg('Pas d\'objets du sac autorisés dans le Dojo !', { wait: true }); continue; }
        if (c === 3) { if (await this.ui.yesNo('Abandonner le défi Co-op avec ton escouade ?')) return { slot: mySlot, type: 'forfeit' }; continue; }
        if (c === 2) {
          const k = await partyScreen(this.game, {
            mode: 'battle',
            prompt: 'Choisis ton remplaçant.',
            filter: (m, i) => (
              b.owners?.[i] !== mySlot ? (b.ownerNames?.[b.owners[i]] || 'Allié')
                : m.hp <= 0 ? `${monName(m)} est K.O.`
                : b.sides[0].activeSlots.includes(i) ? 'Déjà sur le terrain'
                : null
            ),
          });
          if (k < 0 || b.owners?.[k] !== mySlot) continue;
          return { slot: mySlot, type: 'switch', idx: k };
        }
      }
    } finally {
      this.highlightActor(-1);
    }
  }

  /** Boucle de combat lockstep pour le Dojo Co-op (2 ou 3 joueurs vs IA hyperstratégique) */
  async runCoopDojo(battle, coopNet, o = {}) {
    this.battle = battle; this.slots = battle.slots || 2; this.kind = o.bg || 'gym'; this.alive = true;
    this.lastMove = 0; this.lastMoveMon = null;
    this.seenInBattle = new Set();
    this.W = Math.max(256, Math.min(420, Math.round(BH * innerWidth / innerHeight)));
    this.bg = this.makeBg(this.kind, o.night);
    this.boosts = null; this.boostSlots = null;
    this.initState();
    this.buildDom();
    this.root.style.setProperty('--bp', (innerHeight / BH) + 'px');
    this.updateWeather(battle.weather);
    this.updateAnomaly();
    for (let sl = 0; sl < this.slots; sl++) { this.setHud(1, null, 0, sl); this.setHud(0, null, 0, sl); }
    const jobs = [this.loadBattleDecor(this.kind, o.night)];
    for (let sl = 0; sl < this.slots; sl++) jobs.push(this.loadSide(1, sl), this.loadSide(0, sl));
    await Promise.all(jobs);
    const L = o.lineup;   // boss de raid : pas de dresseur en face, le boss est là d'emblée
    if (!L) this.st.trainer.img = await loadImg(ASSETS.trainer(battle.sides[1].trainer.bs));
    requestAnimationFrame(this.frame);
    const oB = this.spriteObj(1, 0);
    if (L) { oB.visible = true; oB.dark = true; } else this.st.trainer.visible = true;
    await this.tween(700, (u) => { const e = ease(u); this.st.eSlide = -this.W * (1 - e); this.st.pSlide = this.W * (1 - e); });
    if (L) {
      await this.raidLineup(L);
      // le boss sort de l'ombre : rugissement, éclats aux couleurs de son aura
      const boss = battle.monAt(1, 0), c = this.sprCenter(1, 0);
      oB.dark = false; oB.white = 1; this.setHud(1, boss, boss.hp, 0);
      this.sound.cry(ASSETS.cry(boss.sp));
      const teinte = { bleu: ['#7fd0ff', '#2a6fe0', '#ffffff'], rouge: ['#ff7a6a', '#c0101e', '#ffffff'], or: ['#ffe680', '#e09a00', '#ffffff'] }[L.boss.aura] || ['#ffffff'];
      this.burst(c.x, c.y, teinte, 34, { speed: 3 });
      await this.tween(380, (u) => { oB.white = 1 - u; oB.dx = Math.sin(u * 40) * 3 * (1 - u); });
      oB.white = 0; oB.dx = 0;
    }
    await this.play(battle.start());

    const mySlot = battle.mySlot ?? 0;
    const waiting = () => (coopNet.waitUiHint ? coopNet.waitUiHint(this.textBox) : this.ui.typePage(this.textBox, 'En attente de ton escouade…', { last: true }));
    const quitMsg = battle.isRaid ? 'Tu abandonnes le Raid Co-op…' : battle.is4p ? 'Tu déclares forfait…' : 'Tu abandonnes le défi du Dojo…';
    const aborted = async (r) => {
      if (r.mine) { coopNet.sendQuit?.(); await this.play(battle.stop('lose', quitMsg)); return; }
      const who = r.who || 'Un participant';
      const why = r.desync ? 'Désynchronisation réseau détectée : le combat est interrompu.'
        : r.left ? `${who} a quitté la partie.`
        : r.quit ? `${who} a abandonné le combat.`
        : r.timeout ? `${who} ne répond plus.`
        : 'La session multijoueur a été interrompue.';
      await this.play(battle.stop('lose', why));
    };

    while (battle.state !== 'over') {
      if (battle.state === 'switch') {
        const n = battle.turn;
        const needed = battle.needPlayerSlots?.length ? battle.needPlayerSlots : [];
        let myPick = null;
        if (needed.includes(mySlot)) {
          myPick = await this.pickCoopReplacement(mySlot);
        }
        const needKeys = battle.is4p
          ? [...(battle.needSlots?.[0] || []).map((s) => `${battle.teamIdx}:${s}`), ...(battle.needSlots?.[1] || []).map((s) => `${1 - battle.teamIdx}:${s}`)]
          : needed;
        await coopNet.sendSwitch(n, myPick);
        const popSw = this.ui.input.push((k) => { if (k === 'b' || k === 'cancel') coopNet.abortAllWaiters?.(); });
        const r = await coopNet.waitAllSwitches(n, needKeys, myPick, waiting);
        popSw();
        if (!r.picks) { await aborted(r); break; }
        await this.play(battle.switchCoop(r.picks));
        continue;
      }

      const myAlive = battle.monAt(0, mySlot) && battle.monAt(0, mySlot).hp > 0;
      const myAction = myAlive ? await this.chooseCoopSlotAction(mySlot) : { slot: mySlot, type: 'none' };
      if (myAction.type === 'forfeit') {
        coopNet.sendQuit?.();
        await this.play(battle.stop('lose', quitMsg));
        break;
      }
      const n = battle.turn + 1, sum = battle.checksum();
      await coopNet.sendAct(n, myAction, sum);
      const popAct = this.ui.input.push((k) => { if (k === 'b' || k === 'cancel') coopNet.abortAllWaiters?.(); });
      const r = await coopNet.waitAllActs(n, myAction, sum, waiting);
      popAct();
      if (!r.acts) { await aborted(r); break; }
      if (r.foeActs) battle.remote = r.foeActs;
      await this.play(battle.playerAction(r.acts));
    }
    await wait(300);
    return battle.result;
  }

  async loadSide(side, slot = 0) {
    const m = this.battle.act(side, slot), o = this.spriteObj(side, slot);
    if (!o) return;
    if (!m) { o.img = null; o.visible = false; return; }
    o.img = await loadImg(side === 1 ? ASSETS.front(m.sp, m.shiny, m.shadow) : ASSETS.back(m.sp, m.shiny, m.shadow));
    o.whiteImg = null; o.darkImg = null;
    // l'adversaire pose ses pattes sur le socle (le sprite a un vide transparent dessous, différent pour chaque espèce)
    o.pied = side === 1 && o.img && !levite(m.sp) ? videSous(o.img) : null;
    o.hautVu = side === 1 && m.alpha && o.img ? o.img.height - videSur(o.img) - (o.pied || 0) : 0;   // du sommet du crâne aux pattes
    // boss de raid / Pokémon Alpha : son aura (bleue, rouge ou or) ondule derrière lui
    const auraKind = (side === 1 && this.battle.aura) ? this.battle.aura : (m.alpha ? 'rouge' : null);
    o.aura = auraKind && o.img ? auraFrames(o.img, auraKind).frames : null;
    if (!o.img) { const c = document.createElement('canvas'); c.width = c.height = 80; const x = c.getContext('2d'); x.fillStyle = TYPE_COL[SPECIES[m.sp].t[0]]; x.beginPath(); x.arc(40, 50, 24, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = '20px sans-serif'; x.fillText('?', 34, 58); o.img = c; }
  }
  /** boss de raid : l'escouade se présente (portrait et nom de chaque joueur) face au boss, puis s'efface */
  async raidLineup(L) {
    const n = L.joueurs.length;
    const ov = el('div', `raid-lineup aura-${L.boss.aura || 'or'} n${n}`);
    ov.innerHTML = `
      <div class="rl-bande"></div>
      <div class="rl-titre">ESCOUADE DE RAID</div>
      <div class="rl-equipe">${L.joueurs.map((j, k) => `
        <div class="rl-joueur${j.moi ? ' moi' : ''}" style="--k:${k}">
          <div class="rl-portrait"><img src="${j.portrait || ASSETS.trainer(j.bs)}" alt=""></div>
          <div class="rl-nom">${esc(j.name)}${j.moi ? '<i>toi</i>' : ''}</div>
        </div>`).join('')}</div>
      <div class="rl-vs">VS</div>
      <div class="rl-boss">
        <div class="rl-boss-img"><img src="${ASSETS.front(L.boss.sp)}" alt=""></div>
        <div class="rl-boss-nom">${esc(L.boss.title)}</div>
        <div class="rl-boss-sous">${esc(L.boss.rang)} · N.${L.boss.lvl}</div>
      </div>`;
    this.root.appendChild(ov);
    let passe = false;
    const pop = this.ui.input.push((k) => { if (k === 'a' || k === 'b') passe = true; });
    const attendre = async (ms) => { for (let t = 0; t < ms && !passe; t += 40) await wait(40); };
    try {
      await wait(30); ov.classList.add('in');
      await attendre(260);
      for (let k = 0; k < n && !passe; k++) { this.sound.sfx('select'); await attendre(200); }
      if (!passe) { this.sound.sfx('bang'); ov.classList.add('vs'); }
      await attendre(380);
      ov.classList.add('boss');
      await attendre(1500);
    } finally {
      pop();
      ov.classList.add('out');
      await wait(320);
      ov.remove();
    }
  }
  close() { this.alive = false; this.fond = null; this.targetHint = null; this.root?.remove(); this.ui.closeDialog(); this.game.input.clearDirs?.(); }

  /* ---------------- choix du joueur ---------------- */
  async chooseActionForSlot(sl, { allowBack = false, reservedSwitches = new Set(), megaAlreadyArmed = false, usedItems = {} } = {}) {
    const b = this.battle, ref = { side: 0, slot: sl }, me = b.act(ref);
    const forced = b.forcedAction(ref); if (forced) return { slot: sl, type: 'move', idx: 0 };
    this.highlightActor(sl);
    for (;;) {
      this.ui.typePage(this.textBox, `Que doit faire ${monName(me)} ?`, { last: true });
      const c = await this.commandMenu(allowBack);
      if (c === 'back') return 'back';
      if (c && c.fastBall) {
        if (this.slots > 1 && b.aliveSlots(1).length > 1) { await this.msg('Il y a trop de cibles ! Mets-en d\'abord K.O. pour n\'en laisser qu\'une !', { wait: true }); continue; }
        const ballId = c.fastBall;
        if (this.game.state.party.length >= 6 && this.game.state.box.length >= 300) { await this.msg('Plus de place dans le PC !', { wait: true }); continue; }
        this.lastBattleItem = ballId; this.game._lastBattleItem = ballId;
        return { slot: sl, type: 'item', item: ballId };
      }
      if (c === 0) {
        this.megaArmed = false;
        const mvIdx = await this.moveMenu(sl, megaAlreadyArmed);
        if (mvIdx < 0) continue;
        const mvObj = me.moves[mvIdx];
        const M = mvObj ? MOVES[mvObj.id] : MOVES[165];
        const tgt = await this._pickMoveTarget(ref, M);
        if (!tgt) continue;
        const { targetSide, targetSlot } = tgt;
        const mega = !megaAlreadyArmed && !!this.megaArmed && b.canMega(ref);
        this.megaArmed = false;
        return { slot: sl, type: 'move', idx: mvIdx, targetSide, targetSlot, ...(mega ? { mega: true } : {}) };
      }
      if (c === 1 && b.pvp) { await this.msg('Pas d\'objets dans un combat entre dresseurs !', { wait: true }); continue; }
      if (c === 3 && b.pvp) { if (await this.ui.yesNo('Abandonner le combat ?')) return { slot: sl, type: 'forfeit' }; continue; }
      if (c === 1) {
        const r = await bagScreen(this.game, { battle: true, sansSoins: !!b.sansSoins, initialItem: this.lastBattleItem || this.game._lastBattleItem }); if (!r) continue;
        const leftQty = (this.game.state.bag[r.item] || 0) - (usedItems[r.item] || 0);
        if (leftQty <= 0) { await this.msg(`Tu n'as plus de ${itemName(r.item)} disponible ce tour !`, { wait: true }); continue; }
        this.lastBattleItem = r.item; this.game._lastBattleItem = r.item;
        const it = ITEMS[r.item], cap = this.game.levelCap();
        if (it.ball) {
          if (this.slots > 1 && b.aliveSlots(1).length > 1) { await this.msg('Il y a trop de cibles ! Mets-en d\'abord K.O. pour n\'en laisser qu\'une !', { wait: true }); continue; }
          if (this.game.state.party.length >= 6 && this.game.state.box.length >= 300) { await this.msg('Plus de place dans le PC !', { wait: true }); continue; }
          return { slot: sl, type: 'item', item: r.item };
        }
        const target = await partyScreen(this.game, { mode: 'pick', prompt: `Utiliser ${itemName(r.item)} sur quel Pokémon ?`, filter: (m) => (canUseOn(r.item, m, cap) ? null : it.candy && m.lvl >= cap && m.lvl < 100 ? `Niv. max (${cap})` : 'Pas d\'effet') });
        if (target < 0) continue;
        let moveIdx = -1;
        if (it.pp) { const m = this.game.state.party[target]; moveIdx = await this.ui.list({ title: 'Quelle attaque ?', items: m.moves.map((x) => ({ label: MOVES[x.id].n, right: `${x.pp}/${MOVES[x.id].pp}` })), cls: 'psub', cancel: -1 }); if (moveIdx < 0) continue; }
        return { slot: sl, type: 'item', item: r.item, target, moveIdx };
      }
      if (c === 2) {
        const k = await partyScreen(this.game, {
          mode: 'battle', prompt: 'Choisis un Pokémon.',
          filter: (m, i) => (m.hp <= 0 ? `${monName(m)} n'a plus la force de se battre !` : b.sides[0].activeSlots.includes(i) ? `${monName(m)} est déjà au combat !` : reservedSwitches.has(i) ? 'Déjà appelé ce tour' : null),
        });
        if (k < 0) continue;
        return { slot: sl, type: 'switch', idx: k };
      }
      if (c === 3) {
        if (!b.wild || b.sansFuite) { this.sound.sfx('bump'); await this.msg(b.wild ? 'La faille s\'est refermée : impossible de fuir !' : 'Impossible de fuir un combat de Dresseur !', { wait: true }); continue; }
        return { slot: sl, type: 'run' };
      }
    }
  }

  async chooseAction() {
    if (this.slots === 1) {
      const a = await this.chooseActionForSlot(0, { allowBack: false });
      this.highlightActor(-1);
      return a;
    }
    const b = this.battle, activeSlots = b.aliveSlots(0);
    const chosen = [];
    for (let k = 0; k < activeSlots.length;) {
      const sl = activeSlots[k];
      const reservedSwitches = new Set(chosen.filter((x) => x.type === 'switch').map((x) => x.idx));
      const megaAlreadyArmed = chosen.some((x) => x.mega);
      const usedItems = {};
      for (const x of chosen) if (x.type === 'item') usedItems[x.item] = (usedItems[x.item] || 0) + 1;
      const a = await this.chooseActionForSlot(sl, { allowBack: k > 0, reservedSwitches, megaAlreadyArmed, usedItems });
      if (a === 'back') { if (k > 0) { chosen.pop(); k--; } continue; }
      if (a.type === 'run' || a.type === 'forfeit') { this.highlightActor(-1); return a.type === 'run' ? { type: 'run' } : { type: 'forfeit' }; }
      chosen.push(a);
      k++;
    }
    this.highlightActor(-1);
    return chosen;
  }

  getFastBall() {
    if (!this.battle?.wild) return null;
    if (this.slots > 1 && this.battle.aliveSlots(1).length > 1) return null;
    const bag = this.game.state?.bag || {};
    const last = this.lastBattleItem || this.game._lastBattleItem;
    if (last && ITEMS[last]?.ball && (bag[last] || 0) > 0) return { id: last, name: itemName(last), count: bag[last], it: ITEMS[last] };
    for (const pid of ['ultra-ball', 'great-ball', 'poke-ball', 'master-ball']) if ((bag[pid] || 0) > 0) return { id: pid, name: itemName(pid), count: bag[pid], it: ITEMS[pid] };
    for (const [k, qty] of Object.entries(bag)) if (qty > 0 && ITEMS[k]?.ball) return { id: k, name: itemName(k), count: qty, it: ITEMS[k] };
    return null;
  }
  commandMenu(allowBack = false) {
    return new Promise((resolve) => {
      const fastBall = this.getFastBall();
      const items = [
        { label: 'ATTAQUE', sub: 'Capacités', cls: 'fight', icon: 'img/battle/fight.png' },
        { label: 'SAC', sub: this.battle.sansSoins ? 'Balls seulement' : 'Objets & Balls', cls: 'bag', icon: 'img/hud/bag.png' },
        { label: 'ÉQUIPE', sub: 'Changer', cls: 'mon', icon: 'img/hud/team.png' },
        { label: allowBack ? 'RETOUR' : this.battle.pvp ? 'ABANDON' : 'FUITE', sub: allowBack ? 'Précédent' : this.battle.pvp ? 'Forfait' : this.battle.sansFuite ? 'Impossible' : 'Quitter', cls: !allowBack && this.battle.sansFuite ? 'run interdit' : 'run', icon: 'img/hud/run.png' },
      ];
      const fastHtml = fastBall ? `<div class="fast-ball-banner" title="Lancer rapide (Touche B ou Clic)"><div class="fbb-left"><span class="fbb-key-pill">B</span><img class="fbb-ico" src="${ASSETS.item(fastBall.id)}" alt="${esc(fastBall.name)}"><div class="fbb-text"><span class="fbb-sub">Lancer rapide</span><span class="fbb-name">${esc(fastBall.name)}</span></div></div><div class="fbb-right"><span class="fbb-count">×${fastBall.count}</span></div></div>` : '';
      this.cmd.innerHTML = `${fastHtml}<div class="cmd-grid">${items.map((it, i) => `<div class="cbtn ${it.cls}" data-i="${i}"><img class="cbtn-ico" src="${it.icon}" alt=""><div class="cbtn-txt"><span class="cbtn-lbl">${it.label}</span><span class="cbtn-sub">${it.sub}</span></div></div>`).join('')}</div>`;
      this.cmd.classList.add('on'); this.root.classList.add('cmdon');
      let i = this.lastCmd || 0;
      const btns = [...this.cmd.querySelectorAll('.cbtn')];
      const show = () => btns.forEach((b, k) => b.classList.toggle('sel', k === i));
      show();
      let done = false;
      const pick = (res) => {
        if (done) return; done = true; pop();
        this.cmd.classList.remove('on'); this.root.classList.remove('cmdon');
        if (typeof res === 'number') this.lastCmd = res === 3 ? 0 : res;
        this.sound.sfx(res === 'back' ? 'cancel' : 'select');
        resolve(res === 3 && allowBack ? 'back' : res);
      };
      this.cmd.querySelector('.fast-ball-banner')?.addEventListener('click', (e) => { e.stopPropagation(); pick({ fastBall: fastBall.id }); });
      btns.forEach((b, idx) => {
        b.addEventListener('pointerenter', () => { if (i !== idx) { i = idx; this.sound.sfx('blip'); show(); } });
        b.addEventListener('click', (e) => { e.stopPropagation(); i = idx; show(); pick(idx); });
      });
      const pop = this.ui.input.push((k) => {
        if (k === 'ball' && fastBall) { pick({ fastBall: fastBall.id }); return; }
        if (k === 'up' || k === 'down') i ^= 2;
        else if (k === 'left' || k === 'right') i ^= 1;
        else if (k === 'a') { pick(i); return; }
        else if (k === 'b') { if (allowBack) { pick('back'); return; } i = 3; }
        else return;
        this.sound.sfx('blip'); show();
      });
    });
  }
  moveMenu(slot = 0, megaAlreadyArmed = false) {
    return new Promise((resolve) => {
      const m = this.battle.act(0, slot);
      const foeSlots = this.battle.aliveSlots(1);
      const foeMon = foeSlots.length === 1 ? this.battle.monAt(1, foeSlots[0]) : this.battle.monAt(1, 0);
      const foeRef = foeSlots.length === 1 ? { side: 1, slot: foeSlots[0] } : { side: 1, slot: 0 };
      const attRef = { side: 0, slot };
      const foeKnown = foeMon ? this.game.isSpeciesKnown(foeMon.sp) : false;
      const canMegaHere = !megaAlreadyArmed && this.battle.canMega?.(attRef);
      this.cmd.innerHTML = `
        <div class="mv-desc-banner">
          <div class="mv-desc-head"><span class="mv-desc-name"></span><span class="mv-desc-type"></span><span class="mv-desc-cat"></span><span class="mv-desc-pow"></span><span class="mv-desc-acc"></span><span class="mv-desc-pp"></span></div>
          <div class="mv-desc-text"></div>
        </div>
        <div class="mv-layout">
          <div class="mv-grid">${[0, 1, 2, 3].map((k) => {
            const x = m.moves[k];
            if (!x) return '<div class="mbtn empty"><span class="mn">—</span></div>';
            const M = MOVES[x.id], mType = this.battle.moveType ? this.battle.moveType(attRef, M) : M.t, catIcon = `img/battle/cat_${M.c || 'physical'}.png`, pwTxt = M.p ? `Puis. ${M.p}` : 'Statut';
            let effBadge = '';
            if (this.slots > 1 && (M.tg === 9 || M.tg === 11)) {
              effBadge = `<span class="bm-eff" style="background:#324a78;color:#dcecff;border-color:#080a10">ZONE</span>`;
            } else if (foeMon && (M.p || M.c !== 'status') && (this.slots === 1 || foeSlots.length === 1)) {
              if (foeKnown) {
                const eff = this.battle.effOn ? this.battle.effOn(attRef, foeRef, mType) : typeEff(mType, SPECIES[foeMon.sp]?.t || ['normal']);
                if (eff === 0) effBadge = '<span class="bm-eff eff-nul">SANS EFFET</span>';
                else if (eff >= 2) effBadge = `<span class="bm-eff eff-super">SUPER EFF.${eff > 2 ? ' ×4' : ''}</span>`;
                else if (eff < 1) effBadge = `<span class="bm-eff eff-weak">PEU EFF.${eff < 0.5 ? ' ×¼' : ''}</span>`;
              } else { effBadge = `<span class="bm-eff eff-unk">???</span>`; }
            }
            return `<div class="mbtn" data-i="${k}" style="--tc:${TYPE_COL[mType]}"><div class="mbtn-top"><span class="mn">${esc(M.n)}</span><div class="mbtn-top-right">${effBadge}<img class="mcat" src="${catIcon}" alt="${M.c}"></div></div><div class="mbtn-bot"><div class="mbtn-bot-left"><span class="mt">${TYPE_FR[mType]}</span><span class="mpw">${pwTxt}</span></div><span class="mpp${x.pp === 0 ? ' zero' : ''}">PP ${x.pp}/${M.pp}</span></div></div>`;
          }).join('')}</div>
          ${canMegaHere ? `<button type="button" class="mv-mega-btn" title="Méga-Évolution (touche M ou Tab)"><img src="${ASSETS.item('mega-ring')}" alt=""><span>MÉGA</span></button>` : ''}
          <button type="button" class="mv-back-btn" title="Retour (Échap)"><span class="mv-back-ico">✕</span><span class="mv-back-lbl">RETOUR</span></button>
        </div>`;
      this.cmd.classList.add('on', 'moves'); this.root.classList.add('cmdon', 'moves-open');
      let i = this.lastMoveMon === m ? this.lastMove || 0 : 0; if (!m.moves[i]) i = 0;
      const btns = [...this.cmd.querySelectorAll('.mbtn')], backBtn = this.cmd.querySelector('.mv-back-btn');
      const dN = this.cmd.querySelector('.mv-desc-name'), dT = this.cmd.querySelector('.mv-desc-type'), dC = this.cmd.querySelector('.mv-desc-cat');
      const dP = this.cmd.querySelector('.mv-desc-pow'), dA = this.cmd.querySelector('.mv-desc-acc'), dPP = this.cmd.querySelector('.mv-desc-pp'), dTxt = this.cmd.querySelector('.mv-desc-text');
      const show = () => {
        btns.forEach((b, k) => b.classList.toggle('sel', k === i));
        backBtn?.classList.toggle('sel', i === 4);
        if (i === 4) {
          dN.textContent = 'RETOUR ✕'; dT.style.display = dC.style.display = dP.style.display = dA.style.display = dPP.style.display = 'none';
          dTxt.textContent = 'Revenir au menu d\'action précédent.';
        } else {
          const x = m.moves[i];
          if (x) {
            const M = MOVES[x.id];
            dN.style.display = dT.style.display = dP.style.display = dA.style.display = dPP.style.display = 'inline-block';
            dC.style.display = 'inline-flex';
            dN.textContent = M.n; dT.textContent = TYPE_FR[M.t]; dT.style.background = TYPE_COL[M.t];
            dC.innerHTML = `<img src="img/battle/cat_${M.c || 'physical'}.png" alt=""><span>${M.c === 'special' ? 'Spécial' : M.c === 'status' ? 'Statut' : 'Physique'}</span>`;
            dP.textContent = M.p ? `Puis. ${M.p}` : 'Statut'; dA.textContent = M.a ? `Préc. ${M.a}%` : 'Préc. —'; dPP.textContent = `PP ${x.pp}/${M.pp}`;
            dTxt.textContent = moveDesc(M);
          } else {
            dN.textContent = 'Emplacement vide'; dT.style.display = dC.style.display = dP.style.display = dA.style.display = dPP.style.display = 'none';
            dTxt.textContent = 'Aucune capacité apprise sur cet emplacement.';
          }
        }
      };
      show();
      let done = false;
      const closeMenu = (idx) => {
        if (done) return; done = true; pop();
        this.cmd.classList.remove('on', 'moves'); this.root.classList.remove('cmdon', 'moves-open');
        if (idx >= 0) { this.lastMove = idx; this.lastMoveMon = m; this.sound.sfx('select'); }
        else this.sound.sfx('cancel');
        resolve(idx);
      };
      const confirmMove = (idx) => {
        const x = m.moves[idx]; if (!x) return;
        if (x.pp <= 0 && this.battle.usableMoves({ side: 0, slot }).length) { this.sound.sfx('bump'); return; }
        closeMenu(idx);
      };
      btns.forEach((b, idx) => {
        if (!m.moves[idx]) return;
        b.addEventListener('pointerenter', () => { if (i !== idx) { i = idx; this.sound.sfx('blip'); show(); } });
        b.addEventListener('click', (e) => { e.stopPropagation(); i = idx; show(); confirmMove(idx); });
      });
      const megaBtn = this.cmd.querySelector('.mv-mega-btn');
      const toggleMega = () => { if (!megaBtn) return; this.megaArmed = !this.megaArmed; megaBtn.classList.toggle('on', this.megaArmed); this.sound.sfx(this.megaArmed ? 'select' : 'cancel'); };
      megaBtn?.addEventListener('click', (e) => { e.stopPropagation(); toggleMega(); });
      backBtn?.addEventListener('pointerenter', () => { if (i !== 4) { i = 4; this.sound.sfx('blip'); show(); } });
      backBtn?.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(-1); });
      const pop = this.ui.input.push((k) => {
        let j = i;
        if (k === 'up') j = i === 4 ? 1 : i >= 2 ? i - 2 : i;
        else if (k === 'down') j = i === 4 ? 3 : i <= 1 ? i + 2 : i;
        else if (k === 'left') j = i === 4 ? 1 : i % 2 === 1 ? i - 1 : i;
        else if (k === 'right') j = i % 2 === 0 ? i + 1 : (i === 1 || i === 3) ? 4 : i;
        else if (k === 'a') { if (i === 4) { closeMenu(-1); return; } confirmMove(i); return; }
        else if (k === 'b') { closeMenu(-1); return; }
        else if (k === 'menu') { toggleMega(); return; }
        else return;
        if (j === 4 || m.moves[j]) { i = j; this.sound.sfx('blip'); show(); }
      });
    });
  }

  targetMenu(attRef, M, cands, isAlly = false) {
    return new Promise((resolve) => {
      const listHtml = cands.map((c, idx) => {
        const tm = this.battle.act(c);
        const r = Math.max(0, tm.hp / tm.stats[0]);
        let effTag = isAlly ? '<span class="bm-eff" style="background:#2d7a4c;color:#fff;border-color:#080a10">ALLIÉ</span>' : '';
        if (!isAlly && (M.p || M.c !== 'status')) {
          if (this.game.isSpeciesKnown(tm.sp)) {
            const mType = this.battle.moveType ? this.battle.moveType(attRef, M) : M.t;
            const eff = this.battle.effOn ? this.battle.effOn(attRef, c, mType) : typeEff(mType, SPECIES[tm.sp]?.t || ['normal']);
            if (eff === 0) effTag = '<span class="bm-eff eff-nul">SANS EFFET</span>';
            else if (eff >= 2) effTag = `<span class="bm-eff eff-super">SUPER EFF.${eff > 2 ? ' ×4' : ''}</span>`;
            else if (eff < 1) effTag = `<span class="bm-eff eff-weak">PEU EFF.</span>`;
          } else effTag = '<span class="bm-eff eff-unk">???</span>';
        }
        return `<div class="tgt-btn${isAlly ? ' ally' : ''}" data-idx="${idx}">
          <div class="tgt-top"><span class="tgt-name">${esc(monName(tm))}</span><span class="tgt-lv">N.${tm.lvl}</span></div>
          <div class="tgt-bar"><u style="width:${r * 100}%;background:${hpCol(r)}"></u></div>
          <div class="tgt-bot"><span class="tgt-hp">${c.side === 0 ? `${tm.hp}/${tm.stats[0]} PV` : `${Math.round(r * 100)}% PV`}</span>${effTag}</div>
        </div>`;
      }).join('');
      this.cmd.innerHTML = `<div class="mv-layout"><div class="tgt-grid">${listHtml}</div><button type="button" class="mv-back-btn"><span class="mv-back-ico">✕</span><span class="mv-back-lbl">RETOUR</span></button></div>`;
      this.cmd.classList.add('on', 'moves'); this.root.classList.add('cmdon', 'moves-open');
      let i = 0;
      const btns = [...this.cmd.querySelectorAll('.tgt-btn')];
      const hudCards = cands.map((c) => this.hudFor(c.side, c.slot));
      const sync = () => {
        btns.forEach((b, k) => b.classList.toggle('sel', k === i));
        hudCards.forEach((h, k) => { if (h) { h.classList.add('targetable'); h.classList.toggle('target-sel', k === i); } });
        this.targetHint = cands[i] || null;
      };
      sync();
      let done = false;
      const closeT = (res) => {
        if (done) return; done = true; pop();
        this.targetHint = null;
        hudCards.forEach((h) => h?.classList.remove('targetable', 'target-sel'));
        hudCards.forEach((h) => { if (h) h.onclick = null; });
        this.cmd.classList.remove('on', 'moves'); this.root.classList.remove('cmdon', 'moves-open');
        this.sound.sfx(res ? 'select' : 'cancel');
        resolve(res);
      };
      btns.forEach((b, k) => {
        b.addEventListener('pointerenter', () => { if (i !== k) { i = k; this.sound.sfx('blip'); sync(); } });
        b.addEventListener('click', (e) => { e.stopPropagation(); closeT(cands[k]); });
      });
      hudCards.forEach((h, k) => {
        if (h) h.onclick = (e) => { e.stopPropagation(); closeT(cands[k]); };
      });
      this.cmd.querySelector('.mv-back-btn')?.addEventListener('click', (e) => { e.stopPropagation(); closeT(null); });
      const pop = this.ui.input.push((k) => {
        if (k === 'left' || k === 'up') { i = (i - 1 + cands.length) % cands.length; this.sound.sfx('blip'); sync(); }
        else if (k === 'right' || k === 'down') { i = (i + 1) % cands.length; this.sound.sfx('blip'); sync(); }
        else if (k === 'a') closeT(cands[i]);
        else if (k === 'b') closeT(null);
      });
    });
  }

  async pickReplacementList(neededSlots) {
    const b = this.battle, picks = [];
    for (let s = 0; s < neededSlots.length; s++) {
      const k = await partyScreen(this.game, {
        mode: 'pick', pickLabel: 'Envoyer',
        prompt: neededSlots.length > 1 ? `Remplaçant ${s + 1}/${neededSlots.length} : quel Pokémon ?` : 'Envoyer quel Pokémon ?',
        filter: (m, i) => (m.hp <= 0 ? 'K.O.' : b.sides[0].activeSlots.includes(i) ? 'Au combat' : picks.includes(i) ? 'Déjà choisi' : null),
      });
      const fallback = b.sides[0].party.findIndex((m, j) => m && m.hp > 0 && !b.sides[0].activeSlots.includes(j) && !picks.includes(j));
      picks.push(k >= 0 ? k : fallback);
    }
    return picks;
  }
  async forcedSwitch() {
    const b = this.battle;
    if (this.slots === 1) {
      const k = await partyScreen(this.game, { mode: 'pick', pickLabel: 'Envoyer', prompt: 'Envoyer quel Pokémon ?', filter: (m, i) => (m.hp <= 0 ? 'K.O.' : i === b.sides[0].active ? 'Au combat' : null) });
      if (k < 0) return;
      await this.play(b.playerSwitch(k));
      return;
    }
    const need = b.needPlayerSlots?.length ? b.needPlayerSlots : [0];
    const picks = await this.pickReplacementList(need);
    await this.play(b.playerSwitch(picks));
  }

  /* ---------------- relecture des événements ---------------- */
  async play(evs) {
    for (const e of evs) {
      const sl = e.slot ?? 0;
      switch (e.t) {
        case 'msg': await this.msg(e.text, { wait: this.battle.state === 'over' && /remportez|remportes|battu|K\.O\.|perdez|perds|attrapé|panique|en forme/.test(e.text) }); break;
        case 'send':
          if (this.boostSlots?.[e.side]) this.boostSlots[e.side][sl] = [0, 0, 0, 0, 0, 0, 0, 0];
          if (this.boosts && sl === 0) this.boosts[e.side] = [0, 0, 0, 0, 0, 0, 0, 0];
          this.showBoosts(e.side, sl);
          await this.animSend(e.side, sl);
          break;
        case 'recall': await this.animRecall(e.side, sl); break;
        case 'mega': await this.animMega(e.side, sl); break;
        case 'move': await playMoveVfx(this, { side: e.side, slot: sl, moveId: e.move, type: e.type, targets: e.targets }); break;
        case 'hit': await this.animHit(e.side, sl, e.eff, e.crit); break;
        case 'hp': await this.animHp(e.side, sl, e.from, e.hp, e.status, e.max); break;
        case 'status': {
          const m = this.battle.act(e.side, sl); this.setHud(e.side, m, null, sl);
          if (e.status) { this.sound.sfx('status'); const c = this.sprCenter(e.side, sl); this.burst(c.x, c.y, [STATUS_FR[e.status]?.[1] || '#fff', '#ffffff'], 12, { r: 2 }); await wait(250); }
          break;
        }
        case 'stat':
          if (e.slots) this.boostSlots = e.slots;
          if (e.all) this.boosts = e.all;
          this.showBoosts(0); this.showBoosts(1);
          if (e.side >= 0) await this.animStat(e.side, sl, e.up);
          break;
        case 'weather': this.updateWeather(e.weather); break;
        case 'gym-tension': this.sound.play('gymTension'); this.st.screenFlash = 0.6; await wait(180); break;
        case 'anim': await this.animStatus(e.side, sl, e.k); break;
        case 'faint': await this.animFaint(e.side, sl); break;
        case 'exp': if (e.active) await this.animExp(e); break;
        case 'level':
          if (e.active) { const h = this.hudFor(0, sl); if (h) h.querySelector('.bh-lv').textContent = 'N.' + e.lvl; this.setHp(0, e.hp, e.after[0], sl); }
          this.sound.sfx('levelup'); await this.levelBox(e); break;
        case 'ask-learn': await this.game.askLearn(this.game.state.party[e.idx], e.move, this.textBox); break;
        case 'ball': await this.animBall(e); break;
        case 'hide': { const o = this.spriteObj(e.side, sl); if (o) o.visible = !e.on; break; }
        case 'trainer-back': { this.st.trainer.visible = true; this.st.trainer.dx = 120; await this.tween(400, (u) => { this.st.trainer.dx = 120 * (1 - ease(u)); }); break; }
        case 'sfx': this.sound.sfx(e.k); break;
        case 'raid-shield': {
          const h = this.hudFor(1, 0);
          if (h) {
            let b = h.querySelector('.raid-shield-bar');
            if (e.active) {
              if (!b) {
                b = el('div', 'raid-shield-bar');
                h.appendChild(b);
              }
              const max = Math.max(1, e.max | 0), cur = Math.max(0, e.hp | 0);
              const segs = Array.from({ length: max }, (_, idx) => `<i class="raid-shield-seg ${idx < cur ? 'on' : 'off'}"></i>`).join('');
              b.innerHTML = `<span>🛡️</span><span class="raid-shield-segs">${segs}</span><span>${cur}/${max}</span>`;
            } else if (b) {
              b.remove();
              const c = this.sprCenter(1, 0);
              this.sound.sfx('hitstrong');
              this.burst(c.x, c.y, ['#e879f9', '#fde047', '#ffffff'], 24, { speed: 2.6 });
            }
          }
          break;
        }
        case 'switch-prompt': case 'end': default: break;
      }
    }
  }

  async animSend(side, slot = 0) {
    const b = this.battle, m = b.act(side, slot), o = this.spriteObj(side, slot);
    await this.loadSide(side, slot);
    this.setHud(side, m, m?.hp, slot);
    if (side === 1 && this.st.trainer.visible) { await this.tween(320, (u) => { this.st.trainer.dx = 130 * ease(u); }); this.st.trainer.visible = false; this.st.trainer.dx = 0; }
    const target = this.posFor(side, slot), tx = target.x, ty = target.y - 18;
    const ball = { x: side === 1 ? tx : -10, y: side === 1 ? ty - 30 : 120, groundY: target.y, item: m?.ball || 'poke-ball', rot: 0, state: null };
    this.st.balls.push(ball); this.sound.sfx('throw');
    const x0 = ball.x, y0 = ball.y;
    await this.tween(side === 1 ? 230 : 380, (u) => { ball.x = x0 + (tx - x0) * u; ball.y = y0 + (ty - y0) * u - Math.sin(u * Math.PI) * 38; ball.rot = u * 10; });
    ball.state = 'open';
    this.sound.sfx('poof'); this.burst(tx, ty, ['#ffffff', '#fff6a0', '#a0e0ff'], 18, { speed: 2.2 });
    await wait(40);
    this.st.balls = this.st.balls.filter((q) => q !== ball);
    o.visible = true; o.white = 1; o.scale = 0.1;
    await this.tween(240, (u) => { o.scale = 0.1 + 0.9 * ease(u); });
    if (m) this.sound.cry(ASSETS.cry(m.sp));
    await this.tween(200, (u) => { o.white = 1 - u; });
    o.white = 0;
    const auraSpec = auraBurstSpec(m);
    if (auraSpec && (side === 0 || m?.alpha)) {
      this.burst(tx, ty - 6, auraSpec.colors, auraSpec.count, { speed: auraSpec.speed });
      this.burst(tx, ty - 14, auraSpec.colors, Math.round(auraSpec.count * 0.6), { speed: auraSpec.speed * 1.35 });
      const auraSfx = auraSpec.id === 'crimson' ? 'aura_crimson'
        : auraSpec.id === 'sparks' ? 'aura_sparks'
          : auraSpec.id === 'petals' ? 'aura_petals' : 'aura_stars';
      this.sound.sfx(auraSfx);
    }
  }
  async animMega(side, slot = 0) {
    const m = this.battle.act(side, slot), o = this.spriteObj(side, slot), c = this.sprCenter(side, slot);
    this.sound.sfx('mega');
    for (let k = 0; k < 3; k++) { this.burst(c.x, c.y, ['#ff5ad0', '#ffd84a', '#5ad8ff', '#8affa0', '#ffffff'], 16, { speed: 1.6 + k * 0.6 }); await wait(160); }
    await this.tween(360, (u) => { o.white = u; o.scale = 1 + 0.12 * Math.sin(u * Math.PI); });
    await this.loadSide(side, slot); this.setHud(side, m, m?.hp, slot);
    this.burst(c.x, c.y, ['#ffffff', '#ffe060', '#ff7ae0', '#7ae8ff'], 30, { speed: 3 });
    await this.tween(400, (u) => { o.white = 1 - u; });
    o.white = 0; o.scale = 1;
    if (m) this.sound.cry(ASSETS.cry(m.sp));
    await wait(240);
  }
  async animRecall(side, slot = 0) {
    const o = this.spriteObj(side, slot);
    o.white = 1; await this.tween(240, (u) => { o.scale = 1 - u * 0.9; }); o.visible = false; o.scale = 1; o.white = 0;
    this.setHud(side, null, 0, slot);
  }
  async animHit(side, slot = 0, eff = 1, crit = false) {
    const o = this.spriteObj(side, slot);
    this.sound.sfx(eff > 1 || crit ? 'hitstrong' : eff < 1 ? 'hitweak' : 'hit');
    o.blink = true; o.white = 0.55; o.sx = 1.12; o.sy = 0.88;
    if (eff > 1 || crit) this.shakeScreen(crit ? 4.5 : 3.2, 220);
    await this.tween(320, (u) => {
      o.dx = Math.sin(u * 30) * 3.5 * (1 - u);
      o.sx = 1 + 0.12 * (1 - u);
      o.sy = 1 - 0.12 * (1 - u);
      o.white = 0.55 * (1 - u);
    });
    o.blink = false; o.dx = 0; o.sx = 1; o.sy = 1; o.white = 0;
  }
  async animHp(side, slot = 0, from, to, status, maxEv) {
    // en Duo / Trio, l'emplacement peut déjà être vide (plus de remplaçant) ou repris quand l'animation se joue :
    // la barre garde les PV max du Pokémon touché, donnés par l'événement
    const m = this.battle.act(side, slot), max = maxEv || m?.stats?.[0];
    if (!max) return;
    const d = Math.abs(to - from), dur = Math.min(1000, 260 + d / max * 850);
    if (status !== undefined && side === 0 && m) this.setHud(0, m, from, slot);
    await this.tween(dur, (u) => this.setHp(side, from + (to - from) * u, max, slot));
    this.setHp(side, to, max, slot);
    if (side === 0 && to > 0 && to / max <= 0.2 && from / max > 0.2) this.sound.sfx('status');
  }
  async animStat(side, slot = 0, up = true) {
    const c = this.sprCenter(side, slot);
    this.sound.sfx(up ? 'stat' : 'statdown');
    for (let i = 0; i < 16; i++) this.st.parts.push({ x: c.x - 22 + Math.random() * 44, y: c.y + (up ? 18 : -22) + Math.random() * 10, vx: 0, vy: up ? -1.2 : 1.2, r: 1.5, c: up ? '#ff8870' : '#70a0ff', life: 0.45, max: 0.45 });
    await wait(380);
  }
  async animStatus(side, slot = 0, k) {
    const c = this.sprCenter(side, slot), cols = { sleep: ['#c0c8ff', '#ffffff'], confused: ['#ffe060', '#ffffff'], burn: ['#ff8030', '#ffd040'], poison: ['#b050c8', '#e090f0'], para: ['#ffe040', '#ffffff'], seed: ['#58c040', '#b0f080'], protect: ['#a0e0ff', '#ffffff'] }[k] || ['#fff'];
    if (k === 'protect') this.st.parts.push({ x: c.x, y: c.y, vx: 0, vy: 0, r: 22, grow: 0.2, shape: 'ring', c: '#a0e0ff', life: 0.5, max: 0.5 });
    else if (k === 'para') this.burst(c.x, c.y, cols, 8, { shape: 'bolt', speed: 1.2 });
    else this.burst(c.x, c.y - 4, cols, 10, { speed: 0.8, up: 0.7, r: 1.8 });
    await wait(350);
  }
  async animFaint(side, slot = 0) {
    const o = this.spriteObj(side, slot), m = this.battle.act(side, slot);
    if (m) this.sound.cry(ASSETS.cry(m.sp));
    await wait(180);
    this.sound.sfx('faint');
    o.clipY = 0;
    await this.tween(400, (u) => { o.dy = 80 * u; });
    o.visible = false; o.dy = 0; o.clipY = null;
    this.setHud(side, null, 0, slot);
  }
  async animExp(e) {
    const h = this.hudFor(0, e.slot ?? 0), bar = h?.querySelector('.bh-exp u');
    if (!bar) return;
    const go = (a, b, ms) => this.tween(ms, (u) => { bar.style.width = (a + (b - a) * u) * 100 + '%'; if (Math.random() < 0.3) this.sound.sfx('exp'); });
    if (e.lv > e.lv0) { await go(e.from, 1, 480); bar.style.width = '0%'; await go(0, e.to, 380); }
    else await go(e.from, e.to, Math.max(200, (e.to - e.from) * 1100));
  }
  async levelBox(e) {
    const names = ['PV', 'Attaque', 'Défense', 'Atq. Spé.', 'Déf. Spé.', 'Vitesse'];
    const box = el('div', 'box lvbox', names.map((n, k) => `<div><span>${n}</span><b>+${e.after[k] - e.before[k]}</b></div>`).join(''));
    this.root.appendChild(box);
    await this.msg(`${monName(this.game.state.party[e.idx])} monte au niveau ${e.lvl} !`, { wait: true });
    box.innerHTML = names.map((n, k) => `<div><span>${n}</span><b>${e.after[k]}</b></div>`).join('');
    await new Promise((res) => {
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        pop();
        box.removeEventListener('click', onClick);
        this.root.removeEventListener('click', onClick);
        res();
      };
      const onClick = (ev) => { ev.stopPropagation(); fin(); };
      const pop = this.ui.input.push((k) => { if (k === 'a' || k === 'b') fin(); });
      box.addEventListener('click', onClick);
      this.root.addEventListener('click', onClick);
    });
    box.remove();
  }
  async animBall(e) {
    const slot = e.slot ?? 0, ep = this.posFor(1, slot), tx = ep.x, ty = ep.y - 28;
    const startX = 14, startY = 156;
    const ball = { x: startX, y: startY, groundY: ep.y + 4, item: e.item || 'poke-ball', rot: 0, state: null };
    this.st.balls.push(ball); this.sound.sfx('throw');
    let lastSpark = 0;
    await this.tween(540, (u) => {
      ball.x = startX + (tx - startX) * u; ball.y = startY + (ty - startY) * u - Math.sin(u * Math.PI) * 85; ball.rot = u * 16;
      if (performance.now() - lastSpark > 40) { lastSpark = performance.now(); this.st.parts.push({ x: ball.x, y: ball.y, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8 + 0.3, r: 1.5, c: u > 0.5 ? '#ffe080' : '#ffffff', life: 0.28, max: 0.28, shape: 'ring' }); }
    });
    if (e.blocked) { this.sound.sfx('bump'); await this.tween(300, (u) => { ball.x = tx + 70 * u; ball.y = ty - 25 * u + 40 * u * u; ball.rot += 0.2; }); this.st.balls = []; return; }
    ball.state = 'open'; ball.rot = 0; this.sound.sfx('poof');
    const o = this.spriteObj(1, slot); o.white = 1;
    this.burst(tx, ty + 6, ['#ffffff', '#ff9090', '#ffe0a0'], 18, { speed: 2.2, r: 2.2 });
    await this.tween(320, (u) => {
      o.scale = Math.max(0.01, 1 - u); o.dy = -(u * 18);
      if (Math.random() < 0.4) this.st.parts.push({ x: tx + (Math.random() - 0.5) * 20, y: ty + 12 - u * 10, vx: 0, vy: -0.5, r: 2, c: '#ff5555', life: 0.2, max: 0.2 });
    });
    o.visible = false; o.dy = 0; o.scale = 1; ball.state = null; await wait(60);
    const floorY = ep.y - 2, fallStartY = ball.y;
    await this.tween(240, (u) => { ball.y = fallStartY + (floorY - fallStartY) * (u * u); });
    this.sound.sfx('bump'); this.burst(ball.x, floorY + 6, ['rgba(0,0,0,0.3)', '#c0b090'], 6, { speed: 0.8, up: 0.5, r: 1.2 });
    await this.tween(160, (u) => { ball.y = floorY - Math.sin(u * Math.PI) * 12; }); this.sound.sfx('bump');
    await this.tween(110, (u) => { ball.y = floorY - Math.sin(u * Math.PI) * 4; }); ball.y = floorY;
    for (let i = 0; i < e.shakes; i++) {
      await wait(360); this.sound.sfx('shake'); ball.state = 'tilt-l'; ball.x = tx - 3; await wait(140);
      ball.state = 'tilt-r'; ball.x = tx + 3; await wait(140); ball.state = null; ball.x = tx;
      this.st.parts.push({ x: tx - 2, y: floorY + 6, vx: -0.6, vy: -0.2, r: 1.2, c: '#a09080', life: 0.25, max: 0.25 });
      this.st.parts.push({ x: tx + 2, y: floorY + 6, vx: 0.6, vy: -0.2, r: 1.2, c: '#a09080', life: 0.25, max: 0.25 });
    }
    await wait(420);
    if (e.caught) {
      this.sound.sfx('shake'); this.burst(ball.x, ball.y - 4, ['#ffe040', '#ffffff', '#ffd020'], 16, { speed: 1.6, up: 1.2, r: 2 });
      this.st.parts.push({ x: ball.x, y: ball.y - 2, vx: 0, vy: 0, r: 6, grow: 1.4, shape: 'ring', c: '#ffe040', life: 0.45, max: 0.45 });
      this.sound.sfx('caught'); await wait(600); this.setHud(1, null, 0, slot);
    } else {
      this.sound.sfx('poof'); ball.state = 'open'; this.burst(ball.x, ball.y, ['#ffffff', '#fff6a0', '#ff9090'], 20, { speed: 2.2 });
      await wait(80); this.st.balls = []; o.visible = true; o.white = 1; o.scale = 0.2;
      await this.tween(240, (u) => { o.scale = 0.2 + 0.8 * ease(u); });
      await this.tween(200, (u) => { o.white = 1 - u; }); o.white = 0;
    }
    this.st.balls = this.st.balls.filter((q) => q !== ball || e.caught);
  }
  async shakeScreen(a, ms) { await this.tween(ms, (u) => { this.st.shakeX = (Math.random() - 0.5) * a * (1 - u) * 2; this.st.shakeY = (Math.random() - 0.5) * a * (1 - u); }); this.st.shakeX = this.st.shakeY = 0; }
}
