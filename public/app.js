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
  addExerciseRow();

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
