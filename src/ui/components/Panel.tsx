import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
}

/** Bloc d'écran : bordure nette, fond sombre, pas de carte arrondie façon SaaS. */
export default function Panel({ children, className = '' }: PanelProps) {
  return <section className={`border border-pitch-700 bg-pitch-900/70 p-4 ${className}`}>{children}</section>;
}
