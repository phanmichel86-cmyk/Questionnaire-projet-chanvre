# Plan de chargement chanvre

Application d'aide à l'empotage de conteneurs maritimes pour la fibre en balles
et la chènevotte conditionnée. On choisit un conteneur et un ou plusieurs
produits, l'application produit un plan de chargement rang par rang, illustré
et imprimable, destiné aux opérateurs du quai.

## Utilisation

Ouvrir `index.html` dans un navigateur — double-clic sur le fichier suffit.
Aucun serveur, aucune installation, aucune connexion réseau : l'application
fonctionne hors ligne sur un PC, une tablette ou un téléphone en zone de
chargement.

1. **Conteneur** — 20 pieds, 40 pieds ou 40 pieds High Cube.
2. **Produits** — une ou plusieurs lignes, avec une quantité ferme ou
   « remplir au maximum ».
3. **Réglages** — charge utile retenue et jeux de manœuvre.

Le plan se recalcule à chaque modification. Le bouton **Imprimer le plan**
produit une feuille A4 avec les schémas, les étapes à cocher et les cases de
signature ; c'est le document à donner à l'équipe.

## Ce que fait le calcul

- **Orientation** : deux poses au sol sont testées (longueur ou travers),
  celle qui loge le plus d'unités par mètre de conteneur est retenue. Si de la
  longueur reste devant les portes, un dernier rang est tourné pour la récupérer.
- **Empilage** : limité à la fois par la hauteur intérieure et par le gerbage
  admissible du produit.
- **Charge utile** : le chargement s'arrête à la limite retenue ; le dernier
  rang est alors partiellement garni plutôt que supprimé.
- **Répartition** : quand la marchandise est lourde et le conteneur long, le
  plan étale la charge sur tout le plancher et place les rangs les plus hauts
  au centre, au lieu d'empiler au maximum près du fond. Sur un chargement
  mixte, l'ordre des blocs produit est choisi pour centrer le centre de gravité.
- **Contrôles** : règle des 60 % par demi-longueur, décalage du centre de
  gravité, passage de porte, vide devant les portes, masse brute vérifiée (VGM)
  et masse brute maximale ISO de 30 480 kg.

## Ce que le calcul ne fait pas

- Pas de motif mixte au sol (pinwheel) : une seule orientation par rang.
- Pas de calcul de charge à l'essieu du camion, ni de plan de calage détaillé.
- Pas de gestion des lots, numéros de balle ou traçabilité.

## Catalogue

L'onglet **Catalogue** contient les dimensions, poids et hauteurs de gerbage.
Les conteneurs reprennent les cotes ISO courantes. **Les produits sont des
valeurs de départ plausibles, pas des relevés d'atelier** : pesez et mesurez une
balle et une palette réelles, puis corrigez le tableau avant tout usage en
production. Une erreur de 20 kg sur une balle représente environ 2 t d'écart sur
un 40 pieds.

Les corrections sont enregistrées dans le navigateur de l'appareil
(`localStorage`). Elles ne sont pas partagées entre postes : sur un parc de
tablettes, il faut les saisir une fois par appareil, ou figer les valeurs
directement dans `index.html` (constantes `PRODUCTS_DEF` et `CONTAINERS_DEF`).

## Structure

Tout tient dans `index.html` : styles, schémas SVG et calcul. Le code est
découpé en sections numérotées (référentiel, calage des unités, plan de
chargement, marche à suivre, schémas, rendu, événements).
