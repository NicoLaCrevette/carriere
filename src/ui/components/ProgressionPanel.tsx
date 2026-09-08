/**
 * Progression du joueur depuis ses débuts.
 *
 * C'est la réponse à « j'ai l'impression qu'on ne s'améliore jamais » : le
 * moteur fait bien progresser (une dizaine de points de note globale sur trois
 * saisons), mais semaine par semaine ça ne se voit pas. Ici on met les débuts
 * et aujourd'hui côte à côte.
 *
 * Ne calcule rien : lit `player.overallHistory`, relevé une fois par mois.
 */
import type { AttributeKey, Player } from '../../engine/types';
import { formatDateFrShort } from '../../engine/calendar/dates';
import { ATTRIBUTE_LABELS } from '../lib/labels';
import SectionTitle from './SectionTitle';

interface ProgressionPanelProps {
  player: Player;
  /** Nombre d'attributs détaillés. */
  max?: number;
}

export default function ProgressionPanel({ player, max = 8 }: ProgressionPanelProps) {
  const history = player.overallHistory ?? [];
  // Deux relevés ne font pas une progression : un seul mois écoulé n'a rien à montrer.
  if (history.length < 3) {
    return (
      <div>
        <SectionTitle>Ta progression</SectionTitle>
        <p className="text-sm text-muted">
          Trop tôt : la progression se relève une fois par mois. Reviens dans quelques semaines.
        </p>
      </div>
    );
  }

  const debut = history[0]!;
  const maintenant = history[history.length - 1]!;
  const deltaGlobal = maintenant.overall - debut.overall;

  const gains = (Object.keys(maintenant.attributes) as AttributeKey[])
    .map((key) => ({ key, de: debut.attributes[key] ?? 0, a: maintenant.attributes[key] ?? 0 }))
    .map((g) => ({ ...g, delta: g.a - g.de }))
    .filter((g) => g.delta !== 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, max);

  return (
    <div>
      <SectionTitle right={<span className="text-[11px] uppercase tracking-wide text-muted">depuis {formatDateFrShort(debut.date)}</span>}>
        Ta progression
      </SectionTitle>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Rond label="Au départ" valeur={debut.overall} />
          <span className="text-muted" aria-hidden>→</span>
          <Rond label="Aujourd’hui" valeur={maintenant.overall} accent />
        </div>
        <p className={`text-sm ${deltaGlobal > 0 ? 'text-signal-green' : deltaGlobal < 0 ? 'text-signal-red' : 'text-muted'}`}>
          {deltaGlobal > 0 ? `+${deltaGlobal} points de note globale` : deltaGlobal < 0 ? `${deltaGlobal} points` : 'Note globale inchangée'}
        </p>
      </div>

      <CourbeGlobal points={history.map((p) => p.overall)} />

      {gains.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {gains.map((g) => (
            <li key={g.key} className="flex items-center gap-3 text-xs">
              <span className="w-32 shrink-0 truncate text-muted">{ATTRIBUTE_LABELS[g.key] ?? g.key}</span>
              <span className="tabular-nums text-muted">{g.de}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${g.delta > 0 ? 'bg-signal-green' : 'bg-signal-red'}`}
                  style={{ width: `${Math.min(100, Math.abs(g.delta) * 4)}%` }}
                />
              </span>
              <span className="tabular-nums text-white">{g.a}</span>
              <span className={`w-10 shrink-0 text-right tabular-nums ${g.delta > 0 ? 'text-signal-green' : 'text-signal-red'}`}>
                {g.delta > 0 ? '+' : ''}{g.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Rond({ label, valeur, accent }: { label: string; valeur: number; accent?: boolean }) {
  return (
    <div className="text-center">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full text-xl tabular-nums ring-1 ${
          accent ? 'bg-accent/12 text-accent ring-accent/40' : 'bg-white/[0.04] text-white ring-white/10'
        }`}
      >
        {valeur}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/** Courbe de la note globale, sans axes : on veut voir la pente, pas lire des valeurs. */
function CourbeGlobal({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const l = 600;
  const h = 90;
  const marge = 10;
  const min = Math.min(...points);
  const max = Math.max(...points);
  // Une note stable ne doit pas s'écraser en bas du cadre : à plat, la courbe passe au milieu.
  const etendue = Math.max(1, max - min);
  const centrer = max === min;
  const x = (i: number): number => (i / (points.length - 1)) * l;
  const y = (v: number): number => (centrer ? h / 2 : h - marge - ((v - min) / etendue) * (h - marge * 2));
  const ligne = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const aire = `${ligne} L ${l} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${l} ${h}`} className="mt-4 w-full" role="img" aria-label={`Note globale de ${min} à ${max}`}>
      <defs>
        <linearGradient id="pente" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9f24d" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#c9f24d" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={aire} fill="url(#pente)" />
      <path d={ligne} fill="none" stroke="#c9f24d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={l} cy={y(points[points.length - 1]!)} r="3.5" fill="#c9f24d" />
    </svg>
  );
}
