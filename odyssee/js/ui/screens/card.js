// odyssee/js/ui/screens/card.js — carte de dresseur
import { esc } from '../ui.js';
import { SPECIES } from '../../data/species.js';
import { ASSETS } from '../../assets.js';
import { TYPE_FR, TYPE_COL, hpCol, screen, closer } from './common.js';
import { pantheonScreen } from './hof.js';

/* ================= CARTE DE DRESSEUR FAÇON 5G (NOIR 2 / BLANC 2) ================= */
export const BADGE_SPECS = [
  { id: 1, name: 'Badge Élytre', type: 'bug', leader: 'Hector', town: 'Sylve', reward: 'Autorise Coupe hors combat', cap: 25 },
  { id: 2, name: 'Badge Écume', type: 'water', leader: 'Marine', town: 'Port-Azur', reward: 'Accès aux Navires & Mers', cap: 35 },
  { id: 3, name: 'Badge Volt', type: 'electric', leader: 'Volta', town: 'Électro-Ville', reward: 'Autorise Flash & Galeries', cap: 45 },
  { id: 4, name: 'Badge Pétale', type: 'grass', leader: 'Flora', town: 'Floralia', reward: 'Débloque les Échanges multijoueurs', cap: 55 },
  { id: 5, name: 'Badge Mirage', type: 'psychic', leader: 'Sibylle', town: 'Cité Mirage', reward: 'Dissipe les Brumes & Illusions', cap: 65 },
  { id: 6, name: 'Badge Granit', type: 'rock', leader: 'Basalte', town: 'Île Basalte', reward: 'Autorise Éclate-Roc hors combat', cap: 70 },
  { id: 7, name: 'Badge Braise', type: 'fire', leader: 'Pyros', town: 'Île Pyros', reward: 'Autorise Force hors combat', cap: 75 },
  { id: 8, name: 'Badge Écaille', type: 'dragon', leader: 'Drakos', town: 'Île Drakos', reward: 'Autorise Vol & Accès Ligue du Nord', cap: 80 },
  { id: 9, name: 'Badge Pavé', type: 'normal', leader: 'Margot', town: 'Métropole', reward: 'Accès VIP au Casino & Bourse', cap: 82 },
  { id: 10, name: 'Badge Rafale', type: 'flying', leader: 'Aurèle', town: 'Port-Lisière', reward: 'Courants aériens des Terres du Sud', cap: 85 },
  { id: 11, name: 'Badge Venin', type: 'poison', leader: 'Morgane', town: 'Marais-Noir', reward: 'Immunité aux bourbiers toxiques', cap: 88 },
  { id: 12, name: 'Badge Dune', type: 'ground', leader: 'Gaspard', town: 'Dunes d\'Ocre', reward: 'Traversée des tempêtes de sable', cap: 90 },
  { id: 13, name: 'Badge Rouage', type: 'steel', leader: 'Ferdinand', town: 'Forge-Acier', reward: 'Maîtrise métallurgique & blindages', cap: 92 },
  { id: 14, name: 'Badge Féérie', type: 'fairy', leader: 'Lilas', town: 'Rosebrume', reward: 'Passage du Sanctuaire Féerique', cap: 95 },
  { id: 15, name: 'Badge Ombre', type: 'dark', leader: 'Corbin', town: 'Ombreval', reward: 'Accès ultime à la Ligue du Sud', cap: 100 },
];

export function getCardRank(c) {
  let stars = 0;
  const badgesCount = (c.badges || []).filter(Boolean).length;
  if (c.champion) stars++;
  if (badgesCount >= 8) stars++;
  if (badgesCount >= 15) stars++;
  if ((c.dex || 0) >= 60) stars++;
  if ((c.trophies || 0) >= 10 || (c.pvpWins || 0) >= 10) stars++;

  let grade = 'NORMAL';
  let themeCls = 'card-normal';
  let title = 'Voyageur d\'Odyssée';

  if (stars >= 5) {
    grade = 'MAÎTRE';
    themeCls = 'card-master';
    title = 'Maître Suprême d\'Odyssée';
  } else if (stars === 4) {
    grade = 'PLATINE';
    themeCls = 'card-platinum';
    title = 'Légende Régionale';
  } else if (stars === 3) {
    grade = 'OR';
    themeCls = 'card-gold';
    title = 'Champion Émérite';
  } else if (stars === 2) {
    grade = 'ARGENT';
    themeCls = 'card-silver';
    title = 'Dresseur d\'Élite';
  } else if (stars === 1) {
    grade = 'BRONZE';
    themeCls = 'card-bronze';
    title = 'Étoile Montante';
  }

  return { stars, grade, themeCls, title, badgesCount };
}

/** Fiche d'un dresseur (la sienne, ou reçue par le réseau) */
export function trainerCard(st) {
  const pvp = st.pvp || {};
  const unlockedTrophies = Object.values(pvp.trophies || {}).filter((t) => t.unlocked).length;
  return {
    name: st.name,
    id: st.id,
    gender: st.gender,
    money: st.money,
    dex: st.dex?.caught?.length || 0,
    seen: st.dex?.seen?.length || 0,
    time: st.time || 0,
    badges: (st.badges || []).map(Boolean),
    team: (st.party || []).map((m) => ({
      sp: m.sp,
      lvl: m.lvl,
      shiny: !!m.shiny,
      nick: m.nick || null,
      hp: m.hp,
      maxHp: m.stats?.[0] || m.hp,
      ball: m.ball || 'poke-ball',
    })),
    champion: !!st.flags?.champion,
    trophies: unlockedTrophies,
    pvpWins: pvp.totalWins || 0,
    pvpLosses: pvp.totalLosses || 0,
    hof: (st.hof || []).slice(),
  };
}

export function cardScreen(game, BADGES, other) {
  const ui = game.ui, c = other || trainerCard(game.state);
  return new Promise((resolve) => {
    const s = screen(ui, 'card-scr');
    s.classList.add('b2w2-screen');

    let face = 'profile'; // 'profile' | 'badges'
    let selBadge = Math.max(0, (c.badges || []).findIndex(Boolean));
    if (selBadge < 0) selBadge = 0;

    const rank = getCardRank(c);
    const h = Math.floor((c.time || 0) / 3600);
    const m = Math.floor((c.time || 0) / 60) % 60;
    const timeStr = `${h}h ${String(m).padStart(2, '0')}`;
    const idStr = String(c.id || 0).padStart(5, '0');
    const dexTotal = 150;
    const dexPct = Math.min(100, Math.round(((c.dex || 0) / dexTotal) * 100));

    const render = () => {
      const starsHtml = Array.from({ length: 5 })
        .map((_, i) => `<span class="tc-star${i < rank.stars ? ' on' : ''}">★</span>`)
        .join('');

      // Face A : Profil
      const team = (c.team || []).slice(0, 6);
      const teamHtml = Array.from({ length: 6 }).map((_, slotIdx) => {
        const q = team[slotIdx];
        if (!q) {
          return `
            <div class="tc-team-slot empty" title="Emplacement libre">
              <div class="tc-ts-socket"></div>
              
            </div>
          `;
        }
        const S = SPECIES[q.sp] || {};
        const hpR = q.hp != null && q.maxHp ? Math.max(0, Math.min(1, q.hp / q.maxHp)) : 1;
        const isShiny = !!q.shiny;
        const ballItem = q.ball || 'poke-ball';
        const ballSrc = ASSETS.item(ballItem);
        return `
          <button type="button" class="tc-team-slot${isShiny ? ' shiny' : ''}" data-slotidx="${slotIdx}" title="Clic : Écouter le cri de ${esc(q.nick || S.n || 'Pokémon')}">
            <div class="tc-ts-top">
              <img class="tc-ts-ball" src="${ballSrc}" alt="" title="${ballItem}">
              <span class="tc-ts-name">${esc(q.nick || S.n || 'Pokémon')}</span>
              ${isShiny ? '<span class="tc-ts-star">★</span>' : ''}
              <span class="tc-ts-lvl">N.${q.lvl}</span>
            </div>
            <div class="tc-ts-mid">
              <div class="tc-ts-icon-wrap">
                <img class="tc-ts-icon" src="${ASSETS.icon(q.sp)}" alt="" onerror="this.src='${ASSETS.front(q.sp)}'">
              </div>
              <div class="tc-ts-meta">
                <div class="tc-ts-types">
                  ${(S.t || ['normal']).map((t) => `<span class="tc-ts-type" style="--tc:${TYPE_COL[t] || '#888'}">${TYPE_FR[t] || t}</span>`).join('')}
                </div>
                <div class="tc-ts-hp">
                  <span class="tc-ts-hp-tag">PV</span>
                  <div class="tc-ts-hp-track"><u style="width:${(hpR * 100).toFixed(0)}%;background:${hpCol(hpR)}"></u></div>
                </div>
              </div>
            </div>
          </button>
        `;
      }).join('');

      // Face B : Badges Showcase
      const renderBadgeSlot = (spec, idx) => {
        const isGot = !!c.badges?.[idx];
        const isSel = selBadge === idx;
        const iconSrc = isGot ? ASSETS.badge(spec.id) : ASSETS.badge(spec.id, true);
        return `
          <button type="button" class="tc-badge-slot${isGot ? ' got' : ' locked'}${isSel ? ' selected' : ''}" data-bidx="${idx}" title="${esc(spec.name)} (${isGot ? 'Obtenu' : 'Non débloqué'})">
            <div class="tc-badge-socket">
              <img class="tc-badge-img${isGot ? ' shine' : ' dim'}" src="${iconSrc}" alt="${esc(spec.name)}">
            </div>
            <span class="tc-badge-num">#${spec.id}</span>
            <span class="tc-badge-label">${esc(spec.name.replace('Badge ', ''))}</span>
          </button>
        `;
      };

      const nordBadgesHtml = BADGE_SPECS.slice(0, 8).map(renderBadgeSlot).join('');
      const sudBadgesHtml = BADGE_SPECS.slice(8, 15).map((spec, i) => renderBadgeSlot(spec, i + 8)).join('');

      const selSpec = BADGE_SPECS[selBadge] || BADGE_SPECS[0];
      const selGot = !!c.badges?.[selBadge];
      const selImgSrc = selGot ? ASSETS.badge(selSpec.id).replace('.png', '_128.png') : ASSETS.badge(selSpec.id, true);

      s.innerHTML = `
        <div class="b2w2-card-casing ${rank.themeCls}">
          <!-- Fond Pixel Art 16-bit B2W2 Nanobanana -->
          <img class="tc-pixelart-bg" src="${face === 'profile' ? ASSETS.cardBg(rank.theme) : ASSETS.cardBack}" alt="Fond Carte B2W2">
          <div class="tc-pixelart-scanlines"></div>

          <!-- Barre Supérieure B2W2 DS -->
          <div class="tc-header">
            <div class="tc-hdr-left">
              <span class="tc-hdr-title">${other ? 'CARTE DE ' + esc(String(c.name).toUpperCase()) : 'CARTE DE DRESSEUR'}</span>
            </div>
            <div class="tc-hdr-right">
              <span class="tc-id-pill">N° ${idStr}</span>
              <button type="button" class="tc-btn-close" data-act="close" title="Fermer (Échap)">✕</button>
            </div>
          </div>

          <!-- Corps de la Carte B2W2 (2 faces commutables) -->
          <div class="tc-body-wrap">
            <!-- FACE A : Profil Dresseur -->
            <div class="tc-face tc-face-profile${face === 'profile' ? ' active' : ''}">
              <div class="tc-profile-grid">
                <!-- Colonne Gauche : Cadre Photo & Sceau -->
                <div class="tc-photo-col">
                  <div class="tc-photo-frame">
                    <div class="tc-photo-hologram"></div>
                    <div class="tc-photo-pedestal"></div>
                    <img class="tc-photo-spr" src="${ASSETS.trainer(c.gender === 'f' ? 'player_f' : 'player_m')}" alt="" onerror="this.style.display='none'">
                                      </div>
                  <div class="tc-stamp ${rank.themeCls}">
                    <div class="tc-stamp-ring">
                      <span class="tc-stamp-stars">${"★".repeat(rank.stars || 1)}</span>
                      <span class="tc-stamp-title">LIGUE D'ODYSSÉE</span>
                      <span class="tc-stamp-sub">RANG ${rank.grade.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                <!-- Colonne Droite : Données du Dresseur -->
                <div class="tc-data-col">
                  <div class="tc-data-box">
                    <div class="tc-hero-row">
                      <div class="tc-hero-cell tc-hero-name-cell">
                        <span class="tc-lbl-mini">DRESSEUR</span>
                        <span class="tc-val tc-name-val">${esc(c.name)}${c.champion ? ' <span class="tc-champ-badge">★ CHAMPION</span>' : ''}</span>
                      </div>
                      <div class="tc-hero-cell tc-hero-title-cell">
                        <span class="tc-lbl-mini">TITRE</span>
                        <span class="tc-val tc-rank-title">${esc(rank.title)}</span>
                      </div>
                    </div>
                    <div class="tc-stats-grid">
                      ${other ? '' : `
                      <div class="tc-stat-card">
                        <span class="tc-lbl"><i class="tc-ico">₽</i> ARGENT</span>
                        <span class="tc-val tc-money-val"><b>${(c.money || 0).toLocaleString('fr-FR')}</b> ₽</span>
                      </div>`}
                      <div class="tc-stat-card">
                        <span class="tc-lbl"><i class="tc-ico">⏱</i> TEMPS DE JEU</span>
                        <span class="tc-val tc-time-val">${timeStr}</span>
                      </div>
                      <div class="tc-stat-card tc-stat-card-wide">
                        <div class="tc-stat-card-top">
                          <span class="tc-lbl"><i class="tc-ico">📖</i> POKÉDEX</span>
                          <span class="tc-val"><b>${c.dex || 0}</b> capturés <small>(vus : ${c.seen != null ? c.seen : (c.dex || 0)})</small></span>
                        </div>
                        <div class="tc-pdx-bar"><u style="width:${dexPct}%"></u></div>
                      </div>
                      <div class="tc-stat-card">
                        <span class="tc-lbl"><i class="tc-ico">🛡</i> BADGES D'ARÈNE</span>
                        <div class="tc-badges-val-wrap">
                          <span class="tc-val tc-badges-val"><b>${rank.badgesCount}</b> / 15 Badges</span>
                          <div class="tc-badge-pips">
                            ${Array.from({ length: 15 }).map((_, bi) => `<span class="tc-pip${c.badges?.[bi] ? ' on' : ''}"></span>`).join('')}
                          </div>
                        </div>
                      </div>
                      <div class="tc-stat-card">
                        <span class="tc-lbl"><i class="tc-ico">🏅</i> MÉDAILLES</span>
                        <span class="tc-val tc-trophies-val"><b>${c.trophies || 0}</b> / 32 🏅</span>
                      </div>
                      ${c.champion || (c.hof && c.hof.length) ? `
                      <div class="tc-stat-card tc-stat-clickable" data-act="open-pantheon" title="Clic : Consulter vos sacres de la Ligue">
                        <span class="tc-lbl"><i class="tc-ico">🏆</i> PANTHÉON</span>
                        <span class="tc-val tc-hof-val" style="cursor:pointer;">
                          <b>${(c.hof || []).length || 1}</b> sacre${(c.hof || []).length > 1 ? 's' : ''} ➔
                        </span>
                      </div>` : ''}
                      ${(c.pvpWins || c.pvpLosses) ? `
                      <div class="tc-stat-card">
                        <span class="tc-lbl"><i class="tc-ico">⚔</i> DUELS MULTI</span>
                        <span class="tc-val tc-pvp-val"><b>${c.pvpWins || 0}</b>V — <b>${c.pvpLosses || 0}</b>D</span>
                      </div>` : ''}
                    </div>
                    <!-- les 15 badges en vitrine : remplit l'espace et se lit d'un coup d'œil -->
                    <div class="tc-badge-strip" data-act="flip" title="Voir le coffret des badges">
                      ${BADGE_SPECS.map((b, bi) => `<img class="tc-bs-ico${c.badges?.[bi] ? ' got' : ''}" src="${c.badges?.[bi] ? ASSETS.badge(b.id) : ASSETS.badge(b.id, true)}" alt="" title="${esc(b.name || '')}">`).join('')}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Plateau Équipe Pokémon (6 Slots) -->
              <div class="tc-team-tray">
                <div class="tc-tray-head">
                  <span class="tc-tray-title">ÉQUIPE EN VOYAGE</span>
                  <span class="tc-tray-sub">${team.length} / 6</span>
                </div>
                <div class="tc-team-grid">${teamHtml}</div>
              </div>
            </div>

            <!-- FACE B : Coffret des 15 Badges -->
            <div class="tc-face tc-face-badges${face === 'badges' ? ' active' : ''}">
              <div class="tc-velvet-casing">
                <div class="tc-velvet-head">
                  <div class="tc-vh-title">COFFRET D'HONNEUR DES 15 BADGES D'ODYSSÉE</div>
                  <div class="tc-vh-progress">
                    <span class="tc-vh-count"><b>${rank.badgesCount}</b> / 15 DÉBLOQUÉS</span>
                    <div class="tc-vh-bar"><u style="width:${Math.round((rank.badgesCount / 15) * 100)}%"></u></div>
                  </div>
                </div>

                <div class="tc-trays-container">
                  <!-- Plateau 1 : Continent Nord & Archipel (8 Badges) -->
                  <div class="tc-tray-block">
                    <div class="tc-tb-title">CONTINENT NORD & ARCHIPEL (8 BADGES)</div>
                    <div class="tc-badges-grid grid-8">${nordBadgesHtml}</div>
                  </div>

                  <!-- Plateau 2 : Terres du Sud (7 Badges) -->
                  <div class="tc-tray-block">
                    <div class="tc-tb-title">TERRES DU SUD (7 BADGES)</div>
                    <div class="tc-badges-grid grid-7">${sudBadgesHtml}</div>
                  </div>
                </div>

                <!-- Panneau Inspecteur de Badge interactif -->
                <div class="tc-badge-inspector">
                  <div class="tc-bi-art-col">
                    <div class="tc-bi-socket">
                      <img class="tc-bi-img${selGot ? ' shine' : ' dim'}" src="${selImgSrc}" alt="${esc(selSpec.name)}">
                    </div>
                  </div>
                  <div class="tc-bi-info-col">
                    <div class="tc-bi-title-row">
                      <span class="tc-bi-num">#${selSpec.id}</span>
                      <span class="tc-bi-name">${esc(selSpec.name.toUpperCase())}</span>
                      <span class="tc-bi-type" style="--tc:${TYPE_COL[selSpec.type] || '#888'}">${TYPE_FR[selSpec.type] || selSpec.type}</span>
                      <span class="tc-bi-status ${selGot ? 'got' : 'locked'}">${selGot ? '✔ OBTENU' : '🔒 NON DÉBLOQUÉ'}</span>
                    </div>
                    <div class="tc-bi-gym-row">
                      Arène de <b>${esc(selSpec.town)}</b> · Champion${selSpec.leader === 'Marine' || selSpec.leader === 'Volta' || selSpec.leader === 'Flora' || selSpec.leader === 'Sibylle' || selSpec.leader === 'Margot' || selSpec.leader === 'Morgane' || selSpec.leader === 'Lilas' ? 'ne' : ''} <b>${esc(selSpec.leader)}</b>
                    </div>
                    <div class="tc-bi-reward-row">
                      Privilège : <b>${esc(selSpec.reward)}</b> <span class="tc-bi-cap">(Niv. max : N.${selSpec.cap})</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Pied de la Carte B2W2 -->
          <div class="tc-footer">
            <div class="tc-foot-hints">
              <span><kbd>ESPACE</kbd> / <kbd>◄</kbd> <kbd>►</kbd> ${face === 'profile' ? 'Voir les Badges' : 'Profil'}</span>
              <span><kbd>▲</kbd> <kbd>▼</kbd> Sélectionner un badge</span>
              <span><kbd>ÉCHAP</kbd> Quitter</span>
            </div>
            <button type="button" class="tc-foot-btn" data-act="flip">
              ${face === 'profile' ? 'Voir les badges ▶' : '◀ Retour au profil'}
            </button>
          </div>
        </div>
      `;

      // Attach Event Handlers
      s.querySelectorAll('[data-act="close"]').forEach((b) => {
        b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); close(); };
      });

      s.querySelectorAll('[data-act="open-pantheon"]').forEach((b) => {
        b.onclick = async (e) => {
          e.preventDefault(); e.stopPropagation();
          ui.sound?.sfx('blip');
          await pantheonScreen(game);
        };
      });

      s.querySelectorAll('[data-act="flip"]').forEach((b) => {
        b.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          face = face === 'profile' ? 'badges' : 'profile';
          ui.sound?.sfx('blip');
          render();
        };
      });

      s.querySelectorAll('.tc-badge-slot').forEach((slot) => {
        slot.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          const bidx = parseInt(slot.dataset.bidx, 10);
          if (!isNaN(bidx) && bidx >= 0 && bidx < BADGE_SPECS.length) {
            selBadge = bidx;
            try {
              if (c.badges?.[bidx] && ui.sound?.badgeChime) {
                ui.sound.badgeChime(bidx);
              } else {
                ui.sound?.sfx('select');
              }
            } catch (err) {}
            render();
          }
        };
      });

      // Interactivité des slots d'équipe : Cri du Pokémon & animation de saut
      s.querySelectorAll('.tc-team-slot[data-slotidx]').forEach((slot) => {
        slot.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          const sidx = parseInt(slot.dataset.slotidx, 10);
          const mon = team[sidx];
          if (mon) {
            try { ui.sound?.cry(ASSETS.cry(mon.sp)); } catch (err) {}
            slot.classList?.remove?.('tc-ts-bounce');
            void slot.offsetWidth;
            slot.classList?.add?.('tc-ts-bounce');
          }
        };
      });

      // Consultation du Panthéon depuis la Carte de Dresseur
      s.querySelectorAll('.tc-hof-val').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          ui.sound?.sfx('select');
          pantheonScreen(game);
        };
      });

      // Interactivité de la photo du dresseur
      s.querySelectorAll('.tc-photo-frame').forEach((photo) => {
        if (photo.style) photo.style.cursor = 'pointer';
        photo.title = 'Clic : Saluer le dresseur';
        photo.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          ui.sound?.sfx('blip');
          photo.classList?.remove?.('tc-photo-pulse');
          void photo.offsetWidth;
          photo.classList?.add?.('tc-photo-pulse');
        };
      });
    };

    const close = closer(ui, s, () => pop, resolve);

    const pop = ui.input.push((k) => {
      if (k === 'b') {
        close();
      } else if (k === 'a' || k === 'left' || k === 'right') {
        if (face === 'profile') {
          face = 'badges';
          ui.sound?.sfx('blip');
          render();
        } else if (k === 'left' || k === 'right') {
          face = 'profile';
          ui.sound?.sfx('blip');
          render();
        } else if (k === 'a') {
          if (c.badges?.[selBadge] && ui.sound?.badgeChime) {
            ui.sound.badgeChime(selBadge);
            const inspImg = s.querySelector('.tc-bi-img');
            if (inspImg) {
              inspImg.classList.remove('shine');
              void inspImg.offsetWidth;
              inspImg.classList.add('shine');
            }
          } else {
            face = 'profile';
            ui.sound?.sfx('blip');
            render();
          }
        }
      } else if (face === 'badges' && (k === 'up' || k === 'down')) {
        selBadge = (selBadge + (k === 'down' ? 1 : -1) + BADGE_SPECS.length) % BADGE_SPECS.length;
        try {
          if (c.badges?.[selBadge] && ui.sound?.badgeChime) {
            ui.sound.badgeChime(selBadge);
          } else {
            ui.sound?.sfx('select');
          }
        } catch (err) {}
        render();
      }
    });

    render();
  });
}
