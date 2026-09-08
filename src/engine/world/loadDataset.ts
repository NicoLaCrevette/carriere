/**
 * Chargement d'un jeu de données validé vers le monde du moteur, et
 * génération d'un jeu de données fictif complet (18 clubs français inventés,
 * ~26 joueurs chacun) utilisé par `data/leagues/fictional/ligue1.json` et par
 * les tests.
 */
import type {
  Archetype, BoardObjective, Club, Coach, Competition, CountryCode, DatasetInfo, Id, ISODate, League, Npc, NpcPlayer,
  Position, Seed, Tactic, World,
} from '../types';
import { MENTALITIES, PLAY_STYLES, POSITIONS } from '../types';
import type { DatasetClub, DatasetCoach, DatasetFile, DatasetLeague, DatasetPlayer } from '../../data/schema';
import type { Rng } from '../rng/mulberry32';
import { rngFor } from '../rng/derive';
import { BALANCE } from '../config/balance';
import { ageAt } from '../calendar/dates';
import { FORMATION_NAMES, slotsForPosition } from '../config/formations';
import { compatiblePositions } from '../config/positions';
import {
  clamp, coachFromDataset, contractEndDate, defaultContractYears, nextShirtNumber, npcFromDataset,
  pickBody, pickFoot, pickNationality, randomBirthDate,
} from './generateSquad';
import { generateClubIdentity, generateName, type ClubIdentity } from './names';
import { countryName, normalizeCountryCode } from '../../data/nationalities';

const W = BALANCE.world;
const WF = W.fictional;

// ═══════════════════════════════════════════════════════════════════════════
// Chargement d'un dataset validé → World
// ═══════════════════════════════════════════════════════════════════════════

function toLeague(entry: DatasetLeague): League {
  return {
    id: entry.id,
    kind: 'championnat',
    name: entry.name,
    shortName: entry.shortName,
    country: entry.country,
    prestige: entry.prestige,
    tier: entry.tier,
    clubIds: [...entry.clubIds],
    format: { type: 'ligue', ...entry.format },
  };
}

function tacticFrom(coach: DatasetCoach): Tactic {
  return {
    formation: coach.formation, mentality: coach.mentality, style: coach.style,
    pressing: coach.pressing, tempo: coach.tempo, width: coach.width,
  };
}

function toClub(entry: DatasetClub, real: boolean): Club {
  return {
    id: entry.id,
    name: entry.name,
    shortName: entry.shortName,
    code: entry.code,
    city: entry.city,
    country: entry.country,
    colors: { ...entry.colors },
    stadium: { ...entry.stadium },
    leagueId: entry.leagueId,
    prestige: entry.prestige,
    fanbase: entry.fanbase,
    facilities: entry.facilities,
    transferBudget: entry.transferBudget,
    wageBudgetMonthly: entry.wageBudgetMonthly,
    boardObjective: entry.boardObjective,
    tactic: tacticFrom(entry.coach),
    coachId: `coach_${entry.id}`,
    captainId: '',
    squadIds: [],
    rivalClubIds: [...entry.rivalClubIds],
    teamMorale: W.npcInitial.teamMorale,
    positionHierarchy: {},
    real,
  };
}

/** Meilleur capitaine possible d'un effectif : note + leadership × poids + bonus d'âge (§ captainChoice). */
function captainScore(npc: NpcPlayer, date: ISODate): number {
  const cfg = W.captainChoice;
  const age = ageAt(npc.identity.birthDate, date);
  return npc.overall + npc.attributes.leadership * cfg.leadershipWeight + (age >= cfg.ageBonusFrom ? cfg.ageBonus : 0);
}

/** Construit le monde depuis un jeu de données validé. Déterministe pour (dataset, seed). */
export function buildWorld(dataset: DatasetFile, seed: Seed, date: ISODate): World {
  const leagues: Record<Id, League> = {};
  for (const entry of dataset.leagues) leagues[entry.id] = toLeague(entry);

  const clubs: Record<Id, Club> = {};
  const npcPlayers: Record<Id, NpcPlayer> = {};
  const npcs: Record<Id, Npc | Coach> = {};

  for (const entry of dataset.clubs) {
    const club = toClub(entry, dataset.realNames);
    const league = leagues[club.leagueId];
    if (!league) throw new Error(`buildWorld : ligue inconnue « ${club.leagueId} » pour le club « ${club.id} »`);
    clubs[club.id] = club;

    const rng = rngFor(seed, { scope: `dataset:${club.id}`, index: 0 });
    const coach = coachFromDataset(entry.coach, club, date, rng, dataset.realNames);
    npcs[coach.id] = coach;
    club.coachId = coach.id;

    let flaggedCaptainId: Id | undefined;
    let bestCaptainId: Id | undefined;
    let bestCaptainScore = -Infinity;
    for (const row of entry.players) {
      const npc = npcFromDataset(row, club.id, league, club, date, rng);
      npcPlayers[npc.id] = npc;
      club.squadIds.push(npc.id);
      if (row.captain) flaggedCaptainId = npc.id;
      const score = captainScore(npc, date);
      if (score > bestCaptainScore) { bestCaptainScore = score; bestCaptainId = npc.id; }
    }
    club.captainId = flaggedCaptainId ?? bestCaptainId ?? club.squadIds[0] ?? '';
  }

  const competitions: Record<Id, Competition> = {};
  for (const league of Object.values(leagues)) competitions[league.id] = league;

  const datasetInfo: DatasetInfo = {
    id: dataset.id,
    label: dataset.label,
    realNames: dataset.realNames,
    referenceSeason: dataset.referenceSeason,
    source: dataset.source,
    leagueIds: dataset.leagues.map((l) => l.id),
  };

  return {
    dataset: datasetInfo,
    leagues,
    competitions,
    clubs,
    npcPlayers,
    npcs,
    nationalSquads: {},
    marketInflation: 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Jeu de données fictif (18 clubs français inventés, ~26 joueurs chacun)
// ═══════════════════════════════════════════════════════════════════════════

function lerp(lo: number, hi: number, t: number): number {
  return lo + (hi - lo) * t;
}

/** Interpolation exponentielle : croît beaucoup plus vite en haut de fourchette (budgets, salaires). */
function expLerp(lo: number, hi: number, t: number): number {
  return lo * (hi / lo) ** t;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Répartit `n` valeurs de prestige sur la fourchette configurée, décroissantes, avec un peu de bruit. */
function distributePrestige(rng: Rng, n: number): number[] {
  const [lo, hi] = WF.prestigeRange;
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1);
    values.push(clamp(Math.round(lerp(hi, lo, t) + rng.normal(0, 3)), lo, hi));
  }
  values.sort((a, b) => b - a);
  return values;
}

function objectiveFor(rank: number): BoardObjective {
  for (const band of WF.objectiveByRank) if (rank <= band.maxRank) return band.objective;
  return 'maintien';
}

function uniqueClubId(code: string, used: Set<string>): Id {
  const base = code.toLowerCase().replace(/[^a-z0-9]/g, '') || 'club';
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) { candidate = `${base}${n}`; n += 1; }
  used.add(candidate);
  return candidate;
}

const COLOR_PALETTES: readonly (readonly [string, string])[] = [
  ['#1d4ed8', '#ffffff'], ['#dc2626', '#ffffff'], ['#059669', '#ffffff'], ['#f59e0b', '#111827'],
  ['#7c3aed', '#ffffff'], ['#0891b2', '#111827'], ['#111827', '#f59e0b'], ['#be123c', '#fde68a'],
  ['#065f46', '#fde68a'], ['#1e293b', '#e2e8f0'], ['#9a3412', '#ffffff'], ['#312e81', '#c7d2fe'],
];

/** Mots-clés de personnalité de coach (miroir compact de la table privée de `generateSquad.ts`). */
const COACH_KEYWORDS: readonly string[] = [
  'ancien joueur', 'aime les jeunes', 'rancunier', 'obsédé par le pressing', 'adepte de la possession',
  'protecteur avec son groupe', 'cassant en conférence', 'fidèle à ses cadres', 'tacticien froid',
  'meneur d\'hommes', 'colérique à chaud', 'méthodique', 'exigeant sur le physique', 'proche des supporters',
];

/** Archétype plausible par poste (miroir compact de la table privée de `generateSquad.ts`). */
const ARCHETYPE_BY_POSITION: Partial<Record<Position, readonly Archetype[]>> = {
  GB: ['gardien_ligne', 'gardien_libero'],
  DC: ['mur', 'relanceur', 'libero'],
  DD: ['piston', 'mur'],
  DG: ['piston', 'mur'],
  MDC: ['sentinelle', 'destructeur', 'regisseur'],
  MC: ['box_to_box', 'regisseur', 'createur'],
  MOC: ['createur', 'regisseur', 'dribbleur'],
  AIG: ['dribbleur', 'ailier_de_debordement', 'profondeur'],
  AID: ['dribbleur', 'ailier_de_debordement', 'profondeur'],
  BU: ['finisseur', 'pivot', 'profondeur', 'faux_neuf'],
};

function generateFictionalCoach(rng: Rng, country: CountryCode, asOf: ISODate, prestige: number): DatasetCoach {
  const g = W.coachGen;
  const age = rng.int(g.ageRange[0], g.ageRange[1]);
  const nationality = pickNationality(rng, country, g.foreignShare);
  const { firstName, lastName } = generateName(rng, nationality);
  const pct = (): number => rng.int(g.personalityRange[0], g.personalityRange[1]);
  const cursor = (): number => Number(clamp(rng.normal(0.5, g.tacticSd), 0, 1).toFixed(2));
  return {
    firstName,
    lastName,
    nationality,
    birthDate: randomBirthDate(rng, age, asOf),
    contractEndsOn: contractEndDate(asOf, rng.int(g.contractYears[0], g.contractYears[1])),
    ability: clamp(Math.round(WF.coachAbility.base + WF.coachAbility.prestigeSlope * prestige + rng.normal(0, WF.coachAbility.sd)), 1, 99),
    youthTrust: rng.int(g.youthTrustRange[0], g.youthTrustRange[1]),
    patience: rng.int(g.patienceRange[0], g.patienceRange[1]),
    formation: rng.pick(FORMATION_NAMES),
    mentality: rng.pick(MENTALITIES),
    style: rng.pick(PLAY_STYLES),
    pressing: cursor(),
    tempo: cursor(),
    width: cursor(),
    personality: { warmth: pct(), severity: pct(), volatility: pct(), mediaHunger: pct(), loyalty: pct(), keywords: rng.shuffle(COACH_KEYWORDS).slice(0, 3) },
  };
}

function generateFictionalSquad(rng: Rng, targetOverall: number, formationName: string, country: CountryCode, asOf: ISODate): DatasetPlayer[] {
  const players: DatasetPlayer[] = [];
  const usedNumbers = new Set<number>();
  for (const position of POSITIONS) {
    const count = WF.squadByPosition[position];
    const starters = Math.max(1, slotsForPosition(formationName, position));
    for (let i = 0; i < count; i++) {
      const gap = i < starters ? 0 : W.benchOverallGap;
      const sd = i < starters ? WF.starterSd : W.squadOverallSd;
      const overall = clamp(Math.round(rng.normal(targetOverall - gap, sd)), 1, 99);
      const age = rng.int(W.ageRange[0], W.ageRange[1]);
      const birthDate = randomBirthDate(rng, age, asOf);
      const nationality = pickNationality(rng, country, W.foreignShare);
      const { firstName, lastName } = generateName(rng, nationality);
      const body = pickBody(rng, position);
      const shirtNumber = nextShirtNumber(usedNumbers, position === 'GB' ? 1 : 2);
      const secondary = rng.chance(W.secondaryPositionProb) ? [rng.pick(compatiblePositions(position).slice(0, 3))] : [];
      const pool = ARCHETYPE_BY_POSITION[position];
      const archetypes: Archetype[] = pool ? [rng.pick(pool)] : [];
      players.push({
        firstName,
        lastName,
        birthDate,
        nationality,
        position,
        secondaryPositions: secondary,
        foot: pickFoot(rng),
        heightCm: body.heightCm,
        weightKg: body.weightKg,
        shirtNumber,
        overall,
        archetypes,
        attributes: {},
        captain: false,
        contractEndsOn: contractEndDate(asOf, defaultContractYears(age)),
      });
    }
  }
  return players;
}

function assignCaptain(players: DatasetPlayer[]): void {
  const candidates = players.filter((p) => p.position !== 'GB');
  const pool = candidates.length > 0 ? candidates : players;
  let captain = pool[0] as DatasetPlayer;
  for (const p of pool) if (p.overall > captain.overall) captain = p;
  captain.captain = true;
}

function buildFictionalClub(
  rng: Rng, identity: ClubIdentity, id: Id, leagueId: Id, country: CountryCode, prestige: number, rank: number, asOf: ISODate,
): DatasetClub {
  const coach = generateFictionalCoach(rng, country, asOf, prestige);
  const targetOverall = clamp(Math.round(WF.overallAtPrestige0 + WF.overallPerPrestigePoint * prestige), 1, 99);
  const players = generateFictionalSquad(rng, targetOverall, coach.formation, country, asOf);
  assignCaptain(players);
  const t = (prestige - WF.prestigeRange[0]) / (WF.prestigeRange[1] - WF.prestigeRange[0]);
  const [primary, secondary] = rng.pick(COLOR_PALETTES);

  return {
    id,
    name: identity.name,
    shortName: identity.shortName,
    code: identity.code,
    city: identity.city,
    country,
    colors: { primary, secondary },
    stadium: { name: identity.stadium, capacity: roundTo(lerp(WF.capacity[0], WF.capacity[1], t), 500) },
    leagueId,
    prestige,
    fanbase: clamp(Math.round(lerp(WF.fanbase.min, WF.fanbase.max, t) + rng.normal(0, WF.fanbase.sd)), WF.fanbase.min, WF.fanbase.max),
    facilities: clamp(Math.round(lerp(WF.facilities.min, WF.facilities.max, t) + rng.normal(0, WF.facilities.sd)), WF.facilities.min, WF.facilities.max),
    transferBudget: roundTo(expLerp(WF.transferBudget[0], WF.transferBudget[1], t), 100_000),
    wageBudgetMonthly: roundTo(expLerp(WF.wageBudgetMonthly[0], WF.wageBudgetMonthly[1], t), 10_000),
    boardObjective: objectiveFor(rank),
    rivalClubIds: [],
    coach,
    players,
  };
}

/** Derbys simples : clubs voisins dans la liste (déjà triée par prestige) rivaux entre eux. */
function assignRivalries(clubs: DatasetClub[]): void {
  for (let i = 0; i + 1 < clubs.length; i += 2) {
    const a = clubs[i] as DatasetClub;
    const b = clubs[i + 1] as DatasetClub;
    a.rivalClubIds = [b.id];
    b.rivalClubIds = [a.id];
  }
}

/** Génère un jeu de données fictif complet (18 clubs, ~26 joueurs chacun). Déterministe pour `seed`. */
export function generateFictionalDataset(
  seed: Seed, options?: { clubs?: number; country?: CountryCode; leagueId?: string },
): DatasetFile {
  const rng = rngFor(seed, { scope: 'dataset-fictif', index: 0 });
  const country = normalizeCountryCode(options?.country ?? 'FRA');
  const leagueId = options?.leagueId ?? 'ligue1_fictif';
  const clubCount = options?.clubs ?? WF.clubs;
  const referenceYear = 2026;
  const referenceSeason = seasonLabelFor(referenceYear);
  const asOf: ISODate = `${referenceYear}-07-01`;

  const prestiges = distributePrestige(rng, clubCount);
  const usedIdentity = new Set<string>();
  const usedIds = new Set<string>();
  const clubs: DatasetClub[] = [];
  for (let i = 0; i < clubCount; i++) {
    const prestige = prestiges[i] as number;
    const identity = generateClubIdentity(rng, country, usedIdentity);
    const id = uniqueClubId(identity.code, usedIds);
    clubs.push(buildFictionalClub(rng, identity, id, leagueId, country, prestige, i + 1, asOf));
  }
  assignRivalries(clubs);

  const isFrench = country === 'FRA';
  const league: DatasetLeague = {
    id: leagueId,
    name: isFrench ? 'Ligue 1 Fictive' : `Division 1 fictive (${countryName(country)})`,
    shortName: isFrench ? 'L1F' : 'D1F',
    country,
    tier: 1,
    prestige: W.defaultLeaguePrestige,
    clubIds: clubs.map((c) => c.id),
    format: {
      teams: clubCount, rounds: 2, pointsWin: 3, pointsDraw: 1, promoted: 2, relegated: 2, playoffSlots: 1,
      continentalSlots: ['ldc', 'ldc', 'ldc', 'ldc_barrage', 'le', 'conf'],
    },
  };

  return {
    id: `fictif-${leagueId}`,
    label: isFrench ? 'Championnat fictif (sans droits)' : `Championnat fictif — ${countryName(country)}`,
    realNames: false,
    referenceSeason,
    source: 'généré',
    asOf,
    leagues: [league],
    clubs,
  };
}

function seasonLabelFor(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
