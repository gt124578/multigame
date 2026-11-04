// Imprimer (Ctrl+P) : réglages de mise en page et aperçu des pages au même endroit, comme Excel.

import { mp, paginer, htmlPages, zonesImpression, PAPIERS } from './impression.js';
import { adresse, parsePlage } from './formules.js';

const ech = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MARGES = { normales: { h: 1.9, b: 1.9, g: 1.8, d: 1.8, entete: 0.8, pied: 0.8 }, etroites: { h: 1.9, b: 1.9, g: 0.6, d: 0.6, entete: 0.8, pied: 0.8 }, larges: { h: 2.5, b: 2.5, g: 2.5, d: 2.5, entete: 1.3, pied: 1.3 } };
const MODELES = [['', '(aucun)'], ['Page &[Page]', 'Page 1'], ['Page &[Page] sur &[Pages]', 'Page 1 sur 3'], ['&[Feuille]', 'Nom de la feuille'], ['&[Fichier]', 'Nom du fichier'], ['&[Date]', 'Date du jour'], ['&[Fichier] — &[Feuille]', 'Fichier — feuille']];

/**
 * api : { classeur(), fi(), feuille(), selectionBornee(), memoriser(), sauvegarder(), rendre(), toast(), dialogue(titre, html, ok, opts),
 *   objets(f) → [{ x, y, w, h, html }], styleCellule(fi, r, c), activerFeuille(i) }
 */
export function installerImpression(api) {
  function reglages(f) { if (!f.miseEnPage) f.miseEnPage = mp(f); else f.miseEnPage = mp(f); return f.miseEnPage; }

  /** HTML de toutes les pages pour ce qui est demandé : 'feuille' | 'selection' | 'classeur'. */
  function construire(quoi) {
    const C = api.classeur(), fis = quoi === 'classeur' ? C.feuilles.map((f, i) => i).filter((i) => !C.feuilles[i].cachee) : [api.fi()];
    const html = []; let papier = null, orientation = null;
    for (const fi of fis) {
      const f = C.feuilles[fi], regl = mp(f), objets = api.objets(f, fi);
      const zones = zonesImpression(f, regl, { selection: quoi === 'selection' ? api.selectionBornee() : null, objets });
      if (quoi === 'classeur' && f.zone.r2 < 0 && !objets.length) continue;
      const pag = paginer(f, regl, zones);
      html.push(...htmlPages(C, fi, regl, pag, { objets, styleCellule: (r, c) => api.styleCellule(fi, r, c) }));
      if (!papier) { papier = pag.papier; orientation = regl.orientation; }
    }
    return { pages: html, n: html.length, papier: papier || PAPIERS.A4, orientation };
  }

  function imprimer(quoi = 'feuille') {
    const { pages, papier } = construire(quoi);
    const html = pages.join('');
    let zone = document.getElementById('impression');
    if (!zone) { zone = document.createElement('div'); zone.id = 'impression'; document.body.appendChild(zone); }
    zone.innerHTML = html;
    let st = document.getElementById('style-page');
    if (!st) { st = document.createElement('style'); st.id = 'style-page'; document.head.appendChild(st); }
    st.textContent = `@page { size: ${papier[0]}mm ${papier[1]}mm; margin: 0; }`;
    document.body.classList.add('impression');
    const fin = () => { document.body.classList.remove('impression'); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    setTimeout(() => { window.print(); setTimeout(fin, 1000); }, 50);
  }

  function ouvrir({ quoi } = {}) {
    const f = api.feuille(), s = api.selectionBornee();
    api.memoriser();
    const R = reglages(f);
    const etat = { quoi: quoi || (s.r2 > s.r1 || s.c2 > s.c1 ? 'feuille' : 'feuille') };
    const margeNom = Object.entries(MARGES).find(([, m]) => ['h', 'b', 'g', 'd'].every((k) => m[k] === R.marges[k]))?.[0] || 'perso';
    const echelleNom = R.ajuster ? (R.ajuster.l === 1 && R.ajuster.h === 1 ? 'page' : R.ajuster.l === 1 && !R.ajuster.h ? 'colonnes' : !R.ajuster.l && R.ajuster.h === 1 ? 'lignes' : 'perso-ajuster') : (+R.echelle === 100 ? 'reelle' : 'perso');
    const champHF = (cle, nom) => `<div class="imp-hf"><span>${nom}</span>${['g', 'c', 'd'].map((k) => `<input data-hf="${cle}.${k}" value="${ech(R[cle][k])}" placeholder="${{ g: 'à gauche', c: 'au centre', d: 'à droite' }[k]}">`).join('')}
      <select data-modele="${cle}">${MODELES.map(([v, t]) => `<option value="${ech(v)}">${t}</option>`).join('')}</select></div>`;
    const html = `<div class="imp">
      <div class="imp-reglages">
        <label>Imprimer <select id="imp-quoi"><option value="feuille">La feuille${R.zone ? ' (zone ' + ech(R.zone) + ')' : ''}</option><option value="selection">La sélection</option><option value="classeur">Tout le classeur</option></select></label>
        <div class="imp-ligne"><span>Orientation</span><div class="bascule"><button data-orient="portrait" class="${R.orientation === 'portrait' ? 'choisi' : ''}">▯ Portrait</button><button data-orient="paysage" class="${R.orientation === 'paysage' ? 'choisi' : ''}">▭ Paysage</button></div></div>
        <label>Papier <select id="imp-papier">${Object.keys(PAPIERS).map((k) => `<option${k === R.papier ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>Échelle <select id="imp-echelle">${[['reelle', 'Taille réelle'], ['page', 'Ajuster la feuille sur une page'], ['colonnes', 'Toutes les colonnes sur une page'], ['lignes', 'Toutes les lignes sur une page'], ['perso', 'Personnalisée (%)'], ['perso-ajuster', 'Ajuster à… pages']].map(([k, t]) => `<option value="${k}"${k === echelleNom ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="imp-ligne" id="imp-pct-l"${echelleNom === 'perso' ? '' : ' hidden'}><span>Pourcentage</span><input type="number" id="imp-pct" min="10" max="400" value="${Math.round(+R.echelle || 100)}"></div>
        <div class="imp-ligne" id="imp-aj-l"${echelleNom === 'perso-ajuster' ? '' : ' hidden'}><span>Pages</span><input type="number" id="imp-aj-l1" min="0" value="${R.ajuster ? R.ajuster.l : 1}"> de large × <input type="number" id="imp-aj-h" min="0" value="${R.ajuster ? R.ajuster.h : 0}"> de haut</div>
        <label>Marges <select id="imp-marges">${[['normales', 'Normales'], ['etroites', 'Étroites'], ['larges', 'Larges'], ['perso', 'Personnalisées']].map(([k, t]) => `<option value="${k}"${k === margeNom ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="imp-marges" id="imp-marges-p"${margeNom === 'perso' ? '' : ' hidden'}>${[['h', 'Haut'], ['b', 'Bas'], ['g', 'Gauche'], ['d', 'Droite'], ['entete', 'En-tête'], ['pied', 'Pied']].map(([k, t]) => `<label>${t} <input type="number" step="0.1" min="0" data-marge="${k}" value="${R.marges[k]}"> cm</label>`).join('')}</div>
        <div class="imp-cases"><label class="case"><input type="checkbox" id="imp-ch"${R.centrerH ? ' checked' : ''}> Centrer horizontalement</label><label class="case"><input type="checkbox" id="imp-cv"${R.centrerV ? ' checked' : ''}> Centrer verticalement</label>
          <label class="case"><input type="checkbox" id="imp-quad"${R.quadrillage ? ' checked' : ''}> Quadrillage</label><label class="case"><input type="checkbox" id="imp-ent"${R.entetes ? ' checked' : ''}> En-têtes de ligne et de colonne</label></div>
        <details${R.entete.g || R.entete.c || R.entete.d || R.pied.g || R.pied.c || R.pied.d ? ' open' : ''}><summary>En-tête et pied de page</summary>${champHF('entete', 'En-tête')}${champHF('pied', 'Pied')}
          <p class="aide-petite">Codes : &amp;[Page], &amp;[Pages], &amp;[Date], &amp;[Heure], &amp;[Fichier], &amp;[Feuille].</p></details>
        <details${R.zone || R.titresLignes || R.titresColonnes ? ' open' : ''}><summary>Zone et titres</summary>
          <label>Zone d'impression <input id="imp-zone" value="${ech(R.zone)}" placeholder="toute la feuille" spellcheck="false"></label>
          <div class="outil-actions"><button id="imp-zone-sel">Zone = sélection (${adresse(s.r1, s.c1)}:${adresse(s.r2, s.c2)})</button><button id="imp-zone-raz">Effacer la zone</button></div>
          <label>Lignes à répéter en haut <input id="imp-tl" value="${ech(R.titresLignes)}" placeholder="ex. 1:2" spellcheck="false"></label>
          <label>Colonnes à répéter à gauche <input id="imp-tc" value="${ech(R.titresColonnes)}" placeholder="ex. A:A" spellcheck="false"></label>
          <label>Ordre des pages <select id="imp-ordre"><option value="bas"${R.ordre !== 'droite' ? ' selected' : ''}>Vers le bas, puis à droite</option><option value="droite"${R.ordre === 'droite' ? ' selected' : ''}>À droite, puis vers le bas</option></select></label></details>
      </div>
      <div class="imp-apercu"><div class="imp-compte" id="imp-compte"></div><div id="imp-pages" class="imp-pages"></div></div>
    </div>`;
    const boite = api.dialogue('Imprimer', html, () => { lire(); api.sauvegarder(); imprimer(etat.quoi); }, { large: true, texteOk: 'Imprimer', classe: 'boite-impression' });
    const $ = (sel) => boite.querySelector(sel);
    $('#imp-quoi').value = etat.quoi;
    let attente = null;
    function lire() {
      R.papier = $('#imp-papier').value;
      const e = $('#imp-echelle').value;
      $('#imp-pct-l').hidden = e !== 'perso'; $('#imp-aj-l').hidden = e !== 'perso-ajuster';
      if (e === 'reelle') { R.ajuster = null; R.echelle = 100; }
      else if (e === 'page') R.ajuster = { l: 1, h: 1 };
      else if (e === 'colonnes') R.ajuster = { l: 1, h: 0 };
      else if (e === 'lignes') R.ajuster = { l: 0, h: 1 };
      else if (e === 'perso') { R.ajuster = null; R.echelle = Math.max(10, Math.min(400, +$('#imp-pct').value || 100)); }
      else R.ajuster = { l: Math.max(0, +$('#imp-aj-l1').value || 0), h: Math.max(0, +$('#imp-aj-h').value || 0) };
      const mg = $('#imp-marges').value;
      $('#imp-marges-p').hidden = mg !== 'perso';
      if (mg !== 'perso') { R.marges = { ...MARGES[mg] }; boite.querySelectorAll('[data-marge]').forEach((x) => { x.value = R.marges[x.dataset.marge]; }); }
      else boite.querySelectorAll('[data-marge]').forEach((x) => { R.marges[x.dataset.marge] = Math.max(0, +String(x.value).replace(',', '.') || 0); });
      R.centrerH = $('#imp-ch').checked; R.centrerV = $('#imp-cv').checked; R.quadrillage = $('#imp-quad').checked; R.entetes = $('#imp-ent').checked;
      boite.querySelectorAll('[data-hf]').forEach((x) => { const [a, b] = x.dataset.hf.split('.'); R[a][b] = x.value; });
      R.zone = $('#imp-zone').value.trim(); R.titresLignes = $('#imp-tl').value.trim(); R.titresColonnes = $('#imp-tc').value.trim(); R.ordre = $('#imp-ordre').value;
      etat.quoi = $('#imp-quoi').value;
      api.classeur().version++;
    }
    function apercu() {
      const { pages, n } = construire(etat.quoi);
      $('#imp-compte').textContent = n + ' page' + (n > 1 ? 's' : '') + (n > 60 ? ' (aperçu des 60 premières)' : '');
      const cont = $('#imp-pages');
      const largeurDispo = Math.max(160, cont.clientWidth - 24);
      cont.innerHTML = pages.slice(0, 60).map((p) => {
        const m = /width:([\d.]+)mm;height:([\d.]+)mm/.exec(p), w = +m[1] * 96 / 25.4, h = +m[2] * 96 / 25.4, k = Math.min(1, largeurDispo / w);
        return `<div class="cadre-page" style="width:${w * k}px;height:${h * k}px"><div style="transform:scale(${k});transform-origin:0 0">${p}</div></div>`;
      }).join('') || '<p class="vide">Rien à imprimer</p>';
    }
    const plus = () => { clearTimeout(attente); attente = setTimeout(() => { lire(); apercu(); }, 120); };
    boite.addEventListener('input', plus);
    boite.addEventListener('change', plus);
    boite.querySelectorAll('[data-orient]').forEach((b) => b.addEventListener('click', () => { R.orientation = b.dataset.orient; boite.querySelectorAll('[data-orient]').forEach((x) => x.classList.toggle('choisi', x === b)); plus(); }));
    boite.querySelectorAll('[data-modele]').forEach((sel) => sel.addEventListener('change', () => { const cle = sel.dataset.modele; const x = boite.querySelector(`[data-hf="${cle}.c"]`); x.value = sel.value; sel.value = ''; plus(); }));
    $('#imp-zone-sel').addEventListener('click', () => { $('#imp-zone').value = adresse(s.r1, s.c1) + ':' + adresse(s.r2, s.c2); plus(); });
    $('#imp-zone-raz').addEventListener('click', () => { $('#imp-zone').value = ''; plus(); });
    setTimeout(apercu, 0);
  }

  // ----- Zone d'impression et sauts de page depuis la feuille -----
  function definirZone() { const f = api.feuille(), s = api.selectionBornee(); api.memoriser(); reglages(f).zone = adresse(s.r1, s.c1) + ':' + adresse(s.r2, s.c2); api.classeur().version++; api.sauvegarder(); api.rendre(); api.toast('Zone d\'impression : ' + f.miseEnPage.zone); }
  function effacerZone() { const f = api.feuille(); api.memoriser(); reglages(f).zone = ''; api.classeur().version++; api.sauvegarder(); api.rendre(); api.toast('Zone d\'impression effacée'); }
  function saut(inserer, { r, c }) {
    const f = api.feuille(), R = reglages(f);
    api.memoriser();
    const maj = (liste, i) => { const set = new Set(liste); if (inserer) set.add(i); else set.delete(i); return [...set].sort((a, b) => a - b); };
    if (r > 0) R.sautsLignes = maj(R.sautsLignes, r);
    if (c > 0) R.sautsColonnes = maj(R.sautsColonnes, c);
    api.classeur().version++; api.sauvegarder(); api.rendre();
  }
  function retablirSauts() { const f = api.feuille(), R = reglages(f); api.memoriser(); R.sautsLignes = []; R.sautsColonnes = []; api.classeur().version++; api.sauvegarder(); api.rendre(); }
  void parsePlage;
  return { ouvrir, imprimer, definirZone, effacerZone, saut, retablirSauts };
}
