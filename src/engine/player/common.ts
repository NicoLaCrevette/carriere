/**
 * Petits utilitaires partagés par le module joueur (aucune logique d'équilibrage ici).
 */
import { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYS } from '../types';
import type { AttributeGroup, AttributeKey, Attributes } from '../types';
import { BALANCE } from '../config/balance';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Borne un attribut dans [1, 99]. */
export function clampAttribute(v: number): number {
  const { min, max } = BALANCE.bounds.attribute;
  return clamp(v, min, max);
}

/** Borne une jauge dans [0, 100]. */
export function clampGauge(v: number): number {
  const { min, max } = BALANCE.bounds.gauge;
  return clamp(v, min, max);
}

/** Interpolation linéaire. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

const GROUP_OF: Record<AttributeKey, AttributeGroup> = (() => {
  const out = {} as Record<AttributeKey, AttributeGroup>;
  for (const group of Object.keys(ATTRIBUTE_GROUPS) as AttributeGroup[]) {
    for (const key of ATTRIBUTE_GROUPS[group]) out[key] = group;
  }
  return out;
})();

/** Groupe (technique, physique, mental, gardien) d'un attribut. */
export function groupOf(key: AttributeKey): AttributeGroup {
  return GROUP_OF[key];
}

/** Première tranche dont `maxAge` ≥ âge (la dernière sert de repli). */
export function bandFor<T extends { maxAge: number }>(bands: readonly T[], age: number): T {
  for (const band of bands) if (age <= band.maxAge) return band;
  return bands[bands.length - 1] as T;
}

/** Interpolation linéaire sur une courbe { age, factor } triée par âge (constante hors bornes). */
export function interpolateCurve(curve: readonly { age: number; factor: number }[], age: number): number {
  const first = curve[0] as { age: number; factor: number };
  const last = curve[curve.length - 1] as { age: number; factor: number };
  if (age <= first.age) return first.factor;
  if (age >= last.age) return last.factor;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1] as { age: number; factor: number };
    const b = curve[i] as { age: number; factor: number };
    if (age <= b.age) return lerp(a.factor, b.factor, (age - a.age) / (b.age - a.age));
  }
  return last.factor;
}

/** Copie d'un jeu d'attributs. */
export function cloneAttributes(attributes: Attributes): Attributes {
  return { ...attributes };
}

/** Jeu d'attributs rempli d'une même valeur. */
export function uniformAttributes(value: number): Attributes {
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) out[key] = value;
  return out;
}

/** Arrondi à un multiple. */
export function roundTo(v: number, step: number): number {
  if (step <= 0) return Math.round(v);
  return Math.round(v / step) * step;
}
