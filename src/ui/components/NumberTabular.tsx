interface NumberTabularProps {
  value: string | number;
  className?: string;
}

/** Chiffre en police tabulaire, pour que les colonnes de chiffres s'alignent (classements, stats). */
export default function NumberTabular({ value, className = '' }: NumberTabularProps) {
  return <span className={`tabular-nums font-mono ${className}`}>{value}</span>;
}
