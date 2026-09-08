import type { Id, MatchEvent } from '../../engine/types';
import { acteursDe } from '../lib/eventText';
import { eventLabel } from '../lib/labels';

interface SummaryLine {
  from: number;
  to: number;
  text: string;
}

interface MatchTimelineProps {
  events: MatchEvent[];
  summaryLines: SummaryLine[];
  nameOf(id: Id): string;
}

interface Item {
  minute: number;
  order: number;
  key: string;
  node: React.ReactNode;
}

/** Chronologie du match (§5.1, §5.6) : événements et résumés de minutes creuses, le joueur mis en évidence. */
export default function MatchTimeline({ events, summaryLines, nameOf }: MatchTimelineProps) {
  const items: Item[] = [];
  events.forEach((e, i) => {
    items.push({
      minute: e.minute,
      order: e.seq,
      key: `e-${i}`,
      node: (
        <div className={`flex gap-2 py-1 px-2 -mx-2 ${e.involvesPlayer ? 'bg-accent/10 text-accent' : ''}`}>
          <span className="w-10 shrink-0 tabular-nums text-muted">{e.minute}'</span>
          <span className="flex-1">
            <span className="font-semibold">{eventLabel(e.type)}</span>
            {acteursDe(e, nameOf) && <span> — {acteursDe(e, nameOf)}</span>}
          </span>
        </div>
      ),
    });
  });
  summaryLines.forEach((s, i) => {
    items.push({
      minute: s.from,
      order: -1,
      key: `s-${i}`,
      node: <p className="py-1 pl-12 text-sm italic text-muted">{s.text}</p>,
    });
  });
  items.sort((a, b) => a.minute - b.minute || a.order - b.order);

  return (
    <div className="max-h-[32rem] overflow-y-auto text-sm">
      {items.map((it) => (
        <div key={it.key}>{it.node}</div>
      ))}
    </div>
  );
}
