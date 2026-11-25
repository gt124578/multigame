// odyssee/moteur/donnees/jeu-hg.js — HeartGold / SoulSilver entier à partir des données publiées par la décompilation
// (pret/pokeheartgold) : le dehors de Johto et de Kanto d'un seul tenant (matrice 0), chaque intérieur avec sa petite
// matrice, et pour chaque carte ses événements et ses scripts, traduits pour le moteur (donnees/evenements-hg.js).
//
// Tout se lit au chargement de la page, rien n'est copié dans ce dépôt. Le dehors est construit d'un coup ; les
// événements et les intérieurs d'une carte se chargent quand on en approche (`chargerCarte`) : le moteur attend
// dans le noir qu'une carte soit prête avant d'y entrer.
//
// Ce qui est à nous, posé par-dessus (`AJOUTS`) : les chariots de l'arène d'Écorcia (le moteur les joue avec les
// tracés du jeu, donnees/ecorcia.js), la dresseuse de Sinnoh qui mène à l'Arène de Frimapic (Platine).

import { CHEMINS_HG, archivesHG, dehorsHG, interieurHG, lireEntetesHG } from './hgss.js';
import { zoneHG, lireDresseursHG, traduireScripts, objetDe, especeDe } from './evenements-hg.js';
import { SOLS } from './auteur.js';
import { RAILS_ECORCIA } from './gymmicks.js';
import { BAS } from '../engine/const.js';

/** nom d'un lieu : MAPSEC_NEW_BARK_TOWN → New Bark Town */
export const nomLieu = (lieu) => (lieu || '').replace(/^MAPSEC_/, '').split('_').filter(Boolean)
  .map((m) => (m === 'OF' || m === 'THE' ? m.toLowerCase() : m[0] + m.slice(1).toLowerCase())).join(' ');

/** départ d'une nouvelle partie : la chambre du joueur, comme dans le jeu */
export const DEPART_HG = { zone: 'NEW_BARK_PLAYER_HOUSE_2F', x: 4, y: 6, dir: BAS };

/** scripts du moteur qui complètent ceux du jeu */
const SCRIPTS_PLUS = `
script RocherHG
  message "C'est un rocher fissuré.\\nUn POKéMON pourrait le briser avec ÉCLATE-ROC."
  fin
`;

/** nos ajouts, carte par carte (fusionnés avec ce que le jeu décrit) */
const AJOUTS = {
  // l'Arène de Frimapic (Platine, donnees/platine.js) : une dresseuse de Sinnoh, au Centre d'Acajou, y emmène
  MAHOGANY_POKECENTER_1F: (z) => ({
    ...z,
    objets: [...z.objets, { id: 'sinnoh', x: 10, y: 14, sprite: 'topdresseur_neige_f', dir: BAS, script: 'VersFrimapic' }],
    scripts: z.scripts + `
script VersFrimapic
  regarder_joueur
  message "I came all the way from Snowpoint City,\\nin the Sinnoh region."
  message "Its Gym is a bowl of ice full of\\nsnowballs! Want to see it?"
  oui_non
  si resultat = 0 aller VersFrimapic_Non
  fondu_noir
  teleporter ARENE_FRIMAPIC 0
  liberer
  fin
VersFrimapic_Non:
  message "Some other time, then!"
  liberer
  fin
`,
  }),
  AZALEA_GYM: (z) => ({
    ...z, rails: RAILS_ECORCIA,
    objets: [...z.objets, ...RAILS_ECORCIA.depart.map((s, i) => ({ id: 'chariot_' + i, x: RAILS_ECORCIA.stations[s][0], y: RAILS_ECORCIA.stations[s][1], sprite: 'mimigal', dir: BAS, traversable: true }))],
  }),
};

/**
 * Tout ce qu'il faut au démarrage. `lire(chemin)` → Uint8Array. Rend { donnees, chargerCarte(carte) → paquet,
 * drapeauxDepart: [noms], varsDepart: {}, personnages: { NOM: numéro du modèle } }.
 */
export async function jeuHG(lire) {
  const txt = async (c) => new TextDecoder().decode(await lire(c));
  const [A, json, consts, mm, init] = await Promise.all([
    archivesHG(lire), txt(CHEMINS_HG.dresseurs), txt(CHEMINS_HG.constantesDresseurs), txt(CHEMINS_HG.personnages),
    txt(CHEMINS_HG.nouvellePartie).catch(() => ''),
  ]);
  const dresseurs = lireDresseursHG(json, consts);
  // les noms anglais du jeu : objets (rangés par numéro d'objet), espèces et attaques (par numéro national)
  const [nObj, nEsp, nAtt, cObj] = await Promise.all([CHEMINS_HG.nomsObjets, CHEMINS_HG.nomsEspeces, CHEMINS_HG.nomsAttaques, CHEMINS_HG.constantesObjets]
    .map((c) => txt(c).catch(() => null)));
  const liste = (j) => (j ? JSON.parse(j).messages.map((m) => (m.en_US ?? '').replace(/’/g, "'")) : []);
  const nomsObj = liste(nObj), objets = {};
  for (const m of (cObj || '').matchAll(/#define (ITEM_\w+)\s+(\d+)/g)) {
    const nom = nomsObj[+m[2]]; if (nom && nom !== 'None' && nom !== '???') objets[objetDe(m[1])] = { nom, court: nom };
  }
  const noms = { especes: liste(nEsp), attaques: liste(nAtt), objets };
  // POKéMON sauvages : une table par carte (ENCDATA_R29 → « R29 »), version HeartGold, selon l'heure du jour
  const enc = await txt(CHEMINS_HG.rencontres).then((t) => JSON.parse(t).encounters).catch(() => []);
  const tablesEnc = Object.fromEntries(enc.map((e) => [e.map, e]));
  const personnages = {};
  for (const m of mm.matchAll(/#define MMODEL_(\w+)\s+(\d+)/g)) if (!(m[1] in personnages)) personnages[m[1]] = +m[2];
  const mmodels = new Set(Object.keys(personnages));
  // nouvelle partie : les drapeaux et variables que le jeu pose avant le premier pas (scr_seq_0149)
  const drapeauxDepart = [...init.matchAll(/SetFlag (FLAG_\w+)/g)].map((m) => m[1]);
  const varsDepart = Object.fromEntries([...init.matchAll(/SetVar (VAR_\w+), (\d+)/g)].map((m) => [m[1], +m[2]]));

  // toutes les cartes existent dès le départ (nom, musique) ; leurs événements arrivent en route
  const zoneDe = (c) => (c && c !== 'EVERYWHERE' && A.entetes[c] ? c : null);
  const zones = {};
  for (const [c, e] of Object.entries(A.entetes)) {
    if (c === 'EVERYWHERE' || c === 'NOTHING') continue;
    const interieur = e.type !== 'MAP_TYPE_CITY_TOWN' && e.type !== 'MAP_TYPE_ROUTE';
    zones[c] = { nom: nomLieu(e.lieu) || c, musique: 'route', camera: interieur ? 'interieur' : 'dehors', interieur, aCharger: true,
      ville: e.type === 'MAP_TYPE_CITY_TOWN', route: e.type === 'MAP_TYPE_ROUTE' };
  }
  const D = dehorsHG(A, zoneDe);
  const donnees = {
    sols: SOLS, blocs: D.blocs, mondes: { johto: D.monde }, zones, dresseursHG: dresseurs, version: 4,
    langue: 'en', scriptsTraversent: true, nomJoueur: 'ETHAN', nomRival: 'SILVER', objets, nomsEspeces: noms.especes, noms,
    scriptsCommuns: SCRIPTS_PLUS,
  };

  /** une carte : événements, scripts (et scripts de niveau), et pour un intérieur ses blocs et son monde */
  async function chargerCarte(c) {
    const e = A.entetes[c];
    if (!e) return null;
    const lireTxt = (ch) => txt(ch).catch(() => null);
    const [ev, msg, scr, niv, mat] = await Promise.all([
      lireTxt(CHEMINS_HG.evenements(e.evenements)), lireTxt(CHEMINS_HG.messages(e.messages)),
      lireTxt(CHEMINS_HG.scripts(e.scripts)), lireTxt(CHEMINS_HG.scripts(e.niveaux)),
      e.matrice && !/EVERYWHERE/.test(e.matrice) ? lire(CHEMINS_HG.matrice(e.matrice)).catch(() => null) : null,
    ]);
    let z = zoneHG(c, e, ev ? JSON.parse(ev) : null, msg ? JSON.parse(msg) : null, scr,
      { zoneDe, dresseurs, mmodels, nomLieu });
    z.niveau = niveaux(niv);
    const te = tablesEnc[String(e.rencontres || '').replace(/^ENCDATA_/, '')];
    if (te) z.rencontres = rencontresHG(te, !(zones[c]?.ville || zones[c]?.route));
    z.ville = zones[c]?.ville; z.route = zones[c]?.route;
    if (AJOUTS[c]) z = AJOUTS[c](z);
    const p = { zones: { [c]: z }, blocs: {}, mondes: {} };
    if (mat) {
      const I = interieurHG(A, c, c, mat);
      if (I) { Object.assign(p.blocs, I.blocs); p.mondes['m_' + c] = I.monde; }
    }
    return p;
  }
  return { donnees, chargerCarte, drapeauxDepart, varsDepart, personnages, archives: A };
}

/** scripts de niveau du jeu (scr_seq_*_hdr.s) → `niveau` du moteur */
export function niveaux(src) {
  if (!src) return undefined;
  const n = {}, entree = (s) => { const m = s.match(/_EV_scr_seq_(\w+?) \+ 1/); return m ? 'HG_' + m[1] : null; };
  for (const m of src.matchAll(/InitScriptEntry_OnTransition (.+)/g)) { const e = entree(m[1]); if (e) n.transition = e; }
  for (const m of src.matchAll(/InitScriptEntry_OnLoad (.+)/g)) { const e = entree(m[1]); if (e) n.chargement = e; }
  const image = [];
  for (const m of src.matchAll(/InitScriptGoToIfEqual (\w+), (\d+), (.+)/g)) { const e = entree(m[3]); if (e) image.push({ var: m[1], val: +m[2], script: e }); }
  if (image.length) n.image = image;
  return Object.keys(n).length ? n : undefined;
}

/** chances de chaque emplacement, comme dans le jeu : 12 pour les herbes, 5 pour l'eau */
const POIDS_HERBES = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1], POIDS_EAU = [60, 30, 5, 4, 1];
/** le moment de la journée du jeu : matin 4 h - 10 h, jour 10 h - 20 h, nuit sinon */
export const momentHG = (h = new Date().getHours()) => (h >= 4 && h < 10 ? 'morn' : h >= 10 && h < 20 ? 'day' : 'nite');
const vHG = (v) => (v && typeof v === 'object' && 'HEARTGOLD' in v ? v.HEARTGOLD : v);
/** une table de gs_enc_data.json → les rencontres du moteur ({ herbe | sol, eau } : { taux, especes }) */
export function rencontresHG(e, grotte, moment = momentHG()) {
  const tab = (t, poids) => {
    if (!t?.rate || !t.mons?.length) return null;
    const especes = t.mons.map((m, i) => {
      let sp = vHG(m.species); if (sp && typeof sp === 'object') sp = vHG(sp[moment] ?? sp.day);
      const lv = vHG(m.level), [a, b] = typeof lv === 'object' ? [vHG(lv.min), vHG(lv.max)] : [lv, lv];
      return sp && sp !== 'SPECIES_NONE' ? { espece: especeDe(sp), niveaux: [a, b], poids: poids[i] ?? 1 } : null;
    }).filter(Boolean);
    return especes.length ? { taux: t.rate, especes } : null;
  };
  const r = {}, herbe = tab(e.land, POIDS_HERBES), eau = tab(e.surf, POIDS_EAU);
  if (herbe) r[grotte ? 'sol' : 'herbe'] = herbe;
  if (eau) r.eau = eau;
  return Object.keys(r).length ? r : undefined;
}
