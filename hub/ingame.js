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
  const keysHTML = (keys) => (keys || []).map(([k, a]) => `<div class="kr"><span class="kk">${k.split(' / ').map((x) => `<kbd>${esc(x)}</kbd>`).join('<i>ou</i>')}</span><span>${esc(a)}</span></div>`).join('');

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
          ${info.keys ? `<div class="gl-h">Commandes</div><div class="gl-keys">${keysHTML(info.keys)}</div>` : ''}
          ${tips.length ? `<p class="gl-tip"><b>Astuce</b> ${esc(tips[(Math.random() * tips.length) | 0])}</p>` : ''}
          <div class="gl-foot"><div class="gl-bar"><i></i></div><span class="gl-st">Chargement du jeu…</span>
            <button class="btn gl-go" type="button" disabled>Patiente…</button></div>
        </div>
      </div>`;
    document.body.appendChild(el); L = el;
    requestAnimationFrame(() => el.classList.add('on'));
    el.querySelector('.gl-go').onclick = () => { sfx('go', 0.55); dismiss(); };
    // barre : avance seule vers 90 % (on ne sait pas ce qui reste à charger), file à 100 % quand le jeu est là
    const bar = el.querySelector('.gl-bar i');
    const tick = () => {
      if (!cur || cur.closed || L !== el) return;
      const t = (performance.now() - cur.t0) / 1000;
      const p = cur.shown ? 100 : 90 * (1 - Math.exp(-t / 4));
      bar.style.width = p.toFixed(1) + '%';
      if (!cur.shown && t > 6) el.querySelector('.gl-st').textContent = t > 14 ? 'Presque prêt… (la première fois prend plus de temps)' : 'Préparation des graphismes…';
      requestAnimationFrame(tick);
    };
    tick();
    // filet : un jeu qui n'annonce jamais « shown » ne reste pas caché
    cur.safety = setTimeout(() => shown(), 35000);
    tab(true);
  }
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
    clearTimeout(cur.auto); clearTimeout(cur.safety);
    const el = L; L = null; el.classList.remove('on'); el.classList.add('off');
    setTimeout(() => el.remove(), 450);
    if (cur.opts && cur.opts.focus) cur.opts.focus();
    tabEl && tabEl.classList.add('peek'); setTimeout(() => tabEl && tabEl.classList.remove('peek'), 2600);
  }
  function close() {
    if (cur) { cur.closed = true; clearTimeout(cur.auto); clearTimeout(cur.safety); clearTimeout(cur.wait); }
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
        ${info.keys ? `<div class="am-h">Commandes</div><div class="gl-keys">${keysHTML(info.keys)}</div>` : ''}
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

  window.HubInGame = { open, shown, close, menu, refresh };
})();
