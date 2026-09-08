interface ProgressBarProps {
  /** 0-1. */
  value: number;
  colorClassName?: string;
  className?: string;
}

/** Barre de progression sobre (XP vers le prochain point d'attribut, par exemple). */
export default function ProgressBar({ value, colorClassName = 'bg-broadcast-yellow', className = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`h-1.5 w-full bg-pitch-700 ${className}`}>
      <div className={`h-full ${colorClassName}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
