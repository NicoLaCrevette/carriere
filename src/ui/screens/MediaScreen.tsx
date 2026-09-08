import { useCareerStore } from '../../store/careerStore';
import { compareDates, formatDateFr } from '../../engine/calendar/dates';
import type { InteractionChannel } from '../../engine/types';
import { analysisBadges } from '../../llm/scenes/conversation';
import { REPUTATION_LABELS, formatSigned, humanize } from '../lib/labels';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';

const CHANNEL_LABELS: Partial<Record<InteractionChannel, string>> = {
  conference: 'Conférence de presse',
  interview_flash: 'Interview d’après-match',
  vestiaire: 'Vestiaire',
  telephone: 'Téléphone',
  bureau: 'Bureau du coach',
};

const TONE_CLASSES: Record<string, string> = {
  elogieux: 'text-signal-green',
  neutre: 'text-white',
  critique: 'text-signal-red',
  moqueur: 'text-signal-red',
};

/** Médias (§13) : titres de presse, journal des citations avec leur analyse et leur impact. */
export default function MediaScreen() {
  const career = useCareerStore((s) => s.career);
  if (!career) return null;
  const clubId = career.player.contract.clubId;

  const press = Object.values(career.matches)
    .filter((m) => m.status === 'joue' && m.result?.playerReport?.headline)
    .sort((a, b) => compareDates(b.date, a.date))
    .slice(0, 30)
    .map((m) => {
      const opponentId = m.homeClubId === clubId ? m.awayClubId : m.homeClubId;
      const opponent = career.world.clubs[opponentId];
      const report = m.result!.playerReport!;
      const headlines = report.headlines && report.headlines.length > 0 ? report.headlines : [{ outlet: 'Presse', title: report.headline!, tone: 'neutre' as const }];
      return { id: m.id, date: m.date, headlines, opponent: opponent?.name ?? opponentId };
    });

  const quotes = [...career.quotes].sort((a, b) => compareDates(b.date, a.date)).slice(0, 40);

  return (
    <div className="p-4 space-y-4">
      <Panel>
        <SectionTitle>Titres de presse</SectionTitle>
        {press.length === 0 ? (
          <p className="text-sm text-muted">Pas encore de titre à ton sujet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {press.map((p) => (
              <li key={p.id} className="py-2">
                <p className="text-xs text-muted">{formatDateFr(p.date)} · vs {p.opponent}</p>
                <ul className="mt-1 space-y-0.5">
                  {p.headlines.map((h, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-2">
                      <span className="w-28 shrink-0 text-[10px] uppercase tracking-wide text-muted">{h.outlet}</span>
                      <span className={`font-display uppercase tracking-wide ${TONE_CLASSES[h.tone] ?? 'text-white'}`}>« {h.title} »</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <SectionTitle>Journal des citations</SectionTitle>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted">Tu n'as encore rien déclaré publiquement. Tout ce que tu diras sera retenu.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {quotes.map((q) => {
              const npc = q.npcId ? career.world.npcs[q.npcId] : undefined;
              const deltas = Object.entries(q.appliedDeltas ?? {}).filter(([, v]) => (v ?? 0) !== 0);
              return (
                <li key={q.id} className="py-2 space-y-1">
                  <p className="text-xs text-muted">
                    {formatDateFr(q.date)} · {CHANNEL_LABELS[q.channel] ?? humanize(q.channel)}{npc ? ` · ${npc.firstName} ${npc.lastName}` : ''} · {q.context}
                  </p>
                  <p className="text-sm">« {q.text} »</p>
                  <p className="text-xs text-muted italic">{q.analysis.interpretation}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    {analysisBadges(q.analysis).map((b, j) => (
                      <span key={j} className={b.good ? 'text-signal-green' : 'text-signal-red'}>{b.label} {b.good ? '✔' : '✘'}</span>
                    ))}
                    <span className="text-muted">score {q.analysis.communication_score.toFixed(1)}/10</span>
                    {deltas.map(([k, v]) => (
                      <span key={k} className={`tabular-nums ${(v ?? 0) >= 0 ? 'text-signal-green' : 'text-signal-red'}`}>{REPUTATION_LABELS[k as keyof typeof REPUTATION_LABELS]} {formatSigned(v ?? 0, 1)}</span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {career.promises.length > 0 && (
        <Panel>
          <SectionTitle>Promesses publiques</SectionTitle>
          <ul className="space-y-1 text-sm">
            {[...career.promises].reverse().slice(0, 10).map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 border-b border-white/[0.05] py-1">
                <span>« {p.text} »</span>
                <span className={`text-xs uppercase tracking-wide ${p.status === 'tenue' ? 'text-signal-green' : p.status === 'rompue' ? 'text-signal-red' : 'text-muted'}`}>
                  {humanize(p.status)} · échéance {formatDateFr(p.deadline)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
