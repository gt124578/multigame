// The Backrooms - Filtre caméra. Deux régimes :
//  - à l'œil nu (cam = 0) : une image nette, couleurs franches, noirs profonds, vignette douce, un grain à peine là.
//    Quand l'entité approche, seules les couleurs se décalent un peu et le grain monte.
//  - au caméscope (cam = 1, touche V) : la vraie cassette, en plus fort qu'avant. Image 4:3 entre deux bandes noires
//    (box), objectif bombé, lignes de balayage, bavure des couleurs, bande des têtes, tracking qui flotte, et les
//    défauts (déchirures, parasites) qui trahissent l'entité quand elle approche. Dans le noir, le mode nuit (night)
//    passe l'image en vert monochrome, très granuleuse.
// Les néons, plus forts que le blanc, bavent autour d'eux (halo flouté en quart de définition). L'exposition suit la
// lumière (le caméscope pousse son gain dans le noir : l'image s'éclaircit, grésille et ses couleurs bruitent).
// Le reste du langage « analog horror » se règle par setFx : tracking, perte de signal (neige puis écran bleu),
// mire de barres, raccord de bande, arrêt sur image, bruit de couleur, mise au point qui cherche, balance des blancs,
// luminosité du joueur, et une option qui adoucit les flashs.
import * as THREE from '../../shared/vendor/three/three.module.min.js';

const LINES = 720; // hauteur de rendu de la scène, en pixels (qualité « high »)
const QUALITY = { low: 480, medium: 600, high: 720 }; // lignes de la bande selon la qualité
const MIN_LINES = 240;
const MAX_LINES = 2880; // la pleine définition d'un grand écran (à l'œil nu)
const RESIZE_EVERY = 0.5; // résolution dynamique : au plus un changement de taille toutes les 0,5 s
const SOFT_RATE = 1.6; // flashs adoucis : un effet plein écran met au moins 0,6 s à passer de 0 à 1 (bien sous 3 Hz)

// réglages par défaut : le rendu de tous les jours
const FX_DEFAULTS = {
  headSwitch: 1, // bande de commutation des têtes en bas de l'image (0 à 1, et plus pour l'exagérer)
  tracking: 0, // défaut de tracking (0 à 1)
  signalLoss: 0, // perte de signal : neige, puis écran bleu à 1
  bars: 0, // mire de barres de couleur (0 à 1, remplace l'image)
  splice: 0, // raccord de bande : l'image saute, roule, flash de bruit (0 à 1)
  freeze: false, // arrêt sur image (pause du magnétoscope)
  chroma: 0, // bruit de couleur et désaturation (gain poussé dans le noir)
  focus: 0, // flou de mise au point qui cherche (0 à 1)
  white: [1, 1, 1], // balance des blancs (multiplicateur r, g, b)
  reduceFlashes: false, // accessibilité : variations de luminosité plein écran adoucies
  brightness: 1, // luminosité réglée par le joueur (0.5 à 1.8)
  danger: 0, // danger plancher : l'image n'est jamais moins brouillée que ça, quoi que passe render()
  cam: 0, // 0 : à l'œil nu, 1 : au caméscope (la transition est faite par l'appelant)
  night: 0, // mode nuit du caméscope (0 à 1)
  cctv: 0, // caméra de surveillance (Level 1, poste de garde) : noir et blanc verdâtre, contrasté, lignes qui défilent
};
// les effets plein écran que l'option « flashs adoucis » ralentit
const SLEW_KEYS = ['tracking', 'signalLoss', 'bars', 'splice'];

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragmentShader = `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tFocus;
uniform float uTime;
uniform float uDanger;
uniform float uExposure;
uniform vec2 uRes;      // taille du canvas, en pixels
uniform float uLines;   // lignes de la bande (balayage, bruit par ligne)
uniform float uBloomOn;
uniform float uHead;    // commutation des têtes
uniform float uTracking;
uniform float uSignal;  // perte de signal
uniform float uBars;
uniform float uSplice;
uniform float uRoll;    // roulement vertical de l'image (fraction d'image) après un raccord
uniform float uFreeze;
uniform float uChroma;
uniform float uFocus;
uniform vec3 uWhite;
uniform float uSoft;    // flashs adoucis
uniform float uBright;
uniform float uCam;     // 0 : à l'œil nu, 1 : au caméscope
uniform float uBox;     // largeur visible de l'image (4:3 au caméscope, 1 sinon)
uniform float uNight;   // mode nuit du caméscope (0 à 1)
uniform float uCctv;    // caméra de surveillance (0 à 1)
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// bruit lissé en largeur : les taches de couleur de la bande s'étirent à l'horizontale
float vnoise(float x, float y) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, y)), hash(vec2(i + 1.0, y)), f);
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// de l'image 4:3 du caméscope à la scène rendue (on en garde le centre)
vec2 S(vec2 uv) { return vec2((uv.x - 0.5) * uBox + 0.5, uv.y); }
vec3 grab(vec2 uv) { return texture2D(tDiffuse, S(uv)).rgb; }

// mire de barres SMPTE simplifiée : blanc, jaune, cyan, vert, magenta, rouge, bleu à 75 %
vec3 barColor(float i) {
  return vec3(step(mod(floor(i * 0.5), 2.0), 0.5), step(i, 3.5), step(mod(i, 2.0), 0.5)) * 0.75;
}
vec3 smpte(vec2 p) {
  float y = 1.0 - p.y; // 0 en haut
  float x = clamp(p.x, 0.0, 0.9999);
  float i = floor(x * 7.0);
  if (y < 0.67) return barColor(i);
  // bande fine : les barres à l'envers, séparées de noir
  if (y < 0.75) return mod(i, 2.0) > 0.5 ? vec3(0.075) : barColor(6.0 - i);
  // bas : -I, blanc, +Q, noir, puis les trois gris du PLUGE et du noir
  float s = floor(x * 5.6);
  if (s < 0.5) return vec3(0.0, 0.13, 0.30);
  if (s < 1.5) return vec3(1.0);
  if (s < 2.5) return vec3(0.2, 0.0, 0.42);
  if (s < 3.5 || x > 6.0 / 7.0) return vec3(0.075);
  float k = floor((x * 7.0 - 5.0) * 3.0);
  return vec3(0.075 + (k - 1.0) * 0.04);
}

void main() {
  // les bandes noires du format 4:3
  vec2 fuv = vec2((vUv.x - 0.5) / uBox + 0.5, vUv.y);
  if (fuv.x < 0.0 || fuv.x > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float cm = uCam;
  // l'entité qui approche : à l'œil nu, à peine ; au caméscope, la bande se déchire (plus fort qu'avant)
  float dg0 = smoothstep(0.3, 1.0, uDanger) * 0.6;
  float dg = dg0 * cm * 1.35;
  float soft = uSoft;
  // le tracking demandé, plus un peu quand l'entité approche ; au caméscope, la bande flotte toujours un peu
  float trk = clamp((uTracking + dg * 0.3) * cm + cm * 0.07, 0.0, 1.0);
  float t2 = trk * trk;
  float frame = floor(uTime * 30.0); // 30 images par seconde : le rythme de la bande
  float fr = mod(frame, 97.0);
  vec2 cs = fuv - 0.5;
  float r2 = dot(cs, cs);

  // 1. LA BANDE DANS LE MAGNÉTOSCOPE (coordonnées de l'image enregistrée)
  vec2 uv = fuv;
  // raccord : l'image saute de quelques lignes et roule avant de se recaler
  float jump = (hash(vec2(floor(uTime * 12.0), 3.1)) - 0.5) * uSplice * uSplice * 0.12 * (1.0 - soft * 0.7);
  float shiftY = fract(uRoll + jump + 1.0);
  uv.y = fract(uv.y + shiftY);
  // arrêt sur image : la trame sautille d'une ligne ou deux, une seule trame affichée (demi-définition verticale)
  if (uFreeze > 0.5) {
    uv.y += (hash(vec2(floor(uTime * (soft > 0.5 ? 6.0 : 14.0)), 7.7)) - 0.5) * 3.0 / uLines;
    float fl = uLines * 0.5;
    uv.y = (floor(uv.y * fl) + 0.5) / fl;
  }
  float tline = floor(uv.y * uLines);

  // bande de tracking qui défile lentement de bas en haut
  float bandY = fract(uTime * 0.06);
  float band = 1.0 - smoothstep(0.0, 0.04, abs(uv.y - bandY));
  float line = floor(uv.y * 240.0);
  float jitter = hash(vec2(line, floor(uTime * 24.0))) - 0.5;
  uv.x += jitter * dg * 0.008 + band * dg * 0.012 * (hash(vec2(uTime, line)) - 0.5);

  // défaut de tracking : l'image ondule, les lignes tremblent, deux bandes de bruit descendent
  uv.x += (sin(uv.y * 9.0 + uTime * 2.3) * 0.0035 + sin(uv.y * 41.0 - uTime * 5.1) * 0.0015) * trk;
  uv.x += (hash(vec2(tline, fr)) - 0.5) * 0.004 * t2;
  float tb1 = fract(-uTime * 0.11);
  float tb2 = fract(-uTime * 0.043 + 0.37);
  float tband = max(1.0 - smoothstep(0.0, 0.03 + 0.06 * trk, abs(uv.y - tb1)),
                    (1.0 - smoothstep(0.0, 0.02 + 0.05 * trk, abs(uv.y - tb2))) * smoothstep(0.3, 0.5, trk));
  tband *= smoothstep(0.0, 0.25, trk);
  uv.x += tband * (hash(vec2(tline, fr + 1.0)) - 0.5) * 0.03 * trk;

  // déchirures quand l'entité approche
  float blk = floor(uv.y * 28.0);
  float tear = step(1.0 - dg * 0.16, hash(vec2(blk, floor(uTime * 14.0))));
  uv.x += tear * (hash(vec2(blk, uTime)) - 0.5) * 0.09 * dg;

  // commutation des têtes : les dernières lignes de l'image partent vers la droite, déchirées et bruitées
  float hd = uHead * cm * 1.6;
  float hsH = max((0.012 + dg * 0.02 + trk * 0.02) * hd, 0.0001);
  float inHead = step(uv.y, hsH) * step(0.001, hd);
  float hsT = clamp(1.0 - uv.y / hsH, 0.0, 1.0); // 1 tout en bas
  uv.x += inHead * (0.008 + 0.03 * hsT * hsT * (0.8 + 0.2 * sin(uTime * 1.7)) + (hash(vec2(tline, fr + 2.0)) - 0.5) * 0.008) * min(hd, 2.0);

  vec2 tuv = uv; // coordonnées sur la bande (la mire n'est pas passée par l'objectif)
  // objectif bombé (au caméscope)
  vec2 c = uv - 0.5;
  uv = 0.5 + c * mix(1.0, 0.975 + 0.09 * dot(c, c), cm);

  // 2. L'IMAGE DU CAMÉSCOPE
  // bavure des couleurs (rouge et bleu décalés) et flou horizontal de la bande magnétique
  float ca = dg0 * 0.0035 + cm * 0.0018 + dg * 0.007 + trk * 0.004;
  vec3 col;
  col.r = grab(uv + vec2(ca, 0.0)).r;
  col.g = grab(uv).g;
  col.b = grab(uv - vec2(ca * 1.4, 0.0)).b;
  vec3 blur = (grab(uv + vec2(0.0035, 0.0)) + grab(uv - vec2(0.0035, 0.0)) + grab(uv + vec2(0.007, 0.0)) + grab(uv - vec2(0.007, 0.0))) * 0.25;
  col = mix(col, blur, cm * 0.16 + dg * 0.12 + trk * 0.15);
  // mise au point qui cherche
  if (uFocus > 0.001) col = mix(col, texture2D(tFocus, S(uv)).rgb, smoothstep(0.0, 0.35, uFocus));
  // halo des néons et des lumières vives (il bave plus sur la bande)
  if (uBloomOn > 0.5) col += texture2D(tBloom, S(uv)).rgb * (1.1 + cm * 0.5);
  // balance des blancs du caméscope
  col *= uWhite;

  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));

  // étalonnage : jaune franc et un peu vert comme dans les vidéos, noirs bien noirs
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.08);
  col = col * vec3(1.0, 1.0, 0.86) + vec3(0.003, 0.003, 0.002);

  // mire de barres (enregistrée sur la bande : elle subit les mêmes défauts)
  if (uBars > 0.001) {
    vec3 bc;
    bc.r = smpte(tuv + vec2(ca, 0.0)).r;
    bc.g = smpte(tuv).g;
    bc.b = smpte(tuv - vec2(ca * 1.4, 0.0)).b;
    bc = mix(bc, (smpte(tuv + vec2(0.004, 0.0)) + smpte(tuv - vec2(0.004, 0.0))) * 0.5, 0.3);
    col = mix(col, bc, uBars);
  }

  // 3. LES DÉFAUTS DE LA LECTURE
  // bruit de couleur : demandé, gain poussé dans le noir (exposition au-dessus de 1,15), tracking, entité
  float chr = clamp(max(uChroma, smoothstep(1.15, 1.45, uExposure) * 0.3 * cm) + cm * 0.18 + trk * 0.2 + dg * 0.15, 0.0, 1.0);
  if (chr > 0.001) {
    float nx = fuv.x * uRes.x / 7.0;
    float ny = tline + fr * 17.0;
    vec3 cn = vec3(vnoise(nx, ny), vnoise(nx + 31.0, ny + 5.0), vnoise(nx + 67.0, ny + 11.0)) - 0.5;
    cn -= dot(cn, vec3(0.299, 0.587, 0.114)); // la couleur seulement, pas la luminosité
    float lm = dot(col, vec3(0.299, 0.587, 0.114));
    col += cn * chr * 0.22 * (0.45 + 0.55 * (1.0 - lm)); // plus visible dans les ombres
    col = mix(vec3(lm), col, 1.0 - chr * 0.45);
  }
  // perte de couleur du tracking (et de la bande des têtes), par à-coups quand c'est grave
  float lumT = dot(col, vec3(0.299, 0.587, 0.114));
  float kill = trk * 0.55 + t2 * 0.4 * step(0.55, hash(vec2(floor(uTime * 5.0), 9.1))) + inHead * 0.5;
  col = mix(col, vec3(lumT), clamp(kill, 0.0, 0.95));
  // traits de bruit blancs, étirés à l'horizontale : dans les bandes de tracking et la bande des têtes
  float dash = mix(6.0, 60.0, hash(vec2(tline, fr + 3.0)));
  float streak = step(1.0 - (tband * 0.35 * trk + t2 * 0.01 + inHead * hsT * 0.3 * min(hd, 2.0)),
                      hash(vec2(floor(vUv.x * uRes.x / dash), tline + fr * 13.0)));
  col = mix(col, vec3(0.85), streak * (soft > 0.5 ? 0.45 : 0.8));
  if (inHead > 0.5) col = mix(col, vec3(hash(vec2(floor(vUv.x * uRes.x / 3.0), tline + fr * 3.0))), hsT * 0.3 * min(hd, 1.0));

  // hors de l'image, et la barre noire entre deux images quand l'image roule
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  col *= 1.0 - (1.0 - smoothstep(0.0, 0.035, tuv.y)) * step(0.002, shiftY) * step(shiftY, 0.998);

  // 4. LE SIGNAL QUI ARRIVE À LA TÉLÉ
  float sfr = mod(soft > 0.5 ? floor(uTime * 15.0) : frame, 113.0);
  // neige : perte de signal, raccord de bande, tracking désespéré
  float snowAmt = smoothstep(0.0, 0.65, uSignal);
  snowAmt = max(snowAmt, smoothstep(0.25, 1.0, uSplice) * (soft > 0.5 ? 0.5 : 0.9));
  snowAmt = max(snowAmt, smoothstep(0.7, 1.0, trk) * 0.4);
  if (snowAmt > 0.001) {
    float sy = floor(vUv.y * uLines) + sfr * 7.13;
    float sn = hash(vec2(floor(vUv.x * uRes.x * 0.5), sy));
    sn = sn * sn * 1.25 * (0.8 + 0.2 * sin(vUv.y * 5.0 + uTime * 2.0)); // grains plus noirs que blancs, barres de synchro lentes
    vec3 snc = vec3(sn) + (vec3(hash(vec2(sy, vUv.x * 9.1)), hash(vec2(vUv.x * 7.3, sy)), hash(vec2(sy * 1.7, vUv.x))) - 0.5) * 0.08;
    if (soft > 0.5) snc = mix(vec3(0.4), snc, 0.6);
    col = mix(col, snc, snowAmt);
  }
  // au caméscope : la neige de fond d'un signal faible (permanente, plus forte par bouffées), une barre de bruit qui
  // roule lentement de haut en bas, et des lignes qui décrochent
  if (cm > 0.001) {
    float sy2 = floor(vUv.y * uLines) + sfr * 7.13 + 3.0;
    float sn2 = hash(vec2(floor(vUv.x * uRes.x * 0.5), sy2));
    float gust = step(0.82, hash(vec2(floor(uTime * 3.0), 4.2)));
    float st = cm * (0.06 + 0.045 * gust) * (soft > 0.5 ? 0.6 : 1.0);
    col = mix(col, vec3(sn2 * sn2 * 1.2), st);
    float rb = 1.0 - smoothstep(0.0, 0.045, abs(fract(vUv.y + uTime * 0.07) - 0.5));
    col = mix(col, vec3(sn2) * 0.9, rb * cm * 0.13);
    float drop = step(0.992, hash(vec2(floor(vUv.y * uLines * 0.5), fr)));
    col = mix(col, vec3(0.9), drop * cm * 0.25);
  }
  // flash du raccord
  col += uSplice * uSplice * uSplice * 0.3 * (soft > 0.5 ? 0.25 : 1.0);
  // écran bleu du magnétoscope (le texte « NO SIGNAL » est mis par l'interface)
  col = mix(col, vec3(0.06, 0.13, 0.78), smoothstep(0.85, 1.0, uSignal));

  // 5. L'ÉCRAN
  // pause : la barre de bruit du magnétoscope, presque immobile
  if (uFreeze > 0.5) {
    float pb = 1.0 - smoothstep(0.0, 0.022, abs(vUv.y - 0.1 - 0.015 * sin(uTime * 0.9)));
    float pn = step(0.45, hash(vec2(floor(vUv.x * uRes.x / 5.0), floor(vUv.y * uLines) + sfr)));
    col = mix(col, col * 0.4 + vec3(0.75) * pn, pb * 0.85);
  }
  // mode nuit : vert monochrome, gain poussé à fond
  if (uNight > 0.001) {
    float ln = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 ng = vec3(0.42, 1.0, 0.46) * pow(ln, 0.85) * 1.0 + vec3(0.0, 0.025, 0.0);
    col = mix(col, ng, uNight);
  }
  // caméra de surveillance : un noir et blanc un peu vert, contrasté, une barre plus claire qui remonte lentement
  if (uCctv > 0.001) {
    float lc = dot(col, vec3(0.299, 0.587, 0.114));
    lc = smoothstep(0.02, 0.95, pow(lc, 0.9));
    float roll = 1.0 + 0.06 * smoothstep(0.08, 0.0, abs(fract(vUv.y + uTime * 0.07) - 0.5));
    col = mix(col, vec3(0.86, 0.96, 0.86) * lc * roll, uCctv);
  }
  // lignes de balayage (au caméscope), calées sur les lignes de la bande, estompées si l'écran est trop petit
  float cyc = uLines * 0.4;
  float sAmp = 0.06 * cm * clamp((uRes.y / cyc - 1.8) / 0.8, 0.0, 1.0);
  col *= 1.0 - sAmp + sAmp * sin(vUv.y * cyc * 6.2831853);
  // grain : à peine à l'œil nu ; fort au caméscope, et plus encore dans le noir et en mode nuit
  float gain = clamp((uExposure - 1.0) * 0.06, 0.0, 0.04);
  col += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * (0.006 + dg0 * 0.05 + cm * (0.03 + gain) + uNight * 0.09 + dg * 0.18);
  col += band * dg * 0.05;
  // parasites blancs : seulement quand l'entité est là
  if (dg > 0.05 && hash(vec2(floor(vUv.x * 160.0), floor(vUv.y * 120.0) + floor(uTime * 20.0))) > 1.0 - dg * 0.004) col += soft > 0.5 ? 0.2 : 0.5;

  // vignette (plus lourde dans l'objectif du caméscope)
  col *= 1.0 - r2 * mix(0.8, 1.25, cm);
  // luminosité du joueur : une courbe douce, le noir reste noir
  col = pow(max(col, vec3(0.0)), vec3(1.0 / uBright));
  gl_FragColor = vec4(col, 1.0);
}`;

// Halo : on garde ce qui dépasse le blanc, en quart de définition, puis on le floute (horizontal, vertical, deux fois)
const brightShader = `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  gl_FragColor = vec4(max(c - vec3(1.0), 0.0), 1.0);
}`;
// flou séparable (halo et mise au point)
const blurShader = `
uniform sampler2D tDiffuse;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227;
  c += (texture2D(tDiffuse, vUv + uDir * 1.385).rgb + texture2D(tDiffuse, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(tDiffuse, vUv + uDir * 3.231).rgb + texture2D(tDiffuse, vUv - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export function createVhsFilter(renderer) {
  const target = new THREE.WebGLRenderTarget(4, 4, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    // anticrénelage : 4 échantillons par pixel (bords des murs, des néons et des piliers sans marches d'escalier)
    samples: renderer.capabilities && renderer.capabilities.isWebGL2 === false ? 0 : 4,
  });
  const half = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const bloomA = half();
  const bloomB = half();
  // l'éblouissement large (Level 1) : deux étages plus flous encore (1/8 et 1/16), ajoutés au halo serré. Une lampe
  // vive bave sur une grande largeur, en s'éteignant doucement, comme dans l'optique d'un vrai caméscope
  const bloomC = half();
  const bloomC2 = half();
  const bloomD = half();
  const bloomD2 = half();
  let glare = 0;
  const addMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uK: { value: 1 } },
    vertexShader,
    fragmentShader: 'uniform sampler2D tDiffuse;\nuniform float uK;\nvarying vec2 vUv;\nvoid main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * uK, 1.0); }',
    depthTest: false,
    depthWrite: false,
  });
  const addBlend = addMat.clone();
  addBlend.blending = THREE.AdditiveBlending;
  addBlend.transparent = true;
  // mise au point : la scène floutée en demi-définition (deux passes seulement quand le flou est demandé)
  const focusA = half();
  const focusB = half();
  const bright = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: target.texture }, uTexel: { value: new THREE.Vector2() } }, vertexShader, fragmentShader: brightShader, depthTest: false, depthWrite: false });
  const blurMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader, fragmentShader: blurShader, depthTest: false, depthWrite: false });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      tBloom: { value: bloomA.texture },
      tFocus: { value: focusB.texture },
      uTime: { value: 0 },
      uDanger: { value: 0 },
      uExposure: { value: 1.2 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uLines: { value: LINES },
      uBloomOn: { value: 1 },
      uHead: { value: FX_DEFAULTS.headSwitch },
      uTracking: { value: 0 },
      uSignal: { value: 0 },
      uBars: { value: 0 },
      uSplice: { value: 0 },
      uRoll: { value: 0 },
      uFreeze: { value: 0 },
      uChroma: { value: 0 },
      uFocus: { value: 0 },
      uWhite: { value: new THREE.Vector3(1, 1, 1) },
      uSoft: { value: 0 },
      uBright: { value: 1 },
      uCam: { value: 0 },
      uBox: { value: 1 },
      uNight: { value: 0 },
      uCctv: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const U = material.uniforms;
  // brume en volume (Level 1) : calculée d'après la profondeur de l'image, puis posée par-dessus la scène
  // (lumière diffusée ajoutée, ce qu'elle cache assombri). La scène la fournit avec setFog
  let fogFn = null;
  let fogRT = null;
  let fogRT2 = null;
  // flou de la brume (horizontal puis vertical) qui ne traverse pas les contours : un pixel ne prend que ses voisins
  // à la même profondeur (pas de brume qui bave sur un montant d'étagère devant elle). Il efface aussi le grain du
  // calcul (le départ décalé d'un pixel à l'autre)
  const fogBlur = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() }, uNF: { value: new THREE.Vector2(0.1, 100) } },
    vertexShader,
    fragmentShader: `uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uDir;
uniform vec2 uNF;
varying vec2 vUv;
float lin(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - z * (uNF.y - uNF.x));
}
void main() {
  float zc = lin(texture2D(tDepth, vUv).x);
  float tol = 0.03 + zc * 0.05;
  vec4 acc = vec4(0.0);
  float ws = 0.0;
  for (int i = -5; i <= 5; i++) {
    vec2 uv = vUv + uDir * float(i);
    float w = exp(-float(i * i) / 12.0) * exp(-abs(lin(texture2D(tDepth, uv).x) - zc) / tol);
    acc += texture2D(tDiffuse, uv) * w;
    ws += w;
  }
  gl_FragColor = acc / ws;
}`,
    depthTest: false,
    depthWrite: false,
  });
  const fogComp = new THREE.ShaderMaterial({
    uniforms: { tFog: { value: null } },
    vertexShader,
    fragmentShader: `uniform sampler2D tFog;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tFog, vUv);
}`,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const fogSize = () => {
    if (!fogRT) return;
    const k = target.height > 760 ? 2 : 1; // en pleine définition, la brume (douce) se calcule en demi-définition
    const w = Math.max(1, Math.round(target.width / k));
    const h = Math.max(1, Math.round(target.height / k));
    if (fogRT.width !== w || fogRT.height !== h) {
      fogRT.setSize(w, h);
      fogRT2.setSize(w, h);
    }
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const fx = { ...FX_DEFAULTS, white: [...FX_DEFAULTS.white] };
  const live = { tracking: 0, signalLoss: 0, bars: 0, splice: 0 }; // valeurs réellement affichées (ralenties si flashs adoucis)
  let quality = 'high';
  let tapeLines = LINES; // lignes de la bande pour la qualité choisie : elles calent le balayage
  let wantLines = LINES; // lignes de rendu voulues (résolution dynamique)
  // à l'œil nu (sans caméscope), en qualité haute ou automatique : l'image est calculée en pleine définition (les
  // pixels de l'écran) au lieu des lignes de la bande ; la résolution dynamique ne la baisse que si le jeu rame
  let fullOk = true;
  const fullH = () => Math.max(1, Math.round(ch * renderer.getPixelRatio()));
  const wantH = () => Math.max(1, fx.cam < 0.5 && fullOk ? Math.min(wantLines, fullH()) : Math.min(wantLines, tapeLines, ch));
  let bloomOn = true;
  let cw = 1; // taille du canvas
  let ch = 1;
  let lastResize = -1e9;
  let lastNow = null;
  let roll = 0; // roulement de l'image après un raccord (0 à 1)
  let hasFrame = false; // la cible contient une image de la scène (pour l'arrêt sur image)

  // retaille les cibles seulement si la taille change vraiment (pas de réallocation sinon)
  function applySize() {
    const lines = wantH();
    const tw = Math.max(1, Math.round((lines * cw) / ch));
    lastResize = now();
    U.uLines.value = Math.max(1, Math.min(tapeLines, ch));
    if (target.width === tw && target.height === lines) return;
    target.setSize(tw, lines);
    bloomA.setSize(Math.max(1, tw >> 2), Math.max(1, lines >> 2));
    bloomB.setSize(Math.max(1, tw >> 2), Math.max(1, lines >> 2));
    for (const rt of [bloomC, bloomC2]) rt.setSize(Math.max(1, tw >> 3), Math.max(1, lines >> 3));
    for (const rt of [bloomD, bloomD2]) rt.setSize(Math.max(1, tw >> 4), Math.max(1, lines >> 4));
    focusA.setSize(Math.max(1, tw >> 1), Math.max(1, lines >> 1));
    focusB.setSize(Math.max(1, tw >> 1), Math.max(1, lines >> 1));
    bright.uniforms.uTexel.value.set(1 / tw, 1 / lines);
    fogSize();
    hasFrame = false;
  }

  function pass(mat, input, dir, out) {
    quad.material = mat;
    mat.uniforms.tDiffuse.value = input;
    if (dir) mat.uniforms.uDir.value.copy(dir);
    renderer.setRenderTarget(out);
    renderer.render(post, cam);
  }
  const dirTmp = new THREE.Vector2();

  const api = {
    uniforms: material.uniforms,
    get quality() {
      return quality;
    },
    // largeur de chaque bande noire, en pixels CSS du canvas (pour y caler l'interface)
    get bars() {
      return ((1 - U.uBox.value) * cw) / 2;
    },
    // lignes de rendu réellement utilisées en ce moment
    get lines() {
      return target.height;
    },
    // le plus de lignes que l'image peut prendre en ce moment (pleine définition à l'œil nu, la bande au caméscope)
    get maxLines() {
      return fx.cam < 0.5 && fullOk ? fullH() : Math.min(tapeLines, ch);
    },
    setSize(w, h) {
      cw = Math.max(1, w | 0);
      ch = Math.max(1, h | 0);
      U.uRes.value.set(cw, ch);
      applySize();
    },
    // qualité : 'low' (480 lignes, sans halo), 'medium' (600), 'high' (720 au caméscope, pleine définition à l'œil
    // nu, par défaut)
    setQuality(q) {
      quality = QUALITY[q] ? q : 'high';
      tapeLines = QUALITY[quality];
      fullOk = quality === 'high';
      wantLines = fullOk ? MAX_LINES : tapeLines;
      bloomOn = quality !== 'low';
      U.uBloomOn.value = bloomOn ? 1 : 0;
      applySize();
    },
    // résolution dynamique : n lignes de rendu (240 à 1080, arrondi à 8). Le balayage reste calé sur la qualité,
    // et la taille ne change qu'au plus toutes les 0,5 s (appliquée au rendu suivant)
    setLines(n) {
      wantLines = clamp(Math.round(num(n, tapeLines) / 8) * 8, MIN_LINES, MAX_LINES);
    },
    // fusionne des réglages (voir FX_DEFAULTS) ; getFx les relit. Appelé à chaque image : ne renvoie rien et ne crée
    // rien (avant, une copie de tous les réglages à jeter, à chaque appel)
    setFx(partial = {}) {
      for (const k in partial) {
        if (!(k in FX_DEFAULTS)) continue;
        const v = partial[k];
        if (k === 'white') {
          if (Array.isArray(v) && v.length >= 3) for (let i = 0; i < 3; i++) fx.white[i] = clamp(num(v[i], 1), 0, 3);
        } else if (k === 'freeze' || k === 'reduceFlashes') fx[k] = !!v;
        else if (k === 'brightness') fx.brightness = clamp(num(v, 1), 0.5, 1.8);
        else if (k === 'headSwitch') fx.headSwitch = clamp(num(v, 1), 0, 3);
        else fx[k] = clamp(num(v, 0), 0, 1);
      }
    },
    // brume en volume : fn(camera, profondeur) met à jour son matériau plein écran et le renvoie (ou null : pas de
    // brume cette image). La profondeur de la scène devient alors une texture (lue par la brume)
    setFog(fn) {
      fogFn = typeof fn === 'function' ? fn : null;
      if (fogFn && !target.depthTexture) {
        target.depthTexture = new THREE.DepthTexture(target.width, target.height);
        target.dispose(); // la cible se refait au prochain rendu, avec sa profondeur en texture
        fogRT = half();
        fogRT2 = half();
        fogSize();
      }
    },
    // l'éblouissement large autour des lumières vives (0 : le halo serré seul, comme aux autres niveaux)
    setGlare(k) {
      glare = clamp(num(k, 0), 0, 2);
    },
    getFx() {
      return { ...fx, white: [...fx.white] };
    },
    // revient aux réglages par défaut ; renvoie les réglages courants
    resetFx() {
      api.setFx(FX_DEFAULTS);
      return api.getFx();
    },
    // exposure : l'exposition voulue par la caméra (1 en pleine lumière, plus haut dans le noir)
    render(scene, camera, time, danger, exposure = 1.2) {
      const t = now();
      const dt = lastNow == null ? 0 : clamp(t - lastNow, 0, 0.1);
      lastNow = t;
      if (target.height !== wantH() && t - lastResize >= RESIZE_EVERY) applySize();

      // flashs adoucis : les effets plein écran glissent au lieu de sauter
      const soft = fx.reduceFlashes;
      for (const k of SLEW_KEYS) {
        if (!soft) live[k] = fx[k];
        else live[k] += clamp(fx[k] - live[k], -SOFT_RATE * dt, SOFT_RATE * dt);
      }
      // raccord : l'image roule tant qu'il dure, puis finit son tour et se recale
      const sp = live.splice;
      if (sp > 0.05) roll += dt * (0.4 + sp * 1.8) * sp * (soft ? 0.5 : 1);
      else if (roll > 0) roll += dt * (soft ? 0.6 : 1.1);
      if (roll >= 1) roll = sp > 0.05 ? roll - 1 : 0;

      U.uTime.value = time;
      U.uDanger.value = clamp(Math.max(num(danger, 0), fx.danger), 0, 1);
      U.uExposure.value = exposure;
      U.uHead.value = fx.headSwitch;
      U.uTracking.value = live.tracking;
      U.uSignal.value = live.signalLoss;
      U.uBars.value = live.bars;
      U.uSplice.value = sp;
      U.uRoll.value = roll;
      U.uChroma.value = fx.chroma;
      U.uWhite.value.set(fx.white[0], fx.white[1], fx.white[2]);
      U.uSoft.value = soft ? 1 : 0;
      U.uBright.value = fx.brightness;
      // au caméscope : l'image 4:3 au centre, deux bandes noires sur les côtés (rien si l'écran est déjà étroit)
      U.uCam.value = fx.cam;
      U.uNight.value = fx.night * fx.cam;
      U.uCctv.value = fx.cctv;
      U.uBox.value = 1 + (Math.min(1, (ch * 4) / 3 / cw) - 1) * fx.cam;
      // mise au point qui cherche : le flou respire un peu autour de la valeur demandée
      const focus = fx.focus > 0.001 ? clamp(fx.focus * (0.88 + 0.12 * Math.sin(time * 4.1) * Math.sin(time * 1.3 + 1)), 0, 1) : 0;
      U.uFocus.value = focus;

      // arrêt sur image : on garde la dernière image de la scène (et son halo)
      const frozen = fx.freeze && hasFrame;
      U.uFreeze.value = fx.freeze ? 1 : 0;
      if (!frozen) {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        hasFrame = true;
        const fm = fogFn && target.depthTexture ? fogFn(camera, target.depthTexture) : null;
        if (fm) {
          quad.material = fm;
          renderer.setRenderTarget(fogRT);
          renderer.render(post, cam);
          const B = fogBlur.uniforms;
          B.tDepth.value = target.depthTexture;
          B.uNF.value.set(camera.near, camera.far);
          quad.material = fogBlur;
          B.tDiffuse.value = fogRT.texture;
          B.uDir.value.set(1 / fogRT.width, 0);
          renderer.setRenderTarget(fogRT2);
          renderer.render(post, cam);
          B.tDiffuse.value = fogRT2.texture;
          B.uDir.value.set(0, 1 / fogRT.height);
          renderer.setRenderTarget(fogRT);
          renderer.render(post, cam);
          // posée sur l'image de la scène, sans l'effacer
          quad.material = fogComp;
          fogComp.uniforms.tFog.value = fogRT.texture;
          const ac = renderer.autoClear;
          renderer.autoClear = false;
          renderer.setRenderTarget(target);
          renderer.render(post, cam);
          renderer.autoClear = ac;
        }
        // halo des lumières vives
        if (bloomOn) {
          quad.material = bright;
          renderer.setRenderTarget(bloomA);
          renderer.render(post, cam);
          const bw = bloomA.width;
          const bh = bloomA.height;
          for (let i = 0; i < 2; i++) {
            pass(blurMat, bloomA.texture, dirTmp.set((1 + i) / bw, 0), bloomB);
            pass(blurMat, bloomB.texture, dirTmp.set(0, (1 + i) / bh), bloomA);
          }
          if (glare > 0) {
            // les deux étages larges : chacun réduit du précédent et flouté, puis le plus large rendu au moyen, et le
            // moyen au halo serré
            addMat.uniforms.uK.value = 1;
            pass(addMat, bloomA.texture, null, bloomC);
            for (let i = 0; i < 2; i++) {
              pass(blurMat, bloomC.texture, dirTmp.set((1 + i) / bloomC.width, 0), bloomC2);
              pass(blurMat, bloomC2.texture, dirTmp.set(0, (1 + i) / bloomC.height), bloomC);
            }
            pass(addMat, bloomC.texture, null, bloomD);
            for (let i = 0; i < 2; i++) {
              pass(blurMat, bloomD.texture, dirTmp.set((1 + i) / bloomD.width, 0), bloomD2);
              pass(blurMat, bloomD2.texture, dirTmp.set(0, (1 + i) / bloomD.height), bloomD);
            }
            const ac = renderer.autoClear;
            renderer.autoClear = false;
            addBlend.uniforms.uK.value = 1;
            pass(addBlend, bloomD.texture, null, bloomC);
            addBlend.uniforms.uK.value = glare;
            pass(addBlend, bloomC.texture, null, bloomA);
            renderer.autoClear = ac;
          }
        }
      }
      if (focus > 0) {
        // deux tours horizontal + vertical en demi-définition, à rayons croissants (pas d'image fantôme)
        const fw = focusA.width;
        const fh = focusA.height;
        for (let i = 0; i < 2; i++) {
          const rad = (0.5 + 1.6 * focus) * (1 + i); // en pixels de demi-définition
          pass(blurMat, i ? focusB.texture : target.texture, dirTmp.set(rad / fw, 0), focusA);
          pass(blurMat, focusA.texture, dirTmp.set(0, rad / fh), focusB);
        }
      }
      quad.material = material;
      renderer.setRenderTarget(null);
      renderer.render(post, cam);
    },
    dispose() {
      for (const rt of [target, bloomA, bloomB, bloomC, bloomC2, bloomD, bloomD2, focusA, focusB, fogRT, fogRT2]) if (rt) rt.dispose();
      for (const m of [material, bright, blurMat, addMat, addBlend, fogComp, fogBlur]) m.dispose();
      quad.geometry.dispose();
    },
  };
  return api;
}
