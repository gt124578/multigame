// Mystère Mystère : l'interface par-dessus la 3D (rôle, chrono, pièces, arme en main, annonces, repère du revolver tombé)
// et les écrans en HTML : accueil, carte du rôle, pause, fin de manche.
import { ROLE, COIN_BAG, CD } from '../engine/sim.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (s) => document.querySelector(s);
const mmss = (t) => { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const ROLE_ICON = { m: '🔪', s: '⭐', i: '🛡️', h: '🦸', x: '🧭' };
export const ROLE_COLOR = { m: '#ff4d5e', s: '#4da3ff', i: '#3ddc84', h: '#ffc531', x: '#c58bff' };
const ROLE_GOAL = {
  m: ['Élimine tout le monde', 'Couteau caché (1), sorti (2 ou clic). Clic : frapper · clic droit : lancer · F : couper le courant. Sans souris : F frapper · tenir G lancer · C couper le courant.'],
  s: ['Abats le meurtrier', 'Clic pour sortir le revolver, clic pour tirer. Toucher un innocent te sonne et te fait lâcher l\'arme.'],
  i: ['Survis jusqu\'à l\'aube', 'Ramasse les pièces, ouvre l\'œil, fuis le couteau. Si le revolver tombe, cours le prendre !'],
  h: ['Abats le meurtrier', 'Tu as ramassé le revolver : à toi de jouer les héros.'],
  x: ['Visite le manoir', 'Pas de rôle, pas de chrono : essaie le couteau (2) et le revolver (3), trouve les passages secrets.'],
};
export const roleGoal = (r) => ROLE_GOAL[r] || ROLE_GOAL.i;

export class HUD {
  constructor() {
    this.root = $('#hud');
    this.el = {};
    for (const id of ['banner', 'toast', 'feed', 'prompt', 'ptxt', 'clock', 'role', 'coins', 'slots', 'stam', 'gunmark', 'spec', 'card', 'vig', 'board', 'lockHint', 'cross', 'ring', 'note', 'stick', 'hit', 'charge']) this.el[id] = $(`#${id}`);
    this.bannerT = 0; this.toastT = 0; this.cardT = 0; this.sigSlots = ''; this.sigBoard = ''; this.hitT = 0; this.lastTick = -1;
  }
  show(on) { this.root.hidden = !on; }
  banner(html, dur = 2, cls = '') {
    // la carte du rôle est encore à l'écran : l'annonce attend qu'elle parte
    if (this.cardT > 0.45 && !this.el.card.hidden) { this.pendingBanner = [html, dur, cls]; return; }
    const b = this.el.banner;
    b.innerHTML = html; b.className = 'banner ' + cls; b.hidden = false;
    void b.offsetWidth; b.classList.add('in');
    this.bannerT = dur;
  }
  toast(msg, dur = 2.5) { this.el.toast.textContent = msg; this.el.toast.hidden = false; this.toastT = dur; }
  feed(html, cls = '') {
    const d = document.createElement('div'); d.className = 'fi ' + cls; d.innerHTML = html;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 5200); setTimeout(() => d.remove(), 6000);
  }
  hitmark() { this.hitT = 0.25; }
  roleCard(role, name) {
    const [a, b] = roleGoal(role);
    this.el.card.innerHTML = `<div class="rc" style="--c:${ROLE_COLOR[role]}"><small>Tu es</small><div class="ri">${ROLE_ICON[role]}</div><h2>${role === 'i' ? 'Innocent' : ROLE[role]}</h2><p class="g">${a}</p><p class="h">${b}</p></div>`;
    this.el.card.hidden = false; this.el.card.classList.remove('out'); this.cardT = 5.2;
  }
  update(v, dt0, o) {
    // les annonces suivent l'horloge réelle, même si l'image rame
    const now = performance.now(), dt = Math.min(0.5, this.lastNow ? (now - this.lastNow) / 1000 : dt0); this.lastNow = now;
    const e = this.el, w = v.w, r = v.real, mine = v.mine;
    if ((this.bannerT -= dt) <= 0 && !e.banner.hidden) { e.banner.classList.remove('in'); if (this.bannerT < -0.4) e.banner.hidden = true; }
    if ((this.toastT -= dt) <= 0) e.toast.hidden = true;
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT < 0.4) e.card.classList.add('out'); if (this.cardT <= 0) e.card.hidden = true; }
    if (this.pendingBanner && !(this.cardT > 0.45)) { const pb = this.pendingBanner; this.pendingBanner = null; this.banner(...pb); }
    this.hitT = Math.max(0, this.hitT - dt); e.hit.style.opacity = (this.hitT * 4).toFixed(2);
    // chrono
    if (w.mode === 'explore') e.clock.textContent = 'Découverte';
    else if (w.ph === 'intro') e.clock.textContent = mmss(w.dur);
    else e.clock.textContent = mmss(w.t);
    e.clock.classList.toggle('warn', w.ph === 'play' && w.t >= 0 && w.t < 30);
    // rôle et pièces
    const role = o.role;
    if (role) { e.role.hidden = false; e.role.style.setProperty('--c', ROLE_COLOR[role]); e.role.innerHTML = `${ROLE_ICON[role]} ${role === 'i' ? 'Innocent' : ROLE[role]}`; } else e.role.hidden = true;
    e.coins.innerHTML = `<b>🪙</b> ${o.coins ?? 0}<small>/${COIN_BAG}</small>`;
    // note du haut : shérif tombé, revolver au sol, coupure
    const notes = [];
    if (w.bo > 0) notes.push('<span class="n bo">💡 Coupure de courant</span>');
    if (w.guns.length) notes.push('<span class="n gun">🔫 Le revolver est au sol !</span>');
    else if (w.sheriffDead) notes.push('<span class="n">⭐ Le shérif est tombé</span>');
    const ns = notes.join('');
    if (ns !== this.sigNote) { this.sigNote = ns; e.note.innerHTML = ns; }
    // arme en main
    const alive = r && !r.dead && !r.spec && mine;
    if (alive && w.ph !== 'over') {
      const has = o.weapon;
      const cdk = role === 'm' ? Math.max(o.cd.stab / CD.stab, 0) : o.cd.gun / CD.gun;
      const sig = [role, has, r.held, o.hasKnife, Math.ceil(o.cd.bo), w.mode, o.ws, o.kb].join('|');
      if (sig !== this.sigSlots) {
        this.sigSlots = sig;
        let h = `<div class="slot ${!r.held ? 'on' : ''}"><kbd>1</kbd><b>✋</b><small>Mains vides</small></div>`;
        if (w.mode === 'explore') {
          h += `<div class="slot ${r.held === 'knife' ? 'on' : ''}"><kbd>2</kbd><b>🔪</b><small>Couteau</small></div><div class="slot ${r.held === 'gun' ? 'on' : ''}"><kbd>3</kbd><b>🔫</b><small>Revolver</small></div>`;
        } else if (role === 'm') {
          h += `<div class="slot ${r.held === 'knife' ? 'on' : ''} ${o.hasKnife ? '' : 'off'}"><kbd>2</kbd><b>🔪</b><small>${o.hasKnife ? 'Couteau' : 'Lancé…'}</small></div>`;
          h += `<div class="slot pw ${o.cd.bo > 0 ? 'off' : 'rdy'}"><kbd>${o.kb ? 'C' : 'F'}</kbd><b>💡</b><small>${o.cd.bo > 0 ? `Coupure · ${Math.ceil(o.cd.bo)} s` : 'Coupure'}</small></div>`;
        } else if (has) h += `<div class="slot ${r.held === 'gun' ? 'on' : ''}"><kbd>2</kbd><b>🔫</b><small>Revolver</small></div>`;
        e.slots.innerHTML = h;
      }
      e.slots.hidden = false;
      e.ring.style.setProperty('--k', r.held ? (1 - Math.min(1, cdk)).toFixed(3) : 1);
      e.ring.hidden = !r.held || cdk <= 0;
      e.stam.hidden = (o.stam ?? 100) >= 99;
      e.stam.style.setProperty('--k', ((o.stam ?? 100) / 100).toFixed(3));
      e.cross.hidden = false;
      // jauge du lancer (G tenu, mode sans souris)
      e.charge.hidden = o.charge == null;
      if (o.charge != null) e.charge.style.setProperty('--k', o.charge.toFixed(3));
    } else { e.slots.hidden = true; e.ring.hidden = true; e.stam.hidden = true; e.charge.hidden = true; e.cross.hidden = !mine; }
    e.cross.classList.toggle('armed', !!(r && r.held));
    // invite
    if (o.prompt) { e.prompt.hidden = false; e.ptxt.innerHTML = o.prompt; } else e.prompt.hidden = true;
    // spectateur
    if (!mine && v.me) { e.spec.hidden = false; e.spec.innerHTML = `<span>Tu regardes</span> <b style="--c:${esc(v.me.color)}">${esc(v.me.name)}</b> <span class="k"><kbd>←</kbd><kbd>→</kbd> ou clic : changer</span>`; }
    else e.spec.hidden = true;
    // repère du revolver tombé
    if (o.gunScreen) { const g = o.gunScreen; e.gunmark.hidden = false; e.gunmark.style.transform = `translate(${g.x}px, ${g.y}px)`; e.gunmark.classList.toggle('edge', g.edge); e.gunmark.querySelector('small').textContent = `${Math.round(g.d)} m`; }
    else e.gunmark.hidden = true;
    // assombrissement : coupure, sonné
    e.vig.className = 'vig' + (w.bo > 0 ? ' bo' : '') + (o.stun ? ' stun' : '');
    // tableau des joueurs (Tab)
    e.board.hidden = !o.board;
    if (o.board) {
      const list = v.players.filter((p) => !p.spec).map((p) => `<tr class="${p.dead ? 'dead' : ''}"><td><i style="--c:${esc(p.color)}"></i>${esc(p.name)}${p.bot ? ' <em>bot</em>' : ''}</td><td>${p.dead ? '💀' : '❤️'}</td><td>🪙 ${p.coins ?? 0}</td></tr>`).join('');
      if (list !== this.sigBoard) { this.sigBoard = list; e.board.innerHTML = `<h3>Invités du manoir</h3><table>${list}</table>`; }
    }
    // stick tactile
    const st = o.stick;
    if (st) { e.stick.hidden = false; e.stick.style.left = st.ox + 'px'; e.stick.style.top = st.oy + 'px'; const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy), k = d > 50 ? 50 / d : 1; e.stick.firstElementChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`; } else e.stick.hidden = true;
    e.lockHint.hidden = !o.lockHint;
  }
}

// ------------------------------------------------------------------ écrans
export function briefingHtml({ host, squad, cfg, embedded, bots, total }) {
  const humans = squad.filter((p) => p.ready);
  const seg = (k, label, opts) => `<div class="opt"><span>${label}</span><div class="seg">${opts.map(([v, t]) => `<button data-k="${k}" data-v="${v}" class="${String(cfg[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
  const people = squad.map((p) => `<li class="${p.ready ? '' : 'wait'}"><i style="--c:${esc(p.color)}"></i>${esc(p.name)}${p.me ? ' <em>(toi)</em>' : ''}${p.ready ? '' : ' <em>arrive…</em>'}</li>`).join('') + (bots > 0 ? `<li class="bots">🤖 + ${bots} bot${bots > 1 ? 's' : ''}</li>` : '');
  return `<div class="brief">
    <div class="logo"><span>Mystère</span><b>Mystère</b></div>
    <p class="sub">Un manoir, une nuit, un meurtrier caché parmi les invités.</p>
    <div class="roles">
      <div class="r m"><b>🔪 Meurtrier</b><span>Élimine tout le monde sans te faire voir. Lance ton couteau, coupe le courant.</span></div>
      <div class="r s"><b>⭐ Shérif</b><span>Démasque-le et abats-le. Une bavure te coûte ton revolver.</span></div>
      <div class="r i"><b>🛡️ Innocents</b><span>Ramasse l'or, survis jusqu'à l'aube, récupère le revolver tombé.</span></div>
    </div>
    <div class="cols">
      <div class="who"><h3>Invités · ${total}</h3><ul>${people}</ul></div>
      ${host ? `<div class="set"><h3>Réglages</h3>
        ${seg('mode', 'Mode', [['classic', 'Manches'], ['explore', 'Découverte']])}
        ${cfg.mode === 'explore' ? '' : seg('bots', 'Bots en plus', [[0, '0'], [2, '2'], [4, '4'], [6, '6'], [8, '8']])}
        ${cfg.mode === 'explore' ? '' : seg('time', 'Durée', [[120, '2 min'], [180, '3 min'], [240, '4 min']])}
        ${cfg.mode === 'explore' ? '' : seg('level', 'Bots', [['facile', 'Facile'], ['normal', 'Moyen'], ['expert', 'Difficile']])}
      </div>` : `<div class="set"><h3>En attente</h3><p class="wait">L'hôte lance la manche.</p></div>`}
    </div>
    ${cfg.mode !== 'explore' && total < 3 ? '<p class="warn">Il faut au moins trois invités : des bots compléteront la table.</p>' : ''}
    <div class="btns">${host ? '<button class="btn go" id="btnGo">Lancer la manche</button>' : ''}${embedded ? '<button class="btn" id="btnExit">Retour au salon</button>' : ''}</div>
    <p class="keys"><kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> se déplacer · <kbd>Maj</kbd> courir · <kbd>Espace</kbd> sauter · <kbd>1</kbd>/<kbd>2</kbd> ou molette : ranger, sortir l'arme · <kbd>Clic</kbd> frapper, tirer · <kbd>Clic droit</kbd> lancer · <kbd>E</kbd> passages secrets · <kbd>Tab</kbd> invités · pas de souris ? Réglages → Sans souris</p>
  </div>`;
}
export function menuHtml({ solo }) {
  return `<div class="menu"><h2>${solo ? 'Pause' : 'Menu'}</h2>
    <button class="btn go" id="btnResume">Reprendre</button>
    <button class="btn" id="btnSettings">Réglages</button>
    <button class="btn" id="btnQuit">Quitter</button></div>`;
}
const HOW = { knife: 'poignardé', throw: 'couteau lancé', gun: 'abattu' };
export function endHtml({ w, ranking, myId, canReplay, embedded, reason, auto, totals }) {
  if (reason === 'host') return `<div class="end"><h2>Liaison perdue</h2><p class="sub">L'hôte a quitté la partie.</p><div class="btns">${embedded ? '<button class="btn" id="btnExit">Retour au salon</button>' : ''}</div></div>`;
  const me = ranking.find((p) => p.id === myId);
  const mWin = w.win === 'm';
  const killer = ranking.find((p) => p.role === 'm');
  const hero = w.hero != null ? ranking.find((p) => p.id === w.hero) : null;
  const why = mWin ? 'Le meurtrier a éliminé tout le monde.' : w.why === 'time' ? 'L\'aube se lève : les secours arrivent.' : hero ? `${esc(hero.name)} a abattu le meurtrier.` : 'Le meurtrier est tombé.';
  const rows = ranking.map((p, k) => `<tr class="${p.id === myId ? 'me' : ''} ${p.st === 'dead' ? 'dead' : ''}"><td>${k + 1}</td><td><i style="--c:${esc(p.color)}"></i>${esc(p.name)}</td><td class="role" style="--c:${ROLE_COLOR[p.role]}">${ROLE_ICON[p.role]} ${p.role === 'i' ? 'Innocent' : ROLE[p.role]}</td><td>${p.st === 'dead' ? `💀 ${HOW[p.how] || ''}` : 'vivant'}</td><td>🪙 ${p.coins}</td><td><b>${p.score}</b>${totals && totals[p.id] != null ? `<small> · ${totals[p.id]}</small>` : ''}</td></tr>`).join('');
  return `<div class="end ${mWin ? 'm' : 'i'}">
    <h2>${mWin ? '🔪 Victoire du meurtrier' : '🛡️ Victoire des innocents'}</h2>
    <p class="sub">${why}${killer ? ` Le meurtrier était <b style="color:${esc(killer.color)}">${esc(killer.name)}</b>.` : ''}</p>
    ${me ? `<p class="you ${me.won ? 'won' : 'lost'}">${me.won ? 'Tu as gagné !' : 'Perdu…'} <b>+${me.score}</b> points</p>` : ''}
    <table class="rank"><tr><th></th><th>Invité</th><th>Rôle</th><th></th><th>Or</th><th>Points</th></tr>${rows}</table>
    <div class="btns">${canReplay ? `<button class="btn go" id="btnAgain">Manche suivante${auto ? ` <span id="autoT">(${auto})</span>` : ''}</button>` : '<p class="wait">L\'hôte lance la manche suivante…</p>'}${embedded ? '<button class="btn" id="btnExit">Retour au salon</button>' : ''}</div>
  </div>`;
}
