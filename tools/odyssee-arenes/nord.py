# Arènes du nord (1 à 7), peintes case par case ; lu par dessiner.py (Plan, arene). Chaque arène : un plan de 25 colonnes,
# sa légende propre (en plus de la légende commune de world/arenes-plan.js), ses registres, ses règles et ses dresseurs.
# ---------------------------------------------------------------- 0. Hector (Insecte) : la Ruche — murs de cire de cinq couleurs, ruchers qui en font fondre ou rebâtir plusieurs à la fois (Volucité, Écorcia)
# configuration trouvée par recherche : 9 ruchers au moins, 432 états
P = Plan(32)
T0 = ['w', None, '3', None, '3', 'w', '1', '3', '2', '1', '0', '4', '4', '4', 'w', '0', 'w', 'w', '4']
SW0 = {(0, 0): (1, 2), (1, 0): (0, 2, 3), (0, 1): (2, 3), (1, 1): (0, 1), (2, 1): (0, 1, 4), (0, 2): (2, 3, 4), (1, 2): (0, 3, 4), (2, 2): (0, 3, 4), (1, 3): (1,), (2, 3): (0, 3, 4)}
R00 = [0, 0, 1, 0, 0]
archipel(P, 'v', [None if t is None else '.' if t == 'w' else 'abcde'[int(t)] for t in T0])
RCH = {}
for (c, r), fl in SW0.items():
    ch = RCH.setdefault(fl, 'KLMNQUVWXYZ'[len(RCH)]); P.put(*ile(c, r, 1, -1), ch)
P.put(*ile(2, 0, 2, 1), 'o'); P.put(*ile(0, 3, -2, -1), 'o')
for i, (c, r, dx, dy) in enumerate([(2, 3, 2, -1), (0, 2, -2, 1), (2, 1, 2, -1), (0, 0, -2, 1)]): P.put(*ile(c, r, dx, dy), str(i + 1))
P.put(*ile(1, 3, -2, 1), 'p'); P.put(*ile(1, 3, 2, 1), 'p')
P.hall(22)
COUL = ['AMBRE', 'ROUGE', 'VERTE', 'BLEUE', 'VIOLETTE']
L0 = [f"{'abcde'[k]}: {{ porte: {{ r: {k}, eq: 1 }}, ferme: 'bloc', o: 'cire_ouverte_{k}', f: 'cire_{k}' }}" for k in range(5)]
for fl, ch in RCH.items():
    noms = ', '.join(COUL[k] for k in fl)
    L0.append(f"{ch}: {{ prop: 'ruche_{''.join(map(str, fl))}', reg: {{ flip: {list(fl)} }}, use: true, msg: 'Bzzz… Les abeilles s\\'affairent : les murs de cire {noms} fondent ou se rebâtissent !', son: 'select' }}")
arene(0, P, r"""
    type: 'bug', sol: 'gymBug', regs: """ + str(R00) + r""", minActions: 8,
    regles: [
      'ARÈNE DE SYLVEBOURG — LA RUCHE\nChampion : Hector, l\'apiculteur.',
      'Des murs de cire de cinq couleurs ferment les passages entre les alvéoles : AMBRE, ROUGE, VERTE, BLEUE et VIOLETTE.',
      'Chaque rucher, quand on le secoue, fait fondre ou rebâtir les murs de SES couleurs (regarde ses bandes). Un mur fondu se rebâtit si l\'on secoue encore un rucher de sa couleur !',
      'Conseil d\'Hector : « Le Feu, le Vol et la Roche font fuir mes abeilles. Mais il faut d\'abord trouver le chemin de la reine ! »',
    ],
    legende: {
      v: { t: 'bloc', deco: 'alveoles' },
""" + ',\n'.join('      ' + l for l in L0) + r""",
    },
    dresseurs: [{ dir: 'left', vue: 2 }, { dir: 'right', vue: 2 }, { dir: 'left', vue: 2 }, { dir: 'right', vue: 2 }],
""")

# ---------------------------------------------------------------- 1. Marine (Eau) : le Barrage — deux bassins, trois niveaux d'eau (Crasher Wake, Verchamps)
# configuration trouvée par recherche (10 manœuvres de vannes au minimum) : type de chaque passage, son bassin, les vannes des îles
P = Plan(32)
T1 = ['w', 'a', None, 'r', 's', 'a', 'b', 'b', 'b', 'w', 'b', 's', 'r', 'w', 'r', 'b', 'r', 'w', 'r']
B1 = [0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0]
V1 = {(0, 0): (1, 0), (1, 0): (0, 1), (2, 0): (1, 1), (0, 1): (1, 2), (1, 1): (0, 2), (2, 1): (0, 2), (0, 2): (0, 1), (2, 2): (1, 1), (0, 3): (0, 0), (2, 3): (1, 0)}
CARS1 = {}
def car1(t, b):
    if t is None: return None
    if t == 'w': return '='
    return CARS1.setdefault((t, b), 'abdfhjkltuxyz'[len(CARS1)])
archipel(P, '~', [car1(t, b) for t, b in zip(T1, B1)])
VCH = {}
for (c, r), (b, v) in V1.items():
    ch = VCH.setdefault((b, v), 'qmQnMNKWY'[len(VCH)]); x, y = ile(c, r, 1, 0); P.put(x, y, ch)
P.put(*ile(0, 0, -2, -1), 'o')
for i, (c, r, dx, dy) in enumerate([(2, 3, -2, 1), (0, 2, -2, -1), (2, 1, 2, -1), (1, 1, -2, 1), (0, 0, 2, 1)]): P.put(*ile(c, r, dx, dy), str(i + 1))
P.put(*ile(1, 3, -2, 1), 'p'); P.put(*ile(1, 3, 2, 1), 'p')
P.hall(22)
LEG1 = []
NIV = {'a': ('eq', 0), 'b': ('le', 1), 's': ('ge', 1), 'r': ('eq', 2)}
for (t, b), ch in CARS1.items():
    op, v = NIV[t]
    LEG1.append(f"{ch}: {{ porte: {{ r: {b}, {op}: {v} }}, ferme: 'eau', o: '{'ponton' if t in 'ab' else 'radeau'}', f: 'eau' }}")
NOMB = ['OUEST', 'EST']; NOMN = ['BAS', 'MOYEN', 'HAUT']
for (b, v), ch in VCH.items():
    LEG1.append(f"{ch}: {{ reg: {{ set: [{b}, {v}] }}, pad: 'vanne', g: '{b}{v}', msg: 'Les vannes grincent : le bassin {NOMB[b]} passe au niveau {NOMN[v]}.' }}")
arene(1, P, r"""
    type: 'water', sol: 'gymWater', regs: [1, 1], minActions: 9,
    regles: [
      'ARÈNE DE PORT-AZUR — LE BARRAGE\nChampionne : Marine, la dompteuse de vagues.',
      'Le barrage a DEUX bassins : l\'OUEST (vannes bleues) et l\'EST (vannes vertes). Chaque vanne règle un bassin sur un niveau : BAS, MOYEN ou HAUT.',
      'Eau basse : les pontons de pierre sortent de l\'eau. Eau haute : les radeaux montent jusqu\'aux quais. Certains pontons restent hors de l\'eau tant qu\'elle n\'est pas HAUTE, certains radeaux flottent dès qu\'elle est MOYENNE.',
      'Regarde bien de quel bassin dépend chaque passage avant de tourner une vanne !',
      'Conseil de Marine : « L\'Électrik et la Plante n\'aiment pas mes vagues… mais les vagues, elles, s\'en moquent ! »',
    ],
    legende: {
""" + ',\n'.join('      ' + l for l in LEG1) + r""",
      '=': { deco: 'passerelle_bois' },
    },
    dresseurs: [{ dir: 'up', vue: 2 }, { dir: 'right', vue: 3 }, { dir: 'left', vue: 3 }, { dir: 'right', vue: 3 }, { dir: 'left', vue: 3 }],
""")

# ---------------------------------------------------------------- 2. Volta (Électrik) : la Centrale — barrières à polarité (Voltère, Lavandia) et trois fusibles (Major Bob)
# configuration trouvée par recherche (18 actions au minimum : 15 inversions et 3 fusibles)
P = Plan(32)
T2 = ['r', 'b', None, 'r', None, 'b', 'r', None, None, 'b', 'r', 'b', None, 'b', 'r', None, 'r', 'w', 'w']
PADS2 = [(0, 1), (1, 2), (2, 1), (0, 0), (1, 1), (0, 3), (2, 0), (2, 3), (0, 2), (2, 2), (1, 0), (1, 3)]
FUS2 = [(1, 0), (2, 0), (2, 3)]
archipel(P, 'M', [None if t is None else '.' if t == 'w' else t for t in T2])
P.put(12, 2, 'D')
for (c, r) in PADS2: P.put(*ile(c, r, 2, 1), 'T')
for k, (c, r) in enumerate(FUS2): P.put(*ile(c, r, -2, -1), 'FfY'[k])
for i, (c, r, dx, dy) in enumerate([(0, 3, -2, -1), (2, 2, -2, -1), (0, 1, -2, 1), (1, 1, 2, -1)]): P.put(*ile(c, r, dx, dy), str(i + 1))
P.hall(22)
arene(2, P, r"""
    type: 'electric', sol: 'gymElec', regs: [0, 0, 0, 0], minActions: 15,
    regles: [
      'ARÈNE DE VOLTACITÉ — LA CENTRALE\nChampionne : Volta, l\'étincelle de la région.',
      'Chaque dalle-éclair inverse le courant de TOUTE la centrale : les barrières rouges se lèvent quand les bleues s\'abaissent, et inversement.',
      'La porte du générateur ne s\'ouvre qu\'avec ses TROIS fusibles, rangés dans les armoires de trois îlots.',
      'Conseil de Volta : « Le Sol ne craint pas mes éclairs. Mais il faut encore réussir à l\'amener jusqu\'à moi ! »',
    ],
    legende: {
      M: { prop: 'machine' },
      r: { porte: { r: 0, eq: 1 }, ferme: 'r' },
      b: { porte: { r: 0, eq: 0 }, ferme: 'b' },
      T: { reg: { inc: [0, 2] }, pad: 'eclair', msg: 'Bzzzt ! Le courant s\'inverse dans toute la centrale.', son: 'select' },
      F: { prop: 'armoire_elec', reg: { set: [1, 1] }, use: true, msg: 'Tu enclenches un fusible. Un voyant vert s\'allume au-dessus de la porte du générateur.' },
      f: { prop: 'armoire_elec', reg: { set: [2, 1] }, use: true, msg: 'Tu enclenches un fusible. Un deuxième voyant vert s\'allume.' },
      Y: { prop: 'armoire_elec', reg: { set: [3, 1] }, use: true, msg: 'Tu enclenches un fusible. Un voyant vert s\'allume au-dessus de la porte du générateur.' },
      D: { porte: { tous: [1, 2, 3], eq: 1 }, ferme: 'bloc', o: 'tapis_metal', f: 'porte_gen' },
    },
    dresseurs: [{ dir: 'right', vue: 2 }, { dir: 'right', vue: 3 }, { dir: 'right', vue: 3 }, { dir: 'left', vue: 3 }],
""")

# ---------------------------------------------------------------- 3. Flora (Plante) : le Jardin des Floraisons — dalles-pétales (Lights Out), haies qui s'ouvrent
# registres : 0-3 parterre du bas (4 fleurs), 4 sa haie ; 5-9 parterre du milieu (5 fleurs), 10 sa haie ; 11-19 carré de la Reine (3 × 3), 20 la dernière haie.
# Dalles choisies par recherche : 3 pas au moins en bas, 4 au milieu ; le carré part de trois fleurs ouvertes et en demande 8.
P = Plan(32)
P.rect(1, 1, 23, 2, '.'); P.rect(8, 1, 16, 2, '_'); P.put(12, 1, 'C'); P.put(8, 1, 'p'); P.put(16, 1, 'p'); P.put(4, 1, 'g'); P.put(20, 1, 'g')
P.rect(1, 3, 23, 3, '#'); P.put(12, 3, 'J')
P.rect(1, 4, 23, 7, '.')
P.row(4, 11, 'abc'); P.row(5, 11, 'dej'); P.row(6, 11, 'fhk')               # le carré de la Reine : chaque dalle fleurit avec ses voisines
P.rect(1, 8, 23, 8, '#'); P.put(20, 8, 'I')
P.rect(1, 9, 23, 14, '.')
P.row(11, 6, 'BlBmBnBuBvB')                                                  # parterre du milieu (5 fleurs)
P.col(18, 12, '###'); P.col(8, 9, '##'); P.col(15, 9, '#')                   # haies qui découpent le jardin
P.put(4, 13, 'M'); P.put(10, 13, 'N'); P.put(12, 9, 'O'); P.put(21, 13, 'P'); P.put(14, 13, 'Q'); P.put(20, 9, 'Z')
P.rect(1, 15, 23, 15, '#'); P.put(4, 15, 'H')
P.rect(1, 16, 23, 21, '.')
P.row(18, 7, 'BxByBzBwB')                                                    # parterre du bas (4 fleurs)
P.put(12, 20, 'q'); P.put(5, 18, 'r'); P.put(19, 18, 's'); P.put(9, 16, 't'); P.put(16, 21, 'U')
P.put(1, 16, 'p'); P.put(23, 16, 'p'); P.put(1, 9, 'p'); P.put(23, 14, 'p'); P.put(1, 4, 'p'); P.put(23, 4, 'p')
P.put(8, 20, '1'); P.put(2, 10, '2'); P.put(22, 11, '3'); P.put(17, 5, '4'); P.put(6, 6, '5')
P.hall(22)
BAS3 = {'q': (0, 2), 'r': (1, 2, 3), 's': (0, 1), 't': (0, 1, 2), 'U': (0, 2, 3)}
MIL3 = {'M': (2, 3), 'N': (0, 1), 'O': (1, 4), 'P': (0, 1, 2), 'Q': (0, 3, 4), 'Z': (0, 3)}
CARRE = 'abcdejfhk'
voisins = lambda i: [j for j in range(9) if abs(j % 3 - i % 3) + abs(j // 3 - i // 3) <= 1]
L3 = ["B: { t: 'bloc', deco: 'parterre' }"]
for ch, r in zip('xyzw', range(4)): L3.append(f"{ch}: {{ t: 'bloc', deco: 'parterre', fleur: {r} }}")
for ch, f in BAS3.items(): L3.append(f"{ch}: {{ reg: {{ flip: {list(f)}, sauf: {{ r: 4, eq: 1 }} }}, pad: 'dalle_petale', son: 'select' }}")
L3.append("H: { porte: { r: 4, eq: 1 }, ferme: 'bloc', o: 'arche_fleurie', f: 'haie' }")
for ch, r in zip('lmnuv', range(5, 10)): L3.append(f"{ch}: {{ t: 'bloc', deco: 'parterre', fleur: {r} }}")
for ch, f in MIL3.items(): L3.append(f"{ch}: {{ reg: {{ flip: {[5 + i for i in f]}, sauf: {{ r: 10, eq: 1 }} }}, pad: 'dalle_petale', son: 'select' }}")
L3.append("I: { porte: { r: 10, eq: 1 }, ferme: 'bloc', o: 'arche_fleurie', f: 'haie' }")
for i, ch in enumerate(CARRE): L3.append(f"{ch}: {{ fleur: {11 + i}, reg: {{ flip: {[11 + j for j in voisins(i)]}, sauf: {{ r: 20, eq: 1 }} }}, son: 'select' }}")
L3.append("J: { porte: { r: 20, eq: 1 }, ferme: 'bloc', o: 'arche_fleurie', f: 'haie' }")
R3 = [0] * 21
for i in (1, 3, 8): R3[11 + i] = 1
arene(3, P, r"""
    type: 'grass', sol: 'gymGrass', minActions: 14,
    regs: """ + str(R3) + r""",
    regles: [
      'ARÈNE DE FLORALIA — LE JARDIN DES FLORAISONS\nChampionne : Flora, la reine des serres.',
      'Chaque dalle-pétale fait éclore (ou refermer) certaines fleurs du parterre voisin. Une haie s\'ouvre quand TOUT le parterre est en fleur.',
      'Une fois la haie ouverte, le parterre reste fleuri : ses dalles ne répondent plus.',
      'Dans le carré de la Reine, chaque dalle fait éclore ou refermer ses voisines : avance avec soin, chaque pas compte !',
      'Conseil de Flora : « Le Feu et le Vol me font des misères… Mais mes fleurs ont des épines. »',
    ],
    legende: {
""" + ',\n'.join('      ' + l for l in L3) + r""",
    },
    verrous: [
      { si: { tous: [0, 1, 2, 3] }, set: [4, 1] },
      { si: { tous: [5, 6, 7, 8, 9] }, set: [10, 1] },
      { si: { tous: [11, 12, 13, 14, 15, 16, 17, 18, 19] }, set: [20, 1] },
    ],
    dresseurs: [{ dir: 'right', vue: 3 }, { dir: 'right', vue: 4 }, { dir: 'left', vue: 4 }, { dir: 'left', vue: 4 }, { dir: 'right', vue: 3 }],
""")

# ---------------------------------------------------------------- 4. Sibylle (Psy) : le Palais des Songes — neuf salles, téléporteurs de trois couleurs (Morgane, Lévy et Tatia)
# Les orbes changent la phase du palais : téléporteurs violets en phase lune (0), dorés en phase soleil (1), blancs toujours.
P = Plan(32)
SALLES = {'L': 1, 'M': 9, 'R': 17}, {'T': 1, 'M': 8, 'B': 15}
P.rect(1, 1, 23, 21, '.')
for x in (8, 16): P.rect(x, 1, x, 21, '#')
for y in (7, 14): P.rect(1, y, 23, y, '#')
def salle(nom):
    x0 = SALLES[0][nom[1]]; y0 = SALLES[1][nom[0]]; y1 = 21 if nom[0] == 'B' else y0 + 5
    return x0, y0, x0 + 6, y1
LIENS = {  # salle : [(couleur, destination)] — w blanc, v violet (lune), y doré (soleil), z bleu (étoile) ; trouvé par recherche : 6 bascules au moins
    'BL': [('w', 'MR'), ('z', 'MM'), ('w', 'BR')],
    'BM': [('z', 'ML'), ('v', 'BR'), ('y', 'BR')],
    'BR': [('z', 'MM'), ('w', 'MR'), ('y', 'BL')],
    'ML': [('z', 'MM'), ('w', 'BL'), ('y', 'TR')],
    'MM': [('y', 'TL'), ('y', 'MR'), ('v', 'ML')],
    'MR': [('w', 'BM'), ('v', 'BM')],
    'TL': [('w', 'MR'), ('z', 'BL'), ('w', 'ML')],
    'TR': [('v', 'TM'), ('v', 'MR'), ('w', 'MM')],
    'TM': [('w', 'BM')],
}
ORBES = ('BM', 'MM', 'TL', 'TR')
POOL = iter('abcdefhjklmnqrstuvxyzABDFHIJMNPQTUVWXY!$%&+=?@^')
ARR = {}
LEG = []
for nom in ['TL', 'TM', 'TR', 'ML', 'MM', 'MR', 'BL', 'BM', 'BR']:
    x0, y0, x1, y1 = salle(nom); xc = (x0 + x1) // 2
    c = next(POOL); ARR[nom] = c
    ay = y1 - 1 if nom != 'BM' else y1 - 2
    if nom == 'TM': ay = y1 - 1
    P.put(xc, ay, c); LEG.append(f"'{c}': {{ deco: 'arrivee' }}")
for nom, L in LIENS.items():
    x0, y0, x1, y1 = salle(nom); xc = (x0 + x1) // 2; ym = (y0 + y1) // 2
    places = [(x0 + 1, y0 + 1), (x1 - 1, y0 + 1), (xc, y0 + 1)] if nom[0] != 'T' else [(x0 + 1, y0 + 1), (x1 - 1, y0 + 1), (x0 + 1, y1 - 1)]
    if nom == 'TM': places = [(10, 5)]
    for (col, dest), (x, y) in zip(L, places):
        c = next(POOL); P.put(x, y, c)
        if col == 'w': LEG.append(f"'{c}': {{ tp: '{ARR[dest]}', padTp: 'tp' }}")
        else:
            ph = 'vyz'.index(col); nt = ['tp_lune', 'tp_soleil', 'tp_etoile'][ph]
            LEG.append(f"'{c}': {{ tp: '{ARR[dest]}', pad: false, porte: {{ r: 0, eq: {ph} }}, ferme: 'bloc', o: '{nt}', f: '{nt}_off' }}")
    if nom in ORBES: P.put(xc, ym, 'O')
# salle du trône (TM) : Sibylle sur son estrade
P.rect(10, 1, 14, 3, '_'); P.put(12, 2, 'C'); P.put(9, 1, 'p'); P.put(15, 1, 'p'); P.put(9, 5, 'g'); P.put(15, 5, 'g')
for x, y in ((1, 21), (7, 21), (17, 21), (23, 21), (1, 13), (23, 13), (7, 6), (17, 6), (23, 8), (1, 8)): P.put(x, y, 'p')
P.put(14, 19, '1'); P.put(4, 11, '2'); P.put(10, 11, '3'); P.put(20, 19, '4'); P.put(3, 3, '5')
P.hall(22)
arene(4, P, r"""
    type: 'psychic', sol: 'gymPsy', regs: [0], minActions: 6,
    regles: [
      'ARÈNE DE MIRAGE — LE PALAIS DES SONGES\nChampionne : Sibylle, la voyante.',
      'Les téléporteurs mènent d\'une salle à l\'autre. Les BLANCS marchent toujours ; les VIOLETS en phase de LUNE, les DORÉS en phase de SOLEIL, les BLEUS en phase d\'ÉTOILE.',
      'Quatre orbes de cristal font passer le palais à la phase suivante : lune, puis soleil, puis étoile, puis de nouveau lune. Retiens bien d\'où part chaque téléporteur !',
      'Conseil de Sibylle : « Mes visions sont claires… sauf face aux Spectres et aux Ténèbres. »',
    ],
    legende: {
      O: { prop: 'orbe', reg: { inc: [0, 3] }, use: true, msg: 'Tu poses la main sur l\'orbe… La lumière du palais passe à la phase suivante !', son: 'select' },
""" + ',\n'.join('      ' + l for l in LEG) + r""",
    },
    dresseurs: [{ dir: 'left', vue: 3 }, { dir: 'right', vue: 3 }, { dir: 'up', vue: 3 }, { dir: 'left', vue: 3 }, { dir: 'right', vue: 3 }],
""")

# ---------------------------------------------------------------- 5. Basalte (Roche) : la Carrière — rochers à pousser dans les fosses (Rocky, Charbourg, Argenta)
P = Plan(32)
for y, r in enumerate([
    '#########################',
    '#...g...p___C___p...g...#',
    '#......._________.......#',
    '#.....4.............3...#',
    '#p......1..............p#',
    '#rrrrrrrrrrr.rrrrrrrrrrr#',
    '#rrrrrrrrrrrXrrrrrrrrrrr#',
    '#rrrrrrrrrrrXrrrrrrrrrrr#',
    '#rrrrrr....r..rr.Zrrrrrr#',
    '#rrrrrr.R.........rrrrrr#',
    '#rrrrrr..rr.R.r...rrrrrr#',
    '#rrrrrr.......r.r.rrrrrr#',
    '#rrrrrrr2.r.......rrrrrr#',
    '#rrrrrrrrrrrXrrrrrrrrrrr#',
    '#rrrrrrrrrrr.rrrrrrrrrrr#',
    '#rrrrrrrrrrrXrrrrrrrrrrr#',
    '#rrrrrrr...r.....rrrrrrr#',
    '#rrrrrrr.Rrr.....rrrrrrr#',
    '#rrrrrrr...R.rr.rrrrrrrr#',
    '#rrrrrrr....r.r..rrrrrrr#',
    '#rrrrrrr........Zrrrrrrr#',
    '#rrrrrrr........rrrrrrrr#',
]):
    P.row(y, 0, r)
P.hall(22)
arene(5, P, r"""
    type: 'rock', sol: 'gymRock', minActions: 20,
    regles: [
      'ARÈNE DE PORT-GRANIT — LA CARRIÈRE\nChampion : Basalte, le tailleur de pierre.',
      'Pousse les rochers dans les fosses pour te faire un passage. Un rocher coincé contre un mur n\'en bougera plus !',
      'Si tu bloques un passage, le pupitre près de l\'entrée remet la carrière comme au début.',
      'Conseil de Basalte : « L\'Eau et la Plante usent mes rochers… mais il en faut, de la patience ! »',
    ],
    legende: {
      r: { t: 'bloc', deco: 'roche_gym' },
      X: { fosse: true },
    },
    dresseurs: [{ dir: 'right', vue: 3 }, { dir: 'left', vue: 3 }, { dir: 'down', vue: 3 }, { dir: 'left', vue: 3 }, { dir: 'right', vue: 3 }],
""")

# ---------------------------------------------------------------- 6. Pyros (Feu) : la Forge — deux réseaux de coulées à aiguiller, sol crevé, gardiens du savoir (Cramois'Île, Vermilava)
# configuration trouvée par recherche : 15 coups de vanne au moins
P = Plan(32)
T6 = ['c', 'd', 'b', 'c', 'a', 'b', 'a', 'a', None, 'a', None, 'd', 'c', 'c', 'b', None, 'b', 'w', 'd']
V6 = {(0, 0): 1, (1, 0): 0, (2, 0): 0, (1, 1): 0, (2, 1): 0, (0, 2): 0, (1, 2): 0, (2, 2): 1, (0, 3): 0, (1, 3): 0, (2, 3): 0}
archipel(P, 'L', [None if t is None else '.' if t == 'w' else t for t in T6])
for (c, r), k in V6.items(): P.put(*ile(c, r, 1, 0), 'VW'[k])
for c, r, dx, dy in [(2, 1, 2, 1), (0, 1, -2, 1), (1, 2, 2, -1), (2, 0, -2, -1), (0, 2, 2, 1)]: P.put(*ile(c, r, dx, dy), 'h')
P.put(*ile(1, 3, -1, 1), 'U')
P.put(*ile(1, 0, -1, 0), 'K'); P.put(*ile(0, 2, -1, 0), 'K')
for i, (c, r, dx, dy) in enumerate([(2, 3, 2, 1), (0, 3, -2, 1), (1, 1, -2, -1), (2, 2, 2, -1), (0, 0, -2, 1)]): P.put(*ile(c, r, dx, dy), str(i + 1))
P.hall(22)
arene(6, P, r"""
    type: 'fire', sol: 'gymFire', regs: [0, 0], minActions: 12,
    regles: [
      'ARÈNE DE CENDRELUNE — LA FORGE\nChampion : Pyros, le maître des braises.',
      'La forge a DEUX réseaux de coulées : les vannes ROUGES aiguillent la lave orange, les vannes NOIRES la lave sombre. Quand une coulée se fige en pont, sa jumelle se remet à couler.',
      'Le sol de la forge est crevé par endroits : qui tombe dans un trou retourne en bas, à l\'entrée.',
      'Les gardiens du savoir ne laissent passer que ceux qui connaissent le feu… ou qui le prouvent au combat.',
      'Conseil de Pyros : « L\'Eau, la Roche et le Sol éteignent mes flammes. Encore faut-il tenir la chaleur ! »',
    ],
    legende: {
      a: { porte: { r: 0, eq: 1 }, ferme: 'lave', o: 'lave_figee', f: 'lave' },
      b: { porte: { r: 0, eq: 0 }, ferme: 'lave', o: 'lave_figee', f: 'lave' },
      c: { porte: { r: 1, eq: 1 }, ferme: 'lave', o: 'lave_figee2', f: 'lave' },
      d: { porte: { r: 1, eq: 0 }, ferme: 'lave', o: 'lave_figee2', f: 'lave' },
      V: { prop: 'vanne_lave', reg: { inc: [0, 2] }, use: true, msg: 'Tu tournes la vanne rouge… Une coulée orange se fige, l\'autre se remet à couler !', son: 'select' },
      W: { prop: 'vanne_lave2', reg: { inc: [1, 2] }, use: true, msg: 'Tu tournes la vanne noire… Une coulée sombre se fige, l\'autre se remet à couler !', son: 'select' },
      h: { chute: 'U', msg: 'Le sol crevé cède sous tes pieds… Tu retombes près de l\'entrée !', decoChute: 'trou_forge' },
      U: { deco: 'cendres' },
    },
    dresseurs: [{ dir: 'left', vue: 2 }, { dir: 'right', vue: 2 }, { dir: 'right', vue: 2 }, { dir: 'left', vue: 2 }, { dir: 'right', vue: 2 }],
""")

# ---------------------------------------------------------------- 7. Drakos (Dragon) : le Sanctuaire — ponts-dragons qui pivotent au-dessus du gouffre (Janusia)
SENS = ['up', 'right', 'down', 'left']; DXY = {'up': (0, -1), 'right': (1, 0), 'down': (0, 1), 'left': (-1, 0)}
def tourne(d, q): return SENS[(SENS.index(d) + q) % 4]
P = Plan(32)
P.rect(1, 1, 23, 21, 'v')
P.rect(1, 1, 23, 5, '.'); P.rect(9, 1, 15, 2, '_'); P.put(12, 1, 'C'); P.put(8, 1, 'p'); P.put(16, 1, 'p'); P.put(4, 2, 'g'); P.put(20, 2, 'g')
P.rect(1, 14, 23, 21, '.')                                          # parvis de l'entrée
P.rect(1, 7, 5, 12, '.'); P.rect(19, 7, 23, 12, '.')               # îlots des statues
PIVOTS = [  # (x, y, bras de base, quart de tour initial) — trouvé par recherche : 10 rugissements au moins
    (8, 8, ['down', 'left', 'right'], 0), (12, 8, ['up', 'right', 'down'], 3), (16, 8, ['left', 'right'], 2),
    (8, 11, ['down', 'left', 'right'], 0), (12, 11, ['up', 'right', 'down'], 0), (16, 11, ['up', 'right', 'down'], 0),
]
QUAIS = [(8, 13), (16, 6), (6, 8), (6, 11), (18, 8), (18, 11), (10, 8), (14, 8), (10, 11), (14, 11)]   # quais et piliers entre les bras
for x, y in QUAIS: P.put(x, y, '.')
LEGP = []; POOLP = iter('abcdefhjklmnqrstuxyz!$%&+=?@^')
for i, (x, y, bras, q0) in enumerate(PIVOTS):
    P.put(x, y, 'O')
    for d in SENS:
        dx, dy = DXY[d]; ouvert = [q for q in range(4) if any(tourne(b, q) == d for b in bras)]
        c = next(POOLP); P.put(x + dx, y + dy, c)
        LEGP.append(f"'{c}': {{ porte: {{ r: {i}, dans: {ouvert} }}, ferme: 'bloc', o: 'pont_dragon', f: 'gouffre', dirDeco: '{d}' }}")
STATUES = {'A': [1, 5], 'B': [0, 2], 'D': [3, 1], 'F': [4, 5]}       # chaque statue fait pivoter deux ponts d'un quart de tour
P.put(4, 17, 'A'); P.put(2, 8, 'B'); P.put(22, 11, 'D'); P.put(3, 4, 'F')
for x, y in ((1, 14), (23, 14), (1, 21), (23, 21), (1, 7), (23, 7), (1, 12), (23, 12)): P.put(x, y, 'p')
P.put(14, 17, '1'); P.put(3, 10, '2'); P.put(21, 9, '3'); P.put(19, 4, '4'); P.put(7, 19, '5')
P.hall(22)
regs7 = [q for (_, _, _, q) in PIVOTS]
arene(7, P, r"""
    type: 'dragon', sol: 'gymDragon', regs: """ + str(regs7) + r""", minActions: 10,
    regles: [
      'ARÈNE DE FORT-ÉCAILLE — LE SANCTUAIRE\nChampion : Drakos, le gardien des dragons.',
      'Les ponts-dragons pivotent au-dessus du gouffre. Chaque statue fait tourner DEUX ponts d\'un quart de tour.',
      'Regarde bien où mène chaque bras avant de toucher une statue : un pont tourné peut te couper la route du retour !',
      'Conseil de Drakos : « La Glace, la Fée et les Dragons eux-mêmes font trembler mes écailles. »',
    ],
    legende: {
      v: { t: 'bloc', deco: 'gouffre' },
      O: { deco: 'pivot_dragon' },
""" + ''.join(f"      {c}: {{ prop: 'statue_pont', reg: {{ inc: [{L[0]}, 4], puis: {{ inc: [{L[1]}, 4] }} }}, use: true, msg: 'La statue rugit… Deux ponts-dragons pivotent dans un grondement !', son: 'select' }},\n" for c, L in STATUES.items()) + ',\n'.join('      ' + l for l in LEGP) + r""",
    },
    dresseurs: [{ dir: 'left', vue: 4 }, { dir: 'right', vue: 3 }, { dir: 'left', vue: 3 }, { dir: 'left', vue: 4 }, { dir: 'right', vue: 4 }],
""")
