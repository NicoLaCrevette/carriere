import type { Reputation } from '../../engine/types';
import { REPUTATION_KEYS } from '../../engine/types';
import { REPUTATION_LABELS } from '../lib/labels';
import Gauge from './Gauge';

interface ReputationStripProps {
  reputation: Reputation;
}

/** Les 8 jauges de réputation (§4, §11), toujours affichées. */
export default function ReputationStrip({ reputation }: ReputationStripProps) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-8">
      {REPUTATION_KEYS.map((key) => {
        const gauge = reputation[key];
        const last = gauge.history[gauge.history.length - 1];
        return <Gauge key={key} label={REPUTATION_LABELS[key]} value={gauge.value} reason={last?.reason} />;
      })}
    </div>
  );
}
