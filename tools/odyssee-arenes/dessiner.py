# Génère odyssee/js/world/arenes-plans.js : les plans des arènes (peints dans nord.py et sud.py), leur légende et leurs
# réglages (JS brut). Puis : node tools/test-odyssee-arenes-plan.mjs (solveur) et tools/test-odyssee-arenes-jeu.mjs (jeu).
#   python3 tools/odyssee-arenes/dessiner.py [numéro…]      (affiche le plan des arènes demandées)
import sys, json, os
ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, '..', '..', 'odyssee', 'js', 'world', 'arenes-plans.js')
W = 25
class Plan:
    def __init__(s, h):
        s.h = h; s.g = [['#'] * W for _ in range(h)]
    def put(s, x, y, c): s.g[y][x] = c
    def rect(s, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): s.g[y][x] = c
    def row(s, y, x0, txt):
        for i, c in enumerate(txt): s.g[y][x0 + i] = c
    def col(s, x, y0, txt):
        for i, c in enumerate(txt): s.g[y0 + i][x] = c
    def hall(s, y0, portes=(12,)):
        """cloison (2 rangs) avec des portes, puis le hall d'accueil standard (7 rangs) et la sortie"""
        s.rect(0, y0, W - 1, y0 + 1, '#')
        for x in portes: s.put(x, y0, '.'); s.put(x, y0 + 1, '.')
        y = y0 + 2
        rows = ['#p...g.............g...p#', '#.......................#', '#..........pSp..........#', '#.......................#',
                '#.......................#', '#...............G.......#', '#p.....................p#', '############E############']
        for i, r in enumerate(rows): s.row(y + i, 0, r)
    def rows(s): return [''.join(r) for r in s.g]

# archipel : 3 × 4 îles (5 × 3 cases) reliées par des passages, l'entrée en bas (12, 21), le Champion en haut (12, 1)
AX, AY = (4, 12, 20), (4, 9, 14, 19)
def aretes_archipel():
    E = []
    for c in range(3):
        for r in range(4):
            if c < 2: E.append(((c, r), (c + 1, r)))
            if r < 3: E.append(((c, r), (c, r + 1)))
    return E + [('S', (1, 3)), ((1, 0), 'G')]
def cases_arete(e):
    (a, b) = e
    if a == 'S': return [(12, 21)]
    if b == 'G': return [(12, 2)]
    (c1, r1), (c2, r2) = a, b
    if r1 == r2: return [(x, AY[r1]) for x in range(AX[c1] + 3, AX[c2] - 2)]
    return [(AX[c1], y) for y in range(AY[r1] + 2, AY[r2] - 1)]
def archipel(P, fond, cars):
    """peint les îles et leurs passages : cars[i] = caractère des cases du passage i (None : pas de passage)"""
    P.rect(1, 1, 23, 21, fond)
    P.rect(1, 1, 23, 1, '.'); P.put(12, 1, 'C'); P.put(9, 1, 'p'); P.put(15, 1, 'p')
    for c in range(3):
        for r in range(4): P.rect(AX[c] - 2, AY[r] - 1, AX[c] + 2, AY[r] + 1, '.')
    for e, ch in zip(aretes_archipel(), cars):
        if ch:
            for x, y in cases_arete(e): P.put(x, y, ch)
def ile(c, r, dx=0, dy=0): return (AX[c] + dx, AY[r] + dy)

GYMS = {}
def arene(gym, plan, js):
    GYMS[gym] = (plan.rows(), js)

exec(open(os.path.join(ICI, 'nord.py'), encoding='utf-8').read())
exec(open(os.path.join(ICI, 'sud.py'), encoding='utf-8').read())

out = ['// odyssee/js/world/arenes-plans.js — plans des arènes dessinées à la main (sauf Sylvebourg : arene-sylve.js).',
       '// Moteur, légende commune et solveur : arenes-plan.js. Un plan = 25 colonnes ; les chiffres 1 à 5 sont les places des',
       '// dresseurs, C le Champion, G le guide, S le panneau des règles, E la sortie. Fichier',
       '// écrit par tools/odyssee-arenes/dessiner.py (plans peints dans nord.py et sud.py) : à retoucher là-bas de préférence ;',
       '// node tools/test-odyssee-arenes-plan.mjs vérifie chaque arène après retouche.',
       'export const PLANS = {']
for gym in sorted(GYMS):
    rows, js = GYMS[gym]
    assert all(len(r) == W for r in rows), gym
    out.append(f'  {gym}: {{')
    out.append('    plan: [')
    for r in rows: out.append(f"      '{r}',")
    out.append('    ],')
    out.append(js.rstrip().rstrip(',') + ',')
    out.append('  },')
out.append('};')
open(SORTIE, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('arènes :', sorted(GYMS))
if len(sys.argv) > 1:
    for gym in sorted(GYMS):
        if str(gym) in sys.argv[1:]: print('\n'.join(f'{i:2d} {r}' for i, r in enumerate(GYMS[gym][0])))
