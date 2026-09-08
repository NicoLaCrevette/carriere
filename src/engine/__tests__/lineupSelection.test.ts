import { describe, expect, it } from 'vitest';
import {
  pickLineup, playerStatus, shouldSubOff, updateCoachTrust, updatePositionHierarchy,
} from '../season/lineupSelection';
import { formation } from '../config/formations';
import { BALANCE } from '../config/balance';
import { DIFFICULTY_PROFILES } from '../config/difficulty';
import { mulberry32 } from '../rng/mulberry32';
import { POSITIONS } from '../types';
import type { CareerState, Lineup, MatchContext, MatchState } from '../types';
import { makeCoach, makeMatch, makeReport, makeState, playedMatch } from './helpers/seasonFixtures';

const MATCH = makeMatch('m1', 'a', 'b', '2026-08-15', { involvesPlayer: true });

function positionOf(state: CareerState, id: string): string {
  return id === state.player.id ? state.player.identity.position : state.world.npcPlayers[id]!.identity.position;
}

function expectValid(state: CareerState, lineup: Lineup): void {
  const slots = formation(lineup.formation).slots;
  expect(lineup.starters).toHaveLength(11);
  expect(new Set([...lineup.starters, ...lineup.bench]).size).toBe(lineup.starters.length + lineup.bench.length);
  expect(positionOf(state, lineup.starters[0]!)).toBe('GB');
  expect(slots[0]).toBe('GB');
  expect(lineup.starters).toContain(lineup.captainId);
}

describe('lineupSelection : composition', () => {
  it('compose un onze cohérent dans la formation du coach, avec un banc de 9 contenant un gardien', () => {
    const state = makeState();
    const lineup = pickLineup(state, 'a', MATCH, mulberry32(1));
    expectValid(state, lineup);
    expect(lineup.formation).toBe('4-3-3');
    expect(lineup.bench).toHaveLength(BALANCE.coach.lineup.benchSize);
    expect(lineup.bench.some((id) => positionOf(state, id) === 'GB')).toBe(true);
    // Chaque slot est occupé par un joueur du poste (effectif standard complet).
    formation('4-3-3').slots.forEach((slot, i) => expect(positionOf(state, lineup.starters[i]!)).toBe(slot));
  });

  it('suit la formation préférée du coach et replie sur 4-3-3 si elle est inconnue', () => {
    const state = makeState();
    state.world.npcs['coach-a'] = makeCoach('coach-a', 'a', { formation: '4-4-2' });
    expect(pickLineup(state, 'a', MATCH, mulberry32(1)).formation).toBe('4-4-2');
    state.world.npcs['coach-a'] = makeCoach('coach-a', 'a', { formation: '9-9-9' });
    expect(pickLineup(state, 'a', MATCH, mulberry32(1)).formation).toBe('4-3-3');
  });

  it('exclut les blessés et les suspendus', () => {
    const state = makeState();
    state.world.npcPlayers['a-1']!.injury = { id: 'i', type: 'ischios', origin: 'match', occurredOn: '2026-08-10', announcedDays: 20, actualDays: 20, daysRemaining: 15, playedThrough: false, recurrenceRisk: 0.1 };
    state.world.npcPlayers['a-13']!.suspensionMatches = 1; // meilleur MC
    const lineup = pickLineup(state, 'a', MATCH, mulberry32(1));
    expectValid(state, lineup);
    expect([...lineup.starters, ...lineup.bench]).not.toContain('a-1');
    expect([...lineup.starters, ...lineup.bench]).not.toContain('a-13');
    expect(lineup.starters[0]).toBe('a-2');
  });

  it('exclut le joueur incarné blessé ou suspendu dans la compétition', () => {
    const state = makeState({ playerOverall: 85, coachTrust: 100 });
    state.player.suspensions.l1 = 1;
    expect(playerStatus(pickLineup(state, 'a', MATCH, mulberry32(1)), 'joueur')).toBe('tribune');
    state.player.suspensions.l1 = 0;
    expect(playerStatus(pickLineup(state, 'a', MATCH, mulberry32(1)), 'joueur')).toBe('titulaire');
    state.player.injuries.push({ id: 'i', type: 'mollet', origin: 'entrainement', occurredOn: '2026-08-10', announcedDays: 10, actualDays: 10, daysRemaining: 5, playedThrough: false, recurrenceRisk: 0.05 });
    expect(playerStatus(pickLineup(state, 'a', MATCH, mulberry32(1)), 'joueur')).toBe('tribune');
  });

  it('§6.5 : le jeune joueur est remplaçant derrière un concurrent meilleur en début de carrière', () => {
    const state = makeState({ playerOverall: 58, coachTrust: 38 });
    updatePositionHierarchy(state, 'a');
    const lineup = pickLineup(state, 'a', MATCH, mulberry32(1));
    expect(playerStatus(lineup, 'joueur')).toBe('banc');
    expect(lineup.starters).toContain('a-22'); // buteur à 70
  });

  it('gagne sa place quand ses notes lui donnent la confiance du coach et un niveau suffisant', () => {
    const state = makeState({ playerOverall: 58, coachTrust: 38 });
    updatePositionHierarchy(state, 'a');
    state.player.overall = 74; // au-delà de l'avance du titulaire installé (incumbentBonus)
    state.player.fitness = 100;
    state.player.coachTrust = 100;
    updatePositionHierarchy(state, 'a');
    const lineup = pickLineup(state, 'a', MATCH, mulberry32(1));
    expect(playerStatus(lineup, 'joueur')).toBe('titulaire');
  });

  it('la confiance du coach compte : à niveau égal, une confiance basse laisse le joueur sur le banc', () => {
    const low = makeState({ playerOverall: 70, coachTrust: 20 });
    const high = makeState({ playerOverall: 70, coachTrust: 100 });
    high.world.npcPlayers['a-22']!.overall = 66;
    low.world.npcPlayers['a-22']!.overall = 66;
    expect(playerStatus(pickLineup(low, 'a', MATCH, mulberry32(1)), 'joueur')).toBe('banc');
    expect(playerStatus(pickLineup(high, 'a', MATCH, mulberry32(1)), 'joueur')).toBe('titulaire');
  });

  it('envoie le joueur en tribune sous le seuil de confiance', () => {
    const state = makeState({ playerOverall: 58, coachTrust: BALANCE.coach.tribuneBelowTrust - 1 });
    expect(playerStatus(pickLineup(state, 'a', MATCH, mulberry32(1)), 'joueur')).toBe('tribune');
  });

  it('rotation : avec 3 matchs en 8 jours, un titulaire épuisé peut souffler', () => {
    const state = makeState();
    playedMatch(state, 'p1', 'a', 'c', '2026-08-09', 1, 0);
    playedMatch(state, 'p2', 'd', 'a', '2026-08-12', 0, 0);
    state.world.npcPlayers['a-13']!.fitness = 40; // meilleur MC, épuisé
    let rested = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const lineup = pickLineup(state, 'a', MATCH, mulberry32(seed));
      expectValid(state, lineup);
      if (!lineup.starters.includes('a-13')) rested += 1;
    }
    expect(rested).toBeGreaterThan(5);
    expect(rested).toBeLessThan(40);
    // Sans congestion, la rotation est nettement plus rare.
    const calm = makeState();
    calm.world.npcPlayers['a-13']!.fitness = 40;
    let calmRested = 0;
    for (let seed = 1; seed <= 40; seed++) if (!pickLineup(calm, 'a', MATCH, mulberry32(seed)).starters.includes('a-13')) calmRested += 1;
    expect(calmRested).toBeLessThan(rested);
  });

  it('est déterministe pour une même graine', () => {
    const state = makeState();
    expect(pickLineup(state, 'a', MATCH, mulberry32(5))).toEqual(pickLineup(state, 'a', MATCH, mulberry32(5)));
  });

  it('playerStatus distingue titulaire, banc, tribune', () => {
    const lineup: Lineup = { formation: '4-3-3', starters: ['x'], bench: ['y'], captainId: 'x' };
    expect(playerStatus(lineup, 'x')).toBe('titulaire');
    expect(playerStatus(lineup, 'y')).toBe('banc');
    expect(playerStatus(lineup, 'z')).toBe('tribune');
  });
});

describe('lineupSelection : hiérarchie', () => {
  it('écrit une hiérarchie par poste, joueur incarné inclus, blessés compris', () => {
    const state = makeState({ playerOverall: 58, coachTrust: 38 });
    state.world.npcPlayers['a-22']!.injury = { id: 'i', type: 'mollet', origin: 'match', occurredOn: '2026-08-10', announcedDays: 10, actualDays: 10, daysRemaining: 5, playedThrough: false, recurrenceRisk: 0.05 };
    updatePositionHierarchy(state, 'a');
    const h = state.world.clubs.a!.positionHierarchy;
    for (const p of POSITIONS) expect(h[p]!.length).toBeGreaterThan(0);
    expect(h.BU![0]).toBe('a-22');
    expect(h.BU).toContain('joueur');
    expect(h.GB).toEqual(['a-1', 'a-2']);
  });

  it('le titulaire installé garde une avance de titulaire', () => {
    const state = makeState({ playerOverall: 70, coachTrust: 100 });
    state.player.fitness = 100;
    state.world.npcPlayers['a-22']!.overall = 70;
    updatePositionHierarchy(state, 'a'); // sans hiérarchie : égalité → départage par id ('a-22' < 'joueur')
    expect(state.world.clubs.a!.positionHierarchy.BU![0]).toBe('a-22');
    state.player.overall = 71;
    updatePositionHierarchy(state, 'a');
    expect(state.world.clubs.a!.positionHierarchy.BU![0]).toBe('a-22');
    state.player.overall = 74;
    updatePositionHierarchy(state, 'a');
    expect(state.world.clubs.a!.positionHierarchy.BU![0]).toBe('joueur');
  });
});

describe('lineupSelection : confiance du coach', () => {
  it('monte après une bonne note, chute fortement sous 5.5, bornée par match', () => {
    const good = makeState({ coachTrust: 40 });
    const bad = makeState({ coachTrust: 40 });
    const up = updateCoachTrust(good, makeReport(7.6, { goals: 1 }), MATCH);
    const down = updateCoachTrust(bad, makeReport(5.0), MATCH);
    expect(up.delta).toBeGreaterThan(0);
    expect(good.player.coachTrust).toBeGreaterThan(40);
    expect(down.delta).toBeLessThan(-4);
    expect(Math.abs(down.delta)).toBeLessThanOrEqual(BALANCE.coach.trust.maxPerMatch);
    expect(down.reason).toContain('prestation indigne');
    expect(updateCoachTrust(makeState(), makeReport(8, { minutes: 0 }), MATCH).delta).toBe(0);
  });

  it('la tolérance de la difficulté module les malus : impitoyable > exigeant > réaliste', () => {
    const deltas = (['realiste', 'exigeant', 'impitoyable'] as const).map((d) => updateCoachTrust(makeState({ difficulty: d }), makeReport(5.6), MATCH).delta);
    expect(deltas[0]).toBeGreaterThan(deltas[1]!);
    expect(deltas[1]).toBeGreaterThan(deltas[2]!);
    expect(DIFFICULTY_PROFILES.impitoyable.coachTolerance).toBe('faible');
  });

  it('un rouge et une série de mauvais matchs aggravent le malus', () => {
    const plain = updateCoachTrust(makeState(), makeReport(5.4), MATCH).delta;
    const red = updateCoachTrust(makeState(), makeReport(5.4, { red: 1 }), MATCH).delta;
    const streakState = makeState();
    playedMatch(streakState, 'm0', 'c', 'a', '2026-08-08', 0, 1, makeReport(5.2, { matchId: 'm0' }));
    const streak = updateCoachTrust(streakState, makeReport(5.4, { matchId: 'm1' }), MATCH).delta;
    expect(red).toBeLessThan(plain);
    expect(streak).toBeLessThan(plain);
  });
});

function matchContext(state: CareerState, patience = 50): MatchContext {
  const club = state.world.clubs.a!;
  const coach = makeCoach('coach-a', 'a', { patience });
  const side = { club, coach, lineup: { formation: '4-3-3', starters: [], bench: [], captainId: '' }, strength: { attack: 60, midfield: 60, defense: 60, goalkeeper: 60, overall: 60, pressing: 0.5, pace: 60 } };
  return { match: MATCH, seed: 1, home: side, away: { ...side, club: state.world.clubs.b! }, roster: {}, player: state.player, playerSide: 'home', difficulty: DIFFICULTY_PROFILES.exigeant, mode: 'auto' };
}

function matchState(minute: number, rating: number, playerMinutes = minute): MatchState {
  return {
    matchId: 'm1', minute, addedTime: 0, half: 2, homeGoals: 0, awayGoals: 0, homeXg: 0, awayXg: 0, homePossessionMinutes: 0, momentum: 0,
    events: [], lineups: { home: { formation: '4-3-3', starters: [], bench: [], captainId: '' }, away: { formation: '4-3-3', starters: [], bench: [], captainId: '' } },
    homeSubsUsed: 0, awaySubsUsed: 0, fatigue: {}, playerOnPitch: true, playerMinutes, playerRating: rating, ratingLog: [],
    playerStats: makeReport(rating).stats, decisions: [], actionIndex: 0, metaAttempts: 0, repetitions: [],
    opponentAdaptations: { manMarking: false, doubled: false }, lastSituationMinute: 0, summaryLines: [],
  };
}

describe('lineupSelection : sortie anticipée', () => {
  it('ne sort jamais avant la 55e ni un joueur hors du terrain', () => {
    const state = makeState();
    const ctx = matchContext(state);
    expect(shouldSubOff(matchState(40, 4.5), ctx, mulberry32(1)).yes).toBe(false);
    const off = matchState(65, 4.5); off.playerOnPitch = false;
    expect(shouldSubOff(off, ctx, mulberry32(1)).yes).toBe(false);
  });

  it('un mauvais match entre la 60e et la 70e finit par provoquer la sortie, plus vite avec un coach impatient', () => {
    const state = makeState();
    const count = (patience: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const rng = mulberry32(seed);
        for (let minute = 60; minute <= 70; minute++) {
          const r = shouldSubOff(matchState(minute, 5.0), matchContext(state, patience), rng);
          if (r.yes) { expect(r.reason).toBe('mauvais match'); n += 1; break; }
        }
      }
      return n;
    };
    const impatient = count(10);
    const patient = count(90);
    expect(impatient).toBeGreaterThan(patient);
    expect(impatient).toBeGreaterThan(30);
    expect(patient).toBeLessThan(200);
  });

  it('une bonne note n’est pas sortie pour mauvais match', () => {
    const state = makeState();
    for (let seed = 1; seed <= 50; seed++) {
      for (let minute = 60; minute <= 70; minute++) expect(shouldSubOff(matchState(minute, 6.8), matchContext(state), mulberry32(seed)).yes).toBe(false);
    }
  });

  it('sort le joueur épuisé (fraîcheur sous le seuil)', () => {
    const state = makeState();
    state.player.fitness = 50; // 50 − 85 × 0.28 ≈ 26 < 35 (fatiguePerMatchMinute)
    const r = shouldSubOff(matchState(85, 6.5), matchContext(state), mulberry32(1));
    expect(r).toEqual({ yes: true, reason: 'fatigue' });
    state.player.fitness = 100;
    expect(shouldSubOff(matchState(85, 6.5), matchContext(state), mulberry32(1)).yes).toBe(false);
  });
});
