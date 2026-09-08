/**
 * Points de décision du joueur (§5.2) : quand une situation survient, de quel
 * type, avec quels faits structurés (le narrateur en fait du texte), quel xG de
 * base, quelles actions autorisées, quelle action par défaut et quel timer.
 */
import type { ActionOutcome, Id, MatchContext, MatchState, Position, Situation, SituationContext, SituationKind } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { positionProfile } from '../config/positions';
import { actionSpec, allowedActionsFor, baseKeyOf } from './actionTable';
import { autoDecide } from './autoplay';
import { clamp, clamp01, fullName, lerpRange, otherSide, scoreFor } from './matchEvents';
import { getFootballer, type Footballer } from './teamStrength';
import type { MinuteOutcome } from './simulateMinute';

const S = BALANCE.situations;
type Facts = Record<string, string | number | boolean>;

const DEFENDER_POSITIONS: readonly Position[] = ['DC', 'DD', 'DG', 'MDC'];
const OFF_BALL_KINDS: readonly SituationKind[] = ['provocation_adverse', 'coequipier_en_difficulte', 'consigne_du_banc', 'tension_fin_de_match', 'blessure_ressentie'];

/** Pression du moment 0-1 : enjeu, minute, score serré, extérieur. */
export function pressureAt(ms: MatchState, ctx: MatchContext): number {
  const p = S.pressure;
  const side = ctx.playerSide ?? 'home';
  const s = scoreFor(ms, side);
  const diff = Math.abs(s.pour - s.contre);
  const late = ms.minute >= 75 ? p.lateFrom75 : ms.minute >= 60 ? p.lateFrom60 : 0;
  const close = diff <= 1 ? p.closeScore : p.openScore;
  const away = side === 'away' ? p.away : 0;
  return clamp01(p.importanceWeight * ctx.match.importance / 100 + late + close + away);
}

function onPitch(ms: MatchState, ctx: MatchContext, side: 'home' | 'away'): Footballer[] {
  return ms.lineups[side].starters.map((id) => getFootballer(ctx, id));
}

/** Qualité du défenseur direct et du gardien adverses (moyenne de ligne ± bruit). */
export function opponentQualities(ms: MatchState, ctx: MatchContext, side: 'home' | 'away', rng: Rng): { defender: number; goalkeeper: number } {
  const opponents = onPitch(ms, ctx, otherSide(side));
  const defenders = opponents.filter((f) => DEFENDER_POSITIONS.includes(f.position));
  const gk = opponents.find((f) => f.position === 'GB');
  const defenderMean = defenders.length > 0 ? defenders.reduce((s, f) => s + f.overall, 0) / defenders.length : ctx[otherSide(side)].strength.defense;
  return {
    defender: clamp(Math.round(defenderMean + rng.normal(0, S.opponentQualityNoiseSd)), 1, 99),
    goalkeeper: clamp(Math.round((gk?.overall ?? ctx[otherSide(side)].strength.goalkeeper) + rng.normal(0, S.opponentQualityNoiseSd / 2)), 1, 99),
  };
}

/** Nombre de situations visé : titulaire dans [min, max − marge], remplaçant proportionnel aux minutes restantes. */
export function initialSituationTarget(position: Position, rng: Rng, starter: boolean, minutesRemaining: number): number {
  const [min, max] = positionProfile(position).situationsPerMatch;
  if (starter) return rng.int(min, Math.max(min, max - S.primaryTargetMargin));
  const sub = S.substitute;
  const base = rng.int(sub.range[0], sub.range[1]);
  return Math.max(S.substituteMinTarget, Math.round(base * minutesRemaining / sub.referenceMinutesRemaining));
}

/** Le joueur tire-t-il les penalties / coups francs / corners ? Comparé au meilleur coéquipier sur le terrain. */
export function isSetPieceTaker(ms: MatchState, ctx: MatchContext, attr: 'penalty' | 'coupsFrancs' | 'centres'): boolean {
  if (!ctx.player || !ctx.playerSide) return false;
  const mine = ctx.player.attributes[attr];
  const best = onPitch(ms, ctx, ctx.playerSide)
    .filter((f) => f.id !== ctx.player!.id)
    .reduce((m, f) => Math.max(m, f.attributes[attr]), 0);
  return mine >= best - BALANCE.resolution.penaltyTakerMargin;
}

function offensiveKindForChance(chanceKind: string | undefined, ms: MatchState, ctx: MatchContext): { kind: SituationKind; facts: Facts } | null {
  switch (chanceKind) {
    case 'face_a_face': return { kind: 'face_a_face', facts: {} };
    case 'reprise_surface': return { kind: 'occasion_surface', facts: {} };
    case 'tete': return { kind: 'centre_a_venir', facts: {} };
    case 'contre': return { kind: 'contre_attaque', facts: {} };
    case 'frappe_lointaine': return { kind: 'frappe_lointaine_possible', facts: {} };
    case 'but_vide': return { kind: 'occasion_surface', facts: { filetVide: true } };
    case 'coup_franc':
      return isSetPieceTaker(ms, ctx, 'coupsFrancs') ? { kind: 'coup_franc_direct', facts: { tireur: true } } : { kind: 'centre_a_venir', facts: { coupFranc: true } };
    case 'penalty':
      return isSetPieceTaker(ms, ctx, 'penalty') ? { kind: 'penalty', facts: { tireur: true } } : null;
    default: return null;
  }
}

function defensiveKindForChance(chanceKind: string | undefined, position: Position, rng: Rng): { kind: SituationKind; facts: Facts } | null {
  if (position === 'GB') {
    switch (chanceKind) {
      case 'face_a_face': return { kind: 'gardien_face_a_face', facts: {} };
      case 'penalty': return { kind: 'gardien_penalty', facts: {} };
      case 'tete': return { kind: 'gardien_sortie_aerienne', facts: {} };
      default: return null;
    }
  }
  switch (chanceKind) {
    case 'face_a_face': return { kind: 'contre_adverse', facts: { dernierDefenseur: rng.chance(S.lastManShare) } };
    case 'contre': return rng.chance(0.5) ? { kind: 'contre_adverse', facts: { dernierDefenseur: rng.chance(S.lastManShare) } } : { kind: 'faute_tactique_possible', facts: { dernierDefenseur: rng.chance(S.lastManShare) } };
    case 'reprise_surface': case 'but_vide': return { kind: 'duel_defensif', facts: { aerien: false } };
    case 'tete': return { kind: 'corner_defensif', facts: { aerien: true } };
    case 'frappe_lointaine': case 'coup_franc': return { kind: 'couverture', facts: {} };
    default: return null;
  }
}

function pickName(list: Footballer[], rng: Rng): Footballer | undefined {
  return list.length > 0 ? rng.pick(list) : undefined;
}

/** Coéquipiers proches proposés comme cibles de passe : attaquants et milieux d'abord. */
function nearbyTeammates(ms: MatchState, ctx: MatchContext, side: 'home' | 'away', rng: Rng): Id[] {
  const mates = onPitch(ms, ctx, side).filter((f) => f.id !== ctx.player?.id && f.position !== 'GB');
  const weights = mates.map((f) => (f.position === 'BU' || f.position === 'AIG' || f.position === 'AID' || f.position === 'MOC' ? 3 : f.position === 'MC' || f.position === 'MDC' ? 2 : 1));
  const out: Id[] = [];
  const pool = [...mates];
  const w = [...weights];
  while (out.length < S.nearbyTeammates && pool.length > 0) {
    const chosen = rng.weighted(pool, w);
    const i = pool.indexOf(chosen);
    out.push(chosen.id);
    pool.splice(i, 1);
    w.splice(i, 1);
  }
  return out;
}

/** Construit une situation complète pour le joueur incarné. */
export function buildSituation(kind: SituationKind, ms: MatchState, ctx: MatchContext, rng: Rng, extraFacts: Facts = {}, depth = 0): Situation {
  const player = ctx.player!;
  const side = ctx.playerSide!;
  const opp = otherSide(side);
  const geo = S.geometry[kind] ?? { distance: [20, 30] as const, angle: [0.5, 1] as const, density: [0.3, 0.7] as const };
  const distanceM = Math.round(lerpRange(geo.distance, rng.next()));
  const angle = Math.round(lerpRange(geo.angle, rng.next()) * 100) / 100;
  const density = Math.round(lerpRange(geo.density, rng.next()) * 100) / 100;
  const q = opponentQualities(ms, ctx, side, rng);
  const s = scoreFor(ms, side);
  const fatigue = ms.fatigue[player.id] ?? 0;
  const context: SituationContext = {
    minute: ms.minute,
    scoreFor: s.pour,
    scoreAgainst: s.contre,
    defenderQuality: q.defender,
    goalkeeperQuality: q.goalkeeper,
    distanceM,
    angle,
    density,
    pressure: pressureAt(ms, ctx),
    playerFitness: clamp(player.fitness - fatigue * BALANCE.resolution.fatigue.matchFatigueWeight, 0, 100),
    repetitionCount: 0,
    manMarked: ms.opponentAdaptations.manMarking,
  };

  const opponents = onPitch(ms, ctx, opp);
  const teammates = onPitch(ms, ctx, side).filter((f) => f.id !== player.id);
  const defender = pickName(opponents.filter((f) => DEFENDER_POSITIONS.includes(f.position)), rng);
  const gk = opponents.find((f) => f.position === 'GB');
  const passer = pickName(teammates.filter((f) => f.position !== 'GB'), rng);
  const facts: Facts = {
    minute: ms.minute,
    score: `${s.pour}-${s.contre}`,
    cote: rng.pick(['gauche', 'droite', 'axe'] as const),
    distance: distanceM,
    defenseur: defender ? fullName(defender.identity) : 'un défenseur',
    gardien: gk ? fullName(gk.identity) : 'le gardien',
    passeur: passer ? fullName(passer.identity) : 'un coéquipier',
    passeurId: passer?.id ?? '',
    marquageIndividuel: ms.opponentAdaptations.manMarking,
    domicile: side === 'home',
    ...extraFacts,
  };
  if (facts.aerien === undefined) {
    const share = (S.aerialShare as Partial<Record<SituationKind, number>>)[kind];
    if (share !== undefined) facts.aerien = rng.chance(share);
  }
  if (kind === 'corner_offensif' && facts.tireur === undefined) facts.tireur = isSetPieceTaker(ms, ctx, 'centres');
  if ((kind === 'contre_adverse' || kind === 'faute_tactique_possible') && facts.dernierDefenseur === undefined) facts.dernierDefenseur = rng.chance(S.lastManShare);
  if (depth > 0) {
    facts.enchainement = true;
    facts.profondeur = depth;
  }

  const isGK = player.identity.position === 'GB';
  const allowedActions = allowedActionsFor(kind, facts, isGK);
  const actionIndex = ms.actionIndex++;
  const situation: Situation = {
    id: `${ctx.match.id}:${actionIndex}:${depth}`,
    matchId: ctx.match.id,
    actionIndex,
    kind,
    context,
    facts,
    baseProbability: 0,
    allowedActions,
    defaultAction: { action: 'attendre', intensite: 0.5, risque: 0.3, meta: false },
    // Chrono NU, celui d'un joueur qui écrit : le moteur ignore comment le joueur
    // répond. Le mode vocal est une affaire d'interface — le store applique
    // BALANCE.situations.voiceTimerMultiplier / voiceTimerMinimumSeconds par-dessus,
    // et n'arme l'échéance qu'une fois la situation lue à haute voix.
    timerSeconds: ctx.difficulty.decisionTimerSeconds || S.defaultTimerSeconds,
    nearbyTeammateIds: nearbyTeammates(ms, ctx, side, rng),
  };
  situation.defaultAction = autoDecide(situation, ctx, ms, rng);
  const spec = actionSpec(kind, situation.defaultAction.action);
  situation.baseProbability = spec ? BALANCE.baseProbability[baseKeyOf(spec, situation)] : 0;
  return situation;
}

/** Situations « primaires » déjà vécues (les enchaînements ne comptent pas dans la cadence). */
export function primarySituationCount(ms: MatchState): number {
  return ms.decisions.filter((d) => d.situationId.endsWith(':0')).length;
}

function pickMixKind(ms: MatchState, ctx: MatchContext, rng: Rng): SituationKind | null {
  const player = ctx.player!;
  const side = ctx.playerSide!;
  const mix = positionProfile(player.identity.position).situationMix;
  const s = scoreFor(ms, side);
  const kinds: SituationKind[] = [];
  const weights: number[] = [];
  for (const [k, w] of Object.entries(mix) as [SituationKind, number][]) {
    if (!w || w <= 0) continue;
    if (k === 'blessure_ressentie') continue;
    if (k === 'tension_fin_de_match' && (ms.minute < S.tensionFromMinute || Math.abs(s.pour - s.contre) > 1)) continue;
    if (k === 'penalty' && !isSetPieceTaker(ms, ctx, 'penalty')) continue;
    if (k === 'coup_franc_direct' && !isSetPieceTaker(ms, ctx, 'coupsFrancs')) continue;
    // §6.4 : plus la réputation monte, plus l'adversaire cherche à te provoquer.
    const provocation = k === 'provocation_adverse'
      ? 1 + BALANCE.adaptation.provocationPerReputationPoint * (ctx.playerLeagueReputation ?? 0)
      : 1;
    kinds.push(k);
    weights.push(w * provocation);
  }
  if (kinds.length === 0) return null;
  let kind = rng.weighted(kinds, weights);
  if (OFF_BALL_KINDS.includes(kind)) {
    const fatigue = ms.fatigue[player.id] ?? 0;
    const prob = S.injuryFeelingProb * ctx.difficulty.injuryFrequency * (0.5 + fatigue / 100) * (1 + player.injuryProneness);
    if (rng.chance(prob)) kind = 'blessure_ressentie';
  }
  return kind;
}

/**
 * Décide si une situation impliquant le joueur survient cette minute :
 * occasion de son équipe (offerte selon le poste), occasion adverse
 * (situation défensive), sinon cadence du mix de poste vers la cible du match.
 */
export function maybeCreateSituation(ms: MatchState, ctx: MatchContext, rng: Rng, opportunity: MinuteOutcome): Situation | null {
  const player = ctx.player;
  const side = ctx.playerSide;
  if (!player || !side || !ms.playerOnPitch || ms.pendingSituation) return null;
  const position = player.identity.position;

  if (opportunity.teamChanceSide === side) {
    if (rng.chance(S.teamChanceInvolvement[position])) {
      const mapped = offensiveKindForChance(opportunity.chanceKind, ms, ctx);
      if (mapped) return buildSituation(mapped.kind, ms, ctx, rng, { ...mapped.facts, occasionEquipe: true, xgOccasion: opportunity.chanceXg ?? 0 });
    }
    return null;
  }
  if (opportunity.teamChanceSide && opportunity.teamChanceSide !== side) {
    if (rng.chance(S.defensiveInvolvement[position])) {
      const mapped = defensiveKindForChance(opportunity.chanceKind, position, rng);
      if (mapped) return buildSituation(mapped.kind, ms, ctx, rng, { ...mapped.facts, occasionAdverse: true, xgOccasion: opportunity.chanceXg ?? 0, typeOccasion: opportunity.chanceKind ?? '' });
    }
    return null;
  }

  if (ms.lastSituationMinute > 0 && ms.minute - ms.lastSituationMinute < S.minGapMinutes) return null;
  const target = ms.situationTarget ?? 0;
  const remaining = target - primarySituationCount(ms);
  if (remaining <= 0) return null;
  const minutesLeft = Math.max(1, 90 - ms.minute + S.expectedAddedMinutes);
  const inv = S.involvement;
  const sign = side === 'home' ? 1 : -1;
  let prob = remaining / minutesLeft;
  prob *= 1 + inv.formInfluence * clamp(player.form, -5, 5);
  prob *= 1 + inv.momentumInfluence * ms.momentum * sign;
  if (ms.minute >= inv.lateFromMinute) prob *= inv.lateMatchBoost;
  if (!rng.chance(Math.min(S.maxPerMinuteProb, prob))) return null;
  const kind = pickMixKind(ms, ctx, rng);
  return kind ? buildSituation(kind, ms, ctx, rng) : null;
}

/** Enchaînement : un dribble réussi ouvre une frappe, un appel réussi un face-à-face. */
export function followUpSituation(prev: Situation, outcome: ActionOutcome, ms: MatchState, ctx: MatchContext, rng: Rng): Situation | null {
  if (!outcome.followUp || !ctx.player || !ctx.playerSide || !ms.playerOnPitch) return null;
  const depth = Number(prev.facts.profondeur ?? 0) + 1;
  if (depth > BALANCE.resolution.followUpMaxDepth) return null;
  if (outcome.followUp === 'penalty' && !isSetPieceTaker(ms, ctx, 'penalty')) return null;
  const facts: Facts = { passeurId: prev.facts.passeurId ?? '', passeur: prev.facts.passeur ?? 'un coéquipier' };
  if (outcome.followUp === 'penalty') facts.tireur = true;
  if (prev.facts.occasionAdverse === true) facts.occasionAdverse = false;
  return buildSituation(outcome.followUp, ms, ctx, rng, facts, depth);
}
