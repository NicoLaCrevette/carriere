import type { CareerState, Match } from '../../engine/types';
import { formatDateFrShort } from '../../engine/calendar/dates';

interface NextMatchCardProps {
  match: Match | null;
  career: CareerState;
  compact?: boolean;
}

/** Prochain match du joueur : adversaire, domicile/extérieur, date. */
export default function NextMatchCard({ match, career, compact }: NextMatchCardProps) {
  if (!match) {
    return <p className="text-xs text-muted uppercase tracking-wide">Aucun match programmé pour l'instant.</p>;
  }
  const clubId = career.player.contract.clubId;
  const home = career.world.clubs[match.homeClubId];
  const away = career.world.clubs[match.awayClubId];
  const atHome = match.homeClubId === clubId;
  const opponent = atHome ? away : home;
  const competition = career.world.competitions[match.competitionId];

  return (
    <div className={`flex items-center gap-3 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className="uppercase tracking-wide text-muted">Prochain match</span>
      <span className="font-display uppercase tracking-wide text-white">
        {atHome ? 'vs' : '@'} {opponent?.name ?? '—'}
      </span>
      <span className="text-muted">{competition?.shortName ?? ''}</span>
      <span className="text-accent">{formatDateFrShort(match.date)}</span>
      {match.importance >= 70 && <span className="text-signal-red uppercase text-[10px]">Enjeu élevé</span>}
    </div>
  );
}
