/**
 * Persistance IndexedDB via Dexie (§13, §6.7) : un slot de sauvegarde par
 * carrière, écrasé à chaque fin de journée, plus les jeux de données importés
 * par l'utilisateur. `careerJson` est un `JSON.stringify(CareerState)` pour
 * rester sous la limite de clonage structuré d'IndexedDB avec de gros objets.
 */
import Dexie, { type Table } from 'dexie';
import type { CareerState, Position } from '../engine/types';
import { ageAt } from '../engine/calendar/dates';

export interface SaveSlot {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  summary: {
    playerName: string;
    clubName: string;
    season: string;
    date: string;
    age: number;
    overall: number;
    position: Position;
    sandbox: boolean;
  };
  /** CareerState sérialisé (JSON.stringify) pour rester sous la limite structurée d'IndexedDB. */
  careerJson: string;
}

export interface UserDataset {
  id: string;
  label: string;
  json: string;
  importedAt: string;
  /** Renseignés depuis l'ajout de ces colonnes ; absents sur les imports plus anciens. */
  realNames?: boolean;
  referenceSeason?: string;
}

export class CarriereDb extends Dexie {
  saves!: Table<SaveSlot, string>;
  datasets!: Table<UserDataset, string>;

  constructor() {
    super('carriere');
    this.version(1).stores({
      saves: 'id, updatedAt',
      datasets: 'id, importedAt',
    });
  }
}

export const db = new CarriereDb();

export async function listSlots(): Promise<Omit<SaveSlot, 'careerJson'>[]> {
  const all = await db.saves.orderBy('updatedAt').reverse().toArray();
  return all.map(({ careerJson: _careerJson, ...rest }) => rest);
}

export async function loadSlot(id: string): Promise<CareerState | null> {
  const slot = await db.saves.get(id);
  if (!slot) return null;
  return JSON.parse(slot.careerJson) as CareerState;
}

function summaryFor(state: CareerState): SaveSlot['summary'] {
  const club = state.world.clubs[state.player.contract.clubId];
  return {
    playerName: `${state.player.identity.firstName} ${state.player.identity.lastName}`,
    clubName: club?.name ?? '—',
    season: state.season.label,
    date: state.currentDate,
    age: ageAt(state.player.identity.birthDate, state.currentDate),
    overall: state.player.overall,
    position: state.player.identity.position,
    sandbox: state.settings.sandbox,
  };
}

/** Écrase (ou crée) le slot `id` avec l'état courant. Une seule sauvegarde active par carrière (§6.7). */
export async function saveSlot(id: string, state: CareerState): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.saves.get(id);
  const club = state.world.clubs[state.player.contract.clubId];
  const slot: SaveSlot = {
    id,
    name: `${state.player.identity.firstName} ${state.player.identity.lastName} — ${club?.name ?? 'sans club'}`,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    summary: summaryFor(state),
    careerJson: JSON.stringify(state),
  };
  await db.saves.put(slot);
}

export async function deleteSlot(id: string): Promise<void> {
  await db.saves.delete(id);
}

export async function exportSlot(id: string): Promise<Blob> {
  const slot = await db.saves.get(id);
  if (!slot) throw new Error('Sauvegarde introuvable.');
  return new Blob([slot.careerJson], { type: 'application/json' });
}

/** Importe une sauvegarde exportée. Valide un minimum de forme, migre si besoin (aucune migration pour l'instant). */
export async function importSlot(json: string): Promise<SaveSlot> {
  let state: CareerState;
  try {
    state = JSON.parse(json) as CareerState;
  } catch {
    throw new Error('Fichier JSON illisible.');
  }
  if (typeof state.schemaVersion !== 'number' || !state.player || !state.world) {
    throw new Error('Fichier de sauvegarde invalide : structure inattendue.');
  }
  const id = state.careerId || (globalThis.crypto?.randomUUID?.() ?? `import-${Date.now()}`);
  await saveSlot(id, state);
  const slot = await db.saves.get(id);
  if (!slot) throw new Error("Échec de l'import.");
  return slot;
}
