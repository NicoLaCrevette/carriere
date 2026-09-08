/**
 * Génération des joueurs PNJ, des coachs et remplissage des effectifs.
 *
 * Les attributs sont produits par `player/overall.attributesFromOverall`
 * autour d'une note cible ; potentiel, renommée, salaire et valeur sont déduits
 * quand le jeu de données ne les donne pas. Tout l'aléa vient du `Rng` reçu.
 */
import type {
  Archetype, Attributes, Club, Coach, CountryCode, Foot, Id, ISODate, League, NpcPersonality, NpcPlayer, Position,
  Tactic, VoiceProfile, World,
} from '../types';
import { FEET, MENTALITIES, PLAY_STYLES, POSITIONS } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { FORMATION_NAMES, hasFormation, slotsForPosition } from '../config/formations';
import { compatiblePositions } from '../config/positions';
import { addDays, addMonths, ageAt, monthOf, yearOf } from '../calendar/dates';
import { attributesFromOverall, computeOverall } from '../player/overall';
import { emptyStats } from '../player/createPlayer';
import { computeNpcMarketValue, suggestedWage } from '../player/marketValue';
import { generateName } from './names';
import { DEFAULT_FOREIGN_WEIGHTS, FOREIGN_NATIONALITY_WEIGHTS, normalizeCountryCode } from '../../data/nationalities';
import type { DatasetCoach, DatasetPlayer } from '../../data/schema';

const W = BALANCE.world;

export interface NpcSpec {
  clubId: Id;
  position: Position;
  targetOverall: number;
  date: ISODate;
  ageRange?: [number, number];
  nationality?: CountryCode;
  shirtNumber?: number;
}

// ── Petits utilitaires partagés avec loadDataset ─────────────────────────

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Date de naissance aléatoire pour avoir exactement `age` ans révolus à `date`. */
export function randomBirthDate(rng: Rng, age: number, date: ISODate): ISODate {
  return addDays(addMonths(date, -12 * age), -rng.int(0, 364));
}

/** Année de début de la saison en cours à `date` (juillet → juin). */
export function seasonStartYear(date: ISODate): number {
  const y = yearOf(date);
  return monthOf(date) >= BALANCE.calendar.seasonStart.month ? y : y - 1;
}

/** 30 juin de l'année `endYear`, fin de contrat standard. */
export function contractEndDate(date: ISODate, years: number): ISODate {
  const end = BALANCE.calendar.seasonEnd;
  const endYear = seasonStartYear(date) + Math.max(1, years);
  return `${endYear}-${String(end.month).padStart(2, '0')}-${String(end.day).padStart(2, '0')}`;
}

/** Durée de contrat par défaut selon l'âge (BALANCE.contracts.defaultYears). */
export function defaultContractYears(age: number): number {
  for (const band of BALANCE.contracts.defaultYears) if (age <= band.maxAge) return band.years;
  return 1;
}

/** Nationalité d'un PNJ : pays du club ou étranger plausible. */
export function pickNationality(rng: Rng, homeCountry: CountryCode, foreignShare: number): CountryCode {
  if (!rng.chance(foreignShare)) return homeCountry;
  const table = FOREIGN_NATIONALITY_WEIGHTS[normalizeCountryCode(homeCountry)] ?? DEFAULT_FOREIGN_WEIGHTS;
  const candidates = table.filter(([code]) => code !== homeCountry);
  if (candidates.length === 0) return homeCountry;
  return rng.weighted(candidates.map(([code]) => code), candidates.map(([, w]) => w));
}

export function pickFoot(rng: Rng): Foot {
  const shares = W.footShares;
  return rng.weighted(FEET, FEET.map((f) => shares[f]));
}

/** Taille et poids plausibles pour un poste. */
export function pickBody(rng: Rng, position: Position): { heightCm: number; weightKg: number } {
  const b = W.body;
  const heightCm = Math.round(clamp(rng.normal(b.heightMeanByPosition[position], b.heightSd), b.heightRange[0], b.heightRange[1]));
  const bmi = rng.normal(b.bmiMean, b.bmiSd);
  const weightKg = Math.round(clamp(bmi * (heightCm / 100) ** 2, 50, 120));
  return { heightCm, weightKg };
}

/** Archétypes plausibles par poste (le premier tiré devient celui du PNJ). */
const ARCHETYPES_BY_POSITION: Record<Position, readonly Archetype[]> = {
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

/** Potentiel déduit de l'âge : jeune → marge haute, vétéran → égal à la note. */
export function potentialFromAge(rng: Rng, overall: number, age: number): number {
  for (const band of W.npcPotentialMarginByAge) {
    if (age <= band.maxAge) return clamp(overall + rng.int(band.margin[0], band.margin[1]), 1, BALANCE.bounds.attribute.max);
  }
  return overall;
}

/** Renommée déduite de la note et du prestige du club. */
export function fameFrom(overall: number, clubPrestige: number): number {
  const f = W.fame;
  return Math.round(clamp(f.overallWeight * overall + f.prestigeWeight * clubPrestige + f.offset, 0, 100));
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function npcId(clubId: Id, shirtNumber: number, lastName: string): Id {
  return `${clubId}_${shirtNumber}_${slug(lastName)}`;
}

/** Enjeu des attributs gardien pour un joueur de champ : aucun réglage ici, tout vient d'attributesFromOverall. */
function finalizeNpc(base: Omit<NpcPlayer, 'overall' | 'wageMonthly' | 'marketValue'>, wage: number | undefined, value: number | undefined,
  age: number, league: League, club: Club): NpcPlayer {
  const overall = computeOverall(base.attributes, base.identity.position);
  const npc: NpcPlayer = { ...base, overall, wageMonthly: 0, marketValue: 0 };
  npc.wageMonthly = wage ?? Math.round(suggestedWage(overall, age, club, league));
  npc.marketValue = value ?? Math.round(computeNpcMarketValue(npc, age, club, league, 1));
  return npc;
}

// ── Joueur PNJ généré ────────────────────────────────────────────────────

export function generateNpcPlayer(rng: Rng, spec: NpcSpec, league: League, club: Club): NpcPlayer {
  const [lo, hi] = spec.ageRange ?? W.ageRange;
  const age = rng.int(lo, hi);
  const birthDate = randomBirthDate(rng, age, spec.date);
  const nationality = spec.nationality ?? pickNationality(rng, club.country, W.foreignShare);
  const { firstName, lastName } = generateName(rng, nationality);
  const attributes = attributesFromOverall(spec.targetOverall, spec.position, rng, undefined, age);
  const secondary = rng.chance(W.secondaryPositionProb) ? [rng.pick(compatiblePositions(spec.position).slice(0, 3))] : [];
  const shirtNumber = spec.shirtNumber ?? rng.int(1, 99);
  const preliminary = attributes ? computeOverall(attributes, spec.position) : spec.targetOverall;
  const base: Omit<NpcPlayer, 'overall' | 'wageMonthly' | 'marketValue'> = {
    id: npcId(spec.clubId, shirtNumber, lastName),
    identity: {
      firstName, lastName, birthDate, nationality, position: spec.position, secondaryPositions: secondary,
      foot: pickFoot(rng), ...pickBody(rng, spec.position), archetypes: [rng.pick(ARCHETYPES_BY_POSITION[spec.position])],
    },
    attributes,
    potential: potentialFromAge(rng, preliminary, age),
    form: 0,
    fitness: W.npcInitial.fitness,
    morale: W.npcInitial.morale,
    suspensionMatches: 0,
    clubId: spec.clubId,
    contractEndsOn: contractEndDate(spec.date, defaultContractYears(age)),
    seasonStats: emptyStats(),
    shirtNumber,
    fame: fameFrom(preliminary, club.prestige),
    real: false,
  };
  return finalizeNpc(base, undefined, undefined, age, league, club);
}

/** Construit un NpcPlayer à partir d'une ligne du jeu de données (attributs générés autour de la note). */
export function npcFromDataset(row: DatasetPlayer, clubId: Id, league: League, club: Club, date: ISODate, rng: Rng): NpcPlayer {
  const age = ageAt(row.birthDate, date);
  const overrides = row.attributes as Partial<Attributes>;
  const attributes = attributesFromOverall(row.overall, row.position, rng, overrides, age);
  const base: Omit<NpcPlayer, 'overall' | 'wageMonthly' | 'marketValue'> = {
    id: npcId(clubId, row.shirtNumber, row.lastName),
    identity: {
      firstName: row.firstName, lastName: row.lastName, birthDate: row.birthDate, nationality: row.nationality,
      position: row.position, secondaryPositions: [...row.secondaryPositions], foot: row.foot,
      heightCm: row.heightCm, weightKg: row.weightKg, archetypes: [...row.archetypes],
      ...(row.nickname ? { nickname: row.nickname } : {}),
      ...(row.secondNationality ? { secondNationality: row.secondNationality } : {}),
    },
    attributes,
    potential: row.potential ?? potentialFromAge(rng, row.overall, age),
    form: 0,
    fitness: W.npcInitial.fitness,
    morale: W.npcInitial.morale,
    suspensionMatches: 0,
    clubId,
    contractEndsOn: row.contractEndsOn,
    seasonStats: emptyStats(),
    shirtNumber: row.shirtNumber,
    fame: row.fame ?? fameFrom(row.overall, club.prestige),
    real: false,
  };
  const npc = finalizeNpc(base, row.wageMonthly, row.marketValue, age, league, club);
  // Le potentiel ne descend jamais sous la note effective.
  npc.potential = Math.max(npc.potential, npc.overall);
  return npc;
}

// ── Remplissage d'effectif ───────────────────────────────────────────────

function countByPosition(world: World, club: Club): Record<Position, number> {
  const counts = Object.fromEntries(POSITIONS.map((p) => [p, 0])) as Record<Position, number>;
  for (const id of club.squadIds) {
    const npc = world.npcPlayers[id];
    if (npc) counts[npc.identity.position] += 1;
  }
  return counts;
}

function usedShirtNumbers(world: World, club: Club): Set<number> {
  const used = new Set<number>();
  for (const id of club.squadIds) {
    const npc = world.npcPlayers[id];
    if (npc) used.add(npc.shirtNumber);
  }
  return used;
}

/** Plus petit numéro libre à partir de `from` (1-99), sinon 99. */
export function nextShirtNumber(used: Set<number>, from: number): number {
  for (let n = from; n <= 99; n++) {
    if (!used.has(n)) { used.add(n); return n; }
  }
  for (let n = 1; n < from; n++) {
    if (!used.has(n)) { used.add(n); return n; }
  }
  return 99;
}

/** Complète l'effectif d'un club jusqu'à un minimum par poste (2 GB, 4 DC, 2 DD, 2 DG, 3 MDC/MC, ...). Mute world. */
export function fillSquad(world: World, club: Club, targetOverall: number, date: ISODate, rng: Rng): NpcPlayer[] {
  const league = world.leagues[club.leagueId];
  if (!league) throw new Error(`fillSquad : ligue inconnue ${club.leagueId} pour ${club.id}`);
  const counts = countByPosition(world, club);
  const numbers = usedShirtNumbers(world, club);
  const formationName = hasFormation(club.tactic.formation) ? club.tactic.formation : FORMATION_NAMES[0]!;
  const created: NpcPlayer[] = [];
  for (const position of POSITIONS) {
    const starters = Math.max(1, slotsForPosition(formationName, position));
    for (let i = counts[position]; i < W.squadMinByPosition[position]; i++) {
      const gap = i < starters ? 0 : W.benchOverallGap;
      const target = Math.round(clamp(rng.normal(targetOverall - gap, W.squadOverallSd), BALANCE.bounds.attribute.min, BALANCE.bounds.attribute.max));
      const shirtNumber = nextShirtNumber(numbers, position === 'GB' ? 1 : 2);
      const npc = generateNpcPlayer(rng, { clubId: club.id, position, targetOverall: target, date, shirtNumber }, league, club);
      let id = npc.id;
      for (let k = 2; world.npcPlayers[id]; k++) id = `${npc.id}_${k}`;
      npc.id = id;
      world.npcPlayers[id] = npc;
      club.squadIds.push(id);
      created.push(npc);
    }
  }
  return created;
}

// ── Coachs ───────────────────────────────────────────────────────────────

const COACH_KEYWORDS: readonly string[] = [
  'ancien joueur', 'aime les jeunes', 'rancunier', 'obsédé par le pressing', 'adepte de la possession', 'protecteur avec son groupe',
  'cassant en conférence', 'fidèle à ses cadres', 'tacticien froid', 'meneur d\'hommes', 'colérique à chaud', 'méthodique',
  'fait confiance à l\'expérience', 'joue le contre', 'exigeant sur le physique', 'proche des supporters',
];

const TIMBRES: readonly string[] = [
  'voix grave et posée', 'voix rocailleuse du sud', 'voix nasale et rapide', 'voix chaude et tranquille',
  'voix sèche et cassante', 'voix douce, presque murmurée', 'voix puissante de tribun', 'voix rauque de fumeur',
];

/** Profil vocal persistant d'un PNJ masculin, selon l'âge. */
export function generateVoice(rng: Rng, age: number): VoiceProfile {
  const ageBand: VoiceProfile['ageBand'] = age < 35 ? 'jeune' : age < 55 ? 'adulte' : 'senior';
  return {
    gender: 'homme',
    ageBand,
    pitch: Number(clamp(rng.normal(0.95, 0.1), 0.6, 1.4).toFixed(2)),
    rate: Number(clamp(rng.normal(1.0, 0.07), 0.8, 1.25).toFixed(2)),
    timbre: rng.pick(TIMBRES),
  };
}

function randomPersonality(rng: Rng): NpcPersonality {
  const [lo, hi] = W.coachGen.personalityRange;
  const keywords = rng.shuffle(COACH_KEYWORDS).slice(0, 3);
  return { warmth: rng.int(lo, hi), severity: rng.int(lo, hi), volatility: rng.int(lo, hi), mediaHunger: rng.int(lo, hi), loyalty: rng.int(lo, hi), keywords };
}

function randomTactic(rng: Rng): Tactic {
  const sd = W.coachGen.tacticSd;
  const cursor = (): number => Number(clamp(rng.normal(0.5, sd), 0, 1).toFixed(2));
  return {
    formation: rng.pick(FORMATION_NAMES), mentality: rng.pick(MENTALITIES), style: rng.pick(PLAY_STYLES),
    pressing: cursor(), tempo: cursor(), width: cursor(),
  };
}

function coachSummary(firstName: string, lastName: string, age: number, club: Club, personality: NpcPersonality): string {
  return `${firstName} ${lastName}, ${age} ans, entraîneur de ${club.name}. ${personality.keywords.join(', ')}.`;
}

export function generateCoach(rng: Rng, club: Club, date: ISODate, ability?: number): Coach {
  const g = W.coachGen;
  const age = rng.int(g.ageRange[0], g.ageRange[1]);
  const nationality = pickNationality(rng, club.country, g.foreignShare);
  const { firstName, lastName } = generateName(rng, nationality);
  const personality = randomPersonality(rng);
  const preferredTactic = randomTactic(rng);
  const a = ability ?? Math.round(clamp(rng.normal(W.coachAbility.mean, W.coachAbility.sd), 1, 99));
  return {
    id: `coach_${club.id}`,
    kind: 'coach',
    firstName, lastName, nationality,
    birthDate: randomBirthDate(rng, age, date),
    clubId: club.id,
    personality,
    voice: generateVoice(rng, age),
    card: { summary: coachSummary(firstName, lastName, age, club, personality), updatedOn: date },
    active: true,
    createdOn: date,
    real: false,
    preferredTactic,
    youthTrust: rng.int(g.youthTrustRange[0], g.youthTrustRange[1]),
    patience: rng.int(g.patienceRange[0], g.patienceRange[1]),
    ability: a,
    contractEndsOn: contractEndDate(date, rng.int(g.contractYears[0], g.contractYears[1])),
  };
}

/** Coach à partir d'une ligne du jeu de données (voix générée, le reste vient de la ligne). */
export function coachFromDataset(row: DatasetCoach, club: Club, date: ISODate, rng: Rng, real = false): Coach {
  const age = ageAt(row.birthDate, date);
  const personality: NpcPersonality = { ...row.personality, keywords: [...row.personality.keywords] };
  const preferredTactic: Tactic = {
    formation: row.formation, mentality: row.mentality, style: row.style, pressing: row.pressing, tempo: row.tempo, width: row.width,
  };
  return {
    id: `coach_${club.id}`,
    kind: 'coach',
    firstName: row.firstName, lastName: row.lastName, nationality: row.nationality,
    birthDate: row.birthDate,
    clubId: club.id,
    personality,
    voice: generateVoice(rng, age),
    card: { summary: coachSummary(row.firstName, row.lastName, age, club, personality), updatedOn: date },
    active: true,
    createdOn: date,
    real,
    preferredTactic,
    youthTrust: row.youthTrust,
    patience: row.patience,
    ability: row.ability,
    contractEndsOn: row.contractEndsOn,
  };
}
