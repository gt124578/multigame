// odyssee/js/net/friends.js — Gestionnaire unifié des Amis et Joueurs en Ligne pour Odyssée
// Compatible 100% avec le Hub Arcadia (HubFriends, HubBridge) et fallback autonome/offline (localStorage).

const FID_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function getHubFriends() {
  try {
    if (typeof window !== 'undefined') {
      if (window.HubFriends) return window.HubFriends;
      if (window.parent && window.parent !== window && window.parent.HubFriends) {
        return window.parent.HubFriends;
      }
    }
  } catch (e) {}
  return null;
}

function getLocalSecretKey() {
  try {
    let k = localStorage.getItem('hub_fkey');
    if (!k || typeof k !== 'string' || k.length < 16) {
      const arr = new Uint8Array(16);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(arr);
      } else {
        for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
      }
      k = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('hub_fkey', k);
    }
    return k;
  } catch (e) {
    return 'odyssee_default_offline_key_42';
  }
}

export function formatFid(fid) {
  if (!fid) return '----';
  const clean = String(fid).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length <= 4) return clean;
  return clean.slice(0, 4) + '-' + clean.slice(4, 8);
}

export function parseFid(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function deriveFid(secretKey) {
  let h = 0x811c9dc5;
  const str = String(secretKey || 'hub_fkey');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let v = Math.abs(h);
  let res = '';
  for (let i = 0; i < 8; i++) {
    res += FID_CHARS[v % FID_CHARS.length];
    v = (Math.floor(v / FID_CHARS.length) ^ (i * 0x5bd1e995)) >>> 0;
  }
  return res;
}

export class FriendsManager {
  constructor(game) {
    this.game = game;
    this.hf = getHubFriends();
    this.listeners = new Map();

    if (this.hf && typeof this.hf.on === 'function') {
      this.hf.on('change', () => this.emit('change'));
      this.hf.on('request', (r) => this.emit('request', r));
      this.hf.on('me', (fid) => this.emit('me', fid));
    }
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
  }

  off(event, fn) {
    if (this.listeners.has(event)) this.listeners.get(event).delete(fn);
  }

  emit(event, ...args) {
    const set = this.listeners.get(event);
    if (set) {
      for (const fn of set) {
        try { fn(...args); } catch (e) { console.error('FriendsManager listener error:', e); }
      }
    }
  }

  /** Mon code ami (8 caractères) */
  getMyCode() {
    if (this.hf?.fid) return this.hf.fid;
    return deriveFid(getLocalSecretKey());
  }

  /** Nombre total de dresseurs connectés en direct dans ce salon/région (au moins 1 : soi-même) */
  getOnlineCount() {
    const peersCount = this.game?.link?.others ? this.game.link.others.size : 0;
    const hubPlayers = (typeof window !== 'undefined' && window.HubBridge?.players?.length) || 0;
    return Math.max(1 + peersCount, hubPlayers, 1);
  }

  /** Liste détaillée de tous les joueurs présents dans la région (soi-même + pairs) */
  getOnlinePeers() {
    const g = this.game;
    const st = g?.state || {};
    const p = g?.player || { x: 0, y: 0 };
    const myLoc = g?.locationName ? g.locationName() : 'Odyssee';
    const myCode = this.getMyCode();

    const result = [];

    // 1. Soi-même (toujours premier)
    result.push({
      id: 'me',
      isSelf: true,
      name: st.name || 'Dresseur',
      gender: st.gender || 'm',
      fid: myCode,
      map: g?.mapObj?.id || 'monde',
      locName: myLoc,
      x: Math.round(p.x || 0),
      y: Math.round(p.y || 0),
      busy: !!(g?.busy || !g?.input?.free || g?.bv?.alive),
      pvp: g?.pvpBattleInfo || null,
      tenue: st.tenue || null,
      badgesCount: (st.badges || []).filter(Boolean).length,
      isFriend: false,
    });

    // 2. Autres dresseurs dans la session
    if (g?.link?.others) {
      for (const o of g.link.others.values()) {
        const W = g.world?.maps?.monde;
        const z = (o.map === 'monde' && W?.zoneAt) ? W.zoneAt(o.x, o.y) : null;
        const loc = z?.name || (o.map && g.world?.maps?.[o.map]?.name) || 'Région d\'Odyssée';
        const isFr = this.isFriend(o.fid || o.name);

        result.push({
          id: o.id,
          isSelf: false,
          name: o.name || 'Dresseur',
          gender: o.gender || 'm',
          fid: o.fid || null,
          map: o.map || 'monde',
          locName: loc,
          x: Math.round(o.x || 0),
          y: Math.round(o.y || 0),
          busy: !!o.busy,
          pvp: o.pvp || null,
          tenue: o.tn || null,
          isFriend: isFr,
          peerObj: o,
        });
      }
    }

    return result;
  }

  /** Liste des amis enregistrés (avec état en ligne/hors-ligne) */
  getFriendsList() {
    if (this.hf?.friends && Array.isArray(this.hf.friends)) {
      return this.hf.friends.map((f) => {
        const liveInfo = this.hf.live?.get(f.fid) || null;
        return {
          fid: f.fid,
          name: f.name || 'Ami',
          color: f.color || '#3b82f6',
          isOnline: !!liveInfo,
          state: liveInfo?.st || null,
          roomCode: liveInfo?.st?.code || null,
          gameName: liveInfo?.st?.game || null,
        };
      });
    }

    // Fallback localStorage
    try {
      const raw = localStorage.getItem('hub_friends');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        return list.map((f) => ({
          fid: f.fid,
          name: f.name || 'Ami',
          color: f.color || '#3b82f6',
          isOnline: false,
          state: null,
          roomCode: null,
          gameName: null,
        }));
      }
    } catch (e) {}
    return [];
  }

  /** Demandes d'amis reçues en attente */
  getRequests() {
    if (this.hf?.requests && Array.isArray(this.hf.requests)) {
      return this.hf.requests.map((r) => ({
        fid: r.fid,
        name: r.name || 'Dresseur',
        color: r.color || '#3b82f6',
      }));
    }
    return [];
  }

  isFriend(fidOrName) {
    if (!fidOrName) return false;
    const clean = parseFid(fidOrName);
    const list = this.getFriendsList();
    return list.some((f) => f.fid === clean || f.name.toLowerCase() === String(fidOrName).toLowerCase());
  }

  async addFriend(code) {
    const clean = parseFid(code);
    if (!clean || clean.length !== 8) {
      throw new Error('Code ami invalide (8 caractères requis, ex: ABCD-1234)');
    }
    if (clean === this.getMyCode()) {
      throw new Error('Vous ne pouvez pas vous ajouter vous-même en ami !');
    }

    if (this.hf && typeof this.hf.request === 'function') {
      this.hf.request(clean);
      this.emit('change');
      return true;
    }

    // Fallback stockage local
    try {
      const list = this.getFriendsList();
      if (!list.some((f) => f.fid === clean)) {
        list.push({ fid: clean, name: 'Dresseur ' + clean.slice(0, 4), color: '#3b82f6' });
        localStorage.setItem('hub_friends', JSON.stringify(list));
        this.emit('change');
      }
      return true;
    } catch (e) {
      throw new Error('Impossible d\'enregistrer l\'ami');
    }
  }

  async acceptRequest(fid) {
    if (this.hf && typeof this.hf.accept === 'function') {
      this.hf.accept(fid);
      this.emit('change');
      return true;
    }
    return false;
  }

  async declineRequest(fid) {
    if (this.hf && typeof this.hf.decline === 'function') {
      this.hf.decline(fid);
      this.emit('change');
      return true;
    }
    return false;
  }

  async removeFriend(fid) {
    const clean = parseFid(fid);
    if (this.hf && typeof this.hf.remove === 'function') {
      this.hf.remove(clean);
      this.emit('change');
      return true;
    }

    try {
      let list = this.getFriendsList();
      list = list.filter((f) => f.fid !== clean);
      localStorage.setItem('hub_friends', JSON.stringify(list));
      this.emit('change');
      return true;
    } catch (e) {
      return false;
    }
  }

  async inviteFriend(fid) {
    const roomCode = (typeof window !== 'undefined' && window.HubBridge?.info?.code) || null;
    if (this.hf && typeof this.hf.invite === 'function') {
      this.hf.invite(fid, roomCode, 'odyssee');
      return true;
    }
    return false;
  }

  joinRoom(code) {
    if (!code) return;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('code', code);
      window.location.href = url.toString();
    }
  }
}

export function getFriendsManager(game) {
  if (!game._friendsManager) {
    game._friendsManager = new FriendsManager(game);
  }
  return game._friendsManager;
}
