"""Vérificateur de faisabilité : affiche le planning calculé et toutes les alertes.

Usage : python tools/check.py            (sortie console)
        python tools/check.py --strict   (code de sortie 1 s'il reste une erreur)
"""
import sys

from core import ICONES_MODE, charger_et_calculer, date_fr, hm

SYMB = {"erreur": "❌", "attention": "⚠️ ", "info": "ℹ️ "}


def rapport_texte(R) -> str:
    out = []
    for j in R["jours"]:
        s = j.soleil
        out.append(f"\n=== {date_fr(j.date).upper()} — {j.titre}  (coucher {hm(s['coucher'])}, nuit {hm(s['nuit'])})")
        for e in j.etapes:
            tr = e.trajet or {}
            lig = "/".join(map(str, tr.get("lignes", [])))
            t = f"{ICONES_MODE.get(tr.get('mode'), '')} {tr.get('mode', '')} {lig} {e.trajet_min}′".strip() if tr else "départ"
            att = f" (+{e.attente}′ d'attente)" if e.attente else ""
            out.append(f"  {hm(e.debut)}–{hm(e.fin)}  {e.titre[:58]:58s}  ← {t}{att}")
    out.append("\n=== ALERTES")
    for a in sorted(R["alertes"], key=lambda a: ("erreur", "attention", "info").index(a.niveau)):
        out.append(f"{SYMB[a.niveau]} [{a.jour}] {a.etape} — {a.message}")
    b = R["budget"]
    out.append("\n=== PASS (par personne)")
    for sc in b["scenarios"]:
        out.append(f"  {sc['nom']:32s} total {sc['total_eur_pp']:7.2f} €  (pour 3 : {sc['total_eur_3']:7.2f} €)")
    out.append(f"  → meilleur : {b['meilleur']} ; métro {b['nb_metro']} trajets → {b['metro_usd']:.0f} $/pers.")
    return "\n".join(out)


if __name__ == "__main__":
    R = charger_et_calculer()
    print(rapport_texte(R))
    nb_err = sum(a.niveau == "erreur" for a in R["alertes"])
    print(f"\n{nb_err} erreur(s), {sum(a.niveau == 'attention' for a in R['alertes'])} point(s) d'attention.")
    if "--strict" in sys.argv and nb_err:
        sys.exit(1)
