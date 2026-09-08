import type { CareerState } from '../../engine/types';
import { careerSummary } from '../../engine/career/retirement';
import { formatEuros, humanize } from '../lib/labels';
import Panel from './Panel';
import SectionTitle from './SectionTitle';
import NumberTabular from './NumberTabular';

/** Bilan de carrière (§13, Phase 6) : chiffres figés par le moteur, verdict déterministe. */
export default function CareerSummaryPanel({ career }: { career: CareerState }) {
  const s = careerSummary(career);
  const p = career.player;
  const cells: [string, string | number][] = [
    ['Saisons', s.seasons],
    ['Clubs', s.clubs.length],
    ['Matchs', s.matches],
    ['Buts', s.goals],
    ['Passes décisives', s.assists],
    ['Sélections', s.nationalCaps],
    ['Meilleure note globale', s.peakOverall],
    ['Valeur maximale', formatEuros(s.peakValue)],
    ['Déclarations retenues', s.quotes],
  ];
  return (
    <Panel accent>
      <SectionTitle>{career.retired ? 'Fin de carrière' : 'Bilan à ce jour'}</SectionTitle>
      <p className="font-display uppercase tracking-wide text-lg">
        {p.identity.firstName} {p.identity.lastName}
        <span className="ml-2 text-sm text-muted">{s.clubs.join(' · ')}</span>
      </p>
      <p className="mt-1 text-sm italic text-accent">{s.verdict}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {cells.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-white/[0.05] py-1">
            <dt className="text-muted">{label}</dt>
            <dd>{typeof value === 'number' ? <NumberTabular value={value} /> : value}</dd>
          </div>
        ))}
      </dl>
      {(s.trophies.length > 0 || s.awards.length > 0) && (
        <p className="mt-3 text-sm">
          <span className="text-muted">Palmarès : </span>
          {[...s.trophies.map((t) => humanize(t)), ...s.awards.map((a) => `${humanize(a.kind)}${a.rank ? ` (${a.rank}e)` : ''}`)].join(', ')}
        </p>
      )}
      {s.traits.length > 0 && (
        <p className="mt-1 text-sm">
          <span className="text-muted">Traits : </span>
          {s.traits.join(', ')}
        </p>
      )}
    </Panel>
  );
}
