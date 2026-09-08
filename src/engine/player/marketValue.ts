/**
 * Valeur marchande (§11), formule déterministe recalculée chaque mois :
 *   valeur = base(poste) × f(note) × g(âge) × h(potentiel restant) × i(forme)
 *            × j(réputation ligue + monde) × k(contrat restant) × l(prestige club)
 *            × m(inflation) × prestige de la ligue.
 * f est fortement convexe (65 ≈ 2 M€, 75 ≈ 10 M€, 82 ≈ 35 M€, 88 ≈ 90 M€,
 * 92+ ≈ 150 M€+ en club prestigieux) et se tasse au-delà de 85.
 */
import type { Club, Euros, ISODate, League, NpcPlayer, Player, Position } from '../types';
import { BALANCE } from '../config/balance';
import { diffDays } from '../calendar/dates';
import { bandFor, clamp, interpolateCurve, lerp, roundTo } from './common';
import { computeOverall } from './overall';

const M = BALANCE.marketValue;
const C = BALANCE.contracts;

export interface ReputationInput {
  /** Réputation en championnat 0-100. */
  league: number;
  /** Réputation mondiale 0-100. */
  world: number;
}

export interface ValueInputs {
  position: Position;
  overall: number;
  age: number;
  /** Potentiel tel que le marché le perçoit (jamais le potentiel caché du joueur incarné). */
  perceivedPotential: number;
  averageRating: number;
  reputation: ReputationInput;
  contractMonthsLeft: number;
  clubPrestige: number;
  leaguePrestige: number;
  marketInflation: number;
}

// ── Facteurs ─────────────────────────────────────────────────────────────

/** f(note) : exponentielle, tassée au-delà du seuil. */
export function overallFactor(overall: number): number {
  const { reference, growthPerPoint } = M.overallCurve;
  const soft = M.overallCurveSoftening;
  if (overall <= soft.fromOverall) return Math.exp(growthPerPoint * (overall - reference));
  return Math.exp(growthPerPoint * (soft.fromOverall - reference) + soft.growthPerPoint * (overall - soft.fromOverall));
}

/** g(âge) : pic 24-27. */
export function ageValueFactor(age: number): number {
  return interpolateCurve(M.ageCurve, age);
}

/** h(potentiel restant). */
export function potentialValueFactor(overall: number, perceivedPotential: number): number {
  return clamp(1 + M.potentialFactor.perPoint * Math.max(0, perceivedPotential - overall), 1, M.potentialFactor.max);
}

/** i(forme) : note moyenne récente autour de 6.3. */
export function formValueFactor(averageRating: number): number {
  const f = M.formFactor;
  return clamp(1 + f.perRatingPoint * (averageRating - M.formFallback.neutralRating), f.min, f.max);
}

/** j(réputation). */
export function reputationValueFactor(rep: ReputationInput): number {
  return 1 + M.reputationFactor.leagueWeight * clamp(rep.league, 0, 100) / 100
    + M.reputationFactor.worldWeight * clamp(rep.world, 0, 100) / 100;
}

/** k(contrat restant). */
export function contractValueFactor(monthsLeft: number): number {
  for (const band of M.contractFactor) if (monthsLeft <= band.maxMonths) return band.factor;
  return M.contractFactor[M.contractFactor.length - 1]?.factor ?? 1;
}

/** l(prestige du club). */
export function prestigeValueFactor(prestige: number): number {
  return M.prestigeFactor.base + M.prestigeFactor.slope * clamp(prestige, 0, 100) / 100;
}

function leaguePrestigeValueFactor(prestige: number): number {
  return M.leaguePrestigeFactor.base + M.leaguePrestigeFactor.slope * clamp(prestige, 0, 100) / 100;
}

/** Réputation par défaut dérivée de la note quand aucune jauge n'est fournie. */
export function reputationProxy(overall: number): ReputationInput {
  const p = M.reputationProxy;
  return {
    league: clamp((overall - p.league.fromOverall) * p.league.perPoint, 0, 100),
    world: clamp((overall - p.world.fromOverall) * p.world.perPoint, 0, 100),
  };
}

/** Formule complète, pure. */
export function marketValueFrom(v: ValueInputs): Euros {
  const raw = M.baseByPosition[v.position]
    * overallFactor(v.overall)
    * ageValueFactor(v.age)
    * potentialValueFactor(v.overall, v.perceivedPotential)
    * formValueFactor(v.averageRating)
    * reputationValueFactor(v.reputation)
    * contractValueFactor(v.contractMonthsLeft)
    * prestigeValueFactor(v.clubPrestige)
    * leaguePrestigeValueFactor(v.leaguePrestige)
    * Math.max(0, v.marketInflation);
  return Math.max(M.minValue, roundTo(raw, M.rounding));
}

// ── Entrées ──────────────────────────────────────────────────────────────

function averageRating(ratingSum: number, ratingCount: number, form: number): number {
  const f = M.formFallback;
  if (ratingCount >= f.minMatches) return ratingSum / ratingCount;
  return f.neutralRating + clamp(form, -5, 5) * f.perFormPoint;
}

/**
 * Valeur du joueur incarné. `reputation` (jauges ligue/monde) est facultative :
 * à défaut, une réputation est déduite de la note. Le potentiel perçu est le
 * milieu de l'estimation du staff, jamais le potentiel caché.
 */
export function computeMarketValue(
  player: Player,
  age: number,
  club: Club,
  league: League,
  marketInflation: number,
  date: ISODate,
  reputation?: ReputationInput,
): Euros {
  const overall = computeOverall(player.attributes, player.identity.position);
  const est = player.potentialEstimate;
  const perceived = Math.max(overall, (est.low + est.high) / 2);
  const total = player.seasonStats.total;
  return marketValueFrom({
    position: player.identity.position,
    overall,
    age,
    perceivedPotential: perceived,
    averageRating: averageRating(total.ratingSum, total.ratingCount, player.form),
    reputation: reputation ?? reputationProxy(overall),
    contractMonthsLeft: diffDays(date, player.contract.endsOn) / M.daysPerMonth,
    clubPrestige: club.prestige,
    leaguePrestige: league.prestige,
    marketInflation,
  });
}

/** Version PNJ : réputation dérivée de la renommée, contrat restant si la date est fournie. */
export function computeNpcMarketValue(
  npc: NpcPlayer,
  age: number,
  club: Club,
  league: League,
  marketInflation: number,
  date?: ISODate,
): Euros {
  const overall = computeOverall(npc.attributes, npc.identity.position);
  const fame = clamp(npc.fame, 0, 100);
  return marketValueFrom({
    position: npc.identity.position,
    overall,
    age,
    perceivedPotential: Math.max(overall, npc.potential),
    averageRating: averageRating(npc.seasonStats.ratingSum, npc.seasonStats.ratingCount, npc.form),
    reputation: { league: fame * M.npcReputationFromFame.leagueShare, world: fame * M.npcReputationFromFame.worldShare },
    contractMonthsLeft: date ? diffDays(date, npc.contractEndsOn) / M.daysPerMonth : M.npcDefaultContractMonths,
    clubPrestige: club.prestige,
    leaguePrestige: league.prestige,
    marketInflation,
  });
}

// ── Salaire ──────────────────────────────────────────────────────────────

/** Salaire de base par note : interpolation log-linéaire entre les paliers. */
function baseWage(overall: number): number {
  const table = C.wageByOverall;
  const first = table[0] as { maxOverall: number; wage: number };
  if (overall <= first.maxOverall) return first.wage;
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1] as { maxOverall: number; wage: number };
    const b = table[i] as { maxOverall: number; wage: number };
    if (overall <= b.maxOverall) {
      const t = (overall - a.maxOverall) / (b.maxOverall - a.maxOverall);
      return Math.exp(lerp(Math.log(a.wage), Math.log(b.wage), t));
    }
  }
  return (table[table.length - 1] as { wage: number }).wage;
}

/** Salaire mensuel plausible pour une note, un âge et un club (Ligue 1 : jeune 5-25 k€, titulaire 60-250 k€, star 400 k€-1,5 M€). */
export function suggestedWage(overall: number, age: number, club: Club, league: League): Euros {
  const prestige = C.prestigeMultiplier.base + C.prestigeMultiplier.slope * clamp(club.prestige, 0, 100) / 100;
  const leagueMult = C.leaguePrestigeMultiplier.base + C.leaguePrestigeMultiplier.slope * clamp(league.prestige, 0, 100) / 100;
  const ageMult = bandFor(C.ageMultiplier, age).factor;
  const wage = baseWage(clamp(overall, 1, 99)) * prestige * leagueMult * ageMult;
  return Math.max(C.minWage, roundTo(wage, C.wageRounding));
}
