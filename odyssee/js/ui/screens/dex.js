// odyssee/js/ui/screens/dex.js — Pokédex
import { esc } from '../ui.js';
import { SPECIES } from '../../data/species.js';
import { ORIGINALES } from '../../data/remplacants.js';
import { SPAWNS } from '../../world/region.js';
import { ASSETS } from '../../assets.js';
import { typeTag, screen } from './common.js';

const SPAWN_LABELS_FALLBACK = {
  r1: 'Route 1', r2: 'Route 2', r3: 'Route 3', r4: 'Route 4', r5: 'Route 5',
  r6: 'Route 6', r7: 'Route 7', r8: 'Route 8', r9: 'Route 9', r10: 'Route 10',
  r11: 'Route 11', r12: 'Route 12', r13: 'Route 13', r14: 'Route 14', r15: 'Route 15',
  r16: 'Route 16', r17: 'Route 17', r18: 'Route 18',
  foret1: 'Forêt Murmurante', grotte1: 'Grotte de Brume', marais: 'Marais de Floralia',
  centrale: 'Vieille Centrale', canyon: 'Canyon Brûlant', tour: 'Tour Céleste',
  ile: 'Île Écume', mines: 'Mines de Fer', volcan: 'Mont Braise',
  glacier: 'Col du Glacier', grotteGlace: 'Caverne de Glace', ruines: 'Ruines Anciennes',
  victory: 'Route Victoire', 'foret-ancienne': 'Forêt Ancienne', 'caverne-profonde': 'Caverne Profonde'
};

/**
 * Retourne les lieux (routes, forêts, grottes, cours d'eau) où une espèce sauvage apparaît.
 */
export function getSpeciesHabitats(game, sp) {
  const target = Number(sp);
  const zoneNamesBySpawnKey = {};
  const zones = (game?.world?.overworld?.zones || game?.world?.maps?.monde?.zones || []);
  for (const z of zones) {
    const sk = z?.spawns || z?.route;
    if (sk && z?.name && !zoneNamesBySpawnKey[sk]) {
      zoneNamesBySpawnKey[sk] = z.name;
    } else if (z?.enc && z?.name) {
      for (const [k, v] of Object.entries(SPAWNS)) {
        if (v?.land === z.enc && !zoneNamesBySpawnKey[k]) zoneNamesBySpawnKey[k] = z.name;
      }
    }
  }
  const found = [];
  const seenLabels = new Set();
  for (const [key, data] of Object.entries(SPAWNS)) {
    if (!data) continue;
    const inLand = Array.isArray(data.land) && data.land.some((r) => Number(r[0]) === target);
    const inWater = Array.isArray(data.water) && data.water.some((r) => Number(r[0]) === target);
    const inFish = Array.isArray(data.fish) && data.fish.some((r) => Number(r[0]) === target);
    if (inLand || inWater || inFish) {
      const label = zoneNamesBySpawnKey[key] || SPAWN_LABELS_FALLBACK[key] || key;
      if (!seenLabels.has(label)) {
        seenLabels.add(label);
        const methods = [];
        if (inLand) methods.push('Herbes/Grottes');
        if (inWater) methods.push('Surf');
        if (inFish) methods.push('Pêche');
        found.push({ key, label, methods });
      }
    }
  }
  return found;
}

/* ================= POKÉDEX ================= */
export function dexScreen(game, opts = {}) {
  const ui = game.ui, st = game.state;
  return new Promise((resolve) => {
    const s = screen(ui, 'dex-scr');
    // les créatures d'Odyssée d'abord (numéros 001 à 052), puis les Pokémon venus d'ailleurs ; tant qu'elles sont
    // remplacées par des Pokémon, seules celles déjà rencontrées (ancienne sauvegarde) restent dans la liste
    const ids = Object.keys(SPECIES).map(Number).filter((id) => ORIGINALES || id < 1000 || st.dex.seen.includes(id))
      .sort((a, b) => (a >= 1000) === (b >= 1000) ? a - b : a >= 1000 ? -1 : 1);
    const num = (id) => (SPECIES[id].no ? String(SPECIES[id].no).padStart(3, '0') : '#' + String(id).padStart(3, '0'));
    let i = 0;
    if (opts.focusSp) {
      const targetIdx = ids.indexOf(Number(opts.focusSp));
      if (targetIdx >= 0) i = targetIdx;
    }
    const seen = new Set(st.dex.seen), caught = new Set(st.dex.caught);
    const counts = st.dex.seenCount || st.dex.counts || {};
    s.innerHTML = `<div class="dex-left box"><img class="dex-spr" alt=""><div class="dex-info"></div></div><div class="dex-right box"><div class="dex-count"><span>POKÉDEX</span><span>Vus <b>${seen.size}</b> · Capturés <b>${caught.size}</b> / ${ids.length}</span></div><div class="dex-prog"><u style="width:${(100 * caught.size / Math.max(1, ids.length)).toFixed(1)}%"></u><i style="width:${(100 * seen.size / Math.max(1, ids.length)).toFixed(1)}%"></i></div><div class="list-items dex-list"></div></div>`;
    const list = s.querySelector('.dex-list'), spr = s.querySelector('.dex-spr'), info = s.querySelector('.dex-info');
    list.innerHTML = ids.map((id, idx) => `<div class="list-row" data-idx="${idx}" data-i="${id}"><span class="cur">▶</span><span class="dexn">${num(id)}</span><span class="lbl">${seen.has(id) ? esc(SPECIES[id].n) : '-----'}</span>${caught.has(id) ? '<span class="ball-mini"></span>' : ''}</div>`).join('');
    const rows = [...list.children];
    const draw = () => {
      rows.forEach((r, k) => r.classList.toggle('on', k === i)); rows[i].scrollIntoView({ block: 'nearest' });
      const id = ids[i], S = SPECIES[id];
      const seenCount = counts[id] || (seen.has(id) ? 1 : 0);
      const showHabitat = seenCount >= 5 || caught.has(id);
      const habitats = showHabitat ? getSpeciesHabitats(game, id) : [];
      const habitatHtml = showHabitat
        ? `<div class="dex-habitat"><div class="dex-habitat-title">📍 EMPLACEMENT / HABITAT <span class="dex-seen-cnt">(Vu ${seenCount}×)</span></div><div class="dex-habitat-tags">${habitats.length ? habitats.map((h) => `<span class="dex-hab-pill" title="${esc(h.methods.join(', '))}">${esc(h.label)}</span>`).join('') : '<span class="dex-hab-none">Habitat inconnu (Évolution / Don / Unique)</span>'}</div></div>`
        : seen.has(id)
          ? `<div class="dex-habitat locked"><div class="dex-habitat-title">📍 EMPLACEMENT INCONNU <span class="dex-seen-cnt">(Vu ${seenCount} / 5 fois)</span></div><div class="dex-hab-hint">Observe cette espèce encore ${Math.max(1, 5 - seenCount)} fois (ou capture-la) pour localiser son habitat.</div></div>`
          : '';
      if (seen.has(id)) { spr.src = ASSETS.front(id); spr.style.visibility = ''; spr.classList.toggle('shadowed', !caught.has(id)); }
      else spr.style.visibility = 'hidden';
      info.innerHTML = caught.has(id)
        ? `<div class="dex-name">${num(id)} ${esc(S.n)}</div><div>${esc(S.genus || '')}</div><div>${S.t.map(typeTag).join(' ')}</div><div>Taille ${(S.h / 10).toLocaleString('fr-FR')} m · Poids ${(S.w / 10).toLocaleString('fr-FR')} kg</div><p>${esc(S.dex)}</p>${habitatHtml}`
        : seen.has(id)
          ? `<div class="dex-name">${num(id)} ${esc(S.n)}</div><div>${S.t.map(typeTag).join(' ')}</div><p>Capture cette créature pour débloquer sa description complète.</p>${habitatHtml}`
          : `<div class="dex-unknown"><div class="dex-q">?</div><div class="dex-name">${num(id)} ?????</div><p>Pas encore rencontrée. Les hautes herbes, les grottes et l'eau cachent encore bien des créatures.</p></div>`;
    };
    rows.forEach((r, idx) => {
      r.addEventListener?.('click', (e) => {
        e.stopPropagation();
        i = idx;
        ui.sound.sfx('blip');
        draw();
        const id = ids[i];
        if (seen.has(id)) {
          try { ui.sound?.cry?.(id); } catch (err) {}
        }
      });
    });
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
