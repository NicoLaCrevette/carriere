/**
 * Blessures (§12) : rares mais réalistes.
 * Probabilité = f(fatigue, minutes, intensité, âge, prédisposition cachée, contact) × difficulté.
 * `rollInjury` est pur (il ne touche pas player.injuries : l'appelant ajoute la
 * blessure) ; `advanceInjuries`, `playThroughInjury` mutent le joueur.
 */
import { ATTRIBUTE_GROUPS, INJURY_TYPES } from '../types';
import type { AttributeGroup, AttributeKey, Attributes, DifficultyProfile, ISODate, Injury, InjuryOrigin, InjuryType, Player } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { diffDays } from '../calendar/dates';
import { bandFor, clamp, clampAttribute, clampGauge } from './common';

const I = BALANCE.injuries;

export interface InjuryContext {
  origin: InjuryOrigin;
  /** Minutes jouées (match, sélection). */
  minutes: number;
  /** Intensité 0-1 d'une séance (voir BALANCE.injuries.trainingIntensityValue) ou d'un match (1 = normal). */
  intensity: number;
  contact: boolean;
  age: number;
  /** Multiplicateur additionnel (sur-entraînement, jouer blessé). */
  riskMultiplier?: number;
}

export const INJURY_LABELS: Record<InjuryType, string> = {
  contracture: 'Contracture',
  ischios: 'Lésion des ischio-jambiers',
  entorse_cheville: 'Entorse de la cheville',
  entorse_genou: 'Entorse du genou',
  pubalgie: 'Pubalgie',
  fracture: 'Fracture',
  commotion: 'Commotion cérébrale',
  croises: 'Rupture des ligaments croisés',
  menisque: 'Lésion du ménisque',
  adducteurs: 'Lésion des adducteurs',
  mollet: 'Lésion du mollet',
  dos: 'Douleurs dorsales',
};

// ── Probabilité ──────────────────────────────────────────────────────────

/** Catégorie de séance retrouvée depuis une intensité numérique 0-1. */
function trainingCategory(intensity: number): 'legere' | 'normale' | 'intense' {
  const v = I.trainingIntensityValue;
  if (intensity <= (v.legere + v.normale) / 2) return 'legere';
  if (intensity <= (v.normale + v.intense) / 2) return 'normale';
  return 'intense';
}

function baseProbability(ctx: InjuryContext): number {
  switch (ctx.origin) {
    case 'match':
    case 'selection': {
      const m = I.matchIntensity;
      const factor = clamp(1 + m.slope * (ctx.intensity - 1), m.min, m.max);
      return I.baseProbPerMatchMinute * Math.max(0, ctx.minutes) * factor;
    }
    case 'entrainement':
      return I.trainingProb[trainingCategory(ctx.intensity)];
    case 'hors_terrain':
      return I.offPitchProb;
  }
}

function fatigueMultiplier(fitness: number): number {
  for (const band of I.fatigueMultiplier) if (fitness < band.belowFitness) return band.factor;
  return 1;
}

/** Probabilité (0-1) de se blesser dans ce contexte. Pure. */
export function injuryProbability(player: Player, ctx: InjuryContext, profile: DifficultyProfile): number {
  const p = baseProbability(ctx)
    * bandFor(I.ageMultiplier, ctx.age).factor
    * fatigueMultiplier(player.fitness)
    * (ctx.contact ? I.contactMultiplier : 1)
    * (I.proneness.base + I.proneness.slope * clamp(player.injuryProneness, 0, 1))
    * profile.injuryFrequency
    * (ctx.riskMultiplier ?? 1);
  return clamp(p, 0, 1);
}

// ── Création ─────────────────────────────────────────────────────────────

function severityRisk(days: number, serious: boolean): number {
  if (days > I.heavyInjuryDays) return I.recurrenceRisk.heavy;
  return serious ? I.recurrenceRisk.serious : I.recurrenceRisk.minor;
}

/** Tire un type de blessure selon les poids. */
export function drawInjuryType(rng: Rng): InjuryType {
  return rng.weighted(INJURY_TYPES, INJURY_TYPES.map((t) => I.types[t].weight));
}

/** Construit une blessure d'un type donné (durée réelle tirée, diagnostic optimiste). */
export function makeInjury(type: InjuryType, origin: InjuryOrigin, date: ISODate, rng: Rng, days?: number): Injury {
  const spec = I.types[type];
  const actualDays = Math.max(1, Math.round(days ?? rng.int(spec.days[0], spec.days[1])));
  const optimism = I.announcedOptimism + (rng.next() * 2 - 1) * I.announcedOptimismJitter;
  return {
    id: `inj_${date}_${type}_${rng.int(1000, 9999)}`,
    type,
    origin,
    occurredOn: date,
    announcedDays: Math.max(1, Math.round(actualDays * optimism)),
    actualDays,
    daysRemaining: actualDays,
    playedThrough: false,
    recurrenceRisk: severityRisk(actualDays, spec.serious),
  };
}

/** Tire une blessure ou null. Pure : n'ajoute pas la blessure à player.injuries. */
export function rollInjury(player: Player, ctx: InjuryContext, profile: DifficultyProfile, rng: Rng, date: ISODate): Injury | null {
  if (!rng.chance(injuryProbability(player, ctx, profile))) return null;
  return makeInjury(drawInjuryType(rng), ctx.origin, date, rng);
}

// ── État ─────────────────────────────────────────────────────────────────

export function isInjured(player: Player): boolean {
  return player.injuries.some((inj) => inj.daysRemaining > 0);
}

/** Blessure active la plus longue, ou null. */
export function activeInjury(player: Player): Injury | null {
  let worst: Injury | null = null;
  for (const inj of player.injuries) {
    if (inj.daysRemaining > 0 && (!worst || inj.daysRemaining > worst.daysRemaining)) worst = inj;
  }
  return worst;
}

/** Séquelles permanentes éventuelles d'une blessure lourde. Mute player. */
function applyPermanentLoss(player: Player, injury: Injury, rng: Rng): void {
  if (injury.actualDays <= I.heavyInjuryDays || !rng.chance(I.permanentLoss.probIfHeavy)) return;
  const key = rng.pick(I.permanentLossKeys);
  const points = rng.int(I.permanentLoss.points[0], I.permanentLoss.points[1]);
  player.attributes[key] = clampAttribute(player.attributes[key] - points);
  injury.permanentLoss = { ...(injury.permanentLoss ?? {}), [key]: -points };
}

/** Rechute : nouvelle blessure du même type, plus courte, risque résiduel réduit. */
function relapseOf(origin: Injury, date: ISODate, rng: Rng): Injury {
  const [lo, hi] = I.recurrence.relativeDuration;
  const days = origin.actualDays * (lo + rng.next() * (hi - lo));
  const relapse = makeInjury(origin.type, origin.origin, date, rng, days);
  relapse.recurrenceRisk = I.recurrence.riskAfterRelapse;
  return relapse;
}

/**
 * Avance d'un jour toutes les blessures : guérison, séquelles, moral qui
 * s'effrite, rechutes dans la fenêtre de risque. Renvoie les blessures guéries.
 */
export function advanceInjuries(player: Player, date: ISODate, rng: Rng): Injury[] {
  const healed: Injury[] = [];
  const relapses: Injury[] = [];
  const currentlyInjured = isInjured(player);
  for (const injury of player.injuries) {
    if (injury.daysRemaining > 0) {
      injury.daysRemaining -= 1;
      player.morale = clampGauge(player.morale - I.moralePerWeekOut / 7);
      if (injury.daysRemaining === 0) {
        injury.healedOn = date;
        applyPermanentLoss(player, injury, rng);
        healed.push(injury);
      }
      continue;
    }
    if (!injury.healedOn || injury.recurrenceRisk <= 0) continue;
    const since = diffDays(injury.healedOn, date);
    if (since > I.recurrence.windowDays) {
      injury.recurrenceRisk = 0;
    } else if (!currentlyInjured && since > 0 && rng.chance(injury.recurrenceRisk / I.recurrence.windowDays)) {
      relapses.push(relapseOf(injury, date, rng));
      injury.recurrenceRisk = 0;
    }
  }
  player.injuries.push(...relapses);
  return healed;
}

/** Malus d'attributs (deltas négatifs) si le joueur joue blessé : −18 % sur le physique (mental pour une commotion). */
export function injuryMalus(player: Player): Partial<Attributes> {
  const injury = activeInjury(player);
  if (!injury) return {};
  const groups: readonly AttributeGroup[] = I.playThroughGroups[injury.type] ?? I.playThroughDefaultGroups;
  const out: Partial<Attributes> = {};
  for (const group of groups) {
    for (const key of ATTRIBUTE_GROUPS[group] as readonly AttributeKey[]) {
      const loss = Math.round(player.attributes[key] * (1 - I.playThrough.attributeMultiplier));
      if (loss > 0) out[key] = -loss;
    }
  }
  return out;
}

/**
 * Le joueur a disputé un match blessé : rallonge la blessure, marque `playedThrough`,
 * aggravation possible et risque de rechute accru. Mute player. Renvoie la blessure touchée ou null.
 */
export function playThroughInjury(player: Player, rng: Rng): Injury | null {
  const injury = activeInjury(player);
  if (!injury) return null;
  injury.playedThrough = true;
  let extra = I.playThrough.extraDaysPerMatch;
  if (rng.chance(I.playThrough.aggravationProb)) extra += I.playThroughAggravationExtraDays;
  injury.daysRemaining += extra;
  injury.actualDays += extra;
  injury.recurrenceRisk = clamp(injury.recurrenceRisk + I.recurrenceRisk.playedThroughBonus, 0, 1);
  return injury;
}
