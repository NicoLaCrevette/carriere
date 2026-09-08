/**
 * Score de sélection d'un joueur pour un poste, vu par le coach IA :
 * note × compatibilité de poste × forme × fitness × (confiance du coach pour
 * le joueur incarné). Partagé par la composition du onze et la hiérarchie.
 */
import type { CareerState, Club, Coach, Id, ISODate, Match, Position } from '../types';
import { BALANCE } from '../config/balance';
import { positionCompatibility } from '../config/positions';
import { ageAt } from '../calendar/dates';

/** Vue uniforme d'un joueur de l'effectif (PNJ ou joueur incarné). */
export interface Candidate {
  id: Id;
  position: Position;
  secondaryPositions: Position[];
  overall: number;
  form: number;
  fitness: number;
  age: number;
  leadership: number;
  /** Ni blessé ni suspendu pour ce match. */
  available: boolean;
  isPlayer: boolean;
  /** Confiance du coach 0-100 (joueur incarné) ; les PNJ ont une valeur implicite. */
  coachTrust: number;
}

export interface ScoringContext {
  coach: Coach | undefined;
  hierarchy: Club['positionHierarchy'];
}

const L = BALANCE.coach.lineup;

/** Compatibilité effective d'un candidat avec un poste (poste secondaire déclaré ≥ 0.92). */
export function candidateCompat(c: Candidate, slot: Position): number {
  const base = positionCompatibility(c.position, slot);
  return c.secondaryPositions.includes(slot) ? Math.max(base, L.secondaryPositionCompat) : base;
}

/** Bonus jeunes : ± youthBonusMax points selon la confiance du coach envers les jeunes. */
function youthBonus(c: Candidate, coach: Coach | undefined): number {
  if (!coach || c.age > BALANCE.endOfSeason.youngPlayerMaxAge) return 0;
  return BALANCE.coach.youthBonusMax * (coach.youthTrust - 50) / 50;
}

/** Le titulaire installé au poste (premier de la hiérarchie) garde une avance (§6.5). */
function incumbentBonus(c: Candidate, slot: Position, hierarchy: Club['positionHierarchy']): number {
  return hierarchy[slot]?.[0] === c.id ? BALANCE.coach.incumbentBonus : 0;
}

/** Score de sélection d'un candidat pour un poste (plus haut = préféré). */
/** Points de note perdus par le joueur incarné faute de confiance du coach (0 à 100 → maxPenalty à 0). */
export function trustPenalty(c: Candidate): number {
  if (!c.isPlayer) return 0;
  const trust = Math.min(100, Math.max(0, c.coachTrust));
  return L.playerTrust.maxPenalty * (1 - trust / 100);
}

export function selectionScore(c: Candidate, slot: Position, ctx: ScoringContext): number {
  const overall = c.overall + youthBonus(c, ctx.coach) + incumbentBonus(c, slot, ctx.hierarchy) - trustPenalty(c);
  const formFactor = 1 + c.form * L.formPerPoint;
  const fitnessFactor = 1 - L.fitnessWeight + L.fitnessWeight * c.fitness / 100;
  return overall * candidateCompat(c, slot) * formFactor * fitnessFactor;
}

/** Vrai si le joueur incarné est indisponible pour ce match (blessure active ou suspension dans la compétition). */
function playerAvailable(state: CareerState, match: Match): boolean {
  const player = state.player;
  if (player.injuries.some((i) => i.daysRemaining > 0)) return false;
  return (player.suspensions[match.competitionId] ?? 0) <= 0;
}

/** Candidats de l'effectif d'un club (PNJ + joueur incarné s'il y joue), disponibilité évaluée pour `match`. */
export function buildCandidates(state: CareerState, clubId: Id, match: Match, date: ISODate): Candidate[] {
  const club = state.world.clubs[clubId];
  if (!club) throw new Error(`Club inconnu : ${clubId}`);
  const out: Candidate[] = [];
  for (const id of club.squadIds) {
    const npc = state.world.npcPlayers[id];
    if (!npc) continue;
    const injured = npc.injury !== undefined && npc.injury.daysRemaining > 0;
    out.push({
      id: npc.id,
      position: npc.identity.position,
      secondaryPositions: npc.identity.secondaryPositions,
      overall: npc.overall,
      form: npc.form,
      fitness: npc.fitness,
      age: ageAt(npc.identity.birthDate, date),
      leadership: npc.attributes.leadership,
      available: !injured && npc.suspensionMatches <= 0,
      isPlayer: false,
      coachTrust: BALANCE.coach.npcTrustDefault,
    });
  }
  const player = state.player;
  if (player.contract.clubId === clubId) {
    out.push({
      id: player.id,
      position: player.identity.position,
      secondaryPositions: player.identity.secondaryPositions,
      overall: player.overall,
      form: player.form,
      fitness: player.fitness,
      age: ageAt(player.identity.birthDate, date),
      leadership: player.attributes.leadership,
      available: playerAvailable(state, match),
      isPlayer: true,
      coachTrust: player.coachTrust,
    });
  }
  return out;
}
