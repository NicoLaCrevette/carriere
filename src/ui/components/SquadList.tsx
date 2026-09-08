import type { Id, ISODate, NpcPlayer, Player, Position } from '../../engine/types';
import { POSITIONS } from '../../engine/types';
import { POSITION_LABELS } from '../../engine/config/positions';
import { ageAt } from '../../engine/calendar/dates';
import NumberTabular from './NumberTabular';

interface SquadListProps {
  byPosition: Partial<Record<Position, (Player | NpcPlayer)[]>>;
  playerId: Id;
  asOf: ISODate;
}

function isPlayer(p: Player | NpcPlayer): p is Player {
  return 'squadStatus' in p;
}

/** Effectif du club par poste (§13) : nom, âge, note, forme, blessure/suspension. */
export default function SquadList({ byPosition, playerId, asOf }: SquadListProps) {
  return (
    <div className="space-y-4">
      {POSITIONS.map((pos) => {
        const rows = byPosition[pos];
        if (!rows || rows.length === 0) return null;
        return (
          <div key={pos}>
            <h4 className="text-[11px] uppercase tracking-wide text-broadcast-grey mb-1">{POSITION_LABELS[pos]}</h4>
            <ul className="divide-y divide-pitch-800 text-sm">
              {rows.map((p) => {
                const injured = isPlayer(p) ? p.injuries.some((i) => i.daysRemaining > 0) : !!p.injury && p.injury.daysRemaining > 0;
                const suspended = isPlayer(p)
                  ? Object.values(p.suspensions).some((n) => n > 0)
                  : p.suspensionMatches > 0;
                return (
                  <li key={p.id} className={`flex items-center gap-3 py-1 ${p.id === playerId ? 'text-broadcast-yellow' : ''}`}>
                    <span className="flex-1 truncate">
                      {p.identity.firstName} {p.identity.lastName}
                    </span>
                    <span className="w-10 text-right text-broadcast-grey"><NumberTabular value={ageAt(p.identity.birthDate, asOf)} /></span>
                    <span className="w-10 text-right font-semibold"><NumberTabular value={p.overall} /></span>
                    <span className="w-14 text-right text-broadcast-grey"><NumberTabular value={p.form >= 0 ? `+${p.form}` : p.form} /></span>
                    <span className="w-24 text-right">
                      {injured && <span className="text-broadcast-red text-[11px] uppercase">Blessé</span>}
                      {!injured && suspended && <span className="text-broadcast-red text-[11px] uppercase">Suspendu</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
