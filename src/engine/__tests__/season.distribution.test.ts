/**
 * Garde-fou d'équilibrage (§6.5, §15) : N saisons simulées (graines 1..N)
 * d'un attaquant de 18 ans « prometteur », difficulté « exigeant », club de
 * milieu de tableau du jeu de données fictif. Si l'équilibrage dérive, ces
 * tests cassent. `CARRIERE_SEASONS` réduit N pendant le tuning (défaut 100).
 */
import { describe, expect, it } from 'vitest';
import { runHeadlessSeason, type HeadlessSeasonSummary } from '../sim/headless';
import { BALANCE } from '../config/balance';

const N = Number(process.env.CARRIERE_SEASONS ?? 100);
const T = BALANCE.seasonTargets;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

interface Aggregate {
  seasons: HeadlessSeasonSummary[];
  ratings: number[];
  goals: number[];
  minutes: number[];
  starts: number[];
  motm: number[];
  championPoints: number[];
  lastPoints: number[];
  goalsPerMatch: number[];
  topScorer: number[];
  injuredSeasons: number;
  hashes: string[];
  durationMs: number;
}

function simulate(seeds: number[]): Aggregate {
  const agg: Aggregate = {
    seasons: [], ratings: [], goals: [], minutes: [], starts: [], motm: [], championPoints: [], lastPoints: [],
    goalsPerMatch: [], topScorer: [], injuredSeasons: 0, hashes: [], durationMs: 0,
  };
  for (const seed of seeds) {
    const result = runHeadlessSeason({ seed, dataset: 'fictional', position: 'BU', age: 18, level: 'prometteur', difficulty: 'exigeant', seasons: 1 });
    const s = result.seasons[0];
    if (!s) throw new Error(`Graine ${seed} : aucune saison produite`);
    agg.seasons.push(s);
    agg.ratings.push(...s.player.ratings);
    agg.goals.push(s.player.goals);
    agg.minutes.push(s.player.minutes);
    agg.starts.push(s.player.starts);
    agg.motm.push(s.player.motm);
    if (s.table.length > 0) {
      agg.championPoints.push(s.table[0]!.points);
      agg.lastPoints.push(s.table[s.table.length - 1]!.points);
    }
    agg.goalsPerMatch.push(s.leagueGoals / Math.max(1, s.leagueMatches));
    if (s.scorers[0]) agg.topScorer.push(s.scorers[0].goals);
    if (s.injuries.some((i) => i.days > 7)) agg.injuredSeasons++;
    agg.hashes.push(result.hash);
    agg.durationMs += result.durationMs;
  }
  return agg;
}

function describeAgg(a: Aggregate): string {
  const share = (t: number): number => a.ratings.filter((r) => r >= t).length / Math.max(1, a.ratings.length);
  return [
    `${a.seasons.length} saisons, ${a.ratings.length} matchs joués, ${Math.round(a.durationMs / Math.max(1, a.seasons.length))} ms/saison`,
    `notes : médiane ${median(a.ratings).toFixed(2)}, moyenne ${mean(a.ratings).toFixed(2)}, ≥7.5 ${(share(7.5) * 100).toFixed(1)} %, ≥9 ${(share(9) * 100).toFixed(2)} %`,
    `buts/saison : médiane ${median(a.goals)}, p90 ${percentile(a.goals, 0.9)}, moyenne ${mean(a.goals).toFixed(2)}`,
    `minutes : médiane ${median(a.minutes)}, titularisations médiane ${median(a.starts)}, HdM moyen ${mean(a.motm).toFixed(2)}`,
    `ligue : champion ${mean(a.championPoints).toFixed(1)} pts, dernier ${mean(a.lastPoints).toFixed(1)} pts, buts/match ${mean(a.goalsPerMatch).toFixed(2)}, meilleur buteur ${mean(a.topScorer).toFixed(1)}`,
    `saisons avec blessure > 7 j : ${(a.injuredSeasons / Math.max(1, a.seasons.length) * 100).toFixed(0)} %`,
  ].join('\n');
}

describe(`distribution sur ${N} saisons (attaquant 18 ans, prometteur, exigeant)`, () => {
  const agg = simulate(Array.from({ length: N }, (_, i) => i + 1));
  const info = describeAgg(agg);
  // eslint-disable-next-line no-console
  console.log(`\n${info}\n`);

  it('note médiane du joueur ≈ 6.3', () => {
    const m = median(agg.ratings);
    expect(m, info).toBeGreaterThanOrEqual(T.medianRatingRange[0]);
    expect(m, info).toBeLessThanOrEqual(T.medianRatingRange[1]);
  });

  it('environ 10 % des matchs à 7.5 ou plus, un 9+ exceptionnel', () => {
    const share75 = agg.ratings.filter((r) => r >= 7.5).length / agg.ratings.length;
    const share9 = agg.ratings.filter((r) => r >= 9).length / agg.ratings.length;
    expect(share75, info).toBeGreaterThanOrEqual(T.share75plusRange[0]);
    expect(share75, info).toBeLessThanOrEqual(T.share75plusRange[1]);
    expect(share9, info).toBeLessThan(0.02);
  });

  it('un jeune attaquant marque entre 4 et 9 buts en médiane, 14 au plus au 90e percentile', () => {
    const m = median(agg.goals);
    expect(m, info).toBeGreaterThanOrEqual(T.youngStrikerGoals[0]);
    expect(m, info).toBeLessThanOrEqual(T.youngStrikerGoals[1]);
    expect(percentile(agg.goals, 0.9), info).toBeLessThanOrEqual(14);
  });

  it('beaucoup d’entrées en jeu : minutes médianes entre 900 et 2 400', () => {
    const m = median(agg.minutes);
    expect(m, info).toBeGreaterThanOrEqual(900);
    expect(m, info).toBeLessThanOrEqual(2400);
  });

  it('classements plausibles : champion 70-95 points, dernier 15-40', () => {
    expect(mean(agg.championPoints), info).toBeGreaterThanOrEqual(T.championPoints[0]);
    expect(mean(agg.championPoints), info).toBeLessThanOrEqual(T.championPoints[1]);
    expect(mean(agg.lastPoints), info).toBeGreaterThanOrEqual(T.lastPoints[0]);
    expect(mean(agg.lastPoints), info).toBeLessThanOrEqual(T.lastPoints[1]);
  });

  it('buts par match de ligue entre 2.3 et 3.3, meilleur buteur entre 14 et 30', () => {
    expect(mean(agg.goalsPerMatch), info).toBeGreaterThanOrEqual(T.leagueGoalsPerMatch[0]);
    expect(mean(agg.goalsPerMatch), info).toBeLessThanOrEqual(T.leagueGoalsPerMatch[1]);
    expect(mean(agg.topScorer), info).toBeGreaterThanOrEqual(T.topScorerGoals[0]);
    expect(mean(agg.topScorer), info).toBeLessThanOrEqual(T.topScorerGoals[1]);
  });

  it('homme du match rare, blessures présentes sans être systématiques', () => {
    expect(mean(agg.motm), info).toBeLessThanOrEqual(T.motmPerSeasonTop);
    const injuredShare = agg.injuredSeasons / agg.seasons.length;
    expect(injuredShare, info).toBeGreaterThanOrEqual(0.25);
    expect(injuredShare, info).toBeLessThanOrEqual(0.75);
  });

  it('déterminisme : la graine 1 rejouée donne la même empreinte', () => {
    const again = runHeadlessSeason({ seed: 1, dataset: 'fictional', position: 'BU', age: 18, level: 'prometteur', difficulty: 'exigeant', seasons: 1 });
    expect(again.hash).toBe(agg.hashes[0]);
  });
});
