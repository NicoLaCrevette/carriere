/**
 * Accès aux derniers matchs joués par le joueur incarné, depuis
 * `state.matches` (rapports stockés dans `match.result.playerReport`).
 * Partagé par la réputation (deux matchs ratés → la presse s'emballe) et le
 * coach (banc après N mauvais matchs consécutifs).
 */
import type { CareerState, Match, PlayerMatchReport } from '../types';
import { compareDates } from '../calendar/dates';

export interface PlayedMatch { match: Match; report: PlayerMatchReport }

/** Matchs où le joueur a joué (minutes > 0), du plus récent au plus ancien, limités à `limit`. */
export function recentPlayerMatches(state: CareerState, limit: number, before?: string): PlayedMatch[] {
  const played: PlayedMatch[] = [];
  for (const match of Object.values(state.matches)) {
    const report = match.result?.playerReport;
    if (!report || report.minutesPlayed <= 0) continue;
    if (before !== undefined && match.id === before) continue;
    played.push({ match, report });
  }
  played.sort((a, b) => compareDates(b.match.date, a.match.date) || b.match.id.localeCompare(a.match.id));
  return played.slice(0, limit);
}

/** Notes des derniers matchs joués, du plus récent au plus ancien. */
export function recentRatings(state: CareerState, limit: number, before?: string): number[] {
  return recentPlayerMatches(state, limit, before).map((p) => p.report.rating);
}

/** Moyenne des notes des derniers matchs, ou null si aucun match joué. */
export function recentAverageRating(state: CareerState, limit: number): number | null {
  const ratings = recentRatings(state, limit);
  if (ratings.length === 0) return null;
  return ratings.reduce((s, r) => s + r, 0) / ratings.length;
}
