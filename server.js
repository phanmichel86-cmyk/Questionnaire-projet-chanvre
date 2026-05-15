import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const db = new Database(path.join(__dirname, 'data', 'coach.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nom TEXT,
    age INTEGER,
    sexe TEXT,
    taille_cm REAL,
    niveau TEXT,
    objectif TEXT,
    frequence_hebdo INTEGER,
    lieu TEXT,
    equipement TEXT,
    contraintes TEXT,
    preferences_alim TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Migration for existing DBs created before the lieu column
  -- (SQLite ignores the ADD COLUMN if it would error; wrap in try/catch in JS)

  CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    poids_kg REAL,
    pct_muscle REAL,
    pct_graisse REAL,
    tour_taille_cm REAL,
    tour_hanches_cm REAL,
    tour_bras_cm REAL,
    tour_cuisse_cm REAL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    nom TEXT,
    duree_min INTEGER,
    ressenti INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    series INTEGER,
    repetitions TEXT,
    charge_kg REAL,
    repos_sec INTEGER,
    notes TEXT,
    FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
  );
`);

try { db.exec('ALTER TABLE profile ADD COLUMN lieu TEXT'); } catch (_) { /* column already exists */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    titre TEXT,
    contenu TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Provider priority: explicit choice via LLM_PROVIDER, else Anthropic if set, else Groq.
function pickProvider() {
  const choice = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (choice === 'anthropic' && anthropic) return 'anthropic';
  if (choice === 'groq' && groq) return 'groq';
  if (anthropic) return 'anthropic';
  if (groq) return 'groq';
  return null;
}

const ANTHROPIC_MODEL = 'claude-opus-4-7';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function getProfile() {
  return db.prepare('SELECT * FROM profile WHERE id = 1').get();
}

function getRecentMeasurements(limit = 10) {
  return db.prepare('SELECT * FROM measurements ORDER BY date DESC, id DESC LIMIT ?').all(limit);
}

function getRecentWorkouts(limit = 10) {
  const workouts = db.prepare('SELECT * FROM workouts ORDER BY date DESC, id DESC LIMIT ?').all(limit);
  const exStmt = db.prepare('SELECT * FROM exercises WHERE workout_id = ?');
  return workouts.map(w => ({ ...w, exercises: exStmt.all(w.id) }));
}

function buildContextSummary() {
  const profile = getProfile();
  const measurements = getRecentMeasurements(8);
  const workouts = getRecentWorkouts(8);
  return { profile, measurements, workouts };
}

app.get('/api/profile', (req, res) => {
  res.json(getProfile() || null);
});

app.post('/api/profile', (req, res) => {
  const p = req.body || {};
  db.prepare(`
    INSERT INTO profile (id, nom, age, sexe, taille_cm, niveau, objectif, frequence_hebdo, lieu, equipement, contraintes, preferences_alim, updated_at)
    VALUES (1, @nom, @age, @sexe, @taille_cm, @niveau, @objectif, @frequence_hebdo, @lieu, @equipement, @contraintes, @preferences_alim, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      nom=@nom, age=@age, sexe=@sexe, taille_cm=@taille_cm, niveau=@niveau,
      objectif=@objectif, frequence_hebdo=@frequence_hebdo, lieu=@lieu, equipement=@equipement,
      contraintes=@contraintes, preferences_alim=@preferences_alim,
      updated_at=CURRENT_TIMESTAMP
  `).run({
    nom: p.nom ?? null,
    age: p.age ?? null,
    sexe: p.sexe ?? null,
    taille_cm: p.taille_cm ?? null,
    niveau: p.niveau ?? null,
    objectif: p.objectif ?? null,
    frequence_hebdo: p.frequence_hebdo ?? null,
    lieu: p.lieu ?? null,
    equipement: p.equipement ?? null,
    contraintes: p.contraintes ?? null,
    preferences_alim: p.preferences_alim ?? null,
  });
  res.json(getProfile());
});

app.get('/api/measurements', (req, res) => {
  res.json(db.prepare('SELECT * FROM measurements ORDER BY date ASC, id ASC').all());
});

app.post('/api/measurements', (req, res) => {
  const m = req.body || {};
  const info = db.prepare(`
    INSERT INTO measurements (date, poids_kg, pct_muscle, pct_graisse, tour_taille_cm, tour_hanches_cm, tour_bras_cm, tour_cuisse_cm, notes)
    VALUES (@date, @poids_kg, @pct_muscle, @pct_graisse, @tour_taille_cm, @tour_hanches_cm, @tour_bras_cm, @tour_cuisse_cm, @notes)
  `).run({
    date: m.date || new Date().toISOString().slice(0, 10),
    poids_kg: m.poids_kg ?? null,
    pct_muscle: m.pct_muscle ?? null,
    pct_graisse: m.pct_graisse ?? null,
    tour_taille_cm: m.tour_taille_cm ?? null,
    tour_hanches_cm: m.tour_hanches_cm ?? null,
    tour_bras_cm: m.tour_bras_cm ?? null,
    tour_cuisse_cm: m.tour_cuisse_cm ?? null,
    notes: m.notes ?? null,
  });
  res.json(db.prepare('SELECT * FROM measurements WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/measurements/:id', (req, res) => {
  db.prepare('DELETE FROM measurements WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/workouts', (req, res) => {
  res.json(getRecentWorkouts(50));
});

app.post('/api/workouts', (req, res) => {
  const w = req.body || {};
  const exercises = Array.isArray(w.exercises) ? w.exercises : [];

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO workouts (date, nom, duree_min, ressenti, notes)
      VALUES (@date, @nom, @duree_min, @ressenti, @notes)
    `).run({
      date: w.date || new Date().toISOString().slice(0, 10),
      nom: w.nom ?? null,
      duree_min: w.duree_min ?? null,
      ressenti: w.ressenti ?? null,
      notes: w.notes ?? null,
    });
    const workoutId = info.lastInsertRowid;
    const exStmt = db.prepare(`
      INSERT INTO exercises (workout_id, nom, series, repetitions, charge_kg, repos_sec, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of exercises) {
      exStmt.run(
        workoutId,
        e.nom ?? '',
        e.series ?? null,
        e.repetitions ?? null,
        e.charge_kg ?? null,
        e.repos_sec ?? null,
        e.notes ?? null,
      );
    }
    return workoutId;
  });

  const id = tx();
  const workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id);
  workout.exercises = db.prepare('SELECT * FROM exercises WHERE workout_id = ?').all(id);
  res.json(workout);
});

app.delete('/api/workouts/:id', (req, res) => {
  db.prepare('DELETE FROM workouts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/plans', (req, res) => {
  const type = req.query.type;
  if (type) {
    res.json(db.prepare('SELECT * FROM plans WHERE type = ? ORDER BY created_at DESC').all(type));
  } else {
    res.json(db.prepare('SELECT * FROM plans ORDER BY created_at DESC').all());
  }
});

app.delete('/api/plans/:id', (req, res) => {
  db.prepare('DELETE FROM plans WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function requireLLM(res) {
  if (!pickProvider()) {
    res.status(503).json({
      error: 'Aucune clé API IA configurée. Définissez GROQ_API_KEY (gratuit, recommandé) ou ANTHROPIC_API_KEY dans les variables d\'environnement.',
    });
    return false;
  }
  return true;
}

async function callClaude(systemPrompt, userPrompt) {
  const stream = anthropic.messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const message = await stream.finalMessage();
  const textBlock = message.content.find(b => b.type === 'text');
  return textBlock?.text ?? '';
}

async function callGroq(systemPrompt, userPrompt) {
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: 8192,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? '';
}

async function callLLM(systemPrompt, userPrompt) {
  const provider = pickProvider();
  if (provider === 'anthropic') return callClaude(systemPrompt, userPrompt);
  if (provider === 'groq') return callGroq(systemPrompt, userPrompt);
  throw new Error('Aucun fournisseur IA configuré');
}

const ENVIRONMENT_NOTES = {
  basic_fit: `L'utilisateur s'entraîne en salle Basic Fit. Équipement disponible :
- Machines guidées Matrix (chest press, shoulder press, lat pulldown, vertical row / seated row, leg press, leg curl, leg extension, hip abduction/adduction, abdo crunch, hyperextension)
- Poids libres : haltères jusqu'à ~40 kg, barres olympiques + disques, barres EZ, kettlebells
- Bancs réglables, racks à squat / Smith machine, poulies vis-à-vis (functional trainer)
- Cardio : tapis, vélos, rameurs, elliptiques
Propose des exercices réellement exécutables sur cet équipement. Privilégie les machines Matrix quand pertinent pour la sécurité (débutants, charges lourdes en isolation), et les poids libres pour les mouvements polyarticulaires.`,
  salle_complete: `Salle de sport complète : tout l'équipement standard est disponible.`,
  maison_complet: `Entraînement à la maison avec banc, barre olympique, haltères et rack. Cible des exercices polyarticulaires aux poids libres.`,
  maison_leger: `Entraînement à la maison avec seulement haltères et/ou élastiques. Évite les exercices qui exigent un rack ou des charges lourdes ; mise sur les tempos, les supersets et le volume.`,
  poids_corps: `Entraînement au poids du corps uniquement. Pas de matériel. Mise sur les progressions (calisthénie), tempos lents, unilatéral, ploys.`,
};

const COACH_SYSTEM = `Tu es un coach sportif et nutritionniste expert, bienveillant et pédagogue.
Tu personnalises chaque conseil en t'appuyant strictement sur les données fournies (profil, mesures, historique d'entraînement).
Tu adaptes la difficulté à la progression et aux contraintes de l'utilisateur.
Tu ne proposes que des exercices réellement exécutables avec l'équipement décrit dans le profil.
Tu donnes des conseils sûrs : tu mentionnes les précautions, les échauffements, et tu rappelles qu'un avis médical est recommandé en cas de pathologie.
Tu réponds en français, de manière structurée avec des titres en markdown.`;

function environmentBlock(profile) {
  if (!profile) return '';
  const note = ENVIRONMENT_NOTES[profile.lieu];
  if (!note) return '';
  return `\n## Environnement d'entraînement\n${note}\n`;
}

app.post('/api/generate-workout', async (req, res) => {
  if (!requireLLM(res)) return;
  try {
    const ctx = buildContextSummary();
    const focus = req.body?.focus || 'séance équilibrée adaptée à mes objectifs';
    const duree = req.body?.duree_min || 45;

    const userPrompt = `Génère une séance d'entraînement personnalisée.

# Contexte
## Profil
${JSON.stringify(ctx.profile, null, 2)}
${environmentBlock(ctx.profile)}
## Mesures récentes (chronologique inverse)
${JSON.stringify(ctx.measurements, null, 2)}

## Entraînements récents
${JSON.stringify(ctx.workouts, null, 2)}

# Demande
- Focus : ${focus}
- Durée cible : ${duree} minutes
- Analyse ma progression et adapte la difficulté en conséquence
- Si possible, varie les exercices par rapport aux séances récentes
- Structure : Échauffement → Bloc principal (exercices avec séries × reps × charge ou tempo, repos) → Retour au calme
- Conclus par 2-3 indicateurs de progression à suivre pour la prochaine séance`;

    const text = await callLLM(COACH_SYSTEM, userPrompt);
    const titre = `Séance — ${new Date().toLocaleDateString('fr-FR')} (${focus})`;
    const info = db.prepare(
      'INSERT INTO plans (type, titre, contenu) VALUES (?, ?, ?)'
    ).run('workout', titre, text);
    res.json({ id: info.lastInsertRowid, titre, contenu: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-nutrition', async (req, res) => {
  if (!requireLLM(res)) return;
  try {
    const ctx = buildContextSummary();
    const duree = req.body?.duree_jours || 7;
    const calories_cible = req.body?.calories_cible || null;

    const userPrompt = `Génère un plan nutrition personnalisé.

# Contexte
## Profil
${JSON.stringify(ctx.profile, null, 2)}

## Mesures récentes
${JSON.stringify(ctx.measurements, null, 2)}

## Entraînements récents (pour ajuster les apports les jours d'entraînement)
${JSON.stringify(ctx.workouts, null, 2)}

# Demande
- Durée du plan : ${duree} jours
- Calories cible : ${calories_cible ? `${calories_cible} kcal/jour` : 'à calculer selon le profil et l\'objectif'}
- Calcule besoins (BMR + dépense + objectif) et propose une cible journalière macros (protéines/glucides/lipides en g)
- Donne un exemple type de répartition repas (petit-déjeuner, déjeuner, collation, dîner)
- Prévois 2-3 variantes par repas pour éviter la monotonie
- Adapte les apports aux jours d'entraînement vs jours de repos
- Inclus une liste de courses synthétique en fin de plan`;

    const text = await callLLM(COACH_SYSTEM, userPrompt);
    const titre = `Plan nutrition — ${new Date().toLocaleDateString('fr-FR')} (${duree}j)`;
    const info = db.prepare(
      'INSERT INTO plans (type, titre, contenu) VALUES (?, ?, ?)'
    ).run('nutrition', titre, text);
    res.json({ id: info.lastInsertRowid, titre, contenu: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coach-chat', async (req, res) => {
  if (!requireLLM(res)) return;
  try {
    const question = req.body?.question;
    if (!question) return res.status(400).json({ error: 'Question manquante' });

    const ctx = buildContextSummary();
    const userPrompt = `# Contexte de l'utilisateur
## Profil
${JSON.stringify(ctx.profile, null, 2)}
${environmentBlock(ctx.profile)}
## Mesures récentes
${JSON.stringify(ctx.measurements, null, 2)}

## Entraînements récents
${JSON.stringify(ctx.workouts, null, 2)}

# Question
${question}`;

    const text = await callLLM(COACH_SYSTEM, userPrompt);
    res.json({ reponse: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/progress-analysis', async (req, res) => {
  if (!requireLLM(res)) return;
  try {
    const ctx = buildContextSummary();
    const userPrompt = `Analyse en profondeur ma progression à partir de mes données.

# Données
## Profil
${JSON.stringify(ctx.profile, null, 2)}
${environmentBlock(ctx.profile)}
## Mesures (chronologique)
${JSON.stringify(ctx.measurements, null, 2)}

## Entraînements récents
${JSON.stringify(ctx.workouts, null, 2)}

# Demande
- Identifie les tendances (poids, % muscle, % graisse, tours)
- Évalue la cohérence avec mon objectif déclaré
- Pointe les points forts et les points à corriger
- Propose 3 ajustements concrets (entraînement et nutrition) pour les 2 prochaines semaines
- Sois honnête : si les données sont insuffisantes, dis-le et explique ce qu'il faut suivre`;

    const text = await callLLM(COACH_SYSTEM, userPrompt);
    res.json({ analyse: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Export / Import ---
app.get('/api/export', (req, res) => {
  const profile = getProfile();
  const measurements = db.prepare('SELECT * FROM measurements ORDER BY id ASC').all();
  const workouts = db.prepare('SELECT * FROM workouts ORDER BY id ASC').all();
  const exercises = db.prepare('SELECT * FROM exercises ORDER BY id ASC').all();
  const plans = db.prepare('SELECT * FROM plans ORDER BY id ASC').all();
  res.json({
    version: 1,
    exported_at: new Date().toISOString(),
    profile,
    measurements,
    workouts,
    exercises,
    plans,
  });
});

app.post('/api/import', (req, res) => {
  const data = req.body || {};
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Format invalide' });
  }

  const tx = db.transaction(() => {
    // Wipe — full replace semantics
    db.prepare('DELETE FROM exercises').run();
    db.prepare('DELETE FROM workouts').run();
    db.prepare('DELETE FROM measurements').run();
    db.prepare('DELETE FROM plans').run();
    db.prepare('DELETE FROM profile').run();

    if (data.profile && typeof data.profile === 'object') {
      const p = data.profile;
      db.prepare(`
        INSERT INTO profile (id, nom, age, sexe, taille_cm, niveau, objectif, frequence_hebdo, lieu, equipement, contraintes, preferences_alim, updated_at)
        VALUES (1, @nom, @age, @sexe, @taille_cm, @niveau, @objectif, @frequence_hebdo, @lieu, @equipement, @contraintes, @preferences_alim, CURRENT_TIMESTAMP)
      `).run({
        nom: p.nom ?? null,
        age: p.age ?? null,
        sexe: p.sexe ?? null,
        taille_cm: p.taille_cm ?? null,
        niveau: p.niveau ?? null,
        objectif: p.objectif ?? null,
        frequence_hebdo: p.frequence_hebdo ?? null,
        lieu: p.lieu ?? null,
        equipement: p.equipement ?? null,
        contraintes: p.contraintes ?? null,
        preferences_alim: p.preferences_alim ?? null,
      });
    }

    const insMeasure = db.prepare(`
      INSERT INTO measurements (id, date, poids_kg, pct_muscle, pct_graisse, tour_taille_cm, tour_hanches_cm, tour_bras_cm, tour_cuisse_cm, notes, created_at)
      VALUES (@id, @date, @poids_kg, @pct_muscle, @pct_graisse, @tour_taille_cm, @tour_hanches_cm, @tour_bras_cm, @tour_cuisse_cm, @notes, COALESCE(@created_at, CURRENT_TIMESTAMP))
    `);
    for (const m of (data.measurements || [])) {
      insMeasure.run({
        id: m.id ?? null,
        date: m.date,
        poids_kg: m.poids_kg ?? null,
        pct_muscle: m.pct_muscle ?? null,
        pct_graisse: m.pct_graisse ?? null,
        tour_taille_cm: m.tour_taille_cm ?? null,
        tour_hanches_cm: m.tour_hanches_cm ?? null,
        tour_bras_cm: m.tour_bras_cm ?? null,
        tour_cuisse_cm: m.tour_cuisse_cm ?? null,
        notes: m.notes ?? null,
        created_at: m.created_at ?? null,
      });
    }

    const insWorkout = db.prepare(`
      INSERT INTO workouts (id, date, nom, duree_min, ressenti, notes, created_at)
      VALUES (@id, @date, @nom, @duree_min, @ressenti, @notes, COALESCE(@created_at, CURRENT_TIMESTAMP))
    `);
    for (const w of (data.workouts || [])) {
      insWorkout.run({
        id: w.id ?? null,
        date: w.date,
        nom: w.nom ?? null,
        duree_min: w.duree_min ?? null,
        ressenti: w.ressenti ?? null,
        notes: w.notes ?? null,
        created_at: w.created_at ?? null,
      });
    }

    const insExercise = db.prepare(`
      INSERT INTO exercises (id, workout_id, nom, series, repetitions, charge_kg, repos_sec, notes)
      VALUES (@id, @workout_id, @nom, @series, @repetitions, @charge_kg, @repos_sec, @notes)
    `);
    for (const e of (data.exercises || [])) {
      insExercise.run({
        id: e.id ?? null,
        workout_id: e.workout_id,
        nom: e.nom ?? '',
        series: e.series ?? null,
        repetitions: e.repetitions ?? null,
        charge_kg: e.charge_kg ?? null,
        repos_sec: e.repos_sec ?? null,
        notes: e.notes ?? null,
      });
    }

    const insPlan = db.prepare(`
      INSERT INTO plans (id, type, titre, contenu, created_at)
      VALUES (@id, @type, @titre, @contenu, COALESCE(@created_at, CURRENT_TIMESTAMP))
    `);
    for (const pl of (data.plans || [])) {
      insPlan.run({
        id: pl.id ?? null,
        type: pl.type,
        titre: pl.titre ?? null,
        contenu: pl.contenu,
        created_at: pl.created_at ?? null,
      });
    }
  });

  try {
    tx();
    res.json({ ok: true, imported_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  res.json({
    measurements: db.prepare('SELECT COUNT(*) as n FROM measurements').get().n,
    workouts: db.prepare('SELECT COUNT(*) as n FROM workouts').get().n,
    plans: db.prepare('SELECT COUNT(*) as n FROM plans').get().n,
    has_profile: !!getProfile(),
  });
});

app.get('/api/health', (req, res) => {
  const provider = pickProvider();
  res.json({
    ok: true,
    provider,
    anthropic_configured: !!anthropic,
    groq_configured: !!groq,
    model: provider === 'anthropic' ? ANTHROPIC_MODEL : provider === 'groq' ? GROQ_MODEL : null,
  });
});

app.listen(PORT, () => {
  const provider = pickProvider();
  console.log(`Coach sportif IA en écoute sur http://localhost:${PORT}`);
  if (provider) {
    console.log(`IA active : ${provider} (${provider === 'anthropic' ? ANTHROPIC_MODEL : GROQ_MODEL})`);
  } else {
    console.warn('Aucune clé API IA configurée — définissez GROQ_API_KEY (gratuit) ou ANTHROPIC_API_KEY.');
  }
});
