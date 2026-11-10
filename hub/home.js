/* Arcadia — accueil : la vitrine des jeux en haut (un jeu à la une qui défile), les « Gros jeux » dans leur rangée à part,
   les filtres par catégorie, les étiquettes « Nouveau » / « Mis à jour » tirées du journal des versions, et les sons des boutons. */
(function () {
  const $ = (s) => document.querySelector(s);
  const GAMES = window.HUB_GAMES, INFO = window.HUB_GAME_INFO || {}, GENRES = window.HUB_GENRES || [];
  const GN = Object.fromEntries(GENRES);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sfx = (n, v) => { try { window.DDSfx && window.DDSfx.play(n, v); } catch (e) {} };
  const UI = window.HubUI;

  /* ------------------------------------------------ vitrine */
  // ordre de la vitrine : les plus spectaculaires d'abord
  const ORDER = ['mystery', 'royale', 'sitenoir', 'mollo', 'kart', 'minigolf', 'bastion', 'odyssee', 'golf', 'david', 'outbreak', 'filrouge', 'drift', 'convoy', 'calcul', 'pokemon'];
  const feat = ORDER.map((id) => GAMES.find((g) => g.id === id)).filter(Boolean);
  const spot = $('#spot');
  let idx = 0, timer = 0, paused = false;
  spot.innerHTML = `<div class="sp-slides">${feat.map((g, i) => {
    const I = INFO[g.id] || {};
    return `<article class="sp-slide${i === 0 ? ' on' : ''}" style="--acc:${esc(g.accent || '#ffc531')}" aria-hidden="${i !== 0}">
      <img src="${esc(g.cover)}" alt="" ${i < 2 ? '' : 'loading="lazy"'} decoding="async">
      <div class="sp-txt">
        <div class="sp-meta"><span>${esc(GN[I.genre] || g.tag || '')}</span><span>⏱ ${esc(I.time || '')}</span><span>👥 ${g.minPlayers}–${g.maxPlayers} joueurs</span></div>
        <h2>${esc(g.title)}</h2><p>${esc(g.desc)}</p>
        ${I.keys ? `<div class="sp-keys">${I.keys.slice(0, 4).map(([k, a]) => `<span><kbd>${esc(k.split(' / ')[0])}</kbd>${esc(a)}</span>`).join('')}</div>` : ''}
        ${(I.tips || []).length ? `<p class="sp-tip"><b>Astuce</b>${esc(I.tips[0])}</p>` : ''}
        <div class="sp-cta"><button class="btn" data-play="${g.id}" type="button">▶ Jouer avec mes potes</button><button class="btn ghost" data-solo="${g.id}" type="button">Jouer seul</button></div>
      </div></article>`;
  }).join('')}</div>
    <button class="sp-nav prev" type="button" aria-label="Jeu précédent">‹</button><button class="sp-nav next" type="button" aria-label="Jeu suivant">›</button>
    <div class="sp-dots">${feat.map((g, i) => `<button type="button" aria-label="${esc(g.title)}" data-i="${i}"${i === 0 ? ' class="on"' : ''}><img src="${esc(g.cover)}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>`;
  const slides = [...spot.querySelectorAll('.sp-slide')], dots = [...spot.querySelectorAll('.sp-dots button')];
  function go(i, user) {
    idx = (i + slides.length) % slides.length;
    slides.forEach((s, k) => { s.classList.toggle('on', k === idx); s.setAttribute('aria-hidden', k !== idx); });
    dots.forEach((d, k) => d.classList.toggle('on', k === idx));
    const od = dots[idx]; if (od && od.parentElement.scrollWidth > od.parentElement.clientWidth) od.parentElement.scrollTo({ left: od.offsetLeft - od.parentElement.clientWidth / 2 + od.offsetWidth / 2, behavior: 'smooth' });
    const nx = slides[(idx + 1) % slides.length].querySelector('img'); if (nx) nx.loading = 'eager';
    if (user) { sfx('select', 0.35); restart(); }
  }
  function restart() { clearInterval(timer); timer = setInterval(() => { if (!paused && !document.hidden && $('#home').classList.contains('on')) go(idx + 1); }, 6500); }
  spot.querySelector('.prev').onclick = () => go(idx - 1, true);
  spot.querySelector('.next').onclick = () => go(idx + 1, true);
  dots.forEach((d) => { d.onclick = () => go(+d.dataset.i, true); });
  spot.addEventListener('pointerenter', () => { paused = true; }); spot.addEventListener('pointerleave', () => { paused = false; });
  // balayage au doigt
  let sx = null;
  spot.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  spot.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 45) go(idx + (dx < 0 ? 1 : -1), true); });
  spot.addEventListener('click', (e) => {
    const p = e.target.closest('[data-play],[data-solo]'); if (!p) return;
    sfx('confirm', 0.45); UI.play(p.dataset.play || p.dataset.solo, !!p.dataset.solo);
  });
  restart();

  /* ------------------------------------------------ cartes : clic = jouer, filtres */
  const shelf = $('#shelf');
  shelf.addEventListener('click', (e) => {
    const c = e.target.closest('[data-g]'); if (!c) return;
    const i = feat.findIndex((g) => g.id === c.dataset.g);
    if (i >= 0) { go(i, true); spot.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  const chips = (c) => {
    const I = INFO[c.dataset.g];
    if (I) { const m = c.querySelector('.meta'); m && m.insertAdjacentHTML('afterbegin', `<span class="chip">${esc(GN[I.genre] || '')}</span><span class="chip">⏱ ${esc(I.time)}</span>`); }
  };
  for (const c of shelf.querySelectorAll('[data-g]')) {
    c.tabIndex = 0; c.setAttribute('role', 'button'); c.classList.add('pick');
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } });
    chips(c);
  }

  /* ------------------------------------------------ gros jeux : des jeux beaucoup plus complets, dans leur rangée à part,
     en grand et avec leurs boutons (la liste en dessous garde les autres jeux) */
  const BIG = GAMES.filter((g) => g.big);
  const bigShelf = $('#bigShelf');
  // texte lisible sur la couleur du jeu : sombre sur une couleur claire (le jaune des Backrooms), blanc sinon
  const onAcc = (hex) => {
    const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || ''); if (!m) return '#fff';
    const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? 'var(--ink)' : '#fff';
  };
  $('#gros').hidden = !BIG.length;
  bigShelf.innerHTML = BIG.map((g) => UI.gameCard(g, {
    cls: ' big', attrs: `data-g="${g.id}" style="--acc:${esc(g.accent || '#ffc531')};--on-acc:${onAcc(g.accent || '#ffc531')}"`,
    extra: `<span class="bg-cta"><button class="btn" type="button" data-play="${g.id}" aria-label="Jouer à ${esc(g.title)} avec mes potes">▶ Jouer avec mes potes</button><button class="btn ghost" type="button" data-solo="${g.id}" aria-label="Jouer seul à ${esc(g.title)}">Jouer seul</button></span>`,
  })).join('');
  for (const c of bigShelf.querySelectorAll('[data-g]')) chips(c);
  bigShelf.addEventListener('click', (e) => {
    const p = e.target.closest('[data-play],[data-solo]'); if (!p) return;
    sfx('confirm', 0.45); UI.play(p.dataset.play || p.dataset.solo, !!p.dataset.solo);
  });

  // filtres : seulement les catégories des jeux de la liste
  const used = new Set(GAMES.filter((g) => !g.big).map((g) => (INFO[g.id] || {}).genre));
  const fl = $('#filters');
  fl.innerHTML = GENRES.filter(([k]) => k === 'all' || used.has(k)).map(([k, l]) => `<button type="button" role="tab" data-f="${k}" aria-selected="${k === 'all'}"${k === 'all' ? ' class="on"' : ''}>${esc(l)}</button>`).join('');
  fl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    sfx('toggle', 0.35);
    for (const x of fl.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }
    let n = 0;
    for (const c of shelf.querySelectorAll('[data-g]')) { const ok = b.dataset.f === 'all' || (INFO[c.dataset.g] || {}).genre === b.dataset.f; c.hidden = !ok; n += ok; }
    $('#shelfCount').textContent = n + (n > 1 ? ' jeux' : ' jeu');
  });

  /* ------------------------------------------------ « Nouveau » / « Mis à jour » d'après le journal */
  fetch('CHANGELOG.md').then((r) => r.text()).then((md) => {
    const vers = md.split(/\n## /).slice(1, 6);   // les cinq dernières versions
    const tag = {};
    for (const v of vers) for (const g of GAMES) {
      const re = new RegExp('\\*\\*' + g.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\*\\* — (.*)', 'g');
      let m; while ((m = re.exec(v))) { if (/^Nouveau jeu/i.test(m[1])) tag[g.id] = 'new'; else if (!tag[g.id]) tag[g.id] = 'upd'; }
    }
    for (const c of document.querySelectorAll('#shelf [data-g], #bigShelf [data-g]')) {
      const t = tag[c.dataset.g]; if (!t) continue;
      c.querySelector('.cv').insertAdjacentHTML('beforeend', `<span class="flag ${t}">${t === 'new' ? 'Nouveau' : 'Mis à jour'}</span>`);
    }
  }).catch(() => {});

  /* ------------------------------------------------ liens de la barre et du pied de page */
  const click = (src, dst) => { const a = $(src), b = $(dst); if (a && b) a.onclick = () => b.click(); };
  click('#navNews', '#btnNews'); click('#footNews', '#btnNews'); click('#navBoard', '#btnBoard'); click('#footNet', '#btnNetTest');

  /* ------------------------------------------------ bouton Réglages : rangé dans la barre de l'écran affiché
     (au lieu de flotter par-dessus, où il cachait « Classement » dans le salon) */
  const setBtn = $('#hubSet');
  function placeSettings() {
    const host = $('#room').classList.contains('on') ? $('#room .topbar') : $('#home .nav');
    if (setBtn && host && setBtn.parentElement !== host) host.appendChild(setBtn);
  }
  document.addEventListener('hub:screen', placeSettings); placeSettings();

  /* ------------------------------------------------ sons des boutons du Hub */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, .btn, a.linkbtn'); if (!b || b.disabled || b.closest('#spot, #filters, #bigShelf, .amenu, .gload')) return;
    if (b.id === 'btnHost' || b.id === 'btnSolo' || b.id === 'btnJoin' || /launch|go/i.test(b.id || '')) sfx('confirm', 0.45);
    else if (b.id === 'btnLeave') sfx('back', 0.45);
    else sfx('click', 0.5);
  }, true);
})();
