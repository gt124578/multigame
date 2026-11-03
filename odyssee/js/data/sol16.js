// Sols à 16 px (PixelLab, tools/odyssee-sols16.py) : jeux de tuiles Wang posés sur une grille décalée d'une
// demi-case (chaque coin d'une pièce est le centre d'une case), et pièces isolées.
export const SOL16_JEUX = ['chemin', 'sable', 'pave', 'rivage', 'berge', 'neige', 'cendre', 'herbes_bois', 'herbes_neige'];
export const SOL16_PIECES = ['fleur_r', 'fleur_y', 'fleur_w', 'fleur_p', 'rebord', 'pont_ns', 'pont_eo', 'ponton', 'escalier', 'falaise',
  'grotte', 'grotte_mur', 'profond', 'lave', 'parquet', 'cailloux', 'eau0', 'eau1', 'eau2', 'eau3', 'hautes_herbes0', 'hautes_herbes1', 'herbe_v1'];
export const SOL16_FICHIERS = [...SOL16_JEUX.flatMap((j) => Array.from({ length: 16 }, (_, m) => `${j}_${m}`)), ...SOL16_PIECES];
