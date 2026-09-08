/**
 * Progression des attributs (§10) : points d'expérience par attribut,
 * gain = base × facteurÂge × (potentiel − actuel) × qualitéCentre × moral × tempsDeJeu,
 * courbe d'âge, déclin après 30 ans, potentiel déplaçable de ±6 et estimation floue.
 *
 * Note : le « /50 » de la formule de la mission est absorbé dans
 * BALANCE.progression.xpBasePerSession ; l'écart (potentiel − note) est borné
 * par BALANCE.progression.potentialGap.
 */
import { ATTRIBUTE_KEYS } from '../types';
import type {
  AttributeGain, AttributeKey, AttributeXp, Club, DifficultyProfile, ISODate, Player, PotentialEstimate, TrainingFocus,
} from '../types';
import { BALANCE } from '../config/balance';
import { positionProfile } from '../config/positions';
import { hashKey, seedFromString } from '../rng/derive';
import { bandFor, clamp, clampAttribute, groupOf, lerp } from './common';
import { computeOverall } from './overall';
import { TRAINING_TARGETS } from './trainingTargets';

const P = BALANCE.progression;
const TWO_POW_32 = 4294967296;

// ── Facteurs ─────────────────────────────────────────────────────────────

/** Facteur d'âge par attribut : fort 17-23, plateau 24-29, déclin dès 30-31 (physique d'abord). */
export function ageFactor(age: number, key: AttributeKey): number {
  const band = bandFor(P.ageBands, age);
  let factor: number = band[groupOf(key)];
  if (P.lateBloomers.includes(key) && age <= P.lateBloomerUntilAge) {
    factor = Math.max(factor, P.lateBloomerAgeFactor);
  }
  return Math.max(0, factor);
}

/** Terme (potentiel − actuel), borné. */
export function potentialGap(player: Player): number {
  const overall = computeOverall(player.attributes, player.identity.position);
  const gap = player.potential - overall;
  if (gap <= 0) return P.potentialGap.min;
  return clamp(gap, P.potentialGapFloor, P.potentialGap.max);
}

/** Facteur « moral » : 0.6 à moral 0, 1.0 à 70, 1.1 à 100. */
export function moraleFactor(morale: number): number {
  const m = clamp(morale, 0, 100);
  if (m <= 70) return lerp(P.morale.atZero, P.morale.atSeventy, m / 70);
  return lerp(P.morale.atSeventy, P.morale.atHundred, (m - 70) / 30);
}

/** Facteur « qualité du centre » : facilities 0-100 → 0.6-1.1. */
export function facilitiesFactor(facilities: number): number {
  return lerp(P.facilities.min, P.facilities.max, clamp(facilities, 0, 100) / 100);
}

/** Facteur « temps de jeu » : minutes sur 30 jours rapportées à la référence, borné. */
export function playingTimeFactor(minutesLast30Days: number): number {
  const ratio = Math.max(0, minutesLast30Days) / P.playingTime.referenceMinutes30Days;
  return clamp(ratio, P.playingTime.min, P.playingTime.max);
}

// ── XP ───────────────────────────────────────────────────────────────────

/**
 * Applique des XP à un attribut ; passe le point quand xp ≥ 1 (ou le perd
 * quand xp ≤ −1). Met à jour la note globale. Renvoie le gain éventuel.
 */
export function addAttributeXp(player: Player, key: AttributeKey, xp: number): AttributeGain | null {
  if (!Number.isFinite(xp) || xp === 0) return null;
  const { min, max } = BALANCE.bounds.attribute;
  const from = player.attributes[key];
  let value = from;
  let acc = (player.attributeXp[key] ?? 0) + xp;
  while (acc >= 1 && value < max) { acc -= 1; value += 1; }
  while (acc <= -1 && value > min) { acc += 1; value -= 1; }
  // Butée atteinte : l'XP excédentaire est perdue.
  if ((value >= max && acc > 0) || (value <= min && acc < 0)) acc = 0;
  player.attributeXp[key] = acc;
  if (value === from) return null;
  player.attributes[key] = clampAttribute(value);
  player.overall = computeOverall(player.attributes, player.identity.position);
  return { key, from, to: player.attributes[key] };
}

/** XP d'une séance, répartie sur les attributs du focus (TRAINING_TARGETS). */
export function trainingXp(
  player: Player,
  focus: TrainingFocus,
  intensity: 'legere' | 'normale' | 'intense',
  club: Club,
  age: number,
  minutesLast30Days: number,
): Partial<AttributeXp> {
  const base = P.xpBasePerSession
    * P.intensityMultiplier[intensity]
    * potentialGap(player)
    * facilitiesFactor(club.facilities)
    * moraleFactor(player.morale)
    * playingTimeFactor(minutesLast30Days)
    * P.trainingTargetScale;
  const out: Partial<AttributeXp> = {};
  for (const [key, weight] of Object.entries(TRAINING_TARGETS[focus]) as [AttributeKey, number][]) {
    const xp = base * weight * ageFactor(age, key);
    if (xp > 0) out[key] = xp;
  }
  return out;
}

/** XP gagnée en match (minutes, note), répartie selon le poids de chaque attribut au poste (clé = 1). */
export function matchXp(player: Player, minutes: number, rating: number, age: number): Partial<AttributeXp> {
  const out: Partial<AttributeXp> = {};
  if (minutes <= 0) return out;
  const effective = Math.min(minutes, P.match.minutesForFullEffect);
  const ratingMult = Math.max(0.3, 1 + P.match.ratingBonusPerPoint * (rating - BALANCE.rating.base));
  const base = P.match.xpPerMinute * effective * ratingMult * potentialGap(player);
  const weights = positionProfile(player.identity.position).weights;
  const maxWeight = Math.max(...Object.values(weights).map((w) => w ?? 0));
  if (maxWeight <= 0) return out;
  for (const [key, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    const xp = base * (weight / maxWeight) * ageFactor(age, key);
    if (xp > 0) out[key] = xp;
  }
  return out;
}

/** Applique un lot d'XP et renvoie les points passés. */
export function applyXp(player: Player, xp: Partial<AttributeXp>): AttributeGain[] {
  const gains: AttributeGain[] = [];
  for (const [key, value] of Object.entries(xp) as [AttributeKey, number][]) {
    const gain = addAttributeXp(player, key, value);
    if (gain) gains.push(gain);
  }
  return gains;
}

/** Déclin quotidien après 30 ans : XP négative sur le physique d'abord (vitesse, accélération, détente). */
export function applyAgeing(player: Player, age: number): AttributeGain[] {
  const d = P.decline;
  if (age < d.fromAge) return [];
  const isGk = player.identity.position === 'GB';
  const acceleration = Math.pow(d.accelerationPerYear, age - d.fromAge);
  const gains: AttributeGain[] = [];
  for (const key of ATTRIBUTE_KEYS) {
    const group = groupOf(key);
    if (group === 'gardien' && !isGk) continue;
    const xp = d.xpPerDay[group] * (d.earlyDecliners[key] ?? 1) * acceleration;
    if (xp >= 0) continue;
    const gain = addAttributeXp(player, key, xp);
    if (gain) gains.push(gain);
  }
  return gains;
}

// ── Potentiel ────────────────────────────────────────────────────────────

/** Déplace le potentiel de delta, borné à ±6 cumulés depuis la création (§6.8). */
export function nudgePotential(player: Player, delta: number, initialPotential: number): void {
  const max = BALANCE.creation.potentialNudgeMax;
  const moved = clamp(player.potential + delta, initialPotential - max, initialPotential + max);
  player.potential = clampAttribute(Math.round(moved));
}

/** Uniforme [0, 1) déterministe par joueur et par âge (l'estimation ne bouge pas tous les jours). */
function estimateNoise(playerId: string, age: number): number {
  return hashKey(seedFromString(playerId), 'estimation_potentiel', age) / TWO_POW_32;
}

function estimateStatement(high: number): string {
  const t = P.estimateExtra.statementThresholds;
  if (high >= t.sommet) return 'Il a les moyens de viser le sommet mondial.';
  if (high >= t.europe) return 'Il peut jouer plus haut que la Ligue 1.';
  if (high >= t.titulaire) return 'Un futur titulaire solide en Ligue 1.';
  return 'Un joueur de rotation, s\'il travaille.';
}

/** Estimation floue du staff (jamais le chiffre réel), qui s'affine avec l'âge et selon la difficulté (§6.9). */
export function estimatePotential(player: Player, age: number, profile: DifficultyProfile, date: ISODate): PotentialEstimate {
  const overall = computeOverall(player.attributes, player.identity.position);
  const { max: attrMax } = BALANCE.bounds.attribute;
  if (profile.potentialReveal === 'jamais') {
    return {
      low: overall,
      high: attrMax,
      statement: 'Le staff refuse de se prononcer : seul le terrain dira.',
      updatedOn: date,
    };
  }
  const e = P.estimate;
  const rawWidth = Math.max(e.widthMin, lerp(e.widthAt17, e.widthAt25, (age - 17) / 8));
  const width = Math.max(e.widthMin, rawWidth * P.estimateExtra.widthByReveal[profile.potentialReveal]);
  const offset = (estimateNoise(player.id, age) * 2 - 1) * P.estimateExtra.centerOffsetShare * width;
  const center = player.potential + offset;
  let low = clampAttribute(Math.round(center - width / 2));
  let high = clampAttribute(Math.round(center + width / 2));
  if (low > high) [low, high] = [high, low];
  return { low, high, statement: estimateStatement(high), updatedOn: date };
}
