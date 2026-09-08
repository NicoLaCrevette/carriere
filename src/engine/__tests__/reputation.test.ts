import { describe, expect, it } from 'vitest';
import {
  applyReputationDeltas, compactGaugeHistory, initialReputation, reputationAfterMatch, weeklyReputationDrift,
} from '../reputation/reputation';
import { BALANCE } from '../config/balance';
import { REPUTATION_KEYS } from '../types';
import type { Gauge } from '../types';
import { makeClub, makeReport, makeState, playedMatch, SETUP } from './helpers/seasonFixtures';

const R = BALANCE.reputation;

describe('reputation : valeurs initiales', () => {
  it('suit le niveau de départ : espoir < prometteur < pépite', () => {
    const club = makeClub('a', 'Alpha', 'l1', 50);
    const espoir = initialReputation({ ...SETUP, startingLevel: 'espoir' }, club, '2026-07-01');
    const pepite = initialReputation({ ...SETUP, startingLevel: 'pepite' }, club, '2026-07-01');
    for (const key of REPUTATION_KEYS) {
      expect(espoir[key].value).toBeLessThan(pepite[key].value);
      expect(espoir[key].history).toHaveLength(1);
      expect(espoir[key].value).toBeGreaterThanOrEqual(0);
    }
    expect(pepite.world.value).toBeLessThan(pepite.club.value);
  });

  it('un grand club expose davantage (ligue, médias) mais ancre moins (supporters)', () => {
    const small = initialReputation(SETUP, makeClub('a', 'Alpha', 'l1', 30), '2026-07-01');
    const big = initialReputation(SETUP, makeClub('b', 'Beta', 'l1', 90), '2026-07-01');
    expect(big.media.value).toBeGreaterThan(small.media.value);
    expect(big.league.value).toBeGreaterThan(small.league.value);
    expect(big.supporters.value).toBeLessThan(small.supporters.value);
  });
});

describe('reputation : applyReputationDeltas', () => {
  it('borne à ±5 par appel puis applique l’inertie de la jauge', () => {
    const state = makeState();
    const applied = applyReputationDeltas(state, { supporters: 20, world: 20 }, 'test');
    expect(applied.supporters).toBeCloseTo(5 * R.inertia.supporters, 5);
    expect(applied.world).toBeCloseTo(5 * R.inertia.world, 5);
    expect(state.reputation.supporters.value).toBeCloseTo(30 + 5 * R.inertia.supporters, 5);
    expect(state.reputation.supporters.history.at(-1)).toMatchObject({ reason: 'test', delta: applied.supporters });
  });

  it('borne à ±12 par jour et remet le compteur à zéro le lendemain', () => {
    const state = makeState();
    let total = 0;
    for (let i = 0; i < 5; i++) total += applyReputationDeltas(state, { supporters: 5 }, 't').supporters ?? 0;
    expect(total).toBeCloseTo(R.maxPerDay, 5);
    expect(state.reputationDeltasToday.supporters).toBeCloseTo(R.maxPerDay, 5);
    expect(applyReputationDeltas(state, { supporters: 5 }, 't').supporters).toBeUndefined();
    state.reputationDeltasToday = {};
    expect(applyReputationDeltas(state, { supporters: 5 }, 't').supporters).toBeGreaterThan(0);
  });

  it('respecte les bornes 0-100 et renvoie le delta réellement appliqué', () => {
    const state = makeState();
    state.reputation.supporters.value = 98;
    expect(applyReputationDeltas(state, { supporters: 5 }, 't').supporters).toBeCloseTo(2, 5);
    state.reputation.media.value = 1;
    expect(applyReputationDeltas(state, { media: -5 }, 't').media).toBeCloseTo(-1, 5);
    expect(applyReputationDeltas(state, { media: -5 }, 't')).toEqual({});
  });

  it('ignore les deltas nuls, absents ou non finis', () => {
    const state = makeState();
    expect(applyReputationDeltas(state, { club: 0, coach: Number.NaN }, 't')).toEqual({});
    expect(state.reputation.club.history).toHaveLength(1);
  });
});

describe('reputation : après match', () => {
  it('une bonne note décisive fait monter supporters et médias, une victoire aide le club', () => {
    const state = makeState();
    const match = playedMatch(state, 'm1', 'a', 'b', '2026-08-15', 2, 0, makeReport(8.2, { goals: 1, motm: true, matchId: 'm1' }));
    const applied = reputationAfterMatch(state, match.result!.playerReport!, match);
    expect(applied.supporters).toBeGreaterThan(0);
    expect(applied.media).toBeGreaterThan(0);
    expect(applied.club).toBeGreaterThan(0);
    expect(Math.abs(applied.world ?? 0)).toBeLessThan(applied.supporters ?? 0);
  });

  it('une note sous 5 fait chuter supporters et médias', () => {
    const state = makeState();
    const match = playedMatch(state, 'm1', 'a', 'b', '2026-08-15', 1, 1, makeReport(4.6, { matchId: 'm1' }));
    const applied = reputationAfterMatch(state, match.result!.playerReport!, match);
    expect(applied.supporters).toBeLessThan(-2);
    expect(applied.media).toBeLessThan(-2);
    expect(applied.coach).toBeLessThan(0);
  });

  it('un remplaçant peu utilisé bouge moins ; non entré ne bouge pas', () => {
    const a = makeState(), b = makeState();
    const full = playedMatch(a, 'm1', 'a', 'b', '2026-08-15', 1, 0, makeReport(7.5, { matchId: 'm1' }));
    const short = playedMatch(b, 'm1', 'a', 'b', '2026-08-15', 1, 0, makeReport(7.5, { minutes: 12, started: false, matchId: 'm1' }));
    const fullDelta = reputationAfterMatch(a, full.result!.playerReport!, full).supporters ?? 0;
    const shortDelta = reputationAfterMatch(b, short.result!.playerReport!, short).supporters ?? 0;
    expect(shortDelta).toBeGreaterThan(0);
    expect(shortDelta).toBeLessThan(fullDelta);
    expect(reputationAfterMatch(makeState(), makeReport(7, { minutes: 0 }), full)).toEqual({});
  });

  it('deux matchs ratés d’affilée déclenchent un malus médias supplémentaire', () => {
    const single = makeState();
    const m1 = playedMatch(single, 'm1', 'a', 'b', '2026-08-15', 0, 0, makeReport(5.5, { matchId: 'm1' }));
    const alone = reputationAfterMatch(single, m1.result!.playerReport!, m1).media ?? 0;

    const streak = makeState();
    playedMatch(streak, 'm0', 'c', 'a', '2026-08-08', 0, 0, makeReport(5.4, { matchId: 'm0' }));
    const m2 = playedMatch(streak, 'm1', 'a', 'b', '2026-08-15', 0, 0, makeReport(5.5, { matchId: 'm1' }));
    const after = reputationAfterMatch(streak, m2.result!.playerReport!, m2).media ?? 0;
    expect(after).toBeLessThan(alone);
  });

  it('l’enjeu amplifie les variations', () => {
    const low = makeState(), high = makeState();
    const m1 = playedMatch(low, 'm1', 'a', 'b', '2026-08-15', 1, 0, makeReport(7.8, { matchId: 'm1' }));
    const m2 = playedMatch(high, 'm1', 'a', 'b', '2026-08-15', 1, 0, makeReport(7.8, { matchId: 'm1' }));
    m1.importance = 0; m2.importance = 100;
    const d1 = reputationAfterMatch(low, m1.result!.playerReport!, m1).media ?? 0;
    const d2 = reputationAfterMatch(high, m2.result!.playerReport!, m2).media ?? 0;
    expect(d2).toBeGreaterThan(d1);
  });
});

describe('reputation : dérive hebdomadaire', () => {
  it('ramène vers le niveau mérité, monde bien plus lentement que supporters', () => {
    const state = makeState({ playerOverall: 80 });
    for (const key of REPUTATION_KEYS) state.reputation[key].value = 10;
    weeklyReputationDrift(state);
    const supporters = state.reputation.supporters.value - 10;
    const world = state.reputation.world.value - 10;
    expect(supporters).toBeGreaterThan(0);
    expect(world).toBeGreaterThanOrEqual(0);
    expect(world).toBeLessThan(supporters / 3);
  });

  it('fait redescendre une réputation surévaluée', () => {
    const state = makeState({ playerOverall: 50 });
    state.reputation.supporters.value = 95;
    weeklyReputationDrift(state);
    expect(state.reputation.supporters.value).toBeLessThan(95);
    expect(state.reputation.supporters.history.at(-1)?.reason).toBe('Dérive hebdomadaire');
  });
});

describe('reputation : compactage', () => {
  it('garde les 200 derniers points et un point par mois avant', () => {
    const gauge: Gauge = { value: 50, history: [] };
    for (let i = 0; i < 400; i++) {
      const month = String(1 + Math.floor(i / 40)).padStart(2, '0');
      const day = String(1 + (i % 28)).padStart(2, '0');
      gauge.history.push({ date: `2026-${month}-${day}`, value: 50, delta: 0, reason: 'x' });
    }
    compactGaugeHistory(gauge);
    const older = 200;
    const months = new Set<string>();
    for (let i = 0; i < older; i++) months.add(gauge.history.length ? `2026-${String(1 + Math.floor(i / 40)).padStart(2, '0')}` : '');
    expect(gauge.history.length).toBe(R.history.keepLast + months.size);
    expect(gauge.history.slice(-200).map((p) => p.date)).toEqual(gauge.history.slice(-200).map((p) => p.date));
    const untouched: Gauge = { value: 1, history: [{ date: '2026-01-01', value: 1, delta: 0, reason: 'x' }] };
    compactGaugeHistory(untouched);
    expect(untouched.history).toHaveLength(1);
  });
});
