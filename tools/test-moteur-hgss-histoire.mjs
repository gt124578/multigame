// HeartGold / SoulSilver dans le moteur (odyssee/moteur/) : les passages de l'histoire après le premier badge, joués
// avec les vrais scripts du jeu, chacun à partir d'un état préparé (drapeaux, badges, sac) : l'Œuf de l'assistant du
// Prof. Elm, la Ligue (Conseil 4, Maître, Panthéon), l'Aquaria jusqu'à Carmin, le Train Magnétique, la Tour Carillon,
// le QG de la Team Rocket. Les combats sont gagnés d'office.
//   PRET=<clone de pret/pokeheartgold> node tools/test-moteur-hgss-histoire.mjs [passage]
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const B = new URL('../odyssee/moteur/', import.meta.url).href;
const { partie, calme } = await import('./moteur-hgss-partie.mjs');
const PRET = process.env.PRET || '/tmp/ext/pret';
if (!existsSync(PRET + '/files/a/0/6/5')) { console.log('clone de pokeheartgold absent (PRET=<dossier>) : test sauté'); process.exit(0); }
const { jeuHG } = await import(B + 'donnees/jeu-hg.js');
console.warn = () => {};
const G = await jeuHG(async (c) => new Uint8Array(readFileSync(PRET + '/' + c)));
const seul = process.argv[2];
let n = 0, echecs = 0;
const ok = (t) => { n++; console.log('  ✓ ' + t); };
const JOHTO = ['ZEPHYR', 'HIVE', 'PLAIN', 'FOG', 'STORM', 'MINERAL', 'GLACIER', 'RISING'].map((b) => 'BADGE_' + b);
const KANTO = ['BOULDER', 'CASCADE', 'THUNDER', 'RAINBOW', 'SOUL', 'MARSH', 'VOLCANO', 'EARTH'].map((b) => 'BADGE_' + b);
/** une équipe et des badges : de quoi passer partout */
function equiper(T, badges = JOHTO, sac = {}) {
  T.etat.equipe.push(T.pokemon.creer(157, 60), T.pokemon.creer(160, 60));
  for (const b of badges) T.etat.drapeaux.add(b);
  for (const f of ['FLAG_GOT_POKEDEX', 'FLAG_GOT_POKEGEAR', 'FLAG_GOT_STARTER', 'CHAUSSURES']) T.etat.drapeaux.add(f);
  Object.assign(T.etat.sac, sac);
}
/** le texte d'un script de la carte où l'on est (langage du moteur), et ceux qu'il appelle dans la même carte */
function texteScript(T, nom) {
  const src = T.d.zones[T.zone.id]?.scripts || '';
  const i = src.indexOf(`script ${nom}\n`); if (i < 0) return '';
  const j = src.indexOf('\nscript ', i + 1);
  return src.slice(i, j < 0 ? undefined : j);
}
async function passage(nom, f) {
  if (seul && !nom.toLowerCase().includes(seul.toLowerCase())) return;
  console.log(nom);
  try { await f(); } catch (e) { echecs++; console.log('  ✗ ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
}

await passage('L\'Œuf de l\'assistant du Prof. Elm (après le premier badge)', async () => {
  const P = await partie(G, { zone: 'VIOLET_GYM', warp: 0 });
  const { T } = P;
  equiper(T, ['BADGE_ZEPHYR']);
  T.etat.vars.VAR_SCENE_VIOLET_CITY_OW = 1;   // posé par le script de l'arène après la victoire sur Falkner
  await P.versCarte('VIOLET'); await P.laisser(120);
  assert.ok(T.etat.drapeaux.has('FLAG_GOT_PICK_UP_EGG_CALL_FROM_ELM'), 'l\'appel du Prof. Elm à la sortie de l\'arène');
  assert.ok(P.vus.some((t) => /PROF\. ELM/.test(t) && /Violet/.test(t)), P.vus.slice(-3).join(' | '));
  ok('à la sortie de l\'arène, le Prof. Elm appelle sur le Pokégear : son assistant attend à la Boutique');
  await P.versCarte('VIOLET_POKEMART'); await P.laisser(30);
  const avant = T.etat.equipe.length;
  await P.parlerA('obj_T22FS0101_assistantm', [0, 0]);
  await P.laisser(60);
  assert.ok(T.etat.drapeaux.has('FLAG_GOT_EGG_FROM_ELMS_ASSISTANT') && T.etat.equipe.length === avant + 1 && T.etat.equipe.at(-1).sp === 175, JSON.stringify(T.etat.equipe.at(-1)));
  ok('à la Boutique de Mauville, l\'assistant confie l\'Œuf (TOGEPI, éclos tout de suite : le moteur n\'a pas d\'œufs)');
});

await passage('La Ligue : le Conseil 4, le Maître et le Panthéon', async () => {
  const P = await partie(G, { zone: 'POKEMON_LEAGUE_ENTRANCE', warp: 0 });
  const { T } = P;
  equiper(T);
  await P.laisser(30);
  // le garde de l'entrée s'écarte quand on lui parle
  await P.parlerA('obj_T10R0101_counterm');
  const salles = ['POKEMON_LEAGUE_WILL_ROOM', 'POKEMON_LEAGUE_KOGA_ROOM', 'POKEMON_LEAGUE_BRUNO_ROOM', 'POKEMON_LEAGUE_KAREN_ROOM', 'POKEMON_LEAGUE_LANCE_ROOM'];
  const membres = ['WILL', 'KOGA', 'BRUNO', 'KAREN', 'LANCE'];
  for (const [i, s] of salles.entries()) {
    await P.versCarte(s);
    await P.laisser(60);
    // le membre du Conseil : le personnage qui lance un combat de la Ligue ; Peter vient à la rencontre du joueur
    const avant = P.combats.length;
    if (membres[i] === 'LANCE') {
      await P.rejoindre(6, 10); await P.laisser(300);
      assert.ok(P.combats.length > avant, `${s} : pas de combat contre Peter (${T.joueur.x},${T.joueur.y})`);
      break;
    }
    const qui = T.objets.filter((o) => o.visible && o.def.script && new RegExp(`combat_hg TRAINER_(ELITE_FOUR|CHAMPION)_${membres[i]}`).test(texteScript(T, o.def.script)));
    if (process.env.DEBUG) console.log(T.zone.id, T.joueur.x, T.joueur.y, T.objets.map((o) => `${o.id}@${o.x},${o.y} ${o.visible} ${o.def.script}`));
    const membre = qui[0] || T.objets.filter((o) => o.visible && o.def.script && !/stop|door|babyboy/i.test(o.id)).sort((a, b) => a.y - b.y)[0];
    await P.parlerA(membre.id);
    await P.laisser(120);
    assert.ok(P.combats.length > avant, `${s} : pas de combat (${membre.id})`);
    if (i < salles.length - 1) {
      const suite = T.zone.warps.find((w) => w.vers === salles[i + 1]);
      assert.ok(suite, `${s} : pas de porte vers ${salles[i + 1]}`);
    }
  }
  ok('les cinq salles : Clément, Koga, Aldo, Marion, Peter, chaque porte s\'ouvre après la victoire');
  for (let i = 0; i < 40 && T.zone.id !== 'POKEMON_LEAGUE_HALL_OF_FAME'; i++) await P.laisser(50);
  if (T.zone.id === 'POKEMON_LEAGUE_HALL_OF_FAME') await P.laisser(400);
  assert.ok(T.etat.drapeaux.has('FLAG_GAME_CLEAR'), `fin du jeu : ${T.zone.id} ${P.vus.slice(-4).join(' | ')}`);
  assert.ok(/NEW_BARK/.test(T.zone.id), T.zone.id);
  ok(`le Panthéon, le générique, et le retour à la maison (${T.zone.id}) : le jeu est fini`);
});

await passage('L\'Aquaria : d\'Oliville à Carmin', async () => {
  const { objetDe } = await import(B + 'donnees/evenements-hg.js');
  const P = await partie(G, { zone: 'SS_AQUA_OLIVINE_PORT_INTERIOR', warp: 0 });
  const { T } = P;
  equiper(T, JOHTO, { [objetDe('ITEM_S_S__TICKET')]: 1 });
  T.etat.drapeaux.add('FLAG_GAME_CLEAR');
  await P.laisser(30);
  // le marin du guichet vérifie le billet et fait passer
  await P.parlerA((o) => /seaman/.test(o.id) && /P01R0101_000/.test(o.def.script || ''), [0, 0]);
  await P.laisser(60);
  await P.versCarte('SS_AQUA_OLIVINE_PORT_EXTERIOR'); await P.laisser(30);
  // le marin de la passerelle fait monter à bord
  await P.parlerA('obj_P01R0102_seaman_2', [0, 0]); await P.laisser(200);
  if (T.zone.id !== 'SS_AQUA_1F') await P.versCarte('SS_AQUA_1F');
  await P.laisser(120);
  ok(`à bord de l'Aquaria (VAR_SCENE_SS_AQUA = ${T.etat.vars.VAR_SCENE_SS_AQUA ?? 0})`);
  // la traversée : la petite-fille du gentleman à retrouver dans le bateau, puis l'arrivée
  const pieces = ['SS_AQUA_1F_NORTHWEST_ROOMS', 'SS_AQUA_CAPTAIN_ROOM', 'SS_AQUA_1F_NORTHEAST_ROOMS', 'SS_AQUA_1F_SOUTHWEST_ROOMS', 'SS_AQUA_1F_SOUTHEAST_ROOMS', 'SS_AQUA_B1F'];
  for (let tour = 0; tour < 4 && !T.etat.drapeaux.has('FLAG_BOAT_ARRIVED'); tour++) {
    await P.toutParler();
    for (const piece of pieces) {
      if (T.etat.drapeaux.has('FLAG_BOAT_ARRIVED')) break;
      try {
        if (piece === 'SS_AQUA_CAPTAIN_ROOM') {
          // le couloir du capitaine ne se rejoint que par la cale (B1F) : on y descend, on remonte par l'autre escalier
          await P.allerZone('SS_AQUA_B1F');
          const w = T.zone.warps.find((q) => q.vers === 'SS_AQUA_1F' && q.n === 10);
          await P.porte(w.x, w.y, 'SS_AQUA_1F'); await P.porte(49, 15, 'SS_AQUA_CAPTAIN_ROOM');
        } else await P.allerZone(piece);
      } catch (e) { if (process.env.DEBUG) console.log('  (', piece, e.message.slice(0, 100), ')'); continue; }
      await P.laisser(60); await P.toutParler();
      if (process.env.DEBUG) console.log('  ', piece, 'VAR_SCENE_SS_AQUA', T.etat.vars.VAR_SCENE_SS_AQUA);
    }
  }
  assert.ok(T.etat.drapeaux.has('FLAG_BOAT_ARRIVED'), `le bateau n'arrive pas (VAR_SCENE_SS_AQUA = ${T.etat.vars.VAR_SCENE_SS_AQUA}) ${P.vus.slice(-3).join(' | ')}`);
  ok('la traversée : la petite-fille retrouvée, le bateau arrive');
  await P.allerZone('SS_AQUA_1F');
  await P.laisser(60);
  // le marin de la sortie s'écarte : on est arrivé
  await P.parlerA('obj_P01R0301_seaman_2_2', [0, 0]); await P.laisser(60);
  const sortie = T.M.warp(24, 19);
  assert.equal(sortie?.vers, 'SS_AQUA_VERMILION_PORT_EXTERIOR', 'la sortie du bateau mène à Carmin');
  await P.porte(24, 19, 'SS_AQUA_VERMILION_PORT_EXTERIOR');
  await P.versCarte('SS_AQUA_VERMILION_PORT_INTERIOR'); await P.laisser(60);
  try { await P.versCarte('VERMILION'); } catch { await P.parlerA('obj_P01R0103_seaman_2', [0, 0]); await P.laisser(60); await P.versCarte('VERMILION'); }
  ok('débarquement au port de Carmin, puis Carmin sur Mer (Kanto)');
});

await passage('Le Train Magnétique : de Doublonville à Safrania', async () => {
  const { objetDe } = await import(B + 'donnees/evenements-hg.js');
  const P = await partie(G, { zone: 'GOLDENROD_MAGNET_TRAIN_STATION_1F', warp: 0 });
  const { T } = P;
  equiper(T, JOHTO, { [objetDe('ITEM_PASS')]: 1 });
  for (const f of ['FLAG_GAME_CLEAR', 'FLAG_RESTORED_POWER']) T.etat.drapeaux.add(f);
  // on ressort, puis on entre dans la gare (le policier s'écarte quand le courant est revenu)
  await P.allerZone('GOLDENROD'); await P.allerZone('GOLDENROD_MAGNET_TRAIN_STATION_1F'); await P.laisser(30);
  // le contrôleur vérifie le PASSE au portillon, puis le quai
  await P.rejoindre(6, 6); await P.laisser(80);
  assert.equal(T.etat.vars.VAR_UNK_411E, 1, 'le PASSE est accepté');
  // l'escalier du quai : le train part tout de suite (script du quai), on ne s'arrête pas sur la carte du quai
  await P.rejoindre(3, 3, 25); await P.laisser(300);
  for (let i = 0; i < 20 && !/^SAFFRON_MAGNET_TRAIN_STATION_1F|^SAFFRON$/.test(T.zone.id); i++) await P.laisser(60);
  assert.ok(/^SAFFRON/.test(T.zone.id), T.zone.id);
  ok(`le PASSE, le quai, la traversée en train jusqu'à Safrania (${T.zone.id})`);
  await P.allerZone('SAFFRON');
  ok('la gare de Safrania, puis la ville');
});

await passage('La Tour Carillon et HO-OH', async () => {
  const { objetDe } = await import(B + 'donnees/evenements-hg.js');
  const P = await partie(G, { zone: 'ECRUTEAK_BELL_TOWER_BARRIER_STATION', warp: 0 });
  const { T } = P;
  equiper(T, JOHTO, { [objetDe('ITEM_RAINBOW_WING')]: 1, [objetDe('ITEM_CLEAR_BELL')]: 1 });
  T.etat.drapeaux.add('FLAG_GAME_CLEAR'); T.etat.drapeaux.add('TOUT_CS');
  T.etat.drapeaux.add('FLAG_UNK_093');   // la Tour Radio délivrée : le directeur a remis l'Arcenci'Aile
  // les Kimonos du Théâtre de Rosalia ont dansé : elles attendent au sommet
  T.etat.vars.VAR_UNK_40FA = 1; T.etat.drapeaux.delete('FLAG_HIDE_BELL_TOWER_SUMMIT_KIMONO_GIRLS');
  await P.laisser(30);
  // le Sage du poste ouvre le passage à qui a le BADGE BRUME
  await P.parlerA('obj_T27R0201_bozu', [0, 0]); await P.laisser(60);
  await P.allerZone('ECRUTEAK_BELL_TOWER_BARRIER_STATION_CORRIDOR');
  await P.allerZone('BELLCHIME_TOWER');
  ok('le poste du Sage, le couloir, le Chemin du Carillon');
  await P.allerZone('BELL_TOWER_1F'); await P.laisser(60);
  // le Sage de l'entrée arrête le joueur, voit l'Arcenci'Aile et le laisse monter
  await P.rejoindre(8, 12); await P.laisser(100);
  assert.equal(T.etat.vars.VAR_UNK_40F3, 1, 'le Sage laisse passer');
  const etages = ['BELL_TOWER_2F', 'BELL_TOWER_3F', 'BELL_TOWER_4F', 'BELL_TOWER_5F', 'BELL_TOWER_6F', 'BELL_TOWER_7F', 'BELL_TOWER_8F', 'BELL_TOWER_9F', 'BELL_TOWER_10F', 'BELL_TOWER_ROOF'];
  await P.allerLieu('BELL_TOWER_ROOF'); await P.laisser(40);
  ok('la Tour Carillon, étage par étage jusqu\'au toit');
  const avant = P.combats.length;
  // la danse des Kimonos (devant elles), puis HO-OH se pose : on lui parle
  await P.rejoindre(15, 20); await P.laisser(600);
  for (let i = 0; i < 4 && P.combats.length === avant; i++) {
    const hooh = T.objets.find((o) => o.visible && /hou_obj/i.test(o.id));
    if (hooh) await P.parlerA(hooh.id, [0, 0]);
    await P.laisser(200);
  }
  assert.ok(P.combats.some((c) => c.type === 'sauvage' && (c.espece === 250 || /ho-?oh/i.test(c.espece))), `pas de combat contre HO-OH (${T.zone.id} ${T.joueur.x},${T.joueur.y}) ${P.vus.slice(-3).join(' | ')}`);
  ok('sur le toit, HO-OH : le combat');
});

await passage('Le QG de la Team Rocket (Acajou) : les pièges et le combat avec Peter', async () => {
  const P = await partie(G, { zone: 'TEAM_ROCKET_HEADQUARTERS_B1F', warp: 0 });
  const { T } = P;
  equiper(T, JOHTO.slice(0, 6));
  await P.laisser(60);
  const avant = P.combats.length;
  // une dalle piégée : le POKéMON caché (Voltorbe, Smogo, Racaillou) attaque
  const piege = T.M.declencheurs.find((d) => /combat_sauvage_hg/.test(texteScript(T, d.script)));
  assert.ok(piege, 'des dalles piégées');
  await P.rejoindre(piege.x, piege.y); await P.laisser(100);
  // puis l'escalier, en évitant les dalles qui renvoient à l'entrée
  await P.allerLieu('TEAM_ROCKET_HEADQUARTERS_B2F'); await P.laisser(100);
  const pieges = P.combats.slice(avant).filter((c) => c.type === 'sauvage');
  if (process.env.DEBUG) console.log('  combats', P.combats.slice(avant).map((c) => c.espece || c.nom));
  assert.ok(pieges.length >= 1, `aucun piège n'a sonné (${P.combats.slice(avant).map((c) => c.espece || c.nom).join(', ')})`);
  ok(`le 1er sous-sol : les statues de Persian sonnent l'alarme (${P.combats.slice(avant).filter((c) => c.type === 'dresseur').length} sbires), une dalle piégée (${[...new Set(pieges.map((c) => c.espece))].join(', ')}), l'escalier du 2e sous-sol`);
});

await passage('L\'ascenseur du Centre Commercial, un échange, le Casino', async () => {
  const P = await partie(G, { zone: 'GOLDENROD_DEPARTMENT_STORE_1F', warp: 0 });
  const { T } = P;
  equiper(T, JOHTO.slice(0, 3));
  await P.laisser(30);
  await P.allerLieu('GOLDENROD_DEPARTMENT_STORE_ELEVATOR'); await P.laisser(30);
  // la liftière : on choisit le 3e étage du menu, puis on ressort par la porte de la cabine
  await P.parlerA('obj_T25R1007_gswoman6', [2, 0]); await P.laisser(80);
  assert.ok(T.etat.warpDyn?.zone, 'l\'étage choisi règle la sortie de la cabine');
  const dest = T.etat.warpDyn.zone;
  await P.porte(3, 6, dest);
  ok(`l'ascenseur : la liftière, le menu des étages, la cabine mène à ${dest}`);

  // l'échange de Mauville : un CHÉTIFLOR contre un ONIX
  await P.teleporter({ zone: 'VIOLET_BELLSPROUT_ONYX_TRADE_HOUSE', warp: 0 });
  T.etat.equipe.unshift(T.pokemon.creer(69, 12));
  const echangeur = T.objets.find((o) => o.visible && o.def.script && /echange_charger 0/.test(texteScript(T, o.def.script)));
  assert.ok(echangeur, 'l\'échangeur de Mauville');
  await P.parlerA(echangeur.id, [0, 0, 0]); await P.laisser(60);
  assert.equal(T.etat.equipe[0].sp, 95, 'CHÉTIFLOR échangé contre ONIX');
  ok('l\'échange de Mauville : CHÉTIFLOR donné, ONIX reçu');

  // le Casino de Doublonville : une machine lance l'écran de la machine à sous d'Odyssée
  await P.teleporter({ zone: 'GOLDENROD_GAME_CORNER', warp: 0 });
  const { objetDe } = await import(B + 'donnees/evenements-hg.js');
  T.etat.jetons = 50; T.etat.sac[objetDe('ITEM_COIN_CASE')] = 1;
  const machine = (T.d.zones[T.zone.id].panneaux || []).find((p2) => /ecran casino/.test(texteScript(T, p2.script)));
  assert.ok(machine, 'une machine à sous dans le Casino');
  const [mx, my] = [machine.x, machine.y + 1];
  await P.rejoindre(mx, my); for (let i = 0; i < 8; i++) await P.pasA({ dir: 0 });
  for (let i = 0; i < 20 && !T.ctxs.length && !T.ui; i++) { await P.pasA({}); await P.pasA({ a: true }); }
  await P.lireA([0, 0]);
  assert.ok(P.ecrans.includes('casino'), `l'écran de la machine à sous (${T.joueur.x},${T.joueur.y} dir ${T.joueur.dir} machine ${machine.x},${machine.y} ${JSON.stringify(machine)} vus ${P.vus.slice(-3).join(' | ')})`);
  ok('le Casino : une machine ouvre la machine à sous d\'Odyssée (jetons du jeu)');
});

console.log(`\n${n} vérifications passées${echecs ? `, ${echecs} passage(s) en échec` : ''}.`);
process.exit(echecs ? 1 : 0);
