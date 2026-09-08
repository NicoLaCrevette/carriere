/**
 * Calendrier complet d'une saison, pour toutes les ligues du monde.
 *
 * `generateLeagueFixtures` produit les rencontres d'un championnat par la
 * méthode du cercle : aller-retour, le retour étant le miroir exact de
 * l'aller (mêmes paires, domicile/extérieur inversé), chaque club jouant une
 * fois par journée. `buildSeason` date ces journées (week-ends d'août à mai,
 * trêves internationales et hivernale, mercatos), construit les `Match` de
 * toutes les ligues et le `CalendarDay` de chaque jour de la saison pour le
 * club du joueur.
 *
 * Écart au libellé de la mission : le jour de repos hebdomadaire suit
 * `BALANCE.calendar.restDayOfWeek` (lundi, valeur déjà fixée dans
 * `config/balance/career.ts` et utilisée telle quelle par
 * `calendar/dayKind.ts`) plutôt que « le dimanche » — on reste cohérent avec
 * le module appelant déjà écrit plutôt qu'avec la formulation informelle.
 */
import type {
  CalendarDay, DayKind, Id, ISODate, LeagueSeason, Match, Season, Seed, World,
} from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { rngFor } from '../rng/derive';
import {
  addDays, compareDates, dayOfWeek, isBefore, isBetween, toISODate,
} from '../calendar/dates';
import { seasonPhaseFor } from '../calendar/dayKind';
import { emptyTable } from '../season/table';

const CAL = BALANCE.calendar;

// ═══════════════════════════════════════════════════════════════════════════
// Rencontres d'un championnat (méthode du cercle)
// ═══════════════════════════════════════════════════════════════════════════

export interface FixtureSpec { matchday: number; homeClubId: Id; awayClubId: Id }

/** Marqueur interne pour le repos d'un effectif impair (ne sort jamais de la fonction). */
const BYE = '__bye__';

/**
 * Aller-retour équilibré (méthode du cercle) : `clubIds.length - 1` journées
 * pour l'aller, autant pour le retour qui rejoue exactement les mêmes paires
 * en inversant domicile/extérieur. Chaque club joue une fois par journée.
 * `rng` mélange l'ordre initial des clubs (même n-uplet de paires, réparties
 * différemment selon la graine). Nombre de clubs impair : un repos silencieux
 * (bye) par journée, jamais renvoyé dans le résultat.
 */
export function generateLeagueFixtures(clubIds: Id[], rng: Rng): FixtureSpec[] {
  if (clubIds.length < 2) return [];
  const teams: Id[] = rng.shuffle(clubIds);
  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;
  const half = n / 2;
  const rounds = n - 1;
  const arr = teams.slice();
  const fixtures: FixtureSpec[] = [];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i] as Id;
      const b = arr[n - 1 - i] as Id;
      if (a === BYE || b === BYE) continue;
      // Le club fixe (i = 0) alterne domicile/extérieur d'une journée sur l'autre.
      const swapped = i === 0 && r % 2 === 1;
      const home = swapped ? b : a;
      const away = swapped ? a : b;
      fixtures.push({ matchday: r + 1, homeClubId: home, awayClubId: away });
      fixtures.push({ matchday: rounds + r + 1, homeClubId: away, awayClubId: home });
    }
    // Rotation : arr[0] fixe, le reste tourne d'un cran (dernier → premier des mobiles).
    const fixed = arr[0] as Id;
    const rest = arr.slice(1);
    const moved = rest.pop() as Id;
    rest.unshift(moved);
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return fixtures;
}

// ═══════════════════════════════════════════════════════════════════════════
// Dates de saison (trêves, mercatos, journées)
// ═══════════════════════════════════════════════════════════════════════════

/** Année civile où tombe `month` dans une saison qui commence en juillet `startYear`. */
function calendarYearFor(month: number, startYear: number): number {
  return month >= CAL.seasonStart.month ? startYear : startYear + 1;
}

function internationalBreakRanges(startYear: number): [ISODate, ISODate][] {
  return CAL.internationalBreaks.map((b) => {
    const year = calendarYearFor(b.month, startYear);
    const from = toISODate({ year, month: b.month, day: b.day });
    return [from, addDays(from, b.days - 1)] as [ISODate, ISODate];
  });
}

function winterBreakRange(startYear: number): [ISODate, ISODate] {
  const from = toISODate({ year: startYear, month: CAL.winterBreak.from.month, day: CAL.winterBreak.from.day });
  const to = toISODate({ year: startYear + 1, month: CAL.winterBreak.to.month, day: CAL.winterBreak.to.day });
  return [from, to];
}

function transferWindowsFor(startYear: number): Season['transferWindows'] {
  const w = CAL.transferWindows;
  return {
    summer: [
      toISODate({ year: startYear, month: w.summer.from.month, day: w.summer.from.day }),
      toISODate({ year: startYear, month: w.summer.to.month, day: w.summer.to.day }),
    ],
    winter: [
      toISODate({ year: startYear + 1, month: w.winter.from.month, day: w.winter.from.day }),
      toISODate({ year: startYear + 1, month: w.winter.to.month, day: w.winter.to.day }),
    ],
  };
}

function nextDayOfWeekOnOrAfter(date: ISODate, dow: number): ISODate {
  let d = date;
  while (dayOfWeek(d) !== dow) d = addDays(d, 1);
  return d;
}

const SATURDAY = 6;
const WEDNESDAY = 3;

/** Samedis hors trêve entre `from` et `to` inclus. */
function candidateSaturdays(from: ISODate, to: ISODate, breaks: readonly [ISODate, ISODate][]): ISODate[] {
  const out: ISODate[] = [];
  let d = from;
  while (!isBefore(to, d)) {
    if (!breaks.some(([a, b]) => isBetween(d, a, b))) out.push(d);
    d = addDays(d, 7);
  }
  return out;
}

/**
 * Dates des `count` journées d'un championnat : un samedi par semaine à partir
 * du 3e week-end d'août, hors trêves, jusqu'à la borne de fin mai. Si la
 * fenêtre ne fournit pas assez de samedis (championnat à beaucoup d'équipes),
 * des journées en semaine (mercredi) comblent l'écart.
 */
function matchdayDatesFor(startYear: number, count: number, breaks: readonly [ISODate, ISODate][]): ISODate[] {
  const first = nextDayOfWeekOnOrAfter(
    toISODate({ year: startYear, month: CAL.firstMatchday.month, day: CAL.firstMatchday.earliestDay }),
    SATURDAY,
  );
  const latest = toISODate({ year: startYear + 1, month: CAL.lastMatchdayLatest.month, day: CAL.lastMatchdayLatest.day });
  const candidates = candidateSaturdays(first, latest, breaks);

  let guard = 0;
  let extra = first;
  while (candidates.length < count && guard < 500) {
    extra = addDays(extra, 7);
    const wednesday = nextDayOfWeekOnOrAfter(extra, WEDNESDAY);
    if (!breaks.some(([a, b]) => isBetween(wednesday, a, b)) && !candidates.includes(wednesday)) candidates.push(wednesday);
    guard += 1;
  }
  if (candidates.length < count) {
    throw new Error(`matchdayDatesFor : impossible de placer ${count} journées (${candidates.length} disponibles)`);
  }
  candidates.sort(compareDates);
  return candidates.slice(0, count);
}

// ═══════════════════════════════════════════════════════════════════════════
// Type de journée pour le club du joueur (mêmes règles que calendar/dayKind.ts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Réplique la logique de `calendar/dayKind.ts::dayKindFor` sans dépendre d'un
 * `CareerState` (qui n'existe pas encore à la construction du monde). Seule
 * différence assumée : après la dernière journée et jusqu'au 30 juin, on
 * renvoie `vacances` (pas `intersaison`, hors du champ de cette saison).
 */
function dayKindForBuild(
  date: ISODate,
  playerMatches: readonly Match[],
  firstMatchDate: ISODate | undefined,
  lastMatchDate: ISODate | undefined,
  preparationFrom: ISODate,
  winterFrom: ISODate,
  winterTo: ISODate,
  internationalBreaks: readonly [ISODate, ISODate][],
  transferWindows: Season['transferWindows'],
): DayKind {
  if (playerMatches.some((m) => m.date === date)) return 'jour_match';
  if (playerMatches.some((m) => m.date === addDays(date, 1))) return 'veille_match';
  if (CAL.dayAfterMatchIsRecovery && playerMatches.some((m) => m.date === addDays(date, -1))) return 'lendemain_match';
  if (internationalBreaks.some(([a, b]) => isBetween(date, a, b))) return 'treve_internationale';
  if (isBefore(date, preparationFrom)) return 'vacances';
  if (isBetween(date, winterFrom, winterTo)) return 'vacances';
  if (firstMatchDate && isBefore(date, firstMatchDate)) return 'preparation';
  if (lastMatchDate && isBefore(lastMatchDate, date)) return 'vacances';
  if (isBetween(date, transferWindows.summer[0], transferWindows.summer[1])) return 'mercato';
  if (isBetween(date, transferWindows.winter[0], transferWindows.winter[1])) return 'mercato';
  if (dayOfWeek(date) === CAL.restDayOfWeek) return 'repos';
  return 'entrainement';
}

// ═══════════════════════════════════════════════════════════════════════════
// Saison complète
// ═══════════════════════════════════════════════════════════════════════════

export interface SeasonSkeleton { season: Season; matches: Match[]; calendar: CalendarDay[] }

/** « 2026-27 » pour `startYear` = 2026. */
export function seasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Enjeu 0-100 : base + poids × prestige moyen + bonus si derby (`rivalClubIds`). */
function computeImportance(world: World, homeId: Id, awayId: Id): number {
  const home = world.clubs[homeId];
  const away = world.clubs[awayId];
  if (!home || !away) return BALANCE.world.importance.base;
  const cfg = BALANCE.world.importance;
  const avgPrestige = (home.prestige + away.prestige) / 2;
  const derby = home.rivalClubIds.includes(awayId) || away.rivalClubIds.includes(homeId);
  const raw = cfg.base + cfg.prestigeWeight * avgPrestige + (derby ? cfg.derbyBonus : 0);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Saison complète pour toutes les ligues du monde : dates des journées
 * (week-ends d'août à mai, trêves internationales sept/oct/nov/mars, trêve
 * hivernale fin décembre-début janvier, mercatos), objets `Match`, jours du
 * calendrier avec leur `DayKind` pour le club du joueur.
 */
export function buildSeason(world: World, startYear: number, playerClubId: Id, seed: Seed): SeasonSkeleton {
  const seasonId = `s${startYear}`;
  const seasonStartDate = toISODate({ year: startYear, month: CAL.seasonStart.month, day: CAL.seasonStart.day });
  const seasonEndDate = toISODate({ year: startYear + 1, month: CAL.seasonEnd.month, day: CAL.seasonEnd.day });
  const preparationFromDate = toISODate({ year: startYear, month: CAL.preparation.from.month, day: CAL.preparation.from.day });
  const [winterFrom, winterTo] = winterBreakRange(startYear);
  const internationalBreaks = internationalBreakRanges(startYear);
  const allBreaks: [ISODate, ISODate][] = [...internationalBreaks, [winterFrom, winterTo]];
  const transferWindows = transferWindowsFor(startYear);
  const matchDateRng = rngFor(seed, { scope: `calendrier:${seasonId}`, index: 0 });

  const matches: Match[] = [];
  const leagues: Record<Id, LeagueSeason> = {};

  for (const league of Object.values(world.leagues)) {
    const fixtureRng = rngFor(seed, { scope: `fixtures:${seasonId}:${league.id}`, index: 0 });
    const fixtures = generateLeagueFixtures(league.clubIds, fixtureRng);
    const totalMatchdays = fixtures.reduce((max, f) => Math.max(max, f.matchday), 0);
    const matchdayDates = matchdayDatesFor(startYear, totalMatchdays, allBreaks);
    const matchIds: Id[] = [];

    for (const fixture of fixtures) {
      const base = matchdayDates[fixture.matchday - 1] as ISODate;
      const sunday = addDays(base, 1);
      const canBeSunday = !allBreaks.some(([a, b]) => isBetween(sunday, a, b));
      const date = canBeSunday && matchDateRng.chance(CAL.sundayShare) ? sunday : base;
      const id = `${seasonId}-${league.id}-j${fixture.matchday}-${fixture.homeClubId}-${fixture.awayClubId}`;
      const match: Match = {
        id,
        seasonId,
        competitionId: league.id,
        matchday: fixture.matchday,
        date,
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        neutralVenue: false,
        status: 'a_venir',
        importance: computeImportance(world, fixture.homeClubId, fixture.awayClubId),
        involvesPlayer: fixture.homeClubId === playerClubId || fixture.awayClubId === playerClubId,
      };
      matches.push(match);
      matchIds.push(id);
    }

    leagues[league.id] = {
      leagueId: league.id,
      seasonId,
      clubIds: [...league.clubIds],
      table: emptyTable(league.clubIds),
      matchIds,
      currentMatchday: 0,
      totalMatchdays,
    };
  }

  matches.sort((a, b) => compareDates(a.date, b.date) || a.id.localeCompare(b.id));
  const playerMatches = matches.filter((m) => m.involvesPlayer).sort((a, b) => compareDates(a.date, b.date));
  const firstMatchDate = playerMatches[0]?.date;
  const lastMatchDate = playerMatches[playerMatches.length - 1]?.date;

  const calendar: CalendarDay[] = [];
  let cursor = seasonStartDate;
  while (!isBefore(seasonEndDate, cursor)) {
    const kind = dayKindForBuild(
      cursor, playerMatches, firstMatchDate, lastMatchDate, preparationFromDate, winterFrom, winterTo,
      internationalBreaks, transferWindows,
    );
    const day: CalendarDay = { date: cursor, kind, eventIds: [], actions: [], completed: false };
    if (kind === 'jour_match') {
      const match = playerMatches.find((m) => m.date === cursor);
      if (match) day.matchId = match.id;
    }
    calendar.push(day);
    cursor = addDays(cursor, 1);
  }

  const firstDay = calendar[0] as CalendarDay;
  const season: Season = {
    id: seasonId,
    label: seasonLabel(startYear),
    startDate: seasonStartDate,
    endDate: seasonEndDate,
    phase: seasonPhaseFor(firstDay.kind, firstDay.date),
    leagues,
    cups: {},
    transferWindows,
    internationalBreaks,
    desertSpells: [],
    playerMatchIndex: 0,
  };

  return { season, matches, calendar };
}
