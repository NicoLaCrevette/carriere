import type { CareerState } from '../../engine/types';
import { formatDateFr } from '../../engine/calendar/dates';
import { selectFormLabel, selectNextMatch, selectPlayerAge, selectPlayerClub, selectPlayerMatchdayForClub } from '../../store/selectors';
import NumberTabular from './NumberTabular';
import ReputationStrip from './ReputationStrip';
import NextMatchCard from './NextMatchCard';

interface TopBarProps {
  career: CareerState;
}

/** Bandeau permanent (§4) : date, journée, prochain match, forme, condition, moral, note, réputation. */
export default function TopBar({ career }: TopBarProps) {
  const player = career.player;
  const club = selectPlayerClub(career);
  const matchday = selectPlayerMatchdayForClub(career);
  const nextMatch = selectNextMatch(career);
  const age = selectPlayerAge(career);

  return (
    <div className="border-b border-pitch-700 bg-pitch-900">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 text-sm">
        <div>
          <span className="text-broadcast-grey uppercase text-[11px] tracking-wide mr-2">{formatDateFr(career.currentDate)}</span>
          {matchday > 0 && (
            <span className="text-broadcast-grey uppercase text-[11px] tracking-wide">J{matchday}</span>
          )}
        </div>
        <div className="font-display uppercase tracking-wide">
          {player.identity.firstName} {player.identity.lastName}
          <span className="text-broadcast-grey normal-case font-body ml-2">
            {age} ans · {club?.name ?? '—'}
          </span>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <Stat label="Note" value={player.overall} accent />
          <Stat label="Forme" value={selectFormLabel(career)} />
          <Stat label="Condition" value={`${Math.round(player.fitness)}`} />
          <Stat label="Rythme" value={`${Math.round(player.sharpness)}`} />
          <Stat label="Moral" value={`${Math.round(player.morale)}`} />
        </div>
      </div>
      <div className="px-4 pb-3">
        <NextMatchCard match={nextMatch} career={career} compact />
      </div>
      <div className="px-4 pb-3">
        <ReputationStrip reputation={career.reputation} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-broadcast-grey">{label}</div>
      <NumberTabular value={value} className={accent ? 'text-broadcast-yellow text-lg' : 'text-white'} />
    </div>
  );
}
