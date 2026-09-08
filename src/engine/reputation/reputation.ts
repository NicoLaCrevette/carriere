/**
 * Réputation : 8 jauges 0-100 avec historique daté (§11). Les deltas sont
 * bornés (±5 par appel, ±12 par jour) et passés par l'inertie propre à
 * chaque jauge : la réputation monde bouge lentement, celle des supporters
 * est volatile. Une dérive hebdomadaire ramène chaque jauge vers un niveau
 * « mérité » déduit de la note globale et des dernières performances.
 */
import type {
  CareerSetup, CareerState, Club, Gauge, ISODate, Match, PlayerMatchReport, Reputation, ReputationDeltas, ReputationKey,
} from '../types';
import { REPUTATION_KEYS } from '../types';
import { BALANCE } from '../config/balance';
import { clamp } from '../career/apply';
import { recentAverageRating, recentRatings } from '../season/recentMatches';

const CFG = BALANCE.reputation;

/** Arrondi au dixième pour garder des jauges lisibles. */
/** Arrondi au centième : l'inertie d'une jauge lente (monde 0.15) doit rester visible. */
function round1(v: number): number {
  return Math.round(v * 100) / 100;
}

function makeGauge(value: number, date: ISODate, reason: string): Gauge {
  const v = round1(clamp(value, BALANCE.bounds.gauge.min, BALANCE.bounds.gauge.max));
  return { value: v, history: [{ date, value: v, delta: 0, reason }] };
}

/** Réputation initiale selon le niveau de départ, ajustée par le prestige du club. */
export function initialReputation(setup: CareerSetup, club: Club, date: ISODate): Reputation {
  const base = CFG.initial[setup.startingLevel];
  const adjust = CFG.initialClubAdjust;
  const prestigeGap = club.prestige - adjust.prestigePivot;
  const exposure: readonly ReputationKey[] = ['league', 'world', 'media'];
  const local: readonly ReputationKey[] = ['club', 'supporters', 'coach'];
  const out = {} as Reputation;
  for (const key of REPUTATION_KEYS) {
    let value = base[key];
    if (exposure.includes(key)) value += prestigeGap * adjust.exposurePerPoint;
    if (local.includes(key)) value += prestigeGap * adjust.localPerPoint;
    out[key] = makeGauge(value, date, 'Début de carrière');
  }
  return out;
}

/**
 * Applique des deltas : borne ±5 par appel, inertie de la jauge, borne ±12
 * par jour (state.reputationDeltasToday), puis bornes 0-100. Renvoie les
 * deltas réellement appliqués (jauges inchangées omises).
 */
export function applyReputationDeltas(state: CareerState, deltas: ReputationDeltas, reason: string): ReputationDeltas {
  const applied: ReputationDeltas = {};
  const { min, max } = BALANCE.bounds.gauge;
  for (const key of REPUTATION_KEYS) {
    const raw = deltas[key];
    if (raw === undefined || !Number.isFinite(raw) || raw === 0) continue;
    const bounded = clamp(raw, -CFG.maxPerInteraction, CFG.maxPerInteraction);
    const withInertia = bounded * CFG.inertia[key];
    const today = state.reputationDeltasToday[key] ?? 0;
    const dayBounded = clamp(withInertia, -CFG.maxPerDay - today, CFG.maxPerDay - today);
    const gauge = state.reputation[key];
    const next = round1(clamp(gauge.value + dayBounded, min, max));
    const actual = round1(next - gauge.value);
    if (actual === 0) continue;
    gauge.value = next;
    gauge.history.push({ date: state.currentDate, value: next, delta: actual, reason });
    state.reputationDeltasToday[key] = round1(today + actual);
    applied[key] = actual;
  }
  return applied;
}

function addTo(target: ReputationDeltas, source: Partial<Record<ReputationKey, number>>, factor = 1): void {
  for (const [key, v] of Object.entries(source) as [ReputationKey, number][]) {
    target[key] = (target[key] ?? 0) + v * factor;
  }
}

function importanceMultiplier(importance: number): number {
  const { atZero, atHundred } = CFG.afterMatch.importanceMultiplier;
  return atZero + (atHundred - atZero) * clamp(importance, 0, 100) / 100;
}

/** Résultat du match du point de vue du club du joueur. */
function outcomeFor(state: CareerState, match: Match): 'win' | 'draw' | 'loss' {
  const result = match.result;
  if (!result) return 'draw';
  const home = match.homeClubId === state.player.contract.clubId;
  const forGoals = home ? result.homeGoals : result.awayGoals;
  const against = home ? result.awayGoals : result.homeGoals;
  return forGoals > against ? 'win' : forGoals < against ? 'loss' : 'draw';
}

/** Vrai si les N derniers matchs (celui-ci inclus) sont tous sous la note « ratée ». */
function mediaStormTriggered(state: CareerState, report: PlayerMatchReport, match: Match): boolean {
  const storm = CFG.mediaStorm;
  if (report.rating >= storm.badRating) return false;
  const previous = recentRatings(state, storm.afterConsecutiveBad - 1, match.id);
  if (previous.length < storm.afterConsecutiveBad - 1) return false;
  return previous.every((r) => r < storm.badRating);
}

/**
 * Deltas après un match de sélection nationale (§9) : la vitrine est la
 * sélection, le monde et les médias ; le club, son coach et ses supporters ne
 * bougent pas. Même bornage que tout le reste (`applyReputationDeltas`).
 */
export function reputationAfterInternationalMatch(state: CareerState, report: PlayerMatchReport, match: Match): ReputationDeltas {
  if (report.minutesPlayed <= 0) return {};
  const im = CFG.afterInternationalMatch;
  const minutesFactor = clamp(report.minutesPlayed / im.minutesForFullEffect, 0, 1);
  const enjeu = importanceMultiplier(match.importance);
  const deltas: ReputationDeltas = {};
  addTo(deltas, im.perRatingPoint, (report.rating - im.ratingPivot) * minutesFactor);
  addTo(deltas, im.goalBonus, report.stats.goals);
  addTo(deltas, im.assistBonus, report.stats.assists);
  if (report.motm) addTo(deltas, im.motmBonus);
  if (report.stats.redCards > 0) addTo(deltas, im.redCardMalus);
  for (const key of Object.keys(deltas) as ReputationKey[]) deltas[key] = round1((deltas[key] ?? 0) * enjeu);
  return applyReputationDeltas(state, deltas, `Sélection (note ${report.rating.toFixed(1)})`);
}

/**
 * Deltas déterministes après un match : note (autour du pivot), buts, passes,
 * homme du match, rouge, résultat, enjeu ; une note < 5 fait chuter
 * supporters et médias ; deux matchs ratés d'affilée déclenchent la presse.
 */
export function reputationAfterMatch(state: CareerState, report: PlayerMatchReport, match: Match): ReputationDeltas {
  if (report.minutesPlayed <= 0) return {};
  const am = CFG.afterMatch;
  const minutesFactor = clamp(report.minutesPlayed / am.minutesForFullEffect, 0, 1);
  const enjeu = importanceMultiplier(match.importance);
  const deltas: ReputationDeltas = {};

  const ratingGap = report.rating - am.ratingPivot;
  for (const key of REPUTATION_KEYS) deltas[key] = ratingGap * am.perRatingPoint[key] * minutesFactor;
  addTo(deltas, am.goalBonus, report.stats.goals);
  addTo(deltas, am.assistBonus, report.stats.assists);
  if (report.motm) addTo(deltas, am.motmBonus);
  if (report.stats.redCards > 0) addTo(deltas, am.redCardMalus);
  if (report.rating < am.lowRating.threshold) addTo(deltas, am.lowRating.extra);
  const outcome = outcomeFor(state, match);
  if (outcome === 'win') addTo(deltas, am.resultEffect.win, minutesFactor);
  if (outcome === 'loss') addTo(deltas, am.resultEffect.loss, minutesFactor);
  if (mediaStormTriggered(state, report, match)) {
    addTo(deltas, { media: -CFG.mediaStorm.mediaMalus, supporters: -CFG.mediaStorm.supportersMalus });
  }
  for (const key of REPUTATION_KEYS) deltas[key] = round1((deltas[key] ?? 0) * enjeu);

  const label = `Match (note ${report.rating.toFixed(1)}, ${outcome === 'win' ? 'victoire' : outcome === 'loss' ? 'défaite' : 'nul'})`;
  return applyReputationDeltas(state, deltas, label);
}

/** Niveau « mérité » d'une jauge : note globale et moyenne des derniers matchs, à l'échelle de la jauge. */
function meritedLevel(state: CareerState, key: ReputationKey): number {
  const drift = CFG.weeklyDrift;
  const merit = CFG.weeklyDriftMerit;
  const overallPart = (state.player.overall - drift.meritFromOverall.pivot) * drift.meritFromOverall.perPoint;
  const avg = recentAverageRating(state, merit.lastMatches);
  const ratingPart = avg === null ? 0 : (avg - drift.meritFromRating.pivot) * drift.meritFromRating.perPoint;
  const base = clamp(merit.base + overallPart + ratingPart, BALANCE.bounds.gauge.min, BALANCE.bounds.gauge.max);
  return base * merit.scale[key];
}

/** Dérive lente hebdomadaire vers le niveau mérité, modulée par l'inertie de chaque jauge. Compacte l'historique. */
export function weeklyReputationDrift(state: CareerState): void {
  const { min, max } = BALANCE.bounds.gauge;
  for (const key of REPUTATION_KEYS) {
    const gauge = state.reputation[key];
    const target = meritedLevel(state, key);
    const delta = round1((target - gauge.value) * CFG.weeklyDrift.share * CFG.inertia[key]);
    if (delta !== 0) {
      gauge.value = round1(clamp(gauge.value + delta, min, max));
      gauge.history.push({ date: state.currentDate, value: gauge.value, delta, reason: 'Dérive hebdomadaire' });
    }
    compactGaugeHistory(gauge);
  }
}

/** Compacte l'historique : derniers 200 points + un point par mois pour le reste. */
export function compactGaugeHistory(gauge: Gauge): void {
  const keep = CFG.history.keepLast;
  if (gauge.history.length <= keep) return;
  const older = gauge.history.slice(0, gauge.history.length - keep);
  const recent = gauge.history.slice(gauge.history.length - keep);
  const monthly: Gauge['history'] = [];
  if (CFG.history.monthlyPoints) {
    let lastMonth = '';
    for (const point of older) {
      const month = point.date.slice(0, 7);
      if (month !== lastMonth) {
        monthly.push(point);
        lastMonth = month;
      }
    }
  }
  gauge.history = [...monthly, ...recent];
}
