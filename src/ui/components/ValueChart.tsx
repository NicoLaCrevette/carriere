import type { ValuePoint } from '../../engine/types';
import { formatDateFrShort } from '../../engine/calendar/dates';
import { formatEuros } from '../lib/labels';

interface ValueChartProps {
  history: ValuePoint[];
  width?: number;
  height?: number;
}

const LINE_COLOR = '#f5c518';
const GRID_COLOR = '#1b2530';

/** Courbe SVG maison de la valeur marchande (§11, CareerScreen). */
export default function ValueChart({ history, width = 640, height = 220 }: ValueChartProps) {
  if (history.length === 0) return <p className="text-sm text-broadcast-grey">Aucun historique pour l'instant.</p>;
  const pad = 32;
  const values = history.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const xFor = (i: number): number => pad + (i / Math.max(1, history.length - 1)) * (width - pad * 2);
  const yFor = (v: number): number => height - pad - ((v - min) / Math.max(1, max - min)) * (height - pad * 2);
  const path = history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ');
  const last = history[history.length - 1]!;
  const first = history[0]!;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={pad} x2={width - pad} y1={pad + t * (height - pad * 2)} y2={pad + t * (height - pad * 2)} stroke={GRID_COLOR} strokeWidth={1} />
      ))}
      <path d={path} fill="none" stroke={LINE_COLOR} strokeWidth={2} />
      <text x={pad} y={height - 8} fill="#9aa7b2" fontSize={11}>{formatDateFrShort(first.date)}</text>
      <text x={width - pad} y={height - 8} fill="#9aa7b2" fontSize={11} textAnchor="end">{formatDateFrShort(last.date)}</text>
      <text x={width - pad} y={pad - 10} fill={LINE_COLOR} fontSize={13} textAnchor="end" className="font-display">
        {formatEuros(last.value)}
      </text>
    </svg>
  );
}
