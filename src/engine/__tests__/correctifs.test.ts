/**
 * Non-régression des correctifs issus de la revue : blessures de match,
 * matchs de sélection, prêts, traversées du désert, compteurs de tirages,
 * bornes des relations, chrono de décision.
 */
import { describe, expect, it } from 'vitest';
import { makeMatch, makeReport, makeResult, makeState } from './helpers/seasonFixtures';
import { applyPlayerMatchEffects } from '../calendar/matchEffects';
import { updateNpcAfterMatch } from '../season/npcProgression';
import { applyDeltas } from '../career/apply';
import { pruneRngCounters, nextRng } from '../rng/derive';
import { activeDesert } from '../season/desert';
import { BALANCE } from '../config/balance';
import { INTERNATIONAL_COMPETITION_ID, type DayResult, type Injury, type ISODate } from '../types';

function dayResult(date: ISODate): DayResult {
  return { date, kind: 'jour_match', newInjuries: [], attributeGains: [], reputationChanges: [], messages: [] };
}

function injury(id: string): Injury {
  return { id, type: 'ischios', origin: 'match', occurredOn: '2026-08-15', announcedDays: 12, actualDays: 15, daysRemaining: 15, playedThrough: false, recurrenceRisk: 0.2 };
}

describe('blessure contractée en match', () => {
  it('rejoint les blessures du joueur, une seule fois', () => {
    const state = makeState();
    const match = makeMatch('m1', 'a', 'b', state.currentDate, { involvesPlayer: true });
    state.matches[match.id] = match;
    const report = makeReport(6.5, { matchId: match.id });
    report.injury = injury('inj-1');
    const result = makeResult(1, 0, report);

    applyPlayerMatchEffects(state, match, result, dayResult(state.currentDate));
    expect(state.player.injuries.map((i) => i.id)).toEqual(['inj-1']);
    applyPlayerMatchEffects(state, match, result, dayResult(state.currentDate));
    expect(state.player.injuries.filter((i) => i.id === 'inj-1')).toHaveLength(1);
  });
});

describe('match de sélection', () => {
  it('le résultat est lu du côté du pays du joueur, pas de son club', () => {
    const state = makeState();
    state.national.countryCode = 'FRA';
    state.world.clubs.nat_FRA = { ...state.world.clubs.a!, id: 'nat_FRA', country: 'FRA', leagueId: INTERNATIONAL_COMPETITION_ID };
    state.world.clubs.nat_ESP = { ...state.world.clubs.b!, id: 'nat_ESP', country: 'ESP', leagueId: INTERNATIONAL_COMPETITION_ID };
    const match = makeMatch('intl', 'nat_FRA', 'nat_ESP', state.currentDate, { involvesPlayer: true, competitionId: INTERNATIONAL_COMPETITION_ID });
    state.matches[match.id] = match;
    const moralAvant = state.player.morale;
    // La France reçoit et gagne 2-0 : le moral doit monter.
    applyPlayerMatchEffects(state, match, makeResult(2, 0, makeReport(7, { matchId: match.id })), dayResult(state.currentDate));
    expect(state.player.morale).toBeGreaterThan(moralAvant);
  });

  it('n’alimente ni le classement des buteurs du championnat ni la purge des suspensions', () => {
    const state = makeState();
    const npc = Object.values(state.world.npcPlayers)[0]!;
    const suspendu = Object.values(state.world.npcPlayers)[1]!;
    suspendu.suspensionMatches = 2;
    const butsAvant = npc.seasonStats.goals;

    const match = makeMatch('intl2', 'a', 'b', state.currentDate, { competitionId: INTERNATIONAL_COMPETITION_ID });
    const result = makeResult(1, 0);
    result.lineups.home.starters = [npc.id];
    result.events.push({ minute: 20, seq: 1, type: 'but', side: 'home', playerId: npc.id, involvesPlayer: false });
    updateNpcAfterMatch(state.world, result, match);

    expect(npc.seasonStats.goals, 'un but en sélection ne compte pas au championnat').toBe(butsAvant);
    expect(suspendu.suspensionMatches, 'un amical ne purge pas une suspension de championnat').toBe(2);
  });
});

describe('traversée du désert', () => {
  it('le coup au moral tombe une fois, au premier match de la série (§6.6)', () => {
    const state = makeState();
    state.season.playerMatchIndex = 3;
    state.season.desertSpells = [{ id: 'd1', startMatchIndex: 3, lengthMatches: 4, finishingMultiplier: 0.8, confidenceMalus: 12, elapsed: 0 }];
    const match = makeMatch('d', 'a', 'b', state.currentDate, { involvesPlayer: true });
    state.matches[match.id] = match;
    state.player.confidence = 70;

    applyPlayerMatchEffects(state, match, makeResult(0, 1, makeReport(6.2, { matchId: match.id })), dayResult(state.currentDate));
    const apresPremier = state.player.confidence;
    expect(apresPremier).toBeLessThan(70 - 6);
    expect(activeDesert(state.season)?.elapsed).toBe(1);

    // Deuxième match de la même traversée : plus de malus supplémentaire.
    state.player.confidence = 60;
    applyPlayerMatchEffects(state, match, makeResult(0, 1, makeReport(6.2, { matchId: match.id })), dayResult(state.currentDate));
    expect(state.player.confidence).toBeGreaterThan(60 - 12);
  });
});

describe('bornes des relations (§6.2)', () => {
  it('des deltas répétés sur le même PNJ sont additionnés puis bornés une seule fois', () => {
    const state = makeState();
    const npcId = Object.keys(state.world.npcs)[0]!;
    const max = BALANCE.career.deltaBounds.relationshipPerInteraction;
    applyDeltas(state, {
      relationships: Array.from({ length: 8 }, () => ({ npcId, trust: 6, respect: 6, reason: 'flatterie répétée' })),
    }, 'test');
    expect(state.relationships[npcId]!.trust).toBeLessThanOrEqual(max);
    expect(state.relationships[npcId]!.respect).toBeLessThanOrEqual(max);
  });
});

describe('compteurs de tirages', () => {
  it('les portées datées des journées passées sont purgées, les autres restent', () => {
    const state = makeState({ date: '2026-12-01' });
    nextRng(state, 'jour:2026-08-15');
    nextRng(state, 'mercato:2026-09-02');
    nextRng(state, 'jour:2026-11-30');
    nextRng(state, 'pnj-annuel:s2026');
    const purgees = pruneRngCounters(state, 30);
    expect(purgees).toBe(2);
    expect(Object.keys(state.rngCounters).sort()).toEqual(['jour:2026-11-30', 'pnj-annuel:s2026']);
  });
});
