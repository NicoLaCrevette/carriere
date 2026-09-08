/**
 * Fixtures construites à la main pour tester saison, coach IA, réputation et
 * calendrier sans dépendre des modules world/player/match.
 */
import type {
  Attributes, CareerSetup, CareerState, Club, Coach, Id, ISODate, League, Match, MatchResult, NpcPlayer, Player,
  PlayerMatchReport, Position, Reputation, Stats,
} from '../../types';
import { ATTRIBUTE_KEYS, REPUTATION_KEYS } from '../../types';

export const DATE: ISODate = '2026-08-15';

export function makeAttributes(base: number): Attributes {
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) out[key] = base;
  return out;
}

export function emptyStatsFixture(): Stats {
  return {
    matches: 0, starts: 0, subOn: 0, subOff: 0, minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, xG: 0, xA: 0,
    keyPasses: 0, dribblesAttempted: 0, dribblesCompleted: 0, duelsWon: 0, duelsTotal: 0, aerialsWon: 0, aerialsTotal: 0,
    touches: 0, passesAttempted: 0, passesCompleted: 0, tackles: 0, interceptions: 0, blocks: 0, clearances: 0, fouls: 0,
    foulsSuffered: 0, offsides: 0, yellowCards: 0, redCards: 0, penaltiesTaken: 0, penaltiesScored: 0, distanceKm: 0,
    sprints: 0, ratingSum: 0, ratingCount: 0, motm: 0, saves: 0, goalsConceded: 0, cleanSheets: 0, penaltiesSaved: 0,
  };
}

export interface NpcOptions {
  form?: number; fitness?: number; birthDate?: ISODate; injuredDays?: number; suspension?: number;
  secondaryPositions?: Position[]; leadership?: number; goals?: number; assists?: number; matches?: number;
}

export function makeNpc(id: Id, clubId: Id, position: Position, overall: number, opts: NpcOptions = {}): NpcPlayer {
  const attributes = makeAttributes(overall);
  if (opts.leadership !== undefined) attributes.leadership = opts.leadership;
  const npc: NpcPlayer = {
    id,
    identity: {
      firstName: 'Joueur', lastName: id.toUpperCase(), birthDate: opts.birthDate ?? '2000-01-01', nationality: 'FRA',
      position, secondaryPositions: opts.secondaryPositions ?? [], foot: 'droit', heightCm: 180, weightKg: 75, archetypes: [],
    },
    attributes,
    overall,
    potential: overall + 5,
    form: opts.form ?? 0,
    fitness: opts.fitness ?? 100,
    morale: 60,
    suspensionMatches: opts.suspension ?? 0,
    clubId,
    contractEndsOn: '2029-06-30',
    wageMonthly: 20_000,
    marketValue: 1_000_000,
    seasonStats: { ...emptyStatsFixture(), goals: opts.goals ?? 0, assists: opts.assists ?? 0, matches: opts.matches ?? 0 },
    shirtNumber: 10,
    fame: 20,
    real: false,
  };
  if (opts.injuredDays) {
    npc.injury = {
      id: `inj-${id}`, type: 'ischios', origin: 'match', occurredOn: DATE, announcedDays: opts.injuredDays,
      actualDays: opts.injuredDays, daysRemaining: opts.injuredDays, playedThrough: false, recurrenceRisk: 0.1,
    };
  }
  return npc;
}

/** Effectif standard de 22 : 2 GB, 4 DC, 2 DD, 2 DG, 2 MDC, 3 MC, 2 MOC, 2 AID, 2 AIG, 1 BU (+ le buteur passé en option). */
export const STANDARD_SQUAD: readonly [Position, number][] = [
  ['GB', 72], ['GB', 62], ['DC', 70], ['DC', 69], ['DC', 64], ['DC', 61], ['DD', 68], ['DD', 60], ['DG', 68], ['DG', 60],
  ['MDC', 70], ['MDC', 63], ['MC', 71], ['MC', 67], ['MC', 62], ['MOC', 69], ['MOC', 62], ['AID', 70], ['AID', 62],
  ['AIG', 70], ['AIG', 62], ['BU', 70],
];

export function makeCoach(id: Id, clubId: Id, opts: { patience?: number; youthTrust?: number; formation?: string } = {}): Coach {
  return {
    id, kind: 'coach', firstName: 'Coach', lastName: 'Test', nationality: 'FRA', birthDate: '1970-05-05', clubId,
    personality: { warmth: 50, severity: 50, volatility: 50, mediaHunger: 50, loyalty: 50, keywords: [] },
    voice: { gender: 'homme', ageBand: 'senior', pitch: 1, rate: 1, timbre: 'posée' },
    card: { summary: 'Coach de test', updatedOn: DATE },
    active: true, createdOn: DATE, real: false,
    preferredTactic: { formation: opts.formation ?? '4-3-3', mentality: 'equilibree', style: 'possession', pressing: 0.5, tempo: 0.5, width: 0.5 },
    youthTrust: opts.youthTrust ?? 50,
    patience: opts.patience ?? 50,
    ability: 60,
    contractEndsOn: '2028-06-30',
  };
}

export function makeClub(id: Id, name: string, leagueId: Id, prestige = 50): Club {
  return {
    id, name, shortName: name, code: id.toUpperCase().slice(0, 3), city: name, country: 'FRA',
    colors: { primary: '#000', secondary: '#fff' }, stadium: { name: `Stade ${name}`, capacity: 30_000 }, leagueId,
    prestige, fanbase: 50, facilities: 60, transferBudget: 10_000_000, wageBudgetMonthly: 2_000_000, boardObjective: 'ventre_mou',
    tactic: { formation: '4-3-3', mentality: 'equilibree', style: 'possession', pressing: 0.5, tempo: 0.5, width: 0.5 },
    coachId: `coach-${id}`, captainId: '', squadIds: [], rivalClubIds: [], teamMorale: 60, positionHierarchy: {}, real: false,
  };
}

export function makePlayer(clubId: Id, position: Position, overall: number, opts: { coachTrust?: number; birthDate?: ISODate; form?: number; fitness?: number } = {}): Player {
  const xp = {} as Record<keyof Attributes, number>;
  for (const key of ATTRIBUTE_KEYS) xp[key] = 0;
  return {
    id: 'joueur',
    identity: {
      firstName: 'Léo', lastName: 'Martin', birthDate: opts.birthDate ?? '2008-03-10', nationality: 'FRA', position,
      secondaryPositions: [], foot: 'droit', heightCm: 180, weightKg: 74, archetypes: ['finisseur'],
    },
    attributes: makeAttributes(overall),
    attributeXp: xp,
    potential: 85,
    potentialEstimate: { low: 70, high: 90, statement: 'Du potentiel', updatedOn: DATE },
    overall,
    form: opts.form ?? 0,
    fitness: opts.fitness ?? 92,
    sharpness: 55,
    morale: 70,
    confidence: 60,
    injuries: [],
    injuryProneness: 0.3,
    intenseSessionsStreak: 0,
    contract: {
      clubId, signedOn: '2026-07-01', endsOn: '2029-06-30', wageMonthly: 4_000, promisedRole: 'projet',
      bonuses: { perAppearance: 200, perGoal: 300, perAssist: 200, perTrophy: 4_000 },
    },
    marketValue: 500_000,
    marketValueHistory: [],
    seasonStats: { total: emptyStatsFixture(), byCompetition: {} },
    careerStats: emptyStatsFixture(),
    history: [],
    traits: [],
    trophies: [],
    awards: [],
    scouting: { profiled: false, actionFrequency: {}, manMarkingLikely: false },
    squadStatus: 'membre',
    coachTrust: opts.coachTrust ?? 38,
    suspensions: {},
    yellowCardTally: {},
  };
}

export function makeReputation(value = 30): Reputation {
  const out = {} as Reputation;
  for (const key of REPUTATION_KEYS) out[key] = { value, history: [{ date: '2026-07-01', value, delta: 0, reason: 'Départ' }] };
  return out;
}

export const SETUP: CareerSetup = {
  firstName: 'Léo', lastName: 'Martin', startAge: 18, nationality: 'FRA', position: 'BU', foot: 'droit', heightCm: 180,
  weightKg: 74, archetypes: ['finisseur'], clubId: 'a', startingLevel: 'prometteur', difficulty: 'exigeant', allocation: {},
  datasetId: 'test',
};

export interface StateOptions {
  clubs?: { id: Id; name: string; squad?: readonly [Position, number][]; prestige?: number }[];
  playerClubId?: Id;
  playerPosition?: Position;
  playerOverall?: number;
  coachTrust?: number;
  difficulty?: CareerSetup['difficulty'];
  date?: ISODate;
}

/** État de carrière minimal : une ligue, des clubs avec effectif standard, le joueur au club `a`. */
export function makeState(opts: StateOptions = {}): CareerState {
  const leagueId = 'l1';
  const clubSpecs = opts.clubs ?? [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }, { id: 'd', name: 'Delta' }];
  const clubs: Record<Id, Club> = {};
  const npcPlayers: Record<Id, NpcPlayer> = {};
  const npcs: CareerState['world']['npcs'] = {};
  for (const spec of clubSpecs) {
    const club = makeClub(spec.id, spec.name, leagueId, spec.prestige);
    (spec.squad ?? STANDARD_SQUAD).forEach(([position, overall], i) => {
      const npc = makeNpc(`${spec.id}-${i + 1}`, spec.id, position, overall, { leadership: 50 + (i % 7) });
      npcPlayers[npc.id] = npc;
      club.squadIds.push(npc.id);
    });
    club.captainId = club.squadIds[2] ?? '';
    npcs[club.coachId] = makeCoach(club.coachId, club.id);
    clubs[club.id] = club;
  }
  const league: League = {
    id: leagueId, kind: 'championnat', name: 'Ligue Test', shortName: 'LT', country: 'FRA', prestige: 70, tier: 1,
    clubIds: clubSpecs.map((c) => c.id),
    format: { type: 'ligue', teams: clubSpecs.length, rounds: 2, pointsWin: 3, pointsDraw: 1, promoted: 2, relegated: 2, playoffSlots: 0, continentalSlots: ['ldc'] },
  };
  const playerClubId = opts.playerClubId ?? 'a';
  const date = opts.date ?? DATE;
  return {
    schemaVersion: 1,
    careerId: 'test',
    seed: 12345,
    createdOn: '2026-07-01',
    settings: {
      difficulty: opts.difficulty ?? 'exigeant', voiceMode: 'silencieux', sandbox: false, decisionTimer: false, pushToTalk: false,
      speechRate: 1, subtitles: true, llmModel: '', ttsProvider: 'webspeech',
    },
    currentDate: date,
    player: makePlayer(playerClubId, opts.playerPosition ?? 'BU', opts.playerOverall ?? 58, { coachTrust: opts.coachTrust }),
    world: {
      dataset: { id: 'test', label: 'Test', realNames: false, referenceSeason: '2026-27', source: 'test', leagueIds: [leagueId] },
      leagues: { [leagueId]: league },
      competitions: { [leagueId]: league },
      clubs,
      npcPlayers,
      npcs,
      nationalSquads: {},
      marketInflation: 1,
    },
    season: {
      id: 's2026', label: '2026-27', startDate: '2026-07-01', endDate: '2027-06-30', phase: 'championnat',
      leagues: {
        [leagueId]: {
          leagueId, seasonId: 's2026', clubIds: league.clubIds, matchIds: [], currentMatchday: 0,
          totalMatchdays: (clubSpecs.length - 1) * 2,
          table: league.clubIds.map((clubId) => ({
            clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, last5: [],
          })),
        },
      },
      cups: {},
      transferWindows: { summer: ['2026-07-01', '2026-09-01'], winter: ['2027-01-01', '2027-02-01'] },
      internationalBreaks: [['2026-09-01', '2026-09-10']],
      desertSpells: [],
      playerMatchIndex: 0,
    },
    pastSeasons: [],
    matches: {},
    calendar: [],
    reputation: makeReputation(),
    relationships: {},
    storylines: [],
    promises: [],
    quotes: [],
    memory: [],
    events: [],
    offers: [],
    transfers: [],
    national: { countryCode: 'FRA', stage: 'aucun', caps: 0, goals: 0, assists: 0, lockedIn: false },
    sponsors: [],
    reputationDeltasToday: {},
    rngCounters: {},
    log: [],
    retired: false,
  };
}

export function makeMatch(id: Id, home: Id, away: Id, date: ISODate, opts: { importance?: number; involvesPlayer?: boolean; competitionId?: Id } = {}): Match {
  return {
    id, seasonId: 's2026', competitionId: opts.competitionId ?? 'l1', matchday: 1, date, homeClubId: home, awayClubId: away,
    neutralVenue: false, status: 'a_venir', importance: opts.importance ?? 40, involvesPlayer: opts.involvesPlayer ?? false,
  };
}

export function makeResult(homeGoals: number, awayGoals: number, playerReport?: PlayerMatchReport): MatchResult {
  const result: MatchResult = {
    homeGoals, awayGoals, homeXg: 1.2, awayXg: 1.1, homePossession: 50, attendance: 20_000,
    lineups: { home: { formation: '4-3-3', starters: [], bench: [], captainId: '' }, away: { formation: '4-3-3', starters: [], bench: [], captainId: '' } },
    events: [], summaryLines: [],
  };
  if (playerReport) result.playerReport = playerReport;
  return result;
}

/** Match joué et enregistré dans state.matches. */
export function playedMatch(state: CareerState, id: Id, home: Id, away: Id, date: ISODate, hg: number, ag: number, report?: PlayerMatchReport): Match {
  const match = makeMatch(id, home, away, date, { involvesPlayer: report !== undefined });
  match.status = 'joue';
  match.result = makeResult(hg, ag, report);
  state.matches[id] = match;
  return match;
}

export interface ReportOptions {
  minutes?: number; started?: boolean; goals?: number; assists?: number; motm?: boolean; yellow?: number; red?: number; matchId?: Id;
}

export function makeReport(rating: number, opts: ReportOptions = {}): PlayerMatchReport {
  const stats = emptyStatsFixture();
  stats.matches = 1;
  stats.minutes = opts.minutes ?? 90;
  stats.starts = opts.started === false ? 0 : 1;
  stats.goals = opts.goals ?? 0;
  stats.assists = opts.assists ?? 0;
  stats.yellowCards = opts.yellow ?? 0;
  stats.redCards = opts.red ?? 0;
  stats.ratingSum = rating;
  stats.ratingCount = 1;
  return {
    matchId: opts.matchId ?? 'm', started: opts.started ?? true, minutesPlayed: opts.minutes ?? 90, rating, ratingLog: [], stats,
    motm: opts.motm ?? false,
    evaluation: { performance: rating, coach: rating, supporters: rating, teammates: rating, media: rating, verdicts: { performance: '', coach: '', supporters: '', teammates: '', media: '' } },
    decisions: [], metaAttempts: 0,
  };
}
