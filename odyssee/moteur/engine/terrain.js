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

import { DX, DY, OPPOSE, PROPS, VITESSE, ELAN_VELO, VITESSE_GLACE, BAS, HAUT, rng as RNG } from './const.js';
import { Monde, preparer, valider, preparerBloc } from './carte.js';
import { ObjetTerrain, objetEn, testerPas, devant } from './objets.js';
import { Scripts, Contexte, avancer } from './script.js';
import { COMMANDES, dirVers } from './commandes.js';
import { COMMUN, COMMUN_EN } from './commun.js';

/** caméras par type de zone (comme les réglages de caméra des en-têtes de HGSS) */
/**
 * Caméras : celle d'Odyssée, qui reprend le cadrage de HeartGold / SoulSilver — inclinaison 55°, champ vertical 13°,
 * largeur resserrée de sin(55°) pour que chaque case soit carrée à l'écran (`carre`), 12 cases de haut et 16 de large
 * comme l'écran de la DS ; les personnages gardent leurs pixels carrés. Distance : 12 × sin(55°) / (2 tan 6,5°).
 */
const CAM_HGSS = { distance: 12 * Math.sin(55 * Math.PI / 180) / (2 * Math.tan(6.5 * Math.PI / 180)), inclinaison: 55, fov: 13, carre: true };
export const CAMERAS = {
  dehors: CAM_HGSS, ville: CAM_HGSS, interieur: CAM_HGSS, grotte: CAM_HGSS, haut: CAM_HGSS, proche: CAM_HGSS,
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
const SCRIPT_TYPE = { objet: 'RamasserObjet', arbre_coupe: 'ArbreCoupe', rocher: 'EclateRoc', rocher_force: 'Force' };

export class Terrain {
  constructor(donnees, opts = {}) {
    this.d = preparer(donnees);
    this.commandes = COMMANDES;
    const sources = { commun: (donnees.langue === 'en' ? COMMUN_EN : COMMUN) + '\n' + (donnees.scriptsCommuns || ''), ...Object.fromEntries(Object.entries(this.d.zones).map(([id, z]) => [id, z.scripts || ''])) };
    this.scripts = new Scripts(COMMANDES, sources);
    const err = valider(this.d, (z) => this.scripts.noms(z.id));
    // les données d'un vrai jeu (d.tolerant) ont leurs bizarreries (PNJ posé sur la carte d'à côté, porte inutilisée) :
    // on les signale sans refuser de jouer
    if (err.length && !opts.toleRant && !donnees.tolerant) throw new Error('données invalides :\n  ' + err.join('\n  '));
    if (err.length && donnees.tolerant) console.warn(`${err.length} remarques sur les données (première : ${err[0]})`);
    this.erreurs = err;
    this.graine = opts.graine ?? 1;
    this.rng = RNG(this.graine);
    this.t = 0;
    this.etat = {
      drapeaux: new Set(), vars: {}, sac: {}, equipe: [], joueur: { nom: opts.nom || donnees.nomJoueur || 'LUTH', sprite: opts.sprite || 'player_m' },
      soin: null, pas: 0, argent: opts.argent ?? 3000,
    };
    this.objetsConnus = { ...OBJETS };
    for (const [k, o] of Object.entries(donnees.objets || {})) this.objetsConnus[k] = { ...OBJETS[k], ...o };
    this.versionCarte = donnees.version ?? null;   // inscrite dans la sauvegarde : un paquet de données peut ainsi migrer les anciennes
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
    this.elan = 0;               // pas faits d'affilée à vélo dans le même sens (le vélo accélère)
    this.continu = false;        // le joueur enchaîne les pas (pas de demi-tour sur place)
    this.camera = null;
    this.compteurRencontre = 0;
    /**
     * réglages d'essai (labo du banc d'essai) : rencontres sauvages, dresseurs qui défient en voyant le joueur,
     * murs (false : on passe partout, comme un fantôme)
     */
    this.reglages = { rencontres: true, dresseurs: true, murs: true };
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
    if (this.d.transitionAvant) this.lancerNiveau('transition');
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
  nomObjet(n, court = false) { const o = this.objetsConnus[n]; return (court ? o?.court : o?.nom) || o?.nom || n.toUpperCase(); }
  /** nom d'une espèce : numéro national, ou identifiant (« chikorita ») */
  nomEspece(sp) {
    const N = this.d.nomsEspeces;
    if (N && /^\d+$/.test(String(sp))) return N[+sp] || String(sp);
    if (N) { const i = N.findIndex((n) => n && n.toLowerCase().replace(/[^a-z0-9]+/g, '-') === String(sp)); if (i > 0) return N[i]; }
    return String(sp).toUpperCase();
  }
  /** drapeau qui cache un objet : le sien, ou TMP_ pour un arbre à couper (il repousse au changement de carte) */
  drapeauObjet(o) { return o.def.drapeau || (o.def.type === 'arbre_coupe' || o.def.type === 'rocher' ? `TMP_COUPE_${o.zone}_${o.id}` : null); }
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
    if (this.trajet) this.majTrajet();
    this.majCamera();
  }

  // ——— chariots sur rails (Arène d'Écorcia) ———
  // zone.rails = { stations: [[x, y]…], depart: [station de chaque chariot], inverses: [stations d'où l'on part à
  // reculons], routes: { [station]: [route selon l'aiguillage 0..3 | null] } }, route = { vers, noeuds: [[x, y]…] }.
  // Les chariots sont les objets « chariot_<i> » de la zone ; leurs stations sont dans RAIL_<i>, l'aiguillage dans RAIL_AIG.
  railsDepart() {
    const r = this.zone?.rails;
    if (!r) return;
    r.depart.forEach((s, i) => { this.etat.vars['RAIL_' + i] = s; this.poserChariot(i); });
    this.etat.vars.RAIL_AIG = 0;
  }
  poserChariot(i) {
    const o = this.objet('chariot_' + i), r = this.zone.rails;
    if (!o) return;
    const [x, y] = r.stations[this.etat.vars['RAIL_' + i]];
    o.x = x; o.y = y; o.px = x; o.py = y; o.m = null;
  }
  chariot(s) {
    const r = this.zone?.rails;
    if (!r || this.trajet) return;
    const k = r.depart.findIndex((_, i) => this.etat.vars['RAIL_' + i] === s);
    const route = k < 0 ? null : r.routes[s]?.[this.etat.vars.RAIL_AIG ?? 0];
    if (!route) return;                       // pas de chariot ici, ou l'aiguillage ne mène nulle part
    const inv = r.inverses.includes(s);
    const noeuds = inv ? [...route.noeuds].reverse() : route.noeuds;
    const j = this.joueur, zoff = inv ? 1 : 0;
    // le joueur monte sur le chariot (un pas), attend un instant, puis suit le tracé à 1/8 de case par image
    j.lancer('pas', inv ? BAS : HAUT, VITESSE.marche);
    this.trajet = { k, noeuds, i: 0, pos: [...noeuds[0]], zoff, vers: route.vers, phase: 'monte', t: 0 };
    return () => !this.trajet;
  }
  majTrajet() {
    const tr = this.trajet, j = this.joueur, o = this.objet('chariot_' + tr.k);
    if (tr.phase === 'monte') { if (!j.m && ++tr.t > 4) { tr.phase = 'route'; this.sortir({ type: 'son', nom: 'chariot' }); } return; }
    if (tr.phase === 'route') {
      const n = tr.noeuds[tr.i + 1], dx = n[0] - tr.pos[0], dy = n[1] - tr.pos[1], l = Math.hypot(dx, dy), v = 1 / 8;
      if (l <= v) { tr.pos = [...n]; if (++tr.i >= tr.noeuds.length - 1) tr.phase = 'fin'; }
      else { tr.pos[0] += dx / l * v; tr.pos[1] += dy / l * v; }
    }
    if (o) { o.px = tr.pos[0]; o.py = tr.pos[1] - 0.05; }
    j.px = tr.pos[0]; j.py = tr.pos[1] + tr.zoff; j.frame = 0;
    if (tr.phase === 'fin') {
      const [x, y] = tr.pos;
      j.x = x; j.y = y + tr.zoff; j.px = j.x; j.py = j.y;
      this.etat.vars['RAIL_' + tr.k] = tr.vers;
      this.poserChariot(tr.k);
      this.secousse = 8;
      this.trajet = null;
    }
  }

  // ——— boîte de texte ———
  /** un message ; `duJeu` : texte des scripts du jeu (en anglais), que la page peut traduire */
  message(s, duJeu = false) {
    const texte = s.replace(/\{T(\d+)\}/g, (m, k) => this.tampons?.[+k] ?? (k === '0' ? this.etat.joueur.nom : '')).replace(/\{JOUEUR\}/g, this.etat.joueur.nom).replace(/\{RIVAL\}/g, this.etat.joueur.rival || 'SILVER').replace(/\{ARGENT\}/g, String(this.etat.argent)).replace(/\{VAR:(\w+)\}/g, (m, v) => String(this.etat.vars[v] ?? 0));
    // langue de l'écran : traduction faite (texte) ou en route (promesse : le texte anglais en attendant)
    const tr = duJeu ? this.traduire?.(texte) : null;
    const ui = { texte: typeof tr === 'string' ? tr : texte, vus: 0, choix: null, source: texte };
    if (tr && typeof tr.then === 'function') tr.then((t) => { if (this.ui === ui && !ui.lu && t) { ui.texte = t; ui.vus = Math.min(ui.vus, t.length); } });
    this.ui = ui;
    this.sortir({ type: 'message', texte: ui.texte });
    return () => this.ui === null || this.ui.lu;
  }
  choix(options, rendre) {
    if (!this.ui) this.ui = { texte: '', vus: 0 };
    // langue : oui / non, et les lignes de menu déjà traduites
    options = options.map((o) => (o === 'Oui' && this.d.langue === 'en' ? 'Yes' : o === 'Non' && this.d.langue === 'en' ? 'No' : (this.traduireCourt?.(o) ?? o)));
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
    if (this.mode === 'velo') return ELAN_VELO[Math.min(this.elan, ELAN_VELO.length - 1)];
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
    if (d === null) { this.continu = false; this.elan = 0; return; }
    // à vélo, changer de sens coupe l'élan (on repart doucement), mais on tourne sans s'arrêter
    if (this.mode === 'velo' && d !== j.dir) this.elan = 0;
    // appui bref depuis l'arrêt : on se tourne seulement (comme sur DS ; pas à vélo)
    if (d !== j.dir && !this.continu && this.mode !== 'velo') {
      j.lancer('tour', d, VITESSE.demiTour);
      return;
    }
    // tapis de sortie : on sort en avançant dans son sens
    const pj = this.M.props(j.x, j.y);
    if (pj.tapis !== null && pj.tapis === d && this.M.warp(j.x, j.y)) {
      j.dir = d; this.prendreWarp(this.M.warp(j.x, j.y)); return;
    }
    const fantome = this.reglages.murs === false && this.M.dedans(j.x + DX[d], j.y + DY[d]);
    const r = fantome ? { ok: true, type: 'pas', vers: [j.x + DX[d], j.y + DY[d]] } : testerPas(this.M, j, d, { surf: this.mode === 'surf', velo: this.mode === 'velo', objets: this.objets });
    j.course = false;   // contre un mur, on piétine au pas (comme dans HGSS), pas avec la planche de course
    // FORCE : on pousse le rocher d'une case (s'il a la place) ; il revient quand on quitte la carte
    if (!r.ok && r.raison === 'objet') {
      const o = objetEn(this.objets, j.x + DX[d], j.y + DY[d], j);
      if (o?.def.type === 'rocher_force' && !o.m && !o.file.length && this.etat.drapeaux.has('TMP_FORCE')) {
        const q = testerPas(this.M, o, d, { pnj: true, objets: [...this.objets, j] });
        if (q.ok && q.type === 'pas' && !this.M.props(...q.vers).surf) {
          // un trou (déclencheur au sol qui fait tomber) : le rocher y tombe, et réapparaît à l'étage du dessous
          // (drapeaux …_INIT → …_FALLEN, comme ceux de la Route de Glace)
          const trou = this.M.declencheursEn(...q.vers).length > 0 && /_INIT$/.test(o.def.drapeau || '');
          o.file.push({ type: 'pas', dir: d, n: 1, vitesse: VITESSE.pnj, libre: true });
          if (trou) o.file.push({ type: 'attente', n: 6 }, { type: 'chute' });
          this.sortir({ type: 'son', nom: 'force' });
          j.lancer('surplace', d, VITESSE.pnj); this.continu = true; return;
        }
      }
      // bloc de glace (arène de Mahogany) : poussé, il glisse sur la glace jusqu'au premier obstacle
      if (o?.def.type === 'bloc_glace' && !o.m && !o.file.length) {
        let n = 0, x = o.x, y = o.y;
        for (;;) {
          const q = testerPas(this.M, { x, y }, d, { pnj: true, objets: [...this.objets, j].filter((b) => b !== o) });
          if (!q.ok || q.type !== 'pas' || !this.M.props(...q.vers).glisse) break;
          [x, y] = q.vers; n++;
          if (n > 40) break;
        }
        if (n) { o.file.push({ type: 'pas', dir: d, n, vitesse: VITESSE.glisse, libre: true }); this.sortir({ type: 'son', nom: 'force' }); j.lancer('surplace', d, VITESSE.pnj); this.continu = true; return; }
      }
    }
    if (!r.ok) {
      this.elan = 0;
      j.lancer('surplace', d, VITESSE.heurt);
      if (this.tHeurt === undefined || this.t - this.tHeurt >= VITESSE.heurt) { this.sortir({ type: 'son', nom: 'heurt' }); this.tHeurt = this.t; }
      this.continu = true;
      return;
    }
    if (r.type === 'saut') { j.lancer('saut', d, VITESSE.saut, 2); this.sortir({ type: 'son', nom: 'saut' }); }
    else {
      const v = this.vitesseJoueur(ent);
      j.lancer('pas', d, v);
      j.course = v === VITESSE.course && this.mode === 'marche';
      if (this.mode === 'velo') this.elan++;
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
    // cascade, tourbillon, paroi à gravir devant : proposer la capacité
    const pf = this.M.props(fx, fy);
    if (pf.capacite && !this.M.bloquee(fx, fy) && (pf.surf ? this.mode === 'surf' : this.mode !== 'surf')) {
      const nom = { cascade: 'Cascade', siphon: 'Siphon', escalade: 'Escalade' }[pf.capacite];
      this.lancerScript(this.zone.id, (this.capacite(pf.capacite) ? 'Proposer' : 'Impossible') + nom);
      return;
    }
    // eau devant : proposer de surfer
    if (this.mode !== 'surf' && pf.surf && !this.M.bloquee(fx, fy) && this.capacite('surf') && !objetEn(this.objets, fx, fy))
      this.lancerScript(this.zone.id, 'ProposerSurf');
  }
  /**
   * Une capacité de terrain est-elle utilisable ? Données du jeu (d.capacites : { nom: [badge, CS] }) : le badge et
   * la CS dans le sac ; sinon le drapeau CS_<NOM> (zone d'essai). ?tout donne tout (drapeau TOUT_CS).
   */
  capacite(nom) {
    const D = this.etat.drapeaux;
    if (D.has('TOUT_CS')) return true;
    const r = this.d.capacites?.[nom];
    if (r) return r.every((x) => (/^BADGE_/.test(x) ? D.has(x) : (this.etat.sac[x] ?? 0) > 0));
    return D.has('CS_' + nom.toUpperCase());
  }
  /** franchir d'un trait la cascade, le tourbillon ou la paroi devant soi (puis la case d'après) */
  franchir() {
    const j = this.joueur, d = j.dir, M = this.M;
    let x = j.x + DX[d], y = j.y + DY[d], n = 0;
    const cap = M.props(x, y).capacite;
    if (!cap) return;
    while (M.dedans(x, y) && M.props(x, y).capacite === cap && n < 40) { n++; x += DX[d]; y += DY[d]; }
    if (M.dedans(x, y) && !M.bloquee(x, y)) n++;
    j.file.push({ type: 'pas', dir: d, n, vitesse: VITESSE.course, libre: true });
  }
  basculerVelo() {
    if (this.mode === 'surf') return;
    if (this.mode === 'velo') { this.changerMode('marche'); return; }
    if (!this.etat.sac.velo && !this.etat.sac.bicycle) return;
    if (this.zone?.velo === false || this.M.props(this.joueur.x, this.joueur.y).pasVelo) {
      this.lancerScript(this.zone.id, 'PasDeVeloIci'); return;
    }
    this.changerMode('velo');
  }
  changerMode(m) {
    if (this.mode === m) return;
    const avant = this.mode;
    this.mode = m; this.elan = 0; this.sortir({ type: 'mode', mode: m });
    // le vélo a sa musique ; on retrouve celle de la zone en descendant
    if (m === 'velo') this.sortir({ type: 'musique', nom: 'velo' });
    else if (avant === 'velo' && this.musique) this.sortir({ type: 'musique', nom: this.musique });
  }

  /** fait avancer un objet ; pour le joueur, gère la fin de chaque pas */
  majObjet(o, joueur, libre = true) {
    // un objet caché ne bouge pas seul ; mais un script peut le déplacer (dans HGSS, il avance même invisible)
    if (!joueur && !o.visible && !o.file.length && !o.m) return;
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
        // un script bloqué attend ; sauf pour les données du jeu (scriptsTraversent) : dans HGSS, les mouvements de
        // script ne testent pas les collisions, et ses scènes comptent dessus (un PNJ errant qui rejoint le joueur)
        if (!r.ok && !this.d.scriptsTraversent && !a.libre) { o.dir = a.dir; return; }
        o.lancer('pas', a.dir, a.vitesse);
        if (--a.n <= 0) fin();
        return;
      }
      case 'chute': {
        const f = o.def.drapeau;
        this.etat.drapeaux.add(f); this.etat.drapeaux.delete(f.replace(/_INIT$/, '_FALLEN'));
        this.sortir({ type: 'son', nom: 'chute' }); fin(); this.majVisibles(); return;
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
  jouerMouvement(o, pas) { if (o.fantome) return; for (const p of pas) o.file.push({ ...p }); }

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
    if (p.glisse && M.pentes) { if (this.glissePente()) return; }
    else j.vGlace = 0;
    const force = p.glisse && !M.pentes ? j.dir : p.force;
    if (force !== null && force !== undefined) {
      const r = testerPas(M, j, force, { surf: this.mode === 'surf', objets: this.objets });
      if (r.ok && r.type === 'pas') { j.lancer(p.glisse ? 'glisse' : 'pas', force, VITESSE.glisse); return; }
    }
    // 5. regard des dresseurs
    if (this.regardDresseurs()) return;
    // 6. rencontres
    this.testerRencontre(p);
  }
  /**
   * Glace à pentes, comme l'Arène de Frimapic de Platine (player_move.c) : chaque case de descente donne de la vitesse
   * (jusqu'à 3), chaque case de montée en retire ; sans vitesse, on ne monte pas : on redescend d'une case et on
   * s'arrête. Une boule de neige devant soi se brise si l'on arrive avec de la vitesse (au moins 1), sinon on s'arrête
   * contre elle. Rend true si un pas forcé est lancé.
   */
  glissePente() {
    const j = this.joueur, M = this.M, d = j.dir;
    j.vGlace ??= 0;
    // après avoir reculé d'une pente, on s'arrête
    if (j.apresRecul) { j.apresRecul = false; j.vGlace = 0; return false; }
    const nx = j.x + DX[d], ny = j.y + DY[d];
    // comme le jeu : on regarde la pente un quart de case devant soi, donc celle de la case où l'on est
    const dh = M.pente(j.x, j.y, d);
    // la boule de neige se brise sous l'élan
    const boule = this.objets.find((o) => o.visible && o.def.boule && o.x === nx && o.y === ny);
    if (boule && j.vGlace >= 1) {
      boule.visible = false; this.etat.drapeaux.add(this.drapeauObjet(boule));
      this.sortir({ type: 'son', nom: 'boule' });
    }
    const r = testerPas(M, j, d, { objets: this.objets });
    const recul = () => {
      const rr = testerPas(M, j, OPPOSE[d], { objets: this.objets });
      j.vGlace = 0;
      if (!rr.ok || rr.type !== 'pas') return false;
      j.lancer('recul', OPPOSE[d], VITESSE.marche); j.dir = d; j.apresRecul = true;
      return true;
    };
    if (!r.ok || r.type !== 'pas') { if (dh > 0) return recul(); j.vGlace = 0; return false; }
    if (dh > 0 && --j.vGlace < 0) return recul();
    if (dh < 0) j.vGlace = Math.min(3, j.vGlace + 1);
    j.lancer('glisse', d, VITESSE_GLACE[j.vGlace]);
    return true;
  }
  testerRencontre(p) {
    if (this.reglages.rencontres === false) return;
    // dans les grottes (table « sol »), chaque pas sur le sol peut faire surgir un POKéMON, comme dans HGSS
    const cle = p.rencontre || (this.zone?.rencontres?.sol && !p.warp && !p.tapis && !p.glisse ? 'sol' : null);
    if (!cle || this.mode === 'velo' && cle === 'eau') return;
    const table = this.zone?.rencontres?.[cle];
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
    if (this.reglages.dresseurs === false) return false;
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
  /**
   * un écran que la page ouvre (machine à sous du Casino…) : le terrain attend que la page appelle finEcran()
   */
  ecran(quoi, donnees = {}) {
    this.ecranEnCours = { quoi, ...donnees };
    this.sortir({ type: 'ecran', quoi, ...donnees });
    return () => !this.ecranEnCours;
  }
  finEcran() { this.ecranEnCours = null; }
  /** fin d'un combat ; `issue` : 'win', 'lose', 'flee' ou 'caught' (ce que rend l'écran de combat) */
  terminerCombat(victoire = true, issue = victoire ? 'win' : 'lose') {
    const c = this.combatEnCours;
    if (!c) return;
    this.combatEnCours = null;
    c.apres?.(victoire, issue);
    if (!victoire) this.tomberKo();
  }
  tomberKo() {
    const s = this.etat.soin;
    for (const p of this.etat.equipe) this.pokemon.soigner(p);
    if (s) this.teleporter({ zone: s.zone, x: s.x, y: s.y, dir: 0 });
  }

  // ——— téléporteurs ———
  /**
   * Ajoute des données en cours de partie (cartes chargées à la demande) : zones, blocs, mondes. Si le monde où l'on
   * est change, ses événements sont repris (le joueur ne bouge pas).
   */
  ajouterDonnees(p) {
    if (!p) return;
    for (const [id, b] of Object.entries(p.blocs || {})) this.d.blocsPrets[id] = preparerBloc({ id, ...b });
    for (const [mid, m] of Object.entries(p.mondes || {})) {
      this.d.mondes[mid] = m;
      for (const z of m.zones) if (z && !this.d.mondeDeZone[z]) this.d.mondeDeZone[z] = mid;
    }
    const ids = Object.keys(p.zones || {});
    for (const id of ids) {
      this.d.zones[id] = { ...p.zones[id], id };
      this.scripts.ajouter(id, p.zones[id].scripts || '');
    }
    if (this.M && ids.some((id) => this.d.mondeDeZone[id] === this.M.id)) {
      const j = this.joueur, autres = new Map(this.objets.map((o) => [o.zone + ':' + o.id, o]));
      this.M = new Monde(this.d, this.M.id);
      // les objets des zones déjà là gardent leur état ; ceux des zones nouvelles arrivent
      this.objets = this.M.objets.map((def) => {
        const vieux = !ids.includes(def.zone) && autres.get(def.zone + ':' + def.id);
        if (vieux) return vieux;
        const o = new ObjetTerrain(def, RNG(this.graine ^ hash(def.zone + ':' + def.id)));
        o.zone = def.zone;
        return o;
      });
      this.majVisibles();
      if (ids.includes(this.zone?.id)) this.zone = this.d.zones[this.zone.id];
      j.m = j.m || null;
    }
  }
  prendreWarp(w) {
    if (w.dynamique && this.etat.warpDyn) { const q = this.etat.warpDyn; this.teleporter({ zone: q.zone, x: q.x, y: q.y, dir: q.dir }); return; }
    if (!w.vers || !this.d.zones[w.vers]) return;          // porte qui ne mène nulle part
    const cible = this.d.zones[w.vers];
    const dest = cible.aCharger ? null : cible.warps[w.n ?? 0];
    this.sortir({ type: 'son', nom: this.M.mb(w.x, w.y) === 12 ? 'porte' : 'escalier' });
    this.teleporter({ zone: w.vers, warp: w.n ?? 0, sortie: dest?.sortie });
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
      // carte pas encore là : on la demande et on attend dans le noir
      if (this.d.zones[tr.o.zone]?.aCharger) {
        if (!tr.demande) { tr.demande = true; this.chargeur?.(tr.o.zone); }
        return;
      }
      const o = tr.o, z = this.d.zones[o.zone];
      if (this.zone && this.zone.id !== o.zone) this.etat.zonePrecedente = this.zone.id;
      const mid = this.d.mondeDeZone[o.zone];
      if (!this.M || this.M.id !== mid) this.chargerMonde(mid);
      let x = o.x, y = o.y, dir = o.dir;
      if (x === undefined) { const w = z.warps[o.warp]; x = w.x; y = w.y; }
      const p = this.M.props(x, y);
      if (dir === undefined) dir = p.tapis !== null ? OPPOSE[p.tapis] : 1;
      // les drapeaux temporaires (TMP_…) ne vivent que le temps d'une carte
      for (const f of [...this.etat.drapeaux]) if (f.startsWith('TMP_') || f.startsWith('FLAG_MAPTEMP_')) this.etat.drapeaux.delete(f);
      // comme dans HGSS, les variables VAR_TEMP_… repartent de zéro sur chaque carte
      for (const v of Object.keys(this.etat.vars)) if (v.startsWith('VAR_TEMP_')) delete this.etat.vars[v];
      if (this.etat.warpsDeplaces) { this.etat.warpsDeplaces = {}; this.majWarps(); }
      this.majVisibles();
      this.placerJoueur(x, y, dir);
      // comme dans le jeu, on arrive toujours visible (la chute des Ruines d'Alpha rend le joueur invisible avant le saut)
      this.joueur.visible = true; this.joueur.cacheScript = false;
      this.majZone(true);
      this.lancerNiveau('reprise');
      this.lancerNiveau('chargement');
      // les données du jeu : le script « à l'entrée » joue pendant le noir (il cache ou montre les personnages)
      if (this.d.transitionAvant) this.lancerNiveau('transition');
      this.camera = null; this.majCamera();
      this.sortir({ type: 'carte', monde: this.M.id, zone: o.zone });
      // en arrivant sur une porte, on sort d'un pas
      let sortie = o.sortie !== undefined ? o.sortie : (p.warp === 'entree' && this.M.mb(x, y) === 12 ? 1 : null);
      // une porte large (deux cases de porte côte à côte, comme l'entrée du Chemin du Carillon) : on ne ressort pas
      // sur l'autre case de porte (elle ramènerait d'où l'on vient), mais vers une case libre
      if (sortie !== null && sortie !== undefined && this.M.warp(x + DX[sortie], y + DY[sortie])) {
        const autre = [1, 3, 2, 0].find((d) => this.M.dedans(x + DX[d], y + DY[d]) && !this.M.bloquee(x + DX[d], y + DY[d]) && !this.M.warp(x + DX[d], y + DY[d]));
        if (autre !== undefined) sortie = autre;
      }
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
      if (!this.d.transitionAvant) this.lancerNiveau('transition');
    }
  }

  /** les téléporteurs déplacés par les scripts (MoveWarp), le temps d'une carte comme dans le jeu */
  majWarps() { this.M?.placerWarps?.(this.etat.warpsDeplaces || {}); }

  // ——— zones et scripts de niveau ———
  majZone(force = false) {
    const z = this.M.zone(this.joueur.x, this.joueur.y);
    if (!z || (z === this.zone && !force)) return;
    const avant = this.zone;
    this.zone = z;
    if (z.velo === false && this.mode === 'velo') this.changerMode('marche');
    if (!avant || avant.nom !== z.nom) this.sortir({ type: 'zone', zone: z.id, nom: z.nom, annonce: z.annonce !== false && !!avant });
    if (!avant || avant.musique !== z.musique) { this.musique = z.musique; if (this.mode !== 'velo') this.sortir({ type: 'musique', nom: z.musique }); }
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
      ...(this.versionCarte !== null ? { carte: this.versionCarte } : {}),
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
