/**
 * Sortir de l'impasse du temps de jeu.
 *
 * Mesuré avant correction : un « prometteur » signant à Strasbourg (attaquants
 * 74, 70, 67, 67, 65) ne dispute pas une titularisation en quatre saisons et
 * tombe à zéro minute dès la deuxième. Rien ne le lui disait, et l'agent
 * appelait « pour une offre » sans jamais la nommer — le préambule interdisant
 * au modèle d'inventer un chiffre, il ne pouvait structurellement pas.
 */
import { describe, expect, it } from 'vitest';
import realDataset from '../../data/leagues/real/ligue1-2026-27.json';
import { parseDataset } from '../../data/schema';
import { newCareer } from '../../engine/career/newCareer';
import { advanceDay } from '../../engine/calendar/advanceDay';
import { buildAllocation } from '../../engine/sim/headless';
import { scenesForDay } from '../scenes/scheduler';
import { decrireOffre, sceneFacts } from '../scenes/conversation';
import { agentOpening, coachOfficeOpening } from '../scenes/questions';
import type { CareerSetup, CareerState } from '../../engine/types';

const dataset = parseDataset(realDataset);

function carriereBloquee(): CareerState {
  const setup: CareerSetup = {
    firstName: 'Nicolas', lastName: 'Crevette', startAge: 18, nationality: 'FRA', position: 'BU',
    foot: 'droit', heightCm: 180, weightKg: 75, archetypes: ['finisseur'],
    clubId: 'strasbourg', startingLevel: 'prometteur', difficulty: 'exigeant',
    allocation: buildAllocation({ startAge: 18, position: 'BU', startingLevel: 'prometteur' }),
    datasetId: dataset.id, seed: 1,
  };
  return newCareer(setup, dataset);
}

describe('un joueur qui ne joue plus doit l’apprendre', () => {
  it('compte les matchs consécutifs sans entrer, et le coach finit par convoquer', () => {
    const state = carriereBloquee();
    let convocation: string | undefined;
    for (let i = 0; i < 700 && !convocation; i++) {
      advanceDay(state);
      const sc = scenesForDay(state).find((s) => s.topic === 'statut');
      if (sc) convocation = sc.title;
    }
    expect(state.player.matchsSansJouer ?? 0).toBeGreaterThanOrEqual(3);
    expect(convocation, 'le coach n’a jamais fait le point sur la place du joueur').toBeDefined();

    const texte = coachOfficeOpening(sceneFacts(state), 'statut');
    // Il doit nommer les faits, pas rester vague.
    expect(texte).toMatch(/\d+ matchs/);
    expect(texte).toMatch(/plans/);
  });

  it('une minute jouée remet le compteur à zéro', () => {
    const state = carriereBloquee();
    state.player.matchsSansJouer = 9;
    for (let i = 0; i < 400; i++) {
      advanceDay(state);
      if ((state.player.matchsSansJouer ?? 0) === 0) break;
    }
    // Le joueur de Strasbourg entre au moins une fois la première saison.
    expect(state.player.matchsSansJouer).toBe(0);
  });
});

describe('l’agent nomme l’offre', () => {
  it('dit le club, l’argent, la durée et le rôle', () => {
    const state = carriereBloquee();
    let offre;
    for (let i = 0; i < 700 && !offre; i++) {
      advanceDay(state);
      offre = state.offers.find((o) => o.status === 'en_attente');
    }
    expect(offre, 'aucune offre reçue en deux saisons').toBeDefined();

    const facts = sceneFacts(state);
    expect(facts.offre, 'les faits de scène ne portent pas l’offre').toBeDefined();
    const texte = agentOpening(facts, 'interet');
    const decrite = decrireOffre(state, offre!);
    expect(texte).toContain(decrite.club);
    expect(texte).toContain(decrite.salaire);
    expect(texte).toContain(decrite.role);
    // L'ancienne réplique disait littéralement qu'elle ne dirait rien de plus.
    expect(texte).not.toContain('Je ne dis rien de plus');
  });

  it('distingue une prolongation d’un départ', () => {
    const state = carriereBloquee();
    const offre = {
      id: 'o1', clubId: state.player.contract.clubId, receivedOn: state.currentDate, expiresOn: state.currentDate,
      interest: 3 as const, fee: 0, wageMonthly: 42_000, years: 3, promisedRole: 'titulaire' as const,
      loan: false, status: 'en_attente' as const, currentClubStance: 'ouvert' as const, negotiationLog: [],
    };
    const d = decrireOffre(state, offre);
    expect(d.prolongation).toBe(true);
    const facts = { ...sceneFacts(state), offre: d };
    expect(agentOpening(facts, 'interet')).toContain('prolonger');
  });
});
