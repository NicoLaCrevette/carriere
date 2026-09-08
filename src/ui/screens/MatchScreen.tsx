import type { CareerState, Id } from '../../engine/types';
import { useCareerStore } from '../../store/careerStore';
import { useMatchStore } from '../../store/matchStore';
import { selectLastPlayerMatch } from '../../store/selectors';
import LiveMatch from '../match/LiveMatch';
import PostMatchScenes from '../scenes/PostMatchScenes';
import { formatDateFr } from '../../engine/calendar/dates';
import { POSITION_LABELS } from '../../engine/config/positions';
import { actionLabel, formatSigned, outcomeLabel, situationLabel } from '../lib/labels';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';
import MatchTimeline from '../components/MatchTimeline';
import RatingTicker from '../components/RatingTicker';
import EvaluationBoard from '../components/EvaluationBoard';
import StatsGrid from '../components/StatsGrid';
import NumberTabular from '../components/NumberTabular';

function nameOf(career: CareerState, id: Id): string {
  if (id === career.player.id) return `${career.player.identity.firstName} ${career.player.identity.lastName}`;
  const npc = career.world.npcPlayers[id];
  return npc ? `${npc.identity.firstName} ${npc.identity.lastName}` : id;
}

const LIVE_PHASES = new Set(['running', 'awaiting', 'resolving', 'narrated']);

/** Match : en direct minute par minute (Phase 3) tant qu'il se joue, puis bilan complet (§5.6). */
export default function MatchScreen() {
  const career = useCareerStore((s) => s.career);
  const lastDay = useCareerStore((s) => s.lastDay);
  const livePhase = useMatchStore((s) => s.phase);
  if (!career) return null;
  if (LIVE_PHASES.has(livePhase)) return <LiveMatch />;

  const freshMatchId = lastDay?.matchResult ? lastDay.matchId : undefined;
  const match = (freshMatchId && career.matches[freshMatchId]) || selectLastPlayerMatch(career);
  const result = (freshMatchId && lastDay?.matchResult) || match?.result;

  if (!match || !result) {
    return (
      <div className="p-6">
        <Panel>
          <p className="text-sm text-broadcast-grey">Aucun match à afficher pour l'instant.</p>
        </Panel>
      </div>
    );
  }

  const home = career.world.clubs[match.homeClubId];
  const away = career.world.clubs[match.awayClubId];
  const competition = career.world.competitions[match.competitionId];
  const report = result.playerReport;
  const isGoalkeeper = career.player.identity.position === 'GB';

  return (
    <div className="p-4 space-y-4">
      <Panel>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-broadcast-grey">
              {competition?.name ?? ''} · {formatDateFr(match.date)}
              {match.matchday ? ` · J${match.matchday}` : ''}
            </p>
            <p className="font-display uppercase tracking-wide text-xl">
              {home?.name ?? match.homeClubId} <NumberTabular value={result.homeGoals} className="mx-2 text-broadcast-yellow" />
              -
              <NumberTabular value={result.awayGoals} className="mx-2 text-broadcast-yellow" /> {away?.name ?? match.awayClubId}
            </p>
            <p className="text-xs text-broadcast-grey">
              xG {result.homeXg.toFixed(2)} - {result.awayXg.toFixed(2)} · Possession {result.homePossession}% - {100 - result.homePossession}% ·{' '}
              {result.attendance.toLocaleString('fr-FR')} spectateurs
            </p>
          </div>
          {report?.headline && (
            <p className="max-w-sm border-l-2 border-broadcast-yellow pl-3 text-sm italic text-broadcast-grey">« {report.headline} »</p>
          )}
        </div>
      </Panel>

      {!report && (
        <Panel>
          <p className="text-sm text-broadcast-grey">Tu n'étais pas convoqué pour ce match.</p>
        </Panel>
      )}

      {freshMatchId && lastDay && <PostMatchScenes day={lastDay} />}

      {report && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <RatingTicker rating={report.rating} log={report.ratingLog} />
          </Panel>
          <Panel>
            <SectionTitle>Statistiques</SectionTitle>
            <StatsGrid stats={report.stats} goalkeeper={isGoalkeeper} />
          </Panel>
        </div>
      )}

      <Panel>
        <SectionTitle>Chronologie</SectionTitle>
        {result.events.length === 0 && result.summaryLines.length === 0 && (
          <p className="mb-2 text-xs text-broadcast-grey">
            Le détail minute par minute des matchs anciens n'est pas conservé : la note, les statistiques et les décisions restent, eux.
          </p>
        )}
        <MatchTimeline events={result.events} summaryLines={result.summaryLines} nameOf={(id) => nameOf(career, id)} />
      </Panel>

      {report && report.decisions.length > 0 && (
        <Panel>
          <SectionTitle>Décisions</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-broadcast-grey border-b border-pitch-700">
                  <th className="py-1 pr-2">Min.</th>
                  <th className="py-1 pr-2">Situation</th>
                  <th className="py-1 pr-2">Action</th>
                  <th className="py-1 pr-2">Issue</th>
                  <th className="py-1 pr-2 text-right">Note</th>
                  <th className="py-1 pr-2">Motif</th>
                </tr>
              </thead>
              <tbody>
                {report.decisions.map((d) => (
                  <tr key={d.situationId} className="border-b border-pitch-800 align-top">
                    <td className="py-1 pr-2 tabular-nums text-broadcast-grey">{d.minute}'</td>
                    <td className="py-1 pr-2">{situationLabel(d.kind)}</td>
                    <td className="py-1 pr-2">{actionLabel(d.classified.action)}</td>
                    <td className="py-1 pr-2">{outcomeLabel(d.outcome.kind)}</td>
                    <td className={`py-1 pr-2 text-right tabular-nums ${d.outcome.ratingDelta >= 0 ? 'text-broadcast-green' : 'text-broadcast-red'}`}>
                      {formatSigned(d.outcome.ratingDelta, 1)}
                    </td>
                    <td className="py-1 pr-2 text-broadcast-grey">{d.outcome.ratingReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {report && (
        <Panel>
          <SectionTitle>Les cinq regards{report.motm ? ' — Homme du match' : ''}</SectionTitle>
          <EvaluationBoard evaluation={report.evaluation} motm={report.motm} />
        </Panel>
      )}

      {report && (
        <p className="text-xs text-broadcast-grey">
          Poste : {POSITION_LABELS[career.player.identity.position]} · Minutes jouées : {report.minutesPlayed}
          {report.subbedOffReason ? ` · Sorti (${report.subbedOffReason})` : ''}
        </p>
      )}
    </div>
  );
}
