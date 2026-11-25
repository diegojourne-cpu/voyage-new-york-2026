"""Génère tous les livrables à partir de data/*.yaml.

    python tools/build.py          → dist/ (site, programme imprimable, carte, agenda, KML, rapport)
    node tools/render_pdf.mjs      → dist/programme.pdf (appelé par `make`)

Une seule source de vérité : les fichiers YAML. Ne jamais éditer dist/ à la main.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import shutil
import json
import sys
import zoneinfo
from pathlib import Path
from urllib.parse import quote

from jinja2 import Environment, FileSystemLoader, select_autoescape

sys.path.insert(0, str(Path(__file__).parent))
from core import (COULEURS_LIGNES, ICONES_MODE, LIGNES_TEXTE_NOIR, RACINE, charger, charger_et_calculer,  # noqa: E402
                  date_fr, hm, hm_fr, plage_du_jour)
from zones import ecrire as ecrire_zones  # noqa: E402
from itineraires import charger_cache, cle as cle_itin  # noqa: E402

DIST = RACINE / "dist"
SITE_SRC = RACINE / "site"
SITE = DIST / "site"
TPL = Path(__file__).parent / "templates"


ITIN = {}


def a_pied(a, b):
    """Coordonnées (lon, lat) du vrai trajet à pied si calculé, sinon la ligne droite."""
    r = ITIN.get(cle_itin([tuple(a), tuple(b)]))
    return r["coords"] if r else [list(a)[::-1], list(b)[::-1]]


def geo_jour(jj):
    """Tracés GeoJSON d'une journée (lon, lat) + emprise pour cadrer la carte."""
    feats, pts = [], []
    for e in jj["etapes"]:
        tr = e.get("trajet")
        if tr:
            mode = tr["mode"]
            lig = (tr.get("lignes") or [None])[-1]
            couleur = COULEURS_LIGNES.get(lig, "#8e8e93") if mode in ("metro", "train") else jj["couleur"]
            via = tr.get("via_coords")
            ligne = lambda pts, m=mode, c=couleur: {"type": "Feature", "properties": {"jour": jj["iso"], "mode": m, "couleur": c},
                                                    "geometry": {"type": "LineString", "coordinates": [p[::-1] for p in pts]}}
            brut = lambda coords, m: {"type": "Feature", "properties": {"jour": jj["iso"], "mode": m, "couleur": jj["couleur"]},
                                      "geometry": {"type": "LineString", "coordinates": coords}}
            if via:
                feats.append(brut(a_pied(e["origine"], via[0]), "marche"))
                feats.append(ligne(via))
                feats.append(brut(a_pied(via[-1], e["coord_debut"]), "marche"))
                pts += via
            elif mode == "marche":
                feats.append(brut(a_pied(e["origine"], e["coord_debut"]), "marche"))
            else:
                feats.append(ligne([e["origine"], e["coord_debut"]]))
        if e.get("waypoints"):
            r = ITIN.get(cle_itin([tuple(w) for w in e["waypoints"]]))
            feats.append({"type": "Feature", "properties": {"jour": jj["iso"], "mode": "balade", "couleur": jj["couleur"]},
                          "geometry": {"type": "LineString", "coordinates": r["coords"] if r else [w[::-1] for w in e["waypoints"]]}})
            pts += e["waypoints"]
        if e["id_lieu"] != "jfk" or jj["iso"] == "2026-12-27":
            pts.append(e["coord"])
            if tr and (tr["mode"] != "taxi" or jj["iso"] == "2026-12-27"):
                pts.append(e["origine"])
    lats, lons = [p[0] for p in pts], [p[1] for p in pts]
    return feats, [[min(lons), min(lats)], [max(lons), max(lats)]]


# --------------------------------------------------------------------------- contexte
def gmaps(origine, dest, mode):
    tm = {"marche": "walking", "metro": "transit", "train": "transit", "ferry": "transit", "taxi": "driving"}.get(mode, "transit")
    o = f"{origine[0]},{origine[1]}" if origine else ""
    return f"https://www.google.com/maps/dir/?api=1&origin={o}&destination={dest[0]},{dest[1]}&travelmode={tm}"


def plage_txt(lieu, d):
    p = plage_du_jour(lieu, d)
    if p is None:
        return "fermé"
    if p == (0, 1440):
        return "accès libre"
    return f"{hm_fr(p[0])} – {hm_fr(p[1])}"


def contexte():
    ITIN.clear()
    ITIN.update(charger_cache())
    R = charger_et_calculer()
    V, lieux = R["voyage"], R["lieux"]
    hotel = tuple(lieux["hotel"]["coord"])
    resa_ids = {r["id"]: r for r in R["reservations"]["reservations"]}
    jours = []
    for ji, j in enumerate(R["jours"]):
        etapes = []
        n = 0
        for e in j.etapes:
            L = e.lieu
            if e.id_lieu != "hotel":
                n += 1
            tr = dict(e.trajet) if e.trajet else None
            if tr:
                tr["duree_totale"] = e.trajet_min
                tr["lignes"] = [str(x) for x in tr.get("lignes", [])]
                tr["icone"] = ICONES_MODE.get(tr["mode"], "")
                if e.distance_km is not None and tr["mode"] == "marche":
                    tr["km"] = round(e.distance_km * V["regles_calcul"]["facteur_grille"], 1)
            prix = L.get("prix") or {}
            s = e.brut
            etapes.append({
                "key": f"{j.date.isoformat()}-{e.index}",
                "n": n if e.id_lieu != "hotel" else 0,
                "id_lieu": e.id_lieu, "titre": e.titre, "nom_lieu": L.get("nom"),
                "quartier": L.get("quartier", ""), "adresse": L.get("adresse", ""),
                "coord": list(e.coord_fin if L.get("waypoints") else e.coord_debut),
                "coord_debut": list(e.coord_debut), "origine": list(e.origine),
                "waypoints": L.get("waypoints"),
                "categorie": L.get("categorie", ""), "priorite": L.get("priorite", ""),
                "arrivee": hm(e.arrivee), "debut": hm(e.debut), "fin": hm(e.fin),
                "debut_min": e.debut, "fin_min": e.fin, "attente": e.attente, "duree": e.duree,
                "trajet": tr, "quoi": s.get("quoi", ""), "conseil": s.get("conseil", ""),
                "creneau": s.get("creneau"), "repas": e.repas,
                "prix": prix.get("montant", 0), "prix_note": prix.get("note", ""),
                "pass": L.get("pass", []), "reservation": L.get("reservation", ""),
                "resa_id": e.id_lieu if e.id_lieu in resa_ids else None,
                "heure_creuse": L.get("heure_creuse", ""), "astuce_photo": L.get("astuce_photo", ""),
                "anecdote": L.get("anecdote", ""), "noel": L.get("noel", ""),
                "fiabilite": L.get("fiabilite", ""), "note_horaires": L.get("note_horaires", ""),
                "horaires_jour": plage_txt(L, j.date),
                "lien": L.get("lien", ""), "source": L.get("source", ""),
                "boutiques": L.get("boutiques", []),
                "gmaps": gmaps(e.origine if e.trajet else None, e.coord_debut, (e.trajet or {}).get("mode", "metro")),
                "nuit": bool(s.get("nuit")), "coucher": bool(s.get("coucher")),
            })
        jours.append({
            "iso": j.date.isoformat(), "label": date_fr(j.date), "label_court": date_fr(j.date, False),
            "num": ji, "titre": j.titre, "theme": j.theme, "couleur": j.couleur, "note": j.note,
            "soleil": {k: hm(v) for k, v in j.soleil.items()}, "depart": hm(j.depart),
            "etapes": etapes,
            "alertes": [a.__dict__ for a in R["alertes"] if a.jour == j.date.isoformat()],
        })
    for jj in jours:
        jj["features"], jj["bounds"] = geo_jour(jj)
    O = R["options"]
    rev = O["reveillon"]
    for c in rev["choix"]:
        c["coord"] = lieux[c["lieu"]]["coord"]
    B = R["budget"]
    taux = V["taux_eur_usd"]
    # budget par personne (USD) — transport + attractions + estimation repas
    budget = {
        "metro": B["metro_usd"], "autres_transports": B["transport_usd"], "taxis": 66,
        "attractions_sans_pass": B["attractions_total_usd"],
        "repas_estimation": {"bas": 60 * 5, "haut": 110 * 5},
        "taux": taux,
    }
    ctx = {
        "genere_le": dt.datetime.now(zoneinfo.ZoneInfo("Europe/Paris")).strftime("%d/%m/%Y à %H:%M"),
        "voyage": V, "jours": jours,
        "alertes": [a.__dict__ for a in R["alertes"]],
        "nb": {k: sum(a.niveau == k for a in R["alertes"]) for k in ("erreur", "attention", "info")},
        "reservations": sorted(R["reservations"]["reservations"], key=lambda r: r["urgence"]),
        "reveillon": rev, "statue": O["statue"], "match": O["match"], "greeter": O["greeter"],
        "autres": O["autres"], "plan_pluie": O["plan_pluie"],
        "pass": {"scenarios": B["scenarios"], "meilleur": B["meilleur"], "offres": R["pass"]["offres"],
                 "cinquieme": R["pass"].get("cinquieme_choix_citypass"), "lignes": B["lignes"]},
        "budget": budget, "jeux": R["jeux"], "infos": charger("infos")["sections"],
        "couleurs_lignes": COULEURS_LIGNES, "lignes_noir": sorted(LIGNES_TEXTE_NOIR),
        "statue_lieu": lieux["statue_liberte"], "hotel": hotel,
    }
    src = {}
    for jj in jours:
        for e in jj["etapes"]:
            if e["source"].startswith("http"):
                src.setdefault(e["source"], e["nom_lieu"])
    for code, o in R["pass"]["offres"].items():
        src.setdefault(o["source"], o["nom"])
    for u in O["match"].get("sources", []):
        src.setdefault(u, "Calendriers sportifs")
    src.setdefault(O["greeter"]["lien"], "Big Apple Greeter")
    ctx["sources"] = [{"url": u, "titre": t} for u, t in src.items()]
    ctx["j_moins"] = max(0, (V["vols"]["arrivee"]["date"] - dt.date.today()).days)
    ctx["jeux"]["defis_photo"] = {str(k): v for k, v in ctx["jeux"]["defis_photo"].items()}
    return ctx, R


# --------------------------------------------------------------------------- agenda (.ics)
def ics(ctx):
    def esc(t):
        return str(t).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

    def fold(line):
        out, b = [], line.encode("utf-8")
        while len(b) > 74:
            cut = 74
            while (b[cut] & 0xC0) == 0x80:
                cut -= 1
            out.append(b[:cut].decode())
            b = b[cut:]
        out.append(b.decode())
        return "\r\n ".join(out)

    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//voyage-new-york-2026//FR", "CALSCALE:GREGORIAN",
         "X-WR-CALNAME:New York Noël 2026", "X-WR-TIMEZONE:America/New_York",
         "BEGIN:VTIMEZONE", "TZID:America/New_York",
         "BEGIN:STANDARD", "DTSTART:20261101T020000", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "END:STANDARD",
         "END:VTIMEZONE"]
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for j in ctx["jours"]:
        d = j["iso"].replace("-", "")
        for e in j["etapes"]:
            if e["duree"] <= 0:
                continue
            desc = []
            if e["trajet"]:
                t = e["trajet"]
                lig = " ".join(t.get("lignes", []))
                desc.append(f"Trajet : {t['mode']} {lig} {t.get('de','')} → {t.get('a','')} ({t['duree_totale']} min). {t.get('detail','')}")
            if e["quoi"]:
                desc.append(e["quoi"])
            if e["conseil"]:
                desc.append("Conseil : " + e["conseil"])
            if e["prix"]:
                desc.append(f"Prix : {e['prix']} $ ({e['prix_note']})")
            if e["astuce_photo"]:
                desc.append("Photo : " + e["astuce_photo"])
            if e["anecdote"]:
                desc.append("Anecdote : " + e["anecdote"])
            desc.append("Itinéraire : " + e["gmaps"])
            dfin = e["fin"] if e["fin_min"] < 24 * 60 else "23:59"
            L += ["BEGIN:VEVENT", f"UID:{e['key']}@voyage-new-york-2026", f"DTSTAMP:{stamp}",
                  f"DTSTART;TZID=America/New_York:{d}T{e['debut'].replace(':','')}00",
                  f"DTEND;TZID=America/New_York:{d}T{dfin.replace(':','')}00",
                  fold("SUMMARY:" + esc(("🍽 " if e["repas"] else "") + e["titre"])),
                  fold("LOCATION:" + esc(e["adresse"] or e["quartier"])),
                  f"GEO:{e['coord'][0]};{e['coord'][1]}",
                  fold("DESCRIPTION:" + esc("\n\n".join(desc))), "END:VEVENT"]
    L.append("END:VCALENDAR")
    return "\r\n".join(L) + "\r\n"


# --------------------------------------------------------------------------- KML (Google My Maps)
def kml(ctx):
    e_ = html.escape
    out = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
           "<name>New York — Noël 2026</name>"]
    for j in ctx["jours"]:
        c = j["couleur"].lstrip("#")
        kcol = f"ff{c[4:6]}{c[2:4]}{c[0:2]}"
        out.append(f'<Style id="s{j["num"]}"><IconStyle><color>{kcol}</color></IconStyle><LineStyle><color>{kcol}</color><width>4</width></LineStyle></Style>')
    for j in ctx["jours"]:
        out.append(f"<Folder><name>{e_(j['label'].capitalize())} — {e_(j['titre'])}</name>")
        coords = []
        for e in j["etapes"]:
            coords.append(f"{e['coord_debut'][1]},{e['coord_debut'][0]},0")
            for w in e.get("waypoints") or []:
                coords.append(f"{w[1]},{w[0]},0")
            if e["id_lieu"] == "hotel":
                continue
            out.append(f"<Placemark><name>{e['n']}. {e['debut']} {e_(e['titre'])}</name><styleUrl>#s{j['num']}</styleUrl>"
                       f"<description>{e_(e['quoi'])}</description>"
                       f"<Point><coordinates>{e['coord'][1]},{e['coord'][0]},0</coordinates></Point></Placemark>")
        out.append(f"<Placemark><name>Parcours</name><styleUrl>#s{j['num']}</styleUrl><LineString><tessellate>1</tessellate>"
                   f"<coordinates>{' '.join(coords)}</coordinates></LineString></Placemark></Folder>")
    out.append("</Document></kml>")
    return "\n".join(out)


# --------------------------------------------------------------------------- rapport
def rapport_md(ctx, R):
    from check import rapport_texte
    nb = ctx["nb"]
    return (f"# Vérification de faisabilité — générée le {ctx['genere_le']}\n\n"
            f"**{nb['erreur']} erreur(s) · {nb['attention']} point(s) d'attention · {nb['info']} info(s)**\n\n"
            "```text\n" + rapport_texte(R) + "\n```\n")


# --------------------------------------------------------------------------- main
def construire_site(data):
    """Copie l'appli (site/) dans dist/site/, avec les données et le service worker versionné."""
    if SITE.exists():
        for f in sorted(SITE.rglob("*"), reverse=True):
            if f.is_file() and f.parts[-2:] != ("fichiers", "programme.pdf"):
                f.unlink()
    for f in SITE_SRC.rglob("*"):
        if f.is_file() and f.name != "zones.geojson" and f.name != "SOURCE.txt":
            dest = SITE / f.relative_to(SITE_SRC)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dest)
    (SITE / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str), encoding="utf-8")
    fichiers = SITE / "fichiers"
    fichiers.mkdir(exist_ok=True)
    for n in ("voyage.ics", "voyage.kml"):
        shutil.copy2(DIST / n, fichiers / n)
    # précache du service worker : tout sauf les tuiles (cache dédié, rempli en tâche de fond)
    liste = sorted(str(f.relative_to(SITE)) for f in SITE.rglob("*")
                   if f.is_file() and f.suffix != ".pmtiles" and f.name not in ("sw.js", "_headers"))
    if "fichiers/programme.pdf" not in liste:
        liste.append("fichiers/programme.pdf")
    h = hashlib.sha256()
    for rel in liste:
        f = SITE / rel
        if f.exists() and rel != "fichiers/programme.pdf":
            h.update(rel.encode()); h.update(f.read_bytes())
    tuiles = SITE / "tiles" / "nyc.pmtiles"
    ht = hashlib.sha256(tuiles.read_bytes()).hexdigest()[:10] if tuiles.exists() else "absent"
    sw = (SITE_SRC / "sw.js").read_text(encoding="utf-8")
    sw = (sw.replace("__VERSION__", h.hexdigest()[:10]).replace("__TUILES__", ht)
            .replace("__PRECACHE__", json.dumps(["./"] + liste, ensure_ascii=False)))
    (SITE / "sw.js").write_text(sw, encoding="utf-8")


def main():
    ctx, R = contexte()
    DIST.mkdir(exist_ok=True)
    zones_changees = ecrire_zones(ctx, RACINE)
    env = Environment(loader=FileSystemLoader(TPL), autoescape=select_autoescape(["html", "j2"]),
                      trim_blocks=True, lstrip_blocks=True)
    env.filters["usd"] = lambda v: (f"{v:,.0f} $".replace(",", " ") if v == int(v) else f"{v:,.2f} $".replace(",", " ").replace(".", ","))
    env.filters["eur"] = lambda v: f"{v:,.0f} €".replace(",", " ")
    env.filters["eur2"] = lambda v: f"{v:,.2f} €".replace(",", " ").replace(".", ",")
    env.globals.update(COULEURS=COULEURS_LIGNES, NOIR=LIGNES_TEXTE_NOIR, quote=quote)
    data = {k: v for k, v in ctx.items() if k != "voyage"}
    data["voyage"] = {k: ctx["voyage"][k] for k in ("titre", "sous_titre", "vols", "hotel", "fuseau", "taux_eur_usd", "urgences")}
    (DIST / "programme.html").write_text(env.get_template("print.html.j2").render(ctx=ctx), encoding="utf-8")
    (DIST / "voyage.ics").write_text(ics(ctx), encoding="utf-8", newline="")
    (DIST / "voyage.kml").write_text(kml(ctx), encoding="utf-8")
    (DIST / "verification.md").write_text(rapport_md(ctx, R), encoding="utf-8")
    (DIST / "programme.json").write_text(json.dumps(data, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    construire_site(data)
    nb = ctx["nb"]
    print(f"dist/ régénéré — {nb['erreur']} erreur(s), {nb['attention']} attention(s), {nb['info']} info(s)")
    if zones_changees:
        print("ZONES_CHANGEES : le fond de carte doit être ré-extrait (action GitHub « Fond de carte »).")
    return nb["erreur"]


if __name__ == "__main__":
    sys.exit(1 if main() and "--strict" in sys.argv else 0)
