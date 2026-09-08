/**
 * Compression des matchs stockés : la sauvegarde ne doit pas gonfler
 * indéfiniment sur 15 à 20 saisons, sans perdre ce que les écrans et le
 * moteur relisent (rapport du joueur, score, classement).
 */
import { describe, expect, it } from 'vitest';
import { newCareer } from '../career/newCareer';
import { advanceDay } from '../calendar/advanceDay';
import { generateFictionalDataset } from '../world/loadDataset';
import { buildAllocation, midTableClubId } from '../sim/headless';
import { compactBackgroundMatch, compactOldPlayerMatches } from '../season/compactMatches';
import { BALANCE } from '../config/balance';
import { rankOf } from '../season/table';
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

describe('compression des matchs stockés', () => {
  it('un match des autres clubs perd son détail mais garde son score et son classement', () => {
    const state = career(1);
    for (let i = 0; i < 140; i++) advanceDay(state);

    const others = Object.values(state.matches).filter((m) => m.status === 'joue' && !m.result?.playerReport);
    expect(others.length).toBeGreaterThan(20);
    for (const m of others) {
      expect(m.result!.events, m.id).toHaveLength(0);
      expect(m.result!.lineups.home.starters, m.id).toHaveLength(0);
      expect(Number.isFinite(m.result!.homeGoals), m.id).toBe(true);
    }
    // Le classement reste calculé et cohérent malgré la compression.
    const club = state.world.clubs[state.player.contract.clubId]!;
    const ls = state.season.leagues[club.leagueId]!;
    const rank = rankOf(ls, club.id);
    expect(rank).toBeGreaterThan(0);
    expect(ls.table.reduce((n, r) => n + r.played, 0)).toBeGreaterThan(0);
  });

  it('les matchs du joueur gardent leur rapport ; seuls les plus anciens perdent leur flux', () => {
    const keep = BALANCE.career.saves.keepMatchFeedForLastPlayerMatches;
    // Graine 1 : le joueur s'impose dans l'équipe et dépasse les 20 matchs conservés en détail dès la première saison.
    const state = career(1);
    const playerMatches = () => Object.values(state.matches)
      .filter((m) => m.status === 'joue' && m.result?.playerReport)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    for (let i = 0; i < 300; i++) advanceDay(state);

    const mine = playerMatches();
    expect(mine.length).toBeGreaterThan(keep);
    for (const m of mine) {
      expect(m.result!.playerReport, m.id).toBeDefined();
      expect(m.result!.playerReport!.rating, m.id).toBeGreaterThan(0);
    }
    const anciens = mine.slice(BALANCE.career.saves.keepMatchFeedForLastPlayerMatches);
    for (const m of anciens) expect(m.result!.events, m.id).toHaveLength(0);
    // Le match le plus récent garde de quoi afficher une chronologie.
    const dernier = mine[0]!;
    expect(dernier.result!.events.length + dernier.result!.summaryLines.length).toBeGreaterThan(0);
  });

  it('la sauvegarde reste raisonnable au fil des saisons', () => {
    const state = career(3);
    for (let i = 0; i < 200; i++) advanceDay(state);
    const uneSaison = JSON.stringify(state).length / 1024;
    const matchsKo = JSON.stringify(state.matches).length / 1024;
    const joues = Object.values(state.matches).filter((m) => m.status === 'joue').length;
    const detail1 = `${Math.round(uneSaison)} ko au total, ${Math.round(matchsKo)} ko de matchs pour ${joues} matchs joués`;
    expect(joues, detail1).toBeGreaterThan(100);
    // Sans compression, les seuls flux de match dépassent déjà 900 ko à ce stade.
    expect(matchsKo, detail1).toBeLessThan(700);

    // Six saisons de plus : la sauvegarde grossit, mais reste très en dessous de la dizaine de Mo.
    for (let i = 0; i < 2200; i++) advanceDay(state);
    const longue = JSON.stringify(state).length / 1024;
    const detail2 = `${Math.round(longue)} ko après ${state.season.label}`;
    expect(state.pastSeasons.length, detail2).toBeGreaterThanOrEqual(5);
    expect(longue, detail2).toBeLessThan(5000);
    expect(longue / uneSaison, detail2).toBeLessThan(4);
  });

  it('compactBackgroundMatch ne touche jamais un match du joueur, compactOldPlayerMatches est idempotent', () => {
    const state = career(4);
    for (let i = 0; i < 200; i++) advanceDay(state);
    const mine = Object.values(state.matches).find((m) => m.result?.playerReport);
    expect(mine).toBeDefined();
    const avant = JSON.stringify(mine!.result);
    compactBackgroundMatch(mine!);
    expect(JSON.stringify(mine!.result)).toBe(avant);

    compactOldPlayerMatches(state);
    expect(compactOldPlayerMatches(state)).toBe(0);
  });
});
