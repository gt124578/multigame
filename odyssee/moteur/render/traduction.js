// odyssee/moteur/render/traduction.js — les dialogues du jeu en français.
// La décompilation ne publie les textes de HGSS qu'en anglais : on les traduit dans le navigateur, sans rien envoyer
// ni rien garder dans le dépôt. D'abord le traducteur intégré du navigateur (API Translator de Chrome, hors ligne une
// fois le modèle téléchargé) ; sinon un petit modèle de traduction (opus-mt-en-fr, Transformers.js) chargé à la demande.
// Avant de traduire, les noms propres prennent ceux de la version française (donnees/fr.js) : la traduction les garde.
// Les traductions faites sont gardées dans le navigateur (localStorage) : une phrase n'est traduite qu'une fois.

import { NOMS_FR } from '../donnees/fr.js';

const CLE = 'moteur-hgss-fr-v1';
const MODELE = 'Xenova/opus-mt-en-fr';
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

export class Traducteur {
  /**
   * especes : [[NOM_EN, NOM_FR]] (en majuscules, comme dans les dialogues) ; `modele` : false = pas de modèle de
   * traduction téléchargé (tablette, téléphone : trop lourd, la page cessait de répondre), seulement le traducteur du
   * navigateur et les phrases déjà traduites
   */
  constructor(especes = [], { modele = true } = {}) {
    this.modele = modele; this.raison = null;
    this.cache = new Map();
    try { for (const [a, b] of Object.entries(JSON.parse(localStorage.getItem(CLE) || '{}'))) this.cache.set(a, b); } catch { /* rien */ }
    this.enCours = new Map();
    this.noms = [...NOMS_FR, ...especes.filter(([a, b]) => a && b && a !== b)].sort((a, b) => b[0].length - a[0].length);
    this.re = new RegExp(`\\b(${this.noms.map(([a]) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
    this.table = new Map(this.noms);
    this.moteur = null; this.etat = 'inactif'; this.file = []; this.actifs = 0;
    this.sauverPlusTard = null;
  }
  /** ce que fait le traducteur, pour l'écran (« prêt », « téléchargement 40 % », « indisponible ») */
  get libelle() { return this.etat; }
  /** prépare le traducteur ; à appeler sur un geste du joueur (le navigateur l'exige pour télécharger un modèle) */
  async demarrer() {
    if (this.moteur || this.pret) return this.pret;
    this.pret = (async () => {
      // 1. le traducteur du navigateur
      try {
        if ('Translator' in self) {
          const dispo = await self.Translator.availability({ sourceLanguage: 'en', targetLanguage: 'fr' });
          if (dispo !== 'unavailable') {
            this.etat = 'téléchargement';
            const t = await self.Translator.create({
              sourceLanguage: 'en', targetLanguage: 'fr',
              monitor: (m) => m.addEventListener('downloadprogress', (e) => { this.etat = `téléchargement ${Math.round(e.loaded * 100)} %`; }),
            });
            this.moteur = (s) => t.translate(s);
            this.etat = 'prêt';
            return true;
          }
        }
      } catch (e) { console.warn('traducteur du navigateur :', e.message || e); }
      // 2. un modèle de traduction dans un fil à part ; jamais dans la page : chaque phrase y figeait le jeu, et sur un
      //    appareil où le fil ne tient pas (mémoire), la page entière cessait de répondre
      if (!this.modele) { this.raison = 'appareil'; this.etat = 'indisponible'; return false; }
      try {
        this.etat = 'téléchargement du modèle';
        this.moteur = await this.dansUnFil();
        this.etat = 'prêt';
        return true;
      } catch (e) { console.warn('traduction dans un fil à part :', e.message || e); }
      this.etat = 'indisponible';
      return false;
    })();
    return this.pret;
  }
  /** le modèle de traduction dans un Web Worker : rend la fonction qui traduit (une promesse par phrase) */
  dansUnFil() {
    return new Promise((ok, ko) => {
      const w = new Worker(new URL('./traduction-worker.js', import.meta.url), { type: 'module' });
      const attente = new Map(); let n = 0;
      w.onmessage = (e) => {
        const m = e.data;
        if (m.etat) this.etat = m.etat;
        else if (m.pret) ok((s) => new Promise((r) => { const id = ++n; attente.set(id, r); w.postMessage({ id, texte: s }); }));
        else if (m.erreur && m.id === undefined) { w.terminate(); ko(new Error(m.erreur)); }
        else if (m.id !== undefined) { attente.get(m.id)?.(m.texte); attente.delete(m.id); }
      };
      w.onerror = (e) => { w.terminate(); ko(new Error(e.message || 'fil indisponible')); };
      w.postMessage({ type: 'demarrer', modele: MODELE, url: TRANSFORMERS });
    });
  }
  /** les noms propres anglais → ceux de la version française */
  franciser(s) { return s.replace(this.re, (m) => this.table.get(m) ?? m); }
  /** traduction déjà faite (ou null) */
  connue(s) { return this.cache.get(s) ?? null; }
  /**
   * traduit (les phrases attendent leur tour : quelques-unes à la fois) ; une phrase qu'on va lire passe devant
   * celles traduites en avance (`avance`)
   */
  traduire(s, avance = false) {
    if (this.cache.has(s)) return Promise.resolve(this.cache.get(s));
    if (this.enCours.has(s)) {
      if (!avance) { const k = this.file.findIndex((f) => f[0] === s); if (k > 0) this.file.unshift(...this.file.splice(k, 1)); }
      return this.enCours.get(s);
    }
    const p = new Promise((ok) => { if (avance) this.file.push([s, ok]); else this.file.unshift([s, ok]); this.pomper(); });
    this.enCours.set(s, p);
    return p;
  }
  /** traduire en avance (les dialogues d'une carte qui vient d'arriver) */
  prevoir(textes) { for (const t of textes) if (t && !this.cache.has(t)) this.traduire(t, true); }
  async pomper() {
    if (!this.moteur) { if (this.etat === 'inactif') return; await this.pret; if (!this.moteur) return; }
    while (this.actifs < 2 && this.file.length) {
      const [s, ok] = this.file.shift();
      this.actifs++;
      this.une(s).then((t) => { this.cache.set(s, t); this.enCours.delete(s); ok(t); this.sauver(); }).finally(() => { this.actifs--; this.pomper(); });
    }
  }
  /** une phrase : noms francisés, lignes rejointes (la boîte refait les retours), POKéMON gardé tel quel */
  async une(s) {
    const src = this.franciser(s.replace(/\s*\n\s*/g, ' ')).replace(/POKéMON/g, 'Pokémon');
    try {
      const t = await this.moteur(src);
      return t.replace(/Pokémon/g, 'POKéMON');
    } catch (e) { console.warn('traduction :', e.message || e); return src; }
  }
  /** gardé dans le navigateur au plus toutes les 20 s (écrire tout le cache fige un peu la page) et en la quittant */
  sauver() {
    if (this.sauverPlusTard) return;
    if (!this.surDepart) { this.surDepart = () => this.ecrire(); globalThis.addEventListener?.('pagehide', this.surDepart); }
    this.sauverPlusTard = setTimeout(() => { this.sauverPlusTard = null; this.ecrire(); }, 20000);
    this.sauverPlusTard.unref?.();   // (Node, tests : n'empêche pas de finir)
  }
  ecrire() {
    try {
      // on garde au plus 6000 phrases (les plus récentes)
      const e = [...this.cache].slice(-6000);
      localStorage.setItem(CLE, JSON.stringify(Object.fromEntries(e)));
    } catch { /* stockage plein */ }
  }
}

/** les messages d'une source de scripts (`message "…"`), prêts à traduire (noms du joueur et du rival posés) */
export function messagesDe(source, joueur, rival) {
  const out = [];
  for (const m of String(source || '').matchAll(/^\s*message\s+"((?:[^"\\]|\\.)*)"/gm)) {
    const t = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (/\{T[1-9]/.test(t)) continue;   // tampons remplis par le script : traduits à l'affichage
    out.push(t.replace(/\{T0\}|\{JOUEUR\}/g, joueur).replace(/\{RIVAL\}/g, rival));
  }
  return out;
}
