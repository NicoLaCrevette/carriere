/**
 * Tirage, résolution, storylines et changement d'entraîneur
 * (docs/PHASE6_CONTRACTS.md § `src/engine/events/roll.ts`).
 *
 * Aucun branchement dans `finishDay` ici (voir le rapport final pour l'ordre
 * et les conditions à brancher) : les quatre fonctions sont autonomes.
 */
import type { CareerState, Coach, GameEvent, Id, Match, Storyline } from '../types';
import type { Rng } from '../rng/mulberry32';
import { EVENT_CATALOGUE, type EventDefinition } from './catalogue';
import { EVENTS_BALANCE } from '../config/balance/events';
import { nextRng } from '../rng/derive';
import { addDays, diffDays, isBefore } from '../calendar/dates';
import { addLog, addMemory, clamp } from '../career/apply';
import { generateCoach } from '../world/generateSquad';

const E = EVENTS_BALANCE.events;

// ── Tirage quotidien ─────────────────────────────────────────────────────

function lastOccurrence(state: CareerState, definitionId: Id): GameEvent | undefined {
  let last: GameEvent | undefined;
  for (const e of state.events) {
    if (e.definitionId !== definitionId) continue;
    if (!last || e.date > last.date) last = e;
  }
  return last;
}

function firedThisSeason(state: CareerState, definitionId: Id): boolean {
  return state.events.some((e) => e.definitionId === definitionId && !isBefore(e.date, state.season.startDate));
}

function isEligible(state: CareerState, def: EventDefinition): boolean {
  if (def.weight(state) <= 0) return false;
  if (def.oncePerSeason && firedThisSeason(state, def.id)) return false;
  const last = lastOccurrence(state, def.id);
  if (!last) return true;
  const cooldown = def.cooldownDays > 0 ? def.cooldownDays : E.cooldownDaysDefault;
  return diffDays(last.date, state.currentDate) >= cooldown;
}

/** Catégorie de journal la plus proche pour une catégorie d'événement. */
function logCategoryFor(category: GameEvent['category']): 'selection' | 'blessure' | 'vie' {
  if (category === 'selection') return 'selection';
  if (category === 'blessure') return 'blessure';
  return 'vie';
}

function triggerEvent(state: CareerState, def: EventDefinition, rng: Rng): GameEvent {
  const facts = def.facts(state, rng);
  const npcIds = def.npcIds(state, rng);
  def.immediate?.(state);

  const id = `evt-${state.events.length + 1}-${state.currentDate}`;
  let storylineId: Id | undefined;
  if (def.storyline) {
    const deadlineDays = def.storyline.deadlineDays > 0 ? def.storyline.deadlineDays : E.storylineDeadlineDaysDefault;
    const storyline: Storyline = {
      id,
      kind: def.storyline.kind,
      title: def.storyline.title,
      startedOn: state.currentDate,
      deadline: addDays(state.currentDate, deadlineDays),
      status: 'ouverte',
      stage: 'ouverte',
      vars: {},
      npcIds: [...npcIds],
      log: [{ date: state.currentDate, text: 'Ouverture.' }],
    };
    state.storylines.push(storyline);
    storylineId = storyline.id;
  }

  const event: GameEvent = {
    id, definitionId: def.id, category: def.category, date: state.currentDate, title: def.title, facts, npcIds, storylineId, resolved: false,
  };
  state.events.push(event);
  addLog(state, logCategoryFor(def.category), def.title);
  return event;
}

/**
 * Tirage quotidien : au plus un événement par jour (probabilité totale
 * `EVENTS_BALANCE.events.dailyProb`), pondéré parmi les définitions
 * éligibles (poids > 0, cooldown et unicité par saison respectés). Crée le
 * `GameEvent` (`resolved: false`) et la storyline éventuelle.
 */
export function rollDailyEvents(state: CareerState): GameEvent[] {
  const rng = nextRng(state, 'events:roll');
  if (!rng.chance(E.dailyProb)) return [];
  // Plafond glissant : une vie normale n'enchaîne pas les coups du sort tous les deux jours.
  const lastWeek = state.events.filter((e) => diffDays(e.date, state.currentDate) < 7).length;
  if (lastWeek >= E.maxPerWeek) return [];
  const candidates = EVENT_CATALOGUE.filter((def) => isEligible(state, def));
  if (candidates.length === 0) return [];
  const weights = candidates.map((def) => def.weight(state));
  const chosen = rng.weighted(candidates, weights);
  return [triggerEvent(state, chosen, rng)];
}

// ── Résolution ───────────────────────────────────────────────────────────

/**
 * Résout un événement avec l'issue choisie (par la scène ou par défaut à
 * l'expiration) : applique l'issue (`outcomes[].apply`), marque l'événement
 * résolu, et clôt génériquement sa storyline éventuelle si elle est encore
 * ouverte (statut « resolue », trace dans `resolution`).
 */
export function resolveEvent(state: CareerState, eventId: Id, outcomeId: string): void {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) throw new Error(`Événement inconnu : ${eventId}`);
  if (event.resolved) return;
  const def = EVENT_CATALOGUE.find((d) => d.id === event.definitionId);
  if (!def) throw new Error(`Définition d'événement inconnue : ${event.definitionId}`);
  const outcome = def.outcomes.find((o) => o.id === outcomeId) ?? def.outcomes[0];
  if (!outcome) throw new Error(`Aucune issue disponible pour l'événement ${event.definitionId}`);

  outcome.apply(state);
  event.resolved = true;

  if (event.storylineId) {
    const storyline = state.storylines.find((s) => s.id === event.storylineId);
    if (storyline && storyline.status === 'ouverte') {
      storyline.status = 'resolue';
      storyline.log.push({ date: state.currentDate, text: `Résolue : ${outcome.label}` });
      storyline.resolution = { date: state.currentDate, text: `${storyline.title} : ${outcome.label}` };
    }
  }
  addLog(state, logCategoryFor(event.category), `${event.title} → ${outcome.label}`);
}

/**
 * Referme un événement resté sans réponse : AUCUNE issue n'est appliquée. Le
 * moteur ne punit pas le silence — les conséquences viennent de ce que le
 * joueur dit ou fait (§6.2, §8). La storyline éventuelle est marquée expirée.
 */
export function expireEvent(state: CareerState, eventId: Id): void {
  const event = state.events.find((e) => e.id === eventId);
  if (!event || event.resolved) return;
  event.resolved = true;
  if (event.storylineId) {
    const storyline = state.storylines.find((s) => s.id === event.storylineId);
    if (storyline && storyline.status === 'ouverte') {
      storyline.status = 'expiree';
      storyline.log.push({ date: state.currentDate, text: 'Close sans réaction du joueur.' });
      storyline.resolution = { date: state.currentDate, text: `${storyline.title} : passé sans que tu y réagisses.` };
    }
  }
  addLog(state, logCategoryFor(event.category), `${event.title} → passé sans réaction de ta part.`);
}

// ── Storylines ───────────────────────────────────────────────────────────

/**
 * Fait vivre les storylines ouvertes : une échéance dépassée sans résolution
 * expire la storyline (statut « expiree », trace permanente dans
 * `resolution`, journal). Ne touche pas les storylines déjà closes.
 */
export function advanceStorylines(state: CareerState): void {
  for (const storyline of state.storylines) {
    if (storyline.status !== 'ouverte') continue;
    if (!storyline.deadline || !isBefore(storyline.deadline, state.currentDate)) continue;
    storyline.status = 'expiree';
    const text = 'Classée sans suite, faute de résolution dans les temps.';
    storyline.log.push({ date: state.currentDate, text });
    storyline.resolution = { date: state.currentDate, text: `${storyline.title} : ${text}` };
    addLog(state, 'vie', `Storyline expirée : ${storyline.title}.`);
  }
}

// ── Changement d'entraîneur ──────────────────────────────────────────────

function leagueMatchesThisSeason(state: CareerState, clubId: Id, leagueId: Id): Match[] {
  // Les matchs du joueur des saisons passées restent en mémoire : sans filtre de saison,
  // un entraîneur serait jugé sur la série noire de l'an dernier.
  return Object.values(state.matches).filter(
    (m) => m.status === 'joue' && m.seasonId === state.season.id && m.competitionId === leagueId && (m.homeClubId === clubId || m.awayClubId === clubId),
  );
}

function pointsFrom(matches: Match[], clubId: Id): number {
  let points = 0;
  for (const m of matches) {
    const result = m.result;
    if (!result) continue;
    const home = m.homeClubId === clubId;
    const gf = home ? result.homeGoals : result.awayGoals;
    const ga = home ? result.awayGoals : result.homeGoals;
    points += gf > ga ? 3 : gf === ga ? 1 : 0;
  }
  return points;
}

/**
 * Changement d'entraîneur : série de mauvais résultats du club du joueur
 * (points sur les `EVENTS_BALANCE.events.coachChange.windowMatches` derniers
 * matchs de championnat) → probabilité de licenciement. Nouveau coach généré
 * (`world/generateSquad.generateCoach`, compétence bruitée autour de
 * l'ancienne) ; l'ancien PNJ est conservé mais `active: false` (jamais
 * supprimé) ; `club.coachId` pointe vers le nouveau ; confiance du joueur
 * remise à `trustReset` ; `GameEvent` 'changement_coach' (déjà résolu, il n'y
 * a rien à répondre). Renvoie vrai si un changement a eu lieu.
 */
export function maybeChangeCoach(state: CareerState): boolean {
  const C = EVENTS_BALANCE.events.coachChange;
  const club = state.world.clubs[state.player.contract.clubId];
  if (!club) return false;
  const seasonMatches = leagueMatchesThisSeason(state, club.id, club.leagueId);
  if (seasonMatches.length < C.minMatchesSeason) return false;

  const recent = seasonMatches
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, C.windowMatches);
  const points = pointsFrom(recent, club.id);
  if (points > C.pointsOver8MatchesMax) return false;

  // Un club qui vient de changer d'entraîneur laisse sa chance au nouveau.
  const lastChange = [...state.events].reverse().find((e) => e.category === 'changement_coach' && e.definitionId === 'changement_coach_licenciement');
  if (lastChange && diffDays(lastChange.date, state.currentDate) < C.minDaysBetweenChanges) return false;

  const rng = nextRng(state, `events:coach:${club.id}`);
  if (!rng.chance(C.prob)) return false;

  const oldCoachId = club.coachId;
  const oldCoach = state.world.npcs[oldCoachId];
  const oldAbility = oldCoach && oldCoach.kind === 'coach' ? (oldCoach as Coach).ability : 55;
  if (oldCoach) oldCoach.active = false;

  const newCoach = generateCoach(rng, club, state.currentDate, clamp(oldAbility + rng.int(-C.abilityNoise, C.abilityNoise), 1, 99));
  newCoach.id = `coach_${club.id}_${state.currentDate}`;
  state.world.npcs[newCoach.id] = newCoach;
  club.coachId = newCoach.id;
  // Le nouveau staff rebat les cartes sans effacer ce que le joueur a construit : la confiance converge vers le niveau neutre.
  state.player.coachTrust = Math.round(state.player.coachTrust + (C.trustReset - state.player.coachTrust) * C.trustResetShare);

  addLog(state, 'systeme', `${club.name} change d'entraîneur : ${newCoach.firstName} ${newCoach.lastName} arrive (${points} pt(s) sur ${recent.length} matchs).`);
  addMemory(state, {
    date: state.currentDate, type: 'saison', importance: C.memoryImportance,
    summary: `Changement d'entraîneur à ${club.name} : ${newCoach.firstName} ${newCoach.lastName} succède à l'ancien staff.`,
    entities: [club.id, newCoach.id, oldCoachId],
  });

  state.events.push({
    id: `evt-coach-${club.id}-${state.currentDate}`,
    definitionId: 'changement_coach_licenciement',
    category: 'changement_coach',
    date: state.currentDate,
    title: "Changement d'entraîneur",
    facts: { club: club.name, points, matchsObserves: recent.length, nouveauCoach: `${newCoach.firstName} ${newCoach.lastName}` },
    npcIds: [newCoach.id, oldCoachId],
    resolved: true,
  });
  return true;
}
