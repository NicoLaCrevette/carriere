/**
 * « Pourquoi j'ai raté ». Rend lisible la décomposition que le moteur calcule
 * déjà pour chaque action (`ActionOutcome.modifiers`).
 *
 * Le jeu affichait « probabilité 12 % » et rien d'autre : impossible de savoir
 * si c'était la distance, la fatigue, le défenseur ou son propre niveau. Ici on
 * montre le tirage face à la probabilité, puis ce qui a pesé.
 */
import { useState } from 'react';
import type { ActionOutcome, ClassifiedAction } from '../../engine/types';
import { expliquerAction, pourcentage } from '../lib/explainAction';

interface ActionExplainProps {
  outcome: ActionOutcome;
  action?: ClassifiedAction | undefined;
  /** Déplié d'emblée (bilan d'après-match), replié en direct. */
  ouvertParDefaut?: boolean;
}

export default function ActionExplain({ outcome, action, ouvertParDefaut = false }: ActionExplainProps) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const e = expliquerAction(outcome);
  const reussi = e.tirage < e.probabilite;

  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3">
      <div className="flex items-center gap-3">
        <Cadran probabilite={e.probabilite} tirage={e.tirage} reussi={reussi} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className={reussi ? 'text-signal-green' : 'text-signal-red'}>{reussi ? 'Réussi' : 'Raté'}</span>
            {action && <span className="text-muted"> · {action.action.replace(/_/g, ' ')}</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted leading-snug">{e.resume}</p>
          <p className="mt-0.5 text-[11px] text-muted tabular-nums">
            Tirage {pourcentage(e.tirage)} contre {pourcentage(e.probabilite)} de réussite
            {e.plafonne && <span className="ml-1.5 rounded-full bg-white/[0.06] px-2 py-0.5">plafond du jeu atteint</span>}
          </p>
        </div>
        {e.facteurs.length > 0 && (
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            aria-expanded={ouvert}
            className="shrink-0 rounded-full px-3 py-1 text-[10px] uppercase tracking-wide text-muted ring-1 ring-white/10 hover:text-white hover:ring-white/25"
          >
            {ouvert ? 'Masquer' : 'Le détail'}
          </button>
        )}
      </div>

      {ouvert && e.facteurs.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
          {e.facteurs.map((f) => (
            <li key={f.key} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0 truncate text-muted">{f.label}</span>
              {/* Une barre partant du centre : à gauche ce qui pénalise, à droite ce qui aide. */}
              <span className="relative h-1.5 flex-1 rounded-full bg-white/[0.06]">
                <span
                  className={`absolute top-0 h-1.5 rounded-full ${f.aide ? 'left-1/2 bg-signal-green' : 'right-1/2 bg-signal-red'}`}
                  style={{ width: `${Math.min(50, Math.abs(f.pourcent) / 2)}%` }}
                />
              </span>
              <span className={`w-12 shrink-0 text-right tabular-nums ${f.aide ? 'text-signal-green' : 'text-signal-red'}`}>
                {f.pourcent > 0 ? '+' : ''}{f.pourcent} %
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Cadran rond : l'arc est la probabilité, le trait est le tirage. */
function Cadran({ probabilite, tirage, reussi }: { probabilite: number; tirage: number; reussi: boolean }) {
  const r = 15;
  const circonference = 2 * Math.PI * r;
  const angleTirage = tirage * 360 - 90;
  return (
    <svg viewBox="0 0 40 40" width={44} height={44} className="shrink-0" role="img" aria-label={`${Math.round(probabilite * 100)} % de réussite`}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="20" cy="20" r={r} fill="none"
        stroke={reussi ? '#3ddc84' : '#ff5d70'}
        strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${probabilite * circonference} ${circonference}`}
        transform="rotate(-90 20 20)"
      />
      {/* Le tirage : là où le dé est tombé sur le cercle. */}
      <line
        x1={20 + Math.cos((angleTirage * Math.PI) / 180) * (r - 4)}
        y1={20 + Math.sin((angleTirage * Math.PI) / 180) * (r - 4)}
        x2={20 + Math.cos((angleTirage * Math.PI) / 180) * (r + 4)}
        y2={20 + Math.sin((angleTirage * Math.PI) / 180) * (r + 4)}
        stroke="#fff" strokeWidth="1.5" strokeLinecap="round"
      />
      <text x="20" y="23" textAnchor="middle" className="fill-white text-[10px] tabular-nums" style={{ fontSize: 9 }}>
        {Math.round(probabilite * 100)}
      </text>
    </svg>
  );
}
