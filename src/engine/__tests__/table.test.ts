import { describe, expect, it } from 'vitest';
import { applyResultToTable, emptyTable, rankOf, sortTable, topAssists, topScorers } from '../season/table';
import { makeMatch, makeNpc, makeResult, makeState } from './helpers/seasonFixtures';
import type { LeagueSeason, Match } from '../types';

function played(id: string, home: string, away: string, hg: number, ag: number, matchday = 1): Match {
  const m = makeMatch(id, home, away, '2026-08-15');
  m.matchday = matchday;
  m.status = 'joue';
  m.result = makeResult(hg, ag);
  return m;
}

function leagueSeason(): LeagueSeason {
  return makeState().season.leagues.l1 as LeagueSeason;
}

describe('table : points et tri', () => {
  it('emptyTable crée une ligne vierge par club', () => {
    const rows = emptyTable(['a', 'b']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ clubId: 'a', played: 0, points: 0, last5: [] });
  });

  it('attribue 3 points pour une victoire, 1 pour un nul, 0 pour une défaite', () => {
    const ls = leagueSeason();
    applyResultToTable(ls, played('m1', 'a', 'b', 2, 0));
    applyResultToTable(ls, played('m2', 'c', 'd', 1, 1));
    const row = (id: string) => ls.table.find((r) => r.clubId === id)!;
    expect(row('a')).toMatchObject({ played: 1, won: 1, points: 3, goalsFor: 2, goalsAgainst: 0, goalDifference: 2, last5: ['V'] });
    expect(row('b')).toMatchObject({ played: 1, lost: 1, points: 0, goalDifference: -2, last5: ['D'] });
    expect(row('c')).toMatchObject({ drawn: 1, points: 1, last5: ['N'] });
    expect(row('d')).toMatchObject({ drawn: 1, points: 1, last5: ['N'] });
  });

  it('respecte le format de la ligue (points par victoire) et la journée courante', () => {
    const ls = leagueSeason();
    applyResultToTable(ls, played('m1', 'a', 'b', 1, 0, 3), { pointsWin: 2, pointsDraw: 1 });
    expect(ls.table.find((r) => r.clubId === 'a')!.points).toBe(2);
    expect(ls.currentMatchday).toBe(3);
  });

  it('trie par points, différence, buts marqués puis nom', () => {
    const rows = emptyTable(['d', 'c', 'b', 'a']);
    const set = (id: string, points: number, gf: number, ga: number) => {
      const r = rows.find((x) => x.clubId === id)!;
      r.points = points; r.goalsFor = gf; r.goalsAgainst = ga; r.goalDifference = gf - ga;
    };
    set('a', 6, 5, 3); // +2
    set('b', 6, 8, 5); // +3 → devant a
    set('c', 6, 6, 3); // +3, plus de buts que... non : même diff que b, moins de buts → derrière b
    set('d', 3, 9, 0);
    const sorted = sortTable(rows).map((r) => r.clubId);
    expect(sorted).toEqual(['b', 'c', 'a', 'd']);
  });

  it('départage sur le nom à égalité parfaite et ne mute pas le tableau', () => {
    const rows = emptyTable(['zeta', 'alpha']);
    const sorted = sortTable(rows, undefined, { zeta: 'Zeta', alpha: 'Alpha' });
    expect(sorted.map((r) => r.clubId)).toEqual(['alpha', 'zeta']);
    expect(rows.map((r) => r.clubId)).toEqual(['zeta', 'alpha']);
  });

  it('rankOf renvoie un rang 1-based', () => {
    const ls = leagueSeason();
    applyResultToTable(ls, played('m1', 'a', 'b', 0, 3));
    expect(rankOf(ls, 'b')).toBe(1);
    expect(rankOf(ls, 'a')).toBe(4);
    expect(rankOf(ls, 'inconnu')).toBe(0);
  });

  it('conserve seulement les 5 derniers résultats, du plus ancien au plus récent', () => {
    const ls = leagueSeason();
    for (let i = 0; i < 7; i++) applyResultToTable(ls, played(`m${i}`, 'a', 'b', i % 2 === 0 ? 1 : 0, i % 2 === 0 ? 0 : 1));
    const row = ls.table.find((r) => r.clubId === 'a')!;
    expect(row.last5).toHaveLength(5);
    expect(row.last5).toEqual(['V', 'D', 'V', 'D', 'V']);
    expect(row.played).toBe(7);
  });
});

describe('table : buteurs et passeurs', () => {
  it('classe PNJ et joueur incarné par buts puis passes', () => {
    const state = makeState();
    state.world.npcPlayers['a-1']!.seasonStats.goals = 4;
    state.world.npcPlayers['b-2']!.seasonStats.goals = 7;
    state.world.npcPlayers['b-2']!.seasonStats.assists = 1;
    state.world.npcPlayers['c-3']!.seasonStats.goals = 7;
    state.world.npcPlayers['c-3']!.seasonStats.assists = 3;
    state.player.seasonStats.byCompetition.l1 = { ...state.player.seasonStats.total, goals: 5, assists: 6, matches: 12 };
    const scorers = topScorers(state, 'l1', 3);
    expect(scorers.map((r) => r.playerId)).toEqual(['c-3', 'b-2', 'joueur']);
    expect(scorers[2]).toMatchObject({ clubId: 'a', goals: 5, assists: 6, matches: 12 });
    const assists = topAssists(state, 'l1');
    expect(assists[0]!.playerId).toBe('joueur');
    expect(assists[1]!.playerId).toBe('c-3');
  });

  it('ignore les joueurs des clubs hors compétition', () => {
    const state = makeState();
    const outsider = makeNpc('x-1', 'x', 'BU', 80, { goals: 30 });
    state.world.npcPlayers[outsider.id] = outsider;
    expect(topScorers(state, 'l1').some((r) => r.playerId === 'x-1')).toBe(false);
  });
});
