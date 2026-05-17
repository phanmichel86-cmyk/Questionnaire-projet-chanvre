// Catalogue d'exercices — chargé dans la page comme script global

window.GROUPES_MUSCULAIRES = [
  { id: 'pectoraux', label: 'Pectoraux' },
  { id: 'dos', label: 'Dos' },
  { id: 'epaules', label: 'Épaules' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'avant_bras', label: 'Avant-bras' },
  { id: 'quadriceps', label: 'Quadriceps' },
  { id: 'ischios', label: 'Ischio-jambiers' },
  { id: 'fessiers', label: 'Fessiers' },
  { id: 'mollets', label: 'Mollets' },
  { id: 'adducteurs', label: 'Adducteurs / Abducteurs' },
  { id: 'abdos', label: 'Abdos / Core' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'sport_global', label: '🏆 Sport — corps entier' },
];

window.TYPES_EQUIPEMENT = [
  { id: 'machine_assistee', label: 'Machine guidée' },
  { id: 'poulie', label: 'Poulie / câble' },
  { id: 'poids_libre', label: 'Poids libres (haltères, barre)' },
  { id: 'poids_corps', label: 'Poids du corps' },
  { id: 'cardio', label: 'Machine cardio' },
  { id: 'sport', label: 'Sport / Activité (extérieur, piscine…)' },
];

window.EXERCICES = [
  // === PECTORAUX ===
  { groupes: ['pectoraux'], equipement: 'machine_assistee', nom: 'Chest press machine' },
  { groupes: ['pectoraux'], equipement: 'machine_assistee', nom: 'Pec deck (butterfly)' },
  { groupes: ['pectoraux'], equipement: 'machine_assistee', nom: 'Développé incliné machine' },
  { groupes: ['pectoraux'], equipement: 'poulie', nom: 'Vis-à-vis poulies (crossover)' },
  { groupes: ['pectoraux'], equipement: 'poulie', nom: 'Écarté poulies basses' },
  { groupes: ['pectoraux'], equipement: 'poulie', nom: 'Écarté poulies hautes' },
  { groupes: ['pectoraux'], equipement: 'poids_libre', nom: 'Développé couché barre' },
  { groupes: ['pectoraux'], equipement: 'poids_libre', nom: 'Développé couché haltères' },
  { groupes: ['pectoraux'], equipement: 'poids_libre', nom: 'Développé incliné barre' },
  { groupes: ['pectoraux'], equipement: 'poids_libre', nom: 'Développé incliné haltères' },
  { groupes: ['pectoraux'], equipement: 'poids_libre', nom: 'Développé décliné' },
  { groupes: ['pectoraux'], equipement: 'poids_libre', nom: 'Écarté haltères' },
  { groupes: ['pectoraux'], equipement: 'poids_corps', nom: 'Pompes' },
  { groupes: ['pectoraux'], equipement: 'poids_corps', nom: 'Pompes inclinées' },
  { groupes: ['pectoraux'], equipement: 'poids_corps', nom: 'Pompes déclinées' },
  { groupes: ['pectoraux', 'triceps'], equipement: 'poids_corps', nom: 'Dips poitrine' },

  // === DOS ===
  { groupes: ['dos'], equipement: 'machine_assistee', nom: 'Tirage vertical machine (lat pulldown)' },
  { groupes: ['dos'], equipement: 'machine_assistee', nom: 'Tirage horizontal machine (seated row)' },
  { groupes: ['dos'], equipement: 'machine_assistee', nom: 'Tirage vertical prise neutre' },
  { groupes: ['dos'], equipement: 'machine_assistee', nom: 'Pullover machine' },
  { groupes: ['dos'], equipement: 'machine_assistee', nom: 'Tractions assistées (gravitron)' },
  { groupes: ['dos'], equipement: 'poulie', nom: 'Tirage vertical poulie' },
  { groupes: ['dos'], equipement: 'poulie', nom: 'Tirage horizontal poulie' },
  { groupes: ['dos'], equipement: 'poulie', nom: 'Pullover poulie haute' },
  { groupes: ['dos'], equipement: 'poulie', nom: 'Tirage face (face pull)' },
  { groupes: ['dos'], equipement: 'poids_libre', nom: 'Rowing barre' },
  { groupes: ['dos'], equipement: 'poids_libre', nom: 'Rowing haltère unilatéral' },
  { groupes: ['dos'], equipement: 'poids_libre', nom: 'Rowing T-bar' },
  { groupes: ['dos'], equipement: 'poids_libre', nom: 'Soulevé de terre' },
  { groupes: ['dos'], equipement: 'poids_libre', nom: 'Shrugs (trapèzes)' },
  { groupes: ['dos'], equipement: 'poids_corps', nom: 'Tractions (pull-ups)' },
  { groupes: ['dos', 'biceps'], equipement: 'poids_corps', nom: 'Tractions supination (chin-ups)' },
  { groupes: ['dos'], equipement: 'poids_corps', nom: 'Australian pull-ups' },

  // === ÉPAULES ===
  { groupes: ['epaules'], equipement: 'machine_assistee', nom: 'Développé épaules machine' },
  { groupes: ['epaules'], equipement: 'machine_assistee', nom: 'Élévations latérales machine' },
  { groupes: ['epaules'], equipement: 'machine_assistee', nom: 'Reverse pec deck (épaules arrière)' },
  { groupes: ['epaules'], equipement: 'poulie', nom: 'Élévations latérales poulie' },
  { groupes: ['epaules'], equipement: 'poulie', nom: 'Tirage face poulie' },
  { groupes: ['epaules'], equipement: 'poulie', nom: 'Développé épaules poulies' },
  { groupes: ['epaules'], equipement: 'poids_libre', nom: 'Développé militaire barre' },
  { groupes: ['epaules'], equipement: 'poids_libre', nom: 'Développé haltères assis' },
  { groupes: ['epaules'], equipement: 'poids_libre', nom: 'Développé haltères debout' },
  { groupes: ['epaules'], equipement: 'poids_libre', nom: 'Arnold press' },
  { groupes: ['epaules'], equipement: 'poids_libre', nom: 'Élévations latérales haltères' },
  { groupes: ['epaules'], equipement: 'poids_libre', nom: 'Élévations frontales' },
  { groupes: ['epaules'], equipement: 'poids_libre', nom: 'Rowing menton' },
  { groupes: ['epaules'], equipement: 'poids_libre', nom: 'Oiseau (rear delt)' },
  { groupes: ['epaules'], equipement: 'poids_corps', nom: 'Pike push-ups' },
  { groupes: ['epaules'], equipement: 'poids_corps', nom: 'Handstand push-ups' },

  // === BICEPS ===
  { groupes: ['biceps'], equipement: 'machine_assistee', nom: 'Curl biceps machine' },
  { groupes: ['biceps'], equipement: 'machine_assistee', nom: 'Curl pupitre (preacher)' },
  { groupes: ['biceps'], equipement: 'poulie', nom: 'Curl poulie barre' },
  { groupes: ['biceps'], equipement: 'poulie', nom: 'Curl poulie corde' },
  { groupes: ['biceps'], equipement: 'poulie', nom: 'Curl marteau poulie' },
  { groupes: ['biceps'], equipement: 'poids_libre', nom: 'Curl barre' },
  { groupes: ['biceps'], equipement: 'poids_libre', nom: 'Curl barre EZ' },
  { groupes: ['biceps'], equipement: 'poids_libre', nom: 'Curl haltères' },
  { groupes: ['biceps'], equipement: 'poids_libre', nom: 'Curl marteau' },
  { groupes: ['biceps'], equipement: 'poids_libre', nom: 'Curl incliné' },
  { groupes: ['biceps'], equipement: 'poids_libre', nom: 'Curl concentré' },

  // === TRICEPS ===
  { groupes: ['triceps'], equipement: 'machine_assistee', nom: 'Extension triceps machine' },
  { groupes: ['triceps'], equipement: 'machine_assistee', nom: 'Dips machine' },
  { groupes: ['triceps'], equipement: 'poulie', nom: 'Pushdown poulie corde' },
  { groupes: ['triceps'], equipement: 'poulie', nom: 'Pushdown poulie barre droite' },
  { groupes: ['triceps'], equipement: 'poulie', nom: 'Extension triceps nuque poulie' },
  { groupes: ['triceps'], equipement: 'poids_libre', nom: 'Développé couché serré' },
  { groupes: ['triceps'], equipement: 'poids_libre', nom: 'Skull crusher (barre EZ)' },
  { groupes: ['triceps'], equipement: 'poids_libre', nom: 'Extension nuque haltère' },
  { groupes: ['triceps'], equipement: 'poids_libre', nom: 'Kickback haltère' },
  { groupes: ['triceps'], equipement: 'poids_corps', nom: 'Dips' },
  { groupes: ['triceps'], equipement: 'poids_corps', nom: 'Pompes diamant' },

  // === AVANT-BRAS ===
  { groupes: ['avant_bras'], equipement: 'poids_libre', nom: 'Curl poignets barre' },
  { groupes: ['avant_bras'], equipement: 'poids_libre', nom: 'Curl poignets inversé' },
  { groupes: ['avant_bras'], equipement: 'poids_libre', nom: 'Farmer walk (port de fermier)' },

  // === QUADRICEPS ===
  { groupes: ['quadriceps'], equipement: 'machine_assistee', nom: 'Leg press (presse à cuisses)' },
  { groupes: ['quadriceps'], equipement: 'machine_assistee', nom: 'Leg extension' },
  { groupes: ['quadriceps'], equipement: 'machine_assistee', nom: 'Hack squat machine' },
  { groupes: ['quadriceps'], equipement: 'machine_assistee', nom: 'Smith machine squat' },
  { groupes: ['quadriceps'], equipement: 'poids_libre', nom: 'Squat barre' },
  { groupes: ['quadriceps'], equipement: 'poids_libre', nom: 'Front squat' },
  { groupes: ['quadriceps'], equipement: 'poids_libre', nom: 'Goblet squat' },
  { groupes: ['quadriceps', 'fessiers'], equipement: 'poids_libre', nom: 'Fentes barre/haltères' },
  { groupes: ['quadriceps', 'fessiers'], equipement: 'poids_libre', nom: 'Bulgarian split squat' },
  { groupes: ['quadriceps'], equipement: 'poids_corps', nom: 'Squat poids du corps' },
  { groupes: ['quadriceps', 'fessiers'], equipement: 'poids_corps', nom: 'Fentes poids du corps' },
  { groupes: ['quadriceps'], equipement: 'poids_corps', nom: 'Pistol squat' },
  { groupes: ['quadriceps'], equipement: 'poids_corps', nom: 'Wall sit (chaise)' },

  // === ISCHIOS ===
  { groupes: ['ischios'], equipement: 'machine_assistee', nom: 'Leg curl allongé' },
  { groupes: ['ischios'], equipement: 'machine_assistee', nom: 'Leg curl assis' },
  { groupes: ['ischios', 'fessiers'], equipement: 'machine_assistee', nom: 'Hyperextension (lombaires)' },
  { groupes: ['ischios'], equipement: 'poulie', nom: 'Cable pull through' },
  { groupes: ['ischios'], equipement: 'poids_libre', nom: 'Soulevé de terre jambes tendues' },
  { groupes: ['ischios'], equipement: 'poids_libre', nom: 'Romanian deadlift (RDL)' },
  { groupes: ['ischios'], equipement: 'poids_libre', nom: 'Good morning' },
  { groupes: ['ischios'], equipement: 'poids_corps', nom: 'Nordic hamstring curl' },
  { groupes: ['ischios'], equipement: 'poids_corps', nom: 'Glute ham raise' },

  // === FESSIERS ===
  { groupes: ['fessiers'], equipement: 'machine_assistee', nom: 'Hip thrust machine' },
  { groupes: ['fessiers'], equipement: 'machine_assistee', nom: 'Glute kickback machine' },
  { groupes: ['fessiers'], equipement: 'poulie', nom: 'Kickback poulie' },
  { groupes: ['fessiers'], equipement: 'poulie', nom: 'Cable pull through' },
  { groupes: ['fessiers'], equipement: 'poids_libre', nom: 'Hip thrust barre' },
  { groupes: ['fessiers'], equipement: 'poids_libre', nom: 'Soulevé de terre sumo' },
  { groupes: ['fessiers'], equipement: 'poids_corps', nom: 'Hip thrust poids du corps' },
  { groupes: ['fessiers'], equipement: 'poids_corps', nom: 'Pont fessier (glute bridge)' },

  // === MOLLETS ===
  { groupes: ['mollets'], equipement: 'machine_assistee', nom: 'Mollets debout machine' },
  { groupes: ['mollets'], equipement: 'machine_assistee', nom: 'Mollets assis machine' },
  { groupes: ['mollets'], equipement: 'machine_assistee', nom: 'Mollets à la leg press' },
  { groupes: ['mollets'], equipement: 'poids_libre', nom: 'Mollets debout barre' },
  { groupes: ['mollets'], equipement: 'poids_libre', nom: 'Mollets assis haltères' },
  { groupes: ['mollets'], equipement: 'poids_corps', nom: 'Mollets debout' },
  { groupes: ['mollets'], equipement: 'poids_corps', nom: 'Corde à sauter' },

  // === ADDUCTEURS / ABDUCTEURS ===
  { groupes: ['adducteurs'], equipement: 'machine_assistee', nom: 'Adducteurs machine' },
  { groupes: ['adducteurs'], equipement: 'machine_assistee', nom: 'Abducteurs machine' },
  { groupes: ['adducteurs'], equipement: 'poulie', nom: 'Adducteur poulie' },

  // === ABDOS / CORE ===
  { groupes: ['abdos'], equipement: 'machine_assistee', nom: 'Abdo crunch machine' },
  { groupes: ['abdos'], equipement: 'machine_assistee', nom: 'Rotary torso (obliques)' },
  { groupes: ['abdos'], equipement: 'poulie', nom: 'Crunch poulie (cable crunch)' },
  { groupes: ['abdos'], equipement: 'poulie', nom: 'Woodchop poulie' },
  { groupes: ['abdos'], equipement: 'poids_libre', nom: 'Crunch lesté' },
  { groupes: ['abdos'], equipement: 'poids_libre', nom: 'Russian twist lesté' },
  { groupes: ['abdos'], equipement: 'poids_corps', nom: 'Crunch' },
  { groupes: ['abdos'], equipement: 'poids_corps', nom: 'Planche (plank)' },
  { groupes: ['abdos'], equipement: 'poids_corps', nom: 'Planche latérale' },
  { groupes: ['abdos'], equipement: 'poids_corps', nom: 'Mountain climbers' },
  { groupes: ['abdos'], equipement: 'poids_corps', nom: 'Relevé de jambes (leg raises)' },
  { groupes: ['abdos'], equipement: 'poids_corps', nom: 'Bicycle crunches' },
  { groupes: ['abdos'], equipement: 'poids_corps', nom: 'Hollow body hold' },
  { groupes: ['abdos'], equipement: 'poids_corps', nom: 'Dragon flag' },

  // === CARDIO ===
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Tapis de course (marche)' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Tapis de course (course)' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Tapis de course (HIIT)' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Vélo droit' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Vélo semi-allongé (recumbent)' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Vélo spinning' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Vélo elliptique' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Rameur' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Machine escalier (stair climber)' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Stepmill (escaliers défilants)' },
  { groupes: ['cardio'], equipement: 'cardio', nom: 'Corde à sauter' },
  { groupes: ['cardio'], equipement: 'poids_corps', nom: 'Burpees' },
  { groupes: ['cardio'], equipement: 'poids_corps', nom: 'Jumping jacks' },
  { groupes: ['cardio'], equipement: 'poids_corps', nom: 'High knees' },

  // === SPORTS / ACTIVITÉS EXTÉRIEURES (corps entier) ===
  // Piscine
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Natation — libre' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Natation — crawl' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Natation — brasse' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Natation — dos crawlé' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Natation — papillon' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Aquagym' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Aquabike' },
  // Vélo extérieur
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Vélo — route' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Vélo — VTT' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Vélo — ville / balade' },
  // Sports de raquette
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Badminton' },
  // Course / marche extérieure
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Course à pied (extérieur)' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Marche rapide' },
  { groupes: ['sport_global'], equipement: 'sport', nom: 'Randonnée' },
];

// Index for fast lookups
window.filterExercises = function(groupeId, equipementId) {
  return window.EXERCICES.filter(e =>
    (!groupeId || e.groupes.includes(groupeId)) &&
    (!equipementId || e.equipement === equipementId)
  );
};
