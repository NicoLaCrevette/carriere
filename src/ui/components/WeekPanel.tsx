/**
 * Semaine de travail (§4) : le joueur choisit un plan d'entraînement, lance la
 * semaine, et le jeu s'arrête de lui-même quand quelque chose le demande, un
 * match ou quelqu'un qui veut lui parler. Plus de validation jour par jour.
 */
import type { CareerState, TrainingFocus } from '../../engine/types';
import { TRAINING_FOCUSES } from '../../engine/types';
import type { WeekPlan, WeekResult } from '../../engine/season/week';
import { addDays, compareDates, formatDateFr, formatDateFrShort } from '../../engine/calendar/dates';
import { ATTRIBUTE_LABELS, trainingFocusLabel } from '../lib/labels';
import Button from './Button';
import SectionTitle from './SectionTitle';

const INTENSITES: { value: WeekPlan['intensity']; label: string; aide: string }[] = [
  { value: 'legere', label: 'Légère', aide: 'Tu récupères, tu progresses peu.' },
  { value: 'normale', label: 'Normale', aide: 'L’équilibre habituel.' },
  { value: 'intense', label: 'Intense', aide: 'Tu progresses plus vite, tu arrives fatigué et tu risques la blessure.' },
];

/** Séances les plus utiles en premier pour le poste, le reste ensuite. */
function focusOptions(position: string): TrainingFocus[] {
  const prioritaires: Record<string, TrainingFocus[]> = {
    GB: ['gardien_specifique', 'placement', 'passes'],
    DC: ['defense', 'jeu_de_tete', 'musculation'],
    DD: ['defense', 'vitesse', 'passes'],
    DG: ['defense', 'vitesse', 'passes'],
    MDC: ['defense', 'passes', 'placement'],
    MC: ['passes', 'tactique_individuelle', 'physique'],
    MOC: ['passes', 'dribble', 'finition'],
    AIG: ['dribble', 'vitesse', 'finition'],
    AID: ['dribble', 'vitesse', 'finition'],
    BU: ['finition', 'placement', 'physique'],
  };
  const tete = prioritaires[position] ?? ['physique'];
  return [...tete, ...TRAINING_FOCUSES.filter((f) => !tete.includes(f))];
}

interface WeekPanelProps {
  career: CareerState;
  plan: WeekPlan;
  onPlan(plan: WeekPlan): void;
  onAdvance(): void;
  onPlayMatch(): void;
  matchToday: boolean;
  busy: boolean;
  disabled?: boolean;
  last: WeekResult | null;
}

export default function WeekPanel({ career, plan, onPlan, onAdvance, onPlayMatch, matchToday, busy, disabled, last }: WeekPanelProps) {
  const clubId = career.player.contract.clubId;
  const fin = addDays(career.currentDate, 6);
  const prochain = Object.values(career.matches)
    .filter((m) => m.status === 'a_venir' && m.involvesPlayer)
    .sort((a, b) => compareDates(a.date, b.date))[0];
  const adversaire = prochain
    ? career.world.clubs[prochain.homeClubId === clubId ? prochain.awayClubId : prochain.homeClubId]
    : undefined;
  const domicile = prochain?.homeClubId === clubId;
  const dansLaSemaine = prochain && compareDates(prochain.date, fin) <= 0;

  return (
    <div>
      <SectionTitle right={<span className="text-[11px] uppercase tracking-wide text-broadcast-grey">{career.season.label}</span>}>
        Semaine du {formatDateFrShort(career.currentDate)} au {formatDateFrShort(fin)}
      </SectionTitle>

      <p className="text-sm">
        {prochain ? (
          <>
            <span className="text-broadcast-grey">Prochain match : </span>
            <span className={dansLaSemaine ? 'text-broadcast-yellow' : ''}>
              {formatDateFr(prochain.date)}, {domicile ? 'contre' : 'chez'} {adversaire?.name ?? '?'}
            </span>
          </>
        ) : (
          <span className="text-broadcast-grey">Aucun match programmé pour l’instant.</span>
        )}
      </p>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wide text-broadcast-grey">Plan d’entraînement de la semaine</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onPlan({ ...plan, focus: 'auto' })}
            className={`border px-2 py-1 text-xs uppercase tracking-wide ${plan.focus === 'auto' ? 'border-broadcast-yellow text-broadcast-yellow' : 'border-pitch-700 text-broadcast-grey hover:text-white'}`}
          >
            Laisser le staff décider
          </button>
          {focusOptions(career.player.identity.position).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onPlan({ ...plan, focus: f })}
              className={`border px-2 py-1 text-xs uppercase tracking-wide ${plan.focus === f ? 'border-broadcast-yellow text-broadcast-yellow' : 'border-pitch-700 text-broadcast-grey hover:text-white'}`}
            >
              {trainingFocusLabel(f)}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-broadcast-grey">Intensité</span>
          {INTENSITES.map((i) => (
            <button
              key={i.value}
              type="button"
              title={i.aide}
              onClick={() => onPlan({ ...plan, intensity: i.value })}
              className={`border px-2 py-1 text-xs uppercase tracking-wide ${plan.intensity === i.value ? 'border-broadcast-yellow text-broadcast-yellow' : 'border-pitch-700 text-broadcast-grey hover:text-white'}`}
            >
              {i.label}
            </button>
          ))}
          <span className="ml-2 text-xs text-broadcast-grey">{INTENSITES.find((i) => i.value === plan.intensity)?.aide}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {matchToday ? (
          <Button onClick={onPlayMatch} disabled={busy}>{busy ? 'Préparation…' : 'Jouer le match'}</Button>
        ) : (
          <Button onClick={onAdvance} disabled={busy || disabled}>{busy ? 'La semaine passe…' : 'Passer la semaine'}</Button>
        )}
      </div>

      {last && <WeekRecap last={last} />}
    </div>
  );
}

const RAISONS: Record<WeekResult['stop'], string> = {
  match: 'Jour de match.',
  evenement: 'Quelque chose demande ta réponse.',
  fin_de_semaine: 'Semaine terminée.',
  fin_de_saison: 'La saison est terminée.',
  retraite: 'Fin de carrière.',
  erreur: 'La semaine s’est interrompue.',
};

function WeekRecap({ last }: { last: WeekResult }) {
  const r = last.resume;
  const gains = r.gains.filter((g) => g.to > g.from);
  return (
    <div className="mt-4 border-t border-pitch-800 pt-3">
      <p className="text-[11px] uppercase tracking-wide text-broadcast-grey">
        Ce qui s’est passé · {RAISONS[last.stop]}
      </p>
      <p className="mt-1 text-sm text-broadcast-grey">
        {r.entrainements} séance{r.entrainements > 1 ? 's' : ''} · Condition {Math.round(r.conditionAvant)} → {Math.round(r.conditionApres)} · Rythme {Math.round(r.rythmeAvant)} → {Math.round(r.rythmeApres)}
      </p>
      {gains.length > 0 && (
        <p className="mt-1 text-sm text-broadcast-green">
          {gains.map((g) => `${ATTRIBUTE_LABELS[g.key as keyof typeof ATTRIBUTE_LABELS] ?? g.key} ${g.from} → ${g.to}`).join(' · ')}
        </p>
      )}
      {r.messages.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-broadcast-grey">
          {r.messages.slice(0, 8).map((m, i) => (
            <li key={i}>— {m}</li>
          ))}
        </ul>
      )}
      {gains.length === 0 && r.messages.length === 0 && (
        <p className="mt-1 text-sm text-broadcast-grey">Semaine de travail, sans rien de notable.</p>
      )}
    </div>
  );
}
