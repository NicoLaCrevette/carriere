import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-broadcast-yellow text-pitch-950 hover:bg-yellow-300 disabled:bg-pitch-600 disabled:text-pitch-400',
  secondary: 'border border-pitch-500 text-white hover:border-broadcast-yellow hover:text-broadcast-yellow disabled:opacity-40',
  danger: 'bg-broadcast-red text-white hover:bg-red-600 disabled:opacity-40',
  ghost: 'text-broadcast-grey hover:text-white disabled:opacity-40',
};

/** Bouton d'action, habillage broadcast : capitales, condensé, pas d'arrondi SaaS. */
export default function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      className={`font-display uppercase tracking-wide text-sm px-4 py-2 transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
