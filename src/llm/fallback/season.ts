/**
 * Résumé de saison de repli (sans LLM) : un paragraphe déterministe construit
 * depuis le bilan figé, plus les moments clés tirés des souvenirs.
 */
import type { CareerState, SeasonRecord } from '../../engine/types';
import type { SeasonSummary } from '../schemas';

export function fallbackSeasonSummary(state: CareerState, record: SeasonRecord): SeasonSummary {
  const p = state.player;
  const club = state.world.clubs[record.clubId]?.name ?? record.clubId;
  const s = record.stats.total;
  const role = s.starts >= 20 ? 'titulaire régulier' : s.starts >= 8 ? 'titulaire par intermittence' : s.matches >= 10 ? 'remplaçant souvent utilisé' : s.matches > 0 ? 'joueur de complément' : 'absent des terrains';
  const verdict = record.averageRating >= 7.2 ? 'une saison de premier plan' : record.averageRating >= 6.6 ? 'une bonne saison' : record.averageRating >= 6.2 ? 'une saison correcte' : record.averageRating > 0 ? 'une saison difficile' : 'une saison blanche';
  const trophies = record.trophies.length > 0 ? ` Le club a remporté : ${record.trophies.join(', ')}.` : '';
  const awards = record.awards.length > 0 ? ` Distinctions personnelles : ${record.awards.map((a) => a.kind).join(', ')}.` : '';
  const injuries = state.player.injuries.filter((i) => i.healedOn && i.healedOn >= state.season.startDate);
  const injuryLine = injuries.length > 0 ? ` La saison a été marquée par ${injuries.length} blessure(s), dont ${injuries.map((i) => `${i.type} (${i.actualDays} jours)`).join(', ')}.` : '';
  const summary = `Saison ${record.label} avec ${club} : ${p.identity.firstName} ${p.identity.lastName} a été ${role}, avec ${s.matches} matchs joués dont ${s.starts} titularisations, ${s.minutes} minutes, ${s.goals} buts et ${s.assists} passes décisives, pour une note moyenne de ${record.averageRating.toFixed(2)}. Le club a terminé ${record.leagueRank}e.${trophies}${awards} C'est ${verdict}.${injuryLine} Sa valeur marchande en fin de saison était de ${Math.round(record.marketValueEnd / 1000)} k€.`;
  const keyMoments = state.memory
    .filter((m) => m.date >= state.season.startDate && m.importance >= 3)
    .sort((a, b) => b.importance - a.importance || a.date.localeCompare(b.date))
    .slice(0, 5)
    .map((m) => `${m.date} : ${m.summary}`.slice(0, 160));
  return { summary: summary.slice(0, 1200), keyMoments };
}
