// odyssee/moteur/render/textures.js — images du rendu d'essai : sols (atlas), sprites des personnages HGSS,
// décor (arbres, panneaux, mobilier) et façades dessinées au canevas pour les bâtiments.
// Tout est provisoire : le moteur ne dépend d'aucune de ces images, on les remplacera par les dessins d'Odyssée.
import * as THREE from 'three';

const IMG = '../img/';
const OW = '../../assets/graphics/hgss/ow/';

/** sol → image (16 ou 32 px ; tout est ramené à 32 px dans l'atlas) */
export const SOL_IMG = {
  herbe: 'sol16/herbe_v1.png', herbe2: 'sol16/herbe_v1.png', hautes_herbes: 'sol16/hautes_herbes0.png',
  chemin: 'sol32/path0.png', pave: 'sol32/pave0.png', fleurs: 'sol32/flowerR.png', sable: 'sol32/sand0.png',
  eau: 'sol32/water0.png', eau_profonde: 'sol32/deep0.png', parquet: 'sol32/floor_wood.png', mur: 'sol/walltop.png',
  carrelage: 'sol32/floor_white.png', labo: 'sol/floor_lab.png', tapis: 'sol/mat.png', glace: 'sol32/ice.png',
  grotte: 'sol32/cave0.png', paroi: 'sol/cavetop.png', rebord: 'sol32/ledge.png', falaise: 'sol32/cliffR.png',
  marches: 'sol32/stairs.png', ponton: 'sol32/dock0.png',
};
/** faces verticales */
export const FACE_IMG = { mur: 'sol/wall_in.png', paroi: 'sol/cavewall.png', falaise: 'sol32/cliffR.png', terre: 'sol32/cliffG.png' };
export const EAU_IMG = ['sol32/water0.png', 'sol32/water1.png', 'sol32/water2.png', 'sol32/water3.png'];

/** décor → [image, pixels par case] (les dessins « version 2 » d'Odyssée : 32 px par case) */
export const DECOR_IMG = {
  arbre: ['nature/tree.png', 32], pin: ['nature/pine.png', 32], barriere: ['nature/fence.png', 64], rocher: ['nature/rock.png', 32],
  panneau: ['nature/sign.png', 32], boite: ['nature/mailbox.png', 32], objet: ['nature/itemball.png', 32],
  table: ['mobilier/table.png', 32], cuisine: ['mobilier/kitchen.png', 32], lit: ['mobilier/bed.png', 32], etagere: ['mobilier/shelf.png', 32],
  tele: ['mobilier/tv.png', 32], machine: ['mobilier/labmachine.png', 32], pc: ['mobilier/pc.png', 32], table_balls: ['mobilier/startertable.png', 32],
  comptoir: ['mobilier/counterseg.png', 32],
};

export function charger(src) {
  return new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => { console.warn('image manquante', src); ok(null); };
    i.src = src;
  });
}
export function texture(src) {
  const t = src instanceof HTMLCanvasElement || src instanceof HTMLImageElement ? new THREE.Texture(src) : null;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

/**
 * Charge tout. Rend { atlas: { tex, uv(nom) }, faces, eau, decor: { nom: { tex, l, h } }, persos: { nom: img } }.
 * L'atlas range chaque sol dans une case de 32 px entourée d'une marge de 2 px recopiée (pas de lignes entre les cases).
 */
export async function chargerTout(sols, spritesPersos) {
  const C = 36, M = 2, par = 8;
  const noms = [...new Set([...sols.filter((n) => n !== 'vide'), ...Object.keys(FACE_IMG).map((n) => 'face_' + n)])];
  const lignes = Math.ceil(noms.length / par);
  const cv = document.createElement('canvas'); cv.width = par * C; cv.height = lignes * C;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const pos = {};
  await Promise.all(noms.map(async (n, i) => {
    const src = n.startsWith('face_') ? FACE_IMG[n.slice(5)] : SOL_IMG[n];
    const im = src ? await charger(IMG + src) : null;
    const x = (i % par) * C, y = ((i / par) | 0) * C;
    pos[n] = [x + M, y + M];
    if (!im) { g.fillStyle = '#f0f'; g.fillRect(x, y, C, C); return; }
    // marge : la tuile étirée, puis la tuile au centre
    g.drawImage(im, x, y, C, C);
    g.drawImage(im, x + M, y + M, 32, 32);
  }));
  const tex = texture(cv);
  const uv = (n) => {
    const p = pos[n] || pos.herbe;
    return [p[0] / cv.width, 1 - (p[1] + 32) / cv.height, (p[0] + 32) / cv.width, 1 - p[1] / cv.height];
  };
  // eau animée : quatre images empilées
  const ecv = document.createElement('canvas'); ecv.width = 32; ecv.height = 128;
  const eg = ecv.getContext('2d'); eg.imageSmoothingEnabled = false;
  (await Promise.all(EAU_IMG.map((s) => charger(IMG + s)))).forEach((im, i) => im && eg.drawImage(im, 0, i * 32, 32, 32));
  const eau = texture(ecv); eau.wrapS = eau.wrapT = THREE.RepeatWrapping; eau.repeat.set(1, 0.25);
  const decor = {};
  await Promise.all(Object.entries(DECOR_IMG).map(async ([n, [src, ppc]]) => {
    const im = await charger(IMG + src);
    if (im) decor[n] = { tex: texture(im), l: im.width / ppc, h: im.height / ppc };
  }));
  const persos = {};
  await Promise.all(spritesPersos.map(async (n) => { persos[n] = await charger(OW + n + '.png'); }));
  return { atlas: { tex, uv }, eau, decor, persos };
}

/** façade d'un bâtiment, dessinée au canevas (mur, fenêtres, porte) */
export function facade(b, l, H) {
  const ppc = 16, cv = document.createElement('canvas');
  cv.width = l * ppc; cv.height = H * ppc;
  const g = cv.getContext('2d');
  const murs = { labo: '#d8d4c8', maison: '#efe2c4', grotte: '#6e5a44' };
  g.fillStyle = murs[b.modele] || '#e8dcc0'; g.fillRect(0, 0, cv.width, cv.height);
  if (b.modele === 'grotte') {
    g.fillStyle = '#4b3c2c'; for (let i = 0; i < 40; i++) g.fillRect((i * 37) % cv.width, (i * 23) % cv.height, 6, 4);
    if (b.porte !== undefined) { g.fillStyle = '#000'; g.beginPath(); g.ellipse((b.porte + 0.5) * ppc, cv.height, ppc * 0.7, ppc * 1.2, 0, Math.PI, 0); g.fill(); }
    return texture(cv);
  }
  // soubassement
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, cv.height - 5, cv.width, 5);
  // fenêtres
  for (let x = 0; x < l; x++) {
    if (x === b.porte || x === 0 || x === l - 1) continue;
    if ((x + (b.porte ?? 0)) % 2 === 0) continue;
    g.fillStyle = '#5b6a7a'; g.fillRect(x * ppc + 3, cv.height - ppc * 1.4, ppc - 6, ppc * 0.7);
    g.fillStyle = '#a8d8f0'; g.fillRect(x * ppc + 4, cv.height - ppc * 1.4 + 1, ppc - 8, ppc * 0.7 - 2);
  }
  if (b.porte !== undefined) {
    g.fillStyle = '#6b4226'; g.fillRect(b.porte * ppc + 2, cv.height - ppc * 1.1, ppc - 4, ppc * 1.1);
    g.fillStyle = '#e8c070'; g.fillRect(b.porte * ppc + ppc - 6, cv.height - ppc * 0.6, 2, 2);
  }
  return texture(cv);
}
export function toit(couleur) {
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
  const g = cv.getContext('2d');
  const c = { rouge: ['#c0504a', '#9a3a36'], bleu: ['#4a78c0', '#36589a'], gris: ['#8a8e96', '#6a6e76'] }[couleur] || ['#b0704a', '#8a5636'];
  g.fillStyle = c[0]; g.fillRect(0, 0, 32, 32);
  g.fillStyle = c[1]; for (let y = 0; y < 32; y += 8) g.fillRect(0, y, 32, 2);
  const t = texture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
