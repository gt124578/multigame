// odyssee/js/ui/screens/quests.js — journal des quêtes
import { esc } from '../ui.js';
import { getAllQuests, setTrackedQuest, syncJournal } from '../../core/questsData.js';
import { screen, closer } from './common.js';

/* ================= JOURNAL DES QUÊTES (carnet de voyage, style Noir 2 / Blanc 2) ================= */
// Pas d'indice ni de destination : chaque quête acceptée rappelle en quelques phrases ce qu'on nous a demandé et ce qui
// s'est passé depuis, avec le temps de jeu écoulé depuis qu'on l'a acceptée.
export function questsScreen(game) {
  const ui = game.ui;
  return new Promise((resolve) => {
    const s = screen(ui, 'quests-scr');
    let tab = 'active', sel = 0;
    const CAT = { main: 'HISTOIRE', side: 'AVENTURE', legend: 'LÉGENDE', npc: 'HABITANT' };
    const lists = () => {
      const all = getAllQuests(game);
      const act = all.filter((q) => q.status !== 'done'), done = all.filter((q) => q.status === 'done');
      return { all, act, done, shown: tab === 'active' ? act : tab === 'done' ? done : all };
    };
    const render = () => {
      const { all, act, done, shown } = lists();
      if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
      const q = shown[sel];
      s.innerHTML = `
        <div class="scr-bar">
          <div class="scr-bar-left">
            <img class="scr-bar-ico" src="img/items/notebook.png" alt="">
            <span class="scr-bar-title">JOURNAL DES QUÊTES</span>
            <span class="scr-bar-sub">${act.length} en cours · ${done.length} terminée${done.length > 1 ? 's' : ''}</span>
          </div>
          <div class="quests-tabs">
            <button type="button" class="qtab${tab === 'active' ? ' on' : ''}" data-tab="active">EN COURS (${act.length})</button>
            <button type="button" class="qtab${tab === 'done' ? ' on' : ''}" data-tab="done">TERMINÉES (${done.length})</button>
            <button type="button" class="qtab${tab === 'all' ? ' on' : ''}" data-tab="all">TOUTES (${all.length})</button>
          </div>
          <div class="scr-bar-right"><button class="scr-btn-close" type="button" data-act="close" title="Fermer (Échap)">✕</button></div>
        </div>
        <div class="quests-body">
          <div class="qcol-list">
            <div class="qlist-head"><span>CARNET DE VOYAGE</span><span class="qlist-cnt">${shown.length} quête${shown.length > 1 ? 's' : ''}</span></div>
            <div class="qlist-scroll">
              ${shown.length ? '' : `<div class="qempty">${tab === 'done' ? 'Aucune quête terminée pour l\'instant.' : 'Aucune quête en cours. Parle aux habitants : ils ont souvent quelque chose à demander.'}</div>`}
              ${shown.map((x, i) => `
                <div class="qcard ${x.status}${i === sel ? ' on' : ''}${x.isTracked ? ' tracked' : ''}" data-idx="${i}">
                  <span class="cur">▶</span>
                  <div class="qcard-top"><span class="qcat-tag qcat-${x.cat}">${CAT[x.cat] || ''}</span>${x.isTracked ? '<span class="qtracked-tag">★ SUIVIE</span>' : ''}</div>
                  <div class="qcard-name">${esc(x.name)}</div>
                  <div class="qcard-sub"><span class="qcard-step">${x.status === 'done' ? '✔ Terminée' : 'En cours'}</span><span class="qcard-loc">${esc(x.since)}</span></div>
                </div>`).join('')}
            </div>
          </div>
          <div class="qcol-detail">
            ${q ? `
              <div class="qdet-head">
                <div class="qdet-head-left">
                  <div class="qdet-title-row">
                    <span class="qcat-tag qcat-${q.cat}">${CAT[q.cat] || ''}</span>
                    ${q.status === 'done' ? '<span class="qcat-tag" style="background:#208038">✔ TERMINÉE</span>' : '<span class="qcat-tag" style="background:#0088cc">EN COURS</span>'}
                  </div>
                  <div class="qdet-title">${esc(q.name)}</div>
                  <div class="qdet-giver">${esc(q.giver)} · acceptée ${esc(q.since)}</div>
                </div>
                ${q.status !== 'done' ? `<button type="button" class="qbtn-track${q.isTracked ? ' tracked' : ''}" data-act="track">${q.isTracked ? '★ NE PLUS SUIVRE' : '★ SUIVRE'}</button>` : ''}
              </div>
              <div class="qdiary">
                ${q.notes.map((n, i) => `<p class="${i === q.notes.length - 1 ? 'last' : ''}">${esc(n)}</p>`).join('')}
              </div>` : '<div class="qempty">Le carnet est encore vierge.</div>'}
          </div>
        </div>
        <div class="quests-foot">
          <div class="quests-foot-keys">
            <span><kbd>▲</kbd><kbd>▼</kbd> Choisir</span><span><kbd>◄</kbd><kbd>►</kbd> Onglet</span>
            <span><kbd>ESPACE</kbd> Suivre dans le HUD</span><span><kbd>ÉCHAP</kbd> Fermer</span>
          </div>
        </div>`;
      s.querySelectorAll('.qcard').forEach((c) => c.addEventListener('click', (e) => { e.stopPropagation(); sel = +c.dataset.idx; ui.sound.sfx('blip'); render(); }));
      s.querySelectorAll('.qtab').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); tab = b.dataset.tab; sel = 0; ui.sound.sfx('blip'); render(); }));
      s.querySelector('[data-act="track"]')?.addEventListener('click', (e) => { e.stopPropagation(); if (q) { setTrackedQuest(game, q.id); ui.sound.sfx('select'); game.hud?.update(true); render(); } });
      s.querySelector('[data-act="close"]')?.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    };
    const close = closer(ui, s, () => pop, resolve);
    const pop = ui.input.push((k) => {
      const { shown } = lists();
      if (k === 'up' && shown.length) sel = (sel - 1 + shown.length) % shown.length;
      else if (k === 'down' && shown.length) sel = (sel + 1) % shown.length;
      else if (k === 'left') { tab = tab === 'all' ? 'done' : tab === 'done' ? 'active' : 'all'; sel = 0; }
      else if (k === 'right') { tab = tab === 'active' ? 'done' : tab === 'done' ? 'all' : 'active'; sel = 0; }
      else if (k === 'a') { const q = shown[sel]; if (!q || q.status === 'done') return; setTrackedQuest(game, q.id); game.hud?.update(true); ui.sound.sfx('select'); render(); return; }
      else if (k === 'b' || k === 'quests') { close(); return; }
      else return;
      ui.sound.sfx('blip'); render();
    });
    syncJournal(game);
    render();
  });
}
