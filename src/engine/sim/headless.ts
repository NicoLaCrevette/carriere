/**
 * Simulation sans interface : une ou plusieurs saisons complètes d'une
 * carrière, jour par jour, avec un résumé chiffré par saison. Sert au script
 * `npm run sim`, aux tests de distribution (§6.5) et au tuning.
 */
import type { DatasetFile } from '../../data/schema';
import type {
  Archetype, Attributes, AttributeKey, CareerSetup, CareerState, DayResult, Difficulty, Injury, Position, PromisedRole, StartingLevel, Stats, TableRow,
} from '../types';
import { ATTRIBUTE_KEYS } from '../types';
import { newCareer } from '../career/newCareer';
import { advanceDay } from '../calendar/advanceDay';
import { respondToOffer } from '../transfers/negotiate';
import { allocationLimits } from '../player/createPlayer';
import { positionProfile } from '../config/positions';
import { generateFictionalDataset } from '../world/loadDataset';
import { topScorers, type ScorerRow } from '../season/table';
import { seedFromString } from '../rng/derive';

export interface HeadlessOptions {
  seed: number;
  dataset: 'fictional' | DatasetFile;
  position?: Position;
  age?: number;
  level?: StartingLevel;
  difficulty?: Difficulty;
  seasons?: number;
  clubId?: string;
  firstName?: string;
  lastName?: string;
  /**
   * Réponse automatique aux offres de mercato : « ignorer » (défaut, elles expirent)
   * ou « ambitieux » (accepte un meilleur rôle ou un meilleur salaire dans un club
   * de prestige comparable ; prolonge si le salaire monte).
   */
  offerPolicy?: 'ignorer' | 'ambitieux';
  onDay?: (result: DayResult, state: CareerState) => void;
}

const ROLE_RANK: Record<PromisedRole, number> = { projet: 0, rotation: 1, titulaire: 2, titulaire_indiscutable: 3 };

/** Politique « ambitieux » : décisions simples et déterministes sur les offres ouvertes. */
function applyOfferPolicy(state: CareerState): void {
  const player = state.player;
  const current = state.world.clubs[player.contract.clubId];
  if (!current) return;
  for (const offer of state.offers) {
    if (offer.status !== 'en_attente' && offer.status !== 'en_negociation') continue;
    const club = state.world.clubs[offer.clubId];
    if (!club) continue;
    const renewal = offer.clubId === player.contract.clubId;
    const betterRole = ROLE_RANK[offer.promisedRole] > ROLE_RANK[player.contract.promisedRole];
    const betterWage = offer.wageMonthly >= player.contract.wageMonthly * 1.25;
    // Un joueur ambitieux mais lucide : il ne rejoint pas un club où le titulaire au poste le domine nettement.
    const position = player.identity.position;
    const bestThere = Math.max(0, ...club.squadIds.map((id) => state.world.npcPlayers[id]).filter((n) => n && n.identity.position === position).map((n) => n!.overall));
    const canCompete = ROLE_RANK[offer.promisedRole] >= ROLE_RANK.titulaire || bestThere <= player.overall + 4;
    let accept: boolean;
    if (renewal) accept = betterWage || offer.wageMonthly >= player.contract.wageMonthly;
    else if (offer.loan) accept = betterRole && player.contract.promisedRole === 'projet';
    else accept = offer.currentClubStance !== 'ferme' && club.prestige >= current.prestige - 12 && canCompete && (betterRole || (club.prestige > current.prestige + 8 && betterWage));
    respondToOffer(state, offer.id, { type: accept ? 'accepter' : 'refuser' });
  }
}

export interface HeadlessPlayerSeason {
  matches: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  xG: number;
  xA: number;
  ratings: number[];
  averageRating: number;
  motm: number;
  yellowCards: number;
  redCards: number;
  subbedOffBad: number;
}

export interface HeadlessSeasonSummary {
  label: string;
  clubId: string;
  clubName: string;
  leagueRank: number;
  table: TableRow[];
  scorers: ScorerRow[];
  leagueGoals: number;
  leagueMatches: number;
  player: HeadlessPlayerSeason;
  overallStart: number;
  overallEnd: number;
  attributesStart: Attributes;
  attributesEnd: Attributes;
  marketValueEnd: number;
  coachTrustEnd: number;
  /** Concurrents directs au poste en fin de saison (hiérarchie du club, même poste), note et âge. */
  rivals: { id: string; overall: number; age: number }[];
  injuries: { type: Injury['type']; days: number; origin: Injury['origin'] }[];
  desertsScheduled: number;
  desertMatches: number;
  age: number;
  durationMs: number;
}

export interface HeadlessResult {
  seasons: HeadlessSeasonSummary[];
  hash: string;
  durationMs: number;
  state: CareerState;
}

const ARCHETYPES_BY_POSITION: Record<Position, Archetype[]> = {
  GB: ['gardien_ligne'], DC: ['mur'], DD: ['piston'], DG: ['piston'], MDC: ['sentinelle'], MC: ['box_to_box'],
  MOC: ['createur'], AIG: ['dribbleur'], AID: ['dribbleur'], BU: ['finisseur'],
};

/** Répartit les 40 points sur les attributs clés du poste, plafonds respectés. */
export function buildAllocation(setup: Pick<CareerSetup, 'startAge' | 'position' | 'startingLevel'>): Partial<Attributes> {
  const limits = allocationLimits(setup);
  const keys = positionProfile(setup.position).keyAttributes;
  const allocation: Partial<Attributes> = {};
  let left = limits.total;
  let progress = true;
  while (left > 0 && progress) {
    progress = false;
    for (const key of keys) {
      if (left <= 0) break;
      const current = allocation[key] ?? 0;
      if (current < limits.perAttributeMax[key]) {
        allocation[key] = current + 1;
        left--;
        progress = true;
      }
    }
  }
  return allocation;
}

/** Club de milieu de tableau par prestige (déterministe). */
export function midTableClubId(dataset: DatasetFile, leagueId?: string): string {
  const clubs = dataset.clubs
    .filter((c) => !leagueId || c.leagueId === leagueId)
    .sort((a, b) => b.prestige - a.prestige || a.id.localeCompare(b.id));
  return clubs[Math.floor(clubs.length / 2)]!.id;
}

interface Tracker {
  label: string;
  seasonId: string;
  attributesStart: Attributes;
  overallStart: number;
  ratings: number[];
  motm: number;
  subbedOffBad: number;
  injuries: HeadlessSeasonSummary['injuries'];
  table?: TableRow[];
  scorers?: ScorerRow[];
  leagueGoals: number;
  leagueMatches: number;
  desertMatches: number;
  desertsScheduled: number;
  statsSnapshot?: Stats;
  startedAt: number;
}

function cloneAttributes(a: Attributes): Attributes {
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) out[key] = a[key];
  return out;
}

function startTracker(state: CareerState): Tracker {
  return {
    label: state.season.label,
    seasonId: state.season.id,
    attributesStart: cloneAttributes(state.player.attributes),
    overallStart: state.player.overall,
    ratings: [],
    motm: 0,
    subbedOffBad: 0,
    injuries: [],
    leagueGoals: 0,
    leagueMatches: 0,
    desertMatches: 0,
    desertsScheduled: state.season.desertSpells.length,
    startedAt: performance.now(),
  };
}

function snapshotLeague(state: CareerState, leagueId: string, t: Tracker): void {
  const ls = state.season.leagues[leagueId];
  if (!ls || t.table) return;
  if (!ls.matchIds.every((id) => state.matches[id]?.status === 'joue')) return;
  t.table = ls.table.map((r) => ({ ...r, last5: [...r.last5] }));
  t.scorers = topScorers(state, leagueId, 10);
  t.leagueMatches = ls.matchIds.length;
  t.leagueGoals = ls.matchIds.reduce((s, id) => {
    const r = state.matches[id]?.result;
    return s + (r ? r.homeGoals + r.awayGoals : 0);
  }, 0);
  t.statsSnapshot = { ...state.player.seasonStats.total };
  t.desertMatches = state.season.desertSpells.reduce((s, d) => s + d.elapsed, 0);
}

function finalize(t: Tracker, state: CareerState, clubId: string, age: number): HeadlessSeasonSummary {
  const record = state.pastSeasons[state.pastSeasons.length - 1];
  const stats = t.statsSnapshot ?? record?.stats.total ?? state.player.seasonStats.total;
  const table = t.table ?? [];
  const rank = record?.leagueRank ?? (table.findIndex((r) => r.clubId === clubId) + 1);
  const ratings = t.ratings;
  const club = state.world.clubs[clubId];
  const position = state.player.identity.position;
  const rivals = (club?.positionHierarchy[position] ?? [])
    .map((id) => state.world.npcPlayers[id])
    .filter((n): n is NonNullable<typeof n> => !!n && n.identity.position === position)
    .slice(0, 3)
    .map((n) => ({ id: n.id, overall: n.overall, age: age + 0 - 0 + (new Date(state.currentDate).getUTCFullYear() - Number(n.identity.birthDate.slice(0, 4))) }));
  return {
    label: t.label,
    clubId,
    clubName: club?.name ?? clubId,
    leagueRank: rank,
    table,
    scorers: t.scorers ?? [],
    leagueGoals: t.leagueGoals,
    leagueMatches: t.leagueMatches,
    player: {
      matches: stats.matches, starts: stats.starts, minutes: stats.minutes, goals: stats.goals, assists: stats.assists,
      shots: stats.shots, xG: Math.round(stats.xG * 100) / 100, xA: Math.round(stats.xA * 100) / 100,
      ratings, averageRating: ratings.length > 0 ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 100) / 100 : 0,
      motm: t.motm, yellowCards: stats.yellowCards, redCards: stats.redCards, subbedOffBad: t.subbedOffBad,
    },
    overallStart: t.overallStart,
    overallEnd: state.player.overall,
    attributesStart: t.attributesStart,
    attributesEnd: cloneAttributes(state.player.attributes),
    marketValueEnd: state.player.marketValue,
    coachTrustEnd: state.player.coachTrust,
    rivals,
    injuries: t.injuries,
    desertsScheduled: t.desertsScheduled,
    desertMatches: t.desertMatches,
    age,
    durationMs: Math.round(performance.now() - t.startedAt),
  };
}

/** Empreinte courte et stable d'un résultat, pour vérifier la reproductibilité. */
export function resultHash(seasons: HeadlessSeasonSummary[]): string {
  const key = seasons.map((s) => [
    s.label, s.leagueRank, s.table.map((r) => `${r.clubId}:${r.points}:${r.goalsFor}`).join(','),
    s.player.goals, s.player.minutes, s.player.ratings.join('|'), s.overallEnd, Math.round(s.marketValueEnd),
  ].join('#')).join('\n');
  return seedFromString(key).toString(16).padStart(8, '0');
}

/** Joue `seasons` saisons complètes jour par jour et renvoie les résumés. */
export function runHeadlessSeason(options: HeadlessOptions): HeadlessResult {
  const t0 = performance.now();
  const dataset = options.dataset === 'fictional' ? generateFictionalDataset(42) : options.dataset;
  const position = options.position ?? 'BU';
  const level = options.level ?? 'prometteur';
  const startAge = options.age ?? 18;
  const clubId = options.clubId ?? midTableClubId(dataset);
  const setup: CareerSetup = {
    firstName: options.firstName ?? 'Léo',
    lastName: options.lastName ?? 'Martin',
    startAge,
    nationality: 'FRA',
    position,
    foot: 'droit',
    heightCm: position === 'GB' || position === 'DC' ? 188 : 180,
    weightKg: position === 'GB' || position === 'DC' ? 82 : 74,
    archetypes: ARCHETYPES_BY_POSITION[position],
    clubId,
    startingLevel: level,
    difficulty: options.difficulty ?? 'exigeant',
    allocation: buildAllocation({ startAge, position, startingLevel: level }),
    datasetId: dataset.id,
    seed: options.seed,
    sandbox: false,
  };
  const state = newCareer(setup, dataset);
  const leagueId = state.world.clubs[clubId]!.leagueId;
  const wanted = options.seasons ?? 1;
  const seasons: HeadlessSeasonSummary[] = [];
  let tracker = startTracker(state);
  let age = startAge;
  let guard = 0;
  const maxDays = 400 * wanted;

  while (seasons.length < wanted && !state.retired && guard++ < maxDays) {
    const seasonId = state.season.id;
    const result = advanceDay(state);
    if (options.offerPolicy === 'ambitieux') applyOfferPolicy(state);
    options.onDay?.(result, state);
    const report = result.matchResult?.playerReport;
    if (report && report.minutesPlayed > 0) {
      tracker.ratings.push(report.rating);
      if (report.motm) tracker.motm++;
      if (report.subbedOffReason === 'mauvais match') tracker.subbedOffBad++;
    }
    for (const injury of result.newInjuries) tracker.injuries.push({ type: injury.type, days: injury.actualDays, origin: injury.origin });
    snapshotLeague(state, leagueId, tracker);
    if (state.season.id !== seasonId) {
      seasons.push(finalize(tracker, state, state.player.contract.clubId, age));
      age++;
      tracker = startTracker(state);
    }
  }
  if (seasons.length < wanted && state.retired) seasons.push(finalize(tracker, state, state.player.contract.clubId, age));

  return { seasons, hash: resultHash(seasons), durationMs: Math.round(performance.now() - t0), state };
}
