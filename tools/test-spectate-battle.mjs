import assert from 'node:assert/strict';

// Setup minimal browser mocks for node environment before loading game modules
globalThis.location = new URL('http://localhost:3000/index.html');
globalThis.window = globalThis;
globalThis.document = {
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    className: '',
    style: {},
    dataset: {},
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    remove: () => {}
  }),
  querySelector: () => null,
  querySelectorAll: () => []
};

// Dynamically import modules after globals are set
const { Link } = await import('../odyssee/js/net/link.js');
const { installSocial, exportMonForSpectator } = await import('../odyssee/js/net/social.js');
const { BattleView } = await import('../odyssee/js/ui/battleView.js');

console.log('Testing Odyssée Live Battle Spectating System (v3.97)...');

// ============================================================================
// 1. Link protocol tests: pvp field in pos & spec_join / spec_leave routing
// ============================================================================
{
  const mockHub = {
    info: { myId: 'my_id' },
    send: () => {},
    on: () => {},
    players: []
  };
  const link = new Link(mockHub);
  assert.equal(link.onSpectate, null, 'link.onSpectate should be initialized to null');

  let spectateEvent = null;
  link.onSpectate = (from, msg) => {
    spectateEvent = { from, msg };
  };

  // Simulate receiving pos with pvp info
  link.receive('peer_alice', {
    t: 'pos',
    x: 10,
    y: 12,
    map: 'bourg-palette',
    name: 'Alice',
    pvp: {
      rid: 'duel_123',
      hostId: 'peer_alice',
      foeId: 'peer_bob',
      foeName: 'Bob'
    }
  });

  const peer = link.others.get('peer_alice');
  assert.ok(peer, 'Peer alice must be tracked');
  assert.deepEqual(peer.pvp, {
    rid: 'duel_123',
    hostId: 'peer_alice',
    foeId: 'peer_bob',
    foeName: 'Bob'
  }, 'Peer alice must store pvp battle info');

  // Simulate spec_join message from a spectator
  link.receive('peer_charlie', {
    t: 'spec_join',
    rid: 'duel_123'
  });

  assert.ok(spectateEvent, 'link.onSpectate must be invoked for spec_join');
  assert.equal(spectateEvent.from, 'peer_charlie');
  assert.equal(spectateEvent.msg.t, 'spec_join');
  assert.equal(spectateEvent.msg.rid, 'duel_123');

  // Simulate spec_leave message
  link.receive('peer_charlie', {
    t: 'spec_leave',
    rid: 'duel_123'
  });
  assert.equal(spectateEvent.msg.t, 'spec_leave');
}

// ============================================================================
// 2. Social & getActiveDuels integration
// ============================================================================
{
  const mockGame = {
    state: { name: 'PlayerMe', pos: { x: 5, y: 5, map: 'bourg-palette' } },
    map: { id: 'bourg-palette', width: 20, height: 20 },
    party: [{ sp: 6, hp: 100, stats: [100, 50, 50, 50, 50, 50], lvl: 50 }],
    ui: {
      root: { appendChild: () => {}, removeChild: () => {} },
      toast: () => {},
      choice: async () => 0
    }
  };

  const social = installSocial(mockGame, 'mock-hub-url');
  assert.equal(typeof mockGame.getActiveDuels, 'function', 'game.getActiveDuels must be installed');
  assert.equal(typeof mockGame.spectateDuel, 'function', 'game.spectateDuel must be installed');

  // Add mock peers with duels
  const link = mockGame.link;
  link.others.set('peer_red', {
    id: 'peer_red',
    name: 'Red',
    map: 'bourg-palette',
    pvp: {
      rid: 'duel_red_blue',
      hostId: 'peer_red',
      foeId: 'peer_blue',
      foeName: 'Blue'
    }
  });
  link.others.set('peer_blue', {
    id: 'peer_blue',
    name: 'Blue',
    map: 'bourg-palette',
    pvp: {
      rid: 'duel_red_blue',
      hostId: 'peer_red',
      foeId: 'peer_red',
      foeName: 'Red'
    }
  });
  link.others.set('peer_green', {
    id: 'peer_green',
    name: 'Green',
    map: 'bourg-palette',
    pvp: null // Not in battle
  });

  const activeDuels = mockGame.getActiveDuels();
  assert.equal(activeDuels.length, 1, 'Duplicate peer reports for the same duel RID must be deduplicated to 1 duel');
  assert.equal(activeDuels[0].rid, 'duel_red_blue');
  assert.equal(activeDuels[0].hostId, 'peer_red');
  assert.equal(activeDuels[0].p0, 'Red');
  assert.equal(activeDuels[0].p1, 'Blue');
}

// ============================================================================
// 3. exportMonForSpectator helper
// ============================================================================
{
  const mon = {
    uid: 'u_drac_1',
    sp: 6, // Dracaufeu
    nick: 'Draco',
    hp: 85,
    stats: [120, 90, 80, 110, 85, 100],
    lvl: 42,
    status: 'brn',
    shiny: false,
    shadow: false,
    moves: [{ id: 'lance-flammes', pp: 10 }, { id: 'vol', pp: 15 }],
    ivs: { hp: 31, atk: 31 }, // private
    evs: { hp: 252, atk: 0 }  // private
  };

  const exported = exportMonForSpectator(mon);
  assert.equal(exported.uid, 'u_drac_1');
  assert.equal(exported.sp, 6);
  assert.equal(exported.nick, 'Draco');
  assert.equal(exported.hp, 85);
  assert.equal(exported.lvl, 42);
  assert.equal(exported.status, 'brn');
  assert.equal(exported.shiny, false);
  assert.deepEqual(exported.stats, [120, 90, 80, 110, 85, 100]);
  // Moves are simplified with only id & pp
  assert.deepEqual(exported.moves, [{ id: 'lance-flammes', pp: 10 }, { id: 'vol', pp: 15 }]);
  // Private stats/ivs are omitted
  assert.equal(exported.ivs, undefined);
  assert.equal(exported.evs, undefined);
}

// ============================================================================
// 4. BattleView Spectator mode
// ============================================================================
{
  const makeHudSide = () => {
    const el = {
      style: {},
      innerHTML: '',
      elements: {},
      querySelector: (sel) => {
        if (!el.elements[sel]) {
          el.elements[sel] = { style: {}, textContent: '', innerHTML: '', classList: { toggle: () => {} } };
        }
        return el.elements[sel];
      }
    };
    return el;
  };

  const hudMe = makeHudSide();
  const hudFoe = makeHudSide();

  const bv = {
    spectator: true,
    hud: { me: hudMe, foe: hudFoe },
    battle: {
      sides: [
        { name: 'Alice' },
        { name: 'Bob' }
      ]
    },
    game: {
      markSeen: () => {},
      isSpeciesKnown: () => true,
      seenCount: () => 3,
      levelCap: () => 100,
      state: { dex: { caught: [] } }
    },
    seenInBattle: new Set(),
    setHp: () => {},
    renderPartyBalls: () => ''
  };

  // Attach setHud method from BattleView prototype
  bv.setHud = BattleView.prototype.setHud.bind(bv);

  const monAlice = {
    sp: 25, // Pikachu
    lvl: 25,
    hp: 50,
    stats: [50, 40, 30, 40, 30, 60],
    gender: 'm',
    status: null
  };
  bv.setHud(0, monAlice);
  const nameElAlice = hudMe.querySelector('.bh-name');
  assert.ok(nameElAlice.innerHTML.includes('<span class="bh-trainer-tag">Alice :</span>'), 'Alice trainer tag must be rendered in HUD');
  assert.ok(nameElAlice.innerHTML.includes('Pikachu'), 'Pokemon name must be rendered in HUD');

  const monBob = {
    sp: 7, // Carapuce
    lvl: 24,
    hp: 80,
    stats: [80, 40, 50, 40, 50, 35],
    gender: 'f',
    status: null
  };
  bv.setHud(1, monBob);
  const nameElBob = hudFoe.querySelector('.bh-name');
  assert.ok(nameElBob.innerHTML.includes('<span class="bh-trainer-tag">Bob :</span>'), 'Bob trainer tag must be rendered in HUD');
  assert.ok(nameElBob.innerHTML.includes('Carapuce'), 'Pokemon name must be rendered in HUD');
}

console.log('All spectator battle tests passed successfully! ✔');
