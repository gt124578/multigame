// odyssee/js/ui/screens/pc.js — boîtes PC, maître des capacités, PC des natures
import { esc } from '../ui.js';
import { SPECIES } from '../../data/species.js';
import { MOVES } from '../../data/moves.js';
import { moveDesc } from '../../data/moveDescriptions.js';
import { ITEMS, itemName, giveHeldItem, takeHeldItem } from '../../core/items.js';
import { getAbility, abilityName } from '../../data/abilities.js';
import { monName, STAT_NAMES, NATURES, natureName, natureEffect, refreshStats } from '../../core/mon.js';
import { ASSETS } from '../../assets.js';
import { TYPE_FR, TYPE_COL, typeTag, hpCol, statusTag, gender, screen, closer } from './common.js';
import { partyScreen, summaryScreen } from './party.js';

/* ================= BOÎTE PC FAÇON 5G (NOIR 2 / BLANC 2) ================= */
const BOX_THEMES = [
  { name: 'Prairie', bg: '#2b5832', grad: 'linear-gradient(135deg, #1b3820, #356b3e)' },
  { name: 'Forêt', bg: '#1c3e24', grad: 'linear-gradient(135deg, #102516, #2a5a35)' },
  { name: 'Océan', bg: '#1e446e', grad: 'linear-gradient(135deg, #122842, #29609c)' },
  { name: 'Cité', bg: '#3a4456', grad: 'linear-gradient(135deg, #222834, #4e5c74)' },
  { name: 'Désert', bg: '#6b542c', grad: 'linear-gradient(135deg, #42341b, #8e703a)' },
  { name: 'Volcan', bg: '#6e2b24', grad: 'linear-gradient(135deg, #441a16, #943a30)' },
  { name: 'Neige', bg: '#34576a', grad: 'linear-gradient(135deg, #1e333e, #4a7d99)' },
  { name: 'Cosmos', bg: '#342354', grad: 'linear-gradient(135deg, #1e1432, #523784)' },
];

function ensureBoxSlots(boxList) {
  const occupied = new Set();
  for (const m of boxList) {
    if (m && m.box != null && m.slot != null && m.box >= 0 && m.box < 8 && m.slot >= 0 && m.slot < 30) {
      const k = `${m.box}:${m.slot}`;
      if (!occupied.has(k)) { occupied.add(k); continue; }
    }
    if (m) { m.box = null; m.slot = null; }
  }
  let b = 0, s = 0;
  for (const m of boxList) {
    if (!m || m.box != null) continue;
    while (occupied.has(`${b}:${s}`)) {
      s++;
      if (s >= 30) { s = 0; b = (b + 1) % 8; }
    }
    m.box = b; m.slot = s;
    occupied.add(`${b}:${s}`);
    s++;
    if (s >= 30) { s = 0; b = (b + 1) % 8; }
  }
}

function renderPCPokemonPreview(m) {
  if (!m) {
    return `<div class="pc-preview-empty">
      <div class="pc-empty-icon">?</div>
      <div class="pc-empty-text">Sélectionnez une créature</div>
    </div>`;
  }
  const S = SPECIES[m.sp] || {};
  const abilityKey = getAbility(m);
  const abilityTxt = abilityName(abilityKey);
  const itName = m.item ? (ITEMS[m.item]?.name || m.item) : 'Aucun';
  const rHp = m.hp / m.stats[0];
  return `
    <div class="pc-prev-card">
      <div class="pc-prev-head">
        <span class="pc-prev-name">${esc(monName(m))}${gender(m)}</span>
        <span class="pc-prev-lvl">N.${m.lvl}</span>
      </div>
      <div class="pc-prev-art">
        <img class="pc-prev-spr${m.shadow ? ' shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny, m.shadow)}" alt="" onerror="this.src='${ASSETS.icon(m.sp, m.shadow)}'">
      </div>
      <div class="pc-prev-types">
        ${(S.t || ['normal']).map(typeTag).join(' ')}
        ${statusTag(m)}
      </div>
      <div class="pc-prev-hp">
        <b>PV</b>
        <i><u style="width:${Math.max(0, rHp * 100)}%;background:${hpCol(rHp)}"></u></i>
        <span>${m.hp}/${m.stats[0]}</span>
      </div>
      <div class="pc-prev-info">
        <div class="pc-info-row"><b>Talent :</b> <span class="pc-val-ability">${esc(abilityTxt)}</span></div>
        <div class="pc-info-row"><b>Objet :</b> <span class="pc-val-item">${esc(itName)}</span></div>
      </div>
      <div class="pc-prev-stats">
        <div class="pc-st-col"><span>ATT</span><b>${m.stats[1]}</b></div>
        <div class="pc-st-col"><span>DÉF</span><b>${m.stats[2]}</b></div>
        <div class="pc-st-col"><span>SPA</span><b>${m.stats[3]}</b></div>
        <div class="pc-st-col"><span>SPD</span><b>${m.stats[4]}</b></div>
        <div class="pc-st-col"><span>VIT</span><b>${m.stats[5]}</b></div>
      </div>
      <div class="pc-prev-moves">
        ${m.moves.map((x) => {
          const M = MOVES[x.id];
          if (!M) return '';
          return `<div class="pc-prev-mv" style="--tc:${TYPE_COL[M.t]}">
            <span class="pc-mv-type">${TYPE_FR[M.t]}</span>
            <span class="pc-mv-name">${esc(M.n)}</span>
            <span class="pc-mv-pp">${x.pp}/${M.pp}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

export async function pcScreen(game) {
  const ui = game.ui, st = game.state;
  ui.sound.sfx('pc');
  if (!st.box) st.box = [];
  ensureBoxSlots(st.box);

  return new Promise((resolve) => {
    const s = screen(ui, 'pc-storage-scr');
    let curBox = 0;
    let selArea = 'grid'; // 'grid' | 'party'
    let selSlot = 0; // 0..29 pour grid, 0..5 pour party
    let inHand = null; // { from: 'grid'|'party', box: number, slot: number, mon: Object }
    let busy = false;

    const getMonAt = (area, slot) => {
      if (area === 'grid') return st.box.find((m) => m.box === curBox && m.slot === slot);
      return st.party[slot];
    };

    const closePC = closer(ui, s, () => pop, resolve, 'pc', () => {
      if (inHand) {
        // Reposer le Pokémon en main à son emplacement d'origine
        if (inHand.from === 'grid') {
          inHand.mon.box = inHand.box; inHand.mon.slot = inHand.slot;
          if (!st.box.includes(inHand.mon)) st.box.push(inHand.mon);
        } else if (inHand.from === 'party') {
          if (!st.party.includes(inHand.mon)) st.party.splice(inHand.slot, 0, inHand.mon);
        }
        inHand = null;
      }
      game.save(true);
    });
    const sortBox = (boxIdx, criterion) => {
      if (inHand && inHand.from === 'grid' && inHand.box === boxIdx) {
        ui.sound.sfx('bump');
        return;
      }
      const monsInBox = st.box.filter((m) => m && m.box === boxIdx);
      if (monsInBox.length <= 1) {
        ui.sound.sfx('blip');
        return;
      }
      monsInBox.sort((a, b) => {
        const sa = SPECIES[a.sp] || {};
        const sb = SPECIES[b.sp] || {};
        const numA = Number(a.sp) || 9999;
        const numB = Number(b.sp) || 9999;
        const nameA = a.nick || sa.n || String(a.sp);
        const nameB = b.nick || sb.n || String(b.sp);
        const lvlA = a.lvl || 1;
        const lvlB = b.lvl || 1;
        const typeA = (sa.t && sa.t[0]) || '';
        const typeB = (sb.t && sb.t[0]) || '';

        if (criterion === 'dex') {
          if (numA !== numB) return numA - numB;
          if (lvlB !== lvlA) return lvlB - lvlA;
          return nameA.localeCompare(nameB, 'fr');
        } else if (criterion === 'lvl') {
          if (lvlB !== lvlA) return lvlB - lvlA;
          if (numA !== numB) return numA - numB;
          return nameA.localeCompare(nameB, 'fr');
        } else if (criterion === 'name') {
          const cmp = nameA.localeCompare(nameB, 'fr');
          if (cmp !== 0) return cmp;
          return lvlB - lvlA;
        } else if (criterion === 'type') {
          const cmp = typeA.localeCompare(typeB, 'fr');
          if (cmp !== 0) return cmp;
          if (numA !== numB) return numA - numB;
          return lvlB - lvlA;
        }
        return 0;
      });

      monsInBox.forEach((m, idx) => {
        m.slot = idx;
      });
      st.box.sort((a, b) => ((a?.box ?? 0) * 100 + (a?.slot ?? 0)) - ((b?.box ?? 0) * 100 + (b?.slot ?? 0)));

      if (selArea === 'grid' && selSlot >= monsInBox.length) {
        selSlot = Math.min(selSlot, Math.max(0, monsInBox.length - 1));
      }

      game.save(true);
      ui.sound.sfx('select');
      draw();
    };

    const doDropOrSwap = (targetArea, targetSlot) => {
      if (!inHand) return;
      const targetMon = getMonAt(targetArea, targetSlot);

      // Si le Pokémon venait de l'équipe et va dans la boîte, vérifier qu'il reste au moins 1 Pokémon valide dans l'équipe
      if (inHand.from === 'party' && targetArea === 'grid' && (!targetMon || targetMon.hp <= 0)) {
        const remainingAlive = st.party.filter((m) => m !== inHand.mon && m.hp > 0).length;
        if (remainingAlive === 0 && (!targetMon || targetMon.hp <= 0)) {
          ui.sound.sfx('bump');
          return;
        }
      }

      // Retirer inHand de son conteneur d'origine
      if (inHand.from === 'grid') {
        const idx = st.box.indexOf(inHand.mon);
        if (idx >= 0) st.box.splice(idx, 1);
      } else {
        const idx = st.party.indexOf(inHand.mon);
        if (idx >= 0) st.party.splice(idx, 1);
      }

      // Placer la cible
      if (!targetMon) {
        // Case vide
        if (targetArea === 'grid') {
          inHand.mon.box = curBox; inHand.mon.slot = targetSlot;
          st.box.push(inHand.mon);
        } else {
          st.party.splice(targetSlot, 0, inHand.mon);
        }
        inHand = null;
        ui.sound.sfx('pc');
      } else {
        // Échange
        if (targetArea === 'grid') {
          const tIdx = st.box.indexOf(targetMon);
          if (tIdx >= 0) st.box.splice(tIdx, 1);
          inHand.mon.box = curBox; inHand.mon.slot = targetSlot;
          st.box.push(inHand.mon);

          if (inHand.from === 'grid') {
            targetMon.box = inHand.box; targetMon.slot = inHand.slot;
            st.box.push(targetMon);
          } else {
            st.party.splice(inHand.slot, 0, targetMon);
          }
        } else {
          const tIdx = st.party.indexOf(targetMon);
          if (tIdx >= 0) st.party.splice(tIdx, 1);
          st.party.splice(targetSlot, 0, inHand.mon);

          if (inHand.from === 'grid') {
            targetMon.box = inHand.box; targetMon.slot = inHand.slot;
            st.box.push(targetMon);
          } else {
            st.party.splice(inHand.slot, 0, targetMon);
          }
        }
        inHand = null;
        ui.sound.sfx('pc');
      }
    };

    const openMonMenu = async (m, area, slot) => {
      busy = true;
      const opts = [
        'Déplacer',
        area === 'grid' ? 'Retirer vers l\'Équipe' : 'Déposer dans la Boîte',
        m.item ? `Prendre ${itemName(m.item)}` : 'Donner un Objet',
        'Résumé',
        'Relâcher',
        'Annuler'
      ];
      const r = await ui.ask(`${monName(m)} (N.${m.lvl}) : que faire ?`, opts, { keep: true });
      ui.closeDialog();

      if (r === 0) {
        // Déplacer
        inHand = { from: area, box: curBox, slot, mon: m };
        ui.sound.sfx('select');
      } else if (r === 1) {
        // Retirer ou Déposer instantané
        if (area === 'grid') {
          if (st.party.length >= 6) {
            ui.sound.sfx('bump');
            await ui.say('Ton équipe est déjà complète (6/6) !');
          } else {
            const idx = st.box.indexOf(m);
            if (idx >= 0) st.box.splice(idx, 1);
            st.party.push(m);
            ui.sound.sfx('pc');
          }
        } else {
          if (st.party.length <= 1) {
            ui.sound.sfx('bump');
            await ui.say('C\'est ta dernière créature en équipe !');
          } else if (st.party.filter((p, j) => p !== m && p.hp > 0).length === 0) {
            ui.sound.sfx('bump');
            await ui.say('Il te faut au moins une créature en forme dans ton équipe !');
          } else {
            // Trouver premier slot libre
            const occSlots = new Set(st.box.filter((b) => b.box === curBox).map((b) => b.slot));
            let freeSlot = -1;
            for (let k = 0; k < 30; k++) { if (!occSlots.has(k)) { freeSlot = k; break; } }
            if (freeSlot < 0) {
              ui.sound.sfx('bump');
              await ui.say(`La Boîte ${curBox + 1} est pleine ! Change de boîte pour déposer.`);
            } else {
              const pIdx = st.party.indexOf(m);
              if (pIdx >= 0) st.party.splice(pIdx, 1);
              m.box = curBox; m.slot = freeSlot;
              st.box.push(m);
              ui.sound.sfx('pc');
            }
          }
        }
      } else if (r === 2) {
        // Objet
        if (m.item) {
          const it = takeHeldItem(m, st.bag);
          ui.sound.sfx('item');
          await ui.say(`Vous retirez ${itemName(it)} à ${monName(m)}.`);
        } else {
          // Donner un objet
          const heldEligible = Object.keys(st.bag).filter((k) => st.bag[k] > 0 && ITEMS[k]?.held);
          if (!heldEligible.length) {
            await ui.say('Tu n\'as aucun objet tenu stratégique dans ton Sac.');
          } else {
            const itIdx = await ui.list({
              title: 'Donner quel objet tenu ?',
              items: heldEligible.map((k) => ({ label: itemName(k), right: `×${st.bag[k]}` })).concat([{ label: 'Annuler' }]),
              cancel: heldEligible.length
            });
            if (itIdx >= 0 && itIdx < heldEligible.length) {
              const chosen = heldEligible[itIdx];
              giveHeldItem(m, chosen, st.bag);
              ui.sound.sfx('item');
              await ui.say(`${monName(m)} tient désormais ${itemName(chosen)} !`);
            }
          }
        }
      } else if (r === 3) {
        // Résumé
        const list = area === 'grid' ? st.box.filter((x) => x.box === curBox) : st.party;
        const targetIdx = list.indexOf(m);
        if (targetIdx >= 0) await summaryScreen(game, list, targetIdx);
      } else if (r === 4) {
        // Relâcher
        if (area === 'party' && st.party.length <= 1) {
          ui.sound.sfx('bump');
          await ui.say('Impossible de relâcher ta seule créature en équipe !');
        } else {
          const sure = await ui.yesNo(`Es-tu vraiment sûr de vouloir relâcher ${monName(m)} dans la nature ?\nCette action est irréversible !`);
          if (sure) {
            if (area === 'grid') {
              const idx = st.box.indexOf(m);
              if (idx >= 0) st.box.splice(idx, 1);
            } else {
              const idx = st.party.indexOf(m);
              if (idx >= 0) st.party.splice(idx, 1);
            }
            ui.sound.sfx('faint');
            await ui.say(`Au revoir, ${monName(m)} !\nIl s'élance joyeusement dans les hautes herbes.`);
          }
        }
      }
      busy = false;
      draw();
    };

    const draw = () => {
      const theme = BOX_THEMES[curBox] || BOX_THEMES[0];
      const boxMons = st.box.filter((m) => m.box === curBox);
      const activeMon = inHand ? inHand.mon : getMonAt(selArea, selSlot);

      s.innerHTML = `
        <div class="scr-bar">
          <div class="scr-bar-left">
            <img class="scr-bar-ico" src="img/hud/pc.png" alt="" onerror="this.style.display='none'">
            <span class="scr-bar-title">SYSTÈME DE STOCKAGE POKÉMON</span>
            ${inHand ? `<span class="pc-inhand-tag">EN MAIN : ${esc(monName(inHand.mon))}</span>` : ''}
          </div>
          <div class="scr-bar-right">
            <button type="button" class="scr-close-btn" data-act="close">ÉTEINDRE ✕</button>
          </div>
        </div>
        <div class="pc-main-layout">
          <div class="pc-preview-panel">
            ${renderPCPokemonPreview(activeMon)}
          </div>
          <div class="pc-box-panel" style="background:${theme.grad}">
            <div class="pc-box-bar">
              <button type="button" class="pc-box-arrow prev" data-act="prev-box" title="Boîte précédente (◀)">◀</button>
              <div class="pc-box-title">
                <span class="pc-box-num">BOÎTE ${curBox + 1}</span>
                <span class="pc-box-sub">${theme.name} · ${boxMons.length}/30</span>
              </div>
              <button type="button" class="pc-box-arrow next" data-act="next-box" title="Boîte suivante (▶)">▶</button>
            </div>
            <div class="pc-sort-bar">
              <span class="pc-sort-lbl">Trier :</span>
              <button type="button" class="pc-sort-btn" data-sort="dex" title="Trier par numéro de Pokédex">N° Dex</button>
              <button type="button" class="pc-sort-btn" data-sort="lvl" title="Trier par niveau décroissant">Niveau</button>
              <button type="button" class="pc-sort-btn" data-sort="name" title="Trier par ordre alphabétique">Nom</button>
              <button type="button" class="pc-sort-btn" data-sort="type" title="Trier par type principal">Type</button>
            </div>
            <div class="pc-grid">
              ${[...Array(30).keys()].map((sIdx) => {
                const pm = getMonAt('grid', sIdx);
                const isSel = (selArea === 'grid' && selSlot === sIdx);
                const isHeld = (inHand && inHand.mon === pm);
                return `<div class="pc-cell ${isSel ? 'sel' : ''} ${pm ? 'occ' : 'empty'} ${isHeld ? 'in-hand' : ''}" data-slot="${sIdx}">
                  ${pm ? `
                    <img class="pc-ico" src="${ASSETS.icon(pm.sp)}" alt="" onerror="this.src='${ASSETS.front(pm.sp)}'">
                    <span class="pc-lvl">${pm.lvl}</span>
                    ${pm.item ? '<span class="pc-held-dot" title="Objet tenu"></span>' : ''}
                    ${pm.shiny ? '<span class="pc-shiny-star">★</span>' : ''}
                  ` : ''}
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="pc-party-panel">
            <div class="pc-party-head">ÉQUIPE (${st.party.length}/6)</div>
            <div class="pc-party-list">
              ${[0, 1, 2, 3, 4, 5].map((pIdx) => {
                const pm = st.party[pIdx];
                const isSel = (selArea === 'party' && selSlot === pIdx);
                const isHeld = (inHand && inHand.mon === pm);
                return `<div class="pc-party-slot ${isSel ? 'sel' : ''} ${pm ? 'occ' : 'empty'} ${isHeld ? 'in-hand' : ''}" data-party="${pIdx}">
                  ${pm ? `
                    <img class="pc-ico" src="${ASSETS.icon(pm.sp)}" alt="" onerror="this.src='${ASSETS.front(pm.sp)}'">
                    <div class="pc-party-slot-info">
                      <div class="pc-ps-top"><span class="pc-ps-name">${esc(monName(pm))}</span><span class="pc-ps-lvl">N.${pm.lvl}</span></div>
                      <div class="pc-ps-hp"><i><u style="width:${Math.max(0, pm.hp / pm.stats[0] * 100)}%;background:${hpCol(pm.hp / pm.stats[0])}"></u></i></div>
                    </div>
                    ${pm.item ? '<span class="pc-held-dot"></span>' : ''}
                  ` : '<span class="pc-slot-empty-lbl">— VIDE —</span>'}
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="pc-help">
          ${inHand ? 'Cliquez sur une case pour poser ou échanger · Échap : Annuler' : '◀ ▶ Changer de boîte · Clic / Flèches : Déplacer · Entrée : Options · Échap : Quitter'}
        </div>`;

      s.querySelector('[data-act="close"]')?.addEventListener('click', closePC);
      s.querySelector('[data-act="prev-box"]')?.addEventListener('click', () => {
        curBox = (curBox + 7) % 8;
        ui.sound.sfx('blip');
        draw();
      });
      s.querySelector('[data-act="next-box"]')?.addEventListener('click', () => {
        curBox = (curBox + 1) % 8;
        ui.sound.sfx('blip');
        draw();
      });
      s.querySelectorAll('[data-sort]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (busy) return;
          sortBox(curBox, btn.dataset.sort);
        });
      });

      s.querySelectorAll('.pc-cell').forEach((cell) => {
        const slot = +cell.dataset.slot;
        cell.addEventListener('mouseenter', () => {
          if (busy) return;
          if (selArea !== 'grid' || selSlot !== slot) {
            selArea = 'grid'; selSlot = slot;
            draw();
          }
        });
        cell.addEventListener('click', async () => {
          if (busy) return;
          selArea = 'grid'; selSlot = slot;
          if (inHand) {
            doDropOrSwap('grid', slot);
            draw();
          } else {
            const m = getMonAt('grid', slot);
            if (m) await openMonMenu(m, 'grid', slot);
          }
        });
      });

      s.querySelectorAll('.pc-party-slot').forEach((slotEl) => {
        const pIdx = +slotEl.dataset.party;
        slotEl.addEventListener('mouseenter', () => {
          if (busy) return;
          if (selArea !== 'party' || selSlot !== pIdx) {
            selArea = 'party'; selSlot = pIdx;
            draw();
          }
        });
        slotEl.addEventListener('click', async () => {
          if (busy) return;
          selArea = 'party'; selSlot = pIdx;
          if (inHand) {
            doDropOrSwap('party', pIdx);
            draw();
          } else {
            const m = getMonAt('party', pIdx);
            if (m) await openMonMenu(m, 'party', pIdx);
          }
        });
      });
    };

    draw();

    const pop = ui.input.push(async (k) => {
      if (busy) return;
      if (k === 'b') {
        if (inHand) {
          inHand = null;
          ui.sound.sfx('cancel');
          draw();
          return;
        }
        closePC();
        return;
      }
      if (k === 'left') {
        if (selArea === 'party') {
          selArea = 'grid'; selSlot = Math.min(29, selSlot * 6 + 5);
        } else if (selSlot % 6 === 0) {
          curBox = (curBox + 7) % 8;
          selSlot += 5;
        } else {
          selSlot--;
        }
      } else if (k === 'right') {
        if (selArea === 'grid') {
          if (selSlot % 6 === 5) {
            selArea = 'party'; selSlot = Math.min(st.party.length - 1, Math.floor(selSlot / 6));
          } else {
            selSlot++;
          }
        } else {
          curBox = (curBox + 1) % 8;
          selArea = 'grid'; selSlot = 0;
        }
      } else if (k === 'up') {
        if (selArea === 'grid') {
          if (selSlot >= 6) selSlot -= 6;
        } else {
          if (selSlot > 0) selSlot--;
        }
      } else if (k === 'down') {
        if (selArea === 'grid') {
          if (selSlot + 6 < 30) selSlot += 6;
        } else {
          if (selSlot < st.party.length - 1) selSlot++;
        }
      } else if (k === 'a') {
        if (inHand) {
          doDropOrSwap(selArea, selSlot);
          draw();
          return;
        }
        const m = getMonAt(selArea, selSlot);
        if (m) await openMonMenu(m, selArea, selSlot);
        return;
      } else return;
      ui.sound.sfx('blip');
      draw();
    });
  });
}

/* ================= MAÎTRE DES CAPACITÉS (MOVE RELEARNER) ================= */
function openMoveRelearnerUI(game, m, moveIds, scales) {
  const ui = game.ui;
  return new Promise((resolve) => {
    const s = screen(ui, 'relearn-scr');
    let sel = 0;
    const close = closer(ui, s, () => pop, resolve, null);

    const draw = () => {
      s.innerHTML = `
        <div class="scr-bar">
          <div class="scr-bar-left">
            <span class="scr-bar-title">MAÎTRE DES CAPACITÉS</span>
            <span class="scr-bar-sub">Écailles Cœur : <b>×${scales}</b></span>
          </div>
          <div class="scr-bar-right">
            <button type="button" class="scr-close-btn" data-act="close">RETOUR ✕</button>
          </div>
        </div>
        <div class="relearn-body">
          <div class="relearn-left">
            <div class="relearn-mon-card">
              <div class="rmc-head">
                <span class="rmc-name">${esc(monName(m))}${gender(m)}</span>
                <span class="rmc-lvl">N.${m.lvl}</span>
              </div>
              <div class="rmc-art">
                <img class="rmc-spr" src="${ASSETS.front(m.sp, m.shiny)}" alt="">
              </div>
              <div class="rmc-types">
                ${SPECIES[m.sp].t.map(typeTag).join(' ')}
              </div>
              <div class="rmc-current-moves-title">Capacités actuelles :</div>
              <div class="rmc-current-moves">
                ${m.moves.map((x) => {
                  const M = MOVES[x.id];
                  if (!M) return '';
                  return `<div class="rmc-cmv" style="--tc:${TYPE_COL[M.t]}">
                    <span class="rmc-cmv-type">${TYPE_FR[M.t]}</span>
                    <span class="rmc-cmv-name">${esc(M.n)}</span>
                    <span class="rmc-cmv-pp">${x.pp}/${M.pp}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>
          <div class="relearn-right">
            <div class="relearn-list-header">Capacités oubliées disponibles (${moveIds.length}) :</div>
            <div class="relearn-list">
              ${moveIds.map((id, idx) => {
                const M = MOVES[id];
                const isSel = idx === sel;
                const catName = M.c === 'special' ? 'Spécial' : M.c === 'status' ? 'Statut' : 'Physique';
                return `<div class="relearn-row ${isSel ? 'sel' : ''}" data-idx="${idx}" style="--tc:${TYPE_COL[M.t]}">
                  <div class="rr-top">
                    <span class="rr-name">${esc(M.n)}</span>
                    <span class="rr-type">${TYPE_FR[M.t]}</span>
                    <span class="rr-cat">${catName}</span>
                  </div>
                  <div class="rr-mid">
                    <span class="rr-pw">${M.p ? `Puis. ${M.p}` : 'Statut'}</span>
                    <span class="rr-acc">${M.a ? `Préc. ${M.a}%` : 'Préc. —'}</span>
                    <span class="rr-pp">PP ${M.pp}/${M.pp}</span>
                  </div>
                  <div class="rr-desc">${esc(moveDesc(M))}</div>
                </div>`;
              }).join('')}
            </div>
            <div class="relearn-action-bar">
              <button type="button" class="relearn-btn-confirm" data-act="confirm">RÉAPPRENDRE CETTE CAPACITÉ</button>
            </div>
          </div>
        </div>
        <div class="relearn-help">▲ ▼ Choisir une capacité · Entrée / Clic : Valider · Échap : Annuler</div>`;

      s.querySelector('[data-act="close"]')?.addEventListener('click', () => {
        ui.sound.sfx('cancel');
        close(null);
      });
      s.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
        ui.sound.sfx('select');
        close(moveIds[sel]);
      });
      s.querySelectorAll('.relearn-row').forEach((row) => {
        const idx = +row.dataset.idx;
        row.addEventListener('mouseenter', () => {
          if (sel !== idx) { sel = idx; ui.sound.sfx('blip'); draw(); }
        });
        row.addEventListener('click', () => {
          sel = idx;
          ui.sound.sfx('select');
          close(moveIds[sel]);
        });
      });
    };

    draw();

    const pop = ui.input.push((k) => {
      if (k === 'up') {
        sel = (sel - 1 + moveIds.length) % moveIds.length;
        ui.sound.sfx('blip');
        draw();
      } else if (k === 'down') {
        sel = (sel + 1) % moveIds.length;
        ui.sound.sfx('blip');
        draw();
      } else if (k === 'a') {
        ui.sound.sfx('select');
        close(moveIds[sel]);
      } else if (k === 'b') {
        ui.sound.sfx('cancel');
        close(null);
      }
    });
  });
}

export async function moveRelearnerScreen(game) {
  const ui = game.ui, st = game.state;
  const scales = st.bag['heart-scale'] || 0;

  await ui.say([
    'Maître des Capacités : « Salutations jeune dresseur ! Je suis le Maître des Capacités.',
    'Grâce à mes précieux enseignements et à une Écaille Cœur, je peux réveiller le potentiel oublié de tes Pokémon ! »',
    `Tu possèdes actuellement ${scales} Écaille(s) Cœur.`
  ], { keep: true });

  if (scales <= 0) {
    const see = await ui.yesNo('Tu n\'as pas d\'Écaille Cœur... Veux-tu quand même consulter les capacités de ton équipe ?', { keep: true });
    if (!see) { ui.closeDialog(); return; }
  } else {
    const ok = await ui.yesNo('Veux-tu réapprendre une capacité oubliée à l\'un de tes partenaires ?', { keep: true });
    if (!ok) { ui.closeDialog(); return; }
  }

  ui.closeDialog();

  for (;;) {
    const curScales = st.bag['heart-scale'] || 0;
    const target = await partyScreen(game, {
      mode: 'pick',
      prompt: `Choisir un Pokémon (Écailles Cœur : ×${curScales})`
    });
    if (target < 0) break;

    const m = st.party[target];
    const S = SPECIES[m.sp];
    if (!S) continue;

    const knownIds = new Set(m.moves.map((x) => x.id));
    const candidateMoves = (S.ls || []).filter(([lvl, id]) => lvl <= m.lvl && !knownIds.has(id));
    const uniqueIds = [...new Set(candidateMoves.map(([, id]) => id))];

    if (!uniqueIds.length) {
      await ui.say(`Maître des Capacités : « ${monName(m)} se souvient déjà de toutes ses capacités pour son niveau ! »`);
      continue;
    }

    const chosenMoveId = await openMoveRelearnerUI(game, m, uniqueIds, curScales);
    if (!chosenMoveId) continue;

    if (curScales <= 0) {
      await ui.say('Maître des Capacités : « Reviens me voir avec 1 Écaille Cœur pour sceller cet enseignement ! »');
      continue;
    }

    const M = MOVES[chosenMoveId];
    if (m.moves.length >= 4) {
      const forgetIdx = await ui.list({
        title: `Quelle attaque remplacer pour ${M.n} ?`,
        items: m.moves.map((x) => ({
          label: MOVES[x.id].n,
          right: `${TYPE_FR[MOVES[x.id].t]} · PP ${x.pp}/${MOVES[x.id].pp}`
        })).concat([{ label: 'Annuler' }]),
        cls: 'psub learn',
        cancel: 4
      });
      if (forgetIdx < 0 || forgetIdx >= 4) continue;
      const oldM = MOVES[m.moves[forgetIdx].id];
      const confirm = await ui.yesNo(`Oublier ${oldM.n} et dépenser 1 Écaille Cœur pour réapprendre ${M.n} ?`);
      if (!confirm) continue;

      st.bag['heart-scale']--;
      m.moves[forgetIdx] = { id: chosenMoveId, pp: M.pp };
      ui.sound.sfx('learn');
      await ui.say([
        '1, 2, 3... et Pouf !',
        `${monName(m)} a oublié ${oldM.n}...`,
        `Et ${monName(m)} a réappris avec éclat l'attaque ${M.n} !`
      ]);
    } else {
      const confirm = await ui.yesNo(`Dépenser 1 Écaille Cœur pour enseigner ${M.n} à ${monName(m)} ?`);
      if (!confirm) continue;

      st.bag['heart-scale']--;
      m.moves.push({ id: chosenMoveId, pp: M.pp });
      ui.sound.sfx('learn');
      await ui.say(`${monName(m)} a réappris avec éclat l'attaque ${M.n} !`);
    }

    game.save(true);
    const again = await ui.yesNo('Veux-tu enseigner une autre capacité ?');
    if (!again) break;
  }

  await ui.say('Maître des Capacités : « Que la force et la sagesse accompagnent ton équipe ! À bientôt. »');
}

/* ================= PC DES NATURES (Centre de soins) ================= */
export async function naturePcScreen(game) {
  const ui = game.ui, st = game.state;
  ui.sound.sfx('pc');
  await ui.say([`${st.name} allume le PC des Natures.`, 'Ce PC règle le caractère d\'un Pokémon : une stat monte de 10 %, une autre baisse de 10 %.'], { keep: true });
  for (;;) {
    if (!st.party.length) { await ui.say('Tu n\'as encore aucune créature.', { keep: true }); break; }
    ui.closeDialog();
    const k = await partyScreen(game, { mode: 'pick', prompt: 'Changer la nature de quel Pokémon ?' });
    if (k < 0) break;
    const m = st.party[k];
    const label = (n) => { const ne = natureEffect(n); return ne ? `+${STAT_NAMES[ne[0]]} −${STAT_NAMES[ne[1]]}` : 'neutre'; };
    const n = await ui.list({ title: `${monName(m)} : ${natureName(m.nat ?? 0)}`, items: NATURES.map((name, i) => ({ label: name + (i === m.nat ? ' ✓' : ''), right: label(i) })).concat([{ label: 'Annuler' }]), cls: 'shop natures', cancel: NATURES.length, start: m.nat ?? 0 });
    if (n < 0 || n >= NATURES.length || n === m.nat) continue;
    if (!(await ui.yesNo(`${monName(m)} devient ${natureName(n)} (${label(n)}) ?`, { keep: true }))) continue;
    m.nat = n; refreshStats(m, true); ui.sound.sfx('levelup');
    await ui.say(`${monName(m)} est maintenant de nature ${natureName(n)} !`, { keep: true });
  }
  ui.closeDialog();
}
