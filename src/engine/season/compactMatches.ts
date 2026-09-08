/**
 * Compression des matchs déjà joués (taille de la sauvegarde).
 *
 * Une carrière dure 15 à 20 saisons, soit plus de 6 000 matchs de
 * championnat stockés dans `state.matches`. Le flux minute par minute
 * (`result.events`) et les compositions ne servent qu'au moment du match :
 * une fois le résultat appliqué au monde (classement, statistiques des PNJ),
 * seul le score compte pour un match d'un autre club. On garde en revanche le
 * rapport du joueur (`playerReport`) pour toujours, et son flux d'événements
 * pour les matchs les plus récents, que l'écran Match affiche encore.
 *
 * Sans cela, une sauvegarde atteint des dizaines de mégaoctets et chaque
 * journée (qui clone puis sérialise tout l'état) devient lente.
 */
import type { CareerState, Match } from '../types';
import { BALANCE } from '../config/balance';
import { compareDates } from '../calendar/dates';

/**
 * Réduit un match d'un autre club à son score : plus aucun module ne lit son
 * flux ni ses compositions une fois `applyMatchToWorld` terminé.
 */
export function compactBackgroundMatch(match: Match): void {
  const result = match.result;
  if (!result || result.playerReport) return;
  result.events = [];
  result.summaryLines = [];
  result.lineups.home.starters = [];
  result.lineups.home.bench = [];
  result.lineups.away.starters = [];
  result.lineups.away.bench = [];
}

/**
 * Ne conserve le détail d'affichage (flux d'événements, décisions prises,
 * journal de la note) que pour les derniers matchs du joueur. Les plus
 * anciens gardent tout ce que le moteur et les écrans relisent ensuite :
 * score, note, statistiques, évaluation, homme du match, titres de presse.
 * Renvoie le nombre de matchs allégés.
 */
export function compactOldPlayerMatches(state: CareerState): number {
  const keep = BALANCE.career.saves.keepMatchFeedForLastPlayerMatches;
  const played = Object.values(state.matches)
    .filter((m) => m.status === 'joue' && m.result?.playerReport)
    .sort((a, b) => compareDates(b.date, a.date) || b.id.localeCompare(a.id));
  let compacted = 0;
  for (const match of played.slice(keep)) {
    const result = match.result!;
    const report = result.playerReport!;
    if (result.events.length === 0 && result.summaryLines.length === 0 && report.decisions.length === 0 && report.ratingLog.length === 0) continue;
    result.events = [];
    result.summaryLines = [];
    report.decisions = [];
    report.ratingLog = [];
    compacted += 1;
  }
  return compacted;
}
