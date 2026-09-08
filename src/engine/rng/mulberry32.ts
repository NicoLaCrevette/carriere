/**
 * Générateur pseudo-aléatoire mulberry32 (32 bits, période ~2^32).
 *
 * Rapide, reproductible et suffisant pour une simulation de jeu. Toute
 * l'aléa du moteur passe par un `Rng` obtenu ici : jamais `Math.random()`.
 */

export interface Rng {
  /** Uniforme [0, 1). */
  next(): number;
  /** Entier uniforme dans [min, max] inclus. */
  int(min: number, max: number): number;
  /** Vrai avec probabilité p. */
  chance(p: number): boolean;
  /** Élément au hasard (lève si vide). */
  pick<T>(items: readonly T[]): T;
  /** Tirage pondéré : weights[i] ≥ 0. Si tous les poids sont nuls, tirage uniforme. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** Loi normale (Box-Muller). */
  normal(mean: number, sd: number): number;
  /** Copie mélangée (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** État interne courant, pour reprise. */
  state(): number;
}

const TWO_POW_32 = 4294967296;

/**
 * Crée un RNG mulberry32 à partir d'une graine 32 bits.
 * Implémentation fidèle à la référence (Tommy Ettinger / bryc), avec un état
 * maintenu en entier 32 bits signé pour éviter toute dérive flottante.
 */
export function mulberry32(seed: number): Rng {
  let a = seed | 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32;
  };

  const int = (min: number, max: number): number => {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(next() * (hi - lo + 1));
  };

  const chance = (p: number): boolean => {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return next() < p;
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('Rng.pick : liste vide');
    return items[Math.floor(next() * items.length)] as T;
  };

  const weighted = <T>(items: readonly T[], weights: readonly number[]): T => {
    if (items.length === 0) throw new Error('Rng.weighted : liste vide');
    if (weights.length !== items.length) {
      throw new Error(`Rng.weighted : ${items.length} éléments pour ${weights.length} poids`);
    }
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return pick(items);
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i] as number);
      if (r < 0) return items[i] as T;
    }
    // Sécurité contre les erreurs d'arrondi : dernier élément de poids > 0.
    for (let i = items.length - 1; i >= 0; i--) {
      if ((weights[i] as number) > 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  };

  const normal = (mean: number, sd: number): number => {
    // Box-Muller : u1 dans (0, 1] pour éviter log(0).
    const u1 = 1 - next();
    const u2 = next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * sd;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = copy[i] as T;
      copy[i] = copy[j] as T;
      copy[j] = tmp;
    }
    return copy;
  };

  const state = (): number => a >>> 0;

  return { next, int, chance, pick, weighted, normal, shuffle, state };
}
