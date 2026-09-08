/**
 * Calculs de dates sur des chaînes ISO « YYYY-MM-DD », en calendrier
 * grégorien proleptique, sans aucun objet Date ni fuseau horaire.
 *
 * Les conversions jour civil ↔ nombre de jours reprennent les algorithmes
 * de Howard Hinnant (days_from_civil / civil_from_days), exacts pour toute
 * année. Le jour 0 est le 1970-01-01 (un jeudi).
 */
import type { ISODate } from '../types';

export interface CivilDate {
  year: number;
  /** 1-12. */
  month: number;
  /** 1-31. */
  day: number;
}

const DAY_NAMES_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'] as const;
const MONTH_NAMES_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;

const ISO_RE = /^(-?\d{4,})-(\d{2})-(\d{2})$/;

/** Vrai si l'année est bissextile. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Nombre de jours du mois (1-12) d'une année. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Découpe une ISODate. Lève si le format ou la date est invalide. */
export function parseISODate(date: ISODate): CivilDate {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Date invalide : « ${date} » (attendu YYYY-MM-DD)`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Date invalide : « ${date} »`);
  }
  return { year, month, day };
}

/** Vrai si la chaîne est une date ISO valide. */
export function isValidISODate(date: string): boolean {
  try {
    parseISODate(date);
    return true;
  } catch {
    return false;
  }
}

/** Formate une date civile en « YYYY-MM-DD ». */
export function toISODate(civil: CivilDate): ISODate {
  const y = String(civil.year).padStart(4, '0');
  const m = String(civil.month).padStart(2, '0');
  const d = String(civil.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Nombre de jours depuis le 1970-01-01 (négatif avant). */
export function daysFromCivil(civil: CivilDate): number {
  const y = civil.month <= 2 ? civil.year - 1 : civil.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = civil.month > 2 ? civil.month - 3 : civil.month + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + civil.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Date civile pour un nombre de jours depuis le 1970-01-01. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/** Numéro de jour (depuis 1970-01-01) d'une ISODate. */
export function dayNumber(date: ISODate): number {
  return daysFromCivil(parseISODate(date));
}

export function addDays(date: ISODate, days: number): ISODate {
  return toISODate(civilFromDays(dayNumber(date) + Math.trunc(days)));
}

/** b − a, en jours (positif si b est après a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return dayNumber(b) - dayNumber(a);
}

/** Années révolues à `date` pour une personne née le `birthDate`. */
export function ageAt(birthDate: ISODate, date: ISODate): number {
  const b = parseISODate(birthDate);
  const d = parseISODate(date);
  let years = d.year - b.year;
  const birthdayPassed = d.month > b.month || (d.month === b.month && d.day >= b.day);
  if (!birthdayPassed) years -= 1;
  return years;
}

/** 0 = dimanche … 6 = samedi. */
export function dayOfWeek(date: ISODate): number {
  // Le 1970-01-01 était un jeudi (4).
  return (((dayNumber(date) + 4) % 7) + 7) % 7;
}

/** Mois 1-12. */
export function monthOf(date: ISODate): number {
  return parseISODate(date).month;
}

export function yearOf(date: ISODate): number {
  return parseISODate(date).year;
}

/** Jour du mois 1-31. */
export function dayOf(date: ISODate): number {
  return parseISODate(date).day;
}

/** Vrai si a est strictement avant b. */
export function isBefore(a: ISODate, b: ISODate): boolean {
  return dayNumber(a) < dayNumber(b);
}

/** Vrai si date est dans [from, to] inclus. */
export function isBetween(date: ISODate, from: ISODate, to: ISODate): boolean {
  const n = dayNumber(date);
  return n >= dayNumber(from) && n <= dayNumber(to);
}

/** Comparateur pour trier des ISODate (négatif si a avant b). */
export function compareDates(a: ISODate, b: ISODate): number {
  return dayNumber(a) - dayNumber(b);
}

/** Ajoute des mois en conservant le jour quand il existe (sinon dernier jour du mois). */
export function addMonths(date: ISODate, months: number): ISODate {
  const c = parseISODate(date);
  const total = c.year * 12 + (c.month - 1) + Math.trunc(months);
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  const day = Math.min(c.day, daysInMonth(year, month));
  return toISODate({ year, month, day });
}

/** « sam. 15 août 2026 ». */
export function formatDateFr(date: ISODate): string {
  const c = parseISODate(date);
  const dow = DAY_NAMES_FR[dayOfWeek(date)];
  const month = MONTH_NAMES_FR[c.month - 1];
  return `${dow} ${c.day} ${month} ${c.year}`;
}

/** « 15 août 2026 » (sans le jour de la semaine). */
export function formatDateFrShort(date: ISODate): string {
  const c = parseISODate(date);
  return `${c.day} ${MONTH_NAMES_FR[c.month - 1]} ${c.year}`;
}
