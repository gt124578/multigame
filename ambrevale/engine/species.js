// Espèces de créatures originales (bouche-trous du prototype).
// st : [PV, Atq, Déf, AtqSpé, DéfSpé, Vit] ; rate : taux de capture ; xp : expérience donnée ; evo : [niveau, espèce]
// sp : fiche de dessin (voir gfx/creatures.js)

const SP = {};
let num = 0;
function S(id, name, types, st, o) { SP[id] = { id, num: ++num, name, types, st, rate: 120, xp: 60, learn: [], ...o }; }

// ---- Départs ----
S('brindou', 'Brindou', ['plante'], [45, 49, 49, 62, 62, 45], { rate: 45, xp: 64, evo: [16, 'ronceau'], desc: 'Il dort au soleil. La pousse sur sa tête grandit avec sa confiance.',
  learn: [[1, 'charge'], [1, 'grondement'], [5, 'absorb'], [9, 'liane'], [13, 'poudrepoison'], [17, 'feuilles'], [22, 'megaseve'], [28, 'spores'], [34, 'racines'], [40, 'chloro']],
  sp: { plan: 'quad', s: 0.7, body: '#74c86e', belly: '#e8f2a8', accent: '#3e9a4a', accent2: '#2f7a3a', head: 1.18, leg: 0.75, sprout: true, tail: 'leaf', eyeSize: 1.15, iris: '#c04030', mouth: 'smile' } });
S('ronceau', 'Ronceau', ['plante'], [60, 64, 66, 80, 80, 60], { rate: 45, xp: 142, evo: [34, 'sylvagor'],
  learn: [[1, 'charge'], [1, 'liane'], [13, 'poudrepoison'], [17, 'feuilles'], [22, 'megaseve'], [28, 'spores'], [36, 'racines'], [44, 'chloro']],
  sp: { plan: 'quad', s: 0.88, body: '#52b05c', belly: '#dcea9c', accent: '#2f8a40', back: 'leaves', tail: 'leaf', head: 1.02, iris: '#c04030', eyes: 'round', mouth: 'smile' } });
S('sylvagor', 'Sylvagor', ['plante', 'sol'], [80, 92, 90, 95, 95, 78], { rate: 45, xp: 236,
  learn: [[1, 'liane'], [1, 'feuilles'], [28, 'spores'], [34, 'seisme'], [38, 'racines'], [46, 'chloro'], [52, 'marteaubois']],
  sp: { plan: 'quad', s: 1.08, bw: 1.18, bh: 1.15, body: '#4c9a66', belly: '#d0dc98', accent: '#e8708a', accent2: '#2f7a3e', back: 'bulb', horn: 'double', hornColor: '#a88a64', head: 0.95, iris: '#c04030', eyes: 'angry', mouth: 'line', legW: 1.3 } });

S('braisille', 'Braisille', ['feu'], [39, 52, 43, 60, 50, 65], { rate: 45, xp: 62, evo: [16, 'tisonard'], desc: 'Le bout de sa queue brûle doucement. Plus il est content, plus la flamme danse.',
  learn: [[1, 'griffe'], [1, 'grondement'], [7, 'braise'], [11, 'fulgur'], [15, 'rouefeu'], [20, 'morsure'], [26, 'crocfeu'], [32, 'feufolet'], [38, 'jetflamme']],
  sp: { plan: 'quad', s: 0.7, body: '#f08a3c', belly: '#fff2cc', accent: '#ffcc3a', accent2: '#fff6b0', ears: 'point', earLen: 1.3, innerEar: '#ffd0a8', tail: 'flame', head: 1.18, snout: 0.75, leg: 0.8, eyeSize: 1.1 } });
S('tisonard', 'Tisonard', ['feu'], [58, 64, 58, 80, 65, 80], { rate: 45, xp: 142, evo: [36, 'pyrolupe'],
  learn: [[1, 'griffe'], [1, 'braise'], [15, 'rouefeu'], [20, 'morsure'], [27, 'crocfeu'], [33, 'feufolet'], [40, 'jetflamme'], [46, 'fournaise']],
  sp: { plan: 'quad', s: 0.9, body: '#e8642e', belly: '#ffe2b4', accent: '#ffc230', accent2: '#fff2a0', ears: 'point', earLen: 1.1, innerEar: '#ffc8a0', mane: true, tail: 'flame', snout: 0.8, head: 1.02, leg: 1.05, eyes: 'round' } });
S('pyrolupe', 'Pyrolupe', ['feu', 'tenebres'], [78, 90, 78, 104, 80, 102], { rate: 45, xp: 240,
  learn: [[1, 'crocfeu'], [1, 'morsure'], [36, 'machnoire'], [42, 'jetflamme'], [48, 'vibronuit'], [54, 'fournaise']],
  sp: { plan: 'quad', s: 1.1, body: '#3c3346', belly: '#f2a24a', accent: '#ff7030', accent2: '#ffd060', ears: 'point', earLen: 1.2, innerEar: '#ff9a50', mane: true, tail: 'flame', snout: 0.9, leg: 1.2, eyes: 'angry', iris: '#ffcc30', mouth: 'fang' } });

S('gouttin', 'Gouttin', ['eau'], [44, 48, 65, 50, 64, 43], { rate: 45, xp: 63, evo: [16, 'ondrille'], desc: 'Il nage avant de savoir marcher. Il garde toujours un galet préféré.',
  learn: [[1, 'charge'], [1, 'fouetqueue'], [7, 'bulles'], [10, 'jetdeau'], [14, 'morsure'], [19, 'vague'], [25, 'murmental'], [31, 'queuemarine'], [38, 'torrent']],
  sp: { plan: 'biped', s: 0.7, body: '#5aa2ea', belly: '#f2f2e2', accent: '#2f78c8', ears: 'round', earLen: 0.75, tail: 'fin', head: 1.2, snout: 0.7, eyeSize: 1.15, leg: 0.8 } });
S('ondrille', 'Ondrille', ['eau'], [59, 63, 80, 65, 80, 58], { rate: 45, xp: 142, evo: [36, 'marenor'],
  learn: [[1, 'charge'], [1, 'bulles'], [14, 'morsure'], [19, 'vague'], [26, 'murmental'], [33, 'queuemarine'], [40, 'torrent']],
  sp: { plan: 'biped', s: 0.88, body: '#4086da', belly: '#e8f2f2', accent: '#d8f2ff', ears: 'fin', tail: 'fin', claws: true, snout: 0.75, head: 1.02 } });
S('marenor', 'Marénor', ['eau', 'sol'], [79, 83, 100, 85, 105, 78], { rate: 45, xp: 239,
  learn: [[1, 'vague'], [1, 'morsure'], [36, 'seisme'], [42, 'queuemarine'], [48, 'torrent'], [54, 'murmental']],
  sp: { plan: 'biped', s: 1.12, bw: 1.25, body: '#3068ba', belly: '#e2d8b0', accent: '#8a6a4c', accent2: '#b8946c', back: 'shell', ears: 'fin', horn: 'double', hornColor: '#e8e0c8', eyes: 'angry', armW: 1.35, legW: 1.35, head: 0.92 } });

// ---- Communs des premières routes ----
S('piaffu', 'Piaffu', ['normal', 'vol'], [40, 45, 40, 35, 35, 56], { rate: 255, xp: 50, evo: [18, 'rapacier'], desc: 'Il siffle à l\'aube pour réveiller toute la forêt.',
  learn: [[1, 'charge'], [1, 'jetsable'], [5, 'picpic'], [9, 'tornade'], [13, 'fulgur'], [19, 'coupaile'], [27, 'vitesse'], [35, 'rafale']],
  sp: { plan: 'bird', s: 0.66, body: '#b48c62', belly: '#f2e2c2', accent: '#7a5a3c', wing: '#cca474', hornColor: '#f0b030', crest: 2, eyeSize: 1.1 } });
S('rapacier', 'Rapacier', ['normal', 'vol'], [63, 70, 55, 50, 50, 75], { rate: 120, xp: 122, evo: [36, 'cielaigle'],
  learn: [[1, 'picpic'], [1, 'tornade'], [13, 'fulgur'], [19, 'coupaile'], [28, 'vitesse'], [36, 'rafale'], [42, 'pique']],
  sp: { plan: 'bird', s: 0.86, body: '#9c7048', belly: '#f0e2ca', accent: '#d04030', wing: '#b88a58', hornColor: '#f0b030', crest: 3, eyes: 'angry' } });
S('cielaigle', 'Cielaigle', ['normal', 'vol'], [83, 85, 75, 70, 70, 101], { rate: 45, xp: 216,
  learn: [[1, 'coupaile'], [1, 'fulgur'], [36, 'rafale'], [44, 'pique'], [50, 'megaplaque']],
  sp: { plan: 'bird', s: 1.05, wings: 1.3, body: '#7c5a3c', belly: '#f6eedc', accent: '#f0ece0', wing: '#a07a50', hornColor: '#f4b830', headMask: true, crest: 3, eyes: 'angry', iris: '#f0c030', beakLen: 1.2 } });
S('grignou', 'Grignou', ['normal'], [30, 56, 35, 25, 35, 72], { rate: 255, xp: 51, evo: [20, 'rongemax'], desc: 'Ses dents ne s\'arrêtent jamais de pousser. Il ronge tout ce qu\'il trouve.',
  learn: [[1, 'charge'], [1, 'fouetqueue'], [4, 'fulgur'], [7, 'morsure'], [13, 'coupboule'], [20, 'aiguisage'], [26, 'machnoire'], [33, 'belier']],
  sp: { plan: 'quad', s: 0.6, body: '#b8a8a2', belly: '#f2eae2', accent: '#8a7a74', ears: 'round', earLen: 1.25, innerEar: '#f0b0b0', tail: 'thin', head: 1.22, snout: 0.55, mouth: 'fang', leg: 0.7 } });
S('rongemax', 'Rongemax', ['normal'], [55, 81, 60, 50, 70, 97], { rate: 127, xp: 145,
  learn: [[1, 'morsure'], [1, 'fulgur'], [20, 'aiguisage'], [28, 'machnoire'], [34, 'belier'], [40, 'megaplaque']],
  sp: { plan: 'quad', s: 0.86, bw: 1.1, body: '#a28262', belly: '#f2e2c2', accent: '#7a5a3c', ears: 'round', innerEar: '#f0c0a0', tail: 'thin', tailLen: 1.2, snout: 0.7, mouth: 'fang', eyes: 'angry' } });
S('laineau', 'Laineau', ['normal'], [55, 40, 55, 45, 55, 35], { rate: 200, xp: 58, evo: [24, 'belinox'], desc: 'Sa laine garde la chaleur toute la nuit. On en fait des couvertures.',
  learn: [[1, 'charge'], [1, 'grondement'], [6, 'berceuse'], [11, 'coupboule'], [18, 'etincelle'], [25, 'megaplaque'], [32, 'soin']],
  sp: { plan: 'quad', s: 0.68, body: '#f4f2ec', belly: '#f4f2ec', accent: '#fbfaf6', back: 'cloud', ears: 'round', earLen: 0.8, innerEar: '#e8b8b8', head: 0.95, horn: 'none', eyes: 'sleepy', dark: '#5a5048', leg: 0.7 } });
S('belinox', 'Bélinox', ['normal', 'fee'], [80, 65, 80, 70, 85, 50], { rate: 90, xp: 158,
  learn: [[1, 'coupboule'], [1, 'berceuse'], [24, 'charme'], [30, 'megaplaque'], [36, 'eclatlune'], [42, 'soin']],
  sp: { plan: 'quad', s: 0.95, bw: 1.15, body: '#f8eef4', belly: '#f8eef4', accent: '#ffc8e0', back: 'cloud', horn: 'double', hornColor: '#d8b880', head: 0.9, eyes: 'round', iris: '#c060a0' } });

// ---- Insectes ----
S('chenillo', 'Chenillo', ['insecte'], [45, 30, 35, 20, 20, 45], { rate: 255, xp: 39, evo: [10, 'papillune'], desc: 'Il grignote les feuilles tendres et laisse des dentelles partout.',
  learn: [[1, 'charge'], [1, 'fildesoie'], [6, 'essaim'], [9, 'morsinsecte']],
  sp: { plan: 'serpent', s: 0.58, body: '#8ccc4c', belly: '#f2f2a4', accent: '#f0d040', pattern: 'spots', antenna: true, head: 1.12, eyeSize: 1.15 } });
S('papillune', 'Papillune', ['insecte', 'vol'], [60, 45, 50, 90, 80, 70], { rate: 45, xp: 160,
  learn: [[1, 'tornade'], [1, 'essaim'], [10, 'pensee'], [13, 'poudrepoison'], [16, 'spores'], [22, 'bourdon'], [28, 'rafale'], [34, 'psyonde']],
  sp: { plan: 'bug', s: 0.86, float: true, wings: 1.35, body: '#6a5aa8', accent: '#f0d0f0', wing: '#f6c0e8', antenna: true, eyes: 'round', iris: '#e04070', eyeSize: 1.2 } });
S('dardillon', 'Dardillon', ['insecte', 'poison'], [40, 50, 40, 30, 35, 60], { rate: 200, xp: 52, evo: [18, 'gueperis'], desc: 'Il défend sa ruche avec un courage démesuré.',
  learn: [[1, 'dard'], [1, 'fildesoie'], [7, 'essaim'], [12, 'morsinsecte'], [18, 'acide'], [24, 'bombetox']],
  sp: { plan: 'bug', s: 0.62, float: true, wings: 0.85, body: '#f2d040', accent: '#34302c', wing: '#e4f2ff', pattern: 'stripes', head: 1.1, eyeSize: 1.1 } });
S('gueperis', 'Guêpéris', ['insecte', 'poison'], [65, 90, 40, 45, 80, 75], { rate: 45, xp: 160,
  learn: [[1, 'dard'], [1, 'essaim'], [18, 'acide'], [24, 'bombetox'], [30, 'morsinsecte'], [36, 'bourdon']],
  sp: { plan: 'bug', s: 0.92, float: true, wings: 1.1, wingFront: true, body: '#f0c830', accent: '#2c2828', wing: '#e8f4ff', pattern: 'stripes', mandibles: true, claws: true, eyes: 'angry', iris: '#d03030' } });

// ---- Électrik ----
S('voltis', 'Voltis', ['elec'], [35, 55, 40, 50, 50, 90], { rate: 190, xp: 82, evo: [22, 'fulgurat'], desc: 'Il stocke l\'électricité dans ses joues. Le toucher picote.',
  learn: [[1, 'etincelle'], [1, 'grondement'], [6, 'fouetqueue'], [9, 'fulgur'], [14, 'ondepara'], [20, 'decharge'], [26, 'foudre'], [34, 'orage']],
  sp: { plan: 'blob', s: 0.64, body: '#f8d838', belly: '#fff6b8', accent: '#b87820', ears: 'point', earLen: 1.5, innerEar: '#40302a', tail: 'bolt', cheeks: true, cheek: '#ff6050', eyeSize: 1.2, arms: true } });
S('fulgurat', 'Fulgurat', ['elec'], [60, 90, 55, 90, 80, 110], { rate: 75, xp: 172,
  learn: [[1, 'etincelle'], [1, 'fulgur'], [22, 'crocelec'], [28, 'foudre'], [36, 'orage'], [42, 'vitesse']],
  sp: { plan: 'quad', s: 0.95, body: '#f2c420', belly: '#fff0a0', accent: '#3c3020', pattern: 'stripes', ears: 'point', earLen: 1.2, innerEar: '#3c3020', tail: 'bolt', eyes: 'angry', mouth: 'fang', leg: 1.1 } });
S('ferrolin', 'Ferrolin', ['acier', 'elec'], [25, 35, 70, 95, 55, 45], { rate: 190, xp: 89, evo: [30, 'magnetor'], desc: 'Il flotte en suivant les lignes magnétiques du sol.',
  learn: [[1, 'charge'], [1, 'etincelle'], [8, 'ondepara'], [14, 'griffefer'], [20, 'decharge'], [26, 'rayonacier'], [32, 'foudre']],
  sp: { plan: 'blob', s: 0.6, float: true, body: '#bcc4d4', accent: '#e04848', horn: 'single', hornColor: '#e8e8f0', ears: 'fin', arms: false, eyes: 'round', eyeSize: 1.25, mouth: 'line', pattern: 'band' } });
S('magnetor', 'Magnétor', ['acier', 'elec'], [50, 60, 95, 120, 70, 70], { rate: 60, xp: 163,
  learn: [[1, 'etincelle'], [1, 'griffefer'], [30, 'rayonacier'], [36, 'foudre'], [42, 'murfer'], [48, 'orage']],
  sp: { plan: 'blob', s: 0.95, bw: 1.2, float: true, body: '#a2aabc', accent: '#f0d040', back: 'crystals', horn: 'double', hornColor: '#f4f0e0', ears: 'fin', arms: true, eyes: 'angry', pattern: 'band', mouth: 'line' } });

// ---- Roche / Sol ----
S('galetin', 'Galetin', ['roche', 'sol'], [40, 80, 100, 30, 30, 20], { rate: 255, xp: 60, evo: [25, 'rocharde'], desc: 'On le confond avec un caillou. Il adore ça.',
  learn: [[1, 'charge'], [1, 'armurepierre'], [6, 'jetsable'], [11, 'jetpierre'], [16, 'pelle'], [21, 'eboulis'], [29, 'seisme'], [36, 'rocboulet']],
  sp: { plan: 'blob', s: 0.62, body: '#a49a8c', accent: '#80786a', pattern: 'spots', eyes: 'angry', arms: true, feet: false, mouth: 'line', bh: 0.9 } });
S('rocharde', 'Rocharde', ['roche', 'sol'], [55, 95, 115, 45, 45, 35], { rate: 120, xp: 137, evo: [38, 'montagor'],
  learn: [[1, 'jetpierre'], [1, 'armurepierre'], [21, 'eboulis'], [30, 'seisme'], [38, 'rocboulet']],
  sp: { plan: 'blob', s: 0.86, bw: 1.2, body: '#948a7c', accent: '#c8c0ae', back: 'crystals', pattern: 'spots', eyes: 'angry', arms: true, mouth: 'line' } });
S('montagor', 'Montagor', ['roche', 'sol'], [80, 120, 130, 55, 65, 45], { rate: 45, xp: 223,
  learn: [[1, 'eboulis'], [1, 'seisme'], [38, 'rocboulet'], [44, 'frappecolo'], [50, 'armurepierre']],
  sp: { plan: 'biped', s: 1.1, bw: 1.3, body: '#8c8272', belly: '#b8ae98', accent: '#6a6458', back: 'spikes', spikes: 5, eyes: 'angry', armW: 1.55, legW: 1.5, head: 0.85, mouth: 'line', claws: true } });
S('taupix', 'Taupix', ['sol'], [35, 55, 30, 30, 45, 80], { rate: 255, xp: 53, evo: [26, 'fouisseur'], desc: 'Il creuse des galeries si longues qu\'il s\'y perd lui-même.',
  learn: [[1, 'griffe'], [1, 'jetsable'], [7, 'pelle'], [15, 'boue'], [20, 'griffefer'], [26, 'seisme']],
  sp: { plan: 'quad', s: 0.6, body: '#a47a52', belly: '#ecca92', accent: '#6a4a30', snout: 1.05, head: 1.1, eyes: 'dot', leg: 0.6, legW: 1.2 } });
S('fouisseur', 'Fouisseur', ['sol'], [65, 100, 60, 50, 70, 105], { rate: 50, xp: 149,
  learn: [[1, 'pelle'], [1, 'griffefer'], [26, 'boue'], [32, 'seisme'], [40, 'eboulis'], [46, 'aiguisage']],
  sp: { plan: 'quad', s: 0.95, body: '#8c6242', belly: '#e2c290', accent: '#e8d8a8', back: 'spikes', spikes: 5, snout: 1.1, eyes: 'angry', legW: 1.3 } });

// ---- Eau ----
S('carpillon', 'Carpillon', ['eau'], [20, 10, 55, 15, 20, 80], { rate: 255, xp: 40, evo: [20, 'squalor'], desc: 'Il saute hors de l\'eau sans raison. Ce n\'est pas très utile.',
  learn: [[1, 'jetdeau'], [10, 'charge'], [15, 'bulles'], [20, 'morsure']],
  sp: { plan: 'fish', s: 0.64, body: '#f07850', belly: '#f8e8c0', accent: '#f8d060', accent2: '#f8e8c0', whiskers: true, eyeSize: 1.2 } });
S('squalor', 'Squalor', ['eau', 'tenebres'], [95, 125, 79, 60, 100, 81], { rate: 45, xp: 189,
  learn: [[1, 'morsure'], [1, 'vague'], [20, 'machnoire'], [26, 'queuemarine'], [32, 'crocgivre'], [40, 'torrent'], [46, 'coleredraco']],
  sp: { plan: 'fish', s: 1.12, bw: 1.1, finSize: 1.4, body: '#3c5c94', belly: '#d8e0e8', accent: '#24385c', horn: true, hornColor: '#d8dce8', eyes: 'angry', mouth: 'fang' } });
S('bulleau', 'Bulleau', ['eau'], [50, 50, 40, 40, 40, 90], { rate: 255, xp: 60, evo: [25, 'ranatide'], desc: 'La spirale sur son ventre hypnotise ses proies.',
  learn: [[1, 'bulles'], [5, 'berceuse'], [9, 'jetdeau'], [15, 'balayette'], [21, 'vague'], [27, 'uppercut']],
  sp: { plan: 'blob', s: 0.62, body: '#7cbaf2', belly: '#f2f8ff', accent: '#4a88d0', pattern: 'spots', tail: 'fin', eyeSize: 1.3, mouth: 'open', arms: true } });
S('ranatide', 'Ranatide', ['eau', 'combat'], [90, 95, 95, 70, 90, 70], { rate: 45, xp: 170,
  learn: [[1, 'vague'], [1, 'balayette'], [25, 'uppercut'], [32, 'queuemarine'], [38, 'gonflette'], [44, 'frappecolo']],
  sp: { plan: 'biped', s: 0.96, body: '#4a92ca', belly: '#ececd8', accent: '#2a5a8a', headMask: true, claws: true, eyes: 'angry', mouth: 'line', armW: 1.3, legW: 1.2 } });
S('nenufar', 'Nénufar', ['eau', 'plante'], [50, 40, 50, 60, 70, 50], { rate: 190, xp: 74, desc: 'Il dérive sur les étangs en chantonnant.',
  learn: [[1, 'absorb'], [1, 'bulles'], [9, 'jetdeau'], [15, 'megaseve'], [21, 'vague'], [28, 'racines'], [35, 'pluie']],
  sp: { plan: 'plant', s: 0.72, body: '#5aaacc', accent: '#4ab062', flower: true, petal: '#fff0f8', accent2: '#ffe070', leaves: 4, eyes: 'round', cheeks: true, cheek: '#f8a0b0' } });

// ---- Plante / Poison ----
S('pousselin', 'Pousselin', ['plante', 'poison'], [45, 50, 55, 75, 65, 30], { rate: 255, xp: 64, evo: [21, 'floreole'], desc: 'La nuit, il se promène en se plantant ici et là.',
  learn: [[1, 'absorb'], [1, 'acide'], [7, 'poudrepoison'], [12, 'megaseve'], [17, 'spores'], [24, 'bombetox'], [30, 'racines']],
  sp: { plan: 'plant', s: 0.6, body: '#7c5caa', accent: '#5cb052', leaves: 5, eyes: 'round', cheeks: true, eyeSize: 1.15 } });
S('floreole', 'Floréole', ['plante', 'poison'], [70, 70, 80, 105, 90, 50], { rate: 90, xp: 162,
  learn: [[1, 'megaseve'], [1, 'poudrepoison'], [21, 'bombetox'], [28, 'racines'], [34, 'spores'], [40, 'chloro']],
  sp: { plan: 'plant', s: 0.9, bw: 1.1, body: '#8c66ba', accent: '#4c9e46', flower: true, petal: '#ff84b4', accent2: '#ffe060', leaves: 6, eyes: 'round', iris: '#a03070', cheeks: true } });
S('mousseron', 'Mousseron', ['plante', 'fee'], [60, 55, 70, 60, 75, 35], { rate: 190, xp: 70, desc: 'Son chapeau libère des spores qui font rêver.',
  learn: [[1, 'absorb'], [1, 'charme'], [8, 'spores'], [14, 'megaseve'], [20, 'bisou'], [27, 'racines'], [34, 'eclatlune']],
  sp: { plan: 'blob', s: 0.66, body: '#f2e4cc', belly: '#fff8ec', accent: '#e04848', back: 'cloud', eyes: 'round', cheeks: true, arms: true, eyeSize: 1.1 } });
S('sinueuse', 'Sinueuse', ['poison'], [45, 60, 44, 40, 54, 55], { rate: 255, xp: 58, evo: [22, 'viperonne'], desc: 'Elle se faufile dans l\'herbe sans un bruit.',
  learn: [[1, 'dard'], [1, 'grondement'], [8, 'morsure'], [13, 'acide'], [20, 'regardglace'], [25, 'bombetox'], [33, 'machnoire']],
  sp: { plan: 'serpent', s: 0.78, body: '#9a58b2', belly: '#ead2a2', accent: '#f0d040', pattern: 'band', mouth: 'fang', eyes: 'round', iris: '#f0c030' } });
S('viperonne', 'Vipéronne', ['poison', 'sol'], [70, 95, 69, 65, 79, 80], { rate: 90, xp: 153,
  learn: [[1, 'morsure'], [1, 'acide'], [22, 'bombetox'], [28, 'seisme'], [36, 'machnoire'], [42, 'regardglace']],
  sp: { plan: 'serpent', s: 1.05, bw: 1.15, body: '#7c3e92', belly: '#dac08a', accent: '#c45092', hood: true, horn: 'single', hornColor: '#f0e6c8', eyes: 'angry', iris: '#f0c030', mouth: 'fang', pattern: 'spots' } });

// ---- Fée / Psy / Spectre ----
S('lumignon', 'Lumignon', ['fee'], [50, 25, 45, 60, 65, 40], { rate: 150, xp: 61, evo: [24, 'feelune'], desc: 'On dit qu\'il apparaît les nuits de pleine lune près des fontaines.',
  learn: [[1, 'etoiles'], [1, 'charme'], [6, 'berceuse'], [11, 'bisou'], [18, 'voile'], [26, 'eclatlune']],
  sp: { plan: 'blob', s: 0.58, body: '#f8cadb', belly: '#fff2f6', accent: '#ffe080', ears: 'round', earLen: 0.7, cheeks: true, cheek: '#ff90b0', eyes: 'round', iris: '#d060a0', eyeSize: 1.35, tail: 'tuft' } });
S('feelune', 'Féelune', ['fee'], [80, 50, 70, 95, 100, 70], { rate: 60, xp: 175,
  learn: [[1, 'bisou'], [1, 'charme'], [24, 'eclatlune'], [30, 'voile'], [36, 'psyonde'], [42, 'etoiles']],
  sp: { plan: 'biped', s: 0.88, body: '#f2bad8', belly: '#fff2f8', wings: 1.0, wing: '#fff2fa', ears: 'long', earLen: 0.9, eyes: 'round', iris: '#a060d0', cheeks: true, cheek: '#ff90b0', head: 1.05 } });
S('songeau', 'Songeau', ['psy'], [60, 30, 50, 75, 70, 45], { rate: 190, xp: 66, evo: [27, 'oniris'], desc: 'Il dort en flottant et mange les mauvais rêves des enfants.',
  learn: [[1, 'pensee'], [1, 'berceuse'], [8, 'hypnose'], [14, 'meditation'], [20, 'psyonde'], [27, 'soin']],
  sp: { plan: 'blob', s: 0.62, float: true, body: '#cca4ea', belly: '#f6eeff', accent: '#9a70c8', ears: 'round', earLen: 0.6, eyes: 'sleepy', dark: '#4a3060', tail: 'tuft', arms: true } });
S('oniris', 'Oniris', ['psy'], [80, 50, 70, 110, 100, 85], { rate: 60, xp: 172,
  learn: [[1, 'pensee'], [1, 'hypnose'], [27, 'psyonde'], [33, 'meditation'], [40, 'murmental'], [46, 'eclatlune']],
  sp: { plan: 'biped', s: 0.96, body: '#a27aca', belly: '#ecdcfa', accent: '#e4ccfa', ears: 'long', earLen: 1.2, headMask: true, eyes: 'glow', glow: '#ffe080', tail: 'thin', head: 1.0 } });
S('spectrelle', 'Spectrelle', ['spectre', 'poison'], [35, 40, 35, 80, 40, 75], { rate: 190, xp: 62, evo: [25, 'hantombre'], desc: 'Elle rit quand on frissonne. Personne ne sait d\'où elle vient.',
  learn: [[1, 'lechouille'], [1, 'regardglace'], [8, 'ombreportee'], [12, 'hypnose'], [18, 'acide'], [24, 'bouleombre'], [32, 'bombetox']],
  sp: { plan: 'blob', s: 0.62, float: true, ghost: true, body: '#6c5a9a', belly: '#9a88c8', arms: false, eyes: 'round', iris: '#ff4060', eyeSize: 1.2, mouth: 'fang' } });
S('hantombre', 'Hantombre', ['spectre'], [60, 65, 60, 115, 75, 95], { rate: 45, xp: 175,
  learn: [[1, 'ombreportee'], [1, 'hypnose'], [25, 'bouleombre'], [32, 'machination'], [38, 'vibronuit'], [44, 'psyonde']],
  sp: { plan: 'blob', s: 0.96, float: true, ghost: true, body: '#4c3c72', accent: '#8a70c2', pattern: 'spots', eyes: 'glow', glow: '#ff6080', horn: 'double', hornColor: '#c4b4e4', arms: true, mouth: 'open' } });

// ---- Glace ----
S('givrelin', 'Givrelin', ['glace'], [45, 45, 50, 60, 65, 60], { rate: 190, xp: 63, evo: [28, 'frimastoc'], desc: 'Son souffle forme des flocons. Il adore se rouler dans la neige.',
  learn: [[1, 'poudreuse'], [1, 'fouetqueue'], [8, 'fulgur'], [14, 'crocgivre'], [20, 'morsure'], [27, 'rayonglace'], [34, 'blizzard']],
  sp: { plan: 'quad', s: 0.66, body: '#e2f2f8', belly: '#ffffff', accent: '#8ccaea', ears: 'point', earLen: 1.15, innerEar: '#a8d4f0', tail: 'fluffy', snout: 0.7, head: 1.12, eyes: 'round', iris: '#3a7ac8' } });
S('frimastoc', 'Frimastoc', ['glace', 'sol'], [90, 100, 90, 60, 70, 60], { rate: 60, xp: 178,
  learn: [[1, 'crocgivre'], [1, 'pelle'], [28, 'seisme'], [34, 'rayonglace'], [40, 'blizzard'], [46, 'rocboulet']],
  sp: { plan: 'quad', s: 1.05, bw: 1.3, bh: 1.15, body: '#9cbaca', belly: '#e2eef4', accent: '#ccf2ff', back: 'crystals', horn: 'double', hornColor: '#f2f8ff', eyes: 'angry', mouth: 'fang', leg: 0.8, legW: 1.4, snout: 0.8 } });
S('banquifoc', 'Banquifoc', ['glace', 'eau'], [75, 65, 70, 80, 80, 55], { rate: 75, xp: 166, desc: 'Il glisse sur le ventre plus vite qu\'il ne court.',
  learn: [[1, 'poudreuse'], [1, 'bulles'], [12, 'picpic'], [18, 'vague'], [26, 'rayonglace'], [34, 'queuemarine'], [42, 'blizzard']],
  sp: { plan: 'biped', s: 0.9, body: '#3a4a6c', belly: '#f2f8ff', beak: true, hornColor: '#f2b232', crest: 2, accent: '#f2c232', eyes: 'round', arm: 0.8, armW: 1.2, leg: 0.6 } });

// ---- Feu / Acier / Ténèbres ----
S('fournelle', 'Fournelle', ['feu'], [45, 50, 45, 65, 50, 55], { rate: 190, xp: 62, evo: [28, 'volcanor'], desc: 'Il vit près des sources chaudes et ronronne comme une bouilloire.',
  learn: [[1, 'braise'], [1, 'grondement'], [9, 'rouefeu'], [15, 'feufolet'], [21, 'crocfeu'], [28, 'jetflamme']],
  sp: { plan: 'blob', s: 0.62, body: '#e45c3a', belly: '#ffd282', accent: '#ffb030', accent2: '#fff2a0', flameTop: true, eyes: 'round', arms: true, cheeks: true, cheek: '#ffb060' } });
S('volcanor', 'Volcanor', ['feu', 'roche'], [80, 110, 90, 80, 70, 60], { rate: 50, xp: 180,
  learn: [[1, 'crocfeu'], [1, 'jetpierre'], [28, 'eboulis'], [34, 'jetflamme'], [40, 'rocboulet'], [46, 'fournaise']],
  sp: { plan: 'biped', s: 1.12, bw: 1.25, body: '#6c4c42', belly: '#c09070', accent: '#ff7a30', accent2: '#ffd060', back: 'flame', pattern: 'spots', eyes: 'angry', iris: '#ffb030', armW: 1.4, legW: 1.3, mouth: 'fang' } });
S('nocturon', 'Nocturon', ['tenebres', 'vol'], [55, 60, 42, 55, 42, 81], { rate: 190, xp: 81, evo: [30, 'corbonuit'], desc: 'Il chasse les objets brillants pendant la nuit.',
  learn: [[1, 'picpic'], [1, 'grondement'], [9, 'morsure'], [14, 'tornade'], [20, 'coupaile'], [26, 'vibronuit'], [33, 'rafale']],
  sp: { plan: 'bird', s: 0.72, body: '#3c3c5a', belly: '#8a8aaa', wing: '#4c4c72', accent: '#6a5aa2', hornColor: '#f2c242', crest: 2, eyes: 'round', iris: '#f0c030' } });
S('corbonuit', 'Corbonuit', ['tenebres', 'vol'], [80, 105, 60, 85, 60, 100], { rate: 45, xp: 187,
  learn: [[1, 'morsure'], [1, 'coupaile'], [30, 'vibronuit'], [36, 'machnoire'], [42, 'pique'], [48, 'machination']],
  sp: { plan: 'bird', s: 1.02, wings: 1.3, body: '#2c2c42', belly: '#585878', wing: '#3a3a5a', accent: '#5c3c72', hornColor: '#f2c242', headMask: true, crest: 3, eyes: 'angry', iris: '#ff4040' } });

// ---- Combat ----
S('poingris', 'Poingris', ['combat'], [50, 80, 50, 35, 45, 60], { rate: 180, xp: 61, evo: [28, 'colossaing'], desc: 'Il s\'entraîne en frappant les rochers jusqu\'au coucher du soleil.',
  learn: [[1, 'poing'], [1, 'grondement'], [7, 'fulgur'], [13, 'balayette'], [19, 'gonflette'], [24, 'uppercut'], [32, 'frappecolo']],
  sp: { plan: 'biped', s: 0.72, body: '#bab2aa', belly: '#eadaca', accent: '#d44444', claws: true, eyes: 'angry', mouth: 'line', head: 1.05, armW: 1.2 } });
S('colossaing', 'Colossaing', ['combat'], [90, 125, 80, 50, 70, 65], { rate: 45, xp: 193,
  learn: [[1, 'balayette'], [1, 'gonflette'], [28, 'uppercut'], [34, 'eboulis'], [40, 'frappecolo'], [46, 'seisme']],
  sp: { plan: 'biped', s: 1.1, bw: 1.32, body: '#aa9282', belly: '#e2cab4', accent: '#c43232', claws: true, eyes: 'angry', mouth: 'line', armW: 1.65, legW: 1.4, head: 0.82, crest: 1 } });

// ---- Dragon ----
S('dracolin', 'Dracolin', ['dragon'], [41, 64, 45, 50, 50, 50], { rate: 45, xp: 60, evo: [30, 'dracomir'], desc: 'Il mue plusieurs fois par an. Sa peau ancienne brille comme du verre.',
  learn: [[1, 'charge'], [1, 'grondement'], [8, 'souffledraco'], [15, 'morsure'], [22, 'griffedraco'], [30, 'dansedraco'], [38, 'coleredraco']],
  sp: { plan: 'serpent', s: 0.66, body: '#6c8ae2', belly: '#f2eada', horn: 'single', hornColor: '#f2f2ff', ears: 'fin', earLen: 0.8, accent: '#f2f2ff', eyes: 'round', eyeSize: 1.1 } });
S('dracomir', 'Dracomir', ['dragon'], [61, 84, 65, 70, 70, 70], { rate: 45, xp: 147, evo: [48, 'wyvernor'],
  learn: [[1, 'souffledraco'], [1, 'morsure'], [30, 'griffedraco'], [36, 'dansedraco'], [42, 'coleredraco']],
  sp: { plan: 'serpent', s: 0.92, wings: 0.95, wing: '#a4c4ff', body: '#5272d2', belly: '#eae2cc', horn: 'double', hornColor: '#f2f2ff', ears: 'fin', accent: '#d8e4ff', eyes: 'round', iris: '#3a3a9a' } });
S('wyvernor', 'Wyvernor', ['dragon', 'vol'], [91, 134, 95, 100, 100, 80], { rate: 45, xp: 270,
  learn: [[1, 'griffedraco'], [1, 'coupaile'], [48, 'coleredraco'], [52, 'pique'], [56, 'seisme']],
  sp: { plan: 'biped', s: 1.15, bw: 1.2, body: '#e49444', belly: '#f8e2a2', wings: 1.4, wing: '#3c7282', horn: 'double', hornColor: '#f2e8d2', tail: 'thick', eyes: 'angry', mouth: 'fang', antenna: true, head: 0.92, armW: 1.2 } });

// ---- Divers ----
S('ronflou', 'Ronflou', ['normal'], [160, 110, 65, 65, 110, 30], { rate: 25, xp: 189, desc: 'Il dort au milieu des chemins. Rien ne le réveille, sauf l\'odeur des baies.',
  learn: [[1, 'charge'], [1, 'soin'], [12, 'coupboule'], [20, 'megaplaque'], [28, 'aiguisage'], [36, 'belier'], [44, 'seisme']],
  sp: { plan: 'blob', s: 1.05, bw: 1.3, bh: 1.12, body: '#4c6c7a', belly: '#f2ead2', eyes: 'sleepy', dark: '#20303a', ears: 'point', earLen: 0.35, innerEar: '#4c6c7a', mouth: 'smile', arms: true } });
S('orageon', 'Orageon', ['elec', 'vol'], [90, 90, 85, 125, 90, 100], { rate: 3, xp: 261, desc: 'On ne l\'aperçoit qu\'au cœur des orages, perché sur les falaises.',
  learn: [[1, 'tornade'], [1, 'etincelle'], [40, 'foudre'], [45, 'rafale'], [50, 'orage'], [55, 'pique']],
  sp: { plan: 'bird', s: 1.08, wings: 1.3, body: '#f2d242', belly: '#fff2a2', accent: '#323252', wing: '#f8e272', hornColor: '#f8f0d0', crest: 4, eyes: 'angry', beakLen: 1.2 } });
S('ambrion', 'Ambrion', ['dragon', 'psy'], [100, 100, 100, 120, 110, 110], { rate: 3, xp: 306, desc: 'Le gardien légendaire d\'Ambrevale. Ses ailes brillent comme de l\'ambre au soleil couchant.',
  learn: [[1, 'souffledraco'], [1, 'pensee'], [50, 'psyonde'], [55, 'coleredraco'], [60, 'voile'], [65, 'eclatlune']],
  sp: { plan: 'biped', s: 1.22, bw: 1.1, body: '#f2c272', belly: '#fff4da', wings: 1.55, wing: '#ff9c42', horn: 'double', hornColor: '#fff8e2', tail: 'flame', accent: '#ffe282', accent2: '#ffffff', eyes: 'glow', glow: '#ffffff', head: 0.92, crest: 2 } });

export const SPECIES = SP;
export const SPECIES_LIST = Object.values(SP);
export function species(id) { return SP[id]; }
