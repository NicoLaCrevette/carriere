import { useId, useMemo } from 'react';
import {
  avatarDepuisId, COULEURS_CHEVEUX, COULEURS_NEUTRES, TEINTES_PEAU,
  type AvatarConfig, type CouleursClub,
} from '../lib/avatar';

interface PlayerAvatarProps {
  /** Configuration explicite (joueur incarné). À défaut, elle est déduite de `id`. */
  config?: AvatarConfig;
  id?: string;
  /** Couleurs du club, reprises sur le maillot. */
  couleurs?: CouleursClub;
  /** Diamètre en pixels. */
  taille?: number;
  /** Anneau d'accent autour de la pastille. */
  anneau?: boolean;
  className?: string;
  /** Texte alternatif ; sans lui l'avatar est décoratif. */
  alt?: string;
}

/**
 * Portrait rond d'un joueur, dessiné en SVG.
 *
 * Aucune ressource externe, aucun poids réseau : le dessin est déterministe et
 * tient dans le rendu. Voir `ui/lib/avatar.ts` pour le choix de ne pas utiliser
 * de photos et de ne rien déduire de la nationalité.
 */
export default function PlayerAvatar({
  config, id, couleurs = COULEURS_NEUTRES, taille = 40, anneau = false, className = '', alt,
}: PlayerAvatarProps) {
  const a = useMemo(() => config ?? avatarDepuisId(id ?? 'inconnu'), [config, id]);
  // Les identifiants SVG sont globaux au document : sans préfixe unique, deux
  // portraits sur le même écran partageraient dégradé et découpes.
  const uid = useId().replace(/:/g, '');
  const peau = TEINTES_PEAU[a.peau % TEINTES_PEAU.length]!;
  const cheveux = COULEURS_CHEVEUX[a.cheveux % COULEURS_CHEVEUX.length]!;
  const ombre = assombrir(peau, 0.14);

  return (
    <svg
      viewBox="0 0 64 64"
      width={taille}
      height={taille}
      className={`shrink-0 rounded-full ${anneau ? 'ring-2 ring-accent/60' : 'ring-1 ring-white/10'} ${className}`}
      role={alt ? 'img' : 'presentation'}
      {...(alt ? { 'aria-label': alt } : { 'aria-hidden': true })}
    >
      <circle cx="32" cy="32" r="32" fill={couleurs.primary} />
      <circle cx="32" cy="32" r="32" fill={`url(#voile-${uid})`} />
      <defs>
        <linearGradient id={`voile-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <clipPath id={`pastille-${uid}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
        {/* La pilosité est découpée à la forme du visage : sans ça, une barbe déborde sur le maillot. */}
        <clipPath id={`visage-${uid}`}>
          <ellipse cx="32" cy="27" rx="14" ry="15.5" />
        </clipPath>
      </defs>

      <g clipPath={`url(#pastille-${uid})`}>
        {/* Épaules : le maillot reprend les couleurs réelles du club. */}
        <path d="M8 64c0-11 10-17 24-17s24 6 24 17z" fill={couleurs.primary} />
        <path d="M26 47h12v17H26z" fill={couleurs.secondary} opacity="0.85" />
        {/* Cou et tête. */}
        <path d="M27 39h10v9H27z" fill={ombre} />
        <ellipse cx="32" cy="27" rx="14" ry="15.5" fill={peau} />
        {/* Oreilles. */}
        <ellipse cx="18" cy="28" rx="2.6" ry="3.4" fill={peau} />
        <ellipse cx="46" cy="28" rx="2.6" ry="3.4" fill={peau} />

        <Cheveux coiffure={a.coiffure} couleur={cheveux} />
        {/* La barbe passe sous les yeux et sous la bouche, qui restent lisibles par-dessus. */}
        <g clipPath={`url(#visage-${uid})`}>
          <Pilosite pilosite={a.pilosite} couleur={cheveux} />
        </g>
        {/* Yeux et bouche, réduits au minimum : à 32 px, tout détail devient une tache. */}
        <ellipse cx="26" cy="27" rx="1.7" ry="2" fill="#101418" />
        <ellipse cx="38" cy="27" rx="1.7" ry="2" fill="#101418" />
        <path d="M28 34.5q4 2.6 8 0" stroke="#101418" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.75" />
        <Accessoire accessoire={a.accessoire} couleur={couleurs.secondary} />
      </g>
    </svg>
  );
}

function Cheveux({ coiffure, couleur }: { coiffure: AvatarConfig['coiffure']; couleur: string }) {
  switch (coiffure) {
    case 'rase':
      return <path d="M18 24q0-13 14-13t14 13q-3-6-14-6t-14 6z" fill={couleur} opacity="0.5" />;
    case 'degarni':
      return <path d="M18 26q1-8 6-10-2 4-2 8zm28 0q-1-8-6-10 2 4 2 8z" fill={couleur} />;
    case 'boucles':
      return (
        <g fill={couleur}>
          <circle cx="22" cy="15" r="6" /><circle cx="32" cy="12" r="7" /><circle cx="42" cy="15" r="6" />
          <circle cx="18" cy="21" r="5" /><circle cx="46" cy="21" r="5" />
        </g>
      );
    case 'afro':
      return <ellipse cx="32" cy="16" rx="19" ry="14" fill={couleur} />;
    case 'mi_long':
      return <path d="M17 24q0-14 15-14t15 14v14q-3-4-3-12-5 4-12 4t-12-4q0 8-3 12z" fill={couleur} />;
    case 'chignon':
      return (
        <g fill={couleur}>
          <path d="M18 23q0-12 14-12t14 12q-4-6-14-6t-14 6z" />
          <circle cx="32" cy="7" r="5" />
        </g>
      );
    case 'tresses':
      return (
        <g fill={couleur}>
          <path d="M18 23q0-12 14-12t14 12z" />
          {[21, 26, 32, 38, 43].map((x) => <rect key={x} x={x - 1} y="9" width="2" height="15" rx="1" opacity="0.85" />)}
        </g>
      );
    case 'court':
    default:
      return <path d="M18 25q0-14 14-14t14 14q-4-8-14-8t-14 8z" fill={couleur} />;
  }
}

/**
 * Pilosité. Les formes sont volontairement rectangulaires : elles sont découpées
 * par le contour du visage (clipPath « visage »), qui leur donne la bonne courbe.
 */
function Pilosite({ pilosite, couleur }: { pilosite: AvatarConfig['pilosite']; couleur: string }) {
  switch (pilosite) {
    case 'bouc':
      return (
        <g fill={couleur}>
          <rect x="28" y="35" width="8" height="10" rx="3" />
          <path d="M27 32.2q5-1.8 10 0-5 1.4-10 0z" />
        </g>
      );
    case 'moustache':
      return <path d="M26.5 32q5.5-2.2 11 0-5.5 1.7-11 0z" fill={couleur} />;
    case 'barbe_courte':
      return <rect x="16" y="29" width="32" height="18" fill={couleur} opacity="0.45" />;
    case 'barbe_pleine':
      return (
        <g fill={couleur}>
          <rect x="16" y="27" width="32" height="20" />
          {/* Joues dégagées : la barbe remonte moins haut au milieu du visage. */}
          <rect x="22" y="24" width="4" height="6" />
          <rect x="38" y="24" width="4" height="6" />
        </g>
      );
    case 'aucune':
    default:
      return null;
  }
}

function Accessoire({ accessoire, couleur }: { accessoire: AvatarConfig['accessoire']; couleur: string }) {
  switch (accessoire) {
    case 'bandeau':
      return <path d="M18 20h28v4H18z" fill={couleur} />;
    case 'boucle_oreille':
      return <circle cx="46" cy="31" r="1.8" fill="#e8c95a" />;
    case 'aucun':
    default:
      return null;
  }
}

/** Assombrit une couleur hexadécimale (pour l'ombre du cou). */
function assombrir(hex: string, part: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - part)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
