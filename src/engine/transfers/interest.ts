/**
 * Intérêt de chaque club (hors club actuel) pour le joueur incarné : besoin
 * au poste (comparé au meilleur joueur du club à ce poste), budget vs valeur
 * marchande, prestige du club vs niveau du joueur, âge. 0 étoile = pas listé.
 * Déterministe (aucun RNG ici), recalculé chaque jour pendant les fenêtres
 * par `offers.ts`.
 */
import type { CareerState, Id, NpcPlayer, PromisedRole } from '../types';
import { BALANCE } from '../config/balance';
import { ageAt } from '../calendar/dates';
import { clamp } from '../career/apply';
import { ageValueFactor, computeMarketValue } from '../player/marketValue';

export interface ClubInterest {
  clubId: Id;
  stars: 1 | 2 | 3 | 4 | 5;
  need: PromisedRole;
  reason: string;
}

const T = BALANCE.depth.transfers;
const I = T.interest;

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** Note du meilleur joueur du club à ce poste (0 si l'effectif n'en a aucun). */
function bestOverallAtPosition(state: CareerState, clubId: Id, position: string): { best: number; overalls: number[] } {
  const club = state.world.clubs[clubId];
  const overalls = (club?.squadIds ?? [])
    .map((id) => state.world.npcPlayers[id])
    .filter((n): n is NpcPlayer => !!n && n.identity.position === position)
    .map((n) => n.overall)
    .sort((a, b) => b - a);
  return { best: overalls[0] ?? 0, overalls };
}

/** Rôle promis plausible selon le rang que prendrait le joueur dans l'effectif du club acheteur. */
function needFor(overall: number, incumbentTop: number, rank: number): PromisedRole {
  if (rank === 1 && overall - incumbentTop >= I.incumbentGapForIndisputable) return 'titulaire_indiscutable';
  if (rank <= 2) return 'titulaire';
  if (rank <= 4) return 'rotation';
  return 'projet';
}

function starsFor(score: number): 1 | 2 | 3 | 4 | 5 {
  let stars: 1 | 2 | 3 | 4 | 5 = 1;
  I.starThresholds.forEach((threshold, i) => {
    if (score >= threshold) stars = (i + 2) as 1 | 2 | 3 | 4 | 5;
  });
  return stars;
}

/**
 * Intérêt de chaque club (hors club actuel) pour le joueur : besoin au poste,
 * budget vs valeur marchande, prestige vs niveau du joueur, âge. Un club trop
 * prestigieux pour le niveau du joueur, ou qui ne peut pas couvrir sa valeur
 * avec son budget transfert, n'est pas listé.
 */
export function computeInterest(state: CareerState): ClubInterest[] {
  const player = state.player;
  const currentClubId = player.contract.clubId;
  const position = player.identity.position;
  const age = ageAt(player.identity.birthDate, state.currentDate);
  const overall = player.overall;
  const est = player.potentialEstimate;
  const potentialMid = (est.low + est.high) / 2;
  const overallForNeed = overall + clamp(Math.max(0, potentialMid - overall) * I.potentialBonusFactor, 0, I.potentialBonusMax);

  const results: ClubInterest[] = [];
  for (const club of Object.values(state.world.clubs)) {
    if (club.id === currentClubId) continue;
    const league = state.world.leagues[club.leagueId];
    if (!league) continue;

    const { best: incumbentTop, overalls } = bestOverallAtPosition(state, club.id, position);
    const needScore = clamp01((overallForNeed - incumbentTop + I.needSpan) / (2 * I.needSpan));

    const marketValue = computeMarketValue(player, age, club, league, state.world.marketInflation, state.currentDate);
    const budgetCoverage = marketValue > 0 ? club.transferBudget / marketValue : 1;
    if (budgetCoverage < I.budgetCoverageMin) continue;
    const budgetScore = clamp01(budgetCoverage);

    const requiredOverallFloor = I.prestigeFloorBase + club.prestige * I.prestigeFloorPerPoint;
    if (requiredOverallFloor - overall > I.prestigeGapMax) continue;
    const prestigeFit = clamp01(1 - Math.max(0, requiredOverallFloor - overall) / I.prestigeGapMax);

    const ageScore = clamp01(ageValueFactor(age) / 1.15);

    const score = I.needWeight * needScore + I.budgetWeight * budgetScore + I.prestigeWeight * prestigeFit + I.ageWeight * ageScore;
    if (score < I.minScoreToList) continue;

    const rank = overalls.filter((o) => o > overall).length + 1;
    const need = needFor(overall, incumbentTop, rank);
    const stars = starsFor(score);
    const reason = `Besoin ${need} au poste (${incumbentTop ? `meilleur titulaire ${incumbentTop}` : 'poste dégarni'}), `
      + `budget ${Math.round(budgetCoverage * 100)} % de la valeur, prestige ${club.prestige}.`;
    results.push({ clubId: club.id, stars, need, reason });
  }
  return results.sort((a, b) => b.stars - a.stars || a.clubId.localeCompare(b.clubId));
}
