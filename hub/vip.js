/* Comptes VIP : des jeux et des modes de jeu réservés.

   Le grade est attaché à l'identifiant d'un compte en ligne (celui qu'on protège par mot de passe), jamais au simple
   pseudo (n'importe qui peut prendre un pseudo). La liste ne contient que des empreintes SHA-256 des identifiants :
   le dépôt ne dit pas qui est VIP. Pour ajouter quelqu'un : node tools/vip-add.mjs <identifiant>

   Réserver un jeu ou un mode (dans hub/games.js) :
     { id: 'monjeu', ..., vip: true }                                  le jeu entier
     settings: [{ key: 'mode', ..., vip: true }]                       tout un réglage
     options: [['normal', 'Normal'], ['secret', 'Mode secret', { vip: true }]]   une seule option
   Pour les autres joueurs, ces jeux et options sont retirés de la liste avant que le Hub ne l'affiche : ils ne les voient
   nulle part. Si un VIP lance un jeu réservé dans son salon, ses invités y jouent avec lui (sans pouvoir le lancer eux-mêmes).
   Dans un jeu : HubBridge.info.vip vaut true quand le joueur est VIP (pour réserver un mode à l'intérieur du jeu).

   C'est un site statique : ce tri cache l'accès, il ne le rend pas impossible à quelqu'un qui lit le code. */
(function () {
  const HASHES = [
    // empreintes des identifiants VIP (tools/vip-add.mjs)
  ];
  // comptes en ligne VIP désignés par le nom de leur fichier sur GitHub (branche saves, accounts/<id>.json) :
  // les 5 comptes inscrits le 4 novembre 2026
  const ACCOUNTS = [
    '171379463336fbba34735af308802c65',
    '24348069406b1041600ea8aed25ccf63',
    '39e22bb73b4fcd2fa85999ba152d6b17',
    '8b8f89805089e303539fe8c6c4986739',
    '5e842723d2fac440fa9c6b7fac73c363',   // créé le 4 novembre 2026 au soir
  ];

  // SHA-256 synchrone (court) : la liste doit être triée avant que le Hub ne se dessine
  function sha256(str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = new TextEncoder().encode(str), l = bytes.length;
    const n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64), r = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h = h.map((x, i) => (x + [a, b, c, d, e, f, g, hh][i]) >>> 0);
    }
    return h.map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  const sess = window.HubAccount && window.HubAccount.session();
  const vip = !!(sess && (HASHES.includes(sha256('arcadia-vip:' + sess.user)) || ACCOUNTS.includes(sha256('arcadia-account:' + sess.user).slice(0, 32))));
  const isVipOpt = (o) => !!(o && o[2] && o[2].vip);

  // tous les jeux (pour lancer celui qu'un VIP a choisi dans son salon), puis la liste visible par ce joueur
  const ALL = window.HUB_GAMES || [];
  window.HUB_GAMES_ALL = ALL;
  if (!vip) {
    window.HUB_GAMES = ALL.filter((g) => !g.vip).map((g) => (g.settings || []).some((s) => s.vip || (s.options || []).some(isVipOpt))
      ? { ...g, settings: g.settings.filter((s) => !s.vip).map((s) => ({ ...s, options: s.options.filter((o) => !isVipOpt(o)) })) }
      : g);
  }
  window.HubVIP = { is: () => vip, hash: (user) => sha256('arcadia-vip:' + String(user).toLowerCase()) };
})();
