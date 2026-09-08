import type { RatingChange } from '../../engine/types';
import { formatRating, formatSigned } from '../lib/labels';
import NumberTabular from './NumberTabular';

interface RatingTickerProps {
  rating: number;
  log: RatingChange[];
}

/** Note finale et son journal (§5.5) : chaque variation avec son motif. */
export default function RatingTicker({ rating, log }: RatingTickerProps) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-wide text-broadcast-grey">Note</span>
        <NumberTabular value={formatRating(rating)} className="text-2xl font-display text-broadcast-yellow" />
        <span className="text-broadcast-grey">/ 10</span>
      </div>
      <ul className="space-y-0.5 text-sm max-h-64 overflow-y-auto">
        {log.map((entry, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-10 shrink-0 tabular-nums text-broadcast-grey">{entry.minute}'</span>
            <span className={entry.delta >= 0 ? 'text-broadcast-green' : 'text-broadcast-red'}>{formatSigned(entry.delta, 1)}</span>
            <span className="text-broadcast-grey">{entry.reason}</span>
          </li>
        ))}
        {log.length === 0 && <li className="text-broadcast-grey">Aucune variation notable.</li>}
      </ul>
    </div>
  );
}
