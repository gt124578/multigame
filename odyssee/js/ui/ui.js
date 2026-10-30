// odyssee/js/ui/ui.js — briques d'interface façon DS : boîte de dialogue, choix, listes, bandeau de lieu, fondus
export const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor(root, input, sound) {
    this.root = root; this.input = input; this.sound = sound;
    this.textSpeed = 2;
    try { this.textSpeed = +(localStorage.getItem('odyssee-textspeed') ?? 2); } catch (e) {}
    this.fadeEl = el('div', 'fade'); root.appendChild(this.fadeEl);
    this.flashEl = el('div', 'flash'); root.appendChild(this.flashEl);
  }

  /* ---------------- dialogue ---------------- */
  /** affiche une ou plusieurs pages ; renvoie quand le joueur a tout lu */
  async say(text, o = {}) {
    const pages = [].concat(text).flatMap((t) => String(t).split('\n')).filter((p) => p.length);
    const box = o.box || this.dialogBox(o);
    for (let i = 0; i < pages.length; i++) await this.typePage(box, pages[i], { keep: o.keep && i === pages.length - 1, auto: o.auto, last: i === pages.length - 1 && o.noWaitLast });
    if (!o.keep && !o.box) this.closeDialog();
    return box;
  }
  dialogBox(o = {}) {
    if (!this.dlg) {
      this.dlg = el('div', 'dlg box');
      this.dlg.innerHTML = '<div class="dlg-name"></div><div class="dlg-txt"></div><div class="dlg-arrow">▼</div>';
      this.root.appendChild(this.dlg);
    }
    const nm = this.dlg.querySelector('.dlg-name'); nm.textContent = o.speaker || ''; nm.style.display = o.speaker ? '' : 'none';
    this.dlg.classList.toggle('battle', !!o.battle);
    // portrait de celui qui parle (hors combat), à gauche de la boîte
    const src = !o.battle && o.speaker && this.faceOf ? this.faceOf(o.speaker) : null;
    let face = this.dlg.querySelector('.dlg-face');
    if (src) { if (!face) { face = el('img', 'dlg-face'); face.alt = ''; this.dlg.appendChild(face); } if (face.getAttribute('src') !== src) face.src = src; }
    else if (face) face.remove();
    this.dlg.classList.toggle('has-face', !!src);
    return this.dlg;
  }
  closeDialog() { if (this.dlg) { this.dlg.remove(); this.dlg = null; } }
  typePage(box, text, o = {}) {
    return new Promise((resolve) => {
      const txt = box.querySelector('.dlg-txt'), arrow = box.querySelector('.dlg-arrow');
      txt.textContent = ''; arrow.style.visibility = 'hidden';
      let i = 0, done = false, closed = false;
      const speed = [1, 2, 4, 99][this.textSpeed] ?? 2;
      const finish = () => { done = true; txt.textContent = text; if (!o.last) arrow.style.visibility = 'visible'; };
      const iv = setInterval(() => {
        if (done) return;
        i += speed; txt.textContent = text.slice(0, i);
        if (i >= text.length) { clearInterval(iv); finish(); if (o.auto) setTimeout(end, o.auto); if (o.last) end(); }
      }, 16);
      const end = () => { if (closed) return; closed = true; clearInterval(iv); pop(); resolve(); };
      const pop = this.input.push((k) => {
        if (k !== 'a' && k !== 'b') return;
        if (!done) { clearInterval(iv); finish(); if (o.last) end(); else if (o.auto) setTimeout(end, Math.min(o.auto, 400)); return; }
        if (!o.auto) this.sound.sfx('blip');
        end();
      });
    });
  }

  /** question avec choix (Oui / Non…) ; renvoie l'index choisi, -1 si annulé */
  async ask(text, options, o = {}) {
    const box = this.dialogBox(o);
    if (text) await this.typePage(box, text, { last: true });
    const r = await this.list({ items: options.map((label) => ({ label })), cls: 'choice', cancel: o.cancel ?? options.length - 1 });
    if (!o.keep) this.closeDialog();
    return r;
  }
  async yesNo(text, o = {}) { return (await this.ask(text, ['Oui', 'Non'], o)) === 0; }

  /**
   * liste au clavier. items: [{ label, right, disabled }]
   * o.cancel : valeur renvoyée sur B (null = B ignoré). o.onMove(i), o.onKey(k, i) → true pour consommer
   */
  list(o) {
    return new Promise((resolve) => {
      const wrap = el('div', 'box list ' + (o.cls || ''));
      if (o.title) wrap.appendChild(el('div', 'list-title', esc(o.title)));
      const ul = el('div', 'list-items'); wrap.appendChild(ul);
      const rows = o.items.map((it) => {
        const r = el('div', 'list-row' + (it.disabled ? ' off' : ''));
        r.innerHTML = `<span class="cur">▶</span><span class="lbl">${it.html ?? esc(it.label)}</span>${it.right != null ? `<span class="rgt">${esc(it.right)}</span>` : ''}`;
        ul.appendChild(r); return r;
      });
      (o.parent || this.root).appendChild(wrap);
      let i = Math.max(0, Math.min(o.items.length - 1, o.start || 0));
      const show = () => { rows.forEach((r, k) => r.classList.toggle('on', k === i)); rows[i]?.scrollIntoView({ block: 'nearest' }); o.onMove?.(i, wrap); };
      show();
      const close = (v) => { pop(); if (!o.keep) wrap.remove(); resolve(v); };
      const pop = this.input.push((k) => {
        if (o.onKey && o.onKey(k, i, { close, refresh: show, wrap, rows })) return;
        const n = o.items.length;
        if (k === 'up') { i = (i - 1 + n) % n; this.sound.sfx('blip'); show(); }
        else if (k === 'down') { i = (i + 1) % n; this.sound.sfx('blip'); show(); }
        else if (k === 'a') { if (o.items[i]?.disabled) { this.sound.sfx('bump'); return; } this.sound.sfx('select'); close(i); }
        else if (k === 'b' && o.cancel !== null && o.cancel !== undefined) { this.sound.sfx('cancel'); close(o.cancel); }
      });
      wrap._close = close;
    });
  }

  /** choix d'une quantité (gauche/droite ±1, haut/bas ±10) */
  quantity(max, o = {}) {
    return new Promise((resolve) => {
      const w = el('div', 'box qty'); this.root.appendChild(w);
      let q = 1;
      const draw = () => { w.innerHTML = `<span>× ${String(q).padStart(2, '0')}</span>${o.price ? `<span class="rgt">${(q * o.price).toLocaleString('fr-FR')} ₽</span>` : ''}`; };
      draw();
      const pop = this.input.push((k) => {
        if (k === 'up' || k === 'right') q = q >= max ? 1 : q + (k === 'up' ? 1 : 1);
        else if (k === 'down' || k === 'left') q = q <= 1 ? max : q - 1;
        else if (k === 'a') { pop(); w.remove(); this.sound.sfx('select'); resolve(q); return; }
        else if (k === 'b') { pop(); w.remove(); this.sound.sfx('cancel'); resolve(0); return; }
        this.sound.sfx('blip'); draw();
      });
    });
  }

  /** saisie d'un nom (clavier de l'ordinateur) */
  nameEntry(title, def) {
    return new Promise((resolve) => {
      const w = el('div', 'screen name-screen');
      w.innerHTML = `<div class="box name-box"><div class="list-title">${esc(title)}</div><input class="name-in" maxlength="10" spellcheck="false" autocomplete="off"><div class="hint">Tape un nom puis appuie sur Entrée</div></div>`;
      this.root.appendChild(w);
      const inp = w.querySelector('input'); inp.value = def || ''; setTimeout(() => { inp.focus(); inp.select(); }, 30);
      const pop = this.input.push(() => {});
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const v = inp.value.trim() || def; pop(); w.remove(); this.sound.sfx('select'); resolve(v); }
        e.stopPropagation();
      });
      inp.addEventListener('blur', () => setTimeout(() => inp.isConnected && inp.focus(), 10));
    });
  }

  /* ---------------- effets d'écran ---------------- */
  fade(black, ms = 280) {
    this.fadeEl.style.transition = `opacity ${ms}ms linear`;
    this.fadeEl.style.opacity = black ? 1 : 0;
    return wait(ms + 20);
  }
  async flash(times = 3, color = '#fff', ms = 90) {
    this.flashEl.style.background = color;
    for (let i = 0; i < times; i++) { this.flashEl.style.opacity = 1; await wait(ms); this.flashEl.style.opacity = 0; await wait(ms); }
  }
  /** bandeau du nom du lieu (en haut à gauche, comme sur DS) */
  banner(name) {
    if (this.bannerEl) this.bannerEl.remove();
    const b = el('div', 'banner', `<span>${esc(name)}</span>`); this.root.appendChild(b); this.bannerEl = b;
    requestAnimationFrame(() => b.classList.add('in'));
    clearTimeout(this.bannerT); this.bannerT = setTimeout(() => { b.classList.remove('in'); setTimeout(() => b.remove(), 400); }, 2200);
  }
  /** petit bouton gris en bas de l'écran : ouvre le panneau des touches (aussi avec H) */
  helpButton() {
    const bar = el('div', 'keybar'); this.root.appendChild(bar);
    const btn = el('button', 'keyhint', '<b>H</b> Touches'); btn.type = 'button'; btn.tabIndex = -1;
    // bouton Échap : ouvre le menu (ou revient en arrière), utile à la souris ou au doigt
    const escBtn = el('button', 'keyhint', '<b>Échap</b> Menu'); escBtn.type = 'button'; escBtn.tabIndex = -1;
    escBtn.addEventListener('click', () => { if (!this.input.helpOpen) this.input.emit('b'); });
    bar.append(btn, escBtn);
    const panel = el('div', 'keypanel box', `<div class="list-title">Commandes</div><table class="kv">
      <tr><td>Se déplacer</td><td><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> ou <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd></td></tr>
      <tr><td>Courir</td><td><kbd>Maj</kbd> maintenue</td></tr>
      <tr><td>Parler, interagir, valider</td><td><kbd>F</kbd> (ou <kbd>Espace</kbd>, <kbd>Entrée</kbd>)</td></tr>
      <tr><td>Annuler, revenir</td><td><kbd>Échap</kbd> (ou <kbd>Retour arrière</kbd>)</td></tr>
      <tr><td>Menu (équipe, sac, sauvegarde…)</td><td><kbd>Échap</kbd>, <kbd>Tab</kbd> ou <kbd>M</kbd></td></tr>
      <tr><td>Carte de la région</td><td><kbd>C</kbd></td></tr>
      <tr><td>Capacités de terrain</td><td>face à un petit arbre, un rocher fissuré ou à l'eau : <kbd>F</kbd></td></tr>
      <tr><td>Sauvegarder</td><td><kbd>Échap</kbd> → SAUVER (la partie se sauve aussi à chaque porte)</td></tr>
      <tr><td>Afficher / cacher cette aide</td><td><kbd>H</kbd></td></tr></table><div class="hint">Appuie sur H, F ou Échap pour fermer</div>`);
    this.root.appendChild(panel);
    const toggle = () => { const on = !panel.classList.contains('on'); panel.classList.toggle('on', on); this.input.helpOpen = on; this.sound.sfx(on ? 'select' : 'cancel'); };
    btn.addEventListener('click', toggle);
    this.input.onHelp = toggle;
  }
  toast(text, ms = 1600) {
    const t = el('div', 'toast box', esc(text)); this.root.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
}
