import { describe, expect, it } from 'vitest';
import { activeDesert, advanceDesert, scheduleDesertSpells } from '../season/desert';
import { DIFFICULTY_PROFILES } from '../config/difficulty';
import { BALANCE } from '../config/balance';
import { mulberry32 } from '../rng/mulberry32';
import { makeState } from './helpers/seasonFixtures';
import type { DesertSpell } from '../types';

const MATCHES = 38;

function overlapping(spells: DesertSpell[]): boolean {
  for (let i = 0; i < spells.length; i++) {
    for (let j = i + 1; j < spells.length; j++) {
      const a = spells[i]!, b = spells[j]!;
      if (a.startMatchIndex < b.startMatchIndex + b.lengthMatches && b.startMatchIndex < a.startMatchIndex + a.lengthMatches) return true;
    }
  }
  return false;
}

describe('desert : programmation', () => {
  it('programme autant de traversées que la difficulté (1 / 2 / 3)', () => {
    for (const profile of Object.values(DIFFICULTY_PROFILES)) {
      const season = makeState().season;
      scheduleDesertSpells(season, profile, MATCHES, mulberry32(7));
      expect(season.desertSpells).toHaveLength(profile.desertSpellsPerSeason);
    }
  });

  it('respecte les longueurs 4-8, les bornes de la saison et aucun chevauchement (100 graines)', () => {
    const [minLen, maxLen] = BALANCE.desert.lengthMatches;
    for (let seed = 1; seed <= 100; seed++) {
      const season = makeState().season;
      scheduleDesertSpells(season, DIFFICULTY_PROFILES.impitoyable, MATCHES, mulberry32(seed));
      expect(season.desertSpells).toHaveLength(3);
      for (const s of season.desertSpells) {
        expect(s.lengthMatches).toBeGreaterThanOrEqual(minLen);
        expect(s.lengthMatches).toBeLessThanOrEqual(maxLen);
        expect(s.startMatchIndex).toBeGreaterThanOrEqual(BALANCE.desert.earliestMatchIndex);
        expect(s.startMatchIndex + s.lengthMatches).toBeLessThanOrEqual(MATCHES);
        expect(s.finishingMultiplier).toBe(BALANCE.desert.finishingMultiplier);
        expect(s.elapsed).toBe(0);
      }
      expect(overlapping(season.desertSpells)).toBe(false);
      const starts = season.desertSpells.map((s) => s.startMatchIndex);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    }
  });

  it('est déterministe pour une même graine et varie avec la graine', () => {
    const a = makeState().season, b = makeState().season, c = makeState().season;
    scheduleDesertSpells(a, DIFFICULTY_PROFILES.exigeant, MATCHES, mulberry32(42));
    scheduleDesertSpells(b, DIFFICULTY_PROFILES.exigeant, MATCHES, mulberry32(42));
    scheduleDesertSpells(c, DIFFICULTY_PROFILES.exigeant, MATCHES, mulberry32(43));
    expect(a.desertSpells).toEqual(b.desertSpells);
    expect(a.desertSpells).not.toEqual(c.desertSpells);
  });

  it('abandonne les traversées qui ne tiennent pas dans une saison trop courte', () => {
    const season = makeState().season;
    scheduleDesertSpells(season, DIFFICULTY_PROFILES.impitoyable, 6, mulberry32(3));
    expect(season.desertSpells.length).toBeLessThanOrEqual(1);
    expect(overlapping(season.desertSpells)).toBe(false);
  });
});

describe('desert : activation', () => {
  it('activeDesert suit playerMatchIndex et advanceDesert compte les matchs subis', () => {
    const season = makeState().season;
    season.desertSpells = [{ id: 'd1', startMatchIndex: 2, lengthMatches: 3, finishingMultiplier: 0.72, confidenceMalus: 12, elapsed: 0 }];
    expect(activeDesert(season)).toBeNull();
    advanceDesert(season); advanceDesert(season);
    expect(season.playerMatchIndex).toBe(2);
    expect(activeDesert(season)?.id).toBe('d1');
    advanceDesert(season); advanceDesert(season); advanceDesert(season);
    expect(season.desertSpells[0]!.elapsed).toBe(3);
    expect(activeDesert(season)).toBeNull();
    expect(season.playerMatchIndex).toBe(5);
  });
});
