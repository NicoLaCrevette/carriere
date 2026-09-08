/**
 * Quelles scènes proposer aujourd'hui ? Décidé par des règles déterministes
 * sur l'état et le résultat de la journée (jamais par le LLM).
 */
import type { CareerState, DayResult, InteractionChannel } from '../../engine/types';
import { BALANCE } from '../../engine/config/balance';
import { EVENT_CATALOGUE } from '../../engine/events/catalogue';
import { addMonths, compareDates, dayOf, diffDays } from '../../engine/calendar/dates';
import { recentRatings } from '../../engine/season/recentMatches';
import type { SceneSpec } from './conversation';

/** Nombre de jours pendant lesquels un événement non résolu reste proposé en scène. */
const EVENT_SCENE_WINDOW_DAYS = 3;

const S = BALANCE.career.scenes;

function lastSceneOn(state: CareerState, channel: InteractionChannel): string | undefined {
  const last = [...state.quotes].reverse().find((q) => q.channel === channel);
  return last?.date;
}

/** Scènes déclenchées par le match du jour (à proposer juste après l'écran de match). */
export function scenesAfterMatch(state: CareerState, day: DayResult): SceneSpec[] {
  const report = day.matchResult?.playerReport;
  const matchId = day.matchId;
  if (!report || !matchId || report.minutesPlayed <= 0) return [];
  const out: SceneSpec[] = [];
  const decisive = report.stats.goals + report.stats.assists > 0;
  if (report.minutesPlayed >= S.flashMinMinutes || decisive) {
    out.push({ kind: 'flash', title: 'Interview d\'après-match', matchId, mandatory: false });
  }
  if (report.motm || (report.started && report.rating >= S.conferenceRatingHigh) || report.rating <= S.conferenceRatingLow || report.stats.redCards > 0) {
    out.push({ kind: 'conference', title: 'Conférence de presse', matchId, mandatory: report.motm || report.stats.redCards > 0 });
  }
  if (report.rating <= S.lockerRoomLowRating || report.subbedOffReason === 'mauvais match') {
    out.push({ kind: 'vestiaire', title: 'Vestiaire : le coach', matchId, who: 'coach', mandatory: true });
  } else if (report.stats.goals >= S.lockerRoomGoalsFrom) {
    out.push({ kind: 'vestiaire', title: 'Vestiaire : le capitaine', matchId, who: 'capitaine', mandatory: false });
  }
  return out;
}

/** Scènes de la journée hors match : appel de l'agent, bureau du coach. */
export function scenesForDay(state: CareerState): SceneSpec[] {
  const out: SceneSpec[] = [];
  const p = state.player;
  const date = state.currentDate;
  if (dayOf(date) === S.agentCallDayOfMonth && state.season.phase !== 'vacances') {
    const last = lastSceneOn(state, 'telephone');
    if (!last || diffDays(last, date) >= 20) {
      const minutes30 = p.sharpness * (BALANCE.progression.sharpnessToMinutes30Days / 100);
      const contractSoon = p.contract.endsOn <= addMonths(date, S.agentContractMonths);
      const topic = contractSoon ? 'contrat' : minutes30 < S.agentLowMinutes30Days ? 'temps_de_jeu' : state.reputation.media.value < 20 ? 'image' : undefined;
      if (topic) out.push({ kind: 'agent', title: 'Appel de ton agent', topic, mandatory: false });
    }
  }
  const lastOffice = lastSceneOn(state, 'bureau');
  const gapOk = !lastOffice || diffDays(lastOffice, date) >= S.coachOfficeGapDays;
  if (gapOk && state.season.phase === 'championnat') {
    if (p.coachTrust <= S.coachOfficeTrustLow) out.push({ kind: 'bureau_coach', title: 'Convocation dans le bureau du coach', topic: 'sanction', mandatory: true });
    else if (p.coachTrust >= S.coachOfficeTrustHigh) out.push({ kind: 'bureau_coach', title: 'Le coach veut te voir', topic: 'felicitations', mandatory: false });
  }
  // La causerie d'avant grand match : le coach vient te chercher deux jours avant.
  const gros = S.causerieAvantGrosMatch;
  const prochain = Object.values(state.matches)
    .filter((m) => m.status === 'a_venir' && m.involvesPlayer)
    .sort((a, b) => compareDates(a.date, b.date))[0];
  if (prochain && prochain.importance >= gros.importanceFrom) {
    const jours = diffDays(date, prochain.date);
    const dernier = lastSceneOn(state, 'bureau');
    if (jours >= 0 && jours <= gros.daysBefore && (!dernier || diffDays(dernier, date) >= gros.gapDays)) {
      out.push({ kind: 'bureau_coach', title: 'Le coach te prend à part avant le match', topic: 'statut', mandatory: false });
    }
  }

  // Le vestiaire réagit : le capitaine vient te voir après une mauvaise passe, ou quand tu vas mal.
  const dernierVestiaire = lastSceneOn(state, 'vestiaire');
  const mauvaise = S.capitaineApresMauvaisePasse;
  const notes = recentRatings(state, mauvaise.matches);
  const passeDifficile = notes.length >= mauvaise.matches && notes.every((r) => r < mauvaise.ratingBelow);
  if (passeDifficile && (!dernierVestiaire || diffDays(dernierVestiaire, date) >= mauvaise.gapDays)) {
    out.push({ kind: 'vestiaire', title: 'Le capitaine vient te parler', who: 'capitaine', mandatory: false });
  } else if (p.morale <= S.capitaineMoralBas.moraleBelow && (!dernierVestiaire || diffDays(dernierVestiaire, date) >= S.capitaineMoralBas.gapDays)) {
    out.push({ kind: 'vestiaire', title: 'Un coéquipier a remarqué que tu n’allais pas fort', who: 'capitaine', mandatory: false });
  }

  // Une offre sur la table : l'agent appelle, que le joueur l'ait demandé ou non.
  const offreOuverte = state.offers.some((o) => o.status === 'en_attente' || o.status === 'en_negociation');
  const dernierAppel = lastSceneOn(state, 'telephone');
  if (offreOuverte && (!dernierAppel || diffDays(dernierAppel, date) >= S.agentSurOffre.gapDays)) {
    out.push({ kind: 'agent', title: 'Ton agent a une offre à te soumettre', topic: 'interet', mandatory: false });
  }

  // Événements de vie (§12) non résolus des derniers jours : une réponse libre en décide l'issue.
  for (const ev of state.events) {
    if (ev.resolved) continue;
    const age = diffDays(ev.date, date);
    if (age < 0 || age > EVENT_SCENE_WINDOW_DAYS) continue;
    const def = EVENT_CATALOGUE.find((d) => d.id === ev.definitionId);
    if (!def || def.outcomes.length === 0) continue;
    out.push({ kind: 'evenement', title: ev.title, eventId: ev.id, mandatory: false });
  }
  return out;
}
