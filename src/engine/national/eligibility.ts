/**
 * Éligibilité et changement de sélection nationale (docs/PHASE6_CONTRACTS.md
 * § `src/engine/national/eligibility.ts`).
 */
import type { CareerState, CountryCode, Player } from '../types';
import { countryName, normalizeCountryCode } from '../../data/nationalities';
import { addLog } from '../career/apply';

/** Pays pour lesquels le joueur est éligible : nationalité(s) déclarée(s) (codes canonicalisés, sans doublon). */
export function eligibleCountries(player: Player): CountryCode[] {
  const out: CountryCode[] = [normalizeCountryCode(player.identity.nationality)];
  if (player.identity.secondNationality) {
    const second = normalizeCountryCode(player.identity.secondNationality);
    if (!out.includes(second)) out.push(second);
  }
  return out;
}

/** Vrai tant qu'aucun match officiel A n'a été joué avec la sélection actuelle (§11). */
export function canSwitchCountry(state: CareerState): boolean {
  return !state.national.lockedIn;
}

/**
 * Change la sélection représentée par le joueur. Lève si le pays n'est pas
 * éligible (double nationalité) ou si le changement n'est plus possible
 * (`lockedIn`, après une première convocation A jouée — voir
 * `national/selection.ts::recordInternationalResult`).
 */
export function switchCountry(state: CareerState, country: CountryCode): void {
  if (!canSwitchCountry(state)) {
    throw new Error('Changement de sélection impossible : le joueur est verrouillé (déjà international A).');
  }
  const normalized = normalizeCountryCode(country);
  if (!eligibleCountries(state.player).includes(normalized)) {
    throw new Error(`Pays non éligible pour la sélection : ${country}`);
  }
  if (state.national.countryCode === normalized) return;
  state.national = { countryCode: normalized, stage: 'aucun', caps: 0, goals: 0, assists: 0, lockedIn: false };
  addLog(state, 'selection', `Sélection choisie : ${countryName(normalized)}.`);
}
