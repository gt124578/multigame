// odyssee/js/ui/screens/friends.js — amis et joueurs connectés
import { esc } from '../ui.js';
import { BADGES } from '../../world/region.js';
import { ASSETS } from '../../assets.js';
import { getFriendsManager, formatFid } from '../../net/friends.js';
import { screen, closer } from './common.js';
import { cardScreen } from './card.js';

/* ================= REGISTRE AMI & CONNEXIONS C-GEAR 5G ================= */
export function friendsScreen(game) {
  const ui = game.ui;
  const mgr = getFriendsManager(game);

  return new Promise((resolve) => {
    const s = screen(ui, 'friends-scr');
    s.classList.add('b2w2-screen');

    let tab = 'online'; // 'online' | 'friends' | 'add'
    let notice = { text: '', type: 'info', ts: 0 };
    let addCodeInput = '';

    const setNotice = (text, type = 'info') => {
      notice = { text, type, ts: Date.now() };
      try {
        if (type === 'ok') ui.sound?.sfx('select');
        else if (type === 'err') ui.sound?.sfx('bump');
        else ui.sound?.sfx('blip');
      } catch (e) {}
      render();
    };

    const copyCode = async () => {
      const code = formatFid(mgr.getMyCode());
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(code);
        } else {
          const ta = document.createElement('textarea');
          ta.value = code;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setNotice(`Code ami ${code} copié dans le presse-papier !`, 'ok');
      } catch (e) {
        setNotice(`Code ami : ${code}`, 'info');
      }
    };

    const render = () => {
      // le champ du code ami garde le focus et le curseur quand l'écran se redessine
      const prevInput = s.querySelector('.fr-code-input');
      const hadFocus = !!prevInput && document.activeElement === prevInput;
      const caret = hadFocus ? prevInput.selectionStart : null;
      const myCode = mgr.getMyCode();
      const onlinePeers = mgr.getOnlinePeers();
      const onlineCount = mgr.getOnlineCount();
      const friendsList = mgr.getFriendsList();
      const requests = mgr.getRequests();

      // En-tête C-Gear
      const headerHtml = `
        <div class="fr-hdr">
          <div class="fr-hdr-left">
            <div class="fr-cgear-icon"></div>
            <div class="fr-hdr-titles">
              <span class="fr-hdr-main">AMIS</span>
              <span class="fr-hdr-sub">Joue avec les dresseurs connectés et retrouve tes amis</span>
            </div>
          </div>
          <div class="fr-hdr-right">
            <span class="fr-online-pill">
              <span class="fr-pulse-dot"></span>
              <b>${onlineCount}</b> DRESSEUR${onlineCount > 1 ? 'S' : ''} CONNECTÉ${onlineCount > 1 ? 'S' : ''}
            </span>
            <button type="button" class="fr-close-btn" data-act="close" title="Fermer le Registre Ami (Échap)">FERMER ✕</button>
          </div>
        </div>
      `;

      // Bandeau Mon Code Ami
      const myCodeHtml = `
        <div class="fr-mycode-bar">
          <div class="fr-mycode-left">
            <span class="fr-mycode-lbl">VOTRE CODE AMI PERSONNEL :</span>
            <span class="fr-mycode-val">${formatFid(myCode)}</span>
            <button type="button" class="fr-copy-btn" data-act="copy-code" title="Copier mon code ami dans le presse-papier">📋 COPIER MON CODE</button>
          </div>
          <div class="fr-mycode-right">
            ${notice.text ? `<span class="fr-notice-pill ${notice.type}">${esc(notice.text)}</span>` : '<span class="fr-hint-txt">Partagez ce code pour recevoir des demandes d\'amis !</span>'}
          </div>
        </div>
      `;

      // Onglets
      const tabsHtml = `
        <div class="fr-tabs-bar">
          <button type="button" class="fr-tab${tab === 'online' ? ' active' : ''}" data-act="tab-online">
            🌐 DRESSEURS EN DIRECT (${onlinePeers.length})
          </button>
          <button type="button" class="fr-tab${tab === 'friends' ? ' active' : ''}" data-act="tab-friends">
            👥 MES AMIS (${friendsList.length})
          </button>
          <button type="button" class="fr-tab${tab === 'add' ? ' active' : ''}" data-act="tab-add">
            ➕ AJOUTER UN AMI ${requests.length > 0 ? `<span class="fr-tab-badge">${requests.length}</span>` : ''}
          </button>
        </div>
      `;

      // Corps selon l'onglet
      let bodyHtml = '';

      if (tab === 'online') {
        const othersCount = onlinePeers.filter((p) => !p.isSelf).length;
        const peersCards = onlinePeers.map((p) => {
          const isSelf = p.isSelf;
          const sprSrc = ASSETS.trainer(p.gender === 'f' ? 'player_f' : 'player_m');
          let statusPill = '';
          if (isSelf) {
            statusPill = `<span class="fr-tag fr-tag-self">🟢 VOUS · ACTIF</span>`;
          } else if (p.pvp) {
            statusPill = `<span class="fr-tag fr-tag-pvp">⚔️ EN COMBAT PVP</span>`;
          } else if (p.busy) {
            statusPill = `<span class="fr-tag fr-tag-busy">⏳ OCCUPÉ</span>`;
          } else {
            statusPill = `<span class="fr-tag fr-tag-ready">🟢 DISPONIBLE</span>`;
          }

          return `
            <div class="fr-card${isSelf ? ' is-me' : ''}">
              <div class="fr-card-avatar-wrap">
                <img class="fr-card-avatar" src="${sprSrc}" alt="" onerror="this.style.display='none'">
                ${isSelf ? '<span class="fr-card-me-tag">MOI</span>' : ''}
              </div>
              <div class="fr-card-info">
                <div class="fr-card-head">
                  <span class="fr-card-name">${esc(p.name)}</span>
                  <span class="fr-card-gender ${p.gender || 'm'}">${p.gender === 'f' ? '♀' : '♂'}</span>
                  ${statusPill}
                  ${p.isFriend ? '<span class="fr-friend-badge">✓ AMI</span>' : ''}
                </div>
                <div class="fr-card-meta">
                  <span class="fr-card-loc">📍 <b>${esc(p.locName || 'Odyssée')}</b></span>
                </div>
              </div>
              <div class="fr-card-actions">
                ${isSelf ? `
                  <button type="button" class="fr-act-btn" data-act="my-card" title="Voir ma Carte de Dresseur">👁 MA FICHE</button>
                ` : `
                  <button type="button" class="fr-act-btn fr-btn-card" data-act="peer-card" data-peerid="${p.id}" title="Consulter la Carte de Dresseur de ${esc(p.name)}">👁 CARTE</button>
                  <button type="button" class="fr-act-btn fr-btn-battle" data-act="peer-battle" data-peerid="${p.id}" title="Défier ${esc(p.name)} en duel 1v1">⚔️ COMBAT</button>
                  <button type="button" class="fr-act-btn fr-btn-trade" data-act="peer-trade" data-peerid="${p.id}" title="Proposer un échange Pokémon à ${esc(p.name)}">🔄 ÉCHANGE</button>
                  ${p.isFriend ? '' : `
                    <button type="button" class="fr-act-btn fr-btn-add" data-act="peer-quick-add" data-peerid="${p.id}" title="Ajouter ${esc(p.name)} en ami">+ AMI</button>
                  `}
                `}
              </div>
            </div>
          `;
        }).join('');

        bodyHtml = `
          <div class="fr-tab-pane fr-pane-online">
            <div class="fr-pane-hdr">
              <span class="fr-pane-title">DRESSEURS ACTIFS DANS CETTE SESSION D\'ODYSSÉE (${onlinePeers.length})</span>
              <span class="fr-pane-sub">Les dresseurs connectés au même salon se déplacent avec vous dans la région.</span>
            </div>
            <div class="fr-cards-grid">
              ${peersCards}
            </div>
            ${othersCount === 0 ? `
              <div class="fr-empty-callout">
                <div class="fr-empty-icon">📡</div>
                <div class="fr-empty-msg">
                  <b>Aucun autre dresseur dans ce salon pour le moment.</b>
                  <p>Partagez le lien de votre salon ou votre Code Ami (${formatFid(myCode)}) pour vous retrouver et explorer la région d\'Odyssée ensemble !</p>
                </div>
              </div>
            ` : ''}
          </div>
        `;
      } else if (tab === 'friends') {
        const friendsCards = friendsList.map((f) => {
          const isOnline = f.isOnline;
          return `
            <div class="fr-card${isOnline ? ' is-online' : ' is-offline'}">
              <div class="fr-friend-avatar" style="--fc: ${f.color || '#3b82f6'};">
                <span>${esc((f.name || 'A')[0].toUpperCase())}</span>
              </div>
              <div class="fr-card-info">
                <div class="fr-card-head">
                  <span class="fr-card-name">${esc(f.name)}</span>
                  <span class="fr-friend-fid">${formatFid(f.fid)}</span>
                  <span class="fr-tag ${isOnline ? 'fr-tag-ready' : 'fr-tag-busy'}">
                    ${isOnline ? '🟢 EN LIGNE' : '⚪ HORS LIGNE'}
                  </span>
                </div>
                <div class="fr-card-meta">
                  <span class="fr-card-loc">
                    ${isOnline ? (f.roomCode ? `Connecté dans Odyssée · Salon #${esc(f.roomCode)}` : 'En ligne dans le Hub Arcadia') : 'Non connecté actuellement'}
                  </span>
                </div>
              </div>
              <div class="fr-card-actions">
                ${isOnline && f.roomCode ? `
                  <button type="button" class="fr-act-btn fr-btn-join" data-act="join-room" data-code="${esc(f.roomCode)}" title="Rejoindre le salon de ${esc(f.name)}">🚀 REJOINDRE</button>
                ` : ''}
                <button type="button" class="fr-act-btn fr-btn-invite" data-act="invite-friend" data-fid="${esc(f.fid)}" title="Envoyer une invitation de salon à ${esc(f.name)}">✉️ INVITER</button>
                <button type="button" class="fr-act-btn fr-btn-del" data-act="remove-friend" data-fid="${esc(f.fid)}" title="Supprimer ${esc(f.name)} de mes amis">🗑 RETIRER</button>
              </div>
            </div>
          `;
        }).join('');

        bodyHtml = `
          <div class="fr-tab-pane fr-pane-friends">
            <div class="fr-pane-hdr">
              <span class="fr-pane-title">MES AMIS ENREGISTRÉS (${friendsList.length})</span>
              <span class="fr-pane-sub">Voyez qui est connecté et rejoignez leur salon en un clic sans chercher de code.</span>
            </div>
            ${friendsList.length > 0 ? `
              <div class="fr-cards-grid">
                ${friendsCards}
              </div>
            ` : `
              <div class="fr-empty-callout">
                <div class="fr-empty-icon">👥</div>
                <div class="fr-empty-msg">
                  <b>Aucun ami enregistré pour le moment.</b>
                  <p>Allez dans l\'onglet <b>"AJOUTER UN AMI"</b> pour enregistrer le code ami de vos proches !</p>
                </div>
              </div>
            `}
          </div>
        `;
      } else if (tab === 'add') {
        const reqHtml = requests.map((r) => `
          <div class="fr-card is-req">
            <div class="fr-friend-avatar" style="--fc: ${r.color || '#eab308'};">
              <span>${esc((r.name || 'D')[0].toUpperCase())}</span>
            </div>
            <div class="fr-card-info">
              <div class="fr-card-head">
                <span class="fr-card-name">${esc(r.name)}</span>
                <span class="fr-friend-fid">${formatFid(r.fid)}</span>
                <span class="fr-tag fr-tag-pvp">DEMANDE REÇUE</span>
              </div>
              <div class="fr-card-meta">
                <span class="fr-card-loc">Ce dresseur vous a envoyé une demande d\'amitié !</span>
              </div>
            </div>
            <div class="fr-card-actions">
              <button type="button" class="fr-act-btn fr-btn-accept" data-act="accept-req" data-fid="${esc(r.fid)}" title="Accepter la demande">✓ ACCEPTER</button>
              <button type="button" class="fr-act-btn fr-btn-del" data-act="decline-req" data-fid="${esc(r.fid)}" title="Refuser la demande">✕ REFUSER</button>
            </div>
          </div>
        `).join('');

        bodyHtml = `
          <div class="fr-tab-pane fr-pane-add">
            <div class="fr-add-box">
              <div class="fr-pane-title">AJOUTER UN AMI PAR CODE</div>
              <div class="fr-pane-sub">Entrez le Code Ami à 8 caractères fourni par l\'autre joueur (ex: ABCD-1234).</div>
              <div class="fr-add-form">
                <input type="text" class="fr-code-input" placeholder="EX: A1B2-C3D4" maxlength="9" value="${esc(addCodeInput)}" autofocus>
                <button type="button" class="fr-submit-btn" data-act="submit-add">➕ ENVOYER LA DEMANDE</button>
              </div>
            </div>

            ${requests.length > 0 ? `
              <div class="fr-req-section">
                <div class="fr-pane-title">DEMANDES D\'AMIS EN ATTENTE (${requests.length})</div>
                <div class="fr-cards-grid">
                  ${reqHtml}
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }

      // Pied de page
      const footHtml = `
        <div class="fr-foot">
          <div class="fr-foot-hints">
            <span class="fr-key-pill"><kbd>◄</kbd> <kbd>►</kbd> Changer d\'onglet</span>
            <span class="fr-key-pill"><kbd>▲</kbd> <kbd>▼</kbd> Naviguer</span>
            <span class="fr-key-pill"><kbd>Espace</kbd> / <kbd>Entrée</kbd> Valider l\'action</span>
            <span class="fr-key-pill"><kbd>Échap</kbd> Fermer</span>
          </div>
          <button type="button" class="fr-foot-close" data-act="close">Fermer</button>
        </div>
      `;

      s.innerHTML = `
        <div class="b2w2-friends-casing">
          <img class="fr-pixelart-bg" src="${ASSETS.carteBg}" alt="">
          <div class="fr-scanlines"></div>
          ${headerHtml}
          ${myCodeHtml}
          ${tabsHtml}
          <div class="fr-body-container">
            ${bodyHtml}
          </div>
          ${footHtml}
        </div>
      `;

      // Brancher événements souris / clics
      s.querySelectorAll('[data-act="close"]').forEach((b) => (b.onclick = close));

      s.querySelectorAll('[data-act="copy-code"]').forEach((b) => (b.onclick = copyCode));

      s.querySelector('[data-act="tab-online"]')?.addEventListener('click', () => {
        tab = 'online';
        ui.sound?.sfx('select');
        render();
      });
      s.querySelector('[data-act="tab-friends"]')?.addEventListener('click', () => {
        tab = 'friends';
        ui.sound?.sfx('select');
        render();
      });
      s.querySelector('[data-act="tab-add"]')?.addEventListener('click', () => {
        tab = 'add';
        ui.sound?.sfx('select');
        render();
      });

      // Actions sur les pairs
      s.querySelectorAll('[data-act="my-card"]').forEach((b) => {
        b.onclick = async () => {
          try {
            await cardScreen(game, BADGES);
          } catch (e) {}
        };
      });

      s.querySelectorAll('[data-act="peer-card"]').forEach((b) => {
        b.onclick = async () => {
          const pid = b.dataset.peerid;
          const peer = onlinePeers.find((q) => String(q.id) === String(pid));
          if (!peer || !peer.peerObj) {
            setNotice('Dresseur introuvable ou déconnecté.', 'err');
            return;
          }
          try {
            if (game.showPeerCard) await game.showPeerCard(peer.peerObj);
            else setNotice(`Fiche de ${peer.name} inaccessible.`, 'err');
          } catch (e) {
            setNotice(`Erreur : ${e.message || e}`, 'err');
          }
        };
      });

      s.querySelectorAll('[data-act="peer-battle"], [data-act="peer-trade"]').forEach((b) => {
        b.onclick = async () => {
          const pid = b.dataset.peerid;
          const peer = onlinePeers.find((q) => String(q.id) === String(pid));
          if (!peer || !peer.peerObj) {
            setNotice('Dresseur introuvable ou déconnecté.', 'err');
            return;
          }
          if (game.talkToPeer) {
            close();
            await game.talkToPeer(peer.peerObj);
          } else {
            setNotice('Fonctionnalité réseau inactive dans ce mode.', 'err');
          }
        };
      });

      s.querySelectorAll('[data-act="peer-quick-add"]').forEach((b) => {
        b.onclick = async () => {
          const pid = b.dataset.peerid;
          const peer = onlinePeers.find((q) => String(q.id) === String(pid));
          if (!peer) return;
          try {
            const targetCode = peer.fid || peer.name;
            await mgr.addFriend(targetCode);
            setNotice(`Demande d\'ami envoyée à ${peer.name} !`, 'ok');
          } catch (e) {
            setNotice(`Erreur : ${e.message}`, 'err');
          }
        };
      });

      // Formulaire ajout
      const inputEl = s.querySelector('.fr-code-input');
      if (inputEl) {
        inputEl.oninput = (e) => {
          addCodeInput = e.target.value.toUpperCase();
        };
        if (hadFocus) { inputEl.focus(); try { inputEl.setSelectionRange(caret, caret); } catch (e) {} }
        inputEl.onkeydown = (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            s.querySelector('[data-act="submit-add"]')?.click();
          } else if (e.key === 'Escape') {
            close();
          }
        };
      }

      s.querySelector('[data-act="submit-add"]')?.addEventListener('click', async () => {
        if (!addCodeInput.trim()) {
          setNotice('Veuillez entrer un code ami.', 'err');
          return;
        }
        try {
          await mgr.addFriend(addCodeInput);
          setNotice(`Demande envoyée pour le code ${formatFid(addCodeInput)} !`, 'ok');
          addCodeInput = '';
          render();
        } catch (e) {
          setNotice(`Erreur : ${e.message}`, 'err');
        }
      });

      // Actions demandes reçues
      s.querySelectorAll('[data-act="accept-req"]').forEach((b) => {
        b.onclick = async () => {
          const fid = b.dataset.fid;
          await mgr.acceptRequest(fid);
          setNotice('Ami accepté avec succès !', 'ok');
        };
      });
      s.querySelectorAll('[data-act="decline-req"]').forEach((b) => {
        b.onclick = async () => {
          const fid = b.dataset.fid;
          await mgr.declineRequest(fid);
          setNotice('Demande d\'ami refusée.', 'info');
        };
      });

      // Actions liste amis
      s.querySelectorAll('[data-act="remove-friend"]').forEach((b) => {
        b.onclick = async () => {
          const fid = b.dataset.fid;
          await mgr.removeFriend(fid);
          setNotice('Ami retiré de votre liste.', 'info');
        };
      });
      s.querySelectorAll('[data-act="invite-friend"]').forEach((b) => {
        b.onclick = async () => {
          const fid = b.dataset.fid;
          const ok = await mgr.inviteFriend(fid);
          if (ok) setNotice('Invitation de salon envoyée !', 'ok');
          else setNotice('Impossible d\'envoyer l\'invitation.', 'err');
        };
      });
      s.querySelectorAll('[data-act="join-room"]').forEach((b) => {
        b.onclick = () => {
          const code = b.dataset.code;
          if (code) {
            close();
            mgr.joinRoom(code);
          }
        };
      });
    };

    const close = closer(ui, s, () => pop, resolve, 'cancel', () => {
      clearInterval(heartbeatTimer);
      mgr.off('change', onMgrChange);
    });

    const onMgrChange = () => render();
    mgr.on('change', onMgrChange);
    // rafraîchit la liste des connectés, mais pas pendant qu'on tape un code
    const heartbeatTimer = setInterval(() => {
      if (document.activeElement?.classList?.contains('fr-code-input')) return;
      render();
    }, 3000);

    const pop = ui.input.push((k) => {
      if (k === 'b') {
        close();
      } else if (k === 'left') {
        if (tab === 'add') tab = 'friends';
        else if (tab === 'friends') tab = 'online';
        ui.sound?.sfx('select');
        render();
      } else if (k === 'right') {
        if (tab === 'online') tab = 'friends';
        else if (tab === 'friends') tab = 'add';
        ui.sound?.sfx('select');
        render();
      } else if (k === 'a') {
        // NON-DESTRUCTIF : Espace / Entrée ne ferme pas l'écran
        const activeBtn = s.querySelector('.fr-tab.active') || s.querySelector('.fr-act-btn');
        if (activeBtn) {
          ui.sound?.sfx('select');
        }
      }
    });

    render();
  });
}
