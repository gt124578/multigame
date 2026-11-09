// odyssee/js/ui/hud.js — HUD en jeu (Mix A + C avec sprites pixel-art Nano Banana) :
// - À gauche : capsules DS biseautées (or pour le Pokémon de tête, argent/acier pour les suivants) avec grand sprite,
//   nom, statut, niveau, barre HP brillante et barre EXP.
// - En haut à droite : capsule Pokégear DS avec lieu actuel, pièce d'or + argent, trophée + badges, et 4 boutons illustrés.
import { el, esc } from './ui.js';
import { ASSETS } from '../assets.js';
import { monName, expProgress } from '../core/mon.js';
import { BADGES } from '../world/region.js';
import { hpCol, statusTag, partyScreen, summaryScreen, mapScreen, cardScreen, questsScreen, trophiesScreen, friendsScreen } from './screens.js';
import { getFriendsManager } from '../net/friends.js';
import { getPvpSummary } from '../core/trophies.js';
import { getTrackedQuest } from '../core/questsData.js';

const gender = (m) => (m.gender === 'm' ? '<span class="g m">♂</span>' : m.gender === 'f' ? '<span class="g f">♀</span>' : '');

export class Hud {
  constructor(game) {
    this.game = game;
    this.swapFrom = -1;
    this.collapsed = false;
    try { this.collapsed = localStorage.getItem('odyssee-hud-collapsed') === '1'; } catch (e) {}
    this._sig = '';

    this.root = el('div', 'hud' + (this.collapsed ? ' collapsed' : ''));
    this.partyEl = el('div', 'hud-party');
    this.gearEl = el('div', 'hud-gear');
    this.root.append(this.partyEl, this.gearEl);
    game.ui.root.appendChild(this.root);

    this.bindEvents();
  }

  toggle() {
    this.collapsed = !this.collapsed;
    this.swapFrom = -1;
    try { localStorage.setItem('odyssee-hud-collapsed', this.collapsed ? '1' : '0'); } catch (e) {}
    this.root.classList.toggle('collapsed', this.collapsed);
    this.game.sound.sfx('blip');
    this.update(true);
  }

  canInteract() {
    const g = this.game;
    return !!(g.state && !g.busy && g.input.free && !g.bv.alive && !g.player?.move);
  }

  bindEvents() {
    this.partyEl.addEventListener('click', async (e) => {
      const slot = e.target.closest('.hud-slot');
      if (!slot || !this.canInteract()) return;
      e.stopPropagation();
      const idx = +slot.dataset.idx;
      const party = this.game.state.party;
      if (Number.isNaN(idx) || idx < 0 || idx >= party.length) return;

      const isSwapBtn = !!e.target.closest('.hud-swap');
      if (isSwapBtn) {
        this.game.sound.sfx('blip');
        this.swapFrom = this.swapFrom === idx ? -1 : idx;
        this.update(true);
        return;
      }

      if (this.swapFrom >= 0) {
        if (this.swapFrom !== idx) {
          [party[this.swapFrom], party[idx]] = [party[idx], party[this.swapFrom]];
          this.game.sound.sfx('select');
          this.game.save(true);
        } else {
          this.game.sound.sfx('cancel');
        }
        this.swapFrom = -1;
        this.update(true);
        return;
      }

      this.game.busy = true;
      this.game.sound.sfx('select');
      try {
        await summaryScreen(this.game, party, idx);
      } finally {
        this.game.busy = false;
        this.update(true);
      }
    });

    this.partyEl.addEventListener('contextmenu', (e) => {
      const slot = e.target.closest('.hud-slot');
      if (!slot || !this.canInteract()) return;
      e.preventDefault();
      const idx = +slot.dataset.idx;
      this.game.sound.sfx('blip');
      this.swapFrom = this.swapFrom === idx ? -1 : idx;
      this.update(true);
    });

    this.gearEl.addEventListener('click', async (e) => {
      const toggleBtn = e.target.closest('[data-act="toggle"]');
      if (toggleBtn) {
        e.stopPropagation();
        this.toggle();
        return;
      }
      const runBtn = e.target.closest('[data-act="autorun"]');
      if (runBtn && this.game.state && !this.game.busy && !this.game.bv.alive) {
        e.stopPropagation();
        this.game.toggleAutoRun();
        return;
      }
      if (!this.canInteract()) return;
      const actEl = e.target.closest('[data-act]');
      if (!actEl) return;
      e.stopPropagation();
      const act = actEl.dataset.act;
      const g = this.game;

      if (act === 'card') {
        g.busy = true; g.sound.sfx('select');
        try { await cardScreen(g, BADGES); } finally { g.busy = false; this.update(true); }
      } else if (act === 'party') {
        if (!g.state.party.length) { g.sound.sfx('bump'); return; }
        g.busy = true; g.sound.sfx('select');
        try { await partyScreen(g, { mode: 'menu' }); } finally { g.busy = false; this.update(true); }
      } else if (act === 'bag') {
        g.busy = true; g.sound.sfx('select');
        try { await g.fieldBag(); } finally { g.busy = false; this.update(true); }
      } else if (act === 'map') {
        g.busy = true; g.sound.sfx('select');
        try { await mapScreen(g); } finally { g.busy = false; this.update(true); }
      } else if (act === 'quests') {
        g.busy = true; g.sound.sfx('select');
        try { await questsScreen(g); } finally { g.busy = false; this.update(true); }
      } else if (act === 'trophies') {
        g.busy = true; g.sound.sfx('select');
        try { await trophiesScreen(g); } finally { g.busy = false; this.update(true); }
      } else if (act === 'friends') {
        g.busy = true; g.sound.sfx('select');
        try { await friendsScreen(g); } finally { g.busy = false; this.update(true); }
      }
    });
  }

  update(force = false) {
    const g = this.game, st = g.state;
    if (!st || !g.mapObj) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = '';
    const loc = g.locationName();
    const tracked = getTrackedQuest(g);
    const bCount = g.badgeCount();
    const pvpSummary = getPvpSummary(st);
    const trUnlocked = pvpSummary?.unlockedCount ?? 0;
    const trTotal = pvpSummary?.trophiesTotal ?? 32;
    const friendsMgr = getFriendsManager(g);
    const onlineCount = friendsMgr.getOnlineCount();
    const badgesKey = st.badges.map((b) => (b ? '1' : '0')).join('');
    const partyKey = st.party
      .map((m) => `${m.uid}:${m.sp}:${m.nick || ''}:${m.lvl}:${m.hp}:${m.stats[0]}:${m.exp}:${m.status || ''}:${m.shadow ? 1 : 0}:${m.shiny ? 1 : 0}`)
      .join('|');
    const sig = `${this.collapsed ? 1 : 0};${g.autoRun ? 1 : 0}:${g.runSpeed ?? 1};${this.swapFrom};${loc};${st.money};${badgesKey};${trUnlocked};${st.trackedQuest || ''}:${tracked?.notes?.length || 0};${onlineCount};${partyKey}`;
    if (!force && sig === this._sig) return;
    this._sig = sig;

    this.root.classList.toggle('collapsed', this.collapsed);

    // 1. Capsules d'équipe à gauche (avec cadres pixel-art slot_lead.png / slot_normal.png et grands sprites)
    const leadIdx = st.party.findIndex((m) => m.hp > 0);
    if (!st.party.length) {
      this.partyEl.innerHTML = '';
    } else {
      this.partyEl.innerHTML = st.party
        .map((m, k) => {
          const isLead = k === (leadIdx >= 0 ? leadIdx : 0);
          const isKo = m.hp <= 0;
          const isSwap = k === this.swapFrom;
          const r = Math.max(0, Math.min(1, m.hp / m.stats[0]));
          const expPct = Math.max(0, Math.min(100, expProgress(m, g.levelCap()) * 100)).toFixed(1);
          const cls =
            'hud-slot' +
            (isLead ? ' lead' : '') +
            (isKo ? ' ko' : '') +
            (isSwap ? ' swap' : '');
          return `<div class="${cls}" data-idx="${k}" title="Clic : Résumé de ${esc(monName(m))} (${m.hp}/${m.stats[0]} PV) · Clic droit ou ⇅ : Réordonner">
            <div class="hud-spr-wrap">
              <img class="hud-ico${m.shadow ? ' shadowmon' : ''}" src="${ASSETS.front(m.sp, m.shiny, m.shadow)}" alt="" onerror="this.src='${ASSETS.icon(m.sp, m.shadow)}'">
            </div>
            <div class="hud-main">
              <div class="hud-top">
                <span class="hud-name">${esc(monName(m))}${gender(m)}</span>
                ${statusTag(m)}
                <span class="hud-lvl">N.${m.lvl}</span>
              </div>
              <div class="hud-hp">
                <b>PV</b>
                <i><u style="width:${(r * 100).toFixed(1)}%;background:${hpCol(r)}"></u></i>
              </div>
              <div class="hud-exp">
                <b>EXP</b>
                <i><u style="width:${expPct}%"></u></i>
              </div>
            </div>
            <button type="button" class="hud-swap" title="Échanger la place" tabindex="-1">⇅</button>
          </div>`;
        })
        .join('') + (this.swapFrom >= 0 ? `<div class="hud-swap-hint">Avec qui échanger ${esc(monName(st.party[this.swapFrom]))} ?</div>` : '');
    }

    // 2. Capsule Pokégear en haut à droite (avec icônes pixel-art coin.png, trophy.png, run.png, team.png, bag.png, map.png)
    const badgeDots = BADGES.map(
      (b, k) => `<i class="hud-bdot${st.badges[k] ? ' got' : ''}" style="--bc:${b.color}" title="${esc(b.name)}"></i>`
    ).join('');

    this.gearEl.innerHTML = `
      <div class="hud-gear-card">
        <div class="hud-loc-row">
          <span class="hud-loc" title="Lieu actuel">${esc(loc)}</span>
          ${onlineCount > 1 ? `<button type="button" class="hud-online-badge" data-act="friends" title="Autres dresseurs connectés · Amis (touche O)" tabindex="-1">
            <span class="hud-online-dot"></span>
            <span class="hud-online-cnt">${onlineCount - 1} en ligne</span>
          </button>` : ''}
          <button type="button" class="hud-toggle" data-act="toggle" title="${this.collapsed ? 'Afficher le HUD (Touche U)' : 'Cacher le HUD (Touche U)'}" tabindex="-1">${this.collapsed ? '▾ HUD' : '▴'}</button>
        </div>
        <div class="hud-stats" data-act="card" title="Cliquer pour ouvrir la Carte de Dresseur">
          <div class="hud-stat-item">
            <img class="hud-stat-ico" src="img/hud/coin.png" alt="">
            <span class="hud-money">${st.money.toLocaleString('fr-FR')} ₽</span>
          </div>
          <div class="hud-stat-item hud-cap-pill" title="Niveau max autorisé avant la prochaine Arène">
            <span>Niv. max ${g.levelCap()}</span>
          </div>
        </div>
        <div class="hud-bdots-row" data-act="card" title="Badges d'Arène">${badgeDots}</div>
        ${tracked ? `
          <div class="hud-quest-card" data-act="quests" title="Objectif suivi : cliquer pour ouvrir le Journal (Touche Q)">
            <div class="hud-qc-head">
              <span class="hud-qc-star">★ SUIVIE</span>
              <span class="hud-qc-loc">${esc(tracked.since || '')}</span>
            </div>
            <div class="hud-qc-name">${esc(tracked.name)}</div>
            <div class="hud-qc-step">${esc(tracked.note || '')}</div>
          </div>
        ` : ''}
      </div>
      <div class="hud-actions">
        <button type="button" class="hud-btn run${g.autoRun ? ' on' : ''}${g.autoRun && g.runSpeed === 2 ? ' turbo' : ''}" data-act="autorun" tabindex="-1" title="Course continue (Touche R)">
          <img src="img/hud/run.png" alt="" onerror="this.style.display='none'"><span>${!g.autoRun ? 'COURSE' : g.runSpeed === 2 ? 'TURBO 2.5×' : 'COURSE 1.7×'}</span>
        </button>
        <button type="button" class="hud-btn${st.party.length ? '' : ' off'}" data-act="party" tabindex="-1" title="Équipe">
          <img src="img/hud/team.png" alt=""><span>ÉQUIPE</span>
        </button>
        <button type="button" class="hud-btn" data-act="bag" tabindex="-1" title="Sac">
          <img src="img/hud/bag.png" alt=""><span>SAC</span>
        </button>
        <button type="button" class="hud-btn" data-act="map" tabindex="-1" title="Carte (Touche C)">
          <img src="img/hud/map.png" alt=""><span>CARTE</span>
        </button>
        <button type="button" class="hud-btn" data-act="quests" tabindex="-1" title="Journal des Quêtes (Touche Q)">
          <img src="img/hud/quest.png" alt="" onerror="this.src='img/items/notebook.png'"><span>QUÊTES</span>
        </button>
        <button type="button" class="hud-btn" data-act="trophies" tabindex="-1" title="Journal des Trophées & Médailles (Touche T)">
          <img src="img/hud/trophy.png" alt="" onerror="this.src='img/trophies/box_120.png'"><span>TROPHÉES</span>
        </button>
        <button type="button" class="hud-btn hud-friends-btn" data-act="friends" tabindex="-1" title="Amis (touche O)">
          <img src="img/hud/friends.png" alt="" onerror="this.src='img/hud/team.png'"><span>AMIS${onlineCount > 1 ? ` (${onlineCount - 1})` : ''}</span>
        </button>
      </div>
    `;
  }
}
