import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, ageAt, compareDates, dayNumber, dayOfWeek, diffDays, formatDateFr,
  isBefore, isBetween, isValidISODate, monthOf, parseISODate, yearOf,
} from '../calendar/dates';

describe('addDays', () => {
  it('franchit les mois, les années et le 29 février', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
  });

  it('accepte les décalages négatifs et nuls', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-07-01', 0)).toBe('2026-07-01');
    expect(addDays('2026-07-01', 365)).toBe('2027-07-01');
  });
});

describe('diffDays', () => {
  it('renvoie b − a', () => {
    expect(diffDays('2026-07-01', '2026-07-01')).toBe(0);
    expect(diffDays('2026-07-01', '2026-07-31')).toBe(30);
    expect(diffDays('2026-07-31', '2026-07-01')).toBe(-30);
    expect(diffDays('2026-07-01', '2027-07-01')).toBe(365);
    expect(diffDays('2027-07-01', '2028-07-01')).toBe(366);
  });
});

describe('ageAt', () => {
  it('compte les années révolues, anniversaire non passé compris', () => {
    expect(ageAt('2008-09-15', '2026-09-14')).toBe(17);
    expect(ageAt('2008-09-15', '2026-09-15')).toBe(18);
    expect(ageAt('2008-09-15', '2026-09-16')).toBe(18);
    expect(ageAt('2008-12-31', '2026-01-01')).toBe(17);
    expect(ageAt('2008-01-01', '2026-12-31')).toBe(18);
  });

  it('gère une naissance un 29 février', () => {
    expect(ageAt('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageAt('2008-02-29', '2026-03-01')).toBe(18);
    expect(ageAt('2008-02-29', '2028-02-29')).toBe(20);
  });
});

describe('dayOfWeek', () => {
  it('0 = dimanche, 6 = samedi', () => {
    expect(dayOfWeek('1970-01-01')).toBe(4); // jeudi
    expect(dayOfWeek('2000-01-01')).toBe(6); // samedi
    expect(dayOfWeek('2026-08-15')).toBe(6); // samedi
    expect(dayOfWeek('2026-08-16')).toBe(0); // dimanche
    expect(dayOfWeek('2026-08-17')).toBe(1); // lundi
    expect(dayOfWeek('1969-12-31')).toBe(3); // mercredi
  });

  it('coïncide avec le calendrier UTC sur 3 000 jours consécutifs', () => {
    // Le test peut utiliser Date (pas le moteur) : c'est la référence indépendante.
    let date = '2024-01-01';
    for (let i = 0; i < 3000; i++) {
      const ref = new Date(`${date}T00:00:00Z`);
      expect(dayOfWeek(date)).toBe(ref.getUTCDay());
      expect(dayNumber(date)).toBe(Math.round(ref.getTime() / 86_400_000));
      date = addDays(date, 1);
    }
  });
});

describe('monthOf / yearOf / comparaisons', () => {
  it('extrait le mois et l année', () => {
    expect(monthOf('2026-08-15')).toBe(8);
    expect(yearOf('2026-08-15')).toBe(2026);
  });

  it('compare les dates', () => {
    expect(isBefore('2026-08-15', '2026-08-16')).toBe(true);
    expect(isBefore('2026-08-16', '2026-08-15')).toBe(false);
    expect(isBefore('2026-08-15', '2026-08-15')).toBe(false);
    expect(isBetween('2026-08-15', '2026-08-01', '2026-08-31')).toBe(true);
    expect(isBetween('2026-09-01', '2026-08-01', '2026-08-31')).toBe(false);
    expect(['2026-09-01', '2026-01-05', '2025-12-31'].sort(compareDates)).toEqual(['2025-12-31', '2026-01-05', '2026-09-01']);
  });
});

describe('parseISODate', () => {
  it('rejette les formats et dates invalides', () => {
    expect(() => parseISODate('15/08/2026')).toThrow();
    expect(() => parseISODate('2026-13-01')).toThrow();
    expect(() => parseISODate('2026-02-30')).toThrow();
    expect(() => parseISODate('2027-02-29')).toThrow();
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('2026-00-10')).toBe(false);
  });
});

describe('addMonths', () => {
  it('conserve le jour ou s arrête au dernier jour du mois', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-08-15', 12)).toBe('2027-08-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('formatDateFr', () => {
  it('produit « sam. 15 août 2026 »', () => {
    expect(formatDateFr('2026-08-15')).toBe('sam. 15 août 2026');
    expect(formatDateFr('2026-01-01')).toBe('jeu. 1 janvier 2026');
    expect(formatDateFr('2027-12-25')).toBe('sam. 25 décembre 2027');
  });
});
