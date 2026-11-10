# Arènes du sud (8 à 14), peintes case par case ou calculées (labyrinthe du Marais à graine fixe) ; lu par dessiner.py.
# ---------------------------------------------------------------- 8. Margot (Normal) : la Galerie — trois salles d'exposition, l'ordre des vitrines (Norman, Cheren)
P = Plan(32)
for y, r in enumerate([
    '#########################',
    '#...g...p___C___p...g...#',
    '#......._________.......#',
    '############X############',
    '#..w.....3.......w......#',
    '#.......................#',
    '#.a...b...c...d...y...z.#',
    '############D############',
    '#.......................#',
    '#.e...f...h...j...s...t.#',
    '#....................2..#',
    '#.......................#',
    '#..ww......ww.......P...#',
    '#.......................#',
    '####################N####',
    '#.......................#',
    '#.k...l...m...n...u...v.#',
    '#.......................#',
    '#........1..............#',
    '#.....M.................#',
    '#p.....................p#',
    '#.......................#',
]):
    P.row(y, 0, r)
P.hall(22)
def vitrine(r, rang, n, txt, prop='vitrine'):
    a = f"{{ seq: [{r}, {rang}] }}" if rang else f"{{ set: [{r}, 0] }}"
    txt = txt.replace("'", "\\'")
    return f"{{ prop: '{prop}', reg: {{ {a[2:-2]}, sauf: {{ r: {r}, eq: {n} }} }}, use: true, msg: '{txt}', son: 'select' }}"
arene(8, P, r"""
    type: 'normal', sol: 'gymGalerie', regs: [0, 0, 0], minActions: 16,
    regles: [
      'ARÈNE DE MÉTROPOLE — LA GALERIE\nChampionne : Margot, la conservatrice.',
      'Chaque salle de la Galerie a sa règle, écrite sur son panneau. Examine les vitrines DANS LE BON ORDRE pour ouvrir la porte suivante.',
      'Une erreur, et il faut reprendre la salle depuis la première vitrine. Rien ne presse : lis bien les cartels !',
      'Conseil de Margot : « Le Combat, c\'est ma bête noire. Le reste… je l\'expose ! »',
    ],
    legende: {
      M: { panneau: ['SALLE 1 — LES POIDS PLUMES', 'Examine les vitrines des Pokémon de type NORMAL, du plus LÉGER au plus LOURD.', 'Les autres ne sont pas de la maison : y toucher, c\'est tout recommencer !'] },
      k: """ + vitrine(0, 3, 5, 'Vitrine : un Évoli en peluche géante. Cartel : « Type Normal — 6,5 kg ».') + r""",
      l: """ + vitrine(0, 1, 5, 'Vitrine : une statuette de Miaouss. Cartel : « Type Normal — 4,2 kg ».') + r""",
      m: """ + vitrine(0, 5, 5, 'Vitrine : un Ronflex grandeur nature ! Cartel : « Type Normal — 460 kg ».') + r""",
      n: """ + vitrine(0, 2, 5, 'Vitrine : un Rondoudou qui chante. Cartel : « Types Normal et Fée — 5,5 kg ».') + r""",
      u: """ + vitrine(0, 0, 5, 'Vitrine : un Pikachu qui fait des étincelles. Cartel : « Type Électrik — 6 kg ».') + r""",
      v: """ + vitrine(0, 4, 5, 'Vitrine : un Tauros qui gratte le sol. Cartel : « Type Normal — 88,4 kg ».') + r""",
      N: { porte: { r: 0, eq: 5 }, ferme: 'bloc', o: 'porte_ouverte', f: 'porte_galerie' },
      P: { panneau: ['SALLE 2 — UNE JOURNÉE EN CINQ TABLEAUX', 'Raconte la journée dans l\'ordre, de l\'aube à la nuit.', 'Un des tableaux n\'a rien à faire là.'] },
      e: """ + vitrine(1, 5, 5, 'Tableau : un Noctali sous la pleine lune. « La nuit ».', 'tableau') + r""",
      f: """ + vitrine(1, 3, 5, 'Tableau : un Tauros qui somnole à l\'ombre, soleil au zénith. « Midi ».', 'tableau') + r""",
      h: """ + vitrine(1, 1, 5, 'Tableau : un Roucool qui chante sur une branche, ciel rose. « L\'aube ».', 'tableau') + r""",
      j: """ + vitrine(1, 0, 5, 'Tableau : des taches de couleur, ni soleil ni lune. « Sans titre ».', 'tableau') + r""",
      s: """ + vitrine(1, 4, 5, 'Tableau : un Miaouss qui rentre au logis, ciel orangé. « Le crépuscule ».', 'tableau') + r""",
      t: """ + vitrine(1, 2, 5, 'Tableau : un Ponyta qui trotte dans la rosée, soleil encore bas. « Le matin ».', 'tableau') + r""",
      D: { porte: { r: 1, eq: 5 }, ferme: 'bloc', o: 'porte_ouverte', f: 'porte_galerie' },
      Q: { panneau: ['SALLE 3 — LE CABINET DES CHIFFRES', 'Les socles portent des chiffres romains. Du plus PETIT au plus GRAND !', 'La porte de Margot s\'ouvre au sixième socle.'] },
      X: { porte: { r: 2, eq: 6 }, ferme: 'bloc', o: 'porte_ouverte', f: 'porte_galerie' },
      a: """ + vitrine(2, 3, 6, 'Socle IX : un trophée en bronze.', 'socle_musee') + r""",
      b: """ + vitrine(2, 5, 6, 'Socle XIV : une Poké Ball ancienne.', 'socle_musee') + r""",
      c: """ + vitrine(2, 1, 6, 'Socle IV : la couronne de la Ligue.', 'socle_musee') + r""",
      d: """ + vitrine(2, 6, 6, 'Socle XIX : un vieux Badge en argent.', 'socle_musee') + r""",
      y: """ + vitrine(2, 2, 6, 'Socle VI : une plume dorée.', 'socle_musee') + r""",
      z: """ + vitrine(2, 4, 6, 'Socle XI : un fossile poli.', 'socle_musee') + r""",
    },
    dresseurs: [{ dir: 'right', vue: 4 }, { dir: 'left', vue: 4 }, { dir: 'down', vue: 3 }],
""")

# ---------------------------------------------------------------- 10. Morgane (Poison) : le Marais — murs invisibles (Koga, Jeannine), vase toxique, trois lanternes
import random as _rnd
_R = _rnd.Random(1010)
P = Plan(32)
P.rect(1, 1, 23, 2, '.'); P.rect(9, 1, 15, 2, '_'); P.put(12, 1, 'C'); P.put(8, 1, 'p'); P.put(16, 1, 'p'); P.put(4, 1, 'g'); P.put(20, 1, 'g')
P.rect(1, 3, 23, 3, '#'); P.put(12, 3, 'X')
# labyrinthe parfait sur les cases paires (x 2..22, y 4..20), puis quelques boucles ; murs pleins sur les cases impaires
CX = list(range(2, 23, 2)); CY = list(range(4, 21, 2))
P.rect(1, 4, 23, 21, 'm')
for y in range(4, 22):
    for x in range(1, 24):
        if x % 2 == 1 and y % 2 == 1: P.put(x, y, 'k')          # poteaux (roseaux visibles)
for x in CX:
    for y in CY: P.put(x, y, '.')
vu = {(12, 20)}; pile = [(12, 20)]
while pile:
    x, y = pile[-1]; vois = [(x + dx, y + dy) for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)) if (x + dx, y + dy) not in vu and 2 <= x + dx <= 22 and 4 <= y + dy <= 20]
    if not vois: pile.pop(); continue
    nx, ny = _R.choice(vois); P.put((x + nx) // 2, (y + ny) // 2, '.'); vu.add((nx, ny)); pile.append((nx, ny))
for _ in range(6):                                                # quelques boucles : le marais n'est pas un couloir unique
    x, y = _R.choice(CX[:-1]) + 1, _R.choice(CY)
    if _R.random() < 0.5: x, y = _R.choice(CX), _R.choice(CY[:-1]) + 1
    if P.g[y][x] == 'm': P.put(x, y, '.')
P.put(12, 21, '.')
# murs invisibles : la lettre dit la lanterne qui les révèle (gauche, milieu, droite)
for y in range(4, 22):
    for x in range(1, 24):
        if P.g[y][x] == 'm': P.put(x, y, 'xyzvw'[min(4, (x - 1) * 5 // 23)])
# distances depuis l'entrée
from collections import deque as _dq
def _dist(src):
    D = {src: 0}; q = _dq([src])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if n not in D and 1 <= n[0] <= 23 and 4 <= n[1] <= 21 and P.g[n[1]][n[0]] == '.': D[n] = D[(x, y)] + 1; q.append(n)
    return D
D = _dist((12, 21))
cul = [c for c in D if c[1] <= 20 and sum(P.g[c[1] + dy][c[0] + dx] == '.' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) == 1]
lanternes = []
for zx in ((2, 4), (6, 8), (10, 14), (16, 18), (20, 22)):
    cand = [c for c in cul if zx[0] <= c[0] <= zx[1]] or [c for c in D if zx[0] <= c[0] <= zx[1] and c[1] <= 20]
    c = max(cand, key=lambda c: D[c]); lanternes.append(c)
for c, ch in zip(lanternes, 'LMNOQ'): P.put(c[0], c[1], ch)
# flaques de vase sur des culs-de-sac sans lanterne (elles renvoient à l'entrée du marais)
flaques = [c for c in cul if c not in lanternes and c != (12, 4) and D[c] > 6]
_R.shuffle(flaques)
for c in flaques[:7]: P.put(c[0], c[1], 'f')
P.put(12, 20, 'U')
# dresseurs : sur des cases de couloir, loin du chemin le plus court vers la porte
P.hall(22)
def _libre_sans(bloc):
    D2 = {(12, 21): 0}; q = _dq([(12, 21)])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if n not in D2 and n not in bloc and 1 <= n[0] <= 23 and 4 <= n[1] <= 21 and P.g[n[1]][n[0]] in '.LMNOQU': D2[n] = 1; q.append(n)
    voisins = lambda c: [(c[0] + dx, c[1] + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
    return all(any(v in D2 for v in voisins(c)) for c in lanternes) and (12, 4) in D2
_spots = []
for c in sorted([c for c in D if P.g[c[1]][c[0]] == '.' and 5 <= c[1] <= 18 and D[c] > 5], key=lambda c: (c[0] * 7 + c[1] * 13) % 17):
    if len(_spots) == 4: break
    if any(abs(c[0] - s[0][0]) + abs(c[1] - s[0][1]) < 7 for s in _spots): continue
    if not _libre_sans({s[0] for s in _spots} | {c}): continue
    d = next(d for d, (dx, dy) in (('down', (0, 1)), ('up', (0, -1)), ('right', (1, 0)), ('left', (-1, 0))) if P.g[c[1] + dy][c[0] + dx] == '.')
    _spots.append((c, d))
_dirs = []
for i, ((x, y), d) in enumerate(_spots): P.put(x, y, str(i + 1)); _dirs.append(d)
arene(10, P, r"""
    type: 'poison', sol: 'gymMarais', regs: [0, 0, 0, 0, 0], minActions: 5,
    regles: [
      'ARÈNE DE MARAIS-NOIR — LE MARAIS\nChampionne : Morgane, la reine des brumes.',
      'Le marais est plein de murs que l\'on ne voit pas. Seuls les roseaux montrent où ils pourraient se trouver…',
      'Cinq lanternes sont cachées au fond du marais. Chaque lanterne allumée révèle les murs de son coin ; les cinq ensemble ouvrent la grille de Morgane.',
      'Attention à la vase toxique : qui y met le pied est ramené à l\'entrée du marais.',
      'Conseil de Morgane : « Le Sol et le Psy dissipent mes brumes. Mais il faut d\'abord me trouver ! »',
    ],
    legende: {
      k: { t: 'bloc', deco: 'roseaux' },
      x: { t: 'invis', deco: { k: 'mur_marais', r: 0 } }, y: { t: 'invis', deco: { k: 'mur_marais', r: 1 } }, z: { t: 'invis', deco: { k: 'mur_marais', r: 2 } },
      v: { t: 'invis', deco: { k: 'mur_marais', r: 3 } }, w: { t: 'invis', deco: { k: 'mur_marais', r: 4 } },
      L: { prop: 'lanterne_marais', reg: { set: [0, 1] }, use: true, msg: 'Tu allumes la lanterne. Sa lueur verte dessine les murs cachés de ce coin du marais !', son: 'select' },
      M: { prop: 'lanterne_marais', reg: { set: [1, 1] }, use: true, msg: 'Tu allumes la lanterne. Sa lueur verte dessine les murs cachés du cœur du marais !', son: 'select' },
      N: { prop: 'lanterne_marais', reg: { set: [2, 1] }, use: true, msg: 'Tu allumes la lanterne. Sa lueur verte dessine les murs cachés de ce coin du marais !', son: 'select' },
      O: { prop: 'lanterne_marais', reg: { set: [3, 1] }, use: true, msg: 'Tu allumes la lanterne. Sa lueur verte dessine les murs cachés de ce coin du marais !', son: 'select' },
      Q: { prop: 'lanterne_marais', reg: { set: [4, 1] }, use: true, msg: 'Tu allumes la lanterne. Sa lueur verte dessine les murs cachés de ce coin du marais !', son: 'select' },
      X: { porte: { tous: [0, 1, 2, 3, 4] }, ferme: 'bloc', o: 'grille_ouverte', f: 'grille_marais' },
      f: { chute: 'U', msg: 'Beurk ! Tu t\'enfonces dans la vase toxique… et tu te retrouves à l\'entrée du marais.', decoChute: 'vase' },
      U: { t: 'sol' },
    },
    dresseurs: [""" + ', '.join(f"{{ dir: '{d}', vue: 3 }}" for d in _dirs) + r"""],
""")

# ---------------------------------------------------------------- 11. Gaspard (Sol) : les Dunes — sable qui glisse (Frimapic), dalles d'argile qui cèdent (Atalanopolis)
P = Plan(32)
P.rect(1, 1, 23, 2, '.'); P.rect(9, 1, 15, 2, '_'); P.put(12, 1, 'C'); P.put(8, 1, 'p'); P.put(16, 1, 'p'); P.put(4, 1, 'g'); P.put(20, 1, 'g')
P.rect(1, 3, 23, 3, '#'); P.put(12, 3, 'X')
P.rect(1, 4, 23, 11, '.')
P.rect(8, 4, 16, 9, '#'); P.rect(9, 4, 15, 8, 'f'); P.put(11, 6, '#'); P.put(13, 6, '#'); P.put(14, 6, '#'); P.put(16, 8, '.')   # la salle d'argile
P.rect(1, 12, 23, 12, '#'); P.put(16, 12, '.')
P.rect(1, 13, 23, 20, '*')
for x, y in [(2, 14), (2, 17), (4, 13), (4, 18), (4, 19), (5, 18), (6, 19), (10, 13), (11, 20), (13, 14), (13, 16), (13, 19), (14, 15), (14, 16), (14, 17), (15, 18), (17, 16), (18, 15), (18, 20), (19, 17), (21, 17), (23, 15), (23, 18), (23, 20)]:
    P.put(x, y, 'r')
P.rect(1, 21, 23, 21, '#'); P.put(12, 21, 'U')
P.put(23, 9, 'h')   # le toboggan : redescend à l'entrée
P.put(2, 4, 'o'); P.put(1, 11, 'p'); P.put(23, 11, 'p'); P.put(8, 4, 'p'); P.put(17, 4, 'p')
P.put(4, 7, '1'); P.put(21, 6, '2'); P.put(13, 10, '3'); P.put(6, 10, '4')
P.hall(22)
arene(11, P, r"""
    type: 'ground', sol: 'gymDunes', minActions: 1, glace: 'sable_glissant',
    regs: [0, 0],
    regles: [
      'ARÈNE DE DUNES D\'OCRE — LES DUNES\nChampion : Gaspard, le seigneur des sables.',
      'Le sable de la dune glisse : une fois lancé, on ne s\'arrête que contre un rocher.',
      'Dans la salle d\'argile, chaque dalle se fend quand on y passe et cède si l\'on y repasse. Fends-les TOUTES pour ouvrir le passage vers Gaspard !',
      'Si une dalle cède, la salle se reforme : il suffit de recommencer.',
      'Conseil de Gaspard : « L\'Eau, la Plante et la Glace me donnent du fil à retordre. Mais le sable, lui, ne pardonne pas ! »',
    ],
    legende: {
      r: { t: 'bloc', deco: 'rocher_sable' },
      f: { fragile: 'argile' },
      h: { chute: 'U', msg: 'Tu te laisses glisser dans le toboggan de sable… et tu atterris à l\'entrée de l\'arène !', decoChute: 'toboggan' },
      U: { t: 'sol' },
      X: { porte: { r: 1, eq: 1 }, ferme: 'bloc', o: 'porte_sable_ouverte', f: 'porte_sable' },
    },
    fragiles: { argile: { entree: [15, 8], fins: [[12, 4]], r: 1, retour: [17, 8] } },
    dresseurs: [{ dir: 'right', vue: 3 }, { dir: 'left', vue: 3 }, { dir: 'down', vue: 1 }, { dir: 'right', vue: 3 }],
""")

# ---------------------------------------------------------------- 14. Corbin (Ténèbres) : l'Abîme — passerelles invisibles au-dessus du vide (Mortimer, Rosalia), cinq torches dans le noir
P = Plan(32)
P.rect(1, 1, 23, 2, '.'); P.rect(9, 1, 15, 2, '_'); P.put(12, 1, 'C'); P.put(8, 1, 'p'); P.put(16, 1, 'p'); P.put(4, 1, 'g'); P.put(20, 1, 'g')
P.rect(1, 3, 23, 3, '#'); P.put(12, 3, 'X')
P.rect(1, 4, 23, 18, 'v')
P.rect(1, 19, 23, 21, '.')                                         # parvis
for x0, y0 in ((2, 13), (9, 9), (20, 13), (20, 5), (2, 5)): P.rect(x0, y0, x0 + 2, y0 + 2, '.')   # îlots des torches
P.rect(10, 4, 14, 5, '.')                                          # îlot de la grille
CHEMINS = [   # (torche qui l'éclaire, cases) ; les culs-de-sac font tomber qui s'y fie
    ('a', [(6, 18), (6, 17), (6, 16), (5, 16), (5, 15)]), ('a', [(7, 16), (8, 16)]),
    ('a', [(3, 12), (3, 11), (4, 11), (5, 11), (5, 10), (6, 10), (7, 10), (8, 10)]), ('a', [(5, 12), (6, 12)]),
    ('b', [(12, 10), (13, 10), (13, 11), (14, 11), (15, 11), (16, 11), (16, 12), (17, 12), (18, 12), (18, 13), (19, 13)]), ('b', [(14, 12), (14, 13), (14, 14)]), ('b', [(13, 9), (13, 8), (14, 8)]),
    ('c', [(21, 12), (21, 11), (21, 10), (20, 10), (20, 9), (20, 8)]), ('c', [(22, 10), (22, 9)]),
    ('d', [(19, 6), (18, 6), (17, 6), (17, 5), (16, 5), (15, 5)]), ('d', [(18, 7), (18, 8), (17, 8)]),
    ('e', [(9, 5), (8, 5), (8, 6), (7, 6), (6, 6), (5, 6)]), ('e', [(8, 7), (8, 8)]),
]
for ch, L in CHEMINS:
    for x, y in L: P.put(x, y, ch)
P.put(3, 14, 'L'); P.put(10, 10, 'M'); P.put(21, 14, 'N'); P.put(21, 6, 'O'); P.put(3, 6, 'Q')
P.put(12, 19, 'U')
P.put(4, 20, '1'); P.put(2, 13, '2'); P.put(22, 13, '3'); P.put(11, 11, '4'); P.put(14, 4, '5')
P.put(1, 21, 'p'); P.put(23, 21, 'p')
P.hall(22)
arene(14, P, r"""
    type: 'dark', sol: 'gymAbime', regs: [0, 0, 0, 0, 0], minActions: 5, noir: true,
    regles: [
      'ARÈNE D\'OMBREVAL — L\'ABÎME\nChampion : Corbin, le prince des ombres.',
      'Des passerelles invisibles enjambent l\'abîme. Qui pose le pied dans le vide retombe… à l\'entrée de l\'arène. Méfie-toi : certaines passerelles ne mènent nulle part.',
      'Allume les cinq torches des îlots : chacune éclaire le bout de chemin qui part de son îlot, et toutes ensemble ouvrent la grille de Corbin.',
      'Conseil de Corbin : « Le Combat, l\'Insecte et la Fée percent mes ténèbres. Encore faut-il voir où l\'on marche… »',
    ],
    legende: {
      v: { chute: 'U', msg: 'Tu poses le pied dans le vide… Tu tombes, tombes… et te réveilles à l\'entrée de l\'arène.', decoChute: 'abime' },
""" + ''.join(f"      {c}: {{ sol: 'abime', deco: {{ k: 'pont_ombre', r: {i} }} }},\n" for i, c in enumerate('abcde')) + ''.join(f"      {c}: {{ prop: 'torche_ombre', reg: {{ set: [{i}, 1] }}, use: true, msg: 'La torche s\\'embrase ! Une lueur violette dessine une passerelle au-dessus du vide.', son: 'select' }},\n" for i, c in enumerate('LMNOQ')) + r"""      X: { porte: { tous: [0, 1, 2, 3, 4] }, ferme: 'bloc', o: 'grille_ouverte', f: 'grille_ombre' },
      U: { t: 'sol' },
    },
    dresseurs: [{ dir: 'right', vue: 3 }, { dir: 'down', vue: 2 }, { dir: 'down', vue: 2 }, { dir: 'down', vue: 2 }, { dir: 'right', vue: 2 }],
""")

# ---------------------------------------------------------------- 9. Aurèle (Vol) : les Hauteurs — îles volantes et canons à vent qui pivotent après chaque tir (Mistrale, Atalanopolis)
P = Plan(32)
P.rect(1, 1, 23, 21, 'v')
CXS, CYS = (4, 12, 20), (4, 11, 18)
NOMS = 'ABDFHIJMN'      # cases d'arrivée des neuf îles
Q0 = [2, 1, 0, 2, 3, 2, 2, 3, 0]   # trouvé par recherche : 24 coups au moins (tirs, manivelles, trajets)
for i in range(9):
    c, r = i % 3, i // 3; cx, cy = CXS[c], CYS[r]
    P.rect(cx - 2, cy - 1, cx + 2, cy + 1, '.')
P.rect(8, 1, 16, 5, '.'); P.rect(10, 1, 14, 2, '_'); P.put(12, 1, 'C'); P.put(8, 1, 'p'); P.put(16, 1, 'p')   # île du Champion
P.rect(10, 17, 14, 21, '.')                                          # l'île de l'entrée descend jusqu'à la porte
# passerelles fixes : entrée – île sud-ouest, île sud-ouest – île ouest, île est – île sud-est
P.rect(4, 13, 4, 16, '='); P.rect(20, 13, 20, 16, '='); P.rect(20, 6, 20, 9, '='); P.rect(4, 6, 4, 9, '=')
LEGC = []
for i in range(9):
    c, r = i % 3, i // 3; cx, cy = CXS[c], CYS[r]
    if i == 1: cx, cy = 12, 4
    if i != 0: P.put(cx, cy, 'abcdefhjk'[i])   # l'île nord-ouest n'a pas de canon
    P.put(cx - 1, cy, NOMS[i])
    cib = {}
    for d, (dc, dr) in (('up', (0, -1)), ('right', (1, 0)), ('down', (0, 1)), ('left', (-1, 0))):
        c2, r2 = c + dc, r + dr
        if 0 <= c2 < 3 and 0 <= r2 < 3: cib[d] = NOMS[r2 * 3 + c2]
    if i != 0: LEGC.append(f"'{'abcdefhjk'[i]}': {{ canon: {{ r: {i}, cibles: {cib} }} }}")
P.put(21, 3, 'K')                                                    # manivelle de l'île nord-est : fait pivoter son canon
P.put(5, 3, 'Z')                                                     # manivelle de l'île nord-ouest : fait pivoter le canon du sud-ouest
P.put(3, 10, '1'); P.put(21, 12, '2'); P.put(5, 19, '3'); P.put(13, 11, '4'); P.put(2, 5, '5')
P.hall(22)
arene(9, P, r"""
    type: 'flying', sol: 'gymCiel', regs: """ + str(Q0) + r""", minActions: 14,
    regles: [
      'ARÈNE DE PORT-LISIÈRE — LES HAUTEURS\nChampion : Aurèle, le maître des vents.',
      'Les canons à vent te propulsent vers l\'île qu\'ils visent. Après chaque tir, le canon pivote d\'un quart de tour (dans le sens des aiguilles d\'une montre).',
      'Un canon qui vise le vide ne tire pas. Deux manivelles font tourner un canon à la main : celle du nord-est le sien, celle du nord-ouest celui de l\'île du sud-ouest.',
      'Conseil d\'Aurèle : « L\'Électrik, la Glace et la Roche me clouent au sol. Encore faut-il m\'atteindre ! »',
    ],
    legende: {
      v: { t: 'bloc', deco: 'ciel' },
      '=': { deco: 'passerelle_ciel' },
      K: { prop: 'manivelle', reg: { inc: [2, 4] }, use: true, msg: 'Tu tournes la manivelle : le canon de l\'île pivote d\'un quart de tour.', son: 'select' },
      Z: { prop: 'manivelle', reg: { inc: [6, 4] }, use: true, msg: 'Tu tournes la manivelle : au loin, le canon de l\'île du sud-ouest pivote d\'un quart de tour.', son: 'select' },
""" + ''.join(f"      {c}: {{ deco: 'arrivee_vent' }},\n" for c in NOMS) + ',\n'.join('      ' + l for l in LEGC) + r""",
    },
    dresseurs: [{ dir: 'right', vue: 2 }, { dir: 'left', vue: 2 }, { dir: 'right', vue: 3 }, { dir: 'left', vue: 1 }, { dir: 'right', vue: 2 }],
""")

# ---------------------------------------------------------------- 13. Lilas (Fée) : le Jardin de Cristal — rayon de lumière et miroirs ; le rayon barre le passage (Méandropolis, Romant-sous-Bois)
P = Plan(32)
# jardin trouvé par recherche (miroirs, rosiers, cristal) : 9 coups de miroir au moins
for y, r in enumerate([
    '#########################',
    '#...g...p___C___p...g...#',
    '#........_______........#',
    '############X#####Z######',
    '#.............4.........#',
    '#.rrr........r.rr..r.rl.#',
    '#.j.r.k...........a.r...#',
    '#.rr.r...rrr.rr..r...rr.#',
    '#...r......rr.rr.r.rr...#',
    '#...r..r..rrrrrr.....r..#',
    '#..3.r...r.r..rr.r.rr...#',
    '#......r.....r...r.r.rr.#',
    '#Y......b..rrrr.rr...rr.#',
    '#.rr...r....r.......rr..#',
    '#..rr..r......r.r.rr2rr.#',
    '#.rrr....r...rrr.r......#',
    '#.r.......r.r.rr.r.r.r..#',
    '#.rrrr.r.rrdrrr..r.r..r.#',
    '#.rrr.h.c...............#',
    '#...r..r.r.r..rrr..rrr..#',
    '#....1.........r........#',
    '#.......................#',
]):
    P.row(y, 0, r)
MIR = {'a': ((0, 0), '\\', 0), 'b': ((0, 0), '\\', 0), 'c': ((0, 0), '\\', 0), 'd': ((0, 0), '/', 0), 'h': ((0, 0), '\\', 0), 'j': ((0, 0), '\\', 0), 'k': ((0, 0), '\\', 0), 'l': ((0, 0), '/', 0)}
P.hall(22)
arene(13, P, r"""
    type: 'fairy', sol: 'gymCristal', minActions: 8, rayonBloque: true,
    regs: [0, 0, 1, 0, 0, 1, 1, 0],
    regles: [
      'ARÈNE DE ROSEBRUME — LE JARDIN DE CRISTAL\nChampionne : Lilas, la fée des roses.',
      'Un rayon de lumière traverse le jardin. Personne ne peut le franchir… mais les miroirs le font tourner : examine-les pour les faire pivoter.',
      'Quand le rayon touche le cristal au-dessus de la grille, celle-ci s\'ouvre. Mais attention à ne pas te barrer la route !',
      'Conseil de Lilas : « Le Poison et l\'Acier fanent mes roses. Mais la lumière, elle, se laisse guider. »',
    ],
    legende: {
      r: { t: 'bloc', deco: 'buisson_rose' },
      Y: { t: 'sol' }, Z: { t: 'mur' },
""" + ''.join(f"      {ch}: {{ miroir: '{'/' if b == '/' else chr(92) * 2}', r: {i} }},\n" for i, (ch, (_, b, _)) in enumerate(MIR.items())) + r"""      X: { porte: { rayon: 0 }, ferme: 'bloc', o: 'grille_ouverte', f: 'grille_cristal' },
    },
    lasers: [{ c: 'Y', dir: 'right', cible: 'Z' }],
    dresseurs: [{ dir: 'right', vue: 3 }, { dir: 'left', vue: 3 }, { dir: 'right', vue: 3 }, { dir: 'left', vue: 3 }],
""")

# ---------------------------------------------------------------- 12. Ferdinand (Acier) : la Fonderie — tapis roulants à sens unique, deux inverseurs (Charbourg, Joliberge)
# configuration trouvée par recherche : 38 coups au moins (trajets et leviers)
P = Plan(32)
CFG12 = [(0, 1), (0, 0), (0, 1), (1, 0), (0, 1), (1, 1), (1, 0), (0, 0), (1, 0), (0, 0), (0, 1), (0, 0), (0, 1), (0, 1), (1, 1), (0, 0), (0, 0), (1, 0), (0, 0)]
LEV12 = {(0, 0): 0, (1, 0): 1, (2, 0): 1, (0, 1): 1, (0, 2): 1, (0, 3): 1, 'S': 1, 'G': 0}
TAPIS = {}
def tapis(d, g):
    if (d, g) not in TAPIS: TAPIS[(d, g)] = 'abcdefhj'[len(TAPIS)]
    return TAPIS[(d, g)]
cars = []
for (a, b), (g, fw) in zip(aretes_archipel(), CFG12):
    if a == 'S' or b == 'G': d = 'up' if fw else 'down'
    elif a[1] == b[1]: d = 'right' if fw else 'left'
    else: d = 'down' if fw else 'up'
    cars.append(tapis(d, g))
archipel(P, '#', cars)
for p_, g in LEV12.items():
    ch = 'K' if g == 0 else 'Q'
    if p_ == 'S': continue
    if p_ == 'G': P.put(20, 1, ch)
    else: P.put(*ile(p_[0], p_[1], 1, -1), ch)
for i, (c, r, dx, dy) in enumerate([(2, 3, 2, 1), (0, 2, -2, 1), (2, 1, 2, 1), (1, 2, -2, -1)]): P.put(*ile(c, r, dx, dy), str(i + 1))
P.hall(22)
P.put(14, 24, 'Q')   # un levier bleu dans le hall de l'entrée
arene(12, P, r"""
    type: 'steel', sol: 'gymAcier', regs: [0, 0], minActions: 6,
    regles: [
      'ARÈNE DE FORGE-ACIER — LA FONDERIE\nChampion : Ferdinand, le forgeron.',
      'Les tapis roulants ne vont que dans un sens. Les tapis ROUGES et les tapis BLEUS ont chacun leur inverseur.',
      'Abaisse un levier rouge et tous les tapis rouges repartent dans l\'autre sens ; pareil pour les bleus. Un levier bleu attend dans le hall.',
      'Conseil de Ferdinand : « Le Feu, le Sol et le Combat font fondre mon acier. Mais ma fonderie, elle, ne s\'arrête jamais ! »',
    ],
    legende: {
""" + ''.join(f"      {c}: {{ fleche: '{d}', r: {g}, mul: 2, decoFleche: 'tapis_{'rouge' if g == 0 else 'bleu'}' }},\n" for (d, g), c in TAPIS.items()) + r"""      K: { prop: 'levier_rouge', reg: { inc: [0, 2] }, use: true, msg: 'Clac ! Tu abaisses le levier rouge : tous les tapis rouges changent de sens.', son: 'select' },
      Q: { prop: 'levier_bleu', reg: { inc: [1, 2] }, use: true, msg: 'Clac ! Tu abaisses le levier bleu : tous les tapis bleus changent de sens.', son: 'select' },
    },
    dresseurs: [{ dir: 'left', vue: 2 }, { dir: 'right', vue: 2 }, { dir: 'left', vue: 2 }, { dir: 'right', vue: 2 }],
""")

