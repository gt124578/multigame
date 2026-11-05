// odyssee/js/ui/screens/dex.js — Pokédex
import { esc } from '../ui.js';
import { SPECIES } from '../../data/species.js';
import { ORIGINALES } from '../../data/remplacants.js';
import { ASSETS } from '../../assets.js';
import { typeTag, screen } from './common.js';

/* ================= POKÉDEX ================= */
export function dexScreen(game) {
  const ui = game.ui, st = game.state;
  return new Promise((resolve) => {
    const s = screen(ui, 'dex-scr');
    // les créatures d'Odyssée d'abord (numéros 001 à 052), puis les Pokémon venus d'ailleurs ; tant qu'elles sont
    // remplacées par des Pokémon, seules celles déjà rencontrées (ancienne sauvegarde) restent dans la liste
    const ids = Object.keys(SPECIES).map(Number).filter((id) => ORIGINALES || id < 1000 || st.dex.seen.includes(id))
      .sort((a, b) => (a >= 1000) === (b >= 1000) ? a - b : a >= 1000 ? -1 : 1);
    const num = (id) => (SPECIES[id].no ? String(SPECIES[id].no).padStart(3, '0') : '#' + String(id).padStart(3, '0'));
    let i = 0;
    const seen = new Set(st.dex.seen), caught = new Set(st.dex.caught);
    s.innerHTML = `<div class="dex-left box"><img class="dex-spr" alt=""><div class="dex-info"></div></div><div class="dex-right box"><div class="dex-count"><span>POKÉDEX</span><span>Vus <b>${seen.size}</b> · Capturés <b>${caught.size}</b> / ${ids.length}</span></div><div class="dex-prog"><u style="width:${(100 * caught.size / Math.max(1, ids.length)).toFixed(1)}%"></u><i style="width:${(100 * seen.size / Math.max(1, ids.length)).toFixed(1)}%"></i></div><div class="list-items dex-list"></div></div>`;
    const list = s.querySelector('.dex-list'), spr = s.querySelector('.dex-spr'), info = s.querySelector('.dex-info');
    list.innerHTML = ids.map((id) => `<div class="list-row" data-i="${id}"><span class="cur">▶</span><span class="dexn">${num(id)}</span><span class="lbl">${seen.has(id) ? esc(SPECIES[id].n) : '-----'}</span>${caught.has(id) ? '<span class="ball-mini"></span>' : ''}</div>`).join('');
    const rows = [...list.children];
    const draw = () => {
      rows.forEach((r, k) => r.classList.toggle('on', k === i)); rows[i].scrollIntoView({ block: 'nearest' });
      const id = ids[i], S = SPECIES[id];
      if (seen.has(id)) { spr.src = ASSETS.front(id); spr.style.visibility = ''; spr.classList.toggle('shadowed', !caught.has(id)); }
      else spr.style.visibility = 'hidden';
      info.innerHTML = caught.has(id) ? `<div class="dex-name">${num(id)} ${esc(S.n)}</div><div>${esc(S.genus || '')}</div><div>${S.t.map(typeTag).join(' ')}</div><div>Taille ${(S.h / 10).toLocaleString('fr-FR')} m · Poids ${(S.w / 10).toLocaleString('fr-FR')} kg</div><p>${esc(S.dex)}</p>` : seen.has(id) ? `<div class="dex-name">${num(id)} ${esc(S.n)}</div><p>Capture cette créature pour en savoir plus.</p>` : `<div class="dex-unknown"><div class="dex-q">?</div><div class="dex-name">${num(id)} ?????</div><p>Pas encore rencontrée. Les hautes herbes, les grottes et l'eau cachent encore bien des créatures.</p></div>`;
    };
    draw();
    const pop = ui.input.push((k) => {
      if (k === 'up') {
        i = (i - 1 + ids.length) % ids.length;
        ui.sound.sfx('blip');
        draw();
      } else if (k === 'down') {
        i = (i + 1) % ids.length;
        ui.sound.sfx('blip');
        draw();
      } else if (k === 'left') {
        i = Math.max(0, i - 10);
        ui.sound.sfx('blip');
        draw();
      } else if (k === 'right') {
        i = Math.min(ids.length - 1, i + 10);
        ui.sound.sfx('blip');
        draw();
      } else if (k === 'a') {
        const id = ids[i];
        if (seen.has(id)) {
          try { ui.sound?.cry?.(id); } catch (e) {}
          if (spr) {
            spr.style.transform = 'scale(1.2)';
            setTimeout(() => { if (spr) spr.style.transform = ''; }, 200);
          }
        } else {
          try { ui.sound?.sfx?.('cancel'); } catch (e) {}
        }
      } else if (k === 'b') {
        pop();
        s.remove();
        ui.sound.sfx('cancel');
        resolve();
      }
    });
  });
}
