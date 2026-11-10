import fs from 'fs';
import zlib from 'zlib';

function createPNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    let crc = 0xffffffff;
    const combined = Buffer.concat([typeBuf, data]);
    for (let i = 0; i < combined.length; i++) {
      let byte = combined[i];
      for (let j = 0; j < 8; j++) {
        if ((crc ^ byte) & 1) crc = (crc >>> 1) ^ 0xedb88320;
        else crc = crc >>> 1;
        byte >>>= 1;
      }
    }
    crcBuf.writeInt32BE(~crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  // Scanlines with filter byte 0 (None)
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    rawData[y * rowSize] = 0; // filter 0
    rgbaBuffer.copy(rawData, y * rowSize + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

class Canvas32 {
  constructor() {
    this.w = 32;
    this.h = 32;
    this.data = Buffer.alloc(32 * 32 * 4); // transparent
  }

  set(x, y, r, g, b, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= 32 || y < 0 || y >= 32) return;
    const idx = (y * 32 + x) * 4;
    this.data[idx] = r;
    this.data[idx + 1] = g;
    this.data[idx + 2] = b;
    this.data[idx + 3] = a;
  }

  rect(x0, y0, x1, y1, r, g, b, a = 255) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.set(x, y, r, g, b, a);
      }
    }
  }

  circle(cx, cy, radius, r, g, b, a = 255) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= radius) this.set(x, y, r, g, b, a);
      }
    }
  }

  ellipse(cx, cy, rx, ry, r, g, b, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) this.set(x, y, r, g, b, a);
      }
    }
  }

  toPNG() {
    return createPNG(32, 32, this.data);
  }
}

// 1. Oran Berry (Baie Oran) : bleu azur, ronde, 3 pointes de feuilles vertes en haut
function drawOranBerry() {
  const c = new Canvas32();
  
  // Ombre au sol douce
  c.ellipse(16, 28, 9, 2.5, 20, 30, 50, 90);

  // Feuilles / Calice au sommet
  // Contour feuilles
  c.ellipse(16, 6, 6, 2.5, 15, 45, 20);
  c.ellipse(11, 7, 3, 2, 15, 45, 20);
  c.ellipse(21, 7, 3, 2, 15, 45, 20);
  // Vert foncé
  c.ellipse(16, 6, 5, 2, 35, 115, 45);
  c.ellipse(11, 7, 2.5, 1.5, 35, 115, 45);
  c.ellipse(21, 7, 2.5, 1.5, 35, 115, 45);
  // Vert clair reflets
  c.set(16, 5, 110, 210, 90);
  c.set(15, 6, 110, 210, 90);
  c.set(12, 6, 80, 180, 70);
  c.set(20, 6, 80, 180, 70);

  // Corps de la Baie Oran
  // Contour noir / indigo très sombre
  c.circle(16, 17, 10.5, 15, 25, 65);
  // Ombre sombre basse
  c.circle(16, 17, 9.5, 25, 60, 140);
  // Bleu moyen de base
  c.circle(15.5, 16.5, 8.8, 45, 115, 220);
  // Dégradé supérieur lumineux
  c.circle(14.5, 15.0, 6.8, 70, 155, 245);
  // Reflet cyan clair
  c.circle(13.5, 13.5, 4.5, 120, 200, 255);
  // Éclat blanc spéculaire
  c.rect(12, 11, 14, 12, 255, 255, 255);
  c.set(11, 12, 255, 255, 255);
  c.set(14, 13, 255, 255, 255);
  c.set(12, 14, 210, 235, 255);

  // Bande de texture circulaire caractéristique d'Oran Berry
  c.set(18, 19, 35, 90, 185);
  c.set(19, 18, 35, 90, 185);
  c.set(20, 16, 35, 90, 185);
  c.set(19, 15, 35, 90, 185);

  return c.toPNG();
}

// 2. Sitrus Berry (Baie Sitrus) : jaune or vif, grosse baie allongée, 2 feuilles épaisses
function drawSitrusBerry() {
  const c = new Canvas32();

  // Ombre au sol
  c.ellipse(16, 29, 9, 2.5, 40, 30, 10, 90);

  // Pédoncule et feuilles
  c.rect(15, 3, 16, 6, 30, 70, 25);
  c.ellipse(12, 6, 4, 2, 25, 75, 25);
  c.ellipse(20, 6, 4, 2, 25, 75, 25);
  c.ellipse(12, 6, 3, 1.5, 55, 150, 45);
  c.ellipse(20, 6, 3, 1.5, 55, 150, 45);
  c.set(12, 5, 125, 220, 80);
  c.set(19, 5, 125, 220, 80);

  // Corps Sitrus (poire/agrume ventru)
  // Contour ambré / marron foncé
  c.ellipse(16, 18, 10.5, 11.0, 70, 45, 10);
  // Ombre basse ambrée
  c.ellipse(16, 18, 9.5, 10.0, 180, 115, 20);
  // Jaune doré de base
  c.ellipse(15.5, 17.5, 8.8, 9.0, 235, 175, 30);
  // Dégradé jaune vif
  c.ellipse(14.8, 16.0, 7.0, 7.2, 255, 215, 55);
  // Jaune clair lumineux
  c.ellipse(13.8, 14.5, 4.8, 5.0, 255, 240, 115);
  // Éclat spéculaire blanc
  c.rect(12, 11, 14, 13, 255, 255, 255);
  c.set(11, 13, 255, 255, 255);
  c.set(14, 14, 255, 255, 255);
  c.set(13, 15, 255, 245, 180);

  // Bossettes / texture de peau
  c.set(19, 20, 195, 130, 25);
  c.set(20, 19, 195, 130, 25);
  c.set(21, 17, 195, 130, 25);

  return c.toPNG();
}

// 3. Lum Berry (Baie Prine) : vert lime / chartreuse élégant, forme prune avec fine rainure
function drawLumBerry() {
  const c = new Canvas32();

  // Ombre au sol
  c.ellipse(16, 28, 8, 2.5, 15, 35, 20, 90);

  // Tige fine et petite feuille
  c.rect(15, 4, 16, 7, 75, 45, 20);
  c.ellipse(19, 6, 3.5, 2, 20, 70, 25);
  c.ellipse(19, 6, 2.5, 1.2, 60, 160, 50);
  c.set(19, 5, 130, 230, 90);

  // Corps Prine / Lum (prune vert lime)
  // Contour vert forêt très sombre
  c.ellipse(16, 17, 9.5, 10.5, 15, 45, 20);
  // Ombre basse vert foncé
  c.ellipse(16, 17, 8.5, 9.5, 45, 120, 40);
  // Vert prairie éclatant
  c.ellipse(15.5, 16.5, 7.8, 8.5, 90, 190, 55);
  // Vert lime vif
  c.ellipse(14.5, 15.0, 6.0, 6.8, 145, 225, 70);
  // Chartreuse lumineux
  c.ellipse(13.5, 13.5, 4.0, 4.5, 195, 245, 110);
  // Éclat blanc spéculaire
  c.rect(12, 11, 13, 12, 255, 255, 255);
  c.set(11, 12, 255, 255, 255);
  c.set(14, 12, 255, 255, 255);
  c.set(13, 14, 220, 250, 160);

  // Sillon central caractéristique de la prune / baie
  c.set(16, 9, 35, 95, 30);
  c.set(16, 10, 40, 105, 35);
  c.set(16, 22, 40, 105, 35);
  c.set(16, 23, 35, 95, 30);

  return c.toPNG();
}

fs.writeFileSync('odyssee/img/items/oran-berry.png', drawOranBerry());
console.log('✓ Wrote odyssee/img/items/oran-berry.png (high-detail pixel-art)');

fs.writeFileSync('odyssee/img/items/sitrus-berry.png', drawSitrusBerry());
console.log('✓ Wrote odyssee/img/items/sitrus-berry.png (high-detail pixel-art)');

fs.writeFileSync('odyssee/img/items/lum-berry.png', drawLumBerry());
console.log('✓ Wrote odyssee/img/items/lum-berry.png (high-detail pixel-art)');

// Add sitrus-berry and lum-berry to SPRITES.items in data/sprites.js if not present
let spr = fs.readFileSync('odyssee/js/data/sprites.js', 'utf8');
if (!spr.includes("'sitrus-berry'")) {
  spr = spr.replace("'oran-berry'", "'oran-berry', 'sitrus-berry', 'lum-berry'");
  fs.writeFileSync('odyssee/js/data/sprites.js', spr);
  console.log('✓ Added sitrus-berry and lum-berry to SPRITES.items');
}
