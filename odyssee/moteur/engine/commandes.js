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
  if (o) return o;
  // un personnage que le jeu cache encore ou qu'on n'a pas posé : les commandes sur lui ne font rien
  if (T.objetsFantomes !== false) {
    if (!(T.absentsVus ||= new Set()).has(id)) { T.absentsVus.add(id); console.warn(`script ${ctx.nom} : objet absent « ${id} »`); }
    return { id, x: 0, y: 0, file: [], m: null, def: {}, fantome: true };
  }
  throw new Error(`script ${ctx.nom} : objet inconnu « ${id} »`);
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
  message: { args: 'texte', exec: (T, ctx, [s]) => T.message(s, /^HGD?_/.test(ctx.nom || '')) },
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
  /** comme placer, avec des coordonnées qui peuvent être des variables */
  placer_var: {
    args: 'mot mot mot dir?',
    exec: (T, ctx, [id, vx, vy, d]) => {
      const v = (a) => (/^-?\d+$/.test(String(a)) ? +a : T.etat.vars[a] ?? 0);
      const o = cible(T, ctx, id); o.x = v(vx); o.y = v(vy); o.px = o.x; o.py = o.y; o.m = null; if (d !== undefined) o.dir = d;
    },
  },
  /**
   * un appel du Pokégear (PhoneCall du jeu) : les paroles des appels ne sont pas dans les fichiers publiés ; le moteur
   * dit qui appelle et l'essentiel (APPELS de donnees/appels.js, sinon un appel sans paroles)
   */
  appel: {
    args: 'mot nombre',
    exec: (T, ctx, [qui, k]) => {
      T.sortir({ type: 'son', nom: 'telephone' });
      const t = T.d.appels?.(qui, k, T.d.langue) || (T.d.langue === 'en' ? `Ring ring… ${qui} is calling on the POKéGEAR.` : `Drrring… ${qui} appelle sur le POKéGEAR.`);
      return T.message(t);
    },
  },
  /**
   * l'étage d'où l'on vient (GetDynamicWarpFloorNo) : 1F → 0, 2F → 1…, sous-sol → −1, toit → le dernier étage + 1 ;
   * quelques ascenseurs du jeu numérotent autrement (table ETAGES_PARTICULIERS)
   */
  etage_ascenseur: {
    args: 'mot',
    exec: (T, ctx, [v]) => {
      const z = T.etat.zonePrecedente || '';
      const part = { GOLDENROD_RADIO_TOWER_5F: 0, GOLDENROD_RADIO_TOWER_OBSERVATION_DECK: 1 }[z];
      let n = part;
      if (n === undefined) {
        const m = z.match(/_(B?)(\d+)F$/);
        if (m) n = m[1] ? -(+m[2]) : +m[2] - 1;
        else if (/ROOF|DECK/.test(z)) {
          const base = z.replace(/_(ROOF|OBSERVATION_DECK|ROOF_ROOM)$/, '');
          n = Math.max(0, ...Object.keys(T.d.zones).filter((k) => k.startsWith(base + '_')).map((k) => +(k.match(/_(\d+)F$/)?.[1] ?? 0))) ;
        } else n = 0;
      }
      T.etat.vars[v] = n < 0 ? 65536 + n : n;
    },
  },
  /** nom d'un étage pour un message (BufferDeptStoreFloorNo) : 1 → « 2F », 0 → « 1F », toit… */
  tampon_etage: {
    args: 'nombre mot',
    exec: (T, ctx, [k, n]) => {
      const e = /^VAR_/.test(n) ? T.etat.vars[n] ?? 0 : +n;
      (T.tampons ||= [])[k] = e >= 32768 ? `B${65536 - e}F` : `${e + 1}F`;
    },
  },
  /** ouvre un écran de la page (« casino » : la machine à sous d'Odyssée, avec les jetons du jeu) */
  ecran: { args: 'mot', exec: (T, ctx, [quoi]) => T.ecran(quoi) },
  /** numéro (du jeu) de la carte d'où l'on vient */
  carte_precedente: { args: 'mot', exec: (T, ctx, [v]) => { T.etat.vars[v] = T.d.numeroCarte?.[T.etat.zonePrecedente] ?? 0; } },
  /** le trajet en ascenseur : un peu d'attente, la cabine qui tremble */
  ascenseur: { exec: (T) => { T.sortir({ type: 'son', nom: 'ascenseur' }); T.secousse = 40; return () => T.secousse <= 0; } },
  /** échanges avec les habitants : la demande (espèce voulue) et l'échange lui-même ; table donnees/echanges.js */
  echange_charger: { args: 'nombre', exec: (T, ctx, [n]) => { T.echangeEnCours = T.d.echanges?.[n] || null; } },
  echange_demande: { args: 'mot', exec: (T, ctx, [v]) => { T.etat.vars[v] = T.echangeEnCours?.demande ?? -1; } },
  echange: {
    args: 'mot',
    exec: (T, ctx, [v]) => {
      const e = T.echangeEnCours, i = /^VAR_/.test(v) ? T.etat.vars[v] ?? 0 : +v;
      if (!e || !T.etat.equipe[i]) return;
      const m = T.pokemon.creer(e.donne, Math.max(1, T.etat.equipe[i].niveau ?? T.etat.equipe[i].lvl ?? 5));
      if (e.surnom) m.surnom = e.surnom;
      T.etat.equipe[i] = m;
      T.sortir({ type: 'son', nom: 'fanfare' });
    },
  },
  /** fin du jeu (générique du Panthéon) : drapeau FLAG_GAME_CLEAR, équipe soignée, retour dans la chambre */
  fin_du_jeu: {
    exec: (T) => {
      T.etat.drapeaux.add('FLAG_GAME_CLEAR');
      for (const p of T.etat.equipe) T.pokemon.soigner(p);
      T.sortir({ type: 'son', nom: 'fanfare' });
      T.sortir({ type: 'fin_du_jeu' });
      const z = T.d.departFin || { zone: 'NEW_BARK_PLAYER_HOUSE_2F', warp: 0 };
      if (T.d.zones[z.zone]) {
        T.etat.soin = { zone: 'NEW_BARK_PLAYER_HOUSE_1F', x: null, y: null };
        const lu = T.message(T.d.langue === 'en' ? 'Congratulations, {JOUEUR}!\nYou entered the HALL OF FAME.\n\nTHE END' : 'Félicitations, {JOUEUR} !\nTu entres au PANTHÉON.\n\nFIN');
        let parti = false;
        return () => {
          if (!parti) { if (!lu()) return false; T.ui = null; parti = true; T.teleporter(z); }
          return !T.transition && T.zone.id === z.zone;
        };
      }
    },
  },
  /** l'apparence de l'ami (Célesta pour un garçon, Luth pour une fille) dans une variable d'objet (GetFriendSprite) */
  sprite_ami: {
    args: 'mot',
    exec: (T, ctx, [v]) => { T.etat.vars[v] = T.etat.joueur?.sprite === 'player_f' ? (T.d.spriteAmi?.f ?? 213) : (T.d.spriteAmi?.m ?? 214); },
  },
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
  /** téléportation à des coordonnées lues dans des variables (ou écrites en chiffres) */
  teleporter_var: {
    args: 'mot mot mot dir?',
    exec: (T, ctx, [zone, vx, vy, d]) => {
      const v = (a) => (/^-?\d+$/.test(String(a)) ? +a : T.etat.vars[a] ?? 0);
      T.teleporter({ zone, x: v(vx), y: v(vy), dir: d }); return () => !T.transition;
    },
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
      return T.message(T.d.langue === 'en' ? `{JOUEUR} obtained ${q > 1 ? q + ' × ' : 'the '}${T.nomObjet(n, true)}!` : `{JOUEUR} obtient ${q > 1 ? q + ' × ' : ''}${T.nomObjet(n)} !`);
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
      return T.message(T.d.langue === 'en' ? `{JOUEUR} picked ${q} ${T.objetsConnus[b]?.court || b}!` : `{JOUEUR} cueille ${q} × ${T.objetsConnus[b]?.court || b} !`);
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
      return T.message(T.d.langue === 'en' ? `{JOUEUR} received ${T.nomEspece(m.sp ?? sp)}!${T.etat.equipe.includes(m) ? '' : '\nIt was sent to the PC.'}` : `{JOUEUR} reçoit ${sp} !${T.etat.equipe.includes(m) ? '' : '\nIl est envoyé dans le PC.'}`);
    },
  },
  /** POKéMON reçu sans message du moteur (le script du jeu a le sien) */
  recevoir_pokemon: {
    args: 'mot nombre',
    exec: (T, ctx, [sp, niv]) => {
      const m = T.pokemon.creer(/^VAR_/.test(sp) ? T.etat.vars[sp] ?? 0 : sp, niv);
      if (T.etat.equipe.length < 6) T.etat.equipe.push(m); else T.etat.boite.push(m);
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
      return T.message(T.d.langue === 'en' ? `{JOUEUR} found ${/^[aeiou]/i.test(T.nomObjet(d.objet, true)) ? 'an' : 'a'} ${T.nomObjet(d.objet, true)}!` : `{JOUEUR} trouve ${T.nomObjet(d.objet)} !`);
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
  /** combat contre un dresseur du jeu (équipe de trainers.json) : `combat_hg TRAINER_X` ; drapeau DRESSEUR_X si gagné */
  combat_hg: {
    args: 'mot',
    exec: (T, ctx, [id]) => {
      const d = T.d.dresseursHG?.[id];
      if (!d) return;
      const prix = 40 * Math.max(1, ...d.equipe.map((p) => p.niveau || 1));
      return T.combat({ type: 'dresseur', objet: ctx.objet?.id || null, nom: d.nom, sprite: ctx.objet?.sprite, equipe: d.equipe, prix }, (victoire) => {
        if (victoire) { T.etat.drapeaux.add('DRESSEUR_' + id); T.etat.argent += prix; }
      });
    },
  },
  // ——— commandes des scripts du jeu (traduits par donnees/evenements-hg.js) ———
  position_joueur: { args: 'mot mot', exec: (T, ctx, [vx, vy]) => { T.etat.vars[vx] = T.joueur.x; T.etat.vars[vy] = T.joueur.y; } },
  position_objet: { args: 'mot mot mot', exec: (T, ctx, [id, vx, vy]) => { const o = cible(T, ctx, id); T.etat.vars[vx] = o.x; T.etat.vars[vy] = o.y; } },
  direction_joueur: { args: 'mot', exec: (T, ctx, [v]) => { T.etat.vars[v] = T.joueur.dir; } },
  /** oui ou non après un message ; VAR = 0 pour oui, 1 pour non (comme GetMenuChoice du jeu) */
  oui_non_var: { args: 'mot', exec: (T, ctx, [v]) => T.choix(['Oui', 'Non'], (i) => { T.etat.vars[v] = i; T.etat.vars.RESULTAT = i === 0 ? 1 : 0; }) },
  /** menu : VAR reçoit la valeur de la ligne choisie (« 0,1,2 ») */
  choix_var: { args: 'mot mot *', exec: (T, ctx, [v, vals, ...opts]) => { const vs = String(vals).split(','); return T.choix(opts.map(String), (i) => { T.etat.vars[v] = +vs[i]; T.etat.vars.RESULTAT = i; }); } },
  avoir_objet: { args: 'mot nombre mot', exec: (T, ctx, [n, q, v]) => { T.etat.vars[v] = (T.etat.sac[n] ?? 0) >= q ? 1 : 0; } },
  retirer_objet: { args: 'mot nombre', exec: (T, ctx, [n, q]) => { T.etat.sac[n] = Math.max(0, (T.etat.sac[n] ?? 0) - q); } },
  /** tampon de texte k ({Tk} dans les messages) : joueur, rival, equipe (rang), espece, objet, nombre, poche */
  tampon: {
    args: 'nombre mot texte',
    exec: (T, ctx, [k, type, a]) => {
      const v = (x) => (/^VAR_/.test(x) ? T.etat.vars[x] ?? 0 : x);
      const m = type === 'equipe' ? T.etat.equipe[+v(a) || 0] : null;
      const POCHES = ['Items', 'Medicine', 'Poké Balls', 'TMs & HMs', 'Berries', 'Mail', 'Battle Items', 'Key Items'];
      (T.tampons ||= [])[k] = type === 'joueur' ? T.etat.joueur.nom
        : type === 'rival' ? T.etat.joueur.rival || T.d.nomRival || 'SILVER'
          : type === 'equipe' ? (m ? T.nomEspece(m.sp) : '')
            : type === 'espece' ? T.nomEspece(v(a))
              : type === 'objet' ? T.nomObjet(String(v(a)), true)
                : type === 'poche' ? POCHES[+v(a)] || ''
                  : String(v(a));
    },
  },
  // ——— variables, argent, équipe : le reste des commandes des scripts du jeu ———
  copier_var: { args: 'mot mot', exec: (T, ctx, [a, b]) => { T.etat.vars[a] = T.etat.vars[b] ?? 0; } },
  soustraire: { args: 'mot nombre', exec: (T, ctx, [a, n]) => { T.etat.vars[a] = (T.etat.vars[a] ?? 0) - n; } },
  ajouter_var: { args: 'mot mot', exec: (T, ctx, [a, b]) => { T.etat.vars[a] = (T.etat.vars[a] ?? 0) + (T.etat.vars[b] ?? 0); } },
  /** _CMP = A − B : les conditions « si var _CMP <op> 0 » comparent deux variables */
  comparer_vars: { args: 'mot mot', exec: (T, ctx, [a, b]) => { T.etat.vars._CMP = (T.etat.vars[a] ?? 0) - (T.etat.vars[b] ?? 0); } },
  hasard: { args: 'mot nombre', exec: (T, ctx, [v, n]) => { T.etat.vars[v] = Math.floor(T.rng() * Math.max(1, n)); } },
  espece_equipe: { args: 'mot mot', exec: (T, ctx, [v, k]) => { const i = /^VAR_/.test(k) ? T.etat.vars[k] ?? 0 : +k || 0; T.etat.vars[v] = T.etat.equipe[i]?.sp ?? 0; } },
  /** le POKéMON de départ (n° national) : 152, 155 ou 158 selon la variable STARTER */
  espece_depart: { args: 'mot', exec: (T, ctx, [v]) => { T.etat.vars[v] = [152, 155, 158][T.etat.vars.STARTER ?? 0]; } },
  argent_suffisant: { args: 'mot nombre', exec: (T, ctx, [v, n]) => { T.etat.vars[v] = T.etat.argent >= n ? 1 : 0; } },
  retirer_argent: { args: 'nombre', exec: (T, ctx, [n]) => { T.etat.argent = Math.max(0, T.etat.argent - n); } },
  quantite_objet: { args: 'mot mot', exec: (T, ctx, [n, v]) => { T.etat.vars[v] = T.etat.sac[n] ?? 0; } },
  sur_velo: { args: 'mot', exec: (T, ctx, [v]) => { T.etat.vars[v] = T.mode === 'velo' ? 1 : 0; } },
  /** jour de la semaine (0 = dimanche), comme la DS */
  jour_semaine: { args: 'mot', exec: (T, ctx, [v]) => { T.etat.vars[v] = new Date().getDay(); } },
  /** un POKéMON sauvage du jeu (statique : Ramoloss, Simularbre, Léviator rouge…) ; VAR_COMBAT = 1 si gagné */
  /**
   * un POKéMON à combattre (légendaires, Simularbre, Léviator rouge, pièges du QG Rocket) ; espèce et niveau peuvent
   * être des variables. Issue (GetStaticEncounterOutcome du jeu) : 1 battu, 2 perdu, 3 fui, 4 capturé
   */
  combat_sauvage_hg: {
    args: 'mot mot',
    exec: (T, ctx, [sp, niv]) => {
      const v = (a) => (/^VAR_/.test(a) ? T.etat.vars[a] ?? 0 : /^\d+$/.test(a) ? +a : a);
      return T.combat({ type: 'sauvage', espece: v(sp), niveau: v(niv), statique: true }, (gagne, issue) => {
        T.etat.vars.VAR_COMBAT = issue === 'caught' ? 4 : issue === 'flee' ? 3 : gagne ? 1 : 2;
      });
    },
  },
  /** un téléporteur que le script règle (ascenseurs, salles d'attente) : le prochain warp « dynamique » y mène */
  warp_dynamique: {
    args: 'mot nombre nombre dir?',
    exec: (T, ctx, [zone, x, y, d]) => { T.etat.warpDyn = { zone, x, y, dir: d ?? 1 }; },
  },
  /** le nom du rival : la page peut le demander (T.saisieNom → promesse) ; sinon le nom par défaut. V = 0 : nom choisi */
  nommer_rival: {
    args: 'mot',
    exec: (T, ctx, [v]) => {
      const fini = (nom) => { T.etat.joueur.rival = (nom || T.d.nomRival || 'SILVER').toUpperCase().slice(0, 7); T.etat.vars[v] = 0; ctx.nomFait = true; };
      ctx.nomFait = false;
      if (T.saisieNom) T.saisieNom('rival', T.etat.joueur.rival || T.d.nomRival || 'SILVER').then(fini, () => fini(null));
      else fini(null);
      return () => ctx.nomFait;
    },
  },
  /** K.O. de toute l'équipe (« WhiteOut ») : retour au dernier Centre */
  ko: { exec: (T) => { T.tomberKo(); return () => !T.transition; } },
  /** un téléporteur de la carte change de place (le n° k, aux coordonnées données) */
  deplacer_warp: { args: 'nombre nombre nombre', exec: (T, ctx, [k, x, y]) => { (T.etat.warpsDeplaces ||= {})[`${T.zone.id}#${k}`] = [x, y]; T.majWarps?.(); } },
  // jetons du Casino
  jetons: { args: 'mot', exec: (T, ctx, [v]) => { T.etat.vars[v] = T.etat.jetons ?? 0; } },
  retirer_jetons: { args: 'nombre', exec: (T, ctx, [n]) => { T.etat.jetons = Math.max(0, (T.etat.jetons ?? 0) - n); } },
  donner_jetons: { args: 'nombre', exec: (T, ctx, [n]) => { T.etat.jetons = (T.etat.jetons ?? 0) + n; } },
  /** RESULTAT = 1 si la capacité de terrain est utilisable (badge et CS, voir Terrain.capacite) */
  tester_capacite: { args: 'mot', exec: (T, ctx, [n]) => { T.etat.vars.RESULTAT = T.capacite(n) ? 1 : 0; } },
  /** franchir la cascade, le tourbillon ou la paroi devant le joueur */
  franchir: { exec: (T) => { T.franchir(); return () => !T.joueur.file.length && !T.joueur.m; } },
  nombre_equipe: { args: 'mot', exec: (T, ctx, [v]) => { T.etat.vars[v] = T.etat.equipe.length; } },
  /** VAR ← 1 si le drapeau est levé, 0 sinon (CheckBadge, CheckFlag du jeu) */
  tester_drapeau: { args: 'mot mot', exec: (T, ctx, [v, f]) => { T.etat.vars[v] = T.etat.drapeaux.has(f) ? 1 : 0; } },
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
