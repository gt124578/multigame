// Lecture du code source VBA contenu dans un classeur .xlsm (flux vbaProject.bin).
// Le conteneur CFB est lu par SheetJS (XLSX.CFB) ; les flux sont compressés selon MS-OVBA.

/** Décompression MS-OVBA (section 2.4.1 de la spécification). */
export function decompresserOVBA(buf, offset = 0) {
  if (buf[offset] !== 0x01) throw new Error('Flux VBA compressé invalide');
  const out = [];
  let pos = offset + 1;
  while (pos + 1 < buf.length) {
    const header = buf[pos] | (buf[pos + 1] << 8);
    pos += 2;
    const taille = (header & 0x0fff) + 3;
    const compresse = (header & 0x8000) !== 0;
    const fin = Math.min(pos - 2 + taille, buf.length);
    if (!compresse) { for (let i = 0; i < 4096 && pos < buf.length; i++) out.push(buf[pos++]); continue; }
    const debut = out.length;
    while (pos < fin) {
      const drapeaux = buf[pos++];
      for (let bit = 0; bit < 8 && pos < fin; bit++) {
        if (!((drapeaux >> bit) & 1)) { out.push(buf[pos++]); continue; }
        const token = buf[pos] | (buf[pos + 1] << 8);
        pos += 2;
        const decomp = out.length - debut;
        let bits = 4;
        while ((1 << bits) < decomp) bits++;
        bits = Math.max(4, Math.min(12, bits));
        const masqueLong = 0xffff >> bits;
        const longueur = (token & masqueLong) + 3;
        const decalage = (token >> (16 - bits)) + 1;
        const src = out.length - decalage;
        for (let i = 0; i < longueur; i++) out.push(out[src + i]);
      }
    }
  }
  return Uint8Array.from(out);
}

function decoder(bytes, codepage) {
  const noms = { 1252: 'windows-1252', 1250: 'windows-1250', 1251: 'windows-1251', 932: 'shift_jis', 65001: 'utf-8', 20127: 'ascii' };
  try { return new TextDecoder(noms[codepage] || 'windows-1252').decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}

/**
 * Extrait les modules VBA : [{ nom, type, code }].
 * @param cfbLib  XLSX.CFB
 * @param vbaraw  Uint8Array du vbaProject.bin
 */
export function extraireModulesVBA(cfbLib, vbaraw) {
  const cfb = cfbLib.read(vbaraw, { type: 'array' });
  const flux = (suffixe) => {
    const i = cfb.FullPaths.findIndex((p) => p.toLowerCase().endsWith(suffixe.toLowerCase()));
    return i < 0 ? null : cfb.FileIndex[i].content;
  };
  const dirBrut = flux('/VBA/dir');
  if (!dirBrut) return [];
  const dir = decompresserOVBA(Uint8Array.from(dirBrut));
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  let pos = 0, codepage = 1252;
  const modules = [];
  let courant = null;
  while (pos + 6 <= dir.length) {
    const id = dv.getUint16(pos, true);
    let taille = dv.getUint32(pos + 2, true);
    pos += 6;
    if (id === 0x0003) { codepage = dv.getUint16(pos, true); } // PROJECTCODEPAGE
    else if (id === 0x0019) { courant = { nom: decoder(dir.subarray(pos, pos + taille), codepage), flux: null, offset: 0, type: 'module' }; modules.push(courant); }
    else if (id === 0x001a && courant) { courant.flux = decoder(dir.subarray(pos, pos + taille), codepage); }
    else if (id === 0x0031 && courant) { courant.offset = dv.getUint32(pos, true); }
    else if (id === 0x0021 && courant) courant.type = 'module';
    else if (id === 0x0022 && courant) courant.type = 'document';
    else if (id === 0x0010) break; // Terminator
    if (id === 0x0009) taille = 6; // PROJECTVERSION a une taille fixe
    pos += taille;
  }
  const out = [];
  for (const m of modules) {
    const brut = flux('/VBA/' + (m.flux || m.nom));
    if (!brut) continue;
    try {
      const code = decoder(decompresserOVBA(Uint8Array.from(brut), m.offset), codepage);
      out.push({ nom: m.nom, type: m.type, code: code.replace(/\r\n/g, '\n').replace(/^Attribute VB_.*$\n?/gm, '') });
    } catch (e) {
      out.push({ nom: m.nom, type: m.type, code: "' (module illisible : " + e.message + ')' });
    }
  }
  return out;
}
