/**
 * Orchestrateur d'un match : contexte, état initial, horloge (mi-temps, temps
 * additionnel), boucle minute par minute jusqu'à la prochaine situation du
 * joueur, application d'une décision, clôture avec rapport complet. Modes
 * auto (autoplay) et interactif (l'UI fournit les décisions).
 */
import type {
  ActionOutcome, CareerState, ClassifiedAction, Coach, Id, Lineup, Match, MatchContext, MatchEvent, MatchResult, MatchState,
  PlayerMatchReport, Situation, Stats,
} from '../types';
import { BALANCE } from '../config/balance';
import { difficultyProfile } from '../config/difficulty';
import { matchActionKey, rngFor } from '../rng/derive';
import type { Rng } from '../rng/mulberry32';
import { ageAt } from '../calendar/dates';
import { activeDesert } from '../season/desert';
import { pickLineup, shouldSubOff } from '../season/lineupSelection';
import { drawInjuryType, makeInjury, rollInjury } from '../player/injuries';
import { recordRepetition, updateOpponentAdaptations } from './adaptation';
import { autoDecide } from './autoplay';
import { clamp, emptyMatchStats, pushEvent, scoreFor } from './matchEvents';
import { fallbackHeadline, halfTimeLine, summaryLine, touchesPerMinute } from './narration';
import { applyPassiveDrift, applyResultDeltas, computeEvaluation, finalizeRating, isManOfTheMatch } from './rating';
import { resolveAction, sanitizeAction } from './resolve';
import { resolveDeferredChance, resolveTeamChanceOfKind, simulateMinute, subOffPlayer } from './simulateMinute';
import { followUpSituation, initialSituationTarget, isSetPieceTaker, maybeCreateSituation } from './situations';
import { computeTeamStrength, footballerMap, refreshStrength } from './teamStrength';

const MS = BALANCE.matchSim;

function coachOf(state: CareerState, clubId: Id): Coach {
  const club = state.world.clubs[clubId];
  const npc = club ? state.world.npcs[club.coachId] : undefined;
  if (npc && npc.kind === 'coach') return npc as Coach;
  // Repli : coach anonyme, pour ne jamais planter un match.
  return {
    id: `coach-${clubId}`, kind: 'coach', firstName: 'Le', lastName: 'Coach', nationality: 'FRA', birthDate: '1975-01-01', clubId,
    personality: { warmth: 50, severity: 50, volatility: 50, mediaHunger: 50, loyalty: 50, keywords: [] },
    voice: { gender: 'homme', ageBand: 'adulte', pitch: 1, rate: 1, timbre: 'neutre' },
    card: { summary: '', updatedOn: state.currentDate }, active: true, createdOn: state.currentDate, real: false,
    preferredTactic: club?.tactic ?? { formation: '4-3-3', mentality: 'equilibree', style: 'possession', pressing: 0.5, tempo: 0.5, width: 0.5 },
    youthTrust: 50, patience: 50, ability: 50, contractEndsOn: '2030-06-30',
  };
}

/** Construit le contexte : onze via le coach IA, forces, côté du joueur, désert, réputation. */
export function buildMatchContext(state: CareerState, match: Match, mode: 'auto' | 'interactif'): MatchContext {
  const home = state.world.clubs[match.homeClubId];
  const away = state.world.clubs[match.awayClubId];
  if (!home || !away) throw new Error(`Clubs inconnus pour le match ${match.id}`);
  const rng = rngFor(state.seed, { scope: `compo:${match.id}`, index: 0 });
  const homeLineup = pickLineup(state, home.id, match, rng);
  const awayLineup = pickLineup(state, away.id, match, rng);
  const roster: MatchContext['roster'] = {};
  for (const id of [...home.squadIds, ...away.squadIds]) {
    const npc = state.world.npcPlayers[id];
    if (npc) roster[id] = npc;
  }
  const playerClub = state.player.contract.clubId;
  const playerSide = home.id === playerClub ? 'home' : away.id === playerClub ? 'away' : undefined;
  const player = playerSide ? state.player : undefined;
  const difficulty = difficultyProfile(state.settings.difficulty);
  const ctx: MatchContext = {
    match,
    seed: state.seed,
    home: { club: home, coach: coachOf(state, home.id), lineup: homeLineup, strength: { attack: 50, midfield: 50, defense: 50, goalkeeper: 50, overall: 50, pressing: 0.5, pace: 50 } },
    away: { club: away, coach: coachOf(state, away.id), lineup: awayLineup, strength: { attack: 50, midfield: 50, defense: 50, goalkeeper: 50, overall: 50, pressing: 0.5, pace: 50 } },
    roster,
    player,
    playerSide,
    difficulty,
    desert: player ? activeDesert(state.season) ?? undefined : undefined,
    mode,
    playerLeagueReputation: state.reputation.league.value,
  };
  const map = footballerMap(ctx);
  ctx.home.strength = computeTeamStrength(homeLineup, map, home.tactic, ctx.home.coach, !match.neutralVenue);
  ctx.away.strength = computeTeamStrength(awayLineup, map, away.tactic, ctx.away.coach, false);
  if (player) player.scouting.manMarkingLikely = (ctx.playerLeagueReputation ?? 0) >= difficulty.manMarkingFromLeagueReputation;
  return ctx;
}

function cloneLineup(l: Lineup): Lineup {
  return { formation: l.formation, starters: [...l.starters], bench: [...l.bench], captainId: l.captainId };
}

/**
 * Reprise d'un match sauvegardé (§6.7) : seul `MatchState` est persisté, le
 * contexte est reconstruit au coup d'envoi. Les forces d'équipe doivent donc
 * repartir des onzes courants, remplacements et expulsions compris, sinon la
 * suite du match diffère de ce qu'elle aurait été sans rechargement.
 */
export function resumeMatchState(ms: MatchState, ctx: MatchContext): MatchState {
  refreshStrength(ctx, 'home', ms.lineups.home);
  refreshStrength(ctx, 'away', ms.lineups.away);
  return ms;
}

export function createMatchState(ctx: MatchContext): MatchState {
  const player = ctx.player;
  const side = ctx.playerSide;
  const starter = !!player && !!side && ctx[side].lineup.starters.includes(player.id);
  const stats = emptyMatchStats();
  if (starter) stats.starts = 1;
  const targetRng = rngFor(ctx.seed, { scope: `cible:${ctx.match.id}`, index: 0 });
  return {
    matchId: ctx.match.id,
    minute: 0,
    addedTime: 0,
    half: 1,
    homeGoals: 0,
    awayGoals: 0,
    homeXg: 0,
    awayXg: 0,
    homePossessionMinutes: 0,
    momentum: 0,
    events: [],
    lineups: { home: cloneLineup(ctx.home.lineup), away: cloneLineup(ctx.away.lineup) },
    homeSubsUsed: 0,
    awaySubsUsed: 0,
    fatigue: {},
    playerOnPitch: starter,
    playerMinutes: 0,
    playerRating: BALANCE.rating.base,
    ratingLog: [],
    playerStats: stats,
    decisions: [],
    actionIndex: 0,
    metaAttempts: 0,
    repetitions: [],
    opponentAdaptations: { manMarking: false, doubled: false },
    lastSituationMinute: 0,
    summaryLines: [],
    tick: 0,
    tickActions: 0,
    situationTarget: starter && player ? initialSituationTarget(player.identity.position, targetRng, true, 90) : 0,
    passiveDrift: 0,
  };
}

// ── Horloge ──────────────────────────────────────────────────────────────

function addedTimeFor(ctx: MatchContext, half: 1 | 2): number {
  const rng = rngFor(ctx.seed, { scope: `${ctx.match.id}:temps_additionnel`, index: half });
  const [min, max] = half === 1 ? MS.addedTime.firstHalf : MS.addedTime.secondHalf;
  return rng.int(min, max);
}

/** Avance l'horloge d'une minute. Renvoie faux quand le match est terminé. */
function nextTick(ms: MatchState, ctx: MatchContext): boolean {
  if (ms.minute === 0) {
    ms.minute = 1;
    ms.tick = 1;
    ms.tickActions = 0;
    pushEvent(ms, { type: 'coup_d_envoi', side: 'neutre', involvesPlayer: false, detail: { domicile: ctx.home.club.shortName, exterieur: ctx.away.club.shortName } });
    return true;
  }
  if (ms.half === 1) {
    if (ms.minute < 45) ms.minute++;
    else if (ms.addedTime < addedTimeFor(ctx, 1)) {
      ms.addedTime++;
      if (ms.addedTime === 1) pushEvent(ms, { type: 'temps_additionnel', side: 'neutre', involvesPlayer: false, detail: { minutes: addedTimeFor(ctx, 1) } });
    } else {
      ms.half = 2;
      ms.minute = 46;
      ms.addedTime = 0;
      pushEvent(ms, { type: 'mi_temps', side: 'neutre', involvesPlayer: !!ctx.player, detail: { score: `${ms.homeGoals}-${ms.awayGoals}`, causerie: ctx.player ? halfTimeLine(ms, ctx) : '' } });
    }
  } else if (ms.half === 2) {
    if (ms.minute < 90) ms.minute++;
    else if (ms.addedTime < addedTimeFor(ctx, 2)) {
      ms.addedTime++;
      if (ms.addedTime === 1) pushEvent(ms, { type: 'temps_additionnel', side: 'neutre', involvesPlayer: false, detail: { minutes: addedTimeFor(ctx, 2) } });
    } else {
      return false;
    }
  } else {
    return false;
  }
  ms.tick = (ms.tick ?? 0) + 1;
  ms.tickActions = 0;
  return true;
}

function minuteRng(ms: MatchState, ctx: MatchContext): Rng {
  return rngFor(ctx.seed, matchActionKey(ctx.match.id, ms.tick ?? ms.minute, 0));
}

function auxRng(ms: MatchState, ctx: MatchContext): Rng {
  return rngFor(ctx.seed, { scope: `${ctx.match.id}:aux`, index: ms.actionIndex * 10 + (ms.tickActions ?? 0) });
}

/** Résume les minutes creuses écoulées depuis la dernière situation. */
function closeSummary(ms: MatchState, ctx: MatchContext, upTo: number, mood?: 'bench'): void {
  if (!ctx.player) return;
  const last = ms.summaryLines.length > 0 ? ms.summaryLines[ms.summaryLines.length - 1]!.to : 0;
  const from = Math.max(last, ms.lastSituationMinute) + 1;
  const to = upTo - 1;
  if (to - from < 1) return;
  ms.summaryLines.push({ from, to, text: summaryLine(ms, ctx, from, to, touchesPerMinute(ctx) * (to - from + 1), mood) });
}

/** Une minute complète. Renvoie une situation, la fin du match, ou null pour continuer. */
function stepMinute(ms: MatchState, ctx: MatchContext): { situation: Situation } | { finished: true } | null {
  if (!nextTick(ms, ctx)) return { finished: true };
  const rng = minuteRng(ms, ctx);
  const wasOnPitch = ms.playerOnPitch;
  const outcome = simulateMinute(ms, ctx, rng);
  if (ctx.player && ctx.playerSide) {
    if (!wasOnPitch && ms.playerOnPitch) closeSummary(ms, ctx, ms.minute, 'bench');
    updateOpponentAdaptations(ms, ctx, rng);
    if (ms.playerOnPitch) {
      const sub = shouldSubOff(ms, ctx, rng);
      if (sub.yes) subOffPlayer(ms, ctx, sub.reason ?? 'changement tactique', rng);
    }
    if (ms.playerOnPitch) {
      const situation = maybeCreateSituation(ms, ctx, rng, outcome);
      if (situation) {
        closeSummary(ms, ctx, ms.minute);
        ms.pendingSituation = situation;
        ms.lastSituationMinute = ms.minute;
        return { situation };
      }
    }
    applyPassiveDrift(ms, ctx);
  }
  if (outcome.teamChanceSide) resolveDeferredChance(outcome, ms, ctx, rng);
  return null;
}

/** Avance jusqu'à la prochaine situation du joueur ou la fin du match. */
export function advanceUntilSituation(ms: MatchState, ctx: MatchContext): { situation: Situation } | { finished: true } {
  if (ms.pendingSituation) return { situation: ms.pendingSituation };
  for (;;) {
    const step = stepMinute(ms, ctx);
    if (step && 'situation' in step) return step;
    if (step && 'finished' in step) {
      if (!ms.events.some((e) => e.type === 'coup_de_sifflet_final')) {
        closeSummary(ms, ctx, ms.minute + 1);
        pushEvent(ms, { type: 'coup_de_sifflet_final', side: 'neutre', involvesPlayer: false, detail: { score: `${ms.homeGoals}-${ms.awayGoals}` } });
      }
      return { finished: true };
    }
  }
}

/** Résout la décision du joueur : sanitisation, résolution, enchaînement (résolu en auto, laissé en attente en interactif). */
export function applyDecision(ms: MatchState, ctx: MatchContext, situation: Situation, action: ClassifiedAction, rawInput: string, timedOut: boolean): ActionOutcome {
  const clean = timedOut ? { ...situation.defaultAction } : sanitizeAction(situation, action, ms);
  const outcome = resolveAction(situation, clean, ctx, ms);
  // Enregistrée après la résolution : une action ne se pénalise pas elle-même, seules les suivantes sont « lues ».
  recordRepetition(ms, clean.action, situation.kind, situation.context.minute);
  ms.decisions.push({
    situationId: situation.id, minute: situation.context.minute, actionIndex: situation.actionIndex, kind: situation.kind,
    rawInput, timedOut, classified: clean, outcome,
  });
  ms.pendingSituation = undefined;
  const rng = auxRng(ms, ctx);

  if (outcome.kind === 'blessure') {
    subOffPlayer(ms, ctx, 'blessure', rng);
    return outcome;
  }
  if (!ms.playerOnPitch) return outcome;

  const next = followUpSituation(situation, outcome, ms, ctx, rng);
  if (next) {
    ms.pendingSituation = next;
    if (ctx.mode === 'auto') {
      const auto = autoDecide(next, ctx, ms, rng);
      applyDecision(ms, ctx, next, auto, '', false);
    }
  } else if (outcome.followUp === 'penalty' && ctx.playerSide && !isSetPieceTaker(ms, ctx, 'penalty')) {
    // Un coéquipier tire le penalty obtenu.
    resolveTeamChanceOfKind(ctx.playerSide, { kind: 'penalty', weight: 1, xg: BALANCE.baseProbability.penalty }, ms, ctx, rng);
  }
  return outcome;
}

function roundStats(stats: Stats): void {
  for (const key of Object.keys(stats) as (keyof Stats)[]) {
    if (key === 'xG' || key === 'xA' || key === 'distanceKm') stats[key] = Math.round(stats[key] * 100) / 100;
    else stats[key] = Math.round(stats[key]);
  }
}

function subMinutes(ms: MatchState, playerId: Id): { on?: number; off?: number; reason?: string } {
  const out: { on?: number; off?: number; reason?: string } = {};
  for (const e of ms.events) {
    if (e.type !== 'remplacement') continue;
    if (e.playerId === playerId) out.on = e.minute;
    if (e.secondaryPlayerId === playerId) {
      out.off = e.minute;
      out.reason = String(e.detail?.raison ?? '');
    }
  }
  return out;
}

function buildReport(ms: MatchState, ctx: MatchContext): PlayerMatchReport | undefined {
  const player = ctx.player;
  const side = ctx.playerSide;
  if (!player || !side) return undefined;
  const lineup = ctx[side].lineup;
  const started = lineup.starters.includes(player.id);
  if (!started && !lineup.bench.includes(player.id)) return undefined;
  const rng = rngFor(ctx.seed, { scope: `${ctx.match.id}:fin`, index: 0 });
  const minutes = Math.round(ms.playerMinutes);
  const stats = ms.playerStats;
  roundStats(stats);
  stats.matches = minutes > 0 ? 1 : 0;
  stats.starts = started ? 1 : 0;
  stats.minutes = minutes;
  const s = scoreFor(ms, side);
  const pos = player.identity.position;
  if (minutes > 0) {
    if (pos === 'GB') stats.goalsConceded = Math.max(stats.goalsConceded, s.contre);
    if (s.contre === 0 && minutes >= 60 && (pos === 'GB' || pos === 'DC' || pos === 'DD' || pos === 'DG')) stats.cleanSheets = 1;
  }
  let rating: number = BALANCE.rating.base;
  if (minutes > 0) {
    applyResultDeltas(ms, ctx);
    rating = finalizeRating(ms);
    stats.ratingSum = rating;
    stats.ratingCount = 1;
  }
  const subs = subMinutes(ms, player.id);
  const motm = minutes >= 30 && isManOfTheMatch(ms, ctx, rating, rng);
  if (motm) stats.motm = 1;
  const evaluation = computeEvaluation(ms, ctx, rating);
  const report: PlayerMatchReport = {
    matchId: ctx.match.id,
    started,
    minutesPlayed: minutes,
    subbedOnMinute: subs.on,
    subbedOffMinute: subs.off,
    subbedOffReason: subs.reason || undefined,
    rating,
    ratingLog: ms.ratingLog,
    stats,
    motm,
    evaluation,
    decisions: ms.decisions,
    metaAttempts: ms.metaAttempts,
  };
  report.headline = fallbackHeadline(report, ms, ctx);
  if (minutes > 0) {
    const signaled = ms.decisions.some((d) => d.outcome.kind === 'blessure');
    const playedThrough = ms.decisions.some((d) => d.classified.action === 'jouer_blesse');
    const age = ageAt(player.identity.birthDate, ctx.match.date);
    if (signaled) {
      report.injury = makeInjury(drawInjuryType(rng), 'match', ctx.match.date, rng);
      // Le joueur a serré les dents malgré l'alerte : la blessure en garde la trace.
      if (playedThrough) report.injury.playedThrough = true;
    } else {
      const injury = rollInjury(player, {
        origin: 'match', minutes, intensity: 1, age,
        contact: stats.foulsSuffered > 0 || stats.duelsTotal > 3,
        riskMultiplier: playedThrough ? 2 : 1,
      }, ctx.difficulty, rng, ctx.match.date);
      if (injury) report.injury = injury;
    }
  }
  return report;
}

/** Clôture : rapport du joueur, possession, affluence, résultat complet. Ne touche pas CareerState. */
export function finishMatch(ms: MatchState, ctx: MatchContext): MatchResult {
  if (!ms.events.some((e) => e.type === 'coup_de_sifflet_final')) {
    pushEvent(ms, { type: 'coup_de_sifflet_final', side: 'neutre', involvesPlayer: false, detail: { score: `${ms.homeGoals}-${ms.awayGoals}` } });
  }
  const ticks = Math.max(1, ms.tick ?? 90);
  const a = MS.attendance;
  const capacity = ctx.home.club.stadium.capacity;
  const attendance = Math.round(capacity * clamp(a.base + a.importanceWeight * ctx.match.importance / 100 + a.fanbaseWeight * ctx.home.club.fanbase / 100, 0.2, 1));
  return {
    homeGoals: ms.homeGoals,
    awayGoals: ms.awayGoals,
    homeXg: Math.round(ms.homeXg * 100) / 100,
    awayXg: Math.round(ms.awayXg * 100) / 100,
    homePossession: Math.round(clamp(ms.homePossessionMinutes / ticks, 0, 1) * 100),
    attendance,
    lineups: { home: ctx.home.lineup, away: ctx.away.lineup },
    events: ms.events,
    summaryLines: ms.summaryLines,
    playerReport: buildReport(ms, ctx),
  };
}

/** Match complet en mode auto (autoplay pour le joueur). */
export function runMatchAuto(ctx: MatchContext): MatchResult {
  const ms = createMatchState(ctx);
  for (;;) {
    const step = advanceUntilSituation(ms, ctx);
    if ('finished' in step) break;
    const action = autoDecide(step.situation, ctx, ms, auxRng(ms, ctx));
    applyDecision(ms, ctx, step.situation, action, '', false);
  }
  return finishMatch(ms, ctx);
}

/** Événements conservés pour un match de fond (buteurs, passeurs, cartons, changements) : la sauvegarde reste légère. */
const BACKGROUND_EVENT_TYPES = new Set<MatchEvent['type']>([
  'coup_d_envoi', 'but', 'but_csc', 'penalty_marque', 'penalty_rate', 'penalty_arrete', 'passe_decisive',
  'carton_jaune', 'carton_rouge', 'var_rouge', 'var_but_refuse', 'remplacement', 'blessure', 'mi_temps', 'coup_de_sifflet_final',
]);

/** Match entre deux clubs sans le joueur (autres affiches) : rapide, sans situations, événements essentiels seulement. */
export function runBackgroundMatch(state: CareerState, match: Match): MatchResult {
  const ctx = buildMatchContext(state, match, 'auto');
  ctx.player = undefined;
  ctx.playerSide = undefined;
  const result = runMatchAuto(ctx);
  result.events = result.events.filter((e) => BACKGROUND_EVENT_TYPES.has(e.type));
  return result;
}
