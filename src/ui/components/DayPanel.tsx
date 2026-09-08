import type { DayAction, DayKind } from '../../engine/types';
import { DAY_KIND_LABELS } from '../lib/labels';
import SectionTitle from './SectionTitle';
import TrainingPicker from './TrainingPicker';

interface DayPanelProps {
  kind: DayKind;
  actions: DayAction[];
  selectedId: string | null;
  onSelect(action: DayAction): void;
  disabled?: boolean;
}

/** Panneau de la journée en cours (§4) : type de journée et actions proposées. */
export default function DayPanel({ kind, actions, selectedId, onSelect, disabled }: DayPanelProps) {
  const hasTraining = actions.some((a) => a.kind.type === 'entrainement');
  return (
    <div>
      <SectionTitle>{DAY_KIND_LABELS[kind]}</SectionTitle>
      {hasTraining ? (
        <TrainingPicker actions={actions} selectedId={selectedId} onSelect={onSelect} disabled={disabled} />
      ) : (
        <ul className="space-y-1 text-sm text-muted">
          {actions.length === 0 && <li>Aucune action particulière aujourd'hui.</li>}
          {actions.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 ${a.mandatory ? 'bg-signal-red' : 'bg-muted'}`} />
              {a.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
