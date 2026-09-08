import type { MatchEvaluation } from '../../engine/types';
import NumberTabular from './NumberTabular';

interface EvaluationBoardProps {
  evaluation: MatchEvaluation;
  motm: boolean;
}

const ROWS: { key: keyof MatchEvaluation['verdicts']; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'coach', label: 'Coach' },
  { key: 'supporters', label: 'Supporters' },
  { key: 'teammates', label: 'Coéquipiers' },
  { key: 'media', label: 'Médias' },
];

function colorFor(v: number): string {
  if (v >= 7) return 'text-signal-green';
  if (v >= 5) return 'text-white';
  return 'text-signal-red';
}

/** Tableau obligatoire de fin de match (§5.6) : les cinq regards et leur verdict. */
export default function EvaluationBoard({ evaluation, motm }: EvaluationBoardProps) {
  return (
    <div>
      {motm && (
        <p className="mb-2 inline-block bg-accent px-2 py-0.5 text-xs font-display uppercase tracking-wide text-ink-950">
          Homme du match
        </p>
      )}
      <table className="w-full text-sm">
        <tbody>
          {ROWS.map(({ key, label }) => (
            <tr key={key} className="border-b border-white/[0.05]">
              <td className="py-1.5 pr-3 uppercase tracking-wide text-muted text-[11px] w-32">{label}</td>
              <td className={`py-1.5 pr-3 w-10 text-right font-semibold ${colorFor(evaluation[key])}`}>
                <NumberTabular value={evaluation[key].toFixed(1)} />
              </td>
              <td className="py-1.5 text-muted">{evaluation.verdicts[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
