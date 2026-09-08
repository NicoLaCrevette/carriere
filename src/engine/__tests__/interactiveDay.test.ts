/**
 * Journée interactive : advanceDay s'arrête avant le match du joueur, le
 * match se joue via l'API du moteur, completePlayerMatch termine la journée.
 */
import { describe, expect, it } from 'vitest';
import { newCareer } from '../career/newCareer';
import { advanceDay, completePlayerMatch, playerMatchOfDay } from '../calendar/advanceDay';
import { advanceUntilSituation, applyDecision, buildMatchContext, createMatchState, finishMatch } from '../match/simulateMatch';
import { generateFictionalDataset } from '../world/loadDataset';
import { buildAllocation, midTableClubId } from '../sim/headless';
import type { CareerSetup } from '../types';

function career(seed: number) {
  const dataset = generateFictionalDataset(42);
  const clubId = midTableClubId(dataset);
  const setup: CareerSetup = {
    firstName: 'Léo', lastName: 'Martin', startAge: 18, nationality: 'FRA', position: 'BU', foot: 'droit', heightCm: 180, weightKg: 74,
    archetypes: ['finisseur'], clubId, startingLevel: 'pepite', difficulty: 'realiste',
    allocation: buildAllocation({ startAge: 18, position: 'BU', startingLevel: 'pepite' }), datasetId: dataset.id, seed,
  };
  return newCareer(setup, dataset);
}

describe('journée interactive', () => {
  it('s’arrête avant le match du joueur, puis completePlayerMatch applique le résultat et passe au lendemain', () => {
    const state = career(3);
    let guard = 0;
    let result = advanceDay(state, { playerMatchMode: 'interactif' });
    while (!result.pendingPlayerMatchId && guard++ < 120) result = advanceDay(state, { playerMatchMode: 'interactif' });
    expect(result.pendingPlayerMatchId).toBeDefined();
    const date = state.currentDate;
    const match = state.matches[result.pendingPlayerMatchId!]!;
    expect(match.status).toBe('a_venir');
    expect(state.pendingDay?.matchId).toBe(match.id);
    expect(playerMatchOfDay(state, date)?.id).toBe(match.id);
    // Les autres matchs de la journée sont déjà joués.
    const others = Object.values(state.matches).filter((m) => m.date === date && m.id !== match.id);
    expect(others.every((m) => m.status === 'joue')).toBe(true);
    expect(() => advanceDay(state)).toThrow();

    const ctx = buildMatchContext(state, match, 'interactif');
    const ms = createMatchState(ctx);
    let decisions = 0;
    for (;;) {
      const step = advanceUntilSituation(ms, ctx);
      if ('finished' in step) break;
      applyDecision(ms, ctx, step.situation, { action: 'frappe', cible: 'lucarne_droite', intensite: 1, risque: 0.9, meta: false }, 'je marque en lucarne', false);
      decisions++;
    }
    const matchResult = finishMatch(ms, ctx);
    const before = state.player.careerStats.matches;
    const done = completePlayerMatch(state, matchResult);
    expect(done.matchId).toBe(match.id);
    expect(match.status).toBe('joue');
    expect(state.pendingDay).toBeUndefined();
    expect(state.currentDate > date).toBe(true);
    if (matchResult.playerReport && matchResult.playerReport.minutesPlayed > 0) {
      expect(state.player.careerStats.matches).toBe(before + 1);
      expect(decisions).toBeGreaterThan(0);
    }
    expect(state.season.leagues[match.competitionId]!.table.reduce((s, r) => s + r.played, 0)).toBeGreaterThan(0);
  });

  it('en mode auto, la journée est complète et le match du joueur est joué', () => {
    const state = career(4);
    let guard = 0;
    let result = advanceDay(state);
    while (!result.matchId && guard++ < 120) result = advanceDay(state);
    expect(result.matchId).toBeDefined();
    expect(result.pendingPlayerMatchId).toBeUndefined();
    expect(state.matches[result.matchId!]!.status).toBe('joue');
  });
});
