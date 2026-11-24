// odyssee/moteur/engine/terrain.js — le terrain (« field system ») : tout ce qui se passe hors combat, à pas fixe,
// sans DOM. Le rendu ne fait que lire cet état ; les tests le font tourner dans Node.
//
// Un pas (`pas(entrees)`, 60 par seconde) :
//   1. la boîte de texte (lettres qui s'affichent, A pour continuer, choix) ;
//   2. les scripts en cours ;
//   3. le joueur (si rien ne le fige) : se tourner, marcher, courir, vélo, surf, sauter un rebord, parler, lire ;
//   4. les objets avancent ; à la fin d'un pas du joueur : porte, escalier, trou, déclencheurs, changement de zone,
//      glace et tapis roulants, rencontres, regard des dresseurs ;
//   5. les PNJ libres (errance, regards), seulement près du joueur ;
//   6. les scripts de niveau (« map scripts ») quand tout est calme ; la caméra.

import { DX, DY, OPPOSE, PROPS, VITESSE, rng as RNG } from './const.js';
import { Monde, preparer, valider } from './carte.js';
import { ObjetTerrain, objetEn, testerPas, devant } from './objets.js';
import { Scripts, Contexte, avancer } from './script.js';
import { COMMANDES, dirVers } from './commandes.js';
import { COMMUN } from './commun.js';

/** caméras par type de zone (comme les réglages de caméra des en-têtes de HGSS) */
export const CAMERAS = {
  dehors: { distance: 34, inclinaison: 50, fov: 22 },
  ville: { distance: 34, inclinaison: 50, fov: 22 },
  interieur: { distance: 26, inclinaison: 56, fov: 22 },
  grotte: { distance: 30, inclinaison: 54, fov: 22 },
  haut: { distance: 42, inclinaison: 46, fov: 22 },
};

/** objets connus : nom (avec article) et prix ; un paquet de données peut en ajouter (`objets`) */
export const OBJETS = {
  // identifiants des objets = ceux d'Odyssée (et de PokeAPI) : le sac du terrain est le sac des combats
  potion: { nom: 'une POTION', court: 'POTION', prix: 300 },
  'super-potion': { nom: 'une SUPER POTION', court: 'SUPER POTION', prix: 700 },
  antidote: { nom: 'un ANTIDOTE', court: 'ANTIDOTE', prix: 100 },
  'paralyze-heal': { nom: 'un ANTI-PARA', court: 'ANTI-PARA', prix: 200 },
  awakening: { nom: 'un RÉVEIL', court: 'RÉVEIL', prix: 250 },
  repel: { nom: 'un REPOUSSE', court: 'REPOUSSE', prix: 350 },
  'poke-ball': { nom: 'une POKé BALL', court: 'POKé BALL', prix: 200 },
  'oran-berry': { nom: 'une BAIE ORAN', court: 'BAIE ORAN' },
  'cheri-berry': { nom: 'une BAIE CERIZ', court: 'BAIE CERIZ' },
  'pecha-berry': { nom: 'une BAIE PECHA', court: 'BAIE PECHA' },
  velo: { nom: 'le VÉLO', court: 'VÉLO' },
  pokedex: { nom: 'le POKéDEX', court: 'POKéDEX' },
  oeuf_mystere: { nom: "l'ŒUF MYSTÈRE", court: 'ŒUF MYSTÈRE' },
  carte: { nom: 'la CARTE', court: 'CARTE' },
};
/** objets du terrain qui ont un script par défaut */
const SCRIPT_TYPE = { objet: 'RamasserObjet', arbre_coupe: 'ArbreCoupe' };

export class Terrain {
  constructor(donnees, opts = {}) {
    this.d = preparer(donnees);
    this.commandes = COMMANDES;
    const sources = { commun: COMMUN + '\n' + (donnees.scriptsCommuns || ''), ...Object.fromEntries(Object.entries(this.d.zones).map(([id, z]) => [id, z.scripts || ''])) };
    this.scripts = new Scripts(COMMANDES, sources);
    const err = valider(this.d, (z) => this.scripts.noms(z.id));
    if (err.length && !opts.toleRant) throw new Error('données invalides :\n  ' + err.join('\n  '));
    this.erreurs = err;
    this.graine = opts.graine ?? 1;
    this.rng = RNG(this.graine);
    this.t = 0;
    this.etat = {
      drapeaux: new Set(), vars: {}, sac: {}, equipe: [], joueur: { nom: opts.nom || 'LUTH', sprite: opts.sprite || 'player_m' },
      soin: null, pas: 0, argent: opts.argent ?? 3000,
    };
    this.objetsConnus = { ...OBJETS, ...(donnees.objets || {}) };
    this.etat.boite = [];
    /**
     * Les POKéMON eux-mêmes ne sont pas l'affaire du terrain : il les crée et les soigne par ces deux fonctions.
     * Par défaut, de simples fiches (tests) ; le banc d'essai y branche les POKéMON et les combats d'Odyssée.
     */
    this.pokemon = opts.pokemon || {
      creer: (espece, niveau) => ({ espece, niveau, pv: 1, pvMax: 1 }),
      soigner: (m) => { m.pv = m.pvMax; },
    };
    this.sorties = [];           // événements pour le rendu (sons, musique, zone, combat…)
    this.ctxs = [];              // scripts en cours
    this.verrous = 0;
    this.ui = null;              // boîte de texte
    this.combatEnCours = null;
    this.transition = null; this.noir = 0; this.fonduVers = 0; this.fonduPas = 0;
    this.secousse = 0;
    this.mode = 'marche';        // marche, velo, surf
    this.continu = false;        // le joueur enchaîne les pas (pas de demi-tour sur place)
    this.camera = null;
    this.compteurRencontre = 0;
  }

  // ——— mise en place ———
  /** démarre sur une zone (premier téléporteur, ou x, y) ou depuis une sauvegarde */
  demarrer(o) {
    if (o.sauvegarde) return this.charger(o.sauvegarde);
    const z = this.d.zones[o.zone];
    if (!z) throw new Error(`zone inconnue : ${o.zone}`);
    this.chargerMonde(this.d.mondeDeZone[o.zone]);
    const w = o.x === undefined ? z.warps[o.warp ?? 0] : { x: o.x, y: o.y };
    this.placerJoueur(w.x, w.y, o.dir ?? 1);
    this.zone = null; this.majZone(true);
    this.lancerNiveau('chargement');
    this.camera = null; this.majCamera();
  }
  chargerMonde(id) {
    this.M = new Monde(this.d, id);
    this.objets = this.M.objets.map((def) => {
      const o = new ObjetTerrain(def, RNG(this.graine ^ hash(def.zone + ':' + def.id)));
      o.zone = def.zone;
      return o;
    });
    this.majVisibles();
    if (!this.joueur) {
      this.joueur = new ObjetTerrain({ id: 'joueur', x: 0, y: 0, sprite: this.etat.joueur.sprite }, RNG(1));
    }
    this.joueur.m = null; this.joueur.file = [];
  }
  placerJoueur(x, y, dir) {
    const j = this.joueur;
    j.x = x; j.y = y; j.px = x; j.py = y; j.dir = dir; j.m = null; j.file = [];
    if (this.mode === 'surf' && !this.M.props(x, y).surf) this.changerMode('marche');
    if (this.mode === 'velo' && (this.zone && this.zone.velo === false)) this.changerMode('marche');
  }
  /** un objet est caché tant que son drapeau est levé (objets ramassés, PNJ partis) */
  majVisibles() {
    for (const o of this.objets || []) {
      if (o.cacheScript) continue;
      const d = o.def, f = this.drapeauObjet(o);
      o.visible = !(f && this.etat.drapeaux.has(f)) && !(d.siDrapeau && !this.etat.drapeaux.has(d.siDrapeau));
    }
  }
  objet(id) { return this.objets.find((o) => o.id === id) || null; }
  nomObjet(n) { return this.objetsConnus[n]?.nom || n.toUpperCase(); }
  /** drapeau qui cache un objet : le sien, ou TMP_ pour un arbre à couper (il repousse au changement de carte) */
  drapeauObjet(o) { return o.def.drapeau || (o.def.type === 'arbre_coupe' ? `TMP_COUPE_${o.zone}_${o.id}` : null); }
  drapeauDresseur(o) { return o.def.dresseur.drapeau || `DRESSEUR_${o.zone}_${o.id}`; }
  sortir(e) { this.sorties.push(e); }
  vider() { const s = this.sorties; this.sorties = []; return s; }

  // ——— le pas ———
  /** entrees : { dir: 0..3 | null, a, b (appuis de ce pas), course (tenu), velo (appui) } */
  pas(e = {}) {
    this.t++;
    const ent = { dir: e.dir ?? null, a: !!e.a, b: !!e.b, course: !!e.course, velo: !!e.velo };
    // fondus et secousse
    if (this.noir !== this.fonduVers) {
      this.noir += Math.sign(this.fonduVers - this.noir) / this.fonduPas;
      if (Math.abs(this.noir - this.fonduVers) < 1e-6 || (this.fonduVers > 0 ? this.noir > 1 : this.noir < 0)) this.noir = this.fonduVers;
    }
    if (this.secousse > 0) this.secousse--;
    for (const o of this.objets) if (o.tBulle > 0 && --o.tBulle === 0) o.bulle = null;
    if (this.joueur.tBulle > 0 && --this.joueur.tBulle === 0) this.joueur.bulle = null;
    // 1. boîte de texte : elle prend les touches
    let pris = false;
    if (this.ui) pris = this.majUI(ent);
    // 2. transitions de carte
    if (this.transition) this.majTransition();
    // 3. scripts
    for (const c of [...this.ctxs]) avancer(this, c);
    this.nettoyerScripts();
    // 4. joueur
    const libre = !this.verrous && !this.transition && !this.combatEnCours && !this.ui;
    if (libre && !pris) this.commander(ent);
    else if (!this.joueur.m && !this.joueur.file.length) this.continu = false;
    this.majObjet(this.joueur, true);
    // 5. PNJ
    for (const o of this.objets) this.majObjet(o, false, libre);
    // 6. scripts de niveau, caméra
    if (libre && !this.joueur.m && !this.ctxs.length) this.lancerNiveau('image');
    this.majCamera();
  }

  // ——— boîte de texte ———
  message(s) {
    const texte = s.replace(/\{JOUEUR\}/g, this.etat.joueur.nom).replace(/\{ARGENT\}/g, String(this.etat.argent)).replace(/\{VAR:(\w+)\}/g, (m, v) => String(this.etat.vars[v] ?? 0));
    this.ui = { texte, vus: 0, choix: null };
    this.sortir({ type: 'message', texte });
    return () => this.ui === null || this.ui.lu;
  }
  choix(options, rendre) {
    if (!this.ui) this.ui = { texte: '', vus: 0 };
    this.ui.choix = { options, i: 0, rendre };
    this.ui.vus = this.ui.texte.length;
    return () => !this.ui || !this.ui.choix;
  }
  fermerMessage() { this.ui = null; }
  /** boutique : liste d'articles, A achète un exemplaire, B ferme */
  boutique(objets) {
    const articles = objets.map((n) => {
      const o = this.objetsConnus[n];
      if (!o?.prix) throw new Error(`boutique : ${n} n'a pas de prix`);
      return { objet: n, nom: o.court || n, prix: o.prix };
    });
    this.ui = { texte: 'Que désirez-vous ?', vus: 99, boutique: { articles, i: 0 } };
    return () => !this.ui || !this.ui.boutique;
  }
  acheter(i) {
    const a = this.ui.boutique.articles[i];
    if (this.etat.argent < a.prix) { this.sortir({ type: 'son', nom: 'heurt' }); this.ui.boutique.refus = this.t; return false; }
    this.etat.argent -= a.prix;
    this.etat.sac[a.objet] = (this.etat.sac[a.objet] ?? 0) + 1;
    this.sortir({ type: 'son', nom: 'objet' });
    return true;
  }
  majUI(e) {
    const u = this.ui;
    if (u.lu && !u.choix) return false;
    if (u.vus < u.texte.length) {
      u.vus = Math.min(u.texte.length, u.vus + 1);
      if (e.a || e.b) u.vus = u.texte.length;   // A ou B : tout le texte d'un coup
      return true;
    }
    if (u.boutique) {
      const b = u.boutique, n = b.articles.length + 1;   // + « Quitter »
      if (e.dir === 0 && this.dirPrec !== 0) b.i = (b.i + n - 1) % n;
      if (e.dir === 1 && this.dirPrec !== 1) b.i = (b.i + 1) % n;
      this.dirPrec = e.dir;
      if (e.a && b.i < b.articles.length) this.acheter(b.i);
      else if (e.b || e.a) { u.boutique = null; u.lu = true; this.sortir({ type: 'son', nom: 'choix' }); }
      return true;
    }
    if (u.choix) {
      const c = u.choix;
      if (e.dir === 0 && this.dirPrec !== 0) c.i = (c.i + c.options.length - 1) % c.options.length;
      if (e.dir === 1 && this.dirPrec !== 1) c.i = (c.i + 1) % c.options.length;
      this.dirPrec = e.dir;
      if (e.a) { c.rendre(c.i); u.choix = null; u.lu = true; this.sortir({ type: 'son', nom: 'choix' }); }
      else if (e.b) { c.rendre(c.options.length - 1); u.choix = null; u.lu = true; }
      return true;
    }
    if (e.a || e.b) { u.lu = true; this.sortir({ type: 'son', nom: 'texte' }); }
    return true;
  }
  attendre(n) { const fin = this.t + n; return () => this.t >= fin; }

  // ——— verrou ———
  verrouiller(ctx) {
    if (ctx.verrou) return;
    ctx.verrou = true; this.verrous++;
    this.continu = false;
  }
  liberer(ctx) {
    this.ui = null;
    if (!ctx.verrou) return;
    ctx.verrou = false; this.verrous = Math.max(0, this.verrous - 1);
  }
  lancerScript(zone, nom, opts = {}) {
    const r = this.scripts.trouver(zone, nom);
    if (!r) throw new Error(`script inconnu : ${zone}/${nom}`);
    const c = new Contexte(r[0], r[1], { ...opts, nom });
    // un script lancé par le joueur fige tout de suite le terrain (sinon un PNJ ferait un pas pendant ce pas-ci)
    if (opts.figer !== false) this.verrouiller(c);
    this.ctxs.push(c);
    avancer(this, c);
    this.nettoyerScripts();
    return c;
  }
  /** un script fini rend la main : verrou levé, boîte de texte fermée (même s'il a oublié « liberer ») */
  nettoyerScripts() {
    const restants = [];
    for (const c of this.ctxs) {
      if (!c.fini) { restants.push(c); continue; }
      if (c.verrou) this.liberer(c);
    }
    this.ctxs = restants;
    if (!this.ctxs.length && this.ui && !this.verrous) this.ui = null;
  }

  // ——— le joueur ———
  vitesseJoueur(ent) {
    if (this.mode === 'velo') return VITESSE.velo;
    if (this.mode === 'surf') return VITESSE.surf;
    const p = this.M.props(this.joueur.x, this.joueur.y);
    const z = this.zone;
    if (ent.course && !p.pasCourse && z?.course !== false && this.etat.drapeaux.has('CHAUSSURES')) return VITESSE.course;
    return VITESSE.marche;
  }
  commander(ent) {
    const j = this.joueur;
    if (j.m || j.file.length) return;
    if (ent.velo) { this.basculerVelo(); return; }
    if (ent.a) { this.interagir(); if (this.ctxs.length || this.ui) return; }
    const d = ent.dir;
    if (d === null) { this.continu = false; return; }
    // appui bref depuis l'arrêt : on se tourne seulement (comme sur DS)
    if (d !== j.dir && !this.continu) {
      j.lancer('tour', d, VITESSE.demiTour);
      return;
    }
    // tapis de sortie : on sort en avançant dans son sens
    const pj = this.M.props(j.x, j.y);
    if (pj.tapis !== null && pj.tapis === d && this.M.warp(j.x, j.y)) {
      j.dir = d; this.prendreWarp(this.M.warp(j.x, j.y)); return;
    }
    const r = testerPas(this.M, j, d, { surf: this.mode === 'surf', velo: this.mode === 'velo', objets: this.objets });
    if (!r.ok) {
      j.lancer('surplace', d, VITESSE.heurt);
      if (this.tHeurt === undefined || this.t - this.tHeurt >= VITESSE.heurt) { this.sortir({ type: 'son', nom: 'heurt' }); this.tHeurt = this.t; }
      this.continu = true;
      return;
    }
    j.course = false;
    if (r.type === 'saut') { j.lancer('saut', d, VITESSE.saut, 2); this.sortir({ type: 'son', nom: 'saut' }); }
    else {
      const v = this.vitesseJoueur(ent);
      j.lancer('pas', d, v);
      j.course = v === VITESSE.course;
      if (r.debarque) j.debarque = true;
    }
    this.continu = true;
  }
  interagir() {
    const j = this.joueur;
    let [fx, fy] = devant(j);
    // comptoir : on parle à qui est derrière
    if (this.M.props(fx, fy).comptoir) { fx += DX[j.dir]; fy += DY[j.dir]; }
    const o = objetEn(this.objets, fx, fy, j);
    if (o && !o.bouge) {
      const d = o.def;
      if (d.dresseur) {
        const battu = this.etat.drapeaux.has(this.drapeauDresseur(o));
        if (!battu) { this.defi(o, false); return; }
        if (d.dresseur.apres) { this.lancerScript(o.zone, d.dresseur.apres, { objet: o }); return; }
      }
      const s = d.script || SCRIPT_TYPE[d.type] || null;
      if (s) { this.lancerScript(o.zone, s, { objet: o }); return; }
    }
    const p = this.M.panneau(fx, fy);
    if (p && (p.depuis === undefined || p.depuis === j.dir)) { this.lancerScript(p.zone, p.script, { params: p }); return; }
    // eau devant : proposer de surfer
    if (this.mode !== 'surf' && this.M.props(fx, fy).surf && !this.M.bloquee(fx, fy) && this.etat.drapeaux.has('CS_SURF') && !objetEn(this.objets, fx, fy))
      this.lancerScript(this.zone.id, 'ProposerSurf');
  }
  basculerVelo() {
    if (this.mode === 'surf') return;
    if (this.mode === 'velo') { this.changerMode('marche'); return; }
    if (!this.etat.sac.velo) return;
    if (this.zone?.velo === false || this.M.props(this.joueur.x, this.joueur.y).pasVelo) {
      this.lancerScript(this.zone.id, 'PasDeVeloIci'); return;
    }
    this.changerMode('velo');
  }
  changerMode(m) {
    if (this.mode === m) return;
    this.mode = m; this.sortir({ type: 'mode', mode: m });
  }

  /** fait avancer un objet ; pour le joueur, gère la fin de chaque pas */
  majObjet(o, joueur, libre = true) {
    if (!joueur && !o.visible) return;
    // file d'actions de script
    if (!o.m && o.file.length) this.actionSuivante(o);
    const type = o.m?.type;
    const finPas = o.avancer();
    if (joueur) {
      if (finPas && type !== 'tour' && type !== 'surplace') this.finPasJoueur();
      return;
    }
    if (!o.m && !o.file.length && libre && !this.verrous && Math.abs(o.x - this.joueur.x) <= 24 && Math.abs(o.y - this.joueur.y) <= 18)
      this.pnjLibre(o);
  }
  actionSuivante(o) {
    const a = o.file[0];
    const fin = () => o.file.shift();
    switch (a.type) {
      case 'pas': {
        const r = testerPas(this.M, o, a.dir, { pnj: o !== this.joueur, objets: o === this.joueur ? this.objets : [...this.objets, this.joueur] });
        // un script ne traverse jamais : s'il est bloqué, l'objet attend (comme dans HGSS)
        if (!r.ok) { o.dir = a.dir; return; }
        o.lancer('pas', a.dir, a.vitesse);
        if (--a.n <= 0) fin();
        return;
      }
      case 'regard': o.dir = a.dir; fin(); return;
      case 'regardJoueur': o.dir = dirVers(o, this.joueur); fin(); return;
      case 'dosJoueur': o.dir = OPPOSE[dirVers(o, this.joueur)]; fin(); return;
      case 'saut': o.lancer('saut', a.dir, VITESSE.saut, a.dir === null ? 0 : a.cases); fin(); return;
      case 'surplace': o.lancer('surplace', a.dir, VITESSE.pnj); if (--a.n <= 0) fin(); return;
      case 'attente': if (a.fin === undefined) a.fin = this.t + a.n; if (this.t >= a.fin) fin(); return;
      case 'bulle': o.bulle = a.bulle; o.tBulle = 40; this.sortir({ type: 'son', nom: 'exclamation' }); fin(); return;
      case 'visible': o.visible = a.v; o.cacheScript = !a.v; fin(); return;
      default: throw new Error(`mouvement inconnu : ${a.type}`);
    }
  }
  jouerMouvement(o, pas) { for (const p of pas) o.file.push({ ...p }); }

  /** PNJ livrés à eux-mêmes : types de mouvement de HGSS */
  pnjLibre(o) {
    if (--o.attente > 0) return;
    const r = o.rng;
    o.attente = 40 + ((r() * 100) | 0);
    switch (o.mouvement) {
      case 'fixe': return;
      case 'regard_alea': o.dir = (r() * 4) | 0; return;
      case 'regard_hb': o.dir = r() < 0.5 ? 0 : 1; return;
      case 'regard_gd': o.dir = r() < 0.5 ? 2 : 3; return;
      case 'tourne': o.dir = [3, 2, 0, 1][o.dir]; o.attente = 30; return;
      case 'errance': case 'errance_hb': case 'errance_gd': {
        const dirs = o.mouvement === 'errance' ? [0, 1, 2, 3] : o.mouvement === 'errance_hb' ? [0, 1] : [2, 3];
        const d = dirs[(r() * dirs.length) | 0];
        const nx = o.x + DX[d], ny = o.y + DY[d];
        o.dir = d;
        if (Math.abs(nx - o.x0) > o.rayon || Math.abs(ny - o.y0) > o.rayon) return;
        const t = testerPas(this.M, o, d, { pnj: true, objets: [...this.objets, this.joueur] });
        if (t.ok && t.type === 'pas') o.lancer('pas', d, VITESSE.pnj);
        return;
      }
      case 'route': {
        if (!o.route?.length) return;
        const d = o.route[o.iRoute];
        const t = testerPas(this.M, o, d, { pnj: true, objets: [...this.objets, this.joueur] });
        o.dir = d;
        if (t.ok && t.type === 'pas') { o.lancer('pas', d, VITESSE.pnj); o.iRoute = (o.iRoute + 1) % o.route.length; o.attente = 0; }
        else o.attente = 20;
        return;
      }
      default: throw new Error(`type de mouvement inconnu : ${o.mouvement} (${o.id})`);
    }
  }

  /** à la fin de chaque pas du joueur, dans l'ordre de HGSS */
  finPasJoueur() {
    const j = this.joueur, M = this.M, p = M.props(j.x, j.y);
    this.etat.pas++;
    if (j.debarque) { j.debarque = false; this.changerMode('marche'); }
    // 1. portes, escaliers, trous
    const w = M.warp(j.x, j.y);
    if (w && p.warp) { this.prendreWarp(w); return; }
    // 2. changement de zone (nom, musique, règles)
    this.majZone();
    // 3. déclencheurs au sol (une variable doit avoir la bonne valeur, comme les « coord events »)
    for (const t of M.declencheursEn(j.x, j.y)) {
      if (t.var !== undefined && (this.etat.vars[t.var] ?? 0) !== (t.val ?? 0)) continue;
      if (t.drapeau && this.etat.drapeaux.has(t.drapeau)) continue;
      this.continu = false;
      this.lancerScript(t.zone, t.script);
      return;
    }
    // 4. glace, tapis roulants, courant : le pas suivant est forcé
    const force = p.glisse ? j.dir : p.force;
    if (force !== null && force !== undefined) {
      const r = testerPas(M, j, force, { surf: this.mode === 'surf', objets: this.objets });
      if (r.ok && r.type === 'pas') { j.lancer(p.glisse ? 'glisse' : 'pas', force, VITESSE.glisse); return; }
    }
    // 5. regard des dresseurs
    if (this.regardDresseurs()) return;
    // 6. rencontres
    this.testerRencontre(p);
  }
  testerRencontre(p) {
    if (!p.rencontre || this.mode === 'velo' && p.rencontre === 'eau') return;
    const table = this.zone?.rencontres?.[p.rencontre];
    if (!table || !table.especes?.length) return;
    // un pas sur deux au plus après un combat (évite deux combats d'affilée)
    if (this.compteurRencontre > 0) { this.compteurRencontre--; return; }
    if (this.rng() * 250 >= table.taux) return;
    let x = this.rng() * table.especes.reduce((s, e) => s + (e.poids ?? 1), 0), e;
    for (e of table.especes) if ((x -= e.poids ?? 1) < 0) break;
    const niv = e.niveaux ? e.niveaux[0] + ((this.rng() * (e.niveaux[1] - e.niveaux[0] + 1)) | 0) : 5;
    this.compteurRencontre = 3;
    this.continu = false;
    this.combat({ type: 'sauvage', espece: e.espece, niveau: niv });
  }

  /** un dresseur voit-il le joueur ? (ligne droite, rien entre eux, même niveau) */
  regardDresseurs() {
    const j = this.joueur;
    for (const o of this.objets) {
      const d = o.def.dresseur;
      if (!d || !o.visible || o.bouge || this.etat.drapeaux.has(this.drapeauDresseur(o))) continue;
      const portee = d.portee ?? 4;
      let x = o.x, y = o.y, vu = false;
      for (let k = 1; k <= portee; k++) {
        x += DX[o.dir]; y += DY[o.dir];
        if (x === j.x && y === j.y) { vu = true; break; }
        if (this.M.bloquee(x, y) || this.M.hauteurCase(x, y) !== this.M.hauteurCase(o.x, o.y) || objetEn(this.objets, x, y)) break;
      }
      if (vu) { this.defi(o, true); return true; }
    }
    return false;
  }
  defi(o, vu) {
    this.continu = false;
    this.lancerScript(o.zone, vu ? 'DefiDresseur' : 'DefiDresseurParle', { objet: o, dresseur: o });
  }

  // ——— combats (le terrain attend que le combat rende sa main) ———
  combat(desc, apres) {
    this.combatEnCours = { ...desc, apres, fini: false };
    this.sortir({ ...desc, type: 'combat', genre: desc.type });
    return () => !this.combatEnCours;
  }
  /** appelé par l'écran de combat (ou par les tests) */
  terminerCombat(victoire = true) {
    const c = this.combatEnCours;
    if (!c) return;
    this.combatEnCours = null;
    c.apres?.(victoire);
    if (!victoire) this.tomberKo();
  }
  tomberKo() {
    const s = this.etat.soin;
    for (const p of this.etat.equipe) this.pokemon.soigner(p);
    if (s) this.teleporter({ zone: s.zone, x: s.x, y: s.y, dir: 0 });
  }

  // ——— téléporteurs ———
  prendreWarp(w) {
    const dest = this.d.zones[w.vers].warps[w.n ?? 0];
    this.sortir({ type: 'son', nom: this.M.mb(w.x, w.y) === 12 ? 'porte' : 'escalier' });
    this.teleporter({ zone: w.vers, warp: w.n ?? 0, sortie: dest.sortie });
  }
  teleporter(o) {
    this.continu = false;
    this.transition = { phase: 'sortie', o, t: 0 };
    this.fondu(1, 12);
  }
  fondu(vers, pas) { this.fonduVers = vers; this.fonduPas = pas; }
  majTransition() {
    const tr = this.transition;
    if (tr.phase === 'sortie' && this.noir >= 1 && !this.joueur.m) {
      const o = tr.o, z = this.d.zones[o.zone];
      const mid = this.d.mondeDeZone[o.zone];
      if (!this.M || this.M.id !== mid) this.chargerMonde(mid);
      let x = o.x, y = o.y, dir = o.dir;
      if (x === undefined) { const w = z.warps[o.warp]; x = w.x; y = w.y; }
      const p = this.M.props(x, y);
      if (dir === undefined) dir = p.tapis !== null ? OPPOSE[p.tapis] : 1;
      // les drapeaux temporaires (TMP_…) ne vivent que le temps d'une carte
      for (const f of [...this.etat.drapeaux]) if (f.startsWith('TMP_')) this.etat.drapeaux.delete(f);
      this.majVisibles();
      this.placerJoueur(x, y, dir);
      this.majZone(true);
      this.lancerNiveau('chargement');
      this.camera = null; this.majCamera();
      this.sortir({ type: 'carte', monde: this.M.id, zone: o.zone });
      // en arrivant sur une porte, on sort d'un pas
      const sortie = o.sortie !== undefined ? o.sortie : (p.warp === 'entree' && this.M.mb(x, y) === 12 ? 1 : null);
      tr.sortie = sortie;
      tr.phase = 'entree';
      this.fondu(0, 12);
      return;
    }
    if (tr.phase === 'entree' && this.noir <= 0) {
      const j = this.joueur;
      if (tr.sortie !== null && tr.sortie !== undefined && !tr.sortiFait) {
        tr.sortiFait = true;
        const r = testerPas(this.M, j, tr.sortie, { objets: this.objets });
        j.dir = tr.sortie;
        if (r.ok) { j.lancer('pas', tr.sortie, VITESSE.marche); return; }
      }
      if (j.m) return;
      this.transition = null;
      this.lancerNiveau('transition');
    }
  }

  // ——— zones et scripts de niveau ———
  majZone(force = false) {
    const z = this.M.zone(this.joueur.x, this.joueur.y);
    if (!z || (z === this.zone && !force)) return;
    const avant = this.zone;
    this.zone = z;
    if (z.velo === false && this.mode === 'velo') this.changerMode('marche');
    if (!avant || avant.nom !== z.nom) this.sortir({ type: 'zone', zone: z.id, nom: z.nom, annonce: z.annonce !== false && !!avant });
    if (!avant || avant.musique !== z.musique) { this.musique = z.musique; this.sortir({ type: 'musique', nom: z.musique }); }
  }
  lancerNiveau(quand) {
    const n = this.zone?.niveau;
    if (!n) return;
    if (quand === 'image') {
      for (const t of n.image || []) {
        if ((this.etat.vars[t.var] ?? 0) === (t.val ?? 0)) { this.lancerScript(this.zone.id, t.script); return; }
      }
      return;
    }
    if (n[quand]) this.lancerScript(this.zone.id, n[quand], { figer: false });
  }

  // ——— caméra ———
  majCamera() {
    const j = this.joueur;
    const preset = CAMERAS[this.zone?.camera || (this.zone?.interieur ? 'interieur' : 'dehors')] || CAMERAS.dehors;
    const z = this.M.hauteurCase(j.x, j.y) + (j.m ? (this.M.hauteurCase(j.m.vx, j.m.vy) - this.M.hauteurCase(j.x, j.y)) * Math.min(1, j.m.t / j.m.duree) : 0);
    const cible = { x: j.px + 0.5, y: j.py + 0.5, z, ...preset };
    if (!this.camera) { this.camera = { ...cible }; return; }
    const c = this.camera, k = 0.12;
    c.x = cible.x; c.y = cible.y;            // la caméra suit le joueur exactement, comme sur DS
    c.z += (cible.z - c.z) * 0.2;
    for (const p of ['distance', 'inclinaison', 'fov']) c[p] += (cible[p] - c[p]) * k;
  }

  // ——— sauvegarde ———
  sauvegarder() {
    const j = this.joueur;
    return JSON.stringify({
      v: 1, t: this.t, drapeaux: [...this.etat.drapeaux].sort(), vars: this.etat.vars, sac: this.etat.sac, equipe: this.etat.equipe, boite: this.etat.boite, argent: this.etat.argent,
      joueur: this.etat.joueur, soin: this.etat.soin, pas: this.etat.pas, mode: this.mode, rng: this.rng.etat(),
      position: { zone: this.zone.id, x: j.x, y: j.y, dir: j.dir },
    });
  }
  charger(json) {
    const s = typeof json === 'string' ? JSON.parse(json) : json;
    Object.assign(this.etat, { drapeaux: new Set(s.drapeaux), vars: s.vars, sac: s.sac, equipe: s.equipe, joueur: s.joueur, soin: s.soin, pas: s.pas, argent: s.argent ?? 3000, boite: s.boite || [] });
    this.t = s.t; this.rng.fixer(s.rng); this.mode = s.mode;
    const p = s.position;
    this.chargerMonde(this.d.mondeDeZone[p.zone]);
    this.placerJoueur(p.x, p.y, p.dir);
    this.zone = null; this.majZone(true);
    this.camera = null; this.majCamera();
  }

  /** empreinte de l'état (tests de déterminisme) */
  empreinte() {
    const j = this.joueur;
    const s = [this.t, j.x, j.y, j.dir, this.mode, this.zone?.id, [...this.etat.drapeaux].sort().join(), JSON.stringify(this.etat.vars),
      this.objets.map((o) => `${o.id}:${o.x},${o.y},${o.dir},${+o.visible}`).join(';'), this.rng.etat()].join('|');
    return hash(s);
  }
}

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
