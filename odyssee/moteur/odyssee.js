// odyssee/moteur/odyssee.js — pont entre le moteur de terrain et Odyssée : les POKéMON (createMon), les combats
// (Battle + BattleView), l'équipe et le sac (écrans d'Odyssée), la musique et les bruitages (Sound).
// Le terrain ne connaît rien de tout ça : il émet « combat » et attend terminerCombat ; il crée et soigne ses
// POKéMON par T.pokemon. Ce fichier est la seule colle.
import { Battle } from '../js/core/battle.js';
import { createMon, healFull, monName, levelEvolution, evolve } from '../js/core/mon.js';
import { SPECIES } from '../js/data/species.js';
import { MOVES } from '../js/data/moves.js';
import { BattleView } from '../js/ui/battleView.js';
import { UI } from '../js/ui/ui.js';
import { Input } from '../js/input.js';
import { Sound } from '../js/audio.js';
import { partyScreen, bagScreen } from '../js/ui/screens.js';
import { ITEMS, applyItem, canUseOn, itemName } from '../js/core/items.js';

const PAR_NOM = {};
for (const [id, s] of Object.entries(SPECIES)) if (s?.n && !PAR_NOM[s.n]) PAR_NOM[s.n] = +id;
/** numéro d'une espèce d'après son nom français (celui des données du terrain) */
const PAR_SLUG = {};
for (const [id, s] of Object.entries(SPECIES)) if (s?.k && !PAR_SLUG[s.k]) PAR_SLUG[s.k] = +id;
export function espece(nom) {
  // nom français (données à nous) ou identifiant du jeu (« nidoran-f », équipes de trainers.json)
  // un numéro national (variables des scripts du jeu) est déjà l'identifiant d'Odyssée
  if (/^\d+$/.test(String(nom)) && SPECIES[+nom]) return +nom;
  const n = String(nom), bas = n.toLowerCase();
  const id = PAR_NOM[nom] || PAR_SLUG[n] || PAR_SLUG[bas] || PAR_NOM[n.toUpperCase()];
  if (!id) throw new Error(`espèce inconnue : ${nom}`);
  return id;
}

/** musique de chaque zone (noms du terrain) → thème d'Odyssée */
const MUSIQUES = { bourg: 'town', griotte: 'town', mauville: 'city', route: 'route', route29: 'route', route30: 'route', maison: 'house',
  labo: 'lab', centre: 'center', boutique: 'mart', arene: 'gym', grotte: 'cave', tour: 'tower', velo: 'island', glace: 'snow' };
/** bruitages du terrain → bruitages d'Odyssée */
const SONS = { heurt: 'bump', texte: 'blip', choix: 'select', porte: 'door', escalier: 'exit', saut: 'ledge', objet: 'item', fanfare: 'badge',
  soin: 'heal', coupe: 'cut', exclamation: 'encounter', boule: 'cut', aiguillage: 'select', chariot: 'exit' };

export class PontOdyssee {
  constructor(root, T) {
    this.T = T;
    this.input = new Input();
    this.sound = new Sound();
    this.ui = new UI(root, this.input, this.sound);
    this.ui.fadeEl.style.opacity = 0;   // Odyssée part d'un écran noir qu'il éclaircit au début de la partie
    this.bv = new BattleView(this);
    this.dex = { seen: [], caught: [], seenCount: {} };
    this.occupe = false;
    // le jeu HGSS en anglais : espèces, attaques et objets prennent les noms anglais du jeu dans les combats et les menus
    const N = T.d.noms;
    if (T.d.langue === 'en' && N) {
      N.especes?.forEach((n, i) => { if (i && n && SPECIES[i]) SPECIES[i].n = n; });
      N.attaques?.forEach((n, i) => { if (i && n && MOVES[i]) MOVES[i].n = n; });
      for (const [k, o] of Object.entries(N.objets || {})) if (ITEMS[k]) ITEMS[k].name = o.nom;
    }
    // le premier appui débloque le son (règle des navigateurs)
    const debloquer = () => this.sound.init();
    addEventListener('keydown', debloquer); addEventListener('pointerdown', debloquer);
  }
  /** l'état vu par les écrans d'Odyssée : les mêmes objets que ceux du terrain (rien n'est recopié) */
  get state() {
    const e = this.T.etat;
    return { name: e.joueur.nom, party: e.equipe, box: e.boite, bag: e.sac, dex: this.dex, money: e.argent, badges: [], time: 0 };
  }
  /** fonctions de POKéMON données au terrain */
  get pokemon() {
    return { creer: (nom, niveau) => createMon(espece(nom), niveau), soigner: (m) => healFull(m) };
  }

  // ——— ce que BattleView et les écrans demandent au « jeu » ———
  levelCap() { return 100; }
  seenCount(sp) { return this.dex.seenCount[sp] || (this.dex.seen.includes(sp) ? 1 : 0); }
  isSpeciesKnown(sp) { return this.dex.caught.includes(sp) || this.T.etat.equipe.some((m) => m.sp === sp) || this.seenCount(sp) >= 3; }
  markSeen(sp) { this.dex.seenCount[sp] = (this.dex.seenCount[sp] || 0) + 1; if (!this.dex.seen.includes(sp)) this.dex.seen.push(sp); }
  markCaught(sp) { this.markSeen(sp); if (!this.dex.caught.includes(sp)) this.dex.caught.push(sp); }
  save() {}
  async askLearn(m, moveId) {
    const mv = MOVES[moveId], name = monName(m);
    for (;;) {
      await this.ui.say([`${name} veut apprendre ${mv.n}.`, `Mais ${name} connaît déjà quatre attaques.`], { keep: true });
      if (await this.ui.yesNo(`Oublier une attaque pour apprendre ${mv.n} ?`, { keep: true })) {
        const k = await this.ui.list({ title: 'Oublier quelle attaque ?', items: m.moves.map((x) => ({ label: MOVES[x.id].n, right: `PP ${x.pp}/${MOVES[x.id].pp}` })).concat([{ label: mv.n + ' (nouvelle)' }]), cls: 'psub learn', cancel: 4 });
        if (k >= 0 && k < 4) { const old = MOVES[m.moves[k].id].n; m.moves[k] = { id: moveId, pp: mv.pp }; this.sound.sfx('learn'); await this.ui.say(['1, 2 et... Tadaaa !', `${name} oublie ${old}...`, `Et ${name} apprend ${mv.n} !`]); return; }
      }
      if (await this.ui.yesNo(`Abandonner l'apprentissage de ${mv.n} ?`, { keep: true })) { await this.ui.say(`${name} n'a pas appris ${mv.n}.`); return; }
    }
  }

  // ——— son ———
  musique(nom) { const th = MUSIQUES[nom] || nom; try { if (th && this.sound.current !== th) { this.sound.play(th); this.sound.current = th; } } catch { /* thème absent */ } }
  son(nom) { try { this.sound.sfx(SONS[nom] || nom); } catch { /* bruitage absent */ } }

  // ——— combats ———
  /** joue un combat décrit par le terrain ; rend 'win', 'lose', 'flee' ou 'caught' */
  async combat(desc) {
    const T = this.T, st = this.state;
    this.occupe = true;
    try {
      if (!st.party.some((m) => m.hp > 0)) return 'win';   // pas encore de POKéMON : le combat n'a pas lieu
      const sauvage = desc.genre === 'sauvage';
      const foe = sauvage ? createMon(espece(desc.espece), desc.niveau) : null;
      const equipe = sauvage ? [foe] : desc.equipe.map((p) => createMon(espece(p.espece), p.niveau));
      if (sauvage) this.markSeen(foe.sp);
      const battle = new Battle({
        player: { name: st.name, party: st.party, bag: st.bag, mega: false },
        foe: sauvage ? { name: 'sauvage', party: [foe] } : { name: desc.nom, party: equipe, trainer: { name: desc.nom, bs: desc.portrait || desc.sprite || 'topdresseur' } },
        cap: this.levelCap(),
      });
      this.sound.stopMusic?.(0.1); this.sound.current = null;
      try { this.sound.play(sauvage ? 'wild' : desc.champion ? 'leader' : 'trainer'); } catch { /* */ }
      const bg = T.zone?.camera === 'grotte' ? 'cave' : T.zone?.interieur ? (desc.champion ? 'gym' : 'indoor') : T.mode === 'surf' ? 'water' : T.zone?.camera === 'ville' ? 'city' : 'grass';
      const r = await this.bv.run(battle, { bg, night: false, weather: 'none' });
      if (r === 'caught') {
        this.markCaught(foe.sp);
        foe.ot = st.name;
        this.bv.close();
        if (st.party.length < 6) st.party.push(foe); else { st.box.push(foe); await this.ui.say(`${monName(foe)} est envoyé dans le PC.`); }
      } else this.bv.close();
      this.sound.stopMusic?.(0.1); this.sound.current = null;
      // évolutions de fin de combat
      if (r !== 'lose') for (const m of st.party) if (battle.levelUps?.has(m.uid) && m.hp > 0) {
        const to = levelEvolution(m, 12);
        if (to) { const avant = monName(m); this.sound.sfx('evolve'); evolve(m, to); await this.ui.say([`Quoi ? ${avant} évolue !`, `${avant} a évolué en ${SPECIES[to].n} !`]); }
      }
      return r;
    } finally {
      this.input.clearDirs?.();
      this.occupe = false;
      this.musique(T.musique);
    }
  }

  // ——— menu du terrain : équipe, sac ———
  async menu() {
    if (this.occupe) return;
    this.occupe = true;
    try {
      for (;;) {
        const k = await this.ui.list({ title: this.T.etat.joueur.nom, items: [{ label: 'ÉQUIPE' }, { label: 'SAC' }, { label: 'SAUVEGARDER' }, { label: 'FERMER' }], cancel: -1, cls: 'menu-terrain' });
        if (k === 0) { if (this.state.party.length) await partyScreen(this, {}); else await this.ui.say('Tu n\'as encore aucun POKéMON.'); }
        else if (k === 1) await this.sac();
        else if (k === 2) { this.surSauvegarde?.(); this.sound.sfx('save'); await this.ui.say(`${this.T.etat.joueur.nom} sauvegarde la partie.`); }
        else return;
      }
    } finally { this.input.clearDirs?.(); this.occupe = false; }
  }
  async sac() {
    const st = this.state;
    for (;;) {
      const r = await bagScreen(this, {});
      if (!r) return;
      const it = ITEMS[r.item];
      if (!it || !(it.heal || it.cure || it.revive || it.pp || it.ppAll)) { await this.ui.say('Ce n\'est pas le moment d\'utiliser ça !'); continue; }
      if (!st.party.length) { await this.ui.say('Tu n\'as encore aucun POKéMON.'); continue; }
      const cible = await partyScreen(this, { mode: 'pick', prompt: `Utiliser ${itemName(r.item)} sur quel POKéMON ?`, filter: (m) => (canUseOn(r.item, m, 100) ? null : 'Pas d\'effet') });
      if (cible < 0) continue;
      const msg = applyItem(r.item, st.party[cible]);
      if (msg) { st.bag[r.item]--; if (st.bag[r.item] <= 0) delete st.bag[r.item]; this.sound.sfx('heal'); await this.ui.say(msg); }
    }
  }
}
