# Coach Sportif IA

Application web de coach sportif personnalisé, propulsée par l'API Claude.

## Fonctionnalités

- **Profil personnalisé** : âge, niveau, objectif, équipement, contraintes, préférences alimentaires
- **Journal d'entraînement** : séances avec exercices détaillés (séries, reps, charge, repos)
- **Mesures corporelles** : poids, % muscle, % graisse, mensurations (taille, hanches, bras, cuisse)
- **Graphiques de progression** : visualisation temporelle de l'évolution
- **Coach IA (Claude Opus 4.7)** :
  - Génération de séances adaptées à votre progression et vos objectifs
  - Plans nutrition personnalisés avec calcul des besoins et macros
  - Analyse approfondie de la progression
  - Questions libres au coach
- **Plans sauvegardés** : tous les programmes générés sont stockés et consultables

## Stack technique

- **Backend** : Node.js + Express + SQLite (better-sqlite3)
- **IA** : `@anthropic-ai/sdk` avec Claude Opus 4.7 (adaptive thinking)
- **Frontend** : HTML/CSS/JS vanilla + Chart.js + marked
- **Base de données** : fichier SQLite local (`data/coach.db`)

## Installation

```bash
npm install
cp .env.example .env
# Éditez .env et ajoutez votre clé ANTHROPIC_API_KEY
npm start
```

Ouvrez ensuite http://localhost:3000

## Configuration

Variables d'environnement (`.env`) :

- `ANTHROPIC_API_KEY` : votre clé API Anthropic (obligatoire pour les fonctions IA)
- `PORT` : port d'écoute (par défaut 3000)

Sans clé API, l'application fonctionne pour la saisie/suivi mais les fonctions IA renvoient une erreur 503.

## Workflow recommandé

1. **Commencer par remplir votre profil** (onglet Profil) — c'est ce qui personnalise tous les conseils.
2. **Enregistrer une première mesure** corporelle.
3. **Demander une séance** au coach IA (onglet Coach IA) — elle s'appuie sur votre profil.
4. **Logger vos séances** dans le journal après chaque entraînement.
5. **Suivre régulièrement vos mesures** pour alimenter la progression.
6. Consulter régulièrement l'analyse de progression IA pour ajuster.

## Structure

```
.
├── server.js          # Backend Express + endpoints IA
├── public/
│   ├── index.html     # UI
│   ├── styles.css     # Styles
│   └── app.js         # Logique frontend
└── data/
    └── coach.db       # Base SQLite (créée automatiquement)
```

## Installation sur téléphone (PWA)

L'app est une **Progressive Web App** — installable sur l'écran d'accueil.

### Android / Chrome
1. Ouvrez l'app dans Chrome.
2. Un bouton **📲 Installer** apparaît en bas à droite, ou via le menu Chrome → « Installer l'application ».
3. L'app s'ouvre ensuite comme une vraie app, en plein écran.

### iOS / Safari
1. Ouvrez l'app dans Safari.
2. Bouton de partage → « Sur l'écran d'accueil ».
3. L'icône apparaît, l'app s'ouvre en plein écran.

L'app fonctionne hors ligne pour la consultation et la saisie (les données se synchronisent ensuite). Les fonctions IA exigent évidemment une connexion.

## Déploiement cloud

Pour accéder à l'app depuis votre téléphone partout (Basic Fit, déplacements…), il faut héberger le backend.

### Option A — Fly.io (recommandé, free tier généreux)

```bash
# 1. Installer flyctl : https://fly.io/docs/hands-on/install-flyctl/
fly auth login
fly launch --no-deploy        # choisit un nom unique et utilise fly.toml
fly volumes create coach_data --size 1 --region cdg
fly secrets set ANTHROPIC_API_KEY=sk-ant-xxx
fly deploy
```

Le `fly.toml` est déjà configuré (région Paris, machine 256 MB, volume persistant pour SQLite, HTTPS auto). Coût estimé : **0 €/mois** avec le free tier (1 machine shared + 3 GB de volume).

### Option B — Render

```bash
# 1. Pousser le repo sur GitHub
# 2. Sur render.com : New → Blueprint → pointer vers le repo
# 3. Ajouter ANTHROPIC_API_KEY dans les Environment Variables
```

⚠️ La persistance disque sur Render exige un plan payant (~7 €/mois). Sur le free tier la base SQLite est perdue à chaque redéploiement.

### Option C — Docker (n'importe quel VPS)

```bash
docker build -t coach-ia .
docker run -d -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-xxx \
  -v $(pwd)/data:/app/data \
  coach-ia
```

### Option D — Wi-Fi local (le plus simple)

Lancer `npm start` sur un PC à la maison, puis depuis le téléphone : `http://<ip-locale-du-pc>:3000`. Fonctionne uniquement sur le même Wi-Fi.

## Notes

- L'IA reçoit votre profil, vos 8 dernières mesures et vos 8 dernières séances comme contexte pour chaque génération.
- Si vous indiquez **Basic Fit** dans votre profil, le coach connaît la liste des machines Matrix disponibles (chest press, lat pulldown, leg press, etc.) + poids libres, et ne propose que des exercices exécutables sur place.
- Les plans générés sont automatiquement sauvegardés dans l'onglet Plans.
- Toutes les données restent stockées dans `data/coach.db` (en local ou sur le volume du serveur).
