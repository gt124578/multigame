// Arènes, champions, Ligue et rival.

export const BADGES = [
  { id: 'roche', name: 'Badge Galet', color: '#a89878' },
  { id: 'plante', name: 'Badge Feuille', color: '#58b050' },
  { id: 'spectre', name: 'Badge Brume', color: '#8a6ab0' },
  { id: 'elec', name: 'Badge Volt', color: '#f0c830' },
  { id: 'eau', name: 'Badge Vague', color: '#4a8ae0' },
  { id: 'feu', name: 'Badge Braise', color: '#e8603a' },
  { id: 'glace', name: 'Badge Givre', color: '#9ad8f0' },
  { id: 'dragon', name: 'Badge Écaille', color: '#7048d8' },
];

export const GYMS = {
  roche: { badge: 0, leader: { name: 'Bastien', cls: 'Champion', look: 'bastien', team: [['taupix', 10], ['galetin', 12]], money: 1200,
    intro: ['Bienvenue dans mon arène, jeune dresseur !', 'Je suis Bastien. Mes créatures sont solides comme le roc de cette ville.', 'Voyons si tu peux les ébranler !'],
    lose: 'Incroyable... Tu as fendu la pierre !', after: 'Avec le Badge Galet, tu peux défier l\'arène de Jardibourg, à l\'ouest, par le Bois Murmurant.' },
    floor: { gymA: '#b8a890', gymB: '#a09078' }, wall: '#8a7a68', obstacle: 'rock',
    trainers: [{ name: 'Jo', cls: 'Montagnard', look: 'hiker', team: [['galetin', 8], ['taupix', 9]], intro: 'Tu ne passeras pas sans affronter ma roche !', lose: 'Ma roche... fissurée.' }] },
  plante: { badge: 1, leader: { name: 'Iris', cls: 'Championne', look: 'iris', team: [['pousselin', 15], ['mousseron', 16], ['ronceau', 18]], money: 1800,
    intro: ['Oh, un visiteur ! Tu viens admirer ma serre ?', 'Je suis Iris. Mes créatures ont poussé avec patience et amour.', 'Mais elles savent aussi se défendre !'],
    lose: 'Tu as cueilli la victoire... Bravo.', after: 'Le Badge Feuille est à toi. Au nord, Brumecourt et son arène t\'attendent.' },
    floor: { gymA: '#7cbc6a', gymB: '#6aaa58' }, wall: '#5a9a4a', obstacle: 'plant',
    trainers: [{ name: 'Rose', cls: 'Jardinière', look: 'lass', team: [['pousselin', 13], ['chenillo', 13]], intro: 'Ne marche pas sur mes plates-bandes !', lose: 'Mes fleurs...' },
      { name: 'Basile', cls: 'Jardinier', look: 'bugcatcher', team: [['mousseron', 14], ['papillune', 14]], intro: 'La championne est au fond. Si tu passes !', lose: 'Tu es passé.' }] },
  spectre: { badge: 2, leader: { name: 'Morgane', cls: 'Championne', look: 'morgane', team: [['spectrelle', 21], ['songeau', 22], ['hantombre', 24]], money: 2400,
    intro: ['Chut... Tu entends ? Les esprits murmurent ton nom.', 'Je suis Morgane. Ici, le brouillard et les ombres sont mes alliés.', 'Montre-moi si tu as peur du noir !'],
    lose: 'Le brouillard se lève... Tu l\'as dissipé.', after: 'Le Badge Brume est à toi. À l\'est, la Route 4 mène à Volteville.' },
    floor: { gymA: '#4a4060', gymB: '#3a3050' }, wall: '#2a2240', obstacle: 'pillar', dark: 0.35,
    trainers: [{ name: 'Ombeline', cls: 'Médium', look: 'acef', team: [['spectrelle', 19], ['songeau', 19]], intro: 'Les esprits t\'ont vu entrer...', lose: 'Ils sont déçus.' },
      { name: 'Prosper', cls: 'Médium', look: 'oldman', team: [['hantombre', 21]], intro: 'Hé hé hé... Tu trembles ?', lose: 'C\'est moi qui tremble.' }] },
  elec: { badge: 3, leader: { name: 'Lionel', cls: 'Champion', look: 'lionel', team: [['voltis', 26], ['ferrolin', 26], ['fulgurat', 28]], money: 3000,
    intro: ['Wouah, un challenger ! Attends, je finis de souder ce circuit...', 'Voilà ! Je suis Lionel, ingénieur et champion de Volteville.', 'Mes créatures sont chargées à bloc. Prêt pour le choc ?'],
    lose: 'Court-circuit ! Tu m\'as complètement grillé.', after: 'Le Badge Volt est à toi ! Le pont du Lac Miroir, à l\'est, mène à Port-Azur.' },
    floor: { gymA: '#d8d4c0', gymB: '#c8c0a0' }, wall: '#6a6a7a', obstacle: 'machine',
    trainers: [{ name: 'Edison', cls: 'Scientifique', look: 'scientist', team: [['ferrolin', 24], ['voltis', 24]], intro: 'Prends ça, dix mille volts !', lose: 'Panne de courant...' },
      { name: 'Volta', cls: 'Dresseuse Pro', look: 'acef', team: [['fulgurat', 25]], intro: 'Mon Fulgurat est plus rapide que l\'éclair.', lose: 'Trop lent, finalement.' }] },
  eau: { badge: 4, leader: { name: 'Maëlle', cls: 'Championne', look: 'maelle', team: [['ranatide', 30], ['nenufar', 31], ['squalor', 33]], money: 3600,
    intro: ['Salut ! Tu sens l\'odeur de l\'océan ?', 'Je suis Maëlle. J\'ai grandi sur ces quais, au rythme des vagues.', 'Laisse-toi emporter par le courant !'],
    lose: 'Tu as tenu face à la marée... Respect !', after: 'Le Badge Vague est à toi. La Route 6 longe la plage jusqu\'à Forgeval.' },
    floor: { gymA: '#7ab8e8', gymB: '#5a9ad8' }, wall: '#3a6aa8', obstacle: 'pool',
    trainers: [{ name: 'Marin', cls: 'Nageur', look: 'swimmer', team: [['bulleau', 28], ['carpillon', 28], ['banquifoc', 29]], intro: 'Plouf ! Un combat !', lose: 'Je bois la tasse...' },
      { name: 'Ondine', cls: 'Nageuse', look: 'swimmer', team: [['ranatide', 29], ['nenufar', 29]], intro: 'L\'eau, c\'est la vie !', lose: 'Glouglou.' }] },
  feu: { badge: 5, leader: { name: 'Aldo', cls: 'Champion', look: 'aldo', team: [['fournelle', 34], ['tisonard', 35], ['volcanor', 38]], money: 4200,
    intro: ['HA ! Un dresseur qui ose entrer dans ma forge !', 'Je suis Aldo. Ici, on frappe le fer tant qu\'il est chaud.', 'Mes créatures vont te réduire en cendres !'],
    lose: 'Ma flamme vacille... Tu es plus chaud que la lave !', after: 'Le Badge Braise est à toi. La Grotte Cendrée, à l\'ouest, te ramène à Roc-Marbre. Et au nord de Brumecourt, le col enneigé s\'ouvre aux dresseurs comme toi.' },
    floor: { gymA: '#6a4a40', gymB: '#5a3a30' }, wall: '#4a2a22', obstacle: 'lava',
    trainers: [{ name: 'Braise', cls: 'Cracheur de feu', look: 'karate', team: [['fournelle', 32], ['volcanor', 32]], intro: 'Admire mes flammes !', lose: 'Éteint...' },
      { name: 'Cendre', cls: 'Dresseuse Pro', look: 'acef', team: [['tisonard', 33], ['nocturon', 33]], intro: 'Il fait chaud, non ?', lose: 'Ouf, ça rafraîchit.' }] },
  glace: { badge: 6, leader: { name: 'Solène', cls: 'Championne', look: 'solene', team: [['givrelin', 39], ['banquifoc', 40], ['frimastoc', 43]], money: 4800,
    intro: ['Le silence de la neige... Tu l\'entends ?', 'Je suis Solène. La glace est patiente, belle et impitoyable.', 'Voyons si ton cœur résiste au froid.'],
    lose: 'Ma glace a fondu... Ton cœur est brûlant.', after: 'Le Badge Givre est à toi. À l\'est, la Route 8 mène à la Cité Draconique.' },
    floor: { gymA: '#c8e8f8', gymB: '#b0d8f0' }, wall: '#7ab0d0', obstacle: 'ice',
    trainers: [{ name: 'Flocon', cls: 'Skieuse', look: 'acef', team: [['givrelin', 37], ['banquifoc', 38]], intro: 'Ça glisse !', lose: 'Patatras !' },
      { name: 'Yéti', cls: 'Alpiniste', look: 'hiker', team: [['frimastoc', 39]], intro: 'GROAR ! Euh, pardon. Bonjour.', lose: 'Groar...' }] },
  dragon: { badge: 7, leader: { name: 'Valère', cls: 'Champion', look: 'valere', team: [['dracomir', 44], ['dracomir', 45], ['wyvernor', 48]], money: 5400,
    intro: ['Tu as traversé tout Ambrevale pour arriver ici. Je le sens.', 'Je suis Valère, gardien du temple et maître des dragons.', 'Seuls les plus grands dresseurs survivent à la colère des dragons. Montre-moi ta valeur !'],
    lose: 'Les dragons s\'inclinent devant toi... Quel talent.', after: 'Tu possèdes les huit badges. La Route Victoire, à l\'est, mène au Plateau des Champions. Va, et deviens une légende.' },
    floor: { gymA: '#6a5a8a', gymB: '#5a4a7a' }, wall: '#3a2a5a', obstacle: 'statue',
    trainers: [{ name: 'Drake', cls: 'Dompteur', look: 'ace', team: [['dracolin', 42], ['dracomir', 43]], intro: 'Les dragons me suivent. Toi, tu vas me fuir.', lose: 'Je fuis, alors.' },
      { name: 'Wyvra', cls: 'Dompteuse', look: 'acef', team: [['dracomir', 43], ['corbonuit', 43]], intro: 'Le temple est sacré, intrus !', lose: 'Tu en es digne.' }] },
};

export const CHAMPION = { name: 'Célian', cls: 'Maître de la Ligue', look: 'celian', money: 10000,
  team: [['cielaigle', 50], ['hantombre', 51], ['magnetor', 51], ['colossaing', 52], ['squalor', 52], ['wyvernor', 54]],
  intro: ['Bienvenue au sommet, dresseur.', 'Je suis Célian, Maître de la Ligue d\'Ambrevale. J\'ai suivi ton voyage avec attention.', 'Huit badges, des dizaines de combats... Il ne reste plus qu\'une marche.', 'Donne tout ce que tu as !'],
  lose: 'C\'est donc ça, la force d\'un vrai dresseur...', after: 'Tu es le nouveau Maître de la Ligue d\'Ambrevale !' };

/** équipes du rival selon le départ choisi par le joueur (il prend celui qui a l'avantage) */
export function rivalTeam(stage, playerStarter) {
  const counter = { brindou: ['braisille', 'tisonard', 'pyrolupe'], braisille: ['gouttin', 'ondrille', 'marenor'], gouttin: ['brindou', 'ronceau', 'sylvagor'] }[playerStarter] || ['braisille', 'tisonard', 'pyrolupe'];
  if (stage === 1) return [[counter[0], 5]];
  if (stage === 2) return [['piaffu', 12], ['grignou', 12], [counter[0], 15]];
  if (stage === 3) return [['rapacier', 26], ['voltis', 25], ['sinueuse', 25], [counter[1], 28]];
  return [['cielaigle', 45], ['viperonne', 44], ['fulgurat', 45], ['hantombre', 45], [counter[2], 48]];
}
export const RIVAL_TEXT = {
  1: { intro: ['Hé ! Attends un peu !', 'Puisque le Prof nous a donné une créature chacun... on va voir laquelle est la meilleure !'], lose: 'Quoi ?! J\'ai choisi la mauvaise, c\'est sûr !', win: 'Ha ! J\'ai gagné ! Normal.', after: ['Bon. La prochaine fois, je ne perdrai pas.', 'Je file à Roc-Marbre ! À plus, la tortue !'] },
  2: { intro: ['Tiens, tiens ! Toi aussi tu as deux badges ?', 'Moi, j\'ai capturé plein de créatures. Mon équipe est imbattable !'], lose: 'Grr... T\'as eu de la chance !', win: 'Trop facile !', after: ['Brumecourt est au nord. Le brouillard ne me fait pas peur, à moi.'] },
  3: { intro: ['Te revoilà ! Tu tombes bien.', 'Je viens de battre Lionel. Enfin... presque. Bon, je m\'échauffe sur toi !'], lose: 'Encore ?! Mais comment tu fais ?', win: 'Je suis en feu aujourd\'hui !', after: ['Bon, je vais m\'entraîner sur la plage. On se reverra à la Ligue.'] },
  4: { intro: ['Je t\'attendais.', 'Huit badges chacun. Le Plateau des Champions est juste là.', 'Mais un seul de nous deux montera là-haut. Allez, donne tout !'], lose: '...Tu es vraiment devenu fort.', win: 'Désolé, mon vieux. C\'est mon jour.', after: ['Vas-y. Montre au Champion ce que vaut un dresseur du Hameau des Brumes.'] },
};
