// Projet VBA d'un classeur, comme dans l'éditeur d'Excel : un module de code par feuille (Feuil1, Feuil2…),
// un module ThisWorkbook et des modules standard nommés (Module1, Calculs…).
// Sans DOM. Sert au modèle (classeur.js), à l'enregistrement (xlsxio.js) et à l'interface (app.js).
//
// Format texte (feuille masquée _MacrosTableur, sauvegarde du navigateur) : chaque module commence par une ligne d'en-tête
//   ' ===== Feuille Feuil1 (Hypothèses) =====
//   ' ===== ThisWorkbook =====
//   ' ===== Module Module1 =====
// Un texte sans en-tête (anciennes versions) devient le module « Module1 ».

const RE_ENTETE = /^'\s*=====\s*(Module|Feuille|Classeur|ThisWorkbook)\b\s*(.*?)\s*=====\s*$/i;
const NOMS_CLASSEUR = /^(ThisWorkbook|CeClasseur|DieseArbeitsmappe|EsteLibro|QuestaCartella_di_lavoro)$/i;

/** Un nom de module ou de macro accepté par VBA : lettre puis lettres, chiffres ou _ (31 caractères au plus). */
export function nomVBAValide(nom) {
  return typeof nom === 'string' && /^[A-Za-zÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ]{0,30}$/.test(nom);
}

/** Découpe un texte de projet en morceaux { genre: 'module'|'feuille'|'classeur', nom, nomFeuille, code }. */
export function decouperProjet(texte) {
  const lignes = String(texte || '').replace(/\r\n?/g, '\n').split('\n');
  const morceaux = [];
  let courant = { genre: 'module', nom: null, nomFeuille: null, lignes: [] };
  const fermer = () => {
    const code = courant.lignes.join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
    if (courant.nom !== null || code.trim()) morceaux.push({ genre: courant.genre, nom: courant.nom, nomFeuille: courant.nomFeuille, code: code ? code + '\n' : '' });
  };
  for (const l of lignes) {
    const m = RE_ENTETE.exec(l);
    if (!m) { courant.lignes.push(l); continue; }
    fermer();
    const mot = m[1].toLowerCase();
    let reste = m[2].trim();
    if (mot === 'thisworkbook') courant = { genre: 'classeur', nom: 'ThisWorkbook', nomFeuille: null, lignes: [] };
    else if (mot === 'classeur') courant = { genre: 'classeur', nom: reste || 'ThisWorkbook', nomFeuille: null, lignes: [] };
    else if (mot === 'feuille') {
      const p = /^(\S+)\s*\((.*)\)$/.exec(reste);
      courant = { genre: 'feuille', nom: p ? p[1] : reste, nomFeuille: p ? p[2] : null, lignes: [] };
    } else courant = { genre: 'module', nom: reste || null, nomFeuille: null, lignes: [] };
  }
  fermer();
  return morceaux;
}

/** Texte du projet (vide s'il n'y a aucun code ni module). */
export function serialiserProjet(classeur) {
  const blocs = [];
  for (const f of classeur.feuilles) {
    if ((f.code || '').trim()) blocs.push("' ===== Feuille " + f.codeNom + ' (' + f.nom + ') =====\n' + f.code.replace(/\s+$/, ''));
  }
  if ((classeur.codeClasseur || '').trim()) blocs.push("' ===== ThisWorkbook =====\n" + classeur.codeClasseur.replace(/\s+$/, ''));
  for (const m of classeur.modules) blocs.push("' ===== Module " + m.nom + ' =====' + (m.code.trim() ? '\n' + m.code.replace(/\s+$/, '') : ''));
  return blocs.length ? blocs.join('\n\n') + '\n' : '';
}

/** Remplace tout le projet du classeur par celui décrit dans le texte. */
export function appliquerProjet(classeur, texte) {
  for (const f of classeur.feuilles) f.code = '';
  classeur.codeClasseur = '';
  classeur.modules = [];
  ajouterAuProjet(classeur, texte);
}

/** Ajoute au projet les modules décrits dans le texte (import d'un .bas, d'un projet .xlsm…). Renvoie les clés touchées. */
export function ajouterAuProjet(classeur, texte) {
  const cles = [];
  for (const m of decouperProjet(texte)) {
    if (m.genre === 'classeur' || (m.genre !== 'feuille' && m.nom && NOMS_CLASSEUR.test(m.nom))) {
      classeur.codeClasseur = joindre(classeur.codeClasseur, m.code);
      cles.push('classeur');
      continue;
    }
    // Module de feuille : par le nom de la feuille, puis par le nom de code
    let f = null;
    if (m.genre === 'feuille' && m.nomFeuille) f = classeur.feuille(m.nomFeuille) || null;
    if (!f && m.nom) f = classeur.feuilles.find((x) => x.codeNom.toLowerCase() === m.nom.toLowerCase()) || null;
    if (f && (m.genre === 'feuille' || !classeur.modules.some((x) => x.nom.toLowerCase() === m.nom.toLowerCase()))) {
      if (m.genre === 'feuille' && m.nom && nomVBAValide(m.nom)) classeur.changerCodeNom(f, m.nom);
      if (m.genre === 'feuille' || /^(Feuil|Sheet|Tabelle|Hoja|Foglio|Blad)\d+$/i.test(m.nom)) {
        f.code = joindre(f.code, m.code);
        cles.push('feuille:' + f.codeNom);
        continue;
      }
    }
    // Module standard
    let nom = m.nom && nomVBAValide(m.nom) ? m.nom : null;
    if (!nom || classeur.nomModulePris(nom)) nom = classeur.nomModuleLibre(nom || 'Module');
    classeur.modules.push({ nom, code: m.code });
    cles.push('module:' + nom);
  }
  return cles;
}

function joindre(a, b) {
  a = (a || '').replace(/\s+$/, ''); b = (b || '').replace(/\s+$/, '');
  if (!a) return b ? b + '\n' : '';
  if (!b) return a + '\n';
  return a + '\n\n' + b + '\n';
}

// ---------------------------------------------------------------------------
// Procédures d'un module (lecture tolérante : marche aussi sur du code en cours de frappe)
// ---------------------------------------------------------------------------

const RE_DEBUT = /^\s*(?:(Public|Private|Friend|Global)\s+)?(?:Static\s+)?(Sub|Function|Property\s+(?:Get|Let|Set))\s+([A-Za-zÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ]*)\s*(\(([^)]*)\)?)?/i;
const RE_FIN = /^\s*End\s+(Sub|Function|Property)\b/i;

/**
 * Procédures d'un module : [{ nom, genre: 'Sub'|'Function'|'Property', params, prive, ligne, fin }]
 * (lignes comptées à partir de 1 ; `fin` vaut null si le End manque). `macro` : Sub sans paramètre, lançable.
 */
export function listerProcedures(code) {
  const lignes = String(code || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let ouverte = null;
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i].replace(/'.*$/, (c) => (/"/.test(c) ? c : ''));
    if (ouverte && RE_FIN.test(l)) { ouverte.fin = i + 1; ouverte = null; continue; }
    const m = RE_DEBUT.exec(l);
    if (!m) continue;
    if (ouverte) ouverte.fin = null; // End manquant : la précédente s'arrête là
    const genre = /^sub$/i.test(m[2]) ? 'Sub' : /^function$/i.test(m[2]) ? 'Function' : 'Property';
    const params = m[4] === undefined ? 0 : (m[5] || '').trim() ? (m[5].split(',').length) : (/\)/.test(m[4]) ? 0 : 1);
    ouverte = { nom: m[3], genre, params, prive: /^private$/i.test(m[1] || ''), ligne: i + 1, fin: null };
    ouverte.macro = genre === 'Sub' && params === 0;
    out.push(ouverte);
  }
  return out;
}

/** Procédure qui contient la ligne n (1-based), ou null. */
export function procedureALaLigne(code, n) {
  for (const p of listerProcedures(code)) if (n >= p.ligne && (p.fin == null || n <= p.fin)) return p;
  return null;
}

/** Ajoute une macro vide à la fin du code : { code, ligne } (ligne du curseur, à l'intérieur de la macro). */
export function insererMacro(code, nom, genre = 'Sub') {
  const base = String(code || '').replace(/\s+$/, '');
  const prefixe = base ? base + '\n\n' : '';
  const ligne = (prefixe ? prefixe.split('\n').length : 1) + 1;
  return { code: prefixe + genre + ' ' + nom + '()\n    \nEnd ' + genre + '\n', ligne };
}

/** Retire une procédure (et les lignes vides qui la suivent). */
export function supprimerProcedure(code, nom) {
  const p = listerProcedures(code).find((x) => x.nom.toLowerCase() === String(nom).toLowerCase());
  if (!p) return code;
  const lignes = String(code).replace(/\r\n?/g, '\n').split('\n');
  let debut = p.ligne - 1, fin = p.fin == null ? lignes.length : p.fin;
  while (fin < lignes.length && !lignes[fin].trim()) fin++;
  lignes.splice(debut, fin - debut);
  return lignes.join('\n');
}

// ---------------------------------------------------------------------------
// Renommer une macro ou un module, et tout ce qui les cite
// ---------------------------------------------------------------------------

const LETTRE = /[A-Za-zÀ-ÖØ-öø-ÿ_]/, MOT = /[\wÀ-ÖØ-öø-ÿ]/;

/**
 * Réécrit les identifiants d'un code VBA, hors chaînes et commentaires.
 * `fn({ nom, avantPoint, apresPoint, qualif })` rend le nouveau nom (ou undefined) ;
 * `chaine(contenu, avant)` fait de même pour le texte d'une chaîne (`avant` : le code qui la précède sur la ligne).
 */
export function transformerIdentifiants(code, fn, chaine = () => undefined) {
  return String(code || '').split('\n').map((ligne) => {
    if (/^\s*Rem\b/i.test(ligne)) return ligne;
    let out = '', i = 0, dernier = '', dernierMot = null, qualif = null;
    while (i < ligne.length) {
      const ch = ligne[i];
      if (ch === '"') {
        let j = i + 1, contenu = '';
        while (j < ligne.length) { if (ligne[j] === '"') { if (ligne[j + 1] === '"') { contenu += '"'; j += 2; continue; } break; } contenu += ligne[j++]; }
        const r = chaine(contenu, out);
        out += r === undefined ? ligne.slice(i, j + 1) : '"' + r.replace(/"/g, '""') + '"';
        i = j + 1; dernier = '"'; dernierMot = null; continue;
      }
      if (ch === "'") { out += ligne.slice(i); break; }
      if (LETTRE.test(ch) && !(i > 0 && MOT.test(ligne[i - 1]))) {
        let j = i; while (j < ligne.length && MOT.test(ligne[j])) j++;
        const nom = ligne.slice(i, j);
        let k = j; while (ligne[k] === ' ' || ligne[k] === '\t') k++;
        const avantPoint = dernier === '.';
        const r = fn({ nom, avantPoint, apresPoint: ligne[k] === '.', qualif: avantPoint ? qualif : null });
        out += r === undefined ? nom : r;
        dernier = 'a'; dernierMot = nom; i = j; continue;
      }
      out += ch; i++;
      if (ch === ' ' || ch === '\t') continue;
      if (ch === '.') qualif = dernier === 'a' ? dernierMot : null;
      dernier = ch;
    }
    return out;
  }).join('\n');
}

/** Référence à une macro (« Macro », « Module1.Macro », « 'Classeur.xlsm'!Module1.Macro ») renommée, ou null. */
function referenceRenommee(ref, test) {
  const m = /^(.*!)?(?:([\wÀ-ÖØ-öø-ÿ]+)\.)?([\wÀ-ÖØ-öø-ÿ]+)$/.exec(String(ref || '').trim());
  if (!m) return null;
  const r = test(m[2] || null, m[3]);
  return r ? (m[1] || '') + (r.module ?? (m[2] ? m[2] + '.' : '')) + r.nom : null;
}

/** Formule de cellule où la fonction VBA `ancien(` devient `nouveau(` (hors texte entre guillemets). */
export function renommerFonctionFormule(f, ancien, nouveau) {
  const re = new RegExp('(^|[^\\wÀ-ÖØ-öø-ÿ.!])' + ancien.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s*\\()', 'gi');
  return String(f).split(/("(?:[^"]|"")*")/).map((p, i) => (i % 2 ? p : p.replace(re, '$1' + nouveau + '$2'))).join('');
}

/** Objets de feuille qui lancent une macro : boutons, images, formes. */
function objetsAMacro(classeur) {
  const out = [];
  for (const f of classeur.feuilles) for (const o of [...(f.boutons || []), ...(f.images || [])]) if (o.macro) out.push(o);
  return out;
}

/**
 * Renomme une procédure (Sub ou Function) et met à jour ce qui l'appelle : le code de tous les modules,
 * `Application.Run` / `OnAction`, les boutons et formes, et les formules des cellules pour une Function.
 * Rend { appels, objets, formules } : le nombre de mises à jour.
 */
export function renommerProcedure(classeur, cle, ancien, nouveau) {
  nouveau = String(nouveau).trim();
  if (!nomVBAValide(nouveau)) throw new Error('Nom invalide : une lettre, puis des lettres, chiffres ou _ (sans espace ni tiret)');
  const mod = classeur.moduleVBA(cle);
  if (!mod) throw new Error('Module introuvable');
  const a = String(ancien).toLowerCase(), procs = listerProcedures(mod.code);
  const p = procs.find((x) => x.nom.toLowerCase() === a);
  if (!p) throw new Error('Procédure introuvable : ' + ancien);
  if (nouveau.toLowerCase() !== a && procs.some((x) => x !== p && x.nom.toLowerCase() === nouveau.toLowerCase())) throw new Error('« ' + nouveau + ' » existe déjà dans ' + mod.libelle);
  const publique = mod.genre === 'module' && !p.prive, nomMod = mod.nom.toLowerCase();
  const bilan = { appels: 0, objets: 0, formules: 0 };
  const refOk = (libre) => (q, n) => (n.toLowerCase() === a && (q ? q.toLowerCase() === nomMod : libre) ? { nom: nouveau } : null);
  for (const m of classeur.modulesVBA()) {
    const meme = m.cle === mod.cle;
    // Une procédure du même nom dans ce module-ci passe avant la nôtre quand l'appel n'est pas qualifié
    const libre = meme || (publique && !listerProcedures(m.code).some((x) => x.nom.toLowerCase() === a));
    let n = 0;
    const code = transformerIdentifiants(m.code, (t) => {
      if (t.nom.toLowerCase() !== a) return undefined;
      const q = t.qualif && t.qualif.toLowerCase();
      if (t.avantPoint ? q === nomMod || (meme && q === 'me') : libre) { n++; return nouveau; }
      return undefined;
    }, (s, avant) => {
      if (!/\b(Run|OnAction|MacroName)\b[^"]*$/i.test(avant)) return undefined;
      const r = referenceRenommee(s, refOk(libre));
      if (r) n++;
      return r ?? undefined;
    });
    if (code !== m.code) { classeur.definirCodeModule(m.cle, code); bilan.appels += Math.max(0, n - (meme ? 1 : 0)); }
  }
  for (const o of objetsAMacro(classeur)) {
    const r = referenceRenommee(o.macro, refOk(publique));
    if (r) { o.macro = r; bilan.objets++; }
  }
  if (p.genre === 'Function' && publique) {
    for (const f of classeur.feuilles) for (const [, cel] of f.cellules || []) {
      if (!cel || typeof cel.f !== 'string') continue;
      const g = renommerFonctionFormule(cel.f, ancien, nouveau);
      if (g !== cel.f) { cel.f = g; delete cel.cache; bilan.formules++; }
    }
  }
  if (typeof classeur.modifie === 'function') classeur.modifie(); else classeur.version++;
  return bilan;
}

/** Renomme un module standard et les appels qualifiés (`Module1.Macro`, boutons « Module1.Macro »). */
export function renommerModuleProjet(classeur, ancien, nouveau) {
  const a = String(ancien).toLowerCase();
  const n = classeur.renommerModule(ancien, nouveau);
  const ref = (s) => { const m = /^(.*!)?([\wÀ-ÖØ-öø-ÿ]+)\.([\wÀ-ÖØ-öø-ÿ]+)$/.exec(String(s || '').trim()); return m && m[2].toLowerCase() === a ? (m[1] || '') + n + '.' + m[3] : null; };
  let appels = 0, objets = 0;
  for (const m of classeur.modulesVBA()) {
    const code = transformerIdentifiants(m.code, (t) => (!t.avantPoint && t.apresPoint && t.nom.toLowerCase() === a ? (appels++, n) : undefined),
      (s, avant) => { if (!/\b(Run|OnAction|MacroName)\b[^"]*$/i.test(avant)) return undefined; const r = ref(s); if (r) appels++; return r ?? undefined; });
    if (code !== m.code) classeur.definirCodeModule(m.cle, code);
  }
  for (const o of objetsAMacro(classeur)) { const r = ref(o.macro); if (r) { o.macro = r; objets++; } }
  return { nom: n, appels, objets };
}
