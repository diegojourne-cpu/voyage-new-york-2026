"""Zones du fond de carte : polygones autour de chaque étape et de chaque trajet.

Le fond de carte (tuiles vectorielles OpenStreetMap / Protomaps) n'est extrait que
dans ces zones, pour rester léger et tenir hors connexion sur un téléphone.
Sortie : site/tiles/zones.geojson (un MultiPolygon). Si ce fichier change,
l'action GitHub « Fond de carte » ré-extrait les tuiles.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

RAYON_ETAPE_M = 1100      # rue et quartier autour de chaque étape
LARGEUR_TRAJET_M = 450    # couloir le long de chaque trajet
RAYON_AEROPORT_M = 2500


def _m2deg(lat):
    return 1 / 111_320, 1 / (111_320 * math.cos(math.radians(lat)))


def cercle(lat, lon, r, n=20):
    dlat, dlon = _m2deg(lat)
    pts = [[round(lon + r * dlon * math.cos(2 * math.pi * i / n), 5),
            round(lat + r * dlat * math.sin(2 * math.pi * i / n), 5)] for i in range(n)]
    return [pts + [pts[0]]]


def couloir(a, b, largeur):
    (la1, lo1), (la2, lo2) = a, b
    dlat, dlon = _m2deg((la1 + la2) / 2)
    dx, dy = (lo2 - lo1) / dlon, (la2 - la1) / dlat
    n = math.hypot(dx, dy) or 1
    ox, oy = -dy / n * largeur / 2, dx / n * largeur / 2
    p = [[lo1 + ox * dlon, la1 + oy * dlat], [lo2 + ox * dlon, la2 + oy * dlat],
         [lo2 - ox * dlon, la2 - oy * dlat], [lo1 - ox * dlon, la1 - oy * dlat]]
    p = [[round(x, 5), round(y, 5)] for x, y in p]
    return [p + [p[0]]]


def zones(ctx) -> dict:
    polys = []
    hotel = tuple(ctx["hotel"])
    polys.append(cercle(*hotel, RAYON_ETAPE_M))
    for j in ctx["jours"]:
        for e in j["etapes"]:
            r = RAYON_AEROPORT_M if e["id_lieu"] == "jfk" else RAYON_ETAPE_M
            polys.append(cercle(*e["coord"], r))
            for w in e.get("waypoints") or []:
                polys.append(cercle(*w, 500, 12))
            if e.get("trajet") and e["trajet"]["mode"] != "taxi":
                polys.append(couloir(e["origine"], e["coord_debut"], LARGEUR_TRAJET_M))
    # options de la soirée du 31 et Statue de la Liberté
    for c in ctx["reveillon"]["choix"]:
        polys.append(cercle(*c["coord"], 900))
    polys.append(cercle(*ctx["statue_lieu"]["coord"], 1200))
    return {"type": "Feature", "properties": {"usage": "zones du fond de carte"},
            "geometry": {"type": "MultiPolygon", "coordinates": polys}}


def ecrire(ctx, racine: Path) -> bool:
    """Écrit le fichier ; renvoie True s'il a changé (→ ré-extraction des tuiles)."""
    dest = racine / "site" / "tiles" / "zones.geojson"
    dest.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(zones(ctx), separators=(",", ":"))
    ancien = dest.read_text() if dest.exists() else ""
    if ancien != txt:
        dest.write_text(txt)
        return True
    return False
