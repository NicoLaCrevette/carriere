interface ProgressBarProps {
  /** 0-1. */
  value: number;
  colorClassName?: string;
  className?: string;
}

/** Barre de progression sobre (XP vers le prochain point d'attribut, par exemple). */
export default function ProgressBar({ value, colorClassName = 'bg-accent', className = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07] ${className}`}>
      <div className={`h-full rounded-full transition-all duration-500 ${colorClassName}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
