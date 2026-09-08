import type { ReactNode } from 'react';

interface SectionTitleProps {
  children: ReactNode;
  right?: ReactNode;
}

/** Titre de section : point d'accent, capitales, filet très discret. */
export default function SectionTitle({ children, right }: SectionTitleProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="flex items-center gap-2 font-display uppercase tracking-[0.18em] text-accent text-xs">
        <span className="pastille h-1.5 w-1.5 bg-accent" aria-hidden />
        {children}
      </h2>
      <span className="h-px flex-1 bg-white/[0.07]" aria-hidden />
      {right}
    </div>
  );
}
