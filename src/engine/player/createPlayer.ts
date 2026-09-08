/**
 * Création du joueur incarné (§2, §6.8) : base d'attributs par niveau et
 * poste, 40 points à répartir sous plafonds liés à l'âge, potentiel caché
 * tiré dans la fourchette du niveau (Ballon d'Or atteignable ~1 carrière sur
 * 8-10), prédisposition aux blessures, premier contrat modeste, estimation
 * floue et confiance du coach basse (§6.5 : un concurrent est devant).
 */
import { ATTRIBUTE_KEYS } from '../types';
import type {
  AttributeKey, AttributeXp, Attributes, CareerSetup, Club, Contract, ISODate, League, Player, SeasonStats, StartingLevel, Stats,
} from '../types';
import type { Rng } from '../rng/mulberry32';
import { mulberry32 } from '../rng/mulberry32';
import { seedFromString } from '../rng/derive';
import { BALANCE } from '../config/balance';
import { difficultyProfile } from '../config/difficulty';
import { compatiblePositions, positionCompatibility, positionProfile } from '../config/positions';
import { addDays, addMonths, monthOf, yearOf } from '../calendar/dates';
import { bandFor, clamp, clampAttribute, lerp } from './common';
import { attributesFromOverall, computeOverall } from './overall';
import { estimatePotential } from './progression';
import { computeMarketValue, suggestedWage } from './marketValue';

const CR = BALANCE.creation;
const CT = BALANCE.contracts;

export interface AllocationLimits {
  total: number;
  perAttributeMax: Record<AttributeKey, number>;
  base: Attributes;
}

type LimitsSetup = Pick<CareerSetup, 'startAge' | 'position' | 'startingLevel'>;

// ── Vides ────────────────────────────────────────────────────────────────

export function emptyStats(): Stats {
  return {
    matches: 0, starts: 0, subOn: 0, subOff: 0, minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0,
    xG: 0, xA: 0, keyPasses: 0, dribblesAttempted: 0, dribblesCompleted: 0, duelsWon: 0, duelsTotal: 0,
    aerialsWon: 0, aerialsTotal: 0, touches: 0, passesAttempted: 0, passesCompleted: 0, tackles: 0,
    interceptions: 0, blocks: 0, clearances: 0, fouls: 0, foulsSuffered: 0, offsides: 0, yellowCards: 0,
    redCards: 0, penaltiesTaken: 0, penaltiesScored: 0, distanceKm: 0, sprints: 0, ratingSum: 0, ratingCount: 0,
    motm: 0, saves: 0, goalsConceded: 0, cleanSheets: 0, penaltiesSaved: 0,
  };
}

export function emptySeasonStats(): SeasonStats {
  return { total: emptyStats(), byCompetition: {} };
}

export function emptyAttributeXp(): AttributeXp {
  const out = {} as AttributeXp;
  for (const key of ATTRIBUTE_KEYS) out[key] = 0;
  return out;
}

// ── Base et plafonds ─────────────────────────────────────────────────────

/** Note de base avant répartition : interpolée dans la fourchette du niveau selon l'âge (16 → bas, 21 → haut). */
export function baseOverallFor(setup: LimitsSetup): number {
  const [lo, hi] = CR.startOverall[setup.startingLevel];
  const t = (setup.startAge - CR.startAge.min) / (CR.startAge.max - CR.startAge.min);
  return Math.round(lerp(lo, hi, t));
}

/** RNG fixe de la base : la même base est montrée à l'écran de création puis utilisée par createPlayer. */
function baseRng(setup: LimitsSetup): Rng {
  return mulberry32(seedFromString(`creation|${setup.position}|${setup.startingLevel}|${setup.startAge}`));
}

/** Base d'attributs + plafonds selon âge, poste et niveau de départ (§2 : 40 points). */
export function allocationLimits(setup: LimitsSetup): AllocationLimits {
  const profile = positionProfile(setup.position);
  const bonus = CR.capBonusPerYearOver16 * Math.max(0, setup.startAge - CR.startAge.min);
  const perAttributeMax = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    perAttributeMax[key] = (profile.creationCaps[key] ?? CR.defaultCreationCap) + bonus;
  }
  const base = attributesFromOverall(baseOverallFor(setup), setup.position, baseRng(setup), undefined, setup.startAge);
  return { total: CR.allocationPoints, perAttributeMax, base };
}

/** Valide la répartition (total ≤ 40, plafonds). Renvoie la liste des erreurs, vide si OK. */
export function validateAllocation(setup: CareerSetup): string[] {
  const errors: string[] = [];
  if (setup.startAge < CR.startAge.min || setup.startAge > CR.startAge.max) {
    errors.push(`Âge de départ ${setup.startAge} hors de [${CR.startAge.min}, ${CR.startAge.max}]`);
  }
  const limits = allocationLimits(setup);
  let total = 0;
  for (const [key, value] of Object.entries(setup.allocation) as [AttributeKey, number | undefined][]) {
    if (value === undefined) continue;
    if (!ATTRIBUTE_KEYS.includes(key)) { errors.push(`Attribut inconnu : ${key}`); continue; }
    if (!Number.isInteger(value) || value < 0) { errors.push(`${key} : ${value} points (entier positif attendu)`); continue; }
    const cap = limits.perAttributeMax[key];
    if (value > cap) errors.push(`${key} : ${value} points, plafond ${cap}`);
    total += value;
  }
  if (total > limits.total) errors.push(`${total} points répartis, maximum ${limits.total}`);
  return errors;
}

// ── Tirages ──────────────────────────────────────────────────────────────

/** Potentiel caché (§6.8) : élite (≥ 90) avec une petite probabilité, sinon tirage tiré vers le bas. */
export function drawPotential(level: StartingLevel, rng: Rng): number {
  const [lo, hi] = CR.potentialRange[level];
  const elite = CR.ballonDOrPotentialFrom;
  if (hi >= elite && rng.chance(CR.potentialDraw.eliteProb)) return rng.int(Math.max(lo, elite), hi);
  const top = Math.min(hi, elite - 1);
  const u = Math.pow(rng.next(), CR.potentialDraw.belowEliteExponent);
  return clampAttribute(Math.floor(lo + (top - lo + 1) * u));
}

/** Prédisposition cachée aux blessures : normale tronquée 0-1. */
export function drawInjuryProneness(rng: Rng): number {
  return clamp(rng.normal(CR.injuryProneness.mean, CR.injuryProneness.sd), 0, 1);
}

/** Date de naissance telle que le joueur ait exactement `age` ans révolus à `date`. */
function birthDateFor(age: number, date: ISODate, rng: Rng): ISODate {
  return addDays(addMonths(date, -12 * age), -rng.int(0, 364));
}

/** Fin de contrat : 30 juin, `years` saisons plus tard. */
export function contractEndFor(date: ISODate, years: number): ISODate {
  const endYear = yearOf(date) + years - (monthOf(date) <= 6 ? 1 : 0);
  return `${endYear}-06-30`;
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ── Création ─────────────────────────────────────────────────────────────

function initialContract(setup: CareerSetup, club: Club, league: League, overall: number, date: ISODate): Contract {
  const years = bandFor(CT.defaultYears, setup.startAge).years;
  const wage = suggestedWage(overall, setup.startAge, club, league);
  return {
    clubId: club.id,
    signedOn: date,
    endsOn: contractEndFor(date, years),
    wageMonthly: wage,
    promisedRole: CT.initialRoleByLevel[setup.startingLevel],
    bonuses: {
      perAppearance: Math.round(wage * CT.bonuses.perAppearance),
      perGoal: Math.round(wage * CT.bonuses.perGoal),
      perAssist: Math.round(wage * CT.bonuses.perAssist),
      perTrophy: Math.round(wage * CT.bonuses.perTrophy),
    },
  };
}

/** Crée le joueur incarné. Lève si la répartition est invalide. */
export function createPlayer(setup: CareerSetup, club: Club, league: League, rng: Rng, date: ISODate): Player {
  const errors = validateAllocation(setup);
  if (errors.length > 0) throw new Error(`Répartition invalide : ${errors.join(' ; ')}`);

  const limits = allocationLimits(setup);
  const attributes = { ...limits.base };
  for (const [key, value] of Object.entries(setup.allocation) as [AttributeKey, number | undefined][]) {
    if (value) attributes[key] = clampAttribute(attributes[key] + value);
  }
  const overall = computeOverall(attributes, setup.position);
  const potential = Math.max(drawPotential(setup.startingLevel, rng), overall + 1);
  const secondary = compatiblePositions(setup.position)
    .filter((p) => positionCompatibility(setup.position, p) >= CR.secondaryPositionMinCompat);

  const player: Player = {
    id: `joueur_${slug(setup.firstName)}_${slug(setup.lastName)}`,
    identity: {
      firstName: setup.firstName,
      lastName: setup.lastName,
      birthDate: birthDateFor(setup.startAge, date, rng),
      nationality: setup.nationality,
      secondNationality: setup.secondNationality,
      position: setup.position,
      secondaryPositions: secondary,
      foot: setup.foot,
      heightCm: setup.heightCm,
      weightKg: setup.weightKg,
      ...(setup.avatar ? { avatar: setup.avatar } : {}),
      archetypes: setup.archetypes.slice(0, 3),
    },
    attributes,
    attributeXp: emptyAttributeXp(),
    potential,
    /** Référence du plafond §6.8 : le potentiel ne s'écartera jamais de plus de ±6 de cette valeur. */
    initialPotential: potential,
    potentialEstimate: { low: overall, high: potential, statement: '', updatedOn: date },
    overall,
    form: 0,
    fitness: CR.initial.fitness,
    sharpness: CR.initial.sharpness,
    morale: CR.initial.morale,
    confidence: CR.initial.confidence,
    injuries: [],
    injuryProneness: drawInjuryProneness(rng),
    intenseSessionsStreak: 0,
    contract: initialContract(setup, club, league, overall, date),
    marketValue: 0,
    marketValueHistory: [],
    overallHistory: [],
    seasonStats: emptySeasonStats(),
    careerStats: emptyStats(),
    history: [],
    traits: [],
    trophies: [],
    awards: [],
    scouting: { profiled: false, actionFrequency: {}, manMarkingLikely: false },
    squadStatus: 'membre',
    coachTrust: CR.initial.coachTrust[setup.startingLevel],
    suspensions: {},
    yellowCardTally: {},
  };

  player.potentialEstimate = estimatePotential(player, setup.startAge, difficultyProfile(setup.difficulty), date);
  player.marketValue = computeMarketValue(player, setup.startAge, club, league, 1, date);
  player.marketValueHistory = [{ date, value: player.marketValue }];
  player.overallHistory = [{ date, overall: player.overall, attributes: { ...player.attributes } }];
  return player;
}
