import { describe, expect, it } from 'vitest';
import { buildSeason, generateLeagueFixtures, seasonLabel } from '../world/generateCalendar';
import { buildWorld, generateFictionalDataset } from '../world/loadDataset';
import { mulberry32 } from '../rng/mulberry32';
import { addDays, compareDates, isBetween } from '../calendar/dates';
import type { Id } from '../types';

describe('generateLeagueFixtures', () => {
  const clubIds: Id[] = Array.from({ length: 18 }, (_, i) => `club${i + 1}`);
  const fixtures = generateLeagueFixtures(clubIds, mulberry32(12345));

  it('produit 34 journées de 9 matchs (18 clubs)', () => {
    const byMatchday = new Map<number, number>();
    for (const f of fixtures) byMatchday.set(f.matchday, (byMatchday.get(f.matchday) ?? 0) + 1);
    expect(byMatchday.size).toBe(34);
    for (const count of byMatchday.values()) expect(count).toBe(9);
  });

  it('chaque club joue exactement une fois par journée', () => {
    const byMatchday = new Map<number, Set<Id>>();
    for (const f of fixtures) {
      const set = byMatchday.get(f.matchday) ?? new Set<Id>();
      expect(set.has(f.homeClubId)).toBe(false);
      expect(set.has(f.awayClubId)).toBe(false);
      set.add(f.homeClubId);
      set.add(f.awayClubId);
      byMatchday.set(f.matchday, set);
    }
    for (const set of byMatchday.values()) expect(set.size).toBe(18);
  });

  it('chaque paire de clubs se rencontre deux fois, domicile/extérieur inversés', () => {
    const seen = new Map<string, { count: number; homes: Set<Id> }>();
    for (const f of fixtures) {
      const key = [f.homeClubId, f.awayClubId].sort().join('|');
      const entry = seen.get(key) ?? { count: 0, homes: new Set<Id>() };
      entry.count += 1;
      entry.homes.add(f.homeClubId);
      seen.set(key, entry);
    }
    expect(seen.size).toBe((18 * 17) / 2);
    for (const entry of seen.values()) {
      expect(entry.count).toBe(2);
      expect(entry.homes.size).toBe(2);
    }
  });
});

describe('buildSeason', () => {
  const dataset = generateFictionalDataset(42);
  const world = buildWorld(dataset, 42, '2026-07-01');
  const league = Object.values(world.leagues)[0]!;
  const playerClubId = league.clubIds[0]!;
  const { season, matches, calendar } = buildSeason(world, 2026, playerClubId, 42);
  const leagueMatches = matches.filter((m) => m.competitionId === league.id);

  it('34 journées de 9 matchs pour la ligue (306 matchs)', () => {
    const ls = season.leagues[league.id]!;
    expect(ls.totalMatchdays).toBe(34);
    expect(leagueMatches.length).toBe(306);
    const byMatchday = new Map<number, number>();
    for (const m of leagueMatches) byMatchday.set(m.matchday as number, (byMatchday.get(m.matchday as number) ?? 0) + 1);
    expect(byMatchday.size).toBe(34);
    for (const count of byMatchday.values()) expect(count).toBe(9);
  });

  it('chaque paire de clubs se rencontre deux fois, avec inversion', () => {
    const seen = new Map<string, number>();
    for (const m of leagueMatches) {
      const key = [m.homeClubId, m.awayClubId].sort().join('|');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect(seen.size).toBe((18 * 17) / 2);
    for (const count of seen.values()) expect(count).toBe(2);
  });

  it('un seul match par club et par journée', () => {
    const byMatchday = new Map<number, Set<Id>>();
    for (const m of leagueMatches) {
      const set = byMatchday.get(m.matchday as number) ?? new Set<Id>();
      expect(set.has(m.homeClubId)).toBe(false);
      expect(set.has(m.awayClubId)).toBe(false);
      set.add(m.homeClubId);
      set.add(m.awayClubId);
      byMatchday.set(m.matchday as number, set);
    }
  });

  it('les dates progressent avec le numéro de journée', () => {
    const matchdays = [...new Set(leagueMatches.map((m) => m.matchday as number))].sort((a, b) => a - b);
    let previousLastDate: string | null = null;
    for (const md of matchdays) {
      const dates = leagueMatches.filter((m) => m.matchday === md).map((m) => m.date).sort(compareDates);
      const first = dates[0] as string;
      if (previousLastDate) expect(compareDates(previousLastDate, first)).toBeLessThan(0);
      previousLastDate = dates[dates.length - 1] as string;
    }
  });

  it("aucun match ne tombe pendant une trêve internationale ou la trêve hivernale", () => {
    const winterBreak: [string, string] = ['2026-12-23', '2027-01-06'];
    const allBreaks = [...season.internationalBreaks, winterBreak];
    for (const m of matches) {
      for (const [from, to] of allBreaks) {
        expect(isBetween(m.date, from, to)).toBe(false);
      }
    }
  });

  it('le calendrier couvre chaque jour du 1er juillet au 30 juin, sans trou', () => {
    expect(calendar[0]!.date).toBe('2026-07-01');
    expect(calendar[calendar.length - 1]!.date).toBe('2027-06-30');
    let cursor = '2026-07-01';
    for (const day of calendar) {
      expect(day.date).toBe(cursor);
      cursor = addDays(cursor, 1);
    }
  });

  it('seasonLabel formate « 2026-27 »', () => {
    expect(seasonLabel(2026)).toBe('2026-27');
  });
});
