/**
 * Résolution d'une action du joueur (§5.3, §6) : probabilité PURE avec
 * plafonds §6.3 et modificateurs multiplicatifs, sanitisation des actions
 * (méta, impossibles, hors contexte) et tirage seedé par
 * hash(seed, matchId, minute, action).
 */
import type { ActionOutcome, Attributes, AttributeKey, ClassifiedAction, MatchContext, MatchState, Prob, ShotZone, Situation } from '../types';
import { SHOT_ZONES } from '../types';
import { BALANCE } from '../config/balance';
import { matchActionKey, rngFor } from '../rng/derive';
import { injuryMalus } from '../player/injuries';
import { traitMultiplier } from '../career/traits';
import { ACTION_FAMILIES, SHOT_ACTIONS, actionSpec, baseKeyOf, type ActionSpec, type AttrWeights } from './actionTable';
import { manMarkingMultiplier, repetitionCount, repetitionMultiplier, scoutingMultiplier } from './adaptation';
import { clamp, clamp01 } from './matchEvents';
import { applyOutcome } from './outcomes';

const RES = BALANCE.resolution;

export interface ProbabilityBreakdown {
  probability: Prob;
  modifiers: Record<string, number>;
  cap: number;
  /** xG de la situation (géométrie et base), avant l'effet du joueur. */
  xg: Prob;
  spec?: ActionSpec;
  impossible: boolean;
}

/** Attributs effectifs du joueur : blessure jouée incluse. */
export function effectiveAttributes(ctx: MatchContext): Attributes {
  const player = ctx.player!;
  const malus = injuryMalus(player);
  if (Object.keys(malus).length === 0) return player.attributes;
  const out = { ...player.attributes };
  for (const [key, delta] of Object.entries(malus) as [AttributeKey, number][]) {
    out[key] = clamp(out[key] + delta, 1, 99);
  }
  return out;
}

export function weightedAttribute(attrs: Attributes, weights: AttrWeights): number {
  let sum = 0;
  let total = 0;
  for (const [key, w] of Object.entries(weights) as [AttributeKey, number][]) {
    sum += attrs[key] * w;
    total += w;
  }
  return total > 0 ? sum / total : RES.attribute.reference;
}

/** Les attributs déplacent la base de ±attributeInfluence au maximum (§6.3). */
export function attributeFactor(score: number): number {
  const a = RES.attribute;
  return 1 + BALANCE.attributeInfluence * clamp((score - a.reference) / a.span, -1, 1);
}

function opponentFactor(quality: number): number {
  const o = RES.opponentQuality;
  return clamp(1 - o.perPoint * (quality - o.reference), o.min, o.max);
}

function impossible(spec: ActionSpec | undefined): ProbabilityBreakdown {
  const p = RES.impossibleActionProb;
  return { probability: p, modifiers: { impossible: p }, cap: p, xg: p, spec, impossible: true };
}

/**
 * Probabilité finale d'une action : base(situation, action) × géométrie ×
 * attributs (±35 %) × zone ou risque × fatigue × forme × pression × confiance ×
 * adversaire × répétition × marquage × scouting × désert × difficulté ×
 * enchaînement, puis plafond. Aucune combinaison ne dépasse le cap.
 */
export function actionProbability(situation: Situation, action: ClassifiedAction, ctx: MatchContext, ms: MatchState): ProbabilityBreakdown {
  const player = ctx.player;
  const spec = actionSpec(situation.kind, action.action);
  if (!player || !spec) return impossible(spec);
  const isShot = spec.nature === 'tir';
  if (isShot && situation.context.distanceM > RES.absurdShotFromMeters) return impossible(spec);

  const mods: Record<string, number> = {};
  const baseKey = baseKeyOf(spec, situation);
  const base = BALANCE.baseProbability[baseKey];
  const cap = BALANCE.caps[baseKey];
  mods.base = base;
  let p = base;
  if (spec.multiplier !== undefined && spec.multiplier < 1) {
    p *= spec.multiplier;
    mods.style = spec.multiplier;
  }

  // Géométrie de la situation (xG avant le joueur).
  const c = situation.context;
  const header = action.action === 'tete';
  if (isShot) {
    if (!header) {
      const angle = RES.angleMinMultiplier + (1 - RES.angleMinMultiplier) * clamp01(c.angle);
      p *= angle;
      mods.angle = angle;
    }
    if (c.distanceM > RES.distance.freeMeters) {
      const dist = Math.max(RES.distance.min, 1 - RES.distance.malusPerMeter * (c.distanceM - RES.distance.freeMeters));
      p *= dist;
      mods.distance = dist;
    }
  }
  if (spec.withBall || isShot) {
    // Les passes et conservations subissent moitié moins la densité qu'un tir ou un dribble.
    const share = spec.nature === 'passe' || spec.nature === 'conservation' || spec.nature === 'relance' ? RES.densityPassShare : 1;
    const dens = 1 - RES.densityMaxMalus * share * clamp01(c.density);
    p *= dens;
    mods.densite = dens;
  }
  const xg = clamp(p, RES.minProbability, cap);

  // Le joueur.
  const attrs = effectiveAttributes(ctx);
  const attrF = attributeFactor(weightedAttribute(attrs, spec.attrs));
  p *= attrF;
  mods.attributs = attrF;

  const zone = action.cible && (SHOT_ZONES as readonly string[]).includes(action.cible) ? (action.cible as ShotZone) : undefined;
  if (isShot && zone && zone !== 'defaut') {
    const z = BALANCE.shotZoneRisk[zone];
    p *= z;
    mods.zone = z;
  } else if (action.risque > BALANCE.risk.neutral) {
    const r = Math.max(BALANCE.risk.minMultiplier, 1 - (action.risque - BALANCE.risk.neutral) * BALANCE.risk.probabilityPenaltyPerPoint);
    p *= r;
    mods.risque = r;
  }

  const fatigue = ms.fatigue[player.id] ?? 0;
  const effFitness = clamp(player.fitness * (1 - RES.fatigue.matchFatigueWeight * fatigue / 100), 0, 100);
  const fat = 1 - RES.fatigue.maxMalus * (1 - effFitness / 100);
  p *= fat;
  mods.fatigue = fat;

  const form = 1 + RES.formPerPoint * clamp(player.form, -5, 5);
  p *= form;
  mods.forme = form;

  // Un trait « sang-froid des grands soirs » réduit le malus de pression (jamais le plafond).
  const pressure = 1 - (RES.pressureMaxMalus * clamp01(c.pressure) * (1 - attrs.resistancePression / 100)) / traitMultiplier(player, 'pression_grand_match');
  p *= pressure;
  mods.pression = pressure;

  const conf = 1 + RES.confidencePerPoint * (clamp(player.confidence, 0, 100) - BALANCE.career.confidence.baseline);
  p *= conf;
  mods.confiance = conf;

  if (spec.opponent !== 'aucun') {
    const o = opponentFactor(spec.opponent === 'gardien' ? c.goalkeeperQuality : c.defenderQuality);
    p *= o;
    mods.adversaire = o;
  }

  const rep = repetitionMultiplier(ms, action.action, situation.kind, c.minute);
  if (rep < 1) {
    p *= rep;
    mods.repetition = rep;
  }
  const mm = manMarkingMultiplier(ms, action.action, spec.withBall);
  if (mm < 1) {
    p *= mm;
    mods.marquage = mm;
  }
  const sc = scoutingMultiplier(player, action.action);
  if (sc < 1) {
    p *= sc;
    mods.scouting = sc;
  }
  if (spec.finishing && ctx.desert) {
    p *= ctx.desert.finishingMultiplier;
    mods.desert = ctx.desert.finishingMultiplier;
  }
  if (spec.finishing) {
    const tf = traitMultiplier(player, 'finition');
    if (tf !== 1) {
      p *= tf;
      mods.trait = tf;
    }
  }
  if (spec.finishing) {
    p *= ctx.difficulty.conversionMultiplier;
    mods.difficulte = ctx.difficulty.conversionMultiplier;
  }
  if (situation.facts.enchainement === true) {
    p *= RES.followUpBonus;
    mods.enchainement = RES.followUpBonus;
  }

  const probability = clamp(p, RES.minProbability, cap);
  mods.plafond = cap;
  mods.final = probability;
  return { probability, modifiers: mods, cap, xg, spec, impossible: false };
}

/**
 * Réécrit une action méta ou hors contexte : méta → action par défaut (et
 * compteur), action non autorisée → même famille autorisée, sinon action par
 * défaut. Les frappes absurdes sont gardées : elles se résolvent avec leur
 * probabilité résiduelle et le ridicule qui va avec.
 */
export function sanitizeAction(situation: Situation, action: ClassifiedAction, ms: MatchState): ClassifiedAction {
  const clean: ClassifiedAction = {
    ...action,
    intensite: clamp01(Number.isFinite(action.intensite) ? action.intensite : 0.5),
    risque: clamp01(Number.isFinite(action.risque) ? action.risque : 0.4),
    meta: !!action.meta,
  };
  if (clean.meta) ms.metaAttempts++;
  if (clean.meta || clean.action === 'aucune') {
    return { ...situation.defaultAction, meta: clean.meta, communication: action.communication };
  }
  if (situation.allowedActions.includes(clean.action)) return clean;
  if (SHOT_ACTIONS.includes(clean.action)) return clean;
  const family = ACTION_FAMILIES.find((f) => f.includes(clean.action));
  const alternative = family?.find((a) => situation.allowedActions.includes(a));
  if (alternative) return { ...clean, action: alternative };
  return { ...situation.defaultAction, communication: action.communication, meta: false };
}

/** Le tireur adverse choisit un côté caché ; le gardien qui devine multiplie ses chances. */
function goalkeeperPenaltyProbability(action: ClassifiedAction, pb: ProbabilityBreakdown, rng: { next(): number }): number {
  const g = RES.gkPenaltySide;
  const roll = rng.next();
  const shooterSide = roll < g.centreShare ? 'centre' : roll < (1 + g.centreShare) / 2 ? 'gauche' : 'droite';
  const guess = action.action === 'gb_plonger_gauche' ? 'gauche' : action.action === 'gb_plonger_droite' ? 'droite' : 'centre';
  const mult = guess === shooterSide ? g.rightGuess : g.wrongGuess;
  pb.modifiers.coteDevine = mult;
  return clamp(pb.probability * mult, RES.minProbability, pb.cap);
}

/**
 * Résout l'action avec le RNG dérivé de (matchId, minute simulée, n° d'action
 * dans la minute) : même clé → même issue. Mute ms (événements, stats, note).
 */
export function resolveAction(situation: Situation, action: ClassifiedAction, ctx: MatchContext, ms: MatchState): ActionOutcome {
  const tick = ms.tick ?? situation.context.minute;
  const ordinal = (ms.tickActions ?? 0) + 1;
  ms.tickActions = ordinal;
  const rng = rngFor(ctx.seed, matchActionKey(ctx.match.id, tick, ordinal));

  const pb = actionProbability(situation, action, ctx, ms);
  situation.context.repetitionCount = repetitionCount(ms, action.action, situation.kind, situation.context.minute);
  let probability = pb.probability;
  if (pb.spec?.nature === 'gardien_penalty') probability = goalkeeperPenaltyProbability(action, pb, rng);

  const roll = rng.next();
  let success = roll < probability;
  const multi = pb.spec?.nature === 'dribble' && action.risque >= RES.multiDribbleFromRisk.threshold;
  if (multi && success) {
    for (let i = 1; i < RES.multiDribbleFromRisk.defenders && success; i++) success = rng.next() < probability;
    pb.modifiers.duelsEnchaines = RES.multiDribbleFromRisk.defenders;
  }
  return applyOutcome({ situation, action, ctx, ms, rng, pb: { ...pb, probability }, success, roll });
}
