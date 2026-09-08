import { describe, expect, it } from 'vitest';
import { buildWorld, generateFictionalDataset } from '../world/loadDataset';
import { parseDataset } from '../../data/schema';

describe('generateFictionalDataset', () => {
  const dataset = generateFictionalDataset(7);

  it('produit un jeu de données qui passe la validation Zod', () => {
    expect(() => parseDataset(dataset)).not.toThrow();
  });

  it('18 clubs par défaut, au moins 22 joueurs et un capitaine unique chacun', () => {
    expect(dataset.clubs.length).toBe(18);
    for (const club of dataset.clubs) {
      expect(club.players.length).toBeGreaterThanOrEqual(22);
      expect(club.players.filter((p) => p.captain).length).toBe(1);
      expect(club.players.filter((p) => p.position === 'GB').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('prestige étagé entre 40 et 92', () => {
    for (const club of dataset.clubs) {
      expect(club.prestige).toBeGreaterThanOrEqual(40);
      expect(club.prestige).toBeLessThanOrEqual(92);
    }
  });
});

describe('buildWorld', () => {
  const dataset = generateFictionalDataset(7);
  const date = '2026-07-01';

  it('est déterministe : même dataset et même graine → même monde (JSON identique)', () => {
    const a = buildWorld(dataset, 123, date);
    const b = buildWorld(dataset, 123, date);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produit un monde différent pour une graine différente', () => {
    const a = buildWorld(dataset, 1, date);
    const b = buildWorld(dataset, 2, date);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('contient 18 clubs, chacun avec au moins 22 joueurs, un capitaine et un coach', () => {
    const world = buildWorld(dataset, 123, date);
    const clubs = Object.values(world.clubs);
    expect(clubs.length).toBe(18);
    for (const club of clubs) {
      expect(club.squadIds.length).toBeGreaterThanOrEqual(22);
      const captain = world.npcPlayers[club.captainId];
      expect(captain).toBeDefined();
      expect(captain?.clubId).toBe(club.id);
      const coach = world.npcs[club.coachId];
      expect(coach).toBeDefined();
      expect(coach?.kind).toBe('coach');
    }
  });

  it("place chaque championnat du dataset dans world.leagues et world.competitions", () => {
    const world = buildWorld(dataset, 123, date);
    for (const league of dataset.leagues) {
      expect(world.leagues[league.id]).toBeDefined();
      expect(world.competitions[league.id]).toBeDefined();
      expect(world.leagues[league.id]?.clubIds.length).toBe(league.clubIds.length);
    }
  });
});
