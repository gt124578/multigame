// Modèles prêts à l'emploi (budget, facture, relevé de notes, planning, présence, heures, tâches) :
// chaque modèle remplit un classeur neuf avec ses formules, sa mise en forme et sa mise en page.

import { Classeur } from './classeur.js';

const VERT = '#1f7a4d', VERT_CLAIR = '#e2efda', GRIS = '#f2f2f2', BLEU = '#ddebf7';
const id = () => Math.random().toString(36).slice(2, 9);

function base(nom) {
  const c = Classeur.nouveau();
  c.nomFichier = nom + '.xlsx';
  return c;
}
const ecrire = (c, f, r, col, lignes) => lignes.forEach((l, i) => l.forEach((v, k) => { if (v !== null && v !== undefined && v !== '') c.saisir(f, r + i, col + k, String(v)); }));
const titre = (c, f, r, col, t, taille = 24) => {
  c.saisir(f, r, col, t); c.style(f, r, col, { gras: true, taille, couleur: VERT });
  const h = c.feuilles[f].hauteurs; h[r] = Math.max(h[r] || 0, Math.round(taille * 1.5));
};
const surPlage = (c, f, r1, c1, r2, c2, st) => { for (let r = r1; r <= r2; r++) for (let k = c1; k <= c2; k++) c.style(f, r, k, st); };
const formatPlage = (c, f, r1, c1, r2, c2, z) => { for (let r = r1; r <= r2; r++) for (let k = c1; k <= c2; k++) c.format(f, r, k, z); };
const EUROS = '#,##0.00 €';

export const MODELES = [
  { cle: 'budget', nom: 'Budget mensuel', desc: 'Revenus, dépenses par catégorie, prévu / réel, écarts en couleur et graphique des dépenses.', icone: '💶' },
  { cle: 'facture', nom: 'Facture', desc: 'En-tête, client, lignes avec quantité et prix, total HT, TVA et TTC, prête à imprimer.', icone: '🧾' },
  { cle: 'notes', nom: 'Relevé de notes', desc: 'Élèves × évaluations avec coefficients : moyennes pondérées, rang, appréciation, moyennes de classe.', icone: '🎓' },
  { cle: 'planning', nom: 'Planning de la semaine', desc: 'Du lundi au dimanche, de 8 h à 19 h, par demi-heure.', icone: '🗓' },
  { cle: 'presence', nom: 'Liste de présence', desc: 'Noms × dates, P / A / R au choix dans une liste, totaux et absences en rouge.', icone: '✅' },
  { cle: 'heures', nom: 'Feuille d\'heures', desc: 'Arrivée, pause, départ : heures du jour, total de la semaine et heures supplémentaires.', icone: '⏱' },
  { cle: 'taches', nom: 'Liste de tâches', desc: 'Tâche, responsable, échéance, statut et priorité ; retards en rouge, tâches finies grisées.', icone: '📋' },
  { cle: 'emprunt', nom: 'Tableau d\'amortissement', desc: 'Emprunt à échéances constantes : mensualité, assurance, intérêts et capital à chaque échéance, coût total du crédit.', icone: '🏦', groupe: 'finance' },
  { cle: 'projet', nom: 'Rentabilité d\'un projet', desc: 'Flux sur 10 ans : VAN, TRI, TRI modifié, délai de récupération actualisé, indice de profitabilité.', icone: '📈', groupe: 'finance' },
  { cle: 'resultat', nom: 'Compte de résultat', desc: 'N et N-1, soldes intermédiaires (EBE, résultat d\'exploitation, net), variations et graphique en cascade.', icone: '📊', groupe: 'finance' },
  { cle: 'mortalite', nom: 'Table de mortalité et commutations', desc: 'qx (Makeham, à remplacer par votre table), lx, Dx, Nx, Cx, Mx, rentes ä(x), assurances A(x), espérance de vie.', icone: '⚱', groupe: 'finance' },
  { cle: 'chainladder', nom: 'Provisions : Chain Ladder', desc: 'Triangle de règlements cumulés, facteurs de développement, charge ultime et provision pour sinistres (IBNR).', icone: '🔺', groupe: 'finance' },
];

export function creerModele(cle) {
  return ({ budget, facture, notes, planning, presence, heures, taches, emprunt, projet, resultat, mortalite, chainladder }[cle] || (() => Classeur.nouveau()))();
}

function budget() {
  const c = base('Budget mensuel'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Budget');
  titre(c, 0, 0, 0, 'Budget mensuel');
  c.saisir(0, 1, 0, 'Mois :'); c.saisir(0, 1, 1, '=AUJOURDHUI()'); c.format(0, 1, 1, 'mmmm yyyy'); c.style(0, 1, 1, { gras: true, align: 'left' });
  ecrire(c, 0, 3, 0, [['Revenus', 'Prévu', 'Réel'], ['Salaire', 2100, 2100], ['Primes', 0, 150], ['Allocations', 120, 120], ['Autres', 0, 0]]);
  c.creerTableau(0, { r1: 3, c1: 0, r2: 7, c2: 2 }, { style: 'TableStyleMedium7', nom: 'Revenus' });
  ecrire(c, 0, 10, 0, [['Dépense', 'Catégorie', 'Prévu', 'Réel'], ['Loyer', 'Logement', 650, 650], ['Électricité, gaz', 'Logement', 90, 104], ['Courses', 'Alimentation', 400, 436], ['Restaurants', 'Loisirs', 60, 45], ['Transports', 'Transport', 75, 75],
    ['Assurances', 'Logement', 45, 45], ['Téléphone, internet', 'Abonnements', 40, 40], ['Santé', 'Santé', 30, 12], ['Sorties, cadeaux', 'Loisirs', 80, 120], ['Épargne', 'Épargne', 300, 300]]);
  c.saisir(0, 10, 4, 'Écart');
  for (let r = 11; r <= 20; r++) c.saisir(0, r, 4, '=[@Réel]-[@Prévu]');
  const t = c.creerTableau(0, { r1: 10, c1: 0, r2: 20, c2: 4 }, { style: 'TableStyleMedium7', nom: 'Dépenses' });
  t.calculees = { 4: '=[@Réel]-[@Prévu]' };
  formatPlage(c, 0, 4, 1, 7, 2, EUROS); formatPlage(c, 0, 11, 2, 20, 4, EUROS);
  // Synthèse
  ecrire(c, 0, 3, 6, [['Synthèse', 'Prévu', 'Réel'], ['Revenus', '=SOMME(Revenus[Prévu])', '=SOMME(Revenus[Réel])'], ['Dépenses', '=SOMME(Dépenses[Prévu])', '=SOMME(Dépenses[Réel])'], ['Reste', '=H5-H6', '=I5-I6']]);
  surPlage(c, 0, 3, 6, 3, 8, { gras: true, fond: VERT, couleur: '#ffffff' });
  surPlage(c, 0, 4, 6, 6, 8, { bordures: { b: 'thin' }, bordCouleur: '#a9d08e' });
  surPlage(c, 0, 6, 6, 6, 8, { gras: true, fond: VERT_CLAIR });
  formatPlage(c, 0, 4, 7, 6, 8, EUROS + ';[Red]-' + EUROS);
  // Par catégorie (pour le graphique)
  ecrire(c, 0, 9, 6, [['Catégorie', 'Réel']]);
  ['Logement', 'Alimentation', 'Loisirs', 'Transport', 'Abonnements', 'Santé', 'Épargne'].forEach((k, i) => { c.saisir(0, 10 + i, 6, k); c.saisir(0, 10 + i, 7, '=SOMME.SI(Dépenses[Catégorie];G' + (11 + i) + ';Dépenses[Réel])'); c.format(0, 10 + i, 7, EUROS); });
  surPlage(c, 0, 9, 6, 9, 7, { gras: true, fond: GRIS, bordures: { b: 'thin' } });
  f.mfc = [{ id: id(), type: 'valeur', plage: 'E12:E21', op: '>', v1: '0', style: { fond: '#ffc7ce', couleur: '#9c0006' } }, { id: id(), type: 'valeur', plage: 'E12:E21', op: '<', v1: '0', style: { fond: '#c6efce', couleur: '#006100' } }];
  Object.assign(f.largeurs, { 0: 160, 1: 110, 2: 100, 3: 100, 4: 100, 5: 24, 6: 120, 7: 110, 8: 110 });
  f.graphiques.push({ id: 'g' + id(), v: 2, type: 'secteurs', variante: 'anneau', plage: 'G10:H17', titre: 'Dépenses réelles', x: 900, y: 216, w: 400, h: 280, legende: 'droite', palette: 'office' });
  f.miseEnPage = { orientation: 'paysage', ajuster: { l: 1, h: 1 } };
  return c;
}

function facture() {
  const c = base('Facture'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Facture');
  ecrire(c, 0, 0, 0, [['Votre entreprise'], ['12 rue de l\'Exemple'], ['75000 Paris'], ['SIRET : 000 000 000 00000'], ['contact@exemple.fr']]);
  c.style(0, 0, 0, { gras: true, taille: 19 });
  titre(c, 0, 0, 3, 'FACTURE', 32); c.style(0, 0, 3, { gras: true, taille: 32, couleur: VERT, align: 'right' }); f.fusions.push({ r1: 0, c1: 3, r2: 0, c2: 4 });
  ecrire(c, 0, 2, 3, [['N° de facture', 'F-2026-001'], ['Date', '=AUJOURDHUI()'], ['Échéance', '=E4+30']]);
  c.format(0, 3, 4, 'dd/mm/yyyy'); c.format(0, 4, 4, 'dd/mm/yyyy');
  surPlage(c, 0, 2, 3, 4, 3, { gras: true, align: 'right' }); surPlage(c, 0, 2, 4, 4, 4, { align: 'right' });
  ecrire(c, 0, 6, 0, [['Facturé à'], ['Nom du client'], ['Adresse'], ['Code postal, ville']]);
  c.style(0, 6, 0, { gras: true, couleur: VERT }); c.style(0, 7, 0, { gras: true });
  ecrire(c, 0, 11, 0, [['Désignation', 'Quantité', 'Prix unitaire HT', 'Remise', 'Total HT']]);
  ecrire(c, 0, 12, 0, [['Prestation ou produit', 1, 100, 0], ['Deuxième ligne', 2, 45, 0.1], ['', '', '', '']]);
  for (let r = 12; r <= 19; r++) c.saisir(0, r, 4, '=SI(B' + (r + 1) + '="";"";B' + (r + 1) + '*C' + (r + 1) + '*(1-D' + (r + 1) + '))');
  surPlage(c, 0, 11, 0, 11, 4, { gras: true, fond: VERT, couleur: '#ffffff' });
  for (let r = 12; r <= 19; r++) surPlage(c, 0, r, 0, r, 4, { bordures: { b: 'thin' }, bordCouleur: '#c9c9c9', ...(r % 2 ? {} : { fond: '#f7faf8' }) });
  formatPlage(c, 0, 12, 2, 19, 2, EUROS); formatPlage(c, 0, 12, 3, 19, 3, '0%'); formatPlage(c, 0, 12, 4, 19, 4, EUROS);
  ecrire(c, 0, 21, 3, [['Total HT', '=SOMME(E13:E20)'], ['TVA 20 %', '=E22*0,2'], ['Total TTC', '=E22+E23']]);
  surPlage(c, 0, 21, 3, 22, 3, { align: 'right' }); formatPlage(c, 0, 21, 4, 23, 4, EUROS);
  surPlage(c, 0, 23, 3, 23, 4, { gras: true, fond: VERT, couleur: '#ffffff', taille: 16 });
  ecrire(c, 0, 26, 0, [['Conditions de paiement : à réception, par virement.'], ['IBAN : FR76 0000 0000 0000 0000 0000 000'], ['En cas de retard, pénalités au taux légal et indemnité forfaitaire de 40 € (art. L441-10 du Code de commerce).']]);
  surPlage(c, 0, 26, 0, 28, 0, { couleur: '#595959', italique: true });
  Object.assign(f.largeurs, { 0: 290, 1: 80, 2: 120, 3: 100, 4: 120 });
  f.miseEnPage = { orientation: 'portrait', ajuster: { l: 1, h: 1 }, zone: 'A1:E29', centrerH: true };
  return c;
}

function notes() {
  const c = base('Relevé de notes'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Notes');
  titre(c, 0, 0, 0, 'Relevé de notes — Classe de …');
  c.saisir(0, 1, 0, 'Trimestre 1 · Matière : …'); c.style(0, 1, 0, { couleur: '#595959' });
  const evals = ['Contrôle 1', 'DM 1', 'Contrôle 2', 'Oral', 'Contrôle 3'], coefs = [2, 1, 2, 1, 3];
  c.saisir(0, 3, 0, 'Coefficient'); coefs.forEach((v, i) => c.saisir(0, 3, 1 + i, String(v)));
  c.saisir(0, 4, 0, 'Élève'); evals.forEach((e, i) => c.saisir(0, 4, 1 + i, e));
  const n = evals.length, cMoy = 1 + n, cRang = cMoy + 1, cApp = cMoy + 2;
  ['Moyenne', 'Rang', 'Appréciation'].forEach((t, i) => c.saisir(0, 4, cMoy + i, t));
  const L = (k) => String.fromCharCode(65 + k);
  const exemples = [['Martin Léa', 14, 16, 12.5, 15, 13], ['Bernard Hugo', 9, 11, 8, 12, 10.5], ['Dubois Chloé', 17, 18, 16, 17, 18.5], ['Thomas Nathan', 11, '', 13, 10, 12], ['Robert Inès', 7.5, 10, 9, 8, 6.5]];
  const n1 = 5, n2 = 34; // lignes des élèves (30 places)
  for (let r = n1; r <= n2; r++) {
    const ex = exemples[r - n1];
    if (ex) ex.forEach((v, i) => { if (v !== '') c.saisir(0, r, i, String(v).replace('.', ',')); });
    const pl = L(1) + (r + 1) + ':' + L(n) + (r + 1), co = '$' + L(1) + '$4:$' + L(n) + '$4';
    c.saisir(0, r, cMoy, `=SI(NB(${pl})=0;"";SOMMEPROD(${pl};${co})/SOMMEPROD((${pl}<>"")*${co}))`);
    c.saisir(0, r, cRang, `=SI(${L(cMoy)}${r + 1}="";"";RANG(${L(cMoy)}${r + 1};$${L(cMoy)}$${n1 + 1}:$${L(cMoy)}$${n2 + 1}))`);
    c.saisir(0, r, cApp, `=SI(${L(cMoy)}${r + 1}="";"";SI(${L(cMoy)}${r + 1}>=16;"Très bien";SI(${L(cMoy)}${r + 1}>=14;"Bien";SI(${L(cMoy)}${r + 1}>=12;"Assez bien";SI(${L(cMoy)}${r + 1}>=10;"Passable";"Insuffisant")))))`);
    c.format(0, r, cMoy, '0.00');
    for (let k = 1; k <= n; k++) c.format(0, r, k, '0.0');
  }
  const rs = n2 + 2;
  [['Moyenne de la classe', 'MOYENNE'], ['Note la plus basse', 'MIN'], ['Note la plus haute', 'MAX']].forEach(([t, fn], i) => {
    c.saisir(0, rs + i, 0, t);
    for (let k = 1; k <= cMoy; k++) { c.saisir(0, rs + i, k, `=SI(NB(${L(k)}${n1 + 1}:${L(k)}${n2 + 1})=0;"";${fn}(${L(k)}${n1 + 1}:${L(k)}${n2 + 1}))`); c.format(0, rs + i, k, '0.00'); }
    surPlage(c, 0, rs + i, 0, rs + i, cMoy, { gras: i === 0, fond: i === 0 ? VERT_CLAIR : GRIS });
  });
  surPlage(c, 0, 3, 0, 3, n, { italique: true, couleur: '#595959', align: 'center' }); c.style(0, 3, 0, { italique: true, couleur: '#595959', align: 'right' });
  surPlage(c, 0, 4, 0, 4, cApp, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center', valign: 'center', renvoi: true });
  for (let r = n1; r <= n2; r++) surPlage(c, 0, r, 0, r, cApp, { bordures: { b: 'thin' }, bordCouleur: '#d9d9d9', ...(r % 2 ? {} : { fond: '#f7faf8' }) });
  surPlage(c, 0, n1, 1, n2, cRang, { align: 'center' }); surPlage(c, 0, n1, cMoy, n2, cMoy, { gras: true });
  f.hauteurs[4] = 36;
  f.mfc = [{ id: id(), type: 'valeur', plage: L(cMoy) + (n1 + 1) + ':' + L(cMoy) + (n2 + 1), op: '<', v1: '10', style: { fond: '#ffc7ce', couleur: '#9c0006' } },
    { id: id(), type: 'valeur', plage: L(cMoy) + (n1 + 1) + ':' + L(cMoy) + (n2 + 1), op: '>=', v1: '14', style: { fond: '#c6efce', couleur: '#006100' } }];
  f.validations = [{ id: id(), plage: 'B6:' + L(n) + (n2 + 1), type: 'decimal', op: 'entre', v1: '0', v2: '20', vides: true, erreur: { style: 'stop', titre: 'Note invalide', texte: 'Une note est comprise entre 0 et 20.' } }];
  Object.assign(f.largeurs, { 0: 170, [cApp]: 110 });
  f.figer = { r: 5, c: 1 };
  f.miseEnPage = { orientation: 'paysage', ajuster: { l: 1, h: 0 }, titresLignes: '5:5' };
  return c;
}

function planning() {
  const c = base('Planning'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Semaine');
  titre(c, 0, 0, 0, 'Planning de la semaine');
  c.saisir(0, 1, 0, 'Du'); c.style(0, 1, 0, { align: 'right' }); c.saisir(0, 1, 1, '=AUJOURDHUI()-JOURSEM(AUJOURDHUI();3)'); c.format(0, 1, 1, 'dd/mm/yyyy'); c.style(0, 1, 1, { gras: true, align: 'left' });
  const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  c.saisir(0, 3, 0, 'Heure');
  jours.forEach((j, i) => { c.saisir(0, 3, 1 + i, j); c.saisir(0, 4, 1 + i, '=$B$2+' + i); c.format(0, 4, 1 + i, 'dd/mm'); });
  surPlage(c, 0, 3, 0, 3, 7, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center' });
  surPlage(c, 0, 4, 0, 4, 7, { fond: VERT_CLAIR, align: 'center', couleur: '#375623' });
  let r = 5;
  for (let h = 8; h < 19; h += 0.5, r++) {
    c.saisir(0, r, 0, Math.floor(h) + ':' + (h % 1 ? '30' : '00'));
    surPlage(c, 0, r, 0, r, 7, { bordures: { b: h % 1 ? 'thin' : 'dotted', d: 'thin' }, bordCouleur: '#c9c9c9' });
    surPlage(c, 0, r, 6, r, 7, { fond: GRIS });
  }
  surPlage(c, 0, 5, 0, r - 1, 0, { couleur: '#595959', align: 'center' });
  Object.assign(f.largeurs, { 0: 60, 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 110, 7: 110 });
  f.figer = { r: 5, c: 1 };
  f.miseEnPage = { orientation: 'paysage', ajuster: { l: 1, h: 1 }, quadrillage: false };
  return c;
}

function presence() {
  const c = base('Liste de présence'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Présence');
  titre(c, 0, 0, 0, 'Liste de présence');
  c.saisir(0, 1, 0, 'P = présent · A = absent · R = retard'); c.style(0, 1, 0, { couleur: '#595959', italique: true });
  c.saisir(0, 3, 0, 'Nom'); const nbDates = 10;
  c.saisir(0, 3, 1, '=AUJOURDHUI()'); for (let k = 2; k <= nbDates; k++) c.saisir(0, 3, k, '=SERIE.JOUR.OUVRE(' + String.fromCharCode(64 + k) + '4;1)');
  for (let k = 1; k <= nbDates; k++) c.format(0, 3, k, 'dd/mm');
  const L = (k) => String.fromCharCode(65 + k);
  const cP = nbDates + 1, cA = nbDates + 2, cR = nbDates + 3;
  c.saisir(0, 3, cP, 'Présences'); c.saisir(0, 3, cA, 'Absences'); c.saisir(0, 3, cR, 'Retards');
  ['Martin Léa', 'Bernard Hugo', 'Dubois Chloé'].forEach((nm, i) => c.saisir(0, 4 + i, 0, nm));
  c.saisir(0, 4, 1, 'P'); c.saisir(0, 5, 1, 'A'); c.saisir(0, 6, 1, 'R');
  for (let r = 4; r < 34; r++) {
    const pl = '$B' + (r + 1) + ':$' + L(nbDates) + (r + 1);
    const si = (x) => '=SI($A' + (r + 1) + '="";"";' + x + ')';
    c.saisir(0, r, cP, si('NB.SI(' + pl + ';"P")+NB.SI(' + pl + ';"R")')); c.saisir(0, r, cA, si('NB.SI(' + pl + ';"A")')); c.saisir(0, r, cR, si('NB.SI(' + pl + ';"R")'));
    surPlage(c, 0, r, 0, r, cR, { bordures: { b: 'thin', d: 'thin' }, bordCouleur: '#d9d9d9' });
  }
  surPlage(c, 0, 3, 0, 3, cR, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center' });
  surPlage(c, 0, 4, 1, 33, cR, { align: 'center' });
  f.validations = [{ id: id(), plage: 'B5:' + L(nbDates) + '34', type: 'liste', liste: 'P;A;R', vides: true, erreur: { style: 'stop', texte: 'Écrivez P, A ou R.' } }];
  f.mfc = [{ id: id(), type: 'valeur', plage: 'B5:' + L(nbDates) + '34', op: '=', v1: 'A', style: { fond: '#ffc7ce', couleur: '#9c0006', gras: true } },
    { id: id(), type: 'valeur', plage: 'B5:' + L(nbDates) + '34', op: '=', v1: 'R', style: { fond: '#ffeb9c', couleur: '#9c5700' } },
    { id: id(), type: 'valeur', plage: 'B5:' + L(nbDates) + '34', op: '=', v1: 'P', style: { couleur: '#006100' } }];
  f.largeurs[0] = 170; for (let k = 1; k <= nbDates; k++) f.largeurs[k] = 54;
  f.figer = { r: 4, c: 1 };
  f.miseEnPage = { orientation: 'paysage', ajuster: { l: 1, h: 0 }, titresLignes: '4:4' };
  return c;
}

function heures() {
  const c = base('Feuille d\'heures'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Heures');
  titre(c, 0, 0, 0, 'Feuille d\'heures');
  ecrire(c, 0, 1, 0, [['Nom :', ''], ['Heures prévues / sem.', '35:00']]);
  c.format(0, 2, 1, '[h]:mm'); c.style(0, 2, 1, { gras: true });
  ecrire(c, 0, 4, 0, [['Date', 'Arrivée', 'Début pause', 'Fin pause', 'Départ', 'Heures du jour']]);
  c.saisir(0, 5, 0, '=AUJOURDHUI()-JOURSEM(AUJOURDHUI();3)');
  for (let i = 1; i < 7; i++) c.saisir(0, 5 + i, 0, '=A' + (5 + i) + '+1');
  [['8:30', '12:00', '13:00', '17:30'], ['8:30', '12:15', '13:15', '18:00'], ['9:00', '12:30', '13:30', '17:00']].forEach((l, i) => l.forEach((v, k) => c.saisir(0, 5 + i, 1 + k, v)));
  for (let r = 5; r <= 11; r++) {
    c.format(0, r, 0, 'dddd dd/mm');
    for (let k = 1; k <= 4; k++) c.format(0, r, k, 'hh:mm');
    c.saisir(0, r, 5, `=SI(OU(B${r + 1}="";E${r + 1}="");"";(E${r + 1}-B${r + 1})-(D${r + 1}-C${r + 1}))`); c.format(0, r, 5, '[h]:mm');
    surPlage(c, 0, r, 0, r, 5, { bordures: { b: 'thin' }, bordCouleur: '#d9d9d9', ...(r >= 10 ? { fond: GRIS } : {}) });
  }
  ecrire(c, 0, 13, 4, [['Total semaine', '=SOMME(F6:F12)'], ['Heures sup.', '=MAX(0;F14-B3)'], ['Heures manquantes', '=MAX(0;B3-F14)']]);
  formatPlage(c, 0, 13, 5, 15, 5, '[h]:mm'); surPlage(c, 0, 13, 4, 15, 4, { align: 'right' });
  surPlage(c, 0, 13, 4, 13, 5, { gras: true, fond: VERT_CLAIR });
  surPlage(c, 0, 4, 0, 4, 5, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center' });
  surPlage(c, 0, 5, 1, 11, 5, { align: 'center' });
  f.mfc = [{ id: id(), type: 'valeur', plage: 'F15', op: '>', v1: '0', style: { couleur: '#c00000', gras: true } }];
  Object.assign(f.largeurs, { 0: 160, 1: 90, 2: 100, 3: 90, 4: 130, 5: 120 });
  f.miseEnPage = { orientation: 'portrait', ajuster: { l: 1, h: 1 } };
  return c;
}

function taches() {
  const c = base('Liste de tâches'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Tâches');
  titre(c, 0, 0, 0, 'Liste de tâches');
  c.saisir(0, 1, 0, '=NB.SI(Tâches[Statut];"Terminé")&" terminée(s) sur "&NBVAL(Tâches[Tâche])'); c.style(0, 1, 0, { couleur: '#595959' });
  ecrire(c, 0, 3, 0, [['Tâche', 'Responsable', 'Échéance', 'Statut', 'Priorité', 'Notes'], ['Préparer la réunion', 'Claire', '=AUJOURDHUI()+2', 'En cours', 'Haute', ''], ['Envoyer les devis', 'Marc', '=AUJOURDHUI()-1', 'À faire', 'Normale', ''], ['Mettre à jour le site', 'Léa', '=AUJOURDHUI()+10', 'À faire', 'Basse', ''], ['Commander les fournitures', 'Marc', '=AUJOURDHUI()-3', 'Terminé', 'Normale', '']]);
  const t = c.creerTableau(0, { r1: 3, c1: 0, r2: 7, c2: 5 }, { style: 'TableStyleMedium7', nom: 'Tâches' });
  void t;
  for (let r = 4; r <= 7; r++) c.format(0, r, 2, 'dd/mm/yyyy');
  f.validations = [{ id: id(), plage: 'D5:D200', type: 'liste', liste: 'À faire;En cours;Terminé', vides: true, erreur: { style: 'stop' } }, { id: id(), plage: 'E5:E200', type: 'liste', liste: 'Haute;Normale;Basse', vides: true, erreur: { style: 'stop' } }];
  f.mfc = [{ id: id(), type: 'formule', plage: 'A5:F200', formule: '=$D5="Terminé"', style: { couleur: '#a6a6a6' }, arreter: true },
    { id: id(), type: 'formule', plage: 'C5:C200', formule: '=ET($C5<>"";$C5<AUJOURDHUI();$D5<>"Terminé")', style: { fond: '#ffc7ce', couleur: '#9c0006', gras: true } },
    { id: id(), type: 'valeur', plage: 'E5:E200', op: '=', v1: 'Haute', style: { couleur: '#c00000', gras: true } }];
  Object.assign(f.largeurs, { 0: 240, 1: 120, 2: 100, 3: 100, 4: 90, 5: 240 });
  f.figer = { r: 4, c: 0 };
  return c;
}

const L = (k) => { let t = ''; k++; while (k > 0) { const m = (k - 1) % 26; t = String.fromCharCode(65 + m) + t; k = Math.floor((k - 1) / 26); } return t; };
const PCT = '0.00%';

function emprunt() {
  const c = base('Tableau d\'amortissement'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Emprunt');
  titre(c, 0, 0, 0, 'Tableau d\'amortissement d\'un emprunt');
  ecrire(c, 0, 2, 0, [['Montant emprunté', 200000], ['Taux annuel', '3,5%'], ['Durée (années)', 20], ['Échéances par an', 12], ['Première échéance', '=DATE(ANNEE(AUJOURDHUI());MOIS(AUJOURDHUI())+1;5)'], ['Assurance (% du capital par an)', '0,30%']]);
  c.format(0, 2, 1, EUROS); c.format(0, 3, 1, PCT); c.format(0, 6, 1, 'dd/mm/yyyy'); c.format(0, 7, 1, PCT);
  surPlage(c, 0, 2, 1, 7, 1, { fond: '#fff2cc', bordures: { b: 'thin' }, bordCouleur: '#d6c26e' });
  ecrire(c, 0, 2, 3, [['Échéance hors assurance', '=VPM(B4/B6;B5*B6;-B3)'], ['Assurance par échéance', '=B3*B8/B6'], ['Échéance totale', '=E3+E4'], ['Total des intérêts', '=SOMME(E12:E371)'], ['Total de l\'assurance', '=E4*B5*B6'], ['Coût total du crédit', '=E6+E7']]);
  formatPlage(c, 0, 2, 4, 7, 4, EUROS);
  surPlage(c, 0, 2, 3, 7, 3, { align: 'right' }); surPlage(c, 0, 4, 3, 4, 4, { gras: true, fond: VERT_CLAIR }); surPlage(c, 0, 7, 3, 7, 4, { gras: true });
  ecrire(c, 0, 10, 0, [['N°', 'Date', 'Capital restant dû', 'Échéance', 'Intérêts', 'Capital remboursé', 'Capital restant après']]);
  surPlage(c, 0, 10, 0, 10, 6, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center', renvoi: true });
  for (let r = 11; r < 371; r++) {
    const k = r + 1, si = (x) => '=SI(A' + k + '="";"";' + x + ')';
    c.saisir(0, r, 0, r === 11 ? '=SI($B$5*$B$6>=1;1;"")' : '=SI(A' + r + '="";"";SI(A' + r + '+1<=$B$5*$B$6;A' + r + '+1;""))');
    c.saisir(0, r, 1, si('MOIS.DECALER($B$7;(A' + k + '-1)*12/$B$6)'));
    c.saisir(0, r, 2, si(r === 11 ? '$B$3' : 'G' + r));
    c.saisir(0, r, 3, si('$E$3'));
    c.saisir(0, r, 4, si('C' + k + '*$B$4/$B$6'));
    c.saisir(0, r, 5, si('D' + k + '-E' + k));
    c.saisir(0, r, 6, si('MAX(0;C' + k + '-F' + k + ')'));
    c.format(0, r, 1, 'dd/mm/yyyy'); for (let q = 2; q <= 6; q++) c.format(0, r, q, EUROS);
  }
  surPlage(c, 0, 11, 0, 370, 0, { align: 'center', couleur: '#595959' });
  f.mfc = [{ id: id(), type: 'formule', plage: 'A12:G371', formule: '=ET($A12<>"";MOD($A12;$B$6)=0)', style: { fond: VERT_CLAIR } }];
  Object.assign(f.largeurs, { 0: 220, 1: 100, 2: 140, 3: 130, 4: 120, 5: 140, 6: 150 });
  f.hauteurs[10] = 36;
  f.figer = { r: 11, c: 0 };
  f.miseEnPage = { orientation: 'portrait', ajuster: { l: 1, h: 0 }, titresLignes: '11:11' };
  return c;
}

function projet() {
  const c = base('Rentabilité d\'un projet'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Projet');
  titre(c, 0, 0, 0, 'Rentabilité d\'un investissement');
  ecrire(c, 0, 2, 0, [['Taux d\'actualisation', '8%'], ['Taux de réinvestissement', '5%']]);
  c.format(0, 2, 1, PCT); c.format(0, 3, 1, PCT);
  surPlage(c, 0, 2, 1, 3, 1, { fond: '#fff2cc' });
  ecrire(c, 0, 5, 0, [['Année', 'Investissement', 'Recettes', 'Dépenses', 'Flux net', 'Flux actualisé', 'Cumul actualisé']]);
  surPlage(c, 0, 5, 0, 5, 6, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center' });
  for (let i = 0; i <= 10; i++) {
    const r = 6 + i, k = r + 1;
    c.saisir(0, r, 0, String(i));
    if (i === 0) c.saisir(0, r, 1, '-150000');
    if (i === 5) c.saisir(0, r, 1, '-20000');
    if (i > 0) { c.saisir(0, r, 2, String(Math.round(40000 * Math.pow(1.04, i - 1)))); c.saisir(0, r, 3, String(Math.round(15000 * Math.pow(1.02, i - 1)))); }
    c.saisir(0, r, 4, '=B' + k + '+C' + k + '-D' + k);
    c.saisir(0, r, 5, '=E' + k + '/(1+$B$3)^A' + k);
    c.saisir(0, r, 6, '=SOMME($F$7:F' + k + ')');
    for (let q = 1; q <= 6; q++) c.format(0, r, q, '#,##0 €;[Red]-#,##0 €');
  }
  surPlage(c, 0, 6, 0, 16, 0, { align: 'center' });
  ecrire(c, 0, 18, 0, [['Valeur actuelle nette (VAN)', '=VAN(B3;E8:E17)+E7'], ['Taux de rentabilité interne (TRI)', '=TRI(E7:E17)'], ['TRI modifié', '=TRI.MODIFIE(E7:E17;B3;B4)'],
    ['Délai de récupération actualisé (années)', '=SIERREUR(INDEX(A7:A17;EQUIV(VRAI;G7:G17>=0;0));"au-delà de 10 ans")'], ['Indice de profitabilité', '=1+B19/-(B7+B12/(1+B3)^5)']]);
  c.format(0, 18, 1, '#,##0 €;[Red]-#,##0 €'); c.format(0, 19, 1, PCT); c.format(0, 20, 1, PCT); c.format(0, 22, 1, '0.00');
  surPlage(c, 0, 18, 0, 22, 0, { gras: true }); surPlage(c, 0, 18, 1, 22, 1, { fond: VERT_CLAIR, gras: true });
  f.mfc = [{ id: id(), type: 'valeur', plage: 'G7:G17', op: '>=', v1: '0', style: { fond: '#c6efce', couleur: '#006100' } }, { id: id(), type: 'barres', plage: 'E7:E17', couleur: '#5b9bd5' }];
  Object.assign(f.largeurs, { 0: 270, 1: 120, 2: 110, 3: 110, 4: 110, 5: 120, 6: 130 });
  return c;
}

function resultat() {
  const c = base('Compte de résultat'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Résultat');
  titre(c, 0, 0, 0, 'Compte de résultat simplifié');
  ecrire(c, 0, 2, 0, [['', 'Exercice N', 'Exercice N-1', 'Variation', 'Variation %']]);
  surPlage(c, 0, 2, 0, 2, 4, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center' });
  // [libellé, N, N-1, type] : 'p' produit, 'c' charge, 't' solde (formule)
  const lignes = [['Chiffre d\'affaires', 850000, 790000, 'p'], ['Achats consommés', 310000, 295000, 'c'], ['Charges externes', 120000, 112000, 'c'], ['Impôts et taxes', 15000, 14000, 'c'],
    ['Charges de personnel', 240000, 228000, 'c'], ['Excédent brut d\'exploitation (EBE)', '=B4-B5-B6-B7-B8', '=C4-C5-C6-C7-C8', 't'], ['Dotations aux amortissements', 45000, 42000, 'c'],
    ['Résultat d\'exploitation', '=B9-B10', '=C9-C10', 't'], ['Résultat financier', -8000, -9500, 'p'], ['Résultat courant avant impôts', '=B11+B12', '=C11+C12', 't'], ['Impôt sur les sociétés', '=MAX(0;B13)*25%', '=MAX(0;C13)*25%', 'c'], ['Résultat net', '=B13-B14', '=C13-C14', 't']];
  lignes.forEach(([lib, n, n1, t], i) => {
    const r = 3 + i, k = r + 1;
    c.saisir(0, r, 0, lib); c.saisir(0, r, 1, String(n)); c.saisir(0, r, 2, String(n1));
    c.saisir(0, r, 3, '=B' + k + '-C' + k); c.saisir(0, r, 4, '=SI(C' + k + '=0;"";(B' + k + '-C' + k + ')/ABS(C' + k + '))');
    for (let q = 1; q <= 3; q++) c.format(0, r, q, '#,##0 €;[Red]-#,##0 €'); c.format(0, r, 4, '+0.0%;[Red]-0.0%;0.0%');
    if (t === 't') surPlage(c, 0, r, 0, r, 4, { gras: true, fond: VERT_CLAIR, bordures: { h: 'thin' }, bordCouleur: '#a9d08e' });
    else c.style(0, r, 0, { retrait: 1 });
    // Pont pour le graphique en cascade (colonnes G:H) : charges en négatif
    c.saisir(0, r, 6, lib.replace(/ \(EBE\)/, ''));
    c.saisir(0, r, 7, t === 'c' ? '=-B' + k : '=B' + k);
    c.format(0, r, 7, '#,##0 €;[Red]-#,##0 €');
  });
  c.saisir(0, 2, 6, 'Poste'); c.saisir(0, 2, 7, 'Montant N'); surPlage(c, 0, 2, 6, 2, 7, { gras: true, couleur: '#595959' });
  const totaux = {}; lignes.forEach(([, , , t], i) => { totaux[i] = t === 't'; }); totaux[0] = true;
  f.graphiques.push({ id: 'g' + id(), v: 2, type: 'cascade', plage: 'G3:H15', titre: 'Du chiffre d\'affaires au résultat net', x: 20, y: 400, w: 760, h: 320, legende: 'bas', totaux, etiquettes: 'valeur', formatY: '#,##0' });
  Object.assign(f.largeurs, { 0: 260, 1: 120, 2: 120, 3: 110, 4: 100, 5: 24, 6: 220, 7: 110 });
  f.miseEnPage = { orientation: 'paysage', ajuster: { l: 1, h: 1 } };
  return c;
}

function mortalite() {
  const c = base('Table de mortalité'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Commutations');
  titre(c, 0, 0, 0, 'Table de mortalité et nombres de commutation');
  c.saisir(0, 1, 0, 'qx calculé par la loi de Makeham (exemple) : collez votre table (TH 00-02, TF 00-02, TGH05…) dans la colonne C.'); c.style(0, 1, 0, { italique: true, couleur: '#595959' });
  ecrire(c, 0, 2, 0, [['Taux technique', '1,5%'], ['Makeham A', '0,0002'], ['Makeham B', '0,00002'], ['Makeham c', '1,1'], ['l0', 100000]]);
  c.format(0, 2, 1, PCT); surPlage(c, 0, 2, 1, 6, 1, { fond: '#fff2cc' });
  const H = ['x', 'lx', 'qx', 'dx', 'Dx', 'Nx', 'Cx', 'Mx', 'ä(x)', 'A(x)', 'e(x)'];
  ecrire(c, 0, 8, 0, [H]);
  surPlage(c, 0, 8, 0, 8, 10, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center' });
  const d = 9, fin = d + 110; // x = 0 … 110
  for (let x = 0; x <= 110; x++) {
    const r = d + x, k = r + 1, kf = fin + 1;
    c.saisir(0, r, 0, String(x));
    c.saisir(0, r, 1, x === 0 ? '=$B$7' : '=B' + r + '*(1-C' + r + ')');
    c.saisir(0, r, 2, x === 110 ? '1' : '=1-EXP(-$B$4-$B$5/LN($B$6)*$B$6^A' + k + '*($B$6-1))');
    c.saisir(0, r, 3, '=B' + k + '*C' + k);
    c.saisir(0, r, 4, '=B' + k + '*(1+$B$3)^-A' + k);
    c.saisir(0, r, 5, '=SOMME(E' + k + ':E$' + kf + ')');
    c.saisir(0, r, 6, '=D' + k + '*(1+$B$3)^-(A' + k + '+1)');
    c.saisir(0, r, 7, '=SOMME(G' + k + ':G$' + kf + ')');
    c.saisir(0, r, 8, '=SI(E' + k + '=0;"";F' + k + '/E' + k + ')');
    c.saisir(0, r, 9, '=SI(E' + k + '=0;"";H' + k + '/E' + k + ')');
    c.saisir(0, r, 10, x === 110 ? '0' : '=SI(B' + k + '=0;"";SOMME(B' + (k + 1) + ':B$' + kf + ')/B' + k + ')');
    c.format(0, r, 1, '#,##0'); c.format(0, r, 2, '0.000000'); c.format(0, r, 3, '#,##0.0'); for (const q of [4, 5, 6, 7]) c.format(0, r, q, '#,##0.00'); c.format(0, r, 8, '0.0000'); c.format(0, r, 9, '0.0000'); c.format(0, r, 10, '0.00');
  }
  surPlage(c, 0, d, 0, fin, 0, { align: 'center', gras: true });
  // Calculs pour un âge choisi
  ecrire(c, 0, 2, 13, [['Âge', 65], ['Rente viagère à terme d\'avance ä(x)', '=RECHERCHEV(O3;A10:I120;9;FAUX)'], ['Assurance vie entière A(x)', '=RECHERCHEV(O3;A10:J120;10;FAUX)'],
    ['Capital décès assuré', 10000], ['Prime unique', '=O5*O6'], ['Prime annuelle (vie entière)', '=O7/O4'], ['Espérance de vie résiduelle', '=RECHERCHEV(O3;A10:K120;11;FAUX)']]);
  c.format(0, 3, 14, '0.0000'); c.format(0, 4, 14, '0.0000'); c.format(0, 5, 14, EUROS); c.format(0, 6, 14, EUROS); c.format(0, 7, 14, EUROS); c.format(0, 8, 14, '0.0 "ans"');
  surPlage(c, 0, 2, 14, 2, 14, { fond: '#fff2cc' }); surPlage(c, 0, 5, 14, 5, 14, { fond: '#fff2cc' }); surPlage(c, 0, 6, 13, 7, 14, { gras: true });
  f.graphiques.push({ id: 'g' + id(), v: 2, type: 'lignes', plage: 'A9:B120', titre: 'Survivants lx', x: 960, y: 230, w: 420, h: 260, legende: 'aucune' });
  Object.assign(f.largeurs, { 0: 60, 1: 90, 2: 90, 3: 80, 4: 100, 5: 110, 6: 90, 7: 100, 8: 70, 9: 70, 10: 60, 11: 24, 12: 24, 13: 240, 14: 110 });
  f.figer = { r: 9, c: 1 };
  return c;
}

function chainladder() {
  const c = base('Chain Ladder'), f = c.feuilles[0];
  c.renommerFeuille(0, 'Triangle');
  titre(c, 0, 0, 0, 'Provisions pour sinistres : méthode Chain Ladder');
  c.saisir(0, 1, 0, 'Règlements cumulés par année de survenance (lignes) et année de développement (colonnes). Remplacez par vos données.'); c.style(0, 1, 0, { italique: true, couleur: '#595959' });
  const tri = [[3209, 4372, 4411, 4428, 4435, 4456], [3367, 4659, 4696, 4720, 4730], [3871, 5345, 5338, 5420], [4239, 5917, 6020], [4929, 6794], [5217]];
  const n = tri.length, an0 = 2019;
  ecrire(c, 0, 3, 0, [['Survenance', ...Array.from({ length: n }, (_, j) => String(j + 1))]]);
  tri.forEach((l, i) => { c.saisir(0, 4 + i, 0, String(an0 + i)); l.forEach((v, j) => c.saisir(0, 4 + i, 1 + j, String(v))); });
  const r1 = 5, r2 = 4 + n; // lignes Excel 5 à 10
  c.saisir(0, 11, 0, 'Facteurs de développement');
  c.saisir(0, 12, 0, 'Facteurs cumulés jusqu\'à l\'ultime');
  for (let j = 2; j <= n; j++) {
    const a = L(j - 1), b = L(j);
    c.saisir(0, 11, j, `=SOMMEPROD((${b}${r1}:${b}${r2}<>"")*${b}${r1}:${b}${r2})/SOMMEPROD((${b}${r1}:${b}${r2}<>"")*${a}${r1}:${a}${r2})`);
    c.format(0, 11, j, '0.0000');
  }
  for (let j = 1; j <= n; j++) { const cols = []; for (let q = j + 1; q <= n; q++) cols.push(L(q) + '12'); c.saisir(0, 12, j, cols.length ? '=PRODUIT(' + cols.join(';') + ')' : '1'); c.format(0, 12, j, '0.0000'); }
  // Triangle complété
  c.saisir(0, 14, 0, 'Triangle complété'); c.style(0, 14, 0, { gras: true, couleur: VERT });
  ecrire(c, 0, 15, 0, [['Survenance', ...Array.from({ length: n }, (_, j) => String(j + 1)), '', 'Payé à ce jour', 'Charge ultime', 'Provision (IBNR)']]);
  for (let i = 0; i < n; i++) {
    const r = 16 + i, k = r + 1, src = 5 + i;
    c.saisir(0, r, 0, '=A' + src);
    for (let j = 1; j <= n; j++) { const col = L(j); c.saisir(0, r, j, j === 1 ? '=' + col + src : `=SI(${col}${src}<>"";${col}${src};${L(j - 1)}${k}*${col}$12)`); c.format(0, r, j, '#,##0'); }
    c.saisir(0, r, n + 2, `=INDEX(B${src}:${L(n)}${src};NB(B${src}:${L(n)}${src}))`);
    c.saisir(0, r, n + 3, '=' + L(n) + k);
    c.saisir(0, r, n + 4, '=' + L(n + 3) + k + '-' + L(n + 2) + k);
    for (let q = n + 2; q <= n + 4; q++) c.format(0, r, q, '#,##0');
  }
  const rt = 16 + n;
  c.saisir(0, rt, 0, 'Total');
  for (let q = n + 2; q <= n + 4; q++) { c.saisir(0, rt, q, '=SOMME(' + L(q) + '17:' + L(q) + rt + ')'); c.format(0, rt, q, '#,##0'); }
  surPlage(c, 0, rt, 0, rt, n + 4, { gras: true, fond: VERT_CLAIR, bordures: { h: 'thin' } });
  surPlage(c, 0, 3, 0, 3, n, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center' });
  surPlage(c, 0, 15, 0, 15, n + 4, { gras: true, fond: VERT, couleur: '#ffffff', align: 'center', renvoi: true });
  c.style(0, 15, n + 1, { fond: null });
  surPlage(c, 0, 11, 0, 12, 0, { gras: true });
  for (let i = 0; i < n; i++) for (let j = 1; j <= n; j++) c.format(0, 4 + i, j, '#,##0');
  // Les montants projetés (absents du triangle d'origine) en bleu
  f.mfc = [{ id: id(), type: 'formule', plage: 'B17:' + L(n) + (16 + n), formule: '=B5=""', style: { couleur: '#1f6fb5', italique: true } }];
  Object.assign(f.largeurs, { 0: 230, [n + 1]: 24, [n + 2]: 120, [n + 3]: 120, [n + 4]: 120 });
  f.hauteurs[15] = 36;
  return c;
}
