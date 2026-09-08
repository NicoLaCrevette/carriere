import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng/mulberry32';
import { hashKey, matchActionKey, nextRng, rngFor, seedFromString } from '../rng/derive';
import type { CareerState } from '../types';

/** Implémentation de référence (bryc), pour vérifier la fidélité bit à bit. */
function referenceMulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Statistique du chi² d'uniformité sur `bins` classes. */
function chiSquare(draws: number[], bins: number): number {
  const counts = new Array<number>(bins).fill(0);
  for (const d of draws) counts[Math.min(bins - 1, Math.floor(d * bins))] += 1;
  const expected = draws.length / bins;
  return counts.reduce((sum, c) => sum + ((c - expected) ** 2) / expected, 0);
}

/** Seuil chi² à 19 degrés de liberté, p = 0,001 ≈ 43,8. */
const CHI2_19_P001 = 43.8;

describe('mulberry32', () => {
  it('est fidèle à l implémentation de référence', () => {
    for (const seed of [0, 1, 42, 123456789, 0xffffffff, -7]) {
      const rng = mulberry32(seed);
      const ref = referenceMulberry32(seed);
      for (let i = 0; i < 1000; i++) expect(rng.next()).toBe(ref());
    }
  });

  it('est strictement reproductible pour une même graine', () => {
    const a = mulberry32(2026);
    const b = mulberry32(2026);
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(a.state()).toBe(b.state());
  });

  it('produit des séquences différentes pour des graines différentes', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('reste dans [0, 1) et est grossièrement uniforme (chi² sur 10 000 tirages)', () => {
    for (const seed of [7, 99, 31337]) {
      const rng = mulberry32(seed);
      const draws = Array.from({ length: 10_000 }, () => rng.next());
      for (const d of draws) {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(1);
      }
      expect(chiSquare(draws, 20)).toBeLessThan(CHI2_19_P001);
    }
  });

  it('int() couvre les bornes incluses et rien d autre', () => {
    const rng = mulberry32(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
    expect(rng.int(4, 4)).toBe(4);
  });

  it('chance() respecte les cas limites et la fréquence', () => {
    const rng = mulberry32(11);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rng.chance(0.3)) hits += 1;
    expect(hits / 10_000).toBeGreaterThan(0.27);
    expect(hits / 10_000).toBeLessThan(0.33);
  });

  it('pick() lève sur une liste vide et tire chaque élément', () => {
    const rng = mulberry32(3);
    expect(() => rng.pick([])).toThrow();
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(rng.pick(['a', 'b', 'c']));
    expect(seen.size).toBe(3);
  });

  it('weighted() ne tire jamais un poids nul et respecte les proportions', () => {
    const rng = mulberry32(9);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 10_000; i++) counts[rng.weighted(['a', 'b', 'c'] as const, [3, 0, 1])] += 1;
    expect(counts.b).toBe(0);
    expect(counts.a / counts.c).toBeGreaterThan(2.5);
    expect(counts.a / counts.c).toBeLessThan(3.5);
    expect(() => rng.weighted([1, 2], [1])).toThrow();
  });

  it('normal() a la moyenne et l écart-type demandés', () => {
    const rng = mulberry32(21);
    const n = 20_000;
    const draws = Array.from({ length: n }, () => rng.normal(10, 2));
    const mean = draws.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(draws.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    expect(mean).toBeCloseTo(10, 1);
    expect(sd).toBeCloseTo(2, 1);
  });

  it('shuffle() renvoie une copie contenant les mêmes éléments', () => {
    const rng = mulberry32(8);
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = rng.shuffle(items);
    expect(shuffled).not.toBe(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });
});

describe('derive', () => {
  it('hashKey est stable et sensible à chaque composante', () => {
    expect(hashKey(1, 'm1', 3)).toBe(hashKey(1, 'm1', 3));
    expect(hashKey(1, 'm1', 3)).not.toBe(hashKey(2, 'm1', 3));
    expect(hashKey(1, 'm1', 3)).not.toBe(hashKey(1, 'm2', 3));
    expect(hashKey(1, 'm1', 3)).not.toBe(hashKey(1, 'm1', 4));
    const h = hashKey(123, 'x', 0);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('rngFor rejoue exactement la même séquence pour une même clé (§6.7)', () => {
    const key = matchActionKey('match_42', 34, 2);
    const a = rngFor(777, key);
    const b = rngFor(777, key);
    expect(Array.from({ length: 50 }, () => a.next())).toEqual(Array.from({ length: 50 }, () => b.next()));
  });

  it('changer l index change la séquence (indépendance des clés)', () => {
    const seed = 4242;
    const firsts = new Set<number>();
    for (let index = 0; index < 500; index++) {
      const rng = rngFor(seed, { scope: 'match_1', index });
      firsts.add(rng.next());
    }
    expect(firsts.size).toBe(500);
    const a = rngFor(seed, { scope: 'day', index: 1 });
    const b = rngFor(seed, { scope: 'day', index: 2 });
    expect(Array.from({ length: 10 }, () => a.next())).not.toEqual(Array.from({ length: 10 }, () => b.next()));
  });

  it('les premiers tirages de clés consécutives restent uniformes', () => {
    const draws = Array.from({ length: 10_000 }, (_, i) => rngFor(99, { scope: 'world:2026', index: i }).next());
    expect(chiSquare(draws, 20)).toBeLessThan(CHI2_19_P001);
  });

  it('matchActionKey suit la convention minute × 100 + actionIndex', () => {
    expect(matchActionKey('m7', 34, 2)).toEqual({ scope: 'm7', index: 3402 });
    expect(matchActionKey('m7', 0, 0)).toEqual({ scope: 'm7', index: 0 });
    expect(matchActionKey('m7', 90, 15)).toEqual({ scope: 'm7', index: 9015 });
  });

  it('nextRng incrémente le compteur du scope et dérive des RNG distincts', () => {
    const state = { seed: 31, rngCounters: {} as Record<string, number> } as unknown as CareerState;
    const r0 = nextRng(state, '2026-08-15');
    const r1 = nextRng(state, '2026-08-15');
    expect(state.rngCounters['2026-08-15']).toBe(2);
    expect(r0.next()).not.toBe(r1.next());
    // Reprise : même graine, même compteur → même RNG.
    const again = { seed: 31, rngCounters: { '2026-08-15': 0 } } as unknown as CareerState;
    expect(nextRng(again, '2026-08-15').next()).toBe(rngFor(31, { scope: '2026-08-15', index: 0 }).next());
  });

  it('seedFromString est déterministe et produit une graine 32 bits', () => {
    const s = seedFromString('Kylian Dupont');
    expect(s).toBe(seedFromString('Kylian Dupont'));
    expect(s).not.toBe(seedFromString('Kylian Dupond'));
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
