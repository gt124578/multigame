// Fief Maudit : la crypte sous le château. Moteur PUR. Une zone à part, loin au nord de la vallée (on y descend par la
// porte du donjon), dessinée sur une grille de cases de 2 m (la largeur d'un pan de mur du kit) :
//   #  mur        .  sol        S  arrivée (bas de l'escalier)        L  levier (contre le mur)
//   G  herse (fermée tant que les deux leviers ne sont pas tenus ensemble)
//   B  couloir de la brume (les morts y sortent du sol et s'y relèvent)        K  le trône du Roi-Squelette
//   T  colonne à torche (elle éclaire : les morts tombés près d'elle restent à terre)
export const CRYPT_PLAN = [
  '####################',
  '#######......#######',
  '#######..S...#######',
  '#######......#######',
  '#######T....T#######',
  '#########..#########',
  '#########..#########',
  '###.T..........T.###',
  '###..............###',
  '##L..............L##',
  '###..............###',
  '###.T..........T.###',
  '#########GG#########',
  '########BBBB########',
  '########BBBB########',
  '########BBBB########',
  '########BBBB########',
  '########BBBB########',
  '########BBBB########',
  '########BBBB########',
  '########BBBB########',
  '###..............###',
  '###..T........T..###',
  '###..............###',
  '###......K.......###',
  '###..............###',
  '###..T........T..###',
  '###..............###',
  '####################',
];
export const CELL = 2;
export const CRYPT_X = 0, CRYPT_Z = -330, CRYPT_Y = 0;   // coin nord-ouest de la grille ; sol plat
export const TORCH_R = 5.5;

export function createCrypt() {
  const rows = CRYPT_PLAN.length, cols = CRYPT_PLAN[0].length;
  const x0 = CRYPT_X - cols * CELL / 2, z0 = CRYPT_Z;
  const at = (c, r) => (r < 0 || r >= rows || c < 0 || c >= cols ? '#' : CRYPT_PLAN[r][c]);
  const cx = (c) => x0 + c * CELL + CELL / 2, cz = (r) => z0 + r * CELL + CELL / 2;
  const floor = (ch) => ch !== '#' && ch !== 'T';
  const cells = [], find = {};
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = at(c, r);
    if (floor(ch)) cells.push({ c, r, x: cx(c), z: cz(r), ch });
    (find[ch] = find[ch] || []).push({ c, r, x: cx(c), z: cz(r) });
  }
  // murs : seulement les cases pleines qui touchent le sol, fusionnées par rangée
  const walls = [];
  for (let r = 0; r < rows; r++) {
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const ch = at(c, r);
      const edge = (ch === '#' || ch === 'T') && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dc, dr]) => floor(at(c + dc, r + dr)) || at(c + dc, r + dr) === 'G');
      if (edge && c < cols) { if (start < 0) start = c; }
      else if (start >= 0) { walls.push({ x0: x0 + start * CELL, x1: x0 + c * CELL, z0: z0 + r * CELL, z1: z0 + (r + 1) * CELL, id: 'crypte' }); start = -1; }
    }
  }
  const G = find.G, gate = { x0: Math.min(...G.map((g) => g.x)) - 1, x1: Math.max(...G.map((g) => g.x)) + 1, z0: G[0].z - 1, z1: G[0].z + 1, id: 'herse', gate: true, open: false };
  const S = find.S[0];
  const B = find.B, K = find.K[0];
  const torches = (find.T || []).map((t, i) => ({ id: i, x: t.x, z: t.z, throne: t.r > 20 }));
  // les leviers : la case de sol, et le mur qu'ils touchent
  const levers = find.L.map((l, i) => ({ id: i, x: l.x, z: l.z, wall: l.c < cols / 2 ? -1 : 1 }));
  const zone = (r0, r1) => ({ x0: x0, x1: x0 + cols * CELL, z0: z0 + r0 * CELL, z1: z0 + (r1 + 1) * CELL });
  return {
    rows, cols, x0, z0, x1: x0 + cols * CELL, z1: z0 + rows * CELL, y: CRYPT_Y, plan: CRYPT_PLAN, cells, walls, gate, torches, levers,
    spawn: { x: S.x, z: S.z, yaw: 0 },
    halls: { entree: zone(0, 6), leviers: zone(7, 11), brume: zone(13, 20), trone: zone(21, 27) },
    brumeCells: B.map((b) => ({ x: b.x, z: b.z })),
    king: { x: K.x, z: K.z },
    inside: (x, z) => x > x0 - 1 && x < x0 + cols * CELL + 1 && z > z0 - 1 && z < z0 + rows * CELL + 1,
  };
}
export const inZone = (z, x, y) => x > z.x0 && x < z.x1 && y > z.z0 && y < z.z1;
