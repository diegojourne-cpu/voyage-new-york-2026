"""Prépare le fond de carte hors-ligne (contours simplifiés des 5 arrondissements).

Usage : python tools/prepare_basemap.py chemin/vers/new-york-city-boroughs.geojson
Source : https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/new-york-city-boroughs.geojson
Le résultat (tools/basemap/nyc.json) est versionné : ce script ne sert qu'à le régénérer.
"""
import json
import sys
from pathlib import Path

TOL = 0.00035  # ~35 m : assez fin pour reconnaître les berges, assez léger pour le mobile


def rdp(points, eps):
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5 or 1e-12
    dmax, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        x0, y0 = points[i]
        d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        left = rdp(points[: idx + 1], eps)
        right = rdp(points[idx:], eps)
        return left[:-1] + right
    return [points[0], points[-1]]


def main(src):
    data = json.loads(Path(src).read_text())
    out = []
    for feat in data["features"]:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        rings = []
        for poly in polys:
            ring = poly[0]
            pts = [(round(x, 5), round(y, 5)) for x, y in ring]
            mid = len(pts) // 2  # anneau fermé : on simplifie les deux moitiés séparément
            simp = rdp(pts[: mid + 1], TOL)[:-1] + rdp(pts[mid:], TOL)
            if len(simp) >= 4:
                rings.append(simp)
        out.append({"name": feat["properties"]["name"], "rings": rings})
    dest = Path(__file__).parent / "basemap" / "nyc.json"
    dest.write_text(json.dumps(out, separators=(",", ":")))
    print(dest, dest.stat().st_size, "octets")


if __name__ == "__main__":
    main(sys.argv[1])
