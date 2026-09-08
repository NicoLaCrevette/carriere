/**
 * Qui est concerné par un événement de match, en clair.
 *
 * Les deux identifiants d'un événement n'ont pas le même sens selon le type :
 * sur un but, `playerId` est le buteur et `secondaryPlayerId` le passeur ; sur
 * un remplacement, `playerId` est l'ENTRANT. Un simple « X → Y » se lisait donc
 * à l'envers une fois sur deux.
 */
import type { MatchEvent } from '../../engine/types';

export function acteursDe(e: MatchEvent, nomDe: (id: string) => string): string {
  const premier = e.playerId ? nomDe(e.playerId) : '';
  const second = e.secondaryPlayerId ? nomDe(e.secondaryPlayerId) : '';
  if (e.type === 'remplacement') {
    if (premier && second) return `${premier} entre à la place de ${second}`;
    return premier || second;
  }
  if (!second) return premier;
  if (!premier) return second;
  // But : le passeur est cité entre parenthèses, comme sur une feuille de match.
  if (e.type === 'but' || e.type === 'penalty_marque') return `${premier} (${second})`;
  return `${premier} → ${second}`;
}
