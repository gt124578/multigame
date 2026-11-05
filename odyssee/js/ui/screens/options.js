// odyssee/js/ui/screens/options.js — options
import { el } from '../ui.js';
import { screen } from './common.js';

/* ================= OPTIONS ================= */
export function optionsScreen(game) {
  const ui = game.ui, snd = game.sound;
  return new Promise((resolve) => {
    const s = screen(ui, 'opt-scr', 'OPTIONS');
    const box = el('div', 'box opts'); s.appendChild(box);
    const speeds = ['Lente', 'Normale', 'Rapide', 'Instantanée'];
    const runSpeeds = ['Normale (1×)', 'Rapide (1.7×)', 'Turbo (2.5×)'];
    let i = 0;
    const rows = () => [
      ['Vitesse du texte', speeds[ui.textSpeed]],
      ['Vitesse de course', runSpeeds[game.runSpeed ?? 1]],
      ['Volume', '■'.repeat(Math.round(snd.vol * 10)) + '□'.repeat(10 - Math.round(snd.vol * 10))],
      ['Pokémon qui suit', game.followOff ? 'Non' : 'Oui'],
      ['Style musical', snd.style === 'retro' ? 'Rétro (8 bits)' : 'Moderne'],
      ['Retour', ''],
    ];
    const draw = () => { box.innerHTML = rows().map(([a, b], k) => `<div class="list-row ${k === i ? 'on' : ''}"><span class="cur">▶</span><span class="lbl">${a}</span><span class="rgt">${b ? '◀ ' + b + ' ▶' : ''}</span></div>`).join('') + '<div class="keys"><b>Commandes</b><br>Flèches ou ZQSD : se déplacer · Espace / Entrée : valider, parler<br>Échap : annuler, menu · Maj : sprint · R : basculer course rapide/turbo · C : carte</div>'; };
    draw();
    const pop = ui.input.push((k) => {
      const nRows = 6;
      if (k === 'up') i = (i + nRows - 1) % nRows; else if (k === 'down') i = (i + 1) % nRows;
      else if (k === 'left' || k === 'right' || (k === 'a' && (i === 1 || i === 3 || i === 4))) {
        const d = k === 'left' ? -1 : 1;
        if (i === 0) { ui.textSpeed = (ui.textSpeed + d + 4) % 4; try { localStorage.setItem('odyssee-textspeed', ui.textSpeed); } catch (e) {} }
        if (i === 1) {
          game.runSpeed = ((game.runSpeed ?? 1) + d + 3) % 3;
          try { localStorage.setItem('odyssee-runspeed', game.runSpeed); } catch (e) {}
          game.hud?.update(true);
          game.ui.updateRunKeyHint?.(game.autoRun, game.runSpeed);
        }
        if (i === 2) snd.setVolume(Math.max(0, Math.min(1, Math.round(snd.vol * 10 + d) / 10)));
        if (i === 4) snd.setStyle?.(snd.style === 'retro' ? 'moderne' : 'retro');
        if (i === 3) { game.followOff = !game.followOff; try { localStorage.setItem('odyssee-suiveur', game.followOff ? '0' : '1'); } catch (e) {} }
      } else if (k === 'b' || (k === 'a' && i === 5)) { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); return; }
      else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}
