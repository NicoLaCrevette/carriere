import type { CareerState } from '../../engine/types';
import { formatDateFr } from '../../engine/calendar/dates';
import { selectFormLabel, selectNextMatch, selectPlayerAge, selectPlayerClub, selectPlayerMatchdayForClub } from '../../store/selectors';
import NumberTabular from './NumberTabular';
import ReputationStrip from './ReputationStrip';
import NextMatchCard from './NextMatchCard';
import PlayerAvatar from './PlayerAvatar';

interface TopBarProps {
  career: CareerState;
}

/** Bandeau permanent (§4) : portrait, date, journée, prochain match, jauges, réputation. */
export default function TopBar({ career }: TopBarProps) {
  const player = career.player;
  const club = selectPlayerClub(career);
  const matchday = selectPlayerMatchdayForClub(career);
  const nextMatch = selectNextMatch(career);
  const age = selectPlayerAge(career);

  return (
    <div className="border-b border-white/[0.06] bg-ink-950/60 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <PlayerAvatar
          {...(player.identity.avatar ? { config: player.identity.avatar } : { id: player.id })}
          {...(club ? { couleurs: club.colors } : {})}
          taille={44}
          anneau
          alt={`Portrait de ${player.identity.firstName} ${player.identity.lastName}`}
        />

        <div className="min-w-0">
          <div className="font-display uppercase tracking-wide leading-tight truncate">
            {player.identity.firstName} {player.identity.lastName}
          </div>
          <div className="text-[11px] text-muted truncate">
            {age} ans · {club?.name ?? 'sans club'} · {formatDateFr(career.currentDate)}
            {matchday > 0 && <span className="ml-1.5 rounded-full bg-white/[0.06] px-2 py-0.5">J{matchday}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Pastille label="Note" value={player.overall} accent />
          <Pastille label="Forme" value={selectFormLabel(career)} />
          <Pastille label="Condition" value={Math.round(player.fitness)} />
          <Pastille label="Rythme" value={Math.round(player.sharpness)} />
          <Pastille label="Moral" value={Math.round(player.morale)} />
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] px-4 py-2">
          <NextMatchCard match={nextMatch} career={career} compact />
        </div>
      </div>

      <div className="px-4 pb-3">
        <ReputationStrip reputation={career.reputation} />
      </div>
    </div>
  );
}

/** Chiffre clé dans une pastille ronde. */
function Pastille({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div
      className={`flex h-14 w-14 flex-col items-center justify-center rounded-full ring-1 ${
        accent ? 'bg-accent/10 ring-accent/40' : 'bg-white/[0.03] ring-white/[0.08]'
      }`}
      title={label}
    >
      <NumberTabular value={value} className={`leading-none ${accent ? 'text-accent text-lg' : 'text-white text-sm'}`} />
      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}
