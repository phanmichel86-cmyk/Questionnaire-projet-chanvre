# Expert construction chanvre — Planète Chanvre

Chatbot web qui répond aux questions sur la construction et la rénovation en chanvre
(béton et enduits chanvre-chaux, blocs, isolants, performances, réglementation, aides,
pathologies, coûts, produits Planète Chanvre). Il s'adapte à quatre profils :
particulier / autoconstructeur, artisan, architecte / bureau d'études, équipe commerciale.

L'expert (Claude, via l'API Anthropic) **cherche dans une base de connaissances** avant de
répondre et **cite ses sources** ; il dit quand une information n'y figure pas.

```
backend/        API FastAPI (Python) : recherche + dialogue avec Claude en streaming
frontend/       Interface web (HTML/CSS/JS sans dépendance externe), servie par le backend
knowledge/
  general/      Fiches publiques sur la construction en chanvre (versionnées)
  prive/        Documents Planète Chanvre convertis (NON versionnés, voir plus bas)
```

## Démarrage

Prérequis : Python 3.11+ et une clé API Anthropic (https://console.anthropic.com/).

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows : .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # puis renseigner ANTHROPIC_API_KEY
uvicorn app.main:app --port 8000
```

Ouvrir http://localhost:8000.

Tests (sans appel à l'API, Claude est simulé) : `cd backend && python -m pytest`.

## Réglages (`backend/.env`)

| Variable | Rôle | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic | — |
| `EXPERT_MODELE` | Modèle Claude | `claude-opus-5-5` |
| `EXPERT_EFFORT` | Profondeur de réflexion : `low`, `medium`, `high` (plus haut = plus précis, plus lent, plus cher) | `medium` |
| `CODE_ACCES_INTERNE` | Code exigé pour le profil « Équipe commerciale » et les documents internes | vide (accès libre) |
| `QUESTIONS_PAR_HEURE` | Limite anti-abus par adresse IP (0 = illimité) | `40` |

> **Avant toute mise en ligne publique, définissez `CODE_ACCES_INTERNE`.** Sans code, n'importe
> quel visiteur peut choisir le profil commercial et obtenir le contenu des documents internes
> (argumentaire, lexique…).

La bascule automatique de modèle en cas de refus injustifié (`fallbacks: "default"`) est
activée ; elle se désactive avec `EXPERT_FALLBACKS=false`.

## Base de connaissances

### Fiches générales (`knowledge/general/`)
15 fiches rédigées à partir de sources publiques (Construire en Chanvre, AQC/C2P, CSTB,
ADEME, INIES, ANAH, publications scientifiques), chacune avec ses sources :
matériau et filière, formulations, mise en œuvre, blocs et préfabrication, isolants,
performances thermiques et hygrothermiques, acoustique/feu/durabilité, réglementation et
RE2020, aides, rénovation du bâti ancien, pathologies, coûts, FAQ particuliers,
argumentaire et objections, glossaire.

⚠️ **Elles doivent être relues par un professionnel avant mise en service** : les passages
marqués « à vérifier » ou « ordre de grandeur » signalent les valeurs les plus incertaines,
et les sujets réglementaires (aides 2026, RE2020, Règles professionnelles 2024) évoluent vite.

### Documents Planète Chanvre (`knowledge/prive/`)
Ce dossier est **exclu de Git** (le dépôt est public). Pour y ajouter des documents :

1. Déposer les fichiers (PDF, Word, Excel, HTML, Markdown, texte) dans `knowledge/prive/sources/`.
2. Les convertir :
   ```bash
   cd backend
   python -m scripts.importer_documents                          # documents internes (profil commercial uniquement)
   python -m scripts.importer_documents --acces public fiche.pdf # documents diffusables à tous
   ```
3. Redémarrer le serveur (ou `POST /api/recharger?code_acces=…`).

Un document scanné (image sans texte) doit d'abord passer par un OCR.

### Format d'une fiche
Fichier Markdown avec un en-tête YAML :

```markdown
---
titre: Béton de chanvre — formulations
categorie: materiau          # materiau | mise-en-oeuvre | performances | reglementation | renovation | pathologies | economie | commercial | produit
public: [artisan, prescripteur]
acces: public                # public | interne (interne = profil commercial uniquement)
mots_cles: [hempcrete, chanvre-chaux, chènevotte]
---
# Béton de chanvre — formulations

## Une section par sujet
Chaque section « ## » est indexée séparément : elle doit se comprendre seule.
```

## Fonctionnement

1. La question part vers `POST /api/chat` avec le profil et l'historique de la conversation.
2. Claude appelle l'outil `rechercher_base_connaissances` (recherche plein texte BM25 sur
   les sections des fiches) autant de fois que nécessaire, en reformulant si besoin.
3. La réponse est diffusée en streaming (Server-Sent Events) avec les références citées ;
   l'interface affiche les sources sous chaque réponse.

Coût indicatif : quelques centimes par question avec `claude-opus-5-5` en effort `medium`
(le prompt système et les outils sont mis en cache entre les tours).
