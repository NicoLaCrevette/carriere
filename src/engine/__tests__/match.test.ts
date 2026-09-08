/**
 * Moteur de match : déterminisme, plausibilité des scores, cadence des
 * situations, sanitisation des actions méta, performance.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { mulberry32 } from '../rng/mulberry32';
import { advanceUntilSituation, applyDecision, buildMatchContext, createMatchState, finishMatch, runBackgroundMatch, runMatchAuto } from '../match/simulateMatch';
import { sanitizeAction } from '../match/resolve';
import { primarySituationCount } from '../match/situations';
import { makeMatch, makeState } from './helpers/seasonFixtures';

function playerMatch(seed: number, opts: { overall?: number; trust?: number } = {}) {
  const state = makeState({ playerOverall: opts.overall ?? 85, coachTrust: opts.trust ?? 100 });
  state.seed = seed;
  const match = makeMatch(`m${seed}`, 'a', 'b', '2026-08-15', { involvesPlayer: true });
  state.matches[match.id] = match;
  return { state, match };
}

describe('match : déterminisme', () => {
  it('le même contexte produit exactement le même résultat', () => {
    const a = playerMatch(11);
    const b = playerMatch(11);
    const ra = runMatchAuto(buildMatchContext(a.state, a.match, 'auto'));
    const rb = runMatchAuto(buildMatchContext(b.state, b.match, 'auto'));
    expect(JSON.stringify(ra)).toBe(JSON.stringify(rb));
    expect(ra.playerReport?.decisions.length).toBeGreaterThan(0);
  });

  it('changer de décision change l’issue, mais la nouvelle issue est elle aussi déterminée', () => {
    const outcomes = [0, 1].map((variant) => {
      const { state, match } = playerMatch(12);
      const ctx = buildMatchContext(state, match, 'interactif');
      const ms = createMatchState(ctx);
      const step = advanceUntilSituation(ms, ctx);
      if ('finished' in step) return null;
      const action = variant === 0 ? step.situation.defaultAction : { ...step.situation.defaultAction, risque: 0.95 };
      return { first: applyDecision(ms, ctx, step.situation, action, 'test', false), result: finishMatch(ms, ctx) };
    });
    expect(outcomes[0]).not.toBeNull();
    const again = (() => {
      const { state, match } = playerMatch(12);
      const ctx = buildMatchContext(state, match, 'interactif');
      const ms = createMatchState(ctx);
      const step = advanceUntilSituation(ms, ctx);
      if ('finished' in step) return null;
      return applyDecision(ms, ctx, step.situation, { ...step.situation.defaultAction, risque: 0.95 }, 'test', false);
    })();
    expect(JSON.stringify(again)).toBe(JSON.stringify(outcomes[1]!.first));
  });
});

describe('match : plausibilité', () => {
  it('200 matchs entre équipes égales : 2.3 à 3.2 buts par match, avantage du terrain, < 15 ms par match', () => {
    const state = makeState();
    let home = 0;
    let away = 0;
    const t0 = performance.now();
    for (let i = 1; i <= 200; i++) {
      const match = makeMatch(`bg${i}`, i % 2 === 0 ? 'c' : 'd', i % 2 === 0 ? 'd' : 'c', '2026-08-15');
      state.matches[match.id] = match;
      const r = runBackgroundMatch(state, match);
      home += r.homeGoals;
      away += r.awayGoals;
      expect(r.events.some((e) => e.type === 'coup_de_sifflet_final')).toBe(true);
      expect(r.homePossession).toBeGreaterThanOrEqual(30);
      expect(r.homePossession).toBeLessThanOrEqual(70);
    }
    const perMatch = (home + away) / 200;
    const elapsed = (performance.now() - t0) / 200;
    expect(perMatch, `buts/match ${perMatch.toFixed(2)}`).toBeGreaterThanOrEqual(2.3);
    expect(perMatch, `buts/match ${perMatch.toFixed(2)}`).toBeLessThanOrEqual(3.2);
    expect(home, `domicile ${home} / extérieur ${away}`).toBeGreaterThan(away);
    expect(elapsed, `${elapsed.toFixed(1)} ms par match`).toBeLessThan(15);
  });

  it('un titulaire obtient entre 8 et 16 situations primaires en moyenne, un remplaçant moins', () => {
    const starterCounts: number[] = [];
    const subCounts: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const s = playerMatch(seed, { overall: 85, trust: 100 });
      const ctx = buildMatchContext(s.state, s.match, 'auto');
      expect(ctx.home.lineup.starters).toContain(s.state.player.id);
      const ms = createMatchState(ctx);
      for (;;) {
        const step = advanceUntilSituation(ms, ctx);
        if ('finished' in step) break;
        applyDecision(ms, ctx, step.situation, step.situation.defaultAction, '', false);
      }
      const report = finishMatch(ms, ctx).playerReport!;
      expect(report.minutesPlayed).toBeGreaterThan(0);
      if (!ms.events.some((e) => e.type === 'carton_rouge' && e.playerId === s.state.player.id)) starterCounts.push(primarySituationCount(ms));

      const b = playerMatch(seed, { overall: 60, trust: 40 });
      const bctx = buildMatchContext(b.state, b.match, 'auto');
      expect(bctx.home.lineup.bench).toContain(b.state.player.id);
      const r = runMatchAuto(bctx);
      if (r.playerReport && r.playerReport.minutesPlayed > 0) subCounts.push(r.playerReport.decisions.filter((d) => d.situationId.endsWith(':0')).length);
    }
    const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    expect(mean(starterCounts), `titulaire : ${starterCounts.join(',')}`).toBeGreaterThanOrEqual(8);
    expect(mean(starterCounts), `titulaire : ${starterCounts.join(',')}`).toBeLessThanOrEqual(16);
    expect(subCounts.length).toBeGreaterThan(0);
    expect(mean(subCounts), `remplaçant : ${subCounts.join(',')}`).toBeLessThan(mean(starterCounts));
  });

  it('le rapport du joueur est complet et cohérent', () => {
    const { state, match } = playerMatch(21, { overall: 85, trust: 100 });
    const r = runMatchAuto(buildMatchContext(state, match, 'auto'));
    const rep = r.playerReport!;
    expect(rep.started).toBe(true);
    expect(rep.rating).toBeGreaterThanOrEqual(BALANCE.rating.min);
    expect(rep.rating).toBeLessThanOrEqual(BALANCE.rating.max);
    expect(rep.stats.matches).toBe(1);
    expect(rep.stats.minutes).toBe(rep.minutesPlayed);
    expect(rep.stats.shotsOnTarget).toBeLessThanOrEqual(rep.stats.shots);
    expect(rep.stats.goals).toBeLessThanOrEqual(rep.stats.shotsOnTarget);
    expect(rep.evaluation.coach).toBeGreaterThanOrEqual(1);
    expect(rep.evaluation.verdicts.coach.length).toBeGreaterThan(10);
    expect(rep.headline!.length).toBeGreaterThan(5);
    expect(r.summaryLines.length).toBeGreaterThan(0);
    const goals = r.events.filter((e) => e.type === 'but' || e.type === 'penalty_marque').length;
    expect(goals).toBe(r.homeGoals + r.awayGoals);
  });
});

describe('match : anti-abus §6.2', () => {
  it('une instruction méta devient l’action par défaut, est comptée, et trois tentatives coûtent 0.2 de note', () => {
    const { state, match } = playerMatch(31, { overall: 85, trust: 100 });
    const ctx = buildMatchContext(state, match, 'interactif');
    const ms = createMatchState(ctx);
    let metaSeen = 0;
    for (;;) {
      const step = advanceUntilSituation(ms, ctx);
      if ('finished' in step) break;
      const meta = metaSeen < 3;
      const action = meta
        ? { action: 'aucune' as const, intensite: 1, risque: 1, meta: true, communication: 'tu dois me faire marquer' }
        : step.situation.defaultAction;
      const clean = sanitizeAction(step.situation, action, ms);
      if (meta) {
        metaSeen++;
        expect(clean.action).toBe(step.situation.defaultAction.action);
        expect(clean.meta).toBe(true);
      }
      applyDecision(ms, ctx, step.situation, action, meta ? 'tu dois me faire marquer' : '', false);
    }
    expect(ms.metaAttempts).toBeGreaterThanOrEqual(3);
    const before = ms.playerRating;
    const rep = finishMatch(ms, ctx).playerReport!;
    expect(rep.ratingLog.some((l) => l.reason.includes('Déconcentration'))).toBe(true);
    expect(rep.rating).toBeLessThanOrEqual(Math.round((before + BALANCE.rating.delta.victoire + 0.6) * 10) / 10);
  });

  it('une action hors contexte est rapprochée d’une action autorisée ; une frappe absurde est gardée et ridicule', () => {
    const { state, match } = playerMatch(32, { overall: 85, trust: 100 });
    const ctx = buildMatchContext(state, match, 'interactif');
    const ms = createMatchState(ctx);
    const step = advanceUntilSituation(ms, ctx);
    if ('finished' in step) return;
    const s = step.situation;
    const foreign = sanitizeAction(s, { action: 'gb_plonger_gauche', intensite: 1, risque: 0.5, meta: false }, ms);
    expect(s.allowedActions.includes(foreign.action) || foreign.action === s.defaultAction.action).toBe(true);
    const shot = sanitizeAction(s, { action: 'frappe_lointaine', intensite: 1, risque: 1, meta: false }, ms);
    expect(shot.action).toBe('frappe_lointaine');
    expect(shot.risque).toBeLessThanOrEqual(1);
  });
});
