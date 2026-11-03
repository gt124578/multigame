// odyssee/js/ui/screens.js — écrans plein cadre : équipe, résumé, sac, Pokédex, carte, carte de dresseur, boutique, PC, options
import { el, esc } from './ui.js';
import { SPECIES } from '../data/species.js';
import { ORIGINALES } from '../data/remplacants.js';
import { MOVES } from '../data/moves.js';
import { ITEMS, itemName, POCKETS, canUseOn, giveHeldItem, takeHeldItem } from '../core/items.js';
import { getAbility, abilityName } from '../data/abilities.js';
import { monName, expProgress, STAT_NAMES, levelCap, GYM_CAPS, NATURES, natureName, natureEffect, refreshStats } from '../core/mon.js';
import { BADGES, LEADERS } from '../world/region.js';
import { ASSETS } from '../assets.js';
import { SPRITES } from '../data/sprites.js';
import { T, walkable } from '../world/tiles.js';
import { getAllQuests, setTrackedQuest, syncJournal } from '../core/questsData.js';

export const TYPE_FR = { fairy: 'Fée', normal: 'Normal', fighting: 'Combat', flying: 'Vol', poison: 'Poison', ground: 'Sol', rock: 'Roche', bug: 'Insecte', ghost: 'Spectre', steel: 'Acier', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', psychic: 'Psy', ice: 'Glace', dragon: 'Dragon', dark: 'Ténèbres' };
export const TYPE_COL = { fairy: '#ee99ac', normal: '#a8a878', fighting: '#c03028', flying: '#a890f0', poison: '#a040a0', ground: '#e0c068', rock: '#b8a038', bug: '#a8b820', ghost: '#705898', steel: '#b8b8d0', fire: '#f08030', water: '#6890f0', grass: '#78c850', electric: '#f8d030', psychic: '#f85888', ice: '#98d8d8', dragon: '#7038f8', dark: '#705848' };
export const STATUS_FR = { par: ['PAR', '#e8c020'], slp: ['SOM', '#8890a0'], psn: ['PSN', '#a050b0'], tox: ['PSN', '#7a3090'], brn: ['BRÛ', '#e86030'], frz: ['GEL', '#60c0e8'] };
export const typeTag = (t) => `<span class="type" style="background:${TYPE_COL[t]}">${TYPE_FR[t]}</span>`;
export const hpCol = (r) => (r > 0.5 ? '#48d058' : r > 0.2 ? '#f0c020' : '#f04838');
export function hpBar(m) { const r = m.hp / m.stats[0]; return `<div class="hp"><b>PV</b><i><u style="width:${Math.max(0, r * 100)}%;background:${hpCol(r)}"></u></i></div>`; }
export const statusTag = (m) => (m.hp <= 0 ? '<span class="st" style="background:#c03838">K.O.</span>' : m.status ? `<span class="st" style="background:${STATUS_FR[m.status][1]}">${STATUS_FR[m.status][0]}</span>` : '');
const gender = (m) => (m.gender === 'm' ? '<span class="g m">♂</span>' : m.gender === 'f' ? '<span class="g f">♀</span>' : '');
const iconImg = (m) => `<img class="ico" src="${ASSETS.icon(m.sp)}" alt="" onerror="this.src='${ASSETS.front(m.sp)}';this.classList.add('fallback')">`;

function screen(ui, cls, title) {
  const s = el('div', 'screen ' + cls);
  if (title) s.appendChild(el('div', 'scr-title', esc(title)));
  ui.root.appendChild(s);
  return s;
}

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
        if (why) { ui.sound.sfx('bump'); return; }
        close(i);
        return;
      }
      busy = true;
      const opts = o.mode === 'battle' ? ['Envoyer', 'Résumé', 'Annuler'] : ['Résumé', 'Déplacer', 'Annuler'];
      const r = await ui.list({ items: opts.map((label) => ({ label })), cls: 'psub', cancel: opts.length - 1, parent: s });
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
                <span class="pslot-star-tag">★ 1 LEADER</span>
                <div class="pslot-socket">
                  <img class="pslot-ball-ico" src="img/battle/${ballKey}_32.png" onerror="this.src='img/battle/poke_ball_32.png'" alt="">
                </div>
              </div>
              <div class="pslot-lead-lvl-row">
                ${statusTag(m)}
                <span class="pl${isCapped ? ' capped' : ''}">Lv. ${m.lvl}${isCapped ? ' <i>MAX</i>' : ''}</span>
              </div>
            </div>
            <div class="pslot-lead-pedestal">
              <div class="pslot-ped-ring"></div>
              <img class="pslot-lead-spr${m.shadow ? ' shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny)}" alt="" onerror="this.src='${ASSETS.icon(m.sp)}'">
            </div>
            <div class="pslot-lead-info">
              <div class="pslot-lead-name-row">
                <span class="pn">${esc(monName(m))}</span>
                ${gender(m)}
              </div>
              <div class="pslot-types">${typesHtml}</div>
              <div class="pslot-hp-box">
                <div class="hp-b2w2">
                  <span class="hp-tag">HP</span>
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
                <img class="pslot-sub-spr${m.shadow ? ' shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny)}" alt="" onerror="this.src='${ASSETS.icon(m.sp)}'">
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
                  <span class="pl${isCapped ? ' capped' : ''}">Lv. ${m.lvl}</span>
                </div>
              </div>
              ${why ? `<div class="pwhy">${esc(why)}</div>` : ''}
            </div>
            <div class="pslot-sub-right">
              <div class="hp-b2w2">
                <span class="hp-tag">HP</span>
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
          <div class="pslot-empty-lbl">EMPLACEMENT DISPONIBLE #${k + 1}</div>`;
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
    const close = (v) => { pop(); s.remove(); resolve(v); };
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

    let closed = false;
    const close = () => {
      if (closed) return;
      if (!typingDone) { finishTyping(); return; }
      closed = true;
      sound.sfx('select');
      pop();
      s.remove();
      resolve();
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
    const close = () => { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(idx); };
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
              <img class="sum-spr${m.shadow ? ' shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny)}" alt="">
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
      if (k === 'left') page = (page + 2) % 3;
      else if (k === 'right') page = (page + 1) % 3;
      else if (k === 'up') idx = (idx - 1 + list.length) % list.length;
      else if (k === 'down') idx = (idx + 1) % list.length;
      else if (k === 'b' || k === 'a') { close(); return; }
      else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}

/* ================= SAC (Style 5G Noir 2 / Blanc 2) ================= */
const POCKET_DESC = [
  'Potions, rappels et remèdes pour restaurer les PV et le statut.',
  'Poké Balls pour capturer les créatures sauvages.',
  'Pierres d\'évolution, Repousses, Super Bonbons et objets utiles.',
  'Capsules Secrètes (CS), Carte et reliques précieuses.',
];
/** renvoie { item } choisi pour « Utiliser », ou null — Style B2W2 (Proposition 1 : Dual Panel & Roue Animée) */
export function bagScreen(game, o = {}) {
  const ui = game.ui, bag = game.state.bag;
  return new Promise((resolve) => {
    const s = screen(ui, 'bag-scr b2w2-bag');
    let pocket = o.pocket || 0, i = 0, busy = false;

    const entriesFor = (p) => Object.keys(bag).filter((k) => ITEMS[k] && ITEMS[k].pocket === POCKETS[p][0] && bag[k] > 0).sort((a, b) => Object.keys(ITEMS).indexOf(a) - Object.keys(ITEMS).indexOf(b));
    const entries = () => entriesFor(pocket);

    const close = (v) => { pop(); s.remove(); resolve(v); };

    // Poches officielles B2W2 avec thèmes visuels et auras
    const POCKET_CFG = [
      { id: 'soin', label: 'Soins', sub: 'Médicaments, Potions et Baies', icon: 'img/items/potion.png', color: '#34d870', glow: 'rgba(52, 216, 112, 0.45)' },
      { id: 'balls', label: 'Poké Balls', sub: 'Capsules de capture de créatures', icon: 'img/items/poke-ball.png', color: '#ff4c4c', glow: 'rgba(255, 76, 76, 0.45)' },
      { id: 'objets', label: 'Objets', sub: 'Objets tenus, Pierres et Bonbons', icon: 'img/items/rare-candy.png', color: '#00e0ff', glow: 'rgba(0, 224, 255, 0.45)' },
      { id: 'cles', label: 'Objets Rares', sub: 'Reliques précieuses, Carte et CS', icon: 'img/items/town-map.png', color: '#ffe058', glow: 'rgba(255, 224, 88, 0.45)' },
    ];

    // Track rotatif en boucle [3, 0, 1, 2, 3, 0]
    const trackSlots = [3, 0, 1, 2, 3, 0];

    s.innerHTML = `
      <div class="scr-bar">
        <div class="scr-bar-left">
          <img class="scr-bar-ico" src="img/hud/bag.png" alt="">
          <span class="scr-bar-title">${o.battle ? 'SAC DE COMBAT' : "SAC D'OBJETS"}</span>
          <span class="scr-bar-sub b2w2-pocket-name">SOINS</span>
        </div>
        <div class="scr-bar-right">
          <span class="scr-money-pill"><img src="img/hud/coin.png" alt=""> ${(game.state?.money || 0).toLocaleString('fr-FR')} ₽</span>
          <button type="button" class="scr-close-btn" data-act="close">FERMER ✕</button>
        </div>
      </div>
      <div class="b2w2-bag-body">
        <!-- PANNEAU GAUCHE : ROUE ANIMÉE & SOCLE SAC -->
        <div class="b2w2-bag-left">
          <div class="b2w2-wheel-panel">
            <button type="button" class="b2w2-wheel-nav up" title="Poche précédente (▲ ou Flèche Gauche)">▲</button>
            <div class="b2w2-wheel-viewport">
              <div class="b2w2-wheel-track">
                ${trackSlots.map((pIdx, slotPos) => {
                  const cfg = POCKET_CFG[pIdx];
                  return `<div class="b2w2-wheel-slot" data-slot-pos="${slotPos}" data-pocket="${pIdx}" style="--p-col:${cfg.color}; --p-glow:${cfg.glow}">
                    <span class="slot-dot"></span>
                    <img class="slot-ico" src="${cfg.icon}" alt="">
                    <span class="slot-lbl">${cfg.label}</span>
                    <span class="slot-cnt" data-cnt-for="${pIdx}">0</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
            <button type="button" class="b2w2-wheel-nav down" title="Poche suivante (▼ ou Flèche Droite)">▼</button>
          </div>
          <div class="b2w2-mascot-panel">
            <div class="b2w2-mascot-glow"></div>
            <img class="b2w2-mascot-img" src="img/hud/bag.png" alt="Sac d'Unys">
            <div class="b2w2-mascot-badge">◀ SOINS ▶</div>
            <div class="b2w2-mascot-sub">Médicaments, Potions et Baies</div>
          </div>
        </div>
        <!-- PANNEAU DROIT : LISTE DES OBJETS DE LA POCHE -->
        <div class="b2w2-bag-right">
          <div class="b2w2-list-header">
            <div class="b2w2-list-title">
              <span class="b2w2-pocket-tag">POCHE SOINS</span>
              <span class="b2w2-pocket-items-cnt">0 objet</span>
            </div>
            <div class="b2w2-list-hint">
              <span><kbd>▲</kbd><kbd>▼</kbd> Naviguer</span>
              <span><kbd>◀</kbd><kbd>▶</kbd> Roue</span>
            </div>
          </div>
          <div class="b2w2-items-viewport">
            <div class="b2w2-items-list"></div>
          </div>
        </div>
      </div>
      <!-- BANDEAU INFÉRIEUR : INSPECTEUR D'OBJET & BOUTONS TACTILES -->
      <div class="b2w2-bag-inspector">
        <div class="b2w2-insp-left">
          <div class="b2w2-insp-frame">
            <img class="b2w2-insp-img" src="img/items/potion.png" alt="">
          </div>
        </div>
        <div class="b2w2-insp-mid">
          <div class="b2w2-insp-topline">
            <span class="b2w2-insp-name">---</span>
            <span class="b2w2-insp-qty">---</span>
          </div>
          <div class="b2w2-insp-desc">---</div>
        </div>
        <div class="b2w2-insp-actions">
          <button type="button" class="b2w2-act-btn use" data-act="use">
            <span class="act-btn-ico">✔</span>
            <span class="act-btn-lbl">UTILISER</span>
          </button>
          <button type="button" class="b2w2-act-btn toss" data-act="toss">
            <span class="act-btn-ico">🗑</span>
            <span class="act-btn-lbl">JETER</span>
          </button>
          <button type="button" class="b2w2-act-btn close" data-act="close">
            <span class="act-btn-ico">✕</span>
            <span class="act-btn-lbl">RETOUR</span>
          </button>
        </div>
      </div>
    `;

    // Références DOM
    const scrBarSub = s.querySelector('.b2w2-pocket-name');
    const wheelTrack = s.querySelector('.b2w2-wheel-track');
    const wheelSlots = [...s.querySelectorAll('.b2w2-wheel-slot')];
    const mascotGlow = s.querySelector('.b2w2-mascot-glow');
    const mascotBadge = s.querySelector('.b2w2-mascot-badge');
    const mascotSub = s.querySelector('.b2w2-mascot-sub');
    const pocketTag = s.querySelector('.b2w2-pocket-tag');
    const pocketItemsCnt = s.querySelector('.b2w2-pocket-items-cnt');
    const itemsListEl = s.querySelector('.b2w2-items-list');
    const inspSpriteEl = s.querySelector('.b2w2-insp-img');
    const inspNameEl = s.querySelector('.b2w2-insp-name');
    const inspQtyEl = s.querySelector('.b2w2-insp-qty');
    const inspDescEl = s.querySelector('.b2w2-insp-desc');
    const useBtn = s.querySelector('.b2w2-act-btn.use');
    const tossBtn = s.querySelector('.b2w2-act-btn.toss');
    const closeBtn = s.querySelector('.b2w2-act-btn.close');
    const leftPanel = s.querySelector('.b2w2-bag-left');

    const updateCounts = () => {
      POCKET_CFG.forEach((cfg, pIdx) => {
        const count = entriesFor(pIdx).length;
        s.querySelectorAll(`[data-cnt-for="${pIdx}"]`).forEach((el) => {
          el.textContent = count;
        });
      });
    };

    const updateWheel = () => {
      const cfg = POCKET_CFG[pocket];
      const activeSlotPos = pocket + 1;
      // Déplacement de la roue animée par glisse fluide (pitch de 14 * var(--px))
      wheelTrack.style.transform = `translateY(calc(var(--px) * ${ -pocket * 14 }))`;

      wheelSlots.forEach((slot) => {
        const pos = +slot.dataset.slotPos;
        slot.classList.toggle('on', pos === activeSlotPos);
      });

      // Mise à jour de l'aura et du badge du socle de baroudeur
      mascotGlow.style.setProperty('--pedestal-col', cfg.color);
      mascotBadge.textContent = `◀ ${cfg.label.toUpperCase()} ▶`;
      mascotBadge.style.color = cfg.color;
      mascotSub.textContent = cfg.sub;

      // Mise à jour de l'en-tête
      scrBarSub.textContent = cfg.label.toUpperCase();
      pocketTag.textContent = `POCHE ${cfg.label.toUpperCase()}`;
      pocketTag.style.setProperty('--tag-col', cfg.color);
    };

    const updateInspector = () => {
      const es = entries();
      if (i > es.length) i = es.length;
      const sel = es[i];
      if (sel) {
        const it = ITEMS[sel];
        inspSpriteEl.src = ASSETS.item(sel);
        inspSpriteEl.style.display = '';
        inspNameEl.textContent = itemName(sel);
        inspQtyEl.textContent = it.key ? 'Objet Unique Rare' : `Quantité en sac : × ${bag[sel]}`;
        inspDescEl.textContent = it.desc || '';

        const canUse = o.battle
          ? (it.heal || it.cure || it.revive || it.ball || it.pp || it.ppAll)
          : (!it.key || it.field || sel === 'town-map' || sel === 'velo');
        useBtn.disabled = !canUse;
        useBtn.classList.toggle('disabled', !canUse);
        useBtn.querySelector('.act-btn-lbl').textContent = 'UTILISER';

        const canToss = !o.battle && !it.key;
        tossBtn.style.display = canToss ? '' : 'none';
      } else {
        // Ligne de fermeture sélectionnée
        inspSpriteEl.style.display = 'none';
        inspNameEl.textContent = 'Fermer le Sac';
        inspQtyEl.textContent = '';
        inspDescEl.textContent = "Revenir à l'aventure sans utiliser d'objet.";
        useBtn.disabled = false;
        useBtn.classList.remove('disabled');
        useBtn.querySelector('.act-btn-lbl').textContent = 'FERMER';
        tossBtn.style.display = 'none';
      }
    };

    const renderList = () => {
      const es = entries();
      pocketItemsCnt.textContent = `${es.length} objet${es.length > 1 ? 's' : ''}`;
      if (i > es.length) i = es.length;

      if (es.length === 0) {
        itemsListEl.innerHTML = `
          <div class="b2w2-empty-msg">Cette poche est vide pour le moment.</div>
          <div class="list-row b2w2-item-row b2w2-close-row on" data-row="0">
            <span class="cur">▶</span>
            <span class="b2w2-item-name" style="color:#ff9898;">FERMER LE SAC</span>
            <span class="b2w2-item-qty" style="color:#98a8c0;">Échap / B</span>
          </div>`;
        i = 0;
      } else {
        itemsListEl.innerHTML = es.map((k, n) => {
          const it = ITEMS[k];
          const heldTag = it.hold ? `<span class="b2w2-held-tag">TENU</span>` : '';
          return `<div class="list-row b2w2-item-row ${n === i ? 'on' : ''}" data-row="${n}">
            <span class="cur">${n === i ? '▶' : ''}</span>
            <div class="b2w2-item-ico-wrap">
              <img class="b2w2-item-ico" src="${ASSETS.item(k)}" alt="">
            </div>
            <span class="b2w2-item-name">${esc(itemName(k))}</span>
            ${heldTag}
            <span class="b2w2-item-qty">${it.key ? 'CLÉ' : '× ' + bag[k]}</span>
          </div>`;
        }).join('') +
        `<div class="list-row b2w2-item-row b2w2-close-row ${i === es.length ? 'on' : ''}" data-row="${es.length}">
          <span class="cur">${i === es.length ? '▶' : ''}</span>
          <span class="b2w2-item-name" style="color:#ff9898;">FERMER LE SAC</span>
          <span class="b2w2-item-qty" style="color:#98a8c0;">Échap / B</span>
        </div>`;
      }

      // Liaisons événements sur les lignes de la liste
      itemsListEl.querySelectorAll('[data-row]').forEach((row) => {
        const idx = +row.dataset.row;
        row.addEventListener('mouseenter', () => {
          if (!busy && i !== idx) {
            i = idx;
            itemsListEl.querySelectorAll('.b2w2-item-row').forEach((r, k) => {
              r.classList.toggle('on', k === i);
              const cur = r.querySelector('.cur');
              if (cur) cur.textContent = k === i ? '▶' : '';
            });
            ui.sound.sfx('blip');
            updateInspector();
          }
        });
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerRow(idx);
        });
      });

      itemsListEl.querySelector('.b2w2-item-row.on')?.scrollIntoView({ block: 'nearest' });
    };

    const changePocket = (newP) => {
      if (busy || newP === pocket) return;
      pocket = (newP + 4) % 4;
      i = 0;
      ui.sound.sfx('blip');
      updateWheel();
      renderList();
      updateInspector();
    };

    const changeItem = (newI) => {
      const es = entries();
      const max = es.length;
      i = (newI + max + 1) % (max + 1);
      ui.sound.sfx('blip');
      itemsListEl.querySelectorAll('.b2w2-item-row').forEach((r, k) => {
        r.classList.toggle('on', k === i);
        const cur = r.querySelector('.cur');
        if (cur) cur.textContent = k === i ? '▶' : '';
      });
      itemsListEl.querySelector('.b2w2-item-row.on')?.scrollIntoView({ block: 'nearest' });
      updateInspector();
    };

    const triggerRow = async (idx) => {
      if (busy) return;
      const es = entries();
      if (idx === es.length) { ui.sound.sfx('cancel'); close(null); return; }
      if (idx < 0 || idx > es.length) return;
      i = idx;
      updateInspector();

      const item = es[i], it = ITEMS[item];
      const canUse = o.battle
        ? (it.heal || it.cure || it.revive || it.ball || it.pp || it.ppAll)
        : (!it.key || it.field || item === 'town-map' || item === 'velo');

      if (!canUse) {
        ui.sound.sfx('bump');
        return;
      }
      ui.sound.sfx('select');
      close({ item });
    };

    const handleToss = async () => {
      if (busy) return;
      const es = entries();
      const item = es[i];
      if (!item || ITEMS[item]?.key || o.battle) return;
      busy = true;
      const q = await ui.quantity(bag[item]);
      if (q && await ui.yesNo(`Jeter ${q} ${itemName(item)} ?`)) {
        bag[item] -= q;
        if (bag[item] <= 0) delete bag[item];
        ui.sound.sfx('item');
      }
      busy = false;
      updateCounts();
      renderList();
      updateInspector();
    };

    // Initialisation
    updateCounts();
    updateWheel();
    renderList();
    updateInspector();

    // Flèches haut / bas de la roue
    s.querySelector('.b2w2-wheel-nav.up')?.addEventListener('click', () => changePocket(pocket - 1));
    s.querySelector('.b2w2-wheel-nav.down')?.addEventListener('click', () => changePocket(pocket + 1));

    // Clic direct sur un emplacement de la roue
    wheelSlots.forEach((slot) => {
      slot.addEventListener('click', () => {
        const p = +slot.dataset.pocket;
        changePocket(p);
      });
    });

    // Molette de souris sur le panneau gauche pour faire tourner la roue
    leftPanel?.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (busy) return;
      if (e.deltaY > 15) changePocket(pocket + 1);
      else if (e.deltaY < -15) changePocket(pocket - 1);
    }, { passive: false });

    // Boutons de l'inspecteur
    useBtn?.addEventListener('click', () => {
      const es = entries();
      if (i === es.length) { ui.sound.sfx('cancel'); close(null); }
      else triggerRow(i);
    });
    tossBtn?.addEventListener('click', handleToss);
    closeBtn?.addEventListener('click', () => { ui.sound.sfx('cancel'); close(null); });
    s.querySelector('[data-act="close"]')?.addEventListener('click', () => { ui.sound.sfx('cancel'); close(null); });

    // Contrôles Clavier / Manette
    const pop = ui.input.push(async (k) => {
      if (busy) return;
      if (k === 'left') { changePocket(pocket - 1); return; }
      if (k === 'right') { changePocket(pocket + 1); return; }
      if (k === 'up') { changeItem(i - 1); return; }
      if (k === 'down') { changeItem(i + 1); return; }
      if (k === 'b') { ui.sound.sfx('cancel'); close(null); return; }
      if (k === 'a') {
        const es = entries();
        if (i === es.length) { ui.sound.sfx('cancel'); close(null); return; }
        await triggerRow(i);
      }
    });
  });
}

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
    s.innerHTML = `<div class="dex-left box"><img class="dex-spr" alt=""><div class="dex-info"></div></div><div class="dex-right box"><div class="dex-count">Vus : ${seen.size} · Capturés : ${caught.size}</div><div class="list-items dex-list"></div></div>`;
    const list = s.querySelector('.dex-list'), spr = s.querySelector('.dex-spr'), info = s.querySelector('.dex-info');
    list.innerHTML = ids.map((id) => `<div class="list-row" data-i="${id}"><span class="cur">▶</span><span class="dexn">${num(id)}</span><span class="lbl">${seen.has(id) ? esc(SPECIES[id].n) : '-----'}</span>${caught.has(id) ? '<span class="ball-mini"></span>' : ''}</div>`).join('');
    const rows = [...list.children];
    const draw = () => {
      rows.forEach((r, k) => r.classList.toggle('on', k === i)); rows[i].scrollIntoView({ block: 'nearest' });
      const id = ids[i], S = SPECIES[id];
      if (seen.has(id)) { spr.src = ASSETS.front(id); spr.style.visibility = ''; spr.classList.toggle('shadowed', !caught.has(id)); }
      else spr.style.visibility = 'hidden';
      info.innerHTML = caught.has(id) ? `<div class="dex-name">${num(id)} ${esc(S.n)}</div><div>${esc(S.genus || '')}</div><div>${S.t.map(typeTag).join(' ')}</div><div>Taille ${(S.h / 10).toLocaleString('fr-FR')} m · Poids ${(S.w / 10).toLocaleString('fr-FR')} kg</div><p>${esc(S.dex)}</p>` : seen.has(id) ? `<div class="dex-name">${num(id)} ${esc(S.n)}</div><p>Capture cette créature pour en savoir plus.</p>` : '<p>Créature inconnue.</p>';
    };
    draw();
    const pop = ui.input.push((k) => {
      if (k === 'up') i = (i - 1 + ids.length) % ids.length; else if (k === 'down') i = (i + 1) % ids.length;
      else if (k === 'left') i = Math.max(0, i - 10); else if (k === 'right') i = Math.min(ids.length - 1, i + 10);
      else if (k === 'b' || k === 'a') { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); return; }
      else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}

/* ================= CARTE DE LA RÉGION ================= */
// La carte se dévoile au fil du voyage : seules les zones parcourues sont dessinées, le reste n'est qu'une étendue
// verte ; le cadre est zoomé sur ce qu'on connaît et s'élargit à mesure qu'on avance.
/** carte de la région, dessinée comme le Pokégear de HeartGold / SoulSilver : mer en trois bleus, côtes en falaises,
 *  plaines et forêts, montagnes en paliers, routes blanches cerclées de gris, villes en pastilles rouges.
 *  Un pixel = une case ; le relief est posé par blocs de 2 × 2 cases, comme les pixels doublés du DS. */
const HG = {
  open: [81, 186, 218], far: [66, 181, 206], deep: [57, 165, 189], foam: [139, 219, 244],
  flat: [97, 195, 146], shadow: [81, 179, 128], cliff: [197, 145, 106],
  top: [242, 178, 130], vhigh: [220, 162, 114], high: [195, 146, 105], low: [162, 130, 89],
  ink: '#525252', road: '#ffffff', town: '#fa5263', townDark: '#a23047', special: '#72cb93', water: '#60b2fc',
};
let carteIcons = null;
function loadCarteIcons() {
  if (carteIcons) return carteIcons;
  carteIcons = {};
  for (const k of SPRITES.carte || []) { const im = new Image(); im.src = ASSETS.carte(k); carteIcons[k] = im; }
  return carteIcons;
}
/** relief de la région, une case = un pixel (gardé en cache : la carte ne change pas) */
function regionTerrain(game) {
  if (game._regionTerrain) return game._regionTerrain;
  const W = game.world.maps.monde, w = W.w, h = W.h, B = 2;
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  // nature de chaque bloc de 2 × 2 cases
  // 0 eau, 1 plaine, 2 forêt, 3 montagne, 4 pied de montagne (sol praticable des zones volcaniques et enneigées)
  const kind = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let water = 0, walk = 0;
    for (let dy = 0; dy < B; dy++) for (let dx = 0; dx < B; dx++) {
      const t = W.get(bx * B + dx, by * B + dy);
      if (t === T.WATER) water++; else if (walkable(t) || t === T.DOOR) walk++;
    }
    const th = W.zoneAt(bx * B, by * B)?.theme, hill = th === 'volcanic' || th === 'snow';
    kind[by * bw + bx] = water >= 2 ? 0 : walk ? (hill ? 4 : 1) : hill ? 3 : 2;
  }
  // distance de chaque bloc à la nature voisine (pour la mer : à la côte ; pour la montagne : au pied)
  const dist = (pred) => {
    const d = new Int16Array(bw * bh).fill(99), q = [];
    for (let i = 0; i < d.length; i++) if (pred(kind[i])) { d[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % bw, y = (i / bw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue; const j = ny * bw + nx; if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); } }
    }
    return d;
  };
  const toLand = dist((k) => k !== 0), toFoot = dist((k) => k !== 3), toOpen = dist((k) => k === 1 || k === 4 || k === 0);
  const c0 = document.createElement('canvas'); c0.width = w; c0.height = h;
  const ctx = c0.getContext('2d'), img = ctx.createImageData(w, h);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const i = by * bw + bx, k = kind[i];
    let c;
    if (k === 0) c = toLand[i] <= 1 ? HG.deep : toLand[i] <= 3 ? HG.far : (bx + by * 3) % 11 === 0 ? HG.foam : HG.open;
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => bx + dx >= 0 && by + dy >= 0 && bx + dx < bw && by + dy < bh && kind[(by + dy) * bw + bx + dx] === 0)) c = HG.cliff;
    else if (k === 3) { const d = toFoot[i]; c = d <= 1 ? HG.low : d <= 2 ? HG.high : d <= 4 ? HG.vhigh : HG.top; }
    else if (k === 4) c = HG.low;
    else c = k === 2 && toOpen[i] >= 2 ? HG.shadow : HG.flat;
    for (let dy = 0; dy < B; dy++) for (let dx = 0; dx < B; dx++) {
      const x = bx * B + dx, y = by * B + dy; if (x >= w || y >= h) continue;
      const o = (y * w + x) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return (game._regionTerrain = { canvas: c0, kind, bw, bh, toOpen, toFoot, B });
}

/** cadre de la carte : ce qu'on a exploré (plus une marge), jamais plus petit qu'un tiers de la région ;
 *  il garde les proportions de la région et s'élargit à mesure qu'on avance */
export function exploredView(game) {
  const W = game.world.maps.monde, C = 8, cw = Math.ceil(W.w / C), seen = game.state.explored || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of seen) { const cx = i % cw, cy = Math.floor(i / cw); x0 = Math.min(x0, cx * C); y0 = Math.min(y0, cy * C); x1 = Math.max(x1, cx * C + C); y1 = Math.max(y1, cy * C + C); }
  const p = game.worldPos(); if (!isFinite(x0)) { x0 = p.x - 20; x1 = p.x + 20; y0 = p.y - 15; y1 = p.y + 15; }
  const M = 14, ar = W.w / W.h;
  x0 -= M; y0 -= M; x1 += M; y1 += M;
  let w = Math.max(x1 - x0, W.w / 3), h = Math.max(y1 - y0, W.h / 3);
  if (w / h > ar) h = w / ar; else w = h * ar;
  w = Math.min(w, W.w); h = Math.min(h, W.h);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const x = Math.max(0, Math.min(W.w - w, cx - w / 2)), y = Math.max(0, Math.min(W.h - h, cy - h / 2));
  return { x, y, w, h };
}

/** dessine la région dans le cadre v (en cases) : relief, routes, villes, et le noir de ce qui reste à découvrir */
function drawRegion(game, cv, v) {
  const W = game.world.maps.monde, ctx = cv.getContext('2d'), R = regionTerrain(game);
  const s = cv.width / v.w;                    // pixels écran par case
  const X = (x) => (x - v.x) * s, Y = (y) => (y - v.y) * s;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(R.canvas, v.x, v.y, v.w, v.h, 0, 0, cv.width, cv.height);
  // icônes du Pokégear : grandeur fixe à l'écran (deux pixels par pixel d'icône quand la carte est zoomée)
  const k = Math.max(1, Math.min(3, Math.round(s / 2.2)));
  const I = loadCarteIcons();
  const icon = (key, x, y) => { const im = I[key]; if (im && im.complete && im.naturalWidth) ctx.drawImage(im, Math.round(X(x) - im.width * k / 2), Math.round(Y(y) - im.height * k + 2 * k), im.width * k, im.height * k); };
  const { kind, bw, toOpen, toFoot, B } = R;
  const step = Math.max(14, Math.round(22 * 2.2 / s * k));
  for (let y = 10; y < W.h - 6; y += step) for (let x = 10; x < W.w - 6; x += step) {
    const jx = x + ((x * 7 + y * 13) % 9) - 4, jy = y + ((x * 11 + y * 5) % 9) - 4;
    if (jx < v.x - 10 || jx > v.x + v.w + 10 || jy < v.y - 10 || jy > v.y + v.h + 14) continue;
    const i = Math.floor(jy / B) * bw + Math.floor(jx / B), kk = kind[i];
    if (kk === 2 && toOpen[i] >= 4 && ((x + y) / step | 0) % 2 === 0) icon((jx * 5 + jy) % 7 ? 'arbre_v' : 'arbre_o', jx, jy);
    else if (kk === 3 && toFoot[i] >= 3) icon((jx * 3 + jy) % 2 ? 'montagne' : 'colline', jx, jy);
  }
  // routes : un trait blanc cerclé de gris
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const roads = (game.world.routes || []).map((r) => r.pts);
  for (const [lw, col] of [[Math.max(4, s * 1.9), HG.ink], [Math.max(2, s * 1.1), HG.road]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    for (const pts of roads) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x + 0.5), Y(y + 0.5)) : ctx.moveTo(X(x + 0.5), Y(y + 0.5)))); ctx.stroke(); }
  }
  for (const b of W.buildings) if (b.kind === 'cave') icon('grotte_m', b.x + b.w / 2, b.y + b.d);
  const pill = (x, y, pw, ph, fill, dark) => {
    pw *= k; ph *= k; x = Math.round(X(x) - pw / 2); y = Math.round(Y(y) - ph / 2);
    ctx.fillStyle = HG.ink; ctx.fillRect(x - k, y, pw + 2 * k, ph); ctx.fillRect(x, y - k, pw, ph + 2 * k);
    ctx.fillStyle = fill; ctx.fillRect(x, y, pw, ph);
    if (dark) { ctx.fillStyle = dark; ctx.fillRect(x, y + Math.ceil(ph * 0.55), pw, Math.floor(ph * 0.45)); }
  };
  for (const m of Object.values(game.world.maps)) if (m !== W && m.outdoor && m.outside?.map === 'monde' && m.id !== 'magma') pill(m.outside.x, m.outside.y, 6, 6, HG.special);
  const visited = new Set(game.state.visited || []);
  for (const t of Object.values(game.world.towns)) {
    const big = t.gym != null || t.id === 'plateau';
    pill(t.x + t.w / 2, t.y + t.h / 2, big ? 14 : 10, big ? 10 : 8, visited.has(t.id) ? HG.town : '#b0b0b0', visited.has(t.id) ? HG.townDark : '#808080');
  }
  // ce qui n'a pas été exploré reste dans le noir, aux bords adoucis (façon Elden Ring)
  const seen = game.state.explored || [], C = 8, cw = Math.ceil(W.w / C), ch = Math.ceil(W.h / C);
  const mask = document.createElement('canvas'); mask.width = cw; mask.height = ch;
  const mx = mask.getContext('2d'), md = mx.createImageData(cw, ch);
  for (const i of seen) if (i >= 0 && i < cw * ch) md.data[i * 4 + 3] = 255;
  mx.putImageData(md, 0, 0);
  const fog = document.createElement('canvas'); fog.width = cv.width; fog.height = cv.height;
  const fx = fog.getContext('2d');
  fx.fillStyle = '#07080c'; fx.fillRect(0, 0, fog.width, fog.height);
  fx.globalCompositeOperation = 'destination-out';
  fx.imageSmoothingEnabled = true;
  fx.filter = `blur(${Math.max(2, s * 3.2)}px)`;
  fx.drawImage(mask, X(0), Y(0), cw * C * s, ch * C * s);
  fx.filter = 'none'; fx.globalCompositeOperation = 'source-over';
  ctx.drawImage(fog, 0, 0);
}
export function mapScreen(game) {
  const ui = game.ui, W = game.world.maps.monde, towns = game.world.towns, st = game.state;
  const allTowns = Object.values(towns);
  const visited = new Set(st.visited || []);
  return new Promise((resolve) => {
    const s = screen(ui, 'map-scr');
    const p = game.worldPos();
    const near = () => { let best = null, bd = 1e9; for (const r of game.world.routes || []) for (const [x, y] of r.pts) { const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = r.name; } } return best; };
    const here = game.mapObj === W && !W.zoneAt(p.x, p.y)?.name ? near() || game.locationName() : game.locationName();

    const spots = [{
      name: here,
      x: p.x,
      y: p.y,
      sub: 'Position actuelle du dresseur',
      tag: 'VOUS ÊTES ICI',
      tagCls: 'here',
    }].concat(
      allTowns.filter((t) => visited.has(t.id)).map((t) => {
        const gIdx = t.gym;
        const hasGym = gIdx != null && LEADERS[gIdx];
        const gotBadge = hasGym && st.badges?.[gIdx];
        const leader = hasGym ? LEADERS[gIdx] : null;
        const badge = hasGym ? BADGES[gIdx] : null;
        const capLvl = hasGym ? GYM_CAPS[gIdx] : null;
        return {
          id: t.id,
          name: t.name,
          x: t.x + t.w / 2,
          y: t.y + t.h / 2,
          sub: hasGym
            ? `Arène #${gIdx + 1} : ${leader.name} (${TYPE_FR[leader.type] || leader.type}) · ${gotBadge ? badge.name + ' obtenu ✓' : `Limite av. Arène : N.${capLvl}`}`
            : t.id === 'plateau'
              ? 'Siège du Conseil des 4 et du Maître de la Ligue'
              : 'Ville visitée · Centre Pokémon disponible',
          tag: hasGym ? (gotBadge ? 'BADGE OBTENU ✓' : `ARÈNE #${gIdx + 1} (CAP N.${capLvl})`) : t.id === 'plateau' ? 'LIGUE POKÉMON' : 'VILLE VISITÉE',
          tagCls: hasGym ? (gotBadge ? 'badge-ok' : 'gym') : 'town',
        };
      })
    );

    s.innerHTML = `
      <div class="scr-bar">
        <div class="scr-bar-left">
          <img class="scr-bar-ico" src="img/hud/map.png" alt="">
          <span class="scr-bar-title">CARTE DE LA RÉGION D'ODYSSÉE</span>
          <span class="scr-bar-sub">${visited.size} / ${allTowns.length} VILLES</span>
        </div>
        <div class="scr-bar-right">
          <span class="scr-cap-badge">NIV. MAX ACTUEL : <b>N.${game.levelCap ? game.levelCap() : levelCap(st.badges)}</b></span>
          <button type="button" class="scr-close-btn" data-act="close">FERMER ✕</button>
        </div>
      </div>
      <div class="map-stage">
        <div class="map-wrap" style="aspect-ratio:${W.w} / ${W.h}">
          <canvas class="mapcv" width="${W.w * 2}" height="${W.h * 2}"></canvas>
          <div class="map-labels"></div>
          <div class="map-corner tl"></div><div class="map-corner tr"></div>
          <div class="map-corner bl"></div><div class="map-corner br"></div>
        </div>
      </div>
      <div class="map-footer">
        <button type="button" class="map-nav-btn" data-act="prev" title="Lieu précédent (◀)">◀</button>
        <div class="map-info">
          <div class="map-info-top">
            <span class="map-where"></span>
            <span class="map-tag"></span>
          </div>
          <div class="map-sub"></div>
        </div>
        <button type="button" class="map-nav-btn" data-act="next" title="Lieu suivant (▶)">▶</button>
        <div class="map-legend">
          <span><i class="lg-dot me"></i> Vous</span>
          <span><i class="lg-dot town"></i> Ville</span>
          <span><i class="lg-dot gym"></i> Arène</span>
        </div>
      </div>`;

    const c = s.querySelector('.mapcv');
    const lab = s.querySelector('.map-labels');
    const whereEl = s.querySelector('.map-where');
    const tagEl = s.querySelector('.map-tag');
    const subEl = s.querySelector('.map-sub');

    // la carte est cadrée sur ce qu'on a exploré : elle se dézoome à mesure qu'on découvre la région
    // (à l'ouverture, elle part du cadre de la dernière fois et s'élargit jusqu'au nouveau)
    const target = exploredView(game), from = st.mapView && st.mapView.w ? st.mapView : target;
    let view = { ...from };
    const fit = () => { const r = c.getBoundingClientRect(); const w = Math.max(320, Math.round(r.width * (window.devicePixelRatio || 1))); if (c.width !== w) { c.width = w; c.height = Math.round(w * W.h / W.w); } };
    const place = (node, x, y) => { node.style.left = ((x - view.x) / view.w * 100) + '%'; node.style.top = ((y - view.y) / view.h * 100) + '%'; };
    const pinsAt = [];
    const draw = () => { fit(); drawRegion(game, c, view); for (const [node, x, y] of pinsAt) place(node, x, y); };
    draw();
    Object.values(loadCarteIcons()).forEach((im) => { if (!im.complete) im.onload = draw; });
    if (Math.abs(from.w - target.w) > 0.5 || Math.abs(from.x - target.x) > 0.5 || Math.abs(from.y - target.y) > 0.5) {
      const t0 = performance.now(), D = 1100;
      const anim = () => {
        if (!s.isConnected) return;
        const u = Math.min(1, (performance.now() - t0) / D), e = 1 - Math.pow(1 - u, 3);
        for (const k of ['x', 'y', 'w', 'h']) view[k] = from[k] + (target[k] - from[k]) * e;
        draw();
        if (u < 1) requestAnimationFrame(anim);
      };
      setTimeout(() => requestAnimationFrame(anim), 250);
    }
    st.mapView = target;

    const me = el('div', 'map-me');
    pinsAt.push([me, p.x, p.y]); place(me, p.x, p.y);
    lab.appendChild(me);

    // Interactive town pins on the map
    spots.forEach((sp, idx) => {
      if (idx === 0) return;
      const pin = el('button', 'map-pin ' + (sp.tagCls || ''));
      pin.type = 'button';
      pinsAt.push([pin, sp.x, sp.y]); place(pin, sp.x, sp.y);
      pin.title = sp.name;
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        k = idx;
        ui.sound.sfx('blip');
        show();
      });
      lab.appendChild(pin);
    });

    const cur = el('div', 'map-cur');
    lab.appendChild(cur);
    const curAt = [cur, p.x, p.y]; pinsAt.push(curAt);

    let k = 0;
    const show = () => {
      const q = spots[k];
      curAt[1] = q.x; curAt[2] = q.y; place(cur, q.x, q.y);
      whereEl.textContent = q.name;
      tagEl.textContent = q.tag || '';
      tagEl.className = 'map-tag ' + (q.tagCls || '');
      subEl.textContent = q.sub || '';
    };
    show();

    const close = () => { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); };
    s.querySelector('[data-act="close"]')?.addEventListener('click', close);
    s.querySelector('[data-act="prev"]')?.addEventListener('click', () => {
      k = (k + spots.length - 1) % spots.length;
      ui.sound.sfx('blip');
      show();
    });
    s.querySelector('[data-act="next"]')?.addEventListener('click', () => {
      k = (k + 1) % spots.length;
      ui.sound.sfx('blip');
      show();
    });

    const pop = ui.input.push((key) => {
      if (key === 'left' || key === 'up') { k = (k + spots.length - 1) % spots.length; ui.sound.sfx('blip'); show(); return; }
      if (key === 'right' || key === 'down') { k = (k + 1) % spots.length; ui.sound.sfx('blip'); show(); return; }
      if (key === 'a' || key === 'b' || key === 'map') close();
    });
  });
}

/* ================= CARTE DE DRESSEUR ================= */
/** fiche d'un dresseur (la sienne, ou celle d'un autre joueur reçue par le réseau : voir trainerCard) */
export function trainerCard(st) {
  return { name: st.name, id: st.id, gender: st.gender, money: st.money, dex: st.dex.caught.length, seen: st.dex.seen.length, time: st.time, badges: st.badges.map(Boolean),
    team: st.party.map((m) => ({ sp: m.sp, lvl: m.lvl, shiny: !!m.shiny, nick: m.nick || null })), champion: !!st.flags?.champion };
}
export function cardScreen(game, BADGES, other) {
  const ui = game.ui, c = other || trainerCard(game.state);
  return new Promise((resolve) => {
    const s = screen(ui, 'card-scr');
    const h = Math.floor((c.time || 0) / 3600), m = Math.floor((c.time || 0) / 60) % 60;
    const team = (c.team || []).slice(0, 6).map((q) => `<div class="tc-mon" title="${esc(q.nick || SPECIES[q.sp]?.n || '?')}"><img src="${ASSETS.icon(q.sp)}" alt=""><span>N.${q.lvl}</span></div>`).join('');
    s.innerHTML = `<div class="tcard box"><div class="tc-top"><span>${other ? 'CARTE DE ' + esc(String(c.name).toUpperCase()) : 'CARTE DRESSEUR'}</span><span>ID ${String(c.id || 0).padStart(5, '0')}</span></div><div class="tc-body"><table class="kv"><tr><td>Nom</td><td>${esc(c.name)}${c.champion ? ' ★' : ''}</td></tr>${other ? '' : `<tr><td>Argent</td><td>${(c.money || 0).toLocaleString('fr-FR')} ₽</td></tr>`}<tr><td>Pokédex</td><td>${c.dex}${c.seen != null ? ` (vus : ${c.seen})` : ''}</td></tr><tr><td>Temps de jeu</td><td>${h}:${String(m).padStart(2, '0')}</td></tr></table><div class="tc-photo"><div class="tc-char ${c.gender === 'f' ? 'f' : 'm'}"></div></div></div><div class="badges">${BADGES.map((b, k) => `<div class="badge ${c.badges?.[k] ? 'got' : ''}" style="--bc:${b.color}" title="${esc(b.name)}"><i></i></div>`).join('')}</div>${team ? `<div class="tc-team">${team}</div>` : ''}</div>`;
    const pop = ui.input.push((k) => { if (k === 'a' || k === 'b') { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); } });
  });
}

/* ================= BOUTIQUE ================= */
export async function shopScreen(game, stock) {
  const ui = game.ui, st = game.state;
  for (;;) {
    const r = await ui.ask('Bonjour ! Que puis-je faire pour toi ?', ['Acheter', 'Vendre', 'Au revoir'], { keep: true, speaker: 'Vendeur' });
    if (r === 1) {
      const sellable = Object.keys(st.bag).filter((k) => st.bag[k] > 0 && ITEMS[k] && !ITEMS[k].key && ITEMS[k].price > 0);
      if (!sellable.length) { await ui.say('Tu n\'as rien à vendre.', { keep: true }); continue; }
      const k = await ui.list({ title: 'Vendre', items: sellable.map((it) => ({ label: itemName(it), right: `× ${st.bag[it]}` })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: sellable.length });
      if (k < 0 || k >= sellable.length) continue;
      const it = sellable[k], price = Math.floor(ITEMS[it].price / 2);
      const q = await ui.quantity(st.bag[it], { price });
      if (!q) continue;
      if (await ui.yesNo(`Je peux t'en donner ${(q * price).toLocaleString('fr-FR')} ₽. D'accord ?`, { keep: true })) { st.bag[it] -= q; if (st.bag[it] <= 0) delete st.bag[it]; st.money += q * price; ui.sound.sfx('buy'); }
      continue;
    }
    if (r !== 0) break;
    const money = el('div', 'box money'); ui.root.appendChild(money);
    for (;;) {
      money.innerHTML = `Argent<br><b>${st.money.toLocaleString('fr-FR')} ₽</b>`;
      const k = await ui.list({ title: 'Acheter', items: stock.map((it) => ({ html: `<img class="itm" src="${ASSETS.item(it)}" alt="">${esc(itemName(it))}`, right: `${ITEMS[it].price.toLocaleString('fr-FR')} ₽` })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: stock.length, start: game._shopIdx || 0, onMove: (i) => { game._shopIdx = i; } });
      if (k < 0 || k >= stock.length) break;
      const it = stock[k], price = ITEMS[it].price, max = Math.min(99, Math.floor(st.money / price));
      if (max < 1) { await ui.say('Tu n\'as pas assez d\'argent.', { keep: true }); continue; }
      const q = await ui.quantity(max, { price });
      if (!q) continue;
      if (!(await ui.yesNo(`${itemName(it)} × ${q}, ça fera ${(q * price).toLocaleString('fr-FR')} ₽. D'accord ?`, { keep: true }))) continue;
      st.money -= q * price; st.bag[it] = (st.bag[it] || 0) + q; ui.sound.sfx('buy');
      money.innerHTML = `Argent<br><b>${st.money.toLocaleString('fr-FR')} ₽</b>`;
      if (q >= 10 && it === 'poke-ball') { st.bag['poke-ball']++; await ui.say('Voici une Poké Ball en cadeau pour ton achat !', { keep: true }); }
      else await ui.say('Et voilà ! Merci !', { keep: true });
    }
    money.remove();
  }
  await ui.say('Reviens quand tu veux !');
}

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
        <img class="pc-prev-spr${m.shadow ? ' shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny)}" alt="" onerror="this.src='${ASSETS.icon(m.sp)}'">
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

    const closePC = () => {
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
      pop(); s.remove(); ui.sound.sfx('pc'); game.save(true); resolve();
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
    const close = (chosen) => { pop(); s.remove(); resolve(chosen); };

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
                  <div class="rr-desc">${esc(M.d || 'Une attaque puissante qui inflige des dégâts à l\'ennemi.')}</div>
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
      ['Retour', ''],
    ];
    const draw = () => { box.innerHTML = rows().map(([a, b], k) => `<div class="list-row ${k === i ? 'on' : ''}"><span class="cur">▶</span><span class="lbl">${a}</span><span class="rgt">${b ? '◀ ' + b + ' ▶' : ''}</span></div>`).join('') + '<div class="keys"><b>Commandes</b><br>Flèches ou ZQSD : se déplacer · Espace / Entrée : valider, parler<br>Échap : annuler, menu · Maj : sprint · R : basculer course rapide/turbo · C : carte</div>'; };
    draw();
    const pop = ui.input.push((k) => {
      const nRows = 5;
      if (k === 'up') i = (i + nRows - 1) % nRows; else if (k === 'down') i = (i + 1) % nRows;
      else if (k === 'left' || k === 'right' || (k === 'a' && (i === 1 || i === 3))) {
        const d = k === 'left' ? -1 : 1;
        if (i === 0) { ui.textSpeed = (ui.textSpeed + d + 4) % 4; try { localStorage.setItem('odyssee-textspeed', ui.textSpeed); } catch (e) {} }
        if (i === 1) {
          game.runSpeed = ((game.runSpeed ?? 1) + d + 3) % 3;
          try { localStorage.setItem('odyssee-runspeed', game.runSpeed); } catch (e) {}
          game.hud?.update(true);
          game.ui.updateRunKeyHint?.(game.autoRun, game.runSpeed);
        }
        if (i === 2) snd.setVolume(Math.max(0, Math.min(1, Math.round(snd.vol * 10 + d) / 10)));
        if (i === 3) { game.followOff = !game.followOff; try { localStorage.setItem('odyssee-suiveur', game.followOff ? '0' : '1'); } catch (e) {} }
      } else if (k === 'b' || (k === 'a' && i === 4)) { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); return; }
      else return;
      ui.sound.sfx('blip'); draw();
    });
  });
}
export { canUseOn };

/* ================= CODE DE SAUVEGARDE ================= */
/** Affiche le code de la partie, à copier pour la reprendre sur un autre appareil. */
export function saveCodeScreen(ui, code, summary) {
  return new Promise((resolve) => {
    const s = screen(ui, 'code-scr', 'CODE DE SAUVEGARDE');
    const box = el('div', 'box code-box');
    box.innerHTML = `<div class="code-sum">${esc(summary)}</div>
      <p>Copie ce code puis, sur l'autre appareil, choisis <b>Charger un code</b> sur l'écran titre. Ta partie y reprend là où tu l'as sauvegardée.</p>
      <textarea class="code-ta" readonly spellcheck="false"></textarea>
      <div class="code-row"><button class="code-btn" data-k="copy">Copier le code</button><button class="code-btn ghost" data-k="close">Fermer</button></div>
      <div class="code-msg"></div>`;
    s.appendChild(box);
    const ta = box.querySelector('textarea'), msg = box.querySelector('.code-msg');
    ta.value = code;
    const copy = async () => {
      ta.focus(); ta.select();
      let ok = false;
      try { await navigator.clipboard.writeText(code); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
      msg.textContent = ok ? 'Code copié !' : 'Le code est sélectionné : copie-le avec Ctrl+C (⌘+C sur Mac).';
      ui.sound.sfx(ok ? 'select' : 'blip');
    };
    const close = () => { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); };
    box.querySelector('[data-k=copy]').onclick = copy;
    box.querySelector('[data-k=close]').onclick = close;
    const pop = ui.input.push((k) => { if (k === 'b') close(); else if (k === 'a') copy(); });
    setTimeout(() => { ta.focus(); ta.select(); }, 30);
  });
}

/** Demande un code collé ; renvoie le texte, ou null si on annule. */
export function loadCodeScreen(ui, check) {
  return new Promise((resolve) => {
    const s = screen(ui, 'code-scr', 'CHARGER UN CODE');
    const box = el('div', 'box code-box');
    box.innerHTML = `<p>Sur ton autre appareil : menu (Échap) → <b>CODE</b>, copie le code, puis colle-le ici.</p>
      <textarea class="code-ta" spellcheck="false" placeholder="ODY1.…"></textarea>
      <div class="code-row"><button class="code-btn" data-k="ok">Charger cette partie</button><button class="code-btn ghost" data-k="close">Annuler</button></div>
      <div class="code-msg err"></div>`;
    s.appendChild(box);
    const ta = box.querySelector('textarea'), msg = box.querySelector('.code-msg');
    let busy = false;
    const done = (v) => { pop(); s.remove(); resolve(v); };
    const ok = async () => {
      if (busy) return; busy = true; msg.textContent = 'Vérification…';
      const r = await check(ta.value);
      busy = false;
      if (r.error) { msg.textContent = r.error; ui.sound.sfx('bump'); ta.focus(); return; }
      ui.sound.sfx('select'); done(r);
    };
    box.querySelector('[data-k=ok]').onclick = ok;
    box.querySelector('[data-k=close]').onclick = () => { ui.sound.sfx('cancel'); done(null); };
    // Échap ferme ; Entrée dans la zone de texte valide (Maj+Entrée pour aller à la ligne)
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); ui.sound.sfx('cancel'); done(null); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ok(); }
      e.stopPropagation();
    });
    const pop = ui.input.push((k) => { if (k === 'b') { ui.sound.sfx('cancel'); done(null); } });
    setTimeout(() => ta.focus(), 30);
  });
}

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
    const close = () => { pop(); s.remove(); ui.sound.sfx('cancel'); resolve(); };
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
