// Stylized body pictogram (front + back) with selectable muscle highlights.
// Single function: bodyPictogramSVG({ highlight, intensity }) -> svg string
//
//   highlight: muscle id to highlight in red (exercise card mode)
//   intensity: { muscleId: 1..4 } to color by training load (weekly map)

window.MUSCLE_PICTOGRAM_GROUPS = [
  'pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'avant_bras',
  'quadriceps', 'ischios', 'fessiers', 'mollets', 'adducteurs', 'abdos',
  'cardio', 'sport_global',
];

// Sports / global activities don't map to a single muscle. For the weekly
// body map, distribute their volume across the muscles they typically work.
window.SPORT_GLOBAL_DISTRIBUTION = {
  // 1.0 = full credit, applied to each listed muscle
  // Default: applied to all sport_global exercises that don't match below
  __default__: ['epaules', 'dos', 'quadriceps', 'ischios', 'fessiers', 'abdos'],
  natation: ['dos', 'epaules', 'triceps', 'biceps', 'abdos', 'fessiers'],
  velo: ['quadriceps', 'ischios', 'fessiers', 'mollets', 'abdos'],
  badminton: ['quadriceps', 'mollets', 'epaules', 'avant_bras', 'abdos'],
  course: ['quadriceps', 'ischios', 'mollets', 'fessiers', 'abdos'],
  marche: ['quadriceps', 'mollets', 'fessiers'],
  randonnee: ['quadriceps', 'ischios', 'fessiers', 'mollets'],
  aquagym: ['epaules', 'dos', 'quadriceps', 'abdos'],
  aquabike: ['quadriceps', 'ischios', 'fessiers', 'mollets'],
};

window.muscleListForSport = function(exerciseName) {
  const n = (exerciseName || '').toLowerCase();
  if (n.includes('natation') || n.includes('aquagym') === false && (n.includes('crawl') || n.includes('brasse') || n.includes('dos crawlé') || n.includes('papillon'))) {
    return window.SPORT_GLOBAL_DISTRIBUTION.natation;
  }
  if (n.includes('aquagym')) return window.SPORT_GLOBAL_DISTRIBUTION.aquagym;
  if (n.includes('aquabike')) return window.SPORT_GLOBAL_DISTRIBUTION.aquabike;
  if (n.includes('vélo') || n.includes('velo')) return window.SPORT_GLOBAL_DISTRIBUTION.velo;
  if (n.includes('badminton')) return window.SPORT_GLOBAL_DISTRIBUTION.badminton;
  if (n.includes('course')) return window.SPORT_GLOBAL_DISTRIBUTION.course;
  if (n.includes('marche')) return window.SPORT_GLOBAL_DISTRIBUTION.marche;
  if (n.includes('randonnée') || n.includes('randonnee')) return window.SPORT_GLOBAL_DISTRIBUTION.randonnee;
  return window.SPORT_GLOBAL_DISTRIBUTION.__default__;
};

// Returns SVG markup as a string. Options:
//   highlight: muscleId | null   (single-muscle highlight, exercise card)
//   intensity: { muscleId: 1..4 } | null   (heatmap mode for body map)
window.bodyPictogramSVG = function({ highlight, intensity } = {}) {
  const cls = (muscle) => {
    if (highlight && muscle === highlight) return 'muscle active';
    if (intensity && intensity[muscle]) return `muscle level-${Math.min(4, Math.max(1, intensity[muscle]))}`;
    return 'muscle';
  };

  // Highlight ALL muscle groups when "sport_global" or "cardio" is the
  // highlighted single value, so the user grasps that "everything is hit".
  let extra = '';
  if (highlight === 'sport_global') {
    extra = '<g class="muscle active" style="opacity:0.5"><rect x="32" y="32" width="36" height="85" rx="10"/></g>';
  }
  if (highlight === 'cardio') {
    // Heart on top of front torso
    extra = '<g class="muscle active heart"><path d="M 50 50 C 45 42, 35 42, 35 52 C 35 62, 50 70, 50 70 C 50 70, 65 62, 65 52 C 65 42, 55 42, 50 50 Z"/></g>';
  }

  return `
<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" class="body-pict" aria-hidden="true">
  <defs>
    <style>
      .body-outline { fill: #1c2128; stroke: #6e7681; stroke-width: 1; stroke-linejoin: round; }
      .body-pict .muscle { fill: transparent; transition: fill 0.2s; }
      .body-pict .muscle.active { fill: #f85149; }
      .body-pict .muscle.level-1 { fill: #facc15; opacity: 0.55; }
      .body-pict .muscle.level-2 { fill: #fb923c; opacity: 0.75; }
      .body-pict .muscle.level-3 { fill: #ef4444; opacity: 0.9; }
      .body-pict .muscle.level-4 { fill: #b91c1c; }
      .body-pict .label { fill: #8b949e; font-size: 9px; font-family: sans-serif; }
    </style>
  </defs>

  <!-- ============ FRONT VIEW ============ -->
  <g class="figure-front">
    <!-- Silhouette -->
    <circle cx="50" cy="22" r="9" class="body-outline"/>
    <rect x="32" y="32" width="36" height="85" rx="10" class="body-outline"/>
    <rect x="18" y="38" width="11" height="68" rx="5" class="body-outline"/>
    <rect x="71" y="38" width="11" height="68" rx="5" class="body-outline"/>
    <rect x="32" y="117" width="16" height="85" rx="4" class="body-outline"/>
    <rect x="52" y="117" width="16" height="85" rx="4" class="body-outline"/>

    <!-- Front muscle overlays -->
    <g class="${cls('pectoraux')}" data-m="pectoraux">
      <ellipse cx="42" cy="46" rx="8" ry="6"/>
      <ellipse cx="58" cy="46" rx="8" ry="6"/>
    </g>
    <g class="${cls('epaules')}" data-m="epaules">
      <ellipse cx="33" cy="42" rx="6" ry="5"/>
      <ellipse cx="67" cy="42" rx="6" ry="5"/>
    </g>
    <g class="${cls('biceps')}" data-m="biceps">
      <ellipse cx="23" cy="58" rx="5" ry="11"/>
      <ellipse cx="77" cy="58" rx="5" ry="11"/>
    </g>
    <g class="${cls('avant_bras')}" data-m="avant_bras">
      <ellipse cx="23" cy="88" rx="4" ry="12"/>
      <ellipse cx="77" cy="88" rx="4" ry="12"/>
    </g>
    <g class="${cls('abdos')}" data-m="abdos">
      <rect x="40" y="62" width="20" height="48" rx="2"/>
    </g>
    <g class="${cls('quadriceps')}" data-m="quadriceps">
      <ellipse cx="40" cy="138" rx="7" ry="16"/>
      <ellipse cx="60" cy="138" rx="7" ry="16"/>
    </g>
    <g class="${cls('adducteurs')}" data-m="adducteurs">
      <rect x="46" y="125" width="3" height="35" rx="1"/>
      <rect x="51" y="125" width="3" height="35" rx="1"/>
    </g>
    ${highlight === 'cardio' ? extra : ''}
    ${highlight === 'sport_global' ? extra : ''}
    <text x="50" y="215" text-anchor="middle" class="label">Face</text>
  </g>

  <!-- ============ BACK VIEW ============ -->
  <g class="figure-back" transform="translate(100,0)">
    <circle cx="50" cy="22" r="9" class="body-outline"/>
    <rect x="32" y="32" width="36" height="85" rx="10" class="body-outline"/>
    <rect x="18" y="38" width="11" height="68" rx="5" class="body-outline"/>
    <rect x="71" y="38" width="11" height="68" rx="5" class="body-outline"/>
    <rect x="32" y="117" width="16" height="85" rx="4" class="body-outline"/>
    <rect x="52" y="117" width="16" height="85" rx="4" class="body-outline"/>

    <!-- Back muscle overlays -->
    <g class="${cls('dos')}" data-m="dos">
      <path d="M 35 38 L 65 38 L 60 95 L 40 95 Z"/>
    </g>
    <g class="${cls('epaules')}" data-m="epaules">
      <ellipse cx="33" cy="42" rx="6" ry="5"/>
      <ellipse cx="67" cy="42" rx="6" ry="5"/>
    </g>
    <g class="${cls('triceps')}" data-m="triceps">
      <ellipse cx="23" cy="58" rx="5" ry="12"/>
      <ellipse cx="77" cy="58" rx="5" ry="12"/>
    </g>
    <g class="${cls('avant_bras')}" data-m="avant_bras">
      <ellipse cx="23" cy="88" rx="4" ry="12"/>
      <ellipse cx="77" cy="88" rx="4" ry="12"/>
    </g>
    <g class="${cls('fessiers')}" data-m="fessiers">
      <ellipse cx="42" cy="123" rx="9" ry="7"/>
      <ellipse cx="58" cy="123" rx="9" ry="7"/>
    </g>
    <g class="${cls('ischios')}" data-m="ischios">
      <ellipse cx="40" cy="145" rx="7" ry="14"/>
      <ellipse cx="60" cy="145" rx="7" ry="14"/>
    </g>
    <g class="${cls('mollets')}" data-m="mollets">
      <ellipse cx="40" cy="180" rx="6" ry="14"/>
      <ellipse cx="60" cy="180" rx="6" ry="14"/>
    </g>
    ${highlight === 'sport_global' ? '<g class="muscle active" style="opacity:0.5"><rect x="32" y="32" width="36" height="85" rx="10"/></g>' : ''}
    <text x="50" y="215" text-anchor="middle" class="label">Dos</text>
  </g>
</svg>`;
};

// Compute per-muscle training intensity from a list of workouts.
// Returns { muscleId: intensityLevel 1..4 }.
window.muscleIntensityFromWorkouts = function(workouts, sinceDate) {
  const sinceStr = sinceDate ? sinceDate.toISOString().slice(0, 10) : null;
  const counts = {}; // muscleId -> "load score" (~series weighted)

  function add(m, weight) {
    if (!m) return;
    counts[m] = (counts[m] || 0) + weight;
  }

  for (const w of workouts || []) {
    if (sinceStr && w.date < sinceStr) continue;
    for (const ex of (w.exercises || [])) {
      const muscle = ex.groupe_musculaire;
      // Approximate volume: series, or 1 if not specified, or 3 for cardio/sport
      let load = 1;
      if (ex.series) load = ex.series;
      else if (ex.type_equipement === 'cardio' || ex.type_equipement === 'sport') {
        load = Math.max(2, Math.round((ex.duree_min || 30) / 15)); // 15min ≈ 1 unit
      }

      if (muscle === 'sport_global' || ex.type_equipement === 'sport') {
        const muscles = window.muscleListForSport(ex.nom);
        for (const m of muscles) add(m, load * 0.6); // each muscle gets partial credit
        add('sport_global', load);
      } else {
        add(muscle, load);
      }
    }
  }

  // Map load to intensity bucket (1..4)
  const intensity = {};
  for (const [m, n] of Object.entries(counts)) {
    if (n >= 20) intensity[m] = 4;
    else if (n >= 10) intensity[m] = 3;
    else if (n >= 5) intensity[m] = 2;
    else if (n >= 1) intensity[m] = 1;
  }
  return { intensity, counts };
};
