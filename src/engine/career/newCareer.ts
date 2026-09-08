/**
 * Carrière neuve : monde depuis le jeu de données, joueur, saison et
 * calendrier, réputation, PNJ initiaux (coach du club, capitaine, agent,
 * journaliste local, mère), relations initiales, journal.
 * Date de départ : 1er juillet de l'année de référence du jeu de données.
 * Déterministe pour (setup, dataset) : la graine vient de setup.seed ou du nom.
 */
import type { DatasetFile } from '../../data/schema';
import type {
  CareerSetup, CareerState, Club, Coach, Id, ISODate, Match, Npc, NpcKind, NpcPersonality, Relationship, VoiceProfile,
} from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { difficultyProfile } from '../config/difficulty';
import { toISODate } from '../calendar/dates';
import { rngFor, seedFromString } from '../rng/derive';
import { addLog, addMemory } from './apply';
import { initialReputation } from '../reputation/reputation';
import { scheduleDesertSpells } from '../season/desert';
import { updatePositionHierarchy } from '../season/lineupSelection';
import { buildWorld } from '../world/loadDataset';
import { buildSeason } from '../world/generateCalendar';
import { generateName } from '../world/names';
import { createPlayer } from '../player/createPlayer';

export const SCHEMA_VERSION = 1;

const TIMBRES = ['voix posée', 'voix grave et calme', 'voix vive', 'voix chaleureuse', 'voix sèche', 'voix rocailleuse'] as const;

function voiceFor(rng: Rng, gender: VoiceProfile['gender'], ageBand: VoiceProfile['ageBand']): VoiceProfile {
  return {
    gender,
    ageBand,
    pitch: Math.round((0.85 + rng.next() * 0.3) * 100) / 100,
    rate: Math.round((0.9 + rng.next() * 0.2) * 100) / 100,
    timbre: rng.pick(TIMBRES),
  };
}

function personalityFor(rng: Rng, keywords: string[]): NpcPersonality {
  const pct = (): number => rng.int(25, 75);
  return { warmth: pct(), severity: pct(), volatility: pct(), mediaHunger: pct(), loyalty: pct(), keywords };
}

interface NpcSpec {
  kind: NpcKind;
  gender: VoiceProfile['gender'];
  ageBand: VoiceProfile['ageBand'];
  birthYearRange: [number, number];
  nationality: string;
  lastName?: string;
  clubId?: Id;
  affiliation?: string;
  npcPlayerId?: Id;
  keywords: string[];
  summary: string;
}

function makeNpc(rng: Rng, id: Id, spec: NpcSpec, date: ISODate): Npc {
  const name = generateName(rng, spec.nationality);
  const npc: Npc = {
    id,
    kind: spec.kind,
    firstName: name.firstName,
    lastName: spec.lastName ?? name.lastName,
    nationality: spec.nationality,
    birthDate: toISODate({ year: rng.int(spec.birthYearRange[0], spec.birthYearRange[1]), month: rng.int(1, 12), day: rng.int(1, 28) }),
    personality: personalityFor(rng, spec.keywords),
    voice: voiceFor(rng, spec.gender, spec.ageBand),
    card: { summary: spec.summary, updatedOn: date },
    active: true,
    createdOn: date,
    real: false,
  };
  if (spec.clubId) npc.clubId = spec.clubId;
  if (spec.affiliation) npc.affiliation = spec.affiliation;
  if (spec.npcPlayerId) npc.npcPlayerId = spec.npcPlayerId;
  return npc;
}

function relation(npcId: Id, kind: keyof typeof BALANCE.career.initialRelationships, date: ISODate): Relationship {
  const init = BALANCE.career.initialRelationships[kind];
  return { npcId, trust: init.trust, respect: init.respect, history: [{ date, channel: 'bureau', summary: 'Première rencontre', deltaTrust: 0, deltaRespect: 0 }] };
}

/** PNJ initiaux : coach (depuis le monde), capitaine, agent, journaliste local, mère. Écrit npcs et relations. */
function createInitialNpcs(state: CareerState, setup: CareerSetup, club: Club, rng: Rng): void {
  const date = state.currentDate;
  const year = Number(date.slice(0, 4));
  const coach = state.world.npcs[club.coachId] as Coach | undefined;
  if (coach) state.relationships[coach.id] = relation(coach.id, 'coach', date);

  const captain = state.world.npcPlayers[club.captainId];
  if (captain) {
    const id = `npc-capitaine-${captain.id}`;
    state.world.npcs[id] = makeNpc(rng, id, {
      kind: 'capitaine', gender: 'homme', ageBand: 'adulte', birthYearRange: [year - 33, year - 27],
      nationality: captain.identity.nationality, lastName: captain.identity.lastName, clubId: club.id, npcPlayerId: captain.id,
      keywords: ['capitaine', 'cadre du vestiaire'], summary: `Capitaine de ${club.name}, référence du vestiaire.`,
    }, date);
    state.world.npcs[id]!.firstName = captain.identity.firstName;
    state.relationships[id] = relation(id, 'capitaine', date);
  }

  const agentId = 'npc-agent';
  state.world.npcs[agentId] = makeNpc(rng, agentId, {
    kind: 'agent', gender: 'homme', ageBand: 'adulte', birthYearRange: [year - 50, year - 35], nationality: setup.nationality,
    keywords: ['agent', 'négociateur', 'ambitieux'], summary: `Agent de ${setup.firstName} ${setup.lastName}, gère contrats et transferts.`,
  }, date);
  state.relationships[agentId] = relation(agentId, 'agent', date);

  const journalistId = 'npc-journaliste-local';
  state.world.npcs[journalistId] = makeNpc(rng, journalistId, {
    kind: 'journaliste', gender: rng.chance(0.5) ? 'femme' : 'homme', ageBand: 'adulte', birthYearRange: [year - 48, year - 28],
    nationality: club.country, affiliation: `Le quotidien de ${club.city}`, keywords: ['presse locale', 'suit le club au quotidien'],
    summary: `Journaliste local qui couvre ${club.name} au quotidien.`,
  }, date);
  state.relationships[journalistId] = relation(journalistId, 'journaliste', date);

  const motherId = 'npc-mere';
  state.world.npcs[motherId] = makeNpc(rng, motherId, {
    kind: 'mere', gender: 'femme', ageBand: 'adulte', birthYearRange: [year - setup.startAge - 45, year - setup.startAge - 22],
    nationality: setup.nationality, lastName: setup.lastName, keywords: ['famille', 'protectrice', 'fière'],
    summary: `Mère de ${setup.firstName}, premier soutien et première critique.`,
  }, date);
  state.relationships[motherId] = relation(motherId, 'mere', date);
}

function defaultSettings(setup: CareerSetup): CareerState['settings'] {
  return {
    difficulty: setup.difficulty,
    voiceMode: 'mixte',
    sandbox: setup.sandbox ?? false,
    decisionTimer: true,
    pushToTalk: true,
    speechRate: 1,
    subtitles: true,
    llmModel: '',
    ttsProvider: 'webspeech',
  };
}

/** Carrière neuve, prête à jouer au 1er juillet de l'année de référence. */
export function newCareer(setup: CareerSetup, dataset: DatasetFile): CareerState {
  const seed = setup.seed ?? seedFromString(`${setup.firstName} ${setup.lastName}|${setup.datasetId}|${setup.clubId}`);
  const startYear = Number(dataset.referenceSeason.slice(0, 4));
  const startDate = toISODate({ year: startYear, month: BALANCE.calendar.seasonStart.month, day: BALANCE.calendar.seasonStart.day });

  const world = buildWorld(dataset, seed, startDate);
  const club = world.clubs[setup.clubId];
  if (!club) throw new Error(`Club de départ inconnu : ${setup.clubId}`);
  const league = world.leagues[club.leagueId];
  if (!league) throw new Error(`Ligue inconnue : ${club.leagueId}`);

  const player = createPlayer(setup, club, league, rngFor(seed, { scope: 'joueur', index: 0 }), startDate);
  const skeleton = buildSeason(world, startYear, club.id, seed);
  const matches: CareerState['matches'] = {};
  for (const m of skeleton.matches) {
    m.involvesPlayer = m.homeClubId === club.id || m.awayClubId === club.id;
    matches[m.id] = m;
  }

  const state: CareerState = {
    schemaVersion: SCHEMA_VERSION,
    careerId: `carriere-${seed.toString(16)}`,
    seed,
    createdOn: startDate,
    settings: defaultSettings(setup),
    currentDate: startDate,
    player,
    world,
    season: skeleton.season,
    pastSeasons: [],
    matches,
    calendar: skeleton.calendar,
    reputation: initialReputation(setup, club, startDate),
    relationships: {},
    storylines: [],
    promises: [],
    quotes: [],
    memory: [],
    events: [],
    offers: [],
    transfers: [],
    national: { countryCode: setup.nationality, stage: 'aucun', caps: 0, goals: 0, assists: 0, lockedIn: false },
    sponsors: [],
    reputationDeltasToday: {},
    rngCounters: {},
    log: [],
    retired: false,
  };

  const expected = skeleton.matches.filter((m: Match) => m.involvesPlayer).length;
  scheduleDesertSpells(state.season, difficultyProfile(setup.difficulty), expected, rngFor(seed, { scope: `desert:${state.season.id}`, index: 0 }));
  createInitialNpcs(state, setup, club, rngFor(seed, { scope: 'pnj-initiaux', index: 0 }));
  updatePositionHierarchy(state, club.id);

  addLog(state, 'systeme', `Carrière créée : ${setup.firstName} ${setup.lastName}, ${setup.startAge} ans, ${setup.position}, ${club.name} (${league.name}).`);
  addLog(state, 'contrat', `Premier contrat à ${club.name} jusqu'au ${player.contract.endsOn}, ${Math.round(player.contract.wageMonthly)} €/mois.`);
  addMemory(state, {
    date: startDate, type: 'transfert', importance: 3,
    summary: `${setup.firstName} ${setup.lastName} rejoint ${club.name} à ${setup.startAge} ans (${setup.startingLevel}).`,
    entities: [club.id, player.id],
  });
  return state;
}
