import type { DayResult } from '../../engine/types';
import { ATTRIBUTE_LABELS, DAY_KIND_LABELS, formatSigned } from '../lib/labels';
import { formatDateFr } from '../../engine/calendar/dates';
import SectionTitle from './SectionTitle';

interface DayRecapProps {
  result: DayResult;
}

/** Résumé de la veille (§4) : messages du moteur, gains d'attributs, blessures, réputation. */
export default function DayRecap({ result }: DayRecapProps) {
  return (
    <div>
      <SectionTitle>
        Résumé du {formatDateFr(result.date)} — {DAY_KIND_LABELS[result.kind]}
      </SectionTitle>
      <div className="space-y-3 text-sm">
        {result.attributeGains.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {result.attributeGains.map((g, i) => (
              <li key={`${g.key}-${i}`} className="text-broadcast-green tabular-nums">
                {ATTRIBUTE_LABELS[g.key]} : {g.from} → {g.to}
              </li>
            ))}
          </ul>
        )}
        {result.newInjuries.length > 0 && (
          <ul className="space-y-1">
            {result.newInjuries.map((inj) => (
              <li key={inj.id} className="text-broadcast-red">
                Blessure : {inj.type} — {inj.announcedDays} jours annoncés.
              </li>
            ))}
          </ul>
        )}
        {result.reputationChanges.length > 0 && (
          <ul className="space-y-1 text-broadcast-grey">
            {result.reputationChanges.map((r, i) => (
              <li key={i}>
                {r.key} : {formatSigned(r.delta)} ({r.reason})
              </li>
            ))}
          </ul>
        )}
        {result.messages.length > 0 ? (
          <ul className="space-y-1 text-broadcast-grey">
            {result.messages.map((m, i) => (
              <li key={i}>— {m}</li>
            ))}
          </ul>
        ) : (
          <p className="text-broadcast-grey">Journée tranquille, rien à signaler.</p>
        )}
      </div>
    </div>
  );
}
