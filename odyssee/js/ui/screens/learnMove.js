// odyssee/js/ui/screens/learnMove.js — apprentissage d'une capacité
import { esc } from '../ui.js';
import { MOVES } from '../../data/moves.js';
import { moveDesc } from '../../data/moveDescriptions.js';
import { monName } from '../../core/mon.js';
import { TYPE_FR, TYPE_COL, screen } from './common.js';

/* ================= ÉCRAN D'APPRENTISSAGE DE CAPACITÉ 5G ================= */
/** Écran B2W2 pour remplacer une attaque quand le Pokémon en connaît déjà 4 */
export function learnMoveScreen(game, m, moveId) {
  return new Promise((resolve) => {
    const ui = game.ui;
    const newM = MOVES[moveId];
    const s = screen(ui, 'learn-move-scr');
    let sel = 0; // 0..3: anciennes capacités, 4: abandonner

    const draw = () => {
      const activeMove = sel < 4 ? MOVES[m.moves[sel].id] : null;
      const activeDesc = sel < 4 ? moveDesc(activeMove) : "Conserver les 4 capacités actuelles et abandonner l'apprentissage de cette nouvelle capacité.";

      s.innerHTML = `
        <div class="scr-bar">
          <div class="scr-bar-left">
            <img class="scr-bar-ico" src="img/hud/team.png" alt="">
            <span class="scr-bar-title">APPRENTISSAGE D'UNE CAPACITÉ</span>
            <span class="scr-bar-sub">${esc(monName(m))} (N.${m.lvl})</span>
          </div>
          <div class="scr-bar-right">
            <button type="button" class="scr-close-btn" data-act="cancel">ABANDONNER ✕</button>
          </div>
        </div>

        <div class="lm-body">
          <!-- Carte Haute : Nouvelle Capacité -->
          <div class="lm-new-card">
            <div class="lm-card-label">NOUVELLE CAPACITÉ À APPRENDRE</div>
            <div class="lm-move-row new" style="--tc:${TYPE_COL[newM.t]}">
              <div class="lm-move-main">
                <span class="lm-move-name">${esc(newM.n)}</span>
                <span class="lm-type" style="background:${TYPE_COL[newM.t]}">${TYPE_FR[newM.t]}</span>
                <span class="lm-cat"><img src="img/battle/cat_${newM.c || 'physical'}.png" alt=""><span>${newM.c === 'special' ? 'Spécial' : newM.c === 'status' ? 'Statut' : 'Physique'}</span></span>
              </div>
              <div class="lm-move-stats">
                <span class="lm-stat-pw">${newM.p ? 'Puissance : ' + newM.p : 'Statut'}</span>
                <span class="lm-stat-acc">${newM.a ? 'Précision : ' + newM.a + '%' : 'Précision : —'}</span>
                <span class="lm-stat-pp">PP : <b>${newM.pp}</b>/${newM.pp}</span>
              </div>
            </div>
            <div class="lm-desc-box new">
              <div class="lm-desc-tag">EFFET :</div>
              <div class="lm-desc-content">${esc(moveDesc(newM))}</div>
            </div>
          </div>

          <!-- Section Basse : Capacités Actuelles & Choix -->
          <div class="lm-current-section">
            <div class="lm-section-title">
              <span>Sélectionne la capacité à oublier :</span>
              <span class="lm-instruct">▲ ▼ ◀ ▶ Naviguer · Entrée / Clic : Valider</span>
            </div>

            <div class="lm-moves-grid">
              ${m.moves.map((mv, idx) => {
                const M = MOVES[mv.id];
                const isSel = idx === sel;
                return `
                  <div class="lm-cur-move ${isSel ? 'sel' : ''}" data-idx="${idx}" style="--tc:${TYPE_COL[M.t]}">
                    <div class="lm-cm-header">
                      <span class="lm-cm-num">${idx + 1}</span>
                      <span class="lm-cm-name">${esc(M.n)}</span>
                      <span class="lm-type" style="background:${TYPE_COL[M.t]}">${TYPE_FR[M.t]}</span>
                    </div>
                    <div class="lm-cm-stats">
                      <span class="lm-cat"><img src="img/battle/cat_${M.c || 'physical'}.png" alt=""></span>
                      <span class="lm-stat-pw">${M.p ? 'Puis. ' + M.p : 'Statut'}</span>
                      <span class="lm-stat-pp">PP ${mv.pp}/${M.pp}</span>
                    </div>
                  </div>
                `;
              }).join('')}
              <div class="lm-cur-move abandon ${sel === 4 ? 'sel' : ''}" data-idx="4">
                <span class="lm-abandon-ico">✕</span>
                <span class="lm-abandon-txt">Conserver les attaques actuelles</span>
              </div>
            </div>

            <!-- Encadré comparatif dynamique pour l'attaque sélectionnée -->
            <div class="lm-comparison-box">
              <div class="lm-comp-head">
                ${sel < 4 ? `
                  <span class="lm-comp-tag">CAPACITÉ ACTUELLE SÉLECTIONNÉE (${sel + 1}/4) :</span>
                  <span class="lm-comp-name">${esc(activeMove.n)}</span>
                  <span class="lm-comp-acc">${activeMove.a ? 'Précision : ' + activeMove.a + '%' : 'Précision : —'}</span>
                ` : `
                  <span class="lm-comp-tag">OPTION :</span>
                  <span class="lm-comp-name">Abandonner</span>
                `}
              </div>
              <div class="lm-comp-desc">${esc(activeDesc)}</div>
            </div>
          </div>
        </div>
      `;

      s.querySelector('[data-act="cancel"]')?.addEventListener('click', () => doCancel());
      s.querySelectorAll('.lm-cur-move').forEach((elRow) => {
        const idx = +elRow.dataset.idx;
        elRow.addEventListener('pointerenter', () => {
          if (sel !== idx) {
            sel = idx;
            game.sound.sfx('blip');
            draw();
          }
        });
        elRow.addEventListener('click', () => {
          if (idx === 4) doCancel();
          else doReplace(idx);
        });
      });
    };

    const doReplace = async (k) => {
      const oldMove = MOVES[m.moves[k].id];
      const confirm = await ui.yesNo(`Oublier ${oldMove.n} pour apprendre ${newM.n} ?`);
      if (!confirm) return;
      s.remove();
      pop();
      resolve(k);
    };

    const doCancel = async () => {
      const confirm = await ui.yesNo(`Abandonner l'apprentissage de ${newM.n} ?`);
      if (!confirm) return;
      s.remove();
      pop();
      resolve(-1);
    };

    const pop = ui.input.push((k) => {
      let j = sel;
      if (k === 'up') {
        if (sel >= 2 && sel < 4) j = sel - 2;
        else if (sel === 4) j = 2;
      } else if (k === 'down') {
        if (sel <= 1) j = sel + 2;
        else if (sel === 2 || sel === 3) j = 4;
      } else if (k === 'left') {
        if (sel === 1 || sel === 3) j = sel - 1;
      } else if (k === 'right') {
        if (sel === 0 || sel === 2) j = sel + 1;
      } else if (k === 'a') {
        if (sel === 4) doCancel();
        else doReplace(sel);
        return;
      } else if (k === 'b') {
        doCancel();
        return;
      } else return;

      if (j !== sel) {
        sel = j;
        game.sound.sfx('blip');
        draw();
      }
    });

    draw();
  });
}
