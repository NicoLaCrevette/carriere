import type { AttributeKey } from '../../engine/types';
import { ATTRIBUTE_LABELS } from '../lib/labels';
import NumberTabular from './NumberTabular';
import ProgressBar from './ProgressBar';

interface AttributeRowProps {
  attrKey: AttributeKey;
  value: number;
  /** Progression 0-1 vers le prochain point. */
  xp: number;
}

/** Une ligne d'attribut avec sa barre d'expérience (§10 : « Vitesse : 81 → 82 »). */
export default function AttributeRow({ attrKey, value, xp }: AttributeRowProps) {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between text-sm">
        <span>{ATTRIBUTE_LABELS[attrKey]}</span>
        <NumberTabular value={value} />
      </div>
      <ProgressBar value={xp} />
    </div>
  );
}
