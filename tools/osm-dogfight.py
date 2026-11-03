#!/usr/bin/env python3
"""Routes, chemins, bâtiments, champs et ruisseaux des cartes de Dogfight 3D, tirés d'OpenStreetMap
(© les contributeurs d'OpenStreetMap, https://www.openstreetmap.org/copyright). Les données sont sous licence
Open Database License (ODbL 1.0) : l'extrait écrit par cet outil l'est aussi. Téléchargées sans compte (API Overpass).

Usage : python3 -I tools/osm-dogfight.py dossier-cache [carte…]
Écrit dogfight/relief/<carte>-osm.json, lu par dogfight/view/osm.js, sur le carré de la grille proche (14 km) :
  - roads : [classe, x, z, dx, dz…] : 0 route principale, 1 route, 2 piste, 3 sentier ; 4 à 7 : la même sur un pont ;
  - buildings : [genre, étages, x, z, dx, dz…] : 0 maison, 1 grand bâtiment, 2 serre, 3 abri, 4 église ;
  - areas : [genre, x, z, dx, dz…] : 0 champ, 1 verger, 2 vigne, 3 pré, 4 serres, 5 village, 6 zone d'activités, 7 cimetière, 8 bassin ;
  - water : [classe, x, z, dx, dz…] : 0 ruisseau, 1 rivière ou canal.
Coordonnées en demi-mètres autour du centre de la carte (x vers l'est, z vers le sud), chaque point après le premier en écart au précédent.
Prérequis : aucun (Python 3 seul)."""
import json, math, os, sys, time, urllib.error, urllib.parse, urllib.request

# mêmes centres que tools/relief-dogfight.py
MAPS = {'eoliennes': (38.445, 14.955), 'teno': (28.29, -16.86), 'kauai': (22.20, -159.62), 'lofoten': (67.93, 13.075)}
HALF = 7020                       # demi-côté du carré (m), un peu plus que la grille proche
URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
UNIT = 0.5

ROADS = {**dict.fromkeys(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'], 0),
         **dict.fromkeys(['tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'pedestrian', 'road'], 1),
         'track': 2, **dict.fromkeys(['path', 'footway', 'steps', 'bridleway', 'cycleway'], 3)}
BIG = {'industrial', 'warehouse', 'commercial', 'retail', 'hangar', 'barn', 'farm_auxiliary', 'school', 'hotel', 'hospital', 'public',
       'civic', 'office', 'sports_hall', 'supermarket', 'parking', 'university', 'government', 'train_station', 'transportation', 'boathouse'}
AREAS = {'farmland': 0, 'orchard': 1, 'vineyard': 2, 'meadow': 3, 'grass': 3, 'greenfield': 3, 'village_green': 3,
         'greenhouse_horticulture': 4, 'plant_nursery': 4, 'residential': 5, 'farmyard': 5, 'allotments': 5,
         'industrial': 6, 'commercial': 6, 'retail': 6, 'construction': 6, 'quarry': 6, 'garages': 6, 'landfill': 6, 'port': 6,
         'cemetery': 7, 'reservoir': 8, 'basin': 8}


def fetch(cache, key, bbox):
    path = os.path.join(cache, key + '.json')
    if not os.path.exists(path):
        q = (f'[out:json][timeout:180];(way[highway]({bbox});way[building]({bbox});way[landuse]({bbox});way[waterway]({bbox}););out geom;')
        for attempt in range(6):          # les serveurs Overpass sont souvent chargés : on réessaie, sur un autre miroir
            req = urllib.request.Request(URLS[attempt % len(URLS)], data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': 'arcadia-dogfight-tools'})
            try:
                with urllib.request.urlopen(req, timeout=240) as r: data = r.read()
                json.loads(data); break
            except (OSError, ValueError) as err:   # erreur HTTP, coupure, délai dépassé, réponse tronquée
                print(f'  {key} : {err}, nouvel essai', file=sys.stderr); time.sleep(10 * (attempt + 1))
        else: raise SystemExit(f'{key} : Overpass ne répond pas')
        with open(path, 'wb') as f: f.write(data)
        time.sleep(5)
    with open(path, encoding='utf-8') as f: return json.load(f)


def simplify(pts, tol):
    """Douglas-Peucker : enlève les points à moins de `tol` mètres de la ligne"""
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (ax, az), (bx, bz) = pts[a], pts[b]; L = math.hypot(bx - ax, bz - az) or 1e-9; best, k = 0, -1
        for i in range(a + 1, b):
            d = abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L
            if d > best: best, k = d, i
        if best > tol: keep[k] = True; stack += [(a, k), (k, b)]
    return [p for p, k in zip(pts, keep) if k]


def pack(head, pts):
    out, px, pz = list(head), 0, 0
    for i, (x, z) in enumerate(pts):
        qx, qz = round(x / UNIT), round(z / UNIT)
        if i and qx == px and qz == pz: continue
        out += [qx - px, qz - pz] if i else [qx, qz]; px, pz = qx, qz
    return out


def levels(t, kind):
    for k in ('building:levels', 'levels'):
        try: return max(1, min(20, round(float(t[k].split(';')[0]))))
        except (KeyError, ValueError): pass
    try: return max(1, min(20, round(float(t['height'].split(';')[0].replace('m', '')) / 3)))
    except (KeyError, ValueError): pass
    return 0                      # inconnu : le jeu tire 1 ou 2 étages au hasard


def build(cache, key, out_dir):
    lat0, lon0 = MAPS[key]
    phi = math.radians(lat0)
    k_lat = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    k_lon = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
    bbox = f'{lat0 - HALF / k_lat:.5f},{lon0 - HALF / k_lon:.5f},{lat0 + HALF / k_lat:.5f},{lon0 + HALF / k_lon:.5f}'
    data = fetch(cache, key, bbox)
    proj = lambda g: [((p['lon'] - lon0) * k_lon, (lat0 - p['lat']) * k_lat) for p in g]
    inside = lambda pts: any(abs(x) < HALF and abs(z) < HALF for x, z in pts)
    out = {'v': 1, 'unit': UNIT, 'roads': [], 'buildings': [], 'areas': [], 'water': []}
    for e in data['elements']:
        t, g = e.get('tags', {}), e.get('geometry')
        if e['type'] != 'way' or not g or len(g) < 2: continue
        pts = proj(g)
        if not inside(pts): continue
        closed = len(pts) > 3 and pts[0] == pts[-1]
        if 'building' in t and closed:
            b = t['building']
            kind = 2 if b == 'greenhouse' else 3 if b in ('roof', 'carport', 'shed', 'hut', 'cabin', 'kiosk') else 4 if b in ('church', 'chapel', 'cathedral') else 1 if b in BIG else 0
            ring = simplify(pts[:-1], 0.25)
            if len(ring) >= 3: out['buildings'].append(pack([kind, levels(t, kind)], ring))
        elif t.get('highway') in ROADS and t.get('tunnel') in (None, 'no') and t.get('area') != 'yes' and t.get('location') != 'underground':
            cls = ROADS[t['highway']] + (4 if t.get('bridge') not in (None, 'no') else 0)
            out['roads'].append(pack([cls], simplify(pts, 0.4)))
        elif t.get('landuse') in AREAS and closed:
            ring = simplify(pts[:-1], 0.8)
            if len(ring) >= 3: out['areas'].append(pack([AREAS[t['landuse']]], ring))
        elif t.get('waterway') in ('stream', 'river', 'canal', 'ditch') and t.get('tunnel') in (None, 'no'):
            out['water'].append(pack([1 if t['waterway'] in ('river', 'canal') else 0], simplify(pts, 1.5)))
    path = os.path.join(out_dir, key + '-osm.json')
    with open(path, 'w', encoding='utf-8') as f: json.dump(out, f, separators=(',', ':'))
    print(f"{key} : {len(out['roads'])} routes, {len(out['buildings'])} bâtiments, {len(out['areas'])} zones, {len(out['water'])} cours d'eau, {os.path.getsize(path) // 1024} Ko")


if __name__ == '__main__':
    cache = sys.argv[1]
    os.makedirs(cache, exist_ok=True)
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dogfight', 'relief')
    for key in sys.argv[2:] or MAPS:
        build(cache, key, out_dir)
