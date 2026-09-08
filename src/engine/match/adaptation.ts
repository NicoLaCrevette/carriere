/**
 * L'adversaire s'adapte (§6.4) : détecteur de répétition, marquage
 * individuel selon la réputation, scouting après cinq matchs.
 */
import type { DecisionRecord, DifficultyProfile, MatchActionId, MatchContext, MatchState, Player, SituationKind } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { fullName, otherSide, pushEvent } from './matchEvents';
import { getFootballer } from './teamStrength';

const A = BALANCE.adaptation;

/** −8 % cumulés par répétition de la même action dans la même situation, décroissance sur 20 minutes. */
export function repetitionMultiplier(ms: MatchState, action: MatchActionId, kind: SituationKind, minute: number): number {
  let penalty = 0;
  for (const r of ms.repetitions) {
    if (r.action !== action || r.kind !== kind) continue;
    const age = minute - r.minute;
    if (age < 0 || age > A.repetitionDecayMinutes) continue;
    penalty += A.repetitionPenalty * (1 - age / A.repetitionDecayMinutes);
  }
  return Math.max(A.repetitionMinMultiplier, 1 - penalty);
}

/** Nombre de répétitions encore « en mémoire » du défenseur. */
export function repetitionCount(ms: MatchState, action: MatchActionId, kind: SituationKind, minute: number): number {
  return ms.repetitions.filter((r) => r.action === action && r.kind === kind && minute - r.minute <= A.repetitionDecayMinutes && minute >= r.minute).length;
}

export function recordRepetition(ms: MatchState, action: MatchActionId, kind: SituationKind, minute: number): void {
  ms.repetitions.push({ action, kind, minute });
}

/** Changer de registre (décrocher, remise, profondeur…) réduit le malus de marquage. */
export function isCounterMove(action: MatchActionId): boolean {
  return (A.counterMoves as readonly string[]).includes(action);
}

/** Multiplicateur de marquage individuel sur une action avec ballon. */
export function manMarkingMultiplier(ms: MatchState, action: MatchActionId, withBall: boolean): number {
  const adapt = ms.opponentAdaptations;
  if (!adapt.manMarking || !withBall) return 1;
  const base = adapt.doubled ? A.doubledMalus : A.manMarkingMalus;
  return Math.min(1, isCounterMove(action) ? base * A.counterMoveBonus : base);
}

/** Malus de scouting : proportionnel à la fréquence de l'action dans le profil connu. */
export function scoutingMultiplier(player: Player | undefined, action: MatchActionId): number {
  if (!player || !player.scouting.profiled) return 1;
  const freq = player.scouting.actionFrequency[action] ?? 0;
  return 1 - A.scoutingMaxMalus * Math.min(1, freq);
}

/** Décide (ou reconsidère) un marquage individuel sur le joueur incarné. */
export function considerManMarking(ms: MatchState, ctx: MatchContext, rng: Rng): void {
  if (!ctx.player || !ctx.playerSide || !ms.playerOnPitch || ms.opponentAdaptations.manMarking) return;
  if (ctx.player.identity.position === 'GB') return;
  const reputation = ctx.playerLeagueReputation ?? 0;
  const threshold = ctx.difficulty.manMarkingFromLeagueReputation;
  if (reputation < threshold) return;
  const prob = A.manMarkingProbAtThreshold + A.manMarkingProbPerReputationPoint * (reputation - threshold);
  if (!rng.chance(Math.min(1, prob))) return;
  const doubled = reputation >= threshold + A.doubledFromReputationOverThreshold;
  ms.opponentAdaptations = { manMarking: true, since: ms.minute, doubled };
  const opponent = otherSide(ctx.playerSide);
  const marker = ms.lineups[opponent].starters
    .map((id) => getFootballer(ctx, id))
    .filter((f) => f.position === 'DC' || f.position === 'MDC' || f.position === 'DD' || f.position === 'DG')
    .sort((a, b) => b.attributes.placement - a.attributes.placement)[0];
  pushEvent(ms, {
    type: 'marquage_individuel', side: opponent, playerId: marker?.id, secondaryPlayerId: ctx.player.id, involvesPlayer: true,
    detail: { marqueur: marker ? fullName(marker.identity) : 'un défenseur', double: doubled },
    narration: doubled
      ? `${ctx[opponent].coach.lastName} a décidé de te faire doubler : deux joueurs sur toi à chaque ballon.`
      : `${marker ? fullName(marker.identity) : 'Un défenseur'} te colle désormais au marquage individuel, consigne du banc adverse.`,
  });
}

/** Aux minutes de décision (coup d'envoi, mi-temps), le coach adverse évalue un marquage individuel. */
export function updateOpponentAdaptations(ms: MatchState, ctx: MatchContext, rng: Rng): void {
  const decisionMinutes = A.decisionMinutes as readonly number[];
  const atDecision = decisionMinutes.some((m) => (m === 0 ? ms.minute <= 1 : ms.minute === m + 1)) && ms.addedTime === 0;
  if (!atDecision) return;
  considerManMarking(ms, ctx, rng);
}

/** Met à jour le profil de scouting du joueur après un match (lissage exponentiel des fréquences). */
export function updateScouting(player: Player, decisions: DecisionRecord[], profile: DifficultyProfile): void {
  void profile;
  const counts = new Map<MatchActionId, number>();
  let total = 0;
  for (const d of decisions) {
    const action = d.classified.action;
    if (action === 'aucune' || d.classified.meta) continue;
    counts.set(action, (counts.get(action) ?? 0) + 1);
    total++;
  }
  const s = A.scoutingSmoothing;
  const next: Partial<Record<MatchActionId, number>> = {};
  const keys = new Set<MatchActionId>([...(Object.keys(player.scouting.actionFrequency) as MatchActionId[]), ...counts.keys()]);
  for (const key of keys) {
    const prev = player.scouting.actionFrequency[key] ?? 0;
    const fresh = total > 0 ? (counts.get(key) ?? 0) / total : prev;
    const value = total > 0 ? prev * (1 - s) + fresh * s : prev;
    if (value > 0.005) next[key] = Math.round(value * 1000) / 1000;
  }
  player.scouting.actionFrequency = next;
  player.scouting.profiled = player.careerStats.matches >= A.scoutingAfterMatches;
}
