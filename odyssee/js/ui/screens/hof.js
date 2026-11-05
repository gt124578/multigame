// odyssee/js/ui/screens/hof.js — Hall de la Renommée et Panthéon
import { esc } from '../ui.js';
import { SPECIES } from '../../data/species.js';
import { MOVES } from '../../data/moves.js';
import { getAbility } from '../../data/abilities.js';
import { ASSETS } from '../../assets.js';
import { TYPE_FR, TYPE_COL, screen, closer } from './common.js';

/* ================= HALL DE LA RENOMMÉE / PANTHÉON B2W2 ================= */

export function hofScreen(game, entry) {
  const ui = game.ui, st = game.state;
  return new Promise((resolve) => {
    const s = screen(ui, 'hof-ceremony-scr');
    s.classList.add('b2w2-screen');

    const party = (entry?.team || st.party || []).slice(0, 6);
    let curMonIdx = 0; // 0..party.length (party.length = récapitulatif final)
    const totalMons = party.length;

    const render = () => {
      // 1. Écran récapitulatif final de sacre
      if (curMonIdx >= totalMons) {
        const recapListHtml = party.map((m) => {
          const S = SPECIES[m.sp] || {};
          const isShiny = !!m.shiny;
          return `
            <div class="hof-recap-mon">
              <div class="hof-rm-socket">
                <img class="hof-rm-icon" src="${ASSETS.icon(m.sp, m.shadow)}" alt="" onerror="this.src='${ASSETS.front(m.sp)}'">
              </div>
              <div class="hof-rm-info">
                <div class="hof-rm-name">${esc(m.nick || S.n || 'Pokémon')}${isShiny ? ' <span class="tc-star">★</span>' : ''}</div>
                <div class="hof-rm-lvl">N.${m.lvl}</div>
              </div>
            </div>
          `;
        }).join('');

        s.innerHTML = `
          <div class="hof-casing final">
            <div class="hof-header">
              <span class="hof-hdr-title">LIGUE POKÉMON D'ODYSSÉE</span>
              <span class="hof-hdr-badge">★ ENTRÉE AU PANTHÉON ★</span>
            </div>
            <div class="hof-recap-body">
              <div class="hof-trainer-col">
                <div class="hof-photo-frame">
                  <div class="hof-photo-pedestal"></div>
                  <img class="hof-trainer-spr" src="${ASSETS.trainer(st.gender === 'f' ? 'player_f' : 'player_m')}" alt="">
                  <span class="hof-trainer-tag">MAÎTRE DE LA LIGUE</span>
                </div>
                <div class="hof-master-seal">
                  <div class="hof-seal-stars">★★★★★</div>
                  <div class="hof-seal-title">CERTIFICAT DU PANTHÉON</div>
                  <div class="hof-seal-id">Dresseur : <b>${esc(st.name)}</b> (ID : ${String(st.id || 0).padStart(5, '0')})</div>
                </div>
              </div>
              <div class="hof-team-col">
                <div class="hof-team-title">LES COMPAGNONS DU SACRE (#${entry?.id || 1})</div>
                <div class="hof-recap-grid">${recapListHtml}</div>
                <div class="hof-recap-meta">
                  <span>Date : <b>${entry?.date || new Date().toLocaleDateString('fr-FR')}</b></span>
                  <span>Temps : <b>${Math.floor((entry?.time || st.time || 0) / 3600)}h ${String(Math.floor((entry?.time || st.time || 0) / 60) % 60).padStart(2, '0')}</b></span>
                  <span>Pokédex : <b>${entry?.dexCount || st.dex?.caught?.length || 0}</b></span>
                </div>
              </div>
            </div>
            <div class="hof-footer">
              <button type="button" class="hof-btn-next" data-act="finish">ENREGISTRER ET FERMER (Entrée / Échap) ▶</button>
            </div>
          </div>
        `;
        s.querySelector('[data-act="finish"]')?.addEventListener('click', close);
        return;
      }

      // 2. Présentation d'un Pokémon individuel avec projecteur
      const m = party[curMonIdx];
      const S = SPECIES[m.sp] || {};
      const ab = getAbility(m);
      const isShiny = !!m.shiny;
      const movesHtml = (m.moves || []).slice(0, 4).map((mv) => {
        const moveObj = MOVES[mv.id || mv] || { n: 'Capacité', t: 'normal', c: 'physical' };
        return `
          <div class="hof-mon-move" style="--tc:${TYPE_COL[moveObj.t] || '#888'}">
            <span class="hof-mm-type">${TYPE_FR[moveObj.t] || moveObj.t}</span>
            <span class="hof-mm-name">${esc(moveObj.n)}</span>
          </div>
        `;
      }).join('');

      s.innerHTML = `
        <div class="hof-casing solo">
          <div class="hof-header">
            <span class="hof-hdr-title">PANTHÉON D'ODYSSÉE · IMMORTALISATION (${curMonIdx + 1} / ${totalMons})</span>
            <span class="hof-hdr-date">${entry?.title || 'Sacre de la Ligue'}</span>
          </div>
          <div class="hof-solo-body">
            <div class="hof-solo-art-col">
              <div class="hof-solo-pedestal">
                <div class="hof-solo-light"></div>
                <img class="hof-solo-spr${isShiny ? ' shiny' : ''}" src="${ASSETS.front(m.sp, isShiny, m.shadow)}" alt="" onerror="this.src='${ASSETS.icon(m.sp)}'">
              </div>
            </div>
            <div class="hof-solo-info-col">
              <div class="hof-si-top">
                <span class="hof-si-slot">POKÉMON #${curMonIdx + 1}</span>
                <span class="hof-si-name">${esc(m.nick || S.n || 'Pokémon')}</span>
                ${isShiny ? '<span class="tc-star">★ SHINY</span>' : ''}
                <span class="hof-si-lvl">N.${m.lvl}</span>
              </div>
              <div class="hof-si-types">
                ${(S.t || ['normal']).map((t) => `<span class="hof-si-type" style="--tc:${TYPE_COL[t] || '#888'}">${TYPE_FR[t] || t}</span>`).join('')}
              </div>
              <div class="hof-si-meta">
                <div>Espèce : <b>${esc(S.n || 'Inconnu')}</b> (N° Pokédex : #${String(S.no || m.sp).padStart(3, '0')})</div>
                <div>Talent : <b>${esc(ab?.name || 'Aucun')}</b></div>
                <div>Dresseur d'Origine : <b>${esc(m.ot || st.name)}</b></div>
              </div>
              <div class="hof-si-moves-title">CAPACITÉS DU TRIOMPHE</div>
              <div class="hof-si-moves-grid">${movesHtml}</div>
            </div>
          </div>
          <div class="hof-footer">
            <span class="hof-foot-hint">Appuyez sur <kbd>ESPACE</kbd> ou cliquez pour continuer</span>
            <button type="button" class="hof-btn-next" data-act="next">
              ${curMonIdx + 1 < totalMons ? 'POKÉMON SUIVANT ▶' : 'TABLEAU DE LA LIGUE ➔'}
            </button>
          </div>
        </div>
      `;

      try { ui.sound?.sfx('select'); ui.sound?.cry(ASSETS.cry(m.sp)); } catch (e) {}

      s.querySelector('[data-act="next"]')?.addEventListener('click', () => {
        curMonIdx++;
        render();
      });
    };

    const close = closer(ui, s, () => pop, resolve);

    const pop = ui.input.push((k) => {
      if (k === 'a' || k === 'right' || k === 'down') {
        if (curMonIdx < totalMons) {
          curMonIdx++;
          render();
        } else {
          close();
        }
      } else if (k === 'b') {
        if (curMonIdx < totalMons) {
          curMonIdx = totalMons;
          render();
        } else {
          close();
        }
      }
    });

    render();
  });
}

export function pantheonScreen(game) {
  const ui = game.ui, st = game.state;
  return new Promise((resolve) => {
    const s = screen(ui, 'pantheon-history-scr');
    s.classList.add('b2w2-screen');

    const history = (st.hof || []).slice().reverse();
    let selEntryIdx = 0;

    const render = () => {
      if (!history.length) {
        s.innerHTML = `
          <div class="pantheon-casing empty">
            <div class="pantheon-hdr">
              <span class="pantheon-title">HALL DE LA RENOMMÉE D'ODYSSÉE</span>
              <button type="button" class="tc-btn-close" data-act="close">✕</button>
            </div>
            <div class="pantheon-empty-body">
              <div class="pantheon-empty-pedestal">🏆</div>
              <div class="pantheon-empty-title">AUCUN SACRE ENREGISTRÉ</div>
              <div class="pantheon-empty-desc">
                Le Hall de la Renommée honore les dresseurs ayant triomphé des 4 membres du Conseil des 4 et de la Maîtresse de la Ligue Céleste.<br>
                Relevez le défi pour inscrire votre équipe dans la légende d'Odyssée !
              </div>
            </div>
            <div class="pantheon-foot">
              <button type="button" class="pantheon-btn-close" data-act="close">Refermer (Échap)</button>
            </div>
          </div>
        `;
        s.querySelectorAll('[data-act="close"]').forEach((b) => b.onclick = close);
        return;
      }

      const entry = history[selEntryIdx] || history[0];
      const tabsHtml = history.map((e, idx) => `
        <button type="button" class="pantheon-tab${idx === selEntryIdx ? ' on' : ''}" data-eidx="${idx}">
          <b>Sacre #${e.id || (history.length - idx)}</b>
          <small>${esc(e.date || 'Ligue')}</small>
        </button>
      `).join('');

      const teamHtml = (entry.team || []).map((m) => {
        const S = SPECIES[m.sp] || {};
        const isShiny = !!m.shiny;
        const movesHtml = (m.moves || []).slice(0, 4).map((mv) => {
          const mObj = MOVES[mv.id || mv] || { n: 'Capacité', t: 'normal' };
          return `<span class="ph-mv" style="--tc:${TYPE_COL[mObj.t] || '#888'}">${esc(mObj.n)}</span>`;
        }).join('');

        return `
          <div class="ph-team-slot${isShiny ? ' shiny' : ''}">
            <div class="ph-slot-art">
              <img class="ph-slot-spr" src="${ASSETS.front(m.sp, isShiny, m.shadow)}" alt="" onerror="this.src='${ASSETS.icon(m.sp)}'">
            </div>
            <div class="ph-slot-info">
              <div class="ph-slot-name">${esc(m.nick || S.n || 'Pokémon')}${isShiny ? ' <span class="tc-star">★</span>' : ''} <span class="ph-slot-lvl">N.${m.lvl}</span></div>
              <div class="ph-slot-types">
                ${(S.t || ['normal']).map((t) => `<span class="ph-type-pill" style="--tc:${TYPE_COL[t] || '#888'}">${TYPE_FR[t] || t}</span>`).join('')}
              </div>
              <div class="ph-slot-moves">${movesHtml}</div>
            </div>
          </div>
        `;
      }).join('');

      s.innerHTML = `
        <div class="pantheon-casing">
          <div class="pantheon-hdr">
            <div class="pantheon-hdr-left">
              <span class="pantheon-title">HALL DE LA RENOMMÉE D'ODYSSÉE</span>
              <span class="pantheon-subtitle">REGISTRE HISTORIQUE DES MAÎTRES</span>
            </div>
            <button type="button" class="tc-btn-close" data-act="close" title="Fermer">✕</button>
          </div>
          <div class="pantheon-body">
            <div class="pantheon-tabs-col">
              <div class="pantheon-tabs-head">${history.length} SACRE${history.length > 1 ? 'S' : ''}</div>
              <div class="pantheon-tabs-list">${tabsHtml}</div>
            </div>
            <div class="pantheon-content-col">
              <div class="pantheon-entry-card">
                <div class="ph-entry-head">
                  <div class="ph-eh-left">
                    <span class="ph-eh-title">SACRE OFFICIEL #${entry.id || 1}</span>
                    <span class="ph-eh-date">Date : <b>${entry.date || '—'}</b> · Temps : <b>${Math.floor((entry.time || 0) / 3600)}h ${String(Math.floor((entry.time || 0) / 60) % 60).padStart(2, '0')}</b></span>
                  </div>
                  <div class="ph-eh-dex">Pokédex : <b>${entry.dexCount || 0}</b> capturés</div>
                </div>
                <div class="ph-team-grid">${teamHtml}</div>
              </div>
            </div>
          </div>
          <div class="pantheon-foot">
            <div class="tc-foot-hints">
              <span><kbd>▲</kbd> <kbd>▼</kbd> Sélectionner un sacre</span>
              <span><kbd>ÉCHAP</kbd> Quitter</span>
            </div>
            <button type="button" class="pantheon-btn-close" data-act="close">Refermer</button>
          </div>
        </div>
      `;

      s.querySelectorAll('[data-act="close"]').forEach((b) => b.onclick = close);
      s.querySelectorAll('.pantheon-tab').forEach((tab) => {
        tab.onclick = () => {
          const eidx = parseInt(tab.dataset.eidx, 10);
          if (!isNaN(eidx) && eidx >= 0 && eidx < history.length) {
            selEntryIdx = eidx;
            ui.sound?.sfx('select');
            render();
          }
        };
      });
    };

    const close = closer(ui, s, () => pop, resolve);

    const pop = ui.input.push((k) => {
      if (k === 'b') {
        close();
      } else if (k === 'up') {
        if (selEntryIdx > 0) {
          selEntryIdx--;
          ui.sound?.sfx('select');
          render();
        }
      } else if (k === 'down') {
        if (selEntryIdx < history.length - 1) {
          selEntryIdx++;
          ui.sound?.sfx('select');
          render();
        }
      }
    });

    render();
  });
}
