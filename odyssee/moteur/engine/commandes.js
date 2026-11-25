// odyssee/moteur/engine/commandes.js — les commandes des scripts d'événements.
// Chaque commande déclare ses arguments (vérifiés à la compilation) et ce qu'elle fait sur le terrain `T`.
// Une commande qui doit attendre rend une fonction : le script reprend quand elle rend true.

import { OPPOSE, VITESSE } from './const.js';
import { testerPas } from './objets.js';

const fini = () => true;

/** la cible d'une commande : un identifiant d'objet, « joueur », ou « moi » (l'objet qui a lancé le script) */
function cible(T, ctx, id) {
  if (id === 'joueur') return T.joueur;
  if (id === 'moi' || id === undefined) return ctx.objet;
  const o = T.objet(id);
  if (!o) throw new Error(`script ${ctx.nom} : objet inconnu « ${id} »`);
  return o;
}

/** direction de a vers b (cases voisines ou alignées) */
export function dirVers(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 2;
  return dy > 0 ? 1 : 0;
}

export const COMMANDES = {
  // ——— déroulement ———
  fin: { exec: (T, ctx) => { ctx.fini = true; } },
  aller: { args: 'mot', etiquette: 0, exec: (T, ctx, [e]) => { ctx.pc = ctx.prog.etiquettes.get(e); } },
  appeler: { args: 'mot', etiquette: 0, exec: (T, ctx, [e]) => { ctx.pile.push(ctx.pc); ctx.pc = ctx.prog.etiquettes.get(e); } },
  retour: {
    exec: (T, ctx) => {
      if (!ctx.pile.length) throw new Error(`script ${ctx.nom} : « retour » sans « appeler »`);
      ctx.pc = ctx.pile.pop();
    },
  },
  attendre: { args: 'nombre', exec: (T, ctx, [n]) => { const fin = T.t + n; return () => T.t >= fin; } },

  // ——— verrou ———
  verrouiller: { exec: (T, ctx) => { T.verrouiller(ctx); } },
  verrouiller_tout: { exec: (T, ctx) => { T.verrouiller(ctx); } },
  liberer: { exec: (T, ctx) => { T.liberer(ctx); } },
  liberer_tout: { exec: (T, ctx) => { T.liberer(ctx); } },

  // ——— messages ———
  message: { args: 'texte', exec: (T, ctx, [s]) => T.message(s) },
  fermer_message: { exec: (T) => { T.fermerMessage(); } },
  oui_non: { exec: (T) => T.choix(['Oui', 'Non'], (i) => { T.etat.vars.RESULTAT = i === 0 ? 1 : 0; }) },
  choix: { args: '*', exec: (T, ctx, opts) => T.choix(opts.map(String), (i) => { T.etat.vars.RESULTAT = i; }) },

  // ——— drapeaux et variables ———
  drapeau: { args: 'mot', exec: (T, ctx, [n]) => { T.etat.drapeaux.add(n); T.majVisibles(); } },
  effacer: { args: 'mot', exec: (T, ctx, [n]) => { T.etat.drapeaux.delete(n); T.majVisibles(); } },
  var: { args: 'mot nombre', exec: (T, ctx, [n, v]) => { T.etat.vars[n] = v; } },
  ajouter: { args: 'mot nombre', exec: (T, ctx, [n, v]) => { T.etat.vars[n] = (T.etat.vars[n] ?? 0) + v; } },

  // ——— objets et mouvements ———
  regarder_joueur: {
    exec: (T, ctx) => { const o = ctx.objet; if (o && !o.bouge) o.dir = dirVers(o, T.joueur); },
  },
  joueur_regarde: { args: 'dir', exec: (T, ctx, [d]) => { T.joueur.dir = d; } },
  regarder: { args: 'mot dir', exec: (T, ctx, [id, d]) => { cible(T, ctx, id).dir = d; } },
  mouvement: {
    args: 'mot mot',
    exec: (T, ctx, [id, nom]) => {
      const pas = T.scripts.mouvement(ctx.prog, nom);
      if (!pas) throw new Error(`script ${ctx.nom} : mouvement inconnu « ${nom} »`);
      T.jouerMouvement(cible(T, ctx, id), pas);
    },
  },
  attendre_mouvements: { exec: (T) => () => T.objets.every((o) => !o.file.length && !o.m) && !T.joueur.file.length && !T.joueur.m },
  cacher: { args: 'mot', exec: (T, ctx, [id]) => { const o = cible(T, ctx, id); o.visible = false; o.cacheScript = true; } },
  montrer: { args: 'mot', exec: (T, ctx, [id]) => { const o = cible(T, ctx, id); o.visible = true; o.cacheScript = false; } },
  placer: {
    args: 'mot nombre nombre dir?',
    exec: (T, ctx, [id, x, y, d]) => {
      const o = cible(T, ctx, id); o.x = x; o.y = y; o.px = x; o.py = y; o.m = null; if (d !== undefined) o.dir = d;
    },
  },
  /**
   * L'objet marche jusqu'à (x, y) par le plus court chemin qui contourne le joueur et les PNJ (en courant avec « vite »).
   * Les scripts de HGSS écrivent ces trajets à la main ; ici le chemin s'adapte à la place du joueur.
   */
  marcher_vers: {
    args: 'mot nombre nombre mot?',
    exec: (T, ctx, [id, x, y, vite]) => {
      const o = cible(T, ctx, id), M = T.M, autres = [...T.objets.filter((p) => p !== o), T.joueur].filter((p) => p !== o);
      const cle = (a, b) => a + ',' + b, prec = new Map([[cle(o.x, o.y), null]]), file = [[o.x, o.y]];
      while (file.length) {
        const [cx, cy] = file.shift();
        if (cx === x && cy === y) break;
        for (let d = 0; d < 4; d++) {
          const r = testerPas(M, { x: cx, y: cy }, d, { pnj: true, objets: autres });
          if (!r.ok || r.type !== 'pas') continue;
          const k = cle(...r.vers);
          if (!prec.has(k)) { prec.set(k, [cx, cy, d]); file.push(r.vers); }
        }
      }
      if (!prec.has(cle(x, y))) { o.x = x; o.y = y; o.px = x; o.py = y; return; }
      const dirs = [];
      for (let k = cle(x, y); prec.get(k); ) { const [px, py, d] = prec.get(k); dirs.unshift(d); k = cle(px, py); }
      const v = vite === 'vite' ? VITESSE.course : VITESSE.pnj;
      T.jouerMouvement(o, dirs.map((dir) => ({ type: 'pas', dir, n: 1, vitesse: v })));
    },
  },
  /** pose un objet à côté du joueur (dx, dy en cases) : le rival qui surgit à la hauteur où l'on passe */
  placer_relatif: {
    args: 'mot nombre nombre dir?',
    exec: (T, ctx, [id, dx, dy, d]) => {
      const o = cible(T, ctx, id), j = T.joueur;
      o.x = j.x + dx; o.y = j.y + dy; o.px = o.x; o.py = o.y; o.m = null; if (d !== undefined) o.dir = d;
    },
  },
  exclamation: {
    args: 'mot?',
    exec: (T, ctx, [id]) => {
      const o = cible(T, ctx, id); o.bulle = '!'; o.tBulle = 40; T.sortir({ type: 'son', nom: 'exclamation' });
      return () => o.tBulle <= 0;
    },
  },

  // ——— téléportations et écran ———
  teleporter: {
    args: 'mot nombre',
    exec: (T, ctx, [zone, n]) => { T.teleporter({ zone, warp: n }); return () => !T.transition; },
  },
  teleporter_xy: {
    args: 'mot nombre nombre dir?',
    exec: (T, ctx, [zone, x, y, d]) => { T.teleporter({ zone, x, y, dir: d }); return () => !T.transition; },
  },
  fondu_noir: { exec: (T) => { T.fondu(1, 16); return () => T.noir >= 1; } },
  fondu_retour: { exec: (T) => { T.fondu(0, 16); return () => T.noir <= 0; } },
  secouer: { args: 'nombre', exec: (T, ctx, [n]) => { T.secousse = n; return () => T.secousse <= 0; } },
  son: { args: 'mot', exec: (T, ctx, [n]) => { T.sortir({ type: 'son', nom: n }); } },
  musique: { args: 'mot', exec: (T, ctx, [n]) => { T.musique = n; T.sortir({ type: 'musique', nom: n }); } },
  musique_zone: { exec: (T) => { T.musique = T.zone?.musique || null; T.sortir({ type: 'musique', nom: T.musique }); } },

  // ——— sac, équipe, combats ———
  donner_objet: {
    args: 'mot nombre?',
    exec: (T, ctx, [n, q = 1]) => {
      T.etat.sac[n] = (T.etat.sac[n] ?? 0) + q;
      T.sortir({ type: 'son', nom: 'objet' });
      return T.message(`{JOUEUR} obtient ${q > 1 ? q + ' × ' : ''}${T.nomObjet(n)} !`);
    },
  },
  boutique: { args: '*', exec: (T, ctx, objets) => T.boutique(objets) },
  donner_argent: { args: 'nombre', exec: (T, ctx, [n]) => { T.etat.argent += n; T.sortir({ type: 'son', nom: 'objet' }); } },
  compter_argent: { exec: (T) => { T.etat.vars.RESULTAT = T.etat.argent; } },
  /** arbre à baies (paramètres du panneau : baie, quantite) ; repousse après 300 pas ; RESULTAT = 1 si cueilli */
  cueillir: {
    exec: (T, ctx) => {
      const p = ctx.params || {};
      const v = `BAIE_${p.zone}_${p.x}_${p.y}`;
      const der = T.etat.vars[v];
      if (der !== undefined && T.etat.pas - der < (p.repousse ?? 300)) { T.etat.vars.RESULTAT = 0; return; }
      const b = p.baie || 'oran-berry', q = p.quantite ?? 2;
      T.etat.vars[v] = T.etat.pas;
      T.etat.sac[b] = (T.etat.sac[b] ?? 0) + q;
      T.etat.vars.RESULTAT = 1;
      T.sortir({ type: 'son', nom: 'objet' });
      return T.message(`{JOUEUR} cueille ${q} × ${T.objetsConnus[b]?.court || b} !`);
    },
  },
  /** l'objet qui a lancé le script disparaît (arbre coupé, rocher brisé) : son drapeau le garde caché */
  retirer: {
    exec: (T, ctx) => {
      const o = ctx.objet, f = T.drapeauObjet(o);
      if (f) T.etat.drapeaux.add(f);
      o.visible = false;
    },
  },
  compter_objet: { args: 'mot', exec: (T, ctx, [n]) => { T.etat.vars.RESULTAT = T.etat.sac[n] ?? 0; } },
  donner_pokemon: {
    args: 'mot nombre',
    exec: (T, ctx, [sp, niv]) => {
      const m = T.pokemon.creer(sp, niv);
      if (T.etat.equipe.length < 6) T.etat.equipe.push(m); else T.etat.boite.push(m);
      T.sortir({ type: 'son', nom: 'fanfare' });
      return T.message(`{JOUEUR} reçoit ${sp} !${T.etat.equipe.includes(m) ? '' : '\nIl est envoyé dans le PC.'}`);
    },
  },
  compter_equipe: { exec: (T) => { T.etat.vars.RESULTAT = T.etat.equipe.length; } },
  soigner: { exec: (T) => { for (const p of T.etat.equipe) T.pokemon.soigner(p); T.sortir({ type: 'son', nom: 'soin' }); return T.attendre(60); } },
  point_de_soin: { exec: (T) => { T.etat.soin = { zone: T.zone.id, x: T.joueur.x, y: T.joueur.y }; } },
  ramasser: {
    exec: (T, ctx) => {
      const o = ctx.objet, d = o.def;
      T.etat.sac[d.objet] = (T.etat.sac[d.objet] ?? 0) + (d.quantite ?? 1);
      if (d.drapeau) T.etat.drapeaux.add(d.drapeau);
      o.visible = false;
      T.sortir({ type: 'son', nom: 'objet' });
      return T.message(`{JOUEUR} trouve ${T.nomObjet(d.objet)} !`);
    },
  },
  combat_dresseur: {
    args: 'mot?',
    exec: (T, ctx, [id]) => {
      const o = id ? cible(T, ctx, id) : ctx.dresseur || ctx.objet;
      if (!o?.def.dresseur) throw new Error(`script ${ctx.nom} : combat_dresseur sans dresseur`);
      const d = o.def.dresseur;
      const prix = d.prix ?? 40 * Math.max(1, ...(d.equipe || []).map((p) => p.niveau || 1));
      return T.combat({ type: 'dresseur', objet: o.id, nom: o.def.nom || o.id, sprite: o.sprite, portrait: d.portrait, champion: !!d.champion, equipe: d.equipe || [], prix }, (victoire) => {
        if (victoire) { T.etat.drapeaux.add(T.drapeauDresseur(o)); T.etat.argent += prix; }
      });
    },
  },
  combat_sauvage: {
    args: 'mot nombre',
    exec: (T, ctx, [sp, niv]) => T.combat({ type: 'sauvage', espece: sp, niveau: niv }),
  },

  // ——— dresseurs (séquence du défi, lancée par le moteur) ———
  approcher_dresseur: {
    exec: (T, ctx) => {
      const o = ctx.dresseur, j = T.joueur;
      const n = Math.abs(j.x - o.x) + Math.abs(j.y - o.y) - 1;
      const d = dirVers(o, j);
      if (n > 0) T.jouerMouvement(o, [{ type: 'pas', dir: d, n, vitesse: 16 }]);
      return () => !o.m && !o.file.length;
    },
  },
  joueur_face_dresseur: { exec: (T, ctx) => { T.joueur.dir = dirVers(T.joueur, ctx.dresseur); } },
  script_dresseur: {
    exec: (T, ctx) => {
      const nom = ctx.dresseur.def.dresseur.script;
      const r = T.scripts.trouver(ctx.dresseur.zone, nom);
      if (!r) throw new Error(`dresseur ${ctx.dresseur.id} : script inconnu « ${nom} »`);
      [ctx.prog, ctx.pc] = r;
    },
  },

  // ——— chariots sur rails (Arène d'Écorcia : le « gymmick » de HGSS, src/field/gymmick/azalea.c) ———
  /** remet les chariots à leurs stations de départ et les aiguillages à zéro (à l'entrée de la salle, comme le jeu) */
  rails_depart: { exec: (T) => { T.railsDepart(); } },
  /** bascule l'aiguillage n (un bit de RAIL_AIG) */
  aiguillage: { args: 'nombre', exec: (T, ctx, [n]) => { T.etat.vars.RAIL_AIG = (T.etat.vars.RAIL_AIG ?? 0) ^ (1 << n); T.sortir({ type: 'son', nom: 'aiguillage' }); } },
  /** si un chariot attend à la station s et que l'aiguillage le permet, le joueur y monte et suit le tracé */
  chariot: { args: 'nombre', exec: (T, ctx, [s]) => T.chariot(s) },

  // ——— capacités de terrain ———
  commencer_surf: {
    exec: (T) => {
      const j = T.joueur;
      T.mode = 'surf'; T.sortir({ type: 'mode', mode: 'surf' });
      j.lancer('saut', j.dir, 24, 1);
      return () => !j.m;
    },
  },
  velo: { args: 'mot', exec: (T, ctx, [v]) => { T.changerMode(v === 'oui' ? 'velo' : 'marche'); } },
  tourner_joueur_vers: { args: 'mot', exec: (T, ctx, [id]) => { T.joueur.dir = dirVers(T.joueur, cible(T, ctx, id)); } },
  dos_au_joueur: { exec: (T, ctx) => { const o = ctx.objet; o.dir = OPPOSE[dirVers(o, T.joueur)]; } },
};
