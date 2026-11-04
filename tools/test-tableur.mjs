// Tests du Tableur (tableur/) : moteur de formules, interpréteur VBA, lecture/écriture xlsx.
// Lancement : node tools/test-tableur.mjs

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Classeur } from '../tableur/js/classeur.js';
import { Evaluateur, ErreurFormule, decalerFormule, formaterNombre, formaterDate, tokeniser } from '../tableur/js/formules.js';
import { executerMacro, analyserVBA, InterpreteurVBA, creerUDF } from '../tableur/js/vba.js';
import { lireClasseur, ecrireClasseur, lireDocx, nettoyerModuleVBA } from '../tableur/js/xlsxio.js';
import { preparerDonnees, rendreGraphiqueSVG } from '../tableur/js/graphiques.js';
import { decompresserOVBA } from '../tableur/js/vbaextract.js';
import { listerProcedures, insererMacro, supprimerProcedure, ajouterAuProjet, decouperProjet } from '../tableur/js/projetvba.js';

const require = createRequire(import.meta.url);
const XLSX = require('../tableur/lib/xlsx.full.min.js');

let ok = 0, ko = 0;
function test(nom, fn) {
  try { fn(); ok++; }
  catch (e) { ko++; console.error('✖ ' + nom + ' : ' + (e.stack || e.message)); }
}
function egal(a, b, msg = '') {
  const s = (x) => (x instanceof ErreurFormule ? x.code : JSON.stringify(x));
  if (s(a) !== s(b)) throw new Error((msg ? msg + ' : ' : '') + 'attendu ' + s(b) + ', obtenu ' + s(a));
}
function proche(a, b, eps = 1e-9, msg = '') {
  if (typeof a !== 'number' || Math.abs(a - b) > eps) throw new Error((msg ? msg + ' : ' : '') + 'attendu ≈ ' + b + ', obtenu ' + (a instanceof ErreurFormule ? a.code : a));
}

// ---------------------------------------------------------------------------
// Formules
// ---------------------------------------------------------------------------

const c = Classeur.nouveau();
c.ajouterFeuille('Données');
const F = (formule, feuille = 0, r = 0, col = 0) => c.evaluateur.evaluerFormule(formule, feuille, r, col);
const pose = (f, r, col, texte) => c.saisir(f, r, col, texte);

test('arithmétique et priorités', () => {
  egal(F('=1+2*3'), 7); egal(F('=(1+2)*3'), 9); egal(F('=2^3^2'), 64); egal(F('=-2^2'), 4); egal(F('=10%'), 0.1);
  egal(F('=1/0'), new ErreurFormule('#DIV/0!')); egal(F('="a"&"b"&1'), 'ab1'); egal(F('=1=1'), true); egal(F('="A"="a"'), true);
  egal(F('=2<>2'), false); egal(F('=VRAI+1'), 2); egal(F('="12"+1'), 13); egal(F('="x"+1'), new ErreurFormule('#VALUE!'));
});

test('références, plages et autres feuilles', () => {
  pose(0, 0, 0, '10'); pose(0, 1, 0, '20'); pose(0, 2, 0, '30'); pose(0, 0, 1, 'texte'); pose(1, 0, 0, '5');
  egal(F('=A1+A2'), 30); egal(F('=SOMME(A1:A3)'), 60); egal(F('=SUM(A:A)'), 60); egal(F('=SOMME(1:1)'), 10);
  egal(F('=Données!A1*2'), 10); egal(F("='Données'!A1"), 5); egal(F('=Inconnue!A1'), new ErreurFormule('#REF!'));
  pose(0, 1, 5, '=A1:A3'); egal(c.valeur(0, 1, 5), 20, 'intersection implicite'); egal(F('=NB(A1:B3)'), 3); egal(F('=NBVAL(A1:B3)'), 4);
});

test('noms définis et cycles', () => {
  c.definirNom('Taux', 'Feuil1!$A$1');
  egal(F('=Taux*2'), 20); egal(F('=Inconnu+1'), new ErreurFormule('#NAME?'));
  pose(0, 10, 0, '=A12+1'); pose(0, 11, 0, '=A11+1');
  egal(c.valeur(0, 10, 0), new ErreurFormule('#CYCLE!'));
  c.effacer(0, 10, 0, 11, 0);
});

test('fonctions logiques et conditionnelles', () => {
  egal(F('=SI(A1>5;"oui";"non")'), 'oui'); egal(F('=IF(FALSE,1)'), false); egal(F('=SIERREUR(1/0;-1)'), -1);
  egal(F('=ET(VRAI;1;"VRAI")'), true); egal(F('=OU(FAUX;0)'), false); egal(F('=NON(0)'), true);
  egal(F('=SI.CONDITIONS(A1>100;"a";A1>5;"b")'), 'b'); egal(F('=CHOISIR(2;"x";"y")'), 'y'); egal(F('=ESTERREUR(1/0)'), true); egal(F('=ESTNUM(A1)'), true);
  egal(F('=SI.MULTIPLE(2;1;"un";2;"deux";"autre")'), 'deux');
});

test('agrégats, SOMME.SI, NB.SI, SOMMEPROD', () => {
  pose(0, 0, 2, 'a'); pose(0, 1, 2, 'b'); pose(0, 2, 2, 'a');
  egal(F('=SOMME.SI(C1:C3;"a";A1:A3)'), 40); egal(F('=NB.SI(C1:C3;"a")'), 2); egal(F('=NB.SI(A1:A3;">15")'), 2);
  egal(F('=SOMME.SI.ENS(A1:A3;C1:C3;"a";A1:A3;">15")'), 30); egal(F('=MOYENNE.SI(C1:C3;"a";A1:A3)'), 20);
  egal(F('=SOMMEPROD(A1:A3;A1:A3)'), 1400); egal(F('=SOMMEPROD((C1:C3="a")*A1:A3)'), 40);
  egal(F('=MOYENNE(A1:A3)'), 20); egal(F('=MAX(A1:A3;100)'), 100); egal(F('=MIN(A1:A3)'), 10); egal(F('=MEDIANE(1;5;3)'), 3);
  egal(F('=GRANDE.VALEUR(A1:A3;2)'), 20); egal(F('=RANG(20;A1:A3)'), 2); egal(F('=NB.SI(C1:C3;"?")'), 3);
  proche(F('=ECARTYPE(A1:A3)'), 10); proche(F('=ECARTYPEP(A1:A3)'), Math.sqrt(200 / 3)); egal(F('=SOUS.TOTAL(9;A1:A3)'), 60);
});

test('arrondis et mathématiques', () => {
  egal(F('=ARRONDI(2,675;2)'), 2.68); egal(F('=ARRONDI(-1,5;0)'), -2); egal(F('=ARRONDI.SUP(1,21;1)'), 1.3); egal(F('=ARRONDI.INF(-1,29;1)'), -1.2);
  egal(F('=ENT(-1,5)'), -2); egal(F('=TRONQUE(-1,5)'), -1); egal(F('=MOD(-7;3)'), 2); egal(F('=PLAFOND(2,1;0,5)'), 2.5); egal(F('=PLANCHER(2,9;0,5)'), 2.5);
  egal(F('=PUISSANCE(2;10)'), 1024); egal(F('=RACINE(16)'), 4); egal(F('=RACINE(-1)'), new ErreurFormule('#NUM!')); proche(F('=EXP(LN(5))'), 5);
  egal(F('=FACT(5)'), 120); egal(F('=COMBIN(10;3)'), 120); egal(F('=PGCD(12;18)'), 6); egal(F('=PPCM(4;6)'), 12); proche(F('=PI()'), Math.PI);
  egal(F('=PRODUITMAT({1,2;3,4};{1;1})'), [[3], [7]]); proche(F('=DETERMAT({1,2;3,4})'), -2); egal(F('=INDEX(INVERSEMAT({2,0;0,4});2;2)'), 0.25);
});

test('finance', () => {
  proche(F('=VPM(5%/12;120;-10000)'), 106.0655152, 1e-6);
  proche(F('=VA(0,05;10;-1000)'), 7721.734929, 1e-5);
  proche(F('=VC(0,05;10;-1000)'), 12577.89254, 1e-4);
  proche(F('=NPM(0,05;-1000;7721,734929)'), 10, 1e-6);
  proche(F('=TAUX(120;-106,0655152;10000)*12'), 0.05, 1e-7);
  proche(F('=VAN(0,1;{100;100;100})'), 248.6851991, 1e-6);
  proche(F('=TRI({-100;30;40;50})'), 0.0889633947, 1e-8);
  proche(F('=INTPER(0,05;1;10;-1000)'), 50, 1e-9);
  proche(F('=PRINCPER(0,05;1;10;-1000)') + F('=INTPER(0,05;1;10;-1000)'), F('=VPM(0,05;10;-1000)'), 1e-9);
  proche(F('=TAUX.EFFECTIF(0,05;12)'), 0.0511618979, 1e-9);
  proche(F('=TAUX.NOMINAL(0,0511618979;12)'), 0.05, 1e-9);
  proche(F('=VAN.PAIEMENTS(0,1;{-1000;600;600};{45000;45365;45730})'), 41.36, 0.5);
  proche(F('=AMORLIN(10000;1000;5)'), 1800);
  proche(F('=DDB(10000;1000;5;1)'), 4000);
});

test('statistiques et lois', () => {
  proche(F('=LOI.NORMALE.STANDARD.N(1,96)'), 0.9750021048517795, 1e-12); proche(F('=LOI.NORMALE.STANDARD.N(-3)'), 0.0013498980316301, 1e-12);
  proche(F('=LOI.NORMALE.STANDARD.INVERSE.N(0,975)'), 1.959964, 1e-5);
  proche(F('=LOI.NORMALE.N(110;100;15;VRAI)'), 0.7475075, 1e-6);
  proche(F('=LOI.NORMALE.INVERSE.N(0,7475075;100;15)'), 110, 1e-4);
  proche(F('=LOI.POISSON.N(2;3;FAUX)'), 0.2240418, 1e-6);
  proche(F('=LOI.BINOMIALE.N(3;10;0,5;VRAI)'), 0.171875, 1e-9);
  proche(F('=LOI.EXPONENTIELLE.N(1;2;VRAI)'), 0.8646647, 1e-6);
  proche(F('=LOI.GAMMA.N(2;2;1;VRAI)'), 0.5939942, 1e-6);
  proche(F('=LOI.KHIDEUX.DROITE(3,84;1)'), 0.0500447, 1e-5);
  proche(F('=LOI.STUDENT.BILATERALE(2,228;10)'), 0.05, 1e-3);
  proche(F('=LNGAMMA(10)'), Math.log(362880), 1e-8);
  proche(F('=COEFFICIENT.CORRELATION({1;2;3;4};{2;4;6;9})'), 0.9943767, 1e-6);
  proche(F('=PENTE({2;4;6;9};{1;2;3;4})'), 2.3, 1e-9);
  proche(F('=PREVISION(5;{2;4;6;9};{1;2;3;4})'), 11, 1e-9);
  proche(F('=CENTILE({1;2;3;4;5};0,4)'), 2.6, 1e-9);
  proche(F('=QUARTILE({1;2;3;4;5;6;7;8};1)'), 2.75, 1e-9);
});

test('recherche', () => {
  pose(0, 0, 4, 'id'); pose(0, 1, 4, '1'); pose(0, 2, 4, '2'); pose(0, 3, 4, '3');
  pose(0, 0, 5, 'nom'); pose(0, 1, 5, 'un'); pose(0, 2, 5, 'deux'); pose(0, 3, 5, 'trois');
  egal(F('=RECHERCHEV(2;E2:F4;2;FAUX)'), 'deux'); egal(F('=RECHERCHEV(2,5;E2:F4;2)'), 'deux'); egal(F('=RECHERCHEV(9;E2:F4;2;FAUX)'), new ErreurFormule('#N/A'));
  egal(F('=RECHERCHEH("nom";E1:F4;3;FAUX)'), 'deux'); egal(F('=EQUIV(3;E2:E4;0)'), 3); egal(F('=INDEX(F2:F4;EQUIV(3;E2:E4;0))'), 'trois');
  egal(F('=RECHERCHEX(3;E2:E4;F2:F4)'), 'trois'); egal(F('=RECHERCHEX(7;E2:E4;F2:F4;"absent")'), 'absent');
  egal(F('=DECALER(E1;1;1)'), 'un'); egal(F('=SOMME(DECALER(E2;0;0;3;1))'), 6); egal(F('=INDIRECT("F"&3)'), 'deux');
  egal(F('=LIGNE(F3)'), 3); egal(F('=COLONNE(F3)'), 6); egal(F('=LIGNES(E2:F4)'), 3); egal(F('=ADRESSE(2;3)'), '$C$2');
});

test('texte', () => {
  egal(F('=GAUCHE("bonjour";3)'), 'bon'); egal(F('=DROITE("bonjour";4)'), 'jour'); egal(F('=STXT("bonjour";2;3)'), 'onj'); egal(F('=NBCAR("abc")'), 3);
  egal(F('=MAJUSCULE("é")'), 'É'); egal(F('=SUPPRESPACE("  a  b ")'), 'a b'); egal(F('=CNUM("12,5")'), 12.5); egal(F('=TEXTE(0,256;"0,0%")'), '25,6%');
  egal(F('=TEXTE(1234,5;"# ##0,00")'), '1 234,50'); egal(F('=TEXTE(45000;"jj/mm/aaaa")'), '15/03/2023'); egal(F('=TROUVE("j";"bonjour")'), 4);
  egal(F('=SUBSTITUE("a-b-c";"-";"+")'), 'a+b+c'); egal(F('=CONCAT("a";1;VRAI)'), 'a1TRUE'); egal(F('=JOINDRE.TEXTE(";";VRAI;"a";"";"b")'), 'a;b'); egal(F('=REPT("ab";2)'), 'abab');
});

test('dates', () => {
  egal(F('=DATE(2024;2;29)'), 45351); egal(F('=ANNEE(45351)'), 2024); egal(F('=MOIS(45351)'), 2); egal(F('=JOUR(45351)'), 29);
  egal(F('=MOIS.DECALER(DATE(2024;1;31);1)'), F('=DATE(2024;2;29)')); egal(F('=FIN.MOIS(DATE(2024;2;10);0)'), 45351);
  proche(F('=FRACTION.ANNEE(DATE(2024;1;1);DATE(2024;7;1))'), 0.5); proche(F('=FRACTION.ANNEE(DATE(2023;1;1);DATE(2024;1;1);1)'), 1);
  egal(F('=DATEDIF(DATE(2020;5;15);DATE(2024;3;10);"Y")'), 3); egal(F('=DATEDIF(DATE(2020;5;15);DATE(2024;3;10);"YM")'), 9);
  egal(F('=JOURSEM(DATE(2024;11;4))'), 2); egal(F('=NB.JOURS.OUVRES(DATE(2024;11;4);DATE(2024;11;10))'), 5); egal(F('=SERIE.JOUR.OUVRE(DATE(2024;11;1);2)'), F('=DATE(2024;11;5)'));
  egal(formaterDate(45351.5, 'dd/mm/yyyy hh:mm'), '29/02/2024 12:00');
});

test('tableaux et formules matricielles', () => {
  egal(F('={1,2;3,4}'), [[1, 2], [3, 4]]); egal(F('=TRANSPOSE({1,2;3,4})'), [[1, 3], [2, 4]]); egal(F('=SOMME({1;2;3}*2)'), 12);
  egal(F('=SEQUENCE(2;2)'), [[1, 2], [3, 4]]); egal(F('=UNIQUE({1;1;2})'), [[1], [2]]); egal(F('=INDEX(TRIER({3;1;2});1)'), 1);
  egal(F('=SOMME(SI(A1:A3>15;A1:A3;0))'), 50);
});

test('saisie : conversion des textes', () => {
  const d = Classeur.nouveau();
  d.saisir(0, 0, 0, '12,5'); egal(d.cellule(0, 0, 0).v, 12.5);
  d.saisir(0, 0, 0, '1 234,5'); egal(d.cellule(0, 0, 0).v, 1234.5);
  d.saisir(0, 0, 0, '10%'); egal(d.cellule(0, 0, 0).v, 0.1); egal(d.cellule(0, 0, 0).z, '0%');
  d.saisir(0, 0, 0, '29/02/2024'); egal(d.cellule(0, 0, 0).v, 45351); egal(d.texte(0, 0, 0), '29/02/2024');
  d.saisir(0, 0, 0, 'vrai'); egal(d.cellule(0, 0, 0).v, true);
  d.saisir(0, 0, 0, "'0123"); egal(d.cellule(0, 0, 0).v, '0123');
  d.saisir(0, 0, 0, '0123'); egal(d.cellule(0, 0, 0).v, '0123');
  d.saisir(0, 0, 0, '=1+'); egal(d.texte(0, 0, 0), '#VALUE!');
  d.saisir(0, 0, 0, ''); egal(d.cellule(0, 0, 0).v, undefined); egal(d.texte(0, 0, 0), '');
});

test('décalage de références et insertion de lignes', () => {
  egal(decalerFormule('=A1+$B$2+Feuil2!C3+SOMME(A:A)', 1, 2), '=C2+$B$2+Feuil2!E4+SOMME(C:C)');
  egal(decalerFormule('=A1', -1, 0), '=#REF!');
  const d = Classeur.nouveau();
  d.saisir(0, 0, 0, '1'); d.saisir(0, 1, 0, '2'); d.saisir(0, 5, 0, '=SOMME(A1:A2)+A2'); d.saisir(0, 5, 1, '=A1');
  d.insererLignes(0, 1, 2);
  egal(d.saisie(0, 7, 0), '=SOMME(A1:A4)+A4'); egal(d.saisie(0, 7, 1), '=A1'); egal(d.valeur(0, 7, 0), 5);
  d.supprimerLignes(0, 3, 1);
  egal(d.saisie(0, 6, 0), '=SOMME(A1:A3)+#REF!'); egal(d.valeur(0, 6, 0), new ErreurFormule('#REF!'));
  d.insererColonnes(0, 0, 1);
  egal(d.saisie(0, 6, 2), '=B1');
  d.copier(0, { r1: 6, c1: 2, r2: 6, c2: 2 }, { r: 8, c: 3 });
  egal(d.saisie(0, 8, 3), '=C3');
});

test('renommage de feuille', () => {
  const d = Classeur.nouveau(); d.ajouterFeuille('Ma feuille');
  d.saisir(0, 0, 0, "='Ma feuille'!A1+1"); d.saisir(1, 0, 0, '41');
  d.renommerFeuille(1, 'Hypo'); egal(d.saisie(0, 0, 0), '=Hypo!A1+1'); egal(d.valeur(0, 0, 0), 42);
});

test('formats de nombre', () => {
  egal(formaterNombre(1234.567, '#,##0.00'), '1 234,57'); egal(formaterNombre(0.1234, '0.0%'), '12,3%'); egal(formaterNombre(-5, '0;(0)'), '(5)');
  egal(formaterNombre(1234.5, '0.00E+00'), '1,23E+03'); egal(formaterNombre(3, '0.00 €'), '3,00 €'); egal(formaterNombre(0.5, '0'), '1');
});

test('analyse : erreurs de syntaxe', () => {
  egal(F('=SOMME(1;2'), new ErreurFormule('#VALUE!')); egal(F('=1 2'), new ErreurFormule('#VALUE!')); egal(F('=#N/A'), new ErreurFormule('#N/A'));
  egal(tokeniser('SUM(A1:B2,"x;y")').length, 5);
});

// ---------------------------------------------------------------------------
// VBA
// ---------------------------------------------------------------------------

function vba(code, nom, classeur = Classeur.nouveau()) {
  const res = executerMacro(classeur, code, nom);
  if (res.erreur) throw new Error('VBA : ' + res.erreur.message);
  return { ...res, classeur };
}

test('VBA : variables, boucles, conditions, fonctions', () => {
  const r = vba(`
    Option Explicit
    Sub Main()
      Dim i As Long, s As String, t As Double
      For i = 1 To 10 Step 3: t = t + i: Next i
      Debug.Print t
      i = 0
      Do While i < 3
        i = i + 1
        If i = 2 Then Exit Do
      Loop
      Debug.Print i
      Do: i = i + 1: Loop Until i >= 5
      Debug.Print i
      While i > 0: i = i - 1: Wend
      Select Case 7
        Case 1, 2: s = "petit"
        Case 3 To 8: s = "moyen"
        Case Is > 8: s = "grand"
        Case Else: s = "?"
      End Select
      Debug.Print s; Fact(5); IIf(True, "a", "b"); 7 \\ 2; 7 Mod 2; 2 ^ 10; "x" & 1 & True
      Debug.Print Round(2.5), Round(3.5), Int(-1.5), Fix(-1.5), Abs(-2), Sgn(-3)
      Debug.Print UCase(Left("bonjour", 3)), Mid("bonjour", 4), Len("abc"), InStr("bonjour", "j"), Replace("a-b", "-", "+"), Trim("  x ")
      Debug.Print Format(1234.5, "#,##0.00"), Format(0.25, "0%"), Format(#2/29/2024#, "dd/mm/yyyy"), Year(#12/31/2023#)
      Debug.Print Not True, (3 > 2) And (1 = 1), 6 And 3, 6 Or 1, 5 Xor 3
      Debug.Print TypeName(i), TypeName("s"), TypeName(1.5), IsNumeric("12"), IsNumeric("x"), IsEmpty(Empty)
      Debug.Print "a" Like "?", "abc" Like "a*", "abc" Like "x*"
    End Sub
    Function Fact(n As Long) As Long
      If n <= 1 Then Fact = 1 Else Fact = n * Fact(n - 1)
    End Function`, 'Main');
  egal(r.sortie, ['22', '2', '5', 'moyen 120 a 3 1 1024 x1Vrai', '2 4 -2 -1 2 -1', 'BON jour 3 4 a+b x', '1 234,50 25% 29/02/2024 2023',
    'Faux Vrai 2 7 6', 'Long String Double Vrai Faux Vrai', 'Vrai Vrai Faux']);
});

test('VBA : tableaux, ReDim, Split, Collection, Dictionary, ByRef', () => {
  const r = vba(`
    Sub Main()
      Dim a(1 To 3) As Double, b(), i As Integer, m(2, 2)
      a(1) = 1.5: a(3) = 3
      ReDim b(5): b(5) = "fin"
      ReDim Preserve b(7)
      Debug.Print LBound(a), UBound(a), UBound(b), b(5), a(2)
      m(2, 2) = 9: Debug.Print m(2, 2), UBound(m, 2)
      Dim parts: parts = Split("x,y,z", ",")
      Debug.Print UBound(parts), parts(1), Join(parts, "-"), Join(Array(1, 2, 3), "+")
      Dim col As New Collection
      col.Add "un", "k1": col.Add "deux": col.Add "zéro", , 1
      Debug.Print col.Count, col(1), col("k1"), col.Item(3)
      col.Remove 1: Debug.Print col.Count
      Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
      d.Add "a", 1: d("b") = 2: d("a") = d("a") + 10
      Dim k: For Each k In d.Keys: Debug.Print k; "="; d(k): Next
      Debug.Print d.Exists("b"), d.Exists("c"), d.Count
      i = 1: Doubler i: Debug.Print i
      Dim v: v = Array(5, 6): Debug.Print Somme(v)
    End Sub
    Sub Doubler(ByRef x As Integer): x = x * 2: End Sub
    Function Somme(t) As Double
      Dim e: For Each e In t: Somme = Somme + e: Next
    End Function`, 'Main');
  egal(r.sortie, ['1 3 7 fin 0', '9 2', '2 y x-y-z 1+2+3', '3 zéro un deux', '2', 'a = 11', 'b = 2', 'Vrai Faux 2', '2', '11']);
});

test('VBA : modèle objet Range / Worksheet / WorksheetFunction', () => {
  const cl = Classeur.nouveau(); cl.ajouterFeuille('Données');
  const r = vba(`
    Sub Main()
      Dim ws As Worksheet, i As Long, rg As Range
      Set ws = Worksheets("Données")
      For i = 1 To 5: ws.Cells(i, 1).Value = i * 10: Next
      ws.Range("B1").Formula = "=SUM(A1:A5)"
      ws.Range("B2").Value = "=A1*2"
      ws.Range("C1:C2").Value = Array(7, 8)
      ws.Range("D1").NumberFormat = "0.00%": ws.Range("D1").Value = 0.5
      Debug.Print ws.Range("B1").Value, ws.Range("B2").Value, ws.Range("B1").Formula, ws.Range("D1").Text, ws.Range("C2").Value
      Debug.Print ws.Cells(1, 1).End(xlDown).Row, ws.UsedRange.Address, ws.Range("A1").CurrentRegion.Rows.Count
      Set rg = ws.Range("A1").Resize(3, 1).Offset(1, 0)
      Debug.Print rg.Address, rg.Cells(1, 1).Value, rg.Count, rg.Rows.Count
      Debug.Print WorksheetFunction.Sum(ws.Range("A1:A5")), Application.WorksheetFunction.Max(ws.Range("A1:A5"), 99), WorksheetFunction.VLookup(30, ws.Range("A1:B5"), 1, False)
      Debug.Print WorksheetFunction.Pmt(0.05 / 12, 120, -10000), WorksheetFunction.Norm_S_Dist(1.96, True), WorksheetFunction.CountIf(ws.Range("A1:A5"), ">25")
      Dim v: v = ws.Range("A1:A3").Value
      Debug.Print UBound(v, 1), UBound(v, 2), v(2, 1)
      ws.Range("A1:B5").Font.Bold = True: ws.Range("A1").Interior.Color = vbYellow
      Debug.Print ws.Range("A1").Font.Bold, Sheets.Count, Sheets(2).Name, ActiveSheet.Name
      Worksheets.Add After:=Sheets(2)
      ActiveSheet.Name = "Résultats"
      Range("A1").Value = Sheets("Données").Range("B1").Value + 1
      Debug.Print Sheets.Count, ActiveSheet.Name, Range("A1").Value, Evaluate("1+2")
      Dim c As Range, n As Long
      For Each c In ws.Range("A1:A5")
        If c.Value > 20 Then n = n + 1
      Next
      Debug.Print n
      ws.Rows(2).Delete
      Debug.Print ws.Range("A2").Value, ws.Range("B1").Value
      ws.Range("A1").ClearContents: Debug.Print IsEmpty(ws.Range("A1").Value)
      ws.Name = "Donn2": Debug.Print Worksheets(2).Name
    End Sub`, 'Main', cl);
  egal(r.sortie, ['150 20 =SUM(A1:A5) 50,00% 7', '5 $A$1:$D$5 5', '$A$2:$A$4 20 3 3', '150 99 30', '106,065515239075 0,97500210485178 3', '3 1 20',
    'Vrai 2 Données Feuil1', '3 Résultats 151 3', '3', '30 130', 'Vrai', 'Donn2']);
  egal(cl.feuilles[1].get(0, 0).s, { gras: true, fond: '#ffff00' });
  egal(cl.saisie(2, 0, 0), '151');
});

test('VBA : With, On Error, GoTo, Err, Exit, Select sur texte, nommés', () => {
  const r = vba(`
    Sub Main()
      With Range("A1")
        .Value = 3
        .Offset(0, 1).Value = .Value * 2
      End With
      Debug.Print Range("B1").Value
      On Error Resume Next
      Dim x: x = 1 / 0
      Debug.Print Err.Number; Err.Description
      Err.Clear
      Range("ZZZ").Value = 1
      Debug.Print Err.Number
      On Error GoTo Gestion
      x = CInt("abc")
      Debug.Print "jamais"
Suite:
      Debug.Print "suite"
      Exit Sub
Gestion:
      Debug.Print "erreur " & Err.Number
      Resume Suite
    End Sub`, 'Main');
  egal(r.sortie, ['6', '11 Division par zéro', '1004', 'erreur 13', 'suite']);
  const res = executerMacro(Classeur.nouveau(), 'Sub A()\n  Dim t(2)\n  t(5) = 1\nEnd Sub', 'A');
  egal(res.erreur.numero, 9); egal(res.erreur.ligne, 3);
  const boucle = executerMacro(Classeur.nouveau(), 'Sub B()\n  Do\n  Loop\nEnd Sub', 'B');
  egal(boucle.erreur !== null, true, 'boucle infinie détectée');
  const syntaxe = () => analyserVBA('Sub C()\n  If 1 Then\nEnd Sub');
  let plante = false; try { syntaxe(); } catch { plante = true; } egal(plante, true, 'If sans End If');
  const p = analyserVBA('Sub D(a, Optional b = 2)\nEnd Sub\nFunction E() As Long\nEnd Function');
  egal([...p.procedures.keys()], ['D', 'E']);
});

test('VBA : dates et chaînes', () => {
  const r = vba(`
    Sub Main()
      Dim d As Date: d = DateSerial(2024, 1, 31)
      Debug.Print Format(DateAdd("m", 1, d), "yyyy-mm-dd"), DateDiff("d", d, DateSerial(2024, 3, 1)), Weekday(d), Month(d), Day(DateAdd("d", 1, d))
      Debug.Print Format(1234567.891, "#,##0.00"), Format(0.5, "Percent"), Format(5, "000"), Format("abc", ">")
      Debug.Print CStr(1.5), Val("12abc"), CDbl("3,5"), StrReverse("abc"), String(3, "x"), Space(2) & "|", Chr(65), Asc("A"), Hex(255)
      Debug.Print InStrRev("a/b/c", "/"), StrComp("a", "B", vbTextCompare), LCase("ÀB")
    End Sub`, 'Main');
  egal(r.sortie, ['2024-02-29 30 4 1 1', '1 234 567,89 50,00% 005 ABC', '1,5 12 3,5 cba xxx   | A 65 FF', '4 -1 àb']);
});

test('VBA : fonctions utilisables dans les formules (UDF)', () => {
  const cl = Classeur.nouveau();
  const it = new InterpreteurVBA(cl);
  it.charger(`
    Function Annuite(taux As Double, n As Long) As Double
      If taux = 0 Then Annuite = n Else Annuite = (1 - (1 + taux) ^ -n) / taux
    End Function
    Function SommeCarres(rg As Range) As Double
      Dim c As Range
      For Each c In rg: SommeCarres = SommeCarres + c.Value ^ 2: Next
    End Function
    Function Etiquette(x) As String
      Etiquette = "Valeur : " & x
    End Function
    Function Doubles(t)
      Dim i As Long, out()
      ReDim out(1 To UBound(t, 1), 1 To 1)
      For i = 1 To UBound(t, 1): out(i, 1) = t(i, 1) * 2: Next
      Doubles = out
    End Function`);
  cl.udf = creerUDF(it);
  cl.saisir(0, 0, 0, '3'); cl.saisir(0, 1, 0, '4');
  cl.saisir(0, 0, 1, '=Annuite(3%;20)'); cl.saisir(0, 1, 1, '=SommeCarres(A1:A2)'); cl.saisir(0, 2, 1, '=Etiquette(A1)'); cl.saisir(0, 3, 1, '=SOMME(Doubles(A1:A2))'); cl.saisir(0, 4, 1, '=Inconnue(1)');
  proche(cl.valeur(0, 0, 1), 14.8774748, 1e-6); egal(cl.valeur(0, 1, 1), 25); egal(cl.valeur(0, 2, 1), 'Valeur : 3'); egal(cl.valeur(0, 3, 1), 14); egal(cl.valeur(0, 4, 1), new ErreurFormule('#NAME?'));
});

// ---------------------------------------------------------------------------
// Fichiers xlsx
// ---------------------------------------------------------------------------

test('xlsx : aller-retour (feuilles, formules, formats, noms, macros, largeurs)', () => {
  const d = Classeur.nouveau();
  d.saisir(0, 0, 0, '1000'); d.saisir(0, 1, 0, '3%'); d.saisir(0, 2, 0, '=A1*(1+A2)^10'); d.saisir(0, 3, 0, '12/03/2024'); d.saisir(0, 4, 0, 'texte'); d.saisir(0, 5, 0, '=A1/0'); d.saisir(0, 6, 0, 'VRAI');
  d.ajouterFeuille('Hypothèses'); d.saisir(1, 0, 0, '=Feuil1!A3*2'); d.definirNom('Capital', 'Feuil1!$A$1'); d.saisir(1, 1, 0, '=Capital+1');
  d.feuilles[0].largeurs[0] = 120; d.feuilles[1].cachee = true;
  d.saisir(0, 7, 0, '=SOMME(A1:A2;1,5)+SI.CONDITIONS(A1>1;ARRONDI(2,5;0))');
  d.macros = 'Sub Bonjour()\n  MsgBox "Salut"\nEnd Sub';
  const chemin = path.join(os.tmpdir(), 'test-tableur.xlsx');
  fs.writeFileSync(chemin, ecrireClasseur(XLSX, d));
  const e = lireClasseur(XLSX, fs.readFileSync(chemin), 'test-tableur.xlsx');
  egal(e.feuilles.map((f) => f.nom), ['Feuil1', 'Hypothèses']);
  egal(e.feuilles[1].cachee, true);
  egal([0, 1, 2, 3, 4, 5, 6].map((r) => e.texte(0, r, 0)), ['1000', '3%', '1343,91637934412', '12/03/2024', 'texte', '#DIV/0!', 'VRAI']);
  egal(e.saisie(0, 2, 0), '=A1*(1+A2)^10'); egal(e.cellule(0, 1, 0).z, '0%');
  egal(e.texte(1, 0, 0), '2687,83275868824'); egal(e.texte(1, 1, 0), '1001'); egal(e.nom('Capital'), 'Feuil1!$A$1');
  egal(e.macros, d.macros); egal(e.feuilles[0].largeurs[0] > 100, true);
  egal(e.saisie(0, 7, 0), '=SOMME(A1:A2;1.5)+SI.CONDITIONS(A1>1;ARRONDI(2.5;0))'); egal(e.texte(0, 7, 0), '1004,53');
  const wbBrut = XLSX.read(fs.readFileSync(chemin), { type: 'buffer', cellFormula: true });
  egal(wbBrut.Sheets.Feuil1.A8.f, 'SUM(A1:A2,1.5)+IFS(A1>1,ROUND(2.5,0))');
  // CSV
  const csv = new TextDecoder().decode(ecrireClasseur(XLSX, d, { bookType: 'csv' }));
  egal(csv.split('\n')[0].replace('﻿', ''), '1000');
  const f = lireClasseur(XLSX, new TextEncoder().encode('a;b\n1;2\n'), 'x.csv');
  egal(f.texte(0, 1, 1), '2');
});

test('xlsx : styles (gras, couleurs, bordures) et graphiques', () => {
  const d = Classeur.nouveau();
  d.saisir(0, 0, 0, 'Titre'); d.style(0, 0, 0, { gras: true, couleur: '#ff0000', fond: '#ffff00', align: 'center' });
  d.saisir(0, 1, 0, '12,5'); d.format(0, 1, 0, '0.00'); d.style(0, 1, 0, { bordures: { h: 'thin', b: 'thick', g: 'thin', d: 'thin' }, italique: true });
  d.style(0, 3, 2, { fond: '#00ff00' });
  d.ajouterFeuille('Deux'); d.saisir(1, 0, 0, 'x'); d.style(1, 0, 0, { souligne: true });
  d.feuilles[0].graphiques.push({ id: 'g1', type: 'courbes', plage: 'A1:B2', titre: 'Essai', x: 10, y: 10, w: 300, h: 200 });
  const chemin = path.join(os.tmpdir(), 'test-tableur-styles.xlsx');
  fs.writeFileSync(chemin, ecrireClasseur(XLSX, d));
  const e = lireClasseur(XLSX, fs.readFileSync(chemin), 'styles.xlsx');
  egal(e.cellule(0, 0, 0).s, { gras: true, couleur: '#ff0000', fond: '#ffff00', align: 'center' });
  egal(e.cellule(0, 1, 0).s, { italique: true, bordures: { h: 'thin', b: 'thick', g: 'thin', d: 'thin' } }); egal(e.cellule(0, 1, 0).z, '0.00');
  egal(e.cellule(0, 3, 2).s, { fond: '#00ff00' }); egal(e.cellule(1, 0, 0).s, { souligne: true });
  egal(e.feuilles.map((f) => f.nom), ['Feuil1', 'Deux']); egal(e.feuilles[0].graphiques[0].titre, 'Essai');
});

test('docx : tableaux → feuilles ; modules .bas', () => {
  // Un .docx minimal fabriqué à la main (zip via SheetJS CFB)
  const doc = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Âge</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Taux</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>60</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2,5</w:t></w:r><w:r><w:t xml:space="preserve"> %</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Fusion &amp; co</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  const cfb = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(cfb, '/word/document.xml', new TextEncoder().encode(doc));
  const octets = new Uint8Array(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }));
  const c = lireDocx(XLSX, octets, 'rapport.docx');
  egal(c.feuilles.map((f) => f.nom), ['Tableau 1', 'Tableau 2']);
  egal(c.texte(0, 0, 0), 'Âge'); egal(c.cellule(0, 1, 0).v, 60); egal(c.cellule(0, 1, 1).v, 0.025); egal(c.texte(1, 0, 0), 'Fusion & co'); egal(c.texte(1, 0, 2), 'x');
  egal(nettoyerModuleVBA('Attribute VB_Name = "Module1"\r\nOption Explicit\r\nSub A()\r\nEnd Sub\r\n', 'Module1.bas'), "' ===== Module Module1 =====\nOption Explicit\nSub A()\nEnd Sub\n");
});

test('graphiques : préparation des données et rendu SVG', () => {
  const m = [['Année', 'Primes', 'Sinistres'], [2021, 120, 80], [2022, 135, 95], [2023, 150, 90]];
  const d = preparerDonnees(m, 'barres');
  egal(d.categories, ['2021', '2022', '2023']); egal(d.series.map((s) => s.nom), ['Primes', 'Sinistres']); egal(d.series[1].valeurs, [80, 95, 90]);
  const n = preparerDonnees([['x', 'y'], [1, 2], [2, 4]], 'nuage');
  egal(n.xs, [1, 2]); egal(n.series[0].valeurs, [2, 4]);
  for (const type of ['barres', 'barres-empilees', 'courbes', 'aires', 'secteurs', 'anneau', 'nuage']) {
    const svg = rendreGraphiqueSVG({ type, titre: 'T' }, m, 400, 250);
    egal(svg.startsWith('<svg') && svg.endsWith('</svg>'), true, type);
    egal(svg.includes(type === 'secteurs' || type === 'anneau' ? '<path' : type === 'barres' || type === 'barres-empilees' ? '<rect x=' : '<circle'), true, type);
  }
  egal(rendreGraphiqueSVG({ type: 'barres' }, [['a'], ['b']]).includes('Aucune donnée'), true);
});

test('VBA : bordures et styles', () => {
  const cl = Classeur.nouveau();
  vba(`Sub M()
    Range("A1:B2").Borders.LineStyle = xlContinuous
    Range("A1:B2").Borders(xlEdgeBottom).Weight = xlThick
    Range("D1").BorderAround Weight:=xlMedium
    Range("A1").Font.Size = 14: Range("A1").Font.Italic = True
    Range("B1").Interior.ColorIndex = 6
    Range("A1:B2").Borders(xlEdgeTop).LineStyle = xlNone
  End Sub`, 'M', cl);
  egal(cl.cellule(0, 0, 0).s, { bordures: { b: 'thin', g: 'thin', d: 'thin' }, taille: 19, italique: true });
  egal(cl.cellule(0, 1, 1).s, { bordures: { h: 'thin', b: 'thick', g: 'thin', d: 'thin' } });
  egal(cl.cellule(0, 0, 3).s, { bordures: { h: 'medium', b: 'medium', g: 'medium', d: 'medium' } });
  egal(cl.cellule(0, 0, 1).s.fond, '#ffff00');
});

test('xlsm : extraction du code VBA (décompression MS-OVBA)', () => {
  // Un flux non compressé d'un seul bloc : en-tête 0x01, bloc 0x3000 | (taille-3)
  const texte = new TextEncoder().encode('Sub A()\nEnd Sub\n');
  const brut = new Uint8Array(3 + 4096);
  brut[0] = 1; const h = 0x3000 | 4095; brut[1] = h & 255; brut[2] = h >> 8; brut.set(texte, 3);
  egal(new TextDecoder().decode(decompresserOVBA(brut).subarray(0, texte.length)), 'Sub A()\nEnd Sub\n');
  // Bloc compressé : "aaaaaaaaaaaa" → littéral « a » puis copie (décalage 1, longueur 11)
  const comp = Uint8Array.from([0x01, 0x04, 0xb0, 0x02, 0x61, 0x08, 0x00]);
  egal(new TextDecoder().decode(decompresserOVBA(comp)), 'aaaaaaaaaaaa');
});

test('projet VBA : modules de feuille, ThisWorkbook et modules nommés', () => {
  const c = Classeur.nouveau(); c.ajouterFeuille('Hypothèses'); c.ajouterFeuille('Calculs');
  egal(c.feuilles.map((f) => f.codeNom), ['Feuil1', 'Feuil2', 'Feuil3']);
  egal(c.nomModuleLibre(), 'Module1');
  egal(c.ajouterModule('Provisions'), 'Provisions');
  egal(c.ajouterModule(), 'Module1');
  let refus = ''; try { c.ajouterModule('Mon module'); } catch (e) { refus = e.message; } egal(/invalide/.test(refus), true);
  refus = ''; try { c.ajouterModule('feuil2'); } catch (e) { refus = e.message; } egal(/déjà pris/.test(refus), true);
  c.definirCodeModule('module:Provisions', 'Sub Calculer()\n    Feuil2.Range("A1").Value = Module1.Taux() * 100\n    Module1.Marquer\nEnd Sub\n');
  c.definirCodeModule('module:Module1', 'Function Taux()\n    Taux = 0.02\nEnd Function\nSub Marquer()\n    Worksheets("Calculs").Range("B1").Value = "ok"\nEnd Sub\n');
  // Module de la feuille Calculs : Range et Me visent cette feuille, même si une autre est active
  c.definirCodeModule('feuille:Feuil3', 'Sub Remplir()\n    Range("C1").Value = Me.Name\n    Aide\nEnd Sub\nPrivate Sub Aide()\n    Cells(2, 3).Value = 7\nEnd Sub\n');
  c.definirCodeModule('classeur', 'Sub Nommer()\n    Debug.Print Me.Name\nEnd Sub\n');
  c.active = 0;
  let r = executerMacro(c, null, 'Calculer'); egal(r.erreur, null);
  egal(c.valeur(1, 0, 0), 2); egal(c.valeur(2, 0, 1), 'ok');
  r = executerMacro(c, null, 'Feuil3.Remplir'); egal(r.erreur, null);
  egal(c.valeur(2, 0, 2), 'Calculs'); egal(c.valeur(2, 1, 2), 7); egal(c.valeur(0, 0, 2), null);
  r = executerMacro(c, null, 'Nommer'); egal(r.sortie, [c.nomFichier]);
  // Une erreur indique son module
  c.definirCodeModule('module:Module1', c.moduleVBA('module:Module1').code + 'Sub Casse()\n    Dim x As Long\n    x = 1 / 0\nEnd Sub\n');
  r = executerMacro(c, null, 'Module1.Casse'); egal(r.erreur.numero, 11); egal(r.erreur.module, 'Module1'); egal(r.erreur.ligne, 9);
  // Aller-retour texte (sauvegarde du navigateur, feuille _MacrosTableur)
  const texte = c.macros;
  egal(/' ===== Feuille Feuil3 \(Calculs\) =====/.test(texte), true); egal(/' ===== Module Provisions =====/.test(texte), true);
  const d = Classeur.nouveau(); d.ajouterFeuille('Hypothèses'); d.ajouterFeuille('Calculs');
  d.macros = texte;
  egal(d.modulesVBA().map((m) => m.libelle), ['Feuil1 (Feuil1)', 'Feuil2 (Hypothèses)', 'Feuil3 (Calculs)', 'ThisWorkbook', 'Provisions', 'Module1']);
  egal(d.feuilles[2].code, c.feuilles[2].code); egal(d.codeClasseur, c.codeClasseur);
  // Les feuilles réordonnées gardent leur module (par le nom de la feuille)
  const e = Classeur.nouveau(); e.renommerFeuille(0, 'Calculs'); e.ajouterFeuille('Hypothèses');
  e.macros = texte; egal(e.feuilles[0].codeNom, 'Feuil3'); egal(e.feuilles[0].code, c.feuilles[2].code);
  // .xlsm : le projet entier revient
  const lu = lireClasseur(XLSX, ecrireClasseur(XLSX, c, { bookType: 'xlsx' }), 'p.xlsx');
  egal(lu.macros, texte); egal(lu.feuilles[2].codeNom, 'Feuil3');
  // Ancien format (un seul texte) et modules importés
  const v = Classeur.nouveau(); v.macros = 'Sub A()\nEnd Sub';
  egal(v.modules.map((m) => m.nom), ['Module1']); egal(v.modules[0].code, 'Sub A()\nEnd Sub\n');
  const cles = ajouterAuProjet(v, nettoyerModuleVBA('Attribute VB_Name = "Outils"\r\nSub B()\r\nEnd Sub\r\n', 'x.bas'));
  egal(cles, ['module:Outils']);
  egal(ajouterAuProjet(v, nettoyerModuleVBA('Sub C()\nEnd Sub', 'Module1.bas')), ['module:Module2']);
  v.renommerModule('Module2', 'Divers'); egal(v.modules.map((m) => m.nom), ['Module1', 'Outils', 'Divers']);
  v.supprimerModule('Outils'); egal(v.modules.map((m) => m.nom), ['Module1', 'Divers']);
  egal(decouperProjet("' ===== Module Feuil1 =====\nSub X()\nEnd Sub").length, 1);
  const w = Classeur.nouveau(); w.macros = "' ===== Module Feuil1 =====\nSub X()\nEnd Sub\n' ===== Module ThisWorkbook =====\nSub Y()\nEnd Sub";
  egal(w.feuilles[0].code, 'Sub X()\nEnd Sub\n'); egal(w.codeClasseur, 'Sub Y()\nEnd Sub\n'); egal(w.modules.length, 0);
});

test('projet VBA : liste, création et suppression de macros nommées', () => {
  const code = "Option Explicit\n\nSub Lancer()\n    ' commentaire avec Sub Faux()\nEnd Sub\n\nPrivate Function Taux(a As Double, Optional b)\nEnd Function\nPublic Sub AvecArg(x)\nEnd Sub\n";
  egal(listerProcedures(code).map((p) => [p.nom, p.genre, p.params, p.prive, p.macro, p.ligne, p.fin]),
    [['Lancer', 'Sub', 0, false, true, 3, 5], ['Taux', 'Function', 2, true, false, 7, 8], ['AvecArg', 'Sub', 1, false, false, 9, 10]]);
  const { code: c2, ligne } = insererMacro(code, 'Nouvelle');
  egal(c2.split('\n')[ligne - 2], 'Sub Nouvelle()'); egal(c2.split('\n')[ligne], 'End Sub');
  egal(analyserVBA(c2).procedures.has('NOUVELLE'), true);
  egal(insererMacro('', 'Premiere'), { code: 'Sub Premiere()\n    \nEnd Sub\n', ligne: 2 });
  const c3 = supprimerProcedure(c2, 'lancer');
  egal(listerProcedures(c3).map((p) => p.nom), ['Taux', 'AvecArg', 'Nouvelle']);
  egal(analyserVBA(c3).procedures.size, 3);
});

console.log(ko ? `${ok} tests réussis, ${ko} en échec` : `✔ ${ok} tests réussis`);
process.exit(ko ? 1 : 0);
