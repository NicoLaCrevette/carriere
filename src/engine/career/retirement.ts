/**
 * Fin de carrière (Phase 6) : conditions, bilan figé, verdict déterministe.
 * Le LLM pourra habiller le bilan ; les chiffres viennent d'ici.
 */
import type { Award, CareerState, Euros, TrophyKind } from '../types';
import { CAREER_DEPTH_BALANCE } from '../config/balance/careerDepth';
import { ageAt } from '../calendar/dates';
import { addLog, addMemory } from './apply';

const R = CAREER_DEPTH_BALANCE.retirement;

export interface CareerSummary {
  seasons: number;
  clubs: string[];
  matches: number;
  goals: number;
  assists: number;
  peakOverall: number;
  peakValue: Euros;
  trophies: TrophyKind[];
  awards: Award[];
  traits: string[];
  quotes: number;
  nationalCaps: number;
  verdict: string;
}

/** Retraite possible : âge, contrat échu, ou blessure de fin de carrière. */
export function canRetire(state: CareerState): boolean {
  if (state.retired) return false;
  const age = ageAt(state.player.identity.birthDate, state.currentDate);
  if (age >= R.minAge) return true;
  if (state.player.contract.endsOn < state.currentDate) return true;
  return state.player.injuries.some((i) => !i.healedOn && i.actualDays >= R.careerEndingInjuryDays);
}

/** Retraite imposée en fin de saison à partir de l'âge forcé. */
export function mustRetire(state: CareerState): boolean {
  return ageAt(state.player.identity.birthDate, state.currentDate) >= R.forcedAge;
}

function verdictFor(s: Omit<CareerSummary, 'verdict'>): string {
  const ballonDor = s.awards.some((a) => a.kind === 'ballon_d_or' && (a.rank ?? 1) === 1);
  if (ballonDor) return 'Une légende : un Ballon d\'Or, des trophées et une place dans l\'histoire.';
  if (s.trophies.length >= 5 || s.nationalCaps >= 80) return 'Une très grande carrière, de celles que l\'on raconte aux enfants.';
  if (s.trophies.length >= 1 || s.nationalCaps >= 20 || s.awards.length >= 2) return 'Une belle carrière, avec des titres et des soirs de gloire.';
  if (s.matches >= 300) return 'Une carrière solide de professionnel, respecté partout où il est passé.';
  if (s.matches >= 100) return 'Une carrière honnête, faite de travail plus que de lumière.';
  return 'Une carrière discrète : le haut niveau n\'a jamais vraiment ouvert ses portes.';
}

/** Bilan chiffré de la carrière, calculable à tout moment. */
export function careerSummary(state: CareerState): CareerSummary {
  const p = state.player;
  const clubIds = [...p.history.map((h) => h.clubId), p.contract.clubId].filter((id, i, arr) => arr.indexOf(id) === i);
  const clubs = clubIds.map((id) => state.world.clubs[id]?.name ?? id);
  const peakOverall = Math.max(p.overall, ...p.history.map((h) => h.overallEnd ?? 0));
  const peakValue = Math.max(p.marketValue, ...p.marketValueHistory.map((v) => v.value));
  const base: Omit<CareerSummary, 'verdict'> = {
    seasons: p.history.length + (p.seasonStats.total.matches > 0 ? 1 : 0),
    clubs,
    matches: p.careerStats.matches,
    goals: p.careerStats.goals,
    assists: p.careerStats.assists,
    peakOverall,
    peakValue,
    trophies: p.trophies.map((t) => t.kind),
    awards: p.awards,
    traits: p.traits.map((t) => t.label),
    quotes: state.quotes.length,
    nationalCaps: state.national.caps,
  };
  return { ...base, verdict: verdictFor(base) };
}

/** Termine la carrière : bilan, journal, souvenir majeur, storylines closes. */
export function retire(state: CareerState, reason: string): CareerSummary {
  const summary = careerSummary(state);
  if (state.retired) return summary;
  state.retired = true;
  const date = state.currentDate;
  addLog(state, 'systeme', `Fin de carrière (${reason}) : ${summary.seasons} saisons, ${summary.matches} matchs, ${summary.goals} buts. ${summary.verdict}`);
  addMemory(state, {
    date, type: 'saison', importance: 5,
    summary: `Fin de carrière (${reason}) après ${summary.seasons} saisons et ${summary.matches} matchs. ${summary.verdict}`,
    entities: [state.player.contract.clubId, 'retraite'],
  });
  for (const s of state.storylines) {
    if (s.status === 'ouverte') {
      s.status = 'expiree';
      s.log.push({ date, text: 'Close par la fin de carrière.' });
    }
  }
  return summary;
}
