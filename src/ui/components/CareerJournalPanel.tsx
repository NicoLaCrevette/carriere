import { useMemo, useState } from 'react';
import type { CareerLogEntry, CareerState } from '../../engine/types';
import { compareDates, formatDateFrShort } from '../../engine/calendar/dates';
import Panel from './Panel';
import SectionTitle from './SectionTitle';

type Category = CareerLogEntry['category'];

const CATEGORY_LABELS: Record<Category, string> = {
  match: 'Matchs',
  transfert: 'Transferts',
  blessure: 'Blessures',
  contrat: 'Contrats',
  selection: 'Sélection',
  trophee: 'Trophées',
  reputation: 'Réputation',
  vie: 'Vie',
  systeme: 'Système',
};

const CATEGORY_CLASSES: Record<Category, string> = {
  match: 'text-white',
  transfert: 'text-broadcast-yellow',
  blessure: 'text-broadcast-red',
  contrat: 'text-broadcast-yellow',
  selection: 'text-broadcast-green',
  trophee: 'text-broadcast-green',
  reputation: 'text-broadcast-grey',
  vie: 'text-white',
  systeme: 'text-broadcast-grey',
};

const PAGE = 40;

/** Journal de carrière (§13) : tout ce que le moteur a consigné, filtrable par nature. */
export default function CareerJournalPanel({ career }: { career: CareerState }) {
  const [filter, setFilter] = useState<Category | 'tout'>('tout');
  const [limit, setLimit] = useState(PAGE);

  const entries = useMemo(() => {
    const all = [...career.log].reverse();
    return filter === 'tout' ? all : all.filter((l) => l.category === filter);
  }, [career.log, filter]);

  const present = useMemo(() => {
    const seen = new Set<Category>();
    for (const l of career.log) seen.add(l.category);
    return (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => seen.has(c));
  }, [career.log]);

  const storylines = useMemo(
    () => [...career.storylines].sort((a, b) => compareDates(b.startedOn, a.startedOn)),
    [career.storylines],
  );
  const open = storylines.filter((s) => s.status === 'ouverte');
  const closed = storylines.filter((s) => s.status !== 'ouverte').slice(0, 6);

  return (
    <>
      {(open.length > 0 || closed.length > 0) && (
        <Panel>
          <SectionTitle>Histoires en cours</SectionTitle>
          {open.length === 0 ? (
            <p className="text-sm text-broadcast-grey">Rien en suspens pour l'instant.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {open.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 border-b border-pitch-800 py-1">
                  <span>
                    <span className="text-broadcast-yellow">{s.title}</span>
                    <span className="text-xs text-broadcast-grey"> — {s.log[s.log.length - 1]?.text ?? 'ouverte'}</span>
                  </span>
                  <span className="text-xs text-broadcast-grey">
                    depuis le {formatDateFrShort(s.startedOn)}
                    {s.deadline ? ` · échéance ${formatDateFrShort(s.deadline)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {closed.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-broadcast-grey">
              {closed.map((s) => (
                <li key={s.id}>
                  {formatDateFrShort(s.startedOn)} · {s.title} — {s.resolution?.text ?? s.status}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Panel>
        <SectionTitle
          right={
            <span className="text-[11px] uppercase tracking-wide text-broadcast-grey">
              {entries.length} entrée{entries.length > 1 ? 's' : ''}
            </span>
          }
        >
          Journal de carrière
        </SectionTitle>
        <div className="mb-2 flex flex-wrap gap-1">
          {(['tout', ...present] as (Category | 'tout')[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setFilter(c);
                setLimit(PAGE);
              }}
              className={`border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                filter === c ? 'border-broadcast-yellow text-broadcast-yellow' : 'border-pitch-700 text-broadcast-grey hover:text-white'
              }`}
            >
              {c === 'tout' ? 'Tout' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-broadcast-grey">Rien de consigné pour l'instant.</p>
        ) : (
          <>
            <ul className="space-y-0.5 text-sm">
              {entries.slice(0, limit).map((l, i) => (
                <li key={`${l.date}-${i}`} className="flex gap-2 border-b border-pitch-800 py-1">
                  <span className="w-24 shrink-0 text-xs text-broadcast-grey tabular-nums">{formatDateFrShort(l.date)}</span>
                  <span className={`w-20 shrink-0 text-[10px] uppercase tracking-wide ${CATEGORY_CLASSES[l.category]}`}>{CATEGORY_LABELS[l.category]}</span>
                  <span className="grow">{l.text}</span>
                </li>
              ))}
            </ul>
            {entries.length > limit && (
              <button type="button" className="mt-2 text-xs text-broadcast-grey underline" onClick={() => setLimit((v) => v + PAGE)}>
                Afficher {Math.min(PAGE, entries.length - limit)} entrées de plus
              </button>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
