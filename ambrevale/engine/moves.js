// Capacités. cat : P physique, S spéciale, X statut. acc 0 = ne rate jamais.
// fx : effets — st (statut infligé : brn par psn slp frz) + ch (chance %), stat (cibles : {atk:-1}) + self, prio,
//      drain, recoil, heal, crit, multi, flinch, conf.

const M = {};
function m(id, name, type, cat, pow, acc, pp, fx = {}, desc = '') { M[id] = { id, name, type, cat, pow, acc, pp, fx, desc }; }

// Normal
m('charge', 'Charge', 'normal', 'P', 40, 100, 35);
m('griffe', 'Griffure', 'normal', 'P', 40, 100, 35);
m('fulgur', 'Fulgurance', 'normal', 'P', 40, 100, 30, { prio: 1 }, 'Frappe toujours en premier.');
m('coupboule', 'Coup de Tête', 'normal', 'P', 70, 100, 15, { flinch: 30 });
m('belier', 'Bélier', 'normal', 'P', 90, 85, 20, { recoil: 0.25 }, 'Le lanceur subit un peu de recul.');
m('megaplaque', 'Plaquage Lourd', 'normal', 'P', 85, 100, 15, { st: 'par', ch: 30 });
m('hypervoix', 'Hurlement Sonique', 'normal', 'S', 90, 100, 10);
m('grondement', 'Grondement', 'normal', 'X', 0, 100, 40, { stat: { atk: -1 } }, "Baisse l'Attaque de l'ennemi.");
m('fouetqueue', 'Fouette-Queue', 'normal', 'X', 0, 100, 30, { stat: { def: -1 } }, 'Baisse la Défense de l\'ennemi.');
m('cristrident', 'Cri Strident', 'normal', 'X', 0, 85, 40, { stat: { def: -2 } }, 'Baisse beaucoup la Défense.');
m('aiguisage', 'Aiguisage', 'normal', 'X', 0, 0, 20, { self: { atk: 2 } }, "Augmente beaucoup l'Attaque.");
m('soin', 'Récupération', 'normal', 'X', 0, 0, 10, { heal: 0.5 }, 'Rend la moitié des PV.');
m('berceuse', 'Berceuse', 'normal', 'X', 0, 55, 15, { st: 'slp', ch: 100 }, 'Endort l\'ennemi.');
m('vitesse', 'Accélération', 'normal', 'X', 0, 0, 30, { self: { spe: 2 } }, 'Augmente beaucoup la Vitesse.');
m('lutte', 'Lutte', 'normal', 'P', 50, 0, 1, { recoil: 0.25 });
// Feu
m('braise', 'Braise', 'feu', 'S', 40, 100, 25, { st: 'brn', ch: 10 });
m('rouefeu', 'Roue de Feu', 'feu', 'P', 60, 100, 25, { st: 'brn', ch: 10 });
m('crocfeu', 'Crocs Ardents', 'feu', 'P', 65, 95, 15, { st: 'brn', ch: 10, flinch: 10 });
m('jetflamme', 'Jet de Flammes', 'feu', 'S', 90, 100, 15, { st: 'brn', ch: 10 });
m('fournaise', 'Fournaise', 'feu', 'S', 110, 85, 5, { st: 'brn', ch: 30 });
m('feufolet', 'Feu Follet', 'feu', 'X', 0, 85, 15, { st: 'brn', ch: 100 }, "Brûle l'ennemi.");
// Eau
m('bulles', 'Bulles', 'eau', 'S', 40, 100, 30, { stat: { spe: -1 }, ch: 10 });
m('jetdeau', "Jet d'Eau", 'eau', 'S', 40, 100, 25);
m('vague', 'Vague', 'eau', 'S', 65, 100, 20, { stat: { acc: -1 }, ch: 30 });
m('queuemarine', 'Queue Marine', 'eau', 'P', 90, 90, 10);
m('torrent', 'Torrent', 'eau', 'S', 110, 80, 5);
m('pluie', 'Bain de Pluie', 'eau', 'X', 0, 0, 10, { heal: 0.5 }, 'Rend la moitié des PV.');
// Plante
m('liane', 'Fouet Liane', 'plante', 'P', 45, 100, 25);
m('absorb', 'Absorption', 'plante', 'S', 25, 100, 25, { drain: 0.5 }, 'Vole des PV.');
m('megaseve', 'Méga-Sève', 'plante', 'S', 50, 100, 15, { drain: 0.5 }, 'Vole des PV.');
m('feuilles', 'Feuilles Tranchantes', 'plante', 'P', 55, 95, 25, { crit: 1 }, 'Coup critique fréquent.');
m('racines', 'Racines Vives', 'plante', 'S', 75, 100, 10, { drain: 0.5 }, 'Vole des PV.');
m('chloro', 'Rayon Chlorophylle', 'plante', 'S', 100, 95, 10);
m('spores', 'Spores', 'plante', 'X', 0, 75, 15, { st: 'slp', ch: 100 }, 'Endort l\'ennemi.');
m('marteaubois', 'Marteau de Bois', 'plante', 'P', 110, 90, 10, { recoil: 0.33 });
// Électrik
m('etincelle', 'Étincelle', 'elec', 'S', 40, 100, 30, { st: 'par', ch: 10 });
m('crocelec', 'Crocs Éclair', 'elec', 'P', 65, 95, 15, { st: 'par', ch: 10, flinch: 10 });
m('decharge', 'Décharge', 'elec', 'P', 65, 100, 20, { st: 'par', ch: 30 });
m('foudre', 'Coup de Foudre', 'elec', 'S', 90, 100, 15, { st: 'par', ch: 10 });
m('orage', 'Orage', 'elec', 'S', 110, 70, 10, { st: 'par', ch: 30 });
m('ondepara', 'Onde Paralysante', 'elec', 'X', 0, 90, 20, { st: 'par', ch: 100 }, 'Paralyse l\'ennemi.');
// Glace
m('poudreuse', 'Poudreuse', 'glace', 'S', 40, 100, 25, { st: 'frz', ch: 10 });
m('crocgivre', 'Crocs Givrés', 'glace', 'P', 65, 95, 15, { st: 'frz', ch: 10, flinch: 10 });
m('rayonglace', 'Rayon Glacé', 'glace', 'S', 90, 100, 10, { st: 'frz', ch: 10 });
m('blizzard', 'Tempête de Neige', 'glace', 'S', 110, 70, 5, { st: 'frz', ch: 10 });
// Combat
m('poing', 'Coup de Poing', 'combat', 'P', 40, 100, 35);
m('balayette', 'Balayage', 'combat', 'P', 60, 100, 20);
m('uppercut', 'Uppercut', 'combat', 'P', 80, 100, 15, { flinch: 20 });
m('frappecolo', 'Frappe Colossale', 'combat', 'P', 120, 90, 5, { selfAfter: { def: -1, spd: -1 } }, 'Baisse les défenses du lanceur.');
m('gonflette', 'Gonflette', 'combat', 'X', 0, 0, 20, { self: { atk: 1, def: 1 } }, "Augmente l'Attaque et la Défense.");
// Poison
m('dard', 'Dard', 'poison', 'P', 40, 100, 35, { st: 'psn', ch: 30 });
m('acide', 'Acide', 'poison', 'S', 40, 100, 30, { stat: { spd: -1 }, ch: 10 });
m('bombetox', 'Bombe Toxique', 'poison', 'S', 90, 100, 10, { st: 'psn', ch: 30 });
m('poudrepoison', 'Poudre Toxique', 'poison', 'X', 0, 75, 35, { st: 'psn', ch: 100 }, 'Empoisonne l\'ennemi.');
// Sol
m('jetsable', 'Jet de Sable', 'sol', 'X', 0, 100, 15, { stat: { acc: -1 } }, 'Baisse la Précision.');
m('boue', 'Gerbe de Boue', 'sol', 'S', 55, 95, 15, { stat: { acc: -1 }, ch: 100 });
m('pelle', 'Coup de Pelle', 'sol', 'P', 65, 100, 15);
m('seisme', 'Tremblement', 'sol', 'P', 100, 100, 10);
// Vol
m('picpic', 'Picore', 'vol', 'P', 35, 100, 35);
m('tornade', 'Tornade', 'vol', 'S', 40, 100, 35);
m('coupaile', "Coup d'Aile", 'vol', 'P', 60, 100, 35);
m('rafale', 'Rafale', 'vol', 'S', 90, 95, 10);
m('pique', 'Piqué', 'vol', 'P', 120, 100, 15, { recoil: 0.33 });
// Psy
m('pensee', 'Pensée', 'psy', 'S', 50, 100, 25, { conf: 10 });
m('psyonde', 'Onde Mentale', 'psy', 'S', 90, 100, 10, { stat: { spd: -1 }, ch: 10 });
m('hypnose', 'Hypnose', 'psy', 'X', 0, 60, 20, { st: 'slp', ch: 100 }, 'Endort l\'ennemi.');
m('meditation', 'Méditation', 'psy', 'X', 0, 0, 20, { self: { spa: 1, spd: 1 } }, 'Augmente les capacités spéciales.');
m('murmental', 'Mur Mental', 'psy', 'X', 0, 0, 20, { self: { def: 2 } }, 'Augmente beaucoup la Défense.');
// Insecte
m('morsinsecte', "Morsure d'Insecte", 'insecte', 'P', 60, 100, 20);
m('fildesoie', 'Fil de Soie', 'insecte', 'X', 0, 95, 40, { stat: { spe: -2 } }, 'Baisse beaucoup la Vitesse.');
m('essaim', 'Essaim', 'insecte', 'P', 25, 95, 20, { multi: 1 }, 'Frappe 2 à 5 fois.');
m('bourdon', 'Bourdonnement', 'insecte', 'S', 90, 100, 10, { stat: { spd: -1 }, ch: 10 });
// Roche
m('jetpierre', 'Jet de Pierres', 'roche', 'P', 50, 90, 15);
m('eboulis', 'Éboulis', 'roche', 'P', 75, 90, 10, { flinch: 30 });
m('rocboulet', 'Roc-Boulet', 'roche', 'P', 100, 80, 5);
m('armurepierre', 'Armure de Pierre', 'roche', 'X', 0, 0, 20, { self: { def: 2 } }, 'Augmente beaucoup la Défense.');
// Spectre
m('lechouille', 'Léchouille', 'spectre', 'P', 30, 100, 30, { st: 'par', ch: 30 });
m('ombreportee', 'Ombre Portée', 'spectre', 'P', 40, 100, 30, { prio: 1 }, 'Frappe toujours en premier.');
m('bouleombre', "Boule d'Ombre", 'spectre', 'S', 80, 100, 15, { stat: { spd: -1 }, ch: 20 });
m('regardglace', 'Regard Glaçant', 'spectre', 'X', 0, 100, 30, { stat: { spe: -2 } }, 'Baisse beaucoup la Vitesse.');
// Dragon
m('souffledraco', 'Souffle Draconique', 'dragon', 'S', 60, 100, 20, { st: 'par', ch: 30 });
m('griffedraco', 'Griffe de Dragon', 'dragon', 'P', 80, 100, 15);
m('coleredraco', 'Colère du Dragon', 'dragon', 'S', 120, 90, 5);
m('dansedraco', 'Danse Draconique', 'dragon', 'X', 0, 0, 20, { self: { atk: 1, spe: 1 } }, "Augmente l'Attaque et la Vitesse.");
// Ténèbres
m('morsure', 'Morsure', 'tenebres', 'P', 60, 100, 25, { flinch: 30 });
m('coupbas', 'Coup Bas', 'tenebres', 'P', 70, 100, 15, { prio: 1 }, 'Frappe toujours en premier.');
m('machnoire', 'Mâchoire Noire', 'tenebres', 'P', 80, 100, 15, { stat: { def: -1 }, ch: 20 });
m('vibronuit', 'Vibration Nocturne', 'tenebres', 'S', 80, 100, 15, { stat: { acc: -1 }, ch: 20 });
m('machination', 'Machination', 'tenebres', 'X', 0, 0, 20, { self: { spa: 2 } }, "Augmente beaucoup l'Attaque Spéciale.");
// Acier
m('griffefer', 'Griffe de Fer', 'acier', 'P', 50, 95, 35, { selfStat: { atk: 1 }, ch: 10 });
m('tetefer', 'Tête de Fer', 'acier', 'P', 80, 100, 15, { flinch: 30 });
m('rayonacier', "Rayon d'Acier", 'acier', 'S', 90, 100, 10);
m('murfer', 'Mur de Fer', 'acier', 'X', 0, 0, 15, { self: { def: 2 } }, 'Augmente beaucoup la Défense.');
// Fée
m('etoiles', 'Étoiles Filantes', 'fee', 'S', 40, 0, 20, {}, 'Ne rate jamais.');
m('bisou', 'Bisou Fée', 'fee', 'S', 50, 100, 15);
m('eclatlune', 'Éclat Lunaire', 'fee', 'S', 95, 100, 15, { stat: { spa: -1 }, ch: 30 });
m('charme', 'Charme', 'fee', 'X', 0, 100, 20, { stat: { atk: -2 } }, "Baisse beaucoup l'Attaque.");
m('voile', 'Voile Lunaire', 'fee', 'X', 0, 0, 10, { heal: 0.5 }, 'Rend la moitié des PV.');

export const MOVES = M;
export function move(id) { return M[id] || M.charge; }
