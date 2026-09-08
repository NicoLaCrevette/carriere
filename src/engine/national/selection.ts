/**
 * Évaluation de la sélection et matchs de trêve (docs/PHASE6_CONTRACTS.md §
 * `src/engine/national/selection.ts`).
 *
 * Aucun branchement dans `finishDay` ici (voir le rapport final pour ce qui
 * reste à brancher) : `evaluateSelection` et `scheduleInternationalMatches`
 * sont autonomes et prêtes à être appelées le premier jour d'une trêve.
 */
import type { CareerState, GameEvent, ISODate, Match, NationalStage } from '../types';
import { NATIONAL_STAGES } from '../types';
import { NATIONAL_BALANCE } from '../config/balance/national';
import { countryStrength, ensureNationalSquad, INTERNATIONAL_COMPETITION_ID, pickOpponentCountries } from './squads';
import { isPlayerCalledUp } from './matchContext';
import { addDays, ageAt, diffDays } from '../calendar/dates';
import { nextRng } from '../rng/derive';
import { addLog, addMemory, clamp } from '../career/apply';
import { recentAverageRating } from '../season/recentMatches';
import { countryName } from '../../data/nationalities';

const N = NATIONAL_BALANCE.national;
const CALLED_UP_STAGES: readonly NationalStage[] = ['convoque', 'titulaire', 'cadre', 'capitaine'];

// ── Signaux ──────────────────────────────────────────────────────────────

interface Signals {
  age: number;
  avgRating: number;
  hasSample: boolean;
  leagueReputation: number;
  minutes60d: number;
  leadership: number;
  caps: number;
}

function minutesInLastDays(state: CareerState, days: number): number {
  let total = 0;
  for (const match of Object.values(state.matches)) {
    const report = match.result?.playerReport;
    if (!report) continue;
    const gap = diffDays(match.date, state.currentDate);
    if (gap < 0 || gap > days) continue;
    total += report.minutesPlayed;
  }
  return total;
}

function computeSignals(state: CareerState): Signals {
  const avg = recentAverageRating(state, N.ratingSampleMatches);
  return {
    age: ageAt(state.player.identity.birthDate, state.currentDate),
    avgRating: avg ?? 0,
    hasSample: avg !== null,
    leagueReputation: state.reputation.league.value,
    minutes60d: minutesInLastDays(state, N.minutesWindowDays),
    leadership: state.player.attributes.leadership,
    caps: state.national.caps,
  };
}

/** Vrai si les signaux atteignent le seuil d'ENTRÉE dans `stage` (marge additive, négative pour un contrôle de rétrogradation plus tolérant). */
function meetsStage(stage: NationalStage, s: Signals, margin: number): boolean {
  const S = N.stages;
  switch (stage) {
    case 'aucun':
      return true;
    case 'espoirs':
      return s.age <= S.espoirsMaxAge && s.avgRating >= S.espoirs.minRating - margin && s.leagueReputation >= S.espoirs.minLeagueReputation - margin;
    case 'pre_liste':
      return s.avgRating >= S.preListe.minRating - margin && s.leagueReputation >= S.preListe.minLeagueReputation - margin && s.age >= S.preListe.minAge;
    case 'convoque':
      return s.avgRating >= S.convoque.minRating - margin && s.leagueReputation >= S.convoque.minLeagueReputation - margin
        && s.minutes60d >= Math.max(0, S.convoque.minMinutes60d - margin * 40);
    case 'titulaire':
      return s.avgRating >= S.titulaire.minRating - margin && s.leagueReputation >= S.titulaire.minLeagueReputation - margin && s.caps >= S.titulaire.minCaps;
    case 'cadre':
      return s.avgRating >= S.cadre.minRating - margin && s.leagueReputation >= S.cadre.minLeagueReputation - margin && s.caps >= S.cadre.minCaps;
    case 'capitaine':
      return s.avgRating >= S.capitaine.minRating - margin && s.leagueReputation >= S.capitaine.minLeagueReputation - margin
        && s.caps >= S.capitaine.minCaps && s.leadership >= S.capitaine.minLeadership;
    default:
      return false;
  }
}

function stageIndex(stage: NationalStage): number {
  return NATIONAL_STAGES.indexOf(stage);
}

function createSelectionEvent(state: CareerState, reason: string, promoted: boolean): GameEvent {
  const event: GameEvent = {
    id: `evt-selection-${state.national.countryCode}-${state.currentDate}`,
    definitionId: 'national_selection_update',
    category: 'selection',
    date: state.currentDate,
    title: promoted ? 'Convocation en sélection' : 'Sélection : statut réévalué',
    facts: { pays: countryName(state.national.countryCode), stage: state.national.stage, raison: reason },
    npcIds: state.national.selectionneurId ? [state.national.selectionneurId] : [],
    resolved: true,
  };
  state.events.push(event);
  return event;
}

/**
 * Évalue le joueur pour la sélection nationale à l'occasion d'une trêve
 * internationale et fait évoluer `state.national.stage` d'au plus un cran
 * (promotion si les seuils du palier suivant sont atteints, sinon
 * rétrogradation d'un cran si les seuils du palier courant ne sont plus
 * tenus avec la marge de `NATIONAL_BALANCE.national.stages`). Crée le PNJ
 * sélectionneur (une fois par pays, via `ensureNationalSquad`) et un
 * `GameEvent` 'selection' quand le statut change.
 */
export function evaluateSelection(state: CareerState): { stage: NationalStage; changed: boolean; reason: string } {
  const country = state.national.countryCode;
  const club = ensureNationalSquad(state, country);
  if (!state.national.selectionneurId) state.national.selectionneurId = club.coachId;

  const current = state.national.stage;
  const signals = computeSignals(state);
  if (!signals.hasSample) return { stage: current, changed: false, reason: 'Pas assez de matchs récents pour être évalué.' };

  const currentIndex = stageIndex(current);
  const nextStage = NATIONAL_STAGES[currentIndex + 1];

  if (nextStage && meetsStage(nextStage, signals, 0)) {
    state.national.stage = nextStage;
    if (CALLED_UP_STAGES.includes(nextStage) && !state.national.firstCallOn) state.national.firstCallOn = state.currentDate;
    const reason = `Promotion : ${nextStage} (note ${signals.avgRating.toFixed(2)}, réputation ligue ${signals.leagueReputation}).`;
    addLog(state, 'selection', `${countryName(country)} : ${reason}`);
    addMemory(state, { date: state.currentDate, type: 'selection', importance: 3, summary: reason, entities: [country] });
    createSelectionEvent(state, reason, true);
    return { stage: nextStage, changed: true, reason };
  }

  if (current !== 'aucun' && !meetsStage(current, signals, N.stages.demotionMarginRating)) {
    const previous = NATIONAL_STAGES[currentIndex - 1] ?? 'aucun';
    state.national.stage = previous;
    const reason = `Rétrogradation : ${previous} (note ${signals.avgRating.toFixed(2)}, réputation ligue ${signals.leagueReputation}).`;
    addLog(state, 'selection', `${countryName(country)} : ${reason}`);
    createSelectionEvent(state, reason, false);
    return { stage: previous, changed: true, reason };
  }

  return { stage: current, changed: false, reason: 'Statut inchangé.' };
}

// ── Matchs de trêve ──────────────────────────────────────────────────────

function importanceFor(a: string, b: string): number {
  const avg = (countryStrength(a) + countryStrength(b)) / 2;
  return Math.round(clamp(N.matchImportanceBase + N.matchImportancePerStrengthPoint * avg, 0, 100));
}

/**
 * Planifie les matchs de la trêve (par défaut `NATIONAL_BALANCE.national.matchesPerBreak`,
 * soit 2) pour la sélection du joueur si son statut le convoque. Idempotent
 * pour un `breakStart` donné (les matchs déjà créés sont renvoyés tels quels
 * plutôt que redoublés). Les adversaires sont des sélections de force voisine
 * générées via `ensureNationalSquad`.
 *
 * Point à brancher (voir rapport) : ces matchs doivent être joués comme les
 * matchs du joueur par la boucle quotidienne, mais `match/simulateMatch
 * .buildMatchContext` ne détecte pas le joueur sur un club `nat_<CODE>` —
 * utiliser `national/matchContext.buildInternationalMatchContext` à la place
 * de `buildMatchContext` quand `match.competitionId === 'international'`.
 */
export function scheduleInternationalMatches(state: CareerState, breakStart: ISODate): Match[] {
  const country = state.national.countryCode;
  if (!CALLED_UP_STAGES.includes(state.national.stage)) return [];

  const home = ensureNationalSquad(state, country);
  const rng = nextRng(state, `national:${country}:matches:${breakStart}`);
  const opponents = pickOpponentCountries(country, N.matchesPerBreak, rng);
  const matches: Match[] = [];
  let date = breakStart;

  for (let i = 0; i < opponents.length; i++) {
    const opponentCountry = opponents[i]!;
    const id = `intl-${country}-${breakStart}-${i + 1}`;
    const existing = state.matches[id];
    if (existing) {
      matches.push(existing);
      date = addDays(date, N.daysBetweenMatches);
      continue;
    }
    const away = ensureNationalSquad(state, opponentCountry);
    const playerHome = rng.chance(0.5);
    const homeClubId = playerHome ? home.id : away.id;
    const awayClubId = playerHome ? away.id : home.id;
    const match: Match = {
      id,
      seasonId: state.season.id,
      competitionId: INTERNATIONAL_COMPETITION_ID,
      round: 'amical',
      date,
      homeClubId,
      awayClubId,
      neutralVenue: false,
      status: 'a_venir',
      importance: importanceFor(country, opponentCountry),
      involvesPlayer: true,
    };
    state.matches[id] = match;
    matches.push(match);
    date = addDays(date, N.daysBetweenMatches);
  }

  state.national.lastCallOn = breakStart;
  addLog(state, 'selection', `Convoqué(e) avec ${countryName(country)} pour la trêve du ${breakStart} (${matches.length} match(s)).`);
  return matches;
}

/**
 * Enregistre le résultat d'un match international pour le joueur : stats
 * dans `seasonStats.byCompetition['international']`, `national.caps/goals
 * /assists`. Verrouille la sélection (`lockedIn`) dès la première apparition
 * réelle (minutes > 0), conformément à « première convocation A + match
 * joué ». N'affecte ni la confiance du coach de club ni les statistiques de
 * championnat — c'est un match distinct.
 */
export function recordInternationalResult(state: CareerState, match: Match): void {
  if (match.competitionId !== INTERNATIONAL_COMPETITION_ID) return;
  const report = match.result?.playerReport;
  if (!report || report.minutesPlayed <= 0) return;

  // Les statistiques (total, par compétition, carrière) sont cumulées par calendar/matchEffects.applyPlayerMatchEffects
  // comme pour tout match du joueur ; ici seulement les sélections, buts et passes en équipe nationale.
  const nat = state.national;
  nat.caps += 1;
  nat.goals += report.stats.goals;
  nat.assists += report.stats.assists;
  if (!nat.firstCallOn) nat.firstCallOn = match.date;
  nat.lastCallOn = match.date;
  nat.lockedIn = true;

  const line = `Sélection ${countryName(nat.countryCode)} : ${report.stats.goals} but(s), ${report.stats.assists} passe(s) en ${report.minutesPlayed} min.`;
  addLog(state, 'selection', line);
  if (report.stats.goals > 0 || report.motm) {
    addMemory(state, {
      date: match.date, type: 'selection', importance: report.motm ? 4 : 3, summary: line, entities: [match.id, nat.countryCode],
    });
  }
}

/** Ré-export pratique pour les appelants (tests, futur branchement) : détection de convocation. */
export { isPlayerCalledUp };
