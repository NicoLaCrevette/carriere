/**
 * Seul point d'entrée pour appliquer des deltas venant du LLM ou des
 * événements : bornes, journal, mémoire. Le LLM n'a aucun droit d'écriture
 * direct sur l'état (§6.2) ; tout passe ici et tout est borné.
 */
import type {
  CareerLogEntry, CareerState, InteractionChannel, MemoryEntry, Relationship, RelationshipDelta, ReputationDeltas,
} from '../types';
import { BALANCE } from '../config/balance';
import { applyReputationDeltas } from '../reputation/reputation';

export interface EngineDeltas {
  reputation?: ReputationDeltas;
  relationships?: RelationshipDelta[];
  memory?: Omit<MemoryEntry, 'id'>[];
  log?: Omit<CareerLogEntry, 'date'>[];
  morale?: number;
  /** Canal de l'interaction à l'origine des deltas de relation (défaut : « terrain »). */
  channel?: InteractionChannel;
}

/** Borne v dans [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return v < min ? min : v > max ? max : v;
}

/** Ajoute une entrée datée au journal de carrière (plafonné : les plus anciennes sortent). */
export function addLog(state: CareerState, category: CareerLogEntry['category'], text: string): void {
  state.log.push({ date: state.currentDate, category, text });
  const max = BALANCE.career.logMaxEntries;
  if (state.log.length > max) state.log.splice(0, state.log.length - max);
}

/** Relation existante ou neuve (0/0) avec un PNJ. */
function relationshipWith(state: CareerState, npcId: string): Relationship {
  let rel = state.relationships[npcId];
  if (!rel) {
    rel = { npcId, trust: 0, respect: 0, history: [] };
    state.relationships[npcId] = rel;
  }
  return rel;
}

function applyRelationshipDelta(state: CareerState, delta: RelationshipDelta, channel: InteractionChannel): void {
  const max = BALANCE.career.deltaBounds.relationshipPerInteraction;
  const { min, max: top } = BALANCE.bounds.relation;
  const rel = relationshipWith(state, delta.npcId);
  const dTrust = clamp(delta.trust, -max, max);
  const dRespect = clamp(delta.respect, -max, max);
  const newTrust = clamp(rel.trust + dTrust, min, top);
  const newRespect = clamp(rel.respect + dRespect, min, top);
  rel.history.push({
    date: state.currentDate,
    channel,
    summary: delta.reason,
    deltaTrust: newTrust - rel.trust,
    deltaRespect: newRespect - rel.respect,
  });
  rel.trust = newTrust;
  rel.respect = newRespect;
}

/** Ajoute un souvenir narratif avec un identifiant unique et stable. */
export function addMemory(state: CareerState, entry: Omit<MemoryEntry, 'id'>): MemoryEntry {
  const id = `mem-${state.memory.length + 1}-${entry.date}`;
  const memory: MemoryEntry = { id, ...entry };
  state.memory.push(memory);
  return memory;
}

/** Applique des deltas bornés : réputation (±5/±12), relations, mémoire, journal, moral. Mute state. */
export function applyDeltas(state: CareerState, deltas: EngineDeltas, reason: string): void {
  if (deltas.reputation) applyReputationDeltas(state, deltas.reputation, reason);
  const channel = deltas.channel ?? 'terrain';
  // Les deltas visant un même PNJ sont additionnés AVANT d'être bornés : sinon dix petites
  // consequences successives déplaceraient une relation bien au-delà de la borne par interaction (§6.2).
  const parNpc = new Map<string, RelationshipDelta>();
  for (const delta of deltas.relationships ?? []) {
    const cumul = parNpc.get(delta.npcId);
    if (cumul) {
      cumul.trust += delta.trust;
      cumul.respect += delta.respect;
    } else {
      parNpc.set(delta.npcId, { ...delta });
    }
  }
  for (const delta of parNpc.values()) applyRelationshipDelta(state, delta, channel);
  for (const entry of deltas.memory ?? []) addMemory(state, entry);
  for (const entry of deltas.log ?? []) addLog(state, entry.category, entry.text);
  if (deltas.morale !== undefined && Number.isFinite(deltas.morale)) {
    const max = BALANCE.career.deltaBounds.moralePerCall;
    const { min, max: top } = BALANCE.bounds.gauge;
    state.player.morale = clamp(state.player.morale + clamp(deltas.morale, -max, max), min, top);
  }
}
