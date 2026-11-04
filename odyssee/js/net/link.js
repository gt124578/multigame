// odyssee/js/net/link.js — liaison entre les joueurs d'un même salon, par le Hub (sans serveur dédié).
// Chacun garde sa propre partie ; on partage seulement :
//   - sa position (carte, case, direction) pour se voir marcher dans la région ;
//   - des invitations (échange, combat) et les messages de ces sessions, livrés de joueur à joueur.
// Sans Hub (jeu ouvert seul), la liaison est inactive et tout le reste du jeu fonctionne pareil.

const HEARTBEAT_MS = 1500;  // position renvoyée au moins aussi souvent
const STALE_MS = 6000;      // un joueur silencieux depuis plus longtemps disparaît de la carte

export class Link {
  constructor(H) {
    this.H = H;
    this.enabled = !!(H && H.embedded);
    this.others = new Map(); // id → { id, name, color, gender, map, x, y, dir, run, busy, t }
    this.waiters = [];       // attentes de messages de session
    this.inbox = [];         // messages de session arrivés avant qu'on les attende
    this.onRequest = null;   // (from, msg) → appelé à la réception d'une invitation
    this.onCard = null;      // () → fiche dresseur envoyée à qui la demande
    this.onSpectate = null;  // (from, msg) → gestion des spectateurs d'un combat en cours
    this.lastSent = '';
    this.lastSentAt = 0;
    this.me = null;          // () → { map, x, y, dir, run, busy, name, gender } ou null (pas encore en jeu)
    if (!this.enabled) return;
    H.on('msg', (from, m) => this.receive(from, m));
    H.on('roster', (players) => {
      const ids = new Set((players || []).map((p) => String(p.id)));
      for (const id of [...this.others.keys()]) if (!ids.has(String(id))) this.drop(id);
    });
  }

  get myId() { return this.H?.info?.myId || 0; }
  playerInfo(id) { return (this.H?.players || []).find((p) => String(p.id) === String(id)) || null; }
  nameOf(id) { return this.others.get(String(id))?.name || this.playerInfo(id)?.name || 'Dresseur'; }

  drop(id) {
    this.others.delete(String(id));
    this.inbox = this.inbox.filter((q) => String(q.from) !== String(id));
    for (const w of [...this.waiters]) if (String(w.from) === String(id)) w.resolve({ t: 'left' });
  }

  /* ---------------- position ---------------- */
  /** à appeler à chaque image : n'envoie que si quelque chose a changé, ou pour le battement de cœur */
  tick(now = Date.now()) {
    if (!this.enabled || !this.me) return;
    const p = this.me();
    if (!p) return;
    for (const [id, o] of this.others) if (now - o.t > STALE_MS) this.others.delete(id);
    const key = `${p.map}|${p.x}|${p.y}|${p.dir}|${p.run ? 1 : 0}|${p.busy ? 1 : 0}`;
    if (key === this.lastSent && now - this.lastSentAt < HEARTBEAT_MS) return;
    this.lastSent = key; this.lastSentAt = now;
    this.H.send('all', { t: 'pos', ...p }, { volatile: true });
  }
  /** en arrivant dans la région : demande aux autres où ils sont */
  hello() { if (this.enabled) this.H.send('all', { t: 'hello' }); this.lastSent = ''; }
  bye() { if (this.enabled) this.H.send('all', { t: 'bye' }); }

  receive(from, m) {
    if (!m || typeof m !== 'object' || String(from) === String(this.myId)) return;
    if (m.t === 'pos') {
      if (typeof m.map !== 'string' || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
      const info = this.playerInfo(from);
      const prev = this.others.get(String(from));
      this.others.set(String(from), {
        id: from, name: String(m.name || info?.name || 'Dresseur').slice(0, 12), color: info?.color || '#5a88c8',
        gender: m.gender === 'f' ? 'f' : 'm', tn: typeof m.tn === 'string' && m.tn.length < 20 ? m.tn : '', map: m.map, x: m.x, y: m.y, dir: m.dir || 'down', run: !!m.run, busy: !!m.busy, t: Date.now(),
        // position affichée (interpolée) : on la garde d'un message à l'autre sur la même carte
        dx: prev && prev.map === m.map ? prev.dx : m.x, dy: prev && prev.map === m.map ? prev.dy : m.y, step: prev?.step || 0,
        pvp: m.pvp && typeof m.pvp === 'object' ? m.pvp : null,
      });
      return;
    }
    if (m.t === 'hello') { this.lastSent = ''; return; }
    if (m.t === 'bye') { this.drop(from); return; }
    if (m.t === 'card?') { const c = this.onCard?.(); this.send(from, { t: 'card', rid: m.rid, card: c }); return; }
    if (m.t === 'spec_join' || m.t === 'spec_leave') { if (this.onSpectate && this.onSpectate(from, m)) return; }
    if (m.t === 'req') {
      if (this.onRequest) this.onRequest(from, m);
      else this.send(from, { t: 'rep', rid: m.rid, ok: false, why: 'busy' });
      return;
    }
    // message de session : à la première attente qui le reconnaît, sinon mis de côté
    const w = this.waiters.find((q) => String(q.from) === String(from) && q.match(m));
    if (w) { w.resolve(m); return; }
    const now = Date.now();
    this.inbox = this.inbox.filter((q) => now - q.at < 300000);
    this.inbox.push({ from, m, at: now });
  }

  send(to, m) { if (this.enabled) this.H.send(to, m); }

  /**
   * attend un message de `from` qui satisfait `match`.
   * Renvoie le message, ou { t: 'left' } (joueur parti), { t: 'timeout' }, { t: 'abort' } (abort() appelé).
   */
  wait(from, match, ms = 120000) {
    return new Promise((resolve) => {
      const w = {
        from, match,
        resolve: (v) => { if (w.done) return; w.done = true; clearTimeout(w.timer); this.waiters = this.waiters.filter((q) => q !== w); resolve(v); },
      };
      const k = this.inbox.findIndex((q) => String(q.from) === String(from) && match(q.m));
      if (k >= 0) { const [q] = this.inbox.splice(k, 1); resolve(q.m); return; }
      if (!this.others.has(String(from)) && !this.playerInfo(from)) { resolve({ t: 'left' }); return; }
      w.timer = setTimeout(() => w.resolve({ t: 'timeout' }), ms);
      this.waiters.push(w);
    });
  }
  /** interrompt les attentes en cours vers ce joueur (bouton Annuler) */
  abort(from) { for (const w of [...this.waiters]) if (String(w.from) === String(from)) w.resolve({ t: 'abort' }); }

  /** joueur visible sur cette case de cette carte (position cible, ou position affichée arrondie) */
  playerAt(map, x, y) {
    for (const o of this.others.values()) {
      if (o.map !== map) continue;
      if ((o.x === x && o.y === y) || (Math.round(o.dx) === x && Math.round(o.dy) === y)) return o;
    }
    return null;
  }
}

/** générateur pseudo-aléatoire à graine (le même des deux côtés d'un combat) */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newId = () => Math.random().toString(36).slice(2, 10);
