/**
 * Scènes de dialogue (repli sans LLM) : ouverture, réponse, deltas bornés,
 * citation journalisée, promesse créée puis vérifiée par le moteur,
 * planification des scènes après un match.
 */
import { describe, expect, it } from 'vitest';
import { answerScene, sceneFacts, startScene } from '../scenes/conversation';
import { scenesAfterMatch, scenesForDay } from '../scenes/scheduler';
import { evaluatePromises, promiseVerdict } from '../../engine/career/promises';
import { newCareer } from '../../engine/career/newCareer';
import { advanceDay } from '../../engine/calendar/advanceDay';
import { generateFictionalDataset } from '../../engine/world/loadDataset';
import { buildAllocation, midTableClubId } from '../../engine/sim/headless';
import type { CareerSetup, CareerState, DayResult } from '../../engine/types';

function career(seed = 5): CareerState {
  const dataset = generateFictionalDataset(42);
  const clubId = midTableClubId(dataset);
  const setup: CareerSetup = {
    firstName: 'Léo', lastName: 'Martin', startAge: 18, nationality: 'FRA', position: 'BU', foot: 'droit', heightCm: 180, weightKg: 74,
    archetypes: ['finisseur'], clubId, startingLevel: 'pepite', difficulty: 'exigeant',
    allocation: buildAllocation({ startAge: 18, position: 'BU', startingLevel: 'pepite' }), datasetId: dataset.id, seed,
  };
  return newCareer(setup, dataset);
}

/** Avance jusqu'au premier match joué par le joueur. */
function playUntilMatch(state: CareerState): DayResult {
  let guard = 0;
  let r = advanceDay(state);
  while (!(r.matchResult?.playerReport && r.matchResult.playerReport.minutesPlayed > 0) && guard++ < 200) r = advanceDay(state);
  return r;
}

describe('scènes : conférence de presse', () => {
  it('ouvre avec un journaliste, applique une réponse arrogante, journalise la citation', async () => {
    const state = career();
    const day = playUntilMatch(state);
    expect(day.matchId).toBeDefined();
    const conv = startScene(state, { kind: 'conference', title: 'Conférence de presse', matchId: day.matchId, mandatory: false });
    expect(conv.npcKind).toBe('journaliste');
    expect(conv.turns[0]!.npcLine.length).toBeGreaterThan(10);
    const before = state.reputation.supporters.value;
    const teammatesBefore = state.reputation.teammates.value;
    const res = await answerScene(state, conv, 'Je suis le meilleur ici, sans moi cette équipe ne gagne rien, mes coéquipiers ne m’ont pas servi.', { useLlm: false });
    expect(res.analysis.flags.arrogance).toBe(true);
    expect(res.source).toBe('fallback');
    expect(state.quotes).toHaveLength(1);
    expect(state.quotes[0]!.text).toContain('le meilleur');
    expect(state.reputation.supporters.value).toBeLessThan(before);
    expect(state.reputation.teammates.value).toBeLessThan(teammatesBefore);
    expect(Object.values(res.applied).every((v) => Math.abs(v!) <= 5)).toBe(true);
    expect(state.relationships[conv.npcId]!.history.length).toBeGreaterThan(1);
    expect(state.memory.some((m) => m.type === 'declaration')).toBe(true);
  });

  it('enchaîne les questions puis termine, sans jamais dépasser ±12 de réputation par jour', async () => {
    const state = career(6);
    const day = playUntilMatch(state);
    const conv = startScene(state, { kind: 'conference', title: 'Conférence de presse', matchId: day.matchId, mandatory: false });
    const start = state.reputation.supporters.value;
    let res;
    let guard = 0;
    do {
      res = await answerScene(state, conv, 'Merci aux supporters, c’est un succès collectif, on va continuer à travailler.', { useLlm: false });
      guard++;
    } while (!res.done && guard < 6);
    expect(res.done).toBe(true);
    expect(conv.turns.filter((t) => t.playerText).length).toBe(conv.maxTurns);
    expect(state.reputation.supporters.value - start).toBeLessThanOrEqual(12);
    await expect(answerScene(state, conv, 'encore', { useLlm: false })).rejects.toThrow();
  });
});

describe('scènes : promesses vérifiées par le moteur', () => {
  it('une promesse de marquer est créée, puis tenue ou rompue selon les buts réels', async () => {
    const state = career(7);
    const day = playUntilMatch(state);
    const conv = startScene(state, { kind: 'flash', title: 'Interview flash', matchId: day.matchId, mandatory: false });
    await answerScene(state, conv, 'Je vais marquer dimanche, je vous le promets.', { useLlm: false });
    expect(state.promises).toHaveLength(1);
    const p = state.promises[0]!;
    expect(p.status).toBe('en_cours');
    expect(p.check.type).toBe('declaratif');
    // Promesse liée à un match précis : tenue si but, rompue sinon.
    const nextMatch = Object.values(state.matches).filter((m) => m.involvesPlayer && m.status === 'a_venir').sort((a, b) => a.date.localeCompare(b.date))[0]!;
    state.promises.push({ id: 'p2', quoteId: state.quotes[0]!.id, text: 'Je marquerai contre eux', madeOn: state.currentDate, deadline: nextMatch.date, check: { type: 'marquer_dans_match', matchId: nextMatch.id }, status: 'en_cours' });
    expect(promiseVerdict(state, state.promises[1]!)).toBe('en_cours');
    let guard = 0;
    while (nextMatch.status !== 'joue' && guard++ < 60) advanceDay(state);
    const p2 = state.promises.find((x) => x.id === 'p2')!;
    const goals = nextMatch.result?.playerReport?.stats.goals ?? 0;
    expect(p2.status).toBe(goals > 0 ? 'tenue' : 'rompue');
    expect(state.memory.some((m) => m.type === 'promesse')).toBe(true);
    expect(evaluatePromises(state)).toHaveLength(0);
  });
});

describe('scènes : planification', () => {
  it('propose flash et conférence selon le match, agent et coach selon l’état', () => {
    const state = career(8);
    const day = playUntilMatch(state);
    const after = scenesAfterMatch(state, day);
    expect(after.some((s) => s.kind === 'flash')).toBe(day.matchResult!.playerReport!.minutesPlayed >= 20 || day.matchResult!.playerReport!.stats.goals > 0);
    state.player.coachTrust = 10;
    state.season.phase = 'championnat';
    const scenes = scenesForDay(state);
    expect(scenes.some((s) => s.kind === 'bureau_coach' && s.topic === 'sanction')).toBe(true);
    const facts = sceneFacts(state, day.matchId);
    expect(facts.prenom).toBe('Léo');
    expect(facts.report).toBeDefined();
  });
});

describe('scènes de la semaine : on vient te parler', () => {
  it('le coach prend le joueur à part avant un match à gros enjeu', () => {
    const state = career(11);
    const prochain = Object.values(state.matches)
      .filter((m) => m.status === 'a_venir' && m.involvesPlayer)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
    prochain.importance = 90;
    state.currentDate = prochain.date;
    const scenes = scenesForDay(state);
    expect(scenes.some((s) => s.kind === 'bureau_coach')).toBe(true);
  });

  it('le capitaine vient voir un joueur en petite forme', () => {
    const state = career(12);
    let guard = 0;
    while (guard++ < 400 && Object.values(state.matches).filter((m) => m.result?.playerReport && m.result.playerReport.minutesPlayed > 0).length < 2) {
      advanceDay(state);
    }
    // Deux notes basses d'affilée : le vestiaire réagit.
    for (const m of Object.values(state.matches)) {
      if (m.result?.playerReport && m.result.playerReport.minutesPlayed > 0) m.result.playerReport.rating = 5.0;
    }
    expect(scenesForDay(state).some((s) => s.kind === 'vestiaire')).toBe(true);
  });

  it('une offre ouverte déclenche un appel de l’agent', () => {
    const state = career(13);
    state.offers.push({
      id: 'o-test', clubId: Object.keys(state.world.clubs).find((id) => id !== state.player.contract.clubId)!,
      receivedOn: state.currentDate, expiresOn: '2027-01-01', interest: 4, fee: 5_000_000, wageMonthly: 30_000,
      years: 4, promisedRole: 'titulaire', loan: false, status: 'en_attente', currentClubStance: 'ouvert', negotiationLog: [],
    });
    expect(scenesForDay(state).some((s) => s.kind === 'agent')).toBe(true);
  });

  it('ces scènes ne se répètent pas tous les jours', () => {
    const state = career(14);
    state.offers.push({
      id: 'o-test', clubId: Object.keys(state.world.clubs).find((id) => id !== state.player.contract.clubId)!,
      receivedOn: state.currentDate, expiresOn: '2027-01-01', interest: 4, fee: 5_000_000, wageMonthly: 30_000,
      years: 4, promisedRole: 'titulaire', loan: false, status: 'en_attente', currentClubStance: 'ouvert', negotiationLog: [],
    });
    const spec = scenesForDay(state).find((s) => s.kind === 'agent')!;
    const conv = startScene(state, spec);
    // La scène joue : une citation est enregistrée sur le canal 'telephone'.
    return answerScene(state, conv, 'Je regarde, mais je suis bien ici.', { useLlm: false }).then(() => {
      expect(scenesForDay(state).some((s) => s.kind === 'agent')).toBe(false);
    });
  });
});
