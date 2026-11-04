// odyssee/js/world/vehicules.js — deux quêtes de voyage : le vélo de Lucien (Voltacité) et le permis bateau
// (Capitainerie de Port-Azur), sans lequel le capitaine de l'Embarcadère de l'Aube ne laisse pas monter à bord.
// Les étapes sont rangées dans flags['Q:velo'] et flags['Q:permis'] (1, 2… puis 'fin'), lues par le journal.
import { nearestWalkable } from './mapgen.js';
import { ITEMS } from '../core/items.js';

Object.assign(ITEMS, {
  velo: { pocket: 'cles', price: 0, key: true, icon: 'bicycle', name: 'Vélo', desc: 'Un vélo rouge assemblé par Lucien, de Voltacité. Touche V (ou depuis le Sac) pour monter dessus ou en descendre, en extérieur.' },
  'chambre-air': { pocket: 'cles', price: 0, key: true, icon: 'tm-normal', name: 'Chambre à air', desc: 'Une chambre à air neuve, offerte par Yves, le marin de Port-Azur.' },
  derailleur: { pocket: 'cles', price: 0, key: true, icon: 'metal-coat', name: 'Dérailleur', desc: 'Un dérailleur forgé par les mineurs de Pierrefort, solide comme le roc.' },
  'permis-bateau': { pocket: 'cles', price: 0, key: true, icon: 'pass', name: 'Permis bateau', desc: 'Délivré par la Capitainerie de Port-Azur. Le capitaine de l\'Embarcadère de l\'Aube le demande à l\'embarquement.' },
});

/** questions de l'examen du permis bateau */
export const EXAMEN = [
  { q: 'Le pavillon rouge flotte sur la plage. Cela veut dire…', choix: ['Baignade surveillée', 'Baignade interdite', 'Marée basse', 'Pêche ouverte'], bonne: 1 },
  { q: 'Un bateau te croise par la droite (tribord). Qui a la priorité ?', choix: ['Toi', 'Lui', 'Le plus gros', 'Le plus rapide'], bonne: 1 },
  { q: 'Que faut-il porter à bord, quoi qu\'il arrive ?', choix: ['Un chapeau', 'Un gilet de sauvetage', 'Une canne à pêche', 'Une Poké Ball'], bonne: 1 },
  { q: 'Un Tentacool s\'accroche à la coque. Que fais-tu ?', choix: ['Je le décroche à la main', 'Je ralentis et je le laisse repartir', 'Je fonce', 'Je saute à l\'eau'], bonne: 1 },
];

export function addVehicules({ W, towns }) {
  const at = (t, x, y) => { const used = new Set(W.npcs.map((n) => n.x + ',' + n.y)); return nearestWalkable(W, t.x + x, t.y + y, used); };
  const step = (A, id) => A.step(id);
  const E = towns.E, D = towns.D, C = towns.C;

  /* ---------- le vélo de Lucien ---------- */
  {
    const [x, y] = at(E, 4, 13);
    W.npc({ id: 'velo:lucien', x, y, dir: 'down', sprite: 'gamin', talk: async (A) => {
      const s = step(A, 'velo'), who = 'Lucien, réparateur de vélos';
      if (s === 'fin') { await A.say(['Alors, il roule bien ? Pense à descendre avant d\'entrer quelque part !', 'Touche V pour monter sur ton vélo ou en descendre.'], who); return; }
      if (!s) {
        if (A.badges() < 1) { await A.say(['Je répare des vélos. Les dresseurs pressés sont mes meilleurs clients !', 'Reviens quand tu auras un badge : je te ferai une proposition.'], who); return; }
        await A.say(['Hé, toi ! Tu marches beaucoup, non ? J\'ai un vélo presque fini, rouge vif, il n\'attend qu\'un dresseur.', 'Il me manque deux pièces : une chambre à air et un dérailleur.', 'Yves, le marin de Port-Azur, a des chambres à air. Et les mineurs de Pierrefort forgent les meilleurs dérailleurs.', 'Rapporte-les-moi et le vélo est à toi, gratuitement !'], who);
        await A.set('velo', 1); return;
      }
      if (A.has('chambre-air') && A.has('derailleur')) {
        await A.say(['Les deux pièces ! Donne-moi une minute…', '… Et voilà !'], who);
        A.take('chambre-air'); A.take('derailleur');
        await A.give('velo');
        await A.say(['Touche V pour monter dessus ou en descendre (dehors seulement).', 'Bonne route, et méfie-toi des hautes herbes : à vélo, on ne voit pas les Pokémon arriver !'], who);
        await A.set('velo', 'fin'); return;
      }
      await A.say([`Il me manque encore ${!A.has('chambre-air') ? 'la chambre à air (Yves, à Port-Azur)' : ''}${!A.has('chambre-air') && !A.has('derailleur') ? ' et ' : ''}${!A.has('derailleur') ? 'le dérailleur (les mineurs de Pierrefort)' : ''}.`], who);
    } });
  }
  {
    const [x, y] = at(D, 22, 21);
    W.npc({ id: 'velo:yves', x, y, dir: 'down', sprite: 'marin', move: 'turn', talk: async (A) => {
      const who = 'Yves, le marin';
      if (step(A, 'velo') && step(A, 'velo') !== 'fin' && !A.has('chambre-air') && !A.f.velo_chambre) {
        await A.say(['Une chambre à air ? Pour Lucien ? Ha ! Ce gamin me doit encore trois rustines.', 'Bon, prends-la. Elle servait de bouée à mon Psykokwak.'], who);
        A.f.velo_chambre = true; await A.give('chambre-air'); await A.set('velo', 2, true); return;
      }
      await A.say(['Le vent tourne… Ça sent la tempête sur l\'archipel.'], who);
    } });
  }
  {
    const [x, y] = at(C, 52, 12);
    W.npc({ id: 'velo:mineur', x, y, dir: 'down', sprite: 'montagnard', talk: async (A) => {
      const who = 'Gustave, mineur';
      if (step(A, 'velo') && step(A, 'velo') !== 'fin' && !A.has('derailleur') && !A.f.velo_derailleur) {
        await A.say(['Un dérailleur pour Lucien ? On en a un en acier de la Grotte Lunaire, indestructible.', 'Tiens. Et dis-lui de ne plus le faire rouiller sous la pluie !'], who);
        A.f.velo_derailleur = true; await A.give('derailleur'); await A.set('velo', 3, true); return;
      }
      await A.say(['Basalte travaillait ici avant de partir sur son île. Le meilleur d\'entre nous.'], who);
    } });
  }

  /* ---------- le permis bateau ---------- */
  {
    const [x, y] = at(D, 28, 17);
    W.npc({ id: 'permis:inspectrice', x, y, dir: 'down', sprite: 'topdresseuse', talk: async (A) => {
      const s = step(A, 'permis'), who = 'Inspectrice Morvan, Capitainerie';
      if (A.has('permis-bateau')) { await A.say(['Tu as ton permis : le capitaine de l\'Embarcadère de l\'Aube t\'attend.', 'Et n\'oublie jamais ton gilet de sauvetage !'], who); return; }
      if (A.badges() < 2) { await A.say(['Capitainerie de Port-Azur. Je fais passer le permis bateau.', 'Il faut deux badges pour s\'inscrire : la mer, ce n\'est pas pour les débutants.'], who); return; }
      if (!s) await A.set('permis', 1, true);
      if (!(await A.yesNo('Examen du permis bateau : quatre questions de théorie, puis une épreuve pratique contre mon équipe. On y va ?', who))) { await A.say('Reviens quand tu veux.', who); return; }
      let bon = 0;
      for (const q of EXAMEN) {
        const k = await A.game.ui.list({ title: q.q, items: q.choix.map((label) => ({ label })), cls: 'shop quiz', cancel: null });
        if (k === q.bonne) { bon++; A.sfx('select'); } else A.sfx('bump');
      }
      if (bon < 3) { await A.say([`${bon} bonne${bon > 1 ? 's' : ''} réponse${bon > 1 ? 's' : ''} sur quatre. Il en faut trois.`, 'Révise le code de la mer et reviens !'], who); return; }
      await A.say([`${bon} sur quatre, c'est bon pour la théorie.`, 'Maintenant, l\'épreuve pratique : montre-moi que tes Pokémon savent tenir la mer !'], who);
      const lvl = 22;
      const res = await A.fight({ cls: 'Inspectrice', name: 'Morvan', team: [[72, lvl], [118, lvl], [222, lvl + 1]], ow: 'topdresseuse', bs: 'topdresseuse', prize: 0, lose: 'Bien navigué !' });
      if (res !== 'win') { await A.say('La mer est cruelle… Repose-toi et retente ta chance.', who); return; }
      await A.say(['Félicitations, tu es reçu' + A.e + ' !', 'Voici ton permis bateau. Le capitaine de l\'Embarcadère de l\'Aube te fera embarquer pour les îles de l\'Est.'], who);
      await A.give('permis-bateau'); await A.set('permis', 'fin');
    } });
  }
}
