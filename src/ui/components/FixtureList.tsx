import type { Club, Id, Match } from '../../engine/types';
import { formatDateFrShort } from '../../engine/calendar/dates';
import NumberTabular from './NumberTabular';

interface FixtureListProps {
  matches: Match[];
  clubs: Record<Id, Club>;
  highlightClubId?: Id;
}

/** Une journée de championnat : matchs joués (score) et à venir (date). */
export default function FixtureList({ matches, clubs, highlightClubId }: FixtureListProps) {
  if (matches.length === 0) return <p className="text-sm text-broadcast-grey">Aucun match cette journée.</p>;
  return (
    <ul className="divide-y divide-pitch-800 text-sm">
      {matches.map((m) => {
        const home = clubs[m.homeClubId];
        const away = clubs[m.awayClubId];
        const involves = m.homeClubId === highlightClubId || m.awayClubId === highlightClubId;
        return (
          <li key={m.id} className={`flex items-center justify-between py-1.5 ${involves ? 'text-broadcast-yellow' : ''}`}>
            <span className="font-display uppercase tracking-wide truncate">
              {home?.shortName ?? m.homeClubId} <span className="text-broadcast-grey">vs</span> {away?.shortName ?? m.awayClubId}
            </span>
            {m.result ? (
              <NumberTabular value={`${m.result.homeGoals} - ${m.result.awayGoals}`} className="font-semibold" />
            ) : (
              <span className="text-broadcast-grey">{formatDateFrShort(m.date)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
