/**
 * Application d'une issue factuelle (calculée par resolve.ts, jamais par le
 * LLM) : événements, statistiques, note en direct, score, enchaînements,
 * occasions concédées. Les faits produits servent au narrateur.
 */
import type { ActionOutcome, ClassifiedAction, Id, MatchContext, MatchEventType, MatchState, OutcomeKind, ShotZone, SituationKind, Situation, Stats } from '../types';
import { SHOT_ZONES } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { considerManMarking } from './adaptation';
import { addStats, fullName, otherSide, pushEvent, scoreFor } from './matchEvents';
import { applyRatingDelta, importanceFactor } from './rating';
import {
  expelPlayer, finisherEffect, goalkeeperEffect, goalkeeperOf, resolveTeamChanceOfKind, scoreGoal, type ChanceType,
} from './simulateMinute';
import { getFootballer, type Footballer } from './teamStrength';
import type { ProbabilityBreakdown } from './resolve';

const R = BALANCE.rating;
const RES = BALANCE.resolution;
type RatingKey = keyof typeof R.delta;
type Facts = Record<string, string | number | boolean>;

export interface ResolutionInput {
  situation: Situation;
  action: ClassifiedAction;
  ctx: MatchContext;
  ms: MatchState;
  rng: Rng;
  pb: ProbabilityBreakdown;
  success: boolean;
  roll: number;
}

interface Acc {
  kind: OutcomeKind;
  ratingDelta: number;
  reasons: string[];
  stats: Partial<Stats>;
  facts: Facts;
  followUp?: SituationKind;
}

function newAcc(input: ResolutionInput): Acc {
  const spec = input.pb.spec;
  return {
    kind: 'rien', ratingDelta: 0, reasons: [], stats: {},
    facts: { action: spec?.label ?? input.action.action, succes: input.success, probabilite: Math.round(input.pb.probability * 100) / 100, minute: input.ms.minute },
  };
}

function rate(acc: Acc, input: ResolutionInput, key: RatingKey, reason: string, mult = 1): void {
  const delta = R.delta[key] * mult * importanceFactor(input.ctx.match.importance);
  acc.ratingDelta += delta;
  acc.reasons.push(reason);
  applyRatingDelta(input.ms, delta, reason, input.ms.minute);
}

function rateRaw(acc: Acc, input: ResolutionInput, delta: number, reason: string): void {
  if (!delta) return;
  acc.ratingDelta += delta;
  acc.reasons.push(reason);
  applyRatingDelta(input.ms, delta, reason, input.ms.minute);
}

function stat(acc: Acc, key: keyof Stats, n = 1): void {
  acc.stats[key] = (acc.stats[key] ?? 0) + n;
}

function ev(input: ResolutionInput, type: MatchEventType, extra: Partial<{ side: 'home' | 'away'; playerId: Id; secondaryPlayerId: Id; xg: number; detail: Facts }> = {}): void {
  const side = extra.side ?? input.ctx.playerSide ?? 'home';
  pushEvent(input.ms, {
    type, side, playerId: extra.playerId ?? input.ctx.player!.id, secondaryPlayerId: extra.secondaryPlayerId, xg: extra.xg,
    involvesPlayer: true, detail: { ...(extra.detail ?? {}), joueur: fullName(input.ctx.player!.identity) },
  });
}

function mySide(input: ResolutionInput): 'home' | 'away' {
  return input.ctx.playerSide ?? 'home';
}

function inBox(input: ResolutionInput): boolean {
  return input.situation.context.distanceM <= RES.boxMeters;
}

function teammatesOnPitch(input: ResolutionInput): Footballer[] {
  const { ms, ctx } = input;
  return ms.lineups[mySide(input)].starters.filter((id) => id !== ctx.player!.id).map((id) => getFootballer(ctx, id));
}

function opponentsOnPitch(input: ResolutionInput): Footballer[] {
  const { ms, ctx } = input;
  return ms.lineups[otherSide(mySide(input))].starters.map((id) => getFootballer(ctx, id));
}

/** Cible de passe : l'id demandé s'il est sur le terrain, sinon un coéquipier proche. */
function passTarget(input: ResolutionInput): Footballer | undefined {
  const mates = teammatesOnPitch(input).filter((f) => f.position !== 'GB');
  const wanted = input.action.cible ? mates.find((f) => f.id === input.action.cible) : undefined;
  if (wanted) return wanted;
  const near = input.situation.nearbyTeammateIds.map((id) => mates.find((f) => f.id === id)).find(Boolean);
  if (near) return near;
  return mates.length > 0 ? input.rng.pick(mates) : undefined;
}

/** Occasion concédée à l'adversaire après une erreur du joueur. */
function concede(input: ResolutionInput, xg: number, kind = 'reprise_surface'): void {
  const ct: ChanceType = { kind, weight: 1, xg };
  resolveTeamChanceOfKind(otherSide(mySide(input)), ct, input.ms, input.ctx, input.rng);
}

/** L'occasion adverse dont la situation défensive était issue se poursuit (le joueur a perdu son duel). */
function concedeOriginalChance(input: ResolutionInput, acc: Acc): void {
  const f = input.situation.facts;
  if (f.occasionAdverse === true) {
    concede(input, Number(f.xgOccasion ?? RES.concededChanceXg.milieu), String(f.typeOccasion || 'reprise_surface'));
    acc.facts.occasionConcedee = true;
  } else if (input.rng.chance(RES.defensiveFailure.opponentChance)) {
    concede(input, inBox(input) ? RES.concededChanceXg.proche : RES.concededChanceXg.milieu);
    acc.facts.occasionConcedee = true;
  }
}

function decisiveGoal(input: ResolutionInput): boolean {
  const s = scoreFor(input.ms, mySide(input));
  const diffBefore = s.pour - s.contre;
  return input.ms.minute >= R.decisiveGoalFromMinute && (diffBefore === -1 || diffBefore === 0);
}

function riskReward(acc: Acc, input: ResolutionInput): void {
  const over = input.action.risque - BALANCE.risk.neutral;
  if (over > 0) rateRaw(acc, input, Math.round(over * BALANCE.risk.ratingRewardPerPoint * 100) / 100, 'Prise de risque payante');
}

function card(acc: Acc, input: ResolutionInput, red: boolean, motif: string): void {
  const secondYellow = !red && (input.ms.playerStats.yellowCards + (acc.stats.yellowCards ?? 0)) >= 1;
  if (red || secondYellow) {
    stat(acc, 'redCards');
    if (secondYellow) stat(acc, 'yellowCards');
    ev(input, 'carton_rouge', { detail: { motif: secondYellow ? 'second avertissement' : motif } });
    rate(acc, input, 'carton_rouge', 'Carton rouge');
    acc.kind = 'carton_rouge';
    acc.facts.expulsion = true;
    expelPlayer(input.ms, input.ctx);
  } else {
    stat(acc, 'yellowCards');
    ev(input, 'carton_jaune', { detail: { motif } });
    rate(acc, input, 'carton_jaune', 'Carton jaune');
    acc.kind = 'carton_jaune';
  }
}

// ── Natures ──────────────────────────────────────────────────────────────

function absurd(acc: Acc, input: ResolutionInput): void {
  const spec = input.pb.spec;
  acc.facts.absurde = true;
  if (!spec || spec.nature === 'tir' || input.action.action.startsWith('frappe') || input.action.action === 'tete' || input.action.action === 'lob') {
    stat(acc, 'shots');
    ev(input, 'tir_non_cadre', { detail: { absurde: true, distance: input.situation.context.distanceM } });
    pushEvent(input.ms, { type: 'sifflets', side: otherSide(mySide(input)), involvesPlayer: true, detail: { motif: 'tentative ridicule' } });
    rate(acc, input, 'tir_non_cadre', 'Tentative absurde', 2);
    acc.kind = 'hors_cadre';
    acc.facts.ridicule = true;
    return;
  }
  acc.kind = 'rien';
  acc.facts.sansEffet = true;
}

function shot(acc: Acc, input: ResolutionInput): void {
  const { ms, ctx, rng, situation, action, pb } = input;
  const side = mySide(input);
  const opp = otherSide(side);
  const penalty = situation.kind === 'penalty';
  const zone = action.cible && (SHOT_ZONES as readonly string[]).includes(action.cible) ? (action.cible as ShotZone) : 'defaut';
  const xg = pb.xg;
  acc.facts.zone = zone;
  acc.facts.xg = Math.round(xg * 100) / 100;
  acc.facts.distance = situation.context.distanceM;
  stat(acc, 'shots');
  stat(acc, 'xG', xg);
  if (side === 'home') ms.homeXg += xg; else ms.awayXg += xg;
  if (penalty) stat(acc, 'penaltiesTaken');
  const passerId = String(situation.facts.passeurId || '');
  const gk = goalkeeperOf(ms, ctx, opp);

  if (input.success) {
    const varDenied = !penalty && rng.chance(BALANCE.desert.badLuckPerMatch) && !ms.events.some((e) => e.type === 'var_but_refuse' && e.playerId === ctx.player!.id);
    if (varDenied) {
      stat(acc, 'shotsOnTarget');
      ev(input, 'var_but_refuse', { detail: { motif: rng.chance(0.6) ? 'hors-jeu de quelques centimètres' : 'faute au départ de l\'action' } });
      rate(acc, input, 'tir_cadre', 'But refusé par la VAR');
      acc.kind = 'hors_cadre';
      acc.facts.varRefus = true;
      return;
    }
    const decisive = decisiveGoal(input);
    stat(acc, 'goals');
    stat(acc, 'shotsOnTarget');
    if (penalty) stat(acc, 'penaltiesScored');
    scoreGoal(ms, ctx, side, ctx.player!.id, passerId && !penalty ? passerId : undefined, penalty ? 'penalty_marque' : 'but', { zone, xg: acc.facts.xg, joueur: fullName(ctx.player!.identity) });
    rate(acc, input, 'but', penalty ? 'Penalty transformé' : 'But');
    if (decisive) rate(acc, input, 'butDecisif', 'But qui change le match');
    const reward = BALANCE.shotZoneReward[zone];
    if (reward.rating > 0) rateRaw(acc, input, reward.rating, 'Geste spectaculaire');
    riskReward(acc, input);
    acc.kind = 'but';
    acc.facts.decisif = decisive;
    acc.facts.score = `${ms.homeGoals}-${ms.awayGoals}`;
    if (BALANCE.adaptation.reconsiderAfterPlayerGoal) considerManMarking(ms, ctx, rng);
    return;
  }

  if (penalty) {
    if (rng.chance(RES.penaltyMiss.arret)) {
      stat(acc, 'shotsOnTarget');
      ev(input, 'penalty_arrete', { secondaryPlayerId: gk?.id, detail: { gardien: gk ? fullName(gk.identity) : 'le gardien' } });
      acc.kind = 'arret';
    } else {
      ev(input, 'penalty_rate', { detail: { zone } });
      acc.kind = 'hors_cadre';
    }
    rate(acc, input, 'penalty_rate', 'Penalty manqué');
    return;
  }

  const big = xg >= RES.bigChanceXg;
  const miss = RES.shotMiss;
  const r = rng.next();
  if (r < miss.arret) {
    stat(acc, 'shotsOnTarget');
    ev(input, 'arret', { side: opp, playerId: gk?.id ?? ctx.player!.id, secondaryPlayerId: ctx.player!.id, xg, detail: { gardien: gk ? fullName(gk.identity) : 'le gardien', zone } });
    acc.kind = 'arret';
    if (big) rate(acc, input, 'occasion_manquee', 'Grosse occasion manquée');
    else rate(acc, input, 'tir_cadre', 'Tir cadré');
  } else if (r < miss.arret + miss.horsCadre) {
    ev(input, 'tir_non_cadre', { xg, detail: { zone } });
    acc.kind = 'hors_cadre';
    rate(acc, input, big ? 'occasion_manquee' : 'tir_non_cadre', big ? 'Grosse occasion manquée' : 'Tir non cadré');
  } else if (r < miss.arret + miss.horsCadre + miss.poteau) {
    ev(input, 'poteau', { xg, detail: { zone } });
    acc.kind = 'poteau';
    rate(acc, input, 'poteau', 'Sur le poteau');
  } else {
    ev(input, 'tir_non_cadre', { xg, detail: { contre: true } });
    acc.kind = 'contre';
    rate(acc, input, 'tir_non_cadre', 'Tir contré');
  }
  if (big) acc.facts.grosseOccasion = true;
}

function pass(acc: Acc, input: ResolutionInput): void {
  const { ms, ctx, rng, pb } = input;
  const spec = pb.spec!;
  const side = mySide(input);
  const opp = otherSide(side);
  stat(acc, 'passesAttempted');
  const target = passTarget(input);
  acc.facts.cible = target ? fullName(target.identity) : 'un coéquipier';

  if (!input.success) {
    ev(input, 'ballon_perdu', { detail: { passe: spec.label, perdue: true } });
    rate(acc, input, 'passe_ratee', 'Passe ratée');
    acc.kind = 'passe_ratee';
    if (rng.chance(RES.counterOnLostBall)) {
      concede(input, RES.concededChanceXg.milieu, 'contre');
      acc.facts.contreConcede = true;
    }
    return;
  }

  stat(acc, 'passesCompleted');
  if (spec.teammateFinish && target) {
    const gk = goalkeeperOf(ms, ctx, opp);
    const conv = Math.min(BALANCE.caps.butVideDeuxMetres, RES.teammateConversion[spec.teammateFinish] * finisherEffect(target) * goalkeeperEffect(gk));
    stat(acc, 'keyPasses');
    stat(acc, 'xA', conv);
    acc.facts.xa = Math.round(conv * 100) / 100;
    if (rng.chance(conv)) {
      stat(acc, 'assists');
      scoreGoal(ms, ctx, side, target.id, ctx.player!.id, 'but', { passe: spec.label, joueur: fullName(ctx.player!.identity) });
      rate(acc, input, 'passe_decisive', 'Passe décisive');
      riskReward(acc, input);
      acc.kind = 'passe_decisive';
      acc.facts.buteur = fullName(target.identity);
      acc.facts.score = `${ms.homeGoals}-${ms.awayGoals}`;
      return;
    }
    const onTarget = rng.chance(BALANCE.matchSim.shotOutcome.onTargetShare);
    pushEvent(ms, {
      type: onTarget ? 'arret' : 'tir_non_cadre', side: onTarget ? opp : side, playerId: onTarget ? gk?.id : target.id,
      secondaryPlayerId: onTarget ? target.id : undefined, xg: conv, involvesPlayer: true, detail: { tireur: fullName(target.identity), servi_par: fullName(ctx.player!.identity) },
    });
    // Une occasion créée vaut ce qu'elle valait : proportionnelle à la qualité de
    // l'occasion offerte, et non un forfait. Le forfait à +0,25 était versé même
    // quand le coéquipier ratait, ce qui rendait la passe plus payante que la
    // frappe au moment de conclure — le jeu apprenait à ne jamais tirer.
    rateRaw(acc, input, R.delta.occasion_creee * (conv / RES.occasionCreeeReference) * importanceFactor(input.ctx.match.importance), 'Occasion créée');
    acc.kind = 'occasion_creee';
    acc.facts.tireur = fullName(target.identity);
    return;
  }
  rate(acc, input, 'passe_reussie', 'Passe réussie');
  acc.kind = 'passe_reussie';
  acc.followUp = spec.followUp;
}

function dribble(acc: Acc, input: ResolutionInput): void {
  const { rng, pb } = input;
  const spec = pb.spec!;
  stat(acc, 'dribblesAttempted');
  acc.facts.defenseur = input.situation.facts.defenseur ?? 'le défenseur';
  if (input.success) {
    stat(acc, 'dribblesCompleted');
    ev(input, 'dribble_reussi', { detail: { defenseur: String(acc.facts.defenseur) } });
    rate(acc, input, 'dribble_reussi', 'Dribble réussi');
    riskReward(acc, input);
    acc.kind = 'dribble_reussi';
    acc.followUp = spec.followUp;
    return;
  }
  const r = rng.next();
  const df = RES.dribbleFailure;
  if (r < df.fouled) {
    stat(acc, 'foulsSuffered');
    ev(input, 'faute_subie', { detail: { defenseur: String(acc.facts.defenseur) } });
    if (inBox(input) && input.situation.kind !== 'relance_sous_pression') {
      rate(acc, input, 'penalty_obtenu', 'Penalty obtenu');
      acc.kind = 'penalty_obtenu';
      acc.followUp = 'penalty';
      acc.facts.penalty = true;
    } else {
      rate(acc, input, 'faute_subie', 'Faute subie');
      acc.kind = 'faute_subie';
    }
    return;
  }
  if (r < df.fouled + df.lost) {
    ev(input, 'dribble_rate', { detail: { perdu: true } });
    rate(acc, input, 'ballon_perdu', 'Ballon perdu');
    acc.kind = 'ballon_perdu';
    if (rng.chance(RES.counterOnLostBall)) {
      concede(input, RES.concededChanceXg.milieu, 'contre');
      acc.facts.contreConcede = true;
    }
    return;
  }
  ev(input, 'dribble_rate');
  rate(acc, input, 'dribble_rate', 'Dribble raté');
  acc.kind = 'dribble_rate';
}

function hold(acc: Acc, input: ResolutionInput): void {
  const spec = input.pb.spec!;
  stat(acc, 'touches');
  if (input.success) {
    rate(acc, input, 'ballon_conserve', 'Ballon conservé');
    acc.kind = 'ballon_conserve';
    acc.followUp = spec.followUp;
    return;
  }
  if (input.rng.chance(RES.holdFailure.fouled)) {
    stat(acc, 'foulsSuffered');
    ev(input, 'faute_subie');
    rate(acc, input, 'faute_subie', 'Faute subie');
    acc.kind = 'faute_subie';
    return;
  }
  ev(input, 'ballon_perdu', { detail: { perdu: true } });
  rate(acc, input, 'ballon_perdu', 'Ballon perdu');
  acc.kind = 'ballon_perdu';
  if (spec.nature === 'relance' && input.rng.chance(RES.buildUpFailureChance)) {
    concede(input, RES.concededChanceXg.proche);
    acc.facts.occasionConcedee = true;
  } else if (input.rng.chance(RES.counterOnLostBall)) {
    concede(input, RES.concededChanceXg.milieu, 'contre');
    acc.facts.contreConcede = true;
  }
}

function run(acc: Acc, input: ResolutionInput): void {
  const spec = input.pb.spec!;
  if (input.success) {
    rate(acc, input, 'occasion_creee', 'Appel réussi');
    acc.kind = 'occasion_creee';
    acc.followUp = spec.followUp;
    return;
  }
  if (input.rng.chance(RES.runFailure.offside)) {
    stat(acc, 'offsides');
    ev(input, 'hors_jeu');
    rate(acc, input, 'hors_jeu', 'Hors-jeu');
    acc.kind = 'hors_jeu';
    return;
  }
  acc.kind = 'rien';
  acc.facts.appelIgnore = true;
}

function duel(acc: Acc, input: ResolutionInput): void {
  const { rng, pb, situation, action } = input;
  const spec = pb.spec!;
  const aerial = situation.facts.aerien === true;
  const pressing = action.action === 'presser';
  stat(acc, 'duelsTotal');
  if (aerial) stat(acc, 'aerialsTotal');
  acc.facts.adversaire = situation.facts.defenseur ?? 'l\'attaquant';

  if (input.success) {
    stat(acc, 'duelsWon');
    if (aerial) stat(acc, 'aerialsWon');
    switch (spec.success) {
      case 'tacle_reussi': stat(acc, 'tackles'); ev(input, 'tacle'); rate(acc, input, 'tacle_reussi', 'Tacle réussi'); break;
      case 'interception': stat(acc, 'interceptions'); ev(input, 'interception'); rate(acc, input, 'interception', 'Interception'); break;
      case 'degagement': stat(acc, 'clearances'); ev(input, 'duel_gagne', { detail: { degagement: true } }); rate(acc, input, 'degagement', 'Dégagement'); break;
      default:
        if (action.action === 'bloquer') stat(acc, 'blocks');
        ev(input, 'duel_gagne');
        rate(acc, input, pressing ? 'pressing_reussi' : 'duel_gagne', pressing ? 'Pressing réussi' : 'Duel gagné');
    }
    acc.kind = spec.success;
    if (pressing && rng.chance(RES.pressingFollowUpProb)) acc.followUp = spec.followUp;
    if (situation.facts.occasionAdverse === true) acc.facts.occasionNeutralisee = true;
    return;
  }

  ev(input, 'duel_perdu');
  rate(acc, input, pressing ? 'pressing_rate' : 'duel_perdu', pressing ? 'Pressing dans le vide' : 'Duel perdu');
  acc.kind = 'duel_perdu';
  const df = RES.defensiveFailure;
  if (rng.chance(df.foul)) {
    stat(acc, 'fouls');
    ev(input, 'faute');
    rate(acc, input, 'faute_commise', 'Faute commise');
    acc.kind = 'faute_commise';
    const lastMan = situation.facts.dernierDefenseur === true;
    const r = rng.next();
    if (lastMan && r < df.redIfLastMan) card(acc, input, true, 'annihilation d\'une occasion nette');
    else if (r < df.redOnFoul) card(acc, input, true, 'faute grossière');
    else if (r < df.redOnFoul + df.yellowOnFoul) card(acc, input, false, 'faute');
    if (acc.facts.expulsion === true) return;
  }
  concedeOriginalChance(input, acc);
}

function tacticalFoul(acc: Acc, input: ResolutionInput): void {
  stat(acc, 'fouls');
  ev(input, 'faute', { detail: { tactique: true } });
  if (input.success) {
    rate(acc, input, 'faute_commise', 'Faute tactique utile');
    acc.kind = 'faute_commise';
    acc.facts.contreStoppe = true;
    return;
  }
  const lastMan = input.situation.facts.dernierDefenseur === true;
  card(acc, input, lastMan && input.rng.chance(RES.tacticalFoul.redIfLastMan), 'faute tactique');
  if (acc.facts.expulsion !== true && input.rng.chance(RES.buildUpFailureChance)) {
    concede(input, RES.concededChanceXg.milieu, 'coup_franc');
    acc.facts.coupFrancConcede = true;
  }
}

function goalkeeper(acc: Acc, input: ResolutionInput): void {
  const { ms, ctx, rng, pb, situation, action } = input;
  const spec = pb.spec!;
  const side = mySide(input);
  const opp = otherSide(side);
  const xg = Number(situation.facts.xgOccasion ?? RES.concededChanceXg.proche);
  if (spec.nature === 'gardien_penalty') {
    if (input.success) {
      stat(acc, 'saves');
      stat(acc, 'penaltiesSaved');
      ev(input, 'penalty_arrete', { detail: { cote: action.action } });
      rate(acc, input, 'gb_penalty_arrete', 'Penalty arrêté');
      acc.kind = 'gb_arret';
      return;
    }
    const taker = opponentsOnPitch(input).sort((a, b) => b.attributes.penalty - a.attributes.penalty)[0];
    if (taker) scoreGoal(ms, ctx, opp, taker.id, undefined, 'penalty_marque', { penalty: true });
    stat(acc, 'goalsConceded');
    rate(acc, input, 'gb_but_encaisse', 'Penalty encaissé');
    acc.kind = 'gb_but_encaisse';
    return;
  }

  if (input.success) {
    switch (spec.success) {
      case 'gb_arret':
        stat(acc, 'saves');
        ev(input, 'arret', { xg, detail: { type: String(situation.facts.typeOccasion || 'frappe') } });
        rate(acc, input, xg >= RES.bigChanceXg ? 'gb_arret_decisif' : 'gb_arret', xg >= RES.bigChanceXg ? 'Arrêt décisif' : 'Arrêt');
        break;
      case 'gb_sortie_reussie':
        stat(acc, 'duelsTotal'); stat(acc, 'duelsWon'); stat(acc, 'aerialsTotal'); stat(acc, 'aerialsWon');
        ev(input, 'duel_gagne', { detail: { sortie: true } });
        rate(acc, input, 'gb_sortie_reussie', 'Sortie réussie');
        break;
      default:
        stat(acc, 'passesAttempted'); stat(acc, 'passesCompleted');
        rate(acc, input, 'passe_reussie', 'Relance réussie');
    }
    acc.kind = spec.success;
    if (situation.facts.occasionAdverse === true) acc.facts.occasionNeutralisee = true;
    return;
  }

  switch (spec.failure) {
    case 'gb_but_encaisse': {
      const scorers = opponentsOnPitch(input).filter((f) => f.position !== 'GB');
      const weights = scorers.map((f) => BALANCE.matchSim.scorerWeights[f.position] * (0.5 + finisherEffect(f)));
      const scorer = scorers.length > 0 ? rng.weighted(scorers, weights) : undefined;
      if (scorer) scoreGoal(ms, ctx, opp, scorer.id, undefined, 'but', { type: String(situation.facts.typeOccasion || 'face_a_face'), xg: Math.round(xg * 100) / 100 });
      stat(acc, 'goalsConceded');
      rate(acc, input, 'gb_but_encaisse', 'But encaissé');
      acc.kind = 'gb_but_encaisse';
      return;
    }
    case 'gb_sortie_ratee':
      stat(acc, 'duelsTotal'); stat(acc, 'aerialsTotal');
      ev(input, 'duel_perdu', { detail: { sortie: true } });
      rate(acc, input, 'gb_sortie_ratee', 'Sortie manquée');
      acc.kind = 'gb_sortie_ratee';
      if (rng.chance(RES.gkFailureChance)) { concede(input, RES.concededChanceXg.proche, 'but_vide'); acc.facts.occasionConcedee = true; }
      return;
    default:
      stat(acc, 'passesAttempted');
      rate(acc, input, 'ballon_perdu', 'Relance ratée');
      acc.kind = 'ballon_perdu';
      if (rng.chance(RES.gkFailureChance)) { concede(input, RES.concededChanceXg.proche); acc.facts.occasionConcedee = true; }
  }
}

function behaviour(acc: Acc, input: ResolutionInput): void {
  const { action, rng } = input;
  switch (action.action) {
    case 'simuler':
      if (input.success) {
        stat(acc, 'foulsSuffered');
        ev(input, 'faute_subie', { detail: { simulation: true } });
        if (inBox(input)) { rate(acc, input, 'penalty_obtenu', 'Penalty obtenu'); acc.kind = 'penalty_obtenu'; acc.followUp = 'penalty'; }
        else { rate(acc, input, 'faute_subie', 'Faute obtenue'); acc.kind = 'faute_subie'; }
      } else {
        stat(acc, 'yellowCards');
        ev(input, 'simulation_sanctionnee');
        pushEvent(input.ms, { type: 'sifflets', side: otherSide(mySide(input)), involvesPlayer: true, detail: { motif: 'simulation' } });
        rate(acc, input, 'simulation_sanctionnee', 'Simulation sanctionnée');
        acc.kind = 'simulation_sanctionnee';
        acc.facts.ridicule = true;
      }
      return;
    case 'protester':
      if (input.success) { acc.kind = 'rien'; acc.facts.protestation = true; return; }
      stat(acc, 'yellowCards');
      ev(input, 'protestation');
      rate(acc, input, 'protestation_jaune', 'Averti pour contestation');
      acc.kind = 'protestation_jaune';
      return;
    case 'provoquer':
      if (input.success) { acc.kind = 'rien'; acc.facts.provocation = true; if (rng.chance(0.3)) acc.facts.adversaireAgace = true; return; }
      card(acc, input, false, 'provocation');
      return;
    default:
      acc.kind = 'rien';
  }
}

function injury(acc: Acc, input: ResolutionInput): void {
  if (input.action.action === 'jouer_blesse') {
    acc.kind = 'rien';
    acc.facts.serreLesDents = true;
    return;
  }
  ev(input, 'blessure', { detail: { signalee: true } });
  acc.kind = 'blessure';
  acc.facts.signalee = true;
}

/** Applique l'issue d'une action résolue et renvoie le résultat factuel. */
export function applyOutcome(input: ResolutionInput): ActionOutcome {
  const acc = newAcc(input);
  const spec = input.pb.spec;
  if (input.pb.impossible || !spec) absurd(acc, input);
  else {
    switch (spec.nature) {
      case 'tir': shot(acc, input); break;
      case 'passe': pass(acc, input); break;
      case 'dribble': dribble(acc, input); break;
      case 'conservation': case 'relance': hold(acc, input); break;
      case 'appel': run(acc, input); break;
      case 'duel': duel(acc, input); break;
      case 'faute_tactique': tacticalFoul(acc, input); break;
      case 'gardien': case 'gardien_penalty': goalkeeper(acc, input); break;
      case 'comportement': behaviour(acc, input); break;
      case 'blessure': injury(acc, input); break;
      default: acc.kind = 'rien';
    }
  }
  addStats(input.ms.playerStats, acc.stats);
  return {
    kind: acc.kind,
    probability: input.pb.probability,
    roll: Math.round(input.roll * 10000) / 10000,
    modifiers: input.pb.modifiers,
    ratingDelta: Math.round(acc.ratingDelta * 100) / 100,
    ratingReason: acc.reasons.join(', ') || 'Sans effet sur la note',
    statsDelta: acc.stats,
    followUp: acc.followUp,
    facts: acc.facts,
  };
}
