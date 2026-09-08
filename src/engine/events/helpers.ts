/**
 * Petites aides partagées par `events/catalogue.ts` : PNJ créés à la volée
 * (frère/sœur, partenaire, ami, contact sponsor…) pour les catégories qui
 * n'ont pas de PNJ dédié posé par `career/newCareer.createInitialNpcs`
 * (agent, journaliste local, mère, capitaine, coach du club — ceux-là sont
 * réutilisés par leur id stable directement dans le catalogue).
 */
import type { CareerState, Id, Npc, NpcKind } from '../types';
import type { Rng } from '../rng/mulberry32';
import { generateName } from '../world/names';
import { randomBirthDate } from '../world/generateSquad';

const TIMBRES = ['voix posée', 'voix calme', 'voix vive', 'voix chaleureuse', 'voix un peu bourrue'] as const;

/** PNJ léger créé une seule fois sous un id stable (idempotent), pour un interlocuteur récurrent. */
export function ensureEventNpc(state: CareerState, id: Id, kind: NpcKind, age: number, summary: string, rng: Rng): Npc {
  const existing = state.world.npcs[id];
  if (existing) return existing;
  const nationality = state.player.identity.nationality;
  const name = generateName(rng, nationality);
  const npc: Npc = {
    id,
    kind,
    firstName: name.firstName,
    lastName: name.lastName,
    nationality,
    birthDate: randomBirthDate(rng, age, state.currentDate),
    personality: { warmth: rng.int(30, 80), severity: rng.int(30, 80), volatility: rng.int(30, 80), mediaHunger: rng.int(20, 80), loyalty: rng.int(30, 80), keywords: [] },
    voice: { gender: rng.chance(0.5) ? 'homme' : 'femme', ageBand: age < 30 ? 'jeune' : age < 55 ? 'adulte' : 'senior', pitch: 1, rate: 1, timbre: rng.pick(TIMBRES) },
    card: { summary, updatedOn: state.currentDate },
    active: true,
    createdOn: state.currentDate,
    real: false,
  };
  state.world.npcs[id] = npc;
  return npc;
}

/** Id du club du joueur, pratique dans les `facts()`/`immediate()` du catalogue. */
export function playerClub(state: CareerState) {
  return state.world.clubs[state.player.contract.clubId];
}
