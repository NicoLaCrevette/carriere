/**
 * §6.3 : aucune combinaison (attributs 99 partout, forme +5, fitness 100,
 * pression 0, risque 0, adversaire faible) ne dépasse le plafond de sa
 * situation-action ; avec des attributs à 1, la probabilité reste > 0 et
 * sous la base. Balayage exhaustif de la table des actions.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { mulberry32 } from '../rng/mulberry32';
import { SITUATION_KINDS, type Position, type SituationKind } from '../types';
import { buildMatchContext, createMatchState } from '../match/simulateMatch';
import { buildSituation } from '../match/situations';
import { actionProbability } from '../match/resolve';
import { uniformAttributes } from '../player/common';
import { makeMatch, makeState } from './helpers/seasonFixtures';

function contextFor(position: Position) {
  const state = makeState({ playerOverall: 70, coachTrust: 100, playerPosition: position });
  const match = makeMatch('caps', 'a', 'b', '2026-08-15', { involvesPlayer: true });
  state.matches[match.id] = match;
  const ctx = buildMatchContext(state, match, 'auto');
  const ms = createMatchState(ctx);
  ms.minute = 30;
  ms.tick = 30;
  ms.playerOnPitch = true;
  return { state, ctx, ms };
}

const GK_KINDS: readonly SituationKind[] = ['gardien_face_a_face', 'gardien_sortie_aerienne', 'gardien_relance', 'gardien_penalty', 'corner_defensif'];

describe('resolve : plafonds §6.3', () => {
  it('la table des plafonds respecte les valeurs du cahier des charges et aucune n’atteint 0.93 sauf le but vide', () => {
    const caps = BALANCE.caps;
    expect(caps.butVideDeuxMetres).toBe(0.93);
    expect(caps.penalty).toBe(0.78);
    expect(caps.faceAFace).toBe(0.38);
    expect(caps.repriseSurface).toBe(0.26);
    expect(caps.teteSurCentre).toBe(0.17);
    expect(caps.frappeHorsSurface).toBe(0.08);
    expect(caps.dribbleHautNiveau).toBe(0.42);
    expect(caps.coupFrancDirect).toBe(0.09);
    for (const [key, value] of Object.entries(caps)) {
      expect(value, key).toBeLessThanOrEqual(0.93);
      expect(value, key).toBeGreaterThan(0);
    }
    expect(BALANCE.attributeInfluence).toBeLessThanOrEqual(0.35);
    expect(BALANCE.baseProbability.dribbleGardien).toBe(0.31);
  });

  it('aucune situation-action ne dépasse son plafond, même avec 99 partout (joueur de champ et gardien)', () => {
    let checked = 0;
    for (const position of ['BU', 'GB'] as const) {
      const { ctx, ms } = contextFor(position);
      const player = ctx.player!;
      for (const kind of SITUATION_KINDS) {
        if ((position === 'GB') !== GK_KINDS.includes(kind) && kind !== 'corner_defensif') {
          // Les situations de gardien n'ont pas d'actions pour un joueur de champ et inversement : on couvre chacune avec le bon poste.
        }
        const situation = buildSituation(kind, ms, ctx, mulberry32(7));
        situation.context.pressure = 0;
        situation.context.defenderQuality = 40;
        situation.context.goalkeeperQuality = 40;
        situation.context.density = 0;
        situation.context.angle = 1;
        situation.context.distanceM = Math.min(situation.context.distanceM, BALANCE.resolution.distance.freeMeters);
        for (const action of situation.allowedActions) {
          player.attributes = uniformAttributes(99);
          player.form = 5;
          player.fitness = 100;
          player.confidence = 100;
          ms.fatigue[player.id] = 0;
          ms.repetitions = [];
          ms.opponentAdaptations = { manMarking: false, doubled: false };
          const best = actionProbability(situation, { action, intensite: 1, risque: 0, meta: false }, ctx, ms);
          expect(best.probability, `${kind}/${action}`).toBeLessThanOrEqual(best.cap + 1e-12);
          expect(best.probability, `${kind}/${action}`).toBeLessThanOrEqual(0.93);

          player.attributes = uniformAttributes(1);
          player.form = 0;
          player.confidence = BALANCE.career.confidence.baseline;
          situation.context.defenderQuality = BALANCE.resolution.opponentQuality.reference;
          situation.context.goalkeeperQuality = BALANCE.resolution.opponentQuality.reference;
          const worst = actionProbability(situation, { action, intensite: 1, risque: 0, meta: false }, ctx, ms);
          expect(worst.probability, `${kind}/${action}`).toBeGreaterThan(0);
          expect(worst.probability, `${kind}/${action}`).toBeLessThan(worst.modifiers.base! * (worst.modifiers.style ?? 1) + 1e-12);
          situation.context.defenderQuality = 40;
          situation.context.goalkeeperQuality = 40;
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('viser la lucarne divise la probabilité (×0.45) et un risque élevé la réduit, jamais l’inverse', () => {
    const { ctx, ms } = contextFor('BU');
    const situation = buildSituation('occasion_surface', ms, ctx, mulberry32(3));
    const plain = actionProbability(situation, { action: 'frappe', intensite: 0.7, risque: 0.5, meta: false }, ctx, ms).probability;
    const lucarne = actionProbability(situation, { action: 'frappe', cible: 'lucarne_gauche', intensite: 0.7, risque: 0.9, meta: false }, ctx, ms).probability;
    const risky = actionProbability(situation, { action: 'dribble', intensite: 0.7, risque: 0.95, meta: false }, ctx, ms).probability;
    const calm = actionProbability(situation, { action: 'dribble', intensite: 0.7, risque: 0.3, meta: false }, ctx, ms).probability;
    expect(lucarne).toBeCloseTo(plain * BALANCE.shotZoneRisk.lucarne_gauche, 6);
    expect(risky).toBeLessThan(calm);
    expect(actionProbability(situation, { action: 'frappe', intensite: 1, risque: 0, meta: false }, ctx, ms).probability).toBeCloseTo(plain, 6);
  });

  it('une action impossible (frappe depuis son camp) garde une probabilité résiduelle, jamais nulle', () => {
    const { ctx, ms } = contextFor('BU');
    const situation = buildSituation('relance_sous_pression', ms, ctx, mulberry32(3));
    const pb = actionProbability(situation, { action: 'frappe', intensite: 1, risque: 1, meta: false }, ctx, ms);
    expect(pb.impossible).toBe(true);
    expect(pb.probability).toBe(BALANCE.resolution.impossibleActionProb);
    expect(pb.probability).toBeGreaterThan(0);
  });
});

describe('resolve : le vocabulaire ne contourne pas les plafonds (§6.3)', () => {
  it('dribble, crochet et accélération partagent le plafond « haut niveau » face à un défenseur coté', () => {
    const { ctx, ms } = contextFor('AIG');
    const situation = buildSituation('un_contre_un', ms, ctx, mulberry32(7));
    situation.context.defenderQuality = 88;
    const caps = new Set<number>();
    for (const action of ['dribble', 'crochet', 'accelerer'] as const) {
      if (!situation.allowedActions.includes(action)) continue;
      const pb = actionProbability(situation, { action, intensite: 0.5, risque: 0, meta: false }, ctx, ms);
      caps.add(pb.cap);
      expect(pb.cap, action).toBe(BALANCE.caps.dribbleHautNiveau);
      expect(pb.probability, action).toBeLessThanOrEqual(BALANCE.caps.dribbleHautNiveau);
    }
    expect(caps.size, 'un seul plafond pour tous les gestes de dribble').toBe(1);
  });

  it('face à un défenseur ordinaire, chaque geste retrouve son propre plafond', () => {
    const { ctx, ms } = contextFor('AIG');
    const situation = buildSituation('un_contre_un', ms, ctx, mulberry32(7));
    situation.context.defenderQuality = 55;
    const pb = actionProbability(situation, { action: 'dribble', intensite: 0.5, risque: 0, meta: false }, ctx, ms);
    expect(pb.cap).toBe(BALANCE.caps.dribbleStandard);
  });
});
