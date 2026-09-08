/**
 * Sélecteurs purs : toute lecture dérivée de `CareerState` passe par ici.
 * Aucune mutation, aucun accès Dexie. Les écrans n'appellent jamais le moteur
 * directement pour lire — seulement pour agir (via `careerStore`).
 */
import type {
  CareerState, Club, DayAction, DayKind, Id, Match, NpcPlayer, Player, Position, Stats, TableRow, ValuePoint,
} from '../engine/types';
import { ageAt, compareDates } from '../engine/calendar/dates';
import { dayActionsFor, dayKindFor, nextPlayerMatch } from '../engine/calendar/dayKind';
import { rankOf, sortTable, topAssists, topScorers } from '../engine/season/table';

export { topAssists, topScorers, rankOf };

export function selectPlayerClub(state: CareerState): Club | undefined {
  return state.world.clubs[state.player.contract.clubId];
}

export function selectPlayerAge(state: CareerState): number {
  return ageAt(state.player.identity.birthDate, state.currentDate);
}

export function selectOverall(state: CareerState): number {
  return state.player.overall;
}

export function selectFormLabel(state: CareerState): string {
  const f = state.player.form;
  if (f >= 3) return 'Excellente';
  if (f >= 1) return 'Bonne';
  if (f > -1) return 'Moyenne';
  if (f > -3) return 'Mauvaise';
  return 'Très mauvaise';
}

export function selectValueHistory(state: CareerState): ValuePoint[] {
  return state.player.marketValueHistory;
}

export function selectSeasonStats(state: CareerState): Stats {
  return state.player.seasonStats.total;
}

export function selectLeagueTable(state: CareerState): { table: TableRow[]; leagueId: Id } | undefined {
  const club = selectPlayerClub(state);
  if (!club) return undefined;
  const ls = state.season.leagues[club.leagueId];
  if (!ls) return undefined;
  return { table: sortTable(ls.table), leagueId: club.leagueId };
}

export function selectPlayerRank(state: CareerState): number {
  const club = selectPlayerClub(state);
  if (!club) return 0;
  const ls = state.season.leagues[club.leagueId];
  return ls ? rankOf(ls, club.id) : 0;
}

export function selectNextMatch(state: CareerState): Match | null {
  return nextPlayerMatch(state, state.currentDate);
}

/** Type de journée courante, sans muter le calendrier (contrairement à `todayCalendarDay`). */
export function selectTodayKind(state: CareerState): DayKind {
  const existing = state.calendar.find((d) => d.date === state.currentDate);
  return existing?.kind ?? dayKindFor(state, state.currentDate);
}

/** Actions proposées pour aujourd'hui, recalculées sans effet de bord. */
export function selectTodayActions(state: CareerState): DayAction[] {
  const existing = state.calendar.find((d) => d.date === state.currentDate);
  if (existing && existing.actions.length > 0) return existing.actions;
  const kind = existing?.kind ?? dayKindFor(state, state.currentDate);
  return dayActionsFor(state, { date: state.currentDate, kind, eventIds: [], actions: [], completed: false });
}

export function selectPositionHierarchy(state: CareerState, position?: Position): (Player | NpcPlayer)[] {
  const club = selectPlayerClub(state);
  const pos = position ?? state.player.identity.position;
  const ids = club?.positionHierarchy[pos] ?? [];
  return ids
    .map((id) => (id === state.player.id ? state.player : state.world.npcPlayers[id]))
    .filter((p): p is Player | NpcPlayer => !!p);
}

export function selectSquadByPosition(state: CareerState): Partial<Record<Position, (Player | NpcPlayer)[]>> {
  const club = selectPlayerClub(state);
  if (!club) return {};
  const out: Partial<Record<Position, (Player | NpcPlayer)[]>> = {};
  const ids = club.squadIds.includes(state.player.id) ? club.squadIds : [...club.squadIds, state.player.id];
  for (const id of ids) {
    const p = id === state.player.id ? state.player : state.world.npcPlayers[id];
    if (!p) continue;
    const pos = p.identity.position;
    (out[pos] ??= []).push(p);
  }
  for (const pos of Object.keys(out) as Position[]) {
    out[pos]!.sort((a, b) => b.overall - a.overall);
  }
  return out;
}

/** Matchs joués récemment par le club du joueur, du plus récent au plus ancien. */
export function selectRecentResults(state: CareerState, limit = 5): Match[] {
  const clubId = state.player.contract.clubId;
  return Object.values(state.matches)
    .filter((m) => m.status === 'joue' && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => compareDates(b.date, a.date))
    .slice(0, limit);
}

/** Dernier match joué par le joueur incarné (avec rapport), pour consultation depuis l'accueil. */
export function selectLastPlayerMatch(state: CareerState): Match | undefined {
  const clubId = state.player.contract.clubId;
  return Object.values(state.matches)
    .filter((m) => m.status === 'joue' && !!m.result?.playerReport && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => compareDates(b.date, a.date))[0];
}

export function selectAllMatchdays(state: CareerState): number[] {
  const club = selectPlayerClub(state);
  if (!club) return [];
  const ls = state.season.leagues[club.leagueId];
  if (!ls) return [];
  const days = new Set<number>();
  for (const id of ls.matchIds) {
    const m = state.matches[id];
    if (m?.matchday !== undefined) days.add(m.matchday);
  }
  return [...days].sort((a, b) => a - b);
}

export function selectMatchdayFixtures(state: CareerState, matchday: number): Match[] {
  const club = selectPlayerClub(state);
  if (!club) return [];
  const ls = state.season.leagues[club.leagueId];
  if (!ls) return [];
  return ls.matchIds
    .map((id) => state.matches[id])
    .filter((m): m is Match => !!m && m.matchday === matchday)
    .sort((a, b) => a.homeClubId.localeCompare(b.homeClubId));
}

export function selectPlayerMatchdayForClub(state: CareerState): number {
  const club = selectPlayerClub(state);
  if (!club) return 0;
  const ls = state.season.leagues[club.leagueId];
  return ls?.currentMatchday ?? 0;
}
