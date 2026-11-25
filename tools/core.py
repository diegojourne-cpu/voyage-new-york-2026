"""Moteur du planning : chargement des données, calcul des horaires en cascade,
vérification de faisabilité, budget et comparatif des pass.

Tout le reste (PDF, site, carte, agenda) consomme le résultat de `charger_et_calculer()`.
"""
from __future__ import annotations

import datetime as dt
import math
import zoneinfo
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from astral import LocationInfo
from astral.sun import sun

RACINE = Path(__file__).resolve().parent.parent
DATA = RACINE / "data"
JOURS_FR = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]
JOURS_LONG = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS_FR = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
           "septembre", "octobre", "novembre", "décembre"]

# Couleurs officielles des lignes MTA (+ trains et ferries)
COULEURS_LIGNES = {
    **{k: "#0039A6" for k in "ACE"}, **{k: "#FF6319" for k in "BDFM"}, "G": "#6CBE45",
    "J": "#996633", "Z": "#996633", "L": "#A7A9AC", **{k: "#FCCC0A" for k in "NQRW"},
    **{k: "#EE352E" for k in "123"}, **{k: "#00933C" for k in "456"}, "7": "#B933AD",
    "S": "#808183", "MNR": "#0b4f9c", "FERRY": "#00a3e0", "LIRR": "#0f3b7a",
}
LIGNES_TEXTE_NOIR = set("NQRW")
ICONES_MODE = {"marche": "🚶", "metro": "🚇", "train": "🚆", "ferry": "⛴️", "taxi": "🚕"}


# --------------------------------------------------------------------------- utilitaires
def charger(nom: str):
    return yaml.safe_load((DATA / f"{nom}.yaml").read_text(encoding="utf-8"))


def haversine_km(a, b) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def hm(minutes: int) -> str:
    minutes = int(round(minutes))
    return f"{(minutes // 60) % 24:02d}:{minutes % 60:02d}"


def hm_fr(minutes: int) -> str:
    h, m = divmod(int(round(minutes)) % (24 * 60), 60)
    return f"{h}h{m:02d}" if m else f"{h}h"


def en_min(txt: str) -> int:
    h, m = txt.split(":")
    return int(h) * 60 + int(m)


def ceil5(m: float) -> int:
    return int(math.ceil(m / 5.0) * 5)


def date_fr(d: dt.date, avec_jour=True) -> str:
    j = JOURS_LONG[d.weekday()]
    s = f"{d.day}{'er' if d.day == 1 else ''} {MOIS_FR[d.month]}"
    return f"{j} {s}" if avec_jour else s


def as_date(x) -> dt.date:
    return x if isinstance(x, dt.date) else dt.date.fromisoformat(str(x))


# --------------------------------------------------------------------------- horaires
def plage_du_jour(lieu: dict, d: dt.date):
    """Renvoie (ouverture, fermeture) en minutes, ou None si fermé, ou (0, 1440)."""
    h = lieu.get("horaires") or {"tous": "00:00-24:00"}
    exc = {str(k): v for k, v in (lieu.get("exceptions") or {}).items()}
    val = exc.get(d.isoformat())
    if val is None:
        val = h.get(JOURS_FR[d.weekday()], h.get("tous", "00:00-24:00"))
    if val in (None, False, "ferme", "fermé"):
        return None
    a, b = str(val).split("-")
    ouv, ferm = en_min(a), en_min(b)
    if ferm <= ouv:  # ferme après minuit (ex. 06:00-01:00)
        ferm += 24 * 60
    return ouv, ferm


def soleil(d: dt.date, tz: str, coord=(40.758, -73.9855)):
    loc = LocationInfo("NYC", "USA", tz, coord[0], coord[1])
    s = sun(loc.observer, date=d, tzinfo=zoneinfo.ZoneInfo(tz))
    f = lambda t: t.hour * 60 + t.minute + (1 if t.second >= 30 else 0)
    return {"lever": f(s["sunrise"]), "coucher": f(s["sunset"]), "nuit": f(s["dusk"])}


# --------------------------------------------------------------------------- modèle
@dataclass
class Alerte:
    niveau: str  # "erreur" | "attention" | "info"
    jour: str
    etape: str
    message: str


@dataclass
class Etape:
    index: int
    jour: dt.date
    id_lieu: str
    lieu: dict
    titre: str
    arrivee: int
    debut: int
    fin: int
    attente: int
    trajet: dict | None
    trajet_min: int
    trajet_base: int
    distance_km: float | None
    coord_debut: tuple
    coord_fin: tuple
    origine: tuple
    brut: dict
    repas: str | None = None

    @property
    def duree(self):
        return self.fin - self.debut


@dataclass
class Jour:
    date: dt.date
    titre: str
    theme: str
    couleur: str
    depart: int
    soleil: dict
    etapes: list = field(default_factory=list)
    note: str | None = None


# --------------------------------------------------------------------------- calcul
def calculer(voyage, lieux, programme):
    stations = charger("stations") if (DATA / "stations.yaml").exists() else {}
    regles = voyage["regles_calcul"]
    tz = voyage["fuseau"]
    hotel = tuple(lieux["hotel"]["coord"])
    alertes: list[Alerte] = []
    jours = []

    for j in programme["jours"]:
        d = as_date(j["date"])
        jour = Jour(d, j["titre"], j.get("theme", ""), j.get("couleur", "#c8102e"),
                    en_min(j["depart"]), soleil(d, tz), note=j.get("note"))
        t = jour.depart
        pos = hotel
        for i, s in enumerate(j["etapes"]):
            idl = s["lieu"]
            if idl not in lieux:
                alertes.append(Alerte("erreur", d.isoformat(), idl, f"Lieu inconnu « {idl} » (absent de lieux.yaml)."))
                continue
            L = lieux[idl]
            wps = L.get("waypoints")
            c_debut = tuple(s.get("coord") or (wps[0] if wps else L["coord"]))
            c_fin = tuple(s.get("coord") or (wps[-1] if wps else L["coord"]))
            titre = s.get("titre") or L["nom"]
            tr = s.get("trajet")
            if tr and tr.get("via"):
                inconnues = [v for v in tr["via"] if v not in stations]
                if inconnues:
                    alertes.append(Alerte("erreur", d.isoformat(), titre, f"Station(s) inconnue(s) dans data/stations.yaml : {', '.join(inconnues)}."))
                tr = {**tr, "via_coords": [stations[v] for v in tr["via"] if v in stations]}
            base, dist = 0, None
            if tr:
                dist = haversine_km(pos, c_debut)
                calc = dist * regles["facteur_grille"] / regles["marche_kmh"] * 60
                if tr["mode"] == "marche":
                    if "duree" in tr:
                        base = tr["duree"]
                        if calc > 4 and abs(base - calc) / calc > regles["ecart_marche_tolere"]:
                            alertes.append(Alerte("attention", d.isoformat(), titre,
                                f"Marche saisie {base} min, calculée {calc:.0f} min ({dist*regles['facteur_grille']:.1f} km)."))
                    else:
                        base = max(2, round(calc))
                else:
                    base = tr.get("duree", 0)
                    if tr["mode"] in ("metro", "train") and dist > 0:
                        mini = dist / 28 * 60 + 8
                        if base < mini:
                            alertes.append(Alerte("attention", d.isoformat(), titre,
                                f"Trajet {tr['mode']} de {base} min peut-être optimiste ({dist:.1f} km à vol d'oiseau)."))
                marge = max(regles["marge_trajet_min"], math.ceil(base * regles["marge_trajet"])) if base else 0
                tmin = base + marge
            else:
                tmin = 0
            arrivee = ceil5(t + tmin) if tr else t
            debut = arrivee
            # contraintes de début
            if s.get("pas_avant"):
                debut = max(debut, en_min(s["pas_avant"]))
            plage = plage_du_jour(L, d)
            if plage is None and L.get("categorie") not in ("hotel", "transport", "repas"):
                alertes.append(Alerte("erreur", d.isoformat(), titre, "Lieu FERMÉ ce jour-là."))
            elif plage and plage != (0, 1440):
                debut = max(debut, plage[0])
            if s.get("creneau"):
                c = en_min(s["creneau"])
                if arrivee > c:
                    alertes.append(Alerte("erreur", d.isoformat(), titre,
                        f"Arrivée estimée {hm(arrivee)} après le créneau réservé {s['creneau']}."))
                    debut = max(debut, arrivee)
                else:
                    debut = max(debut, c)
            duree = s.get("duree", 0)
            fin = debut + duree
            et = Etape(i, d, idl, L, titre, arrivee, debut, fin, debut - arrivee, tr, tmin, base, dist,
                       c_debut, c_fin, pos, s, s.get("repas"))
            jour.etapes.append(et)
            t, pos = fin, c_fin
        jours.append(jour)
    return jours, alertes


# --------------------------------------------------------------------------- vérification
def verifier(voyage, lieux, jours, reservations, alertes):
    tz = voyage["fuseau"]
    resa = {r["id"]: r for r in reservations["reservations"]}
    vol = voyage["vols"]["depart"]
    for jour in jours:
        dj = jour.date.isoformat()
        sol = jour.soleil
        for e in jour.etapes:
            L, s = e.lieu, e.brut
            plage = plage_du_jour(L, e.jour)
            if plage and plage != (0, 1440) and L.get("categorie") not in ("hotel", "transport", "repas"):
                ouv, ferm = plage
                dern = L.get("derniere_entree", 0)
                if e.debut > ferm - dern:
                    alertes.append(Alerte("erreur", dj, e.titre,
                        f"Arrivée {hm(e.debut)} après la dernière entrée ({hm(ferm - dern)})."))
                elif e.fin > ferm:
                    alertes.append(Alerte("erreur", dj, e.titre,
                        f"Visite prévue jusqu'à {hm(e.fin)} mais fermeture à {hm(ferm)}."))
            fia = L.get("fiabilite")
            if fia == "a_verifier":
                alertes.append(Alerte("attention", dj, e.titre,
                    "Horaires à confirmer : " + L.get("note_horaires", "sources contradictoires.")))
            if s.get("nuit") and e.debut < sol["coucher"] + 5:
                alertes.append(Alerte("attention", dj, e.titre,
                    f"Étape « de nuit » qui commence à {hm(e.debut)}, avant la nuit (coucher {hm(sol['coucher'])})."))
            if s.get("coucher") and not (e.debut <= sol["coucher"] - 10 and e.fin >= sol["coucher"] + 10):
                alertes.append(Alerte("attention", dj, e.titre,
                    f"Le coucher du soleil ({hm(sol['coucher'])}) n'est pas bien encadré ({hm(e.debut)}-{hm(e.fin)})."))
            if e.attente >= 25 and e.index > 0:
                alertes.append(Alerte("info", dj, e.titre, f"{e.attente} min d'attente avant le début (ouverture / créneau) : marge confortable."))
            if L.get("reservation") == "obligatoire":
                r = resa.get(e.id_lieu)
                if r and r.get("statut") != "fait":
                    alertes.append(Alerte("info", dj, e.titre, "Réservation obligatoire, pas encore faite."))
            if e.repas:
                lab = e.repas.lower()
                if lab.startswith("déjeuner") and not (11 * 60 + 30 <= e.debut <= 15 * 60):
                    alertes.append(Alerte("info", dj, e.titre, f"Déjeuner à {hm(e.debut)} (hors 11h30-15h) : prévoir un en-cas."))
                if lab.startswith("dîner") and not (18 * 60 <= e.debut <= 21 * 60 + 30):
                    alertes.append(Alerte("info", dj, e.titre, f"Dîner à {hm(e.debut)} (hors 18h-21h30) : prévoir un goûter."))
        if not jour.etapes:
            continue
        der = jour.etapes[-1]
        if der.id_lieu == "hotel" and jour.date.isoformat() != "2026-12-31":
            cible = en_min(voyage["rythme"]["retour_hotel_cible"][1])
            if der.arrivee > cible:
                alertes.append(Alerte("attention", dj, "Retour hôtel", f"Retour à {hm(der.arrivee)}, après {hm(cible)}."))
        if as_date(vol["date"]) == jour.date and der.id_lieu == "jfk":
            limite = en_min(vol["heure"]) - vol["avance_aeroport_min"]
            if der.arrivee > limite:
                alertes.append(Alerte("erreur", dj, "Départ JFK",
                    f"Arrivée à JFK {hm(der.arrivee)} : trop tard (il faut y être avant {hm(limite)})."))
            else:
                alertes.append(Alerte("info", dj, "Départ JFK",
                    f"Arrivée à JFK à {hm(der.arrivee)}, soit {(en_min(vol['heure']) - der.arrivee)//60} h {(en_min(vol['heure']) - der.arrivee)%60:02d} avant le vol de {vol['heure']}."))
    return alertes


# --------------------------------------------------------------------------- budget & pass
def budget(voyage, lieux, jours, pass_cfg):
    taux = voyage["taux_eur_usd"]
    lignes, transport, nb_metro = [], 0.0, 0
    vus = set()
    for jour in jours:
        for e in jour.etapes:
            tr = e.trajet or {}
            if tr.get("mode") in ("metro", "train") and any(str(l) not in ("MNR", "LIRR") for l in tr.get("lignes", [])):
                nb_metro += 1
            if tr.get("prix") and tr.get("mode") != "metro":
                transport += tr["prix"]
            p = (e.lieu.get("prix") or {}).get("montant", 0)
            if p and e.id_lieu not in vus and e.lieu.get("categorie") not in ("hotel", "transport", "repas"):
                vus.add(e.id_lieu)
                lignes.append({"id": e.id_lieu, "nom": e.lieu["nom"], "prix": p,
                               "pass": e.lieu.get("pass", []), "note": e.lieu["prix"].get("note", "")})
    metro = min(nb_metro * 3.0, 35.0)
    # comparatif des pass
    couverts_prog = [l for l in lignes if "citypass" in l["pass"]]
    seul = sum(l["prix"] for l in lignes)
    res = {"lignes": lignes, "nb_metro": nb_metro, "metro_usd": metro, "transport_usd": transport,
           "taux": taux, "scenarios": []}
    prix_lieu = lambda i: (lieux.get(i, {}).get("prix") or {}).get("montant") or pass_cfg["prix_hors_programme"].get(i, {}).get("montant", 0)
    for code, o in pass_cfg["offres"].items():
        cout_pass_eur = (o["prix_eur"] + o["frais_eur"])
        couvre = [l for l in lignes if l["id"] in o["liste"]]
        if o["mode"] == "choix":
            couvre = sorted(couvre, key=lambda l: -l["prix"])[: o["nb_attractions"]]
            bonus_ids = []
            if len(couvre) < o["nb_attractions"]:
                cinq = pass_cfg.get("cinquieme_choix_citypass")
                if cinq and cinq not in [l["id"] for l in couvre]:
                    bonus_ids = [cinq]
        else:
            bonus_ids = [i for i in o["liste"] if i not in [l["id"] for l in lignes]]
        hors = [l for l in lignes if l["id"] not in [c["id"] for c in couvre]]
        valeur = sum(l["prix"] for l in couvre)
        valeur_bonus = sum(prix_lieu(i) for i in bonus_ids)
        a_payer_usd = sum(l["prix"] for l in hors)
        total_eur_pp = cout_pass_eur + a_payer_usd / taux
        res["scenarios"].append({
            "code": code, "nom": o["nom"], "cout_pass_eur": cout_pass_eur,
            "couvre": couvre, "hors": hors, "valeur_couverte_usd": valeur,
            "bonus": [{"id": i, "nom": lieux.get(i, pass_cfg["prix_hors_programme"].get(i, {})).get("nom", i), "prix": prix_lieu(i)} for i in bonus_ids],
            "valeur_bonus_usd": valeur_bonus,
            "economie_eur_pp": valeur / taux - cout_pass_eur,
            "total_eur_pp": total_eur_pp, "total_eur_3": total_eur_pp * 3,
        })
    sans = seul / taux
    res["scenarios"].insert(0, {"code": "aucun", "nom": "Sans pass (billets séparés)", "cout_pass_eur": 0,
                                "couvre": [], "hors": lignes, "valeur_couverte_usd": 0, "bonus": [], "valeur_bonus_usd": 0,
                                "economie_eur_pp": 0, "total_eur_pp": sans, "total_eur_3": sans * 3})
    meilleur = min(res["scenarios"], key=lambda s: s["total_eur_pp"])
    res["meilleur"] = meilleur["code"]
    res["attractions_total_usd"] = seul
    return res


# --------------------------------------------------------------------------- point d'entrée
def charger_et_calculer():
    voyage = charger("voyage")
    lieux = charger("lieux")
    programme = charger("programme")
    options = charger("options")
    reservations = charger("reservations")
    pass_cfg = charger("pass")
    jeux = charger("jeux")
    jours, alertes = calculer(voyage, lieux, programme)
    alertes = verifier(voyage, lieux, jours, reservations, alertes)
    bud = budget(voyage, lieux, jours, pass_cfg)
    return {"voyage": voyage, "lieux": lieux, "jours": jours, "alertes": alertes, "options": options,
            "reservations": reservations, "pass": pass_cfg, "budget": bud, "jeux": jeux}
