/**
 * Note en direct (§5.5), note finale, tableau des cinq regards (§5.6) et
 * homme du match. Base 6.0, deltas motivés, bornes [3, 10].
 */
import type { MatchContext, MatchEvaluation, MatchState } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { clamp, roundTo, scoreFor } from './matchEvents';

const R = BALANCE.rating;

/** Les grands matchs amplifient les deltas de note. */
export function importanceFactor(importance: number): number {
  const m = R.importanceMultiplier;
  return m.atZero + (m.atHundred - m.atZero) * clamp(importance, 0, 100) / 100;
}

export function applyRatingDelta(ms: MatchState, delta: number, reason: string, minute: number): void {
  if (!delta) return;
  const rounded = Math.round(delta * 100) / 100;
  ms.playerRating = clamp(ms.playerRating + rounded, R.min, R.max);
  ms.ratingLog.push({ minute, delta: rounded, reason });
}

/** Dérive passive quand le joueur est sur le terrain sans être impliqué : suit le momentum de son équipe, cumul borné. */
export function applyPassiveDrift(ms: MatchState, ctx: MatchContext): void {
  if (!ms.playerOnPitch || !ctx.playerSide) return;
  const sign = ctx.playerSide === 'home' ? 1 : -1;
  const done = ms.passiveDrift ?? 0;
  const next = clamp(done + R.passiveDriftPerMinute * ms.momentum * sign, -R.passiveDriftMax, R.passiveDriftMax);
  const applied = next - done;
  if (applied === 0) return;
  ms.passiveDrift = next;
  ms.playerRating = clamp(ms.playerRating + applied, R.min, R.max);
}

/** Deltas liés au résultat et aux buts encaissés, appliqués au coup de sifflet final. */
export function applyResultDeltas(ms: MatchState, ctx: MatchContext): void {
  if (!ctx.player || !ctx.playerSide || ms.playerMinutes <= 0) return;
  const s = scoreFor(ms, ctx.playerSide);
  const share = clamp(ms.playerMinutes / 90, 0.3, 1);
  const factor = importanceFactor(ctx.match.importance);
  if (s.pour > s.contre) applyRatingDelta(ms, R.delta.victoire * share * factor, 'Victoire', ms.minute);
  else if (s.pour < s.contre) applyRatingDelta(ms, R.delta.defaite * share * factor, 'Défaite', ms.minute);
  const pos = ctx.player.identity.position;
  const defender = pos === 'DC' || pos === 'DD' || pos === 'DG' || pos === 'MDC';
  if (s.contre === 0 && ms.playerMinutes >= 60) {
    if (pos === 'GB') applyRatingDelta(ms, R.delta.cleanSheetGoalkeeper, 'Clean sheet', ms.minute);
    else if (defender) applyRatingDelta(ms, R.delta.cleanSheetDefender, 'Clean sheet', ms.minute);
  } else if (defender && s.contre > 0) {
    applyRatingDelta(ms, R.delta.butEncaisseDefenseur * s.contre * share, `${s.contre} but(s) encaissé(s)`, ms.minute);
  }
}

/** Note finale bornée, arrondie au dixième, pénalité méta et faible implication. */
export function finalizeRating(ms: MatchState): number {
  if (ms.metaAttempts >= R.metaPenalty.fromAttempts) {
    applyRatingDelta(ms, R.metaPenalty.delta, 'Déconcentration : instructions hors du jeu', ms.minute);
  }
  const li = R.lowInvolvement;
  const expected = li.decisionsBelow * clamp(ms.playerMinutes / 90, 0, 1);
  if (ms.playerMinutes >= 30 && ms.decisions.length < expected) {
    applyRatingDelta(ms, li.malus, 'Trop peu impliqué dans le jeu', ms.minute);
  }
  const rating = roundTo(clamp(ms.playerRating, R.min, R.max), R.roundTo);
  ms.playerRating = Math.round(rating * 10) / 10;
  return ms.playerRating;
}

function band(v: number): 'desastre' | 'mauvais' | 'moyen' | 'bon' | 'excellent' {
  if (v < 4.8) return 'desastre';
  if (v < 5.8) return 'mauvais';
  if (v < 6.8) return 'moyen';
  if (v < 7.8) return 'bon';
  return 'excellent';
}

const COACH_VERDICTS = {
  desastre: 'Tu nous as mis en danger toute la soirée. On en reparle demain.',
  mauvais: 'Pas le niveau ce soir. Je veux plus d\'intensité et moins de déchet.',
  moyen: 'Correct, sans plus. Il manque quelque chose pour peser vraiment.',
  bon: 'Bon match. Tu as fait ce que je t\'avais demandé.',
  excellent: 'Grosse prestation. C\'est exactement ça que j\'attends de toi.',
};
const SUPPORTER_VERDICTS = {
  desastre: 'Les tribunes n\'ont pas pardonné : sifflets à chaque ballon touché.',
  mauvais: 'Les supporters ont soupiré plus d\'une fois.',
  moyen: 'Une prestation qui n\'a pas fait lever le stade.',
  bon: 'Applaudi à sa sortie, le public a apprécié.',
  excellent: 'Ovation debout. Son nom a été scandé par tout le stade.',
};
const TEAMMATE_VERDICTS = {
  desastre: 'Dans le vestiaire, personne n\'est venu te voir.',
  mauvais: 'Quelques regards appuyés au coup de sifflet final.',
  moyen: 'Rien à redire, rien à signaler non plus.',
  bon: 'Tes coéquipiers ont apprécié tes efforts.',
  excellent: 'Le vestiaire t\'a acclamé. Tu as porté l\'équipe.',
};
const MEDIA_VERDICTS = {
  desastre: 'La presse parle déjà d\'un naufrage individuel.',
  mauvais: 'Les journalistes notent une prestation en dessous des attentes.',
  moyen: 'Une performance anonyme selon les médias.',
  bon: 'La presse salue un match sérieux et appliqué.',
  excellent: 'Les titres du lendemain sont pour toi.',
};

/** Tableau §5.6 : cinq regards notés sur 10 avec verdicts de repli en français. */
export function computeEvaluation(ms: MatchState, ctx: MatchContext, rating: number): MatchEvaluation {
  const ev = R.evaluation;
  const ex = R.evaluationExtra;
  const st = ms.playerStats;
  const side = ctx.playerSide ?? 'home';
  const s = scoreFor(ms, side);
  const won = s.pour > s.contre;
  const lost = s.pour < s.contre;
  const home = side === 'home';
  const club = ctx[side].club;
  const coach = ctx[side].coach;
  const cards = st.yellowCards + 2 * st.redCards;

  const coachScore = rating
    + (won ? ex.coach.win : lost ? ex.coach.loss : 0) * (ev.coachResultWeight / 0.3)
    - ex.coach.cardMalus * cards
    - ex.coach.severityPerPoint * (coach.personality.severity - 50);
  const spectacle = st.goals * ex.supporters.goal + st.dribblesCompleted * ex.supporters.dribble;
  const supportersScore = rating + spectacle * (ev.supportersSpectacleWeight / 0.4)
    - (home && lost ? ex.supporters.homeLossMalus : 0)
    + ex.supporters.fanbasePerPoint * (club.fanbase - 50) * (rating - R.base);
  const selfish = st.shots >= ex.teammates.selfishShotsFrom && st.assists === 0 && st.keyPasses === 0 ? ex.teammates.selfishMalus : 0;
  const teammatesScore = rating + st.assists * ex.teammates.assist + st.duelsWon * ex.teammates.duelWon - selfish - ex.teammates.cardMalus * cards;
  const decisive = st.goals + st.assists > 0;
  const subbedEarly = ms.events.some((e) => e.type === 'remplacement' && e.secondaryPlayerId === ctx.player?.id && e.minute <= 70 && e.detail?.raison === 'mauvais match');
  const mediaScore = rating + (decisive ? ex.media.decisive : 0) - (subbedEarly ? ex.media.subOffEarlyMalus : 0) + ev.mediaSeverityShift[ctx.difficulty.mediaSeverity];

  const note = (v: number): number => Math.round(clamp(v, 1, 10) * 10) / 10;
  const performance = note(rating);
  const c = note(coachScore);
  const sup = note(supportersScore);
  const tm = note(teammatesScore);
  const med = note(mediaScore);
  return {
    performance, coach: c, supporters: sup, teammates: tm, media: med,
    verdicts: {
      performance: `Note ${performance.toFixed(1)} : ${band(performance) === 'excellent' ? 'match de référence' : band(performance) === 'bon' ? 'bonne prestation' : band(performance) === 'moyen' ? 'prestation moyenne' : band(performance) === 'mauvais' ? 'prestation insuffisante' : 'match à oublier'}.`,
      coach: `${coach.lastName} : « ${COACH_VERDICTS[band(c)]} »`,
      supporters: SUPPORTER_VERDICTS[band(sup)],
      teammates: TEAMMATE_VERDICTS[band(tm)],
      media: MEDIA_VERDICTS[band(med)],
    },
  };
}

/** Homme du match : rare (§6.5). Note élevée ou décisif, meilleur que le meilleur coéquipier simulé, tirage. */
export function isManOfTheMatch(ms: MatchState, ctx: MatchContext, rating: number, rng: Rng): boolean {
  if (!ctx.player || !ctx.playerSide || ms.playerMinutes <= 0) return false;
  const m = R.motm;
  const x = R.motmExtra;
  const st = ms.playerStats;
  const decisive = st.goals + st.assists > 0 || (ctx.player.identity.position === 'GB' && st.saves >= 4);
  if (rating < m.minRating && !(decisive && rating >= m.decisiveMinRating)) return false;
  const teammateBest = rng.normal(x.teammateBestMean, x.teammateBestSd);
  if (rating <= teammateBest) return false;
  const s = scoreFor(ms, ctx.playerSide);
  let prob = m.baseProb + x.perRatingPointOverMin * Math.max(0, rating - m.minRating);
  if (s.pour < s.contre) prob *= x.lostMultiplier;
  return rng.chance(Math.min(x.maxProb, prob));
}
