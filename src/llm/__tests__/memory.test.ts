/**
 * Mémoire longue durée (repli) : résumé canonique de saison, fiche PNJ,
 * ambiance de journée, titres de presse stockés dans le rapport.
 */
import { describe, expect, it } from 'vitest';
import { narrateDay, refreshNpcCard, summarizeSeason } from '../memory';
import { generateHeadlines } from '../narrate/press';
import { advanceDay } from '../../engine/calendar/advanceDay';
import { runHeadlessSeason } from '../../engine/sim/headless';
import { newCareer } from '../../engine/career/newCareer';
import { generateFictionalDataset } from '../../engine/world/loadDataset';
import { buildAllocation, midTableClubId } from '../../engine/sim/headless';
import type { CareerSetup } from '../../engine/types';

describe('mémoire : résumé de saison et fiche PNJ', () => {
  it('écrit un résumé canonique cohérent avec le bilan figé', async () => {
    const r = runHeadlessSeason({ seed: 9, dataset: 'fictional', seasons: 1 });
    const state = r.state;
    expect(state.pastSeasons).toHaveLength(1);
    const { summary, source } = await summarizeSeason(state, undefined, false);
    expect(source).toBe('fallback');
    const record = state.pastSeasons[0]!;
    expect(record.narrativeSummary).toBe(summary.summary);
    expect(summary.summary).toContain(record.label);
    expect(summary.summary).toContain(`${record.stats.total.goals} buts`);
    expect(summary.summary).toContain(`${record.leagueRank}e`);
    expect(summary.summary.length).toBeLessThanOrEqual(1200);
  });

  it('met à jour la fiche d’un PNJ sans LLM', async () => {
    const dataset = generateFictionalDataset(42);
    const setup: CareerSetup = {
      firstName: 'Léo', lastName: 'Martin', startAge: 18, nationality: 'FRA', position: 'BU', foot: 'droit', heightCm: 180, weightKg: 74,
      archetypes: ['finisseur'], clubId: midTableClubId(dataset), startingLevel: 'prometteur', difficulty: 'exigeant',
      allocation: buildAllocation({ startAge: 18, position: 'BU', startingLevel: 'prometteur' }), datasetId: dataset.id, seed: 3,
    };
    const state = newCareer(setup, dataset);
    const { card, source } = await refreshNpcCard(state, 'npc-agent', false);
    expect(source).toBe('fallback');
    expect(card.summary.length).toBeGreaterThan(5);
    expect(state.world.npcs['npc-agent']!.card.updatedOn).toBe(state.currentDate);
    const day = await narrateDay(state, 'preparation', false);
    expect(day.text.length).toBeGreaterThan(10);
  });

  it('génère les titres de presse et les stocke dans le rapport', async () => {
    const dataset = generateFictionalDataset(42);
    const setup: CareerSetup = {
      firstName: 'Léo', lastName: 'Martin', startAge: 18, nationality: 'FRA', position: 'BU', foot: 'droit', heightCm: 180, weightKg: 74,
      archetypes: ['finisseur'], clubId: midTableClubId(dataset), startingLevel: 'pepite', difficulty: 'exigeant',
      allocation: buildAllocation({ startAge: 18, position: 'BU', startingLevel: 'pepite' }), datasetId: dataset.id, seed: 4,
    };
    const state = newCareer(setup, dataset);
    let guard = 0;
    let r = advanceDay(state);
    while (!(r.matchResult?.playerReport && r.matchResult.playerReport.minutesPlayed > 0) && guard++ < 200) r = advanceDay(state);
    const { headlines, source } = await generateHeadlines(state, r.matchId!, false);
    expect(source).toBe('fallback');
    expect(headlines.length).toBeGreaterThan(0);
    expect(state.matches[r.matchId!]!.result!.playerReport!.headlines).toEqual(headlines);
    expect(state.matches[r.matchId!]!.result!.playerReport!.headline).toBe(headlines[0]!.title);
  });
});
