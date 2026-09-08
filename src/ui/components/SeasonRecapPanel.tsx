import type { CareerState, SeasonRecord } from '../../engine/types';
import { formatEuros, humanize } from '../lib/labels';
import Panel from './Panel';
import SectionTitle from './SectionTitle';
import NumberTabular from './NumberTabular';

/** Écran de fin de saison (§13, Phase 7) : bilan figé de la saison qui vient de se terminer. */
export default function SeasonRecapPanel({ career, record }: { career: CareerState; record: SeasonRecord }) {
  const club = career.world.clubs[record.clubId];
  const league = career.world.leagues[record.leagueId];
  const t = record.stats.total;
  const cells: [string, string | number][] = [
    ['Classement', `${record.leagueRank}e de ${league?.name ?? record.leagueId}`],
    ['Matchs', t.matches],
    ['Titularisations', t.starts],
    ['Minutes', t.minutes],
    ['Buts', t.goals],
    ['Passes décisives', t.assists],
    ['Note moyenne', record.averageRating.toFixed(2)],
    ['Valeur en fin de saison', formatEuros(record.marketValueEnd)],
    ['Sélections', record.nationalCaps],
  ];
  const honours = [...record.trophies.map((x) => humanize(x)), ...record.awards.map((a) => `${humanize(a.kind)}${a.rank ? ` (${a.rank}e)` : ''}`)];
  return (
    <Panel className="border-broadcast-yellow/60">
      <SectionTitle>Saison {record.label} terminée · {club?.name ?? record.clubId}</SectionTitle>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {cells.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-pitch-800 py-1">
            <dt className="text-broadcast-grey">{label}</dt>
            <dd>{typeof value === 'number' ? <NumberTabular value={value} /> : value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm">
        <span className="text-broadcast-grey">Palmarès de la saison : </span>
        {honours.length > 0 ? honours.join(', ') : 'rien cette année.'}
      </p>
      {record.narrativeSummary && <p className="mt-2 text-sm italic text-broadcast-grey">{record.narrativeSummary}</p>}
    </Panel>
  );
}
