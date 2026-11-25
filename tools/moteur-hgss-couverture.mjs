// tools/moteur-hgss-couverture.mjs — jusqu'où va le jeu HGSS dans le moteur (branche moteur-hgss).
// Charge toutes les cartes depuis un clone de pret/pokeheartgold (PRET=<dossier>, sinon /tmp/ext/pret), puis dit :
//  1. les commandes des scripts du jeu que le traducteur ne sait pas encore jouer (hors sons, attentes, fondus…),
//     avec leur nombre d'emplois et quelques cartes où on les trouve ;
//  2. les cartes qu'un joueur atteint à pied depuis la chambre, toutes capacités de terrain permises, et celles qu'il
//     n'atteint pas (sans les cartes « UNUSED » ni le Wi-Fi) ;
//  3. les arènes atteintes.
// Usage : PRET=<clone> node tools/moteur-hgss-couverture.mjs [--tout]
import { readFileSync, existsSync } from 'node:fs';

const B = new URL('../odyssee/moteur/', import.meta.url).href;
const PRET = process.env.PRET || '/tmp/ext/pret';
if (!existsSync(PRET + '/files/a/0/6/5')) { console.log('clone de pokeheartgold introuvable : PRET=<dossier>'); process.exit(1); }
const lire = async (c) => new Uint8Array(readFileSync(PRET + '/' + c));
const { jeuHG, DEPART_HG } = await import(B + 'donnees/jeu-hg.js');
const E = await import(B + 'donnees/evenements-hg.js');
const { auditer } = await import(B + 'engine/audit.js');
const avertir = console.warn; console.warn = () => {};

const G = await jeuHG(lire);
const D = G.donnees;
E.STATS.inconnues = new Map();
const parCarte = new Map();
for (const c of Object.keys(D.zones)) {
  const avant = new Map([...E.STATS.inconnues].map(([k, v]) => [k, v.n]));
  const p = await G.chargerCarte(c);
  if (!p) continue;
  Object.assign(D.zones, p.zones); Object.assign(D.blocs, p.blocs); Object.assign(D.mondes, p.mondes);
  for (const [k, v] of E.STATS.inconnues) if (v.n !== (avant.get(k) || 0)) (parCarte.get(k) || parCarte.set(k, new Set()).get(k)).add(c);
}
console.warn = avertir;

const tout = process.argv.includes('--tout');
const inconnues = [...E.STATS.inconnues].sort((a, b) => b[1].n - a[1].n);
console.log(`1. Commandes des scripts du jeu pas encore jouées : ${inconnues.length} sortes, ${inconnues.reduce((s, [, v]) => s + v.n, 0)} emplois`);
for (const [c, v] of inconnues.slice(0, tout ? 1000 : 40)) console.log(`   ${String(v.n).padStart(4)}  ${c.padEnd(32)} ${[...(parCarte.get(c) || [])].slice(0, 4).join(', ')}`);

const r = auditer(D, DEPART_HG, { surf: true, coupe: true, eclate: true, force: true, cascade: true, siphon: true, escalade: true });
const hors = (z) => /UNUSED|WIFI|^UNION$|^UNDERGROUND$|FIGHT_AREA|BATTLE_|POKEATHLON|PAL_PARK|_JP$|EMPTY|FRONTIER|_B1F$/.test(z) && !/SLOWPOKE|ICE_PATH|BURNED|MOUNT|CAVE|TOWER|WELL|ROCKET|LIGHTHOUSE|ISLANDS/.test(z);
const cartes = Object.keys(D.zones).filter((z) => !hors(z));
const non = cartes.filter((z) => !r.zones.has(z));
console.log(`\n2. Cartes atteintes à pied depuis la chambre (toutes capacités) : ${cartes.length - non.length} sur ${cartes.length}`);
console.log('   pas encore atteintes : ' + non.join(' '));

const arenes = Object.keys(D.zones).filter((z) => /_GYM$|_GYM_LEADER_ROOM$/.test(z));
console.log(`\n3. Arènes atteintes : ${arenes.filter((z) => r.zones.has(z)).length} sur ${arenes.length}` + (arenes.some((z) => !r.zones.has(z)) ? ' — manquent ' + arenes.filter((z) => !r.zones.has(z)).join(', ') : ''));
