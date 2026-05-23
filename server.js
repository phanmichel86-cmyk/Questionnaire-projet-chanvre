import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Energy / macros calculation — kept in sync with public/energy-profile.js
const ACTIVITY_FACTORS = { sedentaire: 1.2, leger: 1.375, modere: 1.55, actif: 1.725, tres_actif: 1.9 };
const ACTIVITY_LABELS = { sedentaire: 'Sédentaire', leger: 'Léger', modere: 'Modéré', actif: 'Actif', tres_actif: 'Très actif' };
const GOAL_ADJUSTMENTS = { perte_graisse: -400, prise_masse: 300, hypertrophie: 200, force: 100, endurance: 0, maintien: 0 };
const GOAL_LABELS = { perte_graisse: 'Perte de graisse', prise_masse: 'Prise de masse', hypertrophie: 'Hypertrophie', force: 'Force', endurance: 'Endurance', maintien: 'Maintien' };

function levelFromFrequency(freq) {
  if (!freq || freq <= 1) return 'sedentaire';
  if (freq <= 3) return 'leger';
  if (freq <= 5) return 'modere';
  if (freq <= 6) return 'actif';
  return 'tres_actif';
}
function classifyGoal(text) {
  const s = (text || '').toLowerCase();
  if (/perd|sèche|sech|maigr|graisse|déficit|deficit/.test(s)) return 'perte_graisse';
  if (/prise.*mass|gain|grossir|surpl|bulk/.test(s)) return 'prise_masse';
  if (/hypertroph|muscul|volume/.test(s)) return 'hypertrophie';
  if (/force|powerlift|1rm|force max/.test(s)) return 'force';
  if (/endur|marathon|trail|10\s*km|semi/.test(s)) return 'endurance';
  return 'maintien';
}

function computeEnergyProfile({ profile, lastWeightKg }) {
  if (!profile) return { ready: false };
  const age = profile.annee_naissance
    ? (new Date().getFullYear() - profile.annee_naissance)
    : (profile.age || null);
  if (!age || !profile.taille_cm || !profile.sexe || !lastWeightKg) return { ready: false };

  const sexConst = profile.sexe === 'femme' ? -161 : 5;
  const bmr = Math.round(10 * lastWeightKg + 6.25 * profile.taille_cm - 5 * age + sexConst);
  const level = profile.niveau_activite || levelFromFrequency(profile.frequence_hebdo);
  const factor = ACTIVITY_FACTORS[level] || 1.55;
  const tdee = Math.round(bmr * factor);
  const goalId = classifyGoal(profile.objectif);
  const adjust = GOAL_ADJUSTMENTS[goalId] ?? 0;
  const target = Math.round(tdee + adjust);
  let proteinPerKg = 1.6;
  if (goalId === 'perte_graisse') proteinPerKg = 2.0;
  else if (['prise_masse', 'hypertrophie', 'force'].includes(goalId)) proteinPerKg = 1.8;
  const protein_g = Math.round(proteinPerKg * lastWeightKg);
  const fat_g = Math.round(0.9 * lastWeightKg);
  const carbs_g = Math.max(0, Math.round((target - protein_g * 4 - fat_g * 9) / 4));
  const water_ml = Math.round(33 * lastWeightKg);
  return {
    ready: true,
    age, weight_kg: lastWeightKg, sexe: profile.sexe,
    bmr_kcal: bmr,
    activity_level: level, activity_label: ACTIVITY_LABELS[level], activity_factor: factor,
    tdee_kcal: tdee,
    goal_id: goalId, goal_label: GOAL_LABELS[goalId], goal_adjust_kcal: adjust,
    target_kcal: target,
    protein_g, fat_g, carbs_g, water_ml,
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// ==================== Database setup ====================
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'coach.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

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
    groupe_musculaire TEXT,
    type_equipement TEXT,
    series INTEGER,
    repetitions TEXT,
    charge_kg REAL,
    repos_sec INTEGER,
    series_details TEXT,
    notes TEXT,
    FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    titre TEXT,
    contenu TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Idempotent column additions for older DBs
for (const stmt of [
  'ALTER TABLE profile ADD COLUMN lieu TEXT',
  'ALTER TABLE profile ADD COLUMN user_id INTEGER',
  'ALTER TABLE profile ADD COLUMN annee_naissance INTEGER',
  'ALTER TABLE profile ADD COLUMN niveau_activite TEXT',
  'ALTER TABLE measurements ADD COLUMN user_id INTEGER',
  'ALTER TABLE measurements ADD COLUMN tour_bras_gauche_cm REAL',
  'ALTER TABLE measurements ADD COLUMN tour_bras_droit_cm REAL',
  'ALTER TABLE measurements ADD COLUMN tour_cuisse_gauche_cm REAL',
  'ALTER TABLE measurements ADD COLUMN tour_cuisse_droit_cm REAL',
  'ALTER TABLE measurements ADD COLUMN tour_mollet_gauche_cm REAL',
  'ALTER TABLE measurements ADD COLUMN tour_mollet_droit_cm REAL',
  'ALTER TABLE workouts ADD COLUMN user_id INTEGER',
  'ALTER TABLE plans ADD COLUMN user_id INTEGER',
  'ALTER TABLE exercises ADD COLUMN groupe_musculaire TEXT',
  'ALTER TABLE exercises ADD COLUMN type_equipement TEXT',
  'ALTER TABLE exercises ADD COLUMN series_details TEXT',
  'ALTER TABLE exercises ADD COLUMN duree_min REAL',
  'ALTER TABLE exercises ADD COLUMN distance_km REAL',
  'ALTER TABLE exercises ADD COLUMN vitesse_kmh REAL',
  'ALTER TABLE exercises ADD COLUMN inclinaison_pct REAL',
  'ALTER TABLE exercises ADD COLUMN niveau_resistance INTEGER',
  'ALTER TABLE exercises ADD COLUMN kcal_machine REAL',
]) {
  try { db.exec(stmt); } catch (_) {}
}

// One-time backfill: existing single tour_bras_cm/tour_cuisse_cm values
// were tracked before we split into left/right. Copy them into both sides
// so old data appears as "symmetric" rather than empty in the new UI.
db.exec(`
  UPDATE measurements
     SET tour_bras_gauche_cm = tour_bras_cm,
         tour_bras_droit_cm  = tour_bras_cm
   WHERE tour_bras_cm IS NOT NULL
     AND tour_bras_gauche_cm IS NULL
     AND tour_bras_droit_cm IS NULL;
  UPDATE measurements
     SET tour_cuisse_gauche_cm = tour_cuisse_cm,
         tour_cuisse_droit_cm  = tour_cuisse_cm
   WHERE tour_cuisse_cm IS NOT NULL
     AND tour_cuisse_gauche_cm IS NULL
     AND tour_cuisse_droit_cm IS NULL;
`);

// One-time migration: drop the "id = 1" CHECK constraint on profile so each
// user can have their own row. Detect by inspecting the CREATE TABLE statement.
(function migrateProfileTable() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='profile'").get();
  if (row && /CHECK\s*\(\s*id\s*=\s*1\s*\)/i.test(row.sql)) {
    console.log('→ Migration: profile table rebuilt for multi-user schema.');
    // Copy whatever columns the old table has (minus id) so we don't lose
    // any data added via ALTER TABLE ADD COLUMN between deploys.
    const legacyCols = db.prepare("PRAGMA table_info(profile)").all()
      .map(c => c.name)
      .filter(name => name !== 'id');
    const colList = legacyCols.join(', ');
    db.exec(`
      BEGIN;
      ALTER TABLE profile RENAME TO profile_legacy;
      CREATE TABLE profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        nom TEXT,
        age INTEGER,
        annee_naissance INTEGER,
        sexe TEXT,
        taille_cm REAL,
        niveau TEXT,
        objectif TEXT,
        frequence_hebdo INTEGER,
        niveau_activite TEXT,
        lieu TEXT,
        equipement TEXT,
        contraintes TEXT,
        preferences_alim TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO profile (${colList})
        SELECT ${colList} FROM profile_legacy;
      DROP TABLE profile_legacy;
      COMMIT;
    `);
  }
})();

// ==================== Authentication ====================
const APP_PASSWORD = process.env.APP_PASSWORD || null;
const INVITE_CODE = process.env.INVITE_CODE || null;
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || '365', 10);
const SESSION_SECRET_RAW = process.env.SESSION_SECRET || process.env.APP_PASSWORD || 'coach-ia-default-secret-please-set-SESSION_SECRET-or-APP_PASSWORD';
const SESSION_SECRET = crypto.createHash('sha256').update(SESSION_SECRET_RAW + '|coach-ia-v2').digest();
const COOKIE_NAME = 'coach_session';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1, keyLen = 32;
  const hash = crypto.scryptSync(password, salt, keyLen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  try {
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function safeEq(a, b) {
  const ab = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function sessionHmac(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex').slice(0, 32);
}

function createSessionToken(userId) {
  return `${userId}.${sessionHmac(`u:${userId}:v2`)}`;
}

function verifySessionToken(token) {
  if (!token) return null;
  const [idStr, hmac] = token.split('.');
  const userId = parseInt(idStr, 10);
  if (!Number.isFinite(userId) || userId <= 0 || !hmac) return null;
  if (!safeEq(hmac, sessionHmac(`u:${userId}:v2`))) return null;
  return userId;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

function cookieHeader(name, value, opts = {}) {
  const parts = [`${name}=${value}`, 'HttpOnly', 'Path=/', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  if (opts.maxAgeSec !== undefined) parts.push(`Max-Age=${opts.maxAgeSec}`);
  return parts.join('; ');
}

// One-time bootstrap: if no users exist yet and APP_PASSWORD is set, create
// the admin account. Any orphan rows (from a legacy single-user DB) are
// reassigned to it. Runs on every boot but only does work when the users
// table is empty.
(function bootstrapAdminUser() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return;

  if (!APP_PASSWORD) {
    console.warn('⚠️  Aucun utilisateur et pas d\'APP_PASSWORD : le premier compte doit être créé via /api/register avec INVITE_CODE.');
    return;
  }

  const adminHash = hashPassword(APP_PASSWORD);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(ADMIN_USERNAME, adminHash);
  const adminId = result.lastInsertRowid;

  // Reassign any orphan data (covers DB upgrades from the single-user era)
  const orphanCount =
    db.prepare('UPDATE profile SET user_id = ? WHERE user_id IS NULL').run(adminId).changes +
    db.prepare('UPDATE measurements SET user_id = ? WHERE user_id IS NULL').run(adminId).changes +
    db.prepare('UPDATE workouts SET user_id = ? WHERE user_id IS NULL').run(adminId).changes +
    db.prepare('UPDATE plans SET user_id = ? WHERE user_id IS NULL').run(adminId).changes;
  console.log(`✓ Compte "${ADMIN_USERNAME}" créé (mot de passe = APP_PASSWORD).${orphanCount > 0 ? ` ${orphanCount} lignes existantes migrées.` : ''}`);
})();

// ==================== Auth middleware ====================
const AUTH_PUBLIC_PATHS = new Set([
  '/login.html',
  '/styles.css',
  '/icon.svg',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/sw.js',
]);
const AUTH_PUBLIC_API = new Set(['/api/login', '/api/register', '/api/health']);

app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const userId = verifySessionToken(cookies[COOKIE_NAME]);
  if (userId) {
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (user) {
      req.userId = user.id;
      req.username = user.username;
    }
  }

  if (AUTH_PUBLIC_PATHS.has(req.path)) return next();
  if (AUTH_PUBLIC_API.has(req.path)) return next();

  if (!req.userId) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'auth_required' });
    return res.redirect('/login.html');
  }
  next();
});

// ==================== Auth routes ====================
app.post('/api/login', (req, res) => {
  const { username, password, remember } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Identifiants requis' });
  const clean = String(username).trim().toLowerCase();
  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(clean);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  const maxAgeSec = remember === false ? undefined : SESSION_TTL_DAYS * 24 * 3600;
  res.setHeader('Set-Cookie', cookieHeader(COOKIE_NAME, createSessionToken(user.id), { maxAgeSec }));
  res.json({ ok: true, username: user.username });
});

app.post('/api/register', (req, res) => {
  if (!INVITE_CODE) return res.status(403).json({ error: 'L\'inscription est désactivée sur cette instance. Demandez à l\'administrateur d\'activer un code d\'invitation.' });
  const { username, password, invite_code } = req.body || {};
  if (!username || !password || !invite_code) return res.status(400).json({ error: 'Tous les champs sont requis' });
  // Lenient compare for invite codes: trim + lowercase. Codes are for gating
  // registration, not for protecting access — exact-match strictness only
  // creates support issues (trailing space, capital letter, accent typo).
  const normInput = String(invite_code).trim().toLowerCase();
  const normExpected = String(INVITE_CODE).trim().toLowerCase();
  if (!safeEq(normInput, normExpected)) return res.status(403).json({ error: 'Code d\'invitation invalide' });
  const clean = String(username).trim().toLowerCase();
  if (!/^[a-z0-9_\-]{2,32}$/.test(clean)) {
    return res.status(400).json({ error: 'Nom d\'utilisateur invalide (2-32 caractères, lettres minuscules, chiffres, _ ou -)' });
  }
  if (String(password).length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum)' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(clean);
  if (existing) return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
  const hash = hashPassword(password);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(clean, hash);
  res.setHeader('Set-Cookie', cookieHeader(COOKIE_NAME, createSessionToken(result.lastInsertRowid), { maxAgeSec: SESSION_TTL_DAYS * 24 * 3600 }));
  res.json({ ok: true, username: clean });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', cookieHeader(COOKIE_NAME, '', { maxAgeSec: 0 }));
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ id: req.userId, username: req.username });
});

app.delete('/api/me', (req, res) => {
  const { confirm_password } = req.body || {};
  if (!confirm_password) return res.status(400).json({ error: 'Confirmation par mot de passe requise' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
  if (!row || !verifyPassword(confirm_password, row.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const tx = db.transaction(() => {
    const myWorkoutIds = db.prepare('SELECT id FROM workouts WHERE user_id = ?').all(req.userId).map(r => r.id);
    if (myWorkoutIds.length) {
      db.prepare(`DELETE FROM exercises WHERE workout_id IN (${myWorkoutIds.map(() => '?').join(',')})`).run(...myWorkoutIds);
    }
    db.prepare('DELETE FROM workouts WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM measurements WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM plans WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM profile WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  });
  tx();
  res.setHeader('Set-Cookie', cookieHeader(COOKIE_NAME, '', { maxAgeSec: 0 }));
  res.json({ ok: true });
});

app.post('/api/change-password', (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: 'Champs requis' });
  if (String(new_password).length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum)' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
  if (!row || !verifyPassword(current_password, row.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(new_password), req.userId);
  res.json({ ok: true });
});

// ==================== Static files (auth-gated above) ====================
app.use(express.static(path.join(__dirname, 'public')));

// ==================== LLM ====================
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

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

// ==================== Per-user data helpers ====================
function getProfile(userId) {
  return db.prepare('SELECT * FROM profile WHERE user_id = ?').get(userId);
}

function getRecentMeasurements(userId, limit = 10) {
  return db.prepare('SELECT * FROM measurements WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT ?').all(userId, limit);
}

function getRecentWorkouts(userId, limit = 10) {
  const workouts = db.prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT ?').all(userId, limit);
  const exStmt = db.prepare('SELECT * FROM exercises WHERE workout_id = ?');
  return workouts.map(w => ({ ...w, exercises: exStmt.all(w.id) }));
}

function buildContextSummary(userId) {
  const profile = getProfile(userId);
  if (profile) {
    if (profile.annee_naissance) {
      profile.age_calcule = new Date().getFullYear() - profile.annee_naissance;
    } else if (profile.age) {
      profile.age_calcule = profile.age;
    }
  }
  const measurements = getRecentMeasurements(userId, 8);
  const workouts = getRecentWorkouts(userId, 8);

  const lastWeight = measurements.find(m => m.poids_kg != null)?.poids_kg;
  const energy = computeEnergyProfile({ profile, lastWeightKg: lastWeight });

  return { profile, measurements, workouts, energy };
}

// ==================== Profile ====================
app.get('/api/profile', (req, res) => {
  res.json(getProfile(req.userId) || null);
});

app.post('/api/profile', (req, res) => {
  const p = req.body || {};
  const existing = db.prepare('SELECT id FROM profile WHERE user_id = ?').get(req.userId);
  if (existing) {
    db.prepare(`
      UPDATE profile SET
        nom=@nom, age=@age, annee_naissance=@annee_naissance, sexe=@sexe, taille_cm=@taille_cm, niveau=@niveau,
        objectif=@objectif, frequence_hebdo=@frequence_hebdo, niveau_activite=@niveau_activite,
        lieu=@lieu, equipement=@equipement,
        contraintes=@contraintes, preferences_alim=@preferences_alim, updated_at=CURRENT_TIMESTAMP
      WHERE user_id=@user_id
    `).run({
      user_id: req.userId,
      nom: p.nom ?? null, age: p.age ?? null, annee_naissance: p.annee_naissance ?? null,
      sexe: p.sexe ?? null, taille_cm: p.taille_cm ?? null,
      niveau: p.niveau ?? null, objectif: p.objectif ?? null, frequence_hebdo: p.frequence_hebdo ?? null,
      niveau_activite: p.niveau_activite ?? null,
      lieu: p.lieu ?? null, equipement: p.equipement ?? null, contraintes: p.contraintes ?? null,
      preferences_alim: p.preferences_alim ?? null,
    });
  } else {
    db.prepare(`
      INSERT INTO profile (user_id, nom, age, annee_naissance, sexe, taille_cm, niveau, objectif, frequence_hebdo, niveau_activite, lieu, equipement, contraintes, preferences_alim)
      VALUES (@user_id, @nom, @age, @annee_naissance, @sexe, @taille_cm, @niveau, @objectif, @frequence_hebdo, @niveau_activite, @lieu, @equipement, @contraintes, @preferences_alim)
    `).run({
      user_id: req.userId,
      nom: p.nom ?? null, age: p.age ?? null, annee_naissance: p.annee_naissance ?? null,
      sexe: p.sexe ?? null, taille_cm: p.taille_cm ?? null,
      niveau: p.niveau ?? null, objectif: p.objectif ?? null, frequence_hebdo: p.frequence_hebdo ?? null,
      niveau_activite: p.niveau_activite ?? null,
      lieu: p.lieu ?? null, equipement: p.equipement ?? null, contraintes: p.contraintes ?? null,
      preferences_alim: p.preferences_alim ?? null,
    });
  }
  res.json(getProfile(req.userId));
});

// ==================== Measurements ====================
app.get('/api/measurements', (req, res) => {
  res.json(db.prepare('SELECT * FROM measurements WHERE user_id = ? ORDER BY date ASC, id ASC').all(req.userId));
});

app.post('/api/measurements', (req, res) => {
  const m = req.body || {};
  const info = db.prepare(`
    INSERT INTO measurements (user_id, date, poids_kg, pct_muscle, pct_graisse, tour_taille_cm, tour_hanches_cm,
      tour_bras_gauche_cm, tour_bras_droit_cm,
      tour_cuisse_gauche_cm, tour_cuisse_droit_cm,
      tour_mollet_gauche_cm, tour_mollet_droit_cm,
      notes)
    VALUES (@user_id, @date, @poids_kg, @pct_muscle, @pct_graisse, @tour_taille_cm, @tour_hanches_cm,
      @tour_bras_gauche_cm, @tour_bras_droit_cm,
      @tour_cuisse_gauche_cm, @tour_cuisse_droit_cm,
      @tour_mollet_gauche_cm, @tour_mollet_droit_cm,
      @notes)
  `).run({
    user_id: req.userId,
    date: m.date || new Date().toISOString().slice(0, 10),
    poids_kg: m.poids_kg ?? null,
    pct_muscle: m.pct_muscle ?? null,
    pct_graisse: m.pct_graisse ?? null,
    tour_taille_cm: m.tour_taille_cm ?? null,
    tour_hanches_cm: m.tour_hanches_cm ?? null,
    tour_bras_gauche_cm: m.tour_bras_gauche_cm ?? null,
    tour_bras_droit_cm: m.tour_bras_droit_cm ?? null,
    tour_cuisse_gauche_cm: m.tour_cuisse_gauche_cm ?? null,
    tour_cuisse_droit_cm: m.tour_cuisse_droit_cm ?? null,
    tour_mollet_gauche_cm: m.tour_mollet_gauche_cm ?? null,
    tour_mollet_droit_cm: m.tour_mollet_droit_cm ?? null,
    notes: m.notes ?? null,
  });
  res.json(db.prepare('SELECT * FROM measurements WHERE id = ? AND user_id = ?').get(info.lastInsertRowid, req.userId));
});

app.delete('/api/measurements/:id', (req, res) => {
  db.prepare('DELETE FROM measurements WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

// ==================== Workouts ====================
app.get('/api/workouts', (req, res) => {
  res.json(getRecentWorkouts(req.userId, 50));
});

app.post('/api/workouts', (req, res) => {
  const w = req.body || {};
  const exercises = Array.isArray(w.exercises) ? w.exercises : [];

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO workouts (user_id, date, nom, duree_min, ressenti, notes)
      VALUES (@user_id, @date, @nom, @duree_min, @ressenti, @notes)
    `).run({
      user_id: req.userId,
      date: w.date || new Date().toISOString().slice(0, 10),
      nom: w.nom ?? null,
      duree_min: w.duree_min ?? null,
      ressenti: w.ressenti ?? null,
      notes: w.notes ?? null,
    });
    const workoutId = info.lastInsertRowid;
    const exStmt = db.prepare(`
      INSERT INTO exercises (workout_id, nom, groupe_musculaire, type_equipement, series, repetitions, charge_kg, repos_sec, series_details, duree_min, distance_km, vitesse_kmh, inclinaison_pct, niveau_resistance, kcal_machine, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of exercises) {
      exStmt.run(
        workoutId,
        e.nom ?? '',
        e.groupe_musculaire ?? null,
        e.type_equipement ?? null,
        e.series ?? null,
        e.repetitions ?? null,
        e.charge_kg ?? null,
        e.repos_sec ?? null,
        e.series_details ? (typeof e.series_details === 'string' ? e.series_details : JSON.stringify(e.series_details)) : null,
        e.duree_min ?? null,
        e.distance_km ?? null,
        e.vitesse_kmh ?? null,
        e.inclinaison_pct ?? null,
        e.niveau_resistance ?? null,
        e.kcal_machine ?? null,
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
  // Only delete if it belongs to current user
  db.prepare('DELETE FROM workouts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

// ==================== Plans ====================
app.get('/api/plans', (req, res) => {
  const type = req.query.type;
  if (type) {
    res.json(db.prepare('SELECT * FROM plans WHERE user_id = ? AND type = ? ORDER BY created_at DESC').all(req.userId, type));
  } else {
    res.json(db.prepare('SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC').all(req.userId));
  }
});

app.delete('/api/plans/:id', (req, res) => {
  db.prepare('DELETE FROM plans WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

// ==================== AI ====================
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
Tu réponds en français, de manière structurée avec des titres en markdown.

Notes sur les données :
- groupe_musculaire "cardio" = exercice cardio pur (tapis à allure modérée, vélo droit, rameur en endurance…)
- groupe_musculaire "sport_global" = activité sportive sollicitant tout le corps (natation, vélo extérieur, badminton, randonnée…). Ces séances comptent comme entraînement complet, pas comme du simple cardio. Évalue les apports caloriques et la récupération en conséquence.
- type_equipement "sport" = activité hors salle ; les champs durée/distance/vitesse sont remplis, mais pas séries/reps/charge.
- Les mensurations contiennent désormais tour_bras_gauche_cm / tour_bras_droit_cm, tour_cuisse_gauche_cm / tour_cuisse_droit_cm et tour_mollet_gauche_cm / tour_mollet_droit_cm. Un écart > 1 cm entre les côtés signale un déséquilibre à corriger via du travail unilatéral du côté faible. Les anciens champs tour_bras_cm et tour_cuisse_cm sont conservés pour la rétrocompatibilité ; privilégie les valeurs gauche/droite quand elles sont présentes.

## Règle obligatoire pour CHAQUE exercice proposé
Quand tu cites un exercice (en générant une séance, en répondant à une question, en analysant la progression), tu dois TOUJOURS indiquer entre parenthèses en italique les groupes musculaires principaux qu'il sollicite, immédiatement après le nom de l'exercice.

Exemples :
- **Développé couché barre** *(pectoraux, triceps, épaules antérieures)* — 4 × 8 reps @ 70 kg, repos 2 min
- **Tirage horizontal poulie** *(dos, biceps, trapèzes)* — 3 × 12 reps
- **Squat barre** *(quadriceps, fessiers, core)* — 4 × 6 reps @ 80 kg

Utilise les noms français standards : pectoraux, dos, épaules (antérieures/latérales/postérieures), biceps, triceps, avant-bras, quadriceps, ischios, fessiers, mollets, adducteurs, abdos/core. Liste les muscles dans l'ordre d'importance (principal en premier).`;

function environmentBlock(profile) {
  if (!profile) return '';
  const note = ENVIRONMENT_NOTES[profile.lieu];
  if (!note) return '';
  return `\n## Environnement d'entraînement\n${note}\n`;
}

function energyBlock(energy) {
  if (!energy || !energy.ready) return '';
  return `\n## Profil énergétique calculé (Mifflin-St Jeor + activité + objectif)
- Métabolisme de base : ${energy.bmr_kcal} kcal
- Niveau d'activité : ${energy.activity_label} (×${energy.activity_factor})
- Dépense énergétique journalière (DEJ) : ${energy.tdee_kcal} kcal
- Objectif détecté : ${energy.goal_label} (${energy.goal_adjust_kcal >= 0 ? '+' : ''}${energy.goal_adjust_kcal} kcal)
- **Cible quotidienne : ${energy.target_kcal} kcal**
- Protéines : ${energy.protein_g} g (~${(energy.protein_g/energy.weight_kg).toFixed(1)} g/kg)
- Lipides : ${energy.fat_g} g
- Glucides : ${energy.carbs_g} g
- Hydratation : ${(energy.water_ml/1000).toFixed(1)} L/j

Aligne tes recommandations nutritionnelles sur ces valeurs (ou justifie tout écart par une raison physiologique précise).\n`;
}

app.post('/api/generate-workout', async (req, res) => {
  if (!requireLLM(res)) return;
  try {
    const ctx = buildContextSummary(req.userId);
    const focus = req.body?.focus || 'séance équilibrée adaptée à mes objectifs';
    const duree = req.body?.duree_min || 45;

    const userPrompt = `Génère une séance d'entraînement personnalisée.

# Contexte
## Profil
${JSON.stringify(ctx.profile, null, 2)}
${environmentBlock(ctx.profile)}
${energyBlock(ctx.energy)}
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
      'INSERT INTO plans (user_id, type, titre, contenu) VALUES (?, ?, ?, ?)'
    ).run(req.userId, 'workout', titre, text);
    res.json({ id: info.lastInsertRowid, titre, contenu: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-nutrition', async (req, res) => {
  if (!requireLLM(res)) return;
  try {
    const ctx = buildContextSummary(req.userId);
    const duree = req.body?.duree_jours || 7;
    const calories_cible = req.body?.calories_cible || null;

    const userPrompt = `Génère un plan nutrition personnalisé.

# Contexte
## Profil
${JSON.stringify(ctx.profile, null, 2)}
${energyBlock(ctx.energy)}
## Mesures récentes
${JSON.stringify(ctx.measurements, null, 2)}

## Entraînements récents (pour ajuster les apports les jours d'entraînement)
${JSON.stringify(ctx.workouts, null, 2)}

# Demande
- Durée du plan : ${duree} jours
- Calories cible : ${calories_cible ? `${calories_cible} kcal/jour` : (ctx.energy?.ready ? `${ctx.energy.target_kcal} kcal/jour (calculée à partir du profil)` : 'à calculer selon le profil et l\'objectif')}
- Calcule besoins (BMR + dépense + objectif) et propose une cible journalière macros (protéines/glucides/lipides en g)
- Donne un exemple type de répartition repas (petit-déjeuner, déjeuner, collation, dîner)
- Prévois 2-3 variantes par repas pour éviter la monotonie
- Adapte les apports aux jours d'entraînement vs jours de repos
- Inclus une liste de courses synthétique en fin de plan`;

    const text = await callLLM(COACH_SYSTEM, userPrompt);
    const titre = `Plan nutrition — ${new Date().toLocaleDateString('fr-FR')} (${duree}j)`;
    const info = db.prepare(
      'INSERT INTO plans (user_id, type, titre, contenu) VALUES (?, ?, ?, ?)'
    ).run(req.userId, 'nutrition', titre, text);
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

    const ctx = buildContextSummary(req.userId);
    const userPrompt = `# Contexte de l'utilisateur
## Profil
${JSON.stringify(ctx.profile, null, 2)}
${environmentBlock(ctx.profile)}
${energyBlock(ctx.energy)}
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
    const ctx = buildContextSummary(req.userId);
    const userPrompt = `Analyse en profondeur ma progression à partir de mes données.

# Données
## Profil
${JSON.stringify(ctx.profile, null, 2)}
${environmentBlock(ctx.profile)}
${energyBlock(ctx.energy)}
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

// ==================== Export / Import (scoped to current user) ====================
app.get('/api/export', (req, res) => {
  const profile = getProfile(req.userId);
  const measurements = db.prepare('SELECT * FROM measurements WHERE user_id = ? ORDER BY id ASC').all(req.userId);
  const workouts = db.prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY id ASC').all(req.userId);
  const workoutIds = workouts.map(w => w.id);
  const exercises = workoutIds.length
    ? db.prepare(`SELECT * FROM exercises WHERE workout_id IN (${workoutIds.map(() => '?').join(',')}) ORDER BY id ASC`).all(...workoutIds)
    : [];
  const plans = db.prepare('SELECT * FROM plans WHERE user_id = ? ORDER BY id ASC').all(req.userId);
  res.json({
    version: 2,
    exported_at: new Date().toISOString(),
    username: req.username,
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
    // Wipe only the current user's data
    const myWorkoutIds = db.prepare('SELECT id FROM workouts WHERE user_id = ?').all(req.userId).map(r => r.id);
    if (myWorkoutIds.length) {
      db.prepare(`DELETE FROM exercises WHERE workout_id IN (${myWorkoutIds.map(() => '?').join(',')})`).run(...myWorkoutIds);
    }
    db.prepare('DELETE FROM workouts WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM measurements WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM plans WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM profile WHERE user_id = ?').run(req.userId);

    if (data.profile && typeof data.profile === 'object') {
      const p = data.profile;
      db.prepare(`
        INSERT INTO profile (user_id, nom, age, annee_naissance, sexe, taille_cm, niveau, objectif, frequence_hebdo, lieu, equipement, contraintes, preferences_alim)
        VALUES (@user_id, @nom, @age, @annee_naissance, @sexe, @taille_cm, @niveau, @objectif, @frequence_hebdo, @lieu, @equipement, @contraintes, @preferences_alim)
      `).run({
        user_id: req.userId,
        nom: p.nom ?? null,
        age: p.age ?? null,
        annee_naissance: p.annee_naissance ?? null,
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
      INSERT INTO measurements (user_id, date, poids_kg, pct_muscle, pct_graisse, tour_taille_cm, tour_hanches_cm,
        tour_bras_cm, tour_cuisse_cm,
        tour_bras_gauche_cm, tour_bras_droit_cm,
        tour_cuisse_gauche_cm, tour_cuisse_droit_cm,
        tour_mollet_gauche_cm, tour_mollet_droit_cm,
        notes, created_at)
      VALUES (@user_id, @date, @poids_kg, @pct_muscle, @pct_graisse, @tour_taille_cm, @tour_hanches_cm,
        @tour_bras_cm, @tour_cuisse_cm,
        @tour_bras_gauche_cm, @tour_bras_droit_cm,
        @tour_cuisse_gauche_cm, @tour_cuisse_droit_cm,
        @tour_mollet_gauche_cm, @tour_mollet_droit_cm,
        @notes, COALESCE(@created_at, CURRENT_TIMESTAMP))
    `);
    for (const m of (data.measurements || [])) {
      insMeasure.run({
        user_id: req.userId,
        date: m.date,
        poids_kg: m.poids_kg ?? null,
        pct_muscle: m.pct_muscle ?? null,
        pct_graisse: m.pct_graisse ?? null,
        tour_taille_cm: m.tour_taille_cm ?? null,
        tour_hanches_cm: m.tour_hanches_cm ?? null,
        tour_bras_cm: m.tour_bras_cm ?? null,
        tour_cuisse_cm: m.tour_cuisse_cm ?? null,
        tour_bras_gauche_cm: m.tour_bras_gauche_cm ?? null,
        tour_bras_droit_cm: m.tour_bras_droit_cm ?? null,
        tour_cuisse_gauche_cm: m.tour_cuisse_gauche_cm ?? null,
        tour_cuisse_droit_cm: m.tour_cuisse_droit_cm ?? null,
        tour_mollet_gauche_cm: m.tour_mollet_gauche_cm ?? null,
        tour_mollet_droit_cm: m.tour_mollet_droit_cm ?? null,
        notes: m.notes ?? null,
        created_at: m.created_at ?? null,
      });
    }

    // Build a mapping of old workout_id -> new workout_id so exercises link correctly
    const idMap = new Map();
    const insWorkout = db.prepare(`
      INSERT INTO workouts (user_id, date, nom, duree_min, ressenti, notes, created_at)
      VALUES (@user_id, @date, @nom, @duree_min, @ressenti, @notes, COALESCE(@created_at, CURRENT_TIMESTAMP))
    `);
    for (const w of (data.workouts || [])) {
      const info = insWorkout.run({
        user_id: req.userId,
        date: w.date,
        nom: w.nom ?? null,
        duree_min: w.duree_min ?? null,
        ressenti: w.ressenti ?? null,
        notes: w.notes ?? null,
        created_at: w.created_at ?? null,
      });
      if (w.id) idMap.set(w.id, info.lastInsertRowid);
    }

    const insExercise = db.prepare(`
      INSERT INTO exercises (workout_id, nom, groupe_musculaire, type_equipement, series, repetitions, charge_kg, repos_sec, series_details, duree_min, distance_km, vitesse_kmh, inclinaison_pct, niveau_resistance, kcal_machine, notes)
      VALUES (@workout_id, @nom, @groupe_musculaire, @type_equipement, @series, @repetitions, @charge_kg, @repos_sec, @series_details, @duree_min, @distance_km, @vitesse_kmh, @inclinaison_pct, @niveau_resistance, @kcal_machine, @notes)
    `);
    for (const e of (data.exercises || [])) {
      const newWorkoutId = idMap.get(e.workout_id);
      if (!newWorkoutId) continue;
      insExercise.run({
        workout_id: newWorkoutId,
        nom: e.nom ?? '',
        groupe_musculaire: e.groupe_musculaire ?? null,
        type_equipement: e.type_equipement ?? null,
        series: e.series ?? null,
        repetitions: e.repetitions ?? null,
        charge_kg: e.charge_kg ?? null,
        repos_sec: e.repos_sec ?? null,
        series_details: e.series_details ?? null,
        duree_min: e.duree_min ?? null,
        distance_km: e.distance_km ?? null,
        vitesse_kmh: e.vitesse_kmh ?? null,
        inclinaison_pct: e.inclinaison_pct ?? null,
        niveau_resistance: e.niveau_resistance ?? null,
        kcal_machine: e.kcal_machine ?? null,
        notes: e.notes ?? null,
      });
    }

    const insPlan = db.prepare(`
      INSERT INTO plans (user_id, type, titre, contenu, created_at)
      VALUES (@user_id, @type, @titre, @contenu, COALESCE(@created_at, CURRENT_TIMESTAMP))
    `);
    for (const pl of (data.plans || [])) {
      insPlan.run({
        user_id: req.userId,
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

// ==================== Stats / Health ====================
app.get('/api/stats', (req, res) => {
  res.json({
    measurements: db.prepare('SELECT COUNT(*) as n FROM measurements WHERE user_id = ?').get(req.userId).n,
    workouts: db.prepare('SELECT COUNT(*) as n FROM workouts WHERE user_id = ?').get(req.userId).n,
    plans: db.prepare('SELECT COUNT(*) as n FROM plans WHERE user_id = ?').get(req.userId).n,
    has_profile: !!getProfile(req.userId),
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
    auth_required: true,
    registration_enabled: !!INVITE_CODE,
    authenticated: !!req.userId,
    username: req.username || null,
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
  if (!INVITE_CODE) {
    console.warn('ℹ️  INVITE_CODE non défini : aucune inscription possible. Définissez-le pour permettre l\'inscription de nouveaux utilisateurs.');
  }
});
