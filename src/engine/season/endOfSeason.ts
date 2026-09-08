/**
 * Fin de saison : bilan figé du joueur (SeasonRecord), récompenses
 * déterministes, relégations (les relégués sont remplacés par des promus
 * générés de prestige bas), progression annuelle des PNJ, valeur marchande,
 * puis nouvelle saison via buildSeason.
 */
import type { Award, CareerState, Club, Id, League, Match, NpcPlayer, SeasonRecord, Stats } from '../types';
import { BALANCE } from '../config/balance';
import { difficultyProfile } from '../config/difficulty';
import { formation } from '../config/formations';
import { positionCompatibility } from '../config/positions';
import { ageAt, yearOf, addDays } from '../calendar/dates';
import { hashKey, nextRng, rngFor } from '../rng/derive';
import { addLog, clamp } from '../career/apply';
import { rankOf, sortTable, topAssists, topScorers } from './table';
import { scheduleDesertSpells } from './desert';
import { progressNpcPlayersYearly } from './npcProgression';
import { nudgePotential } from '../player/progression';
import { updatePositionHierarchy } from './lineupSelection';
import { computeMarketValue } from '../player/marketValue';
import { emptySeasonStats, emptyStats } from '../player/createPlayer';
import { generateClubIdentity } from '../world/names';
import { fillSquad, generateCoach } from '../world/generateSquad';
import { buildSeason, seasonLabel } from '../world/generateCalendar';

const EOS = BALANCE.endOfSeason;

// ── Récompenses ────────────────────────────────────────────────────────────

interface Contender { id: Id; clubId: Id; position: NpcPlayer['identity']['position']; age: number; stats: Stats }

function seasonScore(stats: Stats): number {
  const s = EOS.seasonScore;
  const avg = stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : s.fallbackRating;
  return avg + stats.goals * s.goalsWeight + stats.assists * s.assistsWeight + stats.cleanSheets * s.cleanSheetWeight;
}

/** Joueurs de la ligue du joueur (PNJ + joueur incarné) avec assez de matchs. */
function contenders(state: CareerState, league: League): Contender[] {
  const clubs = new Set(league.clubIds);
  const date = state.currentDate;
  const out: Contender[] = [];
  for (const npc of Object.values(state.world.npcPlayers)) {
    if (!clubs.has(npc.clubId) || npc.seasonStats.matches < EOS.minMatchesForAwards) continue;
    out.push({ id: npc.id, clubId: npc.clubId, position: npc.identity.position, age: ageAt(npc.identity.birthDate, date), stats: npc.seasonStats });
  }
  const p = state.player;
  const stats = p.seasonStats.byCompetition[league.id] ?? p.seasonStats.total;
  if (clubs.has(p.contract.clubId) && stats.matches >= EOS.minMatchesForAwards) {
    out.push({ id: p.id, clubId: p.contract.clubId, position: p.identity.position, age: ageAt(p.identity.birthDate, date), stats });
  }
  return out.sort((a, b) => seasonScore(b.stats) - seasonScore(a.stats) || a.id.localeCompare(b.id));
}

/** Équipe type : meilleur joueur compatible par slot de la formation de référence. */
function teamOfTheSeason(list: Contender[]): Id[] {
  const used = new Set<Id>();
  const picked: Id[] = [];
  for (const slot of formation(EOS.teamOfTheSeasonFormation).slots) {
    const best = list
      .filter((c) => !used.has(c.id))
      .map((c) => ({ c, score: seasonScore(c.stats) * positionCompatibility(c.position, slot) }))
      .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))[0];
    if (best) { used.add(best.c.id); picked.push(best.c.id); }
  }
  return picked;
}

/** Récompenses de la saison dans la ligue du joueur, déterministes depuis les stats. */
export function computeAwards(state: CareerState): Award[] {
  const club = state.world.clubs[state.player.contract.clubId];
  const league = club ? state.world.leagues[club.leagueId] : undefined;
  if (!league) return [];
  const date = state.currentDate;
  const awards: Award[] = [];
  const add = (kind: Award['kind'], playerId: Id | undefined, rank?: number): void => {
    if (!playerId) return;
    const award: Award = { kind, playerId, competitionId: league.id, date };
    if (rank !== undefined) award.rank = rank;
    awards.push(award);
  };
  add('meilleur_buteur', topScorers(state, league.id, 1)[0]?.playerId);
  add('meilleur_passeur', topAssists(state, league.id, 1)[0]?.playerId);
  const list = contenders(state, league);
  add('joueur_de_la_saison', list[0]?.id);
  add('espoir_de_la_saison', list.find((c) => c.age <= EOS.youngPlayerMaxAge)?.id);
  add('meilleur_gardien', list.find((c) => c.position === 'GB')?.id);
  teamOfTheSeason(list).forEach((id, i) => add('equipe_type', id, i + 1));
  return awards;
}

// ── Relégation et promus générés ───────────────────────────────────────────

function removeClub(state: CareerState, clubId: Id): void {
  const club = state.world.clubs[clubId];
  if (!club) return;
  for (const id of club.squadIds) delete state.world.npcPlayers[id];
  const coach = state.world.npcs[club.coachId];
  if (coach) coach.active = false;
  delete state.world.clubs[clubId];
  for (const other of Object.values(state.world.clubs)) other.rivalClubIds = other.rivalClubIds.filter((id) => id !== clubId);
}

function promotedClub(state: CareerState, league: League, index: number): Club {
  const rng = nextRng(state, `promus:${state.season.id}`);
  const cfg = EOS.promotedClub;
  const used = new Set(Object.values(state.world.clubs).map((c) => c.name));
  const identity = generateClubIdentity(rng, league.country, used);
  const id = `${identity.code.toLowerCase()}_${yearOf(state.currentDate)}_${index}`;
  const club: Club = {
    id, name: identity.name, shortName: identity.shortName, code: identity.code, city: identity.city, country: league.country,
    colors: { primary: '#1f2937', secondary: '#f3f4f6' },
    stadium: { name: identity.stadium, capacity: rng.int(cfg.capacity[0], cfg.capacity[1]) },
    leagueId: league.id,
    prestige: rng.int(cfg.prestige[0], cfg.prestige[1]),
    fanbase: rng.int(cfg.fanbase[0], cfg.fanbase[1]),
    facilities: rng.int(cfg.facilities[0], cfg.facilities[1]),
    transferBudget: cfg.transferBudget,
    wageBudgetMonthly: cfg.wageBudgetMonthly,
    boardObjective: 'maintien',
    tactic: { formation: '4-4-2', mentality: 'defensive', style: 'bloc_bas', pressing: 0.4, tempo: 0.5, width: 0.5 },
    coachId: '', captainId: '', squadIds: [], rivalClubIds: [], teamMorale: 60, positionHierarchy: {}, real: false,
  };
  state.world.clubs[id] = club;
  const coach = generateCoach(rng, club, state.currentDate);
  state.world.npcs[coach.id] = coach;
  club.coachId = coach.id;
  fillSquad(state.world, club, rng.int(cfg.targetOverall[0], cfg.targetOverall[1]), state.currentDate, rng);
  const captain = club.squadIds
    .map((pid) => state.world.npcPlayers[pid])
    .filter((p): p is NpcPlayer => p !== undefined)
    .sort((a, b) => b.attributes.leadership - a.attributes.leadership || a.id.localeCompare(b.id))[0];
  club.captainId = captain?.id ?? '';
  return club;
}

/** Relègue les derniers de chaque ligue (le club du joueur est repêché en Phase 1) et génère les promus. */
function applyRelegations(state: CareerState): string[] {
  const messages: string[] = [];
  const playerClubId = state.player.contract.clubId;
  for (const league of Object.values(state.world.leagues)) {
    const ls = state.season.leagues[league.id];
    if (!ls || league.format.relegated <= 0) continue;
    const order = sortTable(ls.table, league.format).map((r) => r.clubId);
    const relegated: Id[] = [];
    for (let i = order.length - 1; i >= 0 && relegated.length < league.format.relegated; i--) {
      const id = order[i] as Id;
      if (id === playerClubId) {
        messages.push(`${state.world.clubs[id]?.name ?? id} est repêché : le club du joueur reste en ${league.name}.`);
        continue;
      }
      relegated.push(id);
    }
    relegated.forEach((id, index) => {
      const name = state.world.clubs[id]?.name ?? id;
      removeClub(state, id);
      const promoted = promotedClub(state, league, index + 1);
      league.clubIds = league.clubIds.map((cid) => (cid === id ? promoted.id : cid));
      messages.push(`${name} est relégué, remplacé par ${promoted.name} (promu).`);
    });
  }
  return messages;
}

// ── Clôture et saison suivante ─────────────────────────────────────────────

function cloneStats(s: Stats): Stats {
  return { ...s };
}

/** Fige la saison du joueur, applique relégations, récompenses, progression annuelle des PNJ, valeur marchande. */
export function closeSeason(state: CareerState): SeasonRecord {
  const player = state.player;
  const club = state.world.clubs[player.contract.clubId];
  if (!club) throw new Error(`Club du joueur introuvable : ${player.contract.clubId}`);
  const league = state.world.leagues[club.leagueId];
  if (!league) throw new Error(`Ligue introuvable : ${club.leagueId}`);
  const ls = state.season.leagues[league.id];
  const rank = ls ? rankOf(ls, club.id) : 0;
  const date = state.currentDate;

  const allAwards = computeAwards(state);
  const mine = allAwards.filter((a) => a.playerId === player.id).map(({ playerId: _p, ...rest }) => rest);
  const trophies: SeasonRecord['trophies'] = rank === 1 ? ['championnat'] : [];
  const total = player.seasonStats.total;
  const record: SeasonRecord = {
    seasonId: state.season.id,
    label: state.season.label,
    clubId: club.id,
    leagueId: league.id,
    leagueRank: rank,
    stats: { total: cloneStats(total), byCompetition: Object.fromEntries(Object.entries(player.seasonStats.byCompetition).map(([k, v]) => [k, cloneStats(v)])) },
    averageRating: total.ratingCount > 0 ? Math.round((total.ratingSum / total.ratingCount) * 100) / 100 : 0,
    trophies,
    awards: mine,
    marketValueEnd: player.marketValue,
    wageMonthlyEnd: player.contract.wageMonthly,
    nationalCaps: state.national.caps,
    nationalGoals: state.national.goals,
    overallEnd: player.overall,
    narrativeSummary: `${state.season.label} : ${club.name}, ${rank}e de ${league.name}, ${total.matches} matchs, ${total.goals} buts, ${total.assists} passes.`,
  };
  // §6.8 : une saison pleine fait réviser le plafond à la hausse, une saison perdue à la baisse,
  // dans une fourchette de ±6 autour du potentiel de départ. Jamais plus d'un point par saison.
  const nudge = record.averageRating >= EOS.potentialNudge.goodRating && total.matches >= EOS.potentialNudge.goodMatches ? 1
    : (total.minutes < EOS.potentialNudge.lostMinutes || (record.averageRating > 0 && record.averageRating < EOS.potentialNudge.poorRating && total.matches >= EOS.potentialNudge.poorMatches)) ? -1
      : 0;
  if (nudge !== 0) nudgePotential(player, nudge, player.initialPotential ?? player.potential);

  player.history.push(record);
  state.pastSeasons.push(record);
  for (const t of trophies) player.trophies.push({ kind: t, seasonId: state.season.id, clubId: club.id });
  player.awards.push(...mine);

  const { min, max } = BALANCE.bounds.gauge;
  if (rank === 1) player.morale = clamp(player.morale + EOS.moraleBonus.trophy, min, max);
  else if (rank <= league.format.continentalSlots.length) player.morale = clamp(player.morale + EOS.moraleBonus.europe, min, max);
  else if (ls && rank > league.clubIds.length - league.format.relegated) player.morale = clamp(player.morale + EOS.moraleBonus.relegation, min, max);

  addLog(state, 'systeme', `Fin de saison ${state.season.label} : ${rank}e de ${league.name}.`);
  for (const a of mine) addLog(state, 'trophee', `Récompense : ${a.kind}${a.rank ? ` (${a.rank})` : ''}.`);
  for (const m of applyRelegations(state)) addLog(state, 'systeme', m);

  progressNpcPlayersYearly(state.world, date, nextRng(state, `pnj-annuel:${state.season.id}`));
  state.world.marketInflation *= BALANCE.world.marketInflationYearly;
  const age = ageAt(player.identity.birthDate, date);
  player.marketValue = computeMarketValue(player, age, club, league, state.world.marketInflation, date);
  player.marketValueHistory.push({ date, value: player.marketValue });
  return record;
}

/** Prolonge automatiquement un contrat échu (Phase 1, sans mercato). */
function autoRenewContract(state: CareerState, seasonStart: string): void {
  const contract = state.player.contract;
  if (contract.endsOn >= seasonStart) return;
  const endYear = yearOf(seasonStart) + EOS.autoRenewYears;
  contract.endsOn = `${endYear}-06-30`;
  contract.signedOn = seasonStart;
  addLog(state, 'contrat', `Contrat prolongé automatiquement jusqu'au ${contract.endsOn}.`);
}

/** Crée la saison suivante : calendrier, remise à zéro des stats de saison, déserts, hiérarchie. */
export function startNextSeason(state: CareerState): void {
  const player = state.player;
  const clubId = player.contract.clubId;
  const startYear = yearOf(state.season.startDate) + 1;
  const seed = hashKey(state.seed, 'saison', startYear);
  const skeleton = buildSeason(state.world, startYear, clubId, seed);

  const kept = Object.fromEntries(Object.entries(state.matches).filter(([, m]) => m.involvesPlayer && m.status === 'joue'));
  state.season = skeleton.season;
  state.matches = kept;
  for (const m of skeleton.matches) {
    m.involvesPlayer = m.homeClubId === clubId || m.awayClubId === clubId;
    state.matches[m.id] = m;
  }
  state.calendar = skeleton.calendar;
  state.season.playerMatchIndex = 0;

  player.seasonStats = emptySeasonStats();
  player.yellowCardTally = {};
  for (const npc of Object.values(state.world.npcPlayers)) {
    npc.seasonStats = emptyStats();
    npc.form = 0;
    npc.fitness = 100;
  }
  const expected = skeleton.matches.filter((m: Match) => m.involvesPlayer).length;
  const profile = difficultyProfile(state.settings.difficulty);
  scheduleDesertSpells(state.season, profile, expected, rngFor(state.seed, { scope: `desert:${state.season.id}`, index: 0 }));
  autoRenewContract(state, state.season.startDate);
  updatePositionHierarchy(state, clubId);
  addLog(state, 'systeme', `Nouvelle saison ${seasonLabel(startYear)} : ${expected} matchs au programme, reprise le ${addDays(state.season.startDate, 0)}.`);
}
