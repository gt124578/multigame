// Types et table des efficacités (attaquant -> défenseur).

export const TYPES = {
  normal: { name: 'Normal', color: '#a8a890' },
  feu: { name: 'Feu', color: '#f08030' },
  eau: { name: 'Eau', color: '#5890f0' },
  plante: { name: 'Plante', color: '#68c048' },
  elec: { name: 'Électrik', color: '#f0c828' },
  glace: { name: 'Glace', color: '#88d8d8' },
  combat: { name: 'Combat', color: '#c03028' },
  poison: { name: 'Poison', color: '#a040a0' },
  sol: { name: 'Sol', color: '#d8b060' },
  vol: { name: 'Vol', color: '#a890f0' },
  psy: { name: 'Psy', color: '#f85888' },
  insecte: { name: 'Insecte', color: '#a8b820' },
  roche: { name: 'Roche', color: '#b8a038' },
  spectre: { name: 'Spectre', color: '#705898' },
  dragon: { name: 'Dragon', color: '#7038f8' },
  tenebres: { name: 'Ténèbres', color: '#705848' },
  acier: { name: 'Acier', color: '#b8b8d0' },
  fee: { name: 'Fée', color: '#ee99ac' },
};

// [super efficace], [peu efficace], [sans effet]
const T = {
  normal: [[], ['roche', 'acier'], ['spectre']],
  feu: [['plante', 'glace', 'insecte', 'acier'], ['feu', 'eau', 'roche', 'dragon'], []],
  eau: [['feu', 'sol', 'roche'], ['eau', 'plante', 'dragon'], []],
  plante: [['eau', 'sol', 'roche'], ['feu', 'plante', 'poison', 'vol', 'insecte', 'dragon', 'acier'], []],
  elec: [['eau', 'vol'], ['plante', 'elec', 'dragon'], ['sol']],
  glace: [['plante', 'sol', 'vol', 'dragon'], ['feu', 'eau', 'glace', 'acier'], []],
  combat: [['normal', 'glace', 'roche', 'tenebres', 'acier'], ['poison', 'vol', 'psy', 'insecte', 'fee'], ['spectre']],
  poison: [['plante', 'fee'], ['poison', 'sol', 'roche', 'spectre'], ['acier']],
  sol: [['feu', 'elec', 'poison', 'roche', 'acier'], ['plante', 'insecte'], ['vol']],
  vol: [['plante', 'combat', 'insecte'], ['elec', 'roche', 'acier'], []],
  psy: [['combat', 'poison'], ['psy', 'acier'], ['tenebres']],
  insecte: [['plante', 'psy', 'tenebres'], ['feu', 'combat', 'poison', 'vol', 'spectre', 'acier', 'fee'], []],
  roche: [['feu', 'glace', 'vol', 'insecte'], ['combat', 'sol', 'acier'], []],
  spectre: [['psy', 'spectre'], ['tenebres'], ['normal']],
  dragon: [['dragon'], ['acier'], ['fee']],
  tenebres: [['psy', 'spectre'], ['combat', 'tenebres', 'fee'], []],
  acier: [['glace', 'roche', 'fee'], ['feu', 'eau', 'elec', 'acier'], []],
  fee: [['combat', 'dragon', 'tenebres'], ['feu', 'poison', 'acier'], []],
};

export function effectiveness(atk, defTypes) {
  let m = 1;
  const row = T[atk]; if (!row) return 1;
  for (const d of defTypes) {
    if (row[2].includes(d)) m *= 0;
    else if (row[0].includes(d)) m *= 2;
    else if (row[1].includes(d)) m *= 0.5;
  }
  return m;
}
