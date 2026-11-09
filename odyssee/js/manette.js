// odyssee/js/manette.js — jouer à la manette (Gamepad API, disposition « standard » : Xbox, PlayStation, Switch Pro…).
// Les boutons deviennent les touches du jeu (input.js), exactement comme le clavier : les écrans n'ont rien à savoir.
//   croix ou stick gauche : se déplacer, choisir     A (croix PS) : parler, valider     B (rond PS) : annuler, menu
//   X (carré PS) maintenu : courir                   Y (triangle PS) : vélo             Start / Options : menu
//   LB : carte de la région     RB : journal des quêtes     LT : course continue     RT : afficher / replier le HUD
// Le bouton Vue / Share / Select reste au Hub (menu Arcadia). Le menu-manette commun du Hub (shared/padnav.js) se tait
// tant qu'Odyssée a une manette en main (attribut data-manette sur la page).
const BOUTONS = { 0: 'a', 1: 'b', 2: 'run', 3: 'velo', 9: 'menu', 4: 'map', 5: 'quests', 6: 'autorun', 7: 'hud' };
const SEUIL = 0.5;            // inclinaison du stick qui vaut une direction
const REPETE = [380, 120];    // répétition d'une direction tenue (menus) : premier délai, puis cadence (ms)

export function brancherManette(input) {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  let avant = {}, dir = null, depuis = 0, derniere = 0, active = false;
  const poll = (now) => {
    requestAnimationFrame(poll);
    const pads = navigator.getGamepads(); let gp = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { gp = p; break; }
    if (!gp) for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { if (active) { relacherTout(); active = false; document.documentElement.removeAttribute('data-manette'); } return; }
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    // boutons : appui au front montant, relâche au front descendant (la course se tient)
    for (const [i, k] of Object.entries(BOUTONS)) {
      const on = b(+i);
      if (on && !avant[i]) { marquer(); input.appui(k, false); }
      else if (!on && avant[i]) input.relache(k);
      avant[i] = on;
    }
    // directions : croix d'abord, sinon le stick (la plus grande inclinaison)
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let d = b(12) ? 'up' : b(13) ? 'down' : b(14) ? 'left' : b(15) ? 'right' : null;
    if (!d && Math.max(Math.abs(ax), Math.abs(ay)) > SEUIL) d = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right') : (ay < 0 ? 'up' : 'down');
    if (d !== dir) {
      if (dir) input.relache(dir);
      dir = d; depuis = derniere = now;
      if (d) { marquer(); input.appui(d, false); }
    } else if (d && now - depuis > REPETE[0] && now - derniere > REPETE[1]) {
      // tenue : les menus reçoivent des répétitions (comme une touche du clavier tenue), la marche lit held / dirOrder
      derniere = now; input.emit(d, true);
    }
  };
  const marquer = () => { if (!active) { active = true; document.documentElement.setAttribute('data-manette', 'odyssee'); } };
  const relacherTout = () => { for (const k of Object.values(BOUTONS)) input.relache(k); if (dir) input.relache(dir); dir = null; avant = {}; };
  addEventListener('gamepaddisconnected', () => relacherTout());
  requestAnimationFrame(poll);
  return { relacherTout };
}
