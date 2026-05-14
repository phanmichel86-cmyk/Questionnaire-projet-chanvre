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

## Notes

- L'IA reçoit votre profil, vos 8 dernières mesures et vos 8 dernières séances comme contexte pour chaque génération.
- Les plans générés sont automatiquement sauvegardés dans l'onglet Plans.
- Toutes les données restent en local sur votre machine.
