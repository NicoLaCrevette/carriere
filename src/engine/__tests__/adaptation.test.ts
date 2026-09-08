/**
 * §6.4 : détecteur de répétition, marquage individuel selon la réputation,
 * scouting après cinq matchs.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { DIFFICULTY_PROFILES } from '../config/difficulty';
import { mulberry32 } from '../rng/mulberry32';
import { considerManMarking, manMarkingMultiplier, recordRepetition, repetitionMultiplier, scoutingMultiplier, updateScouting } from '../match/adaptation';
import { buildMatchContext, createMatchState } from '../match/simulateMatch';
import type { DecisionRecord } from '../types';
import { makeMatch, makePlayer, makeState } from './helpers/seasonFixtures';

const A = BALANCE.adaptation;

function decision(action: DecisionRecord['classified']['action'], meta = false): DecisionRecord {
  return {
    situationId: 's', minute: 10, actionIndex: 0, kind: 'occasion_surface', rawInput: '', timedOut: false,
    classified: { action, intensite: 0.5, risque: 0.4, meta },
    outcome: { kind: 'rien', probability: 0.1, roll: 0.5, modifiers: {}, ratingDelta: 0, ratingReason: '', statsDelta: {}, facts: {} },
  };
}

describe('adaptation : répétition', () => {
  it('−8 % cumulés par répétition, décroissance sur 20 minutes, plancher', () => {
    const state = makeState({ playerOverall: 80, coachTrust: 100 });
    const match = makeMatch('m', 'a', 'b', '2026-08-15', { involvesPlayer: true });
    state.matches.m = match;
    const ms = createMatchState(buildMatchContext(state, match, 'auto'));
    expect(repetitionMultiplier(ms, 'frappe', 'occasion_surface', 10)).toBe(1);
    recordRepetition(ms, 'frappe', 'occasion_surface', 10);
    expect(repetitionMultiplier(ms, 'frappe', 'occasion_surface', 10)).toBeCloseTo(1 - A.repetitionPenalty, 6);
    expect(repetitionMultiplier(ms, 'dribble', 'occasion_surface', 10)).toBe(1);
    expect(repetitionMultiplier(ms, 'frappe', 'face_a_face', 10)).toBe(1);
    expect(repetitionMultiplier(ms, 'frappe', 'occasion_surface', 20)).toBeCloseTo(1 - A.repetitionPenalty / 2, 6);
    expect(repetitionMultiplier(ms, 'frappe', 'occasion_surface', 31)).toBe(1);
    for (let i = 0; i < 10; i++) recordRepetition(ms, 'frappe', 'occasion_surface', 12);
    expect(repetitionMultiplier(ms, 'frappe', 'occasion_surface', 12)).toBe(A.repetitionMinMultiplier);
  });
});

describe('adaptation : marquage individuel', () => {
  it('se déclenche à partir du seuil de réputation de la difficulté, jamais en dessous, et pénalise les actions avec ballon', () => {
    const state = makeState({ playerOverall: 80, coachTrust: 100 });
    const match = makeMatch('m', 'a', 'b', '2026-08-15', { involvesPlayer: true });
    state.matches.m = match;
    const always = { ...mulberry32(1), chance: () => true };
    for (const profile of Object.values(DIFFICULTY_PROFILES)) {
      const below = buildMatchContext(state, match, 'auto');
      below.difficulty = profile;
      below.playerLeagueReputation = profile.manMarkingFromLeagueReputation - 1;
      const msBelow = createMatchState(below);
      considerManMarking(msBelow, below, always);
      expect(msBelow.opponentAdaptations.manMarking).toBe(false);

      const above = buildMatchContext(state, match, 'auto');
      above.difficulty = profile;
      above.playerLeagueReputation = profile.manMarkingFromLeagueReputation;
      const msAbove = createMatchState(above);
      considerManMarking(msAbove, above, always);
      expect(msAbove.opponentAdaptations.manMarking).toBe(true);
      expect(msAbove.events.some((e) => e.type === 'marquage_individuel')).toBe(true);
      expect(manMarkingMultiplier(msAbove, 'frappe', true)).toBe(A.manMarkingMalus);
      expect(manMarkingMultiplier(msAbove, 'decrocher', true)).toBeCloseTo(A.manMarkingMalus * A.counterMoveBonus, 6);
      expect(manMarkingMultiplier(msAbove, 'presser', false)).toBe(1);
    }
  });
});

describe('adaptation : scouting', () => {
  it('profile le joueur après cinq matchs et pénalise son action favorite', () => {
    const player = makePlayer('a', 'BU', 70);
    const decisions = [decision('frappe'), decision('frappe'), decision('frappe'), decision('dribble'), decision('aucune', true)];
    player.careerStats.matches = 4;
    updateScouting(player, decisions, DIFFICULTY_PROFILES.exigeant);
    expect(player.scouting.profiled).toBe(false);
    expect(scoutingMultiplier(player, 'frappe')).toBe(1);
    player.careerStats.matches = 5;
    updateScouting(player, decisions, DIFFICULTY_PROFILES.exigeant);
    expect(player.scouting.profiled).toBe(true);
    expect(player.scouting.actionFrequency.frappe!).toBeGreaterThan(player.scouting.actionFrequency.dribble!);
    expect(player.scouting.actionFrequency.aucune).toBeUndefined();
    expect(scoutingMultiplier(player, 'frappe')).toBeLessThan(1);
    expect(scoutingMultiplier(player, 'frappe')).toBeGreaterThanOrEqual(1 - A.scoutingMaxMalus);
    expect(scoutingMultiplier(player, 'remise')).toBe(1);
  });
});
