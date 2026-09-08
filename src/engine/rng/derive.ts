/**
 * Dérivation de RNG à partir de la graine de carrière (§6.7).
 *
 * Chaque tirage vient de hash(careerSeed, scope, index) : recharger une
 * sauvegarde et rejouer la même décision donne exactement le même résultat.
 *  - match : scope = matchId, index = minute * 100 + actionIndex
 *  - jour  : scope = date, index = compteur d'appels du jour
 *  - monde : scope = 'world:<seasonId>', index = compteur
 */
import type { CareerState, RngKey, Seed } from '../types';
import { mulberry32, type Rng } from './mulberry32';
import { addDays } from '../calendar/dates';

/** Hachage xmur3 : renvoie une fonction produisant des entiers 32 bits non signés. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Hachage 32 bits stable (xmur3 sur la chaîne `${seed}|${scope}|${index}`). */
export function hashKey(seed: Seed, scope: string, index: number): number {
  return xmur3(`${seed}|${scope}|${index}`)();
}

/** RNG déterministe pour une clé. Même clé → même séquence. */
export function rngFor(seed: Seed, key: RngKey): Rng {
  return mulberry32(hashKey(seed, key.scope, key.index));
}

/** Incrémente state.rngCounters[scope] et renvoie un RNG pour (scope, ancien compteur). */
/**
 * Purge les compteurs de tirages dont la portée porte une date révolue
 * (`jour:2026-08-15`, `mercato:2026-08-15`…). Ces portées ne sont jamais
 * réutilisées : sans purge, la sauvegarde accumule une clé par jour de
 * carrière. Ne touche jamais une portée sans date, qui peut resservir.
 */
export function pruneRngCounters(state: CareerState, olderThanDays = 30): number {
  const limite = addDays(state.currentDate, -olderThanDays);
  let purgees = 0;
  for (const key of Object.keys(state.rngCounters)) {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(key);
    if (!m || m[1]! >= limite) continue;
    delete state.rngCounters[key];
    purgees += 1;
  }
  return purgees;
}

export function nextRng(state: CareerState, scope: string): Rng {
  const counter = state.rngCounters[scope] ?? 0;
  state.rngCounters[scope] = counter + 1;
  return rngFor(state.seed, { scope, index: counter });
}

/** Multiplicateur de la minute dans l'index d'une action de match. */
export const MATCH_MINUTE_STRIDE = 100;

/** Clé d'une action de match : scope = matchId, index = minute * 100 + actionIndex. */
export function matchActionKey(matchId: string, minute: number, actionIndex: number): RngKey {
  return { scope: matchId, index: minute * MATCH_MINUTE_STRIDE + actionIndex };
}

/** Graine 32 bits à partir d'une chaîne quelconque (nom de carrière, date). */
export function seedFromString(s: string): Seed {
  return xmur3(s)();
}

/**
 * Graine tirée au hasard, pour une nouvelle carrière.
 *
 * La graine est ensuite figée dans la sauvegarde : la carrière reste
 * parfaitement déterministe. Ce tirage sert uniquement à ce que deux carrières
 * créées avec la même fiche (même nom, même club, même jeu de données) ne
 * soient pas la même partie.
 */
export function randomSeed(): Seed {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0]!;
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

/** Graine en toutes lettres, courte et lisible, pour l'afficher et la ressaisir. */
export function formatSeed(seed: Seed): string {
  return seed.toString(36).toUpperCase().padStart(7, '0');
}

/** Lit une graine saisie à la main (format `formatSeed`, ou un nombre). Renvoie undefined si illisible. */
export function parseSeed(input: string): Seed | undefined {
  const s = input.trim().toUpperCase();
  if (!s) return undefined;
  if (/^\d+$/.test(s) && Number(s) <= 0xffff_ffff) return Number(s) >>> 0;
  if (!/^[0-9A-Z]{1,7}$/.test(s)) return undefined;
  const n = parseInt(s, 36);
  return Number.isFinite(n) && n >= 0 && n <= 0xffff_ffff ? (n >>> 0) : undefined;
}
