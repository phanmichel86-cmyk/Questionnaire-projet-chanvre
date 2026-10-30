# Cahier des charges — CRM Planète Chanvre

> Version 0.1 · brouillon à valider · 30/10/2026
> Statut : **pour relecture, avant tout développement**. Les points marqués **[À valider]** attendent votre décision. La section 12 regroupe toutes les questions ouvertes.

---

## 1. Contexte

Planète Chanvre transforme de la paille de chanvre à Aulnoy (Seine-et-Marne). La société vend en B2B des produits de chanvre : fibre, chènevotte, chènevis, coproduits et produits de négoce.

| Repère | Valeur | Source |
|---|---|---|
| CA commercial, exercice 2026 (sept. → août) | 2 571 424 € | extraction Divalto du 12/08/2026, 5 familles commerciales |
| Tonnage commercial | 4 065,7 tonnes | idem |
| Clients facturés sur 12 mois | 229 | idem |
| Clients qui passent commande | 81 | idem |
| Commandes | 34 par mois en moyenne, 52 au plus | idem |
| Pièces de facturation | 72 par mois en moyenne, 187 au plus (décembre) | idem |
| Concentration | 5 premiers clients = 43,5 % du CA | idem |

L'ERP est **Divalto**, installé en client lourd sur les postes. On ne peut pas l'automatiser : les données sortent par **extractions Excel faites à la main**.

Aujourd'hui, le suivi commercial est éclaté entre Divalto, les mails, le téléphone, des listes de choses à faire et des classeurs Excel (cockpit ADV, plan de relance des impayés). Il n'existe aucun endroit unique où voir l'historique d'un client, ses affaires en cours et les prochaines actions à mener.

## 2. Objectifs

1. **Une fiche client unique** qui regroupe les coordonnées, les interlocuteurs, l'historique des échanges (mails, appels, visites), les commandes et factures Divalto, et les actions à faire.
2. **Un pipeline commercial** qui suit les affaires depuis le premier contact jusqu'à la commande saisie dans Divalto.
3. **Une liste de choses à faire partagée**, avec des relances datées et des rappels, pour que rien ne se perde entre deux personnes.
4. **Une lecture fiable des données Divalto** (commandes, reste à livrer, reliquats, factures, impayés), qui respecte les règles de lecture déjà établies par l'ADV et le projet Commerce.
5. **Un tableau de bord simple** : ce qui est à faire aujourd'hui, les affaires en cours, le CA par famille et par segment.

### Ce que le CRM ne fait pas

- **Il ne remplace pas Divalto.** Divalto reste la source de vérité pour les commandes, les stocks comptables, les bons de livraison et les factures.
- **Il ne crée aucune commande ni aucune facture.** Règle non négociable reprise du dossier ADV : aucune commande ne vit dans le pilotage sans exister dans l'ERP. Une affaire gagnée dans le CRM se termine par une saisie dans Divalto, faite par une personne.
- **Il ne remplace pas la comptabilité.** L'état « impayé » vient du lettrage Divalto au jour de l'extraction. La comptabilité doit le valider avant toute relance client.

## 3. Utilisateurs et rôles

Entre 1 et 5 personnes. Trois rôles suffisent :

| Rôle | Qui (à confirmer) | Droits |
|---|---|---|
| **Administrateur** | direction | tout, y compris la gestion des utilisateurs, l'import Divalto et les paramètres (étapes du pipeline, listes de valeurs) |
| **Commercial** | commerciaux, direction commerciale | créer et modifier clients, contacts, affaires, activités, tâches ; lire les commandes et factures |
| **ADV** | administration des ventes | comme Commercial, plus l'import Divalto, la mise en pause des commandes et le suivi des relances d'impayés |

Il n'y a pas de cloisonnement par portefeuille en V1 : tout le monde voit tous les clients. **[À valider]**

## 4. Périmètre fonctionnel de la V1

### 4.1 Clients et contacts

**Fiche société**

- Code tiers Divalto (`CC…` pour les clients, `CP…` pour les agriculteurs), raison sociale, pays, adresse, mail, téléphone, mode de règlement.
- **Segment client**, choisi dans une liste fermée : Animalerie / litière · Jardin / paillis · BTP / construction · Industrie / fibre / chènevis. Une société peut avoir plusieurs segments.
- **Univers commercial**, pour rester compatible avec le projet Commerce : Habitat & Construction biosourcée · Alimentation & Bien-être humain · Textile et autres industries · Agriculture & Jardin · Monde animal · R&D & Niches stratégiques. Ordre de priorité : choix manuel sur la fiche, puis fichier `univers_clients.csv`, puis repli sur les produits achetés.
- Statut : prospect · client actif · client inactif (aucune facture depuis 12 mois) · perdu.
- Commercial responsable.
- Indicateurs calculés depuis Divalto : CA de l'exercice en cours et de l'exercice précédent (en euros), tonnage (en tonnes), date de la dernière commande, reste à livrer (en tonnes), encours impayé (en euros).

**Clients finaux derrière BAFA Neu**

BAFA Neu (code `CCBAFAN`) commande pour ses propres clients allemands. Le nom du client final est écrit dans la « Référence de la pièce » (par exemple `BNP - 263508`). Le CRM :

- crée une fiche **client final** rattachée à BAFA Neu (ZG LAHR, KYNAST, BNP, PAPIRNA…) ;
- affiche ses commandes sous la forme `BNP (BAFA Neu)` ;
- applique la règle de lecture des scripts Commerce (alias `ZG` → `ZG LAHR`, règle `REGUL` + `BAFA` → `BNP`, repli `BAFA Neu`).

**Contacts**

- Nom, prénom, fonction, mail, téléphone fixe, portable, langue (FR / EN / DE / PT…), société.
- Rôle dans l'achat : décideur · acheteur · technique · comptabilité · logistique.
- Consentement à recevoir des mails commerciaux (RGPD), avec la date.

**Import initial** : le référentiel `client divalto.xlsx` (341 lignes) crée les fiches société. Il ne couvre que les comptes `CC`. Les comptes `CP` sont créés à partir des factures, sans contact, et signalés comme « fiche à compléter ».

### 4.2 Pipeline commercial

**Affaire (opportunité)** : société, contact principal, intitulé, produits visés, tonnage estimé (en tonnes), prix estimé (en € par tonne), montant estimé (en euros), date de décision prévue, étape, probabilité, commercial responsable, source (salon, site web, recommandation, appel entrant, relance d'un ancien client…).

**Étapes proposées** **[À valider]** :

| # | Étape | Ce qui la fait avancer |
|---|---|---|
| 1 | Premier contact | besoin identifié |
| 2 | Qualification | volume, produit, conditionnement et délai connus |
| 3 | Échantillon envoyé | échantillon parti, retour attendu |
| 4 | Offre envoyée | prix et conditions transmis au client |
| 5 | Négociation | retour du client sur l'offre |
| 6 | Gagnée | bon de commande client reçu → **à saisir dans Divalto** |
| 7 | Perdue | motif obligatoire : prix, délai, qualité, concurrent, projet abandonné, autre |

**Lignes produits d'une affaire** : chaque affaire peut porter plusieurs lignes (produit, conditionnement, tonnage, prix en € par tonne). Le choix du produit suit la nomenclature (voir 6.4) dans une liste groupée par famille.

**Contrats et échéanciers** : un contrat annuel livré en plusieurs camions (cas CANHAMOR, PROFILLIN) est une seule affaire avec un échéancier prévisionnel. Dans Divalto, il apparaît sous forme de commandes saisies en série. Le CRM rapproche les deux (voir 4.4).

**Lien avec Divalto** : quand l'affaire est gagnée, l'utilisateur saisit la commande dans Divalto. À l'import suivant, le CRM propose de rattacher les nouvelles commandes de ce client à l'affaire. Ce rapprochement est **manuel** : Divalto n'exporte aucun numéro qui relie les pièces entre elles.

**Vues** : tableau en colonnes par étape (glisser-déposer), liste filtrable, et prévision de CA pondérée par la probabilité, par mois et par famille de produit.

### 4.3 Activités, mails, téléphone et choses à faire

C'est le cœur de l'usage quotidien. Il remplace les listes de choses à faire dispersées.

**Types d'activité** : appel · mail · rendez-vous / visite · envoi d'échantillon · salon · note.
Chaque activité porte : date, durée, société, contact(s), affaire liée (facultatif), compte rendu, auteur.

**Tâches (choses à faire)**

- Intitulé, échéance, priorité, personne en charge, société / affaire / commande liée, statut (à faire · fait · annulé).
- Une tâche peut être créée depuis n'importe quelle fiche, ou depuis une activité (« prochaine étape »).
- Vue **« Ma journée »** : tâches en retard, tâches du jour, rendez-vous du jour.
- Vue **« Équipe »** : toutes les tâches ouvertes par personne.
- Rappel par mail le matin à la personne en charge (facultatif, réglable par utilisateur).

**Tâches créées automatiquement** à chaque import Divalto, à valider par l'ADV avant d'être envoyées aux commerciaux **[À valider]** :

| Déclencheur | Tâche proposée |
|---|---|
| Ligne de commande ouverte depuis plus de 6 mois | « Vérifier avec le client si la commande tient toujours » |
| Reliquat détecté | « Solder le reliquat dans Divalto » (ADV) |
| Reliquat supérieur à 20 % de la ligne | « Appeler le client : livraison inachevée » (commercial) |
| Commandes saisies en série non confirmées | « Confirmer que l'échéancier est ferme » (commercial) |
| Facture échue et non réglée | « Faire valider par la comptabilité, puis relancer » (ADV) |
| Client actif sans commande depuis N mois | « Reprendre contact » (commercial) |
| Offre envoyée sans réponse depuis 15 jours | « Relancer l'offre » (commercial) |

**Mails** **[À valider, voir question 3]**. Trois niveaux possibles, du plus simple au plus intégré :

1. **Copie cachée** : une adresse dédiée (par exemple `crm@…`) mise en copie cachée. Le CRM classe le mail sur la fiche du contact grâce à son adresse.
2. **Connexion à la messagerie** (Gmail / Google Workspace ou Microsoft 365) : les mails échangés avec les contacts connus sont rattachés automatiquement, et on peut envoyer un mail depuis la fiche.
3. **Modèles de mail** : relance d'offre, relance d'impayé, envoi d'échantillon, en français, anglais et allemand.

Recommandation : niveau 1 en V1, niveau 2 en V2.

**Téléphone**

- Numéros cliquables (lien `tel:`) qui lancent l'appel depuis un portable ou un softphone.
- Bouton « Noter un appel » qui ouvre un compte rendu prérempli (date, contact, durée) et propose une tâche de suivi.
- Option V2 : branchement à une téléphonie en ligne (Ringover, Aircall…) pour journaliser les appels automatiquement. **[À valider]**

**Agenda** : les rendez-vous peuvent être envoyés vers Google Agenda ou Outlook. Option V2 : synchronisation dans les deux sens.

### 4.4 Commandes, factures et impayés (lecture seule, depuis Divalto)

Le CRM **affiche** ces données mais ne les modifie jamais.

**Commandes**

- Liste par client et vue globale : numéro de pièce, date, produit, quantité commandée, quantité livrée, **reste à livrer** (en tonnes), date demandée par le client, date planifiée.
- Le reste à livrer se lit **au niveau de la ligne** : `Etat = Actif` = reste dû, `Etat = Périmé` = livré.
- **Reliquats** : signalés à part, jamais comptés dans le reste à livrer (voir 6.3).
- **Commandes saisies en série** (même client, même article, même quantité, créées le même jour) : pastille « série de N », avec un filtre pour les exclure.
- **Mise en pause** : une ligne peut être mise en pause (commande prévisionnelle sans bon de commande client). Elle sort alors du tonnage en commande jusqu'à ce qu'on la **relance**. Le CRM remplace le registre `commandes_en_pause.json` et en reprend le contenu à l'installation. Vocabulaire : « en pause » / « relancer ».

**Factures et avoirs**

- Liste par client : pièce, date, montant hors taxes (en euros), tonnage, famille de produit, état de règlement.
- Le signe vient de la colonne `Op` (voir 6.2).
- Deux vues des avoirs : la vue comptable (mois de l'avoir) et la vue commerciale (mois de la facture corrigée).

**Impayés**

- Encours par client, réparti en non échu et échu depuis 0–30, 31–60, 61–90 et plus de 90 jours (en euros).
- Plan de relance : niveau de relance, date, prochaine action, commentaire. Il remplace le classeur `Impayes_clients_*.xlsx`.
- Bandeau permanent : « État de règlement au jour de l'extraction Divalto. À faire valider par la comptabilité avant toute relance. »
- Signalements : facture sans échéance, client avec un solde négatif, acompte (`CZA`) confondu avec une vente.

**Devis** **[À valider, voir question 2]** : en V1, l'offre est portée par l'affaire (lignes produits + prix). Le document PDF de l'offre est fait dans Divalto ou dans Word, puis joint à l'affaire. En V2, le CRM pourrait générer le PDF à partir d'une grille tarifaire.

### 4.5 Import des extractions Divalto

**Fichiers acceptés**

| Fichier | Contenu | Fréquence conseillée |
|---|---|---|
| `client divalto.xlsx` | référentiel clients `CC` | mensuelle |
| `commande update ….xlsx` | commandes, onglet **Export tableur** (brut) | hebdomadaire |
| `facture update ….xlsx` | factures et avoirs, onglet **Export tableur** | hebdomadaire |
| `univers_clients.csv` | client → univers commercial | à chaque mise à jour |

**Déroulé**

1. L'utilisateur dépose le fichier sur une page « Import Divalto ».
2. Le CRM contrôle le fichier : colonnes attendues, niveaux hiérarchiques (en-tête / `--` article / `----` engagement), dates.
3. **Rapport avant validation**, affiché à l'écran :
   - nombre de pièces et de lignes lues, nouvelles et modifiées ;
   - **désignations non reconnues** : bloquant tant qu'elles ne sont pas classées, sinon leur tonnage et leur CA disparaîtraient en silence ;
   - clients inconnus (fiches à créer) ;
   - pauses orphelines (ligne en pause qui n'existe plus dans Divalto : livrée ou supprimée) ;
   - écart de CA et de tonnage par rapport à l'import précédent.
4. L'utilisateur valide. L'import est historisé (date, auteur, fichier d'origine conservé) et on peut l'annuler.

**Principe de stockage** : les données Divalto sont **remplacées** à chaque import, comme une photo de l'ERP. Les données propres au CRM (notes, tâches, pauses, rattachements à une affaire) sont reliées par des **clés stables** qui survivent à un nouvel export :

- société : code tiers ;
- pièce : numéro de pièce ;
- ligne de commande : `<Pièce no>|<Désignation>|<date de livraison>`, avec `#2`, `#3`… pour les doublons. C'est la même clé que le registre des pauses actuel. Elle ne contient ni la quantité, qui change à chaque livraison partielle, ni la position de la ligne.

**Évolution** : si l'intégrateur Divalto fournit un **export automatique quotidien** ou un **accès SQL en lecture seule**, l'import devient automatique sans changer le reste du CRM. C'est à demander (voir question 6).

### 4.6 Tableau de bord

| Bloc | Contenu | Unité |
|---|---|---|
| Ma journée | tâches en retard, tâches du jour, rendez-vous | nombre |
| Pipeline | affaires ouvertes par étape, montant pondéré | euros |
| Chiffre d'affaires | exercice en cours comparé à l'exercice précédent, à date, par famille et par segment | euros, tonnes |
| Carnet | reste à livrer par famille, hors reliquats et hors pauses | tonnes |
| Relances | impayés échus, offres sans réponse, clients dormants | euros, nombre |

Règles d'affichage reprises du skill ADV : l'unité est écrite dans chaque en-tête de colonne et sur chaque axe ; un graphique par famille de produit (on ne mélange jamais fibre, chènevotte et chènevis) ; chaque chiffre a un bloc « D'où vient ce chiffre ? » qui donne la source, la formule et un exemple.

### 4.7 Recherche et exports

- Recherche globale : société, contact, numéro de pièce, téléphone, mail.
- Export Excel de toute liste filtrée.
- Journal des modifications : qui a changé quoi, et quand.

## 5. Modèle de données

```
societe ─┬─< contact
         ├─< client_final        (clients finaux BAFA Neu)
         ├─< affaire ─┬─< affaire_ligne
         │            └─< affaire_commande >── commande   (rattachement manuel)
         ├─< activite >── contact, affaire
         ├─< tache    >── affaire, commande_ligne, facture
         ├─< commande ──< commande_ligne ──< commande_engagement
         └─< facture  ──< facture_ligne

commande_ligne ──○ pause                (clé stable, survit aux imports)
facture ──○ relance                     (niveau, date, prochaine action)
produit (désignation → famille / sous-famille / sous-sous-famille, unité, poids d'un sac)
import_divalto (date, auteur, fichier, rapport)
utilisateur, journal_modifs
```

**Tables propres au CRM** (saisies par les utilisateurs) : `societe` (champs CRM), `contact`, `client_final`, `affaire`, `affaire_ligne`, `affaire_commande`, `activite`, `tache`, `pause`, `relance`, `utilisateur`, `journal_modifs`.

**Tables issues de Divalto** (remplacées à chaque import) : `commande`, `commande_ligne`, `commande_engagement`, `facture`, `facture_ligne`, plus les champs Divalto de `societe`.

**Table de référence** : `produit`. Elle reprend le mapping désignation → famille des scripts `prepare_facture.py` et `prepare_commande.py`, ainsi que les corrections par client (`FAMILY_CLIENT_FIX`, cas KYNAST).

Champs principaux de `commande_ligne` : clé stable, pièce, tiers, client final, désignation, famille, sous-famille, quantité, unité (`T`, `S`, `U`), quantité en tonnes, prix, montant, `Etat` (lu dans l'onglet Export tableur), présence de reliquat, est un reliquat (calculé), date demandée, date planifiée, numéro de série (calculé), date de saisie.

## 6. Règles de gestion

Ces règles viennent du dossier ADV et du projet Commerce, qui les ont vérifiées sur les extractions réelles. Le CRM les applique **à l'identique**. Chacune aura un test automatique.

### 6.1 Lecture des extractions

1. Les extractions sont **hiérarchiques** : en-tête de pièce (niveau vide), ligne article (`--`), sous-ligne d'engagement (`----`).
2. On **agrège sur les lignes article**, jamais sur les en-têtes. Sinon le montant est compté deux fois.
3. `Nom`, `Tiers`, `Etat`, `Statut de la pièce` et `Référence de la pièce` sont propagés de l'en-tête vers les lignes.
4. **Exception** : pour les commandes, `Etat` et `Présence reliquat` sont relus **sur chaque ligne** de l'onglet « Export tableur ». La propagation depuis l'en-tête les écrase et gonfle le carnet de 71 %.
5. La date de livraison n'est jamais sur la ligne article : `Délai demandé` est sur l'en-tête, `Délai livraison` sur les sous-lignes `----`.

### 6.2 Montants et chiffre d'affaires

6. **Le signe vient de la colonne `Op`**, jamais du préfixe de pièce : `Op = D` → montant et tonnage négatifs ; `Op = CZA` → acompte, hors CA. Des factures `FC` peuvent être des avoirs. Se fier au préfixe fausse le CA de 88 551 €.
7. **CA commercial = 5 familles** : Fibre, Chènevis, Chènevotte, Coproduit, Produit négoce. Service, Semence, Paille et Réclamation sont affichés à part, hors CA.
8. **Exercice de septembre à août** : exercice = année + 1 si le mois est septembre ou après.
9. **Comparaison à date** : on exclut le dernier mois de l'extraction, toujours incomplet.
10. Conversion des sacs en tonnes : SAC18 = 0,018 tonne, SAC20 = 0,020 tonne. **Non confirmé par la production** : la valeur est réglable dans `produit`.

### 6.3 Carnet de commandes

11. Reste à livrer = somme des lignes article `Actif`, en tonnes.
12. **Reliquat** = ligne `Actif` dont le même article, sur la même pièce, a aussi une ligne `Périmé`. Sans seuil de taille. Un reliquat compte comme CA perdu, jamais comme reste à livrer.
13. Une ligne **en pause** sort du reste à livrer et de toute projection jusqu'à ce qu'on la relance.
14. Une **série** (même client, même date de saisie, même désignation, même quantité, au moins deux commandes) est signalée, jamais exclue sans action de l'utilisateur.

### 6.4 Produits

15. Le classement se fait sur la `Désignation` :

| Famille | Sous-familles |
|---|---|
| Fibre | Fibre technique VF · VFL · KF · SKF |
| Chènevotte | Granulat labellisé · Granulat non labellisé · Litière (Nature · Eucalyptus · Citronnelle) · Paillis |
| Chènevis | BIO · FOOD · FEED |
| Coproduit | Poudre de chanvre, déchets et sous-produits |
| Produit négoce | Panneau isolant, protéine de chanvre BIO |
| *Hors CA* | Service (transport, palettes, prestations, acomptes…) · Semence · Paille · Réclamation |

16. Une désignation inconnue **bloque l'import** jusqu'à ce qu'elle soit classée.

### 6.5 Vocabulaire

On écrit en français courant, sans jargon d'ERP : « reliquat » (jamais « miette »), « ce que je peux livrer » (jamais « ATP »), « en pause » / « relancer ».

## 7. Écrans

| # | Écran | Contenu principal |
|---|---|---|
| 1 | Connexion | identifiant et mot de passe |
| 2 | Ma journée | tâches, rendez-vous, alertes de l'import |
| 3 | Sociétés | liste filtrable par segment, univers, statut, commercial |
| 4 | Fiche société | onglets : synthèse · contacts · affaires · activités · commandes · factures · impayés · tâches |
| 5 | Fiche contact | coordonnées, historique des échanges |
| 6 | Pipeline | colonnes par étape, glisser-déposer |
| 7 | Fiche affaire | lignes produits, activités, échéancier, commandes rattachées |
| 8 | Tâches | mes tâches, tâches de l'équipe, en retard |
| 9 | Commandes | carnet global, reliquats, séries, pauses |
| 10 | Impayés | balance par ancienneté, plan de relance |
| 11 | Tableau de bord | indicateurs de la section 4.6 |
| 12 | Import Divalto | dépôt du fichier, rapport, historique des imports |
| 13 | Paramètres | utilisateurs, étapes, segments, produits, modèles de mail |

L'interface doit être utilisable sur un ordinateur et sur un téléphone, pour noter un appel ou une visite chez un client.

## 8. Architecture technique

| Élément | Choix proposé | Pourquoi |
|---|---|---|
| Serveur | **Python 3.12 + FastAPI** | déjà utilisé dans le dépôt ; les règles de lecture Divalto sont déjà écrites en Python (`prepare_*.py`) |
| Base de données | **PostgreSQL** en production, SQLite en développement | volume très faible (quelques milliers de lignes par an) ; PostgreSQL pour les sauvegardes et les accès simultanés |
| Accès aux données | SQLAlchemy 2 + Alembic (migrations) | standard, évolutif |
| Lecture Excel | pandas + openpyxl | même outillage que les scripts Commerce |
| Interface | pages générées par le serveur (Jinja2) + **HTMX**, sans application JavaScript séparée | un seul langage à maintenir, adapté à 5 utilisateurs ; Alpine.js pour les petites interactions, Chart.js pour les graphiques |
| Authentification | comptes locaux, mots de passe hachés (argon2), sessions ; en option, connexion avec Google | simple, sans dépendance |
| Tâches planifiées | APScheduler (rappels du matin, relève des mails) | pas d'infrastructure en plus |
| Hébergement | serveur en France (OVH, Scaleway) ou serveur interne, en Docker **[À valider]** | RGPD, accès hors du bureau |
| Sauvegardes | sauvegarde quotidienne de la base, conservée 30 jours, test de restauration mensuel | |
| Tests | pytest, avec des tests sur des extractions anonymisées pour chaque règle de la section 6 | les règles Divalto ont déjà provoqué des erreurs de 71 % et de 88 k€ |

**Emplacement du code** **[À valider]** : ce dépôt contient aujourd'hui un autre projet (scan de cartes TCG, dossier `backend/`). Je propose de placer le CRM dans un dossier `crm/` séparé, ou dans un dépôt dédié.

## 9. Exigences non fonctionnelles

- **Sécurité** : HTTPS obligatoire, droits par rôle, journal des modifications, aucun mot de passe ni clé dans le code.
- **RGPD** : registre des contacts, consentement aux mails, export et suppression des données d'un contact sur demande, hébergement dans l'UE.
- **Performance** : toute page s'affiche en moins d'une seconde ; un import Divalto prend moins de 30 secondes.
- **Fiabilité** : un import raté ne laisse aucune donnée à moitié chargée (transaction complète ou rien).
- **Traçabilité** : chaque chiffre du tableau de bord peut être expliqué (source, formule, exemple chiffré).

## 10. Feuille de route

| Lot | Contenu | Résultat attendu |
|---|---|---|
| **0. Cadrage** | validation de ce document, réponses aux questions de la section 12, extractions anonymisées pour les tests | cahier des charges v1.0 validé |
| **1. Socle** | projet FastAPI, base, connexion, rôles, sociétés, contacts, import du référentiel clients | les fiches clients existent |
| **2. Activités et tâches** | journal des appels, mails et visites, tâches, « Ma journée », numéros cliquables, copie cachée pour les mails | usage quotidien possible |
| **3. Import Divalto** | commandes et factures, toutes les règles de la section 6, rapport d'import, reprise du registre des pauses | données Divalto fiables dans le CRM |
| **4. Pipeline** | affaires, étapes, lignes produits, rattachement aux commandes, prévision | suivi commercial complet |
| **5. Impayés et tableau de bord** | balance par ancienneté, plan de relance, indicateurs | remplace les classeurs Excel de relance |
| **6. V2** | connexion à la messagerie, synchro de l'agenda, téléphonie, PDF d'offre, import automatique Divalto | selon les retours d'usage |

Chaque lot se termine par une démonstration et votre validation avant de passer au suivant.

## 11. Hors périmètre de la V1

- Saisie de commandes ou de factures (reste dans Divalto).
- Gestion des stocks et projection de disponibilité (reste dans le cockpit produit ADV, qui pourra lire la base du CRM plus tard).
- Campagnes marketing et newsletters (outil dédié, à relier plus tard).
- Application mobile native (le site web adapté au téléphone suffit).

## 12. Questions ouvertes

1. **Utilisateurs** : qui sont les utilisateurs, avec quel rôle ? Faut-il cloisonner les portefeuilles entre commerciaux ?
2. **Devis** : les offres de prix sont-elles faites dans Divalto, dans Word / Excel, ou faut-il que le CRM génère le PDF ? Existe-t-il une grille tarifaire par client et par produit ?
3. **Messagerie** : quelle messagerie utilisez-vous (Google Workspace, Microsoft 365, autre) ? Copie cachée en V1, est-ce suffisant ?
4. **Téléphonie** : téléphones portables seulement, standard téléphonique, ou outil en ligne (Ringover, Aircall…) ?
5. **Étapes du pipeline** : les 7 étapes de la section 4.2 correspondent-elles à votre façon de vendre ? Y a-t-il des étapes propres à certains segments (par exemple un essai sur chantier en BTP) ?
6. **Divalto** : peut-on demander à l'intégrateur le coût d'un export automatique quotidien ou d'un accès SQL en lecture seule ? Et l'export du champ « pièce d'origine », qui relierait commandes et factures ?
7. **Scripts Commerce** : peut-on verser `prepare_facture.py`, `prepare_commande.py` et `univers_clients.csv` dans le dépôt, pour que le CRM reprenne exactement les mêmes règles ?
8. **Hébergement** : serveur interne ou hébergeur en France ? Qui s'occupe de la maintenance ?
9. **Prospects** : avez-vous aujourd'hui une liste de prospects (fichier de salon, Excel) à importer au départ ?
10. **Tâches automatiques** : la liste de la section 4.3 vous convient-elle ? Quel délai pour un « client dormant » (6, 9 ou 12 mois) ?
11. **Emplacement du code** : dossier `crm/` dans ce dépôt, ou dépôt séparé ?

## 13. Skills Claude utiles au projet

### 13.1 Déjà disponibles

| Skill | Rôle dans le projet | Phase |
|---|---|---|
| `ai-adv` | **Indispensable.** Il contient toutes les règles de lecture Divalto, la nomenclature produit, les clients BAFA, les reliquats, les séries et les pauses. C'est la source de la section 6. | cadrage, import, tests |
| `xlsx` | lire et contrôler les extractions Divalto, produire les exports Excel | import, exports |
| `dataviz` | concevoir les graphiques du tableau de bord (palette, unités, mode sombre) | tableau de bord |
| `artifact-design` | réaliser une maquette cliquable des écrans avant de coder | cadrage |
| `docx` / `pdf` | version Word du cahier des charges ; PDF des offres en V2 | cadrage, V2 |
| `google-workspace` | lire le Google Sheet « Stock produits » ; brancher Gmail et Agenda | V2 |
| `marketing-team` | segments, modèles de mail, futur lien avec les newsletters | modèles de mail |
| `skill-creator` | créer un skill « crm-planete-chanvre » qui décrit le CRM pour les futures sessions | après le lot 1 |
| `code-review`, `security-review`, `simplify` | relecture du code, sécurité (connexion, droits, RGPD) | tous les lots |
| `run` | lancer l'application et vérifier chaque écran | tous les lots |
| `session-start-hook` | préparer l'environnement pour que les tests tournent dans chaque session | lot 1 |
| `sales:*` (log-activity, call-summary, daily-briefing, inbox-sweep, draft-outreach, pipeline-review, account-tiering, crm-hygiene-check) | méthodes de travail commercial ; utiles dès maintenant sur des fichiers, et branchables sur le CRM une fois qu'il aura une API | lots 2, 4 et 5 |

Les connecteurs Gmail et Google Agenda sont connectés à cette session. Ils serviront pour le lot 6.

### 13.2 À créer

| Skill | Pourquoi |
|---|---|
| **`crm-planete-chanvre`** | décrire le modèle de données, l'API et les conventions du CRM, pour que Claude puisse alimenter le CRM (noter un appel, créer une tâche, résumer un client) |
| **Connecteur MCP du CRM** (V2) | permettre aux skills `sales:*` et `ai-adv` de lire et d'écrire dans le CRM sans passer par des fichiers |

Les plugins CRM du catalogue (HubSpot Sales, monday CRM…) ne servent que si vous choisissez un CRM du marché à la place du développement sur mesure. Ils ne sont pas nécessaires pour ce projet.
