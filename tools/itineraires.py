"""Itinéraires piétons réels (rue par rue) pour chaque trajet à pied et chaque balade.

Calculés avec le routeur piéton OpenStreetMap de FOSSGIS (routing.openstreetmap.de, profil
« foot »), puis mis en cache dans data/itineraires.json. Seuls les trajets absents du cache
sont demandés. Le conteneur Claude n'a pas accès à ce service : le script tourne dans
GitHub Actions (build.yml). En cas d'échec, l'appli garde la ligne droite.

    python tools/itineraires.py           → complète le cache
    python tools/itineraires.py --tout    → recalcule tout
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from core import DATA, charger_et_calculer  # noqa: E402

CACHE = DATA / "itineraires.json"
URL = "https://routing.openstreetmap.de/routed-foot/route/v1/foot/{pts}?overview=full&geometries=geojson"
AGENT = "voyage-familial-nyc/1.0 (itineraires a pied, usage ponctuel)"


def cle(points) -> str:
    return "|".join(f"{p[0]:.5f},{p[1]:.5f}" for p in points)


def charger_cache() -> dict:
    return json.loads(CACHE.read_text()) if CACHE.exists() else {}


def _rdp(pts, eps=0.00002):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    n = (dx * dx + dy * dy) ** 0.5 or 1e-12
    dmax, i_max = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / n
        if d > dmax:
            dmax, i_max = d, i
    if dmax > eps:
        return _rdp(pts[: i_max + 1], eps)[:-1] + _rdp(pts[i_max:], eps)
    return [pts[0], pts[-1]]


def trajets_a_pied(R):
    """Liste des suites de points (lat, lon) parcourues à pied."""
    out = []
    for j in R["jours"]:
        for e in j.etapes:
            tr = e.trajet or {}
            via = tr.get("via_coords")
            if tr.get("mode") == "marche":
                out.append([e.origine, e.coord_debut])
            elif via:
                out.append([e.origine, via[0]])
                out.append([via[-1], e.coord_debut])
            if e.lieu.get("waypoints"):
                out.append([tuple(w) for w in e.lieu["waypoints"]])
    return [[tuple(p) for p in t] for t in out if len(t) >= 2]


def calculer(points):
    pts = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in points)
    req = urllib.request.Request(URL.format(pts=pts), headers={"User-Agent": AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    if d.get("code") != "Ok" or not d.get("routes"):
        raise RuntimeError(d.get("code"))
    route = d["routes"][0]
    coords = [(round(lon, 5), round(lat, 5)) for lon, lat in route["geometry"]["coordinates"]]
    return {"coords": _rdp(coords), "m": round(route["distance"])}


def main():
    R = charger_et_calculer()
    cache = {} if "--tout" in sys.argv else charger_cache()
    voulus = {cle(t): t for t in trajets_a_pied(R)}
    nouveaux = erreurs = 0
    for k, t in voulus.items():
        if k in cache:
            continue
        try:
            cache[k] = calculer(t)
            nouveaux += 1
            time.sleep(1.1)  # politesse envers le service gratuit
        except Exception as ex:  # noqa: BLE001
            erreurs += 1
            print("échec", k, ex)
    cache = {k: v for k, v in cache.items() if k in voulus}
    CACHE.write_text(json.dumps(cache, separators=(",", ":"), sort_keys=True))
    print(f"itinéraires : {len(voulus)} trajets, {nouveaux} calculés, {erreurs} échec(s)")


if __name__ == "__main__":
    main()
