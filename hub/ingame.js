/* Arcadia — ce qui entoure chaque jeu, le même pour tous :
   - l'écran de chargement commun : l'affiche du jeu, ses commandes, une astuce et une barre de progression,
     posé par-dessus le jeu jusqu'à ce qu'il soit vraiment affiché (message « shown » du pont), puis « C'est parti ! » ;
   - « C'est parti ! » n'arrive que quand tous les joueurs du salon ont chargé le jeu (60 s au plus d'attente) ;
   - le menu Arcadia en jeu : un petit onglet sur le bord droit → reprendre, commandes, son, plein écran, retour au salon. */
(function () {
  const INFO = window.HUB_GAME_INFO || {};
  const GENRES = Object.fromEntries(window.HUB_GENRES || []);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sfx = (n, v) => { try { window.DDSfx && window.DDSfx.play(n, v); } catch (e) {} };
  const keyRows = (keys) => (keys || []).map(([k, a]) => `<div class="kr"><span class="kk">${k.split(' / ').map((x) => `<kbd>${esc(x)}</kbd>`).join('<i>ou</i>')}</span><span>${esc(a)}</span></div>`).join('');
  // les commandes à la manette (ligne « 🎮 Manette » de la fiche, « Bouton : action · … ») ont leur propre bloc,
  // affiché en premier quand une manette est branchée
  const padOn = () => { try { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].some((p) => p && p.connected); } catch (e) { return false; } };
  // le bloc qui ne sert pas (la manette sans manette branchée, ou le clavier quand elle l'est) est marqué « alt » :
  // l'écran de chargement le retire en premier quand la fiche ne tient pas dans l'écran
  const keysHTML = (keys, H = 'gl-h') => {
    const kb = (keys || []).filter(([k]) => !k.startsWith('🎮'));
    const padLine = (keys || []).find(([k]) => k.startsWith('🎮'));
    const pad = padLine ? padLine[1].split(' · ').map((x) => { const i = x.indexOf(' : '); const up = (t) => t.charAt(0).toUpperCase() + t.slice(1); return i > 0 ? [up(x.slice(0, i)), up(x.slice(i + 3))] : ['', up(x)]; }) : [];
    pad.push(['Vue (⧉)', 'Ouvrir ce menu']);
    const pOn = padOn() || !kb.length, alt = (on) => (on ? ' alt' : '');
    const padHTML = `<div class="${H}${alt(!pOn)}">🎮 Manette</div><div class="gl-keys${alt(!pOn)}">${pad.map(([k, a]) => `<div class="kr"><span class="kk">${k ? `<kbd>${esc(k)}</kbd>` : ''}</span><span>${esc(a)}</span></div>`).join('')}</div>`;
    const kbHTML = kb.length ? `<div class="${H}${alt(pOn)}">⌨️ Clavier et souris</div><div class="gl-keys${alt(pOn)}">${keyRows(kb)}</div>` : '';
    return pOn ? padHTML + kbHTML : kbHTML + padHTML;
  };

  let L = null, M = null, cur = null;

  /* ---------------------------------------------------------------- écran de chargement */
  function open(def, opts) {
    close();
    const info = INFO[def.id] || {}, tips = info.tips || [];
    cur = { def, info, opts, t0: performance.now(), shown: false, closed: false };
    const el = document.createElement('div');
    el.className = 'gload'; el.style.setProperty('--acc', def.accent || '#ffc531');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Chargement de ' + def.title);
    el.innerHTML = `<div class="gl-bg" style="background-image:url('${esc(def.cover)}')"></div>
      <div class="gl-card">
        <div class="gl-cover"><img src="${esc(def.cover)}" alt=""></div>
        <div class="gl-body">
          <div class="gl-meta"><span>${esc(GENRES[info.genre] || def.tag || '')}</span><span>⏱ ${esc(info.time || '')}</span><span>👥 ${def.minPlayers}–${def.maxPlayers}</span></div>
          <h2 class="gl-title">${esc(def.title)}</h2>
          <p class="gl-desc">${esc(def.desc || '')}</p>
          ${info.keys ? keysHTML(info.keys, 'gl-h') : ''}
          ${tips.length ? `<p class="gl-tip"><b>Astuce</b> ${esc(tips[(Math.random() * tips.length) | 0])}</p>` : ''}
          <div class="gl-foot"><div class="gl-bar"><i></i></div><span class="gl-st">Chargement du jeu…</span>
            <button class="btn gl-go" type="button" disabled>Patiente…</button></div>
        </div>
      </div>`;
    document.body.appendChild(el); L = el;
    fit();
    el.querySelector('.gl-cover img').addEventListener('load', fit);
    if (document.fonts) document.fonts.ready.then(fit);
    // une manette branchée (ou touchée) pendant le chargement : ses commandes prennent la place de celles du clavier
    const onPad = () => {
      if (L !== el) return;
      const hs = el.querySelectorAll('.gl-body > .gl-h, .gl-body > .gl-keys');
      if (![...hs].some((n) => n.classList.contains('alt') && n.textContent.startsWith('🎮'))) return;
      hs.forEach((n) => n.classList.toggle('alt'));
      fit();
    };
    addEventListener('gamepadconnected', onPad);
    cur.offPad = () => removeEventListener('gamepadconnected', onPad);
    requestAnimationFrame(() => el.classList.add('on'));
    el.querySelector('.gl-go').onclick = () => { sfx('go', 0.55); dismiss(); };
    // barre : avance seule vers 90 % (on ne sait pas ce qui reste à charger), file à 100 % quand le jeu est là
    const bar = el.querySelector('.gl-bar i');
    const tick = () => {
      if (!cur || cur.closed || L !== el) return;
      const t = (performance.now() - cur.t0) / 1000;
      const p = cur.shown ? 100 : 90 * (1 - Math.exp(-t / 4));
      bar.style.width = p.toFixed(1) + '%';
      if (!cur.shown && t > 6) {
        const st = el.querySelector('.gl-st'), m = t > 14 ? 'Presque prêt… (la première fois prend plus de temps)' : 'Préparation des graphismes…';
        if (st.textContent !== m) { st.textContent = m; fit(); }   // un texte plus long peut passer sur deux lignes
      }
      requestAnimationFrame(tick);
    };
    tick();
    // filet : un jeu qui n'annonce jamais « shown » ne reste pas caché
    cur.safety = setTimeout(() => shown(), 35000);
    tab(true);
  }
  // la fiche tient toujours dans l'écran : rien ne défile sur l'écran de chargement. On la resserre d'un cran à la fois
  // (le bloc de commandes qui ne sert pas, des marges plus serrées, sans l'astuce, sans la description), et si elle
  // dépasse encore, on la réduit juste assez (--fit), calée en haut puis recentrée (--fy)
  const FIT = ['gl-c1', 'gl-c2', 'gl-c3', 'gl-c4'];
  function fit() {
    if (!L) return;
    const card = L.querySelector('.gl-card'), cs = getComputedStyle(L);
    const H = L.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const W = L.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    L.classList.remove(...FIT, 'gl-fit');
    for (let i = 0; i < FIT.length && card.offsetHeight > H; i++) L.classList.add(FIT[i]);
    const h = card.offsetHeight, s = Math.min(1, H / h, W / card.offsetWidth);
    L.classList.toggle('gl-fit', s < 1);
    card.style.setProperty('--fit', s < 1 ? s.toFixed(4) : '1');
    card.style.setProperty('--fy', s < 1 ? Math.max(0, (H - s * h) / 2).toFixed(1) + 'px' : '0px');
  }
  addEventListener('resize', fit);
  // les autres joueurs ont-ils fini de charger ? (en solo : toujours oui) ; au bout de 60 s, on peut partir quand même
  function others() {
    const st = cur && cur.opts && cur.opts.loading ? cur.opts.loading() : null;
    if (!st || st.total <= 1 || st.done >= st.total) return null;
    if (cur.shownAt && performance.now() - cur.shownAt > 60000) return null;
    return st;
  }
  function refresh() {
    if (!cur || !cur.shown || !L || cur.go) return;
    const st = others(), btn = L.querySelector('.gl-go');
    if (st) {
      btn.disabled = true; btn.textContent = `En attente… ${st.done}/${st.total}`; btn.classList.remove('ready');
      L.querySelector('.gl-st').textContent = `Chargement chez ${st.waiting.slice(0, 3).join(', ')}${st.waiting.length > 3 ? '…' : ''}`;
      clearTimeout(cur.wait); cur.wait = setTimeout(refresh, 1000);   // filet : on revérifie (et on débloque au bout de 60 s)
      fit();   // le texte d'attente peut passer sur deux lignes
      return;
    }
    clearTimeout(cur.wait);
    cur.go = true;
    btn.disabled = false; btn.textContent = 'C\'est parti !'; btn.classList.add('ready');
    L.querySelector('.gl-st').textContent = cur.opts && cur.opts.loading && (cur.opts.loading() || {}).total > 1 ? 'Tout le monde est prêt !' : 'Prêt !';
    sfx('confirm', 0.4);
    // assez de temps pour lire les commandes, sans faire attendre : 4,8 s au moins après l'ouverture
    const wait = Math.max(2200, 4800 - (performance.now() - cur.t0));
    cur.auto = setTimeout(dismiss, wait);
    L.addEventListener('pointerenter', () => { clearTimeout(cur.auto); }, { once: true });   // on lit : on attend le clic
  }
  function shown() {
    if (!cur || cur.shown || !L) return;
    cur.shown = true; cur.shownAt = performance.now(); clearTimeout(cur.safety);
    refresh();
  }
  function dismiss() {
    if (!cur || !L) return;
    clearTimeout(cur.auto); clearTimeout(cur.safety); cur.offPad && cur.offPad();
    const el = L; L = null; el.classList.remove('on'); el.classList.add('off');
    setTimeout(() => el.remove(), 450);
    if (cur.opts && cur.opts.focus) cur.opts.focus();
    tabEl && tabEl.classList.add('peek'); setTimeout(() => tabEl && tabEl.classList.remove('peek'), 2600);
  }
  function close() {
    if (cur) { cur.closed = true; cur.offPad && cur.offPad(); clearTimeout(cur.auto); clearTimeout(cur.safety); clearTimeout(cur.wait); }
    if (L) { L.remove(); L = null; }
    menu(false); tab(false); cur = null;
  }

  /* ---------------------------------------------------------------- menu Arcadia en jeu */
  let tabEl = null;
  function tab(on) {
    if (!on) { if (tabEl) tabEl.hidden = true; return; }
    if (!tabEl) {
      tabEl = document.createElement('button');
      tabEl.className = 'atab'; tabEl.type = 'button'; tabEl.title = 'Menu Arcadia : commandes, son, retour au salon';
      tabEl.setAttribute('aria-label', 'Menu Arcadia');
      tabEl.innerHTML = '<img src="assets/brand/icon.svg" alt=""><span>Menu</span>';
      tabEl.onclick = () => menu(!M);
      document.body.appendChild(tabEl);
    }
    tabEl.hidden = false;
  }
  function menu(on) {
    if (!on) { if (M) { M.remove(); M = null; sfx('close', 0.35); if (cur && cur.opts.focus) cur.opts.focus(); } return; }
    if (M || !cur) return;
    sfx('open', 0.35);
    const { def, info } = cur;
    let V = null; try { V = (cur.opts.vol && cur.opts.vol()) || null; } catch (e) {} V = V || window.DDVolume;   // le volume du jeu lui-même (réglé jeu par jeu)
    const el = document.createElement('div');
    el.className = 'amenu'; el.style.setProperty('--acc', def.accent || '#ffc531');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Menu Arcadia');
    const vol = (k, label) => V ? `<label class="am-vol"><span>${label}</span><input type="range" min="0" max="100" step="1" value="${Math.round(V.get(k) * 100)}" data-k="${k}"><b>${Math.round(V.get(k) * 100)} %</b></label>` : '';
    el.innerHTML = `<div class="am-panel">
        <div class="am-head"><img src="${esc(def.cover)}" alt=""><div><small>Arcadia</small><b>${esc(def.title)}</b></div>
          <button class="am-x" type="button" aria-label="Fermer">✕</button></div>
        <button class="btn block am-resume" type="button">▶ Reprendre</button>
        ${info.keys ? keysHTML(info.keys, 'am-h') : ''}
        <div class="am-h">Son</div>${vol('music', 'Musique')}${vol('fx', 'Effets')}
        <div class="am-row">
          <button class="btn ghost small am-fs" type="button">⛶ Plein écran</button>
          <button class="btn yellow small am-quit" type="button">← Retour au salon</button>
        </div>
        <p class="am-note">Les réglages propres au jeu (graphismes, caméra…) sont dans son bouton ⚙️.</p>
      </div>`;
    document.body.appendChild(el); M = el;
    el.addEventListener('pointerdown', (e) => { if (e.target === el) menu(false); });
    el.querySelector('.am-x').onclick = el.querySelector('.am-resume').onclick = () => menu(false);
    el.querySelector('.am-fs').onclick = () => {
      sfx('toggle', 0.4);
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    };
    el.querySelector('.am-quit').onclick = () => { sfx('back', 0.45); const ex = cur && cur.opts.exit; menu(false); if (ex) ex(); };
    for (const r of el.querySelectorAll('input[type=range]')) {
      r.oninput = () => { V.set(r.dataset.k, r.value / 100); r.nextElementSibling.textContent = r.value + ' %'; };
      r.onchange = () => sfx('click', 0.6);
    }
    el.querySelector('.am-resume').focus();
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && M) { e.preventDefault(); menu(false); } });

  // manette : le bouton Vue (⧉, celui de gauche au centre) ouvre et ferme ce menu pendant une partie, B le ferme
  let padPrev = {};
  (function poll() {
    requestAnimationFrame(poll);
    let gp = null; try { gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((p) => p && p.connected); } catch (e) {}
    if (!gp) { padPrev = {}; return; }
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (b(8) && !padPrev[8] && cur && !document.querySelector('.gload.on')) menu(!M);
    else if (b(1) && !padPrev[1] && M) menu(false);
    padPrev = { 8: b(8), 1: b(1) };
  })();

  window.HubInGame = { open, shown, close, menu, refresh };
})();
