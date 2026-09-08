/**
 * Type de journée du joueur à une date (§4) et actions proposées.
 * Priorité : rééducation (blessé, hors jour de match) > jour de match >
 * veille > lendemain > trêve internationale > vacances (début juillet, trêve
 * hivernale) > préparation > mercato > intersaison > repos hebdomadaire >
 * entraînement.
 */
import type { CalendarDay, CareerState, DayAction, DayKind, ISODate, Match, Position, TrainingFocus } from '../types';
import { BALANCE } from '../config/balance';
import { POSITION_PROFILES } from '../config/positions';
import { addDays, compareDates, dayOfWeek, isBefore, isBetween, monthOf, toISODate, yearOf } from './dates';
import { TRAINING_FOCUS_LABELS } from '../player/training';

const CAL = BALANCE.calendar;

/** Matchs du club du joueur, triés par date. */
function playerClubMatches(state: CareerState): Match[] {
  const clubId = state.player.contract.clubId;
  // Saison en cours seulement : les matchs des saisons passées sont conservés, et sans ce filtre
  // le « premier match » resterait celui de la première saison, ce qui supprimait la préparation d'avant-saison.
  return Object.values(state.matches)
    .filter((m) => m.status !== 'reporte' && m.seasonId === state.season.id && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => compareDates(a.date, b.date) || a.id.localeCompare(b.id));
}

/** Prochain match (à venir) du club du joueur à partir de `from` inclus. */
export function nextPlayerMatch(state: CareerState, from: ISODate): Match | null {
  return playerClubMatches(state).find((m) => m.status === 'a_venir' && !isBefore(m.date, from)) ?? null;
}

function hasMatchOn(matches: Match[], date: ISODate): boolean {
  return matches.some((m) => m.date === date);
}

function dateIn(year: number, md: { month: number; day: number }): ISODate {
  return toISODate({ year, month: md.month, day: md.day });
}

/** Année civile de la saison correspondant à un mois (juillet-décembre : année de départ, sinon la suivante). */
function seasonYearFor(state: CareerState, month: number): number {
  const startYear = yearOf(state.season.startDate);
  return month >= CAL.seasonStart.month ? startYear : startYear + 1;
}

function inWinterBreak(state: CareerState, date: ISODate): boolean {
  const from = dateIn(seasonYearFor(state, CAL.winterBreak.from.month), CAL.winterBreak.from);
  const to = dateIn(seasonYearFor(state, CAL.winterBreak.to.month), CAL.winterBreak.to);
  return isBetween(date, from, to);
}

function inTransferWindow(state: CareerState, date: ISODate): boolean {
  const { summer, winter } = state.season.transferWindows;
  return isBetween(date, summer[0], summer[1]) || isBetween(date, winter[0], winter[1]);
}

/**
 * Statuts de sélection nationale pour lesquels le joueur est effectivement
 * convoqué (voir `national/selection.ts`) : pendant une trêve, ses journées
 * deviennent `rassemblement_selection` / `match_international` plutôt que la
 * simple `treve_internationale` (docs/PHASE6_CONTRACTS.md § national).
 */
const CALLED_UP_NATIONAL_STAGES: readonly string[] = ['convoque', 'titulaire', 'cadre', 'capitaine'];

/** Vrai s'il y a un match international du joueur (`competitionId: 'international'`) ce jour-là. */
function hasInternationalMatchOn(state: CareerState, date: ISODate): boolean {
  return Object.values(state.matches).some(
    (m) => m.competitionId === 'international' && m.involvesPlayer && m.date === date && m.status !== 'reporte',
  );
}

/** Type de journée pour le joueur à une date. */
export function dayKindFor(state: CareerState, date: ISODate): DayKind {
  const matches = playerClubMatches(state);
  const matchToday = hasMatchOn(matches, date);
  if (state.player.injuries.some((i) => i.daysRemaining > 0) && !matchToday) return 'reeducation';
  if (matchToday) return 'jour_match';
  if (hasMatchOn(matches, addDays(date, 1))) return 'veille_match';
  if (CAL.dayAfterMatchIsRecovery && hasMatchOn(matches, addDays(date, -1))) return 'lendemain_match';
  if (state.season.internationalBreaks.some(([from, to]) => isBetween(date, from, to))) {
    if (CALLED_UP_NATIONAL_STAGES.includes(state.national.stage)) {
      return hasInternationalMatchOn(state, date) ? 'match_international' : 'rassemblement_selection';
    }
    return 'treve_internationale';
  }

  const startYear = yearOf(state.season.startDate);
  const preparationFrom = dateIn(startYear, CAL.preparation.from);
  if (isBefore(date, preparationFrom)) return 'vacances';
  if (inWinterBreak(state, date)) return 'vacances';
  const first = matches[0];
  const last = matches[matches.length - 1];
  if (first && isBefore(date, first.date)) return 'preparation';
  if (last && isBefore(last.date, date)) return 'intersaison';
  if (inTransferWindow(state, date)) return 'mercato';
  if (dayOfWeek(date) === CAL.restDayOfWeek) return 'repos';
  return 'entrainement';
}

/** Journées où l'on s'entraîne. */
export const TRAINING_DAY_KINDS: readonly DayKind[] = [
  'entrainement', 'preparation', 'mercato', 'treve_internationale', 'veille_match', 'lendemain_match',
];

const ATTRIBUTE_TO_FOCUS: Partial<Record<string, TrainingFocus>> = {
  finition: 'finition', tirLointain: 'finition', dribble: 'dribble', controle: 'dribble', agilite: 'dribble',
  vitesse: 'vitesse', acceleration: 'vitesse', endurance: 'physique', tete: 'jeu_de_tete', detente: 'jeu_de_tete',
  placement: 'placement', vision: 'passes', passeCourte: 'passes', passeLongue: 'passes', centres: 'passes',
  force: 'musculation', travailDefensif: 'defense', coupsFrancs: 'coups_de_pied_arretes', penalty: 'coups_de_pied_arretes',
  sangFroid: 'tactique_individuelle', reflexes: 'gardien_specifique', plongeon: 'gardien_specifique',
  sortiesAeriennes: 'gardien_specifique', unContreUn: 'gardien_specifique', jeuAuPied: 'gardien_specifique',
};

/** Focus « spécifique au poste » du jour : tourne parmi les attributs clés selon le jour de la semaine. */
function positionFocus(position: Position, date: ISODate): TrainingFocus {
  const keys = POSITION_PROFILES[position].keyAttributes;
  const key = keys[dayOfWeek(date) % keys.length];
  return (key && ATTRIBUTE_TO_FOCUS[key]) ?? (position === 'GB' ? 'gardien_specifique' : 'physique');
}

function trainingAction(date: ISODate, focus: TrainingFocus, intensity: 'legere' | 'normale' | 'intense'): DayAction {
  return {
    id: `${date}-entrainement-${focus}-${intensity}`,
    label: `${TRAINING_FOCUS_LABELS[focus] ?? focus} (${intensity})`,
    kind: { type: 'entrainement', focus, intensity },
    mandatory: false,
    done: false,
  };
}

/** Actions proposées pour la journée (1-3). Phase 1 : entraînements, récupération, soins, repos. */
export function dayActionsFor(state: CareerState, day: CalendarDay): DayAction[] {
  const date = day.date;
  const position = state.player.identity.position;
  switch (day.kind) {
    case 'entrainement':
    case 'preparation':
    case 'mercato':
    case 'treve_internationale':
    case 'rassemblement_selection':
      return [
        trainingAction(date, 'physique', 'normale'),
        trainingAction(date, positionFocus(position, date), 'normale'),
        trainingAction(date, positionFocus(position, date), 'intense'),
      ];
    case 'veille_match':
      return [trainingAction(date, 'tactique_individuelle', 'legere'), trainingAction(date, 'recuperation', 'legere')];
    case 'lendemain_match':
      return [trainingAction(date, 'recuperation', 'legere'), trainingAction(date, positionFocus(position, date), 'legere')];
    case 'reeducation':
      return [{ id: `${date}-soins`, label: 'Séance de soins', kind: { type: 'soins', label: 'Séance de soins' }, mandatory: true, done: false }];
    case 'repos':
    case 'vacances':
    case 'intersaison':
      return [{ id: `${date}-repos`, label: 'Repos', kind: { type: 'repos' }, mandatory: false, done: false }];
    default:
      return [];
  }
}

/** Jour du calendrier de la date courante ; créé (et inséré dans l'ordre) s'il manque. */
export function todayCalendarDay(state: CareerState): CalendarDay {
  const date = state.currentDate;
  const existing = state.calendar.find((d) => d.date === date);
  if (existing) return existing;
  const kind = dayKindFor(state, date);
  const matchId = kind === 'jour_match' ? nextPlayerMatch(state, date)?.id : undefined;
  const day: CalendarDay = { date, kind, eventIds: [], actions: [], completed: false };
  if (matchId) day.matchId = matchId;
  day.actions = dayActionsFor(state, day);
  const index = state.calendar.findIndex((d) => isBefore(date, d.date));
  if (index === -1) state.calendar.push(day); else state.calendar.splice(index, 0, day);
  return day;
}

/** Phase de saison déduite du type de journée. */
export function seasonPhaseFor(kind: DayKind, date: ISODate): CareerState['season']['phase'] {
  switch (kind) {
    case 'vacances': return 'vacances';
    case 'preparation': return 'preparation';
    case 'treve_internationale':
    case 'rassemblement_selection':
    case 'match_international':
      return 'treve_internationale';
    case 'intersaison': return 'intersaison';
    case 'mercato': return monthOf(date) >= CAL.seasonStart.month ? 'mercato_ete' : 'mercato_hiver';
    default: return 'championnat';
  }
}
