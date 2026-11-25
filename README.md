# New York · Noël 2026 — tour de contrôle

Programme familial du 27 décembre 2026 au 1er janvier 2027 : une appli web installable sur le téléphone,
avec de vraies cartes qui marchent sans connexion, un PDF heure par heure, un agenda et une carte Google Maps.
Tout est généré automatiquement à partir des fichiers de `data/`.

## Ce qu'il y a

| Quoi | Où |
|---|---|
| **L'appli** (à installer sur l'écran d'accueil) | l'adresse Cloudflare Pages du projet (mise en ligne : [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md)) |
| Le programme heure par heure, avec les cartes | [`dist/programme.pdf`](dist/programme.pdf) (aussi dans l'appli : Plus → PDF) |
| L'agenda du téléphone | [`dist/voyage.ics`](dist/voyage.ics) |
| La carte dans Google Maps (via Google My Maps) | [`dist/voyage.kml`](dist/voyage.kml) |
| Le rapport de vérification | [`dist/verification.md`](dist/verification.md) |

## Modifier le programme

**Le plus simple : l'écrire à Claude** (« il pleut », « on a une heure de retard », « on préfère faire X demain »).
Claude modifie les données, revérifie horaires et trajets, et pousse sur GitHub : l'appli et le PDF se mettent à jour
tout seuls en 2-3 minutes, sans changer d'adresse.

**À la main** : modifier `data/programme.yaml` (même depuis l'appli GitHub). Les heures se recalculent toutes seules.

Sur ordinateur :

```bash
pip install -r requirements.txt
make          # vérifie, régénère dist/ et le PDF
make serve    # teste l'appli sur http://127.0.0.1:8787
```

Détails techniques, règles et historique des décisions : [`CLAUDE.md`](CLAUDE.md).
