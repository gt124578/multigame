// odyssee/moteur/engine/script.js — langage de scripts d'événements et machine qui les exécute (sans DOM).
//
// Comme dans HeartGold / SoulSilver, tout ce qui se passe sur la carte est un script : parler à un PNJ, lire un
// panneau, marcher sur un déclencheur, entrer dans une zone, le défi d'un dresseur. Le code du jeu ne contient aucune
// histoire ; il exécute des commandes. Un script avance d'une commande à l'autre dans le même pas tant qu'aucune
// n'attend (un message à lire, un mouvement à finir, une durée) ; plusieurs scripts peuvent tourner ensemble.
//
// Syntaxe (un fichier par zone, plus un fichier commun) :
//
//   # commentaire
//   script Maman                 ← point d'entrée, appelé par un objet, un panneau, un déclencheur…
//     verrouiller                ← fige le joueur et les PNJ (liberer à la fin)
//     regarder_joueur            ← l'objet qui a lancé le script se tourne vers le joueur
//     si drapeau A_LE_POKEDEX aller Deja
//     message "Bonjour {JOUEUR} !"
//     drapeau A_LE_POKEDEX
//     liberer
//     fin
//   Deja:                        ← étiquette (visible de tout le fichier)
//     message "Bonne route !"
//     liberer
//     fin
//
//   mouvement Sortie             ← suite de pas jouée par `mouvement <objet> Sortie`
//     bas 2
//     regard_gauche
//   fin
//
// Conditions : `si [non] drapeau NOM aller|appeler Étiquette`, `si var NOM <op> valeur aller|appeler Étiquette`
// (op : = != < > <= >=), `si resultat <op> valeur …` (réponse de oui_non / choix). Les erreurs (commande inconnue,
// argument manquant, étiquette absente) sont signalées à la compilation avec le fichier et la ligne.

import { dirDe, NOMS_DIR, VITESSE } from './const.js';

/** découpe une ligne en mots et en "textes entre guillemets" */
export function lexer(ligne) {
  const t = []; let i = 0;
  while (i < ligne.length) {
    const c = ligne[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '#') break;
    if (c === '"') {
      let s = ''; i++;
      while (i < ligne.length && ligne[i] !== '"') {
        if (ligne[i] === '\\' && i + 1 < ligne.length) { const n = ligne[i + 1]; s += n === 'n' ? '\n' : n; i += 2; } else s += ligne[i++];
      }
      if (ligne[i] !== '"') throw new Error('guillemet non fermé');
      i++; t.push({ texte: s }); continue;
    }
    let s = '';
    while (i < ligne.length && ligne[i] !== ' ' && ligne[i] !== '\t') s += ligne[i++];
    t.push(s);
  }
  return t;
}

const OPS = { '=': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b };

/** pas des scripts de mouvement : nom → (argument) → action */
const PAS = {};
for (const d of NOMS_DIR) {
  PAS[d] = { n: true, a: (n) => ({ type: 'pas', dir: dirDe(d), n, vitesse: VITESSE.pnj }) };
  PAS['vite_' + d] = { n: true, a: (n) => ({ type: 'pas', dir: dirDe(d), n, vitesse: VITESSE.course }) };
  PAS['lent_' + d] = { n: true, a: (n) => ({ type: 'pas', dir: dirDe(d), n, vitesse: VITESSE.pnjLent }) };
  PAS['regard_' + d] = { a: () => ({ type: 'regard', dir: dirDe(d) }) };
  PAS['saut_' + d] = { a: () => ({ type: 'saut', dir: dirDe(d), cases: 2 }) };
  PAS['sur_place_' + d] = { n: true, a: (n) => ({ type: 'surplace', dir: dirDe(d), n }) };
}
PAS.saut = { a: () => ({ type: 'saut', dir: null, cases: 0 }) };
PAS.attente = { n: true, a: (n) => ({ type: 'attente', n }) };
PAS.exclamation = { a: () => ({ type: 'bulle', bulle: '!' }) };
PAS.cacher = { a: () => ({ type: 'visible', v: false }) };
PAS.montrer = { a: () => ({ type: 'visible', v: true }) };
PAS.regard_joueur = { a: () => ({ type: 'regardJoueur' }) };
PAS.dos_joueur = { a: () => ({ type: 'dosJoueur' }) };

/**
 * Compile une source en { ops, etiquettes, entrees, mouvements }.
 * `commandes` : table des commandes (nom → { args: 'mot nombre texte dir *', … }) pour vérifier les arguments.
 */
export function compiler(source, fichier, commandes) {
  const ops = [], etiquettes = new Map(), entrees = new Set(), mouvements = new Map(), renvois = [];
  const lignes = source.split('\n');
  const erreur = (n, m) => { throw new Error(`${fichier}:${n + 1} : ${m}`); };
  let mvt = null;
  for (let n = 0; n < lignes.length; n++) {
    let t;
    try { t = lexer(lignes[n]); } catch (e) { erreur(n, e.message); }
    if (!t.length) continue;
    const mot = t[0];
    if (typeof mot !== 'string') erreur(n, 'une ligne commence par un mot, pas par un texte');
    // bloc de mouvement
    if (mvt) {
      if (mot === 'fin') { mouvements.set(mvt.nom, mvt.pas); mvt = null; continue; }
      const p = PAS[mot];
      if (!p) erreur(n, `pas de mouvement inconnu « ${mot} » (connus : ${Object.keys(PAS).slice(0, 12).join(', ')}…)`);
      let k = 1;
      if (t.length > 1) { k = Number(t[1]); if (!Number.isInteger(k) || k < 1) erreur(n, `nombre attendu après ${mot}`); }
      if (!p.n && t.length > 1) erreur(n, `${mot} ne prend pas de nombre`);
      mvt.pas.push(p.a(k));
      continue;
    }
    if (mot === 'mouvement' && t.length === 2 && typeof t[1] === 'string') {
      if (mouvements.has(t[1])) erreur(n, `mouvement ${t[1]} défini deux fois`);
      mvt = { nom: t[1], pas: [] }; continue;
    }
    if (mot === 'script') {
      if (t.length !== 2) erreur(n, 'script <Nom>');
      if (etiquettes.has(t[1])) erreur(n, `${t[1]} défini deux fois`);
      etiquettes.set(t[1], ops.length); entrees.add(t[1]); continue;
    }
    if (t.length === 1 && mot.endsWith(':')) {
      const e = mot.slice(0, -1);
      if (etiquettes.has(e)) erreur(n, `${e} défini deux fois`);
      etiquettes.set(e, ops.length); continue;
    }
    if (mot === 'si') {
      // si [non] drapeau NOM aller|appeler X / si var NOM op v aller X / si resultat op v aller X
      let i = 1, neg = false;
      if (t[i] === 'non') { neg = true; i++; }
      let cond;
      if (t[i] === 'drapeau') { cond = { type: 'drapeau', nom: t[i + 1], neg }; i += 2; }
      else if (t[i] === 'var' || t[i] === 'resultat') {
        const nom = t[i] === 'var' ? t[++i] : 'RESULTAT';
        const op = t[i + 1], v = Number(t[i + 2]);
        if (!OPS[op]) erreur(n, `comparaison inconnue « ${op} »`);
        if (!Number.isFinite(v)) erreur(n, 'nombre attendu dans la condition');
        cond = { type: 'var', nom, op, v, neg }; i += 3;
      } else erreur(n, 'si drapeau … / si var … / si resultat …');
      if (!cond.nom || typeof cond.nom !== 'string') erreur(n, 'nom attendu dans la condition');
      const saut = t[i], cible = t[i + 1];
      if (saut !== 'aller' && saut !== 'appeler') erreur(n, '« aller » ou « appeler » attendu après la condition');
      if (typeof cible !== 'string' || t.length !== i + 2) erreur(n, 'une étiquette attendue à la fin');
      ops.push({ op: 'si', cond, saut, cible, n: n + 1 }); renvois.push([cible, n]); continue;
    }
    const c = commandes[mot];
    if (!c) erreur(n, `commande inconnue « ${mot} »`);
    const spec = c.args ? c.args.split(' ') : [];
    const args = t.slice(1);
    const min = spec.filter((s) => !s.endsWith('?') && s !== '*').length;
    if (args.length < min || (!spec.includes('*') && args.length > spec.length)) erreur(n, `${mot} : ${spec.join(' ') || 'aucun argument'} attendu`);
    const vals = args.map((a, j) => {
      const s = (spec[j] || '*').replace('?', '');
      if (s === 'texte') { if (typeof a !== 'object') erreur(n, `${mot} : texte entre guillemets attendu`); return a.texte; }
      if (typeof a === 'object') return s === '*' ? a.texte : erreur(n, `${mot} : pas de texte ici`);
      if (s === 'nombre') { const v = Number(a); if (!Number.isFinite(v)) erreur(n, `${mot} : nombre attendu, pas « ${a} »`); return v; }
      if (s === 'dir') { try { return dirDe(a); } catch { erreur(n, `${mot} : direction attendue (haut, bas, gauche, droite)`); } }
      return a;
    });
    if (c.etiquette !== undefined) for (const j of [].concat(c.etiquette)) if (vals[j] !== undefined) renvois.push([vals[j], n]);
    ops.push({ op: mot, a: vals, n: n + 1 });
  }
  if (mvt) throw new Error(`${fichier} : mouvement ${mvt.nom} sans « fin »`);
  for (const [e, n] of renvois) if (!etiquettes.has(e)) erreur(n, `étiquette inconnue « ${e} »`);
  return { fichier, ops, etiquettes, entrees, mouvements };
}

/** un script en cours */
export class Contexte {
  constructor(prog, pc, opts = {}) {
    this.prog = prog; this.pc = pc; this.pile = []; this.attente = null; this.fini = false;
    this.objet = opts.objet || null;        // objet qui a lancé le script (PNJ, dresseur)
    this.dresseur = opts.dresseur || null;
    this.nom = opts.nom || '?';
    this.params = opts.params || null;     // paramètres de l'événement (panneau : baie, variable…)
    this.verrou = false;
  }
}

/**
 * Banque de scripts : un programme par zone et un programme commun. Les noms se cherchent d'abord dans la zone,
 * puis dans le commun.
 */
export class Scripts {
  constructor(commandes, sources) {
    this.commandes = commandes;
    this.progs = new Map();
    for (const [nom, src] of Object.entries(sources)) this.progs.set(nom, compiler(src, nom, commandes));
  }
  /** ajoute (ou remplace) le programme d'une zone chargée en route */
  ajouter(nom, src) { this.progs.set(nom, compiler(src, nom, this.commandes)); }
  /** noms visibles depuis une zone */
  noms(zone) {
    const s = new Set();
    for (const p of [this.progs.get(zone), this.progs.get('commun')]) if (p) for (const e of p.etiquettes.keys()) s.add(e);
    return s;
  }
  trouver(zone, nom) {
    for (const p of [this.progs.get(zone), this.progs.get('commun')])
      if (p && p.etiquettes.has(nom)) return [p, p.etiquettes.get(nom)];
    return null;
  }
  mouvement(prog, nom) {
    return prog.mouvements.get(nom) || this.progs.get('commun')?.mouvements.get(nom) || null;
  }
}

/** évalue une condition */
export function tester(cond, etat) {
  let r;
  if (cond.type === 'drapeau') r = etat.drapeaux.has(cond.nom);
  else r = OPS[cond.op](etat.vars[cond.nom] ?? 0, cond.v);
  return cond.neg ? !r : r;
}

/**
 * Fait avancer un script jusqu'à ce qu'il attende ou finisse. `T` est le terrain (commandes et état).
 * Un script qui enchaîne trop de commandes sans jamais attendre est une boucle sans fin : on l'arrête avec une erreur.
 */
export function avancer(T, ctx, budget = 10000) {
  while (!ctx.fini) {
    if (ctx.attente) {
      if (!ctx.attente()) return;
      ctx.attente = null;
    }
    if (--budget < 0) throw new Error(`script ${ctx.nom} : boucle sans attente (ligne ${ctx.prog.ops[ctx.pc]?.n})`);
    const o = ctx.prog.ops[ctx.pc++];
    if (!o) { ctx.fini = true; return; }
    if (o.op === 'si') {
      if (tester(o.cond, T.etat)) {
        if (o.saut === 'appeler') ctx.pile.push(ctx.pc);
        ctx.pc = ctx.prog.etiquettes.get(o.cible);
      }
      continue;
    }
    const c = T.commandes[o.op];
    const r = c.exec(T, ctx, o.a, o);
    if (typeof r === 'function') ctx.attente = r;
  }
}
