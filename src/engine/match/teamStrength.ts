/**
 * Forces d'équipe (attaque, milieu, défense, gardien) dérivées du onze, de la
 * tactique, du coach et de l'avantage du terrain. Accès uniforme aux joueurs
 * (incarné ou PNJ) via `Footballer`.
 */
import type { Attributes, Coach, Id, Identity, Lineup, MatchContext, Position, Tactic, TeamStrength } from '../types';
import { BALANCE } from '../config/balance';
import { positionCompatibility, positionProfile } from '../config/positions';
import { clamp, slotPositions } from './matchEvents';

export interface Footballer {
  id: Id;
  attributes: Attributes;
  overall: number;
  position: Position;
  identity: Identity;
  fitness: number;
  form: number;
}

const TS = BALANCE.matchSim.teamStrength;
const SW = BALANCE.matchSim.strengthWeights;

/** Accès uniforme joueur incarné / PNJ. Lève si l'id est inconnu. */
export function getFootballer(ctx: MatchContext, id: Id): Footballer {
  if (ctx.player && ctx.player.id === id) {
    const p = ctx.player;
    return { id: p.id, attributes: p.attributes, overall: p.overall, position: p.identity.position, identity: p.identity, fitness: p.fitness, form: p.form };
  }
  const npc = ctx.roster[id];
  if (!npc) throw new Error(`Joueur inconnu dans le match : ${id}`);
  return { id: npc.id, attributes: npc.attributes, overall: npc.overall, position: npc.identity.position, identity: npc.identity, fitness: npc.fitness, form: npc.form };
}

/** Tous les joueurs du match (effectifs + joueur incarné) par id. */
export function footballerMap(ctx: MatchContext): Record<Id, Footballer> {
  const out: Record<Id, Footballer> = {};
  for (const id of Object.keys(ctx.roster)) out[id] = getFootballer(ctx, id);
  if (ctx.player) out[ctx.player.id] = getFootballer(ctx, ctx.player.id);
  return out;
}

/** Note effective d'un joueur à un slot : forme, fitness et poste secondaire. */
export function effectiveOverall(f: Footballer, slot: Position): number {
  const compat = positionCompatibility(f.position, slot);
  const malus = positionProfile(f.position).outOfPositionMalus * TS.outOfPositionScale * (1 - compat);
  const form = 1 + TS.formPerPoint * clamp(f.form, -5, 5);
  const fitness = 1 - TS.fitnessInfluence * (1 - clamp(f.fitness, 0, 100) / 100);
  return clamp(f.overall * (1 - malus) * form * fitness, 1, 99);
}

type Line = 'goalkeeper' | 'defense' | 'midfield' | 'attack';

function lineOf(p: Position): Line {
  if (p === 'GB') return 'goalkeeper';
  if (p === 'DC' || p === 'DD' || p === 'DG') return 'defense';
  if (p === 'MDC' || p === 'MC' || p === 'MOC') return 'midfield';
  return 'attack';
}

interface LineAccumulator { sum: number; weight: number }

function addTo(acc: LineAccumulator, value: number, weight: number): void {
  acc.sum += value * weight;
  acc.weight += weight;
}

function meanOf(acc: LineAccumulator): number {
  return acc.weight > 0 ? acc.sum / acc.weight : TS.emptyLineStrength;
}

/**
 * Force d'une équipe : moyennes par ligne des notes effectives (le MOC compte
 * pour moitié en attaque), mentalité, coach, avantage du terrain, équipe réduite.
 */
export function computeTeamStrength(
  lineup: Lineup,
  footballers: Record<Id, Footballer>,
  tactic: Tactic,
  coach: Coach,
  homeAdvantage: boolean,
): TeamStrength {
  const starters = lineup.starters.filter((id) => footballers[id]);
  const slots = slotPositions(lineup.formation, starters.length);
  const lines: Record<Line, LineAccumulator> = {
    goalkeeper: { sum: 0, weight: 0 }, defense: { sum: 0, weight: 0 }, midfield: { sum: 0, weight: 0 }, attack: { sum: 0, weight: 0 },
  };
  let paceSum = 0;
  let paceCount = 0;

  starters.forEach((id, i) => {
    const f = footballers[id]!;
    const slot = slots ? slots[i]! : f.position;
    const eff = effectiveOverall(f, slot);
    const line = lineOf(slot);
    if (slot === 'MOC') {
      addTo(lines.midfield, eff, 1 - TS.mocAttackShare);
      addTo(lines.attack, eff, TS.mocAttackShare);
    } else {
      addTo(lines[line], eff, 1);
    }
    if (line === 'attack' || line === 'midfield') {
      paceSum += (f.attributes.vitesse + f.attributes.acceleration) / 2;
      paceCount++;
    }
  });

  const shift = TS.mentalityShiftPoints[tactic.mentality] ?? 0;
  const coachFactor = 1 + BALANCE.matchSim.coachInfluence * ((coach.ability - 50) / 100);
  const missing = Math.max(0, 11 - starters.length);
  const reduced = Math.pow(TS.missingPlayerMalus, missing);
  const home = homeAdvantage ? BALANCE.matchSim.homeAdvantage.strengthBonus : 0;

  const finish = (v: number): number => clamp(v * coachFactor * reduced + home, 1, 99);
  const goalkeeper = finish(meanOf(lines.goalkeeper));
  const defense = finish(meanOf(lines.defense) - shift);
  const midfield = finish(meanOf(lines.midfield));
  const attack = finish(meanOf(lines.attack) + shift);
  const overall = clamp(attack * SW.attack + midfield * SW.midfield + defense * SW.defense + goalkeeper * SW.goalkeeper, 1, 99);
  const pressing = clamp(tactic.pressing * (TS.pressingFromMidfield.base + TS.pressingFromMidfield.share * midfield / 99), 0, 1);
  const pace = clamp(paceCount > 0 ? paceSum / paceCount : TS.emptyLineStrength, 1, 99);

  return { attack, midfield, defense, goalkeeper, overall, pressing, pace };
}

/** Recalcule la force d'un côté à partir du onze courant (après remplacement ou expulsion). */
export function refreshStrength(ctx: MatchContext, side: 'home' | 'away', lineup: Lineup): void {
  const footballers = footballerMap(ctx);
  const s = ctx[side];
  const home = side === 'home' && !ctx.match.neutralVenue;
  s.strength = computeTeamStrength(lineup, footballers, s.club.tactic, s.coach, home);
}
