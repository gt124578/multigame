// odyssee/moteur/render/textures.js — images du rendu d'essai : sols (atlas), sprites des personnages HGSS,
// décor (arbres, panneaux, mobilier) et façades dessinées au canevas pour les bâtiments.
// Tout est provisoire : le moteur ne dépend d'aucune de ces images, on les remplacera par les dessins d'Odyssée.
import * as THREE from 'three';

const IMG = '../img/';
const OW = '../../assets/graphics/hgss/ow/';

/**
 * Pack « hgss » : les textures de HeartGold / SoulSilver publiées par Pokémon DS Map Studio (Trifindo), lues À LA VOLÉE
 * sur leur dépôt public au moment du chargement : aucune n'est copiée dans ce dépôt. Les 16 px sont agrandies en 32 px
 * (au plus proche) dans l'atlas. Si une image ne vient pas (hors ligne), on reprend celle d'Odyssée.
 * Une entrée = une image, ou des calques [{ f, crop: [x, y, l, h], dest: [x, y, l, h] }] dans une case de 32 px.
 */
export const PDSMS = 'https://raw.githubusercontent.com/Trifindo/Pokemon-DS-Map-Studio/ac30b653e5b090ce116278ed6ba9758fff956673/src/main/resources/tilesets/Heart_Gold_-_Soul_Silver/';
const OW_ = 'Tileset_2_-_Overworld/', NB = 'Tileset_25_-_New_Bark_Town_Houses_(by_Monkeyboy0)/';
const H = (f) => PDSMS + encodeURI(f);
export const PACK_HGSS = {
  sols: {
    herbe: H(OW_ + 'grass01.png'), herbe2: H(OW_ + 'grass01.png'), hautes_herbes: H(OW_ + 'egrass.png'),
    chemin: H(OW_ + 'road01.png'), pave: H(OW_ + 'roadkk_z2.png'), sable: H(OW_ + 'beach01.png'),
    fleurs: [{ f: H(OW_ + 'grass01.png') }, { f: H(OW_ + 'flower01.png'), dest: [0, 0, 16, 16] }, { f: H(OW_ + 'flower02.png'), dest: [16, 16, 16, 16] }],
    eau: H(OW_ + 'sea_un.png'), eau_profonde: H(OW_ + 'sea_un.png'),
    rebord: [{ f: H(OW_ + 'grass01.png') }, { f: H(OW_ + 'allpeak.png'), crop: [0, 20, 32, 12], dest: [0, 18, 32, 14] }],
    falaise: H(OW_ + 'cliff01.png'), marches: H(OW_ + 'slope_slope.png'), ponton: H(OW_ + 'bridge_c.png'),
    carrelage: H(NB + 'la_yukab.png'),
  },
  faces: { falaise: H(OW_ + 'wall01_d.png'), terre: H(OW_ + 'wall01_g.png'), mur: H(NB + 'la_walla.png') },
  eau: H(OW_ + 'sea_un.png'),
  decor: {
    arbre: [H(OW_ + 'tree01.png'), 32], pin: [H(OW_ + 'treekn.png'), 32], rocher: [H(OW_ + 'rock01.png'), 24],
    barriere: [{ f: H(OW_ + 'fence_a.png'), crop: [0, 0, 32, 16] }, 32],
  },
  facade: { mur: H(NB + 'la_walla.png'), fenetre: H(NB + 'la_wina.png') },
};

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
  comptoir: ['mobilier/counterseg.png', 32], arbre_coupe: ['nature/cuttree.png', 32], baies: ['nature/tree2.png', 32], haie: ['nature/bush.png', 32],
};

export function charger(src) {
  return new Promise((ok) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
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
/** dessine une entrée (image ou calques) dans une case de 32 px de `g` en (x, y) ; rend false si rien n'a pu se charger */
async function dessinerEntree(g, entree, x, y) {
  const calques = typeof entree === 'string' ? [{ f: entree }] : entree;
  const ims = await Promise.all(calques.map((c) => charger(c.f)));
  if (ims.some((im) => !im)) return false;
  calques.forEach((c, i) => {
    const im = ims[i], [sx, sy, sl, sh] = c.crop || [0, 0, im.width, im.height], [dx, dy, dl, dh] = c.dest || [0, 0, 32, 32];
    g.drawImage(im, sx, sy, sl, sh, x + dx, y + dy, dl, dh);
  });
  return true;
}
/** une entrée du pack en canevas de 32 px (ou de la taille de l'image) */
async function canevas(entree, l = 32, h = 32) {
  const cv = document.createElement('canvas'); cv.width = l; cv.height = h;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const calques = typeof entree === 'string' ? [{ f: entree }] : entree;
  const ims = await Promise.all(calques.map((c) => charger(c.f)));
  if (ims.some((im) => !im)) return null;
  calques.forEach((c, i) => {
    const im = ims[i], [sx, sy, sl, sh] = c.crop || [0, 0, im.width, im.height];
    g.drawImage(im, sx, sy, sl, sh, 0, 0, l, h);
  });
  cv.source32 = ims.length === 1 && ims[0].width === 32 && ims[0].height === 32 && !calques[0].crop;
  return cv;
}

export async function chargerTout(sols, spritesPersos, pack = null) {
  const C = 36, M = 2, par = 8;
  const noms = [...new Set([...sols.filter((n) => n !== 'vide'), ...Object.keys(FACE_IMG).map((n) => 'face_' + n)])];
  const lignes = Math.ceil(noms.length / par);
  const cv = document.createElement('canvas'); cv.width = par * C; cv.height = lignes * C;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const pos = {}, echelle = {};
  await Promise.all(noms.map(async (n, i) => {
    const x = (i % par) * C, y = ((i / par) | 0) * C;
    pos[n] = [x + M, y + M];
    const p = pack && (n.startsWith('face_') ? pack.faces[n.slice(5)] : pack.sols[n]);
    // la tuile au centre, et sa marge : la tuile étirée (pas de lignes entre les cases)
    const cv = p ? await canevas(p) : null;
    // une texture HGSS de 32 px couvre 2 × 2 cases (16 texels par case, comme les personnages)
    if (cv && typeof p === 'string' && cv.source32) echelle[n] = 2;
    const src = cv || await (async () => { const f = n.startsWith('face_') ? FACE_IMG[n.slice(5)] : SOL_IMG[n]; return f ? charger(IMG + f) : null; })();
    if (!src) { g.fillStyle = '#f0f'; g.fillRect(x, y, C, C); return; }
    g.drawImage(src, x, y, C, C);
    g.drawImage(src, x + M, y + M, 32, 32);
  }));
  const tex = texture(cv);
  /** coordonnées de texture d'un sol ; (x, y) : case, pour les textures qui couvrent 2 × 2 cases */
  const uv = (n, x = 0, y = 0) => {
    const p = pos[n] || pos.herbe;
    if (echelle[n] === 2) {
      const qx = p[0] + (x & 1) * 16, qy = p[1] + (y & 1) * 16;
      return [qx / cv.width, 1 - (qy + 16) / cv.height, (qx + 16) / cv.width, 1 - qy / cv.height];
    }
    return [p[0] / cv.width, 1 - (p[1] + 32) / cv.height, (p[0] + 32) / cv.width, 1 - p[1] / cv.height];
  };
  // eau animée : quatre images empilées
  const ecv = document.createElement('canvas'); ecv.width = 32; ecv.height = 128;
  const eg = ecv.getContext('2d'); eg.imageSmoothingEnabled = false;
  const eauPack = pack && await charger(pack.eau);
  if (eauPack) for (let i = 0; i < 4; i++) { eg.drawImage(eauPack, -i * 8, i * 32, 32, 32); eg.drawImage(eauPack, 32 - i * 8, i * 32, 32, 32); }
  else (await Promise.all(EAU_IMG.map((s) => charger(IMG + s)))).forEach((im, i) => im && eg.drawImage(im, 0, i * 32, 32, 32));
  const eau = texture(ecv); eau.wrapS = eau.wrapT = THREE.RepeatWrapping; eau.repeat.set(1, 0.25);
  const decor = {};
  await Promise.all(Object.entries(DECOR_IMG).map(async ([n, [src, ppc]]) => {
    const p = pack?.decor[n];
    if (p) {
      const e = typeof p[0] === 'string' ? [{ f: p[0] }] : [p[0]];
      const im0 = await charger(e[0].f);
      if (im0) {
        const [, , cl, ch] = e[0].crop || [0, 0, im0.width, im0.height];
        const cv = await canevas(e, cl, ch);
        if (cv) { decor[n] = { tex: texture(cv), l: cl / p[1], h: ch / p[1] }; return; }
      }
    }
    const im = await charger(IMG + src);
    if (im) decor[n] = { tex: texture(im), l: im.width / ppc, h: im.height / ppc };
  }));
  // façades
  const facadeImgs = pack ? { mur: await charger(pack.facade.mur), fenetre: await charger(pack.facade.fenetre) } : {};
  const persos = {};
  await Promise.all(spritesPersos.map(async (n) => { persos[n] = await charger(OW + n + '.png'); }));
  return { atlas: { tex, uv }, eau, decor, persos, facade: facadeImgs };
}

/** façade d'un bâtiment, dessinée au canevas (mur, fenêtres, porte, enseigne) ; `imgs` : mur et fenêtre du pack */
export function facade(b, l, H, imgs = {}) {
  const ppc = 16, cv = document.createElement('canvas');
  cv.width = l * ppc; cv.height = Math.round(H * ppc);
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const murs = { labo: '#d8d4c8', maison: '#efe2c4', grotte: '#6e5a44', centre: '#f4f0ea', boutique: '#eef2f6', arene: '#c8c0b0', ecole: '#e8e0c8', tour: '#7a5a3a', poste: '#e8dcc0' };
  g.fillStyle = murs[b.modele] || '#e8dcc0'; g.fillRect(0, 0, cv.width, cv.height);
  if (imgs.mur && (b.modele === 'maison' || b.modele === 'poste' || b.modele === 'ecole'))
    for (let y = 0; y < cv.height; y += 16) for (let x = 0; x < cv.width; x += 16) g.drawImage(imgs.mur, 0, 0, 32, 32, x, y, 16, 16);
  if (b.modele === 'tour') { g.fillStyle = '#5a3f26'; for (let x = 0; x < cv.width; x += 8) g.fillRect(x, 0, 2, cv.height); }
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
    if (imgs.fenetre) { g.drawImage(imgs.fenetre, 0, 0, 32, 32, x * ppc + 1, cv.height - ppc * 1.6, ppc - 2, ppc - 2); continue; }
    g.fillStyle = '#5b6a7a'; g.fillRect(x * ppc + 3, cv.height - ppc * 1.4, ppc - 6, ppc * 0.7);
    g.fillStyle = '#a8d8f0'; g.fillRect(x * ppc + 4, cv.height - ppc * 1.4 + 1, ppc - 8, ppc * 0.7 - 2);
  }
  // enseignes
  const enseigne = { centre: ['P', '#e04040'], boutique: ['M', '#3a70d0'], arene: ['A', '#808890'], ecole: ['É', '#4a9a4a'] }[b.modele];
  if (enseigne && b.porte !== undefined) {
    const cx = (b.porte + 0.5) * ppc, cy = cv.height - ppc * 1.75;
    g.fillStyle = enseigne[1]; g.fillRect(cx - 7, cy - 7, 14, 12);
    g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText(enseigne[0], cx, cy + 3);
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
  const c = { rouge: ['#c0504a', '#9a3a36'], bleu: ['#4a78c0', '#36589a'], gris: ['#8a8e96', '#6a6e76'], vert: ['#5a9a5a', '#447a44'], brun: ['#6a4a30', '#4e3420'] }[couleur] || ['#b0704a', '#8a5636'];
  g.fillStyle = c[0]; g.fillRect(0, 0, 32, 32);
  g.fillStyle = c[1]; for (let y = 0; y < 32; y += 8) g.fillRect(0, y, 32, 2);
  const t = texture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
