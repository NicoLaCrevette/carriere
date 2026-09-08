/**
 * Sélection nationale : éligibilité/double nationalité, effectif idempotent,
 * progression des étapes sur plusieurs trêves, matchs jouables via
 * runMatchAuto, déterminisme.
 */
import { describe, expect, it } from 'vitest';
import { canSwitchCountry, eligibleCountries, switchCountry } from '../national/eligibility';
import { countryStrength, ensureNationalSquad } from '../national/squads';
import { evaluateSelection, recordInternationalResult, scheduleInternationalMatches } from '../national/selection';
import { buildInternationalMatchContext } from '../national/matchContext';
import { runMatchAuto } from '../match/simulateMatch';
import { NATIONAL_BALANCE } from '../config/balance/national';
import type { CareerState } from '../types';
import { applyPlayerMatchEffects } from '../calendar/matchEffects';
import type { DayResult, ISODate } from '../types';
import { makeReport, makeState, playedMatch } from './helpers/seasonFixtures';

/** Résultat de journée vide, comme celui que construit `calendar/advanceDay`. */
function dayResultFixture(date: ISODate): DayResult {
  return { date, kind: 'match_international', newInjuries: [], attributeGains: [], reputationChanges: [], messages: [] };
}

function addGoodMatches(state: CareerState, count: number, rating: number): void {
  for (let i = 1; i <= count; i++) {
    playedMatch(state, `histo-${i}`, 'a', 'b', `2026-08-${String(i).padStart(2, '0')}`, 2, 1, makeReport(rating, { matchId: `histo-${i}` }));
  }
}

describe('national : éligibilité', () => {
  it('la nationalité principale est toujours éligible ; la seconde nationalité aussi, normalisée', () => {
    const state = makeState();
    state.player.identity.secondNationality = 'GER'; // alias FIFA → DEU (canonique)
    expect(eligibleCountries(state.player)).toEqual(['FRA', 'DEU']);
  });

  it('pas de doublon si les deux nationalités se normalisent au même code', () => {
    const state = makeState();
    state.player.identity.nationality = 'POR';
    state.player.identity.secondNationality = 'PRT';
    expect(eligibleCountries(state.player)).toEqual(['PRT']);
  });

  it('changement de sélection : accepté tant que non verrouillé, vers un pays éligible seulement', () => {
    const state = makeState();
    state.player.identity.secondNationality = 'ESP';
    expect(canSwitchCountry(state)).toBe(true);
    switchCountry(state, 'ESP');
    expect(state.national.countryCode).toBe('ESP');
    expect(state.national.stage).toBe('aucun');
    expect(() => switchCountry(state, 'BRA')).toThrow();
  });

  it('verrouillé (lockedIn) : plus aucun changement possible', () => {
    const state = makeState();
    state.player.identity.secondNationality = 'ESP';
    state.national.lockedIn = true;
    expect(canSwitchCountry(state)).toBe(false);
    expect(() => switchCountry(state, 'ESP')).toThrow();
  });
});

describe('national : effectif de sélection', () => {
  it('ensureNationalSquad est idempotent et produit un effectif cohérent (≥ 23, ≥ 2 GB)', () => {
    const state = makeState();
    const club1 = ensureNationalSquad(state, 'FRA');
    expect(club1.squadIds.length).toBeGreaterThanOrEqual(23);
    const gkCount = club1.squadIds.filter((id) => state.world.npcPlayers[id]?.identity.position === 'GB').length;
    expect(gkCount).toBeGreaterThanOrEqual(2);
    expect(club1.leagueId).toBe('international');
    expect(state.world.competitions.international).toBeDefined();

    const squadIdsBefore = [...club1.squadIds];
    const rngCountersBefore = JSON.stringify(state.rngCounters);
    const club2 = ensureNationalSquad(state, 'FRA');
    expect(club2).toBe(club1);
    expect(club2.squadIds).toEqual(squadIdsBefore);
    expect(JSON.stringify(state.rngCounters)).toBe(rngCountersBefore); // aucun tirage RNG en plus : vraiment idempotent
  });

  it("génère un effectif complet pour un pays sans PNJ existant dans le monde", () => {
    const state = makeState();
    const club = ensureNationalSquad(state, 'BRA');
    expect(club.squadIds.length).toBeGreaterThanOrEqual(23);
    for (const id of club.squadIds) {
      expect(state.world.npcPlayers[id]).toBeDefined();
      expect(state.world.npcPlayers[id]!.identity.nationality).toBe('BRA');
    }
    expect(state.world.npcs[club.coachId]?.kind).toBe('coach');
  });

  it('countryStrength connaît les alias FIFA et retombe sur le repli pour un pays inconnu', () => {
    expect(countryStrength('FRA')).toBe(NATIONAL_BALANCE.national.strengthByCountry.FRA);
    expect(countryStrength('GER')).toBe(countryStrength('DEU'));
    expect(countryStrength('POR')).toBe(countryStrength('PRT'));
    expect(countryStrength('XXX')).toBe(NATIONAL_BALANCE.national.fallbackStrength);
  });
});

describe('national : progression des étapes', () => {
  it('un jeune bon joueur progresse (aucun → espoirs → pré-liste → convoqué) sur plusieurs trêves, puis se stabilise', () => {
    const state = makeState({ playerOverall: 82 }); // 18 ans (fixture par défaut)
    state.reputation.league.value = 80;
    addGoodMatches(state, 10, 7.3); // note moyenne haute, minutes récentes largement > 300

    const stages: string[] = [state.national.stage];
    for (let i = 0; i < 6; i++) {
      const evalResult = evaluateSelection(state);
      stages.push(evalResult.stage);
    }
    expect(stages).toContain('espoirs');
    expect(stages).toContain('pre_liste');
    expect(stages).toContain('convoque');
    // Se stabilise : les derniers appels ne changent plus le statut une fois « convoque » atteint (pas de titulaire sans caps).
    expect(stages[stages.length - 1]).toBe('convoque');
    expect(state.events.some((e) => e.category === 'selection')).toBe(true);
  });

  it("un joueur faible n'est jamais appelé, même après plusieurs trêves", () => {
    const state = makeState({ playerOverall: 45 });
    state.reputation.league.value = 10;
    addGoodMatches(state, 5, 5.0);
    for (let i = 0; i < 8; i++) {
      const evalResult = evaluateSelection(state);
      expect(evalResult.stage).toBe('aucun');
    }
  });
});

describe('national : matchs de trêve', () => {
  function convokedState(): CareerState {
    const state = makeState({ playerOverall: 82 });
    state.reputation.league.value = 80;
    addGoodMatches(state, 10, 7.3);
    for (let i = 0; i < 3; i++) evaluateSelection(state);
    expect(state.national.stage).toBe('convoque');
    return state;
  }

  it('planifie 2 matchs internationaux, jouables via runMatchAuto avec le joueur sur le terrain', () => {
    const state = convokedState();
    const trustBefore = state.player.coachTrust;
    const supportersBefore = state.reputation.supporters.value;
    const matches = scheduleInternationalMatches(state, '2026-09-01');
    expect(matches).toHaveLength(NATIONAL_BALANCE.national.matchesPerBreak);
    for (const match of matches) {
      expect(match.competitionId).toBe('international');
      expect(match.involvesPlayer).toBe(true);
      const ctx = buildInternationalMatchContext(state, match, 'auto');
      expect(ctx.player?.id).toBe(state.player.id);
      const result = runMatchAuto(ctx);
      match.status = 'joue';
      match.result = result;
      expect(result.playerReport).toBeDefined();
      expect(result.playerReport!.minutesPlayed).toBeGreaterThan(0);
      // Ordre de la boucle quotidienne : applyMatchToWorld (→ recordInternationalResult) puis applyPlayerMatchEffects.
      recordInternationalResult(state, match);
      applyPlayerMatchEffects(state, match, result, dayResultFixture(match.date));
    }
    expect(state.national.caps).toBe(matches.length);
    expect(state.national.lockedIn).toBe(true);
    // Les statistiques sont cumulées une seule fois, par la boucle quotidienne (jamais par recordInternationalResult).
    expect(state.player.seasonStats.byCompetition.international).toBeDefined();
    expect(state.player.seasonStats.byCompetition.international!.matches).toBe(matches.length);
    expect(state.player.careerStats.matches).toBe(matches.length);
    // Un match de sélection ne touche ni le coach du club ni ses supporters.
    expect(state.player.coachTrust).toBe(trustBefore);
    expect(state.reputation.supporters.value).toBe(supportersBefore);
    expect(state.reputation.nationalTeam.history.some((h) => h.reason.startsWith('Sélection'))).toBe(true);
  });

  it('scheduleInternationalMatches est idempotent pour une même trêve (mêmes ids, pas de doublon)', () => {
    const state = convokedState();
    const first = scheduleInternationalMatches(state, '2026-09-01');
    const totalMatchesAfterFirst = Object.keys(state.matches).length;
    const second = scheduleInternationalMatches(state, '2026-09-01');
    expect(second.map((m) => m.id)).toEqual(first.map((m) => m.id));
    expect(Object.keys(state.matches).length).toBe(totalMatchesAfterFirst);
  });

  it("un joueur non convoqué ('aucun') n'a aucun match planifié", () => {
    const state = makeState();
    expect(state.national.stage).toBe('aucun');
    expect(scheduleInternationalMatches(state, '2026-09-01')).toEqual([]);
  });
});

describe('national : déterminisme', () => {
  function run(): unknown {
    const state = makeState({ playerOverall: 82 });
    state.reputation.league.value = 80;
    addGoodMatches(state, 10, 7.3);
    for (let i = 0; i < 3; i++) evaluateSelection(state);
    const matches = scheduleInternationalMatches(state, '2026-09-01');
    const results = matches.map((match) => {
      const result = runMatchAuto(buildInternationalMatchContext(state, match, 'auto'));
      match.status = 'joue';
      match.result = result;
      recordInternationalResult(state, match);
      return result;
    });
    return { national: state.national, matches: matches.map((m) => ({ id: m.id, home: m.homeClubId, away: m.awayClubId })), results };
  }

  it('la même graine produit exactement les mêmes sélections, matchs et résultats', () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
