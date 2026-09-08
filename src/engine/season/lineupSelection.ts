/**
 * Le coach IA compose le onze et le banc : formation du coach, meilleurs au
 * poste (note × compatibilité × forme × fitness × confiance pour le joueur
 * incarné), blessés et suspendus exclus, rotation légère en cas de
 * calendrier chargé. Le joueur incarné est traité comme les autres via
 * coachTrust et la hiérarchie (§6.5 : concurrent meilleur au départ).
 */
import type { CareerState, Club, Coach, Id, Lineup, Match, Position } from '../types';
import { POSITIONS } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { formation, hasFormation } from '../config/formations';
import { diffDays } from '../calendar/dates';
import { buildCandidates, candidateCompat, selectionScore, type Candidate, type ScoringContext } from './lineupScore';

export { updateCoachTrust, shouldSubOff, weeklyCoachTrustDrift } from './coachReaction';

const L = BALANCE.coach.lineup;
const FALLBACK_FORMATION = '4-3-3';

function coachOfClub(state: CareerState, club: Club): Coach | undefined {
  const npc = state.world.npcs[club.coachId];
  return npc && npc.kind === 'coach' ? (npc as Coach) : undefined;
}

/** Formation préférée du coach, sinon celle du club, sinon 4-3-3. */
function formationFor(club: Club, coach: Coach | undefined): string {
  const wanted = coach?.preferredTactic.formation ?? club.tactic.formation;
  return hasFormation(wanted) ? wanted : FALLBACK_FORMATION;
}

/** Meilleur candidat libre pour un poste, ou undefined. */
function bestFor(slot: Position, pool: Candidate[], used: Set<Id>, ctx: ScoringContext): Candidate | undefined {
  let best: Candidate | undefined;
  let bestScore = -Infinity;
  for (const c of pool) {
    if (used.has(c.id)) continue;
    const s = selectionScore(c, slot, ctx);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return best;
}

/** Nombre de matchs du club joués dans les `days` jours précédant `date`, celui du jour inclus. */
function matchesInWindow(state: CareerState, clubId: Id, date: string, days: number): number {
  let count = 1;
  for (const m of Object.values(state.matches)) {
    if (m.status !== 'joue' || (m.homeClubId !== clubId && m.awayClubId !== clubId)) continue;
    const gap = diffDays(m.date, date);
    if (gap > 0 && gap <= days) count += 1;
  }
  return count;
}

/** Rotation légère : un titulaire fatigué souffle si un remplaçant crédible existe. */
function applyRotation(
  slots: Position[], starters: (Candidate | undefined)[], pool: Candidate[], used: Set<Id>,
  ctx: ScoringContext, congested: boolean, rng: Rng,
): void {
  const prob = congested ? L.congestion.restProb : BALANCE.coach.rotationProb;
  slots.forEach((slot, i) => {
    const starter = starters[i];
    if (!starter || starter.fitness >= BALANCE.coach.rotationFitnessBelow) return;
    if (!rng.chance(prob)) return;
    const sub = bestFor(slot, pool, used, ctx);
    if (!sub) return;
    if (selectionScore(sub, slot, ctx) < selectionScore(starter, slot, ctx) * L.rotationMinScoreRatio) return;
    used.delete(starter.id);
    used.add(sub.id);
    starters[i] = sub;
  });
}

/** Utilité d'un remplaçant : meilleur score parmi les postes de la formation. */
function benchUtility(c: Candidate, slots: Position[], ctx: ScoringContext): number {
  return Math.max(...slots.map((slot) => selectionScore(c, slot, ctx)));
}

/**
 * Banc de 9 : un gardien garanti, puis une couverture par poste de la
 * formation (le meilleur remplaçant de chaque poste, comme un vrai coach qui
 * emmène un attaquant de rechange), puis les meilleurs restants. Joueur
 * incarné en tribune sous le seuil de confiance.
 */
function pickBench(pool: Candidate[], used: Set<Id>, slots: Position[], ctx: ScoringContext, coachTrust: number): Id[] {
  const rest = pool
    .filter((c) => !used.has(c.id) && !(c.isPlayer && coachTrust < BALANCE.coach.tribuneBelowTrust))
    .sort((a, b) => benchUtility(b, slots, ctx) - benchUtility(a, slots, ctx) || a.id.localeCompare(b.id));
  const bench: Candidate[] = [];
  const take = (c: Candidate | undefined): void => {
    if (c && !bench.includes(c) && bench.length < L.benchSize) bench.push(c);
  };
  take(rest.find((c) => c.position === 'GB'));
  // Un jeune que le coach veut faire progresser est dans le groupe dès que sa confiance dépasse le seuil.
  take(rest.find((c) => c.isPlayer && c.coachTrust >= L.playerBenchTrustFrom));
  for (const slot of new Set(slots)) {
    if (slot === 'GB') continue;
    take(rest.find((c) => c.position === slot && !bench.includes(c)));
  }
  for (const c of rest) take(c);
  return bench.map((c) => c.id);
}

/** Capitaine du club s'il est titulaire, sinon le titulaire au plus fort leadership. */
function pickCaptain(club: Club, starters: Candidate[]): Id {
  if (starters.some((c) => c.id === club.captainId)) return club.captainId;
  const leader = starters.slice().sort((a, b) => b.leadership - a.leadership || a.id.localeCompare(b.id))[0];
  return leader ? leader.id : club.captainId;
}

/** Compose le onze et le banc d'un club pour un match. */
export function pickLineup(state: CareerState, clubId: Id, match: Match, rng: Rng): Lineup {
  const club = state.world.clubs[clubId];
  if (!club) throw new Error(`Club inconnu : ${clubId}`);
  const coach = coachOfClub(state, club);
  const name = formationFor(club, coach);
  const slots = formation(name).slots;
  const ctx: ScoringContext = { coach, hierarchy: club.positionHierarchy };
  const pool = buildCandidates(state, clubId, match, match.date).filter((c) => c.available);
  const used = new Set<Id>();
  const starters: (Candidate | undefined)[] = slots.map((slot) => {
    const best = bestFor(slot, pool, used, ctx);
    if (best) used.add(best.id);
    return best;
  });

  const congested = matchesInWindow(state, clubId, match.date, L.congestion.days) >= L.congestion.matches;
  applyRotation(slots, starters, pool, used, ctx, congested, rng);

  const eleven = starters.filter((c): c is Candidate => c !== undefined);
  return {
    formation: name,
    starters: eleven.map((c) => c.id),
    bench: pickBench(pool, used, slots, ctx, state.player.coachTrust),
    captainId: pickCaptain(club, eleven),
  };
}

/** Statut du joueur pour ce match, dérivé du onze. */
export function playerStatus(lineup: Lineup, playerId: Id): 'titulaire' | 'banc' | 'tribune' {
  if (lineup.starters.includes(playerId)) return 'titulaire';
  if (lineup.bench.includes(playerId)) return 'banc';
  return 'tribune';
}

/**
 * Hiérarchie par poste du club (ids triés par score de sélection, blessés
 * compris), joueur incarné inclus. Écrit club.positionHierarchy. Le premier
 * de la hiérarchie précédente garde son avance de titulaire installé.
 */
export function updatePositionHierarchy(state: CareerState, clubId: Id): void {
  const club = state.world.clubs[clubId];
  if (!club) throw new Error(`Club inconnu : ${clubId}`);
  const coach = coachOfClub(state, club);
  const ctx: ScoringContext = { coach, hierarchy: club.positionHierarchy };
  const probe: Match = {
    id: `hierarchie-${state.currentDate}`, seasonId: state.season.id, competitionId: club.leagueId, date: state.currentDate,
    homeClubId: clubId, awayClubId: clubId, neutralVenue: false, status: 'a_venir', importance: 0, involvesPlayer: false,
  };
  const candidates = buildCandidates(state, clubId, probe, state.currentDate);
  const hierarchy: Club['positionHierarchy'] = {};
  for (const position of POSITIONS) {
    hierarchy[position] = candidates
      .filter((c) => candidateCompat(c, position) >= L.hierarchyMinCompat)
      .map((c) => ({ id: c.id, score: selectionScore(c, position, ctx) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .map((x) => x.id);
  }
  club.positionHierarchy = hierarchy;
}
