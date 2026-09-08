/**
 * Séance d'entraînement (§10) : XP par focus, fatigue, sur-entraînement
 * (3 séances intenses d'affilée → fatigue accrue, risque de blessure ×2),
 * blessure éventuelle. Mute le joueur ; la blessure tirée est ajoutée à
 * `player.injuries` et renvoyée.
 */
import type { Club, DifficultyProfile, ISODate, Injury, Player, TrainingFocus, TrainingResult } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { ageAt } from '../calendar/dates';
import { clampGauge } from './common';
import { applyXp, trainingXp } from './progression';
import { isInjured, rollInjury } from './injuries';
import { TRAINING_FOCUS_LABELS, TRAINING_TARGETS } from './trainingTargets';

export { TRAINING_FOCUS_LABELS, TRAINING_TARGETS };

type Intensity = 'legere' | 'normale' | 'intense';

const P = BALANCE.progression;
const F = BALANCE.fitness;

export interface OvertrainingState {
  /** Séances intenses de trop (0 sous le seuil, 1 au seuil). */
  extra: number;
  xpMultiplier: number;
  injuryMultiplier: number;
  fatigueMultiplier: number;
}

/** Effets du sur-entraînement pour une série de séances intenses donnée. Pure. */
export function overtrainingEffects(streak: number): OvertrainingState {
  const o = P.overtraining;
  const x = P.overtrainingExtra;
  const extra = Math.max(0, streak - o.streakThreshold + 1);
  if (extra === 0) return { extra, xpMultiplier: 1, injuryMultiplier: 1, fatigueMultiplier: 1 };
  return {
    extra,
    xpMultiplier: Math.pow(o.xpMalusPerExtraSession, extra),
    injuryMultiplier: Math.min(o.maxInjuryMultiplier, x.injuryMultiplierAtThreshold * Math.pow(o.injuryMultiplierPerExtraSession, extra - 1)),
    fatigueMultiplier: Math.pow(x.fatigueMultiplierPerExtraSession, extra),
  };
}

/** Minutes estimées sur 30 jours depuis le rythme de compétition. */
export function minutesFromSharpness(sharpness: number): number {
  return (clampGauge(sharpness) / 100) * P.sharpnessToMinutes30Days;
}

function scaleXp(xp: Partial<Record<string, number>>, factor: number): void {
  for (const key of Object.keys(xp)) xp[key] = (xp[key] ?? 0) * factor;
}

/** Résout une séance : XP, fatigue, sur-entraînement, blessure éventuelle. Mute player. */
export function runTraining(
  player: Player,
  focus: TrainingFocus,
  intensity: Intensity,
  club: Club,
  profile: DifficultyProfile,
  date: ISODate,
  rng: Rng,
): TrainingResult & { injury: Injury | null } {
  const age = ageAt(player.identity.birthDate, date);
  const injured = isInjured(player);
  const recovery = focus === 'recuperation';

  // Sur-entraînement : seules les séances intenses prolongent la série.
  player.intenseSessionsStreak = intensity === 'intense' ? player.intenseSessionsStreak + 1 : 0;
  if (intensity === 'intense' && !injured) {
    player.counters ??= { intenseSessions: 0, captainMatches: 0, decisiveBigMatchGoals: 0 };
    player.counters.intenseSessions += 1;
  }
  const over = overtrainingEffects(player.intenseSessionsStreak);

  // XP.
  const xpAdded = trainingXp(player, focus, intensity, club, age, minutesFromSharpness(player.sharpness));
  scaleXp(xpAdded, over.xpMultiplier * (injured ? P.injuredXpMultiplier : 1));
  const gains = applyXp(player, xpAdded);

  // Fatigue et rythme.
  const fatigueDelta = recovery ? P.recoveryFocusFitnessGain : -F.trainingFatigue[intensity] * over.fatigueMultiplier;
  player.fitness = clampGauge(player.fitness + fatigueDelta);
  player.sharpness = Math.min(F.sharpness.max, clampGauge(player.sharpness) + F.sharpness.trainingGainPerSession);

  // Blessure (pas de tirage en récupération ni quand on est déjà blessé).
  let injury: Injury | null = null;
  if (!injured && !recovery) {
    injury = rollInjury(
      player,
      { origin: 'entrainement', minutes: 0, intensity: BALANCE.injuries.trainingIntensityValue[intensity], contact: false, age, riskMultiplier: over.injuryMultiplier },
      profile,
      rng,
      date,
    );
    if (injury) player.injuries.push(injury);
  }

  return { focus, intensity, gains, fatigueDelta, xpAdded, injury };
}
