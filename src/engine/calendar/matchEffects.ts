/**
 * Effets d'un match du club du joueur sur son état : stats, forme,
 * confiance, moral, fatigue, XP, coach, réputation, désert, cartons,
 * scouting, mémoire et journal. Appelé par advanceDay après le match.
 */
import type { AttributeGain, AttributeKey, CareerState, DayResult, Match, MatchResult, PlayerMatchReport, Stats } from '../types';
import { INTERNATIONAL_COMPETITION_ID } from '../types';
import { BALANCE } from '../config/balance';
import { difficultyProfile } from '../config/difficulty';
import { ageAt } from './dates';
import { addLog, addMemory, clamp } from '../career/apply';
import { updateCoachTrust } from '../season/lineupSelection';
import { activeDesert, advanceDesert } from '../season/desert';
import { reputationAfterInternationalMatch, reputationAfterMatch } from '../reputation/reputation';
import { applyMatchFatigue } from '../player/fitness';
import { addAttributeXp, matchXp } from '../player/progression';
import { updateScouting } from '../match/adaptation';

const PAM = BALANCE.playerAfterMatch;

/** Additionne toutes les composantes numériques de `delta` dans `target`. */
export function addStats(target: Stats, delta: Stats): void {
  for (const key of Object.keys(delta) as (keyof Stats)[]) {
    target[key] = (target[key] ?? 0) + (delta[key] ?? 0);
  }
}

function scoreLine(state: CareerState, match: Match, result: MatchResult): string {
  const home = state.world.clubs[match.homeClubId]?.shortName ?? match.homeClubId;
  const away = state.world.clubs[match.awayClubId]?.shortName ?? match.awayClubId;
  return `${home} ${result.homeGoals}-${result.awayGoals} ${away}`;
}

function outcomeOf(state: CareerState, match: Match, result: MatchResult): 'win' | 'draw' | 'loss' {
  // En sélection, les deux clubs sont des pseudo-clubs `nat_<CODE>` : le camp du joueur se lit sur le pays, pas sur son contrat.
  const home = match.competitionId === INTERNATIONAL_COMPETITION_ID
    ? state.world.clubs[match.homeClubId]?.country === state.national.countryCode
    : match.homeClubId === state.player.contract.clubId;
  const diff = home ? result.homeGoals - result.awayGoals : result.awayGoals - result.homeGoals;
  return diff > 0 ? 'win' : diff < 0 ? 'loss' : 'draw';
}

/** Forme glissante, confiance et moral après une prestation. */
function updateMood(state: CareerState, report: PlayerMatchReport, outcome: 'win' | 'draw' | 'loss'): void {
  const p = state.player;
  const f = PAM.form;
  const { min, max } = BALANCE.bounds.form;
  p.form = clamp(p.form * f.decay + (report.rating - f.ratingPivot) * f.perRatingPoint, min, max);
  const conf = BALANCE.career.confidence;
  const g = BALANCE.bounds.gauge;
  p.confidence = clamp(p.confidence + (report.rating - f.ratingPivot) * conf.perRatingPoint + report.stats.goals * conf.goalBonus, g.min, g.max);
  const mor = BALANCE.career.morale;
  const moraleDelta = (outcome === 'win' ? mor.winBonus : outcome === 'loss' ? -mor.lossMalus : 0) + (report.started ? mor.startBonus : 0);
  p.morale = clamp(p.morale + moraleDelta, g.min, g.max);
}

/** Cartons : cumul des jaunes (suspension au seuil) et suspension immédiate sur rouge. */
function updateDiscipline(state: CareerState, report: PlayerMatchReport, competitionId: string, messages: string[]): void {
  const p = state.player;
  const s = PAM.suspension;
  if (report.stats.redCards > 0) {
    p.suspensions[competitionId] = (p.suspensions[competitionId] ?? 0) + s.redCardMatches;
    messages.push(`Carton rouge : suspendu ${s.redCardMatches} match.`);
  }
  if (report.stats.yellowCards > 0) {
    const tally = (p.yellowCardTally[competitionId] ?? 0) + report.stats.yellowCards;
    if (tally >= s.yellowsForBan) {
      p.yellowCardTally[competitionId] = 0;
      p.suspensions[competitionId] = (p.suspensions[competitionId] ?? 0) + 1;
      messages.push(`${s.yellowsForBan} cartons jaunes : un match de suspension.`);
    } else {
      p.yellowCardTally[competitionId] = tally;
    }
  }
}

function applyMatchXp(state: CareerState, report: PlayerMatchReport, age: number): AttributeGain[] {
  const xp = matchXp(state.player, report.minutesPlayed, report.rating, age);
  const gains: AttributeGain[] = [];
  for (const [key, amount] of Object.entries(xp) as [AttributeKey, number][]) {
    const gain = addAttributeXp(state.player, key, amount);
    if (gain) gains.push(gain);
  }
  return gains;
}

function rememberIfNotable(state: CareerState, report: PlayerMatchReport, match: Match, line: string): void {
  const m = PAM.memory;
  const notable = report.rating >= m.ratingFrom || report.stats.goals >= m.goalsFrom || report.stats.redCards > 0 || report.motm;
  if (!notable) return;
  const importance = (report.motm || report.stats.goals >= m.goalsFrom ? m.importanceHigh : m.importanceLow) as 1 | 2 | 3 | 4 | 5;
  addMemory(state, {
    date: state.currentDate, type: 'match', importance,
    summary: `${line} : note ${report.rating.toFixed(1)}, ${report.stats.goals} but(s), ${report.stats.assists} passe(s)${report.motm ? ', homme du match' : ''}${report.stats.redCards > 0 ? ', expulsé' : ''}.`,
    entities: [match.id, match.homeClubId, match.awayClubId],
  });
}

/**
 * Applique au joueur les effets d'un match de son club. Renseigne `result`
 * (matchResult, gains, réputation, messages). Le rapport peut être absent
 * (tribune, blessé, suspendu) ou sans minutes (banc non utilisé).
 */
export function applyPlayerMatchEffects(state: CareerState, match: Match, matchResult: MatchResult, result: DayResult): void {
  const p = state.player;
  const line = scoreLine(state, match, matchResult);
  const outcome = outcomeOf(state, match, matchResult);
  result.matchId = match.id;
  result.matchResult = matchResult;
  const comp = match.competitionId;

  // Suspension purgée si le joueur n'a pas joué ce match.
  const report = matchResult.playerReport;
  if ((p.suspensions[comp] ?? 0) > 0 && (!report || report.minutesPlayed <= 0)) {
    p.suspensions[comp] = (p.suspensions[comp] ?? 0) - 1;
    result.messages.push(`${line}. Tu purges un match de suspension.`);
    addLog(state, 'match', `${line} (suspendu).`);
    return;
  }
  if (!report || report.minutesPlayed <= 0) {
    const g = BALANCE.bounds.gauge;
    p.morale = clamp(p.morale - BALANCE.career.morale.benchMalus, g.min, g.max);
    result.messages.push(`${line}. Tu n'es pas entré en jeu.`);
    addLog(state, 'match', `${line} (non entré).`);
    return;
  }

  const age = ageAt(p.identity.birthDate, state.currentDate);
  addStats(p.seasonStats.total, report.stats);
  if (!p.seasonStats.byCompetition[comp]) p.seasonStats.byCompetition[comp] = { ...report.stats };
  else addStats(p.seasonStats.byCompetition[comp] as Stats, report.stats);
  addStats(p.careerStats, report.stats);

  updateMood(state, report, outcome);
  applyMatchFatigue(p, report.minutesPlayed, PAM.intensity, age);
  // Blessure contractée pendant le match : la journée la relève ensuite par différence avec `injuriesBefore`.
  if (report.injury && !p.injuries.some((i) => i.id === report.injury!.id)) p.injuries.push(report.injury);
  result.attributeGains.push(...applyMatchXp(state, report, age));
  updateDiscipline(state, report, comp, result.messages);
  updateScouting(p, report.decisions, difficultyProfile(state.settings.difficulty));

  // Un match de sélection n'engage ni le coach du club ni la traversée du désert en cours,
  // et sa réputation va à la sélection, au monde et aux médias (§9).
  const international = match.competitionId === INTERNATIONAL_COMPETITION_ID;
  const coach = international ? null : updateCoachTrust(state, report, match);
  const reputation = international ? reputationAfterInternationalMatch(state, report, match) : reputationAfterMatch(state, report, match);
  const reason = international ? 'Match international' : 'Match';
  for (const [key, delta] of Object.entries(reputation) as [keyof typeof reputation, number][]) {
    result.reputationChanges.push({ key, delta, reason });
  }
  if (!international) {
    // Traversée du désert (§6.6) : le coup au moral tombe une fois, au premier match de la série.
    const spell = activeDesert(state.season);
    if (spell && spell.elapsed === 0) {
      const g = BALANCE.bounds.gauge;
      p.confidence = clamp(p.confidence - spell.confidenceMalus, g.min, g.max);
      addLog(state, 'systeme', 'Passage à vide : la confiance en prend un coup, les ballons ne rentrent plus.');
    }
    advanceDesert(state.season);
  }

  const status = report.started ? 'titulaire' : `entré à la ${report.subbedOnMinute ?? '?'}e`;
  const decisive = [report.stats.goals > 0 ? `${report.stats.goals} but(s)` : '', report.stats.assists > 0 ? `${report.stats.assists} passe(s)` : '']
    .filter(Boolean).join(', ');
  const summary = `${line} — ${status}, ${report.minutesPlayed} min, note ${report.rating.toFixed(1)}${decisive ? `, ${decisive}` : ''}${report.motm ? ', homme du match' : ''}.`;
  result.messages.push(summary);
  if (coach && coach.delta !== 0) result.messages.push(`Confiance du coach ${coach.delta > 0 ? '+' : ''}${coach.delta.toFixed(1)} (${coach.reason}).`);
  if (report.subbedOffReason) result.messages.push(`Sorti à la ${report.subbedOffMinute ?? '?'}e : ${report.subbedOffReason}.`);
  addLog(state, 'match', summary);
  rememberIfNotable(state, report, match, line);
}
