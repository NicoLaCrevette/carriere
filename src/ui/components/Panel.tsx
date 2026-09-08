import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
  /** Bloc mis en avant : liseré d'accent au lieu du contour neutre. */
  accent?: boolean;
}

/** Bloc d'écran : carte arrondie, contour très discret, ombre portée basse. */
export default function Panel({ children, className = '', accent = false }: PanelProps) {
  const contour = accent ? 'ring-1 ring-accent/40 bg-accent/[0.04]' : 'ring-1 ring-white/[0.07] bg-ink-900/70';
  return <section className={`rounded-card ${contour} shadow-card backdrop-blur-sm p-5 ${className}`}>{children}</section>;
}
