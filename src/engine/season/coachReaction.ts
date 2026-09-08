/**
 * Réactions du coach IA : confiance après match (updateCoachTrust) et sortie
 * anticipée en match (shouldSubOff). La tolérance de la difficulté (§6.9)
 * module la sévérité des sanctions.
 */
import type { CareerState, Coach, DifficultyProfile, Match, MatchContext, MatchState, PlayerMatchReport } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { difficultyProfile } from '../config/difficulty';
import { clamp } from '../career/apply';
import { recentRatings } from './recentMatches';

const C = BALANCE.coach;

/** Patience effective : moyenne entre la patience du coach et celle imposée par la difficulté. */
export function effectivePatience(coach: Coach | undefined, profile: DifficultyProfile): number {
  const fromDifficulty = C.patienceByTolerance[profile.coachTolerance];
  return coach ? (coach.patience + fromDifficulty) / 2 : fromDifficulty;
}

function coachOf(state: CareerState): Coach | undefined {
  const club = state.world.clubs[state.player.contract.clubId];
  const npc = club ? state.world.npcs[club.coachId] : undefined;
  return npc && npc.kind === 'coach' ? (npc as Coach) : undefined;
}

/**
 * Confiance du coach après un match : + après une bonne note, − forte sous
 * 5.5, bonus décisif, malus cartons, série de mauvais matchs. Les malus sont
 * amplifiés ou atténués par la tolérance de la difficulté. Mute player.
 */
export function updateCoachTrust(state: CareerState, report: PlayerMatchReport, match: Match): { delta: number; reason: string } {
  if (report.minutesPlayed <= 0) return { delta: 0, reason: 'Pas entré en jeu' };
  const profile = difficultyProfile(state.settings.difficulty);
  const t = C.trust;
  const after = C.trustAfterMatch;
  const minutesFactor = clamp(report.minutesPlayed / after.minutesForFullEffect, 0.25, 1);
  const reasons: string[] = [];

  let delta = (report.rating - after.ratingPivot) * t.perRatingPoint * minutesFactor;
  reasons.push(report.rating >= C.goodMatchRating ? 'bon match' : report.rating < C.badMatchRating ? 'match raté' : 'match correct');
  if (report.rating < after.strongMalusBelowRating) {
    delta -= after.strongMalus;
    reasons.push('prestation indigne');
  }
  if (report.stats.goals + report.stats.assists > 0) {
    delta += t.decisiveBonus;
    reasons.push('décisif');
  }
  if (report.stats.redCards > 0) {
    delta -= t.redCardMalus;
    reasons.push('carton rouge');
  } else if (report.stats.yellowCards > 0) {
    delta -= t.cardMalus * report.stats.yellowCards;
    reasons.push('averti');
  }
  const previous = recentRatings(state, C.benchAfterConsecutiveBad - 1, match.id);
  const streak = report.rating < C.badMatchRating
    && previous.length >= C.benchAfterConsecutiveBad - 1
    && previous.every((r) => r < C.badMatchRating);
  if (streak) {
    delta -= after.strongMalus;
    reasons.push('série de mauvais matchs');
  }
  if (delta < 0) delta *= after.negativeFactorByTolerance[profile.coachTolerance];
  delta = clamp(delta, -t.maxPerMatch, t.maxPerMatch);
  delta = Math.round(delta * 10) / 10;

  const { min, max } = BALANCE.bounds.gauge;
  state.player.coachTrust = Math.round(clamp(state.player.coachTrust + delta, min, max) * 10) / 10;
  const coach = coachOf(state);
  const who = coach ? `${coach.lastName}` : 'Le coach';
  return { delta, reason: `${who} : ${reasons.join(', ')}` };
}

/**
 * Dérive hebdomadaire de la confiance du coach vers le niveau mérité : rang
 * dans la hiérarchie au poste et forme. Un jeune qui progresse regagne la
 * confiance sans jouer ; un titulaire qui décline la perd. Mute player.
 */
export function weeklyCoachTrustDrift(state: CareerState): number {
  const p = state.player;
  const club = state.world.clubs[p.contract.clubId];
  if (!club) return 0;
  const m = C.trustMerit;
  // Rang parmi les joueurs du MÊME poste (un ailier reclassé ne compte pas comme un concurrent direct).
  const position = p.identity.position;
  const samePosition = (club.positionHierarchy[position] ?? []).filter((id) => id === p.id || state.world.npcPlayers[id]?.identity.position === position);
  const rank = samePosition.indexOf(p.id);
  const base = rank < 0 ? m.beyond : (m.byRank[rank] ?? m.beyond);
  const { min, max } = BALANCE.bounds.gauge;
  const merit = clamp(base + m.formPerPoint * p.form, min, max);
  const delta = (merit - p.coachTrust) * C.trust.weeklyDriftToMerit;
  p.coachTrust = Math.round(clamp(p.coachTrust + delta, min, max) * 10) / 10;
  return delta;
}

/** Fraîcheur estimée du joueur en match : fitness de départ moins la fatigue accumulée. */
function freshness(ms: MatchState, ctx: MatchContext): number {
  const player = ctx.player;
  if (!player) return 100;
  return player.fitness - ms.playerMinutes * BALANCE.fitness.fatiguePerMatchMinute * BALANCE.playerAfterMatch.intensity;
}

/**
 * Décide, en match, si le coach sort le joueur : mauvais match dans la
 * fenêtre 55e-72e (probabilité selon la patience), ou fraîcheur épuisée.
 * Un remplaçant entré récemment n'est pas ressorti.
 */
export function shouldSubOff(ms: MatchState, ctx: MatchContext, rng: Rng): { yes: boolean; reason?: string } {
  if (!ms.playerOnPitch || !ctx.player || !ctx.playerSide) return { yes: false };
  const cfg = C.subOff;
  const extra = C.subOffExtra;
  const cameOnLate = ms.playerMinutes < ms.minute - extra.subbedOnGraceMinutes;
  const recentlyOn = cameOnLate && ms.playerMinutes < extra.subbedOnGraceMinutes;
  if (recentlyOn || ms.minute < cfg.fromMinute) return { yes: false };

  if (freshness(ms, ctx) < extra.freshnessBelow) return { yes: true, reason: 'fatigue' };

  if (ms.minute <= extra.untilMinute && ms.playerRating < cfg.ratingThreshold && !cameOnLate) {
    const patience = effectivePatience(ctx[ctx.playerSide].coach, ctx.difficulty);
    const perMatch = cfg.baseProb * (1 + cfg.patienceInfluence * (50 - patience) / 50);
    const window = extra.untilMinute - cfg.fromMinute + 1;
    if (rng.chance(clamp(perMatch / window, 0, 1))) return { yes: true, reason: 'mauvais match' };
  }
  return { yes: false };
}
