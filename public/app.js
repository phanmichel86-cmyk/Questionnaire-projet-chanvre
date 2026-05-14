const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const loader = $('#loader');
const loaderText = $('#loader-text');
function showLoader(text = 'Le coach réfléchit…') {
  loaderText.textContent = text;
  loader.classList.remove('hidden');
}
function hideLoader() { loader.classList.add('hidden'); }

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
  return res.json();
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
  });
});

// --- HEALTH CHECK ---
async function checkHealth() {
  try {
    const h = await api('/api/health');
    if (!h.anthropic_configured) {
      const banner = $('#health-banner');
      banner.textContent = '⚠️ Clé API Anthropic non configurée. Définissez ANTHROPIC_API_KEY dans .env pour activer le coach IA.';
      banner.classList.remove('hidden');
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
function addExerciseRow(data = {}) {
  const list = $('#exercises-list');
  const row = document.createElement('div');
  row.className = 'exercise-row';
  row.innerHTML = `
    <label>Nom <input name="ex_nom" type="text" placeholder="Ex: Squat" value="${data.nom ?? ''}" /></label>
    <label>Séries <input name="ex_series" type="number" min="1" value="${data.series ?? ''}" /></label>
    <label>Répétitions <input name="ex_reps" type="text" placeholder="10 ou 8-12" value="${data.repetitions ?? ''}" /></label>
    <label>Charge (kg) <input name="ex_charge" type="number" step="0.5" value="${data.charge_kg ?? ''}" /></label>
    <label>Repos (s) <input name="ex_repos" type="number" min="0" value="${data.repos_sec ?? ''}" /></label>
    <button type="button" class="danger" data-remove>×</button>
  `;
  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

$('#add-exercise').addEventListener('click', () => addExerciseRow());

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
      if (e.series && e.repetitions) parts.push(`${e.series}×${e.repetitions}`);
      if (e.charge_kg) parts.push(`${e.charge_kg}kg`);
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
  const data = {
    date: form.date.value,
    nom: form.nom.value || null,
    duree_min: num(form.duree_min.value),
    ressenti: num(form.ressenti.value),
    notes: form.notes.value || null,
    exercises: $$('.exercise-row').map(row => ({
      nom: row.querySelector('[name=ex_nom]').value,
      series: num(row.querySelector('[name=ex_series]').value),
      repetitions: row.querySelector('[name=ex_reps]').value || null,
      charge_kg: num(row.querySelector('[name=ex_charge]').value),
      repos_sec: num(row.querySelector('[name=ex_repos]').value),
    })).filter(ex => ex.nom),
  };
  try {
    await api('/api/workouts', { method: 'POST', body: data });
    form.reset();
    form.date.value = new Date().toISOString().slice(0, 10);
    $('#exercises-list').innerHTML = '';
    addExerciseRow();
    loadWorkouts();
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

// --- INIT ---
(async function init() {
  const today = new Date().toISOString().slice(0, 10);
  $('#measure-form input[name=date]').value = today;
  $('#workout-form input[name=date]').value = today;
  addExerciseRow();

  await checkHealth();
  await loadProfile();
  await loadMeasurements();
  await loadWorkouts();
})();
