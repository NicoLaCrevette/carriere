/**
 * Condition physique et rythme de compétition.
 *  - fatigue par minute de match (≈ −22 à −28 pour 90 minutes, plus pour les postes
 *    qui courent, les jeunes et les trentenaires) ;
 *  - récupération quotidienne selon le type de journée et l'âge ;
 *  - sharpness qui monte avec les minutes et descend sans match ;
 *  - multiplicateur de performance 0.6-1.0.
 */
import type { DayKind, Player } from '../types';
import { BALANCE } from '../config/balance';
import { clampGauge } from './common';

const F = BALANCE.fitness;

/** Multiplicateur de fatigue de match selon l'âge. */
export function ageFatigueMultiplier(age: number): number {
  const a = F.ageFatigue;
  if (age <= a.youngUntil) return a.youngFactor;
  if (age >= a.oldFrom) return 1 + a.oldFactorPerYear * (age - a.oldFrom + 1);
  return 1;
}

/** Multiplicateur de récupération selon l'âge (plus lent après 30 ans). */
export function recoveryAgeMultiplier(age: number): number {
  const r = F.recoveryAge;
  if (age < r.fromAge) return 1;
  return Math.max(r.min, Math.pow(r.perYearMultiplier, age - r.fromAge + 1));
}

/** Fatigue d'un match pour ce joueur (points de fitness), sans muter. */
export function matchFatigue(player: Player, minutes: number, intensity: number, age: number): number {
  const position = player.identity.position;
  return F.fatiguePerMatchMinute
    * Math.max(0, minutes)
    * Math.max(0, intensity)
    * F.positionFatigue[position]
    * ageFatigueMultiplier(age);
}

/** Applique la fatigue d'un match et le gain de rythme. Mute player. */
export function applyMatchFatigue(player: Player, minutes: number, intensity: number, age: number): void {
  if (minutes <= 0) return;
  player.fitness = clampGauge(player.fitness - matchFatigue(player, minutes, intensity, age));
  player.sharpness = Math.min(F.sharpness.max, clampGauge(player.sharpness) + F.sharpness.gainPerMatchMinute * minutes);
}

/** Récupération quotidienne selon le type de journée et l'âge. Met aussi à jour sharpness. */
export function dailyRecovery(player: Player, kind: DayKind, age: number): void {
  const recovery = (F.recoveryByDay[kind] ?? 0) * recoveryAgeMultiplier(age);
  player.fitness = clampGauge(player.fitness + recovery);
  if (!F.sharpnessNoDecayDays.includes(kind)) {
    player.sharpness = clampGauge(player.sharpness - F.sharpness.decayPerDay);
  }
}

/** Multiplicateur de performance 0.6-1.0 lié à fitness et sharpness. */
export function fitnessMultiplier(player: Player): number {
  const m = F.multiplier;
  const blend = m.fitnessWeight * (clampGauge(player.fitness) / 100) + m.sharpnessWeight * (clampGauge(player.sharpness) / 100);
  return m.min + (1 - m.min) * Math.min(1, blend / (m.fitnessWeight + m.sharpnessWeight));
}
