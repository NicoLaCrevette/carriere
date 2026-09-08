/**
 * Formations disponibles pour les coachs et l'équipe type.
 * Chaque formation compte 11 slots, gardien en premier, exprimés avec les
 * 10 postes du jeu (les pistons d'une défense à trois sont des DD/DG).
 */
import type { Position } from '../types';

export interface Formation {
  name: string;
  /** 11 postes, GB en premier. */
  slots: Position[];
}

export const FORMATIONS: Record<string, Formation> = {
  '4-3-3': { name: '4-3-3', slots: ['GB', 'DD', 'DC', 'DC', 'DG', 'MDC', 'MC', 'MC', 'AID', 'BU', 'AIG'] },
  '4-2-3-1': { name: '4-2-3-1', slots: ['GB', 'DD', 'DC', 'DC', 'DG', 'MDC', 'MDC', 'AID', 'MOC', 'AIG', 'BU'] },
  '4-4-2': { name: '4-4-2', slots: ['GB', 'DD', 'DC', 'DC', 'DG', 'AID', 'MC', 'MC', 'AIG', 'BU', 'BU'] },
  '3-5-2': { name: '3-5-2', slots: ['GB', 'DC', 'DC', 'DC', 'DD', 'MDC', 'MC', 'MC', 'DG', 'BU', 'BU'] },
  '3-4-3': { name: '3-4-3', slots: ['GB', 'DC', 'DC', 'DC', 'DD', 'MC', 'MC', 'DG', 'AID', 'BU', 'AIG'] },
  '5-3-2': { name: '5-3-2', slots: ['GB', 'DD', 'DC', 'DC', 'DC', 'DG', 'MDC', 'MC', 'MC', 'BU', 'BU'] },
  '4-1-4-1': { name: '4-1-4-1', slots: ['GB', 'DD', 'DC', 'DC', 'DG', 'MDC', 'AID', 'MC', 'MC', 'AIG', 'BU'] },
  '4-3-1-2': { name: '4-3-1-2', slots: ['GB', 'DD', 'DC', 'DC', 'DG', 'MDC', 'MC', 'MC', 'MOC', 'BU', 'BU'] },
};

export const FORMATION_NAMES: readonly string[] = Object.keys(FORMATIONS);

/** Formation par son nom. Lève si inconnue. */
export function formation(name: string): Formation {
  const f = FORMATIONS[name];
  if (!f) throw new Error(`Formation inconnue : « ${name} » (connues : ${FORMATION_NAMES.join(', ')})`);
  return f;
}

/** Vrai si la formation existe. */
export function hasFormation(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(FORMATIONS, name);
}

/** Nombre de slots d'un poste dans une formation. */
export function slotsForPosition(name: string, position: Position): number {
  return formation(name).slots.filter((p) => p === position).length;
}
