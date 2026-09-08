/**
 * Mercato (Phase 6, §11) : intérêt des clubs, offres et fenêtres, négociation
 * déterministe, exécution d'un transfert, demande de transfert, prolongation
 * de contrat, et un scénario de bout en bout sur une saison complète.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { addDays } from '../calendar/dates';
import { ATTRIBUTE_KEYS, type CareerSetup, type TransferOffer } from '../types';
import { computeInterest } from '../transfers/interest';
import { expireOffers, rollTransferOffers, transferWindowOpen } from '../transfers/offers';
import {
  type CounterProposal, executeTransfer, requestTransfer, respondToOffer, rollContractRenewal,
} from '../transfers/negotiate';
import { computeMarketValue, suggestedWage } from '../player/marketValue';
import { updatePositionHierarchy } from '../season/lineupSelection';
import { advanceDay } from '../calendar/advanceDay';
import { newCareer } from '../career/newCareer';
import { generateFictionalDataset } from '../world/loadDataset';
import { buildAllocation, midTableClubId } from '../sim/headless';
import { makeMatch, makeState } from './helpers/seasonFixtures';

describe('transfers/interest : computeInterest', () => {
  it('un club de très grand prestige ne s\'intéresse pas à un joueur modeste', () => {
    const state = makeState({
      clubs: [{ id: 'a', name: 'Alpha', prestige: 40 }, { id: 'big', name: 'Megaclub', prestige: 92 }],
      playerClubId: 'a', playerPosition: 'BU', playerOverall: 62,
    });
    state.world.clubs['big']!.transferBudget = 300_000_000;
    const interests = computeInterest(state);
    expect(interests.some((i) => i.clubId === 'big')).toBe(false);
  });

  it('un club au budget modeste ne peut pas se permettre un joueur valant 30+ M€', () => {
    const state = makeState({
      clubs: [{ id: 'a', name: 'Alpha', prestige: 50 }, { id: 'poor', name: 'Petit Club', prestige: 45 }],
      playerClubId: 'a', playerPosition: 'BU', playerOverall: 85,
    });
    state.world.clubs['poor']!.transferBudget = 2_000_000;
    const interests = computeInterest(state);
    expect(interests.some((i) => i.clubId === 'poor')).toBe(false);
  });

  it('un club qui a besoin au poste et les moyens de payer est listé, avec un rôle plausible', () => {
    const state = makeState({
      clubs: [{ id: 'a', name: 'Alpha', prestige: 50 }, { id: 'b', name: 'Beta', prestige: 55 }],
      playerClubId: 'a', playerPosition: 'BU', playerOverall: 72,
    });
    const interests = computeInterest(state);
    const beta = interests.find((i) => i.clubId === 'b');
    expect(beta).toBeDefined();
    expect(beta!.stars).toBeGreaterThanOrEqual(1);
    expect(beta!.stars).toBeLessThanOrEqual(5);
    expect(['titulaire_indiscutable', 'titulaire', 'rotation', 'projet']).toContain(beta!.need);
  });

  it('est déterministe (aucun aléa)', () => {
    const state = makeState({ playerClubId: 'a', playerOverall: 74 });
    expect(computeInterest(state)).toEqual(computeInterest(state));
  });
});

describe('transfers/offers : fenêtres et tirage', () => {
  it('transferWindowOpen détecte été/hiver et rien en dehors', () => {
    const state = makeState();
    expect(transferWindowOpen(state, '2026-07-15')).toBe('summer');
    expect(transferWindowOpen(state, '2027-01-15')).toBe('winter');
    expect(transferWindowOpen(state, '2026-10-01')).toBeNull();
  });

  it('ne crée aucune offre hors fenêtre, même pour un joueur très demandé', () => {
    const state = makeState({ date: '2026-10-15', playerOverall: 90 });
    expect(rollTransferOffers(state)).toEqual([]);
    expect(state.offers).toHaveLength(0);
  });

  it('crée des offres seulement pendant la fenêtre, jamais plus de 3 ouvertes à la fois', () => {
    const clubs = [{ id: 'a', name: 'Alpha', prestige: 55 }];
    for (let i = 0; i < 8; i++) clubs.push({ id: `c${i}`, name: `Club ${i}`, prestige: 50 + i });
    const state = makeState({ clubs, playerClubId: 'a', playerPosition: 'BU', playerOverall: 74, date: '2026-07-01' });
    let totalCreated = 0;
    for (let i = 0; i < 45; i++) {
      expireOffers(state);
      totalCreated += rollTransferOffers(state).length;
      const open = state.offers.filter((o) => o.status === 'en_attente' || o.status === 'en_negociation').length;
      expect(open).toBeLessThanOrEqual(BALANCE.depth.transfers.maxOpenOffers);
      state.currentDate = addDays(state.currentDate, 1);
    }
    expect(totalCreated).toBeGreaterThan(0);
    for (const o of state.offers) {
      expect(o.years).toBeGreaterThanOrEqual(1);
      expect(o.expiresOn > o.receivedOn).toBe(true);
      expect(o.fee).toBeGreaterThanOrEqual(0);
    }
  });

  it('montants et salaires cohérents avec la valeur marchande et le salaire suggéré', () => {
    const state = makeState({
      clubs: [
        { id: 'a', name: 'Alpha', prestige: 55 }, { id: 'b', name: 'Beta', prestige: 60 }, { id: 'c', name: 'Gamma', prestige: 58 },
        { id: 'd', name: 'Delta', prestige: 56 }, { id: 'e', name: 'Epsilon', prestige: 60 }, { id: 'f', name: 'Zeta', prestige: 57 },
      ],
      playerClubId: 'a', playerPosition: 'BU', playerOverall: 78, date: '2026-07-01',
    });
    let created: TransferOffer[] = [];
    for (let i = 0; i < 60 && created.length === 0; i++) {
      created = rollTransferOffers(state);
      if (created.length === 0) state.currentDate = addDays(state.currentDate, 1);
    }
    expect(created.length).toBeGreaterThan(0);
    const offer = created[0]!;
    const club = state.world.clubs[offer.clubId]!;
    const league = state.world.leagues[club.leagueId]!;
    const marketValue = computeMarketValue(state.player, 18, club, league, state.world.marketInflation, state.currentDate);
    if (!offer.loan) {
      expect(offer.fee).toBeGreaterThan(marketValue * 0.5);
      expect(offer.fee).toBeLessThan(marketValue * 1.6);
    }
    const wageBase = suggestedWage(state.player.overall, 18, club, league);
    expect(offer.wageMonthly).toBeGreaterThan(wageBase * 0.8);
    expect(offer.wageMonthly).toBeLessThan(wageBase * 1.4);
  });

  it('expire les offres après le délai', () => {
    const state = makeState();
    state.offers.push({
      id: 'o1', clubId: 'b', receivedOn: state.currentDate, expiresOn: addDays(state.currentDate, 10),
      interest: 3, fee: 1_000_000, wageMonthly: 50_000, years: 3, promisedRole: 'rotation', loan: false,
      status: 'en_attente', currentClubStance: 'ouvert', negotiationLog: [],
    });
    state.currentDate = addDays(state.currentDate, 11);
    const expired = expireOffers(state);
    expect(expired).toHaveLength(1);
    expect(state.offers[0]!.status).toBe('expiree');
  });
});

describe('transfers/negotiate : négociation, exécution, demande, prolongation', () => {
  it('la négociation est déterministe pour une même graine et le même échange', () => {
    const base = makeState({ playerClubId: 'a', playerOverall: 76 });
    base.offers.push({
      id: 'o1', clubId: 'b', receivedOn: base.currentDate, expiresOn: addDays(base.currentDate, 10),
      interest: 4, fee: 20_000_000, wageMonthly: 150_000, years: 3, promisedRole: 'titulaire', loan: false,
      status: 'en_attente', currentClubStance: 'ouvert', negotiationLog: [],
    });
    const s1 = JSON.parse(JSON.stringify(base));
    const s2 = JSON.parse(JSON.stringify(base));
    const counter: CounterProposal = { wageMonthly: 200_000, years: 4 };
    const r1 = respondToOffer(s1, 'o1', { type: 'negocier', counter });
    const r2 = respondToOffer(s2, 'o1', { type: 'negocier', counter });
    expect(r1.outcome).toBe(r2.outcome);
    expect(r1.offer.wageMonthly).toBe(r2.offer.wageMonthly);
    expect(r1.offer.status).toBe(r2.offer.status);
    expect(r1.offer.years).toBe(r2.offer.years);
  });

  it('au plus 2 tours de négociation avant une décision finale', () => {
    const state = makeState({ playerClubId: 'a', playerOverall: 76 });
    state.offers.push({
      id: 'o1', clubId: 'b', receivedOn: state.currentDate, expiresOn: addDays(state.currentDate, 10),
      interest: 4, fee: 20_000_000, wageMonthly: 100_000, years: 3, promisedRole: 'titulaire', loan: false,
      status: 'en_attente', currentClubStance: 'ouvert', negotiationLog: [],
    });
    // Demande extravagante : le club ne peut pas l'accepter tout de suite ; au plus 2 échanges avant que ça se tranche.
    let result = respondToOffer(state, 'o1', { type: 'negocier', counter: { wageMonthly: 10_000_000 } });
    let rounds = 1;
    while (result.outcome === 'contre_offre' && rounds < 5) {
      result = respondToOffer(state, 'o1', { type: 'negocier', counter: { wageMonthly: 10_000_000 } });
      rounds++;
    }
    expect(rounds).toBeLessThanOrEqual(2);
    expect(['accepte', 'refuse']).toContain(result.outcome);
  });

  it('executeTransfer met à jour contrat, matchs à venir, hiérarchies, historique, inflation, réputation et confiance', () => {
    const state = makeState({
      clubs: [{ id: 'a', name: 'Alpha', prestige: 50 }, { id: 'b', name: 'Beta', prestige: 65 }, { id: 'c', name: 'Gamma', prestige: 50 }],
      playerClubId: 'a', playerPosition: 'BU', playerOverall: 88,
    });
    const matchA = makeMatch('m-a', 'a', 'c', '2026-09-20', { involvesPlayer: true });
    const matchB = makeMatch('m-b', 'b', 'c', '2026-09-21', { involvesPlayer: false });
    state.matches[matchA.id] = matchA;
    state.matches[matchB.id] = matchB;

    const inflationBefore = state.world.marketInflation;
    const transfersBefore = state.transfers.length;
    const offer: TransferOffer = {
      id: 'off1', clubId: 'b', receivedOn: state.currentDate, expiresOn: addDays(state.currentDate, 10),
      interest: 5, fee: 25_000_000, wageMonthly: 180_000, years: 4, promisedRole: 'titulaire',
      releaseClause: 60_000_000, loan: false, status: 'en_attente', currentClubStance: 'ouvert', negotiationLog: [],
    };

    const record = executeTransfer(state, offer);

    expect(state.player.contract.clubId).toBe('b');
    expect(state.player.contract.wageMonthly).toBe(180_000);
    expect(state.player.contract.releaseClause).toBe(60_000_000);
    expect(state.player.contract.loanFromClubId).toBeUndefined();
    expect(state.player.coachTrust).toBe(BALANCE.depth.transfers.execution.coachTrustAfterByRole[state.player.contract.promisedRole]);

    expect(state.matches['m-a']!.involvesPlayer).toBe(false);
    expect(state.matches['m-b']!.involvesPlayer).toBe(true);

    expect(state.world.clubs['a']!.positionHierarchy['BU']).toBeDefined();
    expect(state.world.clubs['b']!.positionHierarchy['BU']).toBeDefined();
    expect(state.world.clubs['b']!.positionHierarchy['BU']![0]).toBe(state.player.id);

    expect(state.transfers.length).toBe(transfersBefore + 1);
    expect(record.fromClubId).toBe('a');
    expect(record.toClubId).toBe('b');
    expect(record.fee).toBe(25_000_000);
    expect(record.loan).toBe(false);
    expect(state.world.marketInflation).toBeGreaterThan(inflationBefore);
    expect(state.memory.some((m) => m.type === 'transfert' && m.importance === BALANCE.depth.transfers.execution.memoryImportance)).toBe(true);
    expect(state.log.some((l) => l.category === 'transfert')).toBe(true);
  });

  it('un prêt garde le club propriétaire (loanFromClubId) et joue pour le club de prêt', () => {
    const state = makeState({
      clubs: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }],
      playerClubId: 'a', playerPosition: 'BU', playerOverall: 70,
    });
    const offer: TransferOffer = {
      id: 'loan1', clubId: 'b', receivedOn: state.currentDate, expiresOn: addDays(state.currentDate, 10),
      interest: 3, fee: 0, wageMonthly: 60_000, years: 1, promisedRole: 'rotation', loan: true,
      status: 'en_attente', currentClubStance: 'ouvert', negotiationLog: [],
    };
    executeTransfer(state, offer);
    expect(state.player.contract.clubId).toBe('b');
    expect(state.player.contract.loanFromClubId).toBe('a');
  });

  it('requestTransfer applique les malus (confiance, réputation) et ouvre une storyline demande_transfert', () => {
    const state = makeState({ coachTrust: 60 });
    const trustBefore = state.player.coachTrust;
    const supportersBefore = state.reputation.supporters.value;
    requestTransfer(state);
    expect(state.player.coachTrust).toBe(trustBefore - BALANCE.coach.transferRequest.trustMalus);
    expect(state.reputation.supporters.value).toBeLessThan(supportersBefore);
    const storyline = state.storylines.find((s) => s.kind === 'demande_transfert');
    expect(storyline).toBeDefined();
    expect(storyline!.status).toBe('ouverte');
  });

  it('une demande de transfert rend le club actuel « ouvert » aux offres suivantes', () => {
    const state = makeState({
      clubs: [
        { id: 'a', name: 'Alpha', prestige: 55 }, { id: 'b', name: 'Beta', prestige: 55 }, { id: 'c', name: 'Gamma', prestige: 58 },
        { id: 'd', name: 'Delta', prestige: 56 }, { id: 'e', name: 'Epsilon', prestige: 60 }, { id: 'f', name: 'Zeta', prestige: 57 },
      ],
      playerClubId: 'a', playerPosition: 'BU', playerOverall: 74, date: '2026-07-01',
    });
    requestTransfer(state);
    let created: TransferOffer[] = [];
    for (let i = 0; i < 60 && created.length === 0; i++) {
      created = rollTransferOffers(state);
      if (created.length === 0) state.currentDate = addDays(state.currentDate, 1);
    }
    expect(created.length).toBeGreaterThan(0);
    expect(created[0]!.currentClubStance).toBe('ouvert');
  });

  it('rollContractRenewal propose une prolongation quand le contrat expire bientôt et le joueur est utile ; acceptable sans transfert', () => {
    const state = makeState({ playerClubId: 'a', playerPosition: 'BU', playerOverall: 75, coachTrust: 70, date: '2026-08-15' });
    state.player.contract.endsOn = '2027-03-01';
    updatePositionHierarchy(state, 'a');

    let offer: TransferOffer | null = null;
    for (let i = 0; i < 60 && !offer; i++) {
      offer = rollContractRenewal(state);
      if (!offer) state.currentDate = addDays(state.currentDate, 1);
    }
    expect(offer).not.toBeNull();
    expect(offer!.clubId).toBe('a');
    expect(offer!.fee).toBe(0);

    const transfersBefore = state.transfers.length;
    const res = respondToOffer(state, offer!.id, { type: 'accepter' });
    expect(res.outcome).toBe('accepte');
    expect(state.player.contract.clubId).toBe('a');
    expect(state.player.contract.wageMonthly).toBe(offer!.wageMonthly);
    expect(state.transfers.length).toBe(transfersBefore);
  });

  it('ne propose pas de prolongation si le contrat est encore long', () => {
    const state = makeState({ playerClubId: 'a', playerOverall: 75, coachTrust: 80 });
    state.player.contract.endsOn = '2031-06-30';
    expect(rollContractRenewal(state)).toBeNull();
  });
});

describe('mercato : scénario de bout en bout sur une saison', () => {
  it('des offres apparaissent et un transfert accepté conduit à des matchs joués avec le nouveau club', () => {
    const dataset = generateFictionalDataset(42);
    const clubId = midTableClubId(dataset);
    const setup: CareerSetup = {
      firstName: 'Test', lastName: 'Mercato', startAge: 18, nationality: 'FRA', position: 'BU', foot: 'droit',
      heightCm: 182, weightKg: 76, archetypes: ['finisseur'], clubId, startingLevel: 'pepite', difficulty: 'realiste',
      allocation: buildAllocation({ startAge: 18, position: 'BU', startingLevel: 'pepite' }), datasetId: dataset.id, seed: 42,
    };
    const state = newCareer(setup, dataset);
    const startClubId = state.player.contract.clubId;

    // Un profil de superstar pour garantir des offres tôt dans la fenêtre d'été.
    for (const key of ATTRIBUTE_KEYS) state.player.attributes[key] = 90;
    state.player.overall = 90;
    state.player.potential = 95;
    state.player.potentialEstimate = { low: 90, high: 99, statement: 'Superstar', updatedOn: state.currentDate };
    state.reputation.league.value = 85;
    state.reputation.world.value = 75;

    let acceptedOfferId: string | undefined;
    let guard = 0;
    let playedForNewClub = false;
    while (guard++ < 400 && !state.retired && !playedForNewClub) {
      expect(() => advanceDay(state)).not.toThrow();
      if (!acceptedOfferId) {
        const pending = state.offers.find((o) => o.status === 'en_attente' && o.fee > 0 && o.clubId !== startClubId);
        if (pending) {
          const res = respondToOffer(state, pending.id, { type: 'accepter' });
          if (res.outcome === 'accepte') acceptedOfferId = pending.id;
        }
      }
      if (acceptedOfferId && state.player.contract.clubId !== startClubId) {
        const newClubId = state.player.contract.clubId;
        const transferDate = state.transfers[state.transfers.length - 1]!.date;
        playedForNewClub = Object.values(state.matches).some((m) => m.status === 'joue' && m.involvesPlayer
          && transferDate <= m.date && (m.homeClubId === newClubId || m.awayClubId === newClubId));
      }
    }

    expect(state.offers.length).toBeGreaterThan(0);
    expect(acceptedOfferId).toBeDefined();
    expect(state.transfers.length).toBeGreaterThan(0);
    expect(state.player.contract.clubId).not.toBe(startClubId);
    expect(playedForNewClub).toBe(true);
  });
});
