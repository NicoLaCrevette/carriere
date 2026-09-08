/**
 * Boucle quotidienne (§4) : joue la journée courante puis passe au
 * lendemain. Entraînement (choisi ou par défaut en mode auto), matchs de la
 * date (le joueur en auto, ou laissé à l'interface en mode interactif, les
 * autres en fond), récupération, blessures, vieillissement, valeur marchande
 * le 1er du mois, dérive de réputation le dimanche, fin de saison le 30 juin.
 * Mute state.
 *
 * Mode interactif : `advanceDay` s'arrête avant le match du joueur et le
 * signale (`pendingPlayerMatchId`, `state.pendingDay`) ; l'interface joue le
 * match via `match/simulateMatch` puis appelle `completePlayerMatch` qui
 * applique le résultat et termine la journée.
 */
import type {
  AttributeGain, CalendarDay, CareerState, DayKind, DayResult, Id, Injury, ISODate, Match, MatchContext, MatchResult, TrainingFocus,
} from '../types';
import { BALANCE } from '../config/balance';
import { difficultyProfile } from '../config/difficulty';
import { addDays, ageAt, compareDates, dayNumber, dayOf, dayOfWeek, diffDays } from './dates';
import { nextRng, pruneRngCounters } from '../rng/derive';
import { addLog, clamp } from '../career/apply';
import { evaluatePromises } from '../career/promises';
import { dayActionsFor, dayKindFor, seasonPhaseFor, todayCalendarDay, TRAINING_DAY_KINDS } from './dayKind';
import { applyPlayerMatchEffects } from './matchEffects';
import { applyResultToTable } from '../season/table';
import { updateNpcAfterMatch, dailyNpcRecovery } from '../season/npcProgression';
import { updatePositionHierarchy, weeklyCoachTrustDrift } from '../season/lineupSelection';
import { compactBackgroundMatch, compactOldPlayerMatches } from '../season/compactMatches';
import { weeklyReputationDrift } from '../reputation/reputation';
import { closeSeason, startNextSeason } from '../season/endOfSeason';
import { runTraining } from '../player/training';
import { dailyRecovery } from '../player/fitness';
import { advanceInjuries } from '../player/injuries';
import { applyAgeing } from '../player/progression';
import { computeOverall } from '../player/overall';
import { computeMarketValue } from '../player/marketValue';
import { buildMatchContext, runBackgroundMatch, runMatchAuto } from '../match/simulateMatch';
import { expireOffers, rollTransferOffers, transferWindowOpen } from '../transfers/offers';
import { rollContractRenewal, runScheduledTransfers } from '../transfers/negotiate';
import { evaluateTraits } from '../career/traits';
import { accrueMatchBonuses, accrueMonthlyEarnings, rollSponsorOffers } from '../career/sponsors';
import { retire } from '../career/retirement';
import { evaluateSelection, recordInternationalResult, scheduleInternationalMatches } from '../national/selection';
import { buildInternationalMatchContext } from '../national/matchContext';
import { INTERNATIONAL_COMPETITION_ID } from '../national/squads';
import { advanceStorylines, expireEvent, maybeChangeCoach, rollDailyEvents } from '../events/roll';
import { EVENTS_BALANCE } from '../config/balance/events';

/** Un événement laissé sans réponse pendant ce délai se referme sans issue (le silence n'est pas puni). */
const EVENT_DEFAULT_RESOLUTION_DAYS = EVENTS_BALANCE.events.expiryDaysWithoutAnswer;

export interface DayChoices {
  training?: { focus: TrainingFocus; intensity: 'legere' | 'normale' | 'intense' };
  /** 'interactif' : le match du joueur est laissé à l'interface (défaut : auto). */
  playerMatchMode?: 'auto' | 'interactif';
}

/** Hooks optionnels : autosave en fin de journée (l'état n'est pas modifié par le hook). */
export interface DayHooks { onDayCompleted?: (state: CareerState, result: DayResult) => void }

function emptyResult(date: ISODate, kind: DayKind): DayResult {
  return { date, kind, newInjuries: [], attributeGains: [], reputationChanges: [], messages: [] };
}

function isMatchOfDay(m: Match, date: ISODate): boolean {
  return m.date === date && m.status === 'a_venir';
}

/**
 * Ligne « les autres matchs de la journée » : utile dans le résumé d'une
 * journée, pur bruit dans un bilan de semaine. Le bilan la reconnaît en
 * appelant cette fonction, jamais en devinant sa formulation.
 */
export function messageMatchsDeFond(nombre: number): string {
  return `${nombre} match(s) joué(s) ailleurs dans la journée.`;
}

/** Match du joueur à cette date, s'il n'est pas encore joué. */
export function playerMatchOfDay(state: CareerState, date: ISODate): Match | undefined {
  return Object.values(state.matches).find((m) => isMatchOfDay(m, date) && m.involvesPlayer);
}

/** Vrai pour un match de sélection nationale. */
export function isInternationalMatch(match: Match): boolean {
  return match.competitionId === INTERNATIONAL_COMPETITION_ID;
}

/** Contexte de match adapté à la compétition : club ou sélection nationale. */
export function buildContextFor(state: CareerState, match: Match, mode: 'auto' | 'interactif'): MatchContext {
  return isInternationalMatch(match) ? buildInternationalMatchContext(state, match, mode) : buildMatchContext(state, match, mode);
}

/** Applique un résultat au monde : match, classement, PNJ, sélections (caps, buts). */
export function applyMatchToWorld(state: CareerState, match: Match, result: MatchResult): void {
  match.result = result;
  match.status = 'joue';
  const ls = state.season.leagues[match.competitionId];
  if (ls) applyResultToTable(ls, match, state.world.leagues[match.competitionId]?.format);
  updateNpcAfterMatch(state.world, result, match);
  if (isInternationalMatch(match)) recordInternationalResult(state, match);
  // Le monde a tout pris : un match d'un autre club n'a plus besoin de son détail (taille de la sauvegarde).
  compactBackgroundMatch(match);
}

/** Joue tous les matchs d'une date pour toutes les ligues (sauf celui à ignorer) : classement et PNJ mis à jour. */
export function playMatchesOfDay(state: CareerState, date: ISODate, options: { skipMatchId?: Id } = {}): MatchResult[] {
  const results: MatchResult[] = [];
  const matches = Object.values(state.matches)
    .filter((m) => isMatchOfDay(m, date) && m.id !== options.skipMatchId)
    .sort((a, b) => Number(b.involvesPlayer) - Number(a.involvesPlayer) || a.id.localeCompare(b.id));
  for (const match of matches) {
    match.status = 'en_cours';
    const result = match.involvesPlayer ? runMatchAuto(buildContextFor(state, match, 'auto')) : runBackgroundMatch(state, match);
    applyMatchToWorld(state, match, result);
    results.push(result);
  }
  return results;
}

/**
 * Entraînement choisi, ou par défaut (mode auto) : veille et lendemain de
 * match ont leur séance fixe, les autres jours suivent une rotation propre
 * au poste (un attaquant ne fait pas que du physique).
 */
function trainingFor(state: CareerState, kind: DayKind, choices: DayChoices | undefined): DayChoices['training'] | undefined {
  if (choices?.training) return choices.training;
  if (!TRAINING_DAY_KINDS.includes(kind)) return undefined;
  const fixed = BALANCE.career.defaultTraining[kind];
  if (!fixed) return undefined;
  if (kind === 'veille_match' || kind === 'lendemain_match') return fixed;
  const rotation = BALANCE.career.autoTrainingRotation[state.player.identity.position];
  const focus = rotation[dayNumber(state.currentDate) % rotation.length] ?? fixed.focus;
  return { focus, intensity: fixed.intensity };
}

function runDayTraining(state: CareerState, day: CalendarDay, kind: DayKind, choices: DayChoices | undefined, result: DayResult): void {
  const training = trainingFor(state, kind, choices);
  if (!training || state.player.injuries.some((i) => i.daysRemaining > 0)) return;
  const club = state.world.clubs[state.player.contract.clubId];
  if (!club) return;
  const profile = difficultyProfile(state.settings.difficulty);
  const rng = nextRng(state, `jour:${state.currentDate}`);
  const { injury, ...trainingResult } = runTraining(state.player, training.focus, training.intensity, club, profile, state.currentDate, rng);
  result.training = trainingResult;
  result.attributeGains.push(...trainingResult.gains);
  if (injury && !state.player.injuries.some((i) => i.id === injury.id)) state.player.injuries.push(injury);
  const action = day.actions.find((a) => a.kind.type === 'entrainement' && a.kind.focus === training.focus && a.kind.intensity === training.intensity);
  if (action) action.done = true;
  for (const g of trainingResult.gains) result.messages.push(`${g.key} : ${g.from} → ${g.to}`);
}

/** Récupération, blessures, vieillissement, dérives du moral et de la confiance. */
function dailyUpkeep(state: CareerState, kind: DayKind, age: number, result: DayResult): void {
  const p = state.player;
  const rng = nextRng(state, `jour:${state.currentDate}`);
  const healed = advanceInjuries(p, state.currentDate, rng);
  for (const h of healed) result.messages.push(`Guérison : ${h.type} (${h.actualDays} jours).`);
  dailyRecovery(p, kind, age);
  dailyNpcRecovery(state.world, state.currentDate, rng);
  const ageing: AttributeGain[] = applyAgeing(p, age);
  result.attributeGains.push(...ageing);
  const g = BALANCE.bounds.gauge;
  const mor = BALANCE.career.morale;
  p.morale = clamp(p.morale + clamp(mor.baseline - p.morale, -mor.dailyDriftToBaseline, mor.dailyDriftToBaseline), g.min, g.max);
  const conf = BALANCE.career.confidence;
  p.confidence = clamp(p.confidence + clamp(conf.baseline - p.confidence, -conf.dailyDriftToBaseline, conf.dailyDriftToBaseline), g.min, g.max);
}

function monthlyMarketValue(state: CareerState, age: number, result: DayResult): void {
  const p = state.player;
  const club = state.world.clubs[p.contract.clubId];
  const league = club ? state.world.leagues[club.leagueId] : undefined;
  if (!club || !league) return;
  const before = p.marketValue;
  p.marketValue = computeMarketValue(p, age, club, league, state.world.marketInflation, state.currentDate);
  p.marketValueHistory.push({ date: state.currentDate, value: p.marketValue });
  if (p.marketValue !== before) result.messages.push(`Valeur marchande : ${Math.round(p.marketValue / 1000)} k€.`);
}

/** Fin de prêt : le joueur retourne à son club propriétaire avant que la saison suivante soit construite. */
function returnFromLoanIfDue(state: CareerState, result: DayResult): void {
  const contract = state.player.contract;
  const ownerId = contract.loanFromClubId;
  if (!ownerId) return;
  const owner = state.world.clubs[ownerId];
  const loanClub = state.world.clubs[contract.clubId];
  if (!owner) {
    delete contract.loanFromClubId;
    return;
  }
  // Retour au contrat d'origine (salaire, rôle promis, primes, échéance), pas à celui du club prêteur.
  const origine = contract.loanOriginal;
  if (origine) {
    state.player.contract = { ...origine, clubId: ownerId };
  } else {
    contract.clubId = ownerId;
    delete contract.loanFromClubId;
  }
  state.player.coachTrust = BALANCE.depth.transfers.execution.coachTrustAfter;
  updatePositionHierarchy(state, ownerId);
  if (loanClub) updatePositionHierarchy(state, loanClub.id);
  addLog(state, 'transfert', `Fin de prêt : retour à ${owner.name}${loanClub ? ` après une saison à ${loanClub.name}` : ''}.`);
  result.messages.push(`Fin de prêt : retour à ${owner.name}.`);
}

/** Fin de saison : clôture, retraite forcée ou saison suivante. */
function endOfSeasonIfDue(state: CareerState, age: number, result: DayResult): void {
  if (compareDates(state.currentDate, state.season.endDate) < 0) return;
  const record = closeSeason(state);
  result.messages.push(`Saison ${record.label} terminée : ${record.leagueRank}e, ${record.stats.total.goals} buts, note moyenne ${record.averageRating.toFixed(2)}.`);
  if (BALANCE.career.retirementCheckAtSeasonEnd && age >= BALANCE.career.retirementAge.forcedAt) {
    const summary = retire(state, `${age} ans, fin de saison`);
    result.messages.push(`Fin de carrière. ${summary.verdict}`);
    return;
  }
  returnFromLoanIfDue(state, result);
  startNextSeason(state);
  result.messages.push(`Nouvelle saison ${state.season.label}.`);
}

interface StartedDay {
  day: CalendarDay;
  kind: DayKind;
  result: DayResult;
  age: number;
  injuriesBefore: Set<Id>;
}

/** Première partie de la journée : type, actions, entraînement. */
function startDay(state: CareerState, choices: DayChoices | undefined): StartedDay {
  const date = state.currentDate;
  state.reputationDeltasToday = {};
  const day = todayCalendarDay(state);
  const kind = dayKindFor(state, date);
  if (day.kind !== kind) {
    day.kind = kind;
    day.actions = dayActionsFor(state, day);
  }
  state.season.phase = seasonPhaseFor(kind, date);
  const result = emptyResult(date, kind);
  const injuriesBefore = new Set(state.player.injuries.map((i) => i.id));
  const age = ageAt(state.player.identity.birthDate, date);
  runDayTraining(state, day, kind, choices, result);
  return { day, kind, result, age, injuriesBefore };
}

/** Seconde partie de la journée : entretien, échéances, fin de saison, passage au lendemain. */
function finishDay(state: CareerState, started: StartedDay, hooks: DayHooks | undefined): DayResult {
  const { day, kind, result, age, injuriesBefore } = started;
  const date = state.currentDate;
  const clubId = state.player.contract.clubId;

  dailyUpkeep(state, kind, age, result);
  state.player.overall = computeOverall(state.player.attributes, state.player.identity.position);
  for (const p of evaluatePromises(state)) result.messages.push(p.status === 'tenue' ? `Promesse tenue : « ${p.text} ».` : `Promesse rompue : « ${p.text} ».`);

  try {
    const expired = expireOffers(state);
    for (const o of expired) result.messages.push(`Offre de ${state.world.clubs[o.clubId]?.name ?? o.clubId} expirée.`);
  } catch (e) {
    addLog(state, 'systeme', `Erreur mercato (expiration des offres) : ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (transferWindowOpen(state, date)) {
      for (const t of runScheduledTransfers(state)) {
        result.messages.push(`Transfert programmé finalisé : ${state.world.clubs[t.fromClubId]?.name ?? t.fromClubId} → ${state.world.clubs[t.toClubId]?.name ?? t.toClubId}.`);
      }
      for (const o of rollTransferOffers(state)) {
        const club = state.world.clubs[o.clubId];
        const amount = o.loan ? 'prêt' : `${Math.round(o.fee / 1_000_000)} M€`;
        result.messages.push(`Offre de ${club?.name ?? o.clubId} : ${amount}, ${Math.round(o.wageMonthly / 1000)} k€/mois sur ${o.years} an(s).`);
      }
    }
  } catch (e) {
    addLog(state, 'systeme', `Erreur mercato (offres) : ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (dayOf(date) === 1) {
      const renewal = rollContractRenewal(state);
      if (renewal) result.messages.push(`Offre de ${state.world.clubs[renewal.clubId]?.name ?? renewal.clubId} : prolongation de contrat.`);
    }
  } catch (e) {
    addLog(state, 'systeme', `Erreur mercato (prolongation) : ${e instanceof Error ? e.message : String(e)}`);
  }

  // Traits, primes, sponsors et revenus (Phase 6) : après un match du joueur et chaque 1er du mois.
  try {
    const playedToday = !!result.matchResult?.playerReport;
    if (playedToday) accrueMatchBonuses(state, result.matchResult!.playerReport!);
    if (dayOf(date) === 1) {
      accrueMonthlyEarnings(state);
      for (const d of rollSponsorOffers(state)) result.messages.push(`Proposition de sponsoring : ${d.brand}, ${Math.round(d.amountYearly / 1000)} k€ par an.`);
    }
    if (playedToday || dayOf(date) === 1) {
      for (const t of evaluateTraits(state)) result.messages.push(`Nouveau trait : ${t.label}.`);
    }
  } catch (e) {
    addLog(state, 'systeme', `Erreur profondeur (traits, sponsors) : ${e instanceof Error ? e.message : String(e)}`);
  }

  // Sélection nationale : la veille d'une trêve, le sélectionneur tranche et les matchs de la trêve sont programmés.
  try {
    const tomorrow = addDays(date, 1);
    const brk = state.season.internationalBreaks.find(([from]) => from === tomorrow);
    if (brk) {
      const verdict = evaluateSelection(state);
      if (verdict.changed) result.messages.push(`Sélection : ${verdict.reason}`);
      for (const m of scheduleInternationalMatches(state, brk[0])) {
        result.messages.push(`Match international le ${m.date} : ${state.world.clubs[m.homeClubId]?.name ?? m.homeClubId} – ${state.world.clubs[m.awayClubId]?.name ?? m.awayClubId}.`);
      }
    }
  } catch (e) {
    addLog(state, 'systeme', `Erreur sélection : ${e instanceof Error ? e.message : String(e)}`);
  }

  // Événements et storylines : au plus un événement par jour ; changement d'entraîneur au lendemain d'un match.
  try {
    for (const ev of rollDailyEvents(state)) result.messages.push(`Événement : ${ev.title}.`);
    for (const ev of state.events) {
      if (!ev.resolved && diffDays(ev.date, date) >= EVENT_DEFAULT_RESOLUTION_DAYS) expireEvent(state, ev.id);
    }
    advanceStorylines(state);
    if (kind === 'lendemain_match' && maybeChangeCoach(state)) result.messages.push('Changement d\'entraîneur au club.');
  } catch (e) {
    addLog(state, 'systeme', `Erreur événements : ${e instanceof Error ? e.message : String(e)}`);
  }

  if (dayOf(date) === BALANCE.marketValue.recomputeDayOfMonth) monthlyMarketValue(state, age, result);
  if (dayOfWeek(date) === 0) {
    weeklyReputationDrift(state);
    updatePositionHierarchy(state, clubId);
    weeklyCoachTrustDrift(state);
    compactOldPlayerMatches(state);
  }
  const newInjuries: Injury[] = state.player.injuries.filter((i) => !injuriesBefore.has(i.id));
  result.newInjuries.push(...newInjuries);
  for (const i of newInjuries) {
    result.messages.push(`Blessure : ${i.type}, ${i.announcedDays} jours annoncés.`);
    addLog(state, 'blessure', `Blessure (${i.origin}) : ${i.type}, ${i.announcedDays} jours annoncés.`);
  }

  endOfSeasonIfDue(state, age, result);

  day.completed = true;
  state.currentDate = addDays(date, 1);
  // Compteurs de tirages des journées passées : jamais réutilisés, purgés avant la sauvegarde.
  if (dayOfWeek(date) === 0) pruneRngCounters(state);
  hooks?.onDayCompleted?.(state, result);
  return result;
}

/**
 * Journée complète : entraînement, matchs, entretien quotidien, échéances,
 * passage au lendemain. En mode interactif avec un match du joueur, s'arrête
 * avant ce match (voir `completePlayerMatch`).
 */
export function advanceDay(state: CareerState, choices?: DayChoices, hooks?: DayHooks): DayResult {
  const date = state.currentDate;
  if (state.retired) return emptyResult(date, 'vacances');
  if (state.pendingDay) throw new Error('Journée interactive en attente : le match du joueur doit être terminé (completePlayerMatch).');
  const started = startDay(state, choices);
  const playerMatch = playerMatchOfDay(state, date);

  if (playerMatch && choices?.playerMatchMode === 'interactif') {
    playMatchesOfDay(state, date, { skipMatchId: playerMatch.id });
    // Un autre match du joueur le même jour (club et sélection) est joué automatiquement : ses effets s'appliquent tout de suite.
    for (const m of Object.values(state.matches)) {
      if (m.date === date && m.id !== playerMatch.id && m.involvesPlayer && m.status === 'joue' && m.result) {
        applyPlayerMatchEffects(state, m, m.result, started.result);
      }
    }
    state.pendingDay = { date, kind: started.kind, matchId: playerMatch.id, injuriesBefore: [...started.injuriesBefore], result: started.result };
    started.result.pendingPlayerMatchId = playerMatch.id;
    return started.result;
  }

  const results = playMatchesOfDay(state, date);
  // Tous les matchs du joueur de la journée (un club et une sélection peuvent se croiser) : aucun effet ne doit être perdu.
  const playerMatches = Object.values(state.matches)
    .filter((m) => m.date === date && m.involvesPlayer && m.status === 'joue' && m.result)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (playerMatches.length > 0) {
    for (const m of playerMatches) applyPlayerMatchEffects(state, m, m.result!, started.result);
    updatePositionHierarchy(state, state.player.contract.clubId);
  } else if (results.length > 0) {
    started.result.messages.push(messageMatchsDeFond(results.length));
  }
  return finishDay(state, started, hooks);
}

/**
 * Mode interactif : applique le résultat du match du joueur (joué par
 * l'interface via match/simulateMatch) puis termine la journée commencée.
 */
export function completePlayerMatch(state: CareerState, matchResult: MatchResult, hooks?: DayHooks): DayResult {
  const pending = state.pendingDay;
  if (!pending) throw new Error('Aucune journée interactive en attente.');
  const match = state.matches[pending.matchId];
  if (!match) throw new Error(`Match introuvable : ${pending.matchId}`);
  if (match.status !== 'joue') applyMatchToWorld(state, match, matchResult);
  applyPlayerMatchEffects(state, match, matchResult, pending.result);
  updatePositionHierarchy(state, state.player.contract.clubId);
  state.pendingDay = undefined;
  state.liveMatch = undefined;
  const started: StartedDay = {
    day: todayCalendarDay(state),
    kind: pending.kind,
    result: pending.result,
    age: ageAt(state.player.identity.birthDate, state.currentDate),
    injuriesBefore: new Set(pending.injuriesBefore),
  };
  return finishDay(state, started, hooks);
}
