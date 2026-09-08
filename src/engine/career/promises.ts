/**
 * Promesses publiques (§8) : mémorisées à la prise de parole, vérifiées ici
 * par le moteur, jamais par le LLM. Une promesse rompue laisse une trace
 * (réputation, souvenir, journal) et les journalistes y reviennent.
 */
import type { CareerState, PublicPromise } from '../types';
import { BALANCE } from '../config/balance';
import { compareDates } from '../calendar/dates';
import { applyDeltas } from './apply';

type Verdict = 'tenue' | 'rompue' | 'en_cours';

function goalsSince(state: CareerState, from: string): number {
  let goals = 0;
  for (const m of Object.values(state.matches)) {
    const r = m.result?.playerReport;
    if (!r || m.status !== 'joue' || compareDates(m.date, from) < 0) continue;
    goals += r.stats.goals;
  }
  return goals;
}

function startedSince(state: CareerState, from: string): boolean {
  return Object.values(state.matches).some((m) => m.status === 'joue' && compareDates(m.date, from) >= 0 && m.result?.playerReport?.started === true);
}

/** Verdict d'une promesse à la date courante. */
export function promiseVerdict(state: CareerState, p: PublicPromise): Verdict {
  const today = state.currentDate;
  const pastDeadline = compareDates(today, p.deadline) > 0;
  const c = p.check;
  switch (c.type) {
    case 'marquer_dans_match': {
      const m = state.matches[c.matchId];
      if (!m) return pastDeadline ? 'rompue' : 'en_cours';
      if (m.status !== 'joue') return pastDeadline ? 'rompue' : 'en_cours';
      return (m.result?.playerReport?.stats.goals ?? 0) > 0 ? 'tenue' : 'rompue';
    }
    case 'gagner_match': {
      const m = state.matches[c.matchId];
      if (!m || m.status !== 'joue') return pastDeadline ? 'rompue' : 'en_cours';
      const home = m.homeClubId === state.player.contract.clubId;
      const r = m.result!;
      const won = home ? r.homeGoals > r.awayGoals : r.awayGoals > r.homeGoals;
      return won ? 'tenue' : 'rompue';
    }
    case 'buts_avant_date':
      if (goalsSince(state, p.madeOn) >= c.goals) return 'tenue';
      return pastDeadline ? 'rompue' : 'en_cours';
    case 'titulaire_avant_date':
      if (startedSince(state, p.madeOn)) return 'tenue';
      return pastDeadline ? 'rompue' : 'en_cours';
    case 'rester_au_club_jusqua': {
      const moved = state.transfers.some((t) => compareDates(t.date, p.madeOn) >= 0);
      if (moved) return 'rompue';
      return compareDates(today, c.date) >= 0 ? 'tenue' : 'en_cours';
    }
    case 'declaratif':
      return pastDeadline ? 'tenue' : 'en_cours';
    default:
      return 'en_cours';
  }
}

/** Évalue toutes les promesses en cours ; applique les effets des verdicts. Mute state. Renvoie les promesses résolues. */
export function evaluatePromises(state: CareerState): PublicPromise[] {
  const resolved: PublicPromise[] = [];
  const cfg = BALANCE.career.promises;
  for (const p of state.promises) {
    if (p.status !== 'en_cours') continue;
    const verdict = promiseVerdict(state, p);
    if (verdict === 'en_cours') continue;
    p.status = verdict;
    p.resolvedOn = state.currentDate;
    resolved.push(p);
    const kept = verdict === 'tenue';
    const declarative = p.check.type === 'declaratif';
    applyDeltas(state, {
      reputation: declarative ? {} : (kept ? { ...cfg.kept } : { ...cfg.broken }),
      memory: [{
        date: state.currentDate, type: 'promesse', importance: kept ? 2 : 4,
        summary: kept ? `Promesse tenue : « ${p.text} ».` : `Promesse rompue : « ${p.text} » (faite le ${p.madeOn}).`,
        entities: [state.player.id, state.player.contract.clubId],
      }],
      log: [{ category: 'reputation', text: kept ? `Promesse tenue : « ${p.text} ».` : `Promesse rompue : « ${p.text} ».` }],
    }, kept ? 'Promesse tenue' : 'Promesse rompue');
  }
  return resolved;
}
