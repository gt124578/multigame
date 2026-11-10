// odyssee/js/ui/trophiesView.js — Écran Journal des Trophées & Boîte à Médailles (Style 5G B2W2)
import { el, esc } from './ui.js';
import {
  TROPHIES_CATALOG,
  STREAK_RANKS,
  getStreakRank,
  ensurePvpState,
  claimTrophyReward,
  getPvpSummary,
  getHeadToHeadStatus,
  checkAllTrophies
} from '../core/trophies.js';
import { itemName } from '../core/items.js';

function screen(ui, cls) {
  const s = el('div', 'screen ' + cls);
  ui.root.appendChild(s);
  return s;
}

function timeAgo(ts) {
  if (!ts) return 'Récemment';
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'À l\'instant';
  if (min < 60) return `Il y a ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
}

const CUSTOM_MEDAL_ICONS = {
  dex_route_1: 'img/trophies/medal_route_scout_64.png',
  dex_route_5: 'img/trophies/medal_route_hunter_64.png',
  dex_route_all: 'img/trophies/medal_habitat_master_64.png',
  dex_caught_200: 'img/trophies/medal_pokedex_master_64.png'
};

export function getTrophyIconSrc(trophy) {
  if (trophy?.id && CUSTOM_MEDAL_ICONS[trophy.id]) return CUSTOM_MEDAL_ICONS[trophy.id];
  return `img/trophies/medal_${trophy?.tier || 'bronze'}_64.png`;
}

/**
 * Affiche une bannière toast façon Pokémon Noir 2 / Blanc 2 lors du déblocage d'une médaille.
 */
export function showTrophyToast(game, trophy) {
  if (!game?.ui?.root || !trophy) return;
  const t = el('div', 'trophy-toast box');
  const iconSrc = getTrophyIconSrc(trophy);
  t.innerHTML = `
    <div class="trophy-toast-icon">
      <img src="${iconSrc}" alt="" class="medal-pixel" onerror="this.src='img/trophies/box_120.png'">
    </div>
    <div class="trophy-toast-content">
      <div class="trophy-toast-tag">★ NOUVELLE MÉDAILLE DÉBLOQUÉE !</div>
      <div class="trophy-toast-title">${esc(trophy.title)}</div>
      <div class="trophy-toast-sub">${esc(trophy.reward?.label ? 'Récompense disponible : ' + trophy.reward.label : trophy.desc)}</div>
    </div>
  `;
  game.ui.root.appendChild(t);
  try { game.sound?.sfx('badge'); } catch (e) {}

  setTimeout(() => {
    t.classList.add('trophy-toast-leave');
    setTimeout(() => t.remove(), 400);
  }, 3600);
}

const CAT_INFOS = {
  combat: { label: 'Duel PvP', icon: '⚔️', cls: 'cat-pvp' },
  reseau: { label: 'Réseau PvP', icon: '🌐', cls: 'cat-pvp' },
  rival: { label: 'Rival PvP', icon: '🔥', cls: 'cat-pvp' },
  streak: { label: 'Série PvP', icon: '👑', cls: 'cat-pvp' },
  aventure: { label: 'Aventure', icon: '🗺️', cls: 'cat-aventure' },
  pokedex: { label: 'Pokédex', icon: '📖', cls: 'cat-pokedex' },
  entrainement: { label: 'Entraînement', icon: '⚡', cls: 'cat-entrainement' },
  exploration: { label: 'Exploration', icon: '🧭', cls: 'cat-exploration' },
  domaine: { label: 'Domaine', icon: '🏰', cls: 'cat-domaine' }
};

/**
 * Affiche l'écran complet du Journal des Trophées et Médailles B2W2.
 */
export function trophiesScreen(game) {
  const ui = game.ui;
  const st = game.state;
  ensurePvpState(st);
  checkAllTrophies(st);

  return new Promise((resolve) => {
    const s = screen(ui, 'trophies-scr');
    let tab = 'medals'; // 'medals' | 'history' | 'streaks'
    let medalFilter = 'all'; // 'all' | 'unlocked' | 'claimable' | 'bronze' | 'silver' | 'gold' | 'platinum'
    let catFilter = 'all'; // 'all' | 'pvp' | 'aventure' | 'pokedex' | 'entrainement' | 'exploration' | 'domaine'
    let selIdx = 0;
    let currentTrophies = [];
    let currentFiltered = [];

    const render = () => {
      checkAllTrophies(st);
      const summary = getPvpSummary(st);
      const trophies = TROPHIES_CATALOG.map((t) => {
        const u = st.pvp.trophies[t.id] || {};
        const p = t.check(st);
        return {
          ...t,
          unlocked: !!u.unlocked,
          claimed: !!u.claimed,
          current: p.current,
          max: p.max,
          done: p.done
        };
      });

      // Filtrage des trophées
      const filteredTrophies = trophies.filter((t) => {
        if (catFilter !== 'all') {
          if (catFilter === 'pvp') {
            if (!['combat', 'reseau', 'rival', 'streak'].includes(t.category)) return false;
          } else if (t.category !== catFilter) {
            return false;
          }
        }
        if (medalFilter === 'unlocked') return t.unlocked;
        if (medalFilter === 'claimable') return t.unlocked && !t.claimed;
        if (medalFilter === 'bronze') return t.tier === 'bronze';
        if (medalFilter === 'silver') return t.tier === 'silver';
        if (medalFilter === 'gold') return t.tier === 'gold';
        if (medalFilter === 'platinum') return t.tier === 'platinum';
        return true;
      });

      currentTrophies = trophies;
      currentFiltered = filteredTrophies;

      s.innerHTML = `
        <div class="scr-bar">
          <div class="scr-bar-left">
            <img class="scr-bar-ico medal-box-ico" src="img/trophies/box_120.png" alt="Boîte à Médailles">
            <span class="scr-bar-title">TROPHÉES</span>
            <span class="scr-bar-sub">${summary.unlockedCount} / ${summary.trophiesTotal} Médailles · Série : ${summary.currentStreak} (Record : ${summary.bestStreak})</span>
          </div>
          <div class="trophies-tabs">
            <button type="button" class="ttab${tab === 'medals' ? ' on' : ''}" data-tab="medals">
              🏅 MÉDAILLES (${summary.unlockedCount}/${summary.trophiesTotal})
              ${summary.claimableCount > 0 ? `<span class="badge-notify">${summary.claimableCount}</span>` : ''}
            </button>
            <button type="button" class="ttab${tab === 'history' ? ' on' : ''}" data-tab="history">
              ⚔️ FACE-À-FACE (${summary.playersCount})
            </button>
            <button type="button" class="ttab${tab === 'streaks' ? ' on' : ''}" data-tab="streaks">
              👑 SÉRIES & RECORDS
            </button>
          </div>
          <div class="scr-bar-right">
            <button class="scr-close-btn scr-btn-close" type="button" data-act="close" title="Fermer (Échap ou T)">FERMER ✕</button>
          </div>
        </div>

        <div class="trophies-body">
          ${tab === 'medals' ? renderMedalsTab(filteredTrophies, trophies, summary, medalFilter, catFilter) : ''}
          ${tab === 'history' ? renderHistoryTab(summary, game) : ''}
          ${tab === 'streaks' ? renderStreaksTab(summary) : ''}
        </div>

        <div class="trophies-foot">
          <div class="trophies-foot-keys">
            <span><kbd>▲</kbd><kbd>▼</kbd> Naviguer</span>
            <span><kbd>◄</kbd><kbd>►</kbd> Changer d'onglet</span>
            <span><kbd>ESPACE</kbd> / <kbd>ENTRÉE</kbd> Réclamer la récompense</span>
            <span><kbd>ÉCHAP</kbd> / <kbd>T</kbd> Quitter</span>
          </div>
        </div>
      `;

      // Brancher les événements souris et tactiles
      s.querySelectorAll('.ttab').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          tab = b.dataset.tab;
          selIdx = 0;
          try { ui.sound?.sfx('blip'); } catch (err) {}
          render();
        });
      });

      s.querySelectorAll('.tfilter-cat-btn').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          catFilter = b.dataset.cat;
          selIdx = 0;
          try { ui.sound?.sfx('blip'); } catch (err) {}
          render();
        });
      });

      s.querySelectorAll('.tfilter-btn').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          medalFilter = b.dataset.filter;
          selIdx = 0;
          try { ui.sound?.sfx('blip'); } catch (err) {}
          render();
        });
      });

      s.querySelectorAll('[data-act="claim"]').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const tid = b.dataset.id;
          handleClaim(tid);
        });
      });

      s.querySelectorAll('.tmedal-card.claimable').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          const tid = card.querySelector('[data-act="claim"]')?.dataset.id;
          if (tid) handleClaim(tid);
        });
      });

      s.querySelectorAll('.tpvp-spec-btn').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const { rid, host, p0, p1 } = b.dataset;
          close();
          game.spectateDuel?.(host, rid, p0, p1);
        });
      });

      s.querySelectorAll('[data-act="close"]').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          close();
        });
      });
    };

    const handleClaim = (trophyId) => {
      const res = claimTrophyReward(st, trophyId);
      if (res.ok) {
        try { game.sound?.sfx('item'); } catch (e) {}
        game.save(true);
        ui.toast(`Récompense obtenue : ${res.label} ajoutée au Sac !`, 2000);
        game.hud?.update(true);
        render();
      } else {
        ui.toast(res.message || 'Impossible de réclamer.', 1500);
      }
    };

    const close = () => {
      pop();
      s.remove();
      try { ui.sound?.sfx('cancel'); } catch (e) {}
      resolve();
    };

    const pop = ui.input.push((k) => {
      if (k === 'left') {
        tab = tab === 'streaks' ? 'history' : tab === 'history' ? 'medals' : 'streaks';
        selIdx = 0;
        ui.sound?.sfx('blip');
        render();
      } else if (k === 'right') {
        tab = tab === 'medals' ? 'history' : tab === 'history' ? 'streaks' : 'medals';
        selIdx = 0;
        ui.sound?.sfx('blip');
        render();
      } else if (k === 'a' || k === 'space') {
        if (tab === 'medals') {
          const claimable = currentFiltered.find((t) => t.unlocked && !t.claimed) ||
                            currentTrophies.find((t) => t.unlocked && !t.claimed);
          if (claimable) {
            handleClaim(claimable.id);
            return;
          }
        }
      } else if (k === 'b' || k === 'menu' || k === 'trophies') {
        close();
      }
    });

    render();
  });
}

function renderMedalsTab(filteredTrophies, allTrophies, summary, medalFilter, catFilter) {
  const TIER_COLORS = {
    bronze: '#d48842',
    silver: '#cad2df',
    gold: '#fcd34d',
    platinum: '#67e8f9'
  };

  const TIER_LABELS = {
    bronze: 'BRONZE',
    silver: 'ARGENT',
    gold: 'OR',
    platinum: 'PLATINE'
  };

  const catPool = allTrophies.filter((t) => {
    if (catFilter === 'all') return true;
    if (catFilter === 'pvp') return ['combat', 'reseau', 'rival', 'streak'].includes(t.category);
    return t.category === catFilter;
  });

  const catTotal = catPool.length;
  const catClaimable = catPool.filter((t) => t.unlocked && !t.claimed).length;
  const catUnlocked = catPool.filter((t) => t.unlocked).length;
  const catBronze = catPool.filter((t) => t.tier === 'bronze').length;
  const catSilver = catPool.filter((t) => t.tier === 'silver').length;
  const catGold = catPool.filter((t) => t.tier === 'gold').length;
  const catPlat = catPool.filter((t) => t.tier === 'platinum').length;

  const countCat = (catKey) => {
    if (catKey === 'all') return allTrophies.length;
    if (catKey === 'pvp') return allTrophies.filter((t) => ['combat', 'reseau', 'rival', 'streak'].includes(t.category)).length;
    return allTrophies.filter((t) => t.category === catKey).length;
  };

  return `
    <div class="tmedals-container">
      <div class="tfilter-bar">
        <!-- Ligne 1 : Catégories thématiques B2W2 -->
        <div class="tfilter-row tfilter-cat-row">
          <button type="button" class="tfilter-cat-btn${catFilter === 'all' ? ' on' : ''}" data-cat="all">Toutes (${countCat('all')})</button>
          <button type="button" class="tfilter-cat-btn${catFilter === 'pvp' ? ' on' : ''}" data-cat="pvp">⚔️ PvP (${countCat('pvp')})</button>
          <button type="button" class="tfilter-cat-btn${catFilter === 'aventure' ? ' on' : ''}" data-cat="aventure">🗺️ Aventure (${countCat('aventure')})</button>
          <button type="button" class="tfilter-cat-btn${catFilter === 'pokedex' ? ' on' : ''}" data-cat="pokedex">📖 Pokédex (${countCat('pokedex')})</button>
          <button type="button" class="tfilter-cat-btn${catFilter === 'entrainement' ? ' on' : ''}" data-cat="entrainement">⚡ Entraînement (${countCat('entrainement')})</button>
          <button type="button" class="tfilter-cat-btn${catFilter === 'exploration' ? ' on' : ''}" data-cat="exploration">🧭 Exploration (${countCat('exploration')})</button>
          <button type="button" class="tfilter-cat-btn${catFilter === 'domaine' ? ' on' : ''}" data-cat="domaine">🏰 Domaine (${countCat('domaine')})</button>
        </div>

        <!-- Ligne 2 : Filtres de statut et de palier -->
        <div class="tfilter-row tfilter-tier-row">
          <button type="button" class="tfilter-btn${medalFilter === 'all' ? ' on' : ''}" data-filter="all">Tous rangs (${catTotal})</button>
          <button type="button" class="tfilter-btn${medalFilter === 'claimable' ? ' on' : ''}" data-filter="claimable">
            À Réclamer ${catClaimable > 0 ? `(${catClaimable})` : ''}
          </button>
          <button type="button" class="tfilter-btn${medalFilter === 'unlocked' ? ' on' : ''}" data-filter="unlocked">Débloquées (${catUnlocked})</button>
          <span class="tfilter-sep">|</span>
          <button type="button" class="tfilter-btn tier-bronze${medalFilter === 'bronze' ? ' on' : ''}" data-filter="bronze">Bronze (${catBronze})</button>
          <button type="button" class="tfilter-btn tier-silver${medalFilter === 'silver' ? ' on' : ''}" data-filter="silver">Argent (${catSilver})</button>
          <button type="button" class="tfilter-btn tier-gold${medalFilter === 'gold' ? ' on' : ''}" data-filter="gold">Or (${catGold})</button>
          <button type="button" class="tfilter-btn tier-platinum${medalFilter === 'platinum' ? ' on' : ''}" data-filter="platinum">Platine (${catPlat})</button>
        </div>
      </div>

      <div class="tmedals-grid">
        ${filteredTrophies.length ? filteredTrophies.map((t) => {
          const pct = Math.min(100, Math.round((t.current / t.max) * 100));
          const iconSrc = getTrophyIconSrc(t);
          const isDone = t.done || t.unlocked;
          const isClaimed = t.claimed;
          const isClaimable = isDone && !isClaimed;
          const cat = CAT_INFOS[t.category] || { label: 'Général', icon: '★', cls: 'cat-pvp' };

          return `
            <div class="tmedal-card ${t.tier}${isDone ? ' unlocked' : ' locked'}${isClaimable ? ' claimable' : ''}">
              <div class="tmedal-icon-col">
                <div class="tmedal-glow-wrap">
                  <img src="${iconSrc}" alt="${TIER_LABELS[t.tier]}" class="tmedal-img${isDone ? '' : ' grayscale'}">
                  ${!isDone ? '<div class="tmedal-lock">🔒</div>' : ''}
                </div>
                <span class="tmedal-tier-tag" style="background:${TIER_COLORS[t.tier]}">${TIER_LABELS[t.tier]}</span>
              </div>

              <div class="tmedal-info-col">
                <div class="tmedal-title-row">
                  <div class="tmedal-title-left">
                    <span class="tmedal-cat-tag ${cat.cls}">${cat.icon} ${cat.label}</span>
                    <span class="tmedal-title">${esc(t.title)}</span>
                  </div>
                  ${isClaimed ? '<span class="tmedal-claimed-badge">✔ Obtenu</span>' : isClaimable ? '<span class="tmedal-claimable-badge">★ Prêt !</span>' : ''}
                </div>
                <div class="tmedal-desc">${esc(t.desc)}</div>

                <div class="tmedal-progress-wrap">
                  <div class="tmedal-progress-bar">
                    <div class="tmedal-progress-fill" style="width: ${pct}%"></div>
                  </div>
                  <span class="tmedal-progress-text">${t.current} / ${t.max}</span>
                </div>

                <div class="tmedal-reward-row">
                  <div class="tmedal-reward-label">
                    <span class="reward-gift-ico">🎁</span>
                    <span>${esc(t.reward?.label || itemName(t.reward?.item))}</span>
                  </div>
                  ${isClaimable ? `
                    <button type="button" class="tbtn-claim animate-pulse" data-act="claim" data-id="${t.id}">RÉCLAMER</button>
                  ` : isClaimed ? `
                    <button type="button" class="tbtn-claimed" disabled>RÉCLAMÉ</button>
                  ` : `
                    <div class="tstatus-pending">${t.current}/${t.max}</div>
                  `}
                </div>
              </div>
            </div>
          `;
        }).join('') : '<div class="tempty-msg">Aucune médaille ne correspond à ce filtre.</div>'}
      </div>
    </div>
  `;
}

function renderHistoryTab(summary, game) {
  const activeDuels = game?.getActiveDuels ? game.getActiveDuels() : [];
  const players = summary.players || [];

  return `
    <div class="thistory-container">
      ${activeDuels.length ? `
        <div class="tpvp-live-duels box">
          <div class="tpvp-live-head">
            <span class="tpvp-live-badge"><span class="spec-dot">●</span> EN DIRECT</span>
            <span class="tpvp-live-title">COMBATS EN COURS DANS LA RÉGION (${activeDuels.length})</span>
          </div>
          <div class="tpvp-live-list">
            ${activeDuels.map((d) => `
              <div class="tpvp-live-item">
                <span class="tpvp-live-names">⚔️ <b>${esc(d.p0)}</b> <small>vs</small> <b>${esc(d.p1)}</b></span>
                <button type="button" class="tpvp-spec-btn" data-rid="${esc(d.rid)}" data-host="${esc(d.hostId)}" data-p0="${esc(d.p0)}" data-p1="${esc(d.p1)}">👁️ Regarder</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      <div class="tpvp-banner box">
        <div class="tpvp-stat-item">
          <span class="tpvp-stat-label">VICTOIRES</span>
          <span class="tpvp-stat-val win">${summary.totalWins}</span>
        </div>
        <div class="tpvp-stat-item">
          <span class="tpvp-stat-label">DÉFAITES</span>
          <span class="tpvp-stat-val lose">${summary.totalLosses}</span>
        </div>
        <div class="tpvp-stat-item">
          <span class="tpvp-stat-label">ÉGALITÉS</span>
          <span class="tpvp-stat-val tie">${summary.totalDraws}</span>
        </div>
        <div class="tpvp-stat-item">
          <span class="tpvp-stat-label">TOTAL MATCHS</span>
          <span class="tpvp-stat-val">${summary.totalMatches}</span>
        </div>
        <div class="tpvp-stat-item highlight">
          <span class="tpvp-stat-label">TAUX DE VICTOIRE</span>
          <span class="tpvp-stat-val rate">${summary.winRate}</span>
        </div>
        <div class="tpvp-stat-item highlight">
          <span class="tpvp-stat-label">SÉRIE EN COURS</span>
          <span class="tpvp-stat-val streak">🔥 ${summary.currentStreak}</span>
        </div>
      </div>

      <div class="thistory-head">
        <div class="thistory-title">HISTORIQUE PAR DRESSEUR AFFRONTÉ</div>
        <div class="thistory-sub">${players.length} dresseur${players.length > 1 ? 's' : ''} enregistré${players.length > 1 ? 's' : ''}</div>
      </div>

      <div class="thistory-list">
        ${players.length ? players.map((p) => {
          const tot = p.wins + p.losses + (p.draws || 0);
          const rate = tot > 0 ? ((p.wins / tot) * 100).toFixed(0) : '0';
          const h2h = getHeadToHeadStatus(p);

          return `
            <div class="th2h-card box">
              <div class="th2h-avatar-col">
                <div class="th2h-avatar-circle">
                  <span>${esc(p.name[0]?.toUpperCase() || '?')}</span>
                </div>
              </div>
              <div class="th2h-info-col">
                <div class="th2h-top-row">
                  <span class="th2h-name">${esc(p.name)}</span>
                  <span class="th2h-status-badge ${h2h.cls}">${esc(h2h.label)}</span>
                </div>
                <div class="th2h-desc">${esc(h2h.desc)}</div>
                <div class="th2h-meta-row">
                  <span class="th2h-record"><b>${p.wins}</b>V — <b>${p.losses}</b>D — <b>${p.draws || 0}</b>N</span>
                  <span class="th2h-ratio">Ratio : <b>${rate}%</b></span>
                  <span class="th2h-streak">Série vs joueur : <b>${p.streakAgainst || 0}</b></span>
                  <span class="th2h-time">${esc(timeAgo(p.lastDate))}</span>
                </div>
              </div>
            </div>
          `;
        }).join('') : `
          <div class="tempty-msg box">
            <div class="tempty-ico">⚔️</div>
            <div class="tempty-title">Aucun match PvP enregistré</div>
            <div class="tempty-sub">Défiez un autre dresseur dans le mode multijoueur pour enregistrer vos statistiques, vos bilans face-à-face et débloquer des trophées !</div>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderStreaksTab(summary) {
  const rank = summary.rank;

  return `
    <div class="tstreaks-container">
      <div class="tstreak-hero box">
        <div class="tstreak-hero-left">
          <img src="img/trophies/streak_crown_48.png" alt="" class="tstreak-crown-img medal-pixel">
          <div class="tstreak-hero-rank">
            <div class="tstreak-hero-tag">RANG DE PRÉSTIGE ACTUEL</div>
            <div class="tstreak-hero-title">${esc(rank.title)}</div>
            <div class="tstreak-hero-sub">${esc(rank.desc)}</div>
          </div>
        </div>
        <div class="tstreak-hero-stats">
          <div class="tstreak-box current">
            <span class="tstreak-box-lbl">SÉRIE ACTUELLE</span>
            <span class="tstreak-box-num">🔥 ${summary.currentStreak}</span>
            <span class="tstreak-box-sub">victoire${summary.currentStreak > 1 ? 's' : ''} d'affilée</span>
          </div>
          <div class="tstreak-box best">
            <span class="tstreak-box-lbl">RECORD HISTORIQUE</span>
            <span class="tstreak-box-num">👑 ${summary.bestStreak}</span>
            <span class="tstreak-box-sub">meilleure série jamais atteinte</span>
          </div>
        </div>
      </div>

      <div class="tranks-table-wrap box">
        <div class="tranks-title">RANGS DE SÉRIE</div>
        <div class="tranks-list">
          ${STREAK_RANKS.map((r) => {
            const isCurrent = rank.title === r.title;
            const reached = summary.bestStreak >= r.min;

            return `
              <div class="trank-row${isCurrent ? ' current-rank' : ''}${reached ? ' reached' : ''}">
                <div class="trank-min-col">
                  <span class="trank-min-badge">${r.min > 0 ? `${r.min}+ Victoires` : '0+'}</span>
                </div>
                <div class="trank-title-col">
                  <span class="trank-title-text">${esc(r.title)}</span>
                  <span class="trank-sub-text">${esc(r.desc)}</span>
                </div>
                <div class="trank-status-col">
                  ${isCurrent ? '<span class="trank-tag current">★ RANG ACTUEL</span>' : reached ? '<span class="trank-tag done">✔ ATTEINT</span>' : '<span class="trank-tag locked">À débloquer</span>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}
