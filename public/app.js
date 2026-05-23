const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// === Theme (light/dark) ===
const THEME_KEY = 'coach-ia-theme';
function applyTheme(t) {
  document.body.classList.toggle('light-theme', t === 'light');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f5f7fa' : '#0f1419');
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
document.addEventListener('click', (e) => {
  if (e.target?.id === 'theme-toggle') {
    const next = (localStorage.getItem(THEME_KEY) === 'light') ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }
});

// === Plate calculator ===
function renderPlateResult() {
  const target = parseFloat(document.getElementById('plate-target')?.value);
  const bar = parseFloat(document.getElementById('plate-bar')?.value) || 20;
  const availStr = document.getElementById('plate-avail')?.value || '';
  const out = document.getElementById('plate-result');
  if (!out) return;
  if (!target || target < bar) { out.innerHTML = '<em class="empty">Saisir un poids ≥ poids de la barre.</em>'; return; }
  const avail = availStr.split(/[,;\s]+/).map(s => parseFloat(s)).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => b - a);
  const perSide = (target - bar) / 2;
  if (perSide < 0) { out.innerHTML = '<em class="empty">Le poids cible est inférieur à la barre.</em>'; return; }
  // Greedy: use largest plate that fits, repeat. Allow duplicates.
  let remaining = perSide;
  const plates = [];
  for (const p of avail) {
    while (remaining >= p - 1e-6) { plates.push(p); remaining -= p; }
  }
  const fit = Math.abs(remaining) < 1e-6;
  const summary = plates.length
    ? plates.map(p => `<span class="plate">${p}</span>`).join('')
    : '<em>Aucune plaque (barre seule)</em>';
  out.innerHTML = `
    <div><strong>De chaque côté :</strong> ${summary}</div>
    <p class="hint">${fit
      ? `Total : ${bar} kg (barre) + 2 × ${plates.reduce((a, b) => a + b, 0)} kg = <strong>${target} kg</strong> ✓`
      : `⚠️ Pas exact avec ces plaques. Plus proche atteignable : <strong>${bar + 2 * plates.reduce((a, b) => a + b, 0)} kg</strong> (manque ${(remaining * 2).toFixed(2)} kg)`}</p>
  `;
}
document.addEventListener('input', (e) => {
  if (['plate-target', 'plate-bar', 'plate-avail'].includes(e.target?.id)) renderPlateResult();
});

const loader = $('#loader');
const loaderText = $('#loader-text');
function showLoader(text = 'Le coach réfléchit…') {
  loaderText.textContent = text;
  loader.classList.remove('hidden');
}
function hideLoader() { loader.classList.add('hidden'); }

const NON_BACKED_UP = ['/api/import', '/api/export', '/api/stats', '/api/health',
  '/api/generate-workout', '/api/generate-nutrition', '/api/coach-chat', '/api/progress-analysis'];

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('auth_required');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const result = await res.json();
  // Auto-backup after any write that mutates user data
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && !NON_BACKED_UP.some(p => path.startsWith(p))) {
    saveLocalSnapshot().catch(() => {});
  }
  return result;
}

function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formDataToObject(form) {
  const data = new FormData(form);
  const obj = {};
  for (const [k, v] of data.entries()) {
    obj[k] = v === '' ? null : v;
  }
  return obj;
}

// --- TABS ---
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.remove('active'));
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'progression') { renderCharts(); renderExerciseRecords(); renderWeeklySummary(); }
    if (btn.dataset.tab === 'plans') loadPlans();
    if (btn.dataset.tab === 'mesures') loadMeasurements();
    if (btn.dataset.tab === 'entrainements') loadWorkouts();
    if (btn.dataset.tab === 'carte') renderBodyMap();
    if (btn.dataset.tab === 'donnees') { updateDataStats(); updateBackupInfo(); }
  });
});

// --- HEALTH CHECK ---
let currentUser = null;

async function checkHealth() {
  try {
    const h = await api('/api/health');
    const banner = $('#health-banner');
    if (!h.provider) {
      banner.textContent = '⚠️ Aucune clé API IA configurée. Ajoutez GROQ_API_KEY (gratuit) ou ANTHROPIC_API_KEY dans les variables d\'environnement pour activer le coach.';
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
    if (h.authenticated && h.username) {
      currentUser = h.username;
      const chip = $('#user-chip');
      const nameEl = $('#user-name');
      if (chip && nameEl) {
        nameEl.textContent = h.username;
        chip.classList.remove('hidden');
      }
    }
    const authStatus = $('#auth-status');
    if (authStatus) {
      authStatus.textContent = h.username
        ? `Connecté en tant que « ${h.username} ». Vos données sont totalement séparées des autres comptes. Le bouton de déconnexion vous fait sortir de la session ; cliquez à nouveau le mot de passe pour revenir.`
        : '—';
    }
  } catch (e) { console.error(e); }
}

// --- PROFILE ---
function refreshComputedAge() {
  const el = document.getElementById('computed-age');
  if (!el) return;
  const year = parseInt(document.querySelector('#profile-form [name=annee_naissance]')?.value, 10);
  if (year && year > 1900 && year <= new Date().getFullYear()) {
    el.textContent = `${new Date().getFullYear() - year} ans`;
  } else {
    el.textContent = '';
  }
}

async function loadProfile() {
  const p = await api('/api/profile');
  if (!p) { renderEnergyProfile(null); return; }
  const form = $('#profile-form');
  for (const [key, val] of Object.entries(p)) {
    const input = form.elements[key];
    if (input && val != null) input.value = val;
  }
  // Backward-compat: if only the legacy "age" is stored, derive an
  // approximate year of birth so the user sees something pre-filled.
  const yearInput = form.elements['annee_naissance'];
  if (yearInput && !yearInput.value && p.age) {
    yearInput.value = new Date().getFullYear() - p.age;
  }
  refreshComputedAge();
  await renderEnergyProfile(p);
  renderAchievements();
}

// === Streak + badges ===
// Compute longest current streak (consecutive days with ≥ 1 workout, going
// backwards from today; "today" is forgiving — counts only if you already
// trained, otherwise we start from yesterday).
function computeStreak(workouts) {
  if (!workouts.length) return { current: 0, longest: 0, totalDays: 0 };
  const dates = new Set(workouts.map(w => w.date));
  // Current streak
  let current = 0;
  const start = new Date();
  // If user didn't train today yet, start counting from yesterday
  if (!dates.has(start.toISOString().slice(0, 10))) start.setDate(start.getDate() - 1);
  for (let d = new Date(start); ; d.setDate(d.getDate() - 1)) {
    if (dates.has(d.toISOString().slice(0, 10))) current++;
    else break;
    if (current > 365) break;
  }
  // Longest streak (scan all sorted dates)
  const sorted = [...dates].sort();
  let longest = 0, run = 0, prev = null;
  for (const ds of sorted) {
    if (prev) {
      const diff = (new Date(ds) - new Date(prev)) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    } else { run = 1; }
    if (run > longest) longest = run;
    prev = ds;
  }
  return { current, longest, totalDays: dates.size };
}

function computeBadges(workouts, records) {
  const out = [];
  const streak = computeStreak(workouts);
  const totalSessions = workouts.length;
  // Find max charge across all exercises in records
  let maxOverallCharge = 0;
  for (const r of (records || [])) {
    if (r.allTimeMaxCharge && r.allTimeMaxCharge > maxOverallCharge) maxOverallCharge = r.allTimeMaxCharge;
  }
  const recentPRs = (records || []).filter(r => r.recentPR).length;

  const tiers = [
    { check: () => streak.current >= 3, label: 'Série de 3 jours', emoji: '🔥' },
    { check: () => streak.current >= 7, label: 'Une semaine ininterrompue', emoji: '🔥🔥' },
    { check: () => streak.longest >= 14, label: 'Série record : 2 semaines', emoji: '⚡' },
    { check: () => streak.longest >= 30, label: 'Série record : 1 mois', emoji: '🚀' },
    { check: () => totalSessions >= 1, label: 'Première séance', emoji: '🎯' },
    { check: () => totalSessions >= 10, label: '10 séances', emoji: '🏃' },
    { check: () => totalSessions >= 50, label: '50 séances', emoji: '🏆' },
    { check: () => totalSessions >= 100, label: '100 séances', emoji: '🏅' },
    { check: () => totalSessions >= 250, label: '250 séances — fanatique', emoji: '💎' },
    { check: () => maxOverallCharge >= 50, label: 'Premier 50 kg soulevé', emoji: '💪' },
    { check: () => maxOverallCharge >= 100, label: 'Premier 100 kg soulevé', emoji: '🦾' },
    { check: () => maxOverallCharge >= 150, label: '150 kg, sérieux', emoji: '🐘' },
    { check: () => maxOverallCharge >= 200, label: '200 kg, monstre', emoji: '🦏' },
    { check: () => recentPRs >= 1, label: `PR récent (${recentPRs}) cette quinzaine`, emoji: '🎉' },
  ];
  for (const t of tiers) {
    try { if (t.check()) out.push({ label: t.label, emoji: t.emoji }); } catch {}
  }
  return { badges: out, streak, totalSessions };
}

async function renderAchievements() {
  const body = document.getElementById('achievements-body');
  if (!body) return;
  let workouts = [];
  try { workouts = await api('/api/workouts'); } catch { return; }
  const records = computeExerciseRecords(workouts);
  const { badges, streak, totalSessions } = computeBadges(workouts, records);
  if (totalSessions === 0) {
    body.innerHTML = '<em class="empty">Enregistre une première séance pour débloquer tes accomplissements.</em>';
    return;
  }
  const streakBlock = `
    <div class="streak-line">
      <span class="streak-flame">${streak.current >= 3 ? '🔥' : '·'}</span>
      <span><strong>${streak.current}</strong> jour${streak.current > 1 ? 's' : ''} de série actuelle</span>
      <span class="dim">· record : <strong>${streak.longest}</strong> j · ${totalSessions} séances au total</span>
    </div>
  `;
  const badgesBlock = badges.length
    ? `<div class="badges-grid">${badges.map(b => `<span class="badge">${b.emoji} ${b.label}</span>`).join('')}</div>`
    : '<p class="hint">Continue, les badges arrivent !</p>';
  body.innerHTML = streakBlock + badgesBlock;
}

async function renderEnergyProfile(profile) {
  const body = document.getElementById('energy-profile-body');
  const hint = document.getElementById('energy-hint');
  if (!body || !window.energyProfile) return;
  // Read live values from the form so the card updates as the user types
  const form = document.getElementById('profile-form');
  const liveProfile = profile ? { ...profile } : {};
  if (form) {
    const fd = new FormData(form);
    liveProfile.annee_naissance = parseInt(fd.get('annee_naissance'), 10) || null;
    liveProfile.taille_cm = parseFloat(fd.get('taille_cm')) || null;
    liveProfile.sexe = fd.get('sexe') || null;
    liveProfile.objectif = fd.get('objectif') || liveProfile.objectif;
    liveProfile.frequence_hebdo = parseInt(fd.get('frequence_hebdo'), 10) || null;
    liveProfile.niveau_activite = fd.get('niveau_activite') || null;
  }

  // Latest weight (from measurements, or fallback to cached bodyweight)
  let lastWeight = null;
  try {
    const ms = await api('/api/measurements');
    const w = ms.slice().reverse().find(m => m.poids_kg != null);
    if (w) lastWeight = w.poids_kg;
  } catch {}

  const r = window.energyProfile.computeEnergyProfile({ profile: liveProfile, lastWeightKg: lastWeight });
  if (!r.ready) {
    body.innerHTML = `<p class="hint">Pour afficher le profil énergétique, renseignez : <strong>${r.missing.join(', ')}</strong>.</p>`;
    return;
  }
  hint.textContent = `Calculé sur Mifflin-St Jeor (référence en nutrition clinique) avec votre dernier poids ${r.weight_kg} kg, taille, âge ${r.age} ans, sexe ${r.sexe === 'femme' ? 'F' : 'H'}, niveau d'activité « ${r.activity_label} », objectif « ${r.goal_label} ».`;
  body.innerHTML = `
    <div class="energy-grid">
      <div class="energy-cell">
        <span class="energy-label">Métabolisme de base</span>
        <span class="energy-value">${r.bmr_kcal} kcal</span>
        <span class="energy-sub">au repos complet</span>
      </div>
      <div class="energy-cell">
        <span class="energy-label">Dépense journalière (DEJ)</span>
        <span class="energy-value">${r.tdee_kcal} kcal</span>
        <span class="energy-sub">× ${r.activity_factor} (${r.activity_label})</span>
      </div>
      <div class="energy-cell highlight">
        <span class="energy-label">Cible quotidienne</span>
        <span class="energy-value">${r.target_kcal} kcal</span>
        <span class="energy-sub">${r.goal_adjust_kcal > 0 ? '+' : ''}${r.goal_adjust_kcal} kcal vs DEJ — ${r.goal_label}</span>
      </div>
      <div class="energy-cell">
        <span class="energy-label">Protéines</span>
        <span class="energy-value">${r.protein_g} g</span>
        <span class="energy-sub">${(r.protein_g/r.weight_kg).toFixed(1)} g/kg de poids</span>
      </div>
      <div class="energy-cell">
        <span class="energy-label">Lipides</span>
        <span class="energy-value">${r.fat_g} g</span>
        <span class="energy-sub">≈ ${Math.round(r.fat_g * 9)} kcal</span>
      </div>
      <div class="energy-cell">
        <span class="energy-label">Glucides</span>
        <span class="energy-value">${r.carbs_g} g</span>
        <span class="energy-sub">≈ ${Math.round(r.carbs_g * 4)} kcal (le reste)</span>
      </div>
      <div class="energy-cell">
        <span class="energy-label">Hydratation</span>
        <span class="energy-value">${(r.water_ml/1000).toFixed(1)} L</span>
        <span class="energy-sub">33 ml/kg, à augmenter les jours d'entraînement</span>
      </div>
    </div>
    <p class="hint" style="margin-top:0.9rem">Valeurs indicatives basées sur les standards de nutrition sportive. Ajustez selon votre ressenti et la balance après 2-3 semaines.</p>
  `;
}

// Re-render energy profile when relevant fields change
document.addEventListener('input', (e) => {
  if (!e.target?.name) return;
  if (['annee_naissance', 'taille_cm', 'sexe', 'objectif', 'frequence_hebdo', 'niveau_activite'].includes(e.target.name)) {
    renderEnergyProfile(null);
  }
});
document.addEventListener('change', (e) => {
  if (e.target?.name === 'niveau_activite' || e.target?.name === 'sexe') renderEnergyProfile(null);
});

document.addEventListener('input', (e) => {
  if (e.target?.name === 'annee_naissance') refreshComputedAge();
});

$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = formDataToObject(e.target);
  data.annee_naissance = num(data.annee_naissance);
  // Derive age from year of birth so legacy code paths still get a value
  data.age = data.annee_naissance ? (new Date().getFullYear() - data.annee_naissance) : null;
  data.taille_cm = num(data.taille_cm);
  data.frequence_hebdo = num(data.frequence_hebdo);
  data.niveau_activite = data.niveau_activite || null;
  try {
    await api('/api/profile', { method: 'POST', body: data });
    const s = $('#profile-status');
    s.textContent = '✓ Profil enregistré';
    setTimeout(() => { s.textContent = ''; }, 2500);
    renderEnergyProfile(null);
  } catch (err) { alert('Erreur : ' + err.message); }
});

// Format a "left / right" cell with a visual delta if both sides are filled.
// Falls back to the legacy single value when no per-side data exists.
function formatPair(g, d, legacy) {
  const hasG = g != null;
  const hasD = d != null;
  if (!hasG && !hasD) return legacy != null ? `${legacy}` : '—';
  if (hasG && hasD) {
    const delta = Math.abs(g - d);
    const tag = delta >= 1 ? ` <span class="asym-warn" title="Déséquilibre ${delta.toFixed(1)} cm">⚠️</span>` : '';
    return `${g} / ${d}${tag}`;
  }
  return hasG ? `${g} / —` : `— / ${d}`;
}

// --- MEASUREMENTS ---
async function loadMeasurements() {
  const list = await api('/api/measurements');
  const tbody = $('#measure-table tbody');
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty">Aucune mesure pour le moment.</td></tr>';
    return;
  }
  for (const m of [...list].reverse()) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.date}</td>
      <td>${m.poids_kg ?? '—'}</td>
      <td>${m.pct_muscle ?? '—'}</td>
      <td>${m.pct_graisse ?? '—'}</td>
      <td>${m.tour_taille_cm ?? '—'}</td>
      <td>${m.tour_hanches_cm ?? '—'}</td>
      <td>${formatPair(m.tour_bras_gauche_cm, m.tour_bras_droit_cm, m.tour_bras_cm)}</td>
      <td>${formatPair(m.tour_cuisse_gauche_cm, m.tour_cuisse_droit_cm, m.tour_cuisse_cm)}</td>
      <td>${formatPair(m.tour_mollet_gauche_cm, m.tour_mollet_droit_cm)}</td>
      <td>${m.notes ?? ''}</td>
      <td><button class="danger" data-del="${m.id}">Suppr.</button></td>
    `;
    tbody.appendChild(tr);
  }
  $$('#measure-table [data-del]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Supprimer cette mesure ?')) return;
      await api(`/api/measurements/${b.dataset.del}`, { method: 'DELETE' });
      loadMeasurements();
    });
  });
}

$('#measure-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = formDataToObject(e.target);
  for (const k of [
    'poids_kg', 'pct_muscle', 'pct_graisse', 'tour_taille_cm', 'tour_hanches_cm',
    'tour_bras_gauche_cm', 'tour_bras_droit_cm',
    'tour_cuisse_gauche_cm', 'tour_cuisse_droit_cm',
    'tour_mollet_gauche_cm', 'tour_mollet_droit_cm',
  ]) {
    data[k] = num(data[k]);
  }
  try {
    await api('/api/measurements', { method: 'POST', body: data });
    e.target.reset();
    $('#measure-form input[name=date]').value = new Date().toISOString().slice(0, 10);
    loadMeasurements();
  } catch (err) { alert('Erreur : ' + err.message); }
});

// --- WORKOUTS ---
let exerciseCounter = 0;

function buildSelectOptions(items, valueKey, labelKey, current) {
  return ['<option value="">— Sélectionner —</option>']
    .concat(items.map(i => `<option value="${i[valueKey]}" ${current === i[valueKey] ? 'selected' : ''}>${i[labelKey]}</option>`))
    .join('');
}

function addExerciseCard(data = {}) {
  const list = $('#exercises-list');
  const idx = ++exerciseCounter;
  const card = document.createElement('div');
  card.className = 'exercise-card';
  card.dataset.idx = idx;

  const muscleOptions = buildSelectOptions(window.GROUPES_MUSCULAIRES, 'id', 'label', data.groupe_musculaire);
  const equipOptions = buildSelectOptions(window.TYPES_EQUIPEMENT, 'id', 'label', data.type_equipement);

  card.innerHTML = `
    <div class="exercise-card-header">
      <label class="done-toggle" title="Marquer comme fait">
        <input type="checkbox" class="exercise-done" ${data.done ? 'checked' : ''} />
        <span class="done-label">Fait</span>
      </label>
      <span class="exercise-number">${idx}.</span>
      <span class="exercise-name">${data.nom || 'Nouvel exercice'}</span>
      <button type="button" class="danger" data-remove>×</button>
    </div>
    <div class="exercise-card-body">
      <div class="exercise-filters">
        <label>Groupe musculaire
          <select class="muscle-select">${muscleOptions}</select>
        </label>
        <label>Équipement
          <select class="equipment-select">${equipOptions}</select>
        </label>
        <label>Exercice
          <select class="exercise-select"><option value="">— D'abord choisir groupe + équipement —</option></select>
        </label>
        <label>Ou nom personnalisé
          <input type="text" class="custom-name" placeholder="Saisir un autre nom" value="${data.nom && !data.from_catalog ? data.nom : ''}" />
        </label>
      </div>

      <div class="exercise-pictogram"></div>

      <div class="variable-toggle-wrap exercise-musculation">
        <label class="checkbox-row">
          <input type="checkbox" class="variable-toggle" /> Charges variables par série (drop-set, pyramide…)
        </label>
      </div>

      <div class="exercise-uniform exercise-musculation">
        <label>Séries <input class="series" type="number" min="1" value="${data.series ?? ''}" /></label>
        <label>Reps <input class="reps" type="text" placeholder="10 ou 8-12" value="${data.repetitions ?? ''}" /></label>
        <label>Charge (kg) <input class="charge" type="number" step="0.5" value="${data.charge_kg ?? ''}" /></label>
        <label>Repos (s) <input class="repos" type="number" min="0" value="${data.repos_sec ?? ''}" /></label>
      </div>
      <div class="sets-progress exercise-musculation" title="Cliquer après chaque série pour démarrer le repos"></div>

      <div class="exercise-variable exercise-musculation hidden">
        <div class="series-detail-list"></div>
        <button type="button" class="secondary add-series-btn">+ Ajouter une série</button>
      </div>

      <div class="exercise-cardio hidden">
        <div class="cardio-grid">
          <label>Durée (min) <input class="cardio-duree" type="number" step="0.5" min="0" value="${data.duree_min ?? ''}" /></label>
          <label>Distance (km) <input class="cardio-distance" type="number" step="0.01" min="0" value="${data.distance_km ?? ''}" /></label>
          <label>Vitesse (km/h) <input class="cardio-vitesse" type="number" step="0.1" min="0" value="${data.vitesse_kmh ?? ''}" /></label>
          <label>Inclinaison (%) <input class="cardio-inclinaison" type="number" step="0.5" value="${data.inclinaison_pct ?? ''}" /></label>
          <label>Niveau résistance <input class="cardio-niveau" type="number" min="0" value="${data.niveau_resistance ?? ''}" /></label>
          <label>kcal (machine) <input class="cardio-kcal" type="number" min="0" value="${data.kcal_machine ?? ''}" /></label>
        </div>
      </div>

      <label class="exercise-notes">Notes
        <input type="text" class="notes" placeholder="Ressenti, technique, etc." value="${data.notes ?? ''}" />
      </label>
    </div>
  `;

  list.appendChild(card);

  const muscleSel = card.querySelector('.muscle-select');
  const equipSel = card.querySelector('.equipment-select');
  const exerSel = card.querySelector('.exercise-select');
  const customInput = card.querySelector('.custom-name');
  const nameDisplay = card.querySelector('.exercise-name');
  const variableToggle = card.querySelector('.variable-toggle');
  const uniformSection = card.querySelector('.exercise-uniform');
  const variableSection = card.querySelector('.exercise-variable');
  const seriesDetailList = card.querySelector('.series-detail-list');
  const addSeriesBtn = card.querySelector('.add-series-btn');
  const seriesInput = card.querySelector('.series');

  function refreshExerciseList() {
    const g = muscleSel.value;
    const eq = equipSel.value;
    if (!g && !eq) {
      exerSel.innerHTML = '<option value="">— D\'abord choisir groupe + équipement —</option>';
      return;
    }
    const matches = window.filterExercises(g || null, eq || null);
    if (!matches.length) {
      exerSel.innerHTML = '<option value="">Aucun exercice — utilisez le nom personnalisé</option>';
      return;
    }
    exerSel.innerHTML = '<option value="">— Choisir un exercice —</option>'
      + matches.map(e => `<option value="${e.nom}" ${data.nom === e.nom ? 'selected' : ''}>${e.nom}</option>`).join('');
  }

  function updateName() {
    const name = customInput.value.trim() || exerSel.value || 'Nouvel exercice';
    nameDisplay.textContent = name;
  }

  function refreshCardioMode() {
    const isCardio = equipSel.value === 'cardio' || equipSel.value === 'sport';
    card.classList.toggle('is-cardio', isCardio);
    card.querySelectorAll('.exercise-musculation').forEach(el => el.classList.toggle('hidden', isCardio));
    card.querySelector('.exercise-cardio').classList.toggle('hidden', !isCardio);
    // If switching to cardio, ensure the musculation variable section is collapsed
    if (isCardio) variableToggle.checked = false;
  }

  const pictEl = card.querySelector('.exercise-pictogram');
  function refreshPictogram() {
    if (!window.bodyPictogramSVG) return;
    pictEl.innerHTML = window.bodyPictogramSVG({ highlight: muscleSel.value || null });
  }
  refreshPictogram();

  muscleSel.addEventListener('change', () => { refreshExerciseList(); refreshPictogram(); updateSessionSummary(); });
  equipSel.addEventListener('change', () => { refreshExerciseList(); refreshCardioMode(); refreshPictogram(); updateSessionSummary(); });
  exerSel.addEventListener('change', () => {
    if (exerSel.value) customInput.value = '';
    updateName();
  });
  customInput.addEventListener('input', () => {
    if (customInput.value) exerSel.value = '';
    updateName();
  });

  function addSeriesDetailRow(values = {}) {
    const rowIdx = seriesDetailList.children.length + 1;
    const row = document.createElement('div');
    row.className = 'series-detail-row';
    row.innerHTML = `
      <span class="series-num">S${rowIdx}</span>
      <input class="sd-reps" type="number" min="1" placeholder="Reps" value="${values.reps ?? ''}" />
      <input class="sd-charge" type="number" step="0.5" placeholder="Charge (kg)" value="${values.charge ?? ''}" />
      <button type="button" class="danger" data-remove-series>×</button>
    `;
    row.querySelector('[data-remove-series]').addEventListener('click', () => {
      row.remove();
      renumberSeries();
      updateSessionSummary();
    });
    row.querySelectorAll('input').forEach(i => i.addEventListener('input', updateSessionSummary));
    seriesDetailList.appendChild(row);
    updateSessionSummary();
  }

  function renumberSeries() {
    Array.from(seriesDetailList.children).forEach((r, i) => {
      r.querySelector('.series-num').textContent = `S${i + 1}`;
    });
  }

  addSeriesBtn.addEventListener('click', () => {
    // Copy the last row's reps/charge so repeating the same series only
    // takes one tap. The user can still edit if the new series differs.
    const rows = seriesDetailList.children;
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      addSeriesDetailRow({
        reps: last.querySelector('.sd-reps').value,
        charge: last.querySelector('.sd-charge').value,
      });
    } else {
      addSeriesDetailRow();
    }
    saveWorkoutDraft();
  });

  variableToggle.addEventListener('change', () => {
    if (variableToggle.checked) {
      uniformSection.classList.add('hidden');
      variableSection.classList.remove('hidden');
      // Pre-populate series rows from the uniform fields
      if (seriesDetailList.children.length === 0) {
        const nSeries = parseInt(seriesInput.value, 10) || 3;
        const reps = card.querySelector('.reps').value;
        const charge = card.querySelector('.charge').value;
        for (let i = 0; i < nSeries; i++) addSeriesDetailRow({ reps, charge });
      }
    } else {
      uniformSection.classList.remove('hidden');
      variableSection.classList.add('hidden');
    }
    updateSessionSummary();
  });

  // Listen to all inputs that affect the summary
  card.querySelectorAll('.series, .reps, .charge, .cardio-duree, .cardio-kcal').forEach(i => i.addEventListener('input', updateSessionSummary));

  const doneCheckbox = card.querySelector('.exercise-done');
  function refreshDoneState() {
    card.classList.toggle('is-done', doneCheckbox.checked);
    updateSessionSummary();
    saveWorkoutDraft();
  }
  doneCheckbox.addEventListener('change', refreshDoneState);
  if (data.done) card.classList.add('is-done');

  card.querySelector('[data-remove]').addEventListener('click', () => {
    card.remove();
    updateSessionSummary();
  });

  // If reloading from data, restore variable details
  if (Array.isArray(data.series_details) && data.series_details.length > 0) {
    variableToggle.checked = true;
    variableToggle.dispatchEvent(new Event('change'));
    seriesDetailList.innerHTML = '';
    data.series_details.forEach(sd => addSeriesDetailRow(sd));
  }

  if (data.groupe_musculaire || data.type_equipement) refreshExerciseList();
  refreshCardioMode();
  setupSetsProgress(card);
  setupDragReorder(card);
  updateName();
  updateSessionSummary();
}

// === Drag-and-drop reorder of exercise cards ===
function setupDragReorder(card) {
  const handle = card.querySelector('.exercise-card-header');
  if (!handle) return;
  handle.setAttribute('draggable', 'true');
  handle.title = (handle.title || '') + ' (glisser pour réorganiser)';
  handle.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });
  handle.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.exercise-card.drag-over').forEach(c => c.classList.remove('drag-over'));
    saveWorkoutDraft();
    updateSessionSummary();
  });
}

// Document-wide drop listener (attached once below)
let _dragSetupDone = false;
function ensureDragListeners() {
  if (_dragSetupDone) return;
  _dragSetupDone = true;
  const list = document.getElementById('exercises-list');
  if (!list) return;
  list.addEventListener('dragover', (e) => {
    const dragging = document.querySelector('.exercise-card.dragging');
    if (!dragging) return;
    e.preventDefault();
    const cards = $$('.exercise-card:not(.dragging)', list);
    const after = cards.find(c => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    cards.forEach(c => c.classList.remove('drag-over'));
    if (after) {
      after.classList.add('drag-over');
      list.insertBefore(dragging, after);
    } else {
      cards[cards.length - 1]?.classList.add('drag-over');
      list.appendChild(dragging);
    }
  });
}
document.addEventListener('DOMContentLoaded', ensureDragListeners);
setTimeout(ensureDragListeners, 0); // also for already-loaded DOM

function readExerciseCard(card) {
  const customName = card.querySelector('.custom-name').value.trim();
  const selectedName = card.querySelector('.exercise-select').value;
  const nom = customName || selectedName;
  if (!nom) return null;

  const groupe_musculaire = card.querySelector('.muscle-select').value || null;
  const type_equipement = card.querySelector('.equipment-select').value || null;
  const notes = card.querySelector('.notes').value || null;
  const done = card.querySelector('.exercise-done')?.checked || false;
  const isCardio = type_equipement === 'cardio' || type_equipement === 'sport';

  if (isCardio) {
    return {
      nom,
      groupe_musculaire,
      type_equipement,
      series: null, repetitions: null, charge_kg: null, repos_sec: null, series_details: null,
      duree_min: num(card.querySelector('.cardio-duree').value),
      distance_km: num(card.querySelector('.cardio-distance').value),
      vitesse_kmh: num(card.querySelector('.cardio-vitesse').value),
      inclinaison_pct: num(card.querySelector('.cardio-inclinaison').value),
      niveau_resistance: num(card.querySelector('.cardio-niveau').value),
      kcal_machine: num(card.querySelector('.cardio-kcal').value),
      notes,
      done,
    };
  }

  const variable = card.querySelector('.variable-toggle').checked;

  if (variable) {
    const rows = Array.from(card.querySelectorAll('.series-detail-row')).map(r => ({
      reps: num(r.querySelector('.sd-reps').value),
      charge: num(r.querySelector('.sd-charge').value),
    })).filter(s => s.reps != null || s.charge != null);
    const charges = rows.map(r => r.charge).filter(c => c != null);
    return {
      nom,
      groupe_musculaire,
      type_equipement,
      series: rows.length || null,
      repetitions: rows.map(r => r.reps ?? '?').join('/'),
      charge_kg: charges.length ? Math.max(...charges) : null,
      repos_sec: num(card.querySelector('.repos').value),
      series_details: rows,
      notes,
      done,
    };
  }

  return {
    nom,
    groupe_musculaire,
    type_equipement,
    series: num(card.querySelector('.series').value),
    repetitions: card.querySelector('.reps').value || null,
    charge_kg: num(card.querySelector('.charge').value),
    repos_sec: num(card.querySelector('.repos').value),
    series_details: null,
    notes,
    done,
  };
}

function computeSessionStats() {
  const cards = $$('.exercise-card');
  let nbExercices = 0;
  let nbDone = 0;
  let totalSeries = 0;
  let totalReps = 0;
  let tonnage = 0;
  let cardioMin = 0;
  let cardioKcalMachine = 0;
  let cardioKm = 0;

  for (const card of cards) {
    const ex = readExerciseCard(card);
    if (!ex) continue;
    nbExercices++;
    if (ex.done) nbDone++;

    if (ex.type_equipement === 'cardio' || ex.type_equipement === 'sport') {
      cardioMin += ex.duree_min || 0;
      cardioKcalMachine += ex.kcal_machine || 0;
      cardioKm += ex.distance_km || 0;
      continue;
    }

    if (ex.series_details && ex.series_details.length) {
      for (const s of ex.series_details) {
        totalSeries += 1;
        totalReps += s.reps || 0;
        tonnage += (s.reps || 0) * (s.charge || 0);
      }
    } else {
      const series = ex.series || 0;
      let reps = 0;
      if (ex.repetitions) {
        const m = String(ex.repetitions).match(/(\d+)\s*(?:-\s*(\d+))?/);
        if (m) {
          reps = m[2] ? (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2 : parseInt(m[1], 10);
        }
      }
      totalSeries += series;
      totalReps += series * reps;
      tonnage += series * reps * (ex.charge_kg || 0);
    }
  }

  return { nbExercices, nbDone, totalSeries, totalReps, tonnage, cardioMin, cardioKcalMachine, cardioKm };
}

let cachedBodyweight = null;
async function getBodyweight() {
  if (cachedBodyweight !== null) return cachedBodyweight;
  try {
    const profile = await api('/api/profile');
    const measurements = await api('/api/measurements');
    const lastMeasure = measurements.slice().reverse().find(m => m.poids_kg);
    cachedBodyweight = lastMeasure?.poids_kg ?? profile?.poids_kg ?? null;
  } catch { cachedBodyweight = null; }
  return cachedBodyweight;
}

function estimateKcal(durationMin, ressenti, bodyweightKg) {
  if (!durationMin) return null;
  // MET selon ressenti (1-10)
  let met = 5; // moderate strength training
  if (ressenti) {
    if (ressenti <= 3) met = 3.5;
    else if (ressenti <= 6) met = 5;
    else if (ressenti <= 8) met = 6;
    else met = 7;
  }
  const weight = bodyweightKg || 75;
  // Formule MET : kcal/min = MET × poids × 0.0175
  return Math.round(met * weight * 0.0175 * durationMin);
}

async function updateSessionSummary() {
  const stats = computeSessionStats();
  const progressEl = $('#sum-progress');
  if (progressEl) {
    if (stats.nbExercices > 0) {
      progressEl.textContent = `${stats.nbDone}/${stats.nbExercices}`;
      progressEl.parentElement.classList.toggle('done-all', stats.nbDone === stats.nbExercices && stats.nbDone > 0);
    } else {
      progressEl.textContent = '0/0';
      progressEl.parentElement.classList.remove('done-all');
    }
  }
  $('#sum-exercices').textContent = stats.nbExercices;
  $('#sum-series').textContent = stats.totalSeries;
  $('#sum-reps').textContent = Math.round(stats.totalReps);
  $('#sum-tonnage').textContent = `${Math.round(stats.tonnage)} kg`;

  const dureeInput = $('#workout-form [name=duree_min]');
  const ressentiInput = $('#workout-form [name=ressenti]');
  const dureeForm = dureeInput ? num(dureeInput.value) : null;
  // Si l'utilisateur n'a pas saisi la durée globale, on prend la somme des durées cardio
  const duree = dureeForm || (stats.cardioMin > 0 ? stats.cardioMin : null);
  const ressenti = ressentiInput ? num(ressentiInput.value) : null;
  const bw = await getBodyweight();
  let kcalEstime = estimateKcal(duree, ressenti, bw);

  // Si les machines cardio ont indiqué leur propre kcal, on les ajoute
  const kcalTotal = (kcalEstime || 0) + Math.round(stats.cardioKcalMachine || 0);

  const kcalEl = $('#sum-kcal');
  const hintEl = $('#sum-hint');
  if (kcalTotal > 0) {
    const kj = Math.round(kcalTotal * 4.184);
    kcalEl.textContent = `${kcalTotal} kcal (~${kj} kJ)`;
    const bits = [];
    if (kcalEstime) {
      bits.push(`estim. MET ${kcalEstime} kcal (durée ${duree} min, ${ressenti ? 'ressenti ' + ressenti + '/10, ' : ''}${bw ? 'poids ' + bw + ' kg' : 'poids supposé 75 kg'})`);
    }
    if (stats.cardioKcalMachine > 0) {
      bits.push(`+ ${Math.round(stats.cardioKcalMachine)} kcal lus sur machine(s) cardio`);
    }
    if (stats.cardioKm > 0) bits.push(`distance cardio : ${stats.cardioKm.toFixed(2)} km`);
    hintEl.textContent = bits.join(' · ');
  } else {
    kcalEl.textContent = '— kcal';
    hintEl.textContent = 'Renseignez la durée (ou la durée d\'un cardio) pour estimer l\'énergie.';
  }
}

$('#add-exercise').addEventListener('click', () => {
  addExerciseCard();
  saveWorkoutDraft();
});
// Recompute on duree/ressenti change
['duree_min', 'ressenti'].forEach(name => {
  const el = document.querySelector(`#workout-form [name=${name}]`);
  if (el) el.addEventListener('input', updateSessionSummary);
});

async function loadWorkouts() {
  const list = await api('/api/workouts');
  const div = $('#workouts-list');
  div.innerHTML = '';

  // Quick-start: "🔁 Refaire la dernière séance"
  const quickStart = $('#quick-start');
  if (quickStart) {
    if (list.length) {
      const last = list[0];
      quickStart.classList.remove('hidden');
      quickStart.innerHTML = `
        <span>Dernière séance : <strong>${last.nom ?? 'Séance'}</strong> · ${last.date}</span>
        <button class="primary" id="redo-last-btn">🔁 Refaire</button>
      `;
      $('#redo-last-btn').addEventListener('click', () => redoWorkout(last));
    } else {
      quickStart.classList.add('hidden');
    }
  }

  if (!list.length) {
    div.innerHTML = '<p class="empty">Aucune séance enregistrée.</p>';
    return;
  }
  for (const w of list) {
    const card = document.createElement('div');
    card.className = 'workout-card';
    const pills = (w.exercises || []).map(e => {
      const parts = [e.nom];
      if (e.type_equipement === 'cardio' || e.type_equipement === 'sport') {
        if (e.duree_min) parts.push(`${e.duree_min} min`);
        if (e.distance_km) parts.push(`${e.distance_km} km`);
        if (e.vitesse_kmh) parts.push(`${e.vitesse_kmh} km/h`);
        if (e.inclinaison_pct) parts.push(`incl. ${e.inclinaison_pct}%`);
        if (e.niveau_resistance) parts.push(`niv. ${e.niveau_resistance}`);
        if (e.kcal_machine) parts.push(`${e.kcal_machine} kcal`);
      } else {
        let detail = null;
        if (e.series_details) {
          try { detail = typeof e.series_details === 'string' ? JSON.parse(e.series_details) : e.series_details; } catch {}
        }
        if (Array.isArray(detail) && detail.length) {
          const seriesText = detail.map(s => `${s.reps ?? '?'}×${s.charge ?? '?'}kg`).join(' / ');
          parts.push(seriesText);
        } else {
          if (e.series && e.repetitions) parts.push(`${e.series}×${e.repetitions}`);
          if (e.charge_kg) parts.push(`${e.charge_kg}kg`);
        }
      }
      return `<span class="exercise-pill">${parts.join(' ')}</span>`;
    }).join('');
    card.innerHTML = `
      <div class="workout-card-header">
        <div>
          <div class="workout-card-title">${w.nom ?? 'Séance'}</div>
          <div class="workout-card-date">${w.date} · ${w.duree_min ?? '?'} min · Ressenti ${w.ressenti ?? '—'}/10</div>
        </div>
        <div class="workout-card-actions">
          <button class="secondary" data-redo-w="${w.id}" title="Refaire cette séance">🔁 Refaire</button>
          <button class="secondary" data-tmpl-w="${w.id}" title="Sauver comme modèle">💾 Modèle</button>
          <button class="danger" data-del-w="${w.id}">Suppr.</button>
        </div>
      </div>
      <div>${pills || '<em class="empty">Pas d\'exercices détaillés</em>'}</div>
      ${w.notes ? `<p style="margin-top:0.5rem;color:var(--text-dim);">${w.notes}</p>` : ''}
    `;
    div.appendChild(card);
  }
  $$('[data-del-w]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Supprimer cette séance ?')) return;
      await api(`/api/workouts/${b.dataset.delW}`, { method: 'DELETE' });
      loadWorkouts();
    });
  });
  $$('[data-redo-w]').forEach(b => {
    b.addEventListener('click', () => {
      const w = list.find(x => String(x.id) === b.dataset.redoW);
      if (w) redoWorkout(w);
    });
  });
  $$('[data-tmpl-w]').forEach(b => {
    b.addEventListener('click', () => {
      const w = list.find(x => String(x.id) === b.dataset.tmplW);
      if (w) saveAsTemplate(w);
    });
  });
}

// Re-open the Entraînements form pre-filled with a previous workout's
// exercises (charges intact so the user can either repeat or progress).
function redoWorkout(workout) {
  const draftHasData = $$('.exercise-card').some(c => readExerciseCard(c));
  if (draftHasData && !confirm('Une séance est déjà en cours. La remplacer par cette séance à refaire ?')) return;
  const form = $('#workout-form');
  form.reset();
  form.date.value = new Date().toISOString().slice(0, 10);
  form.nom.value = workout.nom || 'Séance refaite';
  $('#exercises-list').innerHTML = '';
  exerciseCounter = 0;
  for (const ex of (workout.exercises || [])) {
    // Strip the previous-workout's series_details strings into objects
    let sd = null;
    if (ex.series_details) {
      try { sd = typeof ex.series_details === 'string' ? JSON.parse(ex.series_details) : ex.series_details; } catch {}
    }
    addExerciseCard({ ...ex, series_details: sd, done: false });
  }
  updateSessionSummary();
  saveWorkoutDraft();
  const tabBtn = document.querySelector('.tab[data-tab="entrainements"]');
  if (tabBtn) tabBtn.click();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveAsTemplate(workout) {
  const name = prompt('Nom du modèle ?', workout.nom || 'Modèle séance');
  if (!name) return;
  const exercises = (workout.exercises || []).map(e => {
    let sd = null;
    if (e.series_details) {
      try { sd = typeof e.series_details === 'string' ? JSON.parse(e.series_details) : e.series_details; } catch {}
    }
    return {
      nom: e.nom, groupe_musculaire: e.groupe_musculaire, type_equipement: e.type_equipement,
      series: e.series, repetitions: e.repetitions, charge_kg: e.charge_kg, repos_sec: e.repos_sec,
      series_details: sd,
      duree_min: e.duree_min, distance_km: e.distance_km, vitesse_kmh: e.vitesse_kmh,
      inclinaison_pct: e.inclinaison_pct, niveau_resistance: e.niveau_resistance, kcal_machine: e.kcal_machine,
      notes: e.notes,
    };
  });
  try {
    await api('/api/templates', { method: 'POST', body: { titre: name, exercises } });
    alert(`✓ Modèle "${name}" sauvegardé. Disponible dans l'onglet Plans → Mes modèles.`);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

// --- REST TIMER ---
// Singleton floating widget. Drives a date-anchored countdown so backgrounding
// the tab can't drift the timer. Beeps + vibrates at zero.
const restTimer = {
  endTime: 0,
  rafId: null,
  el: null,

  ensureWidget() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.id = 'rest-timer';
    this.el.className = 'rest-timer hidden';
    this.el.innerHTML = `
      <div class="rest-label">Repos</div>
      <div class="rest-time">0:00</div>
      <div class="rest-controls">
        <button type="button" data-delta="-15" title="Retirer 15 s">−15</button>
        <button type="button" data-delta="15" title="Ajouter 15 s">+15</button>
        <button type="button" data-action="skip" title="Passer">Skip</button>
      </div>
    `;
    this.el.querySelectorAll('[data-delta]').forEach(b => {
      b.addEventListener('click', () => this.adjust(parseInt(b.dataset.delta, 10)));
    });
    this.el.querySelector('[data-action="skip"]').addEventListener('click', () => this.stop());
    document.body.appendChild(this.el);
  },

  start(seconds) {
    if (!seconds || seconds <= 0) seconds = 90;
    this.ensureWidget();
    this.endTime = Date.now() + seconds * 1000;
    this.el.classList.remove('hidden', 'done');
    this.tick();
    if (this.rafId) clearInterval(this.rafId);
    this.rafId = setInterval(() => this.tick(), 250);
  },

  adjust(deltaSec) {
    if (!this.rafId) return;
    this.endTime += deltaSec * 1000;
    this.tick();
  },

  stop() {
    if (this.rafId) clearInterval(this.rafId);
    this.rafId = null;
    if (this.el) this.el.classList.add('hidden');
  },

  tick() {
    if (!this.el) return;
    const remainingMs = this.endTime - Date.now();
    if (remainingMs <= 0) { this.onEnd(); return; }
    const total = Math.ceil(remainingMs / 1000);
    const m = Math.floor(total / 60), s = total % 60;
    this.el.querySelector('.rest-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
  },

  onEnd() {
    if (this.rafId) clearInterval(this.rafId);
    this.rafId = null;
    this.el.classList.add('done');
    this.el.querySelector('.rest-time').textContent = '✓ GO';
    this.beep();
    if (navigator.vibrate) try { navigator.vibrate([180, 90, 180]); } catch {}
    setTimeout(() => { if (this.el) this.el.classList.add('hidden'); this.el?.classList.remove('done'); }, 4000);
  },

  beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime;
      // Two short ascending beeps
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 660 + i * 220;
        gain.gain.setValueAtTime(0.25, t + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.18 + 0.15);
        osc.start(t + i * 0.18);
        osc.stop(t + i * 0.18 + 0.18);
      }
    } catch {}
  },
};

// Build the per-set progress dots. Called when the card is added or when
// the user changes the series count. Stays empty in variable / cardio modes.
function setupSetsProgress(card) {
  const container = card.querySelector('.sets-progress');
  const seriesInput = card.querySelector('.series');
  const reposInput = card.querySelector('.repos');
  const doneCheckbox = card.querySelector('.exercise-done');
  const variableToggle = card.querySelector('.variable-toggle');
  const equipSel = card.querySelector('.equipment-select');

  function shouldShow() {
    if (variableToggle?.checked) return false;
    if (equipSel?.value === 'cardio' || equipSel?.value === 'sport') return false;
    const n = parseInt(seriesInput.value, 10) || 0;
    return n > 0 && n <= 12;
  }

  function rebuild() {
    container.innerHTML = '';
    if (!shouldShow()) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    const n = parseInt(seriesInput.value, 10);
    for (let i = 1; i <= n; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'set-btn';
      btn.textContent = i;
      btn.addEventListener('click', () => {
        btn.classList.toggle('done');
        if (btn.classList.contains('done')) {
          const repos = parseInt(reposInput.value, 10) || 90;
          restTimer.start(repos);
        }
        // Auto-mark the exercise as fully done when every set is checked
        const all = Array.from(container.querySelectorAll('.set-btn'));
        const allDone = all.length > 0 && all.every(b => b.classList.contains('done'));
        if (allDone && !doneCheckbox.checked) {
          doneCheckbox.checked = true;
          doneCheckbox.dispatchEvent(new Event('change'));
        }
        saveWorkoutDraft();
      });
      container.appendChild(btn);
    }
  }

  seriesInput.addEventListener('input', rebuild);
  variableToggle?.addEventListener('change', rebuild);
  equipSel?.addEventListener('change', rebuild);
  rebuild();
}

// --- WORKOUT DRAFT AUTOSAVE ---
// Mobile browsers often kill backgrounded tabs to reclaim RAM. Without
// persistence, returning to the app after a context switch wipes the
// in-progress workout form. We snapshot the form to localStorage on every
// edit (debounced) and on visibility change, then restore on load.

function workoutDraftKey() {
  return `coach-ia-workout-draft-${currentUser || 'anon'}`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function serializeWorkoutForm() {
  const form = $('#workout-form');
  const exercises = $$('.exercise-card').map(readExerciseCard).filter(Boolean);
  return {
    date: form.date.value || null,
    nom: form.nom.value || null,
    duree_min: form.duree_min.value || null,
    ressenti: form.ressenti.value || null,
    notes: form.notes.value || null,
    exercises,
    _saved_at: new Date().toISOString(),
  };
}

function isDraftEmpty(d) {
  if (!d) return true;
  if (Array.isArray(d.exercises) && d.exercises.length > 0) return false;
  if (d.nom || d.duree_min || d.ressenti || d.notes) return false;
  return true;
}

const _debouncedSaveDraft = debounce(_saveWorkoutDraftNow, 500);

function _saveWorkoutDraftNow() {
  if (!currentUser) return;
  const d = serializeWorkoutForm();
  try {
    if (isDraftEmpty(d)) localStorage.removeItem(workoutDraftKey());
    else localStorage.setItem(workoutDraftKey(), JSON.stringify(d));
  } catch (e) { console.warn('draft save failed', e); }
}

function saveWorkoutDraft() { _debouncedSaveDraft(); }

function clearWorkoutDraft() {
  try { localStorage.removeItem(workoutDraftKey()); } catch {}
}

function restoreWorkoutDraft() {
  if (!currentUser) return false;
  let d;
  try {
    const raw = localStorage.getItem(workoutDraftKey());
    if (!raw) return false;
    d = JSON.parse(raw);
  } catch { return false; }
  if (isDraftEmpty(d)) return false;

  const form = $('#workout-form');
  if (d.date) form.date.value = d.date;
  if (d.nom) form.nom.value = d.nom;
  if (d.duree_min) form.duree_min.value = d.duree_min;
  if (d.ressenti) form.ressenti.value = d.ressenti;
  if (d.notes) form.notes.value = d.notes;

  $('#exercises-list').innerHTML = '';
  exerciseCounter = 0;
  const exs = Array.isArray(d.exercises) ? d.exercises : [];
  if (exs.length === 0) {
    addExerciseCard();
  } else {
    for (const ex of exs) addExerciseCard(ex);
  }
  updateSessionSummary();

  const banner = document.createElement('div');
  banner.className = 'draft-banner';
  const when = d._saved_at ? new Date(d._saved_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  banner.innerHTML = `
    📝 Brouillon restauré ${when ? `(sauvegardé ${when})` : ''}
    <button type="button" class="draft-discard">Effacer le brouillon</button>
  `;
  banner.querySelector('.draft-discard').addEventListener('click', () => {
    if (!confirm('Effacer le brouillon en cours et repartir d\'une séance vide ?')) return;
    clearWorkoutDraft();
    form.reset();
    form.date.value = new Date().toISOString().slice(0, 10);
    $('#exercises-list').innerHTML = '';
    exerciseCounter = 0;
    addExerciseCard();
    updateSessionSummary();
    banner.remove();
  });
  form.insertBefore(banner, form.firstChild);
  setTimeout(() => banner.classList.add('fading'), 8000);
  return true;
}

// Live save: any input bubbling up from the workout form
$('#workout-form').addEventListener('input', saveWorkoutDraft);
$('#workout-form').addEventListener('change', saveWorkoutDraft);

// Save immediately when the tab is hidden (user switches app) — debounced
// save might not have flushed yet.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') _saveWorkoutDraftNow();
});
window.addEventListener('pagehide', _saveWorkoutDraftNow);

$('#workout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const exercises = $$('.exercise-card').map(readExerciseCard).filter(Boolean);
  const data = {
    date: form.date.value,
    nom: form.nom.value || null,
    duree_min: num(form.duree_min.value),
    ressenti: num(form.ressenti.value),
    notes: form.notes.value || null,
    exercises,
  };
  try {
    await api('/api/workouts', { method: 'POST', body: data });
    clearWorkoutDraft();
    form.reset();
    form.date.value = new Date().toISOString().slice(0, 10);
    $('#exercises-list').innerHTML = '';
    exerciseCounter = 0;
    addExerciseCard();
    updateSessionSummary();
    loadWorkouts();
    // Refresh cached bodyweight in case profile/measurements changed
    cachedBodyweight = null;
  } catch (err) { alert('Erreur : ' + err.message); }
});

// --- PER-EXERCISE PROGRESSION & PRs ---
// Aggregate every exercise from the user's history into one row per
// (normalized) name, with per-session best charge/reps and total volume.
// A PR is flagged when the latest session matched-or-exceeded the previous
// best charge (or total volume).
function computeExerciseRecords(workouts) {
  const byName = new Map();
  for (const w of workouts) {
    for (const ex of (w.exercises || [])) {
      const rawName = (ex.nom || '').trim();
      if (!rawName) continue;
      const key = rawName.toLowerCase();
      if (!byName.has(key)) byName.set(key, { name: rawName, sessions: [] });
      const entry = byName.get(key);

      // Best charge × reps in this session (handles variable rows too)
      let bestCharge = null, bestReps = null, volume = 0;
      let sd = null;
      if (ex.series_details) {
        try { sd = typeof ex.series_details === 'string' ? JSON.parse(ex.series_details) : ex.series_details; } catch {}
      }
      if (Array.isArray(sd) && sd.length) {
        for (const s of sd) {
          if (s.charge != null && (bestCharge == null || s.charge > bestCharge)) {
            bestCharge = s.charge; bestReps = s.reps ?? null;
          }
          volume += (s.reps || 0) * (s.charge || 0);
        }
      } else if (ex.charge_kg != null && ex.series && ex.repetitions) {
        bestCharge = ex.charge_kg;
        const m = String(ex.repetitions).match(/(\d+)(?:\s*-\s*(\d+))?/);
        const reps = m ? (m[2] ? (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2 : parseInt(m[1], 10)) : 0;
        bestReps = reps || null;
        volume = (ex.series || 0) * reps * (ex.charge_kg || 0);
      } else if (ex.type_equipement === 'cardio' || ex.type_equipement === 'sport') {
        volume = ex.duree_min || 0;
      }

      entry.sessions.push({
        date: w.date,
        bestCharge, bestReps, volume,
        type_equipement: ex.type_equipement,
        duree_min: ex.duree_min,
        distance_km: ex.distance_km,
        vitesse_kmh: ex.vitesse_kmh,
      });
    }
  }

  // Chronological order + PR detection
  const today = new Date().toISOString().slice(0, 10);
  const fortnightAgo = new Date(); fortnightAgo.setDate(fortnightAgo.getDate() - 14);
  const fortnightStr = fortnightAgo.toISOString().slice(0, 10);

  const result = [];
  for (const e of byName.values()) {
    e.sessions.sort((a, b) => a.date.localeCompare(b.date));
    let prevBestCharge = 0, prevBestVolume = 0;
    for (const s of e.sessions) {
      s.is_pr_charge = s.bestCharge != null && s.bestCharge > prevBestCharge;
      s.is_pr_volume = s.volume > prevBestVolume;
      if (s.bestCharge != null && s.bestCharge > prevBestCharge) prevBestCharge = s.bestCharge;
      if (s.volume > prevBestVolume) prevBestVolume = s.volume;
    }
    const last = e.sessions[e.sessions.length - 1];
    e.allTimeMaxCharge = prevBestCharge || null;
    e.allTimeMaxVolume = prevBestVolume || null;
    e.lastSession = last;
    e.recentPR = last && last.date >= fortnightStr && (last.is_pr_charge || last.is_pr_volume);
    e.totalSessions = e.sessions.length;
    // Plateau detection: last 3 sessions, none was a PR by charge OR volume
    const tail = e.sessions.slice(-3);
    e.plateau = tail.length >= 3 && tail.every(s => !s.is_pr_charge && !s.is_pr_volume);
    if (e.plateau) {
      const first = tail[0].date, lastD = tail[tail.length - 1].date;
      const weeks = Math.max(1, Math.round((new Date(lastD) - new Date(first)) / (7 * 86400000)));
      e.plateauWeeks = weeks;
    }
    result.push(e);
  }
  // Sort: most-recently trained first
  result.sort((a, b) => (b.lastSession?.date || '').localeCompare(a.lastSession?.date || ''));
  return result;
}

// === In-app reminders ===
async function maybeShowReminders() {
  const banner = document.getElementById('reminder-banner');
  if (!banner) return;
  // Don't re-show if user dismissed today
  const dismissedKey = 'coach-ia-reminder-dismissed';
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(dismissedKey) === today) return;

  const reminders = [];
  try {
    const workouts = await api('/api/workouts');
    if (workouts.length) {
      const last = workouts[0]; // already sorted desc by date
      const days = Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000);
      if (days >= 3) reminders.push(`💪 Ça fait ${days} jours sans séance. Une petite séance aujourd'hui ?`);
    }
  } catch {}
  try {
    const ms = await api('/api/measurements');
    if (ms.length) {
      const lastW = ms.slice().reverse().find(m => m.poids_kg != null);
      if (lastW) {
        const days = Math.floor((Date.now() - new Date(lastW.date).getTime()) / 86400000);
        if (days >= 14) reminders.push(`⚖️ Aucune pesée depuis ${days} jours. Un point régulier aide à suivre la progression.`);
      }
    } else {
      reminders.push('⚖️ Pense à enregistrer ton poids pour suivre ta progression.');
    }
  } catch {}

  if (!reminders.length) { banner.classList.add('hidden'); return; }
  banner.innerHTML = `
    <div class="reminder-content">${reminders.join('<br>')}</div>
    <button type="button" id="dismiss-reminder" class="reminder-dismiss" title="Masquer pour aujourd'hui">×</button>
  `;
  banner.classList.remove('hidden');
  document.getElementById('dismiss-reminder')?.addEventListener('click', () => {
    localStorage.setItem(dismissedKey, today);
    banner.classList.add('hidden');
  });
}

async function renderWeeklySummary() {
  const body = document.getElementById('weekly-summary-body');
  if (!body) return;
  let workouts = [];
  try { workouts = await api('/api/workouts'); } catch { return; }
  const since = new Date(); since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);
  const week = workouts.filter(w => w.date >= sinceStr);
  if (!week.length) {
    body.innerHTML = '<p class="empty">Aucune séance cette semaine. Une bonne semaine commence souvent un lundi 💪</p>';
    return;
  }
  let tonnage = 0, totalDuration = 0, totalRessenti = 0, ressentiCount = 0;
  const muscleCount = {};
  for (const w of week) {
    if (w.duree_min) totalDuration += w.duree_min;
    if (w.ressenti) { totalRessenti += w.ressenti; ressentiCount++; }
    for (const ex of (w.exercises || [])) {
      const m = ex.groupe_musculaire;
      if (m) muscleCount[m] = (muscleCount[m] || 0) + 1;
      let sd = null;
      if (ex.series_details) {
        try { sd = typeof ex.series_details === 'string' ? JSON.parse(ex.series_details) : ex.series_details; } catch {}
      }
      if (Array.isArray(sd) && sd.length) {
        for (const s of sd) tonnage += (s.reps || 0) * (s.charge || 0);
      } else if (ex.series && ex.charge_kg) {
        const m = String(ex.repetitions || '').match(/(\d+)/);
        const reps = m ? parseInt(m[1], 10) : 0;
        tonnage += ex.series * reps * ex.charge_kg;
      }
    }
  }
  const topMuscle = Object.entries(muscleCount).sort((a, b) => b[1] - a[1])[0];
  const records = computeExerciseRecords(workouts);
  const weeklyPRs = records.filter(r => r.lastSession && r.lastSession.date >= sinceStr && (r.lastSession.is_pr_charge || r.lastSession.is_pr_volume));

  body.innerHTML = `
    <div class="summary-grid">
      <div><span class="summary-label">Séances</span><span class="summary-value">${week.length}</span></div>
      <div><span class="summary-label">Durée totale</span><span class="summary-value">${totalDuration} min</span></div>
      <div><span class="summary-label">Tonnage</span><span class="summary-value">${Math.round(tonnage)} kg</span></div>
      <div><span class="summary-label">Ressenti moyen</span><span class="summary-value">${ressentiCount ? (totalRessenti / ressentiCount).toFixed(1) : '—'} /10</span></div>
      <div><span class="summary-label">Muscle dominant</span><span class="summary-value">${topMuscle ? topMuscle[0] : '—'}</span></div>
      <div><span class="summary-label">PRs cette semaine</span><span class="summary-value">${weeklyPRs.length}</span></div>
    </div>
    ${weeklyPRs.length ? `<p class="hint" style="margin-top:0.7rem">🏆 ${weeklyPRs.map(r => r.name).join(' · ')}</p>` : ''}
  `;
}

async function renderExerciseRecords() {
  const container = $('#exercise-records');
  if (!container) return;
  let workouts = [];
  try { workouts = await api('/api/workouts'); } catch { return; }
  const records = computeExerciseRecords(workouts);
  if (!records.length) {
    container.innerHTML = '<p class="empty">Aucun exercice enregistré pour le moment.</p>';
    return;
  }
  container.innerHTML = records.map((e, i) => {
    const last = e.lastSession;
    const isCardio = last?.type_equipement === 'cardio' || last?.type_equipement === 'sport';
    const summary = isCardio
      ? `${e.totalSessions} séances · meilleur ${Math.round(e.allTimeMaxVolume)} min cumul`
      : `${e.totalSessions} séances · record ${e.allTimeMaxCharge ?? '?'} kg`;
    const prBadge = e.recentPR ? '<span class="pr-badge">🏆 PR récent</span>' : '';
    const platBadge = e.plateau ? `<span class="plateau-badge" title="Pas de PR depuis ${e.plateauWeeks} semaine(s) → essaie de varier (tempo, +reps, deload, ou variante)">⚠️ Stagne ${e.plateauWeeks} sem.</span>` : '';
    const badge = prBadge + platBadge;
    return `
      <details class="ex-record" data-i="${i}">
        <summary>
          <span class="ex-record-name">${e.name}</span>
          <span class="ex-record-summary">${summary} ${badge}</span>
        </summary>
        <div class="ex-record-detail">
          <table>
            <thead><tr><th>Date</th><th>Meilleur</th><th>Volume</th></tr></thead>
            <tbody>
              ${e.sessions.slice().reverse().map(s => `
                <tr>
                  <td>${s.date}</td>
                  <td>${isCardio
                    ? `${s.duree_min ?? '?'} min${s.distance_km ? ` · ${s.distance_km} km` : ''}${s.vitesse_kmh ? ` · ${s.vitesse_kmh} km/h` : ''}`
                    : `${s.bestCharge ?? '?'} kg × ${s.bestReps ?? '?'}`} ${s.is_pr_charge ? '🏆' : ''}</td>
                  <td>${Math.round(s.volume)}${isCardio ? ' min' : ' kg'} ${s.is_pr_volume && !s.is_pr_charge ? '🏆' : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }).join('');
}

// --- BODY MAP ---
async function renderBodyMap() {
  const days = parseInt($('#carte-window').value, 10) || 7;
  const since = new Date();
  since.setDate(since.getDate() - days);

  let workouts;
  try { workouts = await api('/api/workouts'); }
  catch { return; }

  const { intensity, counts } = window.muscleIntensityFromWorkouts(workouts, since);
  $('#body-map-svg').innerHTML = window.bodyPictogramSVG({ intensity });

  // Detail table
  const groups = window.GROUPES_MUSCULAIRES;
  const rows = groups.map(g => {
    const count = counts[g.id] || 0;
    const level = intensity[g.id] || 0;
    return `<tr>
      <td>${g.label}</td>
      <td><span class="legend-swatch level-${level}"></span></td>
      <td>${count > 0 ? count.toFixed(0) : '—'}</td>
      <td>${['Non travaillé', 'Léger', 'Modéré', 'Soutenu', 'Élevé'][level]}</td>
    </tr>`;
  }).join('');
  $('#body-map-table').innerHTML = `
    <table class="body-map-detail">
      <thead><tr><th>Groupe</th><th>Niveau</th><th>Volume</th><th>État</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'carte-window') renderBodyMap();
});

// --- CHARTS ---
let chartBody, chartTours, chartAsym, chartWorkouts;

async function renderCharts() {
  const measurements = await api('/api/measurements');
  const workouts = await api('/api/workouts');

  const labels = measurements.map(m => m.date);

  const dsBody = [
    { label: 'Poids (kg)', data: measurements.map(m => m.poids_kg), borderColor: '#2f81f7', backgroundColor: 'transparent', spanGaps: true },
    { label: '% muscle', data: measurements.map(m => m.pct_muscle), borderColor: '#3fb950', backgroundColor: 'transparent', spanGaps: true },
    { label: '% graisse', data: measurements.map(m => m.pct_graisse), borderColor: '#d29922', backgroundColor: 'transparent', spanGaps: true },
  ];

  // For each side-aware tour, prefer the new G/D fields; fall back to the
  // legacy single value if only that is set.
  const brasG = measurements.map(m => m.tour_bras_gauche_cm ?? m.tour_bras_cm);
  const brasD = measurements.map(m => m.tour_bras_droit_cm ?? m.tour_bras_cm);
  const cuisseG = measurements.map(m => m.tour_cuisse_gauche_cm ?? m.tour_cuisse_cm);
  const cuisseD = measurements.map(m => m.tour_cuisse_droit_cm ?? m.tour_cuisse_cm);
  const molletG = measurements.map(m => m.tour_mollet_gauche_cm);
  const molletD = measurements.map(m => m.tour_mollet_droit_cm);

  const dsTours = [
    { label: 'Taille', data: measurements.map(m => m.tour_taille_cm), borderColor: '#2f81f7', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Hanches', data: measurements.map(m => m.tour_hanches_cm), borderColor: '#a371f7', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Bras G', data: brasG, borderColor: '#3fb950', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Bras D', data: brasD, borderColor: '#3fb950', borderDash: [4, 4], backgroundColor: 'transparent', spanGaps: true },
    { label: 'Cuisse G', data: cuisseG, borderColor: '#d29922', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Cuisse D', data: cuisseD, borderColor: '#d29922', borderDash: [4, 4], backgroundColor: 'transparent', spanGaps: true },
    { label: 'Mollet G', data: molletG, borderColor: '#f85149', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Mollet D', data: molletD, borderColor: '#f85149', borderDash: [4, 4], backgroundColor: 'transparent', spanGaps: true },
  ];

  // Asymmetry deltas (signed: G − D, in cm)
  const deltaBras = measurements.map(m =>
    (m.tour_bras_gauche_cm != null && m.tour_bras_droit_cm != null) ? (m.tour_bras_gauche_cm - m.tour_bras_droit_cm) : null);
  const deltaCuisse = measurements.map(m =>
    (m.tour_cuisse_gauche_cm != null && m.tour_cuisse_droit_cm != null) ? (m.tour_cuisse_gauche_cm - m.tour_cuisse_droit_cm) : null);
  const deltaMollet = measurements.map(m =>
    (m.tour_mollet_gauche_cm != null && m.tour_mollet_droit_cm != null) ? (m.tour_mollet_gauche_cm - m.tour_mollet_droit_cm) : null);
  const dsAsym = [
    { label: 'Bras G−D', data: deltaBras, borderColor: '#3fb950', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Cuisse G−D', data: deltaCuisse, borderColor: '#d29922', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Mollet G−D', data: deltaMollet, borderColor: '#f85149', backgroundColor: 'transparent', spanGaps: true },
  ];
  // Only render the asymmetry chart if there's at least one pair filled
  const hasAnyAsym = [deltaBras, deltaCuisse, deltaMollet].some(arr => arr.some(v => v != null));

  const workoutDates = workouts.map(w => w.date).reverse();
  const workoutDuree = workouts.map(w => w.duree_min).reverse();

  const chartOpts = {
    responsive: true,
    plugins: { legend: { labels: { color: '#e6edf3' } } },
    scales: {
      x: { ticks: { color: '#8b949e' }, grid: { color: '#2d3744' } },
      y: { ticks: { color: '#8b949e' }, grid: { color: '#2d3744' } },
    },
  };

  if (chartBody) chartBody.destroy();
  chartBody = new Chart($('#chart-body'), {
    type: 'line',
    data: { labels, datasets: dsBody },
    options: chartOpts,
  });

  if (chartTours) chartTours.destroy();
  chartTours = new Chart($('#chart-tours'), {
    type: 'line',
    data: { labels, datasets: dsTours },
    options: chartOpts,
  });

  if (chartAsym) { chartAsym.destroy(); chartAsym = null; }
  const asymBlock = $('#asymmetry-block');
  if (asymBlock) asymBlock.classList.toggle('hidden', !hasAnyAsym);
  if (hasAnyAsym) {
    chartAsym = new Chart($('#chart-asym'), {
      type: 'line',
      data: { labels, datasets: dsAsym },
      options: {
        ...chartOpts,
        plugins: {
          ...chartOpts.plugins,
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y > 0 ? '+' : ''}${c.parsed.y?.toFixed(1)} cm` } },
        },
      },
    });
  }

  if (chartWorkouts) chartWorkouts.destroy();
  chartWorkouts = new Chart($('#chart-workouts'), {
    type: 'bar',
    data: {
      labels: workoutDates,
      datasets: [{ label: 'Durée (min)', data: workoutDuree, backgroundColor: '#2f81f7' }],
    },
    options: chartOpts,
  });
}

$('#analyze-btn').addEventListener('click', async () => {
  try {
    showLoader('Analyse de votre progression…');
    const r = await api('/api/progress-analysis', { method: 'POST', body: {} });
    const out = $('#analysis-output');
    out.innerHTML = marked.parse(r.analyse);
    out.classList.remove('hidden');
    out.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert('Erreur : ' + err.message);
  } finally { hideLoader(); }
});

// --- COACH AI ---
async function displayCoachOutput(text, plan = null) {
  const out = $('#coach-output');
  // Always strip the structured plan JSON block so it never leaks to the UI
  const { exercises, cleaned } = extractPlanJSON(text);
  out.innerHTML = marked.parse(cleaned);
  if (plan && exercises && exercises.length) {
    const startBtn = document.createElement('button');
    startBtn.className = 'primary';
    startBtn.style.marginTop = '1rem';
    startBtn.textContent = '🏋️ Démarrer cette séance';
    startBtn.addEventListener('click', () => startPlannedSession(plan, exercises));
    out.appendChild(startBtn);
  }
  out.classList.remove('hidden');
  out.scrollIntoView({ behavior: 'smooth' });
}

$('#gen-workout-btn').addEventListener('click', async () => {
  try {
    showLoader('Génération de la séance…');
    const r = await api('/api/generate-workout', {
      method: 'POST',
      body: {
        focus: $('#workout-focus').value || null,
        duree_min: num($('#workout-duree').value),
      },
    });
    displayCoachOutput(`# ${r.titre}\n\n${r.contenu}`, r);
  } catch (err) { alert('Erreur : ' + err.message); }
  finally { hideLoader(); }
});

$('#gen-nutri-btn').addEventListener('click', async () => {
  try {
    showLoader('Génération du plan nutrition…');
    const r = await api('/api/generate-nutrition', {
      method: 'POST',
      body: {
        duree_jours: num($('#nutri-duree').value),
        calories_cible: num($('#nutri-cal').value),
      },
    });
    displayCoachOutput(`# ${r.titre}\n\n${r.contenu}`);
  } catch (err) { alert('Erreur : ' + err.message); }
  finally { hideLoader(); }
});

$('#chat-btn').addEventListener('click', async () => {
  const q = $('#chat-question').value.trim();
  if (!q) return;
  try {
    showLoader('Le coach formule sa réponse…');
    const r = await api('/api/coach-chat', { method: 'POST', body: { question: q } });
    displayCoachOutput(r.reponse);
  } catch (err) { alert('Erreur : ' + err.message); }
  finally { hideLoader(); }
});

// --- PLANS ---
let currentFilter = 'all';

// Extract a structured exercises block from a workout plan's markdown.
// Tolerant of how the LLM actually formatted it: tries the explicit
// coach-plan-json fence first, then any JSON-shaped code block with an
// "exercises" array, then a raw JSON object anywhere in the text.
// Returns { exercises, cleaned } — cleaned has the JSON portion + the
// "coach-plan-json" heading stripped so it's not displayed to the user.
function extractPlanJSON(markdown) {
  if (!markdown) return { exercises: null, cleaned: markdown };

  function tryParse(s) {
    try {
      const p = JSON.parse(s);
      return Array.isArray(p?.exercises) ? p.exercises : null;
    } catch { return null; }
  }

  // Always strip a stray "coach-plan-json" heading or label
  let cleaned = markdown
    .replace(/^\s*#{1,6}\s*coach-plan-json.*$/gim, '')
    .replace(/^\s*\*+coach-plan-json\*+\s*$/gim, '');

  // 1) Explicit fence ```coach-plan-json ... ```
  let re = /```coach-plan-json\s*([\s\S]*?)```/i;
  let m = cleaned.match(re);
  if (m) {
    const exs = tryParse(m[1].trim());
    if (exs) return { exercises: exs, cleaned: cleaned.replace(re, '').trim() };
  }

  // 2) Any fenced block (with or without lang) that parses to { exercises: [...] }
  re = /```(?:json|coach-plan-json)?\s*(\{[\s\S]*?"exercises"[\s\S]*?\})\s*```/gi;
  let match;
  while ((match = re.exec(cleaned)) !== null) {
    const exs = tryParse(match[1].trim());
    if (exs) {
      const stripped = cleaned.slice(0, match.index) + cleaned.slice(match.index + match[0].length);
      return { exercises: exs, cleaned: stripped.trim() };
    }
  }

  // 3) Raw JSON object containing "exercises" anywhere in the text
  const startIdx = cleaned.search(/\{\s*"exercises"/);
  if (startIdx >= 0) {
    // Find matching brace
    let depth = 0;
    for (let i = startIdx; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          const candidate = cleaned.slice(startIdx, i + 1);
          const exs = tryParse(candidate);
          if (exs) {
            const stripped = cleaned.slice(0, startIdx) + cleaned.slice(i + 1);
            return { exercises: exs, cleaned: stripped.trim() };
          }
          break;
        }
      }
    }
  }

  return { exercises: null, cleaned };
}

async function loadPlans() {
  const all = await api('/api/plans');
  const filtered = currentFilter === 'all' ? all : all.filter(p => p.type === currentFilter);
  const div = $('#plans-list');
  div.innerHTML = '';
  if (!filtered.length) {
    div.innerHTML = '<p class="empty">Aucun plan sauvegardé. Générez-en un depuis l\'onglet Coach IA.</p>';
    return;
  }
  for (const p of filtered) {
    const card = document.createElement('div');
    card.className = 'plan-card';
    const icon = p.type === 'template' ? '💪' : (p.type === 'workout' ? '🏋️' : '🥗');

    // Templates store a JSON {exercises:[...]} directly in `contenu`.
    // AI workouts have markdown with an embedded coach-plan-json block.
    let exercises = null, cleaned = p.contenu || '';
    if (p.type === 'template') {
      try {
        const parsed = JSON.parse(p.contenu || '{}');
        exercises = parsed.exercises || null;
        cleaned = exercises
          ? exercises.map(e => `- **${e.nom || ''}**${e.series ? ` — ${e.series} × ${e.repetitions ?? '?'}${e.charge_kg ? ` @ ${e.charge_kg} kg` : ''}` : ''}`).join('\n')
          : '*(modèle vide)*';
      } catch { cleaned = '*(modèle illisible)*'; }
    } else if (p.type === 'workout') {
      const r = extractPlanJSON(p.contenu || '');
      exercises = r.exercises;
      cleaned = r.cleaned;
    }

    const canStart = (p.type === 'workout' || p.type === 'template') && exercises && exercises.length;
    const startBtn = canStart ? `<button class="primary" data-start-p="${p.id}">🏋️ Démarrer cette séance</button>` : '';
    card.innerHTML = `
      <div class="plan-card-header">
        <div>
          <div class="plan-card-title">${icon} ${p.titre || '(sans titre)'}</div>
          <div class="plan-card-meta">${new Date(p.created_at).toLocaleString('fr-FR')}</div>
        </div>
        <div class="plan-card-actions">
          ${startBtn}
          <button class="danger" data-del-p="${p.id}">Supprimer</button>
        </div>
      </div>
      <div class="plan-card-body markdown">${marked.parse(cleaned)}</div>
    `;
    card.querySelector('.plan-card-header').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      card.classList.toggle('open');
    });
    card.querySelector('[data-del-p]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Supprimer ce plan ?')) return;
      await api(`/api/plans/${p.id}`, { method: 'DELETE' });
      loadPlans();
    });
    const startBtnEl = card.querySelector('[data-start-p]');
    if (startBtnEl) {
      startBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        startPlannedSession(p, exercises);
      });
    }
    div.appendChild(card);
  }
}

function startPlannedSession(plan, exercises) {
  // Warn if there's a non-empty in-progress draft
  const existing = $$('.exercise-card');
  const draftHasData = existing.some(c => readExerciseCard(c));
  if (draftHasData) {
    if (!confirm('Une séance est déjà en cours de saisie. Démarrer ce plan va la remplacer. Continuer ?')) return;
  }

  // Switch to the Entraînements tab
  const tabBtn = document.querySelector('.tab[data-tab="entrainements"]');
  if (tabBtn) tabBtn.click();

  // Reset form and pre-fill from plan
  const form = $('#workout-form');
  form.reset();
  form.date.value = new Date().toISOString().slice(0, 10);
  form.nom.value = plan.titre || 'Séance planifiée';
  $('#exercises-list').innerHTML = '';
  exerciseCounter = 0;
  for (const ex of exercises) addExerciseCard(ex);
  updateSessionSummary();
  saveWorkoutDraft();

  // Scroll to top of the form
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$$('.filter').forEach(b => {
  b.addEventListener('click', () => {
    $$('.filter').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentFilter = b.dataset.filter;
    loadPlans();
  });
});

// --- DATA BACKUP / RESTORE (per-user) ---
function backupKey() {
  return currentUser ? `coach-ia-backup-v2-${currentUser}` : 'coach-ia-backup-v2-anon';
}
function backupMetaKey() {
  return currentUser ? `coach-ia-backup-meta-v2-${currentUser}` : 'coach-ia-backup-meta-v2-anon';
}

async function fetchSnapshot() {
  return api('/api/export');
}

async function saveLocalSnapshot() {
  try {
    const snap = await fetchSnapshot();
    localStorage.setItem(backupKey(), JSON.stringify(snap));
    localStorage.setItem(backupMetaKey(), JSON.stringify({ at: new Date().toISOString(), username: currentUser }));
    // Once a per-user (v2) snapshot exists, drop the legacy v1 blob so it
    // can never bleed into a future account on this browser.
    localStorage.removeItem('coach-ia-backup-v1');
    localStorage.removeItem('coach-ia-backup-meta-v1');
    updateBackupInfo();
  } catch (e) { console.warn('Snapshot failed:', e); }
}

function getLocalSnapshot() {
  const raw = localStorage.getItem(backupKey());
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.username && currentUser && parsed.username !== currentUser) {
        // v2 backup belongs to another user — refuse
      } else {
        return parsed;
      }
    } catch {}
  }
  // Legacy v1 backup (pre-multi-user) — restore ONLY for the admin account.
  // The original single-user data could only have belonged to admin, so it
  // must never auto-load into a freshly created account.
  if (currentUser === 'admin') {
    const legacy = localStorage.getItem('coach-ia-backup-v1');
    if (legacy) {
      try { return JSON.parse(legacy); } catch {}
    }
  }
  return null;
}

function getLocalSnapshotMeta() {
  const raw = localStorage.getItem(backupMetaKey());
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function restoreFromLocal(silent = false) {
  const snap = getLocalSnapshot();
  if (!snap) {
    if (!silent) alert('Aucune sauvegarde locale disponible.');
    return false;
  }
  try {
    await api('/api/import', { method: 'POST', body: snap });
    if (!silent) alert('✓ Données restaurées depuis la copie locale.');
    return true;
  } catch (err) {
    if (!silent) alert('Erreur lors de la restauration : ' + err.message);
    return false;
  }
}

async function autoRestoreIfNeeded() {
  // If the server is empty but localStorage has data, restore silently.
  try {
    const stats = await api('/api/stats');
    const serverEmpty = !stats.has_profile && stats.measurements === 0 && stats.workouts === 0 && stats.plans === 0;
    const local = getLocalSnapshot();
    const localHasData = local && (local.profile || (local.measurements?.length) || (local.workouts?.length) || (local.plans?.length));
    if (serverEmpty && localHasData) {
      console.info('Serveur vide + sauvegarde locale détectée → restauration automatique');
      const ok = await restoreFromLocal(true);
      if (ok) showRestoredToast();
    }
  } catch (e) { console.warn('autoRestoreIfNeeded:', e); }
}

function showRestoredToast() {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = '✓ Données restaurées automatiquement depuis la sauvegarde locale';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function updateBackupInfo() {
  const el = $('#backup-info');
  if (!el) return;
  const meta = getLocalSnapshotMeta();
  if (meta) {
    el.textContent = `Dernière sauvegarde locale : ${new Date(meta.at).toLocaleString('fr-FR')}`;
  } else {
    el.textContent = 'Aucune sauvegarde locale enregistrée pour le moment.';
  }
}

async function updateDataStats() {
  const el = $('#data-stats');
  if (!el) return;
  try {
    const s = await api('/api/stats');
    el.textContent = `Profil : ${s.has_profile ? '✓' : '—'} · ${s.measurements} mesure(s) · ${s.workouts} séance(s) · ${s.plans} plan(s)`;
  } catch (e) { el.textContent = 'Impossible de lire les statistiques.'; }
}

// --- PWA: service worker + install prompt ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}

let deferredInstall;
const installBtn = document.createElement('button');
installBtn.id = 'install-btn';
installBtn.className = 'install-btn hidden';
installBtn.textContent = '📲 Installer';
installBtn.title = "Installer l'app sur l'écran d'accueil";
document.body.appendChild(installBtn);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  installBtn.classList.add('hidden');
});

window.addEventListener('appinstalled', () => {
  installBtn.classList.add('hidden');
});

// --- DATA TAB BUTTONS ---
function bind(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
}

bind('export-btn', async () => {
  try {
    const snap = await fetchSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coach-ia-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) { alert('Erreur export : ' + err.message); }
});

bind('import-btn', async () => {
  const file = $('#import-file').files[0];
  if (!file) { alert('Sélectionnez un fichier .json à importer.'); return; }
  if (!confirm('⚠️ L\'import remplace toutes les données actuelles. Continuer ?')) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await api('/api/import', { method: 'POST', body: data });
    alert('✓ Données importées avec succès.');
    await loadProfile(); await loadMeasurements(); await loadWorkouts();
    await saveLocalSnapshot();
    await updateDataStats();
  } catch (err) { alert('Erreur import : ' + err.message); }
});

bind('restore-local-btn', async () => {
  if (!confirm('Restaurer les données depuis la sauvegarde locale ? Les données actuelles du serveur seront remplacées.')) return;
  const ok = await restoreFromLocal(false);
  if (ok) {
    await loadProfile(); await loadMeasurements(); await loadWorkouts();
    await updateDataStats();
  }
});

bind('clear-local-btn', () => {
  if (!confirm('Effacer la copie locale ? Les données sur le serveur ne sont pas touchées.')) return;
  localStorage.removeItem(backupKey());
  localStorage.removeItem(backupMetaKey());
  updateBackupInfo();
  alert('Copie locale effacée.');
});

async function doLogout() {
  if (!confirm('Se déconnecter ? Vous devrez retaper vos identifiants au prochain accès.')) return;
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login.html';
  } catch (err) { alert('Erreur : ' + err.message); }
}
bind('logout-btn', doLogout);
bind('logout-link', doLogout);

bind('delete-account-btn', async () => {
  const who = currentUser || 'ce compte';
  if (!confirm(`⚠️ Supprimer définitivement le compte « ${who} » et toutes ses données ?\n\nCette action est IRRÉVERSIBLE. Toutes les séances, mesures, plans IA et le profil seront effacés.`)) return;
  const pw = prompt('Pour confirmer, tapez votre mot de passe :');
  if (!pw) return;
  try {
    const res = await fetch('/api/me', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm_password: pw }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('Erreur : ' + (err.error || res.statusText));
      return;
    }
    // Clear this account's local backup too
    localStorage.removeItem(backupKey());
    localStorage.removeItem(backupMetaKey());
    alert('Compte supprimé.');
    window.location.href = '/login.html';
  } catch (err) {
    alert('Erreur réseau : ' + err.message);
  }
});

const changePwForm = document.getElementById('change-password-form');
if (changePwForm) {
  changePwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(changePwForm));
    try {
      await api('/api/change-password', { method: 'POST', body: data });
      alert('✓ Mot de passe changé.');
      changePwForm.reset();
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
  });
}

// --- INIT ---
(async function init() {
  const today = new Date().toISOString().slice(0, 10);
  $('#measure-form input[name=date]').value = today;
  $('#workout-form input[name=date]').value = today;

  await checkHealth();
  await autoRestoreIfNeeded();
  await loadProfile();
  await loadMeasurements();
  await loadWorkouts();
  maybeShowReminders();
  ensureDragListeners();
  renderPlateResult();

  // Now that currentUser is known, restore any in-progress workout draft.
  // If none, start with a fresh empty exercise card as before.
  const restored = restoreWorkoutDraft();
  if (!restored) addExerciseCard();
  // Take an initial snapshot if server has data and we have no local backup
  if (!getLocalSnapshot()) {
    try {
      const s = await api('/api/stats');
      if (s.has_profile || s.measurements > 0 || s.workouts > 0) {
        await saveLocalSnapshot();
      }
    } catch (_) {}
  }
})();
