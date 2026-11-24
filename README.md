# New York · Noël 2026 — tour de contrôle

Programme familial du 27 décembre 2026 au 1er janvier 2027, généré automatiquement à partir de fichiers de données.

## Ce qu'il y a à ouvrir

| Fichier | À quoi ça sert |
|---|---|
| [`dist/programme.pdf`](dist/programme.pdf) | Le programme heure par heure, à imprimer ou garder sur le téléphone |
| [`dist/index.html`](dist/index.html) | Le mini-site, en un seul fichier : à télécharger sur le téléphone, il marche **sans connexion** |
| [`dist/carte.html`](dist/carte.html) | Carte interactive (avec connexion) : un calque par jour |
| [`dist/voyage.kml`](dist/voyage.kml) | À importer dans [Google My Maps](https://www.google.com/mymaps) → la carte dans Google Maps, avec la navigation |
| [`dist/voyage.ics`](dist/voyage.ics) | À importer dans l'agenda du téléphone (Google Agenda, Apple Calendrier) |
| [`dist/verification.md`](dist/verification.md) | Le rapport de faisabilité (horaires, trajets, couchers du soleil) |

Le mini-site existe aussi en version en ligne sur claude.ai. Dans cette version, les cases cochées, le bingo et le vote du réveillon sont partagés entre les trois téléphones.

## Modifier le programme

**Le plus simple : le demander à Claude** (« il pleut », « on est en retard d'une heure », « on préfère faire X demain »). Claude modifie les données, revérifie tout, régénère les documents et les publie.

**À la main** : modifier `data/programme.yaml` (même depuis l'appli GitHub sur téléphone). Les heures se recalculent toutes seules. Une action GitHub vérifie le planning et régénère `dist/` en quelques minutes.

Sur ordinateur :

```bash
pip install -r requirements.txt
make          # vérifie, régénère dist/ et le PDF
```

Tous les détails techniques et l'historique des décisions sont dans [`CLAUDE.md`](CLAUDE.md).
