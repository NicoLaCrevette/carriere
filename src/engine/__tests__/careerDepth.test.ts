/**
 * Phase 6 : traits, sponsors, revenus, fin de carrière. Règles déterministes,
 * idempotence, bornes.
 */
import { describe, expect, it } from 'vitest';
import { makeReport, makeState, playedMatch } from './helpers/seasonFixtures';
import { evaluateTraits, grantTrait, removeTrait, traitMultiplier, TRAIT_CATALOGUE } from '../career/traits';
import { accrueMatchBonuses, accrueMonthlyEarnings, respondToSponsor, rollSponsorOffers, SPONSOR_BRANDS } from '../career/sponsors';
import { canRetire, careerSummary, mustRetire, retire } from '../career/retirement';
import { CAREER_DEPTH_BALANCE } from '../config/balance/careerDepth';
import { addDays } from '../calendar/dates';

const D = CAREER_DEPTH_BALANCE;

describe('traits', () => {
  it('grantTrait est idempotent et journalise', () => {
    const state = makeState();
    const t = grantTrait(state, 'leader', 'test');
    expect(t?.id).toBe('leader');
    expect(grantTrait(state, 'leader', 'encore')).toBeNull();
    expect(state.player.traits).toHaveLength(1);
    expect(state.log.some((l) => l.text.includes('Leader'))).toBe(true);
    removeTrait(state, 'leader', 'test');
    expect(state.player.traits).toHaveLength(0);
    expect(() => grantTrait(state, 'inconnu', 'x')).toThrow();
  });

  it('traitMultiplier cumule les modificateurs et vaut 1 sans trait', () => {
    const state = makeState();
    expect(traitMultiplier(state.player, 'finition')).toBe(1);
    grantTrait(state, 'renard_des_surfaces', 'test');
    expect(traitMultiplier(state.player, 'finition')).toBeCloseTo(TRAIT_CATALOGUE.renard_des_surfaces!.modifiers.finition!, 6);
    expect(traitMultiplier(state.player, 'pression_grand_match')).toBe(1);
    for (const def of Object.values(TRAIT_CATALOGUE)) {
      for (const v of Object.values(def.modifiers)) expect(v).toBeGreaterThanOrEqual(0.85);
      for (const v of Object.values(def.modifiers)) expect(v).toBeLessThanOrEqual(1.15);
    }
  });

  it('tête brûlée après deux rouges, renard à quinze buts, jamais deux fois', () => {
    const state = makeState();
    state.player.seasonStats.total.redCards = 2;
    state.player.seasonStats.total.goals = 15;
    const first = evaluateTraits(state).map((t) => t.id).sort();
    expect(first).toEqual(['renard_des_surfaces', 'tete_brulee']);
    expect(evaluateTraits(state)).toHaveLength(0);
  });

  it('sang-froid : trois buts décisifs dans des grands matchs, comptés une fois par match', () => {
    const state = makeState();
    let date = '2026-09-01';
    for (let i = 0; i < 3; i++) {
      const m = playedMatch(state, `gm${i}`, 'a', 'b', date, 1, 0, makeReport(7.5, { goals: 1, matchId: `gm${i}` }));
      m.importance = 80;
      state.currentDate = date;
      evaluateTraits(state);
      evaluateTraits(state);
      expect(state.player.counters?.decisiveBigMatchGoals).toBe(i + 1);
      date = addDays(date, 7);
    }
    expect(state.player.traits.some((t) => t.id === 'sang_froid_grands_matchs')).toBe(true);
  });

  it('un but dans un match sans enjeu ou une large victoire ne comptent pas', () => {
    const state = makeState();
    const low = playedMatch(state, 'low', 'a', 'b', '2026-09-01', 1, 0, makeReport(7, { goals: 1, matchId: 'low' }));
    low.importance = 30;
    state.currentDate = '2026-09-01';
    evaluateTraits(state);
    expect(state.player.counters?.decisiveBigMatchGoals).toBe(0);
    const big = playedMatch(state, 'big', 'a', 'b', '2026-09-08', 4, 0, makeReport(7, { goals: 1, matchId: 'big' }));
    big.importance = 90;
    state.currentDate = '2026-09-08';
    evaluateTraits(state);
    expect(state.player.counters?.decisiveBigMatchGoals).toBe(0);
  });

  it('chouchou du public après 60 jours à 80 de cote supporters, fragile posé puis retiré', () => {
    const state = makeState();
    state.reputation.supporters.value = 85;
    state.currentDate = '2026-09-01';
    evaluateTraits(state);
    expect(state.player.traits.some((t) => t.id === 'chouchou_du_public')).toBe(false);
    state.currentDate = '2026-11-15';
    evaluateTraits(state);
    expect(state.player.traits.some((t) => t.id === 'chouchou_du_public')).toBe(true);

    for (let i = 0; i < 3; i++) {
      state.player.injuries.push({
        id: `inj${i}`, type: 'ischios', origin: 'match', occurredOn: addDays('2026-06-01', i * 40), announcedDays: 20, actualDays: 25, daysRemaining: 0,
        playedThrough: false, recurrenceRisk: 0.1, healedOn: addDays('2026-06-01', i * 40 + 25),
      });
    }
    evaluateTraits(state);
    expect(state.player.traits.some((t) => t.id === 'fragile')).toBe(true);
    state.currentDate = '2029-06-01';
    evaluateTraits(state);
    expect(state.player.traits.some((t) => t.id === 'fragile')).toBe(false);
  });

  it('mercenaire et ingrat depuis l’historique des transferts', () => {
    const state = makeState();
    state.currentDate = '2029-07-01';
    for (const [i, d] of ['2026-07-01', '2027-07-01', '2028-07-01'].entries()) {
      state.transfers.push({ date: d, fromClubId: `c${i}`, toClubId: `c${i + 1}`, fee: 1_000_000, loan: false, requested: i === 2 });
    }
    const ids = evaluateTraits(state).map((t) => t.id).sort();
    expect(ids).toEqual(['ingrat', 'mercenaire']);
  });
});

describe('sponsors et revenus', () => {
  it('aucune proposition sous le seuil de réputation, puis au plus une par tirage, déterministe', () => {
    const a = makeState();
    a.reputation.world.value = 5;
    expect(rollSponsorOffers(a)).toHaveLength(0);

    const b = makeState();
    b.reputation.world.value = 60;
    b.reputation.media.value = 50;
    let offers = 0;
    for (let i = 0; i < 24; i++) {
      b.currentDate = addDays('2026-08-01', i * 30);
      const got = rollSponsorOffers(b);
      expect(got.length).toBeLessThanOrEqual(1);
      offers += got.length;
      for (const d of got) {
        expect(d.status).toBe('proposee');
        expect(d.amountYearly).toBeGreaterThan(0);
        expect(SPONSOR_BRANDS.some((x) => x.brand === d.brand)).toBe(true);
      }
    }
    expect(offers).toBeGreaterThan(0);
    // Propositions sans réponse : expirées, jamais plus de maxActive en attente.
    expect(b.sponsors.filter((d) => d.status === 'proposee').length).toBeLessThanOrEqual(D.sponsors.maxActive);
    expect(b.sponsors.some((d) => d.status === 'refusee')).toBe(true);

    const c = makeState();
    c.reputation.world.value = 60;
    c.reputation.media.value = 50;
    for (let i = 0; i < 24; i++) {
      c.currentDate = addDays('2026-08-01', i * 30);
      rollSponsorOffers(c);
    }
    expect(c.sponsors.map((d) => [d.brand, d.amountYearly, d.endsOn])).toEqual(b.sponsors.map((d) => [d.brand, d.amountYearly, d.endsOn]));
  });

  it('accepter, refuser, négocier (un seul tour) et cumuler les revenus', () => {
    const state = makeState();
    state.reputation.world.value = 70;
    state.reputation.media.value = 40;
    let deal = null;
    for (let i = 0; i < 12 && !deal; i++) {
      state.currentDate = addDays('2026-08-01', i * 30);
      deal = rollSponsorOffers(state)[0] ?? null;
    }
    expect(deal).not.toBeNull();
    const before = deal!.amountYearly;
    const first = respondToSponsor(state, deal!.id, 'negocier');
    if (first.outcome === 'contre_offre') {
      expect(deal!.amountYearly).toBeGreaterThan(before);
      expect(deal!.status).toBe('proposee');
      expect(respondToSponsor(state, deal!.id, 'negocier').outcome).toBe('refuse');
    } else {
      expect(first.outcome).toBe('refuse');
      expect(deal!.status).toBe('refusee');
    }

    const s2 = makeState();
    s2.reputation.world.value = 70;
    s2.reputation.media.value = 40;
    let d2 = null;
    for (let i = 0; i < 12 && !d2; i++) {
      s2.currentDate = addDays('2026-08-01', i * 30);
      d2 = rollSponsorOffers(s2)[0] ?? null;
    }
    const mediaBefore = s2.reputation.media.value;
    expect(respondToSponsor(s2, d2!.id, 'accepter').outcome).toBe('accepte');
    expect(d2!.status).toBe('active');
    expect(s2.reputation.media.value).toBeGreaterThan(mediaBefore);
    expect(() => respondToSponsor(s2, d2!.id, 'accepter')).toThrow();
    expect(s2.events.find((e) => e.id === `event-${d2!.id}`)?.resolved).toBe(true);

    accrueMonthlyEarnings(s2);
    expect(s2.player.earnings?.wagesTotal).toBe(s2.player.contract.wageMonthly);
    expect(s2.player.earnings?.sponsorsTotal).toBe(Math.round(d2!.amountYearly / 12));
    accrueMatchBonuses(s2, makeReport(7, { goals: 2, assists: 1 }));
    const b = s2.player.contract.bonuses;
    expect(s2.player.earnings?.bonusesTotal).toBe(b.perAppearance + 2 * b.perGoal + b.perAssist);
    accrueMatchBonuses(s2, makeReport(6, { minutes: 0 }));
    expect(s2.player.earnings?.bonusesTotal).toBe(b.perAppearance + 2 * b.perGoal + b.perAssist);
  });
});

describe('fin de carrière', () => {
  it('canRetire : âge, contrat échu ou blessure de fin de carrière', () => {
    const young = makeState();
    expect(canRetire(young)).toBe(false);
    young.player.contract.endsOn = '2026-06-30';
    expect(canRetire(young)).toBe(true);

    const hurt = makeState();
    hurt.player.injuries.push({ id: 'k', type: 'croises', origin: 'match', occurredOn: hurt.currentDate, announcedDays: 240, actualDays: 320, daysRemaining: 320, playedThrough: false, recurrenceRisk: 0.3 });
    expect(canRetire(hurt)).toBe(true);

    const old = makeState();
    old.player.identity.birthDate = '1992-01-01';
    expect(canRetire(old)).toBe(true);
    expect(mustRetire(old)).toBe(false);
    old.player.identity.birthDate = '1987-01-01';
    expect(mustRetire(old)).toBe(true);
  });

  it('retire fige le bilan, journalise, clôt les storylines et reste idempotent', () => {
    const state = makeState();
    state.player.careerStats.matches = 120;
    state.player.careerStats.goals = 30;
    state.player.trophies.push({ kind: 'championnat', seasonId: 's2026', clubId: 'a' });
    state.storylines.push({ id: 'st', kind: 'capitanat', title: 'Brassard', startedOn: state.currentDate, status: 'ouverte', stage: 'ouverture', vars: {}, npcIds: [], log: [] });
    const summary = retire(state, 'test');
    expect(state.retired).toBe(true);
    expect(summary.matches).toBe(120);
    expect(summary.trophies).toEqual(['championnat']);
    expect(summary.clubs).toContain('Alpha');
    expect(summary.verdict).toMatch(/belle carrière/);
    expect(state.storylines[0]!.status).toBe('expiree');
    expect(state.memory.some((m) => m.importance === 5)).toBe(true);
    const logs = state.log.length;
    retire(state, 'encore');
    expect(state.log.length).toBe(logs);
    expect(canRetire(state)).toBe(false);
    expect(careerSummary(makeState()).verdict).toMatch(/discrète/);
  });
});
