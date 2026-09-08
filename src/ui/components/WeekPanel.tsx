/**
 * Semaine de travail (§4) : le joueur voit où il en est, choisit un plan
 * d'entraînement, lance la semaine, et le jeu s'arrête de lui-même quand
 * quelque chose le demande — un match, ou quelqu'un qui veut lui parler.
 *
 * Le bilan dit ce que la semaine a rapporté, y compris quand aucun point
 * d'attribut n'est tombé : sinon on croit ne jamais progresser.
 */
import type { ButtonHTMLAttributes } from 'react';
import type { CareerState, TrainingFocus } from '../../engine/types';
import { TRAINING_FOCUSES } from '../../engine/types';
import type { WeekPlan, WeekResult } from '../../engine/season/week';
import { addDays, formatDateFrShort } from '../../engine/calendar/dates';
import { buildBriefing } from '../lib/weekBriefing';
import { ATTRIBUTE_LABELS, DAY_KIND_LABELS, trainingFocusLabel } from '../lib/labels';
import Button from './Button';
import SectionTitle from './SectionTitle';
import ProgressBar from './ProgressBar';

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

/** Pilule de choix, la brique du panneau. */
function Pilule({ actif, children, ...rest }: { actif: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-wide transition ${
        actif ? 'bg-accent text-ink-950 font-semibold' : 'ring-1 ring-white/10 text-muted hover:text-white hover:ring-white/25'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
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
  const fin = addDays(career.currentDate, 6);
  const briefing = buildBriefing(career);

  return (
    <div>
      <SectionTitle right={<span className="text-[11px] uppercase tracking-wide text-muted">{career.season.label}</span>}>
        {briefing.titre}
      </SectionTitle>

      {/* Ouverture de semaine : où on en est, ce qui arrive. */}
      <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
          Semaine du {formatDateFrShort(career.currentDate)} au {formatDateFrShort(fin)}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">{briefing.phrases.join(' ')}</p>
        {briefing.match && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-muted">
              {briefing.match.domicile ? 'À domicile' : 'À l’extérieur'}
            </span>
            {/* L'imminence est ce qui doit sauter aux yeux : elle change le plan de la semaine. */}
            <span className={`rounded-full px-2.5 py-1 ${briefing.match.jours <= 1 ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-muted'}`}>
              {briefing.match.jours === 0 ? 'Aujourd’hui' : briefing.match.jours === 1 ? 'Demain' : `J−${briefing.match.jours}`}
            </span>
            {briefing.match.enjeu && <span className="rounded-full bg-signal-red/15 px-2.5 py-1 text-signal-red">Enjeu élevé</span>}
          </div>
        )}
        {briefing.alerte && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-signal-amber/10 px-3 py-2 text-xs text-signal-amber">
            <span aria-hidden>▲</span>
            {briefing.alerte}
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wide text-muted">Plan d’entraînement de la semaine</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Pilule actif={plan.focus === 'auto'} onClick={() => onPlan({ ...plan, focus: 'auto' })}>
            Laisser le staff décider
          </Pilule>
          {focusOptions(career.player.identity.position).map((f) => (
            <Pilule key={f} actif={plan.focus === f} onClick={() => onPlan({ ...plan, focus: f })}>
              {trainingFocusLabel(f)}
            </Pilule>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-muted">Intensité</span>
          {INTENSITES.map((i) => (
            <Pilule key={i.value} actif={plan.intensity === i.value} title={i.aide} onClick={() => onPlan({ ...plan, intensity: i.value })}>
              {i.label}
            </Pilule>
          ))}
          <span className="ml-1 text-xs text-muted">{INTENSITES.find((i) => i.value === plan.intensity)?.aide}</span>
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
  const progression = r.progression ?? [];
  const globalDelta = r.globalApres - r.globalAvant;
  const nature = natureDeLaSemaine(last);

  return (
    <div className="mt-5 rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.06] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Ce que la semaine a donné</p>
        <p className="text-[11px] uppercase tracking-wide text-muted">{RAISONS[last.stop]}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chiffre label="Séances" valeur={`${r.entrainements}`} />
        <Chiffre label="Condition" valeur={`${Math.round(r.conditionApres)}`} delta={r.conditionApres - r.conditionAvant} />
        <Chiffre label="Rythme" valeur={`${Math.round(r.rythmeApres)}`} delta={r.rythmeApres - r.rythmeAvant} />
        <Chiffre label="Note globale" valeur={`${r.globalApres}`} delta={globalDelta} accent />
      </div>

      {progression.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-muted">Ce que l’entraînement a rapporté</p>
          <ul className="mt-2 space-y-2">
            {progression.map((p) => (
              <li key={p.key}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-white">
                    {ATTRIBUTE_LABELS[p.key] ?? p.key}
                    <span className="ml-1.5 text-muted">{p.valeur}</span>
                    {p.pointsGagnes > 0 && <span className="ml-1.5 text-signal-green">+{p.pointsGagnes} cette semaine</span>}
                  </span>
                  <span className="text-muted tabular-nums">
                    {Math.round(p.xp * 100)} % vers {p.valeur + 1}
                  </span>
                </div>
                <ProgressBar
                  value={p.xp}
                  className="mt-1"
                  colorClassName={p.pointsGagnes > 0 ? 'bg-signal-green' : 'bg-accent'}
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            Un point d’attribut demande plusieurs semaines de la même séance. La barre montre où tu en es.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Pas de séance qui rapporte cette semaine{nature ? ` : ${nature}` : ''}.
        </p>
      )}

      {r.blessures > 0 && (
        <p className="mt-3 text-xs text-signal-red">
          {r.blessures} blessure{r.blessures > 1 ? 's' : ''} cette semaine.
        </p>
      )}

      {r.messages.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t border-white/[0.06] pt-3 text-sm text-muted">
          {r.messages.slice(0, 8).map((m, i) => (
            <li key={i}>— {m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Ce qu'était la semaine quand elle n'a rien rapporté : vacances, préparation,
 * trêve, rééducation. Sans cette phrase, une semaine vide passe pour un bug.
 */
function natureDeLaSemaine(last: WeekResult): string | null {
  const compte = new Map<string, number>();
  for (const jour of last.days) compte.set(jour.kind, (compte.get(jour.kind) ?? 0) + 1);
  const dominant = [...compte.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!dominant || dominant[1] < 2) return null;
  const label = DAY_KIND_LABELS[dominant[0] as keyof typeof DAY_KIND_LABELS];
  return label ? `${dominant[1]} jours de ${label.toLowerCase()}` : null;
}

function Chiffre({ label, valeur, delta, accent }: { label: string; valeur: string; delta?: number; accent?: boolean }) {
  const signe = delta === undefined || Math.abs(delta) < 0.5 ? null : delta > 0 ? 'hausse' : 'baisse';
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`tabular-nums ${accent ? 'text-accent text-lg' : 'text-white'}`}>{valeur}</span>
        {signe && (
          <span className={`text-[11px] tabular-nums ${signe === 'hausse' ? 'text-signal-green' : 'text-signal-red'}`}>
            {delta! > 0 ? '+' : ''}{Math.round(delta!)}
          </span>
        )}
      </div>
    </div>
  );
}
