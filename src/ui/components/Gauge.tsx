import NumberTabular from './NumberTabular';

interface GaugeProps {
  label: string;
  /** 0-100. */
  value: number;
  reason?: string;
}

function colorFor(value: number): string {
  if (value >= 66) return 'bg-signal-green';
  if (value >= 34) return 'bg-accent';
  return 'bg-signal-red';
}

/** Jauge 0-100 (réputation, forme, moral…) avec libellé et raison de la dernière variation. */
export default function Gauge({ label, value, reason }: GaugeProps) {
  return (
    <div className="min-w-0" title={reason}>
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-wide text-muted">
        <span className="truncate">{label}</span>
        <NumberTabular value={Math.round(value)} className="text-white" />
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div className={`h-full rounded-full transition-all duration-500 ${colorFor(value)}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
