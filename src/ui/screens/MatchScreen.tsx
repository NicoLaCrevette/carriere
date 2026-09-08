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
import ActionExplain from '../components/ActionExplain';
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
          <p className="text-sm text-muted">Aucun match à afficher pour l'instant.</p>
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
            <p className="text-[11px] uppercase tracking-wide text-muted">
              {competition?.name ?? ''} · {formatDateFr(match.date)}
              {match.matchday ? ` · J${match.matchday}` : ''}
            </p>
            <p className="font-display uppercase tracking-wide text-xl">
              {home?.name ?? match.homeClubId} <NumberTabular value={result.homeGoals} className="mx-2 text-accent" />
              -
              <NumberTabular value={result.awayGoals} className="mx-2 text-accent" /> {away?.name ?? match.awayClubId}
            </p>
            <p className="text-xs text-muted">
              xG {result.homeXg.toFixed(2)} - {result.awayXg.toFixed(2)} · Possession {result.homePossession}% - {100 - result.homePossession}% ·{' '}
              {result.attendance.toLocaleString('fr-FR')} spectateurs
            </p>
          </div>
          {report?.headline && (
            <p className="max-w-sm border-l-2 border-accent pl-3 text-sm italic text-muted">« {report.headline} »</p>
          )}
        </div>
      </Panel>

      {!report && (
        <Panel>
          <p className="text-sm text-muted">Tu n'étais pas convoqué pour ce match.</p>
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
          <p className="mb-2 text-xs text-muted">
            Le détail minute par minute des matchs anciens n'est pas conservé : la note, les statistiques et les décisions restent, eux.
          </p>
        )}
        <MatchTimeline events={result.events} summaryLines={result.summaryLines} nameOf={(id) => nameOf(career, id)} />
      </Panel>

      {report && report.decisions.length > 0 && (
        <Panel>
          <SectionTitle
            right={<span className="text-[11px] uppercase tracking-wide text-muted">{report.decisions.length} décisions</span>}
          >
            Tes décisions, et pourquoi elles ont marché ou non
          </SectionTitle>
          <ul className="space-y-3">
            {report.decisions.map((d) => (
              <li key={d.situationId}>
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5 tabular-nums text-muted">{d.minute}'</span>
                  <span className="text-white">{situationLabel(d.kind)}</span>
                  <span className="text-muted">→ {actionLabel(d.classified.action)}</span>
                  <span className="text-muted">· {outcomeLabel(d.outcome.kind)}</span>
                  <span className={`ml-auto tabular-nums ${d.outcome.ratingDelta >= 0 ? 'text-signal-green' : 'text-signal-red'}`}>
                    {formatSigned(d.outcome.ratingDelta, 1)} {d.outcome.ratingReason}
                  </span>
                </div>
                <ActionExplain outcome={d.outcome} action={d.classified} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {report && (
        <Panel>
          <SectionTitle>Les cinq regards{report.motm ? ' — Homme du match' : ''}</SectionTitle>
          <EvaluationBoard evaluation={report.evaluation} motm={report.motm} />
        </Panel>
      )}

      {report && (
        <p className="text-xs text-muted">
          Poste : {POSITION_LABELS[career.player.identity.position]} · Minutes jouées : {report.minutesPlayed}
          {report.subbedOffReason ? ` · Sorti (${report.subbedOffReason})` : ''}
        </p>
      )}
    </div>
  );
}
