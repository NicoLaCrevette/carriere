import type { DayAction } from '../../engine/types';

interface TrainingPickerProps {
  actions: DayAction[];
  selectedId: string | null;
  onSelect(action: DayAction): void;
  disabled?: boolean;
}

/** Choix d'entraînement du jour (focus + intensité), proposé par `dayActionsFor`. */
export default function TrainingPicker({ actions, selectedId, onSelect, disabled }: TrainingPickerProps) {
  const trainingActions = actions.filter((a) => a.kind.type === 'entrainement');
  if (trainingActions.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {trainingActions.map((action) => {
        const active = action.id === selectedId;
        return (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(action)}
            className={`border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active ? 'border-broadcast-yellow bg-broadcast-yellow/10 text-broadcast-yellow' : 'border-pitch-600 hover:border-pitch-400'
            }`}
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
