import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent text-ink-950 hover:bg-accent-soft hover:shadow-glow disabled:bg-ink-700 disabled:text-ink-400 disabled:shadow-none',
  secondary: 'ring-1 ring-white/15 text-white hover:ring-accent hover:text-accent disabled:opacity-40',
  danger: 'bg-signal-red text-white hover:bg-signal-red/80 disabled:opacity-40',
  ghost: 'text-muted hover:text-white hover:bg-white/5 disabled:opacity-40',
};

/** Bouton d'action : pilule arrondie, capitales condensées. */
export default function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      className={`rounded-full font-display uppercase tracking-wide text-sm px-5 py-2 transition-all
        disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50
        ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
