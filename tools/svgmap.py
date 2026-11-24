"""Cartes SVG hors-ligne : fond (arrondissements + New Jersey + Central Park) défini
une seule fois (<symbol>), puis une vue par jour (viewBox) avec le tracé et les étapes.

Les couleurs passent par des variables CSS (--map-*) : les cartes suivent le thème
clair/sombre du site et restent lisibles à l'impression.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from core import COULEURS_LIGNES

LAT0, LON0 = 40.905, -74.12      # coin nord-ouest de la projection
K = 10000                        # unités SVG par degré de latitude
COSLAT = math.cos(math.radians(40.73))
W_TOTAL = round((-73.70 - LON0) * COSLAT * K)
H_TOTAL = round((LAT0 - 40.56) * K)

NEW_JERSEY = [(40.95, -73.93), (40.85, -73.955), (40.81, -73.975), (40.78, -73.995), (40.76, -74.013),
              (40.745, -74.024), (40.725, -74.031), (40.70, -74.045), (40.68, -74.055), (40.66, -74.07),
              (40.645, -74.09), (40.64, -74.16), (40.95, -74.16)]
CENTRAL_PARK = [(40.7644, -73.9730), (40.7681, -73.9819), (40.8007, -73.9581), (40.7969, -73.9493)]
PROSPECT_PARK = [(40.6720, -73.9700), (40.6610, -73.9800), (40.6510, -73.9720), (40.6560, -73.9620), (40.6680, -73.9620)]
ETIQUETTES = [("MANHATTAN", 40.790, -73.968, -61), ("BROOKLYN", 40.655, -73.945, 0), ("QUEENS", 40.735, -73.84, 0),
              ("BRONX", 40.850, -73.87, 0), ("NEW JERSEY", 40.735, -74.075, 0), ("Hudson", 40.770, -74.003, -62),
              ("East River", 40.733, -73.968, -70)]


def proj(lat, lon):
    return round((lon - LON0) * COSLAT * K, 1), round((LAT0 - lat) * K, 1)


def _pts(coords, ferme=True):
    p = " ".join(f"{x:.0f},{y:.0f}" for x, y in (proj(la, lo) for la, lo in coords))
    return p


def symbole_fond() -> str:
    """<svg> caché contenant le <symbol id='nyc'> réutilisé par toutes les cartes."""
    bm = json.loads((Path(__file__).parent / "basemap" / "nyc.json").read_text())
    paths = []
    for b in bm:
        d = []
        for ring in b["rings"]:
            pts = [proj(y, x) for x, y in ring]
            d.append("M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in pts) + "Z")
        paths.append(f'<path d="{"".join(d)}"/>')
    labels = "".join(
        f'<text x="{proj(la, lo)[0]:.0f}" y="{proj(la, lo)[1]:.0f}" transform="rotate({rot} {proj(la, lo)[0]:.0f} {proj(la, lo)[1]:.0f})" '
        f'class="{"eau" if t[0].islower() or t in ("Hudson", "East River") else "boro"}">{t}</text>'
        for t, la, lo, rot in ETIQUETTES)
    return (
        f'<svg width="0" height="0" style="position:absolute" aria-hidden="true">'
        f'<symbol id="nyc" viewBox="0 0 {W_TOTAL} {H_TOTAL}">'
        f'<rect width="{W_TOTAL}" height="{H_TOTAL}" fill="var(--map-eau)"/>'
        f'<polygon points="{_pts(NEW_JERSEY)}" fill="var(--map-terre2)"/>'
        f'<g fill="var(--map-terre)" stroke="var(--map-cote)" stroke-width="4" stroke-linejoin="round">{"".join(paths)}</g>'
        f'<polygon points="{_pts(CENTRAL_PARK)}" fill="var(--map-parc)"/>'
        f'<polygon points="{_pts(PROSPECT_PARK)}" fill="var(--map-parc)"/>'
        f'<g class="map-lbl">{labels}</g>'
        f'</symbol></svg>'
    )


def _vue(coords, marge=0.18, mini_w=900, ratio=1.25):
    xs, ys = zip(*(proj(*c) for c in coords))
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = max(x1 - x0, mini_w / ratio * 0.6), max(y1 - y0, mini_w * 0.6)
    w, h = w * (1 + 2 * marge), h * (1 + 2 * marge)
    # forcer un rapport largeur/hauteur stable (lisible sur mobile comme sur papier)
    if w / h < ratio:
        w = h * ratio
    else:
        h = w / ratio
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return cx - w / 2, cy - h / 2, w, h


def carte_jour(jour_ctx: dict, hotel, id_svg: str, compact=False) -> str:
    """jour_ctx : dict sérialisé d'un jour (voir build.contexte)."""
    etapes = jour_ctx["etapes"]
    pts = [hotel] + [tuple(e["coord"]) for e in etapes] + [tuple(p) for e in etapes for p in (e.get("waypoints") or [])]
    vx, vy, vw, vh = _vue(pts)
    s = vw / 1000  # facteur d'échelle des traits et pastilles
    couleur = jour_ctx["couleur"]
    traits, pastilles = [], []
    for e in etapes:
        tr = e.get("trajet")
        if tr:
            a = proj(*e["origine"])
            b = proj(*e["coord_debut"])
            mode = tr["mode"]
            if mode in ("metro", "train"):
                lig = str((tr.get("lignes") or ["S"])[-1])
                col = COULEURS_LIGNES.get(lig, "#808183")
                traits.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{col}" stroke-width="{7*s:.1f}" stroke-linecap="round" opacity=".9"/>')
            elif mode == "ferry":
                traits.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#00a3e0" stroke-width="{5*s:.1f}" stroke-dasharray="{14*s:.1f} {8*s:.1f}"/>')
            elif mode == "taxi":
                traits.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#e0a800" stroke-width="{5*s:.1f}" stroke-dasharray="{3*s:.1f} {7*s:.1f}" stroke-linecap="round"/>')
            else:
                traits.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="var(--map-marche)" stroke-width="{4*s:.1f}" stroke-dasharray="{2*s:.1f} {6*s:.1f}" stroke-linecap="round"/>')
        if e.get("waypoints"):
            p = " ".join(f"{x},{y}" for x, y in (proj(*w) for w in e["waypoints"]))
            traits.append(f'<polyline points="{p}" fill="none" stroke="{couleur}" stroke-width="{6*s:.1f}" stroke-linejoin="round" stroke-linecap="round"/>')
    deja = {}
    for e in etapes:
        if e["id_lieu"] == "hotel":
            continue
        x, y = proj(*e["coord"])
        k = (round(x / (18 * s)), round(y / (18 * s)))
        dx = deja.get(k, 0)
        deja[k] = dx + 1
        x += dx * 30 * s
        r = 15 * s
        pastilles.append(
            f'<g class="stop" data-n="{e["n"]}"><circle cx="{x}" cy="{y}" r="{r:.1f}" fill="{couleur}" stroke="var(--map-terre)" stroke-width="{3*s:.1f}"/>'
            f'<text x="{x}" y="{y + 5.5*s:.1f}" font-size="{16*s:.1f}" text-anchor="middle" fill="#fff" font-weight="700">{e["n"]}</text></g>')
    hx, hy = proj(*hotel)
    maison = (f'<g><rect x="{hx-13*s:.1f}" y="{hy-13*s:.1f}" width="{26*s:.1f}" height="{26*s:.1f}" rx="{5*s:.1f}" fill="var(--map-hotel)"/>'
              f'<text x="{hx}" y="{hy+5.5*s:.1f}" font-size="{15*s:.1f}" text-anchor="middle" fill="var(--map-terre)" font-weight="800">H</text></g>')
    return (f'<svg class="carte" id="{id_svg}" viewBox="{vx:.0f} {vy:.0f} {vw:.0f} {vh:.0f}" role="img" '
            f'aria-label="Carte du parcours du {jour_ctx["label"]}" preserveAspectRatio="xMidYMid meet">'
            f'<use href="#nyc" x="0" y="0" width="{W_TOTAL}" height="{H_TOTAL}"/>'
            f'<g style="--s:{s:.3f}">{"".join(traits)}{maison}{"".join(pastilles)}</g></svg>')


def carte_ensemble(jours_ctx: list, hotel) -> str:
    pts = [hotel] + [tuple(e["coord"]) for j in jours_ctx for e in j["etapes"] if e["id_lieu"] != "jfk"]
    vx, vy, vw, vh = _vue(pts, marge=0.06, ratio=0.95)
    s = vw / 1000
    out = []
    for j in jours_ctx:
        if j["iso"] == "2026-12-27":
            continue
        seq = [hotel] + [tuple(e["coord"]) for e in j["etapes"] if e["id_lieu"] != "jfk"]
        p = " ".join(f"{x},{y}" for x, y in (proj(*c) for c in seq))
        out.append(f'<polyline class="trace-jour" data-jour="{j["iso"]}" points="{p}" fill="none" stroke="{j["couleur"]}" '
                   f'stroke-width="{6*s:.1f}" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>')
        for e in j["etapes"]:
            if e["id_lieu"] in ("hotel", "jfk"):
                continue
            x, y = proj(*e["coord"])
            out.append(f'<circle data-jour="{j["iso"]}" cx="{x}" cy="{y}" r="{9*s:.1f}" fill="{j["couleur"]}" stroke="var(--map-terre)" stroke-width="{2.5*s:.1f}"/>')
    hx, hy = proj(*hotel)
    out.append(f'<rect x="{hx-12*s:.1f}" y="{hy-12*s:.1f}" width="{24*s:.1f}" height="{24*s:.1f}" rx="{5*s:.1f}" fill="var(--map-hotel)"/>'
               f'<text x="{hx}" y="{hy+5*s:.1f}" font-size="{14*s:.1f}" text-anchor="middle" fill="var(--map-terre)" font-weight="800">H</text>')
    return (f'<svg class="carte carte-ensemble" viewBox="{vx:.0f} {vy:.0f} {vw:.0f} {vh:.0f}" role="img" '
            f'aria-label="Carte de tous les parcours" preserveAspectRatio="xMidYMid meet">'
            f'<use href="#nyc" x="0" y="0" width="{W_TOTAL}" height="{H_TOTAL}"/>{"".join(out)}</svg>')
