/**
 * Contexte de match pour une rencontre internationale (`competitionId:
 * 'international'`).
 *
 * Écart au contrat, documenté ici et dans le rapport final : le joueur
 * incarné appartient à `state.player.contract.clubId` (son club employeur),
 * jamais au club pseudo `nat_<CODE>` de sa sélection — `match/simulateMatch
 * .buildMatchContext` ne peut donc pas détecter sa participation à un match
 * international (elle compare `home/away.id` à `player.contract.clubId`).
 * Ce module fournit un constructeur de contexte dédié qui force
 * l'inclusion du joueur dans le onze de sa sélection quand il est convoqué
 * (`state.national.stage` ∈ {convoque, titulaire, cadre, capitaine}), puis
 * délègue toute la simulation à `match/simulateMatch.runMatchAuto` /
 * `runBackgroundMatch` (aucune duplication de la boucle de match minute par
 * minute, de la résolution d'action ni de la clôture/rapport — tout ça reste
 * dans `match/simulateMatch.ts`, `match/simulateMinute.ts`, etc.).
 */
import type { CareerState, Club, Coach, Id, Lineup, Match, MatchContext, Position } from '../types';
import { difficultyProfile } from '../config/difficulty';
import { formation, hasFormation } from '../config/formations';
import { positionCompatibility } from '../config/positions';
import { computeTeamStrength, footballerMap } from '../match/teamStrength';

const FALLBACK_FORMATION = '4-3-3';
const CALLED_UP_STAGES: readonly string[] = ['convoque', 'titulaire', 'cadre', 'capitaine'];

interface Candidate {
  id: Id;
  position: Position;
  overall: number;
  form: number;
  fitness: number;
  leadership: number;
}

function isPlayerAvailable(state: CareerState): boolean {
  if (state.player.injuries.some((i) => i.daysRemaining > 0)) return false;
  return (state.player.suspensions.international ?? 0) <= 0;
}

/** Vrai si le joueur est convoqué et disponible pour représenter `country` dans ce match. */
export function isPlayerCalledUp(state: CareerState, country: string): boolean {
  return state.national.countryCode === country && CALLED_UP_STAGES.includes(state.national.stage) && isPlayerAvailable(state);
}

function candidatesFor(state: CareerState, club: Club, includePlayer: boolean): Candidate[] {
  const out: Candidate[] = [];
  for (const id of club.squadIds) {
    const npc = state.world.npcPlayers[id];
    if (!npc) continue;
    if (npc.injury && npc.injury.daysRemaining > 0) continue;
    if (npc.suspensionMatches > 0) continue;
    out.push({ id: npc.id, position: npc.identity.position, overall: npc.overall, form: npc.form, fitness: npc.fitness, leadership: npc.attributes.leadership });
  }
  if (includePlayer) {
    const p = state.player;
    out.push({ id: p.id, position: p.identity.position, overall: p.overall, form: p.form, fitness: p.fitness, leadership: p.attributes.leadership });
  }
  return out;
}

function scoreFor(c: Candidate, slot: Position): number {
  const compat = positionCompatibility(c.position, slot);
  const formFactor = 1 + 0.02 * c.form;
  const fitnessFactor = 0.85 + 0.15 * (c.fitness / 100);
  return c.overall * compat * formFactor * fitnessFactor;
}

/** Onze + banc : le joueur forcé (convoqué) prend le slot où il est le plus compatible, le reste au meilleur score. */
function pickEleven(pool: Candidate[], slots: Position[], forcedId: Id | undefined): { starters: Candidate[]; rest: Candidate[] } {
  const used = new Set<Id>();
  const starters: (Candidate | undefined)[] = new Array(slots.length).fill(undefined);
  const forced = forcedId ? pool.find((c) => c.id === forcedId) : undefined;
  if (forced) {
    let bestSlot = 0;
    let bestCompat = -1;
    slots.forEach((slot, i) => {
      const compat = positionCompatibility(forced.position, slot);
      if (compat > bestCompat) { bestCompat = compat; bestSlot = i; }
    });
    starters[bestSlot] = forced;
    used.add(forced.id);
  }
  slots.forEach((slot, i) => {
    if (starters[i]) return;
    let best: Candidate | undefined;
    let bestScore = -Infinity;
    for (const c of pool) {
      if (used.has(c.id)) continue;
      const s = scoreFor(c, slot);
      if (s > bestScore) { best = c; bestScore = s; }
    }
    if (best) { starters[i] = best; used.add(best.id); }
  });
  const starterList = starters.filter((c): c is Candidate => c !== undefined);
  const rest = pool.filter((c) => !used.has(c.id));
  return { starters: starterList, rest };
}

function buildLineup(state: CareerState, club: Club, forcedPlayerId: Id | undefined): Lineup {
  const name = hasFormation(club.tactic.formation) ? club.tactic.formation : FALLBACK_FORMATION;
  const slots = formation(name).slots;
  const pool = candidatesFor(state, club, forcedPlayerId !== undefined);
  const { starters, rest } = pickEleven(pool, slots, forcedPlayerId);
  const bench = rest
    .slice()
    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
    .slice(0, 7)
    .map((c) => c.id);
  const captainForced = forcedPlayerId && state.national.stage === 'capitaine' && starters.some((c) => c.id === forcedPlayerId);
  const bestLeader = starters.slice().sort((a, b) => b.leadership - a.leadership || a.id.localeCompare(b.id))[0];
  const captainId = captainForced ? forcedPlayerId! : (bestLeader?.id ?? club.captainId);
  return { formation: name, starters: starters.map((c) => c.id), bench, captainId };
}

/** Coach d'un club de sélection (sélectionneur), avec repli anonyme si absent (ne casse jamais un match). */
function coachOfClub(state: CareerState, club: Club): Coach {
  const npc = state.world.npcs[club.coachId];
  if (npc && npc.kind === 'coach') return npc as Coach;
  return {
    id: club.coachId, kind: 'coach', firstName: 'Le', lastName: 'Sélectionneur', nationality: club.country, birthDate: '1975-01-01', clubId: club.id,
    personality: { warmth: 50, severity: 50, volatility: 50, mediaHunger: 50, loyalty: 50, keywords: [] },
    voice: { gender: 'homme', ageBand: 'adulte', pitch: 1, rate: 1, timbre: 'neutre' },
    card: { summary: '', updatedOn: state.currentDate }, active: true, createdOn: state.currentDate, real: false,
    preferredTactic: club.tactic, youthTrust: 50, patience: 50, ability: club.prestige, contractEndsOn: '2035-06-30',
  };
}

/**
 * Contexte d'un match international : construit ses propres onzes (le
 * joueur incarné y est inséré de force côté de sa sélection s'il est
 * convoqué et disponible), puis se comporte comme n'importe quel
 * `MatchContext` pour `runMatchAuto` / `runBackgroundMatch`.
 */
export function buildInternationalMatchContext(state: CareerState, match: Match, mode: 'auto' | 'interactif'): MatchContext {
  const home = state.world.clubs[match.homeClubId];
  const away = state.world.clubs[match.awayClubId];
  if (!home || !away) throw new Error(`Clubs de sélection inconnus pour le match ${match.id}`);

  const playerSide: 'home' | 'away' | undefined = home.country === state.national.countryCode
    ? 'home'
    : away.country === state.national.countryCode ? 'away' : undefined;
  const called = playerSide !== undefined && isPlayerCalledUp(state, state.national.countryCode);
  const forcedId = called ? state.player.id : undefined;

  const homeLineup = buildLineup(state, home, playerSide === 'home' ? forcedId : undefined);
  const awayLineup = buildLineup(state, away, playerSide === 'away' ? forcedId : undefined);

  const roster: MatchContext['roster'] = {};
  for (const id of [...home.squadIds, ...away.squadIds]) {
    const npc = state.world.npcPlayers[id];
    if (npc) roster[id] = npc;
  }
  const player = called ? state.player : undefined;
  const difficulty = difficultyProfile(state.settings.difficulty);
  const ctx: MatchContext = {
    match,
    seed: state.seed,
    home: { club: home, coach: coachOfClub(state, home), lineup: homeLineup, strength: { attack: 50, midfield: 50, defense: 50, goalkeeper: 50, overall: 50, pressing: 0.5, pace: 50 } },
    away: { club: away, coach: coachOfClub(state, away), lineup: awayLineup, strength: { attack: 50, midfield: 50, defense: 50, goalkeeper: 50, overall: 50, pressing: 0.5, pace: 50 } },
    roster,
    player,
    playerSide: player ? playerSide : undefined,
    difficulty,
    mode,
    playerLeagueReputation: state.reputation.nationalTeam.value,
  };
  const map = footballerMap(ctx);
  ctx.home.strength = computeTeamStrength(homeLineup, map, home.tactic, ctx.home.coach, !match.neutralVenue);
  ctx.away.strength = computeTeamStrength(awayLineup, map, away.tactic, ctx.away.coach, false);
  return ctx;
}
