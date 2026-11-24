# CLAUDE.md — Tour de contrôle « New York, Noël 2026 »

Mémoire du projet. À lire en entier au début de chaque session : elle contient tout ce qu'il faut
pour reprendre sans rien perdre. **Toujours répondre en français.**

## 1. Le voyage (faits figés)

- **Voyageurs** : une mère et ses deux fils (22 et 18 ans). 3 adultes pour les billets. Aucune contrainte physique, ils aiment marcher. Déjà venus à New York.
- **Le cadet a 18 ans** : pas d'alcool, exclu des événements « 21+ » (bars, rooftops, certaines croisières).
- **Hôtel** : 330 W 40th St, New York, NY 10018 (Hell's Kitchen, face au Port Authority Bus Terminal).
- **Arrivée** : dimanche 27 déc. 2026, JFK à 20h → uniquement le trajet jusqu'à l'hôtel (taxi jaune conseillé).
- **Journées complètes** : lundi 28, mardi 29, mercredi 30, jeudi 31 décembre, vendredi 1er janvier 2027 (pas de week-end sur place).
- **Départ** : vol JFK le 1er janvier en fin de journée (« minuit » = 23h59 le 1er, confirmé par la famille). Check-out le matin, valises à la bagagerie. Heure exacte et terminal à confirmer → `data/voyage.yaml > vols.depart`.
- **Chacun a sa propre carte bancaire sans contact** → plafond OMNY individuel (35 $/7 jours).
- **Objectif n°1** : s'imprégner au maximum de la magie de Noël.

## 2. Règles de planification (exigences de la famille)

1. Départ de l'hôtel vers 9h, retour vers 22h30-23h (sauf le 31). Journées intenses.
2. Repas : créneaux flexibles, les visites passent avant. **Jamais d'adresse de restaurant** : quartier + créneau seulement. (Les adresses de friperies et boutiques sont permises.)
3. Horaires réels vérifiés (site officiel d'abord), fêtes et 1er janvier inclus ; dernières entrées ; créneaux.
4. Durées réalistes (file, sécurité, vestiaire). Trajets réels : ligne, stations, durée porte à porte, +15 % de marge.
5. Logique géographique : un quartier par bloc, pas d'allers-retours.
6. Le bon moment : lumières et vitrines après la nuit (≈ 17h), panoramas au coucher du soleil (≈ 16h35), lieux populaires tôt ou aux heures creuses.
7. Vérification finale à chaque modification (`make check`) et signaler tout point serré.
8. **Priorités** de la note : « Absolument » = obligatoire ; « + » = forte priorité (envie forte ou jamais fait), pas obligatoire ; le reste = bonus.
9. Pendant le voyage, pas de plan B figé : quand la famille dit « il pleut », « c'est fermé », « on est en retard », « on préfère X », on réorganise avec les mêmes règles et on régénère tout.
10. Proposer de meilleures idées quand on en voit (la note n'est pas fermée).

## 3. Architecture (une seule source de vérité)

```
data/voyage.yaml        paramètres (vols, hôtel, règles de calcul, marges, taux €/$)
data/lieux.yaml         base des lieux : horaires par jour + exceptions, prix, pass, source, date de vérif, astuce photo, anecdote
data/programme.yaml     ★ le planning : jours → étapes (lieu, trajet, durée, créneau). Les HEURES sont CALCULÉES.
data/options.yaml       réveillon (7 options comparées), Statue de la Liberté, match, Greeter, banque d'idées, plan pluie
data/reservations.yaml  réservations par urgence, avec statut (a_faire / fait)
data/pass.yaml          CityPASS vs C-All (comparatif calculé)
data/jeux.yaml          bingo, défis photo, quiz
data/infos.yaml         infos pratiques (OMNY, JFK, pourboires, froid)
tools/core.py           moteur : cascade des horaires, vérifications, budget, pass
tools/check.py          vérificateur (console) — `--strict` échoue s'il reste une erreur
tools/build.py          génère dist/ ; tools/svgmap.py = cartes SVG hors-ligne ; tools/templates/*.j2
tools/render_pdf.mjs    dist/programme.html → dist/programme.pdf (Chromium / Playwright)
dist/                   GÉNÉRÉ, ne jamais éditer à la main
```

Livrables dans `dist/` : `programme.pdf` (heure par heure), `index.html` (mini-site autonome, marche hors connexion),
`artifact.html` (même site, version publiée sur claude.ai), `carte.html` (carte interactive Leaflet),
`voyage.ics` (agenda), `voyage.kml` (Google My Maps, un calque par jour), `verification.md`, `programme.json`.

### Commandes
- `make` (= `make check build pdf`), ou :
- `python3 tools/check.py` → planning calculé + alertes ❌/⚠️/ℹ️
- `python3 tools/build.py` → dist/
- `node tools/render_pdf.mjs` → PDF
- Dépendances : `pip install -r requirements.txt` (pyyaml, jinja2, astral) ; Playwright/Chromium (préinstallé dans l'environnement Claude Code).

### Comment fonctionne le calcul
- `debut = max(arrivée, pas_avant, ouverture du lieu ce jour-là, créneau)` ; `arrivée = fin précédente + trajet × 1,15 (min +3 min)`, arrondie aux 5 min.
- Marche : durée calculée depuis les coordonnées (vol d'oiseau × 1,3 / 4,5 km/h) si non saisie ; alerte si l'écart dépasse 45 %.
- Contrôles : lieu fermé, dernière entrée, fermeture, créneau manqué, `nuit: true` avant la nuit, `coucher: true` qui n'encadre pas le coucher du soleil (astral), repas hors créneau, retour à l'hôtel après 23h, arrivée à JFK moins de 3 h avant le vol, horaires « à vérifier ».

### Mode opératoire pour une modification (pendant le voyage)
1. Lire la demande, regarder l'heure à New York et l'étape en cours.
2. Modifier `data/programme.yaml` (et/ou lieux/options) en respectant les règles du §2.
3. `python3 tools/check.py` jusqu'à 0 ❌ ; signaler les ⚠️ restants à la famille.
4. `python3 tools/build.py && node tools/render_pdf.mjs`.
5. Commit + push sur `main` (dépôt de la famille, push direct autorisé), puis republier l'artifact (`dist/artifact.html`, même URL).
6. Noter la décision dans le §6 ci-dessous.

### Mini-site (artifact claude.ai)
- URL : voir §5. Republier `dist/artifact.html` au même chemin/URL (garder les capabilities).
- Capabilities : `db` + `user` (scope profile). Collections : `etat/resa`, `etat/bingo`, `etat/faits` (cases cochées partagées entre les 3 téléphones), `votes/<uid>` (vote du réveillon ; règle : chacun écrit le sien, tout le monde lit).
- **Synchroniser les réservations** : lire `etat/resa` (ArtifactData get) → reporter `statut: fait` dans `data/reservations.yaml`.
- Le fichier `dist/index.html` est la version hors-ligne (même code, stockage local si pas de claude.ai).

### GitHub Actions
`.github/workflows/build.yml` : à chaque push qui touche `data/` ou `tools/`, vérifie, régénère `dist/` (PDF compris) et le commite. La famille peut donc modifier un YAML depuis l'appli GitHub sur téléphone.

## 4. Vérifications faites le 24/11/2026 (sources dans dist/programme.pdf, dernière page)

Confirmé : Bryant Park jusqu'au 3 janv. (stands 11h-20h en semaine) · Grand Central Holiday Fair FERMÉ dès le 24 déc. · sapin du Rockefeller allumé le 2 déc., jusqu'à mi-janv. · MET fermé le mercredi et le 1er janv. ; sapin + crèche jusqu'au 6 janv. · AMNH ouvert le 1er janv. (9h-20h du 27 au 30 déc.) · NYBG Holiday Train Show du 14 nov. au 10 janv., fermé le lundi · CityPASS : depuis sept. 2026, 5 attractions AU CHOIX parmi 10 (ESB, AMNH, Top of the Rock, 9/11, Statue, Circle Line, Intrepid, Guggenheim, Edge, Whitney), 149 $ · OMNY : 3 $, plafond 35 $ / 7 jours glissants par moyen de paiement (forfaits MetroCard supprimés) · AirTrain 8,75 $ (groupe : 4,50 $ par personne en plus) · NYC Ferry 5 $ depuis le 19 oct. 2026 · Metro-North CityTicket 5,25 $ hors pointe · Saks light show depuis le 23 nov. · Hudson Yards « Shine Bright » jusqu'au 7 janv. · Bronx Zoo lights du 26 au 31 déc. · Rockettes jusqu'au 4 janv. · Prospect Park : feux à minuit le 31 (RSVP).
Matchs : aucun Knicks/Rangers/Devils à domicile du 28 au 31 ; Nets à l'extérieur ; seuls les Islanders le 30 à 16h (UBS Arena) → match déconseillé.

**À revérifier vers le 20 décembre (⚠️)** : horaires des fêtes de Wollman (lun-mar normalement 10h-14h30), Museum at FIT et Bowne & Co le 31, MAD (lundi / 1er janv.), Empire State (horaires de nuit), Macy's, hiver NYC Ferry, Columbus Circle (dates 2026), MoMI pendant les fêtes, Statue (ferry le 1er janv.), 9/11 Museum le 31 et le 1er, liste officielle du C-All.

**Réseau de l'environnement** : les sites officiels (citypass.com, mta.info, etc.) ne sont pas joignables par fetch depuis le conteneur ; la vérification passe par la recherche web.

## 5. Liens

- Dépôt : https://github.com/diegojourne-cpu/voyage-new-york-2026
- Mini-site (artifact claude.ai, privé par défaut — à partager aux fils via le menu Partager) : https://claude.ai/artifact/JWyWEGNX5sAJz6Le2mXh19
  Republier : publier `dist/artifact.html` avec `url` = ce lien (depuis une autre conversation, le lire d'abord).

## 6. Journal des décisions

- 24/11 — Note de la famille et photos Routard (p. 175, 191, 211, 217, 271) reçues → `sources/`.
- 24/11 — Vol retour = 1er janv. en fin de journée (23h59 provisoire). Chacun a sa carte.
- 24/11 — La famille délègue les arbitrages à Claude. Décisions prises :
  - Structure : 28 Midtown/Noël (MET, Central Park, Wollman, 5e Av., Top of the Rock au coucher du soleil, sapin, Saks, Bryant Park) · 29 NYBG (10h) + Columbus Circle + MAD + MoMA + Macy's + Empire State de nuit · 30 Brooklyn (Bushwick, fripes, ferry, DUMBO, Heights au coucher du soleil, Dyker Heights) · 31 Downtown (9/11, SoHo Routard, Little Italy/Chinatown, Seaport/Bowne, Wall St, ferry de Staten Island au coucher du soleil, FIT) + réveillon · 1er AMNH + Greenwich Routard + High Line au coucher du soleil + Hudson Yards + JFK.
  - Pass : **CityPASS** (5 au choix : Top of the Rock, Empire State, AMNH, 9/11 + Statue si option, sinon Edge). C-All non rentable pour ce programme.
  - Réveillon : recommandation « dîner + feux de Central Park » ; la famille vote dans le mini-site.
  - Non programmés (banque d'idées) : MoMI (+, horaires des fêtes inconnus), Arthur Avenue, Harlem, Roosevelt Island, Routard NoHo/East Village et LES, Transit Museum, Whitney, Guggenheim, Rockettes, Bronx Zoo.
  - Statue de la Liberté : option qui remplacerait le jeudi 31 de 8h15 à 14h.
  - Match : déconseillé (aucun match qui s'intègre). Big Apple Greeter : demande à faire cette semaine si souhaité.
