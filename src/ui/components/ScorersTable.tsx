import type { Club, Id } from '../../engine/types';
import type { ScorerRow } from '../../engine/season/table';
import NumberTabular from './NumberTabular';

interface ScorersTableProps {
  rows: ScorerRow[];
  clubs: Record<Id, Club>;
  nameOf(id: Id): string;
  playerId: Id;
  metric: 'goals' | 'assists';
}

/** Buteurs ou passeurs (§13), la ligne du joueur incarné surlignée si présente. */
export default function ScorersTable({ rows, clubs, nameOf, playerId, metric }: ScorersTableProps) {
  if (rows.length === 0) return <p className="text-sm text-muted">Personne n'a encore marqué.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-white/[0.08]">
          <th className="py-1 pr-2">#</th>
          <th className="py-1 pr-2">Joueur</th>
          <th className="py-1 pr-2">Club</th>
          <th className="py-1 px-1 text-right">{metric === 'goals' ? 'Buts' : 'Passes'}</th>
          <th className="py-1 px-1 text-right">Matchs</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.playerId}
            className={`border-b border-white/[0.05] ${r.playerId === playerId ? 'bg-accent/10 text-accent' : ''}`}
          >
            <td className="py-1 pr-2 tabular-nums">{i + 1}</td>
            <td className="py-1 pr-2">{nameOf(r.playerId)}</td>
            <td className="py-1 pr-2 text-muted">{clubs[r.clubId]?.shortName ?? r.clubId}</td>
            <td className="py-1 px-1 text-right font-semibold"><NumberTabular value={metric === 'goals' ? r.goals : r.assists} /></td>
            <td className="py-1 px-1 text-right"><NumberTabular value={r.matches} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
