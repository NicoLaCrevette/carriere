/**
 * Petits outils partagés par le moteur de match : statistiques vides, cumul
 * de deltas, ajout d'événements, bornes et accès aux onze.
 */
import type { Id, Identity, MatchContext, MatchEvent, MatchState, Position, Stats } from '../types';
import { formation } from '../config/formations';

/** Statistiques à zéro (copie locale de `emptyStats` du module player, écrit en parallèle). */
export function emptyMatchStats(): Stats {
  return {
    matches: 0, starts: 0, subOn: 0, subOff: 0, minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0,
    xG: 0, xA: 0, keyPasses: 0, dribblesAttempted: 0, dribblesCompleted: 0, duelsWon: 0, duelsTotal: 0,
    aerialsWon: 0, aerialsTotal: 0, touches: 0, passesAttempted: 0, passesCompleted: 0, tackles: 0,
    interceptions: 0, blocks: 0, clearances: 0, fouls: 0, foulsSuffered: 0, offsides: 0, yellowCards: 0,
    redCards: 0, penaltiesTaken: 0, penaltiesScored: 0, distanceKm: 0, sprints: 0, ratingSum: 0, ratingCount: 0,
    motm: 0, saves: 0, goalsConceded: 0, cleanSheets: 0, penaltiesSaved: 0,
  };
}

/** Ajoute un delta partiel à des statistiques (mutation). */
export function addStats(target: Stats, delta: Partial<Stats>): void {
  for (const key of Object.keys(delta) as (keyof Stats)[]) {
    target[key] += delta[key] ?? 0;
  }
}

/** Fusionne deux deltas partiels. */
export function mergeStats(a: Partial<Stats>, b: Partial<Stats>): Partial<Stats> {
  const out: Partial<Stats> = { ...a };
  for (const key of Object.keys(b) as (keyof Stats)[]) out[key] = (out[key] ?? 0) + (b[key] ?? 0);
  return out;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** Interpolation linéaire dans une fourchette. */
export function lerpRange(range: readonly [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * clamp01(t);
}

export function otherSide(side: 'home' | 'away'): 'home' | 'away' {
  return side === 'home' ? 'away' : 'home';
}

/** « Prénom Nom ». */
export function fullName(identity: Identity): string {
  return `${identity.firstName} ${identity.lastName}`;
}

/** Ajoute un événement à la minute courante, avec son ordre dans la minute. */
export function pushEvent(
  ms: MatchState,
  ev: Omit<MatchEvent, 'seq' | 'minute'> & { minute?: number },
): MatchEvent {
  const minute = ev.minute ?? ms.minute;
  let seq = 0;
  for (let i = ms.events.length - 1; i >= 0; i--) {
    const e = ms.events[i]!;
    if (e.minute !== minute) break;
    seq++;
  }
  const detail = ms.addedTime > 0 ? { ...(ev.detail ?? {}), tempsAdditionnel: ms.addedTime } : ev.detail;
  const event: MatchEvent = { ...ev, minute, seq, detail };
  ms.events.push(event);
  return event;
}

/** Postes des slots d'une composition (formation connue) ; repli sur les postes des joueurs. */
export function slotPositions(formationName: string, count: number): Position[] | null {
  try {
    const slots = formation(formationName).slots;
    return slots.length === count ? [...slots] : null;
  } catch {
    return null;
  }
}

/** Ids des joueurs sur le terrain pour un côté. */
export function onPitchIds(ms: MatchState, side: 'home' | 'away'): Id[] {
  return ms.lineups[side].starters;
}

/** Côté d'un club dans le match, ou null s'il ne joue pas. */
export function sideOfClub(ctx: MatchContext, clubId: Id): 'home' | 'away' | null {
  if (ctx.home.club.id === clubId) return 'home';
  if (ctx.away.club.id === clubId) return 'away';
  return null;
}

/** Score du point de vue d'un côté. */
export function scoreFor(ms: MatchState, side: 'home' | 'away'): { pour: number; contre: number } {
  return side === 'home'
    ? { pour: ms.homeGoals, contre: ms.awayGoals }
    : { pour: ms.awayGoals, contre: ms.homeGoals };
}

/** Arrondi au dixième (ou au pas donné). */
export function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}
