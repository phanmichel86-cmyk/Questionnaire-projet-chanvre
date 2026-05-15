const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
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
    if (btn.dataset.tab === 'progression') renderCharts();
    if (btn.dataset.tab === 'plans') loadPlans();
    if (btn.dataset.tab === 'mesures') loadMeasurements();
    if (btn.dataset.tab === 'entrainements') loadWorkouts();
    if (btn.dataset.tab === 'donnees') { updateDataStats(); updateBackupInfo(); }
  });
});

// --- HEALTH CHECK ---
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
  } catch (e) { console.error(e); }
}

// --- PROFILE ---
async function loadProfile() {
  const p = await api('/api/profile');
  if (!p) return;
  const form = $('#profile-form');
  for (const [key, val] of Object.entries(p)) {
    const input = form.elements[key];
    if (input && val != null) input.value = val;
  }
}

$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = formDataToObject(e.target);
  data.age = num(data.age);
  data.taille_cm = num(data.taille_cm);
  data.frequence_hebdo = num(data.frequence_hebdo);
  try {
    await api('/api/profile', { method: 'POST', body: data });
    const s = $('#profile-status');
    s.textContent = '✓ Profil enregistré';
    setTimeout(() => { s.textContent = ''; }, 2500);
  } catch (err) { alert('Erreur : ' + err.message); }
});

// --- MEASUREMENTS ---
async function loadMeasurements() {
  const list = await api('/api/measurements');
  const tbody = $('#measure-table tbody');
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty">Aucune mesure pour le moment.</td></tr>';
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
      <td>${m.tour_bras_cm ?? '—'}</td>
      <td>${m.tour_cuisse_cm ?? '—'}</td>
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
  for (const k of ['poids_kg', 'pct_muscle', 'pct_graisse', 'tour_taille_cm', 'tour_hanches_cm', 'tour_bras_cm', 'tour_cuisse_cm']) {
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

      <div class="variable-toggle-wrap">
        <label class="checkbox-row">
          <input type="checkbox" class="variable-toggle" /> Charges variables par série (drop-set, pyramide…)
        </label>
      </div>

      <div class="exercise-uniform">
        <label>Séries <input class="series" type="number" min="1" value="${data.series ?? ''}" /></label>
        <label>Reps <input class="reps" type="text" placeholder="10 ou 8-12" value="${data.repetitions ?? ''}" /></label>
        <label>Charge (kg) <input class="charge" type="number" step="0.5" value="${data.charge_kg ?? ''}" /></label>
        <label>Repos (s) <input class="repos" type="number" min="0" value="${data.repos_sec ?? ''}" /></label>
      </div>

      <div class="exercise-variable hidden">
        <div class="series-detail-list"></div>
        <button type="button" class="secondary add-series-btn">+ Ajouter une série</button>
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

  muscleSel.addEventListener('change', () => { refreshExerciseList(); updateSessionSummary(); });
  equipSel.addEventListener('change', () => { refreshExerciseList(); updateSessionSummary(); });
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

  addSeriesBtn.addEventListener('click', () => addSeriesDetailRow());

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
  card.querySelectorAll('.series, .reps, .charge').forEach(i => i.addEventListener('input', updateSessionSummary));

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
  updateName();
  updateSessionSummary();
}

function readExerciseCard(card) {
  const customName = card.querySelector('.custom-name').value.trim();
  const selectedName = card.querySelector('.exercise-select').value;
  const nom = customName || selectedName;
  if (!nom) return null;

  const groupe_musculaire = card.querySelector('.muscle-select').value || null;
  const type_equipement = card.querySelector('.equipment-select').value || null;
  const notes = card.querySelector('.notes').value || null;
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
  };
}

function computeSessionStats() {
  const cards = $$('.exercise-card');
  let nbExercices = 0;
  let totalSeries = 0;
  let totalReps = 0;
  let tonnage = 0;

  for (const card of cards) {
    const ex = readExerciseCard(card);
    if (!ex) continue;
    nbExercices++;

    if (ex.series_details && ex.series_details.length) {
      for (const s of ex.series_details) {
        totalSeries += 1;
        totalReps += s.reps || 0;
        tonnage += (s.reps || 0) * (s.charge || 0);
      }
    } else {
      const series = ex.series || 0;
      // For "10-12" pick midpoint, for "10" pick 10
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

  return { nbExercices, totalSeries, totalReps, tonnage };
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
  $('#sum-exercices').textContent = stats.nbExercices;
  $('#sum-series').textContent = stats.totalSeries;
  $('#sum-reps').textContent = Math.round(stats.totalReps);
  $('#sum-tonnage').textContent = `${Math.round(stats.tonnage)} kg`;

  const dureeInput = $('#workout-form [name=duree_min]');
  const ressentiInput = $('#workout-form [name=ressenti]');
  const duree = dureeInput ? num(dureeInput.value) : null;
  const ressenti = ressentiInput ? num(ressentiInput.value) : null;
  const bw = await getBodyweight();
  const kcal = estimateKcal(duree, ressenti, bw);

  const kcalEl = $('#sum-kcal');
  const hintEl = $('#sum-hint');
  if (kcal) {
    const kj = Math.round(kcal * 4.184);
    kcalEl.textContent = `${kcal} kcal (~${kj} kJ)`;
    const bits = [];
    bits.push(`durée ${duree} min`);
    if (ressenti) bits.push(`ressenti ${ressenti}/10`);
    bits.push(bw ? `poids ${bw} kg` : `poids supposé 75 kg`);
    hintEl.textContent = 'Basé sur : ' + bits.join(' · ');
  } else {
    kcalEl.textContent = '— kcal';
    hintEl.textContent = 'Renseignez la durée de la séance pour estimer l\'énergie.';
  }
}

$('#add-exercise').addEventListener('click', () => addExerciseCard());
// Recompute on duree/ressenti change
['duree_min', 'ressenti'].forEach(name => {
  const el = document.querySelector(`#workout-form [name=${name}]`);
  if (el) el.addEventListener('input', updateSessionSummary);
});

async function loadWorkouts() {
  const list = await api('/api/workouts');
  const div = $('#workouts-list');
  div.innerHTML = '';
  if (!list.length) {
    div.innerHTML = '<p class="empty">Aucune séance enregistrée.</p>';
    return;
  }
  for (const w of list) {
    const card = document.createElement('div');
    card.className = 'workout-card';
    const pills = (w.exercises || []).map(e => {
      const parts = [e.nom];
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
      return `<span class="exercise-pill">${parts.join(' ')}</span>`;
    }).join('');
    card.innerHTML = `
      <div class="workout-card-header">
        <div>
          <div class="workout-card-title">${w.nom ?? 'Séance'}</div>
          <div class="workout-card-date">${w.date} · ${w.duree_min ?? '?'} min · Ressenti ${w.ressenti ?? '—'}/10</div>
        </div>
        <button class="danger" data-del-w="${w.id}">Suppr.</button>
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
}

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

// --- CHARTS ---
let chartBody, chartTours, chartWorkouts;

async function renderCharts() {
  const measurements = await api('/api/measurements');
  const workouts = await api('/api/workouts');

  const labels = measurements.map(m => m.date);

  const dsBody = [
    { label: 'Poids (kg)', data: measurements.map(m => m.poids_kg), borderColor: '#2f81f7', backgroundColor: 'transparent', spanGaps: true },
    { label: '% muscle', data: measurements.map(m => m.pct_muscle), borderColor: '#3fb950', backgroundColor: 'transparent', spanGaps: true },
    { label: '% graisse', data: measurements.map(m => m.pct_graisse), borderColor: '#d29922', backgroundColor: 'transparent', spanGaps: true },
  ];

  const dsTours = [
    { label: 'Taille', data: measurements.map(m => m.tour_taille_cm), borderColor: '#2f81f7', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Hanches', data: measurements.map(m => m.tour_hanches_cm), borderColor: '#a371f7', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Bras', data: measurements.map(m => m.tour_bras_cm), borderColor: '#3fb950', backgroundColor: 'transparent', spanGaps: true },
    { label: 'Cuisse', data: measurements.map(m => m.tour_cuisse_cm), borderColor: '#d29922', backgroundColor: 'transparent', spanGaps: true },
  ];

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
async function displayCoachOutput(text) {
  const out = $('#coach-output');
  out.innerHTML = marked.parse(text);
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
    displayCoachOutput(`# ${r.titre}\n\n${r.contenu}`);
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
    const icon = p.type === 'workout' ? '🏋️' : '🥗';
    card.innerHTML = `
      <div class="plan-card-header">
        <div>
          <div class="plan-card-title">${icon} ${p.titre || '(sans titre)'}</div>
          <div class="plan-card-meta">${new Date(p.created_at).toLocaleString('fr-FR')}</div>
        </div>
        <div class="plan-card-actions">
          <button class="danger" data-del-p="${p.id}">Supprimer</button>
        </div>
      </div>
      <div class="plan-card-body markdown">${marked.parse(p.contenu)}</div>
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
    div.appendChild(card);
  }
}

$$('.filter').forEach(b => {
  b.addEventListener('click', () => {
    $$('.filter').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentFilter = b.dataset.filter;
    loadPlans();
  });
});

// --- DATA BACKUP / RESTORE ---
const BACKUP_KEY = 'coach-ia-backup-v1';
const BACKUP_META_KEY = 'coach-ia-backup-meta-v1';

async function fetchSnapshot() {
  return api('/api/export');
}

async function saveLocalSnapshot() {
  try {
    const snap = await fetchSnapshot();
    localStorage.setItem(BACKUP_KEY, JSON.stringify(snap));
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify({ at: new Date().toISOString() }));
    updateBackupInfo();
  } catch (e) { console.warn('Snapshot failed:', e); }
}

function getLocalSnapshot() {
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function getLocalSnapshotMeta() {
  const raw = localStorage.getItem(BACKUP_META_KEY);
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
  localStorage.removeItem(BACKUP_KEY);
  localStorage.removeItem(BACKUP_META_KEY);
  updateBackupInfo();
  alert('Copie locale effacée.');
});

// --- INIT ---
(async function init() {
  const today = new Date().toISOString().slice(0, 10);
  $('#measure-form input[name=date]').value = today;
  $('#workout-form input[name=date]').value = today;
  addExerciseCard();

  await checkHealth();
  await autoRestoreIfNeeded();
  await loadProfile();
  await loadMeasurements();
  await loadWorkouts();
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
