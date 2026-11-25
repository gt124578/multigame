// odyssee/moteur/donnees/evenements-hg.js — les événements d'une carte de HeartGold / SoulSilver, tels que le jeu les
// décrit dans le dépôt public de la décompilation (pret/pokeheartgold, lus au chargement, rien n'est copié ici) :
//   - zone_event/*.json : portes, personnages (sprite, regard, mouvement, script, dresseur et sa portée), panneaux,
//     déclencheurs au sol ;
//   - scr_seq/*.s : les scripts du jeu, traduits ici dans le langage du moteur (conditions sur drapeaux et variables,
//     messages, mouvements, objets donnés, combats, personnages cachés ou montrés) ; une commande que le moteur ne
//     connaît pas est sautée ;
//   - msgdata/*.json : les textes (en anglais, la langue des données publiées) ;
//   - trainers.json : les équipes et les répliques des dresseurs.
// Rien ici ne touche au DOM.

import { HAUT, BAS, GAUCHE, DROITE } from '../engine/const.js';

/** texte d'un message du jeu → pages (une boîte par \r ou \f) ; {STRVAR_1 type, k, …} → {Tk}, le tampon k (Buffer…) */
export function pagesMessage(lignes) {
  const t = (Array.isArray(lignes) ? lignes.join('') : String(lignes || ''))
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\f/g, '\f')
    .replace(/\{STRVAR_\d+ \d+, (\d+)(, \d+)*\}/g, '\u0001$1\u0001')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\u0001(\d+)\u0001/g, '{T$1}')
    .replace(/’/g, "'").replace(/“|”/g, '"').replace(/…/g, '...');
  return t.split(/[\r\f]/).map((p) => p.replace(/\n+$/, '').trim()).filter(Boolean);
}
/** une ligne `message "…"` par page, guillemets et retours échappés pour le langage du moteur */
const dslMessages = (pages, ind = '  ') => pages.map((p) => `${ind}message "${p.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`).join('\n');

/** item_name : ITEM_GREAT_BALL → great-ball (identifiants d'Odyssée, ceux de PokeAPI) */
export const objetDe = (c) => c.replace(/^ITEM_/, '').toLowerCase().replace(/_/g, '-');
/** SPECIES_NIDORAN_F → nidoran-f (le pont vers Odyssée retrouve l'espèce par ce nom) */
export const especeDe = (c) => c.replace(/^SPECIES_/, '').toLowerCase().replace(/_/g, '-');

/** équipes des dresseurs : trainers.json + constantes → { TRAINER_X: { nom, classe, equipe, intro, perdu, apres } } */
export function lireDresseursHG(json, constantes) {
  const L = Object.values(JSON.parse(json))[0], num = {};
  for (const m of constantes.matchAll(/#define (TRAINER_\w+)\s+(\d+)/g)) num[m[1]] = +m[2];
  const t = {};
  for (const [k, i] of Object.entries(num)) {
    const d = L[i];
    if (!d) continue;
    const msg = (ty) => pagesMessage(d.messages?.find((m) => m.type === ty)?.message || '');
    const classe = (d.class || '').replace(/^TRAINERCLASS_/, '').split('_').map((m) => m[0] + m.slice(1).toLowerCase()).join(' ');
    t[k] = {
      nom: `${classe} ${(d.name || '').replace(/\{[^}]*\}/g, '')}`.trim(), classe,
      equipe: (d.party || []).map((p) => ({ espece: especeDe(p.species), niveau: p.level })),
      intro: msg('TRMSG_INTRO'), perdu: msg('TRMSG_LOSE'), apres: msg('TRMSG_AFTER'),
    };
  }
  return t;
}

// types de mouvement du jeu → ceux du moteur ; MV 14 à 17 : regard fixe ; 2 : regarde autour ; 3 à 5 : erre
const MOUVEMENT = (mv) => (mv === 3 ? 'errance' : mv === 4 ? 'errance_hb' : mv === 5 ? 'errance_gd' : mv === 2 || mv === 7 || mv === 9 || mv === 13 ? 'regard_alea' : 'fixe');
const DIR = [HAUT, BAS, GAUCHE, DROITE];
const PAS = { North: 'haut', South: 'bas', West: 'gauche', East: 'droite' };

/** traduction d'un fichier de scripts du jeu (scr_seq_*.s) ; rend { source, connus(label) } */
export function traduireScripts(texte, { messages, objets, dresseurs, prefixe = 'HG_', zoneDe = () => null }) {
  const ctxZone = zoneDe;
  // préfixe des messages de la carte (msg_0545_T20R0201) : les menus désignent leurs lignes par leur numéro
  const prefixeMsg = (Object.keys(messages)[0] || '').replace(/_\d+$/, '');
  const lignes = texte.split('\n');
  const out = [], mvts = new Map();
  const ref = (id) => (id === 'obj_player' ? 'joueur' : objets.has(id) ? id : null);
  let dernier = null, objet = null, qte = 1, dansMvt = null, menu = null, switchVar = null;
  const STARTERS = ['Chikorita', 'Cyndaquil', 'Totodile'];
  let nStarter = 0;
  const lab = (l) => prefixe + l.replace(/^_/, 'L');
  const msg = (id) => { const m = messages[id]; return m ? dslMessages(pagesMessage(m)) : null; };
  const op = { GoToIfEq: '=', GoToIfNe: '!=', GoToIfLt: '<', GoToIfGt: '>', GoToIfLe: '<=', GoToIfGe: '>=',
    CallIfEq: '=', CallIfNe: '!=', CallIfLt: '<', CallIfGt: '>', CallIfLe: '<=', CallIfGe: '>=' };
  for (const brut of lignes) {
    const l = brut.trim();
    if (!l || l.startsWith('#') || l.startsWith('.') || l.startsWith('ScrDef')) continue;
    // étiquettes : entrée de script (scr_seq_X_NNN) ou étiquette locale (_04AF)
    const e = l.match(/^(\w+):$/);
    if (e) {
      if (dansMvt) { dansMvt = null; }
      const n = e[1];
      if (/^scr_seq_/.test(n)) out.push(`script ${prefixe}${n.replace(/^scr_seq_/, '')}`);
      else out.push(`${lab(n)}:`);
      continue;
    }
    const [c, ...r] = l.split(/\s+/), a = r.join(' ').split(/,\s*/).map((s) => s.trim());
    // tables de mouvements : `_024C:` suivie de pas puis EndMovement
    if (/^(Walk|Face|Delay|Emote|Jump|EndMovement|LockDir|UnlockDir|SetInvisible|SetVisible|Run)/.test(c) && out.length && /:$/.test(out[out.length - 1]) && !dansMvt) {
      const nom = out.pop().slice(0, -1);
      dansMvt = nom; mvts.set(nom, []);
    }
    if (dansMvt) {
      if (c === 'EndMovement') { dansMvt = null; continue; }
      const m = mvts.get(dansMvt), n = +(a[0] || 1) || 1;
      let mm;
      if ((mm = c.match(/^Walk(Normal|Fast|Faster|Slow|SlightlyFast|SlightlyFaster)?(North|South|West|East)$/))) m.push(`${/^Fast|^Faster/.test(mm[1] || '') ? 'vite_' : mm[1] === 'Slow' ? 'lent_' : ''}${PAS[mm[2]]} ${n}`);
      else if ((mm = c.match(/^Run(North|South|West|East)$/))) m.push(`vite_${PAS[mm[1]]} ${n}`);
      else if ((mm = c.match(/^WalkOnSpot\w*(North|South|West|East)$/))) m.push(`sur_place_${PAS[mm[1]]} ${n}`);
      else if ((mm = c.match(/^Face(North|South|West|East)$/))) m.push(`regard_${PAS[mm[1]]}`);
      else if ((mm = c.match(/^Delay(\d+)$/))) m.push(`attente ${+mm[1] * n}`);
      else if (c === 'EmoteExclamationMark') m.push('exclamation');
      else if ((mm = c.match(/^JumpFar(North|South|West|East)$/))) m.push(`saut_${PAS[mm[1]]}`);
      else if (c === 'SetInvisible') m.push('cacher');
      else if (c === 'SetVisible') m.push('montrer');
      continue;
    }
    switch (c) {
      case 'End': out.push('  fin'); break;
      case 'Return': out.push('  retour'); break;
      case 'GoTo': out.push(`  aller ${lab(a[0])}`); break;
      case 'Call': out.push(`  appeler ${lab(a[0])}`); break;
      case 'LockAll': case 'Lock': out.push('  verrouiller'); break;
      case 'ReleaseAll': case 'Release': out.push('  liberer'); break;
      case 'FacePlayer': out.push('  regarder_joueur'); break;
      case 'NPCMsg': case 'SimpleNPCMsg': case 'Msg': case 'NonNPCMsg': case 'SimpleMsg': {
        const m = msg(a[0]); if (m) out.push(m); break;
      }
      case 'GenderMsgBox': { const m = msg(a[0]); if (m) out.push(m); break; }
      case 'SetFlag': out.push(`  drapeau ${a[0]}`); break;
      case 'ClearFlag': out.push(`  effacer ${a[0]}`); break;
      case 'SetVar': {
        if (a[0] === 'VAR_SPECIAL_x8004' && /^ITEM_/.test(a[1])) { objet = a[1]; break; }
        if (a[0] === 'VAR_SPECIAL_x8005') { qte = +a[1] || 1; break; }
        if (/^\d+$/.test(a[1])) out.push(`  var ${a[0]} ${a[1]}`);
        break;
      }
      case 'AddVar': if (/^\d+$/.test(a[1])) out.push(`  ajouter ${a[0]} ${a[1]}`); break;
      case 'Compare': dernier = a; break;
      case 'GoToIfSet': out.push(`  si drapeau ${a[0]} aller ${lab(a[1])}`); break;
      case 'GoToIfUnset': out.push(`  si non drapeau ${a[0]} aller ${lab(a[1])}`); break;
      case 'CheckBadge': out.push(`  tester_drapeau ${a[1]} ${a[0]}`); break;
      case 'CheckFlag': break;
      case 'GoToIfNoItemSpace': objet = a[0]; qte = +a[1] || 1; break;
      case 'CallStd':
        if (/^std_(give|obtain)_item_verbose$/.test(a[0]) && objet) { out.push(`  donner_objet ${objetDe(objet)} ${qte}`); objet = null; qte = 1; }
        else if (a[0] === 'std_nurse_joy') out.push('  appeler SoinCentre');
        else if (a[0] === 'std_pokemart' || a[0] === 'std_mart_intro') out.push('  boutique poke-ball potion antidote paralyze-heal awakening repel');
        break;
      case 'GiveItemNoCheck': case 'GiveItem':
        if (/^ITEM_/.test(a[0])) out.push(`  donner_objet ${objetDe(a[0])} ${+a[1] || 1}`);
        else if (objet) { out.push(`  donner_objet ${objetDe(objet)} ${qte}`); objet = null; qte = 1; }
        break;
      case 'GiveMon': out.push(`  recevoir_pokemon ${/^SPECIES_/.test(a[0]) ? especeDe(a[0]) : a[0]} ${+a[1] || 5}`); break;
      case 'GivePokedex': out.push('  drapeau POKEDEX'); break;
      case 'GiveRunningShoes': out.push('  drapeau CHAUSSURES'); break;
      case 'ChooseStarter': {
        const k = `${prefixe}ST${nStarter++}`;
        out.push(`  choix ${STARTERS.map((n) => `"${n}"`).join(' ')}`);
        STARTERS.forEach((n, i) => out.push(`  si resultat = ${i} aller ${k}_${i}`));
        STARTERS.forEach((n, i) => out.push(`${k}_${i}:\n  recevoir_pokemon ${n.toLowerCase()} 5\n  var STARTER ${i}\n  aller ${k}_fin`));
        out.push(`${k}_fin:`);
        break;
      }
      case 'HealParty': out.push('  soigner'); break;
      case 'SetTrainerFlag': out.push(`  drapeau DRESSEUR_${a[0]}`); break;
      case 'HasItem': out.push(`  avoir_objet ${objetDe(a[0])} ${+a[1] || 1} ${a[2]}`); break;
      case 'TakeItem': case 'TakeItemNoCheck': out.push(`  retirer_objet ${objetDe(a[0])} ${+a[1] || 1}`); break;
      case 'GetPartyCount': out.push(`  nombre_equipe ${a[0]}`); break;
      // les tampons de texte ({Tk} dans les messages)
      case 'BufferPlayersName': out.push(`  tampon ${a[0]} joueur ""`); break;
      case 'BufferRivalsName': out.push(`  tampon ${a[0]} rival ""`); break;
      case 'BufferMonSpeciesName': case 'BufferPartyMonNick': out.push(`  tampon ${a[0]} equipe "${a[1] ?? 0}"`); break;
      case 'BufferSpeciesName': case 'BufferSpeciesNameIndef': out.push(`  tampon ${a[0]} espece "${/^SPECIES_/.test(a[1]) ? especeDe(a[1]) : a[1]}"`); break;
      case 'BufferItemName': case 'BufferItemNamePlural': case 'BufferItemNameIndef':
        out.push(`  tampon ${a[0]} objet "${/^ITEM_/.test(a[1]) ? objetDe(a[1]) : a[1] === 'VAR_SPECIAL_x8004' && objet ? objetDe(objet) : a[1]}"`); break;
      case 'BufferInt': case 'BufferIntEx': out.push(`  tampon ${a[0]} nombre "${a[1]}"`); break;
      case 'BufferPocketName': out.push(`  tampon ${a[0]} poche "${a[1]}"`); break;
      case 'GetPlayerCoords': out.push(`  position_joueur ${a[0]} ${a[1]}`); break;
      case 'GetPersonCoords': { const o = ref(a[0]); if (o) out.push(`  position_objet ${o} ${a[1]} ${a[2]}`); break; }
      case 'GetPlayerFacing': out.push(`  direction_joueur ${a[0]}`); break;
      case 'GetGameVersion': out.push(`  var ${a[0]} 7`); break;
      case 'GetPlayerGender': out.push(`  var ${a[0]} 0`); break;
      case 'CheckBattleWon': out.push(`  var ${a[0]} 1`); break;
      case 'GetMenuChoice': out.push(`  oui_non_var ${a[0]}`); break;
      case 'MenuInit': case 'MenuInitStdGmm': menu = { v: a[a.length - 1], items: [] }; break;
      case 'MenuItemAdd': if (menu) { const t = messages[`${prefixeMsg}_${String(a[0]).padStart(5, '0')}`]; menu.items.push([pagesMessage(t || String(a[0]))[0] || '?', a[2]]); } break;
      case 'MenuExec': if (menu?.items.length) out.push(`  choix_var ${menu.v} ${menu.items.map(([, v]) => v).join(',')} ${menu.items.map(([t]) => `"${t.replace(/["\\\n]/g, ' ').trim()}"`).join(' ')}`); menu = null; break;
      case 'Switch': switchVar = a[0]; break;
      case 'Case': if (switchVar) out.push(`  si var ${switchVar} = ${a[0]} aller ${lab(a[1])}`); break;
      case 'TrainerTipsEx': { const m = msg(a[1]); if (m) out.push(m); break; }
      case 'DirectionSignpostEx': { const m = msg(a[2]); if (m) out.push(m); break; }
      case 'Warp': { const z = ctxZone(String(a[0]).replace(/^MAP_/, '')); if (z && /^\d+$/.test(a[2]) && /^\d+$/.test(a[3])) out.push(`  teleporter_xy ${z} ${a[2]} ${a[3]} ${({ DIR_NORTH: 'haut', DIR_SOUTH: 'bas', DIR_WEST: 'gauche', DIR_EAST: 'droite' })[a[4]] || 'bas'}`); break; }
      case 'MovePersonFacing': { const o = ref(a[0]); if (o && o !== 'joueur' && /^\d+$/.test(a[1]) && /^\d+$/.test(a[3])) out.push(`  placer ${o} ${a[1]} ${a[3]} ${({ DIR_NORTH: 'haut', DIR_SOUTH: 'bas', DIR_WEST: 'gauche', DIR_EAST: 'droite' })[a[4]] || 'bas'}`); break; }
      case 'Wait': if (/^\d+$/.test(a[0])) out.push(`  attendre ${a[0]}`); break;
      case 'PlayCry': out.push('  son exclamation'); break;
      case 'AzaleaGymInit': out.push('  rails_depart'); break;
      case 'AzaleaGymSpinarak': out.push(`  chariot ${a[0]}`); break;
      case 'AzaleaGymSwitch': out.push(`  aiguillage ${a[0]}`); break;
      case 'GiveBadge': out.push(`  drapeau ${a[0]}`); out.push('  son fanfare'); break;
      case 'PlayFanfare': break;
      case 'ApplyMovement': { const o = ref(a[0]); if (o) out.push(`  mouvement ${o} ${lab(a[1])}`); break; }
      case 'WaitMovement': out.push('  attendre_mouvements'); break;
      case 'HidePerson': { const o = ref(a[0]); if (o && o !== 'joueur') out.push(`  cacher ${o}`); break; }
      case 'ShowPerson': { const o = ref(a[0]); if (o && o !== 'joueur') out.push(`  montrer ${o}`); break; }
      case 'TrainerBattle': if (dresseurs[a[0]]) out.push(`  combat_hg ${a[0]}`); break;
      case 'FadeScreen': out.push(a[2] === '0' ? '  fondu_noir' : '  fondu_retour'); break;
      default:
        if (op[c] && dernier) {
          const [v, n] = dernier, verbe = c.startsWith('Call') ? 'appeler' : 'aller';
          if (/^\d+$/.test(n)) out.push(`  si var ${v} ${op[c]} ${n} ${verbe} ${lab(a[0])}`);
        }
    }
  }
  // un script qui finit sans « fin » s'arrête de lui-même ; les mouvements à la fin
  let src = out.join('\n');
  for (const [n, pas] of mvts) src += `\nmouvement ${n}\n${pas.map((p) => '  ' + p).join('\n') || '  attente 1'}\nfin`;
  // les sauts vers des étiquettes absentes (blocs non traduits) mènent à la fin
  const etiquettes = new Set([...src.matchAll(/^(\w+):$/gm)].map((m) => m[1]));
  const absentes = new Set([...src.matchAll(/(?:aller|appeler) (\w+)/g)].map((m) => m[1]).filter((n) => !etiquettes.has(n)));
  if (absentes.size) src += '\n' + [...absentes].map((n) => `${n}:\n  liberer\n  fin`).join('\n');
  return src;
}

/** carte du jeu → zone du moteur. `ctx` : { zoneDe(carte), dresseurs, mmodels (noms connus) } */
export function zoneHG(carte, entete, ev, msgs, scripts, ctx) {
  const messages = {};
  for (const m of msgs?.messages || []) messages[m.id] = m.en_US;
  const objets = [], panneaux = [], warps = [], declencheurs = [], extra = [];
  const ids = new Set((ev?.objects || []).map((o) => o.id));
  const entree = (s) => { const m = String(s || '').match(/_EV_scr_seq_(\w+?) \+ 1/); return m ? 'HG_' + m[1] : null; };
  for (const w of ev?.warps || []) {
    const vers = ctx.zoneDe(String(w.header).replace(/^MAP_/, ''));
    // un téléporteur garde sa place dans la liste : les portes d'en face le désignent par son numéro
    warps.push({ x: w.x, y: w.z, vers, n: w.anchor });   // vers null : la porte ne mène nulle part (carte absente)
  }
  for (const o of ev?.objects || []) {
    const sp = String(o.spriteId).replace(/^SPRITE_/, ''), base = { id: o.id, x: o.x, y: o.z, dir: DIR[o.facingDirection] ?? BAS };
    const s = String(o.scriptId);
    if (sp === 'MONSTARBALL') {
      const m = s.match(/^std_itemball_[a-z0-9]+_(\w+)$/);
      if (m) objets.push({ ...base, type: 'objet', sprite: 'objet', objet: m[1].replace(/_/g, '-'), drapeau: o.eventFlag });
      continue;
    }
    if (sp === 'TREE') { objets.push({ ...base, type: 'arbre_coupe', sprite: 'arbre_coupe' }); continue; }
    if (sp === 'BREAKROCK' || sp === 'ROCK') { objets.push({ ...base, type: 'rocher', sprite: 'rocher', script: 'RocherHG' }); continue; }
    // personnages cachés tant que le jeu ne les montre pas (drapeau FLAG_HIDE_…) : on suit le drapeau
    const cache = o.eventFlag && o.eventFlag !== 'FLAG_NOTHING' ? { drapeau: o.eventFlag } : {};
    if (!ctx.mmodels.has(sp) || sp.startsWith('VAR_')) continue;
    const p = { ...base, ...cache, sprite: 'mm:' + sp, mouvement: MOUVEMENT(o.movement), rayon: Math.max(o.xRange || 0, o.yRange || 0) || 1 };
    const tr = s.match(/^std_trainer(?:_2)?\((TRAINER_\w+)\)$/);
    if (tr && ctx.dresseurs[tr[1]]) {
      const d = ctx.dresseurs[tr[1]], n = 'HGD_' + o.id;
      p.nom = d.nom;
      p.dresseur = { portee: o.param0 || 0, script: n + '_Defi', apres: n + '_Apres', equipe: d.equipe, drapeau: 'DRESSEUR_' + tr[1] };
      extra.push(`script ${n}_Defi\n${dslMessages(d.intro)}\n  combat_dresseur\n${dslMessages(d.perdu)}\n  liberer\n  fin\nscript ${n}_Apres\n  regarder_joueur\n${dslMessages(d.apres.length ? d.apres : d.perdu)}\n  liberer\n  fin`);
    } else if (s === 'std_nurse_joy' || sp === 'PCWOMAN1') p.script = 'Infirmiere';
    else { const e = entree(s); if (e) p.script = e; }
    objets.push(p);
  }
  for (const b of ev?.bgs || []) {
    if (b.type === 2) continue;   // objets cachés
    const e = entree(b.scriptId);
    if (e) panneaux.push({ x: b.x, y: b.z, script: e, ...(b.type === 1 ? { depuis: HAUT } : {}) });
  }
  for (const c of ev?.coords || []) {
    const e = entree(c.scriptId);
    if (e) declencheurs.push({ x: c.x, y: c.z, l: c.w, h: c.h, var: c.var, val: c.val, script: e });
  }
  const poses = new Set(objets.map((o) => o.id));
  let source = scripts ? traduireScripts(scripts, { messages, objets: poses, dresseurs: ctx.dresseurs, zoneDe: ctx.zoneDe }) : '';
  source += '\n' + extra.join('\n');
  // les scripts qu'on n'a pas su lire : un objet ou un panneau dont l'entrée manque reste muet
  const definis = new Set([...source.matchAll(/^script (\w+)/gm)].map((m) => m[1]));
  for (const p of [...objets, ...panneaux]) if (p.script && p.script.startsWith('HG_') && !definis.has(p.script)) delete p.script;
  const decl = declencheurs.filter((d) => definis.has(d.script));
  const interieur = entete.type !== 'MAP_TYPE_CITY_TOWN' && entete.type !== 'MAP_TYPE_ROUTE';
  return {
    nom: ctx.nomLieu(entete.lieu) || carte, musique: musiqueHG(entete), camera: interieur ? 'interieur' : 'dehors',
    interieur, velo: entete.velo && !interieur, warps, objets, panneaux, declencheurs: decl, scripts: source,
  };
}

/** thème de musique d'Odyssée le plus proche de celui du jeu */
export function musiqueHG(e) {
  const m = e.musique || '';
  if (/POKESEN/.test(m)) return 'centre';
  if (/FS|SHOP|MART/.test(m)) return 'boutique';
  if (/GYM/.test(m)) return 'arene';
  if (/^SEQ_GS_D_/.test(m) || e.type === 'MAP_TYPE_CAVE') return 'grotte';
  if (/RABO/.test(m)) return 'labo';
  if (/^SEQ_GS_R_/.test(m)) return 'route';
  if (/^SEQ_GS_T_|^SEQ_GS_C_/.test(m)) return 'mauville';
  return e.type === 'MAP_TYPE_INTERIOR' ? 'maison' : 'route';
}
