/**
 * Note globale au poste et génération d'attributs cohérents autour d'une note.
 *
 * La note est la moyenne pondérée des attributs par `POSITION_PROFILES[poste].weights`
 * (somme des poids = 1). `attributesFromOverall` produit un profil crédible :
 * attributs clés au-dessus de la note, secondaires en dessous, attributs hors rôle
 * (gardien pour un joueur de champ, et inversement) bas, bruit normal seedé, puis
 * ajustement itératif pour que `computeOverall` retombe à ±1 de la cible.
 */
import { ATTRIBUTE_KEYS } from '../types';
import type { AttributeKey, Attributes, Position } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { positionProfile } from '../config/positions';
import { clamp, clampAttribute as clampAttr, groupOf } from './common';

export { clampAttr as clampAttribute };

/** Note globale non arrondie (utile pour l'ajustement fin). */
export function rawOverall(attributes: Attributes, position: Position): number {
  const weights = positionProfile(position).weights;
  let sum = 0;
  for (const [key, w] of Object.entries(weights) as [AttributeKey, number][]) {
    sum += (attributes[key] ?? 0) * w;
  }
  return sum;
}

/** Note globale au poste, 1-99, arrondie. */
export function computeOverall(attributes: Attributes, position: Position): number {
  return clampAttr(Math.round(rawOverall(attributes, position)));
}

type Tier = 'key' | 'weighted' | 'unweighted' | 'offRole';

/** Rôle d'un attribut pour un poste : clé, pondéré, du même rôle sans poids, ou hors rôle. */
function tierOf(key: AttributeKey, position: Position): Tier {
  const profile = positionProfile(position);
  const offRoleCap = BALANCE.creation.creationCapTiers.offRole;
  if (profile.keyAttributes.includes(key)) return 'key';
  if ((profile.weights[key] ?? 0) > 0) return 'weighted';
  if (profile.creationCaps[key] === offRoleCap) return 'offRole';
  return 'unweighted';
}

/** Décalage lié à l'âge : jeune → physique un peu plus haut, mental plus bas ; trentenaire → inverse. */
function ageOffset(key: AttributeKey, age: number | undefined): number {
  if (age === undefined) return 0;
  const gen = BALANCE.creation.attributeGeneration;
  const group = groupOf(key);
  if (group !== 'physique' && group !== 'mental') return 0;
  if (age <= gen.youngUntil) return gen.young[group];
  if (age >= gen.oldFrom) return gen.old[group];
  return 0;
}

/** Valeur brute d'un attribut avant ajustement. */
function drawAttribute(key: AttributeKey, overall: number, position: Position, rng: Rng, age: number | undefined): number {
  const gen = BALANCE.creation.attributeGeneration;
  const tier = tierOf(key, position);
  if (tier === 'offRole') {
    const [lo, hi] = BALANCE.creation.offRoleAttributeRange;
    return rng.int(lo, hi);
  }
  const spec = gen[tier];
  return overall + spec.offset + rng.normal(0, spec.sd) + ageOffset(key, age);
}

/**
 * Ajuste itérativement les attributs pondérés (non forcés) pour que la note
 * retombe à ± tolerance de la cible. Mute `attributes`.
 */
function adjustToTarget(attributes: Attributes, target: number, position: Position, fixed: Set<AttributeKey>): void {
  const gen = BALANCE.creation.attributeGeneration;
  const weights = positionProfile(position).weights;
  const adjustable = (Object.keys(weights) as AttributeKey[]).filter((k) => !fixed.has(k));
  const share = adjustable.reduce((s, k) => s + (weights[k] ?? 0), 0);
  if (share <= 0) return;
  for (let i = 0; i < gen.maxIterations; i++) {
    const diff = target - rawOverall(attributes, position);
    if (Math.abs(diff) <= gen.tolerance) return;
    const step = diff / share;
    for (const key of adjustable) attributes[key] = clampAttr(Math.round(attributes[key] + step));
  }
}

/**
 * Génère des attributs cohérents autour d'une note au poste, avec bruit seedé
 * et surcharges (les attributs forcés ne sont jamais ajustés).
 */
export function attributesFromOverall(
  overall: number,
  position: Position,
  rng: Rng,
  overrides?: Partial<Attributes>,
  age?: number,
): Attributes {
  const target = clamp(Math.round(overall), BALANCE.bounds.attribute.min, BALANCE.bounds.attribute.max);
  const attributes = {} as Attributes;
  const fixed = new Set<AttributeKey>();
  for (const key of ATTRIBUTE_KEYS) {
    const forced = overrides?.[key];
    if (forced !== undefined) {
      attributes[key] = clampAttr(Math.round(forced));
      fixed.add(key);
    } else {
      attributes[key] = clampAttr(Math.round(drawAttribute(key, target, position, rng, age)));
    }
  }
  adjustToTarget(attributes, target, position, fixed);
  return attributes;
}
