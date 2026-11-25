# Mettre l'appli en ligne sur Cloudflare Pages (une seule fois, ~10 minutes)

Tout est gratuit. Ensuite, chaque modification du programme met l'appli à jour toute seule.

## 1. Créer le compte

1. Aller sur **https://dash.cloudflare.com/sign-up** et créer un compte (e-mail + mot de passe), puis valider l'e-mail.

## 2. Relier le dépôt GitHub (publication automatique)

1. Menu de gauche : **Compute (Workers) → Workers & Pages** → bouton **Create** (Créer) → onglet **Pages** → **Import an existing Git repository** (Connecter à Git).
2. **Connect GitHub** : autoriser Cloudflare, en choisissant **Only select repositories** → `voyage-new-york-2026`.
3. Sélectionner le dépôt `voyage-new-york-2026` → **Begin setup**.
4. Réglages :
   - **Project name** : par exemple `nyc-noel-famille` (l'adresse sera `https://nyc-noel-famille.pages.dev`).
   - **Production branch** : `main`
   - **Framework preset** : `None`
   - **Build command** : `exit 0`
   - **Build output directory** : `dist/site`
5. **Save and Deploy**. Une minute plus tard, l'appli est en ligne.

## 3. Activer la synchronisation entre les téléphones

1. Menu de gauche : **Storage & Databases → KV** → **Create** (Créer) → nom : `nyc26-etat` → **Add**.
2. Retourner dans **Workers & Pages** → le projet `nyc-noel-famille` → **Settings** → **Bindings** → **Add** → **KV namespace**.
   - **Variable name** : `ETAT` (en majuscules, exactement)
   - **KV namespace** : `nyc26-etat` → **Save**.
3. Onglet **Deployments** → sur le dernier déploiement, menu **⋯ → Retry deployment** (pour que la liaison soit prise en compte).

Dans l'appli, le petit point en haut à droite passe au vert : « Synchronisé ».

## 4. Protéger l'accès (recommandé)

Sans cette étape, toute personne qui connaît l'adresse peut voir le programme (dates, hôtel).

1. Menu de gauche : **Zero Trust**. La première fois : choisir un nom d'équipe et l'offre **Free** (gratuite jusqu'à 50 personnes ; Cloudflare peut demander une carte bancaire sans rien prélever).
2. **Access → Applications → Add an application → Self-hosted**.
   - **Application name** : `NY Noël`
   - **Session duration** : `1 month`
   - **Application domain** : `nyc-noel-famille.pages.dev` (votre adresse, sans https://)
3. **Policy** : nom `Famille`, action **Allow**, règle **Include → Emails** → saisir les 3 adresses e-mail de la famille. **Save**.

À la première ouverture, chacun saisit son e-mail et reçoit un code à 6 chiffres. Ensuite, l'appli reste ouverte un mois, et fonctionne hors connexion.

## 5. Installer l'appli sur les téléphones

- **iPhone** : ouvrir l'adresse dans **Safari** → bouton **Partager** → **Sur l'écran d'accueil**.
- **Android** : ouvrir l'adresse dans **Chrome** → menu **⋮** → **Installer l'application**.

Ouvrir l'appli une fois avec du réseau (idéalement en Wi-Fi) : elle télécharge les cartes (~18 Mo) pour le hors-ligne.
Plus → « PDF, agenda, Google Maps » indique quand c'est prêt.

## Et ensuite ?

Rien à faire : à chaque modification (demandée à Claude ou faite sur GitHub), GitHub régénère le programme et Cloudflare
republie l'appli en 2-3 minutes, à la même adresse.
