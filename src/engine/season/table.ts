/**
 * Classement d'un championnat : points, tri, série des derniers résultats,
 * meilleurs buteurs et passeurs.
 *
 * Le classement est trié (points, différence, buts marqués, nom) ; la
 * confrontation directe est ignorée en Phase 1.
 */
import type { CareerState, Id, LeagueFormat, LeagueSeason, Match, Stats, TableRow } from '../types';
import { BALANCE } from '../config/balance';

export function emptyTable(clubIds: Id[]): TableRow[] {
  return clubIds.map((clubId) => ({
    clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, last5: [],
  }));
}

function rowOf(ls: LeagueSeason, clubId: Id): TableRow {
  let row = ls.table.find((r) => r.clubId === clubId);
  if (!row) {
    row = emptyTable([clubId])[0] as TableRow;
    ls.table.push(row);
  }
  return row;
}

function pushResult(row: TableRow, letter: 'V' | 'N' | 'D'): void {
  row.last5.push(letter);
  const max = BALANCE.table.last5Length;
  if (row.last5.length > max) row.last5.splice(0, row.last5.length - max);
}

/**
 * Applique un match joué au classement (score du temps réglementaire) et
 * retrie la table. `format` fournit les points ; à défaut, 3/1.
 */
export function applyResultToTable(ls: LeagueSeason, match: Match, format?: Pick<LeagueFormat, 'pointsWin' | 'pointsDraw'>): void {
  const result = match.result;
  if (!result) throw new Error(`Match ${match.id} sans résultat : impossible de mettre à jour le classement`);
  const pointsWin = format?.pointsWin ?? BALANCE.table.defaultPoints.win;
  const pointsDraw = format?.pointsDraw ?? BALANCE.table.defaultPoints.draw;
  const home = rowOf(ls, match.homeClubId);
  const away = rowOf(ls, match.awayClubId);
  const hg = result.homeGoals;
  const ag = result.awayGoals;

  for (const [row, forGoals, against] of [[home, hg, ag], [away, ag, hg]] as const) {
    row.played += 1;
    row.goalsFor += forGoals;
    row.goalsAgainst += against;
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }
  if (hg > ag) {
    home.won += 1; home.points += pointsWin; away.lost += 1;
    pushResult(home, 'V'); pushResult(away, 'D');
  } else if (hg < ag) {
    away.won += 1; away.points += pointsWin; home.lost += 1;
    pushResult(away, 'V'); pushResult(home, 'D');
  } else {
    home.drawn += 1; away.drawn += 1; home.points += pointsDraw; away.points += pointsDraw;
    pushResult(home, 'N'); pushResult(away, 'N');
  }
  if (match.matchday !== undefined && match.matchday > ls.currentMatchday) ls.currentMatchday = match.matchday;
  ls.table = sortTable(ls.table);
}

/**
 * Tri : points, différence de buts, buts marqués, puis nom (identifiant du
 * club à défaut de `clubNames`). Renvoie une copie triée, sans muter.
 */
export function sortTable(rows: TableRow[], _format?: LeagueFormat, clubNames?: Record<Id, string>): TableRow[] {
  const nameOf = (id: Id): string => clubNames?.[id] ?? id;
  return rows.slice().sort((a, b) =>
    b.points - a.points
    || b.goalDifference - a.goalDifference
    || b.goalsFor - a.goalsFor
    || nameOf(a.clubId).localeCompare(nameOf(b.clubId), 'fr'),
  );
}

/** Rang 1-based du club dans la table (0 si absent). */
export function rankOf(ls: LeagueSeason, clubId: Id): number {
  return sortTable(ls.table).findIndex((r) => r.clubId === clubId) + 1;
}

export interface ScorerRow { playerId: Id; clubId: Id; goals: number; assists: number; matches: number }

/** Clubs engagés dans la compétition (ligue de la saison, sinon ligue du monde). */
function competitionClubIds(state: CareerState, competitionId: Id): Set<Id> {
  const ls = state.season.leagues[competitionId];
  if (ls) return new Set(ls.clubIds);
  const league = state.world.leagues[competitionId];
  return new Set(league ? league.clubIds : Object.keys(state.world.clubs));
}

/** Stats du joueur incarné dans la compétition (ou total si non ventilé). */
function playerStatsIn(state: CareerState, competitionId: Id): Stats {
  return state.player.seasonStats.byCompetition[competitionId] ?? state.player.seasonStats.total;
}

/**
 * Lignes buteurs/passeurs de tous les joueurs de la compétition. Les stats
 * de saison des PNJ ne sont pas ventilées par compétition : en Phase 1 il
 * n'y a que le championnat, elles valent donc pour lui.
 */
function scorerRows(state: CareerState, competitionId: Id): ScorerRow[] {
  const clubs = competitionClubIds(state, competitionId);
  const rows: ScorerRow[] = [];
  for (const npc of Object.values(state.world.npcPlayers)) {
    if (!clubs.has(npc.clubId)) continue;
    const s = npc.seasonStats;
    if (s.goals === 0 && s.assists === 0) continue;
    rows.push({ playerId: npc.id, clubId: npc.clubId, goals: s.goals, assists: s.assists, matches: s.matches });
  }
  const player = state.player;
  if (clubs.has(player.contract.clubId)) {
    const s = playerStatsIn(state, competitionId);
    if (s.goals > 0 || s.assists > 0) {
      rows.push({ playerId: player.id, clubId: player.contract.clubId, goals: s.goals, assists: s.assists, matches: s.matches });
    }
  }
  return rows;
}

const DEFAULT_LIMIT = 10;

export function topScorers(state: CareerState, competitionId: Id, limit = DEFAULT_LIMIT): ScorerRow[] {
  return scorerRows(state, competitionId)
    .filter((r) => r.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.matches - b.matches || a.playerId.localeCompare(b.playerId))
    .slice(0, limit);
}

export function topAssists(state: CareerState, competitionId: Id, limit = DEFAULT_LIMIT): ScorerRow[] {
  return scorerRows(state, competitionId)
    .filter((r) => r.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals || a.matches - b.matches || a.playerId.localeCompare(b.playerId))
    .slice(0, limit);
}
