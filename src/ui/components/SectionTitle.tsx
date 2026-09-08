import type { ReactNode } from 'react';

interface SectionTitleProps {
  children: ReactNode;
  right?: ReactNode;
}

/** Bandeau de titre en capitales, jaune d'accent — habillage broadcast. */
export default function SectionTitle({ children, right }: SectionTitleProps) {
  return (
    <div className="flex items-center justify-between border-b border-pitch-700 pb-2 mb-3">
      <h2 className="font-display uppercase tracking-wider text-broadcast-yellow text-sm">{children}</h2>
      {right}
    </div>
  );
}
