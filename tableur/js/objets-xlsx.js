// Objets posés sur les feuilles d'un .xlsx / .xlsm : boutons de formulaire reliés à une macro
// (« Load Table »…), formes cliquables et images. SheetJS ne les lit pas : on les cherche dans le zip
// (xl/drawings/vmlDrawingN.vml, xl/drawings/drawingN.xml, xl/media/…).
//
// Position d'un objet : coin haut-gauche « de » et coin bas-droit « a », chacun { c, dx, r, dy }
// (colonne et ligne de la cellule, décalage en pixels dans la cellule).

const EMU_PAR_PX = 9525;
const dec = (u8) => new TextDecoder('utf-8').decode(u8);
const entites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const attr = (xml, nom) => { const m = new RegExp('\\s' + nom + '="([^"]*)"').exec(xml); return m ? entites(m[1]) : null; };

function zipIndex(cfb) {
  const map = new Map();
  cfb.FullPaths.forEach((p, i) => { const k = p.replace(/^Root Entry\//, '').replace(/^\//, ''); map.set(k.toLowerCase(), i); });
  return {
    lire(chemin) { const i = map.get(chemin.replace(/^\//, '').toLowerCase()); return i === undefined ? null : cfb.FileIndex[i].content; },
    texte(chemin) { const b = this.lire(chemin); return b ? dec(Uint8Array.from(b)) : null; },
  };
}

function resoudre(base, cible) {
  if (cible.startsWith('/')) return cible.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const p of cible.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
}

function relations(z, fichier) {
  const parts = fichier.split('/'); const nom = parts.pop();
  const xml = z.texte(parts.join('/') + '/_rels/' + nom + '.rels');
  const out = new Map();
  if (!xml) return out;
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) out.set(attr(m[0], 'Id'), { type: attr(m[0], 'Type') || '', cible: resoudre(fichier, attr(m[0], 'Target') || '') });
  return out;
}

/** « [0]!Module1.maMacro » ou « 'Classeur.xlsm'!maMacro » → « maMacro ». */
export function nomMacro(brut) {
  if (!brut) return '';
  let n = String(brut).trim();
  if (n.includes('!')) n = n.slice(n.lastIndexOf('!') + 1);
  if (n.includes('.')) n = n.slice(n.lastIndexOf('.') + 1);
  return n.replace(/^'|'$/g, '');
}

function texteDe(xml) {
  return entites(xml.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|a:p)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function ancreDrawing(xml) {
  const coin = (balise) => {
    const m = new RegExp('<xdr:' + balise + '>([\\s\\S]*?)</xdr:' + balise + '>').exec(xml);
    if (!m) return null;
    const v = (n) => { const x = new RegExp('<xdr:' + n + '>(-?\\d+)</xdr:' + n + '>').exec(m[1]); return x ? +x[1] : 0; };
    return { c: v('col'), dx: Math.round(v('colOff') / EMU_PAR_PX), r: v('row'), dy: Math.round(v('rowOff') / EMU_PAR_PX) };
  };
  const de = coin('from');
  if (!de) return null;
  let a = coin('to');
  if (!a) { // oneCellAnchor : une taille
    const ext = /<xdr:ext\s[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xml);
    if (!ext) return null;
    return { de, w: Math.round(+ext[1] / EMU_PAR_PX), h: Math.round(+ext[2] / EMU_PAR_PX) };
  }
  return { de, a };
}

function mimeDe(chemin) {
  const ext = chemin.split('.').pop().toLowerCase();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[ext] || null;
}

function enBase64(octets) {
  if (typeof btoa === 'function') { let s = ''; for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000)); return btoa(s); }
  return Buffer.from(octets).toString('base64');
}

let compteur = 0;
const nouvelId = () => 'o' + Date.now().toString(36) + (compteur++).toString(36);

/** Lit les boutons et images : Map nomFeuille → { boutons: [...], images: [...] }. */
export function lireObjetsXlsx(XLSX, octets) {
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const z = zipIndex(cfb);
  const wb = z.texte('xl/workbook.xml');
  if (!wb) return new Map();
  const relsWb = relations(z, 'xl/workbook.xml');
  const resultat = new Map();
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const nom = attr(m[0], 'name');
    const rel = relsWb.get(attr(m[0], 'r:id'));
    if (!nom || !rel) continue;
    const fichierFeuille = rel.cible;
    const xmlFeuille = z.texte(fichierFeuille);
    if (!xmlFeuille) continue;
    const rels = relations(z, fichierFeuille);
    const boutons = [], images = [];
    // 1. Boutons de formulaire (dessin VML hérité, présent dans tous les fichiers depuis Excel 97)
    for (const [, r] of rels) {
      if (!/vmlDrawing$/i.test(r.type)) continue;
      const vml = z.texte(r.cible);
      if (!vml) continue;
      for (const sh of vml.matchAll(/<v:shape\b([^>]*)>([\s\S]*?)<\/v:shape>/g)) {
        const corps = sh[2];
        const type = /ObjectType="(\w+)"/.exec(corps);
        if (!type || type[1] !== 'Button') continue;
        if (/visibility:\s*hidden/i.test(sh[1])) continue;
        const ancre = /<x:Anchor>\s*([\d,\s]+)<\/x:Anchor>/.exec(corps);
        if (!ancre) continue;
        const [c1, dx1, r1, dy1, c2, dx2, r2, dy2] = ancre[1].split(',').map((x) => +x.trim());
        const macro = /<x:FmlaMacro>([\s\S]*?)<\/x:FmlaMacro>/.exec(corps);
        const txt = /<v:textbox\b[^>]*>([\s\S]*?)<\/v:textbox>/.exec(corps);
        boutons.push({ id: nouvelId(), texte: txt ? texteDe(txt[1]) : 'Bouton', macro: macro ? nomMacro(entites(macro[1])) : '', de: { c: c1, dx: dx1, r: r1, dy: dy1 }, a: { c: c2, dx: dx2, r: r2, dy: dy2 } });
      }
    }
    // 2. Contrôles de formulaire décrits seulement dans la feuille (sans VML)
    if (!boutons.length) {
      for (const ctl of xmlFeuille.matchAll(/<control\b([^>]*)>([\s\S]*?)<\/control>/g)) {
        const macro = attr(ctl[0], 'macro');
        const anc = ancreDrawing(ctl[2].replace(/<(\/?)from>/g, '<$1xdr:from>').replace(/<(\/?)to>/g, '<$1xdr:to>'));
        if (!macro || !anc) continue;
        boutons.push({ id: nouvelId(), texte: attr(ctl[0], 'name') || 'Bouton', macro: nomMacro(macro), ...anc });
      }
    }
    // 3. Dessins : images (cliquables si une macro leur est affectée) et formes-boutons
    for (const [, r] of rels) {
      if (!/\/drawing$/i.test(r.type)) continue;
      const xml = z.texte(r.cible);
      if (!xml) continue;
      const relsDessin = relations(z, r.cible);
      // On retire les variantes de secours (mc:Fallback) pour ne pas compter deux fois le même objet
      const propre = xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');
      for (const a of propre.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/xdr:\1>/g)) {
        const corps = a[2];
        const anc = ancreDrawing(corps);
        if (!anc) continue;
        if (/<xdr:cNvPr\b[^>]*\shidden="1"/.test(corps)) continue; // bouton de formulaire déjà lu dans le VML
        const pic = /<xdr:pic\b([^>]*)>/.exec(corps);
        if (pic) {
          const emb = /r:embed="([^"]+)"/.exec(corps);
          const media = emb && relsDessin.get(emb[1]);
          const mime = media && mimeDe(media.cible);
          const octetsImg = media && z.lire(media.cible);
          if (!mime || !octetsImg) continue;
          images.push({ id: nouvelId(), src: 'data:' + mime + ';base64,' + enBase64(Uint8Array.from(octetsImg)), ...anc,
            transparentBlanc: /<a:clrFrom><a:srgbClr val="FFFFFF"\/><\/a:clrFrom>/i.test(corps), macro: nomMacro(attr(pic[0], 'macro')) || undefined,
            titre: attr(corps.match(/<xdr:cNvPr\b[^>]*>/)?.[0] || '', 'descr') || undefined });
          continue;
        }
        const sp = /<xdr:sp\b([^>]*)>/.exec(corps);
        if (sp) {
          const macro = nomMacro(attr(sp[0], 'macro'));
          if (!macro) continue;
          const txt = [...corps.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((x) => entites(x[1])).join(' ').trim();
          const fond = /<xdr:spPr>[\s\S]*?<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(corps);
          boutons.push({ id: nouvelId(), texte: txt || 'Bouton', macro, ...anc, forme: true, fond: fond ? '#' + fond[1].toLowerCase() : undefined });
        }
      }
    }
    if (boutons.length || images.length) resultat.set(nom, { boutons, images });
  }
  return resultat;
}
