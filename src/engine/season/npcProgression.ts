/**
 * Vie des PNJ : forme et stats après match, récupération quotidienne,
 * progression annuelle (jeunes vers le potentiel, déclin à 31+, retraites
 * remplacées par des jeunes générés via fillSquad).
 */
import type { AttributeGroup, AttributeKey, Club, Id, Lineup, Match, MatchResult, NpcPlayer, World } from '../types';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYS, INTERNATIONAL_COMPETITION_ID } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { ageAt } from '../calendar/dates';
import { clamp } from '../career/apply';
import { fillSquad } from '../world/generateSquad';

const NP = BALANCE.npcProgression;

function groupOf(key: AttributeKey): AttributeGroup {
  for (const [group, keys] of Object.entries(ATTRIBUTE_GROUPS) as [AttributeGroup, readonly AttributeKey[]][]) {
    if (keys.includes(key)) return group;
  }
  return 'mental';
}

/** Décale tous les attributs d'un PNJ de `points` (pondérés par groupe) et sa note globale. */
function shiftNpc(npc: NpcPlayer, points: number, groupFactor: Record<AttributeGroup, number>): void {
  const { min, max } = BALANCE.bounds.attribute;
  for (const key of ATTRIBUTE_KEYS) {
    const v = npc.attributes[key] + points * groupFactor[groupOf(key)];
    npc.attributes[key] = Math.round(clamp(v, min, max));
  }
  npc.overall = Math.round(clamp(npc.overall + points, min, max));
}

// ── Après match ────────────────────────────────────────────────────────────

function sideOutcome(result: MatchResult, side: 'home' | 'away'): number {
  const f = NP.formAfterMatch;
  const diff = side === 'home' ? result.homeGoals - result.awayGoals : result.awayGoals - result.homeGoals;
  return diff > 0 ? f.win : diff < 0 ? f.loss : f.draw;
}

/** Buts et passes par joueur, depuis les événements du match. */
function contributions(result: MatchResult): { goals: Map<Id, number>; assists: Map<Id, number>; reds: Set<Id> } {
  const goals = new Map<Id, number>();
  const assists = new Map<Id, number>();
  const reds = new Set<Id>();
  const bump = (map: Map<Id, number>, id: Id | undefined): void => {
    if (id) map.set(id, (map.get(id) ?? 0) + 1);
  };
  for (const e of result.events) {
    if (e.type === 'but' || e.type === 'penalty_marque') {
      bump(goals, e.playerId);
      if (e.type === 'but') bump(assists, e.secondaryPlayerId);
    } else if (e.type === 'passe_decisive') {
      bump(assists, e.playerId);
    } else if (e.type === 'carton_rouge' || e.type === 'var_rouge') {
      if (e.playerId) reds.add(e.playerId);
    }
  }
  return { goals, assists, reds };
}

/** Joueurs entrés en jeu depuis le banc (événements de remplacement, `playerId` = entrant). */
function substitutesUsed(result: MatchResult, lineup: Lineup): Set<Id> {
  const used = new Set<Id>();
  for (const e of result.events) {
    if (e.type === 'remplacement' && e.playerId && lineup.bench.includes(e.playerId)) used.add(e.playerId);
  }
  return used;
}

function updateNpcStats(npc: NpcPlayer, starter: boolean, goals: number, assists: number, red: boolean, conceded: number): void {
  const s = npc.seasonStats;
  s.matches += 1;
  if (starter) s.starts += 1; else s.subOn += 1;
  s.minutes += starter ? NP.minutes.starter : NP.minutes.substitute;
  s.goals += goals;
  s.assists += assists;
  if (red) s.redCards += 1;
  if (npc.identity.position === 'GB' && starter) {
    s.goalsConceded += conceded;
    if (conceded === 0) s.cleanSheets += 1;
  }
}

/** Forme, fitness, stats et suspensions des PNJ des deux équipes après un match. */
export function updateNpcAfterMatch(world: World, result: MatchResult, match: Match): void {
  const f = NP.formAfterMatch;
  /**
   * `npc.seasonStats` sert au classement des buteurs et aux récompenses du
   * championnat : un match de sélection n'y entre pas, et ne purge pas non
   * plus une suspension de championnat. Forme et fraîcheur, elles, comptent.
   */
  const international = match.competitionId === INTERNATIONAL_COMPETITION_ID;
  const { goals, assists, reds } = contributions(result);
  const { min, max } = BALANCE.bounds.form;
  for (const side of ['home', 'away'] as const) {
    const lineup = result.lineups[side];
    const outcome = sideOutcome(result, side);
    const conceded = side === 'home' ? result.awayGoals : result.homeGoals;
    const subs = substitutesUsed(result, lineup);
    const played = [...lineup.starters.map((id) => [id, true] as const), ...[...subs].map((id) => [id, false] as const)];
    for (const [id, starter] of played) {
      const npc = world.npcPlayers[id];
      if (!npc) continue; // joueur incarné ou id inconnu
      const g = goals.get(id) ?? 0;
      const a = assists.get(id) ?? 0;
      const red = reds.has(id);
      if (!international) updateNpcStats(npc, starter, g, a, red, conceded);
      const delta = outcome + g * f.goal + a * f.assist;
      npc.form = clamp(npc.form * (1 - f.decayToZero) + delta, min, max);
      const minutes = starter ? NP.minutes.starter : NP.minutes.substitute;
      npc.fitness = clamp(npc.fitness - minutes * BALANCE.fitness.fatiguePerMatchMinute, 0, 100);
      if (red && !international) npc.suspensionMatches += NP.redCardSuspension;
    }
    // Les suspendus purgent un match : seulement en club, jamais sur un match de sélection.
    if (international) continue;
    const clubId = side === 'home' ? match.homeClubId : match.awayClubId;
    const club = world.clubs[clubId];
    for (const id of club?.squadIds ?? []) {
      const npc = world.npcPlayers[id];
      if (npc && npc.suspensionMatches > 0 && !lineup.starters.includes(id) && !subs.has(id)) npc.suspensionMatches -= 1;
    }
  }
}

// ── Quotidien ──────────────────────────────────────────────────────────────

/** Récupération quotidienne légère des PNJ : fitness, blessures qui guérissent. */
export function dailyNpcRecovery(world: World, date: string, _rng: Rng): void {
  for (const npc of Object.values(world.npcPlayers)) {
    npc.fitness = clamp(npc.fitness + NP.dailyRecovery, 0, 100);
    if (npc.injury) {
      npc.injury.daysRemaining -= 1;
      if (npc.injury.daysRemaining <= 0) {
        npc.injury.healedOn = date;
        delete npc.injury;
      }
    }
  }
}

// ── Annuel ─────────────────────────────────────────────────────────────────

function yearlyGainShare(age: number): number {
  return NP.yearlyGainShare.find((b) => age <= b.maxAge)?.share ?? 0;
}

function yearlyDecline(age: number): number {
  const d = NP.decline;
  if (age < d.fromAge) return 0;
  return d.pointsPerYear * Math.pow(d.accelerationPerYear, age - d.fromAge);
}

function retirementProb(age: number): number {
  if (age < NP.minRetirementAge) return 0;
  return NP.retirement.find((b) => age <= b.maxAge)?.prob ?? 0;
}

function removeFromClub(world: World, npc: NpcPlayer): void {
  const club = world.clubs[npc.clubId];
  if (club) {
    club.squadIds = club.squadIds.filter((id) => id !== npc.id);
    for (const position of Object.keys(club.positionHierarchy) as (keyof Club['positionHierarchy'])[]) {
      club.positionHierarchy[position] = club.positionHierarchy[position]?.filter((id) => id !== npc.id);
    }
    if (club.captainId === npc.id) {
      const next = club.squadIds
        .map((id) => world.npcPlayers[id])
        .filter((p): p is NpcPlayer => p !== undefined)
        .sort((a, b) => b.attributes.leadership - a.attributes.leadership || a.id.localeCompare(b.id))[0];
      if (next) club.captainId = next.id;
    }
  }
  delete world.npcPlayers[npc.id];
}

function averageOverall(world: World, club: Club): number {
  const overalls = club.squadIds.map((id) => world.npcPlayers[id]?.overall).filter((v): v is number => v !== undefined);
  if (overalls.length === 0) return BALANCE.endOfSeason.promotedClub.targetOverall[0];
  return Math.round(overalls.reduce((s, v) => s + v, 0) / overalls.length);
}

/**
 * Progression annuelle des PNJ : les jeunes montent vers leur potentiel, les
 * plus de 30 ans déclinent (physique d'abord), les plus âgés prennent leur
 * retraite et sont remplacés par des jeunes générés. Mute world.
 */
export function progressNpcPlayersYearly(world: World, date: string, rng: Rng): void {
  const retiredClubs = new Set<Id>();
  const ids = Object.keys(world.npcPlayers).sort();
  for (const id of ids) {
    const npc = world.npcPlayers[id];
    if (!npc) continue;
    const age = ageAt(npc.identity.birthDate, date);
    if (rng.chance(retirementProb(age))) {
      retiredClubs.add(npc.clubId);
      removeFromClub(world, npc);
      continue;
    }
    const decline = yearlyDecline(age);
    if (decline > 0) {
      shiftNpc(npc, -decline, NP.declineGroupFactor);
      npc.potential = Math.min(npc.potential, npc.overall);
    } else {
      const cap = NP.yearlyGainMax.find((b) => age <= b.maxAge)?.max ?? 0;
      const prestige = world.clubs[npc.clubId]?.prestige ?? 50;
      const ceiling = NP.clubCeiling.base + NP.clubCeiling.perPrestigePoint * prestige;
      const room = Math.max(0, ceiling - npc.overall);
      const gain = Math.min(cap, room, Math.max(0, npc.potential - npc.overall) * yearlyGainShare(age));
      if (gain > 0) shiftNpc(npc, gain, NP.gainGroupFactor);
    }
  }
  for (const clubId of [...retiredClubs].sort()) {
    const club = world.clubs[clubId];
    // Les sélections nationales (clubs pseudo `nat_<CODE>`, hors ligue) sont recomplétées par `national/squads.ensureNationalSquad`.
    if (club && world.leagues[club.leagueId]) fillSquad(world, club, averageOverall(world, club), date, rng);
  }
}
