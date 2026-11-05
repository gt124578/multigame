// odyssee/js/ui/screens/party.js — équipe, enregistrement au Pokédex, résumé
import { el, esc } from '../ui.js';
import { SPECIES } from '../../data/species.js';
import { MOVES } from '../../data/moves.js';
import { getAbility } from '../../data/abilities.js';
import { monName, expProgress, STAT_NAMES, levelCap, natureName, natureEffect } from '../../core/mon.js';
import { LEADERS } from '../../world/region.js';
import { ASSETS } from '../../assets.js';
import { TYPE_FR, TYPE_COL, typeTag, hpCol, hpBar, statusTag, gender, screen, closer } from './common.js';
import { pcScreen } from './pc.js';

/* ================= ÉQUIPE (Style 5G Noir 2 / Blanc 2) ================= */
/**
 * o.mode : 'menu' | 'pick' | 'battle' ; o.prompt ; o.filter(m) → texte d'interdiction ou null
 * renvoie l'index choisi (-1 si annulé)
 */
export function partyScreen(game, o = {}) {
  const ui = game.ui, party = game.state.party;
  const cap = game.levelCap ? game.levelCap() : levelCap(game.state?.badges);
  const nextGymIdx = (game.state?.badges || []).findIndex((b) => !b);
  const nextLeader = nextGymIdx >= 0 ? LEADERS[nextGymIdx] : null;
  return new Promise((resolve) => {
    const s = screen(ui, 'party-scr');
    const hdr = el('div', 'scr-bar');
    hdr.innerHTML = `
      <div class="scr-bar-left">
        <img class="scr-bar-ico" src="img/hud/team.png" alt="">
        <span class="scr-bar-title">ÉQUIPE POKÉMON</span>
        <span class="scr-bar-sub">${party.length} / 6</span>
      </div>
      <div class="scr-bar-right">
        <span class="scr-cap-badge" title="${nextLeader ? `Prochaine Arène : ${nextLeader.name} (max N.${cap + 1})` : 'Toutes les Arènes vaincues'}">
          NIV. MAX AUTORISÉ : <b>N.${cap}</b>${nextLeader ? ` <i>(${esc(nextLeader.name)})</i>` : ''}
        </span>
      </div>`;
    s.appendChild(hdr);

    const layout = el('div', 'party-b2w2');
    const colLead = el('div', 'pcol-lead');
    const colSubs = el('div', 'pcol-subs');
    layout.append(colLead, colSubs);
    s.appendChild(layout);

    const foot = el('div', 'pfoot');
    const help = el('div', 'box phelp');
    if (o.mode === 'menu') {
      const pcBtn = el('button', 'pc-link-btn', 'BOÎTES PC 💻');
      pcBtn.type = 'button';
      pcBtn.title = 'Accéder au Système de Stockage des Pokémon';
      pcBtn.onclick = async () => {
        if (busy) return;
        busy = true;
        await pcScreen(game);
        busy = false;
        draw();
      };
      foot.append(pcBtn);
    }
    const cancel = el('button', 'pcancel', 'RETOUR ✕');
    cancel.type = 'button';
    foot.append(help, cancel);
    s.appendChild(foot);

    let i = Math.min(o.start || 0, Math.max(0, party.length - 1)), swapFrom = -1, busy = false;

    const triggerSlot = async (idx) => {
      if (busy) return;
      const n = party.length;
      if (idx === n) {
        if (swapFrom >= 0) { swapFrom = -1; ui.sound.sfx('cancel'); draw(); return; }
        ui.sound.sfx('cancel'); close(-1); return;
      }
      if (idx < 0 || idx >= n) return;
      i = idx;
      draw();
      ui.sound.sfx('select');
      if (swapFrom >= 0) {
        if (swapFrom !== i) {
          [party[swapFrom], party[i]] = [party[i], party[swapFrom]];
          game.save?.(true);
        }
        swapFrom = -1;
        draw();
        return;
      }
      const why = o.filter ? o.filter(party[i], i) : null;
      if (o.mode === 'pick') {
        busy = true;
        const chooseLabel = o.pickLabel || 'Choisir';
        const opts = why ? ['Résumé', 'Annuler'] : [chooseLabel, 'Résumé', 'Annuler'];
        const r = await ui.list({
          title: why ? `${monName(party[i])} (${why})` : monName(party[i]),
          items: opts.map((label) => ({ label })),
          cls: 'psub',
          cancel: opts.length - 1,
          parent: s,
        });
        busy = false;
        const pick = opts[r];
        if (pick === 'Résumé') {
          busy = true;
          i = await summaryScreen(game, party, i);
          busy = false;
        } else if (pick === chooseLabel) {
          close(i);
          return;
        }
        draw();
        return;
      }
      busy = true;
      const opts = o.mode === 'battle' ? ['Envoyer', 'Résumé', 'Annuler'] : ['Résumé', 'Déplacer', 'Annuler'];
      const r = await ui.list({ title: monName(party[i]), items: opts.map((label) => ({ label })), cls: 'psub', cancel: opts.length - 1, parent: s });
      busy = false;
      const pick = opts[r];
      if (pick === 'Résumé') { busy = true; i = await summaryScreen(game, party, i); busy = false; }
      else if (pick === 'Déplacer') swapFrom = i;
      else if (pick === 'Envoyer') { if (why) { ui.sound.sfx('bump'); await ui.say(why); } else { close(i); return; } }
      draw();
    };

    const draw = () => {
      colLead.innerHTML = '';
      colSubs.innerHTML = '';

      party.forEach((m, k) => {
        const isKo = m.hp <= 0;
        const isCapped = m.lvl >= cap;
        const r = Math.max(0, Math.min(1, m.hp / m.stats[0]));
        const rawExp = expProgress(m, cap);
        const expPct = isNaN(rawExp) || rawExp == null ? '0' : Math.max(0, Math.min(100, rawExp * 100)).toFixed(0);
        const why = o.filter ? o.filter(m, k) : null;
        const spTypes = SPECIES[m.sp]?.t || ['normal'];
        const typesHtml = spTypes.map((t) => `<span class="pslot-type" style="--tc:${TYPE_COL[t] || '#888'}">${TYPE_FR[t] || t}</span>`).join('');
        const ballKey = (m.ball || 'poke-ball').replace('-', '_');

        if (k === 0) {
          // LEAD SLOT (Grand format gauche)
          const c = el('div', 'pslot-lead-card' + (isKo ? ' ko' : '') + (k === i ? ' on' : '') + (k === swapFrom ? ' swap' : '') + (why ? ' blocked' : ''));
          c.dataset.idx = 0;
          c.innerHTML = `
            <div class="pslot-lead-top">
              <div class="pslot-lead-badge-row">
                <span class="pslot-star-tag">En tête</span>
                <div class="pslot-socket">
                  <img class="pslot-ball-ico" src="img/battle/${ballKey}_32.png" onerror="this.src='img/battle/poke_ball_32.png'" alt="">
                </div>
              </div>
              <div class="pslot-lead-lvl-row">
                ${statusTag(m)}
                <span class="pl${isCapped ? ' capped' : ''}">N.${m.lvl}${isCapped ? ' <i>MAX</i>' : ''}</span>
              </div>
            </div>
            <div class="pslot-lead-pedestal">
              <div class="pslot-ped-ring"></div>
              <img class="pslot-lead-spr${m.shadow ? ' shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny, m.shadow)}" alt="" onerror="this.src='${ASSETS.icon(m.sp, m.shadow)}'">
            </div>
            <div class="pslot-lead-info">
              <div class="pslot-lead-name-row">
                <span class="pn">${esc(monName(m))}</span>
                ${gender(m)}
              </div>
              <div class="pslot-types">${typesHtml}</div>
              <div class="pslot-hp-box">
                <div class="hp-b2w2">
                  <span class="hp-tag">PV</span>
                  <div class="hp-track"><u style="width:${(r * 100).toFixed(1)}%;background:${hpCol(r)}"></u></div>
                </div>
                <div class="phpn">${m.hp} / ${m.stats[0]}</div>
              </div>
              <div class="pexp-b2w2">
                <span class="pexp-tag">EXP</span>
                <div class="pexp-track"><u style="width:${expPct}%"></u></div>
                <span class="pexp-val">${expPct}%</span>
              </div>
              ${why ? `<div class="pwhy">${esc(why)}</div>` : ''}
            </div>`;
          c.addEventListener('mouseenter', () => { if (!busy && i !== 0) { i = 0; ui.sound.sfx('blip'); draw(); } });
          c.addEventListener('click', (e) => { e.stopPropagation(); triggerSlot(0); });
          colLead.appendChild(c);
        } else {
          // SLOTS SECONDAIRES 1..5 (Fentes biseautées B2W2 droite)
          const c = el('div', 'pslot-sub' + (isKo ? ' ko' : '') + (k === i ? ' on' : '') + (k === swapFrom ? ' swap' : '') + (why ? ' blocked' : ''));
          c.dataset.idx = k;
          c.innerHTML = `
            <div class="pslot-sub-left">
              <div class="pslot-socket">
                <img class="pslot-ball-ico" src="img/battle/${ballKey}_32.png" onerror="this.src='img/battle/poke_ball_32.png'" alt="">
              </div>
              <span class="pslot-sub-num">#${k + 1}</span>
              <div class="pslot-sub-ped">
                <img class="pslot-sub-spr${m.shadow ? ' shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny, m.shadow)}" alt="" onerror="this.src='${ASSETS.icon(m.sp, m.shadow)}'">
              </div>
            </div>
            <div class="pslot-sub-mid">
              <div class="pslot-sub-top">
                <span class="pn">${esc(monName(m))}</span>
                ${gender(m)}
              </div>
              <div class="pslot-sub-mid-row">
                <div class="pslot-types">${typesHtml}</div>
                <div class="pslot-sub-tags">
                  ${statusTag(m)}
                  <span class="pl${isCapped ? ' capped' : ''}">N.${m.lvl}</span>
                </div>
              </div>
              ${why ? `<div class="pwhy">${esc(why)}</div>` : ''}
            </div>
            <div class="pslot-sub-right">
              <div class="hp-b2w2">
                <span class="hp-tag">PV</span>
                <div class="hp-track"><u style="width:${(r * 100).toFixed(1)}%;background:${hpCol(r)}"></u></div>
              </div>
              <div class="phpn">${m.hp} / ${m.stats[0]}</div>
              <div class="pexp-b2w2">
                <span class="pexp-tag">EXP</span>
                <div class="pexp-track"><u style="width:${expPct}%"></u></div>
              </div>
            </div>`;
          c.addEventListener('mouseenter', () => { if (!busy && i !== k) { i = k; ui.sound.sfx('blip'); draw(); } });
          c.addEventListener('click', (e) => { e.stopPropagation(); triggerSlot(k); });
          colSubs.appendChild(c);
        }
      });

      // Emplacements libres (au maximum 5 fentes secondaires)
      const startEmpty = Math.max(1, party.length);
      for (let k = startEmpty; k < 6; k++) {
        const emp = el('div', 'pslot-sub empty');
        emp.innerHTML = `
          <div class="pslot-sub-left">
            <div class="pslot-socket empty"></div>
            <span class="pslot-sub-num">#${k + 1}</span>
          </div>
          <div class="pslot-empty-lbl"></div>`;
        colSubs.appendChild(emp);
      }

      cancel.classList.toggle('on', i === party.length);
      help.textContent = swapFrom >= 0
        ? `Échanger la place de ${monName(party[swapFrom])} avec quel Pokémon ?`
        : o.prompt || 'Sélectionne un Pokémon (Clic ou Entrée · Échap pour quitter).';
    };

    cancel.addEventListener('mouseenter', () => {
      if (!busy && i !== party.length) { i = party.length; ui.sound.sfx('blip'); draw(); }
    });
    cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerSlot(party.length);
    });

    draw();
    const close = closer(ui, s, () => pop, resolve, null);
    const pop = ui.input.push(async (k) => {
      if (busy) return;
      const n = party.length;
      if (k === 'up') {
        if (i === n) i = n > 1 ? n - 1 : 0;
        else if (i === 0) i = n;
        else if (i === 1) i = 0;
        else i--;
      } else if (k === 'down') {
        if (i === n) i = 0;
        else if (i === 0) i = n > 1 ? 1 : n;
        else if (i === n - 1) i = n;
        else i++;
      } else if (k === 'left') {
        if (i > 0 && i < n) i = 0;
      } else if (k === 'right') {
        if (i === 0 && n > 1) i = 1;
      } else if (k === 'b') {
        if (swapFrom >= 0) { swapFrom = -1; draw(); return; }
        ui.sound.sfx('cancel'); close(-1); return;
      } else if (k === 'a') {
        await triggerSlot(i); return;
      } else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}

/* ================= ENREGISTREMENT POKÉDEX (Style 5G Noir 2 / Blanc 2) ================= */
export function pokedexRegisterScene(game, mon) {
  const ui = game.ui, sound = game.sound;
  const sp = mon.sp;
  const def = SPECIES[sp] || { n: 'Pokémon Inconnu', t: ['normal'], genus: 'Pokémon Mystère', h: 10, w: 100, dex: 'Données non répertoriées.' };
  const pdxNum = `N° ${String(sp).padStart(3, '0')}`;
  const hVal = (def.h != null ? (def.h / 10).toFixed(1) : '1.0');
  const wVal = (def.w != null ? (def.w / 10).toFixed(1) : '10.0');
  const typesHtml = (def.t || ['normal']).map((t) => `<span class="pdx-type-badge" style="--tc:${TYPE_COL[t] || '#888'}">${TYPE_FR[t] || t}</span>`).join('');
  const genderTag = mon.gender === 'm' ? '<span class="g m">♂</span>' : mon.gender === 'f' ? '<span class="g f">♀</span>' : '';

  return new Promise((resolve) => {
    const s = screen(ui, 'pokedex-reg-scr');
    s.innerHTML = `
      <div class="pdx-shell">
        <div class="pdx-topbar">
          <div class="pdx-lights">
            <span class="pdx-light blue pulse"></span>
            <span class="pdx-light red"></span>
            <span class="pdx-light yellow"></span>
            <span class="pdx-light green"></span>
          </div>
          <div class="pdx-title-zone">
            <span class="pdx-badge">POKÉDEX D'ODYSSÉE</span>
            <span class="pdx-header-txt">NOUVELLE ENTRÉE DÉTECTÉE</span>
          </div>
          <div class="pdx-decor-grid"></div>
        </div>

        <div class="pdx-body">
          <div class="pdx-left-col">
            <div class="pdx-num-banner">
              <span class="pdx-num-digital">${pdxNum}</span>
              <span class="pdx-stamp">✓ ENREGISTRÉ</span>
            </div>
            <div class="pdx-holo-frame">
              <div class="pdx-holo-lines"></div>
              <div class="pdx-scanner-beam"></div>
              <div class="pdx-pedestal"></div>
              <img class="pdx-mon-spr" src="${ASSETS.front(sp, mon.shiny)}" alt="${esc(def.n)}">
            </div>
            <div class="pdx-sensor-bar">
              <i class="pdx-wave-icon"></i>
              <span>SIGNAL BIO-ACOUSTIQUE IDENTIFIÉ</span>
            </div>
          </div>

          <div class="pdx-right-col">
            <div class="pdx-name-card">
              <div class="pdx-name-main">
                <span class="pdx-name-txt">${esc(def.n)}</span>
                ${genderTag}
              </div>
              <span class="pdx-genus-tag">${esc(def.genus || 'Pokémon')}</span>
            </div>

            <div class="pdx-specs-row">
              <div class="pdx-spec-cell">
                <span class="pdx-spec-lbl">TYPE(S)</span>
                <div class="pdx-types">${typesHtml}</div>
              </div>
              <div class="pdx-spec-cell">
                <span class="pdx-spec-lbl">TAILLE</span>
                <span class="pdx-spec-val"><b>${hVal}</b> m</span>
              </div>
              <div class="pdx-spec-cell">
                <span class="pdx-spec-lbl">POIDS</span>
                <span class="pdx-spec-val"><b>${wVal}</b> kg</span>
              </div>
            </div>

            <div class="pdx-desc-card">
              <div class="pdx-desc-bar">
                <span class="pdx-desc-title">RAPPORT DU POKÉDEX</span>
                <span class="pdx-desc-cur">■</span>
              </div>
              <div class="pdx-desc-viewport">
                <p class="pdx-desc-txt"></p>
              </div>
            </div>
          </div>
        </div>

        <div class="pdx-footbar">
          <span class="pdx-status-msg">✓ Données de ${esc(def.n)} inscrites dans le Pokédex !</span>
          <button class="pdx-btn-next ready" type="button">CONTINUER ▶</button>
        </div>
      </div>
    `;

    const descTxtEl = s.querySelector('.pdx-desc-txt');
    const nextBtn = s.querySelector('.pdx-btn-next');
    const fullDesc = def.dex || 'Aucune description disponible pour ce spécimen dans la base régionale.';

    let charIdx = 0, textTimer = null, typingDone = false;
    const typeSpeed = 18;

    const finishTyping = () => {
      if (typingDone) return;
      typingDone = true;
      if (textTimer) clearInterval(textTimer);
      descTxtEl.textContent = fullDesc;
      nextBtn.classList.add('ready');
    };

    sound.sfx('select');
    setTimeout(() => {
      sound.cry(ASSETS.cry(sp));
    }, 250);

    textTimer = setInterval(() => {
      if (charIdx < fullDesc.length) {
        charIdx++;
        descTxtEl.textContent = fullDesc.slice(0, charIdx);
        if (charIdx % 4 === 0) sound.sfx('blip');
      } else {
        finishTyping();
      }
    }, typeSpeed);

    const finish = closer(game.ui, s, () => pop, resolve, 'select', () => { if (textTimer) clearInterval(textTimer); });
    const close = () => {
      if (!typingDone) { finishTyping(); return; }
      finish();
    };

    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    s.addEventListener('click', () => {
      if (!typingDone) finishTyping();
      else close();
    });

    const pop = ui.input.push((k) => {
      if (k === 'a' || k === 'b' || k === 'start') {
        if (!typingDone) finishTyping();
        else close();
      }
    });
  });
}

/* ================= RÉSUMÉ (Style 5G Noir 2 / Blanc 2) ================= */
export function summaryScreen(game, list, idx) {
  const ui = game.ui;
  const cap = game.levelCap ? game.levelCap() : levelCap(game.state?.badges);
  return new Promise((resolve) => {
    const s = screen(ui, 'sum-scr');
    let page = 0;
    const closeIdx = closer(ui, s, () => pop, resolve);
    const close = () => closeIdx(idx);
    const draw = () => {
      const m = list[idx], S = SPECIES[m.sp];
      const isCapped = m.lvl >= cap;
      const tabs = [
        ['INFOS DRESSEUR', 'Aperçu'],
        ['STATISTIQUES', 'Capacités'],
        ['ATTAQUES CONNUES', `${m.moves.length}/4`],
      ].map(([t, sub], k) => `<button type="button" class="sum-tab ${k === page ? 'on' : ''}" data-tab="${k}"><b>${t}</b><small>${sub}</small></button>`).join('');
      let body = '';
      if (page === 0) {
        body = `
          <table class="kv sum-kv">
            <tr><td>N° Pokédex</td><td>#${String(S.no || m.sp).padStart(3, '0')}</td></tr>
            <tr><td>Espèce</td><td>${esc(S.n)}</td></tr>
            <tr><td>Type</td><td>${S.t.map(typeTag).join(' ')}</td></tr>
            <tr><td>Dresseur Orig.</td><td>${esc(m.ot || game.state.name)}</td></tr>
            <tr><td>Rencontré à</td><td>${esc(m.met || '—')}</td></tr>
            <tr><td>Nature</td><td>${esc(natureName(m.nat ?? 0))}${(() => { const ne = natureEffect(m.nat ?? 0); return ne ? ` <small class="nat-fx">(+${STAT_NAMES[ne[0]]} / −${STAT_NAMES[ne[1]]})</small>` : ' <small class="nat-fx">(neutre)</small>'; })()}</td></tr>
            <tr><td>Talent</td><td>${(() => { const ab = getAbility(m); return ab ? `<b>${esc(ab.name)}</b>${ab.desc ? ` <small class="nat-fx">${esc(ab.desc)}</small>` : ''}` : '—'; })()}</td></tr>
            <tr><td>Points Exp.</td><td>${m.exp.toLocaleString('fr-FR')} pts</td></tr>
            <tr><td>Limite Arène</td><td>N.${cap} ${isCapped ? '<span class="sum-cap-tag">ATTEINTE</span>' : ''}</td></tr>
          </table>
          <div class="expline"><b>EXP</b><i><u style="width:${(expProgress(m, cap) * 100).toFixed(1)}%"></u></i></div>
          <div class="dexline">${esc(S.genus ? S.genus + ' — ' + (S.dex || '') : S.dex || '')}</div>`;
      } else if (page === 1) {
        // stats avec la nature (▲ +10 % en rouge, ▼ −10 % en bleu), les IV (0 à 31) et les EV (252 max, 510 en tout)
        const ne = natureEffect(m.nat ?? 0), ev = m.ev || [0, 0, 0, 0, 0, 0], evTot = ev.reduce((a, x) => a + x, 0);
        body = `<table class="kv stats sum-kv sum-stats"><tr class="sth"><td></td><td>Stat</td><td></td><td>IV</td><td>EV</td></tr>${STAT_NAMES.map((n, k) => `<tr><td class="${ne && ne[0] === k ? 'nat-up' : ne && ne[1] === k ? 'nat-down' : ''}">${n}${ne && ne[0] === k ? ' ▲' : ne && ne[1] === k ? ' ▼' : ''}</td><td><b>${k === 0 ? `${m.hp} / ${m.stats[0]}` : m.stats[k]}</b></td><td><i class="sbar"><u style="width:${Math.min(100, S.b[k] / 1.5)}%"></u></i></td><td class="iv${m.iv[k] === 31 ? ' max' : ''}">${m.iv[k]}</td><td class="evv">${ev[k]}</td></tr>`).join('')}</table>
          <div class="sum-natline">Nature <b>${esc(natureName(m.nat ?? 0))}</b> · EV ${evTot} / 510 · Les EV s'ajoutent aux stats au niveau suivant ou au Centre.</div>`;
      } else {
        body = `<div class="moves">${m.moves.map((mv) => {
          const M = MOVES[mv.id];
          return `<div class="mv" style="--tc:${TYPE_COL[M.t]}">
            <div class="mv-top"><span class="mvn">${esc(M.n)}</span>${typeTag(M.t)}<span class="mvpp">PP <b>${mv.pp}</b>/${M.pp}</span></div>
            <div class="mvd">${M.c === 'status' ? 'Catégorie : Statut' : `Puissance : ${M.p || '—'}`} · Précision : ${M.a ?? '—'}%</div>
          </div>`;
        }).join('')}</div>`;
      }
      s.innerHTML = `
        <div class="scr-bar">
          <div class="scr-bar-left">
            <img class="scr-bar-ico" src="img/hud/team.png" alt="">
            <span class="scr-bar-title">RÉSUMÉ POKÉMON</span>
            <span class="scr-bar-sub">${idx + 1} / ${list.length}</span>
          </div>
          <div class="scr-bar-right">
            <button type="button" class="scr-nav-btn" data-act="prev" title="Pokémon précédent (▲)">▲ PRÉC.</button>
            <button type="button" class="scr-nav-btn" data-act="next" title="Pokémon suivant (▼)">▼ SUIV.</button>
            <button type="button" class="scr-close-btn" data-act="close">RETOUR ✕</button>
          </div>
        </div>
        <div class="sum-body">
          <div class="sum-left">
            <div class="sum-head">
              <span class="sum-name">${esc(monName(m))}${gender(m)}</span>
              <span class="sum-lvl">N.${m.lvl}</span>
            </div>
            <div class="sum-stage">
              <img class="sum-spr${m.shadow ? ' shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny, m.shadow)}" alt="">
            </div>
            <div class="sum-types-row">${S.t.map(typeTag).join(' ')} ${statusTag(m)}</div>
            ${hpBar(m)}
            <div class="phpn">${m.hp} / ${m.stats[0]} PV</div>
          </div>
          <div class="sum-right">
            <div class="tabs">${tabs}</div>
            <div class="sum-content">${body}</div>
          </div>
        </div>
        <div class="sum-help">◀ ▶ Changer d'onglet · ▲ ▼ Changer de Pokémon · Clic ou Échap pour fermer</div>`;

      s.querySelectorAll('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          page = +btn.dataset.tab;
          ui.sound.sfx('blip');
          draw();
        });
      });
      s.querySelector('[data-act="prev"]')?.addEventListener('click', () => {
        idx = (idx - 1 + list.length) % list.length;
        ui.sound.sfx('blip');
        draw();
      });
      s.querySelector('[data-act="next"]')?.addEventListener('click', () => {
        idx = (idx + 1) % list.length;
        ui.sound.sfx('blip');
        draw();
      });
      s.querySelector('[data-act="close"]')?.addEventListener('click', close);
    };
    draw();
    const pop = ui.input.push((k) => {
      if (k === 'left') { page = (page + 2) % 3; ui.sound.sfx('blip'); draw(); }
      else if (k === 'right') { page = (page + 1) % 3; ui.sound.sfx('blip'); draw(); }
      else if (k === 'up') { idx = (idx - 1 + list.length) % list.length; ui.sound.sfx('blip'); draw(); }
      else if (k === 'down') { idx = (idx + 1) % list.length; ui.sound.sfx('blip'); draw(); }
      else if (k === 'a') {
        page = (page + 1) % 3;
        ui.sound.sfx('blip');
        draw();
      } else if (k === 'b') {
        close();
      }
    });
  });
}
