// Energy / nutrition profile — browser side.
// The same calculation lives in server.js so both ends produce identical
// numbers; this file is only loaded by index.html.

window.energyProfile = (function () {
  const ACTIVITY_FACTORS = {
    sedentaire: 1.2,
    leger: 1.375,
    modere: 1.55,
    actif: 1.725,
    tres_actif: 1.9,
  };

  const ACTIVITY_LABELS = {
    sedentaire: 'Sédentaire',
    leger: 'Léger',
    modere: 'Modéré',
    actif: 'Actif',
    tres_actif: 'Très actif',
  };

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

  const GOAL_ADJUSTMENTS = {
    perte_graisse: -400,
    prise_masse: +300,
    hypertrophie: +200,
    force: +100,
    endurance: 0,
    maintien: 0,
  };

  const GOAL_LABELS = {
    perte_graisse: 'Perte de graisse',
    prise_masse: 'Prise de masse',
    hypertrophie: 'Hypertrophie',
    force: 'Force',
    endurance: 'Endurance',
    maintien: 'Maintien',
  };

  function computeEnergyProfile({ profile, lastWeightKg }) {
    if (!profile) return { ready: false, missing: ['profil'] };

    const missing = [];
    const age = profile.annee_naissance
      ? (new Date().getFullYear() - profile.annee_naissance)
      : (profile.age || null);
    if (!age) missing.push('année de naissance');
    if (!profile.taille_cm) missing.push('taille');
    if (!profile.sexe) missing.push('sexe');
    if (!lastWeightKg) missing.push('poids (au moins une mesure)');
    if (missing.length) return { ready: false, missing };

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
    else if (goalId === 'prise_masse' || goalId === 'hypertrophie' || goalId === 'force') proteinPerKg = 1.8;
    const protein_g = Math.round(proteinPerKg * lastWeightKg);

    const fat_g = Math.round(0.9 * lastWeightKg);
    const proteinKcal = protein_g * 4;
    const fatKcal = fat_g * 9;
    const carbs_g = Math.max(0, Math.round((target - proteinKcal - fatKcal) / 4));
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

  return { computeEnergyProfile, ACTIVITY_LABELS, GOAL_LABELS };
})();
