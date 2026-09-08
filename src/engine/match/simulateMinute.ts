/**
 * Simulation de fond d'une minute (§5.1) : fatigue, possession, momentum,
 * discipline, blessures PNJ, remplacements, ambiance et occasions des deux
 * équipes. Quand le joueur incarné est sur le terrain, l'occasion de la minute
 * lui est « offerte » (déférée) : situations.ts décide s'il est impliqué,
 * sinon l'appelant la résout via resolveDeferredChance.
 */
import type { Id, MatchContext, MatchEvent, MatchState, Position } from '../types';
import type { Rng } from '../rng/mulberry32';
import { hashKey } from '../rng/derive';
import { BALANCE } from '../config/balance';
import { positionCompatibility } from '../config/positions';
import { clamp, clamp01, fullName, otherSide, pushEvent, scoreFor } from './matchEvents';
import { effectiveOverall, getFootballer, refreshStrength, type Footballer } from './teamStrength';
import { initialSituationTarget } from './situations';

const MS = BALANCE.matchSim;
type Side = 'home' | 'away';

export interface ChanceType { kind: string; weight: number; xg: number }

export interface MinuteOutcome {
  events: MatchEvent[];
  /** Vrai si une occasion de l'équipe du joueur lui est offerte cette minute. */
  playerOpportunity: boolean;
  /** Côté qui a une occasion en attente de résolution (déférée au joueur). */
  teamChanceSide?: Side;
  chanceKind?: string;
  chanceXg?: number;
}

// ── Accès ────────────────────────────────────────────────────────────────

function pitch(ms: MatchState, ctx: MatchContext, side: Side): Footballer[] {
  return ms.lineups[side].starters.map((id) => getFootballer(ctx, id));
}

function npcsOnPitch(ms: MatchState, ctx: MatchContext, side: Side): Footballer[] {
  return pitch(ms, ctx, side).filter((f) => f.id !== ctx.player?.id);
}

export function goalkeeperOf(ms: MatchState, ctx: MatchContext, side: Side): Footballer | undefined {
  return pitch(ms, ctx, side).find((f) => f.position === 'GB');
}

/** Effet de la finition d'un tireur PNJ sur la conversion. */
export function finisherEffect(f: Footballer): number {
  const e = MS.finisherEffect;
  const v = (f.attributes.finition + f.attributes.tete + f.attributes.sangFroid) / 3;
  return clamp(1 + e.perPoint * (v - e.reference), e.min, e.max);
}

/** Effet du gardien adverse sur la conversion (meilleur gardien → moins de buts). */
export function goalkeeperEffect(gk: Footballer | undefined): number {
  const e = MS.goalkeeperEffect;
  const v = gk ? gk.overall : e.reference;
  return clamp(1 - e.perPoint * (v - e.reference), e.min, e.max);
}

// ── Entretien de la minute ───────────────────────────────────────────────

function decayMomentum(ms: MatchState): void {
  ms.momentum *= 1 - MS.momentum.decayPerMinute;
  if (Math.abs(ms.momentum) < 0.001) ms.momentum = 0;
}

function updateFatigue(ms: MatchState, ctx: MatchContext): void {
  for (const side of ['home', 'away'] as const) {
    const pressing = ctx[side].strength.pressing;
    for (const f of pitch(ms, ctx, side)) {
      const endurance = 1 + MS.fatigueExtra.enduranceInfluence * (MS.fatigueExtra.enduranceReference - f.attributes.endurance) / 100;
      const per = MS.fatigue.perMinute * (1 + MS.fatigue.pressingExtra * pressing) * Math.max(0.4, endurance);
      ms.fatigue[f.id] = Math.min(100, (ms.fatigue[f.id] ?? 0) + per);
    }
  }
}

function updatePossession(ms: MatchState, ctx: MatchContext): void {
  const p = MS.possession;
  const share = clamp(0.5 + p.midfieldWeight * (ctx.home.strength.midfield - ctx.away.strength.midfield) / 99, p.min, p.max);
  ms.homePossessionMinutes += share;
}

function playerPassiveTick(ms: MatchState, ctx: MatchContext): void {
  if (!ctx.player || !ms.playerOnPitch) return;
  const pos = ctx.player.identity.position;
  const ps = MS.passiveStats;
  ms.playerMinutes += 1;
  const st = ms.playerStats;
  st.touches += ps.touchesPerMinute[pos];
  const passes = ps.passesPerMinute[pos];
  st.passesAttempted += passes;
  st.passesCompleted += passes * ps.passAccuracy[pos];
  st.distanceKm += ps.distanceKmPerMinute[pos];
  st.sprints += ps.sprintsPerMinute[pos];
}

function averageFatigue(ms: MatchState, side: Side): number {
  const ids = ms.lineups[side].starters;
  if (ids.length === 0) return 0;
  return ids.reduce((s, id) => s + (ms.fatigue[id] ?? 0), 0) / ids.length;
}

// ── Discipline, blessures, remplacements ─────────────────────────────────

function weightedNpc(list: Footballer[], weights: Record<Position, number>, rng: Rng, extra?: (f: Footballer) => number): Footballer | undefined {
  if (list.length === 0) return undefined;
  return rng.weighted(list, list.map((f) => Math.max(0.001, weights[f.position] * (extra ? extra(f) : 1))));
}

function expel(ms: MatchState, ctx: MatchContext, side: Side, id: Id): void {
  const lineup = ms.lineups[side];
  lineup.starters = lineup.starters.filter((x) => x !== id);
  if (ctx.player && id === ctx.player.id) ms.playerOnPitch = false;
  refreshStrength(ctx, side, lineup);
}

function hasYellow(ms: MatchState, id: Id): boolean {
  return ms.events.some((e) => e.type === 'carton_jaune' && e.playerId === id);
}

function disciplineTick(ms: MatchState, ctx: MatchContext, rng: Rng): void {
  const d = MS.discipline;
  for (const side of ['home', 'away'] as const) {
    if (!rng.chance(d.foulsPerTeam / 90)) continue;
    const fouler = weightedNpc(npcsOnPitch(ms, ctx, side), MS.foulWeights, rng);
    if (!fouler) continue;
    pushEvent(ms, { type: 'faute', side, playerId: fouler.id, involvesPlayer: false, detail: { nom: fullName(fouler.identity) } });
    const roll = rng.next();
    if (roll < d.redsPerTeam / d.foulsPerTeam) {
      pushEvent(ms, { type: 'carton_rouge', side, playerId: fouler.id, involvesPlayer: false, detail: { nom: fullName(fouler.identity), motif: 'faute grossière' } });
      expel(ms, ctx, side, fouler.id);
    } else if (roll < (d.redsPerTeam + d.yellowsPerTeam) / d.foulsPerTeam) {
      if (hasYellow(ms, fouler.id)) {
        pushEvent(ms, { type: 'carton_rouge', side, playerId: fouler.id, involvesPlayer: false, detail: { nom: fullName(fouler.identity), motif: 'second avertissement' } });
        expel(ms, ctx, side, fouler.id);
      } else {
        pushEvent(ms, { type: 'carton_jaune', side, playerId: fouler.id, involvesPlayer: false, detail: { nom: fullName(fouler.identity) } });
      }
    }
  }
}

/** Remplaçant PNJ le plus adapté pour remplacer `out` : compatibilité de poste puis note. */
function bestBenchReplacement(ms: MatchState, ctx: MatchContext, side: Side, out: Footballer): Footballer | undefined {
  const bench = ms.lineups[side].bench.filter((id) => id !== ctx.player?.id).map((id) => getFootballer(ctx, id));
  const candidates = bench.filter((f) => (out.position === 'GB') === (f.position === 'GB'));
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => {
    const sa = positionCompatibility(a.position, out.position) * 100 + a.overall * 0.3;
    const sb = positionCompatibility(b.position, out.position) * 100 + b.overall * 0.3;
    return sb - sa || a.id.localeCompare(b.id);
  })[0];
}

function applySubstitution(ms: MatchState, ctx: MatchContext, side: Side, out: Footballer, inc: Footballer, reason: string, rng: Rng): void {
  const lineup = ms.lineups[side];
  const idx = lineup.starters.indexOf(out.id);
  if (idx < 0) return;
  lineup.starters[idx] = inc.id;
  lineup.bench = lineup.bench.filter((id) => id !== inc.id);
  if (side === 'home') ms.homeSubsUsed++; else ms.awaySubsUsed++;
  ms.fatigue[inc.id] = MS.fatigueExtra.substituteStart;
  const player = ctx.player;
  const involves = !!player && (out.id === player.id || inc.id === player.id);
  pushEvent(ms, {
    type: 'remplacement', side, playerId: inc.id, secondaryPlayerId: out.id, involvesPlayer: involves,
    detail: { entrant: fullName(inc.identity), sortant: fullName(out.identity), raison: reason },
  });
  if (player && inc.id === player.id) {
    ms.playerOnPitch = true;
    ms.playerStats.subOn = 1;
    ms.situationTarget = initialSituationTarget(player.identity.position, rng, false, Math.max(1, 90 - ms.minute));
  }
  if (player && out.id === player.id) {
    ms.playerOnPitch = false;
    ms.playerStats.subOff = 1;
  }
  refreshStrength(ctx, side, lineup);
}

/** Expulse le joueur incarné : équipe réduite, plus de situations. */
export function expelPlayer(ms: MatchState, ctx: MatchContext): void {
  if (!ctx.player || !ctx.playerSide) return;
  expel(ms, ctx, ctx.playerSide, ctx.player.id);
}

/** Sort le joueur incarné (décision du coach, blessure). Renvoie vrai s'il a quitté le terrain. */
export function subOffPlayer(ms: MatchState, ctx: MatchContext, reason: string, rng: Rng): boolean {
  if (!ctx.player || !ctx.playerSide || !ms.playerOnPitch) return false;
  const side = ctx.playerSide;
  const used = side === 'home' ? ms.homeSubsUsed : ms.awaySubsUsed;
  const out = getFootballer(ctx, ctx.player.id);
  const inc = used < MS.substitutions.max ? bestBenchReplacement(ms, ctx, side, out) : undefined;
  if (!inc) {
    // Plus de remplaçant possible : le joueur reste, sauf blessure (équipe réduite).
    if (reason === 'blessure') expel(ms, ctx, side, ctx.player.id);
    return reason === 'blessure';
  }
  applySubstitution(ms, ctx, side, out, inc, reason, rng);
  return true;
}

function substitutionFor(ms: MatchState, ctx: MatchContext, side: Side, rng: Rng, forcedOut?: Footballer): void {
  const used = side === 'home' ? ms.homeSubsUsed : ms.awaySubsUsed;
  if (used >= MS.substitutions.max) return;
  const player = ctx.player;
  const playerHere = !!player && ctx.playerSide === side;
  const playerOnBench = playerHere && !ms.playerOnPitch && ms.lineups[side].bench.includes(player!.id) && ms.playerMinutes === 0;

  // Le joueur incarné entre en jeu ?
  if (playerOnBench && !forcedOut && rng.chance(MS.substitutionExtra.playerFromBenchProb)) {
    const me = getFootballer(ctx, player!.id);
    const candidates = npcsOnPitch(ms, ctx, side).filter((f) => (me.position === 'GB') === (f.position === 'GB'));
    const out = candidates.sort((a, b) => {
      const sa = positionCompatibility(me.position, a.position) * 60 + (ms.fatigue[a.id] ?? 0) * 0.4;
      const sb = positionCompatibility(me.position, b.position) * 60 + (ms.fatigue[b.id] ?? 0) * 0.4;
      return sb - sa || a.id.localeCompare(b.id);
    })[0];
    if (out) {
      applySubstitution(ms, ctx, side, out, me, 'entrée en jeu', rng);
      return;
    }
  }

  const x = MS.substitutionExtra;
  const candidates = npcsOnPitch(ms, ctx, side).filter((f) => f.position !== 'GB');
  const out = forcedOut ?? candidates.sort((a, b) => {
    const sa = (ms.fatigue[a.id] ?? 0) * x.fatigueWeight - effectiveOverall(a, a.position) * x.overallWeight;
    const sb = (ms.fatigue[b.id] ?? 0) * x.fatigueWeight - effectiveOverall(b, b.position) * x.overallWeight;
    return sb - sa || a.id.localeCompare(b.id);
  })[0];
  if (!out) return;
  const inc = bestBenchReplacement(ms, ctx, side, out);
  if (!inc) return;
  applySubstitution(ms, ctx, side, out, inc, forcedOut ? 'blessure' : 'changement tactique', rng);
}

/**
 * Minutes de changement de ce match, pour un côté.
 *
 * Les minutes de référence sont décalées de quelques minutes, différemment pour
 * chaque match et chaque équipe : sans ce décalage tout le monde changerait à la
 * 58e, la 66e, la 74e… et le joueur remplaçant entrerait toujours aux mêmes
 * minutes, match après match et carrière après carrière. Le décalage vient d'un
 * hachage de (graine, match, côté) : il est stable, un rechargement le retrouve.
 */
function substitutionWindows(ctx: MatchContext, side: Side): number[] {
  const jitter = MS.substitutionExtra.jitterMinutes;
  return (MS.substitutions.typicalMinutes as readonly number[]).map((minute, i) => {
    const h = hashKey(ctx.seed, `${ctx.match.id}:fenetres:${side}`, i);
    const decalage = (h % (jitter * 2 + 1)) - jitter;
    return Math.min(89, Math.max(MS.substitutions.fromMinute + 1, minute + decalage));
  });
}

function substitutionsTick(ms: MatchState, ctx: MatchContext, rng: Rng): void {
  if (ms.addedTime > 0) return;
  for (const side of ['home', 'away'] as const) {
    if (!substitutionWindows(ctx, side).includes(ms.minute)) continue;
    if (rng.chance(MS.substitutionWindowProb)) substitutionFor(ms, ctx, side, rng);
  }
}

function injuryTick(ms: MatchState, ctx: MatchContext, rng: Rng): void {
  for (const side of ['home', 'away'] as const) {
    if (!rng.chance(MS.npcInjuryPerMinutePerTeam)) continue;
    const victim = rng.pick(npcsOnPitch(ms, ctx, side));
    if (!victim) continue;
    pushEvent(ms, { type: 'blessure', side, playerId: victim.id, involvesPlayer: false, detail: { nom: fullName(victim.identity) } });
    if (rng.chance(MS.npcInjuryForcesSub)) {
      const used = side === 'home' ? ms.homeSubsUsed : ms.awaySubsUsed;
      if (used < MS.substitutions.max) substitutionFor(ms, ctx, side, rng, victim);
      else expel(ms, ctx, side, victim.id);
    }
  }
}

// ── Ambiance ─────────────────────────────────────────────────────────────

const COACH_LINES = {
  leading: ['On garde le bloc compact, pas de cadeau !', 'Continuez comme ça, on ne recule pas !'],
  drawing: ['Plus haut le pressing, on va les chercher !', 'Jouez simple, le but va venir.'],
  trailing: ['Réveillez-vous ! On accélère, tout de suite !', 'On monte d\'un cran, prenez des risques !'],
};

function atmosphereTick(ms: MatchState, ctx: MatchContext, rng: Rng): void {
  const at = MS.atmosphere;
  if (ctx.player && ctx.playerSide && (at.coachInstructionMinutes as readonly number[]).includes(ms.minute) && ms.addedTime === 0) {
    const s = scoreFor(ms, ctx.playerSide);
    const lines = s.pour > s.contre ? COACH_LINES.leading : s.pour < s.contre ? COACH_LINES.trailing : COACH_LINES.drawing;
    pushEvent(ms, { type: 'consigne_coach', side: ctx.playerSide, involvesPlayer: ms.playerOnPitch, detail: { texte: rng.pick(lines), coach: ctx[ctx.playerSide].coach.lastName } });
  }
  if (ms.minute >= at.whistlesFromMinute && ms.homeGoals < ms.awayGoals && rng.chance(at.whistlesProb)) {
    pushEvent(ms, { type: 'sifflets', side: 'home', involvesPlayer: false, detail: { motif: 'le public gronde' } });
  }
}

// ── Occasions ────────────────────────────────────────────────────────────

/** Taux d'occasion par minute d'un côté : forces effectives, terrain, score, momentum, fatigue. */
export function chanceRate(ms: MatchState, ctx: MatchContext, side: Side): number {
  const opp = otherSide(side);
  const S = ctx[side].strength;
  const O = ctx[opp].strength;
  const mix = MS.lineMix;
  const att = mix.attackFromAttack * S.attack + mix.attackFromMidfield * S.midfield;
  const def = mix.defenseFromDefense * O.defense + mix.defenseFromMidfield * O.midfield + mix.defenseFromGoalkeeper * O.goalkeeper;
  let rate = MS.chancesPerMinutePerTeam * Math.pow(att / Math.max(1, def), MS.strengthExponent);
  if (side === 'home' && !ctx.match.neutralVenue) rate *= MS.homeAdvantage.chanceMultiplier;
  const s = scoreFor(ms, side);
  if (ms.minute >= MS.scoreEffect.fromMinute) {
    if (s.pour < s.contre) rate *= MS.scoreEffect.trailingMultiplier;
    else if (s.pour > s.contre) rate *= MS.scoreEffect.leadingMultiplier;
  }
  rate *= 1 + MS.momentum.chanceInfluence * ms.momentum * (side === 'home' ? 1 : -1);
  if (ms.minute >= MS.fatigue.fromMinute) rate *= 1 - MS.fatigue.strengthMalusAtFull * averageFatigue(ms, side) / 100;
  if (ms.half === 'prolongation') rate *= MS.extraTime.chanceMultiplier;
  return clamp01(rate);
}

export function pickChanceType(rng: Rng): ChanceType {
  const types = MS.chanceTypes as readonly ChanceType[];
  return rng.weighted(types, types.map((t) => t.weight));
}

/** Marque un but : score, momentum, événement (et clameur à domicile). */
export function scoreGoal(ms: MatchState, ctx: MatchContext, side: Side, scorerId: Id, assistId: Id | undefined, type: 'but' | 'penalty_marque' | 'but_csc', detail: Record<string, string | number | boolean> = {}): MatchEvent {
  if (side === 'home') ms.homeGoals++; else ms.awayGoals++;
  ms.momentum = clamp(ms.momentum + (side === 'home' ? 1 : -1) * MS.momentum.goalShift, -1, 1);
  const scorer = getFootballer(ctx, scorerId);
  const assister = assistId ? getFootballer(ctx, assistId) : undefined;
  const involves = !!ctx.player && (scorerId === ctx.player.id || assistId === ctx.player.id);
  const ev = pushEvent(ms, {
    type, side, playerId: scorerId, secondaryPlayerId: assistId, involvesPlayer: involves,
    detail: { buteur: fullName(scorer.identity), passeur: assister ? fullName(assister.identity) : '', score: `${ms.homeGoals}-${ms.awayGoals}`, ...detail },
  });
  if (side === 'home' && MS.atmosphere.roarOnHomeGoal) pushEvent(ms, { type: 'clameur', side: 'home', involvesPlayer: false, detail: { motif: 'but à domicile' } });
  return ev;
}

function pickScorer(ms: MatchState, ctx: MatchContext, side: Side, rng: Rng): Footballer | undefined {
  return weightedNpc(npcsOnPitch(ms, ctx, side).filter((f) => f.position !== 'GB'), MS.scorerWeights, rng, (f) => 0.5 + finisherEffect(f));
}

function pickAssister(ms: MatchState, ctx: MatchContext, side: Side, scorerId: Id, rng: Rng): Footballer | undefined {
  if (!rng.chance(MS.assistShare)) return undefined;
  return weightedNpc(npcsOnPitch(ms, ctx, side).filter((f) => f.id !== scorerId), MS.assistWeights, rng);
}

/** Résout une occasion d'équipe d'un type donné (sans le joueur incarné comme tireur). */
export function resolveTeamChanceOfKind(side: Side, ct: ChanceType, ms: MatchState, ctx: MatchContext, rng: Rng): MatchEvent[] {
  const before = ms.events.length;
  const opp = otherSide(side);
  const shooter = pickScorer(ms, ctx, side, rng);
  if (!shooter) return [];
  const gk = goalkeeperOf(ms, ctx, opp);
  const xg = ct.xg * (ms.half === 'prolongation' ? MS.extraTime.chanceMultiplier : 1);
  if (side === 'home') ms.homeXg += xg; else ms.awayXg += xg;
  ms.momentum = clamp(ms.momentum + (side === 'home' ? 1 : -1) * MS.momentum.chanceShift, -1, 1);
  const name = fullName(shooter.identity);

  if (ct.kind === 'penalty') {
    const fouler = weightedNpc(npcsOnPitch(ms, ctx, opp), MS.foulWeights, rng);
    pushEvent(ms, { type: 'faute', side: opp, playerId: fouler?.id, involvesPlayer: false, detail: { fautif: fouler ? fullName(fouler.identity) : 'un défenseur', penalty: true } });
    const taker = npcsOnPitch(ms, ctx, side).sort((a, b) => b.attributes.penalty - a.attributes.penalty)[0] ?? shooter;
    const conversion = clamp(BALANCE.baseProbability.penalty * clamp(1 + MS.finisherEffect.perPoint * (taker.attributes.penalty - MS.finisherEffect.reference), MS.finisherEffect.min, MS.finisherEffect.max) * goalkeeperEffect(gk), 0, BALANCE.caps.penalty);
    if (rng.chance(conversion)) {
      scoreGoal(ms, ctx, side, taker.id, undefined, 'penalty_marque', { penalty: true });
    } else if (rng.chance(BALANCE.resolution.penaltyMiss.arret)) {
      pushEvent(ms, { type: 'penalty_arrete', side, playerId: taker.id, secondaryPlayerId: gk?.id, involvesPlayer: !!ctx.player && gk?.id === ctx.player.id, detail: { tireur: fullName(taker.identity) } });
    } else {
      pushEvent(ms, { type: 'penalty_rate', side, playerId: taker.id, involvesPlayer: false, detail: { tireur: fullName(taker.identity) } });
    }
    return ms.events.slice(before);
  }

  if (ct.kind === 'tete' && rng.chance(MS.cornerBeforeHeaderShare)) {
    pushEvent(ms, { type: 'corner', side, involvesPlayer: false });
  }
  const conversion = clamp(xg * finisherEffect(shooter) * goalkeeperEffect(gk), 0, BALANCE.caps.butVideDeuxMetres);
  const big = xg >= BALANCE.resolution.bigChanceXg;
  if (big) pushEvent(ms, { type: 'grosse_occasion', side, playerId: shooter.id, xg, involvesPlayer: false, detail: { tireur: name, type: ct.kind } });
  if (rng.chance(conversion)) {
    const assister = ct.kind === 'contre' || ct.kind === 'frappe_lointaine' ? (rng.chance(0.5) ? pickAssister(ms, ctx, side, shooter.id, rng) : undefined) : pickAssister(ms, ctx, side, shooter.id, rng);
    scoreGoal(ms, ctx, side, shooter.id, assister?.id, 'but', { type: ct.kind, xg: Math.round(xg * 100) / 100 });
    return ms.events.slice(before);
  }
  const roll = rng.next();
  const o = MS.shotOutcome;
  const gkInvolved = !!ctx.player && gk?.id === ctx.player.id;
  if (roll < o.onTargetShare) {
    pushEvent(ms, { type: 'arret', side: opp, playerId: gk?.id, secondaryPlayerId: shooter.id, xg, involvesPlayer: gkInvolved, detail: { tireur: name, type: ct.kind } });
  } else if (roll < o.onTargetShare + o.postShare) {
    pushEvent(ms, { type: 'poteau', side, playerId: shooter.id, xg, involvesPlayer: false, detail: { tireur: name } });
  } else {
    pushEvent(ms, { type: 'tir_non_cadre', side, playerId: shooter.id, xg, involvesPlayer: false, detail: { tireur: name, type: ct.kind } });
  }
  if (big) pushEvent(ms, { type: 'occasion_manquee', side, playerId: shooter.id, xg, involvesPlayer: false, detail: { tireur: name } });
  return ms.events.slice(before);
}

/** Occasion d'équipe générique : type tiré au sort puis résolution. */
export function resolveTeamChance(side: Side, ms: MatchState, ctx: MatchContext, rng: Rng): MatchEvent[] {
  return resolveTeamChanceOfKind(side, pickChanceType(rng), ms, ctx, rng);
}

/** Résout l'occasion déférée d'une minute quand le joueur n'y a pas été impliqué. */
export function resolveDeferredChance(outcome: MinuteOutcome, ms: MatchState, ctx: MatchContext, rng: Rng): MatchEvent[] {
  if (!outcome.teamChanceSide) return [];
  const ct: ChanceType = { kind: outcome.chanceKind ?? 'reprise_surface', weight: 1, xg: outcome.chanceXg ?? MS.xgPerShot };
  return resolveTeamChanceOfKind(outcome.teamChanceSide, ct, ms, ctx, rng);
}

/**
 * Une minute de jeu. Les occasions sont déférées au joueur incarné s'il est sur
 * le terrain (une par minute au plus), résolues immédiatement sinon.
 */
export function simulateMinute(ms: MatchState, ctx: MatchContext, rng: Rng): MinuteOutcome {
  const before = ms.events.length;
  decayMomentum(ms);
  updateFatigue(ms, ctx);
  updatePossession(ms, ctx);
  playerPassiveTick(ms, ctx);
  disciplineTick(ms, ctx, rng);
  injuryTick(ms, ctx, rng);
  substitutionsTick(ms, ctx, rng);
  atmosphereTick(ms, ctx, rng);

  const outcome: MinuteOutcome = { events: [], playerOpportunity: false };
  const deferable = !!ctx.player && !!ctx.playerSide && ms.playerOnPitch;
  const order: Side[] = rng.chance(0.5) ? ['home', 'away'] : ['away', 'home'];
  for (const side of order) {
    if (!rng.chance(chanceRate(ms, ctx, side))) continue;
    const ct = pickChanceType(rng);
    if (deferable && !outcome.teamChanceSide) {
      outcome.teamChanceSide = side;
      outcome.chanceKind = ct.kind;
      outcome.chanceXg = ct.xg;
      outcome.playerOpportunity = side === ctx.playerSide;
    } else {
      resolveTeamChanceOfKind(side, ct, ms, ctx, rng);
    }
  }
  outcome.events = ms.events.slice(before);
  return outcome;
}
